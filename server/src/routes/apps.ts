import { Router } from "express";
import * as storage from "../services/storage.js";

const router = Router();

router.get("/apps", (req, res) => {
  const owner = req.query.owner as string | undefined;
  res.json(storage.getAll(owner));
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
  const owner =
    (req.headers["x-wallet-address"] as string) || "anonymous";

  if (!name || !contractCode || !uiSchema) {
    res.status(400).json({ error: "name, contractCode, and uiSchema are required" });
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
  const app = storage.update(req.params.id, req.body);
  if (!app) {
    res.status(404).json({ error: "App not found" });
    return;
  }
  res.json(app);
});

router.delete("/apps/:id", (req, res) => {
  const ok = storage.remove(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "App not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
