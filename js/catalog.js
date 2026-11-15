import { DEFAULT_ENGINE } from './engine.js';
// Vios Garage — data catalog.
// All dimensions are in meters and approximate (based on published spec sheets).
// To use a realistic 3D model for a generation, put a .glb file in /models and
// set `glb` below (see README "ใส่โมเดลจริง").

// Cars available in the game. Each entry is one car (make/model/generation).
// To add another model later, append entries with a different make/model — they get their own group in the menu.
export const GENERATIONS = [
  {
    id: 'gen1', make: 'Toyota', model: 'Vios', name: 'Vios Gen 1 (XP40)', years: '2002–2005', code: 'NCP42',
    glb: null,
    dims: { L: 4.285, W: 1.69, H: 1.46, WB: 2.50, fOH: 0.84, clear: 0.15 },
    body: { hoodY: 0.95, trunkY: 1.00, beltY: 0.96, beltRise: 0.03, noseDrop: 0.20, tailDrop: 0.07,
            rg: [0.16, 0.29], ws: [0.575, 0.75], roofRatio: 0.74 },
    tire: { width: 185, aspect: 60, rim: 14 },
    style: { head: 'teardrop', grille: 'oval', lower: 'smallSlot', tail: 'tall', fog: true, drl: false, sharkfin: false },
    colors: ['#f2f2ee', '#b9bcc0', '#5c6066', '#141518', '#8a0f16', '#1d3b6e', '#c7b98f'],
  },
  {
    id: 'gen1-fl', name: 'Soluna Vios (ไมเนอร์เชนจ์)', years: '2005–2007', code: 'NCP42',
    glb: null,
    dims: { L: 4.285, W: 1.69, H: 1.46, WB: 2.50, fOH: 0.84, clear: 0.15 },
    body: { hoodY: 0.95, trunkY: 1.00, beltY: 0.96, beltRise: 0.03, noseDrop: 0.20, tailDrop: 0.07,
            rg: [0.16, 0.29], ws: [0.575, 0.75], roofRatio: 0.74 },
    tire: { width: 185, aspect: 60, rim: 14 },
    style: { head: 'teardropClear', grille: 'ovalBar', lower: 'smallSlot', tail: 'tallClear', fog: true, drl: false, sharkfin: false },
    colors: ['#f2f2ee', '#b9bcc0', '#5c6066', '#141518', '#8a0f16', '#2d5a3c', '#c7b98f'],
  },
  {
    id: 'gen2', name: 'Vios Gen 2 (XP90)', years: '2007–2010', code: 'NCP93',
    glb: 'models/vios-gen2-2007.glb',
    // How the parts of this .glb are named (inspect a new model before adding it).
    glbConfig: {
      rotY: Math.PI / 2, // model faces +Z → car space faces +X
      wheels: { FR: 'WHEEL_RF', FL: 'WHEEL_LF', RR: 'WHEEL_RR', RL: 'WHEEL_LR' },
      calipers: { FR: 'SUSP_RF', FL: 'SUSP_LF', RR: 'SUSP_RR', RL: 'SUSP_LR' },
      paint: ['material_10'], windows: ['1.004'], head: ['head_light'], tail: ['Material', 'reflector'],
      plates: { front: 'plate003', rear: 'plate002' }, rimNode: 'RIM_RF', mirror: ['material_0'], interior: ['interior', 'doorin', 'Object004'],
    },
    credit: { text: '"2007 Toyota Vios (low poly)" โดย JUST GAME — CC BY 4.0', url: 'https://sketchfab.com/3d-models/2007-toyota-vios-low-poly-0899fcfeac9845e09ae296145c7b2b67' },
    dims: { L: 4.30, W: 1.70, H: 1.46, WB: 2.55, fOH: 0.86, clear: 0.15 },
    body: { hoodY: 0.94, trunkY: 1.02, beltY: 0.97, beltRise: 0.045, noseDrop: 0.21, tailDrop: 0.06,
            rg: [0.165, 0.30], ws: [0.565, 0.75], roofRatio: 0.75 },
    tire: { width: 185, aspect: 60, rim: 15 },
    style: { head: 'swept', grille: 'bar', lower: 'wideSlot', tail: 'wrap', fog: true, drl: false, sharkfin: false },
    colors: ['#f4f4f0', '#c3c6ca', '#6b6f75', '#0f1013', '#9e1219', '#2b4e7d', '#b48a55'],
  },
  {
    id: 'gen2-fl', name: 'Vios Gen 2 ไมเนอร์เชนจ์', years: '2010–2013', code: 'NCP93',
    glb: null,
    dims: { L: 4.30, W: 1.70, H: 1.46, WB: 2.55, fOH: 0.86, clear: 0.15 },
    body: { hoodY: 0.94, trunkY: 1.02, beltY: 0.97, beltRise: 0.045, noseDrop: 0.21, tailDrop: 0.06,
            rg: [0.165, 0.30], ws: [0.565, 0.75], roofRatio: 0.75 },
    tire: { width: 185, aspect: 60, rim: 15 },
    style: { head: 'sweptDark', grille: 'barWide', lower: 'wideSlot', tail: 'wrapClear', fog: true, drl: false, sharkfin: false },
    colors: ['#f4f4f0', '#c3c6ca', '#6b6f75', '#0f1013', '#9e1219', '#2b4e7d', '#8d1e4a'],
  },
  {
    id: 'gen3', name: 'Vios Gen 3 (XP150)', years: '2013–2016', code: 'NSP151',
    glb: null,
    dims: { L: 4.41, W: 1.70, H: 1.475, WB: 2.55, fOH: 0.92, clear: 0.145 },
    body: { hoodY: 0.95, trunkY: 1.03, beltY: 0.98, beltRise: 0.05, noseDrop: 0.22, tailDrop: 0.06,
            rg: [0.17, 0.295], ws: [0.56, 0.74], roofRatio: 0.75 },
    tire: { width: 185, aspect: 60, rim: 15 },
    style: { head: 'angular', grille: 'slot', lower: 'trapSmall', tail: 'wrapSharp', fog: true, drl: false, sharkfin: false },
    colors: ['#f5f5f2', '#c4c7cb', '#62666c', '#0d0e11', '#a5121c', '#24467a', '#a77b4f'],
  },
  {
    id: 'gen3-fl1', name: 'Vios Gen 3 ไมเนอร์เชนจ์ (หน้ากระจังใหญ่)', years: '2016–2019', code: 'NSP151',
    glb: null,
    dims: { L: 4.425, W: 1.73, H: 1.475, WB: 2.55, fOH: 0.93, clear: 0.145 },
    body: { hoodY: 0.95, trunkY: 1.03, beltY: 0.98, beltRise: 0.05, noseDrop: 0.22, tailDrop: 0.06,
            rg: [0.17, 0.295], ws: [0.56, 0.74], roofRatio: 0.75 },
    tire: { width: 185, aspect: 60, rim: 15 },
    style: { head: 'angularLed', grille: 'slotThin', lower: 'trapBig', tail: 'wrapLed', fog: true, drl: true, sharkfin: true },
    colors: ['#f5f5f2', '#c4c7cb', '#62666c', '#0d0e11', '#b0121c', '#1f3f73', '#e8e1d0', '#7a1d2a'],
  },
  {
    id: 'gen3-fl2', name: 'Vios Gen 3 ไมเนอร์เชนจ์ 2 (2020)', years: '2019–2022', code: 'NSP151',
    glb: null,
    dims: { L: 4.425, W: 1.73, H: 1.475, WB: 2.55, fOH: 0.93, clear: 0.145 },
    body: { hoodY: 0.95, trunkY: 1.03, beltY: 0.98, beltRise: 0.05, noseDrop: 0.22, tailDrop: 0.06,
            rg: [0.17, 0.295], ws: [0.56, 0.74], roofRatio: 0.75 },
    tire: { width: 185, aspect: 60, rim: 15 },
    style: { head: 'angularLed', grille: 'slotThin', lower: 'trapMesh', tail: 'wrapLed', fog: true, drl: true, sharkfin: true },
    colors: ['#f5f5f2', '#c4c7cb', '#62666c', '#0d0e11', '#b0121c', '#1f3f73', '#e8e1d0', '#5b5f3e'],
  },
  {
    id: 'gen4', name: 'Vios Gen 4 / Yaris ATIV (AC100)', years: '2022–ปัจจุบัน', code: 'NSP150',
    glb: null,
    dims: { L: 4.425, W: 1.74, H: 1.48, WB: 2.62, fOH: 0.89, clear: 0.15 },
    body: { hoodY: 0.93, trunkY: 1.03, beltY: 0.99, beltRise: 0.06, noseDrop: 0.21, tailDrop: 0.05,
            rg: [0.15, 0.305], ws: [0.55, 0.745], roofRatio: 0.74 },
    tire: { width: 195, aspect: 50, rim: 16 },
    style: { head: 'slim', grille: 'slimUpper', lower: 'hexBig', tail: 'slimBar', fog: false, drl: true, sharkfin: true },
    colors: ['#f5f5f2', '#c9cbd0', '#55595f', '#0b0c0e', '#b3121c', '#2f6db5', '#e4572e', '#7a7f86'],
  },
  {
    id: 'civic-fd', make: 'Honda', model: 'Civic', name: 'Civic FD (MK8 Sedan)', years: '2006–2011', code: 'FD',
    glb: 'models/civic-fd-2006.glb',
    // Part names of models/civic-fd-2006.glb (material names, plus invisible wheel anchors WHEEL_*).
    glbConfig: {
      rotY: Math.PI / 2, // model faces +Z → car space faces +X
      wheels: { FR: 'WHEEL_RF', FL: 'WHEEL_LF', RR: 'WHEEL_RR', RL: 'WHEEL_LR' },
      hide: ['WHEEL_RF', 'WHEEL_LF', 'WHEEL_RR', 'WHEEL_LR'],
      anchorWheels: true, // the .glb has no usable wheel meshes; wheels are the procedural ones
      // trim exported as default grey/white → real FD trim is black plastic
      recolor: { material_0: '#121214', plastika: '#17181a', crv_plastic: '#17181a', crv_offplastic: '#26272a' },
      paint: ['Paint'], windows: ['glass'], head: ['fd_lowbeam', 'fd_highbeam'],
      tail: ['fd_taillight', 'fd_taillight_L', 'fd_taillight_R', 'redglass', 'fd_reverselight'],
      mirror: ['mirror'], interior: [],
    },
    credit: { text: '"Honda Civic Sedan MK8 2006-2011" โดย Merc_TV — CC Attribution', url: 'https://sketchfab.com/3d-models/honda-civic-sedan-mk8-2006-2011-600b5900ab034fc19db376e6b6443366' },
    dims: { L: 4.32, W: 1.76, H: 1.41, WB: 2.55, fOH: 0.88, clear: 0.14 },
    body: { hoodY: 0.94, trunkY: 1.00, beltY: 0.97, beltRise: 0.04, noseDrop: 0.20, tailDrop: 0.06,
            rg: [0.16, 0.30], ws: [0.56, 0.75], roofRatio: 0.75 },
    tire: { width: 185, aspect: 60, rim: 15 },
    style: { head: 'swept', grille: 'bar', lower: 'wideSlot', tail: 'wrap', fog: true, drl: false, sharkfin: false },
    colors: ['#f4f4f0', '#c3c6ca', '#6b6f75', '#0f1013', '#9e1219', '#2b4e7d', '#b48a55'],
  },
  {
    id: 'civic-eg', make: 'Honda', model: 'Civic', name: 'Civic EG (3 ประตู)', years: '1991–1995', code: 'EG',
    glb: 'models/civic-eg-1991.glb',
    glbConfig: {
      rotY: Math.PI / 2, // model faces +Z → car space faces +X
      wheels: { FR: 'WHEEL_RF', FL: 'WHEEL_LF', RR: 'WHEEL_RR', RL: 'WHEEL_LR' },
      // Object_43..46 = stock rims left in the source (replaced by the game's wheels)
      hide: ['WHEEL_RF', 'WHEEL_LF', 'WHEEL_RR', 'WHEEL_LR', 'Object_43', 'Object_44', 'Object_45', 'Object_46',
        'Object_41'], // Object_41 = amber glass layered over the whole headlight lens → headlights looked yellow
      anchorWheels: true,
      hideMats: ['brakedisk'], // static stock discs
      paint: ['carpaint'], windows: ['windowglass'], head: ['clearglass'], tail: ['redglass'],
      plates: { front: 'PLATE_F', rear: 'PLATE_R' }, // plain plates replace the source's branded ones
      mirror: ['mirror'], interior: [],
    },
    credit: { text: '"Honda Civic (EG) hatchback 1991" โดย Nieve5677 — CC Attribution', url: 'https://sketchfab.com/3d-models/honda-civic-eg-hatchback-1991-5b12a8457db644fa9d0d1daa34e145b9' },
    dims: { L: 4.07, W: 1.69, H: 1.34, WB: 2.58, fOH: 0.80, clear: 0.14 },
    body: { hoodY: 0.92, trunkY: 0.98, beltY: 0.96, beltRise: 0.03, noseDrop: 0.18, tailDrop: 0.06,
            rg: [0.16, 0.29], ws: [0.56, 0.74], roofRatio: 0.74 },
    tire: { width: 175, aspect: 65, rim: 14 },
    style: { head: 'swept', grille: 'bar', lower: 'wideSlot', tail: 'wrap', fog: true, drl: false, sharkfin: false },
    colors: ['#f4f4f0', '#c3c6ca', '#6b6f75', '#0f1013', '#9e1219', '#2b4e7d', '#b48a55'],
  },
  {
    id: 'civic-ek', make: 'Honda', model: 'Civic', name: 'Civic EK (Ferio 2000)', years: '1995–2000', code: 'EK',
    // Removed 2026-11-13: source file carries a third-party manga image as glass texture and game-mod part names → not a clean license.
    glb: null,
    glbConfig: {
      rotY: Math.PI / 2, // model faces +Z → car space faces +X
      wheels: { FR: 'WHEEL_RF', FL: 'WHEEL_LF', RR: 'WHEEL_RR', RL: 'WHEEL_LR' },
      hide: ['WHEEL_RF', 'WHEEL_LF', 'WHEEL_RR', 'WHEEL_LR'],
      anchorWheels: true,
      paint: ['civ-material'], windows: ['civ_glass', 'civ_glass2', 'civ_glass3'],
      head: ['civ_clearglass'], tail: ['civ_taillightglass', 'civ_red'],
      mirror: ['mirror'], interior: [],
    },
    credit: { text: '"Honda Civic Ferio EK 2000" โดย Merc_TV — CC Attribution', url: 'https://sketchfab.com/3d-models/honda-civic-ferio-ek-2000-b0c754a1aff24e31bcf8a8df7c92d721' },
    dims: { L: 4.28, W: 1.70, H: 1.36, WB: 2.51, fOH: 0.85, clear: 0.14 },
    body: { hoodY: 0.92, trunkY: 0.96, beltY: 0.97, beltRise: 0.03, noseDrop: 0.18, tailDrop: 0.06,
            rg: [0.16, 0.29], ws: [0.56, 0.74], roofRatio: 0.74 },
    tire: { width: 175, aspect: 65, rim: 14 },
    style: { head: 'swept', grille: 'bar', lower: 'wideSlot', tail: 'wrap', fog: true, drl: false, sharkfin: false },
    colors: ['#f4f4f0', '#c3c6ca', '#6b6f75', '#0f1013', '#9e1219', '#2b4e7d', '#b48a55'],
  },
  {
    id: 'civic-fc', make: 'Honda', model: 'Civic', name: 'Civic FC (Sedan)', years: '2016–2021', code: 'FC',
    glb: 'models/civic-fc.glb',
    glbConfig: {
      rotY: Math.PI / 2, // model faces +Z → car space faces +X
      wheels: { FR: 'WHEEL_RF', FL: 'WHEEL_LF', RR: 'WHEEL_RR', RL: 'WHEEL_LR' },
      hide: ['WHEEL_RF', 'WHEEL_LF', 'WHEEL_RR', 'WHEEL_LR'],
      anchorWheels: true,
      hideMats: ['00_-_Honda_Civic_-_Pneu', '00_-_Honda_Civic_-_Roda'], // stock tyres/rims
      paint: ['00_-_Honda_Civic_-_Pintura'], windows: ['00_-_Honda_Civic_-_Vidros'],
      head: ['00_-_Honda_Civic_-_Refletor_Lanterna'], tail: ['00_-_Honda_Civic_-_Vidros_Vermelhos', '00_-_Honda_Civic_-_Vidro_Laranja'],
      mirror: [], interior: [],
    },
    credit: { text: '"Honda Civic FC Sedan" โดย Nieve5677 — CC Attribution', url: 'https://sketchfab.com/3d-models/honda-civic-fc-sedan-428b1f3671af4e5bae092fe0ce9dd439' },
    dims: { L: 4.65, W: 1.80, H: 1.47, WB: 2.70, fOH: 0.90, clear: 0.14 },
    body: { hoodY: 0.95, trunkY: 1.00, beltY: 1.00, beltRise: 0.03, noseDrop: 0.18, tailDrop: 0.06,
            rg: [0.16, 0.30], ws: [0.56, 0.75], roofRatio: 0.74 },
    tire: { width: 215, aspect: 50, rim: 17 },
    style: { head: 'swept', grille: 'bar', lower: 'wideSlot', tail: 'wrap', fog: true, drl: false, sharkfin: false },
    colors: ['#f4f4f0', '#c3c6ca', '#6b6f75', '#0f1013', '#9e1219', '#2b4e7d', '#b48a55'],
  },
  {
    id: 'civic-fe', make: 'Honda', model: 'Civic', name: 'Civic FE (แฮตช์แบ็ก 2022+)', years: '2022–ปัจจุบัน', code: 'FE',
    glb: 'models/civic-fe.glb',
    glbConfig: {
      rotY: Math.PI / 2, // model faces +Z → car space faces +X
      wheels: { FR: 'WHEEL_RF', FL: 'WHEEL_LF', RR: 'WHEEL_RR', RL: 'WHEEL_LR' },
      // stock tyre, rim, brake disc and tyre-lettering meshes are hidden too
      hide: ['WHEEL_RF', 'WHEEL_LF', 'WHEEL_RR', 'WHEEL_LR', 'tyre_Logo_0'],
      hideMats: ['tire', 'blackGlossy.velg2', 'discbrake'],
      anchorWheels: true,
      paint: ['paint'], windows: ['window'],
      head: ['lamp'], tail: ['lamp'],
      mirror: [], interior: [],
    },
    credit: { text: '"2025 Honda Civic RS e:HEV" โดย Palma123 JAAT — CC Attribution', url: 'https://sketchfab.com/3d-models/2025-honda-civic-rs-ehev-0dc6454d74a241e5a08fac82ce2826b2' },
    dims: { L: 4.62, W: 1.80, H: 1.40, WB: 2.70, fOH: 0.90, clear: 0.14 },
    body: { hoodY: 0.92, trunkY: 0.98, beltY: 0.99, beltRise: 0.03, noseDrop: 0.18, tailDrop: 0.06,
            rg: [0.16, 0.29], ws: [0.56, 0.74], roofRatio: 0.74 },
    tire: { width: 215, aspect: 50, rim: 17 },
    style: { head: 'swept', grille: 'bar', lower: 'wideSlot', tail: 'wrap', fog: true, drl: false, sharkfin: false },
    colors: ['#f4f4f0', '#c3c6ca', '#6b6f75', '#0f1013', '#9e1219', '#2b4e7d', '#b48a55'],
  },
  {
    id: 'evo-ix', make: 'Mitsubishi', model: 'Lancer Evolution', name: 'Lancer Evolution IX', years: '2005–2007', code: 'CT9A',
    glb: 'models/mitsubishi-evo-ix.glb',
    glbConfig: {
      rotY: Math.PI / 2, // model faces +Z → car space faces +X
      wheels: { FR: 'WHEEL_RF', FL: 'WHEEL_LF', RR: 'WHEEL_RR', RL: 'WHEEL_LR' },
      hide: ['WHEEL_RF', 'WHEEL_LF', 'WHEEL_RR', 'WHEEL_LR'],
      anchorWheels: true,
      hideMats: ['Tyres_Material', 'Rims_Material'], // stock tyres/rims/brakes
      paint: ['Body_Paint'], windows: ['Glass_Material'],
      head: ['Lights_Material'], tail: ['Lights_Material'],
      mirror: [], interior: [],
    },
    credit: { text: '"Mitsubishi Lancer Evolution IX" โดย Benit Kibabu — CC Attribution', url: 'https://sketchfab.com/3d-models/mitsubishi-lancer-evolution-ix-ee88ad9414884bdabaf0658943ac339b' },
    dims: { L: 4.47, W: 1.79, H: 1.45, WB: 2.57, fOH: 0.92, clear: 0.14 },
    body: { hoodY: 0.94, trunkY: 1.00, beltY: 0.98, beltRise: 0.03, noseDrop: 0.18, tailDrop: 0.06,
            rg: [0.16, 0.29], ws: [0.56, 0.74], roofRatio: 0.74 },
    tire: { width: 225, aspect: 45, rim: 17 },
    style: { head: 'swept', grille: 'bar', lower: 'wideSlot', tail: 'wrap', fog: true, drl: false, sharkfin: false },
    colors: ['#f4f4f0', '#c3c6ca', '#6b6f75', '#0f1013', '#9e1219', '#2b4e7d', '#b48a55'],
  },
  {
    id: 'nissan-silvia-s13', make: 'Nissan', model: 'Silvia', name: 'Nissan Silvia S13', years: '1988–1993', code: 'S13',
    glb: 'models/nissan-silvia-s13.glb',
    glbConfig: {
      rotY: Math.PI / 2, // model nose points +Z (headlights) → car space faces +X
      wheels: { FR: 'WHEEL_RF', FL: 'WHEEL_LF', RR: 'WHEEL_RR', RL: 'WHEEL_LR' },
      hide: ['WHEEL_RF', 'WHEEL_LF', 'WHEEL_RR', 'WHEEL_LR'],
      anchorWheels: true,
      hideMats: ['Caliper', 'DOut', 'Dblack', 'DBlackIn'], // stock Brembo calipers + discs (static)
      paint: ['CarPaint', 'CarPaint2'], windows: ['Windows'],
      head: ['HeadAlpha1', 'HeadAlpha3', 'HeadlightInside'], tail: ['TailAlpha', 'Taillight'],
      mirror: [], interior: [],
    },
    credit: { text: '"1992 Nissan Silvia S13" โดย bagged_ls — CC Attribution', url: 'https://sketchfab.com/3d-models/1992-nissan-silvia-s13-6fa8f1948f954e3b980b5e96f203815a' },
    dims: { L: 4.47, W: 1.69, H: 1.29, WB: 2.47, fOH: 0.90, clear: 0.14 },
    body: { hoodY: 0.92, trunkY: 0.98, beltY: 0.99, beltRise: 0.03, noseDrop: 0.18, tailDrop: 0.06,
            rg: [0.16, 0.29], ws: [0.56, 0.74], roofRatio: 0.74 },
    tire: { width: 205, aspect: 55, rim: 15 },
    style: { head: 'swept', grille: 'bar', lower: 'wideSlot', tail: 'wrap', fog: true, drl: false, sharkfin: false },
    colors: ['#f4f4f0', '#c3c6ca', '#6b6f75', '#0f1013', '#9e1219', '#2b4e7d', '#b48a55'],
  },
  {
    id: 'supra-a80', make: 'Toyota', model: 'Supra', name: 'Supra MK4 (JZA80)', years: '1993–2002', code: 'A80',
    featured: true, glb: null,
    dims: { L: 4.515, W: 1.81, H: 1.275, WB: 2.55, fOH: 0.96, clear: 0.125 },
    body: { hoodY: 0.86, trunkY: 0.93, beltY: 0.89, beltRise: 0.04, noseDrop: 0.22, tailDrop: 0.06,
            rg: [0.10, 0.24], ws: [0.47, 0.68], roofRatio: 0.71 },
    tire: { width: 255, aspect: 40, rim: 17 },
    style: { head: 'sweptDark', grille: 'slotThin', lower: 'trapBig', tail: 'wrapLed', fog: true, drl: false, sharkfin: false },
    colors: ['#f4f4f0', '#111215', '#b8141c', '#d4d7dc', '#1c3e75', '#e5b81b', '#234a3c'],
  },
  {
    id: 'ae86', make: 'Toyota', model: 'Sprinter Trueno', name: 'Sprinter Trueno (AE86)', years: '1983–1987', code: 'AE86',
    featured: true, glb: null,
    dims: { L: 4.205, W: 1.625, H: 1.335, WB: 2.40, fOH: 0.89, clear: 0.14 },
    body: { hoodY: 0.85, trunkY: 0.91, beltY: 0.90, beltRise: 0.02, noseDrop: 0.19, tailDrop: 0.04,
            rg: [0.09, 0.22], ws: [0.51, 0.70], roofRatio: 0.76 },
    tire: { width: 195, aspect: 55, rim: 15 },
    style: { head: 'slim', grille: 'slot', lower: 'wideSlot', tail: 'slimBar', fog: true, drl: false, sharkfin: false },
    colors: ['#f5f5f2', '#0d0e11', '#9e1219', '#c4c7cb', '#1d3b6e'],
  },
  {
    id: 'skyline-r34', make: 'Nissan', model: 'Skyline GT-R', name: 'Skyline GT-R (BNR34)', years: '1999–2002', code: 'R34',
    featured: true, glb: null,
    dims: { L: 4.60, W: 1.785, H: 1.36, WB: 2.665, fOH: 0.94, clear: 0.13 },
    body: { hoodY: 0.92, trunkY: 0.98, beltY: 0.94, beltRise: 0.03, noseDrop: 0.20, tailDrop: 0.05,
            rg: [0.15, 0.28], ws: [0.53, 0.72], roofRatio: 0.75 },
    tire: { width: 245, aspect: 40, rim: 18 },
    style: { head: 'angularLed', grille: 'slotThin', lower: 'trapMesh', tail: 'tallClear', fog: false, drl: true, sharkfin: false },
    colors: ['#16479e', '#f4f4f0', '#b8bcc2', '#111216', '#9e1219', '#c7a23b', '#4d3b6b'],
  },
  {
    id: 'rx7-fd', make: 'Mazda', model: 'RX-7', name: 'RX-7 (FD3S)', years: '1991–2002', code: 'FD3S',
    featured: true, glb: null,
    dims: { L: 4.285, W: 1.76, H: 1.23, WB: 2.425, fOH: 0.93, clear: 0.12 },
    body: { hoodY: 0.81, trunkY: 0.88, beltY: 0.84, beltRise: 0.03, noseDrop: 0.21, tailDrop: 0.05,
            rg: [0.09, 0.23], ws: [0.46, 0.67], roofRatio: 0.70 },
    tire: { width: 235, aspect: 45, rim: 17 },
    style: { head: 'slim', grille: 'slimUpper', lower: 'hexBig', tail: 'slimBar', fog: true, drl: true, sharkfin: false },
    colors: ['#e5b81b', '#b8141c', '#f4f4f0', '#111215', '#1b4785', '#c4c7cb'],
  },
  {
    id: 'jazz-gk', make: 'Honda', model: 'Jazz', name: 'Jazz GK (Fit RS)', years: '2014–2020', code: 'GK5',
    featured: true, glb: null,
    dims: { L: 3.995, W: 1.695, H: 1.525, WB: 2.53, fOH: 0.78, clear: 0.145 },
    body: { hoodY: 0.96, trunkY: 1.04, beltY: 0.98, beltRise: 0.05, noseDrop: 0.24, tailDrop: 0.04,
            rg: [0.05, 0.17], ws: [0.58, 0.77], roofRatio: 0.76 },
    tire: { width: 195, aspect: 50, rim: 16 },
    style: { head: 'angularLed', grille: 'slotThin', lower: 'trapBig', tail: 'tallClear', fog: true, drl: true, sharkfin: true },
    colors: ['#f5f5f2', '#e4572e', '#e5b81b', '#2f6db5', '#111215', '#b8141c', '#c4c7cb'],
  },
  {
    id: 'dmax', make: 'Isuzu', model: 'D-Max', name: 'D-Max (สายซิ่งไทย)', years: '2020–ปัจจุบัน', code: 'RG01',
    featured: true, glb: null,
    dims: { L: 5.10, W: 1.87, H: 1.68, WB: 3.125, fOH: 0.94, clear: 0.21 },
    body: { hoodY: 1.18, trunkY: 1.14, beltY: 1.16, beltRise: 0.02, noseDrop: 0.22, tailDrop: 0.03,
            rg: [0.34, 0.41], ws: [0.64, 0.80], roofRatio: 0.77 },
    tire: { width: 265, aspect: 60, rim: 18 },
    style: { head: 'slim', grille: 'barWide', lower: 'hexBig', tail: 'tallClear', fog: true, drl: true, sharkfin: true },
    colors: ['#f4f4f0', '#2b2e33', '#153a6e', '#a5121c', '#c7cacf', '#0d0e11', '#d95326'],
  },
];

