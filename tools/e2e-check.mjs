// End-to-end gameplay check against a running server (node server.js).
// Two simulated socket.io players exercise: join → chat → buy(฿1) →
// public lobby open/join/edit/go → race progress+finish → tandem stunt → leave.
// Usage: node tools/e2e-check.mjs [baseUrl]
import { io } from 'socket.io-client';

const BASE = process.argv[2] || 'http://localhost:3000';
const AKEY = process.env.ADMIN_KEY || 'admin';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('✓', name, extra); } else { fail++; console.log('✗ FAIL:', name, extra); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function player(name) {
  const s = io(BASE, { path: '/mp', transports: ['websocket', 'polling'] });
  const got = { chats: [], lobbies: [], invites: [], raceStart: null, results: [], tandem: [], kicked: null, peers: [] };
  s.on('chat', (m) => got.chats.push(m));
  s.on('race:lobbies', (l) => got.lobbies.push(l));
  s.on('race:invite', (d) => got.invites.push(d));
  s.on('race:start', (d) => { got.raceStart = d; });
  s.on('race:result', (d) => got.results.push(d));
  s.on('stunt:tandem', (d) => got.tandem.push(d));
  s.on('kicked', (d) => { got.kicked = d; });
  got.builds = [];
  s.on('peer+', (p) => got.peers.push(p));
  s.on('build', (d) => got.builds.push(d));
  const call = (ev, data) => new Promise((res) => { const t = setTimeout(() => res({ ok: false, err: 'timeout' }), 5000); s.emit(ev, data, (r) => { clearTimeout(t); res(r || { ok: false, err: 'no-reply' }); }); });
  return { s, got, call, name };
}

const st = (x, y, z) => [x, y, z, 0, 0, 0, 0, 0, 0, 0]; // STATE_LEN=10 pose

const j = await fetch(`${BASE}/admin/api/settings`, { method: 'POST', headers: { 'x-admin-key': AKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ countdownMs: 500 }) }).then((r) => r.json()).catch(() => ({}));
ok('admin: countdownMs→500 สำหรับเทส', j.ok === true);

const A = player('E2E-A'), B = player('E2E-B');
const hA = await A.call('hello', { token: null, name: A.name, build: { gen: 'gen2' }, claim: null });
const hB = await B.call('hello', { token: null, name: B.name, build: { gen: 'gen2' }, claim: null });
ok('hello A+B', hA.ok && hB.ok, `${A.name}@${hA.world} ${B.name}@${hB.world}`);
ok('โลกเดียวกัน', hA.world === hB.world);
await sleep(300);
ok('A เห็น B เข้าเมือง (peer+)', A.got.peers.some((p) => p.name === B.name)); // B joined after A → A gets peer+, B gets full player list via hello
ok('B ได้รายชื่อผู้เล่นตอน join', (hB.players || []).some((p) => p.name === A.name));

A.s.emit('st', st(100, 0, 200)); B.s.emit('st', st(110, 0, 205));
await sleep(300);
A.s.emit('chat', 'ทักทายจาก A');
await sleep(400);
ok('chat A→B', B.got.chats.some((m) => m.text === 'ทักทายจาก A' && m.name === A.name));

const buy1 = await A.call('buy', { key: 'car:supra-a80', rid: 'e2e-1' });
ok('ซื้อ Supra ราคา ฿1', buy1.ok && buy1.money === hA.me.money - 1, `money ${hA.me.money}→${buy1.money}`);
const buyBad = await A.call('buy', { key: 'car:nope', rid: 'e2e-2' });
ok('ซื้อของไม่มี → error', buyBad.ok === false);
const buyDup = await A.call('buy', { key: 'car:supra-a80', rid: 'e2e-3' });
ok('ซื้อซ้ำ → ok ไม่หักเงิน', buyDup.ok && buyDup.money === buy1.money);

// --- admin-added car: buy it (฿1) then drive it — sanitize() must not strip it to gen2 ---
const addCar = await fetch(`${BASE}/admin/api/cars`, { method: 'POST', headers: { 'x-admin-key': AKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'e2e-car', name: 'E2E Test Car', glb: null, price: 1 }) }).then((r) => r.json());
ok('admin เพิ่มรถ e2e-car (฿1)', addCar.ok === true);
const C = player('E2E-C');
const hC2 = await C.call('hello', { token: null, name: C.name, build: { gen: 'gen2' }, claim: null });
ok('C เข้าโลก', hC2.ok === true);
const buyC = await C.call('buy', { key: 'car:e2e-car', rid: 'e2e-c1' });
ok('ซื้อรถ admin ฿1', buyC.ok && buyC.money === hC2.me.money - 1);
const buyPart = await C.call('buy', { key: 'e2e-car|part:turbo:big', rid: 'e2e-c2' });
ok('ซื้อ part บนรถ admin ฿1', buyPart.ok, JSON.stringify(buyPart.err || ''));
C.s.emit('build', { gen: 'e2e-car' });
await sleep(400);
const cBuild = A.got.builds.find((b) => b.id === hC2.id);
ok('build e2e-car broadcast ไม่โดน strip', cBuild?.build?.gen === 'e2e-car', JSON.stringify(cBuild?.build));
C.s.disconnect();

