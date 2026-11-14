// Players in this world (with "challenge" buttons) and world chat. No rooms or codes:
// the server puts everyone into a shared world automatically.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function setupOnlineUI(online, { toast, challenge, inspect }) {
  const btn = document.getElementById('btnOnline');
  const box = document.getElementById('onlineBox');
  const body = box.querySelector('.ob-body');
  const chatLog = document.getElementById('chatLog');
  const chatForm = document.getElementById('chatForm');
  const chatIn = document.getElementById('chatIn');

  const open = (v = true) => { box.hidden = !v; if (v) render(); };
  btn.onclick = () => open(box.hidden);
  box.querySelector('.ob-close').onclick = () => open(false);
  document.getElementById('btnChat').onclick = () => { chatForm.hidden = !chatForm.hidden; if (!chatForm.hidden) chatIn.focus(); };
  addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && e.target.tagName !== 'INPUT' && online.inRoom) { e.preventDefault(); chatForm.hidden = false; chatIn.focus(); }
  });

  function render() {
    btn.classList.toggle('off', !online.inRoom);
    if (box.hidden) return;
    if (!online.inRoom) { body.innerHTML = '<p class="ob-note">กำลังเชื่อมต่อ…</p>'; return; }
    const list = [...online.peers.values()];
    body.innerHTML = `
      <div class="ob-l">เมือง ${esc(online.code)} · ${list.length + 1} คน · ผู้เล่นทั้งเซิร์ฟเวอร์ ${online.online ?? '-'} คน</div>
      <ul class="ob-list"><li class="me">🚗 ${esc(online.name)} (คุณ)</li>${list.map((p) => `<li>🚗 ${esc(p.name)}${p.username ? ` <small>@${esc(p.username)}</small>` : ''} <span><button data-look="${p.id}">🔍 ดูรถ</button><button data-id="${p.id}">⚔️</button></span></li>`).join('')}</ul>
      ${list.length ? '' : '<p class="ob-note">ยังไม่มีใครอื่นในเมืองตอนนี้ — ขับเก็บเงิน หาอู่ลับ หรือแข่งกับบอทไปก่อน เมื่อมีคนเข้ามาจะเห็นทันที</p>'}
      <p class="ob-note">ขับเข้าไปใกล้ผู้เล่นอื่นแล้วกด <kbd>C</kbd> เพื่อท้าแข่งได้ด้วย</p>`;
    body.querySelectorAll('button[data-look]').forEach((b) => {
      b.onclick = () => { const p = online.peers.get(b.dataset.look); if (p) { open(false); inspect(p); } };
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
    while (chatLog.children.length > 6) chatLog.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), 9000);
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
