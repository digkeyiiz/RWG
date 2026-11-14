// The player's garage: one build per car (paint, wheels, engine, tune…), saved automatically.
// Switching cars keeps every car exactly as the player left it.
const KEY = 'viosGarage.garage.v1';
const OLD_CUR = 'viosGarage.current.v1'; // pre-garage single build

export class Garage {
  constructor(mergeBuild, freshBuild) {
    this.merge = mergeBuild; this.fresh = freshBuild;
    this.data = { cur: null, cars: {}, savedAt: 0 };
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && typeof d === 'object' && d.cars) this.data = { cur: d.cur, cars: d.cars, savedAt: d.savedAt || 0 };
    } catch { /* corrupt → start fresh */ }
    if (!Object.keys(this.data.cars).length) {
      // migrate the old single "current build"
      try {
        const old = JSON.parse(localStorage.getItem(OLD_CUR));
        if (old) { const b = this.merge(old); this.data.cars[b.gen] = b; this.data.cur = b.gen; }
      } catch { /* ignore */ }
    }
    this.listeners = new Set();
    // last chance to write when the tab is hidden or closed (mobile kills tabs without warning)
    addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush(); });
  }

  onSaved(fn) { this.listeners.add(fn); }

  current() {
    const id = this.data.cur;
    return id && this.data.cars[id] ? this.merge(this.data.cars[id]) : this.fresh(id);
  }
  // build for a car: the saved one, or a fresh stock build of that car
  get(gen) { return this.data.cars[gen] ? this.merge(this.data.cars[gen]) : this.fresh(gen); }
  has(gen) { return !!this.data.cars[gen]; }
  list() { return Object.values(this.data.cars); }

  // remember this build as the car's state and as the current car; written shortly after
  put(build) {
    this.data.cars[build.gen] = JSON.parse(JSON.stringify(build));
    this.data.cur = build.gen;
    clearTimeout(this.t);
    this.t = setTimeout(() => this.flush(), 400);
  }
  remove(gen) { delete this.data.cars[gen]; this.flush(); }

  flush() {
    clearTimeout(this.t);
    try {
      this.data.savedAt = Date.now();
      localStorage.setItem(KEY, JSON.stringify(this.data));
      for (const fn of this.listeners) fn(true, this.data.savedAt);
    } catch {
      for (const fn of this.listeners) fn(false, 0); // storage full / private mode
    }
  }
}
