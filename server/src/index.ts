import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import express from "express";
import cors from "cors";
import generateRouter from "./routes/generate.js";
import appsRouter from "./routes/apps.js";
import deployRouter from "./routes/deploy.js";
import authRouter from "./routes/auth.js";
import { getAgentAddress } from "./services/wallet.js";

// Ensure data directory exists
fs.mkdirSync(path.join(__dirname, "../data"), { recursive: true });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => {
  try {
    const address = getAgentAddress();
    const registrationTx = process.env.AGENT_REGISTRATION_TX || null;
    res.json({ status: "ok", agentAddress: address, registrationTx });
  } catch {
    res.json({ status: "ok", agentAddress: null });
  }
});

app.use("/api", authRouter);
app.use("/api", generateRouter);
app.use("/api", appsRouter);
app.use("/api", deployRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  try {
    console.log(`Agent address: ${getAgentAddress()}`);
  } catch {
    console.log("No agent wallet configured (set AGENT_PRIVATE_KEY in .env)");
  }
});
