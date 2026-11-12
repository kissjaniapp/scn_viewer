Option Explicit
Dim sh, fs, folder, script, executable, command
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
folder = fs.GetParentFolderName(WScript.ScriptFullName)
script = fs.BuildPath(folder, "Start_ScnViewer.ps1")
executable = sh.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
command = """" & executable & """ -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & script & """"
sh.Run command, 0, False
