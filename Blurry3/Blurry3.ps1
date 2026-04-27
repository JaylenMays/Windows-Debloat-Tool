# =============================================================================
# Blurry Windows Debloat Tool 3
# Fresh-install, fire-and-forget Windows 11 debloat + gaming tuning.
# Cloned from fr33thy's WinSux (3-stage: Main -> SafeBoot/DDU -> StepTwo)
# with these additions: Steam/Discord/Valorant/Logitech OMM/Xbox-app-kept,
# 600Hz EnableTiledDisplay veto, restore point, persistent log.
#
# Run via Blurry3.bat (auto-elevates).
# =============================================================================

#region ------------------- bootstrap -------------------
# Crash trap: if anything errors out before / during log setup, surface it
# instead of letting the window vanish silently.
trap {
    Write-Host ""
    Write-Host "  !!  Blurry 3 hit an unhandled error  !!" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Script: $PSCommandPath" -ForegroundColor DarkGray
    Write-Host "  Line:   $($_.InvocationInfo.ScriptLineNumber)  $($_.InvocationInfo.Line.Trim())" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Press any key to close this window..." -ForegroundColor Yellow
    try { [void][System.Console]::ReadKey($true) } catch { Read-Host | Out-Null }
    Exit 1
}

If (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    # Re-launch elevated with -NoExit so the spawned window stays open if the
    # script errors before its own crash trap fires.
    Start-Process PowerShell.exe -ArgumentList ("-NoExit -NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $PSCommandPath) -Verb RunAs
    Exit
}

$Host.UI.RawUI.WindowTitle      = "Blurry 3 (Administrator)"
$Host.UI.RawUI.BackgroundColor  = "Black"
$Host.UI.RawUI.ForegroundColor  = "White"
try { $Host.PrivateData.ProgressBackgroundColor = "Black" } catch {}
try { $Host.PrivateData.ProgressForegroundColor = "White" } catch {}
Clear-Host

$ProgressPreference   = 'SilentlyContinue'
$ErrorActionPreference= 'Continue'

$Script:LogDir  = "$env:SystemDrive\Blurry3\logs"
$Script:LogPath = Join-Path $Script:LogDir "blurry3.log"
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
Write-Log "Blurry 3 launched. PID=$PID UserDomain=$env:USERDOMAIN" 'STAGE'

# ---- Internet check ----------------------------------------------------------
if (-not (Test-Internet)) {
    Write-Log "No internet. Aborting." 'FAIL'
    Write-Host "Internet required. Plug in or fix network, then rerun." -ForegroundColor Red
    Pause; Exit 1
}
Write-Log "Internet OK." 'OK'

# ---- Restore point -----------------------------------------------------------
Write-Log "Creating restore point 'Blurry 3 - pre-debloat'..." 'STAGE'
try {
    Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction SilentlyContinue
    cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore`" /v SystemRestorePointCreationFrequency /t REG_DWORD /d 0 /f >nul 2>&1"
    Checkpoint-Computer -Description "Blurry 3 - pre-debloat" -RestorePointType "MODIFY_SETTINGS" -ErrorAction SilentlyContinue
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
# Blurry 3 :: StepOne (safe boot, runs from Winlogon Userinit hijack)
If (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Start-Process PowerShell.exe -ArgumentList ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $PSCommandPath) -Verb RunAs
    Exit
}
$Host.UI.RawUI.WindowTitle     = "Blurry 3 StepOne (safe boot)"
$Host.UI.RawUI.BackgroundColor = "Black"
Clear-Host
$ProgressPreference = 'SilentlyContinue'

$LogPath = "$env:SystemDrive\Blurry3\logs\blurry3.log"
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
# -NoExit so the window stays open even if StepTwo crashes before its trap fires.
cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce`" /v BlurryStepTwo /t REG_SZ /d `"powershell.exe -NoExit -nop -ep bypass -WindowStyle Maximized -f $env:SystemRoot\Temp\StepTwo.ps1`" /f >nul 2>&1"

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
# Blurry 3 :: StepTwo (normal boot, runs from RunOnce after DDU)
If (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Start-Process PowerShell.exe -ArgumentList ("-NoExit -NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $PSCommandPath) -Verb RunAs
    Exit
}
$Host.UI.RawUI.WindowTitle     = "Blurry 3 StepTwo (post-DDU)"
$Host.UI.RawUI.BackgroundColor = "Black"
Clear-Host
$ProgressPreference   = 'SilentlyContinue'
$ErrorActionPreference= 'Continue'

$LogPath = "$env:SystemDrive\Blurry3\logs\blurry3.log"
function L([string]$m,[string]$lvl='INFO'){
    $line = "[{0}] [POST/{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'),$lvl,$m
    try { Add-Content -Path $LogPath -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}
    $color = switch ($lvl) { 'WARN' {'Yellow'} 'FAIL' {'Red'} 'OK' {'Green'} 'STAGE' {'Cyan'} default {'Gray'} }
    Write-Host $line -ForegroundColor $color
}

# Crash trap -- catches anything that escapes the per-section try/catch wrappers
# below. Without this, any unhandled error closes the window and the user thinks
# the script "crashed silently."
trap {
    Write-Host ""
    Write-Host "  !!  StepTwo unhandled error  !!" -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Line $($_.InvocationInfo.ScriptLineNumber): $($_.InvocationInfo.Line.Trim())" -ForegroundColor DarkGray
    L "UNHANDLED: $($_.Exception.Message) (line $($_.InvocationInfo.ScriptLineNumber))" 'FAIL'
    Write-Host ""
    Write-Host "  Press any key to close..." -ForegroundColor Yellow
    try { [void][System.Console]::ReadKey($true) } catch { Read-Host | Out-Null }
    continue   # let the trap return control to the line after the failure
}

# Per-section runner: every major block calls Step "Name" { ... } so one block's
# error logs WARN and we keep going. Net effect: the script ALWAYS reaches the
# final pause at the bottom, even if individual cmdlets blow up.
function Step([string]$name, [scriptblock]$body) {
    L "==> $name" 'STAGE'
    try { & $body }
    catch {
        L "$name FAILED: $($_.Exception.Message)" 'FAIL'
        Write-Host "  (continuing anyway)" -ForegroundColor DarkYellow
    }
}

L "StepTwo start." 'STAGE'

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
    # Xbox app trio (Blurry 3 addition - kept but neutered below)
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
            $dlg.Title  = "Blurry 3 :: select NVIDIA driver installer (.exe)"
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
Write-Host "  Blurry 3 complete. Log: $LogPath" -ForegroundColor Green
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
# -NoExit so the window stays open even if StepTwo crashes before its trap fires (and so the
# user can see the final "complete, press any key" message without it auto-closing).
cmd /c "reg add `"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce`" /v BlurryStepTwo /t REG_SZ /d `"powershell.exe -NoExit -nop -ep bypass -WindowStyle Maximized -f $env:SystemRoot\Temp\StepTwo.ps1`" /f >nul 2>&1"

# Turn on safe boot so the reboot below lands in safe mode.
cmd /c "bcdedit /set {current} safeboot minimal >nul 2>&1"
Write-Log "safeboot=minimal armed for next reboot." 'OK'

Write-Host ""
Write-Host "  Stage 1 complete. Restarting into safe mode..." -ForegroundColor Yellow
Write-Host "  StepOne will run automatically (Defender off + DDU + reboot to normal)." -ForegroundColor Yellow
Write-Host "  Then StepTwo runs in normal mode (the big debloat + app installs)." -ForegroundColor Yellow
Write-Host ""
Start-Sleep -Seconds 5

Write-Log "Blurry 3 main stage exit -> shutdown -r -t 00 (handing off to safe-boot StepOne)." 'OK'
shutdown -r -t 00
