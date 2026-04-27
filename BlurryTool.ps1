# Blurry Windows Tool - debloat & gaming-latency optimization
# Built for Windows 11 Pro, fresh-install workflow.
# Run via Launch.bat (elevates automatically).

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$Script:Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script:LogPath = Join-Path $Script:Root 'logs\blurry.log'
$Script:ModulePath = Join-Path $Script:Root 'modules'
$Script:DataPath = Join-Path $Script:Root 'data'

# --- admin check ---
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    [System.Windows.Forms.MessageBox]::Show('Run via Launch.bat (administrator required).','Blurry Tool','OK','Error') | Out-Null
    exit 1
}

# --- logging ---
function Write-BlurryLog {
    param([string]$Message,[string]$Level='INFO')
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'), $Level, $Message
    Add-Content -Path $Script:LogPath -Value $line -Encoding UTF8
    if ($Script:LogBox) {
        $Script:LogBox.Dispatcher.Invoke([action]{
            $Script:LogBox.AppendText($line + "`r`n")
            $Script:LogBox.ScrollToEnd()
        })
    }
}

# --- safe registry helper ---
function Set-RegValue {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)]$Value,
        [ValidateSet('DWord','QWord','String','ExpandString','MultiString','Binary')][string]$Type='DWord'
    )
    try {
        if (-not (Test-Path $Path)) { New-Item -Path $Path -Force | Out-Null }
        New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force | Out-Null
        Write-BlurryLog "REG  $Path :: $Name = $Value"
    } catch {
        Write-BlurryLog "REG-FAIL $Path :: $Name -> $($_.Exception.Message)" 'WARN'
    }
}

function Invoke-Safe {
    param([scriptblock]$Block,[string]$Label)
    try { & $Block; Write-BlurryLog "OK   $Label" }
    catch { Write-BlurryLog "FAIL $Label -> $($_.Exception.Message)" 'WARN' }
}

# --- restore point ---
function New-BlurryRestorePoint {
    Write-BlurryLog 'Creating system restore point...'
    try {
        Enable-ComputerRestore -Drive 'C:\' -ErrorAction SilentlyContinue
        $rpKey = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore'
        if (-not (Test-Path $rpKey)) { New-Item -Path $rpKey -Force | Out-Null }
        New-ItemProperty -Path $rpKey -Name 'SystemRestorePointCreationFrequency' -Value 0 -PropertyType DWord -Force | Out-Null
        Checkpoint-Computer -Description 'Blurry Tool - pre-tweak' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop
        Write-BlurryLog 'Restore point created.'
        return $true
    } catch {
        Write-BlurryLog "Restore point failed: $($_.Exception.Message)" 'WARN'
        return $false
    }
}

# --- module loader ---
function Import-BlurryModules {
    Get-ChildItem -Path $Script:ModulePath -Filter *.ps1 | ForEach-Object {
        . $_.FullName
        Write-BlurryLog "Loaded module: $($_.BaseName)"
    }
}

