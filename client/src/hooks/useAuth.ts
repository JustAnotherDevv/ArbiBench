import { useState, useEffect, useCallback } from "react";
import { BrowserProvider } from "ethers";

interface AuthState {
  address: string | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    address: localStorage.getItem("arbibench-address"),
    loading: false,
    error: null,
  });

  const signIn = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      if (!window.ethereum) {
        throw new Error("No Ethereum wallet found. Install MetaMask.");
      }

      const provider = new BrowserProvider(window.ethereum as never);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // Get nonce from server
      const nonceRes = await fetch(`/api/auth/nonce/${address}`);
      const { nonce } = await nonceRes.json();

      // Sign message
      const message = `Sign in to ArbiBench\n\nNonce: ${nonce}`;
      const signature = await signer.signMessage(message);

      // Verify with server
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, nonce }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || "Verification failed");
      }

      const result = await verifyRes.json();
      const authedAddress = result.address;

      localStorage.setItem("arbibench-address", authedAddress);
      setState({ address: authedAddress, loading: false, error: null });

      return authedAddress;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      setState((s) => ({ ...s, loading: false, error: msg }));
      return null;
    }
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem("arbibench-address");
    setState({ address: null, loading: false, error: null });
  }, []);

  // Check if wallet is still connected
  useEffect(() => {
    if (state.address && window.ethereum) {
      window.ethereum
        .request?.({ method: "eth_accounts" })
        .then((accounts: unknown) => {
          const accts = accounts as string[];
          if (
            accts.length === 0 ||
            accts[0].toLowerCase() !== state.address
          ) {
            signOut();
          }
        })
        .catch(() => {});
    }
  }, [state.address, signOut]);

  return {
    address: state.address,
    loading: state.loading,
    error: state.error,
    signIn,
    signOut,
    isAuthenticated: !!state.address,
  };
}
