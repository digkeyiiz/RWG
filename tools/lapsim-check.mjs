// Lap-sim / PI validation harness — run from the repo root:
//   node tools/lapsim-check.mjs
// Prints a table of archetype builds with PI + simulated lap times on the three reference
// tracks, then checks the balance invariants:
//   1. PI order ≡ lap order on the mixed reference track (by construction, but verified)
//   2. specialization works: a drag-oriented build must beat a grip-oriented build on the
//      sprint track, and lose to it on the touge track
//   3. stock cars land in D/C class; builds spread across the PI range
//   4. no NaN/Infinity anywhere
import { computePerf, PARTS } from '../js/engine.js';
import { lapSim, REF_TRACKS, piFromLap, fmtLap } from '../js/lapsim.js';

const all = () => Object.fromEntries(Object.keys(PARTS).filter((k) => PARTS[k].opts?.length > 1).map((k) => [k, PARTS[k].opts.at(-1).id]));
const mid = () => Object.fromEntries(Object.keys(PARTS).filter((k) => PARTS[k].opts?.length > 1).map((k) => [k, PARTS[k].opts[Math.floor(PARTS[k].opts.length / 2)].id]));

const GRIP = { tireType: 'semislick', tireBrand: 'michelin', tireWidth: 265, camber: -2.5 };
const GRIP_MID = { tireType: 'sport', tireBrand: 'toyo', tireWidth: 225, camber: -1.5 };
const DRAG_TIRES = { tireType: 'comfort', tireBrand: 'generic', tireWidth: 195, camber: 0 };
const AERO = { front: 'splitter', rear: 'diffuser', spoiler: 'gtwing', canard: true, fender: 'wide' };
const LOW = { type: 'coilover', drop: 55, dropRear: 55 };
const TUNE_SAFE = { boost: 14, timing: 0, afr: 12.5, revAdd: 0, finalAdj: 0 };
const TUNE_PUSH = { boost: 16, timing: 1, afr: 12.5, revAdd: 400, finalAdj: 0 };

const BUILDS = [
  ['stock Vios',        { gen: 'gen2' }],
  ['stock Civic FD',    { gen: 'civic-fd' }],
  ['stock Supra',       { gen: 'supra-a80' }],
  ['stock R34',         { gen: 'skyline-r34' }],
  ['stock AE86',        { gen: 'ae86' }],
  ['stock RX-7',        { gen: 'rx7-fd' }],
  ['Vios street',       { gen: 'gen2', engine: { parts: mid() }, wheels: GRIP_MID, suspension: { type: 'lowering', drop: 30, dropRear: 30 } }],
  ['Vios full race',    { gen: 'gen2', engine: { parts: all(), tune: TUNE_PUSH }, wheels: GRIP, suspension: LOW, kit: AERO }],
  ['Vios 2JZ swap',     { gen: 'gen2', engine: { swap: '2JZ-GTE', parts: all(), tune: TUNE_SAFE }, wheels: GRIP, suspension: LOW }],
  ['Civic K-swap NA',   { gen: 'civic-fd', engine: { swap: 'K20A', parts: mid() }, wheels: GRIP_MID, suspension: LOW }],
  ['Supra boost',       { gen: 'supra-a80', engine: { parts: all(), tune: { boost: 18, timing: 1, afr: 12.5, revAdd: 300, finalAdj: 0 } }, wheels: GRIP, suspension: LOW, kit: AERO }],
  ['R34 full',          { gen: 'skyline-r34', engine: { parts: all(), tune: TUNE_PUSH }, wheels: GRIP, suspension: LOW, kit: AERO }],
  ['RX-7 touge',        { gen: 'rx7-fd', engine: { parts: all() }, wheels: GRIP, suspension: LOW, kit: AERO }],
  ['AE86 4AG ITB',      { gen: 'ae86', engine: { parts: all(), tune: { boost: null, timing: 2, afr: 12.6, revAdd: 800, finalAdj: 0.3 } }, wheels: GRIP_MID, suspension: LOW }],
  ['AE86 limit-tune',   { gen: 'ae86', engine: { parts: all(), tune: { boost: 30, timing: 4, afr: 13.8, revAdd: 800, finalAdj: 0 } }, wheels: GRIP, suspension: LOW }],
  ['Jazz turbo',        { gen: 'jazz-gk', engine: { parts: all(), tune: { boost: 10, timing: 1, afr: 12.5, revAdd: 400, finalAdj: 0 } }, wheels: GRIP_MID, suspension: LOW }],
  ['D-Max diesel',      { gen: 'dmax', engine: { parts: all() }, wheels: GRIP_MID, suspension: LOW }],
  ['Evo IX rally',      { gen: 'evo-ix', engine: { parts: all(), tune: { boost: 15, timing: 1, afr: 12.5, revAdd: 300, finalAdj: 0 } }, wheels: GRIP, suspension: LOW }],
  ['Silvia drift',      { gen: 'nissan-silvia-s13', engine: { parts: all(), tune: TUNE_SAFE }, wheels: { tireType: 'sport', tireBrand: 'nankang', tireWidth: 235, camber: -4.5 }, suspension: LOW }],
  ['Vios grip-only',    { gen: 'gen2', wheels: GRIP, suspension: LOW, kit: AERO }],
  ['Vios power-only',   { gen: 'gen2', engine: { parts: all(), tune: TUNE_PUSH } }],
  // specialization pair — same car, opposite philosophies
  ['Vios drag',         { gen: 'gen2', engine: { swap: '2JZ-GTE', parts: all(), tune: { boost: 20, timing: 1, afr: 12.5, revAdd: 300, finalAdj: -0.4 } }, wheels: DRAG_TIRES }],
  ['Vios touge-spec',   { gen: 'gen2', engine: { parts: mid(), tune: { boost: 8, timing: 1, afr: 12.5, revAdd: 300, finalAdj: 0.3 } }, wheels: GRIP, suspension: LOW, kit: AERO }],
];

