'use strict';
// ---- Taxiway Alpha: HUD, input (tap / drag path / pan / pinch), menus, main loop ----
let drag = null;
let tab = 'arr', aliveAlert = 0;

// ----- status helpers -----
function statusKey(p) {
  if (p.st === 'accident') return ['s_accident', 'sr'];
  if (p.em) return ['s_emergency', 'sr'];
  if (p.dir === 'arr') {
    if (p.air) return p.st === 'final' ? ['s_landing', 'sg'] : p.circ ? ['s_holding', 'so'] : ['s_approach', 'sc'];
    return p.st === 'rollout' ? ['s_landed', 'sg'] : p.st === 'taxi' ? ['s_taxiing', 'sy'] : ['s_waiting', 'so'];
  }
  if (p.air) return ['s_departed', 'sg'];
  if (p.st === 'gate') return isReady(p) ? ['s_ready', 'sg'] : ['s_boarding', 'sw'];
  return p.st === 'roll' ? ['s_takeoff', 'sg'] : p.st === 'taxi' ? ['s_taxiing', 'sy'] : p.st === 'lineup' ? ['s_lineup', 'sy'] : ['s_waiting', 'so'];
}
function etaMin(p) { // game-minutes from now
  if (p.dir === 'arr') {
    if (p.air) { if (p.st === 'final') return dist(p, rwEnd(p.rw, p.end)) / 92 * 3 / 60; return p.circ ? 6 : dist(p, p.fix || { x: 800, y: 300 }) / 105 * 3 / 60 + 4; }
    return p.st === 'taxi' ? 2 : 0;
  }
  return p.st === 'gate' ? Math.max(0, p.tm) * 3 / 60 : p.st === 'taxi' ? 3 : 1;
}
const hhmm = m => { const t = Math.floor(G.gm + m); return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const kn = p => p.air || p.st === 'accident' ? altFt(p).toLocaleString() + ' ' + T('ft') : T('ground');

function updateBoard() {
  const list = G.planes.filter(p => p.dir === tab).sort((a, b) => etaMin(a) - etaMin(b));
  $('rows').innerHTML = list.map(p => { const [k, c] = statusKey(p), A = AIRLINES[p.al];
    return `<div class="row5 ${p.id === G.sel ? 'sel' : ''}" data-id="${p.id}"><span class="fl"><i class="mb" style="background:${A.tail}">${p.al}</i>${p.cs}</span><span>${cityName(p.city)}</span><span>${p.ty}</span><span class="${c}">${T(k)}</span><span>${p.st === 'accident' ? '' : hhmm(etaMin(p))}</span></div>`; }).join('') || '<div class="row5"><span>—</span></div>';
}
function updateTop() {
  const h = Math.floor(G.gm / 60) % 24, m = Math.floor(G.gm % 60), cfg = cfgOf();
  $('hClock').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  const d = new Date(2025, 3, 22 + Math.floor(G.gm / 1440));
  $('hDate').textContent = d.toLocaleDateString(S.lang === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const night = h < 6 || h >= 19, ic = G.wx === 'clear' ? (night ? 'i-moon' : 'i-sun') : { rain: 'i-rain', fog: 'i-fog', storm: 'i-storm' }[G.wx];
  $('uWx').setAttribute('href', '#' + ic);
  const temp = Math.round(cfg.temp + 5 * Math.sin((h + m / 60 - 9) / 24 * 2 * Math.PI) - { clear: 0, rain: 3, fog: 2, storm: 4 }[G.wx]);
  $('hTemp').textContent = temp + '°C';
  $('hArr').textContent = G.planes.filter(p => p.dir === 'arr').length; $('hDep').textContent = G.planes.filter(p => p.dir === 'dep').length;
  const s = Math.round(G.sat); $('hSat').textContent = s + '%'; $('hSat').style.color = s > 60 ? '#35e57a' : s > 30 ? '#ffd84a' : '#ff5252';
  $('hMoney').textContent = Math.round(G.money).toLocaleString('en-US');
  const per = G.inc.reduce((a, i) => a + i.a, 0) / (Math.min(60, Math.max(G.t, 10)) / 20);
  $('hRate').textContent = '+' + Math.round(per).toLocaleString('en-US') + '/h';
}
function updateAlert() {
  const box = $('alertBox'); let title = null, msg = '', t = G.gm;
  if (G.acc) { title = '🔥 ' + T('accident'); msg = G.acc.msg + (G.acc.site ? ' Emergency services are on site.' : ''); }
  else if (G.warn && G.warnMsg) { title = '⚠ ' + T('collision'); msg = G.warnMsg; aliveAlert = 3; G.lastWarn = { msg, t: G.gm }; }
  else if (aliveAlert > 0 && G.lastWarn) { title = '⚠ ' + T('collision'); msg = G.lastWarn.msg; t = G.lastWarn.t; }
  else { const em = G.planes.find(p => p.em && p.air); if (em) { title = '🚨 ' + T('mayday'); msg = `${full(em)} ${em.cs}: ${{ engine: 'engine failure', fire: 'engine fire', medical: 'medical emergency', fuel: 'minimum fuel' }[em.em.k]} — ${Math.ceil(em.em.t)}s. Clear to land!`; } }
  box.hidden = !title; if (!title) return;
  box.classList.toggle('flash', !G.acc);
  $('aTitle').textContent = title; $('aMsg').textContent = msg;
  const tm = Math.floor(t); $('aTime').textContent = String(Math.floor(tm / 60) % 24).padStart(2, '0') + ':' + String(tm % 60).padStart(2, '0');
}
function updateCard() {
  const p = sel(), c = $('card'); c.hidden = !p; if (!p) return;
  const A = AIRLINES[p.al], st = statusKey(p), tb = $('cBadge');
  tb.textContent = p.al; tb.style.background = A.tail; tb.style.borderColor = A.acc;
  $('cFlight').textContent = p.cs; $('cAirline').textContent = A.full; $('cType').textContent = p.ty;
  const row = (a, b, cl) => `<div><dt>${a}</dt><dd class="${cl || ''}">${b}</dd></div>`;
  $('cInfo').innerHTML = row(p.dir === 'arr' ? T('from') : T('to'), cityName(p.city)) + row(T('status'), T(st[0]), st[1]) + row(T('alt'), kn(p)) + row(T('speed'), speedKt(p) + ' ' + T('kt'));
  const g = $('cPic').getContext('2d'), W2 = 110, H2 = 84; g.clearRect(0, 0, W2, H2);
  const spr = getSprite(p.ty, p.al), shd = getSprite(p.ty, p.al, true), sc = Math.min(1, 70 / spr.side * 1.9);
  const sz = spr.side * sc;
  g.save(); g.translate(W2 / 2, H2 / 2); g.rotate(-Math.PI / 2 + 0.35); g.globalAlpha = 0.5; g.drawImage(shd.c, -sz / 2 + 4, -sz / 2 + 6, sz, sz); g.globalAlpha = 1; g.drawImage(spr.c, -sz / 2, -sz / 2, sz, sz); g.restore();
  const b = k2 => document.querySelector(`#card [data-c=${k2}]`);
  b('land').disabled = !(p.air && p.dir === 'arr' && p.st === 'inbound');
  b('hold').disabled = !(p.air ? p.st !== 'climb' : ['taxi', 'idle', 'lineup'].includes(p.st) && !p.hold);
  b('go').disabled = !(!p.air && p.hold && p.st !== 'accident');
  b('gate').disabled = !(!p.air && !p.em && p.dir === 'arr' && ['idle', 'taxi'].includes(p.st));
  b('takeoff').disabled = !(!p.air && !p.em && p.dir === 'dep' && (isReady(p) || ['idle', 'taxi'].includes(p.st)));
}
function updateUI() { updateTop(); updateAlert(); updateCard(); }

// ----- input -----
const ptrs = new Map(); let pinch = null;
function pickPlane(px, py) {
  let best = null, bd = 42; G.planes.forEach(p => { if (p.st === 'accident') return; const s = toScreen(p.x, p.y), d = Math.hypot(s.x - px, s.y - py) - (p.air ? 6 : 0); if (d < bd) { bd = d; best = p; } });
  return best;
}
cv.addEventListener('pointerdown', e => {
  Sfx.init(); if (paused || !G) return; $('hud').classList.remove('fresh');
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); cv.setPointerCapture(e.pointerId);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.tz }; drag = null; return; }
  const best = G.over ? null : pickPlane(e.clientX, e.clientY), w = toWorld(e.clientX, e.clientY);
  drag = { id: best ? best.id : null, pts: [w], moved: false, start: { x: e.clientX, y: e.clientY }, last: { x: e.clientX, y: e.clientY } };
});
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; cam.tz = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 0.8, 3.5); return; }
  if (!drag) return;
  const moved = Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y);
  if (!drag.moved && moved > 12) { drag.moved = true; if (drag.id) { G.sel = drag.id; Sfx.click(); } }
  if (!drag.moved) return;
  const w = toWorld(e.clientX, e.clientY);
  if (drag.id) { const l = drag.pts[drag.pts.length - 1]; if (dist(w, l) > 10) drag.pts.push(w); }
  else { const w0 = toWorld(drag.last.x, drag.last.y); cam.tx = cam.x = clamp(cam.x + w0.x - w.x, 0, W); cam.ty = cam.y = clamp(cam.y + w0.y - w.y, 0, H); buildCamM(); drag.last = { x: e.clientX, y: e.clientY }; }
});
function endPtr(e) {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  if (!drag) return; const d = drag; drag = null; if (!G || e.type === 'pointercancel') return;
  if (d.moved) { if (d.id) { const p = byId(d.id); if (p) { G.sel = p.id; applyDrag(p, d.pts); } } return; }
  const w = toWorld(e.clientX, e.clientY), p = sel();
  if (d.id) { G.sel = d.id; Sfx.click(); return; }
  if (p && !G.over) {
    const R = AP.rw.find(R => w.x > R.x0 - 20 && w.x < R.x1 + 20 && Math.abs(w.y - R.y) < 45);
    if (R) { if (p.air) cmdLand(p, R.i); else cmdTakeoff(p, R.i); return; }
    const g = AP.gates.find(g => g.open && Math.abs(w.x - g.x) < 42 && w.y > 600 && w.y < 780);
    if (g && !p.air) { if (p.dir === 'arr') cmdGate(p, g.i); return; }
  }
  if (!G.over) G.sel = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => { e.preventDefault(); cam.tz = clamp(cam.tz * (e.deltaY < 0 ? 1.12 : 0.89), 0.8, 3.5); }, { passive: false });
