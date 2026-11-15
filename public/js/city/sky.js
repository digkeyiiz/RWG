// Day/night cycle: gradient sky dome with sun glow, stars, light colors, fog.
import * as THREE from 'three';

const KEYS = [ // hour, top, horizon, sun color, sun intensity, hemi intensity, fog
  [0, '#05070f', '#141a2c', '#9fb4ff', 0.14, 0.1, '#0d1220'],
  [4.5, '#0a1020', '#2a2d44', '#a9b8ff', 0.14, 0.12, '#1a1d2e'],
  [5.8, '#3a4f80', '#f2a36b', '#ffb47a', 1.2, 0.5, '#c08a76'],
  [7.5, '#5f8fd0', '#cfe0ef', '#fff1d8', 2.4, 0.85, '#c9d6e2'],
  [12, '#3f7ed6', '#c7dbef', '#ffffff', 2.8, 1.0, '#c7d6e6'],
  [16.5, '#4c80c8', '#d7d9d6', '#fff0d6', 2.5, 0.9, '#cfd3d4'],
  [18.2, '#3b3f78', '#ff8a4c', '#ff9a5a', 1.3, 0.55, '#b07a6a'],
  [19.3, '#141a3a', '#4a3550', '#9fb4ff', 0.25, 0.18, '#2a2236'],
  [21, '#070a18', '#1a1d33', '#9fb4ff', 0.14, 0.1, '#121726'],
  [24, '#05070f', '#141a2c', '#9fb4ff', 0.14, 0.1, '#0d1220'],
];

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 }, time: { value: 0 }, cover: { value: 0.5 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; uniform float time; uniform float cover; varying vec3 vDir;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int k=0;k<5;k++){ s += a*vn(p); p = p*2.03+vec2(11.3,7.7); a *= 0.5; } return s; }
        void main(){
          vec3 dir = normalize(vDir);
          float h = max(dir.y, 0.0);
          vec3 c = mix(horizon, top, pow(h, 0.52));
          // Atmospheric horizon haze & urban night skyglow
          float horBand = exp(-h * 9.0);
          c += vec3(0.12, 0.07, 0.04) * horBand * night * 0.85;
          if (dir.y < 0.0) c = horizon * 0.72;
          // Mie sun scattering & crisp solar disc
          float s = max(dot(dir, normalize(sunDir)), 0.0);
          float sunDisc = smoothstep(0.9993, 0.99985, s);
          c += sunCol * (sunDisc * 4.5 + pow(s, 36.0) * 0.45 + pow(s, 5.0) * 0.22) * (1.0 - night * 0.72);
          // Multi-layer FBM clouds with sun silver-lining
          if (dir.y > 0.015) {
            vec2 cp = dir.xz / (dir.y + 0.16) * 1.55 + vec2(time * 0.0055, time * 0.0018);
            float n1 = fbm(cp);
            float n2 = fbm(cp * 2.1 - vec2(time * 0.003, 0.0));
            float d = smoothstep(0.53 - cover * 0.24, 0.84, n1 * 0.72 + n2 * 0.28);
            float lit = 0.52 + 0.48 * smoothstep(0.32, 0.88, fbm(cp + normalize(sunDir.xz + 0.001) * 0.13));
            vec3 cloudBase = mix(horizon * 0.85, vec3(1.0), 0.72) * lit * (1.0 - night * 0.92);
            vec3 silver = sunCol * (pow(s, 7.0) * 0.65 + pow(s, 2.0) * 0.12) * (1.0 - night);
            vec3 cc = cloudBase + silver;
            float fade = smoothstep(0.015, 0.20, dir.y);
            c = mix(c, cc, d * fade * (1.0 - night * 0.52));
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 36, 20), mat);
    this.dome.renderOrder = -10;
    // stars
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const u = Math.random(), v = Math.random() * 0.95; const th = u * Math.PI * 2, ph = Math.acos(1 - v); pos.set([Math.sin(ph) * Math.cos(th) * 1400, Math.cos(ph) * 1400, Math.sin(ph) * Math.sin(th) * 1400], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);

    // Layered procedural mountain ridge silhouettes (replaces low-poly cones)
    this.mountMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#6f8294') },
        uHorizon: { value: new THREE.Color('#c7d6e6') },
      },
      vertexShader: `varying float vH; void main(){ vH = clamp((position.y + 10.0) / 190.0, 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform vec3 uHorizon; varying float vH;
        void main(){ vec3 c = mix(uHorizon, uColor, smoothstep(0.0, 0.85, vH)); gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.DoubleSide,
      fog: false,
    });
    const makeRidge = (radius, baseH, amp, freq, seedOff) => {
      const segs = 220;
      const rPos = [], rIdx = [];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const h = baseH
          + Math.sin(a * freq + seedOff) * amp * 0.5
          + Math.sin(a * freq * 2.3 + seedOff * 1.7) * amp * 0.28
          + Math.cos(a * freq * 5.1 + seedOff * 2.9) * amp * 0.14
          + Math.sin(a * freq * 11.0 + seedOff) * amp * 0.06;
        const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
        rPos.push(x, -25, z, x, Math.max(8, h), z);
        if (i < segs) {
          const b = i * 2;
          rIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
      g.setIndex(rIdx);
      const m = new THREE.Mesh(g, this.mountMat);
      m.frustumCulled = false; m.renderOrder = -9;
      return m;
    };
    this.mountains = new THREE.Group();
    this.mountains.add(
      makeRidge(1410, 95, 115, 5, 0.8),
      makeRidge(1320, 48, 65, 8, 2.4),
    );
    this.fog = new THREE.Fog('#c7d6e6', 200, 1000);
    this.group = new THREE.Group();
    this.group.add(this.dome, this.stars, this.mountains);
    this.sunDir = new THREE.Vector3(0.5, 0.8, 0.3);
    this.night = 0;
  }

  // Image-based lighting from the live sky: cars/wet roads reflect the real sky colours & clouds.
  // Re-bakes only when the hour or wetness moved enough (cheap: dome only, no city geometry).
  updateEnv(renderer, hour, wet = 0, force = false) {
    if (!force && this._envHour !== undefined && Math.abs(hour - this._envHour) < 1.0 && Math.abs(wet - this._envWet) < 0.25) return;
    if (!this._pmrem) {
      this._pmrem = new THREE.PMREMGenerator(renderer);
      this._envScene = new THREE.Scene();
      this._envScene.add(new THREE.Mesh(this.dome.geometry, this.dome.material));
    }
    this._envHour = hour; this._envWet = wet;
    this.uniforms.time.value = performance.now() / 1000;
    const rt = this._pmrem.fromScene(this._envScene, 0, 10, 3000);
    this._envRT?.dispose();
    this._envRT = rt; this.envTex = rt.texture;
    this.scene.environment = this.envTex;
  }

  // hour 0..24 → updates lights and returns night factor (0 day … 1 night)
  apply(hour, { hemi, sun, renderer }, farMul = 1) {
    let a = KEYS[0], b = KEYS[1];
    for (let k = 0; k < KEYS.length - 1; k++) if (hour >= KEYS[k][0] && hour <= KEYS[k + 1][0]) { a = KEYS[k]; b = KEYS[k + 1]; break; }
    const t = (hour - a[0]) / Math.max(0.001, b[0] - a[0]);
    const mix = (i) => new THREE.Color(a[i]).lerp(new THREE.Color(b[i]), t);
    const top = mix(1), hor = mix(2), sc = mix(3), fog = mix(6);
    const si = a[4] + (b[4] - a[4]) * t, hi = a[5] + (b[5] - a[5]) * t;
    // sun path: rises east (+x) at 6, sets west at 18; moon opposite at night
    const ang = ((hour - 6) / 12) * Math.PI;
    const day = hour > 5.5 && hour < 18.8;
    const dir = day ? new THREE.Vector3(Math.cos(ang), Math.max(0.08, Math.sin(ang)), 0.35) : new THREE.Vector3(-Math.cos(ang) * 0.5, 0.75, -0.4);
    this.sunDir.copy(dir.normalize());
    this.uniforms.top.value.copy(top); this.uniforms.horizon.value.copy(hor);
    this.uniforms.sunDir.value.copy(this.sunDir); this.uniforms.sunCol.value.copy(sc);
    const night = THREE.MathUtils.clamp(1 - (si - 0.2) / 1.4, 0, 1);
    this.night = night;
    this.uniforms.night.value = night;
    this.uniforms.time.value = performance.now() / 1000;
    this.starMat.opacity = Math.max(0, night - 0.3) * 1.2;
    sun.color.copy(sc); sun.intensity = si;
    hemi.intensity = hi;
    hemi.color.copy(top).lerp(new THREE.Color('#ffffff'), 0.5);
    hemi.groundColor.set(night > 0.5 ? '#141418' : '#3a3833');
    this.fog.color.copy(fog); this.fog.near = (night > 0.5 ? 140 : 220) * farMul; this.fog.far = (night > 0.5 ? 700 : 1100) * farMul;
    this.scene.fog = this.fog;
    this.mountMat.uniforms.uHorizon.value.copy(hor);
    this.mountMat.uniforms.uColor.value.copy(hor).lerp(new THREE.Color(night > 0.5 ? '#05070d' : '#2d3f52'), night > 0.5 ? 0.65 : 0.48);
    this.scene.background = hor;
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 0.08 + (1 - night) * 0.92;
    renderer.toneMappingExposure = 1.0;
    return night;
  }
}
