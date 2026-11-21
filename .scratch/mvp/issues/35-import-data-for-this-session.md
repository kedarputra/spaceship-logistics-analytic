# 35: Import data (admin): check a CSV, then view the whole app on it, for this session only

**What to build:** An admin uploads an orders CSV in the file's format. The app checks every row and lists every problem. When the file is clean, one click switches the admin's session to it: every page, Ask, the reports and the downloads then run on the imported orders.

Nothing is written to disk. `data/mock_logistics_data.csv` stays read-only (R6, CLAUDE.md), and other users keep seeing the original data.

Asked by the user on 21 Nov 2026: "a report section that can export and import data".

**Blocked by:** 34
_34 Reports: the monthly WMS report, as a page, a PDF and a CSV_

**Status:** done

- [x] **Checking a file:** `validateOrders(csv)` in `src/domain/orders.ts` returns `{ orders, problems }` and collects every problem, each with a row number, column and message, instead of stopping at the first. `parseOrders` keeps its behaviour for the dataset file by building on it.
- [x] **Import rules,** on top of `orderRowSchema`. The file in `data/` must pass all of them, with a test that checks so.
  - **Header:** exactly the file's columns, in its order.
  - **Fixed values:** `carrier`, `region`, `warehouse`, `origin_city` and `product_category` take one of the values in `DIMENSION_VALUES`. The query spec and the model's prompt list those values, so a new carrier would break Ask.
  - **Unique IDs:** `order_id` is unique.
  - **Dates and status:** `delivery_date` is empty exactly when the status is `in_transit` or `canceled`, and otherwise not earlier than `order_date`.
  - **Order value:** `order_value_usd` equals `quantity × unit_price_usd` to the cent (trap 6).
  - **No formulas:** free-text cells (client, order ID, destination, SKU) are at most 100 characters and don't start with `=`, `+`, `-` or `@` (formula injection on export).
  - **Size:** at most 5 MB and 20,000 rows, enforced while reading the upload, not after.
- [x] **The page `/import`,** admin only (ticket 31 matrix, linked from Reports).
  - A drop zone with a file picker, and "Download a template": the header and the file's first 5 rows.
  - **After an upload:**
    - "N rows · M problems";
    - a table of the problems (row, column, problem), the first 100, with "and K more";
    - for a clean file, a preview of the five KPIs and the anchor date.
  - "Use this data" is enabled only with 0 problems. All or nothing: a partly imported file would show numbers that silently differ from the file the admin holds.
- [x] **This session only.**
  - The imported dataset lives in server memory, keyed by a random session ID that ticket 31's cookie gains.
  - It goes away on sign-out, after 2 hours, or when the server restarts (each deploy restarts it).
  - At most 3 imported datasets at a time; a fourth evicts the oldest.
  - Its anchor date is computed from it (ADR 0002).
- [x] **One way to the active dataset.**
  - `getDataset()` call sites move to `getActiveDataset()`, which returns the session's import or the file. Pages, API routes, Ask, reports and downloads all use it.
  - **Data-valued filters:** `valuesInData` in `src/tools/spec.ts` caches the file's distinct destinations, clients and SKUs today. It takes the active dataset instead, cached per dataset, so a spec validates against the data it runs on.
  - **AI cache:** `src/ai/cache.ts` keys entries by question, model and prompt version. Add the dataset's ID, a hash of its content, so a sentence written for one dataset is never shown for another.
  - The model never sees rows, as before.
- [x] **A banner on every page** while an import is active, in the amber tint with an icon:
  - "Imported data: `<file name>` · N orders · data as of `<anchor>`"
  - a button, "Back to the original data", which clears the import.
- [x] **Security.**
  - Admin only, on the page and in `POST /api/import`; `Origin` checked.
  - At most 10 imports an hour per user.
  - Only `.csv` with a text/csv or text/plain type, read as UTF-8; a BOM is accepted and stripped.
  - The upload is never written to disk or logged; the log line holds only the size, the row count and the problem count.
- [x] **Docs.**
  - **ADR 0013 (import as a session view).** Records why, the rules, the limits, and that R6 still holds.
  - **README:** a line under the features; under limitations, that imports don't persist.
  - **GLOSSARY:** Import, Active dataset.
- [x] **Tests.**
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

