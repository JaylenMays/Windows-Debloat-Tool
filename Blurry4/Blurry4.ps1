# =============================================================================
# Blurry Windows Debloat Tool 3
# Fresh-install, fire-and-forget Windows 11 debloat + gaming tuning.
# Cloned from fr33thy's WinSux (3-stage: Main -> SafeBoot/DDU -> StepTwo)
# with these additions: Steam/Discord/Valorant/Logitech OMM/Xbox-app-kept,
# 600Hz EnableTiledDisplay veto, restore point, persistent log.
#
# Run via Blurry4.bat (auto-elevates).
# =============================================================================

#region ------------------- bootstrap -------------------
trap {
    Write-Host ""
    Write-Host "  !!  Blurry 4 hit an unhandled error  !!" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Script: $PSCommandPath" -ForegroundColor DarkGray
    Write-Host "  Line:   $($_.InvocationInfo.ScriptLineNumber)  $($_.InvocationInfo.Line.Trim())" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Press any key to close this window..." -ForegroundColor Yellow
    try { [void][System.Console]::ReadKey($true) } catch { Read-Host | Out-Null }
    Exit 1
}

If (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Start-Process PowerShell.exe -ArgumentList ("-NoExit -NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $PSCommandPath) -Verb RunAs
    Exit
}

$Host.UI.RawUI.WindowTitle      = "Blurry 4 (Administrator)"
$Host.UI.RawUI.BackgroundColor  = "Black"
$Host.UI.RawUI.ForegroundColor  = "White"
try { $Host.PrivateData.ProgressBackgroundColor = "Black" } catch {}
try { $Host.PrivateData.ProgressForegroundColor = "White" } catch {}
Clear-Host

$ProgressPreference   = 'SilentlyContinue'
$ErrorActionPreference= 'Continue'

$Script:LogDir  = "$env:SystemDrive\Blurry4\logs"
$Script:LogPath = Join-Path $Script:LogDir "Blurry4.log"
$Script:TempDir = "$env:SystemRoot\Temp"
if (-not (Test-Path $Script:LogDir)) { New-Item -ItemType Directory -Force -Path $Script:LogDir | Out-Null }

function Write-Log {
    param([string]$Msg, [string]$Lvl='INFO')
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'), $Lvl, $Msg
    Add-Content -Path $Script:LogPath -Value $line -Encoding UTF8
    $color = switch ($Lvl) { 'WARN' {'Yellow'} 'FAIL' {'Red'} 'OK' {'Green'} 'STAGE' {'Cyan'} default {'Gray'} }
    Write-Host $line -ForegroundColor $color
}

function Write-Banner {
    Write-Host ""
    Write-Host "  ____  _                       _____ "        -ForegroundColor Cyan
    Write-Host " | __ )| |_   _ _ __ _ __ _   _|___ /_ "       -ForegroundColor Cyan
    Write-Host " |  _ \| | | | | '__| '__| | | | |_ \(_)"      -ForegroundColor Cyan
    Write-Host " | |_) | | |_| | |  | |  | |_| |___) |_ "      -ForegroundColor Cyan
    Write-Host " |____/|_|\__,_|_|  |_|   \__, |____/(_)"      -ForegroundColor Cyan
    Write-Host "                          |___/         "      -ForegroundColor DarkCyan
    Write-Host "  Windows 11 Debloat & Gaming Latency Tool   v3.0" -ForegroundColor White
    Write-Host "  Based on fr33thy's WinSux. NVIDIA / 600Hz tuned." -ForegroundColor DarkGray
    Write-Host ('  ' + ('-' * 70))                               -ForegroundColor DarkCyan
    Write-Host ""
}

function Test-Internet {
    Test-Connection -ComputerName "8.8.8.8" -Count 1 -Quiet -ErrorAction SilentlyContinue
}

# Faster downloads (raw HttpWebRequest stream copy). Same as fr33thy.
function Get-FileFromWeb {
    param([Parameter(Mandatory)][string]$URL, [Parameter(Mandatory)][string]$File)
    try {
        $Request = [System.Net.HttpWebRequest]::Create($URL)
        $Request.AllowAutoRedirect = $true
        $Response = $Request.GetResponse()
        if ($Response.StatusCode -in 401,403,404) { throw "$($Response.StatusCode) '$URL'." }
        if ($File -match '^\.\\') { $File = Join-Path (Get-Location -PSProvider 'FileSystem') ($File -Split '^\.')[1] }
        if ($File -and !(Split-Path $File)) { $File = Join-Path (Get-Location -PSProvider 'FileSystem') $File }
        if ($File) { $dir = [System.IO.Path]::GetDirectoryName($File); if (!(Test-Path $dir)) { [System.IO.Directory]::CreateDirectory($dir) | Out-Null } }
        [byte[]]$Buffer = New-Object byte[] 1048576
        [long]$Total = [long]$Count = 0
        $Reader = $Response.GetResponseStream()
        $Writer = New-Object System.IO.FileStream $File, 'Create'
        do {
            $Count = $Reader.Read($Buffer, 0, $Buffer.Length)
            $Writer.Write($Buffer, 0, $Count)
            $Total += $Count
        } while ($Count -gt 0)
    } finally {
        if ($Reader) { $Reader.Close() }
        if ($Writer) { $Writer.Close() }
    }
}
#endregion

Write-Banner
Write-Log "Blurry 4 launched. PID=$PID UserDomain=$env:USERDOMAIN" 'STAGE'

# ---- Internet check ----------------------------------------------------------
if (-not (Test-Internet)) {
    Write-Log "No internet. Aborting." 'FAIL'
    Write-Host "Internet required. Plug in or fix network, then rerun." -ForegroundColor Red
    Pause; Exit 1
}
Write-Log "Internet OK." 'OK'

# ---- Restore point -----------------------------------------------------------
Write-Log "Creating restore point 'Blurry 4 - pre-debloat'..." 'STAGE'
try {
    Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
    cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore`" /v SystemRestorePointCreationFrequency /t REG_DWORD /d 0 /f >nul 2>&1"
    Checkpoint-Computer -Description "Blurry 4 - pre-debloat" -RestorePointType "MODIFY_SETTINGS" -ErrorAction SilentlyContinue
    Write-Log "Restore point created." 'OK'
} catch { Write-Log "Restore point failed: $($_.Exception.Message)" 'WARN' }

# =============================================================================
# STAGE 1 (NORMAL BOOT) - prerequisites
# =============================================================================

# ---- 7-Zip -------------------------------------------------------------------
Write-Log "Stage 1: 7-Zip" 'STAGE'
Get-FileFromWeb -URL "https://www.7-zip.org/a/7z2301-x64.exe" -File "$Script:TempDir\7Zip.exe"
Start-Process -Wait "$Script:TempDir\7Zip.exe" -ArgumentList "/S"
cmd /c "reg add `"HKEY_CURRENT_USER\Software\7-Zip\Options`" /v ContextMenu  /t REG_DWORD /d 259 /f >nul 2>&1"
cmd /c "reg add `"HKEY_CURRENT_USER\Software\7-Zip\Options`" /v CascadedMenu /t REG_DWORD /d 0   /f >nul 2>&1"
Move-Item "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\7-Zip\7-Zip File Manager.lnk" `
          "$env:ProgramData\Microsoft\Windows\Start Menu\Programs" -Force -ErrorAction SilentlyContinue | Out-Null
Remove-Item "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\7-Zip" -Recurse -Force -ErrorAction SilentlyContinue | Out-Null
Write-Log "7-Zip installed." 'OK'

# ---- Visual C++ redists ------------------------------------------------------
Write-Log "Stage 1: Visual C++ redists (2005-2022)" 'STAGE'
$vcredist = @(
    @{ Tag='2005_x86'; URL='https://download.microsoft.com/download/8/B/4/8B42259F-5D70-43F4-AC2E-4B208FD8D66A/vcredist_x86.EXE'; Args='/Q /C:"msiexec /i vcredist.msi /qn /norestart"' }
    @{ Tag='2005_x64'; URL='https://download.microsoft.com/download/8/B/4/8B42259F-5D70-43F4-AC2E-4B208FD8D66A/vcredist_x64.EXE'; Args='/Q /C:"msiexec /i vcredist.msi /qn /norestart"' }
    @{ Tag='2008_x86'; URL='https://download.microsoft.com/download/5/D/8/5D8C65CB-C849-4025-8E95-C3966CAFD8AE/vcredist_x86.exe'; Args='/q' }
    @{ Tag='2008_x64'; URL='https://download.microsoft.com/download/5/D/8/5D8C65CB-C849-4025-8E95-C3966CAFD8AE/vcredist_x64.exe'; Args='/q' }
    @{ Tag='2010_x86'; URL='https://download.microsoft.com/download/1/6/5/165255E7-1014-4D0A-B094-B6A430A6BFFC/vcredist_x86.exe'; Args='/quiet /norestart' }
    @{ Tag='2010_x64'; URL='https://download.microsoft.com/download/1/6/5/165255E7-1014-4D0A-B094-B6A430A6BFFC/vcredist_x64.exe'; Args='/quiet /norestart' }
    @{ Tag='2012_x86'; URL='https://download.microsoft.com/download/1/6/B/16B06F60-3B20-4FF2-B699-5E9B7962F9AE/VSU_4/vcredist_x86.exe'; Args='/quiet /norestart' }
    @{ Tag='2012_x64'; URL='https://download.microsoft.com/download/1/6/B/16B06F60-3B20-4FF2-B699-5E9B7962F9AE/VSU_4/vcredist_x64.exe'; Args='/quiet /norestart' }
    @{ Tag='2013_x86'; URL='https://download.microsoft.com/download/2/e/6/2e61cfa4-993b-4dd4-91da-3737cd5cd6e3/vcredist_x86.exe'; Args='/quiet /norestart' }
    @{ Tag='2013_x64'; URL='https://download.microsoft.com/download/2/e/6/2e61cfa4-993b-4dd4-91da-3737cd5cd6e3/vcredist_x64.exe'; Args='/quiet /norestart' }
    @{ Tag='2022_x86'; URL='https://aka.ms/vs/17/release/vc_redist.x86.exe';                                                       Args='/quiet /norestart' }
    @{ Tag='2022_x64'; URL='https://aka.ms/vs/17/release/vc_redist.x64.exe';                                                       Args='/quiet /norestart' }
)
foreach ($v in $vcredist) {
    $f = "$Script:TempDir\vcredist_$($v.Tag).exe"
    try {
        Get-FileFromWeb -URL $v.URL -File $f
        Start-Process -Wait $f -ArgumentList $v.Args -WindowStyle Hidden
        Write-Log "VC++ $($v.Tag) installed." 'OK'
    } catch { Write-Log "VC++ $($v.Tag) failed: $($_.Exception.Message)" 'WARN' }
}

# ---- DDU (Display Driver Uninstaller) ----------------------------------------
Write-Log "Stage 1: DDU" 'STAGE'
Get-FileFromWeb -URL "https://www.wagnardsoft.com/DDU/download/DDU%20v18.1.4.2_setup.exe" -File "$Script:TempDir\DDU.exe"
& "$env:ProgramFiles\7-Zip\7z.exe" x "$Script:TempDir\DDU.exe" -o"$Script:TempDir\DDU" -y | Out-Null

$DduConfig = @'
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
        <RemoveEnduranceGaming>True</RemoveEnduranceGaming>
        <RemoveIntelNpu>True</RemoveIntelNpu>
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
        <LastSelectedGPUIndex>0</LastSelectedGPUIndex>
        <LastSelectedTypeIndex>0</LastSelectedTypeIndex>
    </Settings>
</DisplayDriverUninstaller>
'@
Set-Content -Path "$Script:TempDir\DDU\Settings\Settings.xml" -Value $DduConfig -Force -Encoding UTF8
Set-ItemProperty -Path "$Script:TempDir\DDU\Settings\Settings.xml" -Name IsReadOnly -Value $true

# Block WU from yanking drivers back
cmd /c "reg add `"HKLM\Software\Microsoft\Windows\CurrentVersion\DriverSearching`" /v SearchOrderConfig /t REG_DWORD /d 0 /f >nul 2>&1"
Write-Log "DDU staged." 'OK'

# ---- Brave + uBlock Origin Lite + policies ----------------------------------
Write-Log "Stage 1: Brave + uBlock Origin Lite" 'STAGE'
Get-FileFromWeb -URL "https://laptop-updates.brave.com/latest/winx64" -File "$Script:TempDir\BraveSetup.exe"
Start-Process -Wait "$Script:TempDir\BraveSetup.exe" -ArgumentList "/silent /install"

# Force-install uBlock Origin Lite (Brave honors Chromium ExtensionInstallForcelist policy)
cmd /c "reg add `"HKLM\SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallForcelist`" /v 1 /t REG_SZ /d `"ddkjiahejlhfcafbddmgiahcphecmpfh;https://clients2.google.com/service/update2/crx`" /f >nul 2>&1"

# Brave policies
cmd /c "reg add `"HKLM\SOFTWARE\Policies\BraveSoftware\Brave`" /v HardwareAccelerationModeEnabled /t REG_DWORD /d 0 /f >nul 2>&1"
cmd /c "reg add `"HKLM\SOFTWARE\Policies\BraveSoftware\Brave`" /v BackgroundModeEnabled         /t REG_DWORD /d 0 /f >nul 2>&1"
cmd /c "reg add `"HKLM\SOFTWARE\Policies\BraveSoftware\Brave`" /v HighEfficiencyModeEnabled     /t REG_DWORD /d 1 /f >nul 2>&1"

# Kill Brave updater services + scheduled tasks
Get-Service | Where-Object { $_.Name -match 'Brave|brave-update' } | ForEach-Object {
    cmd /c "sc stop `"$($_.Name)`" >nul 2>&1"
    cmd /c "sc delete `"$($_.Name)`" >nul 2>&1"
}
Get-ScheduledTask | Where-Object { $_.TaskName -match 'Brave' } | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
Write-Log "Brave installed." 'OK'

# ---- DirectX (June 2010 redist) ---------------------------------------------
Write-Log "Stage 1: DirectX June 2010 redist" 'STAGE'
Get-FileFromWeb -URL "https://download.microsoft.com/download/8/4/A/84A35BF1-DAFE-4AE8-82AF-AD2AE20B6B14/directx_Jun2010_redist.exe" -File "$Script:TempDir\DirectX.exe"
& "$env:ProgramFiles\7-Zip\7z.exe" x "$Script:TempDir\DirectX.exe" -o"$Script:TempDir\DirectX" -y | Out-Null
Start-Process -Wait "$Script:TempDir\DirectX\DXSETUP.exe" -ArgumentList "/silent" -WindowStyle Hidden
Write-Log "DirectX installed." 'OK'

# =============================================================================
# Write StepOne (safe-boot stage) and StepTwo (post-DDU stage) to TEMP
# =============================================================================

Write-Log "Writing StepOne and StepTwo to $Script:TempDir" 'STAGE'

$StepOnePs1 = @'
# Blurry 4 :: StepOne (safe boot, runs from Winlogon Userinit hijack)
If (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Start-Process PowerShell.exe -ArgumentList ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $PSCommandPath) -Verb RunAs
    Exit
}
$Host.UI.RawUI.WindowTitle     = "Blurry 4 StepOne (safe boot)"
$Host.UI.RawUI.BackgroundColor = "Black"
Clear-Host
$ProgressPreference = 'SilentlyContinue'

$LogPath = "$env:SystemDrive\Blurry4\logs\Blurry4.log"
function L([string]$m,[string]$lvl='INFO'){
    $line = "[{0}] [SAFE/{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'),$lvl,$m
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
    Write-Host $line
}
L "StepOne start." 'STAGE'

# Restore default Userinit (un-hijack)
cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`" /v Userinit /t REG_SZ /d `"C:\WINDOWS\system32\userinit.exe,`" /f >nul 2>&1"

# TrustedInstaller binary-path hijack (so we can write keys Defender locks)
function Run-Trusted([String]$command) {
    try { Stop-Service -Name TrustedInstaller -Force -ErrorAction Stop -WarningAction Stop } catch { taskkill /im trustedinstaller.exe /f >$null 2>&1 }
    $service = Get-CimInstance -ClassName Win32_Service -Filter "Name='TrustedInstaller'"
    $defaultBin = $service.PathName
    $trustedExe = "$env:SystemRoot\servicing\TrustedInstaller.exe"
    if ($defaultBin -ne $trustedExe) { $defaultBin = $trustedExe }
    $bytes = [System.Text.Encoding]::Unicode.GetBytes($command)
    $b64 = [Convert]::ToBase64String($bytes)
    sc.exe config TrustedInstaller binPath= "cmd.exe /c powershell.exe -encodedcommand $b64" | Out-Null
    sc.exe start  TrustedInstaller | Out-Null
    sc.exe config TrustedInstaller binPath= "`"$defaultBin`"" | Out-Null
    try { Stop-Service -Name TrustedInstaller -Force -ErrorAction Stop -WarningAction Stop } catch { taskkill /im trustedinstaller.exe /f >$null 2>&1 }
}

L "Disabling Defender + security via TrustedInstaller..." 'STAGE'
$securitySettings = @(
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender\Real-Time Protection`" /v DisableRealtimeMonitoring /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender\Real-Time Protection`" /v DisableAsyncScanOnOpen   /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender\Spynet`" /v SpyNetReporting     /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender\Spynet`" /v SubmitSamplesConsent /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender\Features`" /v TamperProtection /t REG_DWORD /d 4 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender\Windows Defender Exploit Guard\Controlled Folder Access`" /v EnableControlledFolderAccess /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender Security Center\Notifications`" /v DisableEnhancedNotifications /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender Security Center\Virus and threat protection`" /v NoActionNotificationDisabled    /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender Security Center\Virus and threat protection`" /v SummaryNotificationDisabled     /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender Security Center\Virus and threat protection`" /v FilesBlockedNotificationDisabled /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender`" /v VerifiedAndReputableTrustModeEnabled /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender`" /v SmartLockerMode /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender`" /v PUAProtection   /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\System\ControlSet001\Control\AppID\Configuration\SMARTLOCKER`" /v START_PENDING /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\System\ControlSet001\Control\AppID\Configuration\SMARTLOCKER`" /v ENABLED /t REG_BINARY /d 0000000000000000 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\System\ControlSet001\Control\CI\Policy`" /v VerifiedAndReputablePolicyState /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer`" /v SmartScreenEnabled /t REG_SZ /d Off /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_CURRENT_USER\SOFTWARE\Microsoft\Edge\SmartScreenEnabled`"   /ve /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_CURRENT_USER\SOFTWARE\Microsoft\Edge\SmartScreenPuaEnabled`"/ve /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\WTDS\Components`" /v CaptureThreatWindow /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\WTDS\Components`" /v NotifyMalicious      /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\WTDS\Components`" /v NotifyPasswordReuse  /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\WTDS\Components`" /v NotifyUnsafeApp      /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\WTDS\Components`" /v ServiceEnabled       /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\AppHost`" /v EnableWebContentEvaluation /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKEY_LOCAL_MACHINE\System\ControlSet001\Control\Session Manager\kernel`" /v MitigationOptions /t REG_BINARY /d 222222000002000000020000000000000000000000000000 /f >nul 2>&1"',
    'cmd /c "reg delete `"HKEY_LOCAL_MACHINE\System\ControlSet001\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity`" /v ChangedInBootCycle /f >nul 2>&1"',
    'cmd /c "reg add    `"HKEY_LOCAL_MACHINE\System\ControlSet001\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity`" /v Enabled /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg delete `"HKEY_LOCAL_MACHINE\System\ControlSet001\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity`" /v WasEnabledBy /f >nul 2>&1"',
    'cmd /c "reg add    `"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Lsa`" /v RunAsPPL /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add    `"HKEY_LOCAL_MACHINE\System\ControlSet001\Control\CI\Config`" /v VulnerableDriverBlocklistEnable /t REG_DWORD /d 0 /f >nul 2>&1"'
)
foreach ($c in $securitySettings) { Run-Trusted $c }
foreach ($c in $securitySettings) { Invoke-Expression $c }

# UAC off
cmd /c "reg add `"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System`" /v EnableLUA /t REG_DWORD /d 0 /f >nul 2>&1"

# Remove safe boot flag (so next reboot is normal mode)
cmd /c "bcdedit /deletevalue {current} safeboot >nul 2>&1"

# Arm StepTwo via RunOnce (HKLM so it survives logout)
cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce`" /v Blurry4StepTwo /t REG_SZ /d `"powershell.exe -NoExit -nop -ep bypass -WindowStyle Maximized -f $env:SystemRoot\Temp\StepTwo.ps1`" /f >nul 2>&1"

L "Running DDU clean (CleanAllGpus + restart -> normal boot)" 'STAGE'
Start-Process "$env:SystemRoot\Temp\DDU\Display Driver Uninstaller.exe" -ArgumentList "-CleanSoundBlaster -CleanRealtek -CleanAllGpus -Restart" -Wait
'@

$StepOnePath = "$Script:TempDir\StepOne.ps1"
Set-Content -Path $StepOnePath -Value $StepOnePs1 -Force -Encoding UTF8
Write-Log "StepOne written -> $StepOnePath" 'OK'

# ---- Stage fr33thy's NVPI .nip profile (verbatim from WinSux.ps1 lines 3055-3251)
# Staged here as a separate file so StepTwo doesn't need a nested here-string.
$nvpiNip = @'
<?xml version="1.0" encoding="utf-16"?>
<ArrayOfProfile>
  <Profile>
    <ProfileName>Base Profile</ProfileName>
    <Executables/>
    <Settings>
      <ProfileSetting>
        <SettingNameInfo>Frame Rate Limiter V3</SettingNameInfo>
        <SettingID>277041154</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>GSYNC - Application Mode</SettingNameInfo>
        <SettingID>294973784</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>GSYNC - Application State</SettingNameInfo>
        <SettingID>279476687</SettingID>
        <SettingValue>4</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>GSYNC - Global Feature</SettingNameInfo>
        <SettingID>278196567</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>GSYNC - Global Mode</SettingNameInfo>
        <SettingID>278196727</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>GSYNC - Indicator Overlay</SettingNameInfo>
        <SettingID>268604728</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Maximum Pre-Rendered Frames</SettingNameInfo>
        <SettingID>8102046</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Preferred Refresh Rate</SettingNameInfo>
        <SettingID>6600001</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Ultra Low Latency - CPL State</SettingNameInfo>
        <SettingID>390467</SettingID>
        <SettingValue>2</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Ultra Low Latency - Enabled</SettingNameInfo>
        <SettingID>277041152</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Vertical Sync</SettingNameInfo>
        <SettingID>11041231</SettingID>
        <SettingValue>138504007</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Vertical Sync - Smooth AFR Behavior</SettingNameInfo>
        <SettingID>270198627</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Vertical Sync - Tear Control</SettingNameInfo>
        <SettingID>5912412</SettingID>
        <SettingValue>2525368439</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Vulkan/OpenGL Present Method</SettingNameInfo>
        <SettingID>550932728</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Antialiasing - Gamma Correction</SettingNameInfo>
        <SettingID>276652957</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Antialiasing - Mode</SettingNameInfo>
        <SettingID>276757595</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Antialiasing - Setting</SettingNameInfo>
        <SettingID>282555346</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Anisotropic Filter - Optimization</SettingNameInfo>
        <SettingID>8703344</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Anisotropic Filter - Sample Optimization</SettingNameInfo>
        <SettingID>15151633</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Anisotropic Filtering - Mode</SettingNameInfo>
        <SettingID>282245910</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Anisotropic Filtering - Setting</SettingNameInfo>
        <SettingID>270426537</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Texture Filtering - Negative LOD Bias</SettingNameInfo>
        <SettingID>1686376</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Texture Filtering - Quality</SettingNameInfo>
        <SettingID>13510289</SettingID>
        <SettingValue>20</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Texture Filtering - Trilinear Optimization</SettingNameInfo>
        <SettingID>3066610</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>CUDA - Force P2 State</SettingNameInfo>
        <SettingID>1343646814</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>CUDA - Sysmem Fallback Policy</SettingNameInfo>
        <SettingID>283962569</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Power Management - Mode</SettingNameInfo>
        <SettingID>274197361</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Shader Cache - Cache Size</SettingNameInfo>
        <SettingID>11306135</SettingID>
        <SettingValue>4294967295</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Threaded Optimization</SettingNameInfo>
        <SettingID>549528094</SettingID>
        <SettingValue>1</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>OpenGL GDI Compatibility</SettingNameInfo>
        <SettingID>544392611</SettingID>
        <SettingValue>0</SettingValue>
        <ValueType>Dword</ValueType>
      </ProfileSetting>
      <ProfileSetting>
        <SettingNameInfo>Preferred OpenGL GPU</SettingNameInfo>
        <SettingID>550564838</SettingID>
        <SettingValue>id,2.0:268410DE,00000100,GF - (400,2,161,24564) @ (0)</SettingValue>
        <ValueType>String</ValueType>
      </ProfileSetting>
    </Settings>
  </Profile>
</ArrayOfProfile>
'@
Set-Content -Path "$Script:TempDir\fr33thy.nip" -Value $nvpiNip -Force -Encoding Unicode
Write-Log "fr33thy NVPI .nip staged -> $Script:TempDir\fr33thy.nip" 'OK'

# =============================================================================
# StepTwo here-string  (post-DDU normal boot, runs from RunOnce)
# =============================================================================

$StepTwoPs1 = @'
# Blurry 4 :: StepTwo (normal boot, runs from RunOnce after DDU)
If (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Start-Process PowerShell.exe -ArgumentList ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $PSCommandPath) -Verb RunAs
    Exit
}
$Host.UI.RawUI.WindowTitle     = "Blurry 4 StepTwo (post-DDU)"
$Host.UI.RawUI.BackgroundColor = "Black"
Clear-Host
$ProgressPreference   = 'SilentlyContinue'
$ErrorActionPreference= 'Continue'

$LogPath = "$env:SystemDrive\Blurry4\logs\Blurry4.log"
function L([string]$m,[string]$lvl='INFO'){
    $line = "[{0}] [POST/{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'),$lvl,$m
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
    $color = switch ($lvl) { 'WARN' {'Yellow'} 'FAIL' {'Red'} 'OK' {'Green'} 'STAGE' {'Cyan'} default {'Gray'} }
    Write-Host $line -ForegroundColor $color
}
L "StepTwo start." 'STAGE'

# Crash trap -- catches anything that escapes the per-section try/catch wrappers below.
trap {
    Write-Host ""
    Write-Host "  !!  StepTwo unhandled error  !!" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Line $($_.InvocationInfo.ScriptLineNumber): $($_.InvocationInfo.Line.Trim())" -ForegroundColor DarkGray
    L "UNHANDLED: $($_.Exception.Message) (line $($_.InvocationInfo.ScriptLineNumber))" 'FAIL'
    Write-Host ""
    Write-Host "  Press any key to close..." -ForegroundColor Yellow
    try { [void][System.Console]::ReadKey($true) } catch { Read-Host | Out-Null }
    continue
}

# Per-section runner.
function Step([string]$name, [scriptblock]$body) {
    L "==> $name" 'STAGE'
    try { & $body }
    catch {
        L "$name FAILED: $($_.Exception.Message)" 'FAIL'
        Write-Host "  (continuing anyway)" -ForegroundColor DarkYellow
    }
}

function Get-FileFromWeb {
    param([Parameter(Mandatory)][string]$URL,[Parameter(Mandatory)][string]$File)
    try {
        $r=[System.Net.HttpWebRequest]::Create($URL); $r.AllowAutoRedirect=$true
        $resp=$r.GetResponse()
        if ($resp.StatusCode -in 401,403,404) { throw "$($resp.StatusCode) '$URL'." }
        $dir=[System.IO.Path]::GetDirectoryName($File); if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir|Out-Null }
        $buf=New-Object byte[] 1048576; $rd=$resp.GetResponseStream(); $w=New-Object System.IO.FileStream $File,'Create'
        do { $c=$rd.Read($buf,0,$buf.Length); $w.Write($buf,0,$c) } while ($c -gt 0)
    } finally { if ($rd){$rd.Close()}; if ($w){$w.Close()} }
}

# =================== AppX  (allowlist + Xbox trio) =========================
L "AppX cleanup (allowlist + Xbox trio kept)" 'STAGE'
$keepAppX = @(
    '*Microsoft.SecHealthUI*'
    '*Microsoft.VP9VideoExtensions*'
    '*Microsoft.WebMediaExtensions*'
    '*Microsoft.WebpImageExtension*'
    '*Microsoft.Windows.Photos*'
    '*Microsoft.Windows.ShellExperienceHost*'
    '*Microsoft.Windows.StartMenuExperienceHost*'
    '*Microsoft.WindowsNotepad*'
    '*Microsoft.WindowsStore*'
    '*Microsoft.ScreenSketch*'   # Snipping Tool (Win11 package name)
    '*NVIDIACorp.NVIDIAControlPanel*'
    '*windows.immersivecontrolpanel*'
    # Xbox app trio (Blurry 4 addition - kept but neutered below)
    '*Microsoft.GamingApp*'
    '*Microsoft.XboxIdentityProvider*'
    '*Microsoft.Xbox.TCUI*'
)
function Test-Keep($name){ foreach ($k in $keepAppX) { if ($name -like $k) { return $true } } return $false }

Get-AppxPackage -AllUsers | ForEach-Object {
    if (-not (Test-Keep $_.Name)) {
        try { Remove-AppxPackage -Package $_.PackageFullName -AllUsers -ErrorAction SilentlyContinue; L "Removed AppX: $($_.Name)" } catch {}
    }
}
Get-AppxProvisionedPackage -Online | ForEach-Object {
    if (-not (Test-Keep $_.DisplayName)) {
        try { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue | Out-Null; L "Removed Provisioned AppX: $($_.DisplayName)" } catch {}
    }
}
# Specific extras fr33thy strips even if they slip through
# NOTE: Microsoft.Winget.Source intentionally NOT in this list -- removing it breaks
# `winget install` later (used to grab NVIDIA Control Panel). fr33thy strips it because
# they don't use winget afterwards; we do.
foreach ($n in @('*MSTeams*','*Microsoft.OutlookForWindows*','*Microsoft.XboxGamingOverlay*','*Microsoft.XboxSpeechToTextOverlay*')) {
    Get-AppxPackage -AllUsers $n | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue
    Get-AppxProvisionedPackage -Online | Where-Object DisplayName -Like $n | ForEach-Object { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue | Out-Null }
}

# =================== Capabilities allowlist ================================
L "Windows Capabilities cleanup" 'STAGE'
$keepCaps = '*Ethernet*','*MSPaint*','*Notepad*','*Notepad.System*','*Wifi*','*NetFX3*','*VBSCRIPT*','*WMIC*','*Windows.Client.ShellComponents*'
Get-WindowsCapability -Online | Where-Object { $_.State -eq 'Installed' } | ForEach-Object {
    $keep = $false
    foreach ($k in $keepCaps) { if ($_.Name -like $k) { $keep = $true; break } }
    if (-not $keep) { try { Remove-WindowsCapability -Online -Name $_.Name -ErrorAction SilentlyContinue | Out-Null; L "Removed Cap: $($_.Name)" } catch {} }
}

# =================== Optional Features allowlist ===========================
L "Windows Optional Features cleanup" 'STAGE'
$keepOpt = '*DirectPlay*','*LegacyComponents*','*NetFx3*','*NetFx4*','*NetFx4-AdvSrvs*','*NetFx4ServerFeatures*','*SearchEngine-Client-Package*','*Server-Shell*','*Windows-Defender*','*Server-Drivers-General*','*ServerCore-Drivers-General*','*ServerCore-Drivers-General-WOW64*','*Server-Gui-Mgmt*','*WirelessNetworking*'
Get-WindowsOptionalFeature -Online | Where-Object { $_.State -eq 'Enabled' } | ForEach-Object {
    $keep = $false
    foreach ($k in $keepOpt) { if ($_.FeatureName -like $k) { $keep = $true; break } }
    if (-not $keep) { try { Disable-WindowsOptionalFeature -Online -FeatureName $_.FeatureName -NoRestart -ErrorAction SilentlyContinue | Out-Null; L "Disabled Feature: $($_.FeatureName)" } catch {} }
}

# =================== OneDrive uninstall ====================================
L "Uninstalling OneDrive" 'STAGE'
foreach ($p in @("$env:SystemRoot\System32\OneDriveSetup.exe","$env:SystemRoot\SysWOW64\OneDriveSetup.exe")) {
    if (Test-Path $p) { Start-Process -Wait $p -ArgumentList '/uninstall' -WindowStyle Hidden }
}
Get-Process OneDrive -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
foreach ($p in @("$env:LOCALAPPDATA\Microsoft\OneDrive","$env:PROGRAMDATA\Microsoft\OneDrive","$env:SYSTEMDRIVE\OneDriveTemp","$env:USERPROFILE\OneDrive")) {
    Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
}
Get-ScheduledTask | Where-Object { $_.TaskName -match 'OneDrive' } | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue

# =================== Edge neuter ===========================================
L "Neutering Edge" 'STAGE'
foreach ($s in 'MicrosoftEdgeElevationService','edgeupdate','edgeupdatem') {
    Set-Service -Name $s -StartupType Disabled -ErrorAction SilentlyContinue
    Stop-Service -Name $s -Force -ErrorAction SilentlyContinue
}
cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Edge`" /v HardwareAccelerationModeEnabled /t REG_DWORD /d 0 /f >nul 2>&1"
cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Edge`" /v BackgroundModeEnabled         /t REG_DWORD /d 0 /f >nul 2>&1"
cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Edge`" /v StartupBoostEnabled           /t REG_DWORD /d 0 /f >nul 2>&1"
cmd /c "reg delete `"HKLM\SOFTWARE\Microsoft\EdgeUpdate\ClientState\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`" /v uninstallcmdline /f >nul 2>&1"

# =================== Copilot / Recall / Cortana / AI off ===================
L "Disabling Copilot / Recall / Cortana / AI" 'STAGE'
$copilotKeys = @(
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot`" /v TurnOffWindowsCopilot /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot`" /v TurnOffWindowsCopilot /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\Shell\Copilot`" /v ShowCopilotButton /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsAI`" /v DisableAIDataAnalysis  /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsAI`" /v AllowRecallEnablement /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsAI`" /v DisableClickToDo       /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\Explorer`" /v DisableSearchBoxSuggestions /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\BingChat`" /v IsUserEligible /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\Paint`" /v DisableGenerativeFill /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\Paint`" /v DisableCocreator      /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\Paint`" /v DisableImageCreator   /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\WindowsNotepad`" /v DisableAIFeatures /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Feeds`" /v EnableFeeds /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Feeds`" /v ShellFeedsTaskbarViewMode /t REG_DWORD /d 2 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search`" /v AllowCortana /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\graphicsCaptureProgrammatic`" /v Value /t REG_SZ /d Deny /f >nul 2>&1"'
)
foreach ($c in $copilotKeys) { Invoke-Expression $c }

