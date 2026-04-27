# Power plan + bcdedit + timer resolution
# Note: the top-level Power tab in BlurryTool.ps1 has its own checkboxes
# (PwUltimate, PwSmoothGaming, PwMonitorSleep, TmGlobalReq, TmHpet, TmSchedule)
# which are wired in the Apply handler. The tweaks here populate BcdPanel.

Register-Tweak -Id 'bcd-disable-dyntick' -Label 'bcdedit: disabledynamictick yes' -Panel 'BcdPanel' -Apply {
    Start-Process bcdedit.exe -ArgumentList '/set disabledynamictick yes' -Wait -NoNewWindow
}
Register-Tweak -Id 'bcd-platform-tick' -Label 'bcdedit: useplatformtick yes' -Panel 'BcdPanel' -Apply {
    Start-Process bcdedit.exe -ArgumentList '/set useplatformtick yes' -Wait -NoNewWindow
}
Register-Tweak -Id 'bcd-no-platform-clock' -Label 'bcdedit: useplatformclock no (let TSC win)' -Panel 'BcdPanel' -Apply {
    Start-Process bcdedit.exe -ArgumentList '/set useplatformclock no' -Wait -NoNewWindow
}
Register-Tweak -Id 'bcd-tsc-enhanced' -Label 'bcdedit: tscsyncpolicy Enhanced' -Panel 'BcdPanel' -Apply {
    Start-Process bcdedit.exe -ArgumentList '/set tscsyncpolicy Enhanced' -Wait -NoNewWindow
}
Register-Tweak -Id 'bcd-x2apic' -Label 'bcdedit: x2apicpolicy Enable' -Panel 'BcdPanel' -Apply {
    Start-Process bcdedit.exe -ArgumentList '/set x2apicpolicy Enable' -Wait -NoNewWindow
}
Register-Tweak -Id 'bcd-no-hyperv' -Label 'bcdedit: hypervisorlaunchtype off (disables VBS, helps FPS)' -Panel 'BcdPanel' -Default $false -Apply {
    Start-Process bcdedit.exe -ArgumentList '/set hypervisorlaunchtype off' -Wait -NoNewWindow
}
Register-Tweak -Id 'bcd-no-vsm' -Label 'bcdedit: vsmlaunchtype Off + DeviceGuard off' -Panel 'BcdPanel' -Default $false -Apply {
    Start-Process bcdedit.exe -ArgumentList '/set vsmlaunchtype Off' -Wait -NoNewWindow
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard' 'EnableVirtualizationBasedSecurity' 0
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' 'Enabled' 0
}
Register-Tweak -Id 'bcd-isolated-no' -Label 'bcdedit: isolatedcontext No' -Panel 'BcdPanel' -Apply {
    Start-Process bcdedit.exe -ArgumentList '/set isolatedcontext No' -Wait -NoNewWindow
}
Register-Tweak -Id 'bcd-timeout-8' -Label 'bcdedit: boot timeout = 8 seconds' -Panel 'BcdPanel' -Apply {
    Start-Process bcdedit.exe -ArgumentList '/timeout 8' -Wait -NoNewWindow
}

# Helper functions used by the Apply handler in BlurryTool.ps1
function Invoke-PowerUltimate {
    powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>$null | Out-Null
    $up = powercfg -l | Where-Object { $_ -match 'Ultimate Performance' } | Select-Object -Last 1
    if ($up -match '([A-Fa-f0-9-]{36})') {
        powercfg -setactive $matches[1]
        Write-BlurryLog "Activated Ultimate Performance: $($matches[1])"
    }
}

function Invoke-PowerSmoothGaming {
    powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>$null | Out-Null
    $clones = powercfg -l | Where-Object { $_ -match 'Ultimate Performance' } | Select-Object -Last 1
    if ($clones -match '([A-Fa-f0-9-]{36})') {
        $guid = $matches[1]
        powercfg -changename $guid 'Smooth Gaming' 'Blurry Tool gaming plan'
        powercfg -setacvalueindex $guid SUB_PROCESSOR CPMINCORES 100
        powercfg -setacvalueindex $guid SUB_PROCESSOR CPMAXCORES 100
        powercfg -setacvalueindex $guid SUB_PROCESSOR PERFBOOSTMODE 0
        powercfg -setacvalueindex $guid SUB_PROCESSOR THROTTLING 0
        powercfg -setactive $guid
        Write-BlurryLog "Created and activated Smooth Gaming plan: $guid"
    }
}

function Invoke-PowerNoSleep {
    powercfg -change -monitor-timeout-ac 0
    powercfg -change -disk-timeout-ac 0
    powercfg -change -standby-timeout-ac 0
    powercfg -change -hibernate-timeout-ac 0
}

function Invoke-TimerGlobalReq {
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\kernel' 'GlobalTimerResolutionRequests' 1
}

function Invoke-TimerHpetOff {
    Start-Process bcdedit.exe -ArgumentList '/set useplatformclock no' -Wait -NoNewWindow
}

function Invoke-TimerScheduleTask {
    schtasks /delete /tn 'BlurryTimer0.5ms' /f 2>$null | Out-Null
    $cmd = 'powershell -windowstyle hidden -command "Add-Type ''[DllImport(\"winmm.dll\")]public static extern uint timeBeginPeriod(uint ms); public static void Main(){timeBeginPeriod(0);}'';[TimerResolution.Program]::Main()"'
    schtasks /create /tn 'BlurryTimer0.5ms' /tr $cmd /sc onlogon /ru SYSTEM /rl HIGHEST /f | Out-Null
}
