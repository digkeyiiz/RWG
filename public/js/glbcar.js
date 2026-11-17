// Real-model support: load a car .glb once, normalize it into car space
// (+x front, +y up, +z right, tires on y=0), split paint/glass into editable regions,
// and expose surface queries (BVH raycasts) so body-kit parts can stick to the real body.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

export function loadTemplate(url, cfg) {
  if (!cache.has(url)) {
    const pr = loader.loadAsync(url).then((g) => { const t = prepare(g.scene, cfg); pr.ready = t; return t; });
    pr.catch(() => cache.delete(url));
    cache.set(url, pr);
  }
  return cache.get(url);
}
export function getReadyTemplate(url) { return cache.get(url)?.ready || null; }

// Standalone wheel models: returns the cached scene, or null while loading (calls onReady once).
const wheelCache = new Map();
export function getWheelModel(url, onReady, onFail) {
  const hit = wheelCache.get(url);
  if (hit?.scene) return hit.scene;
  if (hit) return null;
  const entry = {};
  wheelCache.set(url, entry);
  loader.loadAsync(url).then((g) => { entry.scene = g.scene; onReady?.(); })
    .catch(() => { wheelCache.delete(url); onFail?.(); });
  return null;
}

const tmpV = new THREE.Vector3(), tmpB = new THREE.Box3();

