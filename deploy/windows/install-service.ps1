<#
  Installs, or reinstalls, the Windows service "spaceship" with WinSW 2.12 (ADR 0010, section 3).

  Run once from an elevated Windows PowerShell on the server, from the repository root:
    powershell -NoProfile -ExecutionPolicy Bypass -File deploy\windows\install-service.ps1

  It checks its prerequisites first and stops with a list if any is missing:
    - the portable Node in <DataRoot>\node
    - a built release behind the <DeployRoot>\current junction
    - the LLM key file in <DataRoot>
    - the sign-in secret and the users file in <DataRoot> (ADR 0012; docs/runbook.md, "Accounts")
  Then it installs the service, grants LocalService the access it needs, gives the server
  account start and stop rights on this one service (so the non-admin watchdog can restart it),
  starts it, and checks /api/health.
#>
param(
    [string]$DeployRoot = 'C:\Work\spaceship-deploy',
    [string]$DataRoot = 'C:\ProgramData\spaceship',
    [string]$ServerAccount = $env:USERNAME,
    [string]$LlmBaseUrl = 'http://127.0.0.1:4000/v1',
    [string]$LlmModel = 'chat',
    # Optional: an existing WinSW-x64.exe to copy instead of downloading. Used only if its SHA-256 matches.
    [string]$WinSWPath = ''
)
$ErrorActionPreference = 'Stop'

# WinSW 2.12.0, the current stable release (github.com/winsw/winsw/releases/tag/v2.12.0).
$WinSWVersion = '2.12.0'
$WinSWSha256 = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'
$ServiceId = 'spaceship'
$LocalService = '*S-1-5-19'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated PowerShell (Run as administrator).'
}

$node = Join-Path $DataRoot 'node\node.exe'
$keyFile = Join-Path $DataRoot 'llm-api-key.txt'
$secretFile = Join-Path $DataRoot 'auth-secret.txt'
$usersFile = Join-Path $DataRoot 'users.json'
$binDir = Join-Path $DataRoot 'service'
$logDir = Join-Path $DataRoot 'logs'
$releases = Join-Path $DeployRoot 'releases'
$current = Join-Path $DeployRoot 'current'
$template = Join-Path $PSScriptRoot 'spaceship.xml'
$wrapper = Join-Path $binDir "$ServiceId.exe"

$missing = @()
if (-not (Test-Path -LiteralPath $node)) { $missing += "portable Node: $node" }
if (-not (Test-Path -LiteralPath (Join-Path $current '.next\BUILD_ID'))) { $missing += "a built release behind $current (no .next\BUILD_ID)" }
if (-not (Test-Path -LiteralPath $keyFile)) { $missing += "LLM key file: $keyFile" }
if (-not (Test-Path -LiteralPath $secretFile)) { $missing += "sign-in secret file: $secretFile" }
if (-not (Test-Path -LiteralPath $usersFile)) { $missing += "users file (npm run users -- add ...): $usersFile" }
if (-not (Test-Path -LiteralPath $template)) { $missing += "service template: $template" }
if ($missing) { throw ("Not installing. Missing:`n  " + ($missing -join "`n  ")) }

function Test-WinSWHash([string]$Path) {
    (Test-Path -LiteralPath $Path) -and ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -eq $WinSWSha256)
}

# WinSW applies the account, start mode and failure actions only at install, so remove any old copy first.
$existing = Get-Service -Name $ServiceId -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -ne 'Stopped') {
        Stop-Service -Name $ServiceId -Force
        (Get-Service -Name $ServiceId).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
    }
    & sc.exe delete $ServiceId | Out-Null
    for ($i = 0; $i -lt 30 -and (Get-Service -Name $ServiceId -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Seconds 1 }
    Write-Output 'Removed the previous service registration.'
}

