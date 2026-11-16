// Online world server: everyone who opens the game is placed automatically into a shared world
// (no room codes). The server is authoritative for money, ownership, cash pickups, hidden-garage
// discovery and race rewards; it relays car poses and keeps the last pose of every player to
// validate pickups / garage visits. Profiles persist in store/ (see store.js).
const { Server } = require('socket.io');
const { Store } = require('./store');
const SPOTS = require('./world-spots.json');

const WORLD_CAP = 64;
const MAX_BUILD_BYTES = 8 * 1024;
const STATE_LEN = 10;
const ACTIVE_CASH = 30, ACTIVE_BIG = 3;
const LOBBY_MS = 20000, COUNTDOWN_MS = 4500;

const log = (...a) => console.log(new Date().toISOString(), '[world]', ...a);
const eco = import('./public/js/economy.js');
const plc = import('./public/js/places.js');

function cleanName(n) {
  const s = String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return s || 'นักซิ่ง';
}
function cleanBuild(b) {
  if (!b || typeof b !== 'object') return null;
  try { const j = JSON.stringify(b); return j.length <= MAX_BUILD_BYTES ? JSON.parse(j) : null; } catch { return null; }
}
function cleanState(s) {
  if (!Array.isArray(s) || s.length !== STATE_LEN) return null;
  for (const v of s) if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e5) return null;
  return s;
}
const rint = (a, b) => Math.round(a + Math.random() * (b - a));
const d3 = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 1.5, a.z - b.z);

