# Design

The redesign decided in ADR 0011, exported from the design canvas on 20 Nov 2026. Tickets 24 and 25 build it.

## Reading the files

Each `*.dc.html` is one page. These files are references, not code to copy:

- The markup and its inline styles give the layout, spacing and type.
- The `<script type="text/x-dc" data-dc-script>` block at the end holds the example data for the repeated parts.
- `{{name}}` is a template hole filled from that data, and `<sc-for>` / `<sc-if>` are the canvas's loop and condition.
- `./support.js` is the canvas runtime, which is not in this repository, so the files do not render on their own.
- The menu links (`Main.dc.html`, `Ask.dc.html` and so on) stand for the routes in the table below.

| File | Route | Ticket |
|---|---|---|
| `Overview.dc.html` | `/` | 24 |
| `Ask.dc.html` | `/ask` | 24 |
| `Delivery.dc.html` | `/delivery` | 25 |
| `Carriers.dc.html` | `/carriers` | 25 |
| `Forecast.dc.html` | `/forecast` | 25 |
| `Tokens.dc.html` | colours, type and parts | 24 |

Every figure in the files was read from the live app on 20 Nov 2026. In the app, each figure is computed by `domain/definitions` and the tools (ADR 0011 §6). The values below double as golden numbers for tests.

## Tokens

| Token | Value | Use |
|---|---|---|
| ground | `#F4F6F2` | page background |
| panel | `#FFFFFF` | cards |
| line | `#E1E6E0` | card borders, table rules |
| grid | `#EDF1EC` | chart grid, inner rules |
| ink | `#17201C` | text |
| ink-2 | `#35423C` | secondary text |
| muted | `#5E6B64` | captions; 5.6:1 on white |
| green-text | `#1F6E4F` | links, positive text; 6.2:1 |
| rail | `#16211C` | navigation rail |
| rail-ink / rail-muted | `#E7EEEA` / `#93A39A` | text on the rail; muted is 6.3:1 |
| sage | `#AFD0BF` | tints, chips (chip fill `#EEF6F1`, border `#C6E0D2`) |
| grey-green | `#808F87` | icons only (3.4:1) |
| amber | `#F4B266` | Ask button, active menu item, forecast band; ink text on it at 9:1 |
| mark-on-time | `#2A8763` | on time, and any single series |
| mark-delayed | `#E39A2E` | delayed, delay rates |
| mark-exception | `#B4533A` | exception |
| mark-small | `#F6D3A1` + 1 px `#E39A2E` ring | small samples, with a "small sample" tag |
| forecast-line | `#C27A16`, dashed | forecast; band amber at 30% |
| radius | 12 px cards, 8 px controls, 999 px chips | |
| focus | 2 px `#E39A2E` outline, 2 px offset | |

