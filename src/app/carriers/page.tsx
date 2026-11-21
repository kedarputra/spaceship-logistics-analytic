import Link from "next/link";
import { askHref } from "@/components/ask-box";
import { type CardLink, ordersLink, RowLink } from "@/components/card-link";
import { carrierDelayedOrders } from "@/components/carrier-card";
import { ChartCard } from "@/components/chart-card";
import { CardTitle } from "@/components/card-title";
import { FigureCard } from "@/components/figure-card";
import { filteredOrdersHref } from "@/components/orders-href";
import { PageHeader } from "@/components/page-header";
import { RankedBars } from "@/components/ranked-bars";
import { reliableLeader } from "@/components/ranking";
import { rowRatio } from "@/components/row-ratio";
import { CARRIERS_PAGE_QUESTIONS } from "@/components/suggested-questions";
import { Tag } from "@/components/tag";
import { Table } from "@/components/text-table";
import { dashboardKpis, METRIC_STATUSES } from "@/domain/definitions";
import { formatCount, formatDays, formatMetricValue, formatOf, formatPercent, formatPercentPlain } from "@/domain/format";
import { getDataset } from "@/domain/orders";
import { dataPeriod, formatPeriod } from "@/domain/periods";
import type { QueryResult, ResultRow } from "@/tools/query";
import { andList, dateFieldWords } from "@/tools/words";
import { queryResult } from "../query-result";

// Rendered per request from the dataset this server instance loaded, like the Overview.
export const dynamic = "force-dynamic";

/** A carrier's value in one result, formatted by the result's unit; "n/a" when the carrier is not in it. */
function valueOf(result: QueryResult, key: string): string {
  return formatMetricValue(result.rows.find((row) => row.key === key)?.value ?? null, result.metric.unit);
}

function overallOf(result: QueryResult): string {
  return formatMetricValue(result.overall?.value ?? null, result.metric.unit);
}

/** A carrier's orders in Raw data, as many as the order count says it has (ticket 29). */
function carrierOrders(counts: QueryResult, key: string): CardLink | undefined {
  const row = counts.rows.find((count) => count.key === key);
  if (row === undefined) throw new Error(`No order count for carrier ${key}`);
  return ordersLink(row.value ?? 0, "orders", { carrier: [key] });
}

/** The carriers with the most orders, in Raw data: "View the 89 FedEx orders", or tied carriers together. */
function mostOrdersLink(tied: readonly ResultRow[]): CardLink | undefined {
  const filters = { carrier: tied.map(({ key }) => key) };
  const [only] = tied;
  if (only !== undefined && tied.length === 1) return ordersLink(only.value ?? 0, `${only.label} orders`, filters);
  return { href: filteredOrdersHref(filters), text: `View the ${andList(tied.map(({ label }) => label))} orders` };
}

/**
 * Carriers (ADR 0011 §5, ticket 25). The carriers' figures come from the query tool, the same one the
 * answers use; the header's totals from the KPI definitions. Highlights, bars and rows open the orders
 * behind them in Raw data (ticket 29).
 */
