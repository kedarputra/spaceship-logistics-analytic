# 24: Redesign: tokens, the rail, Overview and Ask

**What to build:** The app takes the look decided in ADR 0011: the brand tokens, a dark rail, an Overview page that summarises the data, and an Ask page that is the AI workspace. Build it from `docs/design/Overview.dc.html`, `docs/design/Ask.dc.html` and `docs/design/Tokens.dc.html`, using the tokens and parts in `docs/design/README.md`.

**Blocked by:** 16, 17
_16 Query history · 17 Pipeline trace and "why this chart"_

**Status:** ready-for-agent

- [ ] **Tokens.**
  - The colours, radii and focus ring from `docs/design/README.md` are CSS variables in `src/app/globals.css` (Tailwind `@theme`).
  - `src/components/palette.ts` holds the new chart marks: on time `#2A8763`, delayed `#E39A2E`, exception `#B4533A`, small sample `#F6D3A1` with a `#E39A2E` ring, forecast line `#C27A16`, and the band amber at 30%.
  - No raw hex values anywhere else.
- [ ] **Type.** Figtree via `next/font/google`, so the font is self-hosted at build time and no browser request goes to Google. Numbers use tabular figures. The type scale follows the README.
- [ ] **Shell.**
  - A layout with the dark rail and a skip-to-content link.
  - The rail shows the product name, the menu with Overview `/` and Ask `/ask` (ticket 25 adds the other three), and the data block.
  - It also shows a live AI status pill (online, busy or unavailable) from `/api/health?ai=1`, polled at most once a minute.
  - The active item has the amber bar, the amber tint and `aria-current="page"`.
  - On narrow screens the rail stacks above the content.
- [ ] **Overview (`/`).**
  - Page header with the "Data as of 31 Dec 2025" chip and the AI pill.
  - Ask box: the input, the amber Ask button and four example chips; each opens `/ask?q=…`.
  - The five KPI cards: icon square, figure, sub-line, definition below a rule.
  - Orders per month and delivery outcomes per month, in the new marks. Outcome segments have 2 px gaps, and only the highest and lowest order bars carry labels.
  - A carrier card: top 4 by delay rate with the small-sample rule, plus the n ≥ 20 sentence.
  - A forecast card: the plan for the next 3 months, its breakdown, the method chip, and a small history-and-band line.
  - Until ticket 25 adds `/carriers` and `/forecast`, the two cards link to `/ask` with the matching question filled in.
- [ ] **Ask (`/ask`).** Two columns.
  - **Main column:**
    - the form, which asks `?q=` on load and keeps its 300-character limit and rate-limit text;
    - the answer card, with a badge saying who wrote the sentence (model, checked; or the template);
    - "How this was computed", open by default on this page, with ticket 17's stage strip.
  - **Side column:**
    - "Try these", in four groups. The questions are kept in code and every one has been checked against the live model.
    - "Recent questions", the ticket 16 list moved here.
    - "What it won't answer".
- [ ] **Every figure is computed** by `domain/definitions` and the tools, never copied from the design files (ADR 0011 §6). The design's numbers are golden values for the tests.
- [ ] **Accessibility.**
  - Real buttons, links and labels.
  - The 2 px amber focus ring; controls at least 34 px tall.
  - The contrast pairs from the README; `prefers-reduced-motion` respected.
  - Charts keep their data tables, and identity is never colour alone.
- [ ] **Tests.**
  - The Overview figures and the Ask flow keep their current golden numbers, and the architecture test passes.
  - `npm run check` passes.
  - Look at the built app in headless Edge at 1280 px and at the narrowest width, and compare it with the design files.
