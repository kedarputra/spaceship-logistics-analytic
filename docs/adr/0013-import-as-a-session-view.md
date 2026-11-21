# 0013: An import is a view for one session, checked whole and kept only in memory

Status: accepted
Date: 2026-11-22

## Context

On 21 Nov 2026 the user asked for "a report section that can export and import data". Export came with ticket 34. Import has to live with rules that were settled earlier:

- **R6:** `data/mock_logistics_data.csv` is read-only, and nothing writes to `data/` (CLAUDE.md, ADR 0005).
- **The fixed values:** the query spec's small dimensions, and the model's prompt, list the file's carriers, regions, warehouses, origins and categories (ADR 0006). A new carrier would be a value Ask could not name.
- **No database** (ADR 0005), and one server instance (ADR 0010 §5).
- **Shared test accounts:** reviewers sign in with one account per role (ADR 0012), so one admin's import must never become what another reviewer sees.

## Decision

1. **An import is a view, not a change.** An admin uploads an orders CSV at `/import`. Once it is clean, "Use this data" makes it that session's **active dataset**: every page, Ask, the reports and the downloads run on it. Every other session, the same admin's other browser included, keeps the file. Nothing is written to disk: the upload is read into memory, parsed there and kept there. R6 holds.

2. **The rules.** `validateOrders(csv)` in `src/domain/orders.ts` checks every row and collects every problem, with its row (as a spreadsheet numbers it, the header being row 1), column and message. `parseOrders` is `validateOrders` that throws on the first problem, so the file in `data/` passes the same rules, and a test says so.
   - **Size:** at least one row, at most 20,000 rows and 5 MB.
   - **Header:** exactly the file's 17 columns, in its order.
   - **Row schema:** ADR 0005's, its messages in words ("Expected a date as YYYY-MM-DD").
   - **Fixed values:** carrier, region, warehouse, origin city and category take one of the file's values (`FIXED_VALUES`, which the query spec's `DIMENSION_VALUES` now points to; the lists and the prompt are unchanged).
   - **Unique IDs:** a repeated `order_id` is a problem on each later row, naming the first.
   - **Dates and status:** `delivery_date` is empty exactly for orders in transit or canceled, and otherwise not earlier than `order_date`.
   - **Order value:** `order_value_usd` = `quantity` × `unit_price_usd`, compared in whole cents (docs/data.md trap 6).
   - **No formulas:** client, order ID, destination and SKU are at most 100 characters and don't start with `=`, `+`, `-` or `@`, since the downloads write them back out.

3. **All or nothing.** A file with any problem keeps no order: `validateOrders` returns none, and "Use this data" is enabled only at 0 problems. Using a file sends it again (`POST /api/import?use=1`) and the server checks it again, so it never takes the page's word that the file was clean. A partly imported file would show numbers that silently differ from the file the admin holds.

4. **The session ID.** The session cookie gains `sessionId`, 16 random bytes in base64url, new at every sign-in and covered by the cookie's signature. A cookie signed before this change has none: it still verifies and can check a file, but has no import, and "Use this data" asks it to sign in again (409).

5. **Where it lives, and for how long.** In the server process's memory, in one store keyed by session ID (`src/app/import-store.ts`, on `globalThis` so every bundle of the app shares it).
   - At most 3 imports at a time; a fourth session's import evicts the oldest. A session that imports again replaces its own.
   - An import lasts 2 hours, and never longer than its session.
   - It goes on sign-out, on "Back to the original data" (`DELETE /api/import`), and when the server restarts, which every deploy does.
   - Its anchor date is computed from it (ADR 0002), as the file's is.

