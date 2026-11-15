// Canvas-generated textures for the Bangkok city & Expressway/Motorway (no image files → works offline, tiny download).
import * as THREE from 'three';
import { SHOP_SIGNS, VERTICAL_SIGNS, JP_FONT, KONBINI, STATION, EXPRESSWAY_GANTRIES, BILLBOARDS } from './signs.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function tex(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const noise = (g, w, h, n, a, b) => { for (let i = 0; i < n; i++) { const v = a + Math.random() * (b - a); g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };

// ---------------------------------------------------------------- facades
// One tile = 4 bays (3 m each) × 4 floors (3.2 m each) → 12 m × 12.8 m.
export const FACADE_TILE = { w: 12, h: 12.8 };
const FACADES = {
  office: { wall: '#3b4d63', win: '#17283b', frame: '#8fa3b8', winW: 0.9, winH: 0.76, glassy: true },
  apartment: { wall: '#dcd6cc', win: '#2d3540', frame: '#f3f2ee', winW: 0.65, winH: 0.58, balcony: true },
  zakkyo: { wall: '#9e9589', win: '#282c32', frame: '#756e65', winW: 0.54, winH: 0.48, ac: true },
  tile: { wall: '#7c6554', win: '#26292e', frame: '#b8aa98', winW: 0.58, winH: 0.52 },
  white: { wall: '#e8e8e3', win: '#2c333b', frame: '#c9c9c4', winW: 0.62, winH: 0.52, ac: true },
};
export const FACADE_TYPES = Object.keys(FACADES);

export function facadeTextures(type, seed = 1) {
  const f = FACADES[type], r = rng(seed);
  const lit = [];
  const draw = (night) => (g, W, H) => {
    const bw = W / 4, fh = H / 4;
    g.fillStyle = night ? shade(f.wall, 0.12) : f.wall; g.fillRect(0, 0, W, H);
    if (!night) noise(g, W, H, 900, 90, 170);
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      const ww = bw * f.winW, wh = fh * f.winH;
      const x = bx * bw + (bw - ww) / 2, y = fy * fh + fh * 0.18;
      const idx = fy * 4 + bx;
      if (night) {
        if (lit[idx] === undefined) lit[idx] = r() < 0.58 ? (r() < 0.65 ? '#ffd9a0' : '#c8e4ff') : null;
        g.fillStyle = lit[idx] || '#05070a';
        g.fillRect(x, y, ww, wh);
        if (lit[idx]) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + ww * (0.2 + r() * 0.5), y, ww * 0.12, wh); }
      } else {
        g.fillStyle = f.frame; g.fillRect(x - 3, y - 3, ww + 6, wh + 6);
        const grd = g.createLinearGradient(x, y, x + ww, y + wh);
        grd.addColorStop(0, shade(f.win, 1.55)); grd.addColorStop(0.5, f.win); grd.addColorStop(1, shade(f.win, 1.25));
        g.fillStyle = grd; g.fillRect(x, y, ww, wh);
        if (f.glassy) { g.fillStyle = 'rgba(165,215,250,0.22)'; g.fillRect(x, y, ww * 0.38, wh); }
        g.fillStyle = f.frame; g.fillRect(x + ww / 2 - 1, y, 2, wh);
      }
      if (f.balcony && !night) { g.fillStyle = 'rgba(240,240,236,0.95)'; g.fillRect(bx * bw + 2, y + wh * 0.62, bw - 4, wh * 0.42 + fh * 0.12); g.fillStyle = 'rgba(120,120,115,0.6)'; for (let k = 0; k < 8; k++) g.fillRect(bx * bw + 4 + k * (bw - 8) / 8, y + wh * 0.62, 1.5, wh * 0.42); }
      if (f.ac && !night && r() < 0.45) { g.fillStyle = '#dcdcd6'; g.fillRect(x + ww + 2, y + wh * 0.5, bw * 0.16, fh * 0.16); }
      g.fillStyle = night ? '#000' : 'rgba(0,0,0,0.12)'; g.fillRect(0, (fy + 1) * fh - 3, W, 3);
    }
  };
  return { map: tex(256, 256, draw(false)), emissive: tex(256, 256, draw(true)) };
}

function shade(hex, k) {
  const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString();
}

