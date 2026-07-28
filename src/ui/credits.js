/* AETHERIUM — credits: slow vertical scroll (transform only). */
import { el } from './widgets.js';
import { wordmark, seal } from './logo.js';

const ROLL = [
  ['a neural exploration protocol', ''],
  ['director', 'THE LATTICE'],
  ['universe generation', 'PROCEDURAL SYSTEMS GROUP'],
  ['stellar cartography', 'ORRERY DIVISION'],
  ['material synthesis', 'SURFACE SCIENCES'],
  ['acoustic simulation', 'RESONANCE LAB'],
  ['interface architecture', 'NEURAL OVERLAY TEAM'],
  ['creature morphology', 'XENOFORM STUDIO'],
  ['narrative & lore', 'THE ARCHIVISTS'],
  ['founder', 'UNRECORDED'],
  ['special thanks', 'EVERY EXPLORER WHO LOOKED UP'],
  ['no assets were shipped', 'EVERYTHING HERE WAS COMPUTED'],
];

export function buildCredits(ui) {
  const mk = wordmark('AETHERIUM', { gap: 2.9, stroke: .4, color: '#eef8fc', accentIndex: 0 });
  mk.setAttribute('class', 'ae-cd__mk');
  const scroll = el('div', { class: 'ae-cd__scroll' },
    el('div', { style: 'height:12vh' }),
    mk,
    ...ROLL.map(([role, name]) => el('div', { class: 'ae-cd__grp' },
      el('div', { class: 'ae-cd__role', text: role }),
      name ? el('div', { class: 'ae-cd__name', text: name }) : null)),
    el('div', { style: 'color:var(--ae-acc);display:flex;justify-content:center;margin-bottom:24px' }, seal(30)),
    el('div', { class: 'ae-cd__role', style: 'margin-bottom:22vh', text: 'thank you for jacking in' }));

  const root = el('div', { class: 'ae-screen ae-cd', 'data-screen': 'credits' },
    el('div', { class: 'ae-veil' }),
    scroll,
    el('div', { class: 'ae-cd__mask' }),
    el('div', { style: 'position:absolute;left:50%;bottom:26px;transform:translateX(-50%)' },
      el('span', { class: 'ae-k', text: 'esc · return' })),
    el('div', { class: 'ae-fx' }));

  root.onEnter = () => { scroll.removeAttribute('data-on'); void scroll.offsetWidth; scroll.setAttribute('data-on', ''); };
  root.onExit = () => scroll.removeAttribute('data-on');
  return root;
}
