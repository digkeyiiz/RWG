import * as THREE from 'three';
import { createWorld } from './world.js';
import { Car } from './car.js';
import { Panel, mergeBuild } from './ui.js';
import { Driver } from './drive.js';
import { DEFAULT_BUILD, GENERATIONS } from './catalog.js';
import { loadTemplate } from './glbcar.js';
import { Online } from './net.js';
import { setupOnlineUI } from './onlineui.js';
import { Garage } from './garage.js';
import { computePerf } from './engine.js';
import { GfxSettings, settingsPanel, FrameGovernor, SHADOW_SIZE, VIEW, TRAFFIC } from './settings.js';
import { Race } from './race.js';
import { GameWorld } from './game.js';
import { Police } from './police.js';
import { Social } from './social.js';
import * as ECON from './economy.js';
import { GARAGES } from './places.js';

// a stock build of a car, with that car's factory tyre size
function freshBuild(genId) {
  const g = GENERATIONS.find((x) => x.id === genId && x.glb) || GENERATIONS.find((x) => x.id === DEFAULT_BUILD.gen);
  const b = mergeBuild({ ...JSON.parse(JSON.stringify(DEFAULT_BUILD)), gen: g.id, name: g.name });
  b.wheels.rim = g.tire.rim; b.wheels.tireWidth = g.tire.width; b.wheels.aspect = g.tire.aspect;
  b.wheels.rimWidth = g.tire.rim >= 16 ? 6 : 5.5; b.wheels.offset = g.tire.rim >= 16 ? 39 : 45;
  return b;
}
const garage = new Garage(mergeBuild, freshBuild);
let build = garage.current();

const toastEl = document.getElementById('toast');
let toastT;
const toast = (msg) => { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2200); };

const gfx = new GfxSettings();
const world = createWorld(document.getElementById('view'), { aa: gfx.get('aa') });
const { scene, camera, controls, renderer, sun } = world;
const car = new Car();
car.onNotice = (msg) => { toast(msg); window.__panelRef?.updateFit(); };
scene.add(car.root);

// Fonts must be ready before drawing Thai text on the license plate canvas.
await document.fonts.load('600 40px Kanit', 'กข').catch(() => {});
const startGen = GENERATIONS.find((g) => g.id === build.gen);
if (startGen?.glb) {
  document.getElementById('loading').textContent = 'กำลังโหลดโมเดล 3D…';
  await loadTemplate(startGen.glb, startGen.glbConfig || {}).catch(() => {});
}
car.setBuild(build);
document.getElementById('loading').classList.add('hide');

let online = null; // created once the driver exists (below)
let driver = null;
// every change is saved automatically into the garage (per car)
const persist = () => { garage.put(build); driver?.setPerf(computePerf(build)); };

