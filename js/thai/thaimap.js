// Optional real-Thailand map layer (OpenStreetMap derived), streamed in chunks.
//   const tm = new ThaiMap(scene, {quality: 1}); await tm.load('data/');
//   per frame: tm.update(camera.position, dt)
// Coordinates: x east, z south (metres), origin lat0=13.7580 lon0=100.5650.
import * as THREE from 'three';
import {
  Geo, addRoadRibbon, roadTexKey, makeRoadTexture, roadWidth, laneCount, roadY,
  ELEV_CLASSES, ELEV_H, elevAt, isMinor,
} from './roadmesh.js';

export const ORIGIN = { lat: 13.7580, lon: 100.5650 };
export function project(lat, lon) {
  return [(lon - ORIGIN.lon) * 111320 * Math.cos(ORIGIN.lat * Math.PI / 180), -(lat - ORIGIN.lat) * 110574];
}

const LOCAL_CELL = 500, COARSE_CELL = 5000;
const QUALITY = [
  { local: 900, coarse: 8000, bld: true, aniso: 2 },
  { local: 1200, coarse: 12000, bld: true, aniso: 4 },
  { local: 1500, coarse: 15000, bld: true, aniso: 8 },
];
const ck = (cx, cz) => (cx + 20000) * 40000 + (cz + 20000);

// ------------------------------------------------------------- preprocessing
function prepRoads(roads, cellSize, local) {
  const cells = new Map();
  for (let ri = 0; ri < roads.length; ri++) {
    const r = roads[ri], p = r.p;
    const n = p ? p.length >> 1 : 0;
    r.i = ri;
    if (n < 2 || (local && r.t)) { r.skip = true; continue; }
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
    r.cum = cum; r.total = cum[n - 1];
    r.elev = local && !!r.b && ELEV_CLASSES.has(r.c);
    let start = 0, cur = null;
    for (let i = 0; i < n - 1; i++) {
      const mx = (p[i * 2] + p[i * 2 + 2]) / 2, mz = (p[i * 2 + 1] + p[i * 2 + 3]) / 2;
      const key = ck(Math.floor(mx / cellSize), Math.floor(mz / cellSize));
      if (cur !== key) {
        if (cur !== null) push(cells, cur, [ri, start, i]);
        cur = key; start = i;
      }
    }
    push(cells, cur, [ri, start, n - 1]);
  }
  if (local) markRamps(roads);
  return cells;
}
function push(m, k, v) { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }

/** Elevated roads whose end point is not shared with another elevated road ramp down to ground. */
function markRamps(roads) {
  const cnt = new Map();
  const key = (x, z) => Math.round(x / 2) + ',' + Math.round(z / 2);
  const ends = [];
  for (const r of roads) {
    if (!r.elev) continue;
    const p = r.p, n = p.length >> 1;
    const k0 = key(p[0], p[1]), k1 = key(p[n * 2 - 2], p[n * 2 - 1]);
    ends.push([r, k0, k1]);
    cnt.set(k0, (cnt.get(k0) || 0) + 1); cnt.set(k1, (cnt.get(k1) || 0) + 1);
  }
  for (const [r, k0, k1] of ends) { r.r0 = cnt.get(k0) === 1; r.r1 = cnt.get(k1) === 1; }
}

function segIndex(roads, cell, step) {
  const g = new Map();
  for (const r of roads) {
    if (r.skip) continue;
    const p = r.p, n = p.length >> 1;
    for (let i = 0; i < n - 1; i++) {
      const x0 = p[i * 2], z0 = p[i * 2 + 1], x1 = p[i * 2 + 2], z1 = p[i * 2 + 3];
      const L = Math.hypot(x1 - x0, z1 - z0), s = Math.max(1, Math.ceil(L / step));
      let last = -1;
      for (let k = 0; k <= s; k++) {
        const t = k / s;
        const key = ck(Math.floor((x0 + (x1 - x0) * t) / cell), Math.floor((z0 + (z1 - z0) * t) / cell));
        if (key !== last) { let a = g.get(key); if (!a) { a = []; g.set(key, a); } a.push(r.i, i); last = key; }
      }
    }
  }
  return g;
}

