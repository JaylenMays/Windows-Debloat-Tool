# Blurry Windows Debloat Tool 4

Builds on Blurry3 (fr33thy WinSux clone with Brave/Xbox-kept/600Hz veto). At the end of StepTwo, a **4-option menu** lets you opt into TWEAK, CLEAN, and/or EXTRAS:

```
  ================================================================
  Blurry 4 -- Final-stage menu
  ================================================================
    1) DEBLOAT   [done]   fr33thy 3-stage debloat + Brave/Steam/Discord/etc.
    2) TWEAK     [opt-in] TweakingGuy AIO tweaks (verbatim, hardware-detected)
    3) CLEAN     [opt-in] Deep refresh -- caches/DriverStore/AppX/EventLog/DISM
    4) EXTRAS    [opt-in] Blurry4 additions on top of TG (mouse hover, app-kill timeouts)
  ================================================================
  Pick space-separated (e.g. '2 3 4' for all three). N or empty to skip.
```

Run via `Blurry4.bat` (auto-elevates).

**TWEAK** = ALL guide content (TweakingGuy AIO + Calypto Latency Guide + BoringBoom NVPI layer + BOHR V13 power plan). Filtered only for the 7 hardcoded vetoes that would brick this specific 600Hz / NVIDIA setup. **EXTRAS** = personal additions NOT in any guide (mouse hover instant + app-kill timeouts).

## Difference from Blurry3

| Aspect | Blurry3 | Blurry4 |
|---|---|---|
| 3-stage flow (Main → SafeBoot/DDU → StepTwo) | yes | yes (identical) |
| AppX allowlist + Xbox-app-kept | yes | yes |
| 600Hz `EnableTiledDisplay` veto | yes | yes (still hardcoded) |
| NVIDIA driver + NVPI auto | yes | yes |
| Steam/Discord/Valorant/Logi installs | yes | yes |
| **TweakingGuy AIO** (verbatim) | no | **yes (TWEAK menu)** |
| **Calypto Latency Guide** (mouse/kbd queue, USB suspend off, IFEO Valorant) | no | **yes (TWEAK menu)** |
| **BoringBoom NVPI layer** (Low Latency Ultra .nip on top of fr33thy.nip) | no | **yes (TWEAK menu)** |
| **BOHR V13 power plan** (`F:\blurry win2026\BOHRV13.pow`) | no | **yes (TWEAK menu)** |
| **Deep Clean** (fresh-feel refresh) | no | **yes (CLEAN menu)** |
| **Mouse hover + app-kill timeouts** (my add-ons) | no | **yes (EXTRAS menu)** |
| Timer-resolution-at-logon scheduled task | no | yes (in TWEAK / SmoothMode appendix) |
| Ultimate Performance power plan + cores unparked | no | yes (in TWEAK; BOHR overrides if picked) |
| Aggressive service trim (Spooler/iphlpsvc/IKEEXT/Lanman off) | no | yes (in TWEAK) |
| `bcdedit /set nx AlwaysOff` | no | yes (in TWEAK) |
| Rename smartscreen.exe + mcupdate_*.dll | no | yes (in TWEAK) |
| `Tdr* = 0` (NVIDIA TDR off) | no | yes (in TWEAK) |
| Crash trap + `-NoExit` on self-elevation (diagnostic) | no | yes |

## Hardcoded vetoes (still NEVER applied even in Blurry4)

These would brick the user's specific hardware:

- `EnableTiledDisplay = 0` — caps 600Hz monitor to 360Hz
- `RMHdcpKeyGlobZero = 1` — breaks HDR/DSC handshake on 600Hz panel
- `TCCSupported = 0` — irrelevant on consumer GPUs, only risk
- `NVDeviceSupportKFilter = 0` — display path risk
- `Acceleration.Level = 0` — can soft-cap display modes
- `TaskCache\Tree` wholesale wipe — destroys legit Steam/NVIDIA/etc tasks
- `PlugPlay` (PnP) off — breaks USB hot-plug

Everything else from TweakingGuy's AIO is applied.

## Run

1. Right-click `Blurry4.bat` → **Run as administrator**.
2. Walk away. Two automatic reboots (into safe mode for DDU, back to normal for StepTwo).
3. After all the standard StepTwo work finishes (AppX/Edge/NVIDIA/apps), you'll see the 4-option menu. Enter your selection space-separated (e.g. `2 3 4` for TWEAK + CLEAN + EXTRAS).
4. Final reboot recommended after StepTwo completes.

## What TWEAK (option 2) does

Hardware auto-detection (CPU vendor, GPU vendor, RAM size, HDD presence) drives the branches. TWEAK runs all four guides in this order:

**A. TweakingGuy AIO** (verbatim from your pasted batch + SmoothMode.bat appendix):

