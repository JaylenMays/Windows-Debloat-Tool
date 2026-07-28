/**
 * AETHERIUM — src/render/textures.js
 * Procedural PBR texture library (CONTRACTS.md section A).
 *
 *   makeMaterialSet(kind, opts) -> { map, normalMap, roughnessMap, aoMap,
 *                                    displacementMap, metalnessMap|null, params }
 *   makeEnvironmentHDRI(renderer, params) -> THREE.Texture (PMREM)
 *   Noise                                  -> seeded tiling noise utilities
 *   __selftest()                           -> timings + tile-seam error metrics
 *
 * Design notes (why this doesn't look like "procedural noise"):
 *  - Every field is built from *structured* primitives (strata, fracture
 *    networks, weaves, panel partitions, flake fronts) and only then perturbed
 *    by fBm — never the other way around.
 *  - albedo / roughness / AO are correlated with, but decorrelated *from*, the
 *    height field: recesses go darker + dirtier, raised edges get worn and
 *    brighter, and each map carries its own independent breakup octaves.
 *  - Roughness is never constant; it always has at least two scales of breakup.
 *  - All noise lattices are toroidal, so every map tiles exactly.
 */

import * as THREE from '../../vendor/three.module.js';
import * as N_ from './noise.js';

export const Noise = N_.Noise;

const {
	mulberry32, hashSeed, clamp01, lerp, smoothstep,
	fbm, white, worley, worleyEdges, warp, blurWrap, blurAxis,
	normalize01, streakDown, heightToNormalRGBA, heightToAO,
	linearToSRGB8, grab, give, TAU,
} = N_;

export const KINDS = [
	'rock', 'sand', 'ice', 'regolith', 'basalt', 'metalPanel',
	'carbonWeave', 'fabric', 'skin', 'concrete', 'alienCoral', 'rustedIron',
];

/* ================================================================== *
 * small helpers
 * ================================================================== */

const F = (base, s) => Math.max(1, Math.round(base * s));
const OC = (base, d) => Math.max(1, Math.min(10, Math.round(base * d)));

function newCtx(N, seed, scale, detail) {
	const n2 = N * N;
	return {
		N, n2, seed, scale, detail,
		h: grab(n2), r: grab(n2), g: grab(n2), b: grab(n2),
		rough: grab(n2), ao: grab(n2), metal: null,
		slope: 0.55,        // target RMS tangent slope for the normal map
		aoStrength: 1.0,    // strength of the height-derived cavity AO
		params: { metalness: 0, roughness: 1, normalScale: 1 },
	};
}

/** Random split boundaries of [0,N) into k pieces, deterministic. */
function randomSplits(N, k, rnd, variance) {
	const w = new Float64Array(k);
	let s = 0;
	for (let i = 0; i < k; i++) { w[i] = 1 + (rnd() * 2 - 1) * variance; s += w[i]; }
	const b = new Int32Array(k + 1);
	let acc = 0;
	for (let i = 0; i < k; i++) { acc += w[i]; b[i + 1] = Math.round((acc / s) * N); }
	b[0] = 0; b[k] = N;
	return b;
}

/** 1-D wrapped distance-to-boundary + cell index for a set of split points. */
function bandInfo(N, bounds, offset) {
	const k = bounds.length - 1;
	const d = new Float32Array(N).fill(1e9);
	const idx = new Int32Array(N);
	const pos = new Int32Array(k);
	for (let i = 0; i < k; i++) {
		const p = (((bounds[i] + offset) % N) + N) % N;
		pos[i] = p; d[p] = 0;
	}
	const order = [];
	for (let i = 0; i < k; i++) order.push(i);
	order.sort((a, c) => pos[a] - pos[c]);
	let cur = order[k - 1], ptr = 0;
	for (let x = 0; x < N; x++) {
		while (ptr < k && pos[order[ptr]] === x) { cur = order[ptr]; ptr++; }
		idx[x] = cur;
	}
	// two wrapped passes each way; `v` carries over so the distance wraps
	let v = 1e9;
	for (let pass = 0; pass < 2; pass++) {
		for (let x = 0; x < N; x++) { v = v + 1 < d[x] ? v + 1 : d[x]; d[x] = v; }
	}
	v = 1e9;
	for (let pass = 0; pass < 2; pass++) {
		for (let x = N - 1; x >= 0; x--) { v = v + 1 < d[x] ? v + 1 : d[x]; d[x] = v; }
	}
	return { d, idx };
}

/**
 * Sparse anisotropic scratch field: dots -> stretched along `axis` -> warped so
 * they curve slightly. Returns 0..1 with thin bright lines.
 */
function scratchField(N, seed, density, lenPx, axis, curve = 0) {
	const w = white(N, seed);
	const pts = grab(N * N);
	const thr = 1 - density;
	for (let i = 0; i < N * N; i++) pts[i] = w[i] > thr ? (w[i] - thr) / density : 0;
	const line = blurAxis(pts, N, lenPx, axis);
	const k = 2 * lenPx + 1;
	for (let i = 0; i < N * N; i++) { const v = line[i] * k; line[i] = v > 1 ? 1 : v; }
	give(w, pts);
	if (curve > 0) {
		const wx = fbm(N, { seed: hashSeed(seed, 91), freq: 3, octaves: 2 });
		const wy = fbm(N, { seed: hashSeed(seed, 92), freq: 3, octaves: 2 });
		const out = warp(line, N, wx, wy, curve * N);
		give(line, wx, wy);
		return out;
	}
	return line;
}

/* ================================================================== *
 * material generators — each fills ctx.h / r,g,b / rough / ao
 * ================================================================== */

/* ---------------------------------------------------------- rock / basalt */
function genRock(m, basalt) {
	const { N, n2, seed, scale: s, detail } = m;
	const wx = fbm(N, { seed: hashSeed(seed, 1), freq: F(3, s), octaves: 2, gain: 0.6 });
	const wy = fbm(N, { seed: hashSeed(seed, 2), freq: F(3, s), octaves: 2, gain: 0.6 });

	// --- bedding planes + main relief, domain-warped together so the whole
	//     surface buckles coherently instead of looking like layered noise
	const strat0 = fbm(N, { seed: hashSeed(seed, 3), freq: F(2, s), octaves: 3, gain: 0.52 });
	const base0 = fbm(N, { seed: hashSeed(seed, 4), freq: F(5, s), octaves: OC(6, detail), gain: 0.5 });
	const [strat, base] = N_.warp2(strat0, base0, N, wx, wy, 0.09 * N);

	// --- chunky blocks: rounded worley domes give the surface real "boulders"
	//     and, crucially, a per-block albedo/roughness identity
	const lw = worley(N, F(basalt ? 6 : 4, s), hashSeed(seed, 10), 1.0);

	// --- fracture network, warped so the cells stop looking like Voronoi
	const w1 = worley(N, F(basalt ? 5 : 10, s), hashSeed(seed, 5), 1.0);
	const w2 = worley(N, F(basalt ? 12 : 24, s), hashSeed(seed, 6), 1.0);
	const e1r = worleyEdges(w1, N, basalt ? 0.085 : 0.045);
	const e2r = worleyEdges(w2, N, 0.065);
	const [e1, e2] = N_.warp2(e1r, e2r, N, wx, wy, 0.055 * N);
	const cmask = fbm(N, { seed: hashSeed(seed, 7), freq: F(4, s), octaves: 3 });

	// --- fine grain + micro pitting
	const grain0 = white(N, hashSeed(seed, 8));
	const grain = blurWrap(grain0, N, 1);
	const vesicle = basalt ? worley(N, F(48, s), hashSeed(seed, 9), 1.0) : null;

	// --- decorrelated colour fields (this is what kills the "noise" look)
	const mineral = fbm(N, { seed: hashSeed(seed, 21), freq: F(5, s), octaves: 3, gain: 0.55 });
	const lichenN = fbm(N, { seed: hashSeed(seed, 22), freq: F(7, s), octaves: 3, gain: 0.55 });
	const oxid = fbm(N, { seed: hashSeed(seed, 23), freq: F(9, s), octaves: 2 });
	const rghN = fbm(N, { seed: hashSeed(seed, 24), freq: F(13, s), octaves: 2 });
	const rghL = fbm(N, { seed: hashSeed(seed, 25), freq: F(2, s), octaves: 2 });

	const bands = basalt ? 5 : 7;
	// palette (linear)
	const cA = basalt ? [0.026, 0.026, 0.029] : [0.072, 0.066, 0.058];
	const cB = basalt ? [0.058, 0.055, 0.053] : [0.152, 0.138, 0.116];
	const cLich = basalt ? [0.048, 0.056, 0.040] : [0.068, 0.082, 0.050];
	const cOx = [0.120, 0.058, 0.021];

	const crackF = grab(n2), vesF = grab(n2), lumpF = grab(n2);
	for (let i = 0; i < n2; i++) {
		// two crack scales living in *complementary* regions: no single
		// statistical process covers the whole tile
		const mk = cmask[i];
		crackF[i] = clamp01(
			e1[i] * smoothstep(0.40, 0.72, mk) * (basalt ? 0.95 : 0.8)
			+ e2[i] * smoothstep(0.34, 0.66, 1 - mk) * 0.42);
		const l = 1 - lw.f1[i] * 1.30;
		lumpF[i] = l > 0 ? l * l : 0;
		if (vesicle) {
			const cr = vesicle.cellRand[vesicle.id[i]];
			vesF[i] = cr > 0.62 ? clamp01(1 - vesicle.f1[i] / (0.14 + 0.24 * cr)) * (0.35 + 0.65 * cr) : 0;
		} else vesF[i] = 0;
	}

	for (let i = 0; i < n2; i++) {
		// terraced strata: floor + a soft riser => ledges, not sine waves
		const t = strat[i] * bands;
		const fl = Math.floor(t), fr = t - fl;
		const terr = (fl + smoothstep(0.50, 0.97, fr)) / bands;
		m.h[i] = clamp01(0.5
			+ 0.24 * (base[i] - 0.5)
			+ 0.12 * (terr - 0.5)
			+ 0.17 * (lumpF[i] - 0.32)
			- 0.13 * crackF[i]
			- 0.075 * vesF[i] * vesF[i]
			+ 0.030 * (grain[i] - 0.5));
	}
	normalize01(m.h, 0.03, 0.97);

	for (let i = 0; i < n2; i++) {
		const h = m.h[i];
		const lid = lw.id[i];
		const mn = smoothstep(0.22, 0.82, mineral[i] * 0.68 + strat[i] * 0.32);
		let cr = cA[0] + (cB[0] - cA[0]) * mn;
		let cg = cA[1] + (cB[1] - cA[1]) * mn;
		let cb = cA[2] + (cB[2] - cA[2]) * mn;

		// every block is a slightly different stone
		const blk = 0.80 + 0.42 * lw.cellRand2[lid];
		cr *= blk; cg *= blk * (0.97 + 0.06 * lw.cellRand[lid]); cb *= blk * (0.95 + 0.10 * lw.cellRand[lid]);

		// oxidation / iron staining, decorrelated from height
		const ox = smoothstep(0.58, 0.88, oxid[i] * 0.6 + mineral[i] * 0.4) * (basalt ? 0.20 : 0.45);
		cr = lerp(cr, cOx[0], ox); cg = lerp(cg, cOx[1], ox); cb = lerp(cb, cOx[2], ox);

		// lichen: biased into recesses, and only in patches
		const lch = smoothstep(0.56, 0.84, lichenN[i]) * smoothstep(0.08, 0.55, 1.0 - h) * (basalt ? 0.35 : 0.85);
		cr = lerp(cr, cLich[0], lch); cg = lerp(cg, cLich[1], lch); cb = lerp(cb, cLich[2], lch);

		const ck = crackF[i];
		const dk = 1 - 0.48 * ck;                 // crack interiors: dark, dusty
		const edge = 0.88 + 0.24 * h;             // abraded high spots read brighter
		const gr = 0.95 + 0.10 * grain[i];
		m.r[i] = cr * dk * edge * gr;
		m.g[i] = cg * dk * edge * gr;
		m.b[i] = cb * dk * edge * gr;

		// roughness: block identity + 3 scales of breakup + material logic
		let rg = (basalt ? 0.66 : 0.74)
			+ 0.10 * (lw.cellRand[lid] - 0.5)
			+ 0.09 * (rghN[i] - 0.5)
			+ 0.07 * (rghL[i] - 0.5)
			+ 0.035 * (grain[i] - 0.5) * 2;
		rg += 0.08 * ck;              // cracks trap dust -> rougher
		rg += 0.08 * lch;             // lichen is very diffuse
		rg -= 0.09 * smoothstep(0.6, 1.0, h) * (basalt ? 0.9 : 0.5); // polished high spots
		m.rough[i] = clamp01(rg);
		m.ao[i] = clamp01(1 - 0.34 * ck - 0.22 * vesF[i]);
	}

	m.slope = basalt ? 0.50 : 0.46;
	m.aoStrength = 0.85;
	m.params.roughness = 1; m.params.metalness = 0;
	give(wx, wy, strat0, strat, base0, base, e1, e2, e1r, e2r, cmask, grain0, grain,
		mineral, lichenN, oxid, rghN, rghL, crackF, vesF, lumpF);
}

