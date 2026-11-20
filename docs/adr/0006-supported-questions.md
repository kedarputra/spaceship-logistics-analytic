# 0006: Supported questions: a whitelist of metrics, one dimension, charts chosen by code

Status: accepted
Date: 2026-11-20
Resolves: D6 in docs/decisions-open.md

## Context

R3 and R4 ask for a defined subset of analytical queries. Dimension sizes: carrier 9, region 5, warehouse 9, origin 9, category 8, status 5, client 30, destination 47, SKU 355 (313 SKUs have a single order).

The LLM can express one question as two different specs. "Order count with status = delayed" (dated by `order_date`) and "delayed orders" (dated by `delivery_date`) give 4 and 3 for November 2025. "Delivered" has two meanings: `status = delivered` (304 for 2025) and delivered orders (370, ADR 0001).

Origin and destination values have the form "City, XX" ("Austin, TX"). Within each column the part before the comma is unique, and no city appears in both columns.

## Decision

1. **Metrics.** One definition each in `domain/definitions`, with a fixed date field (ADR 0002):

   | Metric | Definition | Date field |
   |---|---|---|
   | order count | orders | `order_date` |
   | delivered orders | orders with a `delivery_date` | `delivery_date` |
   | on-time deliveries | `status = delivered` | `delivery_date` |
   | delayed orders | `status = delayed` | `delivery_date` |
   | exception orders | `status = exception` | `delivery_date` |
   | on-time rate | on-time deliveries ÷ delivered orders | `delivery_date` |
   | delay rate | delayed orders ÷ delivered orders | `delivery_date` |
   | average delivery time | mean of `delivery_date − order_date` over delivered orders | `delivery_date` |
   | units | sum of `quantity` | `order_date` |
   | gross order value | sum of `order_value_usd` | `order_date` |
   | net order value | sum of `order_value_usd × (1 − promo_discount_pct / 100)` | `order_date` |

   *Amended 20 Nov 2026 (ticket 22):* a twelfth metric, **share of orders** (`order_share`): the orders that match the question's filters (and group) ÷ all orders in the same period, whatever the filters, through `ratio()`, dated by `order_date`. "What share of orders were promo orders?" is 22 of 400, 5.5%; by carrier, the shares add up to all orders. It is shown like a rate, with its numerator and denominator; the small-sample rule does not apply, since its n is all orders, not delivered orders. Before this, such a question was answered with a bare count that the sentence then called a share. A sentence never calls a count a share, rate or percentage.

2. **Status-filter rewrite.** After validation, a pure function rewrites an order count filtered by status into its canonical form, with one test per row. A `dateField: "order_date"` override is carried over.

   | Spec from the model | Rewritten to | 2025 total |
   |---|---|---|
   | order count, status = delivered | on-time deliveries | 304 |
   | order count, status = delayed | delayed orders | 55 |
   | order count, status = exception | exception orders | 11 |
   | order count, status ∈ {delivered, delayed, exception} | delivered orders | 370 |
   | order count, any other mix of those three (for example delivered + delayed) | unchanged, dated by `delivery_date` | 359 for delivered + delayed |
   | order count, a status filter that includes `in_transit` or `canceled` | unchanged, dated by `order_date` (these orders have no delivery date) | 30 for in transit + canceled |

3. **Dimensions.** At most one group-by: day, week, or month; carrier, region, warehouse, origin, destination, category, status, client, or promo (yes/no). One built-in exception: delivery outcomes (on time / delayed / exception) by month or week, as a stacked bar. SKU is a filter only, never a group-by. Two arbitrary group-bys are not supported.
4. **Filters and values.** A period (ADR 0002), and equality or a list of values on any dimension plus SKU. No numeric filters ("quantity > 5"). Small dimensions are schema enums; destination, client, and SKU are strings that code checks against the distinct values in the data. Matching is case-insensitive. For origin and destination, the part before the comma also matches ("austin" → "Austin, TX"). Near misses get a "did you mean"; an unknown value is rejected, never guessed. The explanation shows the resolved value.
5. **Sort and limit.** Sort by the metric, ascending or descending; limit 1–20 for "top N", "highest", and "lowest". By default categories are sorted by value, descending, and time chronologically. Rankings of rates and averages follow the small-sample cases in ADR 0001.

   *Amended 20 Nov 2026 (ticket 09):* an optional `minDelivered` (1–100) keeps only the groups with at least that many delivered orders, so the follow-up "Only carriers with ≥ 20 deliveries" (ADR 0001 §6) has a spec to run and a question can say "among carriers with at least 20 deliveries". It is a threshold on a group's n, not a numeric filter on orders, so §4's "no numeric filters" still holds. It is allowed only on rates and averages with a category group-by; weeks and single values are never dropped.
6. **Charts, chosen by code:**
   - no dimension → an answer card;
   - time + a count-like metric (orders, outcomes, units, value) → vertical bars;
   - time + a rate or average → a line;
   - one category → horizontal bars sorted by value, at most 12, with "N more in the table" beyond that;
   - share of a whole (delivery outcomes, status breakdown) → a stacked bar;
   - small-sample groups drawn lighter, with n on the label;
   - no pie charts; the table always appears.
7. **Explanation panel** (R5), collapsed by default: the interpretation in words (written by code from the spec, not by the LLM), the resolved period with its dates and date field, the filters with resolved values, the metric's one-line definition, any rewrite applied, the validated spec as JSON, the result table to 2 decimals, and for count answers the matching orders (up to 50 rows, then "and N more").
8. **Ambiguous and unsupported questions** (B6). An ambiguous question gets a documented default, stated in the answer, with chips for the alternatives: "best carrier" → highest on-time rate; "performance" → on-time rate; "late" → delayed (ADR 0001). A clarifying question only when no default makes sense. An unsupported question gets a statement of what was out of scope ("numeric filters aren't supported") and 3 supported example questions from a fixed list in code; the LLM picks which ones but never writes them.

## Consequences

- A test asserts the city facts above (short names unique per column, no city in both columns), so a data file that breaks the short-name match fails loudly instead of matching the wrong city.
- The eval set (D3) includes a "status = delivered" question and a short city name.
- The README's "Supported questions" section lists the whitelist and what is out of scope: two group-bys, numeric filters, SKU group-by, per-SKU forecasts, and free-text follow-ups.
