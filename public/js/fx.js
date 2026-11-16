// Object-pooled 3D visual effects: colored tire smoke, persistent fading tire skid marks,
// dual-layer exhaust backfire & N2O jet flames, and impact/backfire sparks.
// Zero per-frame allocations so FPS stays smooth on mobile and desktop.
import * as THREE from 'three';

function makeSmokeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.42)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSparkTex() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 1, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,240,1)');
  grd.addColorStop(0.35, 'rgba(255,190,80,0.9)');
  grd.addColorStop(1, 'rgba(255,100,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Ring-buffered quad strip for rear tire skid marks (zero GC).
class SkidMarks {
  constructor(scene, maxQuads = 320) {
    this.max = maxQuads;
    this.head = 0;
    this.pos = new Float32Array(maxQuads * 4 * 3);
    this.col = new Float32Array(maxQuads * 4 * 3);
    const idx = new Uint16Array(maxQuads * 6);
    for (let i = 0; i < maxQuads; i++) {
      const v = i * 4, k = i * 6;
      idx[k] = v; idx[k + 1] = v + 1; idx[k + 2] = v + 2;
      idx[k + 3] = v + 1; idx[k + 4] = v + 3; idx[k + 5] = v + 2;
    }
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.colAttr = new THREE.BufferAttribute(this.col, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('color', this.colAttr);
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.prev = [null, null];
  }

  addQuad(x0, y0, z0, x1, y1, z1, nx, nz, hw = 0.13, dark = 0.08) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    const o = i * 12;
    const dx = nx * hw, dz = nz * hw;
    this.pos[o] = x0 - dx; this.pos[o + 1] = y0; this.pos[o + 2] = z0 - dz;
    this.pos[o + 3] = x0 + dx; this.pos[o + 4] = y0; this.pos[o + 5] = z0 + dz;
    this.pos[o + 6] = x1 - dx; this.pos[o + 7] = y1; this.pos[o + 8] = z1 - dz;
    this.pos[o + 9] = x1 + dx; this.pos[o + 10] = y1; this.pos[o + 11] = z1 + dz;
    for (let k = 0; k < 12; k++) this.col[o + k] = dark;
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  clearPrev() { this.prev[0] = null; this.prev[1] = null; }
}

export class CarFX {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // 1. Pooled tire smoke sprites
    const tex = makeSmokeTex();
    this.smoke = [];
    for (let i = 0; i < 64; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      this.group.add(sp);
      this.smoke.push({ sp, mat, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 0.4, s1: 2.2 });
    }
    this.smokeIdx = 0;
    this.smokeAcc = 0;

    // 2. Pooled spark sprites (backfire embers & curb/collision sparks)
    const sparkTex = makeSparkTex();
    this.sparks = [];
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.SpriteMaterial({ map: sparkTex, color: '#ffcf6b', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      this.group.add(sp);
      this.sparks.push({ sp, mat, life: 0, max: 0.35, vx: 0, vy: 0, vz: 0 });
    }
    this.sparkIdx = 0;

    // 3. Dual-layer exhaust flame cones (outer glow + inner white-hot core)
    const flameGeo = new THREE.ConeGeometry(0.115, 0.78, 10, 1, true);
    flameGeo.rotateZ(Math.PI / 2);
    flameGeo.translate(-0.39, 0, 0);
    const coreGeo = new THREE.ConeGeometry(0.055, 0.46, 8, 1, true);
    coreGeo.rotateZ(Math.PI / 2);
    coreGeo.translate(-0.23, 0, 0);

    this.flameMats = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: '#ff7b1c', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.coreMats = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.flames = this.flameMats.map((m, i) => {
      const mesh = new THREE.Mesh(flameGeo, m);
      const core = new THREE.Mesh(coreGeo, this.coreMats[i]);
      mesh.add(core);
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    });
    this.backfireT = 0;

    // 4. Tire skid marks
    this.skids = new SkidMarks(scene, 320);
    this.skidAcc = 0;
  }

  triggerBackfire(strength = 1) {
    this.backfireT = Math.max(this.backfireT, 0.16 * strength);
    this._wantSparks = true;
  }

  emitSmoke(x, y, z, vx, vz, color = '#ffffff', scale = 1) {
    const p = this.smoke[this.smokeIdx];
    this.smokeIdx = (this.smokeIdx + 1) % this.smoke.length;
    p.life = 0.001;
    p.max = 0.75 + Math.random() * 0.45;
    p.vx = vx * 0.25 + (Math.random() - 0.5) * 0.8;
    p.vy = 0.7 + Math.random() * 0.8;
    p.vz = vz * 0.25 + (Math.random() - 0.5) * 0.8;
    p.s0 = 0.45 * scale;
    p.s1 = (2.1 + Math.random() * 0.9) * scale;
    p.mat.color.set(color || '#ffffff');
    p.sp.position.set(x + (Math.random() - 0.5) * 0.2, y + 0.16, z + (Math.random() - 0.5) * 0.2);
    p.sp.scale.setScalar(p.s0);
    p.sp.visible = true;
  }

  emitSpark(x, y, z, vx, vy, vz, color = '#ffd27a') {
    const p = this.sparks[this.sparkIdx];
    this.sparkIdx = (this.sparkIdx + 1) % this.sparks.length;
    p.life = 0.001;
    p.max = 0.22 + Math.random() * 0.18;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.mat.color.set(color);
    p.sp.position.set(x, y, z);
    p.sp.scale.setScalar(0.14);
    p.sp.visible = true;
  }

  update(dt, car, driver, quality = 'high') {
    // 1. Update pooled smoke particles
    for (let i = 0; i < this.smoke.length; i++) {
      const p = this.smoke[i];
      if (!p.sp.visible) continue;
      p.life += dt;
      if (p.life >= p.max) { p.sp.visible = false; continue; }
      const u = p.life / p.max;
      p.sp.position.x += p.vx * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      p.vy *= 0.96;
      const sc = p.s0 + (p.s1 - p.s0) * u;
      p.sp.scale.setScalar(sc);
      p.mat.opacity = (1 - u) * (1 - u) * 0.42;
    }

    // 2. Update pooled spark particles
    for (let i = 0; i < this.sparks.length; i++) {
      const p = this.sparks[i];
      if (!p.sp.visible) continue;
      p.life += dt;
      if (p.life >= p.max) { p.sp.visible = false; continue; }
      const u = p.life / p.max;
      p.sp.position.x += p.vx * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      p.vy -= 9.8 * dt;
      p.mat.opacity = 1 - u;
      p.sp.scale.setScalar(0.14 * (1 - u * 0.5));
    }

    if (!car || !driver) {
      for (const f of this.flames) f.visible = false;
      this.skids.clearPrev();
      return;
    }

    // 3. Emit tire smoke & skid marks when drifting or burning out
    const slide = driver.slide || 0;
    const spd = driver.vel.length();
    const rate = quality === 'low' ? 14 : quality === 'medium' ? 24 : 36;
    const drifting = (slide > 0.22 && spd > 4) || (driver.burnout && spd < 12);
    const P = car.P;
    const cos = Math.cos(driver.heading), sin = Math.sin(driver.heading);
    const rx = -(P.rAx || 1.25), rz = (P.W || 1.7) * 0.43;

    if (drifting) {
      this.smokeAcc += dt * rate;
      const col = car.b?.kit?.smokeColor || '#ffffff';
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        for (const s of [-1, 1]) {
          const wx = car.root.position.x + rx * cos - (s * rz) * sin;
          const wz = car.root.position.z - rx * sin - (s * rz) * cos;
          this.emitSmoke(wx, car.root.position.y, wz, driver.vel.x, driver.vel.z, col, 1);
        }
      }
      // Skid marks (skip on low quality to maximize mobile FPS)
      if (quality !== 'low') {
        this.skidAcc += dt;
        if (this.skidAcc >= 0.03) {
          this.skidAcc = 0;
          const yMark = car.root.position.y + 0.018;
          for (let idx = 0; idx < 2; idx++) {
            const s = idx === 0 ? -1 : 1;
            const wx = car.root.position.x + rx * cos - (s * rz) * sin;
            const wz = car.root.position.z - rx * sin - (s * rz) * cos;
            const pr = this.skids.prev[idx];
            if (pr) {
              const distSq = (wx - pr.x) * (wx - pr.x) + (wz - pr.z) * (wz - pr.z);
              if (distSq > 0.04 && distSq < 9) {
                this.skids.addQuad(pr.x, pr.y, pr.z, wx, yMark, wz, -sin, -cos, 0.125, 0.05);
              }
            }
            this.skids.prev[idx] = { x: wx, y: yMark, z: wz };
          }
        }
      }
    } else {
      this.smokeAcc = 0;
      this.skids.clearPrev();
    }

    // 4. Exhaust backfire & N2O dual-layer flames
    if (this.backfireT > 0) this.backfireT = Math.max(0, this.backfireT - dt);
    const nosOn = !!driver.nosOn;
    const showFlame = nosOn || this.backfireT > 0;
    const ex = car.b?.kit?.exhaust || 'oem';
    const rearX = -(P.L || 4.3) * 0.49;
    const zOff = ex === 'split' || ex === 'quad' ? 0.54 : 0.44;
    const dual = ex === 'split' || ex === 'quad';
    const flicker = 0.78 + Math.random() * 0.52;

    for (let i = 0; i < 2; i++) {
      const f = this.flames[i];
      const mat = this.flameMats[i];
      const cmat = this.coreMats[i];
      if (!showFlame || (i === 1 && !dual)) {
        f.visible = false;
        continue;
      }
      const zLocal = dual ? (i === 0 ? -zOff : zOff) : -zOff;
      const wx = car.root.position.x + rearX * cos - zLocal * sin;
      const wz = car.root.position.z - rearX * sin - zLocal * cos;
      f.position.set(wx, car.root.position.y + 0.23, wz);
      f.rotation.set(0, driver.heading, 0);
      f.scale.set((nosOn ? 1.55 : 1.05) * flicker, 0.88 + Math.random() * 0.35, 0.88 + Math.random() * 0.35);
      mat.color.set(nosOn ? '#38bdf8' : '#ff7b1c');
      cmat.color.set(nosOn ? '#e0f7ff' : '#fff3c4');
      const alpha = nosOn ? 0.94 : Math.min(1, this.backfireT * 8) * 0.92;
      mat.opacity = alpha;
      cmat.opacity = alpha * 0.95;
      f.visible = true;

      if (this._wantSparks && quality !== 'low') {
        for (let k = 0; k < 3; k++) {
          this.emitSpark(
            wx, car.root.position.y + 0.23, wz,
            -cos * (5 + Math.random() * 5) + (Math.random() - 0.5) * 2,
            1 + Math.random() * 2,
            sin * (5 + Math.random() * 5) + (Math.random() - 0.5) * 2,
            '#ffb347',
          );
        }
      }
    }
    this._wantSparks = false;

    // 5. Collision sparks
    if ((driver.impact || 0) > 0.45 && quality !== 'low') {
      const side = Math.random() > 0.5 ? 1 : -1;
      const wx = car.root.position.x + (Math.random() - 0.5) * 1.5;
      const wz = car.root.position.z + (Math.random() - 0.5) * 1.5;
      for (let k = 0; k < 4; k++) {
        this.emitSpark(wx, car.root.position.y + 0.3, wz, (Math.random() - 0.5) * 6 * side, 2 + Math.random() * 3, (Math.random() - 0.5) * 6, '#ffe08a');
      }
    }
  }
}
