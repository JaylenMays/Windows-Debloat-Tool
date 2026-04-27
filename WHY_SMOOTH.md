# What is the "smoothness feeling" — and what actually creates it

When people sit down at a Voot/BOHR/TweakingGuy machine and say "holy shit it just *feels* different" — that feeling is real, and it's not because the framerate is higher. Same FPS, totally different feel. Here's what's actually going on.

## The short version

Smoothness is **variance, not average.**

Your brain doesn't notice "60 FPS vs 65 FPS." It notices:
- Frame **#1 took 4ms, frame #2 took 18ms** — even if you're hitting 144 FPS average, that 18ms frame felt like a hitch.
- A click that responded in 22ms followed by a click that responded in 41ms — even if the average is 30ms, you can feel the difference between the two clicks.
- A mouse cursor that moves in perfectly even pixel-steps vs one that occasionally "jumps" two pixels.

A tweaked PC is one where **everything happens on the same clock**, every time. That's the feeling.

## The seven things that make it feel "instant"

### 1. Frame-time consistency, not framerate

A 240Hz panel running 240 FPS where every frame takes 4.16ms feels glassy.

A 240Hz panel running 240 FPS where frame times are 3.8 / 4.5 / 4.2 / **6.1** / 4.0 ms feels like vaseline. The 6.1ms frame is a stutter your brain logs as a "miss" even if you can't articulate it.

