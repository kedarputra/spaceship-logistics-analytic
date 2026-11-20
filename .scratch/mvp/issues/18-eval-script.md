# 18: Eval script

**What to build:** One command runs the committed eval question list through interpretation and reports how many specs match, so a prompt change that breaks routing shows up immediately (ADR 0009 §12).

**Blocked by:** 10, 14
_10 Ask flow: model client and interpretation · 14 Forecast: scopes and SKU questions_

**Status:** ready-for-agent

**Cuttable:** yes (ADR 0008 cut order: the automation goes; the manual list from ticket 10 stays). If cut, close it with the note "cut (ADR 0008)".

- [ ] `npm run eval` sends every question in the eval list through interpretation and compares normalized specs (arrays sorted, defaults filled in) with the expected specs.
- [ ] It prints the pass rate, the model name, the date, and each miss with expected and actual specs.
- [ ] It needs the gateway, so it runs on the server and is not part of CI or `npm run check`.
