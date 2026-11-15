// Bot cars built from the game's own car models (light versions of the same .glb files the player drives).
// Each model is flattened once into a few merged meshes (one per material) so a bot costs
// ~6–12 draw calls; bodies share geometry, paint comes from a small shared palette.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GENERATIONS, EXTRA_COLORS, WHEEL_STYLES, WHEEL_FINISHES, DEFAULT_BUILD } from '../catalog.js';
import { loadTemplate, getReadyTemplate } from '../glbcar.js';

export const BOT_GENS = GENERATIONS.filter((g) => g.glb);
const protos = new Map(); // gen id -> proto
let loading = null;

export const BOT_PAINTS = ['#f2f2f2', '#e9e9e9', '#c9ccd0', '#8c9096', '#2a2c30', '#141518', '#9b1b1b', '#c3262a', '#22416e', '#1f5fa8', '#3c5a3a', '#d8b03a', '#e46a1c', '#6b2f86', '#0ea5e9', '#10b981'];
export const BOT_RIMS = ['#b9bdc2', '#1c1d20', '#5a5f66', '#b88b4a', '#d4af37', '#f0f0f0', '#a31d24'];
export const BOT_TINTS = ['#0e1318', '#05070a', '#18222c'];
export const BOT_NEONS = ['#00e5ff', '#ff2a85', '#ffb02e', '#38ff88', '#a855f7'];
const paintCache = new Map();
const PAINT_FINISH_PARAMS = {
  gloss: { metalness: 0.28, roughness: 0.16, envMapIntensity: 1.2 },
  metallic: { metalness: 0.62, roughness: 0.26, envMapIntensity: 1.15 },
  pearl: { metalness: 0.48, roughness: 0.20, envMapIntensity: 1.3 },
  satin: { metalness: 0.35, roughness: 0.48, envMapIntensity: 0.95 },
};
export function paintMat(color, finish = 'metallic') {
  const key = `${color}|${finish}`;
  let m = paintCache.get(key);
  if (!m) {
    const p = PAINT_FINISH_PARAMS[finish] || PAINT_FINISH_PARAMS.metallic;
    m = new THREE.MeshStandardMaterial({ color, ...p, side: THREE.DoubleSide });
    paintCache.set(key, m);
  }
  return m;
}
const rimCache = new Map();
function getRimMat(color) {
  let m = rimCache.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.26, side: THREE.DoubleSide }); rimCache.set(color, m); }
  return m;
}
const glassCache = new Map();
function getGlassMat(color) {
  let m = glassCache.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, metalness: 0.78, roughness: 0.08, side: THREE.DoubleSide }); glassCache.set(color, m); }
  return m;
}
const glass = getGlassMat(BOT_TINTS[0]);
const tireMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92, side: THREE.DoubleSide });
const rimMat = getRimMat(BOT_RIMS[0]);
const carbonMat = new THREE.MeshStandardMaterial({ color: '#181a1d', metalness: 0.35, roughness: 0.38, side: THREE.DoubleSide });
const glowCache = new Map();
function getGlowMat(color) {
  let m = glowCache.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }); glowCache.set(color, m); }
  return m;
}
// Shared tuning accessory geometries (reused across all bots, zero per-car allocations)
const aeroGeos = {
  gtDeck: new THREE.BoxGeometry(0.26, 0.035, 1.38),
  gtStanchion: new THREE.BoxGeometry(0.14, 0.20, 0.03),
  lipSpoiler: new THREE.BoxGeometry(0.14, 0.05, 1.30),
  frontLip: new THREE.BoxGeometry(0.15, 0.05, 1.62),
  underglow: new THREE.PlaneGeometry(3.0, 1.32).rotateX(-Math.PI / 2),
};
const botHeadMat = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe8a0, emissiveIntensity: 0.25, side: THREE.DoubleSide });
const botTailMat = new THREE.MeshStandardMaterial({ color: 0x881010, emissive: 0xff2020, emissiveIntensity: 0.35, side: THREE.DoubleSide });
export function setBotLights(night = 0) {
  botHeadMat.emissiveIntensity = 0.2 + night * 2.4;
  botTailMat.emissiveIntensity = 0.3 + night * 1.6;
}

