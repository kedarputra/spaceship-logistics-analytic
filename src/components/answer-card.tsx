import type { ReactNode } from "react";
import { isRateOrAverage, SMALL_SAMPLE_MIN_DELIVERED } from "@/domain/definitions";
import { formatCount, formatMetricValue } from "@/domain/format";
import { formatPeriod } from "@/domain/periods";
import type { Answer, FollowUp } from "@/tools/answer";
import type { ForecastAnswer } from "@/tools/forecast-answer";
import type { ResultRow } from "@/tools/query";
import type { QuerySpec } from "@/tools/spec";
import type { TraceStage } from "@/tools/trace-stage";
import { capitalized, countOf, DIMENSION_WORDS, dateFieldWords, filterList, periodWords } from "@/tools/words";
import { answerBars, answerChartProps, companionOf } from "./answer-chart";
import { AskedQuestion, ExplanationCard, PanelHeading, PanelLink, SentenceBadge, SpecBlock } from "./answer-parts";
import { CachedNote } from "./cached-note";
import { Chart, type ChartProps } from "./chart";
import { ForecastCard } from "./forecast-card";
import { ordersHref } from "./orders-href";
import { RankedBars } from "./ranked-bars";
import { toneOf } from "./series";
import { Fact, Table, type TextTable } from "./text-table";
import { ChartAndTraceFacts } from "./trace-strip";

/**
 * An answer as the user sees it on the Ask page (ADR 0006 §6–7, ADR 0011): the question, the sentence
 * and who wrote it, the number or chart, the table, the follow-up chips, and how it was computed.
 * Every value is rendered as text; nothing is ever HTML.
 */

export type AnswerOutcomeState =
  | { kind: "idle" }
  | { kind: "loading" }
  /** `cached`: the server's question cache served it (B1, ADR 0008 §1). */
  | { kind: "answer"; answer: Answer; cached?: boolean; trace?: TraceStage[] }
  | { kind: "forecast"; forecast: ForecastAnswer; cached?: boolean; trace?: TraceStage[] }
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
  return capitalized(DIMENSION_WORDS[groupBy].one);
}

function fraction(row: ResultRow): string | undefined {
  if (row.numerator === undefined || row.denominator === undefined) return undefined;
  return `${formatCount(row.numerator)} / ${formatCount(row.denominator)}`;
}

