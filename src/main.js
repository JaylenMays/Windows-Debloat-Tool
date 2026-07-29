import * as THREE from '../vendor/three.module.js';
import { Engine, LAYER, QUALITY_PRESETS } from './core/engine.js';
import { Sky } from './render/sky.js';
import { AudioEngine } from './core/audio.js';
import { UI } from './ui/ui.js';
import { Avatar, AVATAR_SCHEMA, defaultConfig, randomConfig } from './player/avatar.js';
import { Input, PlayerController } from './player/controller.js';
import { World, SYSTEMS } from './game/world.js';

/* ===================================================================== *
 * AETHERIUM — entry point.
 *
 * Owns the frame loop and the state machine, and is the only place that
 * knows about every subsystem at once. Everything else stays independent.
 * ===================================================================== */

const STATE = {
  BOOT: 'boot', TITLE: 'title', CREATOR: 'creator',
  LOADING: 'loading', PLAY: 'play', CUTSCENE: 'cutscene',
};

class Game {
  constructor(canvas) {
    this.engine = new Engine(canvas, { quality: 'high' });
    this.ui = new UI(document.getElementById('ui'));
    this.audio = new AudioEngine();
    this.input = new Input(canvas);

    this.sky = new Sky(this.engine, { seed: 3.17, nebulaStrength: 0.30 });
    this.controller = new PlayerController(this.engine, this.input);

    this.state = STATE.BOOT;
    this.world = null;
    this.avatar = null;
    this.systemIndex = 0;

    this.progress = {
      keys: [],                 // system ids whose key is taken
      scanned: new Set(),
      codex: [],
      unlocked: ['kestrel'],
    };

    this.scanning = null;
    this._clock = 0;
    this._settings = {};

    this._wireUI();
    this._wireInput();

    window.addEventListener('resize', () => this.engine.resize());

    this.ui.creator.schema = AVATAR_SCHEMA.map(s => ({
      category: s.category, key: s.key, label: s.label, type: s.type,
      min: s.min, max: s.max, def: s.def, options: s.options,
    }));

    this.avatarConfig = defaultConfig();
    this.ui.showScreen('boot');
    this.state = STATE.BOOT;
  }

  /* ------------------------------------------------------------------ */

