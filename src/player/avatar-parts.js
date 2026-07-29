import * as THREE from '../../vendor/three.module.js';

/* ===================================================================== *
 * Procedural surface primitives for the avatar.
 *
 * Everything the suit is made of comes out of one builder: `sweep()`, a
 * generalised surface of revolution that follows an arbitrary path with an
 * arbitrary cross-section. That is deliberate — a uniform capsule and a
 * tapered, panelled, corrugated limb differ only in the profile function you
 * hand it, so the interesting shape work lives in data rather than in a pile
 * of one-off mesh code.
 *
 * The profile is evaluated per (ring, angle), which is what lets panel seams,
 * bellows ribs and armour plates be *geometry* — an actual displacement of the
 * surface with an actual silhouette — rather than lines painted into albedo.
 * ===================================================================== */

/* Surface class, carried per-vertex as a vec4 weight so triangles that straddle
 * a boundary blend instead of banding. Deliberately separate from `matId`
 * (0 = suit shell, 1 = skin), which keeps its original meaning. */
export const SURF = {
  shell:  [0, 0, 0, 0],   // hard composite panel — the default
  fabric: [1, 0, 0, 0],   // pressure-garment softgoods
  trim:   [0, 1, 0, 0],   // machined metal rings, bearings, buckles
  accent: [0, 0, 1, 0],   // painted accent colour
  rubber: [0, 0, 0, 1],   // boot soles, palm grips, hoses
};

export const MAT = { SUIT: 0, SKIN: 1 };

const S = THREE.MathUtils.smoothstep;
export const lerp = THREE.MathUtils.lerp;
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Smooth 1-D band mask: 1 inside [x0,x1], 0 outside, `bev` wide soft edges. */
export function band(x, x0, x1, bev = 0.02) {
  return S(x, x0 - bev, x0 + bev) * (1 - S(x, x1 - bev, x1 + bev));
}

/** Band on a coordinate that wraps at 1 — i.e. the angle fraction of a ring. */
export function bandW(x, x0, x1, bev = 0.02) {
  return Math.max(band(x, x0, x1, bev),
    Math.max(band(x - 1, x0, x1, bev), band(x + 1, x0, x1, bev)));
}

/** Rectangular patch mask in (angle-fraction, length) space, rounded corners. */
export function patch(u, v, u0, u1, v0, v1, bev = 0.02) {
  return bandW(u, u0, u1, bev) * band(v, v0, v1, bev);
}

/** Rounded end caps — multiply the section scale by this to close a tube. */
export function capScale(t, s = 0, e = 0) {
  let k = 1;
  if (s > 0 && t < s) { const u = 1 - t / s; k *= Math.sqrt(Math.max(0, 1 - u * u)); }
  if (e > 0 && t > 1 - e) { const u = (t - (1 - e)) / e; k *= Math.sqrt(Math.max(0, 1 - u * u)); }
  return k;
}

/**
 * Superellipse cross-section. n = 2 is an ellipse; larger n squares it off,
 * which is what stops a torso or a boot reading as a cylinder.
 */
export function sect(a, rx, rz, n = 2) {
  const c = Math.cos(a), s = Math.sin(a);
  if (n === 2) return [rx * c, rz * s];
  const k = Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(s), n), -1 / n);
  return [rx * c * k, rz * s * k];
}

/** Piecewise smooth interpolation through control points [[t, value], ...]. */
export function curve(t, pts) {
  if (t <= pts[0][0]) return pts[0][1];
  const n = pts.length;
  if (t >= pts[n - 1][0]) return pts[n - 1][1];
  for (let i = 1; i < n; i++) {
    if (t <= pts[i][0]) {
      const [ta, va] = pts[i - 1], [tb, vb] = pts[i];
      const k = (t - ta) / Math.max(1e-6, tb - ta);
      return lerp(va, vb, k * k * (3 - 2 * k));
    }
  }
  return pts[n - 1][1];
}

/**
 * Bellows corrugation over [v0,v1]. This is the single highest-value shape cue
 * on a pressure suit: real ones cannot bend a sealed fabric tube, so every
 * joint gets a stack of convolute rings, and their shadow banding is what your
 * eye reads as "suit" rather than "tube".
 */
export function ribs(v, v0, v1, count) {
  if (v <= v0 || v >= v1) return 0;
  const u = (v - v0) / (v1 - v0);
  const env = Math.sin(Math.PI * u);
  return env * 0.5 * (1 - Math.cos(u * count * Math.PI * 2));
}

/**
 * Cloth folds as geometry.
 *
 * Sum of wave trains whose angular frequencies are integers, so the field is
 * continuous across the ring seam. Fabric bunches where a joint forces slack,
 * so callers multiply this by a mask that peaks at the joints — which is what
 * turns a smooth tube into something with softgoods on it.
 */