**Motion** (ticket 30). Tokens in `src/app/globals.css`; ADR 0011 §3 says where each one is used.

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.32, 0.72, 0, 1)` | the iOS sheet curve: everything that opens, and every transition's default |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | loops: the working dots, the AI dot, the shimmer |
| `--dur-1` | 160 ms | hover, press, tooltips; every transition's default |
| `--dur-2` | 280 ms | opening and closing: collapsibles, popovers, an answer arriving |
| `--dur-3` | 380 ms | the rail and large panels |

Only transform, opacity and a collapsible's height move, and nothing moves on first paint. Reduced motion sets every duration to 0 and drops the shimmer.

**Type.** Figtree with tabular figures for numbers.

| Role | Size and weight |
|---|---|
| Page title | 26 / 700, −0.02em |
| Card title | 15 / 700 |
| Answer sentence | 17–18 / 500 |
| Body | 14 / 400 |
| Caption | 12.5 / 400, muted |
| Label | 11 / 600, uppercase, 0.06em |
| Scope figure (Forecast page grid) | 22 / 700 |
| KPI figure | 30 / 700 |
| Plan figure | 44–48 / 700 |

**Controls.** At least 34 px tall; the Ask button and its input are 46–48 px.

## Shell (all pages)

**Rail.** It is 232 px wide on desktop and stacks above the content on narrow screens. From top to bottom:

1. **Product name:** "Logistics Analytics", with "Order data, 2025" below it.
2. **Menu:** Overview, Ask the data, Delivery, Carriers, Forecast. The active item gets a 3 px amber bar at the rail's edge, the amber at 14% as background, amber text, and `aria-current="page"`. _Ticket 32: Needs attention under Overview, with a badge of the orders overdue in transit (26) on the warn tint; collapsed, a dot on its icon. Ticket 33: Inventory and Network after Carriers. Ticket 34: Reports after Network._
3. **Data block:** `mock_logistics_data.csv`, "400 orders · 1 Jan–31 Dec 2025 · read-only".
4. **AI status:** online, busy or unavailable, from `/api/health?ai=1`. The rail reads "Gemma 4 12B on this server. The AI routes and explains; code computes every number."

**Content.** At most 1200 px wide, with padding of 28 px 36 px.

**Page header.**
- An uppercase label and the title. _Ticket 30: no sentence of description; definitions and notes moved into info popovers after card and chart titles (ADR 0011 §2)._
- The "Data as of 31 Dec 2025" chip, on every page since ticket 30. Overview also shows the AI status pill.

## Pages and where their figures come from

### Overview (`/`)

- **Ask box:** an input, the amber Ask button, and four example chips. Submitting opens `/ask?q=…`.
- **Five KPI cards,** each with an icon square, the figure, a sub-line, and the glossary definition below a rule. _Ticket 30: the definition is in the info popover after the label._ The figures come from the existing KPI computations:

  | Card | Figure | Sub-line |
  |---|---|---|
  | Total orders | 400 | 27 in transit · 3 canceled |
  | Delivered | 370 | 304 on time · 55 delayed · 11 exception, each with a colour dot |
  | Delayed | 55 | Delay rate 14.9% · 55 / 370 |
  | On-time rate | 82.2% | a meter bar, 304 / 370 |
  | Average delivery time | 3.8 days | |

- **Charts:**
  - Orders per month, by order date. Only the highest (Jan 75) and lowest (Sep 18) bars are labelled.
  - Delivery outcomes per month, stacked, with a 2 px gap between segments. The legend carries the totals.
- **Alert** (ticket 32): above the KPI cards while any order is overdue in transit, one line on the warn tint (`#FBEAD2`, border `#F0C68E`, text `#7A4E10`) with a warning icon: "26 orders in transit longer than any completed delivery (12 days)". The whole line links to `/attention`.
- **Carrier card:** the delay rate by carrier, top 4, using the small-sample rule. Its sentence reads "Among carriers with at least 20 deliveries, USPS is highest at 23.4% (11 of 47)." It links to `/carriers`.
- **Forecast card:**
  - "Units to plan for, Jan–Mar 2026" = 405, from 285 forecast + 120 safety stock.
  - The method chip, and a small history line with the forecast band.
  - It links to `/forecast`.

### Needs attention (`/attention`, ticket 32)

No canvas file: it reuses the cards, tables and tiles above. Four cards, each a title that links to Raw data, an info popover, a count, the count per carrier, and the first 10 orders oldest first by order date, then "View all N".

**Definitions** (`src/domain/definitions.ts`):
- **Transit age:** anchor date − order date in days, for an order in transit. Shown as "Days in transit".
- **Longest completed delivery:** the largest delivery time among the 370 delivered orders: 12 days, an exception order.
- **Overdue in transit:** transit age above the longest completed delivery.
- **Age buckets:** 0–7, 8–14, 15–30 and 31+ days.

**Golden numbers:**

| Card | Count | By carrier | Opens |
|---|---|---|---|
| Overdue in transit | 26 of 27 in transit | UPS 7, DHL 5, FedEx 4, DPD 2, LaserShip 2, OnTrac 2, USPS 2, GLS 1, Royal Mail 1 | `/data?status=in_transit&sort=order_date`, "View all 27 in transit" |
| Exceptions | 11 | DPD 2, OnTrac 2, UPS 2, DHL 1, FedEx 1, GLS 1, Royal Mail 1, USPS 1 | `/data?status=exception&sort=order_date` |
| Delayed | 55 | UPS 17, FedEx 11, USPS 11, Royal Mail 5, OnTrac 4, DHL 3, GLS 2, LaserShip 2 | `/data?status=delayed&sort=order_date` |
| Canceled | 3 | UPS 2, LaserShip 1 | `/data?status=canceled&sort=order_date` |

