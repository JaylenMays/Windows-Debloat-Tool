# 03-Tweak.ps1 - the big deduped tweak engine.
# Pulls from: TweakingGuy AIO, blurry.bat, 540hz.bat (vetoes win), WinSux steptwo,
# Calypto (USB MSI + selective suspend), BoringBoom, fr33thy guides.
# Each Set-Reg/operation is idempotent so the Clean mode can re-run it weekly.

# ============================================================
# REGISTRY TWEAKS
# ============================================================
function Apply-RegistryTweaks {

    # --- Telemetry / privacy ---
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' 'AllowTelemetry' 0
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\DataCollection' 'AllowTelemetry' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AdvertisingInfo' 'DisabledByGroupPolicy' 1
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo' 'Enabled' 0
    Set-Reg 'HKCU:\SOFTWARE\Microsoft\Siuf\Rules' 'NumberOfSIUFInPeriod' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' 'DoNotShowFeedbackNotifications' 1
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'EnableActivityFeed' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'PublishUserActivities' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'UploadUserActivities' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent' 'DisableWindowsConsumerFeatures' 1
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent' 'DisableSoftLanding' 1

    # Suggested content / ads
    foreach ($id in 'SubscribedContent-338388Enabled','SubscribedContent-338389Enabled',
                    'SubscribedContent-338393Enabled','SubscribedContent-353694Enabled',
                    'SubscribedContent-353696Enabled','SubscribedContent-310093Enabled',
                    'SubscribedContent-338387Enabled','RotatingLockScreenEnabled',
                    'RotatingLockScreenOverlayEnabled','SystemPaneSuggestionsEnabled',
                    'SilentInstalledAppsEnabled','PreInstalledAppsEnabled','OemPreInstalledAppsEnabled') {
        Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' $id 0
    }

    # --- Explorer / UI defaults ---
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'HideFileExt' 0
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'LaunchTo' 1
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarAnimations' 0
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'IconsOnly' 0
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ListviewShadow' 0
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'MultiTaskingAltTabFilter' 3
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced\TaskbarDeveloperSettings' 'TaskbarEndTask' 1
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer' 'ShowRecent' 0
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer' 'ShowFrequent' 0
    # Restore Win10 classic context menu
    $ctxKey = 'HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32'
    if (-not (Test-Path $ctxKey)) { New-Item -Path $ctxKey -Force | Out-Null }
    Set-ItemProperty -Path $ctxKey -Name '(Default)' -Value '' -Force -ErrorAction SilentlyContinue

    # --- Visual effects (perf) ---
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' 'VisualFXSetting' 3
    Set-Reg 'HKCU:\Control Panel\Desktop\WindowMetrics' 'MinAnimate' '0' String
    Set-Reg 'HKCU:\Software\Microsoft\Windows\DWM' 'EnableAeroPeek' 0
    Set-Reg 'HKCU:\Software\Microsoft\Windows\DWM' 'AlwaysHibernateThumbnails' 0
    Set-Reg 'HKCU:\Control Panel\Mouse' 'MouseTrails' '0' String

    # --- Game DVR / Game Bar / FSO (TweakingGuy) ---
    Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_Enabled' 0
    Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_FSEBehavior' 2
    Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_FSEBehaviorMode' 2
    Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_HonorUserFSEBehaviorMode' 1
    Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_DSEBehavior' 2
    Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_EFSEFeatureFlags' 0
    Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_DXGIHonorFSEWindowsCompatible' 1
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' 'AppCaptureEnabled' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\GameDVR' 'AllowGameDVR' 0
    Set-Reg 'HKCU:\Software\Microsoft\GameBar' 'UseNexusForGameBarEnabled' 0
    Set-Reg 'HKCU:\Software\Microsoft\GameBar' 'AllowAutoGameMode' 0
    Set-Reg 'HKCU:\Software\Microsoft\GameBar' 'AutoGameModeEnabled' 0
    Set-Reg 'HKCU:\Software\Microsoft\GameBar' 'ShowStartupPanel' 0

    # --- MMCSS / scheduler ---
    $mmcss = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'
    Set-Reg $mmcss 'SystemResponsiveness' 0
    Set-Reg $mmcss 'NetworkThrottlingIndex' 0xFFFFFFFF
    $games = "$mmcss\Tasks\Games"
    Set-Reg $games 'Affinity' 0
    Set-Reg $games 'Background Only' 'False' String
    Set-Reg $games 'Clock Rate' 10000
    Set-Reg $games 'GPU Priority' 8
    Set-Reg $games 'Priority' 6
    Set-Reg $games 'Scheduling Category' 'High' String
    Set-Reg $games 'SFIO Priority' 'High' String

    # Win32PrioritySeparation = 0x26 (TweakingGuy)
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl' 'Win32PrioritySeparation' 0x26

    # csrss.exe perf bias
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\csrss.exe\PerfOptions' 'CpuPriorityClass' 4
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\csrss.exe\PerfOptions' 'IoPriority' 4

    # --- HAGS, GPU scheduling ---
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'HwSchMode' 2

    # --- Latency tolerance (TweakingGuy) ---
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\DXGKrnl' 'MonitorLatencyTolerance' 1
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\DXGKrnl' 'MonitorRefreshLatencyTolerance' 1
    foreach ($v in 'ExitLatency','ExitLatencyCheckEnabled','Latency','LatencyToleranceDefault',
                   'LatencyToleranceFSVP','LatencyTolerancePerfOverride','LatencyToleranceScreenOffIR',
                   'LatencyToleranceVSyncEnabled','RtlCapabilityCheckLatency') {
        Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' $v 1
    }
    $gpwr = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Power'
    foreach ($v in 'DefaultD3TransitionLatencyActivelyUsed','DefaultD3TransitionLatencyIdleLongTime',
                   'DefaultD3TransitionLatencyIdleMonitorOff','DefaultD3TransitionLatencyIdleNoContext',
                   'DefaultD3TransitionLatencyIdleShortTime','DefaultD3TransitionLatencyIdleVeryLongTime',
                   'DefaultLatencyToleranceIdle0','DefaultLatencyToleranceIdle0MonitorOff',
                   'DefaultLatencyToleranceIdle1','DefaultLatencyToleranceIdle1MonitorOff',
                   'DefaultLatencyToleranceMemory','DefaultLatencyToleranceNoContext',
                   'DefaultLatencyToleranceNoContextMonitorOff','DefaultLatencyToleranceOther',
                   'DefaultLatencyToleranceTimerPeriod','DefaultMemoryRefreshLatencyToleranceActivelyUsed',
                   'DefaultMemoryRefreshLatencyToleranceMonitorOff','DefaultMemoryRefreshLatencyToleranceNoContext',
                   'Latency','MaxIAverageGraphicsLatencyInOneBucket','MiracastPerfTrackGraphicsLatency',
                   'MonitorLatencyTolerance','MonitorRefreshLatencyTolerance','TransitionLatency') {
        Set-Reg $gpwr $v 1
    }

    # --- File system ---
    if (-not $Script:DryRun) {
        fsutil behavior set disable8dot3 1 2>&1 | Out-Null
        fsutil behavior set disablelastaccess 1 2>&1 | Out-Null
    }

    # --- Hibernation OFF (your default) ---
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' 'HiberbootEnabled' 0
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' 'HibernateEnabled' 0
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' 'HibernateEnabledDefault' 0
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\FlyoutMenuSettings' 'ShowLockOption' 0
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\FlyoutMenuSettings' 'ShowSleepOption' 0
    if (-not $Script:DryRun) { powercfg /hibernate off 2>&1 | Out-Null }

    # --- NVIDIA tweaks (vendor-gated below) ---
    Apply-NvidiaTweaks

    # --- Background apps off ---
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications' 'GlobalUserDisabled' 1

    # --- Maintenance off ---
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\Maintenance' 'MaintenanceDisabled' 1

    # --- Software protection / mouse / kbd queue (Calypto) ---
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\mouclass\Parameters' 'MouseDataQueueSize' 0x14
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters' 'KeyboardDataQueueSize' 0x14

    # --- Timer global request ---
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\kernel' 'GlobalTimerResolutionRequests' 1

    # --- WinSux: block Windows Update from replacing GPU drivers ---
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DriverSearching' 'SearchOrderConfig' 0
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' 'ExcludeWUDriversInQualityUpdate' 1
    Set-Reg 'HKLM:\Software\Policies\Microsoft\Windows\Device Metadata' 'PreventDeviceMetadataFromNetwork' 1

    # --- WinSux: allow password sign-in ---
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device' 'DevicePasswordLessBuildVersion' 0

    # --- WinSux: disable Terminal as default console ---
    Set-Reg 'HKCU:\Console\%%Startup' 'DelegationConsole' '{B23D10C0-E52E-411E-9D5B-C09FDF709C7D}' String
    Set-Reg 'HKCU:\Console\%%Startup' 'DelegationTerminal' '{B23D10C0-E52E-411E-9D5B-C09FDF709C7D}' String

    # --- Misc TweakingGuy ---
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SoftwareProtectionPlatform' 'InactivityShutdownDelay' 0xFFFFFFFF
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Remote Assistance' 'fAllowToGetHelp' 0
    Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\VideoSettings' 'VideoQualityOnBattery' 1

    # --- Brave as default browser hint (handled fully in Apps phase via SetUserFTA-like reg) ---
    Set-Reg 'HKCU:\Software\Classes\.html\OpenWithProgids' 'BraveHTML' '' String
    Set-Reg 'HKCU:\Software\Classes\.htm\OpenWithProgids'  'BraveHTML' '' String

    Write-Log 'Registry tweaks applied.' 'OK'
}

