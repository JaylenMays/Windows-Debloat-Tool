/* AETHERIUM — UI primitives: DOM helpers, authored SVG icons, custom controls,
 * focus/keyboard/gamepad navigation. No external assets, no default browser widgets. */

/* ───────────────────────── DOM helpers ───────────────────────── */
export function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.setAttribute('style', v);
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  add(n, kids);
  return n;
}
function add(n, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(n, k);
    else n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  }
  return n;
}
export const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs, ...kids) {
  const n = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) { const v = attrs[k]; if (v != null && v !== false) n.setAttribute(k, v); }
  for (const k of kids.flat()) if (k) n.appendChild(k);
  return n;
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }

/* ───────────────────────── sfx bus ───────────────────────── */
let sfxTarget = null;
export function setSfxTarget(t) { sfxTarget = t; }
export function sfx(name) {
  const ev = new CustomEvent('ui:sfx', { detail: { name }, bubbles: true });
  (sfxTarget || window).dispatchEvent(ev);
  if (sfxTarget && sfxTarget !== window) window.dispatchEvent(new CustomEvent('ui:sfx', { detail: { name } }));
}

/* ───────────────────────── authored SVG icons ─────────────────────────
 * Every icon is drawn on a 24x24 grid with 1.4 hairlines. No icon fonts. */
const P = (d, extra) => svg('path', Object.assign({ d, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4,
  'stroke-linecap': 'square', 'stroke-linejoin': 'miter' }, extra));
