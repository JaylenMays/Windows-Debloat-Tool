# Blurry 2 - Windows 11 debloat + gaming-latency tool
# Single-file orchestrator. Run via Blurry.bat (auto-elevates).
# Modes:
#   Full       : end-to-end (debloat + tweaks + apps + driver). 2 reboots.
#   Clean      : fresh-restore (reapply tweaks + cache wipe + cache clear). ~2 min.
#   Apps       : install/refresh apps only.
#   Tweaks     : reapply registry + BCD + network + power + timer.
#   Driver     : DDU + latest NVIDIA + NVPI .nip import.
#   DryRun     : log only, no changes.
#   Schedule   : install scheduled tasks (weekly + onlogon Clean).
#   Menu       : interactive TUI (default if no args).

[CmdletBinding()]
param(
    [ValidateSet('Full','Clean','Apps','Tweaks','Driver','DryRun','Schedule','Menu','Resume','SafeBoot','PostBoot')]
    [string]$Mode = 'Menu',
    [switch]$Quiet
)

#region ---------------- bootstrap ----------------
$ErrorActionPreference = 'Continue'
$Script:Root         = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script:ModulePath   = Join-Path $Script:Root 'modules'
$Script:PayloadPath  = Join-Path $Script:Root 'payload'
$Script:LogPath      = Join-Path $Script:Root 'logs\blurry.log'
$Script:DryRun       = ($Mode -eq 'DryRun')
$Script:Quiet        = $Quiet.IsPresent
$Script:StateFile    = "$env:SystemDrive\Blurry\state.json"
$Script:InstallDir   = "$env:SystemDrive\Blurry"

if (-not (Test-Path (Split-Path $Script:LogPath))) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Script:LogPath) | Out-Null
}

# admin guard
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Run via Blurry.bat (administrator required)." -ForegroundColor Red
    exit 1
}

# silence the slow PS progress bar
$ProgressPreference = 'SilentlyContinue'

# console look (Talon-style: black bg, mint/cyan accents, white body)
$Host.UI.RawUI.BackgroundColor = 'Black'
$Host.UI.RawUI.ForegroundColor = 'White'
try { $Host.UI.RawUI.WindowTitle = 'Blurry 2 (Administrator)' } catch {}
Clear-Host
#endregion

#region ---------------- common helpers ----------------
function Write-Log {
    param([string]$Message,[string]$Level='INFO')
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'), $Level, $Message
    Add-Content -Path $Script:LogPath -Value $line -Encoding UTF8
    if (-not $Script:Quiet) {
        $color = switch ($Level) { 'WARN' { 'Yellow' } 'FAIL' { 'Red' } 'OK' { 'Green' } default { 'DarkGray' } }
        Write-Host "  $line" -ForegroundColor $color
    }
}

function Write-Phase {
    param([string]$Tag,[string]$Note='')
    $bar = ('-' * 78)
    if (-not $Script:Quiet) {
        Write-Host ""
        Write-Host (' {0} {1}' -f $Tag.PadRight(8), $Note) -ForegroundColor Cyan
        Write-Host " $bar" -ForegroundColor DarkCyan
    }
    Write-Log "=== PHASE $Tag $Note ==="
}

function Set-Reg {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)]$Value,
        [ValidateSet('DWord','QWord','String','ExpandString','MultiString','Binary')][string]$Type='DWord'
    )
    if ($Script:DryRun) { Write-Log "DRY-REG $Path :: $Name = $Value ($Type)"; return }
    try {
        if (-not (Test-Path $Path)) { New-Item -Path $Path -Force | Out-Null }
        New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force | Out-Null
    } catch {
        Write-Log "REG-FAIL $Path :: $Name -> $($_.Exception.Message)" 'WARN'
    }
}

function Remove-RegKey {
    param([Parameter(Mandatory)][string]$Path)
    if ($Script:DryRun) { Write-Log "DRY-DEL $Path"; return }
    try { Remove-Item -Path $Path -Recurse -Force -ErrorAction SilentlyContinue } catch {}
}

function Disable-Svc {
    param([Parameter(Mandatory)][string]$Name)
    if ($Script:DryRun) { Write-Log "DRY-SVC $Name -> Disabled"; return }
    try {
        Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
        Set-Service  -Name $Name -StartupType Disabled -ErrorAction SilentlyContinue
        # service won't have Start/Disabled if it's a kernel driver; fall back to reg
        Set-Reg "HKLM:\SYSTEM\CurrentControlSet\Services\$Name" 'Start' 4
    } catch {}
}

