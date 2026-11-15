// Ambient OpenStreetMap traffic for ThaiMap (Thailand & Japan — left-hand drive).
// Renders all vehicles with 4 InstancedMeshes (~4 draw calls total).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roadY, elevAt, laneCount } from './roadmesh.js';
import { botReady, makeBotBody, randomBotCustom } from '../city/botcars.js';

const DRIVABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const LANE_W = 3.3;
const SPAWN_MIN_R = 250;
const SPAWN_MAX_R = 550;
const DESPAWN_R = 650;
const CAR_RADIUS = 1.3;

const CAR_COLORS = [
  0xf2f3f5, // white
  0xf2f3f5, // white (common)
  0xc9ced6, // silver
  0x8c939e, // dark silver
  0x1c1e22, // black
  0x2e3238, // charcoal
  0x1b3a6b, // dark blue
  0xb82525, // red
  0xd6cfc2, // champagne
  0xec4899, // BKK pink taxi
  0xfacc15, // BKK yellow taxi
  0x16a34a, // BKK green taxi
  0x1e6b43, // Tokyo green taxi
];

function ck(cx, cz) {
  return (cx + 20000) * 40000 + (cz + 20000);
}

function roadSpeed(c) {
  if (c === 'motorway' || c === 'trunk') return 22 + Math.random() * 6;
  if (c === 'primary') return 14 + Math.random() * 4;
  return 10 + Math.random() * 3;
}

function buildCarGeometries() {
  // Car local space: +X front, +Y up, +Z right, ground at Y = 0
  const lowerBody = new THREE.BoxGeometry(4.3, 0.58, 1.74);
  lowerBody.translate(0, 0.52, 0);
  const roof = new THREE.BoxGeometry(1.75, 0.08, 1.46);
  roof.translate(-0.15, 1.33, 0);
  const bodyGeo = mergeGeometries([lowerBody, roof]);

  const cabinGeo = new THREE.BoxGeometry(2.1, 0.48, 1.48);
  cabinGeo.translate(-0.15, 1.05, 0);

  const hlL = new THREE.BoxGeometry(0.08, 0.14, 0.34);
  hlL.translate(2.16, 0.58, -0.56);
  const hlR = new THREE.BoxGeometry(0.08, 0.14, 0.34);
  hlR.translate(2.16, 0.58, 0.56);
  const headGeo = mergeGeometries([hlL, hlR]);

  const tlL = new THREE.BoxGeometry(0.08, 0.14, 0.36);
  tlL.translate(-2.16, 0.62, -0.56);
  const tlR = new THREE.BoxGeometry(0.08, 0.14, 0.36);
  tlR.translate(-2.16, 0.62, 0.56);
  const tailGeo = mergeGeometries([tlL, tlR]);

  return { bodyGeo, cabinGeo, headGeo, tailGeo };
}