/* ------------------------------------------------------- sand / regolith */
function genSand(m, regolith) {
	const { N, n2, seed, scale: s } = m;

	const dune = fbm(N, { seed: hashSeed(seed, 1), freq: F(2, s), octaves: 3, gain: 0.55 });
	// meander fields for the ripple phase (crests must wander, never be straight)
	const mea = fbm(N, { seed: hashSeed(seed, 2), freq: F(3, s), octaves: 3, gain: 0.6 });
	const mea2 = fbm(N, { seed: hashSeed(seed, 3), freq: F(7, s), octaves: 3, gain: 0.55 });
	// where the wind actually built ripples — large areas are just flat sand
	const ripMask = fbm(N, { seed: hashSeed(seed, 11), freq: F(3, s), octaves: 2 });
	const gw = white(N, hashSeed(seed, 4));
	const grain = blurWrap(gw, N, 1);
	const grainC = white(N, hashSeed(seed, 5));   // decorrelated colour speckle
	const peb = worley(N, F(regolith ? 18 : 24, s), hashSeed(seed, 6), 1.0);
	const cra = regolith ? worley(N, F(6, s), hashSeed(seed, 7), 1.0) : null;
	const tone = fbm(N, { seed: hashSeed(seed, 21), freq: F(4, s), octaves: 3, gain: 0.55 });
	const dust = fbm(N, { seed: hashSeed(seed, 22), freq: F(8, s), octaves: 2 });
	const rgh = fbm(N, { seed: hashSeed(seed, 23), freq: F(6, s), octaves: 2 });

	// ripple wave vector — integer components => exactly periodic
	const K = F(regolith ? 3 : 5, s);
	const A = 3 * K, B = 1 * K, A2 = -1 * K, B2 = 3 * K;
	const kA = TAU * A / N, kB = TAU * B / N;
	const kA2 = TAU * A2 / N, kB2 = TAU * B2 / N;

	const cLo = regolith ? [0.048, 0.046, 0.044] : [0.118, 0.086, 0.052];
	const cHi = regolith ? [0.108, 0.104, 0.098] : [0.255, 0.202, 0.134];
	const cPeb = regolith ? [0.032, 0.031, 0.030] : [0.098, 0.080, 0.058];
	const cDark = regolith ? [0.020, 0.019, 0.020] : [0.030, 0.020, 0.014];

	const rip = grab(n2), pebF = grab(n2);
	for (let y = 0, i = 0; y < N; y++) {
		for (let x = 0; x < N; x++, i++) {
			const ph = (mea[i] - 0.5) * 7.5 + (mea2[i] - 0.5) * 2.0;
			const r1 = 0.5 + 0.5 * Math.sin(kA * x + kB * y + ph);
			const r2 = 0.5 + 0.5 * Math.sin(kA2 * x + kB2 * y + ph * 0.7 + 1.7);
			// sharpen the crests, flatten the troughs, then fade the whole
			// ripple field in and out across the tile
			const c1 = r1 * r1 * (3 - 2 * r1);
			const mask = 0.18 + 0.82 * smoothstep(0.28, 0.72, ripMask[i]);
			rip[i] = clamp01(0.5 + (c1 * 0.80 + r2 * r2 * 0.20 - 0.5) * mask * (regolith ? 0.45 : 1.0));
		}
	}

	for (let i = 0; i < n2; i++) {
		const id = peb.id[i];
		const cr = peb.cellRand[id];
		let pd = 0;
		if (cr > (regolith ? 0.70 : 0.855)) {
			const rad = 0.12 + 0.26 * peb.cellRand2[id];
			const t = 1 - peb.f1[i] / rad;
			if (t > 0) pd = Math.sqrt(t) * (0.55 + 0.45 * cr);
		}
		pebF[i] = pd;
		let crat = 0;
		if (cra) {
			const c2 = cra.cellRand[cra.id[i]];
			if (c2 > 0.62) {
				const d = cra.f1[i] / (0.20 + 0.30 * c2);
				crat = d < 1 ? (1 - d) * (1 - d) * (c2 - 0.62) * 2.3 : 0;
			}
		}
		m.h[i] = clamp01(0.5
			+ 0.20 * (dune[i] - 0.5)
			+ 0.15 * (rip[i] - 0.5)
			+ 0.070 * pd
			- 0.13 * crat
			+ 0.024 * (grain[i] - 0.5));
	}
	normalize01(m.h, 0.05, 0.95);

	for (let i = 0; i < n2; i++) {
		const pd = pebF[i];
		const t = smoothstep(0.18, 0.88, tone[i] * 0.62 + dune[i] * 0.38);
		let cr = lerp(cLo[0], cHi[0], t);
		let cg = lerp(cLo[1], cHi[1], t);
		let cb = lerp(cLo[2], cHi[2], t);

		// dust film — lighter, desaturated, decorrelated from height
		const df = smoothstep(0.45, 0.88, dust[i]) * (regolith ? 0.42 : 0.28);
		cr = lerp(cr, cr * 1.28 + 0.010, df);
		cg = lerp(cg, cg * 1.24 + 0.010, df);
		cb = lerp(cb, cb * 1.20 + 0.012, df);

		// heavy dark minerals collect in the ripple troughs — a real and very
		// recognisable feature of wind-blown sand
		const hv = smoothstep(0.62, 0.98, grainC[i] * 0.6 + (1 - rip[i]) * 0.4) * 0.55;
		cr = lerp(cr, cDark[0], hv); cg = lerp(cg, cDark[1], hv); cb = lerp(cb, cDark[2], hv);

		const tr = 0.90 + 0.10 * rip[i];        // troughs pack down, read darker
		const sp = 0.92 + 0.16 * grainC[i];     // per-grain sparkle
		const pk = smoothstep(0.02, 0.30, pd);
		const pv = 0.65 + 0.75 * peb.cellRand2[peb.id[i]];
		cr = lerp(cr * tr * sp, cPeb[0] * pv, pk);
		cg = lerp(cg * tr * sp, cPeb[1] * pv, pk);
		cb = lerp(cb * tr * sp, cPeb[2] * pv, pk);
		m.r[i] = cr; m.g[i] = cg; m.b[i] = cb;

		let rg = 0.88
			+ 0.07 * (rgh[i] - 0.5)
			+ 0.05 * (grain[i] - 0.5) * 2
			- 0.04 * (1 - rip[i])
			+ 0.05 * df;
		rg = lerp(rg, 0.48 + 0.22 * peb.cellRand[peb.id[i]], pk);   // pebbles are smoother
		m.rough[i] = clamp01(rg);
		m.ao[i] = clamp01(1 - 0.16 * (1 - rip[i]));
	}

	m.slope = regolith ? 0.34 : 0.30;
	m.aoStrength = 0.7;
	give(dune, mea, mea2, ripMask, gw, grain, grainC, tone, dust, rgh, rip, pebF);
}

