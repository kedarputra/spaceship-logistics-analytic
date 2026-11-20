# 03: Dashboard KPI cards

**What to build:** The dashboard shows the five KPI cards R1 asks for, computed by one definitions module with the definitions in ADR 0001, each with its breakdown, its numerator and denominator where it is a rate, and a one-line definition. The query tool reuses the same module later, so the dashboard and answers can never disagree.

**Blocked by:** 01
_01 App skeleton, data loading and health check_

**Status:** ready-for-agent

- [ ] One definitions module in the domain layer computes every KPI; the page only displays its results.
- [ ] Total orders: 400, with "27 in transit · 3 canceled".
- [ ] Delivered orders: 370, with "304 on time · 55 delayed · 11 exception".
- [ ] Delayed orders: 55.
- [ ] On-time delivery rate: "82.2% · 304 / 370".
- [ ] Average delivery time: "3.8 days".
- [ ] Each card shows its one-line definition (glossary wording).
- [ ] Display precision as in ADR 0001 (1 decimal); tests assert full precision (82.16%, 3.83 days) against the "Reading B" golden numbers in `docs/data.md`.
- [ ] Every division guards against a zero denominator.
