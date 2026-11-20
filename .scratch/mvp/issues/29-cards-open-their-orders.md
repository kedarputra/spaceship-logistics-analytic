# 29: Cards, bars and rows open the orders behind them

**What to build:** A click on a KPI card, a highlight, a bar or a table row opens the view that explains it, already filtered:
- **A card that shows a count** opens those orders in Raw data (ticket 28). The view shows the same count as the card.
- **A rate or average with no orders of its own to show** opens the page that breaks it down.

**Blocked by:** 28
_28 Raw data: the orders as a filterable table_

**Status:** ready-for-agent

- [ ] **The links.** "Delivered" below means status delivered, delayed or exception, the definition behind the 370.

  | Where | What | Opens | Shows |
  |---|---|---|---|
  | Overview | Total orders | `/data` | 400 |
  | Overview | Delivered orders | `/data`, delivered | 370 |
  | Overview | Delayed orders | `/data?status=delayed` | 55 |
  | Overview | On-time delivery rate | `/delivery` | the rate by month |
  | Overview | Average delivery time | `/delivery`, at the region and warehouse cards | the times |
  | Delivery | Delivered orders | `/data`, delivered | 370 |
  | Delivery | On-time delivery rate | `/data?status=delivered` | 304 |
  | Delivery | Delay rate | `/data?status=delayed` | 55 |
  | Delivery | Exceptions | `/data?status=exception` | 11 |
  | Delivery | Average delivery time | `/data`, delivered, slowest first | 370 |
  | Delivery | A region or warehouse bar | `/data`, that region or warehouse, delivered | its n, e.g. US-C 71 |
  | Carriers | Most orders (FedEx) | `/data?carrier=FedEx` | 89 |
  | Carriers | Highest on-time rate (DHL) | `/data`, DHL, delivered | 58 |
  | Carriers | Highest delay rate (USPS) | `/data`, USPS, delayed | 11 |
  | Carriers | A delay-rate bar | `/data`, that carrier, delayed | its delayed count |
  | Carriers | A table row | `/data`, that carrier | its orders, e.g. FedEx 89 |
  | Forecast | A scope card | `/forecast` with that scope chosen | its forecast |

- [ ] **How it looks.**
  - The whole card is one link and one tab stop. Its accessible name says what opens, e.g. "Delayed orders: view the 55 orders".
  - **Hover and focus:** the border turns sage and a small arrow appears.
  - **A short line at the card's foot,** e.g. "View the 55 orders", is always visible, so the link can be found on touch.
  - **Bars and table rows:** the name is the link, and the whole row is its hit target.
  - **No links inside links.** A card that holds a button, such as a chart card with its Data table button, is not wrapped. It gets the foot link only.
- [ ] **Ask.**
  - In "How this was computed", a query answer gets "Open the N orders behind this answer". It opens `/data` with the spec's filters and its period, on the metric's date field.
  - It appears only when every part of the spec maps to a Raw data filter; otherwise there is no link.
  - A forecast answer links to `/forecast` with its scope.
- [ ] **Tests.**
  - Every row of the table above has a test. For each count, the linked view's summary shows the same number as the card.
  - The Ask link's view counts the same orders as the answer, for one filtered question and one with a period.
  - `npm run check` passes.
  - Tab through the Overview in headless Edge: every card is reached once, and its focus ring is visible.

## Comments
