// Builds data/th-roads.json and data/bkk-local.json from OSM (Overpass). Run: node tools/build-osm.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const LAT0 = 13.758, LON0 = 100.565, R = 4000;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180);
const px = (lon) => (lon - LON0) * KX, pz = (lat) => -(lat - LAT0) * 110574;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

async function overpass(name, q) {
  const cache = path.join(__dirname, `_${name}.raw.json`);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  for (let a = 0; a < 8; a++) {
    const ep = ENDPOINTS[a % ENDPOINTS.length];
    try {
      const res = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'vios-garage-build/1.0' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      const j = JSON.parse(txt);
      fs.writeFileSync(cache, txt);
      return j;
    } catch (e) {
      const w = 5000 * (a + 1);
      console.log(`${name}: ${e.message} (attempt ${a + 1}), retry in ${w}ms`);
      await sleep(w);
    }
  }
  throw new Error('Overpass unreachable for ' + name);
}

function dp(pts, tol) { // pts [[x,z]...]
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [s, e] = st.pop();
    const [ax, az] = pts[s], [bx, bz] = pts[e];
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    let md = 0, mi = -1;
    for (let i = s + 1; i < e; i++) {
      let d;
      if (L === 0) d = Math.hypot(pts[i][0] - ax, pts[i][1] - az);
      else {
        let t = ((pts[i][0] - ax) * dx + (pts[i][1] - az) * dz) / L; t = Math.max(0, Math.min(1, t));
        d = Math.hypot(pts[i][0] - ax - t * dx, pts[i][1] - az - t * dz);
      }
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; st.push([s, mi], [mi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const len = (p) => { let s = 0; for (let i = 2; i < p.length; i += 2) s += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); return s; };
const proj = (geom) => geom.map(g => [px(g.lon), pz(g.lat)]);
const flat = (pts, dec) => { const f = dec ? 10 : 1; const o = []; for (const [x, z] of pts) o.push(Math.round(x * f) / f, Math.round(z * f) / f); return o; };
const kb = (f) => (fs.statSync(f).size / 1024 / 1024).toFixed(2) + ' MB';
function save(name, obj) {
  const s = JSON.stringify(obj);
  for (const d of ['data', 'public/data']) {
    fs.mkdirSync(path.join(ROOT, d), { recursive: true });
    fs.writeFileSync(path.join(ROOT, d, name), s);
  }
  console.log(name, kb(path.join(ROOT, 'data', name)));
}
const origin = { lat: LAT0, lon: LON0 };
const lanesOf = (t, def) => { const n = parseInt(t.lanes); return n > 0 && n < 12 ? n : def; };
const isOne = (t) => (t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || (t.highway === 'motorway' && t.oneway !== 'no')) ? 1 : 0;

function buildTh() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '_th_main.raw.json'), 'utf8'));
  const roads = [];
  for (const w of raw.elements) {
    if (w.type !== 'way' || !w.geometry || w.geometry.length < 2) continue;
    const t = w.tags || {};
    const c = t.highway === 'motorway' ? 'motorway' : t.highway === 'trunk' ? 'trunk' : null;
    if (!c) continue;
    let pts = dp(proj(w.geometry), 20);
    const p = flat(pts);
    if (p.length < 4) continue;
    if (len(p) < 150) continue;
    roads.push({ c, n: t['name:en'] || t.name || '', ref: t.ref || '', l: lanesOf(t, 2), o: isOne(t), p });
  }
  save('th-roads.json', { v: 1, origin, roads });
  return roads;
}

const inCircle = (x, z, r) => x * x + z * z <= r * r;
const dLat = R / 110574 * 1.02, dLon = R / KX * 1.02;
const S = LAT0 - dLat, N = LAT0 + dLat, W = LON0 - dLon, E = LON0 + dLon;