let fullLoading = null;
const fullReadySet = new Set();

export function readyFullGens() {
  for (const g of BOT_GENS) if (getReadyTemplate(g.glb)) fullReadySet.add(g.id);
  return BOT_GENS.filter((g) => fullReadySet.has(g.id));
}

export function preloadFullCarModels(first = null) {
  if (fullLoading) return fullLoading;
  const order = [...BOT_GENS].sort((a, b) => (b.id === first) - (a.id === first));
  const wheels = WHEEL_STYLES.filter((w) => w.glb);
  fullLoading = (async () => {
    for (const g of order) {
      if (!getReadyTemplate(g.glb)) {
        try { await loadTemplate(g.glb, g.glbConfig || {}); } catch (e) { console.warn('full bot glb failed', g.id, e); }
      }
      fullReadySet.add(g.id);
      await new Promise((r) => setTimeout(r, 30));
    }
    for (const w of wheels) {
      if (!getReadyTemplate(w.glb)) {
        try { await loadTemplate(w.glb, w.glbConfig || {}); } catch {}
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    return readyFullGens();
  })();
  return fullLoading;
}

const WHEEL_POOL = WHEEL_STYLES.filter((w) => w.id !== 'cover').map((w) => w.id);
const FINISH_POOL = WHEEL_FINISHES.filter((f) => f.id !== 'custom').map((f) => f.id);
const PAINT_FIN = ['gloss', 'metallic', 'pearl', 'satin', 'matte'];
const SPOILERS = ['none', 'none', 'lip', 'ducktail', 'wing', 'gtwing'];
const FRONTS = ['oem', 'lip', 'splitter', 'full'];
const EXHAUSTS = ['oem', 'single', 'dual', 'ti'];
const THAI_PRE = ['กข', 'กท', 'ขค', 'งจ', 'ชล', 'ฎฐ', 'ณด', 'ตถ', 'นบ', 'ปผ', 'พร', 'ภม', 'รย', 'วศ', 'สอ', 'ฮฮ'];

export function randomCarBuild(rand = Math.random, genPool = null) {
  const pool = genPool && genPool.length ? genPool : readyFullGens();
  const gen = pool.length ? pool[Math.floor(rand() * pool.length)] : BOT_GENS[0];
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const b = JSON.parse(JSON.stringify(DEFAULT_BUILD));
  b.gen = gen.id;
  b.paint.color = pick(EXTRA_COLORS);
  b.paint.finish = pick(PAINT_FIN);
  b.paint.hood = rand() < 0.18 ? 'carbon' : 'body';
  b.paint.roof = rand() < 0.22 ? 'black' : 'body';
  b.wheels.style = pick(WHEEL_POOL);
  b.wheels.finish = pick(FINISH_POOL);
  b.wheels.rim = 16 + Math.floor(rand() * 3);
  b.wheels.camber = rand() < 0.35 ? -(1 + Math.floor(rand() * 3)) : 0;
  b.wheels.caliper = pick(['#b91c1c', '#eab308', '#0284c7', '#16a34a', '#3a3a3a']);
  b.kit.front = pick(FRONTS);
  b.kit.side = rand() < 0.55 ? 'skirt' : 'none';
  b.kit.rear = rand() < 0.5 ? (rand() < 0.5 ? 'diffuser' : 'lip') : 'none';
  b.kit.spoiler = pick(SPOILERS);
  b.kit.exhaust = pick(EXHAUSTS);
  b.kit.partColor = rand() < 0.5 ? 'carbon' : rand() < 0.5 ? 'black' : 'body';
  b.suspension.drop = rand() < 0.65 ? Math.floor(rand() * 26) : 0;
  b.suspension.dropRear = b.suspension.drop;
  b.lights.underglow = rand() < 0.2 ? 'solid' : 'none';
  b.lights.underglowColor = pick(BOT_NEONS);
  b.glass.side = pick([40, 60, 80]);
  b.plate.line1 = `${pick(THAI_PRE)} ${1000 + Math.floor(rand() * 8999)}`;
  return b;
}

export function randomBotCustom(rand = Math.random) {
  const finishes = ['metallic', 'gloss', 'pearl', 'satin'];
  return {
    paint: BOT_PAINTS[Math.floor(rand() * BOT_PAINTS.length)],
    finish: finishes[Math.floor(rand() * finishes.length)],
    rim: BOT_RIMS[Math.floor(rand() * BOT_RIMS.length)],
    tint: BOT_TINTS[Math.floor(rand() * BOT_TINTS.length)],
    wing: rand() < 0.35 ? 2 : rand() < 0.65 ? 1 : 0, // 0 none, 1 lip, 2 GT wing
    frontLip: rand() < 0.45,
    wingBodyColor: rand() < 0.35,
    underglow: rand() < 0.22 ? BOT_NEONS[Math.floor(rand() * BOT_NEONS.length)] : null,
  };
}

const inSubtree = (o, names) => { for (let p = o; p; p = p.parent) if (names.includes(p.name)) return true; return false; };
const visibleChain = (o, root) => { for (let p = o; p && p !== root.parent; p = p.parent) if (!p.visible) return false; return true; };

// copy one index range of a geometry into a compact standalone geometry (position/normal/uv)
function extract(g, start, count) {
  const idx = g.index ? g.index.array : null;
  const nv = g.attributes.position.count;
  const map = new Int32Array(nv).fill(-1), used = [], out = new Uint32Array(count);
  for (let k = 0; k < count; k++) {
    const v = idx ? idx[start + k] : start + k;
    let n = map[v]; if (n < 0) { n = map[v] = used.length; used.push(v); }
    out[k] = n;
  }
  const res = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const src = g.attributes[name], arr = new Float32Array(used.length * size);
    if (src) used.forEach((v, i) => { arr[i * size] = src.getX(v); arr[i * size + 1] = src.getY(v); if (size === 3) arr[i * size + 2] = src.getZ(v); });
    res.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  res.setIndex(new THREE.BufferAttribute(out, 1));
  if (!g.attributes.normal) res.computeVertexNormals();
  return res;
}

export function makeProto(gen, tpl) {
  const root = tpl.root, cfg = tpl.cfg;
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const skip = [...Object.values(cfg.wheels), ...Object.values(cfg.calipers || {}), ...(cfg.interior || [])];
  const buckets = new Map();
  const add = (key, mat, geo) => { let b = buckets.get(key); if (!b) buckets.set(key, (b = { mat, geos: [] })); b.geos.push(geo); };
  root.traverse((o) => {
    if (!o.isMesh || !visibleChain(o, root) || inSubtree(o, skip)) return;
    const role = o.userData.role;
    if (role === 'wheel' || role === 'plateF' || role === 'plateR') return;
    const g = o.geometry, mats = Array.isArray(o.material) ? o.material : [o.material];
    const m = inv.clone().multiply(o.matrixWorld);
    const total = g.index ? g.index.count : g.attributes.position.count;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex] ?? mats[0];
      if (!mat || mat.visible === false || !gr.count) continue;
      const key = role === 'paint' ? 'paint' : role === 'windows' || role === 'mirrorGlass' || mat.transparent ? 'glass' : mat.uuid;
      const sub = extract(g, gr.start, Math.min(gr.count, total - gr.start));
      sub.applyMatrix4(m);
      add(key, key === 'paint' ? null : key === 'glass' ? glass : mat, sub);
    }
  });
  // simple wheels at the model's axle positions
  const tires = [], rims = [];
  for (const w of Object.values(tpl.wheels)) {
    const r = w.radius, wd = Math.max(0.18, Math.min(0.26, w.width || 0.2));
    tires.push(new THREE.CylinderGeometry(r, r, wd, 16).rotateX(Math.PI / 2).translate(w.center.x, w.center.y, w.center.z));
    rims.push(new THREE.CylinderGeometry(r * 0.64, r * 0.64, wd + 0.012, 10).rotateX(Math.PI / 2).translate(w.center.x, w.center.y, w.center.z));
  }
  const parts = [];
  for (const [key, b] of buckets) {
    const geo = mergeGeometries(b.geos, false);
    b.geos.forEach((x) => x.dispose());
    if (geo) { geo.computeBoundingSphere(); parts.push({ key, mat: b.mat, geo }); }
  }
  const strip = (gs) => { const m = mergeGeometries(gs.map((x) => { x.deleteAttribute('uv'); return x; }), false); m.computeBoundingSphere(); return m; };
  parts.push({ key: 'tire', mat: tireMat, geo: strip(tires) }, { key: 'rim', mat: rimMat, geo: strip(rims) });
  const box = tpl.body;
  return { gen, parts, L: box.max.x - box.min.x, W: box.max.z - box.min.z };
}