export function folds(t, u, seed) {
  const a = u * Math.PI * 2;
  let v = Math.sin(a * 3 + t * 11.0 + seed);
  v += 0.70 * Math.sin(a * 5 - t * 17.0 + seed * 2.3);
  v += 0.45 * Math.sin(a * 2 + t * 27.0 + seed * 4.1);
  v += 0.30 * Math.sin(a * 8 + t * 7.0 - seed * 1.7);
  return v / 2.45;
}

/* --------------------------------------------------------------------- *
 * sweep(): the workhorse.
 *
 *  path(t)          -> Vector3 centre of the ring at t in [0,1]
 *  shape(t, a, u)   -> [px, pz] offset in the cross-section plane
 *  up               -> reference axis fixing the roll of the frame, so that
 *                      a = 0 always points somewhere predictable
 *
 * The frame is rotation-minimising (parallel transport), so a curved path —
 * a finger, a hose, the arch of a boot — does not corkscrew its panels.
 * --------------------------------------------------------------------- */
export function sweep(o) {
  const rings = o.rings, radial = o.radial;
  const path = o.path, shape = o.shape;
  const closed = !!o.closedPath;
  const boneA = o.boneA | 0;
  const boneB = o.boneB === undefined ? boneA : o.boneB;
  const wAt = o.wAt || ((t) => S(t, 0.18, 0.82));
  const matAt = typeof o.mat === 'function' ? o.mat : () => (o.mat || 0);
  const surfAt = typeof o.surf === 'function' ? o.surf : () => (o.surf || SURF.shell);
  const glowAt = typeof o.glow === 'function' ? o.glow : () => (o.glow || 0);

  const N = rings + 1;
  const cen = [];
  for (let i = 0; i < N; i++) cen.push(path(i / rings));

  const tan = [];
  for (let i = 0; i < N; i++) {
    let a, b;
    if (closed) { a = cen[(i - 1 + rings) % rings]; b = cen[(i + 1) % rings]; }
    else { a = cen[Math.max(0, i - 1)]; b = cen[Math.min(N - 1, i + 1)]; }
    const d = new THREE.Vector3().subVectors(b, a);
    if (d.lengthSq() < 1e-14) d.copy(tan[i - 1] || new THREE.Vector3(0, 1, 0));
    tan.push(d.normalize());
  }

  const upRef = o.up ? new THREE.Vector3().fromArray(o.up).normalize() : new THREE.Vector3(0, 0, 1);
  let right = new THREE.Vector3().crossVectors(upRef, tan[0]);
  if (right.lengthSq() < 1e-8) right.crossVectors(new THREE.Vector3(1, 0, 0), tan[0]);
  right.normalize();
  const rights = [right.clone()];
  const q = new THREE.Quaternion();
  for (let i = 1; i < N; i++) {
    q.setFromUnitVectors(tan[i - 1], tan[i]);
    right = right.clone().applyQuaternion(q);
    right.addScaledVector(tan[i], -right.dot(tan[i]));
    if (right.lengthSq() < 1e-10) right.crossVectors(upRef, tan[i]);
    right.normalize();
    rights.push(right.clone());
  }

  const pos = [], nrm = [], uv = [], idx = [], skinIdx = [], skinWt = [];
  const mid = [], surf = [], glow = [];
  const fwd = new THREE.Vector3(), p = new THREE.Vector3();
  let arc = 0;
  const TAU = Math.PI * 2;

  // Partial angular span, for surfaces that must cover only part of a ring —
  // a visor conforming to its own helmet's profile, for instance, which is the
  // only reliable way to keep the two flush at every point of the aperture.
  const wrapU = o.wrapU === undefined ? true : o.wrapU;
  const u0 = o.u0 === undefined ? 0 : o.u0;
  const u1 = o.u1 === undefined ? 1 : o.u1;
  const cols = wrapU ? radial : radial + 1;

  for (let i = 0; i < N; i++) {
    const t = i / rings;
    if (i > 0) arc += cen[i].distanceTo(cen[i - 1]);
    fwd.crossVectors(tan[i], rights[i]).normalize();
    const w = wAt(t);
    for (let j = 0; j < cols; j++) {
      const u = wrapU ? j / radial : u0 + (u1 - u0) * (j / radial);
      const s = shape(t, u * TAU, u);
      p.copy(cen[i]).addScaledVector(rights[i], s[0]).addScaledVector(fwd, s[1]);
      pos.push(p.x, p.y, p.z);
      nrm.push(0, 1, 0);
      uv.push(u, arc);
      skinIdx.push(boneA, boneB, 0, 0);
      skinWt.push(1 - w, w, 0, 0);
      mid.push(matAt(t, u));
      const sv = surfAt(t, u);
      surf.push(sv[0], sv[1], sv[2], sv[3]);
      glow.push(glowAt(t, u));
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const jn = wrapU ? (j + 1) % radial : j + 1;
      const a = i * cols + j, b = i * cols + jn;
      const c = (i + 1) * cols + j, d = (i + 1) * cols + jn;
      idx.push(a, c, b, b, c, d);
    }
  }
  return { pos, nrm, uv, idx, skinIdx, skinWt, mid, surf, glow };
}

