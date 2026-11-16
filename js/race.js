// Racing: tracks laid over the city / mountain / expressway, checkpoints, laps, timing,
// AI opponents built from the game's own car models, and online races with friends.
import * as THREE from 'three';
import { LAYOUT } from './city/city.js';
import { BOT_GENS, BOT_PAINTS, loadBotModels, botReady, makeBotBody } from './city/botcars.js';
import { makeVehicle } from './city/vehicles.js';
import { computePerf, PARTS, bestGear, driveAccel, rpmFor, carShowcaseSummary } from './engine.js';
import { GENERATIONS } from './catalog.js';

const BEST_KEY = 'viosGarage.raceBest.v1';
const fmt = (t) => { if (t == null || !isFinite(t)) return '--:--.--'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
export const fmtTime = fmt;

// ------------------------------------------------------------------ track geometry
function samplesFrom(pts, step = 3) {
  // pts: closed polyline [[x,y,z]...] → evenly spaced samples with tangents
  const segs = [], n = pts.length;
  let len = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[2] - a[2]); segs.push({ a, b, l, s0: len }); len += l; }
  const m = Math.round(len / step), out = [];
  let k = 0;
  for (let i = 0; i < m; i++) {
    const s = (i / m) * len;
    while (k < segs.length - 1 && segs[k].s0 + segs[k].l < s) k++;
    const sg = segs[k], t = sg.l ? (s - sg.s0) / sg.l : 0;
    out.push({ x: sg.a[0] + (sg.b[0] - sg.a[0]) * t, y: sg.a[1] + (sg.b[1] - sg.a[1]) * t, z: sg.a[2] + (sg.b[2] - sg.a[2]) * t, s });
  }
  finish(out, len);
  return out;
}
function finish(out, len) {
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const a = out[(i - 1 + n) % n], b = out[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    out[i].tx = dx / l; out[i].tz = dz / l;
  }
  // curvature over ±4 samples
  for (let i = 0; i < n; i++) {
    const a = out[(i - 4 + n) % n], b = out[(i + 4) % n];
    const cross = a.tx * b.tz - a.tz * b.tx, dot = a.tx * b.tx + a.tz * b.tz;
    const dist = ((b.s - a.s + len) % len) || 1;
    out[i].k = Math.abs(Math.atan2(cross, dot)) / dist;
  }
  out.len = len;
  return out;
}
// polyline with rounded corners (radius r), flat at y
function filleted(corners, r, y = 0, arcStep = 3) {
  const out = [], n = corners.length;
  for (let i = 0; i < n; i++) {
    const p = corners[(i - 1 + n) % n], c = corners[i], q = corners[(i + 1) % n];
    const d1 = [c[0] - p[0], c[1] - p[1]], d2 = [q[0] - c[0], q[1] - c[1]];
    const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
    const u1 = [d1[0] / l1, d1[1] / l1], u2 = [d2[0] / l2, d2[1] / l2];
    const a = [c[0] - u1[0] * r, c[1] - u1[1] * r], b = [c[0] + u2[0] * r, c[1] + u2[1] * r];
    const steps = Math.max(2, Math.round((Math.PI / 2 * r) / arcStep));
    for (let k = 0; k <= steps; k++) { // quadratic bezier through the corner ≈ arc
      const t = k / steps, it = 1 - t;
      out.push([it * it * a[0] + 2 * it * t * c[0] + t * t * b[0], y, it * it * a[1] + 2 * it * t * c[1] + t * t * b[1]]);
    }
  }
  return out;
}

export function buildTracks(city, touge) {
  const T = {};
  const c = LAYOUT.c;
  const spLoop = [[c[3], c[3]], [c[6], c[3]], [c[6], c[6]], [c[3], c[6]]];
  T.sprint = { id: 'sprint', name: '⚡ สตรีทสปรินท์ ดินแดง-อโศก', desc: '750 ม. · เซอร์กิตสปรินท์ 4 แยก ดวลเดือดทันใจ', pts: samplesFrom(filleted(spLoop, 14), 3), half: 7.6, laps: 1, cps: 6, startAt: 0.14 };
  if (touge) {
    const p = touge.path.map((q) => ({ ...q }));
    finish(p, touge.path.len);
    T.touge = { id: 'touge', name: '⛰️ เขาใหญ่ Touge', desc: `${(p.len / 1000).toFixed(1)} กม. · โค้งหักศอก ขึ้น-ลงเขาใหญ่`, pts: p, half: 4.3, laps: 1, cps: 10, startAt: 0 };
  }
  const ry = LAYOUT.ring.y;
  T.ring = { id: 'ring', name: '🛣️ ทางด่วนศรีรัช · มอเตอร์เวย์', desc: '2.5 กม. · ทางด่วนยกระดับ ผ่านด่าน Easy Pass / M-Flow', pts: samplesFrom(city.ringPts.map(([x, z]) => [x, ry, z]), 3), half: 6.0, laps: 2, cps: 8, startAt: 0.12 };
  const loop = [[c[0], c[0]], [c[6], c[0]], [c[6], c[3]], [c[9], c[3]], [c[9], c[9]], [c[3], c[9]], [c[3], c[6]], [c[0], c[6]]];
  T.city = { id: 'city', name: '🏙️ ถนนพระราม 9 · อโศก', desc: '2.9 กม. · ใจกลางกรุงเทพฯ ผ่านตึกมหานคร-ใบหยก', pts: samplesFrom(filleted(loop, 16), 3), half: 7.6, laps: 2, cps: 8, startAt: 0.06 };
  for (const t of Object.values(T)) {
    const n = t.pts.length;
    t.start = Math.floor(n * t.startAt) % n;
    // checkpoint sample indices, evenly spaced, the first one is the start/finish line
    t.cpIdx = Array.from({ length: t.cps }, (_, i) => (t.start + Math.floor((i / t.cps) * n)) % n);
    speedProfile(t);
  }
  return T;
}

