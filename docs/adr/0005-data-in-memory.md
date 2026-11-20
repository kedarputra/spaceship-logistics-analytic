# 0005: Data lives in memory, parsed from the CSV at runtime and validated on load

Status: accepted
Date: 2026-11-20
Resolves: D2 in docs/decisions-open.md

## Context

The dataset is one read-only file of 400 rows (57,475 bytes): UTF-8 without a byte-order mark, LF line endings, ASCII only. It has 800 quoted fields (origin and destination cities such as "London, UK") and no escaped quotes, so a naive comma split breaks. In Next 16.4.6, `readFileSync(path.join(process.cwd(), "data", ...))` in a route handler is traced into that route's output, so the file ships with the function without extra configuration.

Three parsing traps were checked on Zod 4.6.7:
- `z.coerce.boolean()` turns `"0"` into `true`, which would make every order a promo.
- `z.coerce.number()` turns `""` into `0` instead of failing.
- A decimal regex with an unescaped dot accepts `"1x5"`, which `Number` turns into `NaN`.

`z.iso.date()` rejects impossible or malformed dates (`2025-02-30`, `2025-2-3`).

## Decision

1. **In memory.** Computation is typed TypeScript over the parsed rows. No database and no SQL anywhere, so the "raw AI SQL" risk (R10) cannot arise.
2. **Loading.** `src/domain/orders` reads `data/mock_logistics_data.csv` with `fs` at runtime, once per server instance, and keeps the parsed rows in a module-level memo. Nothing ever writes to `data/`. `GET /api/health` returns `{ "rows": 400, "anchor": "2025-12-31" }`, so one request after each deploy confirms that the file shipped and parsed.
3. **Parser:** `csv-parse/sync` with `columns: true`.
4. **Row schema.** A Zod schema turns each row into a typed `Order`; any invalid row throws at load with its row number, never skipped (a dropped row would change every KPI).
   - Dates: `z.iso.date()`, kept as `YYYY-MM-DD` strings. An empty `delivery_date` becomes `null`.
   - `status`: `z.enum` of the five statuses.
   - Numeric columns: `z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)`. Never `z.coerce.number()`.
   - `is_promo`: `z.enum(["0", "1"]).transform((v) => v === "1")`. Never `z.coerce.boolean()`.

## Consequences

- Row-schema unit tests cover the traps: `is_promo` `"0"` → `false` and `"1"` → `true`; `""` in a numeric column → error; `"1x5"` → error; `2025-02-30` → error.
- Invariant tests run on the real file: 400 rows; unique `order_id`; `delivery_date` is null exactly for `in_transit` and `canceled`; `delivery_date` ≥ `order_date`; `order_value_usd` = `quantity × unit_price_usd` within 0.01; `promo_discount_pct` > 0 exactly when `is_promo` is 1 (22 rows).
- The README lists a database under future improvements, for data that grows or changes.
- The deploy checklist includes the `/api/health` check.
