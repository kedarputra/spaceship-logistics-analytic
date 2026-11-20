import type { ReactNode } from "react";

/** Two cards side by side, stacking when there is no room for both at 440 px. */
export function CardPair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4">
      {children}
    </section>
  );
}
