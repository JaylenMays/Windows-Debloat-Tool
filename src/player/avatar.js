import * as THREE from '../../vendor/three.module.js';
import { LAYER } from '../core/engine.js';

/* ===================================================================== *
 * Procedural avatar.
 *
 * The whole body is generated from parameters — no imported mesh, no morph
 * targets baked at build time. Limbs and torso are generalised cylinders
 * lofted along a skeleton; the head is a sphere pushed around by a set of
 * localised feature deformers (the same idea as facial morphs, evaluated
 * analytically so the range is unbounded rather than clamped to whatever a
 * modeller shipped).
 *
 * Because the geometry is rebuilt from scratch on change, a slider can do
 * things a morph target cannot — double a limb's length, inflate a jaw past
 * any preset — which is what "extreme customisation" actually needs.
 * ===================================================================== */

export const AVATAR_SCHEMA = [
  // ---- body ----------------------------------------------------------
  { category: 'Body', key: 'height',        label: 'Height',           type: 'slider', min: 0.75, max: 1.30, def: 1.0 },
  { category: 'Body', key: 'build',         label: 'Musculature',      type: 'slider', min: 0.0,  max: 1.0,  def: 0.45 },
  { category: 'Body', key: 'bodyFat',       label: 'Body Mass',        type: 'slider', min: 0.0,  max: 1.0,  def: 0.35 },
  { category: 'Body', key: 'shoulderWidth', label: 'Shoulder Width',   type: 'slider', min: 0.7,  max: 1.4,  def: 1.0 },
  { category: 'Body', key: 'chest',         label: 'Chest Depth',      type: 'slider', min: 0.7,  max: 1.4,  def: 1.0 },
  { category: 'Body', key: 'waist',         label: 'Waist',            type: 'slider', min: 0.65, max: 1.45, def: 1.0 },
  { category: 'Body', key: 'hips',          label: 'Hips',             type: 'slider', min: 0.7,  max: 1.4,  def: 1.0 },
  { category: 'Body', key: 'armLength',     label: 'Arm Length',       type: 'slider', min: 0.8,  max: 1.25, def: 1.0 },
  { category: 'Body', key: 'armThickness',  label: 'Arm Thickness',    type: 'slider', min: 0.7,  max: 1.4,  def: 1.0 },
  { category: 'Body', key: 'legLength',     label: 'Leg Length',       type: 'slider', min: 0.8,  max: 1.25, def: 1.0 },
  { category: 'Body', key: 'legThickness',  label: 'Leg Thickness',    type: 'slider', min: 0.7,  max: 1.4,  def: 1.0 },
  { category: 'Body', key: 'neckLength',    label: 'Neck Length',      type: 'slider', min: 0.6,  max: 1.5,  def: 1.0 },
  { category: 'Body', key: 'neckThickness', label: 'Neck Thickness',   type: 'slider', min: 0.7,  max: 1.4,  def: 1.0 },
  { category: 'Body', key: 'handSize',      label: 'Hand Size',        type: 'slider', min: 0.75, max: 1.3,  def: 1.0 },
  { category: 'Body', key: 'footSize',      label: 'Foot Size',        type: 'slider', min: 0.75, max: 1.3,  def: 1.0 },
  { category: 'Body', key: 'posture',       label: 'Posture',          type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },

  // ---- face ----------------------------------------------------------
  { category: 'Face', key: 'headSize',      label: 'Head Size',        type: 'slider', min: 0.85, max: 1.2,  def: 1.0 },
  { category: 'Face', key: 'skullWidth',    label: 'Skull Width',      type: 'slider', min: 0.8,  max: 1.25, def: 1.0 },
  { category: 'Face', key: 'skullLength',   label: 'Skull Length',     type: 'slider', min: 0.85, max: 1.2,  def: 1.0 },
  { category: 'Face', key: 'foreheadSlope', label: 'Forehead Slope',   type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'browRidge',     label: 'Brow Ridge',       type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'cheekbones',    label: 'Cheekbones',       type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'cheekFullness', label: 'Cheek Fullness',   type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'jawWidth',      label: 'Jaw Width',        type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'jawLength',     label: 'Jaw Length',       type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'chin',          label: 'Chin Projection',  type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'noseLength',    label: 'Nose Length',      type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'noseWidth',     label: 'Nose Width',       type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'noseBridge',    label: 'Nose Bridge',      type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'noseTip',       label: 'Nose Tip',         type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'mouthWidth',    label: 'Mouth Width',      type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'lipFullness',   label: 'Lip Fullness',     type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'mouthHeight',   label: 'Mouth Position',   type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'eyeSize',       label: 'Eye Size',         type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'eyeSpacing',    label: 'Eye Spacing',      type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'eyeDepth',      label: 'Eye Depth',        type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'eyeAngle',      label: 'Eye Angle',        type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },
  { category: 'Face', key: 'earSize',       label: 'Ear Size',         type: 'slider', min: -1.0, max: 1.0,  def: 0.0 },

  // ---- appearance ------------------------------------------------------
  { category: 'Appearance', key: 'skinTone',      label: 'Skin Tone',    type: 'color',  def: '#c68a63' },
  { category: 'Appearance', key: 'skinRough',     label: 'Skin Finish',  type: 'slider', min: 0.3, max: 0.85, def: 0.55 },
  { category: 'Appearance', key: 'freckles',      label: 'Freckles',     type: 'slider', min: 0.0, max: 1.0,  def: 0.15 },
  { category: 'Appearance', key: 'eyeColor',      label: 'Iris Colour',  type: 'color',  def: '#5b7fa6' },
  { category: 'Appearance', key: 'hairColor',     label: 'Hair Colour',  type: 'color',  def: '#2b1d14' },
  { category: 'Appearance', key: 'hairStyle',     label: 'Hair',         type: 'option', options: ['None', 'Crop', 'Swept', 'Braids', 'Tall', 'Long'], def: 'Swept' },
  { category: 'Appearance', key: 'lipTint',       label: 'Lip Tint',     type: 'color',  def: '#a35f52' },

  // ---- suit ------------------------------------------------------------
  { category: 'Suit', key: 'suitPrimary',   label: 'Primary',        type: 'color',  def: '#2d3440' },
  { category: 'Suit', key: 'suitSecondary', label: 'Secondary',      type: 'color',  def: '#8d9099' },
  { category: 'Suit', key: 'suitAccent',    label: 'Accent',         type: 'color',  def: '#ff7a2f' },
  { category: 'Suit', key: 'suitMaterial',  label: 'Shell Material', type: 'option', options: ['Carbon', 'Alloy', 'Ceramic', 'Weave'], def: 'Carbon' },
  { category: 'Suit', key: 'suitWear',      label: 'Wear',           type: 'slider', min: 0.0, max: 1.0, def: 0.35 },
  { category: 'Suit', key: 'emissiveColor', label: 'Circuit Glow',   type: 'color',  def: '#4fd6ff' },
  { category: 'Suit', key: 'emissive',      label: 'Glow Strength',  type: 'slider', min: 0.0, max: 1.0, def: 0.5 },
  { category: 'Suit', key: 'helmet',        label: 'Helmet',         type: 'option', options: ['Off', 'Visor', 'Full'], def: 'Visor' },
  { category: 'Suit', key: 'visorTint',     label: 'Visor Tint',     type: 'color',  def: '#ffb35c' },

  // ---- identity ---------------------------------------------------------
  { category: 'Identity', key: 'callsign', label: 'Callsign', type: 'text', def: 'DRIFTER' },
];