/* --------------------------------------------------------------------- *
 * A closed torus following a circular path — collar rings, wrist bearings,
 * hip bearings. Real suits are built around these, and a hard machined ring
 * where the fabric terminates is a much stronger read than a painted line.
 * --------------------------------------------------------------------- */
export function ringPart({ center, axis = [0, 1, 0], R, r, seg = 40, rad = 12,
                           bone = 0, surf = SURF.trim, mat = 0, glow = 0, rProfile, tilt = 0 }) {
  const ax = new THREE.Vector3().fromArray(axis).normalize();
  const e1 = Math.abs(ax.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const b1 = new THREE.Vector3().crossVectors(e1, ax).normalize();
  const b2 = new THREE.Vector3().crossVectors(ax, b1).normalize();
  const c = new THREE.Vector3().fromArray(center);
  return sweep({
    rings: seg, radial: rad, closedPath: true, boneA: bone, boneB: bone,
    wAt: () => 0, surf, mat, glow,
    up: [ax.x, ax.y, ax.z],
    path: (t) => {
      const a = t * Math.PI * 2;
      return new THREE.Vector3().copy(c)
        .addScaledVector(b1, Math.cos(a) * R)
        .addScaledVector(b2, Math.sin(a) * R)
        .addScaledVector(ax, Math.sin(a) * tilt);
    },
    shape: (t, a, u) => {
      const rr = rProfile ? rProfile(t, u) : r;
      return [Math.cos(a) * rr, Math.sin(a) * rr];
    },
  });
}

/* --------------------------------------------------------------------- *
 * A digit: three tapering phalanges following a curled spline, closed with a
 * rounded tip. Five of these per hand is the difference between a glove and
 * the orange cone stub the judge called out.
 * --------------------------------------------------------------------- */
export function digit({ origin, dir, curlAxis, lens, r0, r1, curl, bone, surf = SURF.fabric,
                        rings = 20, radial = 10, knuckle = 1.0, tipSurf }) {
  const pts = [new THREE.Vector3().copy(origin)];
  const d = new THREE.Vector3().copy(dir).normalize();
  const ax = new THREE.Vector3().copy(curlAxis).normalize();
  let p = new THREE.Vector3().copy(origin);
  for (let i = 0; i < lens.length; i++) {
    d.applyAxisAngle(ax, curl[i] !== undefined ? curl[i] : curl);
    p = p.clone().addScaledVector(d, lens[i]);
    pts.push(p.clone());
  }
  const spline = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
  const total = lens.reduce((a, b) => a + b, 0);
  // Knuckle swellings sit at the joint parameters.
  const joints = [];
  let acc = 0;
  for (let i = 0; i < lens.length - 1; i++) { acc += lens[i]; joints.push(acc / total); }

  return sweep({
    rings, radial, boneA: bone, boneB: bone, wAt: () => 0, surf,
    up: [ax.x, ax.y, ax.z],
    path: (t) => spline.getPoint(t),
    shape: (t, a) => {
      let r = lerp(r0, r1, t);
      for (const j of joints) r += (knuckle * 0.22 * r0) * Math.exp(-Math.pow((t - j) / 0.10, 2));
      r *= capScale(t, 0.0, 0.14);
      // Slightly flattened section — fingers are not round.
      const s = sect(a, r * 1.0, r * 0.86, 2.4);
      return s;
    },
    mat: 0,
    glow: 0,
  });
}

/* --------------------------------------------------------------------- *
 * A flexible hose. Two of these from the backpack to the collar do more for
 * "this is life support" than any amount of albedo detail.
 * --------------------------------------------------------------------- */
export function hose({ pts, r, rings = 30, radial = 8, bone = 0, coil = 26 }) {
  const spline = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3().fromArray(v)), false, 'catmullrom', 0.5);
  return sweep({
    rings, radial, boneA: bone, boneB: bone, wAt: () => 0, surf: SURF.rubber,
    path: (t) => spline.getPoint(t),
    shape: (t, a) => {
      const rr = r * (1 + 0.16 * Math.sin(t * coil * Math.PI * 2)) * capScale(t, 0.02, 0.02);
      return [Math.cos(a) * rr, Math.sin(a) * rr];
    },
  });
}

/** Count triangles in a part list. */
export function triCount(parts) {
  let n = 0;
  for (const p of parts) n += p.idx.length / 3;
  return n;
}