/* ------------------------------------------------------------------- ice */
function genIce(m) {
	const { N, n2, seed, scale: s } = m;
	const wx = fbm(N, { seed: hashSeed(seed, 1), freq: F(3, s), octaves: 2, gain: 0.6 });
	const wy = fbm(N, { seed: hashSeed(seed, 2), freq: F(3, s), octaves: 2, gain: 0.6 });
	const surf0 = fbm(N, { seed: hashSeed(seed, 3), freq: F(3, s), octaves: OC(5, m.detail), gain: 0.52 });
	const surf = warp(surf0, N, wx, wy, 0.05 * N);

	// crack networks at three scales — thin, deep, and warped so they read as
	// fracture, not as a Voronoi diagram
	const c1 = worley(N, F(5, s), hashSeed(seed, 4), 1.0);
	const c2 = worley(N, F(12, s), hashSeed(seed, 5), 1.0);
	const c3 = worley(N, F(30, s), hashSeed(seed, 6), 1.0);
	const e1r = worleyEdges(c1, N, 0.028);
	const e2r = worleyEdges(c2, N, 0.032);
	const e3 = worleyEdges(c3, N, 0.05);
	const [e1, e2] = N_.warp2(e1r, e2r, N, wx, wy, 0.045 * N);
	const cm = fbm(N, { seed: hashSeed(seed, 7), freq: F(4, s), octaves: 2 });

	// refrozen bubbles: sparse worley points -> bright speckle + tiny bumps
	const bub = worley(N, F(38, s), hashSeed(seed, 8), 1.0);
	const depth = fbm(N, { seed: hashSeed(seed, 21), freq: F(2, s), octaves: 3, gain: 0.6 });
	const layer = fbm(N, { seed: hashSeed(seed, 22), freq: F(3, s), octaves: 4, gain: 0.5 });
	const polish = fbm(N, { seed: hashSeed(seed, 23), freq: F(6, s), octaves: 3, gain: 0.5 });
	const frost = fbm(N, { seed: hashSeed(seed, 24), freq: F(16, s), octaves: 2 });

	const cDeep = [0.170, 0.300, 0.410];
	const cMid = [0.440, 0.600, 0.700];
	const cWhite = [0.790, 0.840, 0.885];

	const crk = grab(n2), bb = grab(n2);
	for (let i = 0; i < n2; i++) {
		const mk = cm[i];
		crk[i] = clamp01(e1[i] * (0.42 + 0.58 * smoothstep(0.30, 0.70, mk))
			+ e2[i] * 0.55 * smoothstep(0.34, 0.72, mk)
			+ e3[i] * 0.30 * smoothstep(0.30, 0.70, 1 - mk));
		const cr = bub.cellRand[bub.id[i]];
		bb[i] = cr > 0.74 ? clamp01(1 - bub.f1[i] / (0.09 + 0.14 * cr)) : 0;
	}

	for (let i = 0; i < n2; i++) {
		// layered banding along the level sets of a warped fBm
		const band = 0.5 + 0.5 * Math.sin(layer[i] * TAU * 5);
		m.h[i] = clamp01(0.5
			+ 0.28 * (surf[i] - 0.5)
			+ 0.055 * (band - 0.5)
			- 0.26 * crk[i]
			+ 0.045 * bb[i]
			+ 0.018 * (frost[i] - 0.5));
	}
	normalize01(m.h, 0.03, 0.97);

	for (let i = 0; i < n2; i++) {
		const d = smoothstep(0.12, 0.88, depth[i] * 0.72 + (1 - m.h[i]) * 0.28);
		const band = 0.5 + 0.5 * Math.sin(layer[i] * TAU * 5);
		// deeper ice reads blue; aerated / thin ice reads white
		let cr = lerp(cMid[0], cDeep[0], d), cg = lerp(cMid[1], cDeep[1], d), cb = lerp(cMid[2], cDeep[2], d);
		const wf = smoothstep(0.30, 0.92, band * 0.5 + frost[i] * 0.5) * 0.5;
		cr = lerp(cr, cWhite[0], wf); cg = lerp(cg, cWhite[1], wf); cb = lerp(cb, cWhite[2], wf);
		// cracks scatter light: recessed but *bright* — a classic ice signature
		const ck = crk[i];
		cr = lerp(cr, 0.84, ck * 0.62); cg = lerp(cg, 0.89, ck * 0.62); cb = lerp(cb, 0.95, ck * 0.62);
		const bv = bb[i];
		cr = lerp(cr, 0.90, bv * 0.8); cg = lerp(cg, 0.93, bv * 0.8); cb = lerp(cb, 0.96, bv * 0.8);
		m.r[i] = cr; m.g[i] = cg; m.b[i] = cb;

		// wide roughness variance: wet-polished patches vs frosted crust
		const pol = smoothstep(0.32, 0.70, polish[i] * 0.7 + frost[i] * 0.3);
		let rg = lerp(0.52, 0.09, pol)
			+ 0.10 * (frost[i] - 0.5)
			+ 0.09 * ck
			+ 0.05 * bv;
		m.rough[i] = clamp01(rg);
		m.ao[i] = clamp01(1 - 0.34 * ck);
	}

	m.slope = 0.40;
	m.aoStrength = 0.8;
	give(wx, wy, surf0, surf, e1, e2, e3, e1r, e2r, cm, depth, layer, polish, frost, crk, bb);
}

/* ----------------------------------------------------------- metal panel */
function genMetalPanel(m) {
	const { N, n2, seed, scale: s } = m;
	const rnd = mulberry32(hashSeed(seed, 0x901));

	// --- hard-edged panel partition: bands of rows, each row split into panels
	const nRows = Math.max(3, F(5, s));
	const rowB = randomSplits(N, nRows, rnd, 0.42);
	const rowInfo = bandInfo(N, rowB, 0);
	const rowsCols = [];
	for (let r = 0; r < nRows; r++) {
		const nc = Math.max(2, Math.round(F(4, s) * (0.7 + rnd() * 0.9)));
		rowsCols.push(bandInfo(N, randomSplits(N, nc, rnd, 0.5), (rnd() * N) | 0));
	}
	const panelRand = new Float32Array(nRows * 64);
	const panelRand2 = new Float32Array(nRows * 64);
	for (let i = 0; i < panelRand.length; i++) { panelRand[i] = rnd(); panelRand2[i] = rnd(); }

	// --- surface detail fields
	const dent = fbm(N, { seed: hashSeed(seed, 2), freq: F(6, s), octaves: 3, gain: 0.5 });
	const orange = fbm(N, { seed: hashSeed(seed, 3), freq: F(30, s), octaves: 2, gain: 0.5 }); // paint orange-peel
	const grime = fbm(N, { seed: hashSeed(seed, 4), freq: F(5, s), octaves: 4, gain: 0.55 });
	const wearN = fbm(N, { seed: hashSeed(seed, 5), freq: F(9, s), octaves: 3, gain: 0.55 });
	const rghN = fbm(N, { seed: hashSeed(seed, 6), freq: F(13, s), octaves: 2 });
	const sc1 = scratchField(N, hashSeed(seed, 7), 0.0013, Math.max(3, (N / 13) | 0), 0, 0.006);
	const sc2 = scratchField(N, hashSeed(seed, 8), 0.0007, Math.max(3, (N / 20) | 0), 1, 0.006);
	const sc3 = scratchField(N, hashSeed(seed, 9), 0.0030, Math.max(2, (N / 34) | 0), 0, 0.012);
	// soot/leak streaks running down from the seams
	const leakSrc = grab(n2);
	for (let i = 0; i < n2; i++) leakSrc[i] = smoothstep(0.72, 0.95, grime[i]);
	const leak = N_.streakDown(leakSrc, N, 0.986);

	const seamW = Math.max(1.3, N / 320);
	// the rivet lattice must divide N exactly or it would break the tiling
	let rivetSpacing = Math.max(8, Math.round(N / 26));
	while (N % rivetSpacing !== 0 && rivetSpacing > 4) rivetSpacing--;
	const rivetR = Math.max(1.8, N / 190);

	const paintA = [0.118, 0.126, 0.140];
	const paintB = [0.055, 0.061, 0.072];
	const bare = [0.330, 0.336, 0.352];

	m.metal = grab(n2);
	const seamF = grab(n2), wearF = grab(n2), rivF = grab(n2), pidF = grab(n2);

	for (let y = 0, i = 0; y < N; y++) {
		const ri = rowInfo.idx[y], rd = rowInfo.d[y];
		const ci = rowsCols[ri];
		for (let x = 0; x < N; x++, i++) {
			const cd = ci.d[x];
			const d = rd < cd ? rd : cd;
			const pid = (ri * 64 + ci.idx[x]) % panelRand.length;
			pidF[i] = pid;
			seamF[i] = 1 - smoothstep(seamW * 0.5, seamW * 2.0, d);
			// rivets: regular lattice, kept only in a band alongside the seams
			const rx = Math.abs(((x % rivetSpacing) + rivetSpacing) % rivetSpacing - rivetSpacing * 0.5);
			const ry = Math.abs(((y % rivetSpacing) + rivetSpacing) % rivetSpacing - rivetSpacing * 0.5);
			const rdist = Math.sqrt(rx * rx + ry * ry);
			const inBand = smoothstep(seamW * 1.8, seamW * 2.8, d) * (1 - smoothstep(seamW * 4.5, seamW * 6.5, d));
			rivF[i] = inBand * (1 - smoothstep(rivetR * 0.45, rivetR, rdist));
			// paint rubs off along the seams, on the rivets and where it is scuffed
			wearF[i] = clamp01(
				smoothstep(0.40, 0.86, wearN[i]) * (1 - smoothstep(seamW * 1.0, seamW * 7.0, d)) * 1.25
				+ rivF[i] * 0.55 * smoothstep(0.28, 0.7, wearN[i])
				+ sc3[i] * 0.22);
		}
	}

	for (let i = 0; i < n2; i++) {
		const pid = pidF[i] | 0;
		const pr = panelRand[pid];
		const scr = clamp01(sc1[i] * 0.9 + sc2[i] * 0.6 + sc3[i] * 0.35);
		m.h[i] = clamp01(0.64
			+ 0.045 * (pr - 0.5)                    // per-panel bow
			+ 0.050 * (dent[i] - 0.5)               // gentle dents
			+ 0.009 * (orange[i] - 0.5)             // orange peel in the paint
			- 0.40 * seamF[i]                        // seam groove
			+ 0.26 * rivF[i]                         // rivet dome
			- 0.018 * scr);
	}

	for (let i = 0; i < n2; i++) {
		const pid = pidF[i] | 0;
		const pr = panelRand[pid], pr2 = panelRand2[pid];
		const seam = seamF[i], wear = wearF[i], riv = rivF[i];
		const scr = clamp01(sc1[i] * 0.9 + sc2[i] * 0.6 + sc3[i] * 0.35);

		// per-panel paint colour variation (repaints, different batches)
		let cr = lerp(paintB[0], paintA[0], pr2) * (0.84 + 0.32 * pr);
		let cg = lerp(paintB[1], paintA[1], pr2) * (0.84 + 0.32 * pr);
		let cb = lerp(paintB[2], paintA[2], pr2) * (0.84 + 0.32 * pr);
		const op = 0.955 + 0.09 * orange[i];
		cr *= op; cg *= op; cb *= op;

		// edge wear + scratches expose bare metal
		const ex = clamp01(wear * 0.9 + scr * 0.8);
		cr = lerp(cr, bare[0], ex); cg = lerp(cg, bare[1], ex); cb = lerp(cb, bare[2], ex);

		// grime accumulates in the seams and streaks down from them
		const gm = clamp01(smoothstep(0.42, 0.85, grime[i]) * 0.40 + seam * 0.80 + leak[i] * 0.45);
		cr = lerp(cr, cr * 0.34 + 0.005, gm); cg = lerp(cg, cg * 0.33 + 0.0045, gm); cb = lerp(cb, cb * 0.31 + 0.004, gm);
		m.r[i] = cr; m.g[i] = cg; m.b[i] = cb;

		// roughness: per-panel base + micro breakup + burnished scratches + grime
		let rg = 0.44 + 0.13 * (pr2 - 0.5)
			+ 0.09 * (rghN[i] - 0.5)
			+ 0.04 * (orange[i] - 0.5) * 2;
		rg = lerp(rg, 0.16, scr * 0.85);
		rg = lerp(rg, 0.28, wear * 0.55);
		rg = lerp(rg, 0.82, gm * 0.65);
		rg = lerp(rg, 0.34, riv * 0.6);
		m.rough[i] = clamp01(rg);

		m.metal[i] = clamp01(0.20 + 0.78 * ex - 0.30 * gm + 0.35 * riv);
		m.ao[i] = clamp01(1 - 0.55 * seam - 0.10 * gm * (1 - seam));
	}

	m.slope = 0.62;
	m.aoStrength = 0.7;
	m.params.metalness = 1; m.params.roughness = 1;
	give(dent, orange, grime, wearN, rghN, sc1, sc2, sc3, seamF, wearF, rivF, pidF, leakSrc, leak);
}

