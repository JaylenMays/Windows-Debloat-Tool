# Blurry 2

Talon-style debloat + gaming-latency tool. Single-folder, runs from external drive, installs scheduled tasks for weekly + onlogon "fresh-restore" cleaning so Windows doesn't decay back to feeling bloated after a week.

## Run

1. Plug in the external drive.
2. From `Blurry2\`: right-click `Blurry.bat` → **Run as administrator** (or just double-click; auto-elevates).
3. Pick a menu option.

## Modes (TUI menu)

| # | Mode | What it does | Time | Reboots |
|---|---|---|---|---|
| 1 | Full setup | Debloat + tweaks + apps + driver. End-to-end. | ~30 min | 2 |
| 2 | Clean | Re-apply tweaks + wipe caches + clear EventLog + DISM cleanup + DriverStore prune. The "fresh feel" restore. | ~3 min | 0 |
| 3 | Apps only | (Re)install Brave/Steam/Discord/Riot/Logitech OMM/HWiNFO/CPU-Z/etc. | ~5 min | 0 |
| 4 | Tweaks only | Re-apply registry + BCD + network + USB + power + timer. | ~30 sec | 1 (BCD) |
| 5 | Driver only | DDU pass + latest NVIDIA + NVPI Low Latency Ultra import. | ~15 min | 2 |
| 6 | Schedule | Install BlurryClean-Login + BlurryClean-Weekly tasks. | ~2 sec | 0 |
| 7 | Dry run | Log only, no changes. | ~10 sec | 0 |
| 8 | Advanced | Opt-in aggressive toggles: full Defender disable, Spooler off, PnP off, `nx AlwaysOff`, wipe Run keys, black wallpaper, pause-WU-forever, etc. | varies | varies |

## CLI args (for scheduled tasks / scripted use)

```
.\Blurry.ps1 -Mode Full
.\Blurry.ps1 -Mode Clean -Quiet
.\Blurry.ps1 -Mode Apps
.\Blurry.ps1 -Mode Tweaks
.\Blurry.ps1 -Mode Driver
.\Blurry.ps1 -Mode Schedule
.\Blurry.ps1 -Mode DryRun
```

## Layout

```
Blurry2\
├── Blurry.bat                  admin-elevation launcher
├── Blurry.ps1                  main orchestrator + TUI
├── README.md
├── modules\
│   ├── 01-Preflight.ps1        admin/internet/restore-point + self-install to C:\Blurry
│   ├── 02-Strip.ps1            AppX (WinSux allowlist + Xbox keep) + Edge/OneDrive/Copilot
│   ├── 03-Tweak.ps1            registry + BCD + network + USB (Calypto MSI) + services + power + timer
│   ├── 04-Defender.ps1         exclusions (full-disable in Advanced)
│   ├── 05-Apps.ps1             Brave/Steam/Discord/Riot/Logitech OMM/tools + per-app debloat
│   ├── 06-Drivers.ps1          latest NVIDIA download + DDU + NVCleanstall + NVPI .nip import
│   ├── 07-Affinity.ps1         IFEO P-core pin + WMI watcher for game spawns
│   ├── 08-Clean.ps1            the fresh-restore feature (caches/temp/DISM/DriverStore/events)
│   ├── 09-Schedule.ps1         install/uninstall scheduled tasks
│   └── 10-Advanced.ps1         opt-in aggressive sub-menu
├── payload\                    .nip / NVPI / DDU settings (auto-staged from F:\)
└── logs\blurry.log
```

## What gets installed where

| Install | Path |
|---|---|
| Tool itself | `C:\Blurry\` (so scheduled tasks have a stable path) |
| Downloads | `C:\Blurry\downloads\` |
| Logs | `Blurry2\logs\blurry.log` (or `C:\Blurry\logs\` after self-install) |
| State (resume marker) | `C:\Blurry\state.json` |

Source folder on F:\ is never modified — the Full run copies itself to `C:\Blurry\` before reboots.

## What's deduped from your sources

| Source | Status |
|---|---|
| TweakingGuy AIO (your verbatim) | merged |
| `blurry.bat` (2,878 lines) | merged |
| `540hz.bat` | **highest precedence** — vetoes anything that would set `EnableTiledDisplay = 0` |
| Calypto Latency Guide | USB MSI, mouse/kbd queue size, P-core affinity added |
| BoringBoom | NVPI .nip import as a phase |
| WinSux `WinSux.ps1` | DL/7Z/C++/DDU/Chrome pattern, WU driver block, password sign-in |
| WinSux `stepone.ps1` | DDU safe-boot pass (used wholesale for Driver mode) |
| WinSux `steptwo.ps1` | AppX allowlist, capability/feature allowlist, NIC PnPCapabilities=24 |
| `Blurrysmooth.bat` / `add-smoothness-safe.cmd` | merged |

Things explicitly **not** mirrored from sources (live behind the Advanced menu only):
- Renaming `smartscreen.exe` / `mcupdate_*.dll` (breaks Defender + microcode updates)
- `bcdedit /set nx AlwaysOff` (DEP off)
- Disabling PnP (breaks USB)
- Disabling Spooler (no printing)
- Disabling IP Helper / Lanman / IKEEXT
- Wholesale wipe of `TaskCache\Tree`
- Setting wallpaper to black
- Pausing Windows Updates indefinitely (`PauseUpdatesEndTime` year-3000 trick)
- Full Defender disable

## The "fresh feel" / Clean mode

After a Windows install, things degrade because:
- `WinSxS` and `DriverStore\FileRepository` grow (every Win Update + driver install)
- Search index DB bloats
- Browser / Discord / NVIDIA / Steam shader caches accumulate (often 5-10 GB combined)
- Bloat AppX returns via Microsoft updates
- Disabled scheduled tasks get re-armed
- New Run/RunOnce entries appear (apps re-add themselves)

Mode 2 (Clean) handles all of it. Runs in ~3 minutes. No reboot.

Tasks installed by mode 6:
- `BlurryClean-Login` — runs on every login (silent, ~3 min)
- `BlurryClean-Weekly` — runs Sunday 04:00

## Safe to re-run anytime

Every tweak is idempotent (reg writes overwrite cleanly, services already-disabled don't error). You can run Mode 4 (Tweaks) any time to recover from a Win Update flipping things back.

## Reverting

- System restore: `rstrui.exe` → pick "Blurry 2 - pre-tweak" point.
- Specific reg keys: see `logs\blurry.log` for every key written.
- Scheduled tasks: `Mode 8` → `[B] Uninstall scheduled tasks`.
- Power plan: `powercfg -setactive SCHEME_BALANCED`.
- BCD: `bcdedit /deletevalue <name>` per setting.

## Known gotchas

- The Riot Client URL may need updating if Riot rotates the CDN path. Falls back gracefully.
- NVIDIA driver lookup uses GFW's manifest API; if that endpoint changes, falls back to the local files in `F:\etc\Everything\blurry op\Nvidia\`.
- Logitech OMM has a versioned URL that may 404 over time — the URL in `05-Apps.ps1` is easy to bump.
- The P-core affinity heuristic assumes the first 16 logical processors are P-cores on hybrid CPUs. Override the count in `07-Affinity.ps1` if you have a 13900K/14900K with more.
