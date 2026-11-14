// Graphics settings: presets + individual options, saved in localStorage, applied live.
// Dynamic resolution keeps the frame rate smooth by lowering the render scale under load.
const KEY = 'viosGarage.gfx.v1';

export const PRESETS = {
  low: { scale: 0.7, prCap: 1, shadows: 'off', bloom: false, traffic: 'low', bots: 'simple', view: 'near', trees: 0.35, aa: false, dyn: true, fpsCap: 60 },
  medium: { scale: 0.85, prCap: 1.5, shadows: 'low', bloom: false, traffic: 'med', bots: 'real', view: 'mid', trees: 0.7, aa: true, dyn: true, fpsCap: 60 },
  high: { scale: 1, prCap: 1.75, shadows: 'high', bloom: true, traffic: 'med', bots: 'real', view: 'far', trees: 1, aa: true, dyn: true, fpsCap: 0 },
  ultra: { scale: 1, prCap: 2, shadows: 'ultra', bloom: true, traffic: 'high', bots: 'real', view: 'far', trees: 1.3, aa: true, dyn: false, fpsCap: 0 },
};
export const OPTIONS = {
  // controls (saved per player; not part of the graphics presets)
  steer: { section: '🎮 การควบคุม', label: 'ความไวพวงมาลัย', ctl: true, opts: [[0.7, 'นุ่มมาก'], [0.85, 'นุ่ม'], [1, 'ปกติ'], [1.15, 'ไว'], [1.3, 'ไวมาก']] },
  trans: { label: 'เกียร์', ctl: true, opts: [['auto', 'ออโต้'], ['manual', 'ธรรมดา (Shift ขึ้น / Ctrl ลง · จอย RB/LB)']] },
  assist: { label: 'ช่วยคุมรถ (กันหมุน)', ctl: true, opts: [[1, 'เปิด'], [0.5, 'เล็กน้อย'], [0, 'ปิด (โปร)']] },
  cam: { label: 'ระยะกล้อง', ctl: true, opts: [['near', 'ใกล้'], ['normal', 'ปกติ'], ['far', 'ไกล']] },
  fovKick: { label: 'มุมกล้องกว้างขึ้นตามความเร็ว', ctl: true, opts: [[true, 'เปิด'], [false, 'ปิด']] },
  preset: { section: '🖥️ กราฟิก', label: 'ระดับกราฟิก', opts: [['low', 'ต่ำ (ลื่นสุด)'], ['medium', 'กลาง'], ['high', 'สูง'], ['ultra', 'สูงสุด'], ['custom', 'กำหนดเอง']] },
  scale: { label: 'ความละเอียดภาพ', opts: [[0.6, '60%'], [0.7, '70%'], [0.85, '85%'], [1, '100%']] },
  prCap: { label: 'จอความละเอียดสูง (Retina)', opts: [[1, 'ปิด'], [1.5, '1.5x'], [1.75, '1.75x'], [2, '2x']] },
  dyn: { label: 'ปรับความละเอียดอัตโนมัติให้ลื่น', opts: [[true, 'เปิด'], [false, 'ปิด']] },
  fpsCap: { label: 'จำกัดเฟรมเรต', opts: [[30, '30 (ประหยัดแบต)'], [60, '60'], [0, 'ไม่จำกัด']] },
  shadows: { label: 'เงา', opts: [['off', 'ปิด'], ['low', 'ต่ำ'], ['high', 'สูง'], ['ultra', 'สูงสุด']] },
  bloom: { label: 'แสงฟุ้ง (Bloom)', opts: [[false, 'ปิด'], [true, 'เปิด']] },
  view: { label: 'ระยะมองเห็น', opts: [['near', 'ใกล้'], ['mid', 'กลาง'], ['far', 'ไกล']] },
  traffic: { label: 'รถบนถนน', opts: [['off', 'ไม่มี'], ['low', 'น้อย'], ['med', 'ปกติ'], ['high', 'เยอะ']] },
  bots: { label: 'หน้าตารถบนถนน', opts: [['simple', 'แบบเรียบง่าย (เบา)'], ['real', 'รุ่นจริงจากโรงรถ']] },
  trees: { label: 'ต้นไม้บนภูเขา', opts: [[0.35, 'น้อย'], [0.7, 'ปกติ'], [1, 'เยอะ'], [1.3, 'ป่าทึบ']] },
  weather: { label: 'สภาพอากาศ', ctl: true, opts: [['clear', '☀️ แจ่มใส'], ['rain', '🌧️ ฝนตก']] },
  aa: { label: 'ขอบภาพเนียน (AA)', opts: [[false, 'ปิด'], [true, 'เปิด']], reload: true },
  fps: { label: 'แสดง FPS', opts: [[false, 'ซ่อน'], [true, 'แสดง']] },
};
export const SHADOW_SIZE = { off: 0, low: 1024, high: 2048, ultra: 4096 };
export const VIEW = { near: { fog: 0.55, far: 1100 }, mid: { fog: 0.8, far: 2000 }, far: { fog: 1.15, far: 3200 } };
export const TRAFFIC = { off: [0, 0], low: [16, 6], med: [30, 10], high: [44, 16] };

const isMobile = () => matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

export const CONTROL_DEFAULTS = { steer: 1, trans: 'auto', assist: 1, cam: 'normal', fovKick: true, weather: 'clear' };
export function loadSettings() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* ignore */ }
  const preset = s?.preset && (PRESETS[s.preset] || s.preset === 'custom') ? s.preset : (isMobile() ? 'medium' : 'high');
  const base = { ...(PRESETS[preset] || PRESETS.high), fps: false, ...CONTROL_DEFAULTS };
  const out = { preset, ...base };
  if (s) for (const k of Object.keys(OPTIONS)) if (k !== 'preset' && OPTIONS[k].opts.some(([v]) => v === s[k])) out[k] = s[k];
  return out;
}

