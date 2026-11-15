@echo off
REM MindFlow for Windows: double-click this file to start MindFlow.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this file again.
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing MindFlow - first run only, this takes a minute...
  call npm install
)
if not exist .env copy .env.example .env >nul
echo.
echo Starting MindFlow. Keep this window open while you use it.
echo Your browser will open at http://localhost:8787
echo To use MindFlow on your phone, open the "On your Wi-Fi" address shown below.
echo.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:8787"
call npm run app
pause
