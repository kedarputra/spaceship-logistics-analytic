import type { ReactNode } from "react";
import { type DashboardKpis, KPI_DEFINITIONS, METRIC_STATUSES } from "@/domain/definitions";
import { formatCount, formatFraction, formatPercent } from "@/domain/format";
import { CardBox, type CardLink, ordersLink } from "./card-link";
import { ON_TIME_BY_MONTH_ID, TIME_BY_PLACE_ID } from "./delivery-anchors";
import { DaysFigure, FigureLabel } from "./figure-card";
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
  /** The breakdown or the rate's parts, below the figure, if it has any. */
  detail?: ReactNode;
  /** What explains the figure (ticket 29): its orders in Raw data, or the page that breaks it down. None for a count of 0. */
  link: CardLink | undefined;
}

function KpiCard({ label, definition, icon, tone = "green", value, detail, link }: KpiCardProps) {
  return (
    <li>
      <CardBox name={label} link={link} className="card flex flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <FigureLabel label={label} info={[definition]} />
          <span className={`grid size-7 shrink-0 place-items-center rounded-small ${tone === "amber" ? "bg-warn-tint text-warn-icon" : "bg-chip text-grey-green"}`}>
            <Icon name={icon} size={15} strokeWidth={1.9} />
          </span>
        </div>
        <p className="text-kpi">{value}</p>
        {detail === undefined ? null : <div className="text-small text-ink-2">{detail}</div>}
      </CardBox>
    </li>
  );
}

/**
 * The five KPI cards of R1 (ADR 0011 §6). Shows the computed KPIs; computes nothing itself. Each
 * definition is in the info popover after its label (ticket 30). A count
 * opens its orders in Raw data; a rate or an average, which has no orders of its own to show, opens
 * the Delivery page where it is broken down (ticket 29).
 */
export function KpiCards({ kpis, linked = true }: { kpis: DashboardKpis; linked?: boolean }) {
  const { totalOrders, deliveredOrders, delayedOrders, onTimeRate, averageDeliveryDays } = kpis;
  // Import's preview (ticket 35) shows a file not yet in use, so its cards open nothing.
  const linkTo = (link: CardLink | undefined) => (linked ? link : undefined);
  const onTimeShare = onTimeRate.value === null ? 0 : onTimeRate.value * 100;
  return (
    <section aria-label="Key figures">
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,168px),1fr))] gap-3">
        <KpiCard
          {...KPI_DEFINITIONS.totalOrders}
          icon="box"
          link={linkTo(ordersLink(totalOrders.count, "orders", {}))}
          value={formatCount(totalOrders.count)}
          detail={`${formatCount(totalOrders.inTransit)} in transit · ${formatCount(totalOrders.canceled)} canceled`}
        />
        <KpiCard
          {...KPI_DEFINITIONS.deliveredOrders}
          icon="truck"
          link={linkTo(ordersLink(deliveredOrders.count, "orders", { status: METRIC_STATUSES.delivered_orders }))}
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
          link={linkTo(ordersLink(delayedOrders.count, "orders", { status: METRIC_STATUSES.delayed_orders }))}
          value={formatCount(delayedOrders.count)}
          detail={
            <>
              {`Delay rate ${formatPercent(delayedOrders.delayRate.value)} · `}
              <span className="whitespace-nowrap">{formatFraction(delayedOrders.delayRate)}</span>
            </>
          }
        />
        <KpiCard
          {...KPI_DEFINITIONS.onTimeRate}
          icon="target"
          link={linkTo({ href: `/delivery#${ON_TIME_BY_MONTH_ID}`, text: "View the rate by month" })}
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
          link={linkTo({ href: `/delivery#${TIME_BY_PLACE_ID}`, text: "View the times by region and warehouse" })}
          value={<DaysFigure days={averageDeliveryDays.value} />}
        />
      </ul>
    </section>
  );
}
