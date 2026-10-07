#Requires -Version 5.1
<#
.SYNOPSIS
    Windows 11 debloat tool.
.DESCRIPTION
    Removes preinstalled apps, Microsoft Edge and OneDrive, and applies privacy/UI tweaks.
    Run as Administrator. Use -DryRun first to see what would happen.
.PARAMETER DryRun
    Print actions without changing anything.
.PARAMETER Auto
    Do not prompt; run every section (including optional UI tweaks and service changes).
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Auto
)

$ErrorActionPreference = 'Continue'
$Root       = $PSScriptRoot
$BackupDir  = Join-Path $Root 'backup'
$BackupFile = Join-Path $BackupDir 'previous-values.json'
$LogFile    = Join-Path $Root 'debloat-log.txt'
$Summary    = [ordered]@{ Removed = @(); Changed = @(); Skipped = @(); Failed = @() }
$Backup     = @{ Registry = @(); Services = @() }

function Write-Log {
    param([string]$Message, [string]$Color = 'Gray')
    $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line -ForegroundColor $Color
    if (-not $DryRun) { Add-Content -Path $LogFile -Value $line }
}

function Confirm-Step {
    param([string]$Question)
    if ($Auto) { return $true }
    $a = Read-Host "$Question [y/N]"
    return ($a -match '^(y|yes)$')
}

function Do-Action {
    param([string]$Description, [scriptblock]$Action, [string]$Category = 'Changed')
    if ($DryRun) {
        Write-Log "DRY RUN: $Description" 'Yellow'
        return
    }
    try {
        & $Action
        Write-Log "OK: $Description" 'Green'
        $Summary[$Category] += $Description
    } catch {
        Write-Log "FAILED: $Description - $($_.Exception.Message)" 'Red'
        $Summary.Failed += $Description
    }
}

# ---------------------------------------------------------------- safety checks
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'This script must be run as Administrator. Use Run.bat or an elevated PowerShell.' -ForegroundColor Red
    exit 1
}
$build = [Environment]::OSVersion.Version.Build
if ($build -lt 22000) {
    Write-Host "This tool targets Windows 11 (build 22000+). Detected build $build." -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '=== Windows-Debloat-Tool ===' -ForegroundColor Cyan
if ($DryRun) { Write-Host 'DRY RUN: nothing will be changed.' -ForegroundColor Yellow }
else {
    Write-Host 'This will remove apps (including Edge, OneDrive, Photos, Calculator, Notepad) and change settings.' -ForegroundColor Yellow
    if (-not (Confirm-Step 'Continue?')) { exit 0 }
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
    Do-Action 'Create System Restore point' {
        Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
        Checkpoint-Computer -Description 'Before Windows-Debloat-Tool' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
    }
}

# ---------------------------------------------------------------- helpers
function Set-RegValue {
    param($Tweak)
    $path = $Tweak.path; $name = $Tweak.value
    $existed = $false; $old = $null
    if (Test-Path $path) {
        $item = Get-ItemProperty -Path $path -ErrorAction SilentlyContinue
        if ($null -ne $item -and $item.PSObject.Properties.Name -contains $name) {
            $existed = $true; $old = $item.$name
        }
    }
    $Backup.Registry += [pscustomobject]@{
        path = $path; value = $name; existed = $existed; old = $old
        type = $Tweak.type; undoRemoveKey = $Tweak.undoRemoveKey
    }
    if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
    if ($name -eq '(default)') { Set-Item -Path $path -Value $Tweak.data }
    else { New-ItemProperty -Path $path -Name $name -Value $Tweak.data -PropertyType $Tweak.type -Force | Out-Null }
}

function Save-Backup {
    if ($DryRun) { return }
    # Merge with any earlier backup so a second run never overwrites the original values.
    $existing = $null
    if (Test-Path $BackupFile) { $existing = Get-Content $BackupFile -Raw | ConvertFrom-Json }
    $reg = @($Backup.Registry); $svc = @($Backup.Services)
    if ($existing) {
        $seenR = @{}; foreach ($r in @($existing.Registry)) { $seenR["$($r.path)|$($r.value)"] = $true }
        $reg = @($existing.Registry) + @($reg | Where-Object { -not $seenR["$($_.path)|$($_.value)"] })
        $seenS = @{}; foreach ($s in @($existing.Services)) { $seenS[$s.name] = $true }
        $svc = @($existing.Services) + @($svc | Where-Object { -not $seenS[$_.name] })
    }
    @{ Registry = $reg; Services = $svc } | ConvertTo-Json -Depth 5 | Set-Content -Path $BackupFile -Encoding UTF8
}

# ---------------------------------------------------------------- 1. apps
Write-Host "`n--- Remove preinstalled apps ---" -ForegroundColor Cyan
if (Confirm-Step 'Remove apps listed in config\apps.txt (Photos, Calculator, Notepad, Xbox, Clipchamp, etc.)?') {
    $patterns = Get-Content (Join-Path $Root 'config\apps.txt') |
        ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') }
    foreach ($p in $patterns) {
        $installed   = @(Get-AppxPackage -AllUsers -Name $p -ErrorAction SilentlyContinue)
        $provisioned = @(Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like $p })
        if (-not $installed -and -not $provisioned) { $Summary.Skipped += "$p (not installed)"; continue }
        foreach ($pkg in $installed) {
            Do-Action "Remove app $($pkg.Name)" { Remove-AppxPackage -Package $pkg.PackageFullName -AllUsers -ErrorAction Stop } 'Removed'
        }
        foreach ($pkg in $provisioned) {
            Do-Action "Remove provisioned app $($pkg.DisplayName)" { Remove-AppxProvisionedPackage -Online -PackageName $pkg.PackageName -ErrorAction Stop | Out-Null } 'Removed'
        }
    }
} else { $Summary.Skipped += 'App removal' }

