/* AETHERIUM — title screen. */
import { el, svg, menuItem, sfx } from './widgets.js';
import { wordmark, seal } from './logo.js';

export const BUILD = '0.9.4-alpha · lattice 2187';

export function buildTitle(ui) {
  const mark = wordmark('AETHERIUM', { gap: 2.9, stroke: 0.34, color: '#eef8fc', accentIndex: 0, accent: 'var(--ae-acc)' });
  mark.setAttribute('class', 'ae-title__mk');

  const menu = el('nav', { class: 'ae-menu ae-title__menu' });
  const items = [
    ['jack in', 'new session', () => { sfx('ui.confirm'); ui.emit('ui:start', { mode: 'new' }); }],
    ['continue', 'no save data', null, true],
    ['starmap', 'known space', () => ui.showScreen('starmap')],
    ['codex', 'archive', () => ui.showScreen('codex')],
    ['settings', 'configure', () => ui.showScreen('settings', { from: 'title' })],
    ['credits', 'the makers', () => ui.showScreen('credits')],
  ];
  items.forEach(([label, hint, fn, dis], i) => {
    menu.appendChild(menuItem({ index: i + 1, label, hint, onClick: fn, disabled: dis }));
  });

  // right-hand system readout column
  const readout = (k, v, acc) => el('div', { style: 'display:flex;gap:18px;justify-content:flex-end' },
    el('span', { class: 'ae-k', text: k }),
    el('span', { class: 'ae-k', style: 'color:' + (acc ? 'var(--ae-acc)' : 'var(--ae-ink-2)') + ';letter-spacing:.16em', text: v }));

  // decorative orbital diagram (authored SVG)
  const orb = svg('svg', { viewBox: '0 0 300 300', style: 'width:100%;height:auto;display:block;opacity:.55' });
  orb.appendChild(svg('circle', { cx: 150, cy: 150, r: 108, fill: 'none', stroke: 'var(--ae-line)', 'stroke-width': 1 }));
  orb.appendChild(svg('circle', { cx: 150, cy: 150, r: 74, fill: 'none', stroke: 'var(--ae-line)', 'stroke-width': 1, 'stroke-dasharray': '2 5' }));
  orb.appendChild(svg('ellipse', { cx: 150, cy: 150, rx: 132, ry: 44, fill: 'none', stroke: 'rgba(95,227,255,.30)', 'stroke-width': 1, transform: 'rotate(-18 150 150)' }));
  orb.appendChild(svg('ellipse', { cx: 150, cy: 150, rx: 132, ry: 44, fill: 'none', stroke: 'rgba(95,227,255,.16)', 'stroke-width': 1, transform: 'rotate(46 150 150)' }));
  orb.appendChild(svg('circle', { cx: 150, cy: 150, r: 7, fill: 'var(--ae-acc)', opacity: .9 }));
  [[262, 118], [66, 196], [196, 62]].forEach(([x, y]) =>
    orb.appendChild(svg('circle', { cx: x, cy: y, r: 3, fill: 'var(--ae-acc)', opacity: .8 })));
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    orb.appendChild(svg('line', {
      x1: (150 + Math.cos(a) * 112).toFixed(1), y1: (150 + Math.sin(a) * 112).toFixed(1),
      x2: (150 + Math.cos(a) * (i % 6 === 0 ? 122 : 117)).toFixed(1), y2: (150 + Math.sin(a) * (i % 6 === 0 ? 122 : 117)).toFixed(1),
      stroke: 'rgba(129,196,218,.35)', 'stroke-width': i % 6 === 0 ? 1.1 : .7,
    }));
  }

  const root = el('div', { class: 'ae-screen ae-title', 'data-screen': 'title' },
    el('div', { class: 'ae-title__grid' }),
    el('div', { class: 'ae-title__scrim' }),
    el('div', { class: 'ae-title__in' },
      el('div', { class: 'ae-in', style: '--i:0' }, mark),
      el('div', { class: 'ae-title__sub ae-in', style: '--i:1' },
        el('span', { class: 'ae-k', style: 'color:var(--ae-acc);letter-spacing:.42em', text: 'neural exploration protocol' }),
        el('i', { class: 'ae-title__rule' })),
      el('div', { class: 'ae-in', style: '--i:2' },
        el('p', { class: 'ae-prose', style: 'max-width:44ch;margin-top:4px',
          text: 'Three keys were left behind when the founder unwound herself into the lattice. Nine hundred billion systems. No map.' })),
      menu),
    el('div', { class: 'ae-title__tr' },
      el('div', { class: 'ae-in', style: '--i:1' }, readout('link', 'stable', true)),
      el('div', { class: 'ae-in', style: '--i:2' }, readout('latency', '4.1 ms')),
      el('div', { class: 'ae-in', style: '--i:3' }, readout('shard', 'eu-lattice-07')),
      el('div', { class: 'ae-in', style: '--i:4' }, readout('explorers', '1 148 226')),
      el('div', { class: 'ae-in', style: '--i:5', text: '' })),
    el('div', { class: 'ae-title__br ae-in', style: '--i:6' }, orb),
    el('div', { class: 'ae-title__foot' },
      el('span', { class: 'ae-in', style: '--i:7;color:var(--ae-acc);display:flex' }, seal(22)),
      el('span', { class: 'ae-k ae-in', style: '--i:8', text: 'build ' + BUILD }),
      el('span', { class: 'ae-k ae-in', style: '--i:9', text: 'enter · select' }),
      el('span', { class: 'ae-k ae-in', style: '--i:10', text: 'esc · back' })),
    el('div', { class: 'ae-fx' }),
    el('div', { class: 'ae-scan' }));

  menu.querySelectorAll('.ae-mi').forEach((n, i) => {
    n.classList.add('ae-inL');
    n.style.setProperty('--i', String(i + 3));
  });
  return root;
}
