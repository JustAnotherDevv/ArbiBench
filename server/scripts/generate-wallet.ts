import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("=== New Arbitrum Sepolia Agent Wallet ===");
console.log(`Address:     ${account.address}`);
console.log(`Private Key: ${privateKey}`);
console.log("");
console.log("Add to your .env file:");
console.log(`AGENT_PRIVATE_KEY=${privateKey}`);
console.log("");
console.log("Fund this address with testnet ETH from:");
console.log("  https://arbitrum.faucet.dev/");
console.log("  https://faucet.quicknode.com/arbitrum/sepolia");
