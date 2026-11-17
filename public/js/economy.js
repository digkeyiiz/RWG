// Game economy — shared by the browser and the server (server.js imports this file),
// so prices and rewards can only be decided in one place. No DOM, no imports besides engine data.
import { PARTS, ENGINES } from './engine.js';

export const START_MONEY = 999999999;

// Cars you can own. The Vios is the starter car (free). Prices follow real-world desirability, not MSRP.
export const CAR_PRICES = {
  gen2: 0, 'civic-eg': 60000, 'civic-fd': 95000, 'civic-fc': 130000, 'civic-fe': 165000, 'nissan-silvia-s13': 190000, 'evo-ix': 320000,
  ae86: 180000, 'supra-a80': 450000, 'skyline-r34': 520000, 'rx7-fd': 420000, 'jazz-gk': 75000, dmax: 240000,
  'tesla-m3': 1, 'crv-2026': 1,
};

// engine swaps: power, forced induction and rarity
export function enginePrice(id) {
  const e = ENGINES.find((x) => x.id === id);
  if (!e) return null;
  return Math.round((e.hp * 420 + (e.asp === 'turbo' ? 35000 : 0) + (e.cyl >= 6 ? 40000 : 0) + (e.rotary ? 50000 : 0)) / 1000) * 1000;
}
export function partPrice(k, id) {
  const o = PARTS[k]?.opts.find((x) => x.id === id);
  if (!o) return null;
  return o.cost || 0;
}

// ownership keys: car:<gen>  |  <gen>|eng:<id>  |  <gen>|part:<k>:<id>   (parts belong to one car, like in a real garage)
export const carKey = (gen) => `car:${gen}`;
export const engKey = (gen, id) => `${gen}|eng:${id}`;
export const partKey = (gen, k, id) => `${gen}|part:${k}:${id}`;

function rawPrice(key) {
  let m = /^car:([\w-]+)$/.exec(key);
  if (m) return CAR_PRICES[m[1]] ?? null;
  m = /^([\w-]+)\|eng:([\w-]+)$/.exec(key);
  if (m) return CAR_PRICES[m[1]] === undefined ? null : enginePrice(m[2]);
  m = /^([\w-]+)\|part:(\w+):(\w+)$/.exec(key);
  if (m) return CAR_PRICES[m[1]] === undefined ? null : partPrice(m[2], m[3]);
  return null;
}
// every purchasable item costs ฿1 — price is for flavor, not progression;
// 0 stays free (auto-owned), null stays unlisted
export function priceOf(key) { const p = rawPrice(key); return p > 0 ? 1 : p; }
// free items never need to be bought (stock parts, starter car)
export const isFree = (key) => priceOf(key) === 0;

// Everything a build uses that must be owned
export function buildKeys(build) {
  const gen = build.gen, e = build.engine || {}, keys = [carKey(gen)];
  if (e.swap) keys.push(engKey(gen, e.swap));
  for (const [k, id] of Object.entries(e.parts || {})) if (id && id !== 'stock') keys.push(partKey(gen, k, id));
  return keys;
}

// ---------------- rewards ----------------
export const TRACKS = {
  touge: { len: 3453, prize: 9000 },
  city: { len: 2255, prize: 6000 },
  ring: { len: 2537, prize: 6000 },
  sprint: { len: 747, prize: 4500 },
};
// prize for finishing position `pos` (0 = winner) among `racers` real players; solo races vs bots pay less
export function racePrize(track, laps, pos, racers, bots) {
  const T = TRACKS[track];
  if (!T) return 0;
  const base = T.prize * (0.6 + 0.4 * laps);
  if (racers >= 2) return Math.round(base * (1 + 0.35 * (racers - 2)) * ([1, 0.45, 0.25, 0.12][pos] ?? 0.05) / 10) * 10;
  if (bots > 0) return Math.round(base * 0.55 * ([1, 0.4, 0.2][pos] ?? 0) * Math.min(1, bots / 5 + 0.4) / 10) * 10;
  return 0; // time trial: records only
}
export const repFor = (pos, racers) => (racers >= 2 ? [120, 60, 30][pos] ?? 15 : [40, 15, 5][pos] ?? 0);
export const PICKUP = { small: [300, 900], big: [4000, 7000] };
export const GARAGE_DISCOVERY = 3000;
export function stuntReward(pts) {
  const n = Math.min(25000, Math.max(0, Math.round(Number(pts) || 0)));
  if (n < 150) return { cash: 0, rep: 0 };
  return {
    cash: Math.min(12000, Math.max(100, Math.round((n * 0.65) / 10) * 10)),
    rep: Math.min(80, Math.max(2, Math.round(n / 120))),
  };
}
// fastest plausible average speed (m/s) — anything faster is rejected as a cheat
export const MAX_AVG_SPEED = 95;
