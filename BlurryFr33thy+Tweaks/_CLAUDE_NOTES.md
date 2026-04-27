# Claude session notes — BlurryFr33thy+Tweaks

This is **`BlurryFr33thyVerbatim` + Blurry4's TWEAK/CLEAN/EXTRAS menu** combined into one variant. Folder name is `BlurryFr33thy+Tweaks` (with literal `+`); the .ps1 / .bat / log path use `BlurryFr33thyTweaks` (no `+`) to avoid path-quoting awkwardness.

**Why this exists:** user wanted the verbatim-fr33thy safety net + the menu structure from Blurry4 in one tool. So a fresh-install run gets:
- All of fr33thy's known-good debloat (4204 lines verbatim)
- Plus the 6 user-specified additions (Brave, Xbox kept, NVIDIA auto-DL, apps installs, restore + log; 600Hz veto N/A)
- Plus the 4-option Blurry4 menu at end of StepTwo:
  ```
  1) DEBLOAT   [done]    fr33thy debloat + Brave/Steam/Discord/Valorant/Logi (just ran)
  2) TWEAK     [opt-in]  TweakingGuy AIO + Calypto + BoringBoom + BOHR
  3) CLEAN     [opt-in]  caches / DriverStore / AppX / EventLog / DISM
  4) EXTRAS    [opt-in]  mouse hover + app-kill timeouts (not in any guide)
  ```

## Construction

1. Copied `BlurryFr33thyVerbatim.ps1` → `BlurryFr33thyTweaks.ps1` (4275 lines).
2. Renamed all `BlurryFr33thyVerbatim` → `BlurryFr33thyTweaks` and `BlurryFr33thy` (when not followed by Verbatim/Tweaks) → `BlurryFr33thyTweaks`. Log path is now `C:\BlurryFr33thyTweaks\logs\blurry-fr33thy-tweaks.log`.
3. Injected at top of fr33thy's StepTwo here-string (right after `$progresspreference = 'silentlycontinue'`):
   - `$LogPath` definition
   - `function L([string]$m,[string]$lvl='INFO')` — the same logging helper Blurry4's menu code expects.
4. Inserted Blurry4.ps1 menu code (lines 996–1717, 722 lines) after the Logitech G HUB OMM `} catch {}` and before fr33thy's final `Write-Host "RESTARTING"`. So the user gets prompted for the menu AFTER all installs but BEFORE the final reboot.

Final size: **5025 lines, ~250 KB**. Parse OK.

## What runs at runtime

1. Main script (admin elevation, internet check, restore point, log setup, 7-Zip + VC++ + DDU + Brave + DirectX downloads).
2. StepOne (safe boot — Defender disable via TrustedInstaller, UAC off, DDU pass, reboot).
3. StepTwo (normal boot, fired from RunOnce):
   - All of fr33thy's StepTwo content (~3,800 lines: AppX with Xbox kept / capabilities / optional features / OneDrive / Edge / Copilot / privacy / explorer / power / network / scheduled tasks / NVIDIA driver auto-DL replacing manual / NVPI .nip import via fr33thy's existing block / restore point).
   - Steam / Discord / Valorant / Logitech OMM silent installs (Blurry change).
   - **4-option menu prompt** (Blurry-Tweaks addition).
   - If user picked TWEAK: TG AIO 1-19 + Calypto + BoringBoom layer + BOHR power plan.
   - If user picked CLEAN: caches/DriverStore/AppX/EventLog/DISM/etc.
   - If user picked EXTRAS: mouse hover + app-kill timeouts.
   - fr33thy's "RESTARTING" + final reboot.

## Differences vs the other variants

| Variant | StepTwo source | Menu |
|---|---|---|
| Blurry3 | my custom ~450-line slim | none |
| Blurry4 | my custom ~450-line slim | TWEAK/CLEAN/EXTRAS |
| BlurryFr33thyVerbatim | fr33thy verbatim 3,800 lines | none |
| **BlurryFr33thy+Tweaks** | **fr33thy verbatim 3,800 lines** | **TWEAK/CLEAN/EXTRAS** |

**Use this when:** you want the safety of fr33thy's known-good debloat AND the optionality of Blurry4's menu. Likely the most useful variant for actual fresh-install runs.

## Rules for Claude

1. Do NOT "improve" fr33thy's content (the bulk of StepTwo). It's verbatim. If a bug appears inside, surface it as a fr33thy issue.
2. Menu code (TWEAK/CLEAN/EXTRAS) IS owned by us — bugs there are fair game to fix.
3. The 7 hardcoded vetoes still apply (EnableTiledDisplay, RMHdcpKeyGlobZero, etc.) but fr33thy doesn't try to write any.
4. Append a changelog entry below for every edit to `BlurryFr33thyTweaks.ps1`.

---

## Change log

### 2026-04-26 — Initial build

- Forked from `BlurryFr33thyVerbatim.ps1`. All 6 user-specified changes inherited.
- Renames: `BlurryFr33thyVerbatim` → `BlurryFr33thyTweaks`, `C:\BlurryFr33thy\logs\` → `C:\BlurryFr33thyTweaks\logs\`.
- Injected `$LogPath` + `function L()` near top of fr33thy's StepTwo here-string (so menu code's `L "..." 'STAGE'` calls work).
- Inserted Blurry4 menu code (TWEAK A/B/C/D + CLEAN + EXTRAS, ~722 lines) between Logitech OMM block and fr33thy's final `Write-Host "RESTARTING"`.
- Final size: 5025 lines, 250 KB. Parse OK.
- Created `BlurryFr33thyTweaks.bat` launcher with `-NoExit` + `pause` (matches the other variants).
