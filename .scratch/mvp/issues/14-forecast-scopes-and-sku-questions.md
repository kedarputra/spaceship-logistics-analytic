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
- [ ] Found in the live check of ticket 13 with the real model (20 Nov 2026): the model copies the forecast facts' labels word for word. It writes "The months forecast is Jan–Mar 2026 with a forecast demand of 285 units. The units to plan for is 405." The template reads well: "Over Jan–Jun 2026, demand is forecast at 570 units; with 169 units of safety stock, that is 739 units to plan for." Phrase the forecast facts as natural phrases, or give the phrase prompt one example in the template's shape. The new scopes inherit whichever is done here.
- [ ] Found in the same check: "What will demand look like in 2027?" was read as a 24-month horizon and answered with Jan–Jun 2026; only the note said "instead of 24". When the asked months lie wholly beyond the 6-month reach (anything in 2027 here), the answer says so first: "The forecast reaches Jun 2026 at most; 2027 is beyond it." Only then does it show the furthest months it can.
