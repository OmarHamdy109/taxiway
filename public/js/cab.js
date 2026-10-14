// The tower cab interior: glass, frames, floor, ceiling light strip, the controller desk and four monitors.
import * as THREE from 'three';
import { TOWER, FL, EYE, CAB_R, DESK_YAW } from './config.js';

function tex(w, h, fn, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 4; return t; }

export function buildCab(scene, screens) {
  const cab = new THREE.Group(); cab.position.set(TOWER.x, FL, TOWER.z); scene.add(cab);
  const out = { group: cab, screens: [], rain: [], parts: {} };
  const N = 12, GH0 = 0.45, GH1 = 3.0, ceilY = 3.15;
  // --- floor (metal diamond plate)
  const plate = tex(256, 256, (g, w, h) => { g.fillStyle = '#5b6168'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(255,255,255,.18)'; g.save(); g.translate(x + 8, y + 8); g.rotate(((x / 16 + y / 16) % 2 ? 1 : -1) * 0.7); g.fillRect(-5, -1.5, 10, 3); g.restore(); } g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeRect(0, 0, w, h); }, true);
  plate.repeat.set(7, 7);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(CAB_R, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: plate, metalness: 0.45, roughness: 0.5 })); cab.add(floor);
  // --- ceiling + light strip
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(CAB_R, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9aa2aa, roughness: 0.8 })); ceil.position.y = ceilY; cab.add(ceil);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false }); out.lampMat = lampMat;
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.36, 48).rotateX(Math.PI / 2), lampMat); ring.position.y = ceilY - 0.01; cab.add(ring);
  for (const [w, d, x, z] of [[0.18, 3.2, 0, 0], [3.2, 0.18, 0, 0]]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), lampMat); s.position.set(x, ceilY - 0.01, z); cab.add(s); }
  const lamp = new THREE.PointLight(0xfff0d8, 0, 14, 1.2); lamp.position.set(0, ceilY - 0.4, 0); cab.add(lamp); out.lamp = lamp;
  const alarm = new THREE.PointLight(0xff2020, 0, 9, 1.5); alarm.position.set(0, 2.2, -1.5); cab.add(alarm); out.alarm = alarm;
  // --- walls: sill + header, mullions, glass layers
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1d2227, roughness: 0.45, metalness: 0.6 });
  const sill = new THREE.Mesh(new THREE.CylinderGeometry(CAB_R, CAB_R, GH0, N, 1, true).translate(0, GH0 / 2, 0), dark); cab.add(sill);
  const sillTop = new THREE.Mesh(new THREE.CylinderGeometry(CAB_R, CAB_R - 0.55, 0.06, N).translate(0, GH0, 0), new THREE.MeshStandardMaterial({ color: 0x3a424a, roughness: 0.5, metalness: 0.3 })); cab.add(sillTop);
  const header = new THREE.Mesh(new THREE.CylinderGeometry(CAB_R, CAB_R, ceilY - GH1, N, 1, true).translate(0, (ceilY + GH1) / 2, 0), dark); cab.add(header);
  const mull = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, N * 2), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let k = 0; k < N * 2; k++) { const a = k * Math.PI / N, r = CAB_R * (k % 2 ? Math.cos(Math.PI / N) : 1) - 0.02, thick = k % 2 ? 0.035 : 0.06;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); p.set(Math.sin(a) * r, (GH0 + GH1) / 2, Math.cos(a) * r); sc.set(thick, GH1 - GH0, thick); m4.compose(p, q, sc); mull.setMatrixAt(k, m4); }
  cab.add(mull);
  // glass: tint, reflection streaks, rain-drop layers (all inside-facing 12-gons)
  const gH = GH1 - GH0, gY = (GH0 + GH1) / 2;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(CAB_R - 0.03, CAB_R - 0.03, gH, N, 1, true).translate(0, gY, 0), new THREE.MeshBasicMaterial({ color: 0x7fb4c4, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false }));
  glass.renderOrder = 10; cab.add(glass); out.glass = glass;
  const refl = new THREE.MeshBasicMaterial({ map: tex(512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); for (let i = 0; i < 9; i++) { const x = Math.random() * w, wd = 10 + Math.random() * 40, gr = g.createLinearGradient(x, 0, x + wd, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${0.25 + Math.random() * 0.45})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + wd, 0); g.lineTo(x + wd - 40, h); g.lineTo(x - 40, h); g.fill(); }
    const gl = g.createLinearGradient(0, 0, 0, h); gl.addColorStop(0, 'rgba(255,255,255,.0)'); gl.addColorStop(0.5, 'rgba(255,255,255,.55)'); gl.addColorStop(0.58, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(0, 0, w, h); }), transparent: true, opacity: 0.06, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const reflM = new THREE.Mesh(new THREE.CylinderGeometry(CAB_R - 0.04, CAB_R - 0.04, gH, N, 1, true).translate(0, gY, 0), refl); reflM.renderOrder = 11; cab.add(reflM); out.refl = refl;
  const dropTex = () => tex(512, 512, (g, w, h) => { g.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const x = Math.random() * w, y = Math.random() * h, l = 20 + Math.random() * 110; g.strokeStyle = 'rgba(210,230,255,.16)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 4, y + l); g.stroke(); }
    for (let i = 0; i < 220; i++) { const x = Math.random() * w, y = Math.random() * h, r = 1.5 + Math.random() * 4.5, gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.5, 'rgba(180,210,240,.35)'); gr.addColorStop(1, 'rgba(120,160,200,.12)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 1.25, 0, 0, 7); g.fill(); } }, true);
  [[CAB_R - 0.06, 5, 1.6, 0.06], [CAB_R - 0.075, 8, 2.4, 0.11]].forEach(([r, rx, ry, sp]) => {
    const t = dropTex(); t.repeat.set(rx, ry); const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, gH, N, 1, true).translate(0, gY, 0), m); mesh.renderOrder = 12; mesh.visible = false; cab.add(mesh); out.rain.push({ t, m, mesh, sp });
  });
  // --- desk module (faces the airfield)
  const desk = new THREE.Group(); desk.rotation.y = DESK_YAW; cab.add(desk);
  const span = 2.7, ts = Math.PI / 2 - span / 2;
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x31373e, roughness: 0.55, metalness: 0.2 }), topMat = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.35, metalness: 0.35 });
  const top = new THREE.Mesh(new THREE.RingGeometry(0.85, 2.5, 48, 1, ts, span).rotateX(-Math.PI / 2), topMat); top.position.y = 0.78; desk.add(top);
  const front = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.78, 40, 1, true, Math.PI - span / 2, span).translate(0, 0.39, 0), deskMat); front.material.side = THREE.DoubleSide; desk.add(front);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.78, 32, 1, true, Math.PI - span / 2, span).translate(0, 0.39, 0), deskMat); desk.add(inner);
  for (const s of [-1, 1]) { const a = Math.PI - s * span / 2; const cap = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.78), deskMat); cap.position.set(Math.sin(a) * 1.675, 0.39, Math.cos(a) * 1.675); cap.rotation.y = a + Math.PI / 2; desk.add(cap); }
  // monitors
  const cam0 = new THREE.Vector3(0, EYE - FL, 0), angs = [-39, -13, 13, 39].map(d => d * Math.PI / 180);
  const bezel = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.4, metalness: 0.5 });
  const MW = 0.84, MH = MW * 9 / 16, MR = 1.8, MY = 1.08; out.MW = MW; out.MH = MH;
  angs.forEach((a, i) => {
    const r = MR, px = Math.sin(a) * r, pz = -Math.cos(a) * r, py = MY;
    const mon = new THREE.Group(); mon.position.set(px, py, pz); mon.rotation.order = 'YXZ';
    mon.rotation.y = Math.atan2(-px, -pz); mon.rotation.x = -Math.atan2(cam0.y - py, Math.hypot(px, pz)) * 0.8; desk.add(mon);
    mon.add(new THREE.Mesh(new THREE.BoxGeometry(MW + 0.05, MH + 0.05, 0.04), bezel));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshBasicMaterial({ map: screens[i].tex, toneMapped: false })); scr.position.z = 0.021; mon.add(scr);
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshBasicMaterial({ map: tex(128, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,.2)'); gr.addColorStop(0.35, 'rgba(255,255,255,.03)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); sheen.position.z = 0.023; mon.add(sheen);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.05), bezel); stand.position.set(0, -MH / 2 - 0.13, -0.04); mon.add(stand);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.22), bezel); foot.position.set(0, -MH / 2 - 0.27, -0.02); mon.add(foot);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.01), new THREE.MeshBasicMaterial({ color: 0x38ff7a })); led.position.set(MW / 2 - 0.05, -MH / 2 - 0.012, 0.023); mon.add(led);
    scr.userData.index = i; out.screens.push(scr);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.12), new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.6 })); const kr = r - 0.62; kb.position.set(Math.sin(a) * kr, 0.8, -Math.cos(a) * kr); kb.rotation.y = -a; desk.add(kb);
    const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.075), bezel); mouse.position.set(Math.sin(a) * kr + 0.28 * Math.cos(a), 0.8, -Math.cos(a) * kr + 0.28 * Math.sin(a)); desk.add(mouse);
  });
  // desk props
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 })); mug.position.set(1.2, 0.83, -1.55); desk.add(mug);
  const bino = new THREE.Group(); for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.2, 10).rotateX(Math.PI / 2), bezel); b.position.set(s * 0.07, 0, 0); bino.add(b); } bino.position.set(-1.25, 0.84, -1.6); bino.rotation.y = 0.5; desk.add(bino);
  const strips = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.2), new THREE.MeshStandardMaterial({ color: 0xe9e2c8 })); strips.position.set(0.05, 0.79, -1.15); strips.rotation.y = 0.12; desk.add(strips);
  const hs = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14, Math.PI), bezel); hs.position.set(-0.5, 0.83, -1.2); desk.add(hs);
  // back of the room: equipment cabinet + door frame + chair-less standing mat
  const cab2 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 0.5), deskMat); cab2.position.set(0, 0.75, CAB_R - 0.8); cab2.rotation.y = 0; cab.add(cab2);
  const cabLeds = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0x38ff7a })); cabLeds.position.set(0, 1.2, CAB_R - 1.06); cab.add(cabLeds);
  const mat = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x23303c, roughness: 0.95 })); mat.position.y = 0.01; cab.add(mat);
  out.desk = desk; cab.updateMatrixWorld(true);
  // focus poses for each screen (world space)
  out.focusPose = (i, aspect, fov) => {
    const s = out.screens[i], c = new THREE.Vector3(), qn = new THREE.Quaternion(), sc2 = new THREE.Vector3(); s.matrixWorld.decompose(c, qn, sc2);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(qn), t = Math.tan(fov * Math.PI / 360);
    const dist = Math.max(out.MH / 2 / t, out.MW / 2 / (t * aspect)) * 1.07;
    const pos = c.clone().addScaledVector(n, dist), quat = qn.clone();
    return { pos, quat };
  };
  return out;
}
