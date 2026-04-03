import { Router } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import {
  sanitizeContractCode,
  sanitizeCargoToml,
  writeProjectFiles,
  checkContractSpawn,
} from "../services/deploy.js";

const execAsync = promisify(exec);
const router = Router();

router.post("/compile", async (req, res) => {
  const walletAddress = req.headers["x-wallet-address"] as string | undefined;
  if (!walletAddress) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { contractCode, cargoToml } = req.body as {
    contractCode: string;
    cargoToml: string;
  };

  if (!contractCode?.trim()) {
    res.status(400).json({ error: "contractCode is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (type: string, payload?: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbibench-compile-"));
  const contractDir = path.join(tmpDir, "contract");
  const rpc = process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";

  try {
    const code = sanitizeContractCode(contractCode);
    const toml = sanitizeCargoToml(cargoToml || "");

    writeProjectFiles(tmpDir, contractDir, toml, code, rpc);

    send("log", { line: "Fetching dependencies…" });
    try {
      await execAsync("cargo generate-lockfile", { cwd: tmpDir, timeout: 120_000 });
    } catch {
      // may already exist
    }

    send("log", { line: "Running cargo stylus check…" });

    const result = await checkContractSpawn(contractDir, rpc, (line) => {
      send("log", { line });
    });

    if (result.success) {
      send("success");
    } else {
      send("error", { errors: result.errors });
    }
  } catch (err) {
    send("error", { errors: err instanceof Error ? err.message : "Compile failed" });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    send("done");
    res.end();
  }
});

export default router;
