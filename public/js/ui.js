'use strict';
// ---- Taxiway Alpha 3D: HUD, menus, shop, game step. (Input / camera / rendering live in the ES modules: main.js, world.js, ...) ----
const Hooks = {};
let aliveAlert = 0;

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
// ----- menus -----
function applyLang() {
  document.documentElement.lang = S.lang; document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i]').forEach(e => e.textContent = T(e.dataset.i));
  $('bSnd').textContent = T('sound') + ': ' + (S.snd ? T('on') : T('off'));
  buildMenu(); if (G && started) updateTop();
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
  alertT = 0; warnWas = false; if (Hooks.onStart) Hooks.onStart();
  setTimeout(() => $('hud').classList.remove('fresh'), 14000);
  radioLog.length = 0; radio(`${cfgOf().tower}: Welcome to ${cfgOf().name}. ${windTxt()}, runways in use.`, 'tw'); Sfx.init(); saveAll(); applyLang(); setPauseIcon();
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
    const lv = G.up[k], maxLv = k === 'term' ? Math.min(3, Math.ceil((GATE_X.length - cfgOf().gates) / 2)) : 3, cost = Math.round(base * Math.pow(2.3, lv)), maxed = lv >= maxLv, d = document.createElement('div'); d.className = 'up';
    d.innerHTML = `<div><b>${T(n)}</b> · ${T('lvl')} ${lv}/${maxLv}<small>${T(n + '_d')}</small></div>`;
    const b = document.createElement('button'); b.textContent = maxed ? T('max') : `${T('buy')} $${cost.toLocaleString()}`; b.disabled = maxed || G.money < cost;
    b.onclick = () => { G.money -= cost; G.up[k]++; if (k === 'term') rebuild(); Sfx.cash(); buildShop(); saveAll(); }; d.appendChild(b); $('shopList').appendChild(d);
  });
}


function gameStep(dt, rain) {
  update(dt); aliveAlert = Math.max(0, aliveAlert - dt);
  if (!G.over) { gameStep.sv = (gameStep.sv || 0) + dt; if (gameStep.sv > 5) { gameStep.sv = 0; saveAll(); } Sfx.ambient(G.planes.filter(p => p.air).length, rain); }
}
function updateUI() { updateTop(); updateAlert(); }
$('bBinoc').onclick = () => Hooks.binoc && Hooks.binoc();
$('bBack').onclick = () => Hooks.back && Hooks.back();
Hooks.onFocus = i => { $('bBack').hidden = i < 0; };
document.addEventListener('visibilitychange', () => { if (document.hidden) saveAll(); });
addEventListener('beforeunload', saveAll);
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerdown', () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }, { once: true });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (!S.snd) Sfx.toggle();
applyLang();