mini.addEventListener('pointerdown', e => {
  if (!G || paused) return; const r = mini.getBoundingClientRect(), w = { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  let b = null, bd = 90; G.planes.forEach(p => { const d = dist(p, w); if (d < bd) { bd = d; b = p; } });
  if (b) { G.sel = b.id; cam.tx = b.x; cam.ty = b.y; } else { cam.tx = clamp(w.x, 0, W); cam.ty = clamp(w.y, 0, H); if (cam.tz < 1.4) cam.tz = 1.6; }
  e.stopPropagation();
});
$('mCenter').onclick = () => { const p = sel() || G.planes.find(q => q.air) || G.planes[0]; if (p) { G.sel = p.id; cam.tx = p.x; cam.ty = p.y; cam.tz = Math.max(cam.tz, 1.8); } };
$('mFit').onclick = () => { cam.tx = W / 2; cam.ty = H / 2; cam.tz = 1; };
$('mZoom').onclick = () => { cam.tz = cam.tz >= 3 ? 1 : cam.tz * 1.4; };
$('mRot').onclick = () => { cam.trot += Math.PI / 2; if (cam.trot > Math.PI * 1.9) { cam.trot -= Math.PI * 2; cam.rot -= Math.PI * 2; } };
$('mLayers').onclick = () => { $('layersPop').hidden = !$('layersPop').hidden; };
function buildLayers() {
  $('layersPop').innerHTML = ['labels', 'shadows', 'routes', 'weather', 'lights'].map(k => `<label><input type="checkbox" data-l="${k}" ${layers[k] ? 'checked' : ''}>${T('lyr_' + k)}</label>`).join('');
  $('layersPop').querySelectorAll('input').forEach(i => i.onchange = () => { layers[i.dataset.l] = i.checked; });
}
document.querySelectorAll('#card .cc button').forEach(b => b.addEventListener('click', () => {
  Sfx.click(); const p = sel(); if (!p) return;
  ({ land: cmdLand, hold: cmdHold, go: cmdGo, gate: q => cmdGate(q), takeoff: q => cmdTakeoff(q) })[b.dataset.c](p);
}));
$('rows').addEventListener('click', e => { const r = e.target.closest('.row5'); if (r && r.dataset.id) { G.sel = +r.dataset.id; Sfx.click(); const p = sel(); if (p) { cam.tx = p.x; cam.ty = p.y; } } });
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); if (G) updateBoard(); });

