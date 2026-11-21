import type { ActiveDataset } from "@/domain/orders";

/**
 * The imported datasets (ticket 35, ADR 0013): in this server's memory only, each under the random
 * session ID of the session that imported it, and never written anywhere. One goes away when its
 * session signs out or goes back to the original data, 2 hours after it was made (sooner if its session
 * ends first), when a fourth import needs its place, or when the server restarts.
 */

export const MAX_IMPORTS = 3;
export const IMPORT_LIFETIME_MS = 2 * 60 * 60 * 1000;

export interface ImportStore {
  /** The session's import, while it lasts. */
  get(sessionId: string): ActiveDataset | undefined;
  /**
   * Makes `dataset` the session's import, in place of any it had, until 2 hours from now or the
   * session's end (`sessionExpires`, ms), whichever comes first. A fourth session's import evicts the oldest.
   */
  put(sessionId: string, dataset: ActiveDataset, sessionExpires: number): void;
  remove(sessionId: string): void;
  /** How many imports are kept now, the expired left out. */
  size(): number;
}

export function createImportStore(): ImportStore {
  // In the order they were made, oldest first.
  const imports = new Map<string, { dataset: ActiveDataset; expires: number }>();

  function dropExpired(now: number): void {
    for (const [sessionId, entry] of imports) if (entry.expires <= now) imports.delete(sessionId);
  }

  return {
    get(sessionId) {
      dropExpired(Date.now());
      return imports.get(sessionId)?.dataset;
    },
    put(sessionId, dataset, sessionExpires) {
      const now = Date.now();
      dropExpired(now);
      imports.delete(sessionId);
      while (imports.size >= MAX_IMPORTS) {
        const oldest = imports.keys().next();
        if (oldest.done) break;
        imports.delete(oldest.value);
      }
      imports.set(sessionId, { dataset, expires: Math.min(now + IMPORT_LIFETIME_MS, sessionExpires) });
    },
    remove(sessionId) {
      imports.delete(sessionId);
    },
    size() {
      dropExpired(Date.now());
      return imports.size;
    },
  };
}

declare global {
  // On globalThis, as the rate limiter is: the import route and every page must share one store even
  // when the server bundles this module more than once. Still one store per process.
  var spaceshipImports: ImportStore | undefined;
}

/** The server process's one store. */
export function importStore(): ImportStore {
  globalThis.spaceshipImports ??= createImportStore();
  return globalThis.spaceshipImports;
}