function ic(...kids) {
  return svg('svg', { viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': 'true' }, ...kids);
}
export const Icons = {
  chevL: () => ic(P('M14.5 5 L8 12 L14.5 19')),
  chevR: () => ic(P('M9.5 5 L16 12 L9.5 19')),
  chevD: () => ic(P('M5 9.5 L12 16 L19 9.5')),
  body: () => ic(P('M12 3.2 L12 3.2'), svg('circle', { cx: 12, cy: 5, r: 2.4, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    P('M12 8 L12 15 M12 15 L8.5 21 M12 15 L15.5 21 M6.5 11 L17.5 11')),
  face: () => ic(svg('circle', { cx: 12, cy: 12, r: 8.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    P('M9 10.4 L9 10.4 M15 10.4 L15 10.4 M8.6 15.2 C10.4 17 13.6 17 15.4 15.2'),
    svg('circle', { cx: 9, cy: 10.4, r: .9, fill: 'currentColor' }), svg('circle', { cx: 15, cy: 10.4, r: .9, fill: 'currentColor' })),
  hair: () => ic(P('M4.5 14 C4.5 7 8 3.6 12 3.6 C16 3.6 19.5 7 19.5 14 M4.5 14 L4.5 19 M19.5 14 L19.5 19 M7.6 8.4 C10 10.8 14.6 11.4 17.6 9.6')),
  eye: () => ic(P('M2.6 12 C6 7 9.4 5.6 12 5.6 C14.6 5.6 18 7 21.4 12 C18 17 14.6 18.4 12 18.4 C9.4 18.4 6 17 2.6 12 Z'),
    svg('circle', { cx: 12, cy: 12, r: 3.1, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    svg('circle', { cx: 12, cy: 12, r: 1.1, fill: 'currentColor' })),
  suit: () => ic(P('M8.6 3.4 L12 5.4 L15.4 3.4 L20 6 L18.4 10.6 L16.6 9.8 L16.6 20.6 L7.4 20.6 L7.4 9.8 L5.6 10.6 L4 6 Z M12 5.4 L12 9.4')),
  id: () => ic(svg('rect', { x: 3, y: 5, width: 18, height: 14, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    P('M7 10.2 L10.4 10.2 M7 13.4 L13 13.4 M15.2 9 L18.4 9 M15.2 12 L18.4 12 M15.2 15 L18.4 15')),
  scan: () => ic(P('M3.2 8 L3.2 3.6 L7.6 3.6 M16.4 3.6 L20.8 3.6 L20.8 8 M20.8 16 L20.8 20.4 L16.4 20.4 M7.6 20.4 L3.2 20.4 L3.2 16 M3.2 12 L20.8 12')),
  planet: () => ic(svg('circle', { cx: 12, cy: 11, r: 6.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    svg('ellipse', { cx: 12, cy: 11, rx: 10.6, ry: 3.4, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2, transform: 'rotate(-20 12 11)' })),
  star: () => ic(svg('circle', { cx: 12, cy: 12, r: 4.4, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    P('M12 2.4 L12 6 M12 18 L12 21.6 M2.4 12 L6 12 M18 12 L21.6 12 M5.6 5.6 L8 8 M16 16 L18.4 18.4 M18.4 5.6 L16 8 M8 16 L5.6 18.4')),
  life: () => ic(P('M12 20.4 C12 20.4 4.2 15.6 4.2 9.9 C4.2 6.9 6.4 4.8 9 4.8 C10.6 4.8 12 5.9 12 5.9 C12 5.9 13.4 4.8 15 4.8 C17.6 4.8 19.8 6.9 19.8 9.9 C19.8 15.6 12 20.4 12 20.4 Z')),
  tech: () => ic(svg('rect', { x: 8.4, y: 8.4, width: 7.2, height: 7.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    P('M12 3 L12 8.4 M12 15.6 L12 21 M3 12 L8.4 12 M15.6 12 L21 12 M5.4 5.4 L8.4 8.4 M15.6 15.6 L18.6 18.6')),
  lore: () => ic(P('M4.4 4.6 L11 4.6 L11 19.4 L4.4 19.4 Z M13 4.6 L19.6 4.6 L19.6 19.4 L13 19.4 Z M6.4 8.4 L9 8.4 M6.4 11.4 L9 11.4 M15 8.4 L17.6 8.4')),
  key: () => ic(svg('circle', { cx: 8, cy: 12, r: 3.8, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    P('M11.8 12 L21 12 M17.4 12 L17.4 15.6 M20 12 L20 16.4')),
  anom: () => ic(P('M12 2.6 L21.4 12 L12 21.4 L2.6 12 Z M12 7.4 L16.6 12 L12 16.6 L7.4 12 Z')),
  warn: () => ic(P('M12 3.2 L21.6 20.4 L2.4 20.4 Z M12 9.4 L12 14.6'), svg('circle', { cx: 12, cy: 17.4, r: .95, fill: 'currentColor' })),
  ship: () => ic(P('M12 2.6 L16.2 12.6 L16.2 19 L12 16.6 L7.8 19 L7.8 12.6 Z M7.8 14 L3.4 17.4 L3.4 12 M16.2 14 L20.6 17.4 L20.6 12')),
  gear: () => ic(svg('circle', { cx: 12, cy: 12, r: 3.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    P('M12 2.8 L12 5.8 M12 18.2 L12 21.2 M2.8 12 L5.8 12 M18.2 12 L21.2 12 M5.5 5.5 L7.6 7.6 M16.4 16.4 L18.5 18.5 M18.5 5.5 L16.4 7.6 M7.6 16.4 L5.5 18.5')),
  dice: () => ic(svg('rect', { x: 4, y: 4, width: 16, height: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    svg('circle', { cx: 8.4, cy: 8.4, r: 1.15, fill: 'currentColor' }), svg('circle', { cx: 15.6, cy: 15.6, r: 1.15, fill: 'currentColor' }),
    svg('circle', { cx: 12, cy: 12, r: 1.15, fill: 'currentColor' })),
  undo: () => ic(P('M4.4 11.4 L4.4 6.6 M4.4 11.4 L9.2 11.4 M4.4 11.4 C7 7.4 10.4 6 13.2 6.6 C17.4 7.4 19.8 10.8 19.4 14.4 C19 18 15.8 20.4 12 20.2')),
  check: () => ic(P('M4.6 12.4 L9.6 17.4 L19.4 6.6')),
  x: () => ic(P('M5.6 5.6 L18.4 18.4 M18.4 5.6 L5.6 18.4')),
  arrowR: () => ic(P('M4 12 L20 12 M14 6 L20 12 L14 18')),
  lock: () => ic(svg('rect', { x: 5, y: 10.4, width: 14, height: 9.6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }),
    P('M8.2 10.4 L8.2 7.6 C8.2 5.5 9.9 3.8 12 3.8 C14.1 3.8 15.8 5.5 15.8 7.6 L15.8 10.4')),
};
export function icon(name, size = 14, cls) {
  const s = (Icons[name] || Icons.anom)();
  s.setAttribute('width', size); s.setAttribute('height', size);
  if (cls) s.setAttribute('class', cls);
  return s;
}

/* ───────────────────────── panel chrome ───────────────────────── */
export function panel(opts = {}) {
  const { title, sub, cls = '', corners = true } = opts;
  const body = el('div', { class: 'ae-pbody' });
  const root = el('div', { class: 'ae-panel ' + cls },
    el('div', { class: 'ae-panel__bg' }),
    corners ? [el('i', { class: 'ae-cor ae-cor--tl' }), el('i', { class: 'ae-cor ae-cor--tr' }),
      el('i', { class: 'ae-cor ae-cor--bl' }), el('i', { class: 'ae-cor ae-cor--br' })] : null,
    title ? el('header', { class: 'ae-phd' },
      el('i', { class: 'ae-dot' }),
      el('span', { class: 'ae-phd__t', text: title }),
      sub ? el('span', { class: 'ae-phd__s', text: sub }) : null) : null,
    body);
  root.body = body;
  return root;
}

/* ───────────────────────── button ───────────────────────── */
export function button(opts) {
  const { label, kind = '', onClick, iconName, sm, sfxName = 'ui.click' } = opts;
  const b = el('button', {
    class: 'ae-btn ae-nav ' + (sm ? 'ae-btn--sm ' : '') + (kind ? 'ae-btn--' + kind : ''),
    'data-nav': '1', type: 'button',
    onclick: (e) => { e.preventDefault(); sfx(sfxName); onClick && onClick(e); },
    onmouseenter: () => sfx('ui.hover'),
  },
    el('span', { class: 'ae-btn__bg' }), el('span', { class: 'ae-btn__hl' }),
    iconName ? icon(iconName, sm ? 11 : 12) : null,
    el('span', { class: 'ae-btn__lb', text: label }));
  b.setLabel = (t) => { b.querySelector('.ae-btn__lb').textContent = t; };
  return b;
}

/* ───────────────────────── menu item ───────────────────────── */
export function menuItem(opts) {
  const { index, label, hint, onClick, disabled } = opts;
  const m = el('button', {
    class: 'ae-mi ae-nav', 'data-nav': '1', type: 'button', 'data-dis': disabled || null,
    onclick: () => { sfx('ui.confirm'); onClick && onClick(); },
    onmouseenter: () => sfx('ui.hover'),
  },
    el('span', { class: 'ae-mi__bg' }), el('span', { class: 'ae-mi__bar' }),
    el('span', { class: 'ae-mi__n', text: String(index).padStart(2, '0') }),
    el('span', { class: 'ae-mi__l', text: label }),
    hint ? el('span', { class: 'ae-mi__h', text: hint }) : null);
  return m;
}

/* ───────────────────────── slider ───────────────────────── */
export function slider(opts) {
  const { label, min = 0, max = 1, step = 0.01, value = 0, format, onInput } = opts;
  let v = clamp(value, min, max);
  const vout = el('span', { class: 'ae-ctl__v' });
  const fill = el('i', { class: 'ae-sl__fill' });
  const ptr = el('i', { class: 'ae-sl__ptr' }, el('i', { class: 'ae-sl__kn' }));
  const hit = el('i', { class: 'ae-sl__hit' });
  const track = el('div', { class: 'ae-sl' },
    el('i', { class: 'ae-sl__tk' }), el('i', { class: 'ae-sl__tr' }),
    el('i', { class: 'ae-sl__fillw' }, fill), el('i', { class: 'ae-sl__ptrw' }, ptr), hit);
  const root = el('div', { class: 'ae-ctl ae-nav', 'data-nav': '1', tabindex: '-1' },
    el('i', { class: 'ae-ctl__bg' }),
    el('div', { class: 'ae-ctl__hd' }, el('span', { class: 'ae-ctl__lb', text: label }), vout),
    track);

  const fmt = format || ((x) => (step >= 1 ? String(Math.round(x)) : x.toFixed(2)));
  function paint() {
    const p = (v - min) / (max - min || 1);
    fill.style.setProperty('--p', p.toFixed(4));
    ptr.style.setProperty('--p', p.toFixed(4));
    vout.textContent = fmt(v);
  }
  function set(nv, emit = true) {
    const q = clamp(Math.round(nv / step) * step, min, max);
    const r = Math.abs(q - v) > 1e-9;
    v = q; paint();
    if (emit && r && onInput) onInput(+v.toFixed(6));
  }
  function fromX(cx) {
    const r = track.getBoundingClientRect();
    set(min + ((cx - r.left) / (r.width || 1)) * (max - min));
  }
  let dragging = false;
  hit.addEventListener('pointerdown', (e) => {
    dragging = true; hit.setPointerCapture(e.pointerId); fromX(e.clientX); sfx('ui.tab');
  });
  hit.addEventListener('pointermove', (e) => { if (dragging) fromX(e.clientX); });
  hit.addEventListener('pointerup', (e) => { dragging = false; try { hit.releasePointerCapture(e.pointerId); } catch (_) {} });
  hit.addEventListener('pointerenter', () => sfx('ui.hover'));

  root.navAxis = (dir) => { set(v + dir * step * (max - min > 20 ? 1 : 1)); sfx('ui.tab'); return true; };
  root.getValue = () => v;
  root.setValue = (nv) => set(nv, false);
  root.kind = 'slider';
  paint();
  return root;
}

/* ───────────────────────── option cycler ───────────────────────── */
export function option(opts) {
  const { label, options = [], value, onChange } = opts;
  let i = Math.max(0, options.findIndex((o) => (o.value ?? o) === value));
  if (i < 0) i = 0;
  const vout = el('span', { class: 'ae-opt__v' });
  const pips = el('div', { class: 'ae-opt__pips' });
  const L = el('span', { class: 'ae-opt__ar', onclick: (e) => { e.stopPropagation(); step(-1); } }, icon('chevL', 16));
  const R = el('span', { class: 'ae-opt__ar', onclick: (e) => { e.stopPropagation(); step(1); } }, icon('chevR', 16));
  const root = el('div', { class: 'ae-ctl ae-nav', 'data-nav': '1', tabindex: '-1' },
    el('i', { class: 'ae-ctl__bg' }),
    el('div', { class: 'ae-ctl__hd' }, el('span', { class: 'ae-ctl__lb', text: label })),
    el('div', { class: 'ae-opt' }, L, vout, R), pips);
  function paint() {
    const o = options[i];
    vout.textContent = (o && (o.label ?? o)) + '';
    clear(pips);
    if (options.length <= 8) options.forEach((_, k) => pips.appendChild(el('i', { class: 'ae-opt__pip', 'data-on': k === i ? '' : null })));
  }
  function step(d, emit = true) {
    i = (i + d + options.length) % options.length; paint();
    if (emit && onChange) onChange(options[i].value ?? options[i], i);
    sfx('ui.tab');
  }
  root.navAxis = (d) => { step(d); return true; };
  root.activate = () => step(1);
  root.getValue = () => options[i] ? (options[i].value ?? options[i]) : null;
  root.setValue = (v2) => { const k = options.findIndex((o) => (o.value ?? o) === v2); if (k >= 0) { i = k; paint(); } };
  root.kind = 'option';
  paint();
  return root;
}

/* ───────────────────────── toggle ───────────────────────── */
export function toggle(opts) {
  const { label, value = false, onChange } = opts;
  let v = !!value;
  const tg = el('div', { class: 'ae-tg' }, el('i', { class: 'ae-tg__tr' }), el('i', { class: 'ae-tg__on' }), el('i', { class: 'ae-tg__kn' }));
  const root = el('div', { class: 'ae-ctl ae-nav', 'data-nav': '1', tabindex: '-1' },
    el('i', { class: 'ae-ctl__bg' }),
    el('div', { class: 'ae-ctl__hd' }, el('span', { class: 'ae-ctl__lb', text: label }), tg));
  function paint() { if (v) tg.setAttribute('data-on', ''); else tg.removeAttribute('data-on'); }
  function set(nv, emit = true) { v = !!nv; paint(); if (emit && onChange) onChange(v); }
  root.addEventListener('click', () => { set(!v); sfx('ui.click'); });
  root.addEventListener('mouseenter', () => sfx('ui.hover'));
  root.activate = () => set(!v);
  root.navAxis = (d) => { set(d > 0); return true; };
  root.getValue = () => v;
  root.setValue = (nv) => set(nv, false);
  root.kind = 'toggle';
  paint();
  return root;
}

/* ───────────────────────── colour swatches ───────────────────────── */
export function swatches(opts) {
  const { label, colors = [], value, onChange } = opts;
  let cur = value || colors[0];
  const row = el('div', { class: 'ae-sw' });
  const root = el('div', { class: 'ae-ctl ae-nav', 'data-nav': '1', tabindex: '-1' },
    el('i', { class: 'ae-ctl__bg' }),
    el('div', { class: 'ae-ctl__hd' }, el('span', { class: 'ae-ctl__lb', text: label }),
      el('span', { class: 'ae-ctl__v' })), row);
  const vout = root.querySelector('.ae-ctl__v');
  const cells = colors.map((c) => {
    const cell = el('button', { class: 'ae-sw__c', type: 'button', style: 'color:' + c,
      onclick: (e) => { e.stopPropagation(); set(c); sfx('ui.click'); },
      onmouseenter: () => sfx('ui.hover') },
      el('i', { style: 'background:' + c }));
    row.appendChild(cell); return cell;
  });
  function paint() {
    cells.forEach((c, k) => { if (colors[k] === cur) c.setAttribute('data-on', ''); else c.removeAttribute('data-on'); });
    vout.textContent = String(cur).toUpperCase();
  }
  function set(c, emit = true) { cur = c; paint(); if (emit && onChange) onChange(c); }
  root.navAxis = (d) => { const k = colors.indexOf(cur); set(colors[(k + d + colors.length) % colors.length]); sfx('ui.tab'); return true; };
  root.getValue = () => cur;
  root.setValue = (c) => set(c, false);
  root.kind = 'color';
  paint();
  return root;
}

/* ───────────────────────── arc gauge (SVG) ───────────────────────── */
export function arcGauge(opts = {}) {
  const { size = 78, h = 52, sweep = 232, r = 26, width = 3, color = 'var(--ae-acc)', label = '' } = opts;
  const cx = size / 2, cy = h - 14;
  const a0 = (180 + (180 - sweep) / 2) * Math.PI / 180;
  const a1 = a0 + sweep * Math.PI / 180;
  const pt = (a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
  const d = `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  const len = 2 * Math.PI * r * (sweep / 360);
  const bg = svg('path', { d, fill: 'none', stroke: 'rgba(129,196,218,.16)', 'stroke-width': width });
  const fg = svg('path', { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'butt',
    'stroke-dasharray': len.toFixed(2), 'stroke-dashoffset': len.toFixed(2), style: 'filter:drop-shadow(0 0 4px ' + color + ')' });
  // fine graduation ticks
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const a = a0 + (a1 - a0) * (i / 10);
    const rr = i % 5 === 0 ? r + 7 : r + 4.5;
    const [tx, ty] = [cx + Math.cos(a) * (r + 2.5), cy + Math.sin(a) * (r + 2.5)];
    const [ux, uy] = [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    ticks.push(svg('line', { x1: tx.toFixed(2), y1: ty.toFixed(2), x2: ux.toFixed(2), y2: uy.toFixed(2),
      stroke: 'rgba(129,196,218,.38)', 'stroke-width': i % 5 === 0 ? 1.1 : .7 }));
  }
  const s = svg('svg', { class: 'ae-vit__sv', viewBox: `0 0 ${size} ${h}`, width: size, height: h }, ...ticks, bg, fg);
  s.setValue = (t) => { fg.setAttribute('stroke-dashoffset', (len * (1 - clamp(t, 0, 1))).toFixed(2)); };
  s.setColor = (c) => { fg.setAttribute('stroke', c); fg.setAttribute('style', 'filter:drop-shadow(0 0 4px ' + c + ')'); };
  s.label = label;
  return s;
}

/* ───────────────────────── ring (progress / decoration) ───────────────────────── */
export function ring(size = 96, opts = {}) {
  const { r = size / 2 - 8, width = 1.6, color = 'var(--ae-acc)' } = opts;
  const c = 2 * Math.PI * r;
  const base = svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'rgba(129,196,218,.15)', 'stroke-width': width });
  const fg = svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': width,
    'stroke-dasharray': c.toFixed(2), 'stroke-dashoffset': c.toFixed(2),
    transform: `rotate(-90 ${size / 2} ${size / 2})` });
  const s = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size }, base, fg);
  s.setValue = (t) => fg.setAttribute('stroke-dashoffset', (c * (1 - clamp(t, 0, 1))).toFixed(2));
  return s;
}

/* ───────────────────────── number count-up ───────────────────────── */
export function countUp(node, from, to, ms = 600, fmt = (v) => Math.round(v)) {
  const t0 = performance.now();
  const reduced = document.documentElement.classList.contains('ae-reduced') ||
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || ms <= 0) { node.textContent = fmt(to); return; }
  function tick(t) {
    const p = clamp((t - t0) / ms, 0, 1);
    const e = 1 - Math.pow(1 - p, 3);
    node.textContent = fmt(lerp(from, to, e));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ───────────────────────── stagger helper ───────────────────────── */
export function stagger(container, sel = '.ae-in,.ae-inL,.ae-inR,.ae-inS') {
  container.querySelectorAll(sel).forEach((n, i) => n.style.setProperty('--i', i));
  return container;
}

/* ───────────────────────── focus / keyboard / gamepad nav ───────────────────────── */
export class NavManager {
  constructor(root) {
    this.root = root;
    this.layers = [];            // stack of {node, onBack, wrap}
    this.cur = null;
    this._pads = { prev: {}, axisT: 0 };
    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey, true);
    this._raf = this._poll.bind(this);
    requestAnimationFrame(this._raf);
  }
  push(node, onBack) { this.layers.push({ node, onBack }); this.refresh(); this.focusFirst(); }
  pop(node) {
    const i = this.layers.findIndex((l) => l.node === node);
    if (i >= 0) this.layers.splice(i, 1);
    this.refresh(); this.focusFirst();
  }
  top() { return this.layers[this.layers.length - 1] || null; }
  items() {
    const t = this.top(); if (!t) return [];
    return Array.from(t.node.querySelectorAll('[data-nav]')).filter((n) => {
      if (n.hasAttribute('data-dis')) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }
  refresh() {
    const items = this.items();
    if (!items.includes(this.cur)) { this.setFocus(items[0] || null); }
  }
  focusFirst() { const it = this.items(); if (it.length && !it.includes(this.cur)) this.setFocus(it[0]); }
  setFocus(n, silent) {
    if (this.cur === n) return;
    if (this.cur) this.cur.removeAttribute('data-focus');
    this.cur = n;
    if (n) {
      n.setAttribute('data-focus', '');
      if (!silent) sfx('ui.hover');
      const sc = n.closest('[data-scroll]');
      if (sc) {
        const nr = n.getBoundingClientRect(), sr = sc.getBoundingClientRect();
        if (nr.top < sr.top + 8) sc.scrollTop += nr.top - sr.top - 8;
        else if (nr.bottom > sr.bottom - 8) sc.scrollTop += nr.bottom - sr.bottom + 8;
      }
    }
  }
  move(dx, dy) {
    const items = this.items(); if (!items.length) return;
    if (!this.cur || !items.includes(this.cur)) { this.setFocus(items[0]); return; }
    const cr = this.cur.getBoundingClientRect();
    const cxx = cr.left + cr.width / 2, cyy = cr.top + cr.height / 2;
    let best = null, bestScore = Infinity;
    for (const n of items) {
      if (n === this.cur) continue;
      const r = n.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const ddx = x - cxx, ddy = y - cyy;
      const along = dx ? ddx * dx : ddy * dy;
      if (along <= 2) continue;
      const off = Math.abs(dx ? ddy : ddx);
      const score = along + off * 2.6;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (best) this.setFocus(best);
  }
  activate() {
    const n = this.cur; if (!n) return;
    if (typeof n.activate === 'function') { sfx('ui.click'); n.activate(); }
    else n.click();
  }
  back() {
    const t = this.top();
    sfx('ui.back');
    if (t && t.onBack) t.onBack();
  }
  _onKey(e) {
    const t = this.top(); if (!t) return;
    const k = e.key;
    const horiz = (d) => {
      if (this.cur && typeof this.cur.navAxis === 'function') { this.cur.navAxis(d); return; }
      this.move(d, 0);
    };
    if (k === 'ArrowUp') { this.move(0, -1); e.preventDefault(); }
    else if (k === 'ArrowDown') { this.move(0, 1); e.preventDefault(); }
    else if (k === 'ArrowLeft') { horiz(-1); e.preventDefault(); }
    else if (k === 'ArrowRight') { horiz(1); e.preventDefault(); }
    else if (k === 'Tab') { this.move(0, e.shiftKey ? -1 : 1); e.preventDefault(); }
    else if (k === 'Enter' || k === ' ') { this.activate(); e.preventDefault(); }
    else if (k === 'Escape' || k === 'Backspace') { this.back(); e.preventDefault(); }
  }
  _poll() {
    requestAnimationFrame(this._raf);
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const now = performance.now();
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const dz = 0.55;
      let dx = 0, dy = 0;
      if (p.buttons[12] && p.buttons[12].pressed) dy = -1;
      if (p.buttons[13] && p.buttons[13].pressed) dy = 1;
      if (p.buttons[14] && p.buttons[14].pressed) dx = -1;
      if (p.buttons[15] && p.buttons[15].pressed) dx = 1;
      if (Math.abs(ay) > dz) dy = ay > 0 ? 1 : -1;
      if (Math.abs(ax) > dz) dx = ax > 0 ? 1 : -1;
      if ((dx || dy) && now - this._pads.axisT > 170) {
        this._pads.axisT = now;
        if (dy) this.move(0, dy);
        else if (this.cur && typeof this.cur.navAxis === 'function') this.cur.navAxis(dx);
        else this.move(dx, 0);
      }
      const A = p.buttons[0] && p.buttons[0].pressed, B = p.buttons[1] && p.buttons[1].pressed;
      if (A && !this._pads.prev.A) this.activate();
      if (B && !this._pads.prev.B) this.back();
      this._pads.prev.A = A; this._pads.prev.B = B;
    }
  }
  dispose() { window.removeEventListener('keydown', this._onKey, true); this.layers.length = 0; }
}

/* pointer hover keeps the focus model in sync */
export function bindHoverFocus(nav, scope) {
  scope.addEventListener('pointerover', (e) => {
    const n = e.target.closest && e.target.closest('[data-nav]');
    if (n && scope.contains(n) && nav.top() && nav.top().node.contains(n)) nav.setFocus(n, true);
  });
}