// AI target speed along the track: corner limit from curvature, then braking zones
function speedProfile(t, mu = 1.05) {
  const P = t.pts, n = P.length;
  const v = P.map((p) => Math.min(80, Math.sqrt((mu * 9.81) / Math.max(p.k, 1e-4))));
  for (let pass = 0; pass < 2; pass++) for (let i = n - 1; i >= 0; i--) {
    const nx = v[(i + 1) % n], ds = ((P[(i + 1) % n].s - P[i].s + P.len) % P.len) || 3;
    v[i] = Math.min(v[i], Math.sqrt(nx * nx + 2 * 7.5 * ds));
  }
  t.vmax = v;
}

// ------------------------------------------------------------------ progress tracking
class Tracker {
  constructor(track) { this.t = track; this.i = track.start; this.lap = 0; this.cp = 1; this.dist = 0; this.wrong = 0; this.off = 0; }
  // locate (x,z) near the last index; returns lateral offset
  locate(x, z, y = null) {
    const P = this.t.pts, n = P.length;
    let best = this.i, bd = Infinity;
    for (let k = -25; k <= 40; k++) {
      const i = (this.i + k + n) % n, p = P[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2 + (y === null ? 0 : ((p.y - y) * 2) ** 2);
      if (d < bd) { bd = d; best = i; }
    }
    if (bd > 60 * 60) { // lost: global search
      for (let i = 0; i < n; i += 2) { const p = P[i], d = (p.x - x) ** 2 + (p.z - z) ** 2 + (y === null ? 0 : ((p.y - y) * 2) ** 2); if (d < bd) { bd = d; best = i; } }
    }
    this.i = best;
    const p = P[best];
    this.lat = -(x - p.x) * p.tz + (z - p.z) * p.tx;
    this.offDist = Math.sqrt(bd);
    return p;
  }
  // distance raced from the start line (laps included); counts laps only through all checkpoints
  update(x, z, y) {
    const t = this.t, P = t.pts, n = P.length;
    this.locate(x, z, y);
    const rel = (this.i - t.start + n) % n;
    const s = (rel / n) * P.len;
    // next checkpoint passed?
    const want = t.cpIdx[this.cp % t.cps];
    const relCp = (want - t.start + n) % n;
    let lapDone = false;
    if (this.cp % t.cps === 0) { // heading for the finish line
      if (rel < n * 0.25 && this.prevRel > n * 0.75) { this.lap++; this.cp = 1; lapDone = true; }
    } else if (rel >= relCp - 2 && rel - relCp < n * 0.25) this.cp++;
    this.prevRel = rel;
    void s;
    return lapDone;
  }
}

// ------------------------------------------------------------------ AI racer
class Bot {
  constructor(track, slot, perf, name, body) {
    this.t = track; this.perf = perf; this.name = name; this.body = body;
    const P = track.pts, n = P.length;
    this.s = ((P[track.start].s + slotS(slot)) % P.len + P.len) % P.len;
    this.l = slotL(slot); this.lTarget = this.l;
    this.v = 0; this.lap = 0; this.started = false; this.finished = null;
    this.skill = 0.9; this.i = track.start; this.lapsDone = 0; this.raced = slotS(slot);
    this.place();
    void n;
  }
  idxAt(s) { const P = this.t.pts; return Math.floor(((s % P.len) + P.len) % P.len / P.len * P.length) % P.length; }
  step(dt, others, player) {
    const t = this.t, P = t.pts;
    if (this.started) {
      // look ahead for the slowest corner within braking distance
      const i = this.idxAt(this.s);
      // the profile already contains braking zones → only a short look-ahead is needed
      const vt0 = Math.min(t.vmax[i], t.vmax[(i + 2) % P.length]);
      let vt = vt0;
      vt *= this.finished === null ? this.skill : 0.55; // cool-down lap after the finish
      const g = bestGear(this.perf, this.v);
      const pf = this.perf;
      const acc = rpmFor(pf, this.v, pf.gears.length - 1) > pf.redline ? -0.5 : driveAccel(pf, Math.max(0.5, this.v), g, 1, 1.05).a;
      if (this.v < vt) this.v += Math.max(0.5, acc) * dt; else this.v = Math.max(vt, this.v - 8.5 * this.perf.brake * dt);
      // traffic avoidance: car ahead in the same line → move over
      const ahead = [...others, ...(player ? [player] : [])].filter((o) => o !== this && o.finished == null);
      let blocked = false;
      for (const o of ahead) {
        const ds = ((o.raced - this.raced) % P.len + P.len) % P.len;
        if (ds > 0 && ds < 14 && Math.abs(o.l - this.l) < 2.3) {
          blocked = true;
          if (Math.abs(this.lTarget - this.l) < 0.3) this.lTarget = o.l > 0 ? Math.max(-t.half + 1.3, o.l - 3) : Math.min(t.half - 1.3, o.l + 3);
          if (ds < 7) this.v = Math.min(this.v, (o.v ?? this.v) * 0.98);
        }
      }
      if (!blocked && Math.random() < dt * 0.15) this.lTarget = (Math.random() - 0.5) * t.half;
      this.l += Math.sign(this.lTarget - this.l) * Math.min(Math.abs(this.lTarget - this.l), dt * 2.2);
      this.l = Math.max(-t.half + 1.1, Math.min(t.half - 1.1, this.l));
      const ds = this.v * dt;
      this.s += ds; this.raced += ds;
      if (this.s >= P.len) { this.s -= P.len; }
    }
    this.place();
  }
  place() {
    const t = this.t, P = t.pts, n = P.length;
    const f = ((this.s % P.len) + P.len) % P.len / P.len * n;
    const i = Math.floor(f) % n, j = (i + 1) % n, u = f - Math.floor(f);
    const a = P[i], b = P[j];
    const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u, y = a.y + (b.y - a.y) * u;
    const tx = a.tx + (b.tx - a.tx) * u, tz = a.tz + (b.tz - a.tz) * u, tl = Math.hypot(tx, tz) || 1;
    const lx = tz / tl, lz = -tx / tl; // left of travel (car space +z right)
    this.x = x + lx * this.l; this.z = z + lz * this.l; this.y = y;
    this.h = Math.atan2(-tz, tx);
    this.slope = Math.atan2(b.y - a.y, 3);
    this.body.position.set(this.x, this.y, this.z);
    this.body.rotation.set(0, this.h, this.slope, 'YXZ');
  }
}
const slotS = (k) => -10 - Math.floor(k / 2) * 8;
const slotL = (k) => (k % 2 ? -2.4 : 2.4);

// opponent setup roughly matched to the player's class
function botPerf(gen, targetPI, rand) {
  const parts = {};
  const upg = ['intake', 'exhaust', 'ecu', 'cam', 'susp', 'brakes', 'turbo', 'intercooler', 'fuel', 'weight', 'lsd'];
  let perf = computePerf({ gen, engine: { parts } });
  for (const k of upg) {
    if (perf.rating.pi >= targetPI) break;
    const opts = PARTS[k].opts;
    parts[k] = opts[Math.min(opts.length - 1, 1 + Math.floor(rand() * (opts.length - 1)))].id;
    if (k === 'turbo') { parts.fuel = 'inj'; parts.intercooler = 'fmic'; }
    perf = computePerf({ gen, engine: { parts } });
  }
  return perf;
}
const BOT_NAMES = ['เอก บางนา', 'บอย พระราม9', 'ต้อม ดินแดง', 'เจมส์ รามอินทรา', 'พีท แจ้งวัฒนะ', 'นัท มอเตอร์เวย์', 'ก้อง คลองเตย', 'อาร์ต ลาดพร้าว', 'ต้น สุขุมวิท', 'แบงค์ สาทร'];

function tag(text, color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 28px Kanit, sans-serif';
  const w = Math.min(248, g.measureText(text).width + 30);
  g.fillStyle = 'rgba(8,10,14,0.72)'; g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 22); g.fill();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33, 232);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true, sizeAttenuation: true }));
  s.scale.set(2.0, 0.5, 1); s.position.y = 1.95; s.renderOrder = 6;
  return s;
}

