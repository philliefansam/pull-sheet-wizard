@echo off
title Pull Sheet Wizard Application Server
echo Starting Pull Sheet Wizard Server...
echo ===========================================
echo Downloading dependencies (if required)...
echo Starting backend server on port 9989...

:: Run server in a new window or in the background
start "Pull Sheet Wizard Server" /min powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"

:: Wait 3 seconds for server boot-up
timeout /t 3 /nobreak > nul

:: Open default web browser to the dashboard
echo Opening dashboard in default web browser...
start http://localhost:9989

echo ===========================================
echo Server is running! Keep this window open.
echo Press any key to stop the server and exit.
pause > nul

:: Stop the server by killing the running task name
taskkill /FI "WINDOWTITLE eq Pull Sheet Wizard Server*" /T /F > nul 2>&1
echo Server stopped. Exiting.
timeout /t 2 > nul
exit