6. **One way to the active dataset.** `getActiveDataset(sessionId)` in `src/app/active-dataset.ts` returns the session's import or the file. `withRole` hands it to every page, `withApiRole` to every route and `currentViewer` to the layout, each with the session ID from the verified cookie; the tools take the dataset as an argument, and every page and route passes it. Only three places read the file directly, by design: `/api/health` (the monitors check the file shipped), the template (the file's first 5 rows), and the eval. `answerQuery` and `answerForecast` still fall back to the file when called without a dataset, for the eval and for the AI layer's tests, which may not import `domain/` to pass one (ADR 0004).

7. **The spec checks the data it runs on.** The data-valued filters (destination, client, SKU) accept the values of the dataset the spec will run on, worked out once per dataset (`valuesInData`, kept in a `WeakMap`, so they go with an evicted import). The AI layer validates the model's reply with the module-level schema, so the dataset travels with the request: the routes run validation inside `validatingAgainst(dataset, …)`, an `AsyncLocalStorage` scope; outside one it is the file. A client only an import has validates only for the session that imported it.

8. **The question cache** (ADR 0009 §6) keys each entry by the dataset's ID too: the SHA-256 of its text. The same question on two datasets is two entries, so a sentence written for one dataset's numbers is never shown with another's. The model never sees rows, as before; it sees the question, the spec's schema and the result's facts.

9. **The way in.**
   - **Admins only,** on the page and on `POST /api/import` and its template (ADR 0012 §1). Going back is open to any session, for its own import.
   - **Same origin:** `POST` and `DELETE` need `Sec-Fetch-Site: same-origin` (ADR 0012 §7).
   - **10 imports an hour per user, and 10 checks.** Each has its own count, so checking a file and using it is one of each. An upload is counted before its body is read, so uploads sent at once cannot slip past.
   - **Only a `.csv`** sent as `text/csv` or `text/plain`. Windows names a .csv after Excel (`application/vnd.ms-excel`) when Excel is installed, so the page sends such a file, or one without a type, as `text/csv`; the server reads it as UTF-8 CSV either way, and drops a byte-order mark.
   - **Limits while reading** (`readCsvUpload`). The upload must give its length, as a browser does for a file (411 without one). One over 5 MB is refused before a byte is read. Reading stops at once if the body runs past its length, or past 20,000 rows, and a body that ends short of its length is refused too. The size and row refusals are the app's own 413 messages.
   - **The request proxy.** Next's request proxy copies a body before the route reads it, by default up to 10 MB, and drops the rest without an error. `proxyClientMaxBodySize` in `next.config.ts` is one byte over 5 MB, so no larger upload is ever held whole. A body it cuts off falls short of its length, so it can never pass for a whole file.
   - **Logs:** one line per upload, with its size, its row count and its problem count, never its content or name.

10. **On screen** (ADR 0011).
    - **`/import`:** the Orders file card, with the rules in its info popover, "Download a template" (the header and the file's first 5 rows) and a drop zone with a file picker.
    - **After a check:** the file's name, "N rows · M problems", then a table of the first 100 problems (row, column, problem) with "and K more", or, for a clean file, its anchor date and the Overview's five KPI cards, which open nothing yet.
    - **While an import is in use:** a banner over every page, on the amber tint with an icon: "Imported data: `<file name>` · N orders · data as of `<anchor>`", and "Back to the original data". The rail names the file and says "imported" instead of "read-only".
    - **The file's name** replaces `DATASET_FILE` in the rail, Raw data and the report's PDF header.

## Consequences

- **An import does not persist.** It is gone after 2 hours, on sign-out and at every deploy, and there is no history of imports. The README says so under limitations.
- **Reviewers sharing the admin account do not see each other's import:** an import belongs to one sign-in, not one account. They do share its 10 checks and 10 imports an hour.
- **Memory is bounded** by 3 imports of at most 20,000 rows each.
- **Pages must draw on any clean file,** not only the one in `data/`: one order, only orders in transit, one month. A test draws every page on such imports.
- **The eval is unchanged:** it runs on the file, and the prompt and schema are as they were.
- **A second instance** would need the imports, like the cache and the limits, in a shared store (ADR 0010 §5).
