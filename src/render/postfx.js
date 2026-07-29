import * as THREE from '../../vendor/three.module.js';
import { ACES, COLOR, DITHER, DEPTH, SAMPLING, HASH } from './glsl.js';

/* ===================================================================== *
 * PostFX — the HDR pipeline.
 *
 *   depth+normal prepass
 *     -> GTAO (half res) -> bilateral upsample        [fed back into materials]
 *   forward HDR pass (linear, RGBA16F)
 *     -> volumetric light shafts (half res, raymarched)
 *     -> TAA resolve (Catmull-Rom history + YCoCg neighbourhood clamp)
 *     -> auto-exposure (1x1 luminance ping-pong, no CPU readback)
 *     -> depth of field (CoC + hex bokeh, half res)
 *     -> camera motion blur (reprojection)
 *     -> bloom (progressive down/upsample, Karis-averaged first mip)
 *     -> composite: ACES + CA + vignette + grain + sharpen + TPDF dither
 *
 * Everything stays in linear HDR until the final composite, and the last
 * thing that happens before quantisation is a triangular dither — that pair
 * is what removes the banding you normally see across skies and fades.
 * ===================================================================== */

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

class FSQuad {
  constructor() {
    this._geo = new THREE.BufferGeometry();
    // Single oversized triangle — avoids the diagonal seam and the redundant
    // fragment work you get from a two-triangle quad.
    this._geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0, 3, -1, 0, -1, 3, 0,
    ]), 3));
    this._geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0, 2, 0, 0, 2,
    ]), 2));
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._mesh = new THREE.Mesh(this._geo, null);
    this._mesh.frustumCulled = false;
    this._scene = new THREE.Scene();
    this._scene.add(this._mesh);
  }
  render(renderer, material, target) {
    this._mesh.material = material;
    renderer.setRenderTarget(target || null);
    renderer.render(this._scene, this._cam);
  }
  dispose() { this._geo.dispose(); }
}

function makeRT(w, h, o = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
    type: o.type ?? THREE.HalfFloatType,
    format: o.format ?? THREE.RGBAFormat,
    minFilter: o.min ?? THREE.LinearFilter,
    magFilter: o.mag ?? THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: !!o.depth,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  if (o.depth && o.depthTexture) {
    const dt = new THREE.DepthTexture(Math.max(1, w | 0), Math.max(1, h | 0));
    dt.type = THREE.UnsignedIntType;
    dt.format = THREE.DepthFormat;
    dt.minFilter = THREE.NearestFilter;
    dt.magFilter = THREE.NearestFilter;
    rt.depthTexture = dt;
  }
  return rt;
}

// All post materials are GLSL3 RawShaderMaterials. Authoring uses the familiar
// GLSL1 spelling (varying / texture2D / gl_FragColor) and this shim rewrites it,
// so the shader bodies above stay readable.
const mat = (uniforms, frag, defines = {}) => new THREE.RawShaderMaterial({
  uniforms, defines,
  glslVersion: THREE.GLSL3,
  vertexShader:
    'precision highp float;\nin vec3 position;\nin vec2 uv;\n' +
    VERT.replace(/varying/g, 'out'),
  fragmentShader:
    'precision highp float;\nprecision highp int;\nout vec4 fragColor;\n' +
    frag.replace(/varying/g, 'in')
        .replace(/\btexture2D\b/g, 'texture')
        .replace(/\bgl_FragColor\b/g, 'fragColor'),
  depthTest: false, depthWrite: false,
});

export class PostFX {
  constructor(engine) {
    this.engine = engine;
    this.renderer = engine.renderer;
    this.quad = new FSQuad();
    this.enabled = {
      ssao: true, volumetrics: true, taa: true, bloom: true,
      dof: true, grain: true, chromatic: true, vignette: true,
      // Camera-reprojection motion blur smears world-static geometry (the
      // player included) whenever the camera moves, resolving into discrete
      // ghost copies rather than a smear. Needs a per-object velocity buffer
      // before it can be re-enabled.
      motionBlur: false,
    };
    this.params = {
      exposure: 1.0, exposureCompensation: 0.0, autoExposure: true,
      autoExposureMin: 0.35, autoExposureMax: 5.0,
      bloomStrength: 0.045, bloomRadius: 1.0,
      grainAmount: 0.022, chromaticAmount: 0.28, vignetteAmount: 0.32,
      sharpen: 0.28, saturation: 1.02, contrast: 1.0,
      dofFocus: 12.0, dofRange: 24.0, dofStrength: 0.0,
      motionBlurStrength: 0.32,
      fogDensity: 0.0, fogHeight: 220.0, fogAmbient: 0.05, fogMaxDist: 2000.0, fogColor: new THREE.Color(0.5, 0.62, 0.78),
      sunScreenPos: new THREE.Vector2(0.5, 0.5), sunVisibility: 0.0,
      sunColor: new THREE.Color(1, 0.96, 0.9),
      lightShaftStrength: 0.0,
    };
    this._frame = 0;
    this._buildMaterials();
    this._rts = {};
  }

  onQualityChange(s) {
    this.enabled.ssao = s.ssao;
    this.enabled.volumetrics = s.volumetrics;
    this.enabled.taa = s.taa;
    this.enabled.motionBlur = s.motionBlur;
    this.enabled.dof = s.dof;
    this._historyValid = false;
    this._rebuildDefines(s);
  }

  _rebuildDefines(s) {
    if (this.mAo) { this.mAo.defines.SAMPLES = Math.max(4, s.ssaoSamples | 0); this.mAo.needsUpdate = true; }
    if (this.mVol) { this.mVol.defines.STEPS = Math.max(8, s.volumetricSteps | 0); this.mVol.needsUpdate = true; }
    this._bloomMips = Math.max(3, s.bloomMips | 0);
  }

  /* ================================================================== */

