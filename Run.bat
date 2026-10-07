@echo off
rem Launches Debloat.ps1 elevated. Execution policy is bypassed for this run only.
rem Pass -DryRun or -Auto after the file name, e.g.:  Run.bat -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoExit -NoProfile -ExecutionPolicy Bypass -File \"%~dp0Debloat.ps1\" %*'"
