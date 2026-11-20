# 26: Hover details on the hand-drawn charts

**What to build:** A hover layer for the three month charts drawn by hand in tickets 24 and 25, so a reader can point at a month and read its values. They are plain HTML and SVG rendered on the server. Today they carry only native `title` attributes:
- The bars' tooltips appear after about a second, unstyled, and never on touch.
- The on-time line has them only on its 7 px dots, which are hard to hit.

On the live site (21 Nov 2026) hovering looks like it does nothing. The Ask answer chart and the Forecast chart already have recharts tooltips; this brings the hand-drawn charts level with them and gives all five tooltips one look.

The tooltip only adds a quicker way to read a value. Every value it shows is also in the chart's Data table, which stays the full alternative.

**Blocked by:** 25
_25 Redesign: the Delivery, Carriers and Forecast pages_

**Status:** ready-for-agent

- [ ] **One tooltip, shared.** A small client component used by all three charts; the plots themselves stay server-rendered.
  - A small card on the panel surface, with a hairline border and the cards' radius, in the ADR 0011 tokens.
  - The heading is the full month ("Jun 2025").
  - One row per series: the value first, in ink and bold, then the series name in muted text, keyed by a short stroke of the series colour.
  - It follows the pointer, stays inside the chart card, and flips to the pointer's left near the right edge.
- [ ] **Orders per month (Overview).**
  - The whole month column is the hit target: full plot height, and the slot width including the gap, not only the bar.
  - The tooltip reads e.g. "75 orders" (Jan 2025).
  - The hovered bar lifts (an outline or a slight lightening).
- [ ] **Delivery outcomes per month (Overview and Delivery).**
  - The same column hit target.
  - The tooltip lists on time, delayed and exception, in legend order.
  - A delivered total appears only if it comes from a metric (delivered orders per month); it is never summed in the component (ADR 0011 §6).
- [ ] **On-time rate per month (Delivery).**
  - A crosshair: a vertical hairline snaps to the nearest month wherever the pointer is over the plot, and that month's point grows.
  - The tooltip reads the rate and its ratio, e.g. "83.3%" and "15 of 18 delivered on time".
  - Months under 20 deliveries add "small sample".
- [ ] **Keyboard and touch.**
  - Each plot is one tab stop. Left and right arrows move between months and show the same tooltip; Escape or leaving the plot hides it.
  - A tap on a month shows it; a tap outside hides it.
- [ ] **Remove the native `title`s** this replaces, so two tooltips never show at once. Keep the plot's `aria-label` and the Data table.
- [ ] **The recharts tooltips match.** Style the Ask answer chart's and the Forecast chart's tooltips the same way, with a custom content component or contentStyle and itemStyle. The Forecast range reads e.g. "13–177 units".
- [ ] **Out of scope.** The ranked bars (region, warehouse, carriers) already print the value, n and on-time rate beside each bar. They get no hover.
- [ ] **Tests.**
  - They use the golden numbers in `docs/design/README.md`: Jan 75 orders, Sep 18, Jun 15 of 18 and Nov 16 of 19 as small samples. A hovered month's outcome counts equal its Data table row.
  - Arrow keys move the tooltip from month to month.
  - `npm run check` passes.
  - Hover each chart in headless Edge at 1280 px and at 320 px: the tooltip stays inside its card, and nothing scrolls sideways.

## Comments
