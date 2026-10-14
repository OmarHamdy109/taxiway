// Aircraft models (low-poly, airline liveries), ground vehicles (instanced), light points, selection/route overlays.
import * as THREE from 'three';
import { VS, MOBILE, clamp, rng, mergeParts } from './config.js';
import { TEX } from './world.js';

const SPEC = { // per aircraft type: sweep°, root chord (× len), engine radius, engine span fractions
  A320: { sw: 26, rc: 0.16, er: 1.15, ep: [0.34], winglet: 1 }, B737: { sw: 26, rc: 0.16, er: 1.1, ep: [0.33], winglet: 1 }, A321: { sw: 26, rc: 0.15, er: 1.15, ep: [0.34], winglet: 1 },
  A330: { sw: 30, rc: 0.15, er: 1.6, ep: [0.33], winglet: 2 }, B787: { sw: 32, rc: 0.14, er: 1.65, ep: [0.31], winglet: 0 }, B777: { sw: 32, rc: 0.15, er: 2.15, ep: [0.3], winglet: 0 },
  A380: { sw: 33, rc: 0.14, er: 1.75, ep: [0.26, 0.56], winglet: 2 }
};
const ULIGHT = { a: new THREE.Vector3(), b: new THREE.Vector3() };
const hullCache = {}, decalGeoCache = {}, decalTexCache = {}, decalMatCache = {};
const hullMat = new THREE.MeshLambertMaterial({ vertexColors: true }), wreckMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1d });
const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const beamGeo = new THREE.ConeGeometry(7, 90, 10, 1, true).translate(0, -45, 0).rotateZ(Math.PI / 2 + 0.05); // apex at origin, opens toward +x