- **In transit:** 27. Longest completed delivery 12 days. Overdue 26; within the threshold 1, ORD-2026-328876-0262 (UPS, LON-FC1, 8 days), shown as "1 more in transit, within 12 days". Median age of the 27: 223 days.
- **Age tiles** over the 27: 0–7: 0, 8–14: 1, 15–30: 0, 31+: 26.
- **Oldest overdue:** ORD-2026-182650-0096 (DHL, SFO-DC2) and ORD-2026-616202-0285 (DHL, LON-FC1), both ordered 3 Jan 2025, 362 days. Next, ORD-2026-807844-0076 (UPS, BER-FC1), 355 days.
- **Canceled,** oldest first: ORD-2026-975697-0193 (7 Mar 2025), ORD-2026-774620-0268 (12 Apr), ORD-2026-375289-0272 (14 Aug).
- Ties in order date keep file order, as Raw data's sort does, so each table's rows are the first rows its link opens.
- Per carrier: most first, ties by name.

**Raw data** gains "Days in transit" after "Delivery days", empty for orders not in transit, sortable as `sort=age`.

### Ask (`/ask`)

**Main column:**
- **Form:** "Up to 300 characters · 20 questions a minute per visitor". _Ticket 30: the note is gone; the box still takes 300 characters._ The `q` URL parameter is asked on load.
- **Answer card:**
  - the question, the sentence, and a badge saying who wrote it ("Written by the model, every number checked" or the template);
  - the interpretation line, and the chart; _ticket 30: a row of chips for the metric, dimension, filters and period replaces the line, which is in "How this was computed"_;
  - the follow-up chips.
- **"How this was computed":** open by default on this page. _Ticket 30: closed by default, with a row of chips under the answer for the metric, dimension, filters and period._ It holds ticket 17's stage strip, the definition, the period, the small-sample rule, the spec as validated, and the result to 2 decimals.

**Side column:**
- **Try these:** grouped as Counts and shares, Over time, Rankings, and Forecasts. Every question was checked against the live model.
- **Recent questions:** the ticket 16 history list, moved here.
- **What it won't answer:** questions outside the data; combined forecast scopes; SKU forecasts. _Ticket 30: in the info popover of "Try these"._

### Delivery (`/delivery`)

- **KPIs:**
  - delivered 370 (30 not delivered yet);
  - on-time rate 82.2% (304 of 370);
  - delay rate 14.9% (55 of 370);
  - exceptions 11 (3.0% of delivered, not counted as delayed);
  - average delivery time 3.8 days.
- **Delivery outcomes per month:** as on Overview.
- **On-time rate per month:**
  - A line; the axis may start at 60% because it is a line, never a bar.
  - The overall rate (82.2%) is a dashed reference line.
  - Months under 20 deliveries get hollow points with a note: Jun 15 of 18, Nov 16 of 19.
  - Monthly values: 80.6, 81.1, 84.2, 89.3, 72.7, 83.3, 80.0, 81.1, 85.7, 81.8, 84.2, 84.6%.
- **Average delivery time by region and by warehouse:** bars, slowest first. Under each name: n and the on-time rate.

  | Region | Days | n | On time |
  |---|---|---|---|
  | US-C | 4.6 | 71 | 81.7% |
  | EU | 4.2 | 72 | 81.9% |
  | UK | 3.7 | 49 | 81.6% |
  | US-E | 3.6 | 90 | 78.9% |
  | US-W | 3.3 | 88 | 86.4% |

  | Warehouse | Days | n | On time |
  |---|---|---|---|
  | DFW-DC1 | 4.6 | 39 | 82.1% |
  | CHI-DC1 | 4.5 | 32 | 81.3% |
  | AMS-FC1 | 4.2 | 40 | 82.5% |
  | BER-FC1 | 4.1 | 32 | 81.3% |
  | LON-FC1 | 3.7 | 49 | 81.6% |
  | EWR-DC1 | 3.6 | 46 | 80.4% |
  | ATL-DC1 | 3.5 | 44 | 77.3% |
  | SFO-DC2 | 3.4 | 44 | 88.6% |
  | LAX-DC1 | 3.3 | 44 | 84.1% |

### Carriers (`/carriers`)

**Highlights:**
- Most orders: FedEx, 89 orders (22.3%).
- Highest on-time rate with n ≥ 20: DHL, 93.1% (54 of 58).
- Highest delay rate with n ≥ 20: USPS, 23.4% (11 of 47), also the slowest at 4.6 days.

**Delay rate chart:** a "Reading this chart" note sits beside it.

