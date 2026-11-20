# 14: Forecast: scopes and SKU questions

**What to build:** Forecasts work for one category, one warehouse, or one region, and a question about a single SKU gets an honest answer: its order history, why it cannot be forecast, and its category's forecast in the same answer (ADR 0003 §1, §4, §9).

**Blocked by:** 13
_13 Forecast: total demand and inventory plan_

**Status:** ready-for-agent

- [ ] Category, warehouse, and region scopes, one at a time; no combinations; a UK forecast notes that UK is served only by one warehouse.
- [ ] A forecast whose WAPE is over 50% is labelled "rough"; the reason sentence is stated for that series, never as a global claim.
- [ ] A SKU scope returns, in one tool call, the SKU's orders, the reason there is no SKU forecast (at most 3 orders per SKU), and the forecast for the SKU's category; no forecast is split by SKU share.
- [ ] An unknown SKU gets "No SKU … in the data" and the ID format (for example CRAYON-0008).
- [ ] Tests with expected values computed independently from the CSV: the CRAYON and BOOK monthly series in `docs/data.md`, one category's winning method and plan, a SKU with 3 orders (CRAYON-0008), and an unknown SKU.
