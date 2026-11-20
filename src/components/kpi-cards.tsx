import { type DashboardKpis, KPI_DEFINITIONS } from "@/domain/definitions";
import { formatCount, formatDays, formatFraction, formatPercent } from "@/domain/format";

interface KpiCardProps {
  label: string;
  value: string;
  /** Shown right after the value, as in "82.2% · 304 / 370". */
  fraction?: string;
  /** The breakdown, on its own line below the value. */
  detail?: string;
  definition: string;
}

function KpiCard({ label, value, fraction, detail, definition }: KpiCardProps) {
  return (
    <li className="flex flex-col rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-600">{label}</h2>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {value}
        {fraction === undefined ? null : (
          <span className="whitespace-nowrap text-base font-normal text-slate-600">{` · ${fraction}`}</span>
        )}
      </p>
      {detail === undefined ? null : <p className="mt-1 text-sm text-slate-700 tabular-nums">{detail}</p>}
      <p className="mt-auto pt-3 text-xs text-slate-500">{definition}</p>
    </li>
  );
}

/** The five KPI cards of R1. Shows the computed KPIs; computes nothing itself. */
export function KpiCards({ kpis }: { kpis: DashboardKpis }) {
  const { totalOrders, deliveredOrders, delayedOrders, onTimeRate, averageDeliveryDays } = kpis;
  return (
    <section aria-label="Key figures">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          {...KPI_DEFINITIONS.totalOrders}
          value={formatCount(totalOrders.count)}
          detail={`${formatCount(totalOrders.inTransit)} in transit · ${formatCount(totalOrders.canceled)} canceled`}
        />
        <KpiCard
          {...KPI_DEFINITIONS.deliveredOrders}
          value={formatCount(deliveredOrders.count)}
          detail={[
            `${formatCount(deliveredOrders.onTime)} on time`,
            `${formatCount(deliveredOrders.delayed)} delayed`,
            `${formatCount(deliveredOrders.exception)} exception`,
          ].join(" · ")}
        />
        <KpiCard {...KPI_DEFINITIONS.delayedOrders} value={formatCount(delayedOrders)} />
        <KpiCard
          {...KPI_DEFINITIONS.onTimeRate}
          value={formatPercent(onTimeRate.value)}
          fraction={formatFraction(onTimeRate)}
        />
        <KpiCard {...KPI_DEFINITIONS.averageDeliveryDays} value={formatDays(averageDeliveryDays.value)} />
      </ul>
    </section>
  );
}
