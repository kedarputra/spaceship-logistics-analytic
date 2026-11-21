# Runbook

How the deployed app runs, comes back after a reboot, and gets its accounts. Decisions behind it: ADR 0009 (LLM), ADR 0010 (hosting) and ADR 0012 (sign-in). Operator-only steps, such as remote access to the server, are in a private runbook that is not part of this repository.

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
- [ ] Each of the three test accounts signs in on `https://wms.nalabs.ai`, and its password is in the submission email only.

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

## Accounts

Sign-in (ADR 0012) needs two files in the data root, outside the repository. They must exist, and the service must name them, before a release with sign-in goes live; otherwise nobody can sign in.

| File | Holds | Variable in the service definition |
|---|---|---|
| `C:\ProgramData\spaceship\auth-secret.txt` | 32 random bytes, base64: the key that signs sessions | `AUTH_SECRET_FILE` |
| `C:\ProgramData\spaceship\users.json` | The accounts, a JSON list of `{ username, role, passwordHash }` | `AUTH_USERS_FILE` |

### First setup

From an elevated PowerShell, in any checkout of this repository that has the sign-in commit and `npm ci` done (the CLI needs its `node_modules`):

```powershell
$env:Path = $env:Path.Replace('"','')
$data = 'C:\ProgramData\spaceship'

# 1. The secret, written straight to its file: it never shows on screen or in the history.
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); $rng.Dispose()
[IO.File]::WriteAllText("$data\auth-secret.txt", [Convert]::ToBase64String($bytes))

# 2. One test account per role. Each prints its password once: copy it into the submission email draft, nowhere else.
npm run users -- add viewer viewer --generate --file "$data\users.json"
npm run users -- add analyst analyst --generate --file "$data\users.json"
npm run users -- add admin admin --generate --file "$data\users.json"

# 3. LocalService, which runs the app, may read both files.
icacls "$data\auth-secret.txt" /grant '*S-1-5-19:(R)'
icacls "$data\users.json" /grant '*S-1-5-19:(R)'
```

4. **The service definition.** `deploy\windows\install-service.ps1` fills in both variables on an install. For the live service, add these two lines beside `LLM_API_KEY_FILE` in `C:\ProgramData\spaceship\service\spaceship.xml`, then restart it (see "Forced restart" above):

   ```xml
   <env name="AUTH_SECRET_FILE" value="C:\ProgramData\spaceship\auth-secret.txt" />
   <env name="AUTH_USERS_FILE" value="C:\ProgramData\spaceship\users.json" />
   ```

5. **Check it.** `http://127.0.0.1:4800/` redirects to `/login`, `/login` shows Username and Password, and each test account signs in. Then push.

Without `--generate`, `npm run users -- add` asks for the password twice, without echo, so it lands in no history or log. It needs at least 12 characters.

### Later changes

- **Remove an account:** `npm run users -- remove <username> --file "$data\users.json"`. It is signed out on its next request.
- **Change a role or a password:** remove the account, then add it again. A changed role applies on the next request.
- **List the accounts:** `npm run users -- list --file "$data\users.json"`. It shows usernames and roles, never a hash.
- **Sign everyone out:** write a new secret (step 1) and restart the service. A new password alone does not end the old sessions before their 8 hours.

The CLI rewrites `users.json` in place, so LocalService's read grant stays. The app reads the file again whenever it changes; the secret is read once, so a new secret needs a restart.

### When sign-in is broken

If the secret file is missing, unreadable, empty or under 32 bytes, both variables are set, or `users.json` is missing, unreadable or not valid, the app fails closed:

- `/login` says "Sign-in isn't configured on this server." and shows no form.
- Every other page redirects to `/login`, and API routes answer 503.
- The service's error log in `C:\ProgramData\spaceship\logs` has a line `Sign-in is off: <reason>.`, which never holds a secret.

`/api/health` still answers `"rows":400`, so the watchdog keeps such a release live and UptimeRobot stays green. The daily GitHub Actions check fails on "sign-in page renders".