async function buildLocal() {
  const bb = (s, w, n, e) => `${s},${w},${n},${e}`;
  const box = bb(S, W, N, E);
  const roadsRaw = await overpass('bkk_roads',
    `[out:json][timeout:180];way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service)$"](${box});out geom tags;`);
  const waterRaw = await overpass('bkk_water',
    `[out:json][timeout:180];(way["natural"="water"](${box});way["waterway"="riverbank"](${box});way["waterway"~"^(river|canal)$"](${box}););out geom tags;`);
  // buildings split into 4 quadrants
  const mLat = (S + N) / 2, mLon = (W + E) / 2;
  const quads = [[S, W, mLat, mLon], [S, mLon, mLat, E], [mLat, W, N, mLon], [mLat, mLon, N, E]];
  const bEls = [];
  for (let i = 0; i < 4; i++) {
    const r = await overpass('bkk_bld' + i, `[out:json][timeout:180];way["building"](${bb(...quads[i])});out geom tags;`);
    bEls.push(...r.elements);
  }

  const roads = [];
  for (const w of roadsRaw.elements) {
    if (w.type !== 'way' || !w.geometry || w.geometry.length < 2) continue;
    const t = w.tags || {};
    const c = t.highway.replace('_link', '');
    const p = flat(dp(proj(w.geometry), 3), 1);
    if (p.length < 4) continue;
    const defL = { motorway: 2, trunk: 2, primary: 2, secondary: 2 }[c] || 1;
    const layer = parseInt(t.layer) || 0;
    roads.push({ c, n: t['name:en'] || t.name || '', ref: t.ref || '', l: lanesOf(t, defL), o: isOne(t),
      b: (t.bridge && t.bridge !== 'no') || layer > 0 ? 1 : 0, t: (t.tunnel && t.tunnel !== 'no') || layer < 0 ? 1 : 0, p });
  }

  const water = [];
  for (const w of waterRaw.elements) {
    if (w.type !== 'way' || !w.geometry || w.geometry.length < 2) continue;
    const t = w.tags || {};
    const line = !!t.waterway && t.waterway !== 'riverbank';
    const p = flat(dp(proj(w.geometry), 3), 1);
    if (p.length < 4) continue;
    if (line) water.push({ p, w: 1 }); else if (p.length >= 6) water.push({ p });
  }

  const seen = new Set(), blds = [];
  for (const w of bEls) {
    if (w.type !== 'way' || !w.geometry || w.geometry.length < 4 || seen.has(w.id)) continue;
    seen.add(w.id);
    const t = w.tags || {};
    let pts = proj(w.geometry);
    let cx = 0, cz = 0; for (const q of pts) { cx += q[0]; cz += q[1]; } cx /= pts.length; cz /= pts.length;
    if (!inCircle(cx, cz, R)) continue;
    let ring = dp(pts, 1.5);
    if (ring.length > 13) ring = dp(pts, 4);
    if (ring.length > 13) ring = ring.slice(0, 12).concat([ring[ring.length - 1]]);
    let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    a = Math.abs(a) / 2;
    if (a < 12) continue;
    let h = parseFloat(t.height); if (!(h > 0)) { const lv = parseFloat(t['building:levels']); h = lv > 0 ? lv * 3.2 : 9; }
    h = Math.round(Math.min(h, 400) * 10) / 10;
    ring = ring.slice(0, -1); // drop closing duplicate
    if (ring.length < 3) continue;
    blds.push({ a, o: { h, p: flat(ring, 1) } });
  }
  const mk = (min) => blds.filter(b => b.a >= min).map(b => b.o);
  let buildings = mk(12);
  const roadsWater = JSON.stringify({ roads, water }).length;
  for (const min of [12, 30, 60, 100, 150]) {
    buildings = mk(min);
    if (roadsWater + JSON.stringify(buildings).length < 5.8e6) break;
  }
  save('bkk-local.json', { v: 1, origin, roads, buildings, water });
  return { roads, buildings, water, rawBuildings: blds.length };
}

(async () => {
  const th = buildTh();
  const loc = await buildLocal();
  console.log('TH roads', th.length, 'pts', th.reduce((s, r) => s + r.p.length / 2, 0));
  console.log('BKK roads', loc.roads.length, 'buildings', loc.buildings.length, '/', loc.rawBuildings, 'water', loc.water.length);
  // validation
  const bounds = (rs) => { let a = [1e9, 1e9, -1e9, -1e9]; for (const r of rs) for (let i = 0; i < r.p.length; i += 2) { a[0] = Math.min(a[0], r.p[i]); a[1] = Math.min(a[1], r.p[i + 1]); a[2] = Math.max(a[2], r.p[i]); a[3] = Math.max(a[3], r.p[i + 1]); } return a; };
  console.log('TH bounds [minx,minz,maxx,maxz]', bounds(th));
  console.log('BKK bounds', bounds(loc.roads));
  let near = 0; for (const r of th) for (let i = 0; i < r.p.length; i += 2) if (inCircle(r.p[i], r.p[i + 1], 4000)) { near++; break; }
  console.log('TH ways touching 4km of origin:', near);
  const cm = { x: px(98.98), z: pz(18.79) }; console.log('Chiang Mai expected', cm);
})().catch(e => { console.error(e); process.exit(1); });
