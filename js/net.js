// Online play: join a friend's room by code and drive together in the city.
// Each client simulates its own car and sends its pose ~15×/s; other players' cars are
// rebuilt from their build (paint, wheels, kit…) and smoothly interpolated ~120 ms behind.
import * as THREE from 'three';
import { Car } from './car.js';
import { GENERATIONS } from './catalog.js';
import { loadTemplate } from './glbcar.js';
import { mergeBuild } from './ui.js';

const SEND_HZ = 15;
const DELAY = 0.12; // s of interpolation buffer
const NAME_KEY = 'viosGarage.name.v1';
const TOKEN_KEY = 'viosGarage.token.v1';

let ioLib = null;
async function getIO() {
  if (!ioLib) ioLib = (await import('../vendor/socket.io/socket.io.esm.min.js')).io;
  return ioLib;
}

function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 72;
  const g = c.getContext('2d');
  g.font = '600 32px Kanit, sans-serif';
  const w = Math.min(368, g.measureText(text).width + 40);
  g.fillStyle = 'rgba(8,10,14,0.68)';
  g.beginPath(); g.roundRect((384 - w) / 2, 10, w, 52, 26); g.fill();
  g.strokeStyle = 'rgba(76,195,255,0.45)';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 192, 37, 340);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true, sizeAttenuation: true }));
  s.scale.set(2.2, 0.41, 1); s.position.y = 1.98; s.renderOrder = 6;
  return s;
}

