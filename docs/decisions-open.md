# Open decisions

Planning input for `/wayfinder` or `/grilling`. Each decision lists options and a recommendation; the person submitting decides, and the result goes into an ADR in `docs/adr/`. Once an ADR exists, it wins over this file.

## D1 Stack and layout

**Decided:** [ADR 0004](adr/0004-stack-and-layout.md).

- **Options:** one Next.js app (App Router, API routes for the backend); Next.js frontend plus a separate NestJS backend; Python backend.
- **Recommendation:** one Next.js 15 + React 19 + TypeScript app with Tailwind and Vitest. The candidate already works in this stack. Clean module boundaries inside one app (AI layer, computation, presentation) satisfy R10 without a second service, and the brief warns against over-engineering.

## D2 Where the data lives

**Decided:** [ADR 0005](adr/0005-data-in-memory.md).

- **Options:** parse the CSV into memory at startup and compute in TypeScript; DuckDB or SQLite with SQL generated from the spec by code; Postgres.
- **Recommendation:** in memory. 400 rows, read-only. The query spec maps to typed TypeScript aggregation, so there is no SQL anywhere and the "raw AI SQL" risk (R10) disappears. Mention Postgres under future improvements.

## D3 LLM, model, and structured output

**Decided:** [ADR 0009](adr/0009-llm-layer.md) (our self-hosted gateway). The Claude recommendation below and the earlier Gemini direction are superseded.

- **Options:** Claude via the Anthropic API with structured output; another provider.
- **Recommendation:** Claude with structured output (load the `claude-api` skill before writing the call). Anthropic's current default model is `claude-opus-5-5`; a cheaper model for the router is a cost choice for the candidate to make. The key is the candidate's own, kept in the hosting platform's environment variables, with a spend limit. Identical questions are cached (B2) so answers do not change between runs.

## D4 KPI definitions

**Decided:** [ADR 0001](adr/0001-kpi-definitions.md).

- **Options:** reading A (status-literal) or reading B (completed deliveries). Numbers for both are in `docs/data.md`.
- **Recommendation:** reading B. Delayed and exception orders were delivered, so delivered means completed (370), and on-time rate is the share of completed deliveries with `status = delivered` (82.16%). Show the breakdown (304 on time, 55 delayed, 11 exception) and a short definition next to each KPI.

## D5 Anchor date and relative periods

**Decided:** [ADR 0002](adr/0002-anchor-date-and-relative-periods.md).

- **Options:** anchor at the last date in the data or at the real current date; "last month" as the previous calendar month or the latest complete month; "last 3 months" as 3 calendar months ending at the anchor or 90 days.
- **Recommendation:** anchor 2025-12-31, shown in the header. "Last month" = the calendar month before the anchor's month (November 2025). "Last 3 months" = the 3 calendar months ending with the anchor's month (October–December 2025). Delivery outcomes filter on `delivery_date`, volume on `order_date`. Always show the resolved dates in the explanation.

## D6 Supported question subset

**Decided:** [ADR 0006](adr/0006-supported-questions.md).

- **Recommendation:** a small whitelist the spec validates against.
  - Metrics: order count, delivered, delayed, on-time rate, delay rate, average delivery time, units, gross value.
  - Dimensions: day/week/month, carrier, region, warehouse, origin, destination, category, status, client.
  - Filters: date range or relative period, plus any dimension value.
  - Sort and limit, for "top N" and "highest".
  - Chart rules: time dimension → line (bar for counts per week); one categorical dimension with up to about 12 values → bar; a single value → answer card; share of a whole → stacked bar.
  - Anything outside the whitelist gets an honest "not supported" plus example questions that are (B6).

## D7 Forecasting

**Decided:** [ADR 0003](adr/0003-forecasting.md).

- **Series:** monthly units by `order_date`, for the total, a category, a warehouse, or a region.
- **SKU questions:** the history is too short (at most 3 orders per SKU). Say so, show the SKU's history, and offer the forecast for its category.
- **Method:** compare a moving average, linear regression, and Holt's linear trend (double exponential smoothing). Hold out the last 3 months, keep the method with the lowest error, and report that error. With 12 months, do not model seasonality; mention the January spike.
- **Inventory recommendation:** forecast demand over the horizon plus safety stock (for example z = 1.65 × residual standard deviation × √horizon). State that there is no on-hand stock in the data.

## D8 Hosting and access

**Decided:** [ADR 0010](adr/0010-self-hosted-deployment.md) (self-hosted on the home server), which supersedes [ADR 0007](adr/0007-hosting-and-access.md) (Vercel).

- **Options:** Vercel, Railway, Render, Fly (paid, pay-as-you-go per the recruiter); no login, or one shared test account.
- **Recommendation:** Vercel on a paid plan, no login so reviewers get in straight away, with rate limiting and a spend cap on the LLM route to protect the key. If a login is added, the credentials go in the submission email.

## D9 Bonus scope

**Decided:** [ADR 0008](adr/0008-bonus-scope.md).

- **Recommendation:** include the cheap ones: query history kept in the browser (B1), caching identical questions (B2), unit tests for computation and spec validation (B3), suggested questions for ambiguous or unsupported input (B6). Skip Docker (B4) unless time is left.
