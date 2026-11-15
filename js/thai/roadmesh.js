// Road mesh construction for the optional Thailand map layer.
// Pure geometry helpers + canvas road textures. No scene management here.
import * as THREE from 'three';

export const LANE_W = 3.3;
export const ELEV_H = 9;                 // elevated expressway deck height (m)
export const ELEV_CLASSES = new Set(['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link']);
const MINOR = new Set(['residential', 'service', 'living_street', 'unclassified', 'track', 'path', 'road']);
const SIDEWALK_CLASSES = new Set(['trunk', 'primary', 'secondary']);
const SIDEWALK_W = 1.1;                  // concrete sidewalk width on each side (m)
const RANK = { motorway: 6, motorway_link: 5, trunk: 5, trunk_link: 4, primary: 4, primary_link: 3, secondary: 3, secondary_link: 2, tertiary: 2, tertiary_link: 1 };
const DASH_CYCLE = 9;                    // metres per texture repeat along the road

export function isMinor(c) { return MINOR.has(c) || !(c in RANK); }
export function roadRank(c) { return RANK[c] || 0; }
function hasSidewalk(r) { return !r.elev && SIDEWALK_CLASSES.has(r.c); }

export function defaultLanes(r) {
  const c = r.c, o = r.o;
  if (c === 'motorway' || c === 'motorway_link') return o ? 3 : 6;
  if (c === 'trunk' || c === 'trunk_link') return o ? 2 : 4;
  if (c === 'primary' || c === 'primary_link') return o ? 2 : 4;
  if (c === 'secondary' || c === 'secondary_link') return o ? 1 : 2;
  if (c === 'tertiary' || c === 'tertiary_link') return o ? 1 : 2;
  return o ? 1 : 2;
}
export function laneCount(r) {
  const l = r.l | 0;
  return Math.max(1, Math.min(8, l > 0 ? l : defaultLanes(r)));
}
export function roadWidth(r) {
  const L = laneCount(r);
  if (isMinor(r.c)) return Math.max(4.5, L * LANE_W + 0.4);
  return L * LANE_W + 1.0 + (hasSidewalk(r) ? SIDEWALK_W * 2 : 0);
}
/** Road y offset above ground: higher class draws on top (avoids z-fight at junctions). */
export function roadY(r) { return 0.04 + roadRank(r.c) * 0.03; }

