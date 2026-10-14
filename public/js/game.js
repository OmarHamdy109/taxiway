'use strict';
// ---- Taxiway Alpha: simulation (state, commands, physics, emergencies, accidents) ----
const $ = id => document.getElementById(id);
const LS = 'taxiway_alpha_v2';
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

let store = { s: { lang: 'en', diff: 'normal', ap: 'CAI', snd: true }, meta: { life: 0 }, run: null };
try { const o = JSON.parse(localStorage.getItem(LS)); if (o) store = Object.assign(store, o); } catch (e) {}
const S = store.s;
let G = null;   // current run (serialisable)
let AP = null;  // airport ground graph
let paused = true, started = false;
const T = k => (I18N[S.lang][k] != null ? I18N[S.lang][k] : k);
const cfgOf = () => AIRPORTS[G.ap];
const saveAll = () => { try { store.run = G && !G.over ? G : null; localStorage.setItem(LS, JSON.stringify(store)); } catch (e) {} };
const KT_AIR = 1.8;   // display factor: sim px/s -> knots (airborne)
const speedKt = p => Math.round(p.air ? p.spd * KT_AIR : (p.st === 'roll' || p.st === 'rollout') ? p.spd * 1.15 : p.spd * 0.4);
const altFt = p => Math.round(p.alt / 10) * 10;

// ---------- setup ----------
function newGame(code) {
  G = { ap: code, money: 2000, sat: 92, gm: 12 * 60 + 34, t: 0, planes: [], veh: [], gp: Array(10).fill(null), up: { rw: 0, term: 0, gs: 0 },
    wx: 'clear', wxT: 70, wind: { d: 270, k: 7 }, nextArr: 3, nextDep: 18, nextEm: 110, seq: 1, inc: [], stats: { arr: 0, dep: 0 }, earned: 0,
    over: false, sel: null, warn: false, acc: null };
  rebuild();
  const n = freeGate().length;
  for (let k = 0; k < n - 1; k++) spawnDeparture(10 + k * 12);
}
function rebuild() { AP = buildAirport(cfgOf(), cfgOf().gates + 2 * G.up.term); if (window.mapDirty) mapDirty(); }
const nodePt = id => AP.N[id];
const windTxt = () => `wind ${String(G.wind.d).padStart(3, '0')} at ${G.wind.k} knots`;

// ---------- pathfinding ----------
const isRw = id => id[0] === 'R';
function route(from, to) {
  const d = { [from]: 0 }, prev = {}, todo = new Set([from]);
  while (todo.size) {
    let u = null; todo.forEach(k => { if (u === null || d[k] < d[u]) u = k; }); todo.delete(u);
    if (u === to) break;
    for (const v of AP.N[u].adj) {
      const w = dist(AP.N[u], AP.N[v]) * (isRw(u) && isRw(v) ? 2.5 : 1), nd = d[u] + w;
      if (d[v] === undefined || nd < d[v]) { d[v] = nd; prev[v] = u; todo.add(v); }
    }
  }
  if (d[to] === undefined) return null;
  const p = []; for (let c = to; c !== undefined; c = prev[c]) p.unshift(c);
  return { ids: p, d: d[to] };
}
function nearestNode(x, y) {
  let b = null, bd = 1e9;
  for (const id in AP.N) { const n = AP.N[id], d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; b = id; } }
  return b;
}

