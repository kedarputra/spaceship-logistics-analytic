# 0007: Hosting on paid Vercel Pro in Singapore, no login, rate limits and a spend budget

Status: superseded by [ADR 0010](0010-self-hosted-deployment.md) (self-hosting on the home server); §3 also by [ADR 0012](0012-sign-in-and-roles.md) (sign-in and roles)
Date: 2026-11-20
Resolves: D8 in docs/decisions-open.md

## Context

R11 asks for a public URL that stays up through the review, and the recruiter asked for pay-as-you-go hosting rather than a free trial. Vercel facts, read from Vercel's docs and terms on 20 Nov 2026:

- **Hobby:** may be used only "for your personal or non-commercial use", and Vercel "may shut down and terminate projects or deployments using the Hobby plan without notice for any reason".
- **Pro:** $20 a month for one developer seat, with $20 of included usage credit; usage beyond that is pay-as-you-go and uncapped.
- **Spend Management (Pro):** a project budget can pause production when it is reached. Visitors then get `503 DEPLOYMENT_PAUSED`, the check runs every few minutes, and resuming is manual.
- **WAF rate limiting** is available on all plans (Pro: 40 rules per project, $0.50 per 1M allowed requests). It counts per IP over windows of 10 s to 10 min. Rate-limit rules are set in the dashboard or the API, not in `vercel.json`.
- **Function region:** defaults to `iad1` (US East); `"regions": ["sin1"]` in `vercel.json` moves functions to Singapore. Reviewers are on WIB.

## Decision

1. **Vercel Pro as a paid subscription with a card from the start**, never through a Pro trial (a trial is the "free trial" the recruiter asked to avoid). Do not downgrade until Spaceship confirms the review is over.
2. **Region `sin1`**, set with `"regions": ["sin1"]` in `vercel.json`.
3. **No login.** No credentials to send; the rate limits and spend caps protect the API key instead.

   _Superseded 21 Nov 2026 by ADR 0012: the user asked for sign-in with roles, and R11 allows a login when the submission gives test credentials._
4. **Two WAF rate-limit rules**, per IP, returning 429:
   - `/api/ask`: 20 requests per 60 s. Several reviewers behind one office IP share the limit, so 10 would be too tight.
   - `/api/*`: 120 requests per 60 s, so abuse of `/api/run` cannot run the spend budget into a pause.

   The UI turns a 429 into "Too many questions in a minute, try again shortly". A daily ceiling across all users belongs on the Gemini side (D3), since WAF windows stop at 10 minutes.
5. **Spend budget:** a $50 project budget with pause on. The 50% and 75% alerts go to an inbox that is checked daily during the review. Normal use stays inside the $20 included credit.
6. **Deploy flow:** GitHub integration; `main` deploys to production; pull requests get preview deployments, which stay behind Vercel's Deployment Protection. `GEMINI_API_KEY` is set for Production and Preview in the Vercel project, never in the repo; `.env.example` lists it, empty. The production URL is the default `<project>.vercel.app`.
7. **Uptime check:** a scheduled GitHub Actions workflow (daily, and on demand) requests `/api/health`, expects `rows: 400`, and loads the dashboard page. A failure emails the repository owner. It needs no secrets.

## Consequences

- The rate-limit rules and the budget live outside the repo, so the README's deployment section and the deploy checklist in `docs/submission.md` record their exact settings, and the checklist confirms they are active.
- A budget pause takes the app down for reviewers until it is resumed by hand. The daily-checked alerts are what stands between abuse and that outcome.
- Hosting costs $20 a month while the review lasts.
