import type { ReactNode } from "react";

/** The narrowest each card may be before the pair stacks: wider for tables that need more room (ticket 34). */
const COLUMNS = {
  440: "grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))]",
  580: "grid-cols-[repeat(auto-fit,minmax(min(100%,580px),1fr))]",
} as const;

/** Two cards side by side, stacking when there is no room for both at 440 px (or `minWidth`). `id` lets a link open the page at them. */
export function CardPair({ label, id, minWidth = 440, children }: { label: string; id?: string; minWidth?: keyof typeof COLUMNS; children: ReactNode }) {
  return (
    <section id={id} aria-label={label} className={`grid scroll-mt-6 gap-4 ${COLUMNS[minWidth]}`}>
      {children}
    </section>
  );
}
