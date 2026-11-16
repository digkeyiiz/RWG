// Customization panel (Thai UI). Calls onChange(section) after mutating the build.
import * as THREE from 'three';
import { GENERATIONS, PAINT_FINISHES, EXTRA_COLORS, WHEEL_STYLES, WHEEL_FINISHES, FILM_TYPES, KIT, PLATE_STYLES, ADDONS, DEFAULT_BUILD, KIT_PACKAGES, WHEEL_BRANDS, TIRE_BRANDS, SHOCK_TYPES, LIVERIES, LIVERY_COLORS, EXHAUST_SOUNDS, SMOKE_COLORS } from './catalog.js';
import { RIMS, RIM_WIDTHS, TIRE_WIDTHS, ASPECTS, TIRE_SIZES, TIRE_TYPES, autoAspect, buildWheel } from './wheels.js';
import { normalizeEngine, computePerf, simulateRun, ENGINES, PARTS, carSpec, engineById } from './engine.js';
import { priceOf, carKey, engKey, partKey, buildKeys } from './economy.js';
import { KIT_ICONS, LIVERY_ICONS, finishStyle } from './icons.js';
import { Thumbs } from './thumbs.js';
import { getWheelModel } from './glbcar.js';

const TABS = [
  { id: 'gen', icon: '🚗', name: 'อู่/รุ่นรถ' },
  { id: 'paint', icon: '🎨', name: 'สี/ลาย' },
  { id: 'wheels', icon: '⚙️', name: 'ล้อ/ยาง' },
  { id: 'kit', icon: '🛠️', name: 'ชุดแต่ง' },
  { id: 'glass', icon: '💡', name: 'กระจก/ไฟ' },
  { id: 'suspension', icon: '⬇️', name: 'ช่วงล่าง' },
  { id: 'engine', icon: '🔥', name: 'เครื่อง' },
  { id: 'save', icon: '💾', name: 'ป้าย/เก็บ' },
];

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};

const RECENT_KEY = 'viosGarage.recentColors.v1';
const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
const pushRecent = (c) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...loadRecent().filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 8))); } catch { /* blocked */ } };
const shortName = (n) => n.replace(/\s*\(.*?\)/g, '').replace(/\s*—.*$/, '');
const pick1 = (a) => a[Math.floor(Math.random() * a.length)];

