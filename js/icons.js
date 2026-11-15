// Small inline-SVG pictograms for the tuning panel: a side view of the car with the chosen part highlighted.
// The car faces right (nose at x≈116). `hl` = highlighted part (accent colour), everything else is a dim outline.

const BODY = '<path class="car" d="M5 39 L9 31 L26 27.5 L41 14 L83 14 L99 27.5 L114 31 L118 39 Z"/><path class="glass" d="M44 17 L80 17 L92 27 L36 27 Z"/>';
const WHEELS = '<circle class="whl" cx="30" cy="40" r="8.5"/><circle class="whl" cx="92" cy="40" r="8.5"/><circle class="hub" cx="30" cy="40" r="3.2"/><circle class="hub" cx="92" cy="40" r="3.2"/>';
const svg = (inner, extra = '') => `<svg viewBox="0 0 124 56" aria-hidden="true">${BODY}${WHEELS}${inner}${extra}</svg>`;
const hl = (d) => `<path class="hl" d="${d}"/>`;
const hlc = (cx, cy, r) => `<circle class="hl" cx="${cx}" cy="${cy}" r="${r}"/>`;

export const KIT_ICONS = {
  front: {
    oem: svg(''),
    lip: svg(hl('M101 37 L119 37 L123 42 L105 43 Z')),
    splitter: svg(hl('M94 41 L124 41 L124 44 L94 44.5 Z') + hl('M108 33 L113 33 L118 36 L108 37 Z')),
    full: svg(hl('M96 29 L117 33 L121 45 L93 45 Z')),
  },
  side: {
    none: svg(''),
    skirt: svg(hl('M42 40 L80 40 L82 44.5 L40 44.5 Z')),
    skirtBig: svg(hl('M38 36.5 L84 36.5 L86 43 L82 47 L42 47 L38 43 Z')),
  },
  rear: {
    none: svg(''),
    lip: svg(hl('M3 38 L21 38 L19 43 L1 42 Z')),
    diffuser: svg(hl('M2 37 L22 37 L20 45 L0 44 Z') + '<path class="hl2" d="M6 37 V45 M10 37 V45 M14 37 V45 M18 37 V45"/>'),
  },
  fender: {
    none: svg(''),
    flare: svg('<path class="hl" style="fill:none;stroke-width:2.2" d="M19 40 A11.5 11.5 0 0 1 41 40 M81 40 A11.5 11.5 0 0 1 103 40"/>'),
    overfender: svg('<path class="hl" style="fill:none;stroke-width:4" d="M18 41 A12.5 12.5 0 0 1 42 41 M80 41 A12.5 12.5 0 0 1 104 41"/>' + hlc(21, 31, 1.1) + hlc(30, 27.6, 1.1) + hlc(39, 31, 1.1) + hlc(83, 31, 1.1) + hlc(92, 27.6, 1.1) + hlc(101, 31, 1.1)),
    wide: svg('<path class="hl" style="fill:none;stroke-width:6" d="M16 42 A14 14 0 0 1 44 42 M78 42 A14 14 0 0 1 106 42"/>' + hlc(19, 30, 1.2) + hlc(30, 25.5, 1.2) + hlc(41, 30, 1.2) + hlc(81, 30, 1.2) + hlc(92, 25.5, 1.2) + hlc(103, 30, 1.2)),
  },
  spoiler: {
    none: svg(''),
    lip: svg(hl('M3 28 L16 26 L16 28.5 L3 30 Z')),
    ducktail: svg(hl('M2 24 L8 22 L22 26 L22 29 L3 28 Z')),
    wing: svg(hl('M3 17 L20 17 L20 19.5 L3 19.5 Z') + hl('M8 19.5 L10 19.5 L10 27 L8 27 Z') + hl('M15 19.5 L17 19.5 L17 27 L15 27 Z')),
    gtwing: svg(hl('M0 8 L24 8 L24 11 L0 12 Z') + hl('M0 3 L4 3 L4 14 L0 14 Z') + hl('M6 11 L8.5 11 L8.5 27 L6 27 Z') + hl('M16 11 L18.5 11 L18.5 27 L16 27 Z')),
  },
  hoodMod: {
    none: svg(''),
    vents: svg('<path class="hl2" style="stroke-width:2.4" d="M70 22 L78 24.5 M68 25.5 L76 28 M72 18.5 L80 21"/>'),
    louver: svg('<path class="hl2" style="stroke-width:2.4" d="M66 25 L72 21 M72 27 L78 23 M78 28.5 L84 24.5 M84 29.5 L90 25.5"/>'),
    scoop: svg(hl('M62 28 L78 21 L95 25 L95 30 L62 30 Z')),
  },
};