// ------------------------------------------------------------- chunk layer
class Layer {
  constructor(cellSize, radius, build) {
    this.cell = cellSize; this.radius = radius; this.build = build;
    this.chunks = new Map(); this.queue = []; this.has = new Set();
    this.group = new THREE.Group();
  }
  plan(x, z) {
    const c = this.cell, R = this.radius, n = Math.ceil(R / c) + 1;
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    const want = [];
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const gx = cx + i, gz = cz + j;
      const k = ck(gx, gz);
      if (!this.has.has(k)) continue;
      // distance from camera to cell rectangle
      const dx = Math.max(gx * c - x, 0, x - (gx + 1) * c), dz = Math.max(gz * c - z, 0, z - (gz + 1) * c);
      const d = Math.hypot(dx, dz);
      if (d <= R) want.push({ k, gx, gz, d });
    }
    want.sort((a, b) => a.d - b.d);
    this.queue = want.filter(w => !this.chunks.has(w.k));
    // unload far chunks (hysteresis one cell)
    for (const [k, ch] of this.chunks) {
      const dx = Math.max(ch.gx * c - x, 0, x - (ch.gx + 1) * c), dz = Math.max(ch.gz * c - z, 0, z - (ch.gz + 1) * c);
      if (Math.hypot(dx, dz) > R + c) this.drop(k);
    }
  }
  buildNext() {
    const w = this.queue.shift();
    if (!w || this.chunks.has(w.k)) return !!w;
    const g = this.build(w.gx, w.gz);
    const ch = { gx: w.gx, gz: w.gz, g };
    if (g) this.group.add(g);
    this.chunks.set(w.k, ch);
    return true;
  }
  drop(k) {
    const ch = this.chunks.get(k); if (!ch) return;
    if (ch.g) { this.group.remove(ch.g); ch.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.chunks.delete(k);
  }
  clear() { for (const k of [...this.chunks.keys()]) this.drop(k); this.queue = []; }
}

// ------------------------------------------------------------- textures
function windowTextures() {
  const S = 32, N = 4, W = S * N;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = W; return c; };
  const a = mk(), e = mk(), ga = a.getContext('2d'), ge = e.getContext('2d');
  ga.fillStyle = '#d9d9d6'; ga.fillRect(0, 0, W, W);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, W);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = i * S + 6, y = j * S + 7;
    ga.fillStyle = '#2d3d52'; ga.fillRect(x, y, S - 12, S - 16);
    ga.fillStyle = 'rgba(255,255,255,0.35)'; ga.fillRect(x, y, S - 12, 2);
    if (Math.random() < 0.55) {
      ge.fillStyle = Math.random() < 0.7 ? '#ffd88a' : '#bfe2ff';
      ge.fillRect(x, y, S - 12, S - 16);
    }
  }
  const t = (c, srgb) => {
    const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    if (srgb) tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
  };
  return { map: t(a, true), emissive: t(e, true) };
}
const PALETTE = [[0.9, 0.88, 0.84], [0.8, 0.8, 0.82], [0.95, 0.9, 0.78], [0.72, 0.76, 0.82], [0.88, 0.8, 0.76], [0.65, 0.65, 0.68], [0.92, 0.92, 0.92]];

// ------------------------------------------------------------- ThaiMap
export class ThaiMap {
  constructor(scene, opts = {}) {
    let q = opts.quality;
    if (typeof q === 'string') q = { low: 0, medium: 1, med: 1, high: 2 }[q] ?? 1;
    this.q = QUALITY[Math.max(0, Math.min(2, q == null ? 1 : q | 0))];
    this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'ThaiMap';
    scene.add(this.group);
    this.local = null; this.country = null;     // {roads, cells}
    this.buildings = []; this.water = [];
    this.bCells = new Map(); this.wCells = new Map();
    this.localIdx = null; this.countryIdx = null;
    this.localBox = null;
    this.loaded = false; this.night = 0;
    this.roadMats = new Map();
    this._cam = new THREE.Vector3(1e9, 0, 1e9);
    this._lastPlan = [1e9, 1e9];
    this._makeMaterials();
    this._makeGround();
    this.localLayer = new Layer(LOCAL_CELL, this.q.local, (x, z) => this._buildLocal(x, z));
    this.coarseLayer = new Layer(COARSE_CELL, this.q.coarse, (x, z) => this._buildCoarse(x, z));
    this.group.add(this.localLayer.group, this.coarseLayer.group);
    this.stats = { chunks: 0, lastBuildMs: 0 };
  }

