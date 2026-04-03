import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { App, UISchema } from "../../../shared/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "apps.json");

let apps: App[] = [];

function load() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      apps = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    } else {
      apps = [];
      flush();
    }
  } catch {
    apps = [];
  }
}

function flush() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(apps, null, 2));
}

// Initialize on import
load();

export function getAll(owner?: string): App[] {
  if (owner) return apps.filter((a) => a.owner === owner);
  return [...apps];
}

export function getById(id: string): App | undefined {
  return apps.find((a) => a.id === id);
}

export function create(data: {
  name: string;
  description: string;
  contractCode: string;
  cargoToml: string;
  uiSchema: UISchema;
  owner: string;
}): App {
  const now = new Date().toISOString();
  const app: App = {
    id: crypto.randomUUID(),
    ...data,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  apps.push(app);
  flush();
  return app;
}

export function update(id: string, data: Partial<App>): App | undefined {
  const idx = apps.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  apps[idx] = {
    ...apps[idx],
    ...data,
    id: apps[idx].id,
    createdAt: apps[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  flush();
  return apps[idx];
}

export function remove(id: string): boolean {
  const idx = apps.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  apps.splice(idx, 1);
  flush();
  return true;
}
