import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import type { App, UISchema, AbiItem } from "../../../shared/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "arbibench.db"));
db.pragma("journal_mode = WAL");

// Migrations — safe to run multiple times
for (const sql of [
  `ALTER TABLE apps ADD COLUMN abi TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE apps ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE apps ADD COLUMN logoUrl TEXT`,
  `ALTER TABLE apps ADD COLUMN websiteUrl TEXT`,
  `ALTER TABLE apps ADD COLUMN published INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE apps ADD COLUMN publishedAt TEXT`,
]) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    contractCode TEXT NOT NULL,
    cargoToml TEXT NOT NULL DEFAULT '',
    uiSchema TEXT NOT NULL,
    owner TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    deployedAddress TEXT,
    txHash TEXT,
    error TEXT,
    abi TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    logoUrl TEXT,
    websiteUrl TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    address TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    appId TEXT NOT NULL,
    contractCode TEXT NOT NULL,
    cargoToml TEXT NOT NULL DEFAULT '',
    uiSchema TEXT NOT NULL,
    abi TEXT NOT NULL DEFAULT '[]',
    label TEXT,
    deployedAddress TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (appId) REFERENCES apps(id) ON DELETE CASCADE
  );
`);

// ─── App helpers ────────────────────────────────────────────────────────────

function rowToApp(row: Record<string, unknown>): App {
  return {
    ...row,
    uiSchema: JSON.parse(row.uiSchema as string),
    abi: JSON.parse((row.abi as string) || "[]"),
    tags: JSON.parse((row.tags as string) || "[]"),
    published: Boolean(row.published),
  } as App;
}

export function getAll(opts?: string | { owner?: string; published?: boolean }): App[] {
  // Backwards compat: accept plain owner string
  if (typeof opts === "string" || opts === undefined) {
    const owner = opts as string | undefined;
    const stmt = owner
      ? db.prepare("SELECT * FROM apps WHERE owner = ? ORDER BY createdAt DESC")
      : db.prepare("SELECT * FROM apps ORDER BY createdAt DESC");
    const rows = owner ? stmt.all(owner) : stmt.all();
    return (rows as Record<string, unknown>[]).map(rowToApp);
  }
  if (opts.published === true) {
    const rows = db
      .prepare("SELECT * FROM apps WHERE published = 1 ORDER BY publishedAt DESC")
      .all() as Record<string, unknown>[];
    return rows.map(rowToApp);
  }
  if (opts.owner) {
    const rows = db
      .prepare("SELECT * FROM apps WHERE owner = ? ORDER BY createdAt DESC")
      .all(opts.owner) as Record<string, unknown>[];
    return rows.map(rowToApp);
  }
  return (db.prepare("SELECT * FROM apps ORDER BY createdAt DESC").all() as Record<string, unknown>[]).map(rowToApp);
}

export function publish(id: string): App | undefined {
  const now = new Date().toISOString();
  db.prepare("UPDATE apps SET published = 1, publishedAt = ?, updatedAt = ? WHERE id = ?").run(now, now, id);
  return getById(id);
}

export function unpublish(id: string): App | undefined {
  const now = new Date().toISOString();
  db.prepare("UPDATE apps SET published = 0, publishedAt = NULL, updatedAt = ? WHERE id = ?").run(now, id);
  return getById(id);
}

export function getById(id: string): App | undefined {
  const row = db
    .prepare("SELECT * FROM apps WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToApp(row) : undefined;
}

export function create(data: {
  name: string;
  description: string;
  contractCode: string;
  cargoToml: string;
  uiSchema: UISchema;
  abi?: AbiItem[];
  owner: string;
  status?: string;
  error?: string;
}): App {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO apps (id, name, description, contractCode, cargoToml, uiSchema, abi, owner, status, error, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description,
    data.contractCode,
    data.cargoToml,
    JSON.stringify(data.uiSchema),
    JSON.stringify(data.abi || []),
    data.owner,
    data.status ?? "draft",
    data.error ?? null,
    now,
    now,
  );
  return getById(id)!;
}

export function update(id: string, data: Partial<App>): App | undefined {
  const existing = getById(id);
  if (!existing) return undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(data)) {
    if (key === "id" || key === "createdAt") continue;
    if (key === "uiSchema" || key === "abi" || key === "tags") {
      fields.push(`${key} = ?`);
      values.push(JSON.stringify(val));
    } else {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }

  fields.push("updatedAt = ?");
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE apps SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getById(id);
}

export function remove(id: string): boolean {
  const result = db.prepare("DELETE FROM apps WHERE id = ?").run(id);
  return result.changes > 0;
}

// ─── Version helpers ─────────────────────────────────────────────────────────

export interface Version {
  id: string;
  appId: string;
  contractCode: string;
  cargoToml: string;
  uiSchema: UISchema;
  abi: AbiItem[];
  label: string | null;
  deployedAddress: string | null;
  createdAt: string;
}

function rowToVersion(row: Record<string, unknown>): Version {
  return {
    ...row,
    uiSchema: JSON.parse(row.uiSchema as string),
    abi: JSON.parse((row.abi as string) || "[]"),
  } as Version;
}

export function createVersion(data: {
  appId: string;
  contractCode: string;
  cargoToml: string;
  uiSchema: UISchema;
  abi: AbiItem[];
  label?: string;
  deployedAddress?: string | null;
}): Version {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO versions (id, appId, contractCode, cargoToml, uiSchema, abi, label, deployedAddress, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.appId,
    data.contractCode,
    data.cargoToml,
    JSON.stringify(data.uiSchema),
    JSON.stringify(data.abi),
    data.label ?? null,
    data.deployedAddress ?? null,
    now,
  );
  return getVersionById(id)!;
}

export function getVersions(appId: string): Version[] {
  const rows = db
    .prepare("SELECT * FROM versions WHERE appId = ? ORDER BY createdAt DESC")
    .all(appId) as Record<string, unknown>[];
  return rows.map(rowToVersion);
}

export function getVersionById(id: string): Version | undefined {
  const row = db
    .prepare("SELECT * FROM versions WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToVersion(row) : undefined;
}

export function updateVersionLabel(id: string, label: string): void {
  db.prepare("UPDATE versions SET label = ? WHERE id = ?").run(label, id);
}

export function markVersionDeployed(appId: string, deployedAddress: string): void {
  // Clear previous deployed marks for this app, set new one on the latest version
  const latest = db
    .prepare("SELECT id FROM versions WHERE appId = ? ORDER BY createdAt DESC LIMIT 1")
    .get(appId) as { id: string } | undefined;
  if (latest) {
    db.prepare("UPDATE versions SET deployedAddress = NULL WHERE appId = ?").run(appId);
    db.prepare("UPDATE versions SET deployedAddress = ? WHERE id = ?").run(deployedAddress, latest.id);
  }
}

// ─── User/nonce management for SIWE ─────────────────────────────────────────

export function getOrCreateNonce(address: string): string {
  const addr = address.toLowerCase();
  const row = db
    .prepare("SELECT nonce FROM users WHERE address = ?")
    .get(addr) as { nonce: string } | undefined;

  if (row) {
    const nonce = crypto.randomUUID();
    db.prepare("UPDATE users SET nonce = ? WHERE address = ?").run(nonce, addr);
    return nonce;
  }

  const nonce = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (address, nonce, createdAt) VALUES (?, ?, ?)",
  ).run(addr, nonce, new Date().toISOString());
  return nonce;
}

export function verifyNonce(address: string, nonce: string): boolean {
  const addr = address.toLowerCase();
  const row = db
    .prepare("SELECT nonce FROM users WHERE address = ?")
    .get(addr) as { nonce: string } | undefined;
  return row?.nonce === nonce;
}
