# Claude session notes — project root

**READ THIS FIRST.** This file is the project-root cross-session log for Claude. It survives Windows reinstalls + Claude reinstalls because it lives on `F:\` (the user's external drive). The C:\ memory system (`C:\Users\blurry\.claude\projects\F--Blurry-WIndows-TOol\memory\`) auto-loads when present but gets wiped on Windows reinstall — these F:\ notes are the durable backup.

## User & hardware (do not forget)

- **User:** blurry3 (handle). Personal Win11 fresh-install debloat tool. NOT for distribution.
- **GPU:** NVIDIA RTX 4090 (DCH driver). NVPI Low-Latency-Ultra profile imported.
- **Monitor:** 600Hz panel — DisplayPort tiled + DSC transport REQUIRED for full refresh. **Single most load-bearing constraint in the project.**
- **OS:** Windows 11. **Region:** NA (Riot Client URL pinned to `live.live.na.exe`).
- **CPU:** hybrid Intel assumed. Hardware auto-detected at runtime via WMI.
- **External drive:** `F:\` holds source materials AND the working copy of the tool. Tool installs itself to `C:\Blurry3\` or `C:\Blurry4\` for stable scheduled-task paths.

## Working style

- Iterates by reinstalling Windows + re-running the tool, then comes back with feedback. Broken builds = wasted reinstalls. Verify carefully before claiming done.
- Comfortable reading PowerShell, batch, registry. Doesn't need explanations of what `bcdedit` or `reg add` do.
- References upstream sources by name (fr33thy / WinSux, TweakingGuy, Calypto, BoringBoom, BOHR) and expects you to know what's in them.
- Wants a single tool that's idempotent, fire-and-forget, that produces a usable system on first reboot. Not a GUI to tinker with.
- Frame: this is THEIR daily driver, so favor "matches user intent / upstream behavior" over "safer default."
- Has explicitly said *"our conversations keep getting lost each time i test the tool."* Save context aggressively — every load-bearing decision goes here.

## Project layout

```
F:\Blurry WIndows TOol\
├── _CLAUDE_NOTES.md       <- THIS FILE (read first)
├── README.md              <- v1 BlurryTool README (mostly historical now)
├── BlurryTool.ps1         <- v1 WPF GUI (superseded)
├── HITREG_LATENCY.md      <- USER'S OWN tier-S/A/B/C analysis of what helps for FPS
├── WHY_SMOOTH.md          <- USER'S OWN explanation of "smoothness feeling" + what does NOT help
├── data/
│   ├── tweakingguy.bat            <- HARDENED TG (600Hz-safe; vetoed lines commented out)
│   └── tweakingguy_original.bat   <- diff reference
├── modules/                <- v1 modules (Debloat/Tweaks/Gaming/Network/GPU/Services/Apps/Power)
├── Blurry2/                <- v2 (Talon-style TUI menu)
├── Blurry3/                <- v3 ACTIVE — fr33thy WinSux clone (single-file PS1 + here-strings for StepOne/StepTwo)
│   ├── Blurry3.bat / Blurry3.ps1
│   ├── README.md / _CLAUDE_NOTES.md (Blurry3-specific changelog)
├── Blurry4/                <- v4 ACTIVE — Blurry3 + 4-option menu (DEBLOAT/TWEAK/CLEAN/EXTRAS)
│   ├── Blurry4.bat / Blurry4.ps1
│   └── README.md / _CLAUDE_NOTES.md (Blurry4-specific changelog)
├── BlurryFr33thyVerbatim/  <- VERBATIM fr33thy WinSux.ps1 + only the 6 user-specified changes
│   ├── BlurryFr33thyVerbatim.bat / BlurryFr33thyVerbatim.ps1
│   └── _CLAUDE_NOTES.md (lists exactly which lines were changed)
└── BlurryFr33thy+Tweaks/   <- BlurryFr33thyVerbatim base + Blurry4's TWEAK/CLEAN/EXTRAS menu
    ├── BlurryFr33thyTweaks.bat / BlurryFr33thyTweaks.ps1
    └── _CLAUDE_NOTES.md
