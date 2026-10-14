'use strict';
// ---- Taxiway Alpha: rendering (camera, cached sprites, static map layer, lighting, weather, accident fx) ----
const cv = $('cv'), cx = cv.getContext('2d'), mini = $('mini'), mx = mini.getContext('2d');
let sw = 0, sh = 0, dpr = 1;
const cam = { x: 800, y: 450, z: 1, rot: 0, tx: 800, ty: 450, tz: 1, trot: 0, tilt: 0.86 };
const layers = { labels: true, shadows: true, routes: true, weather: true, lights: true };
const fx = { rain: [], flash: 0, thunderT: 0, lv: { rain: 0, fog: 0, storm: 0 }, fire: [], smoke: [], floats: [], spray: [] };
let camM = new DOMMatrix(), camInv = new DOMMatrix();

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1); sw = innerWidth; sh = innerHeight;
  cv.width = sw * dpr; cv.height = sh * dpr;
}
addEventListener('resize', resize); resize();
function fitScale() { const c = Math.abs(Math.cos(cam.rot)), s = Math.abs(Math.sin(cam.rot)); return Math.min(sw / (W * c + H * s), sh / ((W * s + H * c) * cam.tilt)); }
function updateCam(dt) {
  const k = 1 - Math.exp(-dt * 8);
  cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.z += (cam.tz - cam.z) * k; cam.rot += (cam.trot - cam.rot) * k;
  buildCamM();
}
function buildCamM() {
  const zf = fitScale() * cam.z;
  camM = new DOMMatrix().translate(sw / 2, sh / 2).scale(1, cam.tilt).scale(zf).rotate(cam.rot * 180 / Math.PI).translate(-cam.x, -cam.y); camInv = camM.inverse();
}
const toWorld = (px, py) => { const p = camInv.transformPoint(new DOMPoint(px, py)); return { x: p.x, y: p.y }; };
const toScreen = (x, y) => { const p = camM.transformPoint(new DOMPoint(x, y)); return { x: p.x, y: p.y }; };
const zoomFactor = () => fitScale() * cam.z;

// ---------- plane sprites (pre-rendered, with soft shadows) ----------
const SP = 2, sprites = {};
function planeParts(g, t, liv, shadow) {
  const fw = t.fw, hs = t.span / 2, sw_ = t.sweep, F = shadow ? () => '#000' : null;
  const fill = c => { g.fillStyle = shadow ? '#000' : c; g.fill(); };
  for (const s of [-1, 1]) { // wings
    g.beginPath(); g.moveTo(6, s * fw * 0.8); g.lineTo(6 - sw_, s * hs); g.lineTo(6 - sw_ - 3.4, s * hs); g.lineTo(-6, s * fw * 0.8); g.closePath(); fill('#d5dbe1');
    if (!shadow) { g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 0.35; g.stroke(); g.beginPath(); g.moveTo(6 - sw_ - 0.2, s * (hs - 0.2)); g.lineTo(6 - sw_ - 3.4, s * (hs - 0.2)); g.lineTo(6 - sw_ - 3.4, s * (hs - 3)); g.lineTo(6 - sw_ - 1, s * (hs - 3)); g.closePath(); fill(liv.tail); }
  }
  const ys = t.eng === 4 ? [0.3, 0.58] : [0.34];
  for (const yy of ys) for (const s of [-1, 1]) { // engines
    const y = s * hs * yy, xl = 6 - sw_ * (yy), rx = t.eng === 4 ? 3.8 : 4.4, ry = t.eng === 4 ? 1.7 : (t.len > 48 ? 2.4 : 2);
    g.beginPath(); g.ellipse(xl - 1.5, y, rx, ry, 0, 0, 7); fill('#e4e8ec');
    if (!shadow) { g.beginPath(); g.ellipse(xl + rx - 2.2, y, 0.9, ry * 0.75, 0, 0, 7); g.fillStyle = '#2b3037'; g.fill(); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 0.3; g.beginPath(); g.ellipse(xl - 1.5, y, rx, ry, 0, 0, 7); g.stroke(); }
  }
  for (const s of [-1, 1]) { // tailplane
    g.beginPath(); g.moveTo(-14, s * fw * 0.9); g.lineTo(-19.5, s * hs * 0.36); g.lineTo(-22.6, s * hs * 0.36); g.lineTo(-19.2, s * fw * 0.8); g.closePath(); fill(liv.tail);
  }
  // fuselage
  g.beginPath(); g.moveTo(21.5, 0); g.bezierCurveTo(21, -fw * 0.9, 17, -fw, 12, -fw); g.lineTo(-13, -fw * 0.92); g.bezierCurveTo(-18, -fw * 0.7, -21, -fw * 0.3, -22.5, -0.3);
  g.lineTo(-22.5, 0.3); g.bezierCurveTo(-21, fw * 0.3, -18, fw * 0.7, -13, fw * 0.92); g.lineTo(12, fw); g.bezierCurveTo(17, fw, 21, fw * 0.9, 21.5, 0); g.closePath();
  if (shadow) { g.fillStyle = '#000'; g.fill(); return; }
  const gr = g.createLinearGradient(0, -fw, 0, fw); gr.addColorStop(0, '#aab1b9'); gr.addColorStop(0.3, liv.body); gr.addColorStop(0.7, liv.body); gr.addColorStop(1, '#a3aab2');
  g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 0.3; g.stroke();
  g.fillStyle = liv.acc; g.globalAlpha = 0.9; g.fillRect(-11, -fw * 0.62, 24, 0.55); g.fillRect(-11, fw * 0.62 - 0.55, 24, 0.55); g.globalAlpha = 1;
  g.fillStyle = liv.tail; g.beginPath(); g.moveTo(-10.5, -0.9); g.lineTo(-22.4, -0.9); g.lineTo(-22.4, 0.9); g.lineTo(-10.5, 0.9); g.lineTo(-8.5, 0); g.closePath(); g.fill(); // fin
  g.fillStyle = liv.acc; g.fillRect(-20.5, -0.25, 10, 0.5);
  g.fillStyle = '#25303c'; g.beginPath(); g.moveTo(17.8, -fw * 0.5); g.lineTo(16.4, -fw * 0.7); g.lineTo(16.4, fw * 0.7); g.lineTo(17.8, fw * 0.5); g.closePath(); g.fill(); // cockpit
  g.fillStyle = 'rgba(60,80,110,.55)'; for (let x = 14; x > -12; x -= 1.6) { g.fillRect(x, -fw * 0.82, 0.6, 0.45); g.fillRect(x, fw * 0.82 - 0.45, 0.6, 0.45); } // windows
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(-9, -0.18, 22, 0.36);
}
function getSprite(ty, al, shadow) {
  const key = ty + al + (shadow ? 's' : ''); if (sprites[key]) return sprites[key];
  const t = TYPES[ty], k = t.len / 42, side = Math.ceil(84 * k * SP), c = document.createElement('canvas'); c.width = c.height = side;
  const g = c.getContext('2d');
  if (shadow) { g.shadowColor = 'rgba(0,0,0,.75)'; g.shadowBlur = 5 * SP; g.shadowOffsetX = 4 * side; g.translate(side / 2 - 4 * side, side / 2); }
  else g.translate(side / 2, side / 2);
  g.scale(k * SP, k * SP); planeParts(g, t, AIRLINES[al], shadow);
  return (sprites[key] = { c, side });
}

