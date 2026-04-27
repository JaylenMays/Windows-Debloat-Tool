# 09-Schedule.ps1 - install scheduled tasks for the Clean mode
# Two tasks: every login + weekly Sunday 04:00.

function Install-Schedules {
    if ($Script:DryRun) { Write-Log 'DRY: Install-Schedules'; return }
    $script = Join-Path $Script:InstallDir 'Blurry.ps1'
    if (-not (Test-Path $script)) {
        Write-Log "Blurry.ps1 not found at $script -- running self-install first." 'WARN'
        Invoke-SelfInstall
    }

    $cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Mode Clean -Quiet"

    schtasks /delete /tn 'BlurryClean-Login'  /f 2>$null | Out-Null
    schtasks /delete /tn 'BlurryClean-Weekly' /f 2>$null | Out-Null

    schtasks /create /tn 'BlurryClean-Login'  /tr $cmd /sc onlogon                 /ru SYSTEM /rl HIGHEST /f 2>$null | Out-Null
    schtasks /create /tn 'BlurryClean-Weekly' /tr $cmd /sc weekly /d SUN /st 04:00 /ru SYSTEM /rl HIGHEST /f 2>$null | Out-Null

    Write-Log 'Scheduled tasks installed: BlurryClean-Login (onlogon), BlurryClean-Weekly (Sun 04:00).' 'OK'
}

function Uninstall-Schedules {
    schtasks /delete /tn 'BlurryClean-Login'  /f 2>$null | Out-Null
    schtasks /delete /tn 'BlurryClean-Weekly' /f 2>$null | Out-Null
    schtasks /delete /tn 'BlurryAffinityWatcher' /f 2>$null | Out-Null
    schtasks /delete /tn 'BlurryTimer0.5ms'   /f 2>$null | Out-Null
    Write-Log 'Scheduled tasks uninstalled.' 'OK'
}
