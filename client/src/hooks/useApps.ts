import { useState, useEffect, useCallback } from "react";
import type { App } from "../types/schema";

const API = "/api";

function getWalletAddress(): string {
  let addr = localStorage.getItem("arbibench-wallet");
  if (!addr) {
    addr = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem("arbibench-wallet", addr);
  }
  return addr;
}

export function useApps() {
  const [apps, setApps] = useState<App[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const walletAddress = getWalletAddress();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-wallet-address": walletAddress,
  };

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch(`${API}/apps`, { headers });
      const data: App[] = await res.json();
      setApps(data);
    } catch (err) {
      console.error("Failed to fetch apps:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const selectedApp = apps.find((a) => a.id === selectedId) ?? null;

  async function createApp(data: {
    name: string;
    description: string;
    contractCode: string;
    cargoToml: string;
    uiSchema: App["uiSchema"];
  }): Promise<App> {
    const res = await fetch(`${API}/apps`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    const app: App = await res.json();
    await fetchApps();
    setSelectedId(app.id);
    return app;
  }

  async function updateApp(
    id: string,
    data: Partial<App>,
  ): Promise<App> {
    const res = await fetch(`${API}/apps/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
    const app: App = await res.json();
    await fetchApps();
    return app;
  }

  async function deleteApp(id: string): Promise<void> {
    await fetch(`${API}/apps/${id}`, {
      method: "DELETE",
      headers,
    });
    if (selectedId === id) setSelectedId(null);
    await fetchApps();
  }

  async function deployApp(id: string): Promise<App> {
    const res = await fetch(`${API}/apps/${id}/deploy`, {
      method: "POST",
      headers,
    });
    const app: App = await res.json();
    await fetchApps();
    return app;
  }

  return {
    apps,
    selectedApp,
    selectedId,
    loading,
    walletAddress,
    selectApp: setSelectedId,
    createApp,
    updateApp,
    deleteApp,
    deployApp,
    refreshApps: fetchApps,
  };
}