export const PAINT_FINISHES = [
  { id: 'gloss', name: 'เงา (Solid)' },
  { id: 'metallic', name: 'เมทัลลิก' },
  { id: 'pearl', name: 'มุก (Pearl)' },
  { id: 'candy', name: 'แคนดี้' },
  { id: 'chameleon', name: 'แปรงสี (Chameleon)' },
  { id: 'flake', name: 'เกล็ดเมทัลลิกหยาบ' },
  { id: 'satin', name: 'ซาติน' },
  { id: 'matte', name: 'ด้าน (Matte)' },
  { id: 'chrome', name: 'โครม' },
];

// Livery (stripes, two-tone…) is painted in the shader in car space — see materials.js. Order = shader branch index.
export const LIVERIES = [
  { id: 'none', name: 'ไม่ติดลาย' },
  { id: 'twin', name: 'คาดคู่กลางคัน (Racing)' },
  { id: 'center', name: 'คาดเส้นใหญ่กลางคัน' },
  { id: 'side', name: 'เส้นข้างตัว' },
  { id: 'twinSide', name: 'เส้นข้างคู่' },
  { id: 'slant', name: 'ลายเฉียง (Swoosh)' },
  { id: 'rocker', name: 'ทูโทนช่วงล่าง' },
  { id: 'fade', name: 'ไล่สีท้ายคัน' },
];
// colour presets for stripes / accents
export const LIVERY_COLORS = ['#ffffff', '#0c0c0e', '#c8102e', '#ff5a1f', '#ffb000', '#f5e050', '#00a86b', '#00b5c8', '#1e90ff', '#6a3fb5', '#ff4fa3', '#a8adb3'];