// ---------- seeded random ----------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

// ---------- static map layer ----------
const MAPS = 1.5, MX = -200, MY = -150, MW = 2000, MH = 1200;
let mapC = null, dirty = true, L = {}; // L: light/window paths and ambient vehicles
function mapDirty() { dirty = true; }
const coastX = y => 150 + 34 * Math.sin(y / 110) + 18 * Math.sin(y / 37 + 1);
function buildStaticMap() {
  dirty = false; const cfg = cfgOf(), R = rng(G.ap.charCodeAt(0) * 977 + G.ap.charCodeAt(1) * 31 + G.ap.charCodeAt(2));
  mapC = mapC || document.createElement('canvas'); mapC.width = MW * MAPS; mapC.height = MH * MAPS;
  const m = mapC.getContext('2d'); m.setTransform(MAPS, 0, 0, MAPS, -MX * MAPS, -MY * MAPS);
  // grass
  m.fillStyle = '#4a8039'; m.fillRect(MX, MY, MW, MH);
  for (let y = MY; y < MY + MH; y += 44) { m.fillStyle = (y / 44) % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.035)'; m.fillRect(MX, y, MW, 44); }
  for (let i = 0; i < 90; i++) { m.fillStyle = `rgba(${R() < 0.5 ? '30,70,30' : '110,140,60'},.13)`; m.beginPath(); m.ellipse(R() * 1700 + 100, R() * 1000 - 50, 20 + R() * 70, 10 + R() * 30, R() * 3, 0, 7); m.fill(); }
  // sea + beach
  m.beginPath(); m.moveTo(MX, MY); for (let y = MY; y <= MY + MH; y += 6) m.lineTo(coastX(y), y); m.lineTo(MX, MY + MH); m.closePath();
  let gr = m.createLinearGradient(MX, 0, 170, 0); gr.addColorStop(0, '#0a4a72'); gr.addColorStop(0.7, '#157fa8'); gr.addColorStop(1, '#3ec1c9'); m.fillStyle = gr; m.fill();
  m.lineWidth = 14; m.strokeStyle = '#dccb9c'; m.lineJoin = 'round'; m.beginPath(); for (let y = MY; y <= MY + MH; y += 6) y === MY ? m.moveTo(coastX(y) + 6, y) : m.lineTo(coastX(y) + 6, y); m.stroke();
  m.lineWidth = 5; m.strokeStyle = 'rgba(255,255,255,.55)'; m.beginPath(); for (let y = MY; y <= MY + MH; y += 6) y === MY ? m.moveTo(coastX(y) - 3, y) : m.lineTo(coastX(y) - 3, y); m.stroke();
  // trees
  const tree = (x, y, r) => { m.fillStyle = 'rgba(0,0,0,.22)'; m.beginPath(); m.ellipse(x + r * 0.5, y + r * 0.6, r, r * 0.8, 0, 0, 7); m.fill(); m.fillStyle = '#2f6a2d'; m.beginPath(); m.arc(x, y, r, 0, 7); m.fill(); m.fillStyle = '#4d8e3c'; m.beginPath(); m.arc(x - r * 0.25, y - r * 0.3, r * 0.6, 0, 7); m.fill(); };
  for (let i = 0; i < 70; i++) tree(240 + R() * 1300, 8 + R() * 82, 5 + R() * 6);
  for (let i = 0; i < 40; i++) tree(1545 + R() * 55, 20 + R() * 850, 5 + R() * 6);
  for (let i = 0; i < 30; i++) tree(coastX(R() * 900) + 30 + R() * 50, R() * 900, 5 + R() * 5);
  // taxiways
  m.lineCap = 'round'; m.lineJoin = 'round';
  const edges = []; for (const id in AP.N) for (const o of AP.N[id].adj) if (id < o && !(isRw(id) && isRw(o))) edges.push([AP.N[id], AP.N[o]]);
  const strokeE = (w, c, dash) => { m.lineWidth = w; m.strokeStyle = c; m.setLineDash(dash || []); m.beginPath(); edges.forEach(([a, b]) => { m.moveTo(a.x, a.y); m.lineTo(b.x, b.y); }); m.stroke(); m.setLineDash([]); };
  // apron concrete
  const gx = GATE_X; m.fillStyle = '#7b8189'; m.fillRect(gx[0] - 55, 536, gx[9] - gx[0] + 110, 236);
  m.strokeStyle = 'rgba(0,0,0,.12)'; m.lineWidth = 1; for (let x = gx[0] - 55; x <= gx[9] + 55; x += 45) { m.beginPath(); m.moveTo(x, 536); m.lineTo(x, 772); m.stroke(); }
  for (let y = 536; y <= 772; y += 45) { m.beginPath(); m.moveTo(gx[0] - 55, y); m.lineTo(gx[9] + 55, y); m.stroke(); }
  strokeE(31, 'rgba(0,0,0,.22)'); strokeE(27, '#4d525a'); strokeE(25, '#555a62'); strokeE(1.8, '#e8c33a');
  // runways
  const waypoints = [];
  AP.rw.forEach(Rw => {
    const x0 = Rw.x0, x1 = Rw.x1, y = Rw.y;
    m.fillStyle = 'rgba(0,0,0,.25)'; m.fillRect(x0 - 8, y - 33, x1 - x0 + 16, 66);
    m.fillStyle = '#2b2f35'; m.fillRect(x0 - 6, y - 28, x1 - x0 + 12, 56);
    for (let i = 0; i < 700; i++) { m.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.08)'; m.fillRect(x0 + R() * (x1 - x0), y - 27 + R() * 54, 2 + R() * 6, 1 + R() * 2); }
    for (const [tx, d] of [[x0, 1], [x1, -1]]) { m.fillStyle = 'rgba(8,8,8,.45)'; for (let k = 0; k < 4; k++) { m.beginPath(); m.ellipse(tx + d * (90 + k * 12), y + (k % 2 ? -8 : 9), 28, 5, 0, 0, 7); m.fill(); } }
    m.fillStyle = '#eceff1'; m.fillRect(x0 - 6, y - 27, x1 - x0 + 12, 1.8); m.fillRect(x0 - 6, y + 25.2, x1 - x0 + 12, 1.8);
    for (let x = x0 + 120; x < x1 - 120; x += 44) m.fillRect(x, y - 1.2, 26, 2.4);
    for (const [tx, d] of [[x0, 1], [x1, -1]]) {
      for (let k = 0; k < 8; k++) { const yy = y - 22 + k * 6.2 + (k > 3 ? 3 : 0); m.fillRect(tx + d * 10 - (d < 0 ? 22 : 0), yy, 22, 3.2); }
      m.fillRect(tx + d * 68 - 2, y - 24, 4, 48);
      for (const off of [150, 300]) { m.fillRect(tx + d * off - 7, y - 16, 14, 3); m.fillRect(tx + d * off - 7, y - 10, 14, 3); m.fillRect(tx + d * off - 7, y + 7, 14, 3); m.fillRect(tx + d * off - 7, y + 13, 14, 3); }
      m.fillRect(tx + d * 400 - 16, y - 6, 32, 3); m.fillRect(tx + d * 400 - 16, y + 3, 32, 3);
    }
    m.fillStyle = '#eceff1'; m.font = 'bold 22px sans-serif'; m.textAlign = 'center'; m.textBaseline = 'middle';
    const num = nm => nm.slice(0, 2), let_ = nm => nm.slice(2);
    for (const [tx, d, nm] of [[x0, 1, Rw.names[0]], [x1, -1, Rw.names[1]]]) {
      m.save(); m.translate(tx + d * 50, y); m.rotate(d > 0 ? Math.PI / 2 : -Math.PI / 2); m.fillText(num(nm), 0, 0); if (let_(nm)) m.fillText(let_(nm), 0, 22); m.restore();
    }
    // ILS centreline + approach light bars
    m.strokeStyle = 'rgba(255,255,255,.1)'; m.setLineDash([10, 10]); m.lineWidth = 1.5; m.beginPath(); m.moveTo(x0 - 330, y); m.lineTo(x0 - 6, y); m.moveTo(x1 + 6, y); m.lineTo(x1 + 330, y); m.stroke(); m.setLineDash([]);
  });
  // hold-short markings on stubs
  AP.rw.forEach(Rw => ['a', 'b'].forEach(s => { const n = AP.N['R' + Rw.i + s];
    n.adj.filter(a => !isRw(a)).forEach(a => { const dir = Math.sign(AP.N[a].y - n.y), y = n.y + dir * 36;
      m.strokeStyle = '#e8c33a'; m.lineWidth = 1.4; for (let k = 0; k < 4; k++) { m.setLineDash(k < 2 ? [] : [3, 3]); m.beginPath(); m.moveTo(n.x - 11, y + dir * k * 3.2); m.lineTo(n.x + 11, y + dir * k * 3.2); m.stroke(); } m.setLineDash([]); }); }));
  // stands, jet bridges, terminal
  const wins = new Path2D();
  AP.gates.forEach(g => {
    m.fillStyle = g.open ? '#8a9098' : '#6d737b'; m.fillRect(g.x - 40, 600, 80, 128);
    m.strokeStyle = 'rgba(0,0,0,.2)'; m.strokeRect(g.x - 40, 600, 80, 128);
    if (g.open) { m.strokeStyle = '#e8c33a'; m.lineWidth = 1.6; m.beginPath(); m.moveTo(g.x, 566); m.lineTo(g.x, 668); m.stroke(); m.strokeRect(g.x - 3, 662, 6, 8);
      m.fillStyle = '#e8c33a'; m.font = 'bold 14px sans-serif'; m.textAlign = 'center'; m.fillText(g.i + 1, g.x + 24, 738);
      m.fillStyle = '#9aa2aa'; m.fillRect(g.x - 6, 726, 12, 46); m.fillStyle = '#c3cad1'; m.beginPath(); m.arc(g.x, 728, 7, 0, 7); m.fill(); m.strokeStyle = '#6a7078'; m.stroke(); }
    else { m.strokeStyle = 'rgba(255,255,255,.12)'; m.lineWidth = 1; m.setLineDash([5, 5]); m.strokeRect(g.x - 38, 604, 76, 120); m.setLineDash([]); }
  });
  const tx0 = gx[0] - 55, tw = gx[9] - gx[0] + 110;
  m.fillStyle = 'rgba(0,0,0,.3)'; m.fillRect(tx0 + 6, 776, tw, 100);
  m.fillStyle = '#b3bcc6'; m.fillRect(tx0, 770, tw, 98); m.fillStyle = '#8f9aa6'; m.fillRect(tx0, 770, tw, 6); m.fillStyle = '#c6cdd4'; m.fillRect(tx0, 862, tw, 6);
  for (let x = tx0 + 20; x < tx0 + tw - 20; x += 60) { m.fillStyle = '#9ba6b1'; m.fillRect(x, 800, 36, 20); m.fillStyle = '#8a95a0'; m.fillRect(x + 3, 803, 30, 14); m.fillStyle = '#c3ccd5'; m.fillRect(x, 836, 48, 12); }
  m.fillStyle = 'rgba(70,90,115,.35)'; m.fillRect(tx0 + 30, 822, tw - 60, 3);
  m.fillStyle = '#29445f'; m.fillRect(tx0, 776, tw, 20);
  for (let x = tx0 + 4; x < tx0 + tw - 10; x += 12) { m.fillStyle = '#7fb8e6'; m.fillRect(x, 779, 9, 14); wins.rect(x, 779, 9, 14); }
  m.fillStyle = 'rgba(255,255,255,.6)'; m.font = 'bold 16px sans-serif'; m.textAlign = 'center'; m.fillText(cfg.name.toUpperCase(), 800, 848);
  // tower
  const TW = { x: 1340, y: 815 };
  m.fillStyle = 'rgba(0,0,0,.28)'; m.beginPath(); m.moveTo(TW.x - 6, TW.y); m.lineTo(TW.x + 6, TW.y); m.lineTo(TW.x + 60, TW.y + 62); m.lineTo(TW.x + 44, TW.y + 66); m.closePath(); m.fill();
  m.fillStyle = '#9aa4ae'; m.beginPath(); m.ellipse(TW.x, TW.y, 24, 14, 0, 0, 7); m.fill(); m.fillStyle = '#b8c1ca'; m.beginPath(); m.ellipse(TW.x, TW.y - 4, 20, 11, 0, 0, 7); m.fill();
  gr = m.createLinearGradient(TW.x - 7, 0, TW.x + 7, 0); gr.addColorStop(0, '#c9d1d8'); gr.addColorStop(1, '#7c8791'); m.fillStyle = gr; m.fillRect(TW.x - 7, TW.y - 58, 14, 56);
  m.fillStyle = '#343f4c'; m.beginPath(); m.ellipse(TW.x, TW.y - 58, 20, 11, 0, 0, 7); m.fill(); m.fillRect(TW.x - 20, TW.y - 74, 40, 16);
  m.fillStyle = '#89d1ff'; m.fillRect(TW.x - 18, TW.y - 72, 36, 10); wins.rect(TW.x - 18, TW.y - 72, 36, 10);
  m.fillStyle = '#d0d7de'; m.beginPath(); m.ellipse(TW.x, TW.y - 74, 23, 12, 0, 0, 7); m.fill(); m.fillStyle = '#5a6672'; m.beginPath(); m.ellipse(TW.x, TW.y - 75, 12, 6, 0, 0, 7); m.fill();
  m.strokeStyle = '#aab'; m.lineWidth = 1.5; m.beginPath(); m.moveTo(TW.x, TW.y - 78); m.lineTo(TW.x, TW.y - 100); m.stroke(); m.fillStyle = '#f33'; m.beginPath(); m.arc(TW.x, TW.y - 100, 2, 0, 7); m.fill();
  // fire station, hangars, car park, road
  m.fillStyle = 'rgba(0,0,0,.3)'; m.fillRect(FS.x - 28, FS.y - 22, 66, 58);
  m.fillStyle = '#c8cdd2'; m.fillRect(FS.x - 34, FS.y - 30, 64, 58); m.fillStyle = '#a73232'; m.fillRect(FS.x - 34, FS.y - 30, 64, 14); m.fillStyle = '#6e7780'; for (let k = 0; k < 3; k++) m.fillRect(FS.x - 28 + k * 20, FS.y + 6, 15, 18);
  m.fillStyle = '#fff'; m.font = 'bold 9px sans-serif'; m.fillText('FIRE & RESCUE', FS.x - 2, FS.y - 20);
  for (const [hx, hy] of [[1400, 470], [1400, 540]]) { m.fillStyle = 'rgba(0,0,0,.28)'; m.fillRect(hx + 6, hy + 6, 150, 56); m.fillStyle = '#9ca7b2'; m.fillRect(hx, hy, 150, 56); m.fillStyle = 'rgba(0,0,0,.12)'; for (let x = hx; x < hx + 150; x += 10) m.fillRect(x, hy, 4, 56); m.fillStyle = '#6c7783'; m.fillRect(hx, hy + 48, 150, 8); }
  m.fillStyle = '#4a4f57'; m.fillRect(120, 872, 1480, 22); m.strokeStyle = '#e8e8e8'; m.setLineDash([14, 12]); m.lineWidth = 1.5; m.beginPath(); m.moveTo(120, 883); m.lineTo(1600, 883); m.stroke(); m.setLineDash([]);
  m.fillStyle = '#5b6068'; m.fillRect(190, 770, 140, 96); m.strokeStyle = '#ddd'; m.lineWidth = 1; for (let x = 190; x <= 330; x += 14) { m.beginPath(); m.moveTo(x, 770); m.lineTo(x, 866); m.stroke(); }
  const carC = ['#c33', '#36c', '#ddd', '#222', '#d92', '#4a4', '#999'];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) if (R() < 0.7) { m.fillStyle = carC[Math.floor(R() * carC.length)]; m.fillRect(193 + c * 15, 776 + r * 22, 9, 15); m.fillStyle = 'rgba(0,0,0,.35)'; m.fillRect(194 + c * 15, 779 + r * 22, 7, 4); }
  m.fillStyle = '#e8c33a'; m.fillRect(tx0 - 6, 750, tw + 12, 1.5); // service road line
  // lights
  const Ls = { edge: new Path2D(), glow: new Path2D(), blue: new Path2D(), blueG: new Path2D(), win: wins, app: [] };
  const dot = (p, g, x, y, r1, r2) => { p.moveTo(x + r1, y); p.arc(x, y, r1, 0, 7); g.moveTo(x + r2, y); g.arc(x, y, r2, 0, 7); };
  AP.rw.forEach(Rw => { for (let x = Rw.x0 - 6; x <= Rw.x1 + 6; x += 34) for (const dy of [-30, 30]) dot(Ls.edge, Ls.glow, x, Rw.y + dy, 1.5, 5);
    for (const [tx, d] of [[Rw.x0, -1], [Rw.x1, 1]]) { const arr = []; for (let k = 0; k < 17; k++) arr.push({ x: tx + d * (14 + k * 18), y: Rw.y }); Ls.app.push(arr); } });
  edges.forEach(([a, b]) => { const dl = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / dl, ny = (b.x - a.x) / dl;
    for (let t = 8; t < dl; t += 34) for (const s of [-1, 1]) dot(Ls.blue, Ls.blueG, a.x + (b.x - a.x) * t / dl + nx * 15.5 * s, a.y + (b.y - a.y) * t / dl + ny * 15.5 * s, 1.2, 4); });
  L = Ls;
  L.vans = Array.from({ length: 5 }, (_, i) => ({ x: tx0 + R() * tw, y: 760 + (i % 2) * 5, d: i % 2 ? 1 : -1, v: 18 + R() * 14, k: i % 3 === 0 ? 'bus' : 'van', c: ['#f2c500', '#e8e8e8', '#3a6ea5'][i % 3] }));
}

