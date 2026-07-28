// Drives the real game through its actual flow and captures each stage.
// Uses ?manual so the page is idle between steps — under software rasterisation
// a busy rAF loop makes every screenshot and evaluate crawl.
import { launch } from './shoot.mjs';

const SHOTS = '/home/user/Windows-Debloat-Tool/tools/_shots/';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const b = await launch();
const p = await b.newPage({ viewport: { width: W, height: H } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('CONSOLE: ' + m.text().slice(0, 400)); });

const ev = (fn, arg) => p.evaluate(fn, arg).catch(e => { errs.push('EVAL: ' + e.message); return null; });
const step = (n = 4) => ev(k => window.__step(k), n);
const shot = async (name) => { await p.screenshot({ path: SHOTS + 'play-' + name + '.png', timeout: 240000 }); console.log('  shot', name); };

await p.goto('http://localhost:8099/index.html?manual', { waitUntil: 'domcontentloaded' });
await p.waitForFunction('window.__ready===true', { timeout: 60000 });

await step(3); await shot('01-boot');

await ev(() => window.__game.ui.showScreen('title'));
await p.waitForTimeout(900); await step(4); await shot('02-title');

await ev(() => window.__game._enterCreator());
await p.waitForTimeout(900); await step(6); await shot('03-creator');

await ev(() => window.__game._materialize({}));
// The load path awaits fades and timeouts; pump frames while it settles.
for (let i = 0; i < 8; i++) { await p.waitForTimeout(900); await step(2); }
console.log('state after materialize', await ev(() => window.__game?.state));
await step(6); await shot('04-surface');

await ev(() => { const g = window.__game; g.controller.yaw += 1.2; g.controller.pitch = -0.04; g.invalidateHistory(); });
await step(6); await shot('05-surface-b');

await ev(() => { const g = window.__game; g.controller.camDistance = 6.5; g.controller.pitch = -0.20; g.invalidateHistory(); });
await step(6); await shot('06-thirdperson');

// Walk forward toward an anchor and re-shoot.
await ev(() => {
  const g = window.__game, a = g.world.anchors[0];
  g.controller.position.set(a.position.x - 90, 0, a.position.z - 90);
  g.controller.position.y = g.world.terrain.heightAt(g.controller.position.x, g.controller.position.z);
  g.controller.yaw = Math.atan2(a.position.x - g.controller.position.x, a.position.z - g.controller.position.z);
  g.controller.pitch = 0.02;
  g.invalidateHistory();
});
await step(8); await shot('07-anchor');

console.log('final', await ev(() => ({
  state: window.__game.state,
  pos: window.__game.controller.position.toArray().map(v => +v.toFixed(1)),
  draws: window.__game.engine.stats.drawCalls,
  tris: window.__game.engine.stats.triangles,
  anchors: window.__game.world?.anchors.length,
  curios: window.__game.world?.curios.length,
})));
console.log('ERRORS:', errs.length); errs.slice(0, 10).forEach(e => console.log(' -', e));
await b.close();
