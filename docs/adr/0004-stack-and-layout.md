# 0004: One Next.js app, layered folders with a tested dependency rule

Status: accepted
Date: 2026-11-20
Resolves: D1 in docs/decisions-open.md

## Context

The brief expects 6 to 10 hours and warns against over-engineering, while R10 asks for AI interpretation, computation, and business logic to be kept clearly apart. A second service would add deployment and CORS work without earning points. Versions were checked on npm on 20 Nov 2026. TypeScript's `latest` is 7.0.2, the native compiler. In a scratch app on Next 16.4.6 it worked: `next build` failed on a type error (TS2322) and passed on clean code, and `tsc --noEmit` exited 1 and 0 respectively. The lockfile written on Windows records the Linux x64 binaries for both the native TypeScript compiler and Next's SWC, so `npm ci` works on Linux CI, in the Sandcastle container, and on the host.

## Decision

1. **One Next.js app** (App Router). Route handlers are the backend; there is no separate service.
2. **Versions:** Next 16.4, React 19.3, TypeScript 7.0.2, Tailwind 4.3, Vitest 5.1, Zod 4.6, Recharts 3.11. npm, with the lockfile pinning exact versions, and `engines.node` `>=22` to match the Sandcastle image (`node:22`). The LLM SDK is chosen with the provider in D3.
3. **Layout:**

   ```
   src/
     domain/      orders (CSV → typed rows), definitions (ADR 0001), periods (ADR 0002)
     tools/       spec (zod schemas = the whitelist), query tool, forecast tool
     ai/          model client (model id from config), prompts, interpret (question → spec), phrase (result → sentence)
     app/         pages and route handlers (POST /api/ask); the dashboard calls domain directly, without the LLM
     components/  KPI cards, charts, explanation panel
   ```

   Dependencies point one way: `app/` and `components/` → `ai/` → `tools/` → `domain/`. `domain/` imports nothing else from `src/`; `tools/` imports only `domain/`; `ai/` imports only `tools/` and never reads the CSV or imports `domain/`; nothing outside `app/` imports `app/` or `components/`. A Vitest architecture test scans the import statements in each folder and fails on any other edge, so the rule runs inside `npm test`.
4. **Charts:** Recharts. Code picks the chart type from the spec and the shape of the result (D6); the LLM never writes a chart configuration.
5. **UI:** plain Tailwind and native elements (`<details>` for the explanation panel, `<table>` for data), with a handful of components written here. No component kit: shadcn/ui in particular copies third-party component source into the repo, which conflicts with "write the code here".
6. **Checks:** `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `build` (`next build`), and `check`, which runs all three. A GitHub Actions workflow runs `npm ci && npm run check` on push and pull request. Tests never call the LLM, so CI needs no secrets.
7. **TypeScript 7 holds while the checks are typecheck, test, and build.** If ESLint with typescript-eslint type-aware rules is added later, verify it against TypeScript 7 first, and drop to 6.0.3 (the last JavaScript-based line, same type system) if it fails.

## Consequences

- The ticket that creates the app replaces the "Checks" paragraph in `CLAUDE.md` with the exact commands.
- The README shows the stack, the dependency rule, and the architecture test as the evidence for R10.
- The whitelist schema has one home, `tools/spec`; the AI layer derives the LLM's response schema from it (D3), so the validator and what the model is asked for cannot drift apart.
- Vitest strips types with its own transformer, so the TypeScript version does not affect tests. Editors may need the native-preview TypeScript extension to use version 7; that does not affect the checks.
