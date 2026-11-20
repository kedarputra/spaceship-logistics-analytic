import Link from "next/link";
import type { ReactNode } from "react";
import { askHref } from "@/components/ask-box";
import { CardPair } from "@/components/card-pair";
import { CardTitle } from "@/components/card-title";
import { forecastChartRows } from "@/components/forecast-card";
import { ForecastChart } from "@/components/forecast-chart";
import { forecastChoice, SCOPE_VALUES } from "@/components/forecast-choice";
import { ForecastControls } from "@/components/forecast-controls";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { SKU_QUESTION } from "@/components/suggested-questions";
import { Tag } from "@/components/tag";
import { Table } from "@/components/text-table";
import { mostOrdersOfOneSku } from "@/domain/definitions";
import { formatCount, formatDecimal, formatPercent, formatPercentPlain } from "@/domain/format";
import { getDataset } from "@/domain/orders";
import { NOT_A_REORDER, ROUGH_WAPE } from "@/tools/forecast";
import { answerForecast, type ForecastAnswer, winnerScore } from "@/tools/forecast-answer";
import { forecastSpecSchema, type ForecastSpec } from "@/tools/spec";
import { capitalized, countOf } from "@/tools/words";

/** The forecast tool's answer for a spec that is always in the data. */
function forecastFor(spec: ForecastSpec): ForecastAnswer {
  const answer = answerForecast(spec);
  if (answer.kind !== "forecast") throw new Error(answer.message);
  return answer;
}

/** The chosen method's holdout error; the chosen method is always one of the candidates. */
function chosenWape(forecast: ForecastAnswer): string {
  const score = winnerScore(forecast);
  if (score === undefined) throw new Error(`No score for the chosen method of ${forecast.scopeLabel}`);
  return formatPercent(score.wape);
}

/** One line of a figure list: its name on the left, its figure on the right. */
function FigureRow({ term, children, total = false }: { term: string; children: ReactNode; total?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${total ? "border-t border-line pt-2 font-semibold" : ""}`}>
      <dt className={total ? "" : "text-muted"}>{term}</dt>
      <dd className="font-semibold whitespace-nowrap">{children}</dd>
    </div>
  );
}

/** The forecast the page's choice names: the plan, its breakdown, each month, the chart and the caveats. */
function ChosenForecast({ forecast }: { forecast: ForecastAnswer }) {
  const { recommendation, method } = forecast;
  const notes = [forecast.roughNote, forecast.scopeNote, forecast.januaryCaveat, ...forecast.horizon.notes].filter((note) => note !== undefined);
  return (
    <section aria-labelledby="total-title" className="card card-body">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <CardTitle
          id="total-title"
          title={`${capitalized(forecast.scopeLabel)} · ${forecast.monthsLabel}`}
          caption={`History ${forecast.period} · error measured on ${forecast.holdout}`}
        />
        <span className="flex flex-wrap gap-2">
          <span className="pill border border-chip-line bg-chip text-green-text">{method.label}</span>
          {method.rough ? <span className="pill bg-track text-ink-2">rough</span> : null}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-5">
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-3">
          <div className="flex flex-col">
            <span className="text-small font-semibold text-ink-2">Units to plan for</span>
            <span className="text-plan">{formatCount(recommendation.units)}</span>
          </div>
          <dl className="flex flex-col gap-1 text-small">
            <FigureRow term="Forecast demand">{formatCount(recommendation.demand)}</FigureRow>
            <FigureRow term="Safety stock">{formatCount(recommendation.safetyStock)}</FigureRow>
          </dl>
          <Table
            headers={["Month", "Forecast", "95% range"]}
            numeric
            rows={forecast.forecastMonths.map((month) => [month.label, formatDecimal(month.units, 0), `${formatDecimal(month.low, 0)}–${formatDecimal(month.high, 0)}`])}
          />
        </div>
        <div className="flex min-w-0 flex-[2_1_420px] flex-col gap-2">
          <ForecastChart rows={forecastChartRows(forecast)} />
          {notes.map((note) => (
            <p key={note} className="text-caption text-muted">
              {note}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

/** How the method was chosen, and the plan's arithmetic with z and σ from the forecast result. */
function HowChosen({ forecast }: { forecast: ForecastAnswer }) {
  const { candidates, method, holdout, horizon, sigma, safetyZ, sigmaFrom, exact, recommendation } = forecast;
  return (
    <CardPair label="How the forecast was chosen">
      <div className="card card-body">
        <CardTitle
          title={`${candidates.length} methods, one chosen`}
          caption={`Each was fitted on the months before ${holdout} and scored on ${holdout}. The lowest error wins; a tie goes to the simpler method.`}
        />
        <Table
          headers={["Method", "MAE, units", "WAPE"]}
          numeric
          rows={candidates.map((candidate) => [
            candidate.method === method.id ? `${candidate.label} · chosen` : candidate.label,
            formatDecimal(candidate.mae, 2),
            formatPercent(candidate.wape),
          ])}
        />
      </div>
      <div className="card card-body">
        <CardTitle title="From forecast to plan" caption="The plan covers the forecast plus room for its usual error." />
        <dl className="flex flex-col gap-2 text-small">
          <FigureRow term={`Forecast demand, ${countOf(horizon.months, "month")}`}>{formatDecimal(exact.demand, 2)}</FigureRow>
          <FigureRow term={`Safety stock, ${safetyZ} × σ ${formatDecimal(sigma, 2)} × √${horizon.months}`}>{formatDecimal(exact.safetyStock, 2)}</FigureRow>
          <FigureRow term="Units to plan for, rounded up" total>{`${formatDecimal(exact.total, 2)} → ${formatCount(recommendation.units)}`}</FigureRow>
        </dl>
        <p className="text-caption text-muted">
          {`σ is the root mean square of the method's one-step-ahead errors from ${sigmaFrom}. The plan is rounded up, so it never falls short of the arithmetic. ${NOT_A_REORDER}`}
        </p>
      </div>
    </CardPair>
  );
}

