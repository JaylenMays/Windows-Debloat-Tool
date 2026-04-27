# 06-Drivers.ps1 - latest NVIDIA driver download + DDU pass + clean install + NVPI

# Detect GPU and resolve latest driver via NVIDIA's lookup API
function Get-LatestNvidiaDriver {
    if (-not (Test-Internet)) { Write-Log 'No internet -- skipping NV download.' 'WARN'; return }
    $tmp = Join-Path $env:SystemDrive 'Blurry\downloads'
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null

    # Detect GPU model
    $gpu = (Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue |
            Where-Object Name -match 'NVIDIA' | Select-Object -First 1).Name
    if (-not $gpu) {
        Write-Log 'No NVIDIA GPU. Falling back to F:\ local installer.' 'WARN'
        Get-LocalNvidiaDriverFallback
        return
    }
    Write-Log "Detected GPU: $gpu" 'INFO'

    # The reliable approach: scrape NVIDIA's "latest GeForce Game Ready" download URL
    # rather than parameterized lookups (which change schema). We hit the API endpoint
    # https://www.nvidia.com/Download/processFind.aspx?psid=...&pfid=...&osid=57&lid=1&whql=1&lang=en-us
    # but the API is finicky. Easier: pull the JSON manifest GeForceNow uses.
    try {
        $manifest = Invoke-RestMethod -Uri 'https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php?func=DriverManualLookup&psid=127&pfid=931&osID=57&languageCode=1033&beta=null&isWHQL=1&dltype=-1&dch=1&upCRD=null&qnf=0&sort1=0&numberOfResults=1' -ErrorAction Stop
        if ($manifest.IDS -and $manifest.IDS.Count -gt 0) {
            $url = 'https:' + $manifest.IDS[0].downloadInfo.DownloadURL
            $version = $manifest.IDS[0].downloadInfo.Version
            $dest = Join-Path $tmp "nvidia-$version.exe"
            Write-Log "Latest NV driver: v$version" 'OK'
            Write-Log "Download: $url"
            if (-not $Script:DryRun) {
                Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -ErrorAction Stop
            }
            Save-State @{ State='AwaitSafeBoot'; NvDriverPath=$dest; NvDriverVersion=$version; SavedAt=(Get-Date).ToString('o') }
            return
        }
    } catch {
        Write-Log "NV manifest lookup failed: $($_.Exception.Message). Trying local F:\..." 'WARN'
    }
    Get-LocalNvidiaDriverFallback
}

function Get-LocalNvidiaDriverFallback {
    # Use whatever's on F:\ as fallback
    $candidates = @(
        'F:\etc\Everything\blurry op\Install\580.88-desktop-win10-win11-64bit-international-dch-whql.exe',
        'F:\etc\Everything\blurry op\Nvidia\590.26_gameready_win11_win10-dch_64bit_international.exe',
        'F:\etc\Everything\blurry op\Nvidia\581.29-desktop-win10-win11-64bit-international-dch-whql.exe',
        'F:\etc\Everything\blurry op\Nvidia\576.80-desktop-win10-win11-64bit-international-dch-whql.exe'
    )
    $found = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($found) {
        Write-Log "Using local NV driver: $found" 'OK'
        $tmp = Join-Path $env:SystemDrive 'Blurry\downloads'
        New-Item -ItemType Directory -Force -Path $tmp | Out-Null
        $dest = Join-Path $tmp (Split-Path $found -Leaf)
        if (-not (Test-Path $dest)) {
            Copy-Item $found $dest -Force
        }
        Save-State @{ State='AwaitSafeBoot'; NvDriverPath=$dest; SavedAt=(Get-Date).ToString('o') }
    } else {
        Write-Log 'No NVIDIA driver found locally or online. Driver phase will be skipped.' 'WARN'
    }
}

