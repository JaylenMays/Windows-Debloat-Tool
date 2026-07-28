/* AETHERIUM — boot screen: cold-start neural-link calibration. */
import { el, svg, sfx, clamp } from './widgets.js';
import { seal } from './logo.js';

const LINES = [
  ['0.004', 'cortical bus  ................ handshake', 'OK'],
  ['0.061', 'lattice v9.4  ................ mounted', 'OK'],
  ['0.118', 'sensorium map ................ 8.4M nodes', 'OK'],
  ['0.190', 'proprioception drift .........  0.014 rad', 'OK'],
  ['0.244', 'thermal envelope ............. nominal', 'OK'],
  ['0.311', 'vestibular clamp ............. engaged', 'OK'],
  ['0.402', 'memory partition ............. read-only', 'WARN', 1],
  ['0.466', 'ego boundary  ................ reinforced', 'OK'],
  ['0.559', 'optic bloom   ................ calibrated', 'OK'],
  ['0.640', 'aetherium gateway ............ resolving', 'OK'],
  ['0.718', 'founder signature ............ unverified', 'WARN', 1],
  ['0.803', 'carrier lock  ................ 2.998e8 m/s', 'OK'],
  ['0.901', 'consciousness bridge ......... stable', 'OK'],
];

export function buildBoot(ui) {
  const logEl = el('div', { class: 'ae-boot__log' });
  const barF = el('i', { class: 'ae-boot__barf' });
  const pctEl = el('span', { class: 'ae-k ae-k--acc', text: '000%' });
  const phaseEl = el('span', { class: 'ae-k', text: 'establishing carrier' });
  const flash = el('i', { class: 'ae-flash' });
  const syncEl = el('div', { class: 'ae-boot__sync' },
    el('div', { style: 'text-align:center' },
      el('div', { class: 'ae-boot__syncT ae-chrom', text: 'SYNC' }),
      el('div', { class: 'ae-k', style: 'margin-top:14px;opacity:.8', text: 'neural link established' })));

  // procedural EEG-ish signature trace
  const wave = svg('svg', { class: 'ae-boot__sig', viewBox: '0 0 700 34', preserveAspectRatio: 'none' });
  let d = 'M0 17';
  let seed = 1337;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let x = 0; x <= 700; x += 4) {
    const m = x % 148;
    const spike = m > 58 && m < 78 ? Math.sin((m - 58) / 20 * Math.PI) * (10 + rnd() * 13) * (m < 66 ? 1 : -0.55) : 0;
    const y = 17 + Math.sin(x * .055) * 3.6 + (rnd() - .5) * 2.2 - spike;
    d += ` L${x} ${y.toFixed(1)}`;
  }
  wave.appendChild(svg('path', { d, fill: 'none', stroke: 'var(--ae-acc)', 'stroke-width': 1, opacity: .55 }));
  wave.appendChild(svg('line', { x1: 0, y1: 17, x2: 700, y2: 17, stroke: 'var(--ae-line)', 'stroke-width': 1 }));

  const root = el('div', { class: 'ae-screen ae-boot', 'data-screen': 'boot' },
    el('div', { class: 'ae-boot__w' },
      el('div', { class: 'ae-boot__top' },
        el('span', { style: 'color:var(--ae-acc);display:flex' }, seal(26)),
        el('span', { class: 'ae-k', style: 'letter-spacing:.34em;color:var(--ae-ink)', text: 'aetherium' }),
        el('span', { class: 'ae-k', text: 'neural interface' }),
        el('span', { class: 'ae-k', style: 'margin-left:auto', text: 'ndx-9 / cold start' })),
      wave,
      logEl,
      el('div', { class: 'ae-boot__bar' }, barF),
      el('div', { class: 'ae-boot__meta' }, phaseEl, pctEl)),
    syncEl, flash,
    el('div', { class: 'ae-fx' }));

  let running = false, raf = 0;
  const PHASES = ['establishing carrier', 'mapping sensorium', 'calibrating optics', 'binding identity', 'synchronising'];

  root.play = function play() {
    if (running) return root._promise;
    running = true;
    logEl.textContent = '';
    barF.style.transform = 'scaleX(0)';
    syncEl.removeAttribute('data-on'); flash.removeAttribute('data-on'); root.removeAttribute('data-sync');
    let i = 0;
    const t0 = performance.now();
    const total = 4200;

    root._promise = new Promise((resolve) => {
      const emit = () => {
        if (i >= LINES.length) return;
        const [t, m, tag, warn] = LINES[i++];
        const ln = el('div', { class: 'ae-boot__ln' },
          el('span', { class: 'ae-boot__t', text: '[' + t + ']' }),
          el('span', { class: 'ae-boot__m', text: m }),
          el('span', { class: 'ae-boot__ok', 'data-warn': warn ? '' : null, text: tag }));
        logEl.appendChild(ln);
        while (logEl.children.length > 11) logEl.removeChild(logEl.firstChild);
        sfx('terminal.type');
        setTimeout(emit, 190 + Math.random() * 150);
      };
      setTimeout(emit, 220);

      const tick = (now) => {
        const p = clamp((now - t0) / total, 0, 1);
        const e = p < .85 ? p / .85 * .93 : .93 + (p - .85) / .15 * .07;
        barF.style.transform = 'scaleX(' + e.toFixed(4) + ')';
        pctEl.textContent = String(Math.round(e * 100)).padStart(3, '0') + '%';
        phaseEl.textContent = PHASES[Math.min(PHASES.length - 1, Math.floor(p * PHASES.length))];
        if (p < 1) raf = requestAnimationFrame(tick);
        else {
          sfx('discover.major');
          syncEl.setAttribute('data-on', ''); flash.setAttribute('data-on', ''); root.setAttribute('data-sync', '');
          setTimeout(() => { running = false; resolve(); }, 1250);
        }
      };
      raf = requestAnimationFrame(tick);
    });
    return root._promise;
  };
  root.stop = () => { running = false; cancelAnimationFrame(raf); };
  return root;
}
