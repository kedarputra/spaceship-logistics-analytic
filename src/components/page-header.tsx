import type { ReactNode } from "react";
import { formatDate } from "@/domain/periods";
import { Icon } from "./icons";

/**
 * A page's header (ADR 0011 §5): a label, the title, and on the right the data's date and any chips.
 * No sentence under the title (ticket 30). The date is what makes "last month" true (ADR 0002), so
 * every page shows it once, here.
 */
export function PageHeader({ label, title, asOf, children }: { label: string; title: string; asOf: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex flex-col gap-1">
        <span className="text-label text-muted uppercase">{label}</span>
        <h1 className="text-title text-balance">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-panel px-3 text-small text-ink-2">
          <Icon name="calendar" size={15} className="text-grey-green" />
          {`Data as of ${formatDate(asOf)}`}
        </span>
        {children}
      </div>
    </header>
  );
}