# Vendor-gated. Detects NVIDIA GPUs and applies the 540hz-safe block (no EnableTiledDisplay).
function Apply-NvidiaTweaks {
    $gpus = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue
    if (-not ($gpus.Name -join ' ' -match 'NVIDIA')) {
        Write-Log 'No NVIDIA GPU detected -- skipping NV tweaks.' 'INFO'
        return
    }
    $classKeys = Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -match '^\d{4}$' } | Select-Object -ExpandProperty PSPath

    foreach ($k in $classKeys) {
        # P-state + RM
        Set-Reg $k 'DisableDynamicPstate' 1
        Set-Reg $k 'RMPowerFeature' 0x55455555
        Set-Reg $k 'RMPowerFeature2' 0x55455555
        # Latency keys (the 540hz-safe set)
        foreach ($v in 'D3PCLatency','F1TransitionLatency','LOWLATENCY','Node3DLowLatency',
                       'RMDeepL1EntryLatencyUsec','RmGspcMaxFtuS','RmGspcMinFtuS','RmGspcPerioduS',
                       'RMLpwrEiIdleThresholdUs','RMLpwrGrIdleThresholdUs','RMLpwrGrRgIdleThresholdUs',
                       'RMLpwrMsIdleThresholdUs','VRDirectFlipDPCDelayUs','VRDirectFlipTimingMarginUs',
                       'VRDirectJITFlipMsHybridFlipDelayUs','vrrCursorMarginUs','vrrDeflickerMarginUs',
                       'vrrDeflickerMaxUs') {
            Set-Reg $k $v 1
        }
        Set-Reg $k 'PciLatencyTimerControl' 20
        # Per-CPU-core DPC
        Set-Reg $k 'RmGpsPsEnablePerCpuCoreDpc' 1
        # NB: EnableTiledDisplay, RMHdcpKeyGlobZero, NVDeviceSupportKFilter,
        #     Acceleration.Level, TCCSupported are deliberately NOT touched
        #     (your 540hz.bat veto - they break high-Hz monitors).
    }
    foreach ($p in 'HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm',
                   'HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm\NVAPI',
                   'HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm\Global\NVTweak',
                   'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers',
                   'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Power') {
        Set-Reg $p 'RmGpsPsEnablePerCpuCoreDpc' 1
    }
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm\Global\NVTweak' 'DisplayPowerSaving' 0
    # NVIDIA telemetry off
    Set-Reg 'HKLM:\SOFTWARE\NVIDIA Corporation\NvControlPanel2\Client' 'OptInOrOutPreference' 0
    foreach ($r in 'EnableRID66610','EnableRID64640','EnableRID44231') {
        Set-Reg 'HKLM:\SOFTWARE\NVIDIA Corporation\Global\FTS' $r 0
    }
    Set-Reg 'HKCU:\Software\NVIDIA Corporation\NvTray' 'StartOnLogin' 0
    foreach ($t in 'NvTm*','NvDriverUpdateCheckDaily*','NVIDIA GeForce Experience SelfUpdate*') {
        Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue |
            Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null
    }
    Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name NvBackend -ErrorAction SilentlyContinue
    Write-Log 'NVIDIA tweaks applied (540Hz-safe variant).' 'OK'
}

