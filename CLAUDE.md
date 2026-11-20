# Spaceship: AI-powered logistics analytics dashboard

Technical assessment for the AI Engineer role at Spaceship. Build, deploy, and explain a web app over one CSV of logistics orders: a KPI dashboard, natural-language questions answered by computation tools that an AI layer routes to, and demand forecasting.

**Deadline:** Monday 23 Nov 2026 is the target; Tuesday 24 Nov 2026 before 16:30 WIB is the hard limit. Submission steps are in `docs/submission.md`.

## Read first

| File | What it holds |
|---|---|
| `docs/requirements.md` | Every requirement with an ID, the scoring weights, the deliverables |
| `docs/data.md` | Measured facts about the dataset, candidate KPI definitions with their numbers, the traps |
| `GLOSSARY.md` | Domain terms. Use these words in tickets, code, and UI |
| `docs/decisions-open.md` | Decisions still open, each with options and a recommendation. Planning input |
| `docs/adr/` | Decisions made. These win over `decisions-open.md` |
| `docs/patterns.md` | Lessons from a similar natural-language analytics build |
| `docs/submission.md` | Timeline, Loom script, README and hosting checklist, time log |

The original brief from Spaceship sits in `docs/brief/`, which is gitignored. `docs/requirements.md` restates all of it, so a cloud session does not need the originals.

## Hard rules

- **The AI routes and explains; it never produces a number.** Every figure shown comes from computation code.
- **Nothing the LLM writes is executed.** It produces a structured query spec; the spec is validated against a whitelist, then code runs it.
- **The dataset is read-only.** Nothing writes to `data/`.
- **No secrets in the repo.** New environment variables go in `.env.example` and the README.
- **Disclose AI usage.** The brief says undisclosed AI usage may count against the submission. The README has an "AI usage" section; keep it true.
- **Write the code here.** Do not copy code from other repositories, including any employer's code.
- **Keep it simple.** The brief expects 6 to 10 hours and values clarity, correctness, and reasoning over completeness and polish.
- Repo content (code, docs, README, UI) is in English.

## Checks

The ticket that creates the app sets these scripts up and replaces this paragraph with the exact commands. Every commit must pass them. Expected: `npm run typecheck`, `npm run test`, `npm run build`.

## Workflow

1. **Plan.** Resolve the decisions in `docs/decisions-open.md` with `/wayfinder` (or one `/grilling` session if few remain). Record each decision as an ADR in `docs/adr/`.
2. **Tickets.** `/to-tickets` writes `.scratch/<feature>/issues/NN-<slug>.md` with `Status: ready-for-agent`.
3. **Build.** In a Claude Code cloud session: `npm run sandcastle:cloud`. On a PC with Docker: `npm run sandcastle`. Ticket overview: `npm run tickets`. How it works: `.sandcastle/main.mts`.
4. **Submit.** Follow `docs/submission.md`.

## Agent skills

### Issue tracker

Local markdown under `.scratch/`; Sandcastle reads it through `.sandcastle/tracker.mjs`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles; implementation tickets end as `done`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
