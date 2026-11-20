import { LiveAiStatusPill } from "@/components/ai-status";
import { AskBox, askHref } from "@/components/ask-box";
import { CarrierCard } from "@/components/carrier-card";
import { ChartCard } from "@/components/chart-card";
import { ForecastSummary } from "@/components/forecast-summary";
import { Icon } from "@/components/icons";
import { KpiCards } from "@/components/kpi-cards";
import { Marked } from "@/components/marked";
import { OrderBars, OutcomeBars } from "@/components/month-charts";
import { PageHeader } from "@/components/page-header";
import { OUTCOME_SERIES } from "@/components/series";
import { CARRIERS_QUESTION, FORECAST_QUESTION, OVERVIEW_QUESTIONS } from "@/components/suggested-questions";
import { dashboardKpis, deliveryOutcomesOverTime, orderCountOverTime } from "@/domain/definitions";
import { formatCount } from "@/domain/format";
import { getDataset } from "@/domain/orders";
import { dataPeriod, formatDate, formatPeriod, formatYears } from "@/domain/periods";
import { answerForecast } from "@/tools/forecast-answer";
import { runQuery } from "@/tools/query";
import { forecastSpecSchema } from "@/tools/spec";

// Rendered per request from the dataset this server instance loaded, like /api/health.
export const dynamic = "force-dynamic";

/** Two cards side by side, stacking when there is no room for both at 440 px. */
const CARD_PAIR = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4";

/** The Overview (ADR 0011 §5, ticket 24): a summary of the data that links to the Ask page. Every figure is computed. */
export default function OverviewPage() {
  const dataset = getDataset();
  const { orders, anchor } = dataset;
  const period = dataPeriod(orders);
  const kpis = dashboardKpis(orders);
  const ordersPerMonth = orderCountOverTime(orders, period, "month");
  const outcomesPerMonth = deliveryOutcomesOverTime(orders, period, "month");
  // The same query "What is the delay rate by carrier?" runs, over all the data.
  const carriers = runQuery({ tool: "query", metric: "delay_rate", groupBy: "carrier", sort: "desc" }, dataset);
  if (carriers.kind !== "result") throw new Error(carriers.message);
  const forecast = answerForecast(forecastSpecSchema.parse({ tool: "forecast", scope: { type: "total" } }));
  if (forecast.kind !== "forecast") throw new Error(forecast.message);
  const dates = formatPeriod(period);
  const outcomeTotals = kpis.deliveredOrders;

  return (
    <>
      <PageHeader
        label="Logistics analytics"
        title="Overview"
        description={`Delivery performance, carriers and demand for the ${formatCount(orders.length)} orders of ${formatYears(period)}.`}
      >
        <span className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-panel px-3 text-small text-ink-2">
          <Icon name="calendar" size={15} className="text-grey-green" />
          {`Data as of ${formatDate(anchor)}`}
        </span>
        <LiveAiStatusPill />
      </PageHeader>
      <AskBox questions={OVERVIEW_QUESTIONS} />
      <KpiCards kpis={kpis} />
      <section aria-label="Orders and delivery outcomes" className={CARD_PAIR}>
        <ChartCard
          title="Orders per month"
          caption={`By order date · ${dates} · ${formatCount(kpis.totalOrders.count)} orders`}
          table={{ headers: ["Month", "Orders"], rows: ordersPerMonth.map(({ bucket, value }) => [bucket.label, formatCount(value)]) }}
        >
          <OrderBars months={ordersPerMonth} />
        </ChartCard>
        <ChartCard
          title="Delivery outcomes per month"
          caption={`By delivery date · ${dates} · ${formatCount(outcomeTotals.count)} delivered`}
          legend={
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-ink-2" aria-label="Legend">
              {OUTCOME_SERIES.map(({ key, label, mark }) => (
                <li key={key}>
                  <Marked mark={mark}>{`${label} ${formatCount(outcomeTotals[key])}`}</Marked>
                </li>
              ))}
            </ul>
          }
          table={{
            headers: ["Month", ...OUTCOME_SERIES.map(({ label }) => label)],
            rows: outcomesPerMonth.map(({ bucket, value }) => [bucket.label, ...OUTCOME_SERIES.map(({ key }) => formatCount(value[key]))]),
          }}
        >
          <OutcomeBars months={outcomesPerMonth} />
        </ChartCard>
      </section>
      <section aria-label="Carriers and forecast" className={CARD_PAIR}>
        <CarrierCard result={carriers} href={askHref(CARRIERS_QUESTION)} />
        <ForecastSummary forecast={forecast} href={askHref(FORECAST_QUESTION)} />
      </section>
    </>
  );
}
