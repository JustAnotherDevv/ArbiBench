import fs from "fs";
import os from "os";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { App } from "../../../shared/schema.js";

const execAsync = promisify(exec);

const RUST_TOOLCHAIN = `[toolchain]
channel = "1.80.0"
components = ["rust-src"]
targets = ["wasm32-unknown-unknown"]
`;

export async function deployContract(
  app: App,
): Promise<{ address: string; txHash: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbibench-"));

  try {
    // Create project structure
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "Cargo.toml"), app.cargoToml);
    fs.writeFileSync(
      path.join(tmpDir, "rust-toolchain.toml"),
      RUST_TOOLCHAIN,
    );
    fs.writeFileSync(path.join(tmpDir, "src", "lib.rs"), app.contractCode);

    const rpc =
      process.env.ARBITRUM_SEPOLIA_RPC ||
      "https://sepolia-rollup.arbitrum.io/rpc";
    const privateKey = process.env.AGENT_PRIVATE_KEY;

    if (!privateKey) throw new Error("AGENT_PRIVATE_KEY not set");

    // Check contract validity
    console.log("Checking contract...");
    await execAsync(`cargo stylus check --endpoint "${rpc}"`, {
      cwd: tmpDir,
      timeout: 180_000,
    });

    // Deploy
    console.log("Deploying contract...");
    const { stdout, stderr } = await execAsync(
      `cargo stylus deploy --private-key "${privateKey}" --endpoint "${rpc}"`,
      {
        cwd: tmpDir,
        timeout: 300_000,
      },
    );

    const output = stdout + "\n" + stderr;

    // Parse contract address from output
    const addressMatch = output.match(
      /(?:deployed|contract|address)[:\s]+?(0x[a-fA-F0-9]{40})/i,
    );
    const txMatch = output.match(/(?:tx|transaction|hash)[:\s]+?(0x[a-fA-F0-9]{64})/i);

    const address = addressMatch?.[1];
    const txHash = txMatch?.[1] || "unknown";

    if (!address) {
      console.log("Deploy output:", output);
      throw new Error("Could not parse contract address from deploy output");
    }

    return { address, txHash };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