// ---------- planes ----------
const radius = p => TYPES[p.ty].len * 0.33;
function callsign(code) { let c; do c = code + Math.floor(rnd(100, 999)); while (G.planes.some(p => p.cs === c)); return c; }
const spoken = p => AIRLINES[p.al].n + ' ' + p.cs.slice(2);
const full = p => AIRLINES[p.al].full;
function mkPlane(dir) {
  const cfg = cfgOf(), al = pick(cfg.air), ty = pick(cfg.fleet);
  return { id: G.seq++, cs: callsign(al), al, ty, pax: Math.round(TYPES[ty].pax * rnd(0.6, 0.95)), dir, city: pick(cfg.cities),
    x: 0, y: 0, h: 0, spd: 0, alt: 0, talt: 0, air: false, st: 'idle', path: [], wp: [], dest: null, gate: -1, tm: 0, hold: false, hs: -1, circ: false, w: 0,
    ft: 0, rw: 0, end: 0, stage: 0, em: null, ga: false, fix: null };
}
function spawnArrival() {
  const p = mkPlane('arr'), s = Math.floor(rnd(0, 4));
  if (s === 0) { p.x = -70; p.y = rnd(80, 820); } else if (s === 1) { p.x = W + 70; p.y = rnd(80, 820); }
  else if (s === 2) { p.x = rnd(200, 1400); p.y = -70; } else { p.x = rnd(200, 1400); p.y = H + 70; }
  if (G.planes.some(q => q.air && dist(p, q) < 220)) return false;
  let alt = 0; for (let k = 0; k < 8; k++) { alt = 4000 + 1000 * Math.floor(rnd(0, 5)); if (!G.planes.some(q => q.air && Math.abs(q.talt - alt) < 900)) break; }
  p.alt = p.talt = alt; p.fix = { x: rnd(300, 1300), y: rnd(180, 720) };
  p.h = Math.atan2(p.fix.y - p.y, p.fix.x - p.x); p.spd = 105; p.air = true; p.st = 'inbound';
  G.planes.push(p);
  radio(`${spoken(p)}: ${cfgOf().tower}, ${spoken(p)}, ${T0(AIRLINES[p.al].n)} with you, descending ${alt} feet.`, 'pl');
  setTimeout(() => radio(`${cfgOf().tower}: ${spoken(p)}, radar contact, expect ILS approach, ${windTxt()}.`, 'tw'), 700);
  return true;
}
const T0 = x => x;
const freeGate = () => AP.gates.filter(g => g.open && G.gp[g.i] === null);
function spawnDeparture(tm) {
  const fg = freeGate(); if (!fg.length) return false;
  const g = pick(fg), p = mkPlane('dep');
  Object.assign(p, { x: g.x, y: g.y, h: Math.PI / 2, st: 'gate', gate: g.i, tm: tm || rnd(10, 25) });
  G.gp[g.i] = p.id; G.planes.push(p); return true;
}
const turnTime = () => 22 * Math.pow(0.75, G.up.gs);
const byId = id => G.planes.find(p => p.id === id);
const sel = () => G && G.sel ? byId(G.sel) : null;
const isReady = p => p.st === 'gate' && p.dir === 'dep' && p.tm <= 0;

function radio(txt, kind) {
  const ul = $('radio'); if (!ul) return;
  const li = document.createElement('li'); li.textContent = txt; li.className = kind || '';
  ul.appendChild(li); while (ul.children.length > 4) ul.removeChild(ul.firstChild); setTimeout(() => li.remove(), 14000); Sfx.radio();
}
const pilot = (p, txt) => radio(`${spoken(p)}: ${txt}`, 'pl');
const later = (f, ms) => setTimeout(() => { if (G && !G.over) f(); }, ms);

// ---------- runway logic ----------
const inRw = (q, r) => { const R = AP.rw[r]; return q.x > R.x0 - 25 && q.x < R.x1 + 25 && Math.abs(q.y - R.y) < 30; };
const rwEnd = (r, e) => ({ x: e ? AP.rw[r].x1 : AP.rw[r].x0, y: AP.rw[r].y });
const runwayDirAt = (e) => e === 0 ? 1 : -1;
// Occupied or about to be: aircraft on it, on short final, or (for landing) anyone established on final
function runwayBusy(r, selfId, forLanding) {
  return G.planes.some(q => q.id !== selfId && q.st !== 'accident' && ((!q.air && inRw(q, r)) ||
    (q.air && q.st === 'final' && q.rw === r && (forLanding ? q.stage >= 0 : q.stage >= 1 && dist(q, rwEnd(r, q.end)) < 450))));
}
function setPath(p, ids, dest) {
  if (p.gate >= 0 && !(dest && dest === 'G' + p.gate)) { G.gp[p.gate] = null; p.gate = -1; }
  p.path = ids.map(id => ({ x: nodePt(id).x, y: nodePt(id).y })); p.dest = dest || ids[ids.length - 1];
  p.st = 'taxi'; p.hold = false; p.w = 0;
  if (/^G\d$/.test(p.dest)) { p.gate = +p.dest.slice(1); G.gp[p.gate] = p.id; }
}

