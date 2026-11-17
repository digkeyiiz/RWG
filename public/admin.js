// VIOS GARAGE admin client — talks to /admin/api/* with the admin key.
const $ = (id) => document.getElementById(id);
let KEY = localStorage.getItem('adminKey') || new URLSearchParams(location.search).get('key') || '';

const api = async (p, opt = {}) => {
  const r = await fetch(p, { ...opt, headers: { 'x-admin-key': KEY, ...(opt.body && !(opt.body instanceof FormData) && typeof opt.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) } });
  const j = await r.json().catch(() => ({ ok: false, err: 'bad response' }));
  if (r.status === 401) { logout(); throw new Error('admin key ผิด'); }
  if (!j.ok) throw new Error(j.err || 'request failed');
  return j;
};
const msg = (t) => { const m = $('msg'); m.textContent = t; m.style.display = 'block'; clearTimeout(m._t); m._t = setTimeout(() => m.style.display = 'none', 3000); };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString();
const ago = (t) => t ? new Date(t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' }) : '—';

function login() {
  KEY = $('key').value.trim();
  localStorage.setItem('adminKey', KEY);
  api('/admin/api/state').then(() => { $('login').classList.add('hide'); $('app').classList.remove('hide'); $('tabs').style.display = 'flex'; loadDash(); }).catch((e) => { msg(e.message); localStorage.removeItem('adminKey'); });
}
function logout() { localStorage.removeItem('adminKey'); location.reload(); }

$('loginBtn').onclick = login;
$('key').onkeydown = (e) => e.key === 'Enter' && login();
document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('main section').forEach((s) => s.classList.add('hide'));
  $('t-' + b.dataset.t).classList.remove('hide');
  if (b.dataset.t === 'dash') loadDash();
  if (b.dataset.t === 'logs') loadLogs();
  if (b.dataset.t === 'set') loadSettings();
  if (b.dataset.t === 'cars') loadCars();
});

