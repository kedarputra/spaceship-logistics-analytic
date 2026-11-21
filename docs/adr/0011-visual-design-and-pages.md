# 0011: Visual design: a dark rail, five pages, and three brand colours

Status: accepted
Date: 2026-11-20

## Context

The first version used Tailwind's defaults: slate text, blue charts, one long page. On 20 Nov the user asked for a redesign built from three colours, `#AFD0BF` (sage), `#808F87` (grey-green) and `#F4B266` (amber). They pointed to a logistics dashboard they know as the layout reference: a dark navigation rail, white panels on a warm ground, and small radii.

The design was drawn on a canvas and exported to `docs/design/` (see its README). Every figure in it was taken from the live app on 20 Nov 2026.

## Decision

1. **Tokens.**
   - Colours, radii and type are defined once as CSS variables in `src/app/globals.css` (Tailwind `@theme`), with the values in `docs/design/README.md`.
   - Components use the tokens; raw hex values live only in `globals.css` and `src/components/palette.ts`.
2. **Where the brand colours go.** The three brand colours are for surfaces, never body text:
   - sage for tints, question chips and icon squares;
   - grey-green for icons (3.4:1 on white);
   - amber for the primary action, the active menu item and the forecast band. Ink text sits on amber at 9:1.
3. **Chart marks** are deeper steps of the brand colours, checked with the dataviz validator:
   - **Colours:** on time and any single series `#2A8763`; delayed and delay rates `#E39A2E`; exception `#B4533A`.
   - **The check:** lightness inside the band, chroma ≥ 0.10, colour-blind separation ΔE ≥ 13, and normal-vision ΔE ≥ 20.
   - **Small samples:** `#F6D3A1` with a 1 px `#E39A2E` ring and a "small sample" tag, so identity is never colour alone.
   - **Forecast:** a dashed `#C27A16` line with the amber band at 30%.
   - **Labels:** amber marks are under 3:1 on white, so charts keep value labels and data tables.
4. **Type.** Figtree, loaded with `next/font/google`, which self-hosts the files at build time so no visitor's browser calls Google. Numbers use tabular figures.
5. **Pages.**
   - **Shell:** a dark rail holds five routes: Overview `/`, Ask `/ask`, Delivery `/delivery`, Carriers `/carriers` and Forecast `/forecast`.
   - **Active item:** an amber bar and an amber tint.
   - **Rail footer:** the data source, and the AI status from `/api/health?ai=1`.
   - **Narrow screens:** the rail stacks above the content.

   *Amended 21 Nov 2026 (ticket 28):* six routes. The sixth, Raw data `/data`, is the file's 400 orders as a read-only table with filters, a sort, pages of 50, a summary of the rows shown and a CSV download (`/api/orders.csv`); the rail's data file name links to it. Its filters are the query spec's (`filtersSchema`, ADR 0006) and pick rows with the query tool's own `matchesFilters`, so a view and an answer with the same filters count the same orders. The summary comes from `dashboardKpis`, as §6 requires. Every view is a URL, such as `/data?status=delayed&carrier=FedEx`.
6. **No new arithmetic.** Every figure on every page comes from `domain/definitions` and the tools, as before. Pages add views, never new computation paths. A figure that needs a new metric adds it to `definitions.ts`, with a test.
7. **Name.** The app stays "Logistics Analytics", with no logo or branding of the company the assessment is for.

## Consequences

- Four new routes and a shell. Overview becomes a summary that links to the detail pages.
  _Amended 21 Nov 2026 (ticket 28): a fifth new route, Raw data `/data`, so six pages in all (§5). The title keeps the decision's original name._
- The design files in `docs/design/` are references, not code. They need the design canvas's runtime to render, so read them as markup, styles and example data. Their numbers double as golden values for tests.
- The README's screenshots (if any) and the Loom are recorded after the redesign.
- Ticket 24 ships the tokens, the shell, Overview and Ask. Ticket 25 adds Delivery, Carriers and Forecast and can be cut if time runs out; the rail then lists only the pages that exist.
