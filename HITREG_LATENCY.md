# Hit-reg / latency / 1% lows — what each tweak in this tool actually does

## The honest framing

"Hit registration" depends on three layers:
1. **Network path** (you → ISP → game server). Most hit-reg complaints are server-side or peering issues no client tweak can fix.
2. **Client-side input → frame → packet pipeline.** This is where Windows tweaks help — by reducing variance/jitter so your shot lines up with what the server sees on your tick.
3. **Frame-time consistency (1% lows).** A stutter exactly when you click eats a frame's worth of input — that's the kind of "hit-reg miss" tweaks can prevent.

Tweaks help (2) and (3). They don't help (1) beyond shaving a few ms of jitter and prioritizing your packets via DSCP.

## Tier S — biggest measurable impact for FPS

| Tweak (ID in tool) | Where | What it does | Why it matters for hit-reg / latency |
|---|---|---|---|
| `mmcss-system-resp` | Gaming → Scheduler | `SystemResponsiveness = 0` | MMCSS reserves a CPU% chunk for non-multimedia. Setting 0 gives the multimedia thread (your game) full claim. Smaller frame-time variance. |
| `mmcss-net-throttle` | Gaming → Scheduler | `NetworkThrottlingIndex = 0xFFFFFFFF` | Disables the multimedia network throttle that caps NIC rate when MMCSS is active. **Direct packet-rate fix.** |
| `mmcss-games` | Gaming → Scheduler | MMCSS Games task: GPU Pri 8, CPU Pri 6 | Lifts MMCSS-tagged game thread above kernel/driver work. Real ms-level wins on shot-to-server timing. |
| `mmcss-hwsched` | Gaming → Scheduler | HwSchMode = 2 (HAGS) | GPU schedules its own DMAs. Cuts driver overhead, smoother frame pacing. |
| `gdvr-disable` | Gaming → Game DVR | All GameDVR/GameBar off | Game DVR captures background-sample frames even when you're not recording. Removing it = lower CPU in shooter loop. |
| `nic-int-mod-off` | Network → NIC | `*InterruptModeration = 0` | NIC stops batching IRQs. Each game packet wakes the kernel immediately. **Single biggest hit-reg / netcode tweak.** |
| `net-nagle-off` | Network → TCP | `TcpAckFrequency=1`, `TCPNoDelay=1`, `TcpDelAckTicks=0` | Disables Nagle and delayed ACK. UDP-based games (Valorant/CS2) don't use Nagle but **menu/lobby/auth uses TCP** — fixes the lobby hitch many people blame on hit-reg. |
| `nic-msi-mode` | Network → NIC | `MSISupported=1` on NIC | Switches NIC interrupt routing from line-based to message-signaled. Lower IRQ servicing latency. |
| `gpu-msi-mode` | GPU → Common | `MSISupported=1` on GPU | Same idea on GPU. Cuts present-to-display interrupt latency. |
| `qos-valorant` / `qos-cs2` / `qos-fortnite` | Network → QoS | Tags game packets DSCP 46 (EF) | Your router/OS prioritizes EF-tagged packets. Helps under congestion. |
| `lat-dxgk` + `lat-power` + `lat-graphics` | Gaming → Latency | All `LatencyTolerance*` = 1 | Tells DXGK and power manager to never trade latency for power savings. |
| Power tab → `PwSmoothGaming` (no core parking, no throttling) | Power | Custom power plan | **Largest 1%-low improvement on Intel/AMD with E-cores or boost.** Stops cores from ramping down between trigger pulls. |
| `bcd-no-hyperv` + `bcd-no-vsm` | Power → BCD | Disables VBS/HVCI | VBS injects a hypervisor between Windows and the CPU. **5-15% FPS loss is typical with VBS on**, especially in CPU-bound titles like Valorant. ⚠ off by default — turning it off removes a security mitigation. |
| `bcd-disable-dyntick` + `bcd-tsc-enhanced` + `bcd-x2apic` | Power → BCD | Tickless kernel off, TSC strict, x2APIC on | Cleaner timer behavior, less timing jitter. Shows up in latencymon as fewer DPC spikes. |
| Power tab → `TmGlobalReq` + `TmSchedule` (0.5ms timer) | Power | Forces 0.5ms global timer resolution | Win11 24H2 changed timer behavior; this is the post-24H2 way to keep 0.5ms always. Helps games using Sleep()-based pacing. |

**If you only do 10:** the entire Tier-S row above. That's the bulk of the 1%-low improvement.

## Tier A — solid wins, secondary

