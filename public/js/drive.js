// Arcade driving model + input + synthesized engine sound.
import * as THREE from 'three';
import { TIRE_BRANDS, SHOCK_TYPES, WHEEL_BRANDS } from './catalog.js';
import { rpmFor, driveForce, dragAccel, buildMu, buildCl, WHEEL_R } from './engine.js';

export class Driver {
  constructor(car, world) {
    this.car = car; this.world = world;
    this.keys = {};
    this.touch = { gas: 0, brake: 0, left: 0, right: 0, hand: 0, nos: 0, steer: 0 };
    this.wear = 0; // engine condition 0..1 — persists across respawns until repaired in the garage
    this.limit = 145; // free-drive play-area radius (no env)
    this.reset();
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat && (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyX')) this.shift(1);
      if (!e.repeat && (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyZ')) this.shift(-1);
    });
    this.setControls({});
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    this.audio = null;
    this.soundOn = false;
  }

  setEnv(env) { this.env = env; }
  // controls config from settings: { steer, trans, assist }
  setControls(c) { this.ctl = { steer: 1, trans: 'auto', assist: 1, ...c }; }

  // gamepad (standard mapping): analog steer/pedals + button edges → onPad(name)
  pad() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : null;
    const gp = gps && [...gps].find((g) => g && g.connected && g.axes.length >= 2);
    if (!gp) return null;
    const b = (i) => gp.buttons[i]?.value || 0;
    const dz = (v) => (Math.abs(v) < 0.1 ? 0 : (v - Math.sign(v) * 0.1) / 0.9);
    const prev = this.padPrev || (this.padPrev = {});
    for (const [name, i] of [['up', 5], ['down', 4], ['act', 2], ['reset', 3], ['map', 8], ['cam', 11]]) {
      const on = b(i) > 0.5;
      if (on && !prev[name]) { if (name === 'up') this.shift(1); else if (name === 'down') this.shift(-1); else this.onPad?.(name); }
      prev[name] = on;
    }
    const sx = dz(gp.axes[0] || 0);
    return { steer: Math.sign(sx) * sx * sx * 0.35 + sx * 0.65, gas: b(7), brake: b(6), hand: b(0) > 0.5 ? 1 : 0, nos: b(1) > 0.5 };
  }
  // manual gearbox
  shift(d) {
    if (this.frozen || this.ctl?.trans !== 'manual' || !this.perf) return;
    const top = this.perf.gears.length - 1;
    const g = Math.max(0, Math.min(top, this.gi + d));
    if (g !== this.gi) { this.gi = g; this.shiftT = 0.18; }
  }
  // performance profile from engine.js computePerf(build); null → old arcade model
  setPerf(perf) { this.perf = perf; if (this.gi >= perf.gears.length) this.gi = perf.gears.length - 1; }
  // garage repair — restores a worn engine to full health
  repair() { this.wear = 0; }

  reset(spawn = null) {
    this.pos = new THREE.Vector3(spawn?.x ?? 0, 0, spawn?.z ?? 0);
    this.heading = spawn?.heading ?? 0;
    this.y = spawn?.y ?? 0; this.vy = 0; this.slope = 0; this.impact = 0;
    this.vel = new THREE.Vector3();
    this.steer = 0; this.rpm = 900; this.gear = 1; this.gi = 0; this.shiftT = 0;
    this.roll = 0; this.pitch = 0; this.rollV = 0; this.pitchV = 0; this.heave = 0; this.heaveV = 0;
    this.prevVf = 0; this.r = 0; this.axS = 0;
  }

  input() {
    const gp = this.pad();
    if (this.frozen) return { gas: 0, brake: 1, left: 0, right: 0, hand: 0, steer: null };
    const k = this.keys, t = this.touch;
    const padSteer = gp && Math.abs(gp.steer) > 0.02 ? gp.steer : null;
    const touchSteer = Math.abs(t.steer || 0) > 0.02 ? t.steer : null;
    return {
      gas: Math.max(k.KeyW || k.ArrowUp ? 1 : 0, t.gas, gp?.gas || 0),
      brake: Math.max(k.KeyS || k.ArrowDown ? 1 : 0, t.brake, gp?.brake || 0),
      left: Math.max(k.KeyA || k.ArrowLeft ? 1 : 0, t.left),
      right: Math.max(k.KeyD || k.ArrowRight ? 1 : 0, t.right),
      hand: Math.max(k.Space ? 1 : 0, t.hand, gp?.hand || 0),
      nos: k.KeyN || t.nos || gp?.nos ? 1 : 0,
      steer: padSteer ?? touchSteer, // analog: -1 left … +1 right
    };
  }