// ---------------------------------------------------------------- shop fronts (atlas 4×4)
export const SHOP_ATLAS = 4;
export function shopTextures(seed = 7) {
  const r = rng(seed);
  const palette = ['#c8102e', '#0052a5', '#f59e0b', '#007a53', '#6d28d9', '#ea580c', '#1e293b', '#be185d', '#0f766e', '#854d0e'];
  const slots = [];
  for (let i = 0; i < SHOP_ATLAS * SHOP_ATLAS; i++) slots.push({ text: SHOP_SIGNS[Math.floor(r() * SHOP_SIGNS.length)], bg: palette[Math.floor(r() * palette.length)], shutter: r() < 0.15 });
  const draw = (night) => (g, W, H) => {
    const s = W / SHOP_ATLAS;
    slots.forEach((sl, i) => {
      const x = (i % SHOP_ATLAS) * s, y = Math.floor(i / SHOP_ATLAS) * s;
      g.fillStyle = night ? '#0b0b0c' : '#bdb6aa'; g.fillRect(x, y, s, s);
      // Thai awning / signboard band
      g.fillStyle = night ? shade(sl.bg, 1.35) : sl.bg; g.fillRect(x + 4, y + 6, s - 8, s * 0.27);
      g.strokeStyle = '#ffd700'; g.lineWidth = 2; g.strokeRect(x + 6, y + 8, s - 12, s * 0.27 - 4);
      g.fillStyle = '#fff';
      g.font = `700 ${Math.floor(s * 0.125)}px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(sl.text, x + s / 2, y + 6 + s * 0.135, s - 20);
      const gy = y + s * 0.36, gh = s * 0.6;
      if (sl.shutter) {
        g.fillStyle = night ? '#121314' : '#9a9da1'; g.fillRect(x + 6, gy, s - 12, gh);
        g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 18; k++) g.fillRect(x + 6, gy + k * gh / 18, s - 12, 1.5);
      } else {
        const grd = g.createLinearGradient(x, gy, x, gy + gh);
        if (night) { grd.addColorStop(0, '#fff3d6'); grd.addColorStop(1, '#ffd796'); } else { grd.addColorStop(0, '#5a6a78'); grd.addColorStop(1, '#2b333b'); }
        g.fillStyle = grd; g.fillRect(x + 6, gy, s - 12, gh);
        g.fillStyle = night ? 'rgba(80,60,40,0.5)' : 'rgba(200,220,235,0.25)';
        for (let k = 0; k < 3; k++) g.fillRect(x + 8 + k * (s - 16) / 3, gy + 4, 3, gh - 8);
      }
    });
  };
  return { map: tex(1024, 1024, draw(false), { repeat: false }), emissive: tex(1024, 1024, draw(true), { repeat: false }) };
}

// ---------------------------------------------------------------- vertical signs (atlas of 12 columns)
export function verticalSignTexture() {
  const n = VERTICAL_SIGNS.length;
  const colors = ['#e11d48', '#facc15', '#ffffff', '#00b4d8', '#ec4899', '#22c55e'];
  return tex(64 * n, 512, (g, W, H) => {
    VERTICAL_SIGNS.forEach((t, i) => {
      const x = i * 64;
      const c = colors[i % colors.length];
      g.fillStyle = i % 2 ? '#0f172a' : c; g.fillRect(x + 2, 2, 60, H - 4);
      g.strokeStyle = i % 2 ? c : '#0f172a'; g.lineWidth = 4; g.strokeRect(x + 5, 5, 54, H - 10);
      g.fillStyle = i % 2 ? c : '#0f172a';
      g.save();
      g.translate(x + 32, H / 2);
      g.rotate(-Math.PI / 2);
      g.font = `700 36px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t, 0, 0, H - 40);
      g.restore();
    });
  }, { repeat: false });
}

