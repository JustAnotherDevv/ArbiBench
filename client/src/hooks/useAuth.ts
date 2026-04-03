import { useState, useEffect, useCallback } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { injected } from "wagmi/connectors";
import { privateKeyToAccount } from "viem/accounts";
import {
  getOrCreateBurnerKey,
  clearBurnerSession,
  setBurnerActive,
  isBurnerActive,
} from "@/lib/burnerWallet";

interface AuthState {
  address: string | null;
  loading: boolean;
  error: string | null;
  isBurner: boolean;
}

export function useAuth() {
  const { address: wagmiAddress, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [state, setState] = useState<AuthState>({
    address: localStorage.getItem("arbibench-address"),
    loading: false,
    error: null,
    isBurner: isBurnerActive(),
  });

  // If wagmi disconnects and we're NOT using burner, clear auth
  useEffect(() => {
    if (!isConnected && state.address && !state.isBurner) {
      localStorage.removeItem("arbibench-address");
      setState((s) => ({ ...s, address: null }));
    }
  }, [isConnected, state.address, state.isBurner]);

  // If wagmi switches to a different account, clear auth
  useEffect(() => {
    if (!state.isBurner && wagmiAddress && state.address &&
        wagmiAddress.toLowerCase() !== state.address.toLowerCase()) {
      localStorage.removeItem("arbibench-address");
      setState((s) => ({ ...s, address: null }));
    }
  }, [wagmiAddress, state.address, state.isBurner]);

  // --- MetaMask / injected sign-in ---
  const signIn = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      let address = wagmiAddress;
      if (!address) {
        const result = await connectAsync({ connector: injected() });
        address = result.accounts[0];
      }
      if (!address) throw new Error("No account found after connecting");

      const nonceRes = await fetch(`/api/auth/nonce/${address}`);
      if (!nonceRes.ok) throw new Error("Failed to get nonce");
      const { nonce } = await nonceRes.json() as { nonce: string };

      const message = `Sign in to ArbiBench\n\nNonce: ${nonce}`;
      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, nonce }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json() as { error?: string };
        throw new Error(err.error || "Verification failed");
      }

      const result = await verifyRes.json() as { address: string };
      localStorage.setItem("arbibench-address", result.address);
      localStorage.removeItem("arbibench-wallet-type");
      setState({ address: result.address, loading: false, error: null, isBurner: false });
      return result.address;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      setState((s) => ({ ...s, loading: false, error: msg }));
      return null;
    }
  }, [wagmiAddress, connectAsync, signMessageAsync]);

  // --- Burner wallet sign-in ---
  const signInWithBurner = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const pk = getOrCreateBurnerKey();
      const account = privateKeyToAccount(pk);
      const address = account.address;

      const nonceRes = await fetch(`/api/auth/nonce/${address}`);
      if (!nonceRes.ok) throw new Error("Failed to get nonce");
      const { nonce } = await nonceRes.json() as { nonce: string };

      const message = `Sign in to ArbiBench\n\nNonce: ${nonce}`;
      const signature = await account.signMessage({ message });

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, nonce }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json() as { error?: string };
        throw new Error(err.error || "Verification failed");
      }

      const result = await verifyRes.json() as { address: string };
      localStorage.setItem("arbibench-address", result.address);
      setBurnerActive();
      setState({ address: result.address, loading: false, error: null, isBurner: true });
      return result.address;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Burner sign-in failed";
      setState((s) => ({ ...s, loading: false, error: msg }));
      return null;
    }
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem("arbibench-address");
    clearBurnerSession();
    setState({ address: null, loading: false, error: null, isBurner: false });
    if (!state.isBurner) {
      try { await disconnectAsync(); } catch { /* ignore */ }
    }
  }, [state.isBurner, disconnectAsync]);

  return {
    address: state.address,
    loading: state.loading,
    error: state.error,
    isBurner: state.isBurner,
    signIn,
    signInWithBurner,
    signOut,
    isAuthenticated: !!state.address,
  };
}
