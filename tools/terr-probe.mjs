// Reads back actual pixels to settle whether the dark foreground is unlit
// terrain or missing geometry.
import { launch } from './shoot.mjs';

const b = await launch();
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
p.on('pageerror', e => console.log('PAGEERR', e.message));
p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 300)); });

await p.goto('http://localhost:8099/index.html?manual', { waitUntil: 'domcontentloaded' });
await p.waitForFunction('window.__ready===true', { timeout: 60000 });
await p.evaluate(() => window.__game._materialize({}));
for (let i = 0; i < 9; i++) { await p.waitForTimeout(800); await p.evaluate(() => window.__step(1)); }

const out = await p.evaluate(() => {
  const g = window.__game, a = g.world.anchors[0];
  g.controller.position.set(a.position.x - 55, 0, a.position.z - 55);
  g.controller.position.y = g.world.terrain.heightAt(g.controller.position.x, g.controller.position.z);
  g.controller.yaw = Math.atan2(a.position.x - g.controller.position.x, a.position.z - g.controller.position.z);
  g.controller.pitch = 0.10;
  g.invalidateHistory();
  window.__step(5);

  const read = () => {
    const c = document.getElementById('scene');
    const o = document.createElement('canvas');
    o.width = c.width; o.height = c.height;
    o.getContext('2d').drawImage(c, 0, 0);
    const ctx = o.getContext('2d');
    const at = (fx, fy) => {
      const d = ctx.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    return { horizon: at(0.30, 0.45), midFore: at(0.30, 0.70), nearFore: at(0.30, 0.92), sky: at(0.10, 0.10) };
  };

  const res = { withSky: read() };
  g.sky.mesh.visible = false; window.__step(3);
  res.noSky = read();
  g.sky.mesh.visible = true;

  // Raycast straight down and forward to confirm geometry is present.
  const THREE = g.engine.scene.constructor;
  const cam = g.engine.cameraForLayer(3);
  res.camPos = cam.position.toArray().map(v => +v.toFixed(1));
  res.groundUnderCam = +g.world.terrain.heightAt(cam.position.x, cam.position.z).toFixed(1);
  res.bakedCenter = g.world.terrain._bakedCenter;
  const m0 = g.world.terrain.meshes[0].mesh;
  m0.geometry.computeBoundingBox();
  res.finestRingBox = {
    min: m0.geometry.boundingBox.min.toArray().map(v => +v.toFixed(1)),
    max: m0.geometry.boundingBox.max.toArray().map(v => +v.toFixed(1)),
  };
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
