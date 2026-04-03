import { Router } from "express";
import * as storage from "../services/storage.js";
import { deployContract } from "../services/deploy.js";

const router = Router();

router.post("/apps/:id/deploy", async (req, res) => {
  const owner = ((req.headers["x-wallet-address"] as string) || "").toLowerCase();
  const app = storage.getById(req.params.id);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  if (app.owner !== owner) { res.status(403).json({ error: "Only the owner can deploy" }); return; }
  if (app.status === "deploying") { res.status(409).json({ error: "Already deploying" }); return; }

  // Stream deploy logs via SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (type: string, payload?: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  storage.update(app.id, { status: "deploying", error: undefined });

  try {
    const { address, txHash } = await deployContract(app, (line) => {
      send("log", { line });
    });
    const updated = storage.update(app.id, { status: "deployed", deployedAddress: address, txHash });
    storage.markVersionDeployed(app.id, address);
    send("success", { app: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Deployment failed";
    const updated = storage.update(app.id, { status: "failed", error: msg });
    send("error", { message: msg, app: updated });
  } finally {
    send("done");
    res.end();
  }
});

export default router;
