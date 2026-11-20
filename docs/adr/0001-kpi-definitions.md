# 0001: KPI definitions: a delivered order is any order with a delivery date

Status: accepted
Date: 2026-11-20
Resolves: D4 in docs/decisions-open.md

## Context

The dataset has no promised-date column, so `status` is the only on-time signal. Delivery time does not separate the statuses: delivered orders took 1–8 days, delayed 2–11, exception 4–12. Delayed and exception orders were still delivered (they have a `delivery_date`). `docs/data.md` gives two readings. Reading A (status-literal) drops the 11 exception orders from the on-time denominator, which flatters the rate by leaving out the slowest deliveries.

Many groups are small. Counting delivered orders per group: GLS has 8 and DPD 18; no destination reaches 20 (the largest has 14); only 5 of 30 clients do. Every origin, warehouse, region, and category reaches 20. A filtered period shrinks every group further.

## Decision

Reading B, with these definitions. One definition module computes them for both the dashboard and the query tool.

1. **Delivered orders** = orders with a `delivery_date` (status `delivered`, `delayed`, or `exception`): 370. The KPI card shows the breakdown: 304 on time · 55 delayed · 11 exception.
2. **On-time delivery rate** = orders with `status = delivered` ÷ delivered orders: 304 / 370 = 82.16%.
3. **Delayed orders** = `status = delayed`: 55. "Delivered late" means the same thing. An exception order is neither on time nor delayed; it has its own count in every delivery-outcome breakdown. **Delay rate** = delayed orders ÷ delivered orders, per group.
4. **Average delivery time** = mean of `delivery_date − order_date` in days over all delivered orders: 3.83 days.
5. **In-transit (27) and canceled (3) orders** count toward total orders (400) and are left out of every delivery KPI. The total shows "27 in transit · 3 canceled" next to it. `status` is trusted as given: there is no "overdue" category, even though 26 of the 27 in-transit orders were placed before December (the oldest on 3 Jan 2025).
6. **Small samples.** A group with fewer than 20 delivered orders is a small sample. This applies to rates and averages, where n is the number of delivered orders in the group (the rate's denominator); it does not apply to plain counts.
   - Rankings ("highest", "top N") rank every group and flag small samples.
   - If the top group is a small sample, the answer also names the top group with n ≥ 20. For carriers: GLS is highest at 25.0% (2 of 8) on only 8 deliveries; among carriers with at least 20, USPS is highest at 23.4% (11 of 47).
   - If no group reaches 20 (destinations always; clients mostly; carriers in a short period), the answer says that no group has enough deliveries for a reliable ranking, still shows the table with n per group, and flags the raw top group instead of naming a winner.
   - The query tool computes the ranking, the flags, and which case applies; the LLM only phrases them.
7. **Display.** Rates as percentages with 1 decimal next to their numerator and denominator ("82.2% · 304 / 370"); days with 1 decimal ("3.8 days"). Computation keeps full precision and tests assert the full value. The explanation panel's data table shows 2 decimals.

## Consequences

- The "Reading B" column of the golden numbers in `docs/data.md` is the test expectation.
- On-time rate and delay rate do not add up to 100%: the 11 exception orders (2.97%) are in neither. The breakdown on the card makes this visible; the README states it.
- The README's assumptions and limitations list: on-time is derived from `status` because there is no promised date; exception is not counted as late; in-transit orders are trusted as open even when months old; groups under 20 delivered orders are flagged.
- The query tool's result carries n per group and a small-sample flag, so the ranking cases above are decided in code and are testable.
