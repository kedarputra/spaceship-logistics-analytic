# 04: Dashboard charts

**What to build:** The dashboard shows three charts (R2): order volume over time, delivery outcomes over time, and delay rate by carrier. They are built on the period buckets of ADR 0002, which the query tool reuses later.

**Blocked by:** 03
_03 Dashboard KPI cards_

**Status:** ready-for-agent

- [ ] Bucketing: ISO weeks (Monday to Sunday) keyed and labelled by the Monday's date, never by (year, week number); calendar months; buckets clipped to the period, partial edge buckets flagged, empty buckets 0.
- [ ] Bucket tests: w/c 30 Dec 2024 clipped to 1–5 Jan 2025; w/c 29 Dec 2025 clipped to 29–31 Dec 2025; the two are separate buckets.
- [ ] Dates are handled as `YYYY-MM-DD` values in UTC; no local-timezone parsing.
- [ ] Orders per month by order date, as vertical bars (January 2025: 75 orders).
- [ ] Delivery outcomes per month by delivery date, as a stacked bar (on time / delayed / exception).
- [ ] Delay rate by carrier as horizontal bars sorted by value, with n on each label; GLS and DPD (fewer than 20 delivered orders) drawn lighter as small samples.
- [ ] Recharts, with the chart-type choice made by a shared function that follows ADR 0006's chart rules, so answers can reuse it.
