// Parametric sedan body: lofted cross-sections + analytic surface queries.
// Car space: +x = front, +y = up, +z = right (driver side, RHD), ground at y=0.
import * as THREE from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function sstep(a, b, x) {
  let t = (x - a) / (b - a);
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

// Material slots of the body geometry.
export const SLOT = { PAINT: 0, WINDSHIELD: 1, SIDE: 2, REAR: 3, BLACK: 4, ROOF: 5, HOOD: 6, TRUNK: 7 };

export function makeProfile(gen) {
  const d = gen.dims, b = gen.body;
  const L = d.L, W = d.W, xmin = -L / 2, xmax = L / 2;
  const fAx = xmax - d.fOH, rAx = fAx - d.WB;
  const tireR = (gen.tire.rim * 25.4 + 2 * gen.tire.width * gen.tire.aspect / 100) / 2000;
  const roofY = d.H;
  const uOf = (x) => (x - xmin) / L;
  const xOf = (u) => xmin + u * L;
  const roofMid = (b.rg[1] + b.ws[0]) / 2, roofHalf = (b.ws[0] - b.rg[1]) / 2 + 0.12;

  function gAt(u) {
    if (u <= b.rg[0] || u >= b.ws[1]) return 0;
    if (u < b.rg[1]) return (u - b.rg[0]) / (b.rg[1] - b.rg[0]);
    if (u <= b.ws[0]) return 1;
    return 1 - (u - b.ws[0]) / (b.ws[1] - b.ws[0]);
  }
  function deckAt(u) {
    if (u > 0.5) {
      const t = Math.pow(sstep(b.ws[1], 1.0, u), 1.6);
      return b.hoodY + 0.02 * (1 - sstep(b.ws[1], b.ws[1] + 0.12, u)) - b.noseDrop * t;
    }
    const t = Math.pow(sstep(b.rg[0], 0.0, u), 1.6);
    return b.trunkY - b.tailDrop * t;
  }
  function roofAt(u) {
    const k = (u - roofMid) / roofHalf;
    return roofY - 0.04 * k * k;
  }

  // Returns 11 half-section points [z, y] plus meta.
  function section(x) {
    x = clamp(x, xmin, xmax);
    const u = uOf(x);
    const g = gAt(u);
    const h = 1 - Math.pow(1 - g, 1.45);
    // end rounding
    const front = x > 0;
    const e = front ? xmax - x : x - xmin;
    const rEnd = front ? 0.36 : 0.26;
    const s = e >= rEnd ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow(1 - e / rEnd, 2)));
    // gentle vertical rounding of the nose / tail (bumper wraps under, hood rolls over)
    const rTop = front ? 0.5 : 0.3, rBot = front ? 0.3 : 0.25;
    const vTop = e >= rTop ? 0 : Math.pow(1 - e / rTop, 1.7);
    const vBot = e >= rBot ? 0 : Math.pow(1 - e / rBot, 2);
    // plan taper
    let hw = W / 2 * (1 - 0.06 * Math.pow(sstep(0.80, 1, u), 1.5) - 0.045 * Math.pow(sstep(0.18, 0, u), 1.5));
    hw *= 0.66 + 0.34 * s;
    let rw = W / 2 * b.roofRatio * (0.9 + 0.1 * g);
    rw *= 0.66 + 0.34 * s;
    // vertical
    let yb = d.clear + 0.07 * sstep(fAx + 0.30, xmax, x) + 0.11 * sstep(rAx - 0.25, xmin, x);
    let top = lerp(deckAt(u), roofAt(u), h);
    yb += vBot * (front ? 0.1 : 0.1);
    top -= vTop * (front ? 0.17 : 0.1);
    const belt = b.beltY + b.beltRise * (0.5 - u);
    const y6 = Math.min(belt, top - 0.03);
    // wheel arches
    let yl = yb;
    for (const ax of [fAx, rAx]) {
      const R = tireR + 0.045, dx = Math.abs(x - ax);
      if (dx < R) yl = Math.max(yl, tireR + Math.sqrt(R * R - dx * dx) - 0.005);
    }
    yl = Math.min(yl, y6 - 0.16);
    const y4 = Math.max(yb + 0.13, yl + 0.012);
    const y5 = Math.max(y4 + 0.01, y6 - 0.13);
    const p6 = [hw * 0.985, y6];
    const p8 = [lerp(hw * 0.86, rw, h), top - lerp(0.006, 0.03, h)];
    const p7 = [lerp(p6[0], p8[0], 0.86) + 0.012 * h, lerp(p6[1], p8[1], 0.86)];
    const pts = [
      [0, yb],
      [hw - 0.34, yb],
      [hw - 0.32, yl],
      [hw - 0.015, yl],
      [hw, y4],
      [hw * 1.0, y5],
      p6,
      p7,
      p8,
      [lerp(hw * 0.5, rw * 0.6, h), top - 0.002],
      [0, top],
    ];
    return { pts, u, g, h, yb, yl, top, y6, hw, rw, x, winH: p7[1] - y6 };
  }

  // --- analytic surface queries (used to stick details onto the body) ---
  function inside(pts, z, y) {
    z = Math.abs(z);
    let c = false;
    const n = pts.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [zi, yi] = pts[i], [zj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && z < (zj - zi) * (y - yi) / (yj - yi) + zi) c = !c;
    }
    return c;
  }
  function frontAt(y, z) {
    if (inside(section(xmax - 1e-4).pts, z, y)) return xmax;
    let lo = fAx - 0.3, hi = xmax;
    if (!inside(section(lo).pts, z, y)) return null;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (inside(section(m).pts, z, y)) lo = m; else hi = m; }
    return lo;
  }
  function rearAt(y, z) {
    if (inside(section(xmin + 1e-4).pts, z, y)) return xmin;
    let lo = xmin, hi = rAx + 0.3;
    if (!inside(section(hi).pts, z, y)) return null;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (inside(section(m).pts, z, y)) hi = m; else lo = m; }
    return hi;
  }
  function sideAt(x, y) {
    const p = section(x).pts;
    let best = null;
    for (let j = 3; j < p.length - 1; j++) {
      const [z0, y0] = p[j], [z1, y1] = p[j + 1];
      if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) {
        const z = z0 + (z1 - z0) * (y - y0) / (y1 - y0);
        if (best === null || z > best) best = z;
      }
    }
    return best;
  }
  function topAt(x, z) {
    const p = section(x).pts;
    z = Math.abs(z);
    let best = null;
    for (let j = 4; j < p.length - 1; j++) {
      const [z0, y0] = p[j], [z1, y1] = p[j + 1];
      if ((z0 - z) * (z1 - z) <= 0 && z0 !== z1) {
        const y = y0 + (y1 - y0) * (z - z0) / (z1 - z0);
        if (best === null || y > best) best = y;
      }
    }
    return best;
  }

  return {
    gen, L, W, xmin, xmax, fAx, rAx, tireR, roofY, uOf, xOf, gAt, section,
    frontAt, rearAt, sideAt, topAt,
    xWsBase: xOf(b.ws[1]), xWsTop: xOf(b.ws[0]), xRgTop: xOf(b.rg[1]), xRgBase: xOf(b.rg[0]),
  };
}