export const EXTRA_COLORS = [
  '#ffffff', '#e9e9e9', '#a8adb3', '#3a3d42', '#000000', '#c8102e', '#ff5a1f', '#ffb000',
  '#f5e050', '#7ed957', '#00a86b', '#00b5c8', '#1e90ff', '#2337a8', '#6a3fb5', '#ff4fa3',
  '#8b5a2b', '#d4af37', '#b87333', '#4b5320',
];

// Wheel styles. `glb` lets you drop in a real wheel model (see README).
export const WHEEL_STYLES = [
  { id: 'oem', name: 'ล้อเดิมติดรถ (OEM)', brand: 'OEM' },
  { id: 'cover', name: 'กระทะ + ฝาครอบ', brand: 'OEM' },
  { id: 'spoke5', name: '5 ก้านตรง', brand: 'Generic' },
  { id: 'spoke6', name: '6 ก้านสนาม (Forged)', brand: 'Generic' },
  { id: 'split5', name: '5 ก้านคู่ (10 ก้าน)', brand: 'Generic' },
  { id: 'mesh', name: 'ก้านไขว้ (Mesh)', brand: 'Generic' },
  { id: 'multi', name: 'ก้านถี่ 15 ก้าน', brand: 'Generic' },
  { id: 'yspoke', name: 'Y-Spoke', brand: 'Generic' },
  { id: 'dish', name: 'ขอบลึก (Deep Dish)', brand: 'Generic' },
  { id: 'aero', name: 'จานบิน (Aero Disc)', brand: 'Generic' },
  { id: 'turbo', name: 'ใบพัด (Turbofan)', brand: 'Generic' },
  { id: 'model', name: '6 ก้านคู่ — ล้อโมเดล 3D จริง', brand: 'โมเดล 3D', fromGen: 'gen2' },
  // Real-model alloys (each .glb is pre-oriented, centred and tire-free; see DECISIONS.md)
  { id: 'm-enkei-rpf1', name: 'Enkei RPF1', brand: 'Enkei', glb: 'models/wheels/enkei-rpf1.glb', credit: 'astrubal' },
  { id: 'm-enkei-nt03m', name: 'Enkei NT03+M', brand: 'Enkei', glb: 'models/wheels/enkei-nt03m.glb', credit: 'flathat3d' },
  { id: 'm-rays-te37', name: 'Rays Volk TE37', brand: 'Rays', glb: 'models/wheels/rays-te037.glb', credit: 'dermaks' },
  { id: 'm-work-cr-kai', name: 'Work Emotion CR-Kai', brand: 'Work', glb: 'models/wheels/work-cr-kai.glb', credit: 'gordeykomark' },
  { id: 'm-meister-s1', name: 'Meister S1 3P', brand: 'Meister', glb: 'models/wheels/meister-s1-3p.glb', credit: 'alexanderlyreo' },
];

