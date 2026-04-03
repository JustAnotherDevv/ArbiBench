import { Router } from "express";
import type { AgentEvent, UISchema, AbiItem } from "../../../shared/schema.js";
import { runAgentSession } from "../services/agent.js";

const router = Router();

router.post("/chat", async (req, res) => {
  const walletAddress = req.headers["x-wallet-address"] as string | undefined;
  if (!walletAddress) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { appId, message, currentCode } = req.body as {
    appId: string | null;
    message: string;
    currentCode?: {
      contractCode: string;
      cargoToml: string;
      uiSchema: unknown;
      abi?: AbiItem[];
    };
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const emit = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await runAgentSession(
      {
        appId: appId ?? null,
        message,
        walletAddress,
        currentCode: currentCode as
          | { contractCode: string; cargoToml: string; uiSchema: UISchema; abi?: AbiItem[] }
          | undefined,
      },
      emit,
    );
  } catch (err) {
    emit({
      type: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    emit({ type: "done" });
    res.end();
  }
});

export default router;
