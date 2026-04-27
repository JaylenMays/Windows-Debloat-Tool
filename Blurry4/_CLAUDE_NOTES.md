# Claude session notes — Blurry4

This file is the cross-session log for Claude. Read it FIRST when entering this project. It complements the memory system at `C:\Users\blurry\.claude\projects\F--Blurry-WIndows-TOol\memory\` (which is auto-loaded). The Blurry3 notes file (`Blurry3/_CLAUDE_NOTES.md`) covers the base 3-stage flow; this file covers Blurry4-specific additions.

**Rule for Claude:** every time you edit `Blurry4.ps1`, append a dated entry to the "Change log" section below before ending your turn.

---

## Project at a glance — Blurry4

Blurry4 = Blurry3 (fr33thy WinSux clone with all its additions) **PLUS** a 4-option menu at the end of StepTwo:

```
  1) DEBLOAT   [done]   the fr33thy 3-stage flow + Brave/Steam/Discord/Valorant/Logi (just ran)
  2) TWEAK     [opt-in] ALL guide content -- TweakingGuy AIO + Calypto + BoringBoom + BOHR
  3) CLEAN     [opt-in] deep refresh -- caches, DriverStore, EventLog, DISM, AppX re-strip
  4) EXTRAS    [opt-in] my personal add-ons NOT in any guide -- mouse hover, app-kill timeouts
