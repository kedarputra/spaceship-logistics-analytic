import { CardTitle } from "./card-title";
import type { HistoryEntry } from "./history";

/** "20 Nov, 14:32" in the viewer's own time zone. */
function formatAskedAt(askedAt: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(askedAt));
}

/**
 * The question history (B1, ADR 0008 §1) beside the answer: newest first, each a button that re-runs
 * its saved spec. Where it is kept and how a re-run works is in its info popover (ticket 30).
 */
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
    <section aria-labelledby="recent-title" className="card flex flex-col gap-1 px-[18px] py-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <CardTitle id="recent-title" title="Recent questions" info={["Kept in this browser only. A re-run uses the saved spec, without the AI."]} />
        <button type="button" onClick={onClear} className="min-h-[34px] text-note text-muted underline hover:text-ink">
          Clear history
        </button>
      </div>
      <ul className="max-h-80 overflow-y-auto">
        {entries.map((entry) => (
          <li key={`${entry.askedAt}-${entry.question}`} className="border-t border-grid">
            <button type="button" onClick={() => onRerun(entry)} className="flex w-full flex-col gap-0.5 py-2 text-left hover:text-green-text">
              <span className="text-small">{entry.question}</span>
              <time dateTime={entry.askedAt} className="text-note text-muted">
                {formatAskedAt(entry.askedAt)}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