function Invoke-Phase {
    param([string]$Tag,[string]$Note,[scriptblock]$Action)
    Write-Phase $Tag $Note
    try { & $Action } catch { Write-Log "PHASE-FAIL $Tag -> $($_.Exception.Message)" 'FAIL' }
}

function Save-State {
    param([hashtable]$State)
    if (-not (Test-Path $Script:InstallDir)) { New-Item -ItemType Directory -Force -Path $Script:InstallDir | Out-Null }
    $State | ConvertTo-Json -Depth 5 | Set-Content -Path $Script:StateFile -Encoding UTF8
}

function Load-State {
    if (Test-Path $Script:StateFile) {
        return (Get-Content $Script:StateFile -Raw | ConvertFrom-Json)
    }
    return $null
}

function Test-Internet {
    Test-Connection -ComputerName 8.8.8.8 -Count 1 -Quiet -ErrorAction SilentlyContinue
}

# Make all helpers available to module dot-sources
Set-Variable -Name BLURRY_HELPERS_LOADED -Value $true -Scope Script
#endregion

#region ---------------- module loader ----------------
# IMPORTANT: dot-source at SCRIPT scope (not inside a function) so that module
# functions are visible to all callers, including Invoke-FullMode below.
$Script:ModuleFiles = Get-ChildItem -Path $Script:ModulePath -Filter *.ps1 -ErrorAction SilentlyContinue | Sort-Object Name
foreach ($f in $Script:ModuleFiles) {
    try {
        . $f.FullName
        Write-Log "Loaded module: $($f.Name)" 'OK'
    } catch {
        Write-Log "Module load fail: $($f.Name) :: $($_.Exception.Message)" 'FAIL'
    }
}
#endregion

#region ---------------- banner ----------------
function Show-Banner {
    if ($Script:Quiet) { return }
    Write-Host ''
    Write-Host '   ____  _                              ____  ' -ForegroundColor Cyan
    Write-Host '  | __ )| |_   _ _ __ _ __ _   _       |___ \ ' -ForegroundColor Cyan
    Write-Host '  |  _ \| | | | | ''__| ''__| | | |        __) |' -ForegroundColor Cyan
    Write-Host '  | |_) | | |_| | |  | |  | |_| |       / __/ ' -ForegroundColor Cyan
    Write-Host '  |____/|_|\__,_|_|  |_|   \__, |      |_____|' -ForegroundColor Cyan
    Write-Host '                           |___/              ' -ForegroundColor DarkCyan
    Write-Host '  Windows 11 Debloat & Gaming Latency Tool      v2.0' -ForegroundColor White
    Write-Host '  ' ('-' * 78) -ForegroundColor DarkCyan
    Write-Host ''
}
#endregion

#region ---------------- mode runners ----------------

function Invoke-FullMode {
    Write-Log '=== FULL MODE START ==='
    Invoke-Phase 'PRE'   'admin / internet / restore point' { Invoke-Preflight }
    Invoke-Phase 'COPY'  'install Blurry to C:\Blurry'      { Invoke-SelfInstall }
    Invoke-Phase 'APPX'  'remove bloat AppX (allowlist)'    { Remove-BloatAppx }
    Invoke-Phase 'EDGE'  'uninstall Edge (keep WebView2)'   { Remove-Edge }
    Invoke-Phase 'ONED'  'uninstall OneDrive'               { Remove-OneDrive }
    Invoke-Phase 'COPI'  'disable Copilot/Recall/Cortana'   { Disable-CopilotEtc }
    Invoke-Phase 'REG'   'apply deduped registry tweaks'    { Apply-RegistryTweaks }
    Invoke-Phase 'BCD'   'boot config tweaks'               { Apply-BcdTweaks }
    Invoke-Phase 'NET'   'TCP / NIC / QoS'                  { Apply-NetworkTweaks }
    Invoke-Phase 'USB'   'MSI mode + selective suspend off' { Apply-UsbTweaks }
    Invoke-Phase 'SVC'   'disable safe service set'         { Apply-ServiceTweaks }
    Invoke-Phase 'PWR'   'Smooth Gaming power plan'         { Apply-PowerTweaks }
    Invoke-Phase 'TIM'   'timer resolution + 0.5ms task'    { Apply-TimerTweaks }
    Invoke-Phase 'DEF'   'Defender game-folder exclusions'  { Apply-DefenderExclusions }
    Invoke-Phase 'APPS'  'install Brave / Steam / Discord / Riot / tools' { Install-AllApps }
    Invoke-Phase 'NVDL'  'download latest NVIDIA driver'    { Get-LatestNvidiaDriver }
    Invoke-Phase 'NVPI'  'stage NVPI + Low Latency .nip'    { Stage-Nvpi }
    Invoke-Phase 'AFF'   'P-core affinity for game exes'    { Apply-GameAffinity }
    Invoke-Phase 'SCHED' 'install weekly + onlogon Clean'   { Install-Schedules }
    Invoke-Phase 'SAFE'  'arm safe-boot DDU pass + reboot'  { Arm-SafeBootReboot }
    Write-Host ''
    Write-Host '  Rebooting into safe mode for DDU clean...' -ForegroundColor Yellow
    Start-Sleep 5
    if (-not $Script:DryRun) { shutdown /r /t 0 }
}

