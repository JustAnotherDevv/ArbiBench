import { Router } from "express";
import * as storage from "../services/storage.js";
import type { App } from "../../../shared/schema.js";

const router = Router();

function getOwner(req: { headers: Record<string, unknown> }): string {
  return ((req.headers["x-wallet-address"] as string) || "").toLowerCase();
}

router.get("/apps", (req, res) => {
  if (req.query.published === "true") {
    res.json(storage.getAll({ published: true }));
    return;
  }
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

// ─── Publish / unpublish ─────────────────────────────────────────────────────

router.post("/apps/:id/publish", (req, res) => {
  const owner = getOwner(req);
  const app = storage.getById(req.params.id);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  if (app.owner !== owner) { res.status(403).json({ error: "Only the owner can publish this app" }); return; }
  if (!app.deployedAddress) { res.status(400).json({ error: "App must be deployed before publishing" }); return; }
  res.json(storage.publish(req.params.id));
});

router.post("/apps/:id/unpublish", (req, res) => {
  const owner = getOwner(req);
  const app = storage.getById(req.params.id);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  if (app.owner !== owner) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(storage.unpublish(req.params.id));
});

// ─── Version endpoints ───────────────────────────────────────────────────────

router.get("/apps/:id/versions", (req, res) => {
  const app = storage.getById(req.params.id);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  res.json(storage.getVersions(req.params.id));
});

router.patch("/apps/:id/versions/:versionId/label", (req, res) => {
  const owner = getOwner(req);
  const app = storage.getById(req.params.id);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  if (app.owner !== owner) { res.status(403).json({ error: "Forbidden" }); return; }
  const { label } = req.body as { label: string };
  storage.updateVersionLabel(req.params.versionId, label ?? "");
  res.json({ ok: true });
});

// Restore a version — updates the app's code to match the version
router.post("/apps/:id/versions/:versionId/restore", (req, res) => {
  const owner = getOwner(req);
  const app = storage.getById(req.params.id);
  if (!app) { res.status(404).json({ error: "App not found" }); return; }
  if (app.owner !== owner) { res.status(403).json({ error: "Forbidden" }); return; }

  const version = storage.getVersionById(req.params.versionId);
  if (!version || version.appId !== req.params.id) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  const updated = storage.update(req.params.id, {
    contractCode: version.contractCode,
    cargoToml: version.cargoToml,
    uiSchema: version.uiSchema,
    abi: version.abi,
    status: "draft",
  } as Partial<App>);
  res.json(updated);
});

export default router;
