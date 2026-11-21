import type { ReactNode } from "react";
import type { AbcClass } from "@/domain/definitions";

/** Each class's mark as a class name; palette.ts holds the same colours for Recharts (ABC_MARKS). */
const FILLS: Record<AbcClass, string> = { A: "bg-mark-on-time", B: "bg-mark-delayed", C: "bg-mark-exception" };

/**
 * An ABC class as its letter beside a swatch of its colour, so a class is never told by colour alone
 * (ticket 33). `children` names it in more words, such as "Class A".
 */
export function ClassMark({ abcClass, children }: { abcClass: AbcClass; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-[3px] ${FILLS[abcClass]}`} />
      {children ?? abcClass}
    </span>
  );
}
