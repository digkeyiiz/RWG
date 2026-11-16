// Offline cache: precache the app shell, then cache everything same-origin on first use
// (so .glb models you add are available offline after the first load).
const CACHE = 'vios-garage-v56';
const CORE = [
  './', 'css/style.css', 'manifest.webmanifest',
  'js/main.js', 'js/world.js', 'js/car.js', 'js/fx.js', 'js/kit.js', 'js/icons.js', 'js/thumbs.js', 'js/body.js', 'js/wheels.js', 'js/materials.js', 'js/ui.js', 'js/drive.js', 'js/catalog.js', 'js/glbcar.js', 'js/net.js', 'js/onlineui.js', 'js/engine.js', 'js/garage.js', 'js/settings.js', 'js/race.js', 'js/game.js', 'js/economy.js', 'js/places.js', 'js/police.js', 'js/social.js', 'vendor/socket.io/socket.io.esm.min.js', 'vendor/three-mesh-bvh/index.module.js', 'models/vios-gen2-2007.glb',
  './models/wheels/enkei-rpf1.glb',
  'vendor/three/three.module.min.js', 'vendor/three/addons/controls/OrbitControls.js', 'vendor/three/addons/loaders/GLTFLoader.js',
  'vendor/three/addons/utils/BufferGeometryUtils.js', 'vendor/three/addons/environments/RoomEnvironment.js', 'vendor/three/addons/objects/Reflector.js', 'vendor/three/addons/modifiers/TessellateModifier.js', 'vendor/three/addons/libs/meshopt_decoder.module.js',
  'fonts/kanit-thai-400-normal.woff2', 'fonts/kanit-thai-600-normal.woff2', 'fonts/kanit-latin-400-normal.woff2', 'fonts/kanit-latin-600-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'fonts/jp-signs.woff2',
  'js/city/city.js', 'js/city/geobuf.js', 'js/city/physics.js', 'js/city/textures.js', 'js/city/pbr.js', 'js/city/signs.js', 'js/city/traffic.js', 'js/city/vehicles.js', 'js/city/sky.js', 'js/city/minimap.js', 'js/city/touge.js', 'js/city/botcars.js', 'js/city/weather.js', 'js/city/grade.js', 'js/thai/thaimap.js', 'js/thai/roadmesh.js', 'js/thai/minimapLayer.js', 'js/thai/worldprops.js', 'js/thai/realtraffic.js', 'models/bots/gen2.glb',
  'vendor/three/addons/postprocessing/EffectComposer.js', 'vendor/three/addons/postprocessing/RenderPass.js', 'vendor/three/addons/postprocessing/UnrealBloomPass.js', 'vendor/three/addons/postprocessing/OutputPass.js',
  'vendor/three/addons/postprocessing/ShaderPass.js', 'vendor/three/addons/postprocessing/MaskPass.js', 'vendor/three/addons/postprocessing/Pass.js',
  'vendor/three/addons/shaders/CopyShader.js', 'vendor/three/addons/shaders/LuminosityHighPassShader.js', 'vendor/three/addons/shaders/OutputShader.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first (so updates show up when online), fall back to cache when offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // online play traffic (socket.io polling under /mp) must never touch the cache
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/mp')) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./')))
  );
});
