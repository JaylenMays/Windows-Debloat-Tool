/* AETHERIUM — root UI controller.
 * Contract: src/ui/*  (see CONTRACTS.md §C)
 *
 *   const ui = new UI(document.body);
 *   ui.showScreen('title');
 *   ui.hud.setVitals({o2:88, integrity:100, energy:64});
 *
 * Events (CustomEvent, dispatched on the UI instance AND bubbled from the root element):
 *   ui:start · ui:creator-change · ui:creator-done · ui:travel · ui:resume · ui:setting · ui:quit
 * Plus `ui:sfx` {name} on every hover / click / back / confirm for the audio engine.
 */
import { injectStyles } from './styles.js';
import { el, NavManager, bindHoverFocus, setSfxTarget, sfx, clamp } from './widgets.js';
import { buildBoot } from './boot.js';
import { buildTitle } from './title.js';
import { buildCreator, DEFAULT_SCHEMA } from './creator.js';
import { buildLoading } from './loading.js';
import { buildHUD } from './hud.js';
import { buildCodex } from './codex.js';
import { buildStarmap } from './starmap.js';
import { buildPause, buildSettings } from './pause.js';
import { buildCredits } from './credits.js';

const MODAL = ['boot', 'title', 'creator', 'loading', 'codex', 'starmap', 'pause', 'settings', 'credits'];

// Screens that can be opened while the player is in the world. Opening one
// hides the HUD; closing it restores the HUD via showScreen('hud').
const MODAL_OVER_HUD = new Set(['starmap', 'codex', 'pause', 'settings', 'credits']);

export class UI extends EventTarget {
  constructor(root = document.body) {
    super();
    injectStyles(root.ownerDocument || document);

    this.el = el('div', { class: 'ae-root', 'data-ae': 'root' });
    root.appendChild(this.el);
    setSfxTarget(this.el);

    this.nav = new NavManager(this.el);
    bindHoverFocus(this.nav, this.el);

    /* global overlays */
    this._bars = el('div', { class: 'ae-bars' }, el('i', { class: 'ae-bars__t' }), el('i', { class: 'ae-bars__b' }));
    this._fade = el('div', { class: 'ae-fade' });

    /* screens */
    this.screens = {
      boot: buildBoot(this),
      title: buildTitle(this),
      creator: buildCreator(this),
      loading: buildLoading(this),
      hud: buildHUD(this),
      codex: buildCodex(this),
      starmap: buildStarmap(this),
      pause: buildPause(this),
      settings: buildSettings(this),
      credits: buildCredits(this),
    };
    for (const k of Object.keys(this.screens)) this.el.appendChild(this.screens[k]);
    this.el.appendChild(this._bars);
    this.el.appendChild(this._fade);

    this.active = null;      // active modal screen name
    this._stack = [];        // back-navigation stack
    this._navLayer = null;

    /* ── HUD facade (contract shape) ── */
    const h = this.screens.hud.api;
    this.hud = {
      setVitals: (v) => h.setVitals(v),
      setObjective: (t, s) => h.setObjective(t, s),
      setCompass: (rad, mk) => h.setCompass(rad, mk),
      setSector: (s) => h.setSector(s),
      showToast: (o) => h.showToast(o),
      showSubtitle: (t, ms) => h.showSubtitle(t, ms),
      setScanProgress: (t) => h.setScanProgress(t),
      setPrompt: (t) => h.setPrompt(t),
      setSpeed: (v) => h.setSpeed(v),
      setCoords: (s) => h.setCoords(s),
      setReticle: (s) => h.setReticle(s),
      setDiscoveryLog: (e) => h.setDiscoveryLog(e),
      pushDiscovery: (e) => h.pushDiscovery(e),
      show: () => this.showHUD(true),
      hide: () => this.showHUD(false),
    };

    /* ── creator facade: `ui.creator.schema = [...]` ── */
    const creatorEl = this.screens.creator;
    let _schema = DEFAULT_SCHEMA;
    this.creator = {
      get schema() { return _schema; },
      set schema(v) { _schema = v; creatorEl.setSchema(v); },
      getConfig: () => creatorEl.getConfig(),
      randomize: () => creatorEl.randomize(),
      reset: () => creatorEl.reset(),
    };

    /* ── codex facade: `ui.codex.previewSlot` ── */
    const codexEl = this.screens.codex;
    this.codex = {
      previewSlot: codexEl.previewSlot,
      setData: (d) => codexEl.setData(d),
      getSelected: () => codexEl.getSelected(),
      onSelect: (fn) => codexEl.addEventListener('codex:select', (e) => fn(e.detail.entry)),
    };
    const smEl = this.screens.starmap;
    this.starmap = {
      setData: (d) => smEl.setData(d),
      getSelected: () => smEl.getSelected(),
      onSelect: (fn) => smEl.addEventListener('starmap:select', (e) => fn(e.detail.system)),
    };
    this.settings = {
      getValues: () => this.screens.settings.getValues(),
      setValues: (v) => this.screens.settings.setValues(v),
      emitAll: () => this.screens.settings.emitAll(),
    };
    this.loading = {
      setProgress: (p, phase, detail) => this.screens.loading.setProgress(p, phase, detail),
      simulate: (ms) => this.screens.loading.simulate(ms),
    };

    /* reduced motion follows the accessibility setting as well as the OS */
    this.addEventListener('ui:setting', (e) => {
      if (e.detail.key === 'reducedMotion') this.setReducedMotion(!!e.detail.value);
      if (e.detail.key === 'hudOpacity') this.screens.hud.style.opacity = String(e.detail.value);
    });

    window.addEventListener('resize', () => this.nav.refresh());
  }

