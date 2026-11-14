// Mountain pass (峠 touge) west of the city: a 3.6 km closed loop climbing to ~65 m,
// hairpins, Japanese white guardrails, cut/fill terrain, pine forest. The loop meets the
// city's west gate through a short connector, so it is part of free roam and a race track.
import * as THREE from 'three';
import * as TX from './textures.js';

// control points [x, z, y] — closed loop, first point sits next to the city gate
const CTRL = [
  [-590, 0, 0], [-600, -150, 0], [-660, -300, 3], [-800, -420, 10], [-960, -470, 18], [-1080, -400, 24],
  [-1060, -300, 30], [-960, -262, 34], [-942, -182, 38], [-1080, -140, 44], [-1240, -200, 50], [-1380, -160, 57],
  [-1460, -20, 63], [-1420, 140, 65], [-1300, 222, 61], [-1180, 160, 56], [-1100, 262, 50], [-1180, 362, 44],
  [-1060, 442, 36], [-900, 420, 28], [-820, 322, 20], [-720, 382, 12], [-640, 282, 5], [-600, 140, 0],
];
export const TOUGE = { width: 9, step: 2, gate: { x: -560, z: 0 }, area: { x0: -2000, x1: -560, z0: -1000, z1: 1000 } };
const HALF = TOUGE.width / 2, RAIL = HALF + 0.9;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// natural ground: rises west of the city, rolling ridges
function natural(x, z) {
  const west = smooth(-580, -900, x);
  let n = 0, amp = 1, f = 1 / 260;
  for (let o = 0; o < 4; o++) { n += vnoise(x * f, z * f) * amp; amp *= 0.5; f *= 2.1; }
  return west * (8 + n * 70 + smooth(-900, -1500, x) * 25);
}

// Road centreline sampled every `step` metres: { x, y, z, tx, tz (unit tangent), s (arc length) }
export function buildPath() {
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z, y]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  const len = curve.getLength();
  const n = Math.round(len / TOUGE.step);
  const pts = curve.getSpacedPoints(n).slice(0, n);
  const out = pts.map((p, i) => ({ x: p.x, y: p.y, z: p.z, s: (i / n) * len }));
  for (let i = 0; i < n; i++) {
    const a = out[(i - 1 + n) % n], b = out[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    out[i].tx = dx / l; out[i].tz = dz / l;
  }
  out.len = len;
  return out;
}

export class Touge {
  constructor(city, { trees = 1 } = {}) {
    this.city = city;
    this.group = new THREE.Group();
    this.path = buildPath();
    this.hashPath();
    this.buildTerrain();
    this.buildRoad();
    this.buildRails();
    if (trees > 0) this.buildTrees(trees);
    this.addSurface();
  }