export function botReady() { return [...protos.values()]; }
export function hasBots() { return protos.size > 0; }

// Ready-made light versions of every car (models/bots/<gen>.glb, ~30k triangles, 256 px textures,
// 0.1–0.7 MB each) — made from the same models by tools/export-bots.py + gltf-transform simplify.
// Note: KHR_mesh_quantization stores POSITION/NORMAL in normalized Int16/Int8 BufferAttributes;
// dequantize to Float32 before applyMatrix4 so vertex coordinates don't overflow Int16!
const DARK_DEFAULT_MATS = new Set(['ACC__0', 'blackBody2', 'test', 'fd_gaugeshit', 'plastika', 'crv_plastic', 'crv_offplastic']);
const RE_HEAD = /head|lowbeam|highbeam|light\.0|lanterna|lights_material|lamp/i;
const RE_TAIL = /tail|redglass|vermelho|red_paint|reverselight/i;
const HATCH_IDS = new Set(['civic-eg', 'civic-fe']);

function dequantizeGeo(srcGeo, matrixWorld) {
  const geo = srcGeo.clone();
  for (const name of ['position', 'normal']) {
    const a = geo.attributes[name];
    if (!a || (!a.normalized && a.array instanceof Float32Array)) continue;
    const arr = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      arr[i * 3] = a.getX(i);
      arr[i * 3 + 1] = a.getY(i);
      arr[i * 3 + 2] = a.getZ(i);
    }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  geo.applyMatrix4(matrixWorld);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

const botLoader = new GLTFLoader();
botLoader.setMeshoptDecoder(MeshoptDecoder);
async function loadBotFile(g) {
  const gltf = await botLoader.loadAsync(`models/bots/${g.id}.glb`);
  const parts = [];
  const box = new THREE.Box3();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position?.count) return;
    const tag = ['paint', 'glass', 'tire', 'rim'].includes(o.name)
      ? o.name
      : ['paint', 'glass', 'tire', 'rim'].includes(o.parent?.name)
        ? o.parent.name
        : 'part';
    const geo = dequantizeGeo(o.geometry, o.matrixWorld);
    if (geo.boundingBox && !geo.boundingBox.isEmpty()) box.union(geo.boundingBox);

    let key = tag;
    let mat = null;
    if (tag === 'glass') mat = glass;
    else if (tag === 'tire') mat = tireMat;
    else if (tag === 'rim') mat = rimMat;
    else if (tag === 'paint') mat = null;
    else {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m) return;
      m.side = THREE.DoubleSide;
      const mName = m.name || '';
      const recolor = g.glbConfig?.recolor?.[mName];
      if (recolor) {
        m.color.set(recolor);
        m.roughness = Math.min(m.roughness ?? 0.6, 0.55);
      } else if (!m.map && DARK_DEFAULT_MATS.has(mName)) {
        m.color.set('#181a1d');
        m.roughness = 0.7;
      }
      const isTail = (g.glbConfig?.tail || []).includes(mName) || RE_TAIL.test(mName);
      const isHead = (g.glbConfig?.head || []).includes(mName) || (RE_HEAD.test(mName) && !isTail);
      if (isTail && !m.map) {
        key = 'tail';
        mat = botTailMat;
      } else if (isHead && !m.map) {
        key = 'head';
        mat = botHeadMat;
      } else {
        if (m.map && (isHead || isTail)) {
          m.emissiveMap = m.map;
          m.emissive = new THREE.Color('#ffffff');
          m.emissiveIntensity = 0.35;
        }
        mat = m;
      }
    }
    parts.push({ key, mat, geo });
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-2.15, 0, -0.9), new THREE.Vector3(2.15, 1.4, 0.9));
  return {
    gen: g,
    parts,
    minX: box.min.x,
    maxX: box.max.x,
    maxY: box.max.y,
    L: box.max.x - box.min.x,
    W: box.max.z - box.min.z,
  };
}

