// Car assembly: body, details, body kit, wheels, lights, plates, optional GLB models.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadTemplate, getReadyTemplate, getWheelModel, makeGLBProfile } from './glbcar.js';
import { makeProfile, buildBodyGeometry, conform, polyShape, lineShape, extrude } from './body.js';
import { buildWheel, tireSpec, normalizeWheels, makeWheelMaterials } from './wheels.js';
import { GENERATIONS, WHEEL_FINISHES, WHEEL_STYLES, FILM_TYPES, PLATE_STYLES, ADDONS } from './catalog.js';
import { newPaint, setPaint, setCarbon, newGlass, setGlass, shared, getCarbonTexture } from './materials.js';

// ---------- style tables (x = outward from lamp center, y = up), meters ----------
const HEAD = {
  teardrop: { pts: [[-0.2, -0.02], [-0.16, -0.075], [0.1, -0.082], [0.19, -0.035], [0.205, 0.06], [0.12, 0.1], [-0.12, 0.055]], r: 0.04, lamps: [[0.08, 0.005, 0.048], [-0.07, -0.01, 0.034]], drl: null, inside: 'chrome' },
  teardropClear: { base: 'teardrop', inside: 'chromeBright', lamps: [[0.08, 0.005, 0.05], [-0.07, -0.01, 0.036]] },
  swept: { pts: [[-0.22, -0.03], [-0.19, -0.066], [0.12, -0.075], [0.2, -0.02], [0.215, 0.07], [0.1, 0.088], [-0.19, 0.03]], r: 0.03, lamps: [[0.1, 0.01, 0.045], [-0.04, 0.0, 0.035]], drl: null, inside: 'chrome' },
  sweptDark: { base: 'swept', inside: 'dark' },
  angular: { pts: [[-0.25, -0.01], [-0.21, -0.052], [0.08, -0.062], [0.19, -0.036], [0.215, 0.05], [0.15, 0.072], [-0.06, 0.042]], r: 0.012, lamps: [[0.11, 0.0, 0.042], [0.0, -0.01, 0.034]], drl: null, inside: 'chrome' },
  angularLed: { base: 'angular', inside: 'dark', lamps: [[0.11, 0.0, 0.04], [0.02, -0.01, 0.03]], drl: [[-0.22, -0.03], [-0.08, -0.042], [0.1, -0.046], [0.18, -0.025]] },
  slim: { pts: [[-0.26, 0.0], [-0.23, -0.028], [0.12, -0.04], [0.21, -0.062], [0.225, 0.008], [0.15, 0.035], [-0.21, 0.025]], r: 0.01, lamps: [[0.15, -0.012, 0.022], [0.09, -0.008, 0.022], [0.03, -0.005, 0.022]], drl: [[-0.24, 0.012], [-0.05, 0.016], [0.12, 0.022], [0.2, 0.0]], inside: 'dark' },
};
const TAIL = {
  tall: { pts: [[-0.09, -0.12], [0.12, -0.125], [0.165, 0.0], [0.15, 0.095], [-0.07, 0.09]], r: 0.03, inner: 'rings', clear: false },
  tallClear: { base: 'tall', clear: true },
  wrap: { pts: [[-0.2, -0.04], [0.16, -0.07], [0.215, 0.0], [0.2, 0.065], [-0.17, 0.06]], r: 0.02, inner: 'bar', clear: false },
  wrapClear: { base: 'wrap', clear: true },
  wrapSharp: { pts: [[-0.23, -0.02], [-0.18, -0.06], [0.18, -0.072], [0.225, 0.02], [0.2, 0.065], [-0.11, 0.05]], r: 0.01, inner: 'bar', clear: false },
  wrapLed: { base: 'wrapSharp', inner: 'led', clear: false },
  slimBar: { pts: [[-0.26, -0.015], [0.2, -0.042], [0.235, 0.02], [0.2, 0.048], [-0.26, 0.022]], r: 0.01, inner: 'led', clear: false },
};
const GRILLE = {
  oval: { w: 0.24, h: 0.055, kind: 'ellipse', frame: 'chrome', bar: false },
  ovalBar: { w: 0.26, h: 0.058, kind: 'ellipse', frame: 'chrome', bar: true },
  bar: { pts: [[-0.32, -0.05], [0.32, -0.05], [0.36, 0.035], [-0.36, 0.035]], r: 0.025, frame: 'chrome', bar: true },
  barWide: { pts: [[-0.36, -0.05], [0.36, -0.05], [0.4, 0.035], [-0.4, 0.035]], r: 0.02, frame: 'chrome', bar: true },
  slot: { pts: [[-0.3, -0.028], [0.3, -0.028], [0.33, 0.022], [-0.33, 0.022]], r: 0.012, frame: 'chrome', bar: false },
  slotThin: { pts: [[-0.3, -0.018], [0.3, -0.018], [0.34, 0.016], [-0.34, 0.016]], r: 0.008, frame: 'black', bar: true },
  slimUpper: { pts: [[-0.36, -0.016], [0.36, -0.016], [0.4, 0.012], [-0.4, 0.012]], r: 0.006, frame: 'black', bar: false },
};
const LOWER = {
  smallSlot: { pts: [[-0.3, -0.04], [0.3, -0.04], [0.33, 0.03], [-0.33, 0.03]], r: 0.02, mesh: false, dy: 0 },
  wideSlot: { pts: [[-0.42, -0.05], [0.42, -0.05], [0.45, 0.04], [-0.45, 0.04]], r: 0.025, mesh: false, dy: 0 },
  trapSmall: { pts: [[-0.42, -0.09], [0.42, -0.09], [0.3, 0.07], [-0.3, 0.07]], r: 0.02, mesh: true, dy: 0 },
  trapBig: { pts: [[-0.55, -0.11], [0.55, -0.11], [0.44, 0.13], [0.22, 0.2], [-0.22, 0.2], [-0.44, 0.13]], r: 0.03, mesh: true, dy: 0.02 },
  trapMesh: { pts: [[-0.55, -0.11], [0.55, -0.11], [0.44, 0.13], [0.22, 0.19], [-0.22, 0.19], [-0.44, 0.13]], r: 0.03, mesh: true, dy: 0.02, chromeEdge: true },
  hexBig: { pts: [[-0.5, -0.1], [0.5, -0.1], [0.57, 0.04], [0.43, 0.16], [-0.43, 0.16], [-0.57, 0.04]], r: 0.02, mesh: true, dy: 0.02 },
};
const resolve = (table, id) => { const t = table[id]; return t.base ? { ...table[t.base], ...t, base: undefined } : t; };

function circlePts(cx, cy, r, n = 20, sx = 1, sy = 1) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([cx + Math.cos(a) * r * sx, cy + Math.sin(a) * r * sy]); }
  return p;
}
const shift = (pts, cx, cy, side = 1, scale = 1) => {
  const out = pts.map(([x, y]) => [side * (cx + x * scale), cy + y * scale]);
  return side < 0 ? out.reverse() : out;
};

