import * as THREE from '../../vendor/three.module.js';
import { HASH, NOISE, COLOR, SCATTER } from '../render/glsl.js';
import { mulberry32, hashSeed } from '../render/noise.js';
import { LAYER } from '../core/engine.js';

/* ===================================================================== *
 * Planet — three concentric shells, everything analytic.
 *
 *   surface     icosphere, displaced in the vertex shader, normals from
 *               finite differences on the sphere tangent basis
 *   clouds      shell at ~1.010 R, domain-warped fBm, alpha blended
 *   atmosphere  shell at ~1.025 R, BackSide + additive, raymarched
 *               single-scattering (Rayleigh + Mie)
 *
 * All three live on LAYER.FAR so they share one depth slice.
 *
 * The terrain height field exists twice: once as GLSL (in the vertex
 * shader) and once as JS (`sampleHeight`). To stop the two drifting apart,
 * every constant in the field — frequencies, amplitudes, seed offsets — is
 * generated once into a params object and then *baked as a literal* into
 * the GLSL source. There are no height-field uniforms to forget to update,
 * and `probeHeightGPU()` renders the GLSL version into a float target so
 * the agreement can be measured rather than assumed.
 * ===================================================================== */

/* ------------------------------------------------------------------ *
 * JS port of glsl.js's snoise3 / fbm3 / ridged3.
 *
 * Deliberately a line-by-line transliteration rather than a "better" JS
 * simplex: the permutation chain stays inside float32's exact-integer
 * range, so both implementations walk the identical lattice and only the
 * final gradient dot products differ, by a few ULPs.
 * ------------------------------------------------------------------ */

const C1 = 1.0 / 6.0, C2 = 1.0 / 3.0;

function mod289(x) { return x - Math.floor(x * (1.0 / 289.0)) * 289.0; }
function permute(x) { return mod289(((x * 34.0) + 1.0) * x); }
function taylorInvSqrt(r) { return 1.79284291400159 - 0.85373472095314 * r; }

const _pk = new Float64Array(4);
const _gx = new Float64Array(4), _gy = new Float64Array(4), _gz = new Float64Array(4);
const _ax = new Float64Array(4), _ay = new Float64Array(4), _az = new Float64Array(4);

export function snoise3(vx, vy, vz) {
  const sk = (vx + vy + vz) * C2;
  let ix = Math.floor(vx + sk), iy = Math.floor(vy + sk), iz = Math.floor(vz + sk);
  const tk = (ix + iy + iz) * C1;
  const x0x = vx - ix + tk, x0y = vy - iy + tk, x0z = vz - iz + tk;

  // g = step(x0.yzx, x0.xyz)
  const gx = x0x >= x0y ? 1 : 0;
  const gy = x0y >= x0z ? 1 : 0;
  const gz = x0z >= x0x ? 1 : 0;
  const lx = 1 - gx, ly = 1 - gy, lz = 1 - gz;
  const i1x = Math.min(gx, lz), i1y = Math.min(gy, lx), i1z = Math.min(gz, ly);
  const i2x = Math.max(gx, lz), i2y = Math.max(gy, lx), i2z = Math.max(gz, ly);

  const x1x = x0x - i1x + C1, x1y = x0y - i1y + C1, x1z = x0z - i1z + C1;
  const x2x = x0x - i2x + C2, x2y = x0y - i2y + C2, x2z = x0z - i2z + C2;
  const x3x = x0x - 0.5, x3y = x0y - 0.5, x3z = x0z - 0.5;

  ix = mod289(ix); iy = mod289(iy); iz = mod289(iz);

  _ax[0] = 0; _ax[1] = i1x; _ax[2] = i2x; _ax[3] = 1;
  _ay[0] = 0; _ay[1] = i1y; _ay[2] = i2y; _ay[3] = 1;
  _az[0] = 0; _az[1] = i1z; _az[2] = i2z; _az[3] = 1;
  for (let k = 0; k < 4; k++) {
    let v = permute(iz + _az[k]);
    v = permute(v + iy + _ay[k]);
    v = permute(v + ix + _ax[k]);
    _pk[k] = v;
  }

  const n_ = 0.142857142857;
  const nsx = n_ * 2.0, nsy = n_ * 0.5 - 1.0, nsz = n_ * 1.0;
  const nz2 = nsz * nsz;

  for (let k = 0; k < 4; k++) {
    const j = _pk[k] - 49.0 * Math.floor(_pk[k] * nz2);
    const xf = Math.floor(j * nsz);
    const yf = Math.floor(j - 7.0 * xf);
    const xx = xf * nsx + nsy;
    const yy = yf * nsx + nsy;
    const hh = 1.0 - Math.abs(xx) - Math.abs(yy);
    const sh = hh <= 0.0 ? -1.0 : 0.0;
    let px = xx + (Math.floor(xx) * 2.0 + 1.0) * sh;
    let py = yy + (Math.floor(yy) * 2.0 + 1.0) * sh;
    const nrm = taylorInvSqrt(px * px + py * py + hh * hh);
    _gx[k] = px * nrm; _gy[k] = py * nrm; _gz[k] = hh * nrm;
  }

  let m0 = Math.max(0.6 - (x0x * x0x + x0y * x0y + x0z * x0z), 0.0);
  let m1 = Math.max(0.6 - (x1x * x1x + x1y * x1y + x1z * x1z), 0.0);
  let m2 = Math.max(0.6 - (x2x * x2x + x2y * x2y + x2z * x2z), 0.0);
  let m3 = Math.max(0.6 - (x3x * x3x + x3y * x3y + x3z * x3z), 0.0);
  m0 *= m0; m1 *= m1; m2 *= m2; m3 *= m3;
  m0 *= m0; m1 *= m1; m2 *= m2; m3 *= m3;

  return 42.0 * (
    m0 * (_gx[0] * x0x + _gy[0] * x0y + _gz[0] * x0z) +
    m1 * (_gx[1] * x1x + _gy[1] * x1y + _gz[1] * x1z) +
    m2 * (_gx[2] * x2x + _gy[2] * x2y + _gz[2] * x2z) +
    m3 * (_gx[3] * x3x + _gy[3] * x3y + _gz[3] * x3z));
}

export function fbm3(px, py, pz, oct, lac, gain) {
  let a = 0.5, s = 0.0, n = 0.0;
  let x = px, y = py, z = pz;
  for (let i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * snoise3(x, y, z); n += a;
    x *= lac; y *= lac; z *= lac; a *= gain;
  }
  return s / Math.max(n, 1e-4);
}

export function ridged3(px, py, pz, oct, lac, gain) {
  let a = 0.5, s = 0.0, n = 0.0, prev = 1.0;
  let x = px, y = py, z = pz;
  for (let i = 0; i < 8; i++) {
    if (i >= oct) break;
    let r = 1.0 - Math.abs(snoise3(x, y, z));
    r *= r; r *= prev; prev = r;
    s += a * r; n += a;
    x *= lac; y *= lac; z *= lac; a *= gain;
  }
  return s / Math.max(n, 1e-4);
}

