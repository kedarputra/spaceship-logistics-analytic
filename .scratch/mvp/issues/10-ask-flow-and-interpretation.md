# 10: Ask flow: model client and interpretation

**What to build:** A user types a question in plain language; the app asks our LLM to turn it into a structured spec, validates it, runs it through the query tool, and shows the answer from ticket 09 (R3, R7, R10). Unsupported and ambiguous questions get honest answers with suggestions (B6). Built and tested against a fake gateway, because the cloud cannot reach the real one.

**Blocked by:** 09
_09 Answer view, explanation panel and follow-up chips_

**Status:** ready-for-agent

- [ ] Model client as in ADR 0009 §1, §2, §5, §9: plain `fetch`, the three `LLM_*` variables, key read from the key file, 15 s timeout per call, no transport retries, at most 2 calls in flight with a 10 s wait for a slot, the error mapping, and "AI not configured" when the variable or file is missing.
- [ ] Interpretation as in ADR 0009 §3 and §10: temperature 0; one structured output, a union tagged by `tool` (`query` | `forecast` | `unsupported`) with `z.enum` tags; its JSON Schema derived from the tools-layer schema with `z.toJSONSchema`; response mode configurable between `json_schema` and `json_object` (default `json_object` until ticket 11); one retry with the validation error; then an honest error with example questions.
- [ ] Forecast specs (scope and horizon, ADR 0003) validate as part of the union; until the forecast tool exists they get an honest "not available yet".
- [ ] Unsupported and ambiguous questions as in ADR 0006 §8: stated defaults with alternative chips, and 3 examples picked from a fixed list in code.
- [ ] `POST /api/ask` with the 300-character cap and the in-memory cache of ADR 0009 §6.
- [ ] The example chips now ask their questions through `/api/ask`.
- [ ] Tests use a fake gateway; no test calls a real LLM.
- [ ] `npm run smoke:llm` checks whether the gateway enforces `json_schema` (with a schema the model would not follow unprompted) and prints the verdict; it reads the same variables.
- [ ] A committed eval question list: about 20 questions (the R3 and R9 questions verbatim, paraphrases, unsupported and ambiguous questions, a "status = delivered" question, a short city name, a forecast, a SKU) with expected normalized specs, usable by hand even without ticket 18.
