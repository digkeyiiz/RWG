// Lap-time simulator: a point-mass speed profile around a track, built from the same
// power/grip numbers the driving model uses (engine.js). Pure math — no three.js — so the
// server (rooms.js via public/js/) and Node validation tools can import it the same way.
//
// Also the source of truth for the PI (performance index): instead of a hand-tuned formula,
// PI is read off the simulated lap time of a canonical reference track and normalised
// between two anchor builds, so the number always reflects what the physics predicts.
import { driveAccel, bestGear } from './engine.js';

const G = 9.81, V_CAP = 200; // m/s sanity cap (720 km/h)

// ---------- reference tracks ----------
// Built from segments { len (m), k (1/m curvature, signed), g (grade dy/dx) }.
// Curvature is stored per point → exact, no numeric differentiation noise.
// The three tracks intentionally favour different builds:
//   sprint = power/top speed · mixed = everything (the PI ruler) · touge = grip/lightness
function genTrack(segments, step = 5) {
  const pts = [[0, 0, 0, 0]];
  let x = 0, z = 0, y = 0, h = 0;
  for (const s of segments) {
    const n = Math.max(1, Math.round(s.len / step));
    for (let i = 0; i < n; i++) {
      h += (s.k || 0) * step;
      x += Math.cos(h) * step;
      z += Math.sin(h) * step;
      y += (s.g || 0) * step;
      pts.push([x, y, z, s.k || 0]);
    }
  }
  return pts;
}

export const REF_TRACKS = {
  sprint: {
    name: 'สปรินท์',
    pts: genTrack([
      { len: 700 }, { len: 130, k: 1 / 70 }, { len: 650 },
      { len: 110, k: -1 / 55 }, { len: 380 }, { len: 120, k: 1 / 60 },
    ]),
  },
  mixed: {
    name: 'สนามผสม',
    pts: genTrack([
      { len: 320 }, { len: 210, k: 1 / 85 }, { len: 140 },
      { len: 80, k: 1 / 22 }, { len: 240 }, { len: 60, k: 1 / 35 },
      { len: 60, k: -1 / 35 }, { len: 60, k: 1 / 30 },
      { len: 420 }, { len: 160, k: -1 / 120 }, { len: 180 },
      { len: 95, k: 1 / 30 }, { len: 120 }, { len: 120, k: -1 / 90 },
      { len: 260 },
    ]),
  },
  touge: {
    name: 'ถนนเขา',
    pts: genTrack([
      { len: 120, g: 0.04 }, { len: 90, k: 1 / 18, g: 0.05 }, { len: 60, g: 0.06 },
      { len: 85, k: -1 / 16, g: 0.06 }, { len: 70, g: 0.05 },
      { len: 110, k: 1 / 22, g: 0.04 }, { len: 80, g: 0.03 },
      { len: 95, k: -1 / 20, g: 0.02 }, { len: 130, g: -0.02 },
      { len: 100, k: 1 / 25, g: -0.04 }, { len: 90, g: -0.05 },
      { len: 105, k: -1 / 18, g: -0.05 }, { len: 75, g: -0.04 },
      { len: 120, k: 1 / 24, g: -0.03 }, { len: 150, g: -0.02 }, { len: 200 },
    ]),
  },
};