# --- WPF GUI ---
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Blurry Windows Tool"
        Height="780" Width="1180"
        WindowStartupLocation="CenterScreen"
        Background="#0E0E12" Foreground="#E6E6E6"
        FontFamily="Segoe UI" FontSize="13">
  <Window.Resources>
    <Style TargetType="CheckBox">
      <Setter Property="Margin" Value="6,3"/>
      <Setter Property="Foreground" Value="#E6E6E6"/>
    </Style>
    <Style TargetType="Button">
      <Setter Property="Background" Value="#1F1F28"/>
      <Setter Property="Foreground" Value="#E6E6E6"/>
      <Setter Property="BorderBrush" Value="#3D3D4A"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="Padding" Value="10,6"/>
      <Setter Property="Margin" Value="4"/>
      <Setter Property="Cursor" Value="Hand"/>
    </Style>
    <Style TargetType="GroupBox">
      <Setter Property="Foreground" Value="#9DD9FF"/>
      <Setter Property="BorderBrush" Value="#2A2A36"/>
      <Setter Property="Margin" Value="6"/>
      <Setter Property="Padding" Value="6"/>
    </Style>
    <Style TargetType="TabItem">
      <Setter Property="Background" Value="#15151C"/>
      <Setter Property="Foreground" Value="#CFCFCF"/>
      <Setter Property="Padding" Value="14,6"/>
    </Style>
    <Style TargetType="TextBlock">
      <Setter Property="Foreground" Value="#CFCFCF"/>
    </Style>
  </Window.Resources>

  <Grid>
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="*"/>
      <RowDefinition Height="180"/>
      <RowDefinition Height="Auto"/>
    </Grid.RowDefinitions>

    <!-- header -->
    <Border Grid.Row="0" Background="#15151C" Padding="14,10">
      <StackPanel Orientation="Horizontal">
        <TextBlock Text="BLURRY" FontSize="22" FontWeight="Bold" Foreground="#9DD9FF"/>
        <TextBlock Text="  Windows Debloat &amp; Gaming Latency Tool" FontSize="14" VerticalAlignment="Center" Margin="8,4,0,0"/>
        <TextBlock x:Name="VersionLabel" Text="  v1.0" FontSize="11" VerticalAlignment="Center" Margin="6,4,0,0" Foreground="#777"/>
      </StackPanel>
    </Border>

    <!-- main tabs -->
    <TabControl Grid.Row="1" x:Name="MainTabs" Background="#0E0E12" BorderBrush="#2A2A36">

      <TabItem Header="Debloat">
        <ScrollViewer><StackPanel Margin="10">
          <TextBlock Text="Removes preinstalled bloat apps and Microsoft telemetry. Safe defaults checked." FontStyle="Italic" Margin="0,0,0,8"/>
          <GroupBox Header="Bloat AppX packages">
            <WrapPanel x:Name="BloatPanel"/>
          </GroupBox>
          <GroupBox Header="Telemetry / Privacy">
            <StackPanel x:Name="PrivacyPanel"/>
          </GroupBox>
          <GroupBox Header="Edge / OneDrive / Cortana">
            <StackPanel x:Name="EdgePanel"/>
          </GroupBox>
        </StackPanel></ScrollViewer>
      </TabItem>

      <TabItem Header="Tweaks">
        <ScrollViewer><StackPanel Margin="10">
          <GroupBox Header="Explorer / UI">
            <StackPanel x:Name="ExplorerPanel"/>
          </GroupBox>
          <GroupBox Header="Visual effects (perf over pretty)">
            <StackPanel x:Name="VisualPanel"/>
          </GroupBox>
        </StackPanel></ScrollViewer>
      </TabItem>

      <TabItem Header="Gaming">
        <ScrollViewer><StackPanel Margin="10">
          <TextBlock Text="Gaming latency / 1% lows tweaks. Pulls from Calypto, BoringBoom, TweakingGuy." FontStyle="Italic" Margin="0,0,0,8"/>
          <GroupBox Header="Game DVR / Game Bar / FSO">
            <StackPanel x:Name="GameDvrPanel"/>
          </GroupBox>
          <GroupBox Header="Scheduler / MMCSS">
            <StackPanel x:Name="SchedulerPanel"/>
          </GroupBox>
          <GroupBox Header="Latency tolerance / DXGK">
            <StackPanel x:Name="LatencyPanel"/>
          </GroupBox>
          <GroupBox Header="Per-game (preset)">
            <StackPanel Orientation="Horizontal">
              <TextBlock Text="Foreground priority preset:" VerticalAlignment="Center" Margin="0,0,8,0"/>
              <ComboBox x:Name="GamePresetBox" Width="220" SelectedIndex="0">
                <ComboBoxItem Content="Valorant / FPS (Win32PrioritySeparation 0x2A)"/>
                <ComboBoxItem Content="Fortnite / UE5 (Win32PrioritySeparation 0x1A)"/>
                <ComboBoxItem Content="Default Windows (0x02)"/>
              </ComboBox>
              <Button x:Name="ApplyGamePreset" Content="Apply preset"/>
            </StackPanel>
          </GroupBox>
        </StackPanel></ScrollViewer>
      </TabItem>

      <TabItem Header="Network">
        <ScrollViewer><StackPanel Margin="10">
          <TextBlock Text="netsh / TCP / NIC tuning for low ping. Includes Valorant QoS." FontStyle="Italic" Margin="0,0,0,8"/>
          <GroupBox Header="TCP global"><StackPanel x:Name="TcpPanel"/></GroupBox>
          <GroupBox Header="NIC power / offloads"><StackPanel x:Name="NicPanel"/></GroupBox>
          <GroupBox Header="QoS DSCP"><StackPanel x:Name="QosPanel"/></GroupBox>
        </StackPanel></ScrollViewer>
      </TabItem>

      <TabItem Header="GPU">
        <ScrollViewer><StackPanel Margin="10">
          <StackPanel Orientation="Horizontal" Margin="0,0,0,8">
            <TextBlock Text="GPU vendor:" VerticalAlignment="Center" Margin="0,0,8,0"/>
            <RadioButton x:Name="GpuNvidia" Content="NVIDIA" IsChecked="True" Margin="6,0" Foreground="#E6E6E6"/>
            <RadioButton x:Name="GpuAmd" Content="AMD" Margin="6,0" Foreground="#E6E6E6"/>
            <RadioButton x:Name="GpuIgpu" Content="iGPU only" Margin="6,0" Foreground="#E6E6E6"/>
          </StackPanel>
          <GroupBox Header="Common GPU tweaks"><StackPanel x:Name="GpuCommonPanel"/></GroupBox>
          <GroupBox Header="NVIDIA-specific"><StackPanel x:Name="GpuNvPanel"/></GroupBox>
          <GroupBox Header="AMD-specific"><StackPanel x:Name="GpuAmdPanel"/></GroupBox>
        </StackPanel></ScrollViewer>
      </TabItem>

      <TabItem Header="Services">
        <ScrollViewer><StackPanel Margin="10">
          <TextBlock Text="Sets non-essential services to Disabled (start=4). Aggressive entries are off-by-default." FontStyle="Italic" Margin="0,0,0,8"/>
          <GroupBox Header="Safe service trims"><WrapPanel x:Name="ServicesSafePanel"/></GroupBox>
          <GroupBox Header="Aggressive (may break peripherals/printing)"><WrapPanel x:Name="ServicesAggrPanel"/></GroupBox>
        </StackPanel></ScrollViewer>
      </TabItem>

      <TabItem Header="Power / BCD">
        <ScrollViewer><StackPanel Margin="10">
          <GroupBox Header="Power plan">
            <StackPanel>
              <CheckBox x:Name="PwUltimate" Content="Enable + activate Ultimate Performance plan" IsChecked="True"/>
              <CheckBox x:Name="PwSmoothGaming" Content="Create 'Smooth Gaming' plan (no core parking, max perf)" IsChecked="True"/>
              <CheckBox x:Name="PwMonitorSleep" Content="Disable monitor/disk sleep on AC" IsChecked="True"/>
            </StackPanel>
          </GroupBox>
          <GroupBox Header="bcdedit (boot config)">
            <StackPanel x:Name="BcdPanel"/>
          </GroupBox>
          <GroupBox Header="Timer resolution">
            <StackPanel>
              <CheckBox x:Name="TmGlobalReq" Content="GlobalTimerResolutionRequests = 1 (Win11 22H2+)" IsChecked="True"/>
              <CheckBox x:Name="TmHpet" Content="useplatformclock no (let TSC win)" IsChecked="True"/>
              <CheckBox x:Name="TmSchedule" Content="Schedule 0.5ms timer task at logon (timeBeginPeriod)" IsChecked="True"/>
            </StackPanel>
          </GroupBox>
        </StackPanel></ScrollViewer>
      </TabItem>

      <TabItem Header="Apps">
        <ScrollViewer><StackPanel Margin="10">
          <TextBlock Text="Installs via winget. Pick what you want, hit Apply." FontStyle="Italic" Margin="0,0,0,8"/>
          <GroupBox Header="Browsers"><WrapPanel x:Name="AppsBrowserPanel"/></GroupBox>
          <GroupBox Header="Gaming"><WrapPanel x:Name="AppsGamingPanel"/></GroupBox>
          <GroupBox Header="Comms"><WrapPanel x:Name="AppsCommsPanel"/></GroupBox>
          <GroupBox Header="Utilities"><WrapPanel x:Name="AppsUtilPanel"/></GroupBox>
          <GroupBox Header="Tweaking / monitoring"><WrapPanel x:Name="AppsTweakPanel"/></GroupBox>
          <GroupBox Header="Per-app debloat (run after install)">
            <StackPanel x:Name="AppsDebloatPanel"/>
          </GroupBox>
        </StackPanel></ScrollViewer>
      </TabItem>

      <TabItem Header="TweakingGuy AIO">
        <Grid Margin="10">
          <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
          </Grid.RowDefinitions>
          <StackPanel Grid.Row="0">
            <TextBlock TextWrapping="Wrap" Foreground="#FFB347" FontWeight="Bold">
              WARNING: This is the verbatim TweakingGuy script you supplied. It is AGGRESSIVE.
              It renames smartscreen.exe and CPU microcode DLLs, deletes all scheduled tasks,
              disables Plug and Play / Print Spooler / IPsec, and sets bcdedit nx AlwaysOff.
              Some commands may fail on stock Windows 11 (expected). Run only on a fresh install.
            </TextBlock>
            <TextBlock Text="The tool ships the script verbatim at data\tweakingguy.bat. The button below runs it." Margin="0,8,0,0"/>
          </StackPanel>
          <Border Grid.Row="1" BorderBrush="#2A2A36" BorderThickness="1" Margin="0,8" Background="#15151C">
            <ScrollViewer><TextBox x:Name="TweakingGuyPreview" Background="#15151C" Foreground="#9DD9FF" BorderThickness="0"
                       FontFamily="Consolas" FontSize="11" IsReadOnly="True" TextWrapping="NoWrap"/></ScrollViewer>
          </Border>
          <StackPanel Grid.Row="2" Orientation="Horizontal">
            <Button x:Name="TweakingGuyOpen" Content="Open script in Notepad"/>
            <Button x:Name="TweakingGuyRun" Content="Run TweakingGuy AIO (admin)" Background="#5A1F1F"/>
          </StackPanel>
        </Grid>
      </TabItem>

      <TabItem Header="Profiles">
        <StackPanel Margin="10">
          <TextBlock Text="One-click bundles. Selects a curated set of checkboxes across all tabs." FontStyle="Italic" Margin="0,0,0,8"/>
          <Button x:Name="ProfFreshInstall" Content="Fresh-install: safe debloat + recommended tweaks"/>
          <Button x:Name="ProfCompetitiveFps" Content="Competitive FPS: max latency-cut profile"/>
          <Button x:Name="ProfStreamer" Content="Streamer: keep capture/audio services intact"/>
          <Button x:Name="ProfClearAll" Content="Clear all selections"/>
        </StackPanel>
      </TabItem>

    </TabControl>

    <!-- log box -->
    <Grid Grid.Row="2" Background="#0A0A10">
      <Grid.RowDefinitions>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="*"/>
      </Grid.RowDefinitions>
      <TextBlock Grid.Row="0" Text="Log" Margin="10,4,0,0" Foreground="#9DD9FF" FontWeight="Bold"/>
      <TextBox Grid.Row="1" x:Name="LogBox" Background="#0A0A10" Foreground="#A8E0A0" BorderThickness="0"
               FontFamily="Consolas" FontSize="11" IsReadOnly="True" VerticalScrollBarVisibility="Auto" Margin="6"/>
    </Grid>

    <!-- footer -->
    <Border Grid.Row="3" Background="#15151C" Padding="10,6">
      <Grid>
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <StackPanel Grid.Column="0" Orientation="Horizontal">
          <CheckBox x:Name="CbDryRun" Content="Dry run (log-only, do nothing)" Margin="6,4"/>
          <CheckBox x:Name="CbRestorePoint" Content="Create restore point before apply" IsChecked="True" Margin="14,4"/>
        </StackPanel>
        <StackPanel Grid.Column="1" Orientation="Horizontal">
          <Button x:Name="BtnExportLog" Content="Open log folder"/>
          <Button x:Name="BtnApply" Content="Apply selected" Background="#1F4A2A"/>
          <Button x:Name="BtnExit" Content="Exit"/>
        </StackPanel>
      </Grid>
    </Border>
  </Grid>
