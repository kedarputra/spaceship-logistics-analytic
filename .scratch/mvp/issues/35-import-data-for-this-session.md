# 35: Import data (admin): check a CSV, then view the whole app on it, for this session only

**What to build:** An admin uploads an orders CSV in the file's format. The app checks every row and lists every problem. When the file is clean, one click switches the admin's session to it: every page, Ask, the reports and the downloads then run on the imported orders.

Nothing is written to disk. `data/mock_logistics_data.csv` stays read-only (R6, CLAUDE.md), and other users keep seeing the original data.

Asked by the user on 21 Nov 2026: "a report section that can export and import data".

**Blocked by:** 34
_34 Reports: the monthly WMS report, as a page, a PDF and a CSV_

**Status:** ready-for-agent

- [ ] **Checking a file:** `validateOrders(csv)` in `src/domain/orders.ts` returns `{ orders, problems }` and collects every problem, each with a row number, column and message, instead of stopping at the first. `parseOrders` keeps its behaviour for the dataset file by building on it.
- [ ] **Import rules,** on top of `orderRowSchema`. The file in `data/` must pass all of them, with a test that checks so.
  - **Header:** exactly the file's columns, in its order.
  - **Fixed values:** `carrier`, `region`, `warehouse`, `origin_city` and `product_category` take one of the values in `DIMENSION_VALUES`. The query spec and the model's prompt list those values, so a new carrier would break Ask.
  - **Unique IDs:** `order_id` is unique.
  - **Dates and status:** `delivery_date` is empty exactly when the status is `in_transit` or `canceled`, and otherwise not earlier than `order_date`.
  - **Order value:** `order_value_usd` equals `quantity × unit_price_usd` to the cent (trap 6).
  - **No formulas:** free-text cells (client, order ID, destination, SKU) are at most 100 characters and don't start with `=`, `+`, `-` or `@` (formula injection on export).
  - **Size:** at most 5 MB and 20,000 rows, enforced while reading the upload, not after.
- [ ] **The page `/import`,** admin only (ticket 31 matrix, linked from Reports).
  - A drop zone with a file picker, and "Download a template": the header and the file's first 5 rows.
  - **After an upload:**
    - "N rows · M problems";
    - a table of the problems (row, column, problem), the first 100, with "and K more";
    - for a clean file, a preview of the five KPIs and the anchor date.
  - "Use this data" is enabled only with 0 problems. All or nothing: a partly imported file would show numbers that silently differ from the file the admin holds.
- [ ] **This session only.**
  - The imported dataset lives in server memory, keyed by a random session ID that ticket 31's cookie gains.
  - It goes away on sign-out, after 2 hours, or when the server restarts (each deploy restarts it).
  - At most 3 imported datasets at a time; a fourth evicts the oldest.
  - Its anchor date is computed from it (ADR 0002).
- [ ] **One way to the active dataset.**
  - `getDataset()` call sites move to `getActiveDataset()`, which returns the session's import or the file. Pages, API routes, Ask, reports and downloads all use it.
  - **Data-valued filters:** `valuesInData` in `src/tools/spec.ts` caches the file's distinct destinations, clients and SKUs today. It takes the active dataset instead, cached per dataset, so a spec validates against the data it runs on.
  - **AI cache:** `src/ai/cache.ts` keys entries by question, model and prompt version. Add the dataset's ID, a hash of its content, so a sentence written for one dataset is never shown for another.
  - The model never sees rows, as before.
- [ ] **A banner on every page** while an import is active, in the amber tint with an icon:
  - "Imported data: `<file name>` · N orders · data as of `<anchor>`"
  - a button, "Back to the original data", which clears the import.
- [ ] **Security.**
  - Admin only, on the page and in `POST /api/import`; `Origin` checked.
  - At most 10 imports an hour per user.
  - Only `.csv` with a text/csv or text/plain type, read as UTF-8; a BOM is accepted and stripped.
  - The upload is never written to disk or logged; the log line holds only the size, the row count and the problem count.
- [ ] **Docs.**
  - **ADR 0013 (import as a session view).** Records why, the rules, the limits, and that R6 still holds.
  - **README:** a line under the features; under limitations, that imports don't persist.
  - **GLOSSARY:** Import, Active dataset.
- [ ] **Tests.**
  - Every rule, each with a failing row.
  - The file in `data/` passes.
  - The size limits.
  - All or nothing.
  - **Isolation:** two sessions, one with an import: each page reads its own dataset.
  - **Cache:** the same question on two datasets gives two cache entries.
  - **Spec values:** a spec with an imported client validates only for the session that imported it.
  - **Lifetime:** eviction and expiry, with fake timers.
  - **Roles:** Viewer and Analyst get 403.
  - `npm run check`; the eval is unchanged, since it runs on the file.

## Comments