  step(dt) {
    dt = Math.min(dt, 0.05);
    const P = this.car.P;
    const inp = this.input();
    const f = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const l = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)); // left
    let vf = this.vel.dot(f), vl = this.vel.dot(l);
    const speed = Math.abs(vf);
    // steering gets lighter at speed, but keeps enough authority for crisp lane changes
    const sens = this.ctl.steer;
    const maxSteer = Math.max(0.22, (0.68 / (1 + speed * 0.026 / sens)) * Math.min(1.2, sens));
    const analog = inp.steer !== null;
    const target = (analog ? -inp.steer : inp.left - inp.right) * maxSteer;
    // keyboard steering ramps in (faster when centring), analog follows the stick closely
    const rate = analog ? 22 : (Math.abs(target) < Math.abs(this.steer) ? 12 : 8.5) * sens;
    this.steer += (target - this.steer) * Math.min(1, dt * rate);
    // ================= vehicle dynamics: two-axle model with slip-angle tyre forces =================
    // tyre peak friction μ from brand, compound, width, camber, shock setup, widebody and surface
    const w = this.car.b.wheels;
    const tb = TIRE_BRANDS.find((t) => t.id === w.tireBrand) || TIRE_BRANDS[0];
    const wb = WHEEL_BRANDS.find((b) => b.id === w.brand) || WHEEL_BRANDS[0];
    const cam = Math.abs(w.camber || 0);
    // -1° to -3.5° negative camber boosts cornering grip; extreme stance trades grip for drift slip
    const camberLong = cam <= 3 ? 1 : Math.max(0.88, 1 - (cam - 3) * 0.018);
    const susp = this.car.b.suspension;
    const kit = this.car.b.kit || {};
    const surf = this.env?.surfaceMu ? this.env.surfaceMu(this.pos.x, this.pos.z, this.y) : 1;
    // perf.mu*/buildMu is the single source for tyre grip — per-axle (staggered fitment)
    // with the chassis soft cap; surface friction multiplies on top.
    const mus = this.perf?.muF != null ? { f: this.perf.muF, r: this.perf.muR, avg: this.perf.mu } : buildMu(this.car.b);
    const muF0 = mus.f * surf, muR0 = mus.r * surf;
    const mu = mus.avg * surf;
    this.grip = mu; this.surface = surf;
    const pf = this.perf, R = this.car.tire?.outerR || WHEEL_R;
    const drv = pf?.drive || 'FF';
    const m = Math.max(780, (pf?.mass || 1100) + (wb.kg || 0)), WB = P.gen.dims.WB, g = 9.81;
    const frontShare = ({ FF: 0.61, FR: 0.53, AWD: 0.58 }[drv] ?? 0.6) + (pf?.frontBias || 0);
    const a_ = WB * (1 - frontShare), b_ = WB * frontShare; // CG → front axle, CG → rear axle
    const hcg = Math.max(0.38, 0.53 - (susp.drop || 0) / 1000);
    const Iz = m * a_ * b_ * 1.12;
    const assist = this.ctl.assist;
    const delta = this.steer;
    // ---- gearbox / engine (automatic or manual) ----
    let Fdrive = 0, Fbrake = 0, reverse = false, rpmNow = 900, jerk = 0;
    if (pf) {
      this.shiftT = Math.max(0, this.shiftT - dt);
      const top = pf.gears.length - 1;
      if (this.gi > top) this.gi = top;
      rpmNow = rpmFor(pf, vf, this.gi, R);
      const prevGi = this.gi;
      if (this.ctl.trans !== 'manual') {
        const shK = pf.clutch?.shift || 1;
        if (inp.gas && vf > 0 && rpmNow > pf.redline * 0.97 && this.gi < top) { this.gi++; this.shiftT = 0.22 * shK; }
        else if (this.gi > 0 && rpmNow < Math.max(1900, pf.peakTqRpm * 0.5) && rpmFor(pf, vf, this.gi - 1, R) < pf.redline * 0.85) { this.gi--; this.shiftT = 0.12 * shK; }
      }
      const exSnd = this.car.b?.kit?.exhaustSound || 'sport';
      if (this.gi > prevGi && (exSnd === 'titanium' || exSnd === 'popbang')) {
        this.onBackfire?.(1.1);
        this.playPop(exSnd === 'popbang');
      }
      if (this._prevGas && !inp.gas && this.rpm > 4200 && (exSnd === 'popbang' || (exSnd === 'titanium' && Math.random() < 0.5))) {
        this.onBackfire?.(1.2);
        this.playPop(exSnd === 'popbang');
        if ((pf.boost || pf.turbo || 0) > 0 || pf.hasTurbo) this.playBov();
      }
      this._prevGas = !!inp.gas;
      this.burnout = !!(inp.gas && (inp.hand || (inp.brake && vf > -0.5)) && speed < 12);
      const limiter = rpmNow >= pf.redline;
      const thr = this.shiftT > 0 ? 0 : inp.gas;
      // a race clutch bangs shifts home fast but shudders off the line
      jerk = pf.clutch?.jerk || 0;
      if (inp.gas && vf < -0.5) Fbrake = 9 * m; // gas while rolling backwards = brake
      else if (inp.gas && !limiter) Fdrive = driveForce(pf, Math.max(0, vf), this.gi, thr, 50, R).a * m;
      if (!inp.gas && vf > 0.5) Fdrive -= m * (0.35 + (rpmNow / pf.redline) * 0.6); // engine braking
      // nitrous adds power (P = F·v) while held; the tank lasts ~6 s and refills smoothly
      this.nos = this.nos ?? 1;
      this.nosOn = !!(inp.nos && pf.nos && this.nos > 0.01 && inp.gas && vf > 2);
      if (this.nosOn) { Fdrive += (pf.peakHp * pf.nos * 745.7) / Math.max(vf, 12); this.nos = Math.max(0, this.nos - dt / 6); }
      else if (pf.nos) this.nos = Math.min(1, this.nos + dt / 20);
      // engine wear: sustained high-rpm running on a knock-risky tune grinds the motor down.
      // Parts are free — durability is the real price of an aggressive build.
      if (pf.risk > 100 && inp.gas > 0.3 && rpmNow > pf.redline * 0.8) {
        const w0 = this.wear;
        this.wear = Math.min(1, this.wear + dt * ((pf.risk - 100) / 50) * 0.01 * (this.nosOn ? 1.6 : 1));
        if (w0 < 0.5 && this.wear >= 0.5) this.car.onNotice?.('⚠️ เครื่องยนต์เริ่มสึก — แรงม้าหาย ควรเข้าอู่ซ่อม');
        else if (w0 < 0.9 && this.wear >= 0.9) this.car.onNotice?.('🔥 เครื่องยนต์สึกหนัก! กำลังหายมาก — ซ่อมด่วน');
      }
    } else if (inp.gas) Fdrive = m * 3.4 * (1 - Math.min(1, speed / 52));
    if (Fdrive > 0) Fdrive *= 1 - 0.35 * (this.wear || 0); // a worn engine loses power
    if (inp.brake) { if (vf > 0.5) Fbrake = 9.6 * m * (pf?.brake || 1); else { reverse = true; Fdrive = -m * 2.8 * (1 - Math.min(1, speed / 12)); } }
    // toe scrubs a little straight-line speed: toe-out front / toe-in rear both add drag
    const toeDrag = pf?.toe ? 1 + (Math.abs(pf.toe.f) + Math.abs(pf.toe.r)) * 0.03 : 1;
    // slipstream: tucked in behind a peer's wake at speed → up to 40% less drag (set per frame from net play)
    const draftCut = 1 - 0.4 * (this.draft || 0);
    const drag = (pf ? m * dragAccel(pf, speed) : m * (0.012 * speed * speed + 0.25)) * toeDrag * draftCut;
    const cl = pf?.cl ?? buildCl(kit);
    // ---- integrate in small sub-steps (tyre forces are stiff) ----
    let vx = vf, vy = vl, r = this.r ?? 0;
    const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
    let spinMax = 0, slipMax = 0, Fx = 0;
    // Pacejka "magic formula"; the rears are a bit stiffer than the fronts (every road car is set up to understeer slightly)
    const MF = (alpha, cap, B) => { const C = 1.45, E = 0.35, x = B * alpha; return cap * Math.sin(C * Math.atan(x - E * (x - Math.atan(x)))); };
    for (let k = 0; k < n; k++) {
      // vertical loads: static split + longitudinal weight transfer + aero downforce
      const down = 0.5 * 1.2 * cl * 2.0 * vx * vx;
      const tr = (m * (this.axS || 0) * hcg) / WB;
      const Fzf = Math.max(0.15 * m * g, (m * g * b_) / WB - tr + down * 0.45);
      const Fzr = Math.max(0.15 * m * g, (m * g * a_) / WB + tr + down * 0.55);
      // load sensitivity: a heavily loaded axle gets a little less grip per kg
      // ARB balance: a stiffer bar shifts cornering load to that axle → it gives up peak grip.
      // The net grip roughly cancels — it's a balance/feel tool, not free performance.
      const arbD = ((pf?.arb?.f ?? 0.5) - (pf?.arb?.r ?? 0.5)) * 0.1;
      const muF = muF0 * (1.06 - 0.06 * Fzf / (m * g * 0.5)) * (pf?.lat || 1) * (1 - arbD);
      const muR = muR0 * (1.06 - 0.06 * Fzr / (m * g * 0.5)) * (pf?.lat || 1) * (1 + arbD);
      let capF = muF * Fzf * camberLong, capR = muR * Fzr * camberLong;
      // longitudinal forces per axle
      const split = drv === 'FF' ? [1, 0] : drv === 'FR' ? [0, 1] : [0.42, 0.58];
      const dif = 0.9 * (pf?.lsd || 1); // open diff wastes the inside wheel; an LSD gets more down
      let FxF = Fdrive * split[0], FxR = Fdrive * split[1];
      const capDF = capF * (split[0] ? dif : 1);
      // decel-locking diffs (2-way / welded) loosen the rear under braking → rotation on
      // entry, at the cost of stability; a hard clutch makes a standing launch harder too
      const capDR = capR * (split[1] ? dif : 1) * (Fbrake > 0 ? 1 - 0.35 * (pf?.decel || 0) : 1) * (vx < 4 ? 1 - jerk * 0.3 : 1);
      // traction control (assist): no more torque than the driven tyres can take
      if (assist > 0.5) { FxF = Math.min(FxF, capDF * 1.02); FxR = Math.min(FxR, capDR * 1.02); }
      const sgn = Math.sign(vx) || 1;
      const bias = pf?.brakeBias ?? 0.66; // more rear bias = rotate on entry but easy to lock
      FxF -= Fbrake * bias * sgn; FxR -= Fbrake * (1 - bias) * sgn;
      if (inp.hand && Math.abs(vx) > 1) FxR = -capR * 0.85 * sgn; // handbrake locks the rears
      const spinF = Math.max(0, Math.abs(FxF) / capDF - 1), spinR = Math.max(0, Math.abs(FxR) / capDR - 1);
      spinMax = Math.max(spinMax, split[0] ? spinF : 0, split[1] ? spinR : 0);
      FxF = THREE.MathUtils.clamp(FxF, -capDF, capDF); FxR = THREE.MathUtils.clamp(FxR, -capDR, capDR);
      if (vx > 3.5) {
        // a wheel that spins or locks has less sideways grip left (friction circle, tuned for responsive cornering)
        const latF = Math.sqrt(Math.max(0.18, 1 - 0.55 * (FxF / capF) ** 2)) / (1 + spinF * 1.4);
        const latR = Math.sqrt(Math.max(0.16, 1 - 0.6 * (FxR / capR) ** 2)) / (1 + spinR * 2.0) * (inp.hand && Math.abs(vx) > 1 ? 0.3 : 1);
        // slip angles — front toe-out sharpens initial turn-in, rear toe-in damps the tail
        const vxs = Math.max(Math.abs(vx), 3.5);
        const deltaEff = delta * (1 + Math.max(0, pf?.toe?.f || 0) * 0.25);
        const af = Math.atan2(vy + a_ * r, vxs) - deltaEff;
        const ar = Math.atan2(vy - b_ * r, vxs) + (pf?.toe?.r || 0) * 0.008;
        const FyF = -MF(af, capF, 9.2) * latF, FyR = -MF(ar, capR, 11.2) * latR;
        slipMax = Math.max(slipMax, Math.abs(af) * (spinF > 0 ? 1.5 : 1), Math.abs(ar) * (1 + spinR));
        const cd = Math.cos(delta), sd = Math.sin(delta);
        Fx = FxF * cd - FyF * sd + FxR - drag * sgn;
        const Fy = FxF * sd + FyF * cd + FyR;
        const Mz = a_ * (FxF * sd + FyF * cd) - b_ * FyR;
        this.latA = Fy / m;
        vx += (Fx / m + vy * r) * h;
        vy += (Fy / m - vx * r) * h;
        r += (Mz / Iz) * h;
        // stability control (assist): trim excessive oversteer without killing cornering agility
        if (!inp.hand && assist > 0) {
          const rMax = (muR * g * 1.32) / vx;
          if (Math.abs(r) > rMax) r -= (r - Math.sign(r) * rMax) * Math.min(1, assist * 5 * h);
          const beta = Math.atan2(vy, vx), bMax = 0.14 + (1 - assist) * 0.28;
          if (Math.abs(beta) > bMax) vy -= (vy - Math.sign(vy) * Math.tan(bMax) * vx) * Math.min(1, assist * 3 * h);
        }
      } else {
        // slow / reversing: kinematic bicycle (no phantom Pacejka drag stalling acceleration from standstill)
        const scrub = Math.abs(delta) * 0.08 * Math.abs(FxF + FxR);
        Fx = FxF + FxR - drag * sgn - scrub * sgn;
        this.latA = vx * r;
        vx += (Fx / m) * h;
        if (reverse) vx = Math.max(vx, -8);
        const kin = (vx / WB) * Math.tan(delta);
        r += (kin - r) * Math.min(1, h * 24);
        vy *= 1 - Math.min(1, h * 12);
      }
      this.heading += r * h;
      this.axS = THREE.MathUtils.lerp(this.axS || 0, Fx / m, Math.min(1, h * 12));
    }
    if (!inp.gas && !inp.brake && Math.abs(vx) < 0.3) { vx = 0; vy *= 0.5; r *= 0.5; }
    this.r = r; this.spin = spinMax;
    this.slide = Math.min(1, Math.max(0, slipMax - 0.09) * 5 + (spinMax > 0.25 ? 0.3 : 0));
    vf = vx; vl = vy;
    const yawRate = r;
    const f2 = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const l2 = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.vel.copy(f2).multiplyScalar(vf).addScaledVector(l2, vl);
    this.pos.addScaledVector(this.vel, dt);
    const env = this.env;
    if (env) {
      // collisions: 3 circles along the car vs static colliders and traffic
      let pdx = 0, pdz = 0, nx = 0, nz = 0, hit = false;
      for (const o of [-1.5, 0, 1.5]) {
        const cx = this.pos.x + f2.x * o + pdx, cz = this.pos.z + f2.z * o + pdz;
        for (const res of [env.colliders.resolve(cx, cz, 0.9, this.y), env.traffic ? env.traffic.collide(cx, cz, 0.9, this.y) : null, env.peers ? env.peers.collide(cx, cz, 0.9, this.y) : null, env.bots ? env.bots.collide(cx, cz, 0.9, this.y) : null, env.cops ? env.cops.collide(cx, cz, 0.9, this.y) : null]) {
          if (res?.hit) { pdx += res.dx; pdz += res.dz; nx += res.nx; nz += res.nz; hit = true; }
        }
      }
      if (hit) {
        this.pos.x += pdx; this.pos.z += pdz;
        const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) { this.vel.x -= nx * vn * 1.3; this.vel.z -= nz * vn * 1.3; this.impact = Math.max(this.impact, -vn); }
        this.vel.multiplyScalar(0.985);
      }
      // ground / decks / ramps
      const h = env.surfaces.heightAt(this.pos.x, this.pos.z, this.y);
      if (h >= this.y - 0.1) { this.y = h; this.vy = 0; }
      else { this.vy -= 9.8 * dt; this.y = Math.max(h, this.y + this.vy * dt); if (this.y === h) this.vy = 0; }
      const hf = env.surfaces.heightAt(this.pos.x + f2.x * 1.3, this.pos.z + f2.z * 1.3, this.y);
      const hr = env.surfaces.heightAt(this.pos.x - f2.x * 1.3, this.pos.z - f2.z * 1.3, this.y);
      const slopeT = this.vy === 0 ? Math.atan2(hf - hr, 2.6) : this.slope;
      this.slope += (slopeT - this.slope) * Math.min(1, dt * 10);
      // gravity along the slope
      const g = -9.8 * Math.sin(this.slope) * dt;
      this.vel.addScaledVector(f2, g);
      this.impact *= Math.exp(-4 * dt);
    } else {
      const lim = this.limit || 145;
      if (this.pos.length() > lim) { this.pos.setLength(lim); this.vel.multiplyScalar(-0.3); }
    }
    // body motion: spring-damper driven by shock settings
    const accel = (vf - this.prevVf) / dt;
    this.prevVf = vf;
    const latA = vf * yawRate;
    const sus = this.car.b.suspension;
    const sh = SHOCK_TYPES.find((s) => s.id === sus.type) || SHOCK_TYPES[0];
    const spring = sus.spring ?? sh.spring;
    const damping = sus.damping ?? sh.damping;
    const k = 18 + spring * 14;                       // spring stiffness (spring rate kg/mm)
    const c = 2 + damping * 0.55;                     // damping (clicks)
    const lowCg = 1 - (sus.drop || 0) / 400;          // lower car = less roll
    const soft = (tb.comfort || 1) * lowCg;
    const rollT = THREE.MathUtils.clamp(latA * 0.45 * soft * (pf?.roll ?? 1) / k, -0.08, 0.08);
    const pitchT = THREE.MathUtils.clamp(accel * 0.25 * soft / k, -0.04, 0.04);
    this.rollV += (k * (rollT - this.roll) - c * this.rollV) * dt;
    this.roll += this.rollV * dt;
    this.pitchV += (k * (pitchT - this.pitch) - c * this.pitchV) * dt;
    this.pitch += this.pitchV * dt;
    // small road texture bumps → heave
    const bump = speed > 1 ? (Math.sin(this.pos.x * 1.7) * Math.sin(this.pos.z * 1.3)) * 0.004 * Math.min(1, speed / 20) / Math.sqrt(spring / 2.5) : 0;
    this.heaveV += (k * (bump - this.heave) - c * this.heaveV) * dt;
    this.heave += this.heaveV * dt;
    this.car._heave = this.heave;
    // place car
    this.car.root.position.set(this.pos.x, this.y || 0, this.pos.z);
    this.car.root.rotation.order = 'YXZ';
    this.car.root.rotation.set(0, this.heading, this.slope || 0);
    this.car.animate(this.steer, (vf * dt) / R, this.roll, this.pitch);
    // gears & rpm
    const kmh = speed * 3.6;
    if (pf) {
      this.gear = vf < -0.1 ? 'R' : this.gi + 1;
      // clutch slip at launch keeps the engine near its torque band
      const wheelRpm = rpmFor(pf, vf, vf < -0.1 ? 0 : this.gi, R);
      const target = Math.min(pf.redline, Math.max(900 + (inp.gas ? Math.min(pf.peakTqRpm * 0.7, 3500) * (1 - Math.min(1, speed / 6)) : 0), wheelRpm));
      this.rpm = THREE.MathUtils.lerp(this.rpm, target, Math.min(1, dt * 10));
    } else {
      const shifts = [0, 25, 50, 80, 115, 999];
      this.gear = vf < -0.1 ? 'R' : Math.max(1, shifts.findIndex((s) => kmh < s));
      const g = typeof this.gear === 'number' ? this.gear : 1;
      const lo = shifts[g - 1], hi = shifts[g] === 999 ? 190 : shifts[g];
      const t = (kmh - lo) / (hi - lo);
      this.rpm = THREE.MathUtils.lerp(this.rpm, 900 + Math.max(0, t) * 5200 + (inp.gas ? 600 : 0), Math.min(1, dt * 6));
    }
    if (!this.env) this.cones(dt);
    this.updateSound(inp.gas);
    return { kmh, gear: this.gear, rpm: this.rpm, redline: pf ? pf.redline : 7000, nos: pf?.nos ? this.nos : null, nosOn: this.nosOn, wear: this.wear, draft: this.draft || 0 };
  }

  cones(dt) {
    const px = this.pos.x, pz = this.pos.z;
    const spd = this.vel.length();
    for (const c of this.world.cones) {
      const dx = c.position.x - px, dz = c.position.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.3 && spd > 0.5) {
        const inv = 1 / (dist || 1);
        c.userData.vel.set(this.vel.x * 1.2 + dx * inv * 2, 0, this.vel.z * 1.2 + dz * inv * 2);
        c.userData.spin = 6;
      }
      if (c.userData.vel.lengthSq() > 0.001) {
        c.position.addScaledVector(c.userData.vel, dt);
        c.userData.vel.multiplyScalar(Math.exp(-2.5 * dt));
        c.rotation.x = Math.min(Math.PI / 2, c.rotation.x + (c.userData.spin || 0) * dt);
      }
    }
  }

  resetCones() {
    for (const c of this.world.cones) { c.position.copy(c.userData.home); c.rotation.set(0, 0, 0); c.userData.vel.set(0, 0, 0); }
  }

  // ---------- engine sound (WebAudio, no files) ----------
  toggleSound() {
    this.soundOn = !this.soundOn;
    if (this.soundOn && !this.audio) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
      const osc2 = ctx.createOscillator(); osc2.type = 'square';
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600; filter.Q.value = 4;
      const gain = ctx.createGain(); gain.gain.value = 0;
      osc1.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      osc1.start(); osc2.start();
      // turbo spool whistle
      const turboOsc = ctx.createOscillator(); turboOsc.type = 'sine'; turboOsc.frequency.value = 2200;
      const turboGain = ctx.createGain(); turboGain.gain.value = 0;
      turboOsc.connect(turboGain); turboGain.connect(ctx.destination);
      turboOsc.start();
      // tyre screech + N2O jet: looping noise through filters
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 6;
      const sq = ctx.createGain(); sq.gain.value = 0;
      noise.connect(bp); bp.connect(sq); sq.connect(ctx.destination);
      const nosBp = ctx.createBiquadFilter(); nosBp.type = 'bandpass'; nosBp.frequency.value = 900; nosBp.Q.value = 1.4;
      const nosGain = ctx.createGain(); nosGain.gain.value = 0;
      noise.connect(nosBp); nosBp.connect(nosGain); nosGain.connect(ctx.destination);
      noise.start();
      this.audio = { ctx, osc1, osc2, filter, gain, sq, bp, turboOsc, turboGain, nosGain };
    }
    if (this.audio) {
      if (this.soundOn) this.audio.ctx.resume();
      else {
        this.audio.gain.gain.value = 0;
        this.audio.sq.gain.value = 0;
        this.audio.turboGain.gain.value = 0;
        this.audio.nosGain.gain.value = 0;
      }
    }
    return this.soundOn;
  }

  updateSound(throttle) {
    if (!this.audio || !this.soundOn) return;
    const { ctx, osc1, osc2, filter, gain, turboOsc, turboGain, nosGain } = this.audio;
    const exSnd = this.car.b?.kit?.exhaustSound || 'sport';
    const loud = exSnd === 'stock' ? 0.05 : exSnd === 'sport' ? 0.10 : 0.14;
    // firing frequency: cylinders/2 pulses per rev (4-cyl = 2, 6-cyl = 3); a rotary fires twice per rev
    const fire = this.perf ? (this.perf.rotary ? 2 : this.perf.cyl / 2) : 2;
    const f = this.rpm / 60 * fire;
    osc1.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
    osc2.frequency.setTargetAtTime(f / 2, ctx.currentTime, 0.05);
    const bright = exSnd === 'titanium' || exSnd === 'popbang' ? 500 : 280;
    filter.frequency.setTargetAtTime(bright + this.rpm * 0.28 + (throttle ? 440 : 0), ctx.currentTime, 0.05);
    gain.gain.setTargetAtTime(loud * (throttle ? 1 : 0.55), ctx.currentTime, 0.08);
    // turbo spool
    const hasTurbo = (this.perf?.boost || this.perf?.turbo || 0) > 0 || !!this.perf?.hasTurbo;
    const spool = hasTurbo && throttle ? Math.max(0, (this.rpm - 2400) / 5000) : 0;
    turboOsc.frequency.setTargetAtTime(2100 + spool * 2300, ctx.currentTime, 0.08);
    turboGain.gain.setTargetAtTime(spool * 0.018, ctx.currentTime, 0.08);
    // N2O whoosh
    nosGain.gain.setTargetAtTime(this.nosOn ? 0.085 : 0, ctx.currentTime, 0.04);
    // tyre screech
    const sl = this.vel.length() > 3 || this.burnout ? this.slide || (this.burnout ? 0.6 : 0) : 0;
    this.audio.sq.gain.setTargetAtTime(sl > 0.18 ? Math.min(0.09, (sl - 0.18) * 0.16) : 0, ctx.currentTime, 0.06);
    this.audio.bp.frequency.setTargetAtTime(1100 + sl * 700, ctx.currentTime, 0.1);
    if (this.nosOn) filter.frequency.setTargetAtTime(1850, ctx.currentTime, 0.05);
    if (this.impact > 2.0 && (!this._impT || ctx.currentTime - this._impT > 0.18)) {
      this._impT = ctx.currentTime;
      this.playImpact(Math.min(1, this.impact / 12));
    }
  }
  playImpact(strength = 0.5) {
    if (!this.audio || !this.soundOn) return;
    const { ctx } = this.audio;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(95, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 0.14);
    g.gain.setValueAtTime(0.16 * strength, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.16);
  }
  playPop(double = false) {
    if (!this.audio || !this.soundOn) return;
    const { ctx } = this.audio;
    const burst = (delay) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(140, ctx.currentTime + delay);
      o.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + delay + 0.09);
      g.gain.setValueAtTime(0.18, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.1);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.11);
    };
    burst(0);
    if (double) burst(0.09);
  }
  playBov() {
    if (!this.audio || !this.soundOn) return;
    const { ctx } = this.audio;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.22), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 3;
    const g = ctx.createGain(); g.gain.value = 0.09;
    src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start();
  }
  playHorn() {
    try {
      const ctx = this.audio?.ctx || this._hornCtx || (this._hornCtx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === 'suspended') ctx.resume();
      for (const freq of [420, 525]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = freq;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
        g.gain.setValueAtTime(0.001, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.02);
        g.gain.setValueAtTime(0.08, ctx.currentTime + 0.18);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
        o.connect(f); f.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.25);
      }
    } catch {}
  }
  playSampleRev(perf, exhaustSound = 'sport', vol = 0.85) {
    try {
      const ctx = this.audio?.ctx || this._hornCtx || (this._hornCtx = new (window.AudioContext || window.webkitAudioContext)());
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const v = Math.max(0.05, Math.min(1.2, Number(vol) || 0.85));
      const fire = perf ? (perf.rotary ? 2 : (perf.cyl || 4) / 2) : 2;
      const redline = Math.min(11500, Math.max(5500, perf?.redline || 7000));
      const fIdle = (950 / 60) * fire;
      const fPeak = ((redline * 0.94) / 60) * fire;
      const fBounce = ((redline * 0.88) / 60) * fire;
      const fEnd = (1050 / 60) * fire;
      const t0 = ctx.currentTime;

      const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
      const osc2 = ctx.createOscillator(); osc2.type = 'square';
      const setCurve = (param, mult) => {
        param.setValueAtTime(fIdle * mult, t0);
        param.linearRampToValueAtTime(Math.max(12, fIdle * mult * 1.45), t0 + 0.05);
        param.exponentialRampToValueAtTime(Math.max(20, fPeak * mult), t0 + 0.45);
        param.linearRampToValueAtTime(Math.max(20, fBounce * mult), t0 + 0.54);
        param.exponentialRampToValueAtTime(Math.max(20, fPeak * mult * 1.01), t0 + 0.68);
        param.exponentialRampToValueAtTime(Math.max(15, fEnd * mult), t0 + 1.2);
      };
      setCurve(osc1.frequency, 1);
      setCurve(osc2.frequency, 0.5);

      const bright = exhaustSound === 'titanium' || exhaustSound === 'popbang' ? 1650 : exhaustSound === 'sport' ? 1150 : 760;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = exhaustSound === 'titanium' || exhaustSound === 'popbang' ? 5 : 3.5;
      filter.frequency.setValueAtTime(360, t0);
      filter.frequency.exponentialRampToValueAtTime(bright + redline * 0.16, t0 + 0.48);
      filter.frequency.exponentialRampToValueAtTime(bright + redline * 0.15, t0 + 0.68);
      filter.frequency.exponentialRampToValueAtTime(420, t0 + 1.2);

      const baseLoud = exhaustSound === 'stock' ? 0.08 : exhaustSound === 'sport' ? 0.13 : 0.17;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(baseLoud * v, t0 + 0.06);
      gain.gain.setValueAtTime(baseLoud * v, t0 + 0.66);
      gain.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.22);

      osc1.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      osc1.start(t0); osc2.start(t0);
      osc1.stop(t0 + 1.25); osc2.stop(t0 + 1.25);

      const hasTurbo = (perf?.boost || perf?.turbo || 0) > 0 || !!perf?.hasTurbo;
      if (hasTurbo) {
        const to = ctx.createOscillator(), tg = ctx.createGain();
        to.type = 'sine';
        to.frequency.setValueAtTime(1950, t0 + 0.1);
        to.frequency.exponentialRampToValueAtTime(4300, t0 + 0.64);
        tg.gain.setValueAtTime(0.0001, t0 + 0.1);
        tg.gain.linearRampToValueAtTime(0.024 * v, t0 + 0.42);
        tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.72);
        to.connect(tg); tg.connect(ctx.destination);
        to.start(t0 + 0.1); to.stop(t0 + 0.74);

        const len = Math.floor(ctx.sampleRate * 0.24);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2650; bp.Q.value = 3;
        const bg = ctx.createGain(); bg.gain.value = 0.075 * v;
        src.connect(bp); bp.connect(bg); bg.connect(ctx.destination);
        src.start(t0 + 0.68);
      }

      if (exhaustSound === 'popbang' || exhaustSound === 'titanium') {
        const pops = exhaustSound === 'popbang' ? [0.71, 0.83, 0.96] : [0.73, 0.86];
        for (const delay of pops) {
          const po = ctx.createOscillator(), pg = ctx.createGain();
          po.type = 'sawtooth';
          po.frequency.setValueAtTime(155, t0 + delay);
          po.frequency.exponentialRampToValueAtTime(42, t0 + delay + 0.09);
          pg.gain.setValueAtTime(0.15 * v, t0 + delay);
          pg.gain.exponentialRampToValueAtTime(0.0005, t0 + delay + 0.1);
          po.connect(pg); pg.connect(ctx.destination);
          po.start(t0 + delay); po.stop(t0 + delay + 0.11);
        }
      }
    } catch {}
  }
}
