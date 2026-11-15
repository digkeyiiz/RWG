// Open-world streetscape & architecture props (streetlamps, light pools, urban trees, rooftops, neon signs).
// Merges per-chunk geometry into up to 4 draw calls using shared materials on WorldProps.
import * as THREE from 'three';
import { Geo, roadWidth, elevAt, roadY } from './roadmesh.js';

const LAMP_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary']);
const TREE_CLASSES = new Set(['primary', 'secondary', 'tertiary']);
const NEON_COLORS = ['#ff3b7f', '#00e5ff', '#ffb02e', '#4cff88'];

function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function makeRng(gx, gz) {
  let s = ((gx * 73856093) ^ (gz * 19349663) ^ 0x9e3779b9) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function makePoolTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeNeonTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  for (let i = 0; i < 4; i++) {
    const x = i * 64;
    ctx.fillStyle = '#111318';
    ctx.fillRect(x, 0, 64, 64);
    ctx.fillStyle = NEON_COLORS[i];
    ctx.fillRect(x + 4, 4, 56, 56);
    // Subtle dark border & horizontal/vertical tube bars for sign detail
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x + 10, 14, 44, 6);
    ctx.fillRect(x + 10, 30, 36, 6);
    ctx.fillRect(x + 10, 44, 44, 5);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Emit an oriented 3D box into `geo`.
 * Basis: U = (ux, 0, uz), Y = (0, 1, 0), V = (-uz, 0, ux).
 * Center at (cx, cy, cz), half-extents (hx, hy, hz).
 */
function emitBox(geo, cx, cy, cz, hx, hy, hz, ux, uz, col, uvs, skipBottom = true) {
  const vx = -uz, vz = ux;
  const p = (sx, sy, sz) => [
    cx + ux * sx * hx + vx * sz * hz,
    cy + sy * hy,
    cz + uz * sx * hx + vz * sz * hz,
  ];
  // Top (+Y)
  geo.quad(p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), uvs, col);
  // Front (+V)
  geo.quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), uvs, col);
  // Back (-V)
  geo.quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), uvs, col);
  // Right (+U)
  geo.quad(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), uvs, col);
  // Left (-U)
  geo.quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), uvs, col);
  if (!skipBottom) {
    geo.quad(p(-1, -1, 1), p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), uvs, col);
  }
}

/** Emit a vertical tapered N-sided prism or cone (rTop === 0 for cone). */
function emitPrism(geo, cx, baseY, cz, rBot, rTop, h, sides, col, angleOffset = 0) {
  const topY = baseY + h;
  const step = (Math.PI * 2) / sides;
  if (rTop <= 0.001) {
    const apex = geo.vert(cx, topY, cz, 0, 1, 0, 0.5, 1, col);
    let prevX = cx + Math.cos(angleOffset) * rBot;
    let prevZ = cz + Math.sin(angleOffset) * rBot;
    for (let i = 1; i <= sides; i++) {
      const a = angleOffset + i * step;
      const nx = cx + Math.cos(a) * rBot;
      const nz = cz + Math.sin(a) * rBot;
      const mx = (prevX + nx) * 0.5 - cx;
      const mz = (prevZ + nz) * 0.5 - cz;
      const len = Math.hypot(mx, mz) || 1;
      const nrmX = mx / len, nrmZ = mz / len;
      const i0 = geo.vert(nx, baseY, nz, nrmX, 0.4, nrmZ, 0, 0, col);
      const i1 = geo.vert(prevX, baseY, prevZ, nrmX, 0.4, nrmZ, 1, 0, col);
      geo.tri(i0, i1, apex);
      prevX = nx; prevZ = nz;
    }
    return;
  }
  for (let i = 0; i < sides; i++) {
    const a0 = angleOffset + i * step;
    const a1 = angleOffset + (i + 1) * step;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const b0 = [cx + c1 * rBot, baseY, cz + s1 * rBot];
    const b1 = [cx + c0 * rBot, baseY, cz + s0 * rBot];
    const t1 = [cx + c0 * rTop, topY, cz + s0 * rTop];
    const t0 = [cx + c1 * rTop, topY, cz + s1 * rTop];
    geo.quad(b0, b1, t1, t0, null, col);
  }
  // Top cap
  const centerIdx = geo.vert(cx, topY, cz, 0, 1, 0, 0.5, 0.5, col);
  let prev = geo.vert(cx + Math.cos(angleOffset) * rTop, topY, cz + Math.sin(angleOffset) * rTop, 0, 1, 0, 1, 0.5, col);
  for (let i = 1; i <= sides; i++) {
    const a = angleOffset + i * step;
    const cur = geo.vert(cx + Math.cos(a) * rTop, topY, cz + Math.sin(a) * rTop, 0, 1, 0, 0.5, 0.5, col);
    geo.tri(cur, prev, centerIdx);
    prev = cur;
  }
}