function prepare(model, cfg) {
  const root = new THREE.Group();
  root.add(model);
  model.rotation.y = cfg.rotY ?? 0;
  if (cfg.scale) model.scale.setScalar(cfg.scale); // source files aren't always meters — e.g. 0.01 for cm exports
  root.updateMatrixWorld(true);

  const inSubtree = (o, names) => { for (let p = o; p; p = p.parent) if (names.includes(p.name)) return true; return false; };
  const wheelNames = Object.values(cfg.wheels), caliperNames = Object.values(cfg.calipers || {});
  // hide broken meshes (wrong scale in source file), nodes in cfg.hide and materials in cfg.hideMats
  // (stock tyres/rims/brakes left in a source model would sit static inside the game's spinning wheels)
  model.traverse((o) => {
    if (!o.isMesh) return;
    tmpB.setFromObject(o).getSize(tmpV);
    if (Math.max(tmpV.x, tmpV.y, tmpV.z) > 8 || inSubtree(o, cfg.hide || []) || (cfg.hideMats || []).includes(o.material?.name)) o.visible = false;
  });

  // ground + center
  let minY = Infinity;
  for (const n of wheelNames) minY = Math.min(minY, tmpB.setFromObject(model.getObjectByName(n)).min.y);
  const body = new THREE.Box3();
  model.traverse((o) => { if (o.isMesh && o.visible && !inSubtree(o, wheelNames) && !inSubtree(o, caliperNames)) body.union(tmpB.setFromObject(o)); });
  const c = body.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -minY, -c.z);
  root.updateMatrixWorld(true);
  body.translate(new THREE.Vector3(-c.x, -minY, -c.z));

  // wheels
  const wheels = {};
  for (const [k, n] of Object.entries(cfg.wheels)) {
    const node = model.getObjectByName(n);
    tmpB.setFromObject(node);
    wheels[k] = { name: n, center: tmpB.getCenter(new THREE.Vector3()), radius: (tmpB.max.y - tmpB.min.y) / 2, width: tmpB.max.z - tmpB.min.z, caliper: cfg.calipers?.[k] };
  }

  const matIs = (o, list) => list.includes(o.material?.name);
  // per-model material fixes: { materialName: '#hex' } for trim left at the exporter's default grey
  if (cfg.recolor) model.traverse((o) => {
    if (!o.isMesh) return;
    for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
      const c = mt && cfg.recolor[mt.name];
      if (c) { mt.color.set(c); mt.roughness = Math.min(mt.roughness ?? 0.6, 0.55); }
    }
  });
  // ---- split windows into windshield / side / rear ----
  const geoInfo = { side: { maxY: -Infinity }, ws: { maxX: -Infinity, minX: Infinity, minY: Infinity, halfW: 0 }, rg: { maxX: -Infinity, minX: Infinity, minY: Infinity, halfW: 0 } };
  model.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (matIs(o, cfg.windows)) {
      o.userData.role = 'windows';
      splitByTriangle(o, (cen, nrm) => {
        if (nrm.x > 0.35) { const g = geoInfo.ws; g.maxX = Math.max(g.maxX, cen.x); g.minX = Math.min(g.minX, cen.x); g.minY = Math.min(g.minY, cen.y); g.halfW = Math.max(g.halfW, Math.abs(cen.z)); return 0; }
        if (nrm.x < -0.35) { const g = geoInfo.rg; g.maxX = Math.max(g.maxX, cen.x); g.minX = Math.min(g.minX, cen.x); g.minY = Math.min(g.minY, cen.y); g.halfW = Math.max(g.halfW, Math.abs(cen.z)); return 2; }
        geoInfo.side.maxY = Math.max(geoInfo.side.maxY, cen.y);
        return 1;
      });
    }
  });
  const ws = geoInfo.ws, rg = geoInfo.rg;
  const roofY = isFinite(geoInfo.side.maxY) ? geoInfo.side.maxY + 0.05 : body.max.y;
  // ---- split body paint into body / roof / hood / trunk ----
  // Prefer real panels (separate mesh islands); fall back to per-triangle rules.
  const paintMeshes = [];
  model.traverse((o) => { if (o.isMesh && o.visible && matIs(o, cfg.paint)) paintMeshes.push(o); });
  const hoodFrontX = body.max.x - (cfg.hoodFrontInset ?? 0.25);
  const compSlot = (c) => {
    const len = c.max.x - c.min.x, wid = c.max.z - c.min.z;
    if (c.nrm.y > 0.75 && c.cen.y > roofY - 0.15 && wid > 0.9 && len > 0.9) return 1;
    if (c.nrm.y > 0.55 && c.cen.x > ws.maxX - 0.05 && c.min.y > ws.minY - 0.4 && wid > 0.9 && len > 0.4) return 2;
    if (c.nrm.y > 0.45 && c.cen.x < rg.minX + 0.05 && c.min.y > rg.minY - 0.4 && wid > 0.9 && len > 0.25) return 3;
    return -1;
  };
  const found = new Set();
  const compData = paintMeshes.map((o) => {
    const d = components(o);
    d.slots = d.comps.map((c) => { const sl = compSlot(c); if (sl > 0) found.add(sl); return sl; });
    return d;
  });
  paintMeshes.forEach((o, mi) => {
    o.userData.role = 'paint';
    carSpaceUV(o);
    const d = compData[mi];
    splitByTriangle(o, (cen, nrm, t) => {
      const sl = d.slots[d.triComp[t]];
      if (sl > 0) return sl;
      if (!found.has(1) && nrm.y > 0.55 && cen.y > roofY - 0.07 && cen.x > rg.maxX - 0.1 && cen.x < ws.minX + 0.1) return 1;
      if (!found.has(2) && nrm.y > 0.3 && cen.x > ws.maxX + 0.02 && cen.x < hoodFrontX && cen.y > ws.minY - 0.3 && Math.abs(cen.z) < ws.halfW * 0.98) return 2;
      if (!found.has(3) && nrm.y > 0.3 && cen.x < rg.minX - 0.02 && cen.y > rg.minY - 0.3 && Math.abs(cen.z) < rg.halfW * 0.98) return 3;
      return 0;
    });
  });
  model.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (o.userData.role === 'paint') { /* done */ }
    else if (matIs(o, cfg.head || [])) o.userData.role = 'head';
    else if (matIs(o, cfg.tail || [])) o.userData.role = 'tail';
    else if (matIs(o, cfg.mirror || [])) o.userData.role = 'mirrorGlass';
    if (inSubtree(o, [cfg.plates?.front])) { o.userData.role = 'plateF'; planarUV(o, true); }
    if (inSubtree(o, [cfg.plates?.rear])) { o.userData.role = 'plateR'; planarUV(o, false); }
    if (inSubtree(o, wheelNames) || inSubtree(o, caliperNames)) o.userData.role = 'wheel';
    o.castShadow = true;
    o.receiveShadow = true;
    o.userData.shared = true;
  });
  model.traverse((o) => { if (o.isMesh) o.userData.shared = true; });

  // ---- collision mesh for surface queries ----
  const parts = [];
  model.traverse((o) => {
    if (!o.isMesh || !o.visible || o.userData.role === 'wheel' || inSubtree(o, cfg.interior || []) || (cfg.interiorMats || []).includes(o.material?.name)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const src = g.attributes.position, f = new Float32Array(src.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < src.count; i++) { v.fromBufferAttribute(src, i).applyMatrix4(o.matrixWorld); f[i * 3] = v.x; f[i * 3 + 1] = v.y; f[i * 3 + 2] = v.z; }
    parts.push(f);
  });
  const total = parts.reduce((s, a) => s + a.length, 0);
  const arr = new Float32Array(total);
  let off = 0;
  for (const a of parts) { arr.set(a, off); off += a.length; }
  const colGeo = new THREE.BufferGeometry();
  colGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const bvh = new MeshBVH(colGeo);

  return { root, model, cfg, wheels, body, bvh, roofY, ws, rg };
}