# ============================================================
# BCD
# ============================================================
function Apply-BcdTweaks {
    if ($Script:DryRun) { Write-Log 'DRY: Apply-BcdTweaks'; return }
    $cmds = @(
        '/set disabledynamictick yes',
        '/set useplatformtick yes',
        '/set useplatformclock no',
        '/set tscsyncpolicy Enhanced',
        '/set x2apicpolicy Enable',
        '/set hypervisorlaunchtype off',  # VBS off, FPS gain
        '/set vsmlaunchtype Off',
        '/set isolatedcontext No',
        '/timeout 8'
    )
    foreach ($c in $cmds) {
        try {
            Start-Process bcdedit.exe -ArgumentList $c -Wait -NoNewWindow -ErrorAction SilentlyContinue
            Write-Log "bcdedit $c" 'OK'
        } catch { Write-Log "bcdedit fail: $c -> $($_.Exception.Message)" 'WARN' }
    }
    # VBS / Memory Integrity (off)
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard' 'EnableVirtualizationBasedSecurity' 0
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' 'Enabled' 0
}

# ============================================================
# NETWORK
# ============================================================
function Apply-NetworkTweaks {
    if ($Script:DryRun) { Write-Log 'DRY: Apply-NetworkTweaks'; return }
    $cmds = @(
        'int tcp set global autotuninglevel=disabled',
        'int tcp set global ecncapability=disabled',
        'int tcp set global rss=enabled',
        'int tcp set global rsc=disabled',
        'int tcp set global timestamps=disabled',
        'int tcp set heuristics disabled',
        'int tcp set supplemental Internet congestionprovider=ctcp',
        'int ip set global taskoffload=disabled',
        'int ipv6 set state disabled',
        'int isatap set state disabled',
        'int teredo set state disabled'
    )
    foreach ($c in $cmds) {
        try { Start-Process netsh.exe -ArgumentList $c -Wait -NoNewWindow } catch {}
    }

    # TCP/IP parameters
    $tcp = 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters'
    Set-Reg $tcp 'DefaultTTL' 64
    Set-Reg $tcp 'Tcp1323Opts' 1
    Set-Reg $tcp 'TcpMaxDupAcks' 2
    Set-Reg $tcp 'SackOpts' 0
    Set-Reg $tcp 'MaxUserPort' 65534
    Set-Reg $tcp 'TcpTimedWaitDelay' 30

    # Nagle off on every interface
    Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces' -ErrorAction SilentlyContinue | ForEach-Object {
        Set-Reg $_.PSPath 'TcpAckFrequency' 1
        Set-Reg $_.PSPath 'TCPNoDelay' 1
        Set-Reg $_.PSPath 'TcpDelAckTicks' 0
    }

    # Delivery Optimization off
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DeliveryOptimization\Config' 'DODownloadMode' 0
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DeliveryOptimization\Config' 'DownloadMode' 0

    # NetBIOS off
    Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=true' -ErrorAction SilentlyContinue |
        ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName SetTcpipNetbios -Arguments @{ TcpipNetbiosOptions = [uint32]2 } -ErrorAction SilentlyContinue | Out-Null }

    # NIC class-key tweaks (power saving, EEE, WoL, flow control off; buffers up; MSI; RSS)
    Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4D36E972-E325-11CE-BFC1-08002bE10318}' -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
            $k = $_.PSPath
            foreach ($v in 'AutoPowerSaveModeEnabled','AutoDisableGigabit','AdvancedEEE','*EEE','EEE','EnablePME',
                           'EEELinkAdvertisement','EnableGreenEthernet','EnableSavePowerNow','EnablePowerManagement',
                           'EnableDynamicPowerGating','EnableConnectedPowerGating','EnableWakeOnLan','GigaLite',
                           'PowerDownPll','PowerSavingMode','ReduceSpeedOnPowerDown','SmartPowerDownEnable',
                           'S5WakeOnLan','ULPMode','WakeOnDisconnect','*WakeOnMagicPacket','*WakeOnPattern','WakeOnLink') {
                Set-Reg $k $v '0' String
            }
            Set-Reg $k '*FlowControl' '0' String
            Set-Reg $k '*InterruptModeration' '0' String
            Set-Reg $k 'TransmitBuffers' '4096' String
            Set-Reg $k 'ReceiveBuffers' '512' String
            Set-Reg $k 'JumboPacket' '1514' String
            Set-Reg $k 'RSS' '1' String
            Set-Reg $k '*NumRssQueues' '4' String
            Set-Reg $k 'PnPCapabilities' 24  # WinSux: D3 disabled + WoL disabled
        }

    # NIC MSI mode
    Get-PnpDevice -Class Net -Status OK -ErrorAction SilentlyContinue | ForEach-Object {
        $k = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($_.InstanceId)\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
        Set-Reg $k 'MSISupported' 1
    }

    # QoS DSCP policies (Valorant + CS2 + Fortnite)
    foreach ($spec in @(
        @{Name='VALORANT'; Exe='VALORANT-Win64-Shipping.exe'},
        @{Name='CS2';      Exe='cs2.exe'},
        @{Name='FORTNITE'; Exe='FortniteClient-Win64-Shipping.exe'}
    )) {
        $k = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\QoS\$($spec.Name)"
        Set-Reg $k 'Version' '1.0' String
        Set-Reg $k 'Application Name' $spec.Exe String
        Set-Reg $k 'DSCP Value' '46' String
        Set-Reg $k 'Throttle Rate' '-1' String
        foreach ($n in 'Protocol','Local Port','Local IP','Local IP Prefix Length',
                       'Remote Port','Remote IP','Remote IP Prefix Length') {
            Set-Reg $k $n '*' String
        }
    }
    Write-Log 'Network tweaks applied.' 'OK'
}

