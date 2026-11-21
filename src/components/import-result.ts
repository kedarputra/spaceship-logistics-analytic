import type { DashboardKpis } from "@/domain/definitions";
import type { OrderProblem } from "@/domain/orders";

/**
 * What POST /api/import answers a check with (ticket 35), shared by the route and the page that shows
 * it. No runtime imports, so the browser can use it.
 */
export interface ImportCheck {
  fileName: string;
  /** The rows under the header. */
  rows: number;
  problemCount: number;
  /** The first 100 problems, in file order. */
  problems: OrderProblem[];
  /** For a clean file: the five KPIs the Overview would show on it, and its anchor date. */
  preview?: { anchor: string; kpis: DashboardKpis };
}

/** A problem's row as the table shows it: the spreadsheet's row number, or "File" for the file as a whole. */
export function problemRow(problem: OrderProblem): string {
  return problem.row === null ? "File" : String(problem.row);
}

/** "and 340 more", under a table that shows only the first problems; nothing when it shows all. */
export function moreProblems(check: Pick<ImportCheck, "problemCount" | "problems">): string | undefined {
  const more = check.problemCount - check.problems.length;
  return more > 0 ? `and ${more.toLocaleString("en-US")} more` : undefined;
}
