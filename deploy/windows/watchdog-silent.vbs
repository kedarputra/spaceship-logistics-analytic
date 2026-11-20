' Runs the deploy watchdog without any window, for the scheduled task.
'
' Task Scheduler starting powershell.exe directly still flashes a console for a moment, even with
' -WindowStyle Hidden: Windows creates the console host before PowerShell can hide itself. wscript.exe
' has no console, and Run with window style 0 starts the process hidden from the start. The server is a
' shared desktop, so nothing may flash on someone's screen every two minutes.
'
' Output is not lost: the watchdog writes its own log. Any arguments are passed through.

Option Explicit

Dim sh, fso, here, script, args, i

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
script = here & "\watchdog.ps1"

' No message box: this runs unattended, and a box waiting for a click would hang the task forever.
If Not fso.FileExists(script) Then WScript.Quit 2

args = ""
For i = 0 To WScript.Arguments.Count - 1
    args = args & " " & WScript.Arguments(i)
Next

sh.CurrentDirectory = here
WScript.Quit sh.Run("powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & script & """" & args, 0, True)