// ---------------------------------------------------------------- Thai convenience store / BTS station / misc
export function konbiniTexture(night) {
  return tex(512, 256, (g, W, H) => {
    g.fillStyle = night ? '#141414' : '#f0efe9'; g.fillRect(0, 0, W, H);
    // Iconic Thai 24h convenience store tri-colour stripe band (orange, green, red)
    ['#f58220', '#008060', '#ed1c24'].forEach((c, i) => { g.fillStyle = night ? shade(c, 1.35) : c; g.fillRect(0, 10 + i * 18, W, 16); });
    g.fillStyle = night ? '#fff' : '#00684a';
    g.font = `700 40px ${JP_FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(KONBINI.name, 20, 98);
    g.fillStyle = night ? '#ffd166' : '#d9480f';
    g.font = `700 22px ${JP_FONT}`; g.fillText(KONBINI.sub, 300, 98);
    const gy = 128, gh = H - gy - 6;
    const grd = g.createLinearGradient(0, gy, 0, gy + gh);
    if (night) { grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#e8f4ff'); } else { grd.addColorStop(0, '#9fb3c4'); grd.addColorStop(1, '#5b6c7b'); }
    g.fillStyle = grd; g.fillRect(6, gy, W - 12, gh);
    g.fillStyle = night ? 'rgba(120,140,160,0.6)' : 'rgba(30,40,50,0.5)';
    for (let k = 0; k < 6; k++) g.fillRect(6 + k * (W - 12) / 6, gy, 4, gh);
    if (night) { g.fillStyle = 'rgba(80,90,100,0.5)'; for (let k = 0; k < 5; k++) g.fillRect(30 + k * 95, gy + 30, 60, gh - 40); }
  }, { repeat: false });
}

export function stationTexture(night) {
  return tex(1024, 256, (g, W, H) => {
    g.fillStyle = night ? '#0d131a' : '#d5dce2'; g.fillRect(0, 0, W, H);
    // BTS Skytrain dark navy + green band
    g.fillStyle = night ? '#003e7e' : '#002f63'; g.fillRect(0, 16, W, 76);
    g.fillStyle = '#5eb82d'; g.fillRect(0, 84, W, 10);
    g.fillStyle = '#fff'; g.font = `700 46px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(STATION.name, W / 2 - 140, 52);
    g.fillStyle = '#a3e635'; g.font = `700 26px ${JP_FONT}`; g.fillText(STATION.sub, W / 2 + 220, 54);
    const gy = 110;
    for (let k = 0; k < 10; k++) { g.fillStyle = night ? '#fff1cf' : '#3e4a56'; g.fillRect(20 + k * 99, gy, 84, H - gy - 10); }
  }, { repeat: false });
}

export function vendingTexture(night) {
  const r = rng(99);
  return tex(128, 256, (g, W, H) => {
    g.fillStyle = night ? '#e8f3ff' : '#f2f2f2'; g.fillRect(0, 0, W, H);
    g.fillStyle = night ? '#bcd9ff' : '#d8dde2'; g.fillRect(6, 10, W - 12, H * 0.55);
    const cols = ['#d61f1f', '#1f6fd6', '#f2b705', '#1aa35a', '#7a3fb0', '#ff7a1a', '#222', '#e6e6e6'];
    for (let row = 0; row < 4; row++) for (let k = 0; k < 6; k++) {
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.fillRect(10 + k * 18, 16 + row * 34, 12, 24);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(12 + k * 18, 18 + row * 34, 3, 20);
    }
    g.fillStyle = '#1a1a1a'; g.fillRect(14, H * 0.66, W - 28, 10);
    g.fillStyle = '#333'; g.fillRect(W - 34, H * 0.72, 18, 24);
    g.fillStyle = night ? '#3a3f45' : '#2b2f33'; g.fillRect(10, H - 40, W - 20, 26);
  }, { repeat: false });
}

