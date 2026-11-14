import * as THREE from 'three';

let carbonTex = null;
export function getCarbonTexture() {
  if (carbonTex) return carbonTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0b0c';
  g.fillRect(0, 0, 128, 128);
  const s = 16;
  for (let y = 0; y < 128; y += s) {
    for (let x = 0; x < 128; x += s) {
      const twill = ((x / s + y / s) % 2) === 0;
      const grd = twill ? g.createLinearGradient(x, y, x + s, y) : g.createLinearGradient(x, y, x, y + s);
      grd.addColorStop(0, '#151618');
      grd.addColorStop(0.5, '#3a3d42');
      grd.addColorStop(1, '#141517');
      g.fillStyle = grd;
      g.fillRect(x + 1, y + 1, s - 2, s - 2);
    }
  }
  carbonTex = new THREE.CanvasTexture(c);
  carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping;
  carbonTex.repeat.set(6, 6);
  carbonTex.colorSpace = THREE.SRGBColorSpace;
  carbonTex.anisotropy = 4;
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
  Object.assign(mat, { metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0 });
  mat.needsUpdate = true;
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
