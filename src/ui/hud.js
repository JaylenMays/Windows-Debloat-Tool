/* AETHERIUM — in-flight HUD. Minimal at rest, blooms into detail while scanning / aiming.
 * Compass ribbon and reticle are canvas-drawn; vitals are SVG arcs. */
import { el, svg, panel, icon, arcGauge, clamp, lerp, countUp, sfx, clear } from './widgets.js';

const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const MK_COLOR = { objective: '#5fe3ff', poi: '#9fb6c2', hostile: '#ff7a45', resource: '#7fe6a8', key: '#ffd166', ship: '#5fe3ff' };

export function buildHUD(ui) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  /* ── vitals ── */
  const vitals = [
    { key: 'o2', label: 'o₂', color: '#5fe3ff', max: 100 },
    { key: 'integrity', label: 'integ', color: '#dceaf1', max: 100 },
    { key: 'energy', label: 'energy', color: '#ffd166', max: 100 },
  ].map((v) => {
    const g = arcGauge({ color: v.color });
    const num = el('div', { class: 'ae-vit__n', text: '100' });
    const wrap = el('div', { class: 'ae-vit__i' }, g, num, el('div', { class: 'ae-vit__l', text: v.label }));
    return { ...v, g, num, wrap, cur: 100 };
  });
  const vitalsBox = el('div', { class: 'ae-hud__b ae-vit', 'data-fade': '1' }, ...vitals.map((v) => v.wrap));

  /* ── compass ── */
  const cmpCv = el('canvas', { class: 'ae-cmp__cv' });
  const cmpHd = el('div', { class: 'ae-cmp__hd' },
    el('span', { class: 'ae-k ae-k--acc', id: 'ae-cmp-deg', text: '000°' }),
    el('span', { class: 'ae-k', id: 'ae-cmp-sec', text: 'sector 00-00' }));
  const compass = el('div', { class: 'ae-hud__b ae-cmp' }, cmpCv, cmpHd);
  const degEl = cmpHd.children[0], secEl = cmpHd.children[1];

  /* ── objective ── */
  const objTitle = el('div', { class: 'ae-obj__t', text: '—' });
  const objSub = el('div', { class: 'ae-obj__s', text: '' });
  const objPanel = panel({ corners: true });
  clear(objPanel.body);
  objPanel.body.appendChild(el('div', { class: 'ae-obj__hd' },
    el('span', { class: 'ae-k ae-k--acc', text: 'objective' }), el('i', { class: 'ae-dot' })));
  objPanel.body.appendChild(objTitle);
  objPanel.body.appendChild(objSub);
  objPanel.body.setAttribute('style', 'text-align:right');
  const objective = el('div', { class: 'ae-hud__b ae-obj', 'data-fade': '1' }, objPanel);

  /* ── reticle ── */
  const retCv = el('canvas', { class: 'ae-ret__cv' });
  const reticle = el('div', { class: 'ae-hud__b ae-ret' }, retCv);
  const scanLabel = el('div', { class: 'ae-scanlb' },
    el('div', { class: 'ae-k ae-k--acc', id: 'ae-scan-t', text: 'analysing' }),
    el('div', { class: 'ae-num', style: 'font-size:19px;margin-top:5px', id: 'ae-scan-p', text: '0%' }));
  const scanT = scanLabel.children[0], scanP = scanLabel.children[1];

  /* ── prompt ── */
  const promptK = el('span', { class: 'ae-prompt__k', text: 'E' });
  const promptL = el('span', { class: 'ae-prompt__l', text: '' });
  const prompt = el('div', { class: 'ae-hud__b ae-prompt' }, promptK, promptL);

  /* ── telemetry ── */
  const spdV = el('span', { class: 'ae-tel__v', text: '0' });
  const coordsEl = el('span', { class: 'ae-k', text: '—' });
  const telemetry = el('div', { class: 'ae-hud__b ae-tel', 'data-fade': '1' },
    el('div', { class: 'ae-tel__spd' }, spdV, el('span', { class: 'ae-k', text: 'm/s' })),
    el('i', { class: 'ae-tel__rule' }),
    coordsEl,
    el('span', { class: 'ae-k', text: 'local frame · drift 0.00' }));

  /* ── discovery log / toasts / subtitles ── */
  const dlog = el('div', { class: 'ae-hud__b ae-dlog' });
  const toasts = el('div', { class: 'ae-hud__b ae-toasts' });
  const subT = el('div', { class: 'ae-sub__t', text: '' });
  const subW = el('div', { class: 'ae-sub__w', text: '' });
  const subtitle = el('div', { class: 'ae-sub' }, subW, subT);

  const root = el('div', { class: 'ae-screen ae-hud', 'data-screen': 'hud', 'data-passthru': '1' },
    el('div', { class: 'ae-hud__vig' }),
    vitalsBox, compass, objective, reticle, scanLabel, prompt, telemetry, dlog, toasts, subtitle);

  /* ═══════════ canvas painting ═══════════ */
  let heading = 0, headingT = 0, markers = [];
  let scan = null, scanShown = 0;
  let retState = 'idle', retMix = 0;
  let sector = '00-00';

  function sizeCanvas(cv, w, h) {
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    return c;
  }

  function drawCompass() {
    const w = cmpCv.clientWidth || 720, h = 56;
    const c = sizeCanvas(cmpCv, w, h);
    const pxPerDeg = w / 110;               // ~110° of arc visible
    const baseY = 30;
    const hdgDeg = (headingT * 180 / Math.PI + 360) % 360;

    c.lineWidth = 1;
    // horizon rule
    const grad = c.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(129,196,218,0)');
    grad.addColorStop(.5, 'rgba(129,196,218,.45)');
    grad.addColorStop(1, 'rgba(129,196,218,0)');
    c.strokeStyle = grad;
    c.beginPath(); c.moveTo(0, baseY + .5); c.lineTo(w, baseY + .5); c.stroke();

    // ticks live on an absolute 2.5° grid so cardinals always land exactly
    const STEP = 2.5;
    const start = Math.ceil((hdgDeg - 58) / STEP) * STEP;
    for (let deg = start; deg <= hdgDeg + 58; deg += STEP) {
      const x = w / 2 + (deg - hdgDeg) * pxPerDeg;
      const fade = clamp(1 - Math.abs(x - w / 2) / (w / 2) * 1.05, 0, 1);
      if (fade <= 0.02) continue;
      const norm = ((deg % 360) + 360) % 360;
      const isMajor = Math.abs(norm % 45) < .01 || Math.abs(norm % 45 - 45) < .01;
      const isMid = Math.abs(norm % 15) < .01 || Math.abs(norm % 15 - 15) < .01;
      const len = isMajor ? 12 : isMid ? 7 : 3.5;
      c.strokeStyle = `rgba(${isMajor ? '175,230,248' : '129,196,218'},${(isMajor ? .85 : .32) * fade})`;
      c.lineWidth = isMajor ? 1.2 : 1;
      c.beginPath(); c.moveTo(x + .5, baseY - len); c.lineTo(x + .5, baseY); c.stroke();
      if (isMajor) {
        const idx = Math.round(norm / 45) % 8;
        const card = idx % 2 === 0;
        c.fillStyle = `rgba(${card ? '226,244,252' : '145,186,202'},${(card ? .95 : .7) * fade})`;
        c.font = `${card ? 12 : 9.5}px ui-monospace, "DejaVu Sans Mono", monospace`;
        c.textAlign = 'center';
        c.fillText(card ? CARD[idx] : String(norm).padStart(3, '0'), x, baseY - 17);
      }
    }

    // markers
    for (const m of markers) {
      let rel = (m.az * 180 / Math.PI - hdgDeg + 540) % 360 - 180;
      const clamped = clamp(rel, -58, 58);
      const x = w / 2 + clamped * pxPerDeg;
      const off = Math.abs(rel) > 58;
      const col = MK_COLOR[m.type] || '#9fb6c2';
      const y = baseY + 13;
      c.save();
      c.globalAlpha = off ? .45 : 1;
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.2;
      c.beginPath();
      if (m.type === 'objective' || m.type === 'key') {          // diamond
        c.moveTo(x, y - 5); c.lineTo(x + 5, y); c.lineTo(x, y + 5); c.lineTo(x - 5, y); c.closePath();
        m.type === 'key' ? c.fill() : c.stroke();
      } else if (m.type === 'hostile') {                          // triangle
        c.moveTo(x, y + 5); c.lineTo(x + 5, y - 4); c.lineTo(x - 5, y - 4); c.closePath(); c.stroke();
      } else if (m.type === 'resource') {                         // square
        c.rect(x - 4, y - 4, 8, 8); c.stroke();
      } else {                                                     // circle
        c.arc(x, y, 4, 0, Math.PI * 2); c.stroke();
      }
      if (off) { // edge chevron
        const s = rel > 0 ? 1 : -1;
        c.beginPath(); c.moveTo(x + s * 9, y - 4); c.lineTo(x + s * 13, y); c.lineTo(x + s * 9, y + 4); c.stroke();
      }
      if (m.dist != null && !off) {
        c.globalAlpha = .75;
        c.fillStyle = col;
        c.font = '8px ui-monospace, "DejaVu Sans Mono", monospace';
        c.textAlign = 'center';
        c.fillText(fmtDist(m.dist), x, y + 16);
      }
      c.restore();
    }

    // centre bug
    c.strokeStyle = '#5fe3ff'; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(w / 2 - 6, baseY - 15); c.lineTo(w / 2, baseY - 8); c.lineTo(w / 2 + 6, baseY - 15); c.stroke();
    c.fillStyle = 'rgba(95,227,255,.9)';
    c.fillRect(w / 2 - .5, baseY - 8, 1, 8);

    degEl.textContent = String(Math.round(hdgDeg)).padStart(3, '0') + '°';
    secEl.textContent = 'sector ' + sector;
  }

  function fmtDist(d) {
    if (d >= 1e9) return (d / 1e9).toFixed(1) + 'Gm';
    if (d >= 1e6) return (d / 1e6).toFixed(1) + 'Mm';
    if (d >= 1000) return (d / 1000).toFixed(1) + 'km';
    return Math.round(d) + 'm';
  }

  function drawReticle(t) {
    const S = 220, c = sizeCanvas(retCv, S, S);
    const cx = S / 2, cy = S / 2;
    const target = retState === 'idle' ? 0 : retState === 'target' ? .5 : 1;
    retMix = lerp(retMix, target, .16);
    const bloom = Math.max(retMix, scan != null ? 1 : 0);

    const acc = '95,227,255';
    const hostile = retState === 'lock' || retState === 'hostile';
    const col = hostile ? '255,122,69' : acc;

    // inner cross
    c.strokeStyle = `rgba(${col},.95)`; c.lineWidth = 1.2;
    const gap = 5 + bloom * 4;
    const arm = 7 + bloom * 4;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      c.beginPath();
      c.moveTo(cx + dx * gap, cy + dy * gap);
      c.lineTo(cx + dx * (gap + arm), cy + dy * (gap + arm));
      c.stroke();
    }
    c.fillStyle = `rgba(${col},.9)`;
    c.fillRect(cx - .8, cy - .8, 1.6, 1.6);

    // rotating bracket ring (only when engaged)
    if (bloom > .02) {
      const r = 34 + (1 - bloom) * 8;
      c.save(); c.globalAlpha = bloom;
      c.strokeStyle = `rgba(${col},.55)`; c.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const a0 = k * Math.PI / 2 + Math.PI / 4 + t * .00018;
        c.beginPath(); c.arc(cx, cy, r, a0 - .38, a0 + .38); c.stroke();
      }
      // corner brackets
      const b = 46 + (1 - bloom) * 10;
      c.strokeStyle = `rgba(${col},.85)`; c.lineWidth = 1.3;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        c.beginPath();
        c.moveTo(cx + sx * b, cy + sy * (b - 12));
        c.lineTo(cx + sx * b, cy + sy * b);
        c.lineTo(cx + sx * (b - 12), cy + sy * b);
        c.stroke();
      }
      c.restore();
    }

    // scan progress ring
    if (scan != null) {
      scanShown = lerp(scanShown, scan, .2);
      const r = 62;
      c.save();
      c.strokeStyle = 'rgba(129,196,218,.16)'; c.lineWidth = 2.4;
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
      // segmented graduation
      c.strokeStyle = 'rgba(129,196,218,.30)'; c.lineWidth = 1;
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * Math.PI * 2 - Math.PI / 2;
        const l = i % 5 === 0 ? 6 : 3;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5));
        c.lineTo(cx + Math.cos(a) * (r + 5 + l), cy + Math.sin(a) * (r + 5 + l));
        c.stroke();
      }
      const grd = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      grd.addColorStop(0, 'rgba(95,227,255,.7)'); grd.addColorStop(1, '#5fe3ff');
      c.strokeStyle = grd; c.lineWidth = 2.4; c.lineCap = 'butt';
      c.shadowColor = '#5fe3ff'; c.shadowBlur = 10;
      c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + scanShown * Math.PI * 2); c.stroke();
      c.shadowBlur = 0;
      // leading tick
      const la = -Math.PI / 2 + scanShown * Math.PI * 2;
      c.strokeStyle = '#dff8ff'; c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(cx + Math.cos(la) * (r - 7), cy + Math.sin(la) * (r - 7));
      c.lineTo(cx + Math.cos(la) * (r + 7), cy + Math.sin(la) * (r + 7));
      c.stroke();
      // sweeping sampler arc
      const sa = t * .0016;
      c.strokeStyle = 'rgba(95,227,255,.30)'; c.lineWidth = 1;
      c.beginPath(); c.arc(cx, cy, r - 13, sa, sa + 1.1); c.stroke();
      c.beginPath(); c.arc(cx, cy, r - 19, -sa * 1.3, -sa * 1.3 + .7); c.stroke();
      c.restore();
      scanP.textContent = Math.round(scanShown * 100) + '%';
    }
  }

  let raf = 0, last = 0;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    headingT = lerp(headingT, heading, .18);
    if (t - last > 15) { last = t; drawCompass(); }
    drawReticle(t);
  }
  raf = requestAnimationFrame(frame);

  /* ═══════════ public HUD API ═══════════ */
  const api = {
    setVitals(v = {}) {
      for (const s of vitals) {
        if (v[s.key] == null) continue;
        const nv = clamp(+v[s.key], 0, s.max);
        s.g.setValue(nv / s.max);
        countUp(s.num, s.cur, nv, 420, (x) => String(Math.round(x)));
        s.cur = nv;
        const low = nv / s.max < .22;
        s.g.setColor(low ? '#ff7a45' : s.color);
        s.num.style.color = low ? '#ff7a45' : 'var(--ae-ink)';
      }
    },
    setObjective(text, sub) {
      objTitle.textContent = text || '—';
      objSub.textContent = sub || '';
      objective.style.opacity = text ? '' : '0';
    },
    setCompass(headingRad, mk) {
      if (typeof headingRad === 'number') heading = headingRad;
      if (Array.isArray(mk)) markers = mk;
    },
    setSector(s) { sector = s; },
    showToast({ title = '', body = '', kind = 'info', ms = 4600 } = {}) {
      const pr = el('i', { class: 'ae-toast__pr' });
      const t = el('div', { class: 'ae-toast ae-toast--' + kind },
        el('i', { class: 'ae-toast__bg' }),
        el('div', { class: 'ae-toast__hd' },
          el('span', { style: 'display:flex;color:currentColor;opacity:.85' },
            icon(kind === 'warn' ? 'warn' : kind === 'good' ? 'check' : 'scan', 13)),
          el('span', { class: 'ae-toast__t', text: title })),
        body ? el('div', { class: 'ae-toast__b', text: body }) : null, pr);
      toasts.appendChild(t);
      sfx(kind === 'warn' ? 'ui.error' : 'discover.minor');
      requestAnimationFrame(() => {
        pr.style.transition = `transform ${ms}ms linear`;
        pr.style.transform = 'scaleX(0)';
      });
      setTimeout(() => {
        t.setAttribute('data-out', '');
        setTimeout(() => t.remove(), 320);
      }, ms);
      while (toasts.children.length > 4) toasts.firstChild.remove();
      return t;
    },
    showSubtitle(text, ms = 3200) {
      clearTimeout(api._subT);
      if (!text) { subtitle.removeAttribute('data-on'); return; }
      let speaker = '', line = text;
      const m = /^([A-Z0-9 .'\-]{2,24}):\s*(.*)$/.exec(text);
      if (m) { speaker = m[1]; line = m[2]; }
      subW.textContent = speaker;
      subW.style.opacity = speaker ? '' : '0';
      subT.textContent = line;
      subtitle.setAttribute('data-on', '');
      api._subT = setTimeout(() => subtitle.removeAttribute('data-on'), ms);
    },
    setScanProgress(t01) {
      if (t01 == null) {
        scan = null; scanShown = 0;
        scanLabel.removeAttribute('data-on');
        root.removeAttribute('data-dim');
        return;
      }
      if (scan == null) { scanShown = 0; sfx('scan.start'); }
      scan = clamp(t01, 0, 1);
      scanLabel.setAttribute('data-on', '');
      scanT.textContent = scan >= 1 ? 'analysis complete' : 'analysing';
      root.setAttribute('data-dim', '');
    },
    setPrompt(text) {
      if (!text) { prompt.removeAttribute('data-on'); return; }
      const m = /^\[(.{1,5})\]\s*(.*)$/.exec(text);
      promptK.textContent = m ? m[1] : 'E';
      promptL.textContent = m ? m[2] : text;
      prompt.setAttribute('data-on', '');
    },
    setSpeed(v) { spdV.textContent = Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)); },
    setCoords(str) { coordsEl.textContent = str; },
    setReticle(state) { retState = state || 'idle'; },
    setDiscoveryLog(entries = []) {
      clear(dlog);
      entries.slice(-4).forEach((e, i) => {
        const n = el('div', { class: 'ae-dl' + (e.kind === 'warn' ? ' ae-dl--warm' : ''), style: 'animation-delay:' + (i * 70) + 'ms' },
          el('i', { class: 'ae-dl__bg' }),
          el('div', { class: 'ae-dl__t', text: e.title || 'discovered' }),
          e.body ? el('div', { class: 'ae-dl__b', text: e.body }) : null);
        dlog.appendChild(n);
      });
    },
    pushDiscovery(e) {
      api._entries = (api._entries || []).concat([e]);
      api.setDiscoveryLog(api._entries);
      sfx('discover.major');
    },
    dispose() { cancelAnimationFrame(raf); },
  };
  root.api = api;
  return root;
}
