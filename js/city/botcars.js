// Bot cars built from the game's own car models (light versions of the same .glb files the player drives).
// Each model is flattened once into a few merged meshes (one per material) so a bot costs
// ~6–12 draw calls; bodies share geometry, paint comes from a small shared palette.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GENERATIONS } from '../catalog.js';

export const BOT_GENS = GENERATIONS.filter((g) => g.glb);
const protos = new Map(); // gen id -> proto
let loading = null;

export const BOT_PAINTS = ['#f2f2f2', '#e9e9e9', '#c9ccd0', '#8c9096', '#2a2c30', '#141518', '#9b1b1b', '#c3262a', '#22416e', '#1f5fa8', '#3c5a3a', '#d8b03a', '#e46a1c', '#6b2f86'];
const paintCache = new Map();
export function paintMat(color) {
  let m = paintCache.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.32, envMapIntensity: 1.1 }); paintCache.set(color, m); }
  return m;
}
const glass = new THREE.MeshStandardMaterial({ color: '#0e1318', metalness: 0.7, roughness: 0.08 });
const tireMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92 });
const rimMat = new THREE.MeshStandardMaterial({ color: '#b9bdc2', metalness: 0.85, roughness: 0.3 });

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
const botLoader = new GLTFLoader();
botLoader.setMeshoptDecoder(MeshoptDecoder);
async function loadBotFile(g) {
  const gltf = await botLoader.loadAsync(`models/bots/${g.id}.glb`);
  const parts = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const key = ['paint', 'glass', 'tire', 'rim'].includes(o.name) ? o.name : 'part';
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geo.computeBoundingSphere();
    const mat = key === 'glass' ? glass : key === 'tire' ? tireMat : key === 'rim' ? rimMat : key === 'paint' ? null : o.material;
    parts.push({ key, mat, geo });
  });
  const box = new THREE.Box3().setFromObject(gltf.scene);
  return { gen: g, parts, L: box.max.x - box.min.x, W: box.max.z - box.min.z };
}

// load bot cars for up to `limit` models (the player's current car first), one at a time
export function loadBotModels(limit = BOT_GENS.length, first = null) {
  if (loading && loading.limit >= limit) return loading;
  const order = [...BOT_GENS].sort((a, b) => (b.id === first) - (a.id === first));
  loading = (async () => {
    for (const g of order.slice(0, limit)) {
      if (protos.has(g.id)) continue;
      try { protos.set(g.id, await loadBotFile(g)); } catch (e) { console.warn('bot model failed', g.id, e); }
      await new Promise((r) => setTimeout(r, 20));
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

// a new bot body (Group, car space: +x front) with the given paint
export function makeBotBody(proto, color, shadows = true) {
  const g = new THREE.Group();
  const paint = paintMat(color);
  for (const p of proto.parts) {
    const m = new THREE.Mesh(p.geo, p.key === 'paint' ? paint : p.mat);
    m.castShadow = shadows && p.key !== 'glass'; m.receiveShadow = false;
    m.matrixAutoUpdate = false;
    g.add(m);
  }
  g.userData = { L: proto.L, W: proto.W, gen: proto.gen.id, name: proto.gen.name };
  return g;
}
