# 04-Defender.ps1 - keep Defender on, just exclude game folders
# (the full-disable variant lives in the Advanced menu)

function Apply-DefenderExclusions {
    if ($Script:DryRun) { Write-Log 'DRY: Apply-DefenderExclusions'; return }

    $candidates = @(
        'C:\Program Files (x86)\Steam',
        'C:\Program Files\Epic Games',
        'C:\Riot Games',
        'C:\Program Files\Battle.net',
        'C:\Program Files (x86)\Battle.net',
        'C:\Program Files\WindowsApps\GamingServices*',
        'D:\Steam','D:\Games','E:\Steam','E:\Games','F:\Steam','F:\Games'
    )
    $extensions = @('.dll','.exe','.dat','.pak','.uasset','.umap','.bin')
    $procs      = @('VALORANT.exe','VALORANT-Win64-Shipping.exe','cs2.exe',
                    'csgo.exe','FortniteClient-Win64-Shipping.exe','RiotClientServices.exe',
                    'steam.exe','EpicGamesLauncher.exe','Discord.exe')
    foreach ($p in $candidates) {
        if (Test-Path $p) {
            try {
                Add-MpPreference -ExclusionPath $p -ErrorAction SilentlyContinue
                Write-Log "Defender exclude path: $p" 'OK'
            } catch {}
        }
    }
    foreach ($e in $extensions) {
        try { Add-MpPreference -ExclusionExtension $e -ErrorAction SilentlyContinue } catch {}
    }
    foreach ($pr in $procs) {
        try { Add-MpPreference -ExclusionProcess $pr -ErrorAction SilentlyContinue } catch {}
    }
    Write-Log 'Defender exclusions applied.' 'OK'
}

# ----------- Advanced (off by default) ----------------
function Disable-DefenderFully {
    # WinSux's aggressive Defender disable. Only invoked from Advanced menu.
    if ($Script:DryRun) { Write-Log 'DRY: Disable-DefenderFully'; return }
    Write-Log 'AGGRESSIVE: disabling Defender entirely...' 'WARN'
    $base = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender'
    Set-Reg $base 'DisableAntiSpyware' 1
    Set-Reg $base 'DisableAntiVirus' 1
    Set-Reg "$base\Real-Time Protection" 'DisableRealtimeMonitoring' 1
    Set-Reg "$base\Real-Time Protection" 'DisableBehaviorMonitoring' 1
    Set-Reg "$base\Real-Time Protection" 'DisableOnAccessProtection' 1
    Set-Reg "$base\Real-Time Protection" 'DisableScanOnRealtimeEnable' 1
    Set-Reg "$base\Spynet" 'SpynetReporting' 0
    Set-Reg "$base\Spynet" 'SubmitSamplesConsent' 2
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows Defender\Features' 'TamperProtection' 0
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Config' 'VulnerableDriverBlocklistEnable' 0
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' 'Enabled' 0
    # SmartScreen
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'EnableSmartScreen' 0
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AppHost' 'EnableWebContentEvaluation' 0
    Write-Log 'Defender disabled (advanced).' 'WARN'
}
