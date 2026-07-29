// Captures only the framings still missing from a round.
//
// The main capture script's resume skips the screenshot but still re-renders
// every earlier framing, which under software rasterisation is too slow to
// finish inside one command timeout. This jumps straight to the missing work.
//
//   node tools/judge/capture-rest.mjs <round> [width] [height]
import { launch } from '../shoot.mjs';
import { existsSync, mkdirSync } from 'fs';

const ROUND = process.argv[2] || '1';
const W = +(process.argv[3] || 1600), H = +(process.argv[4] || 900);
const DIR = `/home/user/Windows-Debloat-Tool/tools/judge/shots/round-${ROUND}`;
mkdirSync(DIR, { recursive: true });

const errors = [];
const need = (n) => !existsSync(`${DIR}/${n}.png`);

const browser = await launch();
const attach = (p) => {
  p.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/404 \(Not Found\)|favicon/.test(t)) return;
    errors.push('CONSOLE: ' + t.slice(0, 300));
  });
};

const GAME_SHOTS = ['09-companion-sky', '10-scan', '11-starmap', '12-codex', '13-pause'];

if (GAME_SHOTS.some(need)) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  attach(page);
  const ev = (f, a) => page.evaluate(f, a).catch((e) => { errors.push('EVAL: ' + e.message); return null; });
  const step = (n = 4) => ev((k) => window.__step(k), n);
  const shot = async (name) => {
    await page.screenshot({ path: `${DIR}/${name}.png`, timeout: 240000 });
    console.log('  ', name);
  };

  await page.goto('http://localhost:8099/index.html?manual', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready===true', { timeout: 60000 });
  console.log('   game ready, materialising...');
  await ev(() => window.__game._materialize({}));
  for (let i = 0; i < 9; i++) { await page.waitForTimeout(900); await step(1); }
  console.log('   on surface');

  if (need('09-companion-sky')) {
    await ev(() => {
      const g = window.__game, c = g.world.system.companion;
      g.controller.yaw = c.azimuth; g.controller.pitch = -c.elevation;
      g.invalidateHistory();
    });
    await step(5); await shot('09-companion-sky');
  }
  if (need('10-scan')) {
    await ev(() => {
      const g = window.__game, c = g.world.curios[0];
      g.controller.position.set(c.position.x - 6, 0, c.position.z - 6);
      g.controller.position.y = g.world.terrain.heightAt(g.controller.position.x, g.controller.position.z);
      g.controller.yaw = Math.atan2(c.position.x - g.controller.position.x, c.position.z - g.controller.position.z);
      g.controller.pitch = -0.15;
      g.controller.camDistance = 3.0; g.controller._camDistCur = 3.0;
      g.invalidateHistory(); g._beginScan();
    });
    await step(5);
    await ev(() => window.__game.ui.hud.setScanProgress(0.62));
    await step(1); await shot('10-scan');
  }
  if (need('11-starmap')) {
    await ev(() => window.__game._openStarmap());
    await page.waitForTimeout(900); await step(3); await shot('11-starmap');
  }
  if (need('12-codex')) {
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
    await page.waitForTimeout(900); await step(3); await shot('12-codex');
  }
  if (need('13-pause')) {
    await ev(() => window.__game._pause());
    await page.waitForTimeout(700); await step(3); await shot('13-pause');
  }
  await page.close();
}

const VIEWS = [
  ['14-orbit-day', 3.2, -0.55, 0.25, 'terran'],
  ['15-orbit-limb', 1.55, -0.85, 0.10, 'terran'],
  ['16-orbit-crescent', 2.6, 0.80, 0.10, 'terran'],
  ['17-orbit-ice', 2.4, -0.60, 0.20, 'ice'],
];

if (VIEWS.some((v) => need(v[0]))) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  attach(page);
  const ev = (f, a) => page.evaluate(f, a).catch((e) => { errors.push('EVAL(planet): ' + e.message); return null; });
  await page.goto('http://localhost:8099/tools/planet-test.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready===true', { timeout: 90000 });
  for (const [name, d, sx, sy, t] of VIEWS) {
    if (!need(name)) continue;
    await ev(([dd, x, y, tt]) => {
      window.__setType?.(tt);
      window.__setDist?.(dd);
      window.__setSun?.(x, y);
      window.__engine.post._historyValid = false;
    }, [d, sx, sy, t]);
    await ev(() => window.__step(5));
    await page.screenshot({ path: `${DIR}/${name}.png`, timeout: 240000 });
    console.log('  ', name);
  }
  await page.close();
}

await browser.close();
console.log('errors:', errors.length);
errors.slice(0, 8).forEach((e) => console.log('  -', e));
console.log('REST-CAPTURE-DONE');