# ============================================================
# USB (Calypto: MSI + selective suspend off + per-hub power off)
# ============================================================
function Apply-UsbTweaks {
    # USB controller MSI mode
    Get-PnpDevice -Class USB -Status OK -ErrorAction SilentlyContinue | ForEach-Object {
        $id = $_.InstanceId
        $k = "HKLM:\SYSTEM\CurrentControlSet\Enum\$id\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
        Set-Reg $k 'MSISupported' 1
    }
    # Selective suspend off everywhere we can hit
    foreach ($base in 'HKLM:\SYSTEM\CurrentControlSet\Enum\USB','HKLM:\SYSTEM\CurrentControlSet\Enum\HID') {
        Get-ChildItem $base -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
            $pmKey = Join-Path $_.PSPath 'Device Parameters'
            if (Test-Path $pmKey) {
                Set-Reg $pmKey 'EnhancedPowerManagementEnabled' 0
                Set-Reg $pmKey 'SelectiveSuspendEnabled' 0
                Set-Reg $pmKey 'SelectiveSuspendOn' 0
                Set-Reg $pmKey 'WaitWakeEnabled' 0
            }
        }
    }
    # USBXHCI MSI
    Get-PnpDevice -Status OK -ErrorAction SilentlyContinue | Where-Object Service -eq 'USBXHCI' | ForEach-Object {
        $k = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($_.InstanceId)\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
        Set-Reg $k 'MSISupported' 1
    }
    Write-Log 'USB tweaks applied (MSI + suspend off).' 'OK'
}