// ============ dashboard ============
async function loadDash() {
  try {
    const j = await api('/admin/api/state');
    $('stats').innerHTML = [
      ['ผู้เล่นออนไลน์', j.stats.players], ['โลก', j.stats.worlds],
      ['อัปไทม์', Math.floor(j.uptime / 3600) + 'h ' + Math.floor(j.uptime % 3600 / 60) + 'm'],
      ['Node', j.node],
    ].map(([l, v]) => `<div class="stat"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join('') +
    (j.worlds || []).map((w) => `<div class="stat"><div class="v">${w.players}</div><div class="l">${esc(w.id)} · lobby ${w.lobbies}</div></div>`).join('');
    loadPlayers(); loadProfiles();
  } catch (e) { msg(e.message); }
}
async function loadPlayers() {
  try {
    const j = await api('/admin/api/players');
    $('pcount').textContent = `(${j.players.length} คน)`;
    $('players').innerHTML = j.players.map((p) => `<tr>
      <td><b>${esc(p.name)}</b></td><td>${esc(p.username || '—')}</td><td>${esc(p.car || '—')}</td>
      <td>฿${fmt(p.money)}</td><td>${fmt(p.rep)}</td><td>${p.wins}/${p.races}</td>
      <td class="mut">${p.pos ? `${p.pos.x},${p.pos.z}` : '—'}</td>
      <td>${p.racing ? '<span class="tag on">🏁 แข่ง</span>' : ''}${p.inGarage ? '<span class="tag">🔧 โรงรถ</span>' : ''}${p.bounty ? `<span class="tag off">🚨 ฿${fmt(p.bounty)}</span>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="8" class="mut">ไม่มีผู้เล่นออนไลน์</td></tr>';
  } catch (e) { msg(e.message); }
}
async function loadProfiles() {
  try {
    const q = encodeURIComponent($('pq').value);
    const j = await api('/admin/api/profiles?q=' + q);
    $('ptotal').textContent = `(${fmt(j.total)} บัญชี)`;
    $('profiles').innerHTML = j.profiles.map((p) => `<tr>
      <td><b>${esc(p.name)}</b></td><td>${esc(p.username || '—')}</td><td>฿${fmt(p.money)}</td>
      <td>${fmt(p.rep)}</td><td>${p.wins}/${p.races}</td><td>${p.cars}</td><td class="mut">${ago(p.seen)}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="mut">ไม่พบ</td></tr>';
  } catch (e) { msg(e.message); }
}

// ============ logs ============
async function loadLogs() {
  try {
    const n = $('logn').value || 200, kind = $('logkind').value;
    const j = await api(`/admin/api/logs?n=${n}&kind=${encodeURIComponent(kind)}`);
    $('events').innerHTML = j.events.slice().reverse().map((e) => `<div><span class="t">${e.t.slice(11, 19)}</span> ${esc(e.msg)}</div>`).join('') || '<div class="mut">ว่าง</div>';
    $('txlog').innerHTML = j.tx.slice().reverse().map((x) => `<div><span class="t">${(x.t || '').slice(0, 19).replace('T', ' ')}</span> <b>${esc(x.kind)}</b> ${esc(x.key || '')} ${x.amount ? '฿' + fmt(x.amount) : ''} ${esc(x.value ?? '')} ${x.track ? esc(x.track) : ''} ${x.time ? x.time.toFixed(2) + 's' : ''}</div>`).join('') || '<div class="mut">ว่าง</div>';
  } catch (e) { msg(e.message); }
}

// ============ settings ============
const SET_LABELS = {
  worldCap: 'ผู้เล่นสูงสุด/โลก', lobbyMs: 'เวลารอ lobby เชิญ (ms)', openMs: 'เวลารอ lobby เปิด (ms)',
  countdownMs: 'นับถอยหลังแข่ง (ms)', activeCash: 'กล่องเงินเล็ก/โลก', activeBig: 'กล่องเงินใหญ่/โลก',
  prizeMul: 'ตัวคูณรางวัลแข่ง', stuntMul: 'ตัวคูณรางวัล stunt', tandemMul: 'โบนัส tandem (1=ปิด)', tandemRadius: 'รัศมี tandem (ม.)',
};
let setDefs = {};
async function loadSettings() {
  try {
    const j = await api('/admin/api/state');
    setDefs = j.settings.defaults;
    $('setForm').innerHTML = Object.keys(j.settings.defaults).map((k) =>
      `<div><label>${esc(SET_LABELS[k] || k)} <span class="mut">(${k})</span></label>
       <input id="set_${k}" type="number" step="any" value="${j.settings.cur[k]}"></div>`).join('');
  } catch (e) { msg(e.message); }
}
async function saveSettings() {
  try {
    const patch = {};
    for (const k of Object.keys(setDefs)) patch[k] = parseFloat($('set_' + k).value);
    const j = await api('/admin/api/settings', { method: 'POST', body: JSON.stringify(patch) });
    msg('บันทึกแล้ว — มีผลทันที'); setDefs = j.settings;
  } catch (e) { msg(e.message); }
}
async function resetSettings() {
  try { const j = await api('/admin/api/settings', { method: 'POST', body: JSON.stringify(setDefs) }); msg('คืนค่าเริ่มต้นแล้ว'); loadSettings(); } catch (e) { msg(e.message); }
}

// ============ cars ============
let carData = { builtin: [], custom: [], specs: [], models: [] };
async function loadCars() {
  try {
    carData = await api('/admin/api/cars');
    $('cglb').innerHTML = '<option value="">— procedural (ไม่มี GLB) —</option>' + carData.models.map((m) => `<option>${esc(m)}</option>`).join('');
    $('cspec').innerHTML = carData.specs.map((s) => `<option>${esc(s)}</option>`).join('');
    const rows = [
      ...carData.custom.map((c) => ({ id: c.id, name: c.name, src: 'custom', glb: c.glb, hidden: false })),
      ...carData.builtin.map((c) => ({ id: c.id, name: c.name, src: 'built-in', glb: c.glb ? 'มี' : 'procedural', hidden: c.hidden })),
    ];
    $('carlist').innerHTML = rows.map((c) => `<tr>
      <td class="mut">${esc(c.id)}</td><td><b>${esc(c.name)}</b></td>
      <td><span class="tag ${c.src === 'custom' ? 'on' : ''}">${c.src}</span></td>
      <td class="mut">${esc(c.glb || '—')}</td>
      <td>${c.hidden ? '<span class="tag off">ซ่อน</span>' : '<span class="tag on">แสดง</span>'}</td>
      <td>${c.src === 'custom'
        ? `<button class="act" onclick="editCar('${esc(c.id)}')">✏️ แก้ไข</button> <button class="act dan" onclick="delCar('${esc(c.id)}')">🗑 ลบ</button>`
        : `<button class="act" onclick="toggleHide('${esc(c.id)}',${c.hidden ? 'false' : 'true'})">${c.hidden ? '👁 แสดง' : '🚫 ซ่อน'}</button>`}</td>
    </tr>`).join('');
  } catch (e) { msg(e.message); }
}
function editCar(id) {
  const c = carData.custom.find((x) => x.id === id);
  if (!c) return;
  $('carFormTitle').textContent = '✏️ แก้ไข ' + id;
  $('cedit').value = id;
  $('cid').value = c.id; $('cid').disabled = true;
  $('cname').value = c.name || ''; $('cmake').value = c.make || ''; $('cmodel').value = c.model || '';
  $('cyears').value = c.years || ''; $('ccode').value = c.code || '';
  $('cglb').value = (c.glb || '').replace('models/', '');
  $('cspec').value = c.specFrom || 'gen2'; $('cprice').value = c.price ?? 0;
  $('ctw').value = c.tire?.width || ''; $('cta').value = c.tire?.aspect || ''; $('ctr').value = c.tire?.rim || '';
  $('ccolors').value = (c.colors || []).join(',');
  $('cdL').value = c.dims?.L || ''; $('cdW').value = c.dims?.W || ''; $('cdH').value = c.dims?.H || ''; $('cdWB').value = c.dims?.WB || '';
  $('ccredit').value = c.credit?.text || ''; $('ccrediturl').value = c.credit?.url || '';
  $('cglbcfg').value = c.glbConfig ? JSON.stringify(c.glbConfig, null, 2) : '';
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}
function clearCarForm() {
  $('carFormTitle').textContent = '➕ เพิ่มรถใหม่'; $('cedit').value = ''; $('cid').disabled = false;
  document.querySelectorAll('#t-cars input, #t-cars textarea').forEach((i) => { if (i.type !== 'file') i.value = ''; });
}
async function saveCar() {
  try {
    let glbConfig = null;
    const raw = $('cglbcfg').value.trim();
    if (raw) { try { glbConfig = JSON.parse(raw); } catch { return msg('glbConfig JSON ไม่ถูกต้อง'); } }
    const entry = {
      id: $('cid').value, name: $('cname').value, make: $('cmake').value, model: $('cmodel').value,
      years: $('cyears').value, code: $('ccode').value, glb: $('cglb').value || null, glbConfig,
      specFrom: $('cspec').value, price: +$('cprice').value || 0,
      tire: { width: +$('ctw').value, aspect: +$('cta').value, rim: +$('ctr').value },
      dims: { L: +$('cdL').value, W: +$('cdW').value, H: +$('cdH').value, WB: +$('cdWB').value },
      colors: $('ccolors').value.split(',').map((s) => s.trim()).filter(Boolean),
      credit: { text: $('ccredit').value, url: $('ccrediturl').value },
    };
    const editing = $('cedit').value;
    const j = editing
      ? await api(`/admin/api/cars/${editing}`, { method: 'PUT', body: JSON.stringify(entry) })
      : await api('/admin/api/cars', { method: 'POST', body: JSON.stringify(entry) });
    msg(editing ? 'แก้ไขแล้ว — ผู้เล่นเห็นเมื่อรีเฟรชเกม' : 'เพิ่มรถแล้ว — ผู้เล่นเห็นเมื่อรีเฟรชเกม');
    clearCarForm(); loadCars();
  } catch (e) { msg(e.message); }
}
async function delCar(id) {
  if (!confirm(`ลบรถ ${id}? (ไฟล์ .glb ยังอยู่ใน models/)`)) return;
  try { await api(`/admin/api/cars/${id}`, { method: 'DELETE' }); msg('ลบแล้ว'); loadCars(); } catch (e) { msg(e.message); }
}
async function toggleHide(id, hide) {
  try { await api(`/admin/api/cars/${id}`, { method: 'PUT', body: JSON.stringify({ hidden: hide }) }); msg(hide ? 'ซ่อนแล้ว' : 'แสดงแล้ว'); loadCars(); } catch (e) { msg(e.message); }
}

// ============ glb upload / inspect ============
$('glbfile').onchange = () => { const f = $('glbfile').files[0]; if (f && !$('glbname').value) $('glbname').value = f.name.replace(/[^\w.-]/g, '-').toLowerCase(); };
async function uploadGlb() {
  const f = $('glbfile').files[0];
  if (!f) return msg('เลือกไฟล์ก่อน');
  const name = ($('glbname').value || f.name).replace(/[^\w.-]/g, '-');
  try {
    $('inspect').innerHTML = '<p class="mut">กำลังอัปโหลด…</p>';
    const j = await api('/admin/api/glb?name=' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
    msg(`อัปโหลด ${j.file} แล้ว`); showInspect(j.info); loadCars();
  } catch (e) { $('inspect').innerHTML = ''; msg(e.message); }
}
function showInspect(info) {
  const b = info.bbox;
  $('inspect').innerHTML = `<div class="card" style="margin-top:10px;background:#0d1117">
    <b>${esc(info.file)}</b> · ${(info.size / 1048576).toFixed(1)} MB · ${fmt(info.verts)} verts · ${info.nodes} nodes
    ${b ? `<div class="kv"><span class="mut">ขนาด</span><span>L ${b.size[0]} × W ${b.size[2]} × H ${b.size[1]} ม. (source units)</span>
    <span class="mut">ล้อที่เจอ</span><span>${info.wheelCandidates.length ? info.wheelCandidates.map((w) => esc(w.name)).join(', ') : '—'}</span>
    <span class="mut">anchors</span><span>${info.anchors.length ? info.anchors.join(', ') : 'ยังไม่มี — ระบบล้อเกมใส่ผ่าน anchorWheels:true ใน glbConfig ได้'}</span></div>` : ''}
    <details><summary>materials (${info.materials.length})</summary><pre>${info.materials.map(esc).join('\n')}</pre></details>
    <details><summary>nodes ที่มี mesh (${info.nodeNames.length})</summary><pre>${info.nodeNames.map(esc).join('\n')}</pre></details>
    <div class="row" style="margin-top:8px">
      <div><label>หน้ารถหันทิศ</label><select id="anch_face"><option value="x">+X</option><option value="-x">−X</option><option value="z">+Z</option><option value="-z" selected>−Z</option></select></div>
      <button class="act" onclick="injectAnchors('${esc(info.file)}')">ฉีด WHEEL_* anchors</button>
      <span class="mut">ใช้เมื่อโมเดลไม่มีล้อแยก / ล้อ merge กัน — เกมจะใส่ล้อ procedural ให้</span>
    </div></div>`;
}
async function injectAnchors(file) {
  try {
    const j = await api('/admin/api/glb/anchors', { method: 'POST', body: JSON.stringify({ file, facing: $('anch_face').value }) });
    msg('ฉีด anchors แล้ว: ' + j.anchors.join(', '));
  } catch (e) { msg(e.message); }
}
async function inspectExisting() {
  const f = $('cglb').value;
  if (!f) return msg('เลือกไฟล์ก่อน');
  try { const j = await api('/admin/api/glb/inspect?file=' + encodeURIComponent(f)); showInspect(j.info); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { msg(e.message); }
}

// autologin if key saved
if (KEY) { $('key').value = KEY; login(); }
