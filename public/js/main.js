// Renderer, first-person camera (look / zoom / binoculars / monitor focus), picking, plane labels, weather state, main loop.
import * as THREE from 'three';
import { TOWER, EYE, DESK_YAW, MOBILE, clamp, lerp, rnd } from './config.js';
import { createWorld } from './world.js';
import { createScreens } from './screens.js';
import { buildCab } from './cab.js';
import { createFleet } from './planes.js';

const cv = document.getElementById('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !MOBILE, powerPreference: 'high-performance' });
let pr = Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2);
renderer.setPixelRatio(pr); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.3, 9000);
const world = createWorld(scene, renderer), screens = createScreens(), cab = buildCab(scene, screens.list), fleet = createFleet(scene, renderer, camera);


// ---------- camera state ----------
const look = { yaw: DESK_YAW, pitch: -0.2 }, zoom = { fov: 68, target: 68 }, focus = { i: -1, k: 0 }; let binoc = false;
const eye = new THREE.Vector3(TOWER.x, EYE, TOWER.z), qView = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
const baseFov = () => binoc ? 11 : 68, fovRange = () => binoc ? [6, 16] : [30, 74];
function setFocus(i) { focus.i = i; Hooks.onFocus && Hooks.onFocus(i); }
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
Hooks.binoc = () => { binoc = !binoc; zoom.target = baseFov(); if (focus.i >= 0) setFocus(-1); document.getElementById('binoc').hidden = !binoc; document.getElementById('bBinoc').classList.toggle('on', binoc); };
Hooks.back = () => setFocus(-1);
Hooks.onStart = () => { look.yaw = DESK_YAW; look.pitch = -0.2; binoc = false; zoom.fov = zoom.target = 68; setFocus(-1); document.getElementById('binoc').hidden = true; document.getElementById('bBinoc').classList.remove('on'); fx.lv = { rain: 0, fog: 0, storm: 0 }; labelEls.forEach(e => e.el.remove()); labelEls.clear(); };

window.TA3D = { scene, camera, renderer, world, screens, cab, fleet, look, zoom, focus, setFocus, Hooks };
// ---------- input ----------
const ptr = new Map(); let pinch = null, tapInfo = null;
cv.addEventListener('pointerdown', e => {
  Sfx.init(); cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), f: zoom.target }; tapInfo = null; return; }
  tapInfo = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
});
cv.addEventListener('pointermove', e => {
  const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (pinch && ptr.size >= 2) { const [a, b] = [...ptr.values()], r = fovRange(); zoom.target = clamp(pinch.f * pinch.d / Math.max(30, Math.hypot(a.x - b.x, a.y - b.y)), r[0], r[1]); return; }
  if (!tapInfo) return; if (!tapInfo.moved && Math.hypot(e.clientX - tapInfo.x, e.clientY - tapInfo.y) > 7) tapInfo.moved = true; if (!tapInfo.moved) return;
  if (focus.i >= 0) return;
  const s = zoom.fov / 68 * 0.0052; look.yaw += dx * s; look.pitch = clamp(look.pitch + dy * s, -1.35, 1.35);
});
function endPtr(e) {
  ptr.delete(e.pointerId); if (ptr.size < 2) pinch = null;
  if (e.type === 'pointerup' && tapInfo && !tapInfo.moved && performance.now() - tapInfo.t < 700 && ptr.size === 0) onTap(e.clientX, e.clientY);
  if (ptr.size === 0) tapInfo = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => { e.preventDefault(); const r = fovRange(); zoom.target = clamp(zoom.target * (e.deltaY < 0 ? 0.92 : 1.09), r[0], r[1]); }, { passive: false });