// ------------------------------------------------------------------ race manager
export class Race {
  constructor({ scene, driver, online, toast, gfx, getBuild, hooks }) {
    Object.assign(this, { scene, driver, online, toast, gfx, getBuild, hooks });
    this.tracks = null; this.state = 'idle'; this.bots = []; this.group = new THREE.Group(); scene.add(this.group);
    this.gates = []; this.audio = null; this.peerProg = new Map();
    this.ui();
    online.on((ev) => { if (ev === 'status' && !online.inRoom && this.active && this.mp) this.abort('การเชื่อมต่อหลุด — ยกเลิกการแข่ง'); });
    online.onRace = (ev, d) => this.onNet(ev, d);
    try { this.best = JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { this.best = {}; }
  }
  get active() { return this.state === 'countdown' || this.state === 'racing' || this.state === 'finished'; }
  setWorld(city, touge) { this.tracks = buildTracks(city, touge); this.city = city; }
  bestOf(id) {
    const srv = this.online.me?.best?.[id], loc = this.best?.[id];
    if (srv == null) return loc ?? null;
    if (loc == null) return srv;
    return Math.min(srv, loc);
  }

  // ---------------- UI
  ui() {
    const $ = (id) => document.getElementById(id);
    this.el = { setup: $('raceSetup'), hud: $('raceHud'), count: $('raceCount'), res: $('raceResult'), msg: $('raceMsg') };
    this.opt = { track: 'touge', laps: 1, bots: 5, diff: 0, traffic: false };
    try { Object.assign(this.opt, JSON.parse(localStorage.getItem('viosGarage.raceOpt.v1') || '{}')); } catch { /* ignore */ }
    this.el.setup.querySelector('.rs-x').onclick = () => { this.el.setup.hidden = true; };
    this.el.msg.onclick = () => { if (this.active) this.respawn(); };
  }
  // opened at a race marker in the world (trackId) or from a challenge (target player)
  openSetup(trackId = null, target = null, party = false) {
    this.partyMode = party;
    const box = this.el.setup.querySelector('.rs-body');
    const o = this.opt, T = this.tracks || {};
    if (trackId) { o.track = trackId; o.laps = Math.min(o.laps, 3); }
    this.target = target;
    const seg = (key, opts) => `<div class="gfx-seg" data-k="${key}">${opts.map(([v, n]) => `<button data-v="${v}" class="${String(o[key]) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const myB = this.getBuild();
    const mySpec = carShowcaseSummary(myB, GENERATIONS.find((x) => x.id === myB.gen));
    const pi = mySpec.perf.rating;
    const best = this.bestOf(o.track);
    const E = this.econ;
    const onlineOk = !!this.online.inRoom;
    const peer = target?.id ? this.online.peers.get(target.id) : null;
    const rivalB = peer?.car?.b || peer?.build || null;
    const rivalSpec = rivalB ? carShowcaseSummary(rivalB, GENERATIONS.find((x) => x.id === rivalB.gen)) : null;

    const duelBox = target ? `
      <div class="rs-duel">
        <span>⚔️ ท้าแข่ง 1v1 กับ <b>${esc(target.name)}</b></span>
        ${peer ? '<button type="button" class="rs-peek" data-peek="1">🔍 ส่องรถคู่แข่ง</button>' : ''}
      </div>
      <div class="rs-vs">
        <div class="rv-col">
          <small>รถของคุณ</small>
          <b>${esc(mySpec.carName)}</b>
          <span>${mySpec.cc.toLocaleString()}cc · ${mySpec.hp} HP · <i style="color:${pi.color}">${pi.cls}${pi.pi}</i></span>
        </div>
        <em>VS</em>
        <div class="rv-col r">
          <small>คู่แข่ง</small>
          <b>${esc(rivalSpec ? rivalSpec.carName : target.name)}</b>
          <span>${rivalSpec ? `${rivalSpec.cc.toLocaleString()}cc · ${rivalSpec.hp} HP · <i style="color:${rivalSpec.color}">${rivalSpec.cls}${rivalSpec.pi}</i>` : 'กำลังโหลดข้อมูลรถ…'}</span>
        </div>
      </div>
      <button type="button" class="rs-preset ${o.track === 'sprint' && o.laps === 1 && o.bots === 0 ? 'on' : ''}">⚡ สูตรดวล 1v1 ทันใจ (Sprint 750 ม. · 1 รอบ · 0 บอท)</button>` : '';

    const btnsHtml = target
      ? `<button class="rs-go on" data-now="0">⚔️ ส่งคำท้าแข่งให้ ${esc(target.name)} (รอตอบรับ 20 วิ)</button>`
      : `<button class="rs-go on" data-now="1">🏁 เริ่มทันที</button>${onlineOk ? '<button class="rs-go" data-now="0">📣 เปิดรับคู่แข่ง 20 วิ</button>' : ''}`;

    box.innerHTML = `
      ${duelBox}${party ? '<div class="rs-duel">🎉 แข่งกับปาร์ตี้ — ทุกคนในเมืองเดียวกันจะถูกพาเข้าเส้นสตาร์ท</div>' : ''}
      ${target ? '' : `<div class="rs-car">รถของคุณ: <b>${esc(mySpec.carName)}</b> <small>(${mySpec.cc.toLocaleString()}cc · ${mySpec.hp} HP)</small> <span class="cls" style="--pc:${pi.color}">${pi.cls} ${pi.pi}</span></div>`}
      <label>สนาม</label>
      <div class="rs-tracks">${['sprint', 'touge', 'city', 'ring'].map((id) => `<button data-track="${id}" class="${o.track === id ? 'on' : ''}"><b>${T[id]?.name || id}</b><small>${T[id]?.desc || ''}</small><i>สถิติคุณ: ${fmt(this.bestOf(id))}</i></button>`).join('')}</div>
      <label>จำนวนรอบ</label>${seg('laps', [[1, '1'], [2, '2'], [3, '3']])}
      <label>บอทร่วมแข่ง</label>${seg('bots', [[0, 'ไม่มี'], [2, '2'], [3, '3'], [5, '5']])}
      <label>ความยากบอท</label>${seg('diff', [[0, 'ง่าย'], [1, 'ปกติ'], [2, 'ยาก'], [3, 'โหด']])}
      <div class="rs-prize">🏆 เงินรางวัลที่ 1: <b>฿${(E ? E.racePrize(o.track, o.laps, 0, 2, o.bots) : 0).toLocaleString()}</b> (แข่งกับคนจริง 2 คน) · กับบอท <b>฿${(E ? E.racePrize(o.track, o.laps, 0, 1, o.bots) : 0).toLocaleString()}</b>${best ? ` · สถิติคุณ ${fmt(best)}` : ''}</div>
      <div class="rr-btns">${btnsHtml}</div>
      <p class="ob-note">${target ? 'คู่แข่งจะได้รับการ์ดคำท้า กดยอมรับแล้วปล่อยตัวพร้อมกันใน 2.5 วินาที' : onlineOk ? 'ผู้เล่นทุกคนในเมืองจะเห็นคำเชิญและกดเข้าร่วมได้ · เงินรางวัลตรวจสอบโดยเซิร์ฟเวอร์' : 'กำลังเล่นแบบออฟไลน์ — แข่งกับบอทและสะสมเงิน/REP ได้ทันที'}</p>`;
    box.querySelector('.rs-peek')?.addEventListener('click', () => {
      if (!peer) return;
      this.el.setup.hidden = true;
      this.hooks.inspectPeer?.(peer);
    });
    box.querySelector('.rs-preset')?.addEventListener('click', () => {
      o.track = 'sprint'; o.laps = 1; o.bots = 0;
      this.saveOpt();
      this.openSetup(null, target, party);
    });
    box.querySelectorAll('.rs-tracks button').forEach((b) => { b.onclick = () => { o.track = b.dataset.track; this.saveOpt(); this.openSetup(null, target, party); }; });
    box.querySelectorAll('.gfx-seg').forEach((sg) => sg.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { const v = b.dataset.v; o[sg.dataset.k] = v === 'true' ? true : v === 'false' ? false : +v; this.saveOpt(); this.openSetup(null, target, party); };
    }));
    box.querySelectorAll('.rs-go').forEach((b) => { b.onclick = () => { this.el.setup.hidden = true; this.requestStart(b.dataset.now === '1'); }; });
    this.el.setup.hidden = false;
  }
  saveOpt() { try { localStorage.setItem('viosGarage.raceOpt.v1', JSON.stringify(this.opt)); } catch { /* ignore */ } }

  // ---------------- start: the server runs the lobby and sends race:start to the racers
  async requestStart(now = false) {
    const o = this.opt;
    if (!this.online.inRoom) {
      if (this.target) { this.toast('ต้องเชื่อมต่อออนไลน์ก่อนเพื่อท้าแข่งผู้เล่นอื่น'); return; }
      const seed = Math.floor(Math.random() * 1e9);
      await this.begin({ track: o.track, laps: o.laps, bots: o.bots, diff: o.diff, traffic: false, seed }, false, null);
      this.toast('🏁 โหมดออฟไลน์ — แข่งกับบอท');
      return;
    }
    const r = await this.online.raceOpen({ track: o.track, laps: o.laps, bots: o.bots, diff: o.diff, now, to: this.target?.id || null, party: !!this.partyMode });
    if (!r?.ok) this.toast(r?.err || 'เปิดแข่งไม่ได้');
    else if (this.target) this.toast(`⚔️ ส่งคำท้าแข่งให้ ${this.target.name} แล้ว — รอตอบรับ 20 วิ`);
    else if (!now) this.toast('📣 เปิดรับคู่แข่งแล้ว — เริ่มใน 20 วินาที');
  }

  async begin(cfg, mp, raceId = null) {
    this.abort();
    this.raceId = raceId;
    await this.hooks.enterCity();
    const track = this.tracks[cfg.track] || this.tracks.touge;
    this.mp = mp; this.cfg = cfg; this.track = track;
    this.racers = cfg.specs || {};
    this.laps = Math.max(1, Math.min(9, cfg.laps | 0));
    const rand = mulberry(cfg.seed >>> 0);
    this.hooks.setTraffic(!!cfg.traffic);
    // grid: online players by server order, then bots
    const me = this.online.myId || 'me';
    const grid = cfg.grid || [me];
    this.rivals = grid.filter((id) => id !== me).map((id) => ({ id, name: this.online.peers.get(id)?.name || 'คู่แข่ง' }));
    const mySlot = Math.max(0, grid.indexOf(me));
    this.tracker = new Tracker(track);
    const P = track.pts, st = P[track.start];
    const slotPos = (k) => {
      const s = (st.s + slotS(k) + P.len) % P.len, f = s / P.len * P.length, p = P[Math.floor(f) % P.length];
      return { x: p.x + p.tz * slotL(k), z: p.z - p.tx * slotL(k), y: p.y, heading: Math.atan2(-p.tz, p.tx) };
    };
    this.hooks.spawn(slotPos(mySlot));
    this.tracker.i = (track.start - Math.round(-slotS(mySlot) / (P.len / P.length)) + P.length) % P.length;
    this.tracker.prevRel = P.length - 1;
    this.tracker.lap = -1; this.tracker.cp = 0; // crossing the start line begins lap 1
    // bots
    const nb = Math.max(0, Math.min(7, cfg.bots | 0));
    if (nb) {
      this.showMsg('กำลังเตรียมคู่แข่ง…');
      const real = this.gfx.get('bots') === 'real';
      if (real) await loadBotModels(BOT_GENS.length, this.getBuild().gen);
      const protos = real ? botReady() : [];
      const myPI = computePerf(this.getBuild()).rating.pi;
      const targetPI = myPI * [0.72, 0.85, 0.98, 1.12][cfg.diff ?? 0];
      for (let k = 0; k < nb; k++) {
        const slot = grid.length + k;
        const proto = protos.length ? protos[Math.floor(rand() * protos.length)] : null;
        const color = BOT_PAINTS[Math.floor(rand() * BOT_PAINTS.length)];
        const body = new THREE.Group();
        const simple = makeVehicle('sedan', rand);
        simple.children[0].material.color.set(color);
        body.add(simple);
        if (proto) { const realB = makeBotBody(proto, color, this.gfx.get('shadows') !== 'off'); body.add(realB); body.userData.real = realB; }
        body.userData.simple = simple;
        const gen = proto ? proto.gen.id : 'gen2';
        const pool = BOT_NAMES.filter((x) => !this.bots.some((bb) => bb.name.startsWith(x)));
        const name = pool[Math.floor(rand() * pool.length)] + ' 🤖';
        const bt = tag(name);
        body.add(bt);
        body.userData.tag = bt;
        this.group.add(body);
        const bot = new Bot(track, slot, botPerf(gen, targetPI, rand), name, body);
        bot.skill = [0.70, 0.82, 0.92, 0.99][cfg.diff ?? 0] * (0.96 + rand() * 0.05);
        this.bots.push(bot);
      }
      this.showMsg('');
    }
    this.buildGates();
    this.peerProg.clear();
    grid.forEach((sid, idx) => {
      if (sid !== me) this.peerProg.set(sid, { id: sid, d: slotS(idx), f: 0, name: this.online.peers.get(sid)?.name });
    });
    this.state = 'countdown';
    this.startAt = performance.now() / 1000 + Math.max(3.2, (cfg.inMs || 0) / 1000);
    this.driver.frozen = true;
    this.el.hud.hidden = false; this.el.res.hidden = true;
    document.body.classList.add('racing');
    this.lapStart = null; this.lapTimes = []; this.finishT = null; this.sendT = 0; this.prize = null;
  }

  abort(msg) {
    if (msg && this.active) this.toast(msg);
    if (this.active && this.finishT == null && this.mp) this.online.raceLeave();
    for (const b of this.bots) { this.group.remove(b.body); b.body.traverse((o) => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }); }
    this.bots = [];
    for (const g of this.gates) this.group.remove(g);
    this.gates = [];
    this.state = 'idle';
    this.driver.frozen = false;
    this.el.hud.hidden = true; this.el.count.hidden = true; this.el.res.hidden = true;
    this.showMsg('');
    document.body.classList.remove('racing');
    if (this.hooks && this.cfg) this.hooks.setTraffic(null);
    this.cfg = null;
  }

  // start/finish gantry + checkpoint arches (only the next one glows + tall beacon)
  buildGates() {
    const t = this.track, P = t.pts;
    const pole = new THREE.CylinderGeometry(0.16, 0.16, 6, 8).translate(0, 3, 0);
    const poleM = new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 0.6, roughness: 0.4 });
    const beamGeo = new THREE.CylinderGeometry(1.4, 2.2, 42, 16, 1, true).translate(0, 21, 0);
    t.cpIdx.forEach((i, k) => {
      const p = P[i], g = new THREE.Group();
      const w = t.half + 1.2;
      for (const s of [1, -1]) { const m = new THREE.Mesh(pole, poleM); m.position.set(0, 0, s * w); g.add(m); }
      const finish = k === 0;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, finish ? 1.2 : 0.6, w * 2 + 0.4),
        finish ? new THREE.MeshStandardMaterial({ map: checkerTex(), emissive: '#ffffff', emissiveIntensity: 0.25, emissiveMap: checkerTex() })
          : new THREE.MeshStandardMaterial({ color: '#36ff8a', emissive: '#22c55e', emissiveIntensity: 0.8 }));
      bar.position.y = finish ? 5.6 : 5.7;
      const beacon = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: finish ? '#ffb02e' : '#36ff8a', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beacon.visible = false;
      g.add(bar, beacon);
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = Math.atan2(-p.tz, p.tx);
      g.userData = { k, bar, beacon };
      this.group.add(g); this.gates.push(g);
    });
  }

  // ---------------- per frame
  update(dt, carPos) {
    if (!this.active) return;
    const now = performance.now() / 1000;
    if (this.state === 'countdown') {
      const left = this.startAt - now;
      this.el.count.hidden = false;
      const n = Math.ceil(left);
      const txt = left > 3 ? 'เตรียมตัว' : n > 0 ? String(n) : 'GO!';
      if (this.el.count.textContent !== txt) { this.el.count.textContent = txt; this.beep(n > 0 && left <= 3 ? 520 : left <= 0 ? 1040 : 0); }
      if (left <= 0) {
        this.state = 'racing'; this.goWall = this.startAt; this.driver.frozen = false;
        for (const b of this.bots) b.started = true;
        setTimeout(() => { if (this.el.count.textContent === 'GO!') this.el.count.hidden = true; }, 900);
      }
    }
    // race clock: wall time since GO — the server checks it against its own clock
    const T = this.state === 'countdown' ? 0 : now - this.goWall;
    // player progress
    if (this.state === 'racing' && this.finishT === null) {
      const tr = this.tracker;
      const lapDone = tr.update(carPos.x, carPos.z, carPos.y);
      if (lapDone) {
        if (tr.lap === 0) { this.lapStart = T; }
        else {
          const lt = T - this.lapStart; this.lapTimes.push(lt); this.lapStart = T;
          if (!(this.best[this.track.id] < lt)) { this.best[this.track.id] = lt; try { localStorage.setItem(BEST_KEY, JSON.stringify(this.best)); } catch { /* ignore */ } this.toast(`⏱ สถิติใหม่! ${fmt(lt)}`); }
          if (tr.lap >= this.laps) this.finish(T);
          else this.toast(`รอบ ${tr.lap + 1}/${this.laps}`);
        }
      }
      // wrong way / far off the track
      const p = this.track.pts[tr.i];
      const fwd = Math.cos(this.driver.heading) * p.tx - Math.sin(this.driver.heading) * p.tz;
      const spd = this.driver.vel.length();
      tr.wrong = fwd < -0.4 && spd > 4 ? tr.wrong + dt : 0;
      this.showMsg(tr.wrong > 1.2 ? '⛔ ผิดทาง! กลับรถ (คลิกเพื่อกลับเข้าสนาม)' : tr.offDist > this.track.half + 18 ? '↩ ออกนอกเส้นทาง — แตะที่นี่หรือกด R เพื่อกลับเข้าสนาม' : '');
    }
    // bots
    const me = { raced: this.myRaced(), l: -(this.tracker.lat ?? 0), v: this.driver.vel.length() };
    for (const b of this.bots) {
      b.step(dt, this.bots, me);
      const u = b.body.userData;
      const d2 = (b.x - carPos.x) ** 2 + (b.z - carPos.z) ** 2;
      if (u.real) { const near = d2 < 75 * 75; u.real.visible = near; u.simple.visible = !near; }
      if (u.tag) u.tag.visible = d2 < 95 * 95;
      const lapLen = this.track.pts.len;
      if (b.finished === null && b.raced >= this.laps * lapLen && b.started) b.finished = T;
    }
    // next checkpoint glow + tall beacon
    const nextK = this.tracker.cp % this.track.cps;
    for (const g of this.gates) {
      const isNext = g.userData.k === nextK;
      g.visible = true;
      if (g.userData.beacon) g.userData.beacon.visible = isNext;
      if (g.userData.k) g.userData.bar.material.emissiveIntensity = isNext ? 1.8 + Math.sin(now * 6) * 0.6 : 0.12;
    }
    // online: send my progress
    if (this.state !== 'countdown') {
      this.sendT -= dt;
      if (this.sendT <= 0) { this.sendT = 0.4; this.online.raceProgress({ d: Math.round(this.myRaced() * 10) / 10, f: this.finishT ?? 0 }); }
    }
    this.renderHud(T, carPos);
    // everyone (incl. bots, online friends) finished or time is up → results
    if (this.state === 'finished' && !this.el.res.dataset.final) {
      const all = this.standings(T);
      const done = all.every((r) => r.fin != null);
      if (done || now - this.finWall > (this.mp ? 45 : 25)) this.results(all, true);
      else if (now - (this.resT || 0) > 1) { this.resT = now; this.results(all, false); }
    }
  }
  myRaced() {
    const tr = this.tracker, P = this.track.pts, n = P.length;
    if (!tr) return 0;
    const rel = (tr.i - this.track.start + n) % n;
    const s = rel / n * P.len;
    if (tr.lap < 0) return s - P.len; // still behind the line
    return tr.lap * P.len + s - (tr.cp === 0 ? 0 : 0);
  }
  standings(T) {
    const lapLen = this.track.pts.len;
    const rows = [{ id: 'me', name: (this.online.name || 'คุณ') + ' (คุณ)', d: this.finishT != null ? this.laps * lapLen + 1e6 - this.finishT : this.myRaced(), fin: this.finishT, me: true }];
    for (const b of this.bots) rows.push({ id: b.name, name: b.name, d: b.finished != null ? this.laps * lapLen + 1e6 - b.finished : b.raced, fin: b.finished });
    for (const [id, pr] of this.peerProg) {
      const peer = this.online.peers.get(id);
      const name = peer?.name || pr.name;
      if (!name || (!peer && !pr.f)) continue;
      rows.push({ id, name, d: pr.f ? this.laps * lapLen + 1e6 - pr.f : pr.d, fin: pr.f || null, spec: pr.spec || null });
    }
    rows.sort((a, b) => b.d - a.d);
    void T;
    return rows;
  }
  renderHud(T, carPos) {
    const rows = this.standings(T);
    const meRow = rows.find((r) => r.me);
    const pos = rows.indexOf(meRow) + 1;
    const myD = this.finishT != null ? this.laps * this.track.pts.len : (meRow?.d ?? this.myRaced());
    const lap = Math.max(1, Math.min(this.laps, (this.tracker.lap ?? 0) + 1));
    const h = this.el.hud;
    if (!h.firstChild) h.innerHTML = '<div class="rh-main"><div class="rh-pos"></div><div class="rh-lap"></div><div class="rh-time"></div></div><div class="rh-next"></div><ol class="rh-list"></ol>';
    h.querySelector('.rh-pos').innerHTML = rows.length > 1 ? `<b>${pos}</b><small>/${rows.length}</small>` : '<b>⏱</b>';
    h.querySelector('.rh-lap').innerHTML = `รอบ <b>${lap}/${this.laps}</b>`;
    h.querySelector('.rh-time').innerHTML = `${fmt(this.finishT ?? T)}<small>${this.lapTimes.length ? 'ดีสุด ' + fmt(Math.min(...this.lapTimes)) : 'สถิติ ' + fmt(this.best[this.track.id])}</small>`;
    const nx = this.nextGate();
    const nxEl = h.querySelector('.rh-next');
    if (nx && carPos && this.finishT == null) {
      const dx = nx.x - carPos.x, dz = nx.z - carPos.z;
      const dist = Math.round(Math.hypot(dx, dz));
      const ang = Math.atan2(-dz, dx) - this.driver.heading;
      const deg = ((ang * 180 / Math.PI) % 360 + 360) % 360;
      const arrows = ['⬆', '↖', '⬅', '↙', '⬇', '↘', '➡', '↗'];
      const arr = arrows[Math.round(deg / 45) % 8];
      nxEl.innerHTML = `<b>${arr}</b> จุดเช็คพอยท์ถัดไป ${dist} ม.`;
      nxEl.hidden = false;
    } else if (nxEl) {
      nxEl.hidden = true;
    }
    const list = h.querySelector('.rh-list');
    const html = rows.slice(0, 8).map((r, i) => {
      let badge = '';
      if (r.fin != null) badge = ' 🏁';
      else if (!r.me && this.finishT == null) {
        const gap = Math.round(r.d - myD);
        if (Math.abs(gap) >= 2 && Math.abs(gap) < 50000) {
          badge = ` <small class="rh-gap ${gap > 0 ? 'ahead' : 'behind'}">${gap > 0 ? '+' : ''}${gap}ม.</small>`;
        }
      }
      return `<li class="${r.me ? 'me' : ''}">${i + 1}. ${esc(r.name)}${badge}</li>`;
    }).join('');
    if (list.innerHTML !== html) list.innerHTML = html;
  }
  finish(T) {
    this.finishT = T; this.state = 'finished'; this.finWall = performance.now() / 1000;
    this.driver.frozen = true;
    setTimeout(() => { if (this.state === 'finished') this.driver.frozen = false; }, 2500);
    const rows = this.standings(T);
    const pos = rows.findIndex((r) => r.me) + 1;
    this.toast(`🏁 เข้าเส้นชัยอันดับ ${pos} · ${fmt(T)}`);
    if (this.mp && this.online.inRoom) {
      this.online.raceProgress({ d: this.laps * this.track.pts.len, f: T }, true);
      this.results(rows, false);
      // reward is decided by the server (validated time + progress); place vs bots is ours
      this.online.raceFinish({ t: T, place: pos }).then((res) => {
        this.prize = res;
        if (res.ok) this.hooks.reward?.(res);
        else this.toast('⚠️ ' + (res.err || 'ส่งผลการแข่งไม่สำเร็จ'));
        if (this.state === 'finished') this.results(this.standings(T), !!this.el.res.dataset.final);
      });
    } else {
      const res = this.hooks.offlineFinish?.({ track: this.track.id, laps: this.laps, bots: this.bots.length, pos: pos - 1, t: T });
      this.prize = res || { ok: true, prize: 0, rep: 0 };
      if (res?.ok) this.hooks.reward?.(res);
      this.results(rows, true);
    }
  }
  _specForRow(x) {
    if (x.me) {
      const b = this.getBuild();
      return carShowcaseSummary(b, GENERATIONS.find((g) => g.id === b.gen));
    }
    if (this.racers?.[x.id]) return this.racers[x.id];
    if (x.spec) return x.spec;
    const p = this.online.peers.get(x.id);
    const b = p?.car?.b || p?.build;
    return b ? carShowcaseSummary(b, GENERATIONS.find((g) => g.id === b.gen)) : null;
  }
  results(rows, final) {
    const r = this.el.res;
    if (final) r.dataset.final = '1'; else delete r.dataset.final;
    const winFin = rows.find((x) => x.fin != null)?.fin ?? null;
    const rival = this.online.inRoom ? (this.rivals || []).find((rv) => this.online.peers.has(rv.id)) : null;
    r.innerHTML = `<div class="rr-card"><h3>🏁 ผลการแข่ง — ${this.track.name}</h3>
      <table>${rows.map((x, i) => {
        const sp = this._specForRow(x);
        const spHtml = sp ? `<small class="rr-spec">${esc(sp.carName)} · ${Number(sp.cc || 1497).toLocaleString()}cc · ${sp.hp}HP · ${esc(sp.cls)}${sp.pi}</small>` : '';
        const gap = i > 0 && x.fin != null && winFin != null ? ` <small>+${(x.fin - winFin).toFixed(2)}s</small>` : '';
        const timeTxt = x.fin != null ? `${fmt(x.fin)}${gap}` : final ? 'ไม่จบ' : 'กำลังวิ่ง…';
        return `<tr class="${x.me ? 'me' : ''}"><td>${i + 1}</td><td><div>${esc(x.name)}</div>${spHtml}</td><td>${timeTxt}</td></tr>`;
      }).join('')}</table>
      ${this.prize?.ok ? `<div class="rr-prize"><b>+฿${this.prize.prize.toLocaleString()}</b><span>+${this.prize.rep} REP</span></div>` : this.prize ? `<p class="bad">${esc(this.prize.err || '')}</p>` : this.finishT != null ? '<p>กำลังตรวจสอบผลกับเซิร์ฟเวอร์…</p>' : ''}
      <p>${this.lapTimes.length ? 'รอบดีสุด ' + fmt(Math.min(...this.lapTimes)) + ' · ' : ''}สถิติสนามนี้ ${fmt(this.best[this.track.id])}</p>
      <div class="rr-btns">
        ${rival ? `<button class="on" data-a="rematch">🔁 ท้าแก้มือ ${esc(rival.name)}</button>` : ''}
        <button class="${rival ? '' : 'on'}" data-a="again">🔁 แข่งอีกครั้ง</button>
        <button data-a="setup">⚙️ เปลี่ยนสนาม</button>
        <button data-a="quit">ขับเล่นต่อ</button>
      </div></div>`;
    r.hidden = false;
    r.querySelector('[data-a=rematch]')?.addEventListener('click', () => {
      this.abort();
      this.target = rival;
      this.partyMode = false;
      this.requestStart(false);
    });
    r.querySelector('[data-a=again]').onclick = () => { this.abort(); this.target = null; this.partyMode = false; this.requestStart(true); };
    r.querySelector('[data-a=setup]').onclick = () => { this.abort(); this.openSetup(); };
    r.querySelector('[data-a=quit]').onclick = () => this.abort();
  }
  showMsg(t) { if (this.el.msg.textContent !== t) { this.el.msg.textContent = t; this.el.msg.hidden = !t; } }
  // back onto the track at the current progress (after a crash / getting lost)
  respawn() {
    if (!this.active || !this.tracker) return false;
    const P = this.track.pts, p = P[this.tracker.i];
    this.hooks.spawn({ x: p.x, y: p.y, z: p.z, heading: Math.atan2(-p.tz, p.tx) }, true);
    return true;
  }
  // bump circles for the player vs bots (same format as Traffic.collide)
  collide(px, pz, r, py) {
    let dx = 0, dz = 0, nx = 0, nz = 0, hit = false;
    for (const b of this.bots) {
      if (Math.abs(b.y - py) > 2.5 || b.finished !== null) continue;
      const fx = Math.cos(b.h), fz = -Math.sin(b.h);
      for (const k of [-1.4, 0, 1.4]) {
        const cx = b.x + fx * k, cz = b.z + fz * k;
        const vx = px + dx - cx, vz = pz + dz - cz, d = Math.hypot(vx, vz), rr = r + 0.9;
        if (d < rr && d > 1e-4) { const pen = rr - d; dx += vx / d * pen; dz += vz / d * pen; nx += vx / d; nz += vz / d; hit = true; b.v *= 0.97; }
      }
    }
    const l = Math.hypot(nx, nz) || 1;
    return { dx, dz, nx: nx / l, nz: nz / l, hit };
  }
  dots() { return this.bots.map((b) => ({ x: b.x, z: b.z })); }
  nextGate() { if (!this.tracker) return null; const p = this.track.pts[this.track.cpIdx[this.tracker.cp % this.track.cps]]; return { x: p.x, z: p.z }; }
  route() { return this.active ? this.track.pts : null; }

  // ---------------- online
  onNet(ev, d) {
    if (ev === 'start') {
      this.el.setup.hidden = true;
      this.begin({ ...d.cfg, grid: d.grid, specs: d.specs, inMs: d.inMs }, true, d.raceId);
      this.toast(d.grid.length > 1 ? `🏁 แข่ง ${d.grid.length} คน — เตรียมตัว!` : '🏁 เตรียมตัว!');
    } else if (ev === 'p') {
      const pr = this.peerProg.get(d.id);
      if (!pr?.f) this.peerProg.set(d.id, { ...pr, ...d, f: 0 });
    } else if (ev === 'result') {
      if (d.id !== this.online.myId) {
        const pr = this.peerProg.get(d.id);
        this.peerProg.set(d.id, { ...pr, id: d.id, d: this.laps * (this.track?.pts.len || 0), f: d.t, name: d.name || pr?.name, spec: d.spec || pr?.spec });
      }
    }
  }

  beep(freq) {
    if (!freq) return;
    try {
      const ctx = this.audio || (this.audio = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = freq; o.type = 'square'; g.gain.value = 0.06;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (freq > 800 ? 0.45 : 0.18));
    } catch { /* no audio */ }
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let checker = null;
function checkerTex() {
  if (checker) return checker;
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; g.fillRect(i * 8, j * 8, 8, 8); }
  checker = new THREE.CanvasTexture(c); checker.colorSpace = THREE.SRGBColorSpace;
  return checker;
}
