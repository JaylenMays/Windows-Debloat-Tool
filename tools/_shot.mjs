import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/home/user/Windows-Debloat-Tool/tools/_shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('requestfailed', (r) => errors.push('[requestfailed] ' + r.url() + ' ' + (r.failure()||{}).errorText));

const reqs = [];
page.on('request', (r) => reqs.push(r.url()));

await page.goto('http://localhost:8093/tools/ui-test.html?bare=1', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ready === true);
const sleep = (ms) => page.waitForTimeout(ms);

async function shot(name) {
  await page.screenshot({ path: `${OUT}/ui-${name}.png` });
  console.log('shot', name);
}

// boot
await page.evaluate(() => window.ui.showScreen('boot'));
await sleep(2600); await shot('boot');
await sleep(2200); await shot('boot-sync');

// title
await page.evaluate(() => window.ui.showScreen('title'));
await sleep(1400); await shot('title');

// creator
await page.evaluate(() => window.ui.showScreen('creator'));
await sleep(1200); await shot('creator');
await page.evaluate(() => document.querySelectorAll('.ae-cr .ae-cat')[4].click());
await sleep(900); await shot('creator-suit');

// loading
await page.evaluate(() => { window.ui.showScreen('loading'); window.ui.loading.simulate(12000); });
await sleep(4200); await shot('loading');

// hud
await page.evaluate(() => {
  window.ui.hideScreen('loading');
  window.ui.showHUD(true);
  document.querySelectorAll('#bar button').forEach(b => { if (b.textContent === 'seed') b.click(); });
});
await sleep(1600); await shot('hud');
await page.evaluate(() => {
  document.querySelectorAll('#bar button').forEach(b => { if (b.textContent === 'toast') b.click(); });
  window.ui.hud.showSubtitle('ARCHIVIST: You are standing on top of it. The anchor is beneath the salt.', 20000);
});
await sleep(500);
await page.evaluate(() => { window.ui.hud.setScanProgress(0.68); window.ui.hud.setReticle('lock'); });
await sleep(900); await shot('hud-scan');

// codex
await page.evaluate(() => { window.ui.showHUD(false); window.ui.showScreen('codex'); });
await sleep(1400); await shot('codex');

// starmap
await page.evaluate(() => window.ui.showScreen('starmap'));
await sleep(1400); await shot('starmap');

// pause
await page.evaluate(() => window.ui.showScreen('pause'));
await sleep(1300); await shot('pause');

// settings
await page.evaluate(() => window.ui.showScreen('settings'));
await sleep(1300); await shot('settings');

// credits
await page.evaluate(() => window.ui.showScreen('credits'));
await sleep(11000); await shot('credits');

// cinematic bars over hud
await page.evaluate(() => { window.ui.showScreen('title'); });
await sleep(400);

// ── audits ────────────────────────────────────────────────
const audit = await page.evaluate(() => {
  const LAYOUT = /(^|[^-])\b(width|height|top|left|right|bottom|margin|padding|font-size|inset|border-width|flex|grid|line-height)\b/;
  const bad = [];
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const r of rules) {
      if (r.type === CSSRule.KEYFRAMES_RULE) {
        for (const kf of r.cssRules) {
          const props = Array.from(kf.style);
          for (const p of props) if (!['transform','opacity','visibility'].includes(p)) bad.push(`@keyframes ${r.name} → ${p}`);
        }
      } else if (r.style && r.style.transitionProperty) {
        const props = r.style.transitionProperty.split(',').map(s => s.trim());
        for (const p of props) {
          if (p === 'all') bad.push(`${r.selectorText} → transition: all`);
          else if (LAYOUT.test(p)) bad.push(`${r.selectorText} → transition ${p}`);
        }
      }
    }
  }
  return {
    animProblems: bad,
    navCount: document.querySelectorAll('[data-nav]').length,
    events: window.__uiEvents || [],
    sfx: (window.__sfx || []).slice(0, 8),
    fonts: getComputedStyle(document.querySelector('.ae-k')).fontFamily,
  };
});

// external network check
const external = reqs.filter(u => !u.startsWith('http://localhost:8093') && !u.startsWith('data:'));

console.log('\n=== AUDIT ===');
console.log('console errors:', errors.length ? errors : 'NONE');
console.log('external requests:', external.length ? external : 'NONE');
console.log('animation problems:', audit.animProblems.length ? audit.animProblems : 'NONE');
console.log('nav targets on screen:', audit.navCount);
console.log('sfx events sample:', audit.sfx);

// keyboard nav smoke test
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
const focused = await page.evaluate(() => {
  const f = document.querySelector('[data-focus]');
  return f ? (f.textContent || '').trim().slice(0, 40) : null;
});
console.log('keyboard focus after 2×Down:', focused);

await browser.close();
if (errors.length) process.exitCode = 1;
