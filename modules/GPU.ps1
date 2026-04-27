# GPU tweaks - NVIDIA + AMD branches. Vendor gating happens in BlurryTool.ps1

# Helper: enumerate every video controller class subkey (typically \0000)
function Get-GpuClassKeys {
    Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -match '^\d{4}$' } | Select-Object -ExpandProperty PSPath
}

# Common
Register-Tweak -Id 'gpu-msi-mode' -Label 'Force GPU into MSI mode' -Panel 'GpuCommonPanel' -Apply {
    Get-PnpDevice -Class Display -Status OK -ErrorAction SilentlyContinue | ForEach-Object {
        $k = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($_.InstanceId)\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
        Set-RegValue $k 'MSISupported' 1
        $a = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($_.InstanceId)\Device Parameters\Interrupt Management\Affinity Policy"
        Set-RegValue $a 'DevicePriority' 0
    }
}
Register-Tweak -Id 'gpu-tdr-disable' -Label 'Disable WDDM TDR (debug-style: 0)' -Panel 'GpuCommonPanel' -Default $false -Apply {
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'TdrLevel' 0
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'TdrDelay' 0
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'TdrDdiDelay' 0
}
Register-Tweak -Id 'gpu-vid-quality' -Label 'Video quality on battery: high' -Panel 'GpuCommonPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\VideoSettings' 'VideoQualityOnBattery' 1
}

# NVIDIA
Register-Tweak -Id 'nv-pstate' -Label 'NVIDIA: disable dynamic P-states' -Panel 'GpuNvPanel' -Apply {
    Get-GpuClassKeys | ForEach-Object {
        Set-RegValue $_ 'DisableDynamicPstate' 1
        Set-RegValue $_ 'RMPowerFeature' 0x55455555
        Set-RegValue $_ 'RMPowerFeature2' 0x55455555
    }
}
Register-Tweak -Id 'nv-latency' -Label 'NVIDIA: latency tolerance keys = 1' -Panel 'GpuNvPanel' -Apply {
    foreach ($k in Get-GpuClassKeys) {
        foreach ($v in 'D3PCLatency','F1TransitionLatency','LOWLATENCY','Node3DLowLatency','RMDeepL1EntryLatencyUsec','RmGspcMaxFtuS','RmGspcMinFtuS','RmGspcPerioduS','RMLpwrEiIdleThresholdUs','RMLpwrGrIdleThresholdUs','RMLpwrGrRgIdleThresholdUs','RMLpwrMsIdleThresholdUs','VRDirectFlipDPCDelayUs','VRDirectFlipTimingMarginUs','VRDirectJITFlipMsHybridFlipDelayUs','vrrCursorMarginUs','vrrDeflickerMarginUs','vrrDeflickerMaxUs') {
            Set-RegValue $k $v 1
        }
        Set-RegValue $k 'PciLatencyTimerControl' 20
    }
}
Register-Tweak -Id 'nv-no-hdcp' -Label 'NVIDIA: disable HDCP' -Panel 'GpuNvPanel' -Default $false -Apply {
    Get-GpuClassKeys | ForEach-Object { Set-RegValue $_ 'RMHdcpKeyGlobZero' 1 }
}
Register-Tweak -Id 'nv-prefer-system-mem' -Label 'NVIDIA: prefer contiguous system memory' -Panel 'GpuNvPanel' -Apply {
    Get-GpuClassKeys | ForEach-Object { Set-RegValue $_ 'PreferSystemMemoryContiguous' 1 }
}
Register-Tweak -Id 'nv-percpu-dpc' -Label 'NVIDIA: enable per-CPU-core DPC' -Panel 'GpuNvPanel' -Apply {
    foreach ($k in 'HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm','HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm\NVAPI','HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm\Global\NVTweak','HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers','HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\Power') {
        Set-RegValue $k 'RmGpsPsEnablePerCpuCoreDpc' 1
    }
}
Register-Tweak -Id 'nv-display-power' -Label 'NVIDIA: disable display power saving' -Panel 'GpuNvPanel' -Apply {
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm\Global\NVTweak' 'DisplayPowerSaving' 0
}
Register-Tweak -Id 'nv-no-write-combine' -Label 'NVIDIA: disable write combining' -Panel 'GpuNvPanel' -Default $false -Apply {
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm' 'DisableWriteCombining' 1
}
Register-Tweak -Id 'nv-telemetry-off' -Label 'NVIDIA: disable telemetry tasks + RID flags' -Panel 'GpuNvPanel' -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\NVIDIA Corporation\NvControlPanel2\Client' 'OptInOrOutPreference' 0
    foreach ($r in 'EnableRID66610','EnableRID64640','EnableRID44231') {
        Set-RegValue 'HKLM:\SOFTWARE\NVIDIA Corporation\Global\FTS' $r 0
    }
    Set-RegValue 'HKCU:\Software\NVIDIA Corporation\NvTray' 'StartOnLogin' 0
    foreach ($t in 'NvTmRep_CrashReport1_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NvTmRep_CrashReport2_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NvTmRep_CrashReport3_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NvTmRep_CrashReport4_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NvDriverUpdateCheckDaily_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NVIDIA GeForce Experience SelfUpdate_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}','NvTmMon_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}') {
        schtasks /change /disable /tn $t 2>$null | Out-Null
    }
    Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name NvBackend -ErrorAction SilentlyContinue
}