  // spatial hash of road samples for nearest-road queries
  hashPath() {
    const C = 24, grid = new Map();
    this.path.forEach((p, i) => {
      const k = Math.floor(p.x / C) + ',' + Math.floor(p.z / C);
      let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i);
    });
    this.grid = grid; this.C = C;
  }
  nearest(x, z, maxD = 60) {
    const C = this.C, r = Math.ceil(maxD / C);
    const ci = Math.floor(x / C), cj = Math.floor(z / C);
    let best = -1, bd = maxD * maxD;
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const a = this.grid.get(i + ',' + j); if (!a) continue;
      for (const k of a) { const p = this.path[k], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = k; } }
    }
    return best < 0 ? null : { i: best, d: Math.sqrt(bd) };
  }
  // exact height on the road surface (projected onto the segment) or null if off-road
  roadHeight(x, z) {
    const nb = this.nearest(x, z, 12);
    if (!nb) return null;
    const P = this.path, n = P.length, p = P[nb.i];
    const q = P[(nb.i + 1) % n], o = P[(nb.i - 1 + n) % n];
    const t = (x - p.x) * p.tx + (z - p.z) * p.tz;
    const lat = Math.abs(-(x - p.x) * p.tz + (z - p.z) * p.tx);
    if (lat > HALF + 1.2) return null;
    const r = t >= 0 ? q : o, f = Math.min(1, Math.abs(t) / TOUGE.step);
    return p.y + (r.y - p.y) * f;
  }

  buildTerrain() {
    const A = TOUGE.area, S = 10;
    const nx = Math.round((A.x1 - A.x0) / S) + 1, nz = Math.round((A.z1 - A.z0) / S) + 1;
    const H = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = A.x0 + i * S, z = A.z0 + j * S;
      let h = natural(x, z);
      const nb = this.nearest(x, z, 70);
      if (nb) {
        const ry = this.path[nb.i].y - 0.45;
        h = ry + (h - ry) * smooth(HALF + 3, 48, nb.d); // cut / fill around the road
      }
      if (x > A.x1 - 40 && Math.abs(z) < 30) h = Math.min(h, -0.05); // flat at the gate
      H[j * nx + i] = Math.max(-0.05, h);
    }
    this.terrain = { H, nx, nz, S, A };
    const geo = new THREE.PlaneGeometry(A.x1 - A.x0, A.z1 - A.z0, nx - 1, nz - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((A.x0 + A.x1) / 2, 0, (A.z0 + A.z1) / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let k = 0; k < pos.count; k++) {
      const i = Math.round((pos.getX(k) - A.x0) / S), j = Math.round((pos.getZ(k) - A.z0) / S);
      pos.setY(k, H[j * nx + i]);
      uv.setXY(k, pos.getX(k) / 6, pos.getZ(k) / 6);
    }
    geo.computeVertexNormals();
    // colour by slope: grass on gentle ground, earth/rock on steep cuts
    const nrm = geo.attributes.normal, col = new Float32Array(pos.count * 3);
    const grass = new THREE.Color('#ffffff'), rock = new THREE.Color('#a08f7c'), c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const steep = smooth(0.92, 0.72, nrm.getY(k));
      c.copy(grass).lerp(rock, steep).multiplyScalar(0.85 + hash(pos.getX(k), pos.getZ(k)) * 0.2);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ map: TX.grassTexture(), vertexColors: true, roughness: 1 });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    this.group.add(m);
  }
  terrainHeight(x, z) {
    const T = this.terrain, A = T.A;
    if (x < A.x0 || x > A.x1 || z < A.z0 || z > A.z1) return null;
    const fx = (x - A.x0) / T.S, fz = (z - A.z0) / T.S;
    const i = Math.min(T.nx - 2, Math.floor(fx)), j = Math.min(T.nz - 2, Math.floor(fz));
    const u = fx - i, v = fz - j, H = T.H, nx = T.nx;
    // matches the mesh's triangle split (PlaneGeometry: a=(i,j) b=(i,j+1) c=(i+1,j+1) d=(i+1,j))
    const a = H[j * nx + i], b = H[(j + 1) * nx + i], c = H[(j + 1) * nx + i + 1], d = H[j * nx + i + 1];
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
  }

  buildRoad() {
    const P = this.path, n = P.length;
    const pos = [], uv = [], idx = [], skirt = [], sIdx = [];
    let v = 0;
    for (let i = 0; i <= n; i++) {
      const p = P[i % n], lx = -p.tz, lz = p.tx; // left normal (x,z)
      pos.push(p.x + lx * HALF, p.y + 0.02, p.z + lz * HALF, p.x - lx * HALF, p.y + 0.02, p.z - lz * HALF);
      uv.push(0, v, 1, v);
      v += TOUGE.step / 12;
      if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      // concrete skirt below both edges (hides gaps where the road is on a fill)
      for (const sgn of [1, -1]) {
        const ex = p.x + lx * (HALF + 0.05) * sgn, ez = p.z + lz * (HALF + 0.05) * sgn;
        skirt.push(ex, p.y + 0.02, ez, ex, p.y - 3, ez);
      }
      if (i < n) { const k = i * 4; sIdx.push(k, k + 1, k + 4, k + 1, k + 5, k + 4, k + 2, k + 6, k + 3, k + 3, k + 6, k + 7); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.88 });
    const road = new THREE.Mesh(g, mat); road.receiveShadow = true;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(skirt, 3)); sg.setIndex(sIdx); sg.computeVertexNormals();
    const sk = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: '#8f8d88', roughness: 0.95, side: THREE.DoubleSide }));
    // connector from the city gate to the loop
    const cg = new THREE.PlaneGeometry(34, 12).rotateX(-Math.PI / 2).translate(-577, 0.012, 0);
    const cuv = cg.attributes.uv; for (let k = 0; k < cuv.count; k++) cuv.setXY(k, cuv.getX(k) * 8, cuv.getY(k) * 3);
    const conn = new THREE.Mesh(cg, this.city.M.asphalt); conn.receiveShadow = true;
    this.group.add(road, sk, conn);
    this.roadMat = mat;
  }

  buildRails() {
    const P = this.path, n = P.length, cl = this.city.colliders;
    const beam = [], bIdx = [], posts = [];
    const gap = (p) => p.x > -605 && Math.abs(p.z) < 8; // opening towards the city gate (east side)
    for (const sgn of [1, -1]) {
      let k0 = -1, prev = null;
      for (let i = 0; i <= n; i++) {
        const p = P[i % n], lx = -p.tz * sgn, lz = p.tx * sgn;
        const x = p.x + lx * RAIL, z = p.z + lz * RAIL;
        const open = gap(p) && lx > 0.5;
        if (open) { k0 = -1; prev = null; continue; }
        const base = beam.length / 3;
        beam.push(x, p.y + 0.45, z, x, p.y + 0.82, z);
        if (k0 >= 0) bIdx.push(k0, k0 + 1, base, k0 + 1, base + 1, base);
        k0 = base;
        if (i % 2 === 0) posts.push([x, p.y, z]);
        if (prev && i % 2 === 0) { cl.addSegment(prev[0], prev[1], x, z, p.y - 6, p.y + 1.6, 0.2); prev = [x, z]; }
        else if (!prev) prev = [x, z];
      }
    }
    // west wall of the city with an opening for the connector
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(beam, 3)); g.setIndex(bIdx); g.computeVertexNormals();
    const white = new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide });
    const rail = new THREE.Mesh(g, white); rail.castShadow = false;
    const postM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.95, 6).translate(0, 0.47, 0), white, posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach((p, k) => postM.setMatrixAt(k, m4.makeTranslation(p[0], p[1], p[2])));
    // reflector delineators every ~20 m on the outside of curves
    this.group.add(rail, postM);
  }

  buildTrees(density) {
    const T = this.terrain, A = T.A, r = TX.rng(4242);
    const list = [];
    const want = Math.round(2600 * density);
    for (let tries = 0; list.length < want && tries < want * 6; tries++) {
      const x = A.x0 + r() * (A.x1 - A.x0 - 30), z = A.z0 + r() * (A.z1 - A.z0);
      const nb = this.nearest(x, z, 14);
      if (nb && nb.d < 11) continue;
      if (x > -640 && Math.abs(z) < 40) continue;
      const h = this.terrainHeight(x, z);
      // fewer trees on gentle low fields, denser forest up the slopes
      if (h < 6 && r() < 0.6) continue;
      list.push([x, h, z, 0.75 + r() * 0.8]);
    }
    const trunk = new THREE.CylinderGeometry(0.18, 0.26, 3, 5).translate(0, 1.5, 0);
    const crown = new THREE.ConeGeometry(2.1, 7.5, 7).translate(0, 6.2, 0);
    const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#4d3a2b', roughness: 1 }), list.length);
    const cm = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    list.forEach(([x, y, z, k], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), x * 1.7);
      m4.compose(p.set(x, y - 0.2, z), q, s.set(k, k * (0.9 + (i % 5) * 0.06), k));
      tm.setMatrixAt(i, m4); cm.setMatrixAt(i, m4);
      cm.setColorAt(i, c.setHSL(0.3 + (i % 7) * 0.012, 0.42, 0.17 + (i % 9) * 0.012));
      if (r() < 0.06) { cm.setColorAt(i, c.setHSL(0.08, 0.45, 0.3)); } // a few autumn trees
    });
    tm.castShadow = cm.castShadow = false; cm.receiveShadow = true;
    this.group.add(tm, cm);
  }

  // drivable heights: road when on it, terrain elsewhere in the touge area
  addSurface() {
    this.city.surfaces.addFn((x, z) => {
      if (x > TOUGE.area.x1 + 1) return null;
      const r = this.roadHeight(x, z);
      if (r !== null) return r;
      return this.terrainHeight(x, z);
    });
  }
}

