/**
 * AETHERIUM — src/core/audio.js
 * Fully procedural WebAudio engine. Zero asset files.
 *
 * Design notes
 *  - Master chain:  voices -> bus gain -> duck -> masterPre -> glue comp -> soft clip
 *                   -> limiter -> master -> destination
 *  - Reverb: two convolvers fed from per-bus sends, cross-faded so spaces can morph
 *    ('suit' | 'interior' | 'hall' | 'canyon' | 'cave' | 'void'). IRs generated in dsp.js.
 *  - Music: generative chord engine walking a mode with true voice-leading, detuned
 *    pad stacks under a slow filter LFO, a sparse bell/arp voice through a long
 *    feedback delay, and a sub drone. Tape-style detune drift on everything.
 *  - Every voice registers itself and is stopped + disconnected: no leaked nodes.
 *  - Nothing here throws if WebAudio is unavailable or suspended.
 */

import * as DSP from './dsp.js';

const BUSES = ['music', 'sfx', 'ambient', 'ui'];
const EPS = 0.0001;

/* ================================================================== *
 *  Voice — a disposable bundle of nodes with guaranteed teardown
 * ================================================================== */

class Voice {
  constructor(engine, bus) {
    this.e = engine;
    this.bus = bus;
    this.nodes = [];
    this.srcs = [];
    this.extern = [];
    this.dead = false;
    this.out = null;
    this.send = null;
    this.endTime = 0;
  }
  add(n) { this.nodes.push(n); this.e._nodesAlive++; return n; }
  src(n) { this.srcs.push(n); return this.add(n); }
  /**
   * Connect a node this voice does NOT own (e.g. a shared LFO) into one of our
   * params, remembering the edge so we can tear it down. Incoming connections
   * are not removed by `node.disconnect()`, so without this we would leak.
   */
  link(from, target) {
    try { from.connect(target); this.extern.push([from, target]); } catch (_) { /* noop */ }
    return target;
  }
  /** Stop every source at `t` and schedule disconnection just after. */
  stopAt(t) {
    this.endTime = Math.max(this.endTime, t);
    for (const s of this.srcs) {
      try { if (!s.__stopped) { s.stop(t); s.__stopped = true; } } catch (_) { /* already stopped */ }
    }
    this.e._scheduleKill(this, t + 0.12);
    return this;
  }
  /** Fade out then stop (for continuous voices). */
  release(fade = 0.5) {
    if (this.dead || !this.out || !this.e.ctx) return this;
    const t = this.e.ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(Math.max(EPS, this.out.gain.value), t);
      this.out.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fade));
    } catch (_) { /* noop */ }
    return this.stopAt(t + Math.max(0.02, fade) + 0.05);
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    for (const [from, target] of this.extern) {
      try { from.disconnect(target); } catch (_) { /* noop */ }
    }
    this.extern.length = 0;
    for (const n of this.nodes) {
      try { n.disconnect(); } catch (_) { /* noop */ }
      try { if (n.stop && !n.__stopped) { n.stop(); n.__stopped = true; } } catch (_) { /* noop */ }
    }
    this.e._nodesAlive -= this.nodes.length;
    if (this.e._nodesAlive < 0) this.e._nodesAlive = 0;
    this.nodes.length = 0;
    this.srcs.length = 0;
    this.e._voices.delete(this);
  }
  handle() {
    const v = this;
    return {
      stop: (fade = 0.25) => v.release(fade),
      get done() { return v.dead; },
      voice: v,
    };
  }
}

/* ================================================================== *
 *  Static configuration tables
 * ================================================================== */

const AMBIENCE = {
  'nexus': {
    space: 'hall', level: 0.9,
    beds: [
      { color: 'pink', filter: ['lowpass', 460, 0.8], gain: 0.11, lfo: { rate: 0.045, depth: 200 } },
      { color: 'brown', filter: ['lowpass', 130, 1.0], gain: 0.15 },
    ],
    hums: [{ f: 57.5, g: 0.030, type: 'sine' }, { f: 115.0, g: 0.010, type: 'triangle' }],
    sparse: { every: [3.5, 9], kinds: ['chime', 'whoosh', 'beep'] },
  },
  'space': {
    space: 'void', level: 0.85,
    beds: [
      { color: 'brown', filter: ['lowpass', 72, 0.9], gain: 0.24 },
      { color: 'pink', filter: ['bandpass', 320, 0.45], gain: 0.030, lfo: { rate: 0.021, depth: 160 } },
    ],
    hums: [{ f: 32.7, g: 0.045, type: 'sine' }, { f: 49.0, g: 0.014, type: 'sine' }],
    sparse: { every: [7, 18], kinds: ['whistle', 'sweep'] },
  },
  'surface-rocky': {
    space: 'canyon', level: 1.0,
    beds: [
      { color: 'pink', filter: ['bandpass', 520, 0.55], gain: 0.14, lfo: { rate: 0.085, depth: 340 } },
      { color: 'brown', filter: ['lowpass', 190, 0.8], gain: 0.10 },
    ],
    hums: [],
    sparse: { every: [2.5, 7], kinds: ['gust', 'tick'] },
  },
  'surface-ice': {
    space: 'cave', level: 0.95,
    beds: [
      { color: 'white', filter: ['bandpass', 1500, 0.5], gain: 0.055, lfo: { rate: 0.12, depth: 900 } },
      { color: 'pink', filter: ['lowpass', 300, 0.7], gain: 0.10 },
    ],
    hums: [{ f: 41.2, g: 0.020, type: 'sine' }],
    sparse: { every: [3, 10], kinds: ['creak', 'tick'] },
  },
  'surface-jungle': {
    space: 'hall', level: 1.0,
    beds: [
      { color: 'pink', filter: ['bandpass', 950, 0.4], gain: 0.085, lfo: { rate: 0.14, depth: 420 } },
      { color: 'brown', filter: ['lowpass', 260, 0.7], gain: 0.075 },
    ],
    hums: [],
    sparse: { every: [0.9, 3.2], kinds: ['chirp', 'rustle', 'whistle'] },
  },
  'interior': {
    space: 'interior', level: 0.85,
    beds: [
      { color: 'grey', filter: ['lowpass', 760, 0.7], gain: 0.065 },
      { color: 'brown', filter: ['lowpass', 115, 0.9], gain: 0.13 },
    ],
    hums: [{ f: 50, g: 0.028, type: 'sine' }, { f: 100, g: 0.011, type: 'sine' }, { f: 150, g: 0.004, type: 'triangle' }],
    sparse: { every: [4, 13], kinds: ['beep', 'click', 'whoosh'] },
  },
};

const MOODS = {
  menu: {
    mode: 'aeolian', root: 45, stepDur: 0.75, stepsPerChord: 16, chordSize: 4,
    padLo: 45, padHi: 74, arpProb: 0.10, arpOct: 24, bright: 0.34, sub: 0.10,
    level: 0.70, space: 'hall', padAtk: 3.6, delay: 0.62, fb: 0.42,
  },
  wonder: {
    mode: 'lydian', root: 48, stepDur: 0.90, stepsPerChord: 16, chordSize: 4,
    padLo: 46, padHi: 79, arpProb: 0.17, arpOct: 24, bright: 0.55, sub: 0.13,
    level: 0.62, space: 'void', padAtk: 4.5, delay: 0.75, fb: 0.52,
  },
  tension: {
    mode: 'phrygian', root: 40, stepDur: 0.50, stepsPerChord: 12, chordSize: 4,
    padLo: 33, padHi: 64, arpProb: 0.22, arpOct: 12, bright: 0.20, sub: 0.20,
    level: 0.26, space: 'cave', padAtk: 1.6, delay: 0.33, fb: 0.44, tremolo: 5.5,
  },
  discovery: {
    mode: 'mixolydian', root: 50, stepDur: 0.55, stepsPerChord: 12, chordSize: 4,
    padLo: 48, padHi: 81, arpProb: 0.36, arpOct: 24, bright: 0.60, sub: 0.10,
    level: 0.72, space: 'hall', padAtk: 2.0, delay: 0.41, fb: 0.46,
  },
  warp: {
    mode: 'dorian', root: 43, stepDur: 0.28, stepsPerChord: 16, chordSize: 4,
    padLo: 43, padHi: 79, arpProb: 0.52, arpOct: 24, bright: 0.70, sub: 0.22,
    level: 0.42, space: 'void', padAtk: 1.1, delay: 0.28, fb: 0.55, pulse: 4,
  },
  finale: {
    mode: 'lydian', root: 47, stepDur: 0.80, stepsPerChord: 12, chordSize: 5,
    padLo: 38, padHi: 84, arpProb: 0.30, arpOct: 24, bright: 0.64, sub: 0.18,
    level: 0.52, space: 'hall', padAtk: 3.0, delay: 0.60, fb: 0.50,
  },
};

const FOOTSTEP = {
  rock:  { color: 'brown', filt: ['lowpass', 1500, 2.4], dur: 0.10, atk: 0.001, level: 0.42, click: 0.5, ring: null, rustle: 0.16 },
  sand:  { color: 'pink',  filt: ['lowpass', 3200, 0.9], dur: 0.17, atk: 0.010, level: 0.30, click: 0.0, ring: null, rustle: 0.14 },
  ice:   { color: 'white', filt: ['highpass', 1900, 1.1], dur: 0.11, atk: 0.001, level: 0.30, click: 0.7, ring: [4200, 0.09, 0.10], rustle: 0.12 },
  metal: { color: 'grey',  filt: ['bandpass', 1250, 4.5], dur: 0.13, atk: 0.001, level: 0.34, click: 0.8, ring: [1870, 0.22, 0.16], rustle: 0.10 },
  grass: { color: 'pink',  filt: ['bandpass', 1650, 1.1], dur: 0.13, atk: 0.004, level: 0.26, click: 0.15, ring: null, rustle: 0.20 },
};

/* ================================================================== *
 *  AudioEngine
 * ================================================================== */

export class AudioEngine {
  constructor(opts = {}) {
    this.ctx = null;
    this.ready = false;
    this.available = true;
    this.lastError = null;

    this._initPromise = null;
    this._masterVolume = opts.masterVolume ?? 0.85;
    this._busVolume = Object.assign(
      { music: 0.62, sfx: 0.9, ambient: 0.65, ui: 0.7 },
      opts.buses || {}
    );
    this._defaultSend = { music: 0.30, sfx: 0.20, ambient: 0.26, ui: 0.05 };

    this._voices = new Set();
    this._nodesAlive = 0;
    this._pendingKill = [];
    this._timers = new Set();
    this._noiseCache = new Map();
    this._irCache = new Map();
    this._waves = {};

    this._rngState = DSP.mulberry32(opts.seed ?? 0x5eed);
    this._space = null;
    this._spaceSlot = 0;

    this._amb = null;
    this._music = null;
    this._engineRig = null;
    this._duckUntil = 0;

    this._listener = { pos: [0, 0, 0], fwd: [0, 0, -1], up: [0, 1, 0] };
    this._time = 0;
  }

  /* -------------------------------------------------- lifecycle -- */

  /**
   * Create the AudioContext (must be called from a user gesture on the web).
   * Idempotent — calling twice just resumes a suspended context.
   * @param {object} opts {context} to adopt an existing (or Offline) context.
   */
  async init(opts = {}) {
    if (this.ready) { await this.resume(); return true; }
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._boot(opts).catch((e) => {
      this.lastError = e;
      this.available = false;
      this.ready = false;
      return false;
    });
    return this._initPromise;
  }

  async _boot(opts) {
    const AC = opts.context
      ? null
      : (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext));
    if (!opts.context && !AC) { this.available = false; return false; }

    const ctx = opts.context || new AC({ latencyHint: opts.latencyHint || 'interactive' });
    this.ctx = ctx;
    this._offline = !!(typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext) ||
      ctx.constructor.name === 'OfflineAudioContext';