export function buildBodyGeometry(P) {
  const N = 140, RING = 20, HALF = 11;
  const pos = [], uv = [];
  const meta = [];
  for (let i = 0; i <= N; i++) {
    const x = P.xmin + (P.xmax - P.xmin) * (i / N);
    const S = P.section(x);
    meta.push(S);
    for (let k = 0; k < RING; k++) {
      const j = k < HALF ? k : 20 - k;
      const sign = k < HALF ? 1 : -1;
      const [z, y] = S.pts[j];
      pos.push(x, y, z * sign);
      uv.push(x * 1.2, z * sign * 1.2);
    }
  }
  const capF = pos.length / 3, capR = capF + 1;
  const sF = meta[N], sR = meta[0];
  pos.push(P.xmax, (sF.yb + sF.top) / 2, 0, P.xmin, (sR.yb + sR.top) / 2, 0);
  uv.push(0, 0, 0, 0);

  const buckets = Array.from({ length: 8 }, () => []);
  const idx = (i, k) => i * RING + (k % RING);
  const hoodFrontX = P.xmax - 0.26, trunkRearX = P.xmin + 0.16;
  for (let i = 0; i < N; i++) {
    const A = meta[i], B = meta[i + 1];
    const xm = (A.x + B.x) / 2;
    const full = A.g >= 0.999 && B.g >= 0.999;
    const trans = !full && (A.g > 0.001 || B.g > 0.001);
    for (let k = 0; k < RING; k++) {
      const j = k < 10 ? k : 19 - k;
      let slot = SLOT.PAINT;
      if (j <= 2) slot = SLOT.BLACK;
      else if (j === 6) {
        const minH = xm > 0 ? 0.42 : 0.62;
        if (full) slot = SLOT.SIDE;
        else if (trans && A.h > minH && B.h > minH && A.winH > 0.06 && B.winH > 0.06) slot = SLOT.SIDE;
      } else if (j === 7) {
        if (full) slot = SLOT.BLACK;
        else if (!trans) slot = xm > 0 ? (xm < hoodFrontX ? SLOT.HOOD : SLOT.PAINT) : (xm > trunkRearX ? SLOT.TRUNK : SLOT.PAINT);
      } else if (j >= 8) {
        if (full) slot = SLOT.ROOF;
        else if (trans) slot = xm > 0 ? SLOT.WINDSHIELD : SLOT.REAR;
        else slot = xm > 0 ? (xm < hoodFrontX ? SLOT.HOOD : SLOT.PAINT) : (xm > trunkRearX ? SLOT.TRUNK : SLOT.PAINT);
      }
      const a = idx(i, k), b = idx(i, k + 1), c = idx(i + 1, k), d = idx(i + 1, k + 1);
      buckets[slot].push(a, c, b, b, c, d);
    }
  }
  for (let k = 0; k < RING; k++) {
    buckets[SLOT.PAINT].push(capF, idx(N, k + 1), idx(N, k));
    buckets[SLOT.PAINT].push(capR, idx(0, k), idx(0, k + 1));
  }
  const index = [];
  const geo = new THREE.BufferGeometry();
  let start = 0;
  buckets.forEach((arr, slot) => {
    if (!arr.length) return;
    for (const v of arr) index.push(v);
    geo.addGroup(start, arr.length, slot);
    start += arr.length;
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

// Wrap a flat extruded geometry (shape in XY, extrusion along +Z) onto the body.
// frame: 'front' (a=z,b=y) | 'rear' (a=z,b=y) | 'sideR'/'sideL' (a=x,b=y) | 'top' (a=x,b=z)
export function conform(P, geo, frame, opt = {}) {
  const off = opt.off ?? 0.002;
  const pos = geo.attributes.position;
  const cache = new Map();
  const q = (key, fn) => { if (cache.has(key)) return cache.get(key); const v = fn(); cache.set(key, v); return v; };
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getX(i), b = pos.getY(i), d = pos.getZ(i);
    const key = a.toFixed(4) + ',' + b.toFixed(4);
    let s;
    switch (frame) {
      case 'front': {
        const yb = opt.yClamp ? clamp(b, opt.yClamp[0], opt.yClamp[1]) : b;
        s = q(key, () => P.frontAt(yb, a)) ?? opt.fallback ?? P.xmax;
        pos.setXYZ(i, s + d + off, b, a); break;
      }
      case 'rear': {
        const yb = opt.yClamp ? clamp(b, opt.yClamp[0], opt.yClamp[1]) : b;
        s = q(key, () => P.rearAt(yb, a)) ?? opt.fallback ?? P.xmin;
        pos.setXYZ(i, s - d - off, b, a); break;
      }
      case 'sideR': case 'sideL': {
        const yb = opt.yClamp ? clamp(b, opt.yClamp[0], opt.yClamp[1]) : b;
        s = q(key, () => P.sideAt(a, yb)) ?? opt.fallback ?? P.W / 2;
        const z = s + d + off;
        pos.setXYZ(i, a, b, frame === 'sideR' ? z : -z); break;
      }
      case 'top': {
        s = q(key, () => P.topAt(a, b)) ?? opt.fallback ?? 1;
        pos.setXYZ(i, a, s + d + off, b); break;
      }
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// Helpers to build 2D shapes.
export function polyShape(points, round = 0) {
  const s = new THREE.Shape();
  const n = points.length;
  if (!round) {
    s.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < n; i++) s.lineTo(points[i][0], points[i][1]);
    s.closePath();
    return s;
  }
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n];
    const v0 = [p0[0] - p1[0], p0[1] - p1[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l0 = Math.hypot(...v0), l2 = Math.hypot(...v2);
    const r = Math.min(round, l0 / 2, l2 / 2);
    const a = [p1[0] + v0[0] / l0 * r, p1[1] + v0[1] / l0 * r];
    const c = [p1[0] + v2[0] / l2 * r, p1[1] + v2[1] / l2 * r];
    if (i === 0) s.moveTo(a[0], a[1]); else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p1[0], p1[1], c[0], c[1]);
  }
  s.closePath();
  return s;
}

// Thin strip along a polyline (for seams, trims).
export function lineShape(points, w) {
  const left = [], right = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], pa = points[Math.max(0, i - 1)], pb = points[Math.min(points.length - 1, i + 1)];
    let tx = pb[0] - pa[0], ty = pb[1] - pa[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    left.push([p[0] - ty * w / 2, p[1] + tx * w / 2]);
    right.push([p[0] + ty * w / 2, p[1] - tx * w / 2]);
  }
  return polyShape(left.concat(right.reverse()));
}

export function extrude(shape, depth, segs = 6, maxEdge = 0.03) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: segs });
  g.clearGroups();
  return maxEdge ? new TessellateModifier(maxEdge, 9).modify(g) : g;
}

export function mirrorShapePoints(points) {
  return points.map(([x, y]) => [-x, y]).reverse();
}
