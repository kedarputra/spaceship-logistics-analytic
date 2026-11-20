# 03: Dashboard KPI cards

**What to build:** The dashboard shows the five KPI cards R1 asks for, computed by one definitions module with the definitions in ADR 0001, each with its breakdown, its numerator and denominator where it is a rate, and a one-line definition. The query tool reuses the same module later, so the dashboard and answers can never disagree.

**Blocked by:** 01
_01 App skeleton, data loading and health check_

**Status:** done

- [ ] One definitions module in the domain layer computes every KPI; the page only displays its results.
- [ ] Total orders: 400, with "27 in transit · 3 canceled".
- [ ] Delivered orders: 370, with "304 on time · 55 delayed · 11 exception".
- [ ] Delayed orders: 55.
- [ ] On-time delivery rate: "82.2% · 304 / 370".
- [ ] Average delivery time: "3.8 days".
- [ ] Each card shows its one-line definition (glossary wording).
- [ ] Display precision as in ADR 0001 (1 decimal); tests assert full precision (82.16%, 3.83 days) against the "Reading B" golden numbers in `docs/data.md`.
- [ ] Every division guards against a zero denominator.

## Comments

- 2026-11-20: One definitions module, src/domain/definitions.ts, computes the five R1 KPIs with the ADR 0001 Reading B definitions; every division goes through ratio(), which returns null on a zero denominator and keeps numerator and denominator. src/domain/format.ts formats to 1 decimal (n/a when undefined); src/components/kpi-cards.tsx only displays; each card shows its glossary definition. Verified: Vitest asserts the golden numbers at full precision (400 with 27 in transit and 3 canceled; 370 = 304 on time + 55 delayed + 11 exception; 55 delayed; 304 / 370 = 82.16%; 3.83 days), the exact card text (82.2% · 304 / 370, 3.8 days), n/a for an empty dataset, and whole-day delivery time across a clock change; npm run check passes; next start served the cards, checked in headless Edge at 1280, 1024 and 390 px.