New-Item -ItemType Directory -Force $binDir, $logDir | Out-Null
if (-not (Test-WinSWHash $wrapper)) {
    if ($WinSWPath -and (Test-WinSWHash $WinSWPath)) {
        Copy-Item -LiteralPath $WinSWPath -Destination $wrapper -Force
    } else {
        $download = Join-Path $env:TEMP "WinSW-x64-$WinSWVersion.exe"
        Invoke-WebRequest -UseBasicParsing "https://github.com/winsw/winsw/releases/download/v$WinSWVersion/WinSW-x64.exe" -OutFile $download
        if (-not (Test-WinSWHash $download)) {
            Remove-Item -LiteralPath $download -Force
            throw 'The WinSW download failed its SHA-256 check. Nothing was installed.'
        }
        Move-Item -LiteralPath $download -Destination $wrapper -Force
    }
}
Write-Output "WinSW $WinSWVersion in place, SHA-256 verified."

$values = @{
    NODE             = $node
    CURRENT_DIR      = $current
    LOG_DIR          = $logDir
    LLM_BASE_URL     = $LlmBaseUrl
    LLM_MODEL        = $LlmModel
    LLM_API_KEY_FILE = $keyFile
    AUTH_SECRET_FILE = $secretFile
    AUTH_USERS_FILE  = $usersFile
}
$xml = [IO.File]::ReadAllText($template)
foreach ($name in $values.Keys) { $xml = $xml.Replace('{{' + $name + '}}', [Security.SecurityElement]::Escape($values[$name])) }
if ($xml -match '\{\{\w+\}\}') { throw "The template uses $($Matches[0]), which this script does not fill." }
[IO.File]::WriteAllText((Join-Path $binDir "$ServiceId.xml"), $xml, (New-Object Text.UTF8Encoding($false)))

# Access for LocalService: run the wrapper, read releases, Node, the key, the secret and the users file,
# write logs and .next\cache. npm run users rewrites the users file in place, so its grant stays.
icacls $binDir /grant "${LocalService}:(OI)(CI)RX" | Out-Null
icacls $releases /grant "${LocalService}:(OI)(CI)RX" | Out-Null
icacls $logDir /grant "${LocalService}:(OI)(CI)M" | Out-Null
icacls (Join-Path $DataRoot 'node') /grant "${LocalService}:(OI)(CI)RX" | Out-Null
icacls $keyFile /grant "${LocalService}:(R)" | Out-Null
icacls $secretFile /grant "${LocalService}:(R)" | Out-Null
icacls $usersFile /grant "${LocalService}:(R)" | Out-Null
$cache = Join-Path $current '.next\cache'
New-Item -ItemType Directory -Force $cache | Out-Null
icacls $cache /grant "${LocalService}:(OI)(CI)M" | Out-Null

& $wrapper install | Out-Null
if (-not (Get-Service -Name $ServiceId -ErrorAction SilentlyContinue)) { throw 'WinSW did not register the service.' }

# Start and stop rights for the server account on this one service, for the non-admin watchdog.
$sid = (New-Object Security.Principal.NTAccount($ServerAccount)).Translate([Security.Principal.SecurityIdentifier]).Value
$sddl = ((& sc.exe sdshow $ServiceId) | Where-Object { $_ -match '^D:' } | Select-Object -First 1).Trim()
if ($sddl -notmatch [regex]::Escape($sid)) {
    $ace = "(A;;RPWPDTLCLOCRRC;;;$sid)"
    $at = $sddl.IndexOf('S:')
    $newSddl = if ($at -ge 0) { $sddl.Insert($at, $ace) } else { $sddl + $ace }
    & sc.exe sdset $ServiceId $newSddl | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "sc sdset failed with exit code $LASTEXITCODE." }
}
Write-Output "Service registered; $ServerAccount can start and stop it."

Start-Service -Name $ServiceId
$health = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4800/api/health' -TimeoutSec 3; if ($health.rows -eq 400) { break } } catch { $health = $null }
}
if ($health.rows -ne 400) { throw "The service started, but /api/health did not answer with rows 400 within 60 s. Logs: $logDir" }
Write-Output ("Running. /api/health: " + ($health | ConvertTo-Json -Compress))
