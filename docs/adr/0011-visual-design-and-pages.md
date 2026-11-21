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

   *Amended 21 Nov 2026 (ticket 30): copy.* The pages say only what they show.
   - **No subtext.** No sentence under a page title, card title or chart title, and no definition at a card's foot. What stays is data: figures, breakdown lines such as "27 in transit · 3 canceled", units, axes, legends, the small-sample tag and the links. Caveats that belong to one result stay with it: the January caveat (ADR 0003 §5), a rough forecast, an assumption read into a question (ADR 0006 §8), a status filter deciding Raw data's rates.
   - **The data's date** is in every page header once, "Data as of 31 Dec 2025": it is what makes "last month" true (ADR 0002).
   - **Info popovers.** The words that left, such as a card's definition or a chart's date basis, period and n, are one hover, focus or tap away. An "i" button after the title (a 24 px target, `aria-label="About <title>"`) opens them in the chart tooltip's card. It opens 150 ms into a hover, on focus and on a tap. A second tap, Escape, a tap outside or leaving closes it, and it stays inside the window. The words also describe the button, so a screen reader hears them on focus. R5's "filters and time range" for a dashboard chart are therefore one tap away; an Ask answer still shows them at all times.
   - **Cards with a link** (§5, ticket 29) are no longer wrapped in it. The line at the foot is the link, stretched over the card, so the card is still one link and one tab stop, and the info button inside it stays a button.
   - **Ask** (R5). Under every answer, one row of chips names the metric, the dimension, the filters, and the resolved period with its date field ("Nov 2025 · by delivery date"). The answer's table stays on the card, as ADR 0006 §6 asks. "How this was computed" (the interpretation, the definition, the spec, the trace and the result to 2 decimals) is a collapsible, closed by default. A forecast keeps a one-line method note ("3-month moving average, lowest error on Oct–Dec 2025") and its month table; its method in full is in the collapsible. Before the first question the suggested questions are all there is; what the app won't answer is in the info popover of "Try these".
3. **Chart marks** are deeper steps of the brand colours, checked with the dataviz validator:
   - **Colours:** on time and any single series `#2A8763`; delayed and delay rates `#E39A2E`; exception `#B4533A`.
   - **The check:** lightness inside the band, chroma ≥ 0.10, colour-blind separation ΔE ≥ 13, and normal-vision ΔE ≥ 20.
   - **Small samples:** `#F6D3A1` with a 1 px `#E39A2E` ring and a "small sample" tag, so identity is never colour alone.
   - **Forecast:** a dashed `#C27A16` line with the amber band at 30%.
   - **Labels:** amber marks are under 3:1 on white, so charts keep value labels and data tables.

   *Amended 21 Nov 2026 (ticket 26):* every chart has the same tooltip, a small panel card: the full month (or group), then one row per series with the value in bold ink before the series name, keyed by a short stroke of its colour. The Recharts charts draw it as their tooltip content. On the three hand-drawn month charts:
   - **Input:** the plot is one tab stop. A month is the full height and width of its slot, so the pointer always picks the nearest month. The arrows move from month to month and Escape hides the tooltip. On touch, a first tap shows a month and a second opens it.
   - **Opening a month:** a click or Enter opens its orders in Raw data, by order date for orders per month, and by delivery date and delivered only for the two delivery charts. A month's count comes from a metric (the delivered orders per month from the query tool), never from summing the outcomes.
   - **What it shows:** only values the Data table already holds. It replaces the marks' native `title` text.

   *Amended 21 Nov 2026 (ticket 30): motion.* One motion system, defined once as tokens in `globals.css` (values in `docs/design/README.md`): the easing `--ease-out` (the iOS sheet curve) and `--ease-in-out`, and three durations, `--dur-1` for hover and press, `--dur-2` for opening and closing, `--dur-3` for the rail and large panels. They are every transition's default.
   - **Collapsibles** ("Data table", "How this was computed", the Raw data filter menus): the height runs from 0 to the content as a grid row while the content fades in and rises 4 px, and the chevron turns. Closing runs the same motion back. The button's `aria-expanded` and the region's state come from one value; closed, the region is inert.
   - **The rail:** the words fade out, then the width closes; the width opens, then the words fade in. Icons keep their place and words their width, so nothing moves sideways and no text wraps anew. Collapsed, the product mark gives way to the toggle.
   - **Popovers and tooltips** fade in with a scale from 0.96, growing from their trigger. Buttons and chips give way to 0.97 while pressed.
   - **Only** transform, opacity and a collapsible's height move. Nothing moves on first paint. `prefers-reduced-motion: reduce` sets every duration to 0 and drops the shimmer.
   - **The AI working state.** From the moment a question is sent until its reply, the Ask page shows the question with three dots pulsing in turn, "Thinking…" (with the seconds from 3 s, and "The model is busy; this can take up to a minute." from 15 s), and a shimmering skeleton shaped like an answer. The Ask button spins and is disabled, and the rail's AI dot pulses. A follow-up chip or a history re-run never reaches the model, so its card says "Computing…", without seconds, and the AI dot stays still. The skeleton cross-fades into the reply in place, so the card keeps its width. The reply is not streamed, so no pipeline stage is claimed. The answer region is `aria-busy`, and a polite live region says "Thinking" once, then the reply's first sentence.
