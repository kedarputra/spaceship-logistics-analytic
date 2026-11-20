import type { HistoryEntry } from "./history";

/** "20 Nov, 14:32" in the viewer's own time zone. */
function formatAskedAt(askedAt: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(askedAt));
}

/** The question history (B1, ADR 0008 §1): newest first, each a button that re-runs its saved spec. */
export function HistoryList({
  entries,
  onRerun,
  onClear,
}: {
  entries: readonly HistoryEntry[];
  onRerun: (entry: HistoryEntry) => void;
  onClear: () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="mt-4" aria-label="Recent questions">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-slate-700">Recent questions</h2>
        <button type="button" onClick={onClear} className="text-xs text-slate-500 underline hover:text-slate-700">
          Clear history
        </button>
      </div>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {entries.map((entry) => (
          <li key={`${entry.askedAt}-${entry.question}`}>
            <button
              type="button"
              onClick={() => onRerun(entry)}
              className="flex w-full justify-between gap-3 rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
            >
              <span className="truncate">{entry.question}</span>
              <time dateTime={entry.askedAt} className="shrink-0 text-xs text-slate-500">
                {formatAskedAt(entry.askedAt)}
              </time>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-slate-500">Kept in this browser only. A re-run uses the saved spec, without the AI.</p>
    </section>
  );
}