export class Panel {
  constructor(getBuild, onChange, car, toast) {
    this.getBuild = getBuild; this.onChange = onChange; this.car = car; this.toast = toast;
    this.tab = 'gen';
    this.hist = []; this.redo = []; this._silent = false;
    this.tabsEl = document.getElementById('tabs');
    this.body = document.getElementById('tabBody');
    for (const t of TABS) {
      this.tabsEl.append(el('button', { 'data-tab': t.id, onclick: () => this.show(t.id) }, el('b', {}, t.icon), el('span', {}, t.name)));
    }
    const panel = document.getElementById('panel');
    document.getElementById('panelToggle').onclick = () => panel.classList.toggle('collapsed');
    const bind = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    bind('btnUndo', () => this.undo()); bind('btnRedo', () => this.redoStep()); bind('btnRandom', () => this.randomize());
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('garage') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redoStep() : this.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redoStep(); }
    });
  }

  get b() { return this.getBuild(); }

  show(id) {
    this.tab = id;
    this.tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    this.body.innerHTML = '';
    this['tab_' + id]();
    this.body.scrollTop = 0;
    this.updateHead();
  }
  refresh() { const st = this.body.scrollTop; this.show(this.tab); this.body.scrollTop = st; }

  // ---------- header, undo / redo ----------
  updateHead() {
    const n = document.getElementById('pCar'), u = document.getElementById('btnUndo'), r = document.getElementById('btnRedo');
    const g = GENERATIONS.find((x) => x.id === this.b.gen);
    if (n && g) n.textContent = g.name;
    if (u) u.disabled = !this.hist.length;
    if (r) r.disabled = !this.redo.length;
    let strip = document.getElementById('perfStrip');
    if (!strip) {
      strip = el('div', { id: 'perfStrip', class: 'perf-strip' });
      document.getElementById('pHead')?.after(strip);
    }
    const pf = computePerf(this.b), sim = simulateRun(pf);
    const rt = pf.rating;
    strip.innerHTML = `<span class="ps-cls" style="--pc:${rt.color}">${rt.cls} ${rt.pi}</span>
      <span><b>${Math.round(pf.peakHp)}</b> HP</span>
      <span>0-100 <b>${sim.t100.toFixed(1)}s</b></span>
      <span>Top <b>${Math.round(sim.vmax)}</b></span>
      <button class="ps-test" title="ทดสอบขับ / จับเวลา 0-100 และ 402 ม.">🧪 เทสรถ</button>`;
    strip.querySelector('.ps-test').onclick = () => this.onTestDrive?.();
  }
  resetHistory() { this.hist = []; this.redo = []; this.updateHead(); }
  pushHistory(section) {
    if (this._silent || section === 'meta') return;
    const now = performance.now(), last = this.hist[this.hist.length - 1];
    // a slider drag is one undo step: keep the snapshot from before the drag started
    if (last && last.section === section && now - last.t < 900) { last.t = now; return; }
    this.hist.push({ snap: JSON.stringify(this.b), section, t: now });
    if (this.hist.length > 60) this.hist.shift();
    this.redo = [];
  }
  restoreSnap(snap) {
    const nb = JSON.parse(snap);
    if (nb.gen !== this.b.gen) { this.toast('เปลี่ยนรถแล้ว — ย้อนกลับข้ามคันไม่ได้'); this.resetHistory(); return; }
    this.replaceBuild(nb);
  }
  undo() {
    const h = this.hist.pop();
    if (!h) { this.toast('ไม่มีอะไรให้ย้อนกลับ'); return; }
    this.redo.push({ snap: JSON.stringify(this.b) });
    this.restoreSnap(h.snap); this.toast('↶ ย้อนกลับแล้ว'); this.updateHead();
  }
  redoStep() {
    const h = this.redo.pop();
    if (!h) { this.toast('ไม่มีอะไรให้ทำซ้ำ'); return; }
    this.hist.push({ snap: JSON.stringify(this.b), section: '_redo', t: 0 });
    this.restoreSnap(h.snap); this.toast('↷ ทำซ้ำแล้ว'); this.updateHead();
  }

  // 🎲 a random but tasteful build: a kit package that fits this car + colour, finish, livery and wheels
  randomize() {
    const b = this.b, gen = GENERATIONS.find((g) => g.id === b.gen);
    this.pushHistory('all');
    this._silent = true;
    const fits = KIT_PACKAGES.filter((p) => !p.gens || p.gens.includes(b.gen));
    const pkg = pick1(fits);
    this.applyPackage(pkg, true);
    b.paint.color = pick1([...gen.colors, ...EXTRA_COLORS]);
    b.paint.finish = pick1(['gloss', 'metallic', 'metallic', 'pearl', 'candy', 'chameleon', 'satin', 'matte', 'flake']);
    b.paint.livery = Math.random() < 0.5 ? 'none' : pick1(LIVERIES.filter((l) => l.id !== 'none')).id;
    b.paint.liveryColor = pick1(LIVERY_COLORS);
    b.paint.liveryW = 0.3 + Math.random() * 0.5;
    b.paint.hood = Math.random() < 0.2 ? 'carbon' : 'body';
    b.paint.roof = Math.random() < 0.25 ? 'black' : 'body';
    b.kit.hoodMod = pick1(['none', 'none', 'vents', 'louver', 'scoop']);
    b.kit.towHook = Math.random() < 0.3;
    b.kit.canard = b.kit.front === 'splitter' || Math.random() < 0.15;
    if (Math.random() < 0.7) { b.wheels.style = pick1(WHEEL_STYLES.filter((s) => !['oem', 'cover', 'model'].includes(s.id))).id; b.wheels.finish = pick1(WHEEL_FINISHES.filter((f) => f.id !== 'custom')).id; }
    this._silent = false;
    this.onChange('all');
    this.onFocus?.('front');
    this.toast('🎲 สุ่มสไตล์ใหม่ — กด ↶ ถ้าไม่ชอบ');
    this.refresh();
  }

  // ---------- shop (money and ownership live on the server; this.shop is set by main.js) ----------
  owns(key) { const p = priceOf(key); return p === 0 || p === null || !this.shop || this.shop.owns(key); }
  tag(key) { if (this.owns(key)) return priceOf(key) ? ' ✓' : ''; return ` · ฿${priceOf(key).toLocaleString()}`; }
  ask(html, okText = 'ซื้อเลย') {
    return new Promise((res) => {
      const box = el('div', { class: 'confirm' }, el('div', { class: 'cf-card' }, el('div', { class: 'cf-t' }), el('div', { class: 'rr-btns' },
        el('button', { class: 'on', onclick: () => { box.remove(); res(true); } }, okText), el('button', { onclick: () => { box.remove(); res(false); } }, 'ยกเลิก'))));
      box.querySelector('.cf-t').innerHTML = html;
      document.body.append(box);
    });
  }
  // true when the item may be used (owned, free, or just bought)
  async purchase(key, label) {
    if (this.owns(key)) return true;
    const price = priceOf(key), money = this.shop.money();
    if (money < price) { this.toast(`💸 เงินไม่พอ — ${label} ราคา ฿${price.toLocaleString()} (มี ฿${money.toLocaleString()})`); return false; }
    if (!(await this.ask(`<b>${label}</b><div class="cf-price">฿${price.toLocaleString()}</div><small>เงินคงเหลือหลังซื้อ ฿${(money - price).toLocaleString()}</small>`))) return false;
    const r = await this.shop.buy(key);
    if (!r.ok) { this.toast('⚠️ ' + (r.err || 'ซื้อไม่สำเร็จ')); return false; }
    this.toast(`✅ ซื้อ ${label} แล้ว`);
    return true;
  }
  missing(build) { return buildKeys(build).filter((k) => !this.owns(k)); }

  // ---------- control builders ----------
  // focus: which part of the car the change is about ('front' | 'rear' | 'side' | 'wheel') — the camera swings round to show it
  set(section, mutate, rerender = false, focus = null) {
    this.pushHistory(section);
    mutate(this.b); this.onChange(section);
    if (focus) this.onFocus?.(focus);
    if (rerender) this.refresh(); else this.updateHead();
  }
  h(t, hint) { this.body.append(el('h3', {}, t, hint ? el('small', {}, hint) : null)); }
  note(t) { this.body.append(el('p', { class: 'note' }, t)); }
  chips(label, list, cur, pick) {
    if (label) this.body.append(el('div', { class: 'row' }, el('label', {}, label)));
    const box = el('div', { class: 'chips' });
    for (const it of list) box.append(el('button', { class: it.id === cur ? 'on' : '', onclick: () => pick(it.id) }, it.name));
    this.body.append(box);
  }
  // picture tiles: opts.icon(item) → svg/html string, opts.style(item) → css for the icon area, opts.cols
  tiles(list, cur, pick, opts = {}) {
    const box = el('div', { class: 'tiles c' + (opts.cols || 3) });
    for (const it of list) {
      const ic = el('span', { class: 'ic' + (opts.round ? ' round' : '') });
      if (opts.icon) ic.innerHTML = opts.icon(it) || '';
      if (opts.style) ic.style.cssText += opts.style(it) || '';
      box.append(el('button', { class: 'tile' + (it.id === cur ? ' on' : ''), title: it.name, style: opts.tileStyle ? opts.tileStyle(it) : '', onclick: () => pick(it.id) }, ic, el('span', { class: 'tl-lb' }, opts.label ? opts.label(it) : it.name)));
    }
    this.body.append(box);
    return box;
  }
  select(label, list, cur, pick) {
    const s = el('select', { onchange: (e) => pick(e.target.value) }, list.map((it) => el('option', { value: it.id, selected: it.id === cur }, it.name)));
    this.body.append(el('div', { class: 'row' }, el('label', { style: 'white-space:nowrap' }, label)), s);
  }
  range(label, min, max, step, val, fmt, pick) {
    const v = el('span', { class: 'val' }, fmt(val));
    const r = el('input', { type: 'range', min, max, step, value: val });
    r.addEventListener('input', () => { v.textContent = fmt(+r.value); pick(+r.value); });
    this.body.append(el('div', { class: 'rangewrap' }, el('div', { class: 'row' }, el('label', {}, label), v), r));
  }
  toggle(label, val, pick) {
    const s = el('button', { class: 'switch' + (val ? ' on' : ''), onclick: () => { s.classList.toggle('on'); pick(s.classList.contains('on')); } });
    this.body.append(el('div', { class: 'toggle' }, el('label', {}, label), s));
  }
  color(label, val, pick, done) {
    const c = el('input', { type: 'color', value: val });
    c.addEventListener('input', () => pick(c.value));
    if (done) c.addEventListener('change', () => done(c.value));
    this.body.append(el('div', { class: 'row' }, el('label', {}, label), c));
  }
  swatches(colors, cur, pick, cols = 8) {
    const box = el('div', { class: 'swatches', style: `grid-template-columns:repeat(${cols},1fr)` });
    for (const c of colors) box.append(el('button', { class: c.toLowerCase() === String(cur).toLowerCase() ? 'on' : '', style: `background:${c}`, title: c, onclick: () => pick(c) }));
    this.body.append(box);
  }

  // ---------- tabs ----------
  tab_gen() {
    const money = this.shop?.money?.() ?? 0;
    this.body.append(el('div', { class: 'garage-wallet' },
      el('div', {}, el('span', { class: 'gw-lbl' }, 'เงินในกระเป๋า'), el('span', { class: 'gw-val' }, `฿${money.toLocaleString()}`)),
      el('button', { class: 'gw-btn', onclick: async () => { await this.shop?.maxMoney?.(); } }, '💰 เพิ่มตัง 999,999,999')));

    const savedCars = (this.garage?.list?.() || []).filter((b) => GENERATIONS.some((g) => g.id === b.gen && (g.glb || g.featured)));
    if (savedCars.length) {
      this.h('🔧 รถในอู่ของคุณ', `${savedCars.length} คัน`);
      const gbox = el('div', { class: 'cards' });
      for (const b of savedCars) {
        const g = GENERATIONS.find((x) => x.id === b.gen);
        if (!g) continue;
        const pf = computePerf(b);
        const dot = el('i', { class: 'cdot', style: `background:${b.paint?.color || '#fff'}` });
        gbox.append(el('button', { class: 'card' + (g.id === this.b.gen ? ' on' : ''), onclick: () => this.onSwitchCar?.(g.id) },
          el('div', { class: 't' }, el('span', {}, dot, g.name), el('span', { class: 'own' }, g.id === this.b.gen ? '✓ กำลังใช้อยู่' : 'สลับคัน')),
          el('div', { class: 's hp' }, `🔥 ${pf.engine.name} · ${Math.round(pf.peakHp)} แรงม้า · ${carSpec(g.id).drive}`)));
      }
      this.body.append(gbox);
    }

    let lastModel = null, box = null;
    for (const g of GENERATIONS.filter((x) => x.glb || x.featured)) {
      const model = `${g.make || 'Toyota'} ${g.model || 'Vios'}`;
      if (model !== lastModel) { if (box) this.body.append(box); this.h('🚗 ' + model); box = el('div', { class: 'cards' }); lastModel = model; }
      const saved = this.garage?.has(g.id) ? this.garage.get(g.id) : null;
      const pf = computePerf(saved || { gen: g.id });
      const ck = carKey(g.id), own = this.owns(ck);
      const dot = saved ? el('i', { class: 'cdot', style: `background:${saved.paint.color}` }) : null;
      box.append(el('button', { class: 'card' + (g.id === this.b.gen ? ' on' : '') + (own ? '' : ' locked'), onclick: async () => { if (await this.purchase(ck, g.name)) this.onSwitchCar?.(g.id); } },
        el('div', { class: 't' }, el('span', {}, dot, g.name), el('span', { class: own ? 'own' : 'price' }, own ? (priceOf(ck) ? '✓ ของคุณ' : 'รถเริ่มต้น') : `฿${priceOf(ck).toLocaleString()}`)),
        el('div', { class: 's' }, `${g.years} · ${Math.round(g.dims.L * 1000)}×${Math.round(g.dims.W * 1000)} มม. · ยาง ${g.tire.width}/${g.tire.aspect}R${g.tire.rim}`),
        el('div', { class: 's hp' }, `🔥 ${pf.engine.name} · ${Math.round(pf.peakHp)} แรงม้า · ${carSpec(g.id).drive}${saved ? ' · 🔧 แต่งแล้ว' : ''}`)));
    }
    this.body.append(box);
    const cur = GENERATIONS.find((g) => g.id === this.b.gen);
    if (cur?.credit) this.body.append(el('p', { class: 'note' }, 'โมเดล 3D: ', el('a', { href: cur.credit.url, target: '_blank', rel: 'noopener', style: 'color:#4cc3ff' }, cur.credit.text)));
    this.note('แต่ละคันจำชุดแต่งและการจูนของตัวเอง สลับคันได้ไม่หาย · บันทึกอัตโนมัติ · ย้อนกลับได้ด้วยปุ่ม ↶ ด้านบน (Ctrl+Z)');
  }

  // ---- paint ----
  tab_paint() {
    const p = this.b.paint, gen = GENERATIONS.find((g) => g.id === this.b.gen);
    const setP = (fn, re = true) => this.set('paint', (b) => fn(b.paint), re);
    this.h('สีตัวถัง');
    this.body.append(el('div', { class: 'curcolor' }, el('i', { style: `background:${p.color}` }), el('b', {}, p.color.toUpperCase()), el('small', {}, PAINT_FINISHES.find((f) => f.id === p.finish)?.name || '')));
    this.note('สีโรงงานของรุ่นนี้');
    this.swatches(gen.colors, p.color, (c) => setP((x) => { x.color = c; }), 8);
    this.note('สีพิเศษ / ทำสีใหม่');
    this.swatches(EXTRA_COLORS, p.color, (c) => setP((x) => { x.color = c; }), 10);
    const recent = loadRecent();
    if (recent.length) { this.note('สีที่เลือกล่าสุด'); this.swatches(recent, p.color, (c) => setP((x) => { x.color = c; }), 10); }
    this.color('เลือกสีเอง (ผสมสีได้ทุกเฉด)', p.color, (c) => setP((x) => { x.color = c; }, false), (c) => { pushRecent(c); this.refresh(); });

    this.h('ประเภทสี', 'เห็นผลทันทีบนรถ');
    this.tiles(PAINT_FINISHES, p.finish, (id) => setP((x) => { x.finish = id; }), { cols: 4, round: true, style: (f) => finishStyle(f.id, p.color), label: (f) => shortName(f.name) });

    this.h('ลายสติกเกอร์ / ลายคาด', 'ติดบนตัวถังทุกรุ่น');
    this.tiles(LIVERIES, p.livery || 'none', (id) => setP((x) => { x.livery = id; }), { cols: 4, icon: (l) => LIVERY_ICONS[l.id], tileStyle: () => `--hlc:${p.liveryColor || '#fff'}`, label: (l) => l.name.replace(/\s*\(.*?\)/, '') });
    if (p.livery && p.livery !== 'none') {
      this.note('สีลาย');
      this.swatches(LIVERY_COLORS, p.liveryColor, (c) => setP((x) => { x.liveryColor = c; }), 12);
      this.color('สีลายกำหนดเอง', p.liveryColor || '#ffffff', (c) => setP((x) => { x.liveryColor = c; }, false));
      if (p.livery === 'slant') { this.note('สีเส้นรอง'); this.swatches(LIVERY_COLORS, p.livery2, (c) => setP((x) => { x.livery2 = c; }), 12); }
      this.range('ขนาดลาย', 0, 1, 0.05, p.liveryW ?? 0.5, (v) => (v < 0.34 ? 'เล็ก' : v > 0.67 ? 'ใหญ่' : 'กลาง'), (v) => setP((x) => { x.liveryW = v; }, false));
    }
    this.toggle('เลขแข่งที่ประตู', !!p.numberOn, (v) => setP((x) => { x.numberOn = v; }));
    if (p.numberOn) {
      const t = el('input', { type: 'text', value: p.number, maxlength: 3, inputmode: 'numeric', placeholder: 'เลข 1-3 หลัก' });
      t.addEventListener('input', () => this.set('paint', (b) => { b.paint.number = t.value; }));
      this.body.append(t);
      this.note('สีวงเลข');
      this.swatches(['#ffffff', '#ffd400', '#c8102e', '#111111', '#1e90ff', '#00a86b'], p.numberBg, (c) => setP((x) => { x.numberBg = c; x.numberFg = ['#ffffff', '#ffd400'].includes(c) ? '#111111' : '#ffffff'; }), 6);
    }

    this.h('ทูโทน / พาร์ทพิเศษ');
    this.chips('หลังคา', KIT.roof, p.roof, (id) => setP((x) => { x.roof = id; }));
    if (p.roof === 'custom') this.color('สีหลังคา', p.roofColor, (c) => this.set('paint', (b) => { b.paint.roofColor = c; }));
    this.chips('ฝากระโปรง', KIT.hood, p.hood, (id) => setP((x) => { x.hood = id; }));
    this.chips('กระจกมองข้าง', KIT.mirror, p.mirror, (id) => setP((x) => { x.mirror = id; }));
  }

  // ---- wheels ----
  // thumbnail of a wheel style in the current finish (rendered once with the game's renderer, then cached)
  wheelThumb(st, w, gen, onReady) {
    if (!this.thumbs && this.renderer) this.thumbs = new Thumbs(this.renderer, this.env);
    if (!this.thumbs || st.id === 'model') return null;
    const key = `${gen.id}|${st.id}|${w.finish}|${w.finish === 'custom' ? w.color : ''}|${w.lip ? 1 : 0}`;
    const make = () => {
      const ww = { style: st.id, brand: 'generic', rim: 17, rimWidth: 8, tireWidth: 225, aspect: 45, offset: 30, spacer: 0, camber: 0, finish: w.finish, color: w.color, lip: w.lip, caliper: '#3a3a3a', bigBrake: false, tireType: 'comfort', tireBrand: 'generic', tireLetters: 'black' };
      let rim = null;
      if (st.glb) {
        const scene = getWheelModel(st.glb, () => this.thumbs.get(key, make, onReady));
        if (!scene) return null;
        const c = scene.clone(true);
        c.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; } });
        rim = this.car.fitRim(c, ww, false);
      }
      const built = buildWheel(ww, gen.id, gen.tire, WHEEL_FINISHES, rim);
      return { obj: built.spin, radius: built.T.outerR };
    };
    return this.thumbs.get(key, make, (k, url) => onReady(url));
  }

  tab_wheels() {
    const w = this.b.wheels;
    const gen = GENERATIONS.find((g) => g.id === this.b.gen);
    const set = (fn, re = true) => this.set('wheels', (b) => fn(b.wheels), re, 'wheel');
    this.h('ลายล้อแม็ก', `${WHEEL_STYLES.length} แบบ`);
    const box = el('div', { class: 'tiles c3 wheels' });
    for (const st of WHEEL_STYLES) {
      const ic = el('span', { class: 'ic wic' });
      const show = (url) => { if (url) { ic.style.backgroundImage = `url(${url})`; ic.classList.add('has'); } };
      show(this.wheelThumb(st, w, gen, show));
      if (!ic.classList.contains('has')) ic.textContent = '⚙️';
      box.append(el('button', { class: 'tile' + (st.id === w.style ? ' on' : ''), title: st.name, onclick: () => set((x) => { x.style = st.id; if (st.id === 'oem') { x.rim = gen.tire.rim; x.tireWidth = gen.tire.width; x.aspect = gen.tire.aspect; x.brand = 'oem'; } }) },
        ic, el('span', { class: 'tl-lb' }, shortName(st.name)), el('span', { class: 'tl-sb' }, st.brand)));
    }
    this.body.append(box);
    if (w.style === 'oem' && gen.glb) this.note('โฉมนี้ใช้ล้อและยางเดิมของโมเดล 3D — เลือกลายอื่นเพื่อปรับขอบ/ยางได้');
    if (w.style === 'model') this.note('ล้อจากโมเดล 3D จริง (CC BY 4.0 โดย JUST GAME) ปรับขนาด สี ออฟเซ็ต และยางได้ตามปกติ');
    const wsty = WHEEL_STYLES.find((st) => st.id === w.style);
    if (wsty?.credit) this.note(`ล้อโมเดล 3D: "${wsty.name}" โดย ${wsty.credit} (Sketchfab) — CC BY 4.0`);
    this.select('ยี่ห้อล้อ', WHEEL_BRANDS.map((x) => ({ id: x.id, name: `${x.name} · ${x.origin}` })), w.brand || 'generic', (id) => set((x) => { x.brand = id; }, false));

    this.h('สีล้อ');
    this.tiles(WHEEL_FINISHES, w.finish, (id) => set((x) => { x.finish = id; }), {
      cols: 5, round: true, label: (f) => f.name.replace(/\s*\(.*?\)/, '').replace('สีกำหนดเอง', 'เลือกเอง'),
      style: (f) => (f.id === 'custom' ? 'background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' : finishStyle(f.id === 'chrome' ? 'chrome' : 'gloss', f.color)),
    });
    if (w.finish === 'custom') this.color('สีล้อ', w.color, (c) => set((x) => { x.color = c; }, false));
    this.toggle('ขอบปากล้อชุบเงา (Polished lip)', w.lip, (v) => set((x) => { x.lip = v; }, true));

    this.h('ขนาดล้อ (ขอบ × กว้าง)');
    const rims = RIMS.filter((r) => r >= 15 || gen.tire.rim === 14);
    this.chips('ขอบล้อ', rims.map((r) => ({ id: String(r), name: `${r} นิ้ว` })), String(w.rim), (id) => set((x) => {
      x.rim = +id;
      const rec = TIRE_SIZES[x.rim];
      const keep = rec.find((t) => t.w === x.tireWidth) || rec[0];
      x.tireWidth = keep.w; x.aspect = keep.a;
      x.rimWidth = RIM_WIDTHS[x.rim][1];
    }));
    this.chips('ความกว้างล้อ', RIM_WIDTHS[w.rim].map((v) => ({ id: String(v), name: `${v.toFixed(1)}J` })), String(w.rimWidth), (id) => set((x) => { x.rimWidth = +id; }));
    this.range('ออฟเซ็ต (ET)', 0, 50, 1, w.offset, (v) => `ET${v >= 0 ? '+' : ''}${v}`, (v) => set((x) => { x.offset = v; }, false));
    this.range('สเปเซอร์', 0, 30, 1, w.spacer, (v) => `${v} มม.`, (v) => set((x) => { x.spacer = v; }, false));
    this.range('แคมเบอร์', -8, 1, 0.5, w.camber, (v) => `${v}°`, (v) => set((x) => { x.camber = v; }, false));
    this.fitBox = el('div', { class: 'fit' });
    this.body.append(this.fitBox);
    this.updateFit();
    this.note(`ล้อเดิม: PCD 4x100 · รูดุม 54.1 มม. · ${gen.tire.rim >= 16 ? '16x6 ET39' : '15x5.5 ET45'} — ET น้อยลง = ล้อยื่นออกนอกซุ้มมากขึ้น (ใส่ซุ้มโป่ง/ไวด์บอดี้ในแท็บชุดแต่งเพื่อให้ล้อเสมอซุ้ม)`);

    this.h('ยาง');
    const rec = TIRE_SIZES[w.rim] || [];
    this.body.append(el('div', { class: 'row' }, el('label', {}, 'ขนาดยอดนิยมสำหรับขอบนี้')));
    const recBox = el('div', { class: 'chips' });
    for (const t of rec) recBox.append(el('button', { class: t.w === w.tireWidth && t.a === w.aspect ? 'on' : '', onclick: () => set((x) => { x.tireWidth = t.w; x.aspect = t.a; }) }, `${t.w}/${t.a}R${w.rim}`));
    this.body.append(recBox);
    this.chips('หน้ายาง (มม.)', TIRE_WIDTHS.map((v) => ({ id: String(v), name: String(v) })), String(w.tireWidth), (id) => set((x) => { x.tireWidth = +id; }));
    const best = autoAspect(w.rim, w.tireWidth, gen.tire);
    this.chips('ความหนาแก้มยาง (ซีรีส์)', ASPECTS.map((v) => ({ id: String(v), name: v === best ? `${v} ★` : String(v) })), String(w.aspect), (id) => set((x) => { x.aspect = +id; }));
    this.note('★ = ซีรีส์ที่ทำให้เส้นผ่านศูนย์กลางใกล้ยางเดิมที่สุด · เลขน้อย = แก้มบาง');
    this.chips('ดอกยาง', TIRE_TYPES, w.tireType, (id) => set((x) => { x.tireType = id; }));
    this.select('ยี่ห้อยาง', TIRE_BRANDS.map((x) => ({ id: x.id, name: `${x.name} · ${x.origin}` })), w.tireBrand || 'generic', (id) => set((x) => { x.tireBrand = id; }, false));
    this.chips('ตัวหนังสือแก้มยาง', [{ id: 'black', name: 'ดำ (ปกติ)' }, { id: 'white', name: 'ตัวหนังสือขาว' }], w.tireLetters, (id) => set((x) => { x.tireLetters = id; }));

    this.h('เบรก');
    this.toggle('ชุดเบรกใหญ่ + จานเจาะรู/เซาะร่อง', w.bigBrake, (v) => set((x) => { x.bigBrake = v; }, false));
    this.swatches(['#3a3a3a', '#c8102e', '#ffb000', '#1e90ff', '#7ed957', '#ffffff', '#ff5a1f', '#6a3fb5'], w.caliper, (c) => set((x) => { x.caliper = c; }));
  }

  updateFit() {
    if (!this.fitBox || !this.car.fitment) return;
    const f = this.car.fitment, w = this.b.wheels;
    const wb = WHEEL_BRANDS.find((x) => x.id === w.brand), tb = TIRE_BRANDS.find((x) => x.id === w.tireBrand);
    const T = f.T;
    const lines = [];
    if (T) {
      lines.push(`ล้อ <b>${w.rim}x${w.rimWidth.toFixed(1)}J ET${w.offset}</b> 4x100${wb && wb.id !== 'generic' ? ' · ' + wb.name : ''}`);
      lines.push(`ยาง <b>${T.label}</b>${tb && tb.id !== 'generic' ? ' · ' + tb.name : ''} · แก้มสูง ${Math.round(T.h * 1000)} มม.`);
      const d = T.diffPct;
      lines.push(`เส้นผ่านศูนย์กลาง ${f.diameter} มม. (${d >= 0 ? '+' : ''}${d.toFixed(1)}% จากเดิม)${Math.abs(d) > 3 ? ' <span class="warn">— เข็มไมล์คลาดเกิน 3%</span>' : ''}`);
      lines.push(T.fit === 'ok' ? `<span class="ok">ยางเข้ารูปพอดีกับล้อ (ช่วงแนะนำ ${T.range[0]}–${T.range[1]}J)</span>`
        : T.fit === 'stretch' ? `<span class="warn">ยางยืด (Stretch) — ล้อกว้างกว่าช่วงแนะนำ ${T.range[0]}–${T.range[1]}J</span>`
          : `<span class="warn">ยางปลิ้น — ล้อแคบกว่าช่วงแนะนำ ${T.range[0]}–${T.range[1]}J</span>`);
    } else lines.push(`ยาง <b>${f.tire}</b> · ⌀${f.diameter} มม.`);
    const poke = f.poke > 8 ? `<span class="bad">ล้นซุ้ม ${f.poke} มม.</span>` : f.poke > -5 ? `<span class="warn">เสมอซุ้ม (Flush ${f.poke >= 0 ? '+' : ''}${f.poke} มม.)</span>` : `<span class="ok">หุบใน ${-f.poke} มม.</span>`;
    lines.push('ฟิตเมนต์: ' + poke);
    const gapTxt = (g, n) => g < 0 ? `<span class="bad">${n}ยางชนซุ้ม (${g} มม.)</span>` : g < 15 ? `<span class="warn">${n}ช่องซุ้ม ${g} มม. (เตี้ยสวย ระวังเบียด)</span>` : `<span class="ok">${n}ช่องซุ้ม ${g} มม.</span>`;
    lines.push(gapTxt(f.gap, 'หน้า: ') + ' · ' + gapTxt(f.gapRear ?? f.gap, 'หลัง: '));
    this.fitBox.innerHTML = lines.join('<br>');
  }

  // ---- glass + lights ----
  tab_glass() {
    const g = this.b.glass;
    const film = (label, keyD, keyF, max) => {
      this.h(label);
      this.range('ความเข้ม', 0, max, 5, g[keyD], (v) => `${v}%`, (v) => this.set('glass', (b) => { b.glass[keyD] = v; }, false, 'side'));
      this.tiles(FILM_TYPES, g[keyF], (id) => this.set('glass', (b) => { b.glass[keyF] = id; }, true, 'side'), { cols: 4, round: true, style: (f) => `background:linear-gradient(150deg,rgba(255,255,255,.35),transparent 40%),${f.color}`, label: (f) => f.name.replace(/\s*\(.*?\)/, '') });
    };
    film('กระจกบังลมหน้า', 'windshield', 'windshieldFilm', 80);
    film('กระจกข้าง', 'side', 'sideFilm', 95);
    film('กระจกหลัง', 'rear', 'rearFilm', 95);
    this.h('อุปกรณ์');
    this.toggle('กันสาดประตู', g.visor, (v) => this.set('glass', (b) => { b.glass.visor = v; }, false, 'side'));
    this.note('ความเข้มคิดแบบร้านฟิล์มไทย: 80% = มืดมาก · กฎหมายกำหนดค่าแสงผ่านขั้นต่ำ ควรเช็กก่อนติดจริง');
    this.lightsSection();
  }
  lightsSection() {
    const l = this.b.lights;
    this.h('💡 ไฟหน้า / ไฟท้าย');
    this.toggle('เปิดไฟ', l.head, (v) => this.set('lights', (b) => { b.lights.head = v; }, false, 'front'));
    this.chips('โคมไฟหน้า', [{ id: 'clear', name: 'ใส (เดิม)' }, { id: 'smoke', name: 'รมดำ' }], l.headTint, (id) => this.set('lights', (b) => { b.lights.headTint = id; }, true, 'front'));
    this.chips('โคมไฟท้าย', [{ id: 'red', name: 'แดง (เดิม)' }, { id: 'smoke', name: 'รมดำ' }, { id: 'clear', name: 'ขาวใส' }], l.tailTint, (id) => this.set('lights', (b) => { b.lights.tailTint = id; }, true, 'rear'));
    this.h('ไฟใต้ท้องรถ (Underglow)');
    this.chips(null, [{ id: 'none', name: 'ปิด' }, { id: 'on', name: 'นิ่ง' }, { id: 'pulse', name: 'กระพริบ' }, { id: 'rainbow', name: 'สายรุ้ง RGB' }], l.underglow, (id) => this.set('lights', (b) => { b.lights.underglow = id; }, true));
    this.swatches(['#00c8ff', '#7a5cff', '#ff2bd6', '#ff2b2b', '#2bff88', '#ffffff', '#ffb000', '#00ffd5'], l.underglowColor, (c) => this.set('lights', (b) => { b.lights.underglowColor = c; }, true));
  }

  applyPackage(pkg, silent = false) {
    const b = this.b;
    const gen = GENERATIONS.find((g) => g.id === b.gen);
    if (!silent) this.pushHistory('all');
    if (!pkg) {
      Object.assign(b.kit, DEFAULT_BUILD.kit);
      Object.assign(b.wheels, DEFAULT_BUILD.wheels, { style: 'oem', rim: gen.tire.rim, tireWidth: gen.tire.width, rimWidth: gen.tire.rim >= 16 ? 6.5 : 6 });
      Object.assign(b.suspension, DEFAULT_BUILD.suspension);
      Object.assign(b.paint, { livery: 'none', numberOn: false });
      b.wheels.aspect = gen.tire.aspect; b.wheels.brand = 'oem';
      b.glass.visor = false;
      b.kitPackage = null;
    } else {
      for (const [sec, vals] of Object.entries(pkg.apply)) Object.assign(b[sec], vals);
      if (pkg.apply.wheels && !('aspect' in pkg.apply.wheels)) b.wheels.aspect = autoAspect(b.wheels.rim, b.wheels.tireWidth, gen.tire);
      if (pkg.apply.wheels && !('brand' in pkg.apply.wheels)) b.wheels.brand = 'generic';
      if (pkg.apply.suspension) { b.suspension.linked = true; const t = SHOCK_TYPES.find((q) => q.id === b.suspension.type); if (t) { b.suspension.spring = t.spring; b.suspension.damping = t.damping; } }
      if (!('camber' in (pkg.apply.wheels || {}))) b.wheels.camber = 0;
      if (!('bigBrake' in (pkg.apply.wheels || {}))) b.wheels.bigBrake = false;
      if (!pkg.apply.paint) Object.assign(b.paint, { livery: 'none', numberOn: false });
      Object.assign(b.kit, { hoodMod: 'none', canard: false, towHook: false, ...pkg.apply.kit });
      b.kitPackage = pkg.id;
    }
    if (silent) return;
    this.onChange('all');
    this.onFocus?.('front');
    this.toast(pkg ? `ใส่ชุด ${pkg.name}` : 'ถอดชุดแต่งแล้ว');
    this.refresh();
  }

  // ---- body kit ----
  tab_kit() {
    const k = this.b.kit;
    const sel = (label, key, hint, focus, extra = {}) => {
      this.h(label, hint);
      this.tiles(KIT[key], k[key], (id) => this.set('kit', (b) => { b.kit[key] = id; b.kitPackage = null; }, true, focus), { cols: 3, icon: (it) => KIT_ICONS[key]?.[it.id], label: (it) => it.name.replace(/\s*\(.*?\)/, ''), ...extra });
    };
    this.h('ชุดสำเร็จรูป', 'กดเดียวได้ทั้งคัน');
    const cur = KIT_PACKAGES.find((p) => p.id === this.b.kitPackage);
    for (const [origin, label] of [['สไตล์', '🎨 สไตล์แต่ง (ใช้ได้ทุกรุ่น)'], ['ญี่ปุ่น', '🇯🇵 สำนักญี่ปุ่น'], ['ไทย', '🇹🇭 สำนักไทย']]) {
      const list = KIT_PACKAGES.filter((x) => x.origin === origin);
      if (!list.length) continue;
      this.body.append(el('div', { class: 'row' }, el('label', {}, label)));
      const box = el('div', { class: 'cards two' });
      for (const p of list) {
        const fits = !p.gens || p.gens.includes(this.b.gen);
        const tag = p.verified === false ? 'แนวสำนัก' : p.gens ? (fits ? `✓ ตรงรุ่นนี้ · ${p.year}` : `ของโฉมอื่น · ${p.year}`) : 'ใช้ได้ทุกรุ่น';
        box.append(el('button', { class: 'card' + (p.id === this.b.kitPackage ? ' on' : ''), style: fits ? '' : 'opacity:.6', onclick: () => this.applyPackage(p) },
          el('div', { class: 't' }, p.name.replace(/\s*\(.*?\)/, '')), el('div', { class: 's' }, tag)));
      }
      this.body.append(box);
    }
    if (cur) {
      const info = el('div', { class: 'fit' }, el('b', {}, `${cur.brand}`), el('br'), cur.desc);
      if (cur.source) info.append(el('br'), el('a', { href: cur.source.url, target: '_blank', rel: 'noopener', style: 'color:#4cc3ff;font-size:12px' }, 'ที่มา: ' + cur.source.title));
      this.body.append(info);
    }
    this.body.append(el('div', { class: 'btnrow' }, el('button', { onclick: () => this.applyPackage(null) }, '↺ ถอดชุดแต่งทั้งหมด (รถเดิม)')));

    this.h('ปรับแต่งเองทีละชิ้น', 'รถจะหมุนไปให้เห็นชิ้นที่เลือกเอง');
    sel('กันชนหน้า', 'front', null, 'front');
    sel('สเกิร์ตข้าง', 'side', null, 'side');
    sel('กันชนหลัง', 'rear', null, 'rear');
    sel('ซุ้มล้อ', 'fender', 'ยิ่งโป่ง ใส่ล้อกว้างได้เสมอซุ้มขึ้น', 'front');
    sel('สปอยเลอร์', 'spoiler', null, 'rear');
    sel('ฝากระโปรง', 'hoodMod', null, 'front', { cols: 4 });
    this.h('ท่อไอเสีย');
    this.tiles(KIT.exhaust, k.exhaust, (id) => this.set('kit', (b) => { b.kit.exhaust = id; b.kitPackage = null; }, true, 'rear'), { cols: 3, icon: (it) => KIT_ICONS.exhaust[it.id], label: (it) => it.name });
    this.chips('ผิวปลายท่อ', KIT.exhaustFinish, k.exhaustFinish, (id) => this.set('kit', (b) => { b.kit.exhaustFinish = id; }, true, 'rear'));
    this.chips('เสียงท่อ & ไฟออกท่อ', EXHAUST_SOUNDS, k.exhaustSound || 'sport', (id) => this.set('kit', (b) => { b.kit.exhaustSound = id; }, true, 'rear'));
    this.h('💨 สีควันยางดริฟต์');
    this.swatches(SMOKE_COLORS, k.smokeColor || '#ffffff', (c) => this.set('kit', (b) => { b.kit.smokeColor = c; }, true), 8);

    this.h('สีชิ้นส่วนชุดแต่ง');
    const ball = { body: () => `background:${this.b.paint.color}`, black: () => 'background:radial-gradient(circle at 32% 26%,#555,#0a0a0c 60%)', matte: () => 'background:#1c1d20', carbon: () => 'background:repeating-linear-gradient(45deg,#0c0d0f 0 3px,#2c3036 3px 6px)' };
    this.tiles(KIT.partColor, k.partColor, (id) => this.set('kit', (b) => { b.kit.partColor = id; }, true), { cols: 4, round: true, style: (it) => ball[it.id](), label: (it) => it.name.replace('สีเดียวกับตัวรถ', 'สีตัวรถ') });
    this.h('ของเสริม');
    this.toggle('คิ้วแคนาร์ดมุมกันชนหน้า (คาร์บอน)', k.canard, (v) => this.set('kit', (b) => { b.kit.canard = v; }, false, 'front'));
    this.toggle('ห่วงลากจูงสีแดง (หน้า/หลัง)', k.towHook, (v) => this.set('kit', (b) => { b.kit.towHook = v; }, false, 'front'));
    this.toggle('เสาอากาศครีบฉลาม', k.sharkfin, (v) => this.set('kit', (b) => { b.kit.sharkfin = v; }));
    if (ADDONS.length) {
      this.h('ชิ้นส่วนเสริม (ไฟล์ .glb)');
      for (const a of ADDONS) this.toggle(a.name, this.b.addons.includes(a.id), (v) => this.set('addons', (b) => { b.addons = v ? [...b.addons, a.id] : b.addons.filter((x) => x !== a.id); }));
    }
    this.note('ชิ้นส่วนเป็นแบบทั่วไปที่ปรับรูปตามตัวถังของแต่ละรุ่น ไม่ใช่การลอกแบบดีไซน์จริงของสำนักแต่ง');
  }

  tab_suspension() {
    const s = this.b.suspension;
    const type = SHOCK_TYPES.find((t) => t.id === s.type) || SHOCK_TYPES[0];
    const set = (fn, re = false) => this.set('suspension', (b) => fn(b.suspension), re, 'side');
    this.h('ปรับเร็ว', 'เลือกทรงรถ');
    const presets = [
      { id: 'stock', name: 'เดิมโรงงาน', ic: '🚙', apply: (b) => { Object.assign(b.suspension, { type: 'oem', drop: 0, dropRear: 0, linked: true, spring: 2.5, damping: 8, airUp: false }); b.wheels.camber = 0; } },
      { id: 'street', name: 'โหลดสตรีท', ic: '🚗', apply: (b) => { Object.assign(b.suspension, { type: 'lowering', drop: 30, dropRear: 30, linked: true, spring: 4, damping: 14, airUp: false }); b.wheels.camber = -1; } },
      { id: 'stance', name: 'สแตนซ์', ic: '🏎️', apply: (b) => { Object.assign(b.suspension, { type: 'coilover', drop: 65, dropRear: 65, linked: true, spring: 6, damping: 16, airUp: false }); b.wheels.camber = -4; } },
      { id: 'slam', name: 'ติดพื้น (ถุงลม)', ic: '⬇️', apply: (b) => { Object.assign(b.suspension, { type: 'air', drop: 120, dropRear: 120, linked: true, spring: 3.5, damping: 12, airUp: false }); b.wheels.camber = -6; } },
    ];
    this.tiles(presets, null, (id) => { const p = presets.find((q) => q.id === id); this.set('suspension', (b) => { p.apply(b); }, true, 'side'); this.onChange('wheels'); }, { cols: 4, icon: (p) => `<span class="emo">${p.ic}</span>`, label: (p) => p.name });
    this.h('ชนิดโช้คอัพ / ช่วงล่าง');
    this.chips(null, SHOCK_TYPES, s.type, (id) => set((x) => {
      const t = SHOCK_TYPES.find((q) => q.id === id);
      x.type = id; x.spring = t.spring; x.damping = t.damping;
      x.drop = Math.min(x.drop, t.dropMax); x.dropRear = Math.min(x.dropRear ?? x.drop, t.dropMax);
      x.airUp = false;
    }, true));
    if (type.dropMax === 0) { this.note('โช้คเดิมปรับความสูงไม่ได้ — เลือกสปริงโหลด, โช้คสตรัท หรือถุงลม'); }
    else {
      this.h('ความสูงตัวรถ');
      if (type.id === 'air') this.toggle('ยกถุงลมขึ้น (ความสูงขับขี่)', s.airUp, (v) => set((x) => { x.airUp = v; }));
      this.toggle('ปรับหน้า-หลังเท่ากัน', s.linked, (v) => set((x) => { x.linked = v; if (v) x.dropRear = x.drop; }, true));
      this.range(s.linked ? 'โหลดเตี้ยลง' : 'โหลดหน้า', 0, type.dropMax, 5, s.drop, (v) => (v ? `-${v} มม.` : 'เดิม'), (v) => set((x) => { x.drop = v; if (x.linked) x.dropRear = v; }));
      if (!s.linked) this.range('โหลดหลัง', 0, type.dropMax, 5, s.dropRear ?? s.drop, (v) => (v ? `-${v} มม.` : 'เดิม'), (v) => set((x) => { x.dropRear = v; }));
    }
    this.range('แคมเบอร์ล้อ', -8, 1, 0.5, this.b.wheels.camber, (v) => `${v}°`, (v) => this.set('wheels', (b) => { b.wheels.camber = v; }, false, 'side'));
    this.fitBox = el('div', { class: 'fit' });
    this.body.append(this.fitBox);
    this.updateFit();
    this.h('ความหนืดโช้ค & สปริง');
    if (type.adjustable) {
      this.range('ความหนืด (ปรับ 32 ระดับ)', 1, 32, 1, s.damping, (v) => `${v} / 32${v < 10 ? ' นุ่ม' : v > 24 ? ' แข็ง' : ''}`, (v) => set((x) => { x.damping = v; }));
      this.range('ค่าสปริง', 2, 14, 0.5, s.spring, (v) => `${v} kg/mm`, (v) => set((x) => { x.spring = v; }));
    } else this.note(`ค่าคงที่ของชุดนี้: สปริง ${type.spring} kg/mm · ความหนืดระดับ ${type.damping}/32`);
    this.note('มีผลตอนขับ: สปริงแข็ง = ตัวรถโยกน้อย, ความหนืดสูง = หยุดโยกเร็ว, รถเตี้ย = จุดศูนย์ถ่วงต่ำ');
  }

  plateSection() {
    const p = this.b.plate;
    this.h('🔖 ป้ายทะเบียน');
    this.chips(null, PLATE_STYLES, p.style, (id) => this.set('plate', (b) => { b.plate.style = id; }, true, 'front'));
    const t1 = el('input', { type: 'text', value: p.line1, maxlength: 12 });
    t1.addEventListener('input', () => this.set('plate', (b) => { b.plate.line1 = t1.value; }));
    const t2 = el('input', { type: 'text', value: p.line2, maxlength: 20 });
    t2.addEventListener('input', () => this.set('plate', (b) => { b.plate.line2 = t2.value; }));
    this.body.append(el('div', { class: 'row' }, el('label', {}, 'เลขทะเบียน')), t1, el('div', { class: 'row' }, el('label', {}, 'จังหวัด')), t2);
  }

  tab_save() { this.plateSection(); this.saveSection(); }

  // ---------- engine / tuning ----------
  tab_engine() {
    const b = this.b, e = b.engine;
    const stock = computePerf({ gen: b.gen });
    const view = {};
    // stats
    const stats = el('div', { class: 'perfstats' });
    this.body.append(stats);
    // dyno graph
    const cv = el('canvas', { class: 'dyno', width: 640, height: 300 });
    const live = el('div', { class: 'dynolive' }, 'กด "วิ่งไดโน" เพื่อดูกราฟแรงม้าแบบเรียลไทม์');
    this.body.append(el('div', { class: 'dynobox' }, cv, live));
    const runBtn = el('button', { class: 'on' }, '▶ วิ่งไดโน');
    this.body.append(el('div', { class: 'btnrow' }, runBtn));

    const fmtS = (x) => (x == null ? '—' : x.toFixed(1) + ' วิ');
    view.update = () => {
      const p = computePerf(this.b), r = simulateRun(p), rs = view.stockRun || (view.stockRun = simulateRun(stock));
      const d = (a, b0, unit = '', dec = 0, inv = false) => {
        const diff = a - b0;
        if (Math.abs(diff) < Math.pow(10, -dec) / 2) return '';
        const good = inv ? diff < 0 : diff > 0;
        return ` <em class="${good ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${diff.toFixed(dec)}${unit}</em>`;
      };
      const riskTxt = p.risk < 40 ? ['ปลอดภัย', 'ok'] : p.risk < 80 ? ['เริ่มเสี่ยง', 'warn'] : p.risk <= 100 ? ['เสี่ยงน็อก', 'warn'] : ['น็อก! เครื่องตัดกำลัง', 'bad'];
      stats.innerHTML = `
        <div><b>${Math.round(p.peakHp)}</b><small>แรงม้า @${p.peakHpRpm}${d(p.peakHp, stock.peakHp)}</small></div>
        <div><b>${Math.round(p.peakTq)}</b><small>นิวตันเมตร${d(p.peakTq, stock.peakTq)}</small></div>
        <div><b>${fmtS(r.t100)}</b><small>0–100 กม./ชม.${r.t100 && rs.t100 ? d(r.t100, rs.t100, ' วิ', 1, true) : ''}</small></div>
        <div><b>${Math.round(r.topKmh)}</b><small>ท็อปสปีด กม./ชม.${d(r.topKmh, rs.topKmh)}</small></div>
        <div><b>${p.mass}</b><small>กก. · ${Math.round(p.peakHp / p.mass * 1000)} แรงม้า/ตัน</small></div>
        <div><b class="${riskTxt[1]}">${Math.round(Math.min(150, p.risk))}%</b><small>ความเสี่ยง: ${riskTxt[0]}${p.fuelLimited ? ' · น้ำมันไม่พอ' : ''}</small></div>
        <div class="pi" style="--pc:${p.rating.color}"><b><span>${p.rating.cls}</span>${p.rating.pi}</b><small>คลาสรถแข่ง (PI)${d(p.rating.pi, stock.rating.pi)}</small></div>`;
      view.p = p;
      drawDyno(cv, stock, p, null);
    };
    let anim = 0;
    runBtn.onclick = () => {
      cancelAnimationFrame(anim);
      const p = view.p, t0 = performance.now(), dur = 3200;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        const rpm = 1000 + (p.redline - 1000) * k;
        const pt = p.curve[Math.min(p.curve.length - 1, Math.round((rpm - 1000) / 100))];
        live.innerHTML = `<b>${Math.round(rpm)}</b> rpm · <b>${Math.round(pt.hp)}</b> แรงม้า · <b>${Math.round(pt.tq)}</b> Nm${p.hasTurbo ? ` · บูสต์ ${p.boost} psi` : ''}`;
        drawDyno(cv, stock, p, rpm);
        if (k < 1) anim = requestAnimationFrame(step);
        else live.innerHTML += ' · ✅ สูงสุด ' + Math.round(p.peakHp) + ' แรงม้า';
      };
      step();
    };

    // engine swap
    this.h('🔩 วางเครื่อง');
    const stockId = carSpec(b.gen).engine;
    const engList = [{ id: '', name: `เครื่องเดิม — ${engineById(stockId).name} (${engineById(stockId).hp} แรงม้า)` },
      ...ENGINES.filter((x) => x.id !== stockId).map((x) => ({ id: x.id, name: `${x.make} ${x.name} — ${x.hp} แรงม้า ${x.asp === 'turbo' ? '🌀' : ''}${this.tag(engKey(b.gen, x.id))}` }))];
    this.select('เครื่องยนต์', engList, e.swap || '', async (v) => {
      if (v && !(await this.purchase(engKey(b.gen, v), engineById(v).make + ' ' + engineById(v).name))) { this.refresh(); return; }
      this.set('engine', (bb) => { bb.engine.swap = v || null; bb.engine.tune.boost = null; }, true);
    });

    // parts
    this.h('🛠️ อะไหล่เพิ่มแรง');
    for (const [k, part] of Object.entries(PARTS)) {
      if (k === 'brakes') this.h('🏁 ช่วงล่าง · เบรก · LSD');
      const isTurboEng = engineById(e.swap || stockId).asp === 'turbo';
      const label = k === 'turbo' ? (isTurboEng ? 'อัปเกรดเทอร์โบ' : 'ติดเทอร์โบ (เทอร์โบคิท)') : part.name;
      this.chips(label, part.opts.map((o) => ({ id: o.id, name: o.name + (o.cost ? this.tag(partKey(b.gen, k, o.id)) : '') })), e.parts[k],
        async (id) => {
          if (id !== 'stock' && !(await this.purchase(partKey(b.gen, k, id), part.name + ' — ' + part.opts.find((o) => o.id === id).name))) return;
          this.set('engine', (bb) => { bb.engine.parts[k] = id; if (k === 'turbo') bb.engine.tune.boost = null; }, true);
        });
    }

    // the player's own tune
    this.h('🎛️ จูนสูตรของคุณ');
    const p0 = computePerf(b);
    if (!p0.tunable) {
      this.note('เปลี่ยนกล่อง ECU เป็น "รีแมพ" หรือ "Standalone" ก่อน จึงจะปรับบูสต์/องศาไฟ/ส่วนผสม/รอบตัดได้เอง');
    } else {
      const T = (mut) => { this.set('engine', (bb) => mut(bb.engine.tune)); view.update(); };
      if (p0.hasTurbo) this.range('แรงดันบูสต์', 0, p0.maxBoost, 0.5, e.tune.boost ?? p0.boost, (v) => `${v} psi`, (v) => T((t) => { t.boost = v; }));
      this.range('องศาไฟจุดระเบิด', -6, 8, 0.5, e.tune.timing, (v) => `${v > 0 ? '+' : ''}${v}°`, (v) => T((t) => { t.timing = v; }));
      this.range('ส่วนผสมน้ำมัน (AFR)', 10.5, 14.5, 0.1, e.tune.afr, (v) => `${v.toFixed(1)}:1 ${v < 12 ? '(หนา)' : v > 13 ? '(บาง)' : ''}`, (v) => T((t) => { t.afr = v; }));
      this.range('ยกรอบตัด', 0, 300 + (PARTS.cam.opts.find((o) => o.id === e.parts.cam)?.rev || 0), 100, e.tune.revAdd, (v) => `+${v} rpm`, (v) => T((t) => { t.revAdd = v; }));
      this.range('อัตราทดเฟืองท้าย', -0.8, 1.2, 0.05, e.tune.finalAdj, (v) => `${(carSpec(b.gen).final + v).toFixed(2)} ${v > 0 ? '(ออกตัวไว)' : v < 0 ? '(ปลายไหล)' : ''}`, (v) => T((t) => { t.finalAdj = v; }));
      this.note('ทิป: บูสต์สูงต้องมีอินเตอร์คูลเลอร์ + ระบบน้ำมัน · องศาไฟมาก/ส่วนผสมบาง = แรงขึ้นแต่เสี่ยงน็อก ถ้าเกิน 100% เครื่องจะตัดกำลังเอง');
      const presets = [
        ['🛡️ ปลอดภัย', { boost: p0.hasTurbo ? Math.round(p0.maxBoost * 0.45) : null, timing: 0, afr: 12.0, revAdd: 0 }],
        ['🏙️ สตรีท', { boost: p0.hasTurbo ? Math.round(p0.maxBoost * 0.6) : null, timing: 1, afr: 12.2, revAdd: 200 }],
        ['🏁 แข่ง', { boost: p0.hasTurbo ? p0.maxBoost : null, timing: 4, afr: 12.6, revAdd: 300 }],
      ];
      this.body.append(el('div', { class: 'btnrow' }, presets.map(([n, v]) => el('button', { onclick: () => this.set('engine', (bb) => Object.assign(bb.engine.tune, v), true) }, n))));
    }

    // saved recipes (whole engine setup), kept on this device
    this.h('📒 สูตรที่บันทึกไว้');
    const recipes = loadRecipes();
    const nameIn = el('input', { type: 'text', placeholder: 'ตั้งชื่อสูตร เช่น "สตรีท 250 ม้า"', maxlength: 30 });
    this.body.append(el('div', { class: 'btnrow' }, nameIn, el('button', { onclick: () => {
      const n = nameIn.value.trim() || `${Math.round(computePerf(this.b).peakHp)} แรงม้า`;
      const all = loadRecipes().filter((r) => !(r.name === n && r.gen === this.b.gen));
      all.unshift({ name: n, gen: this.b.gen, hp: Math.round(computePerf(this.b).peakHp), engine: JSON.parse(JSON.stringify(this.b.engine)), at: Date.now() });
      storeRecipes(all.slice(0, 40)); this.toast('บันทึกสูตรแล้ว'); this.refresh();
    } }, '💾 บันทึกสูตร')));
    const list = el('div', { class: 'saves' });
    const mine = recipes.filter((r) => r.gen === b.gen);
    if (!mine.length) list.append(el('p', { class: 'note' }, 'ยังไม่มีสูตรของคันนี้'));
    mine.forEach((r) => list.append(el('div', { class: 'item' }, el('span', {}, `${r.name} · ${r.hp} แรงม้า`),
      el('button', { onclick: () => {
        const miss = this.missing({ gen: this.b.gen, engine: r.engine });
        if (miss.length) { this.toast(`สูตรนี้ใช้อะไหล่ที่ยังไม่ได้ซื้อ ${miss.length} ชิ้น — ซื้อก่อนแล้วค่อยใช้`); return; }
        this.set('engine', (bb) => { bb.engine = normalizeEngine(r.engine); }, true); this.toast('ใช้สูตร ' + r.name);
      } }, 'ใช้'),
      el('button', { onclick: () => { storeRecipes(loadRecipes().filter((x) => x !== r && !(x.name === r.name && x.gen === r.gen && x.at === r.at))); this.refresh(); } }, '🗑'))));
    this.body.append(list);
    const cost = Object.entries(e.parts).reduce((sum, [k, id]) => sum + (PARTS[k].opts.find((o) => o.id === id)?.cost || 0), 0);
    this.note(`มูลค่าของแต่งเครื่องคันนี้ ฿${cost.toLocaleString()} · อะไหล่ที่ซื้อแล้ว (✓) ถอดใส่ได้ฟรีตลอด · ตัวเลขแรงม้าเป็นค่าประมาณ`);
    view.update();
  }

  saveSection() {
    this.h('💾 บันทึกอัตโนมัติ');
    this.note('ทุกครั้งที่แต่งหรือจูน เกมบันทึกให้ทันที (ในเครื่องนี้) ปิดแอปแล้วเปิดใหม่ก็อยู่ครบ ไม่ต้องกดบันทึก');
    const cars = this.garage ? this.garage.list() : [];
    const gl = el('div', { class: 'saves' });
    for (const c of cars) {
      const g = GENERATIONS.find((x) => x.id === c.gen);
      if (!g) continue;
      const pf = computePerf(c);
      gl.append(el('div', { class: 'item' + (c.gen === this.b.gen ? ' cur' : '') }, el('i', { style: `background:${c.paint.color}` }),
        el('span', {}, `${g.name} · ${Math.round(pf.peakHp)} แรงม้า${c.gen === this.b.gen ? ' · กำลังขับ' : ''}`),
        c.gen === this.b.gen ? null : el('button', { onclick: () => this.onSwitchCar?.(c.gen) }, 'ขับคันนี้')));
    }
    this.h(`🚘 รถในโรงรถ (${cars.length})`);
    this.body.append(gl);
    this.h('ชื่อคันนี้');
    const name = el('input', { type: 'text', value: this.b.name, maxlength: 40 });
    name.addEventListener('input', () => { this.b.name = name.value; this.onChange('meta'); });
    this.body.append(name);
    const saves = loadSaves();
    this.body.append(el('div', { class: 'btnrow' },
      el('button', { onclick: () => { const all = loadSaves(); const i = all.findIndex((s) => s.name === this.b.name); const copy = JSON.parse(JSON.stringify(this.b)); copy.savedAt = Date.now(); if (i >= 0) all[i] = copy; else all.unshift(copy); storeSaves(all); this.toast('เก็บสำเนาแล้ว'); this.refresh(); } }, '📸 เก็บสำเนาชุดนี้'),
      el('button', { onclick: () => this.exportJSON() }, '⬇ ส่งออก JSON'),
      el('button', { onclick: () => this.importJSON() }, '⬆ นำเข้า'),
      el('button', { onclick: () => { if (confirm('รีเซ็ตคันนี้เป็นสภาพเดิมจากโรงงาน?')) { this.replaceBuild({ ...JSON.parse(JSON.stringify(DEFAULT_BUILD)), gen: this.b.gen, name: this.b.name }); } } }, '↺ รีเซ็ต'),
    ));
    this.h(`📸 สำเนาที่เก็บไว้ (${saves.length})`);
    const list = el('div', { class: 'saves' });
    if (!saves.length) list.append(el('p', { class: 'note' }, 'ยังไม่มีคันที่บันทึก'));
    saves.forEach((s, i) => {
      const gen = GENERATIONS.find((g) => g.id === s.gen);
      list.append(el('div', { class: 'item' }, el('i', { style: `background:${s.paint.color}` }), el('span', {}, `${s.name} · ${gen?.name || s.gen}`),
        el('button', { onclick: () => { this.replaceBuild(JSON.parse(JSON.stringify(s))); this.toast('โหลด ' + s.name); } }, 'โหลด'),
        el('button', { onclick: () => { const all = loadSaves(); all.splice(i, 1); storeSaves(all); this.refresh(); } }, '🗑')));
    });
    this.body.append(list);
    this.note('ข้อมูลเก็บในเครื่อง (localStorage) เล่นออฟไลน์ได้ ไม่ส่งขึ้นเซิร์ฟเวอร์');
  }

  replaceBuild(nb) { this.onReplace(mergeBuild(nb)); this.refresh(); }

  exportJSON() {
    const blob = new Blob([JSON.stringify(this.b, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `vios-${(this.b.name || 'build').replace(/\s+/g, '-')}.json` });
    a.click();
  }
  importJSON() {
    const inp = el('input', { type: 'file', accept: '.json,application/json' });
    inp.onchange = async () => {
      try { const data = JSON.parse(await inp.files[0].text()); this.replaceBuild(mergeBuild(data)); this.toast('นำเข้าแล้ว'); } catch { this.toast('ไฟล์ไม่ถูกต้อง'); }
    };
    inp.click();
  }
}