4. **Type.** Figtree, loaded with `next/font/google`, which self-hosts the files at build time so no visitor's browser calls Google. Numbers use tabular figures.
5. **Pages.**
   - **Shell:** a dark rail holds five routes: Overview `/`, Ask `/ask`, Delivery `/delivery`, Carriers `/carriers` and Forecast `/forecast`.
   - **Active item:** an amber bar and an amber tint.
   - **Rail footer:** the data source, and the AI status from `/api/health?ai=1`.
   - **Narrow screens:** the rail stacks above the content.

   *Amended 21 Nov 2026 (ticket 28):* six routes. The sixth, Raw data `/data`, is the file's 400 orders as a read-only table with filters, a sort, pages of 50, a summary of the rows shown and a CSV download (`/api/orders.csv`); the rail's data file name links to it. Its filters are the query spec's (`filtersSchema`, ADR 0006) and pick rows with the query tool's own `matchesFilters`, so a view and an answer with the same filters count the same orders. The summary comes from `dashboardKpis`, as §6 requires. Every view is a URL, such as `/data?status=delayed&carrier=FedEx`.

   *Amended 21 Nov 2026 (ticket 29):* cards, bars and table rows open what explains them.
   - **Counts** open their orders in Raw data, filtered by the statuses `METRIC_STATUSES` in `definitions.ts` gives each metric, so the view shows the card's number. A rate or an average with no orders of its own opens the page that breaks it down: the Overview's on-time rate and average delivery time open Delivery.
   - **Rates on the detail pages** follow the ticket's table: a delay rate opens its delayed orders (the numerator), the highest on-time rate its delivered orders.
   - **An Ask answer** opens every order it was computed over: for a rate or an average, the delivered orders it divides by, and its link says "delivered orders". The link appears only when every part of the spec is a Raw data filter: no origin, destination, client or SKU filter, no limit or minimum of deliveries, and a period of whole months. A forecast answer opens the Forecast page with its scope, a SKU question its category.
   - **Shape:** a whole card is one link and one tab stop, named by what it opens ("Delayed orders: view the 55 orders"), with a line at its foot that says so. A bar's or row's name is its link and the row its hit target. A card that holds a button is not wrapped in a link.

   *Amended 21 Nov 2026 (ticket 26):* a count of 0 opens nothing. A card, bar, row or chart month with no orders behind it gets no link, arrow or "View" line, so no link leads to an empty table (DPD's 0 delayed orders on Carriers).

   *Amended 21 Nov 2026 (ticket 31):* sign-in and roles (ADR 0012).
   - **The rail** lists only the pages the role can open. A seventh, Users `/users`, is for admins: the accounts and their roles, read-only.
   - **The rail's footer** ends with the username, a role chip and "Sign out". Collapsed, their icons stay in place, with the words as tooltips.
   - **`/login`** stands alone on the ground, without the rail: a card with the product's mark and name, Username, Password and "Sign in". A refusal rises in under the fields, as new content does (§3).
   - **The 403 page** is a card in place of the page: "Your role, Viewer, can't open Ask the data.", with Overview and "Sign in as someone else".
   - **Links to Ask** (the Overview's ask box, the chips on Carriers and Forecast) and Raw data's "Download CSV" show only to roles that can use them.

6. **No new arithmetic.** Every figure on every page comes from `domain/definitions` and the tools, as before. Pages add views, never new computation paths. A figure that needs a new metric adds it to `definitions.ts`, with a test.
7. **Name.** The app stays "Logistics Analytics", with no logo or branding of the company the assessment is for.

## Consequences

- Four new routes and a shell. Overview becomes a summary that links to the detail pages.
  _Amended 21 Nov 2026 (ticket 28): a fifth new route, Raw data `/data`, so six pages in all (§5). The title keeps the decision's original name._
- The design files in `docs/design/` are references, not code. They need the design canvas's runtime to render, so read them as markup, styles and example data. Their numbers double as golden values for tests.
- The README's screenshots (if any) and the Loom are recorded after the redesign.
- Ticket 24 ships the tokens, the shell, Overview and Ask. Ticket 25 adds Delivery, Carriers and Forecast and can be cut if time runs out; the rail then lists only the pages that exist.
