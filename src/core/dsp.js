/**
 * AETHERIUM — src/core/dsp.js
 * Zero-asset DSP helpers for the procedural audio engine:
 * seeded RNG, coloured noise buffers, procedural impulse responses (reverb),
 * wavetables / periodic waves, waveshaper curves and music-theory utilities.
 *
 * Pure WebAudio + typed arrays. No DOM, no network, no assets.
 */

/* ------------------------------------------------------------------ *
 *  Random / math
 * ------------------------------------------------------------------ */

/** Deterministic, fast 32-bit PRNG. Returns a function -> [0,1). */
export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(1e-9, g));

/** MIDI note -> Hz (A4 = 69 = 440Hz). */
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
/** Hz -> MIDI note. */
export const ftom = (f) => 69 + 12 * Math.log2(Math.max(1e-6, f) / 440);

/** Random float in range using an optional rng. */
export function rrand(rng, a, b) {
  return a + (b - a) * (rng ? rng() : Math.random());
}
/** Random integer in [a,b]. */
export function rint(rng, a, b) {
  return Math.floor(rrand(rng, a, b + 0.9999));
}
/** Pick a random element. */
export function pick(rng, arr) {
  return arr[Math.min(arr.length - 1, Math.floor((rng ? rng() : Math.random()) * arr.length))];
}

/* ------------------------------------------------------------------ *
 *  Noise buffers
 * ------------------------------------------------------------------ */

/**
 * Generate a coloured noise AudioBuffer.
 * @param {BaseAudioContext} ctx
 * @param {object} o {seconds, channels, color:'white'|'pink'|'brown'|'blue'|'violet'|'grey', seed, normalize}
 */
export function makeNoiseBuffer(ctx, o = {}) {
  const seconds = Math.max(0.01, o.seconds ?? 2);
  const channels = o.channels ?? 2;
  const color = o.color ?? 'white';
  const rng = mulberry32(o.seed ?? 1337);
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * sr));
  const buf = ctx.createBuffer(channels, len, sr);

  for (let ch = 0; ch < channels; ch++) {
    const d = buf.getChannelData(ch);
    if (color === 'white') {
      for (let i = 0; i < len; i++) d[i] = rng() * 2 - 1;
    } else if (color === 'pink') {
      // Paul Kellet's refined pink noise filter.
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = rng() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else if (color === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = rng() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    } else if (color === 'blue' || color === 'violet') {
      // Differentiated white noise (+6dB/oct). Violet = differentiate twice.
      let p = 0, p2 = 0;
      for (let i = 0; i < len; i++) {
        const w = rng() * 2 - 1;
        let v = w - p; p = w;
        if (color === 'violet') { const v2 = v - p2; p2 = v; v = v2; }
        d[i] = v * 0.5;
      }
    } else {
      // 'grey' — mildly band-limited white, gentle high roll-off.
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const w = rng() * 2 - 1;
        lp += 0.45 * (w - lp);
        d[i] = lp * 1.6;
      }
    }
  }
  if (o.normalize !== false) normalizeBufferPeak(buf, o.peak ?? 0.9);
  return buf;
}

/** Peak-normalise an AudioBuffer in-place. */
export function normalizeBufferPeak(buf, target = 0.9) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  if (peak > 1e-9) {
    const g = target / peak;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }
  return buf;
}

/** Energy-normalise an AudioBuffer so convolution gain is ~unity. */
export function normalizeBufferEnergy(buf, target = 1.0) {
  let e = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) e += d[i] * d[i];
  }
  e = Math.sqrt(e / Math.max(1, buf.numberOfChannels));
  if (e > 1e-9) {
    const g = target / e;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= g;
    }
  }
  return buf;
}

/* ------------------------------------------------------------------ *
 *  Impulse responses (procedural reverb)
 * ------------------------------------------------------------------ */