export const WHEEL_FINISHES = [
  { id: 'silver', name: 'บรอนซ์เงิน', color: '#c9ccd1', metal: 0.85, rough: 0.3 },
  { id: 'gunmetal', name: 'ไฮเปอร์ดำ (Gunmetal)', color: '#4a4d52', metal: 0.9, rough: 0.28 },
  { id: 'black', name: 'ดำเงา', color: '#0c0c0e', metal: 0.3, rough: 0.2 },
  { id: 'matteblack', name: 'ดำด้าน', color: '#151517', metal: 0.2, rough: 0.75 },
  { id: 'white', name: 'ขาว', color: '#f2f2f2', metal: 0.1, rough: 0.3 },
  { id: 'bronze', name: 'บรอนซ์ทอง', color: '#8a6a3c', metal: 0.85, rough: 0.35 },
  { id: 'gold', name: 'ทอง', color: '#c7a14a', metal: 1, rough: 0.2 },
  { id: 'chrome', name: 'โครม', color: '#f0f0f0', metal: 1, rough: 0.04 },
  { id: 'red', name: 'แดง', color: '#b0121c', metal: 0.3, rough: 0.3 },
  { id: 'custom', name: 'สีกำหนดเอง', color: null, metal: 0.6, rough: 0.3 },
];