export function defaultConfig() {
  const c = {};
  for (const s of AVATAR_SCHEMA) c[s.key] = s.def;
  return c;
}

/* --------------------------------------------------------------------- *
 * Small deterministic PRNG so a given avatar always looks identical.
 * --------------------------------------------------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomConfig(seed = Math.floor(Math.random() * 1e9)) {
  const rnd = mulberry32(seed);
  const c = {};
  const palettes = {
    skinTone: ['#f3d3bd', '#e8b795', '#c68a63', '#a06840', '#7a4a2b', '#4d2f1c', '#3a241a'],
    eyeColor: ['#5b7fa6', '#3f6b4a', '#6b4a2f', '#2f3b46', '#7a6a4f', '#89a7c4'],
    hairColor: ['#0d0a08', '#2b1d14', '#5a3a22', '#8b6438', '#b89a6a', '#9b9b9b', '#d8d3cc'],
    suitPrimary: ['#2d3440', '#3d3a35', '#1e2a2e', '#4a3038', '#26303d', '#38322c'],
    suitSecondary: ['#8d9099', '#b7b2a8', '#6f7a80', '#a8a29a'],
    suitAccent: ['#ff7a2f', '#4fd6ff', '#ffd23f', '#7ef08a', '#ff5470', '#c07bff'],
    emissiveColor: ['#4fd6ff', '#ff7a2f', '#7ef08a', '#c07bff', '#ffd23f'],
    lipTint: ['#a35f52', '#8d4f46', '#c2786c', '#6f4038'],
    visorTint: ['#ffb35c', '#9fd8ff', '#c9a0ff', '#ffe08a'],
  };
  for (const s of AVATAR_SCHEMA) {
    if (s.type === 'slider') {
      // Bias toward the middle of the range so random avatars read as people
      // rather than as extremes — the sliders still allow the extremes.
      const t = (rnd() + rnd() + rnd()) / 3;
      c[s.key] = s.min + (s.max - s.min) * t;
    } else if (s.type === 'color') {
      const pal = palettes[s.key];
      c[s.key] = pal ? pal[Math.floor(rnd() * pal.length)] : '#888888';
    } else if (s.type === 'option') {
      c[s.key] = s.options[Math.floor(rnd() * s.options.length)];
    } else {
      c[s.key] = s.def;
    }
  }
  const names = ['DRIFTER', 'HALCYON', 'VESPER', 'ORRERY', 'KESTREL', 'NOMAD', 'CINDER',
    'LUMEN', 'TALLOW', 'QUILL', 'MERIDIAN', 'ASHFALL', 'PILGRIM', 'SABLE'];
  c.callsign = names[Math.floor(rnd() * names.length)];
  return c;
}

/* --------------------------------------------------------------------- *
 * Skeleton layout, in metres for a 1.0 height parameter (≈1.75 m tall).
 * --------------------------------------------------------------------- */
const BONES = [
  { name: 'root',      parent: null,       pos: [0, 0, 0] },
  { name: 'hips',      parent: 'root',     pos: [0, 0.92, 0] },
  { name: 'spine',     parent: 'hips',     pos: [0, 0.12, 0] },
  { name: 'chest',     parent: 'spine',    pos: [0, 0.16, 0] },
  { name: 'neck',      parent: 'chest',    pos: [0, 0.18, 0] },
  { name: 'head',      parent: 'neck',     pos: [0, 0.09, 0] },

  { name: 'shoulderL', parent: 'chest',    pos: [0.055, 0.13, 0] },
  { name: 'armL',      parent: 'shoulderL', pos: [0.14, 0, 0] },
  { name: 'forearmL',  parent: 'armL',     pos: [0.28, 0, 0] },
  { name: 'handL',     parent: 'forearmL', pos: [0.25, 0, 0] },

  { name: 'shoulderR', parent: 'chest',    pos: [-0.055, 0.13, 0] },
  { name: 'armR',      parent: 'shoulderR', pos: [-0.14, 0, 0] },
  { name: 'forearmR',  parent: 'armR',     pos: [-0.28, 0, 0] },
  { name: 'handR',     parent: 'forearmR', pos: [-0.25, 0, 0] },

  { name: 'thighL',    parent: 'hips',     pos: [0.09, -0.06, 0] },
  { name: 'shinL',     parent: 'thighL',   pos: [0, -0.42, 0] },
  { name: 'footL',     parent: 'shinL',    pos: [0, -0.41, 0] },
  { name: 'toeL',      parent: 'footL',    pos: [0, -0.06, 0.12] },

  { name: 'thighR',    parent: 'hips',     pos: [-0.09, -0.06, 0] },
  { name: 'shinR',     parent: 'thighR',   pos: [0, -0.42, 0] },
  { name: 'footR',     parent: 'shinR',    pos: [0, -0.41, 0] },
  { name: 'toeR',      parent: 'footR',    pos: [0, -0.06, 0.12] },
];

/* --------------------------------------------------------------------- *
 * Lofted limb builder.
 *
 * Each segment is a tube of `radial` vertices per ring, `rings` rings along
 * its length. Skin weights come from the ring's position along the segment,
 * blended between the two bones it spans, which gives clean joint bending
 * without any weight painting.
 * --------------------------------------------------------------------- */
