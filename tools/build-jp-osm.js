// Builds data/jp-roads.json and data/tokyo-local.json from OSM (Overpass). Run: node tools/build-jp-osm.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const LAT0 = 35.6762, LON0 = 139.7503, R = 3500; // Central Tokyo (Shuto C1 / Ginza / Tokyo Tower / Roppongi)
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
      console.log(`fetching ${name} (${ep})...`);
      const res = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(90000),
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

function dp(pts, tol) {
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
const inCircle = (x, z, r) => x * x + z * z <= r * r;

async function buildJp() {
  // Split Japan into 3 latitude bands for motorways + trunks so Overpass responds fast
  const bands = [[30.0, 35.0], [35.0, 38.5], [38.5, 45.6]];
  const rawList = [];
  for (let i = 0; i < bands.length; i++) {
    const [s, n] = bands[i];
    rawList.push(await overpass('jp_mw_' + i,
      `[out:json][timeout:120];way["highway"~"^(motorway|trunk)$"](${s},129.0,${n},146.0);out geom tags;`));
  }
  const roads = [];
  const seen = new Set();
  for (const raw of rawList) {
    for (const w of raw.elements) {
      if (w.type !== 'way' || !w.geometry || w.geometry.length < 2 || seen.has(w.id)) continue;
      seen.add(w.id);
      const t = w.tags || {};
      const c = t.highway === 'motorway' ? 'motorway' : 'trunk';
      const pts = dp(proj(w.geometry), 30);
      const p = flat(pts);
      if (p.length < 4 || len(p) < 250) continue;
      roads.push({ c, n: t['name:en'] || t.name || '', ref: t.ref || '', l: lanesOf(t, 2), o: isOne(t), p });
    }
  }
  save('jp-roads.json', { v: 1, origin, roads });
  console.log('jp-roads:', roads.length);
}

async function buildTokyo() {
  const dLat = R / 110574 * 1.02, dLon = R / KX * 1.02;
  const S = LAT0 - dLat, N = LAT0 + dLat, W = LON0 - dLon, E = LON0 + dLon;
  const bb = (s, w, n, e) => `${s},${w},${n},${e}`;
  const box = bb(S, W, N, E);
  const roadsRaw = await overpass('tokyo_roads',
    `[out:json][timeout:180];way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street)$"](${box});out geom tags;`);
  const waterRaw = await overpass('tokyo_water',
    `[out:json][timeout:180];(way["natural"="water"](${box});way["waterway"="riverbank"](${box});way["waterway"~"^(river|canal)$"](${box}););out geom tags;`);
  const mLat = (S + N) / 2, mLon = (W + E) / 2;
  const quads = [[S, W, mLat, mLon], [S, mLon, mLat, E], [mLat, W, N, mLon], [mLat, mLon, N, E]];
  const bEls = [];
  for (let i = 0; i < 4; i++) {
    const r = await overpass('tokyo_bld' + i, `[out:json][timeout:180];way["building"](${bb(...quads[i])});out geom tags;`);
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
    const isLine = t.waterway === 'river' || t.waterway === 'canal';
    const pts = dp(proj(w.geometry), isLine ? 4 : 6);
    if (pts.length < (isLine ? 2 : 3)) continue;
    if (!isLine) {
      const a = pts[0], b = pts[pts.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1) pts.pop();
      if (pts.length < 3) continue;
    }
    water.push(isLine ? { p: flat(pts, 1), w: 1 } : { p: flat(pts, 1) });
  }

  const buildings = [];
  for (const w of bEls) {
    if (w.type !== 'way' || !w.geometry || w.geometry.length < 3) continue;
    let pts = dp(proj(w.geometry), 1.5);
    if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1) pts.pop();
    if (pts.length < 3 || pts.length > 12) continue;
    let cx = 0, cz = 0, area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
      cx += x0; cz += z0; area += x0 * z1 - x1 * z0;
    }
    cx /= pts.length; cz /= pts.length; area = Math.abs(area) * 0.5;
    if (!inCircle(cx, cz, R) || area < 25) continue; // drop tiny sheds < 25m2 to keep Tokyo compact
    const t = w.tags || {};
    let h = parseFloat(t.height);
    if (!h || isNaN(h)) {
      const lv = parseFloat(t['building:levels']);
      h = lv > 0 ? lv * 3.2 : 12;
    }
    h = Math.round(Math.min(Math.max(h, 3), 260) * 10) / 10;
    buildings.push({ h, p: flat(pts, 1) });
  }

  save('tokyo-local.json', { v: 1, origin, roads, buildings, water });
  console.log('tokyo-local:', roads.length, 'roads,', buildings.length, 'buildings,', water.length, 'water');
}

(async () => {
  await buildTokyo();
  await buildJp();
})().catch((e) => { console.error(e); process.exit(1); });