export default function CarriersPage() {
  const { orders } = getDataset();
  const dates = formatPeriod(dataPeriod(orders));
  const kpis = dashboardKpis(orders);
  const delay = queryResult({ metric: "delay_rate", groupBy: "carrier", sort: "desc" });
  const counts = queryResult({ metric: "order_count", groupBy: "carrier", sort: "desc" });
  const shares = queryResult({ metric: "order_share", groupBy: "carrier" });
  const delivered = queryResult({ metric: "delivered_orders", groupBy: "carrier" });
  const onTime = queryResult({ metric: "on_time_rate", groupBy: "carrier", sort: "desc" });
  const exceptions = queryResult({ metric: "exception_orders", groupBy: "carrier" });
  const times = queryResult({ metric: "average_delivery_time", groupBy: "carrier", sort: "desc" });

  const delayLeader = reliableLeader(delay);
  const onTimeLeader = reliableLeader(onTime).leader;
  const slowest = reliableLeader(times).leader;
  const { minDelivered } = delayLeader;
  const [most] = counts.rows;
  const mostTied = counts.rows.filter((row) => row.value === most?.value);
  const next = counts.rows[mostTied.length];
  const columns: { header: string; result: QueryResult }[] = [
    { header: "Orders", result: counts },
    { header: "Share", result: shares },
    { header: "Delivered", result: delivered },
    { header: "On-time rate", result: onTime },
    { header: "Delay rate", result: delay },
    { header: "Exceptions", result: exceptions },
    { header: "Avg delivery time", result: times },
  ];

  return (
    <>
      <PageHeader
        label="Carriers"
        title="Carriers"
        description={`${counts.rows.length} carriers, ${formatCount(kpis.totalOrders.count)} orders, ${formatCount(kpis.deliveredOrders.count)} delivered. Rates are over delivered orders; carriers with fewer than ${minDelivered} are marked.`}
      />
      <section aria-label="Highlights">
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3">
          {most === undefined ? null : (
            <FigureCard
              label="Most orders"
              link={mostOrdersLink(mostTied)}
              value={andList(mostTied.map(({ label }) => label))}
              detail={`${valueOf(counts, most.key)} orders${mostTied.length > 1 ? " each" : ""}, ${valueOf(shares, most.key)} of all${next === undefined ? "" : ` · ${next.label} next with ${valueOf(counts, next.key)}`}`}
            />
          )}
          {onTimeLeader === undefined ? null : (
            <FigureCard
              label={`Highest on-time rate, n ≥ ${minDelivered}`}
              link={ordersLink(onTimeLeader.n, `delivered ${onTimeLeader.label} orders`, { status: METRIC_STATUSES.on_time_rate, carrier: [onTimeLeader.key] })}
              value={onTimeLeader.label}
              detail={`${formatPercent(onTimeLeader.value)} · ${formatOf(rowRatio(onTimeLeader))} delivered on time`}
            />
          )}
          {delayLeader.leader === undefined ? null : (
            <FigureCard
              label={`Highest delay rate, n ≥ ${minDelivered}`}
              link={carrierDelayedOrders(delayLeader.leader, `delayed ${delayLeader.leader.label} orders`)}
              value={delayLeader.leader.label}
              detail={`${formatPercent(delayLeader.leader.value)} · ${formatOf(rowRatio(delayLeader.leader))} delayed${
                slowest?.key === delayLeader.leader.key ? ` · also the slowest with at least ${minDelivered}, ${formatDays(slowest.value)}` : ""
              }`}
            />
          )}
        </ul>
      </section>
      <ChartCard
        id="delay-title"
        title="Delay rate by carrier"
        caption={`Delayed orders ÷ delivered orders · by ${dateFieldWords(delay.dateField)} · ${dates}`}
      >
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="min-w-0 flex-[999_1_420px]">
            <RankedBars
              tone="amber"
              formatTick={formatPercentPlain}
              bars={delay.rows.map((row) => ({
                label: row.label,
                n: row.n,
                value: row.value,
                valueText: formatPercent(row.value),
                smallSample: row.smallSample,
                link: carrierDelayedOrders(row),
              }))}
            />
          </div>
          <aside className="flex min-w-0 flex-[1_1_220px] flex-col gap-2 rounded-inset border border-grid bg-inset p-3.5 text-small text-ink-2">
            <span className="text-label text-muted uppercase">Reading this chart</span>
            <ReadingNote top={delayLeader.top} leader={delayLeader.leader} topIsSmall={delayLeader.topIsSmall} minDelivered={minDelivered} />
            <p>{`Lighter bars mark fewer than ${minDelivered} delivered orders: one late delivery more or less moves them by several points.`}</p>
          </aside>
        </div>
      </ChartCard>
      <section aria-labelledby="table-title" className="card card-body">
        <CardTitle
          id="table-title"
          title="All carriers"
          caption={`Sorted by delay rate · orders and share by ${dateFieldWords(counts.dateField)}, the rest by ${dateFieldWords(delay.dateField)}`}
        />
        <Table
          headers={["Carrier", ...columns.map(({ header }) => header)]}
          rowHeaders
          numeric
          sortedBy={1 + columns.findIndex(({ result }) => result === delay)}
          linkedRows
          rows={delay.rows.map((row) => [
            <>
              <RowLink name={row.label} link={carrierOrders(counts, row.key)} />
              {row.smallSample ? (
                <span className="ml-1.5">
                  <Tag tone="warn">small sample</Tag>
                </span>
              ) : null}
            </>,
            ...columns.map(({ result }) => valueOf(result, row.key)),
          ])}
          footer={["All carriers", ...columns.map(({ result }) => overallOf(result))]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-small text-muted">Ask about carriers:</span>
          {CARRIERS_PAGE_QUESTIONS.map((question) => (
            <Link key={question} href={askHref(question)} className="chip">
              {question}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

/** Who leads the delay ranking, and why a small sample at the top is not the answer (ADR 0001 §6). */
function ReadingNote({ top, leader, topIsSmall, minDelivered }: { top: ResultRow; leader: ResultRow | undefined; topIsSmall: boolean; minDelivered: number }) {
  if (leader === undefined) return <p>{`No carrier has at least ${minDelivered} delivered orders, so none is named.`}</p>;
  const named = (
    <>
      <strong>{leader.label}</strong>
      {` is highest at ${formatPercent(leader.value)} (${formatOf(rowRatio(leader))}).`}
    </>
  );
  if (!topIsSmall) return <p>{named}</p>;
  return (
    <p>
      {`${top.label} tops the list on only ${formatCount(top.n)} deliveries. Among carriers with at least ${minDelivered}, `}
      {named}
    </p>
  );
}
