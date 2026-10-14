// The outside world: sky + day/night, lights, ground/sea, airport buildings, runway lights, trees, weather, accident fire.
import * as THREE from 'three';
import { TOWER, FL, CAB_R, MOBILE, rnd, clamp, lerp, smooth, rng, coastX, mergeParts } from './config.js';
import { drawGround, MAP } from './groundmap.js';

const col = h => new THREE.Color(h);
function canvasTex(w, h, fn, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = opts.aniso || 1; return t;
}
function glowTex(stops) {
  return canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, c]) => r.addColorStop(o, c)); g.fillStyle = r; g.fillRect(0, 0, w, h); });
}
export const TEX = { dot: null, fire: null, smoke: null };

export function createWorld(scene, renderer) {
  const W = { group: new THREE.Group(), air: null, key: '', t: 0 };
  scene.add(W.group);
  TEX.dot = glowTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.85)'], [0.6, 'rgba(255,255,255,.18)'], [1, 'rgba(255,255,255,0)']]);
  TEX.fire = glowTex([[0, 'rgba(255,240,170,1)'], [0.35, 'rgba(255,140,30,.8)'], [1, 'rgba(255,40,0,0)']]);
  TEX.smoke = glowTex([[0, 'rgba(60,60,64,.9)'], [0.6, 'rgba(50,50,54,.45)'], [1, 'rgba(40,40,44,0)']]);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6f6a55, 1.8); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2); sun.castShadow = true;
  const SM = MOBILE ? 1024 : 2048; sun.shadow.mapSize.set(SM, SM);
  const sc = sun.shadow.camera; sc.left = -720; sc.right = 720; sc.top = 560; sc.bottom = -560; sc.near = 100; sc.far = 3200; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  sun.target.position.set(800, 0, 480); scene.add(sun, sun.target);
  const fireLight = new THREE.PointLight(0xff6a20, 0, 160, 1.4); scene.add(fireLight);
  W.sun = sun; W.hemi = hemi;

  // ---------- sky ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { zen: { value: col(0x2f78d0) }, hor: { value: col(0xaed2f0) }, fogC: { value: col(0x999999) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: col(0xfff0c0) }, night: { value: 0 }, fogMix: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 zen, hor, fogC, sunDir, glow; uniform float night, fogMix;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(hor, zen, pow(h, 0.5));
        float s = max(dot(vDir, sunDir), 0.0);
        c += glow * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.35 + pow(s, 5.0) * 0.18) * (1.0 - night * 0.9);
        vec3 q = floor(vDir * 160.0); float st = step(0.9965, hash(q));
        c += vec3(st) * night * smoothstep(0.03, 0.3, vDir.y) * (1.0 - fogMix);
        c = mix(c, fogC, fogMix * (1.0 - smoothstep(0.0, 0.6, h) * 0.35));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5200, 32, 16), skyMat); sky.renderOrder = -100; sky.frustumCulled = false; scene.add(sky);
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,250,220,1)'], [0.32, 'rgba(255,230,160,.35)'], [1, 'rgba(255,200,120,0)']]), fog: false, depthWrite: false, transparent: true }));
  sunSpr.scale.set(900, 900, 1); sunSpr.renderOrder = -99; scene.add(sunSpr);
  const moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 20, 64, 64, 64); r.addColorStop(0, 'rgba(235,240,255,.35)'); r.addColorStop(1, 'rgba(235,240,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); g.fillStyle = '#eef2ff'; g.beginPath(); g.arc(64, 64, 17, 0, 7); g.fill(); g.fillStyle = 'rgba(150,160,190,.5)'; [[58, 58, 5], [70, 66, 4], [62, 72, 3]].forEach(([x, y, r2]) => { g.beginPath(); g.arc(x, y, r2, 0, 7); g.fill(); }); }), fog: false, depthWrite: false, transparent: true }));
  moonSpr.scale.set(420, 420, 1); moonSpr.renderOrder = -99; scene.add(moonSpr);
  // clouds
  const cloudMat = new THREE.SpriteMaterial({ map: canvasTex(256, 128, (g) => { for (let i = 0; i < 26; i++) { const x = 40 + Math.random() * 176, y = 50 + Math.random() * 30, r = 18 + Math.random() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } }), depthWrite: false, transparent: true, fog: false });
  const clouds = []; const cr = rng(5);
  for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(cloudMat); const a = cr() * 6.283, d = 600 + cr() * 3200; s.userData = { a, d, y: 520 + cr() * 420, sp: 0.0006 + cr() * 0.0008 }; s.scale.set(1100 + cr() * 900, 420 + cr() * 250, 1); s.renderOrder = -98; scene.add(s); clouds.push(s); }

  // ---------- ground ----------
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4a7a3a, map: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,150,100' : '200,220,170'},.35)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, { repeat: true }) }));
  outer.material.map.repeat.set(160, 160); outer.position.set(800, -0.4, 450); outer.receiveShadow = true; outer.renderOrder = -10; W.group.add(outer);
  // sea (animated normal map -> sun glints), polygon west of the coast
  const nTex = (() => { const N = 128, hgt = new Float32Array(N * N); for (let k = 0; k < 40; k++) { const cx = Math.random() * N, cy = Math.random() * N, r = 4 + Math.random() * 12, a = Math.random() < 0.5 ? 1 : -1; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { const d = Math.hypot(x - cx + ox, y - cy + oy); if (d < r) hgt[y * N + x] += a * Math.cos(d / r * Math.PI / 2) ** 2; } } }
    const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x + N - 1) % N], dy = hgt[((y + 1) % N) * N + x] - hgt[((y + N - 1) % N) * N + x], i = (y * N + x) * 4; im.data[i] = 128 + clamp(dx * 60, -127, 127); im.data[i + 1] = 128 + clamp(dy * 60, -127, 127); im.data[i + 2] = 255; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 70); return t; })();
  const seaShape = new THREE.Shape(); seaShape.moveTo(-9000, -3500); for (let y = -3500; y <= 4500; y += 25) seaShape.lineTo(coastX(y) - 2, y); seaShape.lineTo(-9000, 4500); seaShape.closePath();
  const seaGeo = new THREE.ShapeGeometry(seaShape).rotateX(Math.PI / 2); // shape y -> world z
  const seaMat = new THREE.MeshPhongMaterial({ color: 0x1a78a4, specular: 0xbfd8ff, shininess: 70, normalMap: nTex, normalScale: new THREE.Vector2(0.35, 0.35), transparent: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const sea = new THREE.Mesh(seaGeo, seaMat); sea.position.y = 0.6; sea.renderOrder = -4; W.group.add(sea);
  // hills, skyline
  const hr = rng(11), hillMat = new THREE.MeshLambertMaterial({ color: 0x3d6a45 });
  const hills = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 6), hillMat, 30);
  const mtx = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), sv = new THREE.Vector3();
  for (let i = 0; i < 30; i++) { const a = hr() * 6.283, d = 4200 + hr() * 1200, r = 500 + hr() * 700; mtx.compose(v3.set(800 + Math.cos(a) * d, -r * 0.62 + (hr() * 30), 450 + Math.sin(a) * d), q0, sv.set(r * 1.6, r * 0.7, r * 1.6)); hills.setMatrixAt(i, mtx); hills.setColorAt(i, new THREE.Color().setHSL(0.3 + hr() * 0.05, 0.3, 0.2 + hr() * 0.1)); }
  W.group.add(hills);
  const cityTex = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) if (Math.random() < 0.45) { g.fillStyle = Math.random() < 0.5 ? '#ffe2a0' : '#bcd8ff'; g.fillRect(x, y, 4, 5); } });
  const cityMat = new THREE.MeshLambertMaterial({ color: 0x8c97a8, emissive: 0xffffff, emissiveMap: cityTex, emissiveIntensity: 0 });
  const nB = 70, city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cityMat, nB), cr2 = rng(77);
  for (let i = 0; i < nB; i++) { const a = -0.2 + cr2() * 1.7, d = 3500 + cr2() * 1000, w = 50 + cr2() * 90, h = 60 + Math.pow(cr2(), 2.2) * 300; mtx.compose(v3.set(800 + Math.cos(a) * d + 400, h / 2, 450 + Math.sin(a) * d), q0, sv.set(w, h, w)); city.setMatrixAt(i, mtx); }
  W.group.add(city);

  // ---------- trees (static) ----------
  {
    const R = rng(3), parts = [];
    parts.push({ g: new THREE.CylinderGeometry(0.5, 0.7, 3, 6).translate(0, 1.5, 0), c: 0x5a3b22 }, { g: new THREE.ConeGeometry(3.4, 6.5, 7).translate(0, 5.5, 0), c: 0x2f6a2d }, { g: new THREE.ConeGeometry(2.5, 5, 7).translate(0, 8.4, 0), c: 0x3c7d37 });
    const geo = mergeParts(THREE, parts), P = [];
    for (let i = 0; i < 90; i++) P.push([240 + R() * 1300, 8 + R() * 82]);
    for (let i = 0; i < 50; i++) P.push([1545 + R() * 55, 20 + R() * 820]);
    for (let i = 0; i < 40; i++) { const y = R() * 900; P.push([coastX(y) + 30 + R() * 50, y]); }
    for (let i = 0; i < 140; i++) P.push([1650 + R() * 1200, -500 + R() * 1900]);
    for (let i = 0; i < 70; i++) P.push([-100 + R() * 2000, -500 - R() * 400]);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), P.length);
    P.forEach(([x, z], i) => { const s = 0.7 + R() * 0.8; mtx.compose(v3.set(x, 0, z), q0.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6), sv.set(s, s * (0.9 + R() * 0.5), s)); im.setMatrixAt(i, mtx); im.setColorAt(i, new THREE.Color().setHSL(0.28 + R() * 0.07, 0.2 + R() * 0.2, 0.55 + R() * 0.35)); });
    im.castShadow = true; W.group.add(im);
  }

  // ---------- weather: falling rain ----------
  const rainN = MOBILE ? 1400 : 2600, rp = new Float32Array(rainN * 6), rs = new Float32Array(rainN * 6), re = new Float32Array(rainN * 2);
  for (let i = 0; i < rainN; i++) { const a = Math.random(), b = Math.random(), c = Math.random(); for (let k = 0; k < 2; k++) { rs.set([a, b, c], (i * 2 + k) * 3); re[i * 2 + k] = k; } }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('seed', new THREE.BufferAttribute(rs, 3)); rg.setAttribute('endk', new THREE.BufferAttribute(re, 1));
  const rainMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, level: { value: 0 }, tint: { value: col(0xc8d8f0) } },
    vertexShader: `attribute vec3 seed; attribute float endk; uniform float time; uniform vec3 cam; varying float vA;
      void main(){ float fall = mod(seed.y * 90.0 - time * (55.0 + seed.z * 25.0), 90.0);
        vec3 p = cam + vec3((seed.x - 0.5) * 220.0, fall - 55.0, (seed.z - 0.5) * 220.0);
        p += endk * vec3(0.5, 2.8, 0.15); vA = 1.0 - smoothstep(60.0, 110.0, length(p.xz - cam.xz));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: 'uniform float level; uniform vec3 tint; varying float vA; void main(){ gl_FragColor = vec4(tint, 0.35 * level * vA); }' });
  const rain = new THREE.LineSegments(rg, rainMat); rain.frustumCulled = false; rain.renderOrder = 5; scene.add(rain);

  // ---------- fire + smoke pools ----------
  const fireSpr = [], smokeSpr = [];
  const fMat = new THREE.SpriteMaterial({ map: TEX.fire, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const sMat = new THREE.SpriteMaterial({ map: TEX.smoke, depthWrite: false, transparent: true });
  for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(fMat.clone()); s.visible = false; scene.add(s); fireSpr.push({ s, t: 9, life: 1, x: 0, y: 0, z: 0 }); }
  for (let i = 0; i < 22; i++) { const s = new THREE.Sprite(sMat.clone()); s.visible = false; scene.add(s); smokeSpr.push({ s, t: 9, life: 1, x: 0, y: 0, z: 0, vx: 0 }); }

  // ---------- airport (rebuilt when airport / gate count changes) ----------
  const lightMats = [];
  function pointsOf(arr, size, colHex, extra) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ size, map: TEX.dot, color: colHex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    m.userData = extra || {}; lightMats.push(m); const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 4; return p;
  }
  function disposeGroup(o) { o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) { [].concat(n.material).forEach(m => { ['map', 'emissiveMap'].forEach(k => m[k] && m[k].dispose()); m.dispose(); }); } }); }
  W.build = function (AP, cfg, apCode, GATE_X, FS, isRw) {
    if (W.air) { W.group.remove(W.air); disposeGroup(W.air); lightMats.length = 0; }
    const A = W.air = new THREE.Group(); W.group.add(A);
    const S = MOBILE ? 1.5 : 2, g = drawGround(AP, cfg, GATE_X, FS, isRw, apCode, S);
    const tex = new THREE.CanvasTexture(g.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w, MAP.h).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    gm.position.set(MAP.x + MAP.w / 2, 0, MAP.y + MAP.h / 2); gm.receiveShadow = true; gm.renderOrder = -6; A.add(gm);
    W.groundMat = gm.material;
    // wet sheen over runways + taxiways (rain)
    W.wet = new THREE.MeshBasicMaterial({ color: 0xa8c4e4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    AP.rw.forEach(R => { const m = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0 + 12, 56).rotateX(-Math.PI / 2), W.wet); m.position.set((R.x0 + R.x1) / 2, 0.25, R.y); m.renderOrder = -3; A.add(m); });
    // terminal
    const gx = GATE_X, tx0 = gx[0] - 55, tw = gx[9] - gx[0] + 110, TZ0 = 770, TZ1 = 868, TH = 15;
    const facade = (emis) => { const t = canvasTex(128, 128, (c, w, h) => { c.fillStyle = emis ? '#000' : '#5e7e9c'; c.fillRect(0, 0, w, h);
        for (let y = 8; y < 120; y += 56) { const gr = c.createLinearGradient(0, y, 0, y + 48); if (emis) { gr.addColorStop(0, '#ffe7b0'); gr.addColorStop(1, '#ffc880'); } else { gr.addColorStop(0, '#9fd2f0'); gr.addColorStop(1, '#3d6a90'); } c.fillStyle = gr; c.fillRect(2, y, 124, 48); }
        c.fillStyle = emis ? '#000' : '#cfd6dc'; c.fillRect(0, 0, 3, h); c.fillRect(0, 54, w, 4); }, { repeat: true, aniso: 4 }); t.repeat.set(tw / 14, 1); return t; };
    W.facadeMat = new THREE.MeshLambertMaterial({ map: facade(false), emissiveMap: facade(true), emissive: 0xffffff, emissiveIntensity: 0 });
    const side = new THREE.MeshLambertMaterial({ color: 0xb8c0ca });
    const term = new THREE.Mesh(new THREE.BoxGeometry(tw, TH, TZ1 - TZ0), [side, side, new THREE.MeshLambertMaterial({ color: 0x8892a0 }), side, side, W.facadeMat]);
    term.position.set(tx0 + tw / 2, TH / 2, (TZ0 + TZ1) / 2); term.castShadow = term.receiveShadow = true; A.add(term);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(tw + 16, 1.4, TZ1 - TZ0 + 24), new THREE.MeshLambertMaterial({ color: 0x9aa3ad })); roof.position.set(tx0 + tw / 2, TH + 0.7, (TZ0 + TZ1) / 2 - 12 + 12); roof.position.z = (TZ0 + TZ1) / 2 - 6; roof.castShadow = true; A.add(roof);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(380, 11), new THREE.MeshBasicMaterial({ map: canvasTex(2048, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#10243a'; c.fillRect(0, 0, w, h); c.fillStyle = '#e9f2fa'; c.font = '800 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(cfg.name.toUpperCase() + '  ·  ' + apCode, w / 2, h / 2 + 2); }), toneMapped: false }));
    sign.rotation.y = Math.PI; sign.position.set(tx0 + tw / 2, TH - 2.8, TZ0 - 0.2); A.add(sign);
    // static coloured buildings: tower shaft, jet bridges, hangars, fire station
    const P = [], box = (w, h, d, x, y, z, c) => P.push({ g: new THREE.BoxGeometry(w, h, d), m: new THREE.Matrix4().makeTranslation(x, y, z), c });
    P.push({ g: new THREE.CylinderGeometry(3.4, 4.6, FL - 2, 14, 1, true).translate(0, (FL - 2) / 2, 0), m: new THREE.Matrix4().makeTranslation(TOWER.x, 0, TOWER.z), c: 0xc2c9d0 });
    P.push({ g: new THREE.CylinderGeometry(CAB_R + 0.9, 3.6, 3, 12, 1, true).translate(0, FL - 3.2, 0), m: new THREE.Matrix4().makeTranslation(TOWER.x, 0, TOWER.z), c: 0x7e8893 });
    P.push({ g: new THREE.CylinderGeometry(6.3, CAB_R + 0.8, 1.6, 12).translate(0, FL + 3.3, 0), m: new THREE.Matrix4().makeTranslation(TOWER.x, 0, TOWER.z), c: 0xd8dde2 });
    P.push({ g: new THREE.CylinderGeometry(0.12, 0.2, 9, 5).translate(0, FL + 8, 0), m: new THREE.Matrix4().makeTranslation(TOWER.x, 0, TOWER.z), c: 0xaaaaaa });
    box(16, 7, 16, TOWER.x, 3.5, TOWER.z, 0xaab3bc);
    AP.gates.forEach(gt => { if (!gt.open) return; box(3.6, 3.2, 40, gt.x + 6, 4.6, 750, 0xc9d0d6); box(5, 4.2, 5, gt.x + 6, 3.4, 729, 0xaeb6bd); P.push({ g: new THREE.CylinderGeometry(0.5, 0.5, 4.5, 6).translate(0, 2.2, 0), m: new THREE.Matrix4().makeTranslation(gt.x + 6, 0, 733), c: 0x777f87 }); });
    for (const [hx, hy] of [[1400, 470], [1400, 540]]) { box(150, 6, 56, hx + 75, 3, hy + 28, 0x9ca7b2); P.push({ g: new THREE.CylinderGeometry(28, 28, 150, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.4, 1), m: new THREE.Matrix4().makeTranslation(hx + 75, 6, hy + 28), c: 0xb0bac4 }); box(100, 7, 0.8, hx + 75, 3.6, hy + 56.2, 0x55606c); }
    box(62, 8, 50, FS.x, 4, FS.y, 0xc8cdd2); box(64, 1.2, 52, FS.x, 8.6, FS.y, 0xa73232); for (let k = 0; k < 3; k++) box(14, 6, 0.8, FS.x - 18 + k * 18, 3.2, FS.y + 25.3, 0x6e7780);
    box(5, 22, 5, FS.x + 40, 11, FS.y - 20, 0xcfd6dc); box(7, 3, 7, FS.x + 40, 23, FS.y - 20, 0x2a3a4a);
    const bm = new THREE.Mesh(mergeParts(THREE, P), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); bm.castShadow = bm.receiveShadow = true; A.add(bm);
    // car park
    const cars = [], cr3 = rng(9); for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) if (cr3() < 0.7) cars.push([193 + c * 15 + 4.5, 776 + r * 22 + 7.5]);
    const cm = new THREE.InstancedMesh(mergeParts(THREE, [{ g: new THREE.BoxGeometry(4.2, 1.1, 8.6).translate(0, 0.8, 0), c: 0xffffff }, { g: new THREE.BoxGeometry(3.6, 1, 4.4).translate(0, 1.8, -0.3), c: 0x9fb4c4 }]), new THREE.MeshLambertMaterial({ vertexColors: true }), cars.length);
    const carC = [0xcc3333, 0x3366cc, 0xdddddd, 0x222222, 0xdd9922, 0x44aa44, 0x999999]; cars.forEach(([x, z], i) => { mtx.makeTranslation(x, 0, z); cm.setMatrixAt(i, mtx); cm.setColorAt(i, new THREE.Color(carC[Math.floor(cr3() * carC.length)])); }); cm.castShadow = true; A.add(cm);
    // lights
    const edge = [], thrG = [], thrR = [], app = [], blue = [], flood = [];
    AP.rw.forEach(Rw => {
      for (let x = Rw.x0 - 6; x <= Rw.x1 + 6; x += 34) for (const dy of [-30, 30]) edge.push(x, 1.1, Rw.y + dy);
      for (let k = -26; k <= 26; k += 6.5) { thrG.push(Rw.x0 - 7, 1.1, Rw.y + k); thrG.push(Rw.x1 + 7, 1.1, Rw.y + k); }
      for (const [tx, d] of [[Rw.x0, -1], [Rw.x1, 1]]) { for (let k = 0; k < 17; k++) { app.push(tx + d * (14 + k * 18), 1.2, Rw.y); if (k % 4 === 2) for (const o of [-9, -4.5, 4.5, 9]) app.push(tx + d * (14 + k * 18), 1.2, Rw.y + o); } }
      for (let x = Rw.x0 + 60; x < Rw.x1 - 60; x += 30) app.push(x, 1, Rw.y); // centreline lights
    });
    g.edges.forEach(([a, b]) => { const dl = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / dl, ny = (b.x - a.x) / dl; for (let t = 8; t < dl; t += 34) for (const s of [-1, 1]) blue.push(a.x + (b.x - a.x) * t / dl + nx * 15.5 * s, 0.9, a.y + (b.y - a.y) * t / dl + ny * 15.5 * s); });
    const polesG = []; for (let x = tx0 + 60; x < tx0 + tw; x += 150) { polesG.push({ g: new THREE.CylinderGeometry(0.25, 0.35, 15, 5).translate(0, 7.5, 0), m: new THREE.Matrix4().makeTranslation(x, 0, 752), c: 0x888f96 }); flood.push(x, 15.4, 752); }
    for (let x = 140; x < 1600; x += 90) { polesG.push({ g: new THREE.CylinderGeometry(0.15, 0.2, 7, 5).translate(0, 3.5, 0), m: new THREE.Matrix4().makeTranslation(x, 0, 869), c: 0x888f96 }); flood.push(x, 7.2, 869); }
    A.add(new THREE.Mesh(mergeParts(THREE, polesG), new THREE.MeshLambertMaterial({ vertexColors: true })));
    const mk = (arr, size, c, o) => { const p = pointsOf(arr, size, c, o); A.add(p); return p; };
    mk(edge, 2.4, 0xfff1d0, { base: 0.18 }); mk(thrG, 2.4, 0x35ff6a, { base: 0.2 }); mk(app, 2.6, 0xffffff, { base: 0.15 }); mk(blue, 2.0, 0x3a7dff, { base: 0.1 }); mk(flood, 14, 0xffe6b8, { base: 0.0, big: true });
    mk(blueRed(AP), 2.6, 0xff3030, { base: 0.2 });
    // terminal / tower beacons
    mk([TOWER.x, FL + 12.6, TOWER.z], 7, 0xff3030, { beacon: true });
    W.key = apCode + ':' + AP.gates.filter(x => x.open).length;
  };
  function blueRed(AP) { const a = []; AP.rw.forEach(R => { for (let k = -26; k <= 26; k += 6.5) { a.push(R.x0 - 8, 1.1, R.y + k); a.push(R.x1 + 8, 1.1, R.y + k); } }); return a; }

  // ---------- environment update ----------
  const dayC = { zen: col(0x2f78d0), hor: col(0xaed2f0) }, duskC = { zen: col(0x34457f), hor: col(0xf59a55) }, nightC = { zen: col(0x01030a), hor: col(0x0b1730) };
  const grayD = { zen: col(0x66717c), hor: col(0x98a3ad) }, grayN = { zen: col(0x04060b), hor: col(0x0a0e18) };
  const tmpA = new THREE.Color(), tmpB = new THREE.Color(), sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), cam = new THREE.Vector3();
  W.env = { dark: 0, elev: 1 };
  W.update = function (now, dt, hour, lv, flash, camPos) {
    const a = (hour - 6) / 12 * Math.PI, elev = Math.sin(a);
    sunDir.set(Math.cos(a), Math.sin(a), 0.4 * Math.sin(a)).normalize();
    moonDir.set(-Math.cos(a), -Math.sin(a), 0.3).normalize();
    const dayK = smooth(-0.1, 0.28, elev), dark = 1 - smooth(-0.14, 0.18, elev), duskK = Math.exp(-Math.pow(elev / 0.14, 2));
    const oc = clamp(Math.max(lv.rain * 0.75, lv.storm, lv.fog * 0.55), 0, 1);
    W.env.dark = dark; W.env.elev = elev; W.env.oc = oc;
    // sky colours
    for (const k of ['zen', 'hor']) {
      tmpA.copy(nightC[k]).lerp(dayC[k], dayK); tmpA.lerp(duskC[k], duskK * 0.85 * (1 - oc * 0.7));
      tmpB.copy(grayN[k]).lerp(grayD[k], dayK); tmpA.lerp(tmpB, oc * 0.85); if (flash > 0) tmpA.lerp(col(0xdfe8ff), flash * 0.6);
      skyMat.uniforms[k].value.copy(tmpA);
    }
    const fogMix = clamp(lv.fog * 0.95, 0, 1); skyMat.uniforms.fogMix.value = fogMix; skyMat.uniforms.night.value = dark * (1 - oc * 0.9); skyMat.uniforms.sunDir.value.copy(sunDir);
    skyMat.uniforms.glow.value.set(0xfff0c0).lerp(col(0xff8a40), duskK);
    // fog = horizon colour, thickened by fog level
    const fogCol = skyMat.uniforms.hor.value.clone(); if (lv.fog > 0.01) fogCol.lerp(tmpB.copy(grayD.hor).multiplyScalar(0.35 + 0.65 * (1 - dark)), lv.fog * 0.8);
    if (!scene.fog) scene.fog = new THREE.FogExp2(0xffffff, 0.0002);
    scene.fog.color.copy(fogCol); scene.fog.density = 0.00018 + 0.0006 * lv.rain + 0.0052 * lv.fog + 0.0002 * dark;
    skyMat.uniforms.fogC.value.copy(fogCol); renderer.setClearColor(fogCol);
    // lights
    const sunI = smooth(0.0, 0.25, elev) * 2.0 * (1 - oc * 0.62), moonI = smooth(-0.02, -0.18, elev) * 0.55 * (1 - oc * 0.5);
    const useSun = elev > -0.01, d = useSun ? sunDir : moonDir;
    sun.position.set(800 + d.x * 1500, d.y * 1500, 480 + d.z * 1500); sun.intensity = useSun ? sunI : moonI;
    sun.color.set(useSun ? 0xfff2dd : 0x9fb6ff).lerp(col(0xff9a50), useSun ? duskK * 0.8 : 0);
    hemi.intensity = lerp(0.6, 1.7, dayK) * (1 - oc * 0.18) + flash * 2.5; hemi.color.copy(skyMat.uniforms.hor.value).lerp(col(0xffffff), 0.45 * dayK); hemi.groundColor.set(0x8a8e94).lerp(col(0x0b0e16), dark * 0.85);
    sunSpr.position.copy(camPos).addScaledVector(sunDir, 4300); moonSpr.position.copy(camPos).addScaledVector(moonDir, 4300);
    sunSpr.material.opacity = smooth(-0.06, 0.05, elev) * (1 - oc * 0.9); moonSpr.material.opacity = (1 - smooth(-0.3, -0.04, -elev) ) * 0 + smooth(-0.04, -0.2, elev) * (1 - oc);
    sunSpr.material.color.set(0xffffff).lerp(col(0xff8c3a), duskK);
    sky.position.copy(camPos);
    // clouds
    cloudMat.color.copy(tmpA.copy(skyMat.uniforms.hor.value)).lerp(col(0xffffff), 0.5 * dayK * (1 - oc)).multiplyScalar(0.55 + 0.6 * dayK);
    cloudMat.opacity = clamp(0.55 + oc * 0.45, 0, 1);
    clouds.forEach(s => { const u = s.userData; u.a += u.sp * dt * 0.2; s.position.set(800 + Math.cos(u.a) * u.d, u.y - oc * 150, 450 + Math.sin(u.a) * u.d); });
    // sea + wet + windows + city
    nTex.offset.x = now * 0.0016; nTex.offset.y = now * 0.0009; seaMat.color.set(0x1a78a4).multiplyScalar(0.25 + 0.75 * (1 - dark * 0.85)); seaMat.specular.setScalar(0.8 * (1 - oc));
    if (W.wet) W.wet.opacity = 0.1 * lv.rain * (1 - dark * 0.6);
    if (W.facadeMat) W.facadeMat.emissiveIntensity = dark * 0.95;
    cityMat.emissiveIntensity = dark * 0.9; cityMat.color.set(0x8c97a8).multiplyScalar(0.5 + 0.5 * (1 - dark));
    // runway & airfield lights
    const blink = (Math.floor(now * 1.1) % 2) ? 1 : 0.35;
    lightMats.forEach(m => { const u = m.userData; if (u.beacon) { m.opacity = (0.2 + 0.8 * dark) * blink; return; } m.opacity = clamp(u.base + dark * 0.9 + lv.fog * 0.35 + lv.rain * 0.1, 0, 1) * (u.big ? dark : 1); });
    // rain
    rainMat.uniforms.time.value = now; rainMat.uniforms.cam.value.copy(camPos); rainMat.uniforms.level.value = lv.rain; rain.visible = lv.rain > 0.02;
    rainMat.uniforms.tint.value.set(0xc8d8f0).multiplyScalar(0.35 + 0.65 * (1 - dark));
  };
  // accident scene
  W.accident = function (acc, dt, now) {
    if (!acc) { fireLight.intensity = 0; fireSpr.forEach(f => f.s.visible = false); smokeSpr.forEach(f => f.s.visible = false); W.scorch && (W.scorch.visible = false); return; }
    if (!W.scorch) { W.scorch = new THREE.Mesh(new THREE.CircleGeometry(60, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex([[0, 'rgba(8,6,4,.9)'], [0.6, 'rgba(8,6,4,.6)'], [1, 'rgba(8,6,4,0)']]), transparent: true, depthWrite: false })); W.scorch.position.y = 0.45; W.scorch.renderOrder = -2; scene.add(W.scorch); }
    W.scorch.visible = true; W.scorch.position.x = acc.x; W.scorch.position.z = acc.y;
    const d = () => acc.debris[Math.floor(Math.random() * acc.debris.length)];
    fireSpr.forEach(f => { f.t += dt; if (f.t > f.life) { const q = d(); f.t = 0; f.life = rnd(0.6, 1.3); f.x = acc.x + q.dx * 0.5; f.z = acc.y + q.dy * 0.5; f.y = rnd(1, 4); f.r = rnd(5, 10); }
      const k = f.t / f.life; f.s.visible = true; f.s.position.set(f.x, f.y + k * 14, f.z); f.s.scale.setScalar(f.r * (1.4 - k * 0.7) * 2); f.s.material.opacity = 1 - k; f.s.material.color.setRGB(1, 1 - k * 0.5, 1 - k * 0.8); });
    smokeSpr.forEach(f => { f.t += dt; if (f.t > f.life) { const q = d(); f.t = 0; f.life = rnd(3.5, 6.5); f.x = acc.x + q.dx * 0.4; f.z = acc.y + q.dy * 0.4; f.y = rnd(4, 8); f.vx = rnd(6, 16); f.r = rnd(8, 14); }
      const k = f.t / f.life; f.s.visible = true; f.s.position.set(f.x + f.vx * f.t, f.y + k * 55, f.z + f.t * 2); f.s.scale.setScalar(f.r * (1 + k * 3.2)); f.s.material.opacity = 0.75 * (1 - k); });
    fireLight.position.set(acc.x, 12, acc.y); fireLight.intensity = (4 + Math.sin(now * 17) * 1.2 + Math.random()) * 1.6;
  };
  return W;
}
