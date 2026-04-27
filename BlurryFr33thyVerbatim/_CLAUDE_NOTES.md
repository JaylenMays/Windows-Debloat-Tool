# Claude session notes — BlurryFr33thyVerbatim

This is fr33thy's `WinSux.ps1` **verbatim** (4204 lines copied byte-for-byte from `F:\ISO&Debloat\New folder\WinSux-Windows-Optimization-Guide-main\Files\WinSux.ps1`) with **only** the 6 user-specified changes layered on top. Total now 4275 lines (+71 for the additions).

**Why this exists:** Blurry3 and Blurry4 use my custom ~450-line StepTwo, which has been the source of silent crashes on the user's real hardware. User said: *"you should've just copied fr33thy and changed the stuff I told you to change."* This folder is that. If Blurry3/4 keep breaking, this is the fallback that's known-good (because fr33thy's WinSux is widely tested by the WinSux community).

## The 6 user-specified changes (and where they are in the .ps1)

| # | Change | Line(s) in file | What was done |
|---|---|---|---|
| 1 | Brave instead of Chrome | ~158-180 | `dl.google.com/...Chrome.msi` → `laptop-updates.brave.com/latest/winx64`. Policy keys moved from `Policies\Google\Chrome` to `Policies\BraveSoftware\Brave`. Brave updater services killed. |
| 2 | Xbox trio kept | ~2714-2720 | Added `Microsoft.GamingApp / Microsoft.XboxIdentityProvider / Microsoft.Xbox.TCUI` to fr33thy's AppX `-notlike` keep list. |
| 3 | NVIDIA driver auto-download | ~2919-2950 | Replaced fr33thy's "open browser + Show-ModernFilePicker" with API auto-download via `https://gfwsl.geforce.com/...psid=129&pfid=976&osID=135`. Falls back to `F:\etc\Everything\blurry op\Install\` regex match, then to fr33thy's `Show-ModernFilePicker` if both fail. fr33thy's extract+debloat+install logic is unchanged. |
| 4 | Steam/Discord/Valorant/Logi installs | bottom of StepTwo, just before `Write-Host "RESTARTING"` | Added 4 try{}catch{} blocks. Auto-launch entries deleted from `HKCU\...\Run` post-install. |
| 5 | 600Hz `EnableTiledDisplay = 0` veto | n/a | fr33thy's WinSux **does not apply this key anywhere**. So no change needed. (Verified via `grep -i "EnableTiledDisplay"` returning no matches.) |
| 6 | Restore point + persistent log | ~17-30 | Added `$LogDir = C:\BlurryFr33thy\logs`, `$LogPath = blurry-fr33thy.log`. Pre-debloat restore point via `Checkpoint-Computer` (in addition to fr33thy's post-debloat restore point at end of StepTwo line ~4173). |

Also Chrome.exe paths at lines 2921/3272/3498 (vendor driver pages) updated to `Brave-Browser\Application\brave.exe` via PowerShell global replace.

## What was NOT changed from fr33thy

- DDU `Settings.xml` (lines 108-145) — byte-for-byte identical to fr33thy
- DDU command line: `-CleanSoundBlaster -CleanRealtek -CleanAllGpus -Restart` — identical
- StepOne content (Defender disable via TrustedInstaller hijack, UAC off, safeboot remove, DDU pass) — identical
- StepTwo's massive debloat content (~3,800 lines of reg keys, services, NIC tweaks, etc.) — identical, except the 6 changes above
- Userinit hijack: powershell-only (no `userinit.exe,` prefix). Works because next boot is into safe mode. fr33thy pattern.
- bcdedit safeboot + shutdown reboot pattern — identical
- NVPI download + .nip embed (lines 3048-3255) — identical (still uses fr33thy's `.nip` content)
- AMD/Intel branches in StepTwo's GPU vendor switch — identical
- Final restore point + final reboot at end of StepTwo — identical

## How to run

1. Right-click `BlurryFr33thyVerbatim.bat` → **Run as administrator**.
2. Walk away. Same 2-reboot flow as fr33thy: shutdown after main → safe mode → StepOne (Defender off + DDU) → reboot to normal → StepTwo fires from RunOnce → final shutdown.
3. NVIDIA driver auto-downloads in StepTwo's NVIDIA branch (case 1 in the GPU prompt). If user picks AMD or Intel, fr33thy's original branches run (with Brave instead of Chrome).
4. Steam/Discord/Valorant/Logi installs at the very end of StepTwo before the final restart.

## Differences vs Blurry3/Blurry4

| Aspect | Blurry3 / Blurry4 | BlurryFr33thyVerbatim |
|---|---|---|
| StepTwo size | ~450 custom lines | ~3,800 lines (fr33thy verbatim) |
| Risk of "rewrite-induced silent crash" | high (untested custom code) | low (verbatim from widely-used source) |
| AppX kill list | my curated set | fr33thy's full set + Xbox trio kept |
| Service trim | my curated set | fr33thy's full set |
| GPU branches | NVIDIA-only (RTX 4090 hardcoded) | NVIDIA / AMD / Intel prompt (fr33thy) |
| 600Hz veto | hardcoded skips for `EnableTiledDisplay`/`RMHdcpKeyGlobZero`/etc. | not needed — fr33thy doesn't apply these |
| Brave install | yes (in main + StepTwo) | yes (replacing Chrome) |
| Steam/Discord/Valorant/Logi | yes (StepTwo end) | yes (StepTwo end) |
| Restore point | pre-debloat in main | pre-debloat in main + post-debloat at StepTwo end (fr33thy's) |
| Logging | `C:\Blurry3\logs\blurry3.log` (or Blurry4) | `C:\BlurryFr33thy\logs\blurry-fr33thy.log` |
| User-specific tweaks (Calypto, BoringBoom, BOHR) | in Blurry4 TWEAK menu | not present (verbatim is just fr33thy + 6 changes) |
| Final-stage menu | Blurry4 only | not present |

## Rules for Claude

1. **Do not "improve" this file's StepTwo logic.** It's verbatim fr33thy. The only deltas are the 6 documented changes. If user reports a bug INSIDE fr33thy's logic, that's a fr33thy bug not ours — surface it as such, don't silently rewrite.
2. **Do not add the hardcoded vetoes** (`EnableTiledDisplay`, `RMHdcpKeyGlobZero`, etc.) — fr33thy doesn't, so neither do we.
3. **When user wants additional changes**: ask whether they want them in this verbatim version (which means modifying fr33thy's content) or in Blurry4 (which already has the 4-option menu structure).
4. **Append a changelog entry below** after every edit to `BlurryFr33thyVerbatim.ps1`.

---

## Change log

### 2026-04-26 — Initial build

- Copied `WinSux.ps1` (4204 lines) → `BlurryFr33thyVerbatim.ps1`.
- Applied 6 user-specified changes (Brave, Xbox kept, NVIDIA auto-DL, apps, restore+log; veto n/a).
- Final size: 4275 lines, 194 KB. Parse OK.
- Created `BlurryFr33thyVerbatim.bat` launcher with `-NoExit` + `pause` (matches Blurry3/4 launcher pattern).

### 2026-04-27 — Robustness: trap + -NoExit so StepTwo doesn't die silently mid-debloat

**Symptom (user report):** "When it runs it gets stuck and doesn't turn off the settings." The user expected fr33thy's debloat to disable Windows Update / privacy / sync panes in Settings, but on their machine those panes were still on after the run. fr33thy's verbatim StepTwo has zero error handling and the RunOnce launcher has no `-NoExit`, so any unhandled terminating error before line ~2079 (the big `WindowsSettings.reg` import) silently closes the powershell window with the rest of the debloat skipped.

**Fix (Blurry3-style, minimal):**

1. Inserted a script-scope `trap { ... }` block at the top of StepTwo (right after `$progresspreference = 'silentlycontinue'`). Catches unhandled terminating errors, prints the failing line number + message in red, appends to `C:\BlurryFr33thy\logs\blurry-fr33thy.log`, and uses `continue` so StepTwo keeps applying the rest of the debloat instead of dying.
2. Added `-NoExit` to the RunOnce StepTwo launcher (~line 4287) so even if a non-trappable failure happens (or the trap's own `Add-Content` fails), the window stays open instead of vanishing.

Did not adopt Blurry3's per-section `Step "name" { body }` helper — that would touch every section of fr33thy's StepTwo and is too invasive for this verbatim variant. The trap alone covers the common case of "one bad statement kills the whole script".

File now 4326 lines. Parse OK.

This is the 9th deviation from fr33thy verbatim (also a fix, not a feature).

### 2026-04-27 — Reverted Settings-app fix per user request

User instructed to handle the broken Settings app "the way he does it" (fr33thy verbatim) — i.e. don't add framework keep entries.

Removed the 5 keep-list entries (`UI.Xaml`, `VCLibs`, `NET.Native.Framework`, `NET.Native.Runtime`, `WindowsAppRuntime`) added earlier in the same day's session. AppX strip is back to fr33thy's exact list + the DesktopAppInstaller entry from the NVCP fix.

Settings will be broken in the same way fr33thy users see it. Recovery (if needed) is out-of-band:
- Re-register all AppX manifests still on disk: `Get-AppxPackage -allusers | ForEach-Object { Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\AppXManifest.xml" -ErrorAction SilentlyContinue }`
- Or pull missing framework `.appxbundle` files from store.rg-adguard.net and `Add-AppxPackage` them.
- Or in-place repair install from a Win11 ISO.

File back to 4305 lines.

### 2026-04-27 — Fix missing desktop shortcuts for Steam / Discord / Logi OMM / Riot Client

**Symptoms (user report):** After full run, Steam / Discord / Logitech OMM had no desktop shortcuts and were hard to find. Riot Client + Valorant *did* install successfully but Riot Client's desktop launcher was missing.

**Root causes (all in the StepTwo install block, was lines 4222-4250):**

1. **Steam:** the script *explicitly deleted* `Steam.lnk` from Public Desktop right after `/S` install placed it. fr33thy pattern, but user wants the shortcut.
2. **Discord:** `-s` is undocumented for Discord's Squirrel-based installer. Likely caused the installer to skip its post-install steps (which includes shortcut creation). The 5-second `Stop-Process Discord` after also killed the install before it could finish either way.
3. **Riot Client:** `--launch-product=valorant --launch-patchline=live` puts the installer into auto-launch mode, which can skip the standard Riot Client desktop shortcut creation step (Valorant download still works — that's the part the user observed working).
4. **Logi OMM:** plain `/SILENT` uses Inno Setup default tasks, and OMM's setup script does not have "desktop icon" enabled by default. Need explicit `/TASKS="desktopicon"`.

**Fix strategy:** stop fighting each installer's specifics. After every install, manually create a Public Desktop `.lnk` to the known executable path via a small `New-BlurryPublicShortcut` helper. Guarantees a visible shortcut regardless of installer behaviour.

**Concrete changes:**

- Added `New-BlurryPublicShortcut` helper (uses WScript.Shell COM, only writes if target exists).
- Steam: removed the `Remove-Item Steam.lnk` line; added safety-net shortcut to `C:\Program Files (x86)\Steam\Steam.exe`.
- Discord: dropped `-s` arg, run installer plain so it completes its own setup; wait up to 120s for `%LOCALAPPDATA%\Discord\app-*\Discord.exe` to appear; then kill and remove from Run; safety-net shortcut targets `Update.exe --processStart Discord.exe` (Discord's official launcher pattern).
- Riot Client: kept the `--launch-product=valorant --launch-patchline=live` args (Valorant download still works); added safety-net shortcut to `C:\Riot Games\Riot Client\RiotClientServices.exe` with the same launch args.
- Logi OMM: added `/TASKS="desktopicon"` to silent args; added safety-net shortcut to `C:\Program Files\Logitech\OnboardMemoryManager\OnboardMemoryManager.exe`.

File now 4305 lines (was 4278). Parse OK. All three heredoc closers still at column 0.

This is an 8th deviation from fr33thy verbatim — also a fix, not a feature.

### 2026-04-27 — Fix missing NVIDIA Control Panel post-install

**Symptom:** After full run, NVIDIA Control Panel was not installed. Driver itself was fine.

**Root cause (fr33thy bug, not ours):** The AppX strip (~line 2702-2731) does not keep `Microsoft.DesktopAppInstaller`. The strip runs *before* the NVIDIA install. Then at ~line 3005 the script calls `winget install 9NF8H0H7WMLT` (the MS Store NVIDIA Control Panel UWP) — but `winget.exe` lives inside `Microsoft.DesktopAppInstaller`, which was just removed. The call is wrapped in `try {} catch {}` with an empty handler, so the failure is silent.

**Fix (option 1 from the conversation — most surgical):** Added `*Microsoft.DesktopAppInstaller*` to the AppX `-notlike` keep list (just below `Microsoft.AVCEncoderVideoExtension`). Winget now survives the strip long enough for the NVCP install at ~line 3005 to succeed; the existing `Microsoft.Winget.Source` cleanup at ~line 3009 still removes the source package afterwards.

- 1 keep-list line added + 1 `BLURRY CHANGE` comment. File now 4278 lines. Parse OK.
- This is technically a 7th deviation from fr33thy verbatim — not a feature, a bug fix for an existing fr33thy issue. Not added to the "6 changes" table at the top because it's a fix, not a user-requested feature.
