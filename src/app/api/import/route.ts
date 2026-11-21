import { withApiRole } from "../../auth";
import { importStore } from "../../import-store";
import { handleClearImport, handleImport, importLimiter } from "./handle-import";

/** POST /api/import[?use=1]: check an orders CSV, or make it this session's data. Admins only (ticket 35, ADR 0012 §1). */
export const POST = withApiRole("import", (request, context) =>
  handleImport(request, context, { store: importStore(), limiter: importLimiter(), log: (line) => console.info(line), now: Date.now }),
);

/**
 * DELETE /api/import: back to the original data. Any signed-in session may drop its own import, so a role
 * changed since importing is never stuck on it; reading the dashboards is all it takes.
 */
export const DELETE = withApiRole("dashboards", (request, context) => handleClearImport(request, context, importStore()));
