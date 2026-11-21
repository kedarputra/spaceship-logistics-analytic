import { withApiRole } from "../../auth";
import { handleRun } from "./handle-run";

/** POST /api/run {spec}: a validated spec run by the tools, never the LLM (ADR 0009 §7). Part of Ask, so analysts and admins (ticket 31). */
export const POST = withApiRole("ask", (request) => handleRun(request, () => performance.now()));
