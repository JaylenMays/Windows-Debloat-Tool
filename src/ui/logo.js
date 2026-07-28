/* AETHERIUM — geometric stroke wordmark, authored as SVG path data.
 * Each glyph lives on a 6 x 10 unit grid; drawn as hairline strokes with
 * mitred joins so the mark reads as precision instrumentation, not a typeface. */

const G = {
  A: ['M0 10 L3 0 L6 10', 'M1.15 6.2 L4.85 6.2'],
  E: ['M6 0 L0 0 L0 10 L6 10', 'M0 5 L4.5 5'],
  T: ['M0 0 L6 0', 'M3 0 L3 10'],
  H: ['M0 0 L0 10', 'M6 0 L6 10', 'M0 5 L6 5'],
  R: ['M0 10 L0 0 L4.1 0 L6 1.9 L6 3.6 L4.1 5.5 L0 5.5', 'M3.3 5.5 L6 10'],
  I: ['M3 0 L3 10'],
  U: ['M0 0 L0 7.7 L2.3 10 L3.7 10 L6 7.7 L6 0'],
  M: ['M0 10 L0 0 L3 4.6 L6 0 L6 10'],
  N: ['M0 10 L0 0 L6 10 L6 0'],
  X: ['M0 0 L6 10', 'M6 0 L0 10'],
  S: ['M6 1.2 L4.8 0 L1.2 0 L0 1.2 L0 3.6 L1.2 4.8 L4.8 4.8 L6 6 L6 8.8 L4.8 10 L1.2 10 L0 8.8'],
  O: ['M0 1.5 L1.5 0 L4.5 0 L6 1.5 L6 8.5 L4.5 10 L1.5 10 L0 8.5 Z'],
  C: ['M6 1.5 L4.5 0 L1.5 0 L0 1.5 L0 8.5 L1.5 10 L4.5 10 L6 8.5'],
  D: ['M0 0 L4 0 L6 2 L6 8 L4 10 L0 10 Z'],
  P: ['M0 10 L0 0 L4.1 0 L6 1.9 L6 3.6 L4.1 5.5 L0 5.5'],
  L: ['M0 0 L0 10 L6 10'],
  V: ['M0 0 L3 10 L6 0'],
  W: ['M0 0 L1.4 10 L3 3.6 L4.6 10 L6 0'],
  G: ['M6 1.5 L4.5 0 L1.5 0 L0 1.5 L0 8.5 L1.5 10 L4.5 10 L6 8.5 L6 5.6 L3.4 5.6'],
  F: ['M6 0 L0 0 L0 10', 'M0 5 L4.5 5'],
  Y: ['M0 0 L3 5 L6 0', 'M3 5 L3 10'],
  B: ['M0 0 L0 10', 'M0 0 L4.2 0 L6 1.7 L6 3.3 L4.2 5 L0 5', 'M4.2 5 L6 6.7 L6 8.3 L4.2 10 L0 10'],
  K: ['M0 0 L0 10', 'M6 0 L0 5.4', 'M2.4 3.9 L6 10'],
  Z: ['M0 0 L6 0 L0 10 L6 10'],
  Q: ['M0 1.5 L1.5 0 L4.5 0 L6 1.5 L6 8.5 L4.5 10 L1.5 10 L0 8.5 Z', 'M3.7 7 L6.6 10.6'],
  J: ['M6 0 L6 8.3 L4.3 10 L1.7 10 L0 8.3'],
  ' ': [],
};

const NS = 'http://www.w3.org/2000/svg';

/**
 * Build the wordmark as an <svg>.
 * @param {string} text  characters to draw (uppercase)
 * @param {object} o     { gap, stroke, color, accentIndex, glow }
 */
export function wordmark(text = 'AETHERIUM', o = {}) {
  const gap = o.gap ?? 3.1;
  const sw = o.stroke ?? 0.62;
  const color = o.color ?? 'currentColor';
  const H = 10;
  let x = 0;
  const groups = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    const paths = G[ch];
    if (!paths) { x += 4 + gap; continue; }
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${x.toFixed(2)} 0)`);
    for (const d of paths) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', i === o.accentIndex ? (o.accent || 'var(--ae-acc)') : color);
      p.setAttribute('stroke-width', sw);
      p.setAttribute('stroke-linecap', 'butt');
      p.setAttribute('stroke-linejoin', 'miter');
      if (o.hairline) p.setAttribute('vector-effect', 'non-scaling-stroke');
      g.appendChild(p);
    }
    groups.push(g);
    x += 6 + gap;
  }
  const W = Math.max(1, x - gap);
  const svgEl = document.createElementNS(NS, 'svg');
  svgEl.setAttribute('viewBox', `${-sw} ${-sw} ${W + sw * 2} ${H + sw * 2}`);
  svgEl.setAttribute('preserveAspectRatio', 'xMinYMid meet');
  if (o.glow !== false) svgEl.setAttribute('style', 'filter:drop-shadow(0 0 14px rgba(95,227,255,.22))');
  groups.forEach((g) => svgEl.appendChild(g));
  return svgEl;
}

/** Small signature glyph — a hexagonal seal used as the boot / brand ident. */
export function seal(size = 34) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 40 40');
  s.setAttribute('width', size); s.setAttribute('height', size);
  const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const hex = (r) => {
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; pts.push((20 + Math.cos(a) * r).toFixed(2) + ',' + (20 + Math.sin(a) * r).toFixed(2)); }
    return pts.join(' ');
  };
  s.appendChild(mk('polygon', { points: hex(18), fill: 'none', stroke: 'currentColor', 'stroke-width': 1, opacity: .55 }));
  s.appendChild(mk('polygon', { points: hex(11.5), fill: 'none', stroke: 'currentColor', 'stroke-width': 1, opacity: .9 }));
  s.appendChild(mk('path', { d: 'M20 8.5 L20 31.5 M10.4 14 L29.6 26 M29.6 14 L10.4 26', stroke: 'currentColor', 'stroke-width': .7, opacity: .35, fill: 'none' }));
  s.appendChild(mk('circle', { cx: 20, cy: 20, r: 3, fill: 'currentColor', opacity: .9 }));
  return s;
}