</Window>
'@

$reader = [System.Xml.XmlNodeReader]::new($xaml)
$Script:Window = [Windows.Markup.XamlReader]::Load($reader)

# Resolve named elements
function Get-X { param([string]$n) $Script:Window.FindName($n) }

$Script:LogBox = Get-X 'LogBox'

# --- declarative tweak catalog ---
# each entry: Id, Label, Default, Apply (scriptblock), Tab (panel name), Aggressive (bool)
$Script:Tweaks = @()

function Register-Tweak {
    param(
        [string]$Id,
        [string]$Label,
        [string]$Panel,
        [scriptblock]$Apply,
        [bool]$Default = $true,
        [bool]$Aggressive = $false,
        [string]$Tooltip = ''
    )
    $Script:Tweaks += [pscustomobject]@{
        Id = $Id; Label = $Label; Panel = $Panel
        Apply = $Apply; Default = $Default; Aggressive = $Aggressive
        Tooltip = $Tooltip; Checkbox = $null
    }
}

# Modules register tweaks via Register-Tweak
Import-BlurryModules

# Build checkboxes from registered tweaks
foreach ($t in $Script:Tweaks) {
    $panel = Get-X $t.Panel
    if (-not $panel) { Write-BlurryLog "Panel not found: $($t.Panel) for $($t.Id)" 'WARN'; continue }
    $cb = New-Object System.Windows.Controls.CheckBox
    $cb.Content = $t.Label
    $cb.IsChecked = $t.Default
    if ($t.Tooltip) { $cb.ToolTip = $t.Tooltip }
    if ($t.Aggressive) { $cb.Foreground = '#FFB347' }
    $panel.Children.Add($cb) | Out-Null
    $t.Checkbox = $cb
}

