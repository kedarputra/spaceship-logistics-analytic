# 0009: LLM layer: our self-hosted gateway, one structured output, answers checked by code

Status: accepted
Date: 2026-11-20
Resolves: D3 in docs/decisions-open.md

## Context

The hard rules: the AI routes and explains but never produces a number, and nothing the LLM writes is executed. Claude and then Gemini were considered and dropped (20 Nov) in favour of the LLM already running on the home server: no third-party AI provider sees reviewers' questions, and there is no per-token bill.

The gateway, checked on 20 Nov:
- An OpenAI-compatible Python (uvicorn) gateway on `127.0.0.1:4000`, in front of llama-swap and llama.cpp (build b10809). Each client has its own key, a model allowlist, an `rpm`, and a `max_concurrency`. It does not log request bodies (`log_bodies: false`).
- The model name `chat` resolves to whichever model `config/chat-models/ACTIVE` names: now `gemma12`, Gemma 4 12B-it at Q5_K_M, dense, fully on the GPU, thinking off by default. Its default temperature is 1.0, and requests can override it. 131–150 tokens/s on a single stream.
- 3 parallel slots, shared with other internal workloads, some of which allow 16,000-token outputs.
- Only the server can reach it: a cloud session cannot, and CI must not.

## Decision

1. **Gateway and configuration.** A gateway client `spaceship` with `models: ["chat"]`, `rpm: 120`, `max_concurrency: 2` (one slot stays free for other clients). Three environment variables: `LLM_BASE_URL` (default `http://127.0.0.1:4000/v1`), `LLM_MODEL` (default `chat`), and `LLM_API_KEY_FILE` (no default). The key lives in `C:\ProgramData\spaceship\llm-api-key.txt`, readable only by the server account and LocalService, and is never committed. A missing variable or unreadable file means "AI not configured"; the dashboard still works.
2. **Client.** Plain `fetch` to `/chat/completions` with typed request and response, a 15 s `AbortSignal` timeout per call, no transport retries, and no SDK.
3. **Interpret** (question → spec), temperature 0. One structured output: a union tagged by `tool` (`query` | `forecast` | `unsupported`), with tags written as `z.enum([...])`, and its JSON Schema derived from `tools/spec` with `z.toJSONSchema`. It is sent as `response_format: json_schema` if the gateway enforces that; otherwise as `json_object` with the schema in the prompt. Either way Zod validates the output. Invalid output (including truncated JSON) gets one retry with the validation error added; after that, an honest error with example questions.
4. **Phrase** (result → one or two sentences), temperature 0.2. The phrase call gets a facts block, and a **number guard** checks the sentence against it: every number in the sentence must appear in the facts block exactly as formatted there. The facts block holds the result values, n, numerators and denominators, the n ≥ 20 threshold, the resolved period labels (days and years), and the forecast horizon. Numbers must be written as digits; number words and multipliers ("three", "twice", "half") count as a guard failure. On failure, a code template replaces the sentence. A question therefore costs at most 3 LLM calls: interpret, one retry, phrase.

   *Amended 20 Nov 2026 (tickets 12 and 22):* the number guard checks numbers, not meaning, and the live check showed sentences that passed it and were still wrong or cut off. A model sentence is now kept only if it is also complete (the reply was not cut off by the token limit, `finish_reason` "length", and it ends like a sentence), names every group the result requires (all tied leaders; for a small-sample top, also the top group with at least 20), describes the leaders of a ranking cut by a limit the right way round (no "slowest" for the rows a limit kept as the fastest), and never calls a count a share, rate or percentage. The facts block also states the ranking's order, the metric over the whole period, and, for a series over time, the extremes code chose; the phrase call asks for a series' overall figure and extremes, not every bucket (§10).

   *Amended 20 Nov 2026 (ticket 23):* when the first group is a small sample, a model sentence must also give the first group with at least 20 and its value exactly as formatted, and the facts and the phrase prompt name the first group by the ranking's direction ("Lowest"), never "Top". For a ranking cut by a limit, "top" joins the words that contradict a lowest-first ranking and "bottom" those that contradict a highest-first one. Points tied at a series' extreme are named three at most and counted beyond that, and a series sentence naming more than 6 points falls back to the template. A forecast sentence must write a SKU as the data does (CRAYON-0008, not the question's crayon-0008) and, for months asked about inside the reach, give their own demand as a whole number beside their name (the template and the prompt put it first). Both SKU casings in one sentence fail.
5. **Concurrency.** At most 2 LLM calls in flight from the app. A call that waits more than 10 s for a free slot gets "busy, try again shortly".
6. **Cache (B2).** An in-memory LRU on the single server instance, shared by all users and cleared on restart. Key: the normalized question (trimmed, lowercased, spaces collapsed, trailing punctuation dropped), the model name, and a prompt version. Value: the validated spec and the guarded sentence. Results are recomputed, not cached.

   *Amended 22 Nov 2026 (ticket 35):* the key also holds the dataset's ID, a SHA-256 of its content, so a session on an import (ADR 0013) never gets a sentence written for the file's numbers, or the reverse. The model's reply is validated against the session's dataset; the prompts and the schema are unchanged.
7. **Entry points.** `POST /api/ask {question}` and `POST /api/run {spec}`. `/api/run` validates with the same schema and never calls the LLM; follow-up chips and history re-runs use it. Free-text follow-ups ("and for UPS?") are not supported: every typed question stands alone.
8. **Input limits.** Questions up to 300 characters; `/api/run` bodies up to 16 KB. Both are rejected with a clear message before any LLM call.
9. **Error mapping.** Gateway 429 → "busy, try again shortly". 401 or 403 → "AI not configured", logged. Timeout, connection refused, or 5xx → "AI unavailable right now" (for example, the gateway is not up yet after a reboot; recovery is in ADR 0010 and the operator's private runbook). A phrase failure falls back to the template; the dashboard always works.
10. **Prompts.** Interpret gets the JSON schema, the allowed dimension values, one-line metric definitions, and about 8 example question → spec pairs that paraphrase (never copy) the R3 questions and include unsupported ones. It does not get the anchor date: periods are symbolic (ADR 0002). Phrase gets the question, a summary of the resolved spec, the facts block, the definitions, and the small-sample case (ADR 0001).
11. **AI health.** `GET /api/health?ai=1` runs a 1-token completion that bypasses the question cache, remembered for 60 s so it costs at most one GPU call a minute, and reports the model name the gateway answers with.

   *Amended 20 Nov 2026 (ticket 15):* a busy gateway (a 429, or no free slot within 10 s) counts as up and busy, since it answered: other workloads can hold every slot (ADR 0010 §8), and the daily check must not raise a false alarm for that. Down (not configured, unavailable) answers 503, so a check that reads only the status fails.
12. **Eval.** `npm run eval` runs about 20 questions through interpret: the R3 and R9 questions verbatim, paraphrases, unsupported and ambiguous questions, a "status = delivered" question, and a short city name. It compares normalized specs (arrays sorted, defaults filled in) with expected specs, so harmless differences are not misses. It runs on the server, because it needs the gateway; CI tests never call the LLM. The latest pass rate goes in the README.
13. **First step of the `ai/` ticket:** a smoke call that checks whether the gateway enforces `response_format: json_schema`. If it does not, use `json_object` plus Zod validation.

## Consequences

- The README's AI usage section names the runtime model: Gemma 4 12B-it (Q5_K_M) through our own gateway, temperature 0 for interpretation, no third-party AI provider.
- Because `chat` follows the `ACTIVE` file, the model is frozen at `gemma12` during the review window (ADR 0010); `/api/health?ai=1` shows the model name so a change is visible.
- Other internal workloads' long generations can hold all three GPU slots. The "busy" message is the fallback; the review-window checklist keeps long jobs off (ADR 0010).
- Setting up the gateway client and the key file is a ready-for-human ticket, done in a local session on the server.
