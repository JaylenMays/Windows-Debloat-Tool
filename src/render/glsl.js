// Shared GLSL building blocks. Kept in one place so every shader in the game speaks the
// same language for noise, tonemapping, dithering and packing.

/* ------------------------------------------------------------------ *
 * Hashing / noise
 * ------------------------------------------------------------------ */

export const HASH = /* glsl */ `
// Integer-ish hashes (Dave Hoskins style). Cheap, no texture lookups, stable across drivers.
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031,0.1030,0.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3  hash33(vec3 p){ vec3 q = fract(p * vec3(0.1031,0.1030,0.0973)); q += dot(q, q.yxz+33.33); return fract((q.xxy + q.yxx)*q.zyx); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }

// Interleaved gradient noise: cheap, well-distributed, the standard choice for
// per-pixel jitter in AO / volumetrics / dithering.
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// Gradient noise + fBm. `snoise3` is a classic simplex; `vnoise3` is cheaper value noise.
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise3(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

float fbm3(vec3 p, int oct, float lac, float gain){
  float a = 0.5, s = 0.0, n = 0.0;
  for(int i=0;i<8;i++){
    if(i>=oct) break;
    s += a * snoise3(p); n += a; p *= lac; a *= gain;
  }
  return s / max(n, 1e-4);
}

// Ridged multifractal — the backbone of believable mountain silhouettes.
float ridged3(vec3 p, int oct, float lac, float gain){
  float a = 0.5, s = 0.0, n = 0.0, prev = 1.0;
  for(int i=0;i<8;i++){
    if(i>=oct) break;
    float r = 1.0 - abs(snoise3(p));
    r *= r; r *= prev; prev = r;
    s += a * r; n += a; p *= lac; a *= gain;
  }
  return s / max(n, 1e-4);
}

// Domain-warped fBm. The single cheapest way to stop noise looking like noise.
float warpedFbm(vec3 p, int oct){
  vec3 q = vec3(fbm3(p, 4, 2.0, 0.5), fbm3(p + 5.2, 4, 2.0, 0.5), fbm3(p + 9.7, 4, 2.0, 0.5));
  return fbm3(p + 3.0 * q, oct, 2.0, 0.5);
}
`;

/* ------------------------------------------------------------------ *
 * Colour / tonemapping
 * ------------------------------------------------------------------ */

// Full ACES RRT+ODT fit (Stephen Hill). Noticeably better highlight roll-off and hue
// preservation than the Narkowicz approximation three.js ships with — bright suns and
// engine plumes desaturate toward white the way film does instead of clipping to neon.
export const ACES = /* glsl */ `
const mat3 ACESInputMat = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777);
const mat3 ACESOutputMat = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602);
vec3 RRTAndODTFit(vec3 v){
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesFitted(vec3 color){
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
`;

export const COLOR = /* glsl */ `
vec3 linearToSRGB(vec3 c){
  return mix(c * 12.92, 1.055 * pow(max(c, 1e-5), vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
}
vec3 sRGBToLinear(vec3 c){
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
// Deliberately NOT called luminance(): three.js injects its own
// luminance(const in vec3) into ShaderMaterial, and the differing parameter
// qualifiers make the shader fail to compile.
float luma3(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Physically-motivated white balance / temperature shift in linear space.
vec3 whiteBalance(vec3 c, float temp, float tint){
  float t1 = temp * 0.1, t2 = tint * 0.1;
  mat3 m = mat3(1.0 + t1, 0.0, 0.0,  0.0, 1.0 + t2, 0.0,  0.0, 0.0, 1.0 - t1);
  return m * c;
}
`;

/* ------------------------------------------------------------------ *
 * Dithering — the fix for banding in smooth gradients (skies, fog, fades)
 * ------------------------------------------------------------------ */

