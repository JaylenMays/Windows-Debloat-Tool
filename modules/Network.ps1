# Network tuning - low ping / low jitter

# TCP global (netsh)
Register-Tweak -Id 'net-autotune-off' -Label 'Disable TCP autotuning' -Panel 'TcpPanel' -Apply {
    netsh int tcp set global autotuninglevel=disabled | Out-Null
}
Register-Tweak -Id 'net-ecn-off' -Label 'Disable ECN' -Panel 'TcpPanel' -Apply {
    netsh int tcp set global ecncapability=disabled | Out-Null
}
Register-Tweak -Id 'net-rss-on' -Label 'Enable RSS' -Panel 'TcpPanel' -Apply {
    netsh int tcp set global rss=enabled | Out-Null
}
Register-Tweak -Id 'net-rsc-off' -Label 'Disable RSC' -Panel 'TcpPanel' -Apply {
    netsh int tcp set global rsc=disabled | Out-Null
}
Register-Tweak -Id 'net-timestamps-off' -Label 'Disable TCP timestamps' -Panel 'TcpPanel' -Apply {
    netsh int tcp set global timestamps=disabled | Out-Null
}
Register-Tweak -Id 'net-heuristics-off' -Label 'Disable Windows scaling heuristics' -Panel 'TcpPanel' -Apply {
    netsh int tcp set heuristics disabled | Out-Null
}
Register-Tweak -Id 'net-ctcp' -Label 'Use CTCP congestion provider' -Panel 'TcpPanel' -Apply {
    netsh int tcp set supplemental Internet congestionprovider=ctcp | Out-Null
}
Register-Tweak -Id 'net-nagle-off' -Label "Disable Nagle's algorithm (TcpAckFrequency=1, TCPNoDelay=1)" -Panel 'TcpPanel' -Apply {
    Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces' | ForEach-Object {
        Set-RegValue $_.PSPath 'TcpAckFrequency' 1
        Set-RegValue $_.PSPath 'TCPNoDelay' 1
        Set-RegValue $_.PSPath 'TcpDelAckTicks' 0
    }
}
Register-Tweak -Id 'net-ttl-64' -Label 'TTL = 64' -Panel 'TcpPanel' -Apply {
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' 'DefaultTTL' 64
}
Register-Tweak -Id 'net-window-scaling' -Label 'TCP window scaling on' -Panel 'TcpPanel' -Apply {
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' 'Tcp1323Opts' 1
}
Register-Tweak -Id 'net-deliv-opt-off' -Label 'Disable Delivery Optimization' -Panel 'TcpPanel' -Apply {
    Set-RegValue 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DeliveryOptimization\Config' 'DODownloadMode' 0
    Set-RegValue 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DeliveryOptimization\Config' 'DownloadMode' 0
}
Register-Tweak -Id 'net-ipv6-off' -Label 'Disable IPv6 (only if your router/ISP is v4)' -Panel 'TcpPanel' -Default $false -Apply {
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters' 'DisabledComponents' 0xFF
}
Register-Tweak -Id 'net-netbios-off' -Label 'Disable NetBIOS over TCP/IP' -Panel 'TcpPanel' -Apply {
    Get-WmiObject Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=true' | ForEach-Object {
        $_.SetTcpipNetbios(2) | Out-Null
    }
}

