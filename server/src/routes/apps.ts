import { Router } from "express";
import * as storage from "../services/storage.js";

const router = Router();

function getOwner(req: { headers: Record<string, unknown> }): string {
  return ((req.headers["x-wallet-address"] as string) || "").toLowerCase();
}

router.get("/apps", (req, res) => {
  const owner = (req.query.owner as string) || getOwner(req);
  if (owner) {
    res.json(storage.getAll(owner));
  } else {
    res.json(storage.getAll());
  }
});

router.get("/apps/:id", (req, res) => {
  const app = storage.getById(req.params.id);
  if (!app) {
    res.status(404).json({ error: "App not found" });
    return;
  }
  res.json(app);
});

router.post("/apps", (req, res) => {
  const { name, description, contractCode, cargoToml, uiSchema } = req.body;
  const owner = getOwner(req);

  if (!owner) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (!name || !contractCode || !uiSchema) {
    res
      .status(400)
      .json({ error: "name, contractCode, and uiSchema are required" });
    return;
  }

  const app = storage.create({
    name,
    description: description || "",
    contractCode,
    cargoToml: cargoToml || "",
    uiSchema,
    owner,
  });
  res.status(201).json(app);
});

router.put("/apps/:id", (req, res) => {
  const owner = getOwner(req);
  const app = storage.getById(req.params.id);

  if (!app) {
    res.status(404).json({ error: "App not found" });
    return;
  }
  if (app.owner !== owner) {
    res.status(403).json({ error: "Only the owner can edit this app" });
    return;
  }

  const updated = storage.update(req.params.id, req.body);
  res.json(updated);
});

router.delete("/apps/:id", (req, res) => {
  const owner = getOwner(req);
  const app = storage.getById(req.params.id);

  if (!app) {
    res.status(404).json({ error: "App not found" });
    return;
  }
  if (app.owner !== owner) {
    res.status(403).json({ error: "Only the owner can delete this app" });
    return;
  }

  storage.remove(req.params.id);
  res.json({ ok: true });
});

export default router;