function smoothstep(e0, e1, x) {
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ *
 * Field parameter generation + GLSL literal baking
 * ------------------------------------------------------------------ */

// GLSL needs an unambiguous float literal; 1 would be an int and fail to
// compile inside a vec3(...) constructor mixed with floats.
function g(x) {
  if (!isFinite(x)) x = 0;
  let s = x.toFixed(6);
  if (s.indexOf('.') < 0) s += '.0';
  return s;
}
function gv(a, b, c) { return `vec3(${g(a)}, ${g(b)}, ${g(c)})`; }

function makeFieldParams(seed, type, tuning = {}) {
  const rnd = mulberry32(hashSeed(seed >>> 0, 0x51a3d9f1));
  const off = () => (rnd() * 800 - 400);
  const P = {
    // seed offsets — one triple per noise field so they decorrelate
    o: Array.from({ length: 18 }, off),

    contFreq: 1.05 + rnd() * 0.5,
    contWarp: 0.55,
    seaLevel: 0.05,
    contAmp: 1.50,
    oceanSquash: 0.45,

    beltFreq: 1.9 + rnd() * 0.6,
    mountFreq: 3.4 + rnd() * 1.2,
    mountAmp: 0.85,

    detailFreq: 26.0 + rnd() * 8.0,
    detailAmp: 0.11,

    moistFreq: 1.6 + rnd() * 0.5,
    tempFreq: 2.3 + rnd() * 0.5,
    maxElev: 1.15,
  };
  Object.assign(P, tuning);
  return P;
}

/* The single source of truth for terrain, emitted as GLSL with every
 * constant inlined. `terrainFieldJS` below must mirror this exactly. */
function fieldGLSL(P) {
  const o = P.o;
  return /* glsl */ `
float terrainField(vec3 dir){
  vec3 sd = dir * ${g(P.contFreq)} + ${gv(o[0], o[1], o[2])};
  vec3 w = vec3(
    fbm3(sd + 13.1, 2, 2.0, 0.5),
    fbm3(sd + 37.7, 2, 2.0, 0.5),
    fbm3(sd + 71.3, 2, 2.0, 0.5));
  float cont = fbm3(sd + w * ${g(P.contWarp)}, 4, 2.05, 0.5);
  float land = cont - ${g(P.seaLevel)};
  float landMask = smoothstep(0.0, 0.10, land);
  float belt = fbm3(dir * ${g(P.beltFreq)} + ${gv(o[3], o[4], o[5])}, 3, 2.0, 0.5) * 0.5 + 0.5;
  float beltMask = smoothstep(0.40, 0.76, belt);
  float ridge = ridged3(dir * ${g(P.mountFreq)} + ${gv(o[6], o[7], o[8])}, 5, 2.11, 0.5);
  float mount = pow(max(ridge, 0.0), 1.4) * beltMask * landMask;
  float detail = fbm3(dir * ${g(P.detailFreq)} + ${gv(o[9], o[10], o[11])}, 4, 2.17, 0.5);
  float lo = land < 0.0 ? land * ${g(P.oceanSquash)} : land;
  return lo * ${g(P.contAmp)} + mount * ${g(P.mountAmp)}
       + detail * ${g(P.detailAmp)} * (0.30 + 0.70 * landMask);
}

// Climate fields. Low frequency, so they are evaluated per-vertex and
// interpolated; the fragment shader never pays for them.
void climateField(vec3 dir, float elev, out float moist, out float temp){
  float m = fbm3(dir * ${g(P.moistFreq)} + ${gv(o[12], o[13], o[14])}, 3, 2.0, 0.5) * 0.5 + 0.5;
  float lat = abs(dir.y);
  // Wet tropics + wet temperate belt, dry horse latitudes at ~30 degrees.
  float zonal = 0.62 - 0.55 * smoothstep(0.10, 0.48, lat) + 0.40 * smoothstep(0.55, 0.92, lat);
  moist = clamp(m * 0.62 + zonal * 0.55 - 0.18 - max(elev, 0.0) * 0.22, 0.0, 1.0);
  float t = fbm3(dir * ${g(P.tempFreq)} + ${gv(o[15], o[16], o[17])}, 2, 2.0, 0.5);
  // Insolation falls off with latitude; lapse rate cools high ground.
  temp = clamp(1.02 - 1.28 * pow(lat, 1.45) - max(elev, 0.0) * 0.55 + t * 0.10, 0.0, 1.0);
}
`;
}

function terrainFieldJS(P, dx, dy, dz) {
  const o = P.o;
  const sx = dx * P.contFreq + o[0], sy = dy * P.contFreq + o[1], sz = dz * P.contFreq + o[2];
  const wx = fbm3(sx + 13.1, sy + 13.1, sz + 13.1, 2, 2.0, 0.5);
  const wy = fbm3(sx + 37.7, sy + 37.7, sz + 37.7, 2, 2.0, 0.5);
  const wz = fbm3(sx + 71.3, sy + 71.3, sz + 71.3, 2, 2.0, 0.5);
  const cont = fbm3(sx + wx * P.contWarp, sy + wy * P.contWarp, sz + wz * P.contWarp, 4, 2.05, 0.5);
  const land = cont - P.seaLevel;
  const landMask = smoothstep(0.0, 0.10, land);
  const belt = fbm3(dx * P.beltFreq + o[3], dy * P.beltFreq + o[4], dz * P.beltFreq + o[5], 3, 2.0, 0.5) * 0.5 + 0.5;
  const beltMask = smoothstep(0.40, 0.76, belt);
  const ridge = ridged3(dx * P.mountFreq + o[6], dy * P.mountFreq + o[7], dz * P.mountFreq + o[8], 5, 2.11, 0.5);
  const mount = Math.pow(Math.max(ridge, 0.0), 1.4) * beltMask * landMask;
  const detail = fbm3(dx * P.detailFreq + o[9], dy * P.detailFreq + o[10], dz * P.detailFreq + o[11], 4, 2.17, 0.5);
  const lo = land < 0.0 ? land * P.oceanSquash : land;
  return lo * P.contAmp + mount * P.mountAmp + detail * P.detailAmp * (0.30 + 0.70 * landMask);
}

/* ------------------------------------------------------------------ *
 * Cloud field — shared by the cloud shell and the surface's shadow tap
 * ------------------------------------------------------------------ */

const CLOUD_GLSL = /* glsl */ `
uniform float uCloudFreq;
uniform float uCloudCover;
uniform float uCloudTime;

// Rotate about the planet spin axis.
vec3 spin(vec3 d, float a){
  float c = cos(a), s = sin(a);
  return vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
}

// Large-scale structure first, noise second. Uniform fBm on a sphere reads
// as static; real atmospheres are organised into zonal bands by rotation
// and sheared into cyclonic streaks by the latitudinal velocity gradient,
// so both are applied to the *domain* before any detail is added.
float cloudField(vec3 dir, int oct){
  vec3 d = spin(dir, uCloudTime * 0.012);
  float lat = d.y;

  // Differential rotation: each latitude is rotated by a different angle,
  // which drags the noise out into the streaks and hooks of a weather map.
  float shear = lat * 2.6 + sin(lat * 5.0) * 0.9;
  vec3 ds = spin(d, shear);

  // Zonal bands (ITCZ + mid-latitude storm tracks), themselves wavy.
  float bandN = fbm3(ds * 1.1 + 4.3, 3, 2.0, 0.5);
  float bands = 0.5 + 0.5 * sin(lat * 8.5 + bandN * 2.6);

  vec3 q = ds * uCloudFreq;
  vec3 w = vec3(
    fbm3(q + 1.7, 3, 2.0, 0.5),
    fbm3(q + 9.2, 3, 2.0, 0.5),
    fbm3(q + 5.5, 3, 2.0, 0.5));
  float n = fbm3(q + w * 1.7, oct, 2.2, 0.55) * 0.5 + 0.5;

  float cover = n * mix(0.72, 1.30, bands);
  float thr = 1.0 - uCloudCover;
  return smoothstep(thr, thr + 0.20, cover);
}

// Cheap variant for the shadow tap: no domain warp, fewer octaves. Keeps
// the same large-scale banding so shadows land under the right clouds.
float cloudFieldCheap(vec3 dir){
  vec3 d = spin(dir, uCloudTime * 0.012);
  float lat = d.y;
  float shear = lat * 2.6 + sin(lat * 5.0) * 0.9;
  vec3 ds = spin(d, shear);
  float bandN = fbm3(ds * 1.1 + 4.3, 2, 2.0, 0.5);
  float bands = 0.5 + 0.5 * sin(lat * 8.5 + bandN * 2.6);
  float n = fbm3(ds * uCloudFreq, 3, 2.2, 0.55) * 0.5 + 0.5;
  float cover = n * mix(0.72, 1.30, bands);
  float thr = 1.0 - uCloudCover;
  return smoothstep(thr, thr + 0.24, cover);
}
`;

/* ------------------------------------------------------------------ *
 * Surface shaders
 * ------------------------------------------------------------------ */

function surfaceVert(P) {
  return /* glsl */ `
${NOISE}
${fieldGLSL(P)}

uniform float uRadius;
uniform float uRelief;
uniform float uNormalBoost;
uniform float uFdEps;

varying vec3  vDir;
varying vec3  vNrm;
varying vec3  vTan;
varying vec3  vBit;
varying vec3  vWorld;
varying float vElev;
varying float vMoist;
varying float vTemp;

void main(){
  vec3 dir = normalize(position);

#ifdef GASGIANT
  vElev = 0.0; vMoist = 0.5; vTemp = 0.5;
  vNrm = dir;
  vec3 up = abs(dir.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vTan = normalize(cross(up, dir));
  vBit = cross(dir, vTan);
  vec3 p = dir;
#else
  float e = terrainField(dir);

  // Tangent frame on the sphere. Finite differences are taken along it so
  // the gradient is a true surface gradient, not a coordinate artefact.
  vec3 up = abs(dir.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(up, dir));
  vec3 b = cross(dir, t);

  float ex = terrainField(normalize(dir + t * uFdEps));
  float ey = terrainField(normalize(dir + b * uFdEps));

#ifdef HAS_OCEAN
  // The ocean is a real surface, so it must be geometrically flat: the
  // displacement AND the gradient are both taken from the clamped field,
  // which flattens the sea and leaves a genuine cliff at the coast.
  float d0 = max(e, 0.0), dx = max(ex, 0.0), dy = max(ey, 0.0);
#else
  float d0 = e, dx = ex, dy = ey;
#endif

  float ddx = (dx - d0) / uFdEps;
  float ddy = (dy - d0) / uFdEps;

  vElev = e;
  climateField(dir, e, vMoist, vTemp);
  vNrm = normalize(dir - (t * ddx + b * ddy) * uRelief * uNormalBoost);
  vTan = t; vBit = b;
  vec3 p = dir * (1.0 + d0 * uRelief);
#endif

  vDir = dir;
  vec4 wp = modelMatrix * vec4(p * uRadius, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
}

function surfaceFrag(P) {
  return /* glsl */ `
${HASH}
${NOISE}
${COLOR}
${CLOUD_GLSL}

uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform float uSunI;
uniform vec3  uCamPos;
uniform float uTime;
uniform float uRadius;
uniform float uCloudShellR;
uniform float uCloudShadow;
uniform float uDetailAmt;
uniform float uDetailFreq;
uniform float uNightLights;
uniform vec3  uNightColor;
uniform float uAtmDensity;
uniform vec3  uBetaR;
uniform float uHr;
uniform vec3  uAmbient;

uniform vec3 uColDeep, uColShallow, uColBeach, uColDesert, uColSavanna;
uniform vec3 uColForest, uColTundra, uColRock, uColSnow;
uniform float uOceanRough, uLandRough;

varying vec3  vDir;
varying vec3  vNrm;
varying vec3  vTan;
varying vec3  vBit;
varying vec3  vWorld;
varying float vElev;
varying float vMoist;
varying float vTemp;

float d_ggx(float ndh, float a){
  float a2 = a * a;
  float d = (ndh * ndh) * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d);
}
float v_smith(float ndv, float ndl, float a){
  float a2 = a * a;
  float lv = ndl * sqrt(ndv * ndv * (1.0 - a2) + a2);
  float ll = ndv * sqrt(ndl * ndl * (1.0 - a2) + a2);
  return 0.5 / max(lv + ll, 1e-5);
}

void main(){
  vec3 dirN = normalize(vDir);
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uCamPos - vWorld);
  vec3 L = normalize(uSunDir);

  float mottle = 0.0;

  // Per-fragment detail: normal perturbation from a mid-frequency fBm,
  // faded out with distance so a full-disc view never pays for it.
  if(uDetailAmt > 0.002){
    vec3 T = normalize(vTan), B = normalize(vBit);
    vec3 dp = dirN * uDetailFreq;
    float de = 0.02 * uDetailFreq;
    float n0 = fbm3(dp, 3, 2.2, 0.5);
    float nx = fbm3(dp + T * de, 3, 2.2, 0.5);
    float ny = fbm3(dp + B * de, 3, 2.2, 0.5);
    mottle = n0;
    N = normalize(N - (T * (nx - n0) + B * (ny - n0)) * uDetailAmt);
  }

  float slope = 1.0 - clamp(dot(N, dirN), 0.0, 1.0);
  float alt = clamp(vElev / ${g(P.maxElev)}, 0.0, 1.0);
  float lat = abs(dirN.y);

  vec3  albedo;
  float rough;
  float f0 = 0.04;
  float ocean = 0.0;

#ifdef GASGIANT
  // Zonal bands: noise stretched hard in longitude, plus ridged vortices.
  vec3 bp = vec3(dirN.x, dirN.y * 7.0, dirN.z) * 1.6 + uTime * 0.004;
  float bn = fbm3(bp, 5, 2.1, 0.55);
  float band = sin(dirN.y * 15.0 + bn * 2.2);
  vec3 c = mix(uColDesert, uColSavanna, 0.5 + 0.5 * band);
  c = mix(c, uColBeach, smoothstep(0.35, 0.85, ridged3(bp * 0.9 + 21.0, 4, 2.2, 0.5)));
  c = mix(c, uColSnow, smoothstep(0.55, 0.95, lat));
  albedo = c;
  rough = 0.9;
#else
  #ifdef HAS_OCEAN
  if(vElev <= 0.0){
    ocean = 1.0;
    float depth = clamp(-vElev / 0.55, 0.0, 1.0);
    // Shallow shelves scatter off the bottom and read green; the abyss is
    // nearly black and only visible through its specular.
    albedo = mix(uColShallow, uColDeep, sqrt(depth));
    rough = uOceanRough;
    f0 = 0.020;
    // Sea ice where it is cold enough.
    float ice = smoothstep(0.20, 0.06, vTemp);
    albedo = mix(albedo, uColSnow * 0.85, ice);
    rough = mix(rough, 0.55, ice);
    f0 = mix(f0, 0.04, ice);
    N = normalize(mix(dirN, N, ice));   // flat water, bumpy ice
  } else
  #endif
  {
    // --- land biomes: moisture x temperature, then altitude and slope ---
    vec3 hot  = mix(uColDesert, uColSavanna, smoothstep(0.22, 0.46, vMoist));
    hot       = mix(hot, uColForest, smoothstep(0.46, 0.70, vMoist));
    vec3 cold = mix(uColTundra, uColForest * 0.72, smoothstep(0.34, 0.62, vMoist));
    albedo = mix(cold, hot, smoothstep(0.20, 0.46, vTemp));

    float rocky = max(smoothstep(0.22, 0.55, slope), smoothstep(0.50, 0.82, alt));
    albedo = mix(albedo, uColRock, rocky);

    // Snow needs BOTH altitude and cold — a snow line, not a white band.
    float snowT = smoothstep(0.34, 0.04, vTemp);
    float snowA = smoothstep(0.42, 0.86, alt);
    float snow = smoothstep(0.34, 0.76, snowT * 0.62 + snowA * 0.60);
    snow *= 1.0 - smoothstep(0.45, 0.70, slope);   // bare rock on cliffs
    albedo = mix(albedo, uColSnow, snow);

    #ifdef HAS_OCEAN
    float beach = smoothstep(0.030, 0.002, vElev) * (1.0 - snow);
    albedo = mix(albedo, uColBeach, beach);
    #endif

    rough = mix(uLandRough, 0.94, rocky);
    rough = mix(rough, 0.60, snow);
  }
#endif

  albedo *= 0.86 + 0.28 * (mottle * 0.5 + 0.5);

  /* ---------------- direct lighting ---------------- */
  float ndlG = dot(dirN, L);           // geometric — drives the terminator
  float ndl  = dot(N, L);
  float ndv  = max(dot(N, V), 1e-4);

  // Self shadowing from the shading normal, softened so displaced terrain
  // does not produce a hard black bite at the terminator.
  float diff = clamp(ndl, 0.0, 1.0) * smoothstep(-0.06, 0.05, ndlG);

  float shadow = 1.0;
  if(uCloudShadow > 0.001 && ndlG > -0.1){
    // Where does the sun ray from this point pierce the cloud deck?
    vec3 p = dirN * (1.0 + max(vElev, 0.0) * 0.0);
    float bq = dot(p, L);
    float cc = dot(p, p) - uCloudShellR * uCloudShellR;
    float hq = bq * bq - cc;
    if(hq > 0.0){
      float tq = -bq + sqrt(hq);
      vec3 cp = normalize(p + L * tq);
      shadow = 1.0 - uCloudShadow * cloudFieldCheap(cp);
    }
  }

  vec3 sun = uSunColor * uSunI;
  vec3 direct = albedo * (diff / 3.14159265) * sun * shadow;

  // Specular: a real glint on water is the single strongest cue that the
  // ocean is a surface and not a blue-painted sphere.
  vec3 H = normalize(L + V);
  float ndh = clamp(dot(N, H), 0.0, 1.0);
  float vdh = clamp(dot(V, H), 0.0, 1.0);
  float a = max(rough * rough, 0.0016);
  float fres = f0 + (1.0 - f0) * pow(1.0 - vdh, 5.0);
  float spec = d_ggx(ndh, a) * v_smith(ndv, max(ndl, 1e-4), a) * fres;
  vec3 specular = vec3(spec) * clamp(ndl, 0.0, 1.0) * sun * shadow
                * smoothstep(-0.02, 0.06, ndlG);

  vec3 col = direct + specular;

  // Ambient: sky-scattered light on the day side only, plus a whisper of
  // starlight so the night side is not mathematically black.
  col += albedo * uAmbient * (0.25 + 0.75 * clamp(ndlG * 2.0, 0.0, 1.0));

  /* ---------------- atmospheric extinction ---------------- */
  // Ground seen through a long slant path loses blue first — this is what
  // makes the disc redden and dim toward the limb. Chapman is approximated
  // by a clamped secant, whose horizon value (50) matches sqrt(pi*R/2H).
  if(uAtmDensity > 0.001){
    float mu = clamp(dot(dirN, V), 0.0, 1.0);
    float chap = 1.0 / max(mu, 0.02);
    float muL = clamp(ndlG, 0.0, 1.0);
    float chapL = 1.0 / max(muL, 0.02);
    vec3 tau = uBetaR * uHr * (chap + chapL) * uAtmDensity;
    col *= exp(-tau);
  }

  /* ---------------- night side city lights ---------------- */
#ifdef HAS_CITY
  if(uNightLights > 0.001 && ndlG < 0.14 && vElev > 0.004){
    // Habitability: temperate, not too dry, not too high, near the coast.
    float hab = smoothstep(0.30, 0.55, vTemp) * (1.0 - smoothstep(0.72, 0.95, vTemp));
    hab *= smoothstep(0.16, 0.42, vMoist);
    hab *= 1.0 - smoothstep(0.28, 0.62, alt);
    hab *= 1.0 - smoothstep(0.20, 0.45, slope);
    if(hab > 0.01){
      // Two scales: conurbations, then individual light clusters inside.
      float region = fbm3(dirN * 9.0 + 313.0, 3, 2.2, 0.5) * 0.5 + 0.5;
      float cluster = smoothstep(0.56, 0.82, region);
      float spark = fbm3(dirN * 260.0 + 71.0, 2, 2.4, 0.5) * 0.5 + 0.5;
      float lights = cluster * hab * pow(clamp(spark, 0.0, 1.0), 7.0) * 6.0;
      float night = smoothstep(0.14, -0.06, ndlG);
      col += uNightColor * lights * uNightLights * night;
    }
  }
#endif

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;
}