# =================== Privacy / telemetry ===================================
L "Privacy + telemetry" 'STAGE'
$privacy = @(
    # ContentDeliveryManager (start menu / lockscreen suggestions)
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v ContentDeliveryAllowed                /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v OemPreInstalledAppsEnabled            /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v PreInstalledAppsEnabled               /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v PreInstalledAppsEverEnabled           /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v SilentInstalledAppsEnabled            /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v SubscribedContent-310093Enabled       /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v SubscribedContent-338387Enabled       /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v SubscribedContent-338388Enabled       /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v SubscribedContent-338389Enabled       /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v SubscribedContent-338393Enabled       /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v SubscribedContent-353694Enabled       /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v SubscribedContent-353696Enabled       /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v SystemPaneSuggestionsEnabled          /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v RotatingLockScreenEnabled             /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v RotatingLockScreenOverlayEnabled      /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager`" /v SoftLandingEnabled                    /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager\Subscriptions`" /v EnableSlideshow         /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\UserProfileEngagement`" /v ScoobeSystemSettingEnabled            /t REG_DWORD /d 0 /f >nul 2>&1"',
    # Telemetry
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\DataCollection`" /v AllowTelemetry /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\DataCollection`" /v AllowTelemetry /t REG_DWORD /d 0 /f >nul 2>&1"',
    # Cross-device resume
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\System`" /v EnableMobileShellHandover /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\CrossDeviceResume`" /v DisableCrossDeviceResume /t REG_DWORD /d 1 /f >nul 2>&1"',
    # Settings page hide-home
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer`" /v SettingsPageVisibility /t REG_SZ /d `"hide:home;`" /f >nul 2>&1"'
)
foreach ($c in $privacy) { Invoke-Expression $c }
Stop-Service -Name camsvc -Force -ErrorAction SilentlyContinue
Set-Service -Name camsvc -StartupType Disabled -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\Packages\Microsoft.WindowsCamera_*\LocalState\CapabilityConsentStorage.db" -Force -ErrorAction SilentlyContinue