# AMD
Register-Tweak -Id 'amd-ulps-off' -Label 'AMD: disable Ultra Low Power States (ULPS)' -Panel 'GpuAmdPanel' -Apply {
    Get-GpuClassKeys | ForEach-Object {
        Set-RegValue $_ 'EnableUlps' 0
        Set-RegValue $_ 'EnableUlps_NA' '0' String
    }
}
Register-Tweak -Id 'amd-power-gating-off' -Label 'AMD: disable power/clock gating' -Panel 'GpuAmdPanel' -Apply {
    foreach ($k in Get-GpuClassKeys) {
        Set-RegValue $k 'DisableSAMUPowerGating' 1
        Set-RegValue $k 'DisableUVDPowerGatingDynamic' 1
        Set-RegValue $k 'DisableVCEPowerGating' 1
        Set-RegValue $k 'DisableDrmdmaPowerGating' 1
        Set-RegValue $k 'EnableVceSwClockGating' 0
        Set-RegValue $k 'EnableUvdClockGating' 0
        Set-RegValue $k 'PP_GPUPowerDownEnabled' 0
        Set-RegValue $k 'GCOOPTION_DisableGPIOPowerSaveMode' 1
    }
}
Register-Tweak -Id 'amd-aspm-off' -Label 'AMD: disable ASPM' -Panel 'GpuAmdPanel' -Apply {
    Get-GpuClassKeys | ForEach-Object {
        Set-RegValue $_ 'EnableAspmL0s' 0
        Set-RegValue $_ 'EnableAspmL1' 0
    }
}
Register-Tweak -Id 'amd-stutter-off' -Label 'AMD: disable Stutter Mode + DeepSleep + Thermal Throttling' -Panel 'GpuAmdPanel' -Apply {
    Get-GpuClassKeys | ForEach-Object {
        Set-RegValue $_ 'StutterMode' 0
        Set-RegValue $_ 'PP_SclkDeepSleepDisable' 1
        Set-RegValue $_ 'PP_ThermalAutoThrottlingEnable' 0
    }
}
Register-Tweak -Id 'amd-overlay-off' -Label 'AMD: disable Radeon Overlay / RS' -Panel 'GpuAmdPanel' -Apply {
    Get-GpuClassKeys | ForEach-Object {
        Set-RegValue $_ 'AllowRSOverlay' 'false' String
        Set-RegValue $_ 'AllowSubscription' 0
        Set-RegValue $_ 'AllowSnapshot' 0
        Set-RegValue $_ 'AllowSkins' 'false' String
    }
    Set-RegValue 'HKCU:\Software\AMD\DVR' 'ShowRSOverlay' 'false' String
    Set-RegValue 'HKCU:\Software\AMD\CN' 'AnimationEffect' 'false' String
    Set-RegValue 'HKCU:\Software\AMD\CN' 'CN_Hide_Toast_Notification' 'true' String
    Set-RegValue 'HKCU:\Software\AMD\CN' 'AllowWebContent' 'false' String
    Set-RegValue 'HKCU:\Software\AMD\CN' 'SystemTray' 'false' String
}
Register-Tweak -Id 'amd-svc-off' -Label 'AMD: disable amdlog + External Events Utility services' -Panel 'GpuAmdPanel' -Apply {
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\amdlog' 'Start' 4
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\AMD External Events Utility' 'Start' 4
}
