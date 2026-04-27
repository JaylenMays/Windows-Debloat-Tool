@echo off
REM ============================================================================
REM BlurryFr33thyTweaks - launcher
REM ============================================================================
REM Right-click this file and pick "Run as administrator".
REM
REM What this is:
REM   BlurryFr33thyVerbatim base (fr33thy verbatim + 6 user changes)
REM   PLUS Blurry4's 4-option final-stage menu.  5025 lines total.
REM
REM The 6 base changes (inherited from BlurryFr33thyVerbatim):
REM   1) Brave instead of Chrome
REM   2) Xbox trio kept (GamingApp + XboxIdentityProvider + Xbox.TCUI)
REM   3) NVIDIA driver auto-download via GFW API (RTX 4090 / Win11 DCH)
REM   4) Steam / Discord / Valorant / Logitech OMM silent installs
REM   5) 600Hz EnableTiledDisplay veto (n/a -- fr33thy doesn't apply this key)
REM   6) Pre-debloat restore point + persistent log at C:\BlurryFr33thyTweaks\logs\
REM
REM PLUS the 4-option final-stage menu at end of StepTwo:
REM   1) DEBLOAT  [done]    fr33thy debloat + Brave/Steam/Discord/Valorant/Logi
REM   2) TWEAK    [opt-in]  TweakingGuy AIO + Calypto + BoringBoom + BOHR V13
REM   3) CLEAN    [opt-in]  caches/DriverStore/AppX/EventLog/DISM/TRIM
REM   4) EXTRAS   [opt-in]  mouse hover instant + app-kill timeouts (not in any guide)
REM   Pick space-separated (e.g. "2 3 4" for all three). N or empty = skip all.
REM
REM Sister variants:
REM   ..\Blurry3\                  Custom slim StepTwo (no menu, has had silent crashes)
REM   ..\Blurry4\                  Custom slim StepTwo + same 4-option menu
REM   ..\BlurryFr33thyVerbatim\    Same fr33thy base, no menu
REM
REM USE THIS ONE when you want both the safety of fr33thy's verbatim StepTwo
REM AND the optional TWEAK/CLEAN/EXTRAS menu. Likely the best choice for
REM actual fresh-install runs on user's hardware.
REM ============================================================================

setlocal
set "DIR=%~dp0"

REM Self-elevate
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

title BlurryFr33thyTweaks (Administrator)
cd /d "%DIR%"
REM -NoExit so PowerShell stays open if the script errors out.
powershell.exe -NoExit -NoProfile -ExecutionPolicy Bypass -File "%DIR%BlurryFr33thyTweaks.ps1"
echo.
echo [BlurryFr33thyTweaks.bat] PowerShell exited with code %errorlevel%. Press any key to close...
pause >nul
endlocal
