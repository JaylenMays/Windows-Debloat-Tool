import * as THREE from '../../vendor/three.module.js';
import { HASH, NOISE, COLOR } from './glsl.js';
import { LAYER } from '../core/engine.js';

/* ===================================================================== *
 * Deep-space sky.
 *
 * One inverted sphere on the SKY layer, rendered from the origin with no
 * depth interaction, so it sits at infinity. Everything is evaluated
 * analytically per-pixel: no cubemap, no texture, nothing to download.
 *
 * The three things that make a starfield read as a photograph rather than
 * as "white dots on black":
 *   1. A realistic magnitude distribution — thousands of faint stars for
 *      every bright one, following roughly N ∝ 10^(0.6m).
 *   2. Blackbody colour. Real stars run from ~2500 K (deep orange) to
 *      ~30000 K (blue-white); almost none are saturated primaries.
 *   3. Sub-pixel anti-aliasing plus HDR intensity, so the bright ones bloom
 *      through the post chain instead of aliasing into sparkle.
 * ===================================================================== */

const SKY_FRAG = /* glsl */ `
${HASH}
${NOISE}
${COLOR}

varying vec3 vDir;

uniform float uTime;
uniform float uStarDensity;
uniform float uStarBrightness;
uniform float uNebulaStrength;
uniform float uGalaxyStrength;
uniform float uPixelAngle;      // angular size of one pixel, radians
uniform vec3  uGalaxyAxis;      // normal of the galactic plane
uniform vec3  uNebulaTint1;
uniform vec3  uNebulaTint2;
uniform float uSeed;
uniform float uExposure;

/* --------------------------------------------------------------- *
 * Blackbody colour (Planck fit, normalised to unit luminance).
 * --------------------------------------------------------------- */
vec3 blackbody(float tempK){
  float t = clamp(tempK, 1500.0, 40000.0) / 100.0;
  float r, g, b;
  if(t <= 66.0){
    r = 255.0;
    g = 99.4708025861 * log(t) - 161.1195681661;
  } else {
    r = 329.698727446 * pow(t - 60.0, -0.1332047592);
    g = 288.1221695283 * pow(t - 60.0, -0.0755148492);
  }
  if(t >= 66.0) b = 255.0;
  else if(t <= 19.0) b = 0.0;
  else b = 138.5177312231 * log(t - 10.0) - 305.0447927307;
  vec3 c = clamp(vec3(r, g, b) / 255.0, 0.0, 1.0);
  return sRGBToLinear(c);
}

/* --------------------------------------------------------------- *
 * Star layer.
 *
 * Space is partitioned into a cubic lattice in direction space. Each cell
 * holds at most one star, jittered inside the cell. Because we only ever
 * test the cell the ray falls in plus its neighbours, cost is constant
 * regardless of how many stars the layer implies.
 * --------------------------------------------------------------- */
float starLayer(vec3 dir, float scale, float density, float seed, out vec3 tint, out float mag){
  vec3 p = dir * scale;
  vec3 cell = floor(p);
  float best = 0.0;
  tint = vec3(1.0);
  mag = 0.0;

  // A star's drawn extent must stay well inside the 3x3x3 neighbourhood we
  // search, or its profile gets truncated at the cell boundary and the star
  // renders as a hard-edged SQUARE. One cell subtends ~1/scale radians, so the
  // profile is clamped to a fraction of that. Stars are near-point sources
  // anyway: the visible glow around bright ones comes from HDR bloom in the
  // post chain, not from a wide halo baked in here.
  float cellAngle = 1.0 / scale;
  float maxExtent = cellAngle * 0.42;

  for(int i = -1; i <= 1; i++){
    for(int j = -1; j <= 1; j++){
      for(int k = -1; k <= 1; k++){
        vec3 c = cell + vec3(float(i), float(j), float(k));
        vec3 h = hash33(c + seed);
        if(h.x > density) continue;

        vec3 sp = normalize(c + 0.5 + (h - 0.5) * 0.9);
        float cosA = dot(dir, sp);
        float ang = acos(clamp(cosA, -1.0, 1.0));
        if(ang > maxExtent) continue;

        // Magnitude distribution: many faint stars, few bright ones.
        float rnd = hash13(c * 1.7 + seed);
        float brightness = mix(0.02, 1.0, pow(rnd, 4.5));

        // Core is never narrower than a pixel (otherwise it shimmers as the
        // camera turns) and never wider than the clamp above.
        float radius = min(uPixelAngle * (0.7 + brightness * 0.9), maxExtent * 0.34);
        float core = exp(-(ang * ang) / (radius * radius));
        // Exponential skirt: decays fast enough to vanish before the clamp.
        float skirt = 0.09 * exp(-ang / (radius * 1.6));
        float v = (core + skirt) * brightness;

        if(v > best){
          best = v;
          mag = brightness;
          float tr = hash13(c * 3.31 + seed + 11.0);
          float temp = mix(2900.0, 9500.0, pow(tr, 1.6));
          if(tr > 0.94) temp = mix(11000.0, 26000.0, (tr - 0.94) / 0.06);
          tint = blackbody(temp);
        }
      }
    }
  }
  return best;
}

/* --------------------------------------------------------------- *
 * Galactic plane: a dense band of unresolved stars, crossed by dark
 * dust lanes. This is what sells "we are inside a galaxy".
 * --------------------------------------------------------------- */
float galacticBand(vec3 dir, out float dust){
  float lat = dot(dir, normalize(uGalaxyAxis));       // -1..1, 0 = in-plane
  float band = exp(-lat * lat * 42.0);

  // Along-plane variation so the band isn't a uniform stripe.
  vec3 q = dir * 3.0 + uSeed;
  float clump = fbm3(q, 5, 2.1, 0.55) * 0.5 + 0.5;
  float fine  = fbm3(dir * 14.0 + uSeed * 1.7, 4, 2.3, 0.5) * 0.5 + 0.5;

  // Dust lanes: dark filaments that cut through the band. Ridged noise gives
  // the stringy, branching structure real dust has.
  float d = ridged3(dir * 6.0 + uSeed * 2.3, 5, 2.2, 0.55);
  d = smoothstep(0.35, 0.95, d);
  dust = d * band;

  return band * (0.45 + 0.55 * clump) * (0.6 + 0.4 * fine);
}

/* --------------------------------------------------------------- *
 * Nebulae. Emission (H-alpha / OIII) plus reflection dust.
 * --------------------------------------------------------------- */
vec3 nebula(vec3 dir){
  // Nebulae are LOCAL. A galaxy-wide marbled haze is the classic tell of a
  // procedural skybox — real deep space is mostly black, with a handful of
  // bright emission regions clustered near the galactic plane. So the detail
  // field is gated by a low-frequency region mask before anything else.
  float region = fbm3(dir * 0.75 + uSeed * 1.3, 4, 2.1, 0.55) * 0.5 + 0.5;
  float mask = smoothstep(0.56, 0.80, region);
  if(mask <= 0.001) return vec3(0.0);

  // Concentrate toward the galactic plane, where star formation happens.
  float lat = dot(dir, normalize(uGalaxyAxis));
  mask *= mix(0.25, 1.0, exp(-lat * lat * 5.0));

  vec3 p = dir * 1.6 + uSeed * 3.7;

  // Domain warp for filaments and cavities instead of isotropic blobs.
  vec3 warp = vec3(
    fbm3(p + 0.0, 4, 2.0, 0.5),
    fbm3(p + 5.3, 4, 2.0, 0.5),
    fbm3(p + 9.1, 4, 2.0, 0.5));
  vec3 wp = p + warp * 1.3;

  float m1 = fbm3(wp * 1.1, 6, 2.15, 0.52) * 0.5 + 0.5;
  float m2 = ridged3(wp * 1.7 + 3.0, 5, 2.3, 0.5);

  // Two emission species with different spatial distributions: H-alpha traces
  // the diffuse gas, OIII the hotter shocked shells.
  float emissionA = smoothstep(0.42, 0.85, m1) * (0.35 + 0.65 * m2);
  float emissionB = smoothstep(0.55, 0.95, m1 * 0.5 + m2 * 0.8);

  // Foreground dust that occludes rather than emits.
  float dustMask = smoothstep(0.45, 0.85, fbm3(wp * 2.6 + 12.0, 5, 2.2, 0.5) * 0.5 + 0.5);

  vec3 col = uNebulaTint1 * emissionA
           + uNebulaTint2 * emissionB * 0.7;
  col *= (1.0 - dustMask * 0.6);
  return col * mask;
}

void main(){
  vec3 dir = normalize(vDir);
  vec3 col = vec3(0.0);

  /* ---- nebula + galaxy (broad, low frequency) ---- */
  float dust;
  float band = galacticBand(dir, dust);

  vec3 neb = nebula(dir) * uNebulaStrength;
  col += neb;

  // Unresolved galactic starlight: a warm-white haze.
  vec3 bandColor = mix(vec3(0.62, 0.66, 0.82), vec3(0.95, 0.86, 0.70), 0.45);
  col += bandColor * band * uGalaxyStrength * 0.16;
  // Dust lanes subtract, they don't just darken uniformly.
  col *= (1.0 - dust * 0.55);

  /* ---- resolved stars, several density layers ---- */
  vec3 tint; float mag;
  float s;

  // Star counts, not arbitrary densities.
  //
  // A lattice of radius R has roughly 4*pi*R^2 cells on the shell the ray
  // crosses, so the occupancy needed for N stars is N/(4*pi*R^2). Picking
  // densities by eye instead is how you end up with millions of stars and a
  // solid white sky: at R=820 an occupancy of 0.3 means every third pixel is
  // a star. These are tuned to ~3k bright, ~7k mid, ~14k faint.
  s = starLayer(dir, 150.0, 0.0106 * uStarDensity, uSeed + 1.0, tint, mag);
  col += tint * s * uStarBrightness * 9.0;

  s = starLayer(dir, 320.0, 0.0054 * uStarDensity, uSeed + 2.0, tint, mag);
  col += tint * s * uStarBrightness * 3.2;

  s = starLayer(dir, 700.0, 0.0023 * uStarDensity, uSeed + 3.0, tint, mag);
  col += tint * s * uStarBrightness * 1.3;

  // Extra density inside the galactic plane, where real skies crowd up.
  s = starLayer(dir, 520.0, 0.0075 * uStarDensity, uSeed + 4.0, tint, mag);
  col += tint * s * uStarBrightness * band * 2.4;

  col *= uExposure;

  // Dither here too: the nebula gradients are exactly the kind of smooth
  // low-amplitude ramp that bands badly at 8 bits.
  float d2 = ign(gl_FragCoord.xy) - 0.5;
  col += d2 * 0.0015;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  // Force the sky to the far plane; it must never occlude or be occluded.
  vec4 mvp = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = mvp.xyww;
}
`;