// --- lobby flow ---
const op = await A.call('race:open', { track: 'sprint', laps: 1, bots: 0 });
ok('A เปิด lobby sprint', op.ok && op.id);
await sleep(300);
const lb = B.got.lobbies.at(-1)?.find((l) => l.id === op.id);
ok('B เห็น lobby ใน race:lobbies', !!lb, lb ? `${lb.host} ${lb.members?.length}คน` : '');
ok('B ได้ invite พร้อมชื่อ host', B.got.invites.some((i) => i.id === op.id && i.host === A.name));
const join = await B.call('race:join', { id: op.id });
ok('B join lobby', join.ok === true);
await sleep(300);
const lb2 = A.got.lobbies.at(-1)?.find((l) => l.id === op.id);
ok('A เห็น members อัปเดทเป็น 2 คน', lb2?.members?.length === 2, lb2?.members?.join(','));
const ed = await A.call('race:edit', { track: 'sprint', laps: 2, bots: 2 });
ok('A แก้ lobby (laps2 bots2)', ed.ok === true);
await sleep(200);
const lb3 = B.got.lobbies.at(-1)?.find((l) => l.id === op.id);
ok('B เห็น lobby อัปเดท laps=2', lb3?.laps === 2);

const joinBad = await A.call('race:join', { id: 'r_fake' });
ok('join lobby ปลอม → error', joinBad.ok === false);

A.s.emit('race:go');
await sleep(200);
ok('ทั้งคู่ได้ race:start', !!A.got.raceStart && !!B.got.raceStart, A.got.raceStart ? `track=${A.got.raceStart.cfg.track} laps=${A.got.raceStart.cfg.laps}` : '');
ok('cfg ตามที่แก้ไว้', A.got.raceStart?.cfg?.laps === 2 && A.got.raceStart?.cfg?.track === 'sprint');

// sprint len 747 × 2 laps = 1494m → t ≥ 15.7s at MAX_AVG_SPEED; progress must reach 90%
const total = 747 * 2;
const t0 = Date.now();
for (let d = 80; d <= total + 50; d += 70) { A.s.emit('race:p', { d }); B.s.emit('race:p', { d }); await sleep(500); }
// keep time plausible: t ≤ elapsed+2
let t = (Date.now() - t0) / 1000 - 0.5;
const minT = total / 95;
while (t < minT) { await sleep(500); t = (Date.now() - t0) / 1000 - 0.5; }
const finA = await A.call('race:fin', { t: Math.min(t, (Date.now() - t0) / 1000 - 0.5), place: 1 });
const finB = await B.call('race:fin', { t: Math.min(t + 0.7, (Date.now() - t0) / 1000 - 0.5 + 0.7), place: 2 });
ok('A จบแข่งได้รางวัล', finA.ok && finA.prize > 0, `prize=฿${finA.prize} rep=${finA.rep}`);
ok('B จบแข่งได้รางวัล', finB.ok && finB.prize > 0, `prize=฿${finB.prize}`);
ok('A ได้ race:result ของ B', A.got.results.some((r) => r.name === B.name));
const finDup = await A.call('race:fin', { t: 30, place: 1 });
ok('fin ซ้ำ → error (ไม่พบการแข่ง/บันทึกแล้ว)', finDup.ok === false);

// --- stunt + tandem (poses 10m apart — inside tandemRadius) ---
A.s.emit('st', st(500, 0, 500)); B.s.emit('st', st(510, 0, 505));
await sleep(300);
const st1 = await A.call('stunt:bank', { pts: 3000, kind: 'drift' });
ok('stunt bank', st1.ok && st1.cash > 0, `cash=฿${st1.cash} rep=${st1.rep} tandem=${st1.tandem || 'no'}`);
ok('เจอ tandem bonus (B อยู่ใกล้)', st1.tandem === B.name);
await sleep(300);
ok('B ได้แจ้ง tandem', B.got.tandem.some((x) => x.by === A.name));
const st2 = await A.call('stunt:bank', { pts: 3000, kind: 'drift' });
ok('stunt spam ติด rate-limit', st2.ok === false);

// --- cleanup ---
B.s.emit('leave'); await sleep(300);
const hC = await A.call('hello', { token: hA.token, name: A.name }); // re-hello should be ignored (already joined) → returns undefined/no cb
B.s.disconnect(); A.s.disconnect();

// restore settings
await fetch(`${BASE}/admin/api/settings`, { method: 'POST', headers: { 'x-admin-key': AKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ countdownMs: 4500 }) }).catch(() => {});

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
