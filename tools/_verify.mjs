import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:8093/tools/ui-test.html?bare=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ready === true);

const ok = [];
const fail = [];
const t = (name, cond) => (cond ? ok : fail).push(name);

/* contract surface */
const api = await page.evaluate(() => {
  const u = window.ui;
  return {
    isEventTarget: u instanceof EventTarget,
    methods: ['showScreen', 'hideScreen', 'setCodex', 'setStarmap', 'showCinematicBars', 'fadeTo'].filter((m) => typeof u[m] === 'function'),
    hud: ['setVitals', 'setObjective', 'setCompass', 'showToast', 'showSubtitle', 'setScanProgress',
      'setPrompt', 'setSpeed', 'setCoords', 'setReticle', 'setDiscoveryLog'].filter((m) => typeof u.hud[m] === 'function'),
    previewSlot: !!(u.codex && u.codex.previewSlot instanceof HTMLElement),
    schemaSettable: Array.isArray(u.creator.schema),
  };
});
t('UI extends EventTarget', api.isEventTarget);
t('UI methods (6/6): ' + api.methods.length, api.methods.length === 6);
t('hud methods (11/11): ' + api.hud.length, api.hud.length === 11);
t('codex.previewSlot is an element', api.previewSlot);
t('creator.schema readable/settable', api.schemaSettable);

/* screens all mount */
const screens = ['boot', 'title', 'creator', 'loading', 'hud', 'codex', 'starmap', 'pause', 'settings', 'credits'];
for (const s of screens) {
  const shown = await page.evaluate((n) => {
    window.ui.showScreen(n);
    const el = window.ui.screens[n];
    return el && el.hasAttribute('data-active');
  }, s);
  t('showScreen("' + s + '")', shown);
}

/* custom schema injection (the 3D side's real morph list) */
const custom = await page.evaluate(() => {
  window.ui.creator.schema = [
    { category: 'Rig', key: 'spineTwist', label: 'Spine Twist', type: 'slider', min: -1, max: 1, step: .01, value: 0 },
    { category: 'Rig', key: 'rigTint', label: 'Tint', type: 'color', colors: ['#ff0000', '#00ff00'], value: '#ff0000' },
  ];
  window.ui.showScreen('creator');
  return {
    cats: [...document.querySelectorAll('.ae-cr .ae-cat')].map((n) => n.dataset.cat),
    ctrls: document.querySelectorAll('.ae-cr__scroll .ae-ctl').length,
  };
});
t('creator.schema replaces categories: ' + custom.cats.join(','), custom.cats.length === 1 && custom.cats[0] === 'Rig');
t('creator.schema builds controls: ' + custom.ctrls, custom.ctrls === 2);

/* ── event contract ── */
await page.evaluate(() => { window.__ev = []; ['ui:start','ui:creator-change','ui:creator-done','ui:travel','ui:resume','ui:setting','ui:quit']
  .forEach((k) => window.ui.addEventListener(k, (e) => window.__ev.push([k, e.detail]))); });

// creator-change via keyboard on a slider + creator-done
await page.evaluate(() => {
  const sl = document.querySelector('.ae-cr__scroll .ae-ctl');
  sl.navAxis(1);
  [...document.querySelectorAll('.ae-cr .ae-btn')].find((b) => /materialize/i.test(b.textContent)).click();
});
// travel
await page.evaluate(() => {
  window.ui.showScreen('starmap');
  document.querySelectorAll('.ae-sys')[2].click();
  [...document.querySelectorAll('.ae-sm__info .ae-btn')].find((b) => /travel/i.test(b.textContent)).click();
});
// setting
await page.evaluate(() => {
  window.ui.showScreen('settings');
  document.querySelectorAll('.ae-st__body .ae-ctl')[0].navAxis(1);
});
// resume + quit + start
await page.evaluate(() => {
  window.ui.showScreen('pause');
  [...document.querySelectorAll('.ae-pz .ae-mi')].find((n) => /resume/i.test(n.textContent)).click();
  [...document.querySelectorAll('.ae-pz .ae-mi')].find((n) => /abandon/i.test(n.textContent)).click();
  window.ui.showScreen('title');
  [...document.querySelectorAll('.ae-title .ae-mi')].find((n) => /jack in/i.test(n.textContent)).click();
});

const ev = await page.evaluate(() => window.__ev);
const kinds = new Set(ev.map((e) => e[0]));
for (const k of ['ui:start','ui:creator-change','ui:creator-done','ui:travel','ui:resume','ui:setting','ui:quit'])
  t('event ' + k, kinds.has(k));
