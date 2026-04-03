import OpenAI from "openai";
import { SYSTEM_PROMPT } from "../prompts/system.js";
import type { GenerateResponse, UISchema, UISchemaNode, AbiItem } from "../../../shared/schema.js";
import { parseAbiFromRust, normalizeAbi } from "./parseAbi.js";

const GENERATION_MODEL = "google/gemini-2.5-pro";
const FIX_MODEL = "google/gemini-2.5-pro";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return client;
}

const DEFAULT_CARGO_TOML = `[package]
name = "generated-app"
version = "0.1.0"
edition = "2021"

[dependencies]
stylus-sdk = "0.10.2"
alloy-primitives = "0.7"
alloy-sol-types = "0.7"

[features]
export-abi = ["stylus-sdk/export-abi"]

[lib]
crate-type = ["lib", "cdylib"]`;

const RETRY_HINT = `\n\nIMPORTANT: Your previous response had a JSON formatting error. The <<<UI_SCHEMA>>> and <<<ABI>>> sections MUST be valid JSON. Common mistakes to avoid:
- Do NOT use unescaped double quotes inside string values — use \\" instead
- Do NOT add comments (// or /* */) inside JSON
- Do NOT add trailing commas after the last item in an object or array
- Ensure every opening { has a matching closing }
- Keep the UI_SCHEMA on a single line or properly formatted JSON — no raw newlines inside string values`;

/** Extract content between <<<TAG>>> and <<<END_TAG>>> delimiters. */
function extractDelimited(content: string, tag: string): string | null {
  const open = `<<<${tag}>>>`;
  const close = `<<<END_${tag}>>>`;
  const start = content.indexOf(open);
  const end = content.indexOf(close);
  if (start === -1 || end === -1 || end <= start) return null;
  return content.slice(start + open.length, end).trim();
}

/**
 * Attempt to repair common JSON issues produced by LLMs:
 * - Literal newlines/tabs inside string values
 * - Trailing commas
 * - Unescaped backslashes in strings
 * - Trailing garbage after last } or ]
 */
function repairJson(input: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      // Check if next char is a valid JSON escape character
      const next = input[i + 1];
      const validEscapes = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
      if (next && !validEscapes.has(next)) {
        // Invalid escape — double the backslash
        result += "\\\\";
        continue;
      }
      escaped = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString) {
      // Replace literal control characters with their escape sequences
      if (ch === "\n") { result += "\\n"; continue; }
      if (ch === "\r") { result += "\\r"; continue; }
      if (ch === "\t") { result += "\\t"; continue; }
    }
    result += ch;
  }

  // Remove trailing commas before } or ]
  result = result.replace(/,(\s*[}\]])/g, "$1");

  // Strip trailing garbage after the last } or ] (LLM sometimes appends text)
  const lastClose = Math.max(result.lastIndexOf("}"), result.lastIndexOf("]"));
  if (lastClose !== -1 && lastClose < result.length - 1) {
    result = result.slice(0, lastClose + 1);
  }

  return result;
}

/** Build a fallback UISchema from ABI when we can't parse the LLM's version. */
function fallbackUiSchema(title: string, abi: AbiItem[] = []): UISchema {
  const children: UISchemaNode[] = [
    { type: "heading", content: title, props: { level: 2 } },
  ];

  const fns = abi.filter((f) => f.type === "function");
  for (const fn of fns) {
    const isView = fn.stateMutability === "view" || fn.stateMutability === "pure";
    const cardChildren: UISchemaNode[] = [
      { type: "heading", content: fn.name.replace(/_/g, " "), props: { level: 4 } },
    ];
    for (const inp of fn.inputs) {
      cardChildren.push({
        type: "input",
        name: inp.name,
        props: { placeholder: `${inp.name} (${inp.type})` },
      });
    }
    cardChildren.push({ type: "button", name: fn.name, content: fn.name.replace(/_/g, " ") });
    if (isView) {
      cardChildren.push({ type: "text", name: fn.name });
    }
    children.push({ type: "card", children: cardChildren });
  }

  if (children.length === 1) {
    children.push({ type: "text", content: "Contract deployed. Use the ABI to interact." });
  }

  return { title, description: "", layout: { type: "column", children } };
}