const KEY = 'viosGarage.saves.v1';
const RECIPE_KEY = 'viosGarage.tunes.v1';
function loadRecipes() { try { return JSON.parse(localStorage.getItem(RECIPE_KEY)) || []; } catch { return []; } }
function storeRecipes(a) { try { localStorage.setItem(RECIPE_KEY, JSON.stringify(a)); } catch { /* full */ } }

// dyno chart: stock (dashed) vs current (solid); hp warm, torque cool; optional live rpm cursor
function drawDyno(cv, stock, p, cursor) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, L = 14, R = 14, T = 10, B = 34;
  g.clearRect(0, 0, W, H);
  const maxRpm = Math.ceil(Math.max(p.redline, stock.redline) / 1000) * 1000;
  const maxHp = Math.max(p.peakHp, stock.peakHp) * 1.15, maxTq = Math.max(p.peakTq, stock.peakTq) * 1.15;
  const X = (r) => L + ((r - 1000) / (maxRpm - 1000)) * (W - L - R);
  const Yh = (v) => H - B - (v / maxHp) * (H - T - B), Yt = (v) => H - B - (v / maxTq) * (H - T - B);
  g.font = '20px Kanit, sans-serif'; g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.fillStyle = 'rgba(255,255,255,0.5)';
  for (let r = 1000; r <= maxRpm; r += 1000) { g.beginPath(); g.moveTo(X(r), T); g.lineTo(X(r), H - B); g.stroke(); g.textAlign = 'center'; g.fillText(r / 1000 + 'k', X(r), H - 8); }
  for (let i = 0; i <= 4; i++) { const y = T + (i / 4) * (H - T - B); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); }
  g.textAlign = 'left'; g.fillStyle = '#ff8a3d'; g.fillText('แรงม้า (hp)', L + 6, T + 16);
  g.textAlign = 'right'; g.fillStyle = '#4cc3ff'; g.fillText('แรงบิด (Nm)', W - R - 6, T + 16);
  const line = (curve, key, Y, color, dash, upto = Infinity) => {
    g.strokeStyle = color; g.lineWidth = dash ? 2 : 4; g.setLineDash(dash ? [8, 8] : []);
    g.beginPath(); let first = true;
    for (const c of curve) { if (c.rpm > upto) break; const x = X(c.rpm), y = Y(c[key]); if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y); }
    g.stroke(); g.setLineDash([]);
  };
  line(stock.curve, 'tq', Yt, 'rgba(76,195,255,0.45)', true);
  line(stock.curve, 'hp', Yh, 'rgba(255,138,61,0.45)', true);
  const upto = cursor ?? Infinity;
  line(p.curve, 'tq', Yt, '#4cc3ff', false, upto);
  line(p.curve, 'hp', Yh, '#ff8a3d', false, upto);
  if (cursor != null) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(cursor), T); g.lineTo(X(cursor), H - B); g.stroke(); }
  else {
    g.fillStyle = '#ff8a3d'; g.beginPath(); g.arc(X(p.peakHpRpm), Yh(p.peakHp), 7, 0, Math.PI * 2); g.fill();
    g.textAlign = 'center'; g.fillText(Math.round(p.peakHp) + ' hp', X(p.peakHpRpm), Yh(p.peakHp) - 12);
  }
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.textAlign = 'left'; g.fillText('เส้นประ = เดิม · เส้นทึบ = ตอนนี้', L + 6, H - B - 8);
}

export function loadSaves() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
function storeSaves(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage full or blocked */ } }

// Fill missing keys from defaults (older saves / imported files).
export function mergeBuild(data) {
  const d = JSON.parse(JSON.stringify(DEFAULT_BUILD));
  if (!data || typeof data !== 'object') return d;
  for (const k of Object.keys(d)) {
    if (data[k] === undefined) continue;
    if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) Object.assign(d[k], data[k]);
    else d[k] = data[k];
  }
  if (!GENERATIONS.some((g) => g.id === d.gen && g.glb)) d.gen = DEFAULT_BUILD.gen;
  d.engine = normalizeEngine(data.engine);
  return d;
}
