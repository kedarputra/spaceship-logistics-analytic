# 25: Redesign: the Delivery, Carriers and Forecast pages

**What to build:** Three detail pages in the ADR 0011 shell, built from `docs/design/Delivery.dc.html`, `docs/design/Carriers.dc.html` and `docs/design/Forecast.dc.html`. Every figure comes from the existing metrics and the forecast tool. This ticket can be cut if time runs out: the rail then lists only the pages that exist.

**Blocked by:** 24
_24 Redesign: tokens, the rail, Overview and Ask_

**Status:** ready-for-agent

- [ ] **Delivery (`/delivery`).**
  - Five KPIs: delivered, on-time rate, delay rate, exceptions with their share of delivered, and average delivery time.
  - Delivery outcomes per month.
  - On-time rate per month as a line:
    - the axis may start at 60%;
    - the year's 82.2% is a dashed reference line;
    - months under 20 deliveries get hollow points and the note under the chart.
  - Average delivery time by region and by warehouse: bars, slowest first, with n and the on-time rate under each name.
- [ ] **Carriers (`/carriers`).**
  - Three highlights: most orders; the highest on-time rate with n ≥ 20; the highest delay rate with n ≥ 20.
  - The delay rate chart with its "Reading this chart" note.
  - The table of 9 carriers: orders, share, delivered, on-time rate, delay rate, exceptions, average delivery time, and a totals row. Sorted by delay rate, with small-sample rows marked.
  - Ask chips that open `/ask?q=…`.
- [ ] **Forecast (`/forecast`).**
  - Controls: scope (all products, or one category, warehouse or region, with a value picker) and horizon (1, 3 or 6 months). They run the forecast tool directly, with no model call. A choice is kept in the URL.
  - The total card: plan, breakdown, monthly table with the 95% range, chart, and the January caveat.
  - The method table: every candidate's MAE and WAPE, with the chosen one marked.
  - The plan arithmetic, with z and σ read from the forecast result, never as literals.
  - The scope grid for all 22 scopes at 3 months. Each carries the "rough" tag where WAPE is over 50% before rounding, and UK carries its LON-FC1 note.
  - The SKU note.
- [ ] **Rail.** It gains Delivery, Carriers and Forecast. On Overview, the carrier card links to `/carriers` and the forecast card to `/forecast`.
- [ ] **No new arithmetic.** A figure that needs a metric the app lacks adds it to `domain/definitions.ts` with a test (ADR 0011 §6).
- [ ] **Polish found on the live site after ticket 24 (20 Nov 2026):**
  - **Model name in the rail.** The footer reads "chat on this server": it shows the gateway's model alias. It should read "Gemma 4 12B on this server". Use a display name kept in config (default "Gemma 4 12B", with an optional env override), never the alias.
  - **Bar value labels.** On Orders per month the labels on the highest and lowest bars (75, 18) are light grey. Make them ink, weight 700, as in the design.
  - **Delayed card.** On the Delayed KPI card "55 / 370" breaks across two lines. Keep "55 / 370" together.
- [ ] **Tests.**
  - They use the golden numbers in `docs/design/README.md`: the region and warehouse times, the full carrier table, and the 22 scope forecasts including CRAYON 55, BOOK 53, and UK equal to LON-FC1 at 40.
  - `npm run check` passes.
  - Look at all three pages in headless Edge at 1280 px and at the narrowest width.
