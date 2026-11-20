import { formatCount, formatDecimal, formatPercent } from "@/domain/format";
import { formatDate } from "@/domain/periods";
import { FORECAST_CHART_REASON } from "@/tools/chart";
import { NOT_A_REORDER, RANGE_Z, type SkuHistory } from "@/tools/forecast";
import type { ForecastAnswer } from "@/tools/forecast-answer";
import type { TraceStage } from "@/tools/trace-stage";
import { AskedQuestion, ExplanationCard, PanelHeading, SentenceBadge, SpecBlock } from "./answer-parts";
import { CachedNote } from "./cached-note";
import { ForecastChart, type ForecastChartRow } from "./forecast-chart";
import { Fact, Table } from "./text-table";
import { ChartAndTraceFacts } from "./trace-strip";

/**
 * A forecast as the user sees it (R9, ADR 0003 §4, §7–8): the sentence, the units to plan for, the
 * chart with its 95% range, each month's forecast, the caveats, and an explanation panel with every
 * candidate's holdout error. Every value arrives computed; this file only formats it.
 */

/** History, then the forecast; the forecast line starts at the last actual month so the two meet. */
export function forecastChartRows(forecast: ForecastAnswer): ForecastChartRow[] {
  const lastIndex = forecast.history.length - 1;
  const history = forecast.history.map(
    (month, index): ForecastChartRow => ({
      label: month.label,
      history: month.units,
      forecast: index === lastIndex ? month.units : null,
      range: null,
    }),
  );
  const ahead = forecast.forecastMonths.map(
    (month): ForecastChartRow => ({ label: month.label, history: null, forecast: month.units, range: [month.low, month.high] }),
  );
  return [...history, ...ahead];
}

function ForecastPanel({ forecast, trace }: { forecast: ForecastAnswer; trace?: TraceStage[] }) {
  const { exact, horizon, method, recommendation } = forecast;
  return (
    <ExplanationCard title="How this was forecast">
      <dl className="flex flex-col gap-2.5">
        <Fact term="Interpretation">{forecast.interpretation}</Fact>
        <Fact term="Method">{forecast.roughNote === undefined ? method.reason : `${method.reason} ${forecast.roughNote}`}</Fact>
        <Fact term="How chosen">
          {`Each method was fitted on the months before ${forecast.holdout} and scored on ${forecast.holdout} by mean absolute error (MAE); a tie goes to the simpler method. The winner was refit on all ${forecast.history.length} months, and forecasts are floored at 0.`}
        </Fact>
        <Fact term="Safety stock">
          {`σ = ${formatDecimal(forecast.sigma, 2)} units: the root mean square of the method's one-step-ahead errors from ${forecast.sigmaFrom}, each month predicted only from earlier ones. Safety stock = ${forecast.safetyZ} × σ × √${horizon.months} = ${formatDecimal(exact.safetyStock, 2)} units, for a 95% service level.`}
        </Fact>
        <Fact term="Units to plan for">
          {`${formatDecimal(exact.demand, 2)} + ${formatDecimal(exact.safetyStock, 2)} = ${formatDecimal(exact.total, 2)}, rounded up to ${formatCount(recommendation.units)} units to plan for. ${NOT_A_REORDER}`}
        </Fact>
        <Fact term="95% range">{`Forecast ± ${RANGE_Z} × σ × √(months ahead), floored at 0.`}</Fact>
        <ChartAndTraceFacts chartReason={FORECAST_CHART_REASON} trace={trace} />
      </dl>
      <div className="flex flex-col gap-1.5">
        <PanelHeading>Spec, as validated</PanelHeading>
        <SpecBlock spec={forecast.spec} />
      </div>
      <div className="flex flex-col gap-1.5">
        <PanelHeading>{`Error on ${forecast.holdout}`}</PanelHeading>
        <Table
          headers={["Method", "MAE (units a month)", "WAPE", "Absolute error / actual units", ""]}
          rows={forecast.candidates.map((candidate) => [
            candidate.label,
            formatDecimal(candidate.mae, 2),
            formatPercent(candidate.wape),
            `${formatDecimal(candidate.absoluteError, 2)} / ${formatCount(candidate.actualUnits)}`,
            candidate.method === method.id ? "Chosen" : "",
          ])}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <PanelHeading>{`Units ordered per month, ${forecast.period}`}</PanelHeading>
        <Table headers={["Month", "Units"]} rows={forecast.history.map((month) => [month.label, formatCount(month.units)])} />
      </div>
    </ExplanationCard>
  );
}

/** A SKU question (ADR 0003 §9): the SKU's own orders and why it is not forecast, ahead of its category's forecast. */
function SkuOrders({ sku }: { sku: SkuHistory }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-control border border-grid bg-inset p-3.5 text-small">
      <h3 className="font-semibold">{`SKU ${sku.id}`}</h3>
      <p>{sku.reason}</p>
      <Table
        headers={["Order", "Order date", "Units", "Warehouse"]}
        rows={sku.orders.map((order) => [order.orderId, formatDate(order.orderDate), formatCount(order.quantity), order.warehouse])}
      />
    </section>
  );
}

export function ForecastCard({ question, forecast, cached, trace }: { question?: string; forecast: ForecastAnswer; cached?: boolean; trace?: TraceStage[] }) {
  const { recommendation } = forecast;
  const notes = [forecast.scopeNote, forecast.januaryCaveat, ...forecast.horizon.notes].filter((note) => note !== undefined);
  return (
    <>
      <article aria-label="Forecast" className="card flex flex-col gap-3.5 p-5">
        <AskedQuestion question={question} />
        {forecast.horizon.reachNote === undefined ? null : <p className="text-sentence">{forecast.horizon.reachNote}</p>}
        <p className="max-w-[68ch] text-sentence text-pretty">{forecast.sentence}</p>
        <div className="flex flex-wrap items-center gap-2">
          <SentenceBadge source={forecast.sentenceSource} />
          <CachedNote cached={cached} />
          <span className="text-caption text-muted">{forecast.interpretation}</span>
        </div>
        {forecast.sku === undefined ? null : <SkuOrders sku={forecast.sku} />}
        {forecast.roughNote === undefined ? null : (
          <p className="text-small text-ink-2">
            <span className="pill mr-1.5 bg-track">Rough forecast</span>
            {forecast.roughNote}
          </p>
        )}
        <div className="flex flex-col gap-0.5">
          <span className="text-small font-semibold text-ink-2">{`Units to plan for, ${forecast.monthsLabel}`}</span>
          <p className="text-plan">
            {formatCount(recommendation.units)}
            <span className="text-input font-normal tracking-normal text-muted">
              {` · ${formatCount(recommendation.demand)} forecast + ${formatCount(recommendation.safetyStock)} safety stock`}
            </span>
          </p>
        </div>
        <ForecastChart rows={forecastChartRows(forecast)} />
        <Table
          headers={["Month", "Forecast", "95% range"]}
          rows={forecast.forecastMonths.map((month) => [month.label, formatDecimal(month.units), `${formatDecimal(month.low)}–${formatDecimal(month.high)}`])}
        />
        {notes.length === 0 ? null : (
          <ul className="flex flex-col gap-1 text-small text-ink-2">
            {notes.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        )}
      </article>
      <ForecastPanel forecast={forecast} trace={trace} />
    </>
  );
}
