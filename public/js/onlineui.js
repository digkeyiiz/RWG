// Players in this world (with "challenge" buttons) and world chat. No rooms or codes:
// the server puts everyone into a shared world automatically.
import { carShowcaseSummary } from './engine.js';
import { GENERATIONS } from './catalog.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function setupOnlineUI(online, { toast, challenge, inspect, carMeet, warpTo }) {
  const btn = document.getElementById('btnOnline');
  const box = document.getElementById('onlineBox');
  const body = box.querySelector('.ob-body');
  const chatLog = document.getElementById('chatLog');
  const chatForm = document.getElementById('chatForm');
  const chatIn = document.getElementById('chatIn');

  const open = (v = true) => {
    box.hidden = !v;
    if (v) {
      const so = document.getElementById('social');
      if (so) so.hidden = true;
      render();
    }
  };
  btn.onclick = () => {
    const show = box.hidden;
    open(show);
    if (show && !online.inRoom) online.start();
  };
  box.querySelector('.ob-close').onclick = () => open(false);
  document.getElementById('btnChat').onclick = () => { chatForm.hidden = !chatForm.hidden; if (!chatForm.hidden) chatIn.focus(); };
  addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && e.target.tagName !== 'INPUT' && online.inRoom) { e.preventDefault(); chatForm.hidden = false; chatIn.focus(); }
  });

  function render() {
    btn.classList.toggle('off', !online.inRoom);
    if (box.hidden) return;
    if (!online.inRoom) {
      body.innerHTML = `<p class="ob-note">ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ออนไลน์</p><button id="obReconn" class="on wide">🔄 เชื่อมต่อเข้าเมืองออนไลน์</button>`;
      body.querySelector('#obReconn').onclick = async () => {
        const b = body.querySelector('#obReconn');
        if (b) { b.disabled = true; b.textContent = 'กำลังเชื่อมต่อ…'; }
        const r = await online.start();
        if (!r?.ok) toast('⚠️ ' + (r?.err || 'เชื่อมต่อไม่สำเร็จ'));
        render();
      };
      return;
    }
    const list = [...online.peers.values()].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    const myCrew = online.me?.crew ? `<span class="crew-tag">[${esc(online.me.crew)}]</span> ` : '';
    const maxLikes = Math.max(online.me?.likes || 0, ...list.map((p) => p.likes || 0));
    const myKing = maxLikes > 0 && (online.me?.likes || 0) === maxLikes ? '<span class="king-badge">👑 King</span>' : '';
    const mePos = online.driver?.pos;
    body.innerHTML = `
      <div class="ob-l">เมือง ${esc(online.code)} · ${list.length + 1} คนในห้อง · ออนไลน์รวม ${online.online ?? (list.length + 1)} คน</div>
      <div class="ob-meet-bar">
        <button id="obMeetBtn" class="on">🚗 วาร์ปไป Car Meet</button>
        <div class="ob-crew-in"><input id="obCrewIn" maxlength="6" placeholder="แท็กคลับ (เช่น BKK)" value="${esc(online.me?.crew || '')}"><button id="obCrewBtn">ตั้ง</button></div>
      </div>
      <div class="ob-emotes" title="ส่งอีโมจิทักทายด่วน">
        <button data-emote="🔥 แต่งสวยมาก!">🔥</button>
        <button data-emote="👑 รถเทพจัด!">👑</button>
        <button data-emote="💨 ซิ่งไหม?">💨</button>
        <button data-emote="❤️ ถูกใจคันนี้">❤️</button>
        <button data-emote="⚡ รวมตัว Car Meet!">⚡</button>
      </div>
      <ul class="ob-list"><li class="me"><span>🚗 ${myCrew}${esc(online.name)} (คุณ)${myKing}</span> <small>👍 ${online.me?.likes || 0}</small></li>${list.map((p) => {
        const king = maxLikes > 0 && (p.likes || 0) === maxLikes ? '<span class="king-badge">👑 King</span>' : '';
        const distTxt = p.pose && mePos
          ? ` · ${Math.round(Math.hypot(p.pose.x - mePos.x, p.pose.z - mePos.z))}ม.`
          : p.inGarage ? ' · ในอู่' : '';
        let carHtml = '';
        const b = p.car?.b || p.build;
        if (b) {
          try {
            const sc = carShowcaseSummary(b, GENERATIONS.find((x) => x.id === b.gen));
            carHtml = ` <span class="ob-cls" style="color:${esc(sc.color)}">${esc(sc.cls)}${sc.pi}</span><small class="ob-spec">${esc(sc.carName)} · ${sc.cc.toLocaleString()}cc · ${sc.hp}HP</small>`;
          } catch {}
        }
        return `<li><div class="ob-pname clickable" data-look="${p.id}" title="คลิกเพื่อดูโปรไฟล์รถ 3D">${p.crew ? `<span class="crew-tag">[${esc(p.crew)}]</span> ` : ''}${esc(p.name)}${king}${carHtml}<small>${p.username ? `@${esc(p.username)}` : ''}${p.inRace ? ' · 🏁 กำลังแข่ง' : ''}${distTxt}</small></div> <span class="ob-acts"><button data-warp="${p.id}" title="วาร์ปไปหาเพื่อนคนนี้">🚀</button><button data-look="${p.id}" title="ส่องรถ & สเปค 3D">🔍</button><button data-like="${p.id}" title="โหวตแต่งสวย">👍 ${p.likes || 0}</button><button data-id="${p.id}" title="ท้าแข่ง">⚔️</button></span></li>`;
      }).join('')}</ul>
      ${list.length ? '' : '<p class="ob-note">ยังไม่มีใครอื่นในเมืองตอนนี้ — ชวนเพื่อนเปิดเว็บเดียวกันก็จะเจอกันในเมืองเดียวทันที</p>'}
      <p class="ob-note">คลิกซ้าย/ขวาที่รถเพื่อนบนถนนหรือแผนที่เพื่อส่องสเปค · <kbd>H</kbd> แตร · <kbd>L</kbd> ไฟ · <kbd>V</kbd> เบิ้ล · <kbd>C</kbd> ท้าแข่ง</p>`;
    body.querySelector('#obMeetBtn').onclick = () => { open(false); carMeet?.(); };
    body.querySelectorAll('.ob-emotes button').forEach((b) => {
      b.onclick = () => { online.chat(b.dataset.emote); toast('💬 ส่งทักทายแล้ว'); };
    });
    const saveCrew = async () => {
      const val = body.querySelector('#obCrewIn').value.trim();
      const r = await online.setCrew(val);
      toast(r?.ok ? (r.crew ? `ตั้งแท็กคลับ [${r.crew}] แล้ว` : 'ลบแท็กคลับแล้ว') : (r?.err || 'ตั้งไม่ได้'));
      render();
    };
    body.querySelector('#obCrewBtn').onclick = saveCrew;
    body.querySelector('#obCrewIn').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') saveCrew(); };
    body.querySelectorAll('button[data-warp]').forEach((b) => {
      b.onclick = async () => {
        const peer = online.peers.get(b.dataset.warp);
        const r = await online.warpPeer(b.dataset.warp);
        if (!r?.ok) return toast(r?.err || 'วาร์ปไม่ได้');
        open(false);
        const livePose = online.peers.get(r.id)?.pose || peer?.pose || r.pose;
        if (!livePose && r.inGarage) { toast(`🔧 ${r.name} กำลังแต่งรถอยู่ในอู่`); return; }
        warpTo?.(livePose, r.id);
      };
    });
    body.querySelectorAll('[data-look]').forEach((b) => {
      b.onclick = () => { const p = online.peers.get(b.dataset.look); if (p) { open(false); inspect(p); } };
    });
    body.querySelectorAll('button[data-like]').forEach((b) => {
      b.onclick = async () => {
        const p = online.peers.get(b.dataset.like);
        if (!p) return;
        const r = await online.like(p.id);
        if (r?.ok) { p.likes = r.likes; toast(`👍 โหวตรถ ${p.name} แล้ว!`); render(); }
        else toast(r?.err || 'โหวตไม่สำเร็จ');
      };
    });
    body.querySelectorAll('button[data-id]').forEach((b) => {
      b.onclick = () => { const p = online.peers.get(b.dataset.id); if (p) { open(false); challenge({ id: p.id, name: p.name }); } };
    });
  }

  function addChat(m) {
    const el = document.createElement('div');
    el.className = 'chat-line';
    el.innerHTML = `<b>${esc(m.name)}</b> ${esc(m.text)}`;
    chatLog.append(el);
    while (chatLog.children.length > 4) chatLog.firstChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 900); }, 6500);
  }
  chatForm.onsubmit = (e) => { e.preventDefault(); online.chat(chatIn.value); chatIn.value = ''; chatIn.blur(); chatForm.hidden = true; };
  chatIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Escape') { chatIn.blur(); chatForm.hidden = true; } });

  online.on((ev) => {
    if (ev?.chat) { addChat(ev.chat); return; }
    if (ev === 'peers' || ev === 'status' || ev?.hello || ev?.world) render();
  });
  render();
  return { open };
}
