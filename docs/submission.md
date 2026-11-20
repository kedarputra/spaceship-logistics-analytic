# Submission

## Timeline (WIB)

| When | What |
|---|---|
| Fri 20 Nov | Repo, knowledge base, and Sandcastle set up. Decide D1–D9 and record the ADRs. Run `/to-tickets`. |
| Sat 21 Nov | Build: data and KPI module, dashboard, query spec and query tool, natural-language flow with the explanation panel. |
| Sun 22 Nov | Forecast tool, tests, deploy to a paid host, test the deployed app from another device. |
| Mon 23 Nov, morning | README final, Loom recorded, submission email sent. **Target.** |
| Tue 24 Nov, 16:30 | **Hard deadline.** Nothing after this. |

## Checklist before sending

- [ ] Deployed URL works in a private window on another device, with no login or with the test account.
- [ ] Hosting is pay-as-you-go (not a free trial) and will stay up through the review.
- [ ] Every example question in R3 and R9 works on the deployed app.
- [ ] The README covers every R12 item and has the AI usage section (R14).
- [ ] No secrets in the repository or its git history.
- [ ] Reviewers can open the repository: public, or access granted to the addresses in Spaceship's email.
- [ ] The Loom is set to "anyone with the link can view".
- [ ] Reply-all to Spaceship's email: repository link, deployed URL, credentials if any, Loom link.

## Loom script (about 5 minutes)

| Time | Show |
|---|---|
| 0:00–0:30 | Who you are, the problem, and the stack in one sentence. |
| 0:30–1:30 | Dashboard: the five KPIs with their definitions, and the charts. Mention the anchor date. |
| 1:30–3:00 | The three R3 questions live. Open the explanation panel on one: resolved dates, filters, spec, data table. |
| 3:00–4:00 | A forecast: history plus forecast chart, the inventory recommendation, how the method was chosen, and what happens when you ask about a single SKU. |
| 4:00–5:00 | Architecture: the AI routes, code computes, nothing the LLM writes is executed. How accuracy is ensured (one definition module, tests with golden numbers, validation). Key trade-offs, and what you would build next. |

Tips: record at 1080p, keep the browser zoom readable, rehearse once with the questions already typed, and never show API keys or the hosting dashboard's secrets.

## Time log

The brief expects 6 to 10 hours. Recording the time keeps the README's AI usage section honest and shows how the effort was split. Record one row per working block:

| Date | Start–end (WIB) | Who | What | Notes |
|---|---|---|---|---|
| 2026-11-20 | | Kedar | Planning and decisions D1–D9 | |
| | | AI agent (Sandcastle) | Ticket NN | Reviewed by Kedar? |

At the end, total the hours spent by Kedar (planning, reviewing, testing, recording) separately from agent run time.

## AI usage paragraph for the README (draft, adjust to what actually happened)

> This project was built with AI assistance, disclosed here as the brief asks. I made the product and architecture decisions (see `docs/adr/`), wrote the requirements and data definitions, and reviewed every change. Claude Code agents, run through Sandcastle, implemented tickets test-first; each ticket was reviewed by a second agent and by me before it was merged. At runtime the app calls Claude only to turn a question into a structured query spec and to phrase the result; all numbers come from deterministic code.