// ---------- commands ----------
function cmdLand(p, rwI) {
  if (!p.air || p.dir !== 'arr' || p.st === 'final' && p.stage >= 1 || G.over) return;
  let best = null;
  for (const r of (rwI == null ? [0, 1] : [rwI])) {
    if (runwayBusy(r, p.id, true)) continue;
    for (const e of [0, 1]) {
      const p0 = { x: rwEnd(r, e).x - runwayDirAt(e) * 320, y: AP.rw[r].y }, sc = dist(p, p0);
      if (!best || sc < best.sc) best = { r, e, sc };
    }
  }
  if (!best) {
    radio(`${cfgOf().tower}: ${spoken(p)}, unable, runway occupied. Continue holding.`, 'tw'); later(() => pilot(p, `Holding, ${spoken(p)}.`), 600);
    if (p.st !== 'final') { p.st = 'inbound'; p.circ = true; p.wp = []; }
    return;
  }
  Object.assign(p, { st: 'final', rw: best.r, end: best.e, stage: p.wp.length ? -1 : 0, circ: false, w: 0, hold: false, talt: 2500 });
  const rn = AP.rw[best.r].names[best.e];
  radio(`${cfgOf().tower}: ${spoken(p)}, ${windTxt()}, runway ${rn}, cleared to land.`, 'tw');
  later(() => pilot(p, `Cleared to land runway ${rn}, ${spoken(p)}.`), 700);
}
function cmdHold(p) {
  if (G.over) return;
  if (p.air) {
    if (p.st === 'climb') return;
    p.st = 'inbound'; p.circ = true; p.wp = []; p.w = 0; p.talt = Math.max(4000, p.talt);
    radio(`${cfgOf().tower}: ${spoken(p)}, hold at present position, orbit right.`, 'tw'); later(() => pilot(p, `Orbit right, ${spoken(p)}.`), 700);
  } else if (['taxi', 'idle', 'lineup'].includes(p.st)) {
    p.hold = true; radio(`${cfgOf().tower}: ${spoken(p)}, hold position.`, 'tw'); later(() => pilot(p, `Holding position, ${spoken(p)}.`), 700);
  }
}
function cmdGo(p) { if (!p.air && p.hold) { p.hold = false; radio(`${cfgOf().tower}: ${spoken(p)}, continue taxi.`, 'tw'); later(() => pilot(p, `Continuing, ${spoken(p)}.`), 600); } }
function cmdGate(p, gi) {
  if (G.over || p.air || p.em || p.dir !== 'arr' || !['taxi', 'idle'].includes(p.st)) return;
  const from = nearestNode(p.x, p.y); let best = null;
  for (const g of freeGate().concat(p.gate >= 0 ? [AP.gates[p.gate]] : [])) {
    if (gi != null && g.i !== gi) continue;
    const r = route(from, g.node); if (r && (!best || r.d < best.r.d)) best = { g, r };
  }
  if (!best) return;
  setPath(p, best.r.ids, best.g.node);
  radio(`${cfgOf().tower}: ${spoken(p)}, vacate and taxi to gate ${best.g.i + 1} via Alpha.`, 'tw'); later(() => pilot(p, `Taxi to gate ${best.g.i + 1}, ${spoken(p)}.`), 700);
}
function cmdTakeoff(p, rwI) {
  if (G.over || p.air || p.dir !== 'dep' || p.em || !(isReady(p) || ['idle', 'taxi'].includes(p.st))) return;
  const from = nearestNode(p.x, p.y); let best = null;
  for (const r of (rwI == null ? [0, 1] : [rwI])) for (const e of [0, 1]) {
    const rt = route(from, 'R' + r + (e ? '1' : '0')); if (!rt) continue;
    const sc = rt.d + (runwayBusy(r, p.id) ? 500 : 0);
    if (!best || sc < best.sc) best = { r, e, rt, sc };
  }
  if (!best) return;
  p.rw = best.r; p.end = best.e; p.ga = false;
  setPath(p, best.rt.ids, 'R' + best.r + (best.e ? '1' : '0'));
  const rn = AP.rw[best.r].names[best.e];
  radio(`${cfgOf().tower}: ${spoken(p)}, taxi to holding point runway ${rn} via Alpha, hold short.`, 'tw'); later(() => pilot(p, `Taxi holding point ${rn}, ${spoken(p)}.`), 700);
}
// Freehand path from a plane
function applyDrag(p, pts) {
  if (G.over || p.em && !p.air) return;
  if (p.air) {
    if (p.dir !== 'arr' || p.st === 'climb') return;
    const wp = []; let last = null;
    for (const q of pts) if (!last || dist(q, last) > 45) { wp.push(q); last = q; }
    const end = pts[pts.length - 1];
    let rwHit = null; AP.rw.forEach(R => { if (end.x > R.x0 - 60 && end.x < R.x1 + 60 && Math.abs(end.y - R.y) < 60) rwHit = R.i; });
    p.wp = wp; p.st = 'inbound'; p.circ = false; p.fix = null; p.w = 0;
    if (rwHit != null) { const R = AP.rw[rwHit]; p.wp = wp.filter(q => !(q.x > R.x0 - 60 && q.x < R.x1 + 60 && Math.abs(q.y - R.y) < 60)); cmdLand(p, rwHit); }
    else { if (!wp.length) p.circ = true; radio(`${cfgOf().tower}: ${spoken(p)}, fly heading as directed.`, 'tw'); later(() => pilot(p, `Fly heading, ${spoken(p)}.`), 600); }
    return;
  }
  if (!['taxi', 'idle', 'gate'].includes(p.st) || p.st === 'gate' && !isReady(p)) return;
  let cur = nearestNode(p.x, p.y), ids = [cur], dest = cur;
  for (const q of pts) {
    const n = nearestNode(q.x, q.y);
    if (n !== cur && Math.hypot(AP.N[n].x - q.x, AP.N[n].y - q.y) < 70) { const r = route(cur, n); if (r) { ids = ids.concat(r.ids.slice(1)); cur = n; dest = n; } }
  }
  if (ids.length < 2) return;
  if (/^G\d$/.test(dest)) { const gi = +dest.slice(1); if (G.gp[gi] !== null && G.gp[gi] !== p.id) return; }
  if (/^R\d[01]$/.test(dest)) { if (p.dir !== 'dep') return; p.rw = +dest[1]; p.end = +dest[2]; }
  setPath(p, ids, dest);
  radio(`${cfgOf().tower}: ${spoken(p)}, taxi as directed.`, 'tw'); later(() => pilot(p, `Taxi as directed, ${spoken(p)}.`), 600);
}

