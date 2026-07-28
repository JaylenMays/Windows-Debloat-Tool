/* AETHERIUM — character creator SHELL.
 * Panels dock left (categories) and right (controls); the centre column is left
 * transparent so the 3D avatar renders through it.
 * Emits `ui:creator-change` {slider,value} live and `ui:creator-done` {config}. */
import { el, svg, panel, button, slider, option, toggle, swatches, icon, sfx, clear } from './widgets.js';

const SKIN = ['#f2d3bd', '#e0b696', '#c99a75', '#a8764f', '#7d5233', '#593721', '#3d2a1e', '#b7a9c9', '#8fb0a8', '#c8c2d8'];
const HAIR = ['#0d0c0e', '#2b211c', '#4d3527', '#7a5334', '#b98a4f', '#d8c39a', '#e7e7e7', '#7c93b8', '#a35a8f', '#4fb5a8'];
const IRIS = ['#6f9ad6', '#4fb5a8', '#7ac36a', '#c8a44b', '#b06a3f', '#8a6bb5', '#c94f4f', '#d8d8d8', '#5fe3ff', '#ff7a45'];
const SUITC = ['#dfe7ec', '#9aa8b2', '#4a5560', '#20272e', '#0f1418', '#284a5c', '#5a3a2a', '#7a2f3a', '#2f5a3a', '#c9a227'];
const EMIS = ['#5fe3ff', '#ff7a45', '#7fe6a8', '#c06bff', '#ffd166', '#ff4f7a', '#4fffe0', '#ffffff'];

const CALLSIGNS = ['VESPER', 'HALCYON', 'ORRERY', 'NOCTIS', 'ARDENT', 'SABLE', 'QUILL', 'MERIDIAN', 'FENNEC', 'ZEPHYR', 'CINDER', 'LUMEN'];

