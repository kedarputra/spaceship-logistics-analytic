import { interpretQuestion, modelName, phraseAnswer, questionCache } from "@/ai/model";
import { handleAsk } from "./handle-ask";

/** POST /api/ask {question}: interpretation and phrasing by the model, computation by the tools (ADR 0009 §7). */
export function POST(request: Request): Promise<Response> {
  return handleAsk(request, { interpret: interpretQuestion, phrase: phraseAnswer, modelName, cache: questionCache });
}
