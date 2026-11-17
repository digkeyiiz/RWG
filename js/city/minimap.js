// Heading-up minimap rendered on a 2D canvas (Bangkok Expressway / Motorway edition).
import { LAYOUT } from './city.js';

const WORLD = 3300, RES = 2048;
const toPx = (v) => ((v + WORLD / 2) / WORLD) * RES;

export class Minimap {
  constructor(canvas, city) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.city = city;
    const base = document.createElement('canvas'); base.width = base.height = RES;
    const g = base.getContext('2d');
    g.fillStyle = '#2d3b2b'; g.fillRect(0, 0, RES, RES);
    const rect = (x0, z0, x1, z1, c) => { g.fillStyle = c; g.fillRect(toPx(x0), toPx(z0), toPx(x1) - toPx(x0), toPx(z1) - toPx(z0)); };
    rect(-380, -380, 380, 380, '#3a3d42');
    rect(380, -260, 545, 260, '#3a3d42');
    rect(545, -600, 600, 600, '#1d3d55');
    const L = LAYOUT;
    for (let bi = 0; bi < L.N; bi++) for (let bj = 0; bj < L.N; bj++) {
      rect(L.c[bi] + L.w[bi] / 2, L.c[bj] + L.w[bj] / 2, L.c[bi + 1] - L.w[bi + 1] / 2, L.c[bj + 1] - L.w[bj + 1] / 2, (bi === 1 && bj === 6) || (bi === 7 && bj === 2) ? '#3f5a35' : '#23262b');
    }
    for (let i = 0; i <= L.N; i++) {
      g.fillStyle = L.main[i] ? '#6b6f76' : '#55595f';
      g.fillRect(toPx(L.c[i] - L.w[i] / 2), toPx(-L.half - 9), toPx(L.c[i] + L.w[i] / 2) - toPx(L.c[i] - L.w[i] / 2), toPx(L.half + 9) - toPx(-L.half - 9));
      g.fillRect(toPx(-L.half - 9), toPx(L.c[i] - L.w[i] / 2), toPx(L.half + 9) - toPx(-L.half - 9), toPx(L.c[i] + L.w[i] / 2) - toPx(L.c[i] - L.w[i] / 2));
    }
    // Bangkok Expressway (Srirat / Chalerm Maha Nakhon / Motorway)
    g.strokeStyle = '#0284c7'; g.lineWidth = (18 / WORLD) * RES; g.beginPath();
    city.ringPts.forEach(([x, z], k) => (k ? g.lineTo(toPx(x), toPx(z)) : g.moveTo(toPx(x), toPx(z)))); g.closePath(); g.stroke();
    g.strokeStyle = '#f59e0b'; g.lineWidth = (12 / WORLD) * RES; g.beginPath();
    city.ringPts.forEach(([x, z], k) => (k ? g.lineTo(toPx(x), toPx(z)) : g.moveTo(toPx(x), toPx(z)))); g.closePath(); g.stroke();
    g.lineWidth = (9 / WORLD) * RES;
    for (const rp of city.ramps) { g.beginPath(); g.moveTo(toPx(rp.hx), toPx(rp.hz)); g.lineTo(toPx(rp.lx), toPx(rp.lz)); g.stroke(); }
    // Toll Plaza markers on minimap
    for (const [tx, tz, lbl] of [[L.ring.half, 175, 'ด่านดินแดง'], [-L.ring.half, -175, 'ด่านพระราม 9']]) {
      g.fillStyle = '#0369a1'; g.strokeStyle = '#facc15'; g.lineWidth = 2;
      g.fillRect(toPx(tx) - 10, toPx(tz) - 5, 20, 10);
      g.strokeRect(toPx(tx) - 10, toPx(tz) - 5, 20, 10);
      g.fillStyle = '#fde047'; g.font = '700 14px Kanit, sans-serif'; g.textAlign = 'center';
      g.fillText(lbl, toPx(tx), toPx(tz) - 10);
    }
    // mountain pass
    if (city.touge) {
      const P = city.touge.path;
      g.fillStyle = '#2a3d27'; g.fillRect(toPx(-1700), toPx(-650), toPx(-560) - toPx(-1700), toPx(650) - toPx(-650));
      g.strokeStyle = '#8a8f96'; g.lineWidth = (10 / WORLD) * RES * 1.6; g.lineJoin = 'round'; g.beginPath();
      P.forEach((p, k) => (k ? g.lineTo(toPx(p.x), toPx(p.z)) : g.moveTo(toPx(p.x), toPx(p.z)))); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(toPx(-590), toPx(0)); g.lineTo(toPx(-560), toPx(0)); g.stroke();
    }
    // BTS Skytrain line
    g.strokeStyle = '#84cc16'; g.lineWidth = 3; g.setLineDash([8, 6]); g.beginPath(); g.moveTo(toPx(L.rail.x0), toPx(0)); g.lineTo(toPx(L.rail.x1), toPx(0)); g.stroke(); g.setLineDash([]);
    // labels
    g.fillStyle = '#ffffff'; g.font = '700 17px Kanit, sans-serif'; g.textAlign = 'center';
    for (const s of city.spawns) g.fillText(s.name, toPx(s.x), toPx(s.z) - 10);
    this.base = base;
  }

  draw(px, pz, heading, cars, peers = [], race = null, icons = []) {
    const g = this.ctx, W = this.canvas.width, R = W / 2;
    const span = 420;
    const scale = RES / WORLD;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#1b2a1b'; g.fillRect(0, 0, W, W);
    g.translate(R, R);
    g.rotate(heading - Math.PI / 2);
    const k = W / span;
    g.scale(k / scale, k / scale);
    g.drawImage(this.base, -toPx(px), -toPx(pz));
    if (race?.route) {
      g.strokeStyle = 'rgba(76,195,255,0.85)'; g.lineWidth = 7; g.lineJoin = 'round'; g.beginPath();
      race.route.forEach((p, idx) => { const x = toPx(p.x) - toPx(px), z = toPx(p.z) - toPx(pz); if (idx) g.lineTo(x, z); else g.moveTo(x, z); });
      g.closePath(); g.stroke();
      if (race.next) { g.fillStyle = '#ffb02e'; g.beginPath(); g.arc(toPx(race.next.x) - toPx(px), toPx(race.next.z) - toPx(pz), 12, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#ff5a6e';
      for (const c of race.bots || []) { g.beginPath(); g.arc(toPx(c.x) - toPx(px), toPx(c.z) - toPx(pz), 8, 0, Math.PI * 2); g.fill(); }
    }
    for (const ic of icons) {
      const x = toPx(ic.x) - toPx(px), z = toPx(ic.z) - toPx(pz);
      if (ic.kind === 'cop') {
        g.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#ff2a4a' : '#2a6bff';
        g.fillRect(x - 6, z - 6, 12, 12);
        continue;
      }
      if (ic.kind === 'wp') {
        // convoy waypoint — pulsing cyan diamond
        const s = 13 + Math.sin(performance.now() / 220) * 3;
        g.fillStyle = '#4cc3ff'; g.strokeStyle = '#fff'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, z - s); g.lineTo(x + s * 0.7, z); g.lineTo(x, z + s); g.lineTo(x - s * 0.7, z); g.closePath();
        g.fill(); g.stroke();
        continue;
      }
      if (ic.kind === 'cash' || ic.kind === 'big') {
        g.fillStyle = ic.kind === 'big' ? '#ffc23a' : '#36ff8a';
        g.beginPath(); g.arc(x, z, ic.kind === 'big' ? 9 : 5, 0, Math.PI * 2); g.fill();
        continue;
      }
      g.fillStyle = ic.kind === 'race' ? '#ff4f6d' : ic.hidden ? '#c56bff' : '#4cc3ff';
      g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, z, 14, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.fillStyle = '#e8e8e8';
    for (const c of cars) if (c.x !== undefined) g.fillRect(toPx(c.x) - toPx(px) - 3, toPx(c.z) - toPx(pz) - 3, 6, 6);
    for (const c of peers) {
      // party = green, friend = cyan, stranger = orange — spot your people at a glance
      g.fillStyle = c.kind === 'party' ? '#4dff88' : c.kind === 'friend' ? '#4cc3ff' : '#ffb02e';
      g.beginPath(); g.arc(toPx(c.x) - toPx(px), toPx(c.z) - toPx(pz), 7, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    g.fillStyle = '#4cc3ff'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(R, R - 10); g.lineTo(R + 7, R + 8); g.lineTo(R, R + 4); g.lineTo(R - 7, R + 8); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.stroke();
    const na = heading - Math.PI;
    g.fillStyle = '#ff5a5a'; g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', R + Math.cos(na) * (R - 12), R + Math.sin(na) * (R - 12));
  }
}
