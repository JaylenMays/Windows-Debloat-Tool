import * as THREE from '../../vendor/three.module.js';
import { LAYER } from '../core/engine.js';
import { HASH, NOISE } from '../render/glsl.js';

/* ===================================================================== *
 * Walkable terrain.
 *
 * The height field is generated once on the CPU into a float array and
 * uploaded as a texture. The vertex shader samples that same array, so the
 * ground the player collides with is exactly the ground they see — deriving
 * collision from a separately-implemented copy of the GPU noise is the
 * classic way to end up sinking through hills.
 *
 * Geometry is a clipmap: concentric grids of doubling cell size recentred on
 * the player, so triangle density follows the camera and the horizon stays
 * cheap. Fine detail below the heightmap's resolution comes from normal
 * mapping and triplanar detail, not from more triangles.
 * ===================================================================== */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- CPU noise (matches the look of the GLSL chunks) ------------------ */
class ValueNoise2D {
  constructor(seed) {
    const rnd = mulberry32(seed);
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.grad = new Float32Array(512);
    for (let i = 0; i < 512; i++) this.grad[i] = rnd() * 2 - 1;
  }
  _h(x, y) { return this.grad[(this.perm[(x & 255)] + (y & 255)) & 511]; }
  eval(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = this._h(xi, yi), b = this._h(xi + 1, yi);
    const c = this._h(xi, yi + 1), d = this._h(xi + 1, yi + 1);
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
  }
  fbm(x, y, oct = 6, lac = 2.03, gain = 0.5) {
    let s = 0, amp = 0.5, n = 0, fx = x, fy = y;
    for (let i = 0; i < oct; i++) {
      s += amp * this.eval(fx, fy); n += amp;
      fx *= lac; fy *= lac; amp *= gain;
    }
    return s / n;
  }
  ridged(x, y, oct = 6, lac = 2.07, gain = 0.5) {
    let s = 0, amp = 0.5, n = 0, prev = 1, fx = x, fy = y;
    for (let i = 0; i < oct; i++) {
      let r = 1 - Math.abs(this.eval(fx, fy));
      r *= r; r *= prev; prev = r;
      s += amp * r; n += amp;
      fx *= lac; fy *= lac; amp *= gain;
    }
    return s / n;
  }
}

export const BIOME_PRESETS = {
  rocky: {
    name: 'Rocky', relief: 260, roughness: 1.0, ridgeMix: 0.72,
    low: [0.20, 0.17, 0.15], mid: [0.40, 0.31, 0.22], high: [0.58, 0.55, 0.50],
    slopeColor: [0.16, 0.14, 0.13], fogColor: [0.52, 0.56, 0.63], fogDensity: 0.00034,
    sky: { starDensity: 0.4, nebulaStrength: 0.18 },
    sunColor: [1.0, 0.94, 0.84], ambient: [0.28, 0.33, 0.42], surface: 'rock',
  },
  dunes: {
    name: 'Dunes', relief: 120, roughness: 0.55, ridgeMix: 0.18,
    low: [0.62, 0.48, 0.31], mid: [0.72, 0.58, 0.38], high: [0.80, 0.69, 0.50],
    slopeColor: [0.48, 0.36, 0.24], fogColor: [0.78, 0.64, 0.46], fogDensity: 0.00075,
    sky: { starDensity: 0.3, nebulaStrength: 0.12 },
    sunColor: [1.0, 0.86, 0.66], ambient: [0.42, 0.34, 0.26], surface: 'sand',
  },
  glacier: {
    name: 'Glacier', relief: 320, roughness: 0.9, ridgeMix: 0.80,
    low: [0.58, 0.66, 0.74], mid: [0.74, 0.81, 0.88], high: [0.90, 0.94, 0.98],
    slopeColor: [0.40, 0.48, 0.58], fogColor: [0.66, 0.76, 0.88], fogDensity: 0.00090,
    sky: { starDensity: 0.5, nebulaStrength: 0.30 },
    sunColor: [0.86, 0.92, 1.0], ambient: [0.34, 0.42, 0.55], surface: 'ice',
  },
  ashen: {
    name: 'Ashen', relief: 300, roughness: 1.1, ridgeMix: 0.85,
    low: [0.13, 0.11, 0.11], mid: [0.22, 0.19, 0.18], high: [0.31, 0.28, 0.27],
    slopeColor: [0.16, 0.13, 0.12], fogColor: [0.35, 0.22, 0.18], fogDensity: 0.00110,
    sky: { starDensity: 0.35, nebulaStrength: 0.42 },
    sunColor: [1.0, 0.55, 0.32], ambient: [0.30, 0.16, 0.12], surface: 'basalt',
  },
  verdant: {
    name: 'Verdant', relief: 190, roughness: 0.8, ridgeMix: 0.45,
    low: [0.12, 0.19, 0.09], mid: [0.24, 0.33, 0.14], high: [0.46, 0.45, 0.36],
    slopeColor: [0.28, 0.24, 0.18], fogColor: [0.56, 0.66, 0.60], fogDensity: 0.00080,
    sky: { starDensity: 0.45, nebulaStrength: 0.22 },
    sunColor: [1.0, 0.96, 0.88], ambient: [0.26, 0.34, 0.30], surface: 'regolith',
  },
};

