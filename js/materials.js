import * as THREE from 'three';

let carbonTex = null;
// 2x2 twill carbon weave: every cell is a bundle of fibres with a sheen across it, the weave steps one cell per row.
// One 256px tile = 8x8 cells; repeat 10 → ~1.2 cm per cell on a part built in metres (fine enough to read as real weave).
export function getCarbonTexture() {
  if (carbonTex) return carbonTex;
  const S = 256, N = 8, cs = S / N;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#050506';
  g.fillRect(0, 0, S, S);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const horiz = ((i + j) % 4) < 2; // 2x2 twill
      const x = i * cs, y = j * cs;
      // sheen along the fibre direction: bright in the middle of the bundle, dark where it dives under
      const grd = horiz ? g.createLinearGradient(x, y, x + cs, y) : g.createLinearGradient(x, y, x, y + cs);
      grd.addColorStop(0, '#0a0b0c'); grd.addColorStop(0.35, '#2b2e33'); grd.addColorStop(0.55, '#3d4046'); grd.addColorStop(1, '#0b0c0e');
      g.fillStyle = grd;
      g.fillRect(x, y, cs, cs);
      // individual fibres (thin dark lines across the bundle)
      g.fillStyle = 'rgba(0,0,0,0.38)';
      for (let k = 0; k < 6; k++) {
        const o = (k + 0.5) * (cs / 6);
        if (horiz) g.fillRect(x, y + o - 0.6, cs, 1.2); else g.fillRect(x + o - 0.6, y, 1.2, cs);
      }
      // dark seam between bundles
      g.fillStyle = 'rgba(0,0,0,0.65)';
      g.fillRect(x, y, cs, 1.4); g.fillRect(x, y, 1.4, cs);
    }
  }
  carbonTex = new THREE.CanvasTexture(c);
  carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping;
  carbonTex.repeat.set(10, 10);
  carbonTex.colorSpace = THREE.SRGBColorSpace;
  carbonTex.anisotropy = 16;
  carbonTex.minFilter = THREE.LinearMipmapLinearFilter;
  carbonTex.generateMipmaps = true;
  return carbonTex;
}

// Applies a paint finish to an existing MeshPhysicalMaterial (keeps the instance).
export function setPaint(mat, color, finish) {
  mat.map = null;
  mat.color.set(color);
  mat.iridescence = 0;
  mat.sheen = 0;
  switch (finish) {
    case 'gloss': Object.assign(mat, { metalness: 0.0, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.03 }); break;
    case 'metallic': Object.assign(mat, { metalness: 0.6, roughness: 0.33, clearcoat: 1, clearcoatRoughness: 0.03 }); break;
    case 'pearl': Object.assign(mat, { metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.8, iridescenceIOR: 1.6 }); break;
    case 'candy': Object.assign(mat, { metalness: 0.75, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.01 }); break;
    case 'chameleon': Object.assign(mat, { metalness: 0.85, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 1, iridescenceIOR: 2.1, iridescenceThicknessRange: [250, 700] }); break;
    case 'flake': Object.assign(mat, { metalness: 0.9, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.04 }); break;
    case 'satin': Object.assign(mat, { metalness: 0.45, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.45 }); break;
    case 'matte': Object.assign(mat, { metalness: 0.15, roughness: 0.78, clearcoat: 0, clearcoatRoughness: 1 }); break;
    case 'chrome': Object.assign(mat, { metalness: 1.0, roughness: 0.05, clearcoat: 0, clearcoatRoughness: 0 }); break;
    default: Object.assign(mat, { metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 });
  }
  mat.needsUpdate = true;
}