// ---------------------------------------------------------------- Bangkok Expressway & Motorway Gantry Atlas
// 4 overhead gantry sign boards stacked vertically in one 1024×1024 atlas (each slot 1024×256)
export function gantryAtlasTexture(night) {
  return tex(1024, 1024, (g, W, H) => {
    const sh = H / 4;
    EXPRESSWAY_GANTRIES.forEach((sp, idx) => {
      const y0 = idx * sh;
      g.fillStyle = night ? shade(sp.bg, 1.15) : sp.bg;
      g.fillRect(0, y0, W, sh);
      // Subtle reflective sheeting sheen
      const grd = g.createLinearGradient(0, y0, 0, y0 + sh);
      grd.addColorStop(0, 'rgba(255,255,255,0.12)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = grd; g.fillRect(0, y0, W, sh);

      // Outer white reflective border
      g.strokeStyle = '#ffffff'; g.lineWidth = 8;
      g.strokeRect(10, y0 + 10, W - 20, sh - 20);

      // Top highway agency badge bar
      g.fillStyle = '#ffffff';
      g.fillRect(24, y0 + 20, 340, 34);
      g.fillStyle = sp.bg;
      g.font = `700 20px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(sp.badge, 194, y0 + 37, 320);

      // Speed limit sign on top-right corner of gantry
      const sx = W - 72, sy = y0 + 62;
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(sx, sy, 42, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e11d48'; g.lineWidth = 10; g.beginPath(); g.arc(sx, sy, 36, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#111827'; g.font = `900 34px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(sp.speed || '90', sx, sy + 2);

      // 3 lane panels: left, mid, right (exit)
      const cols = [sp.left, sp.mid, sp.right];
      const cw = (W - 140) / 3;
      cols.forEach((col, cIdx) => {
        const cx = 24 + cIdx * cw + cw / 2;
        if (cIdx > 0) {
          g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(24 + cIdx * cw, y0 + 62); g.lineTo(24 + cIdx * cw, y0 + sh - 22); g.stroke();
        }
        if (col.exit) {
          // Yellow exit header pill
          g.fillStyle = '#facc15';
          g.fillRect(24 + cIdx * cw + 14, y0 + 22, cw - 28, 32);
          g.fillStyle = '#111827'; g.font = `800 20px ${JP_FONT}`;
          g.fillText(col.sub || 'ทางออก EXIT', cx, y0 + 38, cw - 36);
        }
        g.fillStyle = '#ffffff';
        g.font = `700 34px ${JP_FONT}`;
        g.fillText(col.th, cx, y0 + 92, cw - 24);
        g.fillStyle = '#e2e8f0';
        g.font = `600 18px ${JP_FONT}`;
        g.fillText(col.en, cx, y0 + 132, cw - 24);
        // Large lane arrow at bottom
        g.fillStyle = col.exit ? '#facc15' : '#ffffff';
        g.font = `900 54px ${JP_FONT}`;
        g.fillText(col.arrow || '↑', cx, y0 + 195);
      });
    });
  }, { repeat: false });
}

// ---------------------------------------------------------------- Toll Plaza Canopy & Lane Signs (Easy Pass / M-Flow / Cash)
export function tollCanopyTexture(night) {
  return tex(1024, 256, (g, W, H) => {
    // Upper fascia: EXAT Bangkok Toll Plaza
    g.fillStyle = night ? '#002b5e' : '#003572';
    g.fillRect(0, 0, W, 120);
    g.fillStyle = '#facc15';
    g.fillRect(0, 112, W, 10);
    g.fillStyle = '#ffffff';
    g.font = `700 40px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ด่านเก็บค่าผ่านทางพิเศษ · EXAT TOLL PLAZA', W / 2, 46);
    g.fillStyle = '#93c5fd';
    g.font = `600 22px ${JP_FONT}`;
    g.fillText('โปรดเตรียมค่าผ่านทาง / ใช้ช่อง EASY PASS & M-FLOW เพื่อความรวดเร็ว', W / 2, 88);

    // Lower half (y = 128..256): 4 lane overhead signboxes
    const lanes = [
      { bg: '#0369a1', badge: '#facc15', title: 'EASY PASS', sub: 'เฉพาะบัตรอีซี่พาส', col: '#ffffff' },
      { bg: '#047857', badge: '#34d399', title: 'M-FLOW', sub: 'วิ่งผ่านไม่ต้องหยุด', col: '#ffffff' },
      { bg: '#0369a1', badge: '#facc15', title: 'EASY PASS', sub: 'เฉพาะบัตรอีซี่พาส', col: '#ffffff' },
      { bg: '#1e3a8a', badge: '#fbbf24', title: 'เงินสด 50฿', sub: 'CASH LANE', col: '#fde047' },
    ];
    const lw = W / 4;
    lanes.forEach((ln, i) => {
      const x = i * lw;
      g.fillStyle = ln.bg; g.fillRect(x + 6, 130, lw - 12, 120);
      g.strokeStyle = ln.badge; g.lineWidth = 5; g.strokeRect(x + 8, 132, lw - 16, 116);
      g.fillStyle = ln.col; g.font = `800 30px ${JP_FONT}`;
      g.fillText(ln.title, x + lw / 2, 166, lw - 24);
      g.fillStyle = '#e2e8f0'; g.font = `600 18px ${JP_FONT}`;
      g.fillText(ln.sub, x + lw / 2, 198, lw - 24);
      // Green open lane LED arrow
      g.fillStyle = '#0f172a'; g.beginPath(); g.arc(x + lw / 2, 228, 16, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#22c55e'; g.font = `900 24px ${JP_FONT}`;
      g.fillText('↓', x + lw / 2, 229);
    });
  }, { repeat: false });
}

// ---------------------------------------------------------------- Highway Unipole Billboards Atlas (6 slots in 1024×1024)
export function billboardAtlasTexture(night) {
  return tex(1024, 1024, (g, W, H) => {
    const cols = 2, rows = 3, cw = W / cols, ch = H / rows;
    BILLBOARDS.forEach((b, i) => {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      const grd = g.createLinearGradient(x, y, x + cw, y + ch);
      grd.addColorStop(0, night ? shade(b.bg1, 1.2) : b.bg1);
      grd.addColorStop(1, night ? shade(b.bg2, 1.2) : b.bg2);
      g.fillStyle = grd; g.fillRect(x + 4, y + 4, cw - 8, ch - 8);
      g.strokeStyle = b.accent; g.lineWidth = 6; g.strokeRect(x + 12, y + 12, cw - 24, ch - 24);
      // Tag pill
      g.fillStyle = b.accent; g.fillRect(x + 28, y + 28, cw - 56, 38);
      g.fillStyle = '#0f172a'; g.font = `800 22px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(b.tag, x + cw / 2, y + 47, cw - 70);
      // Main headline
      g.fillStyle = '#ffffff'; g.font = `900 44px ${JP_FONT}`;
      g.fillText(b.title, x + cw / 2, y + ch * 0.52, cw - 44);
      // Subtitle
      g.fillStyle = '#f1f5f9'; g.font = `600 26px ${JP_FONT}`;
      g.fillText(b.sub, x + cw / 2, y + ch * 0.77, cw - 44);
    });
  }, { repeat: false });
}

