# 0003: Forecasting: monthly units, four candidate methods, chosen per series on a 3-month holdout

Status: accepted
Date: 2026-11-20
Resolves: D7 in docs/decisions-open.md

## Context

There are 12 months of history (Jan–Dec 2025). A backtest fitted each method on Jan–Sep and scored it on Oct–Dec, over 23 series: the total, 8 categories, 9 warehouses, and 5 regions.

- Mean absolute error (MAE) averaged over the 23 series: all-history average 9.3 units/month, 3-month moving average 11.7, Holt (α 0.3, β 0.1, initial trend 0) 11.8, linear regression 13.8. The all-history average had the lowest error on 15 of the 23 series. On the total, the 3-month moving average did (16.2, against 18.9 for the average).
- January is a spike: 233 units against a Feb–Dec average of 98, over 75 orders from 26 clients (largest order: 10 units). It is not one bulk order. With one year of data, seasonality cannot be estimated. Every forecast from the anchor date starts in January 2026.
- Trend methods carry January's drop forward. On the total, the regression slope is −5.5 units/month with January and −0.35 without it.
- Holt has a starting-value trap: an initial trend taken from Jan→Feb (−147) drives the total's forecast to 0. A grid search for α and β on 9 points overfits (it picked β of 0.7–0.9 on most series).
- Forecast error is large: the winning method's error as a share of actual demand (WAPE) runs from 16% (total, ATL-DC1) to 296% (AMS-FC1).
- Weekly series are sparse (9–31 of 53 weeks empty per series). The UK region is served only by LON-FC1, so the two series are identical; every other region has 2 warehouses.
- SKUs: 313 have 1 order, 39 have 2, and 3 have 3 (CRAYON-0008, CRAYON-0017, PENCIL-0213).

## Decision

1. **Series.** Monthly units (`quantity`) by `order_date`. Scope: the total, one category, one warehouse, or one region, one dimension at a time; no combinations, no weekly series, no forecast of order counts or value. A UK forecast notes that UK is served only by LON-FC1.
2. **Candidates.** The all-history average (a moving average whose window is the whole history), the 3-month moving average, linear regression on the month index, and Holt's linear trend with fixed α 0.3, β 0.1, initial level = first month, initial trend 0. No parameter search.
3. **Selection.** Fit each candidate on all months except the last 3 and score it by MAE in units on those 3. Also report WAPE (total absolute error ÷ total actual); never MAPE, since 6 series have months with zero units. A tie goes to the simpler method, in the order average < moving average < regression < Holt. The winner is refit on all 12 months for the forecast, and forecasts are floored at 0.
4. **Explanation.** A table of every candidate's holdout MAE and WAPE, and the winner. The reason is stated **for that series**, never as a global claim: "On this series a flat level had the lowest error" when the average wins; "The 3-month moving average had the lowest error (95 units a month)" for the total. A forecast with WAPE over 50% is labelled "rough".
5. **January caveat**, shown whenever the horizon includes January, worded for the winning method:
   - All-history average: "January 2025's spike is averaged into the level (about +N units a month) instead of being repeated in January 2026." N is computed per series as the level with January minus the level without it (+11 on the total).
   - 3-month moving average: "January 2025's spike is outside the 3-month window, so the forecast does not repeat it."
   - Regression and Holt: "January 2025's spike tilts the fitted trend downward, and the forecast does not repeat it."
   - Every variant ends: "One year of data cannot show whether January repeats."
6. **Horizon.** 3 months when the question does not say; 1 to 6 allowed, longer requests are capped with a message. Beyond 3 months the explanation notes that error was measured only up to 3 months ahead. "Next N weeks" becomes whole months, with a note. A question that names months ("in 2027", "in Q2", "in March") gives a target instead of a count: the forecast runs from the first month after the data to the end of the target, within the 6-month reach. When every month asked about lies beyond the reach, the answer says so first ("The forecast reaches Jun 2026 at most; 2027 is beyond it.") and then shows the furthest months it can (ticket 14). When the months asked about start later than the first forecast month ("in Q2"), the answer gives their own demand first ("In Q2 2026 (Apr–Jun 2026), demand is forecast at 285 units."), then the units to plan for through their end (ticket 23).
7. **Inventory recommendation.** Plan = forecast demand over the horizon + safety stock, rounded up to whole units. Safety stock = 1.65 × σ × √horizon (one-sided 95% service level). σ is the RMSE of the chosen method's one-step-ahead errors over the history, each month predicted only from earlier months, **starting after a 3-month warm-up (first error: April 2025) for every method**. Starting in February lets the Jan→Feb miss of 147 units dominate: σ for the all-history average is 59.0 from February against 42.9 from April, which would inflate safety stock by about 37%. The wording is always "units to plan for", never a reorder quantity: the data has no on-hand stock.
8. **Chart.** History plus a dashed forecast line, with a two-sided band of ±1.96 × σ × √h at h months ahead, labelled "95% range" and floored at 0.
9. **SKU questions.** The forecast tool takes a SKU scope and, in one call, returns the SKU's order history, says why there is no SKU forecast (at most 3 orders per SKU), and returns the forecast for the SKU's category. An unknown SKU gets "No SKU X in the data" and the ID format (for example CRAYON-0008). No forecast is split by SKU share.

## Consequences

- Golden numbers for the total (tests): holdout MAE average 18.89, moving average 16.22, regression 35.21, Holt 25.24; winner: 3-month moving average, 95.0 units/month; σ 41.66; 3 months: forecast 285, safety stock 120, plan 405; 4 months: forecast 380, safety stock 138, plan 518; 95% band half-widths 81.6, 115.5, 141.4, 163.3 for months 1–4.
- Most category and warehouse forecasts will be labelled "rough". That is the honest result of 12 months of noisy data, and the README says so.
- The README covers the method comparison, the January caveat, the missing on-hand stock, and why SKUs are not forecast.
- A 3-month holdout is a noisy basis for picking a method; rolling-origin evaluation goes under future improvements.
