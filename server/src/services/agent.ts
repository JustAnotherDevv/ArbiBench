import fs from "fs";
import os from "os";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { AgentEvent, App, UISchema, AbiItem } from "../../../shared/schema.js";
import { generateApp, modifyApp, fixContractCode } from "./llm.js";
import {
  sanitizeCargoToml,
  sanitizeContractCode,
  writeProjectFiles,
  checkContractSpawn,
} from "./deploy.js";
import * as storage from "./storage.js";

const execAsync = promisify(exec);

const MAX_FIX_ATTEMPTS = 3;
const MAX_PARSE_ATTEMPTS = 3;

interface AgentSessionOpts {
  appId: string | null;
  message: string;
  walletAddress: string;
  currentCode?: {
    contractCode: string;
    cargoToml: string;
    uiSchema: UISchema;
    abi?: AbiItem[];
  };
}

export async function runAgentSession(
  opts: AgentSessionOpts,
  emit: (event: AgentEvent) => void,
): Promise<App> {
  const { appId, message, walletAddress, currentCode } = opts;

  // 1. Generate or modify the app code via LLM (with parse-retry loop)
  const existingApp = appId ? storage.getById(appId) : null;
  const isModify = !!(appId && (currentCode || existingApp));
  const codeSource = currentCode ?? (existingApp
    ? { contractCode: existingApp.contractCode, cargoToml: existingApp.cargoToml, uiSchema: existingApp.uiSchema, abi: existingApp.abi }
    : null);

  emit({ type: "thinking", message: isModify ? "Updating app..." : "Generating contract..." });

  let generated: { contractCode: string; cargoToml: string; uiSchema: UISchema; abi?: AbiItem[] } | null = null;

  for (let parseAttempt = 0; parseAttempt < MAX_PARSE_ATTEMPTS; parseAttempt++) {
    try {
      if (isModify && codeSource) {
        const prevErrors = existingApp?.status === "failed" ? (existingApp.error ?? null) : null;
        generated = await modifyApp(
          { ...codeSource, abi: codeSource.abi ?? existingApp?.abi ?? [] },
          message,
          parseAttempt > 0,
          prevErrors,
        );
      } else {
        generated = await generateApp(message, parseAttempt > 0);
      }
      break;
    } catch (err) {
      const isParseErr = err instanceof Error && (
        err.message.includes("Failed to parse") ||
        err.message.includes("missing 'layout'") ||
        err.message.includes("unparseable")
      );
      if (isParseErr && parseAttempt < MAX_PARSE_ATTEMPTS - 1) {
        emit({ type: "thinking", message: `Fixing response format (attempt ${parseAttempt + 2})...` });
        continue;
      }
      throw err;
    }
  }

  if (!generated) throw new Error("Failed to generate app after retries");

  let { uiSchema, abi = [] } = generated;
  let contractCode = sanitizeContractCode(generated.contractCode);
  let cargoToml = sanitizeCargoToml(generated.cargoToml);

  // 2. Detect UI-only change — if contract code is unchanged, skip the build
  const prevContractCode = codeSource?.contractCode ? sanitizeContractCode(codeSource.contractCode) : null;
  const contractChanged = !prevContractCode || contractCode.trim() !== prevContractCode.trim();

  emit({ type: "code_update", contractCode, cargoToml, uiSchema, abi });

  let buildSuccess = false;
  let lastErrors: string | null = null;

  if (!contractChanged && isModify) {
    // UI-only change — no build needed
    emit({ type: "thinking", message: "UI updated (contract unchanged, skipping build)" });
    buildSuccess = true;
  } else {
    // 3. Build-fix loop
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbibench-"));
    const contractDir = path.join(tmpDir, "contract");
    const fixHistory: Array<{ attempt: number; errors: string }> = [];

    try {
      const rpc =
        process.env.ARBITRUM_SEPOLIA_RPC ||
        "https://sepolia-rollup.arbitrum.io/rpc";

      writeProjectFiles(tmpDir, contractDir, cargoToml, contractCode, rpc);
      emit({ type: "thinking", message: "Fetching dependencies..." });
      try {
        await execAsync("cargo generate-lockfile", { cwd: tmpDir, timeout: 120_000 });
      } catch { /* lockfile may already exist */ }

      for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
        writeProjectFiles(tmpDir, contractDir, cargoToml, contractCode, rpc);
        emit({ type: "build_start", attempt });

        const result = await checkContractSpawn(contractDir, rpc, (line) => {
          emit({ type: "build_log", line });
        });

        if (result.success) {
          emit({ type: "build_success" });
          buildSuccess = true;
          lastErrors = null;
          break;
        }

        lastErrors = result.errors;
        emit({ type: "build_error", errors: result.errors, attempt });

        if (attempt >= MAX_FIX_ATTEMPTS) break;

        emit({ type: "fix_start", attempt: attempt + 1 });

        fixHistory.push({ attempt, errors: result.errors });
        const fixed = await fixContractCode(
          contractCode, cargoToml, result.errors,
          fixHistory.slice(0, -1),
        );
        contractCode = sanitizeContractCode(fixed.contractCode);
        cargoToml = sanitizeCargoToml(fixed.cargoToml);

        emit({ type: "code_update", contractCode, cargoToml, uiSchema, abi });

        try {
          fs.rmSync(path.join(tmpDir, "target"), { recursive: true, force: true });
          fs.rmSync(path.join(tmpDir, "Cargo.lock"), { force: true });
        } catch { /* ignore */ }

        writeProjectFiles(tmpDir, contractDir, cargoToml, contractCode, rpc);
        try {
          await execAsync("cargo generate-lockfile", { cwd: tmpDir, timeout: 120_000 });
        } catch { /* ignore */ }
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // 4. Persist to database
  let app: App;
  if (appId) {
    const updated = storage.update(appId, {
      contractCode,
      cargoToml,
      uiSchema,
      abi,
      status: buildSuccess ? "draft" : "failed",
      error: buildSuccess ? undefined : (lastErrors ?? "Build failed after max attempts"),
    });
    if (!updated) throw new Error("App not found");
    app = updated;
  } else {
    app = storage.create({
      name: uiSchema.title || "Untitled App",
      description: uiSchema.description || message,
      contractCode,
      cargoToml,
      uiSchema,
      abi,
      owner: walletAddress,
      status: buildSuccess ? "draft" : "failed",
      error: buildSuccess ? undefined : (lastErrors ?? "Build failed after max attempts"),
    });
  }

  // 5. Save a version snapshot on success
  if (buildSuccess) {
    const label = contractChanged ? null : "UI update";
    storage.createVersion({
      appId: app.id,
      contractCode: app.contractCode,
      cargoToml: app.cargoToml,
      uiSchema: app.uiSchema,
      abi: app.abi,
      label,
      deployedAddress: app.deployedAddress ?? null,
    });
  }

  emit({ type: "app_saved", app });
  return app;
}
