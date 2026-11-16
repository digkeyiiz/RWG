// Renderer, lighting, garage showroom and test track.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export function createWorld(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.aa !== false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  // Photo-studio lighting: big overhead softbox + long strip lights down both flanks, so metallic paint,
  // carbon and chrome get the long clean highlights that make a tuned car look expensive.
  const studioEnv = () => {
    const s = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: '#1d2028', side: THREE.BackSide }));
    room.position.y = 6;
    s.add(room);
    const box = (w, h, d, x, y, z, k, col = '#ffffff', rx = 0, ry = 0) => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k) });
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z); o.rotation.set(rx, ry, 0); s.add(o);
    };
    box(14, 0.15, 6, 0, 7.6, 0, 1.15);                // overhead softbox
    box(0.7, 5.2, 7, 11, 3.2, 0, 2.3, '#f4f8ff');      // flank strips
    box(0.7, 5.2, 7, -11, 3.2, 0, 2.3, '#fff4ea');
    box(7, 5.2, 0.7, 0, 3.2, 11, 1.7, '#ffffff');      // front / rear strips
    box(7, 5.2, 0.7, 0, 3.2, -11, 1.7, '#ffffff');
    box(2.2, 0.15, 12, 7, 5.6, 0, 0.9, '#dfe9ff');     // upper side kickers (reflect on shoulders and roof)
    box(2.2, 0.15, 12, -7, 5.6, 0, 0.9, '#ffe9d6');
    box(14, 0.1, 14, 0, -0.4, 0, 0.5, '#8a8f99');      // dim floor bounce
    return s;
  };
  const envTex = pmrem.fromScene(studioEnv(), 0.03).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 600);
  camera.position.set(5.2, 1.7, 4.4);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.6, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.2;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotateSpeed = 0.8;

  const hemi = new THREE.HemisphereLight('#dfe8ff', '#202024', 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(4, 8, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 25;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // ---------- garage ----------
  const garage = new THREE.Group();
  // Smaller disc + bigger texture → ~6x sharper reflection of the car (the old 512px / 59 m floor was a smear of pixels)
  const reflector = new Reflector(new THREE.CircleGeometry(12, 64), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x181a20,
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.y = -0.003;
  garage.add(reflector);
  const floorMat = new THREE.MeshStandardMaterial({ color: '#1a1b1f', roughness: 0.32, metalness: 0.2, transparent: true, opacity: 0.78 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  garage.add(floor);
  const ringMat = new THREE.MeshStandardMaterial({ color: '#2a2c33', roughness: 0.25, metalness: 0.6, transparent: true, opacity: 0.82 });
  const turntable = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.45, 0.04, 96), ringMat);
  turntable.position.y = -0.019;
  turntable.receiveShadow = true;
  garage.add(turntable);
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(3.42, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: '#4cc3ff' }));
  glowRing.rotation.x = Math.PI / 2; glowRing.position.y = 0.003;
  garage.add(glowRing);
  // ceiling light panels
  for (let i = -1; i <= 1; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.35), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    p.rotation.x = Math.PI / 2; p.position.set(0, 6, i * 1.4);
    garage.add(p);
  }
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 14, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#0d0e12', roughness: 0.9, side: THREE.BackSide }));
  wall.position.y = 7;
  garage.add(wall);
  const spot1 = new THREE.SpotLight('#ffffff', 60, 20, 0.6, 0.6, 1.5);
  spot1.position.set(-4, 5, -3); spot1.target.position.set(0, 0.5, 0);
  garage.add(spot1, spot1.target);
  const spot2 = new THREE.SpotLight('#7dd3fc', 38, 18, 0.65, 0.7, 1.4);
  spot2.position.set(4.5, 3.8, 3.8); spot2.target.position.set(0, 0.4, 0);
  garage.add(spot2, spot2.target);
  scene.add(garage);

  // ---------- test track ----------
  const track = new THREE.Group();
  track.visible = false;
  const asphalt = makeAsphalt();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  track.add(ground);
  const grass = new THREE.Mesh(new THREE.RingGeometry(150, 400, 64), new THREE.MeshStandardMaterial({ color: '#3d5a2b', roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = 0.01;
  track.add(grass);
  // painted oval loop
  const loop = new THREE.Mesh(new THREE.RingGeometry(58, 58.25, 160), new THREE.MeshBasicMaterial({ color: '#f2f2f2' }));
  loop.rotation.x = -Math.PI / 2; loop.position.y = 0.012; loop.scale.set(1.6, 1, 1);
  track.add(loop);
  const loop2 = loop.clone(); loop2.scale.set(1.6 * 0.82, 0.82, 1); track.add(loop2);
  // parking bays
  for (let i = 0; i < 12; i++) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 5), new THREE.MeshBasicMaterial({ color: '#e8e8e8' }));
    l.rotation.x = -Math.PI / 2; l.position.set(-15 + i * 2.8, 0.013, -18);
    track.add(l);
  }
  // cones (slalom)
  const cones = [];
  const coneMat = new THREE.MeshStandardMaterial({ color: '#ff6a00', roughness: 0.6 });
  const coneGeo = new THREE.ConeGeometry(0.17, 0.5, 16);
  coneGeo.translate(0, 0.25, 0);
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Mesh(coneGeo, coneMat);
    c.position.set(15 + i * 7, 0, (i % 2 ? 1 : -1) * 0.4 + 6);
    c.castShadow = true;
    c.userData = { vel: new THREE.Vector3(), home: c.position.clone() };
    track.add(c); cones.push(c);
  }
  // simple buildings around for speed reference
  const bMat = new THREE.MeshStandardMaterial({ color: '#8b93a1', roughness: 0.8 });
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const h = 6 + ((i * 37) % 18);
    const b = new THREE.Mesh(new THREE.BoxGeometry(10, h, 10), bMat);
    b.position.set(Math.cos(a) * 170, h / 2, Math.sin(a) * 170);
    b.castShadow = false;
    track.add(b);
  }
  scene.add(track);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // portrait phones: wider lens and push the car above the bottom-sheet panel
    camera.fov = camera.aspect < 0.8 ? 64 : camera.aspect < 1.2 ? 50 : 38;
    if (camera.aspect < 1.2) camera.setViewOffset(w, h, 0, h * 0.17, w, h);
    else if (inset > 0) camera.setViewOffset(w, h, -inset / 2, 0, w, h); // keep the car centred in the free area beside the tuning panel
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  let inset = 0;
  const setViewInset = (px) => { inset = Math.max(0, px | 0); resize(); };
  window.addEventListener('resize', resize);
  resize();

  function setMode(mode) {
    const drive = mode === 'drive', city = mode === 'city';
    garage.visible = mode === 'garage';
    track.visible = drive;
    if (!city) {
      scene.background = new THREE.Color(drive ? '#a9c6e6' : '#0a0b0e');
      scene.fog = drive ? new THREE.Fog('#a9c6e6', 60, 260) : new THREE.Fog('#0a0b0e', 14, 32);
      hemi.intensity = drive ? 1.0 : 0.6;
      hemi.color.set('#dfe8ff'); hemi.groundColor.set('#202024');
      sun.color.set('#ffffff');
      sun.intensity = drive ? 2.8 : 2.2;
      renderer.toneMappingExposure = 1.0;
      if ('environmentIntensity' in scene) scene.environmentIntensity = 1;
      scene.environment = envTex;
    }
    const sc = sun.shadow.camera, ext = city ? 70 : 5;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.far = city ? 300 : 25; sc.updateProjectionMatrix();
    camera.far = city ? 3200 : 600; camera.updateProjectionMatrix();
    controls.maxDistance = drive || city ? 25 : 16;
  }
  setMode('garage');

  return { renderer, scene, camera, controls, sun, hemi, garage, track, cones, reflector, setMode, resize, setViewInset, envTex };
}

function makeAsphalt() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4c50';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 50 + Math.random() * 60;
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(120, 120);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
