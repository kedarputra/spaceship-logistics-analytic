import { interpretQuestion, modelName, phraseAnswer, questionCache } from "@/ai/model";
import { withApiRole } from "../../auth";
import { handleAsk } from "./handle-ask";

/** POST /api/ask {question}: interpretation and phrasing by the model, computation by the tools (ADR 0009 §7). Analysts and admins (ticket 31). */
export const POST = withApiRole("ask", (request, { dataset }) =>
  handleAsk(request, dataset, { interpret: interpretQuestion, phrase: phraseAnswer, modelName, cache: questionCache, now: () => performance.now() }),
);
