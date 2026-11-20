import { DIMENSION_VALUES, type ForecastSpec, forecastSpecSchema } from "@/tools/spec";
import { DEFAULT_MONTHS, defaultValue, type ForecastSelection, HORIZON_MONTHS, type HorizonMonths, SCOPE_TYPES, type ScopeType, type ScopeValues } from "./forecast-scopes";

/**
 * The Forecast page's choice, kept in its URL (ticket 25): a scope and a horizon, checked by the same
 * schema as a question's forecast spec, so the page runs the forecast tool with no model call.
 */

/** The values each scope can take: those in the data. */
export const SCOPE_VALUES: ScopeValues = { category: DIMENSION_VALUES.category, warehouse: DIMENSION_VALUES.warehouse, region: DIMENSION_VALUES.region };

export interface ForecastChoice extends ForecastSelection {
  spec: ForecastSpec;
  /** False when the URL asked for something the page does not offer, and the default stands in. */
  offered: boolean;
}

function specFor(scope: ScopeType, value: string | undefined, months: HorizonMonths) {
  return forecastSpecSchema.safeParse({
    tool: "forecast",
    scope: scope === "total" ? { type: scope } : { type: scope, value },
    horizon: { count: months, unit: "month" },
  });
}

const DEFAULT_SPEC = specFor("total", undefined, DEFAULT_MONTHS);

/** The choice in `?scope=category&value=CRAYON&months=6`; all products over 3 months when absent or not offered. */
export function forecastChoice(params: Record<string, string | string[] | undefined>): ForecastChoice {
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  if (!DEFAULT_SPEC.success) throw new Error("The default forecast spec does not pass its own schema");
  const fallback: ForecastChoice = { scope: "total", months: DEFAULT_MONTHS, spec: DEFAULT_SPEC.data, offered: false };
  const scope = SCOPE_TYPES.find((type) => type === (first("scope") ?? "total"));
  const months = HORIZON_MONTHS.find((count) => String(count) === (first("months") ?? String(DEFAULT_MONTHS)));
  if (scope === undefined || months === undefined) return fallback;
  const value = scope === "total" ? undefined : (first("value") ?? defaultValue(scope, SCOPE_VALUES));
  const parsed = specFor(scope, value, months);
  if (!parsed.success) return fallback;
  const { scope: checked } = parsed.data;
  return { scope, value: checked.type === "total" ? undefined : checked.value, months, spec: parsed.data, offered: true };
}
