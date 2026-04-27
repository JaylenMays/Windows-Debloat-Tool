@echo off
REM ============================================================================
REM Blurry Windows Debloat Tool 4 - launcher
REM ============================================================================
REM Right-click this file and pick "Run as administrator".
REM
REM What this is:
REM   - Blurry3 base (custom slim StepTwo) + 4-option final-stage menu.
REM   - Same 3-stage flow as Blurry3 (Main -> SafeBoot/DDU -> StepTwo).
REM   - Same crash trap / Step{} helper / end-pause / RunOnce -NoExit fixes
REM     mirrored from Blurry3 (after the "closes silently after AppX" bug).
REM
REM Final-stage menu at end of StepTwo:
REM   1) DEBLOAT  [done]    fr33thy debloat + Brave/Steam/Discord/Valorant/Logi
REM   2) TWEAK    [opt-in]  TweakingGuy AIO + Calypto + BoringBoom + BOHR V13
REM   3) CLEAN    [opt-in]  caches/DriverStore/AppX/EventLog/DISM/TRIM
REM   4) EXTRAS   [opt-in]  mouse hover instant + app-kill timeouts (not in any guide)
REM   Pick space-separated (e.g. "2 3 4" for all three). N or empty = skip all.
REM
REM Sister variants:
REM   ..\Blurry3\                  Blurry3 base without the 4-option menu
REM   ..\BlurryFr33thyVerbatim\    fr33thy verbatim + 6 changes (no menu)
REM   ..\BlurryFr33thy+Tweaks\     verbatim + this same 4-option menu (safer base)
REM
REM Diagnostics if it closes instantly:
REM   powershell -NoExit -NoProfile -ExecutionPolicy Bypass -File "%~dp0Blurry4.ps1"
REM ============================================================================

setlocal
set "DIR=%~dp0"

REM Self-elevate
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

title Blurry 4 (Administrator)
cd /d "%DIR%"
REM -NoExit so PowerShell stays open if the script errors out before its trap fires.
REM On successful run, the script ends with shutdown -r -t 00 anyway, so this is harmless.
powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%DIR%Blurry4.ps1"
echo.
echo [Blurry4.bat] PowerShell exited with code %errorlevel%. Press any key to close...
pause >nul
endlocal