function lofted({ from, to, rings, radial, radiusAt, boneA, boneB, twistAt, matId = 0 }) {
  const pos = [], nrm = [], uv = [], idx = [], skinIdx = [], skinWt = [], mid = [];
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  dir.normalize();

  // Stable tangent frame.
  const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const fwd = new THREE.Vector3().crossVectors(dir, right).normalize();

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const center = new THREE.Vector3().copy(from).addScaledVector(dir, len * t);
    const twist = twistAt ? twistAt(t) : 0;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2 + twist;
      const ca = Math.cos(a), sa = Math.sin(a);
      const r = radiusAt(t, a);
      const rx = typeof r === 'number' ? r : r.x;
      const rz = typeof r === 'number' ? r : r.z;
      const offset = new THREE.Vector3()
        .addScaledVector(right, ca * rx)
        .addScaledVector(fwd, sa * rz);
      const p = new THREE.Vector3().addVectors(center, offset);
      pos.push(p.x, p.y, p.z);
      const n = offset.clone().normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(j / radial, t);
      // Weights blend along the segment; the ends sit fully on one bone.
      const w = THREE.MathUtils.smoothstep(t, 0.15, 0.85);
      skinIdx.push(boneA, boneB, 0, 0);
      skinWt.push(1 - w, w, 0, 0);
      // Material id travels with the vertex. Deciding skin-vs-suit from world
      // position instead is fragile: in an A-pose the forearms occupy the same
      // x range as the hands, so any positional heuristic misclassifies them.
      mid.push(typeof matId === 'function' ? matId(t) : matId);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  return { pos, nrm, uv, idx, skinIdx, skinWt, mid };
}

/* --------------------------------------------------------------------- *
 * Head: a sphere pushed around by localised feature deformers.
 *
 * Each deformer is a smooth radial falloff centred on an anatomical
 * location, displacing along a direction. Because they are analytic, a
 * slider can push far past any preset without tearing the mesh.
 * --------------------------------------------------------------------- */
function buildHead(cfg, boneIndex, headOrigin) {
  const SEG_U = 48, SEG_V = 36;
  const pos = [], nrm = [], uv = [], idx = [], skinIdx = [], skinWt = [], mid = [];
  const p = new THREE.Vector3();

  const base = 0.098 * cfg.headSize;
  const num = (v, d = 0) => (typeof v === 'number' ? v : d);

  // Feature deformers: [centre(unit sphere dir), radius, strength, direction]
  const deform = (dirVec) => {
    const d = dirVec;
    let disp = new THREE.Vector3();

    const gauss = (cx, cy, cz, r) => {
      const dx = d.x - cx, dy = d.y - cy, dz = d.z - cz;
      return Math.exp(-(dx * dx + dy * dy + dz * dz) / (r * r));
    };

    // Skull proportions.
    const skull = new THREE.Vector3(
      d.x * (num(cfg.skullWidth, 1) - 1),
      d.y * 0.0,
      d.z * (num(cfg.skullLength, 1) - 1));
    disp.addScaledVector(skull, base);

    // Forehead slope: tilts the upper front of the cranium.
    disp.z += gauss(0, 0.62, 0.72, 0.55) * num(cfg.foreheadSlope) * -0.016;
    disp.y += gauss(0, 0.72, 0.6, 0.5) * num(cfg.foreheadSlope) * 0.008;

    // Brow ridge.
    disp.z += gauss(0, 0.28, 0.88, 0.34) * (0.007 + num(cfg.browRidge) * 0.013);

    // Cheekbones (both sides).
    const cheekL = gauss(0.72, 0.04, 0.60, 0.34), cheekR = gauss(-0.72, 0.04, 0.60, 0.34);
    disp.x += (cheekL - cheekR) * num(cfg.cheekbones) * 0.014;
    disp.z += (cheekL + cheekR) * num(cfg.cheekbones) * 0.008;

    // Cheek fullness, lower and more medial.
    const fullL = gauss(0.62, -0.22, 0.66, 0.36), fullR = gauss(-0.62, -0.22, 0.66, 0.36);
    disp.x += (fullL - fullR) * num(cfg.cheekFullness) * 0.012;
    disp.z += (fullL + fullR) * num(cfg.cheekFullness) * 0.007;

    // Jaw.
    const jawL = gauss(0.66, -0.52, 0.42, 0.42), jawR = gauss(-0.66, -0.52, 0.42, 0.42);
    disp.x += (jawL - jawR) * num(cfg.jawWidth) * 0.017;
    const jawLine = gauss(0, -0.78, 0.45, 0.62);
    disp.y -= jawLine * num(cfg.jawLength) * 0.016;

    // Chin projection.
    const chin = gauss(0, -0.82, 0.66, 0.34);
    disp.z += chin * (0.006 + num(cfg.chin) * 0.014);
    disp.y -= chin * Math.max(0, num(cfg.chin)) * 0.005;

    // Nose: a ridge from bridge to tip plus width at the alae.
    const bridge = gauss(0, 0.22, 0.95, 0.22);
    const tip = gauss(0, -0.06, 1.02, 0.17);
    disp.z += bridge * num(cfg.noseBridge) * 0.011 + 0.019 * bridge;
    disp.z += tip * (0.030 + num(cfg.noseTip) * 0.012);
    disp.y += tip * num(cfg.noseLength) * -0.012;
    const alaL = gauss(0.20, -0.12, 0.94, 0.14), alaR = gauss(-0.20, -0.12, 0.94, 0.14);
    disp.x += (alaL - alaR) * (0.006 + num(cfg.noseWidth) * 0.007);

    // Mouth: lips as a pair of soft ridges, mouth width scales laterally.
    const mouthY = -0.42 + num(cfg.mouthHeight) * 0.07;
    const lipUpper = gauss(0, mouthY + 0.045, 0.93, 0.20);
    const lipLower = gauss(0, mouthY - 0.055, 0.92, 0.20);
    disp.z += (lipUpper + lipLower) * (0.009 + num(cfg.lipFullness) * 0.009);
    const mw = gauss(0, mouthY, 0.9, 0.34);
    disp.x += d.x * mw * num(cfg.mouthWidth) * 0.012;

    // Eye sockets: recessed, with size/spacing/angle.
    const spacing = 0.30 + num(cfg.eyeSpacing) * 0.07;
    const eyeY = 0.10 + num(cfg.eyeAngle) * 0.0;
    const sockR = 0.20 + num(cfg.eyeSize) * 0.045;
    const eL = gauss(spacing, eyeY, 0.90, sockR), eR = gauss(-spacing, eyeY, 0.90, sockR);
    disp.z -= (eL + eR) * (0.016 + num(cfg.eyeDepth) * 0.008);

    return disp;
  };

  for (let v = 0; v <= SEG_V; v++) {
    const phi = (v / SEG_V) * Math.PI;
    for (let u = 0; u <= SEG_U; u++) {
      const theta = (u / SEG_U) * Math.PI * 2;
      const d = new THREE.Vector3(
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.cos(theta));

      // Base head is an ovoid, not a sphere: taller than wide, narrower at the jaw.
      p.set(d.x * base * 0.86, d.y * base * 1.14, d.z * base * 0.94);
      // Taper the lower half toward the chin.
      const lower = Math.max(0, -d.y);
      p.x *= 1 - lower * 0.22;
      p.z *= 1 - lower * 0.10;

      p.add(deform(d));
      p.add(headOrigin);

      pos.push(p.x, p.y, p.z);
      nrm.push(d.x, d.y, d.z);          // refined by computeVertexNormals later
      uv.push(u / SEG_U, 1 - v / SEG_V);
      skinIdx.push(boneIndex, 0, 0, 0);
      skinWt.push(1, 0, 0, 0);
      mid.push(1);                       // skin
    }
  }
  const stride = SEG_U + 1;
  for (let v = 0; v < SEG_V; v++) {
    for (let u = 0; u < SEG_U; u++) {
      const a = v * stride + u, b = a + 1, c = a + stride, dd = c + 1;
      idx.push(a, c, b, b, c, dd);
    }
  }
  return { pos, nrm, uv, idx, skinIdx, skinWt, mid };
}

