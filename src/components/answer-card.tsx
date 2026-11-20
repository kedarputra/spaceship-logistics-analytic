import { isRateOrAverage, SMALL_SAMPLE_MIN_DELIVERED } from "@/domain/definitions";
import { formatCount, formatMetricValue } from "@/domain/format";
import { formatPeriod } from "@/domain/periods";
import type { Answer, FollowUp } from "@/tools/answer";
import type { ForecastAnswer } from "@/tools/forecast-answer";
import type { ResultRow } from "@/tools/query";
import type { QuerySpec } from "@/tools/spec";
import { DIMENSION_WORDS, dateFieldWords, filterList, periodWords } from "@/tools/words";
import { answerChartProps } from "./answer-chart";
import { Chart } from "./chart";
import { CachedNote } from "./cached-note";
import { ForecastCard } from "./forecast-card";
import { Fact, Table, type TextTable } from "./text-table";

/**
 * An answer as the user sees it: the number or chart, the table, the follow-up chips, and the
 * explanation panel (ADR 0006 §6–7). Every value is rendered as text; nothing is ever HTML.
 */

export type AnswerOutcomeState =
  | { kind: "idle" }
  | { kind: "loading" }
  /** `cached`: the server's question cache served it (B1, ADR 0008 §1). */
  | { kind: "answer"; answer: Answer; cached?: boolean }
  | { kind: "forecast"; forecast: ForecastAnswer; cached?: boolean }
  | { kind: "no-data"; message: string }
  | { kind: "error"; message: string; details: string[] }
  /** Out of scope, or the model could not produce a valid spec: why, and questions that work. */
  | { kind: "unsupported"; message: string; examples: string[] };

interface AnswerActions {
  /** Runs a chip's spec through /api/run. */
  onFollowUp: (followUp: FollowUp) => void;
  /** Asks a question in words through /api/ask. */
  onAsk: (question: string) => void;
}

const FRACTION_HEADERS: Partial<Record<Answer["metric"]["id"], string>> = {
  on_time_rate: "On time / delivered",
  delay_rate: "Delayed / delivered",
  average_delivery_time: "Days / delivered",
  order_share: "Orders / all orders",
};

function columnHeader(groupBy: QuerySpec["groupBy"]): string {
  if (groupBy === undefined) return "";
  const { one } = DIMENSION_WORDS[groupBy];
  return `${one.charAt(0).toUpperCase()}${one.slice(1)}`;
}

function fraction(row: ResultRow): string | undefined {
  if (row.numerator === undefined || row.denominator === undefined) return undefined;
  return `${formatCount(row.numerator)} / ${formatCount(row.denominator)}`;
}

function note(row: ResultRow): string {
  const notes: string[] = [];
  if (row.smallSample) notes.push("Small sample");
  if (row.partial && row.from !== undefined && row.to !== undefined) {
    notes.push(`${formatPeriod({ from: row.from, to: row.to }, { year: false })} only`);
  }
  return notes.join("; ");
}

/** The result as rows of text, leaving out the note column when no row has a note. */
function resultTable(answer: Answer, decimals: 1 | 2): TextTable {
  const table = resultTableWithNotes(answer, decimals);
  if (table.rows.some((cells) => cells.at(-1) !== "")) return table;
  return { headers: table.headers.slice(0, -1), rows: table.rows.map((cells) => cells.slice(0, -1)) };
}

/** The result as rows of text, the last column a note: on screen to 1 decimal, in the panel to 2 (ADR 0001 §7). */
function resultTableWithNotes(answer: Answer, decimals: 1 | 2): TextTable {
  const { metric } = answer;
  const value = (row: ResultRow) => formatMetricValue(row.value, metric.unit, decimals);
  const first = columnHeader(answer.spec.groupBy);
  if (metric.id === "delivery_outcomes") {
    return {
      headers: [first, "Delivered", "On time", "Delayed", "Exception", "Note"],
      rows: answer.rows.map((row) => [
        row.label,
        value(row),
        formatCount(row.outcomes?.onTime ?? 0),
        formatCount(row.outcomes?.delayed ?? 0),
        formatCount(row.outcomes?.exception ?? 0),
        note(row),
      ]),
    };
  }
  if (isRateOrAverage(metric.kind)) {
    return {
      headers: [first, metric.label, FRACTION_HEADERS[metric.id] ?? "Numerator / denominator", "n", "Note"],
      rows: answer.rows.map((row) => [row.label, value(row), fraction(row) ?? "", formatCount(row.n), note(row)]),
    };
  }
  return { headers: [first, metric.label, "Note"], rows: answer.rows.map((row) => [row.label, value(row), note(row)]) };
}

/** A single value, shown as the number itself: "82.2% · 304 / 370". */
function ValueCard({ answer }: { answer: Answer }) {
  const [row] = answer.rows;
  const fractionText = row === undefined ? undefined : fraction(row);
  return (
    <div>
      <p className="text-sm text-slate-600">{answer.metric.label}</p>
      <p className="text-4xl font-semibold">
        {formatMetricValue(row?.value ?? null, answer.metric.unit)}
        {fractionText === undefined ? null : <span className="text-base font-normal text-slate-600">{` · ${fractionText}`}</span>}
      </p>
    </div>
  );
}

function filtersText(spec: QuerySpec): string {
  const filters = filterList(spec.filters).map(({ dimension, values }) => `${dimension}: ${values.join(", ")}`);
  return filters.length === 0 ? "None" : filters.join("; ");
}

