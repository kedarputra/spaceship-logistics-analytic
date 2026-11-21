# 31: Sign-in and roles (RBAC)

**What to build:** The app asks who you are, and what you can do depends on your role.

Today anyone with the URL gets straight in. ADR 0007 §3 and ADR 0010 §1 chose "no login" so reviewers wouldn't need credentials. On 21 Nov 2026 the user asked for login and role-based access. R11 allows a login if the submission gives test credentials, so the email to Spaceship will carry one test account per role.

**Blocked by:** 30
_30 To the point: no subtext, one smooth motion system, and a visible "AI is working" state_

**Status:** ready-for-agent

- [ ] **Three roles**, in one matrix in code (`src/auth/roles.ts`, `can(role, action)`), the single source for pages, API routes and the rail:

  | Action | Viewer | Analyst | Admin |
  |---|---|---|---|
  | Dashboards: Overview, Delivery, Carriers, Forecast, Raw data, and the pages tickets 32–34 add | yes | yes | yes |
  | Ask the data (the AI): `/ask`, `/api/ask`, `/api/run` | no | yes | yes |
  | Downloads: `/api/orders.csv` and the report files of ticket 34 | no | yes | yes |
  | Import data (ticket 35) | no | no | yes |
  | Users: a read-only list of accounts and their roles | no | no | yes |

  Later tickets add their actions to this matrix, not their own checks.
- [ ] **Accounts** live in a JSON file outside the repo, at the path in `AUTH_USERS_FILE`. Each entry is `{ username, role, passwordHash }`, with a scrypt hash from `node:crypto`: random 16-byte salt, parameters stored with the hash.
  - `npm run users -- add <username> <role>` asks for the password twice without echo, or takes `--generate` and prints a generated one once.
  - `npm run users -- list` (never shows hashes) and `npm run users -- remove <username>`.
  - The app re-reads the file when its modification time changes, so a removed account or a changed role applies on the next request.
- [ ] **Sessions.**
  - Signing in sets an HttpOnly, Secure, SameSite=Lax cookie `session`. It holds the username, role and an 8-hour expiry, signed with HMAC-SHA256 under `AUTH_SECRET` (32 random bytes or more, base64).
  - `src/proxy.ts` (Next 16's request proxy) checks the signature and expiry on every page and API route, except `/login`, `/api/login`, `/api/health`, static assets and fonts.
  - With no valid session: a page redirects to `/login?next=<path>`, and an API route returns 401 JSON.
  - Server code calls `requireRole(action)`, which re-checks the account in the users file and the matrix. Without the right role, a page shows the 403 page and an API route returns 403 JSON.
  - `AUTH_SECRET` missing or short: the app fails closed. `/login` says "Sign-in isn't configured on this server", and nothing else opens.
- [ ] **The sign-in page.**
  - The product name, Username, Password and "Sign in". Nothing else.
  - A wrong username or password gets the same message, "Wrong username or password.", and an unknown username still runs one scrypt hash against a dummy, so timing doesn't tell them apart.
  - `next` is followed only if it is a relative path on this site; anything else goes to `/`.
  - Limits: 5 tries a minute per IP and 10 an hour per username, then 429 with the wait in seconds.
  - Uses the motion and tokens of ticket 30.
- [ ] **In the app.**
  - The rail's footer shows the username, a role chip and "Sign out" (a POST that clears the cookie and returns to `/login`).
  - The rail lists only the pages the role can open.
  - **403 page:** "Your role, Viewer, can't open Ask the data.", with links to Overview and to "Sign in as someone else".
  - **Ask links:** a link to Ask, such as "Open in Ask" on charts, shows only for roles that can ask.
- [ ] **Security.**
  - State-changing routes (sign-in, sign-out, and later import) check that `Origin` matches the site.
  - No new npm dependency.
  - No password, hash or secret in the repo, in logs or in error messages.
  - The existing per-IP rate limits on `/api/*` stay.
- [ ] **Uptime checks keep working.**
  - `/api/health` and `/api/health?ai=1` stay public, so the UptimeRobot keyword monitor is unchanged.
  - `scripts/check-uptime.mts` replaces its dashboard check with two: `/` redirects to `/login`, and `/login` renders "Sign in".
- [ ] **Do not push.** Commit, then stop and say so in the report. The live server needs `AUTH_SECRET` and the users file before this deploys, or nobody can sign in. Claude on the server sets them up, then pushes.
- [ ] **Docs.**
  - **ADR 0012 (sign-in and roles).** Supersedes ADR 0007 §3 and the "no login" part of ADR 0010 §1, with the reason: the user's request of 21 Nov 2026, and R11 allowing a login with test credentials.
  - **README:** a short "Access and roles" section with the matrix, saying the test accounts are in the submission email; the env table gains `AUTH_SECRET` and `AUTH_USERS_FILE`.
  - **`.env.example`:** both variables.
  - **`docs/runbook.md`:** how to create accounts on the server.
  - **`docs/submission.md`:** the email lists the three test accounts.
  - **GLOSSARY:** Role, Viewer, Analyst, Admin.
- [ ] **Tests.**
  - Sign and verify, including a tampered payload, a wrong key and expiry.
  - The matrix as a table test, route × role → allowed, redirect or 403.
  - The proxy's public list.
  - The open-redirect guard.
  - Both sign-in limits.
  - The users CLI round trip, hash then verify, with a temp file.
  - Same message for an unknown user and a wrong password.
  - `npm run check` passes; the eval needs no change, since it calls the interpreter in-process.

## Comments
