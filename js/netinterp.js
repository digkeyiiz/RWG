// Remote-car interpolation — pure math, no three.js (validated by tools/netinterp-check.mjs).
//
// Three ideas that together make remote cars glide instead of stutter:
//   1. adaptive jitter buffer — the render delay follows each peer's measured packet
//      interval + jitter instead of a fixed 120 ms (a fixed buffer is what starves and
//      causes the extrapolate→snap-back stutter)
//   2. Hermite position curve — positions follow a smooth spline whose tangents are the
//      peer's estimated velocity, so cornering is a curve, not a polygon of lerps
//   3. error decay — any residual offset between the last rendered pose and the new
//      target relaxes exponentially, so mode switches and packet gaps never snap visibly
const MIN_DELAY = 0.10, MAX_DELAY = 0.32;
const unwrap = (a, ref) => ref + Math.atan2(Math.sin(a - ref), Math.cos(a - ref));

export class PeerInterp {
  constructor() {
    this.snaps = [];         // { t: arrival seconds, s: [x,y,z,h,slope,steer,vf,roll,pitch,inCity] }
    this.meanI = 1 / 15;     // EMA of inter-arrival interval (starts at the nominal send rate)
    this.jit = 0.015;        // EMA of |interval - mean|
    this.lastT = 0;
    this.prevR = null;       // last rendered pose — the error-decay residual lives here
  }

  push(t, s) {
    const d = t - this.lastT;
    if (this.lastT && d > 0.005 && d < 1.5) { // keep-alive gaps must not poison the stats
      this.meanI += (d - this.meanI) * 0.12;
      this.jit += (Math.abs(d - this.meanI) - this.jit) * 0.12;
    }
    this.lastT = t;
    this.snaps.push({ t, s });
    if (this.snaps.length > 30) this.snaps.splice(0, this.snaps.length - 30);
  }

  // render delay: ~1.4 packet intervals of buffer + jitter cover
  delay() { return Math.min(MAX_DELAY, Math.max(MIN_DELAY, this.meanI * 1.35 + this.jit * 2)); }

  // velocity tangent at snapshot i, Catmull-Rom style, from the surrounding snapshots
  tangentAt(i) {
    const sn = this.snaps;
    const a = sn[Math.max(0, i - 1)], b = sn[Math.min(sn.length - 1, i + 1)];
    const dt = Math.max(1e-3, b.t - a.t);
    return { x: (b.s[0] - a.s[0]) / dt, z: (b.s[2] - a.s[2]) / dt, w: (unwrap(b.s[3], a.s[3]) - a.s[3]) / dt };
  }

  // Smoothed remote pose at wall-clock `now` (seconds) for a frame of `dt` seconds.
  // Returns { x,y,z,h, slope, steer, vf, roll, pitch, extrapolating } or null when no data.
  eval(now, dt) {
    const sn = this.snaps;
    if (!sn.length) return null;
    const renderT = now - this.delay();
    let a = sn[0], b = sn[sn.length - 1];
    for (let i = sn.length - 1; i > 0; i--) if (sn[i - 1].t <= renderT) { a = sn[i - 1]; b = sn[i]; break; }
    const ab = Math.max(1e-3, b.t - a.t);
    const t = Math.min(1, Math.max(0, (renderT - a.t) / ab));
    const A = a.s, B = b.s;
    const iA = sn.indexOf(a), iB = sn.indexOf(b);
    const vA = this.tangentAt(iA), vB = this.tangentAt(iB);
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    let x = h00 * A[0] + h10 * vA.x * ab + h01 * B[0] + h11 * vB.x * ab;
    let z = h00 * A[2] + h10 * vA.z * ab + h01 * B[2] + h11 * vB.z * ab;
    const B3u = unwrap(B[3], A[3]);
    let h = h00 * A[3] + h10 * vA.w * ab + h01 * B3u + h11 * vB.w * ab;
    let y = A[1] + (B[1] - A[1]) * t;
    const L = (k) => A[k] + (B[k] - A[k]) * t;
    let extrapolating = false;
    if (renderT > b.t) {
      // past the newest packet — glide on the estimated velocity instead of a straight heading
      extrapolating = true;
      const ex = Math.min(0.3, renderT - b.t);
      x += vB.x * ex; z += vB.z * ex; h += vB.w * ex;
    }
    if (this.prevR) {
      // error decay — blend time scales with the residual: small drift settles fast,
      // a post-gap jump eases in over a beat instead of teleporting
      const res = Math.hypot(this.prevR.x - x, this.prevR.z - z);
      const tau = Math.min(0.22, 0.07 + res * 0.014);
      const k = Math.exp(-(dt || 0.016) / tau);
      x += (this.prevR.x - x) * k;
      y += (this.prevR.y - y) * k;
      z += (this.prevR.z - z) * k;
      h += (unwrap(this.prevR.h, h) - h) * k;
    }
    this.prevR = { x, y, z, h };
    return { x, y, z, h, slope: L(4), steer: L(5), vf: L(6), roll: L(7), pitch: L(8), extrapolating };
  }
}