// Japanese two-lane mountain road: worn asphalt, white edge lines, yellow centre (no overtaking),
// darker tyre paths. u = across the road (0..1), v repeats every 12 m.
function roadTexture() {
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#505257'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) { const v = 52 + Math.random() * 50; g.fillStyle = `rgba(${v},${v},${v + 3},0.7)`; g.fillRect(Math.random() * W, Math.random() * H, 1.3, 1.3); }
  // tyre paths
  for (const u of [0.17, 0.33, 0.67, 0.83]) { const gr = g.createLinearGradient((u - 0.06) * W, 0, (u + 0.06) * W, 0); gr.addColorStop(0, 'rgba(20,20,22,0)'); gr.addColorStop(0.5, 'rgba(20,20,22,0.22)'); gr.addColorStop(1, 'rgba(20,20,22,0)'); g.fillStyle = gr; g.fillRect((u - 0.06) * W, 0, 0.12 * W, H); }
  // patches & cracks
  for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(30,30,33,${0.15 + Math.random() * 0.15})`; g.fillRect(Math.random() * W * 0.8, Math.random() * H, 20 + Math.random() * 50, 30 + Math.random() * 80); }
  g.strokeStyle = 'rgba(25,25,28,0.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) { g.beginPath(); let x = Math.random() * W, y = Math.random() * H; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 30; g.lineTo(x, y); } g.stroke(); }
  // lines
  g.fillStyle = '#e9e9e4'; g.fillRect(W * 0.035, 0, W * 0.022, H); g.fillRect(W * 0.943, 0, W * 0.022, H);
  g.fillStyle = '#e8b524'; g.fillRect(W * 0.488, 0, W * 0.024, H);
  // worn paint
  for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(80,82,86,0.6)'; const x = [0.035, 0.943, 0.488][i % 3] * W + Math.random() * 6; g.fillRect(x, Math.random() * H, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