function emitPool(geo, cx, y, cz, radius) {
  geo.quad(
    [cx - radius, y, cz - radius],
    [cx - radius, y, cz + radius],
    [cx + radius, y, cz + radius],
    [cx + radius, y, cz - radius],
    [0, 0, 0, 1, 1, 1, 1, 0],
    null,
  );
}

function polyCentroid(p) {
  const n = p.length >> 1;
  if (n === 0) return [0, 0];
  let sx = 0, sz = 0;
  for (let i = 0; i < n; i++) { sx += p[i * 2]; sz += p[i * 2 + 1]; }
  return [sx / n, sz / n];
}

function insideAnyBuilding(x, z, blds, margin = 1.6) {
  for (let i = 0; i < blds.length; i++) {
    const bx = blds[i]._box;
    if (!bx) continue;
    if (x >= bx[0] - margin && x <= bx[1] + margin && z >= bx[2] - margin && z <= bx[3] + margin) {
      return true;
    }
  }
  return false;
}

export class WorldProps {
  constructor(quality = 1) {
    this.quality = quality;
    this.night = 0;

    this.poolTex = makePoolTexture();
    this.neonTex = makeNeonTexture();

    this.solidMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.15,
    });

    this.lampMatTH = new THREE.MeshStandardMaterial({
      color: 0xffb454,
      emissive: 0xffb454,
      emissiveIntensity: 0,
      roughness: 0.3,
    });
    this.lampMatJP = new THREE.MeshStandardMaterial({
      color: 0xdceeff,
      emissive: 0xdceeff,
      emissiveIntensity: 0,
      roughness: 0.3,
    });

    const poolOpts = {
      map: this.poolTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    };
    this.poolMatTH = new THREE.MeshBasicMaterial({ ...poolOpts, color: 0xffb454 });
    this.poolMatJP = new THREE.MeshBasicMaterial({ ...poolOpts, color: 0xdceeff });
    this.poolMatTH.visible = false;
    this.poolMatJP.visible = false;

    this.neonMat = new THREE.MeshStandardMaterial({
      map: this.neonTex,
      emissiveMap: this.neonTex,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0.1,
    });
  }

  setNight(n) {
    this.night = n ? Math.max(0, Math.min(1, +n)) : 0;
    const lampGlow = this.night * 2.2;
    this.lampMatTH.emissiveIntensity = lampGlow;
    this.lampMatJP.emissiveIntensity = lampGlow;

    const poolOp = this.night * 0.35;
    this.poolMatTH.opacity = poolOp;
    this.poolMatJP.opacity = poolOp;
    const poolVis = this.night > 0.005;
    this.poolMatTH.visible = poolVis;
    this.poolMatJP.visible = poolVis;

    this.neonMat.emissiveIntensity = this.night * 2.0;
  }

  buildChunk(gx, gz, cellSize, roads, blds, isJapan = false) {
    const rng = makeRng(gx, gz);
    const solidGeo = new Geo(true);
    const lampGeo = new Geo(false);
    const poolGeo = new Geo(false);
    const neonGeo = new Geo(false);

    const lampStep = this.quality === 0 ? 60 : 45;
    const treeStep = this.quality === 0 ? 45 : 35;
    const maxTrees = this.quality === 0 ? 35 : this.quality >= 2 ? 75 : 60;
    let treeCount = 0;

    const poleCol = isJapan ? [0.28, 0.31, 0.35] : [0.36, 0.38, 0.40];
    const trunkCol = [0.34, 0.23, 0.14];

    // 1 & 2: Street Lamps, Light Pools, and Urban Trees along roads
    if (roads && roads.length) {
      for (let ri = 0; ri < roads.length; ri++) {
        const entry = roads[ri];
        const r = entry.road;
        const doLamp = LAMP_CLASSES.has(r.c);
        const doTree = treeCount < maxTrees && TREE_CLASSES.has(r.c);
        const doGantry = !r.elev && !r.b && (r.c === 'motorway' || r.c === 'trunk') && roadWidth(r) >= 12;
        if (!doLamp && !doTree && !doGantry) continue;

        const p = r.p;
        const w = roadWidth(r);
        const ry = roadY(r);
        const cum = r.cum;
        const totalD = cum ? cum[cum.length - 1] : 0;

        for (let i = entry.a; i < entry.b; i++) {
          const x0 = p[i * 2], z0 = p[i * 2 + 1];
          const x1 = p[i * 2 + 2], z1 = p[i * 2 + 3];
          const segLen = Math.hypot(x1 - x0, z1 - z0);
          if (segLen < 1.0) continue;

          const ux = (x1 - x0) / segLen;
          const uz = (z1 - z0) / segLen;
          // Perpendicular right-hand normal
          const nx = -uz, nz = ux;
          const d0 = cum ? cum[i] : 0;
          const d1 = cum ? cum[i + 1] : d0 + segLen;

          if (doLamp) {
            const firstD = Math.ceil(d0 / lampStep) * lampStep;
            const edge = w * 0.5 + 0.6;
            for (let d = firstD; d < d1; d += lampStep) {
              const t = (d - d0) / segLen;
              const px = x0 + (x1 - x0) * t;
              const pz = z0 + (z1 - z0) * t;
              const elev = r.elev ? elevAt(r, d) : 0;
              const side = (Math.round(d / lampStep) & 1) ? 1 : -1;

              const lx = px + nx * edge * side;
              const lz = pz + nz * edge * side;
              // Pole (height 7.5m)
              emitBox(solidGeo, lx, elev + 3.75, lz, 0.09, 3.75, 0.09, ux, uz, poleCol);
              // Arm reaching inward toward road
              const armLen = 1.6;
              const ax = lx - nx * side * (armLen * 0.5);
              const az = lz - nz * side * (armLen * 0.5);
              emitBox(solidGeo, ax, elev + 7.38, az, 0.06, 0.06, armLen * 0.5, ux, uz, poleCol);

              // Emissive lamp head at tip of arm
              const hx = lx - nx * side * (armLen - 0.15);
              const hz = lz - nz * side * (armLen - 0.15);
              emitBox(lampGeo, hx, elev + 7.26, hz, 0.28, 0.07, 0.16, ux, uz, null, null, false);

              // Ground light pool
              const poolY = elev > 0 ? elev + 0.08 + ry : 0.08 + ry;
              emitPool(poolGeo, hx, poolY, hz, 7.5);
            }
          }

          if (doGantry) {
            const gStep = 360;
            const firstG = Math.ceil(Math.max(45, d0) / gStep) * gStep;
            const pOff = w * 0.5 + 0.85;
            for (let d = firstG; d < d1 && d < totalD - 25; d += gStep) {
              const elev = r.elev ? elevAt(r, d) : 0;
              if (elev > 0.2) continue;
              const t = (d - d0) / segLen;
              const gxPos = x0 + (x1 - x0) * t;
              const gzPos = z0 + (z1 - z0) * t;
              if (blds && insideAnyBuilding(gxPos, gzPos, blds, w * 0.5)) continue;
              for (const sgn of [-1, 1]) {
                emitBox(solidGeo, gxPos + nx * pOff * sgn, 3.9, gzPos + nz * pOff * sgn, 0.24, 3.9, 0.24, ux, uz, poleCol);
              }
              emitBox(solidGeo, gxPos, 7.65, gzPos, 0.22, 0.26, pOff + 0.2, ux, uz, poleCol);
              emitBox(solidGeo, gxPos, 6.95, gzPos, 0.16, 0.14, pOff + 0.2, ux, uz, poleCol);
              // Illuminated overhead green (#4cff88 slot 3) & cyan (#00e5ff slot 1) expressway signboards
              const signOffsets = w >= 16 ? [-w * 0.22, w * 0.22] : [0];
              signOffsets.forEach((off, idx) => {
                const cIdx = idx === 0 ? 3 : 1;
                const u0 = cIdx * 0.25 + 0.01, u1 = (cIdx + 1) * 0.25 - 0.01;
                const sx = gxPos + nx * off, sz = gzPos + nz * off;
                emitBox(neonGeo, sx, 6.85, sz, 0.16, 0.9, Math.min(w * 0.19, 3.1), ux, uz, null, [u0, 0, u1, 0, u1, 1, u0, 1], false);
              });
            }
          }

          if (doTree && treeCount < maxTrees) {
            const firstT = Math.ceil(d0 / treeStep) * treeStep;
            const treeEdge = w * 0.5 + 2.2;
            for (let d = firstT; d < d1 && treeCount < maxTrees; d += treeStep) {
              const elev = r.elev ? elevAt(r, d) : 0;
              if (elev > 1.0) continue; // No trees on elevated decks
              const t = (d - d0) / segLen;
              const px = x0 + (x1 - x0) * t;
              const pz = z0 + (z1 - z0) * t;
              const side = (Math.round(d / treeStep) & 1) ? -1 : 1;
              const tx = px + nx * treeEdge * side;
              const tz = pz + nz * treeEdge * side;

              if (blds && insideAnyBuilding(tx, tz, blds, 1.5)) continue;

              const scale = 0.85 + rng() * 0.45;
              const trunkH = 2.4 * scale;
              const angle = rng() * Math.PI * 2;
              emitPrism(solidGeo, tx, 0, tz, 0.18 * scale, 0.12 * scale, trunkH, 4, trunkCol, angle);

              const shade = (rng() - 0.5) * 0.06;
              const g1 = isJapan
                ? [0.12 + shade, 0.34 + shade, 0.14]
                : [0.15 + shade, 0.36 + shade, 0.12];
              const g2 = isJapan
                ? [0.16 + shade, 0.43 + shade, 0.18]
                : [0.20 + shade, 0.46 + shade, 0.15];
              const g3 = isJapan
                ? [0.22 + shade, 0.52 + shade, 0.22]
                : [0.26 + shade, 0.55 + shade, 0.19];

              emitPrism(solidGeo, tx, trunkH * 0.85, tz, 1.75 * scale, 0, 2.2 * scale, 5, g1, angle);
              emitPrism(solidGeo, tx, trunkH + 0.95 * scale, tz, 1.35 * scale, 0, 2.0 * scale, 5, g2, angle + 0.6);
              if (this.quality > 0) {
                emitPrism(solidGeo, tx, trunkH + 1.95 * scale, tz, 0.9 * scale, 0, 1.6 * scale, 5, g3, angle + 1.2);
              }
              treeCount++;
            }
          }
        }
      }
    }

    // 3: Building Rooftop Mechanicals & Neon Shopfront Signs
    if (blds && blds.length) {
      for (let bi = 0; bi < blds.length; bi++) {
        const b = blds[bi];
        if (!b._box || b.h < 12) continue;
        const bw = b._box[1] - b._box[0];
        const bd = b._box[3] - b._box[2];
        if (bw < 3 || bd < 3) continue;

        const [cx, cz] = polyCentroid(b.p);
        const hSeed = hash2(Math.round(cx), Math.round(cz));

        // Rooftop details on ~50% of buildings with h >= 12
        if (hSeed < 0.5) {
          const count = hSeed < 0.22 ? 2 : 1;
          for (let k = 0; k < count; k++) {
            const ox = k === 0 ? 0 : (rng() - 0.5) * Math.min(bw * 0.3, 3.0);
            const oz = k === 0 ? 0 : (rng() - 0.5) * Math.min(bd * 0.3, 3.0);
            const isTank = rng() < 0.35;
            if (isTank) {
              const r = Math.min(Math.min(bw, bd) * 0.18, 1.2 + rng() * 0.6);
              const th = 1.6 + rng() * 1.4;
              emitPrism(solidGeo, cx + ox, b.h, cz + oz, r, r, th, 6, [0.64, 0.67, 0.70]);
            } else {
              const hx = Math.min(bw * 0.22, 1.0 + rng() * 1.5);
              const hz = Math.min(bd * 0.22, 1.0 + rng() * 1.5);
              const hy = 0.7 + rng() * 1.1;
              const col = rng() < 0.5 ? [0.50, 0.52, 0.55] : [0.35, 0.38, 0.42];
              emitBox(solidGeo, cx + ox, b.h + hy, cz + oz, hx, hy, hz, 1, 0, col);
            }
          }
        }

        // Neon shopfront signs on ~30% of buildings with h >= 15
        if (b.h >= 15 && b.p && b.p.length >= 6 && hash2(Math.round(cx) + 17, Math.round(cz) - 31) < 0.30) {
          const p = b.p;
          const n = p.length >> 1;
          let bestLen = 0, bestI = 0;
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const len = Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1]);
            if (len > bestLen) { bestLen = len; bestI = i; }
          }
          if (bestLen >= 4.0) {
            const j = (bestI + 1) % n;
            const ax = p[bestI * 2], az = p[bestI * 2 + 1];
            const bx = p[j * 2], bz = p[j * 2 + 1];
            const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
            const ex = (bx - ax) / bestLen, ez = (bz - az) / bestLen;
            let nx = -ez, nz = ex;
            if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }

            // Orient box with U along edge (ex, ez) and V outward
            const colorIdx = Math.floor(rng() * 4) % 4;
            const u0 = colorIdx * 0.25 + 0.01;
            const u1 = (colorIdx + 1) * 0.25 - 0.01;
            const uvs = [u0, 0, u1, 0, u1, 1, u0, 1];

            const isVertical = isJapan ? rng() < 0.65 : rng() < 0.45;
            const sx = mx + nx * 0.22;
            const sz = mz + nz * 0.22;
            if (isVertical) {
              const sh = Math.min(b.h - 4.5, 4.0 + rng() * 3.5);
              if (sh > 2.0) {
                const sy = 4.0 + sh * 0.5 + rng() * Math.max(0, Math.min(4.0, b.h - 4.5 - sh));
                emitBox(neonGeo, sx, sy, sz, 0.55 + rng() * 0.25, sh * 0.5, 0.14, ex, ez, null, uvs, false);
              }
            } else {
              const sw = Math.min(bestLen * 0.55, 5.5);
              const sh = 1.1 + rng() * 0.7;
              const sy = 4.2 + rng() * 2.5;
              emitBox(neonGeo, sx, sy, sz, sw * 0.5, sh * 0.5, 0.14, ex, ez, null, uvs, false);
            }
          }
        }
      }
    }

    if (solidGeo.empty && lampGeo.empty && poolGeo.empty && neonGeo.empty) return null;

    const group = new THREE.Group();
    if (!solidGeo.empty) {
      const m = new THREE.Mesh(solidGeo.toBufferGeometry(), this.solidMat);
      m.castShadow = false;
      m.receiveShadow = true;
      group.add(m);
    }
    if (!lampGeo.empty) {
      const m = new THREE.Mesh(lampGeo.toBufferGeometry(), isJapan ? this.lampMatJP : this.lampMatTH);
      group.add(m);
    }
    if (!poolGeo.empty) {
      const m = new THREE.Mesh(poolGeo.toBufferGeometry(), isJapan ? this.poolMatJP : this.poolMatTH);
      m.renderOrder = 2;
      group.add(m);
    }
    if (!neonGeo.empty) {
      const m = new THREE.Mesh(neonGeo.toBufferGeometry(), this.neonMat);
      group.add(m);
    }
    return group;
  }

  dispose() {
    this.solidMat.dispose();
    this.lampMatTH.dispose();
    this.lampMatJP.dispose();
    this.poolMatTH.dispose();
    this.poolMatJP.dispose();
    this.neonMat.dispose();
    this.poolTex.dispose();
    this.neonTex.dispose();
  }
}