# Stage NVPI + the .nip into install dir
function Stage-Nvpi {
    if ($Script:DryRun) { Write-Log 'DRY: Stage-Nvpi'; return }
    $localNip = 'F:\etc\Everything\blurry op\Nvidia\Low Latency Ultra.nip'
    $payloadNip = Join-Path $Script:PayloadPath 'LowLatencyUltra.nip'
    if (Test-Path $localNip) {
        Copy-Item $localNip $payloadNip -Force
        Write-Log "Staged: $payloadNip" 'OK'
    } elseif (-not (Test-Path $payloadNip)) {
        Write-Log "NVPI .nip not found locally or in payload -- manual import required." 'WARN'
    }
    # NVPI exe -- prefer local
    $localNvpi = 'F:\etc\Everything\blurry op\Nvidia\nvidiaProfileInspector.exe'
    $payloadExe = Join-Path $Script:PayloadPath 'nvidiaProfileInspector.exe'
    if (Test-Path $localNvpi) {
        Copy-Item $localNvpi $payloadExe -Force
    }
}

function Arm-SafeBootReboot {
    if ($Script:DryRun) { Write-Log 'DRY: Arm-SafeBootReboot'; return }
    $stableScript = Join-Path $Script:InstallDir 'Blurry.ps1'
    if (-not (Test-Path $stableScript)) { Invoke-SelfInstall }

    # Stage one (safe boot) - DDU pass
    $stepOneCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$stableScript`" -Mode SafeBoot -Quiet"
    cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce`" /v `"*!BlurryStepOne`" /t REG_SZ /d `"$stepOneCmd`" /f >nul 2>&1"

    # Step two (post-boot) - actual driver install
    $stepTwoCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$stableScript`" -Mode PostBoot -Quiet"
    cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce`" /v `"!BlurryStepTwo`" /t REG_SZ /d `"$stepTwoCmd`" /f >nul 2>&1"

    # Enable safeboot minimal
    Start-Process bcdedit.exe -ArgumentList '/set {current} safeboot minimal' -Wait -NoNewWindow

    Save-State @{ State='AwaitSafeBoot'; ArmedAt=(Get-Date).ToString('o') }
    Write-Log 'Safe-boot DDU armed. Reboot imminent.' 'OK'
}

function Restore-NormalBoot {
    if ($Script:DryRun) { Write-Log 'DRY: Restore-NormalBoot'; return }
    Start-Process bcdedit.exe -ArgumentList '/deletevalue {current} safeboot' -Wait -NoNewWindow
    Save-State @{ State='AwaitPostBoot'; UndoneAt=(Get-Date).ToString('o') }
}

function Invoke-DduPass {
    # We expect DDU on disk in payload or installed via Apps phase
    $ddu = @(
        "$env:ProgramFiles\Display Driver Uninstaller\Display Driver Uninstaller.exe",
        "${env:ProgramFiles(x86)}\Display Driver Uninstaller\Display Driver Uninstaller.exe",
        "$env:SystemRoot\Temp\ddu\Display Driver Uninstaller.exe",
        (Join-Path $Script:PayloadPath 'ddu\Display Driver Uninstaller.exe')
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $ddu) {
        Write-Log 'DDU not found -- skipping clean. Driver will install over existing.' 'WARN'
        return
    }

    # Apply WinSux's Settings.xml (high-confidence config)
    $settingsDir = Split-Path $ddu
    $settingsFile = Join-Path $settingsDir 'Settings\Settings.xml'
    if (-not (Test-Path (Split-Path $settingsFile))) {
        New-Item -ItemType Directory -Force -Path (Split-Path $settingsFile) | Out-Null
    }
    $cfg = @'
<?xml version="1.0" encoding="utf-8"?>
<DisplayDriverUninstaller Version="18.1.4.2">
  <Settings>
    <SelectedLanguage>en-US</SelectedLanguage>
    <RemoveMonitors>True</RemoveMonitors>
    <RemoveCrimsonCache>True</RemoveCrimsonCache>
    <RemoveAMDDirs>True</RemoveAMDDirs>
    <RemoveAudioBus>True</RemoveAudioBus>
    <RemoveAMDKMPFD>True</RemoveAMDKMPFD>
    <RemoveNvidiaDirs>True</RemoveNvidiaDirs>
    <RemovePhysX>True</RemovePhysX>
    <Remove3DTVPlay>True</Remove3DTVPlay>
    <RemoveGFE>True</RemoveGFE>
    <RemoveNVBROADCAST>True</RemoveNVBROADCAST>
    <RemoveNVCP>True</RemoveNVCP>
    <RemoveINTELCP>True</RemoveINTELCP>
    <RemoveINTELIGS>True</RemoveINTELIGS>
    <RemoveOneAPI>True</RemoveOneAPI>
    <RemoveAMDCP>True</RemoveAMDCP>
    <UseRoamingConfig>False</UseRoamingConfig>
    <CheckUpdates>False</CheckUpdates>
    <CreateRestorePoint>False</CreateRestorePoint>
    <SaveLogs>False</SaveLogs>
    <RemoveVulkan>True</RemoveVulkan>
    <ShowOffer>False</ShowOffer>
    <EnableSafeModeDialog>False</EnableSafeModeDialog>
    <PreventWinUpdate>True</PreventWinUpdate>
    <UsedBCD>False</UsedBCD>
    <KeepNVCPopt>False</KeepNVCPopt>
    <RememberLastChoice>False</RememberLastChoice>
  </Settings>
</DisplayDriverUninstaller>
'@
    Set-Content -Path $settingsFile -Value $cfg -Force
    Set-ItemProperty -Path $settingsFile -Name IsReadOnly -Value $true -ErrorAction SilentlyContinue

    Write-Log "Running DDU: $ddu" 'INFO'
    if (-not $Script:DryRun) {
        Start-Process -FilePath $ddu -ArgumentList '-cleanall', '-silent' -Wait -ErrorAction SilentlyContinue
    }
}

