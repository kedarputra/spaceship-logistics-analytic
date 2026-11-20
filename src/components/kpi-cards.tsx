import type { ReactNode } from "react";
import { type DashboardKpis, KPI_DEFINITIONS } from "@/domain/definitions";
import { formatCount, formatDays, formatDecimal, formatFraction, formatPercent } from "@/domain/format";
import { Icon, type IconName } from "./icons";
import { Marked } from "./marked";
import { OUTCOME_SERIES, type Tone } from "./series";

interface KpiCardProps {
  label: string;
  definition: string;
  icon: IconName;
  /** Amber for the delayed card; green, on a sage tint, for the rest. */
  tone?: Tone;
  value: ReactNode;
  /** The breakdown or the rate's parts, below the figure. */
  detail: ReactNode;
}

function KpiCard({ label, definition, icon, tone = "green", value, detail }: KpiCardProps) {
  return (
    <li className="card flex flex-col gap-1.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-small font-semibold text-ink-2">{label}</h2>
        <span className={`grid size-7 place-items-center rounded-small ${tone === "amber" ? "bg-warn-tint text-warn-icon" : "bg-chip text-grey-green"}`}>
          <Icon name={icon} size={15} strokeWidth={1.9} />
        </span>
      </div>
      <p className="text-kpi">{value}</p>
      <div className="text-small text-ink-2">{detail}</div>
      <p className="mt-1.5 border-t border-grid pt-2.5 text-note text-muted">{definition}</p>
    </li>
  );
}

/** The five KPI cards of R1 (ADR 0011 §6). Shows the computed KPIs; computes nothing itself. */
export function KpiCards({ kpis }: { kpis: DashboardKpis }) {
  const { totalOrders, deliveredOrders, delayedOrders, onTimeRate, averageDeliveryDays } = kpis;
  const onTimeShare = onTimeRate.value === null ? 0 : onTimeRate.value * 100;
  return (
    <section aria-label="Key figures">
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,168px),1fr))] gap-3">
        <KpiCard
          {...KPI_DEFINITIONS.totalOrders}
          icon="box"
          value={formatCount(totalOrders.count)}
          detail={`${formatCount(totalOrders.inTransit)} in transit · ${formatCount(totalOrders.canceled)} canceled`}
        />
        <KpiCard
          {...KPI_DEFINITIONS.deliveredOrders}
          icon="truck"
          value={formatCount(deliveredOrders.count)}
          detail={
            <span className="flex flex-wrap gap-x-2.5 gap-y-1">
              {OUTCOME_SERIES.map(({ key, label, mark }) => (
                <Marked key={key} mark={mark}>{`${formatCount(deliveredOrders[key])} ${label.toLowerCase()}`}</Marked>
              ))}
            </span>
          }
        />
        <KpiCard
          {...KPI_DEFINITIONS.delayedOrders}
          icon="clock"
          tone="amber"
          value={formatCount(delayedOrders.count)}
          detail={`Delay rate ${formatPercent(delayedOrders.delayRate.value)} · ${formatFraction(delayedOrders.delayRate)}`}
        />
        <KpiCard
          {...KPI_DEFINITIONS.onTimeRate}
          icon="target"
          value={formatPercent(onTimeRate.value)}
          detail={
            <span className="flex items-center gap-2.5">
              <span
                role="img"
                aria-label={`${formatPercent(onTimeRate.value)} of delivered orders on time`}
                className="h-1.5 flex-auto rounded-mark bg-track"
              >
                <span className="block h-full rounded-mark bg-mark-on-time" style={{ width: `${onTimeShare}%` }} />
              </span>
              {formatFraction(onTimeRate)}
            </span>
          }
        />
        <KpiCard
          {...KPI_DEFINITIONS.averageDeliveryDays}
          icon="calendar"
          value={
            averageDeliveryDays.value === null ? (
              formatDays(null)
            ) : (
              <>
                {formatDecimal(averageDeliveryDays.value)} <span className="text-unit text-ink-2">days</span>
              </>
            )
          }
          detail="Order date to delivery date"
        />
      </ul>
    </section>
  );
}
