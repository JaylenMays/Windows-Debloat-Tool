# Windows-Debloat-Tool

A PowerShell tool that debloats Windows 11. It removes preinstalled apps, Microsoft Edge and OneDrive, and applies privacy and UI tweaks.

## Usage

1. Download or clone this repo.
2. **Preview first:** open a terminal in the folder and run `Run.bat -DryRun`. It prints what would change and changes nothing.
3. Run `Run.bat` (or `.\Debloat.ps1` from an elevated PowerShell). You are asked before each section. Use `-Auto` to skip the prompts.
4. To revert settings, run `.\Undo.ps1` as Administrator.

## What it does

- **Creates a System Restore point** and records previous registry and service values in `backup/previous-values.json`.
- **Removes apps** listed in `config/apps.txt`, including Photos, Calculator, Notepad, Clipchamp, News, Weather, Solitaire, Xbox apps, Phone Link, Teams (consumer), Copilot, Paint 3D, and common promoted third-party apps. Edit the file to keep any of them.
- **Uninstalls Microsoft Edge** and sets a policy to stop Windows Update reinstalling it. The WebView2 Runtime is kept, because other apps need it.
- **Uninstalls OneDrive** and disables its sync policy. Files already in your OneDrive folder are not deleted.
- **Privacy tweaks** (from `config/tweaks.json`): minimum telemetry, advertising ID, tailored experiences, activity history, Bing in Start search, suggested content, Copilot, Recall, Widgets, Chat icon.
- **Optional UI tweaks** (asked one by one): classic right-click menu, show file extensions, show hidden files, taskbar aligned left.
- **Optional:** disable the `DiagTrack` and `dmwappushservice` telemetry services.
- Writes a summary to `debloat-log.txt` and offers a restart.

## Kept on purpose

Microsoft Store, Windows Terminal, Snipping Tool, Windows Security, and the WebView2 Runtime.

## Warnings

- With Edge, Photos, Calculator and Notepad removed, you will need other apps for browsing, images, maths and text editing. Install a browser *before* running this if you don't have one.
- Edge removal depends on the build and region. If Microsoft blocks the uninstall, the tool reports it and carries on.
- `Undo.ps1` restores settings only. It does not reinstall removed apps: use the Microsoft Store, or restore the System Restore point.
- Major Windows updates can bring some removed apps back. Re-run the tool afterwards.
- Use at your own risk. Try `-DryRun` first.

## License

MIT
