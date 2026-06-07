@echo off
setlocal
cd /d "%~dp0"

set APP_URL=http://localhost:3000/dashboard

curl -s "%APP_URL%" >nul 2>nul
if not errorlevel 1 (
  echo M^&M SuperMart ERP is already running.
  start "" "%APP_URL%"
  exit /b 0
)

if not exist "client\.next\BUILD_ID" (
  echo Building M^&M SuperMart ERP for the first run...
  call npm.cmd --workspace client run build
  if errorlevel 1 (
    echo Build failed. Please check the terminal output.
    pause
    exit /b 1
  )
)

start "" "%APP_URL%"
echo M^&M SuperMart ERP is starting at %APP_URL%
echo Keep this window open while using the billing software.
call npm.cmd --workspace client run start