// ---------- simulation ----------
function steer(p, tx, ty, tr, dt) { const da = angDiff(Math.atan2(ty - p.y, tx - p.x), p.h); p.h += clamp(da, -tr * dt, tr * dt); return da; }
const wxMul = () => G.wx === 'rain' ? 0.85 : G.wx === 'fog' ? 0.8 : G.wx === 'storm' ? 0.75 : 1;
function revenue(amt, p) {
  amt = Math.round(amt * (0.5 + G.sat / 100) * cfgOf().pay); G.money += amt; G.earned += amt; store.meta.life += amt; G.inc.push({ t: G.t, a: amt }); Sfx.cash();
  if (window.floatTxt) floatTxt(p, amt);
}
function departPlane(p) {
  G.planes = G.planes.filter(q => q !== p); if (G.sel === p.id) G.sel = null;
  G.stats.dep++; revenue(p.pax * 11, p); G.sat = Math.min(100, G.sat + 1.5);
  radio(`${cfgOf().tower}: ${spoken(p)}, radar contact, contact departure, good day.`, 'tw'); later(() => pilot(p, `Contact departure, good day, ${spoken(p)}.`), 700);
}
function parkPlane(p) {
  const g = AP.gates[p.gate]; p.x = g.x; p.y = g.y; p.h = Math.PI / 2; p.st = 'gate'; p.spd = 0;
  if (p.dir === 'arr') {
    G.stats.arr++; revenue(p.pax * 8, p); G.sat = Math.min(100, G.sat + 2);
    pilot(p, `Parked at gate ${g.i + 1}, shutting down, ${spoken(p)}.`);
    const al = pick(cfgOf().air); p.al = al; p.cs = callsign(al); p.dir = 'dep'; p.city = pick(cfgOf().cities);
    p.pax = Math.round(TYPES[p.ty].pax * rnd(0.6, 0.95)); p.tm = turnTime();
  }
}
function touchdown(p, Tp, dir) {
  p.air = false; p.alt = 0; p.st = 'rollout'; p.spd = 105; p.h = dir > 0 ? 0 : Math.PI; p.y = Tp.y; p.w = 0; p.circ = false;
  const r = p.rw, e = p.end, ex = 'R' + r + (e ? 'b' : 'a'), tx = (r === 0 ? 'A' : 'B') + (e ? 'b' : 'a');
  p.path = [ex, tx].map(id => ({ x: nodePt(id).x, y: nodePt(id).y })); p.dest = tx;
  Sfx.touch();
  if (p.em && p.em.k === 'fuel') p.em = null;
  if (p.em) dispatchEmergency(p, tx);
}
function goAround(p, why) {
  p.st = 'inbound'; p.circ = true; p.stage = 0; p.ga = true; p.talt = 4000 + 1000 * Math.floor(rnd(0, 3)); p.wp = []; G.sat -= 2;
  radio(`${spoken(p)}: Going around${why ? ', ' + why : ''}, ${spoken(p)}.`, 'warn');
}
function updateAir(p, dt) {
  const R = AP.rw[p.rw];
  let spd = p.em && p.em.k !== 'medical' && p.em.k !== 'fuel' ? 85 : 105;
  p.ft += dt;
  if (p.st === 'inbound') {
    if (p.wp.length) { steer(p, p.wp[0].x, p.wp[0].y, 1.3, dt); if (dist(p, p.wp[0]) < 40) { p.wp.shift(); if (!p.wp.length) p.circ = true; } }
    else if (p.circ || !p.fix) p.h += 0.75 * dt;
    else { steer(p, p.fix.x, p.fix.y, 1.2, dt); if (dist(p, p.fix) < 50) p.circ = true; }
    p.w += dt;
    const lim = { easy: 210, normal: 160, hard: 120 }[S.diff];
    if (!p.em && p.dir === 'arr' && p.ft > lim) { p.em = { k: 'fuel', t: 45, g: false }; radio(`${spoken(p)}: ${cfgOf().tower}, ${spoken(p)}, minimum fuel, request priority landing.`, 'warn'); Sfx.siren(); }
  } else if (p.st === 'final') {
    const dir = runwayDirAt(p.end), Tp = rwEnd(p.rw, p.end), P0 = { x: Tp.x - dir * 320, y: R.y };
    if (p.stage === -1) { if (!p.wp.length) p.stage = 0; else { steer(p, p.wp[0].x, p.wp[0].y, 1.3, dt); if (dist(p, p.wp[0]) < 40) p.wp.shift(); } }
    if (p.stage === 0) { steer(p, P0.x, P0.y, 1.4, dt); if (dist(p, P0) < 55) { p.stage = 1; radio(`${spoken(p)}: Established ILS runway ${R.names[p.end]}, ${spoken(p)}.`, 'pl'); } }
    else if (p.stage === 1) {
      steer(p, Tp.x, Tp.y, 1.6, dt); spd = G.wx === 'fog' ? 80 : 92;
      const d = dist(p, Tp); p.talt = d * 7 + 60; // 3-degree glide path
      if (!p.em && d < 170 && d > 60 && G.planes.some(q => q !== p && !q.air && q.st !== 'accident' && inRw(q, p.rw))) { goAround(p, 'runway occupied'); return; }
      if (G.wx === 'storm' && !p.ga && !p.em && d < 140 && d > 100 && Math.random() < 0.03) { goAround(p, 'windshear'); return; }
      if (d < 22) { touchdown(p, Tp, dir); return; }
    }
  } else if (p.st === 'climb') {
    p.spd = Math.min(170, p.spd + 12 * dt); spd = p.spd; p.alt += 260 * dt;
    if (p.x < -120 || p.x > W + 120 || p.y < -120 || p.y > H + 120) { departPlane(p); return; }
  }
  if (p.st !== 'climb') { p.spd += clamp(spd - p.spd, -30 * dt, 30 * dt); p.alt += clamp(p.talt - p.alt, -220 * dt, 220 * dt); }
  const wind = G.wx === 'storm' ? 14 : G.wx === 'rain' ? 5 : 0;
  p.x += Math.cos(p.h) * p.spd * dt + wind * dt; p.y += Math.sin(p.h) * p.spd * dt;
  if (p.em) { p.em.t -= dt; if (p.em.t <= 0) crash(p, null, 'fuel'); }
}
function updateGround(p, dt) {
  const tv = 48 * wxMul();
  if (p.st === 'gate') { if (p.tm > 0) p.tm -= dt; if (isReady(p)) p.w += dt; return; }
  if (p.st === 'roll') {
    p.spd += 30 * (1 + 0.25 * G.up.rw) * dt;
    p.x += Math.cos(p.h) * p.spd * dt; p.y += Math.sin(p.h) * p.spd * dt;
    if (p.spd >= 140) { p.air = true; p.st = 'climb'; p.alt = 20; Sfx.touch(); }
    return;
  }
  if (p.st === 'lineup') {
    const want = p.end ? Math.PI : 0, da = angDiff(want, p.h);
    p.h += clamp(da, -3 * dt, 3 * dt); p.spd = 0;
    if (Math.abs(da) < 0.05 && !p.hold && !runwayBusy(p.rw, p.id)) {
      p.st = 'roll'; const rn = AP.rw[p.rw].names[p.end];
      radio(`${cfgOf().tower}: ${spoken(p)}, ${windTxt()}, runway ${rn}, cleared for takeoff.`, 'tw'); later(() => pilot(p, `Cleared for takeoff runway ${rn}, ${spoken(p)}.`), 600);
    } else p.w += dt;
    return;
  }
  let target = tv;
  if (p.hold || !p.path.length) target = 0;
  else {
    const pt = p.path[0], da = steer(p, pt.x, pt.y, 3, dt);
    target = tv * Math.max(0.2, 1 - Math.abs(da) / 1.4);
    if (dist(p, pt) < Math.max(8, p.spd * dt + 2)) { p.path.shift(); if (!p.path.length) pathEnd(p); }
  }
  // hold short of an occupied runway
  let hs = -1;
  if (p.path.length && !p.hold && p.st === 'taxi') {
    for (const R of AP.rw) {
      if (inRw(p, R.i) || !inRw(p.path[0], R.i)) continue;
      const dx = Math.max(R.x0 - 25 - p.x, 0, p.x - (R.x1 + 25)), dy = Math.max(Math.abs(p.y - R.y) - 30, 0);
      if (Math.hypot(dx, dy) < 46 && runwayBusy(R.i, p.id)) { hs = R.i; break; }
    }
  }
  if (hs >= 0) { target = 0; p.w += dt; if (p.hs !== hs) { radio(`${spoken(p)}: Holding short runway ${AP.rw[hs].names[0]}, ${spoken(p)}.`, 'pl'); } }
  p.hs = hs;
  if (p.st !== 'rollout') for (const q of G.planes) { // yield to aircraft ahead
    if (q === p || q.air || q.st === 'roll') continue;
    if (dist(p, q) > radius(p) + radius(q) + 24 || opposing(p, q)) continue;
    if (Math.abs(angDiff(Math.atan2(q.y - p.y, q.x - p.x), p.h)) < 0.8) { target = 0; break; }
  }
  if (p.st === 'rollout') p.spd = Math.max(tv, p.spd - 24 * (1 + 0.25 * G.up.rw) * dt);
  else p.spd += clamp(target - p.spd, -70 * dt, 30 * dt);
  p.x += Math.cos(p.h) * p.spd * dt; p.y += Math.sin(p.h) * p.spd * dt;
  if (p.st === 'idle' || p.hold || !p.path.length) p.w += dt; else if (p.st === 'taxi' && hs < 0) p.w = 0;
}
function pathEnd(p) {
  if (p.st === 'rollout') { p.st = 'idle'; p.spd = Math.min(p.spd, 10); pilot(p, `Runway vacated, ${spoken(p)}.`); return; }
  if (p.st === 'taxi') {
    if (/^G\d$/.test(p.dest)) { parkPlane(p); return; }
    if (/^R\d[01]$/.test(p.dest) && p.dir === 'dep') { p.st = 'lineup'; p.spd = 0; pilot(p, `Ready for departure runway ${AP.rw[p.rw].names[p.end]}, ${spoken(p)}.`); return; }
    p.st = 'idle'; p.w = 0;
  }
}

