# Debloat module - removes preinstalled bloat appx + telemetry

$bloat = @(
    'Microsoft.3DBuilder','Microsoft.BingFinance','Microsoft.BingFoodAndDrink',
    'Microsoft.BingHealthAndFitness','Microsoft.BingNews','Microsoft.BingSports',
    'Microsoft.BingTravel','Microsoft.BingWeather','Microsoft.GamingApp',
    'Microsoft.GetHelp','Microsoft.Getstarted','Microsoft.Messaging',
    'Microsoft.Microsoft3DViewer','Microsoft.MicrosoftOfficeHub',
    'Microsoft.MicrosoftSolitaireCollection','Microsoft.MicrosoftStickyNotes',
    'Microsoft.MixedReality.Portal','Microsoft.NetworkSpeedTest','Microsoft.News',
    'Microsoft.Office.Lens','Microsoft.Office.OneNote','Microsoft.Office.Sway',
    'Microsoft.OneConnect','Microsoft.People','Microsoft.Print3D',
    'Microsoft.SkypeApp','Microsoft.Todos','Microsoft.WindowsAlarms',
    'Microsoft.WindowsCamera','microsoft.windowscommunicationsapps',
    'Microsoft.WindowsFeedbackHub','Microsoft.WindowsMaps','Microsoft.WindowsSoundRecorder',
    'Microsoft.Xbox.TCUI','Microsoft.XboxApp','Microsoft.XboxGameOverlay',
    'Microsoft.XboxGamingOverlay','Microsoft.XboxIdentityProvider','Microsoft.XboxSpeechToTextOverlay',
    'Microsoft.YourPhone','Microsoft.ZuneMusic','Microsoft.ZuneVideo',
    'MicrosoftCorporationII.MicrosoftFamily','MicrosoftCorporationII.QuickAssist',
    'MicrosoftTeams','Clipchamp.Clipchamp','Microsoft.PowerAutomateDesktop',
    'Microsoft.WindowsCommunicationsApps','Microsoft.OutlookForWindows',
    'Microsoft.549981C3F5F10','Microsoft.MicrosoftEdge.Stable',
    'SpotifyAB.SpotifyMusic','Disney.37853FC22B2CE','king.com.CandyCrushSaga',
    'Facebook.Facebook','BytedancePte.Ltd.TikTok'
)

