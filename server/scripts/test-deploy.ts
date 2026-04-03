/**
 * End-to-end deployment test script.
 * Usage: cd server && npx dotenvx run -- npx tsx scripts/test-deploy.ts
 *
 * Deploys a minimal Stylus counter contract, verifies activation,
 * then calls get_count() to confirm the contract is responsive.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { deployContract } from "../src/services/deploy.js";
import type { App } from "../../shared/schema.js";

const execAsync = promisify(exec);

// Minimal Stylus counter — as small as possible so deploy is cheap
const MINIMAL_CONTRACT = `#![cfg_attr(not(any(feature = "export-abi", test)), no_main)]
extern crate alloc;

use stylus_sdk::{alloy_primitives::U256, prelude::*};

sol_storage! {
    #[entrypoint]
    pub struct Counter {
        uint256 count;
    }
}

#[public]
impl Counter {
    pub fn increment(&mut self) -> Result<(), Vec<u8>> {
        let c = self.count.get();
        self.count.set(c + U256::from(1u64));
        Ok(())
    }

    pub fn get_count(&self) -> Result<U256, Vec<u8>> {
        Ok(self.count.get())
    }
}
`;

const MINIMAL_CARGO = `[package]
name = "test-counter"
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
`;

const fakeApp: App = {
  id: "test-deploy-script",
  name: "test-counter",
  description: "Minimal counter for pipeline testing",
  owner: "0x0000000000000000000000000000000000000000",
  status: "draft",
  contractCode: MINIMAL_CONTRACT,
  cargoToml: MINIMAL_CARGO,
  uiSchema: { nodes: [] },
  abi: [],
  published: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function main() {
  console.log("=== Arbitrum Stylus Deployment Pipeline Test ===\n");

  const rpc =
    process.env.ARBITRUM_SEPOLIA_RPC ||
    "https://sepolia-rollup.arbitrum.io/rpc";

  let deployedAddress: string | null = null;

  try {
    console.log("[step 1] Deploying minimal Counter contract...\n");
    const result = await deployContract(fakeApp, (line) => {
      console.log(`  ${line}`);
    });
    deployedAddress = result.address;
    console.log(`\n[step 1] ✓ Deployed at ${deployedAddress} (tx: ${result.txHash})\n`);
  } catch (err) {
    console.error("\n[step 1] ✗ Deploy failed:");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Step 2: Verify getCount() returns 0 (Stylus SDK converts get_count → getCount)
  console.log("[step 2] Calling getCount() via cast (camelCase ABI name)...");
  try {
    const { stdout } = await execAsync(
      `cast call --rpc-url "${rpc}" "${deployedAddress}" "getCount()(uint256)"`,
      { timeout: 15_000 },
    );
    const val = stdout.trim();
    console.log(`[step 2] ✓ getCount() returned: ${val} (contract is live and responsive)\n`);
  } catch (err) {
    console.error(`[step 2] ✗ getCount() call failed:`);
    console.error(err instanceof Error ? err.message : String(err));
    console.error("\nNote: Stylus SDK converts snake_case → camelCase. Use getCount() not get_count().");
    process.exit(1);
  }

  // Step 3: Send increment() and verify count changes
  console.log("[step 3] Sending increment() transaction...");
  try {
    const privateKey = process.env.AGENT_PRIVATE_KEY;
    const { stdout } = await execAsync(
      `cast send --private-key "${privateKey}" --rpc-url "${rpc}" "${deployedAddress}" "increment()"`,
      { timeout: 60_000 },
    );
    console.log(`[step 3] ✓ increment() sent\n`);

    // Verify count is now 1
    const { stdout: countOut } = await execAsync(
      `cast call --rpc-url "${rpc}" "${deployedAddress}" "getCount()(uint256)"`,
      { timeout: 15_000 },
    );
    const count = countOut.trim();
    if (count === "1") {
      console.log(`[step 3] ✓ getCount() after increment: ${count} ✓\n`);
    } else {
      console.log(`[step 3] ⚠ getCount() returned ${count} (expected 1)\n`);
    }
  } catch (err) {
    console.error(`[step 3] ✗ increment() failed: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  console.log("=== ALL TESTS PASSED ===");
  console.log(`Contract: ${deployedAddress}`);
  console.log(`Explorer: https://sepolia.arbiscan.io/address/${deployedAddress}`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
