# 0002: Relative periods are resolved in code against an anchor date taken from the data

Status: accepted
Date: 2026-11-20
Resolves: D5 in docs/decisions-open.md

## Context

The data ends on 2025-12-31 (the last `delivery_date`; the last `order_date` is 2025-12-30). Against the real date (November 2026), every relative period is empty. "Late last month" has four readings, depending on which month is "last" and which date field counts, giving 3 or 4 orders. Weekly charts cross partial weeks at both ends of a period: Oct–Dec 2025 spans 14 ISO weeks, from w/c 29 Sep to w/c 29 Dec, and only 7 of them contain a delayed delivery.

ISO week numbers do not follow calendar years. 1–5 Jan 2025 fall in ISO week 1 of 2025 (w/c 30 Dec 2024), and 29–31 Dec 2025 fall in ISO week 1 of 2026 (w/c 29 Dec 2025). Both have calendar year 2025 and week number 1.

## Decision

1. **Resolution happens in code.** The LLM puts a symbolic period in the query spec: the previous unit, the last N units, this unit, the last N days, a named month or quarter, or an absolute range copied from the question as written. A pure function resolves it against the anchor date into an inclusive `from`/`to`. The LLM never computes a date.
2. **The anchor date** is the latest `order_date` or `delivery_date` in the data, computed when the data loads (2025-12-31), never hard-coded. The header shows "Data as of 31 Dec 2025".
3. **Relative-period rule:**
   - "Last <unit>" = the full unit before the anchor's unit. Last month = 1–30 Nov 2025; last week = 22–28 Dec 2025.
   - "Last N <units>" = N units ending with, and including, the anchor's unit. Last 3 months = 1 Oct–31 Dec 2025.
   - "This <unit>" = the anchor's unit. "Last N days" = N days ending on the anchor, inclusive.
   - Every explanation shows the resolved dates ("Last month = 1–30 Nov 2025"). An answer about "last month" also offers the anchor's month as a suggested follow-up ("December 2025 instead?"), which runs as its own spec.
4. **Buckets.** Weeks are ISO weeks, Monday to Sunday, keyed and labelled by the Monday's date ("w/c 6 Oct"), **never by (calendar year, ISO week number)**, which would merge the two week-1 edges above into one bucket. Months are calendar months. Every bucket is clipped to the period, partial edge buckets are marked in the explanation ("w/c 29 Sep: 1–5 Oct only"), and empty buckets are 0, not gaps.
5. **Date field.** Order count, units, and order value filter on `order_date`. Delivery outcomes filter on `delivery_date`: delivered, on time, delayed, exception, their rates, and delivery time. The spec has an optional `dateField: "order_date"` override, set only when the question names the order date ("delayed orders *placed* last month"). The explanation always states the field ("filtered by delivery date").
6. **Named and out-of-range periods.** A named month, quarter, or weekday without a year resolves to its latest occurrence on or before the anchor ("March" = March 2025, "Q3" = Jul–Sep 2025). A period with no data returns "No data for 1 Jan–31 Dec 2024. The data covers 1 Jan–31 Dec 2025." and no chart. A future period goes to the forecast tool if the question is about demand; otherwise it is not supported, with example questions.

## Consequences

- Golden numbers for the R3 questions: "How many orders were delivered late last month?" = 3 (November 2025, by delivery date). "Show delayed orders by week for the last 3 months" = 10 delayed orders over 14 weekly buckets by delivery date, 7 of them non-zero: w/c 6 Oct 2, 13 Oct 1, 3 Nov 1, 17 Nov 2, 1 Dec 1, 8 Dec 1, 15 Dec 2.
- Required unit tests for bucketing: w/c 30 Dec 2024 clipped to 1–5 Jan 2025; w/c 29 Dec 2025 clipped to 29–31 Dec 2025; the two are separate buckets.
- Date-only values are handled in UTC (or as `YYYY-MM-DD` strings) everywhere. A local-timezone parse would move orders across bucket edges.
- The README states the anchor date, the relative-period rule, and the date-field rule.
