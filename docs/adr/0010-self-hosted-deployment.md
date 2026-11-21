# 0010: Self-hosted on the home server behind the Cloudflare tunnel, as a Windows service with a release-folder watchdog

Status: accepted
Date: 2026-11-20
Resolves: D8 in docs/decisions-open.md
Supersedes: ADR 0007

## Context

The direction changed on 20 Nov: the app runs on our own home server (Windows 11 Pro) with our own LLM (ADR 0009), not on Vercel. Facts checked on the server that day:

- **Tunnel.** Cloudflared runs as an automatic Windows service with a remote-managed tunnel token. The route `wms.nalabs.ai` → `http://127.0.0.1:4800` exists: the hostname answers with a Cloudflare 502 from the Singapore edge until the app listens.
- **Existing patterns.**
  - Our other services run as WinSW 2.12 services under LocalService, at below-normal priority (the machine is shared with desktop use), restarting after a crash at 10 s / 30 s / 2 min, with logs rolled at 10 MB.
  - Their every-2-minutes watchdogs keep a last-good snapshot and record a failed build in a `.buruk` file so it is not retried.
- **Reboots.** Every scheduled task on the server, including the LLM gateway, starts only after a logon, and auto-logon is off. After a power cut or an update restart, the public hostnames return 502 until someone logs in.
- **Building in place breaks the live site.** `npm ci` deletes `node_modules` and `next build` rewrites `.next`, and a running `next start` reads both.
- **Node.** `node.exe` is a per-user install inside the server account's profile, which LocalService cannot read.
- **PATH.** The session environment can carry a stray double quote in `PATH`, which breaks npm scripts. The machine and user PATH values are clean; the quote is inherited from the launching process.
- **R11.** The recruiter asked for pay-as-you-go hosting rather than a free trial, so the app stays up through the review. Self-hosting answers that concern another way: a service that starts at boot, monitoring with phone alerts, and a review-window checklist.

## Decision

1. **Hosting.** `next start` on `127.0.0.1:4800`, published at `https://wms.nalabs.ai` through the existing named tunnel. No Cloudflare Access and no login, so reviewers get straight in. Only the app is public; the gateway never is.

   _Amended 21 Nov 2026 (ticket 31): the "no login" part is superseded by ADR 0012. The app now has its own sign-in with three roles, and the submission email gives one test account per role. There is still no Cloudflare Access. The service also gets `AUTH_SECRET_FILE` and `AUTH_USERS_FILE` (§3), and LocalService reads both files. `/api/health` stays public for the monitors (§6), and the GitHub Actions check now looks for the redirect to `/login` and the sign-in form instead of the dashboard page._