function parseGenerateResponse(content: string): GenerateResponse {
  // Strategy 1: delimiter format (preferred — no JSON escaping issues for code)
  const contractCode = extractDelimited(content, "CONTRACT_CODE");
  const cargoToml = extractDelimited(content, "CARGO_TOML");
  const uiSchemaRaw = extractDelimited(content, "UI_SCHEMA");

  if (contractCode && uiSchemaRaw) {
    // Parse ABI first so fallback can use it
    let abi: AbiItem[] = [];
    const abiRaw = extractDelimited(content, "ABI");
    if (abiRaw) {
      try { abi = JSON.parse(abiRaw); } catch {
        try { abi = JSON.parse(repairJson(abiRaw)); } catch { /* ignore bad ABI */ }
      }
    }
    // Fallback: parse ABI directly from the Rust source if LLM's ABI section was empty/invalid
    if (abi.length === 0 && contractCode) {
      abi = parseAbiFromRust(contractCode);
    }
    // Always normalize to camelCase — Stylus SDK 0.10.x exports camelCase selectors
    abi = normalizeAbi(abi);

    let uiSchema: UISchema;
    try {
      uiSchema = JSON.parse(uiSchemaRaw);
    } catch {
      // Try repair before giving up
      try {
        uiSchema = JSON.parse(repairJson(uiSchemaRaw));
      } catch {
        // Use ABI-aware fallback — generates usable button cards for every function
        uiSchema = fallbackUiSchema("Generated App", abi);
      }
    }
    if (!uiSchema?.layout) {
      uiSchema = fallbackUiSchema(uiSchema?.title ?? "Generated App", abi);
    }

    return {
      contractCode,
      cargoToml: cargoToml || DEFAULT_CARGO_TOML,
      uiSchema,
      abi,
    };
  }

  // Strategy 2: JSON fallback (legacy / model that ignores format instructions)
  let jsonStr = content.trim();

  // Strip markdown code fences
  const mdMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) jsonStr = mdMatch[1].trim();

  // Find outermost { ... }
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  let parsed: GenerateResponse;
  try {
    parsed = JSON.parse(jsonStr) as GenerateResponse;
  } catch (err) {
    try {
      const repaired = repairJson(jsonStr);
      parsed = JSON.parse(repaired) as GenerateResponse;
    } catch {
      throw new Error(
        `LLM returned unparseable response. Original error: ${(err as Error).message}. ` +
        `Content preview: ${content.slice(0, 300)}`,
      );
    }
  }

  if (!parsed.contractCode || !parsed.uiSchema?.layout) {
    throw new Error("Invalid response structure from LLM");
  }
  if (!parsed.cargoToml) parsed.cargoToml = DEFAULT_CARGO_TOML;
  return parsed;
}

export async function generateApp(
  description: string,
  retry = false,
): Promise<GenerateResponse> {
  const userContent = `Build an Arbitrum Stylus dApp: ${description}${retry ? RETRY_HINT : ""}`;
  const response = await getClient().chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: retry ? 0.3 : 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from LLM");
  return parseGenerateResponse(content);
}

export async function modifyApp(
  existing: {
    contractCode: string;
    cargoToml: string;
    uiSchema: UISchema;
    abi?: AbiItem[];
  },
  userRequest: string,
  retry = false,
  previousErrors?: string | null,
): Promise<GenerateResponse> {
  const errorSection = previousErrors
    ? `\n\nPREVIOUS COMPILATION ERRORS (MUST FIX THESE):\n\`\`\`\n${previousErrors.slice(0, 2000)}\n\`\`\``
    : "";

  // Normalize to camelCase before sending to LLM — ensures LLM uses camelCase names in UI schema
  const normalizedExistingAbi = existing.abi ? normalizeAbi(existing.abi) : [];
  const abiSection = normalizedExistingAbi.length > 0
    ? `\n\nCurrent ABI (use exact function names when generating UI schema):\n\`\`\`json\n${JSON.stringify(normalizedExistingAbi, null, 2)}\n\`\`\``
    : "";

  // If this looks like a UI-only request (no compilation errors), tell the LLM not to touch contract code
  const uiOnlyHint = !previousErrors && /\b(ui|interface|frontend|layout|design|button|display|show|look|style|schema|visual)\b/i.test(userRequest)
    ? `\n\nIMPORTANT: This is a UI-only change. The CONTRACT_CODE and CARGO_TOML are correct and must NOT be changed at all — return them byte-for-byte as provided. Only update the UI_SCHEMA and ABI sections to improve the interface.`
    : "";

  const response = await getClient().chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Modify this existing Arbitrum Stylus dApp according to the user's request.

User request: ${userRequest}${errorSection}${abiSection}

IMPORTANT: Keep all existing functionality unless explicitly asked to remove it. Only change what the user requested. Preserve existing storage fields, function signatures, and behavior. If there are previous compilation errors, fix ALL of them.

IMPORTANT FOR UI: Use the exact ABI function names when setting button.name, stat.functionName, list.functionName, and text.name fields. They MUST match the ABI exactly.

Current lib.rs:
\`\`\`rust
${existing.contractCode}
\`\`\`

Current Cargo.toml:
\`\`\`toml
${existing.cargoToml}
\`\`\`

Current UI Schema:
\`\`\`json
${JSON.stringify(existing.uiSchema, null, 2)}
\`\`\`

Return the complete updated files using the same delimiter format as always (<<<CONTRACT_CODE>>>, <<<CARGO_TOML>>>, <<<UI_SCHEMA>>>, <<<ABI>>>).${uiOnlyHint}${retry ? RETRY_HINT : ""}`,
      },
    ],
    temperature: retry ? 0.3 : 0.5,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from LLM");
  return parseGenerateResponse(content);
}

