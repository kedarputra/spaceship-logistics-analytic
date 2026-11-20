# 11: Gateway smoke check

**What to build:** On the server, confirm the ask flow works against the real gateway and settle whether it enforces `json_schema` (ADR 0009 §13). Done in a local session on the server, because only the server can reach the gateway.

**Blocked by:** 02, 10
_02 Gateway client `spaceship` and key file · 10 Ask flow: model client and interpretation_

**Status:** done

- [x] `npm run smoke:llm` run on the server with `.env.local`; the verdict is recorded in this ticket's comments.
- [x] The default response mode is set to `json_schema` if the gateway enforces it, otherwise kept at `json_object`, and committed.
- [ ] The three R3 questions asked through the local app return the golden numbers (3; 10 over 14 weeks; GLS flagged, USPS named).

## Comments

- 2026-11-20: smoke:llm verdict: json_schema is ENFORCED (the reply followed a schema the prompt never mentioned, 2.1 s), so the default is now json_schema. R3 asked on the server in both modes with the same results, 0.3-0.9 s each: late last month = 3 (1-30 Nov 2025, by delivery date); delayed by week = 10 over 14 weeks, non-zero weeks as in docs/data.md; highest delay rate = GLS 2/8 flagged as a small sample, BUT the model sends limit 1, so USPS is not named, against ADR 0001. That item, plus ties cut by a limit (Boston and Leeds both 15), was added to ticket 12. Also correct: FedEx typo, quarter + minDelivered, status breakdown, date range, the ambiguous best, forecast unavailable, off-topic.