// ---------------------------------------------------------------- Acoustic Noise Barrier & Hazard Stripes
export function noiseBarrierTexture() {
  return tex(256, 256, (g, W, H) => {
    // Lower metallic acoustic louvers
    g.fillStyle = '#7c858e'; g.fillRect(0, H * 0.45, W, H * 0.55);
    for (let y = Math.floor(H * 0.46); y < H; y += 12) {
      g.fillStyle = 'rgba(30,35,40,0.45)'; g.fillRect(0, y, W, 4);
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(0, y + 4, W, 2);
    }
    // Upper tinted polycarbonate window band (Bangkok Srirat Expressway style)
    const grd = g.createLinearGradient(0, 0, 0, H * 0.45);
    grd.addColorStop(0, '#0d9488'); grd.addColorStop(0.5, '#14b8a6'); grd.addColorStop(1, '#0f766e');
    g.fillStyle = grd; g.fillRect(0, 0, W, H * 0.45);
    // Steel vertical H-posts
    g.fillStyle = '#475569';
    g.fillRect(0, 0, 14, H); g.fillRect(W - 14, 0, 14, H);
    g.fillRect(0, 0, W, 12); g.fillRect(0, H * 0.43, W, 10);
  });
}

export function hazardStripeTexture() {
  return tex(256, 256, (g, W, H) => {
    g.fillStyle = '#facc15'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#111827';
    for (let i = -H; i < W + H; i += 48) {
      g.beginPath();
      g.moveTo(i, 0); g.lineTo(i + 24, 0); g.lineTo(i - H + 24, H); g.lineTo(i - H, H);
      g.closePath(); g.fill();
    }
  });
}

export function chevronSignTexture() {
  return tex(256, 128, (g, W, H) => {
    g.fillStyle = '#facc15'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#111827';
    for (let k = 0; k < 3; k++) {
      const x = 18 + k * 80;
      g.beginPath();
      g.moveTo(x, 12); g.lineTo(x + 36, 12); g.lineTo(x + 68, H / 2); g.lineTo(x + 36, H - 12); g.lineTo(x, H - 12); g.lineTo(x + 32, H / 2);
      g.closePath(); g.fill();
    }
    g.strokeStyle = '#111827'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
  }, { repeat: false });
}