export const FILM_TYPES = [
  { id: 'black', name: 'ดำ', color: '#0a0b0d', metal: 0.05 },
  { id: 'charcoal', name: 'เทาชาร์โคล', color: '#2a2d31', metal: 0.1 },
  { id: 'green', name: 'เขียว', color: '#0f2b1d', metal: 0.05 },
  { id: 'blue', name: 'น้ำเงิน', color: '#0d1a33', metal: 0.15 },
  { id: 'silver', name: 'ปรอท / สะท้อน', color: '#7c858f', metal: 0.95 },
  { id: 'bronze', name: 'บรอนซ์', color: '#3a2a19', metal: 0.4 },
  { id: 'clear', name: 'ใส (กันร้อน)', color: '#b8c4cc', metal: 0.05 },
];

export const KIT = {
  front: [
    { id: 'oem', name: 'กันชนเดิม' },
    { id: 'lip', name: 'ลิ้นหน้า (Lip)' },
    { id: 'splitter', name: 'สปลิตเตอร์ + แคนาร์ด' },
    { id: 'full', name: 'ชุดแต่งรอบคันหน้า (สเกิร์ตหนา)' },
  ],
  side: [
    { id: 'none', name: 'เดิม' },
    { id: 'skirt', name: 'สเกิร์ตข้าง' },
    { id: 'skirtBig', name: 'สเกิร์ตข้างหนา + ลิ้น' },
  ],
  rear: [
    { id: 'none', name: 'เดิม' },
    { id: 'lip', name: 'ลิ้นหลัง' },
    { id: 'diffuser', name: 'ดิฟฟิวเซอร์ครีบ' },
  ],
  fender: [
    { id: 'none', name: 'ซุ้มเดิม' },
    { id: 'flare', name: 'คิ้วซุ้มบาง (Flare)' },
    { id: 'overfender', name: 'โป่งล้อ (Over-fender)' },
    { id: 'wide', name: 'ไวด์บอดี้ (Widebody)' },
  ],
  hoodMod: [
    { id: 'none', name: 'เรียบ' },
    { id: 'vents', name: 'ช่องระบายความร้อน' },
    { id: 'louver', name: 'ครีบระบายอากาศ' },
    { id: 'scoop', name: 'สกู๊ปดูดอากาศ' },
  ],
  spoiler: [
    { id: 'none', name: 'ไม่มี' },
    { id: 'lip', name: 'สปอยเลอร์ลิ้นฝาท้าย' },
    { id: 'ducktail', name: 'Ducktail (ท้ายเป็ด)' },
    { id: 'wing', name: 'สปอยเลอร์ยกขา' },
    { id: 'gtwing', name: 'GT Wing (สนาม)' },
  ],
  exhaust: [
    { id: 'oem', name: 'ท่อเดิม (ซ่อน)' },
    { id: 'single', name: 'ปลายเดี่ยว' },
    { id: 'dual', name: 'ปลายคู่ข้างเดียว' },
    { id: 'split', name: 'ออกสองข้าง' },
    { id: 'quad', name: '4 ปลาย' },
  ],
  exhaustFinish: [
    { id: 'chrome', name: 'โครม' },
    { id: 'burnt', name: 'ไทเทเนียมไหม้' },
    { id: 'black', name: 'ดำ' },
    { id: 'carbon', name: 'คาร์บอน' },
  ],
  partColor: [
    { id: 'body', name: 'สีเดียวกับตัวรถ' },
    { id: 'black', name: 'ดำเงา' },
    { id: 'matte', name: 'ดำด้าน' },
    { id: 'carbon', name: 'คาร์บอนแท้' },
  ],
  hood: [
    { id: 'body', name: 'สีตัวรถ' },
    { id: 'carbon', name: 'ฝากระโปรงคาร์บอน' },
    { id: 'matte', name: 'ดำด้าน' },
  ],
  roof: [
    { id: 'body', name: 'สีตัวรถ' },
    { id: 'black', name: 'หลังคาดำ (ทูโทน)' },
    { id: 'carbon', name: 'คาร์บอน' },
    { id: 'custom', name: 'สีกำหนดเอง' },
  ],
  mirror: [
    { id: 'body', name: 'สีตัวรถ' },
    { id: 'black', name: 'ดำเงา' },
    { id: 'carbon', name: 'คาร์บอน' },
    { id: 'chrome', name: 'โครม' },
  ],
};