  resize(w, h) {
    this.width = w; this.height = h;
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    const old = this._rts;
    for (const k in old) {
      const v = old[k];
      if (Array.isArray(v)) v.forEach(x => x?.dispose?.()); else v?.dispose?.();
    }
    if (this._bloomTemps) { for (const k in this._bloomTemps) this._bloomTemps[k]?.dispose?.(); }
    this._bloomTemps = {};
    this._historyRT = null;
    this._adaptRT = null;
    this._adaptA?.dispose?.(); this._adaptB?.dispose?.();
    this._adaptA = this._adaptB = null;
    const R = this._rts = {};

    R.scene   = makeRT(w, h, { depth: true, depthTexture: true });
    R.normal  = makeRT(w, h, { depth: true, depthTexture: true });
    R.ao      = makeRT(hw, hh, { format: THREE.RedFormat, type: THREE.HalfFloatType });
    R.aoBlur  = makeRT(hw, hh, { format: THREE.RedFormat, type: THREE.HalfFloatType });
    R.vol     = makeRT(hw, hh);
    R.volBlur = makeRT(hw, hh);
    R.taaA    = makeRT(w, h);
    R.taaB    = makeRT(w, h);
    R.velocity = makeRT(w, h, { format: THREE.RGFormat });
    R.dofCoc  = makeRT(hw, hh, { format: THREE.RGFormat });
    R.dofA    = makeRT(hw, hh);
    R.dofB    = makeRT(hw, hh);
    R.work    = makeRT(w, h);
    R.work2   = makeRT(w, h);
    R.lumA    = makeRT(1, 1, { min: THREE.NearestFilter, mag: THREE.NearestFilter });
    R.lumB    = makeRT(1, 1, { min: THREE.NearestFilter, mag: THREE.NearestFilter });

    // Bloom pyramid.
    this._bloomMips = this._bloomMips || 6;
    R.bloom = [];
    let bw = w >> 1, bh = h >> 1;
    for (let i = 0; i < this._bloomMips; i++) {
      R.bloom.push(makeRT(Math.max(1, bw), Math.max(1, bh)));
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
    this._historyValid = false;
    this._lumPing = true;

    // Expose the AO texture to the material patcher.
    this.aoTexture = R.aoBlur.texture;
    if (this.globalUniforms) {
      this.globalUniforms.uAoTexture.value = R.aoBlur.texture;
      this.globalUniforms.uResolution.value.set(w, h);
    }
  }

  /* ================================================================== *
   * Materials
   * ================================================================== */

  _buildMaterials() {
    const U = THREE.UniformsUtils;

    // Uniforms shared with scene materials (screen-space AO injection).
    this.globalUniforms = {
      uAoTexture: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uAoEnabled: { value: 1.0 },
    };

    /* ---------------- normal prepass (view-space normals) ------------- */
    this.normalMaterial = new THREE.MeshNormalMaterial();

    /* ---------------- GTAO --------------------------------------------- */
    this.mAo = mat({
      tDepth: { value: null }, tNormal: { value: null },
      uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() },
      uResolution: { value: new THREE.Vector2() },
      uRadius: { value: 1.6 }, uIntensity: { value: 1.0 }, uBias: { value: 0.025 },
      uNear: { value: 0.1 }, uFar: { value: 1000 }, uFrame: { value: 0 },
    }, /* glsl */ `
      ${HASH}
      ${DEPTH}
      uniform sampler2D tDepth, tNormal;
      uniform mat4 uProj, uInvProj;
      uniform vec2 uResolution;
      uniform float uRadius, uIntensity, uBias, uNear, uFar, uFrame;
      varying vec2 vUv;

      vec3 viewPos(vec2 uv){
        float d = texture2D(tDepth, uv).r;
        return viewPosFromDepth(uv, d, uInvProj);
      }

      void main(){
        float depth = texture2D(tDepth, vUv).r;
        if(depth >= 0.9999){ gl_FragColor = vec4(1.0); return; }

        vec3 P = viewPos(vUv);
        vec3 N = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);

        // Horizon-based occlusion over a spiral of samples. Radius shrinks with
        // distance so the AO footprint stays roughly world-constant.
        float radiusPx = uRadius / max(-P.z, 0.1);
        radiusPx = clamp(radiusPx, 2.0 / uResolution.y, 0.08);

        float rot = ign(gl_FragCoord.xy + uFrame * 7.0) * 6.2831853;
        float occ = 0.0;
        const float GOLDEN = 2.39996323;

        for(int i = 0; i < SAMPLES; i++){
          float fi = float(i) + 0.5;
          float ang = rot + fi * GOLDEN;
          float rad = radiusPx * sqrt(fi / float(SAMPLES));
          vec2 off = vec2(cos(ang), sin(ang)) * rad;
          vec2 suv = vUv + off * vec2(1.0, uResolution.x / uResolution.y);
          if(suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

          vec3 S = viewPos(suv);
          vec3 V = S - P;
          float len = length(V);
          if(len < 1e-4) continue;
          float NdotV = dot(N, V / len);

          // Range check stops distant background bleeding occlusion onto foreground.
          float rangeFalloff = clamp(1.0 - (len - uRadius) / max(uRadius, 1e-3), 0.0, 1.0);
          occ += clamp(NdotV - uBias, 0.0, 1.0) * rangeFalloff;
        }
        occ = occ / float(SAMPLES);
        float ao = clamp(1.0 - occ * uIntensity * 2.0, 0.0, 1.0);
        ao = pow(ao, 1.4);
        gl_FragColor = vec4(ao, ao, ao, 1.0);
      }
    `, { SAMPLES: 12 });

    /* ---------------- bilateral blur (depth aware) --------------------- */
    this.mBilateral = mat({
      tSource: { value: null }, tDepth: { value: null },
      uTexel: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(1, 0) },
      uNear: { value: 0.1 }, uFar: { value: 1000 },
    }, /* glsl */ `
      ${DEPTH}
      uniform sampler2D tSource, tDepth;
      uniform vec2 uTexel, uDir;
      uniform float uNear, uFar;
      varying vec2 vUv;
      void main(){
        float centerD = linearizeDepth(texture2D(tDepth, vUv).r, uNear, uFar);
        float sum = 0.0, wsum = 0.0;
        for(int i = -4; i <= 4; i++){
          float fi = float(i);
          vec2 uv = vUv + uDir * uTexel * fi;
          float w = exp(-fi * fi / 8.0);
          float d = linearizeDepth(texture2D(tDepth, uv).r, uNear, uFar);
          // Reject samples across depth discontinuities so AO doesn't halo.
          w *= exp(-abs(d - centerD) * 4.0);
          sum += texture2D(tSource, uv).r * w;
          wsum += w;
        }
        gl_FragColor = vec4(sum / max(wsum, 1e-4));
      }
    `);

