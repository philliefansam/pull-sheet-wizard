@echo off
cd /d "%~dp0"
echo Building Pull Sheet Wizard Vite Single-File Distribution...
call npm.cmd run build
if %ERRORLEVEL% EQU 0 (
  copy /Y "dist\index.html" "dist\PullSheetWizard.html" >nul
  echo.
  echo [SUCCESS] Single-file build complete!
  echo Output: %~dp0dist\PullSheetWizard.html
  echo.
) else (
  echo [ERROR] Build failed.
)