const cc = ev.find((e) => e[0] === 'ui:creator-change');
t('ui:creator-change payload {slider,value}', cc && 'slider' in cc[1] && 'value' in cc[1]);
const cd = ev.find((e) => e[0] === 'ui:creator-done');
t('ui:creator-done payload {config}', cd && cd[1] && typeof cd[1].config === 'object');
const tv = ev.find((e) => e[0] === 'ui:travel');
t('ui:travel payload {systemId} = ' + (tv && tv[1].systemId), tv && !!tv[1].systemId);
const st = ev.find((e) => e[0] === 'ui:setting');
t('ui:setting payload {key,value}', st && 'key' in st[1] && 'value' in st[1]);

/* sfx bus */
const sfxKinds = await page.evaluate(() => [...new Set(window.__sfx || [])]);
t('ui:sfx emitted (' + sfxKinds.length + ' kinds incl. ' + sfxKinds.slice(0, 4).join(',') + ')', sfxKinds.length >= 4);

/* fadeTo returns a Promise and resolves */
const fade = await page.evaluate(async () => {
  const p = window.ui.fadeTo('#000', 120);
  const isPromise = p instanceof Promise;
  await p;
  const opa = getComputedStyle(document.querySelector('.ae-fade')).opacity;
  await window.ui.fadeTo(null, 120);
  return { isPromise, opa: +opa, back: +getComputedStyle(document.querySelector('.ae-fade')).opacity };
});
t('fadeTo returns Promise', fade.isPromise);
t('fadeTo(color) → opacity 1 (' + fade.opa + ')', fade.opa > .95);
t('fadeTo(null) → opacity 0 (' + fade.back + ')', fade.back < .05);

/* cinematic bars */
const bars = await page.evaluate(async () => {
  window.ui.showCinematicBars(true);
  await new Promise((r) => setTimeout(r, 700));
  const on = document.querySelector('.ae-bars__t').getBoundingClientRect().bottom;
  window.ui.showCinematicBars(false);
  await new Promise((r) => setTimeout(r, 700));
  return { on, off: document.querySelector('.ae-bars__t').getBoundingClientRect().bottom };
});
t('cinematic bars in (' + Math.round(bars.on) + 'px) / out (' + Math.round(bars.off) + 'px)', bars.on > 50 && bars.off <= 0.5);

/* subtitles + toasts */
const subs = await page.evaluate(async () => {
  window.ui.showHUD(true);
  window.ui.hud.showSubtitle('ARCHIVIST: test line', 400);
  const on = document.querySelector('.ae-sub').hasAttribute('data-on');
  const speaker = document.querySelector('.ae-sub__w').textContent;
  await new Promise((r) => setTimeout(r, 700));
  const off = document.querySelector('.ae-sub').hasAttribute('data-on');
  window.ui.hud.showToast({ title: 't', body: 'b', kind: 'good' });
  return { on, off, speaker, toasts: document.querySelectorAll('.ae-toast').length };
});
t('subtitle shows/auto-hides, speaker parsed = ' + subs.speaker, subs.on && !subs.off && subs.speaker === 'ARCHIVIST');
t('toast created', subs.toasts >= 1);

/* keyboard navigation + visible focus ring */
const kb = await page.evaluate(async () => {
  window.ui.showScreen('title');
  await new Promise((r) => setTimeout(r, 200));
  const press = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  press('ArrowDown'); press('ArrowDown');
  await new Promise((r) => setTimeout(r, 300));
  const f = document.querySelector('.ae-title [data-focus]');
  const ring = f && getComputedStyle(f, '::after');
  return { label: f && f.textContent.trim(), ringOpacity: ring && +ring.opacity, ringBorder: ring && ring.borderTopWidth };
});
t('arrow-key focus moves (' + kb.label + ')', !!kb.label);
t('focus ring visible (opacity ' + kb.ringOpacity + ', border ' + kb.ringBorder + ')', kb.ringOpacity > .3);

/* escape backs out */
const esc = await page.evaluate(async () => {
  window.ui.showScreen('title');
  window.ui.showScreen('codex');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  return window.ui.active;
});
t('escape returns to previous screen (' + esc + ')', esc === 'title');

/* gamepad polling wired to the same focus model */
const pad = await page.evaluate(() => typeof window.ui.nav._poll === 'function' && !!navigator.getGamepads);
t('gamepad polling loop present', pad);

/* reduced motion */
const rm = await page.evaluate(() => {
  window.ui.setReducedMotion(true);
  const v = document.querySelector('.ae-root').hasAttribute('data-rm');
  window.ui.setReducedMotion(false);
  return v;
});
t('reduced motion toggle', rm);

console.log('\n── PASS (' + ok.length + ') ──');
ok.forEach((s) => console.log('  ✓ ' + s));
if (fail.length) { console.log('\n── FAIL (' + fail.length + ') ──'); fail.forEach((s) => console.log('  ✗ ' + s)); }
console.log('\nconsole errors:', errors.length ? errors : 'NONE');
await browser.close();
if (fail.length || errors.length) process.exitCode = 1;
