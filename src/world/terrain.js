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

/* ---------------------------------------------------------------------- *
 * Terrain shading is injected into a MeshStandardMaterial rather than being
 * a standalone ShaderMaterial.
 *
 * A raw ShaderMaterial sits outside three's lighting system entirely, which
 * means the ground cannot RECEIVE shadows — so the character, the rocks and
 * the anchors all appeared to float on an unshadowed surface. Going through
 * MeshStandardMaterial buys shadow receiving, image-based lighting and the
 * screen-space AO injection for free; the height-field displacement and biome
 * shading are patched in via onBeforeCompile.
 * ---------------------------------------------------------------------- */

const TERRAIN_COMMON = /* glsl */ `
uniform sampler2D uHeight;
uniform vec2 uOrigin;
uniform float uExtent;
uniform float uRelief;
uniform vec3 uCamXZ;

float sampleTH(vec2 worldXZ){
  vec2 uv = (worldXZ - uOrigin) / uExtent;
  return texture2D(uHeight, clamp(uv, 0.002, 0.998)).r;
}
`;

const TERRAIN_FRAG_HELPERS = /* glsl */ `
float tvn(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), f.x),
             mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), f.x), f.y);
}
float tfbm(vec2 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for(int i = 0; i < 8; i++){
    if(i >= oct) break;
    s += a * tvn(p); n += a; p *= 2.07; a *= 0.5;
  }
  return s / n;
}
float sampleHF(vec2 worldXZ){ return sampleTH(worldXZ) * uRelief; }

// Terrain self-shadowing by marching the height field toward the sun.
// The shadow map handles objects; this handles mountain-scale terrain-on-
// terrain occlusion, which a fitted shadow map cannot cover at this range.
float terrainShadow(vec3 p, vec3 sunDir){
  if(sunDir.y <= 0.02) return 0.0;

  // Start the ray slightly above the surface. The height field is sampled on a
  // ~6 m texel, so a ray launched exactly on the surface immediately reads a
  // neighbouring texel as "above" it and self-shadows. Without this bias a low
  // sun makes essentially the whole landscape return 0 and the ground renders
  // black — which looks exactly like the sky showing through the terrain.
  float texel = uExtent / 1024.0;
  vec3 o = p + vec3(0.0, texel * 0.9, 0.0);

  float shadow = 1.0;
  float t = texel * 1.5;
  for(int i = 0; i < 24; i++){
    vec3 sp = o + sunDir * t;
    float h = sampleHF(sp.xz);
    float diff = sp.y - h;
    // Soft minimum rather than an early hard return, so the terminator has a
    // penumbra instead of a binary edge.
    shadow = min(shadow, 6.0 * diff / t);
    if(shadow < 0.0) return 0.0;
    t *= 1.38;
    if(t > 3000.0) break;
  }
  return clamp(shadow, 0.0, 1.0);
}

// Cheap sky occlusion so hollows read as hollows.
float skyOcclusion(vec3 p){
  float occ = 0.0;
  const int N = 6;
  for(int i = 0; i < N; i++){
    float a = float(i) / float(N) * 6.2831853;
    vec2 d = vec2(cos(a), sin(a));
    float maxSlope = 0.0;
    for(int j = 1; j <= 3; j++){
      float r = float(j) * 26.0;
      maxSlope = max(maxSlope, (sampleHF(p.xz + d * r) - p.y) / r);
    }
    occ += clamp(maxSlope, 0.0, 1.0);
  }
  return clamp(1.0 - occ / float(N) * 1.1, 0.0, 1.0);
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

    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.95, metalness: 0.0,
    });
    this.material.userData.terrain = this;
    // Screen-space AO injection (multiplies the indirect term only).
    this.engine.post.patchMaterial(this.material);

    const U = this.uniforms;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);

      shader.vertexShader = shader.vertexShader
        .replace('void main() {',
          'attribute vec2 aTerrain;\nvarying vec3 vTWorld;\nvarying float vTHeight;\nvarying float vTSlope;\nvoid main() {')
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          // Positions and normals are already baked into the attributes, so
          // every material — including the MeshNormalMaterial used by the
          // depth prepass — sees the true displaced surface. Displacing in
          // this shader instead left the prepass believing the terrain was a
          // flat plane at y=0, which fed AO, DOF and the volumetrics garbage
          // depth and crushed the foreground to black.
          vTWorld = transformed;
          vTHeight = aTerrain.x;
          vTSlope = aTerrain.y;
        `);

      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {',
          HASH + '\n' + TERRAIN_COMMON + TERRAIN_FRAG_HELPERS +
          '\nvarying vec3 vTWorld;\nvarying float vTHeight;\nvarying float vTSlope;\n' +
          'uniform vec3 uLow, uMid, uHigh, uSlopeColor, uSunDir;\nvoid main() {')
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          {
            // Height/slope blend, broken up by a decorrelated mottling field so
            // it does not read as a gradient ramp.
            float mottle = tfbm(vTWorld.xz * 0.02, 5);
            float hb = clamp(vTHeight * 1.15 + (mottle - 0.5) * 0.22, 0.0, 1.0);
            vec3 base = mix(uLow, uMid, smoothstep(0.18, 0.52, hb));
            base = mix(base, uHigh, smoothstep(0.58, 0.88, hb));
            base = mix(base, uSlopeColor, smoothstep(0.35, 0.72, vTSlope));

            // Multi-scale detail at decade-separated frequencies so the ground
            // holds up both underfoot and at the horizon.
            float d0 = tfbm(vTWorld.xz * 0.09, 4);
            float d1 = tfbm(vTWorld.xz * 0.9, 4);
            float d2 = tfbm(vTWorld.xz * 6.5, 3);
            base *= 0.80 + 0.40 * d0;
            base *= 0.88 + 0.24 * d1;
            base *= 0.94 + 0.12 * d2;

            diffuseColor.rgb *= base;
          }
        `)
        .replace('#include <roughnessmap_fragment>', `
          #include <roughnessmap_fragment>
          roughnessFactor *= 0.86 + 0.18 * tfbm(vTWorld.xz * 1.7, 3);
          roughnessFactor = clamp(roughnessFactor, 0.25, 1.0);
        `)
        .replace('#include <lights_fragment_begin>', `
          #include <lights_fragment_begin>
          {
            // Composes with the shadow map: that covers objects, this covers
            // mountain-scale terrain-on-terrain occlusion.
            float tShadow = terrainShadow(vTWorld, uSunDir);
            float tSky = skyOcclusion(vTWorld);
            reflectedLight.directDiffuse *= mix(0.10, 1.0, tShadow);
            reflectedLight.directSpecular *= mix(0.05, 1.0, tShadow);
            reflectedLight.indirectDiffuse *= mix(0.45, 1.0, tSky);
          }
        `);
    };

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
      // Keep the flat lattice so the bake can re-derive world XZ each recentre.
      const n = geo.attributes.position.count;
      geo.setAttribute('aTerrain', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      const baseXZ = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        baseXZ[i * 2] = geo.attributes.position.getX(i);
        baseXZ[i * 2 + 1] = geo.attributes.position.getZ(i);
      }
      geo.userData.baseXZ = baseXZ;
      geo.attributes.position.setUsage(THREE.DynamicDrawUsage);

      const mesh = new THREE.Mesh(geo, this.material);
      mesh.frustumCulled = false;
      mesh.layers.set(LAYER.MID);
      mesh.receiveShadow = true;
      mesh.renderOrder = 10 - level;
      this.group.add(mesh);
      this.meshes.push({ mesh, cell });
    }
    this._bakedCenter = null;
    this._bake(0, 0);
  }

  // Writes displaced world positions, normals and (height, slope) into the
  // clipmap attributes. Runs only when the clipmap recentres onto a new snap
  // cell, so the cost is amortised over many frames.
  _bake(cx, cz) {
    const relief = this.biome.relief;
    const e = this.extent / this.res;          // one heightmap texel, world units
    for (const { mesh } of this.meshes) {
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      const nrm = geo.attributes.normal;
      const ter = geo.attributes.aTerrain;
      const base = geo.userData.baseXZ;
      const n = pos.count;
      for (let i = 0; i < n; i++) {
        const wx = base[i * 2] + cx;
        const wz = base[i * 2 + 1] + cz;
        const h = this.heightAt(wx, wz);
        pos.setXYZ(i, wx, h, wz);

        // Central differences at texel scale, matching the shading normal.
        const hx = this.heightAt(wx + e, wz);
        const hz = this.heightAt(wx, wz + e);
        let nx = h - hx, ny = e, nz = h - hz;
        const inv = 1 / Math.hypot(nx, ny, nz);
        nx *= inv; ny *= inv; nz *= inv;
        nrm.setXYZ(i, nx, ny, nz);
        ter.setXY(i, h / relief, 1 - Math.min(1, Math.max(0, ny)));
      }
      pos.needsUpdate = true;
      nrm.needsUpdate = true;
      ter.needsUpdate = true;
      geo.computeBoundingSphere();
    }
    this._bakedCenter = [cx, cz];
  }

  update(dt, camera, sunDir) {
    this.uniforms.uTime.value += dt;
    if (sunDir) this.uniforms.uSunDir.value.copy(sunDir);

    // Snap to the coarsest cell so vertices don't swim as the player walks.
    const snap = 1.6 * Math.pow(2, 5) * 2;
    const cx = Math.round(camera.position.x / snap) * snap;
    const cz = Math.round(camera.position.z / snap) * snap;
    if (!this._bakedCenter || this._bakedCenter[0] !== cx || this._bakedCenter[1] !== cz) {
      this._bake(cx, cz);
    }
    this.uniforms.uCamXZ.value.set(cx, 0, cz);
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
