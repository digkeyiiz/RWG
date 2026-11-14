// Police: patrols on the city grid notice speeding (or being rammed) and start a pursuit.
// Heat 1–5 sets how many units chase you and how fast. Escape by breaking line (no unit within
// range until the cooldown fills) or by hiding in a garage; get boxed in at low speed → busted.
// Bounty / fines are decided by the server; other players see your pursuers (relayed positions).
import * as THREE from 'three';
import { LAYOUT } from './city/city.js';
import { makeVehicle } from './city/vehicles.js';
import { botReady, makeBotBody } from './city/botcars.js';

const L = LAYOUT;
const GRID = 300; // the street grid spans ±288 m
const UNITS = [0, 2, 3, 4, 5, 6];
const VMAX = [0, 31, 36, 41, 47, 54]; // m/s by heat
const SPOT_R = 55, SPEED_LIMIT = 100 / 3.6;

const lightRed = new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff1030', emissiveIntensity: 0 });
const lightBlue = new THREE.MeshStandardMaterial({ color: '#004', emissive: '#1060ff', emissiveIntensity: 0 });
const barGeoL = new THREE.BoxGeometry(0.22, 0.12, 0.55).translate(0, 0, -0.3);
const barGeoR = new THREE.BoxGeometry(0.22, 0.12, 0.55).translate(0, 0, 0.3);
const blackMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 });

function policeBody() {
  const protos = botReady();
  const pr = protos.find((p) => p.gen.id === 'civic-fd') || protos.find((p) => p.gen.id === 'gen2') || protos[0];
  let body, roof = 1.45, L0 = 4.5;
  if (pr) { body = makeBotBody(pr, '#f4f4f4', false); L0 = pr.L; roof = 1.42; }
  else { body = makeVehicle('sedan', Math.random); body.children[0].material.color.set('#f4f4f4'); }
  const g = new THREE.Group();
  g.add(body);
  const bar = new THREE.Group();
  bar.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 1.25), blackMat), new THREE.Mesh(barGeoL, lightRed), new THREE.Mesh(barGeoR, lightBlue));
  bar.position.set(-0.15, roof + 0.06, 0);
  g.add(bar);
  g.userData.L = L0;
  return g;
}

const nodeXZ = (i, j) => [L.c[i], L.c[j]];
const nearestIdx = (v) => { let b = 0; for (let i = 1; i <= L.N; i++) if (Math.abs(L.c[i] - v) < Math.abs(L.c[b] - v)) b = i; return b; };
const inGrid = (x, z, y) => Math.abs(x) < GRID + 8 && Math.abs(z) < GRID + 8 && y < 3;

export class Police {
  constructor({ scene, city, touge, driver, online, toast, hooks }) {
    Object.assign(this, { scene, city, touge, driver, online, toast, hooks });
    this.group = new THREE.Group(); scene.add(this.group);
    this.patrols = []; this.units = []; this.remote = new Map();
    this.heat = 0; this.state = 'idle'; this.cool = 0; this.bust = 0; this.rams = 0; this.t = 0; this.sendT = 0;
    this.ringPath = city.ringPts.map(([x, z]) => ({ x, y: L.ring.y, z }));
    this.tougePath = touge.path;
    this.hud = document.getElementById('heatHud');
    online.on((ev) => { if (ev?.cops) this.onRemote(ev.cops); if (ev?.pursuit) this.onPursuitNote(ev.pursuit); });
  }
  get active() { return this.state === 'pursuit'; }

