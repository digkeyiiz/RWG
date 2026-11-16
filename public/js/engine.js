// Engines, performance parts, the player's own tune, and the resulting power curve.
// Figures are approximate public specs of each engine — good enough for a game, not a dyno sheet.
// Everything here is pure math (no three.js) so it can be unit-tested in Node.

// ---------- cars: stock engine, weight, drivetrain, gearbox ----------
export const CAR_SPECS = {
  gen2: { engine: '1NZ-FE', mass: 1060, drive: 'FF', gears: [3.55, 1.90, 1.31, 1.03, 0.82], final: 4.31 },
  'civic-eg': { engine: 'D16Z6', mass: 980, drive: 'FF', gears: [3.25, 1.90, 1.25, 0.92, 0.73], final: 4.25 },
  'civic-fd': { engine: 'R18A', mass: 1240, drive: 'FF', gears: [3.14, 1.87, 1.24, 0.97, 0.78], final: 4.29 },
  'civic-fc': { engine: 'R18Z', mass: 1270, drive: 'FF', gears: [3.14, 1.87, 1.24, 0.97, 0.78, 0.64], final: 4.11 },
  'civic-fe': { engine: 'L15CA', mass: 1330, drive: 'FF', gears: [3.62, 2.12, 1.53, 1.13, 0.91, 0.75], final: 4.11 },
  'evo-ix': { engine: '4G63T', mass: 1400, drive: 'AWD', gears: [2.92, 1.94, 1.43, 1.10, 0.88], final: 4.53 },
  'nissan-silvia-s13': { engine: 'CA18DET', mass: 1190, drive: 'FR', gears: [3.32, 1.90, 1.31, 1.00, 0.81], final: 4.11 },
  'supra-a80': { engine: '2JZ-GTE', mass: 1490, drive: 'FR', gears: [3.83, 2.36, 1.69, 1.31, 1.00, 0.79], final: 3.27 },
  'skyline-r34': { engine: 'RB26DETT', mass: 1560, drive: 'AWD', gears: [3.83, 2.36, 1.69, 1.31, 1.00, 0.79], final: 3.54 },
  'rx7-fd': { engine: '13B-REW', mass: 1260, drive: 'FR', gears: [3.48, 2.02, 1.39, 1.00, 0.72], final: 4.10 },
  ae86: { engine: '4A-GE', mass: 940, drive: 'FR', gears: [3.59, 2.02, 1.38, 1.00, 0.86], final: 4.30 },
  'jazz-gk': { engine: 'L15Z1', mass: 1050, drive: 'FF', gears: [3.46, 1.87, 1.32, 0.97, 0.76], final: 4.62 },
  dmax: { engine: '4JJ3-TCX', mass: 1850, drive: 'FR', gears: [4.28, 2.33, 1.44, 1.00, 0.78, 0.65], final: 3.73 },
};
export const carSpec = (gen) => CAR_SPECS[gen] || CAR_SPECS.gen2;

