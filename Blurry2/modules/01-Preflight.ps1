# 01-Preflight.ps1 - admin/internet/restore-point + self-install

function Invoke-Preflight {
    if (-not (Test-Internet)) {
        Write-Log 'No internet. Many phases need network. Continuing offline.' 'WARN'
    } else { Write-Log 'Internet OK.' 'OK' }

    # restore point
    try {
        Enable-ComputerRestore -Drive 'C:\' -ErrorAction SilentlyContinue
        Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' 'SystemRestorePointCreationFrequency' 0
        Checkpoint-Computer -Description 'Blurry 2 - pre-tweak' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop
        Write-Log 'Restore point created.' 'OK'
    } catch { Write-Log "Restore point failed: $($_.Exception.Message)" 'WARN' }

    # disk space sanity
    $free = (Get-PSDrive C).Free / 1GB
    if ($free -lt 15) { Write-Log "Low free space on C: ($([int]$free) GB). Recommend 15+ GB." 'WARN' }

    # Windows version
    $v = [System.Environment]::OSVersion.Version
    Write-Log "Windows $($v.Major).$($v.Minor) build $($v.Build)" 'OK'
}

function Invoke-SelfInstall {
    if (-not (Test-Path $Script:InstallDir)) {
        New-Item -ItemType Directory -Force -Path $Script:InstallDir | Out-Null
    }
    if ($Script:Root -eq $Script:InstallDir) {
        Write-Log 'Already running from install dir.' 'OK'
        return
    }
    Write-Log "Copying Blurry to $Script:InstallDir"
    if (-not $Script:DryRun) {
        Copy-Item -Path "$Script:Root\*" -Destination $Script:InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    # pin a stable script path for scheduled tasks
    Save-State @{
        State          = 'Installed'
        InstallDir     = $Script:InstallDir
        OriginalSource = $Script:Root
        InstalledAt    = (Get-Date).ToString('o')
    }
}