// Connected mesh islands (vertices welded by position), with world-space stats per island.
function components(mesh) {
  const geo = mesh.geometry, pos = geo.attributes.position, m = mesh.matrixWorld;
  const n = pos.count;
  const index = geo.index ? geo.index.array : Array.from({ length: n }, (_, i) => i);
  const weld = new Int32Array(n), keyMap = new Map();
  for (let i = 0; i < n; i++) {
    const k = Math.round(pos.getX(i) * 1000) + ',' + Math.round(pos.getY(i) * 1000) + ',' + Math.round(pos.getZ(i) * 1000);
    if (!keyMap.has(k)) keyMap.set(k, keyMap.size);
    weld[i] = keyMap.get(k);
  }
  const parent = new Int32Array(keyMap.size).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < index.length; t += 3) {
    const a = find(weld[index[t]]), b = find(weld[index[t + 1]]), c = find(weld[index[t + 2]]);
    parent[a] = c; parent[find(b)] = c;
  }
  const rootId = new Map(), comps = [], triComp = new Int32Array(index.length / 3);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), E = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const r = find(weld[index[t]]);
    if (!rootId.has(r)) { rootId.set(r, comps.length); comps.push({ area: 0, cen: new THREE.Vector3(), nrm: new THREE.Vector3(), min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity) }); }
    const ci = rootId.get(r), c = comps[ci];
    triComp[t / 3] = ci;
    A.fromBufferAttribute(pos, index[t]).applyMatrix4(m);
    B.fromBufferAttribute(pos, index[t + 1]).applyMatrix4(m);
    C.fromBufferAttribute(pos, index[t + 2]).applyMatrix4(m);
    N.subVectors(C, B).cross(E.subVectors(A, B));
    const area = N.length() / 2;
    if (N.y < 0) N.negate(); // panels we care about face up
    c.area += area;
    c.nrm.add(N);
    c.cen.addScaledVector(A.clone().add(B).add(C).multiplyScalar(1 / 3), area);
    for (const P of [A, B, C]) { c.min.min(P); c.max.max(P); }
  }
  for (const c of comps) { if (c.area > 0) c.cen.multiplyScalar(1 / c.area); c.nrm.normalize(); }
  return { comps, triComp };
}

// Reorder triangle indices into material groups using a classifier(centroid, normal) → slot.
function splitByTriangle(mesh, classify) {
  const geo = mesh.geometry;
  if (geo.userData.split) return;
  if (!geo.index) {
    const idx = []; for (let i = 0; i < geo.attributes.position.count; i++) idx.push(i);
    geo.setIndex(idx);
  }
  const pos = geo.attributes.position, index = geo.index.array, m = mesh.matrixWorld;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cen = new THREE.Vector3(), n = new THREE.Vector3();
  const buckets = [[], [], [], []];
  for (let t = 0; t < index.length; t += 3) {
    a.fromBufferAttribute(pos, index[t]).applyMatrix4(m);
    b.fromBufferAttribute(pos, index[t + 1]).applyMatrix4(m);
    c.fromBufferAttribute(pos, index[t + 2]).applyMatrix4(m);
    cen.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    n.subVectors(c, b).cross(tmpV.subVectors(a, b)).normalize();
    // make normal point away from the car's center line (geometry winding is not reliable)
    const out = new THREE.Vector3(cen.x * 0.15, cen.y - 0.6, cen.z);
    if (n.dot(out) < 0) n.negate();
    buckets[classify(cen, n, t / 3)].push(index[t], index[t + 1], index[t + 2]);
  }
  const all = [];
  geo.clearGroups();
  let start = 0;
  buckets.forEach((bk, slot) => { if (!bk.length) return; all.push(...bk); geo.addGroup(start, bk.length, slot); start += bk.length; });
  geo.setIndex(all);
  geo.userData.split = true;
}