// Point-mass lap around `pts` ([x,y,z] or [x,y,z,kappa]); returns { t, len, vMin, vMax, avgV }.
export function lapSim(perf, pts, opts = {}) {
  const n = pts?.length || 0;
  if (!perf || n < 4) return { t: Infinity, len: 0 };
  const m = Math.max(500, perf.mass || 1100);
  const mu = Number.isFinite(perf.mu) ? perf.mu : (opts.mu ?? 1);
  const latMul = perf.lat || 1;
  const downK = 1.2 * (perf.cl ?? 0.12);          // aero downforce (N) = downK · v²
  const brakeK = 9.6 * (perf.brake || 1);          // matches drive.js: Fbrake = 9.6·m·brake

  const ds = new Array(n - 1), grade = new Array(n - 1), kap = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][2] - pts[i][2], dy = (pts[i + 1][1] || 0) - (pts[i][1] || 0);
    const l = Math.hypot(dx, dz) || 1e-6;
    ds[i] = l; grade[i] = dy / l;
    kap[i] = pts[i][3] ?? 0;
  }
  kap[n - 1] = pts[n - 1][3] ?? kap[n - 2] ?? 0;
  if (pts[0].length < 4) {
    // derive curvature from segment headings when it is not baked in (arbitrary polylines)
    const head = (i) => Math.atan2(pts[i + 1][2] - pts[i][2], pts[i + 1][0] - pts[i][0]);
    for (let i = 1; i < n - 1; i++) {
      const d = Math.atan2(Math.sin(head(i) - head(i - 1)), Math.cos(head(i) - head(i - 1)));
      kap[i] = d / ((ds[i - 1] + ds[i]) / 2);
    }
    kap[0] = kap[1]; kap[n - 1] = kap[n - 2];
  }

  // corner-speed limit per point: v²·κ = a_lat·(1 + down·v²/mg) → v² = a_lat / (κ − a_lat·down/mg)
  const aLat = mu * G * latMul;
  const vLim = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(kap[i]);
    if (k < 1e-7) { vLim[i] = V_CAP; continue; }
    const den = k - aLat * downK / (m * G);
    vLim[i] = den <= 0 ? V_CAP : Math.min(V_CAP, Math.sqrt(aLat / den));
  }

  // forward pass: engine accel − slope (driveAccel already includes aero drag + traction limit)
  const v = vLim.slice();
  v[0] = 0; // standing start
  for (let i = 1; i < n; i++) {
    const est = Math.sqrt(Math.max(0, v[i - 1] * v[i - 1] + 2 * Math.max(0.2, accelAt(perf, v[i - 1], mu) - G * grade[i - 1]) * ds[i - 1]));
    const vm = (v[i - 1] + est) / 2;
    const a = Math.max(0.2, accelAt(perf, vm, mu) - G * grade[i - 1]);
    v[i] = Math.min(vLim[i], Math.sqrt(Math.max(0, v[i - 1] * v[i - 1] + 2 * a * ds[i - 1])));
  }
  // backward pass: brake grip + downforce + slope (uphill helps, downhill hurts)
  for (let i = n - 2; i >= 0; i--) {
    const ab = Math.min(brakeK, mu * G * 1.05 * (1 + downK * v[i + 1] * v[i + 1] / (m * G))) + G * grade[i];
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * Math.max(0.5, ab) * ds[i]));
  }

  let t = 0, len = 0, vMin = Infinity, vMax = 0;
  for (let i = 0; i < n - 1; i++) {
    len += ds[i];
    t += ds[i] / Math.max(0.5, (v[i] + v[i + 1]) / 2);
    if (v[i] < vMin) vMin = v[i];
    if (v[i] > vMax) vMax = v[i];
  }
  return { t, len, vMin: Number.isFinite(vMin) ? vMin : 0, vMax, avgV: t > 0 ? len / t : 0 };
}
function accelAt(perf, v, mu) {
  return driveAccel(perf, v, bestGear(perf, v), 1, mu).a;
}

// ---------- PI anchors ----------
// Two synthetic builds bracketing the PI scale. Their lap times on the mixed reference
// track are simulated once (lazily) so the scale re-anchors automatically if physics changes.
const ANCHOR_SLOW = { mass: 1060, drive: 'FF', gears: [3.55, 1.90, 1.31, 1.03, 0.82], final: 4.31, lsd: 1, lat: 1, brake: 1, mu: 1.0, cl: 0.12, redline: 6400, torqueAt: () => 135 };
const ANCHOR_FAST = { mass: 1150, drive: 'AWD', gears: [3.20, 2.10, 1.50, 1.10, 0.90, 0.75], final: 3.70, lsd: 1.1, lat: 1.15, brake: 1.4, mu: 1.8, cl: 0.5, redline: 8500, torqueAt: () => 700 };
const ANCHOR_PI = { slow: 260, fast: 950 };
let anchorLap = null;
function anchorLaps() {
  if (!anchorLap) {
    anchorLap = { slow: lapSim(ANCHOR_SLOW, REF_TRACKS.mixed.pts).t, fast: lapSim(ANCHOR_FAST, REF_TRACKS.mixed.pts).t };
  }
  return anchorLap;
}

// Lap time (s) on the mixed reference track → PI 100..999 (linear in speed = 1/t).
export function piFromLap(t) {
  if (!Number.isFinite(t) || t <= 0) return null;
  const a = anchorLaps();
  if (!Number.isFinite(a.slow) || !Number.isFinite(a.fast) || a.fast >= a.slow) return null;
  const B = (ANCHOR_PI.fast - ANCHOR_PI.slow) / (1 / a.fast - 1 / a.slow);
  const A = ANCHOR_PI.slow - B / a.slow;
  return Math.round(Math.min(999, Math.max(100, A + B / t)));
}

export function lapTime(perf, track = 'mixed') {
  return lapSim(perf, (REF_TRACKS[track] || REF_TRACKS.mixed).pts).t;
}

export const fmtLap = (t) => {
  if (!Number.isFinite(t)) return '--:--.-';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};