/* --------------------------------------------------------------------- */

export class Avatar {
  constructor(engine, config = defaultConfig()) {
    this.engine = engine;
    this.config = { ...defaultConfig(), ...config };
    this.group = new THREE.Group();
    this.group.name = 'avatar';
    this._built = false;
    this.build();
  }

  /* ---- skeleton ---- */
  _buildSkeleton() {
    const cfg = this.config;
    const boneMap = new Map();
    const bones = [];
    const scaleY = cfg.height;

    for (const def of BONES) {
      const b = new THREE.Bone();
      b.name = def.name;
      let [x, y, z] = def.pos;

      // Proportion parameters act on the bone offsets, so the skeleton and the
      // skin stay consistent no matter how extreme the sliders go.
      if (/^(arm|forearm)/.test(def.name)) x *= cfg.armLength;
      if (def.name.startsWith('hand')) x *= cfg.armLength;
      if (/^(thigh|shin)/.test(def.name)) y *= cfg.legLength;
      if (def.name === 'neck') y *= cfg.neckLength;
      if (def.name.startsWith('shoulder')) x *= cfg.shoulderWidth;
      if (def.name === 'hips') y = y * (0.55 + 0.45 * cfg.legLength);

      b.position.set(x * scaleY, y * scaleY, z * scaleY);
      boneMap.set(def.name, b);
      bones.push(b);
    }
    for (const def of BONES) {
      const b = boneMap.get(def.name);
      if (def.parent) boneMap.get(def.parent).add(b);
    }
    // Slouch / stand-tall.
    boneMap.get('spine').rotation.x = cfg.posture * -0.10;
    boneMap.get('chest').rotation.x = cfg.posture * -0.06;
    boneMap.get('neck').rotation.x = cfg.posture * 0.10;

    // A-pose rather than T-pose: arms down ~50 degrees, slight leg spread.
    // Skinning artefacts at the shoulder are far milder when the bind pose is
    // near the middle of the joint's real range.
    boneMap.get('armL').rotation.z = -0.88;
    boneMap.get('armR').rotation.z = 0.88;
    boneMap.get('forearmL').rotation.z = -0.16;
    boneMap.get('forearmR').rotation.z = 0.16;
    boneMap.get('thighL').rotation.z = -0.045;
    boneMap.get('thighR').rotation.z = 0.045;

    this.bones = bones;
    this.boneMap = boneMap;
    this.boneIndex = new Map(bones.map((b, i) => [b.name, i]));

    // The world matrices MUST be current before the Skeleton is constructed.
    // Skeleton.calculateInverses() snapshots each bone's matrixWorld, so
    // building it first captures identity inverses and every vertex then gets
    // translated by its bone's full world transform a second time — which
    // shows up as limbs flying off into flat sheets.
    boneMap.get('root').updateWorldMatrix(true, true);
    this.skeleton = new THREE.Skeleton(bones);
    return boneMap;
  }

  _worldPos(name) {
    const b = this.boneMap.get(name);
    b.updateWorldMatrix(true, false);
    return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  }