// ---------- vehicles ----------
function drawVeh(k, x, y, h, now, flash, c) {
  cx.save(); cx.translate(x, y); cx.rotate(h);
  cx.fillStyle = 'rgba(0,0,0,.25)'; cx.fillRect(-9, -4, 22, 11);
  if (k === 'fire') { cx.fillStyle = '#c91f1f'; cx.fillRect(-12, -5, 26, 10); cx.fillStyle = '#eee'; cx.fillRect(-10, -1, 20, 2); cx.fillStyle = '#e6e6e6'; cx.fillRect(2, -4, 8, 8); cx.fillStyle = '#7a1010'; cx.fillRect(-12, -2, 6, 4); }
  else if (k === 'amb') { cx.fillStyle = '#f4f4f4'; cx.fillRect(-10, -5, 22, 10); cx.fillStyle = '#d22'; cx.fillRect(-2, -1, 6, 2); cx.fillRect(0, -3, 2, 6); cx.fillStyle = '#2a3d52'; cx.fillRect(8, -4, 3, 8); }
  else if (k === 'bus') { cx.fillStyle = c; cx.fillRect(-11, -5, 22, 10); cx.fillStyle = '#233'; cx.fillRect(7, -4, 3, 8); }
  else if (k === 'fuel') { cx.fillStyle = '#e9ecef'; cx.beginPath(); cx.ellipse(-2, 0, 9, 4.5, 0, 0, 7); cx.fill(); cx.fillStyle = '#d33'; cx.fillRect(7, -3.5, 4, 7); }
  else if (k === 'bag') { cx.fillStyle = '#555'; cx.fillRect(-6, -3, 12, 6); cx.fillStyle = '#c92'; cx.fillRect(-5, -2, 4, 4); cx.fillRect(1, -2, 4, 4); }
  else { cx.fillStyle = c || '#f2c500'; cx.fillRect(-7, -4, 15, 8); cx.fillStyle = '#233'; cx.fillRect(4, -3, 3, 6); }
  if (flash) { const on = Math.floor(now * 7) % 2; cx.fillStyle = on ? '#ff3030' : '#3a8cff'; cx.fillRect(-1, -4, 3, 3); cx.fillStyle = on ? '#3a8cff' : '#ff3030'; cx.fillRect(-1, 1, 3, 3); }
  cx.restore();
}
function glowVeh(v, now) {
  const on = Math.floor(now * 7) % 2; cx.fillStyle = on ? 'rgba(255,40,40,.5)' : 'rgba(60,140,255,.5)';
  cx.beginPath(); cx.arc(v.x, v.y, 14, 0, 7); cx.fill();
}

