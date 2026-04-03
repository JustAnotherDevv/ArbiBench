import OpenAI from "openai";
import { SYSTEM_PROMPT } from "../prompts/system.js";
import type { GenerateResponse } from "../../../shared/schema.js";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function generateApp(
  description: string,
): Promise<GenerateResponse> {
  const response = await openai.chat.completions.create({
    model: "google/gemini-2.0-flash-001",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Build an Arbitrum dApp: ${description}`,
      },
    ],
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from LLM");

  // Extract JSON - handle both raw JSON and markdown-wrapped JSON
  let jsonStr = content.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr) as GenerateResponse;

  if (!parsed.contract || !parsed.uiSchema?.layout) {
    throw new Error("Invalid response structure from LLM");
  }

  return parsed;
}