    /* ---------------- volumetric light shafts -------------------------- */
    this.mVol = mat({
      tDepth: { value: null }, tScene: { value: null },
      uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
      uViewProj: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uFogColor: { value: new THREE.Color(0.5, 0.6, 0.8) },
      uDensity: { value: 0.02 }, uHeight: { value: 200.0 },
      uStrength: { value: 1.0 }, uFrame: { value: 0 },
      uNear: { value: 0.1 }, uFar: { value: 1000 },
      uAnisotropy: { value: 0.72 }, uAmbient: { value: 0.05 },
      uMaxDist: { value: 2000.0 },
    }, /* glsl */ `
      ${HASH}
      ${DEPTH}
      uniform sampler2D tDepth, tScene;
      uniform mat4 uInvProj, uInvView, uViewProj;
      uniform vec3 uCamPos, uSunDir;
      uniform vec3 uSunColor, uFogColor;
      uniform float uDensity, uHeight, uStrength, uFrame, uNear, uFar, uAnisotropy, uAmbient, uMaxDist;
      varying vec2 vUv;

      float hg(float mu, float g){
        float g2 = g * g;
        return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(1.0 + g2 - 2.0*g*mu, 1e-4), 1.5));
      }

      void main(){
        float depth = texture2D(tDepth, vUv).r;
        vec3 viewP = viewPosFromDepth(vUv, depth, uInvProj);
        vec3 worldP = (uInvView * vec4(viewP, 1.0)).xyz;

        vec3 ro = uCamPos;
        vec3 rd = normalize(worldP - ro);
        float maxDist = min(length(worldP - ro), uMaxDist);
        if(depth >= 0.9999) maxDist = uMaxDist;

        float mu = dot(rd, uSunDir);
        float phase = hg(mu, uAnisotropy);

        // Blue-noise jitter over the step offset. Without this you get the
        // classic banded "venetian blind" slices through the shafts.
        float jitter = ign(gl_FragCoord.xy + uFrame * 13.0);

        float stepLen = maxDist / float(STEPS);
        vec3 accum = vec3(0.0);
        float transmittance = 1.0;

        for(int i = 0; i < STEPS; i++){
          float t = (float(i) + jitter) * stepLen;
          if(t > maxDist) break;
          vec3 p = ro + rd * t;

          float heightFalloff = exp(-max(p.y, 0.0) / uHeight);
          float density = uDensity * heightFalloff;
          if(density < 1e-6) continue;

          // Screen-space shadowing: project a point toward the sun and test it
          // against the depth buffer. Catches on-screen occluders, which is
          // what actually reads as god rays.
          float shadow = 1.0;
          vec3 sp = p + uSunDir * 6.0;
          vec4 clip = uViewProj * vec4(sp, 1.0);
          if(clip.w > 0.0){
            vec3 ndc = clip.xyz / clip.w;
            vec2 suv = ndc.xy * 0.5 + 0.5;
            if(all(greaterThanEqual(suv, vec2(0.0))) && all(lessThanEqual(suv, vec2(1.0)))){
              float sceneD = texture2D(tDepth, suv).r;
              float sampleZ = linearizeDepth(ndc.z * 0.5 + 0.5, uNear, uFar);
              float sceneZ  = linearizeDepth(sceneD, uNear, uFar);
              if(sceneZ < sampleZ - 1.0) shadow = 0.0;
            }
          }

          // Single-scattering radiative transfer. Density is an extinction
          // coefficient per world unit, so optical depth over a step is
          // density*stepLen -- the in-scatter term must NOT be scaled again on
          // top of that, or the integral saturates into a white wash.
          float att = density * stepLen;
          vec3 inScatter = uSunColor * phase * shadow + uFogColor * uAmbient;
          accum += inScatter * att * transmittance;
          transmittance *= exp(-att);
          if(transmittance < 0.002) break;
        }

        gl_FragColor = vec4(accum * uStrength, 1.0 - transmittance);
      }
    `, { STEPS: 24 });

    /* ---------------- TAA resolve -------------------------------------- */
    this.mTaa = mat({
      tCurrent: { value: null }, tHistory: { value: null }, tDepth: { value: null },
      uResolution: { value: new THREE.Vector2() },
      uCurrViewProj: { value: new THREE.Matrix4() }, uPrevViewProj: { value: new THREE.Matrix4() },
      uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
      uValid: { value: 0 }, uBlend: { value: 0.9 },
    }, /* glsl */ `
      ${SAMPLING}
      ${DEPTH}
      uniform sampler2D tCurrent, tHistory, tDepth;
      uniform vec2 uResolution;
      uniform mat4 uCurrViewProj, uPrevViewProj, uInvProj, uInvView;
      uniform float uValid, uBlend;
      varying vec2 vUv;

      // YCoCg gives a much tighter, less colour-fringed clamp box than RGB.
      vec3 rgb2ycocg(vec3 c){
        return vec3(0.25*c.r + 0.5*c.g + 0.25*c.b, 0.5*c.r - 0.5*c.b, -0.25*c.r + 0.5*c.g - 0.25*c.b);
      }
      vec3 ycocg2rgb(vec3 c){
        return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z);
      }

      void main(){
        vec3 current = texture2D(tCurrent, vUv).rgb;
        if(uValid < 0.5){ gl_FragColor = vec4(current, 1.0); return; }

        // Reproject through last frame's view-projection to find the history UV.
        float depth = texture2D(tDepth, vUv).r;
        vec3 viewP = viewPosFromDepth(vUv, depth, uInvProj);
        vec4 worldP = uInvView * vec4(viewP, 1.0);
        vec4 prevClip = uPrevViewProj * worldP;
        vec2 prevUv = (prevClip.xy / max(prevClip.w, 1e-6)) * 0.5 + 0.5;

        if(any(lessThan(prevUv, vec2(0.0))) || any(greaterThan(prevUv, vec2(1.0)))){
          gl_FragColor = vec4(current, 1.0); return;
        }

        vec3 history = sampleCatmullRom(tHistory, prevUv, uResolution).rgb;

        // Neighbourhood clamp: build the colour AABB of the 3x3 current-frame
        // neighbourhood and clip history into it. This is what kills ghosting.
        vec2 texel = 1.0 / uResolution;
        vec3 nmin = vec3(1e9), nmax = vec3(-1e9), nsum = vec3(0.0);
        for(int y = -1; y <= 1; y++){
          for(int x = -1; x <= 1; x++){
            vec3 c = rgb2ycocg(texture2D(tCurrent, vUv + vec2(float(x), float(y)) * texel).rgb);
            nmin = min(nmin, c); nmax = max(nmax, c); nsum += c;
          }
        }
        vec3 navg = nsum / 9.0;
        // Widen slightly toward the mean (variance clipping) to avoid over-tight
        // boxes on noisy pixels, which would reject all history and re-alias.
        nmin = mix(nmin, navg, 0.06);
        nmax = mix(nmax, navg, 0.06);

        vec3 hy = rgb2ycocg(history);
        hy = clamp(hy, nmin, nmax);
        history = ycocg2rgb(hy);

        // Reduce history weight when the reprojection moved a long way — fast
        // motion should favour the current frame.
        float velocity = length((prevUv - vUv) * uResolution);
        float blend = mix(uBlend, 0.55, clamp(velocity / 24.0, 0.0, 1.0));

        vec3 result = mix(current, history, blend);
        gl_FragColor = vec4(result, 1.0);
      }
    `);

