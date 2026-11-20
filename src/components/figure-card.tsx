import type { ReactNode } from "react";
import { formatDays, formatDecimal } from "@/domain/format";

/** A figure with its label above and a line of detail below: the Delivery KPIs, the Carriers highlights (ticket 25). */
export function FigureCard({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
  return (
    <li className="card flex flex-col gap-1.5 p-4">
      <h2 className="text-small font-semibold text-ink-2">{label}</h2>
      <p className="text-kpi">{value}</p>
      <p className="text-small text-muted">{detail}</p>
    </li>
  );
}

/** Days as a figure: "3.8" large, "days" smaller beside it, or "n/a". */
export function DaysFigure({ days }: { days: number | null }) {
  if (days === null) return formatDays(null);
  return (
    <>
      {formatDecimal(days)} <span className="text-unit text-ink-2">days</span>
    </>
  );
}