/** Rich default schema (~45 controls). The 3D side may replace it via `ui.creator.schema = [...]`. */
export const DEFAULT_SCHEMA = [
  // ── BODY
  { category: 'Body', key: 'height', label: 'Stature', type: 'slider', min: 150, max: 205, step: 1, value: 176, unit: 'cm' },
  { category: 'Body', key: 'build', label: 'Frame Mass', type: 'slider', min: 0, max: 1, step: .01, value: .48 },
  { category: 'Body', key: 'shoulders', label: 'Shoulder Span', type: 'slider', min: 0, max: 1, step: .01, value: .55 },
  { category: 'Body', key: 'waist', label: 'Waist Taper', type: 'slider', min: 0, max: 1, step: .01, value: .42 },
  { category: 'Body', key: 'muscle', label: 'Muscle Density', type: 'slider', min: 0, max: 1, step: .01, value: .5 },
  { category: 'Body', key: 'limbLength', label: 'Limb Ratio', type: 'slider', min: 0, max: 1, step: .01, value: .5 },
  { category: 'Body', key: 'posture', label: 'Posture Bias', type: 'slider', min: -1, max: 1, step: .01, value: 0 },
  { category: 'Body', key: 'skinTone', label: 'Dermal Tone', type: 'color', colors: SKIN, value: SKIN[2] },
  { category: 'Body', key: 'gravAdapt', label: 'Gravity Adaptation', type: 'option', options: ['TERRAN', 'LOW-G', 'HIGH-G', 'VOID-BORN'], value: 'TERRAN' },

  // ── FACE
  { category: 'Face', key: 'age', label: 'Apparent Age', type: 'slider', min: 18, max: 78, step: 1, value: 31, unit: 'y' },
  { category: 'Face', key: 'jawWidth', label: 'Jaw Width', type: 'slider', min: 0, max: 1, step: .01, value: .5 },
  { category: 'Face', key: 'jawHeight', label: 'Jaw Depth', type: 'slider', min: 0, max: 1, step: .01, value: .5 },
  { category: 'Face', key: 'cheekbone', label: 'Cheekbone Rise', type: 'slider', min: 0, max: 1, step: .01, value: .58 },
  { category: 'Face', key: 'browRidge', label: 'Brow Ridge', type: 'slider', min: 0, max: 1, step: .01, value: .44 },
  { category: 'Face', key: 'noseBridge', label: 'Nose Bridge', type: 'slider', min: 0, max: 1, step: .01, value: .5 },
  { category: 'Face', key: 'noseWidth', label: 'Nose Width', type: 'slider', min: 0, max: 1, step: .01, value: .48 },
  { category: 'Face', key: 'mouthWidth', label: 'Mouth Width', type: 'slider', min: 0, max: 1, step: .01, value: .5 },
  { category: 'Face', key: 'lipVolume', label: 'Lip Volume', type: 'slider', min: 0, max: 1, step: .01, value: .46 },
  { category: 'Face', key: 'chin', label: 'Chin Projection', type: 'slider', min: 0, max: 1, step: .01, value: .5 },
  { category: 'Face', key: 'faceAsym', label: 'Asymmetry', type: 'slider', min: 0, max: 1, step: .01, value: .12 },
  { category: 'Face', key: 'freckles', label: 'Freckle Density', type: 'slider', min: 0, max: 1, step: .01, value: .18 },
  { category: 'Face', key: 'markings', label: 'Dermal Markings', type: 'option', options: ['NONE', 'ORBITAL', 'MERIDIAN', 'LATTICE', 'ASH'], value: 'NONE' },

  // ── HAIR
  { category: 'Hair', key: 'hairStyle', label: 'Cut', type: 'option', options: ['SHAVED', 'CROP', 'SWEPT', 'BRAIDED', 'LOCS', 'LONG', 'TOP-KNOT'], value: 'CROP' },
  { category: 'Hair', key: 'hairLength', label: 'Length', type: 'slider', min: 0, max: 1, step: .01, value: .34 },
  { category: 'Hair', key: 'hairVolume', label: 'Volume', type: 'slider', min: 0, max: 1, step: .01, value: .5 },
  { category: 'Hair', key: 'hairCurl', label: 'Curl', type: 'slider', min: 0, max: 1, step: .01, value: .3 },
  { category: 'Hair', key: 'hairColor', label: 'Base Colour', type: 'color', colors: HAIR, value: HAIR[1] },
  { category: 'Hair', key: 'hairTip', label: 'Tip Colour', type: 'color', colors: HAIR, value: HAIR[1] },
  { category: 'Hair', key: 'facialHair', label: 'Facial Hair', type: 'option', options: ['NONE', 'STUBBLE', 'GOATEE', 'FULL', 'MUSTACHE'], value: 'NONE' },

  // ── EYES
  { category: 'Eyes', key: 'irisColor', label: 'Iris', type: 'color', colors: IRIS, value: IRIS[0] },
  { category: 'Eyes', key: 'irisSize', label: 'Iris Radius', type: 'slider', min: 0, max: 1, step: .01, value: .5 },
  { category: 'Eyes', key: 'pupil', label: 'Pupil Dilation', type: 'slider', min: 0, max: 1, step: .01, value: .4 },
  { category: 'Eyes', key: 'eyeSpacing', label: 'Eye Spacing', type: 'slider', min: 0, max: 1, step: .01, value: .5 },
  { category: 'Eyes', key: 'eyeTilt', label: 'Canthal Tilt', type: 'slider', min: -1, max: 1, step: .01, value: .1 },
  { category: 'Eyes', key: 'lidAperture', label: 'Lid Aperture', type: 'slider', min: 0, max: 1, step: .01, value: .58 },
  { category: 'Eyes', key: 'lashDensity', label: 'Lash Density', type: 'slider', min: 0, max: 1, step: .01, value: .5 },
  { category: 'Eyes', key: 'ocularImplant', label: 'Ocular Implant', type: 'option', options: ['NONE', 'RETICLE', 'FULL-BLACK', 'AUGUR', 'SPLIT'], value: 'NONE' },

  // ── SUIT
  { category: 'Suit', key: 'suitPattern', label: 'Chassis', type: 'option', options: ['SURVEYOR', 'DEEP-DIVE', 'RECLAIMER', 'ENVOY', 'ASCETIC'], value: 'SURVEYOR' },
  { category: 'Suit', key: 'suitPrimary', label: 'Primary', type: 'color', colors: SUITC, value: SUITC[3] },
  { category: 'Suit', key: 'suitSecondary', label: 'Secondary', type: 'color', colors: SUITC, value: SUITC[1] },
  { category: 'Suit', key: 'suitEmissive', label: 'Emissive', type: 'color', colors: EMIS, value: EMIS[0] },
  { category: 'Suit', key: 'emissiveGain', label: 'Emissive Gain', type: 'slider', min: 0, max: 1, step: .01, value: .55 },
  { category: 'Suit', key: 'visorTint', label: 'Visor Tint', type: 'color', colors: EMIS, value: EMIS[0] },
  { category: 'Suit', key: 'visorOpacity', label: 'Visor Opacity', type: 'slider', min: 0, max: 1, step: .01, value: .68 },
  { category: 'Suit', key: 'wear', label: 'Field Wear', type: 'slider', min: 0, max: 1, step: .01, value: .3 },
  { category: 'Suit', key: 'plating', label: 'Plate Coverage', type: 'slider', min: 0, max: 1, step: .01, value: .55 },
  { category: 'Suit', key: 'insignia', label: 'Insignia', type: 'option', options: ['NONE', 'CARTOGRAPHERS', 'THE QUIET', 'HELIOTROPE', 'FOUNDER-SEEK'], value: 'CARTOGRAPHERS' },

  // ── IDENTITY
  { category: 'Identity', key: 'callsign', label: 'Callsign', type: 'option', options: CALLSIGNS, value: CALLSIGNS[0] },
  { category: 'Identity', key: 'origin', label: 'Origin', type: 'option', options: ['TERRA NOVA', 'THE SHOALS', 'KEPLER DRIFT', 'AN ORPHAN HAB', 'UNRECORDED'], value: 'THE SHOALS' },
  { category: 'Identity', key: 'archetype', label: 'Discipline', type: 'option', options: ['SURVEYOR', 'XENOBIOLOGIST', 'SALVAGER', 'ARCHIVIST', 'DRIFTER'], value: 'SURVEYOR' },
  { category: 'Identity', key: 'voice', label: 'Voice Print', type: 'option', options: ['I', 'II', 'III', 'IV', 'V', 'VI'], value: 'II' },
  { category: 'Identity', key: 'pronouns', label: 'Pronouns', type: 'option', options: ['SHE/HER', 'HE/HIM', 'THEY/THEM', 'UNSET'], value: 'THEY/THEM' },
  { category: 'Identity', key: 'permadeath', label: 'Permanent Death', type: 'toggle', value: false },
];

