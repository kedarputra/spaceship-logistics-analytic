# 34: Reports: the monthly WMS report, as a page, a PDF and a CSV

**What to build:** A Reports page, the place to get data out of the app (and, with ticket 35, in). Its main item is a monthly WMS report: pick a month, read it on screen, download it as a PDF or a CSV.

Asked by the user on 21 Nov 2026: "a report section that can export and import data, a monthly PDF report, a monthly WMS report".

**Blocked by:** 33
_33 Inventory (ABC) and Network (warehouses, lanes, clients)_

**Status:** done

- [x] **The page `/reports`,** in the rail after Network.
  - **Monthly report:** a month picker (Jan–Dec 2025 in the file; the months of the active dataset), defaulting to the anchor month. The report renders below it.
  - **Export:** "Monthly report (PDF)", "Monthly report (CSV)" and "All orders (CSV)" (the existing `/api/orders.csv`).
  - **Import:** a link to ticket 35's import, shown to admins only.
- [x] **The report for month M.** Every figure comes from `definitions.ts` and the tools; the report adds no arithmetic of its own (ADR 0011 §6). Each period basis is stated once, in the section header.
  1. **Summary,** each with its change against the month before (in points for rates):
     - orders placed (order date in M), units and gross value;
     - deliveries completed (delivery date in M), on-time rate, delay rate and average delivery days.
  2. **Delivery outcomes:** on time, delayed and exception, delivery date in M.
  3. **Carriers:** completed, on time, delayed and on-time rate, with the small-sample tag under 20.
  4. **Warehouses:** ticket 33's scorecard for M.
  5. **Top categories and SKUs** by gross value, order date in M.
  6. **Needs attention:** orders placed in M that are still in transit or canceled.
     - Status is a snapshot as of the anchor date, so the label says "still in transit on 31 Dec 2025". The data can't say what was in transit at the end of a past month, and the report must not imply it.
- [x] **PDF.**
  - **Shape:** server-rendered at `/api/reports/<YYYY-MM>.pdf`, A4 portrait, one or two pages, named `wms-report-2025-11.pdf`.
  - **Content:** the same sections, tables and one vector bar chart of delivery outcomes per week of M. A header with the app name, the month, the dataset and its anchor date, and "Generated <date>"; page numbers in the footer.
  - **Library:** one well-known, maintained, pure-JS library: `pdfkit` preferred, or `@react-pdf/renderer`.
    - Pin the exact version. Add it to `serverExternalPackages` if the bundler needs that. No headless browser and no network call at runtime.
    - Figtree TTF is committed with its OFL licence.
  - **Look:** colours and type follow ADR 0011; amber marks keep their value labels.
- [x] **CSV.** `/api/reports/<YYYY-MM>.csv`, one file with the columns `section, item, metric, value, previous_month`. Values are the computed numbers, not formatted strings.
- [x] **Roles** (ticket 31 matrix).
  - Every role reads the report on screen.
  - Downloads, both new and the orders CSV, need Analyst or Admin. A viewer sees the buttons disabled with a lock and "Analyst role needed".
  - The download routes check the role too.
- [x] **Rate limits.** The download routes count against the per-IP `/api/*` limit, as the orders CSV does today.
- [x] **Golden numbers** go in the tests and `docs/design/README.md`:

  | Month | Placed | Units | Gross USD | Completed | On time | Delayed | Exception | Avg days | Still in transit (placed in M) |
  |---|---|---|---|---|---|---|---|---|---|
  | Oct 2025 | 26 | 79 | 912.02 | 22 | 18 (81.8%) | 3 (13.6%) | 1 | 3.32 | 2 |
  | Nov 2025 | 24 | 113 | 1,600.98 | 19 | 16 (84.2%) | 3 (15.8%) | 0 | 3.74 | 4 |
  | Dec 2025 | 24 | 93 | 1,120.32 | 26 | 22 (84.6%) | 4 (15.4%) | 0 | 3.38 | 1 |

  - **Changes:** Nov's on-time rate against Oct is +2.4 points (84.2% vs 81.8%); Dec against Nov is +0.4 points.
  - **Nov carriers (completed, on time, delayed):** USPS 5, 3, 2; UPS 4, 3, 1; FedEx 4, 4, 0; Royal Mail 2, 2, 0; LaserShip, GLS, DPD and OnTrac 1, 1, 0.
  - **Nov's top categories:** PAINT USD 406.92, MARKER 285.69, PAPER 272.44.
  - The Nov report's delayed count, 3, equals the Ask answer to "How many orders were delivered late last month?".
- [x] **Tests.**
  - The report model for Oct, Nov and Dec against the table.
  - The PDF route returns `application/pdf`, starts with `%PDF-`, has one or two pages, and is under 500 KB.
  - The CSV route's rows for Nov.
  - The role checks on both routes.
  - An unknown month returns 404.