export function setCarbon(mat) {
  mat.color.set('#ffffff');
  mat.map = getCarbonTexture();
  Object.assign(mat, { metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0 });
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------------------------------------
// Livery: stripes / two-tone / race number painted in the shader, in car space (+x front, y up, z right),
// so it works on every model regardless of its UVs and follows the body when it rolls and pitches.
// ---------------------------------------------------------------------------------------------
export const LIVERY_TYPES = ['none', 'twin', 'center', 'side', 'slant', 'rocker', 'fade', 'twinSide'];

export function makeLiveryState() {
  return {
    uCarInv: { value: new THREE.Matrix4() },
    uLivType: { value: 0 },
    uLivC1: { value: new THREE.Color('#ffffff') },
    uLivC2: { value: new THREE.Color('#111111') },
    uLivW: { value: 0.5 },
    uLivBox: { value: new THREE.Vector4(-2.1, 2.1, 0.8, 1.4) }, // xmin, xmax, belt y, roof y
    uNumOn: { value: 0 },
    uNumPos: { value: new THREE.Vector3(0.28, 0.66, 0.19) },     // x, y, radius
    uNumTex: { value: null },
  };
}

// Patch a paint material so it shows the livery described by `st` (shared between roof / hood / body materials).
export function attachLivery(mat, st) {
  mat.customProgramCacheKey = () => 'vg-livery-v1';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, st);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCar; uniform mat4 uCarInv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCar = (uCarInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCar;
uniform float uLivType, uLivW, uNumOn; uniform vec3 uLivC1, uLivC2, uNumPos; uniform vec4 uLivBox; uniform sampler2D uNumTex;
float livBand(float v, float c, float hw) { float e = fwidth(v) * 1.2 + 1e-4; return smoothstep(hw + e, hw - e, abs(v - c)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 gN = normalize(cross(dFdx(vCar), dFdy(vCar)));
  float onTop = 1.0 - smoothstep(0.55, 0.85, abs(gN.z));      // surfaces that do not face sideways
  float onSide = smoothstep(0.55, 0.85, abs(gN.z));           // flanks (doors, fenders)
  float L = uLivBox.y - uLivBox.x; float tx = (vCar.x - uLivBox.x) / L; // 0 = tail, 1 = nose
  float m = 0.0; float m2 = 0.0;
  float w = 0.05 + uLivW * 0.16;
  if (uLivType < 0.5) { /* no livery */ }
  else if (uLivType < 1.5) { float g = 0.03 + uLivW * 0.03; m = max(livBand(vCar.z, g + w * 0.5, w * 0.5), livBand(vCar.z, -(g + w * 0.5), w * 0.5)) * onTop; }
  else if (uLivType < 2.5) { m = livBand(vCar.z, 0.0, 0.07 + uLivW * 0.2) * onTop; }
  else if (uLivType < 3.5) { float hw = 0.015 + uLivW * 0.05; m = livBand(vCar.y, 0.62, hw) * onSide * smoothstep(0.02, 0.1, tx) * smoothstep(0.02, 0.1, 1.0 - tx); }
  else if (uLivType < 4.5) { float hw = 0.03 + uLivW * 0.07; float yc = 0.5 + (tx - 0.5) * 0.34; m = livBand(vCar.y, yc, hw) * onSide; m2 = livBand(vCar.y, yc - hw * 2.3, hw * 0.35) * onSide; }
  else if (uLivType < 5.5) { float e = fwidth(vCar.y) * 1.2 + 1e-4; float yl = 0.3 + uLivW * 0.22; m = smoothstep(yl + e, yl - e, vCar.y) * max(onSide, 1.0 - onTop * 0.0); }
  else if (uLivType < 6.5) { m = smoothstep(0.2 + uLivW * 0.5, 1.0, 1.0 - tx) * 0.95; }
  else { float hw = 0.012 + uLivW * 0.03; m = max(livBand(vCar.y, 0.64, hw), livBand(vCar.y, 0.64 - hw * 3.2, hw * 0.55)) * onSide * smoothstep(0.02, 0.1, tx) * smoothstep(0.02, 0.1, 1.0 - tx); }
  diffuseColor.rgb = mix(diffuseColor.rgb, uLivC1, clamp(m, 0.0, 1.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, uLivC2, clamp(m2, 0.0, 1.0));
  if (uNumOn > 0.5) {
    float sgn = vCar.z >= 0.0 ? 1.0 : -1.0;
    vec2 q = vec2((vCar.x - uNumPos.x) * sgn, vCar.y - uNumPos.y) / (2.0 * uNumPos.z) + 0.5;
    if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0 && onSide > 0.5) { vec4 t = texture2D(uNumTex, vec2(q.x, q.y)); diffuseColor.rgb = mix(diffuseColor.rgb, t.rgb, t.a); }
  }
}`);
  };
  mat.needsUpdate = true;
}

// Race-number roundel texture (white disc, black digits by default).
export function drawNumberTexture(tex, text, bg, fg) {
  const c = tex.image, g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = bg; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = fg; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const t = String(text || '').slice(0, 3);
  g.font = `700 ${t.length > 2 ? 104 : t.length > 1 ? 128 : 150}px Kanit, Impact, sans-serif`;
  g.fillText(t, 128, 136, 200);
  tex.needsUpdate = true;
}
export function newNumberTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function newPaint() {
  return new THREE.MeshPhysicalMaterial({ color: '#ccc', metalness: 0.6, roughness: 0.33, clearcoat: 1, clearcoatRoughness: 0.03 });
}

// Window film: darkness 0..100 (Thai shops quote "ฟิล์ม 60%" as darkness).
export function setGlass(mat, darkness, film) {
  const d = Math.max(0, Math.min(100, darkness)) / 100;
  mat.color.set(film.color);
  mat.opacity = 0.18 + d * 0.8;
  mat.metalness = film.metal;
  mat.roughness = 0.04;
  mat.needsUpdate = true;
}

export function newGlass() {
  return new THREE.MeshPhysicalMaterial({
    color: '#0a0b0d', transparent: true, opacity: 0.6, metalness: 0.1, roughness: 0.04,
    clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
  });
}

export const shared = {
  black: new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }),
  blackGloss: new THREE.MeshPhysicalMaterial({ color: '#08080a', roughness: 0.15, metalness: 0.2, clearcoat: 1, side: THREE.DoubleSide }),
  trimMatte: new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
  chrome: new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.06, metalness: 1, side: THREE.DoubleSide }),
  rubber: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.92, metalness: 0 }),
  interior: new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.9, metalness: 0 }),
  seat: new THREE.MeshStandardMaterial({ color: '#232326', roughness: 0.8, metalness: 0 }),
  mesh: new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide }),
  mirrorGlass: new THREE.MeshStandardMaterial({ color: '#9aa4ad', roughness: 0.02, metalness: 1, side: THREE.DoubleSide }),
  disc: new THREE.MeshStandardMaterial({ color: '#77797d', roughness: 0.45, metalness: 0.9 }),
};
