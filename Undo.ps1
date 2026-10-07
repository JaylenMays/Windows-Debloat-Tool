#Requires -Version 5.1
<#
.SYNOPSIS
    Reverts the registry and service changes made by Debloat.ps1, using backup\previous-values.json.
.NOTES
    Removed apps, Edge and OneDrive are NOT reinstalled by this script.
    Reinstall apps from the Microsoft Store, Edge from microsoft.com/edge, OneDrive from microsoft.com/onedrive.
    Alternatively, restore the System Restore point "Before Windows-Debloat-Tool".
#>
[CmdletBinding()]
param([switch]$DryRun)

$BackupFile = Join-Path $PSScriptRoot 'backup\previous-values.json'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Run this script as Administrator.' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $BackupFile)) {
    Write-Host "No backup found at $BackupFile. Nothing to undo." -ForegroundColor Yellow
    exit 1
}

$backup = Get-Content $BackupFile -Raw | ConvertFrom-Json

foreach ($r in @($backup.Registry)) {
    $label = "$($r.path) -> $($r.value)"
    if ($DryRun) { Write-Host "DRY RUN: restore $label" -ForegroundColor Yellow; continue }
    try {
        if ($r.undoRemoveKey) {
            Remove-Item -Path $r.undoRemoveKey -Recurse -Force -ErrorAction SilentlyContinue
        } elseif ($r.existed) {
            if (-not (Test-Path $r.path)) { New-Item -Path $r.path -Force | Out-Null }
            New-ItemProperty -Path $r.path -Name $r.value -Value $r.old -PropertyType $r.type -Force | Out-Null
        } else {
            Remove-ItemProperty -Path $r.path -Name $r.value -ErrorAction SilentlyContinue
        }
        Write-Host "Restored $label" -ForegroundColor Green
    } catch {
        Write-Host "Failed $label : $($_.Exception.Message)" -ForegroundColor Red
    }
}

foreach ($s in @($backup.Services)) {
    if ($DryRun) { Write-Host "DRY RUN: restore service $($s.name) to $($s.startType)" -ForegroundColor Yellow; continue }
    try {
        Set-Service -Name $s.name -StartupType $s.startType
        Write-Host "Restored service $($s.name) ($($s.startType))" -ForegroundColor Green
    } catch {
        Write-Host "Failed service $($s.name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nDone. Restart Windows (or sign out/in) for everything to take effect." -ForegroundColor Cyan
