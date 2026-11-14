// Procedural wheels, tires and brakes — tuned for realism at 15/16/17".
// Wheel local frame: axis = +z (outward face). Units: meters.
import * as THREE from 'three';
import { shared } from './materials.js';

// ---------------------------------------------------------------- data
// Real tire sizes that fit a Vios (overall diameter close to OEM ~600 mm).
export const TIRE_SIZES = {
  14: [{ w: 175, a: 65, li: '82T' }, { w: 185, a: 60, li: '82H' }, { w: 185, a: 55, li: '82V' }],
  15: [{ w: 185, a: 60, li: '84H' }, { w: 185, a: 55, li: '82V' }, { w: 195, a: 55, li: '85V' }, { w: 195, a: 50, li: '82V' }, { w: 205, a: 50, li: '86V' }],
  16: [{ w: 195, a: 50, li: '84V' }, { w: 205, a: 45, li: '83W' }, { w: 195, a: 55, li: '87V' }, { w: 205, a: 50, li: '87W' }, { w: 215, a: 45, li: '90W' }],
  17: [{ w: 205, a: 45, li: '88W' }, { w: 205, a: 40, li: '84W' }, { w: 215, a: 40, li: '87W' }, { w: 215, a: 45, li: '91W' }, { w: 225, a: 40, li: '91W' }, { w: 205, a: 50, li: '93V' }],
};
export const RIM_WIDTHS = { 14: [5, 5.5, 6], 15: [5.5, 6, 6.5, 7, 7.5], 16: [6, 6.5, 7, 7.5, 8], 17: [6.5, 7, 7.5, 8, 8.5] };
// approx. ETRTO approved rim-width range per tire width (inches)
const RIM_RANGE = { 165: [4.5, 5.5], 175: [5, 6], 185: [5, 6.5], 195: [5.5, 7], 205: [5.5, 7.5], 215: [6, 7.5], 225: [6, 8], 235: [7, 8.5] };

export const TIRE_TYPES = [
  { id: 'comfort', name: 'คอมฟอร์ต / ประหยัด' },
  { id: 'sport', name: 'สปอร์ต (อสมมาตร)' },
  { id: 'directional', name: 'ดอกทิศทาง (V)' },
  { id: 'semislick', name: 'กึ่งสลิก (Hi-Grip)' },
];

export const RIMS = [14, 15, 16, 17];
export const TIRE_WIDTHS = [165, 175, 185, 195, 205, 215, 225, 235];
export const ASPECTS = [30, 35, 40, 45, 50, 55, 60, 65, 70];
const nearest = (list, v) => list.reduce((p, c) => (Math.abs(c - v) < Math.abs(p - v) ? c : p));

export function autoAspect(rim, width, oemTire) {
  const oemR = (oemTire.rim * 25.4 + 2 * oemTire.width * oemTire.aspect / 100) / 2;
  return nearest(ASPECTS, ((oemR - rim * 12.7) / width) * 100);
}

export function normalizeWheels(w, oemTire) {
  w.rim = nearest(RIMS, w.rim || 15);
  w.tireWidth = nearest(TIRE_WIDTHS, w.tireWidth || 185);
  if (!ASPECTS.includes(w.aspect)) w.aspect = autoAspect(w.rim, w.tireWidth, oemTire);
  w.rimWidth = nearest(RIM_WIDTHS[w.rim], w.rimWidth || 6);
  w.tireType = w.tireType || 'comfort';
  w.tireLetters = w.tireLetters || 'black';
  return w;
}

export function tireSpec(w, oemTire) {
  const rimR = w.rim * 0.0127;
  const sw = w.tireWidth / 1000;
  const ar = w.aspect ?? 50;
  const h = sw * ar / 100;
  const outerR = rimR + h;
  const oemR = (oemTire.rim * 25.4 + 2 * oemTire.width * oemTire.aspect / 100) / 2000;
  const rimW = w.rimWidth * 0.0254;
  // section width grows/shrinks ~40% of the rim-width difference from the measuring rim
  const measRim = (RIM_RANGE[w.tireWidth]?.reduce((a, b) => a + b, 0) / 2 || w.tireWidth / 30) * 0.0254;
  const swAct = sw + 0.4 * (rimW - measRim);
  const range = RIM_RANGE[w.tireWidth] || [5, 8];
  const fit = w.rimWidth < range[0] ? 'bulge' : w.rimWidth > range[1] ? 'stretch' : 'ok';
  const li = TIRE_SIZES[w.rim]?.find((s) => s.w === w.tireWidth && s.a === ar)?.li || '';
  return {
    rimR, sw, swAct, ar, h, outerR, rimW, fit, range,
    label: `${w.tireWidth}/${ar}R${w.rim}${li ? ' ' + li : ''}`,
    diffPct: ((outerR - oemR) / oemR) * 100,
  };
}

