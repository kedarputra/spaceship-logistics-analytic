# Glossary

Terms marked *(proposed)* are candidates until an ADR in `docs/adr/` settles them; update the entry when it does.

| Term | Meaning |
|---|---|
| **Order** | One row of the dataset, identified by `order_id`. |
| **Status** | `delivered`, `delayed`, `in_transit`, `exception`, `canceled`. Delayed and exception orders were still delivered (they have a `delivery_date`). |
| **Completed delivery** | An order with a `delivery_date`: delivered, delayed, or exception. |
| **Delivered order** *(proposed)* | Either `status = delivered` or any completed delivery. See D4 in `docs/decisions-open.md`. |
| **Delayed order** | `status = delayed`. Also called "delivered late". |
| **On-time delivery rate** *(proposed)* | On-time deliveries divided by the chosen denominator (D4). Always shown with numerator and denominator. |
| **Delivery time** | `delivery_date − order_date` in whole days, over completed deliveries. |
| **Delay rate** | Delayed orders divided by completed deliveries, per group (for example per carrier). Shown with n. |
| **Anchor date** *(proposed)* | The date that relative periods count back from: 2025-12-31, the last date in the data. Shown in the UI. |
| **Relative period** | "Last month", "last 3 months", "last week": resolved against the anchor date into explicit dates before computation. |
| **Carrier** | The shipping company on the order. |
| **Region / warehouse** | Fulfilment region (US-E, US-W, US-C, EU, UK) and the warehouse code that shipped the order. |
| **SKU / product category** | Product identifier and its category (CRAYON, PAPER, ...). |
| **Demand** | Units ordered (`quantity`) per period, by `order_date`. |
| **Forecast horizon** | How many future periods are forecast, such as the next 4 months. |
| **Inventory recommendation** | Units to plan for the horizon: forecast demand plus safety stock. There is no on-hand stock data, so it is a plan, not a reorder quantity. |
| **Query spec** | The structured, validated object the AI layer produces from a question: tool, metric, dimensions, filters, time range, chart hint. Code executes it; the LLM never writes SQL or code. |
| **Tool** | A computation path the AI layer can select: the **query tool** (aggregations and KPIs) or the **forecast tool**. |
| **Explanation panel** | What every answer shows: filters, metrics and dimensions, the resolved query spec, and the underlying rows or summary. |
| **Gross / net order value** | `order_value_usd` as given (gross), or after the promo discount (net). |
