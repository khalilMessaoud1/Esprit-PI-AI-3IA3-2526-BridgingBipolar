@echo off
REM Run from CMD (Invite de commandes) — avoids .ps1 opening in Notepad.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0download-models.ps1" %*
if errorlevel 1 pause
