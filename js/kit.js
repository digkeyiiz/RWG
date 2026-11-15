// Body-kit geometry: every part is a *loft* — a 2D cross-section swept along a path that is sampled from the real
// body surface (ray casts through P.frontAt / rearAt / sideAt / topAt). Cross-sections have rounded edges, ends taper
// into the body, and the whole thing gets creased normals, so parts look sculpted instead of like flat plates.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// fill nulls from neighbours, then moving-average (removes ray-cast jitter)
export function cleanSeries(vals, passes = 2) {
  const v = vals.slice();
  let last = null;
  for (let i = 0; i < v.length; i++) { if (v[i] == null) { if (last != null) v[i] = last; } else last = v[i]; }
  last = null;
  for (let i = v.length - 1; i >= 0; i--) { if (v[i] == null) { if (last != null) v[i] = last; } else last = v[i]; }
  if (v.some((x) => x == null)) return null;
  for (let p = 0; p < passes; p++) {
    const o = v.slice();
    for (let i = 0; i < v.length; i++) o[i] = (v[Math.max(0, i - 1)] + v[i] * 2 + v[Math.min(v.length - 1, i + 1)]) / 4;
    for (let i = 0; i < v.length; i++) v[i] = o[i];
  }
  return v;
}

// round off sharp corners of a closed 2D profile (Chaikin) so edges catch light
export function roundProfile(pts, iterations = 1) {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    const o = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = o;
  }
  return p;
}

// rings[i] = array of [x,y,z] (same count each). Closed profile, capped at both ends. Returns a BufferGeometry.
export function loft(rings, { caps = true, crease = 0.7 } = {}) {
  const R = rings.length, N = rings[0].length;
  const pos = [];
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  const idx = [];
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < N; j++) {
    const a = i * N + j, b = i * N + (j + 1) % N, c = (i + 1) * N + j, d = (i + 1) * N + (j + 1) % N;
    idx.push(a, c, b, b, c, d);
  }
  if (caps) {
    for (const [ri, flip] of [[0, true], [R - 1, false]]) {
      const cx = rings[ri].reduce((s, p) => s + p[0], 0) / N, cy = rings[ri].reduce((s, p) => s + p[1], 0) / N, cz = rings[ri].reduce((s, p) => s + p[2], 0) / N;
      const ci = pos.length / 3; pos.push(cx, cy, cz);
      for (let j = 0; j < N; j++) { const a = ri * N + j, b = ri * N + (j + 1) % N; if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); }
    }
  }
  // make the winding point outwards (signed volume > 0)
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // texture coords: metres along the sweep (u) and around the profile (v) → carbon weave keeps a constant scale
  const uv = [];
  for (let i = 0; i < R; i++) {
    const u = i * 0.03;
    for (let j = 0; j < N; j++) uv.push(u, j * 0.03);
  }
  for (let k = uv.length / 2; k < pos.length / 3; k++) uv.push(0, 0);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g = toCreasedNormals(g, crease);
  g.computeBoundingSphere();
  return g;
}

const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => lerp(a, b, i / (n - 1)));

// ---------------------------------------------------------------- front / rear bumper parts
// profile: [[f, dy], …] — f = distance away from the bumper surface (negative = buried in the body), dy = height from y.
export const BUMPER_PROFILES = {
  frontLip: [[-0.06, 0.06], [0.0, 0.054], [0.034, 0.02], [0.046, 0.002], [0.04, -0.012], [0.0, -0.017], [-0.06, -0.017]],
  frontSplitter: [[-0.06, 0.024], [0.1, 0.016], [0.108, 0.002], [0.1, -0.008], [-0.06, -0.009]],
  frontApron: [[-0.06, 0.2], [0.0, 0.18], [0.028, 0.1], [0.036, 0.02], [0.056, -0.028], [0.05, -0.048], [-0.06, -0.048]],
  rearLip: [[-0.06, 0.055], [0.0, 0.05], [0.03, 0.016], [0.038, -0.004], [0.03, -0.015], [-0.06, -0.015]],
  rearApron: [[-0.06, 0.17], [0.0, 0.155], [0.03, 0.08], [0.044, 0.0], [0.04, -0.04], [-0.06, -0.04]],
  rearDiffuser: [[-0.26, -0.03], [-0.02, 0.025], [0.04, 0.058], [0.052, 0.07], [0.0, 0.074], [-0.26, 0.002]],
};

export function bumperPart(P, front, y, profile, { halfW, n = 46, taper = 0.16, rise = 0 } = {}) {
  const hw = halfW, zs = linspace(-hw, hw, n);
  const at = front ? P.frontAt : P.rearAt;
  const xs = cleanSeries(zs.map((z) => at(y + 0.05, z) ?? at(y + 0.1, z) ?? at(y + 0.16, z) ?? at(y + 0.24, z)));
  if (!xs) return null;
  const dir = front ? 1 : -1;
  const prof = roundProfile(profile, 1);
  const rings = zs.map((z, i) => {
    const e = Math.min(i, n - 1 - i) / (n - 1); // 0 at the ends → 0.5 in the middle
    const s = smoothstep(0, taper, e);
    const sc = 0.12 + 0.88 * s;
    // ends sweep upwards a little (like a real splitter end-cap) and shorten
    const lift = (1 - s) * rise;
    return prof.map(([f, dy]) => [xs[i] + dir * (f > 0 ? f * sc : f), y + dy * (f > 0 ? (0.4 + 0.6 * s) : 1) + lift * (f > 0 ? 1 : 0), z]);
  });
  return loft(rings);
}