// ---------- engines ----------
// hp@rpm and Nm@rpm are the stock peaks; redline is the stock rev limit; boost is stock psi.
export const ENGINES = [
  { id: '1NZ-FE', name: '1NZ-FE 1.5 VVT-i', make: 'Toyota', cc: 1497, cyl: 4, asp: 'na', hp: 109, hpRpm: 6000, tq: 141, tqRpm: 4200, redline: 6400, kg: 0 },
  { id: '4A-GE', name: '4A-GE 1.6 Twin-Cam 16V', make: 'Toyota', cc: 1587, cyl: 4, asp: 'na', hp: 130, hpRpm: 6600, tq: 149, tqRpm: 5200, redline: 7600, kg: 0 },
  { id: '2ZZ-GE', name: '2ZZ-GE 1.8 VVTL-i', make: 'Toyota', cc: 1796, cyl: 4, asp: 'na', hp: 190, hpRpm: 7800, tq: 180, tqRpm: 6800, redline: 8200, kg: 15 },
  { id: '3S-GTE', name: '3S-GTE 2.0 Turbo', make: 'Toyota', cc: 1998, cyl: 4, asp: 'turbo', boost: 13, hp: 245, hpRpm: 6000, tq: 304, tqRpm: 4000, redline: 7200, kg: 45 },
  { id: '1JZ-GTE', name: '1JZ-GTE 2.5 Twin Turbo', make: 'Toyota', cc: 2492, cyl: 6, asp: 'turbo', boost: 10, hp: 280, hpRpm: 6200, tq: 363, tqRpm: 4800, redline: 7200, kg: 95 },
  { id: '2JZ-GTE', name: '2JZ-GTE 3.0 Twin Turbo', make: 'Toyota', cc: 2997, cyl: 6, asp: 'turbo', boost: 12, hp: 320, hpRpm: 5600, tq: 451, tqRpm: 3600, redline: 7000, kg: 120 },
  { id: 'D16Z6', name: 'D16Z6 1.6 VTEC', make: 'Honda', cc: 1590, cyl: 4, asp: 'na', hp: 125, hpRpm: 6600, tq: 144, tqRpm: 5200, redline: 7200, kg: 0 },
  { id: 'L15Z1', name: 'L15Z1 1.5 i-VTEC', make: 'Honda', cc: 1496, cyl: 4, asp: 'na', hp: 117, hpRpm: 6600, tq: 146, tqRpm: 4700, redline: 6800, kg: 0 },
  { id: 'B16A', name: 'B16A 1.6 DOHC VTEC', make: 'Honda', cc: 1595, cyl: 4, asp: 'na', hp: 170, hpRpm: 7800, tq: 160, tqRpm: 7300, redline: 8200, kg: 10 },
  { id: 'B18C', name: 'B18C Type R 1.8', make: 'Honda', cc: 1797, cyl: 4, asp: 'na', hp: 200, hpRpm: 8000, tq: 188, tqRpm: 7500, redline: 8400, kg: 12 },
  { id: 'R18A', name: 'R18A 1.8 i-VTEC', make: 'Honda', cc: 1799, cyl: 4, asp: 'na', hp: 140, hpRpm: 6300, tq: 174, tqRpm: 4300, redline: 6800, kg: 0 },
  { id: 'R18Z', name: 'R18Z 1.8 i-VTEC', make: 'Honda', cc: 1799, cyl: 4, asp: 'na', hp: 141, hpRpm: 6500, tq: 174, tqRpm: 4300, redline: 6800, kg: 0 },
  { id: 'K20A', name: 'K20A Type R 2.0', make: 'Honda', cc: 1998, cyl: 4, asp: 'na', hp: 220, hpRpm: 8000, tq: 206, tqRpm: 7000, redline: 8600, kg: 20 },
  { id: 'K24A', name: 'K24A 2.4 i-VTEC', make: 'Honda', cc: 2354, cyl: 4, asp: 'na', hp: 205, hpRpm: 7000, tq: 232, tqRpm: 4500, redline: 7300, kg: 30 },
  { id: 'F20C', name: 'F20C 2.0 (S2000)', make: 'Honda', cc: 1997, cyl: 4, asp: 'na', hp: 250, hpRpm: 8300, tq: 218, tqRpm: 7500, redline: 9000, kg: 25 },
  { id: 'L15CA', name: 'L15CA 1.5 VTEC Turbo', make: 'Honda', cc: 1498, cyl: 4, asp: 'turbo', boost: 16, hp: 182, hpRpm: 6000, tq: 240, tqRpm: 1700, redline: 6500, kg: 0 },
  { id: 'K20C1', name: 'K20C1 2.0 Turbo (Type R)', make: 'Honda', cc: 1996, cyl: 4, asp: 'turbo', boost: 23, hp: 320, hpRpm: 6500, tq: 400, tqRpm: 2500, redline: 7000, kg: 40 },
  { id: 'CA18DET', name: 'CA18DET 1.8 Turbo', make: 'Nissan', cc: 1809, cyl: 4, asp: 'turbo', boost: 7, hp: 169, hpRpm: 6400, tq: 230, tqRpm: 4000, redline: 7000, kg: 0 },
  { id: 'SR20DET', name: 'SR20DET 2.0 Turbo', make: 'Nissan', cc: 1998, cyl: 4, asp: 'turbo', boost: 9, hp: 205, hpRpm: 6000, tq: 274, tqRpm: 4000, redline: 7500, kg: 10 },
  { id: 'RB26DETT', name: 'RB26DETT 2.6 Twin Turbo', make: 'Nissan', cc: 2568, cyl: 6, asp: 'turbo', boost: 10, hp: 280, hpRpm: 6800, tq: 392, tqRpm: 4400, redline: 8000, kg: 110 },
  { id: '4G63T', name: '4G63T 2.0 MIVEC Turbo', make: 'Mitsubishi', cc: 1997, cyl: 4, asp: 'turbo', boost: 19, hp: 280, hpRpm: 6500, tq: 400, tqRpm: 3000, redline: 7500, kg: 0 },
  { id: '13B-REW', name: '13B-REW Rotary Twin Turbo', make: 'Mazda', cc: 1308, cyl: 2, rotary: true, asp: 'turbo', boost: 10, hp: 280, hpRpm: 6500, tq: 314, tqRpm: 5000, redline: 8500, kg: -10 },
  { id: '4JJ3-TCX', name: '4JJ3-TCX 3.0 Ddi Turbo', make: 'Isuzu', cc: 2999, cyl: 4, asp: 'turbo', boost: 22, hp: 190, hpRpm: 3600, tq: 450, tqRpm: 1600, redline: 4800, kg: 60 },
];
export const engineById = (id) => ENGINES.find((e) => e.id === id) || ENGINES[0];