export class RealTraffic {
  constructor(scene, count = 50) {
    this.scene = scene;
    this.count = Math.max(1, count | 0);
    this.group = new THREE.Group();
    this.group.name = 'RealTraffic';
    scene.add(this.group);

    const { bodyGeo, cabinGeo, headGeo, tailGeo } = buildCarGeometries();
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.25 });
    this.cabinMat = new THREE.MeshStandardMaterial({ color: 0x121820, roughness: 0.15, metalness: 0.65 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe8a0, emissiveIntensity: 0.35, roughness: 0.2 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x881010, emissive: 0xff2222, emissiveIntensity: 0.4, roughness: 0.25 });

    this.bodyMesh = new THREE.InstancedMesh(bodyGeo, this.bodyMat, this.count);
    this.cabinMesh = new THREE.InstancedMesh(cabinGeo, this.cabinMat, this.count);
    this.headMesh = new THREE.InstancedMesh(headGeo, this.headMat, this.count);
    this.tailMesh = new THREE.InstancedMesh(tailGeo, this.tailMat, this.count);

    const col = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      col.setHex(CAR_COLORS[i % CAR_COLORS.length]);
      this.bodyMesh.setColorAt(i, col);
    }
    if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;

    this._meshes = [this.bodyMesh, this.cabinMesh, this.headMesh, this.tailMesh];
    for (const m of this._meshes) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }

    this.cars = [];
    for (let i = 0; i < this.count; i++) {
      this.cars.push({
        active: false,
        road: null,
        isLocal: true,
        dir: 1,
        seg: 0,
        along: 0,
        lane: 0,
        laneOff: 0,
        speed: 14,
        baseSpeed: 14,
        x: 0,
        y: 0,
        z: 0,
        tx: 1,
        tz: 0,
        pick: Math.random(),
        custom: randomBotCustom(),
        real: null,
        realGen: null,
      });
    }
    this._lodT = 0;
    this._nearLimit = Math.min(16, Math.max(6, Math.round(this.count * 0.35)));

    this._dummy = new THREE.Object3D();
    this._zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    this._pool = [];
    this._poolIsLocal = true;
    this._poolPos = [1e9, 1e9];
    this._hideAll();
  }

  _hideAll() {
    for (let i = 0; i < this.count; i++) {
      for (const m of this._meshes) m.setMatrixAt(i, this._zeroMat);
    }
    for (const m of this._meshes) m.instanceMatrix.needsUpdate = true;
  }

  _refreshPool(px, pz, tm) {
    this._pool = [];
    this._poolPos = [px, pz];

    const collect = (roads, idx, cell, radius) => {
      if (!roads || !roads.length) return [];
      const out = [];
      const seen = new Set();
      if (idx) {
        const cx = Math.floor(px / cell), cz = Math.floor(pz / cell);
        const rad = Math.ceil(radius / cell);
        for (let i = -rad; i <= rad; i++) {
          for (let j = -rad; j <= rad; j++) {
            const a = idx.get(ck(cx + i, cz + j));
            if (!a) continue;
            for (let q = 0; q < a.length; q += 2) {
              const ri = a[q];
              if (seen.has(ri)) continue;
              seen.add(ri);
              const r = roads[ri];
              if (!r || r.skip || !DRIVABLE.has(r.c) || r.total < 15) continue;
              out.push(r);
            }
          }
        }
      } else {
        const r2 = radius * radius;
        for (let ri = 0; ri < roads.length; ri++) {
          const r = roads[ri];
          if (!r || r.skip || !DRIVABLE.has(r.c) || r.total < 15) continue;
          const p = r.p, mid = (p.length >> 2) * 2;
          const dx = p[mid] - px, dz = p[mid + 1] - pz;
          if (dx * dx + dz * dz <= r2) out.push(r);
        }
      }
      return out;
    };

    if (tm.local?.roads) {
      const localPool = collect(tm.local.roads, tm.localIdx, 40, 600);
      if (localPool.length > 0) {
        this._pool = localPool;
        this._poolIsLocal = true;
        return;
      }
    }
    if (tm.country?.roads) {
      this._pool = collect(tm.country.roads, tm.countryIdx, 200, 900);
      this._poolIsLocal = false;
    }
  }

  _computeLaneOffset(r, dir) {
    const lanes = laneCount(r);
    if (!r.o) {
      // Two-way road: left-hand drive places vehicles on the LEFT of travel direction
      const per = Math.max(1, Math.floor(lanes / 2));
      const lane = Math.floor(Math.random() * per);
      return { lane, laneOff: (0.5 + lane) * LANE_W };
    }
    // One-way road: distribute across all lanes
    const lane = Math.floor(Math.random() * lanes);
    return { lane, laneOff: (-(lanes - 1) / 2 + lane) * LANE_W };
  }

  _findSeg(r, along) {
    const cum = r.cum, n = (r.p.length >> 1) - 1;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= along) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  _spawnCar(car, px, pz, tm, initial = false) {
    if (!this._pool.length) {
      car.active = false;
      return;
    }
    const minR = initial ? 40 : SPAWN_MIN_R;
    const maxR = initial ? SPAWN_MAX_R : SPAWN_MAX_R;
    const minR2 = minR * minR;
    const maxR2 = maxR * maxR;

    for (let tries = 0; tries < 24; tries++) {
      const r = this._pool[Math.floor(Math.random() * this._pool.length)];
      const along = Math.random() * r.total;
      const seg = this._findSeg(r, along);
      const p = r.p, cum = r.cum;
      const segLen = (cum[seg + 1] - cum[seg]) || 1;
      const t = (along - cum[seg]) / segLen;
      const x = p[seg * 2] + (p[seg * 2 + 2] - p[seg * 2]) * t;
      const z = p[seg * 2 + 1] + (p[seg * 2 + 3] - p[seg * 2 + 1]) * t;
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 < minR2 || d2 > maxR2) continue;

      const dir = r.o ? 1 : (Math.random() < 0.5 ? 1 : -1);
      const { lane, laneOff } = this._computeLaneOffset(r, dir);

      // Avoid spawning right on top of another active car
      let crowded = false;
      for (let j = 0; j < this.cars.length; j++) {
        const o = this.cars[j];
        if (!o.active || o === car) continue;
        if ((o.x - x) * (o.x - x) + (o.z - z) * (o.z - z) < 196) {
          crowded = true;
          break;
        }
      }
      if (crowded && tries < 18) continue;

      car.active = true;
      car.road = r;
      car.isLocal = this._poolIsLocal;
      car.dir = dir;
      car.seg = seg;
      car.along = along;
      car.lane = lane;
      car.laneOff = laneOff;
      car.baseSpeed = roadSpeed(r.c);
      car.speed = car.baseSpeed;
      this._placeCar(car);
      return;
    }
    car.active = false;
  }

  _tryContinue(car, tm) {
    const r = car.road;
    const p = r.p;
    const n = p.length >> 1;
    const endX = car.dir === 1 ? p[n * 2 - 2] : p[0];
    const endZ = car.dir === 1 ? p[n * 2 - 1] : p[1];

    const idx = car.isLocal ? tm.localIdx : tm.countryIdx;
    const roads = car.isLocal ? tm.local?.roads : tm.country?.roads;
    const cell = car.isLocal ? 40 : 200;
    const snapDist = car.isLocal ? 12 : 30;
    if (!idx || !roads) return false;

    const cx = Math.floor(endX / cell), cz = Math.floor(endZ / cell);
    const seen = new Set();
    let best = null, bestScore = -1e9;

    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const a = idx.get(ck(cx + i, cz + j));
        if (!a) continue;
        for (let q = 0; q < a.length; q += 2) {
          const ri = a[q];
          if (seen.has(ri)) continue;
          seen.add(ri);
          const nr = roads[ri];
          if (!nr || nr === r || nr.skip || !DRIVABLE.has(nr.c) || nr.total < 10) continue;

          const np = nr.p, nn = np.length >> 1;
          // Check start of nr
          const d0 = Math.hypot(np[0] - endX, np[1] - endZ);
          if (d0 <= snapDist) {
            const dx = np[2] - np[0], dz = np[3] - np[1], L = Math.hypot(dx, dz) || 1;
            const dot = car.tx * (dx / L) + car.tz * (dz / L);
            if (dot > 0.2) {
              const score = dot - d0 * 0.02 + (!!nr.elev === !!r.elev ? 0.5 : 0);
              if (score > bestScore) { bestScore = score; best = { nr, ndir: 1 }; }
            }
          }
          // Check end of nr (only if two-way)
          if (!nr.o) {
            const d1 = Math.hypot(np[nn * 2 - 2] - endX, np[nn * 2 - 1] - endZ);
            if (d1 <= snapDist) {
              const dx = np[nn * 2 - 4] - np[nn * 2 - 2], dz = np[nn * 2 - 3] - np[nn * 2 - 1], L = Math.hypot(dx, dz) || 1;
              const dot = car.tx * (dx / L) + car.tz * (dz / L);
              if (dot > 0.2) {
                const score = dot - d1 * 0.02 + (!!nr.elev === !!r.elev ? 0.5 : 0);
                if (score > bestScore) { bestScore = score; best = { nr, ndir: -1 }; }
              }
            }
          }
        }
      }
    }

    if (!best) return false;
    const { nr, ndir } = best;
    const { lane, laneOff } = this._computeLaneOffset(nr, ndir);
    car.road = nr;
    car.dir = ndir;
    car.along = ndir === 1 ? 0 : nr.total;
    car.seg = ndir === 1 ? 0 : (nr.p.length >> 1) - 2;
    car.lane = lane;
    car.laneOff = laneOff;
    car.baseSpeed = roadSpeed(nr.c);
    return true;
  }

  _placeCar(car) {
    const r = car.road, p = r.p, cum = r.cum;
    const s = car.seg;
    const segLen = (cum[s + 1] - cum[s]) || 1;
    const t = Math.max(0, Math.min(1, (car.along - cum[s]) / segLen));
    const x0 = p[s * 2], z0 = p[s * 2 + 1];
    const x1 = p[s * 2 + 2], z1 = p[s * 2 + 3];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;

    const tx = (dx / len) * car.dir;
    const tz = (dz / len) * car.dir;
    // Left-hand normal of (tx, tz) in XZ (X east, Z south) is (tz, -tx)
    const lx = tz, lz = -tx;

    car.x = x0 + dx * t + lx * car.laneOff;
    car.z = z0 + dz * t + lz * car.laneOff;
    car.y = r.elev ? elevAt(r, car.along) + roadY(r) : (car.isLocal ? roadY(r) : 0.05);
    car.tx = tx;
    car.tz = tz;
  }

  update(dt, playerPos, tm, night = 0) {
    if (!tm || !tm.loaded || !playerPos) return;
    const px = playerPos.x, pz = playerPos.z;

    // Update night emissive intensity
    const n = night ? Math.max(0, Math.min(1, +night)) : 0;
    this.headMat.emissiveIntensity = 0.35 + n * 2.2;
    this.tailMat.emissiveIntensity = 0.4 + n * 1.9;

    // Refresh nearby road pool when player moves > 100m or pool is empty
    if (!this._pool.length || Math.hypot(px - this._poolPos[0], pz - this._poolPos[1]) > 100) {
      this._refreshPool(px, pz, tm);
    }

    const clampedDt = Math.min(0.1, Math.max(0, dt || 0));
    const despawnR2 = DESPAWN_R * DESPAWN_R;
    const dummy = this._dummy;

    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (!car.active) {
        this._spawnCar(car, px, pz, tm, true);
      } else {
        // Despawn if too far from player
        const dxp = car.x - px, dzp = car.z - pz;
        if (dxp * dxp + dzp * dzp > despawnR2) {
          this._spawnCar(car, px, pz, tm, false);
        }
      }

      if (!car.active) {
        if (car.real) car.real.visible = false;
        for (const m of this._meshes) m.setMatrixAt(i, this._zeroMat);
        continue;
      }

      // Simple car-following spacing on the same road/dir/lane
      let targetSpeed = car.baseSpeed;
      for (let j = 0; j < this.cars.length; j++) {
        if (j === i) continue;
        const o = this.cars[j];
        if (!o.active || o.road !== car.road || o.dir !== car.dir || o.lane !== car.lane) continue;
        const gap = (o.along - car.along) * car.dir;
        if (gap > 0 && gap < 11) {
          targetSpeed = Math.min(targetSpeed, gap < 6 ? 0 : o.speed * 0.9);
        }
      }
      car.speed += Math.max(-10 * clampedDt, Math.min(5 * clampedDt, targetSpeed - car.speed));

      // Advance along polyline
      car.along += car.speed * clampedDt * car.dir;
      const r = car.road, cum = r.cum, nSeg = (r.p.length >> 1) - 1;

      if (car.dir === 1) {
        while (car.seg < nSeg - 1 && car.along > cum[car.seg + 1]) car.seg++;
        if (car.along >= r.total) {
          if (!this._tryContinue(car, tm)) {
            this._spawnCar(car, px, pz, tm, false);
            if (!car.active) {
              for (const m of this._meshes) m.setMatrixAt(i, this._zeroMat);
              continue;
            }
          }
        }
      } else {
        while (car.seg > 0 && car.along < cum[car.seg]) car.seg--;
        if (car.along <= 0) {
          if (!this._tryContinue(car, tm)) {
            this._spawnCar(car, px, pz, tm, false);
            if (!car.active) {
              for (const m of this._meshes) m.setMatrixAt(i, this._zeroMat);
              continue;
            }
          }
        }
      }

      this._placeCar(car);

      if (car.real && car.real.visible) {
        car.real.position.set(car.x, car.y, car.z);
        car.real.rotation.y = Math.atan2(-car.tz, car.tx);
        for (const m of this._meshes) m.setMatrixAt(i, this._zeroMat);
      } else {
        dummy.position.set(car.x, car.y, car.z);
        dummy.rotation.set(0, Math.atan2(-car.tz, car.tx), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        for (const m of this._meshes) m.setMatrixAt(i, dummy.matrix);
      }
    }

    this._lodT -= clampedDt;
    if (this._lodT <= 0) {
      this._lodT = 0.4;
      this._updateLOD(px, pz);
    }

    for (const m of this._meshes) m.instanceMatrix.needsUpdate = true;
  }

  _updateLOD(px, pz) {
    const protos = botReady();
    if (!protos.length) return;
    const near = [];
    for (const c of this.cars) {
      if (!c.active) { if (c.real) c.real.visible = false; continue; }
      const d2 = (c.x - px) ** 2 + (c.z - pz) ** 2;
      if (d2 < 320 * 320) near.push([d2, c]);
      else if (c.real) c.real.visible = false;
    }
    near.sort((a, b) => a[0] - b[0]);
    const show = new Set(near.slice(0, this._nearLimit).map(([, c]) => c));
    for (const [, c] of near) {
      const on = show.has(c);
      if (on && !c.real) {
        const pr = protos[Math.floor(c.pick * protos.length)];
        c.real = makeBotBody(pr, c.custom.paint, false, c.custom);
        c.realCount = protos.length;
        this.group.add(c.real);
      } else if (on && c.real && c.realCount < protos.length && Math.random() < 0.05) {
        this.group.remove(c.real);
        c.real = null;
      }
      if (c.real) c.real.visible = on;
    }
  }

  collide(x, z, r, y = 0) {
    let dx = 0, dz = 0, nx = 0, nz = 0, hit = false;
    const maxR = r + 2.5;
    const rr = r + CAR_RADIUS;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (!c.active || Math.abs(c.y - y) >= 2.5) continue;
      const vx = (x + dx) - c.x;
      const vz = (z + dz) - c.z;
      if (Math.abs(vx) > maxR || Math.abs(vz) > maxR) continue;
      const d = Math.hypot(vx, vz);
      if (d < rr) {
        const len = d > 1e-4 ? d : 1;
        const ux = d > 1e-4 ? vx / len : 1;
        const uz = d > 1e-4 ? vz / len : 0;
        const pen = rr - d;
        dx += ux * pen;
        dz += uz * pen;
        nx += ux;
        nz += uz;
        hit = true;
      }
    }
    if (!hit) return null;
    const nl = Math.hypot(nx, nz) || 1;
    return { dx, dz, nx: nx / nl, nz: nz / nl, hit: true };
  }

  setVisible(v) {
    this.group.visible = !!v;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of this._meshes) {
      m.geometry.dispose();
      m.material.dispose();
      m.dispose();
    }
    this.cars.length = 0;
    this._pool.length = 0;
  }
}
