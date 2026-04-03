import { Router } from "express";
import { generateApp } from "../services/llm.js";

const router = Router();

router.post("/generate", async (req, res) => {
  const { description } = req.body;

  if (!description || typeof description !== "string") {
    res.status(400).json({ error: "description is required" });
    return;
  }

  try {
    const result = await generateApp(description);
    res.json(result);
  } catch (err) {
    console.error("Generation failed:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Generation failed",
    });
  }
});

export default router;
