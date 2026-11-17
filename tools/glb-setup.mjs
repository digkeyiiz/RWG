// One-command onboarding for a Sketchfab .glb:
//   node tools/glb-setup.mjs models/<car>.glb [--id my-car] [--facing +z|-z|+x|-x] [--no-anchors]
//
// 1. parses the file, reports size/bbox/materials
// 2. detects unit scale (warns if the model isn't in meters → emits cfg.scale)
// 3. detects wheel nodes; if <4 usable ones, injects WHEEL_* anchors in place (.bak kept)
// 4. guesses material roles by name (paint / windows / head / tail / mirror / interior / trim)
// 5. prints a ready-to-paste GENERATIONS catalog entry
import fs from 'node:fs';
import path from 'node:path';
import { parseGlb, writeGlb, walkNodes, nodeBBox, detectWheels, injectAnchors, labelCorners, WHEEL_RE } from './glb-lib.mjs';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/glb-setup.mjs <file.glb> [--id id] [--facing +z|-z|+x|-x] [--no-anchors]'); process.exit(1); }
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const has = (k) => process.argv.includes(k);

const { g, bin } = parseGlb(file);
const base = path.basename(file, '.glb');
const id = arg('--id') || base.replace(/[^a-z0-9-]/gi, '-').toLowerCase();

// ---------- body bbox + scale sanity ----------
const body = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
const matVerts = new Map(), nodeNames = new Set(), hideable = [];
let verts = 0;
walkNodes(g, (n, wm) => {
  if (n.name) nodeNames.add(n.name);
  const b = nodeBBox(g, n, wm);
  if (!b) return;
  verts += b.verts;
  b.mats.forEach((m) => matVerts.set(m, (matVerts.get(m) || 0) + (b.verts / b.mats.length)));
  if (WHEEL_RE.test(n.name || '')) { hideable.push(n.name); return; }
  for (let i = 0; i < 3; i++) { body.min[i] = Math.min(body.min[i], b.min[i]); body.max[i] = Math.max(body.max[i], b.max[i]); }
});
const size = body.max.map((v, i) => v - body.min[i]);
const lenAxis = size[0] > size[2] ? 0 : 2, rawLen = size[lenAxis];
let scale = 1, scaleNote = '';
if (rawLen > 20) { scale = 0.01; scaleNote = `⚠ model looks like centimeters (${rawLen.toFixed(0)} long) — emitting scale: 0.01`; }
else if (rawLen < 0.2) { scale = 100; scaleNote = `⚠ model looks tiny (${rawLen.toFixed(3)}) — emitting scale: 100`; }
else if (rawLen < 3 || rawLen > 6.5) scaleNote = `⚠ body length ${rawLen.toFixed(2)} is odd for a car (3.5–5.5m typical) — check units`;
const len = rawLen * scale, widM = size[lenAxis === 0 ? 2 : 0] * scale, hgt = size[1] * scale;
console.log(`${file}: ${verts.toLocaleString()} verts, ${g.materials?.length || 0} materials`);
console.log(`body bbox ${body.min.map((v) => v.toFixed(2))}→${body.max.map((v) => v.toFixed(2))} → ${len.toFixed(2)}×${widM.toFixed(2)}×${hgt.toFixed(2)}m${scaleNote ? '  ' + scaleNote : ''}`);

// ---------- wheels ----------
const hits = detectWheels(g).filter((h) => Math.max(h.s[0], h.s[2]) < 1.4 * scale && Math.max(h.s[0], h.s[2]) > 0.2 * scale);
let anchorInfo = null;
if (hits.length >= 4 && !has('--no-anchors')) {
  hits.sort((a, b) => (b.s[0] + b.s[2]) - (a.s[0] + a.s[2]));
  const big = hits.slice(0, 4);
  const facing = arg('--facing');
  const lc = labelCorners(big.map((h) => h.c), facing ? { fwdAxis: facing[1] === 'x' ? 0 : 2, fwdSign: facing[0] === '-' ? -1 : 1 } : { fwdAxis: lenAxis });
  if (lc) {
    const dia = Math.max(...big.map((h) => Math.max(h.s[0], h.s[2]))) * 0.98;
    fs.copyFileSync(file, file + '.bak');
    const newBin = injectAnchors(g, bin, lc.named, { fwdAxis: lc.fwdAxis, dia, wid: Math.min(...big.map((h) => Math.min(h.s[0], h.s[2]))) });
    writeGlb(file, g, newBin);
    anchorInfo = { dia };
    console.log(`injected WHEEL_* anchors (backup: ${file}.bak) — source wheel nodes to hide: ${big.map((h) => `'${h.n}'`).join(', ')}`);
  }
} else if (hits.length < 4) {
  const centers = hits.map((h) => h.c);
  while (centers.length < 4) centers.push(null);
  console.log(`only ${hits.length} wheel-ish nodes — injecting anchors at guessed corners; verify with glb-inspect`);
  // guess from bbox: 4 corners at ~70% width, wheel split 62/38 of length
  const f = body.max[lenAxis] - size[lenAxis] * 0.31, r = body.min[lenAxis] + size[lenAxis] * 0.31;
  const w = widM / scale * 0.42, rAxis = lenAxis === 0 ? 2 : 0;
  const mk = (fa, ra) => { const c = [0, 0, 0]; c[lenAxis] = fa; c[rAxis] = ra; return c; };
  const lc = { WHEEL_RF: mk(f, w), WHEEL_LF: mk(f, -w), WHEEL_RR: mk(r, w), WHEEL_LR: mk(r, -w) };
  fs.copyFileSync(file, file + '.bak');
  const newBin = injectAnchors(g, bin, lc, { fwdAxis: lenAxis, dia: hgt * 0.42, wid: hgt * 0.42 * 0.35 });
  writeGlb(file, g, newBin);
  anchorInfo = { dia: hgt * 0.42 };
  console.log(`injected WHEEL_* anchors at estimated corners (backup: ${file}.bak) — CHECK positions with glb-inspect`);
}