# =================== Game Bar / Xbox app neuter (KEEP Xbox app) ============
L "Neutering Game Bar (Xbox app stays installed)" 'STAGE'
cmd /c "reg add `"HKCU\System\GameConfigStore`"           /v GameDVR_Enabled        /t REG_DWORD /d 0 /f >nul 2>&1"
cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\GameDVR`" /v AllowGameDVR /t REG_DWORD /d 0 /f >nul 2>&1"
cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR`" /v AppCaptureEnabled /t REG_DWORD /d 0 /f >nul 2>&1"
cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\GameBar`" /v UseNexusForGameBarEnabled /t REG_DWORD /d 0 /f >nul 2>&1"
cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\GameBar`" /v ShowStartupPanel          /t REG_DWORD /d 0 /f >nul 2>&1"
cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\GameBar`" /v AutoGameModeEnabled       /t REG_DWORD /d 0 /f >nul 2>&1"
# Redirect Game Bar protocols to systray (popup never appears)
foreach ($proto in 'ms-gamebar','ms-gamebarservices','ms-gamingoverlay') {
    cmd /c "reg add `"HKCR\$proto`" /f /ve /t REG_SZ /d `"URL:$proto`" >nul 2>&1"
    cmd /c "reg add `"HKCR\$proto`" /v `"URL Protocol`" /t REG_SZ /d `"`" /f >nul 2>&1"
    cmd /c "reg add `"HKCR\$proto\shell\open\command`" /f /ve /t REG_SZ /d `"`"`"%SystemRoot%\System32\systray.exe`"`"`" >nul 2>&1"
}
foreach ($s in 'XblGameSave','XboxGipSvc','XboxNetApiSvc','XblAuthManager') {
    Set-Service -Name $s -StartupType Disabled -ErrorAction SilentlyContinue
    Stop-Service -Name $s -Force -ErrorAction SilentlyContinue
}

# =================== Explorer / shell ======================================
L "Explorer: classic context menu, classic File Explorer, no 3D Objects, no Gallery" 'STAGE'
$explorer = @(
    # Classic right-click menu (Win11 -> Win10)
    'cmd /c "reg add `"HKCU\SOFTWARE\CLASSES\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32`" /f /ve >nul 2>&1"',
    # Classic File Explorer (HubMode=1)
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v HubMode /t REG_DWORD /d 1 /f >nul 2>&1"',
    # Snap features off
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v SnapAssist       /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v EnableSnapBar    /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v EnableTaskGroups /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v SnapFill         /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v JointResize      /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v DITest           /t REG_DWORD /d 0 /f >nul 2>&1"',
    # AllAppsView: list (2)
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v AllAppsViewMode  /t REG_DWORD /d 2 /f >nul 2>&1"',
    # MenuShowDelay = 0
    'cmd /c "reg add `"HKCU\Control Panel\Desktop`" /v MenuShowDelay /t REG_SZ /d 0 /f >nul 2>&1"',
    # Long paths
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\FileSystem`" /v LongPathsEnabled /t REG_DWORD /d 1 /f >nul 2>&1"',
    # No customize this folder
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer`" /v NoCustomizeThisFolder /t REG_DWORD /d 1 /f >nul 2>&1"',
    # Hide Previous Versions tab
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer`" /v NoPreviousVersionsPage /t REG_DWORD /d 1 /f >nul 2>&1"',
    # No Web Services
    'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer`" /v NoWebServices /t REG_DWORD /d 1 /f >nul 2>&1"',
    # Remove 3D Objects from My Computer
    'cmd /c "reg delete `"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\MyComputer\NameSpace\{0DB7E03F-FC29-4DC6-9020-FF41B59E513A}`" /f >nul 2>&1"',
    'cmd /c "reg delete `"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Explorer\MyComputer\NameSpace\{0DB7E03F-FC29-4DC6-9020-FF41B59E513A}`" /f >nul 2>&1"',
    # Hide Gallery and Home from File Explorer left pane
    'cmd /c "reg add `"HKCU\SOFTWARE\Classes\CLSID\{e88865ea-0e1c-4e20-9aa6-edcd0212c87c}`" /v System.IsPinnedToNameSpaceTree /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\SOFTWARE\Classes\CLSID\{f874310e-b6b7-47dc-bc84-b9e6b38f5903}`" /v System.IsPinnedToNameSpaceTree /t REG_DWORD /d 0 /f >nul 2>&1"',
    # BSOD parameters visible
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\CrashControl`" /v DisplayParameters /t REG_DWORD /d 1 /f >nul 2>&1"',
    # Disable WPBT
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager`" /v DisableWpbtExecution /t REG_DWORD /d 1 /f >nul 2>&1"'
)
foreach ($c in $explorer) { Invoke-Expression $c }

# =================== Power / perf / mouse ==================================
L "Power / perf / mouse" 'STAGE'
$perf = @(
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\kernel`" /v GlobalTimerResolutionRequests /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\0cc5b647-c1df-4637-891a-dec35c318583`" /v ValueMax /t REG_DWORD /d 100 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling`" /v PowerThrottlingOff /t REG_DWORD /d 1 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\Power`" /v HibernateEnabled        /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\Power`" /v HibernateEnabledDefault /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Power`" /v HiberbootEnabled /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\System`" /v ShowLockOption  /t REG_DWORD /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Microsoft\Windows\System`" /v ShowSleepOption /t REG_DWORD /d 0 /f >nul 2>&1"',
    # Mouse fixes
    'cmd /c "reg add `"HKCU\Control Panel\Mouse`" /v MouseSpeed       /t REG_SZ /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\Control Panel\Mouse`" /v MouseThreshold1  /t REG_SZ /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\Control Panel\Mouse`" /v MouseThreshold2  /t REG_SZ /d 0 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\Control Panel\Mouse`" /v SmoothMouseXCurve /t REG_BINARY /d 00000000000000000028000000000000004000000000000000600000000000000080000000000000 /f >nul 2>&1"',
    'cmd /c "reg add `"HKCU\Control Panel\Mouse`" /v SmoothMouseYCurve /t REG_BINARY /d 0000000000000000000000aa0000000000000000400000000000000000900000000000000fe0700 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\mouclass\Parameters`" /v RawMouseThrottleEnabled /t REG_DWORD /d 0 /f >nul 2>&1"',
    # Force-enable new NVMe driver feature flags (fr33thy)
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\FeatureManagement\Overrides\0\735209102`" /v EnabledState /t REG_DWORD /d 2 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\FeatureManagement\Overrides\0\1853569164`" /v EnabledState /t REG_DWORD /d 2 /f >nul 2>&1"',
    'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\FeatureManagement\Overrides\0\156965516`"  /v EnabledState /t REG_DWORD /d 2 /f >nul 2>&1"'
)
foreach ($c in $perf) { Invoke-Expression $c }