function Invoke-SafeBootMode {
    # Stage runs in safe mode after first reboot
    Write-Log '=== SAFE BOOT (DDU) START ==='
    Invoke-Phase 'DDU'   'remove existing GPU drivers' { Invoke-DduPass }
    Invoke-Phase 'NORM'  'restore normal boot + reboot' { Restore-NormalBoot }
    if (-not $Script:DryRun) { shutdown /r /t 0 }
}

function Invoke-PostBootMode {
    # Stage runs in normal mode after second reboot
    Write-Log '=== POST BOOT START ==='
    Invoke-Phase 'NV'    'install latest NVIDIA driver'    { Install-NvidiaDriver }
    Invoke-Phase 'NVPI'  'silentImport Low Latency.nip'    { Import-NvpiProfile }
    Invoke-Phase 'CLN'   'first-time fresh-restore pass'   { Invoke-CleanMode -SkipReg }
    Invoke-Phase 'DONE'  'final summary + log'             {
        Write-Host ''
        Write-Host '  Setup complete. Reboot one more time when convenient.' -ForegroundColor Green
        Write-Host '  Schedules installed: BlurryClean-Login (every login), BlurryClean-Weekly (Sun 04:00).' -ForegroundColor Green
    }
    Save-State @{ State='Done'; CompletedAt=(Get-Date).ToString('o') }
}

function Invoke-CleanMode {
    param([switch]$SkipReg)
    Write-Log '=== CLEAN MODE START ==='
    if (-not $SkipReg) {
        Invoke-Phase 'REG-RE' 'reapply registry tweaks' { Apply-RegistryTweaks }
        Invoke-Phase 'APPX-RE' 'sweep returning AppX bloat' { Remove-BloatAppx -Quick }
        Invoke-Phase 'TASK-RE' 'redisable known re-armed scheduled tasks' { Disable-KnownTasks }
        Invoke-Phase 'RUN-RE' 'sweep Run/RunOnce for known offenders' { Sweep-RunKeys }
    }
    Invoke-Phase 'CACHE' 'wipe caches (browser, Discord, NV, Steam shaders)' { Clear-AllCaches }
    Invoke-Phase 'TEMP'  'wipe Temp + Prefetch + Thumbnails'   { Clear-WindowsTemp }
    Invoke-Phase 'WINSXS' 'DISM component cleanup'             { Invoke-DismCleanup }
    Invoke-Phase 'DRVST' 'remove unused DriverStore entries'   { Remove-UnusedDrivers }
    Invoke-Phase 'EVT'   'clear all Event Logs'                { Clear-EventLogs }
    Invoke-Phase 'WU'    'wipe Windows Update download cache'  { Clear-WuCache }
    Invoke-Phase 'BIN'   'empty Recycle Bin + TRIM'            { Clear-RecycleBin; Invoke-Trim }
    Write-Host ''
    Write-Host '  Clean complete. Your install should feel fresh again.' -ForegroundColor Green
}

function Invoke-AppsMode {
    Invoke-Phase 'PRE'  'check internet'  { if (-not (Test-Internet)) { throw 'no internet' } }
    Invoke-Phase 'APPS' 'install / refresh apps' { Install-AllApps }
}

function Invoke-TweaksMode {
    Invoke-Phase 'REG'  'registry tweaks'   { Apply-RegistryTweaks }
    Invoke-Phase 'BCD'  'boot config'       { Apply-BcdTweaks }
    Invoke-Phase 'NET'  'network'           { Apply-NetworkTweaks }
    Invoke-Phase 'USB'  'USB MSI/suspend'   { Apply-UsbTweaks }
    Invoke-Phase 'SVC'  'services'          { Apply-ServiceTweaks }
    Invoke-Phase 'PWR'  'power plan'        { Apply-PowerTweaks }
    Invoke-Phase 'TIM'  'timer resolution'  { Apply-TimerTweaks }
    Invoke-Phase 'DEF'  'Defender exclusions' { Apply-DefenderExclusions }
}

