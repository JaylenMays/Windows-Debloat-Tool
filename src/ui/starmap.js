/* AETHERIUM — starmap frame. The holographic map itself is rendered by the engine
 * in the clear centre column; this module owns the frame, list, labels and info panel. */
import { el, svg, panel, button, icon, clear, sfx, clamp, countUp } from './widgets.js';

const HAZ_WORD = ['benign', 'low', 'moderate', 'severe', 'extreme', 'lethal'];

export function buildStarmap(ui) {
  const listBox = el('div', { class: 'ae-sm__scroll', 'data-scroll': '1' });
  const listPanel = panel({ title: 'known systems', sub: '0', cls: 'ae-sm__list' });
  const listSub = listPanel.querySelector('.ae-phd__s');
  listPanel.body.remove();
  listPanel.appendChild(listBox);
  const listFoot = el('div', { style: 'padding:12px 14px 14px;border-top:1px solid var(--ae-line);display:flex;flex-direction:column;gap:7px' });
  listPanel.appendChild(listFoot);

  const infoPanel = panel({ title: 'system dossier', sub: '—', cls: 'ae-sm__info' });
  const infoSub = infoPanel.querySelector('.ae-phd__s');
  const info = infoPanel.body;

  // stage frame: thin corner reticles + graticule ticks; centre stays clear
  const frame = svg('svg', { class: 'ae-sm__ret', viewBox: '0 0 1000 600', preserveAspectRatio: 'none' });
  const seg = (d, o = .5) => svg('path', { d, fill: 'none', stroke: 'rgba(95,227,255,' + o + ')', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
  frame.appendChild(seg('M0 40 L0 0 L60 0', .8));
  frame.appendChild(seg('M940 0 L1000 0 L1000 40', .8));
  frame.appendChild(seg('M0 560 L0 600 L60 600', .8));
  frame.appendChild(seg('M940 600 L1000 600 L1000 560', .8));
  for (let i = 1; i < 10; i++) frame.appendChild(seg(`M${i * 100} 0 L${i * 100} 10`, .22));
  for (let i = 1; i < 10; i++) frame.appendChild(seg(`M${i * 100} 590 L${i * 100} 600`, .22));
  for (let i = 1; i < 6; i++) frame.appendChild(seg(`M0 ${i * 100} L10 ${i * 100}`, .22));
  for (let i = 1; i < 6; i++) frame.appendChild(seg(`M990 ${i * 100} L1000 ${i * 100}`, .22));
  frame.appendChild(seg('M480 300 L495 300 M505 300 L520 300 M500 280 L500 295 M500 305 L500 320', .35));

  /* polar graticule — the engine draws the holographic map inside this frame */
  const grat = svg('svg', { class: 'ae-sm__ret', viewBox: '0 0 1000 600' });
  const RINGS = [[110, '25 ly'], [190, '50 ly'], [270, '100 ly'], [350, '250 ly']];
  for (const [r, label] of RINGS) {
    grat.appendChild(svg('ellipse', { cx: 500, cy: 300, rx: r, ry: r * .34, fill: 'none',
      stroke: 'rgba(95,227,255,.13)', 'stroke-width': 1 }));
    const t = svg('text', { x: 506, y: 300 + r * .34 + 13, fill: 'rgba(129,196,218,.42)',
      'font-family': 'ui-monospace, "DejaVu Sans Mono", monospace', 'font-size': 9, 'letter-spacing': 1.6 });
    t.textContent = label;
    grat.appendChild(t);
  }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    grat.appendChild(svg('line', { x1: 500, y1: 300,
      x2: (500 + Math.cos(a) * 350).toFixed(1), y2: (300 + Math.sin(a) * 350 * .34).toFixed(1),
      stroke: 'rgba(95,227,255,.07)', 'stroke-width': 1 }));
  }
  grat.appendChild(svg('line', { x1: 500, y1: 190, x2: 500, y2: 410, stroke: 'rgba(95,227,255,.10)', 'stroke-width': 1, 'stroke-dasharray': '3 7' }));

  const stage = el('div', { class: 'ae-sm__stage' }, grat, frame);

  const root = el('div', { class: 'ae-screen ae-sm', 'data-screen': 'starmap' },
    el('div', { class: 'ae-veil ae-veil--soft' }),
    stage,
    el('div', { class: 'ae-sm__hd ae-in', style: '--i:0' },
      el('div', { class: 'ae-k ae-k--acc', style: 'letter-spacing:.44em', text: 'galactic cartography' }),
      el('div', { class: 'ae-h', style: 'font-size:25px;margin-top:9px', text: 'STARMAP' }),
      el('div', { class: 'ae-k', style: 'margin-top:9px', id: 'ae-sm-arm', text: 'orion spur · lattice quadrant iv' })),
    listPanel, infoPanel,
    el('div', { style: 'position:absolute;left:50%;bottom:34px;transform:translateX(-50%);display:flex;gap:24px;align-items:center' },
      el('span', { class: 'ae-k', text: 'scroll · zoom' }),
      el('span', { class: 'ae-k', text: 'drag · orbit' }),
      el('span', { class: 'ae-k', text: 'enter · travel' }),
      el('span', { class: 'ae-k', text: 'esc · back' })),
    el('div', { class: 'ae-fx' }));
  listPanel.classList.add('ae-inL'); listPanel.style.setProperty('--i', '1');
  infoPanel.classList.add('ae-inR'); infoPanel.style.setProperty('--i', '2');

  let data = { systems: [] };
  let sel = null;

  function hazBar(h) {
    const n = el('span', { class: 'ae-haz' });
    for (let i = 0; i < 5; i++) n.appendChild(el('i', { 'data-on': i < h ? '' : null }));
    return n;
  }

  function renderList() {
    clear(listBox);
    listSub.textContent = String(data.systems.length).padStart(2, '0');
    clear(listFoot);
    const surveyed = data.systems.filter((s) => s.visited).length;
    const anom = data.systems.reduce((a, s) => a + (s.anomalies || 0), 0);
    const far = data.systems.reduce((a, s) => Math.max(a, s.distanceLy || 0), 0);
    [['surveyed', surveyed + ' / ' + data.systems.length], ['open anomalies', String(anom)],
     ['furthest charted', far.toFixed(1) + ' ly'], ['jump range', '96.0 ly']].forEach(([k, v]) => {
      listFoot.appendChild(el('div', { style: 'display:flex;justify-content:space-between' },
        el('span', { class: 'ae-k', text: k }),
        el('span', { class: 'ae-num', style: 'font-size:10px;color:var(--ae-ink-2)', text: v })));
    });
    data.systems.forEach((s) => {
      const n = el('button', {
        class: 'ae-sys ae-nav', 'data-nav': '1', type: 'button', 'data-on': sel && sel.id === s.id ? '' : null,
        onclick: () => { select(s); sfx('ui.click'); },
        onmouseenter: () => sfx('ui.hover'),
      },
        el('i', { class: 'ae-sys__bg' }), el('i', { class: 'ae-sys__bar' }),
        el('div', { class: 'ae-sys__r1' },
          el('span', { style: 'display:flex;color:' + (s.current ? 'var(--ae-good)' : 'var(--ae-acc)') }, icon('star', 13)),
          el('span', { class: 'ae-sys__n', text: s.name }),
          el('span', { class: 'ae-sys__d', text: s.current ? 'HERE' : (s.distanceLy ?? 0).toFixed(1) + ' ly' })),
        el('div', { class: 'ae-sys__r2' },
          el('span', { class: 'ae-k', text: s.type || 'unclassified' }),
          el('span', { class: 'ae-k', style: 'margin-left:auto', text: (s.planets ?? 0) + ' bodies' }),
          hazBar(s.hazard ?? 0)));
      listBox.appendChild(n);
    });
    ui.nav && ui.nav.refresh();
  }

  function select(s) {
    sel = s;
    listBox.querySelectorAll('.ae-sys').forEach((n, i) => {
      if (data.systems[i] && data.systems[i].id === s.id) n.setAttribute('data-on', ''); else n.removeAttribute('data-on');
    });
    infoSub.textContent = s.current ? 'current' : (s.visited ? 'surveyed' : 'uncharted');
    clear(info);
    info.appendChild(el('div', { class: 'ae-h', style: 'font-size:19px', text: s.name }));
    info.appendChild(el('div', { class: 'ae-k', style: 'margin-top:7px', text: (s.type || 'unclassified') + ' · ' + (s.spectral || 'g2v') }));

    const stat = (k, v, acc) => el('div', { style: 'display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--ae-line)' },
      el('span', { class: 'ae-k', text: k }),
      el('span', { class: 'ae-num', style: 'font-size:11px;color:' + (acc || 'var(--ae-ink)'), text: v }));
    const block = el('div', { style: 'margin-top:16px' });
    block.appendChild(stat('distance', s.current ? '0.0 ly' : (s.distanceLy ?? 0).toFixed(1) + ' ly', 'var(--ae-acc)'));
    block.appendChild(stat('bodies', String(s.planets ?? 0)));
    block.appendChild(stat('hazard', HAZ_WORD[clamp(s.hazard ?? 0, 0, 5)], (s.hazard ?? 0) >= 3 ? 'var(--ae-warm)' : 'var(--ae-ink)'));
    block.appendChild(stat('fuel cost', s.current ? '—' : ((s.distanceLy ?? 0) * 1.4).toFixed(0) + ' u'));
    block.appendChild(stat('anomalies', String(s.anomalies ?? 0), (s.anomalies ? 'var(--ae-warm)' : 'var(--ae-ink)')));
    info.appendChild(block);

    const res = s.resources || {};
    const rk = Object.keys(res);
    if (rk.length) {
      info.appendChild(el('div', { class: 'ae-k', style: 'margin:18px 0 10px;color:var(--ae-acc)', text: 'resource signature' }));
      const rw = el('div', { class: 'ae-res' });
      rk.forEach((k) => {
        const v = clamp(res[k], 0, 1);
        rw.appendChild(el('div', { class: 'ae-res__r' },
          el('span', { class: 'ae-res__l', text: k }),
          el('span', { class: 'ae-res__b' }, el('i', { class: 'ae-res__f', style: '--p:' + v.toFixed(3) })),
          el('span', { class: 'ae-res__v', text: Math.round(v * 100) + '' })));
      });
      info.appendChild(rw);
    }
    if (s.note) info.appendChild(el('p', { class: 'ae-prose', style: 'margin-top:16px;font-size:12px', text: s.note }));

    const act = el('div', { style: 'margin-top:20px;display:flex;flex-direction:column;gap:8px' });
    const travel = button({
      label: s.current ? 'current system' : 'travel', kind: s.current ? '' : 'pri',
      iconName: 'arrowR', sfxName: 'ship.warpCharge',
      onClick: () => { if (!s.current) ui.emit('ui:travel', { systemId: s.id }); },
    });
    if (s.current) travel.setAttribute('data-dis', '');
    travel.style.justifyContent = 'center';
    act.appendChild(travel);
    info.appendChild(act);

    root.dispatchEvent(new CustomEvent('starmap:select', { detail: { system: s } }));
  }

  root.setData = (d) => {
    data = d && Array.isArray(d.systems) ? d : { systems: [] };
    const armEl = root.querySelector('#ae-sm-arm');
    if (armEl && d && d.region) armEl.textContent = d.region;
    sel = null;
    renderList();
    const first = data.systems.find((s) => s.current) || data.systems[0];
    if (first) select(first); else clear(info);
  };
  root.getSelected = () => sel;
  return root;
}
