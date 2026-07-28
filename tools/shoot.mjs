// Screenshot / verification driver.
//
// This container has no GPU — Chromium falls back to SwiftShader (CPU
// rasterisation), so rendering is correct but slow. Timeouts are therefore
// generous and any FPS measured here is NOT representative of GPU hardware.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export async function launch(opts = {}) {
  return chromium.launch({
    executablePath: EXE,
    args: [
      '--no-sandbox', '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=DarkModeInAllWebContents',
      ...(opts.args || []),
    ],
  });
}

export async function shoot({ url, out, width = 1920, height = 1080, waitFor = 'window.__done===true',
                              timeout = 300000, before, after, fullPage = false }) {
  mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (before) await before(page);
  let timedOut = false;
  if (waitFor) {
    await page.waitForFunction(waitFor, { timeout }).catch(() => { timedOut = true; });
  }
  if (after) await after(page);
  // Software rasterisation makes a single frame take seconds, so the default
  // 30s screenshot timeout is not enough while a render loop is still running.
  await page.screenshot({ path: out, fullPage, timeout: 180000, animations: 'disabled' });
  const result = await page.evaluate('window.__result || null').catch(() => null);
  await browser.close();
  return { errors, result, timedOut, out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [url, out, w, h, waitFor, timeout] = process.argv.slice(2);
  const r = await shoot({
    url, out,
    width: +(w || 1920), height: +(h || 1080),
    waitFor: waitFor === 'none' ? null : (waitFor || 'window.__done===true'),
    timeout: +(timeout || 300000),
  });
  console.log(JSON.stringify(r, null, 1));
}
