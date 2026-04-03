import fs from "fs";
import os from "os";
import path from "path";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import type { App } from "../../../shared/schema.js";
import { fixContractCode } from "./llm.js";

const execAsync = promisify(exec);

const MAX_FIX_ATTEMPTS = 3;

const RUST_TOOLCHAIN = `[toolchain]
channel = "1.87.0"
components = ["rust-src"]
targets = ["wasm32-unknown-unknown"]
`;

const DEPLOYER_ADDRESS = "0xcEcba2F1DC234f70Dd89F2041029807F8D03A990";

function makeWorkspaceStylusToml(rpc: string): string {
  return `[workspace.networks.sepolia]
endpoint = "${rpc}"
`;
}

function makeContractStylusToml(): string {
  return `[contract.deployments.sepolia]
network = "sepolia"
no_activate = false
deployer_address = "${DEPLOYER_ADDRESS}"
`;
}

export function sanitizeCargoToml(raw: string): string {
  return (
    raw
      .replace(/stylus-sdk\s*=\s*"[^"]*"/g, 'stylus-sdk = "0.10.2"')
      .replace(/\[profile\.release\][\s\S]*?(?=\n\[|$)/g, "")
      .replace(/\[dev-dependencies\][\s\S]*?(?=\n\[|$)/g, "")
      .trim() + "\n"
  );
}

export function sanitizeContractCode(code: string): string {
  return code
    // Strip `public` keyword from sol_storage! fields — invalid in SDK 0.10.2
    // Handles both: "public uint256 foo;" and "uint256 public foo;" patterns
    .replace(/\bpublic\s+(uint|int|address|bool|bytes32?|string|mapping)/g, "$1")
    .replace(/(uint\d*|int\d*|address|bool|bytes32?)\s+public\s+(\w)/g, "$1 $2")
    .replace(/mapping\(([^)]+)\)\s+public\s+(\w)/g, "mapping($1) $2")
    // Replace `string` type in sol_storage! with bytes32 (StorageString has no get/set)
    .replace(/\bstring\s+(?:public\s+)?(\w+)\s*;/g, "bytes32 $1;")
    // Strip free module imports
    .replace(/,\s*msg\b/g, "")
    .replace(/,\s*block\b/g, "")
    .replace(/,\s*contract\b/g, "")
    .replace(/\buse stylus_sdk::call;\s*\n?/g, "")
    .replace(
      /unsafe\s*\{\s*call::transfer_eth\(([^,]+),\s*([^)]+)\)\s*(\?)?\s*\}/g,
      "stylus_sdk::call::transfer::transfer_eth(&self.__stylus_host, $1, $2)$3",
    )
    .replace(
      /(?<!stylus_sdk::)\bcall::transfer_eth\(([^,]+),\s*([^)]+)\)/g,
      "stylus_sdk::call::transfer::transfer_eth(&self.__stylus_host, $1, $2)",
    )
    .replace(/\bmsg::sender\(\)/g, "self.__stylus_host.msg_sender()")
    .replace(/\bmsg::value\(\)/g, "self.__stylus_host.msg_value()")
    .replace(/\bblock::timestamp\(\)/g, "self.__stylus_host.block_timestamp()")
    .replace(
      /\bcontract::address\(\)/g,
      "self.__stylus_host.contract_address()",
    )
    .replace(
      /\bcontract::balance\(\)/g,
      "self.__stylus_host.balance(self.__stylus_host.contract_address())",
    )
    .replace(/\bself\.msg_sender\(\)/g, "self.__stylus_host.msg_sender()")
    .replace(/\bself\.msg_value\(\)/g, "self.__stylus_host.msg_value()")
    .replace(
      /\bself\.block_timestamp\(\)/g,
      "self.__stylus_host.block_timestamp()",
    )
    .replace(
      /\bself\.contract_address\(\)/g,
      "self.__stylus_host.contract_address()",
    )
    .replace(
      /\bself\.balance\((?!self\.__stylus_host)/g,
      "self.__stylus_host.balance(",
    )
    .replace(
      /self\.(\w+)\.setter\((\w+)\)\.set\(self\.\1\.get\(\2\)\s*\+\s*(\w+)\)/g,
      "{ let prev = self.$1.get($2); self.$1.setter($2).set(prev + $3) }",
    )
    // Fix mapping.insert() → mapping.setter().set()
    .replace(
      /self\.(\w+)\.insert\(([^,]+),\s*([^)]+)\)/g,
      "self.$1.setter($2).set($3)",
    )
    // Remove functions returning String (not reliable in no_std WASM context)
    // Replace with bytes32/Vec<u8> equivalent
    .replace(/pub fn \w+\([^)]*\)\s*->\s*Result<String,\s*Vec<u8>>\s*\{[^}]*\}/gs, "")
    // Fix Solidity types used as Rust types in fn signatures/bodies (outside sol_storage!)
    // These replacements are safe because inside sol_storage! they don't appear in these patterns
    .replace(/:\s*uint256\b/g, ": U256")
    .replace(/:\s*uint128\b/g, ": u128")
    .replace(/:\s*uint64\b/g, ": u64")
    .replace(/:\s*uint32\b/g, ": u32")
    .replace(/:\s*uint8\b/g, ": u8")
    .replace(/:\s*int256\b/g, ": i256")
    .replace(/\bResult<uint256,/g, "Result<U256,")
    .replace(/\bResult<address,/g, "Result<Address,")
    .replace(/\bResult<bool,/g, "Result<bool,")
    // Fix Vec<uint256> etc in return types
    .replace(/Vec<uint256>/g, "Vec<U256>")
    .replace(/Option<uint256>/g, "Option<U256>")
    .replace(/Option<address>/g, "Option<Address>");
}

