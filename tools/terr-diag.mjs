// Isolates why the foreground terrain reads dark / shows sky through it.
import { launch } from './shoot.mjs';

const b = await launch();
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
p.on('pageerror', e => console.log('PAGEERR', e.message));
p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 300)); });

await p.goto('http://localhost:8099/index.html?manual', { waitUntil: 'domcontentloaded' });
await p.waitForFunction('window.__ready===true', { timeout: 60000 });
await p.evaluate(() => window.__game._materialize({}));
for (let i = 0; i < 9; i++) { await p.waitForTimeout(800); await p.evaluate(() => window.__step(1)); }

await p.evaluate(() => {
  const g = window.__game, a = g.world.anchors[0];
  g.controller.position.set(a.position.x - 55, 0, a.position.z - 55);
  g.controller.position.y = g.world.terrain.heightAt(g.controller.position.x, g.controller.position.z);
  g.controller.yaw = Math.atan2(a.position.x - g.controller.position.x, a.position.z - g.controller.position.z);
  g.controller.pitch = 0.10;
  g.invalidateHistory();
});

const variants = [
  ['A-normal', () => {}],
  ['B-nosky', () => { window.__game.sky.mesh.visible = false; }],
  ['C-novol', () => { window.__game.engine.post.enabled.volumetrics = false; }],
  ['D-noshadowmarch', () => { window.__game.world.terrain.uniforms.uSunDir.value.set(0, 1, 0); }],
];
for (const [n, f] of variants) {
  await p.evaluate(f);
  await p.evaluate(() => window.__step(4));
  await p.screenshot({ path: `/home/user/Windows-Debloat-Tool/tools/_shots/terr-${n}.png`, timeout: 200000 });
  console.log('shot', n);
}
await b.close();
