// Validates remote-car interpolation under realistic network conditions.
// Runs a "truth" car through a fast slalom, emits jittery/dropped 18 Hz packets,
// renders at 120 fps through PeerInterp, and measures smoothness vs the old
// fixed-delay lerp + heading extrapolation.
//   node tools/netinterp-check.mjs
import { PeerInterp } from '../js/netinterp.js';

const FPS = 120, DT = 1 / FPS;

// truth: fast car on a slalom — the worst case for straight-line extrapolation
function truth(t) {
  const speed = 28;                       // ~100 km/h
  const x = speed * t;
  const z = 18 * Math.sin(x / 14);        // slalom
  const h = Math.atan2(-(18 / 14) * Math.cos(x / 14) * speed / speed, 1); // heading follows the path
  return { x, y: 0, z, h };
}

// packet builder mirroring _emitState
function packet(u) {
  const r = (v) => Math.round(v * 1000) / 1000;
  return [r(u.x), r(u.y), r(u.z), r(u.h), 0, 0, r(28), 0, 0, 1];
}

// deliver packets emitted every 1/sendHz truth-seconds through a jittery link
function* packets(sendHz, jitterMs, dropP, gaps) {
  let t = 0, emit = 0;
  while (t < 14) {
    if (t >= emit) {
      emit += 1 / sendHz;
      const inGap = gaps.some(([g0, g1]) => t >= g0 && t <= g1);
      if (!inGap && Math.random() >= dropP) {
        const at = t + jitterMs * (Math.random() * 2 - 1) / 1000;
        yield { t, at, s: packet(truth(t)) };
      }
    }
    t += 0.004;
  }
}

// ---- old algorithm (fixed 120 ms delay, linear lerp, straight-line extrapolation)
function runOld(pkts) {
  const snaps = []; const out = [];
  let pi = 0;
  for (let now = 0; now < 14; now += DT) {
    while (pi < pkts.length && pkts[pi].at <= now) { snaps.push({ t: pkts[pi].at, s: pkts[pi].s }); pi++; }
    if (!snaps.length) continue;
    const rt = now - 0.12;
    let a = snaps[0], b = snaps[snaps.length - 1], t = 1;
    for (let i = snaps.length - 1; i > 0; i--) if (snaps[i - 1].t <= rt) { a = snaps[i - 1]; b = snaps[i]; break; }
    t = Math.min(1, Math.max(0, (rt - a.t) / Math.max(1e-3, b.t - a.t)));
    const A = a.s, B = b.s;
    let x = A[0] + (B[0] - A[0]) * t, z = A[2] + (B[2] - A[2]) * t;
    let h = A[3] + Math.atan2(Math.sin(B[3] - A[3]), Math.cos(B[3] - A[3])) * t;
    if (rt > b.t) { const ex = Math.min(0.25, rt - b.t); x += Math.cos(B[3]) * B[6] * ex; z -= Math.sin(B[3]) * B[6] * ex; }
    out.push({ x, z, h });
  }
  return out;
}

function runNew(pkts) {
  const p = new PeerInterp();
  const out = [];
  let pi = 0;
  for (let now = 0; now < 14; now += DT) {
    while (pi < pkts.length && pkts[pi].at <= now) { p.push(pkts[pi].at, pkts[pi].s); pi++; }
    const q = p.eval(now, DT);
    if (q) out.push(q);
  }
  return { out, delay: p.delay(), meanI: p.meanI, jit: p.jit };
}

function metrics(frames) {
  let maxStep = 0, steps = [], jerk = 0;
  for (let i = 1; i < frames.length; i++) {
    const d = Math.hypot(frames[i].x - frames[i - 1].x, frames[i].z - frames[i - 1].z);
    steps.push(d); maxStep = Math.max(maxStep, d);
    if (i > 1) jerk = Math.max(jerk, Math.abs(d - steps[i - 2]));
  }
  steps.sort((a, b) => a - b);
  return { maxStep, p99: steps[Math.floor(steps.length * 0.99)], maxJerk: jerk };
}