    this._buildGraph();
    this.ready = true;
    await this.resume();
    return true;
  }

  async resume() {
    if (!this.ctx || this._offline) return;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (_) { /* blocked by policy — fine */ }
    }
  }

  _buildGraph() {
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this._masterVolume;

    // Brickwall-ish limiter (fast, high ratio).
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3.0;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.09;

    // Hard ceiling: a tanh curve can never output beyond its endpoints.
    this.clipGuard = ctx.createWaveShaper();
    this.clipGuard.curve = DSP.tanhCurve(1.25, 0.90);
    this.clipGuard.oversample = '2x';

    // Gentle glue compression.
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -20;
    this.glue.knee.value = 26;
    this.glue.ratio.value = 2.6;
    this.glue.attack.value = 0.008;
    this.glue.release.value = 0.28;

    this.masterPre = ctx.createGain();
    this.masterPre.gain.value = 0.72;

    this.masterPre.connect(this.glue);
    this.glue.connect(this.clipGuard);
    this.clipGuard.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(ctx.destination);

    // Visualisation tap (side-chain, does not affect output).
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;
    try { this.master.connect(this.analyser); } catch (_) { /* noop */ }

    // ---- reverb (two convolvers, cross-faded) ----
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 1;
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 1.0;
    this._conv = [ctx.createConvolver(), ctx.createConvolver()];
    this._wet = [ctx.createGain(), ctx.createGain()];
    for (let i = 0; i < 2; i++) {
      this._conv[i].normalize = false;
      this._wet[i].gain.value = i === 0 ? 1 : 0;
      this.reverbIn.connect(this._conv[i]);
      this._conv[i].connect(this._wet[i]);
      this._wet[i].connect(this.reverbOut);
    }
    // Keep long tails out of the mud.
    this.reverbTone = ctx.createBiquadFilter();
    this.reverbTone.type = 'highpass';
    this.reverbTone.frequency.value = 90;
    this.reverbOut.connect(this.reverbTone);
    this.reverbTone.connect(this.masterPre);

    // ---- buses ----
    this._busGain = {};
    this._sendBus = {};
    this._duck = {};
    this._duckSend = {};
    for (const b of BUSES) {
      const g = ctx.createGain(); g.gain.value = this._busVolume[b];
      const d = ctx.createGain(); d.gain.value = 1;
      g.connect(d); d.connect(this.masterPre);
      const s = ctx.createGain(); s.gain.value = this._busVolume[b];
      const ds = ctx.createGain(); ds.gain.value = 1;
      s.connect(ds); ds.connect(this.reverbIn);
      this._busGain[b] = g; this._duck[b] = d;
      this._sendBus[b] = s; this._duckSend[b] = ds;
    }

    this.setSpace('hall', 0);
    this._waves.pad = DSP.padWave(ctx, 3);
    this._waves.bell = DSP.bellWave(ctx);
  }

  dispose() {
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    if (this._ambTimer) { clearInterval(this._ambTimer); this._ambTimer = null; }
    for (const v of Array.from(this._voices)) v.kill();
    this._voices.clear();
    this._teardownEngineRig();
    this._music = null;
    this._amb = null;
    if (this.ctx && !this._offline && this.ctx.close) {
      try { this.ctx.close(); } catch (_) { /* noop */ }
    }
    this.ctx = null;
    this.ready = false;
    this._initPromise = null;
  }

  /* --------------------------------------------------- mix API --- */

  setMasterVolume(v) {
    this._masterVolume = DSP.clamp(Number(v) || 0, 0, 1);
    if (!this.ready) return;
    this._ramp(this.master.gain, this._masterVolume, 0.05);
  }
  getMasterVolume() { return this._masterVolume; }

  setBus(name, v) {
    if (!BUSES.includes(name)) return;
    const val = DSP.clamp(Number(v) || 0, 0, 1);
    this._busVolume[name] = val;
    if (!this.ready) return;
    this._ramp(this._busGain[name].gain, val, 0.05);
    this._ramp(this._sendBus[name].gain, val, 0.05);
  }
  getBus(name) { return this._busVolume[name] ?? 0; }

  /** Sidechain music + ambient under dialogue. */
  duckFor(seconds = 2, amount = 0.5) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const target = DSP.clamp(1 - amount, 0.02, 1);
    const hold = Math.max(0.05, seconds);
    for (const b of ['music', 'ambient']) {
      for (const node of [this._duck[b], this._duckSend[b]]) {
        const p = node.gain;
        try {
          p.cancelScheduledValues(t);
          p.setValueAtTime(Math.max(EPS, p.value), t);
          p.linearRampToValueAtTime(target, t + 0.12);
          p.setValueAtTime(target, t + hold);
          p.linearRampToValueAtTime(1, t + hold + 0.6);
        } catch (_) { /* noop */ }
      }
    }
    this._duckUntil = t + hold + 0.6;
  }

  getAnalyser() { return this.analyser || null; }
  stats() { return { voices: this._voices.size, nodes: this._nodesAlive, pending: this._pendingKill.length }; }

  /* ---------------------------------------------------- reverb --- */

  /** Crossfade to a named space: 'suit'|'interior'|'hall'|'canyon'|'cave'|'void'. */
  setSpace(name, fade = 1.5) {
    if (!this.ready) return;
    if (this._space === name) return;
    const cfg = DSP.REVERB_SPACES[name];
    if (!cfg) return;
    let ir = this._irCache.get(name);
    if (!ir) {
      try { ir = DSP.makeImpulseResponse(this.ctx, cfg); } catch (e) { this.lastError = e; return; }
      this._irCache.set(name, ir);
    }
    const next = this._spaceSlot ^ 1;
    try { this._conv[next].buffer = ir; } catch (e) { this.lastError = e; return; }
    const t = this.ctx.currentTime;
    const f = Math.max(0.01, fade);
    this._ramp(this._wet[next].gain, 1, f, t);
    this._ramp(this._wet[this._spaceSlot].gain, 0, f, t);
    this._spaceSlot = next;
    this._space = name;
  }
  getSpace() { return this._space; }

  /* ------------------------------------------------- internals --- */

  _rng() { return this._rngState(); }
  _rr(a, b) { return a + (b - a) * this._rngState(); }

  _ramp(param, value, time = 0.05, at = null) {
    if (!param) return;
    const t = at == null ? this.ctx.currentTime : at;
    try {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(value, t + Math.max(0.001, time));
    } catch (_) {
      try { param.value = value; } catch (__) { /* noop */ }
    }
  }

  _noiseBuf(color = 'white') {
    let b = this._noiseCache.get(color);
    if (!b) {
      b = DSP.makeNoiseBuffer(this.ctx, { seconds: 2.5, channels: 2, color, seed: 9001 + color.length * 77 });
      this._noiseCache.set(color, b);
    }
    return b;
  }

  _scheduleKill(voice, when) {
    if (voice.dead) return;
    this._pendingKill.push({ voice, when });
    if (this._offline) return;
    const ms = Math.max(0, (when - this.ctx.currentTime) * 1000) + 40;
    const id = setTimeout(() => {
      this._timers.delete(id);
      voice.kill();
    }, ms);
    this._timers.add(id);
  }

  _sweepKills() {
    if (!this._pendingKill.length || !this.ctx) return;
    const now = this.ctx.currentTime;
    const keep = [];
    for (const p of this._pendingKill) {
      if (p.voice.dead) continue;
      if (p.when <= now) p.voice.kill(); else keep.push(p);
    }
    this._pendingKill = keep;
  }

  /** Create a voice with routing (bus, optional 3D/stereo pan, reverb send). */
  _v(bus, o = {}, def = {}) {
    const ctx = this.ctx;
    const busName = o.bus || def.bus || bus;
    const v = new Voice(this, busName);
    const out = ctx.createGain();
    out.gain.value = 1;
    v.out = out; v.add(out);

    let tail = out;
    const pos = o.pos || def.pos;
    if (pos) {
      const p = ctx.createPanner();
      try {
        p.panningModel = o.hrtf === false ? 'equalpower' : 'HRTF';
        p.distanceModel = 'inverse';
        p.refDistance = o.refDistance ?? 5;
        p.maxDistance = o.maxDistance ?? 800;
        p.rolloffFactor = o.rolloff ?? 1.1;
      } catch (_) { /* noop */ }
      this._setPannerPos(p, pos);
      tail.connect(p); v.add(p); tail = p;
      v.panner = p;
    } else if (o.pan != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = DSP.clamp(o.pan, -1, 1);
      tail.connect(p); v.add(p); tail = p;
    }
    // `dest` lets sub-voices (music pads/bells) route through their rig instead
    // of straight to the bus, so rig-level fades and mood changes affect them.
    tail.connect(o.dest || def.dest || this._busGain[busName] || this._busGain.sfx);

    const rv = o.reverb ?? def.reverb ?? this._defaultSend[busName] ?? 0.15;
    if (rv > 0.0005) {
      const s = ctx.createGain();
      s.gain.value = rv;
      tail.connect(s);
      s.connect(this._sendBus[busName] || this._sendBus.sfx);
      v.add(s); v.send = s;
    }
    this._voices.add(v);
    return v;
  }

  _setPannerPos(p, pos) {
    const x = pos.x ?? pos[0] ?? 0, y = pos.y ?? pos[1] ?? 0, z = pos.z ?? pos[2] ?? 0;
    try {
      if (p.positionX) {
        p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
      } else { p.setPosition(x, y, z); }
    } catch (_) { /* noop */ }
  }

  // node shorthands -------------------------------------------------
  _g(v, val = 1) { const n = this.ctx.createGain(); n.gain.value = val; return v.add(n); }
  _bq(v, type, freq, q = 1, gainDb = 0) {
    const n = this.ctx.createBiquadFilter();
    n.type = type; n.frequency.value = Math.max(10, freq); n.Q.value = q;
    if (gainDb) n.gain.value = gainDb;
    return v.add(n);
  }
  _osc(v, type, freq, t) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.setValueAtTime(Math.max(0.01, freq), t);
    return v.src(o);
  }
  _noise(v, color = 'white', o = {}) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuf(color);
    s.loop = o.loop !== false;
    if (o.rate) s.playbackRate.value = o.rate;
    if (o.offset == null) o.offset = this._rr(0, 1.2);
    s.__offset = o.offset;
    return v.src(s);
  }
  _startNoise(s, t) { try { s.start(t, s.__offset || 0); } catch (_) { try { s.start(t); } catch (__) { /* noop */ } } }

  // envelopes -------------------------------------------------------
  /** Percussive attack/decay envelope (exponential decay, ends exactly at 0). */
  _ad(param, t, peak, atk = 0.004, dec = 0.2) {
    const p = Math.max(EPS * 2, peak);
    const a = Math.max(0.0008, atk);
    const d = Math.max(0.01, dec);
    param.setValueAtTime(EPS, t);
    param.exponentialRampToValueAtTime(p, t + a);
    param.exponentialRampToValueAtTime(EPS, t + a + d);
    param.setValueAtTime(0, t + a + d + 0.001);
    return t + a + d + 0.001;
  }
  /** Attack / sustain / release envelope. */
  _asr(param, t, peak, atk = 0.05, hold = 0.3, rel = 0.4) {
    const p = Math.max(EPS * 2, peak);
    param.setValueAtTime(EPS, t);
    param.exponentialRampToValueAtTime(p, t + Math.max(0.001, atk));
    param.setValueAtTime(p, t + atk + Math.max(0, hold));
    param.exponentialRampToValueAtTime(EPS, t + atk + hold + Math.max(0.01, rel));
    param.setValueAtTime(0, t + atk + hold + rel + 0.001);
    return t + atk + hold + rel + 0.001;
  }
  /** Frequency glide (exponential, safe). */
  _glide(param, t, from, to, dur) {
    param.setValueAtTime(Math.max(0.01, from), t);
    param.exponentialRampToValueAtTime(Math.max(0.01, to), t + Math.max(0.005, dur));
  }

  /* ================================================================ *
   *  One-shots
   * ================================================================ */

  play(name, opts = {}) {
    if (!this.ready || !this.ctx) return null;
    const fn = SHOTS[name];
    if (!fn) return null;
    try {
      const t = this.ctx.currentTime + Math.max(0, opts.delay || 0);
      return fn.call(this, t, opts) || null;
    } catch (e) {
      this.lastError = e;
      return null;
    }
  }

  /** Convenience: names of every available one-shot. */
  static get catalogue() { return Object.keys(SHOTS); }
  get catalogue() { return Object.keys(SHOTS); }

  /* ================================================================ *
   *  Ambience
   * ================================================================ */

  startAmbience(profile) {
    if (!this.ready) return null;
    const cfg = AMBIENCE[profile];
    if (!cfg) return null;
    if (this._amb && this._amb.profile === profile) return this._amb.handleObj;
    this.stopAmbience(1.2);

    const ctx = this.ctx;
    const t = ctx.currentTime;
    const v = this._v('ambient', {}, { reverb: 0.22 });
    v.out.gain.setValueAtTime(EPS, t);
    v.out.gain.linearRampToValueAtTime(cfg.level ?? 1, t + 2.2);

    for (const bed of cfg.beds) {
      const n = this._noise(v, bed.color, { loop: true, rate: 0.85 + this._rr(0, 0.3) });
      const f = this._bq(v, bed.filter[0], bed.filter[1], bed.filter[2]);
      const g = this._g(v, bed.gain);
      n.connect(f); f.connect(g); g.connect(v.out);
      this._startNoise(n, t);
      if (bed.lfo) {
        const lfo = this._osc(v, 'sine', bed.lfo.rate, t);
        const amt = this._g(v, bed.lfo.depth);
        lfo.connect(amt); amt.connect(f.frequency);
        lfo.start(t);
        // Second, slower breath on level.
        const lfo2 = this._osc(v, 'sine', bed.lfo.rate * 0.37 + 0.011, t);
        const amt2 = this._g(v, bed.gain * 0.45);
        lfo2.connect(amt2); amt2.connect(g.gain);
        lfo2.start(t);
      }
    }
    for (const h of cfg.hums || []) {
      const o = this._osc(v, h.type || 'sine', h.f, t);
      const g = this._g(v, h.g);
      const lp = this._bq(v, 'lowpass', h.f * 6, 0.7);
      o.connect(lp); lp.connect(g); g.connect(v.out);
      o.detune.value = this._rr(-6, 6);
      o.start(t);
      const wob = this._osc(v, 'sine', 0.07 + this._rr(0, 0.06), t);
      const wa = this._g(v, h.g * 0.35);
      wob.connect(wa); wa.connect(g.gain); wob.start(t);
    }

    this._amb = {
      profile, cfg, voice: v,
      next: t + this._rr(cfg.sparse.every[0], cfg.sparse.every[1]),
      handleObj: v.handle(),
    };
    if (cfg.space) this.setSpace(cfg.space, 2.0);
    if (!this._offline && !this._ambTimer) {
      this._ambTimer = setInterval(() => {
        try { this._pumpAmbience(this.ctx.currentTime + 1.5); } catch (_) { /* noop */ }
      }, 300);
    }
    this._pumpAmbience(t + 1.5);
    return this._amb.handleObj;
  }

  stopAmbience(fade = 1.0) {
    if (this._amb) {
      this._amb.voice.release(Math.max(0.05, fade));
      this._amb = null;
    }
    if (this._ambTimer) { clearInterval(this._ambTimer); this._ambTimer = null; }
  }

  _pumpAmbience(until) {
    const a = this._amb;
    if (!a || a.voice.dead) return;
    let guard = 0;
    while (a.next < until && guard++ < 256) {
      const kind = DSP.pick(this._rngState, a.cfg.sparse.kinds);
      try { this._ambEvent(kind, a.next); } catch (_) { /* noop */ }
      a.next += this._rr(a.cfg.sparse.every[0], a.cfg.sparse.every[1]);
    }
  }

  _ambEvent(kind, t) {
    const pan = this._rr(-0.8, 0.8);
    const v = this._v('ambient', { pan }, { reverb: 0.5 });
    const g = this._g(v, 0);
    g.connect(v.out);
    switch (kind) {
      case 'chime': {
        const f = DSP.mtof(72 + DSP.pick(this._rngState, [0, 3, 5, 7, 10]));
        const o = this._osc(v, this._waves.bell, f, t);
        const bp = this._bq(v, 'bandpass', f * 1.6, 1.4);
        o.connect(bp); bp.connect(g);
        this._ad(g.gain, t, this._rr(0.03, 0.07), 0.005, 2.2);
        o.start(t); v.stopAt(t + 2.4);
        break;
      }
      case 'beep': {
        const f = this._rr(700, 1500);
        const o = this._osc(v, 'square', f, t);
        const lp = this._bq(v, 'lowpass', f * 2.2, 1);
        o.connect(lp); lp.connect(g);
        this._ad(g.gain, t, 0.022, 0.003, 0.08);
        o.start(t); v.stopAt(t + 0.16);
        break;
      }
      case 'click': {
        const n = this._noise(v, 'white', { loop: false });
        const bp = this._bq(v, 'bandpass', this._rr(1800, 4200), 6);
        n.connect(bp); bp.connect(g);
        this._ad(g.gain, t, 0.03, 0.001, 0.02);
        this._startNoise(n, t); v.stopAt(t + 0.08);
        break;
      }
      case 'whoosh': {
        const n = this._noise(v, 'pink');
        const bp = this._bq(v, 'bandpass', 300, 1.1);
        this._glide(bp.frequency, t, 260, 1500, 1.1);
        bp.frequency.exponentialRampToValueAtTime(300, t + 2.2);
        n.connect(bp); bp.connect(g);
        this._asr(g.gain, t, 0.05, 0.9, 0.2, 1.1);
        this._startNoise(n, t); v.stopAt(t + 2.4);
        break;
      }
      case 'whistle': {
        const f0 = this._rr(900, 2400);
        const o = this._osc(v, 'sine', f0, t);
        this._glide(o.frequency, t, f0, f0 * this._rr(0.55, 1.7), 1.6);
        const bp = this._bq(v, 'bandpass', f0, 3);
        o.connect(bp); bp.connect(g);
        this._asr(g.gain, t, 0.022, 0.5, 0.3, 0.9);
        o.start(t); v.stopAt(t + 1.9);
        break;
      }
      case 'sweep': {
        const o = this._osc(v, 'sawtooth', 60, t);
        this._glide(o.frequency, t, this._rr(40, 90), this._rr(120, 260), 3.0);
        const lp = this._bq(v, 'lowpass', 200, 4);
        this._glide(lp.frequency, t, 150, 700, 3.0);
        o.connect(lp); lp.connect(g);
        this._asr(g.gain, t, 0.05, 1.4, 0.4, 1.6);
        o.start(t); v.stopAt(t + 3.6);
        break;
      }
      case 'gust': {
        const n = this._noise(v, 'pink');
        const bp = this._bq(v, 'bandpass', 400, 0.7);
        const dur = this._rr(2.0, 4.5);
        this._glide(bp.frequency, t, 330, this._rr(800, 1800), dur * 0.45);
        bp.frequency.exponentialRampToValueAtTime(320, t + dur);
        n.connect(bp); bp.connect(g);
        this._asr(g.gain, t, this._rr(0.06, 0.13), dur * 0.4, dur * 0.15, dur * 0.5);
        this._startNoise(n, t); v.stopAt(t + dur * 1.2);
        break;
      }
      case 'tick': {
        const n = this._noise(v, 'grey', { loop: false });
        const bp = this._bq(v, 'bandpass', this._rr(600, 2600), 8);
        n.connect(bp); bp.connect(g);
        this._ad(g.gain, t, this._rr(0.02, 0.05), 0.001, 0.035);
        this._startNoise(n, t); v.stopAt(t + 0.1);
        break;
      }
      case 'creak': {
        const o = this._osc(v, 'sawtooth', 90, t);
        const f0 = this._rr(70, 160);
        this._glide(o.frequency, t, f0, f0 * this._rr(1.2, 2.2), 1.4);
        const bp = this._bq(v, 'bandpass', 340, 9);
        this._glide(bp.frequency, t, 300, 900, 1.4);
        o.connect(bp); bp.connect(g);
        this._asr(g.gain, t, 0.035, 0.25, 0.5, 0.7);
        o.start(t); v.stopAt(t + 1.7);
        break;
      }
      case 'chirp': {
        const f0 = this._rr(1600, 3600);
        const o = this._osc(v, 'sine', f0, t);
        const n = 2 + Math.floor(this._rr(0, 3));
        for (let i = 0; i < n; i++) {
          const tt = t + i * this._rr(0.06, 0.12);
          o.frequency.setValueAtTime(f0 * this._rr(0.85, 1.2), tt);
          o.frequency.exponentialRampToValueAtTime(f0 * this._rr(1.1, 1.6), tt + 0.045);
        }
        const bp = this._bq(v, 'bandpass', f0, 4);
        o.connect(bp); bp.connect(g);
        const total = n * 0.11;
        g.gain.setValueAtTime(0, t);
        for (let i = 0; i < n; i++) {
          const tt = t + i * 0.11;
          g.gain.setValueAtTime(EPS, tt);
          g.gain.exponentialRampToValueAtTime(0.05, tt + 0.008);
          g.gain.exponentialRampToValueAtTime(EPS, tt + 0.09);
        }
        g.gain.setValueAtTime(0, t + total + 0.05);
        o.start(t); v.stopAt(t + total + 0.12);
        break;
      }
      case 'rustle':
      default: {
        const n = this._noise(v, 'pink');
        const bp = this._bq(v, 'bandpass', this._rr(900, 2400), 1.6);
        n.connect(bp); bp.connect(g);
        this._asr(g.gain, t, 0.045, 0.08, 0.12, 0.35);
        this._startNoise(n, t); v.stopAt(t + 0.7);
        break;
      }
    }
    return v;
  }

  /* ================================================================ *
   *  Ship engine (continuous)
   * ================================================================ */

  _ensureEngineRig() {
    if (this._engineRig || !this.ready) return this._engineRig;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const v = this._v('sfx', {}, { reverb: 0.10 });
    v.out.gain.value = 1;

    const body = this._g(v, 1);
    const lp = this._bq(v, 'lowpass', 260, 3.2);
    body.connect(lp); lp.connect(v.out);

    // Harmonic core: three detuned saws + a sub sine.
    const oscs = [];
    const base = 46;
    [1, 1.5, 2.0, 3.0].forEach((mult, i) => {
      const o = this._osc(v, i === 0 ? 'sine' : 'sawtooth', base * mult, t);
      o.detune.value = (i - 1.5) * 7;
      const g = this._g(v, i === 0 ? 0.55 : 0.20 / (i));
      o.connect(g); g.connect(body);
      o.start(t);
      oscs.push({ o, g, mult });
    });
    // Slow drift so it never sounds static.
    const drift = this._osc(v, 'sine', 0.09, t);
    const driftAmt = this._g(v, 5);
    drift.connect(driftAmt);
    for (const x of oscs) driftAmt.connect(x.o.detune);
    drift.start(t);

    // Turbine noise.
    const nz = this._noise(v, 'pink');
    const nbp = this._bq(v, 'bandpass', 700, 1.1);
    const ng = this._g(v, 0);
    nz.connect(nbp); nbp.connect(ng); ng.connect(v.out);
    this._startNoise(nz, t);

    // Warp layer — rising resonant shimmer.
    const wOsc1 = this._osc(v, 'sawtooth', 80, t);
    const wOsc2 = this._osc(v, 'sawtooth', 120.7, t);
    const wnz = this._noise(v, 'white');
    const wMix = this._g(v, 1);
    const wFilt = this._bq(v, 'bandpass', 400, 7);
    const wGain = this._g(v, 0);
    wOsc1.connect(wMix); wOsc2.connect(wMix);
    const wnzg = this._g(v, 0.35);
    wnz.connect(wnzg); wnzg.connect(wMix);
    wMix.connect(wFilt); wFilt.connect(wGain); wGain.connect(v.out);
    wOsc1.start(t); wOsc2.start(t); this._startNoise(wnz, t);

    const wSend = this._g(v, 0.5);
    wGain.connect(wSend); wSend.connect(this._sendBus.sfx);

    body.gain.value = 0.0001;
    this._engineRig = {
      voice: v, oscs, body, lp, ng, nbp, wOsc1, wOsc2, wFilt, wGain, base,
      throttle: 0, warp: 0,
    };
    return this._engineRig;
  }

  _teardownEngineRig() {
    if (this._engineRig) {
      this._engineRig.voice.kill();
      this._engineRig = null;
    }
  }

  /**
   * Continuous ship engine. Everything uses setTargetAtTime — no zipper noise.
   */
  setEngine(throttle01, warp01 = 0) {
    if (!this.ready) return;
    const T = DSP.clamp(Number(throttle01) || 0, 0, 1);
    const W = DSP.clamp(Number(warp01) || 0, 0, 1);
    const rig = this._ensureEngineRig();
    if (!rig) return;
    rig.throttle = T; rig.warp = W;
    const t = this.ctx.currentTime;
    const tc = 0.10;

    // Idle hum always present once the rig exists; opens up with throttle.
    const level = 0.018 + 0.145 * Math.pow(T, 0.85);
    rig.body.gain.setTargetAtTime(level, t, tc);
    rig.lp.frequency.setTargetAtTime(180 + 2600 * Math.pow(T, 1.15) + 1800 * W, t, tc);
    rig.lp.Q.setTargetAtTime(2.5 + 5 * T, t, tc * 2);

    const f = rig.base * (1 + 0.85 * T + 0.5 * W);
    for (const x of rig.oscs) {
      x.o.frequency.setTargetAtTime(f * x.mult, t, tc * 1.6);
      // Upper partials fade in with throttle -> harmonic content "opens".
      if (x.mult > 1) x.g.gain.setTargetAtTime((0.05 + 0.26 * T) / x.mult, t, tc);
    }
    rig.ng.gain.setTargetAtTime(0.012 + 0.085 * T + 0.05 * W, t, tc);
    rig.nbp.frequency.setTargetAtTime(500 + 3400 * T + 2500 * W, t, tc);

    // Warp layer builds — pitch, resonance and level all climb together.
    rig.wGain.gain.setTargetAtTime(0.14 * Math.pow(W, 1.4), t, 0.16);
    rig.wFilt.frequency.setTargetAtTime(300 + 4200 * Math.pow(W, 1.6), t, 0.16);
    rig.wFilt.Q.setTargetAtTime(6 + 14 * W, t, 0.2);
    rig.wOsc1.frequency.setTargetAtTime(70 + 400 * W * W, t, 0.25);
    rig.wOsc2.frequency.setTargetAtTime(105 + 610 * W * W, t, 0.25);
  }

  stopEngine(fade = 0.6) {
    if (!this._engineRig) return;
    const rig = this._engineRig;
    this._engineRig = null;
    rig.voice.release(fade);
  }

  /* ================================================================ *
   *  Generative music
   * ================================================================ */

  startMusic(mood = 'wonder') {
    if (!this.ready) return;
    const cfg = MOODS[mood] || MOODS.wonder;
    if (this._music && this._music.mood === mood && this._music.playing) return;

    const t = this.ctx.currentTime;
    if (this._music && this._music.playing) {
      // Soft hand-off: release the running pads, retune the rig, keep going.
      this._music.cfg = cfg;
      this._music.mood = mood;
      this._music.rng = DSP.mulberry32(((this._rng() * 1e9) | 0) || 7);
      this._music.degree = 0;
      this._music.voicing = [];
      this._music.step = 0;
      this._music.next = t + 0.05;
      this._applyMusicMood(cfg, t, 2.5);
      if (cfg.space) this.setSpace(cfg.space, 3.0);
      return;
    }

    const m = this._buildMusicRig(cfg, t);
    m.mood = mood;
    this._music = m;
    if (cfg.space) this.setSpace(cfg.space, 3.0);
    if (!this._offline && !this._musicTimer) {
      this._musicTimer = setInterval(() => {
        try { this._pumpMusic(this.ctx.currentTime + 1.2); } catch (_) { /* noop */ }
      }, 200);
    }
    this._pumpMusic(t + 1.2);
  }

  _buildMusicRig(cfg, t) {
    const ctx = this.ctx;
    const v = this._v('music', {}, { reverb: 0.42 });
    v.out.gain.setValueAtTime(EPS, t);
    v.out.gain.linearRampToValueAtTime(cfg.level, t + 3.0);

    const padBus = this._g(v, 1);
    const padTone = this._bq(v, 'highpass', 60, 0.7);
    padBus.connect(padTone); padTone.connect(v.out);

    const arpBus = this._g(v, 1);
    arpBus.connect(v.out);

    // Long feedback delay for the bell voice.
    const delay = v.add(ctx.createDelay(4.0));
    delay.delayTime.value = cfg.delay;
    const fb = this._g(v, cfg.fb);
    const fbFilt = this._bq(v, 'lowpass', 2600, 0.8);
    const fbHp = this._bq(v, 'highpass', 220, 0.7);
    const delayOut = this._g(v, 0.55);
    arpBus.connect(delay);
    delay.connect(fbFilt); fbFilt.connect(fbHp); fbHp.connect(fb); fb.connect(delay);
    delay.connect(delayOut); delayOut.connect(v.out);
    // Delay tail gets extra space.
    const delaySend = this._g(v, 0.5);
    delayOut.connect(delaySend); delaySend.connect(this._sendBus.music);

    // Shared slow filter LFO for the pads (one node, many targets).
    const filtLfo = this._osc(v, 'sine', 0.043, t);
    const filtLfoAmt = this._g(v, 600);
    filtLfo.connect(filtLfoAmt); filtLfo.start(t);
    const filtLfo2 = this._osc(v, 'sine', 0.0171, t);
    const filtLfoAmt2 = this._g(v, 320);
    filtLfo2.connect(filtLfoAmt2); filtLfo2.start(t);

    // Tape-style detune drift (two incommensurate LFOs -> pseudo-random wow).
    const drift = this._osc(v, 'sine', 0.061, t);
    const driftAmt = this._g(v, 4.5);
    drift.connect(driftAmt); drift.start(t);
    const drift2 = this._osc(v, 'sine', 0.0233, t);
    const driftAmt2 = this._g(v, 3.0);
    drift2.connect(driftAmt2); drift2.start(t);

    // Sub drone (two slightly beating sines).
    const subG = this._g(v, 0);
    const subLp = this._bq(v, 'lowpass', 140, 0.9);
    subG.connect(subLp); subLp.connect(v.out);
    const sub1 = this._osc(v, 'sine', DSP.mtof(cfg.root - 24), t);
    const sub2 = this._osc(v, 'sine', DSP.mtof(cfg.root - 24) * 1.003, t);
    const s1g = this._g(v, 0.7), s2g = this._g(v, 0.45);
    sub1.connect(s1g); s1g.connect(subG);
    sub2.connect(s2g); s2g.connect(subG);
    sub1.start(t); sub2.start(t);
    subG.gain.setValueAtTime(EPS, t);
    subG.gain.linearRampToValueAtTime(cfg.sub, t + 6);
    const subWob = this._osc(v, 'sine', 0.037, t);
    const subWobAmt = this._g(v, cfg.sub * 0.3);
    subWob.connect(subWobAmt); subWobAmt.connect(subG.gain); subWob.start(t);

    return {
      cfg, voice: v, padBus, arpBus, delay, fb, delayOut,
      filtLfoAmt, filtLfoAmt2, driftAmt, driftAmt2,
      sub1, sub2, subG, subWobAmt,
      rng: DSP.mulberry32(((this._rng() * 1e9) | 0) || 11),
      degree: 0, voicing: [], step: 0, next: t + 0.05, playing: true,
    };
  }

  _applyMusicMood(cfg, t, glide = 2.0) {
    const m = this._music;
    if (!m) return;
    m.voice.out.gain.cancelScheduledValues(t);
    m.voice.out.gain.setValueAtTime(Math.max(EPS, m.voice.out.gain.value), t);
    m.voice.out.gain.linearRampToValueAtTime(cfg.level, t + glide);
    m.delay.delayTime.setTargetAtTime(cfg.delay, t, 0.4);
    m.fb.gain.setTargetAtTime(cfg.fb, t, 0.4);
    m.subG.gain.cancelScheduledValues(t);
    m.subG.gain.setTargetAtTime(cfg.sub, t, 1.5);
    m.subWobAmt.gain.setTargetAtTime(cfg.sub * 0.3, t, 1.5);
    m.sub1.frequency.setTargetAtTime(DSP.mtof(cfg.root - 24), t, 1.2);
    m.sub2.frequency.setTargetAtTime(DSP.mtof(cfg.root - 24) * 1.003, t, 1.2);
  }

  stopMusic(fade = 2) {
    const m = this._music;
    if (!m) return;
    m.playing = false;
    this._music = null;
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    m.voice.release(Math.max(0.1, fade));
  }

  _pumpMusic(until) {
    const m = this._music;
    if (!m || !m.playing || m.voice.dead) return;
    let guard = 0;
    while (m.next < until && guard++ < 512) {
      try { this._musicStep(m, m.next, m.step); } catch (e) { this.lastError = e; }
      m.step++;
      m.next += m.cfg.stepDur;
    }
  }

  _musicStep(m, t, step) {
    const cfg = m.cfg;
    const spc = cfg.stepsPerChord;

    if (step % spc === 0) {
      // ---- new chord: walk the mode, then voice-lead to nearest tones ----
      if (step > 0) m.degree = DSP.nextDegree(m.rng, m.degree);
      const pcs = DSP.buildChord(cfg.mode, m.degree, cfg.chordSize);
      const voicing = DSP.voiceLead(m.voicing, cfg.root, pcs, {
        lo: cfg.padLo, hi: cfg.padHi, maxLeap: 7,
      });
      m.voicing = voicing;
      m.chordPcs = pcs;
      const dur = cfg.stepDur * spc;
      for (let i = 0; i < voicing.length; i++) {
        this._padNote(m, t + i * 0.05 * m.rng(), voicing[i], dur, i / Math.max(1, voicing.length - 1));
      }
      // Sub follows the chord root, smoothly.
      const rootNote = cfg.root - 24 + DSP.degreeToSemitone(cfg.mode, m.degree);
      m.sub1.frequency.setTargetAtTime(DSP.mtof(rootNote), t, 1.4);
      m.sub2.frequency.setTargetAtTime(DSP.mtof(rootNote) * 1.003, t, 1.4);
    }

    // ---- sparse bell / arpeggio ----
    const beat = step % spc;
    let p = cfg.arpProb;
    if (beat % 4 === 0) p *= 1.6;              // land more often on strong beats
    if (beat % 2 === 1) p *= 0.5;
    if (m.rng() < p && m.voicing.length) {
      const idx = Math.floor(m.rng() * m.voicing.length);
      let note = m.voicing[idx] + cfg.arpOct;
      if (m.rng() < 0.25) note += 12;
      if (note > 100) note -= 12;
      this._bellNote(m, t, note, 0.055 + 0.05 * m.rng());
    }

    // ---- rhythmic pulse (warp) ----
    if (cfg.pulse && step % cfg.pulse === 0) {
      this._musicPulse(m, t);
    }
  }

  _padNote(m, t, midi, dur, spread) {
    const cfg = m.cfg;
    // Routed into the rig's pad bus (reverb is taken once, at the rig).
    const v = this._v('music', {}, { reverb: 0, dest: m.padBus });
    const f = DSP.mtof(midi);
    const pan = (spread - 0.5) * 1.3;
    const out = v.out;
    out.gain.value = 1;

    const filt = this._bq(v, 'lowpass', 300 + 2600 * cfg.bright, 1.6);
    v.link(m.filtLfoAmt, filt.frequency);
    v.link(m.filtLfoAmt2, filt.frequency);
    const amp = this._g(v, 0);
    filt.connect(amp);

    let tail = amp;
    if (this.ctx.createStereoPanner) {
      const sp = this.ctx.createStereoPanner();
      sp.pan.value = DSP.clamp(pan, -1, 1);
      v.add(sp);
      amp.connect(sp); tail = sp;
    }
    tail.connect(out);

    // Detuned stack: 2 saws + 1 triangle + wavetable pad.
    const layers = [
      { type: 'sawtooth', det: -7.5, g: 0.20 },
      { type: 'sawtooth', det: +7.5, g: 0.20 },
      { type: 'triangle', det: -0.5, g: 0.26 },
      { type: this._waves.pad, det: +3.0, g: 0.22 },
    ];
    for (const L of layers) {
      const o = this._osc(v, L.type, f, t);
      o.detune.setValueAtTime(L.det + this._rr(-2, 2), t);
      v.link(m.driftAmt, o.detune);
      v.link(m.driftAmt2, o.detune);
      const g = this._g(v, L.g);
      o.connect(g); g.connect(filt);
      o.start(t);
    }

    const atk = cfg.padAtk * (0.8 + 0.4 * m.rng());
    const rel = dur * 0.95;
    const peak = 0.115 * (1 - 0.28 * spread);
    amp.gain.setValueAtTime(EPS, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + atk);
    amp.gain.exponentialRampToValueAtTime(peak * 0.6, t + atk + dur * 0.35);
    amp.gain.exponentialRampToValueAtTime(EPS, t + atk + dur * 0.35 + rel);
    amp.gain.setValueAtTime(0, t + atk + dur * 0.35 + rel + 0.01);

    if (cfg.tremolo) {
      const tr = this._osc(v, 'sine', cfg.tremolo * (0.8 + 0.4 * m.rng()), t);
      const trg = this._g(v, 0.35);
      tr.connect(trg); trg.connect(amp.gain); tr.start(t);
    }
    v.stopAt(t + atk + dur * 0.35 + rel + 0.1);
    return v;
  }

  _bellNote(m, t, midi, level) {
    // Into the rig's arp bus: that feeds both the dry path and the long delay.
    const v = this._v('music', { pan: this._rr(-0.7, 0.7) }, { reverb: 0, dest: m.arpBus });
    const f = DSP.mtof(midi);
    const amp = this._g(v, 0);
    const bp = this._bq(v, 'bandpass', f * 1.5, 1.1);
    bp.connect(amp);
    amp.connect(v.out);

    const o = this._osc(v, this._waves.bell, f, t);
    v.link(m.driftAmt, o.detune);
    const o2 = this._osc(v, 'sine', f * 2.005, t);
    const g2 = this._g(v, 0.32);
    o.connect(bp); o2.connect(g2); g2.connect(bp);
    o.start(t); o2.start(t);

    const dec = 1.6 + 1.8 * m.rng();
    this._ad(amp.gain, t, level, 0.004, dec);
    v.stopAt(t + dec + 0.15);
    return v;
  }

  _musicPulse(m, t) {
    const v = this._v('music', {}, { reverb: 0, dest: m.voice.out });
    const g = this._g(v, 0);
    const lp = this._bq(v, 'lowpass', 220, 3);
    g.connect(lp); lp.connect(v.out);
    const o = this._osc(v, 'sine', DSP.mtof(m.cfg.root - 12), t);
    this._glide(o.frequency, t, DSP.mtof(m.cfg.root - 12), DSP.mtof(m.cfg.root - 24), 0.22);
    o.connect(g);
    this._ad(g.gain, t, 0.10, 0.004, 0.30);
    o.start(t); v.stopAt(t + 0.4);
    return v;
  }

  /* ================================================================ *
   *  Per-frame update
   * ================================================================ */

  update(dt = 0.016, listenerState = null) {
    if (!this.ready || !this.ctx) return;
    this._time += dt;
    this._sweepKills();
    try {
      const look = this.ctx.currentTime + 1.0;
      this._pumpMusic(look);
      this._pumpAmbience(look);
    } catch (e) { this.lastError = e; }

    if (listenerState) this._updateListener(listenerState);
  }

  _updateListener(ls) {
    const L = this.ctx.listener;
    if (!L) return;
    const p = ls.pos || ls.position || [0, 0, 0];
    const px = p.x ?? p[0] ?? 0, py = p.y ?? p[1] ?? 0, pz = p.z ?? p[2] ?? 0;

    let fwd = [0, 0, -1], up = [0, 1, 0];
    const q = ls.quat || ls.quaternion;
    if (q) {
      const qx = q.x ?? q[0] ?? 0, qy = q.y ?? q[1] ?? 0, qz = q.z ?? q[2] ?? 0, qw = q.w ?? q[3] ?? 1;
      fwd = rotateByQuat(0, 0, -1, qx, qy, qz, qw);
      up = rotateByQuat(0, 1, 0, qx, qy, qz, qw);
    } else if (ls.forward) {
      const f = ls.forward;
      fwd = [f.x ?? f[0] ?? 0, f.y ?? f[1] ?? 0, f.z ?? f[2] ?? -1];
    }

    this._listener.pos = [px, py, pz];
    this._listener.fwd = fwd;
    this._listener.up = up;

    try {
      if (L.positionX) {
        const t = this.ctx.currentTime;
        const k = 0.02;
        L.positionX.setTargetAtTime(px, t, k);
        L.positionY.setTargetAtTime(py, t, k);
        L.positionZ.setTargetAtTime(pz, t, k);
        L.forwardX.setTargetAtTime(fwd[0], t, k);
        L.forwardY.setTargetAtTime(fwd[1], t, k);
        L.forwardZ.setTargetAtTime(fwd[2], t, k);
        L.upX.setTargetAtTime(up[0], t, k);
        L.upY.setTargetAtTime(up[1], t, k);
        L.upZ.setTargetAtTime(up[2], t, k);
      } else {
        L.setPosition(px, py, pz);
        L.setOrientation(fwd[0], fwd[1], fwd[2], up[0], up[1], up[2]);
      }
    } catch (_) { /* noop */ }
  }
}

