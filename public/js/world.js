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

  // ---------- drag strip ----------
  // Straight 1/4-mile+ strip down the +X axis: staging at x<0, start line at x=0,
  // movable checkered finish line, distance boards every 100 m. The old test pad
  // (cones / oval / parking) is kept off to the side at z=180.
  const track = new THREE.Group();
  track.visible = false;
  const asphalt = makeAsphalt();
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(4200, 2200), new THREE.MeshStandardMaterial({ color: '#3d5a2b', roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.set(700, -0.02, 0);
  track.add(grass);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 700), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.x = 700;
  ground.receiveShadow = true;
  track.add(ground);
  // the strip itself: darker, grippier-looking tarmac
  const STRIP_X0 = -120, STRIP_X1 = 1500, STRIP_W = 30;
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(STRIP_X1 - STRIP_X0, STRIP_W), new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.82, metalness: 0 }));
  strip.rotation.x = -Math.PI / 2; strip.position.set((STRIP_X0 + STRIP_X1) / 2, 0.006, 0);
  strip.receiveShadow = true;
  track.add(strip);
  const lineMat = new THREE.MeshBasicMaterial({ color: '#f2f2f2' });
  const stripe = (w, d, x, z, col = '#f2f2f2') => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), col === '#f2f2f2' ? lineMat : new THREE.MeshBasicMaterial({ color: col }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z);
    track.add(m); return m;
  };
  // edge lines + centre dashes
  stripe(STRIP_X1 - STRIP_X0, 0.3, (STRIP_X0 + STRIP_X1) / 2, -STRIP_W / 2 + 0.8);
  stripe(STRIP_X1 - STRIP_X0, 0.3, (STRIP_X0 + STRIP_X1) / 2, STRIP_W / 2 - 0.8);
  for (let x = STRIP_X0 + 10; x < STRIP_X1; x += 12) stripe(5, 0.28, x, 0);
  // lane divider dashes (two lanes)
  for (let x = 40; x < STRIP_X1; x += 16) { stripe(4, 0.2, x, -7.4); stripe(4, 0.2, x, 7.4); }
  // burnout box + start line
  stripe(34, STRIP_W - 2, -19, 0, '#2e3136');
  stripe(1.2, STRIP_W - 1, 0, 0);
  // movable finish line: checkered band + gantry poles
  const finish = new THREE.Group();
  const finBoard = new THREE.Mesh(new THREE.PlaneGeometry(2.4, STRIP_W - 1), new THREE.MeshBasicMaterial({ map: makeChecker() }));
  finBoard.rotation.x = -Math.PI / 2; finBoard.position.y = 0.014;
  finish.add(finBoard);
  const poleMat = new THREE.MeshStandardMaterial({ color: '#c8cdd6', roughness: 0.5, metalness: 0.6 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.5, 10), poleMat);
    p.position.set(0, 3.25, s * (STRIP_W / 2 + 1));
    finish.add(p);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: 0x37e05a }));
    lamp.position.set(0, 6.2, s * (STRIP_W / 2 + 1));
    finish.add(lamp);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, STRIP_W + 2), poleMat);
  beam.position.y = 6.4; finish.add(beam);
  track.add(finish);
  const setFinish = (d) => { finish.position.x = d; };
  setFinish(402);
  // distance boards every 100 m on both shoulders
  for (let d = 100; d <= 1400; d += 100) {
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2), new THREE.MeshBasicMaterial({ map: makeBoard(`${d}m`), side: THREE.DoubleSide }));
      b.position.set(d, 1.15, s * (STRIP_W / 2 + 3));
      b.rotation.y = s > 0 ? Math.PI : 0;
      track.add(b);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), poleMat);
      leg.position.set(d, 0.55, s * (STRIP_W / 2 + 3));
      track.add(leg);
    }
  }
  // christmas tree at the start line
  const tree = new THREE.Group();
  const tpole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), poleMat);
  tpole.position.y = 1.3; tree.add(tpole);
  const tbox = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.15, 0.22), new THREE.MeshStandardMaterial({ color: '#15161a', roughness: 0.6 }));
  tbox.position.y = 2.9; tree.add(tbox);
  [[3.35, 0xffb020], [3.05, 0xffb020], [2.75, 0x37e05a], [2.5, 0xe03a3a]].forEach(([y, c]) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: c }));
    l.position.set(0, y, 0.13); tree.add(l);
  });
  tree.position.set(-2.5, 0, -STRIP_W / 2 - 1.5);
  track.add(tree);
  // concrete barriers along both sides
  const wallMat = new THREE.MeshStandardMaterial({ color: '#9aa0a8', roughness: 0.95 });
  const wallGeo = new THREE.BoxGeometry(190, 0.9, 0.4);
  for (let x = STRIP_X0; x < STRIP_X1; x += 195) {
    for (const s of [-1, 1]) {
      const wm = new THREE.Mesh(wallGeo, wallMat);
      wm.position.set(x + 95, 0.45, s * (STRIP_W / 2 + 1.6));
      track.add(wm);
    }
  }
  // floodlight poles down the strip (speed reference)
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff3c4' });
  for (let x = -60; x < STRIP_X1; x += 90) {
    const s = (x / 90) % 2 ? -1 : 1;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 11, 8), poleMat);
    p.position.set(x, 5.5, s * (STRIP_W / 2 + 6));
    track.add(p);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.5), lampMat);
    head.position.set(x, 11, s * (STRIP_W / 2 + 5.2));
    track.add(head);
  }
  // grandstand near the start
  const stand = new THREE.Mesh(new THREE.BoxGeometry(46, 7, 8), new THREE.MeshStandardMaterial({ color: '#4a4f5a', roughness: 0.85 }));
  stand.position.set(55, 3.5, -STRIP_W / 2 - 14);
  track.add(stand);
  const standRoof = new THREE.Mesh(new THREE.BoxGeometry(48, 0.3, 10), new THREE.MeshStandardMaterial({ color: '#7d2634', roughness: 0.7 }));
  standRoof.position.set(55, 7.4, -STRIP_W / 2 - 14);
  track.add(standRoof);
  // painted oval loop + parking bays on the side pad
  const loop = new THREE.Mesh(new THREE.RingGeometry(58, 58.25, 160), lineMat);
  loop.rotation.x = -Math.PI / 2; loop.position.set(0, 0.012, 180); loop.scale.set(1.6, 1, 1);
  track.add(loop);
  const loop2 = loop.clone(); loop2.scale.set(1.6 * 0.82, 0.82, 1); track.add(loop2);
  for (let i = 0; i < 12; i++) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 5), lineMat);
    l.rotation.x = -Math.PI / 2; l.position.set(-15 + i * 2.8, 0.013, 140);
    track.add(l);
  }
  // cones (slalom) on the pad
  const cones = [];
  const coneMat = new THREE.MeshStandardMaterial({ color: '#ff6a00', roughness: 0.6 });
  const coneGeo = new THREE.ConeGeometry(0.17, 0.5, 16);
  coneGeo.translate(0, 0.25, 0);
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Mesh(coneGeo, coneMat);
    c.position.set(15 + i * 7, 0, 180 + (i % 2 ? 1 : -1) * 0.4 + 6);
    c.castShadow = true;
    c.userData = { vel: new THREE.Vector3(), home: c.position.clone() };
    track.add(c); cones.push(c);
  }
  // simple buildings around for speed reference
  const bMat = new THREE.MeshStandardMaterial({ color: '#8b93a1', roughness: 0.8 });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const h = 6 + ((i * 37) % 18);
    const r = 240 + (i % 5) * 90;
    const b = new THREE.Mesh(new THREE.BoxGeometry(10, h, 10), bMat);
    b.position.set(700 + Math.cos(a) * r, h / 2, Math.sin(a) * r * 0.6);
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
      scene.fog = drive ? new THREE.Fog('#a9c6e6', 220, 1700) : new THREE.Fog('#0a0b0e', 14, 32);
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
    camera.far = city ? 3200 : drive ? 3000 : 600; camera.updateProjectionMatrix();
    controls.maxDistance = drive || city ? 25 : 16;
  }
  setMode('garage');

  return { renderer, scene, camera, controls, sun, hemi, garage, track, cones, reflector, setMode, resize, setViewInset, envTex, setFinish };
}

function makeChecker() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const s = 32;
  for (let y = 0; y < 256 / s; y++) for (let x = 0; x < 64 / s; x++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5';
    g.fillRect(x * s, y * s, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBoard(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 144;
  const g = c.getContext('2d');
  g.fillStyle = '#101216'; g.fillRect(0, 0, 256, 144);
  g.strokeStyle = '#f5a623'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 136);
  g.fillStyle = '#f5f5f5';
  g.font = '700 74px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 76);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
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
