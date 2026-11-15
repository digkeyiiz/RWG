// Simple traffic AI: cars drive on the LEFT (Japan), follow lanes, turn at intersections,
// obey signals at main crossings, keep distance, and yield to the player. Expressway cars loop the ring.
import * as THREE from 'three';
import { LAYOUT } from './city.js';
import { makeVehicle, VEHICLE_TYPES, lightMats } from './vehicles.js';
import { rng } from './textures.js';
import { botReady, makeBotBody, randomBotCustom, setBotLights } from './botcars.js';

const L = LAYOUT;
const nodePos = (i, j) => [L.c[i], L.c[j]];
const laneOff = (main) => (main ? 4.6 : 2.2);

export class Traffic {
  constructor(city, count = 42, ringCount = 16, seed = 7, opts = {}) {
    this.city = city;
    this.opts = { real: true, nearN: 8, shadows: true, ...opts };
    this.lodT = 0;
    this.group = new THREE.Group();
    this.cars = [];
    this.r = rng(seed);
    const r = this.r;
    // grid cars
    let tries = 0;
    while (this.cars.length < count && tries++ < 500) {
      const i = Math.floor(r() * (L.N + 1)), j = Math.floor(r() * (L.N + 1));
      const nb = this.neighbors(i, j);
      const [ni, nj] = nb[Math.floor(r() * nb.length)];
      const car = { kind: 'grid', a: [i, j], b: [ni, nj], s: 12 + r() * 30, v: 6, mode: 'seg', wait: 0 };
      this.setupSeg(car);
      if (this.cars.some((c) => c.kind === 'grid' && c.a[0] === car.a[0] && c.a[1] === car.a[1] && c.b[0] === car.b[0] && c.b[1] === car.b[1] && Math.abs(c.s - car.s) < 9)) continue;
      this.addMesh(car);
    }
    // expressway cars
    const pts = city.ringPts;
    this.ring = { pts, cum: [0] };
    for (let k = 1; k <= pts.length; k++) { const p = pts[k - 1], q = pts[k % pts.length]; this.ring.cum.push(this.ring.cum[k - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
    this.ring.len = this.ring.cum[pts.length];
    for (let k = 0; k < ringCount; k++) {
      const car = { kind: 'ring', s: (k / ringCount) * this.ring.len + r() * 20, dir: k % 2 ? 1 : -1, v: 18, lane: r() < 0.5 ? 1.8 : 5.1 };
      this.addMesh(car);
    }
    this.update(0, null, 0);
  }

  addMesh(car) {
    const type = VEHICLE_TYPES[Math.floor(this.r() * VEHICLE_TYPES.length)];
    // root holds the light procedural car and (near the player) a real model from the garage
    const simple = makeVehicle(type, this.r);
    car.mesh = new THREE.Group();
    car.mesh.add(simple);
    car.mesh.userData = { ...simple.userData };
    car.simple = simple;
    car.color = '#' + simple.children[0].material.color.getHexString();
    car.eligible = type !== 'truck';
    car.pick = this.r();
    car.custom = randomBotCustom(this.r);
    car.real = null;
    car.realCount = 0;
    car.vmax = (type === 'truck' ? 0.85 : type === 'kei' ? 0.92 : 1) * (0.9 + this.r() * 0.2);
    this.group.add(car.mesh);
    this.cars.push(car);
  }

  neighbors(i, j) {
    const out = [];
    if (i > 0) out.push([i - 1, j]); if (i < L.N) out.push([i + 1, j]);
    if (j > 0) out.push([i, j - 1]); if (j < L.N) out.push([i, j + 1]);
    return out;
  }

  // geometry of the current segment a→b
  setupSeg(car) {
    const [ai, aj] = car.a, [bi, bj] = car.b;
    const [ax, az] = nodePos(ai, aj), [bx, bz] = nodePos(bi, bj);
    const len = Math.hypot(bx - ax, bz - az);
    car.d = [(bx - ax) / len, (bz - az) / len];
    car.axis = ai === bi ? 1 : 0; // 1 = moving along z
    car.main = car.axis === 1 ? L.main[ai] : L.main[aj];
    car.off = laneOff(car.main);
    car.left = [car.d[1], -car.d[0]];
    car.len = len;
    // half size of the intersection box we arrive at (cross road's half width)
    car.crossB = (car.axis === 1 ? L.w[bj] : L.w[bi]) / 2;
    car.crossA = (car.axis === 1 ? L.w[aj] : L.w[ai]) / 2;
    car.ax = ax; car.az = az;
  }

  segPoint(car, s) { return [car.ax + car.d[0] * s + car.left[0] * car.off, car.az + car.d[1] * s + car.left[1] * car.off]; }

  startTurn(car) {
    const r = this.r;
    const [bi, bj] = car.b;
    let nb = this.neighbors(bi, bj).filter(([i, j]) => !(i === car.a[0] && j === car.a[1]));
    if (!nb.length) nb = [car.a];
    // prefer going straight a bit more often
    const straight = nb.find(([i, j]) => i - bi === car.b[0] - car.a[0] && j - bj === car.b[1] - car.a[1]);
    const next = straight && r() < 0.45 ? straight : nb[Math.floor(r() * nb.length)];
    const E = this.segPoint(car, car.len - car.crossB - 1);
    const nxt = { a: [bi, bj], b: next };
    this.setupSeg(nxt);
    const X = this.segPoint(nxt, nxt.crossA + 1);
    const dEX = [X[0] - E[0], X[1] - E[1]];
    const proj = dEX[0] * car.d[0] + dEX[1] * car.d[1];
    let C = [E[0] + car.d[0] * proj, E[1] + car.d[1] * proj];
    if (Math.abs(car.d[0] * nxt.d[0] + car.d[1] * nxt.d[1]) > 0.9) C = [(E[0] + X[0]) / 2, (E[1] + X[1]) / 2];
    car.turn = { E, C, X, u: 0, len: Math.hypot(C[0] - E[0], C[1] - E[1]) + Math.hypot(X[0] - C[0], X[1] - C[1]) + 0.01, next };
    car.mode = 'turn';
  }

  ringPose(s, lane, dir) {
    const R = this.ring, n = R.pts.length;
    s = ((s % R.len) + R.len) % R.len;
    let k = 0, lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (R.cum[m + 1] <= s) lo = m + 1; else hi = m; }
    k = lo;
    const p = R.pts[k], q = R.pts[(k + 1) % n];
    const t = (s - R.cum[k]) / (R.cum[k + 1] - R.cum[k]);
    const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1;
    const fx = dx / l * dir, fz = dz / l * dir;
    const left = [fz, -fx];
    return { x: p[0] + dx * t + left[0] * lane, z: p[1] + dz * t + left[1] * lane, fx, fz };
  }

  // level of detail: the nearest cars swap their simple body for a merged real-model Car with randomized tuning
  updateLOD(player) {
    const protos = this.opts.real ? botReady() : [];
    if (!protos.length) return;
    const near = [];
    for (const c of this.cars) {
      if (!c.eligible || c.x === undefined) continue;
      const d = player ? (c.x - player.x) ** 2 + (c.z - player.z) ** 2 + ((c.y - player.y) * 3) ** 2 : 0;
      near.push([d, c]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const lim = Math.min(8, this.opts.nearN || 8);
    const show = new Set(near.slice(0, lim).filter(([d]) => d < 180 * 180).map(([, c]) => c));
    let built = 0;
    for (const [, c] of near) {
      const on = show.has(c);
      if (on && c.real && c.realCount < protos.length && built === 0 && Math.random() < 0.08) {
        c.mesh.remove(c.real);
        c.real = null;
      }
      if (on && !c.real && built < 2) {
        const pr = protos[Math.floor(c.pick * protos.length)];
        c.real = makeBotBody(pr, c.custom.paint, false, c.custom);
        c.realCount = protos.length;
        c.mesh.add(c.real);
        c.mesh.userData.L = pr.L; c.mesh.userData.W = pr.W;
        built++;
      }
      if (c.real) c.real.visible = on;
      c.simple.visible = !on || !c.real;
    }
  }

  update(dt, player, night) {
    this.lodT -= dt;
    if (this.lodT <= 0) { this.lodT = 0.35; this.updateLOD(player); }
    setBotLights(night);
    const st = this.city.signalState(this.city.time);
    lightMats.head.emissiveIntensity = 0.2 + night * 3;
    lightMats.tail.emissiveIntensity = 0.3 + night * 1.6;
    lightMats.taxiSign.emissiveIntensity = 0.4 + night * 1.5;
    for (const car of this.cars) {
      let target = (car.kind === 'ring' ? 22 : car.main ? 12.5 : 8) * car.vmax;
      let x, z, fx, fz, y = 0;
      if (car.kind === 'grid') {
        if (car.mode === 'seg') {
          const stopAt = car.len - car.crossB - 3;
          const [bi, bj] = car.b;
          const signal = L.main[bi] && L.main[bj];
          if (signal) {
            const light = car.axis === 0 ? st.x : st.z;
            const dist = stopAt - car.s;
            if (light !== 'g' && dist > 0.5 && dist < 40 && !(light === 'y' && dist < 6)) target = Math.min(target, Math.max(0, Math.sqrt(2 * 4 * Math.max(0, dist - 0.5))));
          } else if (!car.main) {
            const dist = stopAt - car.s;
            if (dist < 14) target = Math.min(target, 4.5 + Math.max(0, dist) * 0.3);
          }
          // car following on the same segment
          for (const o of this.cars) {
            if (o === car || o.kind !== 'grid') continue;
            let gap = Infinity;
            if (o.mode === 'seg' && o.a[0] === car.a[0] && o.a[1] === car.a[1] && o.b[0] === car.b[0] && o.b[1] === car.b[1] && o.s > car.s) gap = o.s - car.s - (o.mesh.userData.L + car.mesh.userData.L) / 2;
            else if (o.mode === 'turn' && o.turn && o.a && o.a[0] === car.a[0] && o.a[1] === car.a[1] && o.b[0] === car.b[0] && o.b[1] === car.b[1]) gap = car.len - car.crossB - car.s - 4;
            if (gap < 30) target = Math.min(target, Math.max(0, (gap - 2.5) * 0.9));
          }
          [x, z] = this.segPoint(car, car.s); fx = car.d[0]; fz = car.d[1];
        } else {
          const T = car.turn, u = T.u, iu = 1 - u;
          x = iu * iu * T.E[0] + 2 * iu * u * T.C[0] + u * u * T.X[0];
          z = iu * iu * T.E[1] + 2 * iu * u * T.C[1] + u * u * T.X[1];
          fx = 2 * iu * (T.C[0] - T.E[0]) + 2 * u * (T.X[0] - T.C[0]); fz = 2 * iu * (T.C[1] - T.E[1]) + 2 * u * (T.X[1] - T.C[1]);
          const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
          target = Math.min(target, 6.5);
        }
      } else {
        const p = this.ringPose(car.s, car.lane, car.dir);
        x = p.x; z = p.z; fx = p.fx; fz = p.fz; y = LAYOUT.ring.y;
        for (const o of this.cars) {
          if (o === car || o.kind !== 'ring' || o.dir !== car.dir || Math.abs(o.lane - car.lane) > 1) continue;
          let gap = (o.s - car.s) * car.dir; gap = ((gap % this.ring.len) + this.ring.len) % this.ring.len;
          if (gap < 40) target = Math.min(target, Math.max(0, (gap - 7) * 0.8));
        }
      }
      // yield to the player
      if (player && Math.abs(player.y - y) < 3) {
        const dx = player.x - x, dz = player.z - z, ahead = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx);
        if (ahead > 0 && ahead < 16 && side < 2.6) target = Math.min(target, Math.max(0, (ahead - 5) * 0.8));
      }
      if (car.wait > 0) { car.wait -= dt; target = 0; }
      car.v += Math.max(-7 * dt, Math.min(2.6 * dt, target - car.v));
      const ds = Math.max(0, car.v) * dt;
      if (car.kind === 'grid') {
        if (car.mode === 'seg') {
          car.s += ds;
          if (car.s >= car.len - car.crossB - 1) this.startTurn(car);
        } else {
          car.turn.u += ds / car.turn.len;
          if (car.turn.u >= 1) {
            const nb = car.turn.next;
            car.a = car.b.slice(); car.b = nb; this.setupSeg(car);
            car.s = car.crossA + 1; car.mode = 'seg'; car.turn = null;
          }
        }
      } else car.s += ds * car.dir;
      car.mesh.position.set(x, y, z);
      car.mesh.rotation.y = Math.atan2(-fz, fx);
      car.x = x; car.z = z; car.y = y; car.fx = fx; car.fz = fz;
    }
  }

  // push the player's circle out of traffic cars; returns {dx,dz,nx,nz,hit,carSpeed}
  collide(px, pz, r, py) {
    let dx = 0, dz = 0, nx = 0, nz = 0, hit = false;
    for (const c of this.cars) {
      if (c.x === undefined || Math.abs(c.y - py) > 2.5) continue;
      const half = c.mesh.userData.L / 2 - c.mesh.userData.W / 2, cr = c.mesh.userData.W / 2 + 0.1;
      for (const k of [-half, 0, half]) {
        const cx = c.x + c.fx * k, cz = c.z + c.fz * k;
        const vx = px + dx - cx, vz = pz + dz - cz, d = Math.hypot(vx, vz), rr = r + cr;
        if (d < rr && d > 1e-4) { const pen = rr - d; dx += vx / d * pen; dz += vz / d * pen; nx += vx / d; nz += vz / d; hit = true; c.wait = 2.5; }
      }
    }
    const l = Math.hypot(nx, nz) || 1;
    return { dx, dz, nx: nx / l, nz: nz / l, hit };
  }
}
