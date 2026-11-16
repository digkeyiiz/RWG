// Persistent player profile and account store (saves to store/profiles.json and store/tx.log).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, 'store');
const FILE = path.join(DIR, 'profiles.json');
const TX_FILE = path.join(DIR, 'tx.log');

class Store {
  constructor() {
    fs.mkdirSync(DIR, { recursive: true });
    this.profiles = new Map(); // key -> profile
    this.tokens = new Map();   // token -> key
    this.users = new Map();    // lower(username) -> key
    this.dirty = false;
    this._load();
    this._timer = setInterval(() => { if (this.dirty) this.flush(); }, 5000);
    this._timer.unref?.();
    process.on('SIGINT', () => { this.flush(); process.exit(0); });
    process.on('SIGTERM', () => { this.flush(); process.exit(0); });
  }

  _load() {
    if (!fs.existsSync(FILE)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const [k, p] of Object.entries(raw.profiles || {})) {
        this.profiles.set(k, p);
        if (p.username) this.users.set(p.username.toLowerCase(), k);
      }
      for (const [t, k] of Object.entries(raw.tokens || {})) {
        if (this.profiles.has(k)) this.tokens.set(t, k);
      }
    } catch (e) {
      console.error('[store] load error:', e.message);
    }
  }

  touch() {
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      const data = JSON.stringify({
        profiles: Object.fromEntries(this.profiles),
        tokens: Object.fromEntries(this.tokens),
      });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, data);
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.error('[store] save error:', e.message);
    }
  }

  tx(key, kind, amount, extra = {}) {
    const line = JSON.stringify({ t: new Date().toISOString(), key, kind, amount, ...extra }) + '\n';
    fs.appendFile(TX_FILE, line, () => {});
  }

  newToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  byKey(key) {
    return this.profiles.get(key) || null;
  }

  get(token) {
    if (typeof token !== 'string' || !token) return null;
    const key = this.tokens.get(token);
    if (!key) return null;
    const p = this.profiles.get(key);
    return p ? { key, p, created: false } : null;
  }

  create(token, name, startMoney = 999999999) {
    const key = 'u_' + crypto.randomBytes(8).toString('hex');
    const p = {
      name: name || 'นักซิ่ง',
      username: null,
      pw: null,
      money: startMoney,
      rep: 0,
      owned: [],
      discovered: [],
      races: 0,
      wins: 0,
      best: {},
      stuntBest: 0,
      stuntTotal: 0,
      bounty: 0,
      escapes: 0,
      busted: 0,
      friends: [],
      freq: [],
      liked: {},
      likes: 0,
      seen: Date.now(),
      createdAt: Date.now(),
    };
    this.profiles.set(key, p);
    this.tokens.set(token, key);
    this.touch();
    return { key, p, created: true };
  }

  userKey(username) {
    const u = String(username || '').trim().toLowerCase();
    return this.users.get(u) || null;
  }

  register(key, username, password) {
    const p = this.profiles.get(key);
    if (!p) return 'ไม่พบโปรไฟล์';
    if (p.username) return 'บัญชีนี้ตั้งชื่อผู้ใช้ไปแล้ว';
    const u = String(username || '').trim();
    if (!/^[a-zA-Z0-9_.-]{3,16}$/.test(u)) return 'ชื่อผู้ใช้ต้องเป็น a-z, 0-9, _ ความยาว 3–16 ตัว';
    const pw = String(password || '');
    if (pw.length < 4 || pw.length > 72) return 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร';
    const low = u.toLowerCase();
    if (this.users.has(low)) return 'ชื่อผู้ใช้นี้มีคนใช้แล้ว';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
    p.username = u;
    p.pw = `${salt}:${hash}`;
    this.users.set(low, key);
    this.touch();
    return null;
  }

  login(username, password) {
    const key = this.userKey(username);
    if (!key) return null;
    const p = this.profiles.get(key);
    if (!p || !p.pw) return null;
    const [salt, hash] = String(p.pw).split(':');
    if (!salt || !hash) return null;
    const test = crypto.scryptSync(String(password || ''), salt, 32);
    const orig = Buffer.from(hash, 'hex');
    if (test.length !== orig.length || !crypto.timingSafeEqual(test, orig)) return null;
    for (const [tok, k] of this.tokens.entries()) {
      if (k === key) return tok;
    }
    const tok = this.newToken();
    this.tokens.set(tok, key);
    this.touch();
    return tok;
  }

  leaderboard() {
    return [...this.profiles.values()]
      .filter((p) => (p.rep || 0) > 0 || (p.races || 0) > 0 || (p.stuntBest || 0) > 0)
      .sort((a, b) => (b.rep || 0) - (a.rep || 0))
      .slice(0, 15)
      .map((p) => ({
        name: p.name,
        crew: p.crew || null,
        username: p.username || null,
        rep: p.rep || 0,
        wins: p.wins || 0,
        races: p.races || 0,
        likes: p.likes || 0,
        stuntBest: p.stuntBest || 0,
      }));
  }

  stuntLeaderboard() {
    return [...this.profiles.values()]
      .filter((p) => (p.stuntBest || 0) > 0 || (p.stuntTotal || 0) > 0)
      .sort((a, b) => ((b.stuntBest || 0) - (a.stuntBest || 0)) || ((b.stuntTotal || 0) - (a.stuntTotal || 0)))
      .slice(0, 15)
      .map((p) => ({
        name: p.name,
        crew: p.crew || null,
        username: p.username || null,
        stuntBest: p.stuntBest || 0,
        stuntTotal: p.stuntTotal || 0,
        rep: p.rep || 0,
      }));
  }

  likesLeaderboard() {
    return [...this.profiles.values()]
      .filter((p) => (p.likes || 0) > 0)
      .sort((a, b) => ((b.likes || 0) - (a.likes || 0)) || ((b.rep || 0) - (a.rep || 0)))
      .slice(0, 15)
      .map((p) => ({
        name: p.name,
        crew: p.crew || null,
        username: p.username || null,
        likes: p.likes || 0,
        rep: p.rep || 0,
      }));
  }

  mostWanted() {
    return [...this.profiles.values()]
      .filter((p) => (p.bounty || 0) > 0)
      .sort((a, b) => (b.bounty || 0) - (a.bounty || 0))
      .slice(0, 15)
      .map((p) => ({
        name: p.name,
        crew: p.crew || null,
        username: p.username || null,
        bounty: p.bounty || 0,
        escapes: p.escapes || 0,
        busted: p.busted || 0,
      }));
  }
}

module.exports = { Store };