export function extractErrors(stderr: string): string {
  const lines = stderr.split("\n");
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (
      (l.match(/^error/) || l.includes(": error[") || (l.includes("error") && !l.includes("Compiling") && !l.includes("Downloading"))) &&
      !l.includes("Compiling") &&
      !l.includes("Downloading")
    ) {
      result.push(l);
      // Include next 4 lines for source context (--> file:line, | source, ^ pointer)
      for (let j = 1; j <= 4; j++) {
        if (i + j < lines.length && lines[i + j].trim()) result.push(lines[i + j]);
      }
    }
  }
  return result.join("\n").slice(0, 8000);
}

export function writeProjectFiles(
  tmpDir: string,
  contractDir: string,
  cargoToml: string,
  contractCode: string,
  rpc: string,
) {
  fs.mkdirSync(path.join(contractDir, "src"), { recursive: true });

  fs.writeFileSync(
    path.join(tmpDir, "Cargo.toml"),
    `[workspace]\nmembers = ["contract"]\nresolver = "2"\n\n[profile.release]\ncodegen-units = 1\nstrip = true\nlto = true\npanic = "abort"\nopt-level = "s"\n`,
  );
  fs.writeFileSync(
    path.join(tmpDir, "Stylus.toml"),
    makeWorkspaceStylusToml(rpc),
  );
  fs.writeFileSync(path.join(tmpDir, "rust-toolchain.toml"), RUST_TOOLCHAIN);

  const nameMatch = cargoToml.match(/name\s*=\s*"([^"]+)"/);
  const pkgName = nameMatch?.[1] || "contract";
  let finalCargo = cargoToml;
  if (!finalCargo.includes("[[bin]]")) {
    finalCargo += `\n[[bin]]\nname = "${pkgName}"\npath = "src/main.rs"\n`;
  }

  fs.writeFileSync(path.join(contractDir, "Cargo.toml"), finalCargo);
  fs.writeFileSync(
    path.join(contractDir, "Stylus.toml"),
    makeContractStylusToml(),
  );
  fs.writeFileSync(
    path.join(contractDir, "rust-toolchain.toml"),
    RUST_TOOLCHAIN,
  );
  fs.writeFileSync(path.join(contractDir, "src", "lib.rs"), contractCode);
  fs.writeFileSync(
    path.join(contractDir, "src", "main.rs"),
    "fn main() {}\n",
  );
}

/** Run cargo stylus check, streaming output lines to onLog callback. */
export function checkContractSpawn(
  contractDir: string,
  rpc: string,
  onLog: (line: string) => void,
): Promise<{ success: true } | { success: false; errors: string }> {
  return new Promise((resolve) => {
    const proc = spawn("cargo", ["stylus", "check", "--endpoint", rpc], {
      cwd: contractDir,
      env: { ...process.env, RUST_BACKTRACE: "1" },
    });

    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      for (const line of text.split("\n")) {
        if (line.trim()) onLog(line);
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      for (const line of text.split("\n")) {
        if (line.trim()) onLog(line);
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, errors: extractErrors(stderr) });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, errors: err.message });
    });
  });
}

