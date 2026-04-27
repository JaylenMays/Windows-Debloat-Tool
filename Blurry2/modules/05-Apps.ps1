# 05-Apps.ps1 - install latest Brave/Steam/Discord/Riot/Logitech OMM/tools
# + per-app debloat (HW accel off, autostart off, etc)

# Direct download URLs (bypass winget so we get *truly* latest)
$Script:Apps = @(
    @{ Id='brave';     Name='Brave Browser';                Url='https://laptop-updates.brave.com/latest/winx64'; File='BraveBrowserStandaloneSilentSetup.exe'; Args='/silent /install' },
    @{ Id='discord';   Name='Discord';                       Url='https://discord.com/api/download?platform=win'; File='DiscordSetup.exe'; Args='--silent' },
    @{ Id='steam';     Name='Steam';                         Url='https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe'; File='SteamSetup.exe'; Args='/S' },
    @{ Id='riot';      Name='Riot Client';                   Url='https://lol.secure.dyn.riotcdn.net/channels/public/x/installer/current/live.live.na.exe'; File='RiotInstaller.exe'; Args='--launch-product=valorant --launch-patchline=live' },
    @{ Id='logiomm';   Name='Logitech G HUB Onboard Memory'; Url='https://download01.logi.com/web/ftp/pub/techsupport/gaming/Onboard_Memory_Manager_setup_2.10.27.exe'; File='LogiOMMSetup.exe'; Args='/S' },
    @{ Id='7zip';      Name='7-Zip';                         Url='https://www.7-zip.org/a/7z2408-x64.exe'; File='7zip.exe'; Args='/S' },
    @{ Id='hwinfo';    Name='HWiNFO';                        Url='https://www.hwinfo.com/files/hwi64_810.exe'; File='hwinfo.exe'; Args='/SILENT' },
    @{ Id='cpuz';      Name='CPU-Z';                         Url='https://download.cpuid.com/cpu-z/cpu-z_2.10-en.exe'; File='cpuz.exe'; Args='/S' },
    @{ Id='afterburner'; Name='MSI Afterburner';             Url='https://download.msi.com/uti_exe/MSIAfterburnerSetup465.zip'; File='afterburner.zip'; Args=$null },  # zip -- handled below
    @{ Id='notepadpp'; Name='Notepad++';                    Url='https://github.com/notepad-plus-plus/notepad-plus-plus/releases/latest/download/npp.Installer.x64.exe'; File='notepadpp.exe'; Args='/S' },
    @{ Id='nvcleanstall'; Name='NVCleanstall';              Url='https://www.techpowerup.com/download/techpowerup-nvcleanstall/'; File='nvcleanstall.zip'; Args=$null },  # link is HTML; we resolve below
    @{ Id='nvpi';      Name='NVIDIA Profile Inspector';      Url='https://github.com/Orbmu2k/nvidiaProfileInspector/releases/latest/download/nvidiaProfileInspector.zip'; File='nvpi.zip'; Args=$null }
)

function _Download {
    param([string]$Url,[string]$Dest)
    if ($Script:DryRun) { Write-Log "DRY: download $Url"; return $false }
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing -ErrorAction Stop
        return (Test-Path $Dest)
    } catch {
        Write-Log "Download FAIL $Url -> $($_.Exception.Message)" 'WARN'
        return $false
    }
}

function _RunInstaller {
    param([string]$Path,[string]$Args)
    if ($Script:DryRun) { Write-Log "DRY: install $Path $Args"; return }
    if (-not (Test-Path $Path)) { return }
    try {
        if ($Args) { Start-Process -FilePath $Path -ArgumentList $Args -Wait -ErrorAction Stop }
        else       { Start-Process -FilePath $Path -Wait -ErrorAction Stop }
    } catch { Write-Log "Install FAIL $Path -> $($_.Exception.Message)" 'WARN' }
}

function Install-AllApps {
    if (-not (Test-Internet)) { Write-Log 'No internet -- skipping app install.' 'WARN'; return }

    $tmp = Join-Path $env:SystemDrive 'Blurry\downloads'
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null

    foreach ($app in $Script:Apps) {
        Write-Log "Installing: $($app.Name)" 'INFO'
        $dest = Join-Path $tmp $app.File
        if (_Download $app.Url $dest) {
            if ($app.Args) { _RunInstaller $dest $app.Args }
            elseif ($dest -like '*.zip') {
                $extract = Join-Path $tmp ($app.Id + '_x')
                Expand-Archive -Path $dest -DestinationPath $extract -Force -ErrorAction SilentlyContinue
                # Drop a Start-menu shortcut to whatever .exe is in there
                $exe = Get-ChildItem $extract -Filter *.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($exe) {
                    $startMenu = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\$($app.Name).lnk"
                    $sh = New-Object -ComObject WScript.Shell
                    $lnk = $sh.CreateShortcut($startMenu)
                    $lnk.TargetPath = $exe.FullName
                    $lnk.Save()
                }
            }
        }
        Start-Sleep 1
    }

    # Per-app debloat
    Invoke-AppPerInstall-Debloat
    Set-BraveDefaultBrowser
}

