// Procedural PBR normal/roughness maps + world-space rain puddle & ripple shader injection.
// Shared by both Bangkok Race City (bkk) and Open-World Thailand/Japan (th/jp).
import * as THREE from 'three';

export const wetUniform = { value: 0 };
export const timeUniform = { value: 0 };

function hash2i(x, y, seed = 1337) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Convert a tileable heightfield [0..1] (Float32Array W*H) into a tangent-space NormalMap CanvasTexture.
function heightToNormalTex(h, W, H, strength = 2.0, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  const at = (x, y) => h[((y + H) % H) * W + ((x + W) % W)];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength, ny = -dy * strength, nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const idx = (y * W + x) * 4;
      d[idx] = Math.max(0, Math.min(255, ((nx * 0.5 + 0.5) * 255) | 0));
      d[idx + 1] = Math.max(0, Math.min(255, ((ny * 0.5 + 0.5) * 255) | 0));
      d[idx + 2] = Math.max(0, Math.min(255, ((nz * 0.5 + 0.5) * 255) | 0));
      d[idx + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function grayTex(arr, W, H, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  for (let i = 0; i < W * H; i++) {
    const v = Math.max(0, Math.min(255, (arr[i] * 255) | 0));
    const idx = i * 4;
    d[idx] = v; d[idx + 1] = v; d[idx + 2] = v; d[idx + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

let _asphalt = null;
export function getAsphaltPBR() {
  if (_asphalt) return _asphalt;
  const W = 256, H = 256;
  const h = new Float32Array(W * H);
  const r = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fine = hash2i(x, y, 11);
      const med = hash2i(x >> 1, y >> 1, 23);
      const coarse = hash2i(x >> 3, y >> 3, 37);
      // subtle tire-wear track along U (x = 48, 96, 160, 208)
      const u = x / W;
      const track =
        Math.exp(-Math.pow((u - 0.19) / 0.06, 2)) +
        Math.exp(-Math.pow((u - 0.38) / 0.06, 2)) +
        Math.exp(-Math.pow((u - 0.62) / 0.06, 2)) +
        Math.exp(-Math.pow((u - 0.81) / 0.06, 2));
      const wear = Math.min(1, track * 0.65);
      const grain = fine * 0.55 + med * 0.3 + coarse * 0.15;
      h[y * W + x] = grain * (1.0 - wear * 0.45);
      // Roughness: worn tire tracks are smoother (0.64), rough aggregate is 0.94
      r[y * W + x] = 0.82 + (fine - 0.5) * 0.16 - wear * 0.20;
    }
  }
  _asphalt = {
    normalMap: heightToNormalTex(h, W, H, 2.4),
    roughnessMap: grayTex(r, W, H),
  };
  return _asphalt;
}

let _paving = null;
export function getPavingPBR() {
  if (_paving) return _paving;
  const W = 256, H = 256;
  const h = new Float32Array(W * H);
  const r = new Float32Array(W * H);
  const rows = 8, cols = 4, rh = H / rows, cw = W / cols;
  for (let y = 0; y < H; y++) {
    const row = Math.floor(y / rh);
    const ry = y - row * rh;
    const off = (row & 1) ? cw * 0.5 : 0;
    for (let x = 0; x < W; x++) {
      const cx = (x + off) % cw;
      const edge = Math.min(cx, cw - cx, ry, rh - ry);
      const groove = edge < 2.2 ? 0.15 : 0.85;
      const grain = hash2i(x, y, 71) * 0.25;
      h[y * W + x] = groove + grain * 0.4;
      r[y * W + x] = edge < 2.2 ? 0.96 : 0.82 + grain * 0.14;
    }
  }
  _paving = {
    normalMap: heightToNormalTex(h, W, H, 2.8),
    roughnessMap: grayTex(r, W, H),
  };
  return _paving;
}

let _concrete = null;
export function getConcretePBR() {
  if (_concrete) return _concrete;
  const W = 256, H = 256;
  const h = new Float32Array(W * H);
  const r = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const seam = (y % 64) < 2 ? 0.2 : 0.0;
    for (let x = 0; x < W; x++) {
      const n = hash2i(x, y, 91) * 0.35 + hash2i(x >> 2, y >> 2, 103) * 0.45 + hash2i(x >> 4, y >> 4, 117) * 0.2;
      h[y * W + x] = Math.max(0, n - seam);
      r[y * W + x] = 0.80 + n * 0.18;
    }
  }
  _concrete = {
    normalMap: heightToNormalTex(h, W, H, 1.8),
    roughnessMap: grayTex(r, W, H),
  };
  return _concrete;
}

let _water = null;
export function getWaterNormal() {
  if (_water) return _water;
  const W = 256, H = 256;
  const h = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x / W) * Math.PI * 2;
      const v = (y / H) * Math.PI * 2;
      const w1 = Math.sin(u * 3 + v * 2) * 0.25 + Math.cos(u * 5 - v * 4) * 0.2;
      const w2 = Math.sin(u * 11 + v * 9) * 0.1 + Math.cos(u * 7 - v * 13) * 0.1;
      const n = (hash2i(x >> 1, y >> 1, 211) - 0.5) * 0.12;
      h[y * W + x] = 0.5 + w1 + w2 + n;
    }
  }
  _water = heightToNormalTex(h, W, H, 1.6);
  _water.repeat.set(6, 6);
  return _water;
}

