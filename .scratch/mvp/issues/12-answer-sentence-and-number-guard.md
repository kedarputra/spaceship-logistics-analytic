# 12: Answer sentence with number guard

**What to build:** Every answer opens with one or two plain sentences written by the LLM from the computed result, and code guarantees the sentence contains no number that computation did not produce (ADR 0009 §4). When the guard rejects a sentence, a code template says the same thing.

**Blocked by:** 10
_10 Ask flow: model client and interpretation_

**Status:** done

- [ ] The phrase call uses temperature 0.2 and receives the question, a summary of the resolved spec, the definitions, the small-sample case, and a facts block: result values, n, numerators and denominators, the n ≥ 20 threshold, resolved period labels (days and years), and the horizon, each formatted as shown in the UI.
- [ ] The guard accepts a sentence only if every number in it appears in the facts block exactly as formatted; number words and multipliers ("three", "twice", "half") fail.
- [ ] Code templates exist for every kind of result (single value, ranking, time series, small-sample cases, forecast, unsupported) and are used when the guard fails or the phrase call fails.
- [ ] Tests: "1–30 Nov 2025" and "at least 20 deliveries" pass; an invented number fails; "three" fails; "twice" fails.
- [ ] The sentence is cached with the spec, rendered as escaped text, and the dashboard and answer still work when the phrase call fails.
- [ ] Found in ticket 11 with the real model: for "Which carrier has the highest delay rate?" it sends `limit: 1`, so the result holds only GLS (2/8, small sample) and nothing can name USPS. ADR 0001 requires that "if the top group is a small sample, the answer also names the top group with n ≥ 20". When the rows a limit keeps are all small samples, the result also carries the first group with n ≥ 20, and the sentence and its template name it: "GLS 25.0% (2 of 8) on only 8 deliveries; among carriers with at least 20, USPS 23.4% (11 of 47)".
- [ ] Found in ticket 11: "Which destination city gets the most orders?" gives `limit: 1` and shows Boston, MA (15), but Leeds, UK also has 15. A limit that cuts through a tie keeps every tied group, and the sentence names them all.

## Comments

- 2026-11-20: Every answer opens with one or two sentences. On /api/ask the model writes it at temperature 0.2 from a facts block (src/ai/phrase, prompt in src/ai/prompts) holding the question, the spec in words, the definition, the small-sample case and the result values with n, numerators, denominators, the 20-delivery threshold and the period label, each formatted as the UI shows it (src/tools/sentence factsFor). The number guard (src/ai/guard) keeps it only if every number in it is in the facts exactly as written, with no number words, fractions or multipliers (three, twice, half, doubled, 2x, 8 times, a quarter of); the sentence must also name every group tied at the top and, for a small-sample top, the top group with at least 20. Otherwise, or if the call fails, a code template stands: one per kind (single value, ranking in each small-sample case, ties, time series, delivery outcomes; no data, forecast and unsupported use their messages), and /api/run always uses it. Ticket 11 items: a small-sample top cut by limit 1 names USPS (Highest delay rate: GLS 25.0% (2 of 8) on only 8 deliveries; among carriers with at least 20, USPS 23.4% (11 of 47).), and a limit on a ranking keeps every tied group (Boston, MA and Leeds, UK, 15 each); calendar order is never extended. The sentence is cached with the spec unless it stood in for a failed call, and is rendered as escaped text. Verified: Vitest (guard cases from the ticket and more, every template against its own facts for 14 kinds of result, phrase with a fake model, the handler's caching and fallbacks, the escaped card); npm run check passes; the built app against a local fake gateway in headless Edge kept a guard-passing sentence, replaced an invented 31% and a twice with templates, and reused the cached sentence without a gateway call.
