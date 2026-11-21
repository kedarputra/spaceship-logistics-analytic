import { METRIC_STATUSES } from "@/domain/definitions";
import { formatOf, formatPercent } from "@/domain/format";
import type { QueryResult, ResultRow } from "@/tools/query";
import { dateFieldWords } from "@/tools/words";
import { type CardLink, ordersLink } from "./card-link";
import { RankedBars } from "./ranked-bars";
import { reliableLeader } from "./ranking";
import { rowRatio } from "./row-ratio";
import { SummaryCard } from "./summary-card";

const SHOWN = 4;

/** A carrier's delayed orders in Raw data, as many as its delay rate's numerator (ticket 29). */
export function carrierDelayedOrders(row: ResultRow, words = "delayed orders"): CardLink {
  return ordersLink(rowRatio(row).numerator, words, { status: METRIC_STATUSES.delayed_orders, carrier: [row.key] });
}

/**
 * The Overview's carrier card (ticket 24): the delay rate by carrier, highest first, the top 4 with
 * the small-sample rule, and the highest carrier with enough deliveries, as the query tool's ranking
 * names it (ADR 0001 §6). `href` opens every carrier; each bar opens its carrier's delayed orders (ticket 29).
 */
export function CarrierCard({ result, href }: { result: QueryResult; href: string }) {
  const { rows } = result;
  const { leader: reliable, minDelivered } = reliableLeader(result);
  return (
    <SummaryCard
      id="carriers-title"
      title="Delay rate by carrier"
      caption={`Delayed ÷ delivered · by ${dateFieldWords(result.dateField)} · top ${Math.min(SHOWN, rows.length)} of ${rows.length}`}
      link={{ href, label: `All ${rows.length} carriers` }}
    >
      <RankedBars
        tone="amber"
        bars={rows.slice(0, SHOWN).map((row) => ({
          label: row.label,
          n: row.n,
          value: row.value,
          valueText: formatPercent(row.value),
          smallSample: row.smallSample,
          link: carrierDelayedOrders(row),
        }))}
      />
      <p className="text-small text-ink-2">
        {reliable === undefined ? (
          `No carrier has at least ${minDelivered} deliveries.`
        ) : (
          <>
            {`Among carriers with at least ${minDelivered} deliveries, `}
            <strong>{reliable.label}</strong>
            {` is highest at ${formatPercent(reliable.value)} (${formatOf(rowRatio(reliable))}).`}
          </>
        )}
      </p>
    </SummaryCard>
  );
}
