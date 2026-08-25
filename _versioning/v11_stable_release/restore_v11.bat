@echo off
echo Restoring Pull Sheet Wizard to v11 stable release...
copy /Y "%~dp0public\app.js" "%~dp0..\..\public\app.js"
copy /Y "%~dp0public\style.css" "%~dp0..\..\public\style.css"
copy /Y "%~dp0public\index.html" "%~dp0..\..\public\index.html"
copy /Y "%~dp0server.ps1" "%~dp0..\..\server.ps1"
echo Restoration complete!
pause
