# Dataset: `data/mock_logistics_data.csv`

Measured on 20 Nov 2026 with a script over the raw CSV. Treat the file as read-only.

## Shape

- 400 rows, 17 columns, one row per order (400 distinct `order_id`).
- Columns: `client_id, order_id, order_date, delivery_date, carrier, origin_city, destination_city, status, sku, product_category, quantity, unit_price_usd, order_value_usd, is_promo, promo_discount_pct, region, warehouse`.
- `order_date` runs from 2025-01-01 to 2025-12-30; `delivery_date` from 2025-01-02 to 2025-12-31. **All data is from 2025.**
- The only empty cells are `delivery_date` for the 27 `in_transit` and 3 `canceled` orders.

| Field | Values |
|---|---|
| `status` | delivered 304, delayed 55, in_transit 27, exception 11, canceled 3 |
| `carrier` | FedEx 89, UPS 88, DHL 63, USPS 49, OnTrac 29, LaserShip 27, Royal Mail 26, DPD 20, GLS 9 |
| `region` | US-E 95, US-W 92, EU 81, US-C 78, UK 54 |
| `warehouse` | 9: LON-FC1, EWR-DC1, SFO-DC2, ATL-DC1, LAX-DC1, AMS-FC1, DFW-DC1, BER-FC1, CHI-DC1 |
| `product_category` | CRAYON 69, STICKER 52, MARKER 51, BRUSH 49, PAINT 49, PENCIL 45, PAPER 43, BOOK 42 |
| Other | 30 clients, 355 SKUs, 9 origin cities, 47 destination cities, 22 promo orders |

Delivery time (`delivery_date − order_date`, in days) by status: delivered n=304, 1–8, mean 3.25; delayed n=55, 2–11, mean 6.11; exception n=11, 4–12, mean 8.45. No negative durations.

## Traps

1. **"Last month" relative to today is empty.** The data ends on 2025-12-31. Relative periods need an anchor date, and the UI must show it ("data as of 31 Dec 2025"). Decision D5.
2. **"Delivered" and "on-time" have two reasonable readings.** There is no promised-date column, so on-time comes from `status`. Decision D4. The numbers for both readings are below.
3. **"Late last month" depends on two choices:** which month is "last", and whether the order or the delivery date counts. The four combinations give 3 or 4 orders. Show the resolved interpretation in the explanation.
4. **Small samples.** GLS has the highest delay rate (2 of 8 completed deliveries, 25.0%) on very little data; USPS (11 of 47, 23.4%) and UPS (17 of 78, 21.8%) follow. A good answer shows n and flags small samples.
5. **SKU-level forecasting has almost no history.** 355 SKUs, at most 3 orders each, and only 3 SKUs have 3. A per-SKU forecast is not meaningful; categories (10–12 months of data each) and the total are. Decision D7.
6. **`order_value_usd` is gross.** It equals `quantity × unit_price_usd` on every row; the promo discount is not applied (22 promo rows). Net value would be `order_value_usd × (1 − promo_discount_pct/100)`.
7. **`order_id` starts with `ORD-2026-`** although every order is from 2025. The ID carries no date; never parse dates from it.
8. **January is a spike** (75 orders, 233 units, against 18–46 orders in other months). With only 12 months, seasonality cannot be estimated.

## Golden numbers

Use these as test expectations once a definition is chosen.

| Measure | Reading A: status-literal | Reading B: completed deliveries |
|---|---|---|
| Total orders | 400 | 400 |
| Delivered orders | 304 (`status = delivered`) | 370 (has `delivery_date`: delivered + delayed + exception) |
| Delayed orders | 55 | 55 |
| On-time delivery rate | 304 / 359 = 84.68% (delivered ÷ delivered+delayed) | 304 / 370 = 82.16% (delivered ÷ completed) |
| Average delivery time | 3.25 days (status delivered) or 3.69 (delivered + delayed) | 3.83 days (all 370 completed) |

| Question | Value |
|---|---|
| Delayed orders, November 2025 | 3 by delivery date, 4 by order date |
| Delayed orders, December 2025 | 4 by delivery date, 3 by order date |
| Delayed orders, order date from 2025-10-01 | 10 orders across 7 ISO weeks |
| Carrier with highest delay rate (delayed ÷ completed) | GLS 2/8 = 25.0%; USPS 11/47 = 23.4%; UPS 17/78 = 21.8%; Royal Mail 5/25 = 20.0% |
| Units per month, all 2025 (Jan–Dec) | 233, 86, 148, 56, 115, 64, 126, 103, 94, 79, 113, 93 (total 1,310) |
| Units per month, CRAYON | 60, 12, 34, 11, 3, 22, 5, 25, 23, 14, 4, 16 |
| Units per month, BOOK | 3, 7, 6, 1, 9, 3, 10, 16, 4, 16, 16, 4 |
| Gross order value, all rows | USD 13,695.87 (net after promo: 13,568.01) |

## Which date field

- Order volume and demand: `order_date`.
- Delivery outcomes (delivered, delayed, delivery time): `delivery_date` when filtering by period, unless an ADR says otherwise. Explanations must state which field was used.
