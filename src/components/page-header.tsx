import type { ReactNode } from "react";

/** A page's header (ADR 0011 §5): a label, the title, one sentence, and on the right any chips. */
export function PageHeader({ label, title, description, children }: { label: string; title: string; description: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex flex-col gap-1">
        <span className="text-label text-muted uppercase">{label}</span>
        <h1 className="text-title text-balance">{title}</h1>
        <p className="max-w-[70ch] text-muted">{description}</p>
      </div>
      {children === undefined ? null : <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}
