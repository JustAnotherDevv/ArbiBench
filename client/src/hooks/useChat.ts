import { useState, useCallback, useRef } from "react";
import type { App, AgentEvent, ChatItem, UISchema, AbiItem } from "@/types/schema";

export interface CodeState {
  contractCode: string;
  cargoToml: string;
  uiSchema: UISchema;
  abi: AbiItem[];
}

export function useChat(walletAddress: string | null) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentCode, setCurrentCode] = useState<CodeState | null>(null);
  const [currentApp, setCurrentApp] = useState<App | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback((app?: App) => {
    setItems([]);
    setIsStreaming(false);
    if (app) {
      setCurrentApp(app);
      setCurrentCode({
        contractCode: app.contractCode,
        cargoToml: app.cargoToml,
        uiSchema: app.uiSchema,
        abi: app.abi || [],
      });
    } else {
      setCurrentApp(null);
      setCurrentCode(null);
    }
  }, []);

  const sendMessage = useCallback(
    async (
      message: string,
      appId: string | null,
      codeOverride?: CodeState,
    ): Promise<App | null> => {
      if (!walletAddress || isStreaming) return null;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsStreaming(true);
      setItems((prev) => [...prev, { kind: "user", text: message }]);

      let savedApp: App | null = null;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddress,
          },
          body: JSON.stringify({
            appId,
            message,
            currentCode: codeOverride ?? currentCode,
          }),
          signal: controller.signal,
        });

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Track the index of the current build section so we can update its logs
        let buildSectionIndex = -1;
        let streamDone = false;

        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const dataLine = frame
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!dataLine) continue;

            let event: AgentEvent;
            try {
              event = JSON.parse(dataLine.slice(6)) as AgentEvent;
            } catch {
              continue;
            }

            if (event.type === "done") { streamDone = true; break; }

            if (event.type === "thinking") {
              setItems((prev) => [
                ...prev,
                { kind: "thinking", message: event.message },
              ]);
            } else if (event.type === "code_update") {
              const { contractCode, cargoToml, uiSchema, abi } = event;
              setCurrentCode({ contractCode, cargoToml, uiSchema, abi });
              setItems((prev) => [
                ...prev,
                { kind: "code_update", contractCode, cargoToml, uiSchema, abi },
              ]);
            } else if (event.type === "build_start") {
              // Add a new build section item
              setItems((prev) => {
                const newSection: ChatItem = {
                  kind: "build_section",
                  attempt: event.attempt,
                  logs: [],
                  status: "running",
                };
                buildSectionIndex = prev.length;
                return [...prev, newSection];
              });
            } else if (event.type === "build_log") {
              if (buildSectionIndex >= 0) {
                setItems((prev) => {
                  const updated = [...prev];
                  const section = updated[buildSectionIndex];
                  if (section?.kind === "build_section") {
                    updated[buildSectionIndex] = {
                      ...section,
                      logs: [...section.logs, event.line],
                    };
                  }
                  return updated;
                });
              }
            } else if (event.type === "build_success") {
              if (buildSectionIndex >= 0) {
                setItems((prev) => {
                  const updated = [...prev];
                  const section = updated[buildSectionIndex];
                  if (section?.kind === "build_section") {
                    updated[buildSectionIndex] = {
                      ...section,
                      status: "success",
                    };
                  }
                  buildSectionIndex = -1;
                  return updated;
                });
              }
            } else if (event.type === "build_error") {
              if (buildSectionIndex >= 0) {
                setItems((prev) => {
                  const updated = [...prev];
                  const section = updated[buildSectionIndex];
                  if (section?.kind === "build_section") {
                    updated[buildSectionIndex] = {
                      ...section,
                      status: "error",
                      errors: event.errors,
                    };
                  }
                  buildSectionIndex = -1;
                  return updated;
                });
              }
            } else if (event.type === "fix_start") {
              setItems((prev) => [
                ...prev,
                { kind: "fix", attempt: event.attempt },
              ]);
            } else if (event.type === "app_saved") {
              savedApp = event.app;
              setCurrentApp(event.app);
              setItems((prev) => [
                ...prev,
                { kind: "app_saved", app: event.app },
              ]);
            } else if (event.type === "error") {
              setItems((prev) => [
                ...prev,
                { kind: "error", message: event.message },
              ]);
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          const msg = err instanceof Error ? err.message : "Unknown error";
          setItems((prev) => [...prev, { kind: "error", message: msg }]);
        }
      } finally {
        setIsStreaming(false);
      }

      return savedApp;
    },
    [walletAddress, isStreaming, currentCode],
  );

  /** Remove everything from the last user message onward (for retry). */
  const trimToLastUser = useCallback(() => {
    setItems((prev) => {
      const idx = [...prev].reverse().findIndex((i) => i.kind === "user");
      if (idx === -1) return prev;
      return prev.slice(0, prev.length - idx - 1);
    });
  }, []);

  /** Restore a previously saved list of items (used when switching back to an app). */
  const restoreItems = useCallback((saved: ChatItem[]) => {
    setItems(saved);
  }, []);

  return {
    items,
    isStreaming,
    currentCode,
    currentApp,
    sendMessage,
    reset,
    setCurrentCode,
    setCurrentApp,
    setItems,
    trimToLastUser,
    restoreItems,
  };
}
