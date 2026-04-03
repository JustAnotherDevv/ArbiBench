import { createContext, useCallback, useContext, useMemo } from "react";
import { useWriteContract, useSwitchChain, useChainId } from "wagmi";
import { arbitrumSepolia } from "viem/chains";
import { parseEther } from "viem";
import { createBurnerWalletClient } from "@/lib/burnerWallet";
import type { AbiItem } from "@/types/schema";

interface SendContractTxParams {
  address: `0x${string}`;
  abi: AbiItem[];
  functionName: string;
  args: unknown[];
  value?: bigint;
}

interface WalletContextValue {
  isBurner: boolean;
  sendContractTx: (params: SendContractTxParams) => Promise<`0x${string}`>;
  ensureCorrectChain: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue>({
  isBurner: false,
  sendContractTx: async () => { throw new Error("WalletProvider not mounted"); },
  ensureCorrectChain: async () => {},
});

export function WalletProvider({
  isBurner,
  children,
}: {
  isBurner: boolean;
  children: React.ReactNode;
}) {
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const chainId = useChainId();

  const ensureCorrectChain = useCallback(async () => {
    if (!isBurner && chainId !== arbitrumSepolia.id) {
      await switchChainAsync({ chainId: arbitrumSepolia.id });
    }
  }, [isBurner, chainId, switchChainAsync]);

  const sendContractTx = useCallback(async (params: SendContractTxParams) => {
    if (isBurner) {
      const client = createBurnerWalletClient();
      return client.writeContract({
        address: params.address,
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
        chain: arbitrumSepolia,
        ...(params.value !== undefined ? { value: params.value } : {}),
      });
    }
    // MetaMask path
    await ensureCorrectChain();
    return writeContractAsync({
      address: params.address,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
      chainId: arbitrumSepolia.id,
      ...(params.value !== undefined ? { value: params.value } : {}),
    });
  }, [isBurner, writeContractAsync, ensureCorrectChain]);

  const value = useMemo(
    () => ({ isBurner, sendContractTx, ensureCorrectChain }),
    [isBurner, sendContractTx, ensureCorrectChain],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  return useContext(WalletContext);
}

/** Convenience: parse ETH string to bigint, return undefined for empty/zero */
export function parsePayableValue(ethStr: string | undefined): bigint | undefined {
  if (!ethStr || ethStr === "0" || ethStr === "") return undefined;
  try { return parseEther(ethStr); } catch { return undefined; }
}
