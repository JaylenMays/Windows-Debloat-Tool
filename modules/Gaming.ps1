# Gaming latency / 1% lows tweaks
# Sources: Calypto latency guide, BoringBoom, TweakingGuy, NVIDIA Reflex internals

# Game DVR / Game Bar / FSO
Register-Tweak -Id 'gdvr-disable' -Label 'Disable Game DVR / Xbox Game Bar' -Panel 'GameDvrPanel' -Apply {
    Set-RegValue 'HKCU:\System\GameConfigStore' 'GameDVR_Enabled' 0
    Set-RegValue 'HKCU:\System\GameConfigStore' 'GameDVR_FSEBehavior' 2
    Set-RegValue 'HKCU:\System\GameConfigStore' 'GameDVR_FSEBehaviorMode' 2
    Set-RegValue 'HKCU:\System\GameConfigStore' 'GameDVR_HonorUserFSEBehaviorMode' 1
    Set-RegValue 'HKCU:\System\GameConfigStore' 'GameDVR_DSEBehavior' 2
    Set-RegValue 'HKCU:\System\GameConfigStore' 'GameDVR_EFSEFeatureFlags' 0
    Set-RegValue 'HKCU:\System\GameConfigStore' 'GameDVR_DXGIHonorFSEWindowsCompatible' 1
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' 'AppCaptureEnabled' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\GameDVR' 'AllowGameDVR' 0
    Set-RegValue 'HKCU:\Software\Microsoft\GameBar' 'UseNexusForGameBarEnabled' 0
    Set-RegValue 'HKCU:\Software\Microsoft\GameBar' 'AllowAutoGameMode' 0
    Set-RegValue 'HKCU:\Software\Microsoft\GameBar' 'AutoGameModeEnabled' 0
    Set-RegValue 'HKCU:\Software\Microsoft\GameBar' 'ShowStartupPanel' 0
}
Register-Tweak -Id 'gdvr-game-mode-on' -Label 'Force Game Mode on (recommended on Win11)' -Panel 'GameDvrPanel' -Default $false -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\GameBar' 'AutoGameModeEnabled' 1
    Set-RegValue 'HKCU:\Software\Microsoft\GameBar' 'AllowAutoGameMode' 1
}
Register-Tweak -Id 'gdvr-fullscreen-opt' -Label 'Disable fullscreen optimizations globally' -Panel 'GameDvrPanel' -Apply {
    foreach ($k in 'GameDVR_FSEBehavior','GameDVR_FSEBehaviorMode') {
        Set-RegValue 'HKCU:\System\GameConfigStore' $k 2
    }
    Set-RegValue 'HKCU:\System\GameConfigStore' 'GameDVR_DXGIHonorFSEWindowsCompatible' 1
}

# Scheduler / MMCSS
Register-Tweak -Id 'mmcss-games' -Label 'MMCSS Games task: GPU Priority 8, Priority 6' -Panel 'SchedulerPanel' -Apply {
    $k = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games'
    Set-RegValue $k 'Affinity' 0
    Set-RegValue $k 'Background Only' 'False' String
    Set-RegValue $k 'Clock Rate' 10000
    Set-RegValue $k 'GPU Priority' 8
    Set-RegValue $k 'Priority' 6
    Set-RegValue $k 'Scheduling Category' 'High' String
    Set-RegValue $k 'SFIO Priority' 'High' String
}
Register-Tweak -Id 'mmcss-system-resp' -Label 'SystemResponsiveness = 0 (full multimedia bias)' -Panel 'SchedulerPanel' -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile' 'SystemResponsiveness' 0
}
Register-Tweak -Id 'mmcss-net-throttle' -Label 'Disable network throttling for multimedia' -Panel 'SchedulerPanel' -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile' 'NetworkThrottlingIndex' 0xFFFFFFFF
}
Register-Tweak -Id 'mmcss-csrss-prio' -Label 'csrss.exe: high CPU/IO priority class' -Panel 'SchedulerPanel' -Default $false -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\csrss.exe\PerfOptions' 'CpuPriorityClass' 4
    Set-RegValue 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\csrss.exe\PerfOptions' 'IoPriority' 4
}
Register-Tweak -Id 'mmcss-hwsched' -Label 'Hardware-accelerated GPU scheduling on' -Panel 'SchedulerPanel' -Apply {
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'HwSchMode' 2
}
Register-Tweak -Id 'mmcss-no-bg-apps' -Label 'Disable background apps' -Panel 'SchedulerPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications' 'GlobalUserDisabled' 1
}
Register-Tweak -Id 'mmcss-no-maint' -Label 'Disable automatic maintenance' -Panel 'SchedulerPanel' -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\Maintenance' 'MaintenanceDisabled' 1
}
Register-Tweak -Id 'mmcss-alttab' -Label 'Alt-Tab: only show open windows (filter=3)' -Panel 'SchedulerPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'MultiTaskingAltTabFilter' 3
}

# Latency tolerance / DXGK
Register-Tweak -Id 'lat-dxgk' -Label 'DXGK monitor latency tolerance = 1' -Panel 'LatencyPanel' -Apply {
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\DXGKrnl' 'MonitorLatencyTolerance' 1
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\DXGKrnl' 'MonitorRefreshLatencyTolerance' 1
}
Register-Tweak -Id 'lat-power' -Label 'Power latency tolerance values = 1' -Panel 'LatencyPanel' -Apply {
    foreach ($v in 'ExitLatency','ExitLatencyCheckEnabled','Latency','LatencyToleranceDefault','LatencyToleranceFSVP','LatencyTolerancePerfOverride','LatencyToleranceScreenOffIR','LatencyToleranceVSyncEnabled','RtlCapabilityCheckLatency') {
        Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' $v 1
    }
}
Register-Tweak -Id 'lat-graphics' -Label 'Graphics drivers latency keys = 1' -Panel 'LatencyPanel' -Apply {
    $base = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Power'
    foreach ($v in 'DefaultD3TransitionLatencyActivelyUsed','DefaultD3TransitionLatencyIdleLongTime','DefaultD3TransitionLatencyIdleMonitorOff','DefaultD3TransitionLatencyIdleNoContext','DefaultD3TransitionLatencyIdleShortTime','DefaultD3TransitionLatencyIdleVeryLongTime','DefaultLatencyToleranceIdle0','DefaultLatencyToleranceIdle0MonitorOff','DefaultLatencyToleranceIdle1','DefaultLatencyToleranceIdle1MonitorOff','DefaultLatencyToleranceMemory','DefaultLatencyToleranceNoContext','DefaultLatencyToleranceNoContextMonitorOff','DefaultLatencyToleranceOther','DefaultLatencyToleranceTimerPeriod','DefaultMemoryRefreshLatencyToleranceActivelyUsed','DefaultMemoryRefreshLatencyToleranceMonitorOff','DefaultMemoryRefreshLatencyToleranceNoContext','Latency','MaxIAverageGraphicsLatencyInOneBucket','MiracastPerfTrackGraphicsLatency','MonitorLatencyTolerance','MonitorRefreshLatencyTolerance','TransitionLatency') {
        Set-RegValue $base $v 1
    }
}
Register-Tweak -Id 'lat-tdr-relax' -Label 'Relax GPU TDR (gives stutter recovery, helps benches)' -Panel 'LatencyPanel' -Default $false -Apply {
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'TdrDelay' 10
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'TdrDdiDelay' 10
}