/**
 * Build a stereo impulse response from exponentially-decaying, frequency-damped
 * noise plus a sparse early-reflection pattern.
 *
 * @param {BaseAudioContext} ctx
 * @param {object} o
 *  seconds      total IR length (s)
 *  decayShape   exponent of the tail decay (2..8 -> tighter..longer sustain)
 *  preDelay     seconds before the tail begins
 *  hfStart/hfEnd  one-pole lowpass cutoff at the start / end of the tail (Hz)
 *  lfCut        highpass cutoff applied to the whole tail (Hz) — keeps mud out
 *  buildTime    diffusion build-up ramp at the head (s)
 *  early        {count, spread, gain} early reflections
 *  width        0..1 stereo decorrelation
 *  seed         PRNG seed
 *  energy       target convolution energy (loudness of the space)
 */
export function makeImpulseResponse(ctx, o = {}) {
  const sr = ctx.sampleRate;
  const seconds = clamp(o.seconds ?? 2.0, 0.05, 12);
  const len = Math.max(8, Math.floor(seconds * sr));
  const buf = ctx.createBuffer(2, len, sr);
  const decayShape = o.decayShape ?? 5.5;
  const preDelay = Math.max(0, o.preDelay ?? 0.008);
  const hfStart = o.hfStart ?? 7000;
  const hfEnd = o.hfEnd ?? 900;
  const lfCut = o.lfCut ?? 45;
  const buildTime = o.buildTime ?? 0.012;
  const early = Object.assign({ count: 14, spread: 0.06, gain: 0.55 }, o.early || {});
  const width = clamp(o.width ?? 0.8, 0, 1);
  const baseSeed = (o.seed ?? 7) >>> 0;

  const pd = Math.floor(preDelay * sr);
  const buildN = Math.max(1, Math.floor(buildTime * sr));

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // Decorrelated seeds per channel; width blends toward a shared seed.
    const rngA = mulberry32(baseSeed + ch * 977);
    const rngB = mulberry32(baseSeed + 4242);
    let lp = 0;
    let hpPrevIn = 0, hpPrevOut = 0;
    const hpA = Math.exp(-2 * Math.PI * lfCut / sr);
    const span = Math.max(1, len - pd);

    for (let i = pd; i < len; i++) {
      const t = (i - pd) / span;                     // 0..1 through the tail
      const env = Math.exp(-decayShape * t) * (1 - t); // exp decay, forced to 0 at end
      const fc = hfStart * Math.pow(hfEnd / hfStart, t);
      const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
      const n = lerp(rngB() * 2 - 1, rngA() * 2 - 1, width);
      lp += a * (n - lp);
      const build = Math.min(1, (i - pd) / buildN);
      let s = lp * env * build;
      // one-pole highpass to remove DC / sub rumble build-up
      const out = hpA * (hpPrevOut + s - hpPrevIn);
      hpPrevIn = s; hpPrevOut = out;
      d[i] = out;
    }

    // Early reflections — sparse, decaying taps (gives the space its size cue).
    const er = mulberry32(baseSeed + 100 + ch * 31);
    for (let k = 0; k < early.count; k++) {
      const frac = Math.pow((k + 1) / early.count, 1.35);
      const tt = 0.003 + frac * early.spread * (0.7 + 0.6 * er());
      const idx = pd + Math.floor(tt * sr);
      if (idx < len - 2) {
        const g = early.gain * Math.exp(-tt * 7.5) * (er() * 2 - 1);
        d[idx] += g;
        d[idx + 1] += g * 0.5;
      }
    }
  }

  normalizeBufferEnergy(buf, o.energy ?? 1.0);
  return buf;
}

