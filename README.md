# Blurry Windows Tool — project index

> **For a fresh Claude reading this cold:** this folder holds **five parallel variants** of a Windows-11 fresh-install debloat + gaming-latency tool. They share a goal (RTX 4090 + 600 Hz panel + competitive gaming) but differ in code lineage and feature surface. Read the **"Which one to use"** and **"Session log"** sections before suggesting any change. The user prefers small surgical edits over rewrites.

---

## TL;DR — which variant to use

**Use [`BlurryFr33thy+Tweaks/BlurryFr33thyTweaks.bat`](BlurryFr33thy+Tweaks/BlurryFr33thyTweaks.bat).**

It is fr33thy's verbatim WinSux StepTwo (4204 lines, widely tested by the WinSux community) **+** the user's 6 customizations **+** Blurry4's 4-option TWEAK/CLEAN/EXTRAS menu **+** all of today's hardening fixes. As of 2026-04-27 it's the only variant with the start-of-script menu prompt, the trap-based crash diagnostic, the install-block safety nets, the Snipping Tool keep, and the DesktopAppInstaller keep all in one place.

The other variants exist for fallback / historical / debugging reasons (see "Variant map" below).

---

## Hardware target & hardcoded vetoes

User's actual machine: **Windows 11**, **RTX 4090**, **600 Hz monitor**, gaming-only desktop.

These reg keys are **never written** in any variant — they brick the 600 Hz panel or the GPU recovery path:

- `EnableTiledDisplay = 0` — caps a 600 Hz monitor at 360 Hz
- `RMHdcpKeyGlobZero = 1` — breaks HDR/DSC handshake
- `TCCSupported = 0` — irrelevant on consumer GPUs, only risk
- `NVDeviceSupportKFilter = 0` — display kernel-filter risk
- `Acceleration.Level = 0` — can soft-cap display modes
- `Tdr* = 0` (NVIDIA TDR off) — breaks GPU recovery on hangs
- Wholesale wipe of `TaskCache\Tree` — destroys legit Steam/NVIDIA scheduled tasks
- Disabling `PlugPlay` (PnP) — breaks USB hot-plug

fr33thy's WinSux happens not to write any of them, so for the verbatim variants the veto is implicit. For Blurry3/4 (custom slim StepTwo) the veto is hardcoded refusal in the script.

---

## Variant map

| Folder | Entry point | Lineage | Notes |
|---|---|---|---|
| `BlurryFr33thy+Tweaks/` | `BlurryFr33thyTweaks.bat` | Verbatim + Blurry4 menu | **Recommended.** All today's fixes. Start-of-script menu. ~5083 lines. |
| `BlurryFr33thyVerbatim/` | `BlurryFr33thyVerbatim.bat` | fr33thy verbatim + 6 user changes | Known-good fallback. Has DesktopAppInstaller + Snipping Tool keep + install-block hardening + trap. ~4328 lines. |
| `Blurry4/` | `Blurry4.bat` | Custom slim ~450-line StepTwo + TWEAK/CLEAN/EXTRAS menu | Has TG + Calypto + BoringBoom (no BOHR after today). ~1797 lines. Custom StepTwo has historically silent-crashed on the user's hardware. |
| `Blurry3/` | `Blurry3.bat` | Custom slim StepTwo, no menu | Same custom-StepTwo crash risk. ~1087 lines. |
| `Blurry2/` | `Blurry.bat` | Talon-style 8-mode TUI | "Fresh-feel" Clean mode + scheduled tasks. Different design, not really a debloat path of choice anymore. |
| (root) `BlurryTool.ps1` | `Launch.bat` | WPF GUI tweaker | Original tab-by-tab checkbox tool. Still works; not the primary anymore. |

> **`Launch.bat` at the project root** currently points at `BlurryTool.ps1` (the GUI). User considered repointing it at the recommended variant or making it a picker menu — **not done yet** as of 2026-04-27.

The 6 user customizations carried through the verbatim-based variants:

1. **Brave** instead of Chrome (+ uBlock Origin Lite force-installed via policy, HW accel off, Brave updater services killed)
2. **Xbox app trio kept** (`Microsoft.GamingApp` + `XboxIdentityProvider` + `Xbox.TCUI`) but Game Bar / DVR / overlay neutered via reg keys + protocol redirect
3. **NVIDIA driver auto-download** via GFW manifest API (RTX 4090 / Win11 DCH), local fallback to `F:\etc\Everything\blurry op\Install\`, then file picker
4. **Steam / Discord / Valorant (Riot Client) / Logitech G HUB OMM** silent installs near the end of StepTwo
5. **600 Hz `EnableTiledDisplay` veto** — N/A in verbatim because fr33thy doesn't apply this key anyway
6. **Pre-debloat restore point + persistent log** at `C:\BlurryFr33thy\logs\blurry-fr33thy.log` (Tweaks variant: `C:\BlurryFr33thyTweaks\…`)

---

## Session log — 2026-04-27 (today)

Bugs reported by user on a real run, and the fixes applied. Listed in order so a fresh Claude can replay context.

### 1. NVIDIA Control Panel missing after driver install

**Cause:** AppX strip nukes `Microsoft.DesktopAppInstaller` (= winget). Then ~line 3005 the script tries `winget install 9NF8H0H7WMLT` (NV Control Panel UWP product ID) inside an empty `try { } catch { }` — silent failure.
**Fix:** added `*Microsoft.DesktopAppInstaller*` to the AppX `-notlike` keep list. Applied to `BlurryFr33thyVerbatim.ps1` and `BlurryFr33thyTweaks.ps1`. Not applied to Blurry3/4 (different StepTwo, different keep list, user didn't request).

### 2. Steam / Discord / Logi OMM not on desktop; Valorant downloads but Riot Client launcher missing

**Cause:** four separate issues —
- Steam: script *explicitly deleted* `Steam.lnk` from Public Desktop after install (fr33thy pattern).
- Discord: `-s` flag is undocumented for Discord's Squirrel installer; likely caused it to skip post-install steps. `Stop-Process Discord` 5 s later compounded it.
- Riot Client: `--launch-product=valorant --launch-patchline=live` puts installer into auto-launch mode, can skip the desktop-shortcut creation step.
- Logi OMM: plain `/SILENT` uses Inno Setup default tasks; OMM's setup script doesn't have desktop icon enabled by default.

**Fix:** in `BlurryFr33thyVerbatim.ps1` and `BlurryFr33thyTweaks.ps1`, replaced the install block with a hardened version:
- `New-BlurryPublicShortcut` helper — writes `.lnk` to Public Desktop only if target exists; safety net regardless of installer behaviour.
- Steam: removed the `Remove-Item Steam.lnk` line + safety-net shortcut.
- Discord: dropped `-s`; wait up to 120 s for `%LOCALAPPDATA%\Discord\app-*\Discord.exe` to appear, then kill; safety-net shortcut points at `Update.exe --processStart Discord.exe`.
- Riot: kept the auto-launch args (Valorant download still works); safety-net shortcut for Riot Client added.
- Logi OMM: added `/TASKS="desktopicon"` + safety-net shortcut.

Discord install is per-user, so the shortcut is for the running user only — that's a Discord limitation, not the script's.

### 3. Windows Settings panes opens but doesn't apply (e.g. Windows Update isn't disabled the way it should be)

**Initial misdiagnosis:** thought Settings was *blank* (XAML rendering issue from missing framework AppX). Added `Microsoft.UI.Xaml*` / `VCLibs*` / `NET.Native.*` / `WindowsAppRuntime*` to the keep list.
**User clarified:** they meant the **debloat steps that turn off Settings panes (Windows Update pause, sync off, privacy toggles, etc.) didn't run** — script gets stuck mid-StepTwo before applying `WindowsSettings.reg`.
**Action:** reverted the framework keep entries (user said "do it the way he does it"). Then added Blurry3-style **robustness**:
- A script-scope `trap { ... }` at the top of StepTwo (just after `$progresspreference = 'silentlycontinue'`). Catches unhandled terminating errors, logs to `C:\BlurryFr33thy\logs\…`, prints line + message in red, and uses `continue` so the rest of StepTwo still runs.
- `-NoExit` added to the RunOnce StepTwo launcher so the window stays open if anything crashes.

Did **not** adopt Blurry3's per-section `Step "name" { body }` helper — too invasive for the verbatim variant.

### 4. BOHR V13 power plan removed

User flagged: "why are you giving me bohr power plan? i didnt ask for that".
Removed the BOHR import block from `BlurryFr33thyTweaks.ps1`'s TWEAK section (was layer D). TWEAK is now: TweakingGuy AIO + Calypto + BoringBoom NVPI. Ultimate Performance power plan set earlier in TWEAK stays active. Not present in any other variant.

### 5. Snipping Tool keep across all variants

User: "i want snipping tool on all of them as well so include it back into appx".
Added `Microsoft.ScreenSketch` (Win11 package name for Snipping Tool) to AppX keep list in:
- `BlurryFr33thyVerbatim.ps1`
- `BlurryFr33thyTweaks.ps1`
- `Blurry3.ps1`
- `Blurry4.ps1`

### 6. Start-of-script menu prompt (Tweaks variant only)

User: "i should see those options at the beginning of the script to choose 1-4".
In `BlurryFr33thyTweaks.ps1`:
- Added a 4-option menu prompt at the top of the main stage (before restore point creation).
- User's selection is saved to `C:\BlurryFr33thyTweaks\menu-choice.txt` so it survives both reboots.
- The existing end-of-StepTwo menu code now **reads** that file instead of `Read-Host`-ing again. Script is fully unattended after the initial pick.
- Menu shown is: `1) DEBLOAT [always]  2) TWEAK [opt-in]  3) CLEAN [opt-in]  4) EXTRAS [opt-in]`. User types e.g. `2 3 4` for all opt-ins.

### 7. Things considered but not done

- **Repointing root `Launch.bat`** at the recommended variant or making it a picker menu — discussed, user moved on before deciding.
- **Porting today's fixes (DesktopAppInstaller, install-block hardening, trap+NoExit) into Blurry3/4** — only Snipping Tool was applied to those; the rest weren't requested.
- **Web research for additional tweaks (the "ultimate gaming tool" goal)** — user instructed to search tweaking guides; agent **not yet spawned** as of this README write. Next action is to spawn a research agent with this scope:
  - Goal: catalogue tweaks for the ultimate Win11 gaming tool not already in fr33thy / TG / Calypto / BoringBoom.
  - Sources: TalonV2, Atlas OS, ReviOS, AME Wizard, ChrisTitus winutil, DonExe / ProgrammingDev, recent r/optimizedgaming and YouTube guides for Win11 24H2+.
  - Hardware: RTX 4090 + 600 Hz panel; respect the 7 hardcoded vetoes.
  - Avoid: re-discovering tweaks already in those four guides.
  - User explicitly **rejected** BOHR V13 power plan — don't re-suggest.

---

## File-state snapshot at end of session 2026-04-27

| File | Lines | Parses |
|---|---|---|
| `BlurryFr33thy+Tweaks/BlurryFr33thyTweaks.ps1` | 5083 | OK |
| `BlurryFr33thyVerbatim/BlurryFr33thyVerbatim.ps1` | 4328 | OK |
| `Blurry4/Blurry4.ps1` | 1797 | OK |
| `Blurry3/Blurry3.ps1` | 1087 | OK |

Per-variant detail logs live in each variant's `_CLAUDE_NOTES.md`. The Verbatim and +Tweaks notes have today's changelog entries; Blurry3/4 don't (only got the Snipping Tool keep, no other today-changes).

---

## Working rules the user has set

1. **fr33thy's verbatim StepTwo is sacred.** Don't "improve" the bulk of fr33thy's logic. If a bug is inside fr33thy's content, surface it as a fr33thy bug — don't silently rewrite. The 6 user customizations are the only sanctioned deviations baseline; today's robustness fixes (#1, #2, #3, #5) are pragmatic additions for real-world reliability.
2. **`BlurryFr33thyVerbatim/` is the safety-net fallback.** Don't load it up with tweaks — if something breaks, this is the variant the user falls back to. Tweaks belong in `BlurryFr33thy+Tweaks/`.
3. **Append a changelog entry to `_CLAUDE_NOTES.md`** in any variant's folder you edit.
4. **Confirm before invasive edits.** User prefers small surgical changes. When you have multiple options, lay them out (A / B / C) with tradeoffs and let them pick.
5. **Don't add anything the user didn't ask for** (e.g. BOHR V13). When in doubt, ask.
6. **The 7 hardcoded vetoes are non-negotiable.** Verify any new tweak against the veto list before suggesting.

---

## Original GUI tool (BlurryTool.ps1) — preserved for reference

The root has `BlurryTool.ps1` (a WPF GUI tweaker, ~21 KB) and its launcher `Launch.bat`. Predates the fr33thy-clone variants. Tab-by-tab checkboxes; modules in `modules/`; tweakingguy AIO with the 600 Hz-killing lines commented out is in `data/tweakingguy.bat`. Still functional; not the recommended path.

Layout:
```
Launch.bat              <- self-elevates, runs BlurryTool.ps1 (GUI tweaker)
BlurryTool.ps1          <- WPF GUI + tweak engine
modules/
  Debloat.ps1, Tweaks.ps1, Gaming.ps1, Network.ps1,
  GPU.ps1, Services.ps1, Apps.ps1, Power.ps1
data/
  tweakingguy.bat            <- TweakingGuy AIO, hardened (600 Hz-safe)
  tweakingguy_original.bat   <- diff reference of the original
logs/
  blurry.log
```

Reverting tweaks the GUI applied:
- System restore: `rstrui.exe`, pick the "Blurry Tool - pre-tweak" point.
- Per-tweak: most reg keys can be `reg delete`'d. The log file lists every key written.
- Power plan: `powercfg -setactive SCHEME_BALANCED`.
- bcdedit: `bcdedit /deletevalue <name>` per setting.
