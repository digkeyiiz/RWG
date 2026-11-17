// Runtime game settings — editable from /admin, persisted to store/settings.json.
// rooms.js reads these live (S.get), so changes apply without a restart.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'store', 'settings.json');

const DEFAULTS = {
  worldCap: 64,        // max players per world
  lobbyMs: 20000,      // private invite wait
  openMs: 45000,       // public lobby wait
  countdownMs: 4500,   // pre-race countdown
  activeCash: 30,      // small pickups alive per world
  activeBig: 3,        // big pickups alive per world
  prizeMul: 1,         // race prize multiplier
  stuntMul: 1,         // stunt cash/rep multiplier
  tandemMul: 1.25,     // tandem-drift cash bonus (1 = off)
  tandemRadius: 35,    // meters for tandem detection
};

let cfg = { ...DEFAULTS };
try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}

const S = {
  get: (k) => cfg[k] ?? DEFAULTS[k],
  all: () => ({ ...cfg }),
  defaults: () => ({ ...DEFAULTS }),
  set(patch) {
    for (const [k, v] of Object.entries(patch || {})) {
      if (!(k in DEFAULTS)) continue;
      const n = Number(v);
      if (Number.isFinite(n)) cfg[k] = n;
    }
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2));
    } catch (e) { console.error('[settings] save error:', e.message); }
    return { ...cfg };
  },
};

module.exports = { S };