// Optional GLB add-ons (body parts from any brand). Each entry is attached to the
// car at `pos` (meters, car space: +x front, +y up, +z right). See README.
export const ADDONS = [
  // { id: 'my-wing', name: 'วิงแบรนด์ X', glb: 'models/parts/wing.glb', pos: [-2.0, 1.15, 0], rot: [0, 0, 0], scale: 1 },
];

export const PLATE_STYLES = [
  { id: 'white', name: 'ป้ายขาว (ปกติ)', bg: '#f7f7f2', fg: '#111' },
  { id: 'gold', name: 'ป้ายประมูล (ทอง)', bg: '#e9cf7a', fg: '#1a1a1a' },
  { id: 'graphic', name: 'ป้ายกราฟิก', bg: 'linear', fg: '#111' },
  { id: 'none', name: 'ไม่ติดป้าย', bg: null, fg: null },
];

export const DEFAULT_BUILD = {
  name: 'คันแรกของฉัน',
  gen: 'gen2',
  paint: { color: '#3d4f63', finish: 'metallic', roof: 'body', roofColor: '#0d0e11', hood: 'body', mirror: 'body',
           livery: 'none', liveryColor: '#ffffff', livery2: '#c8102e', liveryW: 0.5, numberOn: false, number: '86', numberBg: '#ffffff', numberFg: '#111111' },
  wheels: { style: 'oem', brand: 'oem', rim: 15, rimWidth: 6.0, tireWidth: 185, aspect: 60, offset: 45, spacer: 0, camber: 0,
            finish: 'silver', color: '#c9ccd1', lip: false, caliper: '#3a3a3a', bigBrake: false,
            tireType: 'comfort', tireBrand: 'generic', tireLetters: 'black' },
  glass: { windshield: 40, windshieldFilm: 'black', side: 60, sideFilm: 'black', rear: 60, rearFilm: 'black', visor: false },
  kit: { front: 'oem', side: 'none', rear: 'none', fender: 'none', spoiler: 'none', exhaust: 'oem',
         exhaustFinish: 'chrome', partColor: 'body', sharkfin: true, hoodMod: 'none', canard: false, towHook: false },
  lights: { head: false, headTint: 'clear', tailTint: 'red', underglow: 'none', underglowColor: '#00c8ff' },
  suspension: { type: 'oem', drop: 0, dropRear: 0, linked: true, damping: 8, spring: 2.5, airUp: false },
  plate: { style: 'white', line1: 'กข 1234', line2: 'กรุงเทพมหานคร' },
  addons: [],
  kitPackage: null,
  engine: JSON.parse(JSON.stringify(DEFAULT_ENGINE)), // swap, performance parts and the player's tune
};

