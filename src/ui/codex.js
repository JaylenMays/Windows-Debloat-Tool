/* AETHERIUM — codex: two-pane encyclopedia of discovered entries.
 * `previewSlot` is an empty, absolutely-positioned div the 3D side can mount a
 * rotating model preview into. */
import { el, svg, panel, icon, button, clear, countUp, sfx, clamp } from './widgets.js';

const CAT_ICON = { flora: 'life', fauna: 'life', worlds: 'planet', stars: 'star', tech: 'tech', lore: 'lore', keys: 'key', anomaly: 'anom' };

export function buildCodex(ui) {
  /* ── left pane ── */
  const tabs = el('div', { class: 'ae-cx__tabs' });
  const list = el('div', { class: 'ae-cx__list', 'data-scroll': '1' });
  const compF = el('i', { class: 'ae-cx__compf' });
  const compV = el('span', { class: 'ae-num', style: 'font-size:12px;color:var(--ae-acc)', text: '0%' });
  const compN = el('span', { class: 'ae-k', text: '0 / 0' });
  const left = panel({ title: 'codex', sub: 'archive', cls: 'ae-cx__left' });
  left.body.remove();
  left.appendChild(el('div', { class: 'ae-cx__comp' }, compV, el('i', { class: 'ae-cx__compbar' }, compF), compN));
  left.appendChild(tabs);
  left.appendChild(list);

  /* ── right pane ── */
  const previewSlot = el('div', { class: 'ae-cx__slot' });

  /* wireframe stand-in shown until the engine mounts a model into previewSlot */
  const ph = svg('svg', { viewBox: '0 0 260 180', 'data-placeholder': '1',
    style: 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(58%,380px);opacity:.85' });
  const pl = (d, o) => svg('path', { d, fill: 'none', stroke: 'rgba(95,227,255,' + o + ')', 'stroke-width': 1 });
  ph.appendChild(pl('M130 26 L206 70 L206 130 L130 174 L54 130 L54 70 Z', .55));
  ph.appendChild(pl('M130 26 L130 174 M54 70 L206 130 M206 70 L54 130', .18));
  ph.appendChild(pl('M130 62 L174 88 L174 122 L130 148 L86 122 L86 88 Z', .4));
  ph.appendChild(svg('ellipse', { cx: 130, cy: 100, rx: 96, ry: 26, fill: 'none', stroke: 'rgba(95,227,255,.22)', 'stroke-width': 1 }));
  ph.appendChild(svg('ellipse', { cx: 130, cy: 100, rx: 96, ry: 26, fill: 'none', stroke: 'rgba(95,227,255,.12)', 'stroke-width': 1, transform: 'rotate(58 130 100)' }));
  ph.appendChild(svg('circle', { cx: 130, cy: 100, r: 2.6, fill: 'var(--ae-acc)' }));

  const prev = el('div', { class: 'ae-cx__prev' },
    el('div', { class: 'ae-cx__prevgrid' }), ph, previewSlot, el('div', { class: 'ae-cx__prevfx' }),
    el('div', { style: 'position:absolute;left:16px;top:14px' },
      el('div', { class: 'ae-k ae-k--acc', text: 'holo-render' }),
      el('div', { class: 'ae-k', style: 'margin-top:5px', text: 'volumetric capture' })),
    el('div', { style: 'position:absolute;right:16px;bottom:14px;text-align:right' },
      el('div', { class: 'ae-k', id: 'ae-cx-scale', text: 'scale 1:1' })));
  const det = el('div', { class: 'ae-cx__det', 'data-scroll': '1' });
  const right = panel({ title: 'entry', sub: '—', cls: 'ae-cx__right' });
  const rightSub = right.querySelector('.ae-phd__s');
  right.body.remove();
  right.appendChild(prev);
  right.appendChild(det);

  const root = el('div', { class: 'ae-screen ae-cx', 'data-screen': 'codex' },
    el('div', { class: 'ae-veil' }),
    el('div', { class: 'ae-cx__wrap' }, left, right),
    el('div', { class: 'ae-fx' }));
  left.classList.add('ae-inL'); left.style.setProperty('--i', '0');
  right.classList.add('ae-inR'); right.style.setProperty('--i', '1');

  let data = { entries: [] };
  let cat = 'ALL';
  let sel = null;

  function cats() {
    const s = ['ALL'];
    for (const e of data.entries) if (!s.includes(e.category)) s.push(e.category);
    return s;
  }
  function filtered() {
    return data.entries.filter((e) => cat === 'ALL' || e.category === cat);
  }

  function renderTabs() {
    clear(tabs);
    cats().forEach((c) => {
      const t = el('button', {
        class: 'ae-cx__tab ae-nav', 'data-nav': '1', type: 'button', 'data-on': c === cat ? '' : null,
        onclick: () => { cat = c; sfx('ui.tab'); renderTabs(); renderList(); },
        onmouseenter: () => sfx('ui.hover'),
      }, el('i', { class: 'ae-cx__tab__bg' }), c);
      tabs.appendChild(t);
    });
  }

  function renderList() {
    clear(list);
    const items = filtered();
    items.forEach((e, i) => {
      const locked = e.discovered === false;
      const n = el('button', {
        class: 'ae-ent ae-nav', 'data-nav': '1', type: 'button',
        'data-on': sel && sel.id === e.id ? '' : null, 'data-locked': locked ? '' : null,
        onclick: () => { if (!locked) { select(e); sfx('codex.open'); } else sfx('ui.error'); },
        onmouseenter: () => sfx('ui.hover'),
      },
        el('i', { class: 'ae-ent__bg' }), el('i', { class: 'ae-ent__bar' }),
        el('span', { class: 'ae-ent__ic', style: 'display:flex;color:' + (locked ? 'var(--ae-ink-3)' : 'var(--ae-acc)') },
          icon(locked ? 'lock' : (CAT_ICON[e.category] || 'anom'), 14)),
        el('span', { class: 'ae-ent__n', text: locked ? 'UNDISCOVERED' : e.name }),
        el('span', { class: 'ae-ent__m', text: locked ? '' : (e.rank || e.category || '') }));
      list.appendChild(n);
    });
    if (!items.length) list.appendChild(el('div', { class: 'ae-k', style: 'padding:18px', text: 'no entries in this branch' }));
    ui.nav && ui.nav.refresh();
  }

  function select(e) {
    sel = e;
    list.querySelectorAll('.ae-ent').forEach((n, i) => {
      const it = filtered()[i];
      if (it && it.id === e.id) n.setAttribute('data-on', ''); else n.removeAttribute('data-on');
    });
    rightSub.textContent = (e.category || '').toUpperCase();
    clear(det);

    /* ── header (spans both columns) ── */
    const m = e.meta || {};
    const head = el('div', { class: 'ae-cx__head' });
    head.appendChild(el('div', { class: 'ae-k ae-k--acc ae-in', style: '--i:0', text: e.category || 'record' }));
    head.appendChild(el('h2', { class: 'ae-cx__ttl ae-in ae-chrom', style: '--i:1;margin-top:8px', text: e.name }));
    const meta = el('div', { class: 'ae-cx__meta ae-in', style: '--i:2' });
    const keys = Object.keys(m).slice(0, 5);
    (keys.length ? keys : ['status']).forEach((k) => {
      meta.appendChild(el('div', { class: 'ae-cx__mi' },
        el('span', { class: 'ae-k', text: k }),
        el('span', { class: 'ae-cx__mv', text: String(m[k] ?? 'catalogued') })));
    });
    head.appendChild(meta);
    det.appendChild(head);

    /* ── main prose column ── */
    const main = el('div');
    if (e.summary) main.appendChild(el('p', { class: 'ae-prose ae-in',
      style: '--i:3;margin-bottom:18px;font-size:14px;color:var(--ae-ink)', text: e.summary }));
    const paras = e.body ? (Array.isArray(e.body) ? e.body : [e.body]) : [];
    if (paras.length) main.appendChild(el('div', { class: 'ae-k ae-in', style: '--i:4;margin:22px 0 12px', text: 'field notes' }));
    paras.forEach((p, i) => main.appendChild(el('p', { class: 'ae-prose ae-in', style: '--i:' + (5 + i) + ';margin-bottom:14px', text: p })));
    det.appendChild(main);

    /* ── side rail ── */
    const side = el('div', { class: 'ae-cx__side ae-in', style: '--i:6' });
    const card = (title, rows) => {
      const c = el('div', { class: 'ae-cx__card' }, el('h4', { text: title }));
      rows.forEach(([k, v]) => c.appendChild(el('div', { class: 'ae-cx__kv' },
        el('span', { text: k }), el('span', { text: String(v) }))));
      return c;
    };
    side.appendChild(card('classification', [
      ['branch', e.category || '—'],
      ['rank', e.rank || 'unranked'],
      ['scale', e.scale || '1:1'],
      ['status', e.discovered === false ? 'locked' : 'catalogued'],
    ]));
    const extra = Object.keys(m).slice(5);
    if (extra.length) side.appendChild(card('extended data', extra.map((k) => [k, m[k]])));
    if (e.tags && e.tags.length) {
      const tagCard = el('div', { class: 'ae-cx__card' }, el('h4', { text: 'descriptors' }));
      const row = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' });
      e.tags.forEach((t) => row.appendChild(el('span', {
        class: 'ae-k', style: 'padding:5px 8px;border:1px solid var(--ae-line);color:var(--ae-ink-2)', text: t })));
      tagCard.appendChild(row);
      side.appendChild(tagCard);
    }
    const idx = data.entries.indexOf(e);
    side.appendChild(card('archive index', [
      ['record', String(idx + 1).padStart(3, '0') + ' / ' + String(data.entries.length).padStart(3, '0')],
      ['integrity', (m.integrity || '100%')],
    ]));
    det.appendChild(side);
    const scaleEl = prev.querySelector('#ae-cx-scale');
    if (scaleEl) scaleEl.textContent = 'scale ' + (e.scale || '1:1');
    root.dispatchEvent(new CustomEvent('codex:select', { detail: { entry: e } }));
  }

  function renderComp() {
    const total = data.entries.length || 1;
    const found = data.entries.filter((e) => e.discovered !== false).length;
    const p = found / total;
    compF.style.transform = 'scaleX(' + p.toFixed(3) + ')';
    countUp(compV, 0, p * 100, 700, (v) => Math.round(v) + '%');
    compN.textContent = found + ' / ' + data.entries.length;
  }

  root.setData = (d) => {
    data = d && Array.isArray(d.entries) ? d : { entries: [] };
    cat = 'ALL';
    renderTabs(); renderList(); renderComp();
    const first = data.entries.find((e) => e.discovered !== false);
    if (first) select(first); else clear(det);
  };
  root.previewSlot = previewSlot;
  root.getSelected = () => sel;
  root.onEnter = () => { renderComp(); };
  return root;
}
