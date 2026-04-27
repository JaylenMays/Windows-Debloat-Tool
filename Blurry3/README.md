# Blurry Windows Debloat Tool 3

Fresh-install, fire-and-forget Windows 11 debloat + gaming-latency tool. Cloned from fr33thy's WinSux (3-stage Main → SafeBoot/DDU → StepTwo flow) with these additions:

- **Brave** (instead of Chrome) + uBlock Origin Lite, hardware accel off, no auto-update services
- **Steam, Discord, Valorant/Riot Client, Logitech G HUB OMM** — silent installs, auto-launch killed
- **Xbox app trio kept** (`Microsoft.GamingApp` + `XboxIdentityProvider` + `Xbox.TCUI` allowlisted), but Game Bar / DVR / overlay neutered, Xbox services disabled, `ms-gamebar://` redirected to systray.exe
- **NVIDIA driver auto-download** via NVIDIA's lookup API (RTX 4090 / Win11 DCH), debloated silent install, **NVPI low-latency profile imported** (fr33thy's verbatim `.nip` embedded as a here-string in main and staged to disk for StepTwo to import)
- **600Hz `EnableTiledDisplay` veto** — that key is hardcoded *never* to be written. Your 600Hz monitor stays at 600Hz instead of getting capped to 360Hz
- **Restore point** before stage 1
- **Persistent log** at `C:\Blurry3\logs\blurry3.log`

> **NOTE** — this folder uses my custom slim ~450-line StepTwo. If runs silent-crash on your hardware, try **`../BlurryFr33thyVerbatim/`** (fr33thy's verbatim 3,800-line StepTwo + the same 6 changes) or **`../BlurryFr33thy+Tweaks/`** (verbatim + Blurry4's TWEAK/CLEAN/EXTRAS menu). See **`../_CLAUDE_NOTES.md`** for variant comparison.

## Run

1. Right-click **`Blurry3.bat`** → **Run as administrator**.
2. Walk away. Two reboots happen automatically (into safe mode for DDU, back to normal for StepTwo).
3. After "Blurry 3 complete." appears, press any key to close, then optionally reboot once more to fully settle.

## Robustness fixes (added when StepTwo silently closed after AppX)

- **Crash trap** at top of StepTwo: catches unhandled errors, prints red with line number, logs to `C:\Blurry3\logs\blurry3.log`, pauses for keypress before exit.
- **`Step "name" { body }` per-section helper** wraps risky cmdlets in try/catch — one section's failure doesn't kill the rest.
- **`Pause` at end of StepTwo** — window stays open even on full success.
- **RunOnce launches StepTwo with `-NoExit`** — backup safety net if the trap doesn't fire in time.
- **`.bat` passes `-NoExit` to PowerShell + has `pause >nul`** at the end — cmd window survives any failure mode.

## Three-stage flow

| Stage | Where | What | Reboot |
|---|---|---|---|
| 1 | Normal boot | Restore point + 7-Zip + VC++ 2005-2022 + DDU staged + Brave+uBOL + DirectX. Arms `Userinit→StepOne` + `RunOnce→StepTwo`. Sets `bcdedit safeboot minimal`. `shutdown -r -t 00`. | yes (into safe mode) |
| 2 | Safe boot | TrustedInstaller hijack disables Defender (real-time/tamper/cloud/HVCI/LSA/SmartScreen/exploit-mitigations/vuln-driver blocklist) + UAC. Restores Userinit. Clears safeboot. Runs DDU `-CleanAllGpus -Restart`. | yes (back to normal) |
| 3 | Normal boot (RunOnce) | AppX allowlist + Xbox trio kept + capabilities/features allowlists + OneDrive uninstall + Edge neuter + Copilot/Recall/Cortana off + ContentDeliveryManager + telemetry + Game Bar neuter + Explorer classic + power/mouse/timer + NIC bindings + scheduled tasks + Run/RunOnce wipe + WU 365-day pause + NVIDIA driver auto-DL + NVPI import + Steam/Discord/Valorant/Logi installs + cleanup. Press any key to close. | optional final reboot |

## Hardcoded vetoes (NEVER applied)