// ---------- emergencies ----------
function maybeEmergency() {
  const c = G.planes.filter(p => p.air && p.dir === 'arr' && p.st === 'inbound' && !p.em);
  if (!c.length || G.planes.some(p => p.em)) return;
  const p = pick(c), k = pick(['engine', 'fire', 'medical']);
  p.em = { k, t: DIFF[S.diff].emT, g: false };
  const msg = { engine: 'engine failure', fire: 'fire in the number two engine', medical: 'medical emergency on board' }[k];
  radio(`${spoken(p)}: Mayday, mayday, mayday, ${spoken(p)}, ${msg}, request immediate landing!`, 'warn'); Sfx.siren();
}
function dispatchEmergency(p, nodeId) {
  const kinds = p.em.k === 'medical' ? ['amb'] : ['fire', 'amb'];
  const r = route('FS', nodeId); if (!r) { p.em = null; return; }
  kinds.forEach((k, i) => G.veh.push({ id: G.seq++, k, x: FS.x, y: FS.y + i * 14, h: Math.PI, path: r.ids.map(id => ({ x: nodePt(id).x, y: nodePt(id).y })), st: 'go', tm: 0, pid: p.id }));
  p.em.g = true; p.hold = false;
  radio(`${cfgOf().tower}: Fire and rescue, respond to ${spoken(p)} immediately.`, 'tw'); Sfx.siren();
}
function updateVeh(v, dt) {
  const p = v.pid ? byId(v.pid) : null, site = v.pid ? p : { x: v.tx, y: v.ty };
  if (v.st === 'go') {
    const tgt = v.path.length ? v.path[0] : site;
    if (!tgt) { v.st = 'back'; return; }
    const da = steer(v, tgt.x, tgt.y, 4, dt), f = 95 * dt * (1 - Math.min(0.7, Math.abs(da) / 2));
    v.x += Math.cos(v.h) * f; v.y += Math.sin(v.h) * f;
    if (v.path.length && dist(v, tgt) < 10) v.path.shift();
    if (!v.path.length && dist(v, site) < (v.pid ? 38 : 44 + (v.slot || 0) * 12)) { v.st = 'work'; v.tm = 5; if (!v.pid && G.acc) G.acc.site = true; }
  } else if (v.st === 'work') {
    if (!v.pid) return;
    v.tm -= dt;
    if (v.tm <= 0) {
      if (p && p.em && !G.veh.some(o => o.pid === v.pid && o.st === 'go')) {
        p.em = null; p.w = 0; G.sat = Math.min(100, G.sat + 8); revenue(2500, p); radio(`${cfgOf().tower}: Emergency services on scene, situation under control.`, 'tw');
      }
      v.st = 'back'; const r = route(nearestNode(v.x, v.y), 'FS'); v.path = r ? r.ids.map(id => ({ x: nodePt(id).x, y: nodePt(id).y })) : [];
    }
  } else {
    if (!v.path.length) { v.dead = true; return; }
    steer(v, v.path[0].x, v.path[0].y, 4, dt); v.x += Math.cos(v.h) * 95 * dt; v.y += Math.sin(v.h) * 95 * dt;
    if (dist(v, v.path[0]) < 10) v.path.shift();
  }
}