export class GfxSettings {
  constructor() { this.s = loadSettings(); this.fns = new Set(); }
  get(k) { return this.s[k]; }
  onChange(fn) { this.fns.add(fn); }
  set(k, v) {
    const prev = { ...this.s };
    if (k === 'preset') { if (v !== 'custom') Object.assign(this.s, PRESETS[v]); this.s.preset = v; }
    else { this.s[k] = v; if (k !== 'fps' && !OPTIONS[k]?.ctl) this.s.preset = 'custom'; }
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* ignore */ }
    const changed = Object.keys(this.s).filter((x) => this.s[x] !== prev[x]);
    for (const fn of this.fns) fn(changed, this.s);
    return changed;
  }
}

// Modal panel built from OPTIONS
export function settingsPanel(gfx, toast) {
  const wrap = document.createElement('div');
  wrap.id = 'gfxPanel'; wrap.hidden = true;
  wrap.innerHTML = '<div class="gfx-card"><div class="gfx-head"><b>⚙️ ตั้งค่า</b><button class="gfx-x" aria-label="ปิด">✕</button></div><div class="gfx-body"></div><div class="gfx-foot"></div></div>';
  document.body.append(wrap);
  const body = wrap.querySelector('.gfx-body'), foot = wrap.querySelector('.gfx-foot');
  const render = () => {
    body.innerHTML = '';
    for (const [k, o] of Object.entries(OPTIONS)) {
      if (o.section) { const h = document.createElement('h4'); h.className = 'gfx-sec'; h.textContent = o.section; body.append(h); }
      const row = document.createElement('div'); row.className = 'gfx-row' + (k === 'preset' ? ' main' : '');
      row.innerHTML = `<label>${o.label}${o.reload ? ' <i>(มีผลหลังรีโหลด)</i>' : ''}</label>`;
      const seg = document.createElement('div'); seg.className = 'gfx-seg';
      for (const [v, name] of o.opts) {
        if (k === 'preset' && v === 'custom' && gfx.get('preset') !== 'custom') continue;
        const b = document.createElement('button');
        b.textContent = name; b.classList.toggle('on', gfx.get(k) === v);
        b.onclick = () => { const ch = gfx.set(k, v); if (ch.includes('aa')) toast('รีโหลดหน้าเพื่อใช้ค่าขอบภาพใหม่'); render(); };
        seg.append(b);
      }
      row.append(seg); body.append(row);
    }
    foot.innerHTML = 'บันทึกอัตโนมัติ · ถ้าเกมกระตุกให้ลดกราฟิกเป็น "กลาง" หรือ "ต่ำ"<br>คีย์บอร์ด: W/S/A/D หรือลูกศร · Space เบรกมือ · N ไนตรัส · E เข้าอู่/เปิดแข่ง · C ท้าแข่ง · J รับคำเชิญ · M แผนที่ · R กลับเข้าถนน<br>จอย (Xbox/PS): สติ๊กซ้ายเลี้ยว · RT เร่ง · LT เบรก · A เบรกมือ · B ไนตรัส · X เข้าอู่ · Y กลับเข้าถนน · RB/LB เปลี่ยนเกียร์';
  };
  wrap.querySelector('.gfx-x').onclick = () => { wrap.hidden = true; };
  wrap.onclick = (e) => { if (e.target === wrap) wrap.hidden = true; };
  return { open: () => { render(); wrap.hidden = false; }, el: wrap };
}

// Frame pacing + dynamic resolution + FPS counter
export class FrameGovernor {
  constructor(renderer, gfx, el) {
    this.r = renderer; this.gfx = gfx; this.el = el;
    this.k = 1; this.acc = 0; this.frames = 0; this.t = 0; this.fps = 60; this.last = performance.now(); this.slow = 0; this.fast = 0;
    this.apply();
  }
  pixelRatio() { return Math.min(devicePixelRatio || 1, this.gfx.get('prCap')) * this.gfx.get('scale') * (this.gfx.get('dyn') ? this.k : 1); }
  apply() { this.r.setPixelRatio(Math.max(0.4, this.pixelRatio())); }
  // returns false when this frame should be skipped (fps cap)
  tick(now) {
    const cap = this.gfx.get('fpsCap');
    const dt = now - this.last;
    if (cap && dt < 1000 / cap - 2) return false;
    this.last = now;
    this.frames++; this.t += dt;
    if (this.t >= 1000) {
      this.fps = (this.frames * 1000) / this.t; this.frames = 0; this.t = 0;
      if (this.el) { this.el.hidden = !this.gfx.get('fps'); this.el.textContent = `${Math.round(this.fps)} FPS · ${Math.round(this.pixelRatio() * 100) / 100}x`; }
      if (this.gfx.get('dyn') && !document.hidden) {
        const target = cap || 60;
        if (this.fps < target * 0.82) { this.slow++; this.fast = 0; } else if (this.fps > target * 0.95) { this.fast++; this.slow = 0; } else { this.slow = this.fast = 0; }
        if (this.slow >= 2 && this.k > 0.55) { this.k = Math.max(0.55, this.k - 0.1); this.apply(); this.slow = 0; }
        if (this.fast >= 4 && this.k < 1) { this.k = Math.min(1, this.k + 0.05); this.apply(); this.fast = 0; }
      }
    }
    return true;
  }
}