# Memory compression off + BitLocker off on every volume
try { Disable-MMAgent -MemoryCompression -ErrorAction SilentlyContinue } catch {}
Get-BitLockerVolume -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.ProtectionStatus -eq 'On') { Disable-BitLocker -MountPoint $_.MountPoint -ErrorAction SilentlyContinue | Out-Null }
}

# =================== Network bindings ======================================
L "Disabling NIC bindings (lldp/lltdio/implat/rspndr/tcpip6/server/msclient/pacer)" 'STAGE'
$bindings = 'ms_lldp','ms_lltdio','ms_implat','ms_rspndr','ms_tcpip6','ms_server','ms_msclient','ms_pacer'
Get-NetAdapter | ForEach-Object {
    foreach ($b in $bindings) { Disable-NetAdapterBinding -Name $_.Name -ComponentID $b -ErrorAction SilentlyContinue }
}
# Firewall notification suppression
foreach ($p in 'DomainProfile','PublicProfile','StandardProfile') {
    cmd /c "reg add `"HKLM\System\ControlSet001\Services\SharedAccess\Parameters\FirewallPolicy\$p`" /v DisableNotifications /t REG_DWORD /d 1 /f >nul 2>&1"
}

# =================== Scheduled tasks killed ================================
L "Killing scheduled tasks (Defender cache/scan, ScheduledDefrag, PLUG, Maps, etc.)" 'STAGE'
$tasksToDisable = @(
    '\Microsoft\Windows\Windows Defender\Windows Defender Cache Maintenance',
    '\Microsoft\Windows\Windows Defender\Windows Defender Cleanup',
    '\Microsoft\Windows\Windows Defender\Windows Defender Scheduled Scan',
    '\Microsoft\Windows\Windows Defender\Windows Defender Verification',
    '\Microsoft\Windows\ExploitGuard\ExploitGuard MDM policy Refresh',
    '\Microsoft\Windows\Defrag\ScheduledDefrag',
    '\Microsoft\Windows\Maps\MapsToastTask',
    '\Microsoft\Windows\Maps\MapsUpdateTask',
    '\Microsoft\Windows\PLA\Server Manager Performance Monitor',
    '\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser',
    '\Microsoft\Windows\Application Experience\ProgramDataUpdater',
    '\Microsoft\Windows\Customer Experience Improvement Program\Consolidator',
    '\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip',
    '\Microsoft\Windows\Diagnosis\Scheduled',
    '\Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticDataCollector'
)
foreach ($t in $tasksToDisable) {
    # Task Scheduler requires TaskPath WITH trailing backslash. Split-Path drops it.
    $taskName = Split-Path $t -Leaf
    $taskPath = (Split-Path $t).TrimEnd('\') + '\'
    Disable-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
}
cmd /c "sc delete uhssvc >nul 2>&1"
Get-ScheduledTask | Where-Object { $_.TaskName -eq 'PLUGScheduler' } | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue

# =================== Run / RunOnce / Startup wipe ==========================
L "Wiping Run/RunOnce/RunNotification + Startup folders" 'STAGE'
foreach ($k in `
    'HKCU\Software\Microsoft\Windows\CurrentVersion\Run',`
    'HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce',`
    'HKLM\Software\Microsoft\Windows\CurrentVersion\RunNotification',`
    'HKLM\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Run') {
    cmd /c "reg delete `"$k`" /f >nul 2>&1"
    cmd /c "reg add `"$k`" /f >nul 2>&1"
}
foreach ($p in `
    "$env:AppData\Microsoft\Windows\Start Menu\Programs\Startup",`
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp") {
    Remove-Item "$p\*" -Recurse -Force -ErrorAction SilentlyContinue
}

# =================== Windows Update pause 365 days =========================
L "Pausing Windows Update 365 days" 'STAGE'
$end = (Get-Date).AddDays(365).ToString('yyyy-MM-ddTHH:mm:ssZ')
cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings`" /v PauseUpdatesExpiryTime         /t REG_SZ /d `"$end`" /f >nul 2>&1"
cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings`" /v PauseFeatureUpdatesEndTime     /t REG_SZ /d `"$end`" /f >nul 2>&1"
cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings`" /v PauseQualityUpdatesEndTime     /t REG_SZ /d `"$end`" /f >nul 2>&1"
cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings`" /v PauseUpdatesStartTime          /t REG_SZ /d `"$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')`" /f >nul 2>&1"

# =================== NVIDIA driver auto-download (RTX 4090) ================
L "NVIDIA: looking up latest driver for RTX 4090 / Win11..." 'STAGE'
$nvUrl = $null
try {
    $api = 'https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php?func=DriverManualLookup&psid=129&pfid=976&osID=135&languageCode=1033&isWHQL=1&dch=1&sort1=0&numberOfResults=1'
    $resp = Invoke-RestMethod -Uri $api -UseBasicParsing -TimeoutSec 20
    if ($resp.IDS -and $resp.IDS.Count -gt 0) {
        $nvUrl = $resp.IDS[0].downloadInfo.DownloadURL
        L "NVIDIA latest URL: $nvUrl" 'OK'
    }
} catch { L "NVIDIA lookup failed: $($_.Exception.Message)" 'WARN' }

$nvInstaller = "$env:SystemRoot\Temp\nvidia.exe"
$nvOk = $false
if ($nvUrl) {
    try { Get-FileFromWeb -URL $nvUrl -File $nvInstaller; $nvOk = $true } catch { L "NVIDIA download failed: $($_.Exception.Message)" 'WARN' }
}
if (-not $nvOk) {
    $localFallback = Get-ChildItem -Path 'F:\etc\Everything\blurry op\Install\*.exe' -ErrorAction SilentlyContinue | Where-Object Name -Match '^\d{3}\.\d+.*win10-win11-64bit.*\.exe$' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($localFallback) {
        Copy-Item $localFallback.FullName $nvInstaller -Force
        $nvOk = $true
        L "Using local fallback driver: $($localFallback.Name)" 'OK'
    } else {
        L "API + local fallback both failed. Opening file picker..." 'WARN'
        try {
            Add-Type -AssemblyName System.Windows.Forms
            $dlg = New-Object System.Windows.Forms.OpenFileDialog
            $dlg.Title  = "Blurry 4 :: select NVIDIA driver installer (.exe)"
            $dlg.Filter = "NVIDIA Installer (*.exe)|*.exe|All files (*.*)|*.*"
            foreach ($p in @('F:\etc\Everything\blurry op\Install','F:\','C:\')) {
                if (Test-Path $p) { $dlg.InitialDirectory = $p; break }
            }
            $dlg.RestoreDirectory = $true
            if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                $nvInstaller = $dlg.FileName
                $nvOk = $true
                L "NVIDIA driver picked: $nvInstaller" 'OK'
            } else {
                L "File picker cancelled. Skipping NV install." 'FAIL'
            }
        } catch {
            L "File picker failed: $($_.Exception.Message). Skipping NV install." 'FAIL'
        }
    }
}

if ($nvOk) {
    L "Extracting + debloating NVIDIA installer" 'STAGE'
    $nvDir = "$env:SystemRoot\Temp\NVIDIA"
    & "$env:ProgramFiles\7-Zip\7z.exe" x $nvInstaller "-o$nvDir" -y | Out-Null
    foreach ($bloat in 'Display.Update','Display.Optimus','GFExperience','GFExperience.NvStreamSrv','NV3DVisionUSB.Driver','NvContainer','NvTelemetry','NvVAD','PPC','MSVCRT','EULA.txt','license.txt','manifest.toc','Display.NvContainer','ShadowPlay','NvBackend') {
        Remove-Item "$nvDir\$bloat" -Recurse -Force -ErrorAction SilentlyContinue
    }
    L "Installing NVIDIA driver silently" 'STAGE'
    if (-not (Test-Path "$nvDir\setup.exe")) {
        L "NVIDIA setup.exe not found at $nvDir\setup.exe (extraction failed?)" 'FAIL'
    } else {
        # NOTE: -s and -passive are mutually exclusive in NVIDIA setup.exe. Use -s alone.
        Start-Process -Wait "$nvDir\setup.exe" -ArgumentList '-s -noreboot -noeula -clean'
        L "NVIDIA driver installed." 'OK'
    }

    # Apply 600Hz-safe NVIDIA registry tweaks (NEVER touch EnableTiledDisplay)
    L "NVIDIA registry tweaks (600Hz veto on EnableTiledDisplay)" 'STAGE'
    $nvKeys = Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class' -ErrorAction SilentlyContinue |
        Where-Object { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).ProviderName -match 'NVIDIA' } |
        Get-ChildItem -ErrorAction SilentlyContinue |
        Where-Object Name -Match '\\\d{4}$'
    foreach ($k in $nvKeys) {
        $p = $k.PSPath
        # Apply: dynamic Pstate off, HDCP keys, scaling, PhysX off, low-latency-friendly
        Set-ItemProperty -Path $p -Name 'DisableDynamicPstate' -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $p -Name 'NvCplPhysxAuto'       -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $p -Name 'EnableGR535'          -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $p -Name 'Scaling'              -Value 2 -Type DWord -Force -ErrorAction SilentlyContinue
        # 600Hz VETO -- the following key is intentionally NEVER written:
        # Set-ItemProperty $p 'EnableTiledDisplay' 0 -Type DWord    # <-- DO NOT ENABLE. Caps 540/600Hz monitors at 360Hz.
    }
    Set-ItemProperty -Path 'HKCU:\Software\NVIDIA Corporation\NvTray' -Name 'StartOnLogin' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue

    # NVIDIA Control Panel via winget
    L "Installing NVIDIA Control Panel via winget" 'STAGE'
    Start-Process -Wait 'winget' -ArgumentList 'install -e --id 9NF8H0H7WMLT --silent --accept-package-agreements --accept-source-agreements' -WindowStyle Hidden -ErrorAction SilentlyContinue

    # NVPI: download the tool, import fr33thy's .nip (staged in Temp by main stage)
    L "NVIDIA Profile Inspector (auto-import fr33thy's .nip)" 'STAGE'
    try {
        Get-FileFromWeb -URL 'https://github.com/Orbmu2k/nvidiaProfileInspector/releases/download/2.4.0.31/nvidiaProfileInspector.zip' -File "$env:SystemRoot\Temp\nvpi.zip"
        Expand-Archive "$env:SystemRoot\Temp\nvpi.zip" -DestinationPath "$env:SystemRoot\Temp\NVPI" -Force
        $nipPath = "$env:SystemRoot\Temp\fr33thy.nip"
        if (Test-Path $nipPath) {
            Start-Process -Wait "$env:SystemRoot\Temp\NVPI\nvidiaProfileInspector.exe" -ArgumentList "-silentImport -silent `"$nipPath`""
            L "NVPI fr33thy profile imported." 'OK'
        } else { L "NVPI .nip missing at $nipPath" 'WARN' }
    } catch { L "NVPI failed: $($_.Exception.Message)" 'WARN' }
}

# =================== App installs (Steam/Discord/Valorant/Logi OMM) =======
L "Installing user apps (silent + auto-launch killed)" 'STAGE'

# Steam
try {
    Get-FileFromWeb -URL 'https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe' -File "$env:SystemRoot\Temp\SteamSetup.exe"
    Start-Process -Wait "$env:SystemRoot\Temp\SteamSetup.exe" -ArgumentList '/S'
    Remove-Item "$env:Public\Desktop\Steam.lnk" -Force -ErrorAction SilentlyContinue
    cmd /c "reg delete `"HKCU\Software\Microsoft\Windows\CurrentVersion\Run`" /v Steam /f >nul 2>&1"
    L "Steam installed." 'OK'
} catch { L "Steam failed: $($_.Exception.Message)" 'WARN' }

# Discord (official client)
try {
    Get-FileFromWeb -URL 'https://discord.com/api/download?platform=win' -File "$env:SystemRoot\Temp\DiscordSetup.exe"
    Start-Process -Wait "$env:SystemRoot\Temp\DiscordSetup.exe" -ArgumentList '-s'
    Start-Sleep 5
    Get-Process Discord -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    cmd /c "reg delete `"HKCU\Software\Microsoft\Windows\CurrentVersion\Run`" /v Discord /f >nul 2>&1"
    L "Discord installed." 'OK'
} catch { L "Discord failed: $($_.Exception.Message)" 'WARN' }

# Valorant / Riot Client (Riot installer pulls Vanguard automatically)
try {
    Get-FileFromWeb -URL 'https://valorant.secure.dyn.riotcdn.net/channels/public/x/installer/current/live.live.na.exe' -File "$env:SystemRoot\Temp\ValorantSetup.exe"
    Start-Process -Wait "$env:SystemRoot\Temp\ValorantSetup.exe" -ArgumentList '--launch-product=valorant --launch-patchline=live'
    cmd /c "reg delete `"HKCU\Software\Microsoft\Windows\CurrentVersion\Run`" /v `"Riot Client`" /f >nul 2>&1"
    L "Valorant launcher installed." 'OK'
} catch { L "Valorant failed: $($_.Exception.Message)" 'WARN' }

# Logitech G HUB Onboard Memory Manager
try {
    Get-FileFromWeb -URL 'https://download01.logi.com/web/ftp/pub/techsupport/gaming/Onboard_Memory_Manager_Installer.exe' -File "$env:SystemRoot\Temp\LogiOMM.exe"
    Start-Process -Wait "$env:SystemRoot\Temp\LogiOMM.exe" -ArgumentList '/SILENT /SUPPRESSMSGBOXES /NORESTART'
    L "Logitech OMM installed." 'OK'
} catch { L "Logitech OMM failed: $($_.Exception.Message)" 'WARN' }

# =================== Final-stage menu (TWEAK / CLEAN / EXTRAS) =============
# DEBLOAT (option 1) is what just ran -- the fr33thy 3-stage flow + apps.
# 2/3/4 are opt-in. User can pick multiple (e.g. "2 3 4" for all three).
L "Final-stage menu (TWEAK / CLEAN / EXTRAS)" 'STAGE'
Write-Host ""
Write-Host "  ================================================================" -ForegroundColor DarkCyan
Write-Host "  Blurry 4 -- Final-stage menu" -ForegroundColor Yellow
Write-Host "  ================================================================" -ForegroundColor DarkCyan
Write-Host "    1) DEBLOAT   [done]  fr33thy 3-stage debloat + Brave/Steam/Discord/etc." -ForegroundColor Green
Write-Host "    2) TWEAK     [opt-in] TweakingGuy AIO tweaks (verbatim, hardware-detected)" -ForegroundColor Gray
Write-Host "    3) CLEAN     [opt-in] Deep refresh -- caches/DriverStore/AppX/EventLog/DISM" -ForegroundColor Gray
Write-Host "    4) EXTRAS    [opt-in] Blurry4 additions on top of TG (mouse hover, app-kill timeouts)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Pick options space-separated (e.g. '2 3 4' for all three)." -ForegroundColor Gray
Write-Host "  N or empty = skip everything and finish." -ForegroundColor Gray
Write-Host "  ================================================================" -ForegroundColor DarkCyan
$menuAns = Read-Host "  Selection"
$doTweak  = $menuAns -match '\b2\b'
$doClean  = $menuAns -match '\b3\b'
$doExtras = $menuAns -match '\b4\b'
L "Menu selection: TWEAK=$doTweak CLEAN=$doClean EXTRAS=$doExtras" 'OK'

if ($doTweak) {
    L "User opted in to TweakingGuy-style tweaks. Auto-detecting hardware..." 'STAGE'

    # ---- hardware auto-detection ----
    $cpuVendor = try { (Get-CimInstance Win32_Processor -ErrorAction Stop).Manufacturer } catch { 'Unknown' }
    $gpuName   = try { ((Get-CimInstance Win32_VideoController -ErrorAction Stop).Name -join ', ') } catch { '' }
    $gpuVendor = if     ($gpuName -match 'NVIDIA')        { 'NVIDIA' }
                 elseif ($gpuName -match 'AMD|Radeon')    { 'AMD' }
                 elseif ($gpuName -match 'Intel')         { 'iGPU' }
                 else                                      { 'Unknown' }
    $ramGB     = [math]::Round(((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory) / 1GB)
    $hasHDD    = [bool]( Get-PhysicalDisk -ErrorAction SilentlyContinue | Where-Object { $_.MediaType -eq 'HDD' } )
    L "Detected: CPU=$cpuVendor / GPU=$gpuVendor ($gpuName) / RAM=${ramGB}GB / HasHDD=$hasHDD" 'OK'

    # ---- 1. Rebuild perf counters + PowerShell ExecutionPolicy=RemoteSigned ----
    L "TG: rebuild perf counters + PS execution policy" 'STAGE'
    cmd /c "lodctr /r >nul 2>&1"
    foreach ($c in @(
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell`" /v Path /t REG_SZ /d `"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`" /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell`" /v ExecutionPolicy /t REG_SZ /d RemoteSigned /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Wow6432Node\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell`" /v Path /t REG_SZ /d `"C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe`" /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Wow6432Node\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell`" /v ExecutionPolicy /t REG_SZ /d RemoteSigned /f >nul 2>&1"'
    )) { Invoke-Expression $c }

    # ---- 2. Browser updaters / HW accel off (Chrome/Brave/OperaGX) ----
    L "TG: browser updater + HW-accel off (Chrome/Brave/OperaGX)" 'STAGE'
    foreach ($c in @(
        'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Google\Chrome`" /v StartupBoostEnabled              /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Google\Chrome`" /v HardwareAccelerationModeEnabled /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Google\Chrome`" /v BackgroundModeEnabled           /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\GoogleChromeElevationService`" /v Start /t REG_DWORD /d 4 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\gupdate`"  /v Start /t REG_DWORD /d 4 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\gupdatem`" /v Start /t REG_DWORD /d 4 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Policies\BraveSoftware\Brave`" /v StartupBoostEnabled        /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\BraveUpdateService`"   /v Start /t REG_DWORD /d 4 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\BraveElevationService`" /v Start /t REG_DWORD /d 4 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Opera Software\Opera GX`" /v HardwareAccelerationModeEnabled /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Opera Software\Opera GX`" /v BackgroundModeEnabled           /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Opera Software\Opera GX`" /v RunOnStartup                    /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Opera Software\Opera GX`" /v UserFeedbackAllowed             /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Opera Software\Opera GX`" /v CrashReportingEnabled           /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Opera Software\Opera GX`" /v DisableFirstRunImport           /t REG_DWORD /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Policies\Opera Software\Opera GX`" /v DisableAutoupdate               /t REG_DWORD /d 1 /f >nul 2>&1"'
    )) { Invoke-Expression $c }

    # ---- 3. Multimedia "Games" profile + Win32PrioritySeparation ----
    L "TG: multimedia Games profile + Win32PrioritySeparation (Valorant)" 'STAGE'
    foreach ($c in @(
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`" /v ctfmon /t REG_SZ /d `"C:\Windows\System32\ctfmon.exe`" /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games`" /v Affinity            /t REG_DWORD /d 0     /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games`" /v `"Background Only`" /t REG_SZ    /d False /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games`" /v `"Clock Rate`"      /t REG_DWORD /d 10000 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games`" /v `"GPU Priority`"    /t REG_DWORD /d 8     /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games`" /v Priority            /t REG_DWORD /d 6     /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games`" /v `"Scheduling Category`" /t REG_SZ /d High /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games`" /v `"SFIO Priority`"   /t REG_SZ    /d High  /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile`" /v SystemResponsiveness    /t REG_DWORD /d 0          /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile`" /v NetworkThrottlingIndex  /t REG_DWORD /d 4294967295 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers`" /v HwSchMode /t REG_DWORD /d 2 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Software\Microsoft\Windows\CurrentVersion\VideoSettings`" /v VideoQualityOnBattery /t REG_DWORD /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects`" /v VisualFXSetting /t REG_DWORD /d 3 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Desktop\WindowMetrics`" /v MinAnimate /t REG_SZ /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v TaskbarAnimations /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Software\Microsoft\Windows\DWM`" /v EnableAeroPeek /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Software\Microsoft\Windows\DWM`" /v AlwaysHibernateThumbnails /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v IconsOnly      /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v ListviewShadow /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl`" /v Win32PrioritySeparation /t REG_DWORD /d 0x2a /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\Remote Assistance`" /v fAllowToGetHelp /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Software\Policies\Microsoft\Windows\EdgeUI`" /v DisableMFUTracking /t REG_DWORD /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Accessibility`" /v `"Sound on Activation`" /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Accessibility`" /v `"Warning Sounds`"      /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Software\NVIDIA Corporation\NvTray`" /v StartOnLogin /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\Maintenance`" /v MaintenanceDisabled /t REG_DWORD /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications`" /v GlobalUserDisabled /t REG_DWORD /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced`" /v MultiTaskingAltTabFilter /t REG_DWORD /d 3 /f >nul 2>&1"'
    )) { Invoke-Expression $c }

    # ---- 4. Misc system tweaks + Ultimate-Performance power plan ----
    L "TG: net accounts + DISM + bcdedit desc + fsutil" 'STAGE'
    cmd /c "net accounts /maxpwage:unlimited >nul 2>&1"
    cmd /c "DISM /Online /Set-ReservedStorageState /State:Disabled >nul 2>&1"
    cmd /c "bcdedit /set {current} description `"W11 Blurry4`" >nul 2>&1"
    cmd /c "label C: W11 Blurry4 >nul 2>&1"
    cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SoftwareProtectionPlatform`" /v InactivityShutdownDelay /t REG_DWORD /d 4294967295 /f >nul 2>&1"
    cmd /c "fsutil behavior set disable8dot3 1 >nul 2>&1"
    cmd /c "fsutil behavior set disablelastaccess 1 >nul 2>&1"

    # Ultimate-Performance power plan (CPU pegs at boost, cores never park).
    # This is the biggest contributor to "snappy desktop mouse feel" alongside timer res.
    L "TG: activate Ultimate Performance power plan + unpark cores" 'STAGE'
    try {
        cmd /c "powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 >nul 2>&1"
        $upScheme = (powercfg /list) 2>&1 | Where-Object { $_ -match 'Ultimate Performance' } | Select-Object -First 1
        if ($upScheme -match '([0-9a-fA-F\-]{36})') {
            $upGuid = $matches[1]
            cmd /c "powercfg -setacvalueindex $upGuid SUB_PROCESSOR CPMINCORES 100 >nul 2>&1"
            cmd /c "powercfg -setacvalueindex $upGuid SUB_PROCESSOR CPMAXCORES 100 >nul 2>&1"
            cmd /c "powercfg -setacvalueindex $upGuid SUB_PROCESSOR PERFBOOSTMODE 2 >nul 2>&1"
            cmd /c "powercfg -setactive $upGuid >nul 2>&1"
            L "Ultimate Performance plan active ($upGuid). 100% min/max cores, boost=Aggressive." 'OK'
        }
    } catch { L "Power plan setup partial: $($_.Exception.Message)" 'WARN' }


    # ---- 5. bcdedit (NX OptIn -- never AlwaysOff per project policy) ----
    L "TG: bcdedit timer/clock/MSI/x2apic (NX kept OptIn)" 'STAGE'
    foreach ($c in @(
        'cmd /c "bcdedit /set disabledynamictick yes >nul 2>&1"',
        'cmd /c "bcdedit /timeout 8 >nul 2>&1"',
        'cmd /c "bcdedit /set useplatformtick yes >nul 2>&1"',
        'cmd /c "bcdedit /set useplatformclock no >nul 2>&1"',
        'cmd /c "bcdedit /set usefirmwarepcisettings no >nul 2>&1"',
        'cmd /c "bcdedit /set usephysicaldestination no >nul 2>&1"',
        'cmd /c "bcdedit /set MSI Default >nul 2>&1"',
        'cmd /c "bcdedit /set configaccesspolicy Default >nul 2>&1"',
        'cmd /c "bcdedit /set x2apicpolicy Enable >nul 2>&1"',
        'cmd /c "bcdedit /set vm Yes >nul 2>&1"',
        'cmd /c "bcdedit /set vsmlaunchtype Off >nul 2>&1"',
        'cmd /c "bcdedit /deletevalue uselegacyapicmode >nul 2>&1"',
        'cmd /c "bcdedit /set tscsyncpolicy Enhanced >nul 2>&1"',
        'cmd /c "bcdedit /set nx OptIn >nul 2>&1"',
        'cmd /c "bcdedit /set hypervisorlaunchtype off >nul 2>&1"',
        'cmd /c "bcdedit /set isolatedcontext No >nul 2>&1"'
    )) { Invoke-Expression $c }

    # ---- 6. VALORANT QoS (DSCP 46) ----
    L "TG: VALORANT QoS DSCP 46" 'STAGE'
    $valQoSPath = 'HKLM\SOFTWARE\Policies\Microsoft\Windows\QoS\VALORANT'
    foreach ($pair in @(
        @{N='Version';V='1.0'}, @{N='Application Name';V='VALORANT-Win64-Shipping.exe'},
        @{N='Protocol';V='*'}, @{N='Local Port';V='*'}, @{N='Local IP';V='*'},
        @{N='Local IP Prefix Length';V='*'}, @{N='Remote Port';V='*'}, @{N='Remote IP';V='*'},
        @{N='Remote IP Prefix Length';V='*'}, @{N='DSCP Value';V='46'}, @{N='Throttle Rate';V='-1'}
    )) {
        cmd /c "reg add `"$valQoSPath`" /v `"$($pair.N)`" /t REG_SZ /d `"$($pair.V)`" /f >nul 2>&1"
    }

    # ---- 7. Game Bar full neuter (extra to Blurry4 base) ----
    L "TG: GameBar/GameDVR full neuter" 'STAGE'
    foreach ($c in @(
        'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\GameBar`" /v AllowAutoGameMode      /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\GameBar`" /v GamePanelStartupTipIndex /t REG_DWORD /d 3 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR`" /v AppCaptureEnabled /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\SYSTEM\GameConfigStore`" /v GameDVR_DSEBehavior                  /t REG_DWORD /d 2 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\SYSTEM\GameConfigStore`" /v GameDVR_DXGIHonorFSEWindowsCompatible /t REG_DWORD /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\SYSTEM\GameConfigStore`" /v GameDVR_EFSEFeatureFlags             /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\SYSTEM\GameConfigStore`" /v GameDVR_FSEBehavior                  /t REG_DWORD /d 2 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\SYSTEM\GameConfigStore`" /v GameDVR_FSEBehaviorMode              /t REG_DWORD /d 2 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\SYSTEM\GameConfigStore`" /v GameDVR_HonorUserFSEBehaviorMode     /t REG_DWORD /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\PolicyManager\default\ApplicationManagement\AllowGameDVR`" /v value /t REG_DWORD /d 0 /f >nul 2>&1"'
    )) { Invoke-Expression $c }

    # ---- 8. Latency Tolerance (massive reg block, all safe) ----
    L "TG: latency tolerance reg block" 'STAGE'
    $latKeys = @(
        @{P='HKLM\SYSTEM\CurrentControlSet\Services\DXGKrnl'; V=@('MonitorLatencyTolerance','MonitorRefreshLatencyTolerance')},
        @{P='HKLM\SYSTEM\CurrentControlSet\Control\Power'; V=@('ExitLatency','ExitLatencyCheckEnabled','Latency','LatencyToleranceDefault','LatencyToleranceFSVP','LatencyTolerancePerfOverride','LatencyToleranceScreenOffIR','LatencyToleranceVSyncEnabled','RtlCapabilityCheckLatency')},
        @{P='HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Power'; V=@('DefaultD3TransitionLatencyActivelyUsed','DefaultD3TransitionLatencyIdleLongTime','DefaultD3TransitionLatencyIdleMonitorOff','DefaultD3TransitionLatencyIdleNoContext','DefaultD3TransitionLatencyIdleShortTime','DefaultD3TransitionLatencyIdleVeryLongTime','DefaultLatencyToleranceIdle0','DefaultLatencyToleranceIdle0MonitorOff','DefaultLatencyToleranceIdle1','DefaultLatencyToleranceIdle1MonitorOff','DefaultLatencyToleranceMemory','DefaultLatencyToleranceNoContext','DefaultLatencyToleranceNoContextMonitorOff','DefaultLatencyToleranceOther','DefaultLatencyToleranceTimerPeriod','DefaultMemoryRefreshLatencyToleranceActivelyUsed','DefaultMemoryRefreshLatencyToleranceMonitorOff','DefaultMemoryRefreshLatencyToleranceNoContext','Latency','MaxIAverageGraphicsLatencyInOneBucket','MiracastPerfTrackGraphicsLatency','MonitorLatencyTolerance','MonitorRefreshLatencyTolerance','TransitionLatency')}
    )
    foreach ($g in $latKeys) {
        foreach ($v in $g.V) { cmd /c "reg add `"$($g.P)`" /v $v /t REG_DWORD /d 1 /f >nul 2>&1" }
    }

    # ---- 9. Resource Policy / scheduler tunables ----
    L "TG: ResourcePolicyStore CPU caps + Importance priorities" 'STAGE'
    foreach ($k in @('HardCap0','Paused','SoftCapFull','SoftCapLow')) {
        cmd /c "reg add `"HKLM\SYSTEM\ResourcePolicyStore\ResourceSets\Policies\CPU\$k`" /v CapPercentage  /t REG_DWORD /d 0 /f >nul 2>&1"
        cmd /c "reg add `"HKLM\SYSTEM\ResourcePolicyStore\ResourceSets\Policies\CPU\$k`" /v SchedulingType /t REG_DWORD /d 0 /f >nul 2>&1"
    }
    foreach ($f in @('BackgroundDefault','Frozen','FrozenDNCS','FrozenDNK','FrozenPPLE','Paused','PausedDNK','Pausing','PrelaunchForeground','ThrottleGPUInterference')) {
        cmd /c "reg add `"HKLM\SYSTEM\ResourcePolicyStore\ResourceSets\Policies\Flags\$f`" /v IsLowPriority /t REG_DWORD /d 0 /f >nul 2>&1"
    }
    foreach ($i in @('Critical','CriticalNoUi','EmptyHostPPLE','High','Low','Lowest','Medium','MediumHigh','StartHost','VeryHigh','VeryLow')) {
        cmd /c "reg add `"HKLM\SYSTEM\ResourcePolicyStore\ResourceSets\Policies\Importance\$i`" /v BasePriority       /t REG_DWORD /d 82 /f >nul 2>&1"
        cmd /c "reg add `"HKLM\SYSTEM\ResourcePolicyStore\ResourceSets\Policies\Importance\$i`" /v OverTargetPriority /t REG_DWORD /d 50 /f >nul 2>&1"
    }
    cmd /c "reg add `"HKLM\SYSTEM\ResourcePolicyStore\ResourceSets\Policies\IO\NoCap`"     /v IOBandwidth  /t REG_DWORD /d 0          /f >nul 2>&1"
    cmd /c "reg add `"HKLM\SYSTEM\ResourcePolicyStore\ResourceSets\Policies\Memory\NoCap`" /v CommitLimit  /t REG_DWORD /d 4294967295 /f >nul 2>&1"
    cmd /c "reg add `"HKLM\SYSTEM\ResourcePolicyStore\ResourceSets\Policies\Memory\NoCap`" /v CommitTarget /t REG_DWORD /d 4294967295 /f >nul 2>&1"

    # ---- 10. Event-trace autologgers + csrss priority ----
    L "TG: WMI Autologgers + csrss priority" 'STAGE'
    cmd /c "reg delete `"HKLM\SYSTEM\CurrentControlSet\Control\WMI\Autologger`" /f >nul 2>&1"
    cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\csrss.exe\PerfOptions`" /v CpuPriorityClass /t REG_DWORD /d 4 /f >nul 2>&1"
    cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\csrss.exe\PerfOptions`" /v IoPriority       /t REG_DWORD /d 4 /f >nul 2>&1"

    # ---- 11. NetBIOS off on every IP-enabled NIC ----
    L "TG: NetBIOS off on every IP-enabled NIC" 'STAGE'
    try {
        Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=true' -ErrorAction SilentlyContinue |
            ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName SetTcpipNetbios -Arguments @{TcpipNetbiosOptions=[uint32]2} -ErrorAction SilentlyContinue | Out-Null }
    } catch { L "NetBIOS off failed: $($_.Exception.Message)" 'WARN' }

    # ---- 12. Network resets + netsh TCP/IP tuning (network briefly disrupted) ----
    L "TG: netsh TCP/IP tuning (network briefly disrupted)" 'STAGE'
    cmd /c "ipconfig /flushdns >nul 2>&1"
    foreach ($cmd in @(
        'netsh int ip reset','netsh int ipv4 reset','netsh int ipv6 reset','netsh int tcp reset',
        'netsh winsock reset','netsh advfirewall reset','netsh branchcache reset','netsh http flush logbuffer',
        'netsh int tcp set global autotuninglevel=disabled',
        'netsh int tcp set global ecncapability=disabled',
        'netsh int tcp set global dca=enabled',
        'netsh int tcp set global netdma=enabled',
        'netsh int tcp set global rsc=disabled',
        'netsh int tcp set global rss=enabled',
        'netsh int tcp set global timestamps=disabled',
        'netsh int tcp set global initialRto=2000',
        'netsh int tcp set global nonsackrttresiliency=disabled',
        'netsh int tcp set global maxsynretransmissions=2',
        'netsh int tcp set security mpp=disabled',
        'netsh int tcp set security profiles=disabled',
        'netsh int tcp set heuristics disabled',
        'netsh int ip set global neighborcachelimit=4096',
        'netsh int tcp set supplemental Internet congestionprovider=ctcp',
        'netsh int ip set global taskoffload=disabled',
        'netsh int ipv6 set state disabled',
        'netsh int isatap set state disabled',
        'netsh int teredo set state disabled'
    )) { cmd /c "$cmd >nul 2>&1" }
    Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
        cmd /c "netsh interface ipv4 set subinterface `"$($_.Name)`" mtu=1500 store=persistent >nul 2>&1"
    }

    # ---- 13. TCP/IP registry + Nagle's off + Delivery Optimization off + LanmanServer params ----
    L "TG: TCP/IP reg, Nagle off, Delivery Optimization off, LanmanServer tuning" 'STAGE'
    foreach ($c in @(
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Ndis\Parameters`" /v RssBaseCpu /t REG_DWORD /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters`" /v DefaultTTL          /t REG_DWORD /d 64    /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters`" /v Tcp1323Opts        /t REG_DWORD /d 1     /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters`" /v TcpMaxDupAcks      /t REG_DWORD /d 2     /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters`" /v SackOpts           /t REG_DWORD /d 0     /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters`" /v MaxUserPort        /t REG_DWORD /d 65534 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters`" /v TcpTimedWaitDelay  /t REG_DWORD /d 30    /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider`" /v LocalPriority  /t REG_DWORD /d 4 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider`" /v HostsPriority  /t REG_DWORD /d 5 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider`" /v DnsPriority    /t REG_DWORD /d 6 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\ServiceProvider`" /v NetbtPriority  /t REG_DWORD /d 7 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Winsock`" /v MinSockAddrLength /t REG_DWORD /d 16 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Winsock`" /v MaxSockAddrLength /t REG_DWORD /d 16 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces`" /v TcpAckFrequency /t REG_DWORD /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces`" /v TCPNoDelay      /t REG_DWORD /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces`" /v TcpDelAckTicks  /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\DeliveryOptimization\Config`" /v DODownloadMode /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\DeliveryOptimization\Config`" /v DownloadMode   /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\DeliveryOptimization\Settings`" /v DownloadMode /t REG_DWORD /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\services\LanmanServer\Parameters`" /v autodisconnect          /t REG_DWORD /d 4294967295 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\services\LanmanServer\Parameters`" /v Size                    /t REG_DWORD /d 3          /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\services\LanmanServer\Parameters`" /v EnableOplocks           /t REG_DWORD /d 0          /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\services\LanmanServer\Parameters`" /v IRPStackSize            /t REG_DWORD /d 20         /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\services\LanmanServer\Parameters`" /v SharingViolationDelay   /t REG_DWORD /d 0          /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\services\LanmanServer\Parameters`" /v SharingViolationRetries /t REG_DWORD /d 0          /f >nul 2>&1"'
    )) { Invoke-Expression $c }

    # ---- 14. Per-NIC tweaks (power off, EEE off, RSS, flow control off, interrupt moderation off, offloads off) ----
    L "TG: per-NIC reg tuning" 'STAGE'
    $nicClass = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}'
    if (Test-Path $nicClass) {
        Get-ChildItem $nicClass -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
            $nicReg = $_.PSPath
            if ((Get-ItemProperty $nicReg -Name '*SpeedDuplex' -ErrorAction SilentlyContinue) -ne $null) {
                $sz0  = @('AutoPowerSaveModeEnabled','AutoDisableGigabit','AdvancedEEE','*EEE','EEE','EnablePME','EEELinkAdvertisement','EnableGreenEthernet','EnableSavePowerNow','EnablePowerManagement','EnableDynamicPowerGating','EnableConnectedPowerGating','EnableWakeOnLan','GigaLite','PowerDownPll','PowerSavingMode','ReduceSpeedOnPowerDown','SmartPowerDownEnable','S5NicKeepOverrideMacAddrV2','S5WakeOnLan','ULPMode','WakeOnDisconnect','*WakeOnMagicPacket','*WakeOnPattern','WakeOnLink')
                $szPair= @{
                    'DisableDelayedPowerUp'='2'; 'NicAutoPowerSaver'='2'; 'WolShutdownLinkSpeed'='2';
                    'ReceiveBuffers'='512';     'TransmitBuffers'='4096';
                    'JumboPacket'='1514';
                    'IPChecksumOffloadIPv4'='0';'LsoV1IPv4'='0';'LsoV2IPv4'='0';'LsoV2IPv6'='0';
                    'PMARPOffload'='0';         'PMNSOffload'='0';
                    'TCPChecksumOffloadIPv4'='0';'TCPChecksumOffloadIPv6'='0';
                    'UDPChecksumOffloadIPv6'='0';'UDPChecksumOffloadIPv4'='0';
                    'RSS'='1'; '*NumRssQueues'='4'; 'RSSProfile'='3';
                    '*FlowControl'='0'; 'FlowControlCap'='0';
                    'TxIntDelay'='0'; 'TxAbsIntDelay'='0'; 'RxIntDelay'='0'; 'RxAbsIntDelay'='0';
                    'FatChannelIntolerant'='0';
                    '*InterruptModeration'='0'
                }
                foreach ($k in $sz0)        { Set-ItemProperty -Path $nicReg -Name $k -Value '0' -Force -ErrorAction SilentlyContinue }
                foreach ($k in $szPair.Keys){ Set-ItemProperty -Path $nicReg -Name $k -Value $szPair[$k] -Force -ErrorAction SilentlyContinue }
            }
        }
    }
    try {
        Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue | Set-NetIPInterface -WeakHostSend Enabled -WeakHostReceive Enabled -ErrorAction SilentlyContinue
    } catch {}

    # ---- 15. Service trim (Blurry4: includes Spooler/iphlpsvc/IKEEXT/LanmanWorkstation;
    #          PnP still excluded because it breaks USB hot-plug) ----
    L "TG: service trim (aggressive Blurry4 set)" 'STAGE'
    $svcStart4 = @(
        # always-safe (also in Blurry3's set conceptually)
        'DeviceAssociationService','DPS','DiagSvc','WdiServiceHost','WdiSystemHost',
        'iclsClient','cphs','heci','esifsvc','MEIx64','TeeDriverW8x64','TrustedExecutionEnvironment',
        'diagnosticshub.standardcollector.service','WaaSMedicSvc',
        'NahimicService','NetTcpPortSharing','PcaSvc',
        'RemoteRegistry','RemoteAccess','lmhosts',
        'WpnService','WbioSrvc','WSearch',
        # Blurry4 additions (gaming-only PC, no printing/SMB/IPSec):
        'Spooler',           # printing
        'iphlpsvc',          # IP Helper / IPv6 transition (we already disable IPv6)
        'IKEEXT',            # IPSec keying (no VPN required for Valorant NA)
        'LanmanWorkstation'  # SMB client (no file shares on this gaming-only box)
        # PlugPlay STILL excluded -- breaks USB hot-plug, mouse/kb swaps require reboot
    )
    foreach ($s in $svcStart4) {
        cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\$s`" /v Start /t REG_DWORD /d 4 /f >nul 2>&1"
    }
    cmd /c "reg delete `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Font Drivers`" /v `"Adobe Type Manager`" /f >nul 2>&1"

    # ---- 15b. Aggressive bcdedit + binary renames + Tdr=0 (Blurry4 extras) ----
    L "TG: aggressive bcdedit (nx AlwaysOff) + smartscreen rename + mcupdate rename + Tdr=0" 'STAGE'
    cmd /c "bcdedit /set nx AlwaysOff >nul 2>&1"
    # Rename smartscreen.exe -> .exee (Defender already off; this prevents revival via update)
    cmd /c "taskkill /f /im smartscreen.exe >nul 2>&1"
    cmd /c "ren `"$env:SystemRoot\System32\smartscreen.exe`" smartscreen.exee >nul 2>&1"
    # Rename microcode update modules -- pro tweakers do this for runtime stability/consistency
    cmd /c "ren `"$env:SystemRoot\System32\mcupdate_GenuineIntel.dll`" mcupdate_GenuineIntel.dlll >nul 2>&1"
    cmd /c "ren `"$env:SystemRoot\System32\mcupdate_AuthenticAMD.dll`" mcupdate_AuthenticAMD.dlll >nul 2>&1"
    # NVIDIA TDR off (consistency over recovery -- if GPU hangs, BSOD instead of TDR-recover)
    foreach ($v in @('TdrLevel','TdrDelay','TdrDdiDelay','TdrDebugMode','TdrLimitCount','TdrLimitTime','TdrTestMode')) {
        cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers`" /v $v /t REG_DWORD /d 0 /f >nul 2>&1"
    }

    # ---- 15c. Timer resolution at every login (0.5ms / continuous request flag) ----
    L "TG: timer-resolution scheduled task at every logon" 'STAGE'
    cmd /c "schtasks /delete /tn `"BlurryTimerResolution`" /f >nul 2>&1"
    $tr = 'powershell -windowstyle hidden -command "Add-Type ''[DllImport(\"winmm.dll\")] public static extern uint timeBeginPeriod(uint ms); public static void Main(){timeBeginPeriod(0);}'';[TimerResolution.Program]::Main()"'
    cmd /c "schtasks /create /tn `"BlurryTimerResolution`" /tr $tr /sc onlogon /ru SYSTEM /rl HIGHEST /f >nul 2>&1"

    # ---- 15d. Strip leftover browser updaters (TG file-level removal) ----
    L "TG: strip leftover browser updater binaries (Mozilla/Chrome/Brave/Opera)" 'STAGE'
    foreach ($svc in @('MozillaMaintenance','gupdate','googlechromeelevationservice','gupdatem','brave','bravem')) {
        cmd /c "net stop $svc >nul 2>&1"
        cmd /c "sc delete $svc >nul 2>&1"
    }
    foreach ($img in @('maintenanceservice.exe','uninstall.exe','GoogleUpdate.exe','BraveUpdate.exe')) {
        cmd /c "taskkill /f /im $img >nul 2>&1"
    }
    foreach ($p in @(
        'C:\Program Files (x86)\Mozilla Maintenance Service',
        'C:\Program Files (x86)\Google\Update',
        'C:\Program Files (x86)\BraveSoftware\Update'
    )) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
    foreach ($f in @(
        'C:\Program Files\Mozilla Firefox\maintenanceservice_installer.exe',
        'C:\Program Files\Mozilla Firefox\maintenanceservice.exe',
        'C:\Program Files\Mozilla Firefox\updater.exe'
    )) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
    Get-ChildItem 'C:\Program Files\Google\Chrome\Application\chrmstp.exe' -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    cmd /c "reg delete `"HKCU\Software\Microsoft\Windows\CurrentVersion\Run`" /v `"Opera Browser Assistant`" /f >nul 2>&1"
    cmd /c "reg delete `"HKLM\Software\Microsoft\Active Setup\Installed Components\{8A69D345-D564-463c-AFF1-A69D9E530F96}`" /f >nul 2>&1"
    cmd /c "reg delete `"HKLM\Software\Microsoft\Active Setup\Installed Components\{AFE6A462-C574-4B8A-AF43-4CC60DF4563B}`" /f >nul 2>&1"

    # ---- 15e. MSI mode for USB XHCI controllers (TG SmoothMode appendix) ----
    L "TG: MSI mode for USB XHCI controllers" 'STAGE'
    Get-CimInstance Win32_PnPEntity -Filter "Service='USBXHCI'" -ErrorAction SilentlyContinue | ForEach-Object {
        $pnp = $_.PNPDeviceID
        if ($pnp -like 'PCI*') {
            cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Enum\$pnp\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties`" /v MSISupported /t REG_DWORD /d 1 /f >nul 2>&1"
        }
    }

    # ---- 16. CPU branch (Intel vs AMD) ----
    L "TG: CPU branch ($cpuVendor)" 'STAGE'
    if ($cpuVendor -match 'Intel') {
        cmd /c "reg add `"HKLM\SYSTEM\ControlSet001\Services\msisadrv`" /v Start /t REG_DWORD /d 3 /f >nul 2>&1"
    } elseif ($cpuVendor -match 'AMD') {
        cmd /c "reg add `"HKLM\SYSTEM\ControlSet001\Services\msisadrv`" /v Start /t REG_DWORD /d 4 /f >nul 2>&1"
    }

    # ---- 17. GPU branch (NVIDIA only -- 600Hz veto, Tdr veto, HDCP/TCC/Acceleration veto) ----
    L "TG: GPU branch ($gpuVendor)" 'STAGE'
    if ($gpuVendor -eq 'NVIDIA') {
        $nvParents = Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class' -ErrorAction SilentlyContinue |
            Where-Object { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).ProviderName -match 'NVIDIA' }
        $nvSubs = $nvParents | Get-ChildItem -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' }
        foreach ($s in $nvSubs) {
            $p = $s.PSPath
            Set-ItemProperty $p -Name 'DisableDynamicPstate' -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
            Set-ItemProperty $p -Name 'RMPowerFeature'  -Value 0x55455555 -Type DWord -Force -ErrorAction SilentlyContinue
            Set-ItemProperty $p -Name 'RMPowerFeature2' -Value 0x55455555 -Type DWord -Force -ErrorAction SilentlyContinue
            foreach ($v in @('D3PCLatency','F1TransitionLatency','LOWLATENCY','Node3DLowLatency','RMDeepL1EntryLatencyUsec','RmGspcMaxFtuS','RmGspcMinFtuS','RmGspcPerioduS','RMLpwrEiIdleThresholdUs','RMLpwrGrIdleThresholdUs','RMLpwrGrRgIdleThresholdUs','RMLpwrMsIdleThresholdUs','VRDirectFlipDPCDelayUs','VRDirectFlipTimingMarginUs','VRDirectJITFlipMsHybridFlipDelayUs','vrrCursorMarginUs','vrrDeflickerMarginUs','vrrDeflickerMaxUs')) {
                Set-ItemProperty $p -Name $v -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
            }
            Set-ItemProperty $p -Name 'PciLatencyTimerControl'        -Value 20 -Type DWord -Force -ErrorAction SilentlyContinue
            Set-ItemProperty $p -Name 'PreferSystemMemoryContiguous'  -Value 1  -Type DWord -Force -ErrorAction SilentlyContinue
            # 600Hz/HDCP/TCC/Acceleration/Tdr keys NEVER written (display-risky / break GPU recovery)
            Set-ItemProperty $p -Name 'DesktopStereoShortcuts' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
            Set-ItemProperty $p -Name 'FeatureControl'        -Value 4 -Type DWord -Force -ErrorAction SilentlyContinue
            Set-ItemProperty $p -Name 'RmCacheLoc'            -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
            Set-ItemProperty $p -Name 'RmDisableInst2Sys'     -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
            Set-ItemProperty $p -Name 'RmFbsrPagedDMA'        -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
            Set-ItemProperty $p -Name 'RmProfilingAdminOnly'  -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
            Set-ItemProperty $p -Name 'TrackResetEngine'      -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
            Set-ItemProperty $p -Name 'ValidateBlitSubRects'  -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
        }
        Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'NVIDIA' } | ForEach-Object {
            $pnp = $_.PNPDeviceID
            cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Enum\$pnp\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties`" /v MSISupported /t REG_DWORD /d 1 /f >nul 2>&1"
            cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Enum\$pnp\Device Parameters\Interrupt Management\Affinity Policy`" /v DevicePriority /t REG_DWORD /d 0 /f >nul 2>&1"
        }
        cmd /c "reg delete `"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`" /v NvBackend /f >nul 2>&1"
        cmd /c "reg add `"HKLM\SOFTWARE\NVIDIA Corporation\NvControlPanel2\Client`" /v OptInOrOutPreference /t REG_DWORD /d 0 /f >nul 2>&1"
        foreach ($r in @('EnableRID66610','EnableRID64640','EnableRID44231')) {
            cmd /c "reg add `"HKLM\SOFTWARE\NVIDIA Corporation\Global\FTS`" /v $r /t REG_DWORD /d 0 /f >nul 2>&1"
        }
        foreach ($t in @('NvTmRep_CrashReport1_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NvTmRep_CrashReport2_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NvTmRep_CrashReport3_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NvTmRep_CrashReport4_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NvDriverUpdateCheckDaily_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NVIDIA GeForce Experience SelfUpdate_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NvTmMon_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}')) {
            cmd /c "schtasks /change /disable /tn `"$t`" >nul 2>&1"
        }
        foreach ($c in @(
            'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\nvlddmkm\Global\NVTweak`" /v DisplayPowerSaving /t REG_DWORD /d 0 /f >nul 2>&1"',
            'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\nvlddmkm`" /v DisableWriteCombining /t REG_DWORD /d 1 /f >nul 2>&1"',
            'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\nvlddmkm`" /v RmGpsPsEnablePerCpuCoreDpc /t REG_DWORD /d 1 /f >nul 2>&1"',
            'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\nvlddmkm\NVAPI`" /v RmGpsPsEnablePerCpuCoreDpc /t REG_DWORD /d 1 /f >nul 2>&1"',
            'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\nvlddmkm\Global\NVTweak`" /v RmGpsPsEnablePerCpuCoreDpc /t REG_DWORD /d 1 /f >nul 2>&1"',
            'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers`" /v RmGpsPsEnablePerCpuCoreDpc /t REG_DWORD /d 1 /f >nul 2>&1"',
            'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Power`" /v RmGpsPsEnablePerCpuCoreDpc /t REG_DWORD /d 1 /f >nul 2>&1"'
        )) { Invoke-Expression $c }
    } elseif ($gpuVendor -eq 'AMD') {
        L "AMD branch -- not user's hardware, skipping AMD-specific block." 'WARN'
    } else {
        L "iGPU/Unknown -- skipping GPU-specific tweaks." 'WARN'
    }

    # ---- 18. RAM-aware SvcHostSplitThreshold ----
    L "TG: SvcHostSplitThreshold for RAM=${ramGB}GB" 'STAGE'
    $svcThresh = if     ($ramGB -le 16) { 0x01000000 }
                 elseif ($ramGB -le 32) { 0x02000000 }
                 elseif ($ramGB -le 48) { 0x03000000 }
                 else                   { 0x04000000 }
    cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control`" /v SvcHostSplitThresholdInKB /t REG_DWORD /d $svcThresh /f >nul 2>&1"

    # ---- 19. SysMain (SSD vs HDD) ----
    $sysmainStart = if ($hasHDD) { 3 } else { 4 }
    L "TG: SysMain Start=$sysmainStart (HDD=$hasHDD)" 'STAGE'
    cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\SysMain`" /v Start /t REG_DWORD /d $sysmainStart /f >nul 2>&1"

    # ==========================================================================
    # CALYPTO LATENCY GUIDE
    # ==========================================================================
    # Mouse/kbd queue depth, kernel page-lock, USB selective-suspend off per
    # device, IFEO P-core priority for VALORANT. Reference: WHY_SMOOTH.md --
    # "USB power management completely off, MSI mode forced on USBXHCI".
    L "Calypto: mouse/kbd queue, page lock, USB suspend off, IFEO Valorant" 'STAGE'
    foreach ($c in @(
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\mouclass\Parameters`" /v MouseDataQueueSize    /t REG_DWORD /d 50 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters`" /v KeyboardDataQueueSize /t REG_DWORD /d 50 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Services\HidUsb\Parameters`"   /v MaximumPortsServiced  /t REG_DWORD /d 3  /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management`" /v DisablePagingExecutive /t REG_DWORD /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management`" /v LargeSystemCache       /t REG_DWORD /d 0 /f >nul 2>&1"'
    )) { Invoke-Expression $c }
    Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |
        Where-Object { $_.PNPDeviceID -match '^USB\\(VID|ROOT_HUB)' } | ForEach-Object {
            $pnp = $_.PNPDeviceID
            cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Enum\$pnp\Device Parameters`" /v EnhancedPowerManagementEnabled /t REG_DWORD /d 0 /f >nul 2>&1"
            cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Enum\$pnp\Device Parameters`" /v AllowIdleIrpInD3 /t REG_DWORD /d 0 /f >nul 2>&1"
            cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Enum\$pnp\Device Parameters`" /v EnableSelectiveSuspend /t REG_DWORD /d 0 /f >nul 2>&1"
        }
    cmd /c "powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 >nul 2>&1"
    cmd /c "powercfg /setactive SCHEME_CURRENT >nul 2>&1"
    foreach ($exe in @('VALORANT.exe','VALORANT-Win64-Shipping.exe','RiotClientServices.exe')) {
        cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\$exe\PerfOptions`" /v CpuPriorityClass /t REG_DWORD /d 3 /f >nul 2>&1"
    }

    # ==========================================================================
    # BoringBoom -- NVPI Low-Latency-Ultra (layered import)
    # ==========================================================================
    # Imports F:\etc\Everything\blurry op\Nvidia\Low Latency Ultra.nip on top of
    # the fr33thy.nip already imported in StepTwo's NVPI step. NVPI silentImport
    # only sets keys present in the .nip; running both layers BoringBoom's keys
    # over fr33thy's without conflict.
    L "BoringBoom: layer Low Latency Ultra .nip on top of fr33thy.nip" 'STAGE'
    $bbNip = 'F:\etc\Everything\blurry op\Nvidia\Low Latency Ultra.nip'
    $nvpiExe = "$env:SystemRoot\Temp\NVPI\nvidiaProfileInspector.exe"
    if ((Test-Path $bbNip) -and (Test-Path $nvpiExe)) {
        try {
            Start-Process -Wait $nvpiExe -ArgumentList "-silentImport -silent `"$bbNip`""
            L "BoringBoom .nip imported." 'OK'
        } catch { L "BoringBoom import failed: $($_.Exception.Message)" 'WARN' }
    } else {
        L "BoringBoom .nip ($bbNip) or NVPI exe missing -- skipping." 'WARN'
    }

    # ==========================================================================
    # BOHR V13 power plan (overrides Ultimate Performance set earlier in TWEAK)
    # ==========================================================================
    L "BOHR: import V13 power plan (if F:\blurry win2026\BOHRV13.pow exists)" 'STAGE'
    $bohrPow = 'F:\blurry win2026\BOHRV13.pow'
    if (Test-Path $bohrPow) {
        try {
            $impOut = & powercfg.exe /import $bohrPow 2>&1 | Out-String
            if ($impOut -match '([0-9a-fA-F\-]{36})') {
                $bohrGuid = $matches[1]
                cmd /c "powercfg /setactive $bohrGuid >nul 2>&1"
                L "BOHR V13 imported and active ($bohrGuid). Replaces Ultimate Performance." 'OK'
            } else {
                L "BOHR V13 import returned no GUID; activation skipped." 'WARN'
            }
        } catch { L "BOHR V13 import failed: $($_.Exception.Message)" 'WARN' }
    } else {
        L "BOHR V13 .pow not found at $bohrPow -- TWEAK's Ultimate Performance plan stays active." 'WARN'
    }

    L "(2) TWEAK complete." 'OK'
} else {
    L "(2) TWEAK -- not selected. Skipping." 'WARN'
}

# =================== (3) CLEAN -- deep refresh ("fresh-feel") =============
if ($doClean) {
    L "(3) CLEAN -- running..." 'STAGE'

    # ---- Caches: browser / Discord / NVIDIA / Steam / DirectX / shader / thumbnail / icon ----
    L "Clean: caches (browser/Discord/NVIDIA/Steam/DirectX/thumb/icon)" 'STAGE'
    $cachePaths = @(
        # Brave
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Cache",
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Code Cache",
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\GPUCache",
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\ShaderCache",
        # Chrome
        "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache",
        "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Code Cache",
        "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\GPUCache",
        "$env:LOCALAPPDATA\Google\Chrome\User Data\ShaderCache",
        # Edge
        "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache",
        "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Code Cache",
        "$env:LOCALAPPDATA\Microsoft\Edge\User Data\ShaderCache",
        # Firefox (any profile)
        "$env:LOCALAPPDATA\Mozilla\Firefox\Profiles",
        # Discord
        "$env:APPDATA\discord\Cache",
        "$env:APPDATA\discord\Code Cache",
        "$env:APPDATA\discord\GPUCache",
        # NVIDIA shader cache
        "$env:LOCALAPPDATA\NVIDIA\DXCache",
        "$env:LOCALAPPDATA\NVIDIA\GLCache",
        "$env:PROGRAMDATA\NVIDIA Corporation\NV_Cache",
        # AMD shader cache
        "$env:LOCALAPPDATA\AMD\DxCache",
        "$env:LOCALAPPDATA\AMD\GLCache",
        # Steam shader cache
        "$env:PROGRAMFILES(x86)\Steam\steamapps\shadercache",
        # DirectX shader cache (Win11)
        "$env:LOCALAPPDATA\D3DSCache",
        # System thumbnail cache
        "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
    )
    foreach ($p in $cachePaths) {
        if ($p -and (Test-Path $p)) {
            try { Get-ChildItem $p -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue } catch {}
        }
    }
    # Icon cache rebuild prep
    Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache_*.db" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

    # ---- Temp + Prefetch ----
    L "Clean: %TEMP% + Windows\Temp + Prefetch" 'STAGE'
    foreach ($tp in @("$env:TEMP", "$env:SystemRoot\Temp", "$env:SystemRoot\Prefetch")) {
        if (Test-Path $tp) {
            Get-ChildItem $tp -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        }
    }

    # ---- DISM image cleanup (component store) ----
    L "Clean: DISM /StartComponentCleanup /ResetBase (a few minutes)" 'STAGE'
    cmd /c "DISM /Online /Cleanup-Image /StartComponentCleanup /ResetBase >nul 2>&1"
    cmd /c "DISM /Online /Cleanup-Image /SPSuperseded >nul 2>&1"

    # ---- DriverStore prune (unused driver packages) ----
    L "Clean: DriverStore prune (pnputil /enum-drivers + /delete-driver /uninstall)" 'STAGE'
    try {
        $drvOutput = & pnputil.exe /enum-drivers 2>&1
        $oemPubs = @{}
        $currentOem = $null; $currentDate = $null; $currentVer = $null; $origName = $null
        foreach ($line in $drvOutput) {
            if ($line -match 'Published Name\s*:\s*(oem\d+\.inf)') { $currentOem = $matches[1] }
            elseif ($line -match 'Original Name\s*:\s*(.+\.inf)')   { $origName    = $matches[1].Trim() }
            elseif ($line -match 'Driver Version\s*:\s*(\S+)\s+(\S+)') { $currentDate = $matches[1]; $currentVer = $matches[2] }
            elseif ($line -match '^\s*$' -and $currentOem) {
                if (-not $oemPubs.ContainsKey($origName)) { $oemPubs[$origName] = @() }
                $oemPubs[$origName] += [pscustomobject]@{ Oem=$currentOem; Date=$currentDate; Ver=$currentVer }
                $currentOem = $null; $currentDate = $null; $currentVer = $null; $origName = $null
            }
        }
        foreach ($k in $oemPubs.Keys) {
            $sorted = $oemPubs[$k] | Sort-Object @{Expression={[datetime]$_.Date}; Descending=$true}, @{Expression={[version]$_.Ver}; Descending=$true}
            if ($sorted.Count -gt 1) {
                foreach ($older in ($sorted | Select-Object -Skip 1)) {
                    cmd /c "pnputil.exe /delete-driver $($older.Oem) /uninstall /force >nul 2>&1"
                }
            }
        }
    } catch { L "DriverStore prune partial: $($_.Exception.Message)" 'WARN' }

    # ---- Event logs cleared ----
    L "Clean: clear all Windows event logs" 'STAGE'
    try {
        $logs = & wevtutil.exe el 2>&1
        foreach ($logName in $logs) {
            if ($logName) { cmd /c "wevtutil.exe cl `"$($logName.Trim())`" >nul 2>&1" }
        }
    } catch {}

    # ---- AppX bloat re-strip (in case MS updates re-added) ----
    L "Clean: re-strip AppX bloat (Teams/Outlook/XboxOverlay etc.)" 'STAGE'
    foreach ($n in @('*MSTeams*','*Microsoft.OutlookForWindows*','*Microsoft.XboxGamingOverlay*','*Microsoft.XboxSpeechToTextOverlay*','*Microsoft.BingNews*','*Microsoft.BingWeather*','*Microsoft.GetHelp*','*Microsoft.Getstarted*','*Microsoft.MicrosoftSolitaireCollection*','*Microsoft.People*','*Microsoft.WindowsFeedbackHub*','*Microsoft.YourPhone*','*Microsoft.ZuneMusic*','*Microsoft.ZuneVideo*','*Clipchamp*','*LinkedIn*','*Spotify*')) {
        Get-AppxPackage -AllUsers $n -ErrorAction SilentlyContinue | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue
        Get-AppxProvisionedPackage -Online | Where-Object DisplayName -Like $n | ForEach-Object { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue | Out-Null }
    }

    # ---- Re-disable scheduled tasks that come back via updates ----
    L "Clean: re-disable scheduled tasks that auto-rearm" 'STAGE'
    $taskList = @(
        '\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser',
        '\Microsoft\Windows\Application Experience\ProgramDataUpdater',
        '\Microsoft\Windows\Customer Experience Improvement Program\Consolidator',
        '\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip',
        '\Microsoft\Windows\Defrag\ScheduledDefrag',
        '\Microsoft\Windows\Diagnosis\Scheduled',
        '\Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticDataCollector',
        '\Microsoft\Windows\Maps\MapsToastTask',
        '\Microsoft\Windows\Maps\MapsUpdateTask',
        '\Microsoft\Windows\Windows Defender\Windows Defender Cache Maintenance',
        '\Microsoft\Windows\Windows Defender\Windows Defender Cleanup',
        '\Microsoft\Windows\Windows Defender\Windows Defender Scheduled Scan',
        '\Microsoft\Windows\Windows Defender\Windows Defender Verification'
    )
    foreach ($t in $taskList) {
        $taskName = Split-Path $t -Leaf
        $taskPath = (Split-Path $t).TrimEnd('\') + '\'
        Disable-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
    }

    # ---- Run / RunOnce / Startup wipe (apps re-add themselves over time) ----
    L "Clean: wipe Run/RunOnce" 'STAGE'
    foreach ($k in @('HKCU\Software\Microsoft\Windows\CurrentVersion\Run','HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce','HKLM\Software\Microsoft\Windows\CurrentVersion\RunNotification','HKLM\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Run')) {
        cmd /c "reg delete `"$k`" /f >nul 2>&1"
        cmd /c "reg add `"$k`" /f >nul 2>&1"
    }
    foreach ($p in @("$env:AppData\Microsoft\Windows\Start Menu\Programs\Startup","$env:ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp")) {
        Remove-Item "$p\*" -Recurse -Force -ErrorAction SilentlyContinue
    }

    # ---- DNS / ARP / NetBIOS caches ----
    L "Clean: flush DNS / ARP / NetBIOS caches" 'STAGE'
    cmd /c "ipconfig /flushdns >nul 2>&1"
    cmd /c "arp -d * >nul 2>&1"
    cmd /c "nbtstat -R >nul 2>&1"
    cmd /c "nbtstat -RR >nul 2>&1"

    # ---- TRIM SSDs ----
    L "Clean: Optimize-Volume (TRIM) all fixed drives" 'STAGE'
    Get-Volume -ErrorAction SilentlyContinue | Where-Object { $_.DriveType -eq 'Fixed' -and $_.DriveLetter } | ForEach-Object {
        try { Optimize-Volume -DriveLetter $_.DriveLetter -ReTrim -ErrorAction SilentlyContinue } catch {}
    }

    # ---- Empty Recycle Bin ----
    L "Clean: empty Recycle Bin" 'STAGE'
    try { Clear-RecycleBin -Force -ErrorAction SilentlyContinue } catch {}

    L "(3) CLEAN complete." 'OK'
} else {
    L "(3) CLEAN -- not selected. Skipping." 'WARN'
}

