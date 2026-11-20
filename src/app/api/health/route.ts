import { checkAiHealth } from "@/ai/model";
import { handleHealth } from "./handle-health";

/** GET /api/health, and ?ai=1 for the AI's state (ADR 0005, ADR 0009 §11). */
export function GET(request: Request): Promise<Response> {
  return handleHealth(request, { checkAi: checkAiHealth });
}
