/* AETHERIUM — UI stylesheet (injected).
 * Design rules enforced here:
 *  - Only `transform` and `opacity` are ever animated/transitioned. No layout props.
 *  - No external fonts, no network fetches. Grain/noise is an inline data: URI.
 *  - Palette: near-black + one cool accent (#5FE3FF) + one warm alert (#FF7A45).
 */

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/>" +
  "<feColorMatrix type='saturate' values='0'/></filter>" +
  "<rect width='180' height='180' filter='url(%23n)' opacity='0.55'/></svg>\")";

export const CSS = `
:root{
  --ae-bg:#04070b;
  --ae-bg2:#080d13;
  --ae-ink:#dceaf1;
  --ae-ink-2:#93aab6;
  --ae-ink-3:#5d7481;
  --ae-acc:#5fe3ff;
  --ae-acc-d:#1b6b81;
  --ae-acc-g:rgba(95,227,255,.10);
  --ae-warm:#ff7a45;
  --ae-good:#7fe6a8;
  --ae-line:rgba(129,196,218,.20);
  --ae-line-s:rgba(129,196,218,.40);
  --ae-panel:rgba(6,12,17,.80);
  --ae-mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace;
  --ae-sans:system-ui,-apple-system,"Segoe UI",Roboto,"DejaVu Sans","Liberation Sans",sans-serif;
  --ae-e:cubic-bezier(.16,.84,.32,1);
  --ae-e2:cubic-bezier(.6,0,.2,1);
}

.ae-root,.ae-root *{box-sizing:border-box;margin:0;padding:0;}
.ae-root{
  position:fixed; inset:0; z-index:40;
  font-family:var(--ae-sans); color:var(--ae-ink);
  -webkit-font-smoothing:antialiased;
  pointer-events:none; overflow:hidden;
  contain:layout style;
}
.ae-root :where(button,input,textarea){font:inherit;color:inherit;background:none;border:0;outline:0;text-align:inherit;}

/* ───────────────────────── screens ───────────────────────── */
.ae-screen{
  position:absolute; inset:0; pointer-events:none;
  opacity:0; transform:translate3d(0,0,0);
  transition:opacity .22s var(--ae-e2);
  will-change:opacity;
}
.ae-screen[data-active]{opacity:1; pointer-events:auto;}
.ae-screen[data-passthru]{pointer-events:none;}
.ae-screen[data-passthru] .ae-hit{pointer-events:auto;}

/* full-bleed dim + vignette for modal screens */
.ae-veil{position:absolute; inset:0; pointer-events:none;
  background:
    radial-gradient(120% 85% at 50% 42%, rgba(4,8,12,.20) 0%, rgba(3,5,8,.86) 68%, #020406 100%),
    linear-gradient(180deg,rgba(3,6,9,.92),rgba(3,6,9,.55) 30%,rgba(3,6,9,.55) 70%,rgba(3,6,9,.94));
}
.ae-veil--soft{background:radial-gradient(120% 90% at 50% 50%, rgba(3,6,10,0) 30%, rgba(3,6,10,.72) 100%);}

/* scanlines + grain overlays */
.ae-fx{position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen; opacity:.55;}
.ae-fx::before{content:"";position:absolute;inset:-2px;
  background:repeating-linear-gradient(180deg,rgba(150,220,240,.055) 0 1px,rgba(0,0,0,0) 1px 3px);}
.ae-fx::after{content:"";position:absolute;inset:-50%;
  background-image:${GRAIN}; opacity:.05; mix-blend-mode:overlay;}
.ae-scan{position:absolute;left:0;right:0;height:34vh;top:0;pointer-events:none;
  background:linear-gradient(180deg,rgba(95,227,255,0) 0%,rgba(95,227,255,.045) 70%,rgba(95,227,255,.11) 96%,rgba(95,227,255,0) 100%);
  transform:translate3d(0,-40vh,0); animation:ae-sweep 7.5s linear infinite; opacity:.7;}
@keyframes ae-sweep{0%{transform:translate3d(0,-40vh,0)}100%{transform:translate3d(0,120vh,0)}}

/* ───────────────────────── type ───────────────────────── */
.ae-k{font-family:var(--ae-mono); font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:var(--ae-ink-3);}
.ae-k--acc{color:var(--ae-acc); opacity:.85;}
.ae-num{font-family:var(--ae-mono); font-variant-numeric:tabular-nums; letter-spacing:.04em;}
.ae-h{font-family:var(--ae-sans); font-weight:300; letter-spacing:.30em; text-transform:uppercase;}
.ae-prose{font-size:13px; line-height:1.62; color:var(--ae-ink-2); font-weight:300; max-width:62ch;}
.ae-chrom{text-shadow:0.6px 0 rgba(255,90,60,.22),-0.6px 0 rgba(60,200,255,.28);}

/* ───────────────────────── panel chrome ───────────────────────── */
.ae-panel{position:relative; isolation:isolate;}
.ae-panel__bg{position:absolute; inset:0; z-index:-2;
  background:linear-gradient(155deg,rgba(11,20,28,.86) 0%,rgba(5,10,15,.80) 45%,rgba(4,8,12,.88) 100%);
  border:1px solid var(--ae-line);
  box-shadow:inset 0 1px 0 rgba(150,220,245,.06), 0 24px 60px -20px rgba(0,0,0,.9);
  backdrop-filter:blur(9px) saturate(120%);
  -webkit-backdrop-filter:blur(9px) saturate(120%);}
.ae-panel__bg::before{content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(180deg,rgba(140,215,240,.030) 0 1px,rgba(0,0,0,0) 1px 4px);}
.ae-panel__bg::after{content:"";position:absolute;inset:0;background-image:${GRAIN};opacity:.035;}
.ae-cor{position:absolute; width:11px; height:11px; border:1px solid var(--ae-acc); opacity:.75; z-index:1;}
.ae-cor--tl{top:-1px;left:-1px;border-right:0;border-bottom:0;}
.ae-cor--tr{top:-1px;right:-1px;border-left:0;border-bottom:0;}
.ae-cor--bl{bottom:-1px;left:-1px;border-right:0;border-top:0;}
.ae-cor--br{bottom:-1px;right:-1px;border-left:0;border-top:0;}

.ae-phd{display:flex; align-items:center; gap:10px; padding:12px 16px 11px;
  border-bottom:1px solid var(--ae-line);}
.ae-phd__t{font-family:var(--ae-mono); font-size:10.5px; letter-spacing:.28em; text-transform:uppercase; color:var(--ae-ink);}
.ae-phd__s{font-family:var(--ae-mono); font-size:9.5px; letter-spacing:.2em; color:var(--ae-ink-3); margin-left:auto;}
.ae-dot{width:5px;height:5px;background:var(--ae-acc);box-shadow:0 0 8px var(--ae-acc);flex:0 0 auto;
  transform:rotate(45deg);}
.ae-pbody{padding:14px 16px;}

/* ───────────────────────── focusable / nav ───────────────────────── */
.ae-nav{position:relative; cursor:pointer; -webkit-user-select:none; user-select:none;}
.ae-nav::after{content:"";position:absolute;inset:-4px;pointer-events:none;
  border:1px solid var(--ae-acc); opacity:0; transform:scale(1.03);
  transition:opacity .13s var(--ae-e2),transform .13s var(--ae-e);
  box-shadow:0 0 0 1px rgba(95,227,255,.10) inset, 0 0 18px -4px var(--ae-acc);}
.ae-nav[data-focus]::after{opacity:.95; transform:scale(1);}
.ae-mi.ae-nav::after,.ae-cat.ae-nav::after,.ae-ent.ae-nav::after,.ae-sys.ae-nav::after,
.ae-ctl.ae-nav::after,.ae-cx__tab.ae-nav::after{
  inset:0; box-shadow:none; transform:scale(1); border-color:rgba(95,227,255,.42);}
.ae-mi.ae-nav[data-focus]::after,.ae-cat.ae-nav[data-focus]::after,.ae-ent.ae-nav[data-focus]::after,
.ae-sys.ae-nav[data-focus]::after,.ae-ctl.ae-nav[data-focus]::after,.ae-cx__tab.ae-nav[data-focus]::after{opacity:.65;}
.ae-nav[data-dis]{opacity:.44; pointer-events:none;}

/* ───────────────────────── buttons ───────────────────────── */
.ae-btn{position:relative; display:inline-flex; align-items:center; gap:10px;
  padding:11px 20px; font-family:var(--ae-mono); font-size:10.5px; letter-spacing:.24em;
  text-transform:uppercase; color:var(--ae-ink-2); overflow:visible;}
.ae-btn__bg{position:absolute;inset:0;z-index:-1;border:1px solid var(--ae-line);
  background:linear-gradient(180deg,rgba(95,227,255,.05),rgba(95,227,255,.015));}
.ae-btn__hl{position:absolute;inset:0;z-index:-1;opacity:0;
  background:linear-gradient(180deg,rgba(95,227,255,.20),rgba(95,227,255,.05));
  border:1px solid var(--ae-acc);
  transition:opacity .14s var(--ae-e2);}
.ae-btn:hover .ae-btn__hl,.ae-btn[data-focus] .ae-btn__hl{opacity:1;}
.ae-btn__lb{position:relative;z-index:1;opacity:.78;transition:opacity .14s var(--ae-e2);}
.ae-btn:hover .ae-btn__lb,.ae-btn[data-focus] .ae-btn__lb{opacity:1;}
.ae-btn--pri .ae-btn__bg{border-color:var(--ae-acc-d);background:linear-gradient(180deg,rgba(95,227,255,.16),rgba(95,227,255,.04));}
.ae-btn--pri .ae-btn__lb{color:var(--ae-acc);opacity:.95;}
.ae-btn--warm .ae-btn__hl{background:linear-gradient(180deg,rgba(255,122,69,.20),rgba(255,122,69,.05));border-color:var(--ae-warm);}
.ae-btn--warm .ae-btn__lb{color:var(--ae-warm);}
.ae-btn--sm{padding:8px 13px;font-size:9.5px;letter-spacing:.2em;}
.ae-btn svg{width:12px;height:12px;flex:0 0 auto;position:relative;z-index:1;}

/* ───────────────────────── menu list ───────────────────────── */
.ae-menu{display:flex;flex-direction:column;gap:1px;}
.ae-mi{position:relative;display:flex;align-items:baseline;gap:16px;padding:11px 18px 11px 14px;}
.ae-mi__bg{position:absolute;inset:0;z-index:-1;opacity:0;transform:scaleX(.6);transform-origin:left;
  background:linear-gradient(90deg,rgba(95,227,255,.16),rgba(95,227,255,0) 88%);
  transition:opacity .16s var(--ae-e2),transform .2s var(--ae-e);}
.ae-mi__bar{position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--ae-acc);
  box-shadow:0 0 12px var(--ae-acc); transform:scaleY(0); transform-origin:center;
  transition:transform .18s var(--ae-e);}
.ae-mi[data-focus] .ae-mi__bg,.ae-mi:hover .ae-mi__bg{opacity:1;transform:scaleX(1);}
.ae-mi[data-focus] .ae-mi__bar,.ae-mi:hover .ae-mi__bar{transform:scaleY(1);}
.ae-mi__n{font-family:var(--ae-mono);font-size:9px;letter-spacing:.16em;color:var(--ae-acc);opacity:.42;
  transition:opacity .16s var(--ae-e2);}
.ae-mi[data-focus] .ae-mi__n,.ae-mi:hover .ae-mi__n{opacity:1;}
.ae-mi__l{font-family:var(--ae-sans);font-weight:300;font-size:15.5px;letter-spacing:.30em;
  text-transform:uppercase;opacity:.62;transition:opacity .16s var(--ae-e2),transform .2s var(--ae-e);}
.ae-mi[data-focus] .ae-mi__l,.ae-mi:hover .ae-mi__l{opacity:1;transform:translateX(4px);}
.ae-mi__h{margin-left:auto;font-family:var(--ae-mono);font-size:9px;letter-spacing:.18em;
  color:var(--ae-ink-3);opacity:0;transform:translateX(-6px);
  transition:opacity .2s var(--ae-e2),transform .2s var(--ae-e);}
.ae-mi[data-focus] .ae-mi__h{opacity:.8;transform:translateX(0);}

/* ───────────────────────── slider ───────────────────────── */
.ae-ctl{position:relative;padding:9px 12px 11px;}
.ae-ctl__bg{position:absolute;inset:0;z-index:-1;opacity:0;background:rgba(95,227,255,.055);
  transition:opacity .14s var(--ae-e2);}
.ae-ctl[data-focus] .ae-ctl__bg,.ae-ctl:hover .ae-ctl__bg{opacity:1;}
.ae-ctl__hd{display:flex;align-items:baseline;gap:8px;}
.ae-ctl__lb{font-family:var(--ae-mono);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--ae-ink-2);opacity:.78;transition:opacity .14s var(--ae-e2);}
.ae-ctl[data-focus] .ae-ctl__lb{opacity:1;}
.ae-ctl__v{margin-left:auto;font-family:var(--ae-mono);font-size:10.5px;font-variant-numeric:tabular-nums;
  color:var(--ae-acc);opacity:.9;}
.ae-sl{position:relative;height:14px;margin-top:8px;}
.ae-sl__tr{position:absolute;left:0;right:0;top:6px;height:1px;background:var(--ae-line-s);}
.ae-sl__tk{position:absolute;left:0;right:0;top:3px;height:7px;
  background:repeating-linear-gradient(90deg,rgba(129,196,218,.28) 0 1px,rgba(0,0,0,0) 1px 12.5%);
  opacity:.5;}
.ae-sl__fillw{position:absolute;left:0;right:0;top:6px;height:1px;}
.ae-sl__fill{position:absolute;inset:0;background:var(--ae-acc);transform-origin:left center;
  transform:scaleX(var(--p,0));box-shadow:0 0 8px rgba(95,227,255,.7);}
.ae-sl__ptrw{position:absolute;left:0;right:0;top:0;bottom:0;pointer-events:none;}
.ae-sl__ptr{position:absolute;left:0;top:0;width:100%;height:100%;transform:translate3d(calc(var(--p,0) * 100%),0,0);}
.ae-sl__kn{position:absolute;left:-5px;top:1.5px;width:10px;height:10px;
  border:1px solid var(--ae-acc);background:#05121a;transform:rotate(45deg) scale(1);
  transition:transform .14s var(--ae-e);box-shadow:0 0 10px rgba(95,227,255,.55);}
.ae-ctl[data-focus] .ae-sl__kn,.ae-ctl:hover .ae-sl__kn{transform:rotate(45deg) scale(1.28);}
.ae-sl__hit{position:absolute;left:-6px;right:-6px;top:-8px;bottom:-8px;cursor:ew-resize;}

/* option cycler */
.ae-opt{display:flex;align-items:center;gap:10px;margin-top:7px;}
.ae-opt__ar{position:relative;width:16px;height:16px;flex:0 0 auto;opacity:.45;
  transition:opacity .14s var(--ae-e2),transform .14s var(--ae-e);cursor:pointer;}
.ae-opt__ar:hover{opacity:1;}
.ae-opt__ar svg{width:16px;height:16px;display:block;}
.ae-opt__v{flex:1;text-align:center;font-family:var(--ae-mono);font-size:10.5px;letter-spacing:.2em;
  text-transform:uppercase;color:var(--ae-ink);opacity:.92;}
.ae-opt__pips{display:flex;gap:3px;justify-content:center;margin-top:6px;}
.ae-opt__pip{width:14px;height:2px;background:var(--ae-line-s);transform:scaleY(1);}
.ae-opt__pip[data-on]{background:var(--ae-acc);box-shadow:0 0 7px rgba(95,227,255,.8);}

/* toggle */
.ae-tg{position:relative;width:42px;height:14px;margin-left:auto;flex:0 0 auto;}
.ae-tg__tr{position:absolute;inset:0;border:1px solid var(--ae-line-s);}
.ae-tg__on{position:absolute;inset:0;background:rgba(95,227,255,.16);border:1px solid var(--ae-acc);
  opacity:0;transition:opacity .14s var(--ae-e2);}
.ae-tg[data-on] .ae-tg__on{opacity:1;}
.ae-tg__kn{position:absolute;left:2px;top:2px;width:16px;height:10px;background:var(--ae-ink-3);
  transform:translate3d(0,0,0);transition:transform .18s var(--ae-e);}
.ae-tg[data-on] .ae-tg__kn{background:var(--ae-acc);transform:translate3d(22px,0,0);box-shadow:0 0 10px var(--ae-acc);}

/* swatches */
.ae-sw{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;}
.ae-sw__c{position:relative;width:22px;height:22px;cursor:pointer;}
.ae-sw__c i{position:absolute;inset:2px;display:block;}
.ae-sw__c::after{content:"";position:absolute;inset:0;border:1px solid var(--ae-acc);opacity:0;
  transform:scale(1.2);transition:opacity .14s var(--ae-e2),transform .14s var(--ae-e);}
.ae-sw__c:hover::after{opacity:.5;transform:scale(1);}
.ae-sw__c[data-on]::after{opacity:1;transform:scale(1);}
.ae-sw__c[data-on] i{box-shadow:0 0 12px -1px currentColor;}

/* ───────────────────────── stagger entry ───────────────────────── */
.ae-in{opacity:0;transform:translate3d(0,10px,0);}
.ae-screen[data-active] .ae-in{animation:ae-rise .48s var(--ae-e) forwards;
  animation-delay:calc(var(--i,0) * 42ms + 60ms);}
@keyframes ae-rise{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:translate3d(0,0,0)}}
.ae-inL{opacity:0;transform:translate3d(-18px,0,0);}
.ae-screen[data-active] .ae-inL{animation:ae-slideL .5s var(--ae-e) forwards;animation-delay:calc(var(--i,0) * 38ms + 40ms);}
@keyframes ae-slideL{to{opacity:1;transform:translate3d(0,0,0)}}
.ae-inR{opacity:0;transform:translate3d(18px,0,0);}
.ae-screen[data-active] .ae-inR{animation:ae-slideR .5s var(--ae-e) forwards;animation-delay:calc(var(--i,0) * 38ms + 40ms);}
@keyframes ae-slideR{to{opacity:1;transform:translate3d(0,0,0)}}
.ae-inS{opacity:0;transform:scaleX(0);transform-origin:left;}
.ae-screen[data-active] .ae-inS{animation:ae-wipe .55s var(--ae-e) forwards;animation-delay:calc(var(--i,0) * 38ms + 40ms);}
@keyframes ae-wipe{to{opacity:1;transform:scaleX(1)}}

/* ═════════════════════════ BOOT ═════════════════════════ */
.ae-boot{position:absolute;inset:0;display:grid;place-items:center;background:#020406;}
.ae-boot__w{width:min(760px,72vw);transition:opacity .35s var(--ae-e2);}
.ae-boot[data-sync] .ae-boot__w{opacity:.07;}
.ae-boot__top{display:flex;align-items:baseline;gap:14px;border-bottom:1px solid var(--ae-line);padding-bottom:10px;}
.ae-boot__sig{width:100%;height:34px;display:block;margin:16px 0 18px;opacity:.85;}
.ae-boot__log{height:250px;overflow:hidden;position:relative;font-family:var(--ae-mono);font-size:11px;line-height:1.85;}
.ae-boot__ln{display:flex;gap:12px;opacity:0;transform:translate3d(0,6px,0);animation:ae-rise .3s var(--ae-e) forwards;}
.ae-boot__t{color:var(--ae-ink-3);opacity:.65;letter-spacing:.06em;}
.ae-boot__m{color:var(--ae-ink-2);letter-spacing:.05em;}
.ae-boot__ok{margin-left:auto;color:var(--ae-acc);opacity:.8;letter-spacing:.16em;font-size:10px;}
.ae-boot__ok[data-warn]{color:var(--ae-warm);}
.ae-boot__bar{position:relative;height:2px;background:rgba(129,196,218,.16);margin-top:22px;}
.ae-boot__barf{position:absolute;inset:0;background:var(--ae-acc);transform-origin:left;transform:scaleX(0);
  box-shadow:0 0 14px var(--ae-acc);}
.ae-boot__meta{display:flex;justify-content:space-between;margin-top:10px;}
.ae-boot__sync{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;opacity:0;}
.ae-boot__sync::before{content:"";position:absolute;inset:0;background:radial-gradient(38% 34% at 50% 50%,rgba(2,5,8,.96),rgba(2,5,8,0) 72%);}
.ae-boot__sync>div{position:relative;z-index:1;}
.ae-boot__sync[data-on]{animation:ae-sync 1.15s var(--ae-e2) forwards;}
@keyframes ae-sync{0%{opacity:0;transform:scale(1.5)}18%{opacity:1;transform:scale(1)}70%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.02)}}
.ae-boot__syncT{font-family:var(--ae-sans);font-weight:200;font-size:44px;letter-spacing:.44em;text-indent:.44em;}
.ae-flash{position:absolute;inset:0;background:#cdf4ff;opacity:0;pointer-events:none;}
.ae-flash[data-on]{animation:ae-flash .5s var(--ae-e2) forwards;}
@keyframes ae-flash{0%{opacity:0}8%{opacity:.85}100%{opacity:0}}

/* ═════════════════════════ TITLE ═════════════════════════ */
.ae-title{position:absolute;inset:0;}
.ae-title__scrim{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(90deg,rgba(2,5,8,.90) 0%,rgba(2,5,8,.72) 34%,rgba(2,5,8,.15) 62%,rgba(2,5,8,.45) 100%);}
.ae-title__grid{position:absolute;inset:0;opacity:.28;
  background:
   linear-gradient(90deg,rgba(95,227,255,.055) 1px,transparent 1px) 0 0/88px 88px,
   linear-gradient(180deg,rgba(95,227,255,.055) 1px,transparent 1px) 0 0/88px 88px;
   -webkit-mask-image:radial-gradient(75% 65% at 26% 52%,#000 0%,transparent 78%);
   mask-image:radial-gradient(75% 65% at 26% 52%,#000 0%,transparent 78%);}
.ae-title__in{position:absolute;left:clamp(56px,7.5vw,140px);top:50%;transform:translateY(-50%);width:min(560px,46vw);}
.ae-title__mk{width:100%;height:auto;display:block;}
.ae-title__sub{display:flex;align-items:center;gap:14px;margin:18px 0 4px;}
.ae-title__rule{flex:1;height:1px;background:linear-gradient(90deg,var(--ae-acc),rgba(95,227,255,0));opacity:.6;}
.ae-title__menu{margin-top:46px;width:min(420px,38vw);}
.ae-title__foot{position:absolute;left:clamp(56px,7.5vw,140px);bottom:38px;display:flex;gap:30px;align-items:center;}
.ae-title__tr{position:absolute;right:clamp(40px,4vw,72px);top:38px;text-align:right;display:flex;flex-direction:column;gap:6px;}
.ae-title__br{position:absolute;right:clamp(40px,4vw,72px);bottom:38px;width:min(300px,26vw);}

/* ═════════════════════════ CREATOR ═════════════════════════ */
.ae-cr{position:absolute;inset:0;}
.ae-cr__rail{position:absolute;left:30px;top:30px;bottom:30px;width:216px;display:flex;flex-direction:column;}
.ae-cr__cats-wrap{flex:1;overflow:hidden;display:flex;flex-direction:column;}
.ae-cr__presets{margin-top:auto;padding:14px 16px 18px;border-top:1px solid var(--ae-line);display:flex;flex-direction:column;gap:7px;}
.ae-cr__railHd{padding:26px 20px 16px;border-bottom:1px solid var(--ae-line);}
.ae-cr__cats{display:flex;flex-direction:column;padding:12px 0;gap:1px;}
.ae-cat{position:relative;display:flex;align-items:center;gap:12px;padding:13px 20px;}
.ae-cat__bg{position:absolute;inset:0;z-index:-1;opacity:0;transform:scaleX(.7);transform-origin:left;
  background:linear-gradient(90deg,rgba(95,227,255,.15),transparent);
  transition:opacity .15s var(--ae-e2),transform .2s var(--ae-e);}
.ae-cat__bar{position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--ae-acc);
  transform:scaleY(0);transition:transform .18s var(--ae-e);box-shadow:0 0 10px var(--ae-acc);}
.ae-cat[data-on] .ae-cat__bg,.ae-cat[data-focus] .ae-cat__bg,.ae-cat:hover .ae-cat__bg{opacity:1;transform:scaleX(1);}
.ae-cat[data-on] .ae-cat__bar{transform:scaleY(1);}
.ae-cat__ic{width:16px;height:16px;opacity:.55;transition:opacity .15s var(--ae-e2);flex:0 0 auto;}
.ae-cat[data-on] .ae-cat__ic{opacity:1;}
.ae-cat__l{font-family:var(--ae-mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;
  opacity:.6;transition:opacity .15s var(--ae-e2);}
.ae-cat[data-on] .ae-cat__l,.ae-cat:hover .ae-cat__l{opacity:1;}
.ae-cat__n{margin-left:auto;font-family:var(--ae-mono);font-size:9px;color:var(--ae-ink-3);}
.ae-cr__stack{position:absolute;right:30px;top:30px;bottom:30px;width:392px;display:flex;flex-direction:column;}
.ae-cr__scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:6px 4px 12px;scrollbar-width:thin;
  scrollbar-color:rgba(95,227,255,.35) transparent;}
.ae-cr__scroll::-webkit-scrollbar{width:3px;}
.ae-cr__scroll::-webkit-scrollbar-thumb{background:rgba(95,227,255,.35);}
.ae-cr__grp{padding:14px 14px 4px;}
.ae-cr__tools{display:flex;gap:6px;padding:10px 12px;border-bottom:1px solid var(--ae-line);align-items:center;white-space:nowrap;}
.ae-cr__foot{padding:14px 14px 18px;border-top:1px solid var(--ae-line);display:flex;flex-direction:column;gap:10px;}
.ae-cr__foot .ae-btn{justify-content:center;}
.ae-cr__spacer{flex:1;}
.ae-cr__stage{position:absolute;left:262px;right:440px;top:0;bottom:0;pointer-events:none;}
.ae-cr__ring{position:absolute;left:50%;bottom:9%;width:min(430px,32vw);height:96px;transform:translateX(-50%);opacity:.5;}
.ae-cr__tag{position:absolute;left:50%;top:8%;transform:translateX(-50%);text-align:center;}

/* ═════════════════════════ LOADING ═════════════════════════ */
.ae-ld{position:absolute;inset:0;}
.ae-ld__in{position:absolute;left:clamp(52px,6vw,108px);right:clamp(52px,6vw,108px);bottom:clamp(52px,7vh,86px);}
.ae-ld__hint{display:flex;gap:14px;align-items:flex-start;max-width:640px;margin-bottom:auto;}
.ae-ld__hintT{opacity:0;transform:translate3d(0,6px,0);}
.ae-ld__hintT[data-on]{animation:ae-rise .5s var(--ae-e) forwards;}
.ae-ld__row{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px;}
.ae-ld__ph{font-family:var(--ae-sans);font-weight:200;font-size:26px;letter-spacing:.22em;text-transform:uppercase;}
.ae-ld__pct{font-family:var(--ae-mono);font-size:34px;font-variant-numeric:tabular-nums;color:var(--ae-acc);letter-spacing:-.02em;line-height:1;}
.ae-ld__unit{font-family:var(--ae-mono);font-size:13px;color:var(--ae-acc);opacity:.55;}
.ae-ld__steps{position:absolute;right:clamp(52px,6vw,108px);bottom:clamp(150px,20vh,220px);
  display:flex;flex-direction:column;gap:9px;align-items:flex-end;}
.ae-ld__step{display:flex;align-items:center;gap:11px;opacity:.34;transition:opacity .3s var(--ae-e2);}
.ae-ld__step[data-on]{opacity:1;}
.ae-ld__step i{width:6px;height:6px;border:1px solid var(--ae-line-s);transform:rotate(45deg);flex:0 0 auto;}
.ae-ld__step[data-on] i{border-color:var(--ae-acc);background:var(--ae-acc);box-shadow:0 0 8px var(--ae-acc);}
.ae-ld__bar{position:relative;height:3px;background:rgba(129,196,218,.14);}
.ae-ld__f{position:absolute;inset:0;background:linear-gradient(90deg,var(--ae-acc-d),var(--ae-acc));
  transform-origin:left;transform:scaleX(0);transition:transform .3s var(--ae-e2);box-shadow:0 0 16px rgba(95,227,255,.55);}
.ae-ld__seg{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 1px),rgba(2,5,8,.9) calc(10% - 1px) 10%);}
.ae-ld__lore{position:absolute;left:clamp(52px,6vw,108px);top:clamp(48px,8vh,92px);width:min(520px,44vw);}
.ae-ld__spin{position:absolute;right:clamp(52px,6vw,108px);top:clamp(48px,8vh,92px);width:96px;height:96px;}

/* ═════════════════════════ HUD ═════════════════════════ */
.ae-hud{position:absolute;inset:0;pointer-events:none;}
.ae-hud__vig{position:absolute;inset:0;background:radial-gradient(105% 82% at 50% 50%,transparent 52%,rgba(2,4,7,.72) 100%);}
.ae-hud__b{position:absolute;transition:opacity .25s var(--ae-e2),transform .3s var(--ae-e);}
.ae-hud[data-dim] .ae-hud__b[data-fade]{opacity:.30;}

.ae-vit{left:38px;top:34px;display:flex;gap:14px;align-items:flex-start;}
.ae-vit__i{position:relative;width:78px;}
.ae-vit__sv{width:78px;height:52px;display:block;}
.ae-vit__n{position:absolute;left:0;right:0;top:22px;text-align:center;font-family:var(--ae-mono);
  font-size:15px;font-variant-numeric:tabular-nums;letter-spacing:-.01em;}
.ae-vit__l{text-align:center;margin-top:1px;font-family:var(--ae-mono);font-size:8px;letter-spacing:.22em;color:var(--ae-ink-3);}

.ae-cmp{left:50%;top:26px;transform:translateX(-50%);width:min(660px,46vw);}
.ae-cmp::before{content:"";position:absolute;left:-30px;right:-30px;top:-14px;height:82px;pointer-events:none;
  background:linear-gradient(180deg,rgba(3,7,10,.62),rgba(3,7,10,0));
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 20%,#000 80%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 20%,#000 80%,transparent);}
.ae-cmp__cv{display:block;width:100%;height:56px;}
.ae-cmp__hd{display:flex;justify-content:center;gap:10px;margin-top:2px;}

.ae-tel{right:38px;bottom:34px;text-align:right;display:flex;flex-direction:column;gap:9px;align-items:flex-end;}
.ae-tel__spd{display:flex;align-items:baseline;gap:7px;}
.ae-tel__v{font-family:var(--ae-mono);font-size:32px;font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1;}
.ae-tel__rule{width:130px;height:1px;background:linear-gradient(90deg,transparent,var(--ae-line-s));}

.ae-obj{right:38px;top:34px;width:344px;}
.ae-obj__t{font-family:var(--ae-sans);font-weight:300;font-size:13.5px;letter-spacing:.10em;line-height:1.4;}
.ae-obj__s{font-family:var(--ae-mono);font-size:9px;letter-spacing:.14em;color:var(--ae-ink-3);margin-top:5px;line-height:1.6;}
.ae-obj__hd{display:flex;align-items:center;gap:8px;justify-content:flex-end;margin-bottom:9px;}

.ae-ret{left:50%;top:50%;transform:translate(-50%,-50%);width:220px;height:220px;}
.ae-ret__cv{display:block;width:220px;height:220px;}
.ae-scanlb{position:absolute;left:50%;top:calc(50% + 156px);transform:translateX(-50%);text-align:center;
  opacity:0;transition:opacity .2s var(--ae-e2);}
.ae-scanlb[data-on]{opacity:1;}
.ae-prompt{left:50%;top:calc(50% + 96px);transform:translateX(-50%);display:flex;align-items:center;gap:9px;
  opacity:0;}
.ae-prompt[data-on]{opacity:1;}
.ae-prompt__k{display:grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border:1px solid var(--ae-acc);
  font-family:var(--ae-mono);font-size:9.5px;color:var(--ae-acc);background:rgba(95,227,255,.10);}
.ae-prompt__l{font-family:var(--ae-mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--ae-ink-2);}

.ae-dlog{left:38px;bottom:34px;width:320px;display:flex;flex-direction:column;gap:5px;}
.ae-dl{position:relative;padding:9px 12px 9px 13px;opacity:0;transform:translate3d(-24px,0,0);
  animation:ae-dlin .42s var(--ae-e) forwards;}
@keyframes ae-dlin{to{opacity:1;transform:translate3d(0,0,0)}}
.ae-dl__bg{position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(6,14,20,.86),rgba(6,14,20,.30));
  border-left:2px solid var(--ae-acc);}
.ae-dl--warm .ae-dl__bg{border-left-color:var(--ae-warm);}
.ae-dl__t{font-family:var(--ae-mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--ae-acc);}
.ae-dl--warm .ae-dl__t{color:var(--ae-warm);}
.ae-dl__b{font-family:var(--ae-sans);font-weight:300;font-size:11.5px;color:var(--ae-ink-2);margin-top:3px;letter-spacing:.04em;}

.ae-toasts{right:38px;top:196px;width:300px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;}
.ae-toast{position:relative;width:100%;padding:13px 15px;opacity:0;transform:translate3d(26px,0,0);
  animation:ae-tin .38s var(--ae-e) forwards;}
@keyframes ae-tin{to{opacity:1;transform:translate3d(0,0,0)}}
.ae-toast[data-out]{animation:ae-tout .3s var(--ae-e2) forwards;}
@keyframes ae-tout{to{opacity:0;transform:translate3d(26px,0,0)}}
.ae-toast__bg{position:absolute;inset:0;z-index:-1;background:linear-gradient(135deg,rgba(8,16,23,.92),rgba(5,10,15,.86));
  border:1px solid var(--ae-line);border-top:1px solid var(--ae-acc);
  box-shadow:0 18px 40px -18px rgba(0,0,0,.9);}
.ae-toast--warn .ae-toast__bg{border-top-color:var(--ae-warm);}
.ae-toast--good .ae-toast__bg{border-top-color:var(--ae-good);}
.ae-toast__hd{display:flex;align-items:center;gap:8px;}
.ae-toast__t{font-family:var(--ae-mono);font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--ae-acc);}
.ae-toast--warn .ae-toast__t{color:var(--ae-warm);}
.ae-toast--good .ae-toast__t{color:var(--ae-good);}
.ae-toast__b{font-family:var(--ae-sans);font-weight:300;font-size:12px;color:var(--ae-ink-2);margin-top:6px;line-height:1.5;}
.ae-toast__pr{position:absolute;left:0;bottom:0;height:1px;width:100%;background:var(--ae-acc);opacity:.4;
  transform-origin:left;transform:scaleX(1);}

.ae-sub{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);max-width:64ch;text-align:center;
  opacity:0;transition:opacity .18s var(--ae-e2);}
.ae-sub[data-on]{opacity:1;}
.ae-sub__t{font-family:var(--ae-sans);font-weight:300;font-size:16px;line-height:1.5;letter-spacing:.03em;
  color:#eef7fb;text-shadow:0 2px 14px rgba(0,0,0,.95),0 0 34px rgba(0,0,0,.8);}
.ae-sub__w{font-family:var(--ae-mono);font-size:9px;letter-spacing:.26em;color:var(--ae-acc);opacity:.7;margin-bottom:6px;}

/* ═════════════════════════ CODEX ═════════════════════════ */
.ae-cx{position:absolute;inset:0;}
.ae-cx__wrap{position:absolute;inset:clamp(34px,4.4vh,58px) clamp(44px,5vw,96px);display:grid;
  grid-template-columns:330px 1fr;gap:22px;}
.ae-cx__left{display:flex;flex-direction:column;min-height:0;}
.ae-cx__tabs{display:flex;flex-wrap:wrap;gap:1px;padding:10px 10px 0;}
.ae-cx__tab{position:relative;padding:7px 9px;font-family:var(--ae-mono);font-size:8.5px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--ae-ink-3);}
.ae-cx__tab__bg{position:absolute;inset:0;z-index:-1;opacity:0;background:rgba(95,227,255,.14);
  border-bottom:1px solid var(--ae-acc);transition:opacity .14s var(--ae-e2);}
.ae-cx__tab[data-on] .ae-cx__tab__bg,.ae-cx__tab:hover .ae-cx__tab__bg{opacity:1;}
.ae-cx__tab[data-on]{color:var(--ae-acc);}
.ae-cx__list{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:1px;min-height:0;
  scrollbar-width:thin;scrollbar-color:rgba(95,227,255,.3) transparent;}
.ae-cx__list::-webkit-scrollbar{width:3px;}
.ae-cx__list::-webkit-scrollbar-thumb{background:rgba(95,227,255,.3);}
.ae-ent{position:relative;display:flex;align-items:center;gap:11px;padding:10px 12px;}
.ae-ent__bg{position:absolute;inset:0;z-index:-1;opacity:0;transform:scaleX(.7);transform-origin:left;
  background:linear-gradient(90deg,rgba(95,227,255,.15),transparent);
  transition:opacity .15s var(--ae-e2),transform .2s var(--ae-e);}
.ae-ent[data-on] .ae-ent__bg,.ae-ent[data-focus] .ae-ent__bg,.ae-ent:hover .ae-ent__bg{opacity:1;transform:scaleX(1);}
.ae-ent__bar{position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--ae-acc);transform:scaleY(0);
  transition:transform .18s var(--ae-e);}
.ae-ent[data-on] .ae-ent__bar{transform:scaleY(1);}
.ae-ent__ic{width:14px;height:14px;flex:0 0 auto;opacity:.6;}
.ae-ent__n{font-family:var(--ae-sans);font-weight:300;font-size:12.5px;letter-spacing:.07em;opacity:.75;
  transition:opacity .15s var(--ae-e2);}
.ae-ent[data-on] .ae-ent__n,.ae-ent:hover .ae-ent__n{opacity:1;}
.ae-ent__m{margin-left:auto;font-family:var(--ae-mono);font-size:8.5px;letter-spacing:.14em;color:var(--ae-ink-3);}
.ae-ent[data-locked] .ae-ent__n{color:var(--ae-ink-3);font-style:normal;letter-spacing:.24em;}
.ae-cx__right{display:flex;flex-direction:column;min-height:0;}
.ae-cx__prev{position:relative;height:40%;min-height:190px;border-bottom:1px solid var(--ae-line);overflow:hidden;}
.ae-cx__slot{position:absolute;inset:0;}
.ae-cx__prevfx{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(70% 70% at 50% 55%,rgba(95,227,255,.10),transparent 70%);}
.ae-cx__prevgrid{position:absolute;inset:0;opacity:.3;
  background:linear-gradient(90deg,rgba(95,227,255,.07) 1px,transparent 1px) 0 0/34px 34px,
             linear-gradient(180deg,rgba(95,227,255,.07) 1px,transparent 1px) 0 0/34px 34px;
  -webkit-mask-image:radial-gradient(60% 60% at 50% 50%,#000,transparent 80%);
  mask-image:radial-gradient(60% 60% at 50% 50%,#000,transparent 80%);}
.ae-cx__det{flex:1;overflow-y:auto;padding:24px 30px 28px;min-height:0;display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:0 40px;align-content:start;
  scrollbar-width:thin;scrollbar-color:rgba(95,227,255,.3) transparent;}
.ae-cx__det::-webkit-scrollbar{width:3px;}
.ae-cx__det::-webkit-scrollbar-thumb{background:rgba(95,227,255,.3);}
.ae-cx__ttl{font-family:var(--ae-sans);font-weight:200;font-size:31px;letter-spacing:.16em;text-transform:uppercase;}
.ae-cx__head{grid-column:1/-1;}
.ae-cx__side{display:flex;flex-direction:column;gap:16px;}
.ae-cx__card{border:1px solid var(--ae-line);padding:13px 15px;}
.ae-cx__card h4{font-family:var(--ae-mono);font-size:9px;letter-spacing:.22em;text-transform:uppercase;
  color:var(--ae-acc);opacity:.85;font-weight:400;margin-bottom:10px;}
.ae-cx__kv{display:flex;justify-content:space-between;padding:5px 0;font-family:var(--ae-mono);font-size:10px;}
.ae-cx__kv span:first-child{color:var(--ae-ink-3);letter-spacing:.14em;text-transform:uppercase;}
.ae-cx__kv span:last-child{color:var(--ae-ink);}
.ae-cx__meta{display:flex;gap:26px;margin:16px 0 20px;padding:13px 0;border-top:1px solid var(--ae-line);border-bottom:1px solid var(--ae-line);}
.ae-cx__mi{display:flex;flex-direction:column;gap:5px;}
.ae-cx__mv{font-family:var(--ae-mono);font-size:12.5px;color:var(--ae-ink);}
.ae-cx__comp{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--ae-line);}
.ae-cx__compbar{flex:1;height:2px;background:rgba(129,196,218,.16);position:relative;}
.ae-cx__compf{position:absolute;inset:0;background:var(--ae-acc);transform-origin:left;transform:scaleX(0);
  transition:transform .6s var(--ae-e);box-shadow:0 0 10px var(--ae-acc);}

/* ═════════════════════════ STARMAP ═════════════════════════ */
.ae-sm{position:absolute;inset:0;}
.ae-sm__hd{position:absolute;left:50%;top:clamp(28px,3.6vh,48px);transform:translateX(-50%);text-align:center;}
.ae-sm__list{position:absolute;left:clamp(40px,4.4vw,80px);top:clamp(92px,12vh,140px);bottom:clamp(40px,5vh,72px);width:340px;
  display:flex;flex-direction:column;}
.ae-sm__scroll{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:1px;min-height:0;
  scrollbar-width:thin;scrollbar-color:rgba(95,227,255,.3) transparent;}
.ae-sm__scroll::-webkit-scrollbar{width:3px;}
.ae-sm__scroll::-webkit-scrollbar-thumb{background:rgba(95,227,255,.3);}
.ae-sys{position:relative;padding:11px 13px;}
.ae-sys__bg{position:absolute;inset:0;z-index:-1;opacity:0;transform:scaleX(.7);transform-origin:left;
  background:linear-gradient(90deg,rgba(95,227,255,.15),transparent);
  transition:opacity .15s var(--ae-e2),transform .2s var(--ae-e);}
.ae-sys[data-on] .ae-sys__bg,.ae-sys[data-focus] .ae-sys__bg,.ae-sys:hover .ae-sys__bg{opacity:1;transform:scaleX(1);}
.ae-sys__bar{position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--ae-acc);transform:scaleY(0);
  transition:transform .18s var(--ae-e);}
.ae-sys[data-on] .ae-sys__bar{transform:scaleY(1);}
.ae-sys__r1{display:flex;align-items:center;gap:10px;}
.ae-sys__n{font-family:var(--ae-sans);font-weight:300;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.8;}
.ae-sys[data-on] .ae-sys__n,.ae-sys:hover .ae-sys__n{opacity:1;}
.ae-sys__d{margin-left:auto;font-family:var(--ae-mono);font-size:10px;color:var(--ae-acc);opacity:.8;}
.ae-sys__r2{display:flex;align-items:center;gap:9px;margin-top:6px;flex-wrap:nowrap;}
.ae-sys__r2 span{font-size:8.5px;letter-spacing:.12em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ae-sys__r2 .ae-haz{flex:0 0 auto;}
.ae-haz{display:flex;gap:2px;}
.ae-haz i{width:9px;height:3px;background:var(--ae-line-s);display:block;}
.ae-haz i[data-on]{background:var(--ae-warm);box-shadow:0 0 6px rgba(255,122,69,.7);}
.ae-sm__info{position:absolute;right:clamp(40px,4.4vw,80px);top:clamp(92px,12vh,140px);width:330px;}
.ae-sm__stage{position:absolute;left:450px;right:440px;top:150px;bottom:96px;pointer-events:none;}
.ae-sm__ret{position:absolute;inset:0;}
.ae-res{display:flex;flex-direction:column;gap:8px;}
.ae-res__r{display:flex;align-items:center;gap:10px;}
.ae-res__l{font-family:var(--ae-mono);font-size:9px;letter-spacing:.16em;color:var(--ae-ink-3);width:74px;text-transform:uppercase;}
.ae-res__b{flex:1;height:2px;background:rgba(129,196,218,.16);position:relative;}
.ae-res__f{position:absolute;inset:0;background:var(--ae-acc);transform-origin:left;transform:scaleX(var(--p,0));opacity:.8;}
.ae-res__v{font-family:var(--ae-mono);font-size:9px;color:var(--ae-ink-2);width:30px;text-align:right;}

/* ═════════════════════════ PAUSE / SETTINGS ═════════════════════════ */
.ae-pz{position:absolute;inset:0;}
.ae-pz__in{position:absolute;left:clamp(56px,8vw,150px);top:50%;transform:translateY(-50%);width:min(430px,40vw);}
.ae-pz__hd{margin-bottom:30px;}
.ae-pz__ti{font-family:var(--ae-sans);font-weight:200;font-size:36px;letter-spacing:.34em;text-transform:uppercase;}
.ae-pz__st{position:absolute;right:clamp(56px,8vw,150px);top:clamp(56px,9vh,110px);width:min(340px,27vw);}

.ae-st{position:absolute;inset:0;}
.ae-st__wrap{position:absolute;inset:clamp(34px,4.6vh,64px) clamp(56px,8vw,150px);display:grid;
  grid-template-columns:210px 1fr;gap:26px;}
.ae-st__nav{display:flex;flex-direction:column;gap:1px;padding-top:16px;}
.ae-st__main{display:flex;flex-direction:column;min-height:0;}
.ae-st__hd{display:flex;align-items:baseline;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--ae-line);}
.ae-st__ti{font-family:var(--ae-sans);font-weight:200;font-size:30px;letter-spacing:.30em;text-transform:uppercase;}
.ae-st__body{flex:1;overflow-y:auto;padding:8px 4px 30px;min-height:0;display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 30px;align-content:start;scroll-behavior:smooth;
  scrollbar-width:thin;scrollbar-color:rgba(95,227,255,.3) transparent;}
.ae-st__body::-webkit-scrollbar{width:3px;}
.ae-st__body::-webkit-scrollbar-thumb{background:rgba(95,227,255,.3);}
.ae-st__sec{grid-column:1/-1;display:flex;align-items:center;gap:14px;margin:26px 0 6px;}
.ae-st__sec:first-child{margin-top:8px;}
.ae-st__sec .ae-k{color:var(--ae-acc);opacity:.9;letter-spacing:.34em;}
.ae-st__sec .ae-r{flex:1;height:1px;background:var(--ae-line);}
.ae-st__foot{display:flex;gap:10px;padding-top:16px;border-top:1px solid var(--ae-line);align-items:center;}

/* ═════════════════════════ CREDITS ═════════════════════════ */
.ae-cd{position:absolute;inset:0;overflow:hidden;}
.ae-cd__scroll{position:absolute;left:50%;top:0;width:min(620px,64vw);transform:translate3d(-50%,100vh,0);
  text-align:center;}
.ae-cd__scroll[data-on]{animation:ae-credits 46s linear forwards;}
@keyframes ae-credits{from{transform:translate3d(-50%,100vh,0)}to{transform:translate3d(-50%,-100%,0)}}
.ae-cd__role{font-family:var(--ae-mono);font-size:9.5px;letter-spacing:.30em;text-transform:uppercase;color:var(--ae-acc);opacity:.72;}
.ae-cd__name{font-family:var(--ae-sans);font-weight:200;font-size:21px;letter-spacing:.16em;margin-top:8px;}
.ae-cd__grp{margin-bottom:64px;}
.ae-cd__mk{width:190px;margin:0 auto 90px;opacity:.9;}
.ae-cd__mask{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,#04070b 0%,rgba(4,7,11,0) 18%,rgba(4,7,11,0) 82%,#04070b 100%);}

/* ═════════════════════════ GLOBAL OVERLAYS ═════════════════════════ */
.ae-bars{position:absolute;inset:0;pointer-events:none;z-index:60;}
.ae-bars__t,.ae-bars__b{position:absolute;left:0;right:0;height:11.2vh;background:#000;
  transition:transform .55s var(--ae-e);}
.ae-bars__t{top:0;transform:translate3d(0,-100%,0);}
.ae-bars__b{bottom:0;transform:translate3d(0,100%,0);}
.ae-bars[data-on] .ae-bars__t,.ae-bars[data-on] .ae-bars__b{transform:translate3d(0,0,0);}
.ae-fade{position:absolute;inset:0;pointer-events:none;z-index:70;opacity:0;}
.ae-cursor{position:absolute;inset:0;z-index:5;pointer-events:none;}

@media (prefers-reduced-motion:reduce){
  .ae-root *{animation-duration:.001ms !important;animation-delay:0ms !important;transition-duration:.001ms !important;}
  .ae-scan{display:none;}
  .ae-cd__scroll[data-on]{animation-duration:60s !important;}
}
.ae-root[data-rm] *{animation-duration:.001ms !important;animation-delay:0ms !important;transition-duration:.001ms !important;}
.ae-root[data-rm] .ae-scan{display:none;}
.ae-root[data-rm] .ae-cd__scroll[data-on]{animation-duration:60s !important;}
`;

let injected = false;
export function injectStyles(doc = document) {
  if (injected && doc.getElementById('ae-styles')) return;
  const s = doc.createElement('style');
  s.id = 'ae-styles';
  s.textContent = CSS;
  doc.head.appendChild(s);
  injected = true;
}
