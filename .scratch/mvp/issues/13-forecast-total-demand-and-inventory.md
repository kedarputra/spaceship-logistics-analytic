# 13: Forecast: total demand and inventory plan

**What to build:** A user asks for a demand forecast or an inventory plan for the total and gets forecast values, a chart of history plus forecast with a 95% range, an inventory recommendation, and an explanation of how the method was chosen (R9, ADR 0003). Forecast specs run through `/api/run`, and through `/api/ask` once ticket 10 is done.

**Blocked by:** 09
_09 Answer view, explanation panel and follow-up chips_

**Status:** done

- [ ] Monthly units by order date; four candidates as in ADR 0003 §2 (all-history average, 3-month moving average, linear regression, Holt with α 0.3, β 0.1, initial trend 0).
- [ ] Selection as in ADR 0003 §3: fit on all but the last 3 months, MAE and WAPE on those 3, ties to the simpler method, refit the winner on all 12 months, floor at 0.
- [ ] Horizon as in ADR 0003 §6: 3 by default, 1–6 allowed, longer capped with a message, the beyond-3-months note, weeks converted to months.
- [ ] The January caveat worded for the winning method, with the level lift computed per series (ADR 0003 §5).
- [ ] Inventory plan as in ADR 0003 §7: forecast plus 1.65 × σ × √horizon, σ from one-step-ahead errors starting April 2025, rounded up, worded "units to plan for".
- [ ] Chart: history, a dashed forecast, and a ±1.96 × σ × √h band labelled "95% range", floored at 0 (ADR 0003 §8). The explanation panel shows every candidate's MAE and WAPE and the winner, with the reason stated for this series.
- [ ] Golden tests from ADR 0003's consequences: MAE 18.89 / 16.22 / 35.21 / 25.24; winner 3-month moving average at 95.0 a month; σ 41.66; plans 405 (3 months) and 518 (4 months); band half-widths 81.6, 115.5, 141.4, 163.3.

## Comments

- 2026-11-20: Built the forecast tool for total demand (src/tools/forecast.ts): monthly units by order date, the four ADR 0003 candidates, selection on the last 3 months by MAE with WAPE and ties to the simpler method, refit on all months floored at 0, σ from one-step errors from Apr 2025, the inventory recommendation (forecast + 1.65·σ·√h, rounded up, 'units to plan for'), a 95% range of ±1.96·σ·√h floored at 0, the horizon rules and the January caveat per method. Answers through /api/run and /api/ask with a template sentence or a model sentence checked by the number guard (plus 'rough' required and no reorder wording); other scopes answer 'not available yet'. Card with chart (history, dashed forecast, 95% range), monthly table and an explanation panel with every candidate's MAE and WAPE. Verified by golden tests from ADR 0003 (MAE 18.89/16.22/35.21/25.24, 95.0 a month, σ 41.66, 405 = 285 + 120, 518 = 380 + 138, half-widths 81.6/115.5/141.4/163.3), npm run check, and the built app in headless Edge against a local fake gateway.