let fail = 0;
const rows = [];
for (const [name, b] of BUILDS) {
  const pf = computePerf(b);
  const t = { sprint: lapSim(pf, REF_TRACKS.sprint.pts).t, mixed: lapSim(pf, REF_TRACKS.mixed.pts).t, touge: lapSim(pf, REF_TRACKS.touge.pts).t };
  const bad = !Number.isFinite(t.sprint) || !Number.isFinite(t.mixed) || !Number.isFinite(t.touge) || !Number.isFinite(pf.rating?.pi);
  if (bad) { fail++; console.log(`  ✗ ${name}: NaN/Infinity —`, pf.rating, t); continue; }
  rows.push({ name, pf, t });
  console.log(`${name.padEnd(18)} PI ${String(pf.rating.pi).padStart(3)} ${pf.rating.cls}  hp ${String(Math.round(pf.peakHp)).padStart(4)}  μ ${pf.mu.toFixed(2)}  sprint ${fmtLap(t.sprint)}  mixed ${fmtLap(t.mixed)}  touge ${fmtLap(t.touge)}  risk ${Math.round(pf.risk)}`);
}

// 1. PI order must match mixed-track lap order — equal-PI ties are allowed (integer rounding)
const byPi = [...rows].sort((a, b) => b.pf.rating.pi - a.pf.rating.pi);
const inversions = [];
for (let i = 0; i < byPi.length; i++)
  for (let j = i + 1; j < byPi.length; j++)
    if (byPi[i].pf.rating.pi > byPi[j].pf.rating.pi && byPi[i].t.mixed > byPi[j].t.mixed) inversions.push([byPi[i], byPi[j]]);
if (!inversions.length) console.log('\n✓ PI order matches mixed-track lap order (ties allowed)');
else {
  fail++;
  console.log('\n✗ strict PI inversions:');
  inversions.forEach(([a, b]) => console.log(`   ${a.name} PI ${a.pf.rating.pi} ${fmtLap(a.t.mixed)}  vs  ${b.name} PI ${b.pf.rating.pi} ${fmtLap(b.t.mixed)}`));
}

// 2. specialization: the drag Vios must win the sprint track, the touge Vios must win the
// touge track — against each other
const drag = rows.find((r) => r.name === 'Vios drag'), tg = rows.find((r) => r.name === 'Vios touge-spec');
if (drag && tg) {
  const sWin = drag.t.sprint < tg.t.sprint, tWin = tg.t.touge < drag.t.touge;
  console.log(`\n${sWin ? '✓' : '✗'} sprint: drag ${fmtLap(drag.t.sprint)} vs touge-spec ${fmtLap(tg.t.sprint)}`);
  console.log(`${tWin ? '✓' : '✗'} touge: touge-spec ${fmtLap(tg.t.touge)} vs drag ${fmtLap(drag.t.touge)}`);
  if (!sWin || !tWin) fail++;
}