function note(row: ResultRow, companion: ResultRow | undefined, minDelivered: number): string {
  const notes: string[] = [];
  if (row.smallSample) notes.push("Small sample");
  if (row === companion) notes.push(`First with n ≥ ${minDelivered}`);
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

/**
 * The result as rows of text, the last column a note: on screen to 1 decimal, in the panel to 2
 * (ADR 0001 §7). A small-sample top cut by a limit is followed by its companion, as in the sentence.
 */
function resultTableWithNotes(answer: Answer, decimals: 1 | 2): TextTable {
  const { metric } = answer;
  const companion = companionOf(answer);
  const rows = companion === undefined ? answer.rows : [...answer.rows, companion];
  const noteOf = (row: ResultRow) => note(row, companion, answer.ranking?.minDelivered ?? SMALL_SAMPLE_MIN_DELIVERED);
  const value = (row: ResultRow) => formatMetricValue(row.value, metric.unit, decimals);
  const first = columnHeader(answer.spec.groupBy);
  if (metric.id === "delivery_outcomes") {
    return {
      headers: [first, "Delivered", "On time", "Delayed", "Exception", "Note"],
      rows: rows.map((row) => [
        row.label,
        value(row),
        formatCount(row.outcomes?.onTime ?? 0),
        formatCount(row.outcomes?.delayed ?? 0),
        formatCount(row.outcomes?.exception ?? 0),
        noteOf(row),
      ]),
    };
  }
  if (isRateOrAverage(metric.kind)) {
    return {
      headers: [first, metric.label, FRACTION_HEADERS[metric.id] ?? "Numerator / denominator", "n", "Note"],
      rows: rows.map((row) => [row.label, value(row), fraction(row) ?? "", formatCount(row.n), noteOf(row)]),
    };
  }
  return { headers: [first, metric.label, "Note"], rows: rows.map((row) => [row.label, value(row), noteOf(row)]) };
}

/** A single value, shown as the number itself: "82.2% · 304 / 370". */
function ValueCard({ answer }: { answer: Answer }) {
  const [row] = answer.rows;
  const fractionText = row === undefined ? undefined : fraction(row);
  return (
    <div>
      <p className="text-small text-muted">{answer.metric.label}</p>
      <p className="text-plan">
        {formatMetricValue(row?.value ?? null, answer.metric.unit)}
        {fractionText === undefined ? null : <span className="text-input font-normal tracking-normal text-muted">{` · ${fractionText}`}</span>}
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

/** ADR 0006 §7: everything needed to check the number, and the orders behind it in Raw data (ticket 29). */
function ExplanationPanel({ answer, trace }: { answer: Answer; trace?: TraceStage[] }) {
  const { metric, rewrite, ranking, matchingOrders, ordersBehind } = answer;
  const hidden = matchingOrders === undefined ? 0 : matchingOrders.total - matchingOrders.orders.length;
  return (
    <ExplanationCard title="How this was computed">
      <dl className="flex flex-col gap-2.5">
        <Fact term="Interpretation">{answer.interpretation}</Fact>
        <Fact term="Period">{periodText(answer)}</Fact>
        <Fact term="Filters">{filtersText(answer.spec)}</Fact>
        <Fact term="Definition">
          {metric.definition}
          {ranking === undefined ? null : ` A group with fewer than ${ranking.minDelivered} delivered orders is a small sample.`}
        </Fact>
        {rewrite === undefined ? null : <Fact term="Rewritten">{`${rewrite.from} → ${rewrite.to}`}</Fact>}
        <ChartAndTraceFacts chartReason={answer.chart.reason} trace={trace} />
      </dl>
      {ordersBehind === undefined ? null : (
        <PanelLink href={ordersHref(ordersBehind.view)}>
          {`Open the ${countOf(ordersBehind.count, isRateOrAverage(metric.kind) ? "delivered order" : "order")} behind this answer`}
        </PanelLink>
      )}
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
          <PanelHeading>Spec, as validated</PanelHeading>
          <SpecBlock spec={answer.requestedSpec} />
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5">
          <PanelHeading>Result, to 2 decimals</PanelHeading>
          <Table {...resultTable(answer, 2)} />
        </div>
      </div>
      {matchingOrders === undefined ? null : (
        <div className="flex flex-col gap-1.5">
          <PanelHeading>{`Matching orders (${formatCount(matchingOrders.total)})`}</PanelHeading>
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
          {hidden > 0 ? <p className="text-muted">{`and ${formatCount(hidden)} more`}</p> : null}
        </div>
      )}
    </ExplanationCard>
  );
}

/** The answer's visual: ranked bars, a chart, or the number itself. */
function AnswerVisual({ answer, chart }: { answer: Answer; chart: ChartProps | null }) {
  const bars = answerBars(answer);
  if (bars !== null) return <RankedBars bars={bars} tone={toneOf(answer.metric.id)} />;
  return chart === null ? <ValueCard answer={answer} /> : <Chart {...chart} />;
}

function AnswerCard({
  question,
  answer,
  cached,
  trace,
  onFollowUp,
}: { question?: string; answer: Answer; cached?: boolean; trace?: TraceStage[] } & Pick<AnswerActions, "onFollowUp">) {
  const chart = answerChartProps(answer);
  return (
    <>
      <article aria-label="Answer" className="card flex flex-col gap-3.5 p-5">
        <AskedQuestion question={question} />
        <p className="max-w-[68ch] text-sentence text-pretty">{answer.sentence}</p>
        <div className="flex flex-wrap items-center gap-2">
          <SentenceBadge source={answer.sentenceSource} />
          <CachedNote cached={cached} />
          <span className="text-caption text-muted">{answer.interpretation}</span>
        </div>
        {answer.assumptionNote === undefined ? null : <p className="text-small text-ink-2">{answer.assumptionNote}</p>}
        <div className="max-w-[720px]">
          <AnswerVisual answer={answer} chart={chart} />
        </div>
        {answer.chart.hiddenRows > 0 ? <p className="text-note text-muted">{`${answer.chart.hiddenRows} more in the table`}</p> : null}
        {chart !== null && chart.rows.some((row) => row.muted) ? (
          <p className="text-note text-muted">{`Lighter: fewer than ${SMALL_SAMPLE_MIN_DELIVERED} delivered orders; n is in the table.`}</p>
        ) : null}
        <Table {...resultTable(answer, 1)} />
        {answer.followUps.length === 0 ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-small text-muted">Follow up:</span>
            {answer.followUps.map((followUp) => (
              <button key={followUp.label} type="button" onClick={() => onFollowUp(followUp)} className="chip chip-outline">
                {followUp.label}
              </button>
            ))}
          </div>
        )}
      </article>
      <ExplanationPanel answer={answer} trace={trace} />
    </>
  );
}

/** A plain message card: no data, or why a question is out of scope. */
function MessageCard({ children }: { children: ReactNode }) {
  return <div className="card flex flex-col gap-3 p-5 text-small">{children}</div>;
}

/** Whatever the last question came to: nothing yet, working, an answer, no data, or the API's errors. */
export function AnswerOutcome({ question, outcome, onFollowUp, onAsk }: { question?: string; outcome: AnswerOutcomeState } & AnswerActions) {
  switch (outcome.kind) {
    case "idle":
      return <p className="text-small text-muted">Ask a question, or pick one, to see its answer and how it was computed.</p>;
    case "loading":
      return (
        <MessageCard>
          <AskedQuestion question={question} />
          <p className="text-muted">Working on it…</p>
        </MessageCard>
      );
    case "answer":
      return <AnswerCard question={question} answer={outcome.answer} cached={outcome.cached} trace={outcome.trace} onFollowUp={onFollowUp} />;
    case "forecast":
      return <ForecastCard question={question} forecast={outcome.forecast} cached={outcome.cached} trace={outcome.trace} />;
    case "no-data":
      return (
        <MessageCard>
          <AskedQuestion question={question} />
          <p>{outcome.message}</p>
        </MessageCard>
      );
    case "unsupported":
      return (
        <MessageCard>
          <AskedQuestion question={question} />
          <p>{outcome.message}</p>
          <div className="flex flex-wrap gap-2">
            {outcome.examples.map((example) => (
              <button key={example} type="button" onClick={() => onAsk(example)} className="chip">
                {example}
              </button>
            ))}
          </div>
        </MessageCard>
      );
    case "error":
      return (
        <div role="alert" className="flex flex-col gap-1 rounded-card border border-bad-line bg-bad-tint p-5 text-small text-bad-ink">
          <AskedQuestion question={question} />
          <p className="font-semibold">{outcome.message}</p>
          {outcome.details.length === 0 ? null : (
            <ul className="list-disc pl-5">
              {outcome.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      );
  }
}
