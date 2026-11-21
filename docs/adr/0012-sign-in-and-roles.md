# 0012: Sign-in with three roles: accounts in a file, sessions in a signed cookie

Status: accepted
Date: 2026-11-21
Supersedes: ADR 0007 §3 (no login) and the "no login" part of ADR 0010 §1

## Context

ADR 0007 §3 and ADR 0010 §1 chose no login, so reviewers would need no credentials. On 21 Nov 2026 the user asked for a login and role-based access. R11 allows a login if the submission gives test credentials, so the email to Spaceship carries one test account per role (ticket 31).

The constraints:

- **No new npm dependency.** `node:crypto` has scrypt and HMAC.
- **No database** (ADR 0005), and nothing writes to `data/`.
- **One server instance** (ADR 0010 §5), so in-memory limits are reliable.
- **Secrets in files outside the repo,** as the LLM key is (ADR 0009). The service definition holds paths, never values.
- **The monitors** read `/api/health` without credentials (ADR 0010 §6).

## Decision

1. **Three roles in one matrix.** `src/auth/roles.ts` holds the matrix and `can(role, action)`, and it is the single source for pages, API routes and the rail. A later ticket adds its action there instead of writing a check of its own.

   | Action | Viewer | Analyst | Admin |
   |---|---|---|---|
   | `dashboards`: Overview, Delivery, Carriers, Forecast, Raw data, and the pages tickets 32–34 add | yes | yes | yes |
   | `ask`: `/ask`, `/api/ask`, `/api/run` | no | yes | yes |
   | `download`: `/api/orders.csv`, and the report files of ticket 34 | no | yes | yes |
   | `import`: importing data (ticket 35) | no | no | yes |
   | `users`: `/users`, a read-only list of accounts and their roles | no | no | yes |

2. **Accounts live in a JSON file** at the path in `AUTH_USERS_FILE`: a list of `{ username, role, passwordHash }`.
   - **Hashes:** scrypt with a random 16-byte salt and a 32-byte key, stored with the parameters as `scrypt$N$r$p$<salt>$<key>`. The parameters are N = 2^15, r = 8, p = 3, one of OWASP's scrypt settings: about 150 ms and 32 MiB per hash on the server.
   - **`npm run users`:**
     - `add <username> <role>` asks for the password twice without echo, or takes `--generate` and prints a generated one once.
     - `list` never shows a hash.
     - `remove <username>` deletes the account.
     - The CLI rewrites the file in place, so the service account's read grant on it stays.
   - **Reloading:** the app reads the file again when its modification time or size changes, so a removed account or a changed role applies on the next request.
   - **A broken file** (bad JSON, an unknown role, a name twice) refuses everyone until it is fixed. A file caught half-written is read again on the next request.

3. **Sessions are a signed cookie,** with no store on the server.
   - **The cookie:** `session`, HttpOnly, Secure, SameSite=Lax, for the whole site, for 8 hours.
   - **What it holds:** the username, the role and the expiry, as base64url JSON, signed with HMAC-SHA256.
   - **The key:** 32 random bytes or more, base64. On the server it is in the file `AUTH_SECRET_FILE` names; `AUTH_SECRET` holds it directly, for local runs and CI.
   - **Setting both** is refused, so a stale value never wins unnoticed.
   - **A missing or short key** fails closed. `/login` says "Sign-in isn't configured on this server", pages redirect there, API routes answer 503, and only the public paths open. A missing or broken users file does the same.

4. **Two checks on every request.**
   - **The proxy** (`src/proxy.ts`) keeps the per-IP limits on `/api/*` first, unchanged. It then checks the session's signature and expiry on every page and API route, except the public ones: `/login`, `/api/login`, `/api/logout`, `/api/health`, and Next's static files and fonts. Without a valid session, a page redirects to `/login?next=<path>` and an API route answers 401 JSON.
   - **`requireRole(action)`** (`src/auth/access.ts`) checks the session again, finds the account in the users file, and asks the matrix with the role the file gives now, not the role in the cookie. Pages are exported through `withRole` and routes through `withApiRole` (`src/app/auth.tsx`).
     - **Without the right role,** a page shows the 403 page ("Your role, Viewer, can't open Ask the data.", with links to Overview and "Sign in as someone else") and an API route answers 403 JSON.
     - **An account removed since sign-in** goes to `/login`, or gets 401.
   - **The page views** live beside each `page.tsx` (for example `ask/ask-page.tsx`), because Next allows a page file only its own exports. `page.tsx` names the action and the view.

5. **Signing in.** `/login` shows the product name, Username, Password and "Sign in", and nothing else.
   - **A refusal** says "Wrong username or password." for an unknown username and a wrong password alike. An unknown username still runs one scrypt hash, against a hash that matches nothing, so the time taken doesn't tell them apart.
   - **`next`** is followed only when it is a relative path on this site; anything else, and `/login` itself, goes to `/`.
   - **Limits:** 5 tries a minute per IP, and 10 wrong passwords an hour per username, then 429 with `Retry-After` and the wait in seconds in the message. A try is counted before its password is checked, so tries sent at once cannot slip past the limit. A right password is then taken back from the username's count, so reviewers sharing a test account never lock each other out.
   - **Already signed in,** `/login` goes straight on to `next`. To sign in as someone else, you sign out first: the 403 page's link does both and comes back to the page.

6. **Signing out** is a POST to `/api/logout`: it clears the cookie and returns to `/login`. It is public, so an expired session can still sign out.

7. **State-changing routes check where a request came from.** Sign-in, sign-out and, later, import need `Sec-Fetch-Site: same-origin`, which current browsers send and a page on another site cannot forge. It does not depend on `Host`, so the tunnel cannot break it. Without that header (an older browser), the `Origin` must name the host the request was sent to: `X-Forwarded-Host` when the tunnel sets it, else `Host`, as Next's own check for server actions does.

8. **In the app.**
   - **The rail's footer** shows the username, a role chip and "Sign out".
   - **The rail** lists only the pages the role can open; Users is the seventh, for admins.
   - **Links to Ask** (the Overview's ask box, the chips on Carriers and Forecast) and Raw data's "Download CSV" show only to roles that can use them.

9. **Monitoring is unchanged** where it reads `/api/health`, which stays public. `scripts/check-uptime.mts` replaces its dashboard check with two: `/` redirects to `/login`, and `/login` renders its form. A server whose sign-in isn't configured fails the second check.

## Consequences

- **Reviewers need credentials.** The submission email lists one test account per role (`docs/submission.md`). The README says the accounts are there and never holds a password.
- **Shared test accounts can be locked by guessing.** Ten wrong passwords for one username in an hour lock it for the rest of that hour, whoever sends them. A right password is never counted, so normal use cannot lock it.
- **A session outlives a password change.** With no session store, removing and re-adding an account with a new password leaves its old cookies valid until they expire. Changing the secret signs everyone out at once.
- **The 403 page is drawn in place with HTTP status 200.** Next's `forbidden()` needs the experimental `authInterrupts` flag, so it is not used. API routes answer a real 403.
- **Deploying it needs provisioning first.** Before the commit that adds sign-in goes live, the server needs the secret file, the users file with the three test accounts, LocalService read access on both, and the two variables in the service definition. Otherwise nobody can sign in. `docs/runbook.md` has the steps.
- **A new layer:** `src/auth/` imports nothing else from `src/`, and only `app/` and `components/` import it, so the data, the tools and the AI never know who is asking (ADR 0004, amended).
