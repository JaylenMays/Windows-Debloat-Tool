/* AETHERIUM — pause menu + settings. Emits `ui:setting` {key,value}. */
import { el, panel, menuItem, button, slider, option, toggle, icon, clear, sfx } from './widgets.js';
import { seal } from './logo.js';

export const SETTINGS = [
  { section: 'Display', key: 'quality', label: 'Quality Preset', type: 'option', options: ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'], value: 'HIGH' },
  { section: 'Display', key: 'resolutionScale', label: 'Resolution Scale', type: 'slider', min: .5, max: 2, step: .05, value: 1, fmt: (v) => v.toFixed(2) + '×' },
  { section: 'Display', key: 'fov', label: 'Field of View', type: 'slider', min: 60, max: 110, step: 1, value: 80, fmt: (v) => Math.round(v) + '°' },
  { section: 'Display', key: 'vsync', label: 'Vertical Sync', type: 'toggle', value: true },
  { section: 'Display', key: 'frameCap', label: 'Frame Cap', type: 'option', options: ['30', '60', '120', 'UNCAPPED'], value: '120' },
  { section: 'Display', key: 'shadows', label: 'Shadow Detail', type: 'option', options: ['OFF', 'LOW', 'HIGH', 'ULTRA'], value: 'HIGH' },

  { section: 'Post FX', key: 'motionBlur', label: 'Motion Blur', type: 'slider', min: 0, max: 1, step: .01, value: .35 },
  { section: 'Post FX', key: 'filmGrain', label: 'Film Grain', type: 'slider', min: 0, max: 1, step: .01, value: .22 },
  { section: 'Post FX', key: 'bloom', label: 'Bloom', type: 'slider', min: 0, max: 1, step: .01, value: .55 },
  { section: 'Post FX', key: 'chromaticAberration', label: 'Chromatic Aberration', type: 'slider', min: 0, max: 1, step: .01, value: .18 },
  { section: 'Post FX', key: 'vignette', label: 'Vignette', type: 'slider', min: 0, max: 1, step: .01, value: .4 },
  { section: 'Post FX', key: 'lensFlare', label: 'Lens Flare', type: 'toggle', value: true },

  { section: 'Audio', key: 'masterVolume', label: 'Master Volume', type: 'slider', min: 0, max: 1, step: .01, value: .8, fmt: pct },
  { section: 'Audio', key: 'musicVolume', label: 'Music', type: 'slider', min: 0, max: 1, step: .01, value: .6, fmt: pct },
  { section: 'Audio', key: 'sfxVolume', label: 'Effects', type: 'slider', min: 0, max: 1, step: .01, value: .85, fmt: pct },
  { section: 'Audio', key: 'ambienceVolume', label: 'Ambience', type: 'slider', min: 0, max: 1, step: .01, value: .7, fmt: pct },
  { section: 'Audio', key: 'uiVolume', label: 'Interface', type: 'slider', min: 0, max: 1, step: .01, value: .5, fmt: pct },
  { section: 'Audio', key: 'dynamicRange', label: 'Dynamic Range', type: 'option', options: ['NIGHT', 'TV', 'FULL'], value: 'FULL' },

  { section: 'Controls', key: 'sensitivity', label: 'Look Sensitivity', type: 'slider', min: .1, max: 3, step: .05, value: 1, fmt: (v) => v.toFixed(2) },
  { section: 'Controls', key: 'adsSensitivity', label: 'Scoped Sensitivity', type: 'slider', min: .1, max: 2, step: .05, value: .7, fmt: (v) => v.toFixed(2) },
  { section: 'Controls', key: 'invertY', label: 'Invert Y Axis', type: 'toggle', value: false },
  { section: 'Controls', key: 'invertX', label: 'Invert X Axis', type: 'toggle', value: false },
  { section: 'Controls', key: 'deadzone', label: 'Stick Deadzone', type: 'slider', min: 0, max: .5, step: .01, value: .12, fmt: (v) => v.toFixed(2) },
  { section: 'Controls', key: 'aimAssist', label: 'Aim Assist', type: 'option', options: ['OFF', 'LIGHT', 'STANDARD'], value: 'LIGHT' },

  { section: 'Access', key: 'subtitles', label: 'Subtitles', type: 'toggle', value: true },
  { section: 'Access', key: 'subtitleSize', label: 'Subtitle Size', type: 'option', options: ['SMALL', 'MEDIUM', 'LARGE'], value: 'MEDIUM' },
  { section: 'Access', key: 'reducedMotion', label: 'Reduced Motion', type: 'toggle', value: false },
  { section: 'Access', key: 'photosensitive', label: 'Photosensitive Mode', type: 'toggle', value: false },
  { section: 'Access', key: 'colorblind', label: 'Colour Profile', type: 'option', options: ['STANDARD', 'PROTAN', 'DEUTAN', 'TRITAN'], value: 'STANDARD' },
  { section: 'Access', key: 'hudOpacity', label: 'HUD Opacity', type: 'slider', min: .3, max: 1, step: .01, value: 1, fmt: pct },
];
function pct(v) { return Math.round(v * 100) + '%'; }

/* ───────────────────────── pause ───────────────────────── */
export function buildPause(ui) {
  const menu = el('nav', { class: 'ae-menu' });
  const items = [
    ['resume', 'return to link', () => ui.emit('ui:resume', {})],
    ['codex', 'archive', () => ui.showScreen('codex')],
    ['starmap', 'navigation', () => ui.showScreen('starmap')],
    ['settings', 'configure', () => ui.showScreen('settings', { from: 'pause' })],
    ['abandon link', 'return to title', () => ui.emit('ui:quit', {})],
  ];
  items.forEach(([l, h, fn], i) => menu.appendChild(menuItem({ index: i + 1, label: l, hint: h, onClick: fn })));
  menu.querySelectorAll('.ae-mi').forEach((n, i) => { n.classList.add('ae-inL'); n.style.setProperty('--i', String(i + 2)); });

  const statPanel = panel({ title: 'session', sub: 'live' });
  const stats = [
    ['elapsed', '04:12:38'], ['systems visited', '17'], ['species catalogued', '86'],
    ['light-years', '2 481.6'], ['keys recovered', '1 / 3'], ['anomalies', '4'],
  ];
  stats.forEach(([k, v], i) => statPanel.body.appendChild(
    el('div', { style: 'display:flex;justify-content:space-between;padding:9px 0' + (i < stats.length - 1 ? ';border-bottom:1px solid var(--ae-line)' : '') },
      el('span', { class: 'ae-k', text: k }),
      el('span', { class: 'ae-num', style: 'font-size:11.5px;color:' + (k === 'keys recovered' ? 'var(--ae-warm)' : 'var(--ae-ink)'), text: v }))));

  const root = el('div', { class: 'ae-screen ae-pz', 'data-screen': 'pause' },
    el('div', { class: 'ae-veil' }),
    el('div', { class: 'ae-pz__in' },
      el('div', { class: 'ae-pz__hd ae-in', style: '--i:0' },
        el('div', { style: 'display:flex;align-items:center;gap:14px;margin-bottom:14px' },
          el('span', { style: 'color:var(--ae-acc);display:flex' }, seal(24)),
          el('span', { class: 'ae-k ae-k--acc', style: 'letter-spacing:.42em', text: 'link suspended' })),
        el('h1', { class: 'ae-pz__ti ae-chrom', text: 'PAUSED' })),
      menu),
    el('div', { class: 'ae-pz__st ae-inR', style: '--i:3' }, statPanel),
    el('div', { class: 'ae-fx' }));
  return root;
}

/* ───────────────────────── settings ───────────────────────── */
export function buildSettings(ui) {
  const nav = el('div', { class: 'ae-st__nav' });
  const body = el('div', { class: 'ae-st__body', 'data-scroll': '1' });
  const titleEl = el('h1', { class: 'ae-st__ti', text: 'SETTINGS' });
  const secEl = el('span', { class: 'ae-k ae-k--acc', text: 'display' });
  const subEl = el('span', { class: 'ae-k', text: '' });

  const main = panel({ cls: 'ae-st__main' });
  main.body.remove();
  main.appendChild(el('div', { style: 'padding:22px 26px 0' },
    el('div', { class: 'ae-st__hd' }, titleEl, secEl, el('i', { style: 'flex:1' }), subEl)));
  body.style.margin = '0 26px';
  main.appendChild(body);
  const foot = el('div', { class: 'ae-st__foot', style: 'margin:0 26px 22px' });
  main.appendChild(foot);

  const values = {};
  const controls = new Map();
  let section = 'Display';

  function sections() { const s = []; for (const d of SETTINGS) if (!s.includes(d.section)) s.push(d.section); return s; }

  function emit(k, v) { values[k] = v; ui.emit('ui:setting', { key: k, value: v }); }

  function build(d) {
    let c;
    if (d.type === 'option') c = option({ label: d.label, options: d.options, value: values[d.key], onChange: (v) => emit(d.key, v) });
    else if (d.type === 'toggle') c = toggle({ label: d.label, value: values[d.key], onChange: (v) => emit(d.key, v) });
    else c = slider({ label: d.label, min: d.min, max: d.max, step: d.step, value: values[d.key], format: d.fmt, onInput: (v) => emit(d.key, v) });
    return c;
  }

  const anchors = new Map();

  /* the whole option set lives in one scroll; the rail highlights + jumps */
  function renderBody() {
    clear(body); controls.clear(); anchors.clear();
    subEl.textContent = String(SETTINGS.length).padStart(2, '0') + ' options · ' + sections().length + ' groups';
    let i = 0, last = null;
    for (const d of SETTINGS) {
      if (d.section !== last) {
        last = d.section;
        const h = el('div', { class: 'ae-st__sec ae-in', style: '--i:' + (i++) },
          el('i', { class: 'ae-dot' }),
          el('span', { class: 'ae-k', text: d.section }),
          el('i', { class: 'ae-r' }),
          el('span', { class: 'ae-k', text: String(SETTINGS.filter((x) => x.section === d.section).length).padStart(2, '0') }));
        anchors.set(d.section, h);
        body.appendChild(h);
      }
      const c = build(d);
      c.dataset.section = d.section;
      controls.set(d.key, c);
      c.classList.add('ae-in'); c.style.setProperty('--i', String(i++));
      body.appendChild(c);
    }
    ui.nav && ui.nav.refresh();
  }

  function setSection(s, scroll = true) {
    section = s;
    secEl.textContent = s;
    nav.querySelectorAll('.ae-cat').forEach((n) => {
      if (n.dataset.sec === s) n.setAttribute('data-on', ''); else n.removeAttribute('data-on');
    });
    const a = anchors.get(s);
    if (scroll && a) body.scrollTop = Math.max(0, a.offsetTop - body.offsetTop - 8);
  }

  function renderNav() {
    clear(nav);
    sections().forEach((s, i) => {
      const b = el('button', {
        class: 'ae-cat ae-nav ae-inL', 'data-nav': '1', type: 'button', style: '--i:' + i, 'data-sec': s,
        'data-on': s === section ? '' : null,
        onclick: () => { sfx('ui.tab'); setSection(s); },
        onmouseenter: () => sfx('ui.hover'),
      },
        el('i', { class: 'ae-cat__bg' }), el('i', { class: 'ae-cat__bar' }),
        el('span', { class: 'ae-cat__l', text: s }),
        el('span', { class: 'ae-cat__n', text: String(SETTINGS.filter((x) => x.section === s).length).padStart(2, '0') }));
      nav.appendChild(b);
    });
  }

  /* keep the rail in sync while scrolling */
  body.addEventListener('scroll', () => {
    let cur = sections()[0];
    for (const [s, a] of anchors) if (a.offsetTop - body.offsetTop - 20 <= body.scrollTop) cur = s;
    if (cur !== section) setSection(cur, false);
  });

  function defaults() { for (const d of SETTINGS) values[d.key] = d.value; }
  defaults();

  clear(foot);
  foot.appendChild(button({ label: 'restore defaults', sm: true, iconName: 'undo', onClick: () => {
    defaults();
    for (const [k, c] of controls) c.setValue(values[k]);
    for (const d of SETTINGS) ui.emit('ui:setting', { key: d.key, value: values[d.key] });
  } }));
  foot.appendChild(el('i', { style: 'flex:1' }));
  ['← → adjust', '↑ ↓ move', 'esc · back'].forEach((t) => foot.appendChild(el('span', { class: 'ae-k', style: 'margin-left:26px', text: t })));

  const root = el('div', { class: 'ae-screen ae-st', 'data-screen': 'settings' },
    el('div', { class: 'ae-veil' }),
    el('div', { class: 'ae-st__wrap' },
      el('div', { style: 'display:flex;flex-direction:column' },
        el('div', { class: 'ae-in', style: '--i:0;margin-bottom:2px' },
          el('div', { class: 'ae-k ae-k--acc', style: 'letter-spacing:.42em', text: 'configuration' })),
        nav),
      main),
    el('div', { class: 'ae-fx' }));
  main.classList.add('ae-inR'); main.style.setProperty('--i', '1');

  renderNav(); renderBody(); setSection(sections()[0], false);

  root.getValues = () => ({ ...values });
  root.setValues = (v) => {
    Object.assign(values, v || {});
    for (const [k, c] of controls) if (values[k] != null) c.setValue(values[k]);
  };
  root.emitAll = () => { for (const d of SETTINGS) ui.emit('ui:setting', { key: d.key, value: values[d.key] }); };
  return root;
}