// ---------- parts ----------
// p = power multiplier at the top end, low = multiplier below peak torque, rev = extra redline
export const PARTS = {
  intake: { name: 'ไอดี (Intake)', opts: [
    { id: 'stock', name: 'เดิม', p: 1 }, { id: 'short', name: 'Short Ram', p: 1.02, cost: 4500 }, { id: 'cold', name: 'Cold Air', p: 1.04, cost: 9000 }] },
  exhaust: { name: 'ท่อไอเสีย', opts: [
    { id: 'stock', name: 'เดิม', p: 1 }, { id: 'catback', name: 'Cat-back', p: 1.03, cost: 12000 }, { id: 'full', name: 'ฟูลซิสเต็ม + เฮดเดอร์', p: 1.07, cost: 35000 }] },
  cam: { name: 'แคมชาฟท์', opts: [
    { id: 'stock', name: 'เดิม', p: 1, low: 1, rev: 0 }, { id: 'st1', name: 'Stage 1', p: 1.05, low: 0.98, rev: 300, cost: 18000 }, { id: 'st2', name: 'Stage 2 (แคมองศาสูง)', p: 1.11, low: 0.92, rev: 700, cost: 32000 }] },
  ecu: { name: 'กล่อง ECU', opts: [
    { id: 'stock', name: 'เดิม (จูนไม่ได้)', p: 1 }, { id: 'remap', name: 'รีแมพ', p: 1.04, cost: 15000 }, { id: 'standalone', name: 'Standalone (จูนอิสระ)', p: 1.05, cost: 45000 }] },
  turbo: { name: 'เทอร์โบ', opts: [
    { id: 'stock', name: 'เดิม', p: 1 },
    { id: 'small', name: 'ลูกเล็ก (บูสต์มาไว)', maxBoost: 16, spool: 0.45, cost: 45000 },
    { id: 'medium', name: 'ลูกกลาง', maxBoost: 24, spool: 0.58, cost: 70000 },
    { id: 'big', name: 'ลูกใหญ่ (มาท้าย แรงสุด)', maxBoost: 32, spool: 0.72, cost: 110000 }] },
  intercooler: { name: 'อินเตอร์คูลเลอร์', opts: [
    { id: 'stock', name: 'เดิม/ไม่มี', cool: 0 }, { id: 'fmic', name: 'Front Mount', cool: 1, cost: 18000 }, { id: 'race', name: 'Race (ใหญ่พิเศษ)', cool: 2, cost: 30000 }] },
  fuel: { name: 'ระบบน้ำมัน', opts: [
    { id: 'stock', name: 'เดิม', flow: 1 }, { id: 'inj', name: 'หัวฉีด + ปั๊มใหญ่', flow: 1.6, cost: 22000 }, { id: 'e85', name: 'หัวฉีดใหญ่ + E85', flow: 2.2, knock: -1, cost: 38000 }] },
  weight: { name: 'ลดน้ำหนัก', opts: [
    { id: 'stock', name: 'เดิม', kg: 0 }, { id: 'l1', name: 'ถอดเบาะหลัง/ยางอะไหล่ (-35 กก.)', kg: -35, cost: 0 },
    { id: 'l2', name: 'ฝากระโปรงคาร์บอน + แบตเล็ก (-60 กก.)', kg: -60, cost: 25000 }, { id: 'l3', name: 'โครงเรซ (-110 กก.)', kg: -110, cost: 60000 }] },
  // handling (used by the driving model: brake = decel multiplier, lat = cornering grip, lsd = traction out of corners)
  nitro: { name: 'ไนตรัส (N2O)', opts: [
    { id: 'stock', name: 'ไม่มี', nos: 0 }, { id: 'n1', name: 'ไนตรัส 50 ช็อต', nos: 0.18, cost: 28000 }, { id: 'n2', name: 'ไนตรัส 100 ช็อต (2 ถัง)', nos: 0.3, cost: 52000 }] },
  brakes: { name: 'เบรก', group: 'handling', opts: [
    { id: 'stock', name: 'เดิม', brake: 1 }, { id: 'sport', name: 'ผ้าเบรก + จานเซาะร่อง', brake: 1.1, cost: 9000 },
    { id: 'bbk', name: 'Big Brake Kit 4 pot', brake: 1.22, cost: 38000 }, { id: 'race', name: 'Race 6 pot + จานใหญ่', brake: 1.32, cost: 75000 }] },
  susp: { name: 'ช่วงล่าง', group: 'handling', opts: [
    { id: 'stock', name: 'เดิม', lat: 1, roll: 1 }, { id: 'spring', name: 'สปริงโหลด + โช้คสปอร์ต', lat: 1.05, roll: 0.8, cost: 15000 },
    { id: 'coil', name: 'โช้คสตรัทปรับเกลียว (Coilover)', lat: 1.1, roll: 0.62, cost: 42000 }, { id: 'race', name: 'ช่วงล่างเรซ + กันโคลง', lat: 1.15, roll: 0.48, cost: 90000 }] },
  lsd: { name: 'ลิมิเต็ดสลิป (LSD)', group: 'handling', opts: [
    { id: 'stock', name: 'เดิม (ไม่มี)', lsd: 1 }, { id: '1way', name: 'LSD 1-way', lsd: 1.08, cost: 28000 }, { id: '2way', name: 'LSD 2-way (ดริฟต์)', lsd: 1.12, cost: 36000 }] },
};
export const DEFAULT_TUNE = { boost: null, timing: 0, afr: 12.5, revAdd: 0, finalAdj: 0 };
export const DEFAULT_ENGINE = { swap: null, parts: { intake: 'stock', exhaust: 'stock', cam: 'stock', ecu: 'stock', turbo: 'stock', intercooler: 'stock', fuel: 'stock', weight: 'stock', nitro: 'stock', brakes: 'stock', susp: 'stock', lsd: 'stock' }, tune: { ...DEFAULT_TUNE } };

