// Shared .glb parsing helpers for the model tools (inspect / anchors / setup / verify).
// Pure Node — no three.js: reads the GLB container and walks the node tree with
// enough matrix math to produce world-space bounding boxes.
import fs from 'node:fs';

export function parseGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a .glb (bad magic)');
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('first chunk is not JSON');
  const g = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  let off = 20 + jsonLen, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    if (type === 0x004e4942) { bin = buf.subarray(off + 8, off + 8 + len); break; }
    off += 8 + len;
  }
  return { g, bin, buf };
}

export function writeGlb(file, g, bin) {
  const pad4 = (n) => (4 - (n % 4)) % 4;
  let jsonBuf = Buffer.from(JSON.stringify(g), 'utf8');
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad4(jsonBuf.length), 0x20)]);
  const binPad = Buffer.concat([bin, Buffer.alloc(pad4(bin.length))]);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + jsonBuf.length + 8 + binPad.length, 8);
  head.writeUInt32LE(jsonBuf.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(binPad.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([head, jsonBuf, binHead, binPad]));
}

// ---------- mat4 (column-major, glTF convention) ----------
export const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
export function trs(n) {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation || [0, 0, 0], [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz, xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0, (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0, (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, tx, ty, tz, 1];
}
export const xf = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

export const matName = (g, i) => g.materials?.[i]?.name ?? `#${i}`;

// world-space bbox of a node's mesh (null if no mesh/no bounds)
export function nodeBBox(g, n, wm) {
  if (n.mesh === undefined) return null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let verts = 0;
  for (const p of g.meshes[n.mesh].primitives || []) {
    const a = g.accessors?.[p.attributes?.POSITION];
    if (a) verts += a.count || 0;
    if (!a?.min) continue;
    for (const cx of [a.min[0], a.max[0]]) for (const cy of [a.min[1], a.max[1]]) for (const cz of [a.min[2], a.max[2]]) {
      const w = xf(wm, [cx, cy, cz]);
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], w[i]); max[i] = Math.max(max[i], w[i]); }
    }
  }
  return min[0] === Infinity ? null : { min, max, verts, mats: (g.meshes[n.mesh].primitives || []).map((p) => matName(g, p.material)) };
}

// walk scene tree — fn(node, worldMatrix, depth)
export function walkNodes(g, fn) {
  const scene = g.scenes[g.scene ?? 0];
  const rec = (ni, m, d) => {
    const n = g.nodes[ni]; if (!n) return;
    const wm = mul(m, trs(n));
    fn(n, wm, d);
    for (const c of n.children || []) rec(c, wm, d + 1);
  };
  for (const ni of scene.nodes || []) rec(ni, I(), 0);
}

export const WHEEL_RE = /wheel|tyre|tire|rim|brake|disc|rotor|caliper/i;

// detect wheel-ish nodes → [{name, c:[x,y,z], s:[dx,dy,dz]}]
export function detectWheels(g, re = WHEEL_RE) {
  const hits = [];
  walkNodes(g, (n, wm) => {
    if (!re.test(n.name || '')) return;
    const b = nodeBBox(g, n, wm);
    if (b) hits.push({ n: n.name, c: b.min.map((v, i) => (v + b.max[i]) / 2), s: b.min.map((v, i) => b.max[i] - v) });
  });
  return hits;
}