  setPatrols(n) {
    for (const p of this.patrols) this.group.remove(p.mesh);
    this.patrols = [];
    for (let k = 0; k < n; k++) {
      const i = 1 + Math.floor(Math.random() * (L.N - 1)), j = 1 + Math.floor(Math.random() * (L.N - 1));
      const [x, z] = nodeXZ(i, j);
      const p = { x, y: 0, z, h: 0, v: 11, node: [i, j], to: null, mesh: policeBody() };
      this.pickPatrolNext(p);
      this.group.add(p.mesh);
      this.patrols.push(p);
    }
  }
  pickPatrolNext(p) {
    const [i, j] = p.node, nb = [];
    if (i > 0) nb.push([i - 1, j]); if (i < L.N) nb.push([i + 1, j]); if (j > 0) nb.push([i, j - 1]); if (j < L.N) nb.push([i, j + 1]);
    const back = p.prev ? nb.filter((n) => !(n[0] === p.prev[0] && n[1] === p.prev[1])) : nb;
    p.to = (back.length ? back : nb)[Math.floor(Math.random() * (back.length || nb.length))];
  }
  // drive a car along grid roads towards node p.to (kept 2.2 m left of the centre line)
  gridMove(p, dt, v) {
    const [tx, tz] = nodeXZ(p.to[0], p.to[1]);
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 1.5) { p.prev = p.node; p.node = p.to; p.x = tx; p.z = tz; return true; }
    const s = Math.min(d, v * dt);
    p.x += (dx / d) * s; p.z += (dz / d) * s;
    const want = Math.atan2(-dz, dx);
    p.h += Math.atan2(Math.sin(want - p.h), Math.cos(want - p.h)) * Math.min(1, dt * 6);
    return false;
  }

  // ---------------- per frame
  update(dt, me, mode) {
    this.t += dt;
    const show = mode === 'city';
    this.group.visible = show;
    if (!show) return;
    const flash = Math.floor(this.t * 6) % 2;
    lightRed.emissiveIntensity = flash ? 4 : 0.3; lightBlue.emissiveIntensity = flash ? 0.3 : 4;
    // patrols wander and look for speeders
    for (const p of this.patrols) {
      if (this.gridMove(p, dt, p.v)) this.pickPatrolNext(p);
      this.place(p);
      if (this.state === 'idle' && !this.hooks.racing()) {
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        if (d < SPOT_R && Math.abs(me.y - p.y) < 4 && me.speed > SPEED_LIMIT) this.start(p, 'ขับเร็วเกินกำหนด');
      }
    }
    if (this.state === 'pursuit') this.pursue(dt, me);
    for (const r of this.remote.values()) for (const c of r.cars) { c.mesh.position.lerp(c.target, Math.min(1, dt * 8)); c.mesh.rotation.y += Math.atan2(Math.sin(c.th - c.mesh.rotation.y), Math.cos(c.th - c.mesh.rotation.y)) * Math.min(1, dt * 8); }
    this.renderHud();
    this.siren(dt, me);
  }
  place(p) { p.mesh.position.set(p.x, p.y, p.z); p.mesh.rotation.set(0, p.h, 0); }

  // ---------------- pursuit
  start(byUnit, why) {
    if (this.state !== 'idle') return;
    this.state = 'pursuit'; this.heat = 1; this.cool = 0; this.bust = 0; this.rams = 0; this.pt = 0; this.why = why;
    if (byUnit) { this.patrols = this.patrols.filter((p) => p !== byUnit); this.units.push({ ...byUnit, mode: 'direct' }); }
    this.toast(`🚨 ตำรวจไล่ล่า! (${why})`);
    this.online.heat('start', 1);
    this.fill();
  }
  // keep the number of pursuers that the heat level calls for, spawning out of sight behind you
  fill() {
    const me = this.me || { x: this.driver.pos.x, z: this.driver.pos.z, y: this.driver.y || 0 };
    while (this.units.length < UNITS[this.heat]) {
      const u = { x: 0, y: 0, z: 0, h: 0, v: 20, mode: 'grid', mesh: policeBody() };
      this.spawnNear(u, me, 140 + Math.random() * 60);
      this.group.add(u.mesh);
      this.units.push(u);
    }
  }
  zone(x, z, y) {
    if (y > 5) return 'ring';
    if (x < -560) return 'touge';
    return inGrid(x, z, y) ? 'grid' : 'open';
  }
  spawnNear(u, me, dist) {
    const zn = this.zone(me.x, me.z, me.y);
    if (zn === 'touge' || zn === 'ring') {
      const P = zn === 'touge' ? this.tougePath : this.ringPath;
      const i = this.pathIdx(P, me.x, me.z);
      const step = zn === 'touge' ? 2 : 4;
      const k = (i - Math.round(dist / step) + P.length * 4) % P.length;
      const p = P[k];
      Object.assign(u, { x: p.x, y: p.y, z: p.z, mode: 'path', path: P, pi: k });
      return;
    }
    // a grid node roughly `dist` away
    let best = null, bd = Infinity;
    for (let i = 0; i <= L.N; i++) for (let j = 0; j <= L.N; j++) {
      const [x, z] = nodeXZ(i, j), d = Math.abs(Math.hypot(x - me.x, z - me.z) - dist);
      if (d < bd && !this.units.some((o) => o.node && o.node[0] === i && o.node[1] === j)) { bd = d; best = [i, j]; }
    }
    const [x, z] = nodeXZ(best[0], best[1]);
    Object.assign(u, { x, y: 0, z, node: best, to: best, mode: 'grid' });
  }
  pathIdx(P, x, z) { let b = 0, bd = Infinity; for (let i = 0; i < P.length; i += 2) { const d = (P[i].x - x) ** 2 + (P[i].z - z) ** 2; if (d < bd) { bd = d; b = i; } } return b; }

  pursue(dt, me) {
    this.pt += dt;
    // heat rises with time and with rammed units
    const want = Math.min(5, 1 + Math.floor(this.pt / 45) + Math.floor(this.rams / 3));
    if (want > this.heat) { this.heat = want; this.toast(`🔥 HEAT ${this.heat}`); this.online.heat('up', this.heat); this.fill(); }
    const vmax = VMAX[this.heat];
    const zn = this.zone(me.x, me.z, me.y);
    let nearest = Infinity;
    for (const u of this.units) {
      const d = Math.hypot(u.x - me.x, u.z - me.z);
      nearest = Math.min(nearest, d);
      // far behind or wrong area → reposition out of sight (keeps the chase going on the mountain / expressway)
      const uz = u.mode === 'path' ? (u.path === this.tougePath ? 'touge' : 'ring') : 'city';
      const meZ = zn === 'touge' ? 'touge' : zn === 'ring' ? 'ring' : 'city';
      if ((uz !== meZ && d > 120) || d > 420) { this.spawnNear(u, me, 160); continue; }
      const v = Math.min(vmax, (d > 150 ? vmax * 1.15 : vmax) * (u.stun > 0 ? 0.3 : 1));
      if (u.stun > 0) u.stun -= dt;
      if (d < 45 || zn === 'open' || u.mode === 'direct') this.direct(u, me, dt, v, d);
      else if (u.mode === 'path') this.pathChase(u, me, dt, v);
      else {
        if (u.mode !== 'grid') { u.node = [nearestIdx(u.x), nearestIdx(u.z)]; u.to = u.node; u.mode = 'grid'; }
        if (this.gridMove(u, dt, v)) {
          // next intersection: the neighbour that gets closest to where you are heading
          const [i, j] = u.node, px = me.x + me.vx * 1.2, pz = me.z + me.vz * 1.2;
          const nb = [];
          if (i > 0) nb.push([i - 1, j]); if (i < L.N) nb.push([i + 1, j]); if (j > 0) nb.push([i, j - 1]); if (j < L.N) nb.push([i, j + 1]);
          nb.sort((a, b) => Math.hypot(L.c[a[0]] - px, L.c[a[1]] - pz) - Math.hypot(L.c[b[0]] - px, L.c[b[1]] - pz));
          u.to = nb[0];
        }
      }
      this.place(u);
    }
    // escape / bust meters
    const seen = nearest < 110;
    if (!seen) this.cool = Math.min(1, this.cool + dt / (7 + this.heat * 2.5)); else this.cool = Math.max(0, this.cool - dt * 0.6);
    const boxed = nearest < 8 && me.speed < 2.5;
    this.bust = boxed ? Math.min(1, this.bust + dt / 3) : Math.max(0, this.bust - dt * 0.7);
    if (this.cool >= 1) this.end('escaped');
    else if (this.bust >= 1) this.end('busted');
    this.me = me;
  }
  // straight at you (with the city's walls) — used near you and away from the street grid
  direct(u, me, dt, v, d) {
    u.mode = d < 45 || this.zone(me.x, me.z, me.y) === 'open' ? 'direct' : u.path ? 'path' : 'regrid';
    const lead = Math.min(1.2, d / 30);
    const tx = me.x + me.vx * lead, tz = me.z + me.vz * lead;
    const want = Math.atan2(-(tz - u.z), tx - u.x);
    u.h += Math.atan2(Math.sin(want - u.h), Math.cos(want - u.h)) * Math.min(1, dt * 3.2);
    const sp = d < 12 ? Math.min(v, me.speed + 4) : v;
    u.x += Math.cos(u.h) * sp * dt; u.z -= Math.sin(u.h) * sp * dt;
    const res = this.city.colliders.resolve(u.x, u.z, 1.0, u.y);
    if (res.hit) { u.x += res.dx; u.z += res.dz; }
    u.y = this.city.surfaces.heightAt(u.x, u.z, u.y);
  }
  // along the mountain road / expressway towards your spot on it
  pathChase(u, me, dt, v) {
    const P = u.path, n = P.length;
    const ti = this.pathIdx(P, me.x, me.z);
    let diff = ti - u.pi; if (diff > n / 2) diff -= n; if (diff < -n / 2) diff += n;
    const step = P === this.tougePath ? 2 : 4;
    u.pi = (u.pi + Math.sign(diff) * Math.min(Math.abs(diff), (v * dt) / step) + n) % n;
    const i = Math.floor(u.pi), p = P[i], q = P[(i + Math.sign(diff || 1) + n) % n];
    u.x = p.x; u.y = p.y; u.z = p.z;
    u.h = Math.atan2(-(q.z - p.z), q.x - p.x);
  }
  async end(how) {
    if (this.state !== 'pursuit') return;
    this.state = 'ending';
    const r = await this.online.heat(how, this.heat);
    if (how === 'escaped') this.hooks.notify(`✅ หนีตำรวจสำเร็จ! ค่าหัว +฿${(r?.amount || 0).toLocaleString()}`, 'gold', r?.amount);
    else { this.hooks.notify(`🚔 โดนจับ! ค่าปรับ ฿${(r?.amount || 0).toLocaleString()}`, 'invite', -(r?.amount || 0)); this.hooks.impound(); }
    this.clear();
  }
  // e.g. hiding in a garage: only if no unit is close
  tryHide() {
    if (this.state !== 'pursuit') return true;
    const me = this.me; if (!me) return false;
    const near = Math.min(...this.units.map((u) => Math.hypot(u.x - me.x, u.z - me.z)));
    if (near < 45) return false;
    this.end('escaped');
    return true;
  }
  // a race takes over (no bounty, no fine)
  cancel() { if (this.state === 'pursuit') { this.online.heat('cancel', this.heat); this.clear(); } }
  clear() {
    for (const u of this.units) this.group.remove(u.mesh);
    this.units = []; this.state = 'idle'; this.heat = 0; this.cool = 0; this.bust = 0;
    this.hud.hidden = true;
  }
  // player bumps into a unit (same format as Traffic.collide); ramming a patrol starts a pursuit
  collide(px, pz, r, py) {
    let dx = 0, dz = 0, nx = 0, nz = 0, hit = false;
    const spd = this.driver.vel.length();
    for (const u of [...this.units, ...this.patrols]) {
      if (Math.abs(u.y - py) > 2.5) continue;
      const fx = Math.cos(u.h), fz = -Math.sin(u.h);
      for (const k of [-1.4, 0, 1.4]) {
        const cx = u.x + fx * k, cz = u.z + fz * k;
        const vx = px + dx - cx, vz = pz + dz - cz, d = Math.hypot(vx, vz), rr = r + 0.95;
        if (d < rr && d > 1e-4) {
          const pen = rr - d; dx += vx / d * pen; dz += vz / d * pen; nx += vx / d; nz += vz / d; hit = true;
          if (spd > 9 && !(u.stun > 0)) { u.stun = 1.5; if (this.state === 'pursuit') this.rams++; else if (!this.hooks.racing()) this.start(this.patrols.includes(u) ? u : null, 'ชนรถตำรวจ'); }
        }
      }
    }
    const l = Math.hypot(nx, nz) || 1;
    return { dx, dz, nx: nx / l, nz: nz / l, hit };
  }
  dots() { return this.units.concat(this.patrols).map((u) => ({ x: u.x, z: u.z })); }
  // positions for other players (4×/s)
  share(dt) {
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 0.25;
    if (!this.units.length && !this.wasSharing) return;
    this.wasSharing = this.units.length > 0;
    const r = (v) => Math.round(v * 10) / 10;
    this.online.shareCops(this.units.slice(0, 6).map((u) => [r(u.x), r(u.y), r(u.z), r(u.h)]), this.heat);
  }
  onRemote({ id, c }) {
    let r = this.remote.get(id);
    if (!r) this.remote.set(id, (r = { cars: [] }));
    while (r.cars.length > c.length) this.group.remove(r.cars.pop().mesh);
    while (r.cars.length < c.length) { const mesh = policeBody(); this.group.add(mesh); r.cars.push({ mesh, target: new THREE.Vector3(), th: 0 }); }
    c.forEach(([x, y, z, h], k) => { const car = r.cars[k]; if (!car.seen) { car.mesh.position.set(x, y, z); car.seen = true; } car.target.set(x, y, z); car.th = h; });
  }
  onPursuitNote(p) {
    if (p.id === this.online.myId) return;
    if (p.state === 'start') this.hooks.notify(`🚨 <b>${p.name}</b> โดนตำรวจไล่ล่า!`);
    if (p.state === 'escaped') this.hooks.notify(`💨 <b>${p.name}</b> หนีตำรวจได้ (HEAT ${p.heat})`);
    if (p.state === 'busted') this.hooks.notify(`🚔 <b>${p.name}</b> โดนจับแล้ว`);
    if (p.state !== 'start' && p.state !== 'up') { const r = this.remote.get(p.id); if (r) { for (const c of r.cars) this.group.remove(c.mesh); this.remote.delete(p.id); } }
  }
  removePlayer(id) { const r = this.remote.get(id); if (r) { for (const c of r.cars) this.group.remove(c.mesh); this.remote.delete(id); } }

  renderHud() {
    const h = this.hud;
    if (this.state !== 'pursuit') { if (!h.hidden) h.hidden = true; return; }
    h.hidden = false;
    const stars = '★'.repeat(this.heat) + '☆'.repeat(5 - this.heat);
    const key = `${this.heat}|${Math.round(this.cool * 50)}|${Math.round(this.bust * 50)}`;
    if (h.dataset.k === key) return;
    h.dataset.k = key;
    h.innerHTML = `<div class="hh-top"><b>🚨 ตำรวจไล่ล่า</b><span class="stars">${stars}</span><small>${this.units.length} คัน</small></div>
      <div class="hh-bar esc"><i style="width:${Math.round(this.cool * 100)}%"></i><span>${this.cool > 0.02 ? 'กำลังหนี…' : 'สลัดให้หลุด (ห่าง 110 ม.) หรือหลบเข้าอู่'}</span></div>
      ${this.bust > 0.02 ? `<div class="hh-bar bust"><i style="width:${Math.round(this.bust * 100)}%"></i><span>โดนล้อม! ขับหนีด่วน</span></div>` : ''}`;
  }
  siren(dt, me) {
    const units = this.units.length ? this.units : [];
    let near = Infinity;
    for (const u of units) near = Math.min(near, Math.hypot(u.x - me.x, u.z - me.z));
    for (const r of this.remote.values()) for (const c of r.cars) near = Math.min(near, Math.hypot(c.mesh.position.x - me.x, c.mesh.position.z - me.z));
    const vol = near < 200 ? 0.05 * (1 - near / 200) : 0;
    if (!this.audio && vol > 0) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; g.gain.value = 0;
        o.connect(g); g.connect(ctx.destination); o.start();
        this.audio = { ctx, o, g };
      } catch { return; }
    }
    if (!this.audio) return;
    const { ctx, o, g } = this.audio;
    o.frequency.setTargetAtTime(this.hooks.sound() ? 700 + Math.sin(this.t * 4) * 260 : 0, ctx.currentTime, 0.02);
    g.gain.setTargetAtTime(this.hooks.sound() ? vol : 0, ctx.currentTime, 0.1);
  }
}
