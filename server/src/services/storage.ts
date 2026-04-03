import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import type { App, UISchema } from "../../../shared/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "arbibench.db"));
db.pragma("journal_mode = WAL");

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
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    address TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
`);

function rowToApp(row: Record<string, unknown>): App {
  return {
    ...row,
    uiSchema: JSON.parse(row.uiSchema as string),
  } as App;
}

export function getAll(owner?: string): App[] {
  const stmt = owner
    ? db.prepare("SELECT * FROM apps WHERE owner = ? ORDER BY createdAt DESC")
    : db.prepare("SELECT * FROM apps ORDER BY createdAt DESC");
  const rows = owner ? stmt.all(owner) : stmt.all();
  return (rows as Record<string, unknown>[]).map(rowToApp);
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
  owner: string;
}): App {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO apps (id, name, description, contractCode, cargoToml, uiSchema, owner, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
  `).run(
    id,
    data.name,
    data.description,
    data.contractCode,
    data.cargoToml,
    JSON.stringify(data.uiSchema),
    data.owner,
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
    if (key === "uiSchema") {
      fields.push("uiSchema = ?");
      values.push(JSON.stringify(val));
    } else {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }

  fields.push("updatedAt = ?");
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE apps SET ${fields.join(", ")} WHERE id = ?`).run(
    ...values,
  );
  return getById(id);
}

export function remove(id: string): boolean {
  const result = db.prepare("DELETE FROM apps WHERE id = ?").run(id);
  return result.changes > 0;
}

// User/nonce management for SIWE
export function getOrCreateNonce(address: string): string {
  const addr = address.toLowerCase();
  const row = db
    .prepare("SELECT nonce FROM users WHERE address = ?")
    .get(addr) as { nonce: string } | undefined;

  if (row) {
    // Rotate nonce each time
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