function Install-NvidiaDriver {
    $st = Load-State
    if (-not $st -or -not $st.NvDriverPath -or -not (Test-Path $st.NvDriverPath)) {
        Write-Log 'NV driver path not in state file. Skipping install.' 'WARN'
        return
    }
    $driver = $st.NvDriverPath
    Write-Log "Installing NVIDIA driver: $driver" 'INFO'

    # Prefer NVCleanstall if present (debloated install)
    $nvc = @(
        (Join-Path $Script:PayloadPath 'NVCleanstall.exe'),
        (Join-Path $env:SystemDrive 'Blurry\downloads\NVCleanstall.exe'),
        'F:\etc\Everything\blurry op\Nvidia\NVCleanstall_1.19.0.exe'
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($nvc) {
        Write-Log "Using NVCleanstall: $nvc"
        $args = @('/silent','/source', $driver,
                  '/components', 'graphics:include,physx:exclude,audio:exclude,display:exclude,usb:exclude,broadcast:exclude,gfe:exclude,telemetry:exclude,3dtvplay:exclude,nvcontainer:exclude')
        if (-not $Script:DryRun) {
            Start-Process -FilePath $nvc -ArgumentList $args -Wait -ErrorAction SilentlyContinue
        }
    } else {
        # Plain unattended install
        if (-not $Script:DryRun) {
            Start-Process -FilePath $driver -ArgumentList '-s','-noreboot','-clean' -Wait -ErrorAction SilentlyContinue
        }
    }
    Write-Log 'NVIDIA driver install complete.' 'OK'
}

function Import-NvpiProfile {
    $nvpi = @(
        (Join-Path $Script:PayloadPath 'nvidiaProfileInspector.exe'),
        'F:\etc\Everything\blurry op\Nvidia\nvidiaProfileInspector.exe',
        "$env:ProgramFiles\NVIDIA Profile Inspector\nvidiaProfileInspector.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    $nip = @(
        (Join-Path $Script:PayloadPath 'LowLatencyUltra.nip'),
        'F:\etc\Everything\blurry op\Nvidia\Low Latency Ultra.nip'
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $nvpi -or -not $nip) {
        Write-Log "NVPI or .nip missing -- skipping import. nvpi=$nvpi nip=$nip" 'WARN'
        return
    }
    Write-Log "NVPI: $nvpi  <==  $nip"
    if (-not $Script:DryRun) {
        Start-Process -FilePath $nvpi -ArgumentList "-silentImport `"$nip`"" -Wait -ErrorAction SilentlyContinue
    }
    Write-Log 'NVPI Low Latency Ultra imported.' 'OK'
}