  get hasData() { return !!(this.local || this.country); }

  _makeMaterials() {
    const poly = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    this.concreteMat = new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.95, side: THREE.DoubleSide });
    this.coarseMat = new THREE.MeshStandardMaterial({ color: 0x35353a, roughness: 0.95, ...poly });
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x2f6f9a, roughness: 0.25, metalness: 0.1, ...poly });
    const tex = windowTextures();
    this.winTex = tex;
    this.bldMat = new THREE.MeshStandardMaterial({
      map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: 0,
      vertexColors: true, roughness: 0.85, metalness: 0.05,
    });
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0x5f6a55, roughness: 1 });
  }
  _roadMat(key) {
    let m = this.roadMats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        map: makeRoadTexture(key, this.q.aniso), roughness: 0.92, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      this.roadMats.set(key, m);
    }
    return m;
  }
  _makeGround() {
    const g = new THREE.PlaneGeometry(40000, 40000); g.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(g, this.groundMat);
    this.ground.position.y = -0.1; this.ground.receiveShadow = true; this.ground.frustumCulled = false;
    this.group.add(this.ground);
  }

  /** Load data files (each optional). Returns {local, country}. */
  async load(baseUrl = 'data/') {
    const get = async (f) => {
      try { const r = await fetch(baseUrl + f); if (!r.ok) return null; return await r.json(); }
      catch (e) { console.warn('[ThaiMap] cannot load', f, e); return null; }
    };
    const [th, bkk] = await Promise.all([get('th-roads.json'), get('bkk-local.json')]);
    if (bkk && bkk.roads) {
      this.local = { roads: bkk.roads, cells: prepRoads(bkk.roads, LOCAL_CELL, true) };
      for (const k of this.local.cells.keys()) this.localLayer.has.add(k);
      this.localIdx = segIndex(bkk.roads, 40, 20);
      let x0 = 1e12, z0 = 1e12, x1 = -1e12, z1 = -1e12;
      for (const r of bkk.roads) { if (r.skip) continue; const p = r.p; for (let i = 0; i < p.length; i += 2) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1]; } }
      if (x1 > x0) this.localBox = [x0, z0, x1, z1];
      this.buildings = bkk.buildings || []; this.water = bkk.water || [];
      this._indexBuildings(); this._indexWater();
    }
    if (th && th.roads) {
      this.country = { roads: th.roads, cells: prepRoads(th.roads, COARSE_CELL, false) };
      for (const k of this.country.cells.keys()) this.coarseLayer.has.add(k);
      this.countryIdx = segIndex(th.roads, 200, 100);
    }
    this.loaded = true;
    this._lastPlan = [1e9, 1e9];
    return { local: !!this.local, country: !!this.country };
  }

  _indexBuildings() {
    this.buildings.forEach((b, i) => {
      const p = b.p; if (!p || p.length < 6) return;
      let sx = 0, sz = 0; const n = p.length >> 1;
      for (let k = 0; k < n; k++) { sx += p[k * 2]; sz += p[k * 2 + 1]; }
      const k = ck(Math.floor(sx / n / LOCAL_CELL), Math.floor(sz / n / LOCAL_CELL));
      push(this.bCells, k, i); this.localLayer.has.add(k);
    });
  }
  _indexWater() {
    this.water.forEach((w, i) => {
      const p = w.p; if (!p || p.length < 6) return;
      let x0 = 1e12, z0 = 1e12, x1 = -1e12, z1 = -1e12;
      for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); z0 = Math.min(z0, p[k + 1]); z1 = Math.max(z1, p[k + 1]); }
      const a = Math.floor(x0 / LOCAL_CELL), b = Math.floor(x1 / LOCAL_CELL), c = Math.floor(z0 / LOCAL_CELL), d = Math.floor(z1 / LOCAL_CELL);
      if ((b - a + 1) * (d - c + 1) > 400) return;     // absurdly large (sea): skip
      for (let i2 = a; i2 <= b; i2++) for (let j = c; j <= d; j++) { const k = ck(i2, j); push(this.wCells, k, i); this.localLayer.has.add(k); }
    });
  }

  // ---------------------------------------------------------------- chunk builders
  _buildLocal(gx, gz) {
    const t0 = performance.now();
    const grp = new THREE.Group();
    const key = ck(gx, gz);
    // roads
    const pieces = this.local ? this.local.cells.get(key) : null;
    if (pieces) {
      const geos = new Map(); const conc = new Geo(false);
      for (const [ri, a, b] of pieces) {
        const r = this.local.roads[ri];
        const tk = roadTexKey(r);
        let g = geos.get(tk); if (!g) { g = new Geo(false); geos.set(tk, g); }
        addRoadRibbon(g, conc, r, a, b);
      }
      for (const [tk, g] of geos) {
        if (g.empty) continue;
        const m = new THREE.Mesh(g.toBufferGeometry(), this._roadMat(tk));
        m.receiveShadow = true; grp.add(m);
      }
      if (!conc.empty) { const m = new THREE.Mesh(conc.toBufferGeometry(), this.concreteMat); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    }
    // water
    const wl = this.wCells.get(key);
    if (wl) {
      const g = new Geo(false);
      for (const wi of wl) {
        const w = this.water[wi];
        if (w.w) addWaterLine(g, w); else addFlatPolygon(g, w.p, 0.0);
      }
      if (!g.empty) { const m = new THREE.Mesh(g.toBufferGeometry(), this.waterMat); m.receiveShadow = true; grp.add(m); }
    }
    // buildings
    const bl = this.bCells.get(key);
    if (bl && this.q.bld) {
      const g = new Geo(true);
      for (const bi of bl) addBuilding(g, this.buildings[bi], bi);
      if (!g.empty) { const m = new THREE.Mesh(g.toBufferGeometry(), this.bldMat); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    }
    this.stats.lastBuildMs = performance.now() - t0;
    return grp.children.length ? grp : null;
  }

  _buildCoarse(gx, gz) {
    const pieces = this.country.cells.get(ck(gx, gz));
    if (!pieces) return null;
    const g = new Geo(false), box = this.localBox;
    for (const [ri, a, b] of pieces) {
      const r = this.country.roads[ri], p = r.p;
      if (box) {   // skip what the detailed local layer already covers
        const m = (a + b) >> 1, x = p[m * 2], z = p[m * 2 + 1];
        if (x > box[0] && x < box[2] && z > box[1] && z < box[3]) continue;
      }
      addRoadRibbon(g, null, r, a, b, { coarse: true, width: r.c === 'motorway' ? 14 : 10, y: 0.05, minSpacing: 40 });
    }
    if (g.empty) return null;
    const grp = new THREE.Group(); const m = new THREE.Mesh(g.toBufferGeometry(), this.coarseMat);
    grp.add(m); return grp;
  }

  // ---------------------------------------------------------------- per frame
  update(camPos, dt) {
    if (!this.loaded) return;
    const x = camPos.x, z = camPos.z;
    this._cam.copy(camPos);
    this.ground.position.x = Math.round(x / 200) * 200; this.ground.position.z = Math.round(z / 200) * 200;
    if (Math.hypot(x - this._lastPlan[0], z - this._lastPlan[1]) > 40 || (!this.localLayer.queue.length && !this.coarseLayer.queue.length && this._lastPlan[0] === 1e9)) {
      this._lastPlan = [x, z];
      this.localLayer.plan(x, z); this.coarseLayer.plan(x, z);
    }
    const t0 = performance.now();
    do {
      if (this.localLayer.queue.length) this.localLayer.buildNext();
      else if (this.coarseLayer.queue.length) this.coarseLayer.buildNext();
      else break;
    } while (performance.now() - t0 < 3);
    this.stats.chunks = this.localLayer.chunks.size + this.coarseLayer.chunks.size;
  }

  /** Synchronously build the nearest chunks (call after teleport / on start to avoid pop-in). */
  warm(camPos, maxChunks = 12) {
    this.localLayer.plan(camPos.x, camPos.z); this.coarseLayer.plan(camPos.x, camPos.z);
    this._lastPlan = [camPos.x, camPos.z];
    for (let i = 0; i < maxChunks && this.localLayer.queue.length; i++) this.localLayer.buildNext();
    for (let i = 0; i < 4 && this.coarseLayer.queue.length; i++) this.coarseLayer.buildNext();
  }

  setNight(n) {
    this.night = n ? Math.max(0, Math.min(1, +n)) : 0;
    this.bldMat.emissiveIntensity = this.night * 1.3;
    const c = 0.35 + 0.65 * (1 - this.night);
    this.groundMat.color.setRGB(0.37 * c, 0.42 * c, 0.33 * c);
  }

  // ---------------------------------------------------------------- queries
  _nearest(idx, roads, cell, x, z, maxD, elevOnly) {
    if (!idx) return null;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let best = null, bd = maxD;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = idx.get(ck(cx + i, cz + j)); if (!a) continue;
      for (let q = 0; q < a.length; q += 2) {
        const r = roads[a[q]], s = a[q + 1];
        if (elevOnly && !r.elev) continue;
        const p = r.p, x0 = p[s * 2], z0 = p[s * 2 + 1], dx = p[s * 2 + 2] - x0, dz = p[s * 2 + 3] - z0;
        const L2 = dx * dx + dz * dz;
        let t = L2 > 0 ? ((x - x0) * dx + (z - z0) * dz) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
        const lim = elevOnly ? roadWidth(r) / 2 + 0.5 : maxD;
        if (d < bd && d <= lim) {
          bd = elevOnly ? d : d;
          const L = Math.sqrt(L2) || 1;
          best = { r, d, dx: dx / L, dz: dz / L, along: r.cum[s] + t * L };
        }
      }
    }
    return best;
  }

  /** Nearest road within ~15 m: {c,n,ref,lanes,dist,dirX,dirZ,oneway,width,elev} | null */
  roadAt(x, z) {
    let h = null;
    if (this.local) h = this._nearest(this.localIdx, this.local.roads, 40, x, z, 15, false);
    if (!h && this.country) h = this._nearest(this.countryIdx, this.country.roads, 200, x, z, 15, false);
    if (!h) return null;
    const r = h.r;
    return {
      c: r.c, n: r.n || '', ref: r.ref || '', lanes: laneCount(r), dist: h.d, dirX: h.dx, dirZ: h.dz,
      oneway: !!r.o, width: roadWidth(r), elev: r.elev ? elevAt(r, h.along) : 0, bridge: !!r.b,
    };
  }

  /** Surface height: elevated deck height if (x,z) is on an elevated road and y (optional, current
   *  vehicle height) is on/near the deck; otherwise 0. With y omitted the deck height is returned. */
  groundHeight(x, z, y) {
    if (!this.local) return 0;
    const h = this._nearest(this.localIdx, this.local.roads, 40, x, z, 1e9, true);
    if (!h) return 0;
    const e = elevAt(h.r, h.along) + roadY(h.r);
    if (y == null) return e;
    return y > e - 4 ? e : 0;
  }

  /** Iterate road pieces (road, a, b) overlapping a world rect. layer: 'local' | 'country'. */
  forEachPiece(layer, x0, z0, x1, z1, cb) {
    const L = layer === 'country' ? this.country : this.local; if (!L) return;
    const c = layer === 'country' ? COARSE_CELL : LOCAL_CELL;
    const a = Math.floor(x0 / c), b = Math.floor(x1 / c), d = Math.floor(z0 / c), e = Math.floor(z1 / c);
    if ((b - a + 1) * (e - d + 1) > 2500) return;
    for (let i = a; i <= b; i++) for (let j = d; j <= e; j++) {
      const l = L.cells.get(ck(i, j)); if (l) for (const pc of l) cb(L.roads[pc[0]], pc[1], pc[2]);
    }
  }
  forEachWater(x0, z0, x1, z1, cb) {
    const seen = new Set();
    const a = Math.floor(x0 / LOCAL_CELL), b = Math.floor(x1 / LOCAL_CELL), d = Math.floor(z0 / LOCAL_CELL), e = Math.floor(z1 / LOCAL_CELL);
    if ((b - a + 1) * (e - d + 1) > 2500) return;
    for (let i = a; i <= b; i++) for (let j = d; j <= e; j++) {
      const l = this.wCells.get(ck(i, j)); if (l) for (const wi of l) if (!seen.has(wi)) { seen.add(wi); cb(this.water[wi]); }
    }
  }

  dispose() {
    this.localLayer.clear(); this.coarseLayer.clear();
    this.scene.remove(this.group);
    this.ground.geometry.dispose();
    for (const m of this.roadMats.values()) { m.map.dispose(); m.dispose(); }
    this.winTex.map.dispose(); this.winTex.emissive.dispose();
    [this.concreteMat, this.coarseMat, this.waterMat, this.bldMat, this.groundMat].forEach(m => m.dispose());
    this.roadMats.clear(); this.loaded = false;
  }
}