| Tweak | Effect |
|---|---|
| `mmcss-no-bg-apps` | Background apps disabled — no surprise CPU/disk spikes mid-fight. |
| `mmcss-no-maint` | Disables auto-maintenance window — no defrag/SFC starting at 2 AM during a ranked match. |
| `mmcss-csrss-prio` (off by default) | csrss high priority — niche; leave default. |
| `nic-power` | NIC stops dropping its link to save 0.1W. Avoids micro-drops. |
| `nic-flowcontrol-off` | Flow control off — flow-control PAUSE frames can add 1-2ms. |
| `nic-buffers` | Tx 4096 / Rx 512 — reduces buffer-bloat-induced jitter on bursty fragments. |
| `net-rss-on` + `net-rsc-off` | RSS spreads NIC IRQs across cores. RSC merges packets — bad for game traffic, kill it. |
| `net-autotune-off` + `net-heuristics-off` | Stops Windows from re-sizing TCP windows under load. |
| `net-ctcp` | CTCP congestion control — better than NewReno for high-RTT links. |
| `net-deliv-opt-off` | No background Windows Update peer-sharing eating upload. |
| `net-netbios-off` | Drops noisy LAN traffic. |
| `net-timestamps-off` | TCP timestamps off — slight bandwidth saving. |
| `nv-percpu-dpc` (NVIDIA) | NVIDIA driver schedules DPCs per core — measurable in latencymon. |
| `nv-display-power` (NVIDIA) | Display power saving off — fewer micro-stalls. |
| `nv-pstate` (NVIDIA) | DisableDynamicPstate — GPU stays at boost clock. **GPU-bound games see consistent frame times.** |
| `nv-latency` (NVIDIA) | All `*Latency*` keys = 1. Subtle but cumulative. |
| `gpu-tdr-disable` (off by default) | Don't enable; breaks GPU hang recovery. |
| `vfx-perf-mode` | Adjust for best performance — frees DWM cycles. |
| `vfx-min-anim` + `vfx-aero-peek` + `vfx-thumbnail-hib` | DWM does less = lower DWM compositor latency. |
| `ex-disable-widgets` | Widgets thread off — they sample weather/news in the background. |

## Tier B — smaller wins or situational

| Tweak | Note |
|---|---|
| `priv-telemetry`, `priv-feedback`, `priv-suggested-content` | Cuts background HTTP. Measurable-but-small. |
| `cortana-disable`, `copilot-disable`, `recall-disable` | Frees a few hundred MB RAM, reduces process count. |
| `appdb-discord` | Discord HW accel disable — depends on your build. **Some people get worse latency from disabling it.** Test both. |
| `appdb-steam` | Steam doesn't auto-launch — purely RAM cleanup. |
| `appdb-nv-experience-rm` | Strips GFE telemetry tasks. Driver itself unaffected. |
| Service kills (`svc-*`) | Per-service savings are tiny but DiagTrack + WSearch alone are worth it. |
| `net-ttl-64`, `net-window-scaling`, `net-maxsynretrans-2` | Defaults are usually fine; small effect. |
| `net-ipv6-off` (off by default) | **Don't enable unless** your router/ISP isn't dual-stack. Some modern P2P needs v6. |

## Tier C — placebo / bordering on harmful

| Tweak | Why it's listed | Why I have it off-by-default |
|---|---|---|
| `bcd-no-hyperv` (force off VBS) | Real FPS gain, **but** removes VBS/HVCI security mitigations. Your call. |
| `nv-no-write-combine` (off) | Theoretically lower memory write latency, in practice NVIDIA driver overrides. |
| `nv-no-hdcp` (off) | Doesn't help anything, can break HDR handshake. |
| Renaming `smartscreen.exe` / `mcupdate_*.dll` (only in TweakingGuy AIO, commented out) | Disabling SmartScreen + microcode updates. Security regression. |
| `bcd-set-nx-AlwaysOff` (only in TweakingGuy AIO, commented out) | DEP off. Modest FPS gain on very old CPUs. **Major** security regression on modern ones. |

## Recommended profile for hit-reg / FPS specifically

If you launch the tool, hit **Profiles → Competitive FPS**, then on top of that also tick:

- Power tab → `PwSmoothGaming`, `PwMonitorSleep`, `TmGlobalReq`, `TmSchedule`
- Power → BCD → `bcd-disable-dyntick`, `bcd-platform-tick`, `bcd-tsc-enhanced`, `bcd-x2apic`, `bcd-no-hyperv` (only if you want max FPS over VBS security)
- Network → NIC → `nic-int-mod-off`, `nic-msi-mode`, `nic-power`, `nic-flowcontrol-off`, `nic-buffers`
- Network → TCP → `net-nagle-off`, `net-rss-on`, `net-rsc-off`, `net-deliv-opt-off`, `net-netbios-off`
- Network → QoS → the games you actually play
- Gaming → Scheduler → all of `mmcss-*` (especially `system-resp`, `net-throttle`, `games`, `hwsched`)
- Gaming → Game DVR → `gdvr-disable`
- Gaming → Latency → all of `lat-*`
- GPU → Common → `gpu-msi-mode`
- GPU → NVIDIA-specific → `nv-pstate`, `nv-percpu-dpc`, `nv-display-power`, `nv-latency`, `nv-telemetry-off`

Skip:
- `gpu-tdr-disable`
- `nv-no-hdcp`, `nv-no-write-combine`
- IPv6 disable unless you've confirmed your stack is v4-only
- `priv-location` (off by default — irrelevant to gaming)
- The aggressive service trims (`svc-aggr-*`) — they break PnP / printing / SMB.

## How to measure if it actually helped

1. Install **LatencyMon** (Resplendence). Run it for 2 minutes idle. Record max DPC, max ISR, "highest reported DPC routine."
2. Apply the tool, reboot.
3. Run LatencyMon again. The values you want lower: max DPC, max ISR, hard pagefaults.
4. In-game: turn on **NVIDIA Reflex Analyzer** (or Reflex+Boost) and check "Render Latency" + "Total System Latency" in the overlay.
5. For hit-reg specifically: **CS2's `cl_showpos 1` + `net_graph 1`** or Valorant's network round-trip in the score panel — look for variance, not just average.

If a tweak doesn't move LatencyMon or Reflex numbers, it's placebo on your specific hardware. Don't be afraid to revert.
