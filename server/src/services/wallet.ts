import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

let walletClient: WalletClient | null = null;
let publicClient: PublicClient | null = null;

export function getAccount() {
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key) throw new Error("AGENT_PRIVATE_KEY not set");
  return privateKeyToAccount(key as `0x${string}`);
}

export function getWalletClient(): WalletClient {
  if (!walletClient) {
    const account = getAccount();
    walletClient = createWalletClient({
      account,
      chain: arbitrumSepolia,
      transport: http(process.env.ARBITRUM_SEPOLIA_RPC),
    });
  }
  return walletClient;
}

export function getPublicClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(process.env.ARBITRUM_SEPOLIA_RPC),
    });
  }
  return publicClient;
}

export function getAgentAddress(): string {
  return getAccount().address;
}
