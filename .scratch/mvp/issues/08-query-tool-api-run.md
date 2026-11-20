# 08: Query tool behind `/api/run`

**What to build:** A validated query spec posted to `POST /api/run` returns the computed answer data for any question inside the whitelist of ADR 0006, with no LLM involved. This is the computation half of R3 and R8, and the R3 golden numbers are proved here.

**Blocked by:** 03, 04
_03 Dashboard KPI cards · 04 Dashboard charts_

**Status:** ready-for-agent

- [ ] A Zod query-spec schema in the tools layer is the whitelist (ADR 0006 §1, §3–5): the 11 metrics with their fixed date fields, at most one group-by, the built-in delivery outcomes over time, filters, sort, limit 1–20. Unknown fields are rejected, never guessed. Tags use `z.enum`, never `z.literal` (ADR 0009).
- [ ] Symbolic periods are resolved against the anchor date by a pure function (ADR 0002 §1, §3, §6): previous unit, last N units, this unit, last N days, named months and quarters without a year, absolute ranges; a period with no data returns the "No data for … The data covers …" message.
- [ ] Date-field rule and the `dateField: "order_date"` override (ADR 0002 §5).
- [ ] The status-filter rewrite table (ADR 0006 §2), one test per row.
- [ ] Value matching: case-insensitive; origin and destination also match the city name before the comma; near misses get "did you mean"; unknown values are rejected. A test asserts the city-name facts in ADR 0006.
- [ ] Rankings follow the small-sample cases in ADR 0001 §6, including "no group reaches 20".
- [ ] Results carry n per group, small-sample flags, the resolved period and date field, any rewrite applied, and for counts the matching orders (up to 50, plus the total).
- [ ] `/api/run` rejects bodies over 16 KB before doing any work.
- [ ] Golden tests through `/api/run`: "delivered late last month" = 3 (1–30 Nov 2025, by delivery date); "delayed orders by week for the last 3 months" = 10 over 14 weekly buckets with the 7 non-zero values in `docs/data.md`; "highest delay rate by carrier" flags GLS (2/8) and names USPS (23.4%, 11/47).
- [ ] KPIs come from the definitions module of ticket 03; there is no second definition.
