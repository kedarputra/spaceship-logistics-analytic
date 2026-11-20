# 18: Eval script

**What to build:** One command runs the committed eval question list through interpretation and reports how many specs match, so a prompt change that breaks routing shows up immediately (ADR 0009 §12).

**Blocked by:** 10, 14
_10 Ask flow: model client and interpretation · 14 Forecast: scopes and SKU questions_

**Status:** done

**Cuttable:** yes (ADR 0008 cut order: the automation goes; the manual list from ticket 10 stays). If cut, close it with the note "cut (ADR 0008)".

- [ ] `npm run eval` sends every question in the eval list through interpretation and compares normalized specs (arrays sorted, defaults filled in) with the expected specs.
- [ ] It prints the pass rate, the model name, the date, and each miss with expected and actual specs.
- [ ] It needs the gateway, so it runs on the server and is not part of CI or `npm run check`.

## Comments

- 2026-11-20: npm run eval (scripts/eval.ts, tsx with .env.local, never in CI or npm run check) sends every question in eval/questions.json through interpretation and compares normalized specs: arrays sorted and repeats dropped, defaults filled in as the tools fill them (period, sort, the date field after a status rewrite, a month's or quarter's year, forecast horizon; targets by their resolved months), unsupported by reason only, SKU case ignored; the assumption counts. It prints the pass rate, the date, the model the gateway reports, and each miss with both specs or the error (validation problems for a reply with no valid spec). Exits 0 all match, 1 misses, 2 could not run. Verified by unit tests of the comparison and of the run and report with a fake interpreter, npm run check, and the command run against a local fake gateway.