# ============================================================
# SERVICES (safe set only - aggressive set lives in Advanced menu)
# ============================================================
$Script:SafeServiceKills = @(
    'DiagTrack','dmwappushservice','WaaSMedicSvc','diagnosticshub.standardcollector.service',
    'DPS','WdiServiceHost','WdiSystemHost','PcaSvc','WSearch','Fax','MapsBroker','RetailDemo',
    'RemoteRegistry','RemoteAccess','WpnService','WbioSrvc','XboxGipSvc','XblAuthManager','XblGameSave',
    'XboxNetApiSvc','TabletInputService','NahimicService','NetTcpPortSharing','lmhosts'
)

function Apply-ServiceTweaks {
    foreach ($svc in $Script:SafeServiceKills) { Disable-Svc $svc }
    Write-Log "Disabled $($Script:SafeServiceKills.Count) services." 'OK'
}

# ============================================================
# POWER (Smooth Gaming plan -- clones Ultimate Performance)
# ============================================================
function Apply-PowerTweaks {
    if ($Script:DryRun) { Write-Log 'DRY: Apply-PowerTweaks'; return }

    # Make sure Ultimate Performance exists
    powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>$null | Out-Null

    # Find the most recent UP clone (or original)
    $list = powercfg -l
    $clone = $list | Where-Object { $_ -match 'Ultimate Performance' } | Select-Object -Last 1
    $upGuid = if ($clone -match '([A-Fa-f0-9-]{36})') { $matches[1] } else { $null }
    if (-not $upGuid) { Write-Log 'Cannot find Ultimate Performance plan.' 'WARN'; return }

    powercfg -changename $upGuid 'Smooth Gaming' 'Blurry 2 - max perf, no parking' 2>$null | Out-Null
    # No core parking
    powercfg -setacvalueindex $upGuid SUB_PROCESSOR CPMINCORES 100 2>$null | Out-Null
    powercfg -setacvalueindex $upGuid SUB_PROCESSOR CPMAXCORES 100 2>$null | Out-Null
    powercfg -setacvalueindex $upGuid SUB_PROCESSOR PERFBOOSTMODE 0   2>$null | Out-Null
    powercfg -setacvalueindex $upGuid SUB_PROCESSOR THROTTLING 0      2>$null | Out-Null
    # No sleep / monitor off / disk spin-down on AC
    powercfg -change -monitor-timeout-ac 0
    powercfg -change -disk-timeout-ac    0
    powercfg -change -standby-timeout-ac 0
    powercfg -change -hibernate-timeout-ac 0
    # Activate
    powercfg -setactive $upGuid
    Write-Log "Smooth Gaming activated: $upGuid" 'OK'
}

# ============================================================
# TIMER RESOLUTION (0.5ms task on logon)
# ============================================================
function Apply-TimerTweaks {
    Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\kernel' 'GlobalTimerResolutionRequests' 1

    if ($Script:DryRun) { Write-Log 'DRY: Apply-TimerTweaks (task)'; return }

    $taskName = 'BlurryTimer0.5ms'
    schtasks /delete /tn $taskName /f 2>$null | Out-Null
    $cmd = 'powershell -windowstyle hidden -command "Add-Type ''[DllImport(\"winmm.dll\")]public static extern uint timeBeginPeriod(uint ms); public static void Main(){timeBeginPeriod(0);}'';[TimerResolution.Program]::Main()"'
    schtasks /create /tn $taskName /tr "$cmd" /sc onlogon /ru SYSTEM /rl HIGHEST /f 2>$null | Out-Null
    Write-Log "Timer 0.5ms task installed: $taskName" 'OK'
}
