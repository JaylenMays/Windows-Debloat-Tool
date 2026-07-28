// Drives a driver-stepped page: waits for window.__ready, renders N frames via
// window.__step(), screenshots, and reports errors + timings.
import { launch } from './shoot.mjs';
import { mkdirSync } from 'fs';

export async function stepShot({ url, out, frames = 30, width = 1280, height = 720,
                                 setup, before, chunk = 5 }) {
  mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // Shader compile failures arrive as console errors, not exceptions, and are
  // the most common way a change silently renders nothing at all.
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|404 \(Not Found\)/.test(t)) return;
    errors.push('console: ' + t.slice(0, 600));
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready===true', { timeout: 120000 });
  if (setup) await page.evaluate(setup);
  let last = null;
  for (let done = 0; done < frames; done += chunk) {
    last = await page.evaluate(n => window.__step(n), Math.min(chunk, frames - done));
  }
  if (before) await page.evaluate(before);
  await page.screenshot({ path: out, timeout: 180000 });
  await browser.close();
  return { out, errors, last };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [url, out, frames, w, h] = process.argv.slice(2);
  console.log(JSON.stringify(await stepShot({
    url, out, frames: +(frames || 30), width: +(w || 1280), height: +(h || 720),
  }), null, 1));
}