- 2026-11-22: Done, committed and not pushed. ADR 0013 records the decision; ADRs 0005, 0009 §6 and 0011 §5 are amended, and the README and GLOSSARY ("Import", "Active dataset") updated. Before this ticket, a separate commit (0f03c62) put `Cache-Control: private, no-store` on every `withApiRole` response, so the CDN can never serve one session's file, or now its import, to another.
  - **Checking a file:** `validateOrders(csv)` returns `{ rows, orders, problems }` and collects every problem. `parseOrders` is `validateOrders` that throws on the first, so the file in `data/` passes every import rule (tested). Rows are numbered as a spreadsheet numbers them, the header being row 1, in `parseOrders`' message too. Within a row, problems follow the file's column order.
  - **The fixed values** moved to `FIXED_VALUES` in `domain/orders.ts`. The spec's `DIMENSION_VALUES` points at them, so the lists, the schema and the prompt are as they were.
  - **The session ID:** 16 random bytes, base64url, in the signed cookie, new at every sign-in. A cookie signed before has none: it verifies, can check a file, has no import, and "Use this data" asks it to sign in again (409).
  - **Where imports live:** `src/app/import-store.ts`, in memory on `globalThis` (one store per process, as the rate limiter is), keyed by session ID.
    - At most 3; a fourth session's evicts the oldest; a session's own import is replaced.
    - It lasts 2 hours, capped at the session's own expiry. Expiry is checked on every read and write, so an expired import is never served.
    - Sign-out (`/api/logout`) and "Back to the original data" (`DELETE /api/import`) drop it, and so does a restart.
  - **One way to the data:** `getActiveDataset(sessionId)` in `src/app/active-dataset.ts`. `withRole` passes it to every page as `dataset`, `withApiRole` to every route, and `currentViewer` to the layout. The tools take it as an argument: `queryResult`, `answerQuery`, `answerForecast`, `readOrdersView`, `filterLists`.
  - **What still reads the file directly, by design:** `/api/health`, the template, and the eval. `answerQuery` and `answerForecast` fall back to the file without a dataset, for the eval and `ai/phrase.test.ts`, which may not import `domain/`.
  - **Spec values:** `valuesInData` is cached per dataset in a `WeakMap`. The AI layer validates the model's reply with the module-level schema, and `ai/` was off limits, so the routes run validation inside `validatingAgainst(dataset, …)`, an `AsyncLocalStorage` scope in `tools/spec.ts`. Outside a scope it is the file.
  - **The cache key** in `ai/cache.ts` gains the dataset's ID, the SHA-256 of its text; nothing else under `src/ai/` changed. The model sees no rows, as before.
  - **Size, enforced while reading:**
    - An upload must give its length (411 without one). Over 5 MB is refused before reading.
    - `readCsvUpload` stops at once past that length or past 20,000 rows (a quote-aware `csvRecordCounter` in `domain/csv.ts`), and refuses a body that ends short of its length.
    - Next's request proxy copies a body before the route reads it, 10 MB by default, and silently drops the rest. `proxyClientMaxBodySize` is now 5 MB + 1 byte, so no larger upload is held whole, and a body it cuts off fails the length check.
  - **Decisions the ticket left open:**
    - At least one row, since an empty file has no anchor date.
    - Using a file uploads it again and the server checks it again, so the page's earlier check is never trusted.
    - "10 imports an hour" became 10 imports and 10 checks an hour per user, each with its own count, so checking and using a file is one of each.
    - A .csv that Windows labels `application/vnd.ms-excel`, or one with no type, is sent as `text/csv`; the server still accepts only text/csv or text/plain.
    - Going back to the original data is open to every role, for its own session.
    - `/import` is not in the rail, only linked from Reports. Its rules are in the Orders file card's info popover.
    - A clean file's preview is the Overview's KPI cards with their links off (`KpiCards linked={false}`).
    - The rail says "imported" in place of "read-only".
    - The log line is `Import checked|used: N bytes, R rows, P problems.`, with no name and no content.
  - **Tests:**
    - every rule with a failing row; the file passes; the size limits in both the domain and the streamed upload; all or nothing;
    - every page and the downloads for two sessions of one admin (`import-session.test.tsx`); every page drawn on five tiny imports (`imported-pages.test.tsx`);
    - two cache entries for one question on two datasets; an imported client accepted only for its session, through `/api/run` and through the AI layer's own schema;
    - eviction and expiry with fake timers;
    - 403 for viewers and analysts on `/import`, `POST /api/import` and the template.
  - `npm run check`: 1249 tests. Under `next start` on port 4810 (throwaway secret and users file, LLM pointed at a dead address):
    - exactly 5 MB (5,242,880 bytes, 10,620 rows) passed through the proxy and was checked (200);
    - 5 MB + 1 byte and 15 MB got the app's own 413 ("The file is over 5 MB…"), 20,001 rows its 413, and a chunked upload without a length 411.
  - **Headless Edge at 1280 and 320 px, 33 of 33 checks:**
    - the file without its first 5 rows checked clean ("395 rows · 0 problems", the KPI preview), then used: the banner "Imported data: clean-395.csv · 395 orders · data as of 31 Dec 2025", Overview's 395, Raw data's "Orders 395 of 395";
    - a second admin in another profile, at the same time, still saw 400;
    - "Back to the original data" brought back 400;
    - a file with five problems showed its table, with "Use this data" disabled;
    - the template downloaded as the header and the file's first 5 rows.
    Nothing scrolls sideways; at 320 px the problem table scrolls inside its card.