```

**Four active versions:**
- **Blurry3** — fr33thy-faithful flow, my custom slim StepTwo (~450 lines). Has had silent crashes on real hardware.
- **Blurry4** — Blurry3 base + 4-option final-stage menu (DEBLOAT done / TWEAK / CLEAN / EXTRAS). Same custom StepTwo as Blurry3, same risk profile.
- **BlurryFr33thyVerbatim** — fr33thy's `WinSux.ps1` byte-for-byte (4204 lines) + only the 6 user-specified changes. Total 4275 lines. **Fallback if Blurry3/4 keep crashing — closest to widely-tested fr33thy code.**
- **BlurryFr33thy+Tweaks** — BlurryFr33thyVerbatim base + Blurry4's TWEAK/CLEAN/EXTRAS menu inserted at end of StepTwo. 5025 lines. **Best of both worlds: fr33thy safety + Blurry4 menu optionality.**

When user says "the tool" without qualifying, ask which one. Read all four subfolder `_CLAUDE_NOTES.md` files for current state.

## Source materials (canonical paths on F:\)

| Source | Path | Used for |
|---|---|---|
| fr33thy WinSux.ps1 (4204 lines) | `F:\ISO&Debloat\New folder\WinSux-Windows-Optimization-Guide-main\Files\WinSux.ps1` | Spine of Blurry3 (3-stage Main → SafeBoot/DDU → StepTwo). DDU `Settings.xml` lines 108-145. NVPI .nip lines 3055-3251. |
| TweakingGuy AIO | User's pasted batch (~1500 lines, in Blurry4 conversation history) + `F:\Blurry WIndows TOol\data\tweakingguy.bat` | Blurry4's TWEAK option |
| Calypto Latency Guide | Reddit/forum (no .bat on disk, well-known reg tweaks) | Blurry4 TWEAK part B |
| BoringBoom .nip | `F:\etc\Everything\blurry op\Nvidia\Low Latency Ultra.nip` | Blurry4 TWEAK part C (NVPI layered import) |
| BOHR V13 power plan | `F:\blurry win2026\BOHRV13.pow` (newest version user uses) | Blurry4 TWEAK part D |
| Furious Frequency / CS2 | `F:\etc\Everything\furious_frequency_basic_fps_guide\` (CS2.nip, FREQUENCYCS_2023_UPDATED_POWER_PLAN.pow) | Available but not yet integrated |
| User's 540hz.bat / Blurrysmooth.bat | `F:\etc\Everything\blurry op\` | Source of 600Hz veto rule + smoothness merges |

## NVIDIA driver lookup

- API: `https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php?func=DriverManualLookup&psid=129&pfid=976&osID=135&languageCode=1033&isWHQL=1&dch=1&sort1=0&numberOfResults=1`
- IDs: `psid=129` (RTX 40 series), `pfid=976` (RTX 4090), `osID=135` (Win11 64-bit DCH). These rotate occasionally.
- Local fallback: latest matching `.exe` under `F:\etc\Everything\blurry op\Install\` (regex `^\d{3}\.\d+.*win10-win11-64bit.*\.exe$`).
- 3rd-tier fallback in Blurry3: `OpenFileDialog` picker if both API and local fallback fail.

## Hardcoded vetoes — NEVER apply (would brick user's hardware)

These apply to BOTH Blurry3 and Blurry4. Don't introduce them ever:

- `EnableTiledDisplay = 0` — caps the 600Hz monitor to 360Hz (DP tiled+DSC disabled). Most important.
- `RMHdcpKeyGlobZero = 1` — breaks HDR/DSC handshake on the 600Hz DSC-required panel
- `TCCSupported = 0` — irrelevant on consumer GPUs, only risk
- `NVDeviceSupportKFilter = 0` — display-path kernel filter, risk
- `Acceleration.Level = 0` — can soft-cap display modes
- `TaskCache\Tree` wholesale wipe — destroys legit Steam/NVIDIA/Discord scheduled tasks
- `PlugPlay` (PnP) off — breaks USB hot-plug

## Blurry3 NEVER list (additional items kept off in Blurry3, but flipped in Blurry4)

These are the stricter Blurry3 list. Blurry4 enables them per pro-tweaker norms:

- `bcdedit /set nx AlwaysOff` (DEP off)
- Rename `smartscreen.exe` → `.exee`
- Rename `mcupdate_GenuineIntel.dll` / `mcupdate_AuthenticAMD.dll` → `.dlll`
- Disable `Spooler` (no printing)
- Disable `iphlpsvc` (IPv6 already off)
- Disable `IKEEXT` (no VPN required for NA Valorant)
- Disable `LanmanWorkstation` (no SMB shares)
- NVIDIA `Tdr* = 0` (consistency vs recovery)

## Architecture: Blurry3 flow (fr33thy-faithful)

1. **Main script (normal boot)** — pre-reqs (7-Zip, VC++, DDU stage, Brave+uBOL, DirectX), build StepOne/StepTwo here-strings to disk, arm Userinit→StepOne, arm RunOnce→StepTwo, `bcdedit /set safeboot minimal`, `shutdown -r -t 00`.
2. **StepOne (safe boot)** — restore Userinit, Defender disable via TrustedInstaller hijack, UAC off, clear safeboot, DDU `-CleanAllGpus -Restart`.
3. **StepTwo (normal boot, RunOnce-fired)** — AppX allowlist (Xbox kept), capabilities/features allowlist, OneDrive uninstall, Edge/Copilot/Recall/Cortana off, telemetry off, Game Bar neuter, Explorer classic, NVMe flags, NIC bindings, scheduled-task kills, RunOnce wipe, WU pause 365d, NVIDIA driver auto-DL + reg tweaks (with 600Hz veto), NVPI fr33thy.nip import, Steam/Discord/Valorant/Logi installs, cleanup.

**Userinit hijack**: powershell-only (no `userinit.exe,` prefix). Works because next boot is into safe mode where Win11 skips the "Please wait" splash. Only safe in safe mode — if you ever want it to fire in normal mode, you must prepend `C:\WINDOWS\system32\userinit.exe,`.

## Architecture: Blurry4 flow (Blurry3 + 4-option menu)

Same 3-stage flow as Blurry3. At end of StepTwo (before cleanup), shows:

```
  1) DEBLOAT   [done]
  2) TWEAK     [opt-in] TG AIO + Calypto + BoringBoom + BOHR
  3) CLEAN     [opt-in] caches/DriverStore/AppX/EventLog/DISM
  4) EXTRAS    [opt-in] my add-ons NOT in any guide (mouse hover, app-kill timeouts)
