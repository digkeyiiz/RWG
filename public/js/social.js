// Social: account (username + password), friends (requests, online status, warp, direct messages),
// party (invite friends, party chat, race together) and the car showcase (inspect + like another
// player's car). Everything is decided by the server; this file is the UI.
import { carShowcaseSummary } from './engine.js';
import { GENERATIONS, PAINT_FINISHES, LIVERIES, WHEEL_STYLES, WHEEL_BRANDS, TIRE_BRANDS } from './catalog.js';
import { buildKeys, priceOf } from './economy.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TRACK_LABELS = {
  sprint: '⚡ สตรีทสปรินท์',
  touge: '⛰️ เขาใหญ่ Touge',
  city: '🏙️ พระราม 9 · อโศก',
  ring: '🛣️ ทางด่วนศรีรัช',
};

export class Social {
  constructor({ online, toast, game, hooks }) {
    Object.assign(this, { online, toast, game, hooks });
    this.el = document.getElementById('social');
    this.body = this.el.querySelector('.so-body');
    this.cards = document.getElementById('socialCards');
    this.tab = 'friends'; this.data = null; this.dm = new Map(); this.partyLog = []; this.party = null;
    this._inspectId = null; this._inspectTab = 'spec';
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
    if (r?.ok) {
      this.data = r; this.party = r.party;
      this.online.partyUsernames = r.party ? new Set(r.party.members.map((m) => m.username)) : null;
    }
    this.render();
  }

