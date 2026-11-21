import { Fact } from "./text-table";

/**
 * The "Cached" marker (B1, ADR 0008 §1): the server's question cache served this answer. It claims
 * no more than that: a cache hit whose sentence was not kept is phrased again by the model. The pill
 * is on the answer; what it means is in How this was computed (ticket 30).
 */
export function CachedNote({ cached }: { cached?: boolean }) {
  if (cached !== true) return null;
  return <span className="pill bg-track text-ink-2">Cached</span>;
}

/** The explanation panel's line for a cached answer. */
export function CachedFact({ cached }: { cached?: boolean }) {
  if (cached !== true) return null;
  return <Fact term="Cache">Served from the server&apos;s cache of earlier questions.</Fact>;
}
