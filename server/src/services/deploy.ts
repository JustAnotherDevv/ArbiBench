import fs from "fs";
import os from "os";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { App } from "../../../shared/schema.js";

const execAsync = promisify(exec);

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

export async function deployContract(
  app: App,
): Promise<{ address: string; txHash: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbibench-"));
  const contractDir = path.join(tmpDir, "contract");

  try {
    fs.mkdirSync(path.join(contractDir, "src"), { recursive: true });

    const rpc =
      process.env.ARBITRUM_SEPOLIA_RPC ||
      "https://sepolia-rollup.arbitrum.io/rpc";
    const privateKey = process.env.AGENT_PRIVATE_KEY;

    if (!privateKey) throw new Error("AGENT_PRIVATE_KEY not set");

    // Root workspace files
    fs.writeFileSync(
      path.join(tmpDir, "Cargo.toml"),
      `[workspace]\nmembers = ["contract"]\nresolver = "2"\n\n[profile.release]\ncodegen-units = 1\nstrip = true\nlto = true\npanic = "abort"\nopt-level = "s"\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "Stylus.toml"),
      makeWorkspaceStylusToml(rpc),
    );
    fs.writeFileSync(path.join(tmpDir, "rust-toolchain.toml"), RUST_TOOLCHAIN);

    // Sanitize cargoToml: force correct stylus-sdk version, strip profile/dev-deps
    let cargoToml = app.cargoToml
      .replace(/stylus-sdk\s*=\s*"[^"]*"/g, 'stylus-sdk = "0.10.2"')
      .replace(/\[profile\.release\][\s\S]*?(?=\n\[|$)/g, "")
      .replace(/\[dev-dependencies\][\s\S]*?(?=\n\[|$)/g, "")
      .trim() + "\n";

    // Sanitize contract code: patch SDK 0.6 API to 0.10.2 API
    // In 0.10.2, host methods are on self.__stylus_host, not free functions
    let contractCode = app.contractCode
      // Remove old-style imports (msg, block, contract, call are now on __stylus_host)
      .replace(/,\s*msg\b/g, "")
      .replace(/,\s*block\b/g, "")
      .replace(/,\s*contract\b/g, "")
      .replace(/\buse stylus_sdk::call;\s*\n?/g, "")
      // Fix transfer_eth FIRST (before other replacements to avoid double-matching)
      .replace(/unsafe\s*\{\s*call::transfer_eth\(([^,]+),\s*([^)]+)\)\s*(\?)?\s*\}/g,
        "stylus_sdk::call::transfer::transfer_eth(&self.__stylus_host, $1, $2)$3")
      .replace(/(?<!stylus_sdk::)\bcall::transfer_eth\(([^,]+),\s*([^)]+)\)/g,
        "stylus_sdk::call::transfer::transfer_eth(&self.__stylus_host, $1, $2)")
      // Fix free function calls to __stylus_host method calls
      .replace(/\bmsg::sender\(\)/g, "self.__stylus_host.msg_sender()")
      .replace(/\bmsg::value\(\)/g, "self.__stylus_host.msg_value()")
      .replace(/\bblock::timestamp\(\)/g, "self.__stylus_host.block_timestamp()")
      .replace(/\bcontract::address\(\)/g, "self.__stylus_host.contract_address()")
      .replace(/\bcontract::balance\(\)/g, "self.__stylus_host.balance(self.__stylus_host.contract_address())")
      // Fix self.msg_sender() etc (if LLM generated with 0.10 docs)
      .replace(/\bself\.msg_sender\(\)/g, "self.__stylus_host.msg_sender()")
      .replace(/\bself\.msg_value\(\)/g, "self.__stylus_host.msg_value()")
      .replace(/\bself\.block_timestamp\(\)/g, "self.__stylus_host.block_timestamp()")
      .replace(/\bself\.contract_address\(\)/g, "self.__stylus_host.contract_address()")
      .replace(/\bself\.balance\((?!self\.__stylus_host)/g, "self.__stylus_host.balance(")
      // Fix borrow issue: split mutable + immutable borrow on same field
      // e.g. self.tips.setter(sender).set(self.tips.get(sender) + value)
      // becomes: let prev = self.tips.get(sender); self.tips.setter(sender).set(prev + value);
      .replace(/self\.(\w+)\.setter\((\w+)\)\.set\(self\.\1\.get\(\2\)\s*\+\s*(\w+)\)/g,
        "{ let prev = self.$1.get($2); self.$1.setter($2).set(prev + $3) }");

    // Contract files
    fs.writeFileSync(path.join(contractDir, "Cargo.toml"), cargoToml);
    fs.writeFileSync(
      path.join(contractDir, "Stylus.toml"),
      makeContractStylusToml(),
    );
    fs.writeFileSync(path.join(contractDir, "rust-toolchain.toml"), RUST_TOOLCHAIN);
    fs.writeFileSync(
      path.join(contractDir, "src", "lib.rs"),
      contractCode,
    );
    // main.rs needed for export-abi (cargo stylus deploy does cargo run --features export-abi)
    const nameMatch = cargoToml.match(/name\s*=\s*"([^"]+)"/);
    const pkgName = nameMatch?.[1] || "contract";
    fs.writeFileSync(
      path.join(contractDir, "src", "main.rs"),
      `fn main() {}
`,
    );
    // Ensure Cargo.toml has a [[bin]] section
    if (!cargoToml.includes("[[bin]]")) {
      cargoToml += `\n[[bin]]\nname = "${pkgName}"\npath = "src/main.rs"\n`;
      fs.writeFileSync(path.join(contractDir, "Cargo.toml"), cargoToml);
    }

    // Generate lockfile (cargo stylus check uses --locked)
    console.log("Generating lockfile...");
    await execAsync("cargo generate-lockfile", {
      cwd: tmpDir,
      timeout: 120_000,
      env: { ...process.env },
    });

    // Check contract validity
    console.log("Checking contract...");
    await execAsync(`cargo stylus check --endpoint "${rpc}"`, {
      cwd: contractDir,
      timeout: 180_000,
      env: { ...process.env, RUST_BACKTRACE: "1" },
    });

    // Deploy
    console.log("Deploying contract...");
    const { stdout, stderr } = await execAsync(
      `cargo stylus deploy --no-verify --private-key "${privateKey}" --endpoint "${rpc}" --max-fee-per-gas-gwei 1`,
      {
        cwd: contractDir,
        timeout: 300_000,
        env: { ...process.env, RUST_BACKTRACE: "1" },
      },
    );

    const output = stdout + "\n" + stderr;
    console.log("Deploy output:", output);

    // Parse contract address from output
    const addressMatch = output.match(
      /(?:deployed|contract|address|program)[:\s=]+?(0x[a-fA-F0-9]{40})/i,
    );
    const txMatch = output.match(
      /(?:tx|transaction|hash)[:\s=]+?(0x[a-fA-F0-9]{64})/i,
    );

    const address = addressMatch?.[1];
    const txHash = txMatch?.[1] || "unknown";

    if (!address) {
      throw new Error(
        "Could not parse contract address from deploy output:\n" +
          output.slice(0, 500),
      );
    }

    return { address, txHash };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