  onNet(ev) {
    if (ev === 'peers') {
      const el = document.getElementById('inspect');
      if (el && !el.hidden && this._inspectId) {
        const live = this.online.peers.get(this._inspectId);
        if (live) this.inspect(live, { _fromSync: true });
      }
      if (!this.el.hidden && this.tab === 'friends') this.renderFriends();
      return;
    }
    if (!ev || typeof ev !== 'object' || !ev.social) return;
    const d = ev.d;
    switch (ev.social) {
      case 'friend:req': this.game.feed(`👥 <b>${esc(d.name)}</b> (@${esc(d.username)}) ขอเป็นเพื่อน — เปิดเมนู 👥`, 'invite'); this.game.sound('ping'); break;
      case 'friend:ok': this.game.feed(`✅ <b>${esc(d.name)}</b> เป็นเพื่อนกับคุณแล้ว`); break;
      case 'friend:online': this.game.feed(d.online ? `🟢 เพื่อน <b>${esc(d.name)}</b> ออนไลน์` : `⚪ เพื่อน <b>${esc(d.name)}</b> ออฟไลน์`); break;
      case 'party': this.party = d; this.online.partyUsernames = d ? new Set(d.members.map((m) => m.username)) : null; if (!d) this.partyLog = []; break;
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
    const friendCard = (f) => {
      const peer = f.id ? this.online.peers.get(f.id) : null;
      const b = peer?.car?.b || peer?.build || f.build;
      let specTxt = '';
      if (f.online && b) {
        try {
          const gen = GENERATIONS.find((x) => x.id === b.gen);
          const sc = carShowcaseSummary(b, gen);
          specTxt = `<span class="so-car"><b style="color:${esc(sc.color)}">${esc(sc.cls)}${sc.pi}</b> ${esc(sc.carName)} · ${sc.cc.toLocaleString()}cc · ${sc.hp}HP</span>`;
        } catch {}
      }
      const statusTxt = f.online ? (f.racing ? ' · กำลังแข่ง' : f.same ? ' · เมืองเดียวกัน' : ' · อีกเมือง') : '';
      return `<div class="so-row ${f.online ? '' : 'off'}"><i class="dot ${f.online ? 'on' : ''}"></i><span>${esc(f.name)} <small>@${esc(f.username)}${statusTxt}</small>${specTxt}</span>
        <div class="so-acts">${f.online && b ? `<button data-look="${esc(f.username)}" title="ส่องรถ & สเปคเครื่อง">🔍</button>` : ''}${f.online && f.same && f.id ? `<button data-race="${esc(f.id)}" title="ท้าแข่งกับเพื่อน">⚔️</button>` : ''}${f.online ? `<button data-warp="${esc(f.username)}" title="วาร์ปไปหา">🚀</button><button data-party="${esc(f.username)}" title="ชวนปาร์ตี้">🎉</button><button data-dm="${esc(f.username)}" title="ส่งข้อความ">💬</button>` : ''}</div></div>
        <div class="so-dm" data-dmbox="${esc(f.username)}" hidden>${(this.dm.get(f.username) || []).map((m) => `<p><b>${esc(m.from)}</b> ${esc(m.text)}</p>`).join('')}<div class="ob-row"><input maxlength="200" placeholder="ข้อความถึง ${esc(f.name)}"><button class="on">ส่ง</button></div></div>`;
    };
    this.body.innerHTML = `
      <div class="ob-row"><input id="soAdd" maxlength="16" placeholder="ชื่อผู้ใช้ของเพื่อน"><button id="soAddBtn" class="on">＋ เพิ่ม</button></div>
      ${d.requests.length ? `<div class="ob-l">คำขอเป็นเพื่อน</div>${d.requests.map((q) => `<div class="so-row"><span>${esc(q.name)} <small>@${esc(q.username)}</small></span><button data-acc="${esc(q.username)}" class="on">รับ</button><button data-rej="${esc(q.username)}">ไม่รับ</button></div>`).join('')}` : ''}
      <div class="ob-l">เพื่อน ${fr.length} คน · ออนไลน์ ${fr.filter((f) => f.online).length}</div>
      ${fr.map(friendCard).join('') || '<p class="ob-note">ยังไม่มีเพื่อน — พิมพ์ชื่อผู้ใช้ของเพื่อนแล้วกดเพิ่ม (เพื่อนต้องสมัครชื่อผู้ใช้ก่อน)</p>'}
      <p class="ob-note">ชื่อผู้ใช้ของคุณ: <b>@${esc(this.online.me.username)}</b> — บอกเพื่อนให้เพิ่มคุณ</p>`;
    const $ = (q) => this.body.querySelector(q);
    const add = async () => { const u = $('#soAdd').value.trim(); if (!u) return; const r = await this.online.addFriend(u); this.toast(r.ok ? (r.friends ? 'เป็นเพื่อนกันแล้ว' : r.already ? 'เป็นเพื่อนกันอยู่แล้ว' : 'ส่งคำขอแล้ว') : r.err); this.refresh(); };
    $('#soAddBtn').onclick = add;
    $('#soAdd').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') add(); };
    this.body.querySelectorAll('[data-acc]').forEach((b) => { b.onclick = async () => { await this.online.answerFriend(b.dataset.acc, true); this.refresh(); }; });
    this.body.querySelectorAll('[data-rej]').forEach((b) => { b.onclick = async () => { await this.online.answerFriend(b.dataset.rej, false); this.refresh(); }; });
    this.body.querySelectorAll('[data-look]').forEach((b) => {
      b.onclick = () => {
        const f = fr.find((x) => x.username === b.dataset.look);
        if (!f) return;
        const p = (f.id && this.online.peers.get(f.id)) || {
          id: f.id, name: f.name, username: f.username, build: f.build,
          rep: f.rep || 0, wins: f.wins || 0, races: f.races || 0, likes: f.likes || 0, stuntBest: f.stuntBest || 0,
          otherWorld: !f.same,
        };
        this.open(false);
        this.inspect(p);
      };
    });
    this.body.querySelectorAll('[data-race]').forEach((b) => {
      b.onclick = () => {
        const f = fr.find((x) => x.id === b.dataset.race);
        if (!f) return;
        this.open(false);
        this.hooks.challenge({ id: f.id, name: f.name });
      };
    });
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

  // ---------------- car showcase: look at another player's car, see its engine/CC/HP/mods, compare & challenge
  closeInspect() {
    const el = document.getElementById('inspect');
    if (el) el.hidden = true;
    this._inspectId = null;
    this.hooks.endInspect?.();
  }

  inspect(peer, opts = {}) {
    const el = document.getElementById('inspect');
    const p = (peer?.id && this.online.peers.get(peer.id)) || peer;
    if (!p) return;
    const b = p.car?.b || p.build;
    if (!b) { this.toast('รถคันนี้กำลังโหลดข้อมูล…'); return; }

    const alreadyOpen = !el.hidden && this._inspectId === p.id;
    this._inspectId = p.id;
    if (opts.tab) this._inspectTab = opts.tab;
    else if (!alreadyOpen) this._inspectTab = 'spec';
    const tab = this._inspectTab || 'spec';

    const g = GENERATIONS.find((x) => x.id === b.gen);
    const sc = carShowcaseSummary(b, g);
    const val = buildKeys(b).reduce((s, k) => s + (priceOf(k) || 0), 0);
    const maxLikes = Math.max(this.online.me?.likes || 0, ...[...this.online.peers.values()].map((x) => x.likes || 0));
    const isKing = maxLikes > 0 && (p.likes || 0) === maxLikes;
    const mePos = this.online.driver?.pos;
    const dist = p.pose && mePos ? Math.round(Math.hypot(p.pose.x - mePos.x, p.pose.z - mePos.z)) : null;
    const statusTxt = p.otherWorld
      ? '🌏 อีกเมือง (กด 🚀 วาร์ปไปหาได้)'
      : p.inRace
        ? '🏁 กำลังแข่งอยู่'
        : p.inGarage
          ? '🔧 กำลังแต่งในอู่'
          : dist != null
            ? `📍 ห่าง ${dist} ม.`
            : '🟢 อยู่ในเมือง';

    const finishName = PAINT_FINISHES.find((f) => f.id === sc.paintFinish)?.name || sc.paintFinish;
    const liveryName = LIVERIES.find((l) => l.id === sc.livery)?.name || sc.livery;
    const wbName = WHEEL_BRANDS.find((w) => w.id === sc.wheelBrand)?.name || sc.wheelBrand;
    const wsName = WHEEL_STYLES.find((w) => w.id === b.wheels?.style)?.name || '';
    const tbName = TIRE_BRANDS.find((t) => t.id === sc.tireBrand)?.name || sc.tireBrand;
    const ttName = { comfort: 'Comfort', sport: 'Sport', directional: 'Directional', semislick: 'Semi-Slick' }[sc.tireType] || sc.tireType;

    let bodyHtml = '';
    if (tab === 'spec') {
      bodyHtml = `
        <div class="in-eng">
          <div class="in-eng-top"><b>🔩 ${esc(sc.engineMake)} ${esc(sc.engineName)}</b>${sc.isSwapped ? '<span class="in-swap">วางเครื่อง Swap</span>' : '<span class="in-stock-tag">เครื่องตรงรุ่น</span>'}</div>
          <div class="in-eng-grid">
            <span>ความจุ: <b>${sc.cc.toLocaleString()} cc (${sc.liters}L)</b></span>
            <span>สูบ: <b>${esc(sc.layoutText)}</b></span>
            <span>อัดอากาศ: <b>${esc(sc.aspText)}</b></span>
            <span>ขับเคลื่อน: <b>${esc(sc.drive)}</b></span>
            <span>เรดไลน์: <b>${sc.redline.toLocaleString()} RPM</b></span>
            <span>แรงม้า/ตัน: <b>${sc.hpPerTon} HP/t</b></span>
            <span>น้ำหนัก: <b>${sc.mass.toLocaleString()} กก.</b></span>
            <span>402 ม.: <b>${sc.quarter ? sc.quarter.toFixed(2) + ' วิ' : '—'}</b></span>
          </div>
        </div>
        <div class="in-lines">
          <div>🛞 ล้อ ${sc.rim}" · ${esc(wbName)}${wsName ? ` (${esc(wsName)})` : ''} · ยาง ${sc.tireWidth}/${sc.tireAspect} ${esc(tbName)} (${esc(ttName)})</div>
          <div>🎨 สี ${esc(finishName)} · ลาย: ${esc(liveryName)} · ท่อ: ${esc(sc.exhaustLabel)}</div>
          <div>💰 มูลค่ารถ &amp; ชุดแต่ง: <b>฿${val.toLocaleString()}</b></div>
        </div>
        <div class="in-mods">${sc.mods.length ? sc.mods.map((m) => `<span>🛠️ ${esc(m.part)}: <b>${esc(m.name)}</b></span>`).join('') : '<span class="none">เครื่องยนต์สแตนดาร์ดโรงงาน</span>'}</div>`;
    } else if (tab === 'vs') {
      const myB = this.hooks.localBuild?.();
      const myGen = myB && GENERATIONS.find((x) => x.id === myB.gen);
      const my = myB ? carShowcaseSummary(myB, myGen) : null;
      if (!my) {
        bodyHtml = '<p class="ob-note">ไม่พบข้อมูลรถของคุณ</p>';
      } else {
        const vsRow = (label, pv, mv, unit, lowerBetter = false) => {
          const pNum = Number(pv) || 0, mNum = Number(mv) || 0;
          const mx = Math.max(1e-3, pNum, mNum);
          const pw = Math.min(100, Math.round((pNum / mx) * 100));
          const mw = Math.min(100, Math.round((mNum / mx) * 100));
          const diff = lowerBetter ? mNum - pNum : pNum - mNum;
          const win = Math.abs(diff) < 0.05 ? 'tie' : diff > 0 ? 'peer' : 'me';
          const f = (x) => (unit === 's' ? (x > 0 ? x.toFixed(2) + 's' : '—') : `${Math.round(x).toLocaleString()} ${unit}`);
          return `<div class="in-vs-row ${win}">
            <div class="vs-top"><span class="vs-p">${f(pNum)}</span><label>${label}</label><span class="vs-m">${f(mNum)}</span></div>
            <div class="vs-bars"><div class="b-p"><i style="width:${pw}%"></i></div><div class="b-m"><i style="width:${mw}%"></i></div></div>
          </div>`;
        };
        bodyHtml = `
          <div class="vs-head">
            <div><small>รถของ ${esc(p.name)}</small><b>${esc(sc.carName)}</b><span>${sc.cc.toLocaleString()}cc · ${sc.cls}${sc.pi}</span></div>
            <em>VS</em>
            <div class="r"><small>รถของคุณ</small><b>${esc(my.carName)}</b><span>${my.cc.toLocaleString()}cc · ${my.cls}${my.pi}</span></div>
          </div>
          ${vsRow('แรงม้า (HP)', sc.hp, my.hp, 'HP')}
          ${vsRow('แรงบิด (Nm)', sc.tq, my.tq, 'Nm')}
          ${vsRow('ความจุ (CC)', sc.cc, my.cc, 'cc')}
          ${vsRow('แรงม้า/ตัน', sc.hpPerTon, my.hpPerTon, 'HP/t')}
          ${vsRow('0–100 กม./ชม.', sc.t100 || 20, my.t100 || 20, 's', true)}
          ${vsRow('ท็อปสปีด', sc.topKmh, my.topKmh, 'km/h')}
          ${vsRow('เรตติ้ง (PI)', sc.pi, my.pi, 'PI')}`;
      }
    } else {
      const races = p.races || 0, wins = p.wins || 0;
      const rate = races ? Math.round((wins / races) * 100) : 0;
      const best = p.best || {};
      const fmtSec = (v) => (v != null ? Number(v).toFixed(2) + 's' : '—');
      bodyHtml = `
        <div class="in-prof-grid">
          <div><b>${(p.rep || 0).toLocaleString()}</b><small>REP รวม</small></div>
          <div><b>${wins}/${races} (${rate}%)</b><small>ชนะ/แข่ง</small></div>
          <div><b>${(p.stuntBest || 0).toLocaleString()}</b><small>สตั๊นท์ดีสุด</small></div>
          <div><b>${(p.stuntTotal || 0).toLocaleString()}</b><small>สตั๊นท์รวม</small></div>
          <div><b>👍 ${p.likes || 0}</b><small>โหวต Car Meet</small></div>
          <div><b>฿${(p.bounty || 0).toLocaleString()}</b><small>ค่าหัวสะสม</small></div>
          <div><b>${p.carsOwned ?? '—'}</b><small>รถในโรงรถ</small></div>
          <div><b>${p.discoveredCount ?? '—'}</b><small>อู่ลับที่เจอ</small></div>
        </div>
        <div class="in-best">
          ${Object.entries(TRACK_LABELS).map(([k, n]) => `<div><span>${n}</span><b>${fmtSec(best[k])}</b></div>`).join('')}
          <div><span>⚡ 0–100 กม./ชม.</span><b>${fmtSec(best.drag100)}</b></div>
          <div><span>🏁 402 ม.</span><b>${fmtSec(best.drag402)}</b></div>
        </div>`;
    }

    const canFriend = p.username && p.username !== this.online.me?.username && !this.online.me?.friends?.includes(p.username);
    el.innerHTML = `<div class="in-card">
      <div class="in-head">
        <div>
          <span class="in-title">${p.crew ? `<span class="crew-tag">[${esc(p.crew)}]</span> ` : ''}<b>${esc(p.name)}</b>${isKing ? '<span class="king-badge">👑 Meet King</span>' : ''}</span>
          <small>${p.username ? `@${esc(p.username)} · ` : ''}${statusTxt}</small>
        </div>
        <button class="in-x" aria-label="ปิด">✕</button>
      </div>
      <div class="in-car">
        <i style="background:${esc(sc.paintColor)}"></i>
        <div class="in-car-txt"><b>${esc(sc.carName)}</b><small>${sc.cc.toLocaleString()} cc · ${esc(sc.aspText)} · ${esc(sc.engineName)}</small></div>
        <span class="cls" style="--pc:${esc(sc.color)}">${esc(sc.cls)} ${sc.pi}</span>
      </div>
      <div class="in-stats">
        <div><b>${sc.hp}</b><small>HP @${sc.hpRpm}</small></div>
        <div><b>${sc.cc.toLocaleString()}</b><small>CC (${sc.liters}L)</small></div>
        <div><b>${sc.tq}</b><small>Nm @${sc.tqRpm}</small></div>
        <div><b>${sc.t100 ? sc.t100.toFixed(1) + 's' : '—'}</b><small>0–100 / ${sc.topKmh}</small></div>
      </div>
      <div class="in-tabs">
        <button data-it="spec" class="${tab === 'spec' ? 'on' : ''}">🔩 สเปครถ</button>
        <button data-it="vs" class="${tab === 'vs' ? 'on' : ''}">⚖️ เทียบรถเรา</button>
        <button data-it="prof" class="${tab === 'prof' ? 'on' : ''}">🏆 โปรไฟล์</button>
      </div>
      <div class="in-body">${bodyHtml}</div>
      <div class="in-actions">
        <button data-a="rev" title="ลองฟังเสียงเครื่อง & ท่อของคันนี้">🔊 ฟังเสียงเครื่อง</button>
        <button class="on" data-a="like">👍 ถูกใจ (${p.likes || 0})</button>
        ${!p.otherWorld && p.id ? '<button class="duel" data-a="race">⚔️ ท้าแข่ง</button>' : ''}
        ${p.id || p.username ? '<button data-a="warp">🚀 วาร์ปไปหา</button>' : ''}
        ${canFriend ? '<button data-a="friend">👥 เพิ่มเพื่อน</button>' : ''}
      </div>
    </div>`;
    el.hidden = false;

    const close = () => this.closeInspect();
    el.querySelector('.in-x').onclick = close;
    el.querySelectorAll('.in-tabs button').forEach((bt) => {
      bt.onclick = () => this.inspect(p, { tab: bt.dataset.it, _fromSync: true });
    });
    el.querySelector('[data-a=rev]').onclick = () => {
      this.hooks.playRev?.(sc.perf, sc.exhaustSound, 0.9);
      this.toast(`🔊 เสียงเครื่อง ${sc.engineName} (${sc.exhaustLabel})`);
    };
    el.querySelector('[data-a=like]').onclick = async (e) => {
      if (p.otherWorld) { this.toast('ต้องอยู่เมืองเดียวกันถึงจะโหวตได้ — กด 🚀 วาร์ปไปหาเลย!'); return; }
      const r = await this.online.like(p.id);
      if (r.ok) { p.likes = r.likes; e.target.textContent = `👍 ถูกใจแล้ว (${r.likes})`; }
      else this.toast(r.err || 'กดไม่ได้');
    };
    el.querySelector('[data-a=friend]')?.addEventListener('click', async () => {
      const r = await this.online.addFriend(p.username);
      this.toast(r.ok ? 'ส่งคำขอเป็นเพื่อนแล้ว' : r.err);
    });
    el.querySelector('[data-a=race]')?.addEventListener('click', () => {
      close();
      this.hooks.challenge({ id: p.id, name: p.name });
    });
    el.querySelector('[data-a=warp]')?.addEventListener('click', async () => {
      const r = p.otherWorld && p.username ? await this.online.warp(p.username) : await this.online.warpPeer(p.id);
      if (!r?.ok) return this.toast(r?.err || 'วาร์ปไม่ได้');
      close();
      const livePose = this.online.peers.get(r.id)?.pose || p.pose || r.pose;
      if (!livePose && r.inGarage) { this.toast(`🔧 ${p.name} กำลังแต่งรถอยู่ในอู่`); return; }
      this.hooks.warpTo(livePose, r.id);
    });

    if (!alreadyOpen) this.hooks.startInspect(p);
    if (!alreadyOpen && !opts._fromSync && p.id && this.online.inRoom) {
      this.online.peerProfile(p.id).then((res) => {
        if (res?.ok && !el.hidden && this._inspectId === p.id) {
          const target = this.online.peers.get(p.id) || p;
          Object.assign(target, res.peer);
          this.inspect(target, { _fromSync: true });
        }
      });
    }
  }
}