// ---------------------------------------------------------------- textures
const texCache = new Map();
function canvasTex(key, w, h, draw, opts = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = opts.wrapS ?? THREE.RepeatWrapping; t.wrapT = opts.wrapT ?? THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  if (opts.srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

// Tread: x = around the tire (one tile = several pitches), y = across the tread. White = rubber, black = groove.
function treadTexture(type) {
  return canvasTex('tread-' + type, 512, 256, (g, W, H) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#000'; g.strokeStyle = '#000';
    const groove = (y, t) => g.fillRect(0, y * H - t / 2, W, t);
    const pitches = 8, P = W / pitches;
    if (type === 'comfort') {
      [0.28, 0.43, 0.57, 0.72].forEach((y) => groove(y, 12));
      g.lineWidth = 2;
      for (let i = 0; i < pitches * 2; i++) {
        const x = i * P / 2;
        for (const [y0, y1] of [[0.3, 0.41], [0.45, 0.55], [0.59, 0.7]]) { g.beginPath(); g.moveTo(x, y0 * H); g.lineTo(x + 10, y1 * H); g.stroke(); }
        g.lineWidth = 6; g.beginPath(); g.moveTo(x, 0.04 * H); g.lineTo(x + 4, 0.26 * H); g.stroke(); g.beginPath(); g.moveTo(x, 0.74 * H); g.lineTo(x + 4, 0.96 * H); g.stroke(); g.lineWidth = 2;
      }
    } else if (type === 'sport') {
      [0.32, 0.5, 0.66].forEach((y) => groove(y, 15));
      for (let i = 0; i < pitches; i++) {
        const x = i * P;
        g.lineWidth = 7; g.beginPath(); g.moveTo(x, 0.0); g.quadraticCurveTo(x + 12, 0.15 * H, x + 6, 0.3 * H); g.stroke();
        g.lineWidth = 5; g.beginPath(); g.moveTo(x + P / 2, 0.68 * H); g.lineTo(x + P / 2 + 14, H); g.stroke();
        g.lineWidth = 2; g.beginPath(); g.moveTo(x + P / 3, 0.52 * H); g.lineTo(x + P / 3 + 8, 0.64 * H); g.stroke();
      }
    } else if (type === 'directional') {
      groove(0.5, 10);
      g.lineWidth = 7;
      for (let i = -1; i <= pitches; i++) {
        const x = i * P;
        g.beginPath(); g.moveTo(x, 0.48 * H); g.quadraticCurveTo(x + P * 0.5, 0.25 * H, x + P * 0.9, 0.0); g.stroke();
        g.beginPath(); g.moveTo(x, 0.52 * H); g.quadraticCurveTo(x + P * 0.5, 0.75 * H, x + P * 0.9, H); g.stroke();
      }
    } else { // semislick
      [0.36, 0.64].forEach((y) => groove(y, 8));
      g.lineWidth = 4;
      for (let i = 0; i < pitches; i++) { const x = i * P; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, 0.12 * H); g.stroke(); g.beginPath(); g.moveTo(x + P / 2, 0.88 * H); g.lineTo(x + P / 2 + 8, H); g.stroke(); }
    }
  });
}

