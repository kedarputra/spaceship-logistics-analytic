# 16: Query history

**What to build:** A user sees their last 20 questions and can re-run any of them instantly, without calling the LLM (B1, ADR 0008 §1).

**Blocked by:** 10
_10 Ask flow: model client and interpretation_

**Status:** ready-for-agent

**Cuttable:** yes (ADR 0008 cut order). If cut, close it with the note "cut (ADR 0008)".

- [ ] The last 20 questions in `localStorage`, each with its validated spec and the time it was asked; nothing about history is sent to the server.
- [ ] Every storage read and write is wrapped in try/catch; with storage blocked the app works and simply shows no history.
- [ ] Re-running an entry sends its spec to `/api/run`.
- [ ] A "Clear history" button, and a "cached" marker on answers the server cache served.