**Table:** sorted by delay rate. Orders and share are by order date; the rest are by delivery date. The rows for GLS and DPD are marked as small samples.

| Carrier | Orders | Share | Delivered | On time | Delay rate | Exceptions | Avg time |
|---|---|---|---|---|---|---|---|
| GLS | 9 | 2.3% | 8 | 62.5% | 25.0% | 1 | 5.1 days |
| USPS | 49 | 12.3% | 47 | 74.5% | 23.4% | 1 | 4.6 days |
| UPS | 88 | 22.0% | 78 | 75.6% | 21.8% | 2 | 3.9 days |
| Royal Mail | 26 | 6.5% | 25 | 76.0% | 20.0% | 1 | 3.8 days |
| OnTrac | 29 | 7.3% | 27 | 77.8% | 14.8% | 2 | 3.7 days |
| FedEx | 89 | 22.3% | 85 | 85.9% | 12.9% | 1 | 3.6 days |
| LaserShip | 27 | 6.8% | 24 | 91.7% | 8.3% | 0 | 3.5 days |
| DHL | 63 | 15.8% | 58 | 93.1% | 5.2% | 1 | 3.5 days |
| DPD | 20 | 5.0% | 18 | 88.9% | 0.0% | 2 | 3.4 days |
| All carriers | 400 | 100% | 370 | 82.2% | 14.9% | 11 | 3.8 days |

### Inventory (`/inventory`, ticket 33)

No canvas file: it reuses the tiles, chart card and tables above. Value is the file's gross `order_value_usd` (`docs/data.md` trap 6), and every card that shows it says so in its info popover.

**Definitions** (`src/domain/definitions.ts`):
- **ABC classes:** SKUs ranked by gross value, highest first, ties by SKU ascending. A SKU is A while the value ranked before it is under 80% of all value, B under 95%, and C after. Values compare and add up in whole cents, so floating point never breaks a tie or moves a SKU across a limit.
- **The catalogue's shape** (`tools/inventory.ts`): flat when class A holds more than a fifth of the SKUs (the Pareto rule's 80/20), concentrated otherwise.

**Golden numbers:**

- **SKUs:** 355, total gross value USD 13,695.87.
- **ABC tiles:**

  | Class | SKUs | Gross value | Share of value |
  |---|---|---|---|
  | A | 174 | $10,961.89 | 80.0% |
  | B | 103 | $2,054.36 | 15.0% |
  | C | 78 | $679.62 | 5.0% |

  The line under them: "The catalogue is flat: 174 of 355 SKUs (49.0%) make 80% of the value."
- **Pareto chart:** the class marks are on time `#2A8763` (A), delayed `#E39A2E` (B) and exception `#B4533A` (C), validated in that order (worst colour-blind ΔE 14.6, normal-vision ΔE 20.2). The 80% and 95% limits are dashed grey-green. The first point is MARKER-0138 at 2.5%; SKU 174 is the last A, SKU 175 the first B.
- **Top 10 SKUs** (class, category, orders, units, value), each opening `/data?sku=`:

  | SKU | Class | Category | Orders | Units | Gross value |
  |---|---|---|---|---|---|
  | MARKER-0138 | A | MARKER | 2 | 16 | $345.49 |
  | PAINT-0037 | A | PAINT | 1 | 11 | $298.87 |
  | MARKER-0047 | A | MARKER | 2 | 11 | $204.76 |
  | PAPER-0041 | A | PAPER | 2 | 17 | $193.77 |
  | PAPER-0075 | A | PAPER | 2 | 17 | $177.42 |
  | BOOK-0040 | A | BOOK | 1 | 9 | $168.03 |
  | PAINT-0122 | A | PAINT | 1 | 6 | $166.14 |
  | BOOK-0072 | A | BOOK | 1 | 10 | $165.70 |
  | PAINT-0176 | A | PAINT | 1 | 7 | $158.83 |
  | BOOK-0117 | A | BOOK | 1 | 7 | $154.98 |

- **Categories,** by value, each opening `/data?category=` and `/forecast?scope=category&value=`:

  | Category | Orders | Units | Gross value | Share of value |
  |---|---|---|---|---|
  | PAINT | 49 | 105 | $2,288.10 | 16.7% |
  | PAPER | 43 | 196 | $2,023.30 | 14.8% |
  | BRUSH | 49 | 169 | $1,903.85 | 13.9% |
  | MARKER | 51 | 122 | $1,873.70 | 13.7% |
  | CRAYON | 69 | 229 | $1,841.30 | 13.4% |
  | BOOK | 42 | 95 | $1,649.84 | 12.0% |
  | STICKER | 52 | 222 | $1,164.99 | 8.5% |
  | PENCIL | 45 | 172 | $950.79 | 6.9% |
  | All categories | 400 | 1,310 | $13,695.87 | 100.0% |

