# Submission

## Timeline (WIB)

| When | What |
|---|---|
| Fri 20 Nov | Repo, knowledge base, and Sandcastle set up. Decide D1–D9 and record the ADRs. Run `/to-tickets`. |
| Sat 21 Nov | Build: data and KPI module, dashboard, query spec and query tool, natural-language flow with the explanation panel. |
| Sun 22 Nov | Forecast tool, tests, deploy to the home server (service, watchdog, monitors; ADR 0010), test the deployed app from another device. |
| Mon 23 Nov, morning | README final, Loom recorded, submission email sent. **Target.** |
| Tue 24 Nov, 16:30 | **Hard deadline.** Nothing after this. |

## Checklist before sending

- [ ] Deployed URL works in a private window on another device: `/` goes to the sign-in page, and each of the three test accounts signs in and sees what its role allows (ADR 0012).
- [ ] `GET /api/health` on the deployed URL returns `{"rows":400,"anchor":"2025-12-31"}` (ADR 0005).
- [ ] `GET /api/health?ai=1` reports the AI as up and the model as Gemma 4 12B (`ACTIVE = gemma12`).
- [ ] The `spaceship` Windows service survives a reboot test: after a restart, the dashboard answers without anyone logging in (ADR 0010).
- [ ] Auto-logon with an immediate screen lock is on, and the BIOS powers on after AC loss.
- [ ] The watchdog has deployed at least one commit end to end, and a deliberately failing commit was rolled back and recorded in `.buruk`.
- [ ] Rate limits answer 429 above 20 requests per minute on `/api/ask` and 120 per minute on `/api/*`.
- [ ] The gateway key file is outside the repo and readable only by the server account and LocalService; no key is in the repo or its history.
- [ ] UptimeRobot keyword check (`"rows":400` on `/api/health`, every 5 minutes) is active, and its phone app and email alerts have fired once in a test.
- [ ] The scheduled GitHub Actions uptime workflow has run green at least once against `https://wms.nalabs.ai`.
- [ ] Review window started (`docs/runbook.md`): Windows Update paused, the chat model frozen at `gemma12`, no heavy GPU work, long jobs held back.
- [ ] The README and the email carry the hosting sentence from ADR 0010, word for word.
- [ ] Every example question in R3 and R9 works on the deployed app.
- [ ] The README covers every R12 item and has the AI usage section (R14).
- [ ] No secrets in the repository or its git history.
- [ ] Reviewers can open the repository: public, or access granted to the addresses in Spaceship's email.
- [ ] The Loom is set to "anyone with the link can view".
- [ ] Reply-all to Spaceship's email: repository link, deployed URL, the three test accounts, Loom link (see [The email](#the-email)).

## The email

Reply-all to Spaceship's email with:

- **Repository:** the link.
- **Live app:** `https://wms.nalabs.ai`, with the hosting sentence of ADR 0010 §9.
- **Test accounts,** one per role (ADR 0012). The passwords are made on the server with `npm run users -- add <username> <role> --generate` (`docs/runbook.md`, "Accounts"). They go in the email only, never in this repository.

  | Username | Role | Can |
  |---|---|---|
  | `viewer` | Viewer | the dashboards: Overview, Needs attention, Delivery, Carriers, Inventory, Network, Reports, Forecast, Raw data |
  | `analyst` | Analyst | also Ask the data and the downloads: the orders CSV and the monthly report's PDF and CSV |
  | `admin` | Admin | also the list of accounts and their roles |

  Each line of the email adds the password after the username.
- **Loom:** the link.

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

## AI usage paragraph for the README

Written in ticket 19: the README's "AI usage" section is the final text, so quote it from there. It replaces the draft that stood here, which assumed Sandcastle would build the tickets; they were built in interactive Claude Code sessions instead.
