# Stop only our previously recorded viewer process; never terminate arbitrary PowerShell sessions.
$ErrorActionPreference = 'SilentlyContinue'
$pidFile = Join-Path $env:LOCALAPPDATA 'ScnViewerBridge\viewer-server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { exit 0 }
$serverPid = 0
if (-not [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$serverPid)) { exit 0 }
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid"
if ($process -and $process.Name -match '^powershell(\.exe)?$' -and
    $process.CommandLine -like '*Start_ScnViewer.ps1*' -and
    $process.CommandLine -like ('*' + (Join-Path $PSScriptRoot 'Start_ScnViewer.ps1') + '*')) {
    Stop-Process -Id $serverPid -Force
    Remove-Item -LiteralPath $pidFile -Force
}
