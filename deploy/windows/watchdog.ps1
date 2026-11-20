<#
  Deploy watchdog for the Windows service "spaceship" (ADR 0010, section 4).

  install-watchdog.ps1 registers it to run at logon and every 2 minutes, as the server account with
  limited rights, through watchdog-silent.vbs so no console window ever flashes on the shared desktop.

  One run:
    1. Fetch <Branch> into the deploy clone with the read-only deploy key.
    2. If its head is neither live nor listed in .buruk: export it into releases\<sha>, run npm ci and
       npm run check at below-normal priority, grant LocalService modify on .next\cache, point the
       "current" junction at it, restart the service, and require /api/health to answer "rows":400.
       A failed build never goes live; a failed health check switches the junction back. Either way
       the SHA goes into .buruk and is never retried.
    3. With nothing new to deploy, restart the service if it is stopped or unhealthy.
    4. Keep the newest 3 release folders, and never the one that is live.
  Log: <DataRoot>\logs\watchdog.log
#>
param(
    [string]$DeployRoot = 'C:\Work\spaceship-deploy',
    [string]$DataRoot = 'C:\ProgramData\spaceship',
    [string]$RepoUrl = 'git@github.com:kedarputra/spaceship-logistics-analytic.git',
    [string]$Branch = 'main',
    [string]$DeployKey = (Join-Path $env:USERPROFILE '.ssh\spaceship_deploy_ed25519'),
    [string]$ServiceId = 'spaceship',
    [string]$HealthUrl = 'http://127.0.0.1:4800/api/health',
    [int]$KeepReleases = 3
)
$ErrorActionPreference = 'Stop'

# PATH first: strip stray quotes (they break cmd's lookup), then put the pinned Node in front.
$env:Path = (Join-Path $DataRoot 'node') + ';' + $env:Path.Replace('"', '')
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:GIT_SSH_COMMAND = 'ssh -i "' + ($DeployKey -replace '\\', '/') + '" -o IdentitiesOnly=yes -o BatchMode=yes'
$env:GIT_TERMINAL_PROMPT = '0'

$clone = Join-Path $DeployRoot 'clone'
$releases = Join-Path $DeployRoot 'releases'
$current = Join-Path $DeployRoot 'current'
$buruk = Join-Path $DeployRoot '.buruk'
$lock = Join-Path $DeployRoot '.watchdog.lock'
$logDir = Join-Path $DataRoot 'logs'
$log = Join-Path $logDir 'watchdog.log'

function Write-Log([string]$Message) {
    $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message
    Add-Content -LiteralPath $log -Value $line
    Write-Host $line
}

# Runs a command through cmd, so stderr arrives as text instead of PowerShell 5.1 error records,
# and returns its exit code. On failure the last lines of output go to the log.
function Invoke-Cmd([string]$Label, [string]$Command) {
    $out = & cmd.exe /d /c "$Command 2>&1"
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        Write-Log ('{0} failed (exit {1}): {2}' -f $Label, $code, (($out | Select-Object -Last 12) -join ' | '))
    }
    return $code
}

function Test-Health([int]$Seconds) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try { if ((Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5).rows -eq 400) { return $true } } catch { }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Restart-App {
    & sc.exe stop $ServiceId | Out-Null
    try { (Get-Service -Name $ServiceId).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30)) } catch { }
    & sc.exe start $ServiceId | Out-Null
}

function Get-LiveTarget {
    if (-not (Test-Path -LiteralPath $current)) { return $null }
    $target = (Get-Item -LiteralPath $current).Target
    if ($target) { return [string]($target | Select-Object -First 1) }
    return $null
}