// ---------------------------------------------------------------- ground
export function asphaltTexture() {
  return tex(512, 512, (g, W, H) => {
    g.fillStyle = '#26292e'; g.fillRect(0, 0, W, H);
    // multi-scale mineral aggregate grain
    for (let i = 0; i < 24000; i++) {
      const v = 26 + ((Math.random() * 44) | 0);
      g.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
      g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }
    // subtle bright quartz flecks catching headlights/sun
    for (let i = 0; i < 1600; i++) {
      const v = 78 + ((Math.random() * 48) | 0);
      g.fillStyle = `rgba(${v},${v + 2},${v + 6},0.45)`;
      g.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
    }
    // longitudinal worn tire polish tracks
    g.fillStyle = 'rgba(14,16,20,0.22)';
    for (const tx of [96, 192, 320, 416]) {
      g.fillRect(tx - 18, 0, 36, H);
    }
    // patched bitumen repairs and micro-cracks
    g.fillStyle = 'rgba(18,19,22,0.25)';
    for (let i = 0; i < 4; i++) {
      g.fillRect(Math.random() * (W - 70), Math.random() * (H - 90), 38 + Math.random() * 44, 48 + Math.random() * 64);
    }
    g.strokeStyle = 'rgba(12,12,15,0.48)'; g.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      let x = Math.random() * W, y = Math.random() * H;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 48; y += (Math.random() - 0.5) * 48; g.lineTo(x, y); }
      g.stroke();
    }
  });
}
export function pavingTexture() {
  return tex(256, 256, (g, W, H) => {
    g.fillStyle = '#979087'; g.fillRect(0, 0, W, H);
    noise(g, W, H, 2800, 108, 168);
    // staggered concrete paver tiles (running bond)
    const rows = 8, cols = 4, rh = H / rows, cw = W / cols;
    for (let r = 0; r < rows; r++) {
      const off = (r & 1) ? cw * 0.5 : 0;
      for (let c = -1; c <= cols; c++) {
        const x = c * cw + off, y = r * rh;
        const shade = ((r * 7 + c * 13) & 3) * 4 - 6;
        g.fillStyle = `rgba(${150 + shade},${143 + shade},${134 + shade},0.35)`;
        g.fillRect(x + 2, y + 2, cw - 4, rh - 4);
        g.strokeStyle = 'rgba(54,50,46,0.52)'; g.lineWidth = 2;
        g.strokeRect(x, y, cw, rh);
      }
    }
    // subtle weathered damp spots
    g.fillStyle = 'rgba(55,58,52,0.14)';
    for (let i = 0; i < 6; i++) g.fillRect(Math.random() * W, Math.random() * H, 26, 22);
    // Thai sidewalk yellow tactile blind-guide strip near inner tile row
    g.fillStyle = '#c89e2c';
    g.fillRect(0, 8, W, 24);
    g.fillStyle = 'rgba(95,70,15,0.45)';
    for (let x = 4; x < W; x += 12) g.fillRect(x, 12, 4, 16);
  });
}
export function grassTexture() {
  return tex(128, 128, (g, W, H) => { g.fillStyle = '#486834'; g.fillRect(0, 0, W, H); for (let i = 0; i < 3000; i++) { g.fillStyle = `hsl(${85 + Math.random() * 30},38%,${22 + Math.random() * 18}%)`; g.fillRect(Math.random() * W, Math.random() * H, 1.5, 3); } });
}
export function stopTextTexture() {
  return tex(256, 128, (g, W, H) => {
    g.clearRect(0, 0, W, H); g.fillStyle = '#f4f4f0';
    g.font = `800 84px ${JP_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(W / 2, H / 2); g.scale(1, 1.45); g.fillText('หยุด', 0, 0); g.restore();
  }, { repeat: false });
}
export function glowTexture() {
  return tex(128, 128, (g, W) => {
    const grd = g.createRadialGradient(W / 2, W / 2, 2, W / 2, W / 2, W / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, W, W);
  }, { repeat: false, srgb: false });
}
export function containerTexture(color) {
  return tex(128, 64, (g, W, H) => {
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.22)'; for (let x = 2; x < W; x += 6) g.fillRect(x, 0, 2, H);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, 0, W, 3);
  }, { repeat: false });
}
