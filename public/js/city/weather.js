// Weather system: rain streaks around the car + wet road surface reflections + rain fog adjustment.
import * as THREE from 'three';

const MAX_DROPS = 1400;
const BOX_XZ = 46;
const BOX_Y = 26;

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.mode = 'clear';
    this.quality = 'high';
    this.count = 1000;
    this.wet = 0;

    const pos = new Float32Array(MAX_DROPS * 6);
    this.seeds = new Float32Array(MAX_DROPS * 3);
    for (let i = 0; i < MAX_DROPS; i++) {
      const x = (Math.random() - 0.5) * BOX_XZ * 2;
      const y = Math.random() * BOX_Y;
      const z = (Math.random() - 0.5) * BOX_XZ * 2;
      this.seeds[i * 3] = x;
      this.seeds[i * 3 + 1] = y;
      this.seeds[i * 3 + 2] = z;
      const j = i * 6;
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
      pos[j + 3] = x; pos[j + 4] = y - 1.35; pos[j + 5] = z;
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);

    const mat = new THREE.LineBasicMaterial({
      color: '#bcd4f5',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: false,
    });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
    this.fallOffset = 0;
  }

  setMode(mode = 'clear') {
    this.mode = mode === 'rain' ? 'rain' : 'clear';
    this.lines.visible = this.mode === 'rain';
  }

  setQuality(preset = 'high') {
    this.quality = preset;
    this.count = preset === 'low' ? 450 : preset === 'medium' ? 800 : preset === 'ultra' ? MAX_DROPS : 1100;
    this.lines.geometry.setDrawRange(0, this.count * 2);
  }

  update(dt, carPos, vel, city, sky, fogMul = 1) {
    timeUniform.value += dt;
    const wantWet = this.mode === 'rain' ? 1 : 0;
    if (Math.abs(this.wet - wantWet) > 0.001) {
      this.wet += (wantWet - this.wet) * Math.min(1, dt * 1.5);
      wetUniform.value = this.wet;
      const w = this.wet;
      if (city?.M) {
        if (city.M.asphalt) city.M.asphalt.metalness = w * 0.25;
        if (city.M.deckTop) city.M.deckTop.metalness = w * 0.25;
        if (city.M.paving) city.M.paving.metalness = w * 0.18;
      }
    }

    if (this.mode !== 'rain') return;

    if (sky?.fog) {
      sky.fog.near *= 0.72;
      sky.fog.far *= 0.78;
    }

    this.fallOffset = (this.fallOffset + dt * 34) % BOX_Y;
    const arr = this.posAttr.array;
    const vx = (vel?.x || 0) * 0.035;
    const vz = (vel?.z || 0) * 0.035;
    const cx = carPos.x, cy = carPos.y, cz = carPos.z;
    const n = this.count;

    for (let i = 0; i < n; i++) {
      const s = i * 3, j = i * 6;
      let dx = ((this.seeds[s] - cx) % (BOX_XZ * 2));
      if (dx < -BOX_XZ) dx += BOX_XZ * 2; else if (dx > BOX_XZ) dx -= BOX_XZ * 2;
      let dz = ((this.seeds[s + 2] - cz) % (BOX_XZ * 2));
      if (dz < -BOX_XZ) dz += BOX_XZ * 2; else if (dz > BOX_XZ) dz -= BOX_XZ * 2;
      let y = (this.seeds[s + 1] - this.fallOffset) % BOX_Y;
      if (y < 0) y += BOX_Y;

      const x = cx + dx;
      const py = cy + y - 2;
      const z = cz + dz;

      arr[j] = x;
      arr[j + 1] = py;
      arr[j + 2] = z;
      arr[j + 3] = x - vx;
      arr[j + 4] = py - 1.45;
      arr[j + 5] = z - vz;
    }
    this.posAttr.needsUpdate = true;
  }
}
