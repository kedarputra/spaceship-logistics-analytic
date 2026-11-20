# 11: Gateway smoke check

**What to build:** On the server, confirm the ask flow works against the real gateway and settle whether it enforces `json_schema` (ADR 0009 §13). Done in a local session on the server, because only the server can reach the gateway.

**Blocked by:** 02, 10
_02 Gateway client `spaceship` and key file · 10 Ask flow: model client and interpretation_

**Status:** ready-for-human

- [ ] `npm run smoke:llm` run on the server with `.env.local`; the verdict is recorded in this ticket's comments.
- [ ] The default response mode is set to `json_schema` if the gateway enforces it, otherwise kept at `json_object`, and committed.
- [ ] The three R3 questions asked through the local app return the golden numbers (3; 10 over 14 weeks; GLS flagged, USPS named).
