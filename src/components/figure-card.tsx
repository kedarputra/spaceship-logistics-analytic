import type { ReactNode } from "react";
import { formatDays, formatDecimal } from "@/domain/format";
import { CardBox, type CardLink } from "./card-link";
import { InfoButton } from "./info-button";

/**
 * A figure's label, and after it the info button with its definition (ticket 30). Where cards stand
 * side by side the label keeps two lines' room, so their figures line up whether it wraps or not.
 */
export function FigureLabel({ label, info }: { label: string; info: readonly string[] }) {
  return (
    <div className="flex items-start gap-1">
      <h2 className="text-small font-semibold text-ink-2 sm:min-h-[2lh]">{label}</h2>
      <InfoButton title={label} lines={info} />
    </div>
  );
}

/**
 * A figure with its label above and a line of detail below: the Delivery KPIs, the Carriers highlights
 * (ticket 25). With a link, the card opens what explains it (ticket 29). The definition is in the info
 * popover after the label, not under the figure (ticket 30).
 */
export function FigureCard({ label, info, value, detail, link }: { label: string; info: readonly string[]; value: ReactNode; detail?: ReactNode; link?: CardLink }) {
  return (
    <li>
      <CardBox name={label} link={link} className="card flex flex-col gap-1.5 p-4">
        <FigureLabel label={label} info={info} />
        <p className="text-kpi">{value}</p>
        {detail === undefined ? null : <p className="text-small text-muted">{detail}</p>}
      </CardBox>
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