function Invoke-AppPerInstall-Debloat {
    # ---------------- Brave ----------------
    Set-Reg 'HKLM:\SOFTWARE\Policies\BraveSoftware\Brave' 'HardwareAccelerationModeEnabled' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\BraveSoftware\Brave' 'BackgroundModeEnabled' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\BraveSoftware\Brave' 'StartupBoostEnabled' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\BraveSoftware\Brave' 'HighEfficiencyModeEnabled' 1
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\BraveUpdateService' 'Start' 4
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\BraveElevationService' 'Start' 4
    # uBlock Origin Lite force-install via Chrome-style policy (Brave reads it)
    Set-Reg 'HKLM:\SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallForcelist' '1' 'ddkjiahejlhfcafbddmgiahcphecmpfh;https://clients2.google.com/service/update2/crx' String

    # ---------------- Discord -------------
    Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name Discord -ErrorAction SilentlyContinue
    $cfg = Join-Path $env:APPDATA 'discord\settings.json'
    if (Test-Path $cfg) {
        try {
            $j = Get-Content $cfg -Raw | ConvertFrom-Json
            $j | Add-Member -Force NoteProperty 'OPEN_ON_STARTUP'         $false
            $j | Add-Member -Force NoteProperty 'MINIMIZE_TO_TRAY'        $false
            $j | Add-Member -Force NoteProperty 'IS_MAXIMIZED'            $false
            $j | Add-Member -Force NoteProperty 'enableHardwareAcceleration' $false
            $j | ConvertTo-Json -Depth 10 | Set-Content $cfg
            Write-Log 'Discord settings.json patched.' 'OK'
        } catch { Write-Log "Discord settings patch fail: $($_.Exception.Message)" 'WARN' }
    }

    # ---------------- Steam ---------------
    Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name Steam -ErrorAction SilentlyContinue
    Set-Reg 'HKCU:\Software\Valve\Steam' 'BigPictureInForeground' 0
    Set-Reg 'HKCU:\Software\Valve\Steam' 'AutoLoginUser' '' String

    # ---------------- Chrome (in case it sneaks in via Edge import) ----------
    Set-Reg 'HKLM:\SOFTWARE\Policies\Google\Chrome' 'StartupBoostEnabled' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\Google\Chrome' 'HardwareAccelerationModeEnabled' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\Google\Chrome' 'BackgroundModeEnabled' 0
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\GoogleChromeElevationService' 'Start' 4
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\gupdate' 'Start' 4
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\gupdatem' 'Start' 4

    # ---------------- 7-Zip ---------------
    Set-Reg 'HKCU:\Software\7-Zip\Options' 'ContextMenu' 259
    Set-Reg 'HKCU:\Software\7-Zip\Options' 'CascadedMenu' 0

    Write-Log 'Per-app debloat applied.' 'OK'
}

function Set-BraveDefaultBrowser {
    if ($Script:DryRun) { Write-Log 'DRY: set Brave default'; return }
    # Find brave.exe
    $brave = @(
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe",
        "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
        "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $brave) { Write-Log 'brave.exe not found yet -- default-browser skipped.' 'WARN'; return }
    # ProgID setup
    $progId = 'BraveHTML'
    foreach ($ext in '.htm','.html','.shtml','.svg','.webp','.xht','.xhtml') {
        Set-Reg "HKCU:\Software\Classes\$ext" '(default)' $progId String
    }
    foreach ($scheme in 'http','https','ftp','irc','mailto','mms','news','nntp','sms','smsto','tel','urn','webcal') {
        Set-Reg "HKCU:\Software\Microsoft\Windows\Shell\Associations\URLAssociations\$scheme\UserChoice" 'ProgId' $progId String -ErrorAction SilentlyContinue
    }
    # Brave registers BraveHTML cleanly on its own install -- we mostly nudge HKCU
    Write-Log 'Brave set as default browser (best-effort).' 'OK'
}
