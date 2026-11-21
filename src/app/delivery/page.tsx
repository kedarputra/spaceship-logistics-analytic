import { ordersLink } from "@/components/card-link";
import { CardPair } from "@/components/card-pair";
import { TIME_BY_PLACE_ID } from "@/components/delivery-anchors";
import { ChartCard } from "@/components/chart-card";
import { DaysFigure, FigureCard } from "@/components/figure-card";
import { OutcomesChartCard } from "@/components/outcomes-chart-card";
import { PageHeader } from "@/components/page-header";
import { type RankedBar, RankedBars } from "@/components/ranked-bars";
import { OnTimeLineCard } from "@/components/rate-line";
import { dashboardKpis, deliveryOutcomesOverTime, exceptionRate, METRIC_STATUSES, METRICS } from "@/domain/definitions";
import { formatCount, formatDays, formatOf, formatPercent } from "@/domain/format";
import { getDataset } from "@/domain/orders";
import { dataPeriod, formatPeriod } from "@/domain/periods";
import { queryResult } from "../query-result";

// Rendered per request from the dataset this server instance loaded, like the Overview.
export const dynamic = "force-dynamic";

/** Average delivery time per region or warehouse, slowest first, each with n and its on-time rate, opening its delivered orders. */
function placeBars(groupBy: "region" | "warehouse"): RankedBar[] {
  const times = queryResult({ metric: "average_delivery_time", groupBy, sort: "desc" });
  const onTime = new Map(queryResult({ metric: "on_time_rate", groupBy }).rows.map((row) => [row.key, row]));
  return times.rows.map((row) => {
    // Every place with a delivery time has an on-time rate: both are over the same delivered orders.
    const rate = onTime.get(row.key);
    if (rate === undefined) throw new Error(`No on-time rate for ${row.label}`);
    return {
      label: row.label,
      value: row.value,
      valueText: formatDays(row.value),
      detail: `n=${formatCount(row.n)} · ${formatPercent(rate.value)} on time`,
      link: ordersLink(row.n, "delivered orders", { status: METRIC_STATUSES.average_delivery_time, [groupBy]: [row.key] }),
    };
  });
}

/**
 * Delivery (ADR 0011 §5, ticket 25): how the delivered orders arrived. Every figure is computed by the
 * definitions and the query tool. Each card and bar opens the orders behind it in Raw data (ticket 29).
 */
export default function DeliveryPage() {
  const { orders, anchor } = getDataset();
  const period = dataPeriod(orders);
  const dates = formatPeriod(period);
  const kpis = dashboardKpis(orders);
  const { totalOrders, deliveredOrders, delayedOrders, onTimeRate, averageDeliveryDays } = kpis;
  const exceptions = exceptionRate(orders);
  const onTimeByMonth = queryResult({ metric: "on_time_rate", groupBy: "month" });
  const deliveredByMonth = queryResult({ metric: "delivered_orders", groupBy: "month" }).rows;

  return (
    <>
      <PageHeader label="Delivery" title="Delivery" asOf={anchor} />
      <section aria-label="Delivery figures">
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,168px),1fr))] gap-3">
          <FigureCard
            label="Delivered orders"
            info={[METRICS.delivered_orders.definition]}
            link={ordersLink(deliveredOrders.count, "orders", { status: METRIC_STATUSES.delivered_orders })}
            value={formatCount(deliveredOrders.count)}
            detail={`of ${formatCount(totalOrders.count)} orders · ${formatCount(totalOrders.notDelivered)} not delivered: ${formatCount(totalOrders.inTransit)} in transit, ${formatCount(totalOrders.canceled)} canceled`}
          />
          <FigureCard
            label="On-time delivery rate"
            info={[METRICS.on_time_rate.definition]}
            link={ordersLink(onTimeRate.numerator, "on-time orders", { status: METRIC_STATUSES.on_time_deliveries })}
            value={formatPercent(onTimeRate.value)}
            detail={`${formatOf(onTimeRate)} delivered`}
          />
          <FigureCard
            label="Delay rate"
            info={[METRICS.delay_rate.definition]}
            link={ordersLink(delayedOrders.delayRate.numerator, "delayed orders", { status: METRIC_STATUSES.delayed_orders })}
            value={formatPercent(delayedOrders.delayRate.value)}
            detail={`${formatOf(delayedOrders.delayRate)} delivered`}
          />
          <FigureCard
            label="Exceptions"
            info={[METRICS.exception_orders.definition]}
            link={ordersLink(exceptions.numerator, "orders", { status: METRIC_STATUSES.exception_orders })}
            value={formatCount(exceptions.numerator)}
            detail={`${formatPercent(exceptions.value)} of delivered`}
          />
          <FigureCard
            label="Average delivery time"
            info={[METRICS.average_delivery_time.definition]}
            link={ordersLink(averageDeliveryDays.denominator, "orders, slowest first", { status: METRIC_STATUSES.average_delivery_time }, { column: "delivery_days", direction: "desc" })}
            value={<DaysFigure days={averageDeliveryDays.value} />}
          />
        </ul>
      </section>
      <CardPair label="Delivery over time">
        <OutcomesChartCard months={deliveryOutcomesOverTime(orders, period, "month")} deliveredByMonth={deliveredByMonth} delivered={deliveredOrders} dates={dates} />
        <OnTimeLineCard result={onTimeByMonth} />
      </CardPair>
      <CardPair label="Delivery time by place" id={TIME_BY_PLACE_ID}>
        <ChartCard id="regions-title" title="Average delivery time by region" info={["Days from order to delivery · slowest first"]}>
          <RankedBars tone="green" bars={placeBars("region")} />
        </ChartCard>
        <ChartCard id="warehouses-title" title="Average delivery time by warehouse" info={["Days from order to delivery · slowest first"]}>
          <RankedBars tone="green" bars={placeBars("warehouse")} />
        </ChartCard>
      </CardPair>
    </>
  );
}
