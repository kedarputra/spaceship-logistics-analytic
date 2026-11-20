# 17: Pipeline trace and "why this chart"

**What to build:** The explanation panel shows R7's flow as a strip of stages with status and timing, and one sentence on why this chart was chosen (B5, ADR 0008 §4).

**Blocked by:** 12
_12 Answer sentence with number guard_

**Status:** done

**Cuttable:** yes (ADR 0008 cut order: the trace goes before the chart sentence). If cut, close it with the note "cut (ADR 0008)".

- [ ] Stages question → interpretation → tool selected → computation → result → phrasing → chart, each with status and time ("interpret 410 ms, cache hit · compute 2 ms · phrase 350 ms · guard passed").
- [ ] Retries, template fallbacks, and status rewrites appear in the strip.
- [ ] One sentence, written by code from the chart rules, says why this chart was chosen ("time + count → bars").

## Comments

- 2026-11-20: Done: the explanation panel shows the pipeline trace (question, interpretation, tool selected, computation, result, phrasing, chart) with timings and flags for a retry, a template fallback with its reason, a status rewrite and a rough forecast, and a code-written sentence on why this chart was chosen. The trace names why the model's sentence was dropped, never the model's own numbers.