// Sidewall: planar texture over the tire face (center = axle). Generic lettering only (no brand marks).
function sidewallTexture(T, letters, tireType) {
  const key = `side-${T.label}-${letters}-${tireType}`;
  return canvasTex(key, 1024, 1024, (g, W) => {
    const c = W / 2;
    g.fillStyle = '#1f1f21'; g.fillRect(0, 0, W, W);
    const rIn = (T.rimR / T.outerR) * c, rOut = c;
    const mid = rIn + (rOut - rIn) * 0.55;
    // subtle concentric moulding rings
    g.strokeStyle = '#29292c'; g.lineWidth = 2;
    for (const k of [0.12, 0.88]) { g.beginPath(); g.arc(c, c, rIn + (rOut - rIn) * k, 0, Math.PI * 2); g.stroke(); }
    const ringText = (text, radius, start, size, color, weight = 700) => {
      g.save(); g.translate(c, c);
      g.font = `${weight} ${size}px "Kanit", Arial, sans-serif`;
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
      const total = [...text].reduce((s, ch) => s + g.measureText(ch).width, 0);
      let a = start - total / radius / 2;
      for (const ch of text) {
        const cw = g.measureText(ch).width;
        a += cw / radius / 2;
        g.save(); g.rotate(a); g.translate(0, -radius); g.fillText(ch, 0, 0); g.restore();
        a += cw / radius / 2;
      }
      g.restore();
    };
    const band = rOut - rIn;
    const main = letters === 'white' ? '#ececec' : '#2f2f32';
    const big = Math.max(18, band * 0.2);
    const title = { comfort: 'TOURING RADIAL', sport: 'SPORT RADIAL', directional: 'SPORT DIRECTIONAL', semislick: 'HIGH GRIP RACING' }[tireType] || 'RADIAL';
    ringText(title, mid, 0, big, main, 800);
    ringText(title, mid, Math.PI, big, main, 800);
    const small = Math.max(10, band * 0.075), sc = '#2c2c2f';
    ringText(T.label + '  TUBELESS', mid, Math.PI / 2, small * 1.6, sc, 700);
    ringText(T.label + '  TUBELESS', mid, -Math.PI / 2, small * 1.6, sc, 700);
    ringText('DOT XXXX 2526   MAX PRESS 300kPa', rIn + band * 0.2, Math.PI / 2, small, sc, 500);
    ringText('RADIAL  STEEL BELTED', rIn + band * 0.2, -Math.PI / 2, small, sc, 500);
    if (tireType !== 'comfort') ringText('▲ ROTATION', rIn + band * 0.85, 0.9, small, sc, 600);
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, srgb: true });
}

function discTexture(drilled) {
  return canvasTex('disc-' + drilled, 512, 512, (g, W) => {
    const c = W / 2;
    const grd = g.createRadialGradient(c, c, c * 0.5, c, c, c);
    grd.addColorStop(0, '#7d7f84'); grd.addColorStop(1, '#a3a5aa');
    g.fillStyle = grd; g.fillRect(0, 0, W, W);
    g.strokeStyle = 'rgba(40,40,45,0.25)';
    for (let r = c * 0.55; r < c; r += 2.5) { g.lineWidth = Math.random() * 1.2; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#2b2c30';
    g.beginPath(); g.arc(c, c, c * 0.55, 0, Math.PI * 2); g.fill(); // hat (dark)
    if (drilled) {
      g.fillStyle = '#111';
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2, r = c * (0.68 + (i % 3) * 0.09);
        g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 5, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = '#1a1a1d'; g.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.2;
        g.beginPath(); g.arc(c, c, c * 0.8, a, a + 0.35); g.stroke();
      }
    }
  }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, srgb: true });
}

// ---------------------------------------------------------------- geometry helpers
function lathe(points, segs = 64) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  g.rotateX(Math.PI / 2);
  return g;
}
function planarUV(g, R) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / (2 * R) + 0.5; uv[i * 2 + 1] = p.getY(i) / (2 * R) + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Spoke as a rounded, tapered bar with a widened "foot" where it meets the lip.
function spokeGeo(r0, r1, w0, w1, t, { skew = 0, concave = 0, zf = 0, foot = 1.5 } = {}) {
  const s = new THREE.Shape();
  const rf = r1 - (r1 - r0) * 0.16;
  s.moveTo(r0, -w0 / 2);
  s.lineTo(rf, -w1 / 2 + skew * 0.84);
  s.quadraticCurveTo(r1 - 0.004, -w1 / 2 + skew, r1, -w1 * foot / 2 + skew);
  s.lineTo(r1, w1 * foot / 2 + skew);
  s.quadraticCurveTo(r1 - 0.004, w1 / 2 + skew, rf, w1 / 2 + skew * 0.84);
  s.lineTo(r0, w0 / 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.0045, bevelSegments: 3, curveSegments: 6 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const k = Math.max(0, Math.min(1, (x - r0) / (r1 - r0)));
    // concave curve + slight crown in the middle of the spoke
    p.setZ(i, p.getZ(i) + zf - t - concave * Math.pow(1 - k, 1.6));
  }
  g.computeVertexNormals();
  return g;
}

