import { formatCount, formatPercent } from "@/domain/format";
import type { QueryResult, ResultRow } from "@/tools/query";
import { dateFieldWords } from "@/tools/words";
import { RankedBars } from "./ranked-bars";
import { SummaryCard } from "./summary-card";

const SHOWN = 4;

/** "11 of 47": a rate's parts, which every delay-rate row carries. */
function partsOf(row: ResultRow): string {
  if (row.numerator === undefined || row.denominator === undefined) throw new Error(`"${row.label}" carries no rate`);
  return `${formatCount(row.numerator)} of ${formatCount(row.denominator)}`;
}

/**
 * The Overview's carrier card (ticket 24): the delay rate by carrier, highest first, the top 4 with
 * the small-sample rule, and the highest carrier with enough deliveries, as the query tool's ranking
 * names it (ADR 0001 §6). `href` opens every carrier.
 */
export function CarrierCard({ result, href }: { result: QueryResult; href: string }) {
  const { rows, ranking } = result;
  if (ranking === undefined) throw new Error("A delay rate by carrier is always ranked");
  const reliable = ranking.case === "reliable" ? ranking.top : ranking.topReliable;
  return (
    <SummaryCard
      id="carriers-title"
      title="Delay rate by carrier"
      caption={`Delayed ÷ delivered · by ${dateFieldWords(result.dateField)} · top ${Math.min(SHOWN, rows.length)} of ${rows.length}`}
      link={{ href, label: `All ${rows.length} carriers` }}
    >
      <RankedBars
        tone="amber"
        bars={rows.slice(0, SHOWN).map((row) => ({ label: row.label, n: row.n, value: row.value, valueText: formatPercent(row.value), smallSample: row.smallSample }))}
      />
      <p className="text-small text-ink-2">
        {reliable === undefined ? (
          `No carrier has at least ${ranking.minDelivered} deliveries.`
        ) : (
          <>
            {`Among carriers with at least ${ranking.minDelivered} deliveries, `}
            <strong>{reliable.label}</strong>
            {` is highest at ${formatPercent(reliable.value)} (${partsOf(reliable)}).`}
          </>
        )}
      </p>
    </SummaryCard>
  );
}
