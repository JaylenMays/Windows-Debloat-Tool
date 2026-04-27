# Apps module - winget install + per-app debloat

function Install-WingetApp {
    param([string]$Id, [string]$Display)
    $w = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $w) {
        Write-BlurryLog "winget not found. Install 'App Installer' from Microsoft Store." 'WARN'
        return
    }
    Write-BlurryLog "winget install $Display ($Id)"
    & winget install --id $Id --accept-source-agreements --accept-package-agreements --silent --disable-interactivity 2>&1 |
        ForEach-Object { Write-BlurryLog "  $_" }
}

# Helper for the registration loop
function Register-AppInstall {
    param([string]$Panel,[string]$Id,[string]$Label,[string]$WingetId,[bool]$Default = $false)
    Register-Tweak -Id "app-$Id" -Label $Label -Panel $Panel -Default $Default -Apply ([scriptblock]::Create("Install-WingetApp -Id '$WingetId' -Display '$Label'"))
}

# Browsers
Register-AppInstall 'AppsBrowserPanel' 'brave' 'Brave Browser' 'Brave.Brave' $true
Register-AppInstall 'AppsBrowserPanel' 'firefox' 'Firefox' 'Mozilla.Firefox' $false
Register-AppInstall 'AppsBrowserPanel' 'chrome' 'Google Chrome' 'Google.Chrome' $false
Register-AppInstall 'AppsBrowserPanel' 'librewolf' 'LibreWolf' 'LibreWolf.LibreWolf' $false

# Gaming
Register-AppInstall 'AppsGamingPanel' 'steam' 'Steam' 'Valve.Steam' $true
Register-AppInstall 'AppsGamingPanel' 'epic' 'Epic Games Launcher' 'EpicGames.EpicGamesLauncher' $false
Register-AppInstall 'AppsGamingPanel' 'riot' 'Riot Client (Valorant/LoL)' 'RiotGames.RiotClient' $true
Register-AppInstall 'AppsGamingPanel' 'battle' 'Battle.net' 'Blizzard.BattleNet' $false
Register-AppInstall 'AppsGamingPanel' 'gog' 'GOG Galaxy' 'GOG.Galaxy' $false
Register-AppInstall 'AppsGamingPanel' 'ubisoft' 'Ubisoft Connect' 'Ubisoft.Connect' $false

# Comms
Register-AppInstall 'AppsCommsPanel' 'discord' 'Discord' 'Discord.Discord' $true
Register-AppInstall 'AppsCommsPanel' 'teamspeak3' 'TeamSpeak 3' 'TeamSpeakSystems.TeamSpeakClient' $false

# Utilities
Register-AppInstall 'AppsUtilPanel' '7zip' '7-Zip' '7zip.7zip' $true
Register-AppInstall 'AppsUtilPanel' 'vlc' 'VLC' 'VideoLAN.VLC' $true
Register-AppInstall 'AppsUtilPanel' 'notepadpp' 'Notepad++' 'Notepad++.Notepad++' $true
Register-AppInstall 'AppsUtilPanel' 'pwsh' 'PowerShell 7' 'Microsoft.PowerShell' $true
Register-AppInstall 'AppsUtilPanel' 'wt' 'Windows Terminal' 'Microsoft.WindowsTerminal' $true
Register-AppInstall 'AppsUtilPanel' 'git' 'Git' 'Git.Git' $false
Register-AppInstall 'AppsUtilPanel' 'qbit' 'qBittorrent' 'qBittorrent.qBittorrent' $false
Register-AppInstall 'AppsUtilPanel' 'spotify' 'Spotify' 'Spotify.Spotify' $false

# Tweaking / monitoring
Register-AppInstall 'AppsTweakPanel' 'msi-afterburner' 'MSI Afterburner' 'Guru3D.Afterburner' $true
Register-AppInstall 'AppsTweakPanel' 'hwinfo' 'HWiNFO' 'REALiX.HWiNFO' $true
Register-AppInstall 'AppsTweakPanel' 'cpuz' 'CPU-Z' 'CPUID.CPU-Z' $true
Register-AppInstall 'AppsTweakPanel' 'crystaldiskinfo' 'CrystalDiskInfo' 'CrystalDewWorld.CrystalDiskInfo' $false
Register-AppInstall 'AppsTweakPanel' 'gpuz' 'GPU-Z' 'TechPowerUp.GPU-Z' $false
Register-AppInstall 'AppsTweakPanel' 'rivatuner' 'RivaTuner Statistics Server' 'Guru3D.RTSS' $true
Register-AppInstall 'AppsTweakPanel' 'nvinspector' 'NVIDIA Profile Inspector' 'Orbmu2k.NVIDIAProfileInspector' $true
Register-AppInstall 'AppsTweakPanel' 'powertoys' 'Microsoft PowerToys' 'Microsoft.PowerToys' $false
Register-AppInstall 'AppsTweakPanel' 'lighthouse' 'IntelligentStandby Helper / Wagnardsoft DDU' 'Wagnardsoft.DisplayDriverUninstaller' $true