/* ---------------------------------------------------------- carbon weave */
function genCarbon(m) {
	const { N, n2, seed, scale: s } = m;
	// tow count must divide N and be a multiple of 4 for a 2/2 twill to wrap
	let T = Math.max(4, Math.round(F(12, s)));
	T = Math.max(4, T - (T % 4));
	while (N % T !== 0 && T > 4) T -= 4;
	const p = N / T;

	const fib0 = white(N, hashSeed(seed, 1));
	const fibV = blurAxis(fib0, N, Math.max(2, (p * 1.5) | 0), 1);  // filaments along +v
	const fibH = blurAxis(fib0, N, Math.max(2, (p * 1.5) | 0), 0);  // filaments along +u
	const coat = fbm(N, { seed: hashSeed(seed, 2), freq: F(3, s), octaves: 3, gain: 0.55 });
	const dustN = fbm(N, { seed: hashSeed(seed, 3), freq: F(9, s), octaves: 3 });
	const sc = scratchField(N, hashSeed(seed, 4), 0.0007, Math.max(3, (N / 18) | 0), 0, 0.004);

	const base = [0.0110, 0.0115, 0.0130];
	const sheen = [0.115, 0.120, 0.140];

	const warpUp = new Uint8Array(n2), filF = grab(n2);
	for (let y = 0, i = 0; y < N; y++) {
		const j = (y / p) | 0, ty = (y / p) - j;
		for (let x = 0; x < N; x++, i++) {
			const ii = (x / p) | 0, tx = (x / p) - ii;
			const tw = (((ii - j) % 4) + 4) % 4;
			const up = tw < 2 ? 1 : 0;  // 2/2 twill: warp floats over 2, under 2
			warpUp[i] = up;
			// rounded tow cross-section (semicircle) across the *floating* tow
			const t = up ? tx : ty;
			const c = (t - 0.5) * 2;
			const prof = Math.sqrt(Math.max(0, 1 - c * c * 0.92));
			const t2 = up ? ty : tx;
			const c2 = (t2 - 0.5) * 2;
			const prof2 = Math.sqrt(Math.max(0, 1 - c2 * c2));
			const fil = up ? fibV[i] : fibH[i];
			filF[i] = fil;
			m.h[i] = clamp01(0.30 + 0.44 * prof + 0.05 * prof2 + 0.030 * (fil - 0.5)
				+ 0.015 * (coat[i] - 0.5));
		}
	}
	normalize01(m.h, 0.06, 0.94);

	for (let i = 0; i < n2; i++) {
		const fil = filF[i];
		const h = m.h[i];
		// anisotropic sheen: the tow catches light along its filaments
		const sh = clamp01((0.22 + 0.95 * fil) * smoothstep(0.18, 0.92, h));
		let cr = lerp(base[0], sheen[0], sh);
		let cg = lerp(base[1], sheen[1], sh);
		let cb = lerp(base[2], sheen[2], sh);
		// resin pools darker in the interstices
		const pit = 1 - smoothstep(0.05, 0.45, h);
		cr *= 1 - 0.40 * pit; cg *= 1 - 0.36 * pit; cb *= 1 - 0.32 * pit;
		const dg = smoothstep(0.62, 0.96, dustN[i]) * 0.10;
		cr = lerp(cr, 0.045, dg); cg = lerp(cg, 0.046, dg); cb = lerp(cb, 0.049, dg);
		cr = lerp(cr, 0.075, sc[i] * 0.30); cg = lerp(cg, 0.076, sc[i] * 0.30); cb = lerp(cb, 0.081, sc[i] * 0.30);
		m.r[i] = cr; m.g[i] = cg; m.b[i] = cb;

		// clear coat => low roughness, with real breakup and fibre anisotropy
		let rg = 0.10
			+ 0.085 * (1 - fil)
			+ 0.045 * (coat[i] - 0.5)
			+ 0.055 * pit
			+ 0.10 * dg
			+ 0.13 * sc[i];
		m.rough[i] = clamp01(rg);
		m.ao[i] = clamp01(1 - 0.38 * pit);
	}

	m.slope = 0.34;
	m.aoStrength = 0.7;
	m.params.roughness = 1;
	give(fib0, fibV, fibH, coat, dustN, sc, filF);
}

/* ---------------------------------------------------------------- fabric */
function genFabric(m) {
	const { N, n2, seed, scale: s } = m;
	let T = Math.max(2, Math.round(F(30, s)));
	T -= T % 2;                                  // plain weave needs an even count
	while (N % T !== 0 && T > 2) T -= 2;
	const p = N / T;

	const fib0 = white(N, hashSeed(seed, 1));
	const fibV = blurAxis(fib0, N, Math.max(1, (p * 1.1) | 0), 1);
	const fibH = blurAxis(fib0, N, Math.max(1, (p * 1.1) | 0), 0);
	const fuzz0 = white(N, hashSeed(seed, 2));
	const fuzz = blurWrap(fuzz0, N, 1);
	const yarn = fbm(N, { seed: hashSeed(seed, 3), freq: F(10, s), octaves: 3 });
	const heather = fbm(N, { seed: hashSeed(seed, 4), freq: F(20, s), octaves: 2 });
	const shade = fbm(N, { seed: hashSeed(seed, 5), freq: F(3, s), octaves: 3, gain: 0.55 });
	const wearN = fbm(N, { seed: hashSeed(seed, 6), freq: F(6, s), octaves: 3 });

	const cWarp = [0.062, 0.068, 0.086];
	const cWeft = [0.040, 0.045, 0.060];
	const cFuzz = [0.125, 0.132, 0.150];

	const upA = new Uint8Array(n2), filF = grab(n2);
	for (let y = 0, i = 0; y < N; y++) {
		const j = (y / p) | 0, ty = (y / p) - j;
		for (let x = 0; x < N; x++, i++) {
			const ii = (x / p) | 0, tx = (x / p) - ii;
			const up = ((ii + j) & 1) === 0 ? 1 : 0;   // plain weave
			upA[i] = up;
			const t = up ? tx : ty;
			const c = (t - 0.5) * 2;
			const prof = Math.sqrt(Math.max(0, 1 - c * c * 0.95));
			const t2 = up ? ty : tx;
			const c2 = (t2 - 0.5) * 2;
			const prof2 = Math.sqrt(Math.max(0, 1 - c2 * c2));
			const fil = up ? fibV[i] : fibH[i];
			filF[i] = fil;
			// yarn thickness wobbles along its length — real yarn is not a tube
			const wob = 0.9 + 0.2 * (up ? fibH[i] : fibV[i]);
			m.h[i] = clamp01(0.24 + 0.44 * prof * wob + 0.10 * prof2
				+ 0.06 * (fil - 0.5) + 0.085 * (fuzz[i] - 0.5) + 0.025 * (shade[i] - 0.5));
		}
	}
	normalize01(m.h, 0.05, 0.95);

	for (let i = 0; i < n2; i++) {
		const up = upA[i];
		const fil = filF[i];
		const h = m.h[i];
		const cA = up ? cWarp : cWeft;
		const hv = 0.78 + 0.50 * heather[i];       // heathered yarn tone
		let cr = cA[0] * hv, cg = cA[1] * hv, cb = cA[2] * hv;
		const fz = smoothstep(0.5, 1.0, h * 0.55 + fuzz[i] * 0.45);
		cr = lerp(cr, cFuzz[0], fz * 0.5); cg = lerp(cg, cFuzz[1], fz * 0.5); cb = lerp(cb, cFuzz[2], fz * 0.5);
		const wr = smoothstep(0.55, 0.92, wearN[i]) * 0.40;
		cr = lerp(cr, cr * 1.55 + 0.006, wr); cg = lerp(cg, cg * 1.5 + 0.006, wr); cb = lerp(cb, cb * 1.45 + 0.007, wr);
		const pit = 1 - smoothstep(0.02, 0.42, h);
		cr *= 1 - 0.42 * pit; cg *= 1 - 0.42 * pit; cb *= 1 - 0.40 * pit;
		m.r[i] = cr; m.g[i] = cg; m.b[i] = cb;

		// fibre-direction roughness variation (warp vs weft differ)
		let rg = (up ? 0.84 : 0.90)
			+ 0.09 * (1 - fil) * 0.5
			+ 0.06 * (yarn[i] - 0.5)
			+ 0.05 * (fuzz[i] - 0.5) * 2
			- 0.05 * wr;
		m.rough[i] = clamp01(rg);
		m.ao[i] = clamp01(1 - 0.42 * pit);
	}

	m.slope = 0.46;
	m.aoStrength = 0.8;
	give(fib0, fibV, fibH, fuzz0, fuzz, yarn, heather, shade, wearN, filF);
}