### Network (`/network`, ticket 33)

No canvas file. Rates and the average are over delivered orders, as on Carriers. A row under 20 delivered orders carries the small-sample tag beside its name.

**Definitions** (`src/domain/definitions.ts`): `groupFigures`, a group's orders, units, gross value, delivered orders, on-time rate, delay rate, average delivery time and small-sample flag, from the KPI definitions.

**Warehouse scorecard,** highest on-time rate first by default; ties go by name. Every heading sorts by its column (`/network?sort=order_count&dir=desc`), figures highest first and names A to Z, and a second click reverses. Each row opens `/data?warehouse=`.

The page shows the columns below; the on-time count in brackets is the rate's numerator, which the tests assert, over the Delivered column.

| Warehouse | Orders | Units | Gross value | Delivered | On-time rate | Delay rate | Avg delivery time |
|---|---|---|---|---|---|---|---|
| SFO-DC2 (best on time) | 46 | 156 | $1,397.57 | 44 | 88.6% (39) | 11.4% | 3.4 days (3.39) |
| LAX-DC1 | 46 | 132 | $1,407.88 | 44 | 84.1% (37) | 13.6% | 3.3 days (3.25) |
| AMS-FC1 | 43 | 161 | $1,422.57 | 40 | 82.5% (33) | 15.0% | 4.2 days (4.22) |
| DFW-DC1 | 42 | 131 | $1,419.56 | 39 | 82.1% (32) | 15.4% | 4.6 days (4.62) |
| LON-FC1 (most orders) | 54 | 172 | $1,725.45 | 49 | 81.6% (40) | 16.3% | 3.7 days (3.71) |
| BER-FC1 | 38 | 129 | $1,458.01 | 32 | 81.3% (26; 81.25%) | 15.6% | 4.1 days (4.06) |
| CHI-DC1 | 36 | 96 | $1,062.84 | 32 | 81.3% (26; 81.25%) | 12.5% | 4.5 days (4.50) |
| EWR-DC1 (highest value) | 49 | 183 | $2,252.69 | 46 | 80.4% (37) | 13.0% | 3.6 days (3.57) |
| ATL-DC1 (worst on time) | 46 | 150 | $1,549.30 | 44 | 77.3% (34) | 20.5% | 3.5 days (3.55) |
| All warehouses | 400 | 1,310 | $13,695.87 | 370 | 82.2% (304) | 14.9% | 3.8 days |

26 of 32 is exactly 81.25%, which the app rounds half up to 81.3%, as the Delivery page does; the ticket's 81.2% rounded it to even.

**Lanes:** 47, most orders first, ties by origin, then destination. None has 20 delivered orders (the most is 14), so every lane carries the small-sample tag and the popover says the rates per lane are indicative only. Each opens `/data?origin=&destination=`.

| Lane | Orders | Delivered | On-time rate | Avg delivery time |
|---|---|---|---|---|
| London, UK → Leeds, UK | 15 | 14 | 78.6% | 3.6 days (3.64) |
| Newark, NJ → Boston, MA | 15 | 14 | 78.6% | 3.4 days (3.36) |
| Atlanta, GA → Orlando, FL | 13 | 13 | 76.9% | 4.0 days |
| Berlin, DE → Zurich, CH | 13 | 12 | 91.7% | 3.4 days (3.42) |
| London, UK → Edinburgh, UK | 13 | 11 | 72.7% | 4.4 days (4.36) |

**Clients:** 30, by gross value, ties by client. Only 5 have 20 delivered orders; the other 25 carry the small-sample tag. Each opens `/data?client=`.

| Client | Orders | Units | Gross value | Delivered | On-time rate | Avg delivery time |
|---|---|---|---|---|---|---|
| CL-1004 | 46 | 135 | $1,755.34 | 43 | 76.7% (33 of 43) | 3.7 days |
| CL-1005 | 36 | 128 | $1,403.02 | 33 | 84.8% | 3.5 days |
| CL-1002 | 31 | 120 | $1,124.72 | 28 | 71.4% | 3.9 days |
| CL-1003 | 33 | 143 | $1,109.36 | 29 | 86.2% | 4.0 days |
| CL-1001 | 35 | 116 | $1,058.90 | 31 | 87.1% | 4.2 days |