function Set-Live([string]$Target) {
    if (Test-Path -LiteralPath $current) { & cmd.exe /d /c "rmdir `"$current`"" | Out-Null }
    & cmd.exe /d /c "mklink /J `"$current`" `"$Target`"" | Out-Null
}

function Remove-Folder([string]$Path) {
    if (Test-Path -LiteralPath $Path) { & cmd.exe /d /c "rmdir /s /q `"$Path`"" | Out-Null }
}

function Invoke-Build([string]$Sha, [string]$Folder) {
    Remove-Folder $Folder
    New-Item -ItemType Directory -Force $Folder | Out-Null
    $tar = "$Folder.tar"
    $ok = (Invoke-Cmd 'git archive' "git -C `"$clone`" archive --format=tar -o `"$tar`" $Sha") -eq 0
    if ($ok) { $ok = (Invoke-Cmd 'extract' "`"$env:SystemRoot\System32\tar.exe`" -xf `"$tar`" -C `"$Folder`"") -eq 0 }
    Remove-Item -LiteralPath $tar -Force -ErrorAction SilentlyContinue
    if (-not $ok) { return $false }
    $self = Get-Process -Id $PID
    $self.PriorityClass = 'BelowNormal'
    Push-Location -LiteralPath $Folder
    try {
        $ok = (Invoke-Cmd 'npm ci' 'npm ci --no-audit --no-fund') -eq 0
        if ($ok) { $ok = (Invoke-Cmd 'npm run check' 'npm run check') -eq 0 }
    } finally {
        Pop-Location
        $self.PriorityClass = 'Normal'
    }
    return $ok
}

function Invoke-Run {
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 5MB) {
        Move-Item -LiteralPath $log -Destination "$log.1" -Force
    }
    if (-not (Test-Path -LiteralPath (Join-Path $clone '.git'))) {
        if ((Invoke-Cmd 'git clone' "git clone --quiet --no-checkout --branch $Branch $RepoUrl `"$clone`"") -ne 0) { return }
    }
    if ((Invoke-Cmd 'git fetch' "git -C `"$clone`" fetch --quiet --prune origin $Branch") -ne 0) { return }

    $sha = [string](& cmd.exe /d /c "git -C `"$clone`" rev-parse --short=12 origin/$Branch 2>&1" | Select-Object -Last 1)
    $sha = $sha.Trim()
    if ($sha -notmatch '^[0-9a-f]{12}$') { Write-Log "Could not resolve origin/$Branch ($sha)."; return }

    $liveTarget = Get-LiveTarget
    $liveSha = if ($liveTarget) { Split-Path -Leaf $liveTarget } else { '' }
    $bad = if (Test-Path -LiteralPath $buruk) { @(Get-Content -LiteralPath $buruk) } else { @() }

    if ($sha -eq $liveSha -or $bad -contains $sha) {
        if (-not (Test-Health 10)) {
            Write-Log "Service stopped or unhealthy on $liveSha; restarting it."
            Restart-App
            if (Test-Health 90) { Write-Log 'Healthy again after the restart.' } else { Write-Log 'Still unhealthy after the restart.' }
        }
        return
    }

    Write-Log "New commit $sha on $Branch (live: $liveSha). Building."
    $folder = Join-Path $releases $sha
    if (-not (Invoke-Build $sha $folder)) {
        Add-Content -LiteralPath $buruk -Value $sha
        Remove-Folder $folder
        Write-Log "Build or checks failed for $sha. Recorded in .buruk; live stays $liveSha."
        return
    }

    $cache = Join-Path $folder '.next\cache'
    New-Item -ItemType Directory -Force $cache | Out-Null
    & icacls.exe $cache /grant '*S-1-5-19:(OI)(CI)M' | Out-Null
    Set-Live $folder
    Restart-App
    if (Test-Health 90) {
        Write-Log "Deployed $sha."
        return
    }

    Add-Content -LiteralPath $buruk -Value $sha
    if ($liveTarget) {
        Set-Live $liveTarget
        Restart-App
        $state = if (Test-Health 90) { 'healthy' } else { 'STILL UNHEALTHY' }
        Write-Log "Health check failed for $sha. Rolled back to $liveSha ($state); $sha recorded in .buruk."
    } else {
        Write-Log "Health check failed for $sha and there is no earlier release to roll back to."
    }
}

function Remove-OldReleases {
    $live = Get-LiveTarget
    Get-ChildItem -LiteralPath $releases -Directory |
        Sort-Object CreationTime -Descending |
        Select-Object -Skip $KeepReleases |
        Where-Object { $_.FullName -ne $live } |
        ForEach-Object { Remove-Folder $_.FullName; Write-Log "Removed old release $($_.Name)." }
}

New-Item -ItemType Directory -Force $DeployRoot, $releases, $logDir | Out-Null
if (Test-Path -LiteralPath $lock) {
    # A build normally takes a few minutes; an older lock belongs to a run that died.
    if (((Get-Date) - (Get-Item -LiteralPath $lock).LastWriteTime).TotalMinutes -lt 45) { exit 0 }
    Remove-Item -LiteralPath $lock -Force
}
Set-Content -LiteralPath $lock -Value $PID
try {
    Invoke-Run
    Remove-OldReleases
} catch {
    Write-Log "Watchdog error: $($_.Exception.Message)"
} finally {
    Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
}
