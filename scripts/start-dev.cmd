@echo off
REM Double-click to start the full BridgingBipolar dev stack.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1" %*
if errorlevel 1 pause