// inject invisible WHEEL_* anchor boxes (shared by glb-anchors.mjs and glb-setup.mjs)
// yBase = model-space Y of the ground plane (wheel bottoms) — many source files don't sit at y=0
export function injectAnchors(g, bin, named, { fwdAxis = 2, dia = 0.6, wid = 0.19, yBase = 0 } = {}) {
  let anchorMat = (g.materials || []).findIndex((m) => m.name === 'anchor');
  if (anchorMat < 0) anchorMat = (g.materials ||= []).push({ name: 'anchor', pbrMetallicRoughness: { baseColorFactor: [1, 0, 1, 1] } }) - 1;
  const posArr = [];
  for (const c of Object.values(named)) {
    const hx = (fwdAxis === 0 ? wid : dia) / 2, hz = (fwdAxis === 0 ? dia : wid) / 2, hy = dia / 2;
    for (const v of [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]])
      posArr.push(v[0] + c[0], v[1] + hy + yBase, v[2] + c[2]);
  }
  const q = [[0, 1, 2, 0, 2, 3], [4, 6, 5, 4, 7, 6], [0, 4, 5, 0, 5, 1], [2, 6, 7, 2, 7, 3], [0, 3, 7, 0, 7, 4], [1, 5, 6, 1, 6, 2]];
  const pad4 = (n) => (4 - (n % 4)) % 4;
  const posBuf = Buffer.from(new Float32Array(posArr).buffer), idxBuf = Buffer.from(new Uint16Array(q.flat()).buffer);
  const posOff = bin.length + pad4(bin.length);
  const newBin = Buffer.concat([bin, Buffer.alloc(pad4(bin.length)), posBuf, idxBuf]);
  g.bufferViews ||= []; g.accessors ||= []; g.meshes ||= []; g.nodes ||= [];
  const bvPos = g.bufferViews.push({ buffer: 0, byteOffset: posOff, byteLength: posBuf.length }) - 1;
  const bvIdx = g.bufferViews.push({ buffer: 0, byteOffset: posOff + posBuf.length, byteLength: idxBuf.length }) - 1;
  const accIdx = g.accessors.push({ bufferView: bvIdx, componentType: 5123, count: idxBuf.length / 2, type: 'SCALAR' }) - 1;
  g.buffers[0].byteLength = newBin.length;
  const nodeIds = [];
  let vOff = 0;
  for (const [name, c] of Object.entries(named)) {
    const lo = [c[0] - (fwdAxis === 0 ? wid : dia) / 2, yBase, c[2] - (fwdAxis === 0 ? dia : wid) / 2];
    const hi = [c[0] + (fwdAxis === 0 ? wid : dia) / 2, yBase + dia, c[2] + (fwdAxis === 0 ? dia : wid) / 2];
    const aP = g.accessors.push({ bufferView: bvPos, byteOffset: vOff * 12, componentType: 5126, count: 8, type: 'VEC3', min: lo, max: hi }) - 1;
    const mi = g.meshes.push({ name, primitives: [{ attributes: { POSITION: aP }, indices: accIdx, material: anchorMat }] }) - 1;
    nodeIds.push(g.nodes.push({ name, mesh: mi }) - 1);
    vOff += 8;
  }
  g.scenes[g.scene ?? 0].nodes.push(...nodeIds);
  return newBin;
}

// label 4 wheel centers → {WHEEL_RF, WHEEL_LF, WHEEL_RR, WHEEL_LR}
export function labelCorners(centers, { fwdAxis = null, fwdSign = 1 } = {}) {
  if (fwdAxis === null) {
    const xs = centers.map((c) => c[0]), zs = centers.map((c) => c[2]);
    fwdAxis = (Math.max(...xs) - Math.min(...xs)) > (Math.max(...zs) - Math.min(...zs)) ? 0 : 2;
  }
  const rightAxis = fwdAxis === 0 ? 2 : 0;
  // car-space right = forward × up (right-handed): fwd +z → right −x ; fwd +x → right +z
  const rightSign = fwdSign * (fwdAxis === 2 ? -1 : 1);
  const midF = centers.reduce((s, c) => s + c[fwdAxis], 0) / 4 * fwdSign;
  const midR = centers.reduce((s, c) => s + c[rightAxis], 0) / 4 * rightSign;
  const named = {};
  for (const c of centers) {
    const front = c[fwdAxis] * fwdSign > midF, right = c[rightAxis] * rightSign > midR;
    named[front ? (right ? 'WHEEL_RF' : 'WHEEL_LF') : (right ? 'WHEEL_RR' : 'WHEEL_LR')] = c;
  }
  return Object.keys(named).length === 4 ? { named, fwdAxis, fwdSign } : null;
}