const FIX_SYSTEM_SUFFIX = `\n\n## YOUR TASK: Fix ALL compilation errors

Work through EACH error one at a time. Before returning, verify your code passes every item:
✓ No msg::sender() — must be self.__stylus_host.msg_sender()
✓ No msg::value() — must be self.__stylus_host.msg_value()
✓ No block::timestamp() — must be self.__stylus_host.block_timestamp()
✓ No contract::address() — must be self.__stylus_host.contract_address()
✓ No 'string' type in sol_storage! — use bytes32
✓ No StorageVec or StorageString
✓ No 'public' keyword on sol_storage fields
✓ No .checked_add/.checked_sub/.saturating_add — use plain + - * /
✓ Mutable borrow: NEVER self.x.setter(k).set(self.x.get(k) + v) — split into: let prev = self.x.get(k); self.x.setter(k).set(prev + v);
✓ Imports ONLY: use stylus_sdk::{alloy_primitives::{Address, U256}, prelude::*};
✓ Error returns: "msg".as_bytes().to_vec() — NEVER Err("msg") or Err(String::from("msg"))
✓ Return ONLY <<<CONTRACT_CODE>>> and <<<CARGO_TOML>>> delimiters — no UI_SCHEMA or ABI needed`;

export async function fixContractCode(
  code: string,
  cargoToml: string,
  errors: string,
  previousAttempts?: Array<{ attempt: number; errors: string }>,
): Promise<{ contractCode: string; cargoToml: string }> {
  const historySection = previousAttempts?.length
    ? `\n\nPREVIOUS FAILED FIX ATTEMPTS — do NOT repeat these same mistakes:\n` +
      previousAttempts
        .map(a => `--- Attempt ${a.attempt + 1} errors (preview):\n${a.errors.slice(0, 600)}`)
        .join('\n\n')
    : '';

  const attemptLabel = `This is fix attempt ${(previousAttempts?.length ?? 0) + 1} of 3.\n\n`;

  const response = await getClient().chat.completions.create({
    model: FIX_MODEL,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT + FIX_SYSTEM_SUFFIX,
      },
      {
        role: "user",
        content: `${attemptLabel}Fix this contract. Compilation errors:\n\n${errors}\n\nCurrent lib.rs:\n\`\`\`rust\n${code}\n\`\`\`\n\nCurrent Cargo.toml:\n\`\`\`toml\n${cargoToml}\n\`\`\`\n\nReturn fixed code using <<<CONTRACT_CODE>>> and <<<CARGO_TOML>>> delimiters only.${historySection}`,
      },
    ],
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No fix response from LLM");

  const fixedCode = extractDelimited(content, "CONTRACT_CODE");
  const fixedCargo = extractDelimited(content, "CARGO_TOML");
  if (fixedCode) {
    return { contractCode: fixedCode, cargoToml: fixedCargo || cargoToml };
  }

  // Fallback: try JSON
  let jsonStr = content.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return { contractCode: parsed.contractCode || code, cargoToml: parsed.cargoToml || cargoToml };
  } catch {
    try {
      const parsed = JSON.parse(repairJson(jsonStr));
      return { contractCode: parsed.contractCode || code, cargoToml: parsed.cargoToml || cargoToml };
    } catch {
      return { contractCode: code, cargoToml };
    }
  }
}
