@echo off
REM ============================================================================
REM Blurry Windows Debloat Tool 3 - launcher
REM ============================================================================
REM Right-click this file and pick "Run as administrator".
REM
REM What this is:
REM   - fr33thy WinSux clone, custom slim StepTwo (~450 lines).
REM   - 3-stage flow: Main -> SafeBoot/DDU -> StepTwo (RunOnce-fired).
REM   - Brave / Xbox-app-kept / NVIDIA driver auto-DL / Steam-Discord-Valorant-Logi.
REM   - 600Hz EnableTiledDisplay veto + restore point + persistent log.
REM   - StepTwo has crash trap + Step{} per-section helper + end-pause +
REM     RunOnce launches with -NoExit (added after "closes silently after AppX" bug).
REM
REM Sister variants (in case Blurry3 silent-crashes):
REM   ..\Blurry4\                  Blurry3 + 4-option TWEAK/CLEAN/EXTRAS menu
REM   ..\BlurryFr33thyVerbatim\    fr33thy WinSux byte-for-byte + the 6 user changes
REM   ..\BlurryFr33thy+Tweaks\     verbatim + Blurry4 menu (likely best choice)
REM
REM Diagnostics if it still closes instantly:
REM   powershell -NoExit -NoProfile -ExecutionPolicy Bypass -File "%~dp0Blurry3.ps1"
REM ============================================================================

setlocal
set "DIR=%~dp0"

REM Self-elevate
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

title Blurry 3 (Administrator)
cd /d "%DIR%"
REM -NoExit so PowerShell stays open if the script errors out before its trap fires.
REM On successful run, the script ends with shutdown -r -t 00 anyway, so this is harmless.
powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%DIR%Blurry3.ps1"
echo.
echo [Blurry3.bat] PowerShell exited with code %errorlevel%. Press any key to close...
pause >nul
endlocal
