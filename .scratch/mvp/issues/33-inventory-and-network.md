# 33: Inventory (ABC) and Network (warehouses, lanes, clients)

**What to build:** Two pages that well-known WMS systems have and this data supports.
- **Inventory:** an ABC classification of SKUs by value, and the categories.
- **Network:** a warehouse scorecard, the shipping lanes, and the clients, the way a 3PL reports per customer.

Asked by the user on 21 Nov 2026 (WMS features), with ticket 32. Every figure comes from new definitions in `src/domain/definitions.ts` with tests (ADR 0011 §6). Order value is the file's gross `order_value_usd` (trap 6), and every value heading says so in its info popover (ticket 30).

**Blocked by:** 32
_32 Needs attention: the exceptions worklist_

**Status:** done

- [x] **Inventory, `/inventory`.**
  - **ABC classes.**
    - Rule: sort SKUs by gross value, descending, ties by SKU ascending. A SKU is A while the cumulative share of value *before* it is under 80%, B under 95%, and C after.
    - Show three stat tiles (class, SKU count, value, share of value) and a Pareto chart: cumulative share of value against SKUs, with the 80% and 95% lines. Use the dataviz rules and the chart tooltip of ticket 26.
    - Class colours are the ADR 0011 chart marks, each with its letter, never colour alone.
    - One line under the tiles says what the shape means: the catalogue is flat, so 174 of 355 SKUs (49%) make 80% of the value. It is computed, not hard-coded.
  - **Top SKUs:** the top 10 by gross value, with class, orders, units and value. Each SKU links to Raw data `?sku=<SKU>`.
  - **Categories:** orders, units, gross value and share of value, sorted by value. Each links to its Raw data view and to its Forecast scope.
- [x] **Network, `/network`.**
  - **Warehouse scorecard:** one row per warehouse with orders, units, gross value, completed, on-time rate, delay rate and average delivery days.
    - Best and worst on-time are marked with an icon and a word.
    - Sortable by any column, default on-time rate descending.
    - Each row links to Raw data `?warehouse=`.
  - **Lanes (origin → destination):** orders, completed, on-time rate and average days, sorted by orders.
    - All 47 lanes have fewer than 20 completed orders, so every rate carries the small-sample tag. The section's popover says rates per lane are indicative only.
    - Each lane links to Raw data `?origin=&destination=`.
  - **Clients:** orders, units, gross value, on-time rate and average days, sorted by value, with the small-sample tag under 20 completed. Each links to Raw data `?client=`.
- [x] **Raw data filters.** `origin`, `destination`, `client` and `sku` become Raw data URL filters. They are already in the query spec's `filtersSchema` (ADR 0006), so they go through the same `matchesFilters`.
  - The filter bar gains Client and Origin menus; destination and SKU are URL filters and appear as removable chips.
  - Ticket 29's rule then gives Ask answers with these filters an "orders behind this answer" link too. Update `ordersBehind`, its tests and ADR 0011 §5.
- [x] **Rail and roles.** Inventory and Network go in the rail after Carriers. Every role sees them (ticket 31 matrix, dashboards).
- [x] **Golden numbers** go in `docs/design/README.md` and the tests:
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
- [x] **No change to the AI.** No change to `src/ai/`; the eval stays at 36.
- [x] **Checks.** `npm run check`. Headless Edge at 1280 and 320 px: wide tables scroll inside their cards, and nothing scrolls sideways.

## Comments

- 2026-11-21: Done, committed and not pushed. Every golden number above reproduced from the CSV (recomputed independently first) and asserted in the tests.
  - **Definitions** (`definitions.ts`): `abcClasses` (the rank, the share before and after each SKU, its class), `groupFigures` (a group's orders, units, gross value, delivered orders, on-time rate, delay rate, average delivery time and small-sample flag), `shareOfValue`, `ordersBy` and `cents`. **Tools:** `tools/inventory.ts` (classes, the catalogue's shape, categories) and `tools/network.ts` (scorecard with its sort and best/worst, lanes, clients) only group, sort and mark.
  - **Pages:** `/inventory` and `/network`, for every role, in the rail after Carriers (Inventory with the box icon, Network with a new route icon). Raw data reads `origin`, `destination`, `client` and `sku`; `ordersBehind` opens answers with them; ADR 0011 §5 amended.
  - **One golden number differs in display only:** BER-FC1 and CHI-DC1 are 26 of 32, exactly 81.25%. The app rounds half up and shows 81.3%, as the Delivery page already does; the ticket's 81.2% rounded the same value to even. The data and the code agree on 26/32.
  - **Decisions the ticket left open** (ADR 0011 §5, amended):
    - Value reads "$10,961.89", as Raw data writes money; every card with value says in its popover that it is gross. Shares take one decimal (ADR 0001 §7), so the line reads "(49.0%)".
    - "Flat" is computed: flat when class A holds more than a fifth of the SKUs (the Pareto rule's 80/20), otherwise "concentrated". Glossary: catalogue shape.
    - Values compare and add up in whole cents, so floating point never breaks a SKU tie or moves a SKU across a limit. A share of exactly 80% or 95% moves on to the next class.
    - Class colours: A on time's green, B delayed's amber, C exception's rust, the validated order (worst colour-blind ΔE 14.6). On the Pareto curve each class is a stretch of line with a 10% wash and its letter at its foot; the limits are dashed; its Data table lists all 355 SKUs.
    - The small-sample tag sits beside the row's name, as on Carriers: all 47 lanes and 25 clients.
    - The scorecard sorts through the URL, its columns named as their metrics (`/network?sort=order_count&dir=desc`): figures highest first, names A to Z, a second click reverses, and the default is the plain page. Best and worst on time count only warehouses with at least 20 delivered orders (ADR 0001), mark every warehouse tied there, and mark none when fewer than two qualify; they read "best on time" and "worst on time" with a check and a warning icon.
    - Added beyond the list: a Category column on the top SKUs, a Delivered column on clients (the rates' n), and totals rows on the scorecard and the categories.
    - Lanes show the full city names, "London, UK → Leeds, UK".
    - Raw data's menus are Status, Carrier, Region, Warehouse, Origin, Category, Client; the clients come from `valuesInData`. Destination and SKU travel as hidden fields, so ticking another filter keeps them.
    - A link to one order says "View the 1 order".
  - `npm run check`: 970 tests. Live in headless Edge at 1280 and 320 px against `next start` on port 4810 (throwaway secret and viewer account, LLM pointed at a dead address):
    - both pages, the Pareto curve and its tooltip;
    - the links from a SKU (2), a category (49), a warehouse (54), a lane (15) and a client (46), each opening Raw data with the count it names and its chips;
    - the scorecard sorted by Orders and reversed;
    - the Origin and Client menus, and a destination kept when an origin is ticked (15).
    The tables scroll inside their cards, and nothing scrolls sideways.
