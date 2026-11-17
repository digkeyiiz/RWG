// Inject invisible WHEEL_* anchor meshes into a .glb so the game can fit its own
// spinning/steering wheels (the `anchorWheels: true` pattern used by every GLB car).
// No Blender needed — appends tiny box meshes at the detected wheel positions.
//
// Usage:
//   node tools/glb-anchors.mjs in.glb out.glb [--facing +z|-z|+x|-x] [--regex "wheel|tyre"] [--at "x,z;x,z;x,z;x,z"] [--size d,w] [--ybase y]
//
//   --facing  which model-space direction is the car's nose (default: longer axis, + direction)
//   --regex   node-name pattern marking source wheels/tyres (default: wheel|tyre|tire|rim)
//   --at      manual wheel centers "x,z;x,z;x,z;x,z" in model space (any order — corners labeled by --facing)
//   --size    anchor box "diameter,width" (default: detected, or 0.60,0.19)
//   --ybase   model-space Y of the ground plane (default: detected wheel bottom, else 0)
import fs from 'node:fs';
import { parseGlb, writeGlb, detectWheels, injectAnchors, labelCorners } from './glb-lib.mjs';

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) { console.error('usage: node tools/glb-anchors.mjs <in.glb> <out.glb> [--facing] [--regex] [--at] [--size] [--ybase]'); process.exit(1); }
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };

const { g, bin } = parseGlb(inFile);
let centers = [], dia = 0.6, wid = 0.19, yBase = 0;

const manual = arg('--at');
if (manual) {
  centers = manual.split(';').map((s) => s.split(',').map(Number));
  if (centers.length !== 4 || centers.some((c) => c.length !== 2 || c.some(isNaN))) { console.error('--at wants "x,z;x,z;x,z;x,z"'); process.exit(1); }
  const size = arg('--size'); if (size) [dia, wid] = size.split(',').map(Number);
  yBase = Number(arg('--ybase') || 0);
} else {
  const hits = detectWheels(g, arg('--regex') ? new RegExp(arg('--regex'), 'i') : undefined);
  if (hits.length < 4) { console.error(`found ${hits.length} wheel-ish nodes — pass --at "x,z;..." manually`); process.exit(1); }
  hits.sort((a, b) => (b.s[0] + b.s[2]) - (a.s[0] + a.s[2]));
  const big = hits.slice(0, 4);
  centers = big.map((h) => h.c);
  dia = Math.max(...big.map((h) => Math.max(h.s[0], h.s[2]))) * 0.98;
  wid = Math.min(...big.map((h) => Math.min(h.s[0], h.s[2])));
  yBase = Number(arg('--ybase') ?? Math.min(...big.map((h) => h.c[1] - h.s[1] / 2)));
  console.log(`detected wheels @ ${centers.map((c) => `[${c.map((v) => v.toFixed(2))}]`).join(' ')}  dia≈${dia.toFixed(2)} width≈${wid.toFixed(2)} yBase=${yBase.toFixed(2)}`);
}

const facing = arg('--facing');
const pts = centers.map((c) => (c.length === 2 ? [c[0], 0, c[1]] : c));
const lc = labelCorners(pts, facing ? { fwdAxis: facing[1] === 'x' ? 0 : 2, fwdSign: facing[0] === '-' ? -1 : 1 } : {});
if (!lc) { console.error('could not label 4 corners — check --at/--facing'); process.exit(1); }
console.log(`facing=${lc.fwdAxis === 0 ? 'x' : 'z'} sign=${lc.fwdSign} → ${Object.entries(lc.named).map(([k, v]) => `${k}=[${v.map((x) => x.toFixed(2))}]`).join(' ')}`);

const newBin = injectAnchors(g, bin, lc.named, { fwdAxis: lc.fwdAxis, dia, wid, yBase });
writeGlb(outFile, g, newBin);
console.log(`wrote ${outFile} — verify with: node tools/glb-inspect.mjs ${outFile}`);