export function normalizeEngine(e) {
  const out = JSON.parse(JSON.stringify(DEFAULT_ENGINE));
  if (!e || typeof e !== 'object') return out;
  if (typeof e.swap === 'string' && ENGINES.some((x) => x.id === e.swap)) out.swap = e.swap;
  for (const k of Object.keys(out.parts)) if (PARTS[k].opts.some((o) => o.id === e.parts?.[k])) out.parts[k] = e.parts[k];
  const t = e.tune || {};
  const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  out.tune = {
    boost: t.boost === null || t.boost === undefined ? null : num(t.boost, 0, 40, null),
    timing: num(t.timing, -6, 8, 0), afr: num(t.afr, 10.5, 14.5, 12.5), revAdd: num(t.revAdd, 0, 1500, 0), finalAdj: num(t.finalAdj, -0.8, 1.2, 0),
  };
  return out;
}

const opt = (k, id) => PARTS[k].opts.find((o) => o.id === id) || PARTS[k].opts[0];
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// Base torque curve (Nm) of a stock NA-like engine shape, from idle to redline.
function baseTorque(E, rpm, redline) {
  const idle = 900, peakT = E.tqRpm, hpR = E.hpRpm;
  const tAtHp = (E.hp * 7121) / hpR; // torque at the power peak
  if (rpm <= peakT) return lerp(E.tq * 0.62, E.tq, smooth(Math.max(0, (rpm - idle) / Math.max(1, peakT - idle))));
  if (rpm <= hpR) return lerp(E.tq, tAtHp, smooth((rpm - peakT) / Math.max(1, hpR - peakT)));
  return lerp(tAtHp, tAtHp * 0.82, Math.min(1, (rpm - hpR) / Math.max(400, redline - hpR)));
}