**Raw data** (ticket 33) also reads `origin`, `destination`, `client` and `sku`: London, UK 54 orders; London, UK → Leeds, UK 15; CL-1004 46 (43 delivered); MARKER-0138 2. Origin and Client are menus; destination and SKU show as chips only.

### Reports (`/reports`, ticket 34)

No canvas file: it reuses the cards and tables above. The rail lists Reports after Network, for every role.

- **The month:** a menu of the data's months (Jan–Dec 2025), the anchor's month first; every month is a URL, `/reports?month=2025-11`. A month the data does not cover shows the anchor's.
- **Exports:** "Monthly report (PDF)", "Monthly report (CSV)" and "All orders (CSV)". A viewer sees them disabled with a lock and "Analyst role needed"; the routes answer 403 too. An admin also gets "Import data".
- **Sections,** each with its period basis once, under its title ("Nov 2025 · by delivery date"), and its definitions in the info popover: orders placed and deliveries completed beside the month before with the change (rates in points); the delivery outcomes, and per week as stacked bars with a Data table; the carriers, most deliveries first; Network's warehouse scorecard for the month; the top 5 categories and SKUs by gross value; and needs attention, the orders placed in the month still in transit on 31 Dec 2025, or canceled.
- **The page and the PDF** draw the same sections (`src/components/report-sections.ts`) from one report (`src/tools/report.ts`), so they say the same thing.

