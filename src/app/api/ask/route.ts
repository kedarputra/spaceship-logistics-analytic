import { interpretQuestion, modelName, questionCache } from "@/ai/model";
import { handleAsk } from "./handle-ask";

/** POST /api/ask {question}: interpretation by the model, computation by the tools (ADR 0009 §7). */
export function POST(request: Request): Promise<Response> {
  return handleAsk(request, { interpret: interpretQuestion, modelName, cache: questionCache });
}