foreach ($pkg in $bloat) {
    $id = "bloat-$pkg"
    Register-Tweak -Id $id -Label "Remove $pkg" -Panel 'BloatPanel' -Default $true -Apply ([scriptblock]::Create(@"
Get-AppxPackage -AllUsers -Name '$pkg' -ErrorAction SilentlyContinue | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue
Get-AppxProvisionedPackage -Online | Where-Object DisplayName -eq '$pkg' | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Out-Null
"@))
}

# Privacy / telemetry
Register-Tweak -Id 'priv-telemetry' -Label 'Disable telemetry (DiagTrack, dmwappushservice)' -Panel 'PrivacyPanel' -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' 'AllowTelemetry' 0
    Set-RegValue 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\DataCollection' 'AllowTelemetry' 0
    sc.exe config DiagTrack start= disabled | Out-Null
    sc.exe stop DiagTrack | Out-Null
    sc.exe config dmwappushservice start= disabled | Out-Null
}
Register-Tweak -Id 'priv-advertising-id' -Label 'Disable advertising ID' -Panel 'PrivacyPanel' -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AdvertisingInfo' 'DisabledByGroupPolicy' 1
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo' 'Enabled' 0
}
Register-Tweak -Id 'priv-feedback' -Label 'Disable Feedback / experiments' -Panel 'PrivacyPanel' -Apply {
    Set-RegValue 'HKCU:\SOFTWARE\Microsoft\Siuf\Rules' 'NumberOfSIUFInPeriod' 0
    Set-RegValue 'HKCU:\SOFTWARE\Microsoft\Siuf\Rules' 'PeriodInNanoSeconds' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' 'DoNotShowFeedbackNotifications' 1
}
Register-Tweak -Id 'priv-suggested-content' -Label 'Disable suggested content / ads in Start, Explorer, lockscreen' -Panel 'PrivacyPanel' -Apply {
    foreach ($id in 'SubscribedContent-338388Enabled','SubscribedContent-338389Enabled','SubscribedContent-338393Enabled','SubscribedContent-353694Enabled','SubscribedContent-353696Enabled','SubscribedContent-310093Enabled','SubscribedContent-338387Enabled','RotatingLockScreenEnabled','RotatingLockScreenOverlayEnabled','SystemPaneSuggestionsEnabled') {
        Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' $id 0
    }
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' 'SilentInstalledAppsEnabled' 0
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' 'PreInstalledAppsEnabled' 0
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' 'OemPreInstalledAppsEnabled' 0
}
Register-Tweak -Id 'priv-location' -Label 'Disable location tracking' -Panel 'PrivacyPanel' -Default $false -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location' 'Value' 'Deny' -Type String
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\lfsvc\Service\Configuration' 'Status' 0
}
Register-Tweak -Id 'priv-activity-history' -Label 'Disable activity history / clipboard sync' -Panel 'PrivacyPanel' -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'EnableActivityFeed' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'PublishUserActivities' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'UploadUserActivities' 0
}
Register-Tweak -Id 'priv-cloud-content' -Label 'Disable cloud content / Spotlight' -Panel 'PrivacyPanel' -Apply {
    Set-RegValue 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' 'SubscribedContentEnabled' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent' 'DisableWindowsConsumerFeatures' 1
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent' 'DisableSoftLanding' 1
}

# Edge / OneDrive / Cortana / Copilot
Register-Tweak -Id 'edge-startup-boost' -Label 'Edge: disable startup boost / background mode' -Panel 'EdgePanel' -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'StartupBoostEnabled' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'BackgroundModeEnabled' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'HardwareAccelerationModeEnabled' 0
}
Register-Tweak -Id 'edge-uninstall' -Label 'Uninstall Edge (preserves WebView2)' -Panel 'EdgePanel' -Default $false -Aggressive $true -Apply {
    $edge = Get-ChildItem 'C:\Program Files (x86)\Microsoft\Edge\Application' -Filter setup.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($edge) {
        & $edge.FullName --uninstall --system-level --verbose-logging --force-uninstall
    }
}
Register-Tweak -Id 'onedrive-uninstall' -Label 'Uninstall OneDrive (current user)' -Panel 'EdgePanel' -Apply {
    Stop-Process -Name OneDrive -Force -ErrorAction SilentlyContinue
    $od = "$env:SystemRoot\SysWOW64\OneDriveSetup.exe"
    if (-not (Test-Path $od)) { $od = "$env:SystemRoot\System32\OneDriveSetup.exe" }
    if (Test-Path $od) { Start-Process $od '/uninstall' -Wait }
    Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Microsoft\OneDrive" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force "$env:PROGRAMDATA\Microsoft OneDrive" -ErrorAction SilentlyContinue
}
Register-Tweak -Id 'cortana-disable' -Label 'Disable Cortana' -Panel 'EdgePanel' -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' 'AllowCortana' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search' 'CortanaConsent' 0
}
Register-Tweak -Id 'copilot-disable' -Label 'Disable Copilot (Win11)' -Panel 'EdgePanel' -Apply {
    Set-RegValue 'HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' 1
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' 1
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ShowCopilotButton' 0
}
Register-Tweak -Id 'recall-disable' -Label 'Disable Recall (Win11 24H2)' -Panel 'EdgePanel' -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' 1
    Set-RegValue 'HKCU:\Software\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' 1
    try { Disable-WindowsOptionalFeature -Online -FeatureName 'Recall' -NoRestart -ErrorAction SilentlyContinue | Out-Null } catch {}
}