// ----- menus -----
function applyLang() {
  document.documentElement.lang = S.lang; document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i]').forEach(e => e.textContent = T(e.dataset.i));
  $('bSnd').textContent = T('sound') + ': ' + (S.snd ? T('on') : T('off'));
  buildMenu(); buildLayers(); if (G && started) { updateTop(); updateBoard(); }
}
function buildMenu() {
  $('apBtns').innerHTML = ''; $('dfBtns').innerHTML = ''; $('lgBtns').innerHTML = '';
  Object.keys(AIRPORTS).forEach(k => {
    const a = AIRPORTS[k], ok = store.meta.life >= a.unlock, b = document.createElement('button');
    b.innerHTML = `${k}<small>${ok ? (S.lang === 'ar' ? AP_NAMES_AR[k] : a.city) : T('locked').replace('%s', a.unlock.toLocaleString())}</small>`;
    b.disabled = !ok; b.className = S.ap === k ? 'on' : ''; b.onclick = () => { S.ap = k; buildMenu(); }; $('apBtns').appendChild(b);
  });
  ['easy', 'normal', 'hard'].forEach(k => { const b = document.createElement('button'); b.textContent = T(k); b.className = S.diff === k ? 'on' : ''; b.onclick = () => { S.diff = k; buildMenu(); saveAll(); }; $('dfBtns').appendChild(b); });
  [['en', 'English'], ['ar', 'العربية']].forEach(([k, n]) => { const b = document.createElement('button'); b.textContent = n; b.className = S.lang === k ? 'on' : ''; b.onclick = () => { S.lang = k; applyLang(); saveAll(); }; $('lgBtns').appendChild(b); });
  const running = G && started && !G.over;
  $('bCont').hidden = !(running || (store.run && !G)); $('bCont').textContent = running ? T('resume') : T('cont');
  $('bShop').hidden = !running;
}
function setPauseIcon() { $('uPause').setAttribute('href', paused ? '#i-play' : '#i-pause'); $('pauseTag').hidden = !(paused && $('mMenu').hidden && $('mShop').hidden && started); }
function openMenu() { paused = true; buildMenu(); $('mMenu').hidden = false; setPauseIcon(); }
function startRun(fresh) {
  if (fresh) newGame(S.ap); else if (!G) { G = store.run; G.acc = null; rebuild(); }
  started = true; paused = false; $('mMenu').hidden = true; $('mOver').hidden = true; $('hud').hidden = false; $('hud').classList.add('fresh');
  cam.tx = cam.x = W / 2; cam.ty = cam.y = H / 2; cam.tz = cam.z = 1; cam.trot = cam.rot = 0; alertT = 0; warnWas = false;
  fx.fire.length = fx.smoke.length = 0;
  setTimeout(() => $('hud').classList.remove('fresh'), 14000);
  $('radio').innerHTML = ''; radio(`${cfgOf().tower}: Welcome to ${cfgOf().name}. ${windTxt()}, runways in use.`, 'tw'); Sfx.init(); saveAll(); applyLang(); setPauseIcon();
}
function showGameOver() {
  $('overTxt').textContent = G.acc ? G.acc.msg : ''; $('overStats').textContent = `${T('flights')}: ${G.stats.arr + G.stats.dep} · ${T('earned')}: $${G.earned.toLocaleString()}`; $('mOver').hidden = false;
}
$('bNew').onclick = () => startRun(true);
$('bCont').onclick = () => { if (G && started && !G.over) { paused = false; $('mMenu').hidden = true; setPauseIcon(); } else startRun(false); };
$('bRetry').onclick = () => { $('mOver').hidden = true; startRun(true); };
$('bGear').onclick = openMenu;
$('bPause').onclick = () => { if (!G || G.over) return; paused = !paused; setPauseIcon(); };
$('bSnd').onclick = () => { Sfx.init(); S.snd = Sfx.toggle(); applyLang(); saveAll(); };
$('bShop').onclick = () => { if (!G) return; $('mMenu').hidden = true; buildShop(); $('mShop').hidden = false; };
$('bShopX').onclick = () => { $('mShop').hidden = true; $('mMenu').hidden = false; };
const UPS = [['rw', 'up_rw', 8000], ['term', 'up_term', 6000], ['gs', 'up_gs', 5000]];
function buildShop() {
  $('shopList').innerHTML = `<p>💰 $${Math.round(G.money).toLocaleString()}</p>`;
  UPS.forEach(([k, n, base]) => {
    const lv = G.up[k], cost = Math.round(base * Math.pow(2.3, lv)), maxed = lv >= 3, d = document.createElement('div'); d.className = 'up';
    d.innerHTML = `<div><b>${T(n)}</b> · ${T('lvl')} ${lv}/3<small>${T(n + '_d')}</small></div>`;
    const b = document.createElement('button'); b.textContent = maxed ? T('max') : `${T('buy')} $${cost.toLocaleString()}`; b.disabled = maxed || G.money < cost;
    b.onclick = () => { G.money -= cost; G.up[k]++; if (k === 'term') rebuild(); Sfx.cash(); buildShop(); saveAll(); }; d.appendChild(b); $('shopList').appendChild(d);
  });
}

// ----- main loop -----
let last = performance.now(), sv = 0, ut = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (G && started && !paused) {
    update(dt); renderUpdate(dt); aliveAlert = Math.max(0, aliveAlert - dt);
    if (!G.over) { sv += dt; if (sv > 5) { sv = 0; saveAll(); } Sfx.ambient(G.planes.filter(p => p.air).length, fx.lv.rain); }
    ut += dt; if (ut > 0.35) { ut = 0; updateBoard(); }
    updateUI();
  }
  updateCam(dt);
  try { render(); } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveAll(); });
addEventListener('beforeunload', saveAll);
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerdown', () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }, { once: true });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (!S.snd) Sfx.toggle();
buildCamM(); applyLang(); requestAnimationFrame(frame);