  _wireUI() {
    const ui = this.ui;

    // Any UI sound request routes to the synth; the UI never imports audio.
    ui.el.addEventListener('ui:sfx', (e) => this.audio.play('ui.' + (e.detail?.name || 'click')));

    // The boot animation resolves asynchronously and fires this whenever it
    // finishes — including after the player (or a test harness) has already
    // moved on. Without the guard it re-shows the title menu on top of live
    // gameplay.
    ui.on('ui:boot-done', () => {
      if (this.state !== STATE.BOOT) return;
      ui.showScreen('title');
      this.state = STATE.TITLE;
      this.audio.startMusic('menu');
    });
    ui.on('ui:start', () => this._enterCreator());
    ui.on('ui:creator-change', (d) => this._onCreatorChange(d));
    ui.on('ui:creator-random', () => {
      this.avatarConfig = randomConfig(Math.floor(Math.random() * 1e9));
      this._rebuildAvatar();
      this.ui.creator.setConfig?.(this.avatarConfig);
    });
    ui.on('ui:creator-done', (d) => this._materialize(d));
    ui.on('ui:travel', (d) => this._travelTo(d?.systemId ?? d?.id));
    ui.on('ui:resume', () => this._resume());
    ui.on('ui:quit', () => { this._teardownWorld(); ui.showScreen('title'); this.state = STATE.TITLE; });
    ui.on('ui:setting', (d) => this._applySetting(d.key, d.value));

    // First gesture unlocks WebAudio (browser autoplay policy).
    const unlock = async () => {
      await this.audio.init();
      this.audio.startMusic('menu');
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  _wireInput() {
    const canvas = this.engine.canvas;
    canvas.addEventListener('click', () => {
      if (this.state === STATE.PLAY && !this.input.mouse.locked) this.input.requestLock();
    });
    window.addEventListener('keydown', (e) => {
      if (this.state !== STATE.PLAY) {
        if (e.code === 'Escape' && this.ui.active === 'pause') this._resume();
        return;
      }
      switch (e.code) {
        case 'Escape': this._pause(); break;
        case 'KeyM': this._openStarmap(); break;
        case 'KeyJ': this._openCodex(); break;
        case 'KeyF': this._toggleFlight(); break;
        case 'KeyE': this._beginScan(); break;
        default: break;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyE') this._cancelScan();
    });

    this.controller.onFootstep = (intensity) => {
      this.audio.play('footstep', { surface: this.world?.biome?.surface || 'rock', speed: intensity });
    };
    this.controller.onJump = () => this.audio.play('jump');
    this.controller.onLand = () => this.audio.play('land');
  }

  _applySetting(key, value) {
    this._settings[key] = value;
    const e = this.engine, p = e.post.params;
    switch (key) {
      case 'quality': if (QUALITY_PRESETS[value]) e.setQuality(value); break;
      case 'resolutionScale': e.setRenderScale(value); break;
      case 'fov': e.setFov(value); break;
      case 'motionBlur': e.post.enabled.motionBlur = !!value; break;
      case 'filmGrain': e.post.enabled.grain = !!value; break;
      case 'bloom': e.post.enabled.bloom = !!value; break;
      case 'chromatic': e.post.enabled.chromatic = !!value; break;
      case 'masterVolume': this.audio.setMasterVolume(value); break;
      case 'musicVolume': this.audio.setBus('music', value); break;
      case 'sfxVolume': this.audio.setBus('sfx', value); break;
      case 'invertY': this.controller.invertY = !!value; break;
      case 'sensitivity': this.controller.sensitivity = 0.0022 * value; break;
      default: break;
    }
  }

  /* ---------------- creator ---------------- */

  _enterCreator() {
    this.state = STATE.CREATOR;
    this.ui.showScreen('creator');
    this.audio.startMusic('wonder');
    this._setupCreatorScene();
  }

  _setupCreatorScene() {
    if (this._creatorRig) { this._creatorRig.visible = true; this._rebuildAvatar(); return; }
    const rig = new THREE.Group();
    const key = new THREE.DirectionalLight(0xfff0dd, 3.2);
    key.position.set(2.4, 3.2, 2.8); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -2; key.shadow.camera.right = 2;
    key.shadow.camera.top = 3; key.shadow.camera.bottom = -1;
    key.shadow.bias = -0.0009; key.shadow.normalBias = 0.02;
    key.layers.enableAll(); rig.add(key);
    const fill = new THREE.DirectionalLight(0x8fb4ff, 0.9);
    fill.position.set(-3.2, 1.5, 1.4); fill.layers.enableAll(); rig.add(fill);
    const rim = new THREE.DirectionalLight(0xffd9a8, 2.8);
    rim.position.set(-1.2, 2.4, -3.4); rim.layers.enableAll(); rig.add(rim);
    rig.add(new THREE.HemisphereLight(0x51617d, 0x241c16, 0.5));

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.06, 64),
      new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.35, metalness: 0.7 })
    );
    disc.position.y = -0.03; disc.receiveShadow = true; disc.layers.set(LAYER.MID);
    rig.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.52, 0.012, 8, 128),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.6, 2.4) })
    );
    ring.rotation.x = Math.PI / 2; ring.layers.set(LAYER.MID);
    rig.add(ring);
    this._creatorRing = ring;

    this.engine.scene.add(rig);
    this._creatorRig = rig;
    this._rebuildAvatar();

    const p = this.engine.post.params;
    p.dofStrength = 0.75; p.dofFocus = 2.7; p.dofRange = 2.4;
    p.bloomStrength = 0.05; p.grainAmount = 0.016; p.vignetteAmount = 0.36;
    p.fogDensity = 0; p.lightShaftStrength = 0;
    this.sky.setProfile({ starDensity: 0.5, nebulaStrength: 0.5, starBrightness: 0.7 });
  }

  _rebuildAvatar() {
    if (this.avatar) { this.engine.scene.remove(this.avatar.group); this.avatar.dispose(); }
    this.avatar = new Avatar(this.engine, this.avatarConfig);
    this.engine.scene.add(this.avatar.group);
    this.engine.post._historyValid = false;
  }

  _onCreatorChange(d) {
    if (!d || !d.key) return;
    this.avatarConfig[d.key] = d.value;
    // Colour-only changes update uniforms in place; anything structural needs
    // the geometry rebuilt. Rebuilding on every colour drag would stutter.
    const colorOnly = ['skinTone', 'suitPrimary', 'suitSecondary', 'suitAccent',
      'emissiveColor', 'emissive', 'suitWear', 'skinRough', 'freckles', 'hairColor', 'eyeColor'];
    if (colorOnly.includes(d.key) && this.avatar) this.avatar.setColors({ [d.key]: d.value });
    else this._scheduleRebuild();
  }

  _scheduleRebuild() {
    clearTimeout(this._rebuildTimer);
    this._rebuildTimer = setTimeout(() => this._rebuildAvatar(), 40);
  }

  /* ---------------- transitions ---------------- */

  async _materialize(cfg) {
    if (cfg && typeof cfg === 'object') Object.assign(this.avatarConfig, cfg);
    this.audio.play('ui.confirm');
    this.state = STATE.CUTSCENE;
    this.ui.showCinematicBars(true);
    await this.ui.fadeTo('#000000', 900);
    this.ui.showScreen('loading');
    await this._loadSystem(0);
    this.ui.showCinematicBars(false);
  }

  async _loadSystem(index) {
    this.state = STATE.LOADING;
    const sys = SYSTEMS[index];
    this.systemIndex = index;
    this.ui.loading.setProgress(0.05, 'ALLOCATING LATTICE', sys.name);

    // Let the browser paint the loading screen before the (blocking) world gen.
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));

    this._teardownWorld();
    this.ui.loading.setProgress(0.35, 'GENERATING TERRAIN', sys.blurb);
    await new Promise(r => setTimeout(r, 20));

    this.world = new World(this.engine, sys);
    this.ui.loading.setProgress(0.75, 'SEEDING SURFACE', sys.resources);
    await new Promise(r => setTimeout(r, 20));

    this.controller.setTerrain(this.world.terrain);
    this.controller.setMode('walk');
    const spawn = new THREE.Vector3(0, 0, 0);
    spawn.y = this.world.terrain.heightAt(0, 0);
    this.controller.position.copy(spawn);
    this.controller.velocity.set(0, 0, 0);
    this.invalidateHistory();
    this.controller.yaw = Math.atan2(
      this.world.anchors[0].position.x - spawn.x,
      this.world.anchors[0].position.z - spawn.z);

    if (this._creatorRig) this._creatorRig.visible = false;
    if (!this.avatar) this._rebuildAvatar();
    this.engine.scene.add(this.avatar.group);

    this._applyWorldGrade();
    this.sky.setProfile({ ...this.world.biome.sky, starBrightness: 0.55 });

    this.ui.loading.setProgress(1.0, 'LINK ESTABLISHED', sys.name);
    await new Promise(r => setTimeout(r, 260));

    this.audio.startAmbience('surface-' + (sys.biome === 'glacier' ? 'ice' : 'rocky'));
    this.audio.startMusic('discovery');
    this.audio.setSpace('canyon');

    // showScreen swaps the active modal, but the loading overlay has to be
    // dismissed explicitly or it stays composited over the HUD.
    this.ui.hideScreen?.('loading');
    this.ui.showScreen('hud');
    await this.ui.fadeTo(null, 1200);
    this.state = STATE.PLAY;
    this._updateObjective();
    this.input.requestLock();
  }

  _applyWorldGrade() {
    const b = this.world.biome, p = this.engine.post.params;
    p.fogColor.setRGB(...b.fogColor);
    p.fogDensity = b.fogDensity;
    p.fogHeight = 420;
    p.fogMaxDist = 3000;
    p.lightShaftStrength = 0.30;
    p.sunDir = this.world.sunDir.clone();
    p.sunColor.copy(this.world.sunColor);
    p.dofStrength = 0.14;
    p.dofFocus = 40; p.dofRange = 120;
    p.bloomStrength = 0.05;
    p.vignetteAmount = 0.28;
    p.autoExposureMax = 1.35;
    p.autoExposureMin = 0.45;
    p.exposure = 0.85;
    p.autoExposure = true;
  }

  _teardownWorld() {
    if (this.world) { this.world.dispose(); this.world = null; }
  }

  /* ---------------- gameplay ---------------- */

  _toggleFlight() {
    const next = this.controller.mode === 'walk' ? 'fly' : 'walk';
    this.controller.setMode(next);
    this.audio.play(next === 'fly' ? 'ship.boost' : 'land');
    this.ui.hud.showToast({
      title: next === 'fly' ? 'THRUSTERS ENGAGED' : 'GROUNDED',
      body: next === 'fly' ? 'Space / Ctrl to climb and dive · Shift to burn' : 'Surface traversal',
      kind: 'info',
    });
  }

  _beginScan() {
    if (this.scanning || this.state !== STATE.PLAY) return;
    const hit = this.world?.nearest(this.controller.position, 24);
    if (!hit) return;
    this.scanning = { target: hit.target, t: 0 };
    this.audio.play('scan.start');
  }

  _cancelScan() {
    if (this.scanning && this.scanning.t < 1) this.ui.hud.setScanProgress(null);
    this.scanning = null;
  }

  _completeScan(target) {
    target.scanned = true;
    this.progress.scanned.add(target.label);
    this.audio.play('scan.success');

    if (target.kind === 'anchor') {
      this.audio.play('discover.major');
      this.ui.hud.pushDiscovery({ kind: 'ANCHOR SYNCED', text: target.label });
      if (target.lore) this.ui.hud.showSubtitle(target.lore, 7000);
      this.progress.codex.push({
        category: 'Lore', title: `${this.world.system.name} — ${target.label}`,
        body: target.lore, system: this.world.system.name,
      });
      const remaining = this.world.anchors.filter(a => !a.scanned).length;
      if (remaining === 0) this._onAllAnchors();
    } else {
      this.audio.play('discover.minor');
      this.ui.hud.pushDiscovery({ kind: target.category.toUpperCase(), text: target.label });
      this.progress.codex.push({
        category: target.category, title: target.label,
        body: `Catalogued on ${this.world.system.name}.`, system: this.world.system.name,
      });
    }
    this.ui.codex.setData(this._codexData());
    this._updateObjective();
  }

  _onAllAnchors() {
    const sys = this.world.system;
    this.audio.play('key.acquire');
    this.audio.duckFor(3.5, 0.55);
    this.progress.keys.push(sys.id);

    // Unlock the next system and tell the player where it is, without a modal.
    const next = SYSTEMS[this.systemIndex + 1];
    if (next && !this.progress.unlocked.includes(next.id)) this.progress.unlocked.push(next.id);

    this.ui.hud.showToast({
      title: sys.keyName.toUpperCase() + ' RECOVERED',
      body: next ? `Coordinates resolved — ${next.name}. Open the STARMAP (M) to translate.`
                 : 'The lattice is open.',
      kind: 'success',
    });
    this.ui.starmap.setData(this._starmapData());
    if (!next) this._finale();
  }

  async _finale() {
    this.state = STATE.CUTSCENE;
    this.audio.startMusic('finale');
    this.ui.showCinematicBars(true);
    this.ui.hud.showSubtitle('The lattice opens. Every system, every world — yours to wander.', 8000);
    await new Promise(r => setTimeout(r, 8200));
    this.ui.showCinematicBars(false);
    this.ui.showScreen('credits');
  }

  _updateObjective() {
    if (!this.world) return;
    const remaining = this.world.anchors.filter(a => !a.scanned);
    if (remaining.length) {
      const target = remaining[0];
      const d = this.controller.position.distanceTo(target.position);
      this.ui.hud.setObjective(
        `Sync the ${this.world.system.name} anchors`,
        `${this.world.anchors.length - remaining.length}/${this.world.anchors.length} synced · nearest ${(d / 1000).toFixed(2)} km`);
    } else {
      const next = SYSTEMS[this.systemIndex + 1];
      this.ui.hud.setObjective(
        next ? `Translate to ${next.name}` : 'The lattice is open',
        next ? 'Open the STARMAP (M)' : 'Wander freely');
    }
  }

  _openStarmap() {
    this.ui.starmap.setData(this._starmapData());
    this.ui.showScreen('starmap');
    this.input.exitLock();
    this.state = STATE.CUTSCENE;
    this.audio.play('codex.open');
  }
  _openCodex() {
    this.ui.codex.setData(this._codexData());
    this.ui.showScreen('codex');
    this.input.exitLock();
    this.state = STATE.CUTSCENE;
    this.audio.play('codex.open');
  }
  _pause() {
    this.ui.showScreen('pause');
    this.input.exitLock();
    this.state = STATE.CUTSCENE;
  }
  _resume() {
    this.ui.showScreen('hud');
    this.state = STATE.PLAY;
    this.input.requestLock();
  }

  _starmapData() {
    return SYSTEMS.map((s, i) => ({
      id: s.id, name: s.name, distance: s.distance, hazard: s.hazard,
      resources: s.resources, blurb: s.blurb,
      locked: !this.progress.unlocked.includes(s.id),
      current: i === this.systemIndex,
      visited: this.progress.keys.includes(s.id),
    }));
  }

  _codexData() {
    const total = SYSTEMS.length * 25;
    return {
      completion: Math.min(1, this.progress.codex.length / total),
      entries: this.progress.codex,
    };
  }

  async _travelTo(systemId) {
    const idx = SYSTEMS.findIndex(s => s.id === systemId);
    if (idx < 0 || idx === this.systemIndex) { this._resume(); return; }
    if (!this.progress.unlocked.includes(SYSTEMS[idx].id)) {
      this.ui.hud.showToast({ title: 'NO COORDINATES', body: 'Sync this system\'s anchors first.', kind: 'error' });
      return;
    }
    this.state = STATE.CUTSCENE;
    this.ui.showCinematicBars(true);
    this.audio.play('ship.warpCharge');
    this.audio.startMusic('warp');

    // Warp: a continuous camera move into a fade, never a hard cut.
    this._warp = { t: 0, dur: 2.6 };
    await new Promise(r => setTimeout(r, 1500));
    this.audio.play('ship.warpJump');
    await this.ui.fadeTo('#dbeeff', 700);
    this._warp = null;
    await this.ui.fadeTo('#000000', 10);
    await this._loadSystem(idx);
    this.ui.showCinematicBars(false);
  }

  /* ---------------- frame ---------------- */

  // Call after any discontinuous camera/player move. TAA and motion blur both
  // reproject through the previous frame's matrices; without this a teleport
  // produces a full-screen smear and a ghost trail.
  invalidateHistory() {
    this.engine.post._historyValid = false;
    this._skipMotionBlur = 2;
  }

  frame(dt) {
    this._clock += dt;
    const e = this.engine;
    if (this._skipMotionBlur > 0) {
      this._skipMotionBlur--;
      e.post.params.motionBlurStrength = 0;
    } else if (!this._warp) {
      e.post.params.motionBlurStrength = 0.32;
    }

    if (this.state === STATE.CREATOR) {
      // Slow turntable so the avatar is always readable from a new angle.
      if (this.avatar) this.avatar.group.rotation.y += dt * 0.22;
      if (this._creatorRing) this._creatorRing.rotation.z += dt * 0.6;
      const r = 2.7, h = 1.15;
      e.camera.position.set(Math.sin(0.35) * r, h, Math.cos(0.35) * r);
      e.camera.lookAt(0, h * 0.92, 0);
    } else if (this.state === STATE.PLAY) {
      this.controller.update(dt);
      this.world?.update(dt, e.camera);
      this._updatePlayHud(dt);
      // Keep the avatar under the camera in third person.
      if (this.avatar) {
        this.avatar.group.position.copy(this.controller.position);
        this.avatar.group.rotation.y = this.controller.yaw + Math.PI;
        this.avatar.group.visible = this.controller._camDistCur > 0.8;
      }
    } else if (this._warp) {
      this._warp.t += dt;
      const t = this._warp.t / this._warp.dur;
      e.camera.position.addScaledVector(
        new THREE.Vector3(0, 0, -1).applyQuaternion(e.camera.quaternion), dt * 240 * t * t);
      e.post.params.chromaticAmount = 0.28 + t * 2.4;
      e.post.params.motionBlurStrength = 0.32 + t * 1.6;
    }

    if (!this._warp && this.state !== STATE.PLAY) {
      e.post.params.chromaticAmount = 0.28;
      e.post.params.motionBlurStrength = 0.32;
    }

    this.sky.update(dt, e.camera, e._size);
    this.audio.update(dt, {
      pos: e.camera.position, quat: e.camera.quaternion,
      vel: this.controller.velocity,
    });

    e.render(dt);
  }

  _updatePlayHud(dt) {
    const hud = this.ui.hud, c = this.controller, w = this.world;
    if (!w) return;

    // Scanning.
    const hit = w.nearest(c.position, 24);
    if (this.scanning) {
      const stillNear = c.position.distanceTo(this.scanning.target.position) < 30;
      if (!stillNear) { this._cancelScan(); }
      else {
        this.scanning.t += dt / (this.scanning.target.kind === 'anchor' ? 2.2 : 1.1);
        hud.setScanProgress(Math.min(1, this.scanning.t));
        if (this.scanning.t >= 1) {
          const t = this.scanning.target;
          this.scanning = null;
          hud.setScanProgress(null);
          this._completeScan(t);
        }
      }
    } else {
      hud.setPrompt(hit ? `Hold E · Scan ${hit.target.label}` : null);
    }

    hud.setSpeed(Math.round(c.speed * (c.mode === 'fly' ? 1 : 1)));
    hud.setCoords(`${w.system.name.toUpperCase()} · ${c.position.x.toFixed(0)} / ${c.position.z.toFixed(0)} · ALT ${Math.round(c.position.y)} M`);

    // Compass markers point at unscanned anchors — the only nav aid the player
    // gets, and it only confirms what the silhouettes already show.
    const markers = w.anchors.filter(a => !a.scanned).map(a => {
      const dx = a.position.x - c.position.x, dz = a.position.z - c.position.z;
      return { az: Math.atan2(dx, dz), dist: Math.hypot(dx, dz), type: 'anchor', label: 'ANCHOR' };
    });
    hud.setCompass(c.yaw, markers);

    this._objTimer = (this._objTimer || 0) + dt;
    if (this._objTimer > 0.5) { this._objTimer = 0; this._updateObjective(); }

    const o2 = 100, integ = 100;
    hud.setVitals({ o2, integrity: integ, energy: Math.round(60 + 40 * Math.sin(this._clock * 0.2)) });
  }
}

