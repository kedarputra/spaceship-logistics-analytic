/**
 * The "cached" marker (B1, ADR 0008 §1): the server's question cache served this answer. It claims
 * no more than that: a cache hit whose sentence was not kept is phrased again by the model.
 */
export function CachedNote({ cached }: { cached?: boolean }) {
  if (cached !== true) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-muted">
      <span className="pill bg-track text-ink-2">Cached</span>
      Served from the server&apos;s cache of earlier questions.
    </span>
  );
}
