# 04: Dashboard charts

**What to build:** The dashboard shows three charts (R2): order volume over time, delivery outcomes over time, and delay rate by carrier. They are built on the period buckets of ADR 0002, which the query tool reuses later.

**Blocked by:** 03
_03 Dashboard KPI cards_

**Status:** done

- [ ] Bucketing: ISO weeks (Monday to Sunday) keyed and labelled by the Monday's date, never by (year, week number); calendar months; buckets clipped to the period, partial edge buckets flagged, empty buckets 0.
- [ ] Bucket tests: w/c 30 Dec 2024 clipped to 1–5 Jan 2025; w/c 29 Dec 2025 clipped to 29–31 Dec 2025; the two are separate buckets.
- [ ] Dates are handled as `YYYY-MM-DD` values in UTC; no local-timezone parsing.
- [ ] Orders per month by order date, as vertical bars (January 2025: 75 orders).
- [ ] Delivery outcomes per month by delivery date, as a stacked bar (on time / delayed / exception).
- [ ] Delay rate by carrier as horizontal bars sorted by value, with n on each label; GLS and DPD (fewer than 20 delivered orders) drawn lighter as small samples.
- [ ] Recharts, with the chart-type choice made by a shared function that follows ADR 0006's chart rules, so answers can reuse it.

## Comments

- 2026-11-20: Recharts 3.11.0 charts on the dashboard: orders per month by order date (vertical bars), delivery outcomes per month by delivery date (stacked on time / delayed / exception), and delay rate by carrier by delivery date (horizontal bars sorted by value, n on each label, GLS and DPD lighter as small samples), each with a caption naming its date field and a data table. Buckets in src/domain/periods: ISO weeks keyed and labelled by the Monday, calendar months, clipped to the period, partial edges flagged, empty buckets 0, all on YYYY-MM-DD strings in UTC. The chart type comes from chooseChart in src/tools/chart (ADR 0006 6). Verified: Vitest asserts the bucket edges (w/c 30 Dec 2024 clipped to 1-5 Jan 2025, w/c 29 Dec 2025 clipped to 29-31 Dec, 53 separate weeks), 10 delayed orders over 14 weekly buckets in Oct-Dec with the 7 golden values, Nov 3 and Dec 4, orders per month (Jan 75, all 12 months counted independently from the CSV), GLS 2/8, USPS 11/47, UPS 17/78, Royal Mail 5/25, and one test per chart rule; npm run check passes; the built page was checked in headless Edge at 1280 and 600 px. For ticket 09: Chart draws the three bar types only, so the answer view adds the line, the answer card, the 12-bar cap, and a single segmented bar for a status breakdown; week labels carry no year.
