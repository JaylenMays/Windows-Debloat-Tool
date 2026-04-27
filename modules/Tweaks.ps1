# Explorer / UI / Visual tweaks

# Explorer
Register-Tweak -Id 'ex-show-extensions' -Label 'Show file extensions' -Panel 'ExplorerPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'HideFileExt' 0
}
Register-Tweak -Id 'ex-show-hidden' -Label 'Show hidden files' -Panel 'ExplorerPanel' -Default $false -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'Hidden' 1
}
Register-Tweak -Id 'ex-launch-thispc' -Label 'Open Explorer to This PC instead of Quick Access' -Panel 'ExplorerPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'LaunchTo' 1
}
Register-Tweak -Id 'ex-classic-context' -Label 'Restore classic context menu (Win11)' -Panel 'ExplorerPanel' -Apply {
    $key = 'HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32'
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name '(Default)' -Value '' -Force
}
Register-Tweak -Id 'ex-remove-search-box' -Label 'Hide search box on taskbar' -Panel 'ExplorerPanel' -Default $false -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' 'SearchboxTaskbarMode' 0
}
Register-Tweak -Id 'ex-disable-widgets' -Label 'Disable Widgets / News' -Panel 'ExplorerPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarDa' 0
    Set-RegValue 'HKLM:\SOFTWARE\Policies\Microsoft\Dsh' 'AllowNewsAndInterests' 0
}
Register-Tweak -Id 'ex-end-task-rmb' -Label 'Add "End Task" to taskbar right-click' -Panel 'ExplorerPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced\TaskbarDeveloperSettings' 'TaskbarEndTask' 1
}
Register-Tweak -Id 'ex-no-taskbar-anim' -Label 'Disable taskbar animations' -Panel 'ExplorerPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarAnimations' 0
}
Register-Tweak -Id 'ex-no-recent' -Label 'Disable recent files / frequent folders in Quick Access' -Panel 'ExplorerPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer' 'ShowRecent' 0
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer' 'ShowFrequent' 0
}

# Visual effects (perf-leaning)
Register-Tweak -Id 'vfx-perf-mode' -Label 'Visual effects: Adjust for best performance' -Panel 'VisualPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' 'VisualFXSetting' 2
}
Register-Tweak -Id 'vfx-min-anim' -Label 'Disable window minimize/maximize animations' -Panel 'VisualPanel' -Apply {
    Set-RegValue 'HKCU:\Control Panel\Desktop\WindowMetrics' 'MinAnimate' '0' -Type String
    Set-RegValue 'HKCU:\Control Panel\Desktop' 'UserPreferencesMask' ([byte[]](0x90,0x12,0x03,0x80,0x10,0x00,0x00,0x00)) -Type Binary
}
Register-Tweak -Id 'vfx-aero-peek' -Label 'Disable Aero Peek' -Panel 'VisualPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\DWM' 'EnableAeroPeek' 0
}
Register-Tweak -Id 'vfx-thumbnail-hib' -Label 'Disable DWM thumbnail hibernation' -Panel 'VisualPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\DWM' 'AlwaysHibernateThumbnails' 0
}
Register-Tweak -Id 'vfx-no-listview-shadow' -Label 'Disable list view shadows' -Panel 'VisualPanel' -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ListviewShadow' 0
}
Register-Tweak -Id 'vfx-no-transparency' -Label 'Disable transparency effects' -Panel 'VisualPanel' -Default $false -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'EnableTransparency' 0
}
Register-Tweak -Id 'vfx-no-mouse-trails' -Label 'Disable mouse pointer trails' -Panel 'VisualPanel' -Apply {
    Set-RegValue 'HKCU:\Control Panel\Mouse' 'MouseTrails' '0' -Type String
}
Register-Tweak -Id 'vfx-disable-fso-anim' -Label 'Disable file copy / progress animations' -Panel 'VisualPanel' -Default $false -Apply {
    Set-RegValue 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'IconsOnly' 0
}