2. **Node.** A pinned portable Node 24 (the official zip, SHA-256 checked) in `C:\ProgramData\spaceship\node`, with read and execute granted to LocalService. The service and the watchdog's builds both use that `node.exe`. The machine and user PATH are not changed.
3. **Windows service** (WinSW, id `spaceship`), mirroring our other services.
   - **Account and startup:** LocalService; automatic start, delayed; below-normal priority.
   - **On crash:** restart at 10 s / 30 s / 2 min, with the failure count reset after an hour; stop timeout 15 s; logs rolled at 10 MB, 8 kept.
   - **Command:** `C:\ProgramData\spaceship\node\node.exe node_modules\next\dist\bin\next start -H 127.0.0.1 -p 4800`, run in the junction `C:\Work\spaceship-deploy\current`. It calls `node` directly, never through npm.
   - **Environment:** `NODE_ENV=production`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY_FILE`.
   - **LocalService gets:** read and execute on the releases folder and the portable Node; modify on each release's `.next\cache` and on the log folder; read on the key file.
   - **Restart rights:** the install also grants the server account start and stop rights on this one service (`sc sdset`), so the non-admin watchdog can restart it.
   - **After a reboot:** the service starts at boot, so the dashboard works; the ask box says "AI unavailable" until the gateway is up.
4. **Deploy watchdog.** A scheduled task every 2 minutes, running as the server account with limited rights and launched silently through `wscript`, like our other services' watchdogs.
   - **PATH:** its first line strips quotes from PATH (`$env:Path = $env:Path.Replace('"','')`), so anything an npm script calls later in PATH also resolves. It then prepends the portable Node folder to its own process PATH only, so npm scripts resolve `node` to the pinned version.
   - **Fetching:** a dedicated deploy clone, `C:\Work\spaceship-deploy\clone` (never the development checkout), fetches with a read-only deploy key for this repository only, not a personal SSH key.
   - **On a new `main` commit** that is neither live nor listed in `.buruk`:
     1. Check the commit out into `releases\<sha>`.
     2. Run `npm ci` and `npm run check` (typecheck, tests, build) at below-normal priority.
     3. If that succeeds, grant the `.next\cache` access, point the `current` junction at the new folder, restart the service, and check `GET /api/health` for `"rows":400`.
     4. If the check fails, point the junction back, restart, and record the SHA in `.buruk`.
   - **Housekeeping:** keep the last 3 release folders. If no new commit is waiting but the service is down or unhealthy, restart it.
   - The cloud session pushes `main`. CI runs the same checks independently; a commit that fails them on the server never goes live.
5. **Rate limiting.** An in-memory per-IP limiter, reliable because there is one server instance.
   - **Key:** the `CF-Connecting-IP` header, trusted only because the app listens on loopback and cloudflared sets that header. Requests without it are local processes and share the key `local`.
   - **Limits:** `/api/ask` 20 requests per minute; `/api/*` 120 per minute. Over the limit, a 429 that the UI turns into "Too many questions in a minute, try again shortly".
6. **Uptime.**
   - **GitHub Actions:** a scheduled workflow, daily and on demand, checks `/api/health` (`"rows":400`), `/api/health?ai=1` (AI up), and the dashboard page; a failure emails the repository owner.
   - **UptimeRobot:** a 5-minute keyword check for `"rows":400` on `/api/health`, with alerts through its phone app and email. Confirm at signup that the free plan includes keyword checks.
7. **Reboot recovery.** The service starts at boot. Auto-logon for the server account with an immediate screen lock starts the logon tasks, including the gateway. The BIOS powers the machine on after AC loss. The public reboot sequence is in `docs/runbook.md`; the remote-recovery steps are in the operator's private runbook, which is not part of this repository.
8. **Review window.** From submission until Spaceship confirms the review is over. If there is no word two weeks after submission, ask the recruiter before ending it. During the window:
   - Windows Update is paused.
   - The `ACTIVE` chat model stays `gemma12` (ADR 0009).
   - Heavy GPU work stays off the server. Other internal workloads' long generations (some allow 16,000 tokens) can hold all three slots, so long jobs wait until the review is over; the app's "busy" message is the fallback.
9. **How it is presented,** in the README and in one line of the submission email, worded exactly: "Self-hosted on our own server behind a Cloudflare Tunnel. Questions are answered by our own LLM on our own GPU, with no third-party AI provider, and the gateway stores no request bodies. Monitored with phone alerts."
10. **Server-side setup is done by hand**, as ready-for-human tickets in a local session on the server, not by Sandcastle in the cloud:
    - the portable Node and the WinSW service install (admin, once, including the access grants and `sc sdset`);
    - the gateway client `spaceship` and its key file;
    - the deploy clone with its deploy key, and the watchdog task;
    - auto-logon with an immediate screen lock;
    - BIOS power-on after AC loss;
    - pausing Windows Update at the start of the review window;
    - the UptimeRobot monitor.

    The tunnel route already exists.

## Consequences

- There is no hosting bill. Availability depends on home power, the internet line, the PC, and the tunnel; the boot-time service, auto-logon, the BIOS setting, two monitors, and the runbook cover those.
- A push reaches production within a few minutes (2-minute poll, then `npm ci` and the checks). A broken commit never goes live and is not retried.
- Each release folder has its own `node_modules`; keeping 3 bounds the disk use.
- The eval and the gateway smoke call run on the server (ADR 0009).
- ADR 0007's Vercel settings (plan, region, WAF rules, spend budget) no longer apply; the README's deployment section and the deploy checklist describe this setup instead.
