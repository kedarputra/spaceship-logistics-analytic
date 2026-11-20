# 06: Deploy watchdog with read-only deploy key

**What to build:** Every push to `main` reaches `https://wms.nalabs.ai` within a few minutes, and a commit that fails its checks or its health check never stays live and is not retried (ADR 0010 §4). Set up and tested in a local session on the server, not by Sandcastle.

**Blocked by:** 05
_05 Windows service on portable Node, and reboot resilience_

**Status:** done

- [x] A deploy clone separate from the development checkout, fetching with a read-only deploy key for this repository only.
- [x] The watchdog script, its silent launcher, and the task installer are committed (no secrets, no operator-only detail); the scheduled task runs every 2 minutes as the server account with limited rights.
- [x] The watchdog strips quotes from PATH first, then puts the portable Node first in its own process PATH.
- [x] A new `main` commit not live and not listed in `.buruk` is built in its own release folder with `npm ci` and `npm run check` at below-normal priority; on success the `.next\cache` grant is applied, the `current` junction moves, the service restarts, and `/api/health` must return `"rows":400`; otherwise the junction moves back, the service restarts, and the SHA goes into `.buruk`.
- [x] The last 3 release folders are kept; with no new commit, an unhealthy or stopped service is restarted.
- [x] Test: a good commit deploys end to end, and a deliberately failing commit is rolled back, recorded in `.buruk`, and not retried.
- [x] `docs/runbook.md` gains the public-safe commands for status, a forced restart, and a manual rollback.

## Comments

- 2026-11-20: Deploy key added read-only. First real deploy: f58966a live at 16:19:57, 67 s from fetch to healthy; public /api/health 400 rows and the KPI cards render. Isolated tests passed: failing typecheck goes to .buruk and is not retried; failed health check rolls back; good commit deploys.
