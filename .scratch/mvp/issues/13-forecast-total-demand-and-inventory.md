# 13: Forecast: total demand and inventory plan

**What to build:** A user asks for a demand forecast or an inventory plan for the total and gets forecast values, a chart of history plus forecast with a 95% range, an inventory recommendation, and an explanation of how the method was chosen (R9, ADR 0003). Forecast specs run through `/api/run`, and through `/api/ask` once ticket 10 is done.

**Blocked by:** 09
_09 Answer view, explanation panel and follow-up chips_

**Status:** ready-for-agent

- [ ] Monthly units by order date; four candidates as in ADR 0003 §2 (all-history average, 3-month moving average, linear regression, Holt with α 0.3, β 0.1, initial trend 0).
- [ ] Selection as in ADR 0003 §3: fit on all but the last 3 months, MAE and WAPE on those 3, ties to the simpler method, refit the winner on all 12 months, floor at 0.
- [ ] Horizon as in ADR 0003 §6: 3 by default, 1–6 allowed, longer capped with a message, the beyond-3-months note, weeks converted to months.
- [ ] The January caveat worded for the winning method, with the level lift computed per series (ADR 0003 §5).
- [ ] Inventory plan as in ADR 0003 §7: forecast plus 1.65 × σ × √horizon, σ from one-step-ahead errors starting April 2025, rounded up, worded "units to plan for".
- [ ] Chart: history, a dashed forecast, and a ±1.96 × σ × √h band labelled "95% range", floored at 0 (ADR 0003 §8). The explanation panel shows every candidate's MAE and WAPE and the winner, with the reason stated for this series.
- [ ] Golden tests from ADR 0003's consequences: MAE 18.89 / 16.22 / 35.21 / 25.24; winner 3-month moving average at 95.0 a month; σ 41.66; plans 405 (3 months) and 518 (4 months); band half-widths 81.6, 115.5, 141.4, 163.3.
