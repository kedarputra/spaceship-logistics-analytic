import { formatCount, formatDecimal } from "@/domain/format";
import { SKU_NOT_FORECAST } from "@/tools/forecast";
import type { ForecastAnswer } from "@/tools/forecast-answer";
import { capitalized } from "@/tools/words";
import { DataTableDisclosure } from "./chart-card";
import { SummaryCard } from "./summary-card";
import type { TextTable } from "./text-table";

const WIDTH = 320;
const BASELINE = 84;
const TOP = 8;

/**
 * A small line of units ordered per month, then the forecast dashed with its 95% range as a band
 * (ADR 0003 §8, ADR 0011 §3). Its figures are in the card beside it and on the Ask page.
 */
function ForecastSparkline({ forecast }: { forecast: ForecastAnswer }) {
  const { history, forecastMonths } = forecast;
  const count = history.length + forecastMonths.length;
  const top = Math.max(1, ...history.map(({ units }) => units), ...forecastMonths.map(({ high }) => high));
  const x = (index: number) => (count < 2 ? 0 : (index / (count - 1)) * WIDTH);
  const y = (units: number) => BASELINE - (units / top) * (BASELINE - TOP);
  const point = (index: number, units: number) => `${x(index).toFixed(2)},${y(units).toFixed(2)}`;
  const lastIndex = history.length - 1;
  const last = history.at(-1);
  if (last === undefined) return null;
  const ahead = forecastMonths.map((month, offset) => ({ ...month, index: history.length + offset }));
  const band = [
    point(lastIndex, last.units),
    ...ahead.map(({ index, high }) => point(index, high)),
    ...ahead.toReversed().map(({ index, low }) => point(index, low)),
  ].join(" ");
  return (
    <svg
      viewBox={`-6 0 ${WIDTH + 12} 92`}
      role="img"
      aria-label={`Units ordered per month, ${forecast.period}, and the forecast with its 95% range for ${forecast.monthsLabel}`}
      className="block h-auto min-w-0 flex-[1_1_220px]"
    >
      <polygon points={band} className="fill-amber/30 stroke-none" />
      <line x1="0" y1={BASELINE} x2={WIDTH} y2={BASELINE} className="stroke-axis" strokeWidth={1} />
      <polyline
        points={history.map(({ units }, index) => point(index, units)).join(" ")}
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-mark-on-time"
      />
      <polyline
        points={[point(lastIndex, last.units), ...ahead.map(({ index, units }) => point(index, units))].join(" ")}
        fill="none"
        strokeWidth={2}
        strokeDasharray="5 4"
        strokeLinecap="round"
        className="stroke-forecast-line"
      />
    </svg>
  );
}

/** The line's values: units ordered per month, then each forecast month with its 95% range. */
function sparklineTable(forecast: ForecastAnswer): TextTable {
  return {
    headers: ["Month", "Units ordered", "Forecast", "95% range"],
    rows: [
      ...forecast.history.map((month) => [month.label, formatCount(month.units), "", ""]),
      ...forecast.forecastMonths.map((month) => [month.label, "", formatDecimal(month.units), `${formatDecimal(month.low)}–${formatDecimal(month.high)}`]),
    ],
  };
}

/** The Overview's forecast card (ticket 24): the plan for the next months, its breakdown, the method and the line. */
export function ForecastSummary({ forecast, href }: { forecast: ForecastAnswer; href: string }) {
  const { recommendation, method } = forecast;
  return (
    <SummaryCard
      id="forecast-title"
      title="Demand forecast"
      caption={`${capitalized(forecast.scopeLabel)} · units ordered per month`}
      badge={
        <span className="pill border border-chip-line bg-chip text-green-text">
          {method.label}
          {method.rough ? <span className="font-normal text-ink-2">· rough forecast</span> : null}
        </span>
      }
      link={{ href, label: "Forecast details" }}
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-small font-semibold text-ink-2">{`Units to plan for, ${forecast.monthsLabel}`}</span>
          <span className="text-plan">{formatCount(recommendation.units)}</span>
          <span className="text-small text-muted">{`${formatCount(recommendation.demand)} forecast + ${formatCount(recommendation.safetyStock)} safety stock`}</span>
        </div>
        <ForecastSparkline forecast={forecast} />
      </div>
      <DataTableDisclosure table={sparklineTable(forecast)} />
      <p className="text-small text-ink-2">{`Forecasts also run for one category, warehouse or region. ${SKU_NOT_FORECAST}`}</p>
    </SummaryCard>
  );
}