1. Rebuild perf counters + PowerShell ExecutionPolicy
2. Browser updaters disabled (Chrome / Brave / Opera GX) + HW accel off
3. Multimedia "Games" profile (Affinity/Clock/GPU Priority/Priority/Scheduling/SFIO) + `Win32PrioritySeparation = 0x2a` + HAGS on + visual-effects perf + `MultiTaskingAltTabFilter` + Aero peek off
4. Misc: `net accounts`, DISM `Set-ReservedStorageState Disabled`, bcdedit description, `fsutil disable8dot3 / disablelastaccess`, **Ultimate Performance power plan + cores unparked at 100% + boost=Aggressive**
5. bcdedit timer/clock/MSI/x2apic + `tscsyncpolicy Enhanced` + `hypervisorlaunchtype off` + `isolatedcontext No` (NX kept OptIn here; AlwaysOff comes later in 15b)
6. VALORANT QoS DSCP 46
7. Game Bar / GameDVR full neuter
8. Latency Tolerance reg block (DXGKrnl, Power, GraphicsDrivers\Power)
9. ResourcePolicyStore CPU caps + Importance priorities + IO/Memory NoCap
10. WMI Autologger off + csrss priority class 4
11. NetBIOS off on every IP-enabled NIC (via WMI)
12. Network resets + comprehensive netsh TCP/IP tuning (autotuning/ECN/RSC/timestamps/initialRto/maxsynretransmissions/etc.) + IPv6/ISATAP/Teredo off + MTU 1500 on all up adapters
13. TCP/IP registry (TTL/Tcp1323Opts/MaxDupAcks/SackOpts/MaxUserPort/TcpTimedWaitDelay/Local-Hosts-Dns-Netbt priorities/Sock address size) + Nagle's off (`TcpAckFrequency=1` / `TCPNoDelay=1`) + Delivery Optimization off + LanmanServer params
14. Per-NIC tweaks (every `{4d36e972-...}\NNNN`): power savings off, EEE off, RSS on with 4 queues, flow control off, interrupt moderation off, all offloads off, jumbo=1514, buffers 512/4096
15. Service trim — adds `Spooler / iphlpsvc / IKEEXT / LanmanWorkstation` to the kill set (gaming-only PC has no printing/SMB/IPSec needs). PnP still excluded (USB hot-plug).
15b. **Aggressive extras: `bcdedit /set nx AlwaysOff` + rename `smartscreen.exe` → `.exee` + rename `mcupdate_GenuineIntel.dll` / `mcupdate_AuthenticAMD.dll` → `.dlll` + NVIDIA `Tdr* = 0`**
15c. **Timer-resolution scheduled task** at every logon (`timeBeginPeriod(0)` → 0.5ms kernel timer — from SmoothMode.bat appendix)
15d. Browser-updater file-strip (`MozillaMaintenance` / `gupdate` / `brave` services + delete `maintenanceservice.exe`/`updater.exe`/`chrmstp.exe`/Update folders + Opera/Active Setup reg)
15e. MSI mode for USB XHCI controllers
16. CPU branch (Intel: `msisadrv = 3` / AMD: `msisadrv = 4`)
17. NVIDIA branch (per-`\NNNN` subkey under driver class): `DisableDynamicPstate`, `RMPowerFeature` 0x55455555, all latency-tolerance microsecond keys = 1, `PciLatencyTimerControl = 20`, `PreferSystemMemoryContiguous = 1`, MSI mode for the GPU device, NVIDIA telemetry off + scheduled-task disables, `nvlddmkm DisableWriteCombining = 1` + `RmGpsPsEnablePerCpuCoreDpc = 1` everywhere. **Skips: `EnableTiledDisplay`, `RMHdcpKeyGlobZero`, `TCCSupported`, `NVDeviceSupportKFilter`, `Acceleration.Level`** (display-risky on 600Hz).
18. RAM-aware `SvcHostSplitThresholdInKB` (16/32/48/64 GB tiers)
19. SysMain — Start=4 if SSD-only, Start=3 if HDD detected

**B. Calypto Latency Guide:**

- `mouclass\Parameters\MouseDataQueueSize = 50`, `kbdclass\Parameters\KeyboardDataQueueSize = 50`, `HidUsb\Parameters\MaximumPortsServiced = 3`
- `Memory Management\DisablePagingExecutive = 1`, `LargeSystemCache = 0`
- USB selective-suspend off per-device — iterates `Win32_PnPEntity` for `USB\VID*` / `USB\ROOT_HUB*`, sets `EnhancedPowerManagementEnabled / AllowIdleIrpInD3 / EnableSelectiveSuspend = 0` on each device's Enum reg path
- Power-plan USB selective-suspend off via `powercfg /setacvalueindex`
- IFEO `CpuPriorityClass = 3` (High) for `VALORANT.exe`, `VALORANT-Win64-Shipping.exe`, `RiotClientServices.exe`

**C. BoringBoom NVPI layer:**

- Imports `F:\etc\Everything\blurry op\Nvidia\Low Latency Ultra.nip` on top of fr33thy's `.nip` (already loaded earlier in StepTwo). NVPI silentImport only writes keys present in the file, so layering both works without conflict. Falls back to WARN if the file or NVPI exe isn't present.

