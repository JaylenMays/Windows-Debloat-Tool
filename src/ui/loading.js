/* AETHERIUM — loading screen: real progress, phase labels, rotating lore line. */
import { el, svg, clamp, countUp } from './widgets.js';

const LORE = [
  'The lattice does not simulate the universe. It remembers one.',
  'Only three keys were ever minted. Two are believed intact.',
  'Deep-scan a body twice: the second pass reads the mantle.',
  'Cartographers mark dead systems with a single inverted glyph.',
  'A suit will lie to you about oxygen before it lies about heat.',
  'The founder left her voice in the carrier wave. Listen at 4.1 kHz.',
  'No two players receive the same seed. No two ever have.',
  'Anomalies drift. What you charted last cycle has already moved.',
  'Salvage burns clean. Lore does not.',
];

export function buildLoading(ui) {
  const phase = el('div', { class: 'ae-ld__ph', text: 'INITIALISING' });
  const pct = el('div', { class: 'ae-ld__pct', text: '0' });
  const fill = el('i', { class: 'ae-ld__f' });
  const hintT = el('p', { class: 'ae-prose ae-ld__hintT', style: 'font-size:20px;font-weight:200;line-height:1.5;color:var(--ae-ink);max-width:24ch', text: LORE[0] });
  const detail = el('div', { class: 'ae-k', text: 'allocating lattice shards' });

  const spin = svg('svg', { class: 'ae-ld__spin', viewBox: '0 0 96 96' });
  spin.appendChild(svg('circle', { cx: 48, cy: 48, r: 40, fill: 'none', stroke: 'rgba(129,196,218,.16)', 'stroke-width': 1 }));
  const arcA = svg('circle', { cx: 48, cy: 48, r: 40, fill: 'none', stroke: 'var(--ae-acc)', 'stroke-width': 1.6,
    'stroke-dasharray': '52 199', 'stroke-linecap': 'butt' });
  const arcB = svg('circle', { cx: 48, cy: 48, r: 32, fill: 'none', stroke: 'rgba(95,227,255,.45)', 'stroke-width': 1,
    'stroke-dasharray': '18 183' });
  spin.appendChild(arcA); spin.appendChild(arcB);
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    spin.appendChild(svg('line', {
      x1: (48 + Math.cos(a) * 44).toFixed(1), y1: (48 + Math.sin(a) * 44).toFixed(1),
      x2: (48 + Math.cos(a) * (i % 6 === 0 ? 50 : 47)).toFixed(1), y2: (48 + Math.sin(a) * (i % 6 === 0 ? 50 : 47)).toFixed(1),
      stroke: 'rgba(129,196,218,.32)', 'stroke-width': .8 }));
  }
  spin.appendChild(svg('circle', { cx: 48, cy: 48, r: 3.4, fill: 'var(--ae-acc)' }));

  const PHASE_NAMES = ['INITIALISING', 'GENERATING', 'SHADING', 'POPULATING', 'LINKING'];
  const steps = el('div', { class: 'ae-ld__steps ae-inR', style: '--i:2' },
    ...PHASE_NAMES.map((n, i) => el('div', { class: 'ae-ld__step', 'data-on': i === 0 ? '' : null },
      el('span', { class: 'ae-k', text: n }), el('i', null))));

  const root = el('div', { class: 'ae-screen ae-ld', 'data-screen': 'loading' },
    el('div', { class: 'ae-veil' }),
    el('div', { class: 'ae-ld__lore ae-in', style: '--i:1' },
      el('div', { class: 'ae-k ae-k--acc', style: 'margin-bottom:14px', text: 'field note' }), hintT),
    spin, steps,
    el('div', { class: 'ae-ld__in' },
      el('div', { class: 'ae-ld__row ae-in', style: '--i:0' },
        el('div', null, el('div', { class: 'ae-k ae-k--acc', style: 'margin-bottom:10px', text: 'materialising' }), phase),
        el('div', { style: 'display:flex;align-items:baseline;gap:4px' }, pct, el('span', { class: 'ae-ld__unit', text: '%' }))),
      el('div', { class: 'ae-ld__bar ae-inS', style: '--i:1' }, fill, el('i', { class: 'ae-ld__seg' })),
      el('div', { style: 'display:flex;justify-content:space-between;margin-top:11px' },
        detail, el('span', { class: 'ae-k', id: 'ae-ld-eta', text: 'eta —' }))),
    el('div', { class: 'ae-fx' }));

  const etaEl = root.querySelector('#ae-ld-eta');
  let cur = 0, li = 0, timer = 0, raf = 0;

  function rotate() {
    li = (li + 1) % LORE.length;
    hintT.removeAttribute('data-on');
    void hintT.offsetWidth;
    hintT.textContent = LORE[li];
    hintT.setAttribute('data-on', '');
  }
  spin.style.transformOrigin = '50% 50%';
  let t0 = 0;
  function tick(t) {
    raf = requestAnimationFrame(tick);
    if (!t0) t0 = t;
    arcA.setAttribute('transform', `rotate(${((t - t0) * 0.05) % 360} 48 48)`);
    arcB.setAttribute('transform', `rotate(${-((t - t0) * 0.09) % 360} 48 48)`);
  }
  raf = requestAnimationFrame(tick);

  root.setProgress = (p, phaseLabel, detailText) => {
    const q = clamp(p, 0, 1);
    fill.style.transform = 'scaleX(' + q.toFixed(4) + ')';
    countUp(pct, cur * 100, q * 100, 260, (v) => String(Math.round(v)));
    cur = q;
    if (phaseLabel) {
      const up = String(phaseLabel).toUpperCase();
      phase.textContent = up;
      const k = PHASE_NAMES.indexOf(up);
      steps.querySelectorAll('.ae-ld__step').forEach((n, i) => {
        if (k < 0 || i <= k) n.setAttribute('data-on', ''); else n.removeAttribute('data-on');
      });
    }
    if (detailText) detail.textContent = detailText;
    etaEl.textContent = q >= 1 ? 'complete' : 'eta ' + Math.max(1, Math.round((1 - q) * 12)) + 's';
  };
  root.onEnter = () => {
    hintT.setAttribute('data-on', '');
    clearInterval(timer);
    timer = setInterval(rotate, 5200);
  };
  root.onExit = () => clearInterval(timer);

  /* demo autoplay used by the harness when no engine drives progress */
  root.simulate = (ms = 6000) => {
    const phases = [['INITIALISING', 'allocating lattice shards'], ['GENERATING', 'folding stellar noise'],
      ['SHADING', 'compiling material graphs'], ['POPULATING', 'seeding biospheres'], ['LINKING', 'binding neural bridge']];
    void phases;
    const s0 = performance.now();
    const step = () => {
      const p = clamp((performance.now() - s0) / ms, 0, 1);
      const ph = phases[Math.min(phases.length - 1, Math.floor(p * phases.length))];
      root.setProgress(p, ph[0], ph[1]);
      if (p < 1) requestAnimationFrame(step);
    };
    step();
  };
  root.dispose = () => { cancelAnimationFrame(raf); clearInterval(timer); };
  return root;
}
