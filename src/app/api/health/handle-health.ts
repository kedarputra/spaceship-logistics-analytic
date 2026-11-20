import type { AiHealth } from "@/ai/health";
import { getDataset } from "@/domain/orders";

/**
 * GET /api/health: one request after a deploy confirms the dataset shipped and parsed (ADR 0005).
 * With ?ai=1 it also says whether the AI answers, and with which model (ADR 0009 §11), as 503 when
 * it does not, so a check that reads only the status fails.
 */

export interface HealthDependencies {
  checkAi: () => Promise<AiHealth>;
}

export async function handleHealth(request: Request, dependencies: HealthDependencies): Promise<Response> {
  const { orders, anchor } = getDataset();
  const data = { rows: orders.length, anchor };
  if (new URL(request.url).searchParams.get("ai") !== "1") return Response.json(data);
  const ai = await dependencies.checkAi();
  return Response.json({ ...data, ai }, { status: ai.up ? 200 : 503 });
}