function discWithHoles(rIn, rOut, holes, holeR0, holeR1, holeW, t, zf, skew = 0) {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const inner = new THREE.Path();
  inner.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  s.holes.push(inner);
  for (let i = 0; i < holes; i++) {
    const a = (i / holes) * Math.PI * 2;
    const h = new THREE.Path();
    const pts = [];
    const steps = 6;
    for (let k = 0; k <= steps; k++) { const r = holeR0 + (holeR1 - holeR0) * k / steps; const aa = a + skew * k / steps - holeW / r / 2; pts.push([Math.cos(aa) * r, Math.sin(aa) * r]); }
    for (let k = steps; k >= 0; k--) { const r = holeR0 + (holeR1 - holeR0) * k / steps; const aa = a + skew * k / steps + holeW / r / 2; pts.push([Math.cos(aa) * r, Math.sin(aa) * r]); }
    h.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) h.lineTo(pts[k][0], pts[k][1]);
    h.closePath();
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 48 });
  g.translate(0, 0, zf - t);
  return g;
}

const OEM_MAP = {
  gen1: { style: 'split5', machined: false }, 'gen1-fl': { style: 'multi', machined: false },
  gen2: { style: 'spoke6', machined: false }, 'gen2-fl': { style: 'yspoke', machined: false },
  gen3: { style: 'yspoke', machined: true }, 'gen3-fl1': { style: 'split5', machined: true },
  'gen3-fl2': { style: 'split5', machined: true }, gen4: { style: 'multi', machined: true },
  'civic-eg': { style: 'cover', machined: false }, 'civic-fd': { style: 'split5', machined: false },
  'civic-fc': { style: 'yspoke', machined: true }, 'civic-fe': { style: 'split5', machined: true },
  'evo-ix': { style: 'split5', machined: false }, 'nissan-silvia-s13': { style: 'spoke5', machined: false },
};
// lug nut count per car (Vios/EG/S13 = 4 studs, later Civics and the Evo = 5)
const LUGS = { 'civic-fd': 5, 'civic-fc': 5, 'civic-fe': 5, 'evo-ix': 5 };

export function makeWheelMaterials(w, finishes) {
  const f = finishes.find((x) => x.id === w.finish) || finishes[0];
  const color = f.id === 'custom' ? w.color : f.color;
  const face = new THREE.MeshPhysicalMaterial({ color, metalness: f.metal, roughness: f.rough, clearcoat: 0.8, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
  return { face };
}

// ---------------------------------------------------------------- tire
function buildTire(T, w) {
  const { rimR, h, outerR: To } = T;
  const bw = T.rimW / 2 + 0.006;          // bead half-width (sits on rim flange)
  const sh = Math.max(T.swAct / 2, bw * 0.9); // shoulder half-width
  const treadHalf = sh - 0.016;
  const mid = (a, b, t) => a + (b - a) * t;
  // sidewall profile (one side, from bead to shoulder), bulge depends on stretch
  const side = (s) => [
    [rimR + 0.006, s * bw],
    [rimR + h * 0.2, s * mid(bw, sh, 0.65)],
    [rimR + h * 0.45, s * (sh + 0.002)],
    [rimR + h * 0.7, s * sh],
    [To - 0.018, s * (sh - 0.004)],
    [To - 0.006, s * (sh - 0.011)],
  ];
  const group = new THREE.Group();
  const rubber = new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.9, metalness: 0 });
  // inner sidewall
  const inner = side(-1);
  group.add(new THREE.Mesh(lathe(inner, 72), rubber));
  // tread band with grooves (bump + darker grooves)
  const tread = [[To - 0.006, -(sh - 0.011)]];
  for (let i = 0; i <= 10; i++) { const y = -treadHalf + (2 * treadHalf) * (i / 10); const crown = 1 - Math.pow(y / sh, 4) * 0.4; tread.push([To - 0.003 * (1 - crown) * 3, y]); }
  tread.push([To - 0.006, sh - 0.011]);
  const tTex = treadTexture(w.tireType || 'comfort').clone();
  tTex.needsUpdate = true;
  tTex.repeat.set(Math.round((2 * Math.PI * To) / 0.24), 1); // ~30 mm pitch, 8 per tile
  const treadMat = new THREE.MeshStandardMaterial({ color: '#2a2a2d', roughness: 0.95, metalness: 0, map: tTex, bumpMap: tTex, bumpScale: 3 });
  const tm = new THREE.Mesh(lathe(tread, 160), treadMat);
  group.add(tm);
  // outer sidewall with lettering
  const outer = side(1).reverse();
  const og = planarUV(lathe(outer, 96), To);
  const sTex = sidewallTexture(T, w.tireLetters || 'black', w.tireType || 'comfort');
  const sideMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: sTex, bumpMap: sTex, bumpScale: 0.6, roughness: 0.88, metalness: 0 });
  group.add(new THREE.Mesh(og, sideMat));
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