// Full performance profile of a build: curve, peaks, limits, risk, mass, gearing.
export function computePerf(build) {
  const spec = carSpec(build.gen);
  const eng = normalizeEngine(build.engine);
  const E = engineById(eng.swap || spec.engine);
  const P = (k) => opt(k, eng.parts[k]);
  const t = eng.tune;
  const tunable = eng.parts.ecu !== 'stock';
  const cam = P('cam');
  const redline = E.redline + (cam.rev || 0) + (tunable ? Math.min(t.revAdd, 300 + (cam.rev || 0)) : 0);

  // forced induction: stock turbo, or an aftermarket kit on any engine
  const kit = P('turbo');
  const hasTurbo = E.asp === 'turbo' || kit.id !== 'stock';
  const stockBoost = E.asp === 'turbo' ? E.boost : 0;
  const maxBoost = kit.id !== 'stock' ? kit.maxBoost : (E.asp === 'turbo' ? E.boost + 6 : 0);
  const defaultBoost = kit.id !== 'stock' ? Math.round(kit.maxBoost * 0.55) : stockBoost;
  let boost = hasTurbo ? (tunable && t.boost !== null ? Math.min(t.boost, maxBoost) : defaultBoost) : 0;
  if (!tunable) boost = Math.min(boost, defaultBoost);
  const spoolFrac = kit.id !== 'stock' ? kit.spool : 0.38; // where boost arrives, fraction of redline

  // tune effects
  const timing = tunable ? t.timing : 0;
  const afr = tunable ? t.afr : 12.5;
  const timingGain = 1 + timing * 0.012;
  const afrGain = 1 - Math.abs(afr - 12.6) * 0.035; // ~12.6 makes best power
  const bolt = P('intake').p * P('exhaust').p * cam.p * P('ecu').p;

  // knock / reliability risk 0..100+
  const ic = P('intercooler').cool, fuel = P('fuel');
  const boostOverStock = Math.max(0, boost - stockBoost);
  let risk = boostOverStock * (hasTurbo && E.asp !== 'turbo' ? 3.2 : 2.6) * (1 - ic * 0.22)
    + Math.max(0, timing) * 9 + Math.max(0, afr - 12.8) * 45 + (fuel.knock || 0) * 15;
  // fuel system capacity: power beyond what injectors can feed runs lean
  const fuelCap = E.hp * 1.35 * fuel.flow;
  risk = Math.max(0, risk);

  const curve = [];
  let peakHp = 0, peakHpRpm = 0, peakTq = 0, peakTqRpm = 0;
  for (let rpm = 1000; rpm <= redline; rpm += 100) {
    let tq = baseTorque(E, rpm, E.redline + (cam.rev || 0));
    if (cam.low && rpm < E.tqRpm) tq *= cam.low;
    tq *= bolt * timingGain * afrGain;
    if (E.asp === 'turbo') tq /= 1 + stockBoost / 14.7 * 0.9; // undo stock boost → NA-equivalent base
    if (hasTurbo) {
      const on = smooth(Math.min(1, Math.max(0, (rpm / redline - spoolFrac * 0.75) / (spoolFrac * 0.5))));
      tq *= 1 + (boost / 14.7) * 0.9 * on;
    }
    let hp = (tq * rpm) / 7121;
    if (hp > fuelCap) { hp = fuelCap + (hp - fuelCap) * 0.25; tq = (hp * 7121) / rpm; }
    if (risk > 100) { const loss = Math.min(0.35, (risk - 100) / 250); tq *= 1 - loss; hp *= 1 - loss; } // knock retard
    curve.push({ rpm, hp, tq });
    if (hp > peakHp) { peakHp = hp; peakHpRpm = rpm; }
    if (tq > peakTq) { peakTq = tq; peakTqRpm = rpm; }
  }
  const fuelLimited = curve.some((c) => c.hp >= fuelCap * 0.999);
  if (fuelLimited) risk += 25;

  const mass = spec.mass + (E.kg || 0) + (P('weight').kg || 0) + (hasTurbo && E.asp !== 'turbo' ? 25 : 0);
  const final = spec.final + (tunable ? t.finalAdj : 0);
  const perf = { engine: E, eng, spec, redline, curve, peakHp, peakHpRpm, peakTq, peakTqRpm, boost, maxBoost, hasTurbo, tunable,
    risk, fuelLimited, mass, gears: spec.gears, final, drive: spec.drive, cyl: E.cyl, rotary: !!E.rotary,
    brake: P('brakes').brake, lat: P('susp').lat, roll: P('susp').roll, lsd: P('lsd').lsd, nos: P('nitro').nos };
  perf.rating = rating(perf);
  perf.torqueAt = (rpm) => {
    const r = Math.min(redline, Math.max(1000, rpm));
    const i = Math.min(curve.length - 1, Math.max(0, Math.floor((r - 1000) / 100)));
    const a = curve[i], b = curve[Math.min(curve.length - 1, i + 1)];
    return a.tq + (b.tq - a.tq) * ((r - a.rpm) / 100);
  };
  return perf;
}

