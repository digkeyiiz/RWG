// Cross-check every `glb:` entry in js/catalog.js against its actual .glb file:
// file exists (models/ + public/models/), all cfg.wheels/hide node names exist,
// all material lists (paint/windows/head/tail/mirror/interior/recolor/hideMats) exist,
// plates node names exist, and body length is car-plausible.
// Usage: node tools/glb-verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlb, walkNodes, nodeBBox } from './glb-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'js/catalog.js'), 'utf8');

// extract each entry block containing `glb:` — balanced-brace scan
function extractConfigs() {
  const out = [];
  let i = -1;
  while ((i = src.indexOf('glbConfig:', i + 1)) > -1) {
    let j = src.indexOf('{', i), depth = 0, k = j;
    for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}' && --depth === 0) break; }
    const cfg = eval(`(${src.slice(j, k + 1)})`); // safe: repo source, contains Math.PI
    // associate with THIS entry: nearest `id:` before glbConfig, then `glb:` between the two
    const before = src.slice(Math.max(0, i - 3000), i);
    const lastId = [...before.matchAll(/id: '([^']+)'/g)].pop();
    const idm = lastId?.[1];
    const afterId = lastId ? before.slice(lastId.index) : before;
    const gm = /glb:\s*(null|'([^']+)')/.exec(afterId)?.[2] ?? null; // null path → removed file, skip
    out.push({ id: idm, glb: gm, cfg });
  }
  return out;
}

// material names vs node names differ by field (see glbcar.js): interior/plates/wheels/hide/calipers are NODES
const MAT_KEYS = ['paint', 'windows', 'head', 'tail', 'mirror', 'hideMats', 'interiorMats'];
const NODE_LIST_KEYS = ['hide', 'interior'];
let fail = 0;
for (const { id, glb, cfg } of extractConfigs()) {
  if (!glb) { console.log(`- ${id}  (glb: null — no file, skipped)`); continue; }
  const rel = glb.replace(/^models\//, '');
  const file = path.join(ROOT, 'models', rel);
  const pub = path.join(ROOT, 'public/models', rel);
  const errs = [], warns = [];
  if (!fs.existsSync(file)) errs.push(`missing ${file}`);
  if (pub && !fs.existsSync(pub)) warns.push(`missing ${pub} (not synced yet)`);
  if (errs.length === 0) {
    try {
      const { g } = parseGlb(file);
      const nodeNames = new Set(), mats = new Set();
      walkNodes(g, (n) => { if (n.name) nodeNames.add(n.name); });
      (g.materials || []).forEach((m) => mats.add(m.name));
      for (const [k, n] of Object.entries(cfg.wheels || {})) if (!nodeNames.has(n)) errs.push(`wheels.${k}: node '${n}' not found`);
      for (const [k, n] of Object.entries(cfg.calipers || {})) if (!nodeNames.has(n)) errs.push(`calipers.${k}: node '${n}' not found`);
      if (cfg.rimNode && !nodeNames.has(cfg.rimNode)) errs.push(`rimNode '${cfg.rimNode}' not found`);
      for (const key of NODE_LIST_KEYS) for (const n of cfg[key] || []) if (!nodeNames.has(n)) warns.push(`${key}: node '${n}' not found`);
      for (const key of MAT_KEYS) for (const m of cfg[key] || []) if (!mats.has(m)) errs.push(`${key}: material '${m}' not found`);
      for (const m of Object.keys(cfg.recolor || {})) if (!mats.has(m)) errs.push(`recolor: material '${m}' not found`);
      for (const [k, n] of Object.entries(cfg.plates || {})) if (n && !nodeNames.has(n)) errs.push(`plates.${k}: node '${n}' not found`);
      // plausibility: body length in meters after scale — measured on paint meshes when known
      const paintSet = new Set(cfg.paint || []);
      const b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
      let sawPaint = false;
      walkNodes(g, (n, wm) => {
        const bb = nodeBBox(g, n, wm);
        if (!bb) return;
        const isPaint = paintSet.size && bb.mats.some((m) => paintSet.has(m));
        if (paintSet.size ? !isPaint : /wheel|tyre|tire|WHEEL_/.test(n.name || '')) return;
        sawPaint = sawPaint || isPaint;
        for (let i = 0; i < 3; i++) { b.min[i] = Math.min(b.min[i], bb.min[i]); b.max[i] = Math.max(b.max[i], bb.max[i]); }
      });
      const L = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) * (cfg.scale || 1);
      if (L < 3 || L > 6.5) warns.push(`scaled length ${L.toFixed(2)}m looks off (check scale/rotY)`);
    } catch (e) { errs.push(`parse failed: ${e.message}`); }
  }
  const status = errs.length ? '❌' : warns.length ? '⚠' : '✓';
  console.log(`${status} ${id}  ${glb}`);
  for (const e of errs) { console.log(`    ✗ ${e}`); fail++; }
  for (const w of warns) console.log(`    ~ ${w}`);
}
console.log(fail ? `\n${fail} error(s)` : '\nALL-OK');
process.exit(fail ? 1 : 0);
