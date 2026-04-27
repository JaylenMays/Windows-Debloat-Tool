@echo off
:: Blurry Windows Tool launcher - elevates and runs the PowerShell GUI
title Blurry Windows Tool

:: Self-elevate
NET FILE 1>NUL 2>NUL
if '%errorlevel%' == '0' (goto :run) else (goto :elevate)

:elevate
echo Requesting administrator privileges...
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b

:run
cd /d "%~dp0"
echo Starting Blurry Windows Tool...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0BlurryTool.ps1"
if errorlevel 1 (
    echo.
    echo Tool exited with an error. Check logs\blurry.log
    pause
)
exit /b