const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class Online {
  constructor({ scene, driver, getBuild, toast }) {
    this.scene = scene; this.driver = driver; this.getBuild = getBuild; this.toast = toast;
    this.sock = null; this.code = null; this.myId = null;
    this.peers = new Map(); // id -> { name, build, car, tag, snaps:[{t,s}], gen }
    this.sendT = 0; this.listeners = new Set();
    this._lastEmitAt = 0; this._lastMode = 'garage'; this._kaTimer = null;
    this.name = (() => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } })();
  }

  get inRoom() { return !!this.code; }
  on(fn) { this.listeners.add(fn); }
  emitChange(ev) { for (const fn of this.listeners) fn(ev); }

  setName(n) {
    this.name = String(n || '').trim().slice(0, 16);
    try { localStorage.setItem(NAME_KEY, this.name); } catch { /* ignore */ }
  }

  _emitState(inCity, reliable = false) {
    if (!this.code || !this.sock?.connected) return;
    this._lastEmitAt = performance.now();
    const d = this.driver, f = Math.cos(d.heading), z = -Math.sin(d.heading);
    const vf = d.vel.x * f + d.vel.z * z;
    const r = (x) => Math.round(x * 1000) / 1000;
    const payload = [r(d.pos.x), r(d.y || 0), r(d.pos.z), r(d.heading), r(d.slope || 0), r(d.steer), r(vf), r(d.roll), r(d.pitch), inCity ? 1 : 0];
    if (reliable) this.sock.emit('st', payload);
    else this.sock.volatile.emit('st', payload);
  }

  async connect() {
    if (this.sock) return this.sock;
    const io = await getIO();
    // polling first, upgrade to WebSocket when the host allows it (Plesk's proxy may not)
    const sock = this.sock = io({ path: '/mp', reconnectionDelayMax: 4000 });
    if (!this._kaTimer) {
      this._kaTimer = setInterval(() => {
        if (this.code && this.sock?.connected && performance.now() - this._lastEmitAt >= 2000) {
          this._emitState(this._lastMode === 'city', true);
        }
      }, 2000);
    }
    sock.on('peer+', (p) => { this.addPeer(p); this.notify(`🟢 ${p.name} เข้ามาในเมือง`); this.emitChange('peers'); });
    sock.on('peer-', ({ id }) => { const p = this.peers.get(id); if (p) this.notify(`⚪ ${p.name} ออกไปแล้ว`); this.removePeer(id); this.emitChange('peers'); });
    sock.on('st', ({ id, s }) => {
      const p = this.peers.get(id); if (!p) return;
      const wasGarage = p.inGarage;
      p.inGarage = s[9] !== 1;
      p.snaps.push({ t: performance.now() / 1000, s });
      if (p.snaps.length > 30) p.snaps.splice(0, p.snaps.length - 30);
      if (wasGarage !== p.inGarage) this.emitChange('peers');
    });
    sock.on('build', ({ id, build }) => { const p = this.peers.get(id); if (p) { p.build = build; this.buildPeerCar(p); } });
    sock.on('crew', ({ id, crew }) => {
      const p = this.peers.get(id);
      if (p) {
        p.crew = crew || null;
        const lbl = p.crew ? `[${p.crew}] ${p.name}` : p.name;
        const nt = nameTag(lbl);
        if (p.car) { p.car.root.remove(p.tag); p.car.root.add(nt); }
        p.tag.material.map.dispose(); p.tag.material.dispose();
        p.tag = nt;
        this.emitChange('peers');
      }
    });
    sock.on('car:act', (d) => {
      const p = this.peers.get(d?.id);
      if (p?.car && d.kind === 'flash') p.car.flashLights();
      this.emitChange({ carAct: d });
    });
    sock.on('chat', (m) => this.emitChange({ chat: m }));
    sock.on('race:start', (d) => this.onRace?.('start', d));
    sock.on('race:p', (d) => this.onRace?.('p', d));
    sock.on('race:result', (d) => this.onRace?.('result', d));
    sock.on('race:lobbies', (l) => { this.lobbies = l; this.emitChange({ lobbies: l }); });
    sock.on('race:invite', (d) => this.emitChange({ invite: d }));
    sock.on('cash+', (c) => this.emitChange({ cashAdd: c }));
    sock.on('cops', (d) => this.emitChange({ cops: d }));
    // moved to another world (warp to a friend / joined a party)
    sock.on('world', (d) => {
      this.clearPeers();
      this.code = d.world; this.lobbies = d.lobbies;
      for (const pl of d.players) this.addPeer(pl);
      this.emitChange({ world: d }); this.emitChange('status'); this.emitChange('peers');
    });
    sock.on('kicked', (d) => { this.wanted = false; this.code = null; sock.io.opts.reconnection = false; sock.disconnect(); this.emitChange({ kicked: d }); });
    for (const ev of ['friend:req', 'friend:ok', 'friend:online', 'party', 'party:invite', 'party:chat', 'pm', 'liked', 'race:party']) sock.on(ev, (d) => this.emitChange({ social: ev, d }));
    sock.on('pursuit', (d) => this.emitChange({ pursuit: d }));
    sock.on('cash-', (c) => this.emitChange({ cashDel: c }));
    sock.on('disconnect', () => { if (this.code) { this.notify('การเชื่อมต่อหลุด กำลังต่อใหม่…'); this.code = null; this.emitChange('status'); } });
    // (re)join the shared world after a dropped connection
    sock.on('connect', () => { if (this.wanted && !this.code) this.hello(); });
    return sock;
  }

  waitConnected(ms = 25000) {
    const s = this.sock;
    if (s.connected) return Promise.resolve(true);
    return new Promise((res) => {
      const t = setTimeout(() => { s.off('connect', ok); res(false); }, ms);
      const ok = () => { clearTimeout(t); res(true); };
      s.once('connect', ok);
    });
  }

  async call(ev, data) {
    // world events need a finished hello; after a dropped poll, wait for the rejoin instead of
    // emitting into a socket the server has not attached a player to yet
    if (this.wanted && ev !== 'hello' && ev !== 'account:login' && !this.code) {
      if (!(await this.waitConnected())) return { ok: false, err: 'การเชื่อมต่อหลุด ลองใหม่อีกครั้ง' };
      const h = await (this.helloBusy || this.hello());
      if (!h?.ok && !this.code) return h || { ok: false };
    }
    return new Promise((res) => {
      const t = setTimeout(() => res({ ok: false, err: 'เซิร์ฟเวอร์ไม่ตอบ ลองใหม่อีกครั้ง' }), 15000);
      this.sock.emit(ev, data, (r) => { clearTimeout(t); res(r || { ok: false }); });
    });
  }

  // Enter the shared online world (the server picks the world). The device token identifies the
  // player's saved profile (money, cars, parts) on the server.
  async start() {
    this.wanted = true;
    await this.connect();
    if (!(await this.waitConnected())) return { ok: false, err: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (เช็กอินเทอร์เน็ต)' };
    return this.hello();
  }
  async hello() {
    if (this.helloBusy) return this.helloBusy;
    this.helloBusy = (async () => {
      let token = null;
      try { token = localStorage.getItem(TOKEN_KEY); } catch { /* ignore */ }
      const r = await this.call('hello', { token, name: this.name || '', build: this.getBuild(), claim: token ? null : this.claim?.() });
      this.helloBusy = null;
      if (!r.ok) return r;
      try { localStorage.setItem(TOKEN_KEY, r.token); } catch { /* ignore */ }
      this.clearPeers();
      this.code = r.world; this.myId = r.id; this.me = r.me; if (!this.name) this.setName(r.me.name); this.online = r.online; this.lobbies = r.lobbies;
      for (const p of r.players) this.addPeer(p);
      this._emitState(this._lastMode === 'city', true);
      this.emitChange({ hello: r });
      this.emitChange('status');
      return r;
    })();
    return this.helloBusy;
  }
  setMe(me) { if (me) { this.me = me; this.emitChange('me'); } }
  owns(key) { return !!this.me?.owned.includes(key); }
  async pick(id) { const d = this.driver; const r = await this.call('pick', { id, at: { x: d.pos.x, y: d.y || 0, z: d.pos.z } }); if (r.ok && this.me) { this.me.money = r.money; this.emitChange('me'); } return r; }
  async garage(id) { const r = await this.call('garage', { id }); if (r.me) this.setMe(r.me); return r; }
  async maxMoney() {
    const r = await this.call('garage:maxmoney', {});
    if (r.me) this.setMe(r.me);
    else if (r.ok && this.me) { this.me.money = r.money; this.emitChange('me'); }
    return r;
  }
  async buy(key) {
    const r = await this.call('buy', { key, rid: Math.random().toString(36).slice(2) + Date.now() });
    if (r.ok && this.me) { this.me.money = r.money; this.me.owned = r.owned; this.emitChange('me'); }
    return r;
  }
  async bankStunt(pts, kind = '') {
    if (!this.code) return { ok: false };
    const r = await this.call('stunt:bank', { pts, kind });
    if (r.me) this.setMe(r.me);
    return r;
  }
  async saveDrag(t100, t402) {
    if (!this.code) return { ok: false };
    const r = await this.call('drag:best', { t100, t402 });
    if (r.me) this.setMe(r.me);
    return r;
  }
  raceOpen(cfg) { return this.call('race:open', cfg); }
  raceJoin(id) { return this.call('race:join', { id }); }
  raceLeave() { this.sock?.emit('race:leave'); }
  raceGo() { this.sock?.emit('race:go'); }
  async raceFinish(d) { const r = await this.call('race:fin', d); if (r.me) this.setMe(r.me); return r; }
  leader() { return this.call('leader', {}); }
  // ---- accounts & friends
  async login(username, password) {
    await this.connect();
    if (!(await this.waitConnected())) return { ok: false, err: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' };
    const r = await this.call('account:login', { username, password });
    if (r.ok) try { localStorage.setItem(TOKEN_KEY, r.token); } catch { /* ignore */ }
    return r;
  }
  logout() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } }
  async register(username, password) { const r = await this.call('account:register', { username, password }); if (r.me) this.setMe(r.me); return r; }
  friends() { return this.call('friend:list', {}); }
  async addFriend(username) { const r = await this.call('friend:add', { username }); if (r.me) this.setMe(r.me); return r; }
  async answerFriend(username, yes = true) { const r = await this.call('friend:accept', { username, no: !yes }); if (r.me) this.setMe(r.me); return r; }
  async removeFriend(username) { const r = await this.call('friend:remove', { username }); if (r.me) this.setMe(r.me); return r; }
  warp(username) { return this.call('warp', { username }); }
  warpPeer(id) { return this.call('warp:peer', { id }); }
  pm(username, text) { this.sock?.emit('pm', { username, text }); }
  partyInvite(username) { return this.call('party:invite', { username }); }
  partyJoin(id) { return this.call('party:join', { id }); }
  partyLeave() { this.sock?.emit('party:leave'); }
  partyChat(text) { this.sock?.emit('party:chat', text); }
  like(id) { return this.call('like', { id }); }
  async heat(state, heat) { if (!this.code) return null; const r = await this.call('heat', { state, heat }); if (r?.me) this.setMe(r.me); return r; }
  shareCops(c, heat) { if (this.code && this.sock?.connected) this.sock.volatile.emit('cops', { c, heat }); }
  notify(t) { this.emitChange({ note: t }); }
  leave() {
    if (!this.code) return;
    this.sock?.emit('leave');
    this.code = null; this.myId = null;
    this.clearPeers();
    this.emitChange('status');
  }
  // progress 2.5×/s may be dropped under load (volatile); the final one must arrive → reliable
  raceProgress(p, reliable = false) { if (this.code && this.sock?.connected) (reliable ? this.sock : this.sock.volatile).emit('race:p', p); }
  chat(text) { if (this.code && text.trim()) this.sock.emit('chat', text.trim().slice(0, 120)); }

  async setCrew(tag) { const r = await this.call('crew:set', { tag }); if (r.me) this.setMe(r.me); return r; }
  carAct(kind) { if (this.code && this.sock?.connected) this.sock.emit('car:act', { kind }); }

  sendBuild() {
    if (!this.code) return;
    clearTimeout(this._bt);
    this._bt = setTimeout(() => this.sock.emit('build', this.getBuild()), 400);
  }

  addPeer(p) {
    if (this.peers.has(p.id)) this.removePeer(p.id);
    const lbl = p.crew ? `[${p.crew}] ${p.name}` : p.name;
    const snaps = (Array.isArray(p.s) && p.s.length === 10)
      ? [{ t: performance.now() / 1000, s: p.s }]
      : [];
    const peer = { id: p.id, name: p.name, crew: p.crew || null, username: p.username || null, likes: p.likes || 0, rep: p.rep || 0, stuntBest: p.stuntBest || 0, inGarage: !!p.inGarage || (Array.isArray(p.s) && p.s[9] === 0), build: p.build, car: null, tag: nameTag(lbl), snaps, lastSpin: 0 };
    this.peers.set(p.id, peer);
    this.buildPeerCar(peer);
  }

  async buildPeerCar(peer) {
    // never trust a remote build: fill missing fields, fall back to a valid generation
    let build;
    try { build = mergeBuild(peer.build); } catch { build = mergeBuild({}); }
    const gen = GENERATIONS.find((g) => g.id === build.gen);
    if (gen?.glb) await loadTemplate(gen.glb, gen.glbConfig || {}).catch(() => {});
    if (!this.peers.has(peer.id)) return; // left while loading
    if (!peer.car) {
      peer.car = new Car();
      // other players' headlight spotlights would multiply lighting cost for every material → off
      for (const b of peer.car.beams) peer.car.root.remove(b, b.target);
      peer.car.root.add(peer.tag);
      peer.car.root.visible = false;
      this.scene.add(peer.car.root);
    }
    try { peer.car.setBuild(build); } catch (e) { console.warn('peer car build failed', e); }
  }

  removePeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    if (p.car) this.scene.remove(p.car.root);
    p.tag.material.map.dispose(); p.tag.material.dispose();
    this.peers.delete(id);
  }
  clearPeers() { for (const id of [...this.peers.keys()]) this.removePeer(id); }

  // called every frame from the main loop
  update(dt, mode, night) {
    this._lastMode = mode;
    if (!this.code) return;
    const inCity = mode === 'city';
    this.sendT += dt;
    const polling = this.sock?.io?.engine?.transport?.name === 'polling';
    if (this.sendT >= 1 / (polling ? 10 : SEND_HZ) && this.sock?.connected) {
      this.sendT = 0;
      this._emitState(inCity, false);
    }
    const wall = performance.now() / 1000;
    const now = wall - (polling ? 0.22 : DELAY);
    const myPos = this.driver.pos;
    for (const p of this.peers.values()) {
      const car = p.car;
      if (!car) continue;
      const sn = p.snaps;
      const last = sn[sn.length - 1];
      const visible = inCity && last && last.s[9] === 1 && wall - last.t < 30;
      car.root.visible = !!visible;
      p.pose = null;
      if (!visible) continue;
      let a = sn[0], b = last, t = 1;
      for (let i = sn.length - 1; i > 0; i--) {
        if (sn[i - 1].t <= now) { a = sn[i - 1]; b = sn[i]; t = THREE.MathUtils.clamp((now - a.t) / Math.max(1e-3, b.t - a.t), 0, 1); break; }
      }
      const A = a.s, B = b.s;
      const L = (k) => A[k] + (B[k] - A[k]) * t;
      let x = L(0), y = L(1), z = L(2), h = lerpAngle(A[3], B[3], t);
      // past the newest packet: extrapolate briefly along the heading
      if (now > b.t) { const ex = Math.min(0.25, now - b.t); x += Math.cos(B[3]) * B[6] * ex; z -= Math.sin(B[3]) * B[6] * ex; }
      car.root.position.set(x, y, z);
      car.root.rotation.order = 'YXZ';
      car.root.rotation.set(0, h, L(4));
      const R = car.tire?.outerR || 0.3;
      car._heave = 0;
      car.animate(L(5), (L(6) * dt) / R, L(7), L(8));
      car.setAutoLights(night > 0.55);
      const decel = b.t > a.t && Math.abs(A[6]) > 1.2 && Math.abs(B[6]) < Math.abs(A[6]) - 0.15;
      car.setDriveLights(decel);
      // distance-culled non-obstructive nameTag
      const dist = Math.hypot(x - myPos.x, z - myPos.z);
      const showTag = dist < 95 && this.inspectingId !== p.id;
      p.tag.visible = showTag;
      if (showTag) {
        const sc = THREE.MathUtils.clamp(1.65 + dist * 0.032, 1.75, 3.2);
        p.tag.scale.set(sc, sc * (72 / 384), 1);
        p.tag.material.opacity = dist < 65 ? 0.94 : Math.max(0.05, 1 - (dist - 65) / 30);
      }
      p.pose = { x, y, z, h };
    }
  }

  // push the local player's circle out of other players' cars (same format as Traffic.collide)
  collide(px, pz, r, py) {
    let dx = 0, dz = 0, nx = 0, nz = 0, hit = false;
    for (const p of this.peers.values()) {
      const q = p.pose;
      if (!q || Math.abs(q.y - py) > 2.5) continue;
      const fx = Math.cos(q.h), fz = -Math.sin(q.h);
      for (const k of [-1.4, 0, 1.4]) {
        const cx = q.x + fx * k, cz = q.z + fz * k;
        const vx = px + dx - cx, vz = pz + dz - cz, d = Math.hypot(vx, vz), rr = r + 0.9;
        if (d < rr && d > 1e-4) { const pen = rr - d; dx += vx / d * pen; dz += vz / d * pen; nx += vx / d; nz += vz / d; hit = true; }
      }
    }
    const l = Math.hypot(nx, nz) || 1;
    return { dx, dz, nx: nx / l, nz: nz / l, hit };
  }

  dots() { const out = []; for (const p of this.peers.values()) if (p.pose) out.push({ x: p.pose.x, z: p.pose.z }); return out; }
  roster() { return [...this.peers.values()].map((p) => ({ id: p.id, name: p.name })); }
}
