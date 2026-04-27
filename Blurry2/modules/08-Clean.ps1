# 08-Clean.ps1 - the fresh-restore feature
# Wipes the things that grow / accumulate / re-arm during normal Windows life.

function Clear-AllCaches {
    $paths = @(
        # Browser
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Cache",
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Code Cache",
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\GPUCache",
        "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache",
        "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Code Cache",
        "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\GPUCache",
        "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache",
        # Discord (often 2-3 GB)
        "$env:APPDATA\discord\Cache",
        "$env:APPDATA\discord\Code Cache",
        "$env:APPDATA\discord\GPUCache",
        # NVIDIA shader cache
        "$env:LOCALAPPDATA\NVIDIA\DXCache",
        "$env:LOCALAPPDATA\NVIDIA\GLCache",
        # Steam shader cache
        "$env:ProgramFiles(x86)\Steam\steamapps\shadercache",
        'C:\Program Files (x86)\Steam\steamapps\shadercache',
        'D:\Steam\steamapps\shadercache','E:\Steam\steamapps\shadercache','F:\Steam\steamapps\shadercache'
    )
    foreach ($p in $paths) {
        if (Test-Path $p) {
            try {
                Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
                Write-Log "Cleared: $p" 'OK'
            } catch {}
        }
    }
}

function Clear-WindowsTemp {
    $paths = @(
        "$env:TEMP",
        "$env:WINDIR\Temp",
        "$env:WINDIR\Prefetch",
        "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"  # thumbcache_*
    )
    foreach ($p in $paths) {
        if (-not (Test-Path $p)) { continue }
        try {
            Get-ChildItem $p -Force -ErrorAction SilentlyContinue |
                ForEach-Object {
                    if ($_.Name -match '^thumbcache_|iconcache_' -or $p -ne "$env:LOCALAPPDATA\Microsoft\Windows\Explorer") {
                        Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
                    }
                }
            Write-Log "Cleaned: $p" 'OK'
        } catch {}
    }
}

function Invoke-DismCleanup {
    if ($Script:DryRun) { Write-Log 'DRY: DISM cleanup'; return }
    Write-Log 'DISM /StartComponentCleanup /ResetBase ...'
    Start-Process Dism.exe -ArgumentList '/Online','/Cleanup-Image','/StartComponentCleanup' -Wait -NoNewWindow -ErrorAction SilentlyContinue
    Write-Log 'DISM done.' 'OK'
}

function Remove-UnusedDrivers {
    if ($Script:DryRun) { Write-Log 'DRY: drivers'; return }
    # List third-party OEM driver inf packages, attempt removal of unattached ones.
    $list = & pnputil /enum-drivers 2>$null
    if (-not $list) { return }
    $blocks = ($list -join "`n") -split "`r?`n`r?`n"
    $candidates = @()
    foreach ($b in $blocks) {
        if ($b -match 'Published Name :\s+(oem\d+\.inf)') {
            $oem = $matches[1]
            # Only try old NVIDIA / AMD / Intel / Realtek / Logitech to be safe
            if ($b -match 'NVIDIA|Advanced Micro Devices|AMD|Intel|Realtek|Logitech') {
                $candidates += $oem
            }
        }
    }
    foreach ($oem in $candidates) {
        try {
            & pnputil /delete-driver $oem /uninstall 2>$null | Out-Null
            Write-Log "DriverStore removed: $oem" 'OK'
        } catch {}
    }
}

function Clear-EventLogs {
    if ($Script:DryRun) { Write-Log 'DRY: event logs'; return }
    Get-WinEvent -ListLog * -ErrorAction SilentlyContinue |
        Where-Object { $_.IsEnabled -and $_.RecordCount -gt 0 } |
        ForEach-Object {
            try { wevtutil cl $_.LogName 2>$null } catch {}
        }
    Write-Log 'Event logs cleared.' 'OK'
}

function Clear-WuCache {
    if ($Script:DryRun) { Write-Log 'DRY: WU cache'; return }
    Stop-Service wuauserv -Force -ErrorAction SilentlyContinue
    Stop-Service dosvc    -Force -ErrorAction SilentlyContinue
    Stop-Service bits     -Force -ErrorAction SilentlyContinue
    foreach ($p in "$env:WINDIR\SoftwareDistribution\Download","$env:WINDIR\SoftwareDistribution\DataStore",
                   "$env:LOCALAPPDATA\Microsoft\Windows\DeliveryOptimization") {
        if (Test-Path $p) { Remove-Item "$p\*" -Recurse -Force -ErrorAction SilentlyContinue }
    }
    Start-Service wuauserv -ErrorAction SilentlyContinue
    Write-Log 'WU + Delivery Opt caches cleared.' 'OK'
}

function Clear-RecycleBin {
    if ($Script:DryRun) { Write-Log 'DRY: recycle bin'; return }
    try { Clear-RecycleBin -Force -ErrorAction SilentlyContinue } catch {}
    Write-Log 'Recycle Bin emptied.' 'OK'
}

function Invoke-Trim {
    if ($Script:DryRun) { Write-Log 'DRY: TRIM'; return }
    try {
        defrag C: /L 2>&1 | Out-Null
        Write-Log 'TRIM run on C:' 'OK'
    } catch {}
}
