# Glossary

Terms marked *(proposed)* are candidates until an ADR in `docs/adr/` settles them; update the entry when it does.

| Term | Meaning |
|---|---|
| **Order** | One row of the dataset, identified by `order_id`. |
| **Status** | `delivered`, `delayed`, `in_transit`, `exception`, `canceled`. Delayed and exception orders were still delivered (they have a `delivery_date`). |
| **Delivered order** | An order with a `delivery_date`: status delivered, delayed, or exception. Also called a completed delivery. Not the same as `status = delivered`, which is an on-time delivery. ADR 0001. |
| **On-time delivery** | A delivered order with `status = delivered`. |
| **Delayed order** | A delivered order with `status = delayed`. "Delivered late" means the same. Exception orders are not delayed orders. |
| **Delivery outcome** | How a delivered order turned out: on time, delayed, or exception. Every delivered order has exactly one. |
| **Exception order** | A delivered order with `status = exception`: something went wrong, but the data does not say it was late. Counted as neither on time nor delayed. |
| **On-time delivery rate** | On-time deliveries divided by delivered orders. Always shown with numerator and denominator. ADR 0001. |
| **Delay rate** | Delayed orders divided by delivered orders, per group (for example per carrier). Shown with n. |
| **Share of orders** | The orders that match a question's filters (and group) divided by all orders in the same period: "22 of 400 orders were promo orders, 5.5%". Not a delivery rate: a percentage delivered on time is the on-time delivery rate. The small-sample rule does not apply. ADR 0006 §1 (amended). |
| **Delivery time** | `delivery_date − order_date` in whole days, over delivered orders. |
| **Small sample** | A group with fewer than 20 delivered orders. Rates and averages on it are flagged, and a ranking never names it as the winner on its own. ADR 0001. |
| **Anchor date** | The latest `order_date` or `delivery_date` in the data (2025-12-31). Relative periods count back from it; the UI shows it as "Data as of". ADR 0002. |
| **Relative period** | A period named against the anchor date. "Last month" is the full month before the anchor's month; "last 3 months" is the 3 months ending with the anchor's month; "this month" is the anchor's month. Always shown with its resolved dates. ADR 0002. |
| **Week** | An ISO week, Monday to Sunday, named by its Monday ("w/c 6 Oct"), never by its week number. ADR 0002. |
| **Carrier** | The shipping company on the order. |
| **Region / warehouse** | Fulfilment region (US-E, US-W, US-C, EU, UK) and the warehouse code that shipped the order. |
| **SKU / product category** | Product identifier and its category (CRAYON, PAPER, ...). |
| **Demand** | Units ordered (`quantity`) per period, by `order_date`. |
| **Forecast scope** | The series a forecast covers: the total, one product category, one warehouse, or one region. Never a single SKU: a question about one SKU gets its order history and its category's forecast. ADR 0003 §1, §9. |
| **Forecast horizon** | How many future months are forecast: 1 to 6, and 3 when the question does not say. ADR 0003. |
| **Forecast target** | The months a question names ("in 2027", "in Q2", "in March"), as opposed to a horizon count. The forecast runs to its end within the 6-month reach, and says first when it lies wholly beyond. ADR 0003 §6. |
| **Safety stock** | Units added to forecast demand to cover forecast error at a 95% service level. ADR 0003. |
| **Inventory recommendation** | Units to plan for over the horizon: forecast demand plus safety stock. There is no on-hand stock data, so it is a plan, not a reorder quantity. |
| **Rough forecast** | A forecast whose holdout error is more than half of actual demand (WAPE over 50%). Shown with that label. ADR 0003. |
| **Query spec** | The structured, validated object the AI layer produces from a question: tool, metric, dimensions, filters, time range, chart hint. Code executes it; the LLM never writes SQL or code. |
| **Tool** | A computation path the AI layer can select: the **query tool** (aggregations and KPIs) or the **forecast tool**. |
| **Interpretation** | The model's one structured output for a question: a query spec, a forecast spec, or "unsupported" with its reason and 3 example questions picked from a fixed list. Validated before anything runs. ADR 0009 §3. Not to be confused with the *interpretation in words* an answer shows, which code writes from the spec. |
| **Query history** | The last 20 questions asked in this browser, each with its validated spec and the time it was asked, kept in localStorage and never sent to the server. Shown as "Recent questions"; a re-run sends the saved spec to `/api/run`, without the model. ADR 0008 §1. |
| **Cached answer** | An answer whose interpretation, and usually its sentence, came from the server's question cache instead of a new model call. Marked "Cached". ADR 0008 §2, ADR 0009. |
| **Assumption** | The ambiguous word a question used ("best", "performance", "late") and the documented default it was read with. The answer states it and offers the other readings as chips. ADR 0006 §8. |
| **Explanation panel** | What every answer shows: filters, metrics and dimensions, the resolved query spec, and the underlying rows or summary. |
| **Status rewrite** | An order count filtered by status, rewritten after validation into its canonical metric ("order count with status delayed" → delayed orders). Shown in the explanation panel as "Rewritten". ADR 0006 §2. |
| **Number guard** | The check on the model's sentence: every number in it must appear in the facts block exactly as formatted there, written as digits. A sentence must also be complete, name every group the result requires, and be worded the right way round. ADR 0009 §4. |
| **Template fallback** | The sentence code writes from the result, opening the answer when the model's sentence fails the number guard or the phrase call fails. ADR 0009 §4. |
| **Pipeline trace** | The strip in the explanation panel showing R7's stages in order (question, interpretation, tool selected, computation, result, phrasing, chart), each with what happened and its time. A retry, a template fallback, a status rewrite and a rough forecast are flagged. It names why a sentence was dropped, never the model's own words. ADR 0008 §4. |
| **Review window** | From submission until Spaceship confirms the review is over. The server is held stable during it: no Windows Update, no model switch, no heavy GPU work. ADR 0010. |
| **Gross / net order value** | `order_value_usd` as given (gross), or after the promo discount (net). |
| **Role** | What a signed-in account may do: Viewer, Analyst or Admin. One matrix in code (`can(role, action)` in `src/auth/roles.ts`) decides it for every page, API route and the rail, with the role the users file gives the account now. ADR 0012. |
| **Viewer** | The role that reads the dashboards: Overview, Delivery, Carriers, Forecast and Raw data. It cannot ask the data or download. |
| **Analyst** | The role that also asks the data (`/ask`, `/api/ask`, `/api/run`) and downloads (`/api/orders.csv`). |
| **Admin** | The role that also imports data and sees the accounts and their roles (`/users`). |