/* ------------------------------------------------------------------ *
 * Cloud shell
 * ------------------------------------------------------------------ */

const CLOUD_VERT = /* glsl */ `
uniform float uScale;
varying vec3 vDir;
varying vec3 vWorld;
void main(){
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(vDir * uScale, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CLOUD_FRAG = /* glsl */ `
${HASH}
${NOISE}
${SCATTER}
${CLOUD_GLSL}

uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform float uSunI;
uniform vec3  uCamPos;
uniform float uOpacity;
uniform vec3  uTint;
uniform float uFrame;

varying vec3 vDir;
varying vec3 vWorld;

void main(){
  vec3 d = normalize(vDir);
  float dens = cloudField(d, CLOUD_OCT);
  if(dens <= 0.003) discard;

  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vWorld);
  float ndl = dot(d, L);

  // Terminator: clouds catch the sun a little past the geometric horizon
  // because they sit above the surface, and they redden as they do.
  float lit = smoothstep(-0.12, 0.16, ndl);
  float warm = smoothstep(0.35, -0.05, ndl) * lit;

  // Forward scattering. Thin cloud edges seen against the sun glow far
  // brighter than their albedo — the silver lining.
  float mu = dot(-V, L);
  float fwd = miePhase(mu, 0.62) * 3.0;
  float thin = 1.0 - dens;

  vec3 sun = uSunColor * uSunI;
  vec3 col = uTint * sun * (lit * 0.30 + 0.02);
  col += uTint * sun * fwd * (0.10 + 0.55 * thin * thin) * lit;
  col = mix(col, col * vec3(1.35, 0.92, 0.68), warm * 0.7);

  // A touch of blue bounce from the sky beneath.
  col += vec3(0.05, 0.09, 0.16) * lit * 0.35;

  float alpha = dens * uOpacity;
  alpha *= 0.35 + 0.65 * smoothstep(-0.25, 0.05, ndl);   // night clouds fade out

  float dth = (ign(gl_FragCoord.xy + uFrame * 3.0) - 0.5) * 0.004;
  gl_FragColor = vec4(max(col + dth, 0.0), clamp(alpha, 0.0, 1.0));
}
`;

/* ------------------------------------------------------------------ *
 * Atmosphere shell
 * ------------------------------------------------------------------ */

const ATMO_VERT = /* glsl */ `
uniform float uScale;
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(normalize(position) * uScale, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ATMO_FRAG = /* glsl */ `
${HASH}
${SCATTER}

uniform vec3  uCamPos;
uniform vec3  uCenter;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform float uSunI;
uniform float uRadius;
uniform float uAtmR;
uniform float uHr;
uniform float uHm;
uniform vec3  uBetaR;
uniform float uBetaM;
uniform float uG;
uniform float uFrame;
uniform float uDensity;

varying vec3 vWorld;

// Sample placement.
//
// The shell is ~20 scale heights thick, so uniform steps put almost every
// sample in near-vacuum and miss the dense sliver around the ray's closest
// approach entirely — which is exactly the part that produces the limb.
// This maps a uniform parameter onto the interval with a cubic bias toward
// the tangent point, so the samples land where the density is.
float mapT(float u, float t0, float t1, float tm){
  float span = max(t1 - t0, 1e-7);
  float f = clamp((tm - t0) / span, 0.0, 1.0);
  if(u < f){
    float s = u / max(f, 1e-6);
    float o = 1.0 - s;
    return tm - (tm - t0) * (o * o * o);
  }
  float s = (u - f) / max(1.0 - f, 1e-6);
  return tm + (t1 - tm) * (s * s * s);
}

void main(){
  // Everything is done in planet radii: the raw world units are ~1e7 and
  // would eat all of float32's mantissa before the exp() ever ran.
  vec3 ro = (uCamPos - uCenter) / uRadius;
  vec3 rd = normalize(vWorld - uCamPos);

  vec2 atm = raySphere(ro, rd, vec3(0.0), uAtmR);
  if(atm.x > atm.y) discard;
  float t0 = max(atm.x, 0.0);
  float t1 = atm.y;

  // Occlusion by the planet body, done analytically rather than with the
  // depth buffer: the shell is BackSide, so its fragments are *behind* the
  // planet and a depth test would reject the whole disc.
  vec2 pl = raySphere(ro, rd, vec3(0.0), 1.0);
  bool hitP = (pl.x < pl.y) && (pl.y > 0.0);
  if(hitP) t1 = min(t1, max(pl.x, 0.0));
  if(t1 <= t0 + 1e-7) discard;

  vec3 L = normalize(uSunDir);
  float mu = dot(rd, L);
  float phR = rayleighPhase(mu);
  float phM = miePhase(mu, uG);

  float tm = clamp(-dot(ro, rd), t0, t1);
  float jitter = ign(gl_FragCoord.xy + uFrame * 11.0);

  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  float prev = t0;

  for(int i = 0; i < VIEW_STEPS; i++){
    float u = float(i + 1) / float(VIEW_STEPS);
    float tb = mapT(u, t0, t1, tm);
    float dt = tb - prev;
    float t = prev + dt * jitter;
    prev = tb;
    if(dt <= 0.0) continue;

    vec3 p = ro + rd * t;
    float r = length(p);
    float h = r - 1.0;
    float dR = exp(-h / uHr) * dt * uDensity;
    float dM = exp(-h / uHm) * dt * uDensity;

    odR += dR * 0.5; odM += dM * 0.5;

    // Planet shadow, soft. Rather than a second ray/sphere test, measure
    // how far the light ray from p passes from the planet centre; the
    // smoothstep across the limb is the penumbra, and it is what turns the
    // terminator into a gradient instead of a knife edge.
    float projL = dot(p, L);
    float perp = length(p - L * projL);
    float shadow = projL > 0.0 ? 1.0 : smoothstep(1.0 - 0.004, 1.0 + 0.030, perp);

    float lodR = 0.0, lodM = 0.0;
    if(shadow > 0.001){
      vec2 ls = raySphere(p, L, vec3(0.0), uAtmR);
      float lmax = max(ls.y, 0.0);
      float lprev = 0.0;
      for(int j = 0; j < LIGHT_STEPS; j++){
        float lu = float(j + 1) / float(LIGHT_STEPS);
        float lt = lmax * lu * lu;      // dense near p, where the air is
        float ldt = lt - lprev;
        vec3 q = p + L * (lprev + ldt * 0.5);
        float lh = length(q) - 1.0;
        lodR += exp(-lh / uHr) * ldt * uDensity;
        lodM += exp(-lh / uHm) * ldt * uDensity;
        lprev = lt;
      }
    }

    vec3 tau = uBetaR * (odR + lodR) + vec3(uBetaM * 1.11) * (odM + lodM);
    vec3 att = exp(-tau) * shadow;

    sumR += dR * att;
    sumM += dM * att;

    odR += dR * 0.5; odM += dM * 0.5;
  }

  vec3 col = (sumR * uBetaR * phR + sumM * vec3(uBetaM) * phM) * uSunColor * uSunI;

  // The limb is one long, smooth, low-amplitude ramp: the exact signal that
  // bands at 8 bits. Jittered ray starts kill the stepping, this kills the
  // quantisation.
  float d2 = ign(gl_FragCoord.xy + uFrame * 29.0) - 0.5;
  col += d2 * 0.0022;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

/* ------------------------------------------------------------------ *
 * Height probe (GPU) — used to verify sampleHeight against the shader
 * ------------------------------------------------------------------ */

function probeVert(P) {
  return /* glsl */ `
${NOISE}
${fieldGLSL(P)}
attribute float aIndex;
uniform float uCount;
varying float vE;
void main(){
  vE = terrainField(normalize(position));
  float x = ((aIndex + 0.5) / uCount) * 2.0 - 1.0;
  gl_Position = vec4(x, 0.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;
}
const PROBE_FRAG = /* glsl */ `
varying float vE;
void main(){ gl_FragColor = vec4(vE, 0.0, 0.0, 1.0); }
`;

/* ------------------------------------------------------------------ *
 * Type presets
 * ------------------------------------------------------------------ */

const C = (r, gg, b) => new THREE.Color(r, gg, b);

const TYPES = {
  terran: {
    hasOcean: true, hasClouds: true, hasCityLights: true, atmosphere: true,
    palette: {
      deep: C(0.0035, 0.0105, 0.0330), shallow: C(0.020, 0.078, 0.088),
      beach: C(0.330, 0.278, 0.185), desert: C(0.400, 0.300, 0.172),
      savanna: C(0.230, 0.205, 0.092), forest: C(0.042, 0.070, 0.030),
      tundra: C(0.150, 0.140, 0.110), rock: C(0.105, 0.098, 0.088),
      snow: C(0.760, 0.790, 0.830),
    },
    tint: C(0.42, 0.62, 1.00), cloudTint: C(1.0, 0.99, 0.98),
    cloudCover: 0.46, relief: 0.0038, oceanRough: 0.055, landRough: 0.82,
    atmDensity: 1.0,
  },
  desert: {
    hasOcean: false, hasClouds: true, hasCityLights: false, atmosphere: true,
    field: { seaLevel: -0.02, detailAmp: 0.16 },
    palette: {
      deep: C(0.09, 0.055, 0.032), shallow: C(0.13, 0.08, 0.05),
      beach: C(0.30, 0.20, 0.12), desert: C(0.290, 0.165, 0.082),
      savanna: C(0.235, 0.130, 0.068), forest: C(0.180, 0.105, 0.058),
      tundra: C(0.225, 0.155, 0.105), rock: C(0.135, 0.082, 0.050),
      snow: C(0.520, 0.470, 0.420),
    },
    tint: C(1.00, 0.58, 0.36), cloudTint: C(0.95, 0.78, 0.62),
    cloudCover: 0.14, relief: 0.0060, oceanRough: 0.8, landRough: 0.92,
    atmDensity: 0.16, cloudOpacity: 0.45,
  },
  ice: {
    hasOcean: true, hasClouds: true, hasCityLights: false, atmosphere: true,
    field: { seaLevel: 0.02 },
    palette: {
      deep: C(0.045, 0.090, 0.135), shallow: C(0.240, 0.360, 0.430),
      beach: C(0.560, 0.610, 0.660), desert: C(0.520, 0.560, 0.610),
      savanna: C(0.540, 0.585, 0.640), forest: C(0.400, 0.470, 0.530),
      tundra: C(0.600, 0.650, 0.700), rock: C(0.120, 0.125, 0.140),
      snow: C(0.830, 0.870, 0.920),
    },
    tint: C(0.55, 0.72, 1.00), cloudTint: C(1.0, 1.0, 1.0),
    cloudCover: 0.40, relief: 0.0030, oceanRough: 0.35, landRough: 0.55,
    atmDensity: 0.45, coldShift: 0.55,
  },
  volcanic: {
    hasOcean: false, hasClouds: true, hasCityLights: false, atmosphere: true,
    field: { seaLevel: -0.05, mountAmp: 1.05 },
    palette: {
      deep: C(0.35, 0.06, 0.010), shallow: C(0.50, 0.10, 0.015),
      beach: C(0.075, 0.062, 0.058), desert: C(0.060, 0.050, 0.046),
      savanna: C(0.055, 0.044, 0.040), forest: C(0.045, 0.038, 0.036),
      tundra: C(0.070, 0.058, 0.054), rock: C(0.038, 0.033, 0.031),
      snow: C(0.180, 0.160, 0.150),
    },
    tint: C(1.00, 0.42, 0.20), cloudTint: C(0.55, 0.42, 0.38),
    cloudCover: 0.30, relief: 0.0075, oceanRough: 0.5, landRough: 0.95,
    atmDensity: 0.55, cloudOpacity: 0.7,
  },
  barren: {
    hasOcean: false, hasClouds: false, hasCityLights: false, atmosphere: false,
    field: { seaLevel: -0.06, mountAmp: 0.7, detailAmp: 0.20 },
    palette: {
      deep: C(0.06, 0.06, 0.062), shallow: C(0.08, 0.08, 0.082),
      beach: C(0.115, 0.112, 0.108), desert: C(0.108, 0.104, 0.100),
      savanna: C(0.100, 0.097, 0.094), forest: C(0.092, 0.090, 0.088),
      tundra: C(0.118, 0.116, 0.114), rock: C(0.075, 0.073, 0.072),
      snow: C(0.200, 0.200, 0.205),
    },
    tint: C(0.6, 0.6, 0.6), cloudTint: C(1, 1, 1),
    cloudCover: 0.0, relief: 0.0070, oceanRough: 0.9, landRough: 0.95,
    atmDensity: 0.0,
  },
  gasgiant: {
    hasOcean: false, hasClouds: false, hasCityLights: false, atmosphere: true,
    palette: {
      deep: C(0.10, 0.08, 0.07), shallow: C(0.30, 0.22, 0.16),
      beach: C(0.62, 0.34, 0.20), desert: C(0.480, 0.400, 0.300),
      savanna: C(0.680, 0.610, 0.480), forest: C(0.40, 0.34, 0.26),
      tundra: C(0.50, 0.44, 0.36), rock: C(0.30, 0.26, 0.20),
      snow: C(0.640, 0.660, 0.700),
    },
    tint: C(0.75, 0.80, 0.95), cloudTint: C(1, 1, 1),
    cloudCover: 0.0, relief: 0.0, oceanRough: 0.9, landRough: 0.9,
    atmDensity: 2.2,
  },
};

/* ------------------------------------------------------------------ */

export class Planet {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.opts = opts;

    this.seed = opts.seed ?? 1337;
    this.radius = opts.radius ?? 6.371e6;
    this.type = TYPES[opts.type] ? opts.type : 'terran';

    const T = TYPES[this.type];
    this.preset = T;

    this.hasOcean = opts.hasOcean ?? T.hasOcean;
    this.hasClouds = opts.hasClouds ?? T.hasClouds;
    this.hasCityLights = opts.hasCityLights ?? T.hasCityLights;
    this.isGas = this.type === 'gasgiant';

    this.relief = opts.relief ?? T.relief;
    this.params = makeFieldParams(this.seed, this.type, T.field);

    // Shell radii, in planet radii. Wide enough apart that a 24-bit depth
    // buffer at 1e7 world units cannot confuse them.
    this.cloudR = opts.cloudShell ?? 1.010;
    this.atmR = opts.atmosphereShell ?? 1.025;

    /* ---- atmosphere physics -------------------------------------- *
     * Coefficients are the standard sea-level values in 1/m; multiplying
     * by the radius converts them into the "per planet radius" units the
     * shader marches in, which keeps the whole integral in a sane range.  */
    const A = Object.assign({
      rayleigh: [5.8e-6, 13.5e-6, 33.1e-6],
      mie: 21e-6,
      g: 0.76,
      scaleHeightR: 8000.0,
      scaleHeightM: 1200.0,
      density: T.atmDensity,
      tint: T.tint,
    }, opts.atmosphere || {});
    this.atm = A;
    this.hasAtmosphere = (opts.atmosphere === false) ? false : (A.density > 0.001);

    this.sunColor = new THREE.Color(1.0, 0.97, 0.92);
    this.sunIntensity = opts.sunIntensity ?? 5.0;

    this.group = new THREE.Object3D();
    this.group.name = `planet:${this.type}:${this.seed}`;

    this._geoCache = new Map();
    this._lod = -1;
    this._frame = 0;
    this._time = 0;

    this._build();
    this.setLod(opts.lod ?? 3);
  }

  /* ------------------------------------------------------------------ */

  _build() {
    const P = this.params, T = this.preset, A = this.atm;
    const R = this.radius;

    const betaR = new THREE.Vector3(
      A.rayleigh[0] * R, A.rayleigh[1] * R, A.rayleigh[2] * R);
    const betaM = A.mie * R;
    const hr = A.scaleHeightR / R;
    const hm = A.scaleHeightM / R;
    this._betaR = betaR; this._hr = hr;

    const pal = T.palette;
    const cU = (c) => ({ value: c.clone() });

    /* ---------------- surface ---------------- */
    this.surfaceUniforms = {
      uRadius: { value: R },
      uRelief: { value: this.relief },
      uNormalBoost: { value: this.isGas ? 0 : 4.0 },
      uFdEps: { value: 0.02 },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uSunColor: { value: this.sunColor.clone() },
      uSunI: { value: this.sunIntensity },
      uCamPos: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uCloudShellR: { value: this.cloudR },
      uCloudShadow: { value: this.hasClouds ? 0.55 : 0.0 },
      uDetailAmt: { value: 0.0 },
      uDetailFreq: { value: 210.0 },
      uNightLights: { value: this.hasCityLights ? 1.0 : 0.0 },
      uNightColor: { value: new THREE.Color(1.0, 0.66, 0.33) },
      uAtmDensity: { value: this.hasAtmosphere ? A.density : 0.0 },
      uBetaR: { value: betaR.clone() },
      uHr: { value: hr },
      uAmbient: { value: A.tint.clone().multiplyScalar(this.hasAtmosphere ? 0.05 * A.density : 0.008) },
      uColDeep: cU(pal.deep), uColShallow: cU(pal.shallow), uColBeach: cU(pal.beach),
      uColDesert: cU(pal.desert), uColSavanna: cU(pal.savanna), uColForest: cU(pal.forest),
      uColTundra: cU(pal.tundra), uColRock: cU(pal.rock), uColSnow: cU(pal.snow),
      uOceanRough: { value: T.oceanRough }, uLandRough: { value: T.landRough },
      // cloud-field uniforms (shared names with the cloud material)
      uCloudFreq: { value: 4.6 },
      uCloudCover: { value: this.opts.cloudCover ?? T.cloudCover },
      uCloudTime: { value: 0 },
    };

    const defs = {};
    if (this.hasOcean) defs.HAS_OCEAN = '';
    if (this.hasCityLights) defs.HAS_CITY = '';
    if (this.isGas) defs.GASGIANT = '';

    this.surfaceMaterial = new THREE.ShaderMaterial({
      uniforms: this.surfaceUniforms,
      defines: defs,
      vertexShader: surfaceVert(P),
      fragmentShader: surfaceFrag(P),
      side: THREE.FrontSide,
      fog: false,
    });

    this.surface = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 8), this.surfaceMaterial);
    this.surface.frustumCulled = false;   // geometry is unit-scale, sized in the shader
    this.surface.renderOrder = 0;
    this.surface.layers.set(LAYER.FAR);
    this.group.add(this.surface);

    /* ---------------- clouds ---------------- */
    if (this.hasClouds) {
      this.cloudUniforms = {
        uScale: { value: R * this.cloudR },
        uSunDir: this.surfaceUniforms.uSunDir,
        uSunColor: this.surfaceUniforms.uSunColor,
        uSunI: this.surfaceUniforms.uSunI,
        uCamPos: this.surfaceUniforms.uCamPos,
        uOpacity: { value: this.opts.cloudOpacity ?? T.cloudOpacity ?? 0.95 },
        uTint: { value: T.cloudTint.clone() },
        uFrame: { value: 0 },
        uCloudFreq: this.surfaceUniforms.uCloudFreq,
        uCloudCover: this.surfaceUniforms.uCloudCover,
        uCloudTime: this.surfaceUniforms.uCloudTime,
      };
      this.cloudMaterial = new THREE.ShaderMaterial({
        uniforms: this.cloudUniforms,
        defines: { CLOUD_OCT: 5 },
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        side: THREE.FrontSide,
        transparent: true,
        depthWrite: false,
        // The shell sits only 0.01 R above the surface: at 1e7 world units a
        // 24-bit depth buffer cannot resolve that reliably, so ordering is
        // done with renderOrder and the back face is culled instead.
        depthTest: false,
        blending: THREE.NormalBlending,
        fog: false,
      });
      this.clouds = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 24), this.cloudMaterial);
      this.clouds.frustumCulled = false;
      this.clouds.renderOrder = 1;
      this.clouds.layers.set(LAYER.FAR);
      this.group.add(this.clouds);
    }

    /* ---------------- atmosphere ---------------- */
    if (this.hasAtmosphere) {
      this.atmoUniforms = {
        uScale: { value: R * this.atmR },
        uCamPos: this.surfaceUniforms.uCamPos,
        uCenter: { value: new THREE.Vector3() },
        uSunDir: this.surfaceUniforms.uSunDir,
        uSunColor: this.surfaceUniforms.uSunColor,
        uSunI: this.surfaceUniforms.uSunI,
        uRadius: { value: R },
        uAtmR: { value: this.atmR },
        uHr: { value: hr },
        uHm: { value: hm },
        uBetaR: { value: betaR.clone() },
        uBetaM: { value: betaM },
        uG: { value: A.g },
        uFrame: { value: 0 },
        uDensity: { value: A.density },
      };
      this.atmoMaterial = new THREE.ShaderMaterial({
        uniforms: this.atmoUniforms,
        defines: { VIEW_STEPS: 14, LIGHT_STEPS: 4 },
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      this.atmosphere = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 16), this.atmoMaterial);
      this.atmosphere.frustumCulled = false;
      this.atmosphere.renderOrder = 2;
      this.atmosphere.layers.set(LAYER.FAR);
      this.group.add(this.atmosphere);
    }

    this._applyQuality();
  }

  _applyQuality() {
    const s = this.engine.settings;
    if (this.atmoMaterial) {
      const view = s.cloudSteps >= 48 ? 16 : s.cloudSteps >= 24 ? 14 : 10;
      const light = s.volumetrics ? 4 : 3;
      if (this.atmoMaterial.defines.VIEW_STEPS !== view ||
          this.atmoMaterial.defines.LIGHT_STEPS !== light) {
        this.atmoMaterial.defines.VIEW_STEPS = view;
        this.atmoMaterial.defines.LIGHT_STEPS = light;
        this.atmoMaterial.needsUpdate = true;
      }
    }
    if (this.cloudMaterial) {
      const oct = s.cloudSteps >= 48 ? 6 : s.cloudSteps >= 24 ? 5 : 4;
      if (this.cloudMaterial.defines.CLOUD_OCT !== oct) {
        this.cloudMaterial.defines.CLOUD_OCT = oct;
        this.cloudMaterial.needsUpdate = true;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * LOD
   * ------------------------------------------------------------------ */

  _geometry(detail) {
    let geo = this._geoCache.get(detail);
    if (!geo) {
      geo = new THREE.IcosahedronGeometry(1, detail);
      this._geoCache.set(detail, geo);
    }
    return geo;
  }

  /** level: 0 (coarsest) .. 5 (finest). Scaled by engine.settings.terrainLod. */
  setLod(level) {
    level = THREE.MathUtils.clamp(level | 0, 0, 5);
    if (level === this._lod) return;
    this._lod = level;
    const lodTable = [6, 10, 14, 20, 28, 40];
    const q = this.engine.settings.terrainLod || 1;
    const detail = Math.max(4, Math.min(64, Math.round(lodTable[level] * q)));
    if (detail === this._detail) return;
    this._detail = detail;
    this.surface.geometry = this._geometry(detail);
    // Finite-difference step tracks the tessellation: smaller and the normal
    // picks up detail the mesh cannot show (aliasing), larger and mountains
    // wash out.
    this.surfaceUniforms.uFdEps.value = 1.1 / detail;
  }

  /* ------------------------------------------------------------------ */

  update(dt, camera, sunDirWorld, sunColor) {
    this._frame++;
    this._time += dt;

    const u = this.surfaceUniforms;
    if (sunDirWorld) u.uSunDir.value.copy(sunDirWorld).normalize();
    if (sunColor) u.uSunColor.value.copy(sunColor);
    u.uSunI.value = this.sunIntensity;
    u.uTime.value = this._time;
    u.uCloudTime.value = this._time;

    if (camera) {
      u.uCamPos.value.copy(camera.position);

      const center = this.group.getWorldPosition(_tmpV);
      const dist = camera.position.distanceTo(center);
      const rel = dist / this.radius;

      // LOD from apparent size, biased by the quality preset.
      const lvl = rel > 9 ? 1 : rel > 4.5 ? 2 : rel > 2.2 ? 3 : rel > 1.35 ? 4 : 5;
      this.setLod(lvl);

      // Per-fragment detail is only worth its cost when a surface texel is
      // large on screen; below that it is pure noise and TAA fights it.
      const detailAmt = THREE.MathUtils.clamp((3.0 - rel) * 0.5, 0.0, 1.0);
      u.uDetailAmt.value = this.isGas ? 0.0 : detailAmt * 0.55;
      u.uDetailFreq.value = 190.0 + 260.0 * detailAmt;

      if (this.atmoUniforms) this.atmoUniforms.uCenter.value.copy(center);
    }

    if (this.cloudUniforms) this.cloudUniforms.uFrame.value = this._frame;
    if (this.atmoUniforms) this.atmoUniforms.uFrame.value = this._frame;

    this._applyQuality();
  }

  /* ------------------------------------------------------------------ *
   * CPU height field
   * ------------------------------------------------------------------ */

  /**
   * Elevation above sea level, in world units, for a direction from the
   * planet centre. Identical maths to the vertex shader's terrainField()
   * (verify with probeHeightGPU). Negative under the ocean.
   */
  sampleHeight(dir) {
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const e = terrainFieldJS(this.params, dir.x / l, dir.y / l, dir.z / l);
    return e * this.relief * this.radius;
  }

  /** Raw field value (sea level = 0), before the relief/radius scaling. */
  sampleField(dir) {
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
    return terrainFieldJS(this.params, dir.x / l, dir.y / l, dir.z / l);
  }

  /** Distance from the planet centre to the rendered surface, world units. */
  sampleRadius(dir) {
    const e = this.sampleField(dir);
    const d = this.hasOcean ? Math.max(e, 0) : e;
    return this.radius * (1.0 + d * this.relief);
  }

  /**
   * Evaluates the *shader's* terrainField for a list of directions by
   * rendering one pixel per direction into a float target. This is the only
   * honest way to prove sampleHeight and the GPU agree — everything else is
   * reading two pieces of source and hoping.
   */
  probeHeightGPU(renderer, dirs) {
    const n = dirs.length;
    const pos = new Float32Array(n * 3);
    const idx = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = dirs[i];
      const l = Math.hypot(d.x, d.y, d.z) || 1;
      pos[i * 3] = d.x / l; pos[i * 3 + 1] = d.y / l; pos[i * 3 + 2] = d.z / l;
      idx[i] = i;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aIndex', new THREE.BufferAttribute(idx, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uCount: { value: n } },
      vertexShader: probeVert(this.params),
      fragmentShader: PROBE_FRAG,
      depthTest: false, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;

    const scene = new THREE.Scene();
    scene.add(pts);
    const cam = new THREE.Camera();

    const rt = new THREE.WebGLRenderTarget(n, 1, {
      type: THREE.FloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false,
    });
    rt.texture.colorSpace = THREE.NoColorSpace;

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, cam);

    const buf = new Float32Array(n * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, n, 1, buf);
    renderer.setRenderTarget(prevTarget);

    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = buf[i * 4];

    geo.dispose(); mat.dispose(); rt.dispose();
    return out;
  }

  /* ------------------------------------------------------------------ */

  setSunIntensity(v) { this.sunIntensity = v; }

  dispose() {
    for (const geo of this._geoCache.values()) geo.dispose();
    this._geoCache.clear();
    this.surfaceMaterial?.dispose();
    this.cloudMaterial?.dispose();
    this.atmoMaterial?.dispose();
    if (this.clouds) this.clouds.geometry.dispose();
    if (this.atmosphere) this.atmosphere.geometry.dispose();
    this.group.parent?.remove(this.group);
  }
}

const _tmpV = new THREE.Vector3();

export default Planet;