// ---------- plane drawing ----------
const hrsNow = () => (G.gm / 60) % 24;
function darkness() { const h = hrsNow(); return h < 5 || h >= 20.5 ? 1 : h < 7 ? (7 - h) / 2 : h < 18 ? 0 : (h - 18) / 2.5; }
const TINT = [[0, 4, 8, 32, .62], [5, 4, 8, 32, .62], [6.2, 255, 130, 70, .22], [7.5, 255, 200, 150, .06], [9, 0, 0, 0, 0], [16, 0, 0, 0, 0], [17.5, 255, 150, 60, .17], [19, 210, 80, 60, .26], [20.5, 8, 12, 40, .55], [21.5, 4, 8, 32, .62], [24, 4, 8, 32, .62]];
function tint() { const h = hrsNow(); for (let i = 1; i < TINT.length; i++) if (h <= TINT[i][0]) { const a = TINT[i - 1], b = TINT[i], k = (h - a[0]) / (b[0] - a[0]); return a.slice(1).map((v, j) => v + (b[j + 1] - v) * k); } return [0, 0, 0, 0]; }
const stateLabel = p => p.st === 'accident' ? 'Accident' : p.air ? (p.st === 'climb' ? 'Takeoff' : p.st === 'final' ? 'Landing' : p.circ ? 'Holding' : 'Approach') :
  p.st === 'roll' ? 'Takeoff' : p.st === 'rollout' ? 'Landing' : p.st === 'gate' ? 'At gate' : p.st === 'lineup' ? 'Lined up' : p.st === 'idle' ? 'Waiting' : 'Taxiing';
