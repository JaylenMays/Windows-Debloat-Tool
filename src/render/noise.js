/**
 * AETHERIUM — src/render/noise.js
 *
 * Deterministic, *seamlessly tiling* procedural noise / field utilities.
 * Everything works on Float32Array "fields" of N*N (row-major, row 0 == v 0
 * because THREE.DataTexture has flipY = false).
 *
 * Tiling guarantee (by construction, not by hope):
 *   - every lattice used is an f x f torus, indices taken mod f;
 *   - a pixel at x maps to lattice coordinate (x + phase) * f / N, so pixel
 *     N wraps exactly onto pixel 0 for any integer f;
 *   - domain warping adds a field that is itself 1-periodic in uv, so
 *     g(p + 1 + w(p + 1)) == g(p + w(p));
 *   - blurs / gradients / streaks all use wrapped indexing.
 *
 * No Math.random anywhere. No per-pixel allocation in hot loops.
 */

/* ------------------------------------------------------------------ *
 * PRNG
 * ------------------------------------------------------------------ */

/** mulberry32 — small, fast, good enough statistically, fully deterministic. */
export function mulberry32(a) {
	let s = a >>> 0;
	return function () {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Mix a base seed with a salt so sub-systems get decorrelated streams. */
export function hashSeed(seed, salt) {
	let h = (seed >>> 0) ^ Math.imul(salt >>> 0, 0x9e3779b1);
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	return (h ^ (h >>> 16)) >>> 0;
}

/* ------------------------------------------------------------------ *
 * scalar helpers
 * ------------------------------------------------------------------ */

export const TAU = Math.PI * 2;
export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
export function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
export function smoothstep(e0, e1, x) {
	let t = (x - e0) / (e1 - e0);
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	return t * t * (3 - 2 * t);
}
/** Hard-ish edge: like smoothstep but with a controllable knee, used for chips/flakes. */
export function stepSharp(edge, w, x) { return smoothstep(edge - w, edge + w, x); }

/* ------------------------------------------------------------------ *
 * field allocation pool (avoids GC churn across many materials)
 * ------------------------------------------------------------------ */

const _pool = new Map(); // n -> Float32Array[]

/** Take a scratch field. NOT zeroed by default (callers overwrite every texel);
 *  pass `zero = true` when you actually accumulate into it. */
export function grab(n, zero) {
	const list = _pool.get(n);
	if (list && list.length) { const a = list.pop(); if (zero) a.fill(0); return a; }
	return new Float32Array(n);
}
export function give(...arrs) {
	for (const a of arrs) {
		if (!a || !(a instanceof Float32Array)) continue;
		let list = _pool.get(a.length);
		if (!list) { list = []; _pool.set(a.length, list); }
		if (list.length < 24) list.push(a);
	}
}
export function poolClear() { _pool.clear(); }

/* ------------------------------------------------------------------ *
 * core: tiling value-noise octave splat
 * ------------------------------------------------------------------ */

// scratch rows reused across octaves (grown on demand)
let _rowA = new Float32Array(0), _rowB = new Float32Array(0);
let _ix0 = new Int32Array(0), _ix1 = new Int32Array(0), _wx = new Float32Array(0);

function ensureRows(N) {
	if (_rowA.length < N) {
		_rowA = new Float32Array(N); _rowB = new Float32Array(N);
		_ix0 = new Int32Array(N); _ix1 = new Int32Array(N); _wx = new Float32Array(N);
	}
}

/**
 * Add one octave of tiling value noise to `dst`.
 * mode: 0 = signed-ish [0,1] value, 1 = ridged (1-|2v-1|), 2 = billow (|2v-1|).
 * Interpolation is quintic (C2), so the height field has no lattice creases.
 */
export function addOctave(dst, N, f, amp, rnd, mode = 0) {
	f = Math.max(1, Math.min(N, f | 0));
	ensureRows(N);
	const lat = new Float32Array(f * f);
	for (let i = 0, n = f * f; i < n; i++) lat[i] = rnd();
	// random sub-cell phase so different octaves never share cell boundaries
	const phx = rnd() * N, phy = rnd() * N;
	const s = f / N;

	for (let x = 0; x < N; x++) {
		const t = (x + phx) * s;
		const i0 = Math.floor(t);
		_wx[x] = fade(t - i0);
		_ix0[x] = ((i0 % f) + f) % f;
		_ix1[x] = (_ix0[x] + 1) % f;
	}

	let cachedJ = -2147483648;
	for (let y = 0; y < N; y++) {
		const t = (y + phy) * s;
		const j0 = Math.floor(t);
		const wy = fade(t - j0);
		if (j0 !== cachedJ) {
			cachedJ = j0;
			const a0 = (((j0 % f) + f) % f) * f;
			const a1 = ((((j0 + 1) % f) + f) % f) * f;
			for (let x = 0; x < N; x++) {
				const p = lat[a0 + _ix0[x]], q = lat[a0 + _ix1[x]];
				_rowA[x] = p + (q - p) * _wx[x];
			}
			for (let x = 0; x < N; x++) {
				const p = lat[a1 + _ix0[x]], q = lat[a1 + _ix1[x]];
				_rowB[x] = p + (q - p) * _wx[x];
			}
		}
		const o = y * N;
		if (mode === 0) {
			for (let x = 0; x < N; x++) dst[o + x] += amp * (_rowA[x] + (_rowB[x] - _rowA[x]) * wy);
		} else if (mode === 1) {
			for (let x = 0; x < N; x++) {
				const v = _rowA[x] + (_rowB[x] - _rowA[x]) * wy;
				const d = v + v - 1;
				dst[o + x] += amp * (1 - (d < 0 ? -d : d));
			}
		} else {
			for (let x = 0; x < N; x++) {
				const v = _rowA[x] + (_rowB[x] - _rowA[x]) * wy;
				const d = v + v - 1;
				dst[o + x] += amp * (d < 0 ? -d : d);
			}
		}
	}
}

/**
 * Multi-octave tiling fBm. Result is normalised to ~[0,1].
 * opts: { seed, freq, octaves, gain, lacunarity, mode, out }
 * Octave frequencies are snapped to integers (required for tiling) and nudged
 * to nearby primes so no two octaves share lattice alignment.
 */
const PRIMEISH = [1, 2, 3, 5, 7, 11, 13, 17, 23, 29, 37, 47, 59, 73, 97, 127, 163, 211, 269, 347, 449, 577, 743];
function nearPrime(f) {
	let best = PRIMEISH[0], bd = 1e9;
	for (let i = 0; i < PRIMEISH.length; i++) {
		const d = Math.abs(PRIMEISH[i] - f);
		if (d < bd) { bd = d; best = PRIMEISH[i]; }
	}
	return best;
}

/**
 * Multi-octave tiling fBm — *fused*: every octave's two interpolated lattice
 * rows are built into one shared scratch buffer and summed into an L1-resident
 * accumulator row, so the destination is touched exactly once per pixel instead
 * of once per octave. That turns fBm from memory-bandwidth-bound into
 * arithmetic-bound (~3x faster at 1024).
 */
export function fbm(N, opts = {}) {
	const seed = opts.seed === undefined ? 1 : opts.seed;
	const freq = opts.freq === undefined ? 4 : opts.freq;
	const octaves = Math.max(1, opts.octaves === undefined ? 6 : opts.octaves);
	const gain = opts.gain === undefined ? 0.5 : opts.gain;
	const lac = opts.lacunarity === undefined ? 2.0 : opts.lacunarity;
	const mode = opts.mode === undefined ? 0 : opts.mode;
	const snap = opts.snap === undefined ? true : opts.snap;
	const dst = opts.out || grab(N * N);

	const rnd = mulberry32(hashSeed(seed, 0x51ed270b));
	const K = octaves;
	const fs = new Int32Array(K), amps = new Float32Array(K);
	const phx = new Float32Array(K), phy = new Float32Array(K);
	let amp = 1, f = freq, sum = 0;
	for (let k = 0; k < K; k++) {
		let fi = Math.max(1, Math.round(f));
		if (snap) fi = nearPrime(fi);
		if (fi > N) fi = N;
		fs[k] = fi; amps[k] = amp; sum += amp;
		amp *= gain; f *= lac;
	}
	const inv = 1 / sum;
	for (let k = 0; k < K; k++) amps[k] *= inv;

	// lattices, packed back to back
	const lats = new Array(K);
	for (let k = 0; k < K; k++) {
		const f2 = fs[k] * fs[k];
		const L = new Float32Array(f2);
		for (let i = 0; i < f2; i++) L[i] = rnd();
		lats[k] = L;
		phx[k] = rnd() * N; phy[k] = rnd() * N;
	}

	const ix0 = new Int32Array(K * N), ix1 = new Int32Array(K * N);
	const wxs = new Float32Array(K * N);
	for (let k = 0; k < K; k++) {
		const fk = fs[k], s = fk / N, base = k * N, px = phx[k];
		for (let x = 0; x < N; x++) {
			const t = (x + px) * s;
			const i0 = Math.floor(t);
			wxs[base + x] = fade(t - i0);
			const a = ((i0 % fk) + fk) % fk;
			ix0[base + x] = a;
			ix1[base + x] = a + 1 === fk ? 0 : a + 1;
		}
	}

	const rowsA = new Array(K), rowsB = new Array(K);
	for (let k = 0; k < K; k++) { rowsA[k] = new Float32Array(N); rowsB[k] = new Float32Array(N); }
	const cachedJ = new Int32Array(K).fill(-2147483648);
	const wys = new Float32Array(K);
	const acc = new Float32Array(N);

	for (let y = 0; y < N; y++) {
		// (re)build the two interpolated lattice rows for every octave whose
		// cell row changed — high-frequency octaves change often, low ones rarely
		for (let k = 0; k < K; k++) {
			const fk = fs[k], s = fk / N, base = k * N;
			const t = (y + phy[k]) * s;
			const j0 = Math.floor(t);
			wys[k] = fade(t - j0);
			if (j0 !== cachedJ[k]) {
				cachedJ[k] = j0;
				const L = lats[k], A = rowsA[k], B = rowsB[k];
				const a0 = ((((j0 % fk) + fk) % fk)) * fk;
				const a1 = ((((j0 + 1) % fk) + fk) % fk) * fk;
				for (let x = 0; x < N; x++) {
					const bx = base + x, w = wxs[bx], m0 = ix0[bx], m1 = ix1[bx];
					const p = L[a0 + m0], q = L[a0 + m1];
					A[x] = p + (q - p) * w;
					const r = L[a1 + m0], u = L[a1 + m1];
					B[x] = r + (u - r) * w;
				}
			}
		}

		const o = y * N;
		if (mode === 0) {
			// accumulate 4 octaves per pass so `acc` is touched 4x less often
			let k = 0;
			let firstPass = true;
			for (; k + 3 < K; k += 4) {
				const A0 = rowsA[k], B0 = rowsB[k], w0 = wys[k], a0 = amps[k];
				const A1 = rowsA[k + 1], B1 = rowsB[k + 1], w1 = wys[k + 1], a1 = amps[k + 1];
				const A2 = rowsA[k + 2], B2 = rowsB[k + 2], w2 = wys[k + 2], a2 = amps[k + 2];
				const A3 = rowsA[k + 3], B3 = rowsB[k + 3], w3 = wys[k + 3], a3 = amps[k + 3];
				if (firstPass) {
					firstPass = false;
					for (let x = 0; x < N; x++) {
						const v0 = A0[x], v1 = A1[x], v2 = A2[x], v3 = A3[x];
						acc[x] = a0 * (v0 + (B0[x] - v0) * w0) + a1 * (v1 + (B1[x] - v1) * w1)
							+ a2 * (v2 + (B2[x] - v2) * w2) + a3 * (v3 + (B3[x] - v3) * w3);
					}
				} else {
					for (let x = 0; x < N; x++) {
						const v0 = A0[x], v1 = A1[x], v2 = A2[x], v3 = A3[x];
						acc[x] += a0 * (v0 + (B0[x] - v0) * w0) + a1 * (v1 + (B1[x] - v1) * w1)
							+ a2 * (v2 + (B2[x] - v2) * w2) + a3 * (v3 + (B3[x] - v3) * w3);
					}
				}
			}
			for (; k < K; k++) {
				const A = rowsA[k], B = rowsB[k], w = wys[k], a = amps[k];
				if (firstPass) {
					firstPass = false;
					for (let x = 0; x < N; x++) { const v = A[x]; acc[x] = a * (v + (B[x] - v) * w); }
				} else {
					for (let x = 0; x < N; x++) { const v = A[x]; acc[x] += a * (v + (B[x] - v) * w); }
				}
			}
		} else {
			acc.fill(0);
			for (let k = 0; k < K; k++) {
				const A = rowsA[k], B = rowsB[k], w = wys[k], a = amps[k];
				if (mode === 1) {
					for (let x = 0; x < N; x++) {
						const p = A[x];
						const d = 2 * (p + (B[x] - p) * w) - 1;
						acc[x] += a * (1 - (d < 0 ? -d : d));
					}
				} else {
					for (let x = 0; x < N; x++) {
						const p = A[x];
						const d = 2 * (p + (B[x] - p) * w) - 1;
						acc[x] += a * (d < 0 ? -d : d);
					}
				}
			}
		}
		dst.set(acc, o);
	}
	return dst;
}

/** Pure white noise field (uncorrelated per texel) — tiles trivially.
 *  Uses xorshift32 inline: ~3x faster than calling mulberry32 a million times. */
export function white(N, seed, out) {
	const dst = out || grab(N * N);
	let s = hashSeed(seed, 0x2f9a1e77) | 0;
	if (s === 0) s = 0x9e3779b9 | 0;
	const inv = 1 / 4294967296;
	for (let i = 0, n = N * N; i < n; i++) {
		s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
		dst[i] = (s >>> 0) * inv;
	}
	return dst;
}

/* ------------------------------------------------------------------ *
 * sampling / warping
 * ------------------------------------------------------------------ */

export function sampleWrap(src, N, x, y) {
	let x0 = Math.floor(x), y0 = Math.floor(y);
	const tx = x - x0, ty = y - y0;
	x0 = ((x0 % N) + N) % N; y0 = ((y0 % N) + N) % N;
	const x1 = x0 + 1 === N ? 0 : x0 + 1;
	const y1 = y0 + 1 === N ? 0 : y0 + 1;
	const r0 = y0 * N, r1 = y1 * N;
	const a = src[r0 + x0], b = src[r0 + x1], c = src[r1 + x0], d = src[r1 + x1];
	const t = a + (b - a) * tx, u = c + (d - c) * tx;
	return t + (u - t) * ty;
}

/**
 * Domain-warp `src` by two 0..1 fields. `ampPx` is in pixels (so amp/N in uv).
 * Tiling-safe: the warp field is periodic and the gather wraps.
 */
export function warp(src, N, wxF, wyF, ampPx, out) {
	const dst = out || grab(N * N);
	const M = N - 1, pot = (N & M) === 0;
	const a2 = 2 * ampPx;
	// bias by a whole number of tiles so the truncation below is a valid floor
	// (and so we can use |0 instead of Math.floor in the hot loop)
	const BIAS = N * (2 + Math.ceil(Math.abs(ampPx) / N));
	for (let y = 0, i = 0; y < N; y++) {
		for (let x = 0; x < N; x++, i++) {
			const fx = BIAS + x + (wxF[i] - 0.5) * a2;
			const fy = BIAS + y + (wyF[i] - 0.5) * a2;
			let x0 = fx | 0, y0 = fy | 0;
			const tx = fx - x0, ty = fy - y0;
			let x1, y1;
			if (pot) { x0 &= M; y0 &= M; x1 = (x0 + 1) & M; y1 = (y0 + 1) & M; }
			else {
				x0 = ((x0 % N) + N) % N; y0 = ((y0 % N) + N) % N;
				x1 = x0 + 1 === N ? 0 : x0 + 1; y1 = y0 + 1 === N ? 0 : y0 + 1;
			}
			const r0 = y0 * N, r1 = y1 * N;
			const p = src[r0 + x0], q = src[r0 + x1];
			const r = src[r1 + x0], s = src[r1 + x1];
			const u = p + (q - p) * tx, v = r + (s - r) * tx;
			dst[i] = u + (v - u) * ty;
		}
	}
	return dst;
}

/**
 * Warp two source fields with one shared displacement — the address maths
 * (which is most of the cost) is done once for both gathers.
 */
export function warp2(srcA, srcB, N, wxF, wyF, ampPx, outA, outB) {
	const dA = outA || grab(N * N), dB = outB || grab(N * N);
	const M = N - 1, pot = (N & M) === 0;
	const a2 = 2 * ampPx;
	const BIAS = N * (2 + Math.ceil(Math.abs(ampPx) / N));
	for (let y = 0, i = 0; y < N; y++) {
		for (let x = 0; x < N; x++, i++) {
			const fx = BIAS + x + (wxF[i] - 0.5) * a2;
			const fy = BIAS + y + (wyF[i] - 0.5) * a2;
			let x0 = fx | 0, y0 = fy | 0;
			const tx = fx - x0, ty = fy - y0;
			let x1, y1;
			if (pot) { x0 &= M; y0 &= M; x1 = (x0 + 1) & M; y1 = (y0 + 1) & M; }
			else {
				x0 = ((x0 % N) + N) % N; y0 = ((y0 % N) + N) % N;
				x1 = x0 + 1 === N ? 0 : x0 + 1; y1 = y0 + 1 === N ? 0 : y0 + 1;
			}
			const r0 = y0 * N + x0, q0 = y0 * N + x1;
			const r1 = y1 * N + x0, q1 = y1 * N + x1;
			let p = srcA[r0], q = srcA[q0], r = srcA[r1], s = srcA[q1];
			let u = p + (q - p) * tx, v = r + (s - r) * tx;
			dA[i] = u + (v - u) * ty;
			p = srcB[r0]; q = srcB[q0]; r = srcB[r1]; s = srcB[q1];
			u = p + (q - p) * tx; v = r + (s - r) * tx;
			dB[i] = u + (v - u) * ty;
		}
	}
	return [dA, dB];
}

/** Convenience: fBm with two-field domain warping, all tiling. */
export function warpedFbm(N, opts = {}) {
	const seed = opts.seed === undefined ? 1 : opts.seed;
	const warpAmp = opts.warpAmp === undefined ? 0.06 : opts.warpAmp; // in uv
	const wf = opts.warpFreq === undefined ? 3 : opts.warpFreq;
	const base = fbm(N, Object.assign({}, opts, { seed: hashSeed(seed, 11), out: null }));
	if (warpAmp <= 0) return base;
	const wx = fbm(N, { seed: hashSeed(seed, 23), freq: wf, octaves: 3, gain: 0.55 });
	const wy = fbm(N, { seed: hashSeed(seed, 37), freq: wf, octaves: 3, gain: 0.55 });
	const out = warp(base, N, wx, wy, warpAmp * N);
	give(base, wx, wy);
	return out;
}

/* ------------------------------------------------------------------ *
 * tiling Worley / Voronoi
 * ------------------------------------------------------------------ */

/**
 * Tiling Worley on an f x f torus of cells, one jittered feature point each.
 * Returns distances in *cell units* (so ~0..0.9), the owning cell id, and a
 * per-cell random table (for per-cell colour / size variation).
 */
export function worley(N, f, seed, jitter = 1.0) {
	f = Math.max(1, Math.min(N, f | 0));
	const rnd = mulberry32(hashSeed(seed, 0x7b1de3a1));
	const nc = f * f;
	const px = new Float32Array(nc), py = new Float32Array(nc);
	const cellRand = new Float32Array(nc), cellRand2 = new Float32Array(nc);
	for (let i = 0; i < nc; i++) {
		const cx = i % f, cy = (i / f) | 0;
		px[i] = cx + 0.5 + (rnd() - 0.5) * jitter;
		py[i] = cy + 0.5 + (rnd() - 0.5) * jitter;
		cellRand[i] = rnd(); cellRand2[i] = rnd();
	}

	const n2 = N * N;
	const f1 = new Float32Array(n2), f2 = new Float32Array(n2);
	const id = new Int32Array(n2);
	const bound = new Int32Array(f + 1);
	for (let c = 0; c <= f; c++) bound[c] = Math.ceil((c * N) / f);

	const nx = new Float32Array(9), ny = new Float32Array(9), dy2 = new Float32Array(9);
	const nid = new Int32Array(9);
	const s = f / N;

	for (let cy = 0; cy < f; cy++) {
		const y0 = bound[cy], y1 = bound[cy + 1];
		for (let cx = 0; cx < f; cx++) {
			let k = 0;
			for (let oy = -1; oy <= 1; oy++) {
				const gy = cy + oy, wy = ((gy % f) + f) % f;
				for (let ox = -1; ox <= 1; ox++) {
					const gx = cx + ox, wx = ((gx % f) + f) % f;
					const i = wy * f + wx;
					nx[k] = px[i] + (gx - wx);
					ny[k] = py[i] + (gy - wy);
					nid[k] = i; k++;
				}
			}
			// hoist the 9 candidates into locals — no bounds checks in the
			// pixel loop, which is where all the time goes
			const x0c = nx[0], x1c = nx[1], x2c = nx[2], x3c = nx[3], x4c = nx[4],
				x5c = nx[5], x6c = nx[6], x7c = nx[7], x8c = nx[8];
			const i0 = nid[0], i1 = nid[1], i2 = nid[2], i3 = nid[3], i4 = nid[4],
				i5 = nid[5], i6 = nid[6], i7 = nid[7], i8 = nid[8];
			const x0 = bound[cx], x1 = bound[cx + 1];
			for (let y = y0; y < y1; y++) {
				const v = y * s;
				for (let k2 = 0; k2 < 9; k2++) { const d = v - ny[k2]; dy2[k2] = d * d; }
				const d0 = dy2[0], d1 = dy2[1], d2 = dy2[2], d3 = dy2[3], d4 = dy2[4],
					d5 = dy2[5], d6 = dy2[6], d7 = dy2[7], d8 = dy2[8];
				const row = y * N;
				for (let x = x0; x < x1; x++) {
					const u = x * s;
					let b1, b2, bi, e, t;
					t = u - x0c; b1 = t * t + d0; bi = i0;
					t = u - x1c; e = t * t + d1;
					if (e < b1) { b2 = b1; b1 = e; bi = i1; } else b2 = e;
					t = u - x2c; e = t * t + d2;
					if (e < b1) { b2 = b1; b1 = e; bi = i2; } else if (e < b2) b2 = e;
					t = u - x3c; e = t * t + d3;
					if (e < b1) { b2 = b1; b1 = e; bi = i3; } else if (e < b2) b2 = e;
					t = u - x4c; e = t * t + d4;
					if (e < b1) { b2 = b1; b1 = e; bi = i4; } else if (e < b2) b2 = e;
					t = u - x5c; e = t * t + d5;
					if (e < b1) { b2 = b1; b1 = e; bi = i5; } else if (e < b2) b2 = e;
					t = u - x6c; e = t * t + d6;
					if (e < b1) { b2 = b1; b1 = e; bi = i6; } else if (e < b2) b2 = e;
					t = u - x7c; e = t * t + d7;
					if (e < b1) { b2 = b1; b1 = e; bi = i7; } else if (e < b2) b2 = e;
					t = u - x8c; e = t * t + d8;
					if (e < b1) { b2 = b1; b1 = e; bi = i8; } else if (e < b2) b2 = e;
					f1[row + x] = Math.sqrt(b1);
					f2[row + x] = Math.sqrt(b2);
					id[row + x] = bi;
				}
			}
		}
	}
	return { f1, f2, id, cellRand, cellRand2, f };
}

/** Cell-edge ridge field in 0..1 (1 exactly on a voronoi boundary). */
export function worleyEdges(w, N, width = 0.06, out) {
	const dst = out || grab(N * N);
	const { f1, f2 } = w;
	const iw = 1 / width;
	for (let i = 0, n = N * N; i < n; i++) {
		const t = clamp01(1 - (f2[i] - f1[i]) * iw);
		dst[i] = t * t * (3 - 2 * t);
	}
	return dst;
}

/* ------------------------------------------------------------------ *
 * filters
 * ------------------------------------------------------------------ */

/**
 * 1-D box blur with wrap-around along one axis (axis 0 = x, 1 = y).
 * O(1) per pixel regardless of radius. Also the workhorse for anisotropic
 * (stretched) noise: blurring sparse dots along one axis yields scratches,
 * fibres, wind streaks, rolling marks...
 */
export function blurAxis(src, N, r, axis, out) {
	r = Math.max(1, Math.min((N >> 1) - 1, r | 0));
	const dst = out || grab(N * N);
	const inv = 1 / (2 * r + 1);
	if (axis === 0) {
		for (let y = 0; y < N; y++) {
			const o = y * N;
			let sum = 0;
			for (let k = -r; k <= r; k++) sum += src[o + (((k % N) + N) % N)];
			for (let x = 0; x < N; x++) {
				dst[o + x] = sum * inv;
				sum += src[o + ((x + r + 1) % N)] - src[o + (((x - r) % N) + N) % N];
			}
		}
	} else {
		// row-sequential vertical blur: keep N running column sums in a small
		// buffer so every memory access stays linear (a naive strided version
		// is ~3x slower because of cache misses).
		const sum = new Float32Array(N);
		for (let k = -r; k <= r; k++) {
			const o = ((((k % N) + N) % N)) * N;
			for (let x = 0; x < N; x++) sum[x] += src[o + x];
		}
		for (let y = 0; y < N; y++) {
			const o = y * N;
			for (let x = 0; x < N; x++) dst[o + x] = sum[x] * inv;
			const oa = ((y + r + 1) % N) * N;
			const ob = ((((y - r) % N) + N) % N) * N;
			for (let x = 0; x < N; x++) sum[x] += src[oa + x] - src[ob + x];
		}
	}
	return dst;
}

/** Separable box blur with wrap-around (O(1) per pixel, radius independent). */
export function blurWrap(src, N, r, out, tmp) {
	const dst = out || grab(N * N);
	const t = tmp || grab(N * N);
	blurAxis(src, N, r, 0, t);
	blurAxis(t, N, r, 1, dst);
	if (!tmp) give(t);
	return dst;
}

/** Rescale a field so [min,max] -> [0,1]. */
export function normalize01(a, lo = 0, hi = 1) {
	let mn = Infinity, mx = -Infinity;
	for (let i = 0; i < a.length; i++) { const v = a[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
	const d = mx - mn;
	if (d < 1e-12) { a.fill((lo + hi) * 0.5); return a; }
	const k = (hi - lo) / d;
	for (let i = 0; i < a.length; i++) a[i] = lo + (a[i] - mn) * k;
	return a;
}

/** Mean / rms helpers. */
export function meanOf(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
export function rmsOf(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); }

/**
 * Gravity streaks: propagate a source field downward (towards v = 0, i.e.
 * decreasing row index) with exponential decay. Two passes so it wraps.
 */
export function streakDown(src, N, decay, out) {
	const dst = out || grab(N * N);
	for (let x = 0; x < N; x++) {
		let v = 0;
		for (let pass = 0; pass < 2; pass++) {
			for (let y = N - 1; y >= 0; y--) {
				const i = y * N + x;
				const s = src[i];
				v = v * decay;
				if (s > v) v = s;
				if (pass) dst[i] = v;
			}
		}
	}
	return dst;
}

/* ------------------------------------------------------------------ *
 * height -> normal / AO
 * ------------------------------------------------------------------ */

/**
 * Sobel normal map, tangent space, +Y up (OpenGL).
 * DataTexture has flipY = false, so increasing row index == increasing V,
 * hence gy is d(h)/d(v) directly and n = normalize(-dh/du, -dh/dv, 1).
 *
 * `targetSlope` is the desired RMS tangent-space slope: we measure the actual
 * gradient RMS of the height field and rescale to hit it. That means the normal
 * strength tracks the real height amplitude instead of being an arbitrary
 * constant (no tinfoil, no flat plastic).
 */
export function heightToNormalRGBA(h, N, targetSlope, out) {
	const n2 = N * N;
	const dst = out || new Uint8Array(n2 * 4);
	const xm = new Int32Array(N), xp = new Int32Array(N);
	for (let x = 0; x < N; x++) { xm[x] = (x - 1 + N) % N; xp[x] = (x + 1) % N; }

	// pass 1 — measure the real gradient RMS on a strided sample (cheap)
	let acc = 0, cnt = 0;
	const step = N >= 256 ? 4 : 1;
	for (let y = 0; y < N; y += step) {
		const ym = ((y - 1 + N) % N) * N, y0 = y * N, yp = ((y + 1) % N) * N;
		for (let x = 0; x < N; x++) {
			const xa = xm[x], xb = xp[x];
			const a = h[ym + xa], b = h[ym + x], c = h[ym + xb];
			const d = h[y0 + xa], e2 = h[y0 + xb];
			const f = h[yp + xa], g = h[yp + x], i2 = h[yp + xb];
			const sx = (c + 2 * e2 + i2) - (a + 2 * d + f);
			const sy = (f + 2 * g + i2) - (a + 2 * b + c);
			acc += sx * sx + sy * sy; cnt += 2;
		}
	}
	const rms = Math.sqrt(acc / cnt) * 0.125;
	const k = rms > 1e-9 ? (targetSlope / rms) * 0.125 : 0;

	// pass 2 — Sobel + tangent-space encode, packed as one 32-bit store per texel
	const words = LE ? new Uint32Array(dst.buffer, dst.byteOffset, n2) : null;
	for (let y = 0; y < N; y++) {
		const ym = ((y - 1 + N) % N) * N, y0 = y * N, yp = ((y + 1) % N) * N;
		for (let x = 0; x < N; x++) {
			const xa = xm[x], xb = xp[x];
			const a = h[ym + xa], b = h[ym + x], c = h[ym + xb];
			const d = h[y0 + xa], e2 = h[y0 + xb];
			const f = h[yp + xa], g = h[yp + x], i2 = h[yp + xb];
			let nx = -((c + 2 * e2 + i2) - (a + 2 * d + f)) * k;
			let ny = -((f + 2 * g + i2) - (a + 2 * b + c)) * k;
			// soft-clamp extreme slopes so isolated texel spikes don't shatter the map
			const m2 = nx * nx + ny * ny;
			if (m2 > 16) { const s = 4 / Math.sqrt(m2); nx *= s; ny *= s; }
			const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
			const R = (nx * inv * 127.5 + 128) | 0;
			const G = (ny * inv * 127.5 + 128) | 0;
			const B = (inv * 127.5 + 128) | 0;
			const i = y0 + x;
			if (words) words[i] = 0xff000000 | (B << 16) | (G << 8) | R;
			else { const j = i * 4; dst[j] = R; dst[j + 1] = G; dst[j + 2] = B; dst[j + 3] = 255; }
		}
	}
	return dst;
}

/** Little-endian? (every browser/CPU we target is, but be correct anyway) */
export const LE = (() => {
	const b = new ArrayBuffer(4);
	new Uint32Array(b)[0] = 0x01020304;
	return new Uint8Array(b)[0] === 0x04;
})();

/**
 * Multi-scale ambient occlusion from a height field: a texel is occluded when
 * its neighbourhood mean (at several radii) sits above it. Cheap, stable and
 * — crucially — *correlated but not identical* to height.
 */
export function heightToAO(h, N, strength = 1.0, radii = null) {
	const n2 = N * N;
	const ao = grab(n2);
	const rs = radii || [Math.max(1, N >> 7), Math.max(3, N >> 4)];
	const ws = [0.42, 0.58];
	const tmp = grab(n2), blr = grab(n2);
	for (let s = 0; s < rs.length; s++) {
		blurWrap(h, N, rs[s], blr, tmp);
		// occlusion scale from a strided sample of the cavity depth
		let acc = 0, cnt = 0;
		for (let i = 0; i < n2; i += 7) { const d = blr[i] - h[i]; if (d > 0) acc += d * d; cnt++; }
		const rms = Math.sqrt(acc / cnt);
		const k = rms > 1e-9 ? 1 / (rms * 4.5) : 0;
		const w = ws[s];
		if (s === 0) {
			for (let i = 0; i < n2; i++) {
				let d = (blr[i] - h[i]) * k;
				if (d < 0) d = 0; else if (d > 1) d = 1;
				ao[i] = w * d * d * (3 - 2 * d);
			}
		} else {
			for (let i = 0; i < n2; i++) {
				let d = (blr[i] - h[i]) * k;
				if (d < 0) d = 0; else if (d > 1) d = 1;
				let v = 1 - strength * (ao[i] + w * d * d * (3 - 2 * d));
				ao[i] = v < 0 ? 0 : v > 1 ? 1 : v;
			}
		}
	}
	give(tmp, blr);
	return ao;
}

/* ------------------------------------------------------------------ *
 * colour space
 * ------------------------------------------------------------------ */

const SRGB_LUT = (() => {
	const n = 4096, t = new Float32Array(n + 1);
	for (let i = 0; i <= n; i++) {
		const x = i / n;
		t[i] = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
	}
	return t;
})();

/** Linear -> sRGB encoded byte (LUT + lerp; no Math.pow in hot loops). */
export function linearToSRGB8(x) {
	if (x <= 0) return 0;
	if (x >= 1) return 255;
	const t = x * 4096;
	const i = t | 0;
	const f = t - i;
	return (SRGB_LUT[i] + (SRGB_LUT[i + 1] - SRGB_LUT[i]) * f) * 255 + 0.5;
}

export const Noise = {
	mulberry32, hashSeed, clamp, clamp01, lerp, fade, smoothstep, stepSharp,
	fbm, warpedFbm, white, addOctave, worley, worleyEdges, warp, warp2, sampleWrap,
	blurWrap, blurAxis, normalize01, streakDown, heightToNormalRGBA, heightToAO,
	linearToSRGB8, grab, give, meanOf, rmsOf, TAU, LE,
};
export default Noise;