/** Named reverb spaces used by the engine. */
export const REVERB_SPACES = {
  suit: {
    seconds: 0.42, decayShape: 7.5, preDelay: 0.002, hfStart: 5200, hfEnd: 1400,
    lfCut: 120, buildTime: 0.003, width: 0.35, energy: 0.75,
    early: { count: 8, spread: 0.012, gain: 0.7 }, seed: 11,
  },
  interior: {
    seconds: 1.0, decayShape: 6.2, preDelay: 0.006, hfStart: 6200, hfEnd: 1100,
    lfCut: 80, buildTime: 0.006, width: 0.6, energy: 0.9,
    early: { count: 12, spread: 0.03, gain: 0.6 }, seed: 23,
  },
  hall: {
    seconds: 2.6, decayShape: 5.0, preDelay: 0.018, hfStart: 8000, hfEnd: 900,
    lfCut: 55, buildTime: 0.02, width: 0.85, energy: 1.0,
    early: { count: 16, spread: 0.055, gain: 0.5 }, seed: 37,
  },
  canyon: {
    seconds: 3.8, decayShape: 4.2, preDelay: 0.055, hfStart: 6800, hfEnd: 620,
    lfCut: 50, buildTime: 0.03, width: 1.0, energy: 1.0,
    early: { count: 9, spread: 0.28, gain: 0.85 }, seed: 51,
  },
  cave: {
    seconds: 3.0, decayShape: 4.6, preDelay: 0.03, hfStart: 3400, hfEnd: 380,
    lfCut: 40, buildTime: 0.035, width: 0.9, energy: 1.05,
    early: { count: 14, spread: 0.1, gain: 0.65 }, seed: 67,
  },
  void: {
    seconds: 8.0, decayShape: 3.1, preDelay: 0.04, hfStart: 3000, hfEnd: 220,
    lfCut: 32, buildTime: 0.09, width: 1.0, energy: 1.1,
    early: { count: 6, spread: 0.2, gain: 0.28 }, seed: 89,
  },
};

/* ------------------------------------------------------------------ *
 *  Wavetables / periodic waves
 * ------------------------------------------------------------------ */

/**
 * Build a PeriodicWave from a harmonic amplitude spec.
 * @param {BaseAudioContext} ctx
 * @param {number[]|function} harmonics amplitudes for harmonic 1..N, or fn(n)->amp
 * @param {object} o {count, phase:fn(n)->rad, disableNormalization}
 */
export function makeWavetable(ctx, harmonics, o = {}) {
  const count = o.count ?? (Array.isArray(harmonics) ? harmonics.length : 24);
  const real = new Float32Array(count + 1);
  const imag = new Float32Array(count + 1);
  for (let n = 1; n <= count; n++) {
    const amp = Array.isArray(harmonics) ? (harmonics[n - 1] ?? 0) : harmonics(n);
    const ph = o.phase ? o.phase(n) : 0;
    real[n] = amp * Math.sin(ph);
    imag[n] = amp * Math.cos(ph);
  }
  return ctx.createPeriodicWave(real, imag, {
    disableNormalization: !!o.disableNormalization,
  });
}

/** A warm, slightly hollow pad wave (odd-leaning, rolled-off highs). */
export function padWave(ctx, seed = 3) {
  const rng = mulberry32(seed);
  return makeWavetable(ctx, (n) => {
    const roll = 1 / Math.pow(n, 1.55);
    const odd = n % 2 === 1 ? 1 : 0.45;
    return roll * odd * (0.85 + 0.3 * rng());
  }, { count: 28, phase: (n) => (n * 1.7) % (Math.PI * 2) });
}

/** A bell / glass wave with mildly inharmonic-sounding partial weighting. */
export function bellWave(ctx) {
  const w = [1, 0.0, 0.62, 0.0, 0.34, 0.06, 0.2, 0.0, 0.12, 0.0, 0.08, 0.0, 0.05];
  return makeWavetable(ctx, w, { count: w.length });
}

/* ------------------------------------------------------------------ *
 *  Waveshaper curves
 * ------------------------------------------------------------------ */

/** tanh soft-clip curve; output is hard-bounded by `ceiling`. */
export function tanhCurve(drive = 1.6, ceiling = 0.92, n = 2048) {
  const c = new Float32Array(n);
  const k = Math.max(0.01, drive);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = (Math.tanh(k * x) / norm) * ceiling;
  }
  return c;
}

/** Gentle asymmetric "tape" curve for a touch of harmonic warmth. */
export function tapeCurve(amount = 0.35, n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const y = x - amount * x * x * x / 3 + amount * 0.12 * x * x;
    c[i] = clamp(y, -0.98, 0.98);
  }
  return c;
}

/* ------------------------------------------------------------------ *
 *  Music theory
 * ------------------------------------------------------------------ */

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

