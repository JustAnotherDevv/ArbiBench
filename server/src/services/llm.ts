import OpenAI from "openai";
import { SYSTEM_PROMPT } from "../prompts/system.js";
import type { GenerateResponse } from "../../../shared/schema.js";

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

export async function generateApp(
  description: string,
): Promise<GenerateResponse> {
  const response = await getClient().chat.completions.create({
    model: "google/gemini-2.0-flash-001",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Build an Arbitrum Stylus dApp: ${description}`,
      },
    ],
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from LLM");

  // Extract JSON - handle both raw JSON and markdown-wrapped JSON
  let jsonStr = content.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr) as GenerateResponse;

  if (!parsed.contractCode || !parsed.uiSchema?.layout) {
    throw new Error("Invalid response structure from LLM");
  }

  // Ensure cargoToml exists
  if (!parsed.cargoToml) {
    parsed.cargoToml = `[package]
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
crate-type = ["lib", "cdylib"]

[profile.release]
codegen-units = 1
strip = true
lto = true
panic = "abort"
opt-level = "s"`;
  }

  return parsed;
}
