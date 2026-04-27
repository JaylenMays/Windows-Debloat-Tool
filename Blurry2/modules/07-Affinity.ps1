# 07-Affinity.ps1 - IFEO P-core affinity for game executables
# Detects 12th-gen+ Intel and 7000-series+ AMD hybrid CPUs.
# Pins listed game exes to performance cores via IFEO\PerfOptions\CpuPriorityClass + Affinity helper.

$Script:GameExes = @(
    'VALORANT.exe','VALORANT-Win64-Shipping.exe',
    'cs2.exe','csgo.exe',
    'FortniteClient-Win64-Shipping.exe',
    'r5apex.exe','rainbowsix.exe','rainbowsix_vulkan.exe',
    'overwatch.exe','BF2042.exe','MarvelRivals.exe','MarvelRivals-Win64-Shipping.exe'
)

function Get-PCoreCount {
    # Try IsHybridCore detection on Win11
    try {
        $cores = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue
        if ($cores.Name -match '12th|13th|14th|Core Ultra|7\d{3}X|9\d{3}X') {
            # P-cores on Intel hybrid: typically half the logical processors with HT, or NumberOfCores - E-cores
            # Without precise topology API, we default: assume first N logical = P-cores on Intel hybrid.
            # Conservative: pin to first 16 logical processors (covers most P-core counts).
            return 16
        }
    } catch {}
    return 0  # 0 = no affinity restriction
}

function Apply-GameAffinity {
    if ($Script:DryRun) { Write-Log 'DRY: Apply-GameAffinity'; return }
    $pcount = Get-PCoreCount
    if ($pcount -eq 0) {
        Write-Log 'CPU is not detected as hybrid -- skipping P-core pin.' 'INFO'
        # Still apply HighPriority class to game exes
        foreach ($exe in $Script:GameExes) {
            $k = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\$exe\PerfOptions"
            Set-Reg $k 'CpuPriorityClass' 3   # 3 = High
            Set-Reg $k 'IoPriority' 3
        }
        return
    }

    # Build affinity bitmask for P-cores (first $pcount logical processors)
    $mask = 0
    for ($i = 0; $i -lt $pcount; $i++) { $mask = $mask -bor (1 -shl $i) }

    foreach ($exe in $Script:GameExes) {
        $k = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\$exe\PerfOptions"
        Set-Reg $k 'CpuPriorityClass' 3
        Set-Reg $k 'IoPriority' 3
        # Note: IFEO doesn't expose Affinity directly. We register a logon hook that
        # sets affinity on game-process spawn. Lightweight WMI-based event subscription.
    }

    # Install permanent WMI event subscriber that sets affinity on game-process spawn
    Install-AffinityWatcher -PCoreMask $mask
    Write-Log "Game affinity: P-core mask=0x$($mask.ToString('X')); priority=High." 'OK'
}

function Install-AffinityWatcher {
    param([int]$PCoreMask)
    if ($Script:DryRun) { return }
    $exeList = ($Script:GameExes | ForEach-Object { "'$_'" }) -join ','
    $script = @"
`$mask = $PCoreMask
`$exes = @($exeList)
Register-WmiEvent -Query "SELECT * FROM Win32_ProcessStartTrace" -SourceIdentifier BlurryAffinity -Action {
    `$name = `$EventArgs.NewEvent.ProcessName
    if (`$using:exes -contains `$name) {
        try {
            `$p = Get-Process -Id `$EventArgs.NewEvent.ProcessID -ErrorAction Stop
            `$p.ProcessorAffinity = [IntPtr]`$using:mask
            `$p.PriorityClass = 'High'
        } catch {}
    }
}
while (`$true) { Start-Sleep 60 }
"@
    $watcherPath = Join-Path $Script:InstallDir 'AffinityWatcher.ps1'
    Set-Content -Path $watcherPath -Value $script -Encoding UTF8 -Force

    $taskName = 'BlurryAffinityWatcher'
    schtasks /delete /tn $taskName /f 2>$null | Out-Null
    $cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watcherPath`""
    schtasks /create /tn $taskName /tr $cmd /sc onstart /ru SYSTEM /rl HIGHEST /f 2>$null | Out-Null
    Write-Log "Affinity watcher task installed: $taskName" 'OK'
}