// Performance index 100..999 and class (D/C/B/A/S/X) — power-to-weight, grip, brakes and drivetrain.
export function rating(perf) {
  const pw = perf.peakHp / (perf.mass / 1000); // hp per tonne
  const drive = { FF: 0.94, FR: 1, AWD: 1.08 }[perf.drive] || 1;
  const pi = Math.round(Math.min(999, Math.max(100, (pw * 1.55 + 120) * drive * (0.75 + 0.25 * perf.lat) * (0.85 + 0.15 * perf.brake) * (0.94 + 0.06 * perf.lsd))));
  const cls = pi < 300 ? 'D' : pi < 400 ? 'C' : pi < 500 ? 'B' : pi < 600 ? 'A' : pi < 750 ? 'S' : 'X';
  const color = { D: '#55b9ff', C: '#5ee08a', B: '#ffd23a', A: '#ff8a3c', S: '#ff4d6d', X: '#c56bff' }[cls];
  return { pi, cls, color };
}

// ---------- shared longitudinal model (used by the driver and the 0–100 estimate) ----------
export const WHEEL_R = 0.31;
const DRIVE_EFF = 0.85;
const TRACTION = { FF: 0.55, FR: 0.6, AWD: 0.9 }; // share of weight on driven wheels at launch (with transfer)