const stateColor = p => p.st === 'accident' || p.em ? '#ff5252' : p.air ? (p.st === 'final' || p.st === 'climb' ? '#5dff8c' : '#7fd4ff') : p.st === 'roll' || p.st === 'rollout' ? '#5dff8c' : p.st === 'taxi' ? '#ffd84a' : '#ffb04a';

function drawPlane(p, now, dk) {
  const alt = p.alt || 0, sc = 1 + Math.min(alt, 10000) / 28000, wreck = p.st === 'accident';
  const spr = getSprite(p.ty, p.al), shd = getSprite(p.ty, p.al, true);
  if (layers.shadows) { const o = alt * 0.012; cx.save(); cx.globalAlpha = Math.max(0.15, 0.55 - alt / 30000) * (1 - 0.6 * (G.wx === 'fog' ? 1 : 0) * fx.lv.fog); cx.translate(p.x + 3 + o, p.y + 4 + o * 1.4); cx.rotate(p.h); cx.scale(1 / SP, 1 / SP); cx.drawImage(shd.c, -shd.side / 2, -shd.side / 2); cx.restore(); }
  const blur = (p.st === 'roll' && p.spd > 60) || (p.st === 'climb' && p.alt < 1800);
  if (blur) for (let i = 4; i >= 1; i--) { cx.save(); cx.globalAlpha = 0.1 * (5 - i) / 2; cx.translate(p.x - Math.cos(p.h) * i * p.spd * 0.03, p.y - Math.sin(p.h) * i * p.spd * 0.03); cx.rotate(p.h); cx.scale(sc / SP, sc / SP); cx.drawImage(spr.c, -spr.side / 2, -spr.side / 2); cx.restore(); }
  cx.save(); cx.translate(p.x, p.y); cx.rotate(p.h); cx.scale(sc / SP, sc / SP); cx.drawImage(spr.c, -spr.side / 2, -spr.side / 2);
  if (wreck) { cx.globalAlpha = 0.72; cx.drawImage(shd.c, -shd.side / 2, -shd.side / 2); }
  cx.restore();
}
function drawLightsOnPlane(p, now, dk) { // additive: nav lights, landing lights
  const t = TYPES[p.ty], k = t.len / 42, c = Math.cos(p.h), s = Math.sin(p.h), hs = t.span / 2 * k;
  const wx = (6 - t.sweep) * k, on = dk > 0.1 || p.air;
  if (on && p.st !== 'gate') {
    for (const [side, col] of [[-1, '255,60,60'], [1, '60,255,100']]) { const x = p.x + c * wx - s * side * hs, y = p.y + s * wx + c * side * hs; cx.fillStyle = `rgba(${col},.9)`; cx.beginPath(); cx.arc(x, y, 1.8, 0, 7); cx.fill(); cx.fillStyle = `rgba(${col},.2)`; cx.beginPath(); cx.arc(x, y, 6, 0, 7); cx.fill(); }
    if (Math.floor(now * 1.7 + p.id) % 2 === 0 && Math.sin(now * 1.7 * Math.PI * 2 + p.id) > 0.6) { cx.fillStyle = 'rgba(255,255,255,.9)'; cx.beginPath(); cx.arc(p.x - c * 18 * k, p.y - s * 18 * k, 2.4, 0, 7); cx.fill(); }
  }
  const ll = p.st === 'final' || p.st === 'roll' || p.st === 'lineup' || p.st === 'rollout' || (p.st === 'climb' && p.alt < 900);
  if (ll) {
    const a = 0.22 + 0.5 * dk + 0.25 * fx.lv.fog, nx = p.x + c * 20 * k, ny = p.y + s * 20 * k, len = 120;
    cx.save(); cx.translate(nx, ny); cx.rotate(p.h);
    const g = cx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, `rgba(255,250,225,${a})`); g.addColorStop(1, 'rgba(255,250,225,0)'); cx.fillStyle = g;
    cx.beginPath(); cx.moveTo(0, -2); cx.lineTo(len, -26); cx.lineTo(len, 26); cx.lineTo(0, 2); cx.closePath(); cx.fill(); cx.restore();
  }
}