let meshTex = null;
function getMeshTexture() {
  if (meshTex) return meshTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#2c2e33'; g.lineWidth = 5;
  for (let y = -1; y < 3; y++) for (let x = -1; x < 3; x++) {
    const ox = x * 32 + (y % 2 ? 16 : 0), oy = y * 28;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(ox + 16 + Math.cos(a) * 15, oy + 16 + Math.sin(a) * 15); }
    g.closePath(); g.stroke();
  }
  meshTex = new THREE.CanvasTexture(c);
  meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping;
  meshTex.repeat.set(16, 16);
  meshTex.colorSpace = THREE.SRGBColorSpace;
  return meshTex;
}

function disposeGroup(g) {
  g.traverse((o) => { if (o.isMesh && !o.userData.shared) o.geometry?.dispose(); });
  g.clear();
}

export class Car {
  constructor() {
    this.root = new THREE.Group();
    this.chassis = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.kitGroup = new THREE.Group();
    this.glbGroup = new THREE.Group();
    this.addonGroup = new THREE.Group();
    this.wheelGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.chassis.add(this.bodyGroup, this.kitGroup, this.glbGroup, this.addonGroup);
    this.root.add(this.chassis, this.wheelGroup, this.fxGroup);
    const m = this.m = {
      paint: newPaint(), roof: newPaint(), hood: newPaint(), mirror: newPaint(), kit: newPaint(),
      ws: newGlass(), side: newGlass(), rear: newGlass(),
      headHousing: new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 1, roughness: 0.12, side: THREE.DoubleSide }),
      headLamp: new THREE.MeshStandardMaterial({ color: '#f4f6ff', emissive: '#fffaf0', emissiveIntensity: 0.05, metalness: 0.4, roughness: 0.1, side: THREE.DoubleSide }),
      drl: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e9f2ff', emissiveIntensity: 0.6, side: THREE.DoubleSide }),
      lens: new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, roughness: 0, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
      tail: new THREE.MeshPhysicalMaterial({ color: '#8a0b12', emissive: '#ff1a1a', emissiveIntensity: 0.08, roughness: 0.15, clearcoat: 1, side: THREE.DoubleSide }),
      tailInner: new THREE.MeshStandardMaterial({ color: '#ff3b3b', emissive: '#ff1f1f', emissiveIntensity: 0.25, side: THREE.DoubleSide }),
      grilleMesh: new THREE.MeshStandardMaterial({ color: '#ffffff', map: getMeshTexture(), roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
      visor: new THREE.MeshPhysicalMaterial({ color: '#0c0d10', transparent: true, opacity: 0.82, roughness: 0.08, clearcoat: 1, side: THREE.DoubleSide }),
      exhaust: new THREE.MeshPhysicalMaterial({ color: '#eeeeee', metalness: 1, roughness: 0.08, side: THREE.DoubleSide }),
      underglow: new THREE.MeshBasicMaterial({ color: '#00c8ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    this.bodyMats = [m.paint, m.ws, m.side, m.rear, shared.black, m.roof, m.hood, m.paint];
    this.plateCanvas = document.createElement('canvas');
    this.plateCanvas.width = 680; this.plateCanvas.height = 300;
    this.plateTex = new THREE.CanvasTexture(this.plateCanvas);
    this.plateTex.colorSpace = THREE.SRGBColorSpace;
    this.plateTex.anisotropy = 8;
    this.plateMat = new THREE.MeshStandardMaterial({ map: this.plateTex, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide });
    this.corners = [];
    this.loader = new GLTFLoader();
    import('three/addons/libs/meshopt_decoder.module.js').then((m) => this.loader.setMeshoptDecoder(m.MeshoptDecoder));
    this.onNotice = () => {};
    // headlights for driving at night
    this.beams = [1, -1].map(() => {
      const s = new THREE.SpotLight('#fff6e5', 0, 40, 0.45, 0.5, 1.2);
      this.root.add(s, s.target);
      return s;
    });
  }

  get gen() { return GENERATIONS.find((g) => g.id === this.b.gen) || GENERATIONS[0]; }

  setBuild(build) {
    this.b = JSON.parse(JSON.stringify(build));
    this.buildBody();
    this.buildKit();
    this.buildWheels();
    this.applyPaint(); this.applyGlass(); this.applyLights(); this.applySuspension(); this.drawPlate();
    this.loadAddons();
  }

  // Apply a change to one section of the build (avoids full rebuilds).
  update(build, section) {
    this.b = JSON.parse(JSON.stringify(build));
    switch (section) {
      case 'gen': this.setBuild(build); break;
      case 'paint': this.applyPaint(); break;
      case 'wheels': this.buildWheels(); this.applySuspension(); break;
      case 'glass': this.applyGlass(); this.buildKit(); break;
      case 'kit': this.buildKit(); this.applyPaint(); break;
      case 'lights': this.applyLights(); break;
      case 'suspension': this.applySuspension(); break;
      case 'plate': this.drawPlate(); this.buildBodyPlatesVisibility(); break;
      case 'addons': this.loadAddons(); break;
      default: this.setBuild(build);
    }
  }

  // ---------------- body ----------------
  buildBody() {
    disposeGroup(this.bodyGroup);
    disposeGroup(this.glbGroup);
    const gen = this.gen;
    let P = makeProfile(gen);
    this.tpl = null;
    this.glbMats = null;
    if (gen.glb) {
      const tpl = getReadyTemplate(gen.glb);
      if (tpl) { this.tpl = tpl; P = makeGLBProfile(P, tpl); } else this.loadGLB(gen);
    }
    this.P = P;
    if (this.tpl) { this.buildFromGLB(); return; }
    const body = new THREE.Mesh(buildBodyGeometry(P), this.bodyMats);
    body.castShadow = true; body.receiveShadow = true;
    body.name = 'body';
    this.bodyGroup.add(body);
    this.buildDetails(P, gen);
    this.bodyGroup.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  }

  // ---------------- real model (.glb) ----------------
  loadGLB(gen) {
    if (this._loading === gen.glb) return;
    this._loading = gen.glb;
    this.onNotice(`กำลังโหลดโมเดลจริง ${gen.name}…`);
    loadTemplate(gen.glb, gen.glbConfig || {}).then(() => {
      this._loading = null;
      if (this.b.gen === gen.id) this.setBuild(this.b);
      this.onNotice(`โหลดโมเดลจริง ${gen.name} แล้ว`);
    }).catch((e) => {
      this._loading = null;
      console.warn(e);
      this.onNotice(`โหลดไฟล์ ${gen.glb} ไม่สำเร็จ — ใช้โมเดลพาราเมตริกแทน`);
    });
  }

  buildFromGLB() {
    const m = this.m, P = this.P;
    const inst = this.tpl.root.clone(true);
    this.glbMats = { head: [], tail: [] };
    this.plateMeshes = [];
    inst.traverse((o) => {
      if (!o.isMesh) return;
      const r = o.userData.role;
      if (r === 'wheel') o.visible = false;
      else if (r === 'paint') o.material = [m.paint, m.roof, m.hood, m.paint];
      else if (r === 'windows') o.material = [m.ws, m.side, m.rear];
      else if (r === 'head') { o.material = o.material.clone(); this.glbMats.head.push(o.material); }
      else if (r === 'tail') { o.material = o.material.clone(); o.material.userData.base = o.material.color.clone(); this.glbMats.tail.push(o.material); }
      else if (r === 'plateF' || r === 'plateR') { o.material = this.plateMat; this.plateMeshes.push(o); }
      else if (r === 'mirrorGlass') o.material = shared.mirrorGlass;
    });
    this.glbGroup.add(inst);
    this.lowerY = P.section(P.xmax - 0.18).yb + 0.17;
    this.buildBodyPlatesVisibility();
  }

  add(geo, mat, group = this.bodyGroup) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }

  sideGlassRange(P) {
    let a = null, b = null;
    for (let x = P.xmin; x <= P.xmax; x += 0.01) {
      const S = P.section(x);
      const minH = x > 0 ? 0.42 : 0.62;
      const glass = S.g >= 0.999 || (S.g > 0.001 && S.h > minH && S.winH > 0.06);
      if (glass) { if (a === null) a = x; b = x; }
    }
    return [a, b];
  }

  buildDetails(P, gen) {
    const st = gen.style, body = gen.body, m = this.m;
    const sF = P.section(P.xmax - 0.35);
    const sR = P.section(P.xmin + 0.3);
    // --- headlights ---
    const H = resolve(HEAD, st.head);
    const noseTop = P.section(P.xmax - 0.16).top;
    const headY = noseTop - 0.055, headZ = sF.hw - 0.255;
    this.noseTop = noseTop;
    const housingMat = H.inside === 'dark'
      ? new THREE.MeshStandardMaterial({ color: '#1b1d21', metalness: 0.8, roughness: 0.25, side: THREE.DoubleSide })
      : H.inside === 'chromeBright' ? shared.chrome : m.headHousing;
    this.headHousingMat = housingMat;
    for (const side of [1, -1]) {
      const pts = shift(H.pts, headZ, headY, side);
      this.add(conform(P, extrude(polyShape(pts, H.r), 0.01), 'front', { off: -0.004 }), housingMat);
      for (const [lx, ly, lr] of H.lamps) {
        this.add(conform(P, extrude(polyShape(shift(circlePts(lx, ly, lr * 1.25), headZ, headY, side)), 0.004), 'front', { off: 0.0 }), shared.chrome);
        this.add(conform(P, extrude(polyShape(shift(circlePts(lx, ly, lr), headZ, headY, side)), 0.006), 'front', { off: 0.001 }), m.headLamp);
      }
      if (H.drl) this.add(conform(P, extrude(lineShape(shift(H.drl, headZ, headY, side), 0.012), 0.004), 'front', { off: 0.002 }), m.drl);
      this.add(conform(P, extrude(polyShape(pts, H.r), 0.002), 'front', { off: 0.008 }), m.lens);
    }
    // --- grille ---
    const G = GRILLE[st.grille];
    const gy = noseTop - 0.085;
    const gPts = G.kind === 'ellipse' ? circlePts(0, 0, 1, 40, G.w, G.h) : G.pts;
    const scaleUp = (pts, k) => pts.map(([x, y]) => [x + Math.sign(x) * k * 0.6, y + Math.sign(y) * k * 0.4]);
    const at = (pts, cx, cy) => pts.map(([x, y]) => [cx + x, cy + y]);
    this.add(conform(P, extrude(polyShape(at(scaleUp(gPts, 0.03), 0, gy), G.r || 0), 0.006), 'front', { off: -0.002 }), G.frame === 'chrome' ? shared.chrome : shared.blackGloss);
    this.add(conform(P, extrude(polyShape(at(gPts, 0, gy), G.r || 0), 0.004), 'front', { off: 0.003 }), m.grilleMesh);
    if (G.bar) {
      const bw = G.kind === 'ellipse' ? G.w * 0.95 : Math.abs(gPts[0][0]) + 0.02;
      this.add(conform(P, extrude(polyShape([[-bw, gy - 0.008], [bw, gy - 0.008], [bw, gy + 0.008], [-bw, gy + 0.008]], 0.004), 0.004), 'front', { off: 0.006 }), shared.chrome);
    }
    // emblem (generic oval badge)
    const ey = G.kind === 'ellipse' || st.grille.startsWith('bar') ? gy : gy + 0.005;
    this.add(conform(P, extrude(polyShape(circlePts(0, ey, 1, 32, 0.06, 0.042)), 0.004), 'front', { off: 0.008 }), shared.chrome);
    this.add(conform(P, extrude(polyShape(circlePts(0, ey, 1, 32, 0.048, 0.031)), 0.004), 'front', { off: 0.009 }), shared.blackGloss);
    this.add(conform(P, extrude(polyShape(circlePts(0, ey, 1, 24, 0.02, 0.026)), 0.004), 'front', { off: 0.011 }), shared.chrome);
    // --- lower intake ---
    const Lw = LOWER[st.lower];
    const ly = gen.dims.clear + 0.235 + (Lw.dy || 0);
    this.lowerY = ly;
    if (Lw.chromeEdge) this.add(conform(P, extrude(polyShape(at(Lw.pts.map(([x, y]) => [x * 1.03, y * 1.08]), 0, ly), Lw.r), 0.005), 'front', { off: -0.002 }), shared.chrome);
    this.add(conform(P, extrude(polyShape(at(Lw.pts, 0, ly), Lw.r), 0.005), 'front', { off: -0.001 }), Lw.mesh ? m.grilleMesh : shared.blackGloss);
    // fog lights
    if (st.fog) {
      for (const side of [1, -1]) {
        const fz = side * (sF.hw - 0.3), fy = ly - 0.02;
        this.add(conform(P, extrude(polyShape(circlePts(fz, fy, 0.055, 24, 1.4, 1)), 0.006), 'front', { off: 0.001 }), shared.blackGloss);
        this.add(conform(P, extrude(polyShape(circlePts(fz, fy, 0.034, 24, 1.2, 1)), 0.006), 'front', { off: 0.004 }), m.headLamp);
      }
    }
    // --- tail lights ---
    const T = resolve(TAIL, st.tail);
    const tailTop = P.section(P.xmin + 0.015).top + 0.02;
    const tailY = tailTop - 0.07, tailZ = sR.hw - 0.21;
    for (const side of [1, -1]) {
      const pts = shift(T.pts, tailZ, tailY, side);
      this.add(conform(P, extrude(polyShape(pts, T.r), 0.01), 'rear', { off: -0.004 }), T.clear ? shared.chrome : m.tail);
      if (T.inner === 'rings' || T.clear) {
        for (const [cx, cy, r] of [[0.05, 0.02, 0.04], [0.05, -0.07, 0.03]]) {
          this.add(conform(P, extrude(polyShape(shift(circlePts(cx, cy, r), tailZ, tailY, side)), 0.004), 'rear', { off: 0.002 }), m.tailInner);
        }
      }
      if (T.inner === 'bar' || T.inner === 'led') {
        const ptsL = [[-0.15, 0.01], [0.0, -0.005], [0.14, -0.02], [0.19, 0.01]];
        this.add(conform(P, extrude(lineShape(shift(ptsL, tailZ, tailY, side), T.inner === 'led' ? 0.01 : 0.02), 0.004), 'rear', { off: 0.002 }), m.tailInner);
      }
      this.add(conform(P, extrude(polyShape(pts, T.r), 0.002), 'rear', { off: 0.007 }), m.lens);
    }
    // rear emblem + trunk garnish
    this.add(conform(P, extrude(polyShape(circlePts(0, tailTop - 0.07, 1, 32, 0.055, 0.038)), 0.004), 'rear', { off: 0.003 }), shared.chrome);
    this.add(conform(P, extrude(polyShape(circlePts(0, tailTop - 0.07, 1, 32, 0.044, 0.028)), 0.004), 'rear', { off: 0.004 }), shared.blackGloss);
    this.add(conform(P, extrude(polyShape([[-0.32, tailTop - 0.135], [0.32, tailTop - 0.135], [0.32, tailTop - 0.12], [-0.32, tailTop - 0.12]], 0.005), 0.003), 'rear', { off: 0.001 }), shared.chrome);
    // --- plates ---
    this.plateMeshes = [];
    const plateRect = (cy) => polyShape([[-0.17, cy - 0.075], [0.17, cy - 0.075], [0.17, cy + 0.075], [-0.17, cy + 0.075]], 0.01);
    const plateGeo = (cy, frame, off) => {
      const g = extrude(plateRect(cy), 0.004, 4, 0.04);
      const p = g.attributes.position, uv = g.attributes.uv;
      // front frame: +z (a) is on the viewer's left, so flip U there
      for (let i = 0; i < p.count; i++) uv.setXY(i, frame === 'rear' ? p.getX(i) / 0.34 + 0.5 : 0.5 - p.getX(i) / 0.34, (p.getY(i) - cy) / 0.15 + 0.5);
      return conform(P, g, frame, { off });
    };
    const fpY = Lw.mesh ? ly - 0.03 : ly - 0.0;
    const fp = this.add(plateGeo(fpY, 'front', 0.012), this.plateMat);
    const rp = this.add(plateGeo(tailTop - 0.23, 'rear', 0.004), this.plateMat);
    this.plateMeshes.push(fp, rp);
    // --- mirrors ---
    const mx = P.xWsBase - 0.13;
    const ms = P.section(mx);
    for (const side of [1, -1]) {
      const zb = (P.sideAt(mx, ms.y6 + 0.03) ?? ms.hw) - 0.01;
      const g = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m.mirror);
      shell.scale.set(0.075, 0.065, 0.115);
      shell.position.set(0, 0, 0.13);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(1, 24), shared.mirrorGlass);
      glass.scale.set(0.1, 0.052, 1); glass.rotation.y = -Math.PI / 2; glass.position.set(-0.035, 0, 0.13);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.1), shared.blackGloss);
      arm.position.set(0.0, -0.025, 0.05);
      const signal = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.09), new THREE.MeshStandardMaterial({ color: '#ffb84d', emissive: '#ff9a1a', emissiveIntensity: 0.3 }));
      signal.position.set(0.055, -0.02, 0.15);
      g.add(shell, glass, arm, signal);
      g.position.set(mx, ms.y6 + 0.06, side * zb);
      if (side < 0) g.scale.z = -1;
      g.rotation.y = side * 0.06;
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.bodyGroup.add(g);
    }
    // --- door seams, handles, pillars, trims ---
    const tireR = P.tireR;
    const yb = gen.dims.clear;
    const s1x = P.fAx - tireR - 0.13;
    const s3lx = P.rAx + tireR + 0.09;
    const [gA, gB] = this.sideGlassRange(P);
    const xB = s1x - 0.575 * (s1x - s3lx);
    const yAt = (x) => P.section(x).y6;
    const p8At = (x) => P.section(x).pts[8][1];
    const seamLines = [
      [[s1x, yb + 0.07], [s1x, yAt(s1x) - 0.06], [Math.min(P.xWsBase - 0.08, s1x + 0.12), yAt(s1x)]],
      [[xB, yb + 0.06], [xB, yAt(xB)]],
      [[s3lx, yb + 0.07], [s3lx, 2 * tireR + 0.09], [gA + 0.17, yAt(gA + 0.17)]],
    ];
    const handleY = (x) => yAt(x) - 0.085;
    for (const frame of ['sideR', 'sideL']) {
      for (const line of seamLines) {
        const dense = [];
        for (let i = 0; i < line.length - 1; i++) {
          const [x0, y0] = line[i], [x1, y1] = line[i + 1];
          const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.03));
          for (let k = 0; k < n; k++) dense.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
        }
        dense.push(line[line.length - 1]);
        this.add(conform(P, extrude(lineShape(dense, 0.0045), 0.001, 2, 0.03), frame, { off: 0.0004 }), shared.black);
      }
      for (const hx of [xB + 0.2, s3lx + 0.2]) {
        const hy = handleY(hx);
        this.add(conform(P, extrude(polyShape([[hx - 0.065, hy - 0.014], [hx + 0.065, hy - 0.014], [hx + 0.065, hy + 0.014], [hx - 0.065, hy + 0.014]], 0.012), 0.012, 4, 0.02), frame, { off: 0.001 }), m.paint);
        this.add(conform(P, extrude(polyShape([[hx - 0.075, hy - 0.022], [hx + 0.075, hy - 0.022], [hx + 0.075, hy + 0.022], [hx - 0.075, hy + 0.022]], 0.02), 0.001, 4, 0.02), frame, { off: 0.0002 }), shared.black);
      }
      // B pillar (black gloss) & rear-door / quarter glass divider
      for (const [px, w] of [[xB, 0.035], [gA + 0.17, 0.014]]) {
        const pts = [];
        const yTop = p8At(px) - 0.004;
        const y0 = yAt(px);
        pts.push([px - w, y0], [px + w, y0], [px + w * 0.9, yTop], [px - w * 0.9, yTop]);
        this.add(conform(P, extrude(polyShape(pts), 0.003, 2, 0.03), frame, { off: 0.0015 }), shared.blackGloss);
      }
      // belt trim along window bottom
      const belt = [];
      for (let x = gA; x <= gB; x += 0.03) belt.push([x, yAt(x) + 0.006]);
      if (belt.length > 2) this.add(conform(P, extrude(lineShape(belt, 0.014), 0.004, 2, 0.04), frame, { off: 0.001 }), shared.blackGloss);
    }
    // hood & trunk seams
    const hoodFront = P.xmax - 0.27, trunkRear = P.xmin + 0.17;
    const hz = (x) => P.section(x).hw * 0.8;
    const seamTop = (pts) => this.add(conform(P, extrude(lineShape(pts, 0.004), 0.001, 2, 0.03), 'top', { off: 0.0004 }), shared.black);
    for (const s of [1, -1]) {
      const hl = []; for (let x = P.xWsBase + 0.04; x <= hoodFront; x += 0.04) hl.push([x, s * hz(x)]);
      seamTop(hl);
      const tl = []; for (let x = trunkRear; x <= P.xRgBase - 0.03; x += 0.04) tl.push([x, s * P.section(x).hw * 0.78]);
      seamTop(tl);
    }
    const across = (x, k) => { const pts = []; const w = P.section(x).hw * k; for (let z = -w; z <= w + 1e-6; z += 0.05) pts.push([x, z]); return pts; };
    seamTop(across(hoodFront, 0.8));
    seamTop(across(P.xRgBase - 0.03, 0.78));
    // shark fin antenna
    this.sharkFin = null;
    // --- interior (visible through glass) ---
    const yIn = gen.dims.clear + 0.1;
    const box = (sx, sy, sz, x, y, z, mat = shared.interior, rz = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      b.position.set(x, y, z); b.rotation.z = rz; this.bodyGroup.add(b); return b;
    };
    const rw = P.section(0).rw;
    const yBelt = yAt(0);
    box(P.xWsBase - s3lx, yBelt - yIn, 2 * (P.section(0).hw - 0.08), (P.xWsBase + s3lx) / 2 - 0.05, (yBelt + yIn) / 2 - 0.02, 0);
    box(0.45, 0.12, 2 * rw - 0.06, P.xWsBase - 0.42, yBelt - 0.02, 0); // dashboard
    box(P.xWsTop - P.xRgTop, 0.02, 2 * rw - 0.06, (P.xWsTop + P.xRgTop) / 2, P.roofY - 0.06, 0); // headliner
    box(0.35, 0.02, 2 * rw - 0.08, P.xRgBase + 0.25, yAt(P.xRgBase + 0.25) + 0.02, 0); // parcel shelf
    const seatX = [xB + 0.05, s3lx + 0.12];
    for (const sx of seatX) {
      const zs = sx === seatX[0] ? [0.36, -0.36] : [0.38, 0, -0.38];
      for (const z of zs) {
        box(0.1, 0.52, 0.44, sx, yBelt - 0.02, z, shared.seat, 0.22);
        box(0.09, 0.15, 0.24, sx - 0.05, yBelt + 0.3, z, shared.seat, 0.12);
      }
    }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 10, 32), shared.blackGloss);
    wheel.position.set(P.xWsBase - 0.5, yBelt + 0.06, 0.37);
    wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0; wheel.rotation.z = 0;
    wheel.rotateX(-0.45);
    this.bodyGroup.add(wheel);
    this.buildBodyPlatesVisibility();
  }

  buildBodyPlatesVisibility() {
    const none = this.b.plate.style === 'none';
    (this.plateMeshes || []).forEach((p) => { p.visible = !none; });
  }

  // ---------------- body kit ----------------
  buildKit() {
    disposeGroup(this.kitGroup);
    const P = this.P, k = this.b.kit, gen = this.gen, m = this.m;
    const clear = P.clear ?? gen.dims.clear;
    const kitMat = { body: m.kit, black: shared.blackGloss, matte: shared.trimMatte, carbon: this.carbonMat() }[k.partColor] || m.kit;
    const add = (geo, mat) => this.add(geo, mat, this.kitGroup);
    const sFb = P.section(P.xmax - 0.18), sRb = P.section(P.xmin + 0.16);
    const yfb = sFb.yb, yrb = sRb.yb;
    const hwF = sFb.hw, hwR = sRb.hw;
    // plate that follows the bumper outline in plan view (robust under curved bumpers)
    const outlinePlate = (front, y, h, out, back, mat) => {
      const sec = front ? sFb : sRb, w = sec.hw - 0.05, edge = [];
      for (let z = -w; z <= w + 1e-6; z += 0.04) {
        const fx = front ? (P.frontAt(y + 0.04, z) ?? P.frontAt(y + 0.09, z)) : (P.rearAt(y + 0.04, z) ?? P.rearAt(y + 0.09, z));
        if (fx !== null) edge.push([fx + (front ? out : -out), z]);
      }
      if (edge.length < 3) return;
      const backEdge = edge.map(([x, z]) => [x - (front ? back : -back), z]).reverse();
      const g = new THREE.ExtrudeGeometry(polyShape(edge.concat(backEdge).map(([x, z]) => [x, -z]), 0.01), { depth: h, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
      g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.y = y;
      mesh.castShadow = true;
      this.kitGroup.add(mesh);
    };
    // front
    if (k.front === 'lip') outlinePlate(true, yfb - 0.03, 0.04, 0.03, 0.22, kitMat);
    if (k.front === 'full') {
      outlinePlate(true, yfb - 0.05, 0.06, 0.04, 0.26, kitMat);
      for (const s of [1, -1]) add(conform(P, extrude(polyShape(shift([[-0.06, -0.025], [0.06, -0.025], [0.07, 0.025], [-0.06, 0.025]], hwF - 0.2, this.lowerY, s), 0.01), 0.008), 'front', { off: 0 }), shared.mesh);
    }
    if (k.front === 'splitter') {
      outlinePlate(true, yfb - 0.012, 0.01, 0.07, 0.32, this.carbonMat());
      for (const s of [1, -1]) {
        const cz = s * (hwF - 0.14), cy = this.lowerY;
        const fx = P.frontAt(cy, cz);
        if (fx === null) continue;
        const can = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.008, 0.16), this.carbonMat());
        can.position.set(fx + 0.02, cy, cz + s * 0.03);
        can.rotation.set(0, -s * 0.5, s * 0.12);
        this.kitGroup.add(can);
      }
    }
    // sides
    if (k.side !== 'none') {
      const big = k.side === 'skirtBig';
      const x0 = P.rAx + P.tireR + 0.07, x1 = P.fAx - P.tireR - 0.07;
      const yb = clear;
      const pts = [[x0, yb - (big ? 0.045 : 0.025)], [x1, yb - (big ? 0.045 : 0.025)], [x1 + 0.02, yb + 0.075], [x0 - 0.02, yb + 0.075]];
      for (const f of ['sideR', 'sideL']) add(conform(P, extrude(polyShape(pts, 0.015), big ? 0.045 : 0.026), f, { off: -0.008, yClamp: [yb + 0.13, yb + 0.3] }), kitMat);
    }
    // over-fenders
    if (k.fender === 'overfender') {
      for (const ax of [P.fAx, P.rAx]) {
        const Ra = P.tireR + 0.045, pts = [];
        for (let i = 0; i <= 24; i++) { const a = -0.25 + (Math.PI + 0.5) * i / 24; pts.push([ax + Math.cos(a) * (Ra + 0.065), P.tireR + Math.sin(a) * (Ra + 0.065)]); }
        for (let i = 24; i >= 0; i--) { const a = -0.25 + (Math.PI + 0.5) * i / 24; pts.push([ax + Math.cos(a) * (Ra - 0.004), P.tireR + Math.sin(a) * (Ra - 0.004)]); }
        for (const f of ['sideR', 'sideL']) add(conform(P, extrude(polyShape(pts), 0.045, 4, 0.025), f, { off: -0.005, yClamp: [clear + 0.14, 5] }), kitMat);
      }
    }
    // rear
    if (k.rear === 'lip' || k.rear === 'diffuser') {
      outlinePlate(false, yrb - 0.035, 0.04, 0.025, 0.2, k.rear === 'diffuser' ? this.carbonMat() : kitMat);
      if (k.rear === 'diffuser') {
        const xr = (P.rearAt(yrb + 0.04, 0) ?? P.xmin) - 0.01;
        for (let z = -0.42; z <= 0.421; z += 0.14) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.075, 0.008), this.carbonMat());
          fin.position.set(xr + 0.06, yrb - 0.035, z);
          this.kitGroup.add(fin);
        }
      }
    }
    // spoilers
    const xTe = P.xmin + 0.19;
    if (k.spoiler === 'lip' || k.spoiler === 'ducktail') {
      const duck = k.spoiler === 'ducktail';
      const len = duck ? 0.2 : 0.07, h = duck ? 0.065 : 0.022;
      const w = P.section(xTe).hw * 0.86;
      const g = extrude(polyShape([[xTe, -w], [xTe + len, -w * 0.97], [xTe + len, w * 0.97], [xTe, w]], 0.02), 1, 4, 0.03);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const t = 1 - (p.getX(i) - xTe) / len; p.setZ(i, p.getZ(i) * h * Math.pow(Math.max(0, t), 1.4) + 0.002); }
      add(conform(P, g, 'top', { off: -0.003 }), kitMat);
    }
    if (k.spoiler === 'wing' || k.spoiler === 'gtwing') {
      const gt = k.spoiler === 'gtwing';
      const xw = P.xmin + (gt ? 0.18 : 0.22);
      const topY = P.topAt(xw, 0.45) ?? gen.body.trunkY;
      const standH = gt ? 0.27 : 0.11;
      const span = gt ? 1.5 : 1.25;
      for (const z of [0.42, -0.42]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(gt ? 0.1 : 0.14, standH, 0.012), gt ? shared.blackGloss : kitMat);
        st.position.set(xw + 0.03, topY + standH / 2, z);
        st.rotation.z = gt ? -0.1 : 0;
        this.kitGroup.add(st);
      }
      const foil = new THREE.Shape();
      const c = gt ? 0.28 : 0.2;
      foil.moveTo(c / 2, 0);
      foil.bezierCurveTo(c * 0.2, 0.035, -c * 0.3, 0.03, -c / 2, 0.018);
      foil.lineTo(-c / 2, 0.006);
      foil.bezierCurveTo(-c * 0.2, -0.005, c * 0.2, -0.01, c / 2, 0);
      const fg = new THREE.ExtrudeGeometry(foil, { depth: span, bevelEnabled: false, curveSegments: 12 });
      fg.translate(0, 0, -span / 2);
      const wing = new THREE.Mesh(fg, gt ? this.carbonMat() : kitMat);
      wing.position.set(xw + 0.02, topY + standH, 0);
      wing.rotation.z = gt ? 0.12 : 0.05;
      this.kitGroup.add(wing);
      if (gt) for (const z of [span / 2, -span / 2]) {
        const ep = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.008), this.carbonMat());
        ep.position.set(xw, topY + standH - 0.03, z); this.kitGroup.add(ep);
      }
    }
    // exhaust
    {
      const fin = this.b.kit.exhaustFinish;
      const em = m.exhaust;
      em.iridescence = 0; em.map = null;
      if (fin === 'chrome') { em.color.set('#f2f2f2'); em.metalness = 1; em.roughness = 0.06; }
      if (fin === 'burnt') { em.color.set('#7d6aa8'); em.metalness = 1; em.roughness = 0.22; em.iridescence = 1; em.iridescenceIOR = 2.0; }
      if (fin === 'black') { em.color.set('#151515'); em.metalness = 0.6; em.roughness = 0.4; }
      if (fin === 'carbon') { em.color.set('#fff'); em.map = getCarbonTexture(); em.metalness = 0.3; em.roughness = 0.3; }
      em.needsUpdate = true;
      const layouts = { oem: [[-0.42, 0.028]], single: [[-0.45, 0.05]], dual: [[-0.49, 0.042], [-0.38, 0.042]], split: [[-0.46, 0.048], [0.46, 0.048]], quad: [[-0.5, 0.04], [-0.39, 0.04], [0.39, 0.04], [0.5, 0.04]] };
      const y = yrb + (k.exhaust === 'oem' ? -0.02 : 0.03);
      for (const [z, r] of (P.isGLB && k.exhaust === 'oem') ? [] : layouts[k.exhaust] || layouts.oem) {
        const xr = (P.rearAt(Math.max(y, yrb + 0.04), z) ?? P.xmin + 0.05);
        const len = 0.16;
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, len, 28, 1, true).rotateZ(Math.PI / 2), k.exhaust === 'oem' ? shared.trimMatte : em);
        tip.position.set(xr - len / 2 + (k.exhaust === 'oem' ? 0.03 : -0.015), y, z);
        const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.85, 24), shared.black);
        inner.rotation.y = -Math.PI / 2; inner.position.set(xr - len + 0.02 + (k.exhaust === 'oem' ? 0.03 : -0.015), y, z);
        this.kitGroup.add(tip, inner);
      }
    }
    // window visor (กันสาด)
    if (this.b.glass.visor && !P.isGLB) {
      const [gA, gB] = this.sideGlassRange(P);
      const pts = [], low = [];
      for (let x = gA + 0.04; x <= Math.min(gB, P.xWsTop - 0.02); x += 0.03) {
        const S = P.section(x); const y8 = S.pts[8][1];
        pts.push([x, y8 + 0.004]); low.push([x, y8 - 0.06]);
      }
      if (pts.length > 2) {
        const outline = pts.concat(low.reverse());
        for (const f of ['sideR', 'sideL']) add(conform(P, extrude(polyShape(outline), 0.003, 2, 0.03), f, { off: 0.016, yClamp: [0, P.roofY - 0.04] }), m.visor);
      }
    }
    // shark fin
    // Real-model generations only get the fin when their own style allows it (its position is parametric).
    if (k.sharkfin && (!P.isGLB || gen.style?.sharkfin)) {
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(0.17, 0); s.quadraticCurveTo(0.04, 0.02, 0.0, 0.065); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 10 });
      g.translate(-0.17, 0, -0.025);
      const xf = P.xRgTop + 0.2;
      const fin = this.add(g, this.b.paint.roof === 'body' ? m.paint : m.roof, this.kitGroup);
      fin.position.set(xf + 0.17, Math.min(P.topAt(xf, 0) ?? P.roofY, P.topAt(xf + 0.17, 0) ?? P.roofY) - 0.006, 0);
    }
  }

  carbonMat() {
    if (!this._carbon) { this._carbon = newPaint(); setCarbon(this._carbon); }
    return this._carbon;
  }

  // ---------------- wheels ----------------
  susp() {
    const s = this.b.suspension;
    const air = s.type === 'air' && s.airUp;
    const f = air ? 0 : s.drop, r = air ? 0 : (s.linked ? s.drop : s.dropRear ?? s.drop);
    return { f: f / 1000, r: r / 1000 };
  }

  buildWheels() {
    disposeGroup(this.wheelGroup);
    this.corners = [];
    const P = this.P, w = this.b.wheels, gen = this.gen;
    normalizeWheels(w, gen.tire);
    const hwAx = P.section(P.fAx).hw;
    // Models whose wheels are only anchors (no real wheel meshes) use the procedural OEM wheel instead.
    if (this.tpl && w.style === 'oem' && !gen.glbConfig?.anchorWheels) { this.buildModelWheels(); return; }
    let modelRim = null, wb = w;
    const ownGlb = WHEEL_STYLES.find((st) => st.id === w.style)?.glb;
    if (w.style === 'model' || ownGlb) {
      modelRim = this.modelRim(w);
      // still loading → show the standard rim meanwhile (rebuilds when the model is ready),
      // otherwise the car would sit on bare hubs
      if (!modelRim) wb = { ...w, style: 'spoke5' };
    }
    const built = buildWheel(wb, gen.id, gen.tire, WHEEL_FINISHES, modelRim);
    this.tire = built.T;
    const oemET = gen.tire.rim >= 16 ? 39 : 45;
    const baseTrack = P.trackZ ?? P.W / 2 - 0.125;
    const trackZ = baseTrack + (oemET - w.offset) / 1000 + w.spacer / 1000;
    const To = built.T.outerR;
    for (const [x, side, front] of [[P.fAx, 1, true], [P.fAx, -1, true], [P.rAx, 1, false], [P.rAx, -1, false]]) {
      const corner = new THREE.Group();
      corner.position.set(x, To, side * trackZ);
      const steer = new THREE.Group();
      const sideG = new THREE.Group();
      sideG.rotation.y = side < 0 ? Math.PI : 0;
      const camber = new THREE.Group();
      camber.rotation.x = THREE.MathUtils.degToRad(w.camber);
      const spin = built.spin.clone();
      const cal = built.caliper.clone();
      cal.rotation.z = side > 0 ? Math.PI - 0.4 : 0.4;
      camber.add(spin, cal);
      sideG.add(camber); steer.add(sideG); corner.add(steer);
      this.wheelGroup.add(corner);
      this.corners.push({ corner, steer, spin, side, front });
    }
    // camber tucks the top of the tire inward
    const camberTuck = Math.sin(THREE.MathUtils.degToRad(-w.camber)) * To;
    this.fitInfo = { trackZ, hwAx, To, sw: built.T.swAct, camberTuck };
    this.fitment = { tire: built.T.label, diameter: Math.round(To * 2000), T: built.T };
    this.updateFitment();
  }

  updateFitment() {
    if (!this.fitInfo || !this.fitment) return;
    const { trackZ, hwAx, To, sw, camberTuck } = this.fitInfo;
    const d = this.susp();
    const arch = this.P.tireR + 0.045;
    this.fitment.poke = Math.round((trackZ + sw / 2 - camberTuck - hwAx) * 1000);
    this.fitment.gap = Math.round((arch - d.f - To) * 1000);
    this.fitment.gapRear = Math.round((arch - d.r - To) * 1000);
  }

  // Rim taken from a real model (.glb) and fitted to the chosen size.
  modelRim(w) {
    const style = WHEEL_STYLES.find((s) => s.id === w.style);
    if (style?.glb) {
      const scene = getWheelModel(style.glb,
        () => { this.buildWheels(); this.applySuspension(); this.onNotice(`โหลดล้อ ${style.name} แล้ว`); },
        () => this.onNotice(`โหลดล้อ ${style.name} ไม่สำเร็จ`));
      if (scene) scene.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; } });
      return scene ? this.fitRim(scene.clone(true), w, false) : null;
    }
    const g = GENERATIONS.find((x) => x.id === 'gen2');
    const tpl = getReadyTemplate(g.glb);
    if (!tpl) {
      loadTemplate(g.glb, g.glbConfig).then(() => { this.buildWheels(); this.applySuspension(); this.onNotice('โหลดล้อจากโมเดล 3D แล้ว'); }).catch(() => this.onNotice('โหลดล้อโมเดล 3D ไม่สำเร็จ'));
      return null;
    }
    const src = tpl.model.getObjectByName(g.glbConfig.rimNode);
    if (!src) return null;
    const box = new THREE.Box3().setFromObject(src);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const node = src.clone(true);
    new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z).multiply(src.matrixWorld).decompose(node.position, node.quaternion, node.scale);
    const face = makeWheelMaterials(w, WHEEL_FINISHES).face;
    node.traverse((o) => {
      if (!o.isMesh) return;
      o.visible = true; o.castShadow = true;
      if (o.material?.name === '1.005') o.material = face;
      if (o.material?.name === 'chrome' && !w.lip) o.material = face;
    });
    return this.fitRim(node, w, true, size);
  }

  // Scales a rim model to the chosen diameter and width. Standalone wheel models keep their own materials.
  fitRim(node, w, recolor, size = null) {
    if (!size) {
      node.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(node);
      const c = box.getCenter(new THREE.Vector3());
      size = box.getSize(new THREE.Vector3());
      node.position.copy(c).negate();
    }
    const holder = new THREE.Group();
    holder.add(node);
    const rimR = w.rim * 0.0127, rimW = w.rimWidth * 0.0254;
    const sD = (rimR + 0.017) / (size.y / 2);
    holder.scale.set(sD, sD, (rimW + 0.02) / size.z);
    return holder;
  }

  // Original wheels of the .glb model, re-parented so they can spin and steer.
  buildModelWheels() {
    const tpl = this.tpl, w = this.b.wheels, P = this.P;
    const cam = THREE.MathUtils.degToRad(w.camber);
    let R = 0, width = 0;
    for (const [key, side, front] of [['FR', 1, true], ['FL', -1, true], ['RR', 1, false], ['RL', -1, false]]) {
      const wi = tpl.wheels[key];
      R += wi.radius / 4; width = Math.max(width, wi.width);
      const corner = new THREE.Group();
      corner.position.set(wi.center.x, wi.radius, wi.center.z + side * w.spacer / 1000);
      const steer = new THREE.Group(), camber = new THREE.Group(), spin = new THREE.Group();
      camber.rotation.x = side > 0 ? cam : -cam;
      const toLocal = new THREE.Matrix4().makeTranslation(-wi.center.x, -wi.center.y, -wi.center.z);
      const place = (name, parent) => {
        const src = name && tpl.model.getObjectByName(name);
        if (!src) return;
        const node = src.clone(true);
        toLocal.clone().multiply(src.matrixWorld).decompose(node.position, node.quaternion, node.scale);
        node.traverse((o) => { if (o.isMesh) { o.visible = true; o.castShadow = true; } });
        parent.add(node);
      };
      place(wi.name, spin);
      place(wi.caliper, camber);
      camber.add(spin); steer.add(camber); corner.add(steer);
      this.wheelGroup.add(corner);
      this.corners.push({ corner, steer, spin, side, front, spinSign: -1 });
    }
    this.tire = { outerR: R, sw: width * 0.75, label: 'ล้อ/ยางเดิมของโมเดล' };
    this.fitInfo = { trackZ: P.trackZ + w.spacer / 1000, hwAx: P.section(P.fAx).hw, To: R, sw: width * 0.75, camberTuck: Math.sin(-cam) * R };
    this.fitment = { tire: this.tire.label, diameter: Math.round(R * 2000), T: null };
    this.updateFitment();
  }

  applySuspension() {
    const P = this.P;
    const To = this.tire?.outerR ?? P.tireR;
    const d = this.susp();
    this.baseY = (To - P.tireR) - (d.f + d.r) / 2;
    this.baseRake = Math.atan2(d.r - d.f, P.fAx - P.rAx); // + = nose up
    this.chassis.position.y = this.baseY;
    this.chassis.rotation.z = this.baseRake;
    this.updateFitment();
  }

  // ---------------- materials ----------------
  applyPaint() {
    const p = this.b.paint, m = this.m;
    setPaint(m.paint, p.color, p.finish);
    if (p.roof === 'body') setPaint(m.roof, p.color, p.finish);
    else if (p.roof === 'black') setPaint(m.roof, '#09090b', 'gloss');
    else if (p.roof === 'carbon') setCarbon(m.roof);
    else setPaint(m.roof, p.roofColor, p.finish);
    if (p.hood === 'body') setPaint(m.hood, p.color, p.finish);
    else if (p.hood === 'carbon') setCarbon(m.hood);
    else setPaint(m.hood, '#141416', 'matte');
    if (p.mirror === 'body') setPaint(m.mirror, p.color, p.finish);
    else if (p.mirror === 'black') setPaint(m.mirror, '#09090b', 'gloss');
    else if (p.mirror === 'carbon') setCarbon(m.mirror);
    else setPaint(m.mirror, '#f4f4f4', 'chrome');
    setPaint(m.kit, p.color, p.finish);
  }

  applyGlass() {
    const g = this.b.glass, f = (id) => FILM_TYPES.find((x) => x.id === id) || FILM_TYPES[0];
    setGlass(this.m.ws, g.windshield, f(g.windshieldFilm));
    setGlass(this.m.side, g.side, f(g.sideFilm));
    setGlass(this.m.rear, g.rear, f(g.rearFilm));
  }

  applyLights() {
    const l = this.b.lights, m = this.m, on = l.head || !!this.autoLights;
    m.headLamp.emissiveIntensity = on ? 4 : 0.05;
    m.drl.emissiveIntensity = on ? 3 : 1.2;
    const smoke = l.headTint === 'smoke';
    m.lens.color.set(smoke ? '#202226' : '#ffffff');
    m.lens.opacity = smoke ? 0.55 : 0.18;
    const tt = l.tailTint;
    m.tail.color.set(tt === 'smoke' ? '#2a0507' : tt === 'clear' ? '#c9ccd2' : '#8a0b12');
    m.tail.metalness = tt === 'clear' ? 0.9 : 0;
    m.tail.emissiveIntensity = on ? 0.9 : 0.08;
    m.tailInner.emissiveIntensity = on ? 2.5 : 0.25;
    if (this.glbMats) {
      for (const hm of this.glbMats.head) {
        hm.emissive.set('#fff6e0'); hm.emissiveMap = hm.map; hm.emissiveIntensity = on ? 2.2 : 0;
        hm.color.set(smoke ? '#3a3c40' : '#ffffff'); hm.needsUpdate = true;
      }
      for (const tm of this.glbMats.tail) {
        const base = tm.userData.base;
        if (tt === 'smoke') tm.color.copy(base).multiplyScalar(0.22); else if (tt === 'clear') tm.color.set('#d9dce0'); else tm.color.copy(base);
        tm.emissive.set('#ff1a1a'); tm.emissiveMap = tm.map; tm.emissiveIntensity = on ? 0.9 : 0; tm.needsUpdate = true;
      }
    }
    this.beams.forEach((s, i) => {
      s.intensity = on ? 60 : 0;
      const z = (i ? -1 : 1) * 0.55;
      s.position.set(this.P.xmax - 0.2, 0.75, z);
      s.target.position.set(this.P.xmax + 8, 0.0, z * 1.5);
    });
    // underglow
    disposeGroup(this.fxGroup);
    if (l.underglow !== 'none') {
      m.underglow.color.set(l.underglowColor);
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.55, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      m.underglow.map = new THREE.CanvasTexture(c); m.underglow.needsUpdate = true;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(this.P.L * 1.25, this.P.W * 1.7), m.underglow);
      plane.rotation.x = -Math.PI / 2; plane.position.y = 0.012;
      plane.renderOrder = 2;
      this.fxGroup.add(plane);
    }
  }

  drawPlate() {
    const p = this.b.plate, st = PLATE_STYLES.find((s) => s.id === p.style) || PLATE_STYLES[0];
    const c = this.plateCanvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (st.bg === 'linear') {
      const grd = g.createLinearGradient(0, 0, c.width, c.height);
      grd.addColorStop(0, '#fef6e4'); grd.addColorStop(0.5, '#cde9f5'); grd.addColorStop(1, '#f8d7e8');
      g.fillStyle = grd;
    } else g.fillStyle = st.bg || '#f7f7f2';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(12, 12, c.width - 24, c.height - 24);
    g.fillStyle = st.fg || '#111';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 128px Kanit, "Noto Sans Thai", Tahoma, sans-serif';
    g.fillText(p.line1 || '', c.width / 2, 118, c.width - 60);
    g.font = '400 60px Kanit, "Noto Sans Thai", Tahoma, sans-serif';
    g.fillText(p.line2 || '', c.width / 2, 232, c.width - 80);
    this.plateTex.needsUpdate = true;
  }

  setAutoLights(on) { if (!!this.autoLights === on) return; this.autoLights = on; this.applyLights(); }

  // ---------------- runtime ----------------
  // steer: radians (+ = left), spinDelta: radians, roll/pitch: radians
  animate(steer, spinDelta, roll = 0, pitch = 0) {
    for (const c of this.corners) {
      if (c.front) c.steer.rotation.y = steer;
      c.spin.rotation.z += (c.spinSign ?? (c.side > 0 ? -1 : 1)) * spinDelta;
    }
    this.chassis.rotation.x = roll;
    this.chassis.rotation.z = (this.baseRake || 0) + pitch;
    this.chassis.position.y = (this.baseY || 0) + (this._heave || 0);
  }

  // ---------------- add-ons ----------------
  loadAddons() {
    disposeGroup(this.addonGroup);
    for (const id of this.b.addons || []) {
      const a = ADDONS.find((x) => x.id === id);
      if (!a) continue;
      this.loader.load(a.glb, (gltf) => {
        const o = gltf.scene;
        o.position.fromArray(a.pos || [0, 0, 0]);
        o.rotation.fromArray(a.rot || [0, 0, 0]);
        o.scale.setScalar(a.scale || 1);
        o.traverse((n) => { if (n.isMesh) { n.castShadow = true; if (/paint/i.test(n.material?.name || '')) n.material = this.m.kit; } });
        this.addonGroup.add(o);
      }, undefined, () => this.onNotice(`โหลดชิ้นส่วน ${a.name} ไม่สำเร็จ`));
    }
  }
}