const TERRAIN_VERT = /* glsl */ `
uniform sampler2D uHeight;
uniform vec2 uOrigin;        // world XZ of the heightmap corner
uniform float uExtent;       // world size covered by the heightmap
uniform float uRelief;
uniform vec3 uCamXZ;

varying vec3 vWorld;
varying vec2 vHUv;
varying float vHeight;
varying float vSlope;

float sampleH(vec2 worldXZ){
  vec2 uv = (worldXZ - uOrigin) / uExtent;
  return texture2D(uHeight, clamp(uv, 0.002, 0.998)).r;
}

void main(){
  // Grid vertices are placed in world space relative to the camera so the
  // clipmap can be recentred without rebuilding geometry.
  vec3 wp = position;
  wp.x += uCamXZ.x;
  wp.z += uCamXZ.z;

  float h = sampleH(wp.xz);
  wp.y = h * uRelief;

  // Central differences for the normal, at the heightmap's own texel size.
  float e = uExtent / 1024.0;
  float hx = sampleH(wp.xz + vec2(e, 0.0)) * uRelief;
  float hz = sampleH(wp.xz + vec2(0.0, e)) * uRelief;
  vec3 n = normalize(vec3(h * uRelief - hx, e, h * uRelief - hz));

  vWorld = wp;
  vHeight = h;
  vSlope = 1.0 - clamp(n.y, 0.0, 1.0);
  vHUv = (wp.xz - uOrigin) / uExtent;

  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;

  vNormalOut = n;
}
`;