const creditEl = document.getElementById('credit');
function updateCredit() {
  const g = car.gen;
  const cr = g.credit || (build.wheels.style === 'model' ? GENERATIONS.find((x) => x.id === 'gen2').credit : null);
  creditEl.hidden = !cr;
  if (cr) { creditEl.textContent = 'โมเดล 3D: ' + cr.text; creditEl.href = cr.url; }
}
updateCredit();
let lastGoodEngine = JSON.parse(JSON.stringify(build.engine || null));
const panel = new Panel(() => build, (section) => {
  // never drive with parts that aren't owned (server is the authority; this keeps the local car honest)
  if ((section === 'engine' || section === 'all') && online?.me && panel.missing(build).length) {
    build.engine = JSON.parse(JSON.stringify(lastGoodEngine)); toast('ต้องซื้อชิ้นส่วนนี้ก่อน'); panel.refresh();
  }
  lastGoodEngine = JSON.parse(JSON.stringify(build.engine || null));
  if (section !== 'meta' && section !== 'engine') car.update(build, section);
  if (section === 'gen' || section === 'wheels' || section === 'all') updateCredit();
  panel.updateFit();
  persist();
  online?.sendBuild();
}, car, toast);
panel.onReplace = (nb) => { build = nb; car.setBuild(build); updateCredit(); persist(); online?.sendBuild(); };
// switching cars: park the current one in the garage, take the other one out exactly as it was left
panel.onSwitchCar = async (genId) => {
  if (genId === build.gen) return;
  if (!(await panel.purchase(ECON.carKey(genId), GENERATIONS.find((g) => g.id === genId)?.name || genId))) return;
  garage.put(build);
  const nb = garage.get(genId);
  const g = GENERATIONS.find((x) => x.id === nb.gen);
  if (g?.glb) { toast('กำลังโหลด ' + g.name + '…'); await loadTemplate(g.glb, g.glbConfig || {}).catch(() => {}); }
  // parts this car had before the economy but that aren't owned go back to stock
  if (online?.me) stripUnowned(nb);
  build = nb; lastGoodEngine = JSON.parse(JSON.stringify(build.engine)); car.setBuild(build); updateCredit(); persist(); online?.sendBuild(); panel.refresh();
  toast(garage.has(genId) ? `🚗 ${g.name} — ชุดแต่งเดิมของคันนี้` : `🚗 ${g.name}`);
};
panel.garage = garage;
panel.refresh();
function stripUnowned(b) {
  for (const k of panel.missing(b)) {
    const m = /\|part:(\w+):/.exec(k);
    if (m) b.engine.parts[m[1]] = 'stock'; else if (k.includes('|eng:')) b.engine.swap = null;
  }
}
const saveBadge = document.getElementById('saveBadge');
garage.onSaved((ok, at) => {
  if (!saveBadge) return;
  saveBadge.textContent = ok ? `✓ บันทึกอัตโนมัติ ${new Date(at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : '⚠ บันทึกไม่ได้ (พื้นที่เต็ม)';
  saveBadge.classList.toggle('bad', !ok);
  saveBadge.classList.remove('pulse'); void saveBadge.offsetWidth; saveBadge.classList.add('pulse');
});
garage.put(build);

panel.show('gen');
window.__panelRef = panel;

// ---------- camera presets ----------
let camAnim = null;
function flyTo(pos, target) {
  camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, t: 0 };
}
const far = () => (camera.aspect < 0.8 ? 1.45 : 1);
const presets = {
  front34: () => [new THREE.Vector3(4.6, 1.35, 3.4).multiplyScalar(far()), new THREE.Vector3(0, 0.6, 0)],
  side: () => [new THREE.Vector3(0.2, 1.0, 6.4).multiplyScalar(far()), new THREE.Vector3(0, 0.65, 0)],
  rear34: () => [new THREE.Vector3(-4.6, 1.55, 3.3).multiplyScalar(far()), new THREE.Vector3(0, 0.65, 0)],
  top: () => [new THREE.Vector3(0.01, 8.5, 0.6).multiplyScalar(far()), new THREE.Vector3(0, 0, 0)],
  wheel: () => [new THREE.Vector3(car.P.fAx + 1.0, 0.5, 2.1), new THREE.Vector3(car.P.fAx, 0.32, 0.75)],
};
{ const [p0, t0] = presets.front34(); camera.position.copy(p0); controls.target.copy(t0); }
document.querySelectorAll('#camSeg button').forEach((b) => b.addEventListener('click', () => {
  if (mode !== 'garage') return;
  controls.autoRotate = false; btnRotate.classList.remove('on');
  const [p, t] = presets[b.dataset.cam]();
  flyTo(p, t);
}));
const btnRotate = document.getElementById('btnRotate');
btnRotate.onclick = () => { controls.autoRotate = !controls.autoRotate; btnRotate.classList.toggle('on', controls.autoRotate); };

document.getElementById('btnShot').onclick = () => {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `vios-${Date.now()}.png`;
  a.click();
};
document.getElementById('btnFull').onclick = () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.();
};

// ---------- modes ----------
driver = new Driver(car, world);
driver.setPerf(computePerf(build));
online = new Online({ scene, driver, getBuild: () => build, toast });
const race = new Race({
  scene, driver, online, toast, gfx, getBuild: () => build,
  hooks: {
    enterCity: async () => { if (mode !== 'city') await setMode('city'); },
    spawn: (sp) => spawnRaw(sp),
    setTraffic: (v) => { raceTraffic = v; syncTraffic(); if (v !== null) police?.cancel(); },
    reward: (res) => { game.updateWallet(res.prize); if (res.prize) { game.popGain('+฿' + res.prize.toLocaleString(), true); game.sound('big'); } game.feed(`🏆 ได้รางวัล <b>฿${res.prize.toLocaleString()}</b> · +${res.rep} REP`, 'gold'); },
  },
});
race.econ = ECON;
online.claim = () => [...new Set(garage.list().flatMap((b) => ECON.buildKeys(b)))].filter((k) => ECON.priceOf(k));
// game layer (cash, garages, invites, map, profile)
let inGarage = null;
const game = new GameWorld({
  scene, driver, online, race, toast,
  hooks: {
    enterGarage: (m) => enterGarage(m),
    minimap: () => C?.minimap,
    chased: () => !!police?.active,
    hide: () => (police ? police.tryHide() : true),
  },
});
let police = null;
panel.shop = {
  owns: (k) => online.owns(k),
  money: () => online.me?.money ?? 0,
  buy: async (k) => { const r = await online.buy(k); if (r.ok) { game.updateWallet(-1); game.sound('buy'); } return r; },
};
online.on((ev) => { if (ev === 'me' && inGarage) panel.refresh(); });
driver.onPad = (n) => {
  if (n === 'act') game.act();
  if (n === 'reset') document.getElementById('btnResetCar').click();
  if (n === 'map') game.toggleMap();
  if (n === 'cam') document.getElementById('btnChase').click();
};
const applyControls = () => {
  driver.setControls({ steer: gfx.get('steer'), trans: gfx.get('trans'), assist: gfx.get('assist') });
  document.getElementById('gearMode').textContent = gfx.get('trans') === 'manual' ? 'MANUAL' : 'AUTO';
};
applyControls();
gfx.onChange(() => applyControls());
let mode = 'garage';
let chase = true;
const hud = document.getElementById('hud');
const touchEl = document.getElementById('touch');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const cityHud = document.getElementById('cityHud');
document.getElementById('btnCityMenu').onclick = () => cityHud.classList.toggle('open');
let C = null; // city context (lazy)
let cityMap = 'bkk'; // 'bkk' | 'th' | 'jp'
const realMaps = {};
let ThaiMapCls = null, drawThaiMinimapFn = null, realTraffic = null;
const REAL_CFG = {
  th: {
    country: 'th-roads.json', local: 'bkk-local.json', origin: { lat: 13.758, lon: 100.565 },
    spots: [
      ['พระราม 9 (แยกพระราม 9)', 13.7580, 100.5650],
      ['อโศก - สุขุมวิท', 13.7367, 100.5604],
      ['ทางด่วนศรีรัช - ดินแดง', 13.7634, 100.5494],
      ['เชียงใหม่ (ซุปเปอร์ไฮเวย์)', 18.8035, 98.9850],
      ['พัทยา (มอเตอร์เวย์ 7)', 12.9357, 100.9030],
      ['ภูเก็ต (เทพกระษัตรี)', 7.9120, 98.3920],
    ],
  },
  jp: {
    country: 'jp-roads.json', local: 'tokyo-local.json', origin: { lat: 35.6762, lon: 139.7503 },
    spots: [
      ['โตเกียว C1 / กินซ่า', 35.6762, 139.7503],
      ['ชิบูย่า (Shibuya)', 35.6595, 139.7004],
      ['โตเกียวทาวเวอร์ / ชิบะ', 35.6586, 139.7454],
      ['โอซาก้า (Osaka)', 34.6937, 135.5023],
      ['โยโกฮามา (Yokohama)', 35.4437, 139.6380],
      ['นาโกย่า (Nagoya)', 35.1815, 136.9066],
    ],
  },
};
const activeRealMap = () => (cityMap === 'bkk' ? null : realMaps[cityMap] || null);
const projectReal = (cfg, lat, lon) => [
  (lon - cfg.origin.lon) * 111320 * Math.cos(cfg.origin.lat * Math.PI / 180),
  -(lat - cfg.origin.lat) * 110574,
];
const isMobile = isTouch || Math.min(innerWidth, innerHeight) < 600;
let hour = 18.5, timeAuto = true, trafficOn = true;
let raceTraffic = null; // race override: true/false, null = player's choice

// ---------- graphics settings ----------
const gov = new FrameGovernor(renderer, gfx, document.getElementById('fps'));
const applyPR = () => { gov.apply(); C?.composer.setPixelRatio(renderer.getPixelRatio()); };
gov.onApply = () => C?.composer.setPixelRatio(renderer.getPixelRatio());
function applyShadows() {
  const sz = SHADOW_SIZE[gfx.get('shadows')];
  sun.userData.shadowOn = sz > 0;
  if (sz && sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  if (!sz) sun.castShadow = false;
}
function applyView() {
  if (mode === 'city') { camera.far = VIEW[gfx.get('view')].far; camera.updateProjectionMatrix(); }
}
function applyGfx(changed) {
  if (!changed || changed.some((k) => ['scale', 'prCap', 'dyn'].includes(k))) applyPR();
  if (!changed || changed.includes('shadows')) applyShadows();
  if (!changed || changed.includes('view')) applyView();
  if (!changed || changed.includes('bloom')) document.getElementById('btnBloom').classList.toggle('on', gfx.get('bloom'));
  if (!changed || changed.includes('preset')) world.reflector.visible = gfx.get('preset') !== 'low';
  if (!changed || changed.includes('weather')) C?.weather?.setMode(gfx.get('weather'));
  if (!changed || changed.includes('preset')) C?.weather?.setQuality(gfx.get('preset'));
  if (changed && C && changed.some((k) => ['traffic', 'bots', 'shadows'].includes(k))) rebuildTraffic();
  if (changed?.includes('bots') && C && gfx.get('bots') === 'real') loadBots();
  if (changed?.includes('trees') && C) toast('จำนวนต้นไม้มีผลเมื่อรีโหลดหน้า');
}
gfx.onChange((ch) => applyGfx(ch));
applyGfx();
const gfxUI = settingsPanel(gfx, (m) => toast(m));
document.getElementById('btnGfx').onclick = () => gfxUI.open();
document.getElementById('smGfx').onclick = () => gfxUI.open();

async function ensureCity() {
  if (C) return C;
  const ld = document.getElementById('loading');
  ld.textContent = 'กำลังสร้างเมือง…'; ld.classList.remove('hide');
  await new Promise((r) => setTimeout(r, 30));
  await document.fonts.load('700 40px Kanit', 'ทางด่วนดินแดงพระราม9หยุด').catch(() => {});
  let Touge, BOTS, Weather, makeGradePass;
  const [{ City }, { Traffic }, { Sky }, { Minimap }, , , , , { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
    import('./city/city.js'), import('./city/traffic.js'), import('./city/sky.js'), import('./city/minimap.js'),
    import('./city/touge.js').then((m) => { Touge = m.Touge; }), import('./city/botcars.js').then((m) => { BOTS = m; }),
    import('./city/weather.js').then((m) => { Weather = m.Weather; }), import('./city/grade.js').then((m) => { makeGradePass = m.makeGradePass; }),
    import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js'),
  ]);
  const t0 = performance.now();
  const city = new City();
  const touge = new Touge(city, { trees: gfx.get('trees') });
  city.touge = touge;
  city.group.add(touge.group);
  // static world: no per-frame matrix updates
  for (const o of city.group.children) if (o !== city.train?.group) { o.updateMatrix(); o.matrixAutoUpdate = false; }
  for (const o of touge.group.children) { o.updateMatrix(); o.matrixAutoUpdate = false; }
  const sky = new Sky(scene);
  scene.add(city.group, sky.group);
  const minimap = new Minimap(document.getElementById('minimap'), city);
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.45, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = makeGradePass();
  composer.addPass(grade);
  const weather = new Weather(scene);
  weather.setMode(gfx.get('weather'));
  weather.setQuality(gfx.get('preset'));
  console.log('city built in', Math.round(performance.now() - t0), 'ms');
  C = { city, touge, traffic: null, Traffic, BOTS, sky, weather, minimap, composer, bloom, grade };
  rebuildTraffic();
  race.setWorld(city, touge);
  game.buildMarkers(race.tracks, touge);
  police = new Police({
    scene, city, touge, driver, online, toast,
    hooks: {
      racing: () => race.active,
      sound: () => driver.soundOn,
      notify: (html, cls = '', delta = 0) => { game.feed(html, cls); if (delta) { game.updateWallet(delta); if (delta > 0) { game.popGain('+฿' + delta.toLocaleString(), true); game.sound('big'); } } },
      impound: () => { if (race.active) race.abort(); spawnAt(garageSpawn(GARAGES[0])); },
    },
  });
  police.setPatrols(gfx.get('preset') === 'low' ? 3 : 5);
  ld.classList.add('hide');
  if (gfx.get('bots') === 'real') setTimeout(loadBots, 1500);
  return C;
}

// traffic depends on settings (count, real models, shadows) → rebuilt when they change
function rebuildTraffic() {
  if (!C) return;
  if (C.traffic) { scene.remove(C.traffic.group); C.traffic = null; }
  const [n, ring] = TRAFFIC[gfx.get('traffic')];
  if (n + ring > 0) {
    C.traffic = new C.Traffic(C.city, n, ring, 7, { real: gfx.get('bots') === 'real', nearN: gfx.get('preset') === 'low' ? 0 : isMobile ? 5 : 9, shadows: gfx.get('shadows') !== 'off' });
    scene.add(C.traffic.group);
  }
  syncTraffic();
}
const trafficActive = () => cityMap === 'bkk' && !!C?.traffic && (raceTraffic ?? trafficOn);
function syncTraffic() {
  if (!C) return;
  const rm = activeRealMap();
  const isBkk = cityMap === 'bkk' && !rm;
  if (C.traffic) C.traffic.group.visible = mode === 'city' && trafficActive();
  C.city.group.visible = mode === 'city' && isBkk;
  game.group.visible = mode === 'city' && isBkk;
  if (police) police.group.visible = mode === 'city' && isBkk;
  for (const [k, m] of Object.entries(realMaps)) m.group.visible = mode === 'city' && cityMap === k;
  if (realTraffic) realTraffic.setVisible(mode === 'city' && !!rm && trafficOn);
  if (mode === 'city') {
    if (rm) driver.setEnv({ colliders: rm.colliders, surfaces: rm.surfaces, traffic: trafficOn ? realTraffic : null, peers: online, bots: null, cops: null, surfaceMu });
    else driver.setEnv({ colliders: C.city.colliders, surfaces: C.city.surfaces, traffic: trafficActive() ? C.traffic : null, peers: online, bots: race, cops: police, surfaceMu });
  }
}
// grip of the surface under the car: asphalt 1, grass/dirt off the road 0.55-0.65
function surfaceMu(x, z) {
  const rm = activeRealMap();
  if (rm) return rm.roadAt(x, z) ? 1 : 0.65;
  if (x < -560 && C?.touge && C.touge.roadHeight(x, z) === null) return 0.55;
  return 1;
}
function loadBots() {
  if (!C) return;
  // phones: fewer distinct models (less to download and keep in memory)
  C.BOTS.loadBotModels(99, build.gen).catch(() => {});
}

function spawnRaw(sp) {
  driver.reset(sp);
  driver.step(0.001);
  const back = new THREE.Vector3(-7, 2.6, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), driver.heading).add(car.root.position);
  camera.position.copy(back); controls.target.copy(car.root.position).y += 0.8;
}
// a garage's exit point: on its road, heading along the road
function garageSpawn(g) {
  const m = game.markers.find((x) => x.kind === 'garage' && x.id === g.id) || g;
  let heading = 0;
  if (g.onTouge && C?.touge) { const nb = C.touge.nearest(m.x, m.z, 30); if (nb) { const p = C.touge.path[nb.i]; heading = Math.atan2(-p.tz, p.tx); } }
  else if (g.id === 'touge' || g.id === 'harbor') heading = Math.PI;
  else if (g.id === 'station' || g.id === 'underpass') heading = Math.PI / 2;
  return { x: m.x, y: m.y, z: m.z, heading };
}
function spawnAt(sp) {
  // online: line players up behind each other so friends don't spawn inside one another
  const k = online?.inRoom ? online.peers.size % 6 : 0;
  if (k) sp = { ...sp, x: sp.x - Math.cos(sp.heading || 0) * 7 * k, z: sp.z + Math.sin(sp.heading || 0) * 7 * k };
  driver.reset(sp);
  driver.step(0.001);
  const back = new THREE.Vector3(-7, 2.6, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), driver.heading).add(car.root.position);
  camera.position.copy(back); controls.target.copy(car.root.position).y += 0.8;
}

async function setMode(m, spawn = null) {
  if (m === 'city') await ensureCity();
  mode = m;
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  world.setMode(m);
  const driving = m === 'drive' || m === 'city';
  document.body.classList.toggle('driving', driving);
  document.body.classList.toggle('city', m === 'city');
  hud.hidden = !driving;
  touchEl.hidden = !driving || !isTouch;
  cityHud.hidden = m !== 'city';
  if (m !== 'city' && race.active) race.abort('ออกจากการแข่งขัน');
  if (C) { C.sky.group.visible = m === 'city'; C.weather.lines.visible = m === 'city' && gfx.get('weather') === 'rain'; }
  syncTraffic();
  applyView();
  if (m !== 'city') car.setAutoLights(false);
  if (driving) {
    controls.autoRotate = false; btnRotate.classList.remove('on');
    if (m === 'city') syncTraffic(); else driver.setEnv(null);
    if (m === 'city') {
      const rm = activeRealMap();
      if (spawn) spawnAt(spawn);
      else if (rm) jumpRealSpot(0);
      else spawnAt(garageSpawn(GARAGES[0]));
    }
    else { driver.reset(); driver.resetCones(); camera.position.set(-7, 2.4, 0); controls.target.set(0, 0.8, 0); }
  } else {
    driver.setEnv(null);
    car.root.position.set(0, 0, 0); car.root.rotation.set(0, 0, 0);
    car._heave = 0;
    car.animate(0, 0, 0, 0);
    sun.position.set(4, 8, 3); sun.target.position.set(0, 0, 0);
    const [p, t] = presets.front34(); camera.position.copy(p); controls.target.copy(t);
  }
}
document.getElementById('timeSlider').oninput = (e) => { hour = +e.target.value; };
document.getElementById('btnTimeAuto').onclick = (e) => { timeAuto = !timeAuto; e.currentTarget.classList.toggle('on', timeAuto); };
document.getElementById('btnBloom').onclick = () => gfx.set('bloom', !gfx.get('bloom'));
document.getElementById('btnTraffic').onclick = (e) => {
  trafficOn = !trafficOn; e.currentTarget.classList.toggle('on', trafficOn);
  syncTraffic();
};
addEventListener('resize', () => { if (C) { C.composer.setSize(innerWidth, innerHeight); } });
const realJumpEl = document.getElementById('realJump');
function jumpRealSpot(idx = 0) {
  const rm = activeRealMap(), cfg = REAL_CFG[cityMap];
  if (!rm || !cfg) return;
  const sp = cfg.spots[idx] || cfg.spots[0];
  const [x, z] = projectReal(cfg, sp[1], sp[2]);
  rm.warm({ x, z }, 14);
  const rd = rm.nearestRoadPoint(x, z, 600);
  spawnRaw(rd || { x, y: 0, z, heading: 0 });
  toast(`📍 ${sp[0]}`);
}
async function switchCityMap(w) {
  if (w === cityMap) return;
  if (race.active) race.abort('เปลี่ยนแผนที่');
  if (w !== 'bkk') {
    await ensureCity();
    const ld = document.getElementById('loading');
    if (!realMaps[w]) {
      ld.textContent = w === 'jp' ? 'กำลังโหลดแผนที่ญี่ปุ่น…' : 'กำลังโหลดแผนที่ไทย…';
      ld.classList.remove('hide');
      if (!ThaiMapCls) {
        const [tmMod, mmMod, rtMod] = await Promise.all([
          import('./thai/thaimap.js'), import('./thai/minimapLayer.js'), import('./thai/realtraffic.js'),
        ]);
        ThaiMapCls = tmMod.ThaiMap; drawThaiMinimapFn = mmMod.drawThaiMinimap;
        realTraffic = new rtMod.RealTraffic(scene, gfx.get('preset') === 'low' ? 25 : 50);
      }
      const q = gfx.get('preset') === 'low' ? 0 : gfx.get('preset') === 'medium' ? 1 : 2;
      const tm = new ThaiMapCls(scene, { quality: q, isJapan: w === 'jp' });
      const res = await tm.load('data/', REAL_CFG[w]);
      if (!res.local && !res.country) { ld.classList.add('hide'); toast('ยังไม่มีข้อมูลแผนที่นี้'); return; }
      realMaps[w] = tm;
      if (gfx.get('bots') === 'real') loadBots();
      ld.classList.add('hide');
    }
  }
  cityMap = w;
  document.getElementById('prompt').hidden = true;
  document.querySelectorAll('#worldSeg button').forEach((b) => b.classList.toggle('on', b.dataset.w === w));
  const cfg = REAL_CFG[w];
  realJumpEl.hidden = !cfg;
  if (cfg) {
    realJumpEl.innerHTML = cfg.spots.map((s, i) => `<option value="${i}">📍 ${s[0]}</option>`).join('');
    realJumpEl.value = '0';
  }
  syncTraffic();
  if (mode === 'city') {
    if (w === 'bkk') spawnAt(garageSpawn(GARAGES[0]));
    else jumpRealSpot(0);
  }
}
document.querySelectorAll('#worldSeg button').forEach((b) => { b.onclick = () => switchCityMap(b.dataset.w); });
realJumpEl.onchange = () => jumpRealSpot(+realJumpEl.value);

document.getElementById('btnSafehouse').onclick = () => {
  if (race.active) race.abort();
  if (mode !== 'city') return;
  if (cityMap !== 'bkk') jumpRealSpot(0);
  else spawnAt(garageSpawn(GARAGES[0]));
};
// ---------- garages: the showroom is the inside of the garage you drove into ----------
async function enterGarage(m) {
  inGarage = m;
  await setMode('garage');
  document.body.classList.add('garage');
  document.getElementById('garageName').textContent = `🔧 ${m.name}`;
  panel.show('gen');
}
document.getElementById('btnExitGarage').onclick = async () => {
  const g = GARAGES.find((x) => x.id === inGarage?.id) || GARAGES[0];
  online.garage(null);
  inGarage = null;
  document.body.classList.remove('garage');
  await setMode('city', garageSpawn(g));
};
addEventListener('keydown', (e) => { if (e.code === 'KeyR' && e.target.tagName !== 'INPUT' && (mode === 'city' || mode === 'drive')) document.getElementById('btnResetCar').click(); });
const btnSound = document.getElementById('btnSound');
btnSound.onclick = () => { const on = driver.toggleSound(); btnSound.textContent = on ? '🔊 เสียง' : '🔇 เสียง'; };
const btnChase = document.getElementById('btnChase');
btnChase.onclick = () => { chase = !chase; btnChase.classList.toggle('on', chase); };
// R: back onto the road (race: at your progress · touge: nearest road point · city: upright where you are)
document.getElementById('btnResetCar').onclick = () => {
  if (race.respawn()) return;
  if (mode !== 'city') { driver.reset(); return; }
  const p = driver.pos;
  const rm = activeRealMap();
  if (rm) {
    const rd = rm.nearestRoadPoint(p.x, p.z, 250);
    if (rd) { spawnRaw(rd); return; }
    spawnRaw({ x: p.x, y: rm.groundHeight(p.x, p.z, driver.y), z: p.z, heading: driver.heading });
    return;
  }
  const nb = C?.touge?.nearest(p.x, p.z, 80);
  if (nb && p.x < -560) { const q = C.touge.path[nb.i]; spawnRaw({ x: q.x, y: q.y, z: q.z, heading: Math.atan2(-q.tz, q.tx) }); return; }
  spawnRaw({ x: p.x, y: driver.y || 0, z: p.z, heading: driver.heading });
};
touchEl.querySelectorAll('button').forEach((b) => {
  const k = b.dataset.t;
  const on = (e) => { e.preventDefault(); driver.touch[k] = 1; b.classList.add('press'); };
  const off = (e) => { e.preventDefault(); driver.touch[k] = 0; b.classList.remove('press'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});

// ---------- loop ----------
const kmhEl = document.getElementById('kmh'), gearEl = document.getElementById('gear'), rpmArc = document.getElementById('rpmArc');
const ARC = rpmArc.getTotalLength();
const nosBar = document.getElementById('nosBar'), nosI = nosBar.querySelector('i');
rpmArc.style.strokeDasharray = `${ARC} ${ARC}`;
const CAM = { near: [-5.2, 1.9], normal: [-6.2, 2.2], far: [-7.6, 2.7] };
const baseFov = () => (camera.aspect < 0.8 ? 64 : camera.aspect < 1.2 ? 50 : 38);
const clock = new THREE.Clock();
const lastCarPos = new THREE.Vector3();
let mmT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!gov.tick(now ?? performance.now())) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt / 0.7);
    const e = 1 - Math.pow(1 - camAnim.t, 3);
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, e);
    controls.target.lerpVectors(camAnim.t0, camAnim.t1, e);
    if (camAnim.t >= 1) camAnim = null;
  }
  let night = 0;
  if (mode === 'city' && C) {
    if (timeAuto) { hour = (hour + dt / 60) % 24; document.getElementById('timeSlider').value = hour; }
    night = C.sky.apply(hour, world, VIEW[gfx.get('view')].fog);
    C.weather.update(dt, car.root.position, driver.vel, C.city, C.sky, VIEW[gfx.get('view')].fog);
    C.sky.updateEnv(renderer, hour, C.weather.wet);
    car.setAutoLights(night > 0.55);
    const rm = activeRealMap();
    if (rm) {
      rm.setNight(night);
      rm.update(camera.position, dt);
      if (realTraffic && trafficOn) realTraffic.update(dt, { x: driver.pos.x, y: driver.y || 0, z: driver.pos.z }, rm, night);
    } else {
      C.city.update(dt, night);
      if (trafficActive()) C.traffic.update(dt, { x: driver.pos.x, z: driver.pos.z, y: driver.y || 0 }, night);
    }
    C.sky.group.position.set(camera.position.x, 0, camera.position.z);
    // nothing past the fog end is visible → don't draw it (big saving: the city from the mountain and vice versa)
    const farWant = Math.max(1500, Math.min(VIEW[gfx.get('view')].far, C.sky.fog.far * 1.03));
    if (Math.abs(camera.far - farWant) > 20) { camera.far = farWant; camera.updateProjectionMatrix(); }
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    document.getElementById('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  if (mode === 'drive' || mode === 'city') {
    lastCarPos.copy(car.root.position);
    const s = driver.step(dt);
    car.setDriveLights(s.braking);
    const cp = car.root.position;
    const delta = cp.clone().sub(lastCarPos);
    if (inspecting?.car?.root.visible) {
      // showcase: orbit the other player's car
      const tp = inspecting.car.root.position;
      controls.target.lerp(new THREE.Vector3(tp.x, tp.y + 0.7, tp.z), Math.min(1, dt * 4));
      const off = camera.position.clone().sub(controls.target);
      if (off.length() > 9 || off.length() < 4) camera.position.copy(controls.target).add(off.setLength(6.5).setY(Math.max(1.4, off.y)));
    } else if (chase) {
      const [cd, ch] = CAM[gfx.get('cam')] || CAM.normal;
      const spd = driver.vel.length();
      const back = new THREE.Vector3(cd - Math.min(0.8, spd * 0.015), ch, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), driver.heading).add(cp);
      camera.position.add(delta);
      camera.position.lerp(back, Math.min(1, dt * 4.8));
      // subtle road-surface vibration at high speed or off-road
      if (spd > 28) {
        const vib = Math.min(0.025, (spd - 28) * 0.0005) * (surfaceMu(cp.x, cp.z) < 1 ? 2.2 : 1);
        camera.position.y += Math.sin(now * 0.045) * vib;
      }
    } else camera.position.add(delta);
    if (!inspecting) {
      const lookAhead = Math.min(2.2, driver.vel.length() * 0.04);
      controls.target.set(cp.x + Math.cos(driver.heading) * lookAhead, cp.y + 0.82, cp.z - Math.sin(driver.heading) * lookAhead);
    }
    if (mode === 'city' && C) {
      const rm = activeRealMap();
      if (!rm) race.update(dt, { x: cp.x, y: driver.y || 0, z: cp.z });
      sun.position.copy(cp).addScaledVector(C.sky.sunDir, 150); sun.castShadow = night < 0.9 && sun.userData.shadowOn;
      if ((mmT -= dt) <= 0) { // minimap at ~20 Hz is plenty
        mmT = 0.05;
        if (rm && drawThaiMinimapFn) {
          const g = C.minimap.ctx, W = g.canvas.width, R = W / 2;
          g.clearRect(0, 0, W, W);
          g.save();
          g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
          g.fillStyle = '#1b2a1b'; g.fillRect(0, 0, W, W);
          drawThaiMinimapFn(g, rm, cp.x, cp.z, 0.45, driver.heading - Math.PI / 2);
          g.restore();
          g.fillStyle = '#4cc3ff'; g.strokeStyle = '#000'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(R, R - 10); g.lineTo(R + 7, R + 8); g.lineTo(R, R + 4); g.lineTo(R - 7, R + 8); g.closePath(); g.fill(); g.stroke();
        } else {
          const rr = race.route();
          C.minimap.draw(cp.x, cp.z, driver.heading, trafficActive() ? C.traffic.cars : [], online.dots(), rr ? { route: rr, bots: race.dots(), next: race.nextGate() } : null, game.icons().concat(police ? police.dots().map((d) => ({ ...d, kind: 'cop' })) : []));
        }
      }
    } else { sun.position.copy(cp).add(new THREE.Vector3(4, 8, 3)); sun.castShadow = sun.userData.shadowOn; }
    sun.target.position.copy(cp);
    kmhEl.textContent = Math.round(s.kmh);
    gearEl.textContent = s.gear;
    const rr = Math.min(1, s.rpm / ((s.redline || 7000) * 1.08));
    rpmArc.style.strokeDashoffset = ARC * (1 - rr);
    rpmArc.classList.toggle('red', s.rpm > (s.redline || 7000) * 0.92);
    // speed widens the view a little (sense of speed) — capped so it never hurts precision
    nosBar.hidden = s.nos === null;
    if (s.nos !== null) { nosI.style.width = `${Math.round(s.nos * 100)}%`; nosBar.classList.toggle('on', !!s.nosOn); }
    const fov = baseFov() + (gfx.get('fovKick') ? Math.min(9, s.kmh * 0.045) + (s.nosOn ? 5 : 0) : 0);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
    if (mode === 'city' && !activeRealMap()) {
      game.update(dt, { x: cp.x, y: driver.y || 0, z: cp.z }, driver.vel.length(), mode);
      police?.update(dt, { x: cp.x, y: driver.y || 0, z: cp.z, vx: driver.vel.x, vz: driver.vel.z, speed: driver.vel.length() }, mode);
      police?.share(dt);
    }
  }
  online.update(dt, mode, night);
  controls.update(dt);
  if (mode === 'city' && C && gfx.get('bloom')) { C.bloom.strength = 0.12 + night * 0.38; C.bloom.threshold = 0.92; C.bloom.radius = 0.35; C.grade.setState({ time: performance.now() / 1000, night, wet: C.weather.wet, speed: driver.vel.length() / 80 }); C.composer.render(dt); }
  else renderer.render(scene, camera);
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// ---------- social: friends, party, warp, car showcase ----------
let inspecting = null;
const social = new Social({
  online, toast, game,
  hooks: {
    warpTo: async (pose, id) => {
      if (race.active) race.abort();
      if (inGarage) document.getElementById('btnExitGarage').click();
      if (mode !== 'city') await setMode('city');
      if (!pose) { toast('วาร์ปแล้ว — เพื่อนยังไม่ได้ขับในเมือง'); return; }
      // land a few metres beside the friend's car
      setTimeout(() => {
        const p = id && online.peers.get(id)?.pose;
        const h = p ? p.h : 0, tgt = p || pose;
        spawnRaw({ x: tgt.x - Math.cos(h) * 7 + Math.sin(h) * 3, y: tgt.y, z: tgt.z + Math.sin(h) * 7 + Math.cos(h) * 3, heading: h });
        toast('🚀 วาร์ปถึงเพื่อนแล้ว');
      }, 600);
    },
    partyRace: async () => { await ensureCity(); race.openSetup(null, null, true); },
    challenge: (t) => race.openSetup(null, t),
    startInspect: (peer) => { inspecting = peer; online.inspectingId = peer?.id || null; driver.frozen = true; document.body.classList.add('inspecting'); controls.autoRotate = true; controls.autoRotateSpeed = 1.2; },
    endInspect: () => { inspecting = null; online.inspectingId = null; driver.frozen = false; document.body.classList.remove('inspecting'); controls.autoRotate = false; },
  },
});
const onlineUI = setupOnlineUI(online, { toast, challenge: (t) => race.openSetup(null, t), inspect: (p) => social.inspect(p) });

// ---------- title → straight into the shared online world (no rooms, no offline mode) ----------
const ttName = document.getElementById('ttName'), ttGo = document.getElementById('ttGo'), ttStatus = document.getElementById('ttStatus');
if (!ttName.value) ttName.value = online.name || ''; // don't wipe what was typed while the game loaded
ttName.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ttGo.click(); });
let entered = false;
ttGo.onclick = () => enterCity(false);
async function enterCity(fromLogin) {
  const n = ttName.value.trim();
  // after logging in, the account's saved racer name wins (the server fills it in on hello)
  if (fromLogin) online.setName('');
  else {
    if (!n) { ttName.focus(); ttStatus.textContent = 'ตั้งชื่อนักซิ่งก่อนนะ'; return; }
    if (n !== online.name) online.setName(n);
  }
  ttGo.disabled = true; ttStatus.textContent = 'กำลังเชื่อมต่อเซิร์ฟเวอร์…';
  const r = await online.start();
  if (!r.ok) { ttGo.disabled = false; ttGo.textContent = 'ลองเชื่อมต่ออีกครั้ง ↻'; ttStatus.textContent = '⚠️ ' + (r.err || 'เชื่อมต่อไม่ได้'); return; }
  // what the server says we don't own goes back to stock (a car we don't own → the starter car)
  if (panel.missing(build).some((k) => k.startsWith('car:'))) { garage.put(build); build = garage.get('gen2'); }
  stripUnowned(build);
  car.setBuild(build); updateCredit(); persist(); online.sendBuild();
  lastGoodEngine = JSON.parse(JSON.stringify(build.engine || null));
  ttStatus.textContent = 'กำลังสร้างเมือง…';
  await setMode('city', garageSpawn(GARAGES[0]));
  document.body.classList.remove('title');
  entered = true;
  game.updateWallet();
  game.feed(`ยินดีต้อนรับ <b>${online.name}</b> · เงิน ฿${online.me.money.toLocaleString()} · ออนไลน์ ${r.online} คน`);
  if (r.me.races === 0) game.feed('💡 เก็บเหรียญ ฿ ตามถนน · วงฟ้า = อู่ (กด E) · วงม่วง = อู่ลับ · วงแดง = จุดแข่ง · M = แผนที่', 'tip');
}
online.on((ev) => {
  if (ev?.hello && entered) game.feed('🔄 เชื่อมต่อกลับเข้าเมืองแล้ว');
  if (ev?.kicked) { document.body.classList.add('title'); ttStatus.textContent = '⚠️ บัญชีนี้เข้าเล่นจากที่อื่นแล้ว — รีโหลดหน้าเพื่อเล่นที่นี่'; ttGo.disabled = true; }
  if (ev?.world && entered) game.feed(`🚀 ย้ายไปเมือง ${ev.world.world}`);
});
document.getElementById('ttAcc').onclick = () => { const b = document.getElementById('ttLoginBox'); b.hidden = !b.hidden; if (!b.hidden) document.getElementById('ttUser').focus(); };
for (const id of ['ttUser', 'ttPass']) document.getElementById(id).addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') document.getElementById('ttLogin').click(); });
document.getElementById('ttLogin').onclick = async () => {
  ttStatus.textContent = 'กำลังเข้าสู่ระบบ…';
  const r = await online.login(document.getElementById('ttUser').value.trim(), document.getElementById('ttPass').value);
  if (!r.ok) { ttStatus.textContent = '⚠️ ' + r.err; return; }
  enterCity(true);
};
// switched account from the friends menu → go straight in as that account
try { if (sessionStorage.getItem('vg:relogin')) { sessionStorage.removeItem('vg:relogin'); enterCity(true); } } catch { /* ignore */ }

window.__vios = {
  car, world, driver, online, garage, race, gfx, gov, game, social, enterGarage,
  get police() { return police; }, get mode() { return mode; }, get build() { return build; }, get city() { return C; },
  setMode, setHour: (h) => { hour = h; }, setWeather: (w) => gfx.set('weather', w),
  bench: () => ({
    fps: Math.round(gov.fps), p95Ms: Math.round(gov.p95Ms * 10) / 10, pr: Math.round(gov.pixelRatio() * 100) / 100,
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  }),
};
