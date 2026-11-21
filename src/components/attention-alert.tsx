import Link from "next/link";
import { countOf } from "@/tools/words";
import { Icon } from "./icons";

/**
 * The Overview's alert (ticket 32): one line on an amber tint, with a warning icon and words, never the
 * colour alone (ADR 0011), when orders are overdue in transit. The whole line opens Needs attention.
 * Nothing when none are, or when nothing has been delivered to compare with.
 */
export function AttentionAlert({ overdue, longest }: { overdue: number; longest: number | null }) {
  if (overdue === 0 || longest === null) return null;
  return (
    <Link
      href="/attention"
      className="group flex items-center gap-2.5 rounded-inset border border-warn-line bg-warn-tint px-3.5 py-2.5 text-small font-semibold text-warn-ink no-underline hover:border-warn-icon hover:text-warn-ink"
    >
      <Icon name="alert" size={17} className="shrink-0 text-warn-icon" />
      <span>{`${countOf(overdue, "order")} in transit longer than any completed delivery (${countOf(longest, "day")})`}</span>
      <Icon name="arrow" size={14} strokeWidth={2} className="ml-auto shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