# --- Per-app debloat ---
Register-Tweak -Id 'appdb-discord' -Label 'Discord: disable hardware accel + auto start' -Panel 'AppsDebloatPanel' -Default $true -Apply {
    Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name Discord -ErrorAction SilentlyContinue
    $cfg = Join-Path $env:APPDATA 'discord\settings.json'
    if (Test-Path $cfg) {
        try {
            $j = Get-Content $cfg -Raw | ConvertFrom-Json
            $j | Add-Member -Force NoteProperty 'OPEN_ON_STARTUP' $false
            $j | Add-Member -Force NoteProperty 'MINIMIZE_TO_TRAY' $false
            $j | Add-Member -Force NoteProperty 'IS_MAXIMIZED' $false
            $j | ConvertTo-Json -Depth 10 | Set-Content $cfg
            Write-BlurryLog 'Discord settings.json patched'
        } catch { Write-BlurryLog "Discord patch failed: $($_.Exception.Message)" 'WARN' }
    } else { Write-BlurryLog 'Discord settings.json not found (run Discord once first)' 'WARN' }
}
Register-Tweak -Id 'appdb-steam' -Label 'Steam: disable startup, auto-update on launch only' -Panel 'AppsDebloatPanel' -Default $true -Apply {
    Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name Steam -ErrorAction SilentlyContinue
    Set-RegValue 'HKCU:\Software\Valve\Steam' 'AutoLoginUser' '' String
    Set-RegValue 'HKCU:\Software\Valve\Steam' 'BigPictureInForeground' 0
}
Register-Tweak -Id 'appdb-brave' -Label 'Brave: disable hardware accel, startup boost, background, updater service' -Panel 'AppsDebloatPanel' -Default $true -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Policies\BraveSoftware\Brave' 'HardwareAccelerationModeEnabled' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\BraveSoftware\Brave' 'BackgroundModeEnabled' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\BraveSoftware\Brave' 'StartupBoostEnabled' 0
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\BraveUpdateService' 'Start' 4
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\BraveElevationService' 'Start' 4
}
Register-Tweak -Id 'appdb-chrome' -Label 'Chrome: kill background mode, hardware accel, updater services' -Panel 'AppsDebloatPanel' -Default $false -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Google\Chrome' 'StartupBoostEnabled' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Google\Chrome' 'HardwareAccelerationModeEnabled' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Google\Chrome' 'BackgroundModeEnabled' 0
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\GoogleChromeElevationService' 'Start' 4
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\gupdate' 'Start' 4
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\gupdatem' 'Start' 4
}
Register-Tweak -Id 'appdb-nv-experience-rm' -Label 'Strip GeForce Experience telemetry tasks (keep driver)' -Panel 'AppsDebloatPanel' -Default $true -Apply {
    Get-ScheduledTask -TaskName 'NvTm*' -ErrorAction SilentlyContinue | Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null
    Stop-Service -Name NvTelemetryContainer -ErrorAction SilentlyContinue
    Set-Service -Name NvTelemetryContainer -StartupType Disabled -ErrorAction SilentlyContinue
}
Register-Tweak -Id 'appdb-vctools' -Label 'Install Visual C++ Redists (gaming dependencies)' -Panel 'AppsDebloatPanel' -Default $true -Apply {
    foreach ($id in 'Microsoft.VCRedist.2015+.x64','Microsoft.VCRedist.2015+.x86','Microsoft.VCRedist.2013.x64','Microsoft.VCRedist.2013.x86','Microsoft.VCRedist.2012.x64','Microsoft.VCRedist.2010.x64','Microsoft.DirectX') {
        Install-WingetApp -Id $id -Display $id
    }
}