# --- TweakingGuy preview ---
$tgPath = Join-Path $Script:DataPath 'tweakingguy.bat'
if (Test-Path $tgPath) {
    (Get-X 'TweakingGuyPreview').Text = Get-Content $tgPath -Raw
}

# --- button handlers ---
(Get-X 'BtnExit').Add_Click({ $Script:Window.Close() })
(Get-X 'BtnExportLog').Add_Click({
    Start-Process explorer.exe -ArgumentList (Join-Path $Script:Root 'logs')
})
(Get-X 'TweakingGuyOpen').Add_Click({
    if (Test-Path $tgPath) { Start-Process notepad.exe $tgPath }
})
(Get-X 'TweakingGuyRun').Add_Click({
    $r = [System.Windows.MessageBox]::Show(
        "This will run the verbatim TweakingGuy script. Aggressive. Continue?",
        'Confirm', 'YesNo', 'Warning')
    if ($r -ne 'Yes') { return }
    if ((Get-X 'CbRestorePoint').IsChecked) { New-BlurryRestorePoint | Out-Null }
    Write-BlurryLog 'Launching TweakingGuy AIO...'
    Start-Process cmd.exe -ArgumentList "/c `"$tgPath`"" -Verb RunAs
})

(Get-X 'ApplyGamePreset').Add_Click({
    $sel = (Get-X 'GamePresetBox').SelectedIndex
    $val = switch ($sel) { 0 { 0x2A } 1 { 0x1A } default { 0x02 } }
    Set-RegValue 'HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl' 'Win32PrioritySeparation' $val DWord
    Write-BlurryLog ("Win32PrioritySeparation set to 0x{0:X}" -f $val)
})

# --- profile presets ---
function Set-Profile {
    param([string]$Name)
    foreach ($t in $Script:Tweaks) { $t.Checkbox.IsChecked = $false }
    switch ($Name) {
        'fresh' {
            foreach ($t in $Script:Tweaks) {
                if (-not $t.Aggressive -and $t.Default) { $t.Checkbox.IsChecked = $true }
            }
        }
        'fps' {
            foreach ($t in $Script:Tweaks) {
                if ($t.Panel -in @('GameDvrPanel','SchedulerPanel','LatencyPanel','TcpPanel','NicPanel','QosPanel','GpuCommonPanel','GpuNvPanel','GpuAmdPanel','VisualPanel','BcdPanel','PrivacyPanel') -and -not $t.Aggressive) {
                    $t.Checkbox.IsChecked = $true
                }
            }
        }
        'streamer' {
            foreach ($t in $Script:Tweaks) {
                if (-not $t.Aggressive -and $t.Default -and $t.Id -notlike 'svc-*' -and $t.Id -notlike 'net-disable-*') {
                    $t.Checkbox.IsChecked = $true
                }
            }
        }
        'clear' { } # already cleared above
    }
    Write-BlurryLog "Profile applied: $Name"
}

(Get-X 'ProfFreshInstall').Add_Click({ Set-Profile 'fresh' })
(Get-X 'ProfCompetitiveFps').Add_Click({ Set-Profile 'fps' })
(Get-X 'ProfStreamer').Add_Click({ Set-Profile 'streamer' })
(Get-X 'ProfClearAll').Add_Click({ Set-Profile 'clear' })

# --- apply ---
(Get-X 'BtnApply').Add_Click({
    $dry = [bool](Get-X 'CbDryRun').IsChecked
    $rp  = [bool](Get-X 'CbRestorePoint').IsChecked
    if ($dry) { Write-BlurryLog '*** DRY RUN: no changes will be made ***' 'WARN' }
    if (-not $dry -and $rp) { New-BlurryRestorePoint | Out-Null }

    $selected = $Script:Tweaks | Where-Object { $_.Checkbox.IsChecked }
    Write-BlurryLog ("Applying {0} tweaks..." -f $selected.Count)

    # GPU vendor gating
    $vendor = if ((Get-X 'GpuNvidia').IsChecked) {'NVIDIA'}
              elseif ((Get-X 'GpuAmd').IsChecked) {'AMD'} else {'IGPU'}
    $Script:GpuVendor = $vendor

    foreach ($t in $selected) {
        # skip GPU tweaks for the wrong vendor
        if ($t.Panel -eq 'GpuNvPanel' -and $vendor -ne 'NVIDIA') {
            Write-BlurryLog "SKIP $($t.Id) (NVIDIA tweak, vendor=$vendor)"; continue
        }
        if ($t.Panel -eq 'GpuAmdPanel' -and $vendor -ne 'AMD') {
            Write-BlurryLog "SKIP $($t.Id) (AMD tweak, vendor=$vendor)"; continue
        }
        if ($dry) {
            Write-BlurryLog "DRY  $($t.Id) :: $($t.Label)"
        } else {
            Invoke-Safe -Block $t.Apply -Label "$($t.Id) :: $($t.Label)"
        }
    }

    # Power tab top-level checkboxes (defined in XAML, not as registered tweaks)
    $powerCbs = @(
        @{ Cb = 'PwUltimate'; Fn = { Invoke-PowerUltimate } }
        @{ Cb = 'PwSmoothGaming'; Fn = { Invoke-PowerSmoothGaming } }
        @{ Cb = 'PwMonitorSleep'; Fn = { Invoke-PowerNoSleep } }
        @{ Cb = 'TmGlobalReq'; Fn = { Invoke-TimerGlobalReq } }
        @{ Cb = 'TmHpet'; Fn = { Invoke-TimerHpetOff } }
        @{ Cb = 'TmSchedule'; Fn = { Invoke-TimerScheduleTask } }
    )
    foreach ($p in $powerCbs) {
        $cb = Get-X $p.Cb
        if ($cb -and $cb.IsChecked) {
            if ($dry) { Write-BlurryLog "DRY  $($p.Cb)" }
            else { Invoke-Safe -Block $p.Fn -Label "Power: $($p.Cb)" }
        }
    }

    Write-BlurryLog '=== Apply complete. Reboot recommended. ==='
    [System.Windows.MessageBox]::Show('Done. A reboot is recommended.','Blurry Tool','OK','Information') | Out-Null
})

Write-BlurryLog '=== Blurry Tool started ==='
$Script:Window.ShowDialog() | Out-Null
