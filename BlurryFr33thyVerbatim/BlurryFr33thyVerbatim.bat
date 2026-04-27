@echo off
REM ============================================================================
REM BlurryFr33thyVerbatim - launcher
REM ============================================================================
REM Right-click this file and pick "Run as administrator".
REM
REM What this is:
REM   fr33thy WinSux.ps1 verbatim (4204 lines copied byte-for-byte) PLUS only
REM   the 6 user-specified changes -- nothing else rewritten. 4275 lines total.
REM   Source: F:\ISO&Debloat\New folder\WinSux-Windows-Optimization-Guide-main\
REM
REM The 6 changes:
REM   1) Brave instead of Chrome (+ uBOL extension policy)
REM   2) Xbox trio kept (GamingApp + XboxIdentityProvider + Xbox.TCUI)
REM   3) NVIDIA driver auto-download via GFW manifest API (RTX 4090 / Win11 DCH)
REM      Falls back to F:\etc\Everything\blurry op\Install\, then file picker.
REM   4) Steam / Discord / Valorant / Logitech OMM silent installs at end of StepTwo
REM   5) 600Hz EnableTiledDisplay veto (n/a -- fr33thy doesn't apply this key)
REM   6) Pre-debloat restore point + persistent log at C:\BlurryFr33thy\logs\
REM
REM What was NOT touched:
REM   - DDU Settings.xml (lines 108-145)         - StepOne content (Defender + DDU)
REM   - StepTwo's ~3,800 lines of debloat logic  - NVPI download + .nip embed
REM   - bcdedit safeboot pattern                 - Userinit hijack
REM   - AMD/Intel GPU branches                   - fr33thy's post-debloat restore point
REM
REM Sister variants:
REM   ..\Blurry3\                  Custom slim ~450-line StepTwo (different from fr33thy)
REM   ..\Blurry4\                  Blurry3 base + 4-option TWEAK/CLEAN/EXTRAS menu
REM   ..\BlurryFr33thy+Tweaks\     This verbatim + the Blurry4 menu (best of both)
REM
REM Use this variant when you want fr33thy's known-good StepTwo without the
REM custom Blurry3/4 rewrite that has caused silent crashes on real hardware.
REM ============================================================================

setlocal
set "DIR=%~dp0"

REM Self-elevate
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

title BlurryFr33thyVerbatim (Administrator)
cd /d "%DIR%"
REM -NoExit so PowerShell stays open if the script errors out.
powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%DIR%BlurryFr33thyVerbatim.ps1"
echo.
echo [BlurryFr33thyVerbatim.bat] PowerShell exited with code %errorlevel%. Press any key to close...
pause >nul
endlocal
