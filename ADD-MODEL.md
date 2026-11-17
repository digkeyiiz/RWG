# Adding a Sketchfab car model

Every GLB car in `js/catalog.js` uses the same pipeline — a `.glb` in `models/` +
a `glb` path + a `glbConfig` telling `js/glbcar.js` which nodes/materials are
wheels, paint, glass, and lights. Follow these steps per model.

## 1. Pick the model

- Sketchfab filter: **Downloadable**. License must allow use in a game:
  **CC0** or **CC-BY** are fine (CC-BY → fill `credit:` in the catalog entry).
  Avoid `NC` (non-commercial) and `ND` (no-derivatives — we split materials).
- Prefer **< ~400k triangles**. Bigger works but needs decimation in step 2.
- Models with **separate wheel meshes** are easiest — otherwise step 4 adds
  invisible wheel anchors automatically.
- Good sources seen so far: Merc_TV, Nieve5677, Ddiaz Design (Hondas),
  bagged_ls, Benit Kibabu.

## 2. Convert to a single .glb

Sketchfab downloads are `scene.gltf` + `scene.bin` + `textures/`. Pack and
compress to match the existing files (all use `EXT_meshopt_compression` —
the loader already has `MeshoptDecoder`):

```bash
npx gltfpack -i scene.gltf -o models/<car>.glb -cc -kn -km -vpf -vtf -noq
```

- `-kn` keeps node names, `-km` keeps material names (required — `glbConfig`
  references both; without `-km` gltfpack merges look-alike materials such as
  left/right headlights)
- `-vpf -vtf -noq` avoids quantization errors on cm-unit or very large models
  (plain `-vp` produced ~114% position error on a centimeter-scaled car)
- Very heavy models (>500k tris): add `-si 0.5` to simplify.

## 3. Inspect names for glbConfig

```bash
node tools/glb-inspect.mjs models/<car>.glb
```

Prints the node tree, all material names, world-space bboxes, wheel
candidates, and a `glbConfig` draft (rotY guess + biggest paint material).

## 4. Wheel anchors (only if the model has no usable wheel meshes)

```bash
node tools/glb-anchors.mjs models/<car>.glb models/<car>.glb --facing +z
# or manual: --at "x,z;x,z;x,z;x,z" (RF,LF,RR,LR centers, model space)
```

It detects wheel nodes by name, injects `WHEEL_RF/LF/RR/LR` box meshes +
an `anchor` material. Re-run `glb-inspect` to confirm.
Then set `anchorWheels: true` in `glbConfig` and list the anchors in `hide:`.

## 5. Catalog entry

Copy an existing GLB entry (e.g. `civic-eg`) and fill:

```js
glb: 'models/<car>.glb',
glbConfig: {
  rotY: Math.PI / 2,                       // nose must face +X — flip sign if backwards
  wheels: { FR: 'WHEEL_RF', FL: 'WHEEL_LF', RR: 'WHEEL_RR', RL: 'WHEEL_LR' },
  hide: ['WHEEL_RF', 'WHEEL_LF', 'WHEEL_RR', 'WHEEL_LR'],
  anchorWheels: true,
  recolor: { /* materialName: '#hex' for default-grey trim */ },
  paint: ['<body paint mats>'], windows: ['<glass mats>'],
  head: ['<headlight mats>'], tail: ['<taillight mats>'],
  mirror: ['?'], interiorMats: ['<cabin/seat/dash mats>'],
},
credit: { text: '"<title>" โดย <author> — <license>', url: '<sketchfab url>' },
dims: { L, W, H, WB, fOH, clear },         // real car dimensions (meters)
body: { ... }, tire: { ... }, style: { ... }, colors: [...],
```

`dims`/`body`/`tire`/`style`/`colors` still matter — physics, the procedural
fallback, and kit fitting all read them. `interiorMats` (material names)
excludes meshes from the kit-fitting BVH; `interior` (node names) also works
when nodes are usefully named. `scale` shrinks non-meter files (cm → 0.01).

## 6. Ship it

```bash
cp models/<car>.glb public/models/<car>.glb
node tools/glb-verify.mjs   # checks every entry: file exists, all node/material names resolve
```

Then drive it: wrong facing → flip `rotY` sign; grey trim → `recolor`;
stock wheels visible inside game wheels → add their node names to `hide:`
(or material names to `hideMats:`).
