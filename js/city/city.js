// Procedural Bangkok city & Expressway/Motorway: elevated Chalerm Maha Nakhon / Srirat Expressway,
// Motorway 7, Easy Pass / M-Flow Toll Plazas, overhead gantry signs, acoustic noise barriers,
// King Power Mahanakhon, Baiyoke Tower II, giant unipole billboards, BTS Skytrain, and Khlong Toei Port.
import * as THREE from 'three';
import { GeoBuf, stripQuad } from './geobuf.js';
import { Colliders, Surfaces } from './physics.js';
import * as TX from './textures.js';
import { VERTICAL_SIGNS, BILLBOARDS } from './signs.js';
import { getAsphaltPBR, getPavingPBR, getConcretePBR, getWaterNormal, injectPuddleShader } from './pbr.js';

export const LAYOUT = (() => {
  const N = 9, P = 64, half = (N * P) / 2;
  const c = [], w = [], main = [];
  for (let i = 0; i <= N; i++) { c.push(-half + i * P); main.push(i % 3 === 0); w.push(i % 3 === 0 ? 18 : 9); }
  return { N, P, half, c, w, main, ring: { half: 330, radius: 60, width: 14, y: 9 }, rail: { z: 0, y: 8, x0: -312, x1: 312 }, bounds: 560 };
})();

const SIDEWALK = 3.2, CURB = 0.15;

export class City {
  constructor(seed = 20261111) {
    this.r = TX.rng(seed);
    this.group = new THREE.Group();
    this.colliders = new Colliders();
    this.surfaces = new Surfaces();
    this.nightMats = [];   // materials whose emissiveIntensity follows night
    this.glows = [];       // night-only meshes
    this.signals = [];
    this.time = 0;
    this.spawns = [];
    this.build();
  }

