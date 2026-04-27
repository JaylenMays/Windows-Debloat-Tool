# 02-Strip.ps1 - AppX bloat removal (WinSux allowlist + your Xbox keep)
# + Edge / OneDrive / Cortana / Copilot / Recall / Widgets

# WinSux's AppX keep list + your Xbox additions. Everything else gets removed.
$Script:AppxAllowlist = @(
    # WinSux keeps
    'CBS','AV1VideoExtension','AVCEncoderVideoExtension','HEIFImageExtension',
    'HEVCVideoExtension','MPEG2VideoExtension','Paint','RawImageExtension',
    'SecHealthUI','VP9VideoExtensions','WebMediaExtensions','WebpImageExtension',
    'Windows.Photos','ShellExperienceHost','StartMenuExperienceHost',
    'WindowsNotepad','WindowsStore','NVIDIACorp.NVIDIAControlPanel',
    'windows.immersivecontrolpanel',
    # your additions
    'Microsoft.GamingApp',           # Xbox app
    'Microsoft.XboxIdentityProvider',# auth
    'Microsoft.XboxGameOverlay',     # some games hook this
    # quality of life
    'Microsoft.WindowsCalculator',
    'Microsoft.ScreenSketch',        # Snipping Tool
    'Microsoft.WindowsTerminal',
    'Microsoft.WebMediaExtensions','Microsoft.UI.Xaml.2.','Microsoft.NET.Native.',
    'Microsoft.VCLibs.','Microsoft.WindowsAppRuntime.','Microsoft.DesktopAppInstaller'
)

# WinSux capability allowlist
$Script:CapabilityAllowlist = @(
    'Browser.InternetExplorer','Hello.Face','Language.','OpenSSH.Client',
    'Print.','OneCoreUAP','Notepad','Wifi','Ethernet','MSPaint','NetFX3',
    'VBSCRIPT','WMIC','Windows.Client.ShellComponents'
)

# WinSux feature allowlist
$Script:FeatureAllowlist = @(
    'DirectPlay','LegacyComponents','NetFx3','NetFx4','NetFx4ServerFeatures',
    'SearchEngine-Client-Package','Server-Shell','Windows-Defender',
    'Server-Drivers-General','ServerCore-Drivers-General','Server-Gui-Mgmt',
    'WirelessNetworking','SmbDirect','Printing-Foundation-Features'
)

# Extras to always nuke (WinSux nukes these explicitly)
$Script:AppxAlwaysKill = @('*MSTeams*','*Microsoft.OutlookForWindows*')

function _MatchAllow {
    param([string]$Name,[string[]]$Allow)
    foreach ($a in $Allow) { if ($Name -like "*$a*") { return $true } }
    return $false
}

function Remove-BloatAppx {
    param([switch]$Quick)
    if ($Script:DryRun) { Write-Log 'DRY: Remove-BloatAppx'; return }

    # Provisioned (so new users don't get them either)
    Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue |
        Where-Object { -not (_MatchAllow $_.DisplayName $Script:AppxAllowlist) } |
        ForEach-Object {
            try {
                Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction Stop | Out-Null
                Write-Log "AppxProv removed: $($_.DisplayName)" 'OK'
            } catch { Write-Log "AppxProv fail: $($_.DisplayName) -> $($_.Exception.Message)" 'WARN' }
        }

    # Installed (current session)
    Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue |
        Where-Object { -not (_MatchAllow $_.Name $Script:AppxAllowlist) } |
        ForEach-Object {
            try {
                Remove-AppxPackage -AllUsers -Package $_.PackageFullName -ErrorAction Stop
                Write-Log "Appx removed: $($_.Name)" 'OK'
            } catch { Write-Log "Appx fail: $($_.Name) -> $($_.Exception.Message)" 'WARN' }
        }

    # Always-kill
    foreach ($pat in $Script:AppxAlwaysKill) {
        Get-AppxPackage -AllUsers -Name $pat -ErrorAction SilentlyContinue | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue
        Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue |
            Where-Object DisplayName -like $pat |
            ForEach-Object { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue | Out-Null }
    }

    if ($Quick) { return }

    # Capabilities
    Get-WindowsCapability -Online -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq 'Installed' -and -not (_MatchAllow $_.Name $Script:CapabilityAllowlist) } |
        ForEach-Object {
            try {
                Remove-WindowsCapability -Online -Name $_.Name -ErrorAction Stop | Out-Null
                Write-Log "Capability removed: $($_.Name)" 'OK'
            } catch { Write-Log "Capability fail: $($_.Name) -> $($_.Exception.Message)" 'WARN' }
        }

    # Optional features
    Get-WindowsOptionalFeature -Online -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq 'Enabled' -and -not (_MatchAllow $_.FeatureName $Script:FeatureAllowlist) } |
        ForEach-Object {
            try {
                Disable-WindowsOptionalFeature -Online -FeatureName $_.FeatureName -NoRestart -ErrorAction Stop | Out-Null
                Write-Log "Feature disabled: $($_.FeatureName)" 'OK'
            } catch { Write-Log "Feature fail: $($_.FeatureName) -> $($_.Exception.Message)" 'WARN' }
        }
}