- [x] **README.** A "Reports" line under the features, and the PDF library under the stack, with why it was chosen.
- [x] **Checks.** `npm run check`. Headless Edge at 1280 and 320 px. Open the Nov PDF once and look at it.

## Comments

- 2026-11-22: Done, committed and not pushed. Every golden number above reproduced from the CSV (recomputed independently first) and asserted in the tests; none differed. The Nov carriers' order in the ticket is file order; the report lists them most deliveries first and ties by name (USPS, FedEx, UPS, Royal Mail, DPD, GLS, LaserShip, OnTrac), as Needs attention orders its carriers.
  - **Definitions** (`definitions.ts`): `ordersDatedIn` (placed in a period by order date, or delivered in it), `periodFigures` (a group's orders, units and value placed with its deliveries completed, ADR 0002 §5), `deliveredOrdersOverTime`, and the changes `change`, `pointsChange` (percentage points) and `valueChange` (to the cent). `formatChange` writes them: "+2.4 points", "−2", "+$688.96", an exact half rounded away from zero either way.
  - **Tools:** `tools/report.ts` (`monthlyReport(dataset, month)`, pure, undefined for a month outside the data) builds each month from `periodFigures`, `inventory` (categories, SKUs), `periodScorecard` (Network's scorecard, now over a period; `warehouseScorecard` is it over all the data) and `oldestFirst` from Needs attention. `tools/report-csv.ts` writes the CSV. `components/report-sections.ts` is the text both the page and the PDF draw.
  - **CSV injection:** `domain/csv.ts` `csvField` is the one cell writer; `/api/orders.csv` (through `ordersCsv`) and the report CSV both use it. A cell starting with `=`, `+`, `-`, `@`, a tab or a CR gets a leading `'`. The file itself has no such cell, so the orders CSV is still byte-identical to it.
  - **PDF:** pdfkit 0.20.2, pinned (0.21.0 was a day old). Its 19-package tree has no install, preinstall, postinstall or prepare script and no native build; installed with `--ignore-scripts` anyway. `serverExternalPackages: ["pdfkit"]` in a new `next.config.ts`; pdfkit ships no types, so `types/pdfkit.d.ts` declares the part used. Figtree Regular and Bold (static TTFs of the upstream repository, commit 032dfa7) are in `assets/fonts/figtree/` with `OFL.txt`; the document starts in Figtree, so pdfkit never loads Helvetica. Nov is two A4 pages, 27 KB; every month of the file fits in one or two (tested).
  - **Decisions the ticket left open:**
    - Each section's basis is the line under its title ("Nov 2025 · by delivery date"): ADR 0011 §5 amended, as the one exception to ticket 30's no-subtext rule. Definitions stay in the info popovers.
    - The summary is two tables, orders placed and deliveries completed, each with the month before and the change; the first month of the data has no month-before columns. The outcomes table heads their rates "Rate", not "Share" (glossary).
    - The warehouse scorecard for a month counts orders, units and value placed in it and deliveries completed in it, so SFO-DC2 shows 0 orders and 1 delivery in Nov, and AMS-FC1 2 orders and no rate.
    - Top 5 categories and SKUs. Needs attention lists order, order date, carrier, warehouse, status and days in transit to 31 Dec 2025.
    - The page shows the weekly chart too, inside the outcomes card (stacked bars, Data table); the PDF's chart has each week's delivered orders above the bar and a row per outcome under the weeks, so the amber marks keep their values.
    - The CSV: `section, item, metric, value, previous_month`, metrics named as in `METRICS`, rates as fractions, money to the cent; a group absent the month before has counts 0 and no rate; weeks have no previous month; Needs attention is two counts (in transit, canceled), not the orders.
    - An unknown `?month=` on the page shows the anchor's month; the routes answer 404 with the months they cover.
    - The PDF header names the dataset with `DATASET_FILE`, as the rail and Raw data do; ticket 35 should swap all three when it names the active dataset.
    - Admins see "Import data" linking to `/import`, which 404s until ticket 35.
  - `npm run check`: 1072 tests. Live in headless Edge at 1280 and 320 px against `next start` on port 4810 (throwaway secret and one throwaway account per role, LLM pointed at a dead address):
    - `/reports` for Nov and Dec 2025, the month menu opening Oct;
    - the PDF and CSV for Nov and Dec downloaded as an analyst (application/pdf and text/csv, the file names above), the orders CSV (401 lines);
    - a viewer refused with 403 on all three files and shown the three buttons locked with "Analyst role needed"; nobody signed in gets 401;
    - the Nov PDF opened in Edge: header, tables, the weekly chart and "Page 1 of 2".
    Tables scroll inside their cards at 320 px, and nothing scrolls sideways.
