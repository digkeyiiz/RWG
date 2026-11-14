// Tiny geometry accumulator for building big merged meshes (one draw call per material).
import * as THREE from 'three';

export class GeoBuf {
  constructor(colors = false) { this.p = []; this.n = []; this.uv = []; this.c = colors ? [] : null; this.i = []; }
  get count() { return this.p.length / 3; }
  // 4 corners (a,b,c,d) counter-clockwise seen from the front; normal n; uvs per corner
  quad(a, b, c, d, n, uva = [0, 0], uvb = [1, 0], uvc = [1, 1], uvd = [0, 1], col = null) {
    const k = this.count;
    for (const v of [a, b, c, d]) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); }
    this.uv.push(...uva, ...uvb, ...uvc, ...uvd);
    if (this.c) for (let q = 0; q < 4; q++) this.c.push(col?.[0] ?? 1, col?.[1] ?? 1, col?.[2] ?? 1);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  tri(a, b, c, n, uva, uvb, uvc, col = null) {
    const k = this.count;
    for (const v of [a, b, c]) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); }
    this.uv.push(...uva, ...uvb, ...uvc);
    if (this.c) for (let q = 0; q < 3; q++) this.c.push(col?.[0] ?? 1, col?.[1] ?? 1, col?.[2] ?? 1);
    this.i.push(k, k + 1, k + 2);
  }
  // vertical wall from a=[x,z] to b=[x,z] (left→right seen from outside), outward normal derived
  wall(a, b, y0, y1, u0, tileW, tileH, vOff = 0, col = null, uvRect = null) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 1e-4) return u0;
    const n = [-dz / L, 0, dx / L];
    let uA = u0 / tileW, uB = (u0 + L) / tileW, vA = (y0 - vOff) / tileH, vB = (y1 - vOff) / tileH;
    if (uvRect) { [uA, vA, uB, vB] = uvRect; }
    this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], n, [uA, vA], [uB, vA], [uB, vB], [uA, vB], col);
    return u0 + L;
  }
  // 4 walls of an axis-aligned box (continuous u around the building)
  boxWalls(x0, x1, z0, z1, y0, y1, tileW, tileH, vOff = 0, col = null) {
    let u = 0;
    u = this.wall([x0, z1], [x1, z1], y0, y1, u, tileW, tileH, vOff, col); // south (+z)
    u = this.wall([x1, z1], [x1, z0], y0, y1, u, tileW, tileH, vOff, col); // east (+x)
    u = this.wall([x1, z0], [x0, z0], y0, y1, u, tileW, tileH, vOff, col); // north (-z)
    this.wall([x0, z0], [x0, z1], y0, y1, u, tileW, tileH, vOff, col);     // west (-x)
  }
  top(x0, x1, z0, z1, y, tile = 4, col = null) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [x0 / tile, z1 / tile], [x1 / tile, z1 / tile], [x1 / tile, z0 / tile], [x0 / tile, z0 / tile], col);
  }
  // horizontal flat quad given 4 xz corners (CCW from above) at height y
  flat(pts, y, tile = 4, col = null) {
    const [a, b, c, d] = pts;
    this.quad([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [d[0], y, d[1]], [0, 1, 0], [a[0] / tile, a[1] / tile], [b[0] / tile, b[1] / tile], [c[0] / tile, c[1] / tile], [d[0] / tile, d[1] / tile], col);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// Flat horizontal strip quad from (ax,az)→(bx,bz) with width w at height y
export function stripQuad(buf, ax, az, bx, bz, w, y, col) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
  const nx = -dz / L * w / 2, nz = dx / L * w / 2;
  // CCW from above: left side is (+nx,+nz)
  buf.flat([[ax - nx, az - nz], [bx - nx, bz - nz], [bx + nx, bz + nz], [ax + nx, az + nz]].reverse(), y, 4, col);
}