export function rpmFor(perf, v, gear, R = WHEEL_R) {
  return (Math.abs(v) / R) * perf.gears[gear] * perf.final * 60 / (2 * Math.PI);
}
// drive force → acceleration (m/s²) at speed v in gear and throttle, limited by tyre grip mu
export function driveForce(perf, v, gear, throttle, mu, R = WHEEL_R) {
  const rpm = Math.max(1000, rpmFor(perf, v, gear, R));
  const tq = rpm >= perf.redline ? 0 : perf.torqueAt(rpm) * throttle;
  const a = (tq * perf.gears[gear] * perf.final * DRIVE_EFF) / R / perf.mass;
  return { a: Math.min(a, mu * 9.81 * (TRACTION[perf.drive] || 0.6) * (perf.lsd || 1)), rpm };
}
// aero drag + rolling resistance (m/s², always opposing motion)
export const dragAccel = (perf, v) => (0.5 * 1.2 * 0.68 * v * v) / perf.mass + 0.15;
export function driveAccel(perf, v, gear, throttle, mu, R = WHEEL_R) {
  const f = driveForce(perf, v, gear, throttle, mu, R);
  return { a: f.a - dragAccel(perf, v), rpm: f.rpm };
}
export function bestGear(perf, v, R = WHEEL_R) {
  // highest acceleration among gears that are not above redline
  let best = 0, bestA = -1e9;
  for (let g = 0; g < perf.gears.length; g++) {
    const rpm = rpmFor(perf, v, g, R);
    if (rpm > perf.redline * 0.995) continue;
    const { a } = driveAccel(perf, v, g, 1, 9, R);
    if (a > bestA) { bestA = a; best = g; }
  }
  return best;
}
// simulate a full-throttle run: 0–100 time, top speed, quarter mile
export function simulateRun(perf, mu = 1.0) {
  let v = 0, t = 0, x = 0, gear = 0, t100 = null, q = null, top = 0;
  const dt = 0.02;
  for (let i = 0; i < 4000; i++) {
    const g = bestGear(perf, v);
    if (g !== gear) { gear = g; t += 0.25; } // shift time
    const { a } = driveAccel(perf, v, gear, 1, mu);
    v = Math.max(0, v + a * dt); x += v * dt; t += dt;
    top = Math.max(top, v);
    if (t100 === null && v >= 100 / 3.6) t100 = t;
    if (q === null && x >= 402) q = t;
    if (a < 0.02 && t > 20) break;
  }
  return { t100, quarter: q, topKmh: top * 3.6 };
}

export const EXHAUST_NAMES = {
  stock: 'ท่อเดิมเงียบ',
  sport: 'ท่อซิ่ง Sport',
  titanium: 'ท่อ Titanium',
  popbang: 'ท่อแต่ง Pop & Bang',
};

