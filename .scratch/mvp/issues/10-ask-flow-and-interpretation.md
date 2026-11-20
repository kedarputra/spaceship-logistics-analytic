# 10: Ask flow: model client and interpretation

**What to build:** A user types a question in plain language; the app asks our LLM to turn it into a structured spec, validates it, runs it through the query tool, and shows the answer from ticket 09 (R3, R7, R10). Unsupported and ambiguous questions get honest answers with suggestions (B6). Built and tested against a fake gateway, because the cloud cannot reach the real one.

**Blocked by:** 09
_09 Answer view, explanation panel and follow-up chips_

**Status:** done

- [ ] Model client as in ADR 0009 §1, §2, §5, §9: plain `fetch`, the three `LLM_*` variables, key read from the key file, 15 s timeout per call, no transport retries, at most 2 calls in flight with a 10 s wait for a slot, the error mapping, and "AI not configured" when the variable or file is missing.
- [ ] Interpretation as in ADR 0009 §3 and §10: temperature 0; one structured output, a union tagged by `tool` (`query` | `forecast` | `unsupported`) with `z.enum` tags; its JSON Schema derived from the tools-layer schema with `z.toJSONSchema`; response mode configurable between `json_schema` and `json_object` (default `json_object` until ticket 11); one retry with the validation error; then an honest error with example questions.
- [ ] Forecast specs (scope and horizon, ADR 0003) validate as part of the union; until the forecast tool exists they get an honest "not available yet".
- [ ] Unsupported and ambiguous questions as in ADR 0006 §8: stated defaults with alternative chips, and 3 examples picked from a fixed list in code.
- [ ] `POST /api/ask` with the 300-character cap and the in-memory cache of ADR 0009 §6.
- [ ] The example chips now ask their questions through `/api/ask`.
- [ ] Tests use a fake gateway; no test calls a real LLM.
- [ ] `npm run smoke:llm` checks whether the gateway enforces `json_schema` (with a schema the model would not follow unprompted) and prints the verdict; it reads the same variables.
- [ ] A committed eval question list: about 20 questions (the R3 and R9 questions verbatim, paraphrases, unsupported and ambiguous questions, a "status = delivered" question, a short city name, a forecast, a SKU) with expected normalized specs, usable by hand even without ticket 18.

## Comments

- 2026-11-20: Ask flow: a question box and the three R3 example chips post to /api/ask. src/ai: config (LLM_BASE_URL, LLM_MODEL, LLM_API_KEY_FILE, optional LLM_RESPONSE_MODE; key read from the file; not configured when missing), a fetch client (15 s timeout, no retries, at most 2 calls in flight, busy after 10 s waiting, 429 busy, 401/403 not configured, 5xx/refused/timeout unavailable), the prompt (schema from z.toJSONSchema of tools/spec, allowed values, metric definitions, 12 worked examples that paraphrase R3, no anchor date), interpretation at temperature 0 with one retry carrying the validation error and then an honest error with examples, and an LRU question cache keyed by the normalized question, model and prompt version. tools/spec: the interpretation union (query, forecast with scope and horizon, unsupported with a reason and 3 example ids from a fixed list), z.enum tags only; an optional assumption field (best, performance, late) so the answer states the default and offers alternative chips only then. Forecasts answer not available yet. npm run smoke:llm prints whether the gateway enforces json_schema. eval/questions.json holds 22 questions with expected specs. Verified: Vitest with a fake model and fake fetch (client, interpreter, schema, eval list, /api/ask handler; no real LLM); npm run check passes; the built app against a local fake gateway, driven in headless Edge: 3 for last month with the default stated, 4 for December, off-topic and failed questions with example chips, forecast not available, the fedx typo fixed on the retry (FedEx 89), a repeated question served from the cache, a 301-character question refused. smoke:llm against the fake printed NOT enforced. Ticket 11 (the real gateway) is next, on the server.
