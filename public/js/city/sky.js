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
    this.uniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vDir;
        void main(){ float h = max(vDir.y, 0.0); vec3 c = mix(horizon, top, pow(h, 0.55));
          if (vDir.y < 0.0) c = horizon * 0.8;
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          c += sunCol * (pow(s, 600.0) * 2.5 + pow(s, 8.0) * 0.25) * (1.0 - night * 0.6);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
    this.dome.renderOrder = -10;
    // stars
    const n = 1200, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const u = Math.random(), v = Math.random() * 0.95; const th = u * Math.PI * 2, ph = Math.acos(1 - v); pos.set([Math.sin(ph) * Math.cos(th) * 1400, Math.cos(ph) * 1400, Math.sin(ph) * Math.sin(th) * 1400], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    // distant mountain silhouettes: part of the backdrop (follow the camera, no fog, no lighting)
    const mGeo = new THREE.ConeGeometry(1, 1, 7);
    this.mountMat = new THREE.MeshBasicMaterial({ color: '#6f8294', fog: false });
    const nm = 46, mtn = new THREE.InstancedMesh(mGeo, this.mountMat, nm), m4 = new THREE.Matrix4();
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < nm; k++) {
      const a = (k / nm) * Math.PI * 2 + rnd() * 0.08, R = 1380 + rnd() * 60, h = 90 + rnd() * 230, w = 160 + rnd() * 200;
      m4.compose(new THREE.Vector3(Math.cos(a) * R, h / 2 - 20, Math.sin(a) * R), new THREE.Quaternion(), new THREE.Vector3(w, h, w));
      mtn.setMatrixAt(k, m4);
    }
    mtn.frustumCulled = false; mtn.renderOrder = -9;
    this.mountains = mtn;
    this.fog = new THREE.Fog('#c7d6e6', 200, 1000);
    this.group = new THREE.Group();
    this.group.add(this.dome, this.stars, mtn);
    this.sunDir = new THREE.Vector3(0.5, 0.8, 0.3);
    this.night = 0;
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
    this.starMat.opacity = Math.max(0, night - 0.3) * 1.2;
    sun.color.copy(sc); sun.intensity = si;
    hemi.intensity = hi;
    hemi.color.copy(top).lerp(new THREE.Color('#ffffff'), 0.5);
    hemi.groundColor.set(night > 0.5 ? '#141418' : '#3a3833');
    this.fog.color.copy(fog); this.fog.near = (night > 0.5 ? 140 : 220) * farMul; this.fog.far = (night > 0.5 ? 700 : 1100) * farMul;
    this.scene.fog = this.fog;
    this.mountMat.color.copy(hor).lerp(new THREE.Color(night > 0.5 ? '#05070d' : '#3e5163'), night > 0.5 ? 0.6 : 0.42);
    this.scene.background = hor;
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 0.06 + (1 - night) * 0.94;
    renderer.toneMappingExposure = 1.0;
    return night;
  }
}