// ---------------------------------------------------------------- wheel
// Returns { spin, caliper, T, rimW }. `modelRim` (optional Object3D) replaces the procedural rim.
export function buildWheel(w, genId, oemTire, finishes, modelRim = null) {
  normalizeWheels(w, oemTire);
  const T = tireSpec(w, oemTire);
  const { rimR } = T;
  const rimW = T.rimW;
  let styleId = w.style;
  let machined = false;
  if (styleId === 'oem') { styleId = OEM_MAP[genId]?.style || 'spoke5'; machined = OEM_MAP[genId]?.machined; }
  const face = makeWheelMaterials(w, finishes).face;
  const machinedMat = new THREE.MeshPhysicalMaterial({ color: '#e9ebee', metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide });
  const darkMat = new THREE.MeshPhysicalMaterial({ color: '#2b2d31', metalness: 0.75, roughness: 0.32, clearcoat: 0.8, side: THREE.DoubleSide });
  const barrelMat = new THREE.MeshStandardMaterial({ color: '#9a9ca1', metalness: 0.9, roughness: 0.42, side: THREE.DoubleSide });
  const spokeMats = machined ? [machinedMat, darkMat] : face;
  const lipMat = w.lip ? shared.chrome : face;

  const spin = new THREE.Group();
  const isDish = styleId === 'dish';
  const hw = rimW / 2;
  const lipD = isDish ? 0.02 + rimW * 0.28 : 0.014;
  const faceR = isDish ? rimR * 0.74 : rimR - 0.014;
  const zf = hw - lipD;

  if (modelRim) {
    spin.add(modelRim);
  } else {
    // --- barrel: inner flange, bead seat, hump, drop center, outer bead seat ---
    const fl = 0.0175; // flange height
    spin.add(new THREE.Mesh(lathe([
      [rimR + fl * 0.7, -hw - 0.002], [rimR + fl, -hw + 0.004], [rimR + fl * 0.6, -hw + 0.012], [rimR, -hw + 0.014],
      [rimR, -hw + 0.03], [rimR + 0.003, -hw + 0.036], [rimR - 0.002, -hw + 0.042],
      [rimR - 0.026, -hw * 0.35], [rimR - 0.028, -hw * 0.1], [rimR - 0.026, hw * 0.05],
      [rimR - 0.002, zf - 0.045], [rimR + 0.002, zf - 0.04], [rimR, zf - 0.03],
      [faceR + 0.004, zf - 0.012],
    ], 72), barrelMat));
    // --- outer lip / dish ---
    const lipPts = isDish
      ? [[faceR + 0.004, zf - 0.012], [faceR + 0.008, zf - 0.002], [faceR + 0.014, zf + 0.002], [rimR * 0.97, hw - 0.012], [rimR + 0.004, hw - 0.008], [rimR + fl, hw - 0.004], [rimR + fl * 0.85, hw + 0.002], [rimR + fl * 0.3, hw + 0.001], [rimR, hw - 0.012]]
      : [[faceR + 0.004, zf - 0.012], [faceR + 0.006, zf - 0.002], [rimR - 0.002, hw - 0.008], [rimR + fl * 0.6, hw - 0.004], [rimR + fl, hw - 0.002], [rimR + fl * 0.9, hw + 0.002], [rimR + fl * 0.3, hw + 0.001], [rimR - 0.002, hw - 0.01]];
    spin.add(new THREE.Mesh(lathe(lipPts, 96), lipMat));
    // ring joining spokes to the lip
    spin.add(new THREE.Mesh(lathe([[faceR - 0.012, zf - 0.003], [faceR - 0.004, zf + 0.002], [faceR + 0.006, zf - 0.002], [faceR + 0.006, zf - 0.02], [faceR - 0.012, zf - 0.02]], 96), machined ? darkMat : face));
    if (isDish) {
      // 3-piece rivets around the dish step
      const rivGeo = new THREE.SphereGeometry(0.0036, 8, 6);
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const r = new THREE.Mesh(rivGeo, shared.chrome);
        r.position.set(Math.cos(a) * (faceR + 0.011), Math.sin(a) * (faceR + 0.011), zf + 0.002);
        spin.add(r);
      }
    }

    const r0 = 0.072;
    const addSpokes = (n, opts) => {
      const { w0, w1, t, concave = 0.02, skew = 0, start = r0, end = faceR, offsetA = 0, foot = 1.5 } = opts;
      const base = spokeGeo(start, end, w0, w1, t, { skew, concave, zf, foot });
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(base, spokeMats);
        m.rotation.z = (i / n) * Math.PI * 2 + offsetA;
        spin.add(m);
      }
    };
    const k = rimR / 0.2159; // scale spoke widths a little with rim size (17" = 1)
    switch (styleId) {
      case 'spoke5': addSpokes(5, { w0: 0.062 * k, w1: 0.046 * k, t: 0.032, concave: 0.016 }); break;
      case 'spoke6': addSpokes(6, { w0: 0.05 * k, w1: 0.027 * k, t: 0.03, concave: 0.034, foot: 1.9 }); break;
      case 'split5':
        addSpokes(5, { w0: 0.024 * k, w1: 0.021 * k, t: 0.028, concave: 0.022, offsetA: 0.1 });
        addSpokes(5, { w0: 0.024 * k, w1: 0.021 * k, t: 0.028, concave: 0.022, offsetA: -0.1 });
        break;
      case 'mesh':
        addSpokes(10, { w0: 0.016 * k, w1: 0.014 * k, t: 0.022, concave: 0.016, skew: 0.05, foot: 1.2 });
        addSpokes(10, { w0: 0.016 * k, w1: 0.014 * k, t: 0.022, concave: 0.016, skew: -0.05, foot: 1.2 });
        break;
      case 'multi': addSpokes(15, { w0: 0.02 * k, w1: 0.016 * k, t: 0.026, concave: 0.022, foot: 1.3 }); break;
      case 'yspoke':
        addSpokes(5, { w0: 0.042 * k, w1: 0.032 * k, t: 0.03, concave: 0.02, end: faceR * 0.62, foot: 1 });
        addSpokes(5, { w0: 0.022 * k, w1: 0.019 * k, t: 0.028, concave: 0.0, start: faceR * 0.55, offsetA: 0.16 });
        addSpokes(5, { w0: 0.022 * k, w1: 0.019 * k, t: 0.028, concave: 0.0, start: faceR * 0.55, offsetA: -0.16 });
        break;
      case 'dish': addSpokes(6, { w0: 0.046, w1: 0.032, t: 0.026, concave: 0.0, foot: 1.3 }); break;
      case 'aero': spin.add(new THREE.Mesh(discWithHoles(r0, faceR, 8, r0 + 0.03, faceR - 0.02, 0.035, 0.014, zf), face)); break;
      case 'turbo': {
        spin.add(new THREE.Mesh(discWithHoles(r0, faceR, 14, r0 + 0.02, faceR - 0.015, 0.018, 0.012, zf - 0.012, 0.35), face));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(faceR - 0.006, 0.008, 8, 64), face);
        ring.position.z = zf - 0.006; spin.add(ring);
        break;
      }
      case 'cover': {
        const plastic = new THREE.MeshStandardMaterial({ color: '#b8bcc2', metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide });
        spin.add(new THREE.Mesh(discWithHoles(0.0001, rimR + 0.004, 10, rimR * 0.55, rimR * 0.9, 0.022, 0.01, hw + 0.012), plastic));
        spin.add(new THREE.Mesh(discWithHoles(r0, faceR, 8, r0 + 0.04, faceR - 0.03, 0.02, 0.006, zf - 0.02), darkMat));
        break;
      }
      default: addSpokes(5, { w0: 0.06, w1: 0.045, t: 0.032 });
    }
    if (styleId !== 'cover') {
      // concave hub, lug recesses, conical lug nuts (4x100), center cap
      const hubZ = zf - 0.03 - (styleId === 'spoke6' ? 0.034 : 0.022);
      spin.add(new THREE.Mesh(lathe([[0.03, hubZ + 0.036], [0.05, hubZ + 0.034], [0.074, hubZ + 0.03], [0.08, hubZ + 0.018], [0.08, hubZ - 0.01], [0.03, hubZ - 0.01]], 48), machined ? darkMat : face));
      const capMat = new THREE.MeshPhysicalMaterial({ color: '#111214', metalness: 0.6, roughness: 0.25, clearcoat: 1 });
      spin.add(new THREE.Mesh(lathe([[0, hubZ + 0.044], [0.018, hubZ + 0.043], [0.028, hubZ + 0.04], [0.03, hubZ + 0.034]], 32), capMat));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0025, 6, 32), shared.chrome);
      ring.position.z = hubZ + 0.043; spin.add(ring);
      const hole = new THREE.CircleGeometry(0.0115, 16);
      const nut = lathe([[0, 0.022], [0.0072, 0.022], [0.0085, 0.019], [0.0085, 0.008], [0.0105, 0.004], [0.006, -0.002]], 6);
      const lugs = LUGS[genId] || 4;
      for (let i = 0; i < lugs; i++) {
        const a = (i / lugs) * Math.PI * 2 + Math.PI / 4;
        const hm = new THREE.Mesh(hole, shared.black);
        hm.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, hubZ + 0.0345);
        spin.add(hm);
        const n = new THREE.Mesh(nut, shared.chrome);
        n.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, hubZ + 0.028);
        spin.add(n);
      }
    }
    // valve stem
    const valve = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.004, 0.022, 10).rotateX(Math.PI / 2), shared.rubber);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.009, 10).rotateX(Math.PI / 2), shared.chrome);
    cap.position.z = 0.014;
    valve.add(stem, cap);
    const va = Math.PI * 0.37;
    valve.position.set(Math.cos(va) * (rimR - 0.006), Math.sin(va) * (rimR - 0.006), zf - 0.012);
    valve.lookAt(Math.cos(va) * (rimR - 0.03), Math.sin(va) * (rimR - 0.03), zf + 0.05);
    spin.add(valve);
  }

  // --- brake disc (drilled/slotted with big brake kit) ---
  const discR = Math.min(rimR - 0.045, w.bigBrake ? 0.165 : 0.128);
  const discZ = Math.min(zf - 0.08, -0.01);
  const dTex = discTexture(!!w.bigBrake);
  const discMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: dTex, metalness: 0.85, roughness: 0.38 });
  const dg = new THREE.CylinderGeometry(discR, discR, 0.024, 64).rotateX(Math.PI / 2);
  planarUV(dg, discR);
  const disc = new THREE.Mesh(dg, [shared.disc, discMat, discMat]);
  disc.position.z = discZ;
  spin.add(disc);

  // --- tire ---
  spin.add(buildTire(T, w));

  // --- caliper (does not spin) ---
  const caliper = new THREE.Group();
  const span = w.bigBrake ? 0.7 : 0.5, ri = discR - 0.048, ro = discR + 0.014;
  const cs = new THREE.Shape();
  cs.absarc(0, 0, ro, -span / 2, span / 2, false);
  cs.absarc(0, 0, ri, span / 2, -span / 2, true);
  cs.closePath();
  const calMat = new THREE.MeshPhysicalMaterial({ color: w.caliper, metalness: 0.15, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05 });
  const depth = w.bigBrake ? 0.08 : 0.062;
  const cg = new THREE.ExtrudeGeometry(cs, { depth, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 16 });
  cg.translate(0, 0, discZ - depth / 2);
  caliper.add(new THREE.Mesh(cg, calMat));
  // pad window / bridge detail
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, depth * 0.6), shared.black);
  bridge.position.set(ro + 0.006, 0, discZ);
  caliper.add(bridge);

  spin.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  caliper.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { spin, caliper, T, rimW };
}
