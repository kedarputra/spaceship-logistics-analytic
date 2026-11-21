# 30: To the point: no subtext, one smooth motion system, and a visible "AI is working" state

**What to build:** The pages say less and move better.
- **Fewer words.** Every page today carries descriptive text under its titles: page ledes, card footnotes such as "Every order in the data, including in-transit and canceled orders.", and chart subtitles such as "By order date · 1 Jan–31 Dec 2025 · 400 orders". It goes. The definitions it holds are still one tap away, in an info popover.
- **One motion system.** Every opening, closing and state change moves the same calm, Apple-like way.
- **AI working state.** While the model works on a question, the Ask page shows that it is working. Today it shows the plain text "Working on it…", which looks frozen when the GPU is busy and an answer takes 10–18 s.

Asked by the user on 21 Nov 2026: "no subtext", "every animation like the collapsible, like Apple's", "remove explanations that aren't needed, straight to the point", and "an animation while the AI is still working, so the user knows it's thinking".

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] **No subtext.**
  - Remove page ledes, card footnotes and chart subtitles, and anything else that explains rather than shows.
  - Keep what is data: numbers, a breakdown line such as "27 in transit · 3 canceled", units, axis labels, legends, the small-sample tag and the links ("View the 55 orders").
  - Empty and idle states are one short line or none: on Ask, the idle state is the question chips alone.
  - Keep the anchor date visible once per page ("Data as of 31 Dec 2025"), in the page header. It is what makes "last month" true (trap 1 in `docs/data.md`).
- [ ] **Definitions move into info popovers.**
  - An info button (an "i" in a circle, 24 px hit target, `aria-label="About <title>"`) sits after each card's and chart's title.
  - It opens a small popover in the chart-tip card style (ADR 0011 §3) with the text that was removed: the definition, the date basis ("by delivery date"), the period and n.
  - Opens on hover after 150 ms, on focus, and on tap. Escape, a tap outside, or leaving closes it. It stays inside the viewport at 320 px.
  - The words come from the same place as today; only their placement changes. A test checks that every KPI card's definition is still reachable.
- [ ] **Ask keeps its explanation (R5), shorter.**
  - Always visible under the answer: one row of chips with the filters, the metric, the dimension and the resolved period ("Nov 2025 · by delivery date").
  - "How this was computed" (the spec, the trace and the data table) becomes a collapsible, closed by default.
  - Forecast answers keep a one-line method note ("3-month moving average, lowest error on Oct–Dec 2025"); the longer method text moves into the collapsible.
- [ ] **One motion system**, defined once in `globals.css` as tokens:
  - Easing `--ease-out: cubic-bezier(0.32, 0.72, 0, 1)` (iOS sheets) and `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`.
  - Durations `--dur-1: 160ms` (hover, press), `--dur-2: 280ms` (open and close), `--dur-3: 380ms` (rail, large panels).
  - **Collapsibles:** "How this was computed", "Data table" and the Raw data filter menus. Height animates from 0 to its content (the `grid-template-rows: 0fr → 1fr` technique, or `interpolate-size` with `::details-content` where supported), with the content fading in and rising 4 px. The chevron rotates. Closing runs the same motion in reverse.
  - **Rail collapse:** width with `--ease-out` at `--dur-3`; labels fade out before the width closes and fade in after it opens. No text reflows mid-animation.
  - **Popovers and tooltips:** fade with a scale from 0.96, transform-origin at the trigger.
  - **Press feedback:** buttons and chips scale to 0.97 while pressed.
  - Only `transform`, `opacity` and the collapsible height animate. Nothing animates on first paint, so screenshots and thumbnails show the page at rest.
  - `prefers-reduced-motion: reduce` turns every duration to 0 and drops the shimmer.
- [ ] **AI working state** on Ask, from the moment a question is sent until its answer or error:
  - The answer card shows the question and a working indicator: three dots that pulse in sequence in sage (`#2A8763` on white), the label "Thinking…", and under it a shimmer skeleton shaped like an answer (a sentence line and a chart block).
  - After 3 s the label adds the elapsed seconds ("Thinking… 5 s"). After 15 s it adds "The model is busy; this can take up to a minute."
  - The Ask button shows a spinner and is disabled; the box keeps the question.
  - The rail's AI dot pulses while a question is in flight.
  - The skeleton cross-fades into the answer. No layout jump: the answer card keeps its width.
  - **Honest:** don't show pipeline stages ("Reading", "Computing") the client can't observe. The response isn't streamed.
  - **Accessibility:** `aria-busy` on the answer region; a polite live region announces "Thinking" once and the answer's first sentence when done.
- [ ] **Out of scope.** No page transitions between routes. No change to `src/ai/` (prompts, schema, router), so the eval stays as it is.
- [ ] **Docs.** ADR 0011 gets an amendment (§2 copy, §3 motion tokens). `docs/design/README.md` lists the motion tokens.
- [ ] **Tests and checks.**
  - The golden numbers on every page are unchanged.
  - The loading state renders the indicator and the elapsed label (fake timers).
  - Every collapsible keeps `aria-expanded` in step.
  - Reduced motion sets durations to 0.
  - `npm run check` passes.
  - Headless Edge screenshots at 1280 and 320 px of Overview, Ask (idle, working, answered), Delivery and Forecast. Nothing scrolls sideways.

## Comments