// Brand / style kit packages. Applying one sets several options at once.
// Geometry is the game's generic parts arranged to match each kit's known content —
// not a copy of the brand's actual design. `verified` = the kit for Vios is confirmed by a source.
export const KIT_PACKAGES = [
  {
    id: 'trd-sportivo-gen2', name: 'TRD Sportivo (Vios Gen 2)', brand: 'TRD', origin: 'ญี่ปุ่น', year: '2009', gens: ['gen2', 'gen2-fl'], verified: true,
    desc: 'ชุดแต่งทางการของ Toyota Racing Development ขายใน SEA: ลิ้นหน้าโอบไฟตัดหมอก, สเกิร์ตข้าง, กันชนหลังล่างสีดำ, สปอยเลอร์ท้ายเป็ด, ล้อ 10 ก้านสีไฮเปอร์ดำ (Enkei ผลิต), โช้ค TRD เตี้ยลงเล็กน้อย',
    source: { title: 'AutoIndustriya — 2009 Toyota Vios TRD Sportivo', url: 'https://www.autoindustriya.com/car-reviews/2009-toyota-vios-trd-sportivo.html' },
    apply: { kit: { front: 'lip', side: 'skirt', rear: 'lip', fender: 'none', spoiler: 'ducktail', exhaust: 'single', exhaustFinish: 'chrome', partColor: 'body' },
             wheels: { style: 'split5', brand: 'enkei', rim: 15, rimWidth: 6.5, tireWidth: 195, aspect: 55, offset: 40, finish: 'gunmetal', lip: false }, suspension: { type: 'lowering', drop: 10, dropRear: 10 }, glass: { visor: true } },
  },
  {
    id: 'trd-sportivo-th15', name: 'TRD Sportivo Thailand (Gen 3)', brand: 'TRD', origin: 'ญี่ปุ่น', year: '2015', gens: ['gen3', 'gen3-fl1', 'gen3-fl2'], verified: true,
    desc: 'รุ่นขายในไทย: ล้อ 15" ยาง 185/60, กาบกันชนหน้า/หลัง, สเกิร์ตข้าง, คิ้วกระจังหน้าดำ, ไฟ LED กลางวัน, ปลายท่อชุบ และสติกเกอร์ดำ-แดงจากไฟหน้าถึงประตู',
    source: { title: 'paultan.org — Vios TRD Sportivo introduced in Thailand', url: 'https://paultan.org/2015/05/15/new-toyota-vios-trd-sportivo-introduced-in-thailand' },
    apply: { kit: { front: 'lip', side: 'skirt', rear: 'lip', fender: 'none', spoiler: 'lip', exhaust: 'single', exhaustFinish: 'chrome', partColor: 'body' },
             wheels: { style: 'spoke6', rim: 15, rimWidth: 6.0, tireWidth: 185, offset: 40, finish: 'gunmetal', lip: false }, suspension: { type: 'oem', drop: 0, dropRear: 0 }, lights: { headTint: 'clear' } },
  },
  {
    id: 'gr-sport', name: 'GR Sport / GR-S (Gen 3 MC2)', brand: 'Toyota GAZOO Racing', origin: 'ญี่ปุ่น', year: '2020', gens: ['gen3-fl2'], verified: true,
    desc: 'กันชนหน้าแนว GR Yaris, สเกิร์ตข้าง, กันชนหลังพร้อมดิฟฟิวเซอร์, สปอยเลอร์ฝาท้ายสีดำ, ล้อดำ 17" (มาเลเซีย) / 16" (ฟิลิปปินส์) และช่วงล่างสปอร์ต',
    source: { title: 'The Vibes — Toyota Vios GR-S launched', url: 'https://www.thevibes.com/index.php/articles/lifestyles/10334/toyota-vios-gr-s-launched-for-christmas' },
    apply: { kit: { front: 'full', side: 'skirt', rear: 'diffuser', fender: 'none', spoiler: 'ducktail', exhaust: 'single', exhaustFinish: 'black', partColor: 'black' },
             wheels: { style: 'spoke5', rim: 17, rimWidth: 7.0, tireWidth: 205, offset: 40, finish: 'black', lip: false }, suspension: { type: 'lowering', drop: 15, dropRear: 15 } },
  },
  {
    id: 'modellista-gen4', name: 'Modellista (Gen 4 / Yaris ATIV)', brand: 'Toyota Modellista', origin: 'ญี่ปุ่น', year: '2022', gens: ['gen4'], verified: true,
    desc: 'จาก Toyota Modellista Thailand (งาน Motor Expo 2022): กันชนหน้าดีไซน์ใหม่, สเกิร์ตข้าง, ดิฟฟิวเซอร์หลัง, ล้อ Modellista 17", สปอยเลอร์ฝาท้ายดำเงา — ราคาแพ็ก 48,500 บาท',
    source: { title: 'TopGear PH — Vios with Modellista parts', url: 'https://www.topgear.com.ph/news/car-news/toyota-vios-2023-modeliista-a962-20221209' },
    apply: { kit: { front: 'full', side: 'skirt', rear: 'diffuser', fender: 'none', spoiler: 'lip', exhaust: 'oem', exhaustFinish: 'chrome', partColor: 'body' },
             wheels: { style: 'multi', rim: 17, rimWidth: 7.0, tireWidth: 205, offset: 40, finish: 'gunmetal', lip: false }, suspension: { type: 'oem', drop: 0, dropRear: 0 } },
  },
  {
    id: 'terstudio-2017', name: 'Ter Studio (Gen 3 MC 2017)', brand: 'TERstudio', origin: 'ไทย', year: '2017', gens: ['gen3-fl1', 'gen3-fl2'], verified: true,
    desc: 'สำนักแต่งไทย: สเกิร์ตหน้า, สเกิร์ตข้าง, สเกิร์ตหลังพร้อมช่องท่อคู่, สติกเกอร์เส้นแดงคาดดำ และล้อใหญ่ยางแก้มเตี้ย',
    source: { title: 'IndianAutosBlog — 2017 Toyota Vios gets Ter Studio body kit', url: 'https://indianautosblog.com/2017-toyota-vios-gets-ter-studio-body-kit-p266823' },
    apply: { kit: { front: 'lip', side: 'skirt', rear: 'lip', fender: 'none', spoiler: 'none', exhaust: 'split', exhaustFinish: 'chrome', partColor: 'black' },
             wheels: { style: 'spoke5', rim: 17, rimWidth: 7.0, tireWidth: 205, offset: 38, finish: 'black', lip: false }, suspension: { type: 'lowering', drop: 25, dropRear: 25 } },
  },
  {
    id: 'drive68', name: 'Drive68 (แนวชุดแต่ง)', brand: 'Drive68 / TERstudio', origin: 'ไทย', year: '2020+', gens: null, verified: false,
    desc: 'แบรนด์ในเครือ TERstudio ทำให้เก๋งญี่ปุ่นหลายรุ่น (City, Almera, Altis, Yaris): สเกิร์ตรอบคันให้ดูเตี้ย, ครอบไฟตัดหมอก, คาดเส้นแดง, ดิฟฟิวเซอร์ + ท่อคู่ — ยังไม่พบข้อมูลรุ่นสำหรับ Vios โดยตรง',
    source: { title: 'WapCar — Drive68 body kit (TERstudio)', url: 'https://www.wapcar.my/news/if-the-2021-toyota-yaris-looks-too-tame-for-you-drive68-will-aggressivefy-it-for-you-7525' },
    apply: { kit: { front: 'full', side: 'skirtBig', rear: 'diffuser', fender: 'none', spoiler: 'lip', exhaust: 'dual', exhaustFinish: 'chrome', partColor: 'black' },
             wheels: { style: 'mesh', rim: 17, rimWidth: 7.5, tireWidth: 205, offset: 35, finish: 'gunmetal', lip: false }, suspension: { type: 'lowering', drop: 30, dropRear: 30 } },
  },
  {
    id: 'amotriz', name: 'Amotriz (แนวชุดแต่ง)', brand: 'Amotriz', origin: 'ไทย', year: '—', gens: null, verified: false,
    desc: 'สำนักไทยที่ออกแบบด้วยสแกน 3 มิติ ติดด้วยเทปกาวไม่ต้องเจาะ ชุดเก๋งมักมี สเกิร์ตหน้า (บางรุ่นมีไฟ DRL), สเกิร์ตข้าง, สเกิร์ตหลัง และสปอยเลอร์ท้ายเป็ด — ยังไม่พบข้อมูลรุ่นสำหรับ Vios โดยตรง',
    source: { title: 'Cartoq — Amotriz body kit (Ciaz)', url: 'https://www.cartoq.com/maruti-ciaz-body-kit/' },
    apply: { kit: { front: 'lip', side: 'skirt', rear: 'lip', fender: 'none', spoiler: 'ducktail', exhaust: 'oem', exhaustFinish: 'chrome', partColor: 'body' },
             wheels: { style: 'yspoke', rim: 16, rimWidth: 7.0, tireWidth: 195, offset: 40, finish: 'silver', lip: false }, suspension: { type: 'lowering', drop: 20, dropRear: 20 } },
  },
  // ---- street styles (not brands) ----
  {
    id: 'style-vip', name: 'สาย VIP (สไตล์)', brand: 'สไตล์แต่ง', origin: 'สไตล์', gens: null, verified: null,
    desc: 'แต่งหรูเตี้ยแบบ VIP ญี่ปุ่น: ล้อขอบลึกโครม, โหลดเตี้ย, แคมเบอร์, ฟิล์มเข้ม, กันสาด',
    apply: { kit: { front: 'lip', side: 'skirt', rear: 'lip', fender: 'none', spoiler: 'none', exhaust: 'dual', exhaustFinish: 'chrome', partColor: 'body' },
             wheels: { style: 'dish', brand: 'work', rim: 17, rimWidth: 8.5, tireWidth: 215, offset: 30, camber: -3, finish: 'chrome', lip: true }, suspension: { type: 'coilover', drop: 60, dropRear: 60 }, glass: { side: 80, rear: 80, visor: true } },
  },
  {
    id: 'style-timeattack', name: 'สายสนาม / Time Attack (สไตล์)', brand: 'สไตล์แต่ง', origin: 'สไตล์', gens: null, verified: null,
    desc: 'แนวรถแข่ง: สปลิตเตอร์คาร์บอน, โป่งล้อ, GT Wing, ดิฟฟิวเซอร์, ล้อ 6 ก้านสนาม, เบรกใหญ่',
    apply: { kit: { front: 'splitter', side: 'skirtBig', rear: 'diffuser', fender: 'overfender', spoiler: 'gtwing', exhaust: 'single', exhaustFinish: 'burnt', partColor: 'carbon', hoodMod: 'vents', canard: true },
             wheels: { style: 'spoke6', brand: 'rays', rim: 17, rimWidth: 8.5, tireWidth: 225, tireType: 'semislick', offset: 25, camber: -2.5, finish: 'white', lip: false, bigBrake: true, caliper: '#ffb000' }, suspension: { type: 'coilover', drop: 45, dropRear: 45 } },
  },
  {
    id: 'style-drift', name: 'สายดริฟต์ (สไตล์)', brand: 'สไตล์แต่ง', origin: 'สไตล์', gens: null, verified: null,
    desc: 'รถดริฟต์สไตล์ญี่ปุ่น: ลายเฉียงส้ม-ขาว เลขแข่งที่ประตู, ซุ้มบางโป่งนิดๆ, ฝากระโปรงเจาะช่องระบายความร้อน, ปีกยกขา, ท่อไทเทเนียมไหม้, ล้อ 10 ก้านบรอนซ์ แคมเบอร์หลังกด',
    apply: { kit: { front: 'lip', side: 'skirtBig', rear: 'lip', fender: 'flare', spoiler: 'wing', exhaust: 'dual', exhaustFinish: 'burnt', partColor: 'black', hoodMod: 'vents', towHook: true },
             wheels: { style: 'split5', brand: 'work', rim: 17, rimWidth: 8.5, tireWidth: 225, tireType: 'semislick', offset: 22, camber: -4, finish: 'bronze', lip: false }, suspension: { type: 'coilover', drop: 55, dropRear: 55 },
             paint: { livery: 'slant', liveryColor: '#ff5a1f', livery2: '#ffffff', liveryW: 0.55, numberOn: true, number: '86', numberBg: '#ffffff', numberFg: '#111111' } },
  },
  {
    id: 'style-rally', name: 'สายแรลลี่ (สไตล์)', brand: 'สไตล์แต่ง', origin: 'สไตล์', gens: null, verified: null,
    desc: 'แรลลี่สายลุย: สกู๊ปฝากระโปรง, ซุ้มโป่งหมุดย้ำ, ปีกยกขา, ห่วงลากจูง, เส้นข้างคู่ + เลขแข่ง, ล้อก้านไขว้ขาว ช่วงล่างสูงกว่าสายสนาม',
    apply: { kit: { front: 'lip', side: 'skirt', rear: 'lip', fender: 'overfender', spoiler: 'wing', exhaust: 'single', exhaustFinish: 'black', partColor: 'black', hoodMod: 'scoop', towHook: true, canard: false },
             wheels: { style: 'mesh', brand: 'enkei', rim: 16, rimWidth: 7.5, tireWidth: 205, tireType: 'comfort', offset: 30, camber: -1, finish: 'white', lip: false }, suspension: { type: 'lowering', drop: 15, dropRear: 15 },
             paint: { livery: 'twinSide', liveryColor: '#ffd400', liveryW: 0.7, numberOn: true, number: '7', numberBg: '#ffffff', numberFg: '#111111' } },
  },
  {
    id: 'style-stance', name: 'สายสแตนซ์ / โชว์ (สไตล์)', brand: 'สไตล์แต่ง', origin: 'สไตล์', gens: null, verified: null,
    desc: 'โหลดติดพื้นถุงลม ล้อขอบลึกโครมคว่ำหนัก ซุ้มไวด์บอดี้ เรียบหรูไม่มีปีก สีแคนดี้ลึก',
    apply: { kit: { front: 'lip', side: 'skirt', rear: 'lip', fender: 'wide', spoiler: 'ducktail', exhaust: 'dual', exhaustFinish: 'chrome', partColor: 'body', hoodMod: 'none', towHook: false, canard: false },
             wheels: { style: 'dish', brand: 'work', rim: 17, rimWidth: 8.5, tireWidth: 215, offset: 18, camber: -6, finish: 'chrome', lip: true }, suspension: { type: 'air', drop: 115, dropRear: 115 },
             paint: { finish: 'candy', livery: 'none', numberOn: false } },
  },  {
    id: 'style-oemplus', name: 'แต่งเรียบ OEM+ (สไตล์)', brand: 'สไตล์แต่ง', origin: 'สไตล์', gens: null, verified: null,
    desc: 'แต่งเนียนเหมือนออกจากโรงงาน: ลิ้นรอบคันสีเดียวกับรถ, ล้อ 16" ลายทั่วไป, โหลดนิดหน่อย, กันสาด',
    apply: { kit: { front: 'lip', side: 'skirt', rear: 'none', fender: 'none', spoiler: 'lip', exhaust: 'oem', exhaustFinish: 'chrome', partColor: 'body' },
             wheels: { style: 'multi', rim: 16, rimWidth: 6.5, tireWidth: 195, offset: 40, finish: 'silver', lip: false }, suspension: { type: 'lowering', drop: 20, dropRear: 20 }, glass: { visor: true } },
  },
];

