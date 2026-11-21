# 20: Run the eval on the server

**What to build:** The README states how well interpretation works against the real model, measured on the server (ADR 0009 §12).

**Blocked by:** 11, 19
_11 Gateway smoke check · 19 README completion_

**Status:** done

- [x] If ticket 18 is done, run `npm run eval` on the server; otherwise work through the committed eval list by hand.
- [x] The README states the pass rate, the date, and the model, and briefly notes the misses.
- [x] Any miss that points to a bug gets its own ticket; prompt changes are re-evaluated before the review window starts.

## Comments

- 2026-11-20: `npm run eval` on the server against the real gateway, at commit 0a6a8ef (prompts-7). Result: 30 of 30 specs match (100%), the same in two runs back to back, 12 s each. The gateway reports the model as `chat`; behind that alias it is gemma12 (Gemma 4 12B instruct, Q5_K_M), in json_schema mode. There were no misses, so no bug tickets. The README paragraph under "AI approach" holds the result. Still open: run it again after any prompt change and right before the review window (ticket 21), then close this ticket.
- 2026-11-20 (later): After ticket 24 added four suggested questions, I ran it again at commit 1f845a9. Result: 34 of 34 (100%), the same in two runs back to back, 15 s each, with no misses. The README is updated.
- 2026-11-21: After ticket 25 added two more suggested questions (the FedEx share and the CRAYON-0008 forecast), I ran it again at commit bcda9e7. Result: 36 of 36 (100%), the same in two runs back to back, 16 s each, with no misses. The README is updated.
- 2026-11-21 (final): The last run before the review window, at commit 7fd3d3a (ticket 26 live). No prompt, router or eval file changed since bcda9e7. Result: 36 of 36 (100%), the same in two runs back to back, 14 s each, with no misses. The README's result stands. Closed. If a prompt changes before the review, run it again.
- 2026-11-22: Ticket 35 changed the AI cache key (it now includes the dataset) and passed the dataset through the Ask path, but did not change any prompt, the schema or the router. I ran the eval at commit 19d948c: 36 of 36 (100%), no misses. The README's result stands.
