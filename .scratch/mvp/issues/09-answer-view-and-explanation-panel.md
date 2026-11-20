# 09: Answer view, explanation panel and follow-up chips

**What to build:** A user clicks an example question and sees the answer: a chart chosen by code, the result table, and a collapsible explanation panel that shows exactly how the number was computed (R4, R5). Follow-up chips built by code run variants of the answer through `/api/run`.

**Blocked by:** 08
_08 Query tool behind /api/run_

**Status:** ready-for-agent

- [ ] Chart rules from ADR 0006 §6: answer card for a single value, vertical bars for time with a count, a line for time with a rate or average, horizontal bars for one category (at most 12, then "N more in the table"), stacked bars for shares, small samples drawn lighter with n, no pie charts, and the table always shown.
- [ ] The explanation panel from ADR 0006 §7, collapsed by default: interpretation in words written by code, resolved period with dates and date field, filters with resolved values, the metric definition, any rewrite applied, the validated spec as JSON, the result table to 2 decimals, matching orders up to 50 then "and N more".
- [ ] Follow-up chips built by code and run through `/api/run`: "December 2025 instead?" on a last-month answer (ADR 0002 §3); "Only carriers with ≥ 20 deliveries" when the top group is a small sample; the alternatives for ambiguous defaults in ADR 0006 §8.
- [ ] Example chips for the three R3 questions run prebuilt specs for now; ticket 10 turns them into real questions.
- [ ] Nothing from a spec, a value, or (later) the model is rendered as HTML; all text is escaped.
- [ ] An error area shows the messages the API returns (validation errors now; AI and rate-limit messages later).
