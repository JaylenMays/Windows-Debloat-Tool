# TweakingGuy ISO — what's actually inside

**Source:** `F:\etc\Everything\blurry op\W11 x TweakingGuy 1.13 new.iso` (12.98 GB)

## TL;DR

The ISO has **no baked-in registry tweaks, no service changes, no scheduled-task changes**. It's mostly stock Windows 11 Pro for Workstations 23H2 (build 22631.3155) with NTLite component removals and an OOBE-bypass `autounattend.xml`. All the "TweakingGuy magic" comes from running `blurry.bat` (or similar) **after** Windows installs. That's why your existing `blurry.bat` and `Blurrysmooth.bat` exist — they're the post-install layer.

## Build provenance (from `NTLite.log`)

- Built 2024-11-30 22:01 — 22:21 with NTLite v2024.11.10169 x64
- Source image: Windows 11 Pro for Workstations 23H2 x64 — 10.0.22631.3155 (en-US)
- Build host: Windows 11 Pro 23H2
- Built by user: `Administrator`
- Active preset at apply: `Auto-saved 3076b223.xml`

## What `autounattend.xml` does (verbatim from the ISO)

- Sets timezone `W. Europe Standard Time`
- Sets locale/keyboard `en-US`
- Bypasses OOBE: `HideEULAPage`, `HideLocalAccountScreen`, `HideOnlineAccountScreens`, `HideWirelessSetupInOOBE`, `SkipMachineOOBE`, `SkipUserOOBE`
- Auto-logon: enabled, `LogonCount=9999999`, user `Administrator`, blank password
- Creates local account: `Administrator` (display name `TweakingGuy`) in Administrators group, blank password
- During specialize: `net user Administrator /active:Yes` and `/fullname:"TweakingGuy"`
- ComputerName: `TweakingGuy`
- Skips auto-activation (`SkipAutoActivation=true`)
- Disables dynamic update (`DynamicUpdate Enable=false`)
- Compact mode: `<Compact>true</Compact>` (uses CompactOS)
- Image index: 1 (the only image in the WIM)

**No `RunSynchronousCommand` blocks for tweaks. No `FirstLogonCommands`. No `<RegistryKey>` injections.**

## What NTLite removed (from `Auto-saved 3076b223.xml`)

Disabled compatibility features (so the components were stripped from the image):

- AppGuard
- YubiKey
- Bluetooth
- CapFrameX
- Docker
- Hyper-V
- iCloud
- Kaspersky
- NetworkDiscovery
- RDPServer
- SamsungSwitch
- VPN
- **VSS (Volume Shadow Copy)** — ⚠ this means **System Restore won't work** out of the box
- **SafeMode** — ⚠ Safe-mode boot is removed; you can't recover the system in safe mode
- USBModem
- Recommended-Tablet

Kept: Battle.net, Discord, Spotify, Netflix, NvidiaSetup, NightLight, OOBE, Printing, Scanning, ServicingStack, ShellSearchSupport, SFC, DefaultFonts, TeamViewer, USB, USBCamera, FileSharing, ManualSetup, OfficeSupport, AppxSupport, VideoPlayback, VisualStudio, ActivationKMS, Activation, WinSetup, WindowsStore, WindowsUpdate, WLAN.

## What I could *not* extract

The `install.wim` (11.6 GB) is built with `LZX:15` compression but its image directory pointer is malformed/stripped (DISM 10.0.28000 errors with "data invalid"; 7-Zip reports `Images = 0`; the metadata `[1].xml` is blank). The Windows installer still consumes it fine because Setup uses a different code path, but offline inspection tools can't enumerate the file tree.

To inspect deeper you'd need either:
- **wimlib-imagex** (third-party, more permissive than DISM): `wimlib-imagex info install.wim`
- A different DISM build from Windows ADK (`oscdimg`/`dism` from ADK 10.1.26100+ may handle it)
- Boot a VM from the ISO, run Windows, and snapshot the `SOFTWARE`/`SYSTEM` hives to compare against a stock W11 install

## Conclusion

If your goal was *"find the secret reg tweaks baked into this ISO"* — there aren't any. The ISO is a stock-with-removals image. Your existing `blurry.bat` is the source of truth for the actual tweaks.

If you want to **bake** tweaks into your own ISO, that's a different operation: you'd modify the `autounattend.xml` to inject a `setupcomplete.cmd` post-install script (or use `<RunSynchronousCommand>` blocks during specialize) that imports a `.reg` file. The Blurry tool we built can be slotted in as that post-install script. The IsoBuilder folder has the skeleton for this.