addEventListener('keydown', e => { if (e.key === 'Escape') setFocus(-1); else if (e.key >= '1' && e.key <= '4') setFocus(+e.key - 1); else if (e.key === 'b' || e.key === 'B') Hooks.binoc(); });

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), v3 = new THREE.Vector3();
function onTap(x, y) {
  if (!started || paused) return;
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  cam_updateMatrices();
  const h = ray.intersectObjects(cab.screens, false)[0];
  if (h && (focus.k < 0.5 || h.object.userData.index !== focus.i || true)) {
    const i = h.object.userData.index;
    if (focus.i === i && focus.k > 0.9) { if (!screens.tap(i, h.uv.x, h.uv.y, performance.now() / 1000)) setFocus(-1); } else setFocus(i); return;
  }
  if (focus.i >= 0) { setFocus(-1); return; }
  if (!G) return;
  // plane pick in screen space (plane body or its floating label)
  let best = null, bd = 1e9;
  for (const [id, L] of labelEls) { if (!L.vis) continue; const d = Math.min(Math.hypot(L.sx - x, L.sy - y), Math.hypot(L.lx - x, L.ly - y) - 12); if (d < Math.max(34, L.r) && d < bd) { bd = d; best = id; } }
  if (best != null) { G.sel = best; Sfx.click(); return; }
  const p = sel();
  if (p && !G.over && ray.ray.direction.y < -0.0001) { // tap on the ground: runway / gate commands for the selected aircraft
    const t = -ray.ray.origin.y / ray.ray.direction.y; v3.copy(ray.ray.origin).addScaledVector(ray.ray.direction, t);
    const R = AP.rw.find(R => v3.x > R.x0 - 20 && v3.x < R.x1 + 20 && Math.abs(v3.z - R.y) < 45);
    if (R) { p.air ? cmdLand(p, R.i) : cmdTakeoff(p, R.i); Sfx.click(); return; }
    const g = AP.gates.find(g => g.open && Math.abs(v3.x - g.x) < 42 && v3.z > 600 && v3.z < 780);
    if (g && !p.air) { if (p.dir === 'arr') cmdGate(p, g.i); return; }
  }
  if (G && !G.over) G.sel = null;
}
function cam_updateMatrices() { camera.updateMatrixWorld(true); }

