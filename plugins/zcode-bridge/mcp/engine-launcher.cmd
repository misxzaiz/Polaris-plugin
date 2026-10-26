@echo off
rem zcode engine launcher
rem forward all args to node engine.js
node "%~dp0engine.js" %*
if errorlevel 1 exit /b %errorlevel%