  /* ───────── events ───────── */
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
    this.el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
    return this;
  }
  on(type, fn) { this.addEventListener(type, (e) => fn(e.detail, e)); return this; }

  /* ───────── screens ───────── */
  showScreen(name, data) {
    const s = this.screens[name];
    if (!s) return this;

    // The HUD is a persistent layer, not a member of the modal stack. Showing
    // it therefore has to explicitly dismiss whatever modal is up — otherwise
    // the title or loading screen stays composited on top of live gameplay,
    // and its text collides with the HUD's.
    if (name === 'hud') {
      if (this.active) this.hideScreen(this.active);
      this._stack.length = 0;
      return this.showHUD(true);
    }

    // Conversely, a modal opened from gameplay hides the HUD, so the two can
    // never write to the same pixels.
    if (MODAL_OVER_HUD.has(name)) this.showHUD(false);

    if (this.active && this.active !== name) {
      const prev = this.screens[this.active];
      prev.removeAttribute('data-active');
      prev.onExit && prev.onExit();
      if (!(data && data.replace)) this._stack.push(this.active);
    }
    if (this._navLayer) { this.nav.pop(this._navLayer); this._navLayer = null; }

    this.active = name;
    // restart entry animations
    s.removeAttribute('data-active');
    void s.offsetWidth;
    s.setAttribute('data-active', '');
    s.onEnter && s.onEnter(data);
    if (name === 'boot' && s.play) s.play().then(() => this.emit('ui:boot-done', {}));
    if (name === 'settings' && data && data.from) this._settingsFrom = data.from;

    this._navLayer = s;
    this.nav.push(s, () => this.back());
    return this;
  }

  hideScreen(name) {
    const s = this.screens[name];
    if (!s) return this;
    if (name === 'hud') return this.showHUD(false);
    s.removeAttribute('data-active');
    s.onExit && s.onExit();
    if (this.active === name) {
      this.active = null;
      if (this._navLayer) { this.nav.pop(this._navLayer); this._navLayer = null; }
    }
    return this;
  }

  showHUD(on = true) {
    const s = this.screens.hud;
    if (on) { s.setAttribute('data-active', ''); } else { s.removeAttribute('data-active'); }
    return this;
  }

  back() {
    const cur = this.active;
    if (cur === 'pause') { this.emit('ui:resume', {}); return this; }
    if (cur === 'title' || cur === 'boot' || cur === 'loading') return this;
    const prev = this._stack.pop();
    if (prev) this.showScreen(prev, { replace: true });
    else if (cur === 'creator') this.showScreen('title', { replace: true });
    else this.hideScreen(cur);
    return this;
  }

  /* ───────── cinematic helpers ───────── */
  showCinematicBars(on) {
    if (on) this._bars.setAttribute('data-on', ''); else this._bars.removeAttribute('data-on');
    return this;
  }

  /** Fade the whole overlay to `color` (or back out with null/'transparent'). */
  fadeTo(color, ms = 600) {
    const f = this._fade;
    const out = !color || color === 'transparent' || color === 'none';
    if (!out) f.style.background = color;
    const from = parseFloat(getComputedStyle(f).opacity) || 0;
    const to = out ? 0 : 1;
    const d = Math.max(0, ms);
    if (this._fadeAnim) { try { this._fadeAnim.cancel(); } catch (_) {} }
    f.style.opacity = String(to);
    if (!d || !f.animate) return Promise.resolve();
    const a = f.animate([{ opacity: from }, { opacity: to }],
      { duration: d, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'both' });
    this._fadeAnim = a;
    return a.finished.then(() => { a.cancel(); this._fadeAnim = null; }, () => {});
  }

  setReducedMotion(on) {
    if (on) this.el.setAttribute('data-rm', ''); else this.el.removeAttribute('data-rm');
    return this;
  }

  /* ───────── data ───────── */
  setCodex(data) { this.screens.codex.setData(data); return this; }
  setStarmap(data) { this.screens.starmap.setData(data); return this; }

  dispose() {
    this.nav.dispose();
    this.screens.hud.api.dispose();
    this.screens.loading.dispose && this.screens.loading.dispose();
    this.el.remove();
  }
}

export default UI;