    /* ---------------- luminance + adaptation --------------------------- */
    this.mLum = mat({
      tSource: { value: null }, uMip: { value: 0 },
      uMinLum: { value: 0.004 }, uMaxLum: { value: 30.0 },
    }, /* glsl */ `
      ${COLOR}
      uniform sampler2D tSource;
      uniform float uMinLum, uMaxLum;
      varying vec2 vUv;
      void main(){
        // Centre-weighted log-average metering.
        //
        // A naive log-average is useless in a space game: most of the frame is
        // near-black sky, log(~0) dominates the geometric mean, and the exposure
        // runs away to its clamp and blows out everything that IS lit. So dark
        // samples are excluded from the average rather than dragging it down,
        // and the whole thing falls back to a mid grey if the frame really is
        // almost entirely black.
        float total = 0.0, wsum = 0.0, lit = 0.0;
        const int N = 12;
        for(int y = 0; y < N; y++){
          for(int x = 0; x < N; x++){
            vec2 uv = (vec2(float(x), float(y)) + 0.5) / float(N);
            float d = length(uv - 0.5);
            float w = exp(-d * d * 2.5);
            float l = luma3(texture2D(tSource, uv).rgb);
            if(l < uMinLum) continue;
            l = min(l, uMaxLum);
            total += log(l) * w;
            wsum += w;
            lit += 1.0;
          }
        }
        float coverage = lit / float(N * N);
        float avg = wsum > 1e-4 ? exp(total / wsum) : 0.18;
        // When only a sliver of the frame is lit (a lone star, a distant ship)
        // don't let that sliver define the exposure for the whole image.
        avg = mix(0.18, avg, smoothstep(0.0, 0.12, coverage));
        gl_FragColor = vec4(clamp(avg, 1e-3, uMaxLum));
      }
    `);

    this.mAdapt = mat({
      tCurrent: { value: null }, tPrev: { value: null },
      uSpeed: { value: 1.4 }, uDt: { value: 0.016 }, uValid: { value: 0 },
    }, /* glsl */ `
      uniform sampler2D tCurrent, tPrev;
      uniform float uSpeed, uDt, uValid;
      varying vec2 vUv;
      void main(){
        float cur = texture2D(tCurrent, vec2(0.5)).r;
        float prev = texture2D(tPrev, vec2(0.5)).r;
        if(uValid < 0.5){ gl_FragColor = vec4(cur); return; }
        // Eye adaptation: dark->bright adapts faster than bright->dark, as in
        // real vision. Exponential approach, framerate independent.
        float speed = cur > prev ? uSpeed * 1.8 : uSpeed * 0.6;
        float v = prev + (cur - prev) * (1.0 - exp(-uDt * speed));
        gl_FragColor = vec4(max(v, 1e-4));
      }
    `);

