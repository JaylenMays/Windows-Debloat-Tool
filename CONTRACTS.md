# AETHERIUM — module interface contracts

Engine: three.js r185 (ESM, vendored at `/vendor/three.module.js`). No other deps, no external assets.
Everything procedural / code-generated. Served over http (ES modules).

Import three as:  `import * as THREE from '../../vendor/three.module.js';`  (adjust depth)

Color space rules (IMPORTANT — everyone must follow):
- Renderer uses `THREE.LinearSRGBColorSpace` output + our own ACES tonemap in the final post pass.
- Albedo/basecolor textures: `tex.colorSpace = THREE.SRGBColorSpace`.
- Normal / roughness / metal / AO / height data textures: `THREE.NoColorSpace` (linear).
- Never call `renderer.toneMapping` — tonemapping happens in post.

---

## A. `src/render/textures.js` — procedural PBR texture library

```js
export const Noise = { ... }                      // seeded noise utilities (see below)
export function makeMaterialSet(kind, opts) -> {  // main entry
  map, normalMap, roughnessMap, aoMap, displacementMap|null
}
```

Requirements:
- `kind` one of: `'rock'|'sand'|'ice'|'regolith'|'basalt'|'metalPanel'|'carbonWeave'|'fabric'|'skin'|'concrete'|'alienCoral'|'rustedIron'`
- `opts`: `{ size=1024, seed=1, tint=[r,g,b] (linear 0..1), scale=1, detail=1 }`
- Returns `THREE.DataTexture`s (RGBA8 for color, RGBA8 for normal, R8/RGBA8 for rough/ao),
  `wrapS/wrapT = RepeatWrapping`, `generateMipmaps=true`, `minFilter=LinearMipmapLinearFilter`,
  `anisotropy` left at default (engine sets it), correct `colorSpace` per rules above.
- Textures MUST be seamlessly tileable (use periodic/tiling noise — domain must wrap).
- Normal maps derived from the height field via Sobel, encoded `xyz*0.5+0.5`, +Y up (OpenGL convention).
- Must be deterministic given a seed, and generated fast (whole set <120ms @1024 on a laptop CPU).
- Pure: no DOM/canvas2d dependency for the pixel math (typed arrays only) — canvas is allowed
  only if strictly faster, but determinism must hold.

Also export:
```js
export function makeEnvironmentHDRI(renderer, params) -> THREE.Texture (PMREM cubemap)
```
Procedural sky/space environment for IBL: params `{ sunDir:Vector3, sunColor, skyTint, groundTint, nebula:bool, strength }`.
Use a small (256) cube render target + PMREMGenerator.

## B. `src/core/audio.js` — procedural audio (WebAudio, zero asset files)

```js
export class AudioEngine {
  constructor()                       // does NOT create AudioContext (autoplay policy)
  async init()                        // create ctx on first user gesture; safe to call twice
  setMasterVolume(v)                  // 0..1
  setBus(name, v)                     // 'music'|'sfx'|'ambient'|'ui'
  // one-shots
  play(name, opts={})                 // see catalogue below
  // continuous
  startAmbience(profile)              // 'nexus'|'space'|'surface-rocky'|'surface-ice'|'surface-jungle'|'interior'
  stopAmbience(fade=1.0)
  setEngine(throttle01, warp01)       // continuous ship engine synth
  startMusic(mood)                    // 'menu'|'wonder'|'tension'|'discovery'|'warp'|'finale'
  stopMusic(fade=2)
  duckFor(seconds, amount=0.5)        // sidechain duck for cutscene dialogue
  update(dt, listenerState)           // listenerState:{pos,quat,vel} for doppler/positional
  dispose()
}
```
One-shot catalogue (`play(name)`): `ui.hover, ui.click, ui.back, ui.confirm, ui.error, ui.tab,
scan.start, scan.loop, scan.success, discover.minor, discover.major, key.acquire,
footstep (opts:{surface,speed}), jump, land, jetpack, ship.boost, ship.warpCharge, ship.warpJump,
door, terminal.type, codex.open, lore.unlock, heartbeat, alarm`.
All synthesized (oscillators, noise buffers, filters, convolver w/ procedurally generated impulse
responses for reverb). Music must be generative (evolving pads/arps, mode-based), not a loop of noise.
No `console.log` spam. Must not throw if AudioContext is unavailable.

## C. `src/ui/*.js` — DOM overlay UI (menus, HUD, codex, character creator shell)

Files: `src/ui/ui.js` (root controller), `src/ui/styles.js` (injects CSS), plus screens.
```js
export class UI extends EventTarget {
  constructor(root: HTMLElement)
  showScreen(name, data)   // 'boot'|'title'|'creator'|'loading'|'hud'|'codex'|'starmap'|'pause'|'settings'|'credits'
  hideScreen(name)
  // HUD API
  hud: {
    setVitals({o2, integrity, energy}), setObjective(text, sub),
    setCompass(headingRad, markers:[{az,dist,type,label}]),
    showToast({title, body, kind}), showSubtitle(text, ms),
    setScanProgress(t01|null), setPrompt(text|null), setSpeed(v), setCoords(str),
    setReticle(state), setDiscoveryLog(entries)
  }
  setCodex(data), setStarmap(data)
  showCinematicBars(on), fadeTo(color, ms) -> Promise
}
```
Events dispatched (CustomEvent, `detail` payload): `ui:start`, `ui:creator-change` {slider,value},
`ui:creator-done` {config}, `ui:travel` {systemId}, `ui:resume`, `ui:setting` {key,value}, `ui:quit`.

Visual bar: AAA sci-fi. Thin, precise, high-contrast, kinetic. Custom-drawn (CSS/SVG/canvas)
holographic elements, no emoji, no default browser widgets, no rounded bootstrap look.
Must use only system-available fonts, or a procedurally drawn/embedded font — no network fetches.
All animations 60fps-safe (transform/opacity only). Respect `prefers-reduced-motion`.
Everything must be keyboard + gamepad navigable.