/* ------------------------------------------------------------------ skin */
function genSkin(m) {
	const { N, n2, seed, scale: s } = m;
	// pores at two densities blended by a low-frequency mask (cheek vs nose)
	const p1 = worley(N, F(110, s), hashSeed(seed, 1), 1.0);
	const p2 = worley(N, F(170, s), hashSeed(seed, 2), 1.0);
	const dens = fbm(N, { seed: hashSeed(seed, 3), freq: F(3, s), octaves: 2, gain: 0.6 });
	// micro-relief: the fine polygonal furrow network of real skin, made from
	// warped ridged fBm and stretched slightly along one axis
	const wr0 = fbm(N, { seed: hashSeed(seed, 4), freq: F(26, s), octaves: 3, gain: 0.5, mode: 1 });
	const wrx = fbm(N, { seed: hashSeed(seed, 5), freq: F(5, s), octaves: 2 });
	const wry = fbm(N, { seed: hashSeed(seed, 6), freq: F(5, s), octaves: 2 });
	const wrk = warp(wr0, N, wrx, wry, 0.012 * N);
	const wrn = blurAxis(wrk, N, Math.max(1, (N / 300) | 0), 0);
	const meso = fbm(N, { seed: hashSeed(seed, 7), freq: F(7, s), octaves: 3, gain: 0.5 });
	const blotch = fbm(N, { seed: hashSeed(seed, 21), freq: F(4, s), octaves: 3, gain: 0.6 });
	const vein = fbm(N, { seed: hashSeed(seed, 22), freq: F(2, s), octaves: 2, gain: 0.65 });
	const freck = white(N, hashSeed(seed, 23));
	const oil = fbm(N, { seed: hashSeed(seed, 24), freq: F(6, s), octaves: 3, gain: 0.55 });
	const hair = scratchField(N, hashSeed(seed, 25), 0.00030, Math.max(3, (N / 30) | 0), 1, 0.008);

	const cBase = [0.335, 0.196, 0.148];
	const cRed = [0.372, 0.166, 0.132];
	const cPale = [0.330, 0.234, 0.196];

	const poreF = grab(n2);
	for (let i = 0; i < n2; i++) {
		const dm = smoothstep(0.3, 0.7, dens[i]);
		const pa = clamp01(1 - p1.f1[i] / 0.30) * (0.35 + 0.65 * p1.cellRand[p1.id[i]]);
		const pb = clamp01(1 - p2.f1[i] / 0.36) * (0.35 + 0.65 * p2.cellRand[p2.id[i]]);
		const pore = lerp(pa, pb, dm);
		poreF[i] = pore;
		m.h[i] = clamp01(0.58
			+ 0.14 * (meso[i] - 0.5)
			- 0.10 * pore * pore
			- 0.085 * smoothstep(0.30, 0.92, wrn[i])
			+ 0.022 * hair[i]);
	}
	normalize01(m.h, 0.12, 0.90);

	for (let i = 0; i < n2; i++) {
		const pore = poreF[i];
		const wk = smoothstep(0.30, 0.92, wrn[i]);
		// haemoglobin-rich zones read redder, fully decorrelated from relief
		const rd = smoothstep(0.30, 0.88, blotch[i] * 0.68 + vein[i] * 0.32);
		let cr = lerp(cPale[0], cRed[0], rd), cg = lerp(cPale[1], cRed[1], rd), cb = lerp(cPale[2], cRed[2], rd);
		const mel = smoothstep(0.25, 0.85, 1 - blotch[i]) * 0.40;
		cr = lerp(cr, cBase[0], mel); cg = lerp(cg, cBase[1], mel); cb = lerp(cb, cBase[2], mel);
		const fr = freck[i] > 0.9915 ? (freck[i] - 0.9915) / 0.0085 : 0;
		cr = lerp(cr, 0.215, fr * 0.7); cg = lerp(cg, 0.112, fr * 0.7); cb = lerp(cb, 0.076, fr * 0.7);
		// pores + furrows are slightly darker and a touch redder
		const dk = 1 - 0.20 * pore - 0.14 * wk;
		cr *= dk; cg *= dk * 0.975; cb *= dk * 0.965;
		cr = lerp(cr, 0.26, hair[i] * 0.18); cg = lerp(cg, 0.20, hair[i] * 0.18); cb = lerp(cb, 0.16, hair[i] * 0.18);
		m.r[i] = cr; m.g[i] = cg; m.b[i] = cb;

		// low but *never uniform* roughness: sebum sheen on the raised micro
		// facets, matte inside pores and furrows
		const ol = smoothstep(0.38, 0.82, oil[i]);
		let rg = 0.44
			- 0.17 * ol
			+ 0.13 * pore
			+ 0.09 * wk
			+ 0.05 * (meso[i] - 0.5)
			- 0.05 * smoothstep(0.6, 1.0, m.h[i]);
		m.rough[i] = clamp01(rg);
		m.ao[i] = clamp01(1 - 0.26 * pore - 0.18 * wk);
	}

	m.slope = 0.17;
	m.aoStrength = 0.55;
	give(dens, wr0, wrx, wry, wrk, wrn, meso, blotch, vein, freck, oil, hair, poreF);
}

/* -------------------------------------------------------------- concrete */
function genConcrete(m) {
	const { N, n2, seed, scale: s } = m;
	const agg = worley(N, F(26, s), hashSeed(seed, 1), 1.0);   // exposed aggregate
	const agg2 = worley(N, F(58, s), hashSeed(seed, 2), 1.0);  // fine sand
	const chip = worley(N, F(8, s), hashSeed(seed, 3), 1.0);   // spalls / chips
	const pin0 = white(N, hashSeed(seed, 4));
	const pin = blurWrap(pin0, N, 1);                          // air-void pinholes
	const surf = fbm(N, { seed: hashSeed(seed, 5), freq: F(4, s), octaves: 4, gain: 0.5 });
	const rghN = fbm(N, { seed: hashSeed(seed, 6), freq: F(12, s), octaves: 2 });
	const tone = fbm(N, { seed: hashSeed(seed, 21), freq: F(3, s), octaves: 3, gain: 0.6 });
	const stainSrc = fbm(N, { seed: hashSeed(seed, 22), freq: F(7, s), octaves: 3, gain: 0.55 });
	const laitance = fbm(N, { seed: hashSeed(seed, 23), freq: F(5, s), octaves: 3, gain: 0.6 });

	// form-board lines: regular horizontal joints (must divide N so they tile)
	let boards = Math.max(2, F(4, s));
	while (N % boards !== 0 && boards > 2) boards--;
	const bp = N / boards;

	// downward staining, seeded at the board lines and streaked toward v = 0
	const seeds = grab(n2);
	for (let y = 0, i = 0; y < N; y++) {
		const near = 1 - smoothstep(0, Math.max(2, bp * 0.10), Math.min(y % bp, bp - (y % bp)));
		for (let x = 0; x < N; x++, i++) {
			seeds[i] = clamp01(smoothstep(0.50, 0.92, stainSrc[i]) * (0.30 + 1.0 * near));
		}
	}
	const stain = N_.streakDown(seeds, N, 0.9885);
	const stainB = blurWrap(stain, N, Math.max(1, (N / 220) | 0));

	const cLo = [0.098, 0.096, 0.092];
	const cHi = [0.248, 0.245, 0.234];
	const cAgg = [0.170, 0.160, 0.146];

	const chipF = grab(n2), aggF = grab(n2);
	for (let i = 0; i < n2; i++) {
		const id = chip.id[i];
		const cr = chip.cellRand[id];
		let cf = 0;
		if (cr > 0.905) {
			const rad = 0.14 + 0.30 * chip.cellRand2[id];
			const d = chip.f1[i] / rad;
			if (d < 1) cf = 1 - smoothstep(0.70, 1.0, d);     // hard-edged spall
		}
		chipF[i] = cf;
		const aid = agg.id[i];
		const ar = agg.cellRand[aid];
		let af = 0;
		if (ar > 0.42) {
			const rad = 0.18 + 0.34 * agg.cellRand2[aid];
			const t = 1 - agg.f1[i] / rad;
			if (t > 0) af = Math.sqrt(t);
		}
		// aggregate is only *exposed* where the cement skin has worn away
		aggF[i] = af * (0.5 + 0.5 * ar) * smoothstep(0.32, 0.68, 1 - laitance[i]);
	}

	for (let y = 0, i = 0; y < N; y++) {
		const dy = Math.min(y % bp, bp - (y % bp));
		const board = 1 - smoothstep(0.5, Math.max(2.5, bp * 0.030), dy);
		for (let x = 0; x < N; x++, i++) {
			const a2 = clamp01(1 - agg2.f1[i] / 0.40);
			m.h[i] = clamp01(0.62
				+ 0.12 * (surf[i] - 0.5)
				+ 0.085 * aggF[i]
				+ 0.022 * a2
				- 0.050 * board
				- 0.26 * chipF[i]
				- 0.040 * smoothstep(0.74, 1.0, pin[i])
				+ 0.018 * (pin[i] - 0.5));
		}
	}
	normalize01(m.h, 0.06, 0.95);

	for (let y = 0, i = 0; y < N; y++) {
		const dy = Math.min(y % bp, bp - (y % bp));
		const board = 1 - smoothstep(0.5, Math.max(2.5, bp * 0.030), dy);
		for (let x = 0; x < N; x++, i++) {
			const t = smoothstep(0.15, 0.88, tone[i] * 0.66 + surf[i] * 0.34);
			let cr = lerp(cLo[0], cHi[0], t), cg = lerp(cLo[1], cHi[1], t), cb = lerp(cLo[2], cHi[2], t);
			// aggregate pebbles carry their own colour identity
			const af = smoothstep(0.04, 0.55, aggF[i]);
			const arn = agg.cellRand2[agg.id[i]];
			cr = lerp(cr, cAgg[0] * (0.5 + 1.05 * arn), af);
			cg = lerp(cg, cAgg[1] * (0.5 + 1.00 * arn), af);
			cb = lerp(cb, cAgg[2] * (0.5 + 0.95 * arn), af);
			// chips expose fresh, brighter concrete
			const cf = chipF[i];
			cr = lerp(cr, 0.268, cf * 0.75); cg = lerp(cg, 0.262, cf * 0.75); cb = lerp(cb, 0.248, cf * 0.75);
			// downward staining/streaking (runs toward v = 0)
			const st = clamp01(stainB[i]);
			cr *= 1 - 0.46 * st; cg *= 1 - 0.49 * st; cb *= 1 - 0.50 * st;
			cr *= 1 - 0.22 * board; cg *= 1 - 0.22 * board; cb *= 1 - 0.22 * board;
			m.r[i] = cr; m.g[i] = cg; m.b[i] = cb;

			let rg = 0.87
				+ 0.08 * (rghN[i] - 0.5)
				+ 0.06 * (surf[i] - 0.5)
				- 0.24 * af * 0.75        // polished aggregate faces
				- 0.12 * st * 0.5         // stains read slightly wet
				+ 0.05 * cf;
			m.rough[i] = clamp01(rg);
			m.ao[i] = clamp01(1 - 0.32 * cf - 0.22 * board - 0.10 * smoothstep(0.74, 1.0, pin[i]));
		}
	}

	m.slope = 0.38;
	m.aoStrength = 0.8;
	give(pin0, pin, surf, rghN, tone, stainSrc, laitance, seeds, stain, stainB, chipF, aggF);
}

