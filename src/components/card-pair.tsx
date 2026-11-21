import type { ReactNode } from "react";

/** Two cards side by side, stacking when there is no room for both at 440 px. `id` lets a link open the page at them. */
export function CardPair({ label, id, children }: { label: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={label} className="grid scroll-mt-6 grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4">
      {children}
    </section>
  );
}