const TERRAIN_FRAG = /* glsl */ `
${HASH}

uniform vec3 uLow, uMid, uHigh, uSlopeColor;
uniform vec3 uSunDir, uSunColor, uAmbient;
uniform float uRelief, uTime, uRough;
uniform sampler2D uHeight;
uniform vec2 uOrigin;
uniform float uExtent;
uniform sampler2D uDetail;
uniform float uHasDetail;

varying vec3 vWorld;
varying vec2 vHUv;
varying float vHeight;
varying float vSlope;

float vn(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), f.x),
             mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), f.x), f.y);
}
float fbm2(vec2 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for(int i = 0; i < 7; i++){
    if(i >= oct) break;
    s += a * vn(p); n += a; p *= 2.07; a *= 0.5;
  }
  return s / n;
}

float sampleHF(vec2 worldXZ){
  vec2 uv = (worldXZ - uOrigin) / uExtent;
  return texture2D(uHeight, clamp(uv, 0.002, 0.998)).r * uRelief;
}

// Terrain shadows by marching the height field toward the sun.
//
// The terrain is a custom shader and so sits outside three's shadow map. But
// a height field can shadow itself analytically for a fraction of the cost:
// step along the sun direction and check whether the ground ever rises above
// the ray. This is what gives mountains long raking shadows at low sun, which
// is most of the difference between "flat grey" and "a landscape".
float terrainShadow(vec3 p, vec3 sunDir){
  if(sunDir.y <= 0.01) return 0.0;
  float shadow = 1.0;
  float t = 4.0;
  // Softening grows with distance, approximating a penumbra.
  for(int i = 0; i < 24; i++){
    vec3 sp = p + sunDir * t;
    float h = sampleHF(sp.xz);
    float diff = sp.y - h;
    if(diff < 0.0) return 0.0;
    shadow = min(shadow, 7.0 * diff / t);
    t *= 1.32;
    if(t > 2600.0) break;
  }
  return clamp(shadow, 0.0, 1.0);
}

// Cheap sky occlusion: sample the horizon in a few directions and darken
// where the surrounding terrain rises. Valleys read as valleys.
float skyOcclusion(vec3 p){
  float occ = 0.0;
  const int N = 6;
  for(int i = 0; i < N; i++){
    float a = float(i) / float(N) * 6.2831853;
    vec2 d = vec2(cos(a), sin(a));
    float maxSlope = 0.0;
    for(int j = 1; j <= 3; j++){
      float r = float(j) * 26.0;
      float h = sampleHF(p.xz + d * r);
      maxSlope = max(maxSlope, (h - p.y) / r);
    }
    occ += clamp(maxSlope, 0.0, 1.0);
  }
  return clamp(1.0 - occ / float(N) * 1.1, 0.0, 1.0);
}

void main(){
  vec3 n = normalize(vNormalOut);

  // Height/slope driven blend. Real ground is never one flat colour — the
  // large-scale mix is broken up by a decorrelated mottling field so it does
  // not read as a gradient ramp.
  float h = vHeight;
  float mottle = fbm2(vWorld.xz * 0.02, 5);
  float hb = clamp(h * 1.15 + (mottle - 0.5) * 0.22, 0.0, 1.0);

  vec3 base = mix(uLow, uMid, smoothstep(0.18, 0.52, hb));
  base = mix(base, uHigh, smoothstep(0.58, 0.88, hb));
  // Steep faces expose bare rock regardless of altitude.
  base = mix(base, uSlopeColor, smoothstep(0.35, 0.72, vSlope));

  // Multi-scale detail so the ground holds up close AND far.
  float d1 = fbm2(vWorld.xz * 0.9, 4);
  float d2 = fbm2(vWorld.xz * 6.5, 3);
  base *= 0.86 + 0.28 * d1;
  base *= 0.93 + 0.14 * d2;

  // Perturb the normal with the detail field for surface tooth.
  float eps = 0.35;
  float ddx = fbm2((vWorld.xz + vec2(eps, 0.0)) * 6.5, 3) - d2;
  float ddz = fbm2((vWorld.xz + vec2(0.0, eps)) * 6.5, 3) - d2;
  n = normalize(n + vec3(-ddx, 0.0, -ddz) * 2.4);

  // Direct sun + a hemispheric ambient. Wrapped diffuse keeps the terminator
  // from going pure black, which is what real bounced light does.
  float ndl = dot(n, uSunDir);
  float wrap = clamp((ndl + 0.22) / 1.22, 0.0, 1.0);
  float shadow = terrainShadow(vWorld, uSunDir);
  vec3 diffuse = uSunColor * wrap * mix(0.12, 1.0, shadow) * 0.85;

  float sky = skyOcclusion(vWorld);
  vec3 ambient = uAmbient * (0.45 + 0.55 * n.y) * mix(0.45, 1.0, sky) * 0.75;

  // Warm bounce off lit ground into shadowed faces — without it shadows read
  // as flat blue holes.
  vec3 bounce = uSunColor * uLow * 0.22 * (1.0 - n.y * 0.4) * sky * mix(0.5, 1.0, shadow);

  // Rough surfaces still have a broad specular lobe; without it terrain reads
  // as flat paper under a low sun.
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 H = normalize(V + uSunDir);
  float spec = pow(max(dot(n, H), 0.0), mix(48.0, 8.0, uRough)) * 0.09 * (1.0 - uRough * 0.55);

  vec3 col = base * (diffuse + ambient + bounce) + uSunColor * spec * shadow;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class Terrain {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.seed = opts.seed ?? 1337;
    this.biome = BIOME_PRESETS[opts.biome] || BIOME_PRESETS.rocky;
    this.extent = opts.extent ?? 6000;      // world metres covered by the map
    this.res = opts.res ?? 1024;
    this.origin = new THREE.Vector2(-this.extent / 2, -this.extent / 2);
    this.group = new THREE.Group();

    this._generateHeightmap();
    this._buildClipmap();
  }

  _generateHeightmap() {
    const N = this.res, noise = new ValueNoise2D(this.seed);
    const b = this.biome;
    const data = new Float32Array(N * N);
    const inv = 1 / N;
    let min = Infinity, max = -Infinity;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = x * inv, v = y * inv;
        // Continental scale, then ridged mountain chains, then fine relief.
        const cont = noise.fbm(u * 2.2, v * 2.2, 5, 2.0, 0.5) * 0.5 + 0.5;
        const ridge = noise.ridged(u * 5.5 + 11.3, v * 5.5 + 7.1, 6, 2.07, 0.5);
        const fine = noise.fbm(u * 24.0, v * 24.0, 5, 2.11, 0.48) * 0.5 + 0.5;

        let h = cont * (1 - b.ridgeMix) + ridge * b.ridgeMix;
        h = h * 0.82 + fine * 0.18 * b.roughness;
        // Erosion-ish: flatten valleys, keep peaks sharp.
        h = Math.pow(Math.max(h, 0), 1.35);
        data[y * N + x] = h;
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    // Normalise so `relief` means the same thing across seeds and biomes.
    const range = Math.max(max - min, 1e-5);
    for (let i = 0; i < data.length; i++) data[i] = (data[i] - min) / range;

    this.heightData = data;
    this.texture = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.FloatType);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;
  }

  // Bilinear sample of the SAME array the shader reads.
  heightAt(worldX, worldZ) {
    const N = this.res;
    const u = ((worldX - this.origin.x) / this.extent) * (N - 1);
    const v = ((worldZ - this.origin.y) / this.extent) * (N - 1);
    const x0 = Math.floor(THREE.MathUtils.clamp(u, 0, N - 2));
    const y0 = Math.floor(THREE.MathUtils.clamp(v, 0, N - 2));
    const fx = THREE.MathUtils.clamp(u - x0, 0, 1);
    const fy = THREE.MathUtils.clamp(v - y0, 0, 1);
    const d = this.heightData;
    const h00 = d[y0 * N + x0], h10 = d[y0 * N + x0 + 1];
    const h01 = d[(y0 + 1) * N + x0], h11 = d[(y0 + 1) * N + x0 + 1];
    const a = h00 + (h10 - h00) * fx;
    const c = h01 + (h11 - h01) * fx;
    return (a + (c - a) * fy) * this.biome.relief;
  }

  normalAt(worldX, worldZ, eps = 2.0) {
    const hL = this.heightAt(worldX - eps, worldZ), hR = this.heightAt(worldX + eps, worldZ);
    const hD = this.heightAt(worldX, worldZ - eps), hU = this.heightAt(worldX, worldZ + eps);
    return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
  }

  _buildClipmap() {
    const b = this.biome;
    this.uniforms = {
      uHeight: { value: this.texture },
      uOrigin: { value: this.origin.clone() },
      uExtent: { value: this.extent },
      uRelief: { value: b.relief },
      uCamXZ: { value: new THREE.Vector3() },
      uLow: { value: new THREE.Color(...b.low) },
      uMid: { value: new THREE.Color(...b.mid) },
      uHigh: { value: new THREE.Color(...b.high) },
      uSlopeColor: { value: new THREE.Color(...b.slopeColor) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(...b.sunColor) },
      uAmbient: { value: new THREE.Color(...b.ambient) },
      uRough: { value: 0.85 },
      uTime: { value: 0 },
      uDetail: { value: null },
      uHasDetail: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec3 vNormalOut;\n' + TERRAIN_VERT,
      fragmentShader: 'varying vec3 vNormalOut;\n' + TERRAIN_FRAG,
      side: THREE.FrontSide,
    });

    // Clipmap rings: each level covers 4x the area of the previous at the same
    // vertex count, so triangle density falls off with distance automatically.
    const LEVELS = 6, GRID = 96;
    this.meshes = [];
    for (let level = 0; level < LEVELS; level++) {
      const cell = 1.6 * Math.pow(2, level);
      const size = GRID * cell;
      const geo = new THREE.PlaneGeometry(size, size, GRID, GRID);
      geo.rotateX(-Math.PI / 2);

      if (level > 0) {
        // Punch out the middle, which the finer level already covers. Without
        // this the levels overlap and z-fight along the whole shared area.
        const inner = size / 2 / 2;
        const pos = geo.attributes.position;
        const idx = geo.index.array;
        const keep = [];
        for (let i = 0; i < idx.length; i += 3) {
          let outside = false;
          for (let k = 0; k < 3; k++) {
            const vi = idx[i + k];
            const x = Math.abs(pos.getX(vi)), z = Math.abs(pos.getZ(vi));
            if (x > inner + 1e-3 || z > inner + 1e-3) { outside = true; break; }
          }
          if (outside) keep.push(idx[i], idx[i + 1], idx[i + 2]);
        }
        geo.setIndex(keep);
      }
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.frustumCulled = false;
      mesh.layers.set(LAYER.MID);
      mesh.receiveShadow = false;
      mesh.renderOrder = 10 - level;
      this.group.add(mesh);
      this.meshes.push({ mesh, cell });
    }
  }

  update(dt, camera, sunDir) {
    this.uniforms.uTime.value += dt;
    if (sunDir) this.uniforms.uSunDir.value.copy(sunDir);
    // Snap the clipmap to the coarsest cell size so vertices don't swim as the
    // player walks — recentring on a continuous position makes the whole
    // surface shimmer.
    const snap = 1.6 * Math.pow(2, 5) * 2;
    this.uniforms.uCamXZ.value.set(
      Math.round(camera.position.x / snap) * snap, 0,
      Math.round(camera.position.z / snap) * snap);
  }

  setSun(dir, color) {
    this.uniforms.uSunDir.value.copy(dir);
    if (color) this.uniforms.uSunColor.value.copy(color);
  }

  dispose() {
    for (const { mesh } of this.meshes) mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
