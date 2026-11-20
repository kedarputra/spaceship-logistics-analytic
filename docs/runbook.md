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

The watchdog deploys each new commit on `main` and rolls back on its own when the health check fails; a failed commit is recorded in `.buruk` and not retried.

It is a scheduled task that runs at logon and every 2 minutes, as the server account with limited rights, through a silent launcher so no window flashes on the server's desktop. Each run fetches `main` into a deploy clone with a read-only deploy key. A new commit is built in its own release folder with `npm ci` and `npm run check` at below-normal priority. Then the `current` junction moves to it, the service restarts, and `/api/health` must report `"rows":400` within 90 seconds. The newest 3 releases are kept. When there is nothing new, the run restarts the service if it is stopped or unhealthy.

Install, or update after changing `watchdog.ps1` or `watchdog-silent.vbs` (no admin needed):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\windows\install-watchdog.ps1
```

The commands below use the scripts' default locations: deploy root `C:\Work\spaceship-deploy`, data root `C:\ProgramData\spaceship`.

### Status

```powershell
Get-Service spaceship                                     # Running
Invoke-RestMethod http://127.0.0.1:4800/api/health        # rows: 400
(Get-Item C:\Work\spaceship-deploy\current).Target        # live release; folders are named by commit
Get-Content C:\ProgramData\spaceship\logs\watchdog.log -Tail 20
Get-ScheduledTaskInfo 'Spaceship Deploy Watchdog'         # last run, its result, next run
Get-Content C:\Work\spaceship-deploy\.buruk               # commits that failed; never retried
```

### Forced restart, or deploy now

```powershell
sc.exe stop spaceship
(Get-Service spaceship).WaitForStatus('Stopped', '00:00:30')
sc.exe start spaceship

Start-ScheduledTask 'Spaceship Deploy Watchdog'           # look for a new commit now instead of waiting
```

### Manual rollback

Only releases still on disk (the newest 3) can be rolled back to. Add the bad commit to `.buruk` first, or the next run deploys it again.

```powershell
$root = 'C:\Work\spaceship-deploy'
Get-ChildItem "$root\releases" | Sort-Object CreationTime  # pick the commit to go back to
Add-Content "$root\.buruk" '<bad commit, 12 characters>'
cmd /c rmdir "$root\current"
cmd /c mklink /J "$root\current" "$root\releases\<good commit>"
sc.exe stop spaceship
(Get-Service spaceship).WaitForStatus('Stopped', '00:00:30')
sc.exe start spaceship
```

To retry a commit that failed for a passing reason, such as a network error during `npm ci`, delete its line from `.buruk`. `Disable-ScheduledTask 'Spaceship Deploy Watchdog'` pauses deploys and the health restarts with them; `Enable-ScheduledTask` resumes both.
