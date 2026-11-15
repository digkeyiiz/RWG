// Headless smoke test: node tools/fixtures/headless-test.mjs [dataDir]
// Stubs document/canvas, loads data, builds chunks, queries roadAt/groundHeight.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
const root = path.resolve(import.meta.dirname, '..', '..');
const dir = path.resolve(root, process.argv[2] || 'data');
const grad = { addColorStop: () => ({}) };
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'canvas' ? {} : k === 'createRadialGradient' ? () => grad : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w|0)*(h|0)*4)) }) : () => ({})), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
globalThis.fetch = async (u) => { const f = path.resolve(dir, path.basename(u)); if (!fs.existsSync(f)) return { ok: false }; return { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) }; };
// vendor three resolution: import map substitute
const THREE = await import(pathToFileURL(path.join(root, 'vendor/three/three.module.min.js')).href);
globalThis.__THREE = THREE;
let src = {};
for (const f of ['roadmesh', 'worldprops', 'thaimap', 'minimapLayer']) src[f] = fs.readFileSync(path.join(root, 'js/thai', f + '.js'), 'utf8')
  .replace(/from 'three'/g, `from '${pathToFileURL(path.join(root, 'vendor/three/three.module.min.js')).href}'`)
  .replace(/from '\.\.\/city\/physics\.js'/g, `from '${pathToFileURL(path.join(root, 'js/city/physics.js')).href}'`);
const tmp = path.join(root, 'tools/fixtures/.tmp'); fs.mkdirSync(tmp, { recursive: true });
for (const f in src) fs.writeFileSync(path.join(tmp, f + '.js'), src[f]);
const { ThaiMap } = await import(pathToFileURL(path.join(tmp, 'thaimap.js')).href);
const scene = new THREE.Scene();
const tm = new ThaiMap(scene, { quality: 2 });
let t = performance.now();
console.log('load', await tm.load(dir + path.sep), (performance.now() - t).toFixed(0) + 'ms');
const cx = +(process.argv[3] || 0), cz = +(process.argv[4] || 0);
t = performance.now(); tm.warm(new THREE.Vector3(cx, 10, cz), 100);
console.log('warm', tm.localLayer.chunks.size, 'local chunks', tm.coarseLayer.chunks.size, 'coarse', (performance.now() - t).toFixed(0) + 'ms');
let worst = 0, tris = 0, nonEmpty = 0;
for (const ch of tm.localLayer.chunks.values()) if (ch.g) { nonEmpty++; ch.g.traverse(o => { if (o.geometry) tris += o.geometry.index.count / 3; }); }
console.log('local tris', tris, 'non-empty chunks', nonEmpty);
// per-chunk build timing
const times = [];
for (const [k, ch] of tm.localLayer.chunks) { const s = performance.now(); tm.localLayer.build(ch.gx, ch.gz); times.push(performance.now() - s); }
times.sort((a, b) => a - b); console.log('chunk build ms median', times[times.length >> 1]?.toFixed(1), 'max', times.at(-1)?.toFixed(1));
let found = 0, elev = 0;
for (let i = 0; i < 2000; i++) { const x = cx + (Math.random() - 0.5) * 1500, z = cz + (Math.random() - 0.5) * 1500; if (tm.roadAt(x, z)) found++; if (tm.groundHeight(x, z) > 1) elev++; }
console.log('roadAt hits /2000', found, 'elevated hits', elev, 'sample', JSON.stringify(tm.roadAt(cx, cz)));
tm.update(new THREE.Vector3(cx, 10, cz), 0.016); tm.dispose(); fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok');
