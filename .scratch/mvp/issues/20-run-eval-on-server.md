# 20: Run the eval on the server

**What to build:** The README states how well interpretation works against the real model, measured on the server (ADR 0009 §12).

**Blocked by:** 11, 19
_11 Gateway smoke check · 19 README completion_

**Status:** ready-for-human

- [ ] If ticket 18 is done, run `npm run eval` on the server; otherwise work through the committed eval list by hand.
- [ ] The README states the pass rate, the date, and the model, and briefly notes the misses.
- [ ] Any miss that points to a bug gets its own ticket; prompt changes are re-evaluated before the review window starts.
