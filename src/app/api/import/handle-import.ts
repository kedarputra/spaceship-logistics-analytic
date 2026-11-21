import type { ImportCheck } from "@/components/import-result";
import { dashboardKpis } from "@/domain/definitions";
import { datasetOf, validateOrders } from "@/domain/orders";
import type { RouteContext } from "../../auth";
import type { ImportStore } from "../../import-store";
import { errorResponse } from "../body";
import { CROSS_SITE, sameOrigin } from "../origin";
import { slidingWindow } from "../rate-limit";
import { readCsvUpload } from "./read-upload";

/** The problems a check answers with; the rest are counted. */
export const MAX_SHOWN_PROBLEMS = 100;

/**
 * POST /api/import (ticket 35, ADR 0013): an admin's CSV, checked against the import rules, and with
 * `?use=1` made the session's active dataset. The body is the file itself, its name in X-File-Name.
 *
 * - From a page of this site only. At most 10 checks and 10 imports an hour per user, so checking a
 *   file and using it is one of each.
 * - Only a .csv sent as text/csv or text/plain, read as UTF-8 within 5 MB and 20,000 rows.
 * - A check answers with the row count, the problems (the first 100) and, for a clean file, the five
 *   KPIs and the anchor date it would show. Using a file checks it again and keeps it all or not at
 *   all: a file with any problem is never imported in part.
 * - The upload stays in memory: it is never written to disk, and the one log line holds only its size,
 *   its rows and its problem count.
 */

export const PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;
const MAX_FILE_NAME = 100;

export const NO_SESSION_ID = "This session began before imports existed. Sign out and in again to import.";
export const ONLY_CSV = "Only a .csv file, sent as text/csv or text/plain, can be imported.";
export const NOT_IMPORTED = "The file has problems, so nothing was imported.";

/** A check reads a file; an import makes it the session's data. Each has its own hourly count. */
export type UploadKind = "check" | "import";

export interface ImportLimiter {
  /** Counts an upload of `kind` by `username` at `now`, or refuses it without counting it. */
  take(username: string, kind: UploadKind, now: number): { allowed: true } | { allowed: false; retryAfterSeconds: number };
}

export function createImportLimiter(): ImportLimiter {
  const window = slidingWindow(PER_HOUR, HOUR_MS);
  return {
    take(username, kind, now) {
      const key = JSON.stringify([kind, username]);
      const wait = window.waitMs(key, now);
      if (wait > 0) return { allowed: false, retryAfterSeconds: Math.ceil(wait / 1000) };
      window.record(key, now);
      return { allowed: true };
    },
  };
}

declare global {
  // On globalThis, as the API limiter is, so a second bundle of this module shares the counts.
  var spaceshipImportLimiter: ImportLimiter | undefined;
}

export function importLimiter(): ImportLimiter {
  globalThis.spaceshipImportLimiter ??= createImportLimiter();
  return globalThis.spaceshipImportLimiter;
}

export interface ImportDependencies {
  store: ImportStore;
  limiter: ImportLimiter;
  /** Where the one line per upload goes: its size, rows and problem count, never its content or name. */
  log: (line: string) => void;
  now: () => number;
}

/** The uploaded file's name as the page will show it: no path, no control characters, at most 100 characters. */
export function uploadedFileName(header: string | null): string | undefined {
  if (header === null) return undefined;
  let name: string;
  try {
    name = decodeURIComponent(header);
  } catch {
    return undefined;
  }
  const base = (name.split(/[\\/]/).at(-1) ?? "").replace(/\p{Cc}/gu, "").trim();
  return base === "" ? undefined : base.slice(0, MAX_FILE_NAME);
}

/** text/csv or text/plain, whatever their parameters. */
function isCsvType(contentType: string | null): boolean {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  return type === "text/csv" || type === "text/plain";
}

function minutes(seconds: number): string {
  const count = Math.max(1, Math.ceil(seconds / 60));
  return `${count} ${count === 1 ? "minute" : "minutes"}`;
}

export async function handleImport(request: Request, { user, session }: Pick<RouteContext, "user" | "session">, dependencies: ImportDependencies): Promise<Response> {
  if (!sameOrigin(request.headers)) return errorResponse(403, CROSS_SITE);
  const use = new URL(request.url).searchParams.get("use") === "1";
  // A check needs no session ID; keeping an import does, since that is what it is kept under.
  const { sessionId } = session;
  if (use && sessionId === undefined) return errorResponse(409, NO_SESSION_ID);

  const fileName = uploadedFileName(request.headers.get("x-file-name"));
  if (fileName === undefined || !fileName.toLowerCase().endsWith(".csv") || !isCsvType(request.headers.get("content-type"))) {
    return errorResponse(415, ONLY_CSV);
  }

  // Counted before the body is read, so uploads sent at once cannot slip past the limit.
  const decision = dependencies.limiter.take(user.username, use ? "import" : "check", dependencies.now());
  if (!decision.allowed) {
    const seconds = decision.retryAfterSeconds;
    return Response.json(
      { error: `At most ${PER_HOUR} ${use ? "imports" : "checks"} an hour. Try again in ${minutes(seconds)}.` },
      { status: 429, headers: { "retry-after": String(seconds) } },
    );
  }

  const read = await readCsvUpload(request);
  if (!read.ok) return errorResponse(read.status, read.error);

  const { rows, orders, problems } = validateOrders(read.text);
  dependencies.log(`Import ${use ? "used" : "checked"}: ${read.bytes} bytes, ${rows} rows, ${problems.length} problems.`);

  const check: ImportCheck = { fileName, rows, problemCount: problems.length, problems: problems.slice(0, MAX_SHOWN_PROBLEMS) };
  if (problems.length > 0) return use ? Response.json({ error: NOT_IMPORTED, ...check }, { status: 422 }) : Response.json(check);

  const dataset = datasetOf(orders, { csv: read.text, fileName, imported: true });
  if (sessionId === undefined || !use) return Response.json({ ...check, preview: { anchor: dataset.anchor, kpis: dashboardKpis(orders) } });
  dependencies.store.put(sessionId, dataset, session.expires);
  return Response.json({ used: true, fileName, rows, anchor: dataset.anchor });
}

/** DELETE /api/import: back to the original data. The session's import is dropped; any other session's stays. */
export function handleClearImport(request: Request, { session }: Pick<RouteContext, "session">, store: ImportStore): Response {
  if (!sameOrigin(request.headers)) return errorResponse(403, CROSS_SITE);
  if (session.sessionId !== undefined) store.remove(session.sessionId);
  return Response.json({ cleared: true });
}