# =================== (4) EXTRAS -- Blurry4 additions on top of TG ==========
# Things NOT in the TweakingGuy AIO batch -- only here. Mostly desktop
# micro-feel (mouse hover, app-kill timeouts) on top of TG's foundation.
if ($doExtras) {
    L "(4) EXTRAS -- running Blurry4 additions on top of TG..." 'STAGE'

    # ---- Mouse hover instant + cursor feel ----
    L "EXTRAS: mouse hover + cursor feel" 'STAGE'
    foreach ($c in @(
        'cmd /c "reg add `"HKCU\Control Panel\Mouse`" /v MouseHoverTime   /t REG_SZ /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Mouse`" /v MouseHoverWidth  /t REG_SZ /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Mouse`" /v MouseHoverHeight /t REG_SZ /d 1 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Mouse`" /v MouseTrails      /t REG_SZ /d 0 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Desktop`" /v CursorBlinkRate /t REG_SZ /d 530 /f >nul 2>&1"'
    )) { Invoke-Expression $c }

    # ---- Application kill / hung-app timeouts (snappier desktop on app close) ----
    L "EXTRAS: app-kill / hung-app timeouts" 'STAGE'
    foreach ($c in @(
        'cmd /c "reg add `"HKCU\Control Panel\Desktop`" /v ForegroundLockTimeout /t REG_DWORD /d 0    /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Desktop`" /v ForegroundFlashCount  /t REG_DWORD /d 0    /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Desktop`" /v WaitToKillAppTimeout  /t REG_SZ    /d 5000 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Desktop`" /v HungAppTimeout        /t REG_SZ    /d 1000 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Desktop`" /v LowLevelHooksTimeout  /t REG_DWORD /d 1000 /f >nul 2>&1"',
        'cmd /c "reg add `"HKCU\Control Panel\Desktop`" /v AutoEndTasks          /t REG_SZ    /d 1    /f >nul 2>&1"',
        'cmd /c "reg add `"HKLM\SYSTEM\CurrentControlSet\Control`" /v WaitToKillServiceTimeout /t REG_SZ /d 2000 /f >nul 2>&1"'
    )) { Invoke-Expression $c }

    L "(4) EXTRAS complete." 'OK'
} else {
    L "(4) EXTRAS -- not selected. Skipping." 'WARN'
}