export class Sky {
  constructor(engine, opts = {}) {
    this.engine = engine;

    this.uniforms = {
      uTime: { value: 0 },
      uStarDensity: { value: opts.starDensity ?? 1.0 },
      uStarBrightness: { value: opts.starBrightness ?? 1.0 },
      uNebulaStrength: { value: opts.nebulaStrength ?? 0.32 },
      uGalaxyStrength: { value: opts.galaxyStrength ?? 1.0 },
      uPixelAngle: { value: 0.001 },
      uGalaxyAxis: { value: new THREE.Vector3(0.15, 1.0, 0.3).normalize() },
      uNebulaTint1: { value: new THREE.Color(0.62, 0.14, 0.20) },   // H-alpha
      uNebulaTint2: { value: new THREE.Color(0.10, 0.40, 0.52) },   // OIII
      uSeed: { value: opts.seed ?? 3.17 },
      uExposure: { value: 1.0 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.layers.set(LAYER.SKY);
    engine.scene.add(this.mesh);
  }

  // Pixel angular size drives star anti-aliasing; without it stars either
  // shimmer (too small) or turn into blobs (too large) as FOV/res change.
  update(dt, camera, renderSize) {
    this.uniforms.uTime.value += dt;
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    this.uniforms.uPixelAngle.value = fovRad / Math.max(renderSize.y, 1);
  }

  setProfile(p = {}) {
    const u = this.uniforms;
    if (p.starDensity !== undefined) u.uStarDensity.value = p.starDensity;
    if (p.starBrightness !== undefined) u.uStarBrightness.value = p.starBrightness;
    if (p.nebulaStrength !== undefined) u.uNebulaStrength.value = p.nebulaStrength;
    if (p.galaxyStrength !== undefined) u.uGalaxyStrength.value = p.galaxyStrength;
    if (p.seed !== undefined) u.uSeed.value = p.seed;
    if (p.tint1) u.uNebulaTint1.value.copy(p.tint1);
    if (p.tint2) u.uNebulaTint2.value.copy(p.tint2);
    if (p.galaxyAxis) u.uGalaxyAxis.value.copy(p.galaxyAxis).normalize();
    if (p.exposure !== undefined) u.uExposure.value = p.exposure;
  }

  // Fades the sky out as an atmosphere thickens around the camera.
  setAtmosphericOcclusion(t) {
    this.uniforms.uExposure.value = 1.0 - THREE.MathUtils.clamp(t, 0, 1);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.engine.scene.remove(this.mesh);
  }
}
