# 28: Raw data: the orders as a filterable table

**What to build:** A sixth page, `/data`, listed in the rail as "Raw data" after Forecast. It shows the 400 orders of `mock_logistics_data.csv` as they are: read-only, with filters, sorting, a summary of the filtered rows, and a CSV download.

The brief asks for an app that lets users "explore logistics data", with "access to underlying data" and correct filtering (R5, R6). It also says "Do NOT over-engineer". So this is a table with filters, not a spreadsheet: no editing, formulas, pivots, column reordering or hiding.

**Blocked by:** 27
_27 The rail: full height, and collapsible to icons_

**Status:** done

- [ ] **Rail and records.**
  - The rail gains "Raw data" with a table icon, after Forecast. It works in both rail states (ticket 27).
  - The file name in the rail's Data card links to `/data`.
  - ADR 0011 §5 is amended: six routes, and a note that the page reads filters with the query tool's own code.
  - The README is updated to match. Under Setup, "The dashboard pages" lists Raw data. Under Architecture: a `/data` row in the pages table, "six routes", the CSV route in the endpoints table if there is one, and the ADR 0011 row.
- [ ] **The table.**
  - **Columns:** every CSV column in file order, with plain headings (Order ID, Client, Order date, Delivery date, Carrier, Origin, Destination, Status, SKU, Category, Quantity, Unit price, Order value, Promo, Discount, Region, Warehouse).
    - Plus a "Delivery days" column from `deliveryDays` in `domain/definitions.ts`, left empty for orders not delivered.
  - **Values** are as in the file, formatted only for reading:
    - dates as "3 Jan 2025" and money as "$1,234.50";
    - the status as a small pill with its outcome colour and its word;
    - promo as "Yes" or "No".
    - Numbers are tabular and right-aligned.
  - **Scrolling:** the header row stays in view while the rows scroll, and the Order ID column stays in view while the table scrolls sideways. The table scrolls inside its card; the page never scrolls sideways.
  - **Paging:** 50 rows per page, with Previous and Next and "51–100 of 400". The page number is in the URL.
- [ ] **Filters, in one row above the table.**
  - **Fields:**
    - status, carrier, region, warehouse and category, each multi-select;
    - promo (any, yes or no);
    - a date range with its basis: order date or delivery date, from month to month;
    - a search box that matches order ID, client, SKU or city.
  - **One definition with the AI.** The fields and values come from the query spec (`filtersSchema` in `src/tools/spec.ts`), and rows match the same way the query tool matches them (`matchesFilters` in `src/tools/query.ts`). Export what is needed; never copy the logic.
  - **In the URL,** e.g. `/data?status=delayed&carrier=FedEx`, so every view is a link that ticket 29 and the Ask page can open.
    - The filters are a GET form that works without JavaScript and applies on change with it.
    - A parameter the page does not support is ignored, and the page says which one.
  - **Active filters** show as chips, each with an ×, plus "Clear all".
- [ ] **Sort.**
  - A click on a column heading sorts by it, a second click reverses it; one column at a time.
  - The sort is in the URL, and the heading carries `aria-sort`.
  - The default is file order.
- [ ] **Summary of the filtered rows,** above the table, computed with `dashboardKpis` and the other functions in `domain/definitions.ts`: orders, delivered, on-time rate, delay rate and average delivery time. Same formatter, no new arithmetic.
- [ ] **Download CSV** of the filtered rows: the original header and the raw values, unformatted, named e.g. `orders-filtered.csv`. If it goes through an API route, that route counts toward the `/api/*` rate limit.
- [ ] **Empty state:** "No orders match these filters", with Clear all.
- [ ] **Tests.**
  - They use golden numbers from `docs/design/README.md` and the live app:
    - all orders: 400;
    - `status=delayed`: 55;
    - `status=exception`: 11;
    - status delivered, delayed and exception together: 370;
    - `status=in_transit`: 27; `status=canceled`: 3;
    - `carrier=FedEx`: 89 orders, 85 delivered, 85.9% on time, 12.9% delay rate, 3.6 days.
  - A filter gives the same rows as the query tool for the same spec filter.
  - Sorting, paging, an unknown parameter, and the CSV (its header and row count).
  - `npm run check` passes.
  - In headless Edge at 1280 px and 320 px, with filters applied: the page never scrolls sideways, and the header row and Order ID column stay in view.

## Comments

- 2026-11-21: Raw data at /data: the 400 orders read-only with the query spec's filters (matched by the query tool's matchesFilters), month range, search, sort, pages of 50, a KPI summary and GET /api/orders.csv. Rail entry and data-file link. ADR 0011 §5 amended, README updated. 604 tests; checked in headless Edge at 1280 and 320 px, with and without script.