# =================== Cleanup ==============================================
L "Cleaning up Temp artifacts" 'STAGE'
foreach ($p in @(
    "$env:SystemRoot\Temp\7Zip.exe","$env:SystemRoot\Temp\BraveSetup.exe",
    "$env:SystemRoot\Temp\DDU.exe","$env:SystemRoot\Temp\DDU","$env:SystemRoot\Temp\DirectX","$env:SystemRoot\Temp\DirectX.exe",
    "$env:SystemRoot\Temp\NVIDIA","$env:SystemRoot\Temp\NVPI","$env:SystemRoot\Temp\nvpi.zip","$env:SystemRoot\Temp\nvidia.exe",
    "$env:SystemRoot\Temp\fr33thy.nip",
    "$env:SystemRoot\Temp\SteamSetup.exe","$env:SystemRoot\Temp\DiscordSetup.exe","$env:SystemRoot\Temp\ValorantSetup.exe","$env:SystemRoot\Temp\LogiOMM.exe",
    "$env:SystemRoot\Temp\StepOne.ps1","$env:SystemRoot\Temp\StepTwo.ps1"
)) {
    Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
}
Get-ChildItem "$env:SystemRoot\Temp\vcredist_*.exe" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

L "StepTwo done. Reboot one more time when convenient." 'OK'
Write-Host ""
Write-Host "  ================================================================" -ForegroundColor Green
Write-Host "  Blurry 4 complete. Log: $LogPath" -ForegroundColor Green
Write-Host "  Reboot once more to fully settle changes." -ForegroundColor Yellow
Write-Host "  ================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Press any key to close this window." -ForegroundColor Cyan
try { [void][System.Console]::ReadKey($true) } catch { Read-Host | Out-Null }
'@