const SCOPE_GROUPS = [
  { type: "category", title: "Categories" },
  { type: "warehouse", title: "Warehouses" },
  { type: "region", title: "Regions" },
] as const;

/** Every category, warehouse and region forecast over the default horizon, each with its own method. */
function ScopeGrid() {
  const groups = SCOPE_GROUPS.map(({ type, title }) => ({
    title,
    forecasts: SCOPE_VALUES[type].map((value) => ({ value, forecast: forecastFor(forecastSpecSchema.parse({ tool: "forecast", scope: { type, value } })) })),
  }));
  const first = groups[0]?.forecasts[0];
  if (first === undefined) throw new Error("The data has no category to forecast");
  return (
    <section aria-labelledby="scopes-title" className="card card-body">
      <CardTitle
        id="scopes-title"
        title={`By scope, ${first.forecast.monthsLabel}`}
        caption={`Each scope picks its own method. Rough means WAPE over ${formatPercentPlain(ROUGH_WAPE)} before rounding: plan with care.`}
      />
      {groups.map(({ title, forecasts }) => (
        <div key={title} className="flex flex-col gap-2">
          <h3 className="text-label text-muted uppercase">{title}</h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-2.5">
            {forecasts.map(({ value, forecast }) => (
              <li key={value} data-scope-card className="flex flex-col gap-1 rounded-control border border-grid bg-inset p-3.5 text-small">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{value}</span>
                  {forecast.method.rough ? <Tag tone="neutral">rough</Tag> : null}
                </span>
                <span className="text-figure">
                  {formatCount(forecast.recommendation.units)} <span className="text-small font-normal tracking-normal text-muted">units</span>
                </span>
                <span className="text-ink-2">{`${formatCount(forecast.recommendation.demand)} forecast + ${formatCount(forecast.recommendation.safetyStock)} safety stock`}</span>
                <span className="text-note text-muted">{`${forecast.method.label} · WAPE ${chosenWape(forecast)}`}</span>
                {forecast.scopeNote === undefined ? null : <span className="text-note text-ink-2">{forecast.scopeNote}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** The Forecast page (ADR 0011 §5, ticket 25). Its controls run the forecast tool directly, with no model call. */
export default async function ForecastPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const choice = forecastChoice(await searchParams);
  const forecast = forecastFor(choice.spec);
  const { orders } = getDataset();
  return (
    <>
      <PageHeader
        label="Forecast"
        title="Demand forecast"
        description={`Units ordered per month, forecast from ${forecast.period} by order date. One scope at a time: all products, a category, a warehouse or a region.`}
      >
        <ForecastControls selection={choice} values={SCOPE_VALUES} />
      </PageHeader>
      {choice.offered ? null : (
        <p role="status" className="rounded-control border border-warn-line bg-warn-tint px-3.5 py-2.5 text-small text-warn-ink">
          That choice is not one this page offers, so it shows all products over 3 months.
        </p>
      )}
      <ChosenForecast forecast={forecast} />
      <HowChosen forecast={forecast} />
      <ScopeGrid />
      <aside className="flex flex-wrap items-center gap-3 rounded-card border border-grid bg-inset px-[18px] py-3.5 text-small text-ink-2">
        <Icon name="info" className="shrink-0 text-grey-green" />
        <span className="min-w-0 flex-[1_1_320px]">
          {`SKUs are not forecast: no SKU has more than ${formatCount(mostOrdersOfOneSku(orders))} orders. Ask about one, such as CRAYON-0008, to see its orders and its category's forecast.`}
        </span>
        <Link href={askHref(SKU_QUESTION)} className="chip">
          {SKU_QUESTION}
        </Link>
      </aside>
    </>
  );
}