// ---------- separation & collisions ----------
const movingTaxi = q => q.st === 'taxi' && !q.hold && q.spd > 5;
const opposing = (a, b) => movingTaxi(a) && movingTaxi(b) && Math.abs(angDiff(a.h, b.h)) > 2.3;
function whereIs(p) {
  if (p.air) return 'flight path';
  const R = AP.rw.find(R => inRw(p, R.i)); return R ? 'Runway ' + R.names[p.x < (R.x0 + R.x1) / 2 ? 0 : 1] : 'taxiway';
}
function checkCollisions() {
  G.warn = false; G.warnMsg = null; const L = G.planes;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j]; if (a.air !== b.air || (a.st === 'gate' && b.st === 'gate')) continue;
    if (!a.air && opposing(a, b)) continue;
    const d = dist(a, b), rr = radius(a) + radius(b), vert = a.air ? Math.abs(a.alt - b.alt) : 0;
    if (d < rr * (!a.air && movingTaxi(a) && movingTaxi(b) ? 0.5 : 0.9) && vert < 350) { crash(a, b); return; }
    if (d < rr * (a.air ? 4.5 : 1.45) && vert < 1000) {
      G.warn = true; a.al_ = b.al_ = true;
      if (!G.warnMsg) G.warnMsg = `${full(a)} ${a.cs} and ${full(b)} ${b.cs} are on the same ${a.air ? 'flight path' : whereIs(a)}! Immediate action required!`;
    }
  }
  for (const q of L) if (q.air && q.st === 'final' && q.stage >= 1) {
    const Tp = rwEnd(q.rw, q.end), o = L.find(o => o !== q && !o.air && inRw(o, q.rw));
    if (dist(q, Tp) < 300 && o) { G.warn = true; if (!G.warnMsg) G.warnMsg = `${full(q)} ${q.cs} is on short final but Runway ${AP.rw[q.rw].names[q.end]} is occupied by ${o.cs}! Go around!`; }
  }
}
function crash(a, b, why) {
  if (G.over) return; G.over = true; Sfx.crash();
  const x = b ? (a.x + b.x) / 2 : a.x, y = b ? (a.y + b.y) / 2 : a.y;
  const lead = b ? ([a, b].find(q => ['roll', 'final', 'climb'].includes(q.st)) || a) : a, other = b ? (lead === a ? b : a) : null;
  const R = AP.rw.find(R => inRw({ x, y }, R.i));
  const where = lead.air ? 'in the airspace near ' + cfgOf().city : R ? 'on Runway ' + R.names[x < (R.x0 + R.x1) / 2 ? 0 : 1] : 'on the taxiway';
  const od = !other ? '' : other.air ? 'another aircraft' : other.st === 'taxi' ? 'a taxiing aircraft' : other.st === 'roll' ? 'an aircraft on its takeoff roll' : 'a stationary aircraft';
  const msg = b ? `${full(lead)} Flight ${lead.cs} has collided with ${od} ${where}.` : `${full(lead)} Flight ${lead.cs} has crashed short of the runway.`;
  G.acc = { x, y, t: 0, msg, site: false, debris: Array.from({ length: 14 }, () => ({ dx: rnd(-50, 50), dy: rnd(-35, 35), r: rnd(0, 6), s: rnd(3, 9), c: Math.random() })) };
  [a, b].filter(Boolean).forEach(q => { q.air = false; q.alt = 0; q.st = 'accident'; q.spd = 0; q.path = []; q.hold = true; if (G.gp[q.gate] === q.id) { /* keep */ } });
  G.sel = lead.id;
  const r = route('FS', nearestNode(x, y));
  ['fire', 'amb', 'fire', 'amb'].forEach((k, i) => G.veh.push({ id: G.seq++, k, x: FS.x + (i % 2) * 14, y: FS.y + 8 + i * 8, h: Math.PI, slot: i, tx: x, ty: y, st: 'go', tm: 0, pid: 0,
    path: (r ? r.ids : []).map(id => ({ x: nodePt(id).x, y: nodePt(id).y })) }));
  radio(`${cfgOf().tower}: Mayday! Aircraft down, all stations, crash and rescue respond!`, 'warn');
  try { store.run = null; localStorage.setItem(LS, JSON.stringify(store)); } catch (e) {}
  setTimeout(() => { if (window.showGameOver) showGameOver(); }, 9000);
}
function wxChange() {
  const w = cfgOf().wx, ks = Object.keys(w).filter(k => k !== G.wx); let tot = ks.reduce((s, k) => s + w[k], 0), r = Math.random() * tot, n = ks[0];
  for (const k of ks) { r -= w[k]; if (r <= 0) { n = k; break; } }
  G.wx = n; G.wxT = rnd(50, 90);
  G.wind = { d: 10 * Math.round(rnd(24, 30)), k: Math.round({ clear: rnd(3, 10), rain: rnd(8, 16), fog: rnd(1, 5), storm: rnd(18, 30) }[n]) };
  radio(`ATIS ${cfgOf().city}: ${{ clear: 'Clear skies, visibility ten kilometres', rain: 'Rain showers, runway wet', fog: 'Fog, visibility four hundred metres, low visibility procedures', storm: 'Thunderstorm in the vicinity, windshear reported' }[n]}, ${windTxt()}.`, 'tw');
}
let alertT = 0, warnWas = false;
function update(dt) {
  if (G.over) { G.acc.t += dt; G.veh.forEach(v => updateVeh(v, dt)); return; }
  G.t += dt; G.gm += dt * 3;
  const df = DIFF[S.diff], cfg = cfgOf();
  G.nextArr -= dt; if (G.nextArr <= 0 && G.planes.filter(p => p.dir === 'arr').length < 9) { if (spawnArrival()) G.nextArr = df.arr * Math.max(0.55, 1 - G.t / 1200) / cfg.rate; else G.nextArr = 2; }
  G.nextDep -= dt; if (G.nextDep <= 0) { G.nextDep = rnd(20, 35); if (G.planes.filter(p => p.dir === 'dep').length < AP.gates.filter(g => g.open).length * 0.7) spawnDeparture(); }
  G.nextEm -= dt; if (G.nextEm <= 0 && G.t > 80) { G.nextEm = df.em * rnd(0.8, 1.3); maybeEmergency(); }
  G.wxT -= dt; if (G.wxT <= 0) wxChange();
  for (const p of G.planes.slice()) { p.air ? updateAir(p, dt) : updateGround(p, dt); if (G.over) return; }
  G.veh.forEach(v => updateVeh(v, dt)); G.veh = G.veh.filter(v => !v.dead);
  G.planes.forEach(p => { p.al_ = false; });
  checkCollisions(); if (G.over) return;
  if (G.warn && !warnWas) { const q = G.planes.filter(p => p.al_); if (q.length > 1) radio(`${cfg.tower}: Traffic alert! ${spoken(q[0])} and ${spoken(q[1])}, separation lost!`, 'warn'); G.warnAt = G.gm; }
  warnWas = G.warn;
  let waiting = 0; G.planes.forEach(p => { if (p.w > 25 && !p.em) waiting++; });
  G.sat = clamp(G.sat - waiting * 0.05 * dt + 0.01 * dt * (1 + G.up.gs) - (G.wx === 'clear' ? 0 : 0.01 * dt), 0, 100);
  G.inc = G.inc.filter(i => G.t - i.t < 60);
  if (G.warn) { alertT -= dt; if (alertT <= 0) { alertT = 1.2; Sfx.alert(); } }
}
