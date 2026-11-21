"use client";

import type { ChangeEvent } from "react";

/**
 * The Reports page's month picker (ticket 34): a GET form with one menu of the data's months, so every
 * month's report is a URL (`/reports?month=2025-11`). Picking a month opens it; without script, the
 * Show button does.
 */
export function MonthPicker({ path, months, value }: { path: string; months: readonly { value: string; label: string }[]; value: string }) {
  const open = (event: ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();
  return (
    <form action={path} method="get" aria-label="Choose the month" className="flex flex-wrap items-center gap-2">
      <label htmlFor="report-month" className="text-small font-semibold text-ink-2">
        Month
      </label>
      <select id="report-month" name="month" key={value} defaultValue={value} onChange={open} className="field h-[34px] px-2.5 text-small">
        {months.map((month) => (
          <option key={month.value} value={month.value}>
            {month.label}
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