/* ----------------------------------------------------------- alien coral */
function genCoral(m) {
	const { N, n2, seed, scale: s, detail } = m;
	const wx = fbm(N, { seed: hashSeed(seed, 1), freq: F(3, s), octaves: 2, gain: 0.6 });
	const wy = fbm(N, { seed: hashSeed(seed, 2), freq: F(3, s), octaves: 2, gain: 0.6 });
	const b0 = fbm(N, { seed: hashSeed(seed, 3), freq: F(2, s), octaves: OC(4, detail), gain: 0.55 });
	const bw = warp(b0, N, wx, wy, 0.10 * N);
	const l1 = worley(N, F(4, s), hashSeed(seed, 4), 1.0);
	const l2 = worley(N, F(9, s), hashSeed(seed, 5), 1.0);
	const l3 = worley(N, F(26, s), hashSeed(seed, 6), 1.0);   // polyps
	const iri = fbm(N, { seed: hashSeed(seed, 21), freq: F(3, s), octaves: 3, gain: 0.6 });
	const flesh = fbm(N, { seed: hashSeed(seed, 22), freq: F(7, s), octaves: 3 });
	const gloss = fbm(N, { seed: hashSeed(seed, 23), freq: F(5, s), octaves: 3, gain: 0.55 });

	const RIDGES = 4;
	const lab = grab(n2), pol = grab(n2);
	for (let i = 0; i < n2; i++) {
		// reaction-diffusion-ish labyrinth: thin ridges riding the level sets of
		// a warped fBm — the classic brain-coral maze, and it tiles for free
		const sv = Math.sin(bw[i] * TAU * RIDGES);
		const a = 1 - Math.abs(sv);
		lab[i] = a * a;
		const id = l3.id[i];
		const cr = l3.cellRand[id];
		pol[i] = cr > 0.42 ? clamp01(1 - l3.f1[i] / (0.18 + 0.22 * cr)) : 0;
	}

	for (let i = 0; i < n2; i++) {
		const lobe = clamp01(1 - l1.f1[i] / 0.78);
		const lobe2 = clamp01(1 - l2.f1[i] / 0.66);
		m.h[i] = clamp01(0.30
			+ 0.30 * lobe * lobe
			+ 0.15 * lobe2
			+ 0.20 * lab[i]
			- 0.085 * pol[i] * pol[i]
			+ 0.022 * (flesh[i] - 0.5));
	}
	normalize01(m.h, 0.04, 0.96);

	// restrained iridescent palette (linear) — thin-film-ish hue sweep
	const P = [
		[0.022, 0.052, 0.068],
		[0.036, 0.115, 0.108],
		[0.085, 0.140, 0.078],
		[0.115, 0.062, 0.110],
		[0.045, 0.040, 0.128],
	];
	for (let i = 0; i < n2; i++) {
		const h = m.h[i];
		let t = (bw[i] * RIDGES * 0.5 + iri[i] * 0.9) % 1;
		if (t < 0) t += 1;
		const ft = t * (P.length - 1);
		const k = Math.min(P.length - 2, ft | 0);
		const fr = ft - k;
		const a = P[k], b2 = P[k + 1];
		let cr = a[0] + (b2[0] - a[0]) * fr;
		let cg = a[1] + (b2[1] - a[1]) * fr;
		let cb = a[2] + (b2[2] - a[2]) * fr;
		// fleshy translucency down in the valleys
		const val = 1 - smoothstep(0.12, 0.65, h);
		cr = lerp(cr, 0.135, val * 0.5); cg = lerp(cg, 0.036, val * 0.5); cb = lerp(cb, 0.058, val * 0.5);
		// ridge crests bleach out to a chalky calcium white
		const crest = smoothstep(0.58, 1.0, h);
		cr = lerp(cr, 0.300, crest * 0.55); cg = lerp(cg, 0.318, crest * 0.55); cb = lerp(cb, 0.295, crest * 0.55);
		cr *= 1 - 0.5 * pol[i]; cg *= 1 - 0.53 * pol[i]; cb *= 1 - 0.47 * pol[i];
		m.r[i] = cr; m.g[i] = cg; m.b[i] = cb;

		let rgh = 0.42
			- 0.22 * smoothstep(0.35, 0.85, gloss[i])
			+ 0.20 * val
			+ 0.08 * (flesh[i] - 0.5)
			+ 0.12 * pol[i];
		m.rough[i] = clamp01(rgh);
		m.ao[i] = clamp01(1 - 0.40 * val - 0.26 * pol[i]);
	}

	m.slope = 0.55;
	m.aoStrength = 0.9;
	give(wx, wy, b0, bw, iri, flesh, gloss, lab, pol);
}