function wingGeom(span, rc, tc, sweepDeg, thick) { // left wing (toward -z), root at z=0
  const so = span * Math.tan(sweepDeg * Math.PI / 180), sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(-so, span); sh.lineTo(-so - tc, span); sh.lineTo(-rc, 0); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }); g.translate(0, 0, -thick / 2); g.rotateX(-Math.PI / 2); g.deleteAttribute('uv'); return g;
}
function mirrorZ(g) { // mirror across z=0 keeping outward-facing winding
  g.scale(1, 1, -1);
  for (const k in g.attributes) { const a = g.attributes[k], n = a.itemSize, arr = a.array; for (let t = 0; t < arr.length; t += 3 * n) for (let j = 0; j < n; j++) { const i1 = t + n + j, i2 = t + 2 * n + j, tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp; } }
  return g;
}
function hullFor(ty, al, T, A) {
  const key = ty + '|' + al; if (hullCache[key]) return hullCache[key];
  const L = T.len, r = T.fw * 0.8, sp = SPEC[ty], hc = r * 0.4 + sp.er * 1.6 + 1.2, P = [], M = new THREE.Matrix4();
  const tail = new THREE.Color(A.tail).getHex(), body = new THREE.Color(A.body).getHex(), eng = 0xb9bec4;
  const rad = s => { const t = clamp(s / 0.2, 0, 1), n = clamp((s - 0.9) / 0.1, 0, 1); return r * Math.max(0.02, (0.1 + 0.9 * Math.sin(t * Math.PI / 2)) * Math.sqrt(Math.max(0, 1 - n * n))); };
  const pts = []; for (let i = 0; i <= 30; i++) { const s = i / 30; pts.push(new THREE.Vector2(rad(s), (s - 0.5) * L)); }
  const fus = new THREE.LatheGeometry(pts, 14); fus.rotateZ(-Math.PI / 2); P.push({ g: fus, m: M.clone().makeTranslation(0, hc, 0), c: body });
  if (ty === 'A380') P.push({ g: new THREE.SphereGeometry(1, 12, 8).scale(L * 0.33, r * 0.6, r * 0.82), m: M.clone().makeTranslation(L * 0.12, hc + r * 0.55, 0), c: body });
  // wings
  const half = T.span / 2 - r * 0.6, rc = L * sp.rc, wx = L * 0.06, wy = hc - r * 0.4;
  const wg = wingGeom(half, rc, rc * 0.28, sp.sw, 0.4);
  P.push({ g: wg, m: M.clone().makeTranslation(wx, wy, -r * 0.6), c: body });
  P.push({ g: mirrorZ(wg.clone()), m: M.clone().makeTranslation(wx, wy, r * 0.6), c: body });
  const tipx = wx - half * Math.tan(sp.sw * Math.PI / 180) - rc * 0.28;
  if (sp.winglet) for (const s of [-1, 1]) {
    const wl = new THREE.BoxGeometry(rc * 0.3, sp.winglet === 2 ? 3.4 : 2.2, 0.2); wl.rotateX(s * 0.15);
    P.push({ g: wl, m: M.clone().makeTranslation(tipx + rc * 0.18, wy + (sp.winglet === 2 ? 1.7 : 1.1), s * (half + r * 0.6 - 0.1)), c: sp.winglet === 2 ? body : tail });
  }
  // engines
  const eyx = el => wx - el * Math.tan(sp.sw * Math.PI / 180);
  for (const f of sp.ep) for (const s of [-1, 1]) {
    const el = half * f, ex = eyx(el) + 0.5 - sp.er * 0.5, ez = s * (el + r * 0.6), ey = wy - sp.er * 0.85;
    const cyl = new THREE.CylinderGeometry(sp.er, sp.er * 0.82, sp.er * 3.6, 10).rotateZ(Math.PI / 2);
    P.push({ g: cyl, m: M.clone().makeTranslation(ex, ey, ez), c: eng });
    P.push({ g: new THREE.CircleGeometry(sp.er * 0.8, 10).rotateY(Math.PI / 2), m: M.clone().makeTranslation(ex + sp.er * 1.81, ey, ez), c: 0x15181c });
  }
  // fin + tailplane
  const fh = L * 0.15, fr = L * 0.15, fs = new THREE.Shape(), fx0 = -L * 0.5 + L * 0.2;
  fs.moveTo(fx0, 0); fs.lineTo(fx0 - fr * 1.15 + L * 0.05, 0); fs.lineTo(fx0 - fr * 1.15 - L * 0.01, fh); fs.lineTo(fx0 - L * 0.04, fh); fs.closePath();
  const fin = new THREE.ExtrudeGeometry(fs, { depth: 0.4, bevelEnabled: false }); fin.translate(0, 0, -0.2); fin.deleteAttribute('uv');
  P.push({ g: fin, m: M.clone().makeTranslation(0, hc + r * 0.55, 0), c: tail });
  const hs = wingGeom(L * 0.17, L * 0.1, L * 0.035, 30, 0.3);
  P.push({ g: hs, m: M.clone().makeTranslation(-L * 0.36, hc + r * 0.25, -r * 0.3), c: body }); P.push({ g: mirrorZ(hs.clone()), m: M.clone().makeTranslation(-L * 0.36, hc + r * 0.25, r * 0.3), c: body });
  // cockpit glass + landing gear
  P.push({ g: new THREE.SphereGeometry(1, 8, 5).scale(r * 0.75, r * 0.32, r * 0.78), m: M.clone().makeTranslation(L * 0.455, hc + r * 0.28, 0), c: 0x1a2733 });
  const geo = mergeParts(THREE, P);
  const gear = []; // gear: separate small merged geometry toggled by altitude
  for (const [x, z] of [[L * 0.38, 0], [wx - 2, -r * 1.3], [wx - 2, r * 1.3], [wx - 4.5, -r * 1.3], [wx - 4.5, r * 1.3]]) { gear.push({ g: new THREE.BoxGeometry(0.7, 1.1, 0.7), m: M.clone().makeTranslation(x, 0.9, z), c: 0x30343a }); gear.push({ g: new THREE.CylinderGeometry(0.62, 0.62, 0.7, 8).rotateX(Math.PI / 2), m: M.clone().makeTranslation(x, 0.62, z), c: 0x111111 }); }
  const out = { geo, gear: mergeParts(THREE, gear), L, r, hc, wy, half, wx, tipx, finTop: hc + r * 0.55 + fh };
  hullCache[key] = out; return out;
}
function decalTex(al, A) {
  if (decalTexCache[al]) return decalTexCache[al];
  const c = document.createElement('canvas'); c.width = 2048; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = A.acc; g.fillRect(0, 100, 2048, 7); g.fillStyle = A.tail; g.fillRect(0, 107, 2048, 12);
  g.fillStyle = 'rgba(25,32,44,.9)'; for (let x = 130; x < 1850; x += 26) { g.beginPath(); g.roundRect(x, 70, 14, 20, 5); g.fill(); }
  g.fillStyle = A.tail; g.font = '800 60px "Segoe UI",Arial,sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(A.full.toUpperCase(), 1010, 38);
  g.fillStyle = A.acc === '#ffffff' ? '#8a8f98' : A.acc; g.fillRect(960, 20, 8, 38);
  g.fillStyle = A.tail; g.beginPath(); g.arc(64, 192, 58, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = A.acc; g.stroke(); g.fillStyle = '#fff'; g.font = '800 46px Arial'; g.textAlign = 'center'; g.fillText(al, 64, 194);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return (decalTexCache[al] = t);
}
function decalGeo(ty, h) {
  if (decalGeoCache[ty]) return decalGeoCache[ty];
  const { L, r, hc, finTop } = h, parts = [], mk = (w, hh, uv, mat) => { const g = new THREE.PlaneGeometry(w, hh); const a = g.attributes.uv; for (let i = 0; i < 4; i++) a.setXY(i, i % 2 ? uv[2] : uv[0], i < 2 ? uv[3] : uv[1]); g.applyMatrix4(mat); return g; };
  const sw = L * 0.66, sh = sw / 16, M = new THREE.Matrix4(), side = (z, ry) => M.clone().compose(new THREE.Vector3(L * 0.06, hc + r * 0.1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  parts.push({ g: mk(sw, sh, [0, 0.5, 1, 1], side(r * 0.997, 0)) }, { g: mk(sw, sh, [0, 0.5, 1, 1], side(-r * 0.997, Math.PI)) });
  const bs = L * 0.085, by = hc + r * 0.55 + L * 0.075, bx = -L * 0.5 + L * 0.2 - L * 0.1;
  parts.push({ g: mk(bs, bs, [0, 0, 0.0625, 0.5], new THREE.Matrix4().compose(new THREE.Vector3(bx, by, 0.22), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1))) },
    { g: mk(bs, bs, [0, 0, 0.0625, 0.5], new THREE.Matrix4().compose(new THREE.Vector3(bx, by, -0.22), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(1, 1, 1))) });
  const pos = [], uv = [];
  for (const p of parts) { const g = p.g.toNonIndexed(); pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((v, i) => i % 3 === 2 ? 0 : 0), 3)); geo.computeVertexNormals(); return (decalGeoCache[ty] = geo);
}
function decalMat(al, A) { return decalMatCache[al] || (decalMatCache[al] = new THREE.MeshLambertMaterial({ map: decalTex(al, A), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide })); }

export function makePlaneModel(ty, al, TYPES, AIRLINES, shadow = true) {
  const T = TYPES[ty], A = AIRLINES[al], h = hullFor(ty, al, T, A), g = new THREE.Group();
  const hull = new THREE.Mesh(h.geo, hullMat); hull.castShadow = shadow; g.add(hull);
  const dec = new THREE.Mesh(decalGeo(ty, h), decalMat(al, A)); g.add(dec);
  const gear = new THREE.Mesh(h.gear, hullMat); g.add(gear);
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.set(h.L * 0.42, h.hc - h.r * 0.5, 0); beam.visible = false; g.add(beam);
  g.userData = { hull, dec, gear, beam, h, ty, al, rotOrder: g.rotation.order = 'YZX' };
  return g;
}

// ---------- vehicles ----------
function vehGeo(kind) {
  const B = (w, h, d, x, y, z, c) => ({ g: new THREE.BoxGeometry(w, h, d), m: new THREE.Matrix4().makeTranslation(x, y, z), c });
  const wheels = (L, W2) => [-L * 0.32, L * 0.32].flatMap(x => [-1, 1].map(s => ({ g: new THREE.CylinderGeometry(0.55, 0.55, 0.5, 8).rotateX(Math.PI / 2), m: new THREE.Matrix4().makeTranslation(x, 0.55, s * W2 / 2), c: 0x111111 })));
  const k = {
    van: [B(6, 2.0, 3, 0, 1.6, 0, 0xf2c500), B(2.2, 1.2, 2.8, 1.8, 3.0, 0, 0xf2c500), B(0.1, 0.9, 2.5, 2.9, 3.1, 0, 0x203040), ...wheels(6, 3)],
    bus: [B(11, 3.0, 3.2, 0, 2.2, 0, 0xe8e8e8), B(11.02, 1.1, 3.22, 0, 2.5, 0, 0x2a3f5a), B(11.02, 0.4, 3.22, 0, 1.0, 0, 0x2a6fb5), ...wheels(11, 3.2)],
    fuel: [{ g: new THREE.CylinderGeometry(1.4, 1.4, 6.5, 12).rotateZ(Math.PI / 2), m: new THREE.Matrix4().makeTranslation(-1, 2.6, 0), c: 0xe9ecef }, B(2.2, 2.2, 2.8, 3, 1.8, 0, 0xd33333), ...wheels(8, 3)],
    bag: [B(3, 1.4, 2, 0, 1.2, 0, 0x555a60), B(4, 0.3, 2.2, -3.6, 0.9, 0, 0x9aa0a6), B(1.2, 1.2, 1.6, -3.6, 1.7, 0, 0xcc9922), ...wheels(5, 2)],
    fire: [B(9.5, 2.6, 3.4, 0, 2.2, 0, 0xc91f1f), B(9.52, 0.35, 3.42, 0, 2.4, 0, 0xeeeeee), B(3, 1.9, 3.3, 3.1, 4.0, 0, 0xe6e6e6), B(5, 0.3, 0.7, -1.8, 3.8, 0, 0xcccccc), ...wheels(9.5, 3.4)],
    amb: [B(7, 2.8, 3, 0, 2.1, 0, 0xf4f4f4), B(2.2, 1.6, 2.9, 2.6, 2.9, 0, 0xf4f4f4), B(2.4, 0.4, 3.1, -1.5, 2.4, 0, 0xdd2222), B(0.5, 1.6, 3.1, -1.5, 2.4, 0, 0xdd2222), ...wheels(7, 3)]
  };
  return mergeParts(THREE, k[kind]);
}

export function createFleet(scene, renderer, camera) {
  const F = { views: new Map(), deco: new THREE.Group(), vehs: {}, beacons: [] };
  scene.add(F.deco);
  const cap = { van: 14, bus: 8, fuel: 8, bag: 16, fire: 8, amb: 8 }, mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  for (const k in cap) { const m = new THREE.InstancedMesh(vehGeo(k), new THREE.MeshLambertMaterial({ vertexColors: true }), cap[k]); m.castShadow = true; m.frustumCulled = false; m.count = 0; scene.add(m); F.vehs[k] = m; }
  // ambient traffic
  const rr = rng(21); F.amb = Array.from({ length: 9 }, (_, i) => i < 4 ? { k: i % 2 ? 'bus' : 'van', x: 400 + rr() * 800, z: 760 + (i % 2) * 5, d: i % 2 ? 1 : -1, v: 12 + rr() * 8, x0: 330, x1: 1260 } : { k: 'van', x: 200 + rr() * 1200, z: 877 + (i % 2) * 6, d: i % 2 ? 1 : -1, v: 18 + rr() * 14, x0: 130, x1: 1590 });
  // dynamic light points (nav lights, beacons, landing lights, emergency strobes)
  const MAXL = 700, lp = new Float32Array(MAXL * 3), lc = new Float32Array(MAXL * 3), ls = new Float32Array(MAXL), lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(lp, 3).setUsage(THREE.DynamicDrawUsage)); lgeo.setAttribute('color', new THREE.BufferAttribute(lc, 3).setUsage(THREE.DynamicDrawUsage)); lgeo.setAttribute('size', new THREE.BufferAttribute(ls, 1).setUsage(THREE.DynamicDrawUsage));
  const lmat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { map: { value: TEX.dot }, scale: { value: 500 }, fogD: { value: 0.0002 } },
    vertexShader: 'attribute float size; attribute vec3 color; uniform float scale, fogD; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; float d = -mv.z; gl_PointSize = clamp(size * scale / d, 1.0, 70.0); vC = color * exp(-pow(fogD * d, 2.0)); }',
    fragmentShader: 'uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a); }' });
  F.lights = new THREE.Points(lgeo, lmat); F.lights.frustumCulled = false; F.lights.renderOrder = 6; scene.add(F.lights);
  // selection overlays
  const ringMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  F.selRing = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2), ringMat(0x00e5ff)); F.selRing.renderOrder = 20; F.selRing.visible = false; scene.add(F.selRing);
  F.selPole = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6, depthTest: false })); F.selPole.renderOrder = 20; F.selPole.visible = false; scene.add(F.selPole);
  F.warnRings = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), ringMat(0xff2020)); m.renderOrder = 19; m.visible = false; scene.add(m); F.warnRings.push(m); }
  const routeGeo = new THREE.BufferGeometry(); routeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(80 * 3), 3));
  F.route = new THREE.Line(routeGeo, new THREE.LineBasicMaterial({ color: 0x00e5ff, depthTest: false, transparent: true, opacity: 0.85 })); F.route.frustumCulled = false; F.route.renderOrder = 18; F.route.visible = false; scene.add(F.route);

  F.rebuildDeco = function (AP, cfg, TYPES, AIRLINES) {
    while (F.deco.children.length) F.deco.remove(F.deco.children[0]);
    AP.gates.forEach(g => { if (g.open) return; const ty = cfg.fleet[(g.i * 3) % cfg.fleet.length], al = cfg.air[(g.i * 5) % cfg.air.length], m = makePlaneModel(ty, al, TYPES, AIRLINES); m.position.set(g.x, 0, g.y); m.rotation.y = -Math.PI / 2; m.userData.gear.visible = true; F.deco.add(m); });
  };
  const flashT = { v: 0 };
  let nL = 0; const lcol = new THREE.Color();
  const addL = (x, y, z, r, g, b, s) => { if (nL >= MAXL) return; lp[nL * 3] = x; lp[nL * 3 + 1] = y; lp[nL * 3 + 2] = z; lc[nL * 3] = r; lc[nL * 3 + 1] = g; lc[nL * 3 + 2] = b; ls[nL] = s; nL++; };
  const loc = new THREE.Vector3();
  const place = (m, x, y, z, ry) => { mtx.compose(pv.set(x, y, z), q.setFromAxisAngle(up, ry), one); m.setMatrixAt(m.count++, mtx); };

  F.update = function (G, TYPES, AIRLINES, dt, now, env, lv, selId, sceneH) {
    const dark = env.dark; lmat.uniforms.scale.value = sceneH / 2 / Math.tan(camera.fov * Math.PI / 360); lmat.uniforms.fogD.value = scene.fog ? scene.fog.density : 0;
    nL = 0; for (const k in F.vehs) F.vehs[k].count = 0;
    const planes = G ? G.planes : [], seen = new Set(), vis = 0.35 + 0.65 * dark;
    for (const p of planes) {
      seen.add(p.id); let v = F.views.get(p.id);
      if (v && (v.ty !== p.ty || v.al !== p.al)) { scene.remove(v.m); F.views.delete(p.id); v = null; }
      if (!v) { const m = makePlaneModel(p.ty, p.al, TYPES, AIRLINES); scene.add(m); v = { m, ty: p.ty, al: p.al, pitch: 0, bank: 0, ph: p.h, py: 0, wreck: false }; F.views.set(p.id, v); }
      const m = v.m, U = m.userData, y = p.air ? p.alt * VS : 0, wreck = p.st === 'accident';
      const vs = dt > 0 ? (y - v.py) / dt : 0; v.py = y;
      let dh = dt > 0 ? Math.atan2(Math.sin(p.h - v.ph), Math.cos(p.h - v.ph)) / dt : 0; v.ph = p.h;
      let tp = 0, tb = 0;
      if (p.air) { tp = Math.atan2(vs, Math.max(60, p.spd)) * 3 + (p.st === 'climb' ? 0.1 : 0) + (p.st === 'final' && p.alt < 60 ? 0.07 : 0); tb = clamp(dh * 0.5, -0.45, 0.45); }
      else if (p.st === 'roll') tp = clamp((p.spd - 105) / 35, 0, 1) * 0.12;
      if (wreck) { tp = 0.06; tb = 0.22; }
      const k = Math.min(1, dt * 3); v.pitch += (tp - v.pitch) * k; v.bank += (tb - v.bank) * k;
      m.position.set(p.x, y + (wreck ? -0.4 : 0), p.y); m.rotation.set(v.bank, -p.h, v.pitch, 'YZX');
      U.gear.visible = !p.air || p.alt < 220; U.dec.visible = !wreck;
      if (wreck !== v.wreck) { U.hull.material = wreck ? wreckMat : hullMat; U.gear.material = wreck ? wreckMat : hullMat; v.wreck = wreck; }
      // lights (world positions from model matrix)
      m.updateMatrix(); const h = U.h, L = h.L, hy = h.hc;
      if (!wreck) {
        const mover = p.air || p.spd > 3, strobe = (Math.floor(now * 1.6 + p.id * 0.37) % 6) === 0 ? 1 : 0, beac = (Math.floor(now * 1.3 + p.id) % 2) ? 1 : 0.1;
        const nav = (lx, ly, lz, r, g, b, s, f = 1) => { loc.set(lx, ly, lz).applyMatrix4(m.matrix); addL(loc.x, loc.y, loc.z, r * f * vis, g * f * vis, b * f * vis, s); };
        nav(h.tipx, h.wy + 1.2, -(h.half + h.r * 0.6), 1, 0.05, 0.05, 2.2); nav(h.tipx, h.wy + 1.2, h.half + h.r * 0.6, 0.05, 1, 0.1, 2.2);
        nav(-L * 0.5, hy + h.r * 0.5, 0, 1, 1, 1, 1.8, 0.8);
        nav(h.tipx - 0.5, h.wy + 1.2, -(h.half + h.r * 0.6), 1, 1, 1, 3.5, strobe); nav(h.tipx - 0.5, h.wy + 1.2, h.half + h.r * 0.6, 1, 1, 1, 3.5, strobe);
        nav(L * 0.05, hy - h.r * 0.95, 0, 1, 0.1, 0.1, 3.2, beac); nav(L * 0.05, hy + h.r, 0, 1, 0.1, 0.1, 3.2, 1 - beac);
        const ll = (p.air && p.alt < 4200 && p.st !== 'climb') || p.st === 'roll' || (p.air && p.st === 'climb' && p.alt < 600) || (!p.air && p.spd > 3) ? 1 : 0;
        const lightsOn = ll && (p.air ? p.alt < 4200 : true);
        if (lightsOn) { nav(L * 0.38, hy - h.r * 0.9, -2.2, 1, 0.97, 0.85, 6, 0.55 + 0.45 * dark); nav(L * 0.38, hy - h.r * 0.9, 2.2, 1, 0.97, 0.85, 6, 0.55 + 0.45 * dark); }
        U.beam.visible = !!lightsOn && dark > 0.2; if (U.beam.visible) beamMat.opacity = 0.16 * dark * (1 - 0.5 * lv.fog);
        U.beam.rotation.z = p.air ? -0.12 : -0.04;
        U.hull.castShadow = true;
      } else U.beam.visible = false;
      // turnaround vehicles around parked planes
      if (p.st === 'gate' && p.tm > 0) { const x = p.x, z = p.y; place(F.vehs.fuel, x + 28, 0, z - 6, Math.PI / 2 + 0.2); place(F.vehs.bag, x - 24, 0, z + 8, 0); place(F.vehs.bag, x - 24, 0, z - 8, 0.1); place(F.vehs.van, x + 22, 0, z + 20, Math.PI); }
    }
    for (const [id, v] of F.views) if (!seen.has(id)) { scene.remove(v.m); F.views.delete(id); }
    // moving ambient vehicles
    for (const a of F.amb) { a.x += a.d * a.v * dt; if (a.x < a.x0) a.x = a.x1; if (a.x > a.x1) a.x = a.x0; place(F.vehs[a.k], a.x, 0, a.z, a.d > 0 ? 0 : Math.PI); }
    // emergency vehicles
    if (G) for (const v of G.veh) { const k = v.k === 'fire' ? 'fire' : 'amb', m = F.vehs[k]; if (m.count >= cap[k]) continue; place(m, v.x, 0, v.y, -v.h);
      const on = Math.floor(now * 7) % 2; addL(v.x, 4.8, v.y, on ? 1 : 0.1, 0.1, on ? 0.1 : 1, 7); addL(v.x - Math.cos(v.h) * 2, 4.8, v.y - Math.sin(v.h) * 2, on ? 0.1 : 1, 0.1, on ? 1 : 0.1, 7); }
    for (const k in F.vehs) { F.vehs[k].instanceMatrix.needsUpdate = true; }
    lgeo.setDrawRange(0, nL); lgeo.attributes.position.needsUpdate = lgeo.attributes.color.needsUpdate = lgeo.attributes.size.needsUpdate = true;
    // selection ring / pole / route / warning rings
    const sp = selId && G ? G.planes.find(p => p.id === selId) : null, sv = sp && F.views.get(sp.id);
    F.selRing.visible = F.selPole.visible = !!sv;
    if (sv) { const y = sp.air ? sp.alt * VS : 0, s = TYPES[sp.ty].len * 0.75 + 6 + Math.sin(now * 6) * 1.2; F.selRing.position.set(sp.x, y + 0.6, sp.y); F.selRing.scale.set(s, 1, s);
      F.selPole.position.set(sp.x, 0.5, sp.y); F.selPole.scale.y = Math.max(0.01, y); F.selPole.visible = sp.air; }
    let rn = 0; const rp = F.route.geometry.attributes.position.array;
    if (sp && sp.st !== 'accident') {
      const y = sp.air ? sp.alt * VS : 0.7; rp.set([sp.x, y, sp.y], 0); rn = 1;
      const add = (x, z, yy) => { if (rn < 79) { rp.set([x, yy == null ? y : yy, z], rn * 3); rn++; } };
      if (!sp.air) sp.path.forEach(w => add(w.x, w.y)); else { sp.wp.forEach(w => add(w.x, w.y));
        if (sp.st === 'final') { const d = sp.end === 0 ? 1 : -1, R = AP_RW(G, sp), Tp = { x: sp.end ? R.x1 : R.x0, y: R.y }; if (sp.stage <= 0) add(Tp.x - d * 320, Tp.y, 320 * 0.05 * 1.3 + 4); add(Tp.x, Tp.y, 0.7); } }
    }
    F.route.visible = rn > 1; F.route.geometry.setDrawRange(0, rn); F.route.geometry.attributes.position.needsUpdate = true;
    let wi = 0; if (G && !G.over) planes.forEach(p => { if (p.al_ && wi < 6) { const r = F.warnRings[wi++], y = p.air ? p.alt * VS : 0; r.visible = Math.floor(now * 5) % 2 === 0; r.position.set(p.x, y + 0.7, p.y); const s = TYPES[p.ty].len * 0.65 + 5; r.scale.set(s, 1, s); } });
    for (; wi < 6; wi++) F.warnRings[wi].visible = false;
  };
  const AP_RW = (G, p) => { try { return AP.rw[p.rw]; } catch (e) { return { x0: 0, x1: 0, y: 0 }; } };
  return F;
}
