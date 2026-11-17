// /admin API — game management backend: live stats, players, activity logs,
// runtime settings, and a GLB car garage (add/edit/hide cars without a redeploy).
// Auth: every endpoint needs the admin key (x-admin-key header or ?key=).
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { S } = require('./gamesettings');

const ADMIN_KEY = process.env.ADMIN_KEY || 'admin';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const MODELS = path.join(ROOT, 'models');
const PUB_MODELS = path.join(PUBLIC, 'models');
const CARS_STORE = path.join(ROOT, 'store', 'cars.json');
const CARS_PUBLIC = path.join(PUBLIC, 'data', 'cars.json');
const TX_LOG = path.join(ROOT, 'store', 'tx.log');
const MAX_UPLOAD = 90 * 1024 * 1024;

if (!process.env.ADMIN_KEY) console.log('[admin] WARNING: ADMIN_KEY not set — using default "admin". Set ADMIN_KEY in production!');

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const okKey = (req, u) => req.headers['x-admin-key'] === ADMIN_KEY || u.searchParams.get('key') === ADMIN_KEY;

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const parts = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { req.destroy(); reject(new Error('body too large')); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

// ---------- cars.json (custom garage) ----------
function loadCars() {
  try { const d = JSON.parse(fs.readFileSync(CARS_STORE, 'utf8')); return { cars: d.cars || [], hidden: d.hidden || [] }; }
  catch { return { cars: [], hidden: [] }; }
}
function saveCars(data) {
  fs.mkdirSync(path.dirname(CARS_STORE), { recursive: true });
  fs.writeFileSync(CARS_STORE, JSON.stringify(data, null, 2));
  fs.mkdirSync(path.dirname(CARS_PUBLIC), { recursive: true });
  fs.writeFileSync(CARS_PUBLIC, JSON.stringify(data, null, 2)); // copy the client fetches
  syncCarPrices(data);
}

// register custom-car prices into the shared economy module (same ESM instance
// rooms.js uses) — without this, sanitize() strips admin cars to 'gen2' on join
let _customIds = new Set();
async function syncCarPrices(data = null) {
  try {
    data ??= loadCars();
    const E = await import(pathToFileURL(path.join(PUBLIC, 'js', 'economy.js')).href);
    const G = await import(pathToFileURL(path.join(PUBLIC, 'js', 'engine.js')).href);
    const ids = new Set();
    for (const c of data.cars) {
      E.CAR_PRICES[c.id] = c.price ?? 0; ids.add(c.id);
      G.CAR_SPECS[c.id] = G.CAR_SPECS[c.specFrom] || G.CAR_SPECS.gen2; // lobby spec cards need this too
    }
    for (const id of _customIds) if (!ids.has(id)) { delete E.CAR_PRICES[id]; delete G.CAR_SPECS[id]; }
    _customIds = ids;
  } catch (e) { console.error('[admin] price sync:', e.message); }
}

let _catalog = null;
async function catalog() {
  if (!_catalog) _catalog = import(pathToFileURL(path.join(PUBLIC, 'js', 'catalog.js')).href);
  return _catalog;
}
const GLB_CFG_KEYS = ['rotY', 'scale', 'hide', 'hideMats', 'paint', 'windows', 'head', 'tail', 'recolor', 'interior', 'interiorMats', 'plates', 'calipers', 'wheels', 'mirror', 'rimNode', 'anchorWheels'];
const DEFAULT_BODY = { hoodY: 0.95, trunkY: 1.0, beltY: 0.97, beltRise: 0.04, noseDrop: 0.2, tailDrop: 0.06, rg: [0.165, 0.30], ws: [0.565, 0.75], roofRatio: 0.75 };
const DEFAULT_STYLE = { head: 'swept', grille: 'bar', lower: 'wideSlot', tail: 'wrap', fog: false, drl: true, sharkfin: false };

function cleanEntry(b) {
  const e = {};
  e.id = String(b.id || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(e.id)) return { err: 'id ต้องเป็น a-z, 0-9, - (2–31 ตัว)' };
  e.make = String(b.make || '').trim().slice(0, 24);
  e.model = String(b.model || '').trim().slice(0, 40);
  e.name = String(b.name || '').trim().slice(0, 60);
  if (!e.name) return { err: 'ต้องใส่ชื่อรถ' };
  e.years = String(b.years || '').trim().slice(0, 20);
  e.code = String(b.code || '').trim().slice(0, 20);
  e.featured = true;
  e.glb = b.glb ? `models/${path.basename(String(b.glb))}` : null;
  if (e.glb && !fs.existsSync(path.join(PUBLIC, e.glb))) return { err: `ไม่พบไฟล์ ${e.glb} — อัปโหลดก่อน` };
  if (b.glbConfig && typeof b.glbConfig === 'object') {
    e.glbConfig = {};
    for (const k of GLB_CFG_KEYS) if (b.glbConfig[k] !== undefined) e.glbConfig[k] = b.glbConfig[k];
  }
  const d = b.dims || {};
  e.dims = { L: +d.L || +d.l || 4.4, W: +d.W || +d.w || 1.75, H: +d.H || +d.h || 1.45, WB: +d.WB || +d.wb || 2.6, fOH: +d.fOH || 0.85, clear: +d.clear || 0.15 };
  e.body = (b.body && typeof b.body === 'object') ? { ...DEFAULT_BODY, ...b.body } : DEFAULT_BODY;
  const t = b.tire || {};
  e.tire = { width: +t.width || +t.w || 195, aspect: +t.aspect || +t.ar || 55, rim: +t.rim || +t.r || 15 };
  e.style = (b.style && typeof b.style === 'object') ? { ...DEFAULT_STYLE, ...b.style } : DEFAULT_STYLE;
  if (Array.isArray(b.colors)) e.colors = b.colors.map((c) => String(c).slice(0, 9)).slice(0, 12);
  e.specFrom = String(b.specFrom || 'gen2').trim();
  e.price = Math.max(0, Math.min(1e9, +b.price || 0)); // 0 = free car, 1 = matches the ฿1 shop
  if (b.credit && (b.credit.text || b.credit.url)) e.credit = { text: String(b.credit.text || '').slice(0, 120), url: String(b.credit.url || '').slice(0, 300) };
  return { entry: e };
}

// ---------- glb inspect (uses the same parser as tools/) ----------
let _glbLib = null;
async function glbLib() {
  if (!_glbLib) _glbLib = import(pathToFileURL(path.join(ROOT, 'tools', 'glb-lib.mjs')).href);
  return _glbLib;
}
async function inspectGlb(file) {
  const L = await glbLib();
  const { g } = L.parseGlb(file);
  const nodes = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let verts = 0;
  L.walkNodes(g, (n, wm, d) => {
    const b = L.nodeBBox(g, n, wm);
    nodes.push({ name: n.name || '', mesh: n.mesh !== undefined, verts: b?.verts || 0, mats: b?.mats || [] });
    if (b) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); }
    verts += b?.verts || 0;
  });
  const wheels = L.detectWheels(g).map((w) => ({ name: w.n, c: w.c.map((v) => +v.toFixed(3)) }));
  const anchors = nodes.filter((n) => /^WHEEL_(RF|LF|RR|LR)$/.test(n.name)).map((n) => n.name);
  return {
    file: path.basename(file), size: fs.statSync(file).size,
    nodes: nodes.length, meshes: (g.meshes || []).length, verts,
    materials: (g.materials || []).map((m) => m.name || ''),
    bbox: min[0] === Infinity ? null : { min: min.map((v) => +v.toFixed(3)), max: max.map((v) => +v.toFixed(3)), size: max.map((v, i) => +(v - min[i]).toFixed(3)) },
    wheelCandidates: wheels, anchors,
    nodeNames: nodes.filter((n) => n.mesh).map((n) => n.name).slice(0, 400),
  };
}

