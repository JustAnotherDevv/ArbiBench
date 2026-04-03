import { Router } from "express";
import * as storage from "../services/storage.js";
import { deployContract } from "../services/deploy.js";

const router = Router();

router.post("/apps/:id/deploy", async (req, res) => {
  const app = storage.getById(req.params.id);
  if (!app) {
    res.status(404).json({ error: "App not found" });
    return;
  }

  if (app.status === "deploying") {
    res.status(409).json({ error: "Deployment already in progress" });
    return;
  }

  // Set deploying status
  storage.update(app.id, { status: "deploying", error: undefined });

  try {
    const { address, txHash } = await deployContract(app);
    const updated = storage.update(app.id, {
      status: "deployed",
      deployedAddress: address,
      txHash,
    });
    res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Deployment failed";
    const updated = storage.update(app.id, {
      status: "failed",
      error: msg,
    });
    res.status(500).json(updated);
  }
});

export default router;
