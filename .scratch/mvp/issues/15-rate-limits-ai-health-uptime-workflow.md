# 15: Rate limits, AI health and uptime workflow

**What to build:** The public app protects its LLM and GPU from abuse, reports whether the AI is up, and a daily check catches problems before a reviewer does (ADR 0009 §11, ADR 0010 §5–6). Never cut.

**Blocked by:** 10
_10 Ask flow: model client and interpretation_

**Status:** ready-for-agent

- [ ] An in-memory per-IP limiter keyed on `CF-Connecting-IP`; requests without it share the key `local`; 20 per minute on `/api/ask` and 120 per minute on `/api/*`; over the limit a 429 that the UI shows as "Too many questions in a minute, try again shortly".
- [ ] Tests for the limiter: window, key, both limits, and the missing-header case.
- [ ] `GET /api/health?ai=1` runs a 1-token completion that bypasses the question cache, remembered for 60 s, and reports whether the AI is up and the model name the gateway answers with.
- [ ] A scheduled GitHub Actions workflow (daily and on demand) checks `/api/health` for `"rows":400`, `/api/health?ai=1` for AI up, and that the dashboard page loads, on `https://wms.nalabs.ai`; it needs no secrets, and a failure notifies the repository owner.
