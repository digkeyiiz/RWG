// Social: account (username + password), friends (requests, online status, warp, direct messages),
// party (invite friends, party chat, race together) and the car showcase (inspect + like another
// player's car). Everything is decided by the server; this file is the UI.
import { computePerf, simulateRun, PARTS, engineById, carSpec } from './engine.js';
import { GENERATIONS } from './catalog.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Social {
  constructor({ online, toast, game, hooks }) {
    Object.assign(this, { online, toast, game, hooks });
    this.el = document.getElementById('social');
    this.body = this.el.querySelector('.so-body');
    this.cards = document.getElementById('socialCards');
    this.tab = 'friends'; this.data = null; this.dm = new Map(); this.partyLog = []; this.party = null;
    this.el.querySelectorAll('.so-tabs button').forEach((b) => { b.onclick = () => { this.tab = b.dataset.t; this.render(); }; });
    this.el.querySelector('.so-x').onclick = () => this.open(false);
    document.getElementById('btnSocial').onclick = () => this.open(this.el.hidden);
    online.on((ev) => this.onNet(ev));
  }

  open(v = true) {
    this.el.hidden = !v;
    if (v) {
      const ob = document.getElementById('onlineBox');
      if (ob) ob.hidden = true;
      this.refresh();
    }
  }
  async refresh() {
    if (!this.online.inRoom) { this.render(); return; }
    const r = await this.online.friends();
    if (r?.ok) { this.data = r; this.party = r.party; }
    this.render();
  }

  onNet(ev) {
    if (!ev || typeof ev !== 'object' || !ev.social) return;
    const d = ev.d;
    switch (ev.social) {
      case 'friend:req': this.game.feed(`👥 <b>${esc(d.name)}</b> (@${esc(d.username)}) ขอเป็นเพื่อน — เปิดเมนู 👥`, 'invite'); this.game.sound('ping'); break;
      case 'friend:ok': this.game.feed(`✅ <b>${esc(d.name)}</b> เป็นเพื่อนกับคุณแล้ว`); break;
      case 'friend:online': this.game.feed(d.online ? `🟢 เพื่อน <b>${esc(d.name)}</b> ออนไลน์` : `⚪ เพื่อน <b>${esc(d.name)}</b> ออฟไลน์`); break;
      case 'party': this.party = d; if (!d) this.partyLog = []; break;
      case 'party:invite': this.card(`🎉 <b>${esc(d.name)}</b> ชวนเข้าปาร์ตี้`, [['เข้าร่วม', async () => {
        const r = await this.online.partyJoin(d.id);
        if (!r.ok) return this.toast(r.err);
        this.toast('🎉 เข้าปาร์ตี้แล้ว'); if (r.pose) this.hooks.warpTo(r.pose);
      }], ['ไม่ไป', null]]); this.game.sound('ping'); break;
      case 'party:chat': this.partyLog.push(d); this.partyLog = this.partyLog.slice(-40); this.game.feed(`🎉 <b>${esc(d.name)}</b>: ${esc(d.text)}`); break;
      case 'pm': { const log = this.dm.get(d.from) || []; log.push({ from: d.name, text: d.text }); this.dm.set(d.from, log.slice(-30)); this.game.feed(`💬 <b>${esc(d.name)}</b>: ${esc(d.text)}`, 'tip'); this.game.sound('ping'); break; }
      case 'liked': this.game.feed(`👍 <b>${esc(d.name)}</b> ถูกใจรถของคุณ (${d.likes})`, 'gold'); break;
      case 'race:party': this.toast(`🎉 ${d.host} เริ่มแข่งกับปาร์ตี้ — เตรียมตัว!`); break;
      default:
    }
    if (!this.el.hidden) this.refresh();
  }
  // small action card (top right) with buttons
  card(html, actions) {
    const c = document.createElement('div');
    c.className = 'lb soc';
    c.innerHTML = `<b>${html}</b><button type="button" class="lb-x" aria-label="ปิด">✕</button>`;
    c.querySelector('.lb-x').onclick = () => c.remove();
    for (const [label, fn] of actions) {
      const b = document.createElement('button');
      b.textContent = label; if (fn) b.className = 'on';
      b.onclick = async () => { c.remove(); if (fn) await fn(); };
      c.append(b);
    }
    this.cards.append(c);
    while (this.cards.children.length > 2) this.cards.firstChild.remove();
    setTimeout(() => c.remove(), 30000);
  }

  render() {
    this.el.querySelectorAll('.so-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
    const me = this.online.me;
    if (this.tab === 'account') return this.renderAccount(me || { name: this.online.name || 'นักซิ่ง', rep: 0, likes: 0 });
    if (!me) {
      this.body.innerHTML = '<p class="ob-note">กำลังเชื่อมต่อเซิร์ฟเวอร์ในพื้นหลัง… คุณสามารถเข้าสู่ระบบหรือสมัครบัญชีได้ทันที</p><button class="on wide" data-go="account">🔑 เชื่อมต่อ / เข้าสู่ระบบ</button>';
      this.body.querySelector('[data-go]').onclick = () => { this.tab = 'account'; this.render(); };
      return;
    }
    if (!me.username) {
      this.body.innerHTML = `<p class="ob-note">ตั้งชื่อผู้ใช้ก่อนเพื่อเพิ่มเพื่อน ปาร์ตี้ และวาร์ปหาเพื่อน — ความคืบหน้าทั้งหมด (เงิน รถ) ย้ายเข้าบัญชีนี้</p><button class="on wide" data-go="account">🔑 สมัครชื่อผู้ใช้</button>`;
      this.body.querySelector('[data-go]').onclick = () => { this.tab = 'account'; this.render(); };
      return;
    }
    if (this.tab === 'party') return this.renderParty();
    this.renderFriends();
  }

  renderFriends() {
    const d = this.data || { friends: [], requests: [] };
    const fr = [...d.friends].sort((a, b) => b.online - a.online);
    this.body.innerHTML = `
      <div class="ob-row"><input id="soAdd" maxlength="16" placeholder="ชื่อผู้ใช้ของเพื่อน"><button id="soAddBtn" class="on">＋ เพิ่ม</button></div>
      ${d.requests.length ? `<div class="ob-l">คำขอเป็นเพื่อน</div>${d.requests.map((q) => `<div class="so-row"><span>${esc(q.name)} <small>@${esc(q.username)}</small></span><button data-acc="${esc(q.username)}" class="on">รับ</button><button data-rej="${esc(q.username)}">ไม่รับ</button></div>`).join('')}` : ''}
      <div class="ob-l">เพื่อน ${fr.length} คน · ออนไลน์ ${fr.filter((f) => f.online).length}</div>
      ${fr.map((f) => `<div class="so-row ${f.online ? '' : 'off'}"><i class="dot ${f.online ? 'on' : ''}"></i><span>${esc(f.name)} <small>@${esc(f.username)}${f.online ? (f.racing ? ' · กำลังแข่ง' : f.same ? ' · เมืองเดียวกัน' : ' · อีกเมือง') : ''}</small></span>
        ${f.online ? `<button data-warp="${esc(f.username)}" title="วาร์ปไปหา">🚀</button><button data-party="${esc(f.username)}" title="ชวนปาร์ตี้">🎉</button><button data-dm="${esc(f.username)}" title="ส่งข้อความ">💬</button>` : ''}</div>
        <div class="so-dm" data-dmbox="${esc(f.username)}" hidden>${(this.dm.get(f.username) || []).map((m) => `<p><b>${esc(m.from)}</b> ${esc(m.text)}</p>`).join('')}<div class="ob-row"><input maxlength="200" placeholder="ข้อความถึง ${esc(f.name)}"><button class="on">ส่ง</button></div></div>`).join('') || '<p class="ob-note">ยังไม่มีเพื่อน — พิมพ์ชื่อผู้ใช้ของเพื่อนแล้วกดเพิ่ม (เพื่อนต้องสมัครชื่อผู้ใช้ก่อน)</p>'}
      <p class="ob-note">ชื่อผู้ใช้ของคุณ: <b>@${esc(this.online.me.username)}</b> — บอกเพื่อนให้เพิ่มคุณ</p>`;
    const $ = (q) => this.body.querySelector(q);
    const add = async () => { const u = $('#soAdd').value.trim(); if (!u) return; const r = await this.online.addFriend(u); this.toast(r.ok ? (r.friends ? 'เป็นเพื่อนกันแล้ว' : r.already ? 'เป็นเพื่อนกันอยู่แล้ว' : 'ส่งคำขอแล้ว') : r.err); this.refresh(); };
    $('#soAddBtn').onclick = add;
    $('#soAdd').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') add(); };
    this.body.querySelectorAll('[data-acc]').forEach((b) => { b.onclick = async () => { await this.online.answerFriend(b.dataset.acc, true); this.refresh(); }; });
    this.body.querySelectorAll('[data-rej]').forEach((b) => { b.onclick = async () => { await this.online.answerFriend(b.dataset.rej, false); this.refresh(); }; });
    this.body.querySelectorAll('[data-warp]').forEach((b) => { b.onclick = async () => {
      const r = await this.online.warp(b.dataset.warp);
      if (!r.ok) return this.toast(r.err);
      this.open(false); this.hooks.warpTo(r.pose, r.id);
    }; });
    this.body.querySelectorAll('[data-party]').forEach((b) => { b.onclick = async () => { const r = await this.online.partyInvite(b.dataset.party); this.toast(r.ok ? '🎉 ส่งคำชวนแล้ว' : r.err); }; });
    this.body.querySelectorAll('[data-dm]').forEach((b) => { b.onclick = () => {
      const box = this.body.querySelector(`[data-dmbox="${CSS.escape(b.dataset.dm)}"]`);
      box.hidden = !box.hidden;
      const inp = box.querySelector('input'), send = () => { const t = inp.value.trim(); if (!t) return; this.online.pm(b.dataset.dm, t); const log = this.dm.get(b.dataset.dm) || []; log.push({ from: 'คุณ', text: t }); this.dm.set(b.dataset.dm, log); inp.value = ''; this.render(); };
      inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); };
      box.querySelector('button').onclick = send;
      if (!box.hidden) inp.focus();
    }; });
  }

  renderParty() {
    const pt = this.party;
    if (!pt) { this.body.innerHTML = '<p class="ob-note">ยังไม่มีปาร์ตี้ — ไปที่แท็บ "เพื่อน" แล้วกด 🎉 เพื่อชวนเพื่อนที่ออนไลน์ (สูงสุด 6 คน) คนในปาร์ตี้จะอยู่เมืองเดียวกัน คุยกันได้ และเปิดแข่งพร้อมกันได้</p>'; return; }
    const lead = pt.leader === this.online.me.username;
    this.body.innerHTML = `
      <div class="ob-l">ปาร์ตี้ ${pt.members.length}/6 คน</div>
      ${pt.members.map((m) => `<div class="so-row ${m.online ? '' : 'off'}"><i class="dot ${m.online ? 'on' : ''}"></i><span>${m.username === pt.leader ? '👑 ' : ''}${esc(m.name)} <small>@${esc(m.username)}</small></span>${m.online && m.username !== this.online.me.username ? `<button data-warp="${esc(m.username)}" title="วาร์ปไปหา">🚀</button>` : ''}</div>`).join('')}
      ${lead ? '<button id="soRace" class="race wide">🏁 เปิดแข่งกับปาร์ตี้</button>' : '<p class="ob-note">หัวหน้าปาร์ตี้เป็นคนเปิดแข่ง ทุกคนในเมืองเดียวกันจะถูกพาเข้าแข่งพร้อมกัน</p>'}
      <div class="so-chat">${this.partyLog.map((m) => `<p><b>${esc(m.name)}</b> ${esc(m.text)}</p>`).join('') || '<p class="ob-note">แชทปาร์ตี้</p>'}</div>
      <div class="ob-row"><input id="soPc" maxlength="200" placeholder="คุยในปาร์ตี้…"><button id="soPcBtn" class="on">ส่ง</button></div>
      <button id="soLeave" class="danger wide">ออกจากปาร์ตี้</button>`;
    const $ = (q) => this.body.querySelector(q);
    const send = () => { const t = $('#soPc').value.trim(); if (t) { this.online.partyChat(t); $('#soPc').value = ''; } };
    $('#soPcBtn').onclick = send;
    $('#soPc').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); };
    $('#soLeave').onclick = () => { this.online.partyLeave(); this.party = null; this.render(); };
    if (lead) $('#soRace').onclick = () => { this.open(false); this.hooks.partyRace(); };
    this.body.querySelectorAll('[data-warp]').forEach((b) => { b.onclick = async () => { const r = await this.online.warp(b.dataset.warp); if (!r.ok) return this.toast(r.err); this.open(false); this.hooks.warpTo(r.pose, r.id); }; });
  }

  renderAccount(me) {
    if (me.username) {
      this.body.innerHTML = `<div class="pf-head"><div class="pf-av">${esc(me.name.slice(0, 1))}</div><div><b>${esc(me.name)}</b><small>@${esc(me.username)} · ${me.likes} 👍 · ${me.rep.toLocaleString()} REP</small></div></div>
        <p class="ob-note">เงิน รถ และของแต่งผูกกับบัญชีนี้ ล็อกอินจากเครื่องไหนก็ได้ด้วยชื่อผู้ใช้และรหัสผ่าน</p>
        <button id="soOut" class="wide">ออกจากระบบ</button>`;
      this.body.querySelector('#soOut').onclick = () => { this.online.logout(); location.reload(); };
      return;
    }
    this.body.innerHTML = `
      <div class="ob-l">สมัครชื่อผู้ใช้ — เก็บความคืบหน้าปัจจุบันเข้าบัญชี</div>
      <input id="soU" maxlength="16" placeholder="ชื่อผู้ใช้ (3–16 ตัว)" autocomplete="username">
      <input id="soP" type="password" maxlength="72" placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)" autocomplete="new-password">
      <button id="soReg" class="on wide">สมัคร</button>
      <div class="ob-or">มีบัญชีอยู่แล้ว?</div>
      <input id="soLU" maxlength="16" placeholder="ชื่อผู้ใช้" autocomplete="username">
      <input id="soLP" type="password" maxlength="72" placeholder="รหัสผ่าน" autocomplete="current-password">
      <button id="soLogin" class="wide">เข้าสู่ระบบ (สลับบัญชี)</button>
      <p class="ob-note">ถ้าเข้าสู่ระบบบัญชีอื่น ความคืบหน้าของผู้เล่นชั่วคราวในเครื่องนี้จะไม่ถูกย้ายไป</p>`;
    const $ = (q) => this.body.querySelector(q);
    this.body.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
    $('#soReg').onclick = async () => {
      const r = await this.online.register($('#soU').value.trim(), $('#soP').value);
      if (!r.ok) return this.toast('⚠️ ' + r.err);
      this.toast(`✅ สมัครแล้ว — @${r.me.username}`); this.tab = 'friends'; this.refresh();
    };
    $('#soLogin').onclick = async () => {
      const r = await this.online.login($('#soLU').value.trim(), $('#soLP').value);
      if (!r.ok) return this.toast('⚠️ ' + r.err);
      // after the reload enter as that account (keeps its racer name instead of this device's old one)
      try { sessionStorage.setItem('vg:relogin', '1'); } catch { /* ignore */ }
      location.reload();
    };
  }

  // ---------------- car showcase: look at another player's car, see its spec, like it
  inspect(peer) {
    const el = document.getElementById('inspect');
    const b = peer.car?.b || peer.build;
    if (!b) return;
    const g = GENERATIONS.find((x) => x.id === b.gen);
    const pf = computePerf(b), run = simulateRun(pf), rt = pf.rating;
    const mods = Object.entries(b.engine?.parts || {}).filter(([, id]) => id && id !== 'stock').map(([k, id]) => `${PARTS[k]?.name}: ${PARTS[k]?.opts.find((o) => o.id === id)?.name}`);
    const swap = b.engine?.swap ? engineById(b.engine.swap) : null;
    el.innerHTML = `<div class="in-card">
      <div class="in-head"><div><b>${esc(peer.name)}</b>${peer.username ? `<small>@${esc(peer.username)}</small>` : ''}</div><button class="in-x">✕</button></div>
      <div class="in-car"><i style="background:${esc(b.paint?.color || '#888')}"></i><b>${esc(b.name || g?.name)}</b><span class="cls" style="--pc:${rt.color}">${rt.cls} ${rt.pi}</span></div>
      <div class="in-stats"><div><b>${Math.round(pf.peakHp)}</b><small>แรงม้า</small></div><div><b>${Math.round(pf.peakTq)}</b><small>Nm</small></div><div><b>${run.t100 ? run.t100.toFixed(1) : '—'}</b><small>0–100 วิ</small></div><div><b>${Math.round(run.topKmh)}</b><small>ท็อป กม./ชม.</small></div></div>
      <p class="in-spec">🔩 ${esc(swap ? `${swap.make} ${swap.name} (วางเครื่อง)` : engineById(carSpec(b.gen).engine).name)} · ${carSpec(b.gen).drive} · ${pf.mass} กก.<br>🛞 ล้อ ${b.wheels?.rim}" · ยาง ${b.wheels?.tireWidth}/${b.wheels?.aspect}${mods.length ? `<br>🛠️ ${mods.map(esc).join(' · ')}` : '<br>🛠️ เครื่องเดิม'}</p>
      <div class="rr-btns"><button class="on" data-a="like">👍 ถูกใจ (${peer.likes || 0})</button>${peer.username && !this.online.me?.friends?.includes(peer.username) ? '<button data-a="friend">👥 เพิ่มเพื่อน</button>' : ''}<button data-a="race">⚔️ ท้าแข่ง</button></div></div>`;
    el.hidden = false;
    const close = () => { el.hidden = true; this.hooks.endInspect(); };
    el.querySelector('.in-x').onclick = close;
    el.querySelector('[data-a=like]').onclick = async (e) => { const r = await this.online.like(peer.id); if (r.ok) { peer.likes = r.likes; e.target.textContent = `👍 ถูกใจแล้ว (${r.likes})`; } else this.toast(r.err || 'กดไม่ได้'); };
    el.querySelector('[data-a=friend]')?.addEventListener('click', async () => { const r = await this.online.addFriend(peer.username); this.toast(r.ok ? 'ส่งคำขอเป็นเพื่อนแล้ว' : r.err); });
    el.querySelector('[data-a=race]').onclick = () => { close(); this.hooks.challenge({ id: peer.id, name: peer.name }); };
    this.hooks.startInspect(peer);
  }
}