function Invoke-DriverMode {
    Invoke-Phase 'PRE'  'preflight'         { Invoke-Preflight }
    Invoke-Phase 'NVDL' 'download latest NV driver' { Get-LatestNvidiaDriver }
    Invoke-Phase 'SAFE' 'arm safeboot DDU + reboot' { Arm-SafeBootReboot }
    Start-Sleep 5
    if (-not $Script:DryRun) { shutdown /r /t 0 }
}

function Invoke-DryRunMode {
    Write-Host '  DRY RUN: no changes will be made.' -ForegroundColor Yellow
    $Script:DryRun = $true
    Invoke-FullMode
}

function Invoke-ScheduleMode {
    Invoke-Phase 'COPY' 'install Blurry to C:\Blurry' { Invoke-SelfInstall }
    Invoke-Phase 'SCHED' 'install scheduled tasks'    { Install-Schedules }
    Write-Host ''
    Write-Host '  Tasks installed:' -ForegroundColor Green
    Write-Host '    BlurryClean-Login  (runs every login)' -ForegroundColor Green
    Write-Host '    BlurryClean-Weekly (runs Sunday 04:00)' -ForegroundColor Green
}
#endregion

#region ---------------- TUI menu ----------------
function Show-Menu {
    while ($true) {
        Show-Banner
        Write-Host '  [1] Full setup        debloat + tweaks + apps + driver  (2 reboots)' -ForegroundColor White
        Write-Host '  [2] Clean             refresh-feel pass                 (~3 min)'    -ForegroundColor White
        Write-Host '  [3] Apps only         (re)install Brave/Steam/Discord/...'           -ForegroundColor White
        Write-Host '  [4] Tweaks only       reapply reg + BCD + power + timers'            -ForegroundColor White
        Write-Host '  [5] Driver only       DDU + latest NVIDIA + NVPI'                    -ForegroundColor White
        Write-Host '  [6] Schedule          install weekly + onlogon Clean tasks'          -ForegroundColor White
        Write-Host '  [7] Dry run           log only, no changes'                          -ForegroundColor White
        Write-Host '  [8] Advanced          aggressive opt-ins (Defender / PnP / Spooler / etc)' -ForegroundColor Yellow
        Write-Host '  [Q] Quit'                                                            -ForegroundColor DarkGray
        Write-Host ''
        $sel = Read-Host '  >'
        switch ($sel.Trim().ToLower()) {
            '1' { Invoke-FullMode; return }
            '2' { Invoke-CleanMode; pause; Clear-Host }
            '3' { Invoke-AppsMode; pause; Clear-Host }
            '4' { Invoke-TweaksMode; pause; Clear-Host }
            '5' { Invoke-DriverMode; return }
            '6' { Invoke-ScheduleMode; pause; Clear-Host }
            '7' { Invoke-DryRunMode; return }
            '8' { Show-AdvancedMenu; Clear-Host }
            'q' { return }
            default { Write-Host '  Invalid choice.' -ForegroundColor Red; Start-Sleep 1; Clear-Host }
        }
    }
}
#endregion

#region ---------------- entry ----------------
Show-Banner
Write-Log "Blurry 2 launched. Mode=$Mode Quiet=$Script:Quiet DryRun=$Script:DryRun"

switch ($Mode) {
    'Full'     { Invoke-FullMode }
    'Clean'    { Invoke-CleanMode }
    'Apps'     { Invoke-AppsMode }
    'Tweaks'   { Invoke-TweaksMode }
    'Driver'   { Invoke-DriverMode }
    'DryRun'   { Invoke-DryRunMode }
    'Schedule' { Invoke-ScheduleMode }
    'SafeBoot' { Invoke-SafeBootMode }
    'PostBoot' { Invoke-PostBootMode }
    'Resume'   {
        $st = Load-State
        if ($st -and $st.State -eq 'AwaitSafeBoot') { Invoke-SafeBootMode }
        elseif ($st -and $st.State -eq 'AwaitPostBoot') { Invoke-PostBootMode }
        else { Show-Menu }
    }
    'Menu'     { Show-Menu }
}

Write-Log 'Blurry 2 exit.'
#endregion
