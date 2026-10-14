// The four monitors: canvas-textured, redrawn live. 0 radar, 1 arrivals/departures board, 2 selected plane + commands, 3 alerts/radio/money.
import * as THREE from 'three';
import { MOBILE } from './config.js';

const SW = 1024, SH = 576, CW = MOBILE ? 768 : 1024, CH = CW * SH / SW;
const FONT = '"Segoe UI",Inter,system-ui,Arial,sans-serif', MONO = 'ui-monospace,Menlo,Consolas,"Courier New",monospace';
const COL = { sg: '#4dff8a', sy: '#ffd84a', so: '#ffa94a', sr: '#ff5555', sc: '#7fd4ff', sw: '#ffffff' };
const NAMES = ['RADAR', 'ARRIVALS / DEPARTURES', 'AIRCRAFT', 'ALERTS · RADIO'];

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function T_(c, s, x, y, o = {}) { c.font = `${o.w || 500} ${o.s || 18}px ${o.f || FONT}`; c.fillStyle = o.c || '#e8f1fa'; c.textAlign = o.a || 'left'; c.textBaseline = o.b || 'middle'; if (o.m) c.fillText(s, x, y, o.m); else c.fillText(s, x, y); }
function wrap(c, text, maxW) { const out = []; let line = ''; for (const w of String(text).split(' ')) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
const stCol = k => COL[{ sg: 'sg', sy: 'sy', so: 'so', sr: 'sr', sc: 'sc', sw: 'sw' }[k]] || '#fff';

export function createScreens() {
  const S_ = { list: [], hits: [[], [], [], []], pressed: { i: -1, id: '', t: 0 }, boardTab: 'arr' };
  const last = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
    const ctx = canvas.getContext('2d'), tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    ctx.fillStyle = '#05080c'; ctx.fillRect(0, 0, CW, CH); tex.needsUpdate = true;
    S_.list.push({ canvas, ctx, tex });
  }
  const frame = (c, i, now) => { // common chrome
    const g = c.createLinearGradient(0, 0, 0, SH); g.addColorStop(0, '#0a1624'); g.addColorStop(1, '#050a12'); c.fillStyle = g; c.fillRect(0, 0, SW, SH);
    c.fillStyle = 'rgba(0,229,255,.1)'; c.fillRect(0, 0, SW, 30); T_(c, NAMES[i], 14, 15, { s: 15, w: 700, c: '#00e5ff' });
    if (G) T_(c, clockStr(G.gm), SW - 14, 15, { s: 16, w: 700, a: 'right', c: '#9fd8ff', f: MONO });
    c.strokeStyle = 'rgba(0,229,255,.35)'; c.lineWidth = 2; c.strokeRect(1, 1, SW - 2, SH - 2);
  };
  const hit = (i, x, y, w, h, id, fn) => S_.hits[i].push({ x, y, w, h, id, fn });
  const pressedOn = (i, id, now) => S_.pressed.i === i && S_.pressed.id === id && now - S_.pressed.t < 0.25;

  // ---------- 0: radar ----------
  let radarBg = null, radarKey = null; const K = SW / 1600;
  function radarStatic() {
    const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH; const c = cv.getContext('2d');
    c.fillStyle = '#021208'; c.fillRect(0, 0, SW, SH);
    const rg = c.createRadialGradient(SW / 2, SH / 2, 20, SW / 2, SH / 2, 560); rg.addColorStop(0, 'rgba(20,120,60,.22)'); rg.addColorStop(1, 'rgba(0,30,10,0)'); c.fillStyle = rg; c.fillRect(0, 0, SW, SH);
    c.strokeStyle = 'rgba(40,200,100,.22)'; c.lineWidth = 1; for (const r of [100, 200, 300, 400, 500]) { c.beginPath(); c.arc(SW / 2, SH / 2, r, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(SW / 2, 0); c.lineTo(SW / 2, SH); c.moveTo(0, SH / 2); c.lineTo(SW, SH / 2); c.stroke();
    // coast
    c.strokeStyle = 'rgba(80,200,200,.5)'; c.lineWidth = 2; c.beginPath(); for (let y = 0; y <= 900; y += 8) { const x = 150 + 34 * Math.sin(y / 110) + 18 * Math.sin(y / 37 + 1); y ? c.lineTo(x * K, y * K) : c.moveTo(x * K, y * K); } c.stroke();
    c.lineCap = 'round'; c.strokeStyle = 'rgba(40,160,80,.55)'; c.lineWidth = 3;
    for (const id in AP.N) for (const o of AP.N[id].adj) if (id < o && !(isRw(id) && isRw(o))) { c.beginPath(); c.moveTo(AP.N[id].x * K, AP.N[id].y * K); c.lineTo(AP.N[o].x * K, AP.N[o].y * K); c.stroke(); }
    AP.rw.forEach(R => { c.strokeStyle = '#37e07a'; c.lineWidth = 7; c.beginPath(); c.moveTo(R.x0 * K, R.y * K); c.lineTo(R.x1 * K, R.y * K); c.stroke(); c.strokeStyle = '#021208'; c.lineWidth = 2; c.setLineDash([6, 8]); c.stroke(); c.setLineDash([]);
      T_(c, R.names[0], R.x0 * K - 6, R.y * K - 12, { s: 12, c: '#7dffb0', a: 'right', f: MONO }); T_(c, R.names[1], R.x1 * K + 6, R.y * K - 12, { s: 12, c: '#7dffb0', a: 'left', f: MONO }); });
    AP.gates.forEach(g => { c.fillStyle = g.open ? '#2fbf6a' : '#1a4a30'; c.fillRect(g.x * K - 4, g.y * K - 4, 8, 8); });
    c.fillStyle = '#7dd3ff'; c.fillRect(1345 * K - 4, 840 * K - 4, 8, 8); T_(c, 'TWR', 1345 * K, 840 * K - 14, { s: 11, a: 'center', c: '#7dd3ff', f: MONO });
    T_(c, 'N', SW / 2, 44, { s: 13, a: 'center', c: '#7dffb0', f: MONO });
    return cv;
  }
  function drawRadar(c, now) {
    frame(c, 0, now); S_.hits[0].length = 0;
    if (!G || !AP) { T_(c, 'NO SIGNAL', SW / 2, SH / 2, { s: 30, a: 'center', c: '#2a8a55' }); return; }
    if (radarKey !== AP) { radarBg = radarStatic(); radarKey = AP; }
    c.drawImage(radarBg, 0, 30, SW, SH - 30, 0, 30, SW, SH - 30);
    const cx = SW / 2, cy = SH / 2, ang = (now * 1.35) % (Math.PI * 2);
    for (let i = 0; i < 26; i++) { c.strokeStyle = `rgba(80,255,150,${0.28 * (1 - i / 26)})`; c.lineWidth = 10; c.beginPath(); c.moveTo(cx, cy); const a = ang - i * 0.04; c.lineTo(cx + Math.cos(a) * 640, cy + Math.sin(a) * 640); c.stroke(); }
    c.strokeStyle = 'rgba(160,255,200,.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ang) * 640, cy + Math.sin(ang) * 640); c.stroke();
    G.planes.forEach(p => {
      const x = p.x * K, y = p.y * K + 0, a = Math.atan2(y - cy, x - cx); let d = (ang - a) % (Math.PI * 2); if (d < 0) d += Math.PI * 2;
      const al = 0.3 + 0.7 * Math.pow(1 - d / (Math.PI * 2), 1.6), bad = p.al_ || p.em || p.st === 'accident', col = bad ? (Math.floor(now * 4) % 2 ? '#ff4040' : '#ffb0b0') : p.id === G.sel ? '#ffe45a' : '#5dff9a';
      c.globalAlpha = al; c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 2;
      c.save(); c.translate(x, y); c.rotate(p.h);
      if (p.air) { c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, 6); c.lineTo(-3, 0); c.lineTo(-6, -6); c.closePath(); c.fill(); c.beginPath(); c.moveTo(-8, 0); c.lineTo(-26, 0); c.globalAlpha = al * 0.4; c.stroke(); }
      else { c.fillRect(-5, -5, 10, 10); }
      c.restore(); c.globalAlpha = 1;
      if (p.id === G.sel) { c.strokeStyle = '#ffe45a'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 17 + Math.sin(now * 6) * 2, 0, 7); c.stroke(); }
      if (p.st !== 'gate' || p.id === G.sel) { c.globalAlpha = Math.max(0.5, al); T_(c, p.cs, x + 14, y - 9, { s: 14, w: 700, c: col, f: MONO }); T_(c, p.air ? 'FL' + String(Math.round(p.alt / 100)).padStart(3, '0') : (p.st === 'accident' ? 'DOWN' : 'GND'), x + 14, y + 6, { s: 12, c: col, f: MONO }); c.globalAlpha = 1; }
      hit(0, x - 22, y - 22, 44, 44, p.id, () => { G.sel = p.id; });
    });
    if (G.acc) { const x = G.acc.x * K, y = G.acc.y * K; c.strokeStyle = '#ff3030'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 24 + (now * 30) % 20, 0, 7); c.stroke(); }
  }

  // ---------- 1: board ----------
  function drawBoard(c, now) {
    frame(c, 1, now); S_.hits[1].length = 0;
    if (!G) { T_(c, 'STANDBY', SW / 2, SH / 2, { s: 30, a: 'center', c: '#2a5a8a' }); return; }
    const tabs = [['arr', T('arrivals')], ['dep', T('departures')]];
    tabs.forEach(([k, label], n) => { const x = 14 + n * 250, on = S_.boardTab === k, cnt = G.planes.filter(p => p.dir === k).length;
      c.fillStyle = on ? 'rgba(0,229,255,.22)' : 'rgba(255,255,255,.06)'; rr(c, x, 38, 240, 36, 8); c.fill(); if (on) { c.strokeStyle = '#00e5ff'; c.lineWidth = 2; c.stroke(); }
      T_(c, `${label}  (${cnt})`, x + 120, 56, { s: 18, w: 700, a: 'center', c: on ? '#00e5ff' : '#8fa8c0' }); hit(1, x, 38, 240, 36, 'tab' + k, () => { S_.boardTab = k; }); });
    const cols = [24, 196, 500, 600, 810];
    ['flight', 'fromto', 'aircraft', 'status', 'eta'].forEach((k, n) => T_(c, T(k).toUpperCase(), cols[n], 94, { s: 14, w: 700, c: '#7f99b3' }));
    c.fillStyle = 'rgba(0,229,255,.25)'; c.fillRect(14, 106, SW - 28, 1.5);
    const list = G.planes.filter(p => p.dir === S_.boardTab).sort((a, b) => etaMin(a) - etaMin(b)).slice(0, 12);
    list.forEach((p, n) => { const y = 112 + n * 37, A = AIRLINES[p.al], [sk, scl] = statusKey(p);
      if (p.id === G.sel) { c.fillStyle = 'rgba(0,229,255,.22)'; c.fillRect(14, y, SW - 28, 35); } else if (n % 2) { c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(14, y, SW - 28, 35); }
      if (p.al_) { c.fillStyle = Math.floor(now * 4) % 2 ? 'rgba(255,40,40,.28)' : 'rgba(255,40,40,.1)'; c.fillRect(14, y, SW - 28, 35); }
      c.fillStyle = A.tail; rr(c, cols[0], y + 6, 26, 23, 6); c.fill(); c.strokeStyle = A.acc; c.lineWidth = 1.5; c.stroke(); T_(c, p.al, cols[0] + 13, y + 18, { s: 11, w: 800, a: 'center', c: '#fff' });
      T_(c, p.cs, cols[0] + 34, y + 18, { s: 20, w: 700, f: MONO });
      T_(c, cityName(p.city), cols[1], y + 18, { s: 18, m: 290 }); T_(c, p.ty, cols[2], y + 18, { s: 18, w: 600, c: '#cfe3f5' });
      T_(c, T(sk), cols[3], y + 18, { s: 18, w: 700, c: stCol(scl), m: 200 }); T_(c, p.st === 'accident' ? '--:--' : hhmm(etaMin(p)), cols[4], y + 18, { s: 20, w: 700, f: MONO, c: '#d8ecff' });
      hit(1, 14, y, SW - 28, 35, p.id, () => { G.sel = p.id; }); });
    if (!list.length) T_(c, '—', SW / 2, 300, { s: 40, a: 'center', c: '#456' });
  }

  // ---------- 2: selected aircraft ----------
  function plan(c, p, x, y, sc) { // top-down silhouette in livery colours
    const A = AIRLINES[p.al], T0 = TYPES[p.ty], L = T0.len * sc, sp = T0.span * sc, fw = T0.fw * sc * 0.9;
    c.save(); c.translate(x, y);
    c.fillStyle = A.body; c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(L * 0.08, -fw * 0.5); c.lineTo(-L * 0.12, -sp / 2); c.lineTo(-L * 0.12 - L * 0.12, -sp / 2); c.lineTo(-L * 0.1 - L * 0.17, -fw * 0.5); c.lineTo(-L * 0.1 - L * 0.17, fw * 0.5); c.lineTo(-L * 0.12 - L * 0.12, sp / 2); c.lineTo(-L * 0.12, sp / 2); c.lineTo(L * 0.08, fw * 0.5); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-L * 0.4, 0); c.lineTo(-L * 0.5, -sp * 0.18); c.lineTo(-L * 0.55, -sp * 0.18); c.lineTo(-L * 0.46, 0); c.lineTo(-L * 0.55, sp * 0.18); c.lineTo(-L * 0.5, sp * 0.18); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = A.body; rr(c, -L * 0.5, -fw / 2, L, fw, fw / 2); c.fill(); c.stroke();
    c.fillStyle = A.tail; c.fillRect(-L * 0.5 + 2, -fw * 0.15, L * 0.1, fw * 0.3); c.fillStyle = A.acc; c.fillRect(-L * 0.36, -fw * 0.06, L * 0.7, fw * 0.12);
    c.fillStyle = '#26323f'; for (const s of T0.eng === 4 ? [-0.22, -0.4, 0.22, 0.4] : [-0.3, 0.3]) { c.beginPath(); c.arc(-L * 0.05 + L * 0.02, s * sp * 0.9 * 0.98, fw * 0.3, 0, 7); c.fill(); }
    c.restore();
  }
  const CMDS = [['land', 'LAND', p => p.air && p.dir === 'arr' && p.st === 'inbound', p => cmdLand(p)],
    ['takeoff', 'TAKEOFF', p => !p.air && !p.em && p.dir === 'dep' && (isReady(p) || ['idle', 'taxi'].includes(p.st)), p => cmdTakeoff(p)],
    ['hold', 'HOLD', p => p.air ? p.st !== 'climb' : ['taxi', 'idle', 'lineup'].includes(p.st) && !p.hold, p => cmdHold(p)],
    ['gate', 'TAXI TO GATE', p => !p.air && !p.em && p.dir === 'arr' && ['idle', 'taxi'].includes(p.st), p => cmdGate(p)],
    ['go', 'GO AROUND', p => (p.air && p.st === 'final') || (!p.air && p.hold && p.st !== 'accident'), p => p.air ? goAround(p, 'as instructed') : cmdGo(p)]];
  function drawInfo(c, now) {
    frame(c, 2, now); S_.hits[2].length = 0;
    const p = G && sel();
    if (!p) { T_(c, G ? 'NO AIRCRAFT SELECTED' : 'STANDBY', SW / 2, 220, { s: 34, w: 700, a: 'center', c: '#3d6a90' }); T_(c, 'Tap an aircraft in the window, a radar blip or a board row', SW / 2, 270, { s: 20, a: 'center', c: '#5d7f9e' });
      CMDS.forEach(([id, label], n) => { const x = 24 + n * 199; c.fillStyle = 'rgba(255,255,255,.05)'; rr(c, x, 470, 186, 74, 12); c.fill(); T_(c, label, x + 93, 507, { s: 18, w: 700, a: 'center', c: '#3a4a5a', m: 170 }); }); return; }
    const A = AIRLINES[p.al], [sk, scl] = statusKey(p);
    c.fillStyle = A.tail; rr(c, 24, 44, 78, 78, 16); c.fill(); c.lineWidth = 3; c.strokeStyle = A.acc; c.stroke(); T_(c, p.al, 63, 83, { s: 34, w: 800, a: 'center', c: '#fff' });
    T_(c, p.cs, 118, 70, { s: 46, w: 800, f: MONO }); T_(c, A.full, 120, 106, { s: 20, c: '#8fa8c0' });
    c.fillStyle = 'rgba(0,229,255,.15)'; rr(c, 880, 56, 124, 44, 10); c.fill(); c.strokeStyle = '#00e5ff'; c.lineWidth = 2; c.stroke(); T_(c, p.ty, 942, 79, { s: 26, w: 800, a: 'center', c: '#00e5ff' });
    const rows = [[p.dir === 'arr' ? T('from') : T('to'), cityName(p.city), '#fff'], [T('status'), T(sk), stCol(scl)], [T('alt'), kn(p), '#fff'], [T('speed'), speedKt(p) + ' ' + T('kt'), '#fff'], ['Passengers', String(p.pax), '#fff'], ['Wait', p.w > 5 ? Math.round(p.w) + ' s' : '—', p.w > 25 ? '#ff7a5a' : '#fff']];
    rows.forEach(([k, v, col], n) => { const y = 150 + n * 49; c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(24, y, 560, 42); T_(c, k, 38, y + 21, { s: 18, c: '#7f99b3' }); T_(c, v, 570, y + 21, { s: 24, w: 700, a: 'right', c: col, m: 330 }); });
    c.fillStyle = 'rgba(255,255,255,.04)'; rr(c, 610, 150, 394, 288, 14); c.fill(); plan(c, p, 810 + 6, 294, Math.min(5.4, 370 / TYPES[p.ty].span * 0.98));
    CMDS.forEach(([id, label, ok, fn], n) => { const x = 24 + n * 199, y = 470, en = ok(p), pr = pressedOn(2, id, now);
      c.fillStyle = pr ? '#00e5ff' : en ? 'rgba(0,229,255,.2)' : 'rgba(255,255,255,.05)'; rr(c, x, y, 186, 74, 12); c.fill(); c.strokeStyle = en ? '#00e5ff' : 'rgba(255,255,255,.12)'; c.lineWidth = 2; c.stroke();
      const lines = label.split(' '); const two = lines.length > 1 && label.length > 9;
      if (two) { T_(c, lines.slice(0, 2).join(' '), x + 93, y + 37, { s: 19, w: 800, a: 'center', c: pr ? '#04202a' : '#d8f6ff', m: 170 }); } else T_(c, label, x + 93, y + 37, { s: 22, w: 800, a: 'center', c: pr ? '#04202a' : en ? '#d8f6ff' : '#3a4a5a', m: 170 });
      if (!en && two) { c.fillStyle = 'rgba(5,10,18,.55)'; rr(c, x, y, 186, 74, 12); c.fill(); }
      if (en) hit(2, x, y, 186, 74, id, () => { fn(p); }); });
  }

  // ---------- 3: alerts, radio, money ----------
  function drawAlerts(c, now) {
    frame(c, 3, now); S_.hits[3].length = 0;
    if (!G) { T_(c, 'STANDBY', SW / 2, SH / 2, { s: 30, a: 'center', c: '#2a5a8a' }); return; }
    const per = G.inc.reduce((a, i) => a + i.a, 0) / (Math.min(60, Math.max(G.t, 10)) / 20), s = Math.round(G.sat);
    c.fillStyle = 'rgba(255,255,255,.05)'; rr(c, 14, 38, 496, 66, 12); c.fill(); rr(c, 522, 38, 488, 66, 12); c.fill();
    T_(c, 'MONEY', 30, 56, { s: 14, w: 700, c: '#7f99b3' }); T_(c, '$' + Math.round(G.money).toLocaleString('en-US'), 30, 84, { s: 34, w: 800, c: '#4dff8a', f: MONO }); T_(c, '+$' + Math.round(per).toLocaleString('en-US') + '/h', 494, 82, { s: 20, w: 700, a: 'right', c: '#7dffb0', f: MONO });
    T_(c, T('satLabel').toUpperCase(), 538, 56, { s: 14, w: 700, c: '#7f99b3' }); const sc = s > 60 ? '#35e57a' : s > 30 ? '#ffd84a' : '#ff5252';
    T_(c, s + '%', 538, 84, { s: 34, w: 800, c: sc, f: MONO }); c.fillStyle = 'rgba(255,255,255,.12)'; rr(c, 650, 70, 340, 22, 11); c.fill(); c.fillStyle = sc; rr(c, 650, 70, Math.max(10, 340 * s / 100), 22, 11); c.fill();
    // alert panel
    let title = 'ALL CLEAR', msg = 'No conflicts. Traffic is flowing normally.', bg = 'rgba(30,140,80,.25)', bd = '#35e57a', tc = '#7dffb0', flash = false;
    const em = G.planes.find(p => p.em && p.air);
    if (G.acc) { title = '🔥 ACCIDENT'; msg = G.acc.msg + (G.acc.site ? ' Emergency services are on site.' : ''); flash = Math.floor(now * 3) % 2; bg = flash ? 'rgba(230,80,10,.5)' : 'rgba(120,30,5,.5)'; bd = '#ff8a30'; tc = '#ffd0a0'; }
    else if (G.warn && G.warnMsg) { title = '⚠ COLLISION ALERT'; msg = G.warnMsg; flash = Math.floor(now * 4) % 2; bg = flash ? 'rgba(255,20,20,.55)' : 'rgba(110,0,0,.5)'; bd = '#ff4040'; tc = '#fff'; }
    else if (em) { title = '🚨 ' + T('mayday'); msg = `${full(em)} ${em.cs}: ${{ engine: 'engine failure', fire: 'engine fire', medical: 'medical emergency', fuel: 'minimum fuel' }[em.em.k]} — ${Math.ceil(em.em.t)}s. Clear to land!`; bg = 'rgba(190,120,0,.4)'; bd = '#ffb020'; tc = '#ffe0a0'; }
    c.fillStyle = bg; rr(c, 14, 114, SW - 28, 120, 14); c.fill(); c.strokeStyle = bd; c.lineWidth = 3; c.stroke();
    T_(c, title, 32, 140, { s: 30, w: 800, c: tc }); c.font = `500 20px ${FONT}`; const ls = wrap(c, msg, SW - 80); ls.slice(0, 3).forEach((l, n) => T_(c, l, 32, 176 + n * 25, { s: 20, c: '#fff' }));
    // radio log
    c.fillStyle = 'rgba(0,0,0,.3)'; rr(c, 14, 244, SW - 28, 322, 12); c.fill(); T_(c, 'RADIO LOG', 28, 262, { s: 13, w: 700, c: '#7f99b3' });
    const lines = []; c.font = `500 17px ${MONO}`;
    for (const e of radioLog.slice(-14)) { const w = wrap(c, e.txt, SW - 140); w.forEach((l, n) => lines.push({ t: n ? '' : e.t, l, k: e.kind })); }
    const vis = lines.slice(-11); vis.forEach((e, n) => { const y = 288 + n * 24, col = e.k === 'warn' ? '#ff8a8a' : e.k === 'pl' ? '#ffe9a6' : '#9fe6ff'; T_(c, e.t, 28, y, { s: 15, c: '#58718a', f: MONO }); T_(c, e.l, 96, y, { s: 17, c, f: MONO }); });
  }

  const draws = [drawRadar, drawBoard, drawInfo, drawAlerts], IV = [1 / 20, 1 / 4, 1 / 8, 1 / 10];
  S_.update = function (now, focus) {
    for (let i = 0; i < 4; i++) {
      const iv = i === focus ? 1 / 30 : IV[i]; if (now - last[i] < iv) continue; last[i] = now;
      const s = S_.list[i], c = s.ctx; c.setTransform(CW / SW, 0, 0, CW / SW, 0, 0);
      try { draws[i](c, now); } catch (e) { console.error('screen', i, e); } s.tex.needsUpdate = true;
    }
  };
  // u,v in [0,1] (v up). Returns true if a control was hit.
  S_.tap = function (i, u, v, now) {
    const x = u * SW, y = (1 - v) * SH; let best = null, bd = 1e9;
    for (const h of S_.hits[i]) { if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { const d = Math.hypot(x - (h.x + h.w / 2), y - (h.y + h.h / 2)); if (d < bd) { bd = d; best = h; } } }
    if (best) { best.fn(); last[i] = 0; Sfx.click(); S_.pressed = { i, id: best.id, t: now }; return true; } return false;
  };
  return S_;
}