**Definitions** (`src/domain/definitions.ts`): `ordersDatedIn` (the orders placed in a period, or delivered in it), `periodFigures` (a group's orders, units and value placed in the period with its deliveries completed in it, ADR 0002 §5), and the changes against the month before: `change`, `pointsChange` (rates, in percentage points) and `valueChange` (to the cent).

**Golden numbers,** recomputed from the file:

| Month | Placed | Units | Gross USD | Completed | On time | Delayed | Exception | Avg days | Still in transit (placed in M) |
|---|---|---|---|---|---|---|---|---|---|
| Oct 2025 | 26 | 79 | 912.02 | 22 | 18 (81.8%) | 3 (13.6%) | 1 | 3.32 | 2 |
| Nov 2025 | 24 | 113 | 1,600.98 | 19 | 16 (84.2%) | 3 (15.8%) | 0 | 3.74 | 4 |
| Dec 2025 | 24 | 93 | 1,120.32 | 26 | 22 (84.6%) | 4 (15.4%) | 0 | 3.38 | 1 |

- **Changes:** Nov against Oct: orders −2, units +34, gross value +$688.96, completed −3, on-time rate +2.4 points (2.39), delay rate +2.2 points, delivery time +0.4 days. Dec against Nov: on-time rate +0.4 points (0.40).
- **Nov carriers** (completed, on time, delayed), most first and ties by name: USPS 5, 3, 2; FedEx 4, 4, 0; UPS 4, 3, 1; Royal Mail 2, 2, 0; DPD, GLS, LaserShip and OnTrac 1, 1, 0. All small samples.
- **Nov per week of delivery:** w/c 27 Oct (1–2 Nov only) 1 on time; w/c 3 Nov 3 and 1 delayed; w/c 10 Nov 3; w/c 17 Nov 6 and 2 delayed; w/c 24 Nov 3.
- **Nov warehouses:** EWR-DC1 8 orders, 45 units, $833.57, 7 delivered, all on time; SFO-DC2 placed none but delivered 1; AMS-FC1 placed 2 and delivered none, so its rates are n/a and it comes last. None has 20 deliveries, so none is marked best or worst.
- **Nov's top categories:** PAINT $406.92 (25.4%), MARKER $285.69 (17.8%), PAPER $272.44 (17.0%). Top SKU PAINT-0037, $298.87.
- **Nov's needs attention:** ORD-2026-542610-0082 (3 Nov, 58 days in transit), ORD-2026-571946-0024 (48), ORD-2026-108980-0325 (42), ORD-2026-682573-0181 (40). Mar 2025 has the one canceled order of the quarter, ORD-2026-975697-0193.
- **Nov's delayed count, 3,** equals the Ask answer to "How many orders were delivered late last month?".

**PDF** (`/api/reports/2025-11.pdf`): A4 portrait, two pages, about 27 KB, Figtree Regular and Bold embedded from `assets/fonts/figtree/`. A header (the app's name, "Monthly WMS report · Nov 2025", the dataset, "Data as of 31 Dec 2025" and the day it was made), the sections as tables, and the outcomes per week as stacked bars with each week's total above it and a row per outcome under the weeks, so the amber marks keep their values. The footer has the report's name and "Page 1 of 2".

**CSV** (`/api/reports/2025-11.csv`): `section, item, metric, value, previous_month`, a row per figure: `summary,all,order_count,24,26`; `carriers,GLS,on_time_rate,1,` (no rate in Oct to compare); `top_categories,PAINT,gross_order_value,406.92,64.6`; `needs_attention,in_transit,order_count,4,2`. Metrics are named as in `METRICS`; rates are fractions, money is to the cent.

### Forecast (`/forecast`)

**Controls:** a scope picker (All products, Category, Warehouse, Region, plus a value picker) and a horizon (1, 3 or 6 months). They run the forecast tool directly, with no model call.

**Total card, 3 months:**
- 405 units to plan for: 285 forecast (95 a month) + 120 safety stock.
- The monthly table with the 95% range: Jan 95 (13–177), Feb 95 (0–210), Mar 95 (0–236).
- The chart, and the January caveat.

**Method table:** fit on Jan–Sep 2025, scored on Oct–Dec 2025.

| Method | MAE | WAPE |
|---|---|---|
| All-history average | 18.89 | 19.9% |
| 3-month moving average (chosen) | 16.22 | 17.1% |
| Linear regression | 35.21 | 37.1% |
| Holt's linear trend | 25.24 | 26.6% |

**Plan arithmetic:** 3 × 95 = 285, plus z × σ × √3 = 1.65 × 41.66 × √3 = 119.05, rounded up to 120. Read z and σ from the forecast result, never as literals.

**Scope grid, 3 months:** "rough" means WAPE over 50% before rounding. Each entry reads plan = forecast + safety stock, then the method and its WAPE.

Categories:

| Category | Plan | Forecast + safety | Method | WAPE | Rough |
|---|---|---|---|---|---|
| CRAYON | 55 | 11 + 44 | Holt | 50.0% (49.997%) | no |
| STICKER | 93 | 56 + 37 | average | 31.1% | no |
| MARKER | 53 | 31 + 22 | average | 26.7% | no |
| BRUSH | 46 | 8 + 38 | regression | 73.8% | yes |
| PAINT | 45 | 26 + 19 | average | 59.2% | yes |
| PENCIL | 73 | 43 + 30 | average | 96.0% | yes |
| PAPER | 82 | 49 + 33 | average | 53.2% | yes |
| BOOK | 53 | 36 + 17 | 3-month moving average | 50.0% | no |

Warehouses:

| Warehouse | Plan | Forecast + safety | Method | WAPE | Rough |
|---|---|---|---|---|---|
| LON-FC1 | 40 | 9 + 31 | Holt | 289.5% | yes |
| EWR-DC1 | 92 | 46 + 46 | average | 61.3% | yes |
| ATL-DC1 | 49 | 38 + 11 | average | 9.4% | no |
| LAX-DC1 | 61 | 33 + 28 | average | 62.1% | yes |
| SFO-DC2 | 51 | 9 + 42 | regression | 222.5% | yes |
| AMS-FC1 | 72 | 40 + 32 | average | 149.1% | yes |
| DFW-DC1 | 56 | 33 + 23 | average | 41.5% | no |
| BER-FC1 | 57 | 32 + 25 | average | 60.5% | yes |
| CHI-DC1 | 41 | 24 + 17 | average | 39.3% | no |

Regions:

| Region | Plan | Forecast + safety | Method | WAPE | Rough |
|---|---|---|---|---|---|
| US-E | 137 | 83 + 54 | average | 44.2% | no |
| US-W | 91 | 46 + 45 | 3-month moving average | 68.8% | yes |
| EU | 118 | 73 + 45 | average | 76.8% | yes |
| US-C | 90 | 57 + 33 | average | 25.7% | no |
| UK | 40 | 9 + 31 | Holt | 289.5% | yes |

UK carries the note that it is the same forecast as LON-FC1.

**SKU note:** no SKU has more than 3 orders, with a chip that asks about CRAYON-0008.
