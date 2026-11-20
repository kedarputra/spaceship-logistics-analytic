# 0008: Bonus scope: history, cache, tests, ambiguity handling and a pipeline trace; Docker only if time is left

Status: accepted
Date: 2026-11-20
Resolves: D9 in docs/decisions-open.md

## Context

The bonus items are optional (B1–B6) and the brief expects 6 to 10 hours. Several were already settled by earlier decisions: caching and history in D3, tests across ADRs 0001–0006, ambiguity handling in ADR 0006.

## Decision

1. **B1 query history.** The last 20 questions in `localStorage`, each with its validated spec and the time it was asked. Every read and write is wrapped in try/catch, so a private window or blocked storage means no history, not a broken app. A "Clear history" button, and a "cached" marker when the server cache answered. Re-running an entry sends its spec to `POST /api/run`, without the LLM. Nothing about history is sent to the server.
2. **B2 caching.** As decided in D3: an in-memory LRU of the validated spec and the guarded sentence, keyed by the normalized question, the model ID, and a prompt version.
3. **B3 tests.** The tests named in ADRs 0001–0006 (golden numbers, row schema, period buckets, status rewrite table, city matching, architecture test), plus the eval script from D3.
4. **B5 advanced explainability.** Two additions to the explanation panel:
   - **Pipeline trace:** a strip showing the stages of R7's flow (question → interpretation → tool selected → computation → result → phrasing → chart), each with its status and time ("interpret 410 ms, cache hit · compute 2 ms · phrase 350 ms · guard passed"). Retries, template fallbacks, and rewrites show there.
   - **Why this chart:** one sentence, written by code ("time + count → bars").
5. **B6 ambiguous queries.** As decided in ADR 0006.
6. **B4 Docker.** Only once every R1–R15 item and the deployed checks pass. Otherwise the README says Docker is not included and lists it under future improvements.
7. **Cut order if time runs short:** B4 Docker → the pipeline trace → the "why this chart" sentence → B1 history → the eval script's automation (a manual list of eval questions stays).
   **Never cut:** R1–R15, the golden-number and schema tests, the explanation panel, the number guard, the status rewrite table, the rate limits, and the uptime checks.
