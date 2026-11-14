// Low-poly Bangkok traffic vehicles (no real brands). Car space: +x front, +y up, +z right.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const lightMats = {
  head: new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff6d8', emissiveIntensity: 0.2 }),
  tail: new THREE.MeshStandardMaterial({ color: '#7a0a0a', emissive: '#ff2020', emissiveIntensity: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: '#141a20', metalness: 0.6, roughness: 0.15 }),
  black: new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8 }),
  tire: new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: '#b9bdc2', metalness: 0.8, roughness: 0.35 }),
  taxiSign: new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ffb000', emissiveIntensity: 0.55 }),
};

// side profile [x,y] (front at +x) extruded across width
const PROFILES = {
  sedan: { L: 4.5, W: 1.72, wheelR: 0.31, wb: 2.6, body: [[-2.25, 0.32], [2.25, 0.32], [2.27, 0.62], [2.1, 0.78], [1.0, 0.86], [0.45, 1.4], [-0.75, 1.42], [-1.55, 0.98], [-2.2, 0.92], [-2.27, 0.6]], glass: [[0.86, 0.9], [0.4, 1.33], [-0.72, 1.35], [-1.38, 0.97]] },
  kei: { L: 3.8, W: 1.58, wheelR: 0.28, wb: 2.45, body: [[-1.9, 0.3], [1.9, 0.3], [1.92, 0.68], [1.7, 0.88], [1.1, 0.98], [0.65, 1.56], [-1.65, 1.58], [-1.9, 1.05]], glass: [[1.05, 1.02], [0.62, 1.48], [-1.48, 1.5], [-1.65, 1.05]] },
  van: { L: 4.9, W: 1.82, wheelR: 0.32, wb: 2.9, body: [[-2.45, 0.32], [2.45, 0.32], [2.47, 0.72], [2.22, 0.98], [1.55, 1.18], [0.95, 1.94], [-2.35, 1.96], [-2.45, 1.02]], glass: [[1.45, 1.22], [0.9, 1.84], [-2.18, 1.86], [-2.28, 1.26]] },
  truck: { L: 5.1, W: 1.78, wheelR: 0.33, wb: 2.85, body: [[-2.55, 0.38], [2.55, 0.38], [2.57, 0.82], [2.35, 0.96], [1.45, 1.02], [0.95, 1.78], [-0.15, 1.8], [-0.2, 0.96], [-2.55, 0.96]], glass: [[1.38, 1.06], [0.92, 1.7], [-0.08, 1.72], [-0.1, 1.06]], cargo: true },
};
PROFILES.taxi = PROFILES.sedan;

function extrudeProfile(pts, width) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  return g;
}

const cache = new Map();
function parts(type) {
  if (cache.has(type)) return cache.get(type);
  const p = PROFILES[type];
  const body = extrudeProfile(p.body, p.W - 0.08);
  const glass = extrudeProfile(p.glass, p.W - 0.02);
  const head = new THREE.BoxGeometry(0.06, 0.12, 0.34);
  const heads = mergeGeometries([head.clone().translate(p.L / 2 + 0.01, 0.62, p.W / 2 - 0.3), head.clone().translate(p.L / 2 + 0.01, 0.62, -p.W / 2 + 0.3)]);
  const tails = mergeGeometries([head.clone().translate(-p.L / 2 - 0.01, 0.72, p.W / 2 - 0.25), head.clone().translate(-p.L / 2 - 0.01, 0.72, -p.W / 2 + 0.25)]);
  const tireG = new THREE.CylinderGeometry(p.wheelR, p.wheelR, 0.2, 14).rotateX(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(p.wheelR * 0.62, p.wheelR * 0.62, 0.21, 10).rotateX(Math.PI / 2);
  const wpos = [[p.wb / 2, p.W / 2 - 0.12], [p.wb / 2, -p.W / 2 + 0.12], [-p.wb / 2, p.W / 2 - 0.12], [-p.wb / 2, -p.W / 2 + 0.12]];
  const tires = mergeGeometries(wpos.map(([x, z]) => tireG.clone().translate(x, p.wheelR, z)));
  const rims = mergeGeometries(wpos.map(([x, z]) => rimG.clone().translate(x, p.wheelR, z)));
  const under = new THREE.BoxGeometry(p.L * 0.9, 0.12, p.W * 0.9).translate(0, 0.3, 0);
  const out = { p, body, glass, heads, tails, tires, rims, under };
  if (type === 'taxi') {
    out.sign = new THREE.BoxGeometry(0.46, 0.18, 0.62).translate(-0.1, 1.5, 0);
    out.roofCap = new THREE.BoxGeometry(1.15, 0.08, p.W - 0.24).translate(-0.15, 1.4, 0);
  }
  if (p.cargo) out.cargo = new THREE.BoxGeometry(2.35, 1.45, p.W - 0.02).translate(-1.35, 1.42, 0);
  cache.set(type, out);
  return out;
}

const PAINTS = ['#f4f4f6', '#e2e5e9', '#c8ccd2', '#1b1d21', '#2c3038', '#7d838c', '#b91c1c', '#1d4ed8', '#0f766e', '#d97706', '#e5dec9'];
// Iconic Bangkok Taxi colors: Green-Yellow, Hot Pink, Blue-Red, Orange, Yellow
const BKK_TAXI = [
  ['#16a34a', '#facc15'], // เขียว-เหลือง (Green body, Yellow roof)
  ['#ec4899', '#ec4899'], // ชมพู (Pink taxi)
  ['#facc15', '#16a34a'], // เหลือง-เขียว
  ['#2563eb', '#dc2626'], // น้ำเงิน-แดง
  ['#f97316', '#f97316'], // ส้ม
];

export function makeVehicle(type, rand) {
  const P = parts(type);
  let color = PAINTS[Math.floor(rand() * PAINTS.length)];
  let roofCol = null;
  if (type === 'taxi') {
    const tk = BKK_TAXI[Math.floor(rand() * BKK_TAXI.length)];
    color = tk[0]; roofCol = tk[1];
  } else if (type === 'van') {
    color = rand() < 0.7 ? '#f1f5f9' : '#cbd5e1'; // รถตู้ขาว/บรอนซ์เงิน
  }
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.36 });
  const g = new THREE.Group();
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
  add(P.body, paint); add(P.glass, lightMats.glass); add(P.heads, lightMats.head); add(P.tails, lightMats.tail);
  add(P.tires, lightMats.tire); add(P.rims, lightMats.rim); add(P.under, lightMats.black);
  if (P.roofCap && roofCol) add(P.roofCap, new THREE.MeshStandardMaterial({ color: roofCol, metalness: 0.4, roughness: 0.38 }));
  if (P.sign) add(P.sign, lightMats.taxiSign);
  if (P.cargo) add(P.cargo, new THREE.MeshStandardMaterial({ color: rand() < 0.7 ? '#d8dde3' : '#94a3b8', metalness: 0.5, roughness: 0.45 }));
  g.userData = { L: P.p.L, W: P.p.W, type };
  return g;
}
export const VEHICLE_TYPES = ['sedan', 'sedan', 'taxi', 'taxi', 'van', 'truck', 'kei', 'sedan'];
