import type { ReactNode } from "react";

/** A chart's legend: its items in a wrapping row, each a swatch beside its words. */
export function Legend({ children }: { children: ReactNode }) {
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-ink-2">
      {children}
    </ul>
  );
}
