// Static collision (boxes, circles, wall segments) in a spatial hash + drivable surfaces (ground, decks, ramps).

export class Colliders {
  constructor(cell = 24) { this.cell = cell; this.grid = new Map(); this.count = 0; }
  _each(minX, maxX, minZ, maxZ, fn) {
    const c = this.cell;
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++)
      for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) fn(i + ',' + j);
  }
  _add(o, minX, maxX, minZ, maxZ) {
    this.count++;
    this._each(minX, maxX, minZ, maxZ, (k) => { let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(o); });
  }
  addBox(minX, maxX, minZ, maxZ, y0 = -5, y1 = 4) { this._add({ t: 0, minX, maxX, minZ, maxZ, y0, y1 }, minX, maxX, minZ, maxZ); }
  addCircle(x, z, r, y0 = -5, y1 = 4) { this._add({ t: 1, x, z, r, y0, y1 }, x - r, x + r, z - r, z + r); }
  addSegment(ax, az, bx, bz, y0 = -5, y1 = 4, th = 0.25) {
    this._add({ t: 2, ax, az, bx, bz, y0, y1, th }, Math.min(ax, bx) - th, Math.max(ax, bx) + th, Math.min(az, bz) - th, Math.max(az, bz) + th);
  }
  // Push a circle (x,z,r) at height y out of every collider. Returns {dx,dz,nx,nz,hit}.
  resolve(x, z, r, y) {
    const seen = new Set();
    let dx = 0, dz = 0, nx = 0, nz = 0, hit = false;
    this._each(x - r, x + r, z - r, z + r, (k) => {
      const a = this.grid.get(k); if (!a) return;
      for (const o of a) {
        if (seen.has(o)) continue; seen.add(o);
        if (y + 0.6 < o.y0 || y + 0.3 > o.y1) continue;
        const px = x + dx, pz = z + dz;
        let qx, qz, rr = r;
        if (o.t === 0) {
          const inside = px > o.minX && px < o.maxX && pz > o.minZ && pz < o.maxZ;
          if (inside) {
            const l = px - o.minX, rgt = o.maxX - px, t = pz - o.minZ, b = o.maxZ - pz;
            const m = Math.min(l, rgt, t, b);
            let ex = 0, ez = 0;
            if (m === l) ex = -(l + r); else if (m === rgt) ex = rgt + r; else if (m === t) ez = -(t + r); else ez = b + r;
            dx += ex; dz += ez; const L = Math.hypot(ex, ez) || 1; nx += ex / L; nz += ez / L; hit = true; continue;
          }
          qx = Math.max(o.minX, Math.min(px, o.maxX)); qz = Math.max(o.minZ, Math.min(pz, o.maxZ));
        } else if (o.t === 1) { qx = o.x; qz = o.z; rr = r + o.r; }
        else {
          const sx = o.bx - o.ax, sz = o.bz - o.az, L2 = sx * sx + sz * sz || 1;
          const t = Math.max(0, Math.min(1, ((px - o.ax) * sx + (pz - o.az) * sz) / L2));
          qx = o.ax + sx * t; qz = o.az + sz * t; rr = r + o.th;
        }
        let vx = px - qx, vz = pz - qz;
        const d = Math.hypot(vx, vz);
        if (o.t === 0) rr = r;
        if (d < rr) {
          if (d < 1e-4) { vx = 1; vz = 0; }
          const L = d || 1, pen = rr - d;
          dx += (vx / L) * pen; dz += (vz / L) * pen; nx += vx / L; nz += vz / L; hit = true;
        }
      }
    });
    const nl = Math.hypot(nx, nz) || 1;
    return { dx, dz, nx: nx / nl, nz: nz / nl, hit };
  }
}

// Signed distance to a rounded rectangle centered at origin (half size b, corner radius r).
export function sdRoundRect(x, z, b, r) {
  const qx = Math.abs(x) - (b - r), qz = Math.abs(z) - (b - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

export class Surfaces {
  constructor() { this.list = []; }
  addRingDeck(half, radius, width, y) { this.list.push({ t: 'ring', half, radius, width, y }); }
  addRamp(x0, z0, x1, z1, width, y0, y1) { this.list.push({ t: 'ramp', x0, z0, x1, z1, width, y0, y1 }); }
  addRect(minX, maxX, minZ, maxZ, y) { this.list.push({ t: 'rect', minX, maxX, minZ, maxZ, y }); }
  // height function (terrain/road): returns a height or null outside its area; always wins inside
  addFn(fn) { this.list.push({ t: 'fn', fn }); }
  // Highest surface not much above the current height (so you can drive under decks).
  heightAt(x, z, curY = 0) {
    let best = 0;
    for (const s of this.list) {
      let h = null;
      if (s.t === 'fn') { const v = s.fn(x, z); if (v !== null) return Math.max(v, best); continue; }
      if (s.t === 'ring') { if (Math.abs(sdRoundRect(x, z, s.half, s.radius)) < s.width / 2) h = s.y; }
      else if (s.t === 'ramp') {
        const sx = s.x1 - s.x0, sz = s.z1 - s.z0, L2 = sx * sx + sz * sz;
        const t = ((x - s.x0) * sx + (z - s.z0) * sz) / L2;
        if (t >= 0 && t <= 1) {
          const lx = s.x0 + sx * t, lz = s.z0 + sz * t;
          if (Math.hypot(x - lx, z - lz) < s.width / 2) h = s.y0 + (s.y1 - s.y0) * t;
        }
      } else if (x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ) h = s.y;
      if (h !== null && h <= curY + 1.3 && h > best) best = h;
    }
    return best;
  }
}
