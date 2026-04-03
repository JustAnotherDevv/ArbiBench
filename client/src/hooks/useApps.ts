import { useState, useEffect, useCallback } from "react";
import type { App } from "../types/schema";

const API = "/api";

export function useApps(walletAddress: string | null) {
  const [apps, setApps] = useState<App[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(walletAddress ? { "x-wallet-address": walletAddress } : {}),
  };

  const fetchApps = useCallback(async () => {
    if (!walletAddress) {
      setApps([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API}/apps`, { headers });
      const data: App[] = await res.json();
      setApps(data);
    } catch (err) {
      console.error("Failed to fetch apps:", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

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
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create app");
    }
    const app: App = await res.json();
    await fetchApps();
    setSelectedId(app.id);
    return app;
  }

  async function updateApp(id: string, data: Partial<App>): Promise<App> {
    const res = await fetch(`${API}/apps/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to update");
    }
    const app: App = await res.json();
    await fetchApps();
    return app;
  }

  async function deleteApp(id: string): Promise<void> {
    const res = await fetch(`${API}/apps/${id}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to delete");
    }
    if (selectedId === id) setSelectedId(null);
    await fetchApps();
  }

  async function deployApp(
    id: string,
    onLog?: (line: string) => void,
    onDone?: (app: App, success: boolean, error?: string) => void,
  ): Promise<App> {
    setApps((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "deploying" as const } : a)),
    );

    const res = await fetch(`${API}/apps/${id}/deploy`, {
      method: "POST",
      headers,
    });

    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalApp: App | null = null;
    let deployError: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const event = JSON.parse(dataLine.slice(6)) as {
            type: string; line?: string; app?: App; message?: string;
          };
          if (event.type === "log" && event.line) onLog?.(event.line);
          else if (event.type === "success" && event.app) {
            finalApp = event.app;
            onDone?.(event.app, true);
          } else if (event.type === "error") {
            deployError = event.message;
            if (event.app) { finalApp = event.app; onDone?.(event.app, false, event.message); }
          }
        } catch { /* skip */ }
      }
    }

    await fetchApps();
    if (!finalApp) throw new Error(deployError ?? "Deployment failed");
    return finalApp;
  }

  async function publishApp(id: string): Promise<App> {
    const res = await fetch(`${API}/apps/${id}/publish`, { method: "POST", headers });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to publish");
    }
    const app: App = await res.json();
    await fetchApps();
    return app;
  }

  async function unpublishApp(id: string): Promise<App> {
    const res = await fetch(`${API}/apps/${id}/unpublish`, { method: "POST", headers });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to unpublish");
    }
    const app: App = await res.json();
    await fetchApps();
    return app;
  }

  return {
    apps,
    selectedApp,
    selectedId,
    loading,
    selectApp: (id: string | null) => setSelectedId(id),
    createApp,
    updateApp,
    deleteApp,
    deployApp,
    publishApp,
    unpublishApp,
    refreshApps: fetchApps,
  };
}