/** "last month = 1–30 Nov 2025, filtered by delivery date" (ADR 0002 §3, §5). */
function periodText(answer: Answer): string {
  const asked = periodWords(answer.requestedSpec.period);
  const dates = asked === undefined ? answer.period.label : `${asked} = ${answer.period.label}`;
  return `${dates}, filtered by ${dateFieldWords(answer.dateField)}`;
}

/** ADR 0006 §7: everything needed to check the number, collapsed by default. */
function ExplanationPanel({ answer }: { answer: Answer }) {
  const { metric, rewrite, ranking, matchingOrders } = answer;
  const hidden = matchingOrders === undefined ? 0 : matchingOrders.total - matchingOrders.orders.length;
  return (
    <details className="mt-4 rounded-md border border-slate-200 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">How this was computed</summary>
      <dl className="mt-3 space-y-2">
        <Fact term="Interpretation">{answer.interpretation}</Fact>
        <Fact term="Period">{periodText(answer)}</Fact>
        <Fact term="Filters">{filtersText(answer.spec)}</Fact>
        <Fact term="Definition">
          {metric.definition}
          {ranking === undefined ? null : ` A group with fewer than ${ranking.minDelivered} delivered orders is a small sample.`}
        </Fact>
        {rewrite === undefined ? null : <Fact term="Rewritten">{`${rewrite.from} → ${rewrite.to}`}</Fact>}
        <Fact term="Spec">
          <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(answer.requestedSpec, null, 2)}</pre>
        </Fact>
      </dl>
      <h3 className="mt-4 font-medium text-slate-700">Result, to 2 decimals</h3>
      <div className="overflow-x-auto">
        <Table {...resultTable(answer, 2)} />
      </div>
      {matchingOrders === undefined ? null : (
        <>
          <h3 className="mt-4 font-medium text-slate-700">{`Matching orders (${formatCount(matchingOrders.total)})`}</h3>
          <div className="overflow-x-auto">
            <Table
              headers={["Order", "Order date", "Delivery date", "Status", "Carrier", "Destination", "Category", "Quantity"]}
              rows={matchingOrders.orders.map((order) => [
                order.order_id,
                order.order_date,
                order.delivery_date ?? "",
                order.status,
                order.carrier,
                order.destination_city,
                order.product_category,
                formatCount(order.quantity),
              ])}
            />
          </div>
          {hidden > 0 ? <p className="mt-2 text-slate-600">{`and ${formatCount(hidden)} more`}</p> : null}
        </>
      )}
    </details>
  );
}

function AnswerCard({ answer, cached, onFollowUp }: { answer: Answer; cached?: boolean } & Pick<AnswerActions, "onFollowUp">) {
  const chart = answerChartProps(answer);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-base text-slate-900">{answer.sentence}</p>
      <CachedNote cached={cached} />
      <p className="mt-1 text-sm text-slate-600">{answer.interpretation}</p>
      {answer.assumptionNote === undefined ? null : <p className="mt-1 text-sm text-slate-600">{answer.assumptionNote}</p>}
      <div className="mt-3">{chart === null ? <ValueCard answer={answer} /> : <Chart {...chart} />}</div>
      {answer.chart.hiddenRows > 0 ? (
        <p className="mt-1 text-xs text-slate-500">{`${answer.chart.hiddenRows} more in the table`}</p>
      ) : null}
      {chart !== null && chart.rows.some((row) => row.muted) ? (
        <p className="mt-1 text-xs text-slate-500">{`Lighter: fewer than ${SMALL_SAMPLE_MIN_DELIVERED} delivered orders; n is in the table.`}</p>
      ) : null}
      <div className="mt-3 overflow-x-auto">
        <Table {...resultTable(answer, 1)} />
      </div>
      {answer.followUps.length === 0 ? null : (
        <div className="mt-3 flex flex-wrap gap-2">
          {answer.followUps.map((followUp) => (
            <button
              key={followUp.label}
              type="button"
              onClick={() => onFollowUp(followUp)}
              className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
            >
              {followUp.label}
            </button>
          ))}
        </div>
      )}
      <ExplanationPanel answer={answer} />
    </article>
  );
}

/** Whatever the last question came to: nothing yet, working, an answer, no data, or the API's errors. */
export function AnswerOutcome({ outcome, onFollowUp, onAsk }: { outcome: AnswerOutcomeState } & AnswerActions) {
  switch (outcome.kind) {
    case "idle":
      return <p className="text-sm text-slate-500">Ask a question, or pick one, to see its answer and how it was computed.</p>;
    case "loading":
      return <p className="text-sm text-slate-500">Working on it…</p>;
    case "answer":
      return <AnswerCard answer={outcome.answer} cached={outcome.cached} onFollowUp={onFollowUp} />;
    case "forecast":
      return <ForecastCard forecast={outcome.forecast} cached={outcome.cached} />;
    case "no-data":
      return <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm">{outcome.message}</p>;
    case "unsupported":
      return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <p>{outcome.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {outcome.examples.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => onAsk(question)}
                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-900 hover:bg-blue-100"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      );
    case "error":
      return (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-medium">{outcome.message}</p>
          {outcome.details.length === 0 ? null : (
            <ul className="mt-1 list-disc pl-5">
              {outcome.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      );
  }
}