/* --------------------------------------------------------------------- */

const canvas = document.getElementById('scene');
const game = new Game(canvas);
window.__game = game;

// `?manual` stops the automatic loop so the verification harness can drive
// frames one at a time. A busy rAF loop starves the driver's own polling under
// software rasterisation, which makes every wait time out.
const MANUAL = new URLSearchParams(location.search).has('manual');

// Adaptive resolution trades pixels for frame time. That is right on real
// hardware, but under software rasterisation the budget is never met, so it
// pins to its 0.55 floor and every frame is upscaled from 55% — which reads as
// a heavy uniform blur over the whole image, including on the in-focus subject.
// Manual mode is only ever used for verification captures, so it renders at
// native resolution.
if (MANUAL) game.engine.setAdaptive(false);

let last = performance.now();
let running = true;
function loop() {
  if (!running) return;
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  try {
    game.frame(dt);
  } catch (err) {
    running = false;
    console.error('Frame error:', err);
    throw err;
  }
  requestAnimationFrame(loop);
}
if (!MANUAL) requestAnimationFrame(loop);

// Test hook: lets the verification harness drive frames deterministically.
window.__step = (n = 1, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) game.frame(dt);
  return {
    state: game.state,
    draws: game.engine.stats.drawCalls,
    tris: game.engine.stats.triangles,
    fps: +game.engine.stats.fps.toFixed(1),
  };
};
window.__ready = true;
