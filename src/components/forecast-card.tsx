import { formatCount, formatDecimal, formatPercent } from "@/domain/format";
import { formatDate } from "@/domain/periods";
import { NOT_A_REORDER, RANGE_Z, SAFETY_Z, type SkuHistory } from "@/tools/forecast";
import type { ForecastAnswer } from "@/tools/forecast-answer";
import { ForecastChart, type ForecastChartRow } from "./forecast-chart";
import { Fact, Table } from "./text-table";

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

function ForecastPanel({ forecast }: { forecast: ForecastAnswer }) {
  const { exact, horizon, method, recommendation } = forecast;
  return (
    <details className="mt-4 rounded-md border border-slate-200 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">How this was forecast</summary>
      <dl className="mt-3 space-y-2">
        <Fact term="Interpretation">{forecast.interpretation}</Fact>
        <Fact term="Method">{forecast.roughNote === undefined ? method.reason : `${method.reason} ${forecast.roughNote}`}</Fact>
        <Fact term="How chosen">
          {`Each method was fitted on the months before ${forecast.holdout} and scored on ${forecast.holdout} by mean absolute error (MAE); a tie goes to the simpler method. The winner was refit on all ${forecast.history.length} months, and forecasts are floored at 0.`}
        </Fact>
        <Fact term="Safety stock">
          {`σ = ${formatDecimal(forecast.sigma, 2)} units: the root mean square of the method's one-step-ahead errors from ${forecast.sigmaFrom}, each month predicted only from earlier ones. Safety stock = ${SAFETY_Z} × σ × √${horizon.months} = ${formatDecimal(exact.safetyStock, 2)} units, for a 95% service level.`}
        </Fact>
        <Fact term="Units to plan for">
          {`${formatDecimal(exact.demand, 2)} + ${formatDecimal(exact.safetyStock, 2)} = ${formatDecimal(exact.total, 2)}, rounded up to ${formatCount(recommendation.units)} units to plan for. ${NOT_A_REORDER}`}
        </Fact>
        <Fact term="95% range">{`Forecast ± ${RANGE_Z} × σ × √(months ahead), floored at 0.`}</Fact>
        <Fact term="Spec">
          <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(forecast.spec, null, 2)}</pre>
        </Fact>
      </dl>
      <h3 className="mt-4 font-medium text-slate-700">{`Error on ${forecast.holdout}`}</h3>
      <div className="overflow-x-auto">
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
      <h3 className="mt-4 font-medium text-slate-700">{`Units ordered per month, ${forecast.period}`}</h3>
      <div className="overflow-x-auto">
        <Table headers={["Month", "Units"]} rows={forecast.history.map((month) => [month.label, formatCount(month.units)])} />
      </div>
    </details>
  );
}

/** A SKU question (ADR 0003 §9): the SKU's own orders and why it is not forecast, ahead of its category's forecast. */
function SkuOrders({ sku }: { sku: SkuHistory }) {
  return (
    <section className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
      <h3 className="font-medium text-slate-700">{`SKU ${sku.id}`}</h3>
      <p className="mt-1">{sku.reason}</p>
      <div className="overflow-x-auto">
        <Table
          headers={["Order", "Order date", "Units", "Warehouse"]}
          rows={sku.orders.map((order) => [order.orderId, formatDate(order.orderDate), formatCount(order.quantity), order.warehouse])}
        />
      </div>
    </section>
  );
}

export function ForecastCard({ forecast }: { forecast: ForecastAnswer }) {
  const { recommendation } = forecast;
  const notes = [forecast.scopeNote, forecast.januaryCaveat, ...forecast.horizon.notes].filter((note) => note !== undefined);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      {forecast.horizon.reachNote === undefined ? null : <p className="mb-2 text-base font-medium text-slate-900">{forecast.horizon.reachNote}</p>}
      <p className="text-base text-slate-900">{forecast.sentence}</p>
      <p className="mt-1 text-sm text-slate-600">{forecast.interpretation}</p>
      {forecast.sku === undefined ? null : <SkuOrders sku={forecast.sku} />}
      {forecast.roughNote === undefined ? null : (
        <p className="mt-2 text-sm">
          <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-900">Rough forecast</span>
          {` ${forecast.roughNote}`}
        </p>
      )}
      <div className="mt-3">
        <p className="text-sm text-slate-600">{`Units to plan for, ${forecast.monthsLabel}`}</p>
        <p className="text-4xl font-semibold">
          {formatCount(recommendation.units)}
          <span className="text-base font-normal text-slate-600">
            {` · ${formatCount(recommendation.demand)} forecast + ${formatCount(recommendation.safetyStock)} safety stock`}
          </span>
        </p>
      </div>
      <div className="mt-3">
        <ForecastChart rows={forecastChartRows(forecast)} />
      </div>
      <div className="mt-3 overflow-x-auto">
        <Table
          headers={["Month", "Forecast", "95% range"]}
          rows={forecast.forecastMonths.map((month) => [
            month.label,
            formatDecimal(month.units),
            `${formatDecimal(month.low)}–${formatDecimal(month.high)}`,
          ])}
        />
      </div>
      {notes.length === 0 ? null : (
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          {notes.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      <ForecastPanel forecast={forecast} />
    </article>
  );
}