export async function deployContract(
  app: App,
  onLog?: (line: string) => void,
): Promise<{ address: string; txHash: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbibench-"));
  const contractDir = path.join(tmpDir, "contract");

  const log = onLog ?? ((l: string) => console.log(l));

  try {
    const rpc =
      process.env.ARBITRUM_SEPOLIA_RPC ||
      "https://sepolia-rollup.arbitrum.io/rpc";
    const privateKey = process.env.AGENT_PRIVATE_KEY;
    if (!privateKey) throw new Error("AGENT_PRIVATE_KEY not set");

    // ── Fix 1: Derive actual deployer address and pre-flight balance check ──────
    let deployerAddress: string;
    try {
      const { stdout } = await execAsync(
        `cast wallet address --private-key "${privateKey}"`,
        { timeout: 10_000 },
      );
      deployerAddress = stdout.trim();
    } catch {
      deployerAddress = "(unknown)";
    }

    try {
      const { stdout } = await execAsync(
        `cast balance "${deployerAddress}" --rpc-url "${rpc}"`,
        { timeout: 15_000 },
      );
      const balanceWei = BigInt(stdout.trim());
      const MIN_BALANCE = BigInt("5000000000000000"); // 0.005 ETH
      const balanceEth = (Number(balanceWei) / 1e18).toFixed(6);
      if (balanceWei < MIN_BALANCE) {
        throw new Error(
          `Deployer wallet ${deployerAddress} has insufficient ETH (${balanceEth} ETH). ` +
          `Top up to at least 0.05 ETH on Arbitrum Sepolia and try again.`,
        );
      }
      log(`Deployer ${deployerAddress} balance: ${balanceEth} ETH ✓`);
    } catch (err) {
      if (err instanceof Error && err.message.includes("insufficient ETH")) throw err;
      log(`(balance check failed — continuing) ${err instanceof Error ? err.message : String(err)}`);
    }
    // ────────────────────────────────────────────────────────────────────────────

    let cargoToml = sanitizeCargoToml(app.cargoToml);
    let contractCode = sanitizeContractCode(app.contractCode);
    const fixHistory: Array<{ attempt: number; errors: string }> = [];

    for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      writeProjectFiles(tmpDir, contractDir, cargoToml, contractCode, rpc);

      log(`[attempt ${attempt}] Generating lockfile...`);
      try {
        await execAsync("cargo generate-lockfile", {
          cwd: tmpDir,
          timeout: 120_000,
        });
      } catch {
        // lockfile might already exist
      }

      log(`[attempt ${attempt}] Checking contract...`);
      const result = await checkContractSpawn(contractDir, rpc, log);

      if (result.success) {
        log(`[attempt ${attempt}] Check passed!`);
        break;
      }

      if (attempt >= MAX_FIX_ATTEMPTS) {
        throw new Error(
          `Contract failed to compile after ${MAX_FIX_ATTEMPTS} fix attempts:\n${result.errors}`,
        );
      }

      log(
        `[attempt ${attempt}] Build failed, asking LLM to fix (attempt ${attempt + 1}/${MAX_FIX_ATTEMPTS})...`,
      );

      fixHistory.push({ attempt, errors: result.errors });
      const fixed = await fixContractCode(
        contractCode,
        cargoToml,
        result.errors,
        fixHistory.slice(0, -1),
      );
      contractCode = sanitizeContractCode(fixed.contractCode);
      cargoToml = sanitizeCargoToml(fixed.cargoToml);

      try {
        fs.rmSync(path.join(tmpDir, "target"), { recursive: true, force: true });
        fs.rmSync(path.join(tmpDir, "Cargo.lock"), { force: true });
      } catch {
        // ignore
      }
    }

    // ── Fix 2: Deploy with smarter error handling ────────────────────────────────
    log("Deploying contract...");
    let deployOutput = "";
    let deployExitedOk = false;
    try {
      const { stdout, stderr } = await execAsync(
        `cargo stylus deploy --no-verify --private-key "${privateKey}" --endpoint "${rpc}"`,
        {
          cwd: contractDir,
          timeout: 300_000,
          env: { ...process.env, RUST_BACKTRACE: "1" },
        },
      );
      deployOutput = stdout + "\n" + stderr;
      deployExitedOk = true; // Exit code 0 = deploy + activate fully succeeded
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      deployOutput = (e.stdout ?? "") + "\n" + (e.stderr ?? "");
      // Only continue if an address appears — deploy TX mined but activation may have failed
      const hasAddr = /(?:deployed|contract|address|program)[:\s=]+?0x[a-fA-F0-9]{40}/i.test(deployOutput);
      if (!hasAddr) {
        for (const line of deployOutput.split("\n")) { if (line.trim()) log(line); }
        throw new Error(
          `Deploy failed (no contract address found):\n${deployOutput.slice(0, 2000)}`,
        );
      }
    }
    // ────────────────────────────────────────────────────────────────────────────

    for (const line of deployOutput.split("\n")) {
      if (line.trim()) log(line);
    }

    const addressMatch = deployOutput.match(
      /(?:deployed|contract|address|program)[:\s=]+?(0x[a-fA-F0-9]{40})/i,
    );
    const txMatch = deployOutput.match(
      /(?:tx|transaction|hash)[:\s=]+?(0x[a-fA-F0-9]{64})/i,
    );

    const address = addressMatch?.[1];
    const txHash = txMatch?.[1] || "unknown";

    if (!address) {
      throw new Error(
        "Could not parse contract address from deploy output:\n" +
          deployOutput.slice(0, 1000),
      );
    }

    // ── Fix 3: Activation with retry + increasing gas bumps ───────────────────
    // Only trust "activation" from deploy output if it exited with code 0
    // (deploy failed = "Activating..." might appear but activation also failed)
    const activationConfirmed = deployExitedOk && /activat/i.test(deployOutput);
    if (!activationConfirmed) {
      log(`Activation not detected — activating ${address} explicitly...`);
      const bumps = [20, 60, 120];
      let activated = false;
      for (const bump of bumps) {
        log(`Activating contract (data-fee-bump ${bump}%)...`);
        try {
          const { stdout: aOut, stderr: aErr } = await execAsync(
            `cargo stylus activate --address "${address}" --private-key "${privateKey}" --endpoint "${rpc}" --data-fee-bump-percent ${bump}`,
            { cwd: contractDir, timeout: 180_000, env: { ...process.env } },
          );
          const actOutput = aOut + "\n" + aErr;
          for (const line of actOutput.split("\n")) { if (line.trim()) log(line); }
          activated = true;
          log("Contract activated successfully.");
          break;
        } catch (err: unknown) {
          const e = err as { stdout?: string; stderr?: string; message?: string };
          const actOutput = (e.stdout ?? "") + "\n" + (e.stderr ?? "") + (e.message ?? "");
          // ProgramUpToDate = already activated = success
          if (actOutput.includes("ProgramUpToDate") || actOutput.includes("already activated")) {
            activated = true;
            log("Contract was already activated ✓");
            break;
          }
          for (const line of actOutput.split("\n")) { if (line.trim()) log(`(activate) ${line}`); }
          if (bump === 120) {
            throw new Error(
              `Contract deployed at ${address} but activation failed after 3 attempts. ` +
              `Deployer wallet ${deployerAddress} needs more ETH on Arbitrum Sepolia.`,
            );
          }
          log(`Activation with bump ${bump}% failed, retrying with higher gas...`);
        }
      }
      if (!activated) {
        throw new Error(`Activation loop exited without success for ${address}`);
      }
    } else {
      log("Contract activated successfully.");
    }
    // ────────────────────────────────────────────────────────────────────────────

    // ── Fix 4: Post-activation verification via ArbWasm precompile ───────────
    // ArbWasm at 0x71: programVersion(address) returns >0 if activated, reverts with
    // ProgramNotActivated() if not. This is the definitive activation check.
    const ARBWASM = "0x0000000000000000000000000000000000000071";
    log(`Verifying activation status for ${address}...`);
    let verified = false;
    for (let vAttempt = 0; vAttempt < 4; vAttempt++) {
      if (vAttempt > 0) {
        await new Promise((r) => setTimeout(r, 4000));
        log(`Verification attempt ${vAttempt + 1}...`);
      }
      try {
        const { stdout: vOut } = await execAsync(
          `cast call --rpc-url "${rpc}" "${ARBWASM}" "programVersion(address)(uint16)" "${address}"`,
          { timeout: 15_000 },
        );
        const version = parseInt(vOut.trim(), 10);
        if (version > 0) {
          verified = true;
          log(`Contract activation verified ✓ (ArbWasm version ${version})`);
          break;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes("ProgramNotActivated")) {
          // Confirmed not activated — wait and retry
          log(`Contract not yet activated (attempt ${vAttempt + 1}/4), waiting...`);
        } else {
          // Unknown error — might be RPC issue, give benefit of doubt
          log(`Verification check error: ${errMsg.slice(0, 100)}`);
        }
      }
    }
    if (!verified) {
      throw new Error(
        `Contract at ${address} is not activated after all attempts. ` +
        `Deployer wallet ${deployerAddress} may need more ETH on Arbitrum Sepolia.`,
      );
    }
    // ────────────────────────────────────────────────────────────────────────────

    return { address, txHash };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