function planarUV(mesh, front) {
  const g = mesh.geometry;
  g.computeBoundingBox();
  const bb = g.boundingBox, s = bb.getSize(new THREE.Vector3());
  // plate face lies in the two largest local axes
  const axes = [['x', s.x], ['y', s.y], ['z', s.z]].sort((p, q) => q[1] - p[1]);
  const [u, v] = [axes[0][0], axes[1][0]];
  // orient texture: v must point up in the world, u must point to the viewer's right
  const basis = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
  mesh.matrixWorld.extractBasis(basis.x, basis.y, basis.z);
  const right = front ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 0, 1);
  const flipU = basis[u].dot(right) < 0, flipV = basis[v].y < 0;
  const pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const pu = (pos['get' + u.toUpperCase()](i) - bb.min[u]) / s[u];
    const pv = (pos['get' + v.toUpperCase()](i) - bb.min[v]) / s[v];
    uv[i * 2] = flipU ? 1 - pu : pu;
    uv[i * 2 + 1] = flipV ? 1 - pv : pv;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Car-space planar UVs (top-down) so carbon/patterns look right on paint panels.
function carSpaceUV(mesh) {
  const g = mesh.geometry;
  if (g.userData.carUV) return;
  const pos = g.attributes.position, m = mesh.matrixWorld, v = new THREE.Vector3();
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    uv[i * 2] = v.x * 1.2; uv[i * 2 + 1] = v.z * 1.2;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.userData.carUV = true;
}

// Surface/profile adapter so the body-kit code (written for the parametric body) works on the real model.
export function makeGLBProfile(baseP, tpl) {
  const { bvh, body, wheels, ws, rg } = tpl;
  const ray = new THREE.Ray();
  const cast = (ox, oy, oz, dx, dy, dz) => {
    ray.origin.set(ox, oy, oz); ray.direction.set(dx, dy, dz);
    const h = bvh.raycastFirst(ray, THREE.DoubleSide);
    return h ? h.point : null;
  };
  const xmin = body.min.x, xmax = body.max.x;
  const frontAt = (y, z) => cast(xmax + 1, y, z, -1, 0, 0)?.x ?? null;
  const rearAt = (y, z) => cast(xmin - 1, y, z, 1, 0, 0)?.x ?? null;
  const sideAt = (x, y) => { const p = cast(x, y, body.max.z + 1, 0, 0, -1); return p ? p.z : null; };
  const topAt = (x, z) => cast(x, body.max.y + 1, Math.abs(z), 0, -1, 0)?.y ?? null;
  const fr = wheels.FR, rr = wheels.RR;
  const clear = (() => { let m = Infinity; for (const z of [0, 0.3]) for (let x = rr.center.x + 0.4; x < fr.center.x - 0.4; x += 0.2) { const p = cast(x, -1, z, 0, 1, 0); if (p) m = Math.min(m, p.y); } return isFinite(m) ? m : baseP.gen.dims.clear; })();
  const secCache = new Map();
  function section(x) {
    const key = Math.round(x * 100);
    if (secCache.has(key)) return secCache.get(key);
    let hw = 0;
    for (const y of [0.4, 0.5, 0.6, 0.7, 0.8]) { const z = sideAt(x, y); if (z !== null) hw = Math.max(hw, z); }
    let yb = Infinity;
    for (const z of [0, hw * 0.5, hw * 0.85]) { const p = cast(x, -1, z, 0, 1, 0); if (p) yb = Math.min(yb, p.y); }
    if (!isFinite(yb)) yb = clear;
    const top = topAt(x, 0) ?? tpl.roofY;
    const s = { x, hw: hw || body.max.z, yb, top, rw: hw * 0.75, y6: Math.min(top - 0.03, 0.95), g: 0, h: 0, winH: 0, pts: Array.from({ length: 11 }, () => [hw, top]) };
    secCache.set(key, s);
    return s;
  }
  return {
    ...baseP, isGLB: true,
    xmin, xmax, L: xmax - xmin, W: body.max.z - body.min.z, roofY: tpl.roofY, clear,
    fAx: fr.center.x, rAx: rr.center.x, tireR: (rr.radius + fr.radius) / 2,
    trackZ: (Math.abs(fr.center.z) + Math.abs(rr.center.z)) / 2,
    xWsBase: ws.maxX, xWsTop: ws.minX, xRgBase: rg.minX, xRgTop: rg.maxX,
    frontAt, rearAt, sideAt, topAt, section,
  };
}

