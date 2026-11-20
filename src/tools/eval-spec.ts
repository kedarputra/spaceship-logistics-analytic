import { getDataset } from "@/domain/orders";
import { dataPeriod, resolvePeriod } from "@/domain/periods";
import { DEFAULT_MONTHS, resolveTargetMonths } from "./forecast";
import { DEFAULT_PERIOD, effectiveDateField, effectiveSort } from "./query";
import type { Interpretation, QuerySpec } from "./spec";

/**
 * How the eval (ADR 0009 §12) compares an interpretation with the expected one, normalized so that
 * harmless differences are not misses: arrays sorted and repeats dropped, defaults filled in as the
 * tools fill them (the period, the sort, the date field after a status rewrite, a month's or
 * quarter's year, the forecast horizon), key order ignored, and an unsupported question compared
 * by its reason only, since the 3 examples are the model's pick. Everything else counts, the
 * ambiguous-word assumption included: it changes the note the user sees.
 */

type Period = NonNullable<QuerySpec["period"]>;

/** A month or quarter without a year gets the year the query tool reads it in: the latest on or before the anchor. */
function withYear(period: Period): Period {
  if ((period.type !== "month" && period.type !== "quarter") || period.year !== undefined) return period;
  const resolved = resolvePeriod(period, dataPeriod(getDataset().orders));
  return { ...period, year: Number(resolved.from.slice(0, 4)) };
}

function normalizeQuery(spec: QuerySpec): Record<string, unknown> {
  const { filters, period, sort: _sort, dateField: _dateField, limit, ...rest } = spec;
  const normalized: Record<string, unknown> = { ...rest, period: withYear(period ?? DEFAULT_PERIOD), dateField: effectiveDateField(spec) };
  // A single value is one row: a sort or a limit changes nothing.
  if (spec.groupBy !== undefined) {
    const order = effectiveSort(spec);
    if (order !== undefined) normalized.sort = order;
    if (limit !== undefined) normalized.limit = limit;
  }
  const sortedFilters = Object.entries(filters ?? {}).flatMap(([dimension, values]) =>
    values === undefined || values.length === 0 ? [] : [[dimension, [...new Set(values)].sort()] as const],
  );
  if (sortedFilters.length > 0) normalized.filters = Object.fromEntries(sortedFilters);
  return normalized;
}

export function normalizeInterpretation(interpretation: Interpretation): Record<string, unknown> {
  switch (interpretation.tool) {
    case "unsupported":
      return { tool: "unsupported", reason: interpretation.reason };
    case "forecast": {
      const { target, horizon, scope, ...rest } = interpretation;
      // The forecast tool matches a SKU in any case; the other scopes are resolved by the schema.
      const base = { ...rest, scope: scope.type === "sku" ? { ...scope, value: scope.value.toUpperCase() } : scope };
      if (target === undefined) return { ...base, horizon: horizon ?? { count: DEFAULT_MONTHS, unit: "month" } };
      const { from, to } = resolveTargetMonths(target, getDataset());
      return { ...base, target: { from, to } };
    }
    case "query":
      return normalizeQuery(interpretation);
  }
}

/** JSON with every object's keys in order, so two specs that differ only in key order compare equal. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sameInterpretation(expected: Interpretation, actual: Interpretation): boolean {
  return canonicalJson(normalizeInterpretation(expected)) === canonicalJson(normalizeInterpretation(actual));
}
