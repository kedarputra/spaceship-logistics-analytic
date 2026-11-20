<#
  Registers the deploy watchdog as a scheduled task for the current account. No admin needed.

    powershell -NoProfile -ExecutionPolicy Bypass -File deploy\windows\install-watchdog.ps1

  The task runs at logon and every 2 minutes, with limited rights, through watchdog-silent.vbs.
  It runs copies of watchdog.ps1 and watchdog-silent.vbs in <DeployRoot>\bin, never files in a
  checkout, so a commit cannot change the watchdog under the running task. Run this script again
  after changing either file.
#>
param(
    [string]$DeployRoot = 'C:\Work\spaceship-deploy',
    [int]$Minutes = 2,
    [string]$TaskName = 'Spaceship Deploy Watchdog'
)
$ErrorActionPreference = 'Stop'

$bin = Join-Path $DeployRoot 'bin'
New-Item -ItemType Directory -Force $bin | Out-Null
foreach ($file in 'watchdog.ps1', 'watchdog-silent.vbs') {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $bin -Force
}
$launcher = Join-Path $bin 'watchdog-silent.vbs'

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//nologo `"$launcher`"" -WorkingDirectory $bin
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutes)

# IgnoreNew: a run that is still building is never joined by a second one.
# 45 minutes: a build takes a few minutes; this only stops a run that hangs.
# StartWhenAvailable: if the PC was asleep at a scheduled time, run as soon as it wakes.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 45)

try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop } catch { }
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($atLogon, $repeat) -Settings $settings `
    -Description 'Deploys new main commits of the spaceship app to the local service (ADR 0010).' | Out-Null

Write-Output "Registered '$TaskName': at logon and every $Minutes minutes."
Write-Output 'Log: C:\ProgramData\spaceship\logs\watchdog.log'