function attachRooms(httpServer) {
  const io = new Server(httpServer, { path: '/mp', serveClient: false, maxHttpBufferSize: 32 * 1024, pingInterval: 10000, pingTimeout: 8000 });
  const store = new Store();
  const worlds = new Map();
  const presence = new Map(); // profile key → player session (one session per profile)
  const parties = new Map();  // party id → { id, leader: key, members: Set(key) }
  let worldSeq = 0, idSeq = 0;
  const sendTo = (key, ev, data) => { const q = presence.get(key); if (q) io.to(q.id).emit(ev, data); };
  const uname = (key) => store.byKey(key)?.username || null;
  function partyInfo(pt) {
    return { id: pt.id, leader: uname(pt.leader), members: [...pt.members].map((k) => { const q = presence.get(k), pr = store.byKey(k); return { username: pr?.username, name: pr?.name, online: !!q, world: q?.w?.id || null }; }) };
  }
  const pushParty = (pt) => { const info = partyInfo(pt); for (const k of pt.members) sendTo(k, 'party', info); };
  function leaveParty(key) {
    for (const pt of parties.values()) if (pt.members.has(key)) {
      pt.members.delete(key);
      sendTo(key, 'party', null);
      if (pt.members.size <= 1) { for (const k of pt.members) sendTo(k, 'party', null); parties.delete(pt.id); }
      else { if (pt.leader === key) pt.leader = [...pt.members][0]; pushParty(pt); }
    }
  }
  const partyOf = (key) => [...parties.values()].find((pt) => pt.members.has(key)) || null;
  const nid = (p) => p + (++idSeq).toString(36);

  // ---------------- worlds
  function newWorld() {
    const w = { id: 'W' + (++worldSeq), players: new Map(), cash: new Map(), lobbies: new Map(), races: new Map() };
    worlds.set(w.id, w);
    for (let i = 0; i < ACTIVE_CASH; i++) spawnCash(w, false);
    for (let i = 0; i < ACTIVE_BIG; i++) spawnCash(w, true);
    log('world open', w.id);
    return w;
  }
  // fill worlds densely so players meet each other; open a new one only when all are full
  function pickWorld() {
    let best = null;
    for (const w of worlds.values()) if (w.players.size < WORLD_CAP && (!best || w.players.size > best.players.size)) best = w;
    return best || newWorld();
  }
  function spawnCash(w, big) {
    const list = big ? SPOTS.big : SPOTS.normal;
    const taken = new Set([...w.cash.values()].map((c) => c.spot + (c.big ? 'b' : '')));
    for (let tries = 0; tries < 20; tries++) {
      const i = Math.floor(Math.random() * list.length);
      if (taken.has(i + (big ? 'b' : ''))) continue;
      const [x, y, z] = list[i];
      const c = { id: nid('c'), x, y, z, spot: i, big, v: big ? rint(4000, 7000) : rint(3, 9) * 100 };
      w.cash.set(c.id, c);
      return c;
    }
    return null;
  }
  const pubPlayer = (p) => ({ id: p.id, name: p.name, crew: p.prof.crew || null, username: p.prof.username || null, build: p.build, rep: p.prof.rep, likes: p.prof.likes || 0, stuntBest: p.prof.stuntBest || 0, inGarage: !!p.garage, s: p.lastS || null });
  const lobbyList = (w) => [...w.lobbies.values()].map((l) => ({ id: l.id, track: l.track, laps: l.laps, host: l.hostName, hostId: l.host, ids: [...l.members], members: [...l.members].map((sid) => w.players.get(sid)?.name).filter(Boolean), startsIn: Math.max(0, l.t - Date.now()) }));
  const me = (p) => ({ username: p.prof.username || null, crew: p.prof.crew || null, likes: p.prof.likes || 0, friends: (p.prof.friends || []).map(uname).filter(Boolean), requests: (p.prof.freq || []).map(uname).filter(Boolean), money: p.prof.money, rep: p.prof.rep, owned: p.prof.owned, discovered: p.prof.discovered, races: p.prof.races, wins: p.prof.wins, best: p.prof.best, stuntBest: p.prof.stuntBest || 0, stuntTotal: p.prof.stuntTotal || 0, name: p.prof.name, bounty: p.prof.bounty || 0, escapes: p.prof.escapes || 0, busted: p.prof.busted || 0 });

  // remove anything a build uses that this player doesn't own (others see what you really own)
  async function sanitize(p, build) {
    const E = await eco;
    const owned = new Set(p.prof.owned);
    const has = (k) => E.isFree(k) || owned.has(k);
    let changed = false;
    if (!has(E.carKey(build.gen))) { build.gen = 'gen2'; build.engine = null; changed = true; }
    const e = build.engine;
    if (e && typeof e === 'object') {
      if (e.swap && !has(E.engKey(build.gen, e.swap))) { e.swap = null; changed = true; }
      if (e.parts && typeof e.parts === 'object') for (const [k, id] of Object.entries(e.parts)) if (id !== 'stock' && !has(E.partKey(build.gen, k, id))) { e.parts[k] = 'stock'; changed = true; }
    }
    return changed;
  }
  function credit(p, amount, kind, extra) {
    p.prof.money = Math.max(0, Math.round(p.prof.money + amount));
    store.touch(); store.tx(p.key, kind, amount, extra);
  }

  // ---------------- races
  function startRace(w, lobby) {
    w.lobbies.delete(lobby.id);
    const members = [...lobby.members].filter((sid) => w.players.has(sid));
    if (!members.length) return;
    const race = { id: lobby.id, track: lobby.track, laps: lobby.laps, bots: lobby.bots, diff: lobby.diff ?? 0, members, t0: Date.now() + COUNTDOWN_MS, prog: new Map(), fin: [], seed: Math.floor(Math.random() * 1e9) };
    w.races.set(race.id, race);
    const host = w.players.get(lobby.host);
    for (const sid of members) {
      const p = w.players.get(sid); p.raceId = race.id;
      io.to(sid).emit('race:start', { raceId: race.id, cfg: { track: race.track, laps: race.laps, bots: race.bots, diff: race.diff, traffic: false, seed: race.seed }, grid: members, inMs: COUNTDOWN_MS, by: host?.name || '' });
    }
    io.to(w.id).emit('race:lobbies', lobbyList(w));
    log('race start', w.id, race.track, `laps=${race.laps}`, `players=${members.length}`, `bots=${race.bots}`);
    setTimeout(() => endRace(w, race.id), 15 * 60 * 1000).unref();
  }
  function endRace(w, id) {
    const r = w.races.get(id);
    if (!r) return;
    for (const sid of r.members) { const p = w.players.get(sid); if (p && p.raceId === id) p.raceId = null; }
    w.races.delete(id);
  }
  // the race is over once everyone still in it has a finish on record
  function raceDone(w, r) { if (r.members.every((sid) => r.fin.some((f) => f.sid === sid))) endRace(w, r.id); }
  // a player is out of their race (gave up, left the world, finish rejected): free them right away
  function quitRace(w, p, sid) {
    const r = p.raceId && w.races.get(p.raceId);
    p.raceId = null;
    if (!r) return;
    if (!r.fin.some((f) => f.sid === sid)) r.members = r.members.filter((x) => x !== sid);
    raceDone(w, r);
  }
  // heat may rise at most one level per 20 s of chase; the client's level is caught up to, not dropped
  const HEAT_STEP_MS = 20000;
  const curHeat = (pu, now) => Math.max(1, Math.min(5, pu.want || 1, 1 + Math.floor((now - pu.t0) / HEAT_STEP_MS)));
  setInterval(() => {
    const now = Date.now();
    for (const w of worlds.values()) for (const l of w.lobbies.values()) if (now >= l.t) startRace(w, l);
  }, 500).unref();

  io.on('connection', (sock) => {
    let w = null, p = null;
    let stateBudget = 30, raceBudget = 8, chatAt = 0;
    const refill = setInterval(() => { stateBudget = 30; raceBudget = 8; }, 1000);
    const recent = new Map(); // request id → result (idempotent buys)

    sock.on('hello', async (d = {}, cb) => {
      if (typeof cb !== 'function' || p) return;
      const E = await eco;
      let token = d.token, rec = store.get(token);
      const name = cleanName(d.name);
      if (!rec) {
        token = store.newToken();
        rec = store.create(token, name, E.START_MONEY);
        // one-time: players from before the economy keep the cars/parts already in their garage (capped)
        if (Array.isArray(d.claim)) {
          let value = 0;
          for (const k of d.claim.slice(0, 60)) {
            const pr = typeof k === 'string' ? E.priceOf(k) : null;
            if (!pr || rec.p.owned.includes(k) || value + pr > 450000) continue;
            value += pr; rec.p.owned.push(k);
          }
          if (value) store.tx(rec.key, 'claim', 0, { value, items: rec.p.owned.length });
        }
      } else if (rec.p.money < E.START_MONEY) {
        rec.p.money = E.START_MONEY;
        store.touch();
      }
      // logging in on a new device without typing a name keeps the profile's name
      if (String(d.name ?? '').trim() || rec.created) rec.p.name = name;
      rec.p.seen = Date.now(); store.touch();
      const build = cleanBuild(d.build) || { gen: 'gen2' };
      // one live session per profile: an older tab/device is signed out
      const old = presence.get(rec.key);
      if (old) { io.to(old.id).emit('kicked', { reason: 'เข้าสู่ระบบจากที่อื่น' }); io.sockets.sockets.get(old.id)?.disconnect(true); }
      // a party member joins the leader's world
      const pt = partyOf(rec.key), lead = pt && presence.get(pt.leader);
      w = lead?.w && worlds.has(lead.w.id) && lead.w.players.size < WORLD_CAP + 4 ? lead.w : pickWorld();
      p = { id: sock.id, key: rec.key, prof: rec.p, name: rec.p.name, build, pose: null, lastS: null, raceId: null, garage: null, lastSoloPrize: 0, lastStuntAt: 0, stuntMinAt: 0, stuntMinPts: 0, w };
      presence.set(rec.key, p);
      for (const fk of rec.p.friends || []) sendTo(fk, 'friend:online', { username: rec.p.username, name: rec.p.name, online: true });
      const fixed = await sanitize(p, build);
      const others = [...w.players.values()].map(pubPlayer);
      w.players.set(sock.id, p);
      sock.join(w.id);
      sock.to(w.id).emit('peer+', pubPlayer(p));
      log('join', w.id, rec.p.name, `(${w.players.size}/${WORLD_CAP})`, rec.created ? 'new' : '');
      if (pt) { pushParty(pt); }
      cb({ ok: true, token, id: sock.id, world: w.id, players: others, me: me(p), build: fixed ? build : null, cash: [...w.cash.values()].map(({ id, x, y, z, v, big }) => ({ id, x, y, z, v, big })), lobbies: lobbyList(w), online: [...worlds.values()].reduce((n, x) => n + x.players.size, 0) });
    });

    const leave = () => {
      if (!w || !p) return;
      const oldW = w;
      if (presence.get(p.key) === p) {
        presence.delete(p.key);
        for (const fk of p.prof.friends || []) sendTo(fk, 'friend:online', { username: p.prof.username, name: p.name, online: false });
        const pt = partyOf(p.key); if (pt) pushParty(pt);
      }
      quitRace(w, p, sock.id);
      w.players.delete(sock.id);
      for (const l of w.lobbies.values()) { l.members.delete(sock.id); if (l.host === sock.id) { w.lobbies.delete(l.id); } }
      sock.to(w.id).emit('peer-', { id: sock.id });
      if (p.pursuit) sock.to(w.id).emit('pursuit', { id: sock.id, name: p.name, state: 'left', heat: p.pursuit.heat });
      io.to(w.id).emit('race:lobbies', lobbyList(w));
      log('leave', w.id, p.name, `(${w.players.size} left)`);
      store.touch();
      sock.leave(w.id);
      if (oldW.players.size === 0 && worlds.size > 1) {
        worlds.delete(oldW.id);
        log('world close', oldW.id);
      }
      w = null; p = null;
    };

    sock.on('st', (s) => {
      if (!w || stateBudget-- <= 0) return;
      const v = cleanState(s);
      if (!v) return;
      p.lastS = v;
      p.pose = { x: v[0], y: v[1], z: v[2], t: Date.now() };
      sock.volatile.to(w.id).emit('st', { id: sock.id, s: v });
    });
    sock.on('build', async (b) => {
      if (!w) return;
      const v = cleanBuild(b);
      if (!v) return;
      await sanitize(p, v);
      p.build = v;
      sock.to(w.id).emit('build', { id: sock.id, build: v });
    });
    sock.on('chat', (t) => {
      if (!w) return;
      const now = Date.now();
      if (now - chatAt < 800) return;
      chatAt = now;
      const text = String(t ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
      if (text) io.to(w.id).emit('chat', { id: sock.id, name: p.name, text });
    });
    sock.on('crew:set', (d = {}, cb) => {
      if (!w || typeof cb !== 'function') return;
      const tag = String(d.tag ?? '').replace(/[^a-zA-Z0-9ก-๙_-]/g, '').trim().slice(0, 6).toUpperCase();
      p.prof.crew = tag || null;
      store.touch();
      io.to(w.id).emit('crew', { id: sock.id, crew: p.prof.crew });
      cb({ ok: true, crew: p.prof.crew, me: me(p) });
    });
    sock.on('car:act', (d = {}) => {
      if (!w || raceBudget-- <= 0) return;
      const kind = d.kind === 'horn' || d.kind === 'flash' ? d.kind : null;
      if (kind) sock.to(w.id).emit('car:act', { id: sock.id, kind, name: p.name });
    });

    // ---- cash: server checks you are really next to it (last pose < 1.5 s old)
    sock.on('pick', (d = {}, cb) => {
      if (!w || typeof cb !== 'function') return;
      const c = w.cash.get(d.id);
      if (!c) return cb({ ok: false });
      // the client says where it touched the cash; that point must be at the cash and close to the
      // last pose the server saw (poses arrive 10×/s, so allow for speed × age)
      const at = d.at && Number.isFinite(d.at.x) && Number.isFinite(d.at.y) && Number.isFinite(d.at.z) ? d.at : null;
      if (!p.pose || !at) return cb({ ok: false, err: 'far' });
      const age = (Date.now() - p.pose.t) / 1000;
      if (age > 5 || d3(at, c) > 6 || Math.hypot(at.x - p.pose.x, at.z - p.pose.z) > 25 + age * 90) return cb({ ok: false, err: 'far' });
      w.cash.delete(c.id);
      credit(p, c.v, 'cash', { big: c.big });
      cb({ ok: true, v: c.v, money: p.prof.money });
      io.to(w.id).emit('cash-', { id: c.id, by: sock.id, name: p.name, v: c.v, big: c.big });
      const ww = w;
      setTimeout(() => { if (!worlds.has(ww.id)) return; const n = spawnCash(ww, c.big); if (n) io.to(ww.id).emit('cash+', n); }, c.big ? 90000 : 12000).unref?.();
    });

    // ---- garages: enter (validated by position), discovery bonus, purchases only inside
    sock.on('garage', async (d = {}, cb) => {
      if (!w || typeof cb !== 'function') return;
      const P = await plc, E = await eco;
      if (d.id === null) {
        p.garage = null;
        if (p.lastS) { p.lastS = [...p.lastS]; p.lastS[9] = 1; }
        return cb({ ok: true });
      }
      const markInGarage = () => {
        if (p.lastS) { p.lastS = [...p.lastS]; p.lastS[9] = 0; sock.to(w.id).emit('st', { id: sock.id, s: p.lastS }); }
      };
      if (d.id === 'showroom') { p.garage = 'showroom'; markInGarage(); return cb({ ok: true, bonus: 0, me: me(p) }); }
      const g = P.garageById(d.id);
      if (!g) return cb({ ok: false });
      if (!p.pose || Date.now() - p.pose.t > 3000 || Math.hypot(p.pose.x - g.x, p.pose.z - g.z) > (g.onTouge ? 30 : 22)) return cb({ ok: false, err: 'ไม่ได้อยู่ที่อู่' });
      p.garage = g.id;
      markInGarage();
      let bonus = 0;
      if (g.hidden && !p.prof.discovered.includes(g.id)) { p.prof.discovered.push(g.id); bonus = E.GARAGE_DISCOVERY; credit(p, bonus, 'discover', { g: g.id }); }
      cb({ ok: true, bonus, me: me(p) });
    });
    sock.on('buy', async (d = {}, cb) => {
      if (!w || typeof cb !== 'function') return;
      if (typeof d.rid === 'string' && recent.has(d.rid)) return cb(recent.get(d.rid));
      const E = await eco;
      const done = (r) => { if (typeof d.rid === 'string') { recent.set(d.rid, r); if (recent.size > 30) recent.delete(recent.keys().next().value); } cb(r); };
      if (!p.garage) return done({ ok: false, err: 'ซื้อของได้เฉพาะในอู่' });
      const key = String(d.key || '');
      const price = E.priceOf(key);
      if (price === null) return done({ ok: false, err: 'ไม่มีสินค้านี้' });
      if (price === 0 || p.prof.owned.includes(key)) return done({ ok: true, money: p.prof.money, owned: p.prof.owned });
      if (p.prof.money < price) return done({ ok: false, err: `เงินไม่พอ (ขาดอีก ฿${(price - p.prof.money).toLocaleString()})` });
      p.prof.owned.push(key);
      credit(p, -price, 'buy', { key });
      log('buy', p.name, key, price);
      done({ ok: true, money: p.prof.money, owned: p.prof.owned });
    });

    sock.on('garage:maxmoney', async (d = {}, cb) => {
      if (!w || typeof cb !== 'function') return;
      if (!p.garage) return cb({ ok: false, err: 'กดรับเงินได้เฉพาะในอู่' });
      const E = await eco;
      const target = E.START_MONEY;
      if (p.prof.money < target) {
        credit(p, target - p.prof.money, 'garage-grant', { target });
      }
      cb({ ok: true, money: p.prof.money, me: me(p) });
    });

    // ---- races started from the open world
    sock.on('race:open', async (d = {}, cb) => {
      if (!w || typeof cb !== 'function') return;
      const E = await eco;
      if (p.raceId) return cb({ ok: false, err: 'กำลังแข่งอยู่' });
      for (const l of w.lobbies.values()) if (l.host === sock.id || l.members.has(sock.id)) return cb({ ok: false, err: 'อยู่ในรายการแข่งแล้ว' });
      if (w.lobbies.size >= 3) return cb({ ok: false, err: 'มีการเปิดแข่งเยอะแล้ว ลองเข้าร่วมแทน' });
      const track = E.TRACKS[d.track] ? d.track : 'touge';
      const laps = Number.isInteger(d.laps) && d.laps >= 1 && d.laps <= 5 ? d.laps : 1;
      const bots = Number.isInteger(d.bots) && d.bots >= 0 && d.bots <= 5 ? d.bots : 3;
      const diff = Number.isInteger(d.diff) && d.diff >= 0 && d.diff <= 3 ? d.diff : 0;
      const l = { id: nid('r'), host: sock.id, hostName: p.name, track, laps, bots, diff, members: new Set([sock.id]), t: Date.now() + (d.now ? 0 : LOBBY_MS) };
      const pt = d.party && partyOf(p.key);
      if (pt) {
        for (const k of pt.members) { const q = presence.get(k); if (q && q.w === w && !q.raceId) { l.members.add(q.id); if (q !== p) io.to(q.id).emit('race:party', { host: p.name, track, laps }); } }
        l.t = Date.now() + 8000;
      }
      w.lobbies.set(l.id, l);
      io.to(w.id).emit('race:lobbies', lobbyList(w));
      const to = typeof d.to === 'string' && w.players.has(d.to) ? d.to : null;
      if (!d.now || to) sock.to(w.id).emit('race:invite', { id: l.id, host: p.name, track, laps, to });
      if (to) l.t = Math.max(l.t, Date.now() + LOBBY_MS); // a challenge always waits for the answer
      cb({ ok: true, id: l.id });
    });
    sock.on('race:join', (d = {}, cb) => {
      if (!w || typeof cb !== 'function') return;
      const l = w.lobbies.get(d.id);
      if (!l) return cb({ ok: false, err: 'การแข่งนี้เริ่มไปแล้ว' });
      if (p.raceId) return cb({ ok: false, err: 'กำลังแข่งอยู่' });
      if (l.members.size >= 8) return cb({ ok: false, err: 'ผู้แข่งเต็มแล้ว' });
      for (const o of w.lobbies.values()) o.members.delete(sock.id);
      l.members.add(sock.id);
      io.to(w.id).emit('race:lobbies', lobbyList(w));
      cb({ ok: true });
    });
    sock.on('race:leave', () => {
      if (!w) return;
      for (const l of w.lobbies.values()) { l.members.delete(sock.id); if (l.host === sock.id) w.lobbies.delete(l.id); }
      quitRace(w, p, sock.id);
      io.to(w.id).emit('race:lobbies', lobbyList(w));
    });
    sock.on('race:go', () => { // host starts early
      if (!w) return;
      for (const l of w.lobbies.values()) if (l.host === sock.id) startRace(w, l);
    });
    sock.on('race:p', (q = {}) => {
      if (!w || !p.raceId || raceBudget-- <= 0) return;
      const r = w.races.get(p.raceId);
      if (!r) return;
      const dd = Number(q.d);
      if (!Number.isFinite(dd) || Math.abs(dd) > 1e5) return;
      const now = Date.now(), pr = r.prog.get(sock.id) || { d: -50, t: r.t0, max: 0, bad: 0 };
      const dt = Math.max(0.05, (now - pr.t) / 1000);
      if (dd - pr.d > dt * 100 + 30) pr.bad++; // faster than any car: suspicious jump
      pr.d = dd; pr.t = now; pr.max = Math.max(pr.max, dd);
      r.prog.set(sock.id, pr);
      for (const sid of r.members) if (sid !== sock.id) io.to(sid).volatile.emit('race:p', { id: sock.id, d: dd, f: 0 });
    });
    sock.on('race:fin', async (q = {}, cb) => {
      if (!w || typeof cb !== 'function') return;
      const E = await eco;
      const r = w.races.get(p.raceId);
      if (!r) return cb({ ok: false, err: 'ไม่พบการแข่ง' });
      if (r.fin.some((f) => f.sid === sock.id)) return cb({ ok: false, err: 'บันทึกผลไปแล้ว' });
      const T = E.TRACKS[r.track], total = T.len * r.laps;
      const t = Number(q.t), elapsed = (Date.now() - r.t0) / 1000;
      const pr = r.prog.get(sock.id);
      const valid = Number.isFinite(t) && t > 0 && t >= total / E.MAX_AVG_SPEED && t <= elapsed + 2 && t >= elapsed - 6
        && pr && pr.max >= total * 0.9 && pr.bad <= 2;
      if (!valid) { log('race reject', p.name, r.track, { t, elapsed: elapsed.toFixed(1), max: pr?.max, bad: pr?.bad }); store.tx(p.key, 'race-reject', 0, { track: r.track, time: t }); quitRace(w, p, sock.id); return cb({ ok: false, err: 'ผลการแข่งไม่ผ่านการตรวจสอบ' }); }
      const racers = r.members.length;
      let pos = r.fin.length;
      if (racers === 1) pos = Math.max(0, Math.min(7, (Number(q.place) || 1) - 1)); // vs bots: place reported by the client
      r.fin.push({ sid: sock.id, t });
      let prize = E.racePrize(r.track, r.laps, pos, racers, r.bots);
      if (racers === 1 && Date.now() - p.lastSoloPrize < 60000) prize = 0; // anti-farming
      if (racers === 1 && prize) p.lastSoloPrize = Date.now();
      const rep = E.repFor(pos, racers);
      p.prof.races++; if (pos === 0 && (racers >= 2 || r.bots > 0)) p.prof.wins++;
      p.prof.rep += rep;
      const bestKey = `${r.track}`;
      if (!(p.prof.best[bestKey] <= t)) p.prof.best[bestKey] = Math.round(t * 100) / 100;
      credit(p, prize, 'race', { track: r.track, pos, racers, time: t });
      log('race fin', p.name, r.track, `pos=${pos + 1}/${racers}`, `t=${t.toFixed(2)}`, `prize=${prize}`);
      for (const sid of r.members) io.to(sid).emit('race:result', { id: sock.id, name: p.name, t, pos, prize });
      cb({ ok: true, prize, rep, pos, me: me(p) });
      p.raceId = null; // finished: free to race again while the others are still driving
      raceDone(w, r);
    });

    // ---- police pursuits: the client runs the chase AI, the server keeps heat/bounty honest
    sock.on('heat', (d = {}, cb) => {
      if (!w || typeof cb !== 'function') return;
      const now = Date.now(), pu = p.pursuit;
      const heat = Number.isInteger(d.heat) ? Math.max(1, Math.min(5, d.heat)) : 1;
      if (d.state === 'start') {
        if (pu && now - pu.t0 < 600000) return cb({ ok: true });
        p.pursuit = { t0: now, heat: 1, want: 1 };
        io.to(w.id).emit('pursuit', { id: sock.id, name: p.name, state: 'start', heat: 1 });
        return cb({ ok: true });
      }
      if (!pu) return cb({ ok: false, err: 'ไม่ได้ถูกไล่ล่า' });
      if (d.state === 'cancel') { p.pursuit = null; io.to(w.id).emit('pursuit', { id: sock.id, name: p.name, state: 'left', heat: pu.heat }); return cb({ ok: true, amount: 0 }); }
      if (d.state === 'up') {
        pu.want = Math.max(pu.want || 1, heat);
        const h = curHeat(pu, now);
        if (h > pu.heat) { pu.heat = h; io.to(w.id).emit('pursuit', { id: sock.id, name: p.name, state: 'up', heat: h }); }
        return cb({ ok: true, heat: pu.heat });
      }
      p.pursuit = null;
      pu.want = Math.max(pu.want || 1, heat);
      pu.heat = Math.max(pu.heat, curHeat(pu, now)); // a level the time limit held back counts by the end of the chase
      const secs = (now - pu.t0) / 1000;
      let amount = 0;
      if (d.state === 'escaped') {
        // bounty grows with heat and chase time; very short chases pay nothing
        amount = secs < 20 ? 0 : Math.min(30000, Math.round((pu.heat * 1500 + secs * 20 * pu.heat) / 10) * 10);
        p.prof.bounty = (p.prof.bounty || 0) + amount; p.prof.escapes = (p.prof.escapes || 0) + 1; p.prof.rep += pu.heat * 25;
        credit(p, amount, 'escape', { heat: pu.heat, secs: Math.round(secs) });
      } else if (d.state === 'busted') {
        amount = Math.min(20000, Math.max(1000, Math.round(p.prof.money * 0.08 / 10) * 10)) * (pu.heat >= 3 ? 1.5 : 1);
        amount = Math.min(amount, p.prof.money);
        p.prof.busted = (p.prof.busted || 0) + 1;
        credit(p, -amount, 'busted', { heat: pu.heat, secs: Math.round(secs) });
      } else return cb({ ok: false });
      log('pursuit', d.state, p.name, `heat=${pu.heat}`, `t=${Math.round(secs)}s`, `amount=${amount}`);
      io.to(w.id).emit('pursuit', { id: sock.id, name: p.name, state: d.state, heat: pu.heat });
      cb({ ok: true, amount, me: me(p) });
    });
    sock.on('cops', (d = {}) => {
      if (!w || !p.pursuit || !Array.isArray(d.c) || d.c.length > 6 || raceBudget-- <= 0) return;
      const c = d.c.filter((a) => Array.isArray(a) && a.length === 4 && a.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e4));
      sock.volatile.to(w.id).emit('cops', { id: sock.id, c });
    });

    // ---------------- accounts, friends, party, warp, likes ----------------
    let authTries = 0, authWin = 0; // login attempts per socket per minute (no timer per connection)
    const noPlayer = (cb) => { if (p) return false; cb({ ok: false, err: 'ยังไม่เข้าเมือง ลองใหม่อีกครั้ง' }); return true; };
    sock.on('account:register', (d = {}, cb) => {
      if (typeof cb !== 'function' || noPlayer(cb)) return;
      const err = store.register(p.key, String(d.username || ''), d.password);
      if (err) return cb({ ok: false, err });
      log('register', p.prof.username);
      cb({ ok: true, me: me(p) });
    });
    sock.on('account:login', (d = {}, cb) => {
      if (typeof cb !== 'function') return;
      if (Date.now() - authWin > 60000) { authWin = Date.now(); authTries = 0; }
      if (++authTries > 6) return cb({ ok: false, err: 'ลองบ่อยเกินไป รอสักครู่' });
      const token = store.login(d.username, d.password);
      if (!token) return cb({ ok: false, err: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      log('login', d.username);
      cb({ ok: true, token });
    });
    // world snapshot after moving between worlds (warp to a friend / party)
    function switchWorld(nw) {
      if (!w || nw === w) return false;
      const oldW = w;
      oldW.players.delete(sock.id);
      for (const l of oldW.lobbies.values()) { l.members.delete(sock.id); if (l.host === sock.id) oldW.lobbies.delete(l.id); }
      sock.to(oldW.id).emit('peer-', { id: sock.id });
      io.to(oldW.id).emit('race:lobbies', lobbyList(oldW));
      sock.leave(oldW.id);
      const others = [...nw.players.values()].map(pubPlayer);
      w = nw; p.w = nw;
      nw.players.set(sock.id, p);
      sock.join(nw.id);
      sock.to(nw.id).emit('peer+', pubPlayer(p));
      sock.emit('world', { world: nw.id, players: others, cash: [...nw.cash.values()].map(({ id, x, y, z, v, big }) => ({ id, x, y, z, v, big })), lobbies: lobbyList(nw) });
      if (oldW.players.size === 0 && worlds.size > 1) {
        worlds.delete(oldW.id);
        log('world close', oldW.id);
      }
      log('move', p.name, '→', nw.id);
      return true;
    }
    const needAccount = (cb) => { if (!p?.prof.username) { cb({ ok: false, err: 'สมัครชื่อผู้ใช้ก่อน (เมนูเพื่อน → บัญชี)' }); return true; } return false; };
    sock.on('friend:list', (d, cb) => {
      if (typeof cb !== 'function' || noPlayer(cb)) return;
      const list = (p.prof.friends || []).map((k) => { const pr = store.byKey(k), q = presence.get(k); return pr && { username: pr.username, name: pr.name, online: !!q, same: q?.w === w, racing: !!q?.raceId, rep: pr.rep, car: q?.build?.gen || null }; }).filter(Boolean);
      cb({ ok: true, friends: list, requests: (p.prof.freq || []).map((k) => ({ username: uname(k), name: store.byKey(k)?.name })).filter((x) => x.username), party: partyOf(p.key) ? partyInfo(partyOf(p.key)) : null });
    });
    sock.on('friend:add', (d = {}, cb) => {
      if (typeof cb !== 'function' || noPlayer(cb) || needAccount(cb)) return;
      const tk = store.userKey(d.username);
      if (!tk || tk === p.key) return cb({ ok: false, err: 'ไม่พบผู้เล่นชื่อนี้' });
      const t = store.byKey(tk);
      p.prof.friends = p.prof.friends || []; t.friends = t.friends || []; t.freq = t.freq || []; p.prof.freq = p.prof.freq || [];
      if (p.prof.friends.includes(tk)) return cb({ ok: true, already: true });
      if (p.prof.freq.includes(tk)) { // they asked first → accept
        p.prof.freq = p.prof.freq.filter((k) => k !== tk); p.prof.friends.push(tk); t.friends.push(p.key); store.touch();
        sendTo(tk, 'friend:ok', { username: p.prof.username, name: p.name });
        return cb({ ok: true, friends: true, me: me(p) });
      }
      if (!t.freq.includes(p.key)) t.freq.push(p.key);
      store.touch();
      sendTo(tk, 'friend:req', { username: p.prof.username, name: p.name });
      cb({ ok: true, sent: true });
    });
    sock.on('friend:accept', (d = {}, cb) => {
      if (typeof cb !== 'function' || noPlayer(cb) || needAccount(cb)) return;
      const tk = store.userKey(d.username), t = tk && store.byKey(tk);
      p.prof.freq = (p.prof.freq || []).filter((k) => k !== tk);
      if (!t) { store.touch(); return cb({ ok: false, err: 'ไม่พบผู้เล่น' }); }
      if (d.no) { store.touch(); return cb({ ok: true, me: me(p) }); }
      p.prof.friends = p.prof.friends || []; t.friends = t.friends || [];
      if (!p.prof.friends.includes(tk)) p.prof.friends.push(tk);
      if (!t.friends.includes(p.key)) t.friends.push(p.key);
      store.touch();
      sendTo(tk, 'friend:ok', { username: p.prof.username, name: p.name });
      cb({ ok: true, me: me(p) });
    });
    sock.on('friend:remove', (d = {}, cb) => {
      if (typeof cb !== 'function' || noPlayer(cb)) return;
      const tk = store.userKey(d.username), t = tk && store.byKey(tk);
      p.prof.friends = (p.prof.friends || []).filter((k) => k !== tk);
      if (t) t.friends = (t.friends || []).filter((k) => k !== p.key);
      store.touch(); cb({ ok: true, me: me(p) });
    });
    // warp: jump into a friend's world, right next to their car
    sock.on('warp', (d = {}, cb) => {
      if (typeof cb !== 'function' || noPlayer(cb)) return;
      const tk = store.userKey(d.username), q = tk && presence.get(tk);
      const pt = partyOf(p.key);
      const allowed = tk && ((p.prof.friends || []).includes(tk) || (pt && pt.members.has(tk)));
      if (!allowed) return cb({ ok: false, err: 'วาร์ปได้เฉพาะไปหาเพื่อนหรือคนในปาร์ตี้' });
      if (!q) return cb({ ok: false, err: 'เพื่อนออฟไลน์อยู่' });
      if (p.raceId) return cb({ ok: false, err: 'กำลังแข่งอยู่' });
      if (q.w !== w && q.w.players.size >= WORLD_CAP + 4) return cb({ ok: false, err: 'เมืองของเพื่อนเต็ม' });
      switchWorld(q.w);
      cb({ ok: true, pose: q.pose ? { x: q.pose.x, y: q.pose.y, z: q.pose.z, h: q.lastS ? q.lastS[3] : 0 } : null, id: q.id });
    });
    // quick warp to any online peer by socket id (no account registration required)
    sock.on('warp:peer', (d = {}, cb) => {
      if (typeof cb !== 'function' || noPlayer(cb)) return;
      if (p.raceId) return cb({ ok: false, err: 'กำลังแข่งอยู่' });
      const sid = String(d.id || '');
      let q = w.players.get(sid);
      if (!q) {
        for (const wr of worlds.values()) {
          if (wr.players.has(sid)) { q = wr.players.get(sid); break; }
        }
      }
      if (!q || q === p) return cb({ ok: false, err: 'ผู้เล่นออฟไลน์แล้ว' });
      if (q.w !== w) {
        if (q.w.players.size >= WORLD_CAP + 4) return cb({ ok: false, err: 'เมืองนี้เต็มชั่วคราว' });
        switchWorld(q.w);
      }
      cb({ ok: true, id: q.id, name: q.name, inGarage: !!q.garage, pose: q.pose ? { x: q.pose.x, y: q.pose.y, z: q.pose.z, h: q.lastS ? q.lastS[3] : 0 } : null });
    });
    // direct messages (friends) and party chat
    let pmAt = 0;
    sock.on('pm', (d = {}) => {
      if (!p || Date.now() - pmAt < 600) return; pmAt = Date.now();
      const tk = store.userKey(d.username), text = String(d.text ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
      if (!tk || !text || !(p.prof.friends || []).includes(tk)) return;
      sendTo(tk, 'pm', { from: p.prof.username, name: p.name, text });
    });
    sock.on('party:invite', (d = {}, cb) => {
      if (typeof cb !== 'function' || noPlayer(cb) || needAccount(cb)) return;
      const tk = store.userKey(d.username);
      if (!tk || !(p.prof.friends || []).includes(tk)) return cb({ ok: false, err: 'เชิญได้เฉพาะเพื่อน' });
      if (!presence.get(tk)) return cb({ ok: false, err: 'เพื่อนออฟไลน์อยู่' });
      let pt = partyOf(p.key);
      if (!pt) { pt = { id: nid('p'), leader: p.key, members: new Set([p.key]) }; parties.set(pt.id, pt); pushParty(pt); }
      if (pt.members.size >= 6) return cb({ ok: false, err: 'ปาร์ตี้เต็ม (6 คน)' });
      pt.invited = pt.invited || new Set(); pt.invited.add(tk);
      sendTo(tk, 'party:invite', { id: pt.id, from: p.prof.username, name: p.name });
      cb({ ok: true });
    });
    sock.on('party:join', (d = {}, cb) => {
      if (typeof cb !== 'function' || noPlayer(cb)) return;
      const pt = parties.get(d.id);
      if (!pt || !pt.invited?.has(p.key)) return cb({ ok: false, err: 'คำเชิญหมดอายุแล้ว' });
      leaveParty(p.key);
      pt.invited.delete(p.key); pt.members.add(p.key);
      pushParty(pt);
      // join the leader in their world
      const lead = presence.get(pt.leader);
      let pose = null;
      if (lead && lead.w !== w && !p.raceId && lead.w.players.size < WORLD_CAP + 4) { switchWorld(lead.w); }
      if (lead?.pose) pose = { x: lead.pose.x, y: lead.pose.y, z: lead.pose.z, h: lead.lastS ? lead.lastS[3] : 0 };
      cb({ ok: true, pose });
    });
    sock.on('party:leave', () => { if (p) leaveParty(p.key); });
    let pchatAt = 0;
    sock.on('party:chat', (t) => {
      if (!p || Date.now() - pchatAt < 600) return; pchatAt = Date.now();
      const pt = partyOf(p.key), text = String(t ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
      if (!pt || !text) return;
      for (const k of pt.members) sendTo(k, 'party:chat', { name: p.name, text });
    });
    // bank drift / speed / near-miss combo into cash, REP, and stunt leaderboard
    sock.on('stunt:bank', async (d = {}, cb) => {
      if (!w || !p || typeof cb !== 'function') return;
      const now = Date.now();
      if (p.lastStuntAt && now - p.lastStuntAt < 1200) return cb({ ok: false });
      if (now - (p.stuntMinAt || 0) > 60000) { p.stuntMinAt = now; p.stuntMinPts = 0; }
      const pts = Math.min(25000, Math.max(0, Math.round(Number(d.pts) || 0)));
      if (pts < 150 || p.stuntMinPts + pts > 150000) return cb({ ok: false });
      const E = await eco;
      const rw = E.stuntReward(pts);
      p.lastStuntAt = now;
      p.stuntMinPts += pts;
      p.prof.stuntTotal = (p.prof.stuntTotal || 0) + pts;
      const isBest = pts > (p.prof.stuntBest || 0);
      if (isBest) p.prof.stuntBest = pts;
      p.prof.rep += rw.rep;
      credit(p, rw.cash, 'stunt', { pts, kind: String(d.kind || '').slice(0, 24) });
      cb({ ok: true, pts, cash: rw.cash, rep: rw.rep, best: isBest, me: me(p) });
    });
    // record personal drag test times (0-100 km/h & 402m quarter mile)
    sock.on('drag:best', (d = {}, cb) => {
      if (!w || !p || typeof cb !== 'function') return;
      p.prof.best = p.prof.best || {};
      let updated = false;
      const t100 = Number(d.t100);
      if (Number.isFinite(t100) && t100 >= 1.2 && t100 <= 60) {
        const v = Math.round(t100 * 100) / 100;
        if (!(p.prof.best.drag100 <= v)) { p.prof.best.drag100 = v; updated = true; }
      }
      const t402 = Number(d.t402);
      if (Number.isFinite(t402) && t402 >= 5.0 && t402 <= 90) {
        const v = Math.round(t402 * 100) / 100;
        if (!(p.prof.best.drag402 <= v)) { p.prof.best.drag402 = v; updated = true; }
      }
      if (updated) { p.prof.rep += 15; store.touch(); }
      cb({ ok: true, updated, rep: updated ? 15 : 0, me: me(p) });
    });
    // likes for a car you saw: once per day per car owner, +5 REP for them
    sock.on('like', (d = {}, cb) => {
      if (!w || typeof cb !== 'function') return;
      const t = w.players.get(d.id);
      if (!t || t === p) return cb({ ok: false });
      const day = new Date().toISOString().slice(0, 10);
      p.prof.liked = p.prof.liked || {};
      if (p.prof.liked[t.key] === day) return cb({ ok: false, err: 'กดถูกใจคันนี้ไปแล้ววันนี้' });
      p.prof.liked[t.key] = day;
      t.prof.likes = (t.prof.likes || 0) + 1; t.prof.rep += 5; store.touch();
      io.to(t.id).emit('liked', { name: p.name, likes: t.prof.likes });
      cb({ ok: true, likes: t.prof.likes });
    });

    sock.on('leader', (d, cb) => {
      if (typeof cb === 'function') {
        cb({
          rep: store.leaderboard(),
          stunt: store.stuntLeaderboard(),
          likes: store.likesLeaderboard(),
          wanted: store.mostWanted(),
        });
      }
    });
    sock.on('disconnect', () => { clearInterval(refill); leave(); });
  });

  return { stats: () => ({ worlds: worlds.size, players: [...worlds.values()].reduce((n, w) => n + w.players.size, 0) }) };
}

module.exports = { attachRooms, WORLD_CAP };