// ---------------------------------------------------------------- side skirts
export const SKIRT_PROFILES = {
  skirt: [[-0.05, 0.12], [0.0, 0.114], [0.026, 0.07], [0.034, 0.0], [0.026, -0.024], [0.0, -0.03], [-0.05, -0.03]],
  big: [[-0.05, 0.15], [0.0, 0.142], [0.042, 0.085], [0.06, 0.012], [0.07, -0.012], [0.07, -0.046], [0.018, -0.054], [-0.05, -0.054]],
};

export function skirtPart(P, side, y0, x0, x1, profile, { n = 64, tail = 0.26 } = {}) {
  const xs = linspace(x0, x1, n);
  const zs = cleanSeries(xs.map((x) => P.sideAt(x, y0 + 0.1) ?? P.sideAt(x, y0 + 0.16) ?? P.sideAt(x, y0 + 0.24)), 3);
  if (!zs) return null;
  const prof = roundProfile(profile, 1);
  const rings = xs.map((x, i) => {
    const d = Math.min(x - x0, x1 - x);
    const s = smoothstep(0, tail, d);
    const sc = 0.08 + 0.92 * s;
    // front end of a skirt sweeps up and in, like a real extension
    return prof.map(([o, dy]) => [x, y0 + dy * (o > 0 ? 0.5 + 0.5 * s : 1) + (o > 0 ? (1 - s) * 0.03 : 0), side * (zs[i] + (o > 0 ? o * sc : o))]);
  });
  return loft(rings);
}

// ---------------------------------------------------------------- wheel-arch flares
// level: 'flare' (thin), 'overfender' (riveted), 'wide' (widebody)
export const FLARE_SPECS = {
  flare: { out: 0.024, band: 0.06, rivets: false },
  overfender: { out: 0.052, band: 0.085, rivets: true },
  wide: { out: 0.088, band: 0.115, rivets: true },
};

export function archFlare(P, ax, side, level, { n = 56 } = {}) {
  const spec = FLARE_SPECS[level];
  if (!spec) return null;
  const R = P.tireR + 0.045, cy = P.tireR;
  const a0 = -0.22, a1 = Math.PI + 0.22;
  const as = linspace(a0, a1, n);
  const clampY = (y) => Math.max(P.clear + 0.13, y);
  const zs = cleanSeries(as.map((a) => {
    const r = R + spec.band * 0.55;
    const x = ax + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    return P.sideAt(x, clampY(y)) ?? P.sideAt(x, clampY(y) + 0.08);
  }), 3);
  if (!zs) return null;
  const f = spec.out, b = spec.band;
  // (dr, dz): radial distance from the arch edge, and outward distance from the body surface
  const base = [[-0.012, -0.03], [-0.012, f * 0.78], [-0.004, f * 0.97], [0.008, f], [b * 0.4, f * 0.93], [b * 0.8, f * 0.42], [b, 0.002], [b, -0.03]];
  const prof = roundProfile(base, 1);
  const rings = as.map((a, i) => {
    const e = Math.min(a - a0, a1 - a) / (a1 - a0);
    const s = smoothstep(0, 0.12, e);
    return prof.map(([dr, dz]) => {
      const r = R + dr;
      return [ax + Math.cos(a) * r, cy + Math.sin(a) * r, side * (zs[i] + (dz > 0 ? dz * s : dz))];
    });
  });
  return { geo: loft(rings), zs, as, R, cy, spec };
}

// bolts along the outer lip of a riveted flare
export function flareRivets(P, ax, side, flare) {
  if (!flare?.spec.rivets) return null;
  const { zs, as, R, cy, spec } = flare;
  const geo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.006, 10).rotateX(Math.PI / 2);
  const mats = [];
  const m4 = new THREE.Matrix4();
  for (let i = 3; i < as.length - 3; i += 2) {
    const a = as[i], r = R + 0.012;
    const e = Math.min(a - as[0], as[as.length - 1] - a) / (as[as.length - 1] - as[0]);
    const s = smoothstep(0, 0.12, e);
    m4.makeTranslation(ax + Math.cos(a) * r, cy + Math.sin(a) * r, side * (zs[i] + spec.out * s + 0.002));
    mats.push(m4.clone());
  }
  return { geo, mats };
}

// ---------------------------------------------------------------- trunk spoilers (lip / ducktail)
export function trunkSpoiler(P, duck, xTe) {
  const len = duck ? 0.22 : 0.08, h = duck ? 0.07 : 0.024;
  const w = P.section(xTe).hw * 0.88, n = 30;
  const zs = linspace(-w, w, n);
  const ys = cleanSeries(zs.map((z) => P.topAt(xTe + len * 0.45, z) ?? P.topAt(xTe + len * 0.45, z * 0.8)));
  if (!ys) return null;
  const base = duck
    ? [[len, -0.03], [len, 0.003], [len * 0.55, 0.02], [0.05, h * 0.82], [0.012, h], [-0.004, h * 0.92], [-0.012, h * 0.4], [-0.006, -0.03]]
    : [[len, -0.02], [len, 0.002], [len * 0.5, 0.012], [0.01, h], [-0.006, h * 0.85], [-0.006, -0.02]];
  const prof = roundProfile(base, 1);
  const rings = zs.map((z, i) => {
    const e = Math.min(i, n - 1 - i) / (n - 1);
    const s = smoothstep(0, 0.1, e);
    return prof.map(([dx, dy]) => [xTe + dx, ys[i] + dy * (dy > 0.004 ? 0.35 + 0.65 * s : 1), z]);
  });
  return loft(rings);
}

// ---------------------------------------------------------------- misc small parts
export function shapeGeo(points, depth, bevel = 0.004) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return toCreasedNormals(g, 0.7);
}
