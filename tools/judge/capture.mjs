// Deterministic shot sheet for the visual judge.
//
// Captures the same framings every round so successive judgements are
// comparable. Runs the REAL game (not a mock scene) in ?manual mode: under
// software rasterisation a busy rAF loop starves the driver and every
// screenshot times out.
//
//   node tools/judge/capture.mjs <round> [width] [height]
//
// Output: tools/judge/shots/round-<n>/NN-name.png
import { launch } from '../shoot.mjs';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

const ROUND = process.argv[2] || '1';
const W = +(process.argv[3] || 1280);
const H = +(process.argv[4] || 720);
const DIR = `/home/user/Windows-Debloat-Tool/tools/judge/shots/round-${ROUND}`;
mkdirSync(DIR, { recursive: true });

const errors = [];
const manifest = [];

function attach(page) {
  page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/404 \(Not Found\)|favicon/.test(t)) return;
    errors.push('CONSOLE: ' + t.slice(0, 400));
  });
}

const browser = await launch();

/* ------------------------------------------------------------------ *
 * 1. The game itself
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  attach(page);
  const ev = (fn, a) => page.evaluate(fn, a).catch(e => { errors.push('EVAL: ' + e.message); return null; });
  const step = (n = 5) => ev(k => window.__step(k), n);
  const shot = async (name, note) => {
    manifest.push({ file: name + '.png', note });
    if (existsSync(`${DIR}/${name}.png`)) { console.log('   (skip)', name); return; }
    await page.screenshot({ path: `${DIR}/${name}.png`, timeout: 240000 });
    console.log('  ', name);
  };

  await page.goto('http://localhost:8099/index.html?manual', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready===true', { timeout: 60000 });

  await step(3);
  await shot('01-boot', 'Cold boot / neural-link calibration screen');

  await ev(() => window.__game.ui.showScreen('title'));
  await page.waitForTimeout(1200); await step(5);
  await shot('02-title', 'Main menu over the live 3D background');

  await ev(() => window.__game._enterCreator());
  await page.waitForTimeout(1200); await step(5);
  await shot('03-creator', 'Character creator, full body, studio 3-point rig');

  // Face close-up with DOF refocused for the shorter camera distance.
  await ev(() => {
    const g = window.__game;
    g.avatarConfig.helmet = 'Off';
    g._rebuildAvatar();
    const p = g.engine.post.params;
    p.dofFocus = 0.85; p.dofRange = 0.7; p.dofStrength = 0.55;
    g._creatorCam = { r: 0.78, h: 1.60 };
  });
  await ev(() => {
    const g = window.__game, e = g.engine;
    // Freeze the turntable and frame the head for a like-for-like face shot.
    g.avatar.group.rotation.y = 0.25;
    e.camera.position.set(Math.sin(0.25) * 0.8, 1.60, Math.cos(0.25) * 0.8);
    e.camera.lookAt(0, 1.58, 0);
    g._frozenCam = true;
    g.invalidateHistory();
  });
  await step(5);
  await shot('04-creator-face', 'Character creator, face close-up (helmet off)');

  await ev(() => { const g = window.__game; g._frozenCam = false; g.avatarConfig.helmet = 'Visor'; g._rebuildAvatar(); });

  await ev(() => window.__game._materialize({}));
  for (let i = 0; i < 9; i++) { await page.waitForTimeout(900); await step(2); }
  await step(5);
  await shot('05-surface-wide', 'Planet surface, third person, low raking sun');

  await ev(() => {
    const g = window.__game;
    g.controller.yaw += 1.35; g.controller.pitch = 0.06;
    g.invalidateHistory();
  });
  await step(5);
  await shot('06-surface-vista', 'Surface vista toward the horizon and sky');

  // First person.
  await ev(() => {
    const g = window.__game;
    g.controller.camDistance = 0.0; g.controller._camDistCur = 0.0;
    g.controller.pitch = -0.02;
    g.invalidateHistory();
  });
  await step(5);
  await shot('07-first-person', 'First person surface view with HUD');

  // Anchor landmark, framed.
  await ev(() => {
    const g = window.__game, a = g.world.anchors[0];
    g.controller.camDistance = 4.5; g.controller._camDistCur = 4.5;
    g.controller.position.set(a.position.x - 55, 0, a.position.z - 55);
    g.controller.position.y = g.world.terrain.heightAt(g.controller.position.x, g.controller.position.z);
    g.controller.yaw = Math.atan2(a.position.x - g.controller.position.x, a.position.z - g.controller.position.z);
    g.controller.pitch = 0.10;
    g.invalidateHistory();
  });
  await step(5);
  await shot('08-anchor', 'Anchor monolith landmark, close approach');

  // Companion planet in the sky.
  await ev(() => {
    const g = window.__game, c = g.world.system.companion;
    g.controller.yaw = c.azimuth; g.controller.pitch = -c.elevation;
    g.invalidateHistory();
  });
  await step(5);
  await shot('09-companion-sky', 'Companion world hanging in the sky from the surface');

  // Scan interaction with the HUD in its detailed state.
  await ev(() => {
    const g = window.__game, c = g.world.curios[0];
    g.controller.position.set(c.position.x - 6, 0, c.position.z - 6);
    g.controller.position.y = g.world.terrain.heightAt(g.controller.position.x, g.controller.position.z);
    g.controller.yaw = Math.atan2(c.position.x - g.controller.position.x, c.position.z - g.controller.position.z);
    g.controller.pitch = -0.15;
    g.controller.camDistance = 3.0; g.controller._camDistCur = 3.0;
    g.invalidateHistory();
    g._beginScan();
  });
  await step(6);
  await ev(() => window.__game.ui.hud.setScanProgress(0.62));
  await step(2);
  await shot('10-scan', 'Scanning a curiosity — HUD in its detailed state');

  // Menus over live gameplay.
  await ev(() => window.__game._openStarmap());
  await page.waitForTimeout(900); await step(4);
  await shot('11-starmap', 'Starmap / travel screen');

  await ev(() => {
    const g = window.__game;
    g.progress.codex = [
      { category: 'Lore', title: 'Kestrel III — Anchor I', body: 'I built the lattice so that nobody would have to be only where they were born.', system: 'Kestrel III' },
      { category: 'Mineral', title: 'Vitrified silicate', body: 'Catalogued on Kestrel III.', system: 'Kestrel III' },
      { category: 'Flora', title: 'Rime lichen', body: 'Catalogued on Kestrel III.', system: 'Kestrel III' },
      { category: 'Relic', title: 'Founder-era marker', body: 'Catalogued on Kestrel III.', system: 'Kestrel III' },
    ];
    g._openCodex();
  });
  await page.waitForTimeout(900); await step(4);
  await shot('12-codex', 'Codex / encyclopedia screen');

  await ev(() => window.__game._pause());
  await page.waitForTimeout(700); await step(4);
  await shot('13-pause', 'Pause and settings');

  await page.close();
}

/* ------------------------------------------------------------------ *
 * 2. Orbital planet views (the standalone planet harness)
 * ------------------------------------------------------------------ */
{
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  attach(page);
  const ev = (fn, a) => page.evaluate(fn, a).catch(e => { errors.push('EVAL(planet): ' + e.message); return null; });
  const shot = async (name, note) => {
    manifest.push({ file: name + '.png', note });
    if (existsSync(`${DIR}/${name}.png`)) { console.log('   (skip)', name); return; }
    await page.screenshot({ path: `${DIR}/${name}.png`, timeout: 240000 });
    console.log('  ', name);
  };

  await page.goto('http://localhost:8099/tools/planet-test.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready===true', { timeout: 90000 });

  const views = [
    ['14-orbit-day', [3.2, -0.55, 0.25], 'terran', 'Terran world, full disc, day side'],
    ['15-orbit-limb', [1.55, -0.85, 0.10], 'terran', 'Close limb, atmosphere edge-on against space'],
    ['16-orbit-crescent', [2.6, 0.80, 0.10], 'terran', 'Crescent near the terminator'],
    ['17-orbit-ice', [2.4, -0.60, 0.20], 'ice', 'Ice world'],
  ];
  for (const [name, [dist, sx, sy], type, note] of views) {
    await ev(([d, x, y, t]) => {
      window.__setType?.(t);
      window.__setDist?.(d);
      window.__setSun?.(x, y);
      window.__engine.post._historyValid = false;
    }, [dist, sx, sy, type]);
    await ev(() => window.__step(5));
    await shot(name, note);
  }
  await page.close();
}

await browser.close();

writeFileSync(`${DIR}/MANIFEST.json`, JSON.stringify({ round: ROUND, width: W, height: H, shots: manifest, errors }, null, 2));
console.log(`\n${manifest.length} shots -> ${DIR}`);
console.log('console/page errors during capture:', errors.length);
errors.slice(0, 10).forEach(e => console.log('  -', e));
