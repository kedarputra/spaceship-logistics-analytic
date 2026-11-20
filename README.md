# Logistics Analytics Dashboard

An AI-powered analytics dashboard for a logistics client, built as Spaceship's AI Engineer technical assessment.

- **Live app:** _added at deployment_
- **Loom walkthrough:** _added at submission_

## Setup

_Local setup steps and the environment variables (see `.env.example`)._

## Deployment

Self-hosted on our own server behind a Cloudflare Tunnel. Questions are answered by our own LLM on our own GPU, with no third-party AI provider, and the gateway stores no request bodies. Monitored with phone alerts.

Details in ADR 0010 (hosting) and ADR 0009 (LLM). There is no login.

| Setting | Value |
|---|---|
| Public URL | `https://wms.nalabs.ai` → Cloudflare Tunnel → `next start` on `127.0.0.1:4800` |
| Process | Windows service `spaceship` (WinSW, LocalService), starts at boot, restarts on crash |
| Deploys | A watchdog checks `main` every 2 minutes, builds each new commit in its own folder (`npm ci`, `npm run check`), switches over, and rolls back if `/api/health` fails |
| Environment variables | `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY_FILE`, and optionally `LLM_RESPONSE_MODE` and `LLM_MODEL_DISPLAY_NAME` (see `.env.example`); the key itself lives in a file outside the repo |
| Rate limit, `/api/ask` | 20 requests per IP per minute, then 429 ("Too many questions in a minute, try again shortly"); the IP is Cloudflare's `CF-Connecting-IP` |
| Rate limit, `/api/*` | 120 requests per IP per minute, then 429 |
| Health check | `GET /api/health` returns `{"rows":400,"anchor":"2025-12-31"}`; `?ai=1` also checks the LLM with a 1-token call, at most once a minute, and answers 503 when it is down |
| Monitoring | UptimeRobot keyword check every 5 minutes with phone alerts; a daily GitHub Actions check (`.github/workflows/uptime.yml`, also runnable by hand) of the health, the AI and the dashboard page |

How the pieces start after a reboot, and the review-window checklist, are in `docs/runbook.md`.

## Architecture

_System overview, key design decisions (see `docs/adr/`), and the data flow from question to chart._

## AI approach

_How a question becomes a validated query spec, how the query tool or the forecast tool is selected, and why the AI never produces a number._

Interpretation is measured with `npm run eval`: it sends the committed questions in `eval/questions.json` through the model and reports how many specs match, with each miss. It needs the LLM gateway, so it runs on the server and never in CI.

Last run on the server, 21 Nov 2026:
- **Result:** 36 of 36 specs match (100%), the same in two runs back to back. No misses. Six of the 36 are the questions the pages suggest as chips; a test keeps every suggested question in the set.
- **Model:** Gemma 4 12B (instruct, Q5_K_M) behind the gateway's `chat` alias, with structured output in `json_schema` mode.
- **How to read it:** the list is small. It grew from failures seen with the real model, reworded so it doesn't copy the prompt's own examples. Treat it as a regression check, not a benchmark.

## Data definitions

_The KPI definitions and the anchor date used for relative periods (see `docs/data.md`)._

## Assumptions and simplifications

## Limitations and unsupported queries

## Future improvements

## AI usage

**At runtime** the app calls Gemma 4 12B-it (Q5_K_M) through our own LLM gateway, on our own GPU, with no third-party AI provider. The model only turns a question into a structured query spec, at temperature 0; the spec is validated against a whitelist and code computes every number shown (ADR 0009).

_How AI was used to build this project (draft in `docs/submission.md`)._
