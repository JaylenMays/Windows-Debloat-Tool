// Fresh hero frames at native resolution.
import { launch } from './shoot.mjs';

const OUT = '/home/user/Windows-Debloat-Tool/tools/_shots/';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });

const ev = (f, a) => p.evaluate(f, a).catch(e => { errs.push('EVAL ' + e.message); return null; });
const step = (n = 5) => ev(k => window.__step(k), n);
const shot = async (n) => { await p.screenshot({ path: OUT + 'show-' + n + '.png', timeout: 240000 }); console.log('  ', n); };

await p.goto('http://localhost:8099/index.html?manual', { waitUntil: 'domcontentloaded' });
await p.waitForFunction('window.__ready===true', { timeout: 60000 });
console.log('render scale:', await ev(() => window.__game.engine.stats.renderScale));

await ev(() => window.__game.ui.showScreen('title'));
await p.waitForTimeout(1200); await step(5); await shot('01-title');

await ev(() => window.__game._enterCreator());
await p.waitForTimeout(1200); await step(6); await shot('02-creator');

await ev(() => window.__game._materialize({}));
for (let i = 0; i < 9; i++) { await p.waitForTimeout(900); await step(1); }
await step(6); await shot('03-surface');

await ev(() => {
  const g = window.__game, a = g.world.anchors[0];
  g.controller.camDistance = 5.0; g.controller._camDistCur = 5.0;
  g.controller.position.set(a.position.x - 48, 0, a.position.z - 48);
  g.controller.position.y = g.world.terrain.heightAt(g.controller.position.x, g.controller.position.z);
  g.controller.yaw = Math.atan2(a.position.x - g.controller.position.x, a.position.z - g.controller.position.z);
  g.controller.pitch = 0.13;
  g.invalidateHistory();
});
await step(6); await shot('04-anchor');

await ev(() => {
  const g = window.__game, c = g.world.system.companion;
  g.controller.yaw = c.azimuth; g.controller.pitch = -c.elevation;
  g.invalidateHistory();
});
await step(6); await shot('05-companion');

console.log('errors:', errs.length);
errs.slice(0, 5).forEach(e => console.log('  -', e));
await b.close();
