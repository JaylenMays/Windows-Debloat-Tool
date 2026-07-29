import * as THREE from '../../vendor/three.module.js';
import { PostFX } from '../render/postfx.js';

/* ===================================================================== *
 * Quality presets
 *
 * Everything expensive is gated here so the same build runs on a laptop
 * iGPU and a desktop GPU. `AUTO` adapts at runtime via resolution scaling.
 * ===================================================================== */

export const QUALITY_PRESETS = {
  low: {
    label: 'Low',
    renderScale: 0.7, maxPixelRatio: 1.0,
    shadowMapSize: 1024, shadowCascades: 2, softShadows: false,
    ssao: false, ssaoSamples: 0,
    volumetrics: false, volumetricSteps: 0,
    bloomMips: 4, motionBlur: false, dof: false,
    taa: false, fxaa: true,
    terrainLod: 0.7, grassDensity: 0.0, cloudSteps: 0,
    anisotropy: 4, envMapSize: 128,
  },
  medium: {
    label: 'Medium',
    renderScale: 0.85, maxPixelRatio: 1.25,
    shadowMapSize: 2048, shadowCascades: 3, softShadows: false,
    ssao: true, ssaoSamples: 8,
    volumetrics: false, volumetricSteps: 0,
    bloomMips: 5, motionBlur: false, dof: true,
    taa: true, fxaa: false,
    terrainLod: 1.0, grassDensity: 0.5, cloudSteps: 24,
    anisotropy: 8, envMapSize: 256,
  },
  high: {
    label: 'High',
    renderScale: 1.0, maxPixelRatio: 1.5,
    shadowMapSize: 2048, shadowCascades: 4, softShadows: true,
    ssao: true, ssaoSamples: 12,
    volumetrics: true, volumetricSteps: 24,
    bloomMips: 6, motionBlur: false, dof: true,
    taa: true, fxaa: false,
    terrainLod: 1.3, grassDensity: 1.0, cloudSteps: 48,
    anisotropy: 16, envMapSize: 256,
  },
  ultra: {
    label: 'Ultra',
    renderScale: 1.0, maxPixelRatio: 2.0,
    shadowMapSize: 4096, shadowCascades: 4, softShadows: true,
    ssao: true, ssaoSamples: 20,
    volumetrics: true, volumetricSteps: 40,
    bloomMips: 7, motionBlur: false, dof: true,
    taa: true, fxaa: false,
    terrainLod: 1.8, grassDensity: 1.5, cloudSteps: 72,
    anisotropy: 16, envMapSize: 512,
  },
};

/* ===================================================================== *
 * Scale layers
 *
 * A space game spans ~12 orders of magnitude (a 1.8 m avatar standing on a
 * 6000 km planet orbiting a star 1e11 m away). No single depth buffer
 * survives that, and a logarithmic buffer alone still fights on coplanar
 * geometry. So we slice the frustum into independent depth ranges and
 * render them back-to-front, clearing depth between each. Every layer then
 * gets the *full* precision of the depth buffer over its own narrow range.
 * ===================================================================== */

export const LAYER = {
  SKY:   0,   // starfield / nebula — infinitely far, no depth interaction
  DEEP:  1,   // stars, distant planets:     1e6 .. 1e13
  FAR:   2,   // current planet, moons:      1e3 .. 1e9
  MID:   3,   // terrain, structures:        5    .. 4e5
  NEAR:  4,   // character, ship interior:   0.05 .. 500
  FX:    5,   // additive FX that must not write depth
};

// MID must start close to the eye: in third person the ground directly under
// the camera is well inside a 4 m near plane, and clipping it punches a hole
// straight through to the starfield.
//
// It must also hold anything that can be MUTUALLY occluded with the terrain —
// the avatar included. Depth is cleared between layers, so a nearer layer
// always wins regardless of true depth; splitting the character onto NEAR
// would draw them through any hill standing between them and the camera.
// NEAR is therefore reserved for geometry that is guaranteed closest: first
// person hands, cockpit interiors, screen-space props.
const LAYER_RANGES = {
  [LAYER.DEEP]: [1e6, 1e13],
  [LAYER.FAR]:  [5e2, 1e9],
  [LAYER.MID]:  [0.25, 3e4],
  [LAYER.NEAR]: [0.05, 12],
};

// Halton(2,3) — low-discrepancy jitter sequence for TAA sub-pixel sampling.
function halton(index, base) {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}
const HALTON = Array.from({ length: 16 }, (_, i) => [
  halton(i + 1, 2) - 0.5,
  halton(i + 1, 3) - 0.5,
]);

