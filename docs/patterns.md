# Lessons from a similar build

These come from an earlier natural-language analytics product built by the same team: a dashboard over transaction data with a "quick answer" mode and a multi-step "deep analysis" mode. They are lessons, not code to copy.

## What worked

- **The LLM writes a spec, not SQL.** A small JSON spec (metric, dimensions, filters, period, chart hint) validated against a whitelist kept every answer checkable and removed injection risk. Unknown fields were rejected, not guessed.
- **One definition module.** The dashboard and the question box used the same KPI functions. When they disagreed earlier, users stopped trusting both.
- **Show the interpretation under every answer.** A collapsible panel with the resolved dates, filters, and spec, plus the data table, let users check answers themselves and made bugs obvious.
- **The summary sentence only sees computed results.** The LLM got the result table and the definitions, never raw data, and was told not to introduce numbers that are not in the result.
- **Same question, same answer.** Answers that changed between runs damaged trust more than any wrong chart. Low randomness, a validated spec, and caching identical questions fixed it.

## What went wrong first

- **Relative dates against the real clock.** "Last month" returned nothing because the data had stopped earlier. Anchor to the data and show the anchor.
- **Multi-step agent loops.** An agent planning several queries in a loop used more time and tokens and sometimes stalled on malformed output. For this assessment, one question maps to one tool call; leave multi-step out.
- **Rendering model text as HTML.** Markdown tables from the model must be escaped before rendering, or the answer box becomes an XSS hole.
- **Rates without n.** A "highest rate" on a handful of rows misled users. Show the count and flag small samples.
- **Long context passed back as a follow-up.** A follow-up that pastes the previous answer back hits input limits. Pass a compact reference (the previous spec) instead.