const CAT_ICON = { Body: 'body', Face: 'face', Hair: 'hair', Eyes: 'eye', Suit: 'suit', Identity: 'id' };

export function buildCreator(ui) {
  const cats = el('div', { class: 'ae-cr__cats' });
  const scroll = el('div', { class: 'ae-cr__scroll', 'data-scroll': '1' });

  const railPanel = panel({ title: 'morphology', sub: 'v9', cls: 'ae-cr__rail' });
  clear(railPanel.body); railPanel.body.remove();
  const presets = el('div', { class: 'ae-cr__presets' });
  railPanel.appendChild(el('div', { class: 'ae-cr__cats-wrap' }, cats, presets));

  const stackPanel = panel({ title: 'parameters', sub: '—', cls: 'ae-cr__stack' });
  const subEl = stackPanel.querySelector('.ae-phd__s');
  stackPanel.body.remove();
  const tools = el('div', { class: 'ae-cr__tools' });
  const foot = el('div', { class: 'ae-cr__foot' });
  stackPanel.appendChild(tools);
  stackPanel.appendChild(scroll);
  stackPanel.appendChild(foot);

  // stage decoration — thin, keeps the centre clear
  const ringSvg = svg('svg', { class: 'ae-cr__ring', viewBox: '0 0 430 96', preserveAspectRatio: 'none' });
  for (let i = 3; i >= 0; i--) {
    ringSvg.appendChild(svg('ellipse', { cx: 215, cy: 62, rx: 60 + i * 56, ry: 13 + i * 12,
      fill: 'none', stroke: 'rgba(95,227,255,' + (0.30 - i * 0.06) + ')', 'stroke-width': 1 }));
  }
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2;
    ringSvg.appendChild(svg('line', {
      x1: (215 + Math.cos(a) * 210).toFixed(1), y1: (62 + Math.sin(a) * 48).toFixed(1),
      x2: (215 + Math.cos(a) * 196).toFixed(1), y2: (62 + Math.sin(a) * 45).toFixed(1),
      stroke: 'rgba(95,227,255,.25)', 'stroke-width': i % 9 === 0 ? 1.2 : .6 }));
  }

  const nameTag = el('div', { class: 'ae-cr__tag' },
    el('div', { class: 'ae-k', style: 'color:var(--ae-acc)', text: 'materialization chamber' }),
    el('div', { class: 'ae-h', style: 'font-size:22px;margin-top:8px', text: 'VESPER' }),
    el('div', { class: 'ae-k', style: 'margin-top:6px', text: 'surveyor · the shoals' }));

  const stage = el('div', { class: 'ae-cr__stage' }, ringSvg, nameTag);

  const root = el('div', { class: 'ae-screen ae-cr', 'data-screen': 'creator', 'data-passthru': '1' },
    el('div', { class: 'ae-veil ae-veil--soft' }),
    stage,
    el('div', { class: 'ae-hit' }, railPanel),
    el('div', { class: 'ae-hit' }, stackPanel),
    el('div', { class: 'ae-fx' }));

  /* ── state ── */
  let schema = DEFAULT_SCHEMA;
  let config = {};
  let activeCat = null;
  const controls = new Map();

  function defaults() {
    const c = {};
    for (const s of schema) c[s.key] = s.value ?? (s.type === 'slider' ? (s.min + s.max) / 2 : s.type === 'toggle' ? false : (s.options ? s.options[0] : null));
    return c;
  }
  function categories() {
    const out = [];
    for (const s of schema) if (!out.includes(s.category)) out.push(s.category);
    return out;
  }

  function change(key, value) {
    config[key] = value;
    if (key === 'callsign') nameTag.children[1].textContent = String(value);
    if (key === 'archetype' || key === 'origin')
      nameTag.children[2].textContent = String(config.archetype || '') + ' · ' + String(config.origin || '');
    ui.emit('ui:creator-change', { slider: key, value });
  }

  function buildControl(s) {
    const common = { label: s.label, onChange: (v) => change(s.key, v) };
    let c;
    if (s.type === 'color') c = swatches({ ...common, colors: s.colors, value: config[s.key] });
    else if (s.type === 'option') c = option({ ...common, options: s.options, value: config[s.key] });
    else if (s.type === 'toggle') c = toggle({ ...common, value: config[s.key] });
    else {
      const unit = s.unit || '';
      c = slider({
        label: s.label, min: s.min ?? 0, max: s.max ?? 1, step: s.step ?? .01, value: config[s.key],
        format: (v) => (s.step >= 1 ? Math.round(v) + unit : v.toFixed(2)),
        onInput: (v) => change(s.key, v),
      });
    }
    c.dataset.key = s.key;
    return c;
  }

  function renderCategory(cat, animate = true) {
    activeCat = cat;
    cats.querySelectorAll('.ae-cat').forEach((n) => {
      if (n.dataset.cat === cat) n.setAttribute('data-on', ''); else n.removeAttribute('data-on');
    });
    clear(scroll); controls.clear();
    const list = schema.filter((s) => s.category === cat);
    subEl.textContent = String(list.length).padStart(2, '0') + ' params';
    const grp = el('div', { class: 'ae-cr__grp' });
    list.forEach((s, i) => {
      const c = buildControl(s);
      controls.set(s.key, c);
      if (animate) { c.classList.add('ae-inR'); c.style.setProperty('--i', String(i)); }
      grp.appendChild(c);
    });
    scroll.appendChild(grp);
    // restart entry animation
    if (animate && root.hasAttribute('data-active')) { root.removeAttribute('data-active'); void root.offsetWidth; root.setAttribute('data-active', ''); }
    ui.nav && ui.nav.refresh();
  }

  function renderCats() {
    clear(cats);
    categories().forEach((c, i) => {
      const n = schema.filter((s) => s.category === c).length;
      const b = el('button', {
        class: 'ae-cat ae-nav ae-inL', 'data-nav': '1', 'data-cat': c, type: 'button',
        style: '--i:' + i,
        onclick: () => { sfx('ui.tab'); renderCategory(c); },
        onmouseenter: () => sfx('ui.hover'),
      },
        el('i', { class: 'ae-cat__bg' }), el('i', { class: 'ae-cat__bar' }),
        el('span', { class: 'ae-cat__ic', style: 'display:flex' }, icon(CAT_ICON[c] || 'anom', 16)),
        el('span', { class: 'ae-cat__l', text: c }),
        el('span', { class: 'ae-cat__n', text: String(n).padStart(2, '0') }));
      cats.appendChild(b);
    });
  }

  function randomize() {
    for (const s of schema) {
      let v;
      if (s.type === 'color') v = s.colors[(Math.random() * s.colors.length) | 0];
      else if (s.type === 'option') v = s.options[(Math.random() * s.options.length) | 0];
      else if (s.type === 'toggle') v = Math.random() < .2;
      else {
        const min = s.min ?? 0, max = s.max ?? 1, st = s.step ?? .01;
        v = +(Math.round((min + Math.random() * (max - min)) / st) * st).toFixed(6);
      }
      config[s.key] = v;
      const c = controls.get(s.key); if (c) c.setValue(v);
      ui.emit('ui:creator-change', { slider: s.key, value: v });
    }
    nameTag.children[1].textContent = String(config.callsign ?? 'UNNAMED');
    nameTag.children[2].textContent = String(config.archetype ?? '') + ' · ' + String(config.origin ?? '');
    sfx('ui.confirm');
  }
  function reset() {
    config = defaults();
    for (const [k, c] of controls) c.setValue(config[k]);
    for (const s of schema) ui.emit('ui:creator-change', { slider: s.key, value: config[s.key] });
    nameTag.children[1].textContent = String(config.callsign ?? 'UNNAMED');
    nameTag.children[2].textContent = String(config.archetype ?? '') + ' · ' + String(config.origin ?? '');
    sfx('ui.back');
  }

  /* preset seeds — deterministic randomize from a fixed seed */
  function applyPreset(seed) {
    let s = seed >>> 0;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (const d of schema) {
      let v;
      if (d.type === 'color') v = d.colors[(rnd() * d.colors.length) | 0];
      else if (d.type === 'option') v = d.options[(rnd() * d.options.length) | 0];
      else if (d.type === 'toggle') v = false;
      else {
        const min = d.min ?? 0, max = d.max ?? 1, st = d.step ?? .01;
        v = +(Math.round((min + (0.28 + rnd() * 0.44) * (max - min)) / st) * st).toFixed(6);
      }
      config[d.key] = v;
      const c = controls.get(d.key); if (c) c.setValue(v);
      ui.emit('ui:creator-change', { slider: d.key, value: v });
    }
    nameTag.children[1].textContent = String(config.callsign ?? 'UNNAMED');
    nameTag.children[2].textContent = String(config.archetype ?? '') + ' · ' + String(config.origin ?? '');
    sfx('ui.confirm');
  }
  clear(presets);
  presets.appendChild(el('div', { class: 'ae-k', style: 'margin-bottom:3px', text: 'saved shells' }));
  [['SURVEYOR-01', 0x5eed01], ['DEEP-DIVE-04', 0x5eed02], ['THE QUIET', 0x5eed03]].forEach(([label, seed], i) => {
    presets.appendChild(button({ label, sm: true, onClick: () => applyPreset(seed) }));
  });

  clear(tools);
  tools.appendChild(button({ label: 'randomize', sm: true, iconName: 'dice', onClick: randomize }));
  tools.appendChild(button({ label: 'reset', sm: true, iconName: 'undo', onClick: reset }));
  tools.appendChild(el('i', { class: 'ae-cr__spacer' }));
  tools.appendChild(el('span', { class: 'ae-k', text: 'lmb · drag' }));

  clear(foot);
  foot.appendChild(el('div', { style: 'display:flex;justify-content:space-between' },
    el('span', { class: 'ae-k', text: 'genome hash' }),
    el('span', { class: 'ae-k ae-k--acc', id: 'ae-cr-hash', text: '—' })));
  const mat = button({ label: 'materialize', kind: 'pri', iconName: 'check', sfxName: 'ui.confirm',
    onClick: () => ui.emit('ui:creator-done', { config: { ...config } }) });
  foot.appendChild(mat);
  const hashEl = foot.querySelector('#ae-cr-hash');

  function refreshHash() {
    let h = 2166136261;
    for (const k of Object.keys(config).sort()) {
      const s = k + ':' + config[k];
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    }
    hashEl.textContent = (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }
  setInterval(() => { if (root.hasAttribute('data-active')) refreshHash(); }, 400);

  /* ── public API ── */
  root.setSchema = (s) => {
    if (!Array.isArray(s) || !s.length) return;
    schema = s; config = defaults(); renderCats();
    renderCategory(categories()[0], false); refreshHash();
  };
  root.getConfig = () => ({ ...config });
  root.reset = reset;
  root.randomize = randomize;
  root.onEnter = () => { renderCategory(activeCat || categories()[0]); refreshHash(); };

  config = defaults();
  renderCats();
  renderCategory(categories()[0], false);
  refreshHash();
  return root;
}