```

User enters space-separated picks (e.g. `2 3 4`). N or empty = skip all.

## Smoothness science (user's own analysis from `WHY_SMOOTH.md`)

In rough order of perceptual impact:
1. **Timer res 0.5ms** via scheduled task (`timeBeginPeriod(0)`) — 30× more granular kernel scheduling. Single biggest "feel" tweak.
2. **Ultimate Performance / BOHR power plan + cores unparked 100%** — CPU pegged at boost, no c-state ramp on input.
3. **DWM thumbnail/Aero peek/VisualFX off** — less compositor work per frame.
4. **MenuShowDelay=0 + MouseHoverTime/Width/Height=1** — instant menus + instant hover detection.
5. **Mouse accel off + 1:1 SmoothMouse curve + RawMouseThrottleEnabled=0** — 1:1 cursor.
6. **Win32PrioritySeparation = 0x2a** (6:1 foreground quantum).
7. **HAGS (HwSchMode = 2)** — GPU schedules its own work.
8. **NIC interrupt moderation off + Nagle's off + per-CPU DPCs**.
9. **USB selective-suspend off + USB XHCI MSI mode** — every USB poll lands.

User's `WHY_SMOOTH.md` explicitly says these do NOT help (saved here in case the file goes missing): renaming smartscreen.exe (0ms gain, security loss), nx AlwaysOff (only old hardware), Spooler/PlugPlay/iphlpsvc off (50MB RAM, breaks features), 8000Hz polling without timer res + MSI + USB power off (worse than 1000Hz), IPv6 disable unless v4-only network. *Note: Blurry4 does several of these regardless because TG does — user explicitly opted into the pro-tweaker tradeoff.*

## Current bug state (last test)

User reported on the most recent run: "Blurry3 ran, AppX worked, then closed — no error message." Diagnosis:
- **Pause was missing at end of StepTwo** → on success (or silent crash) the window auto-closed → user can't tell which happened.
- StepTwo had no trap block → unhandled errors closed window without printing.
- RunOnce launched StepTwo without `-NoExit` → no safety net.

**Fixes applied to Blurry3 (verify in Blurry4 next session):**
- `Pause` at end of StepTwo (just before closing `'@`).
- `trap { }` block at top of StepTwo here-string (catches unhandled errors with line numbers, logs to `C:\Blurry3\logs\blurry3.log`).
- `Step "name" { body }` per-section helper added (defined after the trap). Use this to wrap risky cmdlets like `Get-WindowsCapability` so one section's failure doesn't kill subsequent ones.
- RunOnce launches StepTwo with `-NoExit` (in both arming sites: main script + StepOne).