const CAR_NAMES = {
  gen1: 'Vios Gen 1 (XP40)',
  'gen1-fl': 'Soluna Vios (ไมเนอร์เชนจ์)',
  gen2: 'Vios Gen 2 (XP90)',
  'gen2-fl': 'Vios Gen 2 ไมเนอร์เชนจ์',
  gen3: 'Vios Gen 3 (XP150)',
  'gen3-fl1': 'Vios Gen 3 ไมเนอร์เชนจ์',
  'gen3-fl2': 'Vios Gen 3 ไมเนอร์เชนจ์ 2',
  gen4: 'Vios Gen 4 / Yaris ATIV',
  'civic-eg': 'Civic EG (3 ประตู)',
  'civic-ek': 'Civic EK (Ferio 2000)',
  'civic-fd': 'Civic FD (MK8 Sedan)',
  'civic-fc': 'Civic FC (Sedan)',
  'civic-fe': 'Civic FE (แฮตช์แบ็ก)',
  'evo-ix': 'Lancer Evolution IX',
  'nissan-silvia-s13': 'Nissan Silvia S13',
  'supra-a80': 'Supra MK4 (JZA80)',
  'skyline-r34': 'Skyline GT-R (BNR34)',
  'rx7-fd': 'RX-7 (FD3S)',
  ae86: 'Sprinter Trueno (AE86)',
  'jazz-gk': 'Jazz GK (Fit RS)',
  dmax: 'D-Max (สายซิ่งไทย)',
};

// Shared compact car + engine showcase summary (pure math, safe in Node & browser)
export function carShowcaseSummary(build, genObj = null) {
  const b = build || { gen: 'gen2' };
  const spec = carSpec(b.gen);
  const perf = computePerf(b);
  const run = simulateRun(perf);
  const E = perf.engine;
  const eng = perf.eng;
  const isSwapped = !!(eng.swap && eng.swap !== spec.engine);
  const mods = [];
  for (const [k, id] of Object.entries(eng.parts || {})) {
    if (!id || id === 'stock') continue;
    const p = PARTS[k];
    const opt = p?.opts?.find((o) => o.id === id);
    if (p && opt) mods.push({ key: k, part: p.name, name: opt.name, id });
  }
  const exSnd = b.kit?.exhaustSound || 'sport';
  return {
    carName: b.name || genObj?.name || CAR_NAMES[b.gen] || b.gen || 'Car',
    gen: b.gen || 'gen2',
    engineId: E.id,
    engineName: E.name,
    engineMake: E.make,
    cc: E.cc || 1497,
    liters: ((E.cc || 1497) / 1000).toFixed(1),
    cyl: E.cyl || 4,
    rotary: !!E.rotary,
    layoutText: E.rotary ? `${E.cyl || 2} โรเตอร์ Rotary` : `${E.cyl || 4} สูบ`,
    isSwapped,
    hasTurbo: perf.hasTurbo,
    boost: Math.round(perf.boost || 0),
    aspText: perf.hasTurbo ? `Turbo +${Math.round(perf.boost || 0)} PSI` : 'NA ดูดสด',
    hp: Math.round(perf.peakHp),
    hpRpm: perf.peakHpRpm,
    tq: Math.round(perf.peakTq),
    tqRpm: perf.peakTqRpm,
    redline: perf.redline,
    mass: Math.round(perf.mass),
    hpPerTon: Math.round((perf.peakHp / Math.max(0.5, perf.mass / 1000)) * 10) / 10,
    drive: perf.drive,
    pi: perf.rating.pi,
    cls: perf.rating.cls,
    color: perf.rating.color,
    t100: run.t100,
    quarter: run.quarter,
    topKmh: Math.round(run.topKmh),
    paintColor: b.paint?.color || '#888',
    paintFinish: b.paint?.finish || 'gloss',
    livery: b.paint?.livery || 'none',
    exhaustSound: exSnd,
    exhaustLabel: EXHAUST_NAMES[exSnd] || exSnd,
    rim: b.wheels?.rim || 15,
    tireWidth: b.wheels?.tireWidth || 185,
    tireAspect: b.wheels?.aspect || 60,
    tireType: b.wheels?.tireType || 'comfort',
    tireBrand: b.wheels?.tireBrand || 'oem',
    wheelBrand: b.wheels?.brand || 'oem',
    mods,
    perf,
  };
}