export class Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // we do our own AA (TAA/FXAA) in post
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
    });

    const gl = this.renderer.getContext();
    this.caps = {
      isWebGL2: this.renderer.capabilities.isWebGL2,
      floatRender: !!gl.getExtension('EXT_color_buffer_float'),
      floatLinear: !!gl.getExtension('OES_texture_float_linear'),
      maxAniso: this.renderer.capabilities.getMaxAnisotropy(),
      maxTexture: this.renderer.capabilities.maxTextureSize,
    };

    // We stay in linear HDR the whole way through and do our own ACES tonemap
    // + sRGB encode in the final composite pass. Letting three tonemap here
    // would double-apply it.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.info.autoReset = false;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;

    // One scene, many layers. Cameras share orientation but not depth range.
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 600);
    this.camera.layers.disableAll();
    this.camera.layers.enable(LAYER.NEAR);

    this._layerCameras = {};
    for (const key of [LAYER.DEEP, LAYER.FAR, LAYER.MID, LAYER.NEAR]) {
      const [near, far] = LAYER_RANGES[key];
      const cam = new THREE.PerspectiveCamera(60, 1, near, far);
      cam.layers.disableAll();
      cam.layers.enable(key);
      if (key === LAYER.NEAR) cam.layers.enable(LAYER.FX);
      this._layerCameras[key] = cam;
    }
    this._skyCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 10);
    this._skyCamera.layers.disableAll();
    this._skyCamera.layers.enable(LAYER.SKY);

    // Post-process camera.
    //
    // The layered colour pass clears depth between slices, so the depth buffer
    // left at the end describes only the last slice — useless for AO, DOF, TAA
    // or volumetrics. Those effects instead consume a dedicated single-camera
    // prepass spanning the range where screen-space effects actually matter.
    // Anything beyond `far` lands on the far plane, which is exactly right:
    // distant planets and sky shouldn't receive AO or bokeh, and having no
    // parallax they reproject correctly from an infinite depth anyway.
    this._postCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 8000);
    this._postCamera.layers.disableAll();
    this._postCamera.layers.enable(LAYER.MID);
    this._postCamera.layers.enable(LAYER.NEAR);

    this.quality = opts.quality || 'high';
    this.settings = { ...QUALITY_PRESETS[this.quality] };
    this.userRenderScale = 1.0;

    this._size = new THREE.Vector2(1, 1);
    this._frame = 0;
    this._jitterEnabled = true;

    // Matrices needed by TAA / motion blur for reprojection.
    this.prevViewProj = new THREE.Matrix4();
    this.currViewProj = new THREE.Matrix4();
    this._tmpMat = new THREE.Matrix4();

    this.post = new PostFX(this);

    this.stats = {
      fps: 0, ms: 0, cpuMs: 0,
      drawCalls: 0, triangles: 0, programs: 0,
      renderScale: 1, quality: this.quality,
    };
    this._fpsAccum = []; this._lastStatsUpdate = 0;

    // Adaptive resolution: keeps frame time under budget by trading pixels.
    this.adaptive = { enabled: true, target: 16.7, min: 0.55, max: 1.0, current: 1.0, _accum: [] };

    this.resize();
  }

  /* ------------------------------------------------------------------ */

  setQuality(name) {
    if (!QUALITY_PRESETS[name]) return;
    this.quality = name;
    this.settings = { ...QUALITY_PRESETS[name] };
    this.stats.quality = name;
    this.renderer.shadowMap.type = this.settings.softShadows
      ? THREE.VSMShadowMap : THREE.PCFShadowMap;
    this.post.onQualityChange(this.settings);
    this.resize();
    this.dispatchQuality?.(this.settings);
  }

  setRenderScale(s) { this.userRenderScale = THREE.MathUtils.clamp(s, 0.3, 2.0); this.resize(); }

  get pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.settings.maxPixelRatio);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const scale = this.settings.renderScale * this.userRenderScale * this.adaptive.current;
    const pr = this.pixelRatio;

    const rw = Math.max(2, Math.floor(w * pr * scale));
    const rh = Math.max(2, Math.floor(h * pr * scale));

    this.renderer.setPixelRatio(1);           // we own the scaling maths
    this.renderer.setSize(rw, rh, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';

    this._size.set(rw, rh);
    this.displaySize = new THREE.Vector2(Math.floor(w * pr), Math.floor(h * pr));

    const aspect = w / h;
    for (const cam of [this.camera, this._skyCamera, this._postCamera, ...Object.values(this._layerCameras)]) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
    this.stats.renderScale = scale;
    this.post.resize(rw, rh);
  }

  setFov(deg) {
    for (const cam of [this.camera, this._skyCamera, this._postCamera, ...Object.values(this._layerCameras)]) {
      cam.fov = deg;
      cam.updateProjectionMatrix();
    }
  }

  /* ------------------------------------------------------------------ *
   * Frame
   * ------------------------------------------------------------------ */

  // Sync every layer camera to the master camera's transform. Cameras differ
  // only in near/far so that each depth slice uses the full 24-bit range.
  _syncCameras() {
    const src = this.camera;
    src.updateMatrixWorld(true);
    const cams = [this._skyCamera, this._postCamera, ...Object.values(this._layerCameras)];
    for (const cam of cams) {
      cam.position.copy(src.position);
      cam.quaternion.copy(src.quaternion);
      if (cam.fov !== src.fov) { cam.fov = src.fov; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld(true);
    }
    // Sky renders from the origin — only orientation matters, so translation is
    // dropped to keep the starfield fixed at infinity.
    this._skyCamera.position.set(0, 0, 0);
    this._skyCamera.updateMatrixWorld(true);
  }

  _applyJitter() {
    const useTaa = this.settings.taa && this._jitterEnabled;
    const [jx, jy] = useTaa ? HALTON[this._frame % HALTON.length] : [0, 0];
    this.jitter = { x: jx, y: jy };
    const sx = (2 * jx) / this._size.x;
    const sy = (2 * jy) / this._size.y;
    for (const key of [LAYER.DEEP, LAYER.FAR, LAYER.MID, LAYER.NEAR]) {
      const cam = this._layerCameras[key];
      cam.updateProjectionMatrix();
      if (useTaa) {
        cam.projectionMatrix.elements[8] += sx;
        cam.projectionMatrix.elements[9] += sy;
        cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      }
    }
  }

  render(dt) {
    const t0 = performance.now();
    this._frame++;

    this._syncCameras();
    this._applyJitter();

    // Reprojection matrices come from the post camera — the same projection the
    // depth prepass uses — so reconstructed positions and velocities agree.
    this.prevViewProj.copy(this.currViewProj);
    const pc = this._postCamera;
    this._tmpMat.copy(pc.projectionMatrix).multiply(pc.matrixWorldInverse);
    this.currViewProj.copy(this._tmpMat);

    this.renderer.info.reset();
    this.post.renderFrame(dt);

    const info = this.renderer.info.render;
    this.stats.drawCalls = info.calls;
    this.stats.triangles = info.triangles;
    this.stats.programs = this.renderer.info.programs?.length || 0;

    const cpuMs = performance.now() - t0;
    this.stats.cpuMs = cpuMs;
    this._updateStats(dt, cpuMs);
    this._updateAdaptive(dt);
  }

  // Renders every scale layer into the currently-bound target, clearing depth
  // between slices. Called by PostFX so it controls the destination.
  renderScene() {
    const r = this.renderer;
    r.clear(true, true, true);

    // Sky: no depth interaction at all.
    r.render(this.scene, this._skyCamera);

    for (const key of [LAYER.DEEP, LAYER.FAR, LAYER.MID, LAYER.NEAR]) {
      r.clearDepth();
      r.render(this.scene, this._layerCameras[key]);
    }
  }

  cameraForLayer(layer) { return this._layerCameras[layer] || this.camera; }
  get postCamera() { return this._postCamera; }

  _updateStats(dt, cpuMs) {
    this._fpsAccum.push(dt);
    if (this._fpsAccum.length > 60) this._fpsAccum.shift();
    const now = performance.now();
    if (now - this._lastStatsUpdate > 250) {
      const avg = this._fpsAccum.reduce((a, b) => a + b, 0) / this._fpsAccum.length;
      this.stats.fps = 1 / Math.max(avg, 1e-5);
      this.stats.ms = avg * 1000;
      this._lastStatsUpdate = now;
    }
  }

  // Trades resolution for frame time. Moves in small steps with hysteresis so
  // it never oscillates visibly.
  _updateAdaptive(dt) {
    const a = this.adaptive;
    if (!a.enabled) return;
    a._accum.push(dt * 1000);
    if (a._accum.length < 30) return;
    const sorted = [...a._accum].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    a._accum.length = 0;

    const prev = a.current;
    if (median > a.target * 1.25)      a.current = Math.max(a.min, a.current - 0.08);
    else if (median < a.target * 0.7)  a.current = Math.min(a.max, a.current + 0.04);
    if (Math.abs(a.current - prev) > 0.001) this.resize();
  }

  setAdaptive(on) { this.adaptive.enabled = on; if (!on) { this.adaptive.current = 1; this.resize(); } }

  dispose() {
    this.post.dispose();
    this.renderer.dispose();
  }
}