$StepTwoPath = "$Script:TempDir\StepTwo.ps1"
Set-Content -Path $StepTwoPath -Value $StepTwoPs1 -Force -Encoding UTF8
Write-Log "StepTwo written -> $StepTwoPath" 'OK'

# =============================================================================
# Arm Userinit -> StepOne, RunOnce -> StepTwo, set safe boot, reboot
# (matches fr33thy WinSux.ps1 lines 353/4192/4199/4204)
# =============================================================================
Write-Log "Arming Userinit + RunOnce + safeboot, then rebooting into safe mode" 'STAGE'

# Userinit hijack -> StepOne. fr33thy's pattern: powershell only, no userinit.exe prefix.
# This works because the next boot is into SAFE MODE, where Win11's "Please wait" splash
# is skipped and Explorer-launch isn't gated on userinit.exe being in this list.
cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`" /v Userinit /t REG_SZ /d `"powershell.exe -nop -ep bypass -WindowStyle Maximized -f $env:SystemRoot\Temp\StepOne.ps1`" /f >nul 2>&1"

# RunOnce -> StepTwo, fires after safe boot is over (StepOne removes safeboot before its DDU reboot).
cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce`" /v Blurry4StepTwo /t REG_SZ /d `"powershell.exe -NoExit -nop -ep bypass -WindowStyle Maximized -f $env:SystemRoot\Temp\StepTwo.ps1`" /f >nul 2>&1"

# Turn on safe boot so the reboot below lands in safe mode.
cmd /c "bcdedit /set {current} safeboot minimal >nul 2>&1"
Write-Log "safeboot=minimal armed for next reboot." 'OK'

Write-Host ""
Write-Host "  Stage 1 complete. Restarting into safe mode..." -ForegroundColor Yellow
Write-Host "  StepOne will run automatically (Defender off + DDU + reboot to normal)." -ForegroundColor Yellow
Write-Host "  Then StepTwo runs in normal mode (the big debloat + app installs)." -ForegroundColor Yellow
Write-Host ""
Start-Sleep -Seconds 5

Write-Log "Blurry 4 main stage exit -> shutdown -r -t 00 (handing off to safe-boot StepOne)." 'OK'
shutdown -r -t 00