# NIC power / offloads
Register-Tweak -Id 'nic-power' -Label 'Disable all NIC power-saving / WoL / EEE' -Panel 'NicPanel' -Apply {
    Get-NetAdapter -Physical | ForEach-Object {
        $a = $_
        try { Disable-NetAdapterPowerManagement -Name $a.Name -ErrorAction SilentlyContinue } catch {}
        $key = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4D36E972-E325-11CE-BFC1-08002bE10318}\$($a.DeviceID -replace '.*\\','' )"
    }
    # Hit every 4D36E972 sub-key with the standard NIC power-save kill list
    Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4D36E972-E325-11CE-BFC1-08002bE10318}' -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
            $k = $_.PSPath
            foreach ($v in 'AutoPowerSaveModeEnabled','AutoDisableGigabit','AdvancedEEE','*EEE','EEE','EnablePME','EEELinkAdvertisement','EnableGreenEthernet','EnableSavePowerNow','EnablePowerManagement','EnableDynamicPowerGating','EnableConnectedPowerGating','EnableWakeOnLan','GigaLite','PowerDownPll','PowerSavingMode','ReduceSpeedOnPowerDown','SmartPowerDownEnable','S5WakeOnLan','ULPMode','WakeOnDisconnect','*WakeOnMagicPacket','*WakeOnPattern','WakeOnLink') {
                Set-RegValue $k $v '0' String
            }
        }
}
Register-Tweak -Id 'nic-flowcontrol-off' -Label 'Disable flow control' -Panel 'NicPanel' -Apply {
    Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4D36E972-E325-11CE-BFC1-08002bE10318}' -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
            Set-RegValue $_.PSPath '*FlowControl' '0' String
            Set-RegValue $_.PSPath 'FlowControlCap' '0' String
        }
}
Register-Tweak -Id 'nic-int-mod-off' -Label 'Disable interrupt moderation' -Panel 'NicPanel' -Apply {
    Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4D36E972-E325-11CE-BFC1-08002bE10318}' -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
            Set-RegValue $_.PSPath '*InterruptModeration' '0' String
        }
}
Register-Tweak -Id 'nic-buffers' -Label 'Set Tx=4096 / Rx=512 buffers' -Panel 'NicPanel' -Apply {
    Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4D36E972-E325-11CE-BFC1-08002bE10318}' -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
            Set-RegValue $_.PSPath 'TransmitBuffers' '4096' String
            Set-RegValue $_.PSPath 'ReceiveBuffers' '512' String
        }
}
Register-Tweak -Id 'nic-msi-mode' -Label 'Force MSI mode on NIC interrupts' -Panel 'NicPanel' -Apply {
    Get-PnpDevice -Class Net -Status OK -ErrorAction SilentlyContinue | ForEach-Object {
        $id = $_.InstanceId
        $k = "HKLM:\SYSTEM\CurrentControlSet\Enum\$id\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties"
        Set-RegValue $k 'MSISupported' 1
    }
}

# QoS DSCP
Register-Tweak -Id 'qos-valorant' -Label 'Add Valorant QoS policy (DSCP 46)' -Panel 'QosPanel' -Apply {
    $k = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\QoS\VALORANT'
    Set-RegValue $k 'Version' '1.0' String
    Set-RegValue $k 'Application Name' 'VALORANT-Win64-Shipping.exe' String
    Set-RegValue $k 'Protocol' '*' String
    Set-RegValue $k 'Local Port' '*' String
    Set-RegValue $k 'Local IP' '*' String
    Set-RegValue $k 'Local IP Prefix Length' '*' String
    Set-RegValue $k 'Remote Port' '*' String
    Set-RegValue $k 'Remote IP' '*' String
    Set-RegValue $k 'Remote IP Prefix Length' '*' String
    Set-RegValue $k 'DSCP Value' '46' String
    Set-RegValue $k 'Throttle Rate' '-1' String
}
Register-Tweak -Id 'qos-cs2' -Label 'Add CS2 QoS policy (DSCP 46)' -Panel 'QosPanel' -Default $false -Apply {
    $k = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\QoS\CS2'
    Set-RegValue $k 'Version' '1.0' String
    Set-RegValue $k 'Application Name' 'cs2.exe' String
    Set-RegValue $k 'DSCP Value' '46' String
    Set-RegValue $k 'Throttle Rate' '-1' String
    foreach ($n in 'Protocol','Local Port','Local IP','Local IP Prefix Length','Remote Port','Remote IP','Remote IP Prefix Length') {
        Set-RegValue $k $n '*' String
    }
}
Register-Tweak -Id 'qos-fortnite' -Label 'Add Fortnite QoS policy (DSCP 46)' -Panel 'QosPanel' -Default $false -Apply {
    $k = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\QoS\FORTNITE'
    Set-RegValue $k 'Version' '1.0' String
    Set-RegValue $k 'Application Name' 'FortniteClient-Win64-Shipping.exe' String
    Set-RegValue $k 'DSCP Value' '46' String
    Set-RegValue $k 'Throttle Rate' '-1' String
    foreach ($n in 'Protocol','Local Port','Local IP','Local IP Prefix Length','Remote Port','Remote IP','Remote IP Prefix Length') {
        Set-RegValue $k $n '*' String
    }
}