// ---------- floating labels (screen space) ----------
function rr(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
const FONT = '"Inter","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif';
function badge(x, y, sz, al) { const A = AIRLINES[al]; cx.fillStyle = A.tail; rr(x, y, sz, sz, sz * 0.28); cx.fill(); cx.strokeStyle = A.acc; cx.lineWidth = 1.2; cx.stroke(); cx.fillStyle = A.tail === '#9aa3ab' || A.tail === '#b79a5a' || A.acc === '#ffffff' && false ? '#111' : '#fff'; cx.font = `800 ${sz * 0.46}px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(al, x + sz / 2, y + sz / 2 + 0.5); }
function drawLabel(p, selected) {
  const sp = toScreen(p.x, p.y - 0), zf = zoomFactor(); if (sp.x < -80 || sp.x > sw + 80 || sp.y < -40 || sp.y > sh + 40) return;
  const l1 = `${p.cs}  ${p.ty}`, ku = I18N.en.kt;
  const l2 = `${stateLabel(p)}${p.air || p.st === 'accident' ? ' · ' + (altFt(p)).toLocaleString() + ' ft' : p.st === 'gate' ? '' : ' · ' + speedKt(p) + ' kt'}`;
  cx.font = `700 11px ${FONT}`; const w1 = cx.measureText(l1).width; cx.font = `600 10px ${FONT}`; const w2 = cx.measureText(l2).width, w = Math.max(w1, w2) + 30, h = 28;
  const off = 22 + TYPES[p.ty].len * zf * 0.5 * cam.tilt + (p.air ? 8 : 0);
  const x = sp.x - w / 2, y = sp.y - off - h;
  cx.strokeStyle = 'rgba(0,229,255,.45)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(sp.x, y + h); cx.lineTo(sp.x, sp.y - 6); cx.stroke();
  cx.fillStyle = 'rgba(8,20,40,.82)'; rr(x, y, w, h, 7); cx.fill();
  cx.strokeStyle = p.st === 'accident' || p.em ? '#ff4040' : p.al_ ? '#ff9a30' : selected ? '#00e5ff' : 'rgba(0,229,255,.4)'; cx.lineWidth = selected ? 1.8 : 1; cx.stroke();
  badge(x + 4, y + 5, 18, p.al);
  cx.textAlign = 'left'; cx.textBaseline = 'alphabetic'; cx.fillStyle = '#fff'; cx.font = `700 11px ${FONT}`; cx.fillText(l1, x + 26, y + 12);
  cx.fillStyle = stateColor(p); cx.font = `600 10px ${FONT}`; cx.fillText(l2, x + 26, y + 24);
}

// ---------- main frame ----------
function floatTxt(p, amt) { fx.floats.push({ x: p.x, y: p.y, txt: '+$' + amt.toLocaleString(), t: 0 }); }
const GLINTS = Array.from({ length: 40 }, (_, i) => ({ y: (i * 97) % 1300 - 200, o: (i * 53) % 200 }));
function renderUpdate(dt) {
  const lv = fx.lv; ['rain', 'fog', 'storm'].forEach(k => { const t = (G.wx === k || (k === 'rain' && G.wx === 'storm')) ? 1 : 0; lv[k] += clamp(t - lv[k], -dt * 0.3, dt * 0.3); });
  if (G.wx === 'storm' && !G.over) { fx.thunderT -= dt; if (fx.thunderT <= 0) { fx.thunderT = rnd(5, 12); fx.flash = 1; setTimeout(Sfx.thunder, 500); } }
  fx.flash = Math.max(0, fx.flash - dt * 2.5);
  if (lv.rain > 0.01) { while (fx.rain.length < 160) fx.rain.push({ x: rnd(0, sw), y: rnd(0, sh), s: rnd(0.8, 1.3) }); fx.rain.forEach(d => { d.y += 900 * dt * d.s; d.x -= 220 * dt * d.s; if (d.y > sh) { d.y = -20; d.x = rnd(0, sw + 250); } }); }
  fx.floats.forEach(f => f.t += dt); fx.floats = fx.floats.filter(f => f.t < 1.8);
  if (L.vans) L.vans.forEach(v => { v.x += v.d * v.v * dt; const g = GATE_X; if (v.x < g[0] - 45) v.d = 1; if (v.x > g[9] + 45) v.d = -1; });
  if (G.acc) { // fire & smoke
    const a = G.acc, rate = Math.min(1, 0.4 + a.t / 4);
    for (let i = 0; i < 3 * rate; i++) { const d = pick(a.debris); fx.fire.push({ x: a.x + d.dx * 0.8, y: a.y + d.dy * 0.8, vy: rnd(-30, -12), t: 0, life: rnd(0.5, 1.1), r: rnd(4, 9) }); }
    if (Math.random() < 0.9) { const d = pick(a.debris); fx.smoke.push({ x: a.x + d.dx * 0.6, y: a.y + d.dy * 0.6, vx: rnd(8, 22), vy: rnd(-26, -12), t: 0, life: rnd(3, 6), r: rnd(8, 16) }); }
    fx.fire.forEach(f => { f.t += dt; f.y += f.vy * dt; }); fx.fire = fx.fire.filter(f => f.t < f.life);
    fx.smoke.forEach(f => { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.r += dt * 6; }); fx.smoke = fx.smoke.filter(f => f.t < f.life);
    fx.spray = G.veh.filter(v => v.k === 'fire' && v.st === 'work');
  } else { fx.fire.length = fx.smoke.length = 0; fx.spray = []; }
}
function render() {
  const now = performance.now() / 1000;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, sw, sh);
  if (!G) { cx.fillStyle = '#0b1620'; cx.fillRect(0, 0, sw, sh); return; }
  if (dirty || !mapC) buildStaticMap();
  const dk = darkness(), lv = fx.lv, selP = sel();
  cx.fillStyle = '#4a8039'; cx.fillRect(0, 0, sw, sh);
  cx.save(); cx.transform(camM.a, camM.b, camM.c, camM.d, camM.e, camM.f);
  // sea beyond the cached region
  cx.fillStyle = '#0a4a72'; cx.fillRect(-2500, -2500, 2500 - 200 + 100, 6000);
  cx.drawImage(mapC, MX, MY, MW, MH);
  // sea glints
  cx.fillStyle = 'rgba(255,255,255,.18)'; GLINTS.forEach((g, i) => { const x = coastX(g.y) - 30 - ((now * 9 + g.o * 3) % 260); if (x > -200) cx.fillRect(x, g.y, 14 + (i % 4) * 5, 1.4); });
  // wet runway sheen
  if (lv.rain > 0.05) { cx.fillStyle = `rgba(150,190,230,${0.13 * lv.rain})`; AP.rw.forEach(R => cx.fillRect(R.x0 - 6, R.y - 28, R.x1 - R.x0 + 12, 56)); }
  // taxi route preview
  if (layers.routes && selP && !selP.air && selP.path.length && selP.st !== 'accident') {
    cx.strokeStyle = '#00e5ff'; cx.lineWidth = 3; cx.setLineDash([9, 7]); cx.lineDashOffset = -now * 20; cx.beginPath(); cx.moveTo(selP.x, selP.y); selP.path.forEach(q => cx.lineTo(q.x, q.y)); cx.stroke(); cx.setLineDash([]);
  }
  if (layers.routes && selP && selP.air && (selP.wp.length || selP.st === 'final')) {
    cx.strokeStyle = '#00e5ff'; cx.lineWidth = 3; cx.setLineDash([9, 7]); cx.lineDashOffset = -now * 20; cx.beginPath(); cx.moveTo(selP.x, selP.y); selP.wp.forEach(q => cx.lineTo(q.x, q.y));
    if (selP.st === 'final') { const d = runwayDirAt(selP.end), T_ = rwEnd(selP.rw, selP.end); if (selP.stage <= 0) cx.lineTo(T_.x - d * 320, T_.y); cx.lineTo(T_.x, T_.y); } cx.stroke(); cx.setLineDash([]);
  }
  if (typeof drag !== 'undefined' && drag && drag.pts.length > 1 && drag.moved && drag.id) { cx.strokeStyle = '#fff'; cx.lineWidth = 4; cx.lineJoin = 'round'; cx.beginPath(); drag.pts.forEach((q, i) => i ? cx.lineTo(q.x, q.y) : cx.moveTo(q.x, q.y)); cx.stroke(); }
  // parked plane decorations at locked gates, turnaround vehicles, ambient vans
  const al = Object.keys(AIRLINES), tys = cfgOf().fleet;
  AP.gates.forEach(g => { if (!g.open) { const p = { x: g.x, y: g.y, h: Math.PI / 2, ty: tys[(g.i * 3) % tys.length], al: cfgOf().air[(g.i * 5) % cfgOf().air.length], alt: 0, st: 'deco', spd: 0, id: g.i }; drawPlane(p, now, dk); } });
  G.planes.forEach(p => { if (p.st === 'gate' && p.tm > 0) { const x = p.x, y = p.y; drawVeh('fuel', x + 26, y - 4, Math.PI / 2, now); drawVeh('bag', x - 24, y + 8, 0, now); drawVeh('bag', x - 24, y - 6, 0, now); drawVeh('van', x + 24, y + 22, 0, now, false, '#f2c500'); } });
  (L.vans || []).forEach(v => drawVeh(v.k, v.x, v.y, v.d > 0 ? 0 : Math.PI, now, false, v.c));
  // scorch marks
  if (G.acc) { const a = G.acc; const g = cx.createRadialGradient(a.x, a.y, 5, a.x, a.y, 70); g.addColorStop(0, 'rgba(10,8,5,.85)'); g.addColorStop(1, 'rgba(10,8,5,0)'); cx.fillStyle = g; cx.fillRect(a.x - 70, a.y - 70, 140, 140);
    a.debris.forEach(d => { cx.save(); cx.translate(a.x + d.dx, a.y + d.dy); cx.rotate(d.r); cx.fillStyle = d.c < 0.5 ? '#9aa1a8' : '#3a3f45'; cx.fillRect(-d.s, -d.s * 0.4, d.s * 2, d.s * 0.8); cx.restore(); }); }
  const order = G.planes.slice().sort((a, b) => (a.air - b.air) || a.alt - b.alt);
  order.forEach(p => drawPlane(p, now, dk));
  G.veh.forEach(v => drawVeh(v.k, v.x, v.y, v.h, now, true));
  // selection ring + warnings
  G.planes.forEach(p => {
    if (p.id === G.sel) { cx.strokeStyle = '#00e5ff'; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(p.x, p.y, 28 + Math.sin(now * 6) * 2, 28 + Math.sin(now * 6) * 2, 0, 0, 7); cx.stroke(); }
    if (p.al_) { cx.strokeStyle = Math.floor(now * 5) % 2 ? '#ff3030' : '#ffd000'; cx.lineWidth = 3; cx.beginPath(); cx.arc(p.x, p.y, 25, 0, 7); cx.stroke(); }
  });
  // smoke (dark, under additive fire)
  fx.smoke.forEach(f => { const k = f.t / f.life; cx.fillStyle = `rgba(20,20,22,${0.55 * (1 - k)})`; cx.beginPath(); cx.arc(f.x, f.y, f.r, 0, 7); cx.fill(); });
  fx.floats.forEach(f => { cx.globalAlpha = 1 - f.t / 1.8; cx.fillStyle = '#5dff8c'; cx.font = `800 17px ${FONT}`; cx.textAlign = 'center'; cx.fillText(f.txt, f.x, f.y - 50 - f.t * 28); cx.globalAlpha = 1; });
  cx.restore();

  // ---- tint for time of day (screen space)
  const tt = tint(); if (tt[3] > 0.003) { cx.fillStyle = `rgba(${tt[0] | 0},${tt[1] | 0},${tt[2] | 0},${tt[3]})`; cx.fillRect(0, 0, sw, sh); }
  // ---- additive lights (world space)
  cx.save(); cx.transform(camM.a, camM.b, camM.c, camM.d, camM.e, camM.f); cx.globalCompositeOperation = 'lighter';
  if (layers.lights && dk > 0.05) {
    cx.fillStyle = `rgba(255,236,170,${0.95 * dk})`; cx.fill(L.edge); cx.fillStyle = `rgba(255,236,170,${0.12 * dk})`; cx.fill(L.glow);
    cx.fillStyle = `rgba(60,120,255,${0.9 * dk})`; cx.fill(L.blue); cx.fillStyle = `rgba(60,120,255,${0.12 * dk})`; cx.fill(L.blueG);
    cx.fillStyle = `rgba(255,214,140,${0.85 * dk})`; cx.fill(L.win); cx.fillStyle = `rgba(255,214,140,${0.12 * dk})`; cx.save(); cx.translate(0, 2); cx.fill(L.win); cx.restore();
    const f = Math.floor(now * 16) % 20; L.app.forEach(arr => arr.forEach((d, i) => { const on = (16 - i) === f; cx.fillStyle = on ? `rgba(255,255,255,${dk})` : `rgba(255,230,160,${0.55 * dk})`; cx.beginPath(); cx.arc(d.x, d.y, on ? 3 : 1.6, 0, 7); cx.fill(); if (on) { cx.fillStyle = `rgba(255,255,255,${0.25 * dk})`; cx.beginPath(); cx.arc(d.x, d.y, 9, 0, 7); cx.fill(); } }));
  }
  G.planes.forEach(p => drawLightsOnPlane(p, now, dk));
  if (G.wx !== 'clear' || dk > 0.2) G.veh.forEach(v => glowVeh(v, now));
  else if (G.acc) G.veh.forEach(v => glowVeh(v, now));
  fx.fire.forEach(f => { const k = f.t / f.life; const g = cx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 2); g.addColorStop(0, `rgba(255,${200 - k * 120 | 0},60,${0.85 * (1 - k)})`); g.addColorStop(1, 'rgba(255,60,0,0)'); cx.fillStyle = g; cx.fillRect(f.x - f.r * 2, f.y - f.r * 2, f.r * 4, f.r * 4); });
  cx.globalCompositeOperation = 'source-over';
  fx.spray.forEach(v => { cx.strokeStyle = 'rgba(190,225,255,.7)'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(v.x, v.y); cx.quadraticCurveTo((v.x + G.acc.x) / 2, (v.y + G.acc.y) / 2 - 14 + Math.sin(now * 20) * 3, G.acc.x + Math.sin(now * 13) * 6, G.acc.y + Math.cos(now * 11) * 6); cx.stroke(); });
  cx.restore();

  // ---- weather (screen space)
  if (layers.weather) {
    if (lv.fog > 0.01) { cx.fillStyle = `rgba(205,214,218,${0.5 * lv.fog})`; cx.fillRect(0, 0, sw, sh); const g = cx.createRadialGradient(sw / 2, sh / 2, sh * 0.2, sw / 2, sh / 2, sw * 0.65); g.addColorStop(0, 'rgba(210,218,222,0)'); g.addColorStop(1, `rgba(210,218,222,${0.35 * lv.fog})`); cx.fillStyle = g; cx.fillRect(0, 0, sw, sh); }
    if (lv.rain > 0.01) { cx.strokeStyle = `rgba(185,210,255,${0.4 * lv.rain})`; cx.lineWidth = 1.1; cx.beginPath(); fx.rain.forEach(d => { cx.moveTo(d.x, d.y); cx.lineTo(d.x - 5, d.y + 16 * d.s); }); cx.stroke(); cx.fillStyle = `rgba(30,45,70,${0.12 * lv.rain})`; cx.fillRect(0, 0, sw, sh); }
    if (lv.storm > 0.2) { cx.fillStyle = `rgba(15,22,40,${0.28 * lv.storm})`; cx.fillRect(0, 0, sw, sh); }
    if (fx.flash > 0) { cx.fillStyle = `rgba(255,255,255,${0.65 * fx.flash})`; cx.fillRect(0, 0, sw, sh); }
  }
  // ---- labels
  if (layers.labels) { const ord = G.planes.filter(p => p.st !== 'gate' || p.id === G.sel).sort((a, b) => a.y - b.y); ord.forEach(p => drawLabel(p, p.id === G.sel)); }
  if (G.warn && !G.over) { cx.strokeStyle = Math.floor(now * 4) % 2 ? 'rgba(255,40,40,.8)' : 'rgba(255,40,40,.15)'; cx.lineWidth = 8; cx.strokeRect(4, 4, sw - 8, sh - 8); }
  if (G.over) { const g = cx.createRadialGradient(sw / 2, sh / 2, sh * 0.3, sw / 2, sh / 2, sw * 0.7); g.addColorStop(0, 'rgba(60,0,0,0)'); g.addColorStop(1, 'rgba(60,0,0,.45)'); cx.fillStyle = g; cx.fillRect(0, 0, sw, sh); }
  drawMini(now);
}
function drawMini(now) {
  const w = mini.width, h = mini.height, k = w / W, kh = h / H;
  mx.fillStyle = '#15361f'; mx.fillRect(0, 0, w, h);
  mx.fillStyle = '#0f4a6c'; mx.beginPath(); mx.moveTo(0, 0); for (let y = 0; y <= H; y += 20) mx.lineTo(coastX(y) * k, y * kh); mx.lineTo(0, h); mx.closePath(); mx.fill();
  mx.strokeStyle = '#555c66'; mx.lineWidth = 2; mx.beginPath(); for (const id in AP.N) for (const o of AP.N[id].adj) if (id < o) { mx.moveTo(AP.N[id].x * k, AP.N[id].y * kh); mx.lineTo(AP.N[o].x * k, AP.N[o].y * kh); } mx.stroke();
  mx.strokeStyle = '#aab2bb'; mx.lineWidth = 3.5; mx.beginPath(); AP.rw.forEach(R => { mx.moveTo(R.x0 * k, R.y * kh); mx.lineTo(R.x1 * k, R.y * kh); }); mx.stroke();
  mx.fillStyle = '#7d8896'; mx.fillRect(350 * k, 770 * kh, 900 * k, 90 * kh);
  const vp = [[0, 0], [sw, 0], [sw, sh], [0, sh]].map(([x, y]) => toWorld(x, y)); mx.strokeStyle = 'rgba(0,229,255,.8)'; mx.lineWidth = 1; mx.beginPath(); vp.forEach((p, i) => i ? mx.lineTo(p.x * k, p.y * kh) : mx.moveTo(p.x * k, p.y * kh)); mx.closePath(); mx.stroke();
  mx.font = '700 7.5px sans-serif'; mx.textBaseline = 'middle';
  G.planes.forEach(p => { if (p.st === 'gate' && p.id !== G.sel) return; const c = p.st === 'accident' || p.em ? '#ff4040' : p.al_ ? '#ff9a30' : p.air ? (p.dir === 'arr' ? '#4fd0ff' : '#5dff8c') : '#ffd84a';
    mx.save(); mx.translate(p.x * k, p.y * kh); mx.rotate(p.h); mx.fillStyle = c; mx.beginPath(); mx.moveTo(4, 0); mx.lineTo(-3, -3); mx.lineTo(-1.5, 0); mx.lineTo(-3, 3); mx.closePath(); mx.fill(); mx.restore();
    if (p.id === G.sel) { mx.strokeStyle = '#fff'; mx.beginPath(); mx.arc(p.x * k, p.y * kh, 6, 0, 7); mx.stroke(); }
    mx.fillStyle = '#e8f4ff'; mx.textAlign = 'left'; mx.fillText(p.cs, p.x * k + 6, p.y * kh); });
  G.veh.forEach(v => { mx.fillStyle = Math.floor(now * 6) % 2 ? '#f33' : '#39f'; mx.fillRect(v.x * k - 1.5, v.y * kh - 1.5, 3, 3); });
}