/**
 * Inject world-space procedural rain puddles, darkened wet asphalt, and raindrop ripples
 * into any MeshStandardMaterial (roads, sidewalks, decks).
 */
export function injectPuddleShader(mat, { maxPuddle = 0.85, rippleScale = 1.0 } = {}) {
  if (mat.userData._puddleInjected) return mat;
  mat.userData._puddleInjected = true;
  mat.customProgramCacheKey = () => `puddle_${maxPuddle}_${rippleScale}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = wetUniform;
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vPuddleWorldPos;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vPuddleWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uWet;
         uniform float uTime;
         varying vec3 vPuddleWorldPos;
         float pHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         float pNoise(vec2 p){
           vec2 i = floor(p), f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x),
                      mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y);
         }
         float pFbm(vec2 p){
           float v = 0.0, a = 0.5;
           for (int i = 0; i < 3; i++){ v += a * pNoise(p); p *= 2.07; a *= 0.5; }
           return v;
         }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float _puddleMask = 0.0;
         if (uWet > 0.005) {
           float pn = pFbm(vPuddleWorldPos.xz * 0.095);
           float thresh = mix(0.88, 0.44, uWet);
           _puddleMask = smoothstep(thresh, thresh + 0.14, pn) * ${maxPuddle.toFixed(2)} * uWet;
           // Wet asphalt darkens noticeably; standing water reflects sky
           diffuseColor.rgb *= mix(1.0, 0.48, uWet * 0.85);
           diffuseColor.rgb *= mix(1.0, 0.72, _puddleMask);
         }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         if (uWet > 0.005) {
           roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.42, uWet);
           roughnessFactor = mix(roughnessFactor, 0.04, _puddleMask);
         }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         if (_puddleMask > 0.05) {
           // Flatten micro-aggregate normal inside standing puddles + subtle raindrop ripples
           vec2 rp = vPuddleWorldPos.xz * ${(2.4 * rippleScale).toFixed(2)};
           vec2 cell = floor(rp);
           vec2 f = fract(rp) - 0.5;
           float rnd = pHash(cell);
           float t = fract(uTime * 1.4 + rnd);
           float d = length(f - (vec2(pHash(cell + 1.3), pHash(cell + 7.1)) - 0.5) * 0.45);
           float ring = sin((d - t * 0.45) * 42.0) * exp(-d * 7.5) * (1.0 - t) * step(d, 0.45);
           normal = normalize(mix(normal, vec3(0.0, 1.0, 0.0), _puddleMask * 0.88));
           normal.xz += normalize(f + 0.0001) * ring * 0.18 * _puddleMask;
           normal = normalize(normal);
         }`
      );
  };
  return mat;
}
