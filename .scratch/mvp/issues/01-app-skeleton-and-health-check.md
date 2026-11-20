# 01: App skeleton, data loading and health check

**What to build:** A visitor opens the app and sees an empty dashboard shell headed "Data as of 31 Dec 2025", and `GET /api/health` answers `{"rows":400,"anchor":"2025-12-31"}`. Underneath is the Next.js app from ADR 0004, with the dataset loaded and validated as ADR 0005 describes. This is the thinnest complete path from the CSV to a deployable page.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] Stack, versions, folder layout, and `engines.node >=22` as in ADR 0004; npm with a committed lockfile.
- [ ] Scripts `typecheck`, `test`, `build`, and `check` (all three); the "Checks" paragraph in `CLAUDE.md` is replaced with the exact commands.
- [ ] A GitHub Actions workflow runs `npm ci && npm run check` on push and pull request, with no secrets.
- [ ] An architecture test fails on any import that breaks the one-way dependency rule in ADR 0004 (proved by a test case with a forbidden import).
- [ ] The CSV is read once per server instance with `csv-parse` and parsed by the Zod row schema in ADR 0005; an invalid row throws with its row number. Nothing writes to `data/`.
- [ ] Row-schema tests: `is_promo` `"0"` → false and `"1"` → true; `""` in a numeric column → error; `"1x5"` → error; `2025-02-30` → error.
- [ ] Invariant tests on the real file, as listed in ADR 0005 (400 rows, unique `order_id`, null `delivery_date` exactly for in-transit and canceled, `delivery_date` ≥ `order_date`, order value = quantity × unit price within 0.01, promo discount > 0 exactly when `is_promo`).
- [ ] The anchor date is computed at load as the latest `order_date` or `delivery_date` (2025-12-31), never hard-coded, and the page header shows "Data as of 31 Dec 2025".
- [ ] `GET /api/health` returns `{"rows":400,"anchor":"2025-12-31"}`.

If this turns out too big for one Sandcastle iteration, split the CI workflow and the architecture test into their own ticket, numbered right after this one.

## Comments

- 2026-11-20: Next.js 16.4 app per ADR 0004: data/mock_logistics_data.csv read once per server instance with csv-parse and the ADR 0005 Zod row schema (invalid rows throw with their row number), anchor date computed from the data, page header Data as of 31 Dec 2025, GET /api/health, CI workflow, and an architecture test for the dependency rule. Verified: 35 Vitest tests green (row-schema traps, invariants on the real file, health body, page header, forbidden-import cases); npm run check passes here and in a clean copy after npm ci on npm 10; next start served rows 400 and anchor 2025-12-31 on /api/health and the header on /.