/* ----------------------------------------------------------- rusted iron */
function genRust(m) {
	const { N, n2, seed, scale: s, detail } = m;
	const wx = fbm(N, { seed: hashSeed(seed, 1), freq: F(4, s), octaves: 2, gain: 0.6 });
	const wy = fbm(N, { seed: hashSeed(seed, 2), freq: F(4, s), octaves: 2, gain: 0.6 });
	const r0 = fbm(N, { seed: hashSeed(seed, 3), freq: F(3, s), octaves: OC(6, detail), gain: 0.55 });
	const rustBase = warp(r0, N, wx, wy, 0.07 * N);
	const r1 = fbm(N, { seed: hashSeed(seed, 4), freq: F(9, s), octaves: 3, gain: 0.5 });
	const r2 = fbm(N, { seed: hashSeed(seed, 10), freq: F(24, s), octaves: 3, gain: 0.5 });
	// flakes: hard-edged plates that lift off the steel
	const fl = worley(N, F(15, s), hashSeed(seed, 5), 1.0);
	const flEdge = worleyEdges(fl, N, 0.09);
	const pit = worley(N, F(52, s), hashSeed(seed, 6), 1.0);
	// rolled-steel anisotropy on the bare metal
	const roll0 = white(N, hashSeed(seed, 7));
	const roll = blurAxis(roll0, N, Math.max(2, (N / 70) | 0), 0);
	const scr = scratchField(N, hashSeed(seed, 8), 0.0010, Math.max(3, (N / 15) | 0), 0, 0.004);
	const grime = fbm(N, { seed: hashSeed(seed, 21), freq: F(6, s), octaves: 3, gain: 0.55 });
	const rghN = fbm(N, { seed: hashSeed(seed, 22), freq: F(14, s), octaves: 2 });

	const cSteel = [0.145, 0.150, 0.163];
	const cDark = [0.032, 0.019, 0.012];
	const cRust = [0.165, 0.058, 0.020];
	const cOchre = [0.320, 0.152, 0.048];

	m.metal = grab(n2);
	const rustF = grab(n2), pitF = grab(n2), flakeF = grab(n2);
	for (let i = 0; i < n2; i++) {
		// corrosion advances as a front — hard at the large scale, feathered
		// at the small scale, so the boundary never reads as a single threshold
		const a = rustBase[i] * 0.62 + r1[i] * 0.26 + r2[i] * 0.12;
		const big = smoothstep(0.40, 0.60, a);
		const feather = smoothstep(0.36, 0.72, a) * 0.55;
		const speck = smoothstep(0.62, 0.70, r2[i] * 0.6 + a * 0.4) * 0.5;
		rustF[i] = clamp01(big * 0.72 + feather * 0.5 + speck);
		const fid = fl.id[i];
		const fr = fl.cellRand[fid];
		flakeF[i] = rustF[i] > 0.45 && fr > 0.42 ? (1 - flEdge[i]) * (fr - 0.42) * 1.6 * rustF[i] : 0;
		const pid = pit.id[i];
		const pr = pit.cellRand[pid];
		pitF[i] = pr > 0.58 ? clamp01(1 - pit.f1[i] / (0.13 + 0.20 * pr)) * rustF[i] : 0;
	}

	for (let i = 0; i < n2; i++) {
		m.h[i] = clamp01(0.55
			+ 0.05 * (rustBase[i] - 0.5)
			+ 0.16 * rustF[i] * (0.4 + 0.6 * r1[i])   // rust swells outward
			+ 0.10 * flakeF[i]
			- 0.13 * flEdge[i] * rustF[i]              // flake edges are undercut
			- 0.17 * pitF[i] * pitF[i]
			+ 0.030 * (r2[i] - 0.5) * rustF[i]
			+ 0.016 * (roll[i] - 0.5)
			- 0.012 * scr[i]);
	}
	normalize01(m.h, 0.05, 0.95);

	for (let i = 0; i < n2; i++) {
		const rf = rustF[i];
		const flk = flakeF[i];
		const rl = 0.88 + 0.26 * roll[i];
		let cr = cSteel[0] * rl, cg = cSteel[1] * rl, cb = cSteel[2] * rl;
		cr = lerp(cr, 0.29, scr[i] * 0.45); cg = lerp(cg, 0.29, scr[i] * 0.45); cb = lerp(cb, 0.30, scr[i] * 0.45);
		// rust ramp: steel -> dark scale -> red oxide -> bright ochre
		const t = clamp01(rf * (0.45 + 0.85 * r1[i]) + 0.25 * (r2[i] - 0.5));
		let rr, rg2, rb;
		if (t < 0.5) {
			const u = t * 2;
			rr = lerp(cDark[0], cRust[0], u); rg2 = lerp(cDark[1], cRust[1], u); rb = lerp(cDark[2], cRust[2], u);
		} else {
			const u = (t - 0.5) * 2;
			rr = lerp(cRust[0], cOchre[0], u); rg2 = lerp(cRust[1], cOchre[1], u); rb = lerp(cRust[2], cOchre[2], u);
		}
		rr *= 1 + 0.30 * flk; rg2 *= 1 + 0.26 * flk; rb *= 1 + 0.22 * flk;
		const ue = flEdge[i] * rf;
		rr *= 1 - 0.42 * ue; rg2 *= 1 - 0.45 * ue; rb *= 1 - 0.47 * ue;
		rr *= 1 - 0.50 * pitF[i]; rg2 *= 1 - 0.53 * pitF[i]; rb *= 1 - 0.55 * pitF[i];

		const k = smoothstep(0.03, 0.42, rf);
		cr = lerp(cr, rr, k); cg = lerp(cg, rg2, k); cb = lerp(cb, rb, k);
		// thin oxide bloom just outside the rust front (tea staining)
		const halo = smoothstep(0.02, 0.18, rf) * (1 - smoothstep(0.18, 0.45, rf));
		cr = lerp(cr, cr * 0.85 + 0.030, halo * 0.6);
		cg = lerp(cg, cg * 0.80 + 0.014, halo * 0.6);
		cb = lerp(cb, cb * 0.78 + 0.006, halo * 0.6);
		const gm = smoothstep(0.5, 0.92, grime[i]) * 0.30;
		cr = lerp(cr, cr * 0.52, gm); cg = lerp(cg, cg * 0.52, gm); cb = lerp(cb, cb * 0.54, gm);
		m.r[i] = cr; m.g[i] = cg; m.b[i] = cb;

		let rgh = lerp(0.32, 0.90, k)
			+ 0.09 * (rghN[i] - 0.5)
			+ 0.06 * (1 - roll[i]) * (1 - k)
			+ 0.07 * (r2[i] - 0.5) * k
			- 0.15 * scr[i] * (1 - k)
			+ 0.05 * flk;
		m.rough[i] = clamp01(rgh);
		m.metal[i] = clamp01(1 - 0.85 * k + 0.2 * scr[i] * (1 - k));
		m.ao[i] = clamp01(1 - 0.40 * ue - 0.34 * pitF[i]);
	}

	m.slope = 0.48;
	m.aoStrength = 0.85;
	m.params.metalness = 1;
	give(wx, wy, r0, rustBase, r1, r2, flEdge, roll0, roll, scr, grime, rghN, rustF, pitF, flakeF);
}

const GENERATORS = {
	rock: (m) => genRock(m, false),
	basalt: (m) => genRock(m, true),
	sand: (m) => genSand(m, false),
	regolith: (m) => genSand(m, true),
	ice: genIce,
	metalPanel: genMetalPanel,
	carbonWeave: genCarbon,
	fabric: genFabric,
	skin: genSkin,
	concrete: genConcrete,
	alienCoral: genCoral,
	rustedIron: genRust,
};

/* ================================================================== *
 * texture assembly
 * ================================================================== */

function makeTex(data, N, colorSpace) {
	const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
	t.wrapS = THREE.RepeatWrapping;
	t.wrapT = THREE.RepeatWrapping;
	t.generateMipmaps = true;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.magFilter = THREE.LinearFilter;
	t.colorSpace = colorSpace;
	t.needsUpdate = true;
	return t;
}

/**
 * Main entry point.
 * opts: { size=1024, seed=1, tint=[r,g,b] (linear), scale=1, detail=1 }
 */
export function makeMaterialSet(kind, opts = {}) {
	const gen = GENERATORS[kind];
	if (!gen) throw new Error(`makeMaterialSet: unknown kind "${kind}" (expected one of ${KINDS.join(', ')})`);

	const size = Math.max(8, (opts.size || 1024) | 0);
	const seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
	const scale = opts.scale || 1;
	const detail = opts.detail || 1;
	const tint = opts.tint || null;

	const m = newCtx(size, seed, scale, detail);
	gen(m);

	const N = size, n2 = m.n2;

	// ---- normal (Sobel, +Y up, strength driven by the real height amplitude)
	const nrmBytes = heightToNormalRGBA(m.h, N, m.slope * (opts.normalStrength || 1));

	// ---- AO: multi-scale cavity term * generator-authored occlusion.
	//      Ambient occlusion is a *low frequency* quantity — a slight blur is
	//      what keeps it from reading as a hard black line drawing.
	const cav0 = heightToAO(m.h, N, m.aoStrength);
	for (let i = 0; i < n2; i++) cav0[i] *= m.ao[i];
	const cav = N_.blurWrap(cav0, N, Math.max(1, Math.round(N / 256)));
	give(cav0);

	const albBytes = new Uint8Array(n2 * 4);
	const rghBytes = new Uint8Array(n2 * 4);
	const aoBytes = new Uint8Array(n2 * 4);
	const dispBytes = new Uint8Array(n2 * 4);
	const mtlBytes = m.metal ? new Uint8Array(n2 * 4) : null;

	const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;

	// one 32-bit store per texel instead of four byte stores
	const W = N_.LE;
	const albW = W ? new Uint32Array(albBytes.buffer) : null;
	const rghW = W ? new Uint32Array(rghBytes.buffer) : null;
	const aoW = W ? new Uint32Array(aoBytes.buffer) : null;
	const dspW = W ? new Uint32Array(dispBytes.buffer) : null;
	const mtlW = W && mtlBytes ? new Uint32Array(mtlBytes.buffer) : null;

	for (let i = 0; i < n2; i++) {
		const ao = clamp01(cav[i]);
		// albedo picks up a little of the cavity term — real photographed
		// surfaces have dirt/shadow baked into their diffuse response
		const ak = 0.74 + 0.26 * ao;
		const R = linearToSRGB8(m.r[i] * tr * ak) | 0;
		const G = linearToSRGB8(m.g[i] * tg * ak) | 0;
		const B = linearToSRGB8(m.b[i] * tb * ak) | 0;
		// recessed => a touch rougher (dust settles); linear data, no sRGB
		const rb = (clamp01(m.rough[i] + (1 - ao) * 0.06) * 255 + 0.5) | 0;
		const ab = (ao * 255 + 0.5) | 0;
		const hb = (clamp01(m.h[i]) * 255 + 0.5) | 0;
		if (W) {
			albW[i] = 0xff000000 | (B << 16) | (G << 8) | R;
			rghW[i] = 0xff000000 | (rb << 16) | (rb << 8) | rb;
			aoW[i] = 0xff000000 | (ab << 16) | (ab << 8) | ab;
			dspW[i] = 0xff000000 | (hb << 16) | (hb << 8) | hb;
			if (mtlW) {
				const mb = (clamp01(m.metal[i]) * 255 + 0.5) | 0;
				mtlW[i] = 0xff000000 | (mb << 16) | (mb << 8) | mb;
			}
		} else {
			const j = i * 4;
			albBytes[j] = R; albBytes[j + 1] = G; albBytes[j + 2] = B; albBytes[j + 3] = 255;
			rghBytes[j] = rb; rghBytes[j + 1] = rb; rghBytes[j + 2] = rb; rghBytes[j + 3] = 255;
			aoBytes[j] = ab; aoBytes[j + 1] = ab; aoBytes[j + 2] = ab; aoBytes[j + 3] = 255;
			dispBytes[j] = hb; dispBytes[j + 1] = hb; dispBytes[j + 2] = hb; dispBytes[j + 3] = 255;
			if (mtlBytes) {
				const mb = (clamp01(m.metal[i]) * 255 + 0.5) | 0;
				mtlBytes[j] = mb; mtlBytes[j + 1] = mb; mtlBytes[j + 2] = mb; mtlBytes[j + 3] = 255;
			}
		}
	}

	const out = {
		kind,
		size: N,
		map: makeTex(albBytes, N, THREE.SRGBColorSpace),
		normalMap: makeTex(nrmBytes, N, THREE.NoColorSpace),
		roughnessMap: makeTex(rghBytes, N, THREE.NoColorSpace),
		aoMap: makeTex(aoBytes, N, THREE.NoColorSpace),
		displacementMap: makeTex(dispBytes, N, THREE.NoColorSpace),
		metalnessMap: mtlBytes ? makeTex(mtlBytes, N, THREE.NoColorSpace) : null,
		params: m.params,
		dispose() {
			for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'displacementMap', 'metalnessMap']) {
				if (this[k]) this[k].dispose();
			}
		},
	};

	give(m.h, m.r, m.g, m.b, m.rough, m.ao, cav);
	if (m.metal) give(m.metal);
	return out;
}

