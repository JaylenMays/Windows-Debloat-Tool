# 10-Advanced.ps1 - opt-in aggressive toggles. Off by default; surfaced via menu [8].

function Show-AdvancedMenu {
    while ($true) {
        Clear-Host
        Write-Host ''
        Write-Host '  ADVANCED / AGGRESSIVE TOGGLES                    (off by default)' -ForegroundColor Yellow
        Write-Host '  ' ('-' * 78) -ForegroundColor DarkYellow
        Write-Host '  [1] Disable Windows Defender entirely             (security risk)' -ForegroundColor White
        Write-Host '  [2] Disable Print Spooler service                 (no printing)'  -ForegroundColor White
        Write-Host '  [3] Disable PnP service                           (no hot-plug, will brick USB)' -ForegroundColor Red
        Write-Host '  [4] bcdedit /set nx AlwaysOff                     (DEP off, no security)' -ForegroundColor Red
        Write-Host '  [5] Pause Windows Updates indefinitely            (year 3000 trick)' -ForegroundColor White
        Write-Host '  [6] Wipe ALL Run/RunOnce keys (wholesale)         (WinSux behavior)' -ForegroundColor White
        Write-Host '  [7] Set wallpaper + lockscreen to black'                         -ForegroundColor White
        Write-Host '  [8] Disable Defender scheduled tasks'                            -ForegroundColor White
        Write-Host '  [9] Set Win32PrioritySeparation to 0x38 (Calypto)' -ForegroundColor White
        Write-Host '  [A] Disable hibernation (already default if Full was run)'      -ForegroundColor DarkGray
        Write-Host '  [B] Uninstall scheduled tasks (BlurryClean / Affinity)'         -ForegroundColor White
        Write-Host '  [Q] Back'                                                       -ForegroundColor DarkGray
        Write-Host ''
        $sel = Read-Host '  >'
        switch ($sel.Trim().ToLower()) {
            '1' {
                if ((Read-Host '  Confirm Defender disable? (yes/no)') -eq 'yes') { Disable-DefenderFully } ; pause
            }
            '2' { Disable-Svc 'Spooler'; pause }
            '3' {
                if ((Read-Host '  Are you SURE? Disabling PnP can leave you unable to log in. (yes/no)') -eq 'yes') {
                    Disable-Svc 'PlugPlay'
                } ; pause
            }
            '4' {
                if ((Read-Host '  Confirm bcdedit nx AlwaysOff? (yes/no)') -eq 'yes') {
                    Start-Process bcdedit.exe -ArgumentList '/set nx AlwaysOff' -Wait -NoNewWindow
                } ; pause
            }
            '5' {
                $future = (Get-Date).AddYears(50).ToString('yyyy-MM-ddTHH:mm:ssZ')
                $k = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
                Set-Reg $k 'PauseUpdatesExpiryTime'      $future String
                Set-Reg $k 'PauseFeatureUpdatesEndTime'  $future String
                Set-Reg $k 'PauseQualityUpdatesEndTime'  $future String
                Write-Log 'Windows Update paused until 2076.' 'WARN'
                pause
            }
            '6' {
                if ((Read-Host '  Wipe ALL Run/RunOnce keys? Will break legitimate startup apps. (yes/no)') -eq 'yes') {
                    foreach ($p in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
                                   'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce',
                                   'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run',
                                   'HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce',
                                   'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run',
                                   'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce') {
                        Remove-RegKey $p
                        New-Item -Path $p -Force | Out-Null
                    }
                } ; pause
            }
            '7' {
                $black = Join-Path $env:WINDIR 'Black.jpg'
                if (-not (Test-Path $black)) {
                    [byte[]]$jpeg = 0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,0x2E,0x27,0x20,0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,0x39,0x3D,0x38,0x32,0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0xFF,0xC4,0x00,0xB5,0x10,0x00,0x02,0x01,0x03,0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7D,0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,0x81,0x91,0xA1,0x08,0x23,0x42,0xB1,0xC1,0x15,0x52,0xD1,0xF0,0x24,0x33,0x62,0x72,0x82,0x09,0x0A,0x16,0x17,0x18,0x19,0x1A,0x25,0x26,0x27,0x28,0x29,0x2A,0x34,0x35,0x36,0x37,0x38,0x39,0x3A,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4A,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5A,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6A,0x73,0x74,0x75,0x76,0x77,0x78,0x79,0x7A,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8A,0x92,0x93,0x94,0x95,0x96,0x97,0x98,0x99,0x9A,0xA2,0xA3,0xA4,0xA5,0xA6,0xA7,0xA8,0xA9,0xAA,0xB2,0xB3,0xB4,0xB5,0xB6,0xB7,0xB8,0xB9,0xBA,0xC2,0xC3,0xC4,0xC5,0xC6,0xC7,0xC8,0xC9,0xCA,0xD2,0xD3,0xD4,0xD5,0xD6,0xD7,0xD8,0xD9,0xDA,0xE1,0xE2,0xE3,0xE4,0xE5,0xE6,0xE7,0xE8,0xE9,0xEA,0xF1,0xF2,0xF3,0xF4,0xF5,0xF6,0xF7,0xF8,0xF9,0xFA,0xFF,0xDA,0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0xFB,0xD0,0xFF,0xD9
                    [System.IO.File]::WriteAllBytes($black, $jpeg)
                }
                Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\PersonalizationCSP' 'LockScreenImagePath' $black String
                Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\PersonalizationCSP' 'LockScreenImageStatus' 1
                Set-Reg 'HKCU:\Control Panel\Desktop' 'Wallpaper' $black String
                rundll32.exe user32.dll,UpdatePerUserSystemParameters
                pause
            }
            '8' {
                foreach ($t in 'Microsoft\Windows\Windows Defender\Windows Defender Cache Maintenance',
                               'Microsoft\Windows\Windows Defender\Windows Defender Cleanup',
                               'Microsoft\Windows\Windows Defender\Windows Defender Scheduled Scan',
                               'Microsoft\Windows\Windows Defender\Windows Defender Verification') {
                    Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue |
                        Disable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null
                }
                Write-Log 'Defender scheduled tasks disabled.' 'WARN'
                pause
            }
            '9' { Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl' 'Win32PrioritySeparation' 0x38 ; pause }
            'a' {
                Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' 'HibernateEnabled' 0
                if (-not $Script:DryRun) { powercfg /hibernate off 2>&1 | Out-Null }
                pause
            }
            'b' { Uninstall-Schedules ; pause }
            'q' { return }
            default { Write-Host '  ?' -ForegroundColor Red; Start-Sleep 1 }
        }
    }
}
