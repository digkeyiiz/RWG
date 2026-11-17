// Inspect a .glb file: print the node tree, mesh/material names, and world-space
// bounding boxes — everything needed to write a catalog `glbConfig` entry.
// Usage: node tools/glb-inspect.mjs models/foo.glb [--mats] [--full]
//   --mats   also print each material's baseColorFactor + texture info
//   --full   print every node instead of stopping at depth 3
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/glb-inspect.mjs <file.glb> [--mats] [--full]'); process.exit(1); }
const flags = new Set(process.argv.slice(3));

const buf = fs.readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) { console.error('not a .glb (bad magic)'); process.exit(1); }
const jsonLen = buf.readUInt32LE(12);
if (buf.readUInt32LE(16) !== 0x4e4f534a) { console.error('first chunk is not JSON'); process.exit(1); }
const g = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));

// ---------- minimal mat4 (column-major like three.js/glTF) ----------
const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) { // a*b
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function trs(n) {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const xform = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

const matName = (i) => g.materials?.[i]?.name ?? `#${i}`;
function meshInfo(mi, m) { // returns {names, bbox} for a node with mesh index mi
  const mesh = g.meshes[mi];
  const names = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.primitives || []) {
    names.push(matName(p.material));
    const acc = g.accessors?.[p.attributes?.POSITION];
    if (acc) matVerts.set(matName(p.material), (matVerts.get(matName(p.material)) || 0) + (acc.count || 0));
    if (acc?.min && acc?.max) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], acc.min[i]); max[i] = Math.max(max[i], acc.max[i]); }
  }
  const corners = min[0] === Infinity ? null : [
    [min[0], min[1], min[2]], [min[0], min[1], max[2]], [min[0], max[1], min[2]], [min[0], max[1], max[2]],
    [max[0], min[1], min[2]], [max[0], min[1], max[2]], [max[0], max[1], min[2]], [max[0], max[1], max[2]],
  ].map((c) => xform(m, c));
  const wmin = [Infinity, Infinity, Infinity], wmax = [-Infinity, -Infinity, -Infinity];
  if (corners) for (const c of corners) for (let i = 0; i < 3; i++) { wmin[i] = Math.min(wmin[i], c[i]); wmax[i] = Math.max(wmax[i], c[i]); }
  return { mats: names, min: wmin, max: wmax, verts: (mesh.primitives || []).reduce((s, p) => s + (g.accessors?.[p.attributes?.POSITION]?.count || 0), 0) };
}

const f2 = (n) => Number(n).toFixed(2);
const fmtBox = (min, max) => min[0] === Infinity ? '—' : `[${min.map(f2)}]→[${max.map(f2)}]  (${max.map((v, i) => f2(v - min[i]))})`;

const scene = g.scenes[g.scene ?? 0];
const allMats = new Set(), matVerts = new Map(), wheelCands = [];
let nodeCount = 0, meshCount = 0, totalVerts = 0;
const body = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

function walk(ni, m, depth) {
  const n = g.nodes[ni];
  if (!n) return;
  nodeCount++;
  const wm = mul(m, trs(n));
  let line = `${'  '.repeat(depth)}• ${n.name || `(node ${ni})`}`;
  if (n.mesh !== undefined) {
    meshCount++;
    const info = meshInfo(n.mesh, wm);
    totalVerts += info.verts;
    info.mats.forEach((x) => allMats.add(x));
    const isWheel = /wheel|tyre|tire|rim|brake|disc|rotor|caliper/i.test(n.name || '');
    if (info.min[0] !== Infinity) {
      if (!isWheel) for (let i = 0; i < 3; i++) { body.min[i] = Math.min(body.min[i], info.min[i]); body.max[i] = Math.max(body.max[i], info.max[i]); }
      else wheelCands.push({ name: n.name, min: info.min, max: info.max });
    }
    line += `  ⤷ mesh "${g.meshes[n.mesh].name || ''}" mats=[${info.mats.join(', ')}] verts=${info.verts} bbox=${fmtBox(info.min, info.max)}`;
  } else if (n.translation) {
    line += `  @ [${n.translation.map(f2)}]`;
  }
  if (flags.has('--full') || depth < 3) console.log(line);
  for (const c of n.children || []) walk(c, wm, depth + 1);
}
for (const ni of scene.nodes || []) walk(ni, I(), 0);

console.log('\n=== SUMMARY ===');
console.log(`nodes=${nodeCount} meshes=${meshCount} verts=${totalVerts} materials=${g.materials?.length || 0} file=${(buf.length / 1e6).toFixed(1)}MB`);
console.log(`body bbox (non-wheel): ${fmtBox(body.min, body.max)}`);
console.log(`exts: ${(g.extensionsUsed || []).join(', ') || 'none'}`);

console.log('\n=== MATERIALS (for paint/windows/head/tail/recolor lists) ===');
(g.materials || []).forEach((mt, i) => {
  const c = mt.pbrMetallicRoughness?.baseColorFactor;
  const extra = flags.has('--mats') ? ` baseColor=[${(c || [1, 1, 1, 1]).map((v) => v.toFixed(2))}] tex=${mt.pbrMetallicRoughness?.baseColorTexture ? 'yes' : 'no'} alpha=${mt.alphaMode || 'OPAQUE'}` : '';
  console.log(`  ${matName(i)}${extra}`);
});

console.log('\n=== WHEEL CANDIDATES (name match wheel|tyre|tire|rim|brake) ===');
if (!wheelCands.length) console.log('  none found by name — pick 4 corner nodes manually from the tree above');
for (const w of wheelCands) console.log(`  ${w.name}  bbox=${fmtBox(w.min, w.max)}  center=[${w.min.map((v, i) => f2((v + w.max[i]) / 2))}]`);

// nose faces +X after rotY — guess orientation from the longer horizontal axis
const lenX = body.max[0] - body.min[0], lenZ = body.max[2] - body.min[2];
const rotGuess = lenZ > lenX ? 'Math.PI / 2 (model lies along Z; also try -Math.PI/2 if nose ends up facing -X)' : '0';

console.log('\n=== glbConfig draft ===');
console.log(`  rotY: ${rotGuess},`);
console.log(`  wheels: { FR: '?', FL: '?', RR: '?', RL: '?' }, // node names holding each wheel, or WHEEL_* anchors`);
console.log(`  anchorWheels: ${wheelCands.length ? 'false  // real wheel nodes found' : 'true   // add WHEEL_* anchors (see tools/glb-anchors.mjs)'},`);
const byVerts = [...matVerts.entries()].sort((a, b) => b[1] - a[1]);
console.log(`  paint: ['${byVerts[0]?.[0] || '?'}'], // largest material by verts: ${byVerts.slice(0, 4).map(([m, v]) => `${m}(${v})`).join(', ')}`);
console.log(`  windows: ['?'], head: ['?'], tail: ['?'],`);