// Requires HASH (for ign).
export const DITHER = /* glsl */ `
// Triangular PDF dither. Applied just before 8-bit quantisation this removes the
// contour bands you otherwise get across large smooth gradients.
vec3 ditherTriangular(vec3 color, vec2 fragCoord, float amount){
  float r0 = ign(fragCoord);
  float r1 = ign(fragCoord + 17.0);
  float r2 = ign(fragCoord + 43.0);
  vec3 rnd = vec3(r0, r1, r2);
  vec3 tri = (rnd + fract(rnd * 3.7)) - 0.5;   // approx triangular distribution
  return color + tri * amount;
}
`;

/* ------------------------------------------------------------------ *
 * Depth / packing helpers
 * ------------------------------------------------------------------ */

export const DEPTH = /* glsl */ `
float linearizeDepth(float d, float near, float far){
  float z = d * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
}
float perspectiveDepthToViewZ(float d, float near, float far){
  return (near * far) / ((far - near) * d - far);
}
vec3 viewPosFromDepth(vec2 uv, float depth, mat4 invProj){
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = invProj * clip;
  return view.xyz / view.w;
}
vec3 octDecode(vec2 f){
  f = f * 2.0 - 1.0;
  vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
  float t = max(-n.z, 0.0);
  n.xy += vec2(n.x >= 0.0 ? -t : t, n.y >= 0.0 ? -t : t);
  return normalize(n);
}
vec2 octEncode(vec3 n){
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 e = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  return e * 0.5 + 0.5;
}
`;

/* ------------------------------------------------------------------ *
 * Sampling
 * ------------------------------------------------------------------ */

export const SAMPLING = /* glsl */ `
// 9-tap Catmull-Rom. Used by TAA history resampling: bilinear history reprojection is
// the main source of temporal blur, this keeps it sharp.
vec4 sampleCatmullRom(sampler2D tex, vec2 uv, vec2 texSize){
  vec2 samplePos = uv * texSize;
  vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - texPos1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / max(w12, vec2(1e-5));
  vec2 texPos0  = (texPos1 - 1.0) / texSize;
  vec2 texPos3  = (texPos1 + 2.0) / texSize;
  vec2 texPos12 = (texPos1 + offset12) / texSize;
  vec4 result = vec4(0.0);
  result += texture2D(tex, vec2(texPos0.x,  texPos0.y))  * w0.x  * w0.y;
  result += texture2D(tex, vec2(texPos12.x, texPos0.y))  * w12.x * w0.y;
  result += texture2D(tex, vec2(texPos3.x,  texPos0.y))  * w3.x  * w0.y;
  result += texture2D(tex, vec2(texPos0.x,  texPos12.y)) * w0.x  * w12.y;
  result += texture2D(tex, vec2(texPos12.x, texPos12.y)) * w12.x * w12.y;
  result += texture2D(tex, vec2(texPos3.x,  texPos12.y)) * w3.x  * w12.y;
  result += texture2D(tex, vec2(texPos0.x,  texPos3.y))  * w0.x  * w3.y;
  result += texture2D(tex, vec2(texPos12.x, texPos3.y))  * w12.x * w3.y;
  result += texture2D(tex, vec2(texPos3.x,  texPos3.y))  * w3.x  * w3.y;
  return result;
}
`;

/* ------------------------------------------------------------------ *
 * Atmospheric scattering (shared by planet shells and surface skies)
 * ------------------------------------------------------------------ */

export const SCATTER = /* glsl */ `
// Ray/sphere intersection returning near+far distances (x=near, y=far). x>y => miss.
vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r){
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float cc = dot(oc, oc) - r * r;
  float h = b * b - cc;
  if(h < 0.0) return vec2(1.0, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

float rayleighPhase(float mu){ return 3.0 / (16.0 * 3.14159265) * (1.0 + mu * mu); }

// Cornette-Shanks — a better fit to real Mie scattering than Henyey-Greenstein alone,
// which is what gives the bright forward-scattering halo right around the sun.
float miePhase(float mu, float g){
  float g2 = g * g;
  float num = 3.0 * (1.0 - g2) * (1.0 + mu * mu);
  float den = 8.0 * 3.14159265 * (2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5);
  return num / den;
}
`;

export function compose(...chunks) {
  return chunks.join('\n');
}
