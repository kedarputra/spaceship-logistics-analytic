# 12: Answer sentence with number guard

**What to build:** Every answer opens with one or two plain sentences written by the LLM from the computed result, and code guarantees the sentence contains no number that computation did not produce (ADR 0009 §4). When the guard rejects a sentence, a code template says the same thing.

**Blocked by:** 10
_10 Ask flow: model client and interpretation_

**Status:** ready-for-agent

- [ ] The phrase call uses temperature 0.2 and receives the question, a summary of the resolved spec, the definitions, the small-sample case, and a facts block: result values, n, numerators and denominators, the n ≥ 20 threshold, resolved period labels (days and years), and the horizon, each formatted as shown in the UI.
- [ ] The guard accepts a sentence only if every number in it appears in the facts block exactly as formatted; number words and multipliers ("three", "twice", "half") fail.
- [ ] Code templates exist for every kind of result (single value, ranking, time series, small-sample cases, forecast, unsupported) and are used when the guard fails or the phrase call fails.
- [ ] Tests: "1–30 Nov 2025" and "at least 20 deliveries" pass; an invented number fails; "three" fails; "twice" fails.
- [ ] The sentence is cached with the spec, rendered as escaped text, and the dashboard and answer still work when the phrase call fails.
- [ ] Found in ticket 11 with the real model: for "Which carrier has the highest delay rate?" it sends `limit: 1`, so the result holds only GLS (2/8, small sample) and nothing can name USPS. ADR 0001 requires that "if the top group is a small sample, the answer also names the top group with n ≥ 20". When the rows a limit keeps are all small samples, the result also carries the first group with n ≥ 20, and the sentence and its template name it: "GLS 25.0% (2 of 8) on only 8 deliveries; among carriers with at least 20, USPS 23.4% (11 of 47)".
- [ ] Found in ticket 11: "Which destination city gets the most orders?" gives `limit: 1` and shows Boston, MA (15), but Leeds, UK also has 15. A limit that cuts through a tie keeps every tied group, and the sentence names them all.
