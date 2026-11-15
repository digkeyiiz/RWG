// Renders small thumbnails of 3D objects (wheel styles) with the game's own renderer + studio environment,
// so the tuning panel can show what each option really looks like in the chosen finish.
import * as THREE from 'three';

export class Thumbs {
  constructor(renderer, env, size = 144) {
    this.renderer = renderer; this.size = size;
    this.rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, type: THREE.UnsignedByteType });
    this.scene = new THREE.Scene();
    this.scene.environment = env;
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 1.25;
    const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(2, 3, 4);
    const fill = new THREE.DirectionalLight('#9fb8ff', 0.5); fill.position.set(-3, -1, 2);
    this.scene.add(key, fill);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    this.cam.position.set(0, 0, 5);
    this.cache = new Map();
    this.queue = [];
    this.timer = 0;
    this.buf = new Uint8Array(size * size * 4);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
  }

  // Returns a data-URL if ready, otherwise null (and `onReady` fires when it is).
  // make() builds the object lazily (returns { obj, radius } or null when its assets are still loading).
  get(key, make, onReady) {
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (!this.queue.some((q) => q.key === key)) this.queue.push({ key, make, onReady });
    if (!this.timer) this.timer = setTimeout(() => this.pump(), 30);
    return null;
  }
  clear() { this.cache.clear(); }

  pump() {
    this.timer = 0;
    const job = this.queue.shift();
    if (!job) return;
    try {
      const made = job.make();
      if (made) {
        const url = this.render(made.obj, made.radius);
        this.cache.set(job.key, url);
        job.onReady?.(job.key, url);
      }
    } catch (e) { console.warn('thumb failed', e); }
    if (this.queue.length) this.timer = setTimeout(() => this.pump(), 20);
  }

  render(obj, radius) {
    const r = this.renderer, size = this.size;
    const prev = { rt: r.getRenderTarget(), ca: r.getClearAlpha(), cc: r.getClearColor(new THREE.Color()), sm: r.shadowMap.enabled };
    const h = radius * 1.06;
    this.cam.left = -h; this.cam.right = h; this.cam.top = h; this.cam.bottom = -h; this.cam.updateProjectionMatrix();
    this.scene.add(obj);
    obj.rotation.set(0.0, 0.0, 0.0);
    r.shadowMap.enabled = false;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.cam);
    r.readRenderTargetPixels(this.rt, 0, 0, size, size, this.buf);
    r.setRenderTarget(prev.rt);
    r.setClearColor(prev.cc, prev.ca);
    r.shadowMap.enabled = prev.sm;
    this.scene.remove(obj);
    obj.traverse((o) => { if (o.isMesh && !o.userData.shared) o.geometry?.dispose(); });
    // linear → sRGB, flip vertically
    const g = this.canvas.getContext('2d'), img = g.createImageData(size, size), d = img.data, s = this.buf;
    for (let y = 0; y < size; y++) {
      const so = (size - 1 - y) * size * 4, dO = y * size * 4;
      for (let x = 0; x < size * 4; x += 4) {
        const a = s[so + x + 3];
        for (let c = 0; c < 3; c++) {
          const v = a ? Math.min(1, s[so + x + c] / a) : 0; // un-premultiply
          d[dO + x + c] = Math.round(255 * Math.pow(v, 1 / 2.2));
        }
        d[dO + x + 3] = a;
      }
    }
    g.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}