// load lightweight bot models (models/bots/*.glb, 0.2-0.6 MB each) for smooth 60 FPS
export function loadBotModels(limit = BOT_GENS.length, first = null) {
  if (loading && loading.limit >= limit) return loading;
  const order = [...BOT_GENS].sort((a, b) => (b.id === first) - (a.id === first));
  loading = (async () => {
    for (const g of order.slice(0, limit)) {
      if (protos.has(g.id)) continue;
      try { protos.set(g.id, await loadBotFile(g)); } catch (e) { console.warn('bot model failed', g.id, e); }
      await new Promise((r) => setTimeout(r, 40));
    }
    return botReady();
  })();
  loading.limit = limit;
  return loading;
}

export function randomProto(rand = Math.random) {
  const list = botReady();
  return list.length ? list[Math.floor(rand() * list.length)] : null;
}

// a new bot body (Group, car space: +x front) with the given paint & optional randomized tuning
export function makeBotBody(proto, color, shadows = false, custom = null) {
  const g = new THREE.Group();
  const c = custom || randomBotCustom();
  const paint = paintMat(color || c.paint, c.finish);
  const rim = c.rim ? getRimMat(c.rim) : rimMat;
  const gls = c.tint ? getGlassMat(c.tint) : glass;
  for (const p of proto.parts) {
    const mat = p.key === 'paint' ? paint : p.key === 'rim' ? rim : p.key === 'glass' ? gls : p.mat;
    const m = new THREE.Mesh(p.geo, mat);
    m.castShadow = shadows && p.key !== 'glass'; m.receiveShadow = false;
    m.matrixAutoUpdate = false;
    g.add(m);
  }
  const minX = proto.minX ?? -(proto.L || 4.3) * 0.5;
  const maxX = proto.maxX ?? (proto.L || 4.3) * 0.5;
  const isHatch = HATCH_IDS.has(proto.gen.id);
  const trunkY = proto.gen?.body?.trunkY ?? 0.96;
  const clearY = proto.gen?.dims?.clear ?? 0.14;
  const wingMat = c.wingBodyColor ? paint : carbonMat;
  if (c.wing === 2) {
    const baseY = isHatch ? (proto.maxY || 1.36) - 0.04 : trunkY;
    const dk = new THREE.Mesh(aeroGeos.gtDeck, wingMat);
    dk.position.set(minX + 0.22, baseY + 0.16, 0); dk.updateMatrix(); dk.matrixAutoUpdate = false; g.add(dk);
    for (const sz of [-0.44, 0.44]) {
      const st = new THREE.Mesh(aeroGeos.gtStanchion, carbonMat);
      st.position.set(minX + 0.23, baseY + 0.05, sz); st.updateMatrix(); st.matrixAutoUpdate = false; g.add(st);
    }
  } else if (c.wing === 1 && !isHatch) {
    const lp = new THREE.Mesh(aeroGeos.lipSpoiler, wingMat);
    lp.position.set(minX + 0.14, trunkY + 0.02, 0); lp.updateMatrix(); lp.matrixAutoUpdate = false; g.add(lp);
  }
  if (c.frontLip) {
    const fl = new THREE.Mesh(aeroGeos.frontLip, carbonMat);
    fl.position.set(maxX - 0.08, clearY + 0.02, 0); fl.updateMatrix(); fl.matrixAutoUpdate = false; g.add(fl);
  }
  if (c.underglow) {
    const ug = new THREE.Mesh(aeroGeos.underglow, getGlowMat(c.underglow));
    ug.position.set(0, 0.04, 0); ug.updateMatrix(); ug.matrixAutoUpdate = false; g.add(ug);
  }
  g.userData = { L: proto.L, W: proto.W, gen: proto.gen.id, name: proto.gen.name };
  return g;
}
