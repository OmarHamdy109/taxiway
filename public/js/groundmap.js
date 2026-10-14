// Paints the flat airfield texture (grass, sea, taxiways, runways + markings, apron, stands). Buildings/trees/lights are real 3D (world.js).
import { rng, coastX } from './config.js';
export const MAP = { x: -200, y: -150, w: 2000, h: 1200 };
export function drawGround(AP, cfg, GATE_X, FS, isRw, apCode, S) {
  const { x: MX, y: MY, w: MW, h: MH } = MAP, R = rng(apCode.charCodeAt(0) * 977 + apCode.charCodeAt(1) * 31 + apCode.charCodeAt(2));
  const c = document.createElement('canvas'); c.width = MW * S; c.height = MH * S;
  const m = c.getContext('2d'); m.setTransform(S, 0, 0, S, -MX * S, -MY * S);
  m.fillStyle = '#4a8039'; m.fillRect(MX, MY, MW, MH);
  for (let y = MY; y < MY + MH; y += 44) { m.fillStyle = (y / 44) % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.035)'; m.fillRect(MX, y, MW, 44); }
  for (let i = 0; i < 160; i++) { m.fillStyle = `rgba(${R() < 0.5 ? '30,70,30' : '110,140,60'},.13)`; m.beginPath(); m.ellipse(R() * 1900, R() * 1100 - 100, 20 + R() * 90, 10 + R() * 40, R() * 3, 0, 7); m.fill(); }
  // sea + beach
  m.beginPath(); m.moveTo(MX, MY); for (let y = MY; y <= MY + MH; y += 6) m.lineTo(coastX(y), y); m.lineTo(MX, MY + MH); m.closePath();
  let gr = m.createLinearGradient(MX, 0, 170, 0); gr.addColorStop(0, '#0a4a72'); gr.addColorStop(0.7, '#157fa8'); gr.addColorStop(1, '#3ec1c9'); m.fillStyle = gr; m.fill();
  m.lineWidth = 14; m.strokeStyle = '#dccb9c'; m.lineJoin = 'round'; m.beginPath(); for (let y = MY; y <= MY + MH; y += 6) y === MY ? m.moveTo(coastX(y) + 6, y) : m.lineTo(coastX(y) + 6, y); m.stroke();
  m.lineWidth = 5; m.strokeStyle = 'rgba(255,255,255,.55)'; m.beginPath(); for (let y = MY; y <= MY + MH; y += 6) y === MY ? m.moveTo(coastX(y) - 3, y) : m.lineTo(coastX(y) - 3, y); m.stroke();
  // taxiways
  m.lineCap = 'round'; m.lineJoin = 'round';
  const edges = []; for (const id in AP.N) for (const o of AP.N[id].adj) if (id < o && !(isRw(id) && isRw(o))) edges.push([AP.N[id], AP.N[o]]);
  const strokeE = (w, col) => { m.lineWidth = w; m.strokeStyle = col; m.beginPath(); edges.forEach(([a, b]) => { m.moveTo(a.x, a.y); m.lineTo(b.x, b.y); }); m.stroke(); };
  const gx = GATE_X; m.fillStyle = '#7b8189'; m.fillRect(gx[0] - 55, 536, gx[9] - gx[0] + 110, 236);
  m.strokeStyle = 'rgba(0,0,0,.14)'; m.lineWidth = 0.8; for (let x = gx[0] - 55; x <= gx[9] + 55; x += 22.5) { m.beginPath(); m.moveTo(x, 536); m.lineTo(x, 772); m.stroke(); }
  for (let y = 536; y <= 772; y += 22.5) { m.beginPath(); m.moveTo(gx[0] - 55, y); m.lineTo(gx[9] + 55, y); m.stroke(); }
  strokeE(27, '#4d525a'); strokeE(25, '#555a62'); strokeE(1.8, '#e8c33a');
  // runways
  AP.rw.forEach(Rw => {
    const x0 = Rw.x0, x1 = Rw.x1, y = Rw.y;
    m.fillStyle = '#2b2f35'; m.fillRect(x0 - 6, y - 28, x1 - x0 + 12, 56);
    for (let i = 0; i < 1400; i++) { m.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.08)'; m.fillRect(x0 + R() * (x1 - x0), y - 27 + R() * 54, 2 + R() * 6, 1 + R() * 2); }
    for (const [tx, d] of [[x0, 1], [x1, -1]]) { m.fillStyle = 'rgba(8,8,8,.45)'; for (let k = 0; k < 4; k++) { m.beginPath(); m.ellipse(tx + d * (90 + k * 12), y + (k % 2 ? -8 : 9), 28, 5, 0, 0, 7); m.fill(); } }
    m.fillStyle = '#eceff1'; m.fillRect(x0 - 6, y - 27, x1 - x0 + 12, 1.8); m.fillRect(x0 - 6, y + 25.2, x1 - x0 + 12, 1.8);
    for (let x = x0 + 120; x < x1 - 120; x += 44) m.fillRect(x, y - 1.2, 26, 2.4);
    for (const [tx, d] of [[x0, 1], [x1, -1]]) {
      for (let k = 0; k < 8; k++) { const yy = y - 22 + k * 6.2 + (k > 3 ? 3 : 0); m.fillRect(tx + d * 10 - (d < 0 ? 22 : 0), yy, 22, 3.2); }
      m.fillRect(tx + d * 68 - 2, y - 24, 4, 48);
      for (const off of [150, 300]) { m.fillRect(tx + d * off - 7, y - 16, 14, 3); m.fillRect(tx + d * off - 7, y - 10, 14, 3); m.fillRect(tx + d * off - 7, y + 7, 14, 3); m.fillRect(tx + d * off - 7, y + 13, 14, 3); }
      m.fillRect(tx + d * 400 - 16, y - 6, 32, 3); m.fillRect(tx + d * 400 - 16, y + 3, 32, 3);
    }
    m.fillStyle = '#eceff1'; m.font = 'bold 24px sans-serif'; m.textAlign = 'center'; m.textBaseline = 'middle';
    for (const [tx, d, nm] of [[x0, 1, Rw.names[0]], [x1, -1, Rw.names[1]]]) {
      m.save(); m.translate(tx + d * 50, y); m.rotate(d > 0 ? Math.PI / 2 : -Math.PI / 2); m.fillText(nm.slice(0, 2), 0, 0); if (nm.slice(2)) m.fillText(nm.slice(2), 0, 24); m.restore();
    }
  });
  AP.rw.forEach(Rw => ['a', 'b'].forEach(s => { const n = AP.N['R' + Rw.i + s];
    n.adj.filter(a => !isRw(a)).forEach(a => { const dir = Math.sign(AP.N[a].y - n.y), y = n.y + dir * 36;
      m.strokeStyle = '#e8c33a'; m.lineWidth = 1.4; for (let k = 0; k < 4; k++) { m.setLineDash(k < 2 ? [] : [3, 3]); m.beginPath(); m.moveTo(n.x - 11, y + dir * k * 3.2); m.lineTo(n.x + 11, y + dir * k * 3.2); m.stroke(); } m.setLineDash([]); }); }));
  AP.gates.forEach(g => {
    m.fillStyle = g.open ? '#8a9098' : '#6d737b'; m.fillRect(g.x - 40, 600, 80, 128);
    m.strokeStyle = 'rgba(0,0,0,.2)'; m.lineWidth = 1; m.strokeRect(g.x - 40, 600, 80, 128);
    if (g.open) { m.strokeStyle = '#e8c33a'; m.lineWidth = 1.6; m.beginPath(); m.moveTo(g.x, 566); m.lineTo(g.x, 668); m.stroke(); m.strokeRect(g.x - 3, 662, 6, 8);
      m.fillStyle = '#e8c33a'; m.font = 'bold 16px sans-serif'; m.textAlign = 'center'; m.fillText(g.i + 1, g.x + 26, 740); }
    else { m.strokeStyle = 'rgba(255,255,255,.12)'; m.lineWidth = 1; m.setLineDash([5, 5]); m.strokeRect(g.x - 38, 604, 76, 120); m.setLineDash([]); }
  });
  const tx0 = gx[0] - 55, tw = gx[9] - gx[0] + 110;
  m.fillStyle = '#7a8087'; m.fillRect(tx0 - 20, 772, tw + 40, 108); // forecourt under terminal
  m.fillStyle = '#e8c33a'; m.fillRect(tx0 - 6, 750, tw + 12, 1.5);
  m.fillStyle = '#4a4f57'; m.fillRect(120, 872, 1480, 22); m.strokeStyle = '#e8e8e8'; m.setLineDash([14, 12]); m.lineWidth = 1.5; m.beginPath(); m.moveTo(120, 883); m.lineTo(1600, 883); m.stroke(); m.setLineDash([]);
  m.fillStyle = '#5b6068'; m.fillRect(190, 770, 140, 96); m.strokeStyle = '#ddd'; m.lineWidth = 1; for (let x = 190; x <= 330; x += 14) { m.beginPath(); m.moveTo(x, 770); m.lineTo(x, 866); m.stroke(); }
  // paved pads (fire station, hangars)
  m.fillStyle = '#6a6f77'; m.fillRect(FS.x - 50, FS.y - 44, 100, 90); m.fillRect(1380, 450, 220, 170);
  return { canvas: c, edges };
}