// ------------------------------------------------------------- polygon helpers
function ring(p) {
  const pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push(new THREE.Vector2(p[i], p[i + 1]));
  if (pts.length > 1 && pts[0].distanceToSquared(pts[pts.length - 1]) < 1e-6) pts.pop();
  return pts;
}
function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y; }
  return a / 2;
}
function addFlatPolygon(g, p, y) {
  const pts = ring(p); if (pts.length < 3) return;
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const base = g.n;
  for (const v of pts) g.vert(v.x, y, v.y, 0, 1, 0, v.x * 0.05, v.y * 0.05);
  for (const t of tris) {
    const a = pts[t[0]], b = pts[t[1]], c = pts[t[2]];
    const ny = (b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y);   // y comp of (b-a)x(c-a)
    if (ny > 0) g.tri(base + t[0], base + t[1], base + t[2]); else g.tri(base + t[0], base + t[2], base + t[1]);
  }
}
function addBuilding(g, b, seed) {
  let pts = ring(b.p);
  if (pts.length < 3 || pts.length > 60) return;
  let A = area(pts);
  if (Math.abs(A) < 15) return;
  if (A > 0) { pts.reverse(); A = -A; }            // make winding such that wall normal (-dz,dx) points outward
  const H = Math.max(3, Math.min(250, +b.h || 10 + ((seed * 2654435761) >>> 0) % 12));
  const pal = PALETTE[((seed * 2246822519) >>> 0) % PALETTE.length];
  const sh = 0.85 + (((seed * 3266489917) >>> 0) % 100) / 400;
  const col = [pal[0] * sh, pal[1] * sh, pal[2] * sh];
  const n = pts.length;
  let u = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], c = pts[(i + 1) % n];
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    if (len < 0.01) continue;
    const u1 = u + len / 14, vt = H / 12.8;
    g.quad([a.x, 0, a.y], [c.x, 0, c.y], [c.x, H, c.y], [a.x, H, a.y], [u, 0, u1, 0, u1, vt, u, vt], col);
    u = u1;
  }
  const tris = THREE.ShapeUtils.triangulateShape(pts.slice(), []);
  const base = g.n, rc = [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7];
  for (const v of pts) g.vert(v.x, H, v.y, 0, 1, 0, 0.02, 0.02, rc);
  for (const t of tris) {
    const a = pts[t[0]], bb = pts[t[1]], c = pts[t[2]];
    const ny = (bb.y - a.y) * (c.x - a.x) - (bb.x - a.x) * (c.y - a.y);
    if (ny > 0) g.tri(base + t[0], base + t[1], base + t[2]); else g.tri(base + t[0], base + t[2], base + t[1]);
  }
}

function addWaterLine(g, w) {
  const p = w.p, n = p.length >> 1; if (n < 2) return;
  if (!w.cum) { w.cum = new Float32Array(n); for (let i = 1; i < n; i++) w.cum[i] = w.cum[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]); }
  addRoadRibbon(g, null, w, 0, n - 1, { coarse: true, width: w.wd || 12, y: 0.0, minSpacing: 0 });
}