```

User enters space-separated picks (e.g. `2 3 4`). N or empty = skip all and finish.

**TWEAK content (the guides, in order they apply):**
- TweakingGuy AIO (steps 1-19) — verbatim from the user's pasted batch + SmoothMode.bat appendix. Hardware-auto-detected (CPU/GPU/RAM/HDD).
- **Calypto Latency Guide** — mouse/kbd queue size = 50, `HidUsb\MaximumPortsServiced = 3`, `DisablePagingExecutive = 1`, `LargeSystemCache = 0`, USB selective-suspend off per device + power plan, IFEO `CpuPriorityClass = 3` for VALORANT.
- **BoringBoom** — imports `F:\etc\Everything\blurry op\Nvidia\Low Latency Ultra.nip` on top of fr33thy.nip via NVPI silentImport (layered, no conflict).
- **BOHR V13 power plan** — `powercfg /import F:\blurry win2026\BOHRV13.pow` + setactive. Replaces TG's Ultimate Performance.

**EXTRAS content (only my add-ons):**
- Mouse hover instant + cursor feel: `MouseHoverTime/Width/Height = 1`, `MouseTrails = 0`, `CursorBlinkRate = 530`.
- App-kill / hung-app timeouts: `ForegroundLockTimeout / FlashCount = 0`, `WaitToKillAppTimeout / HungAppTimeout / LowLevelHooksTimeout / AutoEndTasks`, `WaitToKillServiceTimeout`.

**CLEAN content:** browser/Discord/NVIDIA/Steam/DirectX/thumb/icon caches, Temp, Prefetch, DISM `/StartComponentCleanup /ResetBase + /SPSuperseded`, DriverStore prune (newest .inf only), every Windows event log cleared, AppX re-strip, scheduled-task re-disable, Run/RunOnce wipe, DNS/ARP/NetBIOS flush, TRIM all fixed drives, Recycle Bin.

## Hardcoded vetoes (still applied in Blurry4 — would brick *user's specific hardware*)

These are kept on the NEVER list even in Blurry4 because they're physically destructive to the user's setup:

- `EnableTiledDisplay = 0` — caps the 600Hz monitor to 360Hz
- `RMHdcpKeyGlobZero = 1` — breaks HDR/DSC handshake on the 600Hz DSC-required panel
- `TCCSupported = 0` — irrelevant on consumer GPUs, only risk
- `NVDeviceSupportKFilter = 0` — display path risk
- `Acceleration.Level = 0` — can soft-cap display modes
- `TaskCache\Tree` wholesale wipe — kills NVIDIA/Steam/Discord scheduled tasks too
- `PlugPlay` (PnP) off — breaks USB hot-plug

## Items previously on Blurry3's NEVER list — now FLIPPED in Blurry4

User clarified pro tweakers (TweakingGuy for Demon1/YAY) apply these. They're security/recovery tradeoffs that Blurry3 was overcautious about:

- `bcdedit /set nx AlwaysOff` — DEP off (Defender already off, security trade is moot)
- Rename `smartscreen.exe` → `.exee` (belt-and-suspenders to reg-disable)
- Rename `mcupdate_GenuineIntel.dll` / `mcupdate_AuthenticAMD.dll` → `.dlll` (microcode runtime stability over patching)
- Disable `Spooler` (no printing on gaming PC)
- Disable `iphlpsvc` (IPv6 already off)
- Disable `IKEEXT` (no VPN required for NA Valorant)
- Disable `LanmanWorkstation` (no SMB shares on this gaming-only box)
- NVIDIA `Tdr* = 0` (consistency over recovery; pros take the BSOD risk)

## Smoothness science (the immediate desktop "feel" the user describes)

In rough order of perceptual impact:
1. Timer resolution at 0.5ms via scheduled task (`timeBeginPeriod(0)`) — the single biggest "feel" tweak. 30× more granular kernel scheduling than default 15.6ms.
2. Ultimate Performance power plan + cores unparked 100% + boost=Aggressive — CPU pegged at boost, no c-state ramp on input.
3. DWM thumbnail off + Aero Peek off + VisualFXSetting=3 — less compositor work per frame.
4. `MenuShowDelay=0` + `MouseHoverTime/Width/Height=1` — instant menus + instant hover detection.
5. Mouse accel off + 1:1 SmoothMouse curve + RawMouseThrottleEnabled=0 — 1:1 cursor.
6. `Win32PrioritySeparation = 0x2a` (6:1 foreground quantum favor).
7. HAGS (`HwSchMode = 2`).
8. NIC interrupt moderation off + Nagle's off + per-CPU DPCs.

---

## Change log

When you make any edit to `Blurry4.ps1`, add a new entry at the **top** of this list with date, summary, and reason.

### 2026-04-26 — Mirrored Blurry3's StepTwo robustness fixes into Blurry4

User noticed Blurry4 hadn't gotten the trap/pause/-NoExit fixes that were applied to Blurry3 after the "closes silently after AppX" report. Mirroring all three fixes into Blurry4's StepTwo here-string now:

- `trap { }` block at top of StepTwo (right after `L "StepTwo start." 'STAGE'`). Catches unhandled errors with line numbers, logs `[FAIL] UNHANDLED:` to `C:\Blurry4\logs\Blurry4.log`, pauses for keypress before exit. Uses `continue` so trap returns control rather than terminating.
- `Step "name" { body }` per-section helper added (defined right after the trap). Wraps risky cmdlets in try/catch with FAIL log + "(continuing anyway)" on exception.
- `Press any key to close this window` block added at end of StepTwo, just before the closing `'@`. Window stays open on full success.
- RunOnce launches StepTwo with `-NoExit` (replaced both arming sites: main script + StepOne's RunOnce arming).

Final size: 1669 lines. Parse OK.

### 2026-04-26 — Cross-reference: BlurryFr33thyVerbatim added as fallback

A 5th project variant now exists at `F:\Blurry WIndows TOol\BlurryFr33thyVerbatim\`. It's fr33thy verbatim + only the 6 user-specified changes. Created because Blurry3/4 both share the same custom slim StepTwo and that's where silent crashes have been coming from. **Blurry4's TWEAK/CLEAN/EXTRAS menu is NOT in BlurryFr33thyVerbatim** — those are Blurry4-specific. If user wants the menu structure, stick with Blurry4. If they just want a known-good fr33thy-faithful run, BlurryFr33thyVerbatim is the safer choice.

The robustness fixes from the previous Blurry3 entry (trap, pause, -NoExit on RunOnce) have NOT yet been mirrored into Blurry4 — apply them next session if Blurry4 testing reveals the same closes-silently issue.

### 2026-04-26 — Blurry3 hit "closes silently after AppX" — robustness pass

Applied to **Blurry3** (not yet to Blurry4 since user is testing Blurry3 first):
- StepTwo `Pause` at end (window stays open on success).
- StepTwo trap block at top (catches unhandled errors with line numbers, logs FAIL, pauses).
- Per-section `Step "name" { body }` helper to wrap risky cmdlets in try/catch.
- RunOnce launches StepTwo with `-NoExit` (in both arming sites: main script + StepOne's RunOnce arming).

**Apply same to Blurry4 once Blurry3 fix verified working.** Blurry4's StepTwo here-string is identical to Blurry3's at the structural level (same 19 sub-blocks before the menu), so the same trap/pause/Step-helper drop-in applies.

**User's structural concern acknowledged:** my custom ~450-line StepTwo (in both Blurry3 and Blurry4) is a deviation from fr33thy's ~3800-line verbatim StepTwo. Any silent crash on real hardware is from something I rewrote that fr33thy had handled. Path B = replace my StepTwo wholesale with fr33thy's verbatim and re-apply only the 6 specified user changes (Chrome→Brave, Xbox trio kept, NVIDIA install, Steam/Discord/Valorant/Logi installs, skip EnableTiledDisplay=0, restore point + persistent log). On the table for next session if needed.

### 2026-04-26 — Blurry4.bat: -NoExit + pause; README fully synced with current state

- **Blurry4.bat** updated: powershell call now passes `-NoExit` and the bat ends with `pause >nul` showing the powershell exit code. So even if the .ps1 errors before its trap fires, the cmd window stays open.
- **Blurry4/README.md** comprehensively updated to match the latest TWEAK/CLEAN/EXTRAS structure:
  - "Difference from Blurry3" table now lists Calypto / BoringBoom / BOHR rows + crash-trap row
  - Stripped the stale "4b. Mouse hover/cursor feel" line out of the TWEAK section (those moved to EXTRAS)
  - Added 15d (browser-updater file-strip) and 15e (USB XHCI MSI mode) sub-blocks to TWEAK part A description
  - "Why this works" smoothness science updated with USB suspend off (Calypto), Mouse/kbd data queue size (Calypto), NVPI Low-Latency-Ultra layering (BoringBoom)
  - New "Diagnostics" section with the "if it closes instantly" recovery instructions
- All Blurry4 files now timestamp-current and synced.

### 2026-04-26 — Crash trap + -NoExit on self-elevation (diagnostic, mirrored from Blurry3)

User reported both Blurry3 and Blurry4 closing instantly when run. Same diagnostic fix added to both:

- `trap { }` at top: catches any unhandled error, prints red with line number, pauses for keypress before exit.
- Self-elevation `Start-Process -Verb RunAs` now passes `-NoExit` so the spawned admin window stays open even if the script crashes before its trap fires.

### 2026-04-26 — Restructure: guides go in TWEAK, not EXTRAS

User clarified the mental model: TWEAK = ALL guide content (TG + Calypto + BOHR + BoringBoom + any other named guides). EXTRAS = ONLY my personal additions that aren't from any guide.

- **Moved Calypto block from EXTRAS to TWEAK** (after sub-block 19 SysMain, just before "(2) TWEAK complete." log).
- **Moved BOHR V13 power plan import from EXTRAS to TWEAK** (same insertion point).
- **Added BoringBoom .nip import to TWEAK** — imports `F:\etc\Everything\blurry op\Nvidia\Low Latency Ultra.nip` on top of the fr33thy.nip already loaded by the StepTwo NVPI step. NVPI's `-silentImport` only sets keys present in the .nip, so layering both works without conflict. Falls back to a WARN if the BoringBoom .nip or NVPI exe isn't present.
- **EXTRAS now contains ONLY**:
  - Mouse hover instant + cursor feel (`MouseHoverTime/Width/Height = 1`, `MouseTrails = 0`, `CursorBlinkRate`)
  - App-kill / hung-app timeouts (`ForegroundLockTimeout`, `ForegroundFlashCount`, `WaitToKillAppTimeout`, `HungAppTimeout`, `LowLevelHooksTimeout`, `AutoEndTasks`, `WaitToKillServiceTimeout`)
- These were always my additions, not from any named guide, so EXTRAS is the right home.

### 2026-04-26 — Calypto + BOHR added to EXTRAS

User pointed out I was only using TweakingGuy and ignoring the other guides referenced in `reference_source_materials.md`. Added the missing two:

- **Calypto Latency Guide** added to EXTRAS:
  - `mouclass\Parameters\MouseDataQueueSize = 50`
  - `kbdclass\Parameters\KeyboardDataQueueSize = 50`
  - `HidUsb\Parameters\MaximumPortsServiced = 3`
  - `Memory Management\DisablePagingExecutive = 1`, `LargeSystemCache = 0`
  - USB selective-suspend off per-device — iterates Win32_PnPEntity for `USB\VID*` and `USB\ROOT_HUB*`, sets `EnhancedPowerManagementEnabled / AllowIdleIrpInD3 / EnableSelectiveSuspend = 0` per device's `Enum` reg path
  - Power-plan USB selective-suspend off via `powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0`
  - IFEO `CpuPriorityClass = 3` (High) for `VALORANT.exe`, `VALORANT-Win64-Shipping.exe`, `RiotClientServices.exe`
- **BOHR V13 power plan** added to EXTRAS:
  - Imports `F:\blurry win2026\BOHRV13.pow` via `powercfg /import` if present, then `setactive` on the returned GUID
  - Replaces TWEAK's Ultimate Performance plan if user picks both 2 and 4
  - Falls back to a WARN (Ultimate Performance stays active) if the .pow isn't found

Reasoning per user's own `WHY_SMOOTH.md` analysis: USB power off + MSI mode + timer res are the three pillars of input-pipeline consistency. TWEAK already covers MSI mode + timer res; Calypto in EXTRAS covers USB power off + queue depth + IFEO pinning.

Per memory: BoringBoom's contribution (NVPI Low-Latency-Ultra) is already in TWEAK via the embedded fr33thy.nip — no separate EXTRAS block needed for it.

Parse OK after edits.

### 2026-04-26 — Final-stage menu refactor (TWEAK / CLEAN / EXTRAS), TG faithful pass

- **Replaced two sequential Y/N prompts with one 4-option menu** at end of StepTwo:
  ```
  1) DEBLOAT  [done]
  2) TWEAK    [opt-in] TG AIO verbatim
  3) CLEAN    [opt-in] deep refresh
  4) EXTRAS   [opt-in] Blurry4-only additions on top of TG
  ```
  User enters space-separated picks (e.g. `2 3 4`). Parsing: `$doTweak = $menuAns -match '\b2\b'` etc. N or empty = skip all.
- **Strict TG/EXTRAS separation**: anything in the user's pasted TG batch (including the SmoothMode.bat appendix) lives in TWEAK. Anything I added on top lives in EXTRAS.
- **Moved out of TWEAK into EXTRAS**:
  - `MouseHoverTime/Width/Height = 1`, `MouseTrails = 0`, `CursorBlinkRate = 530`
  - `ForegroundLockTimeout`, `ForegroundFlashCount`, `WaitToKillAppTimeout`, `HungAppTimeout`, `LowLevelHooksTimeout`, `AutoEndTasks`, `WaitToKillServiceTimeout`
  These are not in TG and were my desktop-snappiness additions.
- **Added to TWEAK to be more faithful to TG** (these WERE in TG but I'd missed):
  - `15d`: browser-updater file-level strip (kill `MozillaMaintenance`/`gupdate`/`brave` services + delete `maintenanceservice.exe`/`updater.exe`/`chrmstp.exe`/`Update` folders + Opera/Active Setup reg deletes)
  - `15e`: MSI mode for USB XHCI controllers (TG SmoothMode appendix)
- Hardcoded vetoes still applied (would brick user's hardware): `EnableTiledDisplay`, `RMHdcpKeyGlobZero`, `TCCSupported`, `NVDeviceSupportKFilter`, `Acceleration.Level`, `TaskCache\Tree` wholesale wipe, `PlugPlay` off.
- Parse OK: 1569 lines.

### 2026-04-26 — Initial Blurry4 build

- **Forked from Blurry3** at the post-fr33thy-faithful state. All Blurry3 tweaks intact.
- **Renames done**: `Blurry 3` → `Blurry 4`, `Blurry3` → `Blurry4`, `BlurryStepTwo` → `Blurry4StepTwo`. Log path is now `C:\Blurry4\logs\blurry4.log`.
- **Added TG step** at the end of StepTwo (before cleanup). Y/N prompt. Hardware auto-detection (Win32_Processor, Win32_VideoController, Win32_ComputerSystem, Get-PhysicalDisk). Then 19 sub-blocks of TweakingGuy AIO tweaks translated from batch to PowerShell.
- **TG sub-blocks 15b/15c/15d added (Blurry4-aggressive)**:
  - `15b`: `bcdedit /set nx AlwaysOff` + rename smartscreen + rename mcupdate + NVIDIA Tdr* = 0
  - `15c`: scheduled task `BlurryTimerResolution` at logon, runs `timeBeginPeriod(0)` for 0.5ms kernel timer
  - Service trim now includes Spooler/iphlpsvc/IKEEXT/LanmanWorkstation (PnP still excluded)
- **TG sub-block 4 expanded**: Ultimate Performance power plan duplicated + activated, cores at 100% min/max, boost=Aggressive (PERFBOOSTMODE=2). This is the second-biggest "snappy desktop" lever after timer res.
- **TG sub-block 4b added**: mouse hover (`MouseHoverTime/Width/Height = 1`), `MouseTrails = 0`, `ForegroundLockTimeout = 0`, `WaitToKillAppTimeout`, `HungAppTimeout`, `LowLevelHooksTimeout`, `WaitToKillServiceTimeout` trimmed.
- **Hardcoded vetoes remain**: NVIDIA `EnableTiledDisplay`, `RMHdcpKeyGlobZero`, `TCCSupported`, `NVDeviceSupportKFilter`, `Acceleration.Level`. Plus `TaskCache\Tree` wholesale wipe and `PlugPlay` off. These would physically brick the user's 600Hz monitor / display path / USB hot-plug.
- **Added Clean step** as second Y/N prompt after TG. Targets:
  - Caches (Brave/Chrome/Edge/Firefox/Discord/NVIDIA/AMD/Steam/DirectX/Windows thumb+icon)
  - Temp (`%TEMP%`, `Windows\Temp`, `Prefetch`)
  - DISM `/StartComponentCleanup /ResetBase` + `/SPSuperseded`
  - DriverStore prune (parses `pnputil /enum-drivers`, keeps newest of each `.inf`, `/delete-driver /uninstall /force` the rest)
  - Every Windows event log cleared via `wevtutil`
  - AppX re-strip (Teams/Outlook/XboxOverlay/BingNews/etc.)
  - Scheduled-task re-disable
  - Run/RunOnce wipe + Startup folders empty
  - DNS/ARP/NetBIOS cache flush
  - `Optimize-Volume -ReTrim` on every fixed drive
  - Empty Recycle Bin
- **Parse OK**: 1544 lines, 114 KB.
- **Memory updated**: `feedback_blurry4_aggressive.md` (new) documents the Blurry4-specific NEVER list (shorter than Blurry3's).