**D. BOHR V13 power plan:**

- `powercfg /import F:\blurry win2026\BOHRV13.pow` then `setactive` on the returned GUID. Replaces TG's Ultimate Performance plan. Falls back to WARN if the .pow isn't found.

## What EXTRAS (option 4) does

Personal additions on top of every guide — desktop micro-feel tweaks not in any named guide:

- **Mouse hover / cursor feel**: `MouseHoverTime/Width/Height = 1`, `MouseTrails = 0`, `CursorBlinkRate = 530`
- **App-kill / hung-app timeouts**: `ForegroundLockTimeout = 0`, `ForegroundFlashCount = 0`, `WaitToKillAppTimeout = 5000`, `HungAppTimeout = 1000`, `LowLevelHooksTimeout = 1000`, `AutoEndTasks = 1`, `WaitToKillServiceTimeout = 2000`

## What CLEAN (option 3) does

- Caches: Brave/Chrome/Edge/Firefox/Discord/NVIDIA/AMD/Steam/DirectX/Windows thumb+icon
- Temp: `%TEMP%`, `Windows\Temp`, `Windows\Prefetch`
- DISM: `/StartComponentCleanup /ResetBase` + `/SPSuperseded`
- DriverStore: `pnputil /enum-drivers` + delete every-but-newest version of each `.inf`
- Event logs: every Windows event log cleared via `wevtutil cl`
- AppX bloat re-strip (Teams/Outlook/XboxOverlay/BingNews/Solitaire/Spotify/etc — in case MS Updates re-added)
- Scheduled tasks re-disable (Compatibility Appraiser, Defrag, Defender, Maps, etc.)
- Run/RunOnce wipe + Startup folders empty
- DNS / ARP / NetBIOS cache flush
- TRIM every fixed drive (`Optimize-Volume -ReTrim`)
- Empty Recycle Bin

Run after any Windows feature update or once a week to keep the fresh feel.

## Why this works (smoothness science)

- **Timer res 0.5ms** (TWEAK SmoothMode appendix): kernel scheduling 30× more granular than default → mouse-move events propagate through DWM on the next tick instead of waiting up to 16ms.
- **Ultimate Performance plan + 100% cores** (TWEAK; BOHR V13 overrides if picked): CPU never drops to power-saving freq, no ramp-up stall on user input.
- **USB selective-suspend off + USB XHCI MSI mode** (TWEAK Calypto + 15e): every USB poll lands; no per-device power-management latency.
- **Mouse/kbd data queue size = 50** (TWEAK Calypto): kernel buffers more raw input without dropping under burst load.
- **DWM thumbnail / Aero peek / VisualFX off** (TWEAK 3): less compositor work per frame.
- **Win32PrioritySeparation 0x2a** (TWEAK 3): 6:1 quantum favor for foreground = game/explorer get 6× more CPU.
- **HAGS (`HwSchMode=2`)** (TWEAK 3): GPU schedules its own work, lower frame-pacing variance.
- **NIC interrupt moderation off + Nagle's off** (TWEAK 13/14): packets propagate to user space without batching delays.
- **NVIDIA `RmGpsPsEnablePerCpuCoreDpc=1` + Per-CPU DPCs** (TWEAK 17): GPU DPCs distributed across cores, lower DPC latency.
- **NVPI Low-Latency-Ultra layered profile** (TWEAK BoringBoom + StepTwo's fr33thy.nip): NVIDIA driver's reflex-equivalent + zero-buffered VSync settings.
- **Mouse accel off + `MouseHoverTime=1`** (Blurry3 base + EXTRAS): 1:1 hand-to-cursor + instant tooltip detection.

## Reverting

- System restore: `rstrui.exe` → "Blurry 4 - pre-debloat"
- Specific reg keys: see `C:\Blurry4\logs\blurry4.log`
- TWEAK is fully reversible by reg-deleting the keys + `bcdedit /deletevalue` for each setting + restoring renamed `smartscreen.exe` / `mcupdate_*.dll` names.
- BOHR power plan: `powercfg /list`, find the Blurry/BOHR GUID, then `powercfg /delete <GUID>`.
- CLEAN is non-reversible (caches/temp/event-logs are gone, but those regenerate naturally).
- Power plan: `powercfg -setactive SCHEME_BALANCED` to return to default.

## Diagnostics

If `Blurry4.bat` closes instantly:
1. Run from an admin PowerShell window: `& "F:\Blurry WIndows TOol\Blurry4\Blurry4.ps1"`
2. The script's `trap { }` block at the top will catch any unhandled error and print it red with a line number, then pause for keypress before exit.
3. The .bat already passes `-NoExit` to PowerShell so the window stays open after the script finishes/crashes — pause at the end waits for keypress before the cmd window closes.

If your prior Blurry run disabled UAC (`EnableLUA=0`) and the .bat's UAC re-elevation isn't working, manually re-enable UAC and reboot:
```
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v EnableLUA /t REG_DWORD /d 1 /f
```