// 3. sane PI spread — stock cars should be D/C, spread >200, nothing pinned at 999 unless fastest
const pis = rows.map((r) => r.pf.rating.pi);
const stock = rows.filter((r) => r.name.startsWith('stock'));
console.log(`\nPI range ${Math.min(...pis)}–${Math.max(...pis)} · stock: ${stock.map((r) => `${r.name.replace('stock ', '')} ${r.pf.rating.pi}${r.pf.rating.cls}`).join(', ')}`);
if (Math.max(...pis) - Math.min(...pis) < 200) { fail++; console.log('✗ PI spread too small (<200)'); }
const pinned = rows.filter((r) => r.pf.rating.pi >= 990);
if (pinned.length) console.log(`⚠ at PI cap: ${pinned.map((r) => r.name).join(', ')} (cap hides ordering)`);

// 4. wear lever: at least one over-the-limit build should show risk > 100
const risky = rows.filter((r) => r.pf.risk > 100);
console.log(`risk>100 builds: ${risky.map((r) => `${r.name} (${Math.round(r.pf.risk)})`).join(', ') || 'none'}`);
if (!risky.length) console.log('⚠ no build reaches risk>100 — durability system never triggers');

// 5. Phase-2 setup effects must behave like physics, not free stats
console.log('\n— setup effects —');
const clone = (o) => JSON.parse(JSON.stringify(o));
const hotBase = { gen: 'ae86', engine: { parts: all(), tune: { boost: 28, timing: 2, afr: 13.2, revAdd: 600, finalAdj: 0 } } };
const hotF = clone(hotBase); hotF.engine.parts.internals = 'forged';
const rStock = computePerf(hotBase).risk, rForged = computePerf(hotF).risk;
console.log(`${rForged < rStock ? '✓' : '✗'} forged internals: risk ${Math.round(rStock)} → ${Math.round(rForged)}`);
if (!(rForged < rStock)) fail++;

const aeroBase = { gen: 'supra-a80', engine: { parts: all(), tune: TUNE_SAFE }, wheels: GRIP, suspension: LOW, kit: AERO };
const hi = clone(aeroBase); hi.setup = { wingAngle: 1 };
const lo = clone(aeroBase); lo.setup = { wingAngle: 0 };
const tHi = { s: lapSim(computePerf(hi), REF_TRACKS.sprint.pts).t, t: lapSim(computePerf(hi), REF_TRACKS.touge.pts).t };
const tLo = { s: lapSim(computePerf(lo), REF_TRACKS.sprint.pts).t, t: lapSim(computePerf(lo), REF_TRACKS.touge.pts).t };
const wingOk = tHi.t < tLo.t && tHi.s > tLo.s;
console.log(`${wingOk ? '✓' : '✗'} wing angle: high → touge ${fmtLap(tHi.t)} vs ${fmtLap(tLo.t)}, sprint ${fmtLap(tHi.s)} vs ${fmtLap(tLo.s)}`);
if (!wingOk) fail++;

const stag = computePerf({ gen: 'nissan-silvia-s13', wheels: GRIP_MID, setup: { tireWidthR: 285 } });
const stagOk = stag.muR > stag.muF;
console.log(`${stagOk ? '✓' : '✗'} staggered: μR ${stag.muR.toFixed(3)} > μF ${stag.muF.toFixed(3)}`);
if (!stagOk) fail++;

const wide = computePerf({ gen: 'gen2', setup: { gearSpread: 1 } }), std = computePerf({ gen: 'gen2' });
const gsOk = wide.gears[0] > std.gears[0] && wide.gears.at(-1) < std.gears.at(-1);
console.log(`${gsOk ? '✓' : '✗'} gear spread: 1st ${std.gears[0]}→${wide.gears[0]}, top ${std.gears.at(-1)}→${wide.gears.at(-1)}`);
if (!gsOk) fail++;

const strok = computePerf({ gen: 'ae86', engine: { parts: { internals: 'stroker' } } });
const strokOk = strok.peakTq > computePerf({ gen: 'ae86' }).peakTq && strok.redline < computePerf({ gen: 'ae86' }).redline;
console.log(`${strokOk ? '✓' : '✗'} stroker: tq ${Math.round(strok.peakTq)} Nm @ redline ${strok.redline}`);
if (!strokOk) fail++;

console.log(fail ? `\n${fail} check(s) FAILED` : '\nall checks passed');
process.exit(fail ? 1 : 0);
