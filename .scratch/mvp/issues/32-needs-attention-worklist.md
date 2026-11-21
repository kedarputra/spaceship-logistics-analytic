# 32: Needs attention: the exceptions worklist

**What to build:** A page that lists the orders someone should act on, oldest first, the way a WMS exception queue does, plus an alert line on Overview.

The data holds a clear case. 27 orders are still in transit at the anchor date, and 26 of them were placed more than 12 days before it. 12 days is the longest any of the 370 completed orders took. The median age of the 27 is 223 days. Today nothing in the app points at them.

Asked by the user on 21 Nov 2026: "add the features and functions of well-known WMS systems". This and ticket 33 cover the ones the data can support.

**Blocked by:** 31
_31 Sign-in and roles (RBAC)_

**Status:** ready-for-agent

- [ ] **Definitions** in `src/domain/definitions.ts`, with tests:
  - **Transit age:** anchor date − order date, in days, for an order with status `in_transit`.
  - **Longest completed delivery:** the largest delivery time among completed orders, 12 days in the file. It comes from the data, not a constant, so an imported file (ticket 35) gets its own.
  - **Overdue in transit:** transit age greater than the longest completed delivery. There is no promised date in the data (trap 2), so this is the honest threshold: older than any order that ever arrived.
  - **Age buckets:** 0–7, 8–14, 15–30 and 31+ days.
- [ ] **The page `/attention`, "Needs attention",** in the rail under Overview with a count badge (26).
  - Four sections, each a count and a table, oldest first:
    - **Overdue in transit:** 26.
    - **Exceptions:** 11.
    - **Delayed:** 55.
    - **Canceled:** 3.
  - **Columns:** order ID, client, carrier, warehouse, order date, delivery date where there is one, and age or delivery days.
  - **In-transit buckets:** the overdue section shows the four buckets above its table as small stat tiles: 0–7: 0, 8–14: 1, 15–30: 0, 31+: 26. The one order in transit but not overdue is ORD-2026-328876-0262, 8 days. It is listed under the tiles as "1 more in transit, within 12 days".
  - **By carrier:** each section shows its count per carrier (the overdue 26 by carrier: UPS 7, DHL 5, FedEx 4, DPD 2, OnTrac 2, USPS 2, LaserShip 2, Royal Mail 1, GLS 1), so a reader sees whom to call.
  - Each section's title links to the same orders in Raw data, such as `/data?status=in_transit`, and its table shows the first 10 with "View all N".
- [ ] **Overview alert.**
  - Above the KPI cards, when the overdue count is above 0: one line on an amber tint with a warning icon, "26 orders in transit longer than any completed delivery (12 days)", linking to `/attention`.
  - Status colours follow ADR 0011: icon plus text, never colour alone.
- [ ] **Raw data** gains an `age` column for in-transit rows and a sort by order date ascending (`sort=order_date`), so "View all" opens oldest first.
- [ ] **Golden numbers** go in `docs/design/README.md` and the tests:
  - **Overdue in transit:** 27 in transit, 26 overdue, 1 within the threshold (ORD-2026-328876-0262, UPS, 8 days); longest completed delivery 12 days; median age of the 27: 223 days.
  - **Oldest overdue:** ORD-2026-182650-0096 (DHL, SFO-DC2) and ORD-2026-616202-0285 (DHL, LON-FC1), both 362 days.
  - **Exceptions by carrier:** UPS 2, OnTrac 2, DPD 2, and USPS, FedEx, GLS, Royal Mail, DHL 1 each.
  - **Canceled:** ORD-2026-975697-0193, ORD-2026-774620-0268, ORD-2026-375289-0272.
- [ ] **Roles:** every role sees the page (ticket 31 matrix, dashboards).
- [ ] **No change to the AI.** No change to `src/ai/` and no new question types; the eval stays at 36.
- [ ] **README:**
  - The page goes under the features.
  - Under limitations: "What a WMS has that this data can't support". There is no stock on hand, no bin locations, no receiving and no pick or pack tasks, so putaway, slotting, picking, cycle counts and labour reports are out of reach.
- [ ] **Checks.** `npm run check`. Headless Edge at 1280 and 320 px: the tables scroll inside their cards, not the page.

## Comments