**Open path: Path B — verbatim fr33thy rewrite.** User's pointed criticism: "you should've just copied fr33thy and changed the stuff I told you to change." My current Blurry3 StepTwo is ~450 custom lines, not fr33thy's verbatim ~3,800. Replacing it with fr33thy's StepTwo and applying ONLY the user's 6 specified changes (Chrome→Brave, Xbox trio kept, NVIDIA install, Steam/Discord/Valorant/Logi installs, skip EnableTiledDisplay=0, restore point + log) would be a much more reliable baseline. **Do this if Pause+trap fixes don't resolve the issue.**

## Run instructions (for future-Claude to advise the user)

- **Always use the .bat, never the .ps1 directly.** Right-click `Blurry3.bat` (or `Blurry4.bat`) → **Run as administrator**.
- Both .bat files now pass `-NoExit` to powershell.exe and have `pause >nul` at the end so the cmd window stays open after the .ps1 finishes/crashes.
- If the script closes instantly, debug command:
  ```
  powershell -NoExit -NoProfile -ExecutionPolicy Bypass -File "F:\Blurry WIndows TOol\Blurry3\Blurry3.ps1"
  ```
- Log lives at `C:\Blurry3\logs\blurry3.log` (or `C:\Blurry4\logs\blurry4.log`). Persists across reboots.

## Memory file mirror (in case C:\ memory is gone)

The C:\ memory system at `C:\Users\blurry\.claude\projects\F--Blurry-WIndows-TOol\memory\` had these files, summarized here:

- `MEMORY.md` — index of the others
- `user_blurry3.md` — covered above in "User & hardware"
- `user_hardware.md` — covered above
- `project_blurry_tool.md` — covered above (4 iterations: BlurryTool / Blurry2 / Blurry3 / Blurry4)
- `feedback_600hz_veto.md` — `EnableTiledDisplay = 0` is hardcoded forbidden, see "Hardcoded vetoes" above
- `feedback_never_tweaks.md` — see "Hardcoded vetoes" + "Blurry3 NEVER list" above
- `feedback_save_context.md` — rule: append changelog to `_CLAUDE_NOTES.md` after every Blurry*.ps1 edit
- `feedback_nvidia_picker.md` — driver auto-DL via API (no picker), NVPI uses fr33thy verbatim .nip (no picker either)
- `feedback_blurry4_aggressive.md` — Blurry4 has a SHORTER NEVER list than Blurry3 (flips nx AlwaysOff, smartscreen/mcupdate rename, services off, Tdr=0)
- `reference_nvidia_api.md` — covered above in "NVIDIA driver lookup"
- `reference_source_materials.md` — covered above in "Source materials"
- `reference_winsux_source.md` — covered above (path on F:\, fr33thy DDU + flow ground truth)

## Rules for future-Claude

1. **At start of every session**: read this file FIRST, then `Blurry3/_CLAUDE_NOTES.md` and `Blurry4/_CLAUDE_NOTES.md` for the changelog.
2. **After every edit to `Blurry3.ps1` or `Blurry4.ps1`**: append a dated changelog entry to that project's `_CLAUDE_NOTES.md` BEFORE ending your turn. Hard requirement, not optional.
3. **Never apply the hardcoded vetoes** (the 7 items in "Hardcoded vetoes" section). The 600Hz veto especially.
4. **When user references a guide by name** (TweakingGuy / fr33thy / Calypto / BoringBoom / BOHR), look up its path in "Source materials" above.
5. **When user reports a bug**: don't unilaterally rewrite — check whether the issue is in code I rewrote vs code from a known-good guide. If from rewrite, prefer reverting to verbatim source.
6. **Use the .bat to launch**, never tell the user to run `.ps1` directly.
