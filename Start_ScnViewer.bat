@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "SCN Viewer" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start_ScnViewer.ps1"
