import "dotenv/config";
import express from "express";
import cors from "cors";
import generateRouter from "./routes/generate.js";
import { getAgentAddress } from "./services/wallet.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  try {
    const address = getAgentAddress();
    res.json({ status: "ok", agentAddress: address });
  } catch {
    res.json({ status: "ok", agentAddress: null });
  }
});

app.use("/api", generateRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  try {
    console.log(`Agent address: ${getAgentAddress()}`);
  } catch {
    console.log("No agent wallet configured (set AGENT_PRIVATE_KEY in .env)");
  }
});
