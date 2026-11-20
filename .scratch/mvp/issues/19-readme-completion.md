# 19: README completion

**What to build:** A reviewer reading the README understands how to run the app, how it works, how questions are interpreted and routed, what is assumed and unsupported, and how AI was used, as R12 and R14 require.

**Blocked by:** 12, 14, 15
_12 Answer sentence with number guard · 14 Forecast: scopes and SKU questions · 15 Rate limits, AI health and uptime workflow_

**Status:** ready-for-agent

- [ ] Every section of the README skeleton filled: setup with the environment variables, architecture and data flow, AI approach (question → spec → tool → computation → guarded sentence; why the AI never produces a number), data definitions and the anchor date.
- [ ] Supported questions and what is out of scope (ADR 0006 consequences), assumptions and limitations (ADRs 0001, 0003, 0010), future improvements (a database, rolling-origin evaluation, free-text follow-ups, Docker if not shipped).
- [ ] The AI usage section (R14) is true: how the project was built with AI assistance, and that the app calls Gemma 4 12B-it (Q5_K_M) through our own gateway at temperature 0 for interpretation, with no third-party AI provider.
- [ ] The deployment section keeps the hosting sentence from ADR 0010 word for word.
- [ ] A placeholder for the eval pass rate, filled in by ticket 20. Ticket 20 already wrote the result paragraph under "AI approach" (30 of 30, 20 Nov 2026, Gemma 4 12B); keep its figures as they are.
- [ ] No operator-only detail about the server.
