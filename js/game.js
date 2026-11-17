// Open-world gameplay layer: cash pickups, garages (incl. hidden ones), race markers, player
// challenges, race invitations, wallet HUD, notifications, world map and player profile.
// Money and ownership are decided by the server (net.js → rooms.js); this file only shows them.
import * as THREE from 'three';
import { GARAGES, GARAGE_RADIUS } from './places.js';
import { fmtTime } from './race.js';
import { carShowcaseSummary } from './engine.js';
import { GENERATIONS } from './catalog.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = (n) => '฿' + Math.round(n || 0).toLocaleString();
export const TRACK_NAMES = {
  sprint: '⚡ สตรีทสปรินท์ ดินแดง-อโศก',
  touge: '⛰️ เขาใหญ่ Touge',
  city: '🏙️ ถนนพระราม 9 · อโศก',
  ring: '🛣️ ทางด่วนศรีรัช · มอเตอร์เวย์',
};

function labelSprite(text, color = '#fff', bg = 'rgba(8,10,14,0.72)') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = '700 42px Kanit, sans-serif';
  const w = Math.min(496, g.measureText(text).width + 48);
  g.fillStyle = bg; g.beginPath(); g.roundRect((512 - w) / 2, 10, w, 76, 20); g.fill();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50, 464);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true, sizeAttenuation: true }));
  s.scale.set(4.6, 0.86, 1); s.renderOrder = 6;
  return s;
}