// ---------- router ----------
async function handle(req, res, u, rooms) {
  const p = u.pathname;
  if (!p.startsWith('/admin/api/')) return false;
  if (!okKey(req, u)) { send(res, 401, { ok: false, err: 'admin key ไม่ถูกต้อง' }); return true; }
  const ad = () => (rooms.admin ? rooms.admin() : { worlds: [], players: [], events: [] });

  try {
    if (req.method === 'GET' && p === '/admin/api/state') {
      const a = ad();
      send(res, 200, { ok: true, stats: rooms.stats(), worlds: a.worlds, uptime: process.uptime(), node: process.version, settings: { cur: S.all(), defaults: S.defaults() } });
      return true;
    }
    if (req.method === 'POST' && p === '/admin/api/settings') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      send(res, 200, { ok: true, settings: S.set(body) });
      return true;
    }
    if (req.method === 'GET' && p === '/admin/api/players') {
      send(res, 200, { ok: true, players: ad().players });
      return true;
    }
    if (req.method === 'GET' && p === '/admin/api/profiles') {
      const q = (u.searchParams.get('q') || '').toLowerCase();
      const list = [];
      for (const p2 of ad().store.profiles.values()) {
        if (q && !(p2.name || '').toLowerCase().includes(q) && !(p2.username || '').toLowerCase().includes(q)) continue;
        list.push({ name: p2.name, username: p2.username, money: p2.money, rep: p2.rep, wins: p2.wins, races: p2.races, cars: (p2.owned || []).filter((k) => k.startsWith('car:')).length, seen: p2.seen, createdAt: p2.createdAt });
        if (list.length >= 300) break;
      }
      list.sort((a, b) => (b.seen || 0) - (a.seen || 0));
      send(res, 200, { ok: true, profiles: list, total: ad().store.profiles.size });
      return true;
    }
    if (req.method === 'GET' && p === '/admin/api/logs') {
      const n = Math.min(1000, +u.searchParams.get('n') || 200);
      const kind = u.searchParams.get('kind') || '';
      let tx = [];
      try {
        const raw = fs.readFileSync(TX_LOG, 'utf8').split('\n').filter(Boolean).slice(-4000);
        tx = raw.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).filter((x) => !kind || x.kind === kind).slice(-n);
      } catch {}
      send(res, 200, { ok: true, events: ad().events.slice(-n), tx });
      return true;
    }
    if (req.method === 'GET' && p === '/admin/api/cars') {
      const cat = await catalog();
      const data = loadCars();
      const hidden = new Set(data.hidden);
      send(res, 200, {
        ok: true,
        builtin: cat.GENERATIONS.map((g) => ({ id: g.id, name: g.name, make: g.make || '', glb: !!g.glb, featured: !!g.featured, hidden: hidden.has(g.id) })),
        custom: data.cars,
        specs: Object.keys((await import(pathToFileURL(path.join(PUBLIC, 'js', 'engine.js')).href)).CAR_SPECS),
        models: fs.existsSync(PUB_MODELS) ? fs.readdirSync(PUB_MODELS).filter((f) => f.endsWith('.glb')) : [],
      });
      return true;
    }
    if (req.method === 'POST' && p === '/admin/api/cars') {
      const { entry, err } = cleanEntry(JSON.parse((await readBody(req)).toString('utf8') || '{}'));
      if (err) return send(res, 400, { ok: false, err }), true;
      const cat = await catalog(), data = loadCars();
      if (cat.GENERATIONS.some((g) => g.id === entry.id) || data.cars.some((c) => c.id === entry.id))
        return send(res, 400, { ok: false, err: `id "${entry.id}" มีอยู่แล้ว` }), true;
      data.cars.push(entry); saveCars(data);
      send(res, 200, { ok: true, entry });
      return true;
    }
    const carMatch = p.match(/^\/admin\/api\/cars\/([a-z0-9-]+)$/);
    if (carMatch && req.method === 'PUT') {
      const id = carMatch[1], body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const data = loadCars(), cat = await catalog();
      const isBuiltin = cat.GENERATIONS.some((g) => g.id === id);
      const ci = data.cars.findIndex((c) => c.id === id);
      if (isBuiltin && ci < 0) { // built-ins: only hide/unhide
        if (body.hidden === true) { if (!data.hidden.includes(id)) data.hidden.push(id); }
        else if (body.hidden === false) data.hidden = data.hidden.filter((x) => x !== id);
        else return send(res, 400, { ok: false, err: 'รถ built-in แก้ได้เฉพาะซ่อน/แสดง' }), true;
        saveCars(data); return send(res, 200, { ok: true }), true;
      }
      if (ci < 0) return send(res, 404, { ok: false, err: 'ไม่พบรถคันนี้' }), true;
      const merged = { ...data.cars[ci], ...body, id }; // id ห้ามเปลี่ยน
      const { entry, err } = cleanEntry(merged);
      if (err) return send(res, 400, { ok: false, err }), true;
      data.cars[ci] = entry; saveCars(data);
      send(res, 200, { ok: true, entry });
      return true;
    }
    if (carMatch && req.method === 'DELETE') {
      const id = carMatch[1], data = loadCars();
      const before = data.cars.length;
      data.cars = data.cars.filter((c) => c.id !== id);
      if (data.cars.length === before) return send(res, 404, { ok: false, err: 'ไม่พบรถคันนี้ (built-in ลบไม่ได้ — ใช้ซ่อนแทน)' }), true;
      saveCars(data); // ไฟล์ .glb ยังอยู่ใน models/ — ลบเองถ้าไม่ใช้แล้ว
      send(res, 200, { ok: true });
      return true;
    }
    if (req.method === 'GET' && p === '/admin/api/glb/inspect') {
      const f = path.basename(u.searchParams.get('file') || '');
      const fp = path.join(PUB_MODELS, f);
      if (!f || !fs.existsSync(fp)) return send(res, 404, { ok: false, err: 'ไม่พบไฟล์ใน models/' }), true;
      send(res, 200, { ok: true, info: await inspectGlb(fp) });
      return true;
    }
    if (req.method === 'POST' && p === '/admin/api/glb/anchors') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const f = path.basename(String(body.file || ''));
      const fp = path.join(PUB_MODELS, f);
      if (!f || !fs.existsSync(fp)) return send(res, 404, { ok: false, err: 'ไม่พบไฟล์' }), true;
      const L = await glbLib();
      const { g, bin } = L.parseGlb(fp);
      let named = null;
      if (Array.isArray(body.centers) && body.centers.length === 4) {
        named = L.labelCorners(body.centers, {});
        if (!named) return send(res, 400, { ok: false, err: 'วางตำแหน่งล้อไม่สำเร็จ' }), true;
      } else {
        const hits = L.detectWheels(g);
        if (hits.length < 4) return send(res, 400, { ok: false, err: `หา wheel nodes เจอ ${hits.length} < 4 — ระบุ centers เอง` }), true;
        const fmap = { x: [0, 1], '-x': [0, -1], z: [2, 1], '-z': [2, -1] };
        const [fwdAxis, fwdSign] = fmap[body.facing] || [null, 1];
        // wheels merged per-axle → cluster centers into 4 corners by x/z extremes
        const cs = hits.map((h) => h.c);
        named = L.labelCorners(cs, { fwdAxis, fwdSign });
        if (!named && hits.length >= 4) named = L.labelCorners(cs.slice(0, 4), { fwdAxis, fwdSign });
        if (!named) return send(res, 400, { ok: false, err: 'จัดมุมล้อไม่สำเร็จ — ระบุ centers เอง' }), true;
      }
      const yBase = Number.isFinite(+body.yBase) ? +body.yBase : 0;
      const newBin = L.injectAnchors(g, bin, named.named, { fwdAxis: named.fwdAxis, dia: +body.dia || 0.6, wid: +body.wid || 0.19, yBase });
      L.writeGlb(fp, g, newBin);
      const mfp = path.join(MODELS, f);
      try { fs.copyFileSync(fp, mfp); } catch {}
      send(res, 200, { ok: true, anchors: Object.keys(named.named), centers: named.named });
      return true;
    }
    if (req.method === 'POST' && p === '/admin/api/glb') {
      const name = path.basename(u.searchParams.get('name') || 'car.glb').replace(/[^\w.-]/g, '_');
      if (!name.endsWith('.glb')) return send(res, 400, { ok: false, err: 'ต้องเป็นไฟล์ .glb' }), true;
      const buf = await readBody(req, MAX_UPLOAD);
      if (!buf.length || buf.readUInt32LE(0) !== 0x46546c67) return send(res, 400, { ok: false, err: 'ไม่ใช่ไฟล์ .glb' }), true;
      fs.mkdirSync(PUB_MODELS, { recursive: true }); fs.mkdirSync(MODELS, { recursive: true });
      fs.writeFileSync(path.join(PUB_MODELS, name), buf);
      fs.writeFileSync(path.join(MODELS, name), buf);
      send(res, 200, { ok: true, file: name, info: await inspectGlb(path.join(PUB_MODELS, name)) });
      return true;
    }
    send(res, 404, { ok: false, err: 'unknown endpoint' });
    return true;
  } catch (e) {
    send(res, 500, { ok: false, err: String(e.message || e) });
    return true;
  }
}

module.exports = { handleAdmin: handle, syncCarPrices };