# ---------------------------------------------------------------- 2. Edge
Write-Host "`n--- Remove Microsoft Edge ---" -ForegroundColor Cyan
Write-Host 'Note: WebView2 Runtime is kept because other apps depend on it. Windows Update may try to reinstall Edge; a policy is set to block that.' -ForegroundColor DarkYellow
if (Confirm-Step 'Uninstall Microsoft Edge?') {
    $setup = Get-ChildItem "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\*\Installer\setup.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $setup) {
        $Summary.Skipped += 'Edge (installer not found, may already be removed)'
        Write-Log 'Edge installer not found; skipping.' 'Yellow'
    } else {
        Do-Action 'Uninstall Microsoft Edge' {
            Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force
            $proc = Start-Process -FilePath $setup.FullName -Wait -PassThru `
                -ArgumentList '--uninstall', '--system-level', '--verbose-logging', '--force-uninstall'
            # Edge setup returns 19 when it is already uninstalled/blocked; treat other non-zero as a warning.
            if ($proc.ExitCode -ne 0) { Write-Log "Edge setup exit code: $($proc.ExitCode) (uninstall may be blocked in your region/build)" 'Yellow' }
            Remove-Item "$env:PUBLIC\Desktop\Microsoft Edge.lnk", "$env:USERPROFILE\Desktop\Microsoft Edge.lnk" -Force -ErrorAction SilentlyContinue
        } 'Removed'
        Do-Action 'Block Edge reinstall via Windows Update' {
            Set-RegValue ([pscustomobject]@{ path = 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate'; value = 'DoNotUpdateToEdgeWithChromium'; type = 'DWord'; data = 1 })
        }
    }
} else { $Summary.Skipped += 'Edge removal' }

# ---------------------------------------------------------------- 3. OneDrive
Write-Host "`n--- Remove OneDrive ---" -ForegroundColor Cyan
Write-Host 'Note: files already in your OneDrive folder are NOT deleted. Make sure they are copied locally before uninstalling.' -ForegroundColor DarkYellow
if (Confirm-Step 'Uninstall OneDrive?') {
    $od = "$env:SystemRoot\SysWOW64\OneDriveSetup.exe"
    if (-not (Test-Path $od)) { $od = "$env:SystemRoot\System32\OneDriveSetup.exe" }
    if (-not (Test-Path $od)) {
        $Summary.Skipped += 'OneDrive (installer not found, may already be removed)'
        Write-Log 'OneDriveSetup.exe not found; skipping.' 'Yellow'
    } else {
        Do-Action 'Uninstall OneDrive' {
            Stop-Process -Name OneDrive -Force -ErrorAction SilentlyContinue
            Start-Process -FilePath $od -ArgumentList '/uninstall' -Wait
        } 'Removed'
    }
    Do-Action 'Disable OneDrive file sync via policy' {
        Set-RegValue ([pscustomobject]@{ path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\OneDrive'; value = 'DisableFileSyncNGSC'; type = 'DWord'; data = 1 })
    }
} else { $Summary.Skipped += 'OneDrive removal' }

# ---------------------------------------------------------------- 4/5. tweaks
$tweaks = Get-Content (Join-Path $Root 'config\tweaks.json') -Raw | ConvertFrom-Json

Write-Host "`n--- Privacy and telemetry tweaks ---" -ForegroundColor Cyan
if (Confirm-Step 'Apply privacy and telemetry tweaks (telemetry, ads, suggestions, Copilot, Recall, Widgets, Chat)?') {
    foreach ($t in ($tweaks | Where-Object group -eq 'privacy')) {
        Do-Action "Tweak: $($t.name)" { Set-RegValue $t }
    }
} else { $Summary.Skipped += 'Privacy tweaks' }

Write-Host "`n--- Optional UI and performance tweaks ---" -ForegroundColor Cyan
foreach ($t in ($tweaks | Where-Object group -eq 'ui')) {
    if (Confirm-Step "Apply: $($t.name)?") { Do-Action "Tweak: $($t.name)" { Set-RegValue $t } }
    else { $Summary.Skipped += $t.name }
}

if (Confirm-Step 'Disable telemetry services (DiagTrack, dmwappushservice)?') {
    foreach ($svcName in 'DiagTrack', 'dmwappushservice') {
        $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
        if (-not $svc) { $Summary.Skipped += "Service $svcName (not found)"; continue }
        $Backup.Services += [pscustomobject]@{ name = $svcName; startType = [string]$svc.StartType }
        Do-Action "Disable service $svcName" {
            Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
            Set-Service -Name $svcName -StartupType Disabled
        }
    }
} else { $Summary.Skipped += 'Telemetry services' }

# ---------------------------------------------------------------- 6. output
Save-Backup

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
foreach ($k in $Summary.Keys) {
    Write-Host ("{0}: {1}" -f $k, $Summary[$k].Count) -ForegroundColor White
    foreach ($i in $Summary[$k]) { Write-Host "   - $i" }
}
if (-not $DryRun) {
    $Summary.GetEnumerator() | ForEach-Object {
        Add-Content $LogFile "`n$($_.Key) ($($_.Value.Count)):"
        $_.Value | ForEach-Object { Add-Content $LogFile "  - $_" }
    }
    Write-Host "`nLog saved to $LogFile. Settings backup: $BackupFile (use Undo.ps1 to restore)." -ForegroundColor Gray
    if (Confirm-Step 'Restart now to finish applying changes?') { Restart-Computer -Force }
}