function accuracy(frames, pkts) {
  // mean distance between rendered pose and truth at (now - delay)
  let err = 0, n = 0;
  for (let i = 0; i < frames.length; i++) {
    const t = pkts.length ? (i * DT - 0.15) : 0;
    if (t < 0) continue;
    const u = truth(t);
    err += Math.hypot(frames[i].x - u.x, frames[i].z - u.z); n++;
  }
  return err / n;
}

let pass = true;
const check = (name, ok, detail) => { pass = pass && ok; console.log(`${ok ? '✓' : '✗ FAIL'} ${name} — ${detail}`); };

console.log('=== scenario 1: jittery wifi (18 Hz, ±25 ms jitter, 4% loss) ===');
const pkts1 = [...packets(18, 25, 0.04, [])];
const o1 = metrics(runOld(pkts1)), n1 = runNew(pkts1);
const m1 = metrics(n1.out);
console.log(`    old: maxStep=${o1.maxStep.toFixed(3)}m  p99=${o1.p99.toFixed(3)}m  maxJerk=${o1.maxJerk.toFixed(3)}m`);
console.log(`    new: maxStep=${m1.maxStep.toFixed(3)}m  p99=${m1.p99.toFixed(3)}m  maxJerk=${m1.maxJerk.toFixed(3)}m  delay=${n1.delay.toFixed(3)}s`);
check('smoother peak step than old', m1.maxStep < o1.maxStep, `${m1.maxStep.toFixed(3)} < ${o1.maxStep.toFixed(3)}`);
check('no backwards snap (maxJerk bounded)', m1.maxJerk < 0.20, `${m1.maxJerk.toFixed(3)} m/frame²`);

console.log('=== scenario 2: 400 ms gap mid-corner (retransmit burst) ===');
const pkts2 = [...packets(18, 15, 0, [[6.0, 6.4]])];
const o2 = metrics(runOld(pkts2)), n2 = runNew(pkts2);
const m2 = metrics(n2.out);
console.log(`    old: maxStep=${o2.maxStep.toFixed(3)}m   new: maxStep=${m2.maxStep.toFixed(3)}m`);
check('gap recovery never snaps >0.45 m/frame', m2.maxStep < 0.45, `${m2.maxStep.toFixed(3)} m`);
check('old algorithm snaps harder on the same gap', m2.maxStep < o2.maxStep, `${m2.maxStep.toFixed(3)} < ${o2.maxStep.toFixed(3)}`);

console.log('=== scenario 3: slow peer on 10 Hz polling (±40 ms jitter) ===');
const pkts3 = [...packets(10, 40, 0.02, [])];
const n3 = runNew(pkts3);
const m3 = metrics(n3.out);
console.log(`    new: maxStep=${m3.maxStep.toFixed(3)}m  delay=${n3.delay.toFixed(3)}s (meanI=${n3.meanI.toFixed(3)} jit=${n3.jit.toFixed(3)})`);
check('adaptive delay grew for the slower stream', n3.delay > 0.13, `${n3.delay.toFixed(3)} s`);
check('still smooth at 10 Hz', m3.maxStep < 0.42, `${m3.maxStep.toFixed(3)} m`);

console.log('=== scenario 4: keep-alive gap does not poison jitter stats ===');
{
  const p = new PeerInterp();
  for (let i = 0; i < 20; i++) p.push(i * 0.066, packet(truth(i * 0.066)));
  const jitBefore = p.jit;
  p.push(20 * 0.066 + 2.0, packet(truth(20 * 0.066)));   // 2 s keep-alive
  p.push(20 * 0.066 + 2.066, packet(truth(20 * 0.066))); // stream resumes
  check('2 s silence ignored', p.jit < jitBefore * 3, `jit ${jitBefore.toFixed(3)} → ${p.jit.toFixed(3)}`);
}

console.log(`\ntracking error vs truth: ${(accuracy(n1.out, pkts1)).toFixed(3)} m mean`);
console.log(pass ? '\nNETINTERP OK' : '\nFAILED');
process.exit(pass ? 0 : 1);
