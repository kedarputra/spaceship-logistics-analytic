"use client";

import { type ForecastSelection, type ScopeType, type ScopeValues, selectionParams } from "./forecast-scopes";

/**
 * The category, warehouse or region to forecast: a plain GET form to /forecast, sent as soon as a value
 * is picked. Without script, its Show button sends it. The other parameters ride along as hidden fields.
 */
export function ScopeValuePicker({
  label,
  selection,
  values,
}: {
  label: string;
  selection: ForecastSelection & { scope: Exclude<ScopeType, "total"> };
  values: ScopeValues;
}) {
  const hidden = [...selectionParams(selection, values)].filter(([name]) => name !== "value");
  return (
    <form action="/forecast" method="get" className="inline-flex items-center gap-2">
      {hidden.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor="scope-value" className="sr-only">
        {label}
      </label>
      <select
        id="scope-value"
        name="value"
        defaultValue={selection.value}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="min-h-[34px] rounded-control border border-field bg-panel px-2.5 text-small text-ink"
      >
        {values[selection.scope].map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="button-small">
          Show
        </button>
      </noscript>
    </form>
  );
}
