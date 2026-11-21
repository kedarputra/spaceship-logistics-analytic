# 33: Inventory (ABC) and Network (warehouses, lanes, clients)

**What to build:** Two pages that well-known WMS systems have and this data supports.
- **Inventory:** an ABC classification of SKUs by value, and the categories.
- **Network:** a warehouse scorecard, the shipping lanes, and the clients, the way a 3PL reports per customer.

Asked by the user on 21 Nov 2026 (WMS features), with ticket 32. Every figure comes from new definitions in `src/domain/definitions.ts` with tests (ADR 0011 §6). Order value is the file's gross `order_value_usd` (trap 6), and every value heading says so in its info popover (ticket 30).

**Blocked by:** 32
_32 Needs attention: the exceptions worklist_

**Status:** ready-for-agent

- [ ] **Inventory, `/inventory`.**
  - **ABC classes.**
    - Rule: sort SKUs by gross value, descending, ties by SKU ascending. A SKU is A while the cumulative share of value *before* it is under 80%, B under 95%, and C after.
    - Show three stat tiles (class, SKU count, value, share of value) and a Pareto chart: cumulative share of value against SKUs, with the 80% and 95% lines. Use the dataviz rules and the chart tooltip of ticket 26.
    - Class colours are the ADR 0011 chart marks, each with its letter, never colour alone.
    - One line under the tiles says what the shape means: the catalogue is flat, so 174 of 355 SKUs (49%) make 80% of the value. It is computed, not hard-coded.
  - **Top SKUs:** the top 10 by gross value, with class, orders, units and value. Each SKU links to Raw data `?sku=<SKU>`.
  - **Categories:** orders, units, gross value and share of value, sorted by value. Each links to its Raw data view and to its Forecast scope.
- [ ] **Network, `/network`.**
  - **Warehouse scorecard:** one row per warehouse with orders, units, gross value, completed, on-time rate, delay rate and average delivery days.
    - Best and worst on-time are marked with an icon and a word.
    - Sortable by any column, default on-time rate descending.
    - Each row links to Raw data `?warehouse=`.
  - **Lanes (origin → destination):** orders, completed, on-time rate and average days, sorted by orders.
    - All 47 lanes have fewer than 20 completed orders, so every rate carries the small-sample tag. The section's popover says rates per lane are indicative only.
    - Each lane links to Raw data `?origin=&destination=`.
  - **Clients:** orders, units, gross value, on-time rate and average days, sorted by value, with the small-sample tag under 20 completed. Each links to Raw data `?client=`.
- [ ] **Raw data filters.** `origin`, `destination`, `client` and `sku` become Raw data URL filters. They are already in the query spec's `filtersSchema` (ADR 0006), so they go through the same `matchesFilters`.
  - The filter bar gains Client and Origin menus; destination and SKU are URL filters and appear as removable chips.
  - Ticket 29's rule then gives Ask answers with these filters an "orders behind this answer" link too. Update `ordersBehind`, its tests and ADR 0011 §5.
- [ ] **Rail and roles.** Inventory and Network go in the rail after Carriers. Every role sees them (ticket 31 matrix, dashboards).
- [ ] **Golden numbers** go in `docs/design/README.md` and the tests:
  - **SKUs:** 355, total gross value USD 13,695.87.
  - **ABC:**
    - A: 174 SKUs, USD 10,961.89.
    - B: 103 SKUs, USD 2,054.36.
    - C: 78 SKUs, USD 679.62.
  - **Top SKUs:**
    - MARKER-0138: USD 345.49.
    - PAINT-0037: 298.87.
    - MARKER-0047: 204.76.
    - PAPER-0041: 193.77.
    - PAPER-0075: 177.42.
  - **Categories (orders, units, USD):**
    - PAINT: 49, 105, 2,288.10.
    - PAPER: 43, 196, 2,023.30.
    - BRUSH: 49, 169, 1,903.85.
    - MARKER: 51, 122, 1,873.70.
    - CRAYON: 69, 229, 1,841.30.
    - BOOK: 42, 95, 1,649.84.
    - STICKER: 52, 222, 1,164.99.
    - PENCIL: 45, 172, 950.79.
  - **Warehouses (orders, units, USD, completed, on time, on-time rate, average days):**
    - AMS-FC1: 43, 161, 1,422.57, 40, 33, 82.5%, 4.22.
    - ATL-DC1: 46, 150, 1,549.30, 44, 34, 77.3% (lowest), 3.55.
    - BER-FC1: 38, 129, 1,458.01, 32, 26, 81.2%, 4.06.
    - CHI-DC1: 36, 96, 1,062.84, 32, 26, 81.2%, 4.50.
    - DFW-DC1: 42, 131, 1,419.56, 39, 32, 82.1%, 4.62.
    - EWR-DC1: 49, 183, 2,252.69 (highest value), 46, 37, 80.4%, 3.57.
    - LAX-DC1: 46, 132, 1,407.88, 44, 37, 84.1%, 3.25.
    - LON-FC1: 54 (most orders), 172, 1,725.45, 49, 40, 81.6%, 3.71.
    - SFO-DC2: 46, 156, 1,397.57, 44, 39, 88.6% (highest), 3.39.
  - **Lanes:** 47 in all. London → Leeds: 15 orders, 14 completed, 78.6%, 3.64 days. Newark → Boston: 15, 14, 78.6%, 3.36. Atlanta → Orlando: 13, 13, 76.9%, 4.00. Berlin → Zurich: 13, 12, 91.7%, 3.42. London → Edinburgh: 13, 11, 72.7%, 4.36.
  - **Clients:** 30 in all. By value:
    - CL-1004: 46 orders, USD 1,755.34, 76.7% (33 of 43).
    - CL-1005: 36, 1,403.02, 84.8%.
    - CL-1002: 31, 1,124.72, 71.4%.
    - CL-1003: 33, 1,109.36, 86.2%.
    - CL-1001: 35, 1,058.90, 87.1%.
- [ ] **No change to the AI.** No change to `src/ai/`; the eval stays at 36.
- [ ] **Checks.** `npm run check`. Headless Edge at 1280 and 320 px: wide tables scroll inside their cards, and nothing scrolls sideways.

## Comments
