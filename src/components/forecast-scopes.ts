/**
 * The Forecast page's choices (ticket 25): the scope types and the horizons it offers. No imports, so
 * the browser's controls can use them without loading the data.
 */

export const SCOPE_TYPES = ["total", "category", "warehouse", "region"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const HORIZON_MONTHS = [1, 3, 6] as const;
export type HorizonMonths = (typeof HORIZON_MONTHS)[number];

export const DEFAULT_MONTHS: HorizonMonths = 3;

/** The values each scope can take: those in the data, passed to the browser by the page. */
export type ScopeValues = Record<Exclude<ScopeType, "total">, readonly string[]>;

/** A choice on the Forecast page: a scope, its value, and the horizon. */
export interface ForecastSelection {
  scope: ScopeType;
  /** The category, warehouse or region; none for all products. */
  value?: string;
  months: HorizonMonths;
}

/** A scope's value when the URL names none: its first. */
export function defaultValue(scope: Exclude<ScopeType, "total">, values: ScopeValues): string {
  const [first] = values[scope];
  if (first === undefined) throw new Error(`The data has no ${scope}`);
  return first;
}

/** A choice whose scope value is known, as a link names it. */
export type KnownChoice = { scope: "total"; months: HorizonMonths } | { scope: Exclude<ScopeType, "total">; value: string; months: HorizonMonths };

/** A choice as URL parameters: none for all products over 3 months; the horizon left out at its default. */
export function choiceParams(choice: KnownChoice): URLSearchParams {
  const params = new URLSearchParams();
  if (choice.scope !== "total") {
    params.set("scope", choice.scope);
    params.set("value", choice.value);
  }
  if (choice.months !== DEFAULT_MONTHS) params.set("months", String(choice.months));
  return params;
}

/** A selection as URL parameters, a scope without a value taking its first. */
export function selectionParams({ scope, value, months }: ForecastSelection, values: ScopeValues): URLSearchParams {
  return choiceParams(scope === "total" ? { scope, months } : { scope, value: value ?? defaultValue(scope, values), months });
}

/** The Forecast page for a choice's parameters: "/forecast?scope=category&value=CRAYON", or just /forecast for the default. */
export function forecastHref(params: URLSearchParams): string {
  const query = params.toString();
  return query === "" ? "/forecast" : `/forecast?${query}`;
}