  // ------------------------------------------------------------ materials
  mats() {
    const night = (m, k = 1, base = 0) => { m.userData.nightK = k; m.userData.nightBase = base; this.nightMats.push(m); return m; };
    const M = {};
    const aspPBR = getAsphaltPBR();
    const pavPBR = getPavingPBR();
    const conPBR = getConcretePBR();

    M.facade = {};
    TX.FACADE_TYPES.forEach((t, i) => {
      const tx = TX.facadeTextures(t, 11 + i);
      M.facade[t] = night(new THREE.MeshStandardMaterial({
        map: tx.map,
        emissiveMap: tx.emissive,
        roughnessMap: tx.roughnessMap,
        emissive: '#ffffff',
        emissiveIntensity: 0,
        roughness: 1.0,
        metalness: t === 'office' ? 0.55 : 0.08,
      }), 0.65);
    });
    const shop = TX.shopTextures(5);
    M.shop = night(new THREE.MeshStandardMaterial({ map: shop.map, emissiveMap: shop.emissive, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.55 }), 0.65);
    M.roof = new THREE.MeshStandardMaterial({ color: '#74787d', normalMap: conPBR.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughnessMap: conPBR.roughnessMap, roughness: 1.0 });
    M.roofProps = new THREE.MeshStandardMaterial({ color: '#b9bbbd', roughness: 0.55, metalness: 0.35 });
    M.houseRoof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.15 });
    const ast = TX.asphaltTexture();
    M.asphalt = injectPuddleShader(new THREE.MeshStandardMaterial({
      map: ast,
      normalMap: aspPBR.normalMap,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughnessMap: aspPBR.roughnessMap,
      roughness: 1.0,
    }), { maxPuddle: 0.9, rippleScale: 1.0 });
    const pav = TX.pavingTexture();
    M.paving = injectPuddleShader(new THREE.MeshStandardMaterial({
      map: pav,
      normalMap: pavPBR.normalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughnessMap: pavPBR.roughnessMap,
      roughness: 1.0,
    }), { maxPuddle: 0.45, rippleScale: 1.2 });
    M.curb = new THREE.MeshStandardMaterial({ color: '#b5b1aa', normalMap: conPBR.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.88 });
    const gr = TX.grassTexture();
    M.grass = new THREE.MeshStandardMaterial({ map: gr, roughness: 0.98 });
    M.lines = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    M.stopText = new THREE.MeshStandardMaterial({ map: TX.stopTextTexture(), transparent: true, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false });
    M.vsign = night(new THREE.MeshStandardMaterial({ map: TX.verticalSignTexture(), emissiveMap: null, emissive: '#ffffff', emissiveIntensity: 0.05, roughness: 0.45, side: THREE.DoubleSide }), 0.8, 0.05);
    M.vsign.emissiveMap = M.vsign.map;
    M.konbini = night(new THREE.MeshStandardMaterial({ map: TX.konbiniTexture(false), emissiveMap: TX.konbiniTexture(true), emissive: '#ffffff', emissiveIntensity: 0.05, roughness: 0.48 }), 0.85, 0.05);
    M.station = night(new THREE.MeshStandardMaterial({ map: TX.stationTexture(false), emissiveMap: TX.stationTexture(true), emissive: '#ffffff', emissiveIntensity: 0.05, roughness: 0.5 }), 0.7, 0.05);
    M.vending = night(new THREE.MeshStandardMaterial({ map: TX.vendingTexture(false), emissiveMap: TX.vendingTexture(true), emissive: '#ffffff', emissiveIntensity: 0.05, roughness: 0.38 }), 0.55, 0.05);
    M.concrete = new THREE.MeshStandardMaterial({ color: '#9e9f9a', normalMap: conPBR.normalMap, normalScale: new THREE.Vector2(0.45, 0.45), roughnessMap: conPBR.roughnessMap, roughness: 1.0 });
    M.deckTop = injectPuddleShader(new THREE.MeshStandardMaterial({
      map: ast,
      normalMap: aspPBR.normalMap,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughnessMap: aspPBR.roughnessMap,
      roughness: 1.0,
    }), { maxPuddle: 0.85, rippleScale: 1.0 });
    M.pole = new THREE.MeshStandardMaterial({ color: '#9b9a95', normalMap: conPBR.normalMap, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.82 });
    M.metal = new THREE.MeshStandardMaterial({ color: '#646a72', roughness: 0.38, metalness: 0.72 });
    // Warm sodium-orange / LED street & highway lighting
    M.lamp = night(new THREE.MeshStandardMaterial({ color: '#fff3db', emissive: '#ffaa44', emissiveIntensity: 0.1 }), 2.5, 0.1);
    M.glow = new THREE.MeshBasicMaterial({ map: TX.glowTexture(), color: '#ffffff', transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    M.wire = new THREE.LineBasicMaterial({ color: '#1d1d1f' });
    M.trunk = new THREE.MeshStandardMaterial({ color: '#4d392a', roughness: 0.95 });
    M.leaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
    M.water = new THREE.MeshStandardMaterial({ color: '#14384a', normalMap: getWaterNormal(), normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.08, metalness: 0.42 });
    M.rail = new THREE.MeshStandardMaterial({ color: '#4b4d50', roughness: 0.45, metalness: 0.75 });
    // BTS Skytrain livery: crisp white body + crimson/navy stripe
    M.train = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.3, metalness: 0.4 });
    M.trainStripe = new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.35 });
    M.trainNavy = new THREE.MeshStandardMaterial({ color: '#0f2952', roughness: 0.35 });
    M.trainWin = night(new THREE.MeshStandardMaterial({ color: '#111827', emissive: '#fef3c7', emissiveIntensity: 0.05, roughness: 0.2 }), 0.75, 0.05);
    M.torii = new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.5, metalness: 0.2 });
    M.stopSign = new THREE.MeshStandardMaterial({ color: '#d42020', roughness: 0.5 });
    M.white = new THREE.MeshStandardMaterial({ color: '#efefea', roughness: 0.6 });
    M.sigOff = new THREE.MeshStandardMaterial({ color: '#202224', roughness: 0.4 });

    // Bangkok Expressway & Landmark materials
    const gDay = TX.gantryAtlasTexture(false), gNight = TX.gantryAtlasTexture(true);
    M.gantrySign = night(new THREE.MeshStandardMaterial({ map: gDay, emissiveMap: gNight, emissive: '#ffffff', emissiveIntensity: 0.18, roughness: 0.4, side: THREE.DoubleSide }), 0.85, 0.18);
    const tDay = TX.tollCanopyTexture(false), tNight = TX.tollCanopyTexture(true);
    M.tollSign = night(new THREE.MeshStandardMaterial({ map: tDay, emissiveMap: tNight, emissive: '#ffffff', emissiveIntensity: 0.22, roughness: 0.38, side: THREE.DoubleSide }), 0.9, 0.22);
    const bDay = TX.billboardAtlasTexture(false), bNight = TX.billboardAtlasTexture(true);
    M.billboard = night(new THREE.MeshStandardMaterial({ map: bDay, emissiveMap: bNight, emissive: '#ffffff', emissiveIntensity: 0.12, roughness: 0.45, side: THREE.DoubleSide }), 0.85, 0.12);
    M.noiseBarrier = new THREE.MeshStandardMaterial({ map: TX.noiseBarrierTexture(), roughness: 0.35, metalness: 0.35, side: THREE.DoubleSide });
    M.hazard = new THREE.MeshStandardMaterial({ map: TX.hazardStripeTexture(), roughness: 0.55 });
    const chev = TX.chevronSignTexture();
    M.chevron = night(new THREE.MeshStandardMaterial({ map: chev, emissiveMap: chev, emissive: '#ffffff', emissiveIntensity: 0.12, roughness: 0.4, side: THREE.DoubleSide }), 0.7, 0.12);
    M.mahanakhon = night(new THREE.MeshStandardMaterial({ color: '#1b314c', emissive: '#0d1f36', emissiveIntensity: 0.12, roughness: 0.16, metalness: 0.85 }), 0.4, 0.12);
    M.mahanakhonPixel = night(new THREE.MeshStandardMaterial({ color: '#e0f2fe', emissive: '#38bdf8', emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.4 }), 1.5, 0.35);

    this.M = M;
    return M;
  }

  // ------------------------------------------------------------ build
  build() {
    const M = this.mats();
    const L = LAYOUT;
    const buf = {
      facade: Object.fromEntries(TX.FACADE_TYPES.map((t) => [t, new GeoBuf()])),
      roof: new GeoBuf(), roofProps: new GeoBuf(), houseRoof: new GeoBuf(true), shop: new GeoBuf(),
      paving: new GeoBuf(), curb: new GeoBuf(), grass: new GeoBuf(), lines: new GeoBuf(true), stopText: new GeoBuf(),
      vsign: new GeoBuf(), konbini: new GeoBuf(), station: new GeoBuf(), concrete: new GeoBuf(), deckTop: new GeoBuf(),
      asphalt: new GeoBuf(), white: new GeoBuf(), torii: new GeoBuf(), water: new GeoBuf(),
      gantrySign: new GeoBuf(), tollSign: new GeoBuf(), billboard: new GeoBuf(),
      noiseBarrier: new GeoBuf(), hazard: new GeoBuf(), chevron: new GeoBuf(),
      mahanakhon: new GeoBuf(), mahanakhonPixel: new GeoBuf(), metal: new GeoBuf(),
    };
    this.buf = buf;
    const inst = { lamp: [], pole: [], trans: [], vending: [], tree: [], stop: [], signal: [] };
    this.inst = inst;
    const wires = [];

    // ground
    buf.asphalt.flat([[-380, 380], [380, 380], [380, -380], [-380, -380]], 0, 6);
    buf.asphalt.flat([[380, 260], [545, 260], [545, -260], [380, -260]], 0, 6); // Khlong Toei port apron
    for (const [x0, x1, z0, z1] of [[380, 560, -6, 6], [-560, -380, -6, 6], [-6, 6, 380, 560], [-6, 6, -560, -380]]) this.buf.asphalt.top(x0, x1, z0, z1, 0.004, 6);
    const grassG = new THREE.PlaneGeometry(2400, 2400); grassG.rotateX(-Math.PI / 2);
    const uvs = grassG.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 300, uvs.getY(i) * 300);
    const grass = new THREE.Mesh(grassG, M.grass); grass.position.y = -0.03; grass.receiveShadow = true; this.group.add(grass);

    // ---- blocks
    const parks = new Set(['1,6', '7,2']);
    for (let bi = 0; bi < L.N; bi++) for (let bj = 0; bj < L.N; bj++) {
      const x0 = L.c[bi] + L.w[bi] / 2, x1 = L.c[bi + 1] - L.w[bi + 1] / 2;
      const z0 = L.c[bj] + L.w[bj] / 2, z1 = L.c[bj + 1] - L.w[bj + 1] / 2;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const d = Math.max(Math.abs(cx), Math.abs(cz));
      const district = d < 110 ? 'down' : d < 200 ? 'mid' : 'res';
      const isPark = parks.has(bi + ',' + bj), isStation = bi === 4 && bj === 4;
      const isMahanakhon = bi === 3 && bj === 3, isBaiyoke = bi === 5 && bj === 3;
      // sidewalk slab + curb
      (isPark ? buf.grass : buf.paving).top(x0, x1, z0, z1, CURB, isPark ? 3 : 2);
      if (isPark) { buf.paving.top(x0, x1, z0, z0 + SIDEWALK, CURB + 0.003, 2); buf.paving.top(x0, x1, z1 - SIDEWALK, z1, CURB + 0.003, 2); buf.paving.top(x0, x0 + SIDEWALK, z0, z1, CURB + 0.003, 2); buf.paving.top(x1 - SIDEWALK, x1, z0, z1, CURB + 0.003, 2); }
      buf.curb.boxWalls(x0, x1, z0, z1, 0, CURB, 2, 1);
      this.colliders.addBox(x0, x1, z0, z1, -5, 1.6);
      const ix0 = x0 + SIDEWALK, ix1 = x1 - SIDEWALK, iz0 = z0 + SIDEWALK, iz1 = z1 - SIDEWALK;
      if (isStation) this.buildStation(ix0, ix1, iz0, iz1);
      else if (isPark) this.buildPark(ix0, ix1, iz0, iz1);
      else if (isMahanakhon) this.buildMahanakhon(ix0, ix1, iz0, iz1);
      else if (isBaiyoke) this.buildBaiyoke(ix0, ix1, iz0, iz1);
      else this.buildLots(ix0, ix1, iz0, iz1, district, bj === 4);
      // street furniture along this block's edges
      this.blockProps(bi, bj, x0, x1, z0, z1, district, wires);
    }

    // ---- road markings
    this.roadMarkings();

    // ---- Bangkok Expressway + BTS Skytrain + Khlong Toei Harbor + Billboards
    this.buildExpressway();
    this.buildBillboards();
    this.buildRail();
    this.buildHarbor();
    this.buildOutskirts();
    this.buildOverpasses();

    // world bounds
    const B = L.bounds;
    // west side has an opening at z≈0: the road out to Khao Yai mountain pass (touge.js)
    for (const [ax, az, bx, bz] of [[-B, -B, B, -B], [B, -B, B, B], [B, B, -B, B], [-B, B, -B, 7], [-B, -7, -B, -B]]) this.colliders.addSegment(ax, az, bx, bz, -5, 30, 0.5);
    this.spawns.push({ name: 'เขาใหญ่', label: 'เขาใหญ่ (Touge)', x: -575, y: 0, z: 0, heading: Math.PI });

    // ---- meshes from buffers
    const addMesh = (b, mat, cast = true, receive = true) => {
      if (!b.count) return null;
      const m = new THREE.Mesh(b.build(), mat); m.castShadow = cast; m.receiveShadow = receive; this.group.add(m); return m;
    };
    for (const t of TX.FACADE_TYPES) addMesh(buf.facade[t], M.facade[t]);
    addMesh(buf.roof, M.roof); addMesh(buf.roofProps, M.roofProps); addMesh(buf.houseRoof, M.houseRoof); addMesh(buf.shop, M.shop);
    addMesh(buf.asphalt, M.asphalt, false); addMesh(buf.paving, M.paving, false); addMesh(buf.curb, M.curb, false); addMesh(buf.grass, M.grass, false);
    addMesh(buf.lines, M.lines, false); addMesh(buf.stopText, M.stopText, false);
    addMesh(buf.vsign, M.vsign); addMesh(buf.konbini, M.konbini); addMesh(buf.station, M.station);
    addMesh(buf.concrete, M.concrete); addMesh(buf.deckTop, M.deckTop, false); addMesh(buf.white, M.white); addMesh(buf.torii, M.torii);
    addMesh(buf.water, M.water, false);
    addMesh(buf.gantrySign, M.gantrySign, false);
    addMesh(buf.tollSign, M.tollSign, false);
    addMesh(buf.billboard, M.billboard);
    addMesh(buf.noiseBarrier, M.noiseBarrier);
    addMesh(buf.hazard, M.hazard, false);
    addMesh(buf.chevron, M.chevron, false);
    addMesh(buf.mahanakhon, M.mahanakhon);
    addMesh(buf.mahanakhonPixel, M.mahanakhonPixel);
    addMesh(buf.metal, M.metal);

    this.buildInstances();
    this.buildGlows();
    // wires
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    this.group.add(new THREE.LineSegments(wg, M.wire));
  }

  // ------------------------------------------------------------ Bangkok Landmarks
  // King Power Mahanakhon (ตึกมหานคร) — pixelated spiral cut-out glass skyscraper
  buildMahanakhon(x0, x1, z0, z1) {
    const b = this.buf;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // Retail podium
    b.facade.office.boxWalls(x0 + 1, x1 - 1, z0 + 1, z1 - 1, CURB, 14, 12, 12.8, CURB);
    b.roof.top(x0 + 1, x1 - 1, z0 + 1, z1 - 1, 14, 4);
    // Main tower shaft (142 m tall) positioned in the center
    const hw = 11.5, tx0 = cx - hw, tx1 = cx + hw, tz0 = cz - hw, tz1 = cz + hw;
    // Build in vertical slices so the spiral pixel ribbon cuts & glows around the shaft
    const slices = 18, yStart = 14, yTop = 142, dh = (yTop - yStart) / slices;
    for (let s = 0; s < slices; s++) {
      const ya = yStart + s * dh, yb = ya + dh;
      const isPixelBand = s >= 2 && s <= 15 && (s % 2 === 1 || s === 8 || s === 9);
      if (isPixelBand) {
        // Recessed glowing pixel core
        b.mahanakhonPixel.boxWalls(tx0 + 1.2, tx1 - 1.2, tz0 + 1.2, tz1 - 1.2, ya, yb, 6, 6);
        b.mahanakhonPixel.top(tx0, tx1, tz0, tz1, ya + 0.05, 4);
        // Corner pixel blocks jutting out along a spiral angle
        const ang = (s / slices) * Math.PI * 3;
        for (let k = 0; k < 4; k++) {
          const a = ang + k * (Math.PI / 2);
          if (Math.sin(a) > -0.2) {
            const px = cx + Math.cos(a) * (hw - 3.2), pz = cz + Math.sin(a) * (hw - 3.2);
            b.mahanakhon.boxWalls(px - 3.2, px + 3.2, pz - 3.2, pz + 3.2, ya, yb, 6, 6);
            b.mahanakhon.top(px - 3.2, px + 3.2, pz - 3.2, pz + 3.2, yb, 4);
          }
        }
      } else {
        b.mahanakhon.boxWalls(tx0, tx1, tz0, tz1, ya, yb, 8, 8);
      }
    }
    // SkyWalk glass observation deck at top
    b.mahanakhon.top(tx0, tx1, tz0, tz1, yTop, 4);
    b.mahanakhonPixel.boxWalls(tx0 - 0.6, tx1 + 0.6, tz0 - 0.6, tz1 + 0.6, yTop, yTop + 1.8, 4, 2);
    b.mahanakhonPixel.top(tx0 - 0.6, tx1 + 0.6, tz0 - 0.6, tz1 + 0.6, yTop + 1.8, 4);
    this.spawnLight(cx, cz, 22, '#38bdf8');
  }

  // Baiyoke Tower II (ตึกใบหยก 2) — stepped skyscraper with observation dome & tall red-white spire
  buildBaiyoke(x0, x1, z0, z1) {
    const b = this.buf;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // Podium
    b.facade.zakkyo.boxWalls(x0 + 1, x1 - 1, z0 + 1, z1 - 1, CURB, 16, 12, 12.8, CURB);
    b.roof.top(x0 + 1, x1 - 1, z0 + 1, z1 - 1, 16, 4);
    // Tier 1 (16..88 m)
    b.facade.white.boxWalls(cx - 12, cx + 12, cz - 12, cz + 12, 16, 88, 12, 12.8, 16);
    b.roof.top(cx - 12, cx + 12, cz - 12, cz + 12, 88, 4);
    // Tier 2 (88..126 m)
    b.facade.office.boxWalls(cx - 9, cx + 9, cz - 9, cz + 9, 88, 126, 12, 12.8, 88);
    b.roof.top(cx - 9, cx + 9, cz - 9, cz + 9, 126, 4);
    // Tier 3 Observation Rotunda (126..146 m)
    b.mahanakhonPixel.boxWalls(cx - 6.5, cx + 6.5, cz - 6.5, cz + 6.5, 126, 134, 6, 6);
    b.facade.office.boxWalls(cx - 5.5, cx + 5.5, cz - 5.5, cz + 5.5, 134, 146, 6, 6);
    b.roof.top(cx - 5.5, cx + 5.5, cz - 5.5, cz + 5.5, 146, 4);
    // Red-white communication spire (146..176 m)
    for (let k = 0; k < 6; k++) {
      const ya = 146 + k * 5, yb = ya + 5, r = 0.85 * (1 - k * 0.11);
      (k % 2 === 0 ? b.torii : b.white).boxWalls(cx - r, cx + r, cz - r, cz + r, ya, yb, 1, 1);
    }
    this.spawnLight(cx, cz, 20, '#fbbf24');
  }

  // ------------------------------------------------------------ lots & buildings
  buildLots(x0, x1, z0, z1, district, railRow) {
    const r = this.r;
    const nx = district === 'res' ? 3 : 2, nz = district === 'res' ? 3 : 2 + (r() < 0.5 ? 1 : 0);
    const splits = (a, b, n) => { const s = [a]; for (let k = 1; k < n; k++) s.push(a + (b - a) * (k / n) + (r() - 0.5) * (b - a) / n * 0.4); s.push(b); return s; };
    const xs = splits(x0, x1, nx), zs = splits(z0, z1, nz);
    let konbiniDone = !(r() < 0.25);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      let lx0 = xs[i], lx1 = xs[i + 1], lz0 = zs[j], lz1 = zs[j + 1];
      if (railRow) { // keep the BTS Skytrain corridor (|z| < 7) clear
        if (lz0 < 7 && lz1 > -7) { if (lz1 <= 0 || (lz0 + lz1) / 2 < 0) lz1 = Math.min(lz1, -7); else lz0 = Math.max(lz0, 7); }
        if (lz1 - lz0 < 5) continue;
      }
      const edge = i === 0 || j === 0 || i === nx - 1 || j === nz - 1;
      if (!konbiniDone && edge && (i === 0 || i === nx - 1) && (j === 0 || j === nz - 1)) { this.konbini(lx0, lx1, lz0, lz1); konbiniDone = true; continue; }
      if (district === 'res' && r() < 0.12) continue;
      const ins = district === 'res' ? 1.2 + r() * 0.8 : 0.4 + r() * 0.8;
      lx0 += ins; lx1 -= ins; lz0 += ins; lz1 -= ins;
      if (lx1 - lx0 < 4 || lz1 - lz0 < 4) continue;
      if (district === 'res' && r() < 0.72) this.house(lx0, lx1, lz0, lz1);
      else {
        const h = district === 'down' ? 28 + r() * 78 : district === 'mid' ? 16 + r() * 34 : 8 + r() * 12;
        const type = district === 'down' ? (r() < 0.55 ? 'office' : r() < 0.65 ? 'apartment' : 'white') : district === 'mid' ? ['apartment', 'office', 'zakkyo', 'white'][Math.floor(r() * 4)] : (r() < 0.6 ? 'apartment' : 'white');
        this.building(lx0, lx1, lz0, lz1, Math.round(h / 3.2) * 3.2 + 4.2, type, district !== 'res' && edge, district === 'down' || district === 'mid');
      }
    }
  }

  building(x0, x1, z0, z1, h, type, shops, signs) {
    const b = this.buf, r = this.r, T = TX.FACADE_TILE;
    const base = CURB;
    let y0 = base;
    if (shops) {
      const sy1 = base + 4.0;
      const edges = [[[x0, z1], [x1, z1]], [[x1, z1], [x1, z0]], [[x1, z0], [x0, z0]], [[x0, z0], [x0, z1]]];
      for (const [a, c] of edges) {
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const n = Math.max(1, Math.round(len / 7));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const pa = [a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0], pb = [a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1];
          const slot = Math.floor(r() * TX.SHOP_ATLAS * TX.SHOP_ATLAS), sx = slot % TX.SHOP_ATLAS, sy = Math.floor(slot / TX.SHOP_ATLAS), S = 1 / TX.SHOP_ATLAS;
          b.shop.wall(pa, pb, base, sy1, 0, 1, 1, 0, null, [sx * S, 1 - (sy + 1) * S, (sx + 1) * S, 1 - sy * S]);
        }
      }
      b.concrete.top(x0 - 0.6, x1 + 0.6, z0 - 0.6, z1 + 0.6, sy1, 3);
      b.concrete.boxWalls(x0 - 0.6, x1 + 0.6, z0 - 0.6, z1 + 0.6, sy1 - 0.25, sy1, 3, 1);
      y0 = sy1;
    }
    b.facade[type].boxWalls(x0, x1, z0, z1, y0, base + h, T.w, T.h, y0);
    b.roof.top(x0, x1, z0, z1, base + h, 4);
    b.roof.boxWalls(x0, x1, z0, z1, base + h, base + h + 0.6, 4, 4);
    if (h > 12) {
      for (let k = 0; k < 2 + Math.floor(r() * 3); k++) {
        const px = x0 + 1.5 + r() * (x1 - x0 - 4), pz = z0 + 1.5 + r() * (z1 - z0 - 4), s = 1 + r() * 1.8, hh = 0.8 + r() * 1.8;
        b.roofProps.boxWalls(px, px + s, pz, pz + s, base + h, base + h + hh, 2, 2); b.roofProps.top(px, px + s, pz, pz + s, base + h + hh, 2);
      }
    }
    if (signs && h > 14) {
      const nS = 1 + Math.floor(r() * 2);
      for (let k = 0; k < nS; k++) {
        const corner = Math.floor(r() * 4);
        const cx = corner < 2 ? x1 : x0, cz = corner % 2 ? z1 : z0;
        const dir = r() < 0.5 ? [Math.sign(cx), 0] : [0, Math.sign(cz)];
        const sy0 = 5.2, sy1 = Math.min(base + h - 1, 5.2 + 6 + r() * 5);
        const slot = Math.floor(r() * VERTICAL_SIGNS.length), U = 1 / VERTICAL_SIGNS.length;
        const a = [cx + dir[0] * 0.1, cz + dir[1] * 0.1], c2 = [cx + dir[0] * 1.3, cz + dir[1] * 1.3];
        b.vsign.wall(a, c2, sy0, sy1, 0, 1, 1, 0, null, [slot * U, 0, (slot + 1) * U, 1]);
        b.vsign.wall(c2, a, sy0, sy1, 0, 1, 1, 0, null, [(slot + 1) * U, 0, slot * U, 1]);
      }
    }
    this.colliders.addBox(x0, x1, z0, z1, -5, 1.6);
  }

  house(x0, x1, z0, z1) {
    const b = this.buf, r = this.r;
    const floors = r() < 0.7 ? 2 : 1;
    const h = CURB + floors * 2.9;
    b.facade[r() < 0.5 ? 'white' : 'tile'].boxWalls(x0, x1, z0, z1, CURB, h, 9, 6.4, CURB);
    const along = x1 - x0 > z1 - z0;
    const rh = 1.6 + r() * 0.8, o = 0.5;
    const col = new THREE.Color(['#2e3a4a', '#4a3a32', '#3a3d40', '#5b2f2a', '#2f4a3a'][Math.floor(r() * 5)]).toArray();
    const X0 = x0 - o, X1 = x1 + o, Z0 = z0 - o, Z1 = z1 + o;
    if (along) {
      const zm = (Z0 + Z1) / 2;
      const nA = new THREE.Vector3(0, Z1 - zm, rh).normalize();
      b.houseRoof.quad([X0, h, Z1], [X1, h, Z1], [X1, h + rh, zm], [X0, h + rh, zm], [0, nA.y, nA.z].map((v, i) => (i === 2 ? Math.abs(v) : v)), [0, 0], [1, 0], [1, 1], [0, 1], col);
      b.houseRoof.quad([X1, h, Z0], [X0, h, Z0], [X0, h + rh, zm], [X1, h + rh, zm], [0, nA.y, -Math.abs(nA.z)], [0, 0], [1, 0], [1, 1], [0, 1], col);
      b.facade.white.tri([x0, h, z0], [x0, h, z1], [x0, h + rh, zm], [-1, 0, 0], [0, 0], [1, 0], [0.5, 0.3]);
      b.facade.white.tri([x1, h, z1], [x1, h, z0], [x1, h + rh, zm], [1, 0, 0], [0, 0], [1, 0], [0.5, 0.3]);
    } else {
      const xm = (X0 + X1) / 2;
      b.houseRoof.quad([X1, h, Z1], [X1, h, Z0], [xm, h + rh, Z0], [xm, h + rh, Z1], [0.6, 0.8, 0], [0, 0], [1, 0], [1, 1], [0, 1], col);
      b.houseRoof.quad([X0, h, Z0], [X0, h, Z1], [xm, h + rh, Z1], [xm, h + rh, Z0], [-0.6, 0.8, 0], [0, 0], [1, 0], [1, 1], [0, 1], col);
      b.facade.white.tri([x0, h, z1], [x1, h, z1], [xm, h + rh, z1], [0, 0, 1], [0, 0], [1, 0], [0.5, 0.3]);
      b.facade.white.tri([x1, h, z0], [x0, h, z0], [xm, h + rh, z0], [0, 0, -1], [0, 0], [1, 0], [0.5, 0.3]);
    }
  }

  konbini(x0, x1, z0, z1) {
    const b = this.buf;
    const w = Math.min(16, x1 - x0 - 1), d = Math.min(12, z1 - z0 - 1);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const bx0 = cx - w / 2, bx1 = cx + w / 2, bz0 = cz - d / 2, bz1 = cz + d / 2;
    const h = CURB + 4.6;
    b.konbini.wall([bx0, bz1], [bx1, bz1], CURB, h, 0, 1, 1, 0, null, [0, 0, 1, 1]);
    b.konbini.wall([bx1, bz0], [bx0, bz0], CURB, h, 0, 1, 1, 0, null, [0, 0, 1, 1]);
    b.facade.white.wall([bx1, bz1], [bx1, bz0], CURB, h, 0, 12, 12.8, CURB);
    b.facade.white.wall([bx0, bz0], [bx0, bz1], CURB, h, 0, 12, 12.8, CURB);
    b.roof.top(bx0, bx1, bz0, bz1, h, 4);
    this.spawnLight(cx, cz + d / 2 + 2.5, 7, '#eaf2ff');
  }

  buildStation(x0, x1, z0, z1) {
    const b = this.buf;
    const sx0 = -26, sx1 = 26, sz0 = -11, sz1 = 11, h = CURB + 7;
    b.station.wall([sx0, sz1], [sx1, sz1], CURB, h, 0, 1, 1, 0, null, [0, 0, 1, 1]);
    b.station.wall([sx1, sz0], [sx0, sz0], CURB, h, 0, 1, 1, 0, null, [0, 0, 1, 1]);
    b.facade.office.wall([sx1, sz1], [sx1, sz0], CURB, h, 0, 12, 12.8, CURB);
    b.facade.office.wall([sx0, sz0], [sx0, sz1], CURB, h, 0, 12, 12.8, CURB);
    b.roof.top(sx0, sx1, sz0, sz1, h, 4);
    for (const [x, z] of [[-20, 18], [20, 18], [-20, -18], [20, -18], [0, 20]]) this.inst.tree.push([x, z, 1]);
    this.spawns.push({ name: 'สยาม-อโศก', label: 'สถานี BTS สยาม-อโศก', x: 6, y: 0, z: 32 - 2.4, heading: 0 });
    void x0; void x1; void z0; void z1;
  }

  buildPark(x0, x1, z0, z1) {
    const b = this.buf, r = this.r;
    for (let k = 0; k < 24; k++) this.inst.tree.push([x0 + 2 + r() * (x1 - x0 - 4), z0 + 2 + r() * (z1 - z0 - 4), 0.85 + r() * 0.65]);
    // Thai Pavilion (ศาลาไทยในสวนลุมพินี/เบญจกิติ)
    const cx = (x0 + x1) / 2, cz = z1 - 7;
    for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
      b.white.boxWalls(cx + dx - 0.2, cx + dx + 0.2, cz + dz - 0.2, cz + dz + 0.2, CURB, CURB + 3.6, 1, 1);
    }
    b.torii.boxWalls(cx - 3.2, cx + 3.2, cz - 3.2, cz + 3.2, CURB + 3.6, CURB + 4.3, 1, 1);
    b.torii.top(cx - 3.2, cx + 3.2, cz - 3.2, cz + 3.2, CURB + 4.3, 1);
    b.torii.boxWalls(cx - 2.0, cx + 2.0, cz - 2.0, cz + 2.0, CURB + 4.3, CURB + 5.1, 1, 1);
    b.torii.top(cx - 2.0, cx + 2.0, cz - 2.0, cz + 2.0, CURB + 5.1, 1);
  }

  spawnLight(x, z, s, color, y = CURB + 0.02) { (this.glowList ||= []).push([x, z, s, color, y]); }

  // ------------------------------------------------------------ street furniture
  blockProps(bi, bj, x0, x1, z0, z1, district, wires) {
    const L = LAYOUT, r = this.r, I = this.inst;
    const edges = [
      { a: [x0, z0 + 0.7], b: [x1, z0 + 0.7], main: L.main[bj], out: [0, -1] },
      { a: [x0, z1 - 0.7], b: [x1, z1 - 0.7], main: L.main[bj + 1], out: [0, 1] },
      { a: [x0 + 0.7, z0], b: [x0 + 0.7, z1], main: L.main[bi], out: [-1, 0] },
      { a: [x1 - 0.7, z0], b: [x1 - 0.7, z1], main: L.main[bi + 1], out: [1, 0] },
    ];
    for (const e of edges) {
      const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
      const dir = [(e.b[0] - e.a[0]) / len, (e.b[1] - e.a[1]) / len];
      const at = (t) => [e.a[0] + dir[0] * t, e.a[1] + dir[1] * t];
      if (e.main) {
        for (let t = 6; t < len - 4; t += 24) {
          const [x, z] = at(t); I.lamp.push([x, z, Math.atan2(e.out[0], e.out[1])]);
          this.spawnLight(x + e.out[0] * 2.2, z + e.out[1] * 2.2, 9, '#ffd59a');
          const [tx, tz] = at(t + 12); if (t + 12 < len - 3) I.tree.push([tx - e.out[0] * 0.3, tz - e.out[1] * 0.3, 0.7]);
        }
      } else {
        let prev = null;
        for (let t = 4; t < len - 2; t += 26) {
          const [x, z] = at(t); I.pole.push([x, z, Math.atan2(dir[0], dir[1])]);
          if ((t / 26 | 0) % 3 === 1) I.trans.push([x, z]);
          if (prev) for (const off of [-0.55, 0, 0.55]) {
            const sag = 0.45;
            const ox = -dir[1] * off, oz = dir[0] * off;
            const steps = 6;
            for (let s = 0; s < steps; s++) {
              const u0 = s / steps, u1 = (s + 1) / steps;
              const y0 = 8.6 - sag * 4 * u0 * (1 - u0), y1 = 8.6 - sag * 4 * u1 * (1 - u1);
              wires.push(prev[0] + (x - prev[0]) * u0 + ox, y0, prev[1] + (z - prev[1]) * u0 + oz, prev[0] + (x - prev[0]) * u1 + ox, y1, prev[1] + (z - prev[1]) * u1 + oz);
            }
          }
          prev = [x, z];
        }
      }
      if (r() < (district === 'res' ? 0.35 : 0.25)) {
        const t = 5 + r() * (len - 10); const [x, z] = at(t);
        const n = 1 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) I.vending.push([x + dir[0] * k * 1.05 - e.out[0] * 1.6, z + dir[1] * k * 1.05 - e.out[1] * 1.6, Math.atan2(e.out[0], e.out[1])]);
      }
    }
  }

  roadMarkings() {
    const L = LAYOUT, b = this.buf.lines, W = [0.96, 0.96, 0.94], Y = [0.95, 0.72, 0.15];
    const y = 0.012;
    const dashed = (ax, az, bx, bz, w, col, dash = 5, gap = 5) => {
      const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let t = 0; t < len; t += dash + gap) { const e = Math.min(len, t + dash); stripQuad(b, ax + dx * t, az + dz * t, ax + dx * e, az + dz * e, w, y, col); }
    };
    const N = L.N;
    for (let axis = 0; axis < 2; axis++) for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
      const main = L.main[i], hw = L.w[i] / 2;
      const s0 = L.c[j] + L.w[j] / 2 + 4.5, s1 = L.c[j + 1] - L.w[j + 1] / 2 - 4.5;
      const P = (along, across) => (axis === 0 ? [L.c[i] + across, along] : [along, L.c[i] + across]);
      const seg = (across, w, col, dash) => { const a = P(s0, across), c = P(s1, across); if (dash) dashed(a[0], a[1], c[0], c[1], w, col); else stripQuad(b, a[0], a[1], c[0], c[1], w, y, col); };
      if (main) { seg(-0.18, 0.15, Y); seg(0.18, 0.15, Y); seg(-hw + 0.55, 0.15, W); seg(hw - 0.55, 0.15, W); seg(-hw / 2 - 0.1, 0.12, W, true); seg(hw / 2 + 0.1, 0.12, W, true); }
      else { seg(0, 0.12, W, true); seg(-hw + 0.4, 0.12, W); seg(hw - 0.4, 0.12, W); }
      for (const [edge, sgn] of [[s0, -1], [s1, 1]]) {
        const cw0 = edge + sgn * 0.5, cw1 = edge + sgn * 4.0;
        for (let x = -hw + 0.6; x < hw - 0.5; x += 0.9) {
          const a = P(Math.min(cw0, cw1), x + 0.225), c = P(Math.max(cw0, cw1), x + 0.225);
          stripQuad(b, a[0], a[1], c[0], c[1], 0.45, y, W);
        }
        const approachLeft = sgn > 0 ? -1 : 1;
        const sl0 = P(edge - sgn * 0.6, approachLeft * 0.2 * (axis === 0 ? -1 : 1)), sl1 = P(edge - sgn * 0.6, approachLeft * (hw - 0.4) * (axis === 0 ? -1 : 1));
        stripQuad(b, sl0[0], sl0[1], sl1[0], sl1[1], 0.45, y, W);
        const crossMain = L.main[sgn > 0 ? j + 1 : j];
        if (!main && crossMain) {
          const along = edge - sgn * 4.2, across = approachLeft * (hw / 2) * (axis === 0 ? -1 : 1);
          const [cx, cz] = P(along, across);
          const dirAlong = axis === 0 ? [0, sgn] : [sgn, 0];
          const ux = dirAlong[0], uz = dirAlong[1];
          const rx = -uz, rz = ux;
          const hwT = 1.6, hlT = 2.6;
          const p = (sx, sz) => [cx + rx * sx + ux * sz, cz + rz * sx + uz * sz];
          const A = p(-hwT, -hlT), B2 = p(hwT, -hlT), C = p(hwT, hlT), D = p(-hwT, hlT);
          this.buf.stopText.quad([A[0], y + 0.002, A[1]], [B2[0], y + 0.002, B2[1]], [C[0], y + 0.002, C[1]], [D[0], y + 0.002, D[1]], [0, 1, 0], [1, 0], [0, 0], [0, 1], [1, 1]);
          const [sx, sz] = P(edge - sgn * 1.2, approachLeft * (hw + 1.0) * (axis === 0 ? -1 : 1));
          this.inst.stop.push([sx, sz, Math.atan2(-ux, -uz)]);
        }
      }
    }
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      if (!(L.main[i] && L.main[j])) continue;
      const x = L.c[i], z = L.c[j], hw = L.w[i] / 2, hz = L.w[j] / 2;
      this.signals.push({ i, j, x, z });
      for (const [sx, sz, rot, axis] of [[x - hw - 1, z + hz + 1, Math.PI / 2, 1], [x + hw + 1, z - hz - 1, -Math.PI / 2, 1], [x - hw - 1, z - hz - 1, 0, 0], [x + hw + 1, z + hz + 1, Math.PI, 0]]) this.inst.signal.push([sx, sz, rot, axis]);
    }
  }

  // ------------------------------------------------------------ Bangkok Elevated Expressway & Motorway
  ringPath(step = 4) {
    const { half, radius } = LAYOUT.ring;
    const s = half - radius, pts = [];
    const push = (x, z) => pts.push([x, z]);
    // clockwise starting east side going north (-z)
    for (let z = s; z > -s; z -= step) push(half, z);
    for (let a = 0; a < Math.PI / 2; a += step / radius) push(s + Math.cos(a) * radius, -s - Math.sin(a) * radius);
    for (let x = s; x > -s; x -= step) push(x, -half);
    for (let a = Math.PI / 2; a < Math.PI; a += step / radius) push(-s + Math.cos(a) * radius, -s - Math.sin(a) * radius);
    for (let z = -s; z < s; z += step) push(-half, z);
    for (let a = Math.PI; a < 1.5 * Math.PI; a += step / radius) push(-s + Math.cos(a) * radius, s - Math.sin(a) * radius);
    for (let x = -s; x < s; x += step) push(x, half);
    for (let a = 1.5 * Math.PI; a < 2 * Math.PI; a += step / radius) push(s + Math.cos(a) * radius, s - Math.sin(a) * radius);
    return pts;
  }

  buildExpressway() {
    const { width, y, half, radius } = LAYOUT.ring;
    const pts = this.ringPath(4);
    this.ringPts = pts;
    const b = this.buf, hw = width / 2;
    const ramps = [
      { hx: half + hw, hz: 0, lx: half + hw + 150, lz: 0 }, { hx: -half - hw, hz: 0, lx: -half - hw - 150, lz: 0 },
      { hx: 0, hz: half + hw, lx: 0, lz: half + hw + 150 }, { hx: 0, hz: -half - hw, lx: 0, lz: -half - hw - 150 },
    ];
    const nearRamp = (x, z) => ramps.some((rp) => Math.hypot(x - rp.hx, z - rp.hz) < 6.8);
    const W = [0.96, 0.96, 0.94], Yc = [0.96, 0.74, 0.12], Red = [0.88, 0.16, 0.16];
    const EasyBlue = [0.05, 0.45, 0.85], MFlowGreen = [0.04, 0.62, 0.42];
    const cornerZone = (x, z) => Math.abs(x) > half - radius - 16 && Math.abs(z) > half - radius - 16;

    let along = 0;
    for (let k = 0; k < pts.length; k++) {
      const p0 = pts[k], p1 = pts[(k + 1) % pts.length];
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz);
      const nx = -dz / L, nz = dx / L;
      const off = (p, o) => [p[0] + nx * o, p[1] + nz * o];
      const l0 = off(p0, hw), l1 = off(p1, hw), r0 = off(p0, -hw), r1 = off(p1, -hw);
      const quad = [r0, r1, l1, l0];
      const area = (q) => q.reduce((s, a, i) => { const c = q[(i + 1) % 4]; return s + (a[0] * c[1] - c[0] * a[1]); }, 0);
      b.deckTop.flat(area(quad) < 0 ? quad : [...quad].reverse(), y, 6);
      // Concrete box-girder fascia + soffit underside
      b.concrete.wall(l0, l1, y - 1.35, y, along, 4, 4);
      b.concrete.wall(r1, r0, y - 1.35, y, along, 4, 4);
      b.concrete.flat(area(quad) < 0 ? [...quad].reverse() : quad, y - 1.35, 6);

      // Jersey concrete barriers + acoustic noise barriers + curve chevrons
      const isCorner = cornerZone(p0[0], p0[1]);
      for (const [a, c, isOuterSide] of [[l0, l1, false], [r1, r0, true]]) {
        const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        const isOuter = Math.max(Math.abs(mx), Math.abs(mz)) > half;
        if (isOuter && nearRamp(mx, mz)) {
          // Yellow-black hazard crash nose at ramp gore split
          b.hazard.boxWalls(mx - 0.6, mx + 0.6, mz - 0.6, mz + 0.6, y, y + 1.25, 2, 2);
          b.hazard.top(mx - 0.6, mx + 0.6, mz - 0.6, mz + 0.6, y + 1.25, 2);
          continue;
        }
        b.concrete.wall(a, c, y, y + 1.15, along, 4, 4);
        b.concrete.wall(c, a, y, y + 1.15, along, 4, 4);
        this.colliders.addSegment(a[0], a[1], c[0], c[1], y - 2, y + 4, 0.3);

        // Acoustic Noise Barrier (กำแพงกันเสียงทางด่วนศรีรัช) on corners & urban stretches
        const inTollZone = (Math.abs(Math.abs(mx) - half) < 12 && Math.abs(Math.abs(mz) - 175) < 28);
        if (!inTollZone && (isCorner || (isOuter && (k % 24 < 10)))) {
          b.noiseBarrier.wall(a, c, y + 1.15, y + 3.45, along, 4, 2.3, y + 1.15);
          b.noiseBarrier.wall(c, a, y + 1.15, y + 3.45, along, 4, 2.3, y + 1.15);
        }
        // Yellow-black curve warning chevrons (>>>) on the outer wall of the 4 expressway corners
        if (isCorner && isOuter && k % 3 === 0) {
          b.chevron.wall(c, a, y + 1.35, y + 2.35, 0, 1, 1, 0, null, [0, 0, 1, 1]);
        }
        void isOuterSide;
      }

      // Expressway lane markings
      const mk = (o, w, col) => { const a = off(p0, o), c = off(p1, o); stripQuad(this.buf.lines, a[0], a[1], c[0], c[1], w, y + 0.012, col); };
      mk(-0.16, 0.15, Yc); mk(0.16, 0.15, Yc);
      // Red-white / yellow-black shoulder curb reflectors on corners
      mk(hw - 0.48, 0.16, isCorner && (k % 2 === 0) ? Red : W);
      mk(-hw + 0.48, 0.16, isCorner && (k % 2 === 0) ? Red : W);
      if ((k % 3) === 0) { mk(3.5, 0.13, W); mk(-3.5, 0.13, W); }
      // Reflective yellow center studs
      if ((k % 2) === 0) mk(0, 0.22, Yc);

      // Twin-arm Bangkok Expressway sodium-orange lamps & Hammerhead T-piers
      if (k % 7 === 0) {
        this.pillar(p0[0], p0[1], y - 1.35, 1.15, [nx, nz], width);
        this.inst.lamp.push([l0[0] - nx * 0.35, l0[1] - nz * 0.35, Math.atan2(-nx, -nz), y]);
        this.inst.lamp.push([r0[0] + nx * 0.35, r0[1] + nz * 0.35, Math.atan2(nx, nz), y]);
        this.spawnLight(p0[0] + nx * 3.2, p0[1] + nz * 3.2, 11, '#ff9d3b', y + 0.03);
        this.spawnLight(p0[0] - nx * 3.2, p0[1] - nz * 3.2, 11, '#ff9d3b', y + 0.03);
      }
      along += L;
    }

    // ---- Overhead Bangkok Expressway / Motorway Gantry Signs (8 locations around the ring)
    const gantrySpots = [
      { x: half, z: 72, tx: 0, tz: -1, slot: 0 },     // East straight approaching Din Daeng / Rama IX ramp
      { x: half, z: -95, tx: 0, tz: -1, slot: 1 },    // East straight heading to Motorway 7 (Suvarnabhumi / Chonburi)
      { x: 90, z: -half, tx: -1, tz: 0, slot: 0 },    // North straight heading to Chaeng Watthana / Din Daeng
      { x: -90, z: -half, tx: -1, tz: 0, slot: 2 },   // North straight approaching West interchange
      { x: -half, z: -72, tx: 0, tz: 1, slot: 2 },    // West straight approaching Dao Khanong / Khao Yai ramp
      { x: -half, z: 95, tx: 0, tz: 1, slot: 3 },     // West straight heading South
      { x: -90, z: half, tx: 1, tz: 0, slot: 3 },     // South straight approaching Bang Na / Khlong Toei ramp
      { x: 90, z: half, tx: 1, tz: 0, slot: 1 },      // South straight heading East to Suvarnabhumi / Port
    ];
    for (const gs of gantrySpots) this.buildGantry(gs.x, gs.z, y, hw, gs.tx, gs.tz, gs.slot);

    // ---- 2 Realistic Bangkok Expressway Toll Plazas (ด่านเก็บค่าผ่านทางพิเศษ Easy Pass / M-Flow)
    // Placed on straight sections; outer booths & canopy frame the road with Easy Pass / M-Flow lanes open for racing!
    this.buildTollPlaza(half, 175, y, hw, 0, -1, EasyBlue, MFlowGreen, W);
    this.buildTollPlaza(-half, -175, y, hw, 0, 1, EasyBlue, MFlowGreen, W);

    this.surfaces.addRingDeck(half, LAYOUT.ring.radius, width, y);

    // ---- 4 On/Off Ramps with Bangkok highway lamps & hazard barriers
    for (let rIdx = 0; rIdx < ramps.length; rIdx++) {
      const rp = ramps[rIdx];
      const dx = rp.lx - rp.hx, dz = rp.lz - rp.hz, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
      const nx = -uz * 4.5, nz = ux * 4.5;
      const steps = 30;
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        const yA = y * (1 - t0), yB = y * (1 - t1);
        const A = [rp.hx + dx * t0, rp.hz + dz * t0], Bp = [rp.hx + dx * t1, rp.hz + dz * t1];
        const a1 = [A[0] + nx, A[1] + nz], a2 = [A[0] - nx, A[1] - nz], b1 = [Bp[0] + nx, Bp[1] + nz], b2 = [Bp[0] - nx, Bp[1] - nz];
        const up = [0, 1, 0];
        const q = [[a2[0], yA, a2[1]], [b2[0], yB, b2[1]], [b1[0], yB, b1[1]], [a1[0], yA, a1[1]]];
        const cross = (q[1][0] - q[0][0]) * (q[2][2] - q[0][2]) - (q[1][2] - q[0][2]) * (q[2][0] - q[0][0]);
        const qq = cross > 0 ? q : [...q].reverse();
        b.deckTop.quad(qq[0], qq[1], qq[2], qq[3], up, [qq[0][0] / 6, qq[0][2] / 6], [qq[1][0] / 6, qq[1][2] / 6], [qq[2][0] / 6, qq[2][2] / 6], [qq[3][0] / 6, qq[3][2] / 6]);
        for (const [p, o] of [[a1, b1], [b2, a2]]) {
          const ya = p === a1 ? yA : yB, yb = p === a1 ? yB : yA;
          b.concrete.quad([p[0], Math.max(0, ya - 1.3), p[1]], [o[0], Math.max(0, yb - 1.3), o[1]], [o[0], yb + 1.05, o[1]], [p[0], ya + 1.05, p[1]], [0, 0, 1], [0, 0], [1, 0], [1, 1], [0, 1]);
          b.concrete.quad([o[0], Math.max(0, yb - 1.3), o[1]], [p[0], Math.max(0, ya - 1.3), p[1]], [p[0], ya + 1.05, p[1]], [o[0], yb + 1.05, o[1]], [0, 0, -1], [0, 0], [1, 0], [1, 1], [0, 1]);
        }
        if (s % 6 === 0 && yA > 3) this.pillar(A[0], A[1], yA - 1.3, 0.85, [nx / 4.5, nz / 4.5], 9);
        if (s % 5 === 2) {
          this.inst.lamp.push([a1[0], a1[1], Math.atan2(-nx, -nz), yA]);
        }
      }
      // Entrance gantry sign at base of ramp
      this.buildGantry(rp.lx - ux * 14, rp.lz - uz * 14, 0.5, 4.8, -ux, -uz, rIdx % 4);
      this.colliders.addSegment(rp.hx + nx, rp.hz + nz, rp.lx + nx, rp.lz + nz, -5, 14, 0.3);
      this.colliders.addSegment(rp.hx - nx, rp.hz - nz, rp.lx - nx, rp.lz - nz, -5, 14, 0.3);
      this.surfaces.addRamp(rp.lx, rp.lz, rp.hx, rp.hz, 9, 0, y);
      stripQuad(this.buf.lines, rp.hx + nx * 0.85, rp.hz + nz * 0.85, rp.lx + nx * 0.85, rp.lz + nz * 0.85, 0.12, 0, W);
    }
    this.ramps = ramps;
    this.spawns.push({ name: 'ทางด่วนศรีรัช', label: 'ทางด่วนศรีรัช-มอเตอร์เวย์', x: half - 3.5, y, z: 120, heading: Math.PI / 2 });
  }

  // Overhead steel truss gantry with Thai EXAT Blue / Motorway 7 Green directional signboards
  buildGantry(x, z, y, hw, tx, tz, slot) {
    const b = this.buf;
    const nx = -tz, nz = tx; // across-road unit vector
    const span = hw + 0.55;
    const lx = x + nx * span, lz = z + nz * span;
    const rx = x - nx * span, rz = z - nz * span;
    const h0 = y + 5.3, h1 = y + 8.3;
    // Steel gantry columns on outer barriers (outside driving lanes)
    for (const [px, pz] of [[lx, lz], [rx, rz]]) {
      b.metal.boxWalls(px - 0.26, px + 0.26, pz - 0.26, pz + 0.26, y, h1, 1, 1);
    }
    // Overhead horizontal truss beam
    const bx0 = Math.min(lx, rx) - 0.3, bx1 = Math.max(lx, rx) + 0.3;
    const bz0 = Math.min(lz, rz) - 0.3, bz1 = Math.max(lz, rz) + 0.3;
    b.metal.boxWalls(bx0, bx1, bz0, bz1, h0 + 0.8, h0 + 1.35, 2, 1);
    b.metal.top(bx0, bx1, bz0, bz1, h0 + 1.35, 2);

    // Signboard UV in 4-row vertical atlas (slot 0..3)
    const v0 = 1 - (slot + 1) * 0.25, v1 = 1 - slot * 0.25;
    const slx = x + nx * (hw - 0.4), slz = z + nz * (hw - 0.4);
    const srx = x - nx * (hw - 0.4), srz = z - nz * (hw - 0.4);
    const fOff = 0.24;
    // Front face (facing approaching traffic) + back face (for opposite direction)
    b.gantrySign.wall([srx - tx * fOff, srz - tz * fOff], [slx - tx * fOff, slz - tz * fOff], h0, h1, 0, 1, 1, 0, null, [0, v0, 1, v1]);
    b.gantrySign.wall([slx + tx * fOff, slz + tz * fOff], [srx + tx * fOff, srz + tz * fOff], h0, h1, 0, 1, 1, 0, null, [0, v0, 1, v1]);
  }

  // Bangkok Expressway Toll Plaza (ด่านเก็บค่าผ่านทางพิเศษ Easy Pass / M-Flow)
  buildTollPlaza(x, z, y, hw, tx, tz, EasyBlue, MFlowGreen, W) {
    const b = this.buf;
    const nx = -tz, nz = tx;
    const span = hw + 2.2;
    const cLen = 6.5;
    const x0 = x - Math.abs(nx) * span - Math.abs(tx) * cLen;
    const x1 = x + Math.abs(nx) * span + Math.abs(tx) * cLen;
    const z0 = z - Math.abs(nz) * span - Math.abs(tz) * cLen;
    const z1 = z + Math.abs(nz) * span + Math.abs(tz) * cLen;

    // 1. Painted Easy Pass (blue) & M-Flow (green) lane carpets on the expressway deck
    for (const [laneOff, col] of [[-5.1, EasyBlue], [-1.8, MFlowGreen], [1.8, MFlowGreen], [5.1, EasyBlue]]) {
      const lx = x + nx * laneOff, lz = z + nz * laneOff;
      stripQuad(b.lines, lx - tx * 18, lz - tz * 18, lx + tx * 18, lz + tz * 18, 2.3, y + 0.016, col);
      // Dashed white lane guides through the toll gate
      stripQuad(b.lines, lx + nx * 1.3 - tx * 18, lz + nz * 1.3 - tz * 18, lx + nx * 1.3 + tx * 18, lz + nz * 1.3 + tz * 18, 0.14, y + 0.018, W);
    }

    // 2. Outer support columns & Side Toll Control Booths (outside the 14m roadway so races/traffic never snag!)
    for (const sgn of [-1, 1]) {
      const px = x + nx * (hw + 1.15) * sgn, pz = z + nz * (hw + 1.15) * sgn;
      // Toll booth kiosk on outer shoulder platform
      b.concrete.top(px - 1.6, px + 1.6, pz - 4.5, pz + 4.5, y, 2);
      b.concrete.boxWalls(px - 1.6, px + 1.6, pz - 4.5, pz + 4.5, y - 1.35, y, 2, 2);
      b.hazard.boxWalls(px - 1.2, px + 1.2, pz - 4.2, pz + 4.2, y, y + 0.9, 2, 1);
      b.facade.office.boxWalls(px - 1.0, px + 1.0, pz - 2.6, pz + 2.6, y + 0.9, y + 3.6, 4, 4);
      // Canopy structural columns
      b.concrete.boxWalls(px - 0.55, px + 0.55, pz - 0.55, pz + 0.55, y, y + 6.4, 2, 2);
      // Raised red-white automatic toll barrier arm (angled up at 70° so lane is open)
      const bx = x + nx * (hw - 0.35) * sgn, bz = z + nz * (hw - 0.35) * sgn;
      b.hazard.boxWalls(bx - 0.2, bx + 0.2, bz - 0.2, bz + 0.2, y, y + 1.2, 1, 1);
      b.torii.boxWalls(bx - 0.08, bx + 0.08, bz - 0.08, bz + 0.08, y + 1.2, y + 3.4, 1, 1);
    }

    // 3. High EXAT Canopy Roof & Illuminated Easy Pass / M-Flow Sign Fascia (y + 4.9 .. y + 7.5)
    b.concrete.boxWalls(x0, x1, z0, z1, y + 6.2, y + 7.5, 4, 2);
    b.concrete.top(x0 - 0.6, x1 + 0.6, z0 - 0.6, z1 + 0.6, y + 7.5, 4);
    b.white.flat([[x0, z1], [x1, z1], [x1, z0], [x0, z0]].reverse(), y + 6.18, 4);

    // Front & back full-width Toll Plaza & Lane Signboard
    const slx = x + nx * (hw + 0.4), slz = z + nz * (hw + 0.4);
    const srx = x - nx * (hw + 0.4), srz = z - nz * (hw + 0.4);
    b.tollSign.wall([srx - tx * (cLen + 0.1), srz - tz * (cLen + 0.1)], [slx - tx * (cLen + 0.1), slz - tz * (cLen + 0.1)], y + 4.7, y + 7.3, 0, 1, 1, 0, null, [0, 0, 1, 1]);
    b.tollSign.wall([slx + tx * (cLen + 0.1), slz + tz * (cLen + 0.1)], [srx + tx * (cLen + 0.1), srz + tz * (cLen + 0.1)], y + 4.7, y + 7.3, 0, 1, 1, 0, null, [0, 0, 1, 1]);

    // Bright toll plaza canopy floodlight glow on the deck
    this.spawnLight(x, z, 18, '#fef08a', y + 0.04);
    this.spawnLight(x - tx * 10, z - tz * 10, 15, '#bae6fd', y + 0.04);
    this.spawnLight(x + tx * 10, z + tz * 10, 15, '#bae6fd', y + 0.04);
  }

  // Giant Bangkok Expressway Unipole Billboards (ป้ายโฆษณาบิลบอร์ดขนาดใหญ่ริมทางด่วน)
  buildBillboards() {
    const b = this.buf, { half } = LAYOUT.ring;
    const spots = [
      [half + 24, 110, 0, 0],
      [half + 24, -140, 0, 1],
      [130, -half - 24, Math.PI / 2, 2],
      [-130, -half - 24, Math.PI / 2, 3],
      [-half - 24, -110, 0, 4],
      [-half - 24, 140, 0, 5],
      [-130, half + 24, Math.PI / 2, 0],
      [130, half + 24, Math.PI / 2, 1],
    ];
    for (const [x, z, rot, slot] of spots) {
      // Heavy steel monopole column (0..22 m)
      const r = 0.65, seg = 8, h0 = 13.5, h1 = 22.0, hw = 8.5;
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
        b.metal.wall([x + Math.cos(a1) * r, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, z + Math.sin(a0) * r], 0, h0 + 1, 0, 2, 2);
      }
      this.colliders.addCircle(x, z, r + 0.2, -5, 6);
      const dx = Math.cos(rot) * hw, dz = Math.sin(rot) * hw;
      const nx = -Math.sin(rot) * 0.45, nz = Math.cos(rot) * 0.45;
      // Steel frame box
      b.metal.boxWalls(Math.min(x - dx, x + dx) - 0.35, Math.max(x - dx, x + dx) + 0.35, Math.min(z - dz, z + dz) - 0.35, Math.max(z - dz, z + dz) + 0.35, h0, h1, 2, 2);
      // Atlas UV for slot (2 cols × 3 rows)
      const col = slot % 2, row = Math.floor(slot / 2) % (BILLBOARDS.length / 2);
      const u0 = col * 0.5, u1 = (col + 1) * 0.5, v0 = 1 - (row + 1) / 3, v1 = 1 - row / 3;
      b.billboard.wall([x - dx + nx, z - dz + nz], [x + dx + nx, z + dz + nz], h0, h1, 0, 1, 1, 0, null, [u0, v0, u1, v1]);
      b.billboard.wall([x + dx - nx, z + dz - nz], [x - dx - nx, z - dz - nz], h0, h1, 0, 1, 1, 0, null, [u0, v0, u1, v1]);
    }
  }

  pillar(x, z, top, r, n, span) {
    const b = this.buf.concrete;
    const seg = 10;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
      b.wall(p1, p0, 0, top - 1.1, k, 2, 2);
      // Yellow-black hazard warning band near ground level (Bangkok underpass style)
      this.buf.hazard.wall([x + Math.cos(a1) * (r + 0.02), z + Math.sin(a1) * (r + 0.02)], [x + Math.cos(a0) * (r + 0.02), z + Math.sin(a0) * (r + 0.02)], 0.2, 1.8, k, 2, 2);
    }
    // Flared Hammerhead T-pier crossbeam across the deck
    const cx = n[0] * span / 2, cz = n[1] * span / 2, tx = -n[1] * 0.95, tz = n[0] * 0.95;
    const A = [x + cx + tx, z + cz + tz], B = [x + cx - tx, z + cz - tz], C = [x - cx - tx, z - cz - tz], D = [x - cx + tx, z - cz + tz];
    for (const [p, q] of [[A, B], [B, C], [C, D], [D, A]]) { b.wall(p, q, top - 1.1, top, 0, 2, 2); b.wall(q, p, top - 1.1, top, 0, 2, 2); }
    this.colliders.addCircle(x, z, r + 0.1, -5, Math.max(4, top - 2));
  }

  // ------------------------------------------------------------ BTS Skytrain viaduct + train
  buildRail() {
    const { z, y, x0, x1 } = LAYOUT.rail, b = this.buf;
    const hw = 5;
    b.concrete.top(x0, x1, z - hw, z + hw, y, 4);
    b.concrete.boxWalls(x0, x1, z - hw, z + hw, y - 1.2, y + 1.0, 4, 4);
    b.concrete.flat([[x0, z - hw], [x0, z + hw], [x1, z + hw], [x1, z - hw]].reverse(), y - 1.2, 4);
    const railMesh = new GeoBuf();
    for (const t of [-2.2, -0.75, 0.75, 2.2]) railMesh.boxWalls(x0, x1, z + t - 0.04, z + t + 0.04, y, y + 0.16, 2, 2);
    const rm = new THREE.Mesh(railMesh.build(), this.M.rail); this.group.add(rm);
    const L = LAYOUT;
    const xs = [];
    for (let i = 0; i < L.N; i++) { const a = L.c[i] + L.w[i] / 2 + 6, c = L.c[i + 1] - L.w[i + 1] / 2 - 6; for (let x = a; x <= c; x += Math.max(10, (c - a) / 2)) xs.push(x); }
    xs.push(-305, 305);
    for (const x of xs) {
      const seg = 8, r = 0.9;
      for (let k = 0; k < seg; k++) { const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2; b.concrete.wall([x + Math.cos(a1) * r, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, z + Math.sin(a0) * r], 0, y - 1.2, 0, 2, 2); }
      if (Math.abs(x) > 290) this.colliders.addCircle(x, z, 1, -5, 5);
    }
    // BTS Skytrain (6 cars with white body, crimson red & dark navy stripes)
    const train = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(19.5, 3.6, 2.9), this.M.train);
      body.position.y = 2.1;
      const stripeRed = new THREE.Mesh(new THREE.BoxGeometry(19.52, 0.32, 2.92), this.M.trainStripe); stripeRed.position.y = 1.55;
      const stripeNavy = new THREE.Mesh(new THREE.BoxGeometry(19.52, 0.26, 2.92), this.M.trainNavy); stripeNavy.position.y = 1.22;
      const win = new THREE.Mesh(new THREE.BoxGeometry(18.8, 0.92, 2.94), this.M.trainWin); win.position.y = 2.6;
      car.add(body, stripeRed, stripeNavy, win);
      car.position.x = k * 20;
      car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      train.add(car);
    }
    train.position.set(x0, y + 0.2, z + 2.2 - 1.45 + 0.2);
    this.train = { group: train, x: -280, dir: 1, wait: 0, speed: 0 };
    this.group.add(train);
  }

  // ------------------------------------------------------------ Khlong Toei Harbor & outskirts
  buildHarbor() {
    const b = this.buf, r = this.r;
    b.water.flat([[545, 1200], [1200, 1200], [1200, -1200], [545, -1200]], -0.6, 8);
    b.concrete.wall([545, -1200], [545, 1200], -0.6, 0.05, 0, 4, 4);
    const cols = ['#b23a2a', '#2d5d8f', '#d98b1c', '#3c7a4a', '#7a7a7a', '#8a2d6b', '#e0e0e0'];
    const cmats = cols.map((c) => new THREE.MeshStandardMaterial({ map: TX.containerTexture(c), roughness: 0.7 }));
    const cbufs = cols.map(() => new GeoBuf());
    for (let x = 400; x < 520; x += 14) for (let z = -230; z < -60; z += 3.2) {
      if (r() < 0.25) continue;
      const stack = 1 + Math.floor(r() * 4);
      for (let s = 0; s < stack; s++) { const cb = cbufs[Math.floor(r() * cols.length)]; cb.boxWalls(x, x + 12, z, z + 2.5, s * 2.6, s * 2.6 + 2.55, 12, 2.6, s * 2.6); cb.top(x, x + 12, z, z + 2.5, s * 2.6 + 2.55, 12); }
      this.colliders.addBox(x, x + 12, z, z + 2.5, -5, stack * 2.6);
    }
    cbufs.forEach((cb, i) => { if (cb.count) { const m = new THREE.Mesh(cb.build(), cmats[i]); m.castShadow = true; m.receiveShadow = true; this.group.add(m); } });
    for (let z = 60; z < 250; z += 46) { const x0 = 400, x1 = 400 + 60 + r() * 50, h = 10 + r() * 6; b.facade.zakkyo.boxWalls(x0, x1, z, z + 36, 0, h, 12, 12.8); b.roof.top(x0, x1, z, z + 36, h, 4); this.colliders.addBox(x0, x1, z, z + 36, -5, h); }
    for (const z of [-200, -120]) {
      for (const [dx, dz] of [[0, 0], [0, 18], [14, 0], [14, 18]]) b.white.boxWalls(525 + dx, 526.5 + dx, z + dz, z + dz + 1.5, 0, 36, 4, 4);
      b.white.boxWalls(510, 560, z - 1, z + 19.5, 34, 37, 8, 8); b.white.top(510, 560, z - 1, z + 19.5, 37, 8);
      for (const [dx, dz] of [[0, 0], [0, 18], [14, 0], [14, 18]]) this.colliders.addBox(525 + dx, 526.5 + dx, z + dz, z + dz + 1.5, -5, 30);
    }
    this.colliders.addSegment(545, -560, 545, 560, -5, 30, 0.5);
    this.spawns.push({ name: 'คลองเตย', label: 'ท่าเรือคลองเตย', x: 460, y: 0, z: -20, heading: Math.PI / 2 });
  }

  buildOutskirts() {
    const r = this.r;
    for (let k = 0; k < 70; k++) {
      const side = Math.floor(r() * 3);
      let x, z;
      if (side === 0) { x = -540 + r() * 120; z = -500 + r() * 1000; } else if (side === 1) { x = -500 + r() * 860; z = 420 + r() * 120; } else { x = -500 + r() * 860; z = -540 + r() * 120; }
      if (Math.abs(x) < 12 || Math.abs(z) < 12) continue;
      const w = 8 + r() * 6, d = 7 + r() * 5;
      this.house(x, x + w, z, z + d);
      this.colliders.addBox(x, x + w, z, z + d, -5, 6);
    }
    this.spawns.push({ name: 'ลาดพร้าว', label: 'ย่านลาดพร้าว', x: -200, y: 0, z: 160 - 2.4, heading: 0 });
    this.spawns.push({ name: 'พระราม 9', label: 'ถนนพระราม 9 - รัชดา', x: -96 - 4.5, y: 0, z: 150, heading: Math.PI / 2 });
  }

  // Bangkok Covered Pedestrian Overpasses (สะพานลอยข้ามถนนหลัก)
  buildOverpasses() {
    const b = this.buf;
    const spots = [
      [-96, -192, 'x', 0],
      [96, 192, 'x', 1],
      [192, -96, 'z', 2],
      [-192, 96, 'z', 3],
    ];
    const hw = 9; // half-width of L.main 18m avenues
    for (const [cx, cz, axis, slot] of spots) {
      const ux = axis === 'x' ? 1 : 0, uz = axis === 'x' ? 0 : 1;
      const tx = axis === 'x' ? 0 : 1, tz = axis === 'x' ? 1 : 0;
      const boxCoords = (u0, u1, t0, t1) => {
        const ax = cx + ux * u0 + tx * t0, bx = cx + ux * u1 + tx * t1;
        const az = cz + uz * u0 + tz * t0, bz = cz + uz * u1 + tz * t1;
        return [Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz)];
      };
      const addBox = (buf, u0, u1, t0, t1, y0, y1, su = 2, sv = 2) => {
        const [x0, x1, z0, z1] = boxCoords(u0, u1, t0, t1);
        buf.boxWalls(x0, x1, z0, z1, y0, y1, su, sv);
        buf.top(x0, x1, z0, z1, y1, su);
      };

      // 1. Elevated walkway deck (6.2m clear headroom for trucks/traffic)
      const [dx0, dx1, dz0, dz1] = boxCoords(-10.6, 10.6, -1.4, 1.4);
      b.concrete.boxWalls(dx0, dx1, dz0, dz1, 6.2, 6.75, 4, 2);
      b.concrete.top(dx0, dx1, dz0, dz1, 6.75, 4);
      b.concrete.quad([dx0, 6.2, dz0], [dx1, 6.2, dz0], [dx1, 6.2, dz1], [dx0, 6.2, dz1], [0, -1, 0], [0, 0], [4, 0], [4, 1], [0, 1]);

      // 2. Side concrete parapets, steel handrails & pitched/shaded canopy roof
      for (const sgn of [-1, 1]) {
        const tA = sgn > 0 ? 1.18 : -1.4, tB = sgn > 0 ? 1.4 : -1.18;
        addBox(b.concrete, -10.55, 10.55, tA, tB, 6.75, 7.45, 2, 1);
        addBox(b.metal, -10.55, 10.55, sgn * 1.24 - 0.05, sgn * 1.24 + 0.05, 7.75, 7.88, 2, 1);
        for (const pu of [-9.8, -4.9, 0, 4.9, 9.8]) {
          addBox(b.metal, pu - 0.07, pu + 0.07, sgn * 1.28 - 0.07, sgn * 1.28 + 0.07, 7.45, 9.05, 1, 1);
        }
      }
      const [rx0, rx1, rz0, rz1] = boxCoords(-10.85, 10.85, -1.55, 1.55);
      b.metal.boxWalls(rx0, rx1, rz0, rz1, 9.05, 9.3, 4, 1);
      b.metal.top(rx0, rx1, rz0, rz1, 9.3, 4);
      b.metal.quad([rx0, 9.05, rz0], [rx1, 9.05, rz0], [rx1, 9.05, rz1], [rx0, 9.05, rz1], [0, -1, 0], [0, 0], [4, 0], [4, 1], [0, 1]);

      // 3. Support piers & sidewalk staircases placed cleanly on sidewalks (|u| >= hw + 0.75)
      for (const sgn of [-1, 1]) {
        const u0 = sgn * (hw + 0.75), u1 = sgn * (hw + 1.55);
        addBox(b.concrete, Math.min(u0, u1), Math.max(u0, u1), -1.1, 1.1, CURB, 6.2, 2, 2);
        const [px0, px1, pz0, pz1] = boxCoords(Math.min(u0, u1), Math.max(u0, u1), -1.1, 1.1);
        this.colliders.addBox(px0, px1, pz0, pz1, -5, 7);

        // Stepped concrete stair run descending along the sidewalk
        const su0 = Math.min(sgn * (hw + 0.65), sgn * (hw + 1.85));
        const su1 = Math.max(sgn * (hw + 0.65), sgn * (hw + 1.85));
        for (let st = 0; st < 6; st++) {
          const st0 = 1.4 + st * 1.12, st1 = st0 + 1.15;
          const topY = Math.max(0.85, 6.2 - st * 0.96);
          addBox(b.concrete, su0, su1, st0, st1, CURB, topY, 1, 1);
        }
        const [sx0, sx1, sz0, sz1] = boxCoords(su0, su1, 1.4, 8.2);
        this.colliders.addBox(sx0, sx1, sz0, sz1, -5, 6.5);
      }

      // 4. Illuminated Bangkok overpass directional / civic banners on both road-facing faces
      const v0 = 1 - (slot + 1) * 0.25, v1 = 1 - slot * 0.25;
      for (const fDir of [-1, 1]) {
        const ft = fDir * 1.46;
        let pA = [cx + ux * -7.4 + tx * ft, cz + uz * -7.4 + tz * ft];
        let pB = [cx + ux * 7.4 + tx * ft, cz + uz * 7.4 + tz * ft];
        const dx = pB[0] - pA[0], dz = pB[1] - pA[1];
        if ((-dz) * (tx * fDir) + dx * (tz * fDir) < 0) [pA, pB] = [pB, pA];
        b.gantrySign.wall(pA, pB, 6.18, 7.38, 0, 1, 1, 0, null, [0, v0, 1, v1]);
      }

      this.spawnLight(cx, cz, 14, '#fde68a', 0.04);
    }
  }

  // ------------------------------------------------------------ instanced props
  buildInstances() {
    const M = this.M, I = this.inst, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    const make = (geo, mat, list, place, cast = true) => {
      if (!list.length) return null;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, k) => { place(it, m4); m.setMatrixAt(k, m4); });
      m.castShadow = cast; m.receiveShadow = true;
      this.group.add(m); return m;
    };
    const at = (x, y, z, rot, s = s1) => m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(Y, rot), s);
    const lampPole = new GeoBuf();
    lampPole.boxWalls(-0.09, 0.09, -0.09, 0.09, 0, 8, 1, 1); lampPole.boxWalls(-0.06, 0.06, 0, 2.2, 7.8, 7.95, 1, 1);
    make(lampPole.build(), M.metal, I.lamp, (it) => at(it[0], it[3] ?? CURB, it[1], it[2]));
    make(new THREE.BoxGeometry(0.5, 0.14, 0.8).translate(0, 7.75, 2.1), M.lamp, I.lamp, (it) => at(it[0], it[3] ?? CURB, it[1], it[2]), false);
    const pole = new GeoBuf();
    const seg = 8;
    for (let k = 0; k < seg; k++) { const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2; pole.quad([Math.cos(a0) * 0.17, 0, Math.sin(a0) * 0.17], [Math.cos(a1) * 0.17, 0, Math.sin(a1) * 0.17], [Math.cos(a1) * 0.11, 10, Math.sin(a1) * 0.11], [Math.cos(a0) * 0.11, 10, Math.sin(a0) * 0.11], [Math.cos(a0), 0, Math.sin(a0)]); }
    pole.boxWalls(-0.06, 0.06, -0.8, 0.8, 8.5, 8.65, 1, 1); pole.boxWalls(-0.06, 0.06, -0.6, 0.6, 7.6, 7.72, 1, 1);
    const pg = pole.build(); pg.computeVertexNormals();
    make(pg, M.pole, I.pole, (it) => at(it[0], CURB, it[1], it[2]));
    make(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10).translate(0.35, 7.1, 0), M.metal, I.trans, (it) => at(it[0], CURB, it[1], 0));
    make(new THREE.BoxGeometry(1.0, 1.85, 0.8).translate(0, 0.92, 0), M.vending, I.vending, (it) => at(it[0], CURB, it[1], it[2]));
    make(new THREE.CylinderGeometry(0.11, 0.19, 2.5, 7).translate(0, 1.25, 0), M.trunk, I.tree, (it) => at(it[0], CURB, it[1], 0, new THREE.Vector3(it[2], it[2], it[2])));
    // Multi-cluster organic foliage canopy with vertical AO vertex shading
    const leafGeo = (() => {
      const clusters = [
        [0, 3.55, 0, 1.45],
        [-0.75, 2.95, 0.45, 1.05],
        [0.8, 3.05, -0.35, 1.1],
        [0.15, 4.35, 0.15, 0.95],
      ];
      const pos = [], nrm = [], col = [], idx = [];
      let vOff = 0;
      const topC = new THREE.Color('#4f8f3b'), botC = new THREE.Color('#21421b'), tmp = new THREE.Color();
      for (const [cx, cy, cz, rad] of clusters) {
        const g = new THREE.IcosahedronGeometry(rad, 1);
        g.translate(cx, cy, cz);
        const p = g.attributes.position, n = g.attributes.normal;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          pos.push(p.getX(i), y, p.getZ(i));
          nrm.push(n.getX(i), n.getY(i), n.getZ(i));
          const t = THREE.MathUtils.clamp((y - 2.0) / 3.2, 0, 1);
          tmp.copy(botC).lerp(topC, t);
          col.push(tmp.r, tmp.g, tmp.b);
        }
        if (g.index) {
          for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + vOff);
        } else {
          for (let i = 0; i < p.count; i++) idx.push(vOff + i);
        }
        vOff += p.count;
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      out.setIndex(idx);
      return out;
    })();
    make(leafGeo, M.leaf, I.tree, (it) => at(it[0], CURB, it[1], it[0] * 1.7, new THREE.Vector3(it[2] * 1.15, it[2], it[2] * 1.15)));
    const tri = new THREE.Shape([new THREE.Vector2(-0.45, 0.4), new THREE.Vector2(0.45, 0.4), new THREE.Vector2(0, -0.38)]);
    const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.03, bevelEnabled: false }).translate(0, 2.3, 0.05);
    make(triGeo, M.stopSign, I.stop, (it) => at(it[0], CURB, it[1], it[2]));
    make(new THREE.CylinderGeometry(0.035, 0.035, 2.7, 6).translate(0, 1.35, 0), M.metal, I.stop, (it) => at(it[0], CURB, it[1], it[2]));
    const sp = new GeoBuf();
    sp.boxWalls(-0.12, 0.12, -0.12, 0.12, 0, 5.6, 1, 1); sp.boxWalls(-0.06, 0.06, 0, 5.2, 5.3, 5.45, 1, 1);
    make(sp.build(), M.metal, I.signal, (it) => at(it[0], CURB, it[1], it[2]));
    make(new THREE.BoxGeometry(0.42, 0.5, 1.45).translate(0, 5.05, 4.3), M.sigOff, I.signal, (it) => at(it[0], CURB, it[1], it[2]));
    this.sigMats = {};
    const lampGeo = (k) => new THREE.CircleGeometry(0.17, 14).rotateY(-Math.PI / 2).translate(-0.215, 5.05, 4.3 + (k - 1) * 0.45);
    for (const axis of [0, 1]) for (const [k, col] of [[0, '#18d68a'], [1, '#ffb000'], [2, '#ff2a2a']]) {
      const mat = new THREE.MeshStandardMaterial({ color: '#222', emissive: col, emissiveIntensity: 0 });
      this.sigMats[axis + '-' + k] = mat;
      const list = I.signal.filter((s) => s[3] === axis);
      make(lampGeo(k), mat, list, (it) => at(it[0], CURB, it[1], it[2]), false);
    }
  }

  buildGlows() {
    const list = this.glowList || [];
    if (!list.length) return;
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.M.glow, list.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach(([x, z, s, col, y], k) => { m4.makeScale(s, 1, s).setPosition(x, y ?? (CURB + 0.02), z); m.setMatrixAt(k, m4); m.setColorAt(k, c.set(col)); });
    m.renderOrder = 3;
    this.group.add(m); this.glows.push(m);
  }

  // ------------------------------------------------------------ runtime
  signalState(t) {
    const cyc = 38, p = t % cyc;
    const x = p < 14 ? 'g' : p < 17 ? 'y' : 'r';
    const z = p >= 19 && p < 33 ? 'g' : p >= 33 && p < 36 ? 'y' : 'r';
    return { x, z };
  }

  update(dt, night) {
    this.time += dt;
    if (this.M?.water?.normalMap) {
      this.M.water.normalMap.offset.x = (this.time * 0.025) % 1;
      this.M.water.normalMap.offset.y = (this.time * 0.014) % 1;
    }
    const st = this.signalState(this.time);
    for (const [axis, s] of [[0, st.x], [1, st.z]]) {
      this.sigMats[axis + '-0'].emissiveIntensity = s === 'g' ? 3 : 0;
      this.sigMats[axis + '-1'].emissiveIntensity = s === 'y' ? 3 : 0;
      this.sigMats[axis + '-2'].emissiveIntensity = s === 'r' ? 3 : 0;
    }
    const T = this.train, len = 120;
    const target = T.dir > 0 ? 280 - len : -280;
    if (T.wait > 0) T.wait -= dt;
    else {
      const center = T.x + len / 2;
      const distStop = T.stoppedAtStation ? Infinity : Math.abs(center);
      const distEnd = Math.abs(target - T.x);
      const vmax = 16;
      const brake = Math.min(distStop, distEnd);
      const want = Math.min(vmax, Math.sqrt(2 * 1.0 * Math.max(0, brake)) + 0.3);
      T.speed += Math.max(-1.2 * dt, Math.min(0.9 * dt, want - T.speed));
      T.x += T.dir * T.speed * dt;
      if (!T.stoppedAtStation && Math.abs(center) < 0.6 && T.speed < 0.6) { T.speed = 0; T.wait = 12; T.stoppedAtStation = true; }
      if ((T.dir > 0 && T.x >= target - 0.5) || (T.dir < 0 && T.x <= target + 0.5)) { T.speed = 0; T.wait = 8; T.dir *= -1; T.stoppedAtStation = false; }
    }
    T.group.position.x = T.x;
    for (const m of this.nightMats) m.emissiveIntensity = (m.userData.nightBase ?? 0) + night * (m.userData.nightK ?? 1);
    for (const g of this.glows) g.material.opacity = night * 0.35;
  }
}