// ---------- labels (DOM, follow planes, scale with distance) ----------
const labelsEl = document.getElementById('labels'), labelEls = new Map(), floats = [];
const stateLabel = p => p.st === 'accident' ? 'Accident' : p.air ? (p.st === 'climb' ? 'Takeoff' : p.st === 'final' ? 'Landing' : p.circ ? 'Holding' : 'Approach') : p.st === 'gate' ? (isReady(p) ? 'Ready' : 'Boarding') : p.st === 'roll' ? 'Takeoff' : p.st === 'rollout' ? 'Landed' : p.st === 'taxi' ? 'Taxiing' : p.st === 'lineup' ? 'Lined up' : 'Waiting';
const anchor = new THREE.Vector3();
function updateLabels(dt) {
  const seen = new Set(), show = G && started && focus.k < 0.4;
  if (G) for (const p of G.planes) {
    seen.add(p.id); let L = labelEls.get(p.id);
    const A = AIRLINES[p.al];
    if (!L) { const el = document.createElement('div'); el.className = 'lbl'; el.innerHTML = '<div class="l1"><i class="bg"></i><b></b><em></em></div><div class="l2"></div>'; labelsEl.appendChild(el); L = { el, b: el.querySelector('b'), bg: el.querySelector('.bg'), em: el.querySelector('em'), l2: el.querySelector('.l2'), key: '', sx: 0, sy: 0, lx: 0, ly: 0, vis: false, r: 30 }; labelEls.set(p.id, L); }
    const v = fleet.views.get(p.id), y = (p.air ? p.alt * 0.012 : 0) + (v ? v.m.userData.h.finTop : 8) + 4;
    anchor.set(p.x, y, p.y); const d = anchor.distanceTo(camera.position); v3.copy(anchor).project(camera);
    const vis = show && v3.z < 1 && v3.z > -1 && d < 2400 && Math.abs(v3.x) < 1.15 && Math.abs(v3.y) < 1.15; L.vis = vis;
    const lx = (v3.x * 0.5 + 0.5) * innerWidth, ly = (-v3.y * 0.5 + 0.5) * innerHeight; L.lx = lx; L.ly = ly;
    v3.set(p.x, p.air ? p.alt * 0.012 : 0, p.y).project(camera); L.sx = (v3.x * 0.5 + 0.5) * innerWidth; L.sy = (-v3.y * 0.5 + 0.5) * innerHeight; L.r = TYPES[p.ty].len * 0.5 * innerHeight / (2 * d * Math.tan(camera.fov * Math.PI / 360));
    L.el.style.display = vis ? '' : 'none'; if (!vis) continue;
    const sc = clamp(560 / d, 0.55, 1.3) * clamp(68 / camera.fov, 0.8, 1.4) ** 0.5;
    L.el.style.transform = `translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px) translate(-50%,-100%) scale(${sc.toFixed(3)})`; L.el.style.zIndex = Math.round(3000 - d);
    const alt = p.air ? altFt(p).toLocaleString() + ' ft' : 'GND', key = p.cs + p.ty + stateLabel(p) + alt + (p.id === G.sel) + (p.al_ ? 1 : 0) + (p.em ? 1 : 0);
    if (key !== L.key) { L.key = key; L.b.textContent = p.cs; L.bg.textContent = p.al; L.bg.style.background = A.tail; L.bg.style.borderColor = A.acc; L.em.textContent = p.ty; L.l2.textContent = stateLabel(p) + ' · ' + alt;
      L.el.classList.toggle('sel', p.id === G.sel); L.el.classList.toggle('warn', !!(p.al_ || p.em || p.st === 'accident')); }
  }
  for (const [id, L] of labelEls) if (!seen.has(id)) { L.el.remove(); labelEls.delete(id); }
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; if (f.t > 1.8) { f.el.remove(); floats.splice(i, 1); continue; }
    v3.copy(f.pos); v3.y += 8 + f.t * 8; v3.project(camera); f.el.style.display = v3.z < 1 && show ? '' : 'none'; f.el.style.transform = `translate(${((v3.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px,${((-v3.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%,-100%)`; f.el.style.opacity = 1 - f.t / 1.8; }
}
window.floatTxt = (p, amt) => { const el = document.createElement('div'); el.className = 'flt'; el.textContent = '+$' + amt.toLocaleString(); labelsEl.appendChild(el); floats.push({ el, t: 0, pos: new THREE.Vector3(p.x, p.air ? p.alt * 0.012 : 0, p.y) }); };
window.mapDirty = () => {};

// ---------- weather / environment state ----------
const fx = { lv: { rain: 0, fog: 0, storm: 0 }, flash: 0, thunderT: 0 };
function weatherStep(dt) {
  const lv = fx.lv; ['rain', 'fog', 'storm'].forEach(k => { const t = G && ((G.wx === k) || (k === 'rain' && G.wx === 'storm')) ? 1 : 0; lv[k] += clamp(t - lv[k], -dt * 0.3, dt * 0.3); });
  if (G && G.wx === 'storm' && !G.over && !paused) { fx.thunderT -= dt; if (fx.thunderT <= 0) { fx.thunderT = rnd(5, 12); fx.flash = 1; setTimeout(Sfx.thunder, 500); } }
  fx.flash = Math.max(0, fx.flash - dt * 2.5);
}