/* ------------------------------------------------------------------ */

function rotateByQuat(vx, vy, vz, x, y, z, w) {
  // v + 2 * cross(q.xyz, cross(q.xyz, v) + w*v)
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

/* ================================================================== *
 *  One-shot catalogue — every entry is designed, not just "a beep".
 *  `this` === AudioEngine
 * ================================================================== */

const SHOTS = {

  /* ---------------------------------------------------------- UI -- */

  'ui.hover'(t, o) {
    const v = this._v('ui', o, { reverb: 0.02 });
    const g = this._g(v, 0); g.connect(v.out);
    const bp = this._bq(v, 'bandpass', 2350, 2.6);
    bp.connect(g);
    const osc = this._osc(v, 'triangle', 1980 * this._rr(0.98, 1.02), t);
    osc.connect(bp);
    this._ad(g.gain, t, 0.055 * (o.gain ?? 1), 0.003, 0.045);
    osc.start(t);
    return v.stopAt(t + 0.08).handle();
  },

  'ui.click'(t, o) {
    const v = this._v('ui', o, { reverb: 0.04 });
    const g = this._g(v, 0); g.connect(v.out);
    // Tonal body — a quick downward fifth.
    const osc = this._osc(v, 'triangle', 1180, t);
    this._glide(osc.frequency, t, 1180, 780, 0.045);
    const lp = this._bq(v, 'lowpass', 3600, 1.0);
    osc.connect(lp); lp.connect(g);
    this._ad(g.gain, t, 0.11 * (o.gain ?? 1), 0.002, 0.055);
    osc.start(t);
    // Transient tick for definition.
    const ng = this._g(v, 0); ng.connect(v.out);
    const n = this._noise(v, 'white', { loop: false });
    const hp = this._bq(v, 'highpass', 3200, 0.9);
    n.connect(hp); hp.connect(ng);
    this._ad(ng.gain, t, 0.05 * (o.gain ?? 1), 0.0008, 0.012);
    this._startNoise(n, t);
    return v.stopAt(t + 0.1).handle();
  },

  'ui.back'(t, o) {
    const v = this._v('ui', o, { reverb: 0.05 });
    const g = this._g(v, 0); g.connect(v.out);
    const lp = this._bq(v, 'lowpass', 2600, 0.9);
    lp.connect(g);
    const osc = this._osc(v, 'triangle', 720, t);
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.045);
    osc.frequency.setValueAtTime(500, t + 0.055);
    osc.frequency.exponentialRampToValueAtTime(486, t + 0.11);
    osc.connect(lp);
    const gg = g.gain;
    gg.setValueAtTime(EPS, t);
    gg.exponentialRampToValueAtTime(0.085 * (o.gain ?? 1), t + 0.003);
    gg.exponentialRampToValueAtTime(0.012, t + 0.05);
    gg.setValueAtTime(0.08 * (o.gain ?? 1), t + 0.056);
    gg.exponentialRampToValueAtTime(EPS, t + 0.16);
    gg.setValueAtTime(0, t + 0.17);
    osc.start(t);
    return v.stopAt(t + 0.2).handle();
  },

  'ui.confirm'(t, o) {
    const v = this._v('ui', o, { reverb: 0.22 });
    const mk = (f, tt, lvl, dec) => {
      const g = this._g(v, 0); g.connect(v.out);
      const bp = this._bq(v, 'bandpass', f * 1.4, 1.2);
      bp.connect(g);
      const a = this._osc(v, this._waves.bell, f, tt);
      const b = this._osc(v, 'sine', f * 2.01, tt);
      const bg = this._g(v, 0.3);
      a.connect(bp); b.connect(bg); bg.connect(bp);
      this._ad(g.gain, tt, lvl * (o.gain ?? 1), 0.003, dec);
      a.start(tt); b.start(tt);
    };
    mk(784, t, 0.10, 0.30);            // G5
    mk(1174.7, t + 0.075, 0.085, 0.42); // D6 — a rising fifth
    // Warm sub confirming the interval.
    const sg = this._g(v, 0); sg.connect(v.out);
    const s = this._osc(v, 'sine', 196, t);
    const slp = this._bq(v, 'lowpass', 420, 0.8);
    s.connect(slp); slp.connect(sg);
    this._ad(sg.gain, t, 0.075, 0.006, 0.28);
    s.start(t);
    return v.stopAt(t + 0.62).handle();
  },

  'ui.error'(t, o) {
    const v = this._v('ui', o, { reverb: 0.10 });
    const g = this._g(v, 0); g.connect(v.out);
    const lp = this._bq(v, 'lowpass', 950, 3.5);
    lp.connect(g);
    // Minor-second dyad = instantly reads as "wrong", without being shrill.
    for (const [f, d] of [[174.6, 0], [185.0, +4]]) {
      const osc = this._osc(v, 'square', f, t);
      osc.detune.value = d;
      const og = this._g(v, 0.5);
      osc.connect(og); og.connect(lp);
      osc.start(t);
    }
    const gg = g.gain;
    gg.setValueAtTime(EPS, t);
    gg.exponentialRampToValueAtTime(0.12 * (o.gain ?? 1), t + 0.006);
    gg.exponentialRampToValueAtTime(0.03, t + 0.09);
    gg.exponentialRampToValueAtTime(0.09 * (o.gain ?? 1), t + 0.11);
    gg.exponentialRampToValueAtTime(EPS, t + 0.30);
    gg.setValueAtTime(0, t + 0.31);
    this._glide(lp.frequency, t, 1100, 420, 0.30);
    return v.stopAt(t + 0.36).handle();
  },

  'ui.tab'(t, o) {
    const v = this._v('ui', o, { reverb: 0.03 });
    const g = this._g(v, 0); g.connect(v.out);
    const bp = this._bq(v, 'bandpass', 1550 * this._rr(0.96, 1.06), 5.5);
    bp.connect(g);
    const n = this._noise(v, 'grey', { loop: false });
    n.connect(bp);
    this._ad(g.gain, t, 0.075 * (o.gain ?? 1), 0.0008, 0.028);
    this._startNoise(n, t);
    const g2 = this._g(v, 0); g2.connect(v.out);
    const osc = this._osc(v, 'sine', 1320, t);
    osc.connect(g2);
    this._ad(g2.gain, t, 0.035 * (o.gain ?? 1), 0.002, 0.03);
    osc.start(t);
    return v.stopAt(t + 0.07).handle();
  },

  /* -------------------------------------------------------- scan -- */

  'scan.start'(t, o) {
    const v = this._v('sfx', o, { reverb: 0.22 });
    const g = this._g(v, 0); g.connect(v.out);
    const bp = this._bq(v, 'bandpass', 300, 5);
    bp.connect(g);
    const osc = this._osc(v, 'sawtooth', 220, t);
    this._glide(osc.frequency, t, 220, 1180, 0.36);
    this._glide(bp.frequency, t, 320, 2600, 0.36);
    osc.connect(bp);
    this._asr(g.gain, t, 0.17 * (o.gain ?? 1), 0.02, 0.20, 0.18);
    osc.start(t);
    // Air.
    const ng = this._g(v, 0); ng.connect(v.out);
    const n = this._noise(v, 'pink');
    const nb = this._bq(v, 'bandpass', 600, 1.4);
    this._glide(nb.frequency, t, 600, 4200, 0.4);
    n.connect(nb); nb.connect(ng);
    this._asr(ng.gain, t, 0.075, 0.06, 0.16, 0.22);
    this._startNoise(n, t);
    return v.stopAt(t + 0.62).handle();
  },

  'scan.loop'(t, o) {
    const dur = Math.max(0.2, o.duration ?? 1.6);
    const v = this._v('sfx', o, { reverb: 0.25 });
    const g = this._g(v, 0);
    const bp = this._bq(v, 'bandpass', 700, 6);
    bp.connect(g);
    const osc = this._osc(v, 'triangle', 620, t);
    osc.connect(bp);
    const osc2 = this._osc(v, 'sine', 930, t);
    const g2 = this._g(v, 0.35);
    osc2.connect(g2); g2.connect(bp);
    // Pulsing amplitude + slow filter sweep = "working" feel.
    const lfo = this._osc(v, 'sine', 6.5, t);
    const lfoAmt = this._g(v, 0.5);
    lfo.connect(lfoAmt);
    const amp = this._g(v, 0.5);
    lfoAmt.connect(amp.gain);
    g.connect(amp); amp.connect(v.out);
    g.gain.setValueAtTime(0, t);
    this._asr(g.gain, t, 0.075 * (o.gain ?? 1), 0.06, Math.max(0.02, dur - 0.2), 0.14);
    const sweep = this._osc(v, 'sine', 0.7, t);
    const sweepAmt = this._g(v, 380);
    sweep.connect(sweepAmt); sweepAmt.connect(bp.frequency);
    osc.start(t); osc2.start(t); lfo.start(t); sweep.start(t);
    return v.stopAt(t + dur + 0.25).handle();
  },

  'scan.success'(t, o) {
    const v = this._v('sfx', o, { reverb: 0.40 });
    // Bright, resolving interval: fifth -> octave.
    const mk = (f, tt, lvl, dec) => {
      const g = this._g(v, 0); g.connect(v.out);
      const a = this._osc(v, this._waves.bell, f, tt);
      const b = this._osc(v, 'sine', f * 3.01, tt);
      const bg = this._g(v, 0.18);
      const bp = this._bq(v, 'bandpass', f * 1.7, 1.0);
      a.connect(bp); b.connect(bg); bg.connect(bp); bp.connect(g);
      this._ad(g.gain, tt, lvl * (o.gain ?? 1), 0.003, dec);
      a.start(tt); b.start(tt);
    };
    mk(880, t, 0.085, 0.5);
    mk(1318.5, t + 0.06, 0.075, 0.6);
    mk(1760, t + 0.14, 0.09, 1.0);
    // Airy rise underneath.
    const ng = this._g(v, 0); ng.connect(v.out);
    const n = this._noise(v, 'white');
    const nb = this._bq(v, 'bandpass', 2000, 1.6);
    this._glide(nb.frequency, t, 1800, 7000, 0.45);
    n.connect(nb); nb.connect(ng);
    this._asr(ng.gain, t, 0.028, 0.12, 0.06, 0.35);
    this._startNoise(n, t);
    return v.stopAt(t + 1.35).handle();
  },

  /* ---------------------------------------------------- discovery -- */

  'discover.minor'(t, o) {
    const v = this._v('sfx', o, { reverb: 0.45 });
    const notes = [72, 76, 79];
    notes.forEach((m, i) => {
      const tt = t + i * 0.11;
      const f = DSP.mtof(m);
      const g = this._g(v, 0); g.connect(v.out);
      const bp = this._bq(v, 'bandpass', f * 1.5, 1.1);
      bp.connect(g);
      const a = this._osc(v, this._waves.bell, f, tt);
      const b = this._osc(v, 'sine', f * 2.01, tt);
      const bg = this._g(v, 0.25);
      a.connect(bp); b.connect(bg); bg.connect(bp);
      this._ad(g.gain, tt, 0.075 * (o.gain ?? 1), 0.004, 1.1 + i * 0.25);
      a.start(tt); b.start(tt);
    });
    return v.stopAt(t + 2.0).handle();
  },

  'discover.major'(t, o) {
    const v = this._v('sfx', o, { reverb: 0.6 });
    // Rising lydian figure.
    const notes = [67, 71, 74, 78, 81];
    notes.forEach((m, i) => {
      const tt = t + i * 0.13;
      const f = DSP.mtof(m);
      const g = this._g(v, 0); g.connect(v.out);
      const bp = this._bq(v, 'bandpass', f * 1.6, 1.0);
      bp.connect(g);
      const a = this._osc(v, this._waves.bell, f, tt);
      const b = this._osc(v, 'sine', f * 2.005, tt);
      const bg = this._g(v, 0.3);
      a.connect(bp); b.connect(bg); bg.connect(bp);
      this._ad(g.gain, tt, 0.07 * (o.gain ?? 1), 0.004, 1.6 + i * 0.2);
      a.start(tt); b.start(tt);
    });
    // Sustained chord bloom.
    [55, 62, 67, 71].forEach((m, i) => {
      const g = this._g(v, 0); g.connect(v.out);
      const lp = this._bq(v, 'lowpass', 1400, 1.2);
      lp.connect(g);
      for (const det of [-6, 6]) {
        const osc = this._osc(v, 'sawtooth', DSP.mtof(m), t);
        osc.detune.value = det;
        const og = this._g(v, 0.10);
        osc.connect(og); og.connect(lp);
        osc.start(t);
      }
      this._asr(g.gain, t, 0.07, 0.7, 0.5, 1.5);
    });
    // Sub weight.
    const sg = this._g(v, 0); sg.connect(v.out);
    const s = this._osc(v, 'sine', DSP.mtof(31), t);
    const slp = this._bq(v, 'lowpass', 120, 0.8);
    s.connect(slp); slp.connect(sg);
    this._asr(sg.gain, t, 0.16, 0.05, 0.5, 1.4);
    s.start(t);
    return v.stopAt(t + 3.4).handle();
  },

  'key.acquire'(t, o) {
    const v = this._v('sfx', o, { reverb: 0.35 });
    const G = o.gain ?? 1;
    const impactAt = t + 1.05;

    // --- 1. rising shimmer: detuned partials sweeping up through a resonant BP
    const shim = this._g(v, 0); shim.connect(v.out);
    const bp = this._bq(v, 'bandpass', 400, 3.2);
    this._glide(bp.frequency, t, 380, 5200, 1.05);
    bp.connect(shim);
    const partials = [1, 1.5, 2.02, 3.01, 4.03, 6.05];
    partials.forEach((mult, i) => {
      const f0 = 220 * mult;
      const osc = this._osc(v, i % 2 ? 'triangle' : 'sine', f0, t);
      osc.detune.value = this._rr(-8, 8);
      this._glide(osc.frequency, t, f0, f0 * 2.02, 1.05);
      const g = this._g(v, 0.14 / (1 + i * 0.45));
      osc.connect(g); g.connect(bp);
      osc.start(t);
    });
    shim.gain.setValueAtTime(EPS, t);
    shim.gain.exponentialRampToValueAtTime(0.13 * G, t + 0.85);
    shim.gain.exponentialRampToValueAtTime(0.02 * G, t + 1.12);
    shim.gain.exponentialRampToValueAtTime(EPS, t + 1.5);
    shim.gain.setValueAtTime(0, t + 1.52);

    // Airy noise riser
    const ng = this._g(v, 0); ng.connect(v.out);
    const n = this._noise(v, 'white');
    const nb = this._bq(v, 'bandpass', 1200, 1.8);
    this._glide(nb.frequency, t, 1200, 8000, 1.05);
    n.connect(nb); nb.connect(ng);
    this._asr(ng.gain, t, 0.05 * G, 0.95, 0.02, 0.25);
    this._startNoise(n, t);

    // --- 2. deep confirming impact
    const ig = this._g(v, 0); ig.connect(v.out);
    const ilp = this._bq(v, 'lowpass', 320, 1.1);
    ilp.connect(ig);
    const sub = this._osc(v, 'sine', 78, impactAt);
    this._glide(sub.frequency, impactAt, 78, 31, 0.55);
    sub.connect(ilp);
    const body = this._osc(v, 'triangle', 156, impactAt);
    this._glide(body.frequency, impactAt, 156, 62, 0.4);
    const bg = this._g(v, 0.35);
    body.connect(bg); bg.connect(ilp);
    this._ad(ig.gain, impactAt, 0.26 * G, 0.006, 1.0);
    sub.start(impactAt); body.start(impactAt);

    // Impact transient
    const tg = this._g(v, 0); tg.connect(v.out);
    const tn = this._noise(v, 'brown', { loop: false });
    const tlp = this._bq(v, 'lowpass', 1800, 0.9);
    tn.connect(tlp); tlp.connect(tg);
    this._ad(tg.gain, impactAt, 0.14 * G, 0.001, 0.14);
    this._startNoise(tn, impactAt);

    // Resolving bell above the impact
    const bellG = this._g(v, 0); bellG.connect(v.out);
    const bA = this._osc(v, this._waves.bell, DSP.mtof(79), impactAt);
    const bB = this._osc(v, 'sine', DSP.mtof(91), impactAt);
    const bBg = this._g(v, 0.22);
    const bbp = this._bq(v, 'bandpass', DSP.mtof(79) * 1.6, 1.0);
    bA.connect(bbp); bB.connect(bBg); bBg.connect(bbp); bbp.connect(bellG);
    this._ad(bellG.gain, impactAt, 0.10 * G, 0.004, 2.0);
    bA.start(impactAt); bB.start(impactAt);

    // --- 3. reverb bloom: automate the send so the space "opens" on impact
    if (v.send) {
      const s = v.send.gain;
      s.setValueAtTime(0.18, t);
      s.linearRampToValueAtTime(0.30, impactAt - 0.05);
      s.linearRampToValueAtTime(0.95, impactAt + 0.06);
      s.linearRampToValueAtTime(0.35, impactAt + 1.6);
    }
    return v.stopAt(t + 3.6).handle();
  },

  /* ---------------------------------------------------- movement -- */

  footstep(t, o) {
    const surf = FOOTSTEP[o.surface] ? o.surface : 'rock';
    const cfg = FOOTSTEP[surf];
    const speed = DSP.clamp(o.speed ?? 1, 0, 2);
    const v = this._v('sfx', o, { reverb: 0.18 });
    const G = (o.gain ?? 1) * (0.62 + 0.42 * speed);

    // Per-step randomisation — never machine-gun.
    const pitch = this._rr(0.82, 1.24);
    const lvl = cfg.level * this._rr(0.75, 1.2) * G;
    const jitter = this._rr(0, 0.012);
    const t0 = t + jitter;

    // Main impact body: coloured noise through a surface filter.
    const g = this._g(v, 0); g.connect(v.out);
    const f = this._bq(v, cfg.filt[0], cfg.filt[1] * pitch, cfg.filt[2]);
    f.connect(g);
    const n = this._noise(v, cfg.color, { loop: false, rate: this._rr(0.85, 1.25) });
    n.connect(f);
    this._ad(g.gain, t0, lvl, cfg.atk, cfg.dur * this._rr(0.85, 1.25));
    this._startNoise(n, t0);

    // Hard transient (rock/metal/ice).
    if (cfg.click > 0) {
      const cg = this._g(v, 0); cg.connect(v.out);
      const cf = this._bq(v, 'bandpass', this._rr(1800, 3600), 3.0);
      const cn = this._noise(v, 'white', { loop: false });
      cn.connect(cf); cf.connect(cg);
      this._ad(cg.gain, t0, lvl * cfg.click * 0.45, 0.0006, 0.012);
      this._startNoise(cn, t0);
    }

    // Low thud — weight of the boot.
    const tg = this._g(v, 0); tg.connect(v.out);
    const tos = this._osc(v, 'sine', 90 * pitch, t0);
    this._glide(tos.frequency, t0, 92 * pitch, 48 * pitch, 0.08);
    const tlp = this._bq(v, 'lowpass', 220, 0.9);
    tos.connect(tlp); tlp.connect(tg);
    this._ad(tg.gain, t0, lvl * 0.55, 0.002, 0.09);
    tos.start(t0);

    // Metallic / icy ring.
    if (cfg.ring) {
      const [rf, rdec, rlvl] = cfg.ring;
      const rg = this._g(v, 0); rg.connect(v.out);
      const ro = this._osc(v, 'sine', rf * pitch * this._rr(0.94, 1.07), t0);
      const ro2 = this._osc(v, 'sine', rf * pitch * this._rr(1.4, 1.55), t0);
      const r2g = this._g(v, 0.4);
      ro.connect(rg); ro2.connect(r2g); r2g.connect(rg);
      this._ad(rg.gain, t0, lvl * rlvl, 0.002, rdec);
      ro.start(t0); ro2.start(t0);
    }

    // Suit / fabric rustle layer — always there, always subtle.
    const fg = this._g(v, 0); fg.connect(v.out);
    const fbp = this._bq(v, 'bandpass', this._rr(1600, 3200), 1.1);
    const fn = this._noise(v, 'pink', { loop: false, rate: this._rr(0.9, 1.3) });
    fn.connect(fbp); fbp.connect(fg);
    const ft = t0 + this._rr(0.005, 0.035);
    this._asr(fg.gain, ft, lvl * cfg.rustle, 0.012, 0.02, 0.10);
    this._startNoise(fn, ft);

    return v.stopAt(t0 + 0.6).handle();
  },

  jump(t, o) {
    const v = this._v('sfx', o, { reverb: 0.2 });
    const G = o.gain ?? 1;
    // Servo/exo whine up.
    const g = this._g(v, 0); g.connect(v.out);
    const bp = this._bq(v, 'bandpass', 500, 4);
    this._glide(bp.frequency, t, 480, 1900, 0.18);
    bp.connect(g);
    const osc = this._osc(v, 'sawtooth', 180, t);
    this._glide(osc.frequency, t, 180, 520, 0.18);
    osc.connect(bp);
    this._ad(g.gain, t, 0.075 * G, 0.006, 0.2);
    osc.start(t);
    // Fabric effort.
    const fg = this._g(v, 0); fg.connect(v.out);
    const fn = this._noise(v, 'pink', { loop: false });
    const fbp = this._bq(v, 'bandpass', 1700, 1.0);
    fn.connect(fbp); fbp.connect(fg);
    this._asr(fg.gain, t, 0.075 * G, 0.02, 0.04, 0.14);
    this._startNoise(fn, t);
    // Push-off thud.
    const tg = this._g(v, 0); tg.connect(v.out);
    const tos = this._osc(v, 'sine', 110, t);
    this._glide(tos.frequency, t, 110, 55, 0.1);
    tos.connect(tg);
    this._ad(tg.gain, t, 0.13 * G, 0.002, 0.11);
    tos.start(t);
    return v.stopAt(t + 0.5).handle();
  },

  land(t, o) {
    const v = this._v('sfx', o, { reverb: 0.28 });
    const G = (o.gain ?? 1) * DSP.clamp(0.6 + (o.force ?? 1) * 0.5, 0.4, 1.6);
    // Body thump.
    const g = this._g(v, 0); g.connect(v.out);
    const lp = this._bq(v, 'lowpass', 260, 1.0);
    lp.connect(g);
    const s = this._osc(v, 'sine', 105, t);
    this._glide(s.frequency, t, 105, 40, 0.18);
    const b = this._osc(v, 'triangle', 190, t);
    this._glide(b.frequency, t, 190, 70, 0.13);
    const bg = this._g(v, 0.4);
    s.connect(lp); b.connect(bg); bg.connect(lp);
    this._ad(g.gain, t, 0.24 * G, 0.003, 0.34);
    s.start(t); b.start(t);
    // Debris / dust splat, surface tinted.
    const surf = FOOTSTEP[o.surface] ? o.surface : 'rock';
    const cfg = FOOTSTEP[surf];
    const ng = this._g(v, 0); ng.connect(v.out);
    const nf = this._bq(v, cfg.filt[0], cfg.filt[1] * 0.9, cfg.filt[2]);
    const n = this._noise(v, cfg.color, { loop: false });
    n.connect(nf); nf.connect(ng);
    this._ad(ng.gain, t, 0.20 * G, 0.001, 0.22);
    this._startNoise(n, t);
    // Suit compress.
    const fg = this._g(v, 0); fg.connect(v.out);
    const fn = this._noise(v, 'pink', { loop: false });
    const fbp = this._bq(v, 'bandpass', 2100, 0.9);
    fn.connect(fbp); fbp.connect(fg);
    this._asr(fg.gain, t + 0.02, 0.07 * G, 0.01, 0.03, 0.16);
    this._startNoise(fn, t + 0.02);
    return v.stopAt(t + 0.8).handle();
  },

  jetpack(t, o) {
    const dur = Math.max(0.12, o.duration ?? 0.5);
    const v = this._v('sfx', o, { reverb: 0.2 });
    const G = o.gain ?? 1;
    const g = this._g(v, 0); g.connect(v.out);
    const bp = this._bq(v, 'bandpass', 900, 1.1);
    this._glide(bp.frequency, t, 700, 2400, dur * 0.5);
    bp.frequency.exponentialRampToValueAtTime(900, t + dur);
    bp.connect(g);
    const n = this._noise(v, 'white');
    n.connect(bp);
    this._asr(g.gain, t, 0.14 * G, 0.03, Math.max(0.02, dur - 0.12), 0.22);
    this._startNoise(n, t);
    // Low thrust rumble.
    const rg = this._g(v, 0); rg.connect(v.out);
    const rn = this._noise(v, 'brown');
    const rlp = this._bq(v, 'lowpass', 200, 2.5);
    rn.connect(rlp); rlp.connect(rg);
    this._asr(rg.gain, t, 0.16 * G, 0.04, Math.max(0.02, dur - 0.12), 0.28);
    this._startNoise(rn, t);
    return v.stopAt(t + dur + 0.4).handle();
  },

  /* -------------------------------------------------------- ship -- */

  'ship.boost'(t, o) {
    const v = this._v('sfx', o, { reverb: 0.3 });
    const G = o.gain ?? 1;
    const dur = 1.4;
    // Rising saw stack through a resonant lowpass.
    const g = this._g(v, 0); g.connect(v.out);
    const lp = this._bq(v, 'lowpass', 200, 6);
    this._glide(lp.frequency, t, 180, 3400, dur * 0.7);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    lp.connect(g);
    for (const [mult, det] of [[1, -9], [1, 9], [2.01, 0], [3.02, 5]]) {
      const osc = this._osc(v, 'sawtooth', 48 * mult, t);
      osc.detune.value = det;
      this._glide(osc.frequency, t, 48 * mult, 96 * mult, dur * 0.8);
      const og = this._g(v, 0.16 / mult);
      osc.connect(og); og.connect(lp);
      osc.start(t);
    }
    this._asr(g.gain, t, 0.40 * G, 0.09, dur * 0.55, 0.5);
    // Air.
    const ng = this._g(v, 0); ng.connect(v.out);
    const n = this._noise(v, 'pink');
    const nb = this._bq(v, 'bandpass', 800, 1.0);
    this._glide(nb.frequency, t, 700, 3600, dur * 0.7);
    n.connect(nb); nb.connect(ng);
    this._asr(ng.gain, t, 0.13 * G, 0.12, dur * 0.5, 0.45);
    this._startNoise(n, t);
    return v.stopAt(t + dur + 0.8).handle();
  },

  'ship.warpCharge'(t, o) {
    const dur = Math.max(0.5, o.duration ?? 2.6);
    const v = this._v('sfx', o, { reverb: 0.42 });
    const G = o.gain ?? 1;
    // Core riser.
    const g = this._g(v, 0); g.connect(v.out);
    const lp = this._bq(v, 'lowpass', 300, 11);
    this._glide(lp.frequency, t, 260, 6200, dur);
    lp.connect(g);
    for (const [mult, det] of [[1, -11], [1, 11], [1.5, 0], [2.02, 7]]) {
      const osc = this._osc(v, 'sawtooth', 55 * mult, t);
      osc.detune.value = det;
      this._glide(osc.frequency, t, 55 * mult, 220 * mult, dur);
      const og = this._g(v, 0.13 / mult);
      osc.connect(og); og.connect(lp);
      osc.start(t);
    }
    const gg = g.gain;
    gg.setValueAtTime(EPS, t);
    gg.exponentialRampToValueAtTime(0.42 * G, t + dur * 0.92);
    gg.exponentialRampToValueAtTime(EPS, t + dur + 0.25);
    gg.setValueAtTime(0, t + dur + 0.26);
    // Shepard-ish shimmer bells accelerating.
    let tt = t;
    let step = dur * 0.22;
    let note = 72;
    let guard = 0;
    while (tt < t + dur * 0.95 && guard++ < 48) {
      const f = DSP.mtof(note);
      const bg = this._g(v, 0); bg.connect(v.out);
      const bo = this._osc(v, this._waves.bell, f, tt);
      const bpp = this._bq(v, 'bandpass', f * 1.5, 1.2);
      bo.connect(bpp); bpp.connect(bg);
      this._ad(bg.gain, tt, 0.075 * G, 0.003, 0.55);
      bo.start(tt);
      tt += step;
      step *= 0.78;
      note += 2;
      if (note > 96) note -= 24;
    }
    // Pressure noise.
    const ng = this._g(v, 0); ng.connect(v.out);
    const n = this._noise(v, 'white');
    const nb = this._bq(v, 'bandpass', 900, 2.2);
    this._glide(nb.frequency, t, 800, 9000, dur);
    n.connect(nb); nb.connect(ng);
    this._asr(ng.gain, t, 0.11 * G, dur * 0.9, 0.02, 0.3);
    this._startNoise(n, t);
    return v.stopAt(t + dur + 1.0).handle();
  },

  'ship.warpJump'(t, o) {
    const v = this._v('sfx', o, { reverb: 0.55 });
    const G = o.gain ?? 1;
    // Impact.
    const g = this._g(v, 0); g.connect(v.out);
    const lp = this._bq(v, 'lowpass', 400, 1.2);
    lp.connect(g);
    const s = this._osc(v, 'sine', 140, t);
    this._glide(s.frequency, t, 140, 24, 0.7);
    const b = this._osc(v, 'triangle', 280, t);
    this._glide(b.frequency, t, 280, 48, 0.5);
    const bg = this._g(v, 0.35);
    s.connect(lp); b.connect(bg); bg.connect(lp);
    this._ad(g.gain, t, 0.32 * G, 0.004, 1.5);
    s.start(t); b.start(t);
    // Doppler whoosh past the camera.
    const wg = this._g(v, 0); wg.connect(v.out);
    const n = this._noise(v, 'white');
    const nb = this._bq(v, 'bandpass', 6000, 1.4);
    this._glide(nb.frequency, t, 7000, 180, 1.5);
    n.connect(nb); nb.connect(wg);
    this._asr(wg.gain, t, 0.20 * G, 0.02, 0.35, 1.3);
    this._startNoise(n, t);
    // Departing tonal streak.
    const tg = this._g(v, 0); tg.connect(v.out);
    const to1 = this._osc(v, 'sawtooth', 900, t);
    this._glide(to1.frequency, t, 900, 45, 1.8);
    const tlp = this._bq(v, 'lowpass', 4000, 8);
    this._glide(tlp.frequency, t, 5000, 200, 1.8);
    to1.connect(tlp); tlp.connect(tg);
    this._asr(tg.gain, t, 0.13 * G, 0.02, 0.5, 1.4);
    to1.start(t);
    if (v.send) {
      const sp = v.send.gain;
      sp.setValueAtTime(0.85, t);
      sp.linearRampToValueAtTime(0.4, t + 2.2);
    }
    return v.stopAt(t + 3.4).handle();
  },

  /* -------------------------------------------------- world / UI -- */

  door(t, o) {
    const v = this._v('sfx', o, { reverb: 0.32 });
    const G = o.gain ?? 1;
    const dur = 1.05;
    // Pneumatic release.
    const hg = this._g(v, 0); hg.connect(v.out);
    const hn = this._noise(v, 'white');
    const hb = this._bq(v, 'bandpass', 3000, 1.4);
    this._glide(hb.frequency, t, 3600, 1200, 0.4);
    hn.connect(hb); hb.connect(hg);
    this._asr(hg.gain, t, 0.10 * G, 0.012, 0.12, 0.3);
    this._startNoise(hn, t);
    // Servo travel with mechanical tremolo.
    const sg = this._g(v, 0); sg.connect(v.out);
    const slp = this._bq(v, 'lowpass', 900, 4.5);
    slp.connect(sg);
    const so = this._osc(v, 'sawtooth', 92, t + 0.08);
    this._glide(so.frequency, t + 0.08, 88, 132, dur - 0.3);
    so.connect(slp);
    const trem = this._osc(v, 'sine', 34, t);
    const tremAmt = this._g(v, 0.35);
    trem.connect(tremAmt); tremAmt.connect(sg.gain);
    this._asr(sg.gain, t + 0.08, 0.11 * G, 0.09, dur - 0.45, 0.16);
    so.start(t + 0.08); trem.start(t);
    // Heavy thunk on seat.
    const kt = t + dur - 0.05;
    const kg = this._g(v, 0); kg.connect(v.out);
    const klp = this._bq(v, 'lowpass', 300, 1.1);
    klp.connect(kg);
    const ko = this._osc(v, 'sine', 120, kt);
    this._glide(ko.frequency, kt, 120, 42, 0.24);
    ko.connect(klp);
    const kn = this._noise(v, 'brown', { loop: false });
    const knlp = this._bq(v, 'lowpass', 900, 0.9);
    const kng = this._g(v, 0.5);
    kn.connect(knlp); knlp.connect(kng); kng.connect(klp);
    this._ad(kg.gain, kt, 0.21 * G, 0.002, 0.42);
    ko.start(kt); this._startNoise(kn, kt);
    return v.stopAt(t + dur + 0.7).handle();
  },

  'terminal.type'(t, o) {
    const v = this._v('ui', o, { reverb: 0.04 });
    const g = this._g(v, 0); g.connect(v.out);
    const f = this._rr(1300, 2700);
    const bp = this._bq(v, 'bandpass', f, 7);
    bp.connect(g);
    const osc = this._osc(v, 'square', f, t);
    osc.connect(bp);
    this._ad(g.gain, t, this._rr(0.030, 0.050) * (o.gain ?? 1), 0.0008, 0.018);
    osc.start(t);
    const ng = this._g(v, 0); ng.connect(v.out);
    const n = this._noise(v, 'white', { loop: false });
    const nhp = this._bq(v, 'highpass', 4000, 0.8);
    n.connect(nhp); nhp.connect(ng);
    this._ad(ng.gain, t, 0.018 * (o.gain ?? 1), 0.0006, 0.01);
    this._startNoise(n, t);
    return v.stopAt(t + 0.05).handle();
  },

  'codex.open'(t, o) {
    const v = this._v('sfx', o, { reverb: 0.35, bus: 'ui' });
    const G = o.gain ?? 1;
    // Airy rise.
    const ng = this._g(v, 0); ng.connect(v.out);
    const n = this._noise(v, 'pink');
    const nb = this._bq(v, 'bandpass', 700, 1.3);
    this._glide(nb.frequency, t, 650, 4800, 0.42);
    n.connect(nb); nb.connect(ng);
    this._asr(ng.gain, t, 0.115 * G, 0.22, 0.05, 0.42);
    this._startNoise(n, t);
    // Soft chord bloom (open fifth + ninth = "interface awakening").
    [62, 69, 76].forEach((m, i) => {
      const g = this._g(v, 0); g.connect(v.out);
      const lp = this._bq(v, 'lowpass', 2200, 1.1);
      lp.connect(g);
      for (const det of [-7, 7]) {
        const osc = this._osc(v, 'triangle', DSP.mtof(m), t);
        osc.detune.value = det;
        const og = this._g(v, 0.16);
        osc.connect(og); og.connect(lp);
        osc.start(t);
      }
      this._asr(g.gain, t + i * 0.04, 0.10 * G, 0.16, 0.15, 0.6);
    });
    return v.stopAt(t + 1.4).handle();
  },

  'lore.unlock'(t, o) {
    const v = this._v('sfx', o, { reverb: 0.55 });
    const G = o.gain ?? 1;
    const notes = [64, 68, 71, 76, 80, 83];
    notes.forEach((m, i) => {
      const tt = t + i * 0.16;
      const f = DSP.mtof(m);
      const g = this._g(v, 0); g.connect(v.out);
      const bp = this._bq(v, 'bandpass', f * 1.5, 1.1);
      bp.connect(g);
      const a = this._osc(v, this._waves.bell, f, tt);
      const b = this._osc(v, 'sine', f * 3.02, tt);
      const bg = this._g(v, 0.14);
      a.connect(bp); b.connect(bg); bg.connect(bp);
      this._ad(g.gain, tt, 0.095 * G, 0.003, 1.4 + i * 0.15);
      a.start(tt); b.start(tt);
    });
    // Under-swell.
    const sg = this._g(v, 0); sg.connect(v.out);
    const slp = this._bq(v, 'lowpass', 700, 1.0);
    slp.connect(sg);
    for (const m of [40, 47, 52]) {
      for (const det of [-8, 8]) {
        const osc = this._osc(v, 'sawtooth', DSP.mtof(m), t);
        osc.detune.value = det;
        const og = this._g(v, 0.09);
        osc.connect(og); og.connect(slp);
        osc.start(t);
      }
    }
    this._asr(sg.gain, t, 0.15 * G, 0.9, 0.4, 1.4);
    return v.stopAt(t + 3.2).handle();
  },

  heartbeat(t, o) {
    const v = this._v('sfx', o, { reverb: 0.12 });
    const G = o.gain ?? 1;
    const thump = (tt, lvl) => {
      const g = this._g(v, 0); g.connect(v.out);
      const lp = this._bq(v, 'lowpass', 150, 1.4);
      lp.connect(g);
      const s = this._osc(v, 'sine', 66, tt);
      this._glide(s.frequency, tt, 66, 34, 0.16);
      s.connect(lp);
      const n = this._noise(v, 'brown', { loop: false });
      const nlp = this._bq(v, 'lowpass', 260, 0.8);
      const ng = this._g(v, 0.5);
      n.connect(nlp); nlp.connect(ng); ng.connect(lp);
      this._ad(g.gain, tt, lvl * G, 0.008, 0.24);
      s.start(tt); this._startNoise(n, tt);
    };
    thump(t, 0.36);
    thump(t + 0.30, 0.24);
    return v.stopAt(t + 0.75).handle();
  },

  alarm(t, o) {
    const v = this._v('sfx', o, { reverb: 0.25 });
    const G = o.gain ?? 1;
    const reps = o.reps ?? 3;
    const per = 0.42;
    const g = this._g(v, 0); g.connect(v.out);
    const lp = this._bq(v, 'lowpass', 2400, 2.0);
    lp.connect(g);
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = DSP.tanhCurve(2.4, 0.85);
    shaper.oversample = '2x';
    v.add(shaper);
    const oA = this._osc(v, 'square', 622.3, t);
    const oB = this._osc(v, 'square', 466.2, t);
    const gA = this._g(v, 0), gB = this._g(v, 0);
    oA.connect(gA); oB.connect(gB);
    gA.connect(shaper); gB.connect(shaper); shaper.connect(lp);
    oA.start(t); oB.start(t);
    // Low pulsing bed under the two-tone.
    const sg = this._g(v, 0); sg.connect(v.out);
    const so = this._osc(v, 'sawtooth', 77.8, t);
    const slp = this._bq(v, 'lowpass', 260, 3);
    so.connect(slp); slp.connect(sg);
    so.start(t);
    for (let i = 0; i < reps; i++) {
      const t0 = t + i * per;
      this._asr(gA.gain, t0, 0.16 * G, 0.008, 0.10, 0.05);
      this._asr(gB.gain, t0 + per * 0.5, 0.16 * G, 0.008, 0.10, 0.05);
      this._asr(sg.gain, t0, 0.13 * G, 0.02, 0.16, 0.12);
    }
    return v.stopAt(t + reps * per + 0.5).handle();
  },
};

export const CATALOGUE = Object.keys(SHOTS);
export const AMBIENCE_PROFILES = Object.keys(AMBIENCE);
export const MUSIC_MOODS = Object.keys(MOODS);
export const REVERB_SPACE_NAMES = Object.keys(DSP.REVERB_SPACES);

export default AudioEngine;