// exhaust is shown from behind: two bumper silhouettes with the tips highlighted
const tail = (tips) => `<svg viewBox="0 0 124 56" aria-hidden="true"><path class="car" d="M18 46 L18 20 Q18 12 28 12 L96 12 Q106 12 106 20 L106 46 Z"/><path class="glass" d="M30 15 H94 L98 27 H26 Z"/><rect class="whl" x="14" y="42" width="14" height="10" rx="3"/><rect class="whl" x="96" y="42" width="14" height="10" rx="3"/>${tips}</svg>`;
const tip = (cx) => `<circle class="hl" cx="${cx}" cy="43" r="4.2"/><circle class="hole" cx="${cx}" cy="43" r="2.3"/>`;
KIT_ICONS.exhaust = {
  oem: tail(''),
  single: tail(tip(86)),
  dual: tail(tip(80) + tip(92)),
  split: tail(tip(34) + tip(90)),
  quad: tail(tip(30) + tip(40) + tip(84) + tip(94)),
};

// top-down car with stripes, for the livery tiles
const top = (inner, clip = true) => `<svg viewBox="0 0 124 56" aria-hidden="true"><defs><clipPath id="lc"><path d="M8 28 Q8 14 22 12 L92 12 Q112 14 116 28 Q112 42 92 44 L22 44 Q8 42 8 28 Z"/></clipPath></defs><path class="car" d="M8 28 Q8 14 22 12 L92 12 Q112 14 116 28 Q112 42 92 44 L22 44 Q8 42 8 28 Z"/><g clip-path="url(#lc)">${inner}</g><path class="glass" d="M70 17 L84 17 L90 28 L84 39 L70 39 L74 28 Z"/><path class="glass" d="M22 19 L36 18 L36 38 L22 37 Z"/></svg>`;
export const LIVERY_ICONS = {
  none: top(''),
  twin: top('<rect class="hl" x="0" y="23" width="124" height="4"/><rect class="hl" x="0" y="29" width="124" height="4"/>'),
  center: top('<rect class="hl" x="0" y="22.5" width="124" height="11"/>'),
  side: top('<rect class="hl" x="0" y="12" width="124" height="3"/><rect class="hl" x="0" y="41" width="124" height="3"/>'),
  twinSide: top('<rect class="hl" x="0" y="12" width="124" height="2.2"/><rect class="hl" x="0" y="16" width="124" height="1.2"/><rect class="hl" x="0" y="39" width="124" height="1.2"/><rect class="hl" x="0" y="42" width="124" height="2.2"/>'),
  slant: top('<path class="hl" d="M0 44 L0 36 L124 12 L124 21 Z"/>'),
  rocker: top('<rect class="hl" x="0" y="0" width="124" height="14"/><rect class="hl" x="0" y="42" width="124" height="14"/>'),
  fade: top('<defs><linearGradient id="lf" x1="1" x2="0"><stop offset="0" stop-color="transparent"/><stop offset="1" class="hlstop"/></linearGradient></defs><rect fill="url(#lf)" x="0" y="0" width="124" height="56"/>'),
};

export const hoodIcon = (kind) => KIT_ICONS.hoodMod[kind] || KIT_ICONS.hoodMod.none;

// paint-finish ball (CSS gradient approximating each finish, drawn in the current body colour)
export function finishStyle(id, color) {
  const base = color;
  const glossy = 'radial-gradient(circle at 32% 26%, rgba(255,255,255,.95) 0, rgba(255,255,255,.35) 14%, rgba(255,255,255,0) 34%)';
  const shade = 'radial-gradient(circle at 70% 78%, rgba(0,0,0,.55) 0, rgba(0,0,0,0) 62%)';
  switch (id) {
    case 'gloss': return `background:${glossy},${shade},${base}`;
    case 'metallic': return `background:${glossy},repeating-conic-gradient(rgba(255,255,255,.22) 0 8deg, rgba(0,0,0,.12) 8deg 16deg),${shade},${base}`;
    case 'pearl': return `background:${glossy},conic-gradient(from 20deg, rgba(255,255,255,.55), rgba(255,200,230,.35), rgba(190,230,255,.45), rgba(255,255,255,.55)),${shade},${base}`;
    case 'candy': return `background:${glossy},radial-gradient(circle at 50% 60%, rgba(255,255,255,.0) 0, rgba(0,0,0,.45) 100%),${base}`;
    case 'chameleon': return `background:${glossy},conic-gradient(from 0deg, #2dd4a8, #3a7bff, #b04cff, #ff5a8a, #ffb03a, #2dd4a8),${shade}`;
    case 'flake': return `background:${glossy},repeating-conic-gradient(rgba(255,255,255,.5) 0 3deg, rgba(0,0,0,.25) 3deg 7deg),${shade},${base}`;
    case 'satin': return `background:radial-gradient(circle at 32% 26%, rgba(255,255,255,.35) 0, rgba(255,255,255,0) 45%),${shade},${base}`;
    case 'matte': return `background:radial-gradient(circle at 40% 35%, rgba(255,255,255,.08) 0, rgba(0,0,0,.25) 100%),${base}`;
    case 'chrome': return 'background:linear-gradient(160deg,#fff 0,#9aa3ad 38%,#2b2f35 52%,#cfd6dd 70%,#fff 100%)';
    default: return `background:${base}`;
  }
}
