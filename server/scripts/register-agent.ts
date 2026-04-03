import "dotenv/config";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;

async function main() {
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) {
    console.error("Set AGENT_PRIVATE_KEY in .env");
    process.exit(1);
  }

  const account = privateKeyToAccount(key as `0x${string}`);
  const rpc = process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";

  const walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(rpc),
  });

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpc),
  });

  console.log(`Agent address: ${account.address}`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${balance} wei`);

  if (balance === 0n) {
    console.error("No balance! Fund your wallet first.");
    process.exit(1);
  }

  // Try different registration ABI patterns
  const attempts = [
    {
      name: "register(string,string)",
      abi: parseAbi([
        "function register(string name, string description) external",
      ]),
      args: ["ArbitrumBench", "No-code AI-powered Arbitrum dApp builder"],
      fn: "register",
    },
    {
      name: "register(string)",
      abi: parseAbi(["function register(string name) external"]),
      args: ["ArbitrumBench"],
      fn: "register",
    },
    {
      name: "registerAgent(string,string)",
      abi: parseAbi([
        "function registerAgent(string name, string description) external",
      ]),
      args: ["ArbitrumBench", "No-code AI-powered Arbitrum dApp builder"],
      fn: "registerAgent",
    },
    {
      name: "register()",
      abi: parseAbi(["function register() external"]),
      args: [],
      fn: "register",
    },
  ];

  for (const attempt of attempts) {
    try {
      console.log(`\nTrying: ${attempt.name}...`);

      const data = encodeFunctionData({
        abi: attempt.abi,
        functionName: attempt.fn as never,
        args: attempt.args as never,
      });

      // Simulate first
      await publicClient.call({
        account: account.address,
        to: REGISTRY,
        data,
      });

      // If simulation succeeds, send the real transaction
      const hash = await walletClient.sendTransaction({
        to: REGISTRY,
        data,
      });

      console.log(`Registration TX sent: ${hash}`);
      console.log(`View: https://sepolia.arbiscan.io/tx/${hash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(
        `Status: ${receipt.status === "success" ? "SUCCESS" : "FAILED"}`,
      );
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  Failed: ${msg.slice(0, 100)}`);
    }
  }

  console.error(
    "\nAll registration patterns failed. Check the registry contract ABI.",
  );
  console.log(
    "You may need to check https://sepolia.arbiscan.io/address/" + REGISTRY,
  );
}

main().catch(console.error);
