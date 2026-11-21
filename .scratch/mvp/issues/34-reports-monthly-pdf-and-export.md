# 34: Reports: the monthly WMS report, as a page, a PDF and a CSV

**What to build:** A Reports page, the place to get data out of the app (and, with ticket 35, in). Its main item is a monthly WMS report: pick a month, read it on screen, download it as a PDF or a CSV.

Asked by the user on 21 Nov 2026: "a report section that can export and import data, a monthly PDF report, a monthly WMS report".

**Blocked by:** 33
_33 Inventory (ABC) and Network (warehouses, lanes, clients)_

**Status:** ready-for-agent

- [ ] **The page `/reports`,** in the rail after Network.
  - **Monthly report:** a month picker (Jan–Dec 2025 in the file; the months of the active dataset), defaulting to the anchor month. The report renders below it.
  - **Export:** "Monthly report (PDF)", "Monthly report (CSV)" and "All orders (CSV)" (the existing `/api/orders.csv`).
  - **Import:** a link to ticket 35's import, shown to admins only.
- [ ] **The report for month M.** Every figure comes from `definitions.ts` and the tools; the report adds no arithmetic of its own (ADR 0011 §6). Each period basis is stated once, in the section header.
  1. **Summary,** each with its change against the month before (in points for rates):
     - orders placed (order date in M), units and gross value;
     - deliveries completed (delivery date in M), on-time rate, delay rate and average delivery days.
  2. **Delivery outcomes:** on time, delayed and exception, delivery date in M.
  3. **Carriers:** completed, on time, delayed and on-time rate, with the small-sample tag under 20.
  4. **Warehouses:** ticket 33's scorecard for M.
  5. **Top categories and SKUs** by gross value, order date in M.
  6. **Needs attention:** orders placed in M that are still in transit or canceled.
     - Status is a snapshot as of the anchor date, so the label says "still in transit on 31 Dec 2025". The data can't say what was in transit at the end of a past month, and the report must not imply it.
- [ ] **PDF.**
  - **Shape:** server-rendered at `/api/reports/<YYYY-MM>.pdf`, A4 portrait, one or two pages, named `wms-report-2025-11.pdf`.
  - **Content:** the same sections, tables and one vector bar chart of delivery outcomes per week of M. A header with the app name, the month, the dataset and its anchor date, and "Generated <date>"; page numbers in the footer.
  - **Library:** one well-known, maintained, pure-JS library: `pdfkit` preferred, or `@react-pdf/renderer`.
    - Pin the exact version. Add it to `serverExternalPackages` if the bundler needs that. No headless browser and no network call at runtime.
    - Figtree TTF is committed with its OFL licence.
  - **Look:** colours and type follow ADR 0011; amber marks keep their value labels.
- [ ] **CSV.** `/api/reports/<YYYY-MM>.csv`, one file with the columns `section, item, metric, value, previous_month`. Values are the computed numbers, not formatted strings.
- [ ] **Roles** (ticket 31 matrix).
  - Every role reads the report on screen.
  - Downloads, both new and the orders CSV, need Analyst or Admin. A viewer sees the buttons disabled with a lock and "Analyst role needed".
  - The download routes check the role too.
- [ ] **Rate limits.** The download routes count against the per-IP `/api/*` limit, as the orders CSV does today.
- [ ] **Golden numbers** go in the tests and `docs/design/README.md`:

  | Month | Placed | Units | Gross USD | Completed | On time | Delayed | Exception | Avg days | Still in transit (placed in M) |
  |---|---|---|---|---|---|---|---|---|---|
  | Oct 2025 | 26 | 79 | 912.02 | 22 | 18 (81.8%) | 3 (13.6%) | 1 | 3.32 | 2 |
  | Nov 2025 | 24 | 113 | 1,600.98 | 19 | 16 (84.2%) | 3 (15.8%) | 0 | 3.74 | 4 |
  | Dec 2025 | 24 | 93 | 1,120.32 | 26 | 22 (84.6%) | 4 (15.4%) | 0 | 3.38 | 1 |

  - **Changes:** Nov's on-time rate against Oct is +2.4 points (84.2% vs 81.8%); Dec against Nov is +0.4 points.
  - **Nov carriers (completed, on time, delayed):** USPS 5, 3, 2; UPS 4, 3, 1; FedEx 4, 4, 0; Royal Mail 2, 2, 0; LaserShip, GLS, DPD and OnTrac 1, 1, 0.
  - **Nov's top categories:** PAINT USD 406.92, MARKER 285.69, PAPER 272.44.
  - The Nov report's delayed count, 3, equals the Ask answer to "How many orders were delivered late last month?".
- [ ] **Tests.**
  - The report model for Oct, Nov and Dec against the table.
  - The PDF route returns `application/pdf`, starts with `%PDF-`, has one or two pages, and is under 500 KB.
  - The CSV route's rows for Nov.
  - The role checks on both routes.
  - An unknown month returns 404.
- [ ] **README.** A "Reports" line under the features, and the PDF library under the stack, with why it was chosen.
- [ ] **Checks.** `npm run check`. Headless Edge at 1280 and 320 px. Open the Nov PDF once and look at it.

## Comments