// Brands are shown in the spec and affect driving feel; geometry/lettering stays generic.
export const WHEEL_BRANDS = [
  { id: 'oem', name: 'Toyota (ล้อเดิม)', origin: 'ญี่ปุ่น', kg: 0 },
  { id: 'generic', name: 'ไม่ระบุยี่ห้อ', origin: '—', kg: 0 },
  { id: 'lenso', name: 'Lenso', origin: 'ไทย', kg: -8 },
  { id: 'cosmis', name: 'Cosmis', origin: 'ไทย', kg: -10 },
  { id: 'enkei', name: 'Enkei', origin: 'ญี่ปุ่น', kg: -16 },
  { id: 'rays', name: 'RAYS (Volk / Gram Lights)', origin: 'ญี่ปุ่น', kg: -24 },
  { id: 'work', name: 'WORK', origin: 'ญี่ปุ่น', kg: -14 },
  { id: 'ssr', name: 'SSR', origin: 'ญี่ปุ่น', kg: -18 },
  { id: 'advan', name: 'Advan', origin: 'ญี่ปุ่น', kg: -20 },
  { id: 'weds', name: 'Weds', origin: 'ญี่ปุ่น', kg: -16 },
  { id: 'bbs', name: 'BBS', origin: 'เยอรมนี', kg: -22 },
  { id: 'oz', name: 'OZ Racing', origin: 'อิตาลี', kg: -22 },
];
// grip: lateral grip multiplier · comfort: ride softness (affects body motion a little)
export const TIRE_BRANDS = [
  { id: 'generic', name: 'ไม่ระบุยี่ห้อ', origin: '—', grip: 1.0, comfort: 1.0 },
  { id: 'bridgestone', name: 'Bridgestone', origin: 'ญี่ปุ่น', grip: 1.06, comfort: 1.0 },
  { id: 'michelin', name: 'Michelin', origin: 'ฝรั่งเศส', grip: 1.07, comfort: 1.08 },
  { id: 'yokohama', name: 'Yokohama', origin: 'ญี่ปุ่น', grip: 1.06, comfort: 1.0 },
  { id: 'toyo', name: 'Toyo', origin: 'ญี่ปุ่น', grip: 1.05, comfort: 0.98 },
  { id: 'dunlop', name: 'Dunlop', origin: 'ญี่ปุ่น', grip: 1.04, comfort: 1.02 },
  { id: 'goodyear', name: 'Goodyear', origin: 'สหรัฐฯ', grip: 1.04, comfort: 1.04 },
  { id: 'continental', name: 'Continental', origin: 'เยอรมนี', grip: 1.06, comfort: 1.05 },
  { id: 'maxxis', name: 'Maxxis', origin: 'ไต้หวัน', grip: 1.0, comfort: 1.0 },
  { id: 'nankang', name: 'Nankang', origin: 'ไต้หวัน', grip: 1.02, comfort: 0.96 },
  { id: 'deestone', name: 'Deestone', origin: 'ไทย', grip: 0.98, comfort: 1.0 },
  { id: 'otani', name: 'Otani', origin: 'ไทย', grip: 0.98, comfort: 1.0 },
];
export const SHOCK_TYPES = [
  { id: 'oem', name: 'โช้คเดิม', dropMax: 0, adjustable: false, spring: 2.5, damping: 8 },
  { id: 'lowering', name: 'สปริงโหลด + โช้คแก๊ส', dropMax: 50, adjustable: false, spring: 4, damping: 14 },
  { id: 'coilover', name: 'โช้คสตรัทปรับเกลียว (Coilover)', dropMax: 90, adjustable: true, spring: 6, damping: 16 },
  { id: 'air', name: 'ถุงลม (Air suspension)', dropMax: 130, adjustable: true, spring: 3.5, damping: 12 },
];