// ---------- material role guesses ----------
const mats = [...matVerts.keys()];
const pick = (re) => mats.filter((m) => re.test(m));
const paint = pick(/paint|body|carpaint|color|lak|emal/i).filter((m) => !/window|glass|rim|tire/i.test(m));
if (!paint.length) { // fallback: biggest material that isn't obviously interior/trim
  const top = [...matVerts.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m)
    .filter((m) => !/interior|seat|dash|cockpit|wheel|tire|glass|chrome|plastic|black/i.test(m));
  if (top[0]) paint.push(top[0]);
}
const guess = {
  paint,
  windows: pick(/glass|window|windshield|windscreen|glaz/i),
  head: pick(/head|lowbeam|highbeam|front.?light|light.?f|lamp.?f|left.?head|right.?head/i),
  tail: pick(/tail|rear.?light|brake|stop|redglass|reverselight|back.?light|light.?r/i),
  mirror: pick(/mirror/i),
  interior: pick(/interior|cockpit|seat|dash|steer|salon|kabin/i),
  trim: pick(/plastic|trim|bumper|chrome|grill|grille|black/i),
};
for (const [k, v] of Object.entries(guess)) if (v.length) console.log(`  ${k}: ${v.map((m) => `'${m}'`).join(', ')}`);

// ---------- catalog entry draft ----------
const WB = anchorInfo ? (() => { const ax = [body.min[lenAxis], body.max[lenAxis]]; return ((ax[1] - ax[0]) * 0.62 * scale).toFixed(2); })() : '2.60';
const hide = ["WHEEL_RF", "WHEEL_LF", "WHEEL_RR", "WHEEL_LR", ...hideable.filter((n) => !/^WHEEL_/.test(n))];
console.log(`
// ─── paste into GENERATIONS in js/catalog.js ───
{
  id: '${id}', make: '?', model: '?', name: '${base}', years: '?', code: '?',
  glb: 'models/${base}.glb',
  glbConfig: {
    rotY: ${lenAxis === 2 ? 'Math.PI / 2' : '0'}, // ${scaleNote ? 'scale first, then ' : ''}nose must face +X — flip sign/axis if backwards${scale !== 1 ? `,
    scale: ${scale},` : ''}
    wheels: { FR: 'WHEEL_RF', FL: 'WHEEL_LF', RR: 'WHEEL_RR', RL: 'WHEEL_LR' },
    hide: [${hide.map((n) => `'${n}'`).join(', ')}],
    anchorWheels: true,
    paint: [${paint.map((m) => `'${m}'`).join(', ') || `'?'`}],
    windows: [${guess.windows.map((m) => `'${m}'`).join(', ') || `'?'`}],
    head: [${guess.head.map((m) => `'${m}'`).join(', ') || `'?'`}],
    tail: [${guess.tail.map((m) => `'${m}'`).join(', ') || `'?'`}],
    mirror: [${guess.mirror.map((m) => `'${m}'`).join(', ')}], interiorMats: [${guess.interior.map((m) => `'${m}'`).join(', ')}],
    recolor: { /* 'trim-mat': '#17181a' — for default-grey plastic: ${guess.trim.slice(0, 4).join(', ') || 'none detected'} */ },
  },
  credit: { text: '"<sketchfab title>" โดย <author> — CC BY 4.0', url: '<sketchfab url>' },
  dims: { L: ${len.toFixed(2)}, W: ${widM.toFixed(2)}, H: ${hgt.toFixed(2)}, WB: ${WB}, fOH: 0.85, clear: 0.14 },
  body: { hoodY: ${(hgt * 0.66).toFixed(2)}, trunkY: ${(hgt * 0.7).toFixed(2)}, beltY: ${(hgt * 0.68).toFixed(2)}, beltRise: 0.04, noseDrop: 0.20, tailDrop: 0.06,
          rg: [0.16, 0.30], ws: [0.56, 0.75], roofRatio: 0.75 },
  tire: { width: 195, aspect: 55, rim: 16 },
  style: { head: 'swept', grille: 'bar', lower: 'wideSlot', tail: 'wrap', fog: true, drl: false, sharkfin: false },
  colors: ['#f4f4f0', '#c3c6ca', '#0f1013', '#9e1219', '#2b4e7d'],
},
// fill in: make/model/years/code, real tire spec, engine spec (see sibling entries), colors
// verify: node tools/glb-verify.mjs  →  then cp ${file} public/${file}
`);
