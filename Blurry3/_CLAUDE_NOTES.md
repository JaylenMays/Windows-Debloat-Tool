# Claude session notes — Blurry3

This file is the cross-session log for Claude. Read it FIRST when entering this project. It complements the memory system at `C:\Users\blurry\.claude\projects\F--Blurry-WIndows-TOol\memory\` (which is auto-loaded). This file is the human-readable changelog that survives Windows reinstalls (since it lives on F:\).

**Rule for Claude:** every time you edit `Blurry3.ps1`, append a dated entry to the "Change log" section below before ending your turn. Don't skip it. The user explicitly asked for this so context survives the reboot/reinstall cycle.

---

## Project at a glance

User: blurry3. Personal Win11 11 fresh-install debloat tool. Hardware: RTX 4090, **600Hz monitor (load-bearing)**, NA region. Three iterations exist (BlurryTool / Blurry2 / Blurry3) — **Blurry3 is the active one**. Single-file orchestrator (`Blurry3.ps1`) with StepOne and StepTwo as embedded here-strings. Cloned from fr33thy WinSux at `F:\ISO&Debloat\New folder\WinSux-Windows-Optimization-Guide-main\Files\WinSux.ps1`.

## Hardcoded constraints

- **`EnableTiledDisplay = 0` is forbidden** anywhere in this project. Caps the 600Hz monitor to 360Hz. There's a literal veto comment in the NVIDIA reg-tweak block.
- The NEVER-tweaks list (smartscreen rename, mcupdate rename, Spooler/PnP/Lanman/IKEEXT off, `nx AlwaysOff`, etc.) — see `feedback_never_tweaks.md` in memory.
- **NVIDIA install uses a Windows file picker** (OpenFileDialog), NOT API auto-download or folder-regex auto-detect. User explicitly chose this — see `feedback_nvidia_picker.md` in memory.

## Current flow (matches fr33thy WinSux)

1. **Main, normal boot** — pre-reqs (7-Zip / VC++ / DDU stage / Brave / DirectX), build StepOne+StepTwo, arm Userinit→StepOne, arm RunOnce→StepTwo, `bcdedit /set safeboot minimal`, `shutdown -r -t 00`.
2. **StepOne, safe boot** — restore Userinit, Defender disable via TrustedInstaller, UAC off, clear safeboot, DDU `-CleanAllGpus -Restart`.
3. **StepTwo, normal boot** — RunOnce fires it. AppX allowlist (Xbox trio kept), capabilities/features allowlist, OneDrive uninstall, Edge/Copilot/Cortana/Recall off, telemetry off, Game Bar neuter, Explorer classic, power/perf/mouse, NVMe flags on, NIC bindings, scheduled-task kills, RunOnce wipe, WU pause 365d, **NVIDIA file picker → install → registry tweaks → NVPI import**, Steam/Discord/Valorant/Logi OMM, cleanup.

DDU settings: byte-for-byte identical to fr33thy WinSux.ps1 lines 108–145. Verified with grep.

---

## Change log

When you make any edit to `Blurry3.ps1`, add a new entry at the **top** of this list with date, summary, and reason. Format:

```
### YYYY-MM-DD — short summary
- Bullet of what changed (file:line if relevant)
- Why it changed (user feedback, bug, fr33thy alignment, etc.)
```

### 2026-04-26 — NVIDIA driver: add file-picker as 3rd-tier fallback

- **NVIDIA driver section** (StepTwo): chained the three sources. Order is now: (1) API auto-download via GFW manifest, (2) regex-match latest `.exe` under `F:\etc\Everything\blurry op\Install\`, (3) `OpenFileDialog` picker if both fail. Cancelling the picker logs FAIL and skips the NV install (rest of StepTwo continues).
- Picker default-dir cascade: `F:\etc\Everything\blurry op\Install\` → `F:\` → `C:\`.
- Picked path is used directly for 7-Zip extraction (no copy-to-Temp step), since `$nvInstaller` is just a path consumed by `7z.exe x`.
- User asked for this so a fresh install never ends up driverless if NVIDIA's API IDs rotate AND the local-fallback folder is empty.

### 2026-04-26 — NVIDIA driver back to auto-download; NVPI uses fr33thy's full .nip

- **NVIDIA driver section** (StepTwo): reverted to API auto-download via NVIDIA's GFW manifest (psid=129/pfid=976/osID=135) with local fallback under `F:\etc\Everything\blurry op\Install\*.exe`. User clarified the picker was meant for the NVPI profile, not the driver.
- **NVPI section** (StepTwo): no picker. Imports fr33thy's full .nip directly. The .nip is staged in main as `$env:SystemRoot\Temp\fr33thy.nip` from a here-string.
- **Main script**: re-added the NVPI .nip staging block, but now contains fr33thy's **complete** profile (verbatim from `WinSux.ps1` lines 3055–3251 — 30 settings: GSYNC suite, Ultra Low Latency, VSync, AA, AF, texture filtering, CUDA P2 state, Power Mgmt = Prefer-Max, Shader Cache unlimited, Threaded Opt, OpenGL prefs). Replaces the stripped-down 6-setting version.
- **Cleanup list**: re-added `nvidia.exe` (driver auto-download writes there again) and added `fr33thy.nip` (the staged profile file).
- NVPI command-line: `-silentImport -silent <path>` (matches fr33thy WinSux line 3255 — adds the `-silent` flag I had been missing).
- Memory: `feedback_nvidia_picker.md` is now stale — picker target is profile, not driver. Will reconcile next pass.

### 2026-04-26 — Cross-reference: BlurryFr33thyVerbatim added as fallback

A 5th project variant now exists at `F:\Blurry WIndows TOol\BlurryFr33thyVerbatim\`. It's fr33thy's `WinSux.ps1` byte-for-byte (4204 lines) plus only the 6 user-specified changes (Brave / Xbox trio / NVIDIA auto-DL / Steam-Discord-Valorant-Logi / 600Hz veto N/A / restore + log). Use as fallback if Blurry3 keeps silent-crashing from my custom-slim StepTwo (which is the suspected bug source — the user explicitly said *"you should've just copied fr33thy and changed the stuff I told you to change"*).

This Blurry3 folder still has the trap+pause+`-NoExit` diagnostic fixes from the previous changelog entry, so the next test run should at least surface the actual error. If the error is inside Blurry3's StepTwo content (AppX / capabilities / services / etc.), recommend the user switch to BlurryFr33thyVerbatim for that test — same fr33thy spine but with their requested additions.

### 2026-04-26 — StepTwo robustness pass (closes-silently fix)

User reported: "ran Blurry3, AppX worked, then closed — no error." Root cause: StepTwo had no Pause at end and no -NoExit on the RunOnce launch, so on success (or silent crash) the window just disappeared. User couldn't tell whether it crashed or completed.

Three layered fixes:
- **`Pause` at end of StepTwo** (just before the closing `'@` of the StepTwo here-string). Now displays "Blurry 3 complete... Press any key to close." and waits for keypress before exit. Even on full success the window survives.
- **Trap block at top of StepTwo here-string**, mirroring the main script's trap. Catches any unhandled error, prints red with line number, logs `[FAIL] UNHANDLED:` to `C:\Blurry3\logs\blurry3.log`, then pauses for keypress. Uses `continue` so the trap returns control rather than terminating.
- **Per-section helper `Step "name" { body }`** added (defined right after the trap). Wraps a script block in try/catch, logs FAIL on exception, prints "(continuing anyway)". Sections that haven't been migrated to this helper yet still benefit from the trap.
- **RunOnce launch updated to `-NoExit`** in both places that arm it (main script line 327, and StepOne's RunOnce arming inside the StepOne here-string). Belt-and-suspenders against any path that bypasses the trap.

**User's broader concern acknowledged:** I should have pasted fr33thy's verbatim StepTwo (~3,800 lines) and only made the 6 specific changes (Chrome→Brave, Xbox trio kept, NVIDIA install, Steam/Discord/Valorant/Logi, EnableTiledDisplay skip, restore point + log). Instead I wrote a ~450-line custom StepTwo, which means missing pieces become silent crashes on user's real hardware. This is the next big rewrite if the trap+pause fixes don't surface what was actually crashing.

Path B (verbatim fr33thy rewrite) is on the table for next session if needed.

### 2026-04-26 — Crash trap + -NoExit on self-elevation (diagnostic)

User reported "running Blurry3 PowerShell and it closes instantly". `C:\Blurry3\logs\` didn't exist → script never reached line 30 (log folder creation). Likely cause: self-elevation block fires `Start-Process -Verb RunAs` then `Exit`s; if UAC was previously disabled by an earlier run, the elevated window never opens, so visually it just "vanishes."

- Added a `trap { }` block at top of Blurry3.ps1 (and Blurry4.ps1) that catches any unhandled error, prints it red with line number + script path, and pauses for keypress before exit. So future silent crashes become visible.
- Self-elevation `Start-Process` now passes `-NoExit` to the spawned admin window so it stays open if the script errors before its own trap fires.
- Diagnostic command for the user: open an admin PowerShell manually and run `& "F:\Blurry WIndows TOol\Blurry3\Blurry3.ps1"` (or use `-NoExit` from cmd).

### 2026-04-26 — initial fix pass + fr33thy-faithful flow + cleanup tidy

- **Userinit hijack** (Blurry3.ps1 line ~812): reverted to fr33thy's powershell-only format (no `userinit.exe,` prefix). Works because it fires in safe mode where Win11 skips the "Please wait" splash. The earlier auto-fix that prepended userinit.exe was a symptom-patch — root cause was missing safeboot.
- **Removed redundant DDU at end of main** and replaced with `shutdown -r -t 00`. Matches fr33thy WinSux.ps1 line 4204. DDU now runs exactly once, in safe mode inside StepOne — same as fr33thy.
- **Added in main**: `bcdedit /set {current} safeboot minimal` and HKLM RunOnce arming for StepTwo (mirrors WinSux lines 4192/4199).
- **NVIDIA install** (line ~668): replaced API auto-download + `F:\etc\Everything\blurry op\Install` regex fallback with `System.Windows.Forms.OpenFileDialog`. Default initial dir tries `F:\etc\Everything\blurry op\Install` → `F:\` → `C:\`. If user cancels, log WARN and skip — NO automatic fallback.
- **NVIDIA setup args** (line ~702): removed `-passive` (was conflicting with `-s`). Now: `-s -noreboot -noeula -clean`. Added a `Test-Path setup.exe` guard before the install call.
- **AppX kill list** (line ~410): removed `*Microsoft.Winget.Source*` from the "extras to strip" foreach. Removing it was breaking the later winget install of NVIDIA Control Panel.
- **Disable-ScheduledTask** (line ~632): rewrote the loop to append `\` to TaskPath after `Split-Path` (Task Scheduler requires it). Was throwing red errors on every entry.
- **Cleanup** (line ~783): removed `Chrome.msi` (Blurry3 uses Brave, never created), removed `nvidia.exe` (file picker uses arbitrary user-picked path), added `Blurry3-LowLatency.nip` (was leaking after NVPI import).

**State after this pass:** ready to retest from a fresh Windows install. The "Please wait" hang should be fixed by the safeboot+Userinit pair. NVIDIA install will pop a file picker in StepTwo (post-DDU, normal mode). Red errors from the Disable-ScheduledTask loop are gone. Logs land at `C:\Blurry3\logs\blurry3.log`.

**To verify next test:**
- Reboot 1 (after main): should land in safe mode, not normal mode.
- Black/blue safe-mode background visible during StepOne.
- Reboot 2 (after StepOne): should land in normal mode.
- File picker should pop during StepTwo for NVIDIA driver.
- Final "Blurry 3 complete." message in console + log.
