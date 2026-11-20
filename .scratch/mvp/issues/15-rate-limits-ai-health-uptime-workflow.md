# 15: Rate limits, AI health and uptime workflow

**What to build:** The public app protects its LLM and GPU from abuse, reports whether the AI is up, and a daily check catches problems before a reviewer does (ADR 0009 §11, ADR 0010 §5–6). Never cut.

**Blocked by:** 10
_10 Ask flow: model client and interpretation_

**Status:** done

- [ ] An in-memory per-IP limiter keyed on `CF-Connecting-IP`; requests without it share the key `local`; 20 per minute on `/api/ask` and 120 per minute on `/api/*`; over the limit a 429 that the UI shows as "Too many questions in a minute, try again shortly".
- [ ] Tests for the limiter: window, key, both limits, and the missing-header case.
- [ ] `GET /api/health?ai=1` runs a 1-token completion that bypasses the question cache, remembered for 60 s, and reports whether the AI is up and the model name the gateway answers with.
- [ ] A scheduled GitHub Actions workflow (daily and on demand) checks `/api/health` for `"rows":400`, `/api/health?ai=1` for AI up, and that the dashboard page loads, on `https://wms.nalabs.ai`; it needs no secrets, and a failure notifies the repository owner.

## Comments

- 2026-11-20: In-memory per-IP rate limits in Next's proxy (src/proxy.ts, src/app/api/rate-limit.ts): key CF-Connecting-IP or 'local', sliding 60 s window, 20/min on /api/ask and 120/min on /api/* (an ask counts against both), 429 with 'Too many questions in a minute, try again shortly.' and Retry-After, shown by the page. GET /api/health?ai=1 runs a 1-token call outside the question cache, remembered for 60 s, reporting up and the model name (busy counts as up), 503 when down. A daily and on-demand GitHub Actions workflow runs scripts/check-uptime.mts against https://wms.nalabs.ai (rows 400, AI up, dashboard renders) with no secrets and opens an issue assigned to the owner on failure. Verified by unit tests at the limiter, proxy and health seams, npm run check, and the built app: 21 asks gave 20 x 200 and a 429, other IPs unaffected, 121 API calls gave one 429, the page showed the message, one gateway call for two health checks, and the script passed with the fake gateway up and failed (exit 1) with it down.