function Remove-Edge {
    if ($Script:DryRun) { Write-Log 'DRY: Remove-Edge'; return }
    # Edge setup.exe lives under \Microsoft\Edge\Application\<ver>\Installer\setup.exe
    $setup = Get-ChildItem 'C:\Program Files (x86)\Microsoft\Edge\Application' -Recurse -Filter setup.exe -ErrorAction SilentlyContinue |
        Where-Object FullName -match 'Installer' | Select-Object -First 1
    if ($setup) {
        try {
            & $setup.FullName --uninstall --system-level --verbose-logging --force-uninstall
            Write-Log 'Edge uninstall invoked.' 'OK'
        } catch { Write-Log "Edge uninstall fail: $($_.Exception.Message)" 'WARN' }
    } else { Write-Log 'Edge setup.exe not found (already removed?).' 'WARN' }
    # Edge update registry sweep
    foreach ($k in 'HKCU:\SOFTWARE\Microsoft\EdgeUpdate','HKLM:\SOFTWARE\Microsoft\EdgeUpdate',
                   'HKCU:\SOFTWARE\Policies\Microsoft\EdgeUpdate','HKLM:\SOFTWARE\Policies\Microsoft\EdgeUpdate',
                   'HKCU:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate','HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate') {
        Remove-RegKey $k
    }
}

function Remove-OneDrive {
    if ($Script:DryRun) { Write-Log 'DRY: Remove-OneDrive'; return }
    Stop-Process -Name OneDrive -Force -ErrorAction SilentlyContinue
    foreach ($od in "$env:SystemRoot\SysWOW64\OneDriveSetup.exe","$env:SystemRoot\System32\OneDriveSetup.exe") {
        if (Test-Path $od) { Start-Process $od '/uninstall' -Wait -NoNewWindow }
    }
    Get-ScheduledTask -TaskName '*OneDrive*' -ErrorAction SilentlyContinue |
        Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null
    foreach ($p in "$env:LOCALAPPDATA\Microsoft\OneDrive","$env:PROGRAMDATA\Microsoft OneDrive","$env:SystemDrive\OneDriveTemp") {
        Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Log 'OneDrive uninstalled.' 'OK'
}

function Disable-CopilotEtc {
    # Copilot
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' 1
    Set-Reg 'HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' 1
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ShowCopilotButton' 0
    # Recall (Win11 24H2)
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' 1
    Set-Reg 'HKCU:\Software\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' 1
    try { Disable-WindowsOptionalFeature -Online -FeatureName 'Recall' -NoRestart -ErrorAction SilentlyContinue | Out-Null } catch {}
    # Cortana
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' 'AllowCortana' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' 'CortanaConsent' 0
    # Widgets / News & Interests
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarDa' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Dsh' 'AllowNewsAndInterests' 0
    # ChatGPT-style search highlight on taskbar
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' 'SearchboxTaskbarMode' 1
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Feeds' 'ShellFeedsTaskbarViewMode' 2
    Write-Log 'Copilot / Recall / Cortana / Widgets disabled.' 'OK'
}

# Run/RunOnce sweep -- targeted (NOT wholesale wipe)
$Script:RunSweepPatterns = @(
    'OneDrive','OneDriveSetup','Microsoft Edge','MicrosoftEdgeAutoLaunch_*',
    'EdgeUpdate','GoogleChromeAutoLaunch_*','BraveBrowserAutoLaunch_*','Brave Background',
    'Discord','Spotify','Skype','Adobe*Updater*','iTunesHelper','QuickTimeTask',
    'NvBackend','NVIDIA App','GalaxyClient','Steam','Epic Games Launcher',
    'CCleaner Smart Cleaning','RunHelper'
)

function Sweep-RunKeys {
    if ($Script:DryRun) { Write-Log 'DRY: Sweep-RunKeys'; return }
    $paths = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce'
    )
    foreach ($p in $paths) {
        if (-not (Test-Path $p)) { continue }
        $vals = (Get-Item $p).Property
        foreach ($v in $vals) {
            foreach ($pat in $Script:RunSweepPatterns) {
                if ($v -like $pat) {
                    Remove-ItemProperty -Path $p -Name $v -ErrorAction SilentlyContinue
                    Write-Log "Run-sweep: removed $p :: $v" 'OK'
                    break
                }
            }
        }
    }
}

# Scheduled tasks that re-arm themselves (Windows Update flips them back on)
$Script:KnownReArmedTasks = @(
    'Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser',
    'Microsoft\Windows\Application Experience\ProgramDataUpdater',
    'Microsoft\Windows\Application Experience\StartupAppTask',
    'Microsoft\Windows\Customer Experience Improvement Program\Consolidator',
    'Microsoft\Windows\Customer Experience Improvement Program\UsbCeip',
    'Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticDataCollector',
    'Microsoft\Windows\Feedback\Siuf\DmClient',
    'Microsoft\Windows\Feedback\Siuf\DmClientOnScenarioDownload',
    'Microsoft\Windows\Maps\MapsToastTask','Microsoft\Windows\Maps\MapsUpdateTask',
    'Microsoft\Windows\Windows Error Reporting\QueueReporting',
    'Microsoft\Office\OfficeTelemetryAgentLogOn',
    'Microsoft\Office\OfficeTelemetryAgentFallBack',
    'NvTm*','MicrosoftEdgeUpdateTask*','GoogleUpdateTask*',
    '*OneDrive*','Microsoft\Windows\PushToInstall\*'
)

function Disable-KnownTasks {
    if ($Script:DryRun) { Write-Log 'DRY: Disable-KnownTasks'; return }
    foreach ($t in $Script:KnownReArmedTasks) {
        Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue |
            Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null
    }
    Write-Log 'Known re-armed tasks disabled.' 'OK'
}