/* ================================================================== *
 * environment (IBL)
 * ================================================================== */

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyTint;
uniform vec3 uGroundTint;
uniform float uNebula;
uniform float uStrength;
uniform float uSeed;

float h31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3) + uSeed);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = h31(i + vec3(0,0,0)), n100 = h31(i + vec3(1,0,0));
  float n010 = h31(i + vec3(0,1,0)), n110 = h31(i + vec3(1,1,0));
  float n001 = h31(i + vec3(0,0,1)), n101 = h31(i + vec3(1,0,1));
  float n011 = h31(i + vec3(0,1,1)), n111 = h31(i + vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float a = 0.5, s = 0.0, t = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); t += a; p *= 2.03; a *= 0.5; }
  return s / t;
}

void main() {
  vec3 d = normalize(vDir);
  float up = d.y;

  // sky gradient: zenith -> horizon, with a physically-plausible falloff
  float hz = pow(clamp(1.0 - abs(up), 0.0, 1.0), 3.0);
  vec3 sky = mix(uSkyTint * 0.55, uSkyTint * 1.9, hz);

  // ground hemisphere (bounce light)
  float gm = smoothstep(0.02, -0.12, up);
  sky = mix(sky, uGroundTint, gm);

  // sun disk + forward-scattering glow
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  float disk = smoothstep(0.9985, 0.99935, sd);
  float glow = pow(sd, 220.0) * 0.7 + pow(sd, 12.0) * 0.10 + pow(sd, 3.0) * 0.03;
  vec3 col = sky + uSunColor * (disk * 55.0 + glow * 3.0);

  // stars (above the horizon only, and never inside the sun glare)
  float sf = smoothstep(-0.05, 0.12, up);
  vec3 sp = d * 260.0;
  float st = h31(floor(sp));
  float star = smoothstep(0.9975, 0.99985, st) * sf;
  vec3 stc = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.6), h31(floor(sp) + 7.0));
  col += stc * star * 8.0 * (1.0 - smoothstep(0.985, 1.0, sd));

  // nebula
  if (uNebula > 0.5) {
    float n = fbm3(d * 2.1 + 11.0);
    float n2 = fbm3(d * 4.7 - 5.0);
    float m = smoothstep(0.42, 0.85, n) * (0.35 + 0.65 * n2);
    vec3 nc = mix(vec3(0.10, 0.05, 0.28), vec3(0.30, 0.09, 0.16), n2);
    nc = mix(nc, vec3(0.05, 0.22, 0.30), smoothstep(0.45, 0.9, n2));
    col += nc * m * 0.75 * sf;
  }

  gl_FragColor = vec4(col * uStrength, 1.0);
}
`;

/**
 * Procedural sky/space environment rendered into a small cube RT and prefiltered
 * with PMREMGenerator, so PBR materials get real image-based lighting.
 * params: { sunDir, sunColor, skyTint, groundTint, nebula, strength, size, seed }
 */
export function makeEnvironmentHDRI(renderer, params = {}) {
	if (!renderer) throw new Error('makeEnvironmentHDRI: a WebGLRenderer is required');

	const size = params.size || 256;
	const sunDir = (params.sunDir || new THREE.Vector3(0.4, 0.35, -0.85)).clone().normalize();
	const sunColor = new THREE.Color(params.sunColor !== undefined ? params.sunColor : 0xfff2e0);
	const skyTint = new THREE.Color(params.skyTint !== undefined ? params.skyTint : 0x2a3f5c);
	const groundTint = new THREE.Color(params.groundTint !== undefined ? params.groundTint : 0x0a0b0e);

	const mat = new THREE.ShaderMaterial({
		vertexShader: SKY_VERT,
		fragmentShader: SKY_FRAG,
		side: THREE.BackSide,
		depthWrite: false,
		depthTest: false,
		uniforms: {
			uSunDir: { value: sunDir },
			uSunColor: { value: new THREE.Vector3(sunColor.r, sunColor.g, sunColor.b) },
			uSkyTint: { value: new THREE.Vector3(skyTint.r, skyTint.g, skyTint.b) },
			uGroundTint: { value: new THREE.Vector3(groundTint.r, groundTint.g, groundTint.b) },
			uNebula: { value: params.nebula === false ? 0 : 1 },
			uStrength: { value: params.strength === undefined ? 1 : params.strength },
			uSeed: { value: ((params.seed || 1) % 97) * 0.137 },
		},
	});

	const scene = new THREE.Scene();
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), mat);
	mesh.frustumCulled = false;
	scene.add(mesh);

	const rt = new THREE.WebGLCubeRenderTarget(size, {
		type: THREE.HalfFloatType,
		format: THREE.RGBAFormat,
		generateMipmaps: false,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
	});
	rt.texture.colorSpace = THREE.LinearSRGBColorSpace;

	const cam = new THREE.CubeCamera(0.1, 100, rt);
	const prevRT = renderer.getRenderTarget();
	cam.update(renderer, scene);
	renderer.setRenderTarget(prevRT);

	const pmrem = new THREE.PMREMGenerator(renderer);
	pmrem.compileCubemapShader();
	const env = pmrem.fromCubemap(rt.texture).texture;

	pmrem.dispose();
	rt.dispose();
	mesh.geometry.dispose();
	mat.dispose();

	env.userData.isProceduralEnvironment = true;
	return env;
}

/* ================================================================== *
 * self test
 * ================================================================== */

/**
 * Tileability metric — a *local* discontinuity test.
 *
 * A tiling texture is one where the wrap-around neighbour pair behaves exactly
 * like the pairs immediately beside it. So for every row we compare
 *     e   = |a[N-1] - a[0]|                       (the wrap step)
 * against the local reference
 *     ref = max(|a[N-2]-a[N-1]|, |a[0]-a[1]|)     (the steps either side)
 * and only count the excess. Structure that legitimately crosses the wrap (a
 * panel seam, a crack) has a matching local gradient and scores ~0; a genuine
 * discontinuity shows up immediately. Same for rows. Reported in 0..1 units of
 * an 8-bit channel.
 */
function seamError(bytes, N) {
	let exH = 0, exV = 0, wrapH = 0, wrapV = 0;
	for (let y = 0; y < N; y++) {
		const o = y * N * 4;
		for (let c = 0; c < 3; c++) {
			const a = bytes[o + (N - 1) * 4 + c], b = bytes[o + c];
			const e = Math.abs(a - b);
			const r1 = Math.abs(bytes[o + (N - 2) * 4 + c] - a);
			const r2 = Math.abs(b - bytes[o + 4 + c]);
			const ref = r1 > r2 ? r1 : r2;
			wrapH += e;
			if (e > ref) exH += e - ref;
		}
	}
	const rL = (N - 1) * N * 4, rL2 = (N - 2) * N * 4, r1o = N * 4;
	for (let x = 0; x < N; x++) {
		const o = x * 4;
		for (let c = 0; c < 3; c++) {
			const a = bytes[rL + o + c], b = bytes[o + c];
			const e = Math.abs(a - b);
			const q1 = Math.abs(bytes[rL2 + o + c] - a);
			const q2 = Math.abs(b - bytes[r1o + o + c]);
			const ref = q1 > q2 ? q1 : q2;
			wrapV += e;
			if (e > ref) exV += e - ref;
		}
	}
	const n = N * 3;
	return {
		wrapMAD: +(((wrapH + wrapV) / (2 * n))).toFixed(3),
		seamError: ((exH + exV) / (2 * n)) / 255,
	};
}

export function __selftest(opts = {}) {
	const size = opts.size || 256;
	const bigSize = opts.bigSize || 1024;
	const now = (typeof performance !== 'undefined' && performance.now)
		? () => performance.now() : () => Date.now();

	const results = [];
	let worstSeam = 0;
	for (const kind of KINDS) {
		const t0 = now();
		const set = makeMaterialSet(kind, { size, seed: 7 });
		const dt = now() - t0;
		const maps = {};
		let ks = 0;
		for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap']) {
			const e = seamError(set[key].image.data, size);
			maps[key] = +e.seamError.toFixed(6);
			ks = Math.max(ks, e.seamError);
		}
		worstSeam = Math.max(worstSeam, ks);
		// determinism check
		const set2 = makeMaterialSet(kind, { size: 64, seed: 7 });
		const set3 = makeMaterialSet(kind, { size: 64, seed: 7 });
		let deterministic = true;
		const a = set2.map.image.data, b = set3.map.image.data;
		for (let i = 0; i < a.length; i += 97) if (a[i] !== b[i]) { deterministic = false; break; }
		set2.dispose(); set3.dispose();

		results.push({ kind, ms: +dt.toFixed(2), seam: maps, maxSeamError: +ks.toFixed(6), deterministic });
		set.dispose();
	}

	// full-resolution timing for the headline number
	const big = [];
	for (const kind of (opts.bigKinds || ['rock', 'metalPanel', 'skin'])) {
		const t0 = now();
		const set = makeMaterialSet(kind, { size: bigSize, seed: 3 });
		big.push({ kind, size: bigSize, ms: +(now() - t0).toFixed(2) });
		set.dispose();
	}

	const total = results.reduce((s, r) => s + r.ms, 0);
	return {
		size, results, big,
		totalMs: +total.toFixed(2),
		avgMs: +(total / results.length).toFixed(2),
		maxSeamError: +worstSeam.toFixed(6),
		allDeterministic: results.every((r) => r.deterministic),
	};
}

export default { makeMaterialSet, makeEnvironmentHDRI, Noise, KINDS, __selftest };
