# Runbook

How the deployed app runs and comes back after a reboot. Decisions behind it: ADR 0009 (LLM) and ADR 0010 (hosting). Operator-only steps, such as remote access to the server, are in a private runbook that is not part of this repository.

## What runs where

| Piece | How it runs | Starts |
|---|---|---|
| App (`next start`, `127.0.0.1:4800`) | Windows service `spaceship` (WinSW, LocalService), on a pinned portable Node 24 | At boot, no logon needed |
| Cloudflare Tunnel (`wms.nalabs.ai`) | Windows service | At boot |
| LLM gateway (`127.0.0.1:4000`, never public) | Scheduled task | At logon; auto-logon covers reboots |
| Deploy watchdog | Scheduled task, every 2 minutes | After logon |

## After a reboot or power cut

1. The machine powers on after AC loss.
2. The app and tunnel services start at boot: the dashboard works, and the ask box says "AI unavailable".
3. Auto-logon signs the server account in and locks the screen at once. That starts the logon tasks, including the gateway and the watchdog, and the ask box works again.
4. Check from outside: `https://wms.nalabs.ai/api/health?ai=1` reports the AI as up.

If step 3 did not happen, the operator follows the remote-recovery steps in the private runbook.

## Review window

From submission until Spaceship confirms the review is over. If there is no word two weeks after submission, ask the recruiter before ending it.

**On (at submission):**
- [ ] Pause Windows Update for the whole window.
- [ ] Keep the gateway's active chat model at `gemma12` (Gemma 4 12B); do not switch models.
- [ ] Keep heavy GPU work off the server, and hold long-running jobs. Other internal workloads' long generations (some allow 16,000 tokens) can hold all three GPU slots, and reviewers then get "busy, try again shortly".
- [ ] Confirm UptimeRobot alerts reach the phone app and email.

**Off (after Spaceship confirms, or the recruiter agrees):**
- [ ] Resume Windows Update.
- [ ] Release the model freeze and the GPU restrictions.

## Deploys and rollbacks

The watchdog deploys each new commit on `main` and rolls back on its own when the health check fails; a failed commit is recorded in `.buruk` and not retried. The commands for status, a forced restart, and a manual rollback are added by the watchdog ticket.
