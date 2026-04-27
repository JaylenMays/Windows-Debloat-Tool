# Services module - sets non-essential services to Disabled
# Safe set is opt-in by default. Aggressive set is opt-OUT (will break peripherals/printing).

function Disable-Service { param([string]$Name)
    Set-RegValue "HKLM:\SYSTEM\CurrentControlSet\Services\$Name" 'Start' 4
}

# Safe trims (low risk on a fresh gaming install)
$safe = @(
    @{Id='svc-diagtrack'; Label='DiagTrack (Connected User Experiences)'; Svc='DiagTrack'},
    @{Id='svc-dmwap'; Label='dmwappushservice'; Svc='dmwappushservice'},
    @{Id='svc-wmedic'; Label='WaaSMedicSvc (Update Medic)'; Svc='WaaSMedicSvc'},
    @{Id='svc-diaghub'; Label='diagnosticshub.standardcollector.service'; Svc='diagnosticshub.standardcollector.service'},
    @{Id='svc-wsearch'; Label='Windows Search'; Svc='WSearch'},
    @{Id='svc-fax'; Label='Fax'; Svc='Fax'},
    @{Id='svc-rdp-uses'; Label='Remote Registry'; Svc='RemoteRegistry'},
    @{Id='svc-remote-access'; Label='Remote Access Connection Manager'; Svc='RemoteAccess'},
    @{Id='svc-retail-demo'; Label='RetailDemo'; Svc='RetailDemo'},
    @{Id='svc-mapsbroker'; Label='MapsBroker (Downloaded Maps)'; Svc='MapsBroker'},
    @{Id='svc-dps'; Label='Diagnostic Policy Service'; Svc='DPS'},
    @{Id='svc-wdihost'; Label='Windows Diagnostic Infrastructure Service Host'; Svc='WdiServiceHost'},
    @{Id='svc-wdisys'; Label='Windows Diagnostic System Host'; Svc='WdiSystemHost'},
    @{Id='svc-pcasvc'; Label='Program Compatibility Assistant'; Svc='PcaSvc'},
    @{Id='svc-tabletinput'; Label='Touch Keyboard / Handwriting'; Svc='TabletInputService'},
    @{Id='svc-wbiometric'; Label='Windows Biometric'; Svc='WbioSrvc'},
    @{Id='svc-xboxgip'; Label='Xbox Accessory Mgmt'; Svc='XboxGipSvc'},
    @{Id='svc-xboxnet'; Label='Xbox Live Networking'; Svc='XboxNetApiSvc'},
    @{Id='svc-xblauth'; Label='Xbox Live Auth Manager'; Svc='XblAuthManager'},
    @{Id='svc-xblgamesave'; Label='Xbox Live Game Save'; Svc='XblGameSave'},
    @{Id='svc-deviceassoc'; Label='Device Association Service'; Svc='DeviceAssociationService'},
    @{Id='svc-nahimic'; Label='Nahimic Service'; Svc='NahimicService'},
    @{Id='svc-tcpipnetbios'; Label='TCP/IP NetBIOS Helper'; Svc='lmhosts'},
    @{Id='svc-wpn'; Label='Windows Push Notifications System Service'; Svc='WpnService'},
    @{Id='svc-tabsvc'; Label='Touch Keyboard and Handwriting Panel'; Svc='TabletInputService'}
)

foreach ($s in $safe) {
    $svc = $s.Svc
    Register-Tweak -Id $s.Id -Label "Disable: $($s.Label)" -Panel 'ServicesSafePanel' -Default $true -Apply ([scriptblock]::Create("Disable-Service -Name '$svc'"))
}

# Aggressive (off by default — breaks USB device detection, printers, IPsec)
$aggr = @(
    @{Id='svc-aggr-plugplay'; Label='Plug and Play (BREAKS hot-plug)'; Svc='PlugPlay'},
    @{Id='svc-aggr-spooler'; Label='Print Spooler (no printing)'; Svc='Spooler'},
    @{Id='svc-aggr-ikeext'; Label='IKE/AuthIP IPsec'; Svc='IKEEXT'},
    @{Id='svc-aggr-iphlp'; Label='IP Helper (kills IPv6/Teredo)'; Svc='iphlpsvc'},
    @{Id='svc-aggr-lanwk'; Label='LanmanWorkstation (no SMB shares)'; Svc='LanmanWorkstation'},
    @{Id='svc-aggr-lansvr'; Label='LanmanServer'; Svc='LanmanServer'},
    @{Id='svc-aggr-nettcp'; Label='Net.Tcp Port Sharing'; Svc='NetTcpPortSharing'},
    @{Id='svc-aggr-iclsclient'; Label='Intel iCLS Client'; Svc='iclsClient'},
    @{Id='svc-aggr-cphs'; Label='Intel Content Protection HECI'; Svc='cphs'},
    @{Id='svc-aggr-heci'; Label='Intel Management Engine Interface'; Svc='heci'},
    @{Id='svc-aggr-meix64'; Label='Intel ME Interface x64'; Svc='MEIx64'},
    @{Id='svc-aggr-tee'; Label='Intel Trusted Execution Engine'; Svc='TeeDriverW8x64'},
    @{Id='svc-aggr-trustedexec'; Label='Trusted Execution Environment'; Svc='TrustedExecutionEnvironment'},
    @{Id='svc-aggr-esif'; Label='Intel Energy Server'; Svc='esifsvc'},
    @{Id='svc-aggr-diagsvc'; Label='Diagnostic Service Host'; Svc='DiagSvc'}
)

foreach ($s in $aggr) {
    $svc = $s.Svc
    Register-Tweak -Id $s.Id -Label "Disable: $($s.Label)" -Panel 'ServicesAggrPanel' -Default $false -Aggressive $true -Apply ([scriptblock]::Create("Disable-Service -Name '$svc'"))
}
