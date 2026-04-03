import type { AbiItem } from "../../../shared/schema.js";

interface AbiParam {
  name: string;
  type: string;
}

const RUST_TO_ABI: Record<string, string> = {
  Address: "address",
  U256: "uint256",
  U128: "uint128",
  U64: "uint64",
  U32: "uint32",
  U8: "uint8",
  I256: "int256",
  bool: "bool",
  u128: "uint128",
  u64: "uint64",
  u32: "uint32",
  u8: "uint8",
  i128: "int128",
  i64: "int64",
  B256: "bytes32",
  B160: "bytes20",
  B128: "bytes16",
  B64: "bytes8",
  B32: "bytes4",
};

function rustTypeToAbi(rustType: string): string {
  const t = rustType.trim();
  return RUST_TO_ABI[t] ?? "bytes32";
}

/** Stylus SDK 0.10.x converts Rust snake_case fn names to camelCase in the ABI. */
export function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Normalize all function names in an ABI to camelCase.
 * Apply to any ABI from external sources (LLM output, stored DB values)
 * before using it for contract calls — Stylus SDK always exports camelCase selectors.
 */
export function normalizeAbi(abi: AbiItem[]): AbiItem[] {
  return abi.map((item) => ({
    ...item,
    name: item.type === "function" ? snakeToCamel(item.name) : item.name,
  }));
}

function parseParams(paramsStr: string): AbiParam[] {
  if (!paramsStr.trim()) return [];
  return paramsStr
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const parts = p.split(":").map((s) => s.trim());
      const name = parts[0].replace(/^mut\s+/, "");
      const type = rustTypeToAbi(parts[1] ?? "");
      return { name, type };
    });
}

function parseReturnType(returnStr: string): AbiParam[] {
  // Result<(), Vec<u8>> → no outputs
  // Result<U256, Vec<u8>> → [{name:"",type:"uint256"}]
  // Result<(U256, Address), Vec<u8>> → multiple outputs
  const inner = returnStr.match(/Result<([^,>]+(?:<[^>]+>)?)/)?.[1]?.trim();
  if (!inner || inner === "()" || inner === "Vec<u8>") return [];

  if (inner.startsWith("(") && inner.endsWith(")")) {
    return inner
      .slice(1, -1)
      .split(",")
      .map((t) => ({ name: "", type: rustTypeToAbi(t.trim()) }));
  }
  return [{ name: "", type: rustTypeToAbi(inner) }];
}

/**
 * Parse a minimal ABI from Rust Stylus contract source.
 * Used as a fallback when the LLM's ABI section is missing or invalid.
 */
export function parseAbiFromRust(code: string): AbiItem[] {
  const abi: AbiItem[] = [];

  // Find all #[public] impl blocks
  const publicImplRe = /#\[public\]\s*impl\s+\w+\s*\{/g;
  let m: RegExpExecArray | null;

  while ((m = publicImplRe.exec(code)) !== null) {
    // Extract body up to the matching closing brace
    let depth = 1;
    let i = m.index + m[0].length;
    let body = "";
    while (i < code.length && depth > 0) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}") depth--;
      if (depth > 0) body += code[i];
      i++;
    }

    // Strip single-line comments so #[payable] isn't separated from pub fn by comment lines
    const cleanBody = body.replace(/\/\/[^\n]*/g, "");

    const fnRe =
      /(#\[payable\]\s*)?pub\s+fn\s+(\w+)\s*\(\s*&\s*(mut\s+)?self(?:,\s*([^)]*))?\s*\)\s*(?:->\s*(Result<[^{]+?))?\s*\{/g;
    let fn_m: RegExpExecArray | null;

    while ((fn_m = fnRe.exec(cleanBody)) !== null) {
      const payable = !!fn_m[1];
      const name = snakeToCamel(fn_m[2]);
      const mutable = !!fn_m[3];
      const paramsStr = fn_m[4] ?? "";
      const returnStr = fn_m[5] ?? "";

      const stateMutability: AbiItem["stateMutability"] = payable
        ? "payable"
        : !mutable
          ? "view"
          : "nonpayable";

      abi.push({
        type: "function",
        name,
        inputs: parseParams(paramsStr),
        outputs: parseReturnType(returnStr),
        stateMutability,
      });
    }
  }

  return abi;
}