export function smooth01(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

/** Deck elevation at distance d along road (ramps at free ends). */
export function elevAt(r, d) {
  if (!r.elev) return 0;
  const tot = r.total || 1, ramp = Math.min(90, tot / 2);
  let h = ELEV_H;
  if (r.r0) h *= smooth01(d / ramp);
  if (r.r1) h *= smooth01((tot - d) / ramp);
  return h;
}

// ---------------------------------------------------------------- Geo builder
export class Geo {
  constructor(withColor) {
    this.pos = []; this.nrm = []; this.uv = []; this.idx = []; this.col = withColor ? [] : null; this.n = 0;
  }
  vert(x, y, z, nx, ny, nz, u, v, c) {
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.uv.push(u, v);
    if (this.col) { c = c || [1, 1, 1]; this.col.push(c[0], c[1], c[2]); }
    return this.n++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  /** Flat quad, vertices in order v0..v3, normal = (v1-v0)x(v3-v0). */
  quad(a, b, c, d, uvs, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const u = uvs || [0, 0, 1, 0, 1, 1, 0, 1];
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, u[0], u[1], col);
    const i1 = this.vert(b[0], b[1], b[2], nx, ny, nz, u[2], u[3], col);
    const i2 = this.vert(c[0], c[1], c[2], nx, ny, nz, u[4], u[5], col);
    const i3 = this.vert(d[0], d[1], d[2], nx, ny, nz, u[6], u[7], col);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }
  get empty() { return this.n === 0; }
  toBufferGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    if (this.col) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setIndex(new THREE.BufferAttribute(this.n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// ---------------------------------------------------------------- textures
/** Key identifying the marking layout: minor ('m'), sidewalked ('s'), or highway/tertiary ('r') + lanes + oneway. */
export function roadTexKey(r) {
  if (isMinor(r.c)) return 'm' + (r.o ? 1 : 0);
  return (hasSidewalk(r) ? 's' : 'r') + laneCount(r) + (r.o ? 'o' : 't');
}

export function makeRoadTexture(key, aniso = 4) {
  const minor = key[0] === 'm', sidewalk = key[0] === 's';
  let lanes = 2, oneway = key.endsWith('o') || key === 'm1';
  if (!minor) lanes = parseInt(key.slice(1), 10);
  const sideW = sidewalk ? SIDEWALK_W : 0;
  const roadW = minor ? 5 : lanes * LANE_W + 1.0;
  const widthM = roadW + sideW * 2;
  const PPM = 12;
  const W = Math.max(32, Math.round(widthM * PPM)), H = 256;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;

  // Deterministic fast PRNG for crisp aggregate grain & longitudinal wear
  let seed = (W * 73856093) ^ (lanes * 19349663) ^ (sidewalk ? 83492791 : 0);
  const nextRand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  const colWear = new Float32Array(W);
  for (let x = 0; x < W; x++) colWear[x] = ((nextRand() & 255) / 255 - 0.5) * 3.5;

  const jointPeriod = H / 4;   // 2.25m sidewalk slab joints
  const curbPeriod = H / 6;    // 1.5m curb block joints
  for (let y = 0; y < H; y++) {
    const isSlabJoint = (y % jointPeriod) < 1.3;
    const isCurbJoint = (y % curbPeriod) < 1.1;
    for (let x = 0; x < W; x++) {
      const xm = (x + 0.5) / PPM;
      const idx = (y * W + x) * 4;
      const rnd = nextRand();
      const grain = ((rnd & 15) - 7.5) * 0.65;
      const fleck = (rnd & 127) === 0 ? 11 : (rnd & 127) === 1 ? -9 : 0;

      if (sideW > 0 && (xm < sideW || xm > widthM - sideW)) {
        // Concrete sidewalk + Thai painted curb (red/white major, black/white secondary) + gutter shadow
        const dOut = Math.min(xm, widthM - xm);
        const dIn = sideW - dOut;
        if (dIn >= 0.04 && dIn < 0.17 && !isCurbJoint) {
          const alt = (Math.floor(y / curbPeriod) & 1) === 0;
          let cr, cg, cb;
          if (lanes >= 4) {
            [cr, cg, cb] = alt ? [178, 46, 42] : [206, 204, 198];
          } else {
            [cr, cg, cb] = alt ? [46, 48, 54] : [202, 200, 194];
          }
          const dv = (grain * 0.6 + fleck * 0.4) | 0;
          d[idx] = Math.max(0, Math.min(255, cr + dv));
          d[idx + 1] = Math.max(0, Math.min(255, cg + dv));
          d[idx + 2] = Math.max(0, Math.min(255, cb + dv));
          d[idx + 3] = 255;
          continue;
        }
        let base = 116;
        if (dIn < 0.04) {
          base = 44; // gutter shadow
        } else if (dIn < 0.17) {
          base = 92; // curb block joint
        } else {
          if (isSlabJoint) base -= 16;
          if (dOut < 0.09) base -= 14; // grass-edge darkening
        }
        const v = Math.max(0, Math.min(255, (base + grain * 0.7 + fleck * 0.5) | 0));
        d[idx] = v; d[idx + 1] = v + 1; d[idx + 2] = Math.max(0, v - 3); d[idx + 3] = 255;
        continue;
      }

      // Asphalt surface
      const rx = xm - sideW;
      let lum = 38 + colWear[x];
      let wearSmooth = 1.0;

      if (!minor) {
        if (rx < 0.5 || rx > roadW - 0.5) {
          // Shoulder: slightly dustier/lighter weathered asphalt
          lum += 5;
          const dEdge = Math.min(rx, roadW - rx);
          if (dEdge < 0.08) lum -= 6;
        } else {
          const lx = (rx - 0.5) % LANE_W;
          const t1 = (lx - 0.85) / 0.36, t2 = (lx - 2.45) / 0.36;
          const track = Math.exp(-t1 * t1) + Math.exp(-t2 * t2);
          const centerOil = Math.exp(-Math.pow((lx - 1.65) / 0.42, 2));
          lum -= track * 6.5 + centerOil * 2.2;
          wearSmooth = 1.0 - track * 0.35;
        }
      } else {
        const t1 = (rx - roadW * 0.33) / 0.45, t2 = (rx - roadW * 0.67) / 0.45;
        const track = Math.exp(-t1 * t1) + Math.exp(-t2 * t2);
        lum += 3 - track * 5.5;
        wearSmooth = 1.0 - track * 0.3;
      }

      const noise = grain * wearSmooth + fleck * wearSmooth;
      const rVal = Math.max(0, Math.min(255, (lum + noise) | 0));
      const gVal = Math.max(0, Math.min(255, (lum + 1 + noise) | 0));
      const bVal = Math.max(0, Math.min(255, (lum + 4 + noise) | 0));
      d[idx] = rVal; d[idx + 1] = gVal; d[idx + 2] = bVal; d[idx + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  if (!minor) {
    const m = (x) => (sideW + x) * PPM, lw = 0.14 * PPM;
    const line = (xm, col, w) => { g.fillStyle = col; g.fillRect(m(xm) - w / 2, 0, w, H); };
    const dash = (xm, col) => { g.fillStyle = col; g.fillRect(m(xm) - lw / 2, 0, lw, H * (3 / DASH_CYCLE)); };
    const stud = (xm, yFrac, glowCol) => {
      const sx = m(xm), sy = Math.round(H * yFrac);
      g.fillStyle = '#47505a';
      g.fillRect(sx - 1.5, sy - 1.5, 3, 3);
      g.fillStyle = glowCol;
      g.fillRect(sx - 1.0, sy - 1.0, 2, 2);
    };
    g.globalAlpha = 0.92;
    line(0.5 + 0.08, '#ebebea', lw); line(roadW - 0.58, '#ebebea', lw);   // edge lines
    if (oneway) {
      for (let k = 1; k < lanes; k++) {
        dash(0.5 + k * LANE_W, '#ebebea');
        stud(0.5 + k * LANE_W, 0.67, '#eefaff');
      }
    } else {
      const cx = roadW / 2;
      if (lanes >= 2) {
        line(cx - 0.12, '#eab600', lw * 0.9); line(cx + 0.12, '#eab600', lw * 0.9);   // double yellow centre
        stud(cx, 0.17, '#ffd54f'); stud(cx, 0.67, '#ffd54f');
        const per = lanes / 2;
        for (let k = 1; k < per; k++) {
          dash(cx - k * LANE_W, '#ebebea'); dash(cx + k * LANE_W, '#ebebea');
          stud(cx - k * LANE_W, 0.67, '#eefaff'); stud(cx + k * LANE_W, 0.67, '#eefaff');
        }
      } else {
        dash(cx, '#eab600');
        stud(cx, 0.67, '#ffd54f');
      }
    }
    g.globalAlpha = 1.0;
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  return t;
}

// ---------------------------------------------------------------- ribbons
/**
 * Emit a road ribbon for vertices a..b (inclusive) of road r into geo (road surface) and
 * conc (concrete: deck sides/underside/piers, only for elevated roads).
 * halfW = half width. Uses neighbours a-1 / b+1 for continuous joins across chunk pieces.
 * opts.coarse: no uv markings, no deck structure, sparse points.
 */
export function addRoadRibbon(geo, conc, r, a, b, opts = {}) {
  const p = r.p, cum = r.cum, coarse = !!opts.coarse;
  const halfW = (opts.width || roadWidth(r)) / 2;
  const y0 = opts.y != null ? opts.y : roadY(r);
  const elev = !!r.elev && !coarse;
  // dense sample list
  const X = [], Z = [], D = [];
  const maxSeg = elev ? 15 : 1e9;
  const minSp = coarse ? (opts.minSpacing || 30) : 0;
  let lastX = 0, lastZ = 0;
  for (let i = a; i <= b; i++) {
    const x = p[i * 2], z = p[i * 2 + 1], d = cum[i];
    if (i > a) {
      const px = X[X.length - 1], pz = Z[Z.length - 1], pd = D[D.length - 1];
      const L = Math.hypot(x - px, z - pz);
      if (coarse && i < b && L < minSp) continue;
      const n = Math.ceil(L / maxSeg);
      for (let k = 1; k < n; k++) { const t = k / n; X.push(px + (x - px) * t); Z.push(pz + (z - pz) * t); D.push(pd + (d - pd) * t); }
    }
    X.push(x); Z.push(z); D.push(d);
  }
  const n = X.length;
  if (n < 2) return;
  const hasPrev = a > 0, hasNext = (b + 1) * 2 < p.length;
  const prevX = hasPrev ? p[(a - 1) * 2] : X[0], prevZ = hasPrev ? p[(a - 1) * 2 + 1] : Z[0];
  const nextX = hasNext ? p[(b + 1) * 2] : X[n - 1], nextZ = hasNext ? p[(b + 1) * 2 + 1] : Z[n - 1];

  const Lx = new Float32Array(n), Lz = new Float32Array(n), Rx = new Float32Array(n), Rz = new Float32Array(n);
  const Y = new Float32Array(n), dX = new Float32Array(n), dZ = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const ax = k > 0 ? X[k - 1] : prevX, az = k > 0 ? Z[k - 1] : prevZ;
    const cx = k < n - 1 ? X[k + 1] : nextX, cz = k < n - 1 ? Z[k + 1] : nextZ;
    let d1x = X[k] - ax, d1z = Z[k] - az, l1 = Math.hypot(d1x, d1z);
    let d2x = cx - X[k], d2z = cz - Z[k], l2 = Math.hypot(d2x, d2z);
    if (l1 < 1e-6) { d1x = d2x; d1z = d2z; l1 = l2; }
    if (l2 < 1e-6) { d2x = d1x; d2z = d1z; l2 = l1; }
    if (l1 < 1e-6) { d1x = 1; d1z = 0; l1 = 1; d2x = 1; d2z = 0; l2 = 1; }
    d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
    // side vector s = (-dz, dx); miter
    let sx = -(d1z + d2z), sz = d1x + d2x;
    const sl = Math.hypot(sx, sz);
    if (sl < 1e-4) { sx = -d1z; sz = d1x; } else { sx /= sl; sz /= sl; }
    const cosH = Math.max(0.45, sx * -d1z + sz * d1x);
    const w = halfW / cosH;
    Lx[k] = X[k] - sx * w; Lz[k] = Z[k] - sz * w; Rx[k] = X[k] + sx * w; Rz[k] = Z[k] + sz * w;
    dX[k] = d1x + d2x; dZ[k] = d1z + d2z;
    Y[k] = y0 + (elev ? elevAt(r, D[k]) : 0);
  }
  const vs = 1 / DASH_CYCLE;
  let prev = -1;
  const base = geo.n;
  for (let k = 0; k < n; k++) {
    const v = D[k] * vs;
    geo.vert(Lx[k], Y[k], Lz[k], 0, 1, 0, 0, v);
    geo.vert(Rx[k], Y[k], Rz[k], 0, 1, 0, 1, v);
  }
  for (let k = 0; k < n - 1; k++) {
    const l0 = base + k * 2, r0 = l0 + 1, l1 = l0 + 2, r1 = l0 + 3;
    geo.tri(l0, r1, l1); geo.tri(l0, r0, r1);
  }
  if (!elev || !conc) return;
  addElevatedDeck(conc, X, Z, Y, Lx, Lz, Rx, Rz, halfW);
  addPiers(conc, X, Z, Y, D, dX, dZ, halfW);
}

/** Emit elevated expressway box deck and sloped concrete Jersey barriers with top caps. */
export function addElevatedDeck(conc, X, Z, Y, Lx, Lz, Rx, Rz, halfW) {
  const n = X.length;
  if (n < 2) return;
  const BOT = 1.5, PARA = 0.95, KNEE_H = 0.26;
  const IN0 = 0.42, IN1 = 0.25, IN2 = 0.20;
  const invHW = 1 / (halfW || 1);
  for (let k = 0; k < n - 1; k++) {
    const k1 = k + 1;
    const yb0 = Y[k] - BOT, yb1 = Y[k1] - BOT;
    const yt0 = Y[k] + PARA, yt1 = Y[k1] + PARA;
    const yk0 = Y[k] + KNEE_H, yk1 = Y[k1] + KNEE_H;
    const ux0 = (Rx[k] - X[k]) * invHW, uz0 = (Rz[k] - Z[k]) * invHW;
    const ux1 = (Rx[k1] - X[k1]) * invHW, uz1 = (Rz[k1] - Z[k1]) * invHW;

    // Outer deck + barrier walls
    conc.quad([Rx[k], yb0, Rz[k]], [Rx[k1], yb1, Rz[k1]], [Rx[k1], yt1, Rz[k1]], [Rx[k], yt0, Rz[k]]);
    conc.quad([Lx[k1], yb1, Lz[k1]], [Lx[k], yb0, Lz[k]], [Lx[k], yt0, Lz[k]], [Lx[k1], yt1, Lz[k1]]);

    // Barrier inner offsets (mitered)
    const r0x0 = Rx[k] - ux0 * IN0, r0z0 = Rz[k] - uz0 * IN0, r0x1 = Rx[k1] - ux1 * IN0, r0z1 = Rz[k1] - uz1 * IN0;
    const r1x0 = Rx[k] - ux0 * IN1, r1z0 = Rz[k] - uz0 * IN1, r1x1 = Rx[k1] - ux1 * IN1, r1z1 = Rz[k1] - uz1 * IN1;
    const r2x0 = Rx[k] - ux0 * IN2, r2z0 = Rz[k] - uz0 * IN2, r2x1 = Rx[k1] - ux1 * IN2, r2z1 = Rz[k1] - uz1 * IN2;
    const l0x0 = Lx[k] + ux0 * IN0, l0z0 = Lz[k] + uz0 * IN0, l0x1 = Lx[k1] + ux1 * IN0, l0z1 = Lz[k1] + uz1 * IN0;
    const l1x0 = Lx[k] + ux0 * IN1, l1z0 = Lz[k] + uz0 * IN1, l1x1 = Lx[k1] + ux1 * IN1, l1z1 = Lz[k1] + uz1 * IN1;
    const l2x0 = Lx[k] + ux0 * IN2, l2z0 = Lz[k] + uz0 * IN2, l2x1 = Lx[k1] + ux1 * IN2, l2z1 = Lz[k1] + uz1 * IN2;

    // Top caps (flat horizontal concrete faces)
    conc.quad([Rx[k], yt0, Rz[k]], [Rx[k1], yt1, Rz[k1]], [r2x1, yt1, r2z1], [r2x0, yt0, r2z0]);
    conc.quad([l2x0, yt0, l2z0], [l2x1, yt1, l2z1], [Lx[k1], yt1, Lz[k1]], [Lx[k], yt0, Lz[k]]);

    // Inner Jersey barrier faces (lower kick-slope + upper sloped wall)
    conc.quad([r0x1, Y[k1], r0z1], [r0x0, Y[k], r0z0], [r1x0, yk0, r1z0], [r1x1, yk1, r1z1]);
    conc.quad([r1x1, yk1, r1z1], [r1x0, yk0, r1z0], [r2x0, yt0, r2z0], [r2x1, yt1, r2z1]);
    conc.quad([l0x0, Y[k], l0z0], [l0x1, Y[k1], l0z1], [l1x1, yk1, l1z1], [l1x0, yk0, l1z0]);
    conc.quad([l1x0, yk0, l1z0], [l1x1, yk1, l1z1], [l2x1, yt1, l2z1], [l2x0, yt0, l2z0]);

    // Deck underside
    conc.quad([Lx[k], yb0, Lz[k]], [Lx[k1], yb1, Lz[k1]], [Rx[k1], yb1, Rz[k1]], [Rx[k], yb0, Rz[k]]);
  }
}

/** Emit elevated expressway support piers along sampled deck points. */
export function addPiers(conc, X, Z, Y, D, dX, dZ, halfW) {
  const BOT = 1.5;
  let lastPier = -1e9;
  for (let k = 0; k < X.length - 1; k++) {
    if (Y[k] <= 3 || D[k] - lastPier < 28) continue;
    lastPier = D[k];
    const dl = Math.hypot(dX[k], dZ[k]) || 1, fx = dX[k] / dl, fz = dZ[k] / dl, sx = -fz, sz = fx;
    const hw = Math.min(1.1, halfW * 0.18), hl = 0.9, cx = X[k], cz = Z[k], top = Y[k] - BOT, gy = 0;
    const c = [
      [cx - fx * hl - sx * hw, cz - fz * hl - sz * hw], [cx + fx * hl - sx * hw, cz + fz * hl - sz * hw],
      [cx + fx * hl + sx * hw, cz + fz * hl + sz * hw], [cx - fx * hl + sx * hw, cz - fz * hl + sz * hw],
    ];
    for (let e = 0; e < 4; e++) {
      const A = c[e], B = c[(e + 1) % 4];
      conc.quad([A[0], gy, A[1]], [B[0], gy, B[1]], [B[0], top, B[1]], [A[0], top, A[1]]);
    }
  }
}

/** Emit a coarse road ribbon (no deck/piers, sparse sampling). */
export function addCoarseRibbon(geo, r, a, b, opts = {}) {
  addRoadRibbon(geo, null, r, a, b, { ...opts, coarse: true });
}
