# 16: Query history

**What to build:** A user sees their last 20 questions and can re-run any of them instantly, without calling the LLM (B1, ADR 0008 §1).

**Blocked by:** 10
_10 Ask flow: model client and interpretation_

**Status:** done

**Cuttable:** yes (ADR 0008 cut order). If cut, close it with the note "cut (ADR 0008)".

- [ ] The last 20 questions in `localStorage`, each with its validated spec and the time it was asked; nothing about history is sent to the server.
- [ ] Every storage read and write is wrapped in try/catch; with storage blocked the app works and simply shows no history.
- [ ] Re-running an entry sends its spec to `/api/run`.
- [ ] A "Clear history" button, and a "cached" marker on answers the server cache served.

## Comments

- 2026-11-20: Query history (B1): the last 20 questions in this browser's localStorage (src/components/history.ts), each with its validated spec and the time it was asked, newest first, a repeat moved to the top; questions with no spec are not kept; unreadable entries are dropped; every read and write is wrapped, so blocked storage means no history. Recent questions listed under the examples with Clear history; a re-run sends the saved spec to /api/run without the model, and a saved spec the server rejects is removed with a message. A Cached marker on answers the server cache served. Verified by unit tests with fake storage, static renders, npm run check, and the built app in headless Edge (history after reload, cached repeat, re-run with no gateway call, clear, a stale entry removed, blocked storage).
