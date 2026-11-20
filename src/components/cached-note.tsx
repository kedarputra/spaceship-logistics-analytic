/**
 * The "cached" marker (B1, ADR 0008 §1): the server's question cache served this answer. It claims
 * no more than that: a cache hit whose sentence was not kept is phrased again by the model.
 */
export function CachedNote({ cached }: { cached?: boolean }) {
  if (cached !== true) return null;
  return (
    <p className="mt-1 text-xs text-slate-500">
      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">Cached</span> Served from the server&apos;s cache of
      earlier questions.
    </p>
  );
}