// shared geometry/materials
const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24).rotateZ(Math.PI / 2);
const beamGeo = new THREE.CylinderGeometry(0.5, 0.9, 1, 16, 1, true).translate(0, 0.5, 0);
const ringGeo = new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2);
function coinTex(big) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, big ? '#ffe9a8' : '#c9ffd8'); gr.addColorStop(1, big ? '#d99a12' : '#1fa35a');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = big ? '#5a3a00' : '#043a1a'; g.font = '900 78px Kanit, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('฿', 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const MAT = {
  coin: new THREE.MeshStandardMaterial({ map: coinTex(false), emissive: '#2bff7a', emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3 }),
  coinBig: new THREE.MeshStandardMaterial({ map: coinTex(true), emissive: '#ffb020', emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.25 }),
  beam: new THREE.MeshBasicMaterial({ color: '#36ff8a', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  beamBig: new THREE.MeshBasicMaterial({ color: '#ffc23a', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  garage: new THREE.MeshBasicMaterial({ color: '#4cc3ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  garageHidden: new THREE.MeshBasicMaterial({ color: '#c56bff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  race: new THREE.MeshBasicMaterial({ color: '#ff4f6d', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
};

export class GameWorld {
  constructor({ scene, driver, online, race, toast, hooks }) {
    Object.assign(this, { scene, driver, online, race, toast, hooks });
    this.group = new THREE.Group(); scene.add(this.group);
    this.cash = new Map(); // id → { c, mesh }
    this.markers = []; // { kind:'garage'|'race', id, x,y,z, mesh, label, r }
    this.pending = new Set();
    this.dismissedLobbies = new Set();
    this.prompt = null; this.lobbyMine = null;
    this._mapPeers = []; this._mapPins = []; this._mapHoverKey = null; this._mapTimer = null; this._mapDefaultInfo = '';
    this.$ = (id) => document.getElementById(id);
    this.ui();
    online.on((ev) => this.onNet(ev));
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'KeyE') this.act();
      if (e.code === 'KeyM') this.toggleMap();
      if (e.code === 'KeyJ') this.joinLatest();
      if (e.code === 'KeyC') this.challenge();
    });
  }

  // ------------------------------------------------ HUD / UI
  ui() {
    const $ = this.$;
    $('promptBtn').onclick = () => this.act();
    $('btnMap').onclick = () => this.toggleMap();
    $('btnProfile').onclick = () => this.openProfile();
    $('worldMap').onclick = (e) => { if (e.target.id === 'worldMap' || e.target.classList.contains('wm-x')) this.toggleMap(false); };
    const cv = $('wmCanvas');
    cv.addEventListener('mousemove', (e) => {
      const hit = this._hitMapTarget(e);
      cv.style.cursor = hit ? 'pointer' : 'default';
      this._showMapHover(hit);
    });
    cv.addEventListener('mouseleave', () => {
      cv.style.cursor = 'default';
      this._showMapHover(null);
    });
    cv.addEventListener('click', (e) => {
      const hit = this._hitMapTarget(e);
      if (!hit) return;
      if (hit.kind === 'peer') {
        this.toggleMap(false);
        this.hooks.inspectPeer?.(hit.p);
      } else if (hit.kind === 'pin') {
        this._warpToMarker(hit.m);
      }
    });
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const hit = this._hitMapTarget(e);
      if (hit?.kind === 'peer') {
        this.toggleMap(false);
        this.hooks.inspectPeer?.(hit.p);
      }
    });
    $('profile').onclick = (e) => { if (e.target.id === 'profile' || e.target.classList.contains('wm-x')) $('profile').hidden = true; };
    this.updateWallet();
  }
  _peerSpecLine(p) {
    const b = p?.car?.b || p?.build;
    if (!b) return '';
    try {
      const g = GENERATIONS.find((x) => x.id === b.gen);
      const sc = carShowcaseSummary(b, g);
      return `${sc.carName} · ${sc.cc.toLocaleString()} cc · ${sc.hp} HP (${sc.cls}${sc.pi})`;
    } catch { return ''; }
  }
  _showMapHover(hit) {
    const infoEl = this.$('wmInfo');
    if (!infoEl) return;
    if (!hit) {
      if (this._mapHoverKey !== null) {
        this._mapHoverKey = null;
        this._hoveredPeerId = null;
        infoEl.innerHTML = this._mapDefaultInfo;
      }
      return;
    }
    if (hit.kind === 'peer') {
      const p = hit.p;
      this._mapHoverKey = 'p:' + p.id;
      this._hoveredPeerId = p.id;
      const crew = p.crew ? `<span class="crew-tag">[${esc(p.crew)}]</span> ` : '';
      const spec = this._peerSpecLine(p);
      infoEl.innerHTML = `🟠 ${crew}<b>${esc(p.name)}</b>${spec ? ` · ${esc(spec)}` : ''} · <i>คลิกซ้าย/ขวา ดูโปรไฟล์รถ &amp; ท้าแข่ง</i>`;
      return;
    }
    this._hoveredPeerId = null;
    this._mapHoverKey = 'm:' + hit.m.id;
    const icon = hit.m.kind === 'race' ? '🏁' : hit.m.hidden ? '🗝️' : '🔧';
    infoEl.innerHTML = `${icon} <b>${esc(hit.m.name)}</b>${hit.m.desc ? ` · ${esc(hit.m.desc)}` : ''} · <i>คลิกเพื่อวาร์ปทันที</i>`;
  }
  _hitMapTarget(e) {
    const cv = this.$('wmCanvas'), r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const cx = (e.clientX - r.left) * (cv.width / r.width), cy = (e.clientY - r.top) * (cv.height / r.height);
    if (this._mapPeers?.length) {
      let bestP = null, bd = 20 * 20;
      for (const item of this._mapPeers) {
        const d = (item.cx - cx) ** 2 + (item.cy - cy) ** 2;
        if (d < bd) { bd = d; bestP = item.p; }
      }
      if (bestP) return { kind: 'peer', p: bestP };
    }
    if (this._mapPins?.length) {
      let bestM = null, bd = 24 * 24;
      for (const pin of this._mapPins) {
        const d = (pin.cx - cx) ** 2 + (pin.cy - cy) ** 2;
        if (d < bd) { bd = d; bestM = pin.m; }
      }
      if (bestM) return { kind: 'pin', m: bestM };
    }
    return null;
  }
  _warpToMarker(m) {
    if (this.race.active) { this.toast('ออกจากการแข่งก่อนวาร์ป'); return; }
    this.toggleMap(false);
    this.hooks.warpMarker?.(m);
  }
  updateWallet(delta = 0) {
    const m = this.online.me;
    const w = this.$('wallet');
    w.hidden = false;
    const money = m ? m.money : (this.hooks.localMoney?.() ?? 999999999);
    const rep = m ? m.rep : (this.hooks.localRep?.() ?? 0);
    w.querySelector('.money').textContent = baht(money);
    w.querySelector('.rep').textContent = `${rep.toLocaleString()} REP`;
    if (delta) { w.classList.remove('gain'); void w.offsetWidth; w.classList.add('gain'); }
    this.$('onlineCount').textContent = `${this.online.peers.size + 1}`;
  }
  feed(html, cls = '') {
    const f = this.$('feed');
    const el = document.createElement('div');
    el.className = 'fd ' + cls; el.innerHTML = html;
    f.prepend(el);
    while (f.children.length > 3) f.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3400);
  }
  popGain(text, big) {
    const el = document.createElement('div');
    el.className = 'gainpop' + (big ? ' big' : ''); el.textContent = text;
    document.body.append(el);
    setTimeout(() => el.remove(), 1400);
  }
  sound(kind) {
    try {
      const ctx = this.ac || (this.ac = new (window.AudioContext || window.webkitAudioContext)());
      const notes = kind === 'big' ? [880, 1108, 1318, 1760] : kind === 'cash' ? [1318, 1760] : kind === 'buy' ? [660, 880] : [520];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        const t = ctx.currentTime + i * 0.07;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.3);
      });
    } catch { /* no audio */ }
  }

  // ------------------------------------------------ network events
  onNet(ev) {
    if (!ev || typeof ev !== 'object') { if (ev === 'peers' || ev === 'me' || ev === 'status') this.updateWallet(); return; }
    const snap = ev.hello || ev.world;
    if (snap) {
      for (const id of [...this.cash.keys()]) this.removeCash(id);
      for (const c of snap.cash) this.addCash(c);
      this.refreshGarageMarkers();
      this.updateWallet();
      this.renderLobbies();
    }
    if (ev.note) this.feed(esc(ev.note));
    if (ev.cashAdd) this.addCash(ev.cashAdd);
    if (ev.cashDel) {
      this.removeCash(ev.cashDel.id);
      if (ev.cashDel.by !== this.online.myId && ev.cashDel.big) this.feed(`💰 <b>${esc(ev.cashDel.name)}</b> เจอเงินซ่อน ${baht(ev.cashDel.v)}`);
    }
    if (ev.lobbies) this.renderLobbies();
    if (ev.invite) {
      const d = ev.invite;
      this.lastInvite = d.id;
      const sp = d.hostSpec ? ` <small>(${esc(d.hostSpec.carName)} · ${d.hostSpec.cc.toLocaleString()}cc · ${d.hostSpec.hp}HP)</small>` : '';
      if (d.to === this.online.myId) this.feed(`⚔️ <b>${esc(d.host)}</b> ท้าดวลคุณ!${sp} ${TRACK_NAMES[d.track] || d.track} — กด <kbd>J</kbd> รับคำท้า`, 'invite duel');
      else if (d.edit) this.feed(`🔄 <b>${esc(d.host)}</b> ปรับห้องแข่งเป็น${sp} ${TRACK_NAMES[d.track] || d.track} · ${d.laps} รอบ`);
      else this.feed(`🏁 <b>${esc(d.host)}</b> เปิดแข่ง${sp} ${TRACK_NAMES[d.track] || d.track} — กด <kbd>J</kbd> เข้าร่วม`, 'invite');
      this.sound('ping');
    }
    if (ev.raceAccepted) {
      const d = ev.raceAccepted;
      this.feed(`⚔️ <b>${esc(d.by)}</b> รับคำท้าดวลแล้ว! ออกตัวใน ${Math.max(1, Math.round((d.inMs || 2500) / 1000))} วิ`, 'gold');
      this.sound('big');
    }
    if (ev.raceDeclined) {
      const d = ev.raceDeclined;
      this.toast(`❌ ${d.by} ปฏิเสธคำท้าแข่ง`);
      this.feed(`❌ <b>${esc(d.by)}</b> ปฏิเสธคำท้าแข่ง ${TRACK_NAMES[d.track] || d.track}`);
    }
  }

  // ------------------------------------------------ cash
  addCash(c) {
    if (this.cash.has(c.id)) return;
    const g = new THREE.Group();
    const coin = new THREE.Mesh(coinGeo, c.big ? MAT.coinBig : MAT.coin);
    coin.position.y = 1.3; if (c.big) coin.scale.setScalar(1.6);
    const beam = new THREE.Mesh(beamGeo, c.big ? MAT.beamBig : MAT.beam);
    beam.scale.set(c.big ? 1.4 : 1, c.big ? 10 : 14, c.big ? 1.4 : 1);
    g.add(coin, beam);
    g.position.set(c.x, c.y, c.z);
    g.userData.coin = coin;
    this.group.add(g);
    this.cash.set(c.id, { c, mesh: g });
  }
  removeCash(id) {
    const e = this.cash.get(id);
    if (!e) return;
    this.group.remove(e.mesh);
    this.cash.delete(id);
  }

  // ------------------------------------------------ markers (garages, race starts)
  buildMarkers(tracks, touge) {
    for (const m of this.markers) this.group.remove(m.mesh);
    this.markers = [];
    for (const g of GARAGES) {
      let { x, y, z } = g;
      if (g.onTouge && touge) { const nb = touge.nearest(x, z, 80); if (nb) { const p = touge.path[nb.i]; x = p.x; y = p.y; z = p.z; } }
      this.addMarker({ kind: 'garage', id: g.id, name: g.name, desc: g.desc, hidden: g.hidden, x, y, z, r: GARAGE_RADIUS });
    }
    for (const t of Object.values(tracks || {})) {
      const p = t.pts[t.start];
      this.addMarker({ kind: 'race', id: t.id, name: t.name, desc: t.desc, x: p.x, y: p.y, z: p.z, r: 8 });
    }
    this.refreshGarageMarkers();
  }
  addMarker(m) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, m.kind === 'race' ? MAT.race : m.hidden ? MAT.garageHidden : MAT.garage);
    ring.scale.setScalar(m.r); ring.position.y = 0.06;
    const ring2 = ring.clone(); ring2.scale.setScalar(m.r * 0.7);
    const beam = new THREE.Mesh(beamGeo, m.kind === 'race' ? MAT.race : m.hidden ? MAT.garageHidden : MAT.garage);
    beam.material = beam.material.clone(); beam.material.opacity = 0.12; beam.scale.set(m.r * 0.9, 6, m.r * 0.9);
    const label = labelSprite(m.kind === 'race' ? `🏁 ${m.name}` : `🔧 ${m.name}`, m.kind === 'race' ? '#ffd0d8' : m.hidden ? '#ecd2ff' : '#d6f1ff');
    label.position.y = 3.6;
    g.add(ring, ring2, beam, label);
    g.position.set(m.x, m.y, m.z);
    m.mesh = g; m.ring2 = ring2; m.label = label;
    this.group.add(g);
    this.markers.push(m);
  }
  refreshGarageMarkers() {
    const disc = new Set(this.online.me?.discovered || []);
    for (const m of this.markers) if (m.kind === 'garage') m.found = !m.hidden || disc.has(m.id);
  }
  // minimap/world map icons
  icons(pos = this.driver.pos) {
    const out = [];
    for (const m of this.markers) if (m.kind === 'race' || m.found) out.push({ x: m.x, z: m.z, kind: m.kind, hidden: m.hidden });
    // hidden stashes only show up on the radar when you are close
    for (const { c } of this.cash.values()) if (!c.big || Math.hypot(c.x - pos.x, c.z - pos.z) < 140) out.push({ x: c.x, z: c.z, kind: c.big ? 'big' : 'cash' });
    return out;
  }

  // ------------------------------------------------ per frame
  update(dt, pos, speed, mode) {
    const t = performance.now() / 1000;
    this.group.visible = mode === 'city';
    if (mode !== 'city') { this.setPrompt(null); return; }
    // spin & bob coins, pick up the ones we drive through
    for (const [id, { c, mesh }] of this.cash) {
      const dx = c.x - pos.x, dz = c.z - pos.z, dy = c.y - pos.y;
      const d2 = dx * dx + dz * dz;
      mesh.visible = d2 < (c.big ? 160 * 160 : 700 * 700);
      if (!mesh.visible) continue;
      mesh.userData.coin.rotation.y = t * 3 + c.x;
      mesh.userData.coin.position.y = 1.3 + Math.sin(t * 2 + c.z) * 0.15;
      if (d2 < 3.6 * 3.6 && Math.abs(dy) < 3 && !this.pending.has(id)) this.collect(id, c);
    }
    // markers: pulse, show hidden garages only when close, cull labels beyond 95m
    let near = null;
    for (const m of this.markers) {
      const d = Math.hypot(m.x - pos.x, m.z - pos.z);
      m.mesh.visible = m.kind === 'race' ? !this.race.active : (m.found || d < 70);
      if (m.label) m.label.visible = m.mesh.visible && d < 95;
      m.ring2.scale.setScalar(m.r * (0.55 + ((t * 0.6) % 1) * 0.45));
      if (m.mesh.visible && d < m.r && Math.abs(m.y - pos.y) < 4 && !near) near = m;
    }
    // nearby player to challenge
    let rival = null;
    if (!this.race.active && !near) for (const p of this.online.peers.values()) {
      if (!p.pose) continue;
      if (Math.hypot(p.pose.x - pos.x, p.pose.z - pos.z) < 22 && Math.abs(p.pose.y - pos.y) < 4) { rival = p; break; }
    }
    if (this.race.active || this.busy) this.setPrompt(null);
    else if (near && speed > 22 / 3.6) this.setPrompt({ text: near.kind === 'race' ? `ชะลอเพื่อเปิดแข่ง ${near.name}` : `ชะลอเพื่อเข้า ${near.name}`, key: '', m: near, dim: true });
    else if (near) this.setPrompt({ text: near.kind === 'race' ? `เปิดแข่ง ${near.name}` : `เข้าอู่ · ${near.name}`, key: 'E', m: near });
    else if (rival) this.setPrompt({ text: `ท้าแข่ง ${rival.name}`, key: 'C', rival });
    else this.setPrompt(null);
    this.renderLobbyTimer();
  }
  setPrompt(p) {
    const el = this.$('prompt');
    const key = p ? p.text + p.key : '';
    this.prompt = p;
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    el.hidden = !p;
    if (p) { el.classList.toggle('dim', !!p.dim); el.querySelector('.pt').textContent = p.text; el.querySelector('kbd').textContent = p.key || '…'; }
  }
  async act() {
    // re-check against where the car is now (the prompt may be a frame old)
    const pos = { x: this.driver.pos.x, y: this.driver.y || 0, z: this.driver.pos.z };
    this.update(0, pos, this.driver.vel.length(), 'city');
    const p = this.prompt;
    if (!p || p.dim) return;
    if (p.rival) return this.challenge();
    const m = p.m;
    if (m.kind === 'race') {
      if (this.hooks.chased?.()) { this.toast('🚨 หนีตำรวจให้หลุดก่อนถึงจะเปิดแข่งได้'); return; }
      this.race.openSetup(m.id); return;
    }
    // hiding from the police in a garage works only when no unit is right behind you
    if (this.hooks.hide && !this.hooks.hide()) { this.toast('🚨 ตำรวจตามติดเกินไป — สลัดให้ห่างก่อนค่อยหลบเข้าอู่'); return; }
    this.busy = true;
    const r = await this.online.garage(m.id);
    this.busy = false;
    if (!r.ok) { this.toast(r.err || 'เข้าอู่ไม่ได้'); return; }
    if (r.bonus) { this.feed(`🗝️ ค้นพบอู่ลับ <b>${esc(m.name)}</b> +${baht(r.bonus)}`, 'gold'); this.popGain('+' + baht(r.bonus), true); this.sound('big'); this.refreshGarageMarkers(); }
    this.updateWallet(r.bonus);
    this.hooks.enterGarage(m);
  }
  challenge() {
    if (this.hooks.chased?.()) { this.toast('🚨 หนีตำรวจให้หลุดก่อน'); return; }
    const p = this.prompt;
    if (!p?.rival) return;
    this.race.openSetup(null, { id: p.rival.id, name: p.rival.name });
  }
  async collect(id, c) {
    this.pending.add(id);
    let r = await this.online.pick(id);
    // the server may not have our newest position yet (poses are sent 10×/s) → retry briefly
    for (let k = 0; k < 3 && !r.ok && r.err === 'far' && this.cash.has(id); k++) { await new Promise((ok) => setTimeout(ok, 250)); r = await this.online.pick(id); }
    this.pending.delete(id);
    if (!r.ok) return;
    this.removeCash(id);
    this.popGain('+' + baht(r.v), c.big);
    this.sound(c.big ? 'big' : 'cash');
    if (c.big) this.feed(`💰 เจอเงินซ่อน <b>${baht(r.v)}</b>!`, 'gold');
    this.updateWallet(r.v);
  }

  // ------------------------------------------------ race lobbies / invitations
  renderLobbies() {
    const box = this.$('lobbies');
    const list = this.online.lobbies || [];
    const myId = this.online.myId;
    for (const id of [...this.dismissedLobbies]) if (!list.some((l) => l.id === id)) this.dismissedLobbies.delete(id);
    this.lobbyMine = list.find((l) => l.ids.includes(myId)) || null;
    this.lobbyT0 = performance.now();
    const visible = list.filter((l) => l.ids.includes(myId) || !this.dismissedLobbies.has(l.id));
    box.innerHTML = visible.map((l) => {
      const mine = l.ids.includes(myId);
      const isDuel = l.toId === myId && !mine;
      const spec = l.hostSpec ? `${esc(l.hostSpec.carName)} · ${l.hostSpec.cc.toLocaleString()}cc · ${l.hostSpec.hp}HP (${esc(l.hostSpec.cls)}${l.hostSpec.pi})` : '';
      const waitRival = mine && l.hostId === myId && l.toName && l.members.length < 2 ? ` · รอ ${esc(l.toName)} ตอบรับ` : '';
      const SHORT = { sprint: '⚡ สปรินท์', touge: '⛰️ เขา', city: '🏙️ ซิตี้', ring: '🛣️ วงแหวน' };
      const editChips = mine && l.hostId === myId && !l.toName
        ? `<div class="lb-edit">${Object.keys(SHORT).map((t) => `<button data-t="${t}" class="${l.track === t ? 'on' : ''}">${SHORT[t]}</button>`).join('')}</div>`
        : '';
      const memberNames = l.members.length ? `<small class="lb-members">👥 ${l.members.map(esc).join(' · ')}${l.bots ? ` +🤖${l.bots}` : ''}</small>` : '';
      const btns = mine
        ? `<div class="lb-btns">${l.hostId === myId ? '<button data-a="go" class="on">เริ่มเลย</button>' : ''}<button data-a="leave">ออก</button></div>`
        : isDuel
          ? `<div class="lb-btns"><button data-a="join" class="on">⚔️ รับคำท้า (J)</button><button data-a="decline">✖ ปฏิเสธ</button></div>`
          : `<div class="lb-btns"><button data-a="join" class="on">เข้าร่วม (J)</button></div>`;
      return `<div class="lb ${mine ? 'mine' : ''} ${isDuel ? 'duel' : ''}" data-id="${l.id}">
        <b>${isDuel ? '⚔️ คำท้า 1v1: ' : ''}${TRACK_NAMES[l.track] || l.track}</b>
        ${mine ? '' : '<button type="button" class="lb-x" data-a="dismiss" aria-label="ซ่อน">✕</button>'}
        ${spec ? `<small class="lb-spec">${spec}</small>` : ''}
        <small>${esc(l.host)} · ${l.laps} รอบ · ${l.members.length} คน · <span class="lt" data-ms="${l.startsIn}">${Math.ceil(l.startsIn / 1000)}</span> วิ${waitRival}</small>
        ${memberNames}${editChips}
        ${btns}
      </div>`;
    }).join('');
    box.querySelectorAll('.lb button').forEach((b) => {
      const id = b.closest('.lb').dataset.id;
      b.onclick = async () => {
        if (b.dataset.t) { await this.online.raceEdit({ track: b.dataset.t }); return; }
        if (b.dataset.a === 'dismiss') { this.dismissedLobbies.add(id); this.renderLobbies(); return; }
        if (b.dataset.a === 'join') { const r = await this.online.raceJoin(id); if (!r.ok) this.toast(r.err); else this.toast('เข้าร่วมแล้ว — รอเริ่มแข่ง'); }
        if (b.dataset.a === 'decline') { await this.online.raceDecline(id); this.dismissedLobbies.add(id); this.renderLobbies(); this.toast('ปฏิเสธคำท้าแล้ว'); }
        if (b.dataset.a === 'leave') this.online.raceLeave();
        if (b.dataset.a === 'go') this.online.raceGo();
      };
    });
  }
  renderLobbyTimer() {
    const el = this.$('lobbies');
    if (!el.children.length) return;
    const dt = performance.now() - this.lobbyT0;
    el.querySelectorAll('.lt').forEach((s) => { s.textContent = Math.max(0, Math.ceil((+s.dataset.ms - dt) / 1000)); });
  }
  async joinLatest() {
    if (this.hooks.chased?.()) { this.toast('🚨 หนีตำรวจให้หลุดก่อน'); return; }
    const lobbies = this.online.lobbies || [];
    const myId = this.online.myId;
    const duel = lobbies.find((x) => x.toId === myId && !x.ids.includes(myId));
    const inv = this.lastInvite && lobbies.find((x) => x.id === this.lastInvite && !x.ids.includes(myId));
    const l = duel || inv || lobbies.find((x) => !x.ids.includes(myId));
    if (!l) return;
    const r = await this.online.raceJoin(l.id);
    this.toast(r.ok ? 'เข้าร่วมแล้ว — รอเริ่มแข่ง' : r.err);
  }

  // ------------------------------------------------ world map & profile
  toggleMap(v) {
    const el = this.$('worldMap');
    const show = v ?? el.hidden;
    el.hidden = !show;
    clearInterval(this._mapTimer);
    this._mapTimer = null;
    if (show) {
      this._mapHoverKey = null;
      this._hoveredPeerId = null;
      this.drawMap();
      this._mapTimer = setInterval(() => {
        if (!el.hidden) this.drawMap();
        else { clearInterval(this._mapTimer); this._mapTimer = null; }
      }, 250);
    }
  }
  drawMap() {
    const mm = this.hooks.minimap();
    const cv = this.$('wmCanvas');
    if (!mm) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    // world area of interest: x -1550..620, z -700..700
    const x0 = -1550, x1 = 620, z0 = -700, z1 = 700;
    const k = Math.min(W / (x1 - x0), H / (z1 - z0));
    const ox = (W - (x1 - x0) * k) / 2, oz = (H - (z1 - z0) * k) / 2;
    const P = (x, z) => [ox + (x - x0) * k, oz + (z - z0) * k];
    g.fillStyle = '#0b0f14'; g.fillRect(0, 0, W, H);
    // the minimap base covers ±1650 m
    const B = mm.base, s = B.width / 3300;
    g.drawImage(B, (x0 + 1650) * s, (z0 + 1650) * s, (x1 - x0) * s, (z1 - z0) * s, ox, oz, (x1 - x0) * k, (z1 - z0) * k);
    this._mapPins = [];
    for (const m of this.markers) {
      if (m.kind !== 'race' && !m.found) continue;
      const [x, y] = P(m.x, m.z);
      this._mapPins.push({ cx: x, cy: y, m });
      g.fillStyle = m.kind === 'race' ? '#ff4f6d' : m.hidden ? '#c56bff' : '#4cc3ff';
      g.strokeStyle = '#fff'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = '700 14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(m.kind === 'race' ? '🏁' : '🔧', x, y + 1);
      g.font = '700 13px Kanit, sans-serif';
      g.fillStyle = 'rgba(8,10,14,0.8)';
      const lbl = m.name.replace(/\s*\(.*?\)/g, '');
      const tw = g.measureText(lbl).width + 10;
      g.fillRect(x - tw / 2, y + 17, tw, 18);
      g.fillStyle = '#fff';
      g.fillText(lbl, x, y + 26);
    }
    this._mapPeers = [];
    for (const p of this.online.peers.values()) {
      if (!p.pose) continue;
      const [x, y] = P(p.pose.x, p.pose.z);
      this._mapPeers.push({ cx: x, cy: y, p });
      const hovered = this._hoveredPeerId === p.id;
      g.save();
      g.fillStyle = p.inRace ? '#ff4f6d' : '#ffb02e';
      g.strokeStyle = hovered ? '#4cc3ff' : '#ffffff';
      g.lineWidth = hovered ? 4 : 2.5;
      g.beginPath(); g.arc(x, y, hovered ? 12 : 10, 0, Math.PI * 2); g.fill(); g.stroke();
      const tagTxt = p.crew ? `[${p.crew}] ${p.name}` : p.name;
      g.font = '700 13px Kanit, sans-serif';
      const b = p.car?.b || p.build;
      let subTxt = '';
      if (b) {
        try {
          const gg = GENERATIONS.find((xx) => xx.id === b.gen);
          const sc = carShowcaseSummary(b, gg);
          subTxt = `${sc.cc.toLocaleString()}cc · ${sc.hp}HP`;
        } catch {}
      }
      const tw = Math.max(g.measureText(tagTxt).width, subTxt ? g.measureText(subTxt).width * 0.85 : 0) + 14;
      const bh = subTxt ? 34 : 20;
      g.fillStyle = 'rgba(8,10,16,0.86)';
      g.beginPath(); g.roundRect(x - tw / 2, y - bh - 12, tw, bh, 6); g.fill();
      g.strokeStyle = hovered ? '#4cc3ff' : 'rgba(255,176,46,0.55)';
      g.lineWidth = 1.2; g.stroke();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(tagTxt, x, y - bh - 2);
      if (subTxt) {
        g.font = '600 11px Kanit, sans-serif';
        g.fillStyle = '#fbbf24';
        g.fillText(subTxt, x, y - bh + 13);
      }
      g.restore();
    }
    const me = this.driver.pos;
    const [mx, my] = P(me.x, me.z);
    g.save(); g.translate(mx, my); g.rotate(-this.driver.heading + Math.PI / 2);
    g.fillStyle = '#4cc3ff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -13); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.fill(); g.stroke();
    g.restore();
    const qb = this.$('wmQuick');
    if (qb) {
      const mList = this.markers.filter((m) => m.kind === 'race' || m.found);
      const pList = [...this.online.peers.values()].filter((p) => !!p.build || !!p.car?.b);
      const qKey = mList.map((m) => m.id).join(',') + '|' + pList.map((p) => `${p.id}:${p.inRace ? 1 : 0}:${p.inGarage ? 1 : 0}:${p.crew || ''}:${p.build?.gen || ''}:${p.build?.engine?.swap || ''}:${p.build?.engine?.parts?.turbo || ''}`).join(',');
      if (qb.dataset.k !== qKey) {
        qb.dataset.k = qKey;
        qb.innerHTML = '';
        for (const m of mList) {
          const btn = document.createElement('button');
          btn.className = m.kind === 'race' ? 'r' : 'g';
          btn.textContent = (m.kind === 'race' ? '🏁 ' : '🔧 ') + m.name.replace(/\s*\(.*?\)/g, '');
          btn.onclick = () => this._warpToMarker(m);
          qb.append(btn);
        }
        for (const p of pList) {
          const btn = document.createElement('button');
          btn.className = 'p';
          const sp = this._peerSpecLine(p);
          btn.textContent = `🚗 ${p.crew ? `[${p.crew}] ` : ''}${p.name}` + (sp ? ` (${sp.split(' · ').slice(-2).join(' · ')})` : '');
          btn.title = 'ดูโปรไฟล์รถ & สเปคเครื่อง';
          btn.onclick = () => { this.toggleMap(false); this.hooks.inspectPeer?.(p); };
          qb.append(btn);
        }
      }
    }
    const found = this.markers.filter((m) => m.kind === 'garage' && m.hidden && m.found).length, hid = this.markers.filter((m) => m.kind === 'garage' && m.hidden).length;
    this._mapDefaultInfo = `คลิกไอคอนบนแผนที่เพื่อวาร์ปทันที · คลิกซ้าย/ขวาที่จุดผู้เล่น 🟠 เพื่อดูสเปครถ &amp; ท้าแข่ง · 🟣 อู่ลับ ${found}/${hid}`;
    if (!this._mapHoverKey) this.$('wmInfo').innerHTML = this._mapDefaultInfo;
  }
  async openProfile() {
    const el = this.$('profile');
    const local = this.hooks.localProfile?.() || {};
    const m = this.online.me || {
      name: this.online.name || 'นักซิ่ง',
      username: null,
      crew: null,
      likes: 0,
      discovered: [],
      bounty: 0,
      escapes: 0,
      busted: 0,
      ...local,
      money: local.money ?? (this.hooks.localMoney?.() ?? 999999999),
    };
    const isOffline = !this.online.me;
    el.hidden = false;
    const body = el.querySelector('.pf-body');
    const rate = m.races ? Math.round((m.wins / m.races) * 100) : 0;
    const cars = (m.owned || []).filter((k) => k.startsWith('car:')).length + 1;
    const crewTag = m.crew ? `<span class="crew-tag">[${esc(m.crew)}]</span> ` : '';
    const bestOf = (id) => m.best?.[id] ?? this.race?.bestOf(id) ?? null;
    const d100 = m.best?.drag100 ?? local.best?.drag100;
    const d402 = m.best?.drag402 ?? local.best?.drag402;
    body.innerHTML = `<div class="pf-head"><div class="pf-av">${esc((m.name || '?').slice(0, 1))}</div><div><b>${crewTag}${esc(m.name)}</b><small>${m.username ? '@' + esc(m.username) : isOffline ? 'โหมดออฟไลน์' : 'ผู้เล่นออนไลน์'} · ${(m.rep || 0).toLocaleString()} REP · ${cars} คัน</small></div><div class="pf-money">${baht(m.money)}</div></div>
      <div class="pf-stats">
        <div><b>${m.races || 0}</b><small>แข่ง</small></div>
        <div><b>${m.wins || 0} (${rate}%)</b><small>ชนะ</small></div>
        <div><b>${(m.stuntBest || 0).toLocaleString()}</b><small>สตั๊นท์ดีสุด</small></div>
        <div><b>${(m.stuntTotal || 0).toLocaleString()}</b><small>สตั๊นท์รวม</small></div>
        <div><b>👍 ${m.likes || 0}</b><small>ถูกใจรถ</small></div>
        <div><b>${(m.discovered || []).length}</b><small>อู่ลับที่เจอ</small></div>
        <div><b>${baht(m.bounty || 0)}</b><small>ค่าหัวสะสม</small></div>
        <div><b>${(m.rep || 0).toLocaleString()}</b><small>คะแนน REP</small></div>
      </div>
      <h4>⏱️ สถิติเวลา &amp; เทสสนาม</h4>
      <div class="pf-best">
        ${Object.entries(TRACK_NAMES).map(([id, n]) => `<div>${n}<b>${fmtTime(bestOf(id))}</b></div>`).join('')}
        <div>⚡ 0–100 กม./ชม.<b>${d100 != null ? Number(d100).toFixed(2) + 's' : '--'}</b></div>
        <div>🏁 ควอเตอร์ไมล์ 402 ม.<b>${d402 != null ? Number(d402).toFixed(2) + 's' : '--'}</b></div>
      </div>
      <h4>🏅 กระดานอันดับโลก</h4>
      <div class="seg small pf-tabs">
        <button data-lbt="rep" class="on">🏆 REP</button>
        <button data-lbt="stunt">🔥 สตั๊นท์</button>
        <button data-lbt="likes">👑 Car Meet</button>
        <button data-lbt="wanted">🚨 Wanted</button>
      </div>
      <ol class="pf-lb"><li>${isOffline ? 'เชื่อมต่อออนไลน์เพื่อดูอันดับโลก (สถิติออฟไลน์ของคุณถูกบันทึกไว้แล้ว)' : 'กำลังโหลด…'}</li></ol>`;
    let activeTab = 'rep';
    let lbData = null;
    const isMeRow = (r) => r.name === m.name && (!r.username || !m.username || r.username === m.username);
    const renderTab = (tab) => {
      activeTab = tab;
      body.querySelectorAll('.pf-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.lbt === tab));
      const ol = body.querySelector('.pf-lb');
      if (!ol) return;
      if (isOffline) {
        ol.innerHTML = '<li>🌐 ออฟไลน์อยู่ — กดปุ่มผู้เล่นมุมบนเพื่อเชื่อมต่อออนไลน์และดูอันดับผู้เล่นทั้งหมด</li>';
        return;
      }
      if (!lbData) return;
      const rows = lbData[tab] || [];
      const rowName = (r) => `${r.crew ? `<span class="crew-tag">[${esc(r.crew)}]</span> ` : ''}${esc(r.name)}`;
      if (tab === 'rep') {
        ol.innerHTML = rows.map((r, i) => `<li class="${isMeRow(r) ? 'me' : ''}"><span>${i + 1}. ${rowName(r)}</span><b>${(r.rep || 0).toLocaleString()} REP</b><small>${r.wins}/${r.races} ชนะ · สตั๊นท์ดีสุด ${(r.stuntBest || 0).toLocaleString()}</small></li>`).join('') || '<li>ยังไม่มีข้อมูล — ไปแข่งหรือทำสตั๊นท์เลย!</li>';
      } else if (tab === 'stunt') {
        ol.innerHTML = rows.map((r, i) => `<li class="${isMeRow(r) ? 'me' : ''}"><span>${i + 1}. ${rowName(r)}</span><b>${(r.stuntBest || 0).toLocaleString()} PTS</b><small>สะสม ${(r.stuntTotal || 0).toLocaleString()} PTS · ${(r.rep || 0).toLocaleString()} REP</small></li>`).join('') || '<li>ยังไม่มีสถิติสตั๊นท์ — ดริฟต์หรือเหยียบ 155+ กม./ชม. ในเมือง!</li>';
      } else if (tab === 'likes') {
        ol.innerHTML = rows.map((r, i) => `<li class="${isMeRow(r) ? 'me' : ''}"><span>${i + 1}. ${rowName(r)}</span><b>👍 ${r.likes || 0}</b><small>${(r.rep || 0).toLocaleString()} REP</small></li>`).join('') || '<li>ยังไม่มีคะแนนโหวต Car Meet — แต่งรถให้เท่แล้วให้เพื่อนกด 👍</li>';
      } else {
        ol.innerHTML = rows.map((r, i) => `<li class="${isMeRow(r) ? 'me' : ''}"><span>${i + 1}. ${rowName(r)}</span><b>${baht(r.bounty)}</b><small>หนีได้ ${r.escapes} · โดนจับ ${r.busted}</small></li>`).join('') || '<li>ยังไม่มีใครถูกตั้งค่าหัว</li>';
      }
    };
    body.querySelectorAll('.pf-tabs button').forEach((b) => { b.onclick = () => renderTab(b.dataset.lbt); });
    if (!isOffline) {
      lbData = await this.online.leader() || {};
      if (!el.hidden) renderTab(activeTab);
    }
  }
}
