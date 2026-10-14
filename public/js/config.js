// Shared constants for the 3D scene. World units: 1 unit ≈ 1.2 m. x = game x, z = game y, y = up.
export const TOWER = { x: 1345, z: 840 };
export const FL = 75;                 // cab floor height
export const EYE = FL + 1.7;          // eye height
export const CAB_R = 5.0;             // cab radius (corner radius of the 12-gon)
export const VS = 0.012;              // visual height per sim-foot
export const LOOK = { x: 800, z: 450 };
export const DESK_YAW = Math.atan2(TOWER.x - LOOK.x, TOWER.z - LOOK.z); // yaw that faces the airfield centre
export const SCR = { w: 1024, h: 576 };
export const MOBILE = matchMedia('(pointer:coarse)').matches || Math.min(screen.width, screen.height) < 700;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const coastX = y => 150 + 34 * Math.sin(y / 110) + 18 * Math.sin(y / 37 + 1);
// Merge a list of {g: BufferGeometry, m?: Matrix4, c: color hex} into one vertex-coloured, non-indexed geometry.
export function mergeParts(THREE, parts) {
  const pos = [], nor = [], col = [], c = new THREE.Color();
  for (const p of parts) {
    let g = p.g.index ? p.g.toNonIndexed() : p.g.clone(); if (p.m) g.applyMatrix4(p.m);
    const pa = g.attributes.position.array, na = g.attributes.normal.array; c.set(p.c);
    for (let i = 0; i < pa.length; i++) { pos.push(pa[i]); nor.push(na[i]); }
    for (let i = 0; i < pa.length / 3; i++) col.push(c.r, c.g, c.b);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere(); return out;
}