Variance comes from:
- DPCs/ISRs interrupting the render thread mid-frame (LatencyMon's job to find these)
- GPU dropping to a lower P-state for a few ms (Tier-S NVIDIA tweak: `DisableDynamicPstate`)
- DWM compositor preemption (MMCSS Games priority, hardware-accelerated GPU scheduling)
- Background AppX waking up (Game Mode, BackgroundAccessApplications)

This is the **single biggest contributor** to the feeling.

### 2. Click-to-photon variance, not average

The same logic for input. Average click-to-photon of 28ms with low variance feels miles better than a 22ms average that occasionally spikes to 50ms. Reflex+Boost on 540Hz panels can hit ~5ms render latency, but consistency is what your brain reads as "responsiveness."

Variance comes from:
- USB poll jitter (kill USB selective suspend, force MSI mode on USBXHCI)
- Render queue depth spiking (Low Latency Mode "Ultra", or Reflex)
- CPU stuttering on E-cores (no E-core demotion via power plan / Process Lasso pinning)
- NIC interrupt moderation batching the click-acknowledgment packet (`*InterruptModeration = 0`)

### 3. The DWM compositor running at full priority

The Windows desktop is composited by DWM. Every window movement, every cursor position update, every scroll, every menu appearing — DWM. When DWM is preempted by a background service, the cursor "hitches" by a single pixel. You don't see one pixel. But over a 30-minute session you feel it.

What helps:
- `mmcss-system-resp = 0` (DWM gets full CPU%)
- `vfx-aero-peek` off / animations off (less DWM work)
- HAGS on (`HwSchMode = 2`) — DWM submits its own GPU work without going through the scheduler
- DWM thumbnail hibernation off (`AlwaysHibernateThumbnails = 0`)

This is **why even the desktop feels smoother**, not just games. People notice this in the first 30 seconds.

### 4. Mouse/keyboard polling that's actually consistent

A 1000Hz mouse polling at 1000Hz feels great. A 1000Hz mouse polling at 800-1100Hz with occasional skips feels... about the same as 250Hz. A "smooth" PC is one where polling is *boring* — every cycle, identical interval.

Tweaks that fix this:
- USB power management completely off (per-device, in Device Manager + reg)
- MSI mode forced on USBXHCI host controllers
- `bcd-disable-dyntick` (the kernel doesn't skip ticks under low load)
- `tm-task` (0.5ms global timer resolution scheduled at logon)

8000Hz mice are wasted on a non-tweaked Windows. The OS can't deliver 8000 reports per second consistently unless the kernel is tuned for it.

### 5. The CPU stays awake

On a default Windows install, your CPU constantly transitions between C-states and P-states:
- Idle for 4ms → drops to C6
- You move the mouse → C6 → C0 transition (~4-10μs but variable)
- Game thread wakes a worker → another core transitions out of C6
- E-core demotion under low load → click registers on a 3.0GHz E-core instead of 5.5GHz P-core

A tweaked PC keeps the CPU **always ready**:
- Power plan: Min CPU State 100% (no C-state transitions for the cores you care about)
- Power plan: Max CPU State 100% (no P-state demotion mid-action)
- Process Lasso pinning the game to P-cores only (avoids E-core round-trip)
- `bcd-disable-dyntick yes` (the kernel itself doesn't sleep)

This is why "Smooth Gaming" power plan + no core parking feels different. The CPU isn't faster — it's just **never not ready**.

### 6. The GPU stays at P0

Same story for the GPU. Default behavior: GPU drops to P5/P8 between frames to save 5W. The transition costs ~2ms. In a 240Hz title, that's a half-frame of latency injected at random.

NVIDIA tweak `DisableDynamicPstate = 1` pins the GPU at P0. Power consumption goes up but **the GPU is always in render-mode** when you click.

You feel this as "the game responds the moment I click" instead of "the game responds *almost* the moment I click."

### 7. Nothing-in-the-way (the biggest underrated one)

Removing background work isn't about saving CPU%. It's about removing **sources of variance**.

A default Windows install has, at any moment, ~30 things that *might* fire and steal a frame:
- Defender real-time scan kicking on a game asset
- DiagTrack uploading telemetry
- Search indexing your Documents folder
- Update Orchestrator deciding to download a CU
- Edge prefetching news widgets
- OneDrive syncing a desktop screenshot
- Cortana waking up to listen for "Hey Cortana"
- A scheduled task running a chkdsk on D:
- WaaSMedicSvc deciding your update channel needs repair

Each of these costs you nothing 95% of the time. **And it's the other 5% that causes the "wtf was that hitch" moments**, even though it's the only time you remember.

A tweaked PC has all of these gone. So 100% of the time is "smooth time." That's the feeling.

## The order people notice it

When someone sits down at a tweaked PC, this is the order they consciously notice things — usually all in the first 60 seconds:

1. **Cursor and window dragging feels glassy** (DWM smooth, MMCSS responsive, no E-core hops)
2. **Alt-tab is instant** (DWM + scheduler + no background AppX waking up)
3. **Right-click context menus appear without delay** (Explorer not waiting for shell extensions / suggested content)
4. **Browser scroll is silky** (HAGS + transparency off + no DWM thumbnails)
5. **In-game, the click-to-shoot feels "tighter"** (input variance is gone)
6. **Frame-pacing feels consistent — no micro-stutters** (P-state pinning + GPU MSI + DXGK latency tolerance)
7. **High-Hz monitors look like high-Hz monitors** instead of "240Hz with hitches that look like 120Hz" (timer resolution + no tickless kernel + GPU P0)

## What this means for you

The Voot/BOHR/TweakingGuy magic isn't a single secret. It's:

- **Tier S of HITREG_LATENCY.md applied carefully** (no shotgun, no aggressive registry kills)
- **A custom power plan with no core parking and no throttling** (this alone is ~30% of the feel)
- **Process pinning for the game to P-cores** (Process Lasso, or just msconfig affinity)
- **MSI mode + interrupt moderation off on NIC, GPU, USB**
- **Timer resolution at 0.5ms permanently**
- **Background work genuinely gone** (services + scheduled tasks + AppX bloat)
- **GPU drivers cleanly installed via NVCleanstall + NVIDIA Profile Inspector with a Low Latency Ultra profile**

When you apply all of those together (which the tool does, via Profile → Competitive FPS + Power tab + manually pinning your game) — that's when people feel the difference.

Single tweaks rarely do it. The compound effect is the feeling.

## What does NOT help (despite the marketing)

- Renaming `smartscreen.exe` — saves 0 ms, removes a security check
- Disabling Plug and Play — breaks USB, doesn't help latency
- Setting `nx AlwaysOff` (DEP off) — modest gain only on very old hardware, big security loss
- Deleting all scheduled tasks via TaskCache tree — breaks Windows Update healing, doesn't add smoothness once telemetry is gone
- Force-disabling `Spooler`/`PlugPlay`/`iphlpsvc` — saves ~50MB RAM, breaks features
- 8000Hz polling mouse without timer resolution + MSI mode + USB power off — actually feels *worse* than 1000Hz
- Disabling IPv6 unless your network is genuinely v4-only

If a tweak makes you feel cool but doesn't move LatencyMon or Reflex numbers, it's not contributing to the feeling. The feeling is measurable. Trust the numbers, not the placebo.