// ---------- main loop ----------
let last = performance.now(), frameN = 0, ft = 0, fcount = 0, lowT = 0;
const camPos = new THREE.Vector3(), qF = new THREE.Quaternion(), pose = { pos: eye.clone(), quat: new THREE.Quaternion() };
function ensureWorld() {
  const code = G ? G.ap : S.ap, cfg = AIRPORTS[code], nOpen = G ? AP.gates.filter(g => g.open).length : cfg.gates;
  if (world.key !== code + ':' + nOpen) { const ap = G ? AP : buildAirport(cfg, cfg.gates); world.build(ap, cfg, code, GATE_X, FS, isRw); fleet.rebuildDeco(ap, cfg, TYPES, AIRLINES); renderer.shadowMap.needsUpdate = true; }
}
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000); last = t; const now = t / 1000;
  try {
    if (G && started && !paused) gameStep(dt, fx.lv.rain);
    if (G) updateUI();
    weatherStep(dt); ensureWorld();
    // camera
    zoom.fov += (zoom.target - zoom.fov) * Math.min(1, dt * 8); focus.k += ((focus.i >= 0 ? 1 : 0) - focus.k) * Math.min(1, dt * 6.5); if (Math.abs(focus.k - (focus.i >= 0 ? 1 : 0)) < 0.002) focus.k = focus.i >= 0 ? 1 : 0;
    const e = focus.k * focus.k * (3 - 2 * focus.k), fi = focus.i >= 0 ? focus.i : (focus.k > 0 ? focus.last : -1); if (focus.i >= 0) focus.last = focus.i;
    eul.set(look.pitch, look.yaw, 0); qView.setFromEuler(eul);
    if (e > 0 && fi >= 0) { const P = cab.focusPose(fi, camera.aspect, 48); camera.position.lerpVectors(eye, P.pos, e); camera.quaternion.copy(qView).slerp(P.quat, e); camera.fov = lerp(zoom.fov, 48, e); }
    else { camera.position.copy(eye); camera.quaternion.copy(qView); camera.fov = zoom.fov; }
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    // world + interior
    const hour = G ? (G.gm / 60) % 24 : 12.6;
    world.update(now, dt, hour, fx.lv, fx.flash, camera.position);
    const dark = world.env.dark, warn = G && G.warn && !G.over, acc = G && G.acc;
    const flashR = (warn && Math.floor(now * 3) % 2) || (acc && Math.floor(now * 2) % 2);
    cab.lampMat.color.setRGB(...(flashR ? [1, 0.12, 0.1] : [0.55 + 0.45 * dark, 0.52 + 0.43 * dark, 0.46 + 0.4 * dark]).map(v => v * (0.6 + 0.4 * dark)));
    cab.lamp.intensity = dark * 3 + (flashR ? 0 : 0.0); cab.lamp.color.set(flashR ? 0xff3020 : 0xfff0d8); cab.lamp.intensity = flashR ? 2.2 : dark * 3.2; cab.alarm.intensity = flashR ? 4 : 0;
    cab.glass.material.opacity = 0.09 + dark * 0.07; cab.refl.opacity = 0.05 + dark * 0.1 + (flashR ? 0.05 : 0);
    cab.rain.forEach(r => { r.mesh.visible = fx.lv.rain > 0.03; r.m.opacity = clamp(fx.lv.rain * 0.9, 0, 1) * (1 - 0.3 * dark); r.t.offset.y += r.sp * dt * (0.4 + fx.lv.storm); r.t.offset.x = Math.sin(now * 0.05 + r.sp) * 0.01; });
    fleet.update(G, TYPES, AIRLINES, dt, now, world.env, fx.lv, G ? G.sel : null, renderer.domElement.height);
    world.accident(G && G.acc, G && !paused ? dt : 0, now);
    screens.update(now, focus.k > 0.5 ? focus.i : -1);
    updateLabels(dt);
    renderer.shadowMap.needsUpdate = (frameN++ & 1) === 0;
    renderer.render(scene, camera);
  } catch (err) { console.error(err); }
  // adaptive resolution (keep 30+ fps on weak devices)
  ft += dt; fcount++; if (fcount >= 60) { const avg = ft / fcount; ft = 0; fcount = 0; if (avg > 0.036 && pr > 0.7) { pr = Math.max(0.7, pr - 0.2); renderer.setPixelRatio(pr); resize(); lowT = 0; } else if (avg < 0.019 && pr < Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2) - 0.05 && ++lowT > 5) { pr = Math.min(pr + 0.2, devicePixelRatio || 1); renderer.setPixelRatio(pr); resize(); lowT = 0; } }
}
requestAnimationFrame(frame);
