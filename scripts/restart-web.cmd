@echo off
REM Fix blank page / "missing required error components" — clean .next and restart web on port 3000.
cd /d "%~dp0.."
echo Stopping anything listening on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
timeout /t 2 /nobreak >nul
echo Starting clean Next.js dev server...
npm run dev:clean --workspace apps/web -- -p 3000