/** Scale degree (can exceed the octave) -> semitone offset from root. */
export function degreeToSemitone(mode, degree) {
  const sc = MODES[mode] || MODES.aeolian;
  const oct = Math.floor(degree / sc.length);
  const idx = ((degree % sc.length) + sc.length) % sc.length;
  return sc[idx] + 12 * oct;
}

/**
 * Diatonic chord built by stacking thirds within the mode.
 * @returns {number[]} pitch classes (0..11) relative to root
 */
export function buildChord(mode, degree, size = 3) {
  const out = [];
  for (let i = 0; i < size; i++) out.push(degreeToSemitone(mode, degree + i * 2));
  return out;
}

/**
 * Voice-lead `prev` (absolute MIDI notes) onto the pitch classes of `chordPcs`
 * (semitone offsets relative to `root`), moving each voice to its nearest tone.
 * Returns a new array of absolute MIDI notes, sorted ascending.
 */
export function voiceLead(prev, root, chordPcs, opts = {}) {
  const lo = opts.lo ?? 36;
  const hi = opts.hi ?? 84;
  const maxLeap = opts.maxLeap ?? 7;
  const targets = chordPcs.map((s) => ((root + s) % 12 + 12) % 12);
  const used = new Set();
  const out = [];

  const nearest = (from, pc, forbid) => {
    let best = null, bestD = 1e9;
    const basePc = ((pc % 12) + 12) % 12;
    for (let n = lo; n <= hi; n++) {
      if (((n % 12) + 12) % 12 !== basePc) continue;
      if (forbid && forbid.has(n)) continue;
      const d = Math.abs(n - from);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  };

  if (!prev || prev.length === 0) {
    // Initial spread voicing around the middle of the range.
    const start = Math.round((lo + hi) / 2) - 6;
    for (let i = 0; i < targets.length; i++) {
      const n = nearest(start + i * 4, targets[i], used);
      if (n != null) { used.add(n); out.push(n); }
    }
    return out.sort((a, b) => a - b);
  }

  const n = Math.max(prev.length, targets.length);
  for (let i = 0; i < n; i++) {
    const from = prev[Math.min(i, prev.length - 1)] + (i >= prev.length ? 12 : 0);
    const pc = targets[i % targets.length];
    let note = nearest(from, pc, used);
    if (note == null) note = nearest(from, pc, null);
    if (note == null) continue;
    // Discourage huge leaps: if we moved too far, try the octave nearer `from`.
    if (Math.abs(note - from) > maxLeap) {
      const alt = note > from ? note - 12 : note + 12;
      if (alt >= lo && alt <= hi && !used.has(alt) && Math.abs(alt - from) < Math.abs(note - from)) {
        note = alt;
      }
    }
    used.add(note);
    out.push(note);
  }
  return out.sort((a, b) => a - b);
}

/** Weighted diatonic progression walk (functional-ish, never random jumps). */
const DEGREE_MOVES = {
  0: [[5, 3], [3, 3], [4, 2], [2, 1], [1, 1]],
  1: [[4, 3], [3, 2], [6, 1], [0, 1]],
  2: [[5, 3], [3, 2], [0, 2], [1, 1]],
  3: [[4, 3], [0, 2], [1, 2], [5, 1]],
  4: [[0, 4], [5, 2], [3, 1], [2, 1]],
  5: [[3, 3], [1, 2], [4, 2], [0, 1]],
  6: [[0, 3], [4, 1], [2, 1]],
};

export function nextDegree(rng, degree) {
  const moves = DEGREE_MOVES[((degree % 7) + 7) % 7] || DEGREE_MOVES[0];
  let total = 0;
  for (const m of moves) total += m[1];
  let r = (rng ? rng() : Math.random()) * total;
  for (const m of moves) { r -= m[1]; if (r <= 0) return m[0]; }
  return moves[0][0];
}

export default {
  mulberry32, clamp, lerp, dbToGain, gainToDb, mtof, ftom, rrand, rint, pick,
  makeNoiseBuffer, normalizeBufferPeak, normalizeBufferEnergy,
  makeImpulseResponse, REVERB_SPACES,
  makeWavetable, padWave, bellWave, tanhCurve, tapeCurve,
  MODES, degreeToSemitone, buildChord, voiceLead, nextDegree,
};
