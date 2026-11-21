import { LiveAiStatusPill } from "@/components/ai-status";
import { AskBox } from "@/components/ask-box";
import { CardPair } from "@/components/card-pair";
import { CarrierCard } from "@/components/carrier-card";
import { ChartCard } from "@/components/chart-card";
import { ForecastSummary } from "@/components/forecast-summary";
import { KpiCards } from "@/components/kpi-cards";
import { OrderBars } from "@/components/month-charts";
import { OutcomesChartCard } from "@/components/outcomes-chart-card";
import { PageHeader } from "@/components/page-header";
import { OVERVIEW_QUESTIONS } from "@/components/suggested-questions";
import { dashboardKpis, deliveryOutcomesOverTime, orderCountOverTime } from "@/domain/definitions";
import { formatCount } from "@/domain/format";
import { getDataset } from "@/domain/orders";
import { dataPeriod, formatPeriod } from "@/domain/periods";
import { answerForecast } from "@/tools/forecast-answer";
import { forecastSpecSchema } from "@/tools/spec";
import { queryResult } from "./query-result";

// Rendered per request from the dataset this server instance loaded, like /api/health.
export const dynamic = "force-dynamic";

/** The Overview (ADR 0011 §5): a summary of the data that links to the Ask page and the detail pages. Every figure is computed. */
export default function OverviewPage() {
  const { orders, anchor } = getDataset();
  const period = dataPeriod(orders);
  const kpis = dashboardKpis(orders);
  const ordersPerMonth = orderCountOverTime(orders, period, "month");
  const outcomesPerMonth = deliveryOutcomesOverTime(orders, period, "month");
  // The same query "What is the delay rate by carrier?" runs, over all the data.
  const carriers = queryResult({ metric: "delay_rate", groupBy: "carrier", sort: "desc" });
  const deliveredByMonth = queryResult({ metric: "delivered_orders", groupBy: "month" }).rows;
  const forecast = answerForecast(forecastSpecSchema.parse({ tool: "forecast", scope: { type: "total" } }));
  if (forecast.kind !== "forecast") throw new Error(forecast.message);
  const dates = formatPeriod(period);

  return (
    <>
      <PageHeader label="Logistics analytics" title="Overview" asOf={anchor}>
        <LiveAiStatusPill />
      </PageHeader>
      <AskBox questions={OVERVIEW_QUESTIONS} />
      <KpiCards kpis={kpis} />
      <CardPair label="Orders and delivery outcomes">
        <ChartCard
          title="Orders per month"
          info={[`By order date · ${dates} · ${formatCount(kpis.totalOrders.count)} orders`]}
          table={{ headers: ["Month", "Orders"], rows: ordersPerMonth.map(({ bucket, value }) => [bucket.label, formatCount(value)]) }}
        >
          <OrderBars months={ordersPerMonth} />
        </ChartCard>
        <OutcomesChartCard months={outcomesPerMonth} deliveredByMonth={deliveredByMonth} delivered={kpis.deliveredOrders} dates={dates} link={{ href: "/delivery", label: "Delivery details" }} />
      </CardPair>
      <CardPair label="Carriers and forecast">
        <CarrierCard result={carriers} href="/carriers" />
        <ForecastSummary forecast={forecast} href="/forecast" />
      </CardPair>
    </>
  );
}