These would brick the user's specific hardware:

- ❌ `EnableTiledDisplay = 0` (caps 600Hz monitor to 360Hz — hardcoded refusal)
- ❌ `RMHdcpKeyGlobZero = 1` (HDR/DSC handshake risk on 600Hz panel)
- ❌ `TCCSupported = 0` (irrelevant on consumer GPUs)
- ❌ `NVDeviceSupportKFilter = 0` (display-path kernel filter risk)
- ❌ `Acceleration.Level = 0` (can soft-cap display modes)
- ❌ Wholesale wipe of `TaskCache\Tree` (destroys legit Steam/NVIDIA/Discord scheduled tasks)
- ❌ `PlugPlay` (PnP) off (breaks USB hot-plug)
- ❌ Renaming `smartscreen.exe`
- ❌ Renaming `mcupdate_*.dll` (microcode)
- ❌ Disabling Spooler / iphlpsvc / Lanman / IKEEXT
- ❌ `bcdedit /set nx AlwaysOff`
- ❌ Black wallpaper / password-sign-in disable

> Blurry4 flips several of these on (gaming-only PC tradeoffs). See `../Blurry4/README.md`. Blurry3 keeps the strict list.

## Reverting

- **System restore**: `rstrui.exe` → "Blurry 3 - pre-debloat".
- **Specific reg keys**: every key written is logged in `C:\Blurry3\logs\blurry3.log`.
- **Defender back on**: easiest is reset via Windows Security UI; for the keys that need TrustedInstaller, boot to safe mode and write `Enabled=1` / `RunAsPPL=1` etc., or `sfc /scannow`.
- **Brave/Steam/Discord/Valorant/Logi OMM**: standard uninstall via Settings → Apps.
- **Edge**: re-enable services `MicrosoftEdgeElevationService`, `edgeupdate`, `edgeupdatem`.
- **Windows Update pause**: clear the four `Pause*Time` values under `HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings`.

## Diagnostics

If `Blurry3.bat` closes instantly:
1. Run from an admin PowerShell window: `& "F:\Blurry WIndows TOol\Blurry3\Blurry3.ps1"` — the trap will catch any unhandled error.
2. Or from cmd: `powershell -NoExit -NoProfile -ExecutionPolicy Bypass -File "F:\Blurry WIndows TOol\Blurry3\Blurry3.ps1"`
3. If your prior run disabled UAC (`EnableLUA=0`), re-enable manually and reboot:
   ```
   reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v EnableLUA /t REG_DWORD /d 1 /f
   ```

## Caveats

- Xbox app stays installed but **Game Bar** is dead (protocol redirected to systray.exe). If you want the overlay back, undo the protocol redirects under `HKCR\ms-gamebar*` and re-enable services `XblGameSave`, `XboxGipSvc`, `XboxNetApiSvc`, `XblAuthManager`.
- NVIDIA's product/OS IDs (`psid=129 / pfid=976 / osID=135`) occasionally change. If the API call fails, the script falls back to the latest matching `.exe` under `F:\etc\Everything\blurry op\Install\`, then to a file picker.
- The Riot Client URL points at the NA-region installer. If you're not on NA, swap `live.live.na.exe` to your region in StepTwo.
- NVMe new-driver feature flag (`735209102 / 1853569164 / 156965516`) is force-enabled. If you see NVMe stalls or BSOD post-install, set those `EnabledState` values back to 0.
- `BraveSoftware` policy keys assume Brave is installed system-wide. Brave honors them on next launch.
- Defender being fully off is **intentional** per spec (matches fr33thy). System is wide-open to malware until you re-enable.

## Layout

```
Blurry3/
├── Blurry3.bat        self-elevating launcher (with -NoExit + pause)
├── Blurry3.ps1        single-file orchestrator (Main + StepOne + StepTwo as embedded here-strings, with crash trap + Step helper + end-pause)
├── README.md          (this file)
├── _CLAUDE_NOTES.md   per-variant changelog for future-Claude
└── logs/              created at runtime; persistent log lives at C:\Blurry3\logs\blurry3.log
```