  build() {
    const cfg = this.config;
    if (this._built) this._disposeGeometry();

    const boneMap = this._buildSkeleton();
    const root = boneMap.get('root');
    root.updateWorldMatrix(true, true);

    const bi = (n) => this.boneIndex.get(n);
    const H = cfg.height;
    const bulk = 0.94 + cfg.build * 0.30 + cfg.bodyFat * 0.24;

    const parts = [];
    const RAD = 16;

    // ---- torso: hips -> chest, elliptical cross-section ----
    const hipP = this._worldPos('hips'), chestP = this._worldPos('chest');
    const neckP = this._worldPos('neck'), headP = this._worldPos('head');
    parts.push(lofted({
      from: hipP.clone().add(new THREE.Vector3(0, -0.06 * H, 0)), to: chestP,
      rings: 14, radial: RAD, boneA: bi('hips'), boneB: bi('chest'),
      radiusAt: (t) => {
        // Waist pinch between hips and ribcage; shoulders flare at the top.
        const hip = 0.146 * cfg.hips;
        const waist = 0.122 * cfg.waist * (0.9 + cfg.bodyFat * 0.35);
        const rib = 0.158 * cfg.chest;
        let r;
        if (t < 0.42) r = THREE.MathUtils.lerp(hip, waist, t / 0.42);
        else r = THREE.MathUtils.lerp(waist, rib, (t - 0.42) / 0.58);
        r *= bulk * H;
        // Front-back is shallower than side-to-side.
        return { x: r * (1.0 + 0.10 * cfg.shoulderWidth * t), z: r * 0.74 };
      },
    }));

    // ---- shoulders / trapezius ----
    // Yoke: chest up to the neck. The lateral flare has to stay modest — a
    // large one reads as horizontal "wings" rather than as trapezius.
    parts.push(lofted({
      from: chestP, to: neckP,
      rings: 8, radial: RAD, boneA: bi('chest'), boneB: bi('neck'),
      radiusAt: (t) => {
        const r = THREE.MathUtils.lerp(0.148 * cfg.chest, 0.060 * cfg.neckThickness, t * t);
        return { x: r * bulk * H * (1 + (1 - t) * 0.08 * cfg.shoulderWidth), z: r * bulk * H * 0.80 };
      },
    }));

    // Deltoid caps fill the armpit gap where the arm tube meets the torso.
    for (const side of ['L', 'R']) {
      const sh = this._worldPos('shoulder' + side);
      const capR = 0.070 * cfg.shoulderWidth * bulk * H;
      const seg = 14;
      const cp = [], cn = [], cu = [], ci = [], csi = [], csw = [], cm = [];
      for (let v = 0; v <= seg; v++) {
        const phi = (v / seg) * Math.PI;
        for (let u = 0; u <= seg; u++) {
          const th = (u / seg) * Math.PI * 2;
          const d = new THREE.Vector3(Math.sin(phi) * Math.sin(th), Math.cos(phi), Math.sin(phi) * Math.cos(th));
          cp.push(sh.x + d.x * capR * 1.15, sh.y + d.y * capR, sh.z + d.z * capR * 0.95);
          cn.push(d.x, d.y, d.z); cu.push(u / seg, v / seg);
          csi.push(bi('shoulder' + side), 0, 0, 0); csw.push(1, 0, 0, 0); cm.push(0);
        }
      }
      const st = seg + 1;
      for (let v = 0; v < seg; v++) for (let u = 0; u < seg; u++) {
        const a = v * st + u; ci.push(a, a + st, a + 1, a + 1, a + st, a + st + 1);
      }
      parts.push({ pos: cp, nrm: cn, uv: cu, idx: ci, skinIdx: csi, skinWt: csw, mid: cm });
    }

    // ---- neck ----
    parts.push(lofted({
      from: neckP, to: headP,
      rings: 6, radial: RAD, boneA: bi('neck'), boneB: bi('head'),
      matId: (t) => (t > 0.3 ? 1 : 0),
      radiusAt: (t) => 0.049 * cfg.neckThickness * bulk * H * (1.0 + 0.14 * (1.0 - t)),
    }));

    // ---- arms ----
    for (const side of ['L', 'R']) {
      const sh = this._worldPos('shoulder' + side);
      const el = this._worldPos('forearm' + side);
      const wr = this._worldPos('hand' + side);
      const at = cfg.armThickness * bulk * H;
      parts.push(lofted({
        from: sh, to: el, rings: 10, radial: 12,
        boneA: bi('shoulder' + side), boneB: bi('forearm' + side),
        // Deltoid bulge near the shoulder, taper to the elbow.
        radiusAt: (t) => (0.052 + 0.020 * Math.exp(-t * t * 9) + 0.012 * cfg.build * Math.exp(-Math.pow(t - 0.25, 2) * 14)) * at,
      }));
      parts.push(lofted({
        from: el, to: wr, rings: 10, radial: 12,
        boneA: bi('forearm' + side), boneB: bi('hand' + side),
        // Forearm is thickest just below the elbow.
        radiusAt: (t) => (0.046 - 0.017 * t + 0.010 * cfg.build * Math.exp(-Math.pow(t - 0.15, 2) * 12)) * at,
      }));
      // Hand: a tapered paddle, tagged as skin.
      const handDir = new THREE.Vector3().subVectors(wr, el).normalize();
      parts.push(lofted({
        from: wr, to: wr.clone().addScaledVector(handDir, 0.17 * cfg.handSize * H),
        rings: 6, radial: 10, boneA: bi('hand' + side), boneB: bi('hand' + side),
        matId: (t) => (t > 0.12 ? 1 : 0),
        radiusAt: (t) => ({
          x: (0.034 + 0.008 * Math.sin(t * Math.PI)) * cfg.handSize * H,
          z: (0.020 + 0.004 * Math.sin(t * Math.PI)) * cfg.handSize * H,
        }),
      }));
    }

    // ---- legs ----
    for (const side of ['L', 'R']) {
      const th = this._worldPos('thigh' + side);
      const kn = this._worldPos('shin' + side);
      const an = this._worldPos('foot' + side);
      const lt = cfg.legThickness * bulk * H;
      parts.push(lofted({
        from: th, to: kn, rings: 10, radial: 14,
        boneA: bi('thigh' + side), boneB: bi('shin' + side),
        radiusAt: (t) => (0.088 - 0.026 * t + 0.014 * cfg.build * Math.exp(-Math.pow(t - 0.3, 2) * 8)) * lt,
      }));
      parts.push(lofted({
        from: kn, to: an, rings: 10, radial: 14,
        boneA: bi('shin' + side), boneB: bi('foot' + side),
        // Calf bulge.
        radiusAt: (t) => (0.056 - 0.024 * t + 0.016 * cfg.build * Math.exp(-Math.pow(t - 0.22, 2) * 10)) * lt,
      }));
      // Boot: an ankle collar plus a horizontal shoe from heel to toe. Lofting
      // straight from ankle to the toe bone instead gives a downward spike,
      // because that direction is mostly -Y — a foot is an L, not a cone.
      const soleY = an.y - 0.055 * H;
      const heel = new THREE.Vector3(an.x, soleY + 0.028 * H, an.z - 0.055 * H * cfg.footSize);
      const toeP = new THREE.Vector3(an.x, soleY + 0.020 * H, an.z + 0.165 * H * cfg.footSize);
      parts.push(lofted({
        from: an.clone().add(new THREE.Vector3(0, 0.045 * H, 0)), to: heel,
        rings: 4, radial: 12, boneA: bi('foot' + side), boneB: bi('foot' + side),
        radiusAt: (t) => ({
          x: (0.045 + 0.006 * t) * cfg.footSize * H,
          z: (0.042 + 0.014 * t) * cfg.footSize * H,
        }),
      }));
      parts.push(lofted({
        from: heel, to: toeP,
        rings: 9, radial: 14, boneA: bi('foot' + side), boneB: bi('toe' + side),
        // Wider than tall, tapering and rounding off toward the toe.
        radiusAt: (t) => {
          const taper = 1.0 - 0.30 * Math.pow(Math.max(0, t - 0.55) / 0.45, 2.0);
          return {
            x: (0.047 * taper) * cfg.footSize * H,
            z: (0.033 * taper) * cfg.footSize * H,
          };
        },
      }));
    }

    // ---- head ----
    const headLocal = this._worldPos('head');
    parts.push(buildHead(cfg, bi('head'), headLocal));

    // ---- merge ----
    const geo = this._merge(parts);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    this.geometry = geo;
    this.materials = this._buildMaterials();

    this.mesh = new THREE.SkinnedMesh(geo, this.materials.body);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER.NEAR);