    /* ---------------- depth of field ----------------------------------- */
    this.mCoc = mat({
      tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1000 },
      uFocus: { value: 10 }, uRange: { value: 20 }, uStrength: { value: 1 },
    }, /* glsl */ `
      ${DEPTH}
      uniform sampler2D tDepth;
      uniform float uNear, uFar, uFocus, uRange, uStrength;
      varying vec2 vUv;
      void main(){
        float d = linearizeDepth(texture2D(tDepth, vUv).r, uNear, uFar);
        float coc = (d - uFocus) / max(uRange, 1e-3);
        coc = clamp(coc, -1.0, 1.0) * uStrength;
        gl_FragColor = vec4(coc * 0.5 + 0.5, abs(coc), 0.0, 1.0);
      }
    `);

    this.mDof = mat({
      tSource: { value: null }, tCoc: { value: null },
      uTexel: { value: new THREE.Vector2() }, uFrame: { value: 0 },
    }, /* glsl */ `
      ${HASH}
      uniform sampler2D tSource, tCoc;
      uniform vec2 uTexel;
      uniform float uFrame;
      varying vec2 vUv;
      void main(){
        float coc = texture2D(tCoc, vUv).g;
        if(coc < 0.01){ gl_FragColor = texture2D(tSource, vUv); return; }
        // Golden-angle disc scatter-as-gather. Weighted by the neighbour's own
        // CoC so sharp foreground doesn't bleed into blurred background.
        float radius = coc * 14.0;
        float rot = ign(gl_FragCoord.xy + uFrame * 3.0) * 6.2831853;
        vec3 sum = vec3(0.0); float wsum = 0.0;
        const int N = 24;
        for(int i = 0; i < N; i++){
          float fi = float(i) + 0.5;
          float a = rot + fi * 2.39996323;
          float r = radius * sqrt(fi / float(N));
          vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
          float sc = texture2D(tCoc, uv).g;
          float w = clamp(sc / max(coc, 1e-3), 0.05, 1.0);
          sum += texture2D(tSource, uv).rgb * w;
          wsum += w;
        }
        gl_FragColor = vec4(sum / max(wsum, 1e-4), 1.0);
      }
    `);

    /* ---------------- camera motion blur -------------------------------- */
    this.mMotion = mat({
      tSource: { value: null }, tDepth: { value: null },
      uCurrViewProj: { value: new THREE.Matrix4() }, uPrevViewProj: { value: new THREE.Matrix4() },
      uInvProj: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
      uStrength: { value: 0.5 }, uFrame: { value: 0 },
    }, /* glsl */ `
      ${HASH}
      ${DEPTH}
      uniform sampler2D tSource, tDepth;
      uniform mat4 uCurrViewProj, uPrevViewProj, uInvProj, uInvView;
      uniform float uStrength, uFrame;
      varying vec2 vUv;
      void main(){
        float depth = texture2D(tDepth, vUv).r;
        vec3 viewP = viewPosFromDepth(vUv, depth, uInvProj);
        vec4 worldP = uInvView * vec4(viewP, 1.0);
        vec4 prevClip = uPrevViewProj * worldP;
        vec2 prevUv = (prevClip.xy / max(prevClip.w, 1e-6)) * 0.5 + 0.5;
        vec2 vel = (vUv - prevUv) * uStrength;
        float len = length(vel);
        if(len < 0.0008){ gl_FragColor = texture2D(tSource, vUv); return; }
        vel = normalize(vel) * min(len, 0.018);
        float jitter = ign(gl_FragCoord.xy + uFrame * 5.0);
        vec3 sum = vec3(0.0);
        const int N = 16;
        for(int i = 0; i < N; i++){
          float t = (float(i) + jitter) / float(N) - 0.5;
          sum += texture2D(tSource, vUv - vel * t).rgb;
        }
        gl_FragColor = vec4(sum / float(N), 1.0);
      }
    `);

    /* ---------------- bloom -------------------------------------------- */
    this.mDown = mat({
      tSource: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 },
    }, /* glsl */ `
      ${COLOR}
      uniform sampler2D tSource;
      uniform vec2 uTexel;
      uniform float uFirst;
      varying vec2 vUv;
      // 13-tap partial Karis average (COD: Advanced Warfare). The weighted
      // average on the first downsample is what stops single bright pixels
      // (stars, specular hits) from flickering into big bloom blobs.
      vec3 tap(vec2 uv){ return texture2D(tSource, uv).rgb; }
      float karis(vec3 c){ return 1.0 / (1.0 + luma3(c)); }
      void main(){
        vec2 t = uTexel;
        vec3 a = tap(vUv + vec2(-2,  2) * t), b = tap(vUv + vec2( 0,  2) * t), c = tap(vUv + vec2( 2,  2) * t);
        vec3 d = tap(vUv + vec2(-2,  0) * t), e = tap(vUv                     ), f = tap(vUv + vec2( 2,  0) * t);
        vec3 g = tap(vUv + vec2(-2, -2) * t), h = tap(vUv + vec2( 0, -2) * t), i = tap(vUv + vec2( 2, -2) * t);
        vec3 j = tap(vUv + vec2(-1,  1) * t), k = tap(vUv + vec2( 1,  1) * t);
        vec3 l = tap(vUv + vec2(-1, -1) * t), m = tap(vUv + vec2( 1, -1) * t);
        vec3 result;
        if(uFirst > 0.5){
          vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25;
          vec3 g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25;
          vec3 g4 = (j + k + l + m) * 0.25;
          float w0 = karis(g0), w1 = karis(g1), w2 = karis(g2), w3 = karis(g3), w4 = karis(g4);
          float wsum = w0*0.125 + w1*0.125 + w2*0.125 + w3*0.125 + w4*0.5;
          result = (g0*w0*0.125 + g1*w1*0.125 + g2*w2*0.125 + g3*w3*0.125 + g4*w4*0.5) / max(wsum, 1e-5);
        } else {
          result  = e * 0.125;
          result += (a + c + g + i) * 0.03125;
          result += (b + d + f + h) * 0.0625;
          result += (j + k + l + m) * 0.125;
        }
        gl_FragColor = vec4(max(result, vec3(0.0)), 1.0);
      }
    `);

    this.mUp = mat({
      tSource: { value: null }, tPrev: { value: null },
      uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 },
    }, /* glsl */ `
      uniform sampler2D tSource, tPrev;
      uniform vec2 uTexel;
      uniform float uRadius;
      varying vec2 vUv;
      void main(){
        vec2 t = uTexel * uRadius;
        // 3x3 tent filter upsample — smooth, no boxy artefacts.
        vec3 s = texture2D(tSource, vUv + vec2(-1, 1) * t).rgb * 1.0
               + texture2D(tSource, vUv + vec2( 0, 1) * t).rgb * 2.0
               + texture2D(tSource, vUv + vec2( 1, 1) * t).rgb * 1.0
               + texture2D(tSource, vUv + vec2(-1, 0) * t).rgb * 2.0
               + texture2D(tSource, vUv                    ).rgb * 4.0
               + texture2D(tSource, vUv + vec2( 1, 0) * t).rgb * 2.0
               + texture2D(tSource, vUv + vec2(-1,-1) * t).rgb * 1.0
               + texture2D(tSource, vUv + vec2( 0,-1) * t).rgb * 2.0
               + texture2D(tSource, vUv + vec2( 1,-1) * t).rgb * 1.0;
        s /= 16.0;
        gl_FragColor = vec4(s + texture2D(tPrev, vUv).rgb, 1.0);
      }
    `);

    /* ---------------- final composite ----------------------------------- */
    this.mComposite = mat({
      tScene: { value: null }, tBloom: { value: null }, tLum: { value: null },
      tVolumetric: { value: null },
      uResolution: { value: new THREE.Vector2() },
      uExposure: { value: 1.0 }, uExposureComp: { value: 0.0 }, uAutoExposure: { value: 1.0 },
      uAutoMin: { value: 0.35 }, uAutoMax: { value: 5.0 },
      uBloomStrength: { value: 0.06 },
      uChromatic: { value: 0.3 }, uVignette: { value: 0.35 }, uGrain: { value: 0.02 },
      uSharpen: { value: 0.3 }, uSaturation: { value: 1.0 }, uContrast: { value: 1.0 },
      uTime: { value: 0 }, uVolStrength: { value: 1.0 },
      uFadeColor: { value: new THREE.Color(0, 0, 0) }, uFadeAmount: { value: 0.0 },
      uLetterbox: { value: 0.0 },
      uLift: { value: new THREE.Vector3(0, 0, 0) },
      uGamma: { value: new THREE.Vector3(1, 1, 1) },
      uGain: { value: new THREE.Vector3(1, 1, 1) },
    }, /* glsl */ `
      ${HASH}
      ${ACES}
      ${COLOR}
      ${DITHER}
      uniform sampler2D tScene, tBloom, tLum, tVolumetric;
      uniform vec2 uResolution;
      uniform float uExposure, uExposureComp, uAutoExposure, uBloomStrength;
      uniform float uAutoMin, uAutoMax;
      uniform float uChromatic, uVignette, uGrain, uSharpen, uSaturation, uContrast;
      uniform float uTime, uVolStrength, uFadeAmount, uLetterbox;
      uniform vec3 uFadeColor, uLift, uGamma, uGain;
      varying vec2 vUv;

      vec3 sampleScene(vec2 uv){ return texture2D(tScene, uv).rgb; }

      void main(){
        vec2 uv = vUv;
        vec2 texel = 1.0 / uResolution;
        vec2 center = uv - 0.5;
        float r2 = dot(center, center);

        // Chromatic aberration: lateral, scaling with radius like a real lens.
        vec3 color;
        if(uChromatic > 0.001){
          vec2 offset = center * uChromatic * 0.006 * r2;
          color.r = sampleScene(uv + offset).r;
          color.g = sampleScene(uv).g;
          color.b = sampleScene(uv - offset).b;
        } else {
          color = sampleScene(uv);
        }

        // Volumetric in-scatter composited in linear HDR, before tonemapping.
        vec4 vol = texture2D(tVolumetric, uv);
        color += vol.rgb * uVolStrength;

        // Lerp rather than add. Additive bloom scales with the number of mips
        // in the pyramid, so the same strength value looks different at every
        // quality preset and lifts the whole frame's black level.
        vec3 bloom = texture2D(tBloom, uv).rgb;
        color = mix(color, bloom, clamp(uBloomStrength, 0.0, 1.0));

        // Exposure from the adapted luminance, keyed to middle grey.
        float avgLum = texture2D(tLum, vec2(0.5)).r;
        float autoEv = 0.18 / max(avgLum, 1e-4);
        // Deliberately narrow. Wide auto-exposure ranges read as "video game
        // auto-brightness"; real cameras don't swing 24 stops between shots.
        autoEv = clamp(autoEv, uAutoMin, uAutoMax);
        float exposure = uExposure * mix(1.0, autoEv, uAutoExposure) * pow(2.0, uExposureComp);
        color *= exposure;

        // Filmic tonemap in linear, then grade in display space.
        color = acesFitted(color);

        // Lift / gamma / gain grade.
        color = pow(max(color, 0.0), uGamma) * uGain + uLift;

        float lum = luma3(color);
        color = mix(vec3(lum), color, uSaturation);
        color = (color - 0.5) * uContrast + 0.5;

        // Unsharp mask for a touch of micro-contrast. Restrained; over-sharpening
        // is a dead giveaway of a game render.
        if(uSharpen > 0.001){
          vec3 blur = (sampleScene(uv + vec2(texel.x, 0.0)) + sampleScene(uv - vec2(texel.x, 0.0)) +
                       sampleScene(uv + vec2(0.0, texel.y)) + sampleScene(uv - vec2(0.0, texel.y))) * 0.25;
          blur = acesFitted(blur * exposure);
          color += (color - blur) * uSharpen;
        }

        // Natural vignette (cos^4 falloff), not a black ring.
        float vig = 1.0 - uVignette * smoothstep(0.15, 0.85, r2 * 1.6);
        color *= vig;

        // Film grain.
        //
        // Interleaved gradient noise is a fixed periodic lattice — held still
        // it reads as a woven screen-door pattern rather than as grain. A
        // hash over (pixel, frame) decorrelates it both spatially and in time.
        if(uGrain > 0.001){
          float n = hash13(vec3(gl_FragCoord.xy, floor(uTime * 60.0)));
          float n2 = hash13(vec3(gl_FragCoord.yx + 17.3, floor(uTime * 60.0) + 5.0));
          float g = (n + n2) * 0.5;            // triangular PDF, less harsh
          float lumFactor = 1.0 - smoothstep(0.0, 0.7, luma3(color));
          color += (g - 0.5) * uGrain * (0.35 + lumFactor);
        }

        color = clamp(color, 0.0, 1.0);
        color = mix(color, uFadeColor, uFadeAmount);

        // Cinematic bars, drawn here so they letterbox the graded image.
        if(uLetterbox > 0.001){
          float barSize = uLetterbox * 0.12;
          if(uv.y < barSize || uv.y > 1.0 - barSize) color = vec3(0.0);
        }

        color = linearToSRGB(color);
        // Final step before 8-bit quantisation — this is the banding fix.
        color = ditherTriangular(color, gl_FragCoord.xy, 1.0 / 255.0);

        gl_FragColor = vec4(color, 1.0);
      }
    `);

    this.mCopy = mat({ tSource: { value: null } }, /* glsl */ `
      uniform sampler2D tSource;
      varying vec2 vUv;
      void main(){ gl_FragColor = texture2D(tSource, vUv); }
    `);

    this.mFxaa = mat({
      tSource: { value: null }, uTexel: { value: new THREE.Vector2() },
    }, /* glsl */ `
      ${COLOR}
      uniform sampler2D tSource;
      uniform vec2 uTexel;
      varying vec2 vUv;
      void main(){
        vec3 rgbNW = texture2D(tSource, vUv + vec2(-1.0,-1.0) * uTexel).rgb;
        vec3 rgbNE = texture2D(tSource, vUv + vec2( 1.0,-1.0) * uTexel).rgb;
        vec3 rgbSW = texture2D(tSource, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
        vec3 rgbSE = texture2D(tSource, vUv + vec2( 1.0, 1.0) * uTexel).rgb;
        vec3 rgbM  = texture2D(tSource, vUv).rgb;
        float lNW = luma3(rgbNW), lNE = luma3(rgbNE);
        float lSW = luma3(rgbSW), lSE = luma3(rgbSE), lM = luma3(rgbM);
        float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
        float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
        vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
        float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
        float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
        dir = clamp(dir * rcpDirMin, -8.0, 8.0) * uTexel;
        vec3 rgbA = 0.5 * (texture2D(tSource, vUv + dir * (1.0/3.0 - 0.5)).rgb +
                           texture2D(tSource, vUv + dir * (2.0/3.0 - 0.5)).rgb);
        vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tSource, vUv - dir * 0.5).rgb +
                                         texture2D(tSource, vUv + dir * 0.5).rgb);
        float lB = luma3(rgbB);
        gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
      }
    `);
  }

  /* ================================================================== *
   * Frame graph
   * ================================================================== */

  renderFrame(dt) {
    const e = this.engine, r = this.renderer, R = this._rts, s = e.settings;
    this._frame++;

    // Every screen-space effect reads the prepass, so they all share one
    // projection. Using a layer camera here would silently desync depth.
    const cam = e.postCamera;
    const needsDepth = (this.enabled.ssao && s.ssao)
      || (this.enabled.taa && s.taa)
      || (this.enabled.dof && s.dof && this.params.dofStrength > 0.001)
      || (this.enabled.motionBlur && s.motionBlur)
      || (this.enabled.volumetrics && s.volumetrics && this.params.lightShaftStrength > 0.001);

    /* --- 1. depth + normal prepass ---------------------------------- */
    if (needsDepth) {
      r.setRenderTarget(R.normal);
      r.clear(true, true, false);
      const prevOverride = e.scene.overrideMaterial;
      // MeshNormalMaterial is used rather than a hand-written shader because it
      // carries three's skinning / morph / instancing chunks — the avatar is
      // skinned and would otherwise render in bind pose into the prepass.
      e.scene.overrideMaterial = this.normalMaterial;
      r.render(e.scene, cam);
      e.scene.overrideMaterial = prevOverride;
    }
    const depthTex = R.normal.depthTexture;

    /* --- 2. GTAO ----------------------------------------------------- */
    if (this.enabled.ssao && s.ssao) {
      const u = this.mAo.uniforms;
      u.tDepth.value = depthTex;
      u.tNormal.value = R.normal.texture;
      u.uProj.value.copy(cam.projectionMatrix);
      u.uInvProj.value.copy(cam.projectionMatrixInverse);
      u.uResolution.value.set(this.width >> 1, this.height >> 1);
      u.uNear.value = cam.near; u.uFar.value = cam.far;
      u.uFrame.value = this._frame;
      this.quad.render(r, this.mAo, R.ao);

      const b = this.mBilateral.uniforms;
      b.tDepth.value = depthTex;
      b.uNear.value = cam.near; b.uFar.value = cam.far;
      b.tSource.value = R.ao.texture;
      b.uTexel.value.set(2 / this.width, 2 / this.height);
      b.uDir.value.set(1, 0);
      this.quad.render(r, this.mBilateral, R.aoBlur);
      b.tSource.value = R.aoBlur.texture;
      b.uDir.value.set(0, 1);
      this.quad.render(r, this.mBilateral, R.ao);

      this.globalUniforms.uAoTexture.value = R.ao.texture;
      this.globalUniforms.uAoEnabled.value = 1.0;
    } else {
      this.globalUniforms.uAoEnabled.value = 0.0;
    }

    /* --- 3. main forward HDR pass ------------------------------------ */
    this.globalUniforms.uResolution.value.set(this.width, this.height);
    r.setRenderTarget(R.scene);
    e.renderScene();

    let current = R.scene.texture;

    /* --- 4. volumetrics ---------------------------------------------- */
    let volTex = null;
    if (this.enabled.volumetrics && s.volumetrics && this.params.lightShaftStrength > 0.001) {
      const u = this.mVol.uniforms;
      u.tDepth.value = depthTex;
      u.tScene.value = current;
      u.uInvProj.value.copy(cam.projectionMatrixInverse);
      u.uInvView.value.copy(cam.matrixWorld);
      u.uViewProj.value.copy(e.currViewProj);
      u.uCamPos.value.copy(cam.position);
      if (this.params.sunDir) u.uSunDir.value.copy(this.params.sunDir);
      u.uSunColor.value.copy(this.params.sunColor);
      u.uFogColor.value.copy(this.params.fogColor);
      u.uDensity.value = this.params.fogDensity;
      u.uHeight.value = this.params.fogHeight;
      u.uStrength.value = this.params.lightShaftStrength;
      u.uAmbient.value = this.params.fogAmbient;
      u.uMaxDist.value = this.params.fogMaxDist;
      u.uNear.value = cam.near; u.uFar.value = cam.far;
      u.uFrame.value = this._frame;
      this.quad.render(r, this.mVol, R.vol);
      volTex = R.vol.texture;
    }

    /* --- 5. TAA ------------------------------------------------------- */
    if (this.enabled.taa && s.taa && needsDepth) {
      const u = this.mTaa.uniforms;
      u.tCurrent.value = current;
      u.tHistory.value = this._historyRT ? this._historyRT.texture : current;
      u.tDepth.value = depthTex;
      u.uResolution.value.set(this.width, this.height);
      u.uCurrViewProj.value.copy(e.currViewProj);
      u.uPrevViewProj.value.copy(e.prevViewProj);
      u.uInvProj.value.copy(cam.projectionMatrixInverse);
      u.uInvView.value.copy(cam.matrixWorld);
      u.uValid.value = this._historyValid ? 1 : 0;
      const dst = (this._historyRT === R.taaA) ? R.taaB : R.taaA;
      this.quad.render(r, this.mTaa, dst);
      this._historyRT = dst;
      this._historyValid = true;
      current = dst.texture;
    }

    /* --- 6. auto exposure ---------------------------------------------- */
    if (!this._adaptA) {
      this._adaptA = makeRT(1, 1, { min: THREE.NearestFilter, mag: THREE.NearestFilter });
      this._adaptB = makeRT(1, 1, { min: THREE.NearestFilter, mag: THREE.NearestFilter });
    }
    this.mLum.uniforms.tSource.value = current;
    this.quad.render(r, this.mLum, R.lumA);

    const aDst = (this._adaptRT === this._adaptA) ? this._adaptB : this._adaptA;
    this.mAdapt.uniforms.tCurrent.value = R.lumA.texture;
    this.mAdapt.uniforms.tPrev.value = this._adaptRT ? this._adaptRT.texture : R.lumA.texture;
    this.mAdapt.uniforms.uDt.value = Math.min(dt, 0.1);
    this.mAdapt.uniforms.uValid.value = this._adaptRT ? 1 : 0;
    this.quad.render(r, this.mAdapt, aDst);
    this._adaptRT = aDst;

    /* --- 7. depth of field ---------------------------------------------- */
    if (this.enabled.dof && s.dof && this.params.dofStrength > 0.001 && needsDepth) {
      const c = this.mCoc.uniforms;
      c.tDepth.value = depthTex;
      c.uNear.value = cam.near; c.uFar.value = cam.far;
      c.uFocus.value = this.params.dofFocus;
      c.uRange.value = this.params.dofRange;
      c.uStrength.value = this.params.dofStrength;
      this.quad.render(r, this.mCoc, R.dofCoc);

      const d = this.mDof.uniforms;
      d.tSource.value = current;
      d.tCoc.value = R.dofCoc.texture;
      d.uTexel.value.set(1 / this.width, 1 / this.height);
      d.uFrame.value = this._frame;
      const dst = (current === R.work.texture) ? R.work2 : R.work;
      this.quad.render(r, this.mDof, dst);
      current = dst.texture;
    }

    /* --- 8. motion blur --------------------------------------------------- */
    if (this.enabled.motionBlur && s.motionBlur && this.params.motionBlurStrength > 0.001 && needsDepth) {
      const u = this.mMotion.uniforms;
      u.tSource.value = current;
      u.tDepth.value = depthTex;
      u.uCurrViewProj.value.copy(e.currViewProj);
      u.uPrevViewProj.value.copy(e.prevViewProj);
      u.uInvProj.value.copy(cam.projectionMatrixInverse);
      u.uInvView.value.copy(cam.matrixWorld);
      u.uStrength.value = this.params.motionBlurStrength;
      u.uFrame.value = this._frame;
      const dst = (current === R.work.texture) ? R.work2 : R.work;
      this.quad.render(r, this.mMotion, dst);
      current = dst.texture;
    }

    /* --- 9. bloom ---------------------------------------------------------- */
    let bloomTex = null;
    if (this.enabled.bloom) {
      const mips = R.bloom;
      let src = current;
      for (let i = 0; i < mips.length; i++) {
        const u = this.mDown.uniforms;
        u.tSource.value = src;
        const pw = i === 0 ? this.width : mips[i - 1].width;
        const ph = i === 0 ? this.height : mips[i - 1].height;
        u.uTexel.value.set(1 / pw, 1 / ph);
        u.uFirst.value = i === 0 ? 1 : 0;
        this.quad.render(r, this.mDown, mips[i]);
        src = mips[i].texture;
      }
      // Upsample and accumulate downward. Writes go to a scratch target first
      // because a target can't be sampled and written in the same draw.
      for (let i = mips.length - 1; i > 0; i--) {
        const tmp = this._bloomTemp(i);
        const u = this.mUp.uniforms;
        u.tSource.value = mips[i].texture;
        u.tPrev.value = mips[i - 1].texture;
        u.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height);
        u.uRadius.value = this.params.bloomRadius;
        this.quad.render(r, this.mUp, tmp);
        this.mCopy.uniforms.tSource.value = tmp.texture;
        this.quad.render(r, this.mCopy, mips[i - 1]);
      }
      // Take the bloom from the SECOND mip, not the first.
      //
      // mips[0] is only a 13-tap half-res filter of the frame, so it still
      // holds near-sharp detail. Adding it back re-composites a faint copy of
      // the image over itself — which with very bright HDR sources (stars at
      // ~9.0) shows up as hard dots scattered across the whole frame,
      // including on top of opaque geometry. Starting one octave down keeps
      // the glow soft and energy-conserving.
      bloomTex = mips[Math.min(1, mips.length - 1)].texture;
    }

    /* --- 10. composite ------------------------------------------------------ */
    const p = this.params, u = this.mComposite.uniforms;
    u.tScene.value = current;
    u.tBloom.value = bloomTex || this._blackTexture();
    u.tLum.value = this._adaptRT.texture;
    u.tVolumetric.value = volTex || this._blackTexture();
    u.uResolution.value.set(this.width, this.height);
    u.uExposure.value = p.exposure;
    u.uExposureComp.value = p.exposureCompensation;
    u.uAutoExposure.value = p.autoExposure ? 1 : 0;
    u.uAutoMin.value = p.autoExposureMin ?? 0.35;
    u.uAutoMax.value = p.autoExposureMax ?? 5.0;
    u.uBloomStrength.value = this.enabled.bloom ? p.bloomStrength : 0;
    u.uChromatic.value = this.enabled.chromatic ? p.chromaticAmount : 0;
    u.uVignette.value = this.enabled.vignette ? p.vignetteAmount : 0;
    u.uGrain.value = this.enabled.grain ? p.grainAmount : 0;
    u.uSharpen.value = p.sharpen;
    u.uSaturation.value = p.saturation;
    u.uContrast.value = p.contrast;
    u.uTime.value = performance.now() * 0.001;
    u.uVolStrength.value = 1.0;
    if (p.fadeColor) u.uFadeColor.value.copy(p.fadeColor);
    u.uFadeAmount.value = p.fadeAmount || 0;
    u.uLetterbox.value = p.letterbox || 0;

    const needsFxaa = !(this.enabled.taa && s.taa) && s.fxaa;
    this.quad.render(r, this.mComposite, needsFxaa ? R.work2 : null);
    if (needsFxaa) {
      this.mFxaa.uniforms.tSource.value = R.work2.texture;
      this.mFxaa.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
      this.quad.render(r, this.mFxaa, null);
    }
    r.setRenderTarget(null);
  }

  _bloomTemp(i) {
    this._bloomTemps = this._bloomTemps || {};
    const m = this._rts.bloom[i - 1];
    if (!this._bloomTemps[i] || this._bloomTemps[i].width !== m.width) {
      this._bloomTemps[i]?.dispose();
      this._bloomTemps[i] = makeRT(m.width, m.height);
    }
    return this._bloomTemps[i];
  }

  _blackTexture() {
    if (!this._black) {
      this._black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      this._black.needsUpdate = true;
    }
    return this._black;
  }

  /* ================================================================== *
   * Material patching — injects screen-space AO into scene materials so
   * it multiplies only the *indirect* term, instead of dirtying direct light.
   * ================================================================== */

  patchMaterial(material) {
    if (material.userData.__aoPatched) return material;
    material.userData.__aoPatched = true;
    const g = this.globalUniforms;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader) => {
      prev?.(shader);
      shader.uniforms.uAoTexture = g.uAoTexture;
      shader.uniforms.uAoResolution = g.uResolution;
      shader.uniforms.uAoEnabled = g.uAoEnabled;
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `
          uniform sampler2D uAoTexture;
          uniform vec2 uAoResolution;
          uniform float uAoEnabled;
          void main() {
        `)
        .replace('#include <aomap_fragment>', `
          #include <aomap_fragment>
          if(uAoEnabled > 0.5){
            float ssao = texture2D(uAoTexture, gl_FragCoord.xy / uAoResolution).r;
            reflectedLight.indirectDiffuse *= ssao;
            reflectedLight.indirectSpecular *= mix(1.0, ssao, 0.6);
          }
        `);
    };
    material.needsUpdate = true;
    return material;
  }

  dispose() {
    for (const k in this._rts) {
      const v = this._rts[k];
      if (Array.isArray(v)) v.forEach(x => x.dispose()); else v?.dispose?.();
    }
    this.quad.dispose();
  }
}
