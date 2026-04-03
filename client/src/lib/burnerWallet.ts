import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { arbitrumSepolia } from "viem/chains";

const PK_KEY = "arbibench-burner-pk";
const WALLET_TYPE_KEY = "arbibench-wallet-type";

export const BURNER_RPC = "https://sepolia-rollup.arbitrum.io/rpc";

export function hasBurnerKey(): boolean {
  return !!localStorage.getItem(PK_KEY);
}

export function getOrCreateBurnerKey(): `0x${string}` {
  let pk = localStorage.getItem(PK_KEY) as `0x${string}` | null;
  if (!pk) {
    pk = generatePrivateKey();
    localStorage.setItem(PK_KEY, pk);
  }
  return pk;
}

export function getBurnerAddress(): `0x${string}` | null {
  const pk = localStorage.getItem(PK_KEY) as `0x${string}` | null;
  if (!pk) return null;
  return privateKeyToAccount(pk).address;
}

export function createBurnerWalletClient() {
  const pk = getOrCreateBurnerKey();
  const account = privateKeyToAccount(pk);
  return createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(BURNER_RPC),
  });
}

export function exportBurnerPrivateKey(): string {
  return localStorage.getItem(PK_KEY) ?? "";
}

/** Disconnect session without deleting the key — user can reconnect later. */
export function clearBurnerSession(): void {
  localStorage.removeItem(WALLET_TYPE_KEY);
}

export function setBurnerActive(): void {
  localStorage.setItem(WALLET_TYPE_KEY, "burner");
}

export function isBurnerActive(): boolean {
  return localStorage.getItem(WALLET_TYPE_KEY) === "burner";
}