    this.group.clear();
    this.group.add(root);
    this.group.add(this.mesh);
    this.mesh.bind(this.skeleton);
    this.skeleton.pose();

    // The skin/suit split is decided in object space, so the shader needs to
    // know where the neck actually sits for this particular body.
    if (this._bodyUniforms) {
      this._bodyUniforms.uNeckY.value = this._worldPos('neck').y;
      this._bodyUniforms.uHeadY.value = this._worldPos('head').y;
    }

    this._buildEyes();
    this._buildHair();
    this._buildHelmet();

    this._built = true;
    this.height = 1.75 * cfg.height;
  }

  _merge(parts) {
    let vcount = 0, icount = 0;
    for (const p of parts) { vcount += p.pos.length / 3; icount += p.idx.length; }
    const pos = new Float32Array(vcount * 3);
    const nrm = new Float32Array(vcount * 3);
    const uv = new Float32Array(vcount * 2);
    const si = new Uint16Array(vcount * 4);
    const sw = new Float32Array(vcount * 4);
    const mid = new Float32Array(vcount);
    const idx = new Uint32Array(icount);
    let vo = 0, io = 0;
    for (const p of parts) {
      const n = p.pos.length / 3;
      pos.set(p.pos, vo * 3);
      nrm.set(p.nrm, vo * 3);
      uv.set(p.uv, vo * 2);
      si.set(p.skinIdx, vo * 4);
      sw.set(p.skinWt, vo * 4);
      mid.set(p.mid, vo);
      for (let i = 0; i < p.idx.length; i++) idx[io + i] = p.idx[i] + vo;
      vo += n; io += p.idx.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setAttribute('matId', new THREE.BufferAttribute(mid, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  _buildMaterials() {
    const cfg = this.config;
    const suitRough = { Carbon: 0.42, Alloy: 0.28, Ceramic: 0.55, Weave: 0.78 }[cfg.suitMaterial] ?? 0.45;
    const suitMetal = { Carbon: 0.15, Alloy: 0.85, Ceramic: 0.05, Weave: 0.0 }[cfg.suitMaterial] ?? 0.2;

    const body = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.suitPrimary),
      roughness: suitRough,
      metalness: suitMetal,
      envMapIntensity: 1.0,
    });
    body.userData.avatar = this;
    this._patchBodyShader(body);
    this.engine.post.patchMaterial(body);
    return { body };
  }

  // The body is one mesh but must read as skin in some places and suit in
  // others. Rather than splitting the geometry, the shader picks the material
  // by world position: head/neck/hands are skin, everything else is suit.
  _patchBodyShader(material) {
    const cfg = this.config;
    const u = {
      uSkinColor: { value: new THREE.Color(cfg.skinTone) },
      uSkinRough: { value: cfg.skinRough },
      uFreckles: { value: cfg.freckles },
      uSuitPrimary: { value: new THREE.Color(cfg.suitPrimary) },
      uSuitSecondary: { value: new THREE.Color(cfg.suitSecondary) },
      uSuitAccent: { value: new THREE.Color(cfg.suitAccent) },
      uEmissive: { value: new THREE.Color(cfg.emissiveColor) },
      uEmissiveAmt: { value: cfg.emissive },
      uWear: { value: cfg.suitWear },
      uHeadY: { value: 0 },
      uNeckY: { value: 0 },
      uHelmet: { value: cfg.helmet === 'Full' ? 1 : 0 },
    };
    this._bodyUniforms = u;

    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vWorldPos;\nvarying vec3 vObjPos;\nattribute float matId;\nvarying float vMatId;\nvoid main() {')
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          vObjPos = position;
          vMatId = matId;
        `)
        .replace('#include <worldpos_vertex>', `
          #include <worldpos_vertex>
          vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `);

      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `
          varying vec3 vWorldPos;
          varying vec3 vObjPos;
          varying float vMatId;
          uniform vec3 uSkinColor, uSuitPrimary, uSuitSecondary, uSuitAccent, uEmissive;
          uniform float uSkinRough, uFreckles, uEmissiveAmt, uWear, uHeadY, uNeckY, uHelmet;

          float h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
          float vnoise(vec2 p){
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h21(i), h21(i + vec2(1,0)), f.x),
                       mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y);
          }
          float fbm2(vec2 p){
            float s = 0.0, a = 0.5;
            for(int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }
            return s;
          }
          void main() {
            // Shared between the chunk injections below. Declared here because
            // every injection point is already inside main().
            vec3 sEmissiveGlow = vec3(0.0);
            float sSkinMask = 0.0;
            float sPoreDetail = 0.0;
        `)
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          {
            // matId: 0 = suit shell, 1 = bare skin.
            float skinMask = step(0.5, vMatId);
            float headMask = smoothstep(uNeckY - 0.02, uNeckY + 0.05, vObjPos.y);
            skinMask *= (1.0 - uHelmet * headMask);

            // ---- suit ----
            // Panel layout from a coarse cell grid, with seams darker and
            // edges worn back toward the shell colour.
            vec2 pUv = vec2(atan(vObjPos.x, vObjPos.z) * 1.1, vObjPos.y * 4.2);
            vec2 cell = floor(pUv);
            vec2 fUv = fract(pUv);
            float seam = min(min(fUv.x, 1.0 - fUv.x), min(fUv.y, 1.0 - fUv.y));
            float seamMask = smoothstep(0.0, 0.020, seam);
            float panelVar = h21(cell);

            vec3 suit = mix(uSuitPrimary, uSuitSecondary, step(0.72, panelVar));
            // Accent stripes down the outside of the limbs.
            float stripe = smoothstep(0.02, 0.0, abs(abs(vObjPos.x) - 0.16)) * step(vObjPos.y, uNeckY);
            suit = mix(suit, uSuitAccent, stripe * 0.85);
            suit *= 0.88 + 0.12 * seamMask;
            // Wear: grime in the seams, scuffing on raised panel centres.
            float grime = (1.0 - seamMask) * uWear * 0.5;
            float scuff = fbm2(pUv * 6.0) * uWear;
            suit = mix(suit, suit * 0.55, grime);
            suit = mix(suit, suit * 1.18 + 0.02, smoothstep(0.6, 0.95, scuff) * 0.5);

            // ---- skin ----
            vec2 sUv = vObjPos.xy * 260.0;
            float pores = fbm2(sUv * 3.0);
            float blotch = fbm2(vObjPos.xy * 34.0);
            vec3 skin = uSkinColor;
            // Subdermal variation: slightly redder where blood is closer.
            skin *= 0.94 + 0.12 * blotch;
            skin = mix(skin, skin * vec3(1.10, 0.92, 0.88), smoothstep(0.45, 0.75, blotch) * 0.5);
            float freck = smoothstep(0.62, 0.78, fbm2(vObjPos.xy * 180.0)) * uFreckles;
            skin = mix(skin, skin * vec3(0.72, 0.55, 0.44), freck * 0.6);
            skin *= 0.97 + 0.03 * pores;

            diffuseColor.rgb = mix(suit, skin, skinMask);

            // Circuit glow traced along the suit seams.
            float circuit = (1.0 - smoothstep(0.0, 0.02, seam)) * (1.0 - skinMask);
            circuit *= step(0.72, h21(cell + 3.7));
            sEmissiveGlow = uEmissive * circuit * uEmissiveAmt * 2.5;
            sSkinMask = skinMask;
            sPoreDetail = pores;
          }
        `)
        .replace('#include <roughnessmap_fragment>', `
          #include <roughnessmap_fragment>
          // Roughness breakup is what stops PBR looking like plastic. Skin is
          // never uniform; suit panels vary panel to panel and in the seams.
          roughnessFactor = mix(roughnessFactor, uSkinRough * (0.88 + 0.24 * sPoreDetail), sSkinMask);
          roughnessFactor *= 0.92 + 0.16 * fbm2(vObjPos.xy * 90.0);
          roughnessFactor = clamp(roughnessFactor, 0.05, 1.0);
        `)
        .replace('#include <metalnessmap_fragment>', `
          #include <metalnessmap_fragment>
          metalnessFactor *= (1.0 - sSkinMask);
        `)
        .replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          totalEmissiveRadiance += sEmissiveGlow;
        `);
    };
    material.needsUpdate = true;
  }

  _buildEyes() {
    const cfg = this.config;
    const headP = this._worldPos('head');
    const base = 0.098 * cfg.headSize;
    const spacing = base * (0.30 + (cfg.eyeSpacing ?? 0) * 0.07) * 1.0;
    const r = base * (0.115 + (cfg.eyeSize ?? 0) * 0.022);
    this.eyes = [];
    for (const s of [1, -1]) {
      const g = new THREE.SphereGeometry(r, 24, 16);
      const m = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.08, metalness: 0.0,
      });
      // Iris drawn procedurally on the sclera sphere.
      const iris = new THREE.Color(cfg.eyeColor);
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uIris = { value: iris };
        sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vLocal;\nvoid main() {')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vLocal = normalize(position);');
        sh.fragmentShader = sh.fragmentShader
          .replace('void main() {', 'varying vec3 vLocal;\nuniform vec3 uIris;\nvoid main() {')
          .replace('#include <color_fragment>', `
            #include <color_fragment>
            {
              float f = vLocal.z;                       // forward = iris side
              float irisMask = smoothstep(0.72, 0.86, f);
              float pupilMask = smoothstep(0.955, 0.985, f);
              // Radial fibre structure in the iris.
              float ang = atan(vLocal.y, vLocal.x);
              float fib = 0.82 + 0.18 * sin(ang * 34.0) * 0.5 + 0.09 * sin(ang * 71.0);
              vec3 irisCol = uIris * fib;
              irisCol *= mix(1.25, 0.55, smoothstep(0.72, 1.0, f));   // darker limbal ring inward
              diffuseColor.rgb = mix(diffuseColor.rgb, irisCol, irisMask);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015), pupilMask);
              // Sclera is never pure white.
              diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.96,0.94,0.92), diffuseColor.rgb, irisMask);
            }
          `);
      };
      const eye = new THREE.Mesh(g, m);
      const yOff = base * (0.10);
      eye.position.set(headP.x + s * spacing, headP.y + yOff, headP.z + base * 0.80);
      eye.layers.set(LAYER.NEAR);
      eye.castShadow = false;
      this.group.add(eye);
      this.eyes.push(eye);
      this.engine.post.patchMaterial(m);
    }
  }

  _buildHair() {
    const cfg = this.config;
    if (cfg.hairStyle === 'None') { this.hair = null; return; }
    const headP = this._worldPos('head');
    const base = 0.098 * cfg.headSize;

    // Hair as a shell over the cranium, thickness and extent per style. Strand
    // detail comes from the shader rather than from geometry.
    const style = {
      Crop:   { up: 1.06, back: 1.02, len: 0.0,  fuzz: 0.35 },
      Swept:  { up: 1.12, back: 1.06, len: 0.06, fuzz: 0.55 },
      Braids: { up: 1.09, back: 1.05, len: 0.22, fuzz: 0.25 },
      Tall:   { up: 1.30, back: 1.02, len: 0.0,  fuzz: 0.70 },
      Long:   { up: 1.10, back: 1.08, len: 0.34, fuzz: 0.60 },
    }[cfg.hairStyle] || { up: 1.1, back: 1.05, len: 0.05, fuzz: 0.5 };

    const SEG_U = 40, SEG_V = 28;
    const pos = [], nrm = [], uv = [], idx = [];
    for (let v = 0; v <= SEG_V; v++) {
      const phi = (v / SEG_V) * Math.PI * 0.78;          // top ~78% of the skull
      for (let u = 0; u <= SEG_U; u++) {
        const theta = (u / SEG_U) * Math.PI * 2;
        const d = new THREE.Vector3(
          Math.sin(phi) * Math.sin(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.cos(theta));
        // Hairline.
        //
        // Hair must cover the scalp and the back of the skull but NOT the
        // face. "Forward and not high up" is the face region; excluding only
        // the upper forehead (the obvious first guess) leaves the shell
        // draped straight over the eyes, nose and mouth.
        const faceness = THREE.MathUtils.smoothstep(d.z, 0.05, 0.62)
                       * THREE.MathUtils.smoothstep(-d.y, -0.52, 0.18);
        const scalp = 1 - faceness;
        // Where hair shouldn't grow, tuck the shell inside the skull so it is
        // simply not visible — keeps the mesh closed and seam-free.
        const s = scalp > 0.02 ? (1.02 + 0.05 * scalp) : 0.86;
        const p = new THREE.Vector3(
          d.x * base * 0.88 * style.back * s,
          d.y * base * 1.16 * style.up * s,
          d.z * base * 0.96 * style.back * s);
        // Length hangs down the back.
        const hang = Math.max(0, -d.z) * Math.max(0, Math.sin(phi)) * style.len * scalp;
        p.y -= hang * base * 8.0;
        p.z -= hang * base * 1.2;
        p.add(headP);
        pos.push(p.x, p.y, p.z);
        nrm.push(d.x, d.y, d.z);
        uv.push(u / SEG_U, v / SEG_V);
      }
    }
    const stride = SEG_U + 1;
    for (let v = 0; v < SEG_V; v++) {
      for (let u = 0; u < SEG_U; u++) {
        const a = v * stride + u, b = a + 1, c = a + stride, dd = c + 1;
        idx.push(a, c, b, b, c, dd);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeVertexNormals();

    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.hairColor),
      roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide,
    });
    const fuzz = style.fuzz;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFuzz = { value: fuzz };
      // three only declares vUv when a map is bound, so carry our own.
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'varying vec2 vHairUv;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vHairUv = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', `
          uniform float uFuzz;
          varying vec2 vHairUv;
          float hh(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
          void main() {`)
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          {
            // Strand banding along the flow direction, plus per-strand tint
            // variation — uniform hair colour is a dead giveaway.
            float strand = sin(vHairUv.x * 420.0 + hh(floor(vHairUv * vec2(210.0, 8.0))) * 6.28);
            float band = 0.80 + 0.20 * strand;
            float tint = hh(floor(vHairUv * vec2(160.0, 10.0)));
            diffuseColor.rgb *= band * (0.82 + 0.36 * tint);
            // Anisotropic sheen highlight running across the strands.
            diffuseColor.rgb += diffuseColor.rgb * pow(max(0.0, strand), 8.0) * 0.5 * uFuzz;
          }
        `);
    };
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    mesh.layers.set(LAYER.NEAR);
    this.group.add(mesh);
    this.hair = mesh;
    this.engine.post.patchMaterial(m);
  }

  _buildHelmet() {
    const cfg = this.config;
    this.helmet = null; this.visor = null;
    if (cfg.helmet === 'Off') return;
    const headP = this._worldPos('head');
    const base = 0.098 * cfg.headSize;

    // Shell — open at the face when in Visor mode.
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(base * 1.30, 40, 28),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(cfg.suitPrimary), roughness: 0.34, metalness: 0.55,
      })
    );
    shell.position.copy(headP);
    shell.scale.set(1.0, 1.06, 1.02);
    shell.castShadow = true;
    shell.layers.set(LAYER.NEAR);
    this.group.add(shell);
    this.helmet = shell;
    this.engine.post.patchMaterial(shell.material);

    // Visor — transmissive, tinted, with a strong grazing-angle reflection.
    const visorGeo = new THREE.SphereGeometry(base * 1.27, 40, 28,
      Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.26, Math.PI * 0.48);
    const tint = new THREE.Color(cfg.visorTint);
    const visorMat = new THREE.MeshPhysicalMaterial({
      color: tint,
      roughness: 0.06, metalness: 0.30,
      transmission: cfg.helmet === 'Full' ? 0.55 : 0.72,
      thickness: 0.01, ior: 1.45,
      transparent: true, opacity: 0.92,
      side: THREE.DoubleSide,
      envMapIntensity: 2.0,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.copy(headP);
    visor.scale.set(1.0, 1.06, 1.02);
    visor.layers.set(LAYER.NEAR);
    this.group.add(visor);
    this.visor = visor;

    if (cfg.helmet === 'Full') {
      // Full helmet hides the face entirely.
      if (this._bodyUniforms) this._bodyUniforms.uHelmet.value = 1;
    }
  }

  /* ---- runtime ---- */

  setConfig(patch) {
    Object.assign(this.config, patch);
    this.build();
  }

  // Cheap updates that don't need a geometry rebuild — used while dragging a
  // colour swatch so the preview stays responsive.
  setColors(patch) {
    Object.assign(this.config, patch);
    const u = this._bodyUniforms;
    if (!u) return;
    if (patch.skinTone) u.uSkinColor.value.set(patch.skinTone);
    if (patch.suitPrimary) u.uSuitPrimary.value.set(patch.suitPrimary);
    if (patch.suitSecondary) u.uSuitSecondary.value.set(patch.suitSecondary);
    if (patch.suitAccent) u.uSuitAccent.value.set(patch.suitAccent);
    if (patch.emissiveColor) u.uEmissive.value.set(patch.emissiveColor);
    if (patch.emissive !== undefined) u.uEmissiveAmt.value = patch.emissive;
    if (patch.suitWear !== undefined) u.uWear.value = patch.suitWear;
    if (patch.skinRough !== undefined) u.uSkinRough.value = patch.skinRough;
    if (patch.freckles !== undefined) u.uFreckles.value = patch.freckles;
    if (patch.hairColor && this.hair) this.hair.material.color.set(patch.hairColor);
    if (patch.eyeColor) for (const e of this.eyes) e.material.userData.iris?.set(patch.eyeColor);
  }

  _disposeGeometry() {
    this.geometry?.dispose();
    this.mesh && (this.mesh.material.dispose?.());
    this.hair?.geometry.dispose();
    this.helmet?.geometry.dispose();
    this.visor?.geometry.dispose();
    for (const e of this.eyes || []) e.geometry.dispose();
  }

  dispose() {
    this._disposeGeometry();
    this.group.clear();
  }
}
