
(() => {
  /* --- NAV BOOTSTRAP (must work even if later code fails) --- */
  window.goTab = function(name) {
    try {
      name = String(name || 'home');
      document.querySelectorAll('.nav-btn').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === name);
      });
      document.querySelectorAll('.page').forEach(function(p) {
        var on = p.id === 'page-' + name;
        p.classList.toggle('active', on);
        p.style.display = on ? 'block' : 'none';
      });
      try { window.scrollTo(0, 0); } catch (e) {}
      try {
        if (name === 'home' && typeof renderHome === 'function') renderHome();
        if (name === 'nutrition' && typeof renderNutrition === 'function') renderNutrition();
        if (name === 'reminders') { if (typeof renderReminders === 'function') renderReminders(); if (typeof initRemDefaults === 'function') initRemDefaults(); }
        if (name === 'diary' && typeof diaryRender === 'function') { diaryLoadEntry(); diaryRender(); diaryRenderEvents(); }
        if (name === 'games' && typeof exitGame === 'function') exitGame();
        if (name === 'settings' && typeof updateNotifUI === 'function') updateNotifUI();
        if (name === 'nova') { renderNovaProfile(); renderNovaPlan(); }
        if (name === 'achievements') { try { renderAchievements(); } catch (e) {} }
      } catch (e) { console.error(e); }
    } catch (e) { console.error('goTab', e); }
  };
  document.addEventListener('click', function(e) {
    var btn = e.target && e.target.closest ? e.target.closest('.nav-btn') : null;
    if (!btn) return;
    var tab = btn.getAttribute('data-tab');
    if (tab) {
      e.preventDefault();
      e.stopPropagation();
      window.goTab(tab);
    }
  }, true);

  'use strict';
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  };

  const KEY = 'luma-v2';
  const BUILD = '38';

  /* Локальная память v34: резервная копия IndexedDB + переносимый Luma ID.
     Это не облачная синхронизация: каждый браузер имеет собственное хранилище. */
  const DEVICE_ID_KEY = 'luma-device-id';
  const DEVICE_DB = 'luma-device-memory';
  const DEVICE_STORE = 'snapshots';
  let deviceSnapshotTimer = 0;
  function getLumaDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        const bytes = new Uint8Array(16);
        if (crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
        else for (let i=0;i<bytes.length;i++) bytes[i]=Math.floor(Math.random()*256);
        id = 'LUMA-' + Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch { return 'LUMA-LOCAL'; }
  }
  function openDeviceDB() {
    return new Promise((resolve,reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB недоступна'));
      const req = indexedDB.open(DEVICE_DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(DEVICE_STORE)) req.result.createObjectStore(DEVICE_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Не удалось открыть IndexedDB'));
    });
  }
  async function writeDeviceSnapshot() {
    const db = await openDeviceDB();
    const entries = [];
    for (let i=0;i<localStorage.length;i++) {
      const k=localStorage.key(i); if (!k || k==='luma-lk') continue;
      const v=localStorage.getItem(k); if (v != null) entries.push([k,v]);
    }
    const snapshot = { format:'luma-device-snapshot', version:1, savedAt:Date.now(), deviceId:getLumaDeviceId(), entries };
    await new Promise((resolve,reject) => {
      const tx=db.transaction(DEVICE_STORE,'readwrite');
      tx.objectStore(DEVICE_STORE).put(snapshot,'latest');
      tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error || new Error('Ошибка записи копии'));
    });
    db.close();
    return snapshot;
  }
  function scheduleDeviceSnapshot() {
    clearTimeout(deviceSnapshotTimer);
    deviceSnapshotTimer=setTimeout(() => writeDeviceSnapshot().then(() => {
      const el=$('deviceMemoryStatus'); if(el) el.textContent='Локальная копия обновлена · '+new Date().toLocaleString('ru-RU');
    }).catch(err => {
      const el=$('deviceMemoryStatus'); if(el) el.textContent='Автокопия недоступна в этом браузере. Используй экспорт JSON.';
      console.warn('Luma local backup:',err);
    }), 700);
  }
  async function readDeviceSnapshot() {
    const db=await openDeviceDB();
    const result=await new Promise((resolve,reject)=>{
      const tx=db.transaction(DEVICE_STORE,'readonly'); const req=tx.objectStore(DEVICE_STORE).get('latest');
      req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error);
    });
    db.close(); return result;
  }
  async function restoreDeviceSnapshot() {
    const snap=await readDeviceSnapshot();
    if(!snap || !Array.isArray(snap.entries)) throw new Error('Локальная копия не найдена');
    if(!confirm('Восстановить локальную копию? Текущие данные этого браузера будут заменены.')) return false;
    for(const pair of snap.entries) {
      if(!Array.isArray(pair)||typeof pair[0]!=='string'||typeof pair[1]!=='string') continue;
      if(pair[0]==='luma-lk') continue;
      localStorage.setItem(pair[0],pair[1]);
    }
    if(snap.deviceId) localStorage.setItem(DEVICE_ID_KEY,String(snap.deviceId).slice(0,80));
    location.reload(); return true;
  }
  function initDeviceMemoryUI() {
    const id=getLumaDeviceId(), field=$('lumaDeviceId'); if(field) field.value=id;
    const copy=$('copyLumaId'); if(copy) copy.onclick=()=>{
      const value=getLumaDeviceId();
      if(navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(()=>toast('Luma ID скопирован')).catch(()=>toast('Не удалось скопировать ID'));
      else { field?.select(); try{document.execCommand('copy');toast('Luma ID скопирован');}catch{toast('Скопируй ID вручную');} }
    };
    const restore=$('restoreLocalBackup'); if(restore) restore.onclick=()=>restoreDeviceSnapshot().catch(e=>toast(e.message||'Не удалось восстановить копию'));
    scheduleDeviceSnapshot();
  }
  /* ----- Роли и пароли: хранятся только хеши (SHA-256, соль, 4000 итераций) ----- */
  function sha256(str) {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const b = new TextEncoder().encode(str), l = b.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n);
    m.set(b); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(n - 4, (l * 8) >>> 0); dv.setUint32(n - 8, Math.floor(l * 8 / 4294967296));
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64), r = (x, k) => (x >>> k) | (x << (32 - k));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const a = w[i - 15], c = w[i - 2]; w[i] = (w[i - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + w[i - 7] + (r(c, 17) ^ r(c, 19) ^ (c >>> 10))) >>> 0; }
      let a = h0, bb = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7].map(x => x.toString(16).padStart(8, '0')).join('');
  }
  const AUTH_SALT = { admin: 'luma.adm.q7#v1', creator: 'luma.crt.k2!v1' };
  /* токен доступа выводится из пароля; сам пароль в коде не хранится */
  function authToken(role, pw) { let h = sha256(AUTH_SALT[role] + '|' + pw); for (let i = 0; i < 4000; i++) h = sha256(h + AUTH_SALT[role]); return h; }
  const authCheck = (role, tok) => typeof tok === 'string' && tok.length === 64 && sha256('v|' + tok + '|' + role) === AUTH_VERIFY[role];
  const AUTH_VERIFY = { admin: '4a4100653fc1cc6aee0ccbd57a294abb7414f3a9ffc27d306faf26ccf523615b', creator: '92311f78b41023fc19e1ac1489673564d44d2b823928879bc5a42c797df1b004' };
  let ROLE = { admin: false, creator: false };
  const rolesOf = d => ({ admin: !!(d && d.auth && authCheck('admin', d.auth.a)), creator: !!(d && d.auth && authCheck('creator', d.auth.c)) });
  const SPECIAL_IDS = ['th_creator', 'av_creator', 'fr_creator', 'bd_creator', 'sn_aurora', 'bd_admin'];
  /* роль нельзя получить правкой хранилища или импортом: нужен токен, выводимый из пароля */
  function enforceRoles(d) {
    ROLE = rolesOf(d);
    const t = d.titles, e = d.equip;
    d.pets = d.pets || { owned: ['sprout'], active: 'sprout' };
    d.pets.owned = Array.isArray(d.pets.owned) ? d.pets.owned : ['sprout'];
    if (ROLE.creator && !d.pets.owned.includes('dragon')) d.pets.owned.push('dragon');
    if (ROLE.admin && !d.pets.owned.includes('phoenix')) d.pets.owned.push('phoenix');
    if (!ROLE.creator) d.pets.owned = d.pets.owned.filter(x => x !== 'dragon');
    if (!ROLE.admin) d.pets.owned = d.pets.owned.filter(x => x !== 'phoenix');
    if (!d.pets.owned.includes(d.pets.active)) d.pets.active = 'sprout';
    if (!ROLE.creator) {
      t.creator = false; delete t.got.creator; if (t.active === 'creator') t.active = 'rookie';
      d.admin.mult = 1;
      ['th_creator', 'av_creator', 'fr_creator', 'bd_creator', 'sn_aurora'].forEach(id => { delete d.owned[id]; });
      if (d.theme === 'creator') d.theme = 'violet';
      if (e.avatar === 'av_creator') e.avatar = null;
      if (e.frame === 'fr_creator') e.frame = null;
      if (e.badge === 'bd_creator') e.badge = null;
      if (e.snake === 'aurora') e.snake = 'def';
    }
    if (!ROLE.admin) {
      delete t.got.admin; if (t.active === 'admin') t.active = 'rookie';
      if (e.badge === 'bd_admin') e.badge = null;
    }
  }
  /* приводит списки из хранилища/импорта к безопасному виду (строки, числа, id без спецсимволов) */
  function cleanData(d) {
    const base = defaultData();
    const sid = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || ('x' + Math.random().toString(36).slice(2, 10));
    const num = (v, lo, hi) => { v = +v; if (!Number.isFinite(v)) return lo; return Math.min(hi, Math.max(lo, v)); };
    const str = (v, n) => String(v == null ? '' : v).slice(0, n);
    const dt = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayStr();
    const list = (arr, fn, cap) => { const seen = new Set(), out = []; (Array.isArray(arr) ? arr : []).forEach(x => { if (!x || typeof x !== 'object' || out.length >= cap) return; const y = fn(x); if (seen.has(y.id)) return; seen.add(y.id); out.push(y); }); return out; };
    d.meals = list(d.meals, m => ({ id: sid(m.id), name: str(m.name, 80), cal: num(m.cal, 0, 20000), prot: num(m.prot, 0, 5000), fat: num(m.fat, 0, 5000), carb: num(m.carb, 0, 5000), type: ['breakfast', 'lunch', 'dinner', 'snack'].includes(m.type) ? m.type : 'snack', date: dt(m.date) }), 3000);
    d.customFoods = list(d.customFoods, f => ({ id: sid(f.id), n: str(f.n, 60), w: num(f.w, 1, 10000) || 100, c: num(f.c, 0, 2000), p: num(f.p, 0, 500), f: num(f.f, 0, 500), u: num(f.u, 0, 500), t: str(f.t, 20) }), 1000);
    d.reminders = list(d.reminders, r => ({
      id: sid(r.id), text: str(r.text, 200), when: num(r.when, 0, 8.64e15), fired: !!r.fired, done: !!r.done, firedAt: num(r.firedAt, 0, 8.64e15),
      category: str(r.category, 30) || 'Личное', repeat: ['daily', 'weekly'].includes(r.repeat) ? r.repeat : 'none',
      ntfySeq: r.ntfySeq ? sid(r.ntfySeq) : null, ntfyWhen: r.ntfyWhen ? num(r.ntfyWhen, 0, 8.64e15) : null
    }), 1000);
    d.diary = list(d.diary, e => ({ id: sid(e.id), date: dt(e.date), mood: ['😊','🙂','😐','😔','😴'].includes(e.mood) ? e.mood : '', text: str(e.text, 2000), updated: num(e.updated, 0, 8.64e15) }), 2000);
    d.walks = list(d.walks, w => ({
      id: sid(w.id), date: dt(w.date), start: num(w.start, 0, 8.64e15), ms: num(w.ms, 0, 864e5), dist: num(w.dist, 0, 1e6), steps: num(w.steps, 0, 5e6), kcal: num(w.kcal, 0, 1e5),
      pts: (Array.isArray(w.pts) ? w.pts : []).slice(0, 400).filter(p => p && Number.isFinite(+p.la) && Number.isFinite(+p.lo)).map(p => ({ la: +p.la, lo: +p.lo }))
    }), 500);
    d.rewards = list(d.rewards, r => ({ id: sid(r.id), name: str(r.name, 40), price: num(r.price, 1, 1e7), count: num(r.count, 0, 1e6) }), 200);
    const wt = d.water; wt.current = num(wt.current, 0, 100000); wt.goal = num(wt.goal, 500, 10000) || 2000; wt.date = dt(wt.date);
    d.profile = { ...base.profile, ...(d.profile && typeof d.profile === 'object' ? d.profile : {}) };
    d.profile.nova = { ...base.profile.nova, ...(d.profile.nova && typeof d.profile.nova === 'object' ? d.profile.nova : {}) };
    const np = d.profile.nova;
    np.setup = !!np.setup;
    np.activity = ['low','moderate','active','varied'].includes(np.activity) ? np.activity : 'moderate';
    if (!['study','work','free'].includes(np.mode)) np.mode = 'study';
    ['sports','days','trainingTime','schoolStart','schoolEnd','wake','sleep','focus'].forEach(k => { np[k] = String(np[k] || '').slice(0,160); });
    if (typeof d.profile.name !== 'string') d.profile.name = '';
    d.profile.name = d.profile.name.slice(0, 24);
    const h = {}; if (d.hist && typeof d.hist === 'object') Object.keys(d.hist).sort().slice(-120).forEach(k => { if (/^\d{4}-\d{2}-\d{2}$/.test(k)) h[k] = num(d.hist[k], 0, 100000); }); d.hist = h;
    const au = d.auth && typeof d.auth === 'object' ? d.auth : {}; d.auth = { a: typeof au.a === 'string' ? au.a.slice(0, 64) : null, c: typeof au.c === 'string' ? au.c.slice(0, 64) : null };
    const g = d.admin.grant; d.admin.grant = (g && typeof g === 'object') ? { date: dt(g.date), sum: num(g.sum, 0, 1e9) } : { date: '', sum: 0 };
    d.lastExport = num(d.lastExport, 0, 8.64e15);
    // home widgets
    {
      const defOrder = ['wallet','pet','stats','week','water','walk','rem','games'];
      const hw = (d.homeWidgets && typeof d.homeWidgets === 'object') ? d.homeWidgets : {};
      let order = Array.isArray(hw.order) ? hw.order.filter(x => defOrder.includes(x)) : [];
      defOrder.forEach(id => { if (!order.includes(id)) order.push(id); });
      const hidden = Array.isArray(hw.hidden) ? hw.hidden.filter(x => defOrder.includes(x)) : [];
      d.homeWidgets = { order, hidden };
    }

    if (typeof d.theme !== 'string') d.theme = 'violet';
  }

  const defaultStats = () => ({ tapBest: 0, reactionBest: null, memoryMoves: null, memoryTime: null, snakeBest: 0, g2048Best: 0, ttt: { w: 0, l: 0, d: 0 } });
  const defaultData = () => ({
    goals: { cal: 2000, prot: 120, fat: 70, carb: 250 },
    meals: [],
    water: { current: 0, goal: 2000, date: todayStr() },
    reminders: [],
    diary: [],
    profile: { name: '', done: false, weightLog: [], nova: { setup: false, mode: 'study', activity: 'moderate', sports: '', days: '', trainingTime: '', schoolStart: '', schoolEnd: '', wake: '07:00', sleep: '22:00', focus: '' } },
    theme: 'violet',
    ntfy: { enabled: false, topic: '' },
    stats: defaultStats(),
    admin: { tapSeconds: 10, norms: {}, prices: {}, mult: 1, grant: { date: '', sum: 0 } },
    coins: { bal: 0, earned: 0, spent: 0 },
    inv: { life: 0, undo: 0, hint: 0, slow: 0 },
    owned: {},
    pets: { owned: ['sprout'], active: 'sprout', food: { berry: 2, fish: 0, carrot: 0, cake: 0 }, hunger: 75, energy: 80, mood: 'awake', updated: Date.now() },
    equip: { snake: 'def', t2048: 'def', mem: 'def', ttt: 'def', badge: null, avatar: null, frame: null },
    titles: { got: { rookie: 1 }, active: 'rookie', creator: false, creatorAuto: false },
    streak: { last: null, count: 0, best: 0 },
    daily: { water: null, walk: null, meal: null },
    cnt: { games: {}, total: 0, dist: 0, waterDays: 0, remDone: 0, meals: 0, lottery: 0, bought: 0, won2048: 0 },
    rewards: [],
    customFoods: [],
    walks: [],
    mode: 'dark',
    homeWidgets: { order: ['wallet','pet','stats','week','water','walk','rem','games'], hidden: [] },
    auth: { a: null, c: null },
    hist: {},
    lastExport: 0,
    ui: 'classic',
    ach: {},
    planLog: {}
  });

  let data = load();
  let toastT;
  let remTimers = new Map();
  let activeGame = null;
  let gameCleanups = [];

  /* Приводит данные (из хранилища или импорта) к актуальной структуре */
  function normalizeData(d) {
    const base = defaultData();
    d = { ...base, ...(d && typeof d === 'object' ? d : {}) };
    d.stats = { ...base.stats, ...(d.stats || {}) };
    d.stats.ttt = { ...base.stats.ttt, ...(d.stats.ttt || {}) };
    d.admin = { ...base.admin, ...(d.admin || {}) };
    if (!d.admin.norms || typeof d.admin.norms !== 'object') d.admin.norms = {};
    d.admin.tapSeconds = Math.min(60, Math.max(5, Math.round(+d.admin.tapSeconds) || 10));
    d.admin.prices = (d.admin.prices && typeof d.admin.prices === 'object') ? d.admin.prices : {};
    d.admin.mult = Math.min(1000, Math.max(1, Math.round(+d.admin.mult) || 1));
    ['coins', 'inv', 'owned', 'equip', 'titles', 'streak', 'daily', 'cnt'].forEach(k => { d[k] = { ...base[k], ...(d[k] && typeof d[k] === 'object' ? d[k] : {}) }; });
    d.pets = { ...base.pets, ...(d.pets && typeof d.pets === 'object' ? d.pets : {}) };
    d.pets.owned = Array.isArray(d.pets.owned) ? [...new Set(d.pets.owned.filter(x => typeof x === 'string'))] : ['sprout'];
    if (!d.pets.owned.includes('sprout')) d.pets.owned.unshift('sprout');
    if (!d.pets.owned.includes(d.pets.active)) d.pets.active = 'sprout';
    d.pets.food = { berry: 2, fish: 0, carrot: 0, cake: 0, ...(d.pets.food || {}) };
    ['berry','fish','carrot','cake'].forEach(k => d.pets.food[k] = Math.max(0, Math.floor(+d.pets.food[k] || 0)));
    d.pets.hunger = Math.max(0, Math.min(100, +d.pets.hunger || 0)); d.pets.energy = Math.max(0, Math.min(100, +d.pets.energy || 0));
    d.pets.mood = ['awake','sleeping'].includes(d.pets.mood) ? d.pets.mood : 'awake'; d.pets.updated = +d.pets.updated || Date.now();
    ['bal', 'earned', 'spent'].forEach(k => { d.coins[k] = Math.max(0, Math.round(+d.coins[k]) || 0); });
    ['life', 'undo', 'hint', 'slow'].forEach(k => { d.inv[k] = Math.max(0, Math.round(+d.inv[k]) || 0); });
    if (!d.cnt.games || typeof d.cnt.games !== 'object') d.cnt.games = {};
    if (!d.titles.got || typeof d.titles.got !== 'object') d.titles.got = { rookie: 1 };
    if (!Array.isArray(d.rewards)) d.rewards = [];
    if (!d.profile || typeof d.profile !== 'object') d.profile = base.profile;
    d.profile.weightLog = Array.isArray(d.profile.weightLog) ? d.profile.weightLog.filter(x => x && Number.isFinite(+x.kg) && +x.kg >= 25 && +x.kg <= 300 && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date))).map(x => ({ kg: Math.round(+x.kg * 10) / 10, date: String(x.date) })).sort((a,b) => a.date.localeCompare(b.date)).slice(-60) : [];
    if (!d.cnt || !d.cnt.init) {
      d.cnt = { ...base.cnt, ...(d.cnt || {}), init: true };
      d.cnt.dist = (Array.isArray(d.walks) ? d.walks : []).reduce((a, w) => a + (+w.dist || 0), 0);
      d.cnt.meals = Array.isArray(d.meals) ? d.meals.length : 0;
    }
    ['goals', 'water'].forEach(k => { if (!d[k] || typeof d[k] !== 'object') d[k] = base[k]; });
    ['meals', 'reminders', 'customFoods', 'walks', 'diary'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
    if (d.ui !== 'beta') d.ui = 'classic';
    if (!d.ach || typeof d.ach !== 'object') d.ach = {};
    if (!d.planLog || typeof d.planLog !== 'object') d.planLog = {};
    cleanData(d);
    enforceRoles(d);
    return d;
  }
  function load() {
    let d;
    try {
      const raw = localStorage.getItem(KEY);
      d = normalizeData(raw ? JSON.parse(raw) : null);
    } catch { d = normalizeData(null); }
    /* перенос рекордов из старых отдельных ключей */
    try {
      const sn = localStorage.getItem('luma-snake'), g = localStorage.getItem('luma-2048'), tt = localStorage.getItem('luma-ttt');
      if (sn != null) { d.stats.snakeBest = Math.max(d.stats.snakeBest, +sn || 0); localStorage.removeItem('luma-snake'); }
      if (g != null) { d.stats.g2048Best = Math.max(d.stats.g2048Best, +g || 0); localStorage.removeItem('luma-2048'); }
      if (tt != null) { const o = JSON.parse(tt); d.stats.ttt = { w: +o.w || 0, l: +o.l || 0, d: +o.d || 0 }; localStorage.removeItem('luma-ttt'); }
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {}
    return d;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); scheduleDeviceSnapshot(); }
    catch { toast('Не удалось сохранить'); }
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }

  /* ----- Themes ----- */
  const themes = {
    violet: { a: '#51258b', b: '#30216f', c: '#100820' },
    ocean:  { a: '#126b85', b: '#173b70', c: '#071c35' },
    rose:   { a: '#873b72', b: '#55234f', c: '#250d2d' },
    forest: { a: '#27634e', b: '#183f3b', c: '#0c201b' },
    sunset: { a: '#9a4a2a', b: '#5a2a20', c: '#2a1010' },
    neon:   { a: '#8a1fa8', b: '#2a1170', c: '#0b0420' },
    gold:   { a: '#8a6a12', b: '#4a3410', c: '#1c1405' },
    cosmos: { a: '#1f3a9a', b: '#3a1a6e', c: '#050818' },
    sakura: { a: '#a8456f', b: '#5e2a5a', c: '#2a0f24' },
    creator: { a: '#5b21b6', b: '#0e7490', c: '#07041a' }
  };
  const lightThemes = {
    violet: { a: '#e3d1ff', b: '#d6defe', c: '#f6f1ff' },
    ocean:  { a: '#c4ecf9', b: '#d2e2ff', c: '#eef8ff' },
    rose:   { a: '#fbd0ea', b: '#e7d2f7', c: '#fff2fa' },
    forest: { a: '#c9efdc', b: '#cdebee', c: '#f0fbf5' },
    sunset: { a: '#ffd9c4', b: '#f8d3d0', c: '#fff4ec' },
    neon:   { a: '#f3c6ff', b: '#d9d0ff', c: '#fbf0ff' },
    gold:   { a: '#fbe7a6', b: '#f1dcc0', c: '#fff9e8' },
    cosmos: { a: '#c9d4ff', b: '#e0cdf8', c: '#f1f3ff' },
    sakura: { a: '#fbc6dc', b: '#ecd0ee', c: '#fff0f6' },
    creator: { a: '#d8c4ff', b: '#bdeaf5', c: '#f4f0ff' }
  };
  const effMode = () => {
    const m = data.mode || 'dark';
    if (m === 'auto') return (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    return m;
  };
  function paintBg() {
    const eff = effMode();
    const set = eff === 'light' ? lightThemes : themes;
    const t = set[data.theme] || set.violet;
    document.documentElement.setAttribute('data-mode', eff);
    document.documentElement.setAttribute('data-theme', data.theme);
    const ACC = eff === 'light'
      ? { violet: '#6d28d9', ocean: '#0369a1', rose: '#a21caf', forest: '#15803d', sunset: '#c2410c', neon: '#a21caf', gold: '#a16207', cosmos: '#1d4ed8', sakura: '#be185d', creator: '#0f766e' }
      : { violet: '#c4b5fd', ocean: '#7dd3fc', rose: '#f0abfc', forest: '#86efac', sunset: '#fdba74', neon: '#f0abfc', gold: '#fcd34d', cosmos: '#93c5fd', sakura: '#f9a8d4', creator: '#a7f3d0' };
    const acc = ACC[data.theme] || ACC.violet, rs = document.documentElement.style;
    rs.setProperty('--page', t.c); rs.setProperty('--sheet-bg', t.c);
    rs.setProperty('--accent', acc); rs.setProperty('--violet', acc); rs.setProperty('--primary', acc);
    document.body.style.background = t.c;
    document.body.style.backgroundAttachment = 'fixed';
    const mt = document.querySelector('meta[name="theme-color"]');
    if (mt) mt.setAttribute('content', t.c);
  }
  function applyTheme(name) {
    data.theme = (themes[name] && (name !== 'creator' || ROLE.creator)) ? name : 'violet';
    document.querySelectorAll('.theme-swatch').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === data.theme);
    });
    paintBg();
    save();
  }
  function applyMode(m) {
    data.mode = (m === 'light' || m === 'auto') ? m : 'dark';
    document.querySelectorAll('#modeRow [data-mode]').forEach(b => {
      b.classList.toggle('secondary', b.dataset.mode !== data.mode);
    });
    paintBg();
    save();
  }
  window.applyMode = applyMode;
  document.querySelectorAll('#modeRow [data-mode]').forEach(b => { b.onclick = () => applyMode(b.dataset.mode); });
  try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (data.mode === 'auto') paintBg(); }); } catch {}

  /* ----- Sheets (modal windows) ----- */
  function openSheet(id) {
    closeSheets(true);
    const el = $(id); if (!el) return;
    el.classList.add('show'); el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('noscroll');
    const sh = el.querySelector('.sheet'); if (sh) sh.scrollTop = 0;
    if (id === 'sheetPick') { const q = $('foodSearch'); q.value = ''; renderFoodButtons(); offClear(); }
  }
  function closeSheets(keepScroll) {
    document.querySelectorAll('.sheet-back.show').forEach(e => { e.classList.remove('show'); e.setAttribute('aria-hidden', 'true'); });
    if (!keepScroll) document.body.classList.remove('noscroll');
  }
  window.openSheet = openSheet; window.closeSheets = closeSheets;
  document.querySelectorAll('.sheet-back').forEach(back => {
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) closeSheets(); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });

  /* ----- Navigation ----- */
  function goTab(name) {
    if (!name) return;
    name = String(name);
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
      if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('.page').forEach(p => {
      const on = p.id === 'page-' + name;
      p.classList.toggle('active', on);
      // force display for stubborn mobile webviews
      p.style.display = on ? 'block' : 'none';
    });
    try {
      if (name === 'home') renderHome();
      if (name === 'pets') renderPets();
      if (name === 'nutrition') renderNutrition();
      if (name === 'reminders') { renderReminders(); initRemDefaults(); }
      if (name === 'diary') { diaryLoadEntry(); diaryRender(); diaryRenderEvents(); }
      if (name === 'walk') { renderWalk(); }
      if (name === 'games') { exitGame(); }
      if (name === 'settings') { updateNotifUI(); renderBackupInfo(); }
      if (name === 'shop') renderShop();
      if (name === 'nova') { /* Nova uses current local data */ }
    } catch (e) { console.error(e); }
    try { window.scrollTo(0, 0); } catch {}
  }
  window.goTab = goTab;

  /* ----- Home ----- */
  function greeting() {
    const h = new Date().getHours();
    const name = data.profile.name ? ', ' + data.profile.name : '';
    if (h < 5) return 'Доброй ночи' + name;
    if (h < 12) return 'Доброе утро' + name;
    if (h < 18) return 'Добрый день' + name;
    return 'Добрый вечер' + name;
  }

  function resetWaterIfNeeded() {
    if (data.water.date !== todayStr()) {
      if (data.water.current > 0 && data.water.date) data.hist[data.water.date] = data.water.current;
      const ks = Object.keys(data.hist).sort(); while (ks.length > 120) delete data.hist[ks.shift()];
      data.water.current = 0;
      data.water.date = todayStr();
      save();
    }
  }

  function renderHome() {
    resetWaterIfNeeded();
    try { applyHomeWidgets(); } catch (e) {}

    try { updateWallet(); } catch (e) { console.error(e); }
    try { renderHomeWalk(); } catch (e) { console.error(e); }
    $('greeting').textContent = greeting() + '. Вот твоя сводка.';
    try { renderPets(); } catch (e) { console.error(e); }
    const meals = data.meals.filter(m => m.date === todayStr());
    const cal = meals.reduce((s, m) => s + (m.cal || 0), 0);
    $('homeCal').textContent = Math.round(cal);
    $('homeWater').textContent = data.water.current;
    const active = data.reminders.filter(r => !r.done).length;
    $('homeRem').textContent = active;

    const pct = Math.min(100, (data.water.current / data.water.goal) * 100);
    $('waterFill').style.width = pct + '%';
    $('waterTag').textContent = `${data.water.current} / ${data.water.goal}`;

    try { renderWeek(); } catch (e) { console.error(e); }
    try { renderBetaHomeExtras(); } catch (e) {}
    try { if ($('page-achievements')?.classList.contains('active')) renderAchievements(); } catch (e) {}
    const list = $('homeRemList');
    const upcoming = data.reminders
      .filter(r => !r.done)
      .sort((a, b) => a.when - b.when)
      .slice(0, 3);
    if (!upcoming.length) {
      list.innerHTML = '<div class="empty"><div class="orb"></div>Нет активных напоминаний</div>';
    } else {
      list.innerHTML = '';
      upcoming.forEach(r => list.appendChild(remItem(r, true)));
    }
  }


  /* ----- Неделя: график за 7 дней ----- */
  let weekMode = 'cal';
  function weekData(mode) {
    const out = [], now = new Date(), names = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const ds = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      let v = 0;
      if (mode === 'cal') v = data.meals.filter(m => m.date === ds).reduce((s, m) => s + (m.cal || 0), 0);
      else if (mode === 'water') v = ds === todayStr() ? data.water.current : (data.hist[ds] || 0);
      else v = data.walks.filter(w => w.date === ds).reduce((s, w) => s + (w.ms || 0), 0) / 60000;
      out.push({ v: Math.round(v), label: names[d.getDay()], today: i === 0 });
    }
    return out;
  }
  function renderWeek() {
    const chart = $('weekChart'); if (!chart) return;
    document.querySelectorAll('#weekTabs [data-wk]').forEach(b => b.classList.toggle('on', b.dataset.wk === weekMode));
    const unit = { cal: 'ккал', water: 'мл', walk: 'мин' }[weekMode];
    const days = weekData(weekMode), max = Math.max(1, ...days.map(x => x.v));
    const active = days.filter(x => x.v > 0), avg = active.length ? Math.round(active.reduce((s, x) => s + x.v, 0) / active.length) : 0;
    $('weekAvg').textContent = avg ? 'в среднем ' + fmtN(avg) + ' ' + unit : 'нет данных';
    chart.innerHTML = days.map(x => '<div class="wk-col' + (x.today ? ' today' : '') + '"><b>' + (x.v ? fmtN(x.v) : '') + '</b><div class="wk-bar" style="height:' + Math.max(3, Math.round(x.v / max * 78)) + '%"></div><small>' + x.label + '</small></div>').join('');
  }
  (function () { const t = $('weekTabs'); if (t) t.addEventListener('click', e => { const b = e.target.closest('[data-wk]'); if (!b) return; weekMode = b.dataset.wk; renderWeek(); }); })();

  /* ----- Бэкап ----- */
  function renderBackupInfo() {
    const el = $('backupInfo'); if (!el) return;
    el.textContent = data.lastExport ? 'Последний экспорт: ' + new Date(data.lastExport).toLocaleDateString('ru-RU') : 'Экспорт ещё не делали.';
  }
  function backupNudge() {
    const days = data.lastExport ? (Date.now() - data.lastExport) / 86400000 : 0;
    const hasData = data.meals.length || data.walks.length || data.coins.earned > 100;
    if (hasData && ((data.lastExport && days > 14) || (!data.lastExport && (data.streak.best || 0) >= 7))) setTimeout(() => toast('💾 Давно не было бэкапа: «Ещё» → «Экспорт»'), 5000);
  }

  window.addWater = function(ml) {
    resetWaterIfNeeded();
    if (ml === 0) data.water.current = 0;
    else data.water.current = Math.min(100000, data.water.current + ml);
    data.hist[todayStr()] = data.water.current;
    save();
    if (ml > 0 && data.water.current >= data.water.goal && data.daily.water !== todayStr()) {
      data.daily.water = todayStr(); data.cnt.waterDays++;
      addCoins(15, { pop: 'норма воды' });
    }
    renderHome();
    if (ml) toast('+' + ml + ' мл воды');
  };

  window.addCustomWater = function() {
    const el = $('waterCustom');
    const ml = Math.round(+el.value);
    if (!Number.isFinite(ml) || ml < 1) { toast('Введи объём в мл'); el.focus(); return; }
    if (ml > 5000) { toast('Не больше 5000 мл за раз'); return; }
    window.addWater(ml);
    el.value = '';
  };
  $('waterCustom').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); window.addCustomWater(); } });

  /* ----- Nutrition ----- */
  function renderNutrition() {
    const g = data.goals;
    $('goalCal').value = g.cal;
    $('goalProt').value = g.prot;
    $('goalFat').value = g.fat;
    $('goalCarb').value = g.carb;
    $('lblCal').textContent = g.cal;
    $('lblProt').textContent = g.prot;
    $('lblFat').textContent = g.fat;
    $('lblCarb').textContent = g.carb;

    const meals = data.meals.filter(m => m.date === todayStr());
    let cal = 0, prot = 0, fat = 0, carb = 0;
    meals.forEach(m => {
      cal += m.cal || 0; prot += m.prot || 0; fat += m.fat || 0; carb += m.carb || 0;
    });
    $('curCal').textContent = Math.round(cal);
    $('curProt').textContent = Math.round(prot * 10) / 10;
    $('curFat').textContent = Math.round(fat * 10) / 10;
    $('curCarb').textContent = Math.round(carb * 10) / 10;
    setBar('fillCal', cal, g.cal);
    setBar('fillProt', prot, g.prot);
    setBar('fillFat', fat, g.fat);
    setBar('fillCarb', carb, g.carb);
    $('mealCount').textContent = meals.length;

    const list = $('mealsList');
    const typeNames = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
    if (!meals.length) {
      list.innerHTML = '<div class="empty">Пока пусто — добавь первый приём</div>';
      return;
    }
    list.innerHTML = '';
    meals.forEach(m => {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `
        <div class="body">
          <strong>${esc(m.name)}</strong>
          <span>${typeNames[m.type] || m.type} · ${m.cal} ккал · Б ${m.prot || 0} · Ж ${m.fat || 0} · У ${m.carb || 0}</span>
        </div>
        <div class="item-actions">
          <button type="button" data-del="${m.id}">Удалить</button>
        </div>`;
      el.querySelector('[data-del]').onclick = () => {
        data.meals = data.meals.filter(x => x.id !== m.id);
        save();
        renderNutrition();
        renderHome();
        toast('Удалено');
      };
      list.appendChild(el);
    });
  }

  function setBar(id, val, goal) {
    $(id).style.width = Math.min(100, (val / Math.max(1, goal)) * 100) + '%';
  }

  window.saveGoals = function() {
    data.goals = {
      cal: +$('goalCal').value || 2000,
      prot: +$('goalProt').value || 120,
      fat: +$('goalFat').value || 70,
      carb: +$('goalCarb').value || 250
    };
    save();
    renderNutrition();
    toast('Цели сохранены');
  };

  $('mealForm').addEventListener('submit', e => {
    e.preventDefault();
    data.meals.push({
      id: 'm' + Date.now(),
      name: $('mealName').value.trim(),
      cal: +$('mealCal').value || 0,
      prot: +$('mealProt').value || 0,
      fat: +$('mealFat').value || 0,
      carb: +$('mealCarb').value || 0,
      type: $('mealType').value,
      date: todayStr()
    });
    const cutoff = Date.now() - 60 * 86400000;
    data.meals = data.meals.filter(m => new Date(m.date).getTime() > cutoff);
    data.cnt.meals++;
    save();
    addCoins(2, { pop: 'приём пищи' });
    {
      const dayCal = data.meals.filter(m => m.date === todayStr()).reduce((a, m) => a + (m.cal || 0), 0), gc = data.goals.cal;
      if (gc > 0 && dayCal >= gc * 0.9 && dayCal <= gc * 1.1 && data.daily.meal !== todayStr()) { data.daily.meal = todayStr(); addCoins(15, { pop: 'калории в цель' }); }
    }
    e.target.reset();
    renderNutrition();
    renderHome();
    toast('Приём пищи добавлен');
  });

  /* Значения на 100 г: c — ккал, p — белки, f — жиры, u — углеводы; w — стандартная порция, г */
  const MEAL_PRESETS = [
    { n: 'Овсяная каша на воде', w: 250, c: 60, p: 2, f: 1.2, u: 10.8, t: 'breakfast' },
    { n: 'Овсяная каша на молоке', w: 250, c: 86, p: 3.2, f: 2.8, u: 12.4, t: 'breakfast' },
    { n: 'Гречневая каша', w: 200, c: 92.5, p: 3.5, f: 0.75, u: 19, t: 'lunch' },
    { n: 'Рис варёный', w: 200, c: 130, p: 2.7, f: 0.3, u: 28, t: 'lunch' },
    { n: 'Макароны варёные', w: 200, c: 158, p: 5.8, f: 0.9, u: 31, t: 'lunch' },
    { n: 'Картофельное пюре', w: 200, c: 110, p: 2, f: 4, u: 16, t: 'dinner' },
    { n: 'Куриная грудка варёная', w: 150, c: 165, p: 30.7, f: 3.6, u: 0, t: 'lunch' },
    { n: 'Яйцо варёное', w: 50, c: 156, p: 12.6, f: 10.6, u: 1.2, t: 'breakfast', step: 50, unit: 'шт' },
    { n: 'Омлет из 2 яиц', w: 150, c: 147, p: 9.3, f: 11.3, u: 1.3, t: 'breakfast' },
    { n: 'Творог 5%', w: 150, c: 121, p: 17.3, f: 5, u: 1.8, t: 'snack' },
    { n: 'Йогурт натуральный', w: 150, c: 60, p: 3.3, f: 3.3, u: 4.7, t: 'snack' },
    { n: 'Банан', w: 120, c: 88, p: 1.1, f: 0.3, u: 22.5, t: 'snack' },
    { n: 'Яблоко', w: 180, c: 52, p: 0.3, f: 0.2, u: 13.8, t: 'snack' },
    { n: 'Бутерброд с сыром', w: 80, c: 250, p: 11.3, f: 12.5, u: 22.5, t: 'breakfast' },
    { n: 'Борщ', w: 300, c: 50, p: 2, f: 2.3, u: 5, t: 'lunch' },
    { n: 'Куриный суп', w: 300, c: 40, p: 2.7, f: 1.3, u: 4, t: 'lunch' },
    { n: 'Овощной салат с маслом', w: 200, c: 60, p: 1, f: 4.5, u: 4, t: 'dinner' }
  ];
  const fmt1 = v => Math.round(v * 10) / 10;
  let curPreset = null;
  function recalcPortion(fromRange) {
    if (!curPreset) return;
    let w = +$('portionWeight').value;
    if (!Number.isFinite(w) || w < 0) w = 0;
    const k = w / 100, m = curPreset;
    const cal = Math.round(m.c * k), pr = fmt1(m.p * k), fa = fmt1(m.f * k), ca = fmt1(m.u * k);
    $('mealName').value = m.n + ' (' + w + ' г)';
    $('mealCal').value = cal;
    $('mealProt').value = pr;
    $('mealFat').value = fa;
    $('mealCarb').value = ca;
    $('mealType').value = m.t;
    $('portionRange').value = Math.min(Math.max(w, +$('portionRange').min), +$('portionRange').max);
    $('portionCalc').innerHTML = '<b>' + cal + ' ккал</b> · Б ' + pr + ' г · Ж ' + fa + ' г · У ' + ca + ' г<br><span class="muted">На 100 г: ' + m.c + ' ккал · Б ' + m.p + ' · Ж ' + m.f + ' · У ' + m.u + '</span>';
  }
  function setWeight(w) {
    w = Math.max(5, Math.min(2000, Math.round(w)));
    $('portionWeight').value = w;
    recalcPortion();
  }
  const allFoods = () => MEAL_PRESETS.concat(data.customFoods || []);
  function pickFood(m) {
    curPreset = m;
    $('portionBox').classList.add('show');
    $('portionTitle').textContent = m.n + ' — сколько грамм?';
    const chips = $('portionChips');
    chips.innerHTML = '';
    [0.5, 1, 1.5, 2].forEach(f => {
      const val = Math.max(1, Math.round(m.w * f));
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'btn secondary small';
      c.textContent = val + ' г';
      c.onclick = () => setWeight(val);
      chips.appendChild(c);
    });
    $('portionRange').max = Math.max(600, m.w * 3);
    setWeight(m.w);
    $('presetHint').textContent = 'Измени вес — калории, белки, жиры и углеводы пересчитаются сами. Затем нажми «Добавить».';
    closeSheets();
    setTimeout(() => { try { $('portionBox').scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {} }, 80);
  }
  function renderFoodButtons() {
    const box = $('mealPresets');
    if (!box) return;
    const q = ($('foodSearch').value || '').trim().toLowerCase();
    box.innerHTML = '';
    const list = allFoods().filter(m => !q || m.n.toLowerCase().includes(q));
    list.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'food-row';
      b.innerHTML = '<span>' + (m.id ? '⭐ ' : '') + esc(m.n) + '<small>' + m.w + ' г · на 100 г: Б ' + m.p + ' · Ж ' + m.f + ' · У ' + m.u + '</small></span><span class="kc">' + Math.round(m.c * m.w / 100) + ' ккал</span>';
      b.addEventListener('click', () => pickFood(m));
      box.appendChild(b);
    });
    if (!list.length) box.innerHTML = '<span class="notice" style="margin:0">Ничего не найдено — добавь своё блюдо кнопкой ниже</span>';
  }
  /* ----- Мои блюда ----- */
  let editingFood = null;
  function renderCustomFoods() {
    const list = $('cfList');
    const arr = data.customFoods || [];
    $('cfCount').textContent = arr.length;
    if (!arr.length) { list.innerHTML = '<div class="empty" style="padding:12px">Пока нет своих блюд</div>'; return; }
    list.innerHTML = '';
    arr.forEach(m => {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `<div class="body"><strong>${esc(m.n)}</strong><span>${m.c} ккал · Б ${m.p} · Ж ${m.f} · У ${m.u} — на 100 г · порция ${m.w} г</span></div>
        <div class="item-actions"><button type="button" data-use>Выбрать</button><button type="button" data-edit>Изменить</button><button type="button" data-del>Удалить</button></div>`;
      el.querySelector('[data-use]').onclick = () => { pickFood(m); };
      el.querySelector('[data-edit]').onclick = () => {
        editingFood = m.id;
        $('cfName').value = m.n; $('cfCal').value = m.c; $('cfProt').value = m.p; $('cfFat').value = m.f; $('cfCarb').value = m.u;
        $('cfWeight').value = m.w; $('cfType').value = m.t;
        $('cfSave').textContent = '✓ Сохранить изменения';
        $('cfCancel').style.display = '';
        try { $('cfName').scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      };
      el.querySelector('[data-del]').onclick = () => {
        if (!confirm('Удалить «' + m.n + '»?')) return;
        data.customFoods = data.customFoods.filter(x => x.id !== m.id);
        save(); renderCustomFoods(); renderFoodButtons();
        if (curPreset && curPreset.id === m.id) { curPreset = null; $('portionBox').classList.remove('show'); }
        toast('Блюдо удалено');
      };
      list.appendChild(el);
    });
  }
  function resetCfForm() {
    editingFood = null;
    ['cfName', 'cfCal', 'cfProt', 'cfFat', 'cfCarb'].forEach(i => $(i).value = '');
    $('cfWeight').value = 100; $('cfType').value = 'snack';
    $('cfSave').textContent = '＋ Сохранить блюдо';
    $('cfCancel').style.display = 'none';
  }
  $('cfSave').addEventListener('click', () => {
    const name = $('cfName').value.trim();
    const num = id => { const v = parseFloat(String($(id).value).replace(',', '.')); return Number.isFinite(v) && v >= 0 ? v : 0; };
    if (!name) { toast('Введи название'); $('cfName').focus(); return; }
    if ($('cfCal').value === '') { toast('Укажи калории на 100 г'); $('cfCal').focus(); return; }
    const w = num('cfWeight') || 100;
    const item = { id: editingFood || 'cf' + Date.now(), n: name, w: w, c: fmt1(num('cfCal')), p: fmt1(num('cfProt')), f: fmt1(num('cfFat')), u: fmt1(num('cfCarb')), t: $('cfType').value };
    if (!Array.isArray(data.customFoods)) data.customFoods = [];
    const i = data.customFoods.findIndex(x => x.id === item.id);
    if (i >= 0) data.customFoods[i] = item; else data.customFoods.push(item);
    save();
    toast(i >= 0 ? 'Блюдо обновлено' : 'Блюдо добавлено ⭐');
    resetCfForm(); renderCustomFoods(); renderFoodButtons();
  });
  $('cfCancel').addEventListener('click', resetCfForm);
  (function setupPresets() {
    $('foodSearch').addEventListener('input', renderFoodButtons);
    renderFoodButtons();
    renderCustomFoods();
    $('portionWeight').addEventListener('input', () => recalcPortion());
    $('portionRange').addEventListener('input', e => { $('portionWeight').value = e.target.value; recalcPortion(); });
    $('wMinus').addEventListener('click', () => setWeight((+$('portionWeight').value || 0) - ((curPreset && curPreset.step) || 10)));
    $('wPlus').addEventListener('click', () => setWeight((+$('portionWeight').value || 0) + ((curPreset && curPreset.step) || 10)));
  })();
  window._refreshFoods = () => { renderFoodButtons(); renderCustomFoods(); };
  /* ----- Онлайн-поиск продуктов: Open Food Facts (бесплатно, без ключа, без своего сервера) ----- */
  const OFF = {
    base: 'https://world.openfoodfacts.org',
    fields: 'code,product_name,product_name_ru,brands,nutriments,serving_quantity',
    cache: new Map(), ctl: null, tm: null, seq: 0
  };
  const offIsCode = q => /^\d{8,14}$/.test(q);
  function offClear() {
    clearTimeout(OFF.tm); OFF.seq++;
    if (OFF.ctl) { try { OFF.ctl.abort(); } catch {} }
    const b = $('offBox'); if (b) b.hidden = true;
    const r = $('offResults'); if (r) r.innerHTML = '';
  }
  /* приводит продукт из ответа к формату блюда Luma (значения на 100 г); без калорий — отбрасывает */
  function offItem(p) {
    const n = p && p.nutriments; if (!n || typeof n !== 'object') return null;
    let kcal = parseFloat(n['energy-kcal_100g']);
    if (!Number.isFinite(kcal)) { const kj = parseFloat(n['energy_100g']); if (Number.isFinite(kj)) kcal = kj / 4.184; }
    if (!Number.isFinite(kcal) || kcal < 0 || kcal > 950) return null;
    const g = k => { const v = parseFloat(n[k]); return Number.isFinite(v) && v >= 0 && v <= 100 ? fmt1(v) : 0; };
    const name = String(p.product_name_ru || p.product_name || '').trim().slice(0, 60); if (!name) return null;
    const brand = String(p.brands || '').split(',')[0].trim().slice(0, 30);
    let w = parseFloat(p.serving_quantity); if (!(w >= 5 && w <= 1000)) w = 100;
    return { n: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? name + ' (' + brand + ')' : name, w: Math.round(w), c: Math.round(kcal), p: g('proteins_100g'), f: g('fat_100g'), u: g('carbohydrates_100g'), t: 'snack' };
  }
  async function offFetch(url, ctl) {
    const to = setTimeout(() => { try { ctl.abort(); } catch {} }, 9000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } finally { clearTimeout(to); }
  }
  function offRender(items) {
    const res = $('offResults'), st = $('offStatus'); if (!res) return;
    res.innerHTML = '';
    items.forEach(it => {
      const row = document.createElement('div'); row.className = 'off-row';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'food-row';
      b.innerHTML = '<span>' + esc(it.n) + '<small>' + it.w + ' г · на 100 г: Б ' + it.p + ' · Ж ' + it.f + ' · У ' + it.u + '</small></span><span class="kc">' + it.c + ' ккал</span>';
      b.addEventListener('click', () => pickFood(it));
      const s = document.createElement('button'); s.type = 'button'; s.className = 'off-save'; s.textContent = '⭐'; s.title = 'Сохранить в «Мои блюда»'; s.setAttribute('aria-label', 'Сохранить в мои блюда');
      s.addEventListener('click', () => {
        if (!Array.isArray(data.customFoods)) data.customFoods = [];
        if (data.customFoods.some(x => x.n === it.n)) { toast('Уже есть в «Моих блюдах»'); return; }
        data.customFoods.push(Object.assign({}, it, { id: 'cf' + Date.now() + Math.floor(Math.random() * 1000) }));
        save(); renderCustomFoods(); renderFoodButtons(); toast('Сохранено в «Мои блюда» ⭐');
      });
      row.appendChild(b); row.appendChild(s); res.appendChild(row);
    });
    st.textContent = items.length ? 'Данные Open Food Facts вносят пользователи — сверяй с упаковкой.' : 'Онлайн ничего не найдено. Добавь продукт вручную кнопкой ниже.';
  }
  async function offSearch(q) {
    const box = $('offBox'), res = $('offResults'), st = $('offStatus'); if (!box) return;
    const my = ++OFF.seq;
    if (OFF.ctl) { try { OFF.ctl.abort(); } catch {} }
    const ctl = OFF.ctl = new AbortController();
    box.hidden = false;
    const key = q.toLowerCase();
    if (OFF.cache.has(key)) { offRender(OFF.cache.get(key)); return; }
    res.innerHTML = '';
    if (navigator.onLine === false) { st.textContent = 'Нет интернета — онлайн-поиск недоступен.'; return; }
    st.textContent = 'Ищу…';
    try {
      let items;
      if (offIsCode(q)) {
        const j = await offFetch(OFF.base + '/api/v2/product/' + q + '.json?fields=' + OFF.fields, ctl);
        const it = j && j.status === 1 ? offItem(j.product) : null; items = it ? [it] : [];
      } else {
        const j = await offFetch(OFF.base + '/cgi/search.pl?search_simple=1&action=process&json=1&page_size=20&lc=ru&fields=' + OFF.fields + '&search_terms=' + encodeURIComponent(q), ctl);
        items = (j && Array.isArray(j.products) ? j.products : []).map(offItem).filter(Boolean).slice(0, 12);
      }
      if (my !== OFF.seq) return;
      if (OFF.cache.size > 40) OFF.cache.delete(OFF.cache.keys().next().value);
      OFF.cache.set(key, items);
      offRender(items);
    } catch (e) {
      if (my !== OFF.seq) return;
      res.innerHTML = '';
      st.textContent = e && e.name === 'AbortError' ? 'Сервис не ответил вовремя. Попробуй ещё раз.' : 'Не удалось связаться с Open Food Facts. Проверь интернет.';
    }
  }
  (function setupOff() {
    const inp = $('foodSearch'); if (!inp) return;
    inp.addEventListener('input', () => {
      clearTimeout(OFF.tm);
      const q = inp.value.trim();
      if (q.length < 3 && !offIsCode(q)) { offClear(); return; }
      OFF.tm = setTimeout(() => offSearch(q), 600);
    });
  })();

  $('mealForm').addEventListener('reset', () => { setTimeout(() => { const h = $('presetHint'); if (h) h.textContent = ''; curPreset = null; $('portionBox').classList.remove('show'); }, 0); });

  /* ----- Reminders ----- */
  let remUserEdited = false;
  function initRemDefaults(keepIfEdited) {
    try {
      const dateEl = document.getElementById('remDate');
      const timeEl = document.getElementById('remTime');
      if (!dateEl || !timeEl) return;
      if (keepIfEdited === true && remUserEdited && dateEl.value && timeEl.value) return;
      const next = new Date();
      // Next full hour: 20:34 -> 21:00; 23:20 -> 00:00 next day
      next.setHours(next.getHours() + 1, 0, 0, 0);
      const yyyy = next.getFullYear();
      const mm = String(next.getMonth() + 1).padStart(2, '0');
      const dd = String(next.getDate()).padStart(2, '0');
      const hh = String(next.getHours()).padStart(2, '0');
      dateEl.min = todayStr();
      dateEl.value = yyyy + '-' + mm + '-' + dd;
      timeEl.value = hh + ':00';
      remUserEdited = false;
    } catch (e) { console.error('initRemDefaults', e); }
  }
  (function () {
    const d = document.getElementById('remDate');
    const t = document.getElementById('remTime');
    if (d) d.addEventListener('change', () => { remUserEdited = true; });
    if (t) t.addEventListener('change', () => { remUserEdited = true; });
  })();
  // keep defaults fresh while the app stays open and the user hasn't touched the fields
  setInterval(() => initRemDefaults(true), 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) initRemDefaults(true); });
  window.addEventListener('focus', () => initRemDefaults(true));
  window.initRemDefaults = initRemDefaults;

  function remItem(r, compact) {
    const d = new Date(r.when);
    const el = document.createElement('div');
    el.className = 'item';
    const timeHtml = `<div class="timebox"><strong>${pad(d.getHours())}:${pad(d.getMinutes())}</strong><span>${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span></div>`;
    const sub = [
      r.category || 'Личное',
      r.repeat === 'daily' ? 'каждый день' : r.repeat === 'weekly' ? 'каждую неделю' : '',
      r.fired ? '✓ отправлено' : (r.when < Date.now() ? 'время прошло' : 'ожидает')
    ].filter(Boolean).join(' · ');
    el.innerHTML = `
      ${timeHtml}
      <div class="body"><strong>${esc(r.text)}</strong><span>${sub}</span></div>
      ${compact ? '' : `<div class="item-actions">
        <button type="button" class="done" data-done="${r.id}">Выполнено</button>
        <button type="button" data-cal="${r.id}">В календарь</button>
        <button type="button" data-del="${r.id}">Удалить</button>
      </div>`}`;
    if (!compact) {
      el.querySelector('[data-cal]')?.addEventListener('click', () => addToCalendar(r));
      el.querySelector('[data-done]')?.addEventListener('click', () => completeRem(r.id));
      el.querySelector('[data-del]')?.addEventListener('click', () => deleteRem(r.id));
    }
    return el;
  }

  // Add reminder to the phone's own Calendar (.ics) -> real notifications, no server needed
  function addToCalendar(r) {
    try {
      const fmt = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const esc2 = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
      const rrule = r.repeat === 'daily' ? 'RRULE:FREQ=DAILY' : r.repeat === 'weekly' ? 'RRULE:FREQ=WEEKLY' : '';
      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Luma//RU',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        'UID:luma-' + r.id + '@luma.app',
        'DTSTAMP:' + fmt(Date.now()),
        'DTSTART:' + fmt(r.when),
        'DTEND:' + fmt(r.when + 15 * 60000),
        'SUMMARY:' + esc2('Luma: ' + r.text),
        rrule,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:' + esc2(r.text),
        'TRIGGER:PT0S',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
      ].filter(Boolean);
      const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'luma-reminder.ics';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
      toast('Открой файл и нажми «Добавить»');
    } catch (e) { console.error(e); toast('Не удалось создать файл'); }
  }

  function renderReminders() {
    const list = $('remList');
    const items = data.reminders.filter(r => !r.done).sort((a, b) => a.when - b.when);
    const n = items.length;
    const word = n % 10 === 1 && n % 100 !== 11 ? 'напоминание' :
      (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'напоминания' : 'напоминаний');
    $('remCount').textContent = `${n} ${word}`;
    if (!items.length) {
      list.innerHTML = '<div class="empty"><div class="orb"></div>Добавь первое напоминание</div>';
      try { if ($('page-diary')) { diaryRender(); diaryRenderEvents(); } } catch {}
      return;
    }
    list.innerHTML = '';
    items.forEach(r => list.appendChild(remItem(r, false)));
    try { if ($('page-diary')) { diaryRender(); diaryRenderEvents(); } } catch {}
  }

  /* ----- Diary calendar ----- */
  let diaryViewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let diarySelectedDate = todayStr();
  const diaryDateKey = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  function diaryEntry(date) { return (data.diary || []).find(x => x.date === date); }
  function diaryRender() {
    const grid = $('diaryCalendarGrid'); if (!grid) return;
    const y = diaryViewMonth.getFullYear(), m = diaryViewMonth.getMonth();
    $('diaryMonthTitle').textContent = diaryViewMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    grid.innerHTML = '';
    const first = new Date(y, m, 1), offset = (first.getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const total = Math.ceil((offset + days) / 7) * 7;
    for (let i=0; i<total; i++) {
      const day = i-offset+1;
      const cell = document.createElement('button'); cell.type='button'; cell.className='diary-day';
      if (day < 1 || day > days) { cell.disabled=true; cell.classList.add('outside'); cell.textContent=''; }
      else {
        const date = diaryDateKey(new Date(y,m,day));
        cell.textContent=String(day); cell.dataset.date=date;
        if (date === todayStr()) cell.classList.add('today');
        if (date === diarySelectedDate) cell.classList.add('selected');
        const hasRem = data.reminders.some(r => diaryDateKey(new Date(r.when)) === date && !r.done);
        const hasEntry = !!diaryEntry(date);
        if (hasRem || hasEntry) { const dots=document.createElement('i'); dots.className='day-dots'; if(hasRem)dots.classList.add('has-rem'); if(hasEntry)dots.classList.add('has-entry'); cell.appendChild(dots); }
        cell.addEventListener('click', () => { diarySelectedDate=date; diaryLoadEntry(); diaryRender(); diaryRenderEvents(); });
      }
      grid.appendChild(cell);
    }
    $('diaryPrev').disabled = y <= 2000 && m === 0;
  }
  function diaryRenderEvents() {
    const box=$('diaryDayEvents'); if(!box)return;
    const d=new Date(diarySelectedDate+'T12:00:00');
    $('diarySelectedTitle').textContent=d.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
    const items=data.reminders.filter(r=>diaryDateKey(new Date(r.when))===diarySelectedDate).sort((a,b)=>a.when-b.when);
    const entry=diaryEntry(diarySelectedDate); $('diaryDayCount').textContent=(items.length+(entry?1:0))+' событий';
    box.innerHTML='';
    if(entry){const el=document.createElement('div');el.className='item';const body=document.createElement('div');body.className='body';const title=document.createElement('strong');title.textContent=(entry.mood?entry.mood+' ':'')+'Запись дневника';const sub=document.createElement('span');sub.textContent=entry.text||'Без текста';body.append(title,sub);el.appendChild(body);box.appendChild(el);}
    items.forEach(r=>{const el=document.createElement('div');el.className='item';const time=document.createElement('div');time.className='timebox';const strong=document.createElement('strong');const dt=new Date(r.when);strong.textContent=dt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});time.appendChild(strong);const body=document.createElement('div');body.className='body';const title=document.createElement('strong');title.textContent=(r.done?'✓ ':'')+r.text;const sub=document.createElement('span');sub.textContent=(r.category||'Личное')+(r.done?' · выполнено':' · напоминание');body.append(title,sub);el.append(time,body);box.appendChild(el);});
    if(!items.length&&!entry)box.innerHTML='<div class="empty">На этот день пока ничего нет.</div>';
  }
  function diaryLoadEntry() { const e=diaryEntry(diarySelectedDate); $('diaryMood').value=e?.mood||''; $('diaryText').value=e?.text||''; }
  function diarySaveEntry() {
    const mood=$('diaryMood').value, text=$('diaryText').value.trim();
    const i=(data.diary||[]).findIndex(e=>e.date===diarySelectedDate);
    if(!mood&&!text){ if(i>=0)data.diary.splice(i,1); toast('Пустая запись удалена'); }
    else { const item={id:i>=0?data.diary[i].id:'diary_'+Date.now().toString(36),date:diarySelectedDate,mood,text,updated:Date.now()}; if(i>=0)data.diary[i]=item;else data.diary.push(item); toast('Запись сохранена'); }
    save(); diaryRender(); diaryRenderEvents();
  }
  function diaryInit() {
    $('diaryPrev')?.addEventListener('click',()=>{diaryViewMonth=new Date(diaryViewMonth.getFullYear(),diaryViewMonth.getMonth()-1,1);diaryRender();});
    $('diaryNext')?.addEventListener('click',()=>{diaryViewMonth=new Date(diaryViewMonth.getFullYear(),diaryViewMonth.getMonth()+1,1);diaryRender();});
    $('diarySave')?.addEventListener('click',diarySaveEntry);
    $('diaryClear')?.addEventListener('click',()=>{$('diaryMood').value='';$('diaryText').value='';diarySaveEntry();});
    $('diaryAddReminder')?.addEventListener('click',()=>{if(diarySelectedDate<todayStr()){toast('Для напоминания выбери сегодня или будущую дату');return;}goTab('reminders');const d=$('remDate');if(d)d.value=diarySelectedDate;remUserEdited=true;$('remText')?.focus();});
    diaryLoadEntry(); diaryRender(); diaryRenderEvents();
  }
  diaryInit();

  function completeRem(id) {
    const r = data.reminders.find(x => x.id === id);
    if (!r) return;
    ntfyCancel(r);
    if (r.repeat === 'daily') {
      r.when += 86400000;
      while (r.when <= Date.now()) r.when += 86400000;
      r.fired = false;
      scheduleRem(r);
    } else if (r.repeat === 'weekly') {
      r.when += 7 * 86400000;
      while (r.when <= Date.now()) r.when += 7 * 86400000;
      r.fired = false;
      scheduleRem(r);
    } else {
      r.done = true;
      if (remTimers.has(id)) { clearTimeout(remTimers.get(id).t); remTimers.delete(id); }
    }
    data.cnt.remDone++;
    save();
    addCoins(3, { pop: 'выполнено' });
    syncRemindersToSW();
    renderReminders();
    renderHome();
    toast('Готово');
  }

  function deleteRem(id) {
    ntfyCancel(data.reminders.find(x => x.id === id));
    if (remTimers.has(id)) { clearTimeout(remTimers.get(id).t); remTimers.delete(id); }
    data.reminders = data.reminders.filter(r => r.id !== id);
    save();
    syncRemindersToSW();
    renderReminders();
    renderHome();
    toast('Удалено');
  }


  function syncRemindersToSW() {
    const payload = data.reminders
      .filter(r => !r.done)
      .map(r => ({ id: r.id, text: r.text, when: r.when, fired: !!r.fired || ntfyCovers(r), done: !!r.done }));
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SYNC_REMINDERS', reminders: payload });
        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_DUE' });
      } else if (navigator.serviceWorker) {
        navigator.serviceWorker.ready.then(reg => {
          if (reg.active) {
            reg.active.postMessage({ type: 'SYNC_REMINDERS', reminders: payload });
            reg.active.postMessage({ type: 'CHECK_DUE' });
          }
        }).catch(() => {});
      }
    } catch {}
  }

  async function setupBackgroundSync() {
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.register('./sw.js?v=' + BUILD, { scope: './', updateViaCache: 'none' });
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            // new version ready — activate on next load
          }
        });
      });
      await navigator.serviceWorker.ready;
      try {
        const ctrl = navigator.serviceWorker.controller;
        if (ctrl) ctrl.postMessage({ type: 'PRECACHE' });
        else if (reg.active) reg.active.postMessage({ type: 'PRECACHE' });
      } catch {}
      // Periodic Background Sync (Chrome Android, installed PWA)
      if (reg.periodicSync && 'periodicsync' in self) {
        try {
          const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
          if (status.state === 'granted') {
            await reg.periodicSync.register('luma-check', { minInterval: 15 * 60 * 1000 });
          }
        } catch {}
      }
      try {
        if (reg.sync) await reg.sync.register('luma-check');
      } catch {}
      syncRemindersToSW();
    } catch {}
  }

  function scheduleRem(r, opts) {
    opts = opts || {};
    if (r.fired || r.done) return;
    const existing = remTimers.get(r.id);
    // already scheduled for this exact time -> do nothing (prevents the 3s loop from hammering SW)
    if (existing && existing.when === r.when) return;
    if (existing) clearTimeout(existing.t);
    remTimers.delete(r.id);
    const delay = r.when - Date.now();
    if (delay <= 0) {
      fireRem(r.id);
      return;
    }
    const t = setTimeout(() => {
      remTimers.delete(r.id);
      fireRem(r.id);
    }, Math.min(Math.max(delay, 0), 2147480000));
    remTimers.set(r.id, { t: t, when: r.when });

    // Ask service worker to schedule once (helps on some Android Chrome)
    if (!opts.silent && !ntfyCovers(r)) {
      try {
        if (navigator.serviceWorker) {
          navigator.serviceWorker.ready.then(reg => {
            const msg = {
              type: 'SCHEDULE_ONE',
              title: 'Luma напоминает',
              body: r.text,
              tag: 'luma-sw-' + r.id,
              when: r.when
            };
            if (reg.active) reg.active.postMessage(msg);
          }).catch(() => {});
        }
      } catch {}
    }
  }

  function fireRem(id) {
    const r = data.reminders.find(x => x.id === id);
    if (!r || r.done) return;
    if (r.fired) return;
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch {}
    toast('⏰ ' + r.text);
    if (!ntfyCovers(r)) showSystemNotification('Luma напоминает', r.text, 'luma-' + id + '-' + Date.now());
    r.fired = true;
    r.firedAt = Date.now();
    remTimers.delete(id);
    save();
    syncRemindersToSW();
    try { renderReminders(); renderHome(); } catch (e) { console.error(e); }
  }

  function showSystemNotification(title, body, tag) {
    if (!('Notification' in window)) {
      setNotifDebug('API уведомлений нет в этом браузере');
      return false;
    }
    if (Notification.permission !== 'granted') {
      setNotifDebug('Нет разрешения. Нажми «Включить уведомления».');
      return false;
    }
    const opts = {
      body: body || '',
      tag: tag || ('luma-' + Date.now()),
      icon: './icon-192.png',
      badge: './icon-192.png',
      renotify: false,
      silent: false,
      requireInteraction: false
    };
    // Use exactly one notification path: Service Worker when available,
    // otherwise the page Notification API. This avoids duplicate alerts.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        if (!reg || !reg.showNotification) throw new Error('SW notifications unavailable');
        return reg.showNotification(title || 'Luma', opts);
      }).then(() => setNotifDebug('Уведомление отправлено ✓'))
        .catch(err => setNotifDebug('Не удалось отправить уведомление: ' + (err && err.message ? err.message : String(err))));
      return true;
    }
    try {
      const n = new Notification(title || 'Luma', opts);
      setTimeout(() => { try { n.close(); } catch {} }, 12000);
      setNotifDebug('Уведомление отправлено ✓');
      return true;
    } catch (err) {
      setNotifDebug('Notification error: ' + (err && err.message ? err.message : String(err)));
      return false;
    }
  }

  function setNotifDebug(msg) {
    const info = $('notifyInfo');
    const status = $('notifyStatus');
    if (info) info.textContent = msg;
    if (status) status.textContent = msg;
  }

  /* ----- ntfy push (works with the app closed, on every device) ----- */
  const NTFY_URL = 'https://ntfy.sh/';
  const NTFY_MAX_AHEAD = 3 * 86400 - 900; // ntfy schedules up to 3 days ahead
  data.ntfy = Object.assign({ enabled: false, topic: '' }, data.ntfy || {});
  const ntfyTopicOk = t => /^[-_A-Za-z0-9]{8,64}$/.test(t || '');
  const ntfyOn = () => !!(data.ntfy && data.ntfy.enabled && ntfyTopicOk(data.ntfy.topic));
  const ntfyCovers = r => ntfyOn() && !!r.ntfySeq && r.ntfyWhen === r.when;
  const ntfyBusy = new Set();
  const ntfyLastTry = new Map();

  function ntfyGenTopic() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    const a = new Uint8Array(20);
    crypto.getRandomValues(a);
    return 'luma-' + Array.from(a, b => chars[b % chars.length]).join('');
  }

  async function ntfySchedule(r) {
    if (!ntfyOn() || r.done || r.fired || ntfyCovers(r) || ntfyBusy.has(r.id)) return false;
    const secs = Math.floor(r.when / 1000);
    const left = secs - Math.floor(Date.now() / 1000);
    if (left < 12 || left > NTFY_MAX_AHEAD) return false;
    const last = ntfyLastTry.get(r.id) || 0;
    if (Date.now() - last < 60000) return false;
    ntfyLastTry.set(r.id, Date.now());
    ntfyBusy.add(r.id);
    const seq = ('luma_' + r.id + '_' + secs).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
    const url = NTFY_URL + data.ntfy.topic + '/' + seq +
      '?at=' + secs + '&priority=4&tags=bell&title=' + encodeURIComponent('Luma напоминает');
    try {
      const res = await fetch(url, { method: 'POST', body: r.text });
      if (res.ok) {
        r.ntfySeq = seq;
        r.ntfyWhen = r.when;
        save();
        syncRemindersToSW();
        return true;
      }
    } catch (e) { /* offline: retry later */ }
    finally { ntfyBusy.delete(r.id); }
    return false;
  }

  function ntfyCancel(r, topicOverride) {
    const seq = r && r.ntfySeq;
    const topic = topicOverride || (data.ntfy && data.ntfy.topic);
    if (r) { r.ntfySeq = null; r.ntfyWhen = null; }
    if (!seq || !ntfyTopicOk(topic)) return;
    try { fetch(NTFY_URL + topic + '/' + seq, { method: 'DELETE' }).catch(() => {}); } catch (e) {}
  }

  function ntfyCancelAll(topic) {
    data.reminders.forEach(r => ntfyCancel(r, topic));
  }

  function renderNtfy() {
    const inp = $('ntfyTopic');
    if (!inp) return;
    inp.value = data.ntfy.topic || '';
    $('ntfyToggle').textContent = ntfyOn() ? 'Выключить' : 'Включить';
    $('ntfyStatus').textContent = ntfyOn()
      ? 'Включено. На каждом устройстве: приложение ntfy → «+» → тема выше. Напоминания не дольше чем на 3 дня вперёд уходят в push, остальные — когда подойдёт срок и сайт будет открыт.'
      : 'Выключено.';
  }

  (function setupNtfyUi() {
    if (!$('ntfyToggle')) return;
    $('ntfyToggle').addEventListener('click', () => {
      if (ntfyOn()) {
        ntfyCancelAll();
        data.ntfy.enabled = false;
        save(); renderNtfy(); syncRemindersToSW();
        toast('Push выключен');
        return;
      }
      let t = ($('ntfyTopic').value || '').trim().replace(/[^-_A-Za-z0-9]/g, '');
      if (!ntfyTopicOk(t)) t = ntfyGenTopic();
      data.ntfy.topic = t;
      data.ntfy.enabled = true;
      save(); renderNtfy();
      checkDue();
      toast('Push включён. Подпишись на тему в ntfy');
    });
    $('ntfyTopic').addEventListener('change', () => {
      const old = data.ntfy.topic;
      const t = ($('ntfyTopic').value || '').trim().replace(/[^-_A-Za-z0-9]/g, '');
      if (t === old) { renderNtfy(); return; }
      ntfyCancelAll(old);
      data.ntfy.topic = t;
      if (!ntfyTopicOk(t)) data.ntfy.enabled = false;
      save(); renderNtfy(); checkDue();
    });
    $('ntfyNew').addEventListener('click', () => {
      ntfyCancelAll(data.ntfy.topic);
      data.ntfy.topic = ntfyGenTopic();
      save(); renderNtfy(); checkDue();
      toast('Новая тема создана. Подпишись на неё в ntfy');
    });
    $('ntfyCopy').addEventListener('click', async () => {
      const t = data.ntfy.topic;
      if (!t) { toast('Сначала нажми «Включить»'); return; }
      try { await navigator.clipboard.writeText(t); toast('Тема скопирована'); }
      catch (e) { $('ntfyTopic').select(); toast('Скопируй тему вручную'); }
    });
    $('ntfyTest').addEventListener('click', async () => {
      if (!ntfyTopicOk(data.ntfy.topic)) { toast('Сначала нажми «Включить»'); return; }
      try {
        const res = await fetch(NTFY_URL + data.ntfy.topic + '?priority=4&tags=white_check_mark&title=' + encodeURIComponent('Luma'), { method: 'POST', body: 'Тест: уведомления работают' });
        toast(res.ok ? 'Тест отправлен — проверь приложение ntfy' : 'Сервер ntfy ответил ошибкой');
      } catch (e) { toast('Нет связи с ntfy.sh (нужен интернет или VPN)'); }
    });
    renderNtfy();
  })();

  let checking = false;
  function checkDue() {
    if (checking) return;
    checking = true;
    try {
      const now = Date.now();
      data.reminders.forEach(r => {
        if (r.done || r.fired) return;
        if (r.when <= now) fireRem(r.id);
        else {
          scheduleRem(r, { silent: true });
          if (ntfyOn() && !ntfyCovers(r)) ntfySchedule(r);
        }
      });
    } catch (e) { console.error('checkDue', e); }
    checking = false;
  }

  function parseLocalDateTime(ds, ts) {
    // Local timezone, no UTC shift
    const dp = ds.split('-').map(Number);
    const tp = ts.split(':').map(Number);
    if (dp.length < 3 || tp.length < 2) return NaN;
    return new Date(dp[0], dp[1] - 1, dp[2], tp[0], tp[1], 0, 0).getTime();
  }

  function addReminderFromForm() {
    try {
      const textEl = document.getElementById('remText');
      const dateEl = document.getElementById('remDate');
      const timeEl = document.getElementById('remTime');
      const catEl = document.getElementById('remCat');
      const repEl = document.getElementById('remRepeat');
      if (!textEl || !dateEl || !timeEl) {
        toast('Форма не найдена');
        return false;
      }
      // ensure defaults if empty
      if (!dateEl.value || !timeEl.value) initRemDefaults();
      const textVal = (textEl.value || '').trim();
      const ds = dateEl.value;
      const ts = timeEl.value;
      if (!textVal) {
        toast('Напиши, о чём напомнить');
        textEl.focus();
        return false;
      }
      if (!ds || !ts) {
        toast('Укажи дату и время');
        initRemDefaults();
        return false;
      }
      const when = parseLocalDateTime(ds, ts);
      if (!Number.isFinite(when)) {
        toast('Некорректная дата или время');
        return false;
      }
      if (when <= Date.now()) {
        toast('Это время уже прошло — выбери позже');
        initRemDefaults();
        return false;
      }
      const r = {
        id: 'r' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        text: textVal,
        when: when,
        fired: false,
        done: false,
        category: (catEl && catEl.value) || 'Личное',
        repeat: (repEl && repEl.value) || 'none'
      };
      if (!Array.isArray(data.reminders)) data.reminders = [];
      data.reminders.push(r);
      save();
      try { scheduleRem(r); } catch (e) { console.error(e); }
      try { if (ntfyOn()) ntfySchedule(r); } catch (e) {}
      try { syncRemindersToSW(); } catch (e) {}
      try { renderReminders(); } catch (e) {}
      try { renderHome(); } catch (e) {}
      textEl.value = '';
      initRemDefaults();
      const sec = Math.round((when - Date.now()) / 1000);
      if (sec < 120) toast('Напоминание через ' + sec + ' сек');
      else toast('Напоминание добавлено на ' + ds + ' ' + ts);
      return true;
    } catch (err) {
      console.error(err);
      toast('Ошибка: ' + (err && err.message ? err.message : 'не удалось сохранить'));
      return false;
    }
  }
  window.addReminderFromForm = addReminderFromForm;

  const remFormEl = document.getElementById('remForm');
  if (remFormEl) {
    remFormEl.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();
      addReminderFromForm();
    });
  }

  async function requestNotif() {
    if (!('Notification' in window)) {
      toast('Браузер не поддерживает уведомления');
      setNotifDebug('API не поддерживается');
      return;
    }
    try {
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.register('./sw.js?v=' + BUILD);
          await navigator.serviceWorker.ready;
          setNotifDebug('Service Worker готов');
        } catch (e) {
          setNotifDebug('SW не зарегистрирован (нужен HTTPS). Уведомления всё равно попробуем.');
        }
      }
      let p = Notification.permission;
      if (p !== 'granted') {
        p = await Notification.requestPermission();
      }
      updateNotifUI();
      if (p === 'granted') {
        toast('Уведомления включены — сейчас проверка');
        const ok = showSystemNotification('Luma', 'Работает! Так будут приходить напоминания.', 'luma-test-' + Date.now());
        if (!ok) toast('Разрешение есть, но показ заблокирован (нужен HTTPS?)');
      } else if (p === 'denied') {
        toast('Запрещено. Разреши в настройках браузера/сайта');
        setNotifDebug('Запрещено системой. Открой настройки сайта → Уведомления → Разрешить.');
      } else {
        toast('Разрешение не получено');
      }
    } catch (err) {
      toast('Ошибка запроса разрешения');
      setNotifDebug(String(err && err.message || err));
    }
  }

  function testNotifIn3s() {
    if (!('Notification' in window)) { toast('Браузер не поддерживает уведомления'); return; }
    if (Notification.permission !== 'granted') {
      toast('Сначала нажми «Включить уведомления»');
      requestNotif();
      return;
    }
    toast('Тест через 3 сек — можно выйти');
    setTimeout(() => {
      toast('⏰ Тест напоминания');
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch {}
      showSystemNotification('Luma — тест', 'Если видишь это — уведомления работают', 'luma-test-' + Date.now());
    }, 3000);
  }

  function quickReminder(sec) {
    if (!('Notification' in window)) { toast('Браузер не поддерживает уведомления'); return; }
    if (Notification.permission !== 'granted') {
      toast('Сначала включи уведомления');
      requestNotif();
      return;
    }
    const when = Date.now() + sec * 1000;
    const r = {
      id: (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now()),
      text: 'Быстрый тест (' + sec + ' сек)',
      when,
      fired: false,
      done: false,
      category: 'Личное',
      repeat: 'none'
    };
    data.reminders.push(r);
    save();
    scheduleRem(r);
    syncRemindersToSW();
    renderReminders();
    renderHome();
    toast('Напоминание через ' + sec + ' сек — можно выйти');
  }
  window.quickReminder = quickReminder;

  const remSubmitBtn = document.getElementById('remSubmitBtn');
  if (remSubmitBtn) {
    remSubmitBtn.addEventListener('click', function (e) {
      e.preventDefault();
      addReminderFromForm();
    });
  }
  if ($('notifyBtn')) $('notifyBtn').onclick = requestNotif;
  if ($('notifyBtn2')) $('notifyBtn2').onclick = requestNotif;
  const testBtn = $('testNotifBtn');
  if (testBtn) testBtn.onclick = testNotifIn3s;
  const testBtn2 = $('testNotifBtn2');
  if (testBtn2) testBtn2.onclick = testNotifIn3s;

  function updateNotifUI() {
    const info = $('notifyInfo');
    const status = $('notifyStatus');
    if (!('Notification' in window)) {
      if (info) info.textContent = 'Этот браузер не поддерживает уведомления.';
      if (status) status.textContent = 'Не поддерживается';
      return;
    }
    const p = Notification.permission;
    const map = {
      granted: 'Уведомления включены ✓',
      denied: 'Запрещены в настройках браузера',
      default: 'Ещё не запрашивались'
    };
    if (info) info.textContent = map[p] + '. Фон: да (если процесс жив). Выключенный экран: часто да на Android. Полностью закрыто / глубокий сон iPhone: нужен push-сервер.';
    if (status) status.textContent = map[p];
  }

  /* ================= Монеты, магазин, звания ================= */
  const fmtN = n => Math.round(n).toLocaleString('ru-RU');
  let popT;
  function coinPop(text) {
    const el = $('coinPop'); if (!el) return;
    el.textContent = text; el.classList.add('show');
    clearTimeout(popT); popT = setTimeout(() => el.classList.remove('show'), 2200);
  }
  /* opts: raw — без множителя; pop — показать «+N ✧» (true или подпись) */
  function addCoins(n, opts) {
    opts = opts || {};
    n = Math.round(n);
    if (!n) return 0;
    if (n > 0 && !opts.raw) n = Math.max(1, Math.round(n * (data.admin.mult || 1)));
    data.coins.bal = Math.min(1e12, Math.max(0, data.coins.bal + n));
    if (n > 0 && !opts.noEarn) data.coins.earned = Math.min(1e12, data.coins.earned + n);
    save(); updateWallet();
    if (opts.pop) coinPop((n > 0 ? '+' : '') + fmtN(n) + ' ✧' + (opts.pop === true ? '' : ' · ' + opts.pop));
    checkTitles();
    return n;
  }
  function spendCoins(n) {
    if (data.coins.bal < n) return false;
    data.coins.bal -= n; data.coins.spent += n; save(); updateWallet();
    return true;
  }
  const REC_B = { reaction: 8, memory: 15, tap: 10, snake: 10 }, NORM_B = { reaction: 3, memory: 10, tap: 5, snake: 5 };
  function gameDone(kind, base, recHit, normHit) {
    const c = data.cnt; c.games[kind] = (c.games[kind] || 0) + 1; c.total++;
    const n = base + (recHit ? REC_B[kind] || 0 : 0) + (normHit ? NORM_B[kind] || 0 : 0);
    if (n > 0) addCoins(n, { pop: recHit ? 'рекорд!' : (normHit ? 'в норме' : true) });
    else { save(); checkTitles(); }
  }

  /* ----- серия дней ----- */
  function updateStreak() {
    const t = todayStr(), s = data.streak;
    if (s.last === t) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const ys = y.getFullYear() + '-' + pad(y.getMonth() + 1) + '-' + pad(y.getDate());
    s.count = s.last === ys ? s.count + 1 : 1;
    s.best = Math.max(s.best || 0, s.count); s.last = t;
    save();
    const got = addCoins(Math.min(5 + s.count * 2, 50));
    coinPop('Серия ' + s.count + ' дн. · +' + fmtN(got) + ' ✧');
  }

  /* ----- каталог магазина ----- */
  const SHOP = [
    { id: 'th_neon', kind: 'theme', name: 'Неон', icon: '🌆', price: 300, theme: 'neon', sw: 'linear-gradient(135deg,#ff2bd6,#1b0b3a)', desc: 'Тема оформления' },
    { id: 'th_gold', kind: 'theme', name: 'Золото', icon: '🏅', price: 500, theme: 'gold', sw: 'linear-gradient(135deg,#d4a017,#2a1a05)', desc: 'Тема оформления' },
    { id: 'th_cosmos', kind: 'theme', name: 'Космос', icon: '🪐', price: 400, theme: 'cosmos', sw: 'linear-gradient(135deg,#2b3fa0,#050818)', desc: 'Тема оформления' },
    { id: 'th_sakura', kind: 'theme', name: 'Сакура', icon: '🌸', price: 350, theme: 'sakura', sw: 'linear-gradient(135deg,#d9609a,#2a0f24)', desc: 'Тема оформления' },

    { id: 'sn_neon', kind: 'snake', name: 'Неон-змейка', icon: '🟢', price: 150, skin: 'neon', desc: 'Змейка: светящийся зелёный' },
    { id: 'sn_fire', kind: 'snake', name: 'Огненная змейка', icon: '🔥', price: 200, skin: 'fire', desc: 'Змейка: от жёлтого к красному' },
    { id: 'sn_rainbow', kind: 'snake', name: 'Радужная змейка', icon: '🌈', price: 400, skin: 'rainbow', desc: 'Змейка: все цвета радуги' },
    { id: 't_pastel', kind: 't2048', name: 'Пастельные плитки', icon: '🍬', price: 150, skin: 'pastel', desc: '2048: мягкие цвета' },
    { id: 't_neon', kind: 't2048', name: 'Тёмный неон', icon: '💡', price: 250, skin: 'neon', desc: '2048: светящиеся цифры' },
    { id: 'm_animals', kind: 'mem', name: 'Животные', icon: '🐶', price: 150, pack: ['🐶','🐱','🦊','🐼','🐸','🦁','🐵','🐙'], desc: 'Память: карточки-животные' },
    { id: 'm_space', kind: 'mem', name: 'Космос', icon: '🚀', price: 200, pack: ['🌙','⭐','🪐','🚀','☄️','🌍','👽','🛸'], desc: 'Память: космические карточки' },
    { id: 'm_food', kind: 'mem', name: 'Еда', icon: '🍕', price: 150, pack: ['🍕','🍔','🍣','🍩','🌮','🍦','🥐','🍪'], desc: 'Память: вкусные карточки' },
    { id: 'x_hearts', kind: 'ttt', name: 'Сердца и звёзды', icon: '❤️', price: 150, sym: ['❤️','⭐'], desc: 'Крестики-нолики' },
    { id: 'x_sun', kind: 'ttt', name: 'Солнце и луна', icon: '☀️', price: 150, sym: ['☀️','🌙'], desc: 'Крестики-нолики' },
    { id: 'x_fire', kind: 'ttt', name: 'Огонь и лёд', icon: '🔥', price: 200, sym: ['🔥','❄️'], desc: 'Крестики-нолики' },

    { id: 'b_life', kind: 'boost', inv: 'life', name: 'Вторая жизнь', icon: '❤️', price: 60, desc: 'Змейка: спасает от одного столкновения (срабатывает сама)' },
    { id: 'b_undo', kind: 'boost', inv: 'undo', name: 'Отмена хода', icon: '↩️', price: 40, desc: '2048: вернуть последний ход' },
    { id: 'b_hint', kind: 'boost', inv: 'hint', name: 'Подсказка', icon: '💡', price: 30, desc: 'Память: на секунду покажет одну пару' },
    { id: 'b_slow', kind: 'boost', inv: 'slow', name: 'Замедление', icon: '🐢', price: 50, desc: 'Змейка: 10 секунд помедленнее' },

    { id: 'bd_star', kind: 'badge', name: 'Звезда', icon: '🌟', price: 200, desc: 'Значок рядом с именем' },
    { id: 'bd_fire', kind: 'badge', name: 'Огонь', icon: '🔥', price: 300, desc: 'Значок рядом с именем' },
    { id: 'bd_rocket', kind: 'badge', name: 'Ракета', icon: '🚀', price: 400, desc: 'Значок рядом с именем' },
    { id: 'bd_uni', kind: 'badge', name: 'Единорог', icon: '🦄', price: 500, desc: 'Значок рядом с именем' },
    { id: 'bd_crown', kind: 'badge', name: 'Корона', icon: '👑', price: 1000, desc: 'Значок рядом с именем' },
    { id: 'bd_gem', kind: 'badge', name: 'Бриллиант', icon: '💎', price: 2000, desc: 'Значок рядом с именем' },

    { id: 'av_fox', kind: 'avatar', name: 'Лис', icon: '🦊', price: 250, desc: 'Аватар вместо логотипа' },
    { id: 'av_cat', kind: 'avatar', name: 'Кот', icon: '🐱', price: 250, desc: 'Аватар вместо логотипа' },
    { id: 'av_panda', kind: 'avatar', name: 'Панда', icon: '🐼', price: 250, desc: 'Аватар вместо логотипа' },
    { id: 'av_owl', kind: 'avatar', name: 'Сова', icon: '🦉', price: 300, desc: 'Аватар вместо логотипа' },
    { id: 'av_dragon', kind: 'avatar', name: 'Дракон', icon: '🐲', price: 400, desc: 'Аватар вместо логотипа' },
    { id: 'av_robot', kind: 'avatar', name: 'Робот', icon: '🤖', price: 400, desc: 'Аватар вместо логотипа' },
    { id: 'fr_gold', kind: 'frame', name: 'Золотая рамка', icon: '🟡', price: 300, cls: 'fr-gold', desc: 'Рамка вокруг аватара' },
    { id: 'fr_neon', kind: 'frame', name: 'Неоновая рамка', icon: '🔵', price: 350, cls: 'fr-neon', desc: 'Рамка вокруг аватара' },
    { id: 'fr_rainbow', kind: 'frame', name: 'Радужная рамка', icon: '🌈', price: 600, cls: 'fr-rainbow', desc: 'Рамка вокруг аватара' }
  ];
  const DEFAULT_ITEMS = [
    { id: 'snake_def', kind: 'snake', free: true, name: 'Стандартная змейка', icon: '🟣', desc: 'Фиолетовая' },
    { id: 't2048_def', kind: 't2048', free: true, name: 'Стандартные плитки', icon: '🟪', desc: 'Классические цвета' },
    { id: 'mem_def', kind: 'mem', free: true, name: 'Фрукты', icon: '🍎', desc: 'Стандартные карточки' },
    { id: 'ttt_def', kind: 'ttt', free: true, name: 'Классика', icon: '❌', desc: 'Крестики и нолики' }
  ];

  const SPECIAL_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="spg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset=".55" stop-color="#f59e0b"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><path d="M32 3l7.5 21.5L61 32l-21.5 7.5L32 61l-7.5-21.5L3 32l21.5-7.5z" fill="url(#spg)"/><circle cx="32" cy="32" r="5" fill="#fff"/></svg>';
  const SPECIAL = [
    { id: 'th_creator', role: 'creator', kind: 'theme', name: 'Аврора Создателя', icon: '🌌', theme: 'creator', sw: 'linear-gradient(135deg,#00ffc8,#7a2cff 55%,#07041a)', desc: 'Эксклюзивный анимированный фон со звёздами' },
    { id: 'av_creator', role: 'creator', kind: 'avatar', name: 'Звезда Создателя', icon: '✦', svg: SPECIAL_SVG, desc: 'Эксклюзивный аватар' },
    { id: 'fr_creator', role: 'creator', kind: 'frame', name: 'Корона Создателя', icon: '👑', cls: 'fr-creator', desc: 'Эксклюзивная переливающаяся рамка' },
    { id: 'bd_creator', role: 'creator', kind: 'badge', name: 'Печать Создателя', icon: '⚜️', desc: 'Эксклюзивный значок у имени' },
    { id: 'sn_aurora', role: 'creator', kind: 'snake', name: 'Аврора-змейка', icon: '🌠', skin: 'aurora', desc: 'Эксклюзивная змейка' },
    { id: 'bd_admin', role: 'admin', kind: 'badge', name: 'Щит администратора', icon: '🛡️', desc: 'Значок администратора' }
  ];
  const LOTTERY = { id: 'lottery', price: 60 };
  const priceOf = it => {
    const v = data.admin.prices && data.admin.prices[it.id];
    return (v !== undefined && v !== null && v !== '' && Number.isFinite(+v)) ? Math.max(0, Math.round(+v)) : it.price;
  };
  const findItem = id => SHOP.concat(DEFAULT_ITEMS, SPECIAL).find(i => i.id === id);
  const SKIN_LABEL = { snake: 'Змейка', t2048: '2048', mem: 'Память', ttt: 'Крестики-нолики' };

  function isOwned(it) { if (it.role) return it.role === 'creator' ? ROLE.creator : (ROLE.admin || ROLE.creator); return !!it.free || !!data.owned[it.id]; }
  function isOn(it) {
    const e = data.equip;
    switch (it.kind) {
      case 'theme': return data.theme === it.theme;
      case 'snake': return e.snake === (it.skin || 'def');
      case 't2048': return e.t2048 === (it.skin || 'def');
      case 'mem': return e.mem === (it.free ? 'def' : it.id);
      case 'ttt': return e.ttt === (it.free ? 'def' : it.id);
      case 'badge': return e.badge === it.id;
      case 'avatar': return e.avatar === it.id;
      case 'frame': return e.frame === it.id;
    }
    return false;
  }
  function equipItem(it) {
    const e = data.equip;
    switch (it.kind) {
      case 'theme': applyTheme(it.theme); break;
      case 'snake': e.snake = it.skin || 'def'; break;
      case 't2048': e.t2048 = it.skin || 'def'; break;
      case 'mem': e.mem = it.free ? 'def' : it.id; break;
      case 'ttt': e.ttt = it.free ? 'def' : it.id; break;
      case 'badge': e.badge = it.id; break;
      case 'avatar': e.avatar = it.id; break;
      case 'frame': e.frame = it.id; break;
    }
    save(); updateWallet();
  }
  function buyItem(it) {
    if (isOwned(it) && !it.inv) return;
    const p = priceOf(it);
    if (!spendCoins(p)) { toast('Не хватает ' + fmtN(p - data.coins.bal) + ' ✧'); return; }
    data.cnt.bought++;
    if (it.inv) { data.inv[it.inv]++; toast('Куплено: ' + it.name + ' · теперь ' + data.inv[it.inv]); }
    else { data.owned[it.id] = true; equipItem(it); toast('Куплено: ' + it.name + ' ✓'); }
    save(); syncThemeSwatches(); renderShop(); checkTitles();
  }
  function syncThemeSwatches() {
    const row = document.querySelector('.theme-row'); if (!row) return;
    row.querySelectorAll('[data-extra]').forEach(x => x.remove());
    SHOP.concat(SPECIAL).filter(i => i.kind === 'theme' && isOwned(i)).forEach(i => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'theme-swatch' + (data.theme === i.theme ? ' active' : '');
      b.dataset.theme = i.theme; b.dataset.extra = '1'; b.style.background = i.sw; b.setAttribute('aria-label', i.name);
      b.onclick = () => applyTheme(i.theme);
      row.appendChild(b);
    });
  }
  /* ----- скины в играх ----- */
  function snakeColor(i) {
    const sk = data.equip.snake;
    if (sk === 'neon') return i === 0 ? '#b6ff5c' : '#39ff88';
    if (sk === 'fire') return i === 0 ? '#fff27a' : 'hsl(' + Math.max(0, 40 - i * 3) + ' 95% 55%)';
    if (sk === 'rainbow') return 'hsl(' + ((i * 28) % 360) + ' 90% 65%)';
    if (sk === 'aurora') return i === 0 ? '#fde68a' : 'hsl(' + ((i * 14 + 150) % 360) + ' 90% 66%)';
    return i === 0 ? '#e0a6ff' : '#a78bfa';
  }
  const memPack = () => { const it = data.equip.mem !== 'def' && findItem(data.equip.mem); return it && it.pack ? it.pack : null; };
  const tttSym = () => { const it = data.equip.ttt !== 'def' && findItem(data.equip.ttt); return it && it.sym ? it.sym : ['✕', '◯']; };

  /* ----- звания ----- */
  const T = (grp, id, icon, name, desc, cur, goal) => ({ grp, id, icon, name, desc, cur, goal });
  const normsHit = () => {
    if (!userGroup()) return 0;
    let c = 0;
    for (const k in GAME_NORM) {
      const n = curNorm(k), m = GAME_NORM[k], rec = m.rec();
      if (n && rec != null && !(m.dir === 'min' && rec <= 0) && (m.dir === 'max' ? rec <= n : rec >= n)) c++;
    }
    return c;
  };
  const TITLES = [
    T('Серия дней', 'rookie', '🌱', 'Новичок', 'Звание по умолчанию', () => 1, 1),
    T('Серия дней', 's3', '🌊', 'На волне', 'Заходи в Luma 3 дня подряд', () => data.streak.best, 3),
    T('Серия дней', 's7', '🔥', 'Неделя подряд', 'Заходи 7 дней подряд', () => data.streak.best, 7),
    T('Серия дней', 's14', '⚡', 'Две недели', 'Заходи 14 дней подряд', () => data.streak.best, 14),
    T('Серия дней', 's30', '🛡️', 'Железный', 'Заходи 30 дней подряд', () => data.streak.best, 30),
    T('Серия дней', 's100', '🏛️', 'Легенда', 'Заходи 100 дней подряд', () => data.streak.best, 100),
    T('Серия дней', 's365', '♾️', 'Вечный', 'Заходи целый год подряд', () => data.streak.best, 365),
    T('Монеты', 'c100', '🐷', 'Копилка', 'Заработай 100 ✧', () => data.coins.earned, 100),
    T('Монеты', 'c1k', '💰', 'Состоятельный', 'Заработай 1 000 ✧', () => data.coins.earned, 1000),
    T('Монеты', 'c10k', '🤑', 'Толстосум', 'Заработай 10 000 ✧', () => data.coins.earned, 10000),
    T('Монеты', 'c100k', '💎', 'Богач', 'Заработай 100 000 ✧', () => data.coins.earned, 100000),
    T('Монеты', 'c1m', '👑', 'Магнат', 'Заработай 1 000 000 ✧', () => data.coins.earned, 1000000),
    T('Игры', 'g10', '🎮', 'Игрок', 'Сыграй 10 партий', () => data.cnt.total, 10),
    T('Игры', 'g100', '🕹️', 'Заядлый игрок', 'Сыграй 100 партий', () => data.cnt.total, 100),
    T('Игры', 'g500', '👾', 'Геймер', 'Сыграй 500 партий', () => data.cnt.total, 500),
    T('Игры', 'g2000', '🧙', 'Гуру игр', 'Сыграй 2000 партий', () => data.cnt.total, 2000),
    T('Мастерство', 'fast', '⚡', 'Молния', 'Реакция 200 мс или быстрее', () => (data.stats.reactionBest != null && data.stats.reactionBest <= 200) ? 1 : 0, 1),
    T('Мастерство', 'memo', '🧠', 'Мастер памяти', 'Память за 10 ходов или меньше', () => (data.stats.memoryMoves != null && data.stats.memoryMoves <= 10) ? 1 : 0, 1),
    T('Мастерство', 'tap70', '👆', 'Кликер-бог', '70 нажатий и больше за раунд', () => data.stats.tapBest, 70),
    T('Мастерство', 'sn30', '🐍', 'Змей-мастер', '30 очков в змейке', () => data.stats.snakeBest, 30),
    T('Мастерство', 'k2048', '🔢', 'Король 2048', 'Собери плитку 2048', () => data.cnt.won2048, 1),
    T('Мастерство', 'ttt10', '❌', 'Стратег', '10 побед в крестиках-ноликах', () => data.stats.ttt.w, 10),
    T('Мастерство', 'ttt50', '🏆', 'Непобедимый', '50 побед в крестиках-ноликах', () => data.stats.ttt.w, 50),
    T('Мастерство', 'nrm', '✅', 'В норме', 'Рекорды во всех играх в пределах нормы твоего возраста', normsHit, 5),
    T('Ходьба', 'w10', '🚶', 'Ходок', 'Пройди 10 км', () => data.cnt.dist / 1000, 10),
    T('Ходьба', 'w42', '🏃', 'Марафонец', 'Пройди 42 км', () => data.cnt.dist / 1000, 42),
    T('Ходьба', 'w200', '🧭', 'Путешественник', 'Пройди 200 км', () => data.cnt.dist / 1000, 200),
    T('Ходьба', 'w1000', '🌍', 'Кругосветка', 'Пройди 1000 км', () => data.cnt.dist / 1000, 1000),
    T('Привычки', 'wa7', '💧', 'Водохлёб', 'Выпей норму воды 7 дней', () => data.cnt.waterDays, 7),
    T('Привычки', 'wa30', '🌊', 'Океан', 'Выпей норму воды 30 дней', () => data.cnt.waterDays, 30),
    T('Привычки', 'r10', '⏰', 'Организованный', 'Выполни 10 напоминаний', () => data.cnt.remDone, 10),
    T('Привычки', 'r100', '📅', 'Планировщик', 'Выполни 100 напоминаний', () => data.cnt.remDone, 100),
    T('Привычки', 'm30', '🥗', 'Гурман', 'Добавь 30 приёмов пищи', () => data.cnt.meals, 30),
    T('Привычки', 'm200', '👨‍🍳', 'Шеф', 'Добавь 200 приёмов пищи', () => data.cnt.meals, 200),
    T('Магазин', 'sh5', '🛍️', 'Шопоголик', 'Купи 5 вещей', () => data.cnt.bought, 5),
    T('Магазин', 'sh20', '🧺', 'Коллекционер', 'Купи 20 вещей', () => data.cnt.bought, 20),
    T('Магазин', 'lot20', '🎰', 'Азартный', 'Сыграй в лотерею 20 раз', () => data.cnt.lottery, 20)
  ];
  const CREATOR = { grp: 'Особое', id: 'creator', icon: '🛠️', name: 'Создатель', desc: 'Автор Luma. Открывается только через панель создателя', cur: () => ROLE.creator ? 1 : 0, goal: 1 };
  const ADMIN_T = { grp: 'Особое', id: 'admin', icon: '🛡️', name: 'Администратор', desc: 'Выдаётся через админ-панель', cur: () => ROLE.admin ? 1 : 0, goal: 1 };
  const titleById = id => id === 'creator' ? CREATOR : id === 'admin' ? ADMIN_T : TITLES.find(t => t.id === id);
  function activeTitle() {
    const t = titleById(data.titles.active);
    return (t && data.titles.got[t.id]) ? t : TITLES[0];
  }
  const titleChip = t => '<span class="title-chip' + (t.id === 'creator' ? ' creator' : t.id === 'admin' ? ' admin' : '') + '">' + t.icon + ' ' + t.name + '</span>';
  function checkTitles() {
    const tg = data.titles; if (!tg.got) tg.got = {};
    const fresh = [];
    TITLES.forEach(t => { if (!tg.got[t.id] && t.cur() >= t.goal) { tg.got[t.id] = Date.now(); fresh.push(t); } });
    let changed = fresh.length > 0;
    [['creator', ROLE.creator], ['admin', ROLE.admin]].forEach(([id, on]) => {
      if (on) { if (!tg.got[id]) { tg.got[id] = Date.now(); changed = true; } }
      else if (tg.got[id]) { delete tg.got[id]; if (tg.active === id) tg.active = 'rookie'; changed = true; }
    });
    tg.creator = ROLE.creator;
    if (changed) {
      save(); updateWallet();
      const shown = fresh.filter(t => t.id !== 'rookie');
      if (shown.length) setTimeout(() => toast('🏅 Новое звание: ' + shown.map(t => t.icon + ' ' + t.name).join(', ')), 1500);
      const pg = $('page-shop'); if (pg && pg.classList.contains('active')) renderShop();
    }
      try { checkAchievements(); } catch {}
  }

  /* ----- кошелёк на главной, аватар ----- */

  /* ===== Достижения + план дня ===== */
  function todayKey(){ return (typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0,10)); }
  function planDayStats(dateStr){
    const day = dateStr || todayKey();
    const meals = (data.meals || []).filter(m => m.date === day).length;
    const waterOk = !!(data.water && data.water.date === day && data.water.current >= (data.water.goal || 2000));
    const waterAny = !!(data.water && data.water.date === day && data.water.current > 0);
    const walk = (data.walks || []).some(w => w.date === day);
    const start = new Date(day + 'T00:00:00').getTime();
    const end = start + 86400000;
    const rems = (data.reminders || []).filter(r => r.when >= start && r.when < end);
    const remDone = rems.length ? rems.every(r => r.done) : false;
    const remProgress = rems.length ? rems.filter(r => r.done).length / rems.length : 1;
    // День «по плану»: вода к цели + (еда или прогулка) + напоминания закрыты (если были)
    const complete = waterOk && (meals > 0 || walk) && (rems.length === 0 || remDone);
    const score = Math.round(100 * (
      (waterOk ? 0.4 : waterAny ? 0.15 : 0) +
      ((meals > 0 || walk) ? 0.35 : 0) +
      (0.25 * remProgress)
    ));
    return { day, meals, waterOk, waterAny, walk, rems: rems.length, remDone, complete, score };
  }
  function countPlanDays(daysBack){
    if (!data.planLog || typeof data.planLog !== 'object') return 0;
    let n = 0;
    const now = new Date(); now.setHours(0,0,0,0);
    for (let i = 0; i < daysBack; i++){
      const d = new Date(now.getTime() - i * 86400000);
      const k = d.toISOString().slice(0,10);
      if (data.planLog[k]) n++;
    }
    return n;
  }
  function markPlanDay(force){
    const st = planDayStats();
    if (!data.planLog) data.planLog = {};
    if (st.complete || force){
      data.planLog[st.day] = 1;
      // keep last ~120 days
      const keys = Object.keys(data.planLog).sort();
      if (keys.length > 120) keys.slice(0, keys.length - 120).forEach(k => delete data.planLog[k]);
      save();
      checkAchievements();
      try { renderBetaHomeExtras(); } catch {}
      toast(force && !st.complete ? 'День отмечен вручную' : 'План на день выполнен ✓');
      return true;
    }
    toast('Чтобы засчитать день: вода по цели, еда или прогулка, и закрытые напоминания на сегодня');
    return false;
  }
  window.markPlanDay = markPlanDay;

  const ACHIEVEMENTS = [
    { id: 'first_open', ic: '👋', name: 'Первый шаг', desc: 'Открыть Luma', test: () => true },
    { id: 'water1', ic: '💧', name: 'Глоток', desc: 'Добавить воду', test: () => (data.cnt.waterDays || 0) >= 1 || (data.water && data.water.current > 0) },
    { id: 'water7', ic: '🌊', name: 'Неделя воды', desc: '7 дней с водой', test: () => (data.cnt.waterDays || 0) >= 7 },
    { id: 'meal1', ic: '🍽', name: 'Записал еду', desc: 'Добавить приём пищи', test: () => (data.cnt.meals || 0) >= 1 || (data.meals || []).length >= 1 },
    { id: 'meal20', ic: '🥗', name: 'Дневник еды', desc: '20 записей о еде', test: () => (data.cnt.meals || (data.meals || []).length) >= 20 },
    { id: 'rem1', ic: '⏰', name: 'Напоминалка', desc: 'Создать напоминание', test: () => (data.reminders || []).length >= 1 },
    { id: 'rem_done5', ic: '✅', name: 'Сделал дела', desc: 'Закрыть 5 напоминаний', test: () => (data.cnt.remDone || 0) >= 5 },
    { id: 'walk1', ic: '🚶', name: 'Прогулка', desc: 'Завершить прогулку', test: () => (data.walks || []).length >= 1 },
    { id: 'walk5', ic: '🛤', name: 'Маршруты', desc: '5 прогулок', test: () => (data.walks || []).length >= 5 },
    { id: 'streak3', ic: '🔥', name: '3 дня подряд', desc: 'Серия входов 3 дня', test: () => (data.streak && data.streak.best) >= 3 },
    { id: 'streak7', ic: '⚡', name: 'Неделя с Luma', desc: 'Серия 7 дней', test: () => (data.streak && data.streak.best) >= 7 },
    { id: 'plan_day', ic: '📋', name: 'День по плану', desc: 'Выполнить план за день', test: () => data.planLog && Object.keys(data.planLog).length >= 1 },
    { id: 'plan_week', ic: '🗓', name: 'Неделя по плану', desc: '7 дней с выполненным планом', test: () => countPlanDays(7) >= 7 || Object.keys(data.planLog || {}).length >= 7 },
    { id: 'plan_month', ic: '📅', name: 'Месяц по плану', desc: '20 дней с планом за 30 дней', test: () => countPlanDays(30) >= 20 },
    { id: 'pet_feed', ic: '🐾', name: 'Забота', desc: 'Покормить питомца', test: () => (data.cnt.petFeed || 0) >= 1 },
    { id: 'game1', ic: '🎮', name: 'Разминка ума', desc: 'Сыграть 1 партию', test: () => (data.cnt.total || 0) >= 1 },
    { id: 'coins50', ic: '✨', name: 'Искорки', desc: 'Заработать 50 ✧', test: () => (data.coins && data.coins.earned) >= 50 },
    { id: 'nova_setup', ic: '✦', name: 'Знакомство с Новой', desc: 'Заполнить профиль Новы', test: () => !!(data.profile && data.profile.nova && data.profile.nova.setup) },
    { id: 'backup1', ic: '💾', name: 'Бэкап', desc: 'Сделать экспорт данных', test: () => (data.lastExport || 0) > 0 },
    { id: 'beta_ui', ic: '🧪', name: 'Испытатель', desc: 'Включить бета-дизайн', test: () => data.ui === 'beta' },
  ];
  function checkAchievements() {
    if (!data.ach || typeof data.ach !== 'object') data.ach = {};
    const fresh = [];
    ACHIEVEMENTS.forEach(a => {
      if (data.ach[a.id]) return;
      try { if (a.test()) { data.ach[a.id] = Date.now(); fresh.push(a); } } catch {}
    });
    if (fresh.length) {
      save();
      const names = fresh.map(a => a.ic + ' ' + a.name).join(', ');
      setTimeout(() => toast('🏅 Достижение: ' + names), 900);
      if ($('page-achievements') && $('page-achievements').classList.contains('active')) renderAchievements();
    }
  }
  function renderAchievements() {
    const list = $('achList'); const cnt = $('achCount'); if (!list) return;
    const got = ACHIEVEMENTS.filter(a => data.ach && data.ach[a.id]);
    if (cnt) cnt.textContent = got.length + ' / ' + ACHIEVEMENTS.length;
    list.innerHTML = ACHIEVEMENTS.map(a => {
      const on = !!(data.ach && data.ach[a.id]);
      return '<div class="ach-card' + (on ? '' : ' locked') + '"><div class="ach-ic">' + a.ic + '</div><div class="ach-body"><b>' + a.name + '</b><small>' + a.desc + '</small></div>' + (on ? '<div class="ach-ok">✓</div>' : '') + '</div>';
    }).join('');
  }
  function setUIMode(mode) {
    data.ui = mode === 'beta' ? 'beta' : 'classic';
    if (data.ui === 'beta') document.documentElement.setAttribute('data-ui', 'beta');
    else document.documentElement.removeAttribute('data-ui');
    save();
    const st = $('uiBetaStatus');
    if (st) st.textContent = data.ui === 'beta' ? 'Сейчас: Beta Design v38' : 'Сейчас: классический дизайн';
    adaptNavForUI();
    checkAchievements();
    try { renderHome(); } catch {}
    toast(data.ui === 'beta' ? 'Beta Design v38 включён' : 'Классический дизайн');
  }
  function adaptNavForUI() {
    const mapBeta = {
      home: ['⌂', 'Home'],
      reminders: ['☰', 'Planner'],
      diary: ['▦', 'Diary'],
      games: ['▦', 'Projects'],
      settings: ['☺', 'Profile']
    };
    const mapClassic = {
      home: ['🏠', 'Главная'],
      nutrition: ['🥗', 'Рацион'],
      reminders: ['⏰', 'Планы'],
      walk: ['🚶', 'Ходьба'],
      games: ['🎮', 'Игры'],
      settings: ['⚙️', 'Ещё']
    };
    const m = data.ui === 'beta' ? mapBeta : mapClassic;
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
      const tab = btn.getAttribute('data-tab');
      if (m[tab]) {
        const span = btn.querySelector('span');
        if (span) span.textContent = m[tab][0];
        const nodes = Array.from(btn.childNodes);
        nodes.forEach(n => { if (n.nodeType === 3) n.textContent = ''; });
        btn.appendChild(document.createTextNode(m[tab][1]));
      }
    });
    // FAB
    let fab = document.getElementById('betaFab');
    if (data.ui === 'beta') {
      if (!fab) {
        fab = document.createElement('button');
        fab.id = 'betaFab';
        fab.className = 'beta-fab';
        fab.type = 'button';
        fab.setAttribute('aria-label', 'Добавить');
        fab.textContent = '+';
        fab.onclick = () => { try { openNova(); } catch { goTab('reminders'); } };
        document.body.appendChild(fab);
      }
      fab.style.display = 'flex';
    } else if (fab) {
      fab.style.display = 'none';
    }
  }
  function fitRingSvg(move, ex, stand){
    // progress 0..1
    const c = 2 * Math.PI * 42;
    const c2 = 2 * Math.PI * 30;
    const c3 = 2 * Math.PI * 18;
    const a = (v, circ) => circ * (1 - Math.max(0, Math.min(1, v)));
    return '<svg class="fit-ring-svg" viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="42" fill="none" stroke="#2c2c2e" stroke-width="8"/>' +
      '<circle cx="50" cy="50" r="42" fill="none" stroke="#ff375f" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + a(move,c) + '" transform="rotate(-90 50 50)"/>' +
      '<circle cx="50" cy="50" r="30" fill="none" stroke="#2c2c2e" stroke-width="8"/>' +
      '<circle cx="50" cy="50" r="30" fill="none" stroke="#64d2ff" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + c2 + '" stroke-dashoffset="' + a(ex,c2) + '" transform="rotate(-90 50 50)"/>' +
      '<circle cx="50" cy="50" r="18" fill="none" stroke="#2c2c2e" stroke-width="8"/>' +
      '<circle cx="50" cy="50" r="18" fill="none" stroke="#daff63" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + c3 + '" stroke-dashoffset="' + a(stand,c3) + '" transform="rotate(-90 50 50)"/>' +
      '</svg>';
  }
  function renderBetaHomeExtras() {
    const host = $('betaHomeExtras');
    if (!host) return;
    if (data.ui !== 'beta') { host.innerHTML = ''; host.hidden = true; return; }
    host.hidden = false;
    const st = planDayStats();
    let remDoneN = 0;
    if (st.rems) {
      const start = new Date(st.day+'T00:00:00').getTime();
      remDoneN = (data.reminders||[]).filter(r => r.when>=start && r.when<start+86400000 && r.done).length;
    }
    const inProgress = Math.max(0, st.rems - remDoneN);
    const weekDone = (data.cnt && data.cnt.remDone) ? data.cnt.remDone : remDoneN;
    const name = (data.profile && data.profile.name) ? data.profile.name : '';
    const greetName = name || 'там';
    // next
    let nextTime = '—';
    let nextTitle = 'Нет дел на сегодня';
    let nextSub = 'Создай напоминание в Планах';
    const dayStart = new Date(st.day+'T00:00:00').getTime();
    const pending = (data.reminders||[]).filter(r => !r.done && r.when >= dayStart && r.when < dayStart+86400000).sort((a,b)=>a.when-b.when);
    if (pending.length) {
      const r = pending[0];
      nextTime = new Date(r.when).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      nextTitle = r.text || 'Напоминание';
      nextSub = pending.length > 1 ? ('ещё ' + (pending.length-1)) : 'ближайшее';
    }
    // AI focus
    let focusTitle = 'Лёгкий день';
    let focusSub = '2 важные задачи';
    if (st.rems >= 6) { focusTitle = 'Насыщенный день'; focusSub = st.rems + ' задач · держи фокус'; }
    else if (st.rems >= 3) { focusTitle = 'Активный день'; focusSub = st.rems + ' задач · приоритеты'; }
    else if (st.rems === 0) { focusTitle = 'Свободный день'; focusSub = 'Запланируй или отдохни'; }
    // pet
    let petHtml = '';
    try {
      const p = (typeof PETS !== 'undefined' && data.pets) ? (PETS.find(x => x.id === data.pets.active) || PETS[0]) : null;
      if (p) {
        const hunger = Math.max(0, Math.min(100, data.pets.hunger || 50));
        const energy = Math.max(0, Math.min(100, data.pets.energy || 50));
        const moodTxt = (data.pets.mood === 'sleeping') ? 'Sleeping' : (hunger < 25 ? 'Hungry' : 'Active');
        const av = (typeof petCharacter === 'function') ? petCharacter(p.id) : '🐾';
        petHtml =
          '<div class="prod-section">' +
            '<div class="prod-section-h"><h3>Companion</h3><button type="button" onclick="openPets()">Care ›</button></div>' +
            '<div class="prod-pet">' +
              '<div class="pet-av">' + av + '</div>' +
              '<div class="pet-info"><b>' + esc(p.name) + '</b><small>' + moodTxt + '</small>' +
              '<div class="pet-bars"><div class="pet-bar"><i style="width:'+hunger+'%"></i></div><div class="pet-bar"><i style="width:'+energy+'%"></i></div></div></div>' +
            '</div></div>';
      }
    } catch(e) {}
    const cal = ($('homeCal') && $('homeCal').textContent) || '0';
    host.innerHTML =
      '<div class="prod-home">' +
        '<div class="prod-top">' +
          '<div>' +
            '<div class="prod-greet">Привет' + (name ? ', ' + esc(name) : '') + '!</div>' +
            '<div class="prod-sub">Сегодня есть время для глубокого фокуса</div>' +
          '</div>' +
          '<div class="prod-bell" onclick="goTab(\'reminders\')" title="Планы">🔔</div>' +
        '</div>' +
        '<div class="prod-ai" onclick="openNova()" style="cursor:pointer">' +
          '<div class="ai-label"><span></span>AI Summary</div>' +
          '<b>Фокус на сегодня</b>' +
          '<small>' + focusTitle + ' · ' + focusSub + '</small>' +
        '</div>' +
        '<div class="prod-stats">' +
          '<div class="prod-stat"><b>' + st.rems + '</b><span>Задачи сейчас</span>' +
            (st.rems ? '<span class="stat-extra">+' + Math.min(3,st.rems) + ' сегодня</span>' : '') +
          '</div>' +
          '<div class="prod-stat"><b>' + inProgress + '</b><span>В процессе</span></div>' +
          '<div class="prod-stat"><b>' + Math.max(remDoneN, weekDone) + '</b><span>Готово</span></div>' +
        '</div>' +
        '<div class="prod-next" onclick="goTab(\'reminders\')" style="cursor:pointer">' +
          '<div class="n-label">Далее</div>' +
          '<div class="n-card">' +
            '<div class="n-time">' + nextTime + '</div>' +
            '<div class="n-txt"><b>' + esc(nextTitle) + '</b><small>' + esc(nextSub) + '</small></div>' +
          '</div>' +
        '</div>' +
        '<div class="prod-section">' +
          '<div class="prod-section-h"><h3>Quick</h3></div>' +
          '<div class="prod-chips">' +
            '<div class="prod-chip" onclick="addWater(250)"><b>💧 +250</b><small>Water</small></div>' +
            '<div class="prod-chip" onclick="goTab(\'nutrition\')"><b>🍽 ' + cal + '</b><small>Calories</small></div>' +
            '<div class="prod-chip" onclick="goTab(\'walk\')"><b>🚶 Walk</b><small>Activity</small></div>' +
            '<div class="prod-chip" onclick="goTab(\'games\')"><b>🎮 Play</b><small>Mini-games</small></div>' +
          '</div>' +
        '</div>' +
        petHtml +
      '</div>';
    if (st.complete && !(data.planLog && data.planLog[st.day])) {
      if (!data.planLog) data.planLog = {};
      data.planLog[st.day] = 1; save(); checkAchievements();
    }
  }

  function updateWallet() {
    const b = fmtN(data.coins.bal) + ' ✧';
    ['wBal', 'shopBal', 'adBal'].forEach(id => { const e = $(id); if (e) e.textContent = b; });
    const st = $('wStreak'); if (st) st.textContent = data.streak.count + ' дн.';
    const who = $('wWho');
    if (who) {
      const bd = findItem(data.equip.badge);
      who.innerHTML = (bd ? '<span class="badge-em">' + bd.icon + '</span> ' : '') + '<b>' + esc(data.profile.name || 'Игрок') + '</b> ' + titleChip(activeTitle());
    }
    const logo = document.querySelector('.logo');
    if (logo) {
      const av = findItem(data.equip.avatar), fr = findItem(data.equip.frame);
      if (av && av.svg) logo.innerHTML = av.svg; else logo.textContent = av ? av.icon : '✧';
      logo.className = 'logo' + (fr && fr.cls ? ' ' + fr.cls : '');
    }
  }

  /* ----- страница магазина ----- */
  let shopTab = 'theme';
  const SHOP_TABS_BASE = [['theme', '🎨 Темы'], ['skin', '🎮 Скины'], ['boost', '⚡ Бонусы'], ['badge', '🌟 Значки'], ['look', '🦊 Облик'], ['rewards', '🎁 Награды'], ['lottery', '🎰 Лотерея'], ['titles', '🏅 Звания']];
  const shopTabs = () => (ROLE.admin || ROLE.creator) ? SHOP_TABS_BASE.concat([['special', '🔐 Особое']]) : SHOP_TABS_BASE;
  let lastSpin = '';
  function openShop(tab) { if (tab) shopTab = tab; goTab('shop'); }
  window.openShop = openShop;
  function openPets(){ goTab('pets'); renderPets(); } window.openPets=openPets;

  function itemCard(it) {
    const owned = isOwned(it), on = owned && isOn(it);
    let ico = it.icon, act;
    if (it.svg) ico = it.svg;
    if (it.kind === 'theme') ico = '<span style="width:30px;height:30px;border-radius:50%;background:' + it.sw + ';display:block;border:2px solid rgba(255,255,255,.5)"></span>';
    if (it.inv) {
      act = '<button class="btn small" type="button" data-act="buy" data-id="' + it.id + '">' + fmtN(priceOf(it)) + ' ✧</button>';
      return '<div class="shop-item"><div class="si-ico">' + ico + '</div><div class="si-body"><b>' + it.name + ' · у тебя ' + data.inv[it.inv] + '</b><small>' + it.desc + '</small></div><div class="si-act">' + act + '</div></div>';
    }
    if (!owned) act = '<button class="btn small" type="button" data-act="buy" data-id="' + it.id + '">' + fmtN(priceOf(it)) + ' ✧</button>';
    else if (on && ['badge', 'avatar', 'frame'].includes(it.kind)) act = '<button class="btn secondary small" type="button" data-act="unequip" data-kind="' + it.kind + '">Снять</button>';
    else if (on) act = '<button class="btn secondary small" type="button" disabled>✓ Выбрано</button>';
    else act = '<button class="btn secondary small" type="button" data-act="equip" data-id="' + it.id + '">' + (it.kind === 'theme' ? 'Применить' : 'Выбрать') + '</button>';
    return '<div class="shop-item' + (on ? ' mine' : '') + '"><div class="si-ico">' + ico + '</div><div class="si-body"><b>' + it.name + '</b><small>' + (owned && !it.free && !it.role ? 'Куплено · ' : '') + it.desc + '</small></div><div class="si-act">' + act + '</div></div>';
  }

  const PETS = [
    { id:'sprout', name:'Росток', icon:'🌱', price:0, desc:'Бесплатный маленький спутник.' },
    { id:'cat', name:'Котик', icon:'🐱', price:120, desc:'Любит уют и рыбу.', food:'fish' },
    { id:'fox', name:'Лисёнок', icon:'🦊', price:260, desc:'Любопытный и быстрый.', food:'berry' },
    { id:'penguin', name:'Пингвин', icon:'🐧', price:420, desc:'Обожает прохладу и рыбу.', food:'fish' },
    { id:'owl', name:'Сова', icon:'🦉', price:650, desc:'Ночной наблюдатель.', food:'berry' },
    { id:'rabbit', name:'Кролик', icon:'🐰', price:780, desc:'Любит морковку.', food:'carrot' },
    { id:'dog', name:'Щенок', icon:'🐶', price:900, desc:'Верный и игривый.', food:'cake' },
    { id:'panda', name:'Панда', icon:'🐼', price:1100, desc:'Спокойный любитель перекусов.', food:'carrot' },
    { id:'raccoon', name:'Енот', icon:'🦝', price:1250, desc:'Любит находить вкусности.', food:'berry' },
    { id:'turtle', name:'Черепаха', icon:'🐢', price:1400, desc:'Медленный и спокойный.', food:'carrot' },
    { id:'unicorn', name:'Единорог', icon:'🦄', price:1800, desc:'Редкий волшебный спутник.', food:'cake' },
    { id:'dragon', name:'Дракон Создателя', icon:'🐉', price:0, role:'creator', desc:'Эксклюзив панели создателя.' },
    { id:'phoenix', name:'Феникс Администратора', icon:'🔥', price:0, role:'admin', desc:'Эксклюзив панели администратора.' }
  ];
  const PET_FOODS = [
    {id:'berry',name:'Ягоды',icon:'🫐',price:15,desc:'Небольшая порция',gain:18},
    {id:'fish',name:'Рыбка',icon:'🐟',price:25,desc:'Любимое угощение котиков и пингвинов',gain:28},
    {id:'carrot',name:'Морковка',icon:'🥕',price:20,desc:'Хрустящий перекус',gain:24},
    {id:'cake',name:'Печенье',icon:'🍪',price:35,desc:'Особое лакомство',gain:35}
  ];
  function petOwned(p) { return p.role === 'creator' ? ROLE.creator : p.role === 'admin' ? ROLE.admin : data.pets.owned.includes(p.id); }
  let petAnim='';
  function petUpdateNeeds(){ const now=Date.now(), mins=Math.max(0,Math.min(720,(now-(data.pets.updated||now))/60000)); if(data.pets.mood==='sleeping') data.pets.energy=Math.min(100,data.pets.energy+mins*.55); else data.pets.energy=Math.max(0,data.pets.energy-mins*.12); data.pets.hunger=Math.max(0,data.pets.hunger-mins*.08); data.pets.updated=now; }
  function petMeters(){return '<div class="fields"><div class="field"><label>Сытость · '+Math.round(data.pets.hunger)+'%</label><div class="pet-meter"><i style="width:'+data.pets.hunger+'%"></i></div></div><div class="field"><label>Энергия · '+Math.round(data.pets.energy)+'%</label><div class="pet-meter"><i style="width:'+data.pets.energy+'%"></i></div></div></div>';}
  function petCharacter(id){
    const palettes={sprout:['#8bdc9b','#4cae78','#d9ffe0'],cat:['#d9c7ff','#9273d4','#fff1ff'],fox:['#ffb16e','#e87838','#fff0d9'],penguin:['#8edcf4','#315c8d','#f5fdff'],owl:['#c9a7f5','#7954ae','#fff4c9'],rabbit:['#f8c8df','#d887b6','#fff7fb'],dog:['#d6b18c','#9b6c48','#fff0d8'],panda:['#dce5f3','#34394c','#ffffff'],raccoon:['#aab6ca','#5b667d','#f5f7ff'],turtle:['#9bd69b','#468b61','#e7f6b4'],unicorn:['#e9c4ff','#9a67d2','#fff5ff'],dragon:['#9bd8cb','#347d76','#ffe2a6'],phoenix:['#ffbd65','#e05a37','#fff0a8']};
    const c=palettes[id]||palettes.sprout; const ear=id==='rabbit'||id==='cat'||id==='fox'||id==='dog'||id==='unicorn';
    let extra='';
    if(id==='panda') extra='<ellipse cx="39" cy="57" rx="10" ry="14" fill="#303747"/><ellipse cx="81" cy="57" rx="10" ry="14" fill="#303747"/>';
    if(id==='owl') extra='<path d="M35 48 L25 23 L49 38 M65 38 L89 23 L79 48" fill="'+c[1]+'"/><path d="M50 86 L60 99 L70 86" fill="#f3bd55"/>';
    if(id==='turtle') extra='<ellipse cx="60" cy="72" rx="38" ry="27" fill="#43885e"/><path d="M38 72 Q60 42 82 72 Q60 96 38 72" fill="#79bd7e" stroke="#367b58" stroke-width="3"/>';
    if(id==='dragon') extra='<path d="M35 52 L12 28 L18 65 M85 52 L108 28 L102 65" fill="#67bcae" stroke="#347d76" stroke-width="4"/><path d="M55 22 Q60 7 66 22" stroke="#f4d38b" stroke-width="5" fill="none"/>';
    if(id==='phoenix') extra='<path d="M34 66 Q5 38 18 20 Q43 28 48 58 M86 66 Q115 38 102 20 Q77 28 72 58" fill="#ff8b42" stroke="#d94c35" stroke-width="4"/><path d="M60 17 Q47 2 60 0 Q73 3 60 17" fill="#ffe38b"/>';
    if(id==='unicorn') extra='<path d="M60 35 L67 5 L76 38" fill="#ffe28a" stroke="#bd8c4e" stroke-width="2"/><path d="M33 54 L22 31 L47 43 M87 54 L98 31 L73 43" fill="#f0c5ff"/>';
    if(id==='sprout') extra='<path d="M60 30 Q32 5 27 30 Q42 48 60 38 Q78 8 94 24 Q88 48 60 42" fill="#62bd83" stroke="#38885d" stroke-width="3"/>';
    if(ear) extra+='<path d="M34 48 Q19 7 45 25 L53 46 M67 46 Q80 8 99 26 L84 53" fill="'+c[0]+'" stroke="'+c[1]+'" stroke-width="4"/><path d="M35 42 Q31 23 43 33 M76 43 Q83 23 91 33" stroke="'+c[2]+'" stroke-width="5" fill="none"/>';
    if(id==='fox'||id==='raccoon') extra+='<path d="M86 91 Q116 92 108 64 Q103 52 91 65 Q105 82 84 82" fill="'+c[1]+'" stroke="'+c[1]+'" stroke-width="5"/>';
    const mask=id==='raccoon'?'<path d="M28 59 Q43 43 57 59 Q72 43 92 59 L85 74 Q72 68 60 77 Q47 68 35 74Z" fill="#465267"/>':(id==='fox'?'<path d="M30 66 Q60 86 90 66 L77 89 L60 97 L43 89Z" fill="#fff1df"/>':'');
    const beak=id==='penguin'||id==='owl'||id==='phoenix';
    return '<svg class="pet-art" viewBox="0 0 120 120" role="img" aria-label="'+(PETS.find(x=>x.id===id)?.name||'Питомец')+'" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g-'+id+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+c[2]+'"/><stop offset="1" stop-color="'+c[0]+'"/></linearGradient></defs><ellipse cx="60" cy="107" rx="32" ry="6" fill="#34235b" opacity=".18"/>'+extra+'<ellipse class="body-bob" cx="60" cy="83" rx="31" ry="25" fill="url(#g-'+id+')" stroke="'+c[1]+'" stroke-width="3"/><circle class="body-bob" cx="60" cy="57" r="34" fill="url(#g-'+id+')" stroke="'+c[1]+'" stroke-width="3"/>'+mask+'<g class="eye"><ellipse cx="47" cy="59" rx="5" ry="8" fill="#302044"/><circle class="pupil" cx="48.5" cy="56" r="2" fill="white"/></g><g class="eye r"><ellipse cx="73" cy="59" rx="5" ry="8" fill="#302044"/><circle class="pupil" cx="74.5" cy="56" r="2" fill="white"/></g>'+(beak?'<path class="mouth-open" d="M54 68 L66 68 L60 76Z" fill="#f4b84f"/><ellipse class="mouth-sleep" cx="60" cy="72" rx="7" ry="2.5" fill="#302044" opacity=".55"/>':'<ellipse class="mouth-open" cx="60" cy="70" rx="4" ry="3" fill="#df8cae"/><path class="mouth-open" d="M60 73 Q55 80 50 75 M60 73 Q65 80 70 75" fill="none" stroke="#80546e" stroke-width="2" stroke-linecap="round"/><path class="mouth-sleep" d="M52 72 Q60 76 68 72" fill="none" stroke="#80546e" stroke-width="2.5" stroke-linecap="round"/>')+'<ellipse class="cheek" cx="37" cy="70" rx="6" ry="3" fill="#ff9eb9" opacity=".6"/><ellipse class="cheek" cx="83" cy="70" rx="6" ry="3" fill="#ff9eb9" opacity=".6"/><path d="M38 96 Q60 106 82 96" fill="none" stroke="'+c[1]+'" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="20" r="3" fill="#fff" opacity=".8"/></svg>';
  }

  function renderPets(){
    petUpdateNeeds(); const p=PETS.find(x=>x.id===data.pets.active)||PETS[0]; const mood=data.pets.mood||'awake';
    const stageClass=petAnim || (mood==='sleeping'?'sleeping':'awake'); const stage=$('petCareMain');
    const home=$('homePet');
    if(home) home.innerHTML='<div class="pet-preview"><div class="pet-emoji">'+petCharacter(p.id)+'</div><div class="pet-info"><b>'+p.name+'</b><small>'+(mood==='sleeping'?'Спит':data.pets.hunger<25?'Проголодался':'Бодрствует')+'</small></div><span class="tag">Активен</span></div>';
    if(stage) stage.innerHTML='<div class="pet-stage '+stageClass+'" id="petStage"><div class="pet-avatar '+p.id+'" id="petAvatar">'+petCharacter(p.id)+'</div></div>'+petMeters()+'<div class="pet-controls"><button class="btn" type="button" data-petcare="feed">🍽 Покормить</button><button class="btn secondary" type="button" data-petcare="play">🎾 Играть</button><button class="btn secondary" type="button" data-petcare="sleep">🌙 Спать</button><button class="btn secondary" type="button" data-petcare="wake">☀️ Разбудить</button></div><p class="notice" id="petCareHint">'+(mood==='sleeping'?'Питомец отдыхает и восстанавливает энергию.':'Заботься о питомце: корми его и давай отдыхать.')+'</p>';
    const collection=$('petCollection'); if(collection){const owned=PETS.filter(p=>!p.role && petOwned(p));$('petCount').textContent=owned.length+' питомц.';collection.innerHTML=owned.map(p=>'<div class="pet-preview"><div class="pet-emoji">'+petCharacter(p.id)+'</div><div class="pet-info"><b>'+p.name+'</b><small>'+p.desc+'</small></div><div class="pet-action">'+(data.pets.active===p.id?'<button class="btn secondary small" disabled>✓ Активен</button>':'<button class="btn secondary small" data-pet="equip" data-id="'+p.id+'">Активировать</button>')+'</div></div>').join('')+PETS.filter(p=>!p.role && !petOwned(p)).map(p=>'<div class="pet-preview"><div class="pet-emoji">'+petCharacter(p.id)+'</div><div class="pet-info"><b>'+p.name+'</b><small>'+p.desc+'</small></div><div class="pet-action"><button class="btn small" data-pet="buy" data-id="'+p.id+'">'+p.price+' ✧</button></div></div>').join('');}
    const food=$('petFoodShop');if(food)food.innerHTML='<div class="pet-food-grid">'+PET_FOODS.map(f=>'<div class="pet-food-card"><span class="food-icon">'+f.icon+'</span><div class="food-copy"><b>'+f.name+'</b><small>'+f.desc+' · есть: '+(data.pets.food[f.id]||0)+'</small><small>'+f.price+' ✧</small><button class="btn small" style="margin-top:7px" data-petfood="buy" data-id="'+f.id+'">Купить</button></div></div>').join('')+'</div>';
    save();
  }
  function petCare(action){petUpdateNeeds();const stage=$('petStage');if(action==='feed'){const p=PETS.find(x=>x.id===data.pets.active)||PETS[0];const foodId=p.food||'berry';if(!data.pets.food[foodId]){toast('Нет подходящей еды. Купи её в магазине еды.');return;}data.pets.food[foodId]--;data.pets.hunger=Math.min(100,data.pets.hunger+ (PET_FOODS.find(x=>x.id===foodId)?.gain||18));data.cnt.petFeed=(data.cnt.petFeed||0)+1;petAnim='eating';toast('Питомец поел '+(PET_FOODS.find(x=>x.id===foodId)?.name||'')+'!');}
    else if(action==='sleep'){data.pets.mood='sleeping';data.pets.energy=Math.min(100,data.pets.energy+12);petAnim='sleeping';toast('Питомец отдыхает.');}
    else if(action==='wake'){data.pets.mood='awake';data.pets.energy=Math.min(100,data.pets.energy+4);petAnim='waking';toast('Питомец проснулся!');}
    else if(action==='play'){if(data.pets.mood==='sleeping'){toast('Сначала разбуди питомца.');return;}if(data.pets.energy<10){toast('Питомец устал. Пусть отдохнёт.');return;}data.pets.energy=Math.max(0,data.pets.energy-12);data.pets.hunger=Math.max(0,data.pets.hunger-5);petAnim='playing';toast('Вы отлично поиграли!');}
    data.pets.updated=Date.now();save();renderPets();if(petAnim && petAnim!=='sleeping'){setTimeout(()=>{petAnim='';renderPets();},1400);}}
  function petShopHTML(){return '<p class="notice">Питомцы теперь находятся в отдельном разделе. Здесь магазин еды и уход.</p><button class="btn" type="button" onclick="openPets()">Открыть питомцев</button>';}
  function shopTabHTML() {
    const list = k => SHOP.filter(i => (Array.isArray(k) ? k.includes(i.kind) : i.kind === k));
    if (shopTab === 'pets') return petShopHTML();
    if (shopTab === 'theme') return '<div class="shop-sub">Темы оформления</div>' + list('theme').map(itemCard).join('') + '<p class="notice">Куплённые темы появляются и в «Ещё» → «Тема».</p>';
    if (shopTab === 'skin') return ['snake', 't2048', 'mem', 'ttt'].map(k => '<div class="shop-sub">' + SKIN_LABEL[k] + '</div>' + DEFAULT_ITEMS.filter(i => i.kind === k).concat(list(k)).map(itemCard).join('')).join('');
    if (shopTab === 'boost') return '<div class="shop-sub">Расходуемые бонусы</div>' + list('boost').map(itemCard).join('') + '<p class="notice">Бонусы тратятся прямо в играх: кнопки появляются под полем.</p>';
    if (shopTab === 'badge') return '<div class="shop-sub">Значки рядом с именем</div>' + list('badge').map(itemCard).join('');
    if (shopTab === 'look') return '<div class="shop-sub">Аватары (вместо логотипа вверху)</div>' + list('avatar').map(itemCard).join('') + '<div class="shop-sub">Рамки</div>' + list('frame').map(itemCard).join('');
    if (shopTab === 'rewards') {
      const items = data.rewards.map(r => '<div class="shop-item"><div class="si-ico">🎁</div><div class="si-body"><b>' + esc(r.name) + '</b><small>' + fmtN(r.price) + ' ✧' + (r.count ? ' · получено ' + r.count + ' раз' : '') + '</small></div><div class="si-act"><button class="btn small" type="button" data-act="claim" data-id="' + r.id + '">Получить</button> <button class="btn secondary small" type="button" data-act="rwdel" data-id="' + r.id + '" aria-label="Удалить">✕</button></div></div>').join('');
      return '<div class="shop-sub">Свои награды</div><p class="notice" style="margin-top:0">Придумай, чем себя порадовать (кино, десерт, прогулка), и назначь цену. Когда накопишь — нажми «Получить».</p>' + (items || '<div class="empty" style="padding:14px">Пока нет своих наград</div>') +
        '<div class="glass section" style="margin-top:12px"><div class="fields"><div class="field full"><label>Название награды</label><input id="rwName" maxlength="40" placeholder="Например: серия в кино"></div><div class="field full"><label>Цена, ✧</label><input type="number" id="rwPrice" min="1" inputmode="numeric" placeholder="500"></div></div><div class="form-actions"><button class="btn" type="button" data-act="rwadd">＋ Добавить награду</button></div></div>';
    }
    if (shopTab === 'lottery') return '<div class="shop-sub">Лотерея</div><div class="glass section"><p class="notice" style="margin-top:0">За ' + priceOf(LOTTERY) + ' ✧ получишь случайный приз: монеты, бонус, а иногда и целый скин, тему или значок бесплатно.</p>' + (lastSpin ? '<div class="spin-res">' + lastSpin + '</div>' : '') + '<div class="form-actions"><button class="btn big" type="button" data-act="spin">🎰 Крутить · ' + priceOf(LOTTERY) + ' ✧</button></div></div>';
    if (shopTab === 'special') return '<div class="shop-sub">Только для тебя</div>' + SPECIAL.filter(isOwned).map(itemCard).join('');
    if (shopTab === 'titles') {
      const got = data.titles.got, all = (ROLE.creator ? [CREATOR] : []).concat(ROLE.admin ? [ADMIN_T] : [], TITLES);
      let html = '<div class="shop-sub">Открыто ' + all.filter(t => got[t.id]).length + ' из ' + all.length + '</div>', grp = '';
      all.forEach(t => {
        if (t.grp !== grp) { grp = t.grp; html += '<div class="shop-sub">' + grp + '</div>'; }
        const has = !!got[t.id], cur = Math.min(t.goal, Math.floor(t.cur())), act = data.titles.active === t.id;
        html += '<div class="shop-item' + (has ? '' : ' locked') + (act ? ' mine' : '') + '"><div class="si-ico">' + (has ? t.icon : '🔒') + '</div><div class="si-body"><b>' + (t.id === 'creator' || t.id === 'admin' ? titleChip(t) : t.name) + '</b><small>' + t.desc + '</small>' +
          (!has && t.goal > 1 ? '<div class="bar mini"><div style="width:' + Math.round(cur / t.goal * 100) + '%"></div></div><small>' + fmtN(cur) + ' / ' + fmtN(t.goal) + '</small>' : '') + '</div><div class="si-act">' +
          (has ? (act ? '<button class="btn secondary small" type="button" disabled>✓ Выбрано</button>' : '<button class="btn small" type="button" data-act="title" data-id="' + t.id + '">Выбрать</button>') : '') + '</div></div>';
      });
      return html;
    }
    return '';
  }
  function renderShop() {
    const tabs = $('shopTabs'), body = $('shopBody'); if (!tabs || !body) return;
    if (shopTab === 'special' && !(ROLE.admin || ROLE.creator)) shopTab = 'theme';
    tabs.innerHTML = shopTabs().map(t => '<button type="button" class="chip' + (t[0] === shopTab ? ' on' : '') + '" data-st="' + t[0] + '">' + t[1] + '</button>').join('');
    body.innerHTML = shopTabHTML();
    updateWallet();
  }
  function openNova(){goTab('nova');} window.openNova=openNova;
  const NOVA_CHAT_KEY='luma-nova-chat-v1';
  function novaChatHistory(){
    try { const h=JSON.parse(localStorage.getItem(NOVA_CHAT_KEY)||'[]'); return Array.isArray(h)?h.filter(x=>x&&typeof x.text==='string').slice(-80):[]; }
    catch { return []; }
  }
  function novaRenderChatHistory(){
    const chat=$('novaChat'); if(!chat)return;
    const history=novaChatHistory(); if(!history.length)return;
    chat.innerHTML='';
    history.forEach(x=>{const el=document.createElement('div');el.className='nova-msg '+(x.who==='user'?'user':'bot');el.textContent=x.text;chat.appendChild(el);});
    chat.scrollTop=chat.scrollHeight;
  }
  function novaSay(text,who='bot'){
    const chat=$('novaChat');if(!chat)return;
    const safeWho=who==='user'?'user':'bot', value=String(text==null?'':text).slice(0,4000);
    const el=document.createElement('div');el.className='nova-msg '+safeWho;el.textContent=value;chat.appendChild(el);chat.scrollTop=chat.scrollHeight;
    try { const h=novaChatHistory();h.push({who:safeWho,text:value,at:Date.now()});localStorage.setItem(NOVA_CHAT_KEY,JSON.stringify(h.slice(-80)));scheduleDeviceSnapshot(); } catch {}
  }
  function novaPending(){return (data.reminders||[]).filter(r=>!r.done).sort((a,b)=>a.when-b.when);}
  const novaDayNames=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  function novaProfileData(){return prof().nova || (prof().nova={setup:false,mode:'study',activity:'moderate',sports:'',days:'',trainingTime:'',schoolStart:'',schoolEnd:'',wake:'07:00',sleep:'22:00',focus:''});}
  function renderNovaProfile(){
    const n=novaProfileData();
    const fields={novaMode:n.mode||'study',novaActivity:n.activity,novaSports:n.sports,novaDays:n.days,novaTrainingTime:n.trainingTime,novaSchoolStart:n.schoolStart,novaSchoolEnd:n.schoolEnd,novaWake:n.wake,novaSleep:n.sleep,novaFocus:n.focus};
    Object.keys(fields).forEach(id=>{const el=$(id);if(el && document.activeElement!==el)el.value=fields[id]||'';});
    const status=$('novaProfileStatus');
    if(status)status.textContent=n.setup?'Заполнен':'Нужно заполнить';
    const hint=$('novaProfileHint');
    if(hint)hint.textContent=n.setup?'Профиль сохранён на этом устройстве. Его можно изменить в любое время.':'Заполни хотя бы активность и распорядок, чтобы план был точнее.';
    // подписи блока учёба/работа
    const mode=n.mode||'study';
    const labStart=$('novaSchoolStart')?.previousElementSibling || document.querySelector('label[for=novaSchoolStart]');
    const labEnd=$('novaSchoolEnd')?.previousElementSibling || document.querySelector('label[for=novaSchoolEnd]');
    if(labStart) labStart.textContent = mode==='work' ? 'Начало работы' : mode==='free' ? 'Начало основного блока' : 'Начало учёбы';
    if(labEnd) labEnd.textContent = mode==='work' ? 'Окончание работы' : mode==='free' ? 'Конец основного блока' : 'Окончание учёбы';
  }
  function saveNovaProfile(){
    const n=novaProfileData();
    n.mode=$('novaMode')?$('novaMode').value:'study';
    n.activity=$('novaActivity').value;
    n.sports=$('novaSports').value.trim().slice(0,100);
    n.days=$('novaDays').value.trim().slice(0,80);
    n.trainingTime=$('novaTrainingTime').value.trim().slice(0,40);
    n.schoolStart=$('novaSchoolStart').value;
    n.schoolEnd=$('novaSchoolEnd').value;
    n.wake=$('novaWake').value||'07:00';
    n.sleep=$('novaSleep').value||'22:00';
    n.focus=$('novaFocus').value.trim().slice(0,160);
    n.setup=true;
    save();renderNovaProfile();renderNovaPlan();toast('Профиль Новы сохранён');
  }
  function novaTimeMinutes(t){if(!/^\d{2}:\d{2}$/.test(t||''))return null;const [h,m]=t.split(':').map(Number);return h*60+m;}
  function novaRenderRows(rows){
    const box=$('novaDayPlan');if(!box)return;
    if(!rows.length){box.innerHTML='<div class="empty">На сегодня пока нет записанных дел. Добавь напоминания или заполни расписание.</div>';return;}
    box.innerHTML='';
    rows.sort((a,b)=>a.sort-b.sort).forEach(r=>{
      const el=document.createElement('div');el.className='nova-plan-row';
      const tm=document.createElement('div');tm.className='nova-plan-time';tm.textContent=r.time||'';
      const body=document.createElement('div');body.style.minWidth='0';
      const title=document.createElement('b');title.textContent=r.title;
      const note=document.createElement('div');note.className='nova-plan-note';note.textContent=r.note||'';
      body.append(title,note);el.append(tm,body);box.appendChild(el);
    });
  }
  function buildNovaPlan(forDate){
    const n=novaProfileData(), now=forDate?new Date(forDate):new Date();
    const dayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
    const rows=[], dayKey=novaDayNames[now.getDay()];
    const mode=n.mode||'study';
    const add=(time,title,note,sort)=>rows.push({time,title,note,sort:sort==null?9999:sort});
    const activityLabel={low:'спокойный',moderate:'умеренный',active:'активный',varied:'переменный'}[n.activity]||'умеренный';
    const wake=novaTimeMinutes(n.wake), sleep=novaTimeMinutes(n.sleep);
    if(wake!=null)add(n.wake, mode==='free'?'Спокойный подъём':'Подъём и начало дня', mode==='work'?'Соберись перед рабочим днём':'Спокойно подготовься к делам', wake);
    const schoolA=novaTimeMinutes(n.schoolStart),schoolB=novaTimeMinutes(n.schoolEnd);
    if(schoolA!=null&&schoolB!=null&&schoolB>schoolA){
      const title = mode==='work' ? 'Работа' : mode==='free' ? 'Основной блок дня' : 'Учёба';
      const note = mode==='work' ? 'Рабочие часы из профиля' : mode==='free' ? 'Занятость, которую ты указал' : 'Указанное тобой учебное время';
      add(n.schoolStart+'–'+n.schoolEnd, title, note, schoolA);
    }
    const dayTokens=(n.days||'').toLowerCase().replace(/ё/g,'е').split(/[,\s;/]+/).filter(Boolean);
    const dayMatch=dayTokens.some(x=>x===dayKey.toLowerCase()||x===({ 'вс':'воскресенье','пн':'понедельник','вт':'вторник','ср':'среда','чт':'четверг','пт':'пятница','сб':'суббота'}[dayKey.toLowerCase()]));
    if(dayMatch&&n.sports){
      const tm=n.trainingTime||'Время не указано', mins=novaTimeMinutes(n.trainingTime);
      add(tm,n.sports,'Запланированное занятие. Оставь время на дорогу и восстановление.',mins==null?850:mins);
    }
    const reminders=novaPending().filter(r=>r.when>=dayStart&&r.when<dayStart+86400000);
    reminders.forEach(r=>{const d=new Date(r.when),m=d.getHours()*60+d.getMinutes();add(d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),r.text,'Напоминание Luma',m);});
    if(n.focus)add('Гибко', mode==='work'?'Задачи и цели':'Личные цели','Можно выделить время на: '+n.focus,1100);
    if(!n.sports && n.activity) add('По самочувствию','Движение и отдых','Обычная активность в профиле: '+activityLabel+'. Выбери прогулку или лёгкое движение, если есть время.',1050);
    if(mode==='free' && !n.focus) add('Днём','Свободное время','Прогулка, отдых или хобби — без жёсткого графика',900);
    if(sleep!=null)add(n.sleep,'Подготовка ко сну','Заверши дела и оставь время на отдых',sleep);
    rows.sort((a,b)=>a.sort-b.sort);
    if(!rows.length){
      const next=novaPending().find(r=>r.when>Date.now());
      if(next){const d=new Date(next.when),m=d.getHours()*60+d.getMinutes();add(d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),next.text,'Ближайшее напоминание Luma',m);}
    }
    return rows;
  }
  function buildNovaWeekPlan(){
    const days=[];
    const base=new Date(); base.setHours(0,0,0,0);
    for(let i=0;i<7;i++){
      const d=new Date(base.getTime()+i*86400000);
      const rows=buildNovaPlan(d).filter(r=>r.title);
      days.push({date:d, label:novaDayNames[d.getDay()]+', '+d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}), rows});
    }
    return days;
  }
  function renderNovaWeekPlan(){
    const box=$('novaWeekPlan'); if(!box) return;
    const n=novaProfileData();
    if(!n.setup){ box.innerHTML='<div class="nova-profile-prompt">Сначала заполни и сохрани профиль Новы.</div>'; return; }
    const days=buildNovaWeekPlan();
    box.innerHTML = days.map(day => {
      const body = day.rows.length ? day.rows.slice(0,6).map(r=>'<div class="nova-plan-row"><div class="nova-plan-time">'+(r.time||'—')+'</div><div><b>'+esc(r.title)+'</b><div class="nova-plan-note">'+(r.note?esc(r.note):'')+'</div></div></div>').join('') : '<div class="empty" style="padding:8px 0">Пока пусто — добавь расписание или напоминания</div>';
      return '<div class="glass" style="padding:12px;margin-bottom:8px;border-radius:14px"><b>'+day.label+'</b>'+body+'</div>';
    }).join('');
  }
  function renderNovaPlan(){const n=novaProfileData();if(!n.setup){const box=$('novaDayPlan');if(box)box.innerHTML='<div class="nova-profile-prompt">Сначала заполни профиль Новы. После этого здесь появится план на сегодня.</div>';return;}novaRenderRows(buildNovaPlan());}
  /* Локальная база частых продуктов (на 100 г), для ответов Новы без сети */
  const NOVA_FOODS = [
    {k:['гречк','гречне'],n:'Гречка варёная',c:110,p:4,f:1,u:22},
    {k:['рис','рисов'],n:'Рис варёный',c:130,p:2.7,f:0.3,u:28},
    {k:['овсян','овсянк'],n:'Овсянка на воде',c:88,p:3,f:1.5,u:15},
    {k:['куриц','куриная грудк'],n:'Куриная грудка',c:165,p:31,f:3.6,u:0},
    {k:['яйц'],n:'Яйцо куриное',c:155,p:13,f:11,u:1.1},
    {k:['творог'],n:'Творог 5%',c:121,p:17,f:5,u:1.8},
    {k:['яблок'],n:'Яблоко',c:52,p:0.3,f:0.2,u:14},
    {k:['банан'],n:'Банан',c:89,p:1.1,f:0.3,u:23},
    {k:['хлеб бел','белый хлеб'],n:'Хлеб белый',c:265,p:9,f:3,u:49},
    {k:['хлеб чёрн','хлеб ржан'],n:'Хлеб ржаной',c:201,p:6.6,f:1.2,u:41},
    {k:['молок'],n:'Молоко 2.5%',c:52,p:2.8,f:2.5,u:4.7},
    {k:['сыр '],n:'Сыр твёрдый',c:350,p:25,f:27,u:0},
    {k:['картоф'],n:'Картофель варёный',c:82,p:2,f:0.1,u:17},
    {k:['макарон','паст'],n:'Макароны варёные',c:131,p:5,f:1.1,u:25},
    {k:['лосос','сёмг'],n:'Лосось',c:208,p:20,f:13,u:0},
    {k:['авокад'],n:'Авокадо',c:160,p:2,f:15,u:9},
    {k:['огур'],n:'Огурец',c:15,p:0.8,f:0.1,u:3.6},
    {k:['помидор','томат'],n:'Помидор',c:18,p:0.9,f:0.2,u:3.9},
    {k:['морков'],n:'Морковь',c:41,p:0.9,f:0.2,u:10},
    {k:['шоколад'],n:'Шоколад тёмный',c:546,p:5,f:31,u:61},
    {k:['кофе'],n:'Кофе чёрный',c:2,p:0.1,f:0,u:0},
    {k:['чай '],n:'Чай без сахара',c:1,p:0,f:0,u:0},
    {k:['творог 0','обезжирен'],n:'Творог 0%',c:71,p:16,f:0.3,u:1.8},
    {k:['йогурт'],n:'Йогурт натуральный',c:60,p:5,f:1.5,u:3.5},
    {k:['куриная груд','грудка'],n:'Куриная грудка',c:165,p:31,f:3.6,u:0},
    {k:['говядин'],n:'Говядина тушёная',c:232,p:25,f:14,u:0},
    {k:['рис бурый','бурый рис'],n:'Рис бурый варёный',c:111,p:2.6,f:0.9,u:23},
    {k:['киноа'],n:'Киноа варёная',c:120,p:4.4,f:1.9,u:21},
    {k:['орех грец','грецк'],n:'Грецкий орех',c:654,p:15,f:65,u:14},
    {k:['миндал'],n:'Миндаль',c:579,p:21,f:50,u:22},
    {k:['апельсин'],n:'Апельсин',c:47,p:0.9,f:0.1,u:12},
    {k:['груш'],n:'Груша',c:57,p:0.4,f:0.1,u:15},
    {k:['broccoli','брокколи'],n:'Брокколи',c:34,p:2.8,f:0.4,u:7},
    {k:['сыр творож'],n:'Сыр творожный',c:140,p:8,f:10,u:3},
  ];
  function novaFindFood(q){
    q=(q||'').toLowerCase().replace(/ё/g,'е');
    for(const f of NOVA_FOODS){ if(f.k.some(k=>q.includes(k))) return f; }
    // custom foods
    const customs=data.customFoods||[];
    for(const c of customs){ if((c.n||'').toLowerCase().replace(/ё/g,'е').includes(q.slice(0,12)) || q.includes((c.n||'').toLowerCase().slice(0,4))) return {n:c.n,c:c.c,p:c.p,f:c.f,u:c.u,local:true}; }
    return null;
  }
  function novaCalorieAnswer(query){
    const food=novaFindFood(query);
    if(!food) return null;
    const normalized=String(query||'').toLowerCase().replace(/ё/g,'е');
    const unitMatch=normalized.match(/(\d+(?:[.,]\d+)?)\s*(кг|грамм(?:а|ов)?|гр|г)\b/);
    let grams=100, portionNote='';
    if(unitMatch){
      grams=parseFloat(unitMatch[1].replace(',','.'));
      if(unitMatch[2]==='кг') grams*=1000;
      if(!Number.isFinite(grams)||grams<=0||grams>5000) grams=100;
    } else if(food.n==='Яйцо куриное'){
      const countMatch=normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:шт\.?|штук(?:и)?|яиц|яйца|яйцо)(?=\s|$|[,!.?])/);
      if(countMatch){ const count=parseFloat(countMatch[1].replace(',','.')); if(count>0&&count<=30){grams=count*50;portionNote=' · примерно '+count+' шт.';} }
      else if(/\b\d+\b/.test(normalized)) portionNote=' · количество не распознано, расчёт на 100 г';
    } else if(/\b\d+\b/.test(normalized)){
      portionNote=' · количество без граммов не распознано, расчёт на 100 г';
    }
    const k=grams/100;
    const line=food.n+' · '+Math.round(food.c*k)+' ккал на '+Math.round(grams)+' г\nБ '+Math.round(food.p*k*10)/10+' · Ж '+Math.round(food.f*k*10)/10+' · У '+Math.round(food.u*k*10)/10;
    return line+portionNote+(food.local?'\n(из твоих сохранённых блюд)':'\n(локальная база Luma, приблизительный ориентир)');
  }
  function novaStatusText(){
    const cal=(data.meals||[]).filter(m=>m.date===(typeof todayStr==='function'?todayStr():new Date().toISOString().slice(0,10))).reduce((a,m)=>a+(+m.cal||0),0);
    const water=(data.water&&data.water.date===(typeof todayStr==='function'?todayStr():''))?data.water.current:0;
    const goalW=(data.water&&data.water.goal)||2000;
    const pending=novaPending().filter(r=>!r.done).length;
    return 'Сегодня:\n• Калории: '+cal+' ккал\n• Вода: '+water+' / '+goalW+' мл\n• Активных напоминаний: '+pending+'\n• Баланс: '+(data.coins?data.coins.bal:0)+' ✧';
  }
  function novaPlanText(){
    const n=novaProfileData();
    if(!n.setup)return 'Сначала заполни профиль Новы в этом разделе. Я смогу учитывать расписание, занятия и твои напоминания.';
    const rows=buildNovaPlan();
    return rows.length?'План на сегодня:\n'+rows.map(r=>(r.time?r.time+' — ':'')+r.title+(r.note?' ('+r.note+')':'')).join('\n'):'На сегодня пока нет записанных дел. Добавь напоминания или укажи расписание.';
  }
  const NOVA_FALLBACK='Я могу: план на сегодня/неделю, задачи, свободное время, калории в еде, сводку дня или создать напоминание. А ещё отвечаю на вопросы из интернета: напиши «что такое …» или «найди …». Для точного плана заполни профиль Новы.';
  const NOVA_FOOD_MISS='Не нашла продукт ни в локальной базе, ни онлайн. Добавь его в «Мои блюда» (раздел «Рацион») — тогда я смогу отвечать и офлайн.';
  const NOVA_KNOW=/^(что такое|что значит|кто такой|кто такая|кто такие|найди|поиск|расскажи|объясни|погугли|узнай|как работает|почему|зачем)(\s|$)/;
  function novaReply(kind,query=''){
    const pending=novaPending();
    const todayStart=new Date(); todayStart.setHours(0,0,0,0); const tomorrow=todayStart.getTime()+86400000;
    query=(query||'').toLowerCase();
    // calories
    if(/ккал|калор|сколько .* в |бжу|белк|углевод/.test(query) || kind==='food'){
      const ans=novaCalorieAnswer(query);
      if(ans) return ans;
      return NOVA_FOOD_MISS;
    }
    if(kind==='status'||/статус|как дела|сегодня у меня|сводка|прогресс/.test(query)) return novaStatusText();
    if(kind==='evening'||/собери вечер|вечерний|подведи итог|итог дня/.test(query)){
      const st = typeof planDayStats==='function' ? planDayStats() : null;
      const wr = typeof weekReportText==='function' ? weekReportText() : '';
      const left = novaPending().filter(r=>!r.done).slice(0,5);
      let t = 'Вечерняя сводка:\n';
      if(st) t += '· День: ' + st.score + '%' + (st.complete?' (план выполнен)':'') + '\n· Еда: ' + st.meals + ' · вода: ' + (st.waterOk?'норма':'ещё нет') + ' · прогулка: ' + (st.walk?'да':'нет') + '\n';
      if(wr) t += '· ' + wr + '\n';
      if(left.length) t += 'Осталось:\n' + left.map(r=>'• '+r.text).join('\n');
      else t += 'Активных напоминаний нет — можно спокойно завершать день.';
      t += '\nНа завтра: одно главное дело в «Планы» и вода с утра.';
      return t;
    }
    if(kind==='week'||/недел|на неделю|недельный/.test(query)){
      const days=buildNovaWeekPlan();
      renderNovaWeekPlan();
      return 'План на 7 дней:\n'+days.map(d=>d.label+': '+(d.rows.length?d.rows.slice(0,3).map(r=>(r.time?r.time+' ':'')+r.title).join(', '):'пусто')).join('\n');
    }
    if(kind==='plan'||/план|расписан|сегодня/.test(query))return novaPlanText();
    if(kind==='tasks'||/задач|напоминан|дела/.test(query)) return pending.length?'У тебя '+pending.length+' активных напоминаний:\n'+pending.slice(0,8).map(r=>'• '+new Date(r.when).toLocaleString('ru-RU',{weekday:'short',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})+' — '+r.text).join('\n'):'Активных напоминаний пока нет. Можешь добавить новое — я помогу открыть форму.';
    if(kind==='free'||/свободн|окно/.test(query)) {const next=pending.find(r=>r.when>Date.now());if(!next)return 'Впереди нет активных напоминаний. По данным Luma, расписание свободно.';const mins=Math.max(0,Math.round((next.when-Date.now())/60000));return 'Следующее напоминание: «'+next.text+'» в '+new Date(next.when).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'. До него примерно '+(mins>=60?Math.floor(mins/60)+' ч '+mins%60+' мин':mins+' мин')+'.';}
    if(kind==='tip'||/совет/.test(query)) {
      const tips=['Выбери одну главную задачу на день — остальное приложится.','Пей воду равномерно, а не залпом вечером.','Короткая прогулка 10–15 минут освежает лучше, чем ещё один ролик.','Записывай дела сразу: память для идей, календарь — для сроков.','Если устал — лучше короткий отдых, чем «ещё чуть-чуть» до выгорания.'];
      return tips[Math.floor(Math.random()*tips.length)];
    }
    if(kind==='remind'||/создай напомин|добавь напомин/.test(query)){goTab('reminders');return 'Открыла раздел напоминаний. Введи текст, дату и время — затем сохрани.';}
    return NOVA_FALLBACK;
  }
  function novaAction(kind){const labels={plan:'План на сегодня',week:'План на неделю',tasks:'Мои задачи',free:'Свободное время',tip:'Совет',remind:'Создать напоминание',status:'Сводка дня',evening:'Собери вечер'};novaSay(labels[kind]||kind,'user');novaSay(novaReply(kind));if(kind==='plan')renderNovaPlan();if(kind==='week')renderNovaWeekPlan();}
  const novaPage=$('page-nova'); if(novaPage){
    novaPage.addEventListener('click',e=>{const b=e.target.closest('[data-nova]');if(b)novaAction(b.dataset.nova);});
    const f=$('novaForm');if(f)f.addEventListener('submit',async e=>{e.preventDefault();const input=$('novaInput'),q=(input.value||'').trim();if(!q)return;novaSay(q,'user');input.value='';const low=q.toLowerCase();
      if(LOOKUP_MORE.test(low)){ novaSay(lookupMore()); return; }
      let mode=null,miss=NOVA_FALLBACK;
      if(NOVA_KNOW.test(low)) mode='wiki';
      else { const r=novaReply('',low); if(r===NOVA_FOOD_MISS){mode='food';miss=NOVA_FOOD_MISS;} else if(r===NOVA_FALLBACK){mode='wiki';} else { novaSay(r); return; } }
      const a=await lookupAnswer(q,'novaChat',mode); novaSay(a===LOOKUP_NONE?miss:a);});
    const saveBtn=$('novaProfileSave');if(saveBtn)saveBtn.addEventListener('click',saveNovaProfile);
    const planBtn=$('novaBuildPlan');if(planBtn)planBtn.addEventListener('click',()=>{renderNovaPlan();novaSay(novaPlanText());});
    const weekBtn=$('novaBuildWeek');if(weekBtn)weekBtn.addEventListener('click',()=>{renderNovaWeekPlan();novaSay(novaReply('week'));});
    const modeEl=$('novaMode'); if(modeEl) modeEl.addEventListener('change',()=>{ const n=novaProfileData(); n.mode=modeEl.value; renderNovaProfile(); });
  }
  novaRenderChatHistory();
  renderNovaProfile();renderNovaPlan();


  /* ===== Шаблоны напоминаний ===== */
  function addReminderTemplate(kind){
    const map = {
      water: { text: 'Выпить воду', mins: 60 },
      study: { text: 'Учёба / занятия', mins: 60 },
      train: { text: 'Тренировка', mins: 120 },
      med: { text: 'Лекарство / витамины', mins: 60 },
      sleep: { text: 'Готовиться ко сну', mins: 180 }
    };
    const t = map[kind] || map.water;
    const when = Date.now() + t.mins * 60000;
    if (!Array.isArray(data.reminders)) data.reminders = [];
    const id = 'r' + Date.now() + Math.floor(Math.random()*1000);
    data.reminders.push({ id, text: t.text, when, done: false, repeat: 'none', fired: false });
    save();
    try { if (typeof renderReminders === 'function') renderReminders(); } catch {}
    try { if (typeof syncRemindersToSW === 'function') syncRemindersToSW(); } catch {}
    try { renderHome(); } catch {}
    toast('⏰ ' + t.text + ' · через ~' + t.mins + ' мин');
    goTab('reminders');
  }
  (function setupRemTemplates(){
    const box = $('remTemplates'); if (!box) return;
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-remtpl]'); if (!b) return;
      addReminderTemplate(b.dataset.remtpl);
    });
  })();

  /* ===== Что нового ===== */
  const WHATS_NEW = {
    '38': [
      'Настраиваемые блоки на главной: порядок и видимость',
      'Улучшенный журнал веса: тренд, среднее, разница',
      'Экспорт дневника и прогулок в CSV / текст',
      'Инструкция по офлайн-режиму и установке в настройках',
      'Надёжнее кэш Service Worker — приложение лучше работает без сети',
      'Проверка состояния кэша в настройках',
      'Исправлена несогласованность номера версии'
    ],

    '34': [
      'Luma ID для переноса одного профиля между браузерами',
      'Автоматическая локальная резервная копия в IndexedDB',
      'Полный экспорт и импорт истории чатов и настроек',
      'Восстановление локальной копии после случайной очистки данных',
      'Обновлён офлайн-кэш приложения'
    ],
    '36': [
      'Beta Design v38: интерфейс ближе к референсу AI Productivity (Dribbble)',
      'Улучшены свечения, стеклянные карточки и блок AI Summary',
      'Главный экран бета: приветствие, фокус дня, статистика задач, «Далее»',
      'Классический дизайн сохранён и доступен переключателем'
    ],
    '35': [
      'Новый фиолетовый Beta Design в стиле твоего референса',
      'Обновлены карточки, главный экран и нижняя навигация',
      'Классический дизайн и все существующие функции сохранены'
    ],
    '32': [
      'Чек-лист дня в бета-сводке',
      'Шаблоны напоминаний (вода, учёба, тренировка…)',
      'Недельный отчёт на главной (бета)',
      'Нова: команда «собери вечер»',
      'Нижнее меню — liquid glass, как на iPhone',
      'Больше продуктов в офлайн-базе калорий'
    ],
    '31': [
      'Минималистичная бета-главная в стиле Fitness',
      'Скрыты игры, магазин и лишние блоки с главной (бета)'
    ],
    '30': [
      'Кольца прогресса и достижения за план недели/месяца'
    ]
  };
  function showWhatsNewIfNeeded(){
    try {
      const seen = localStorage.getItem('luma-seen-build');
      if (seen === BUILD) return;
      if (seen === null) { localStorage.setItem('luma-seen-build', BUILD); return; } /* новым пользователям окно «Что нового» не показываем */
      const list = $('wnList'); const ver = $('wnVer'); const box = $('whatsNew');
      if (!list || !box) { localStorage.setItem('luma-seen-build', BUILD); return; }
      const items = WHATS_NEW[BUILD] || ['Обновление Luma v' + BUILD];
      list.innerHTML = items.map(x => '<li>' + x + '</li>').join('');
      if (ver) ver.textContent = 'Luma v' + BUILD;
      box.hidden = false;
      const close = () => { box.hidden = true; localStorage.setItem('luma-seen-build', BUILD); };
      $('wnClose')?.addEventListener('click', close, { once: true });
      box.addEventListener('click', e => { if (e.target === box) close(); }, { once: true });
    } catch {}
  }

  function weekReportText(){
    const week = countPlanDays(7);
    const month = countPlanDays(30);
    let waterDays = 0;
    // approximate from planLog + waterDays cnt
    waterDays = data.cnt?.waterDays || 0;
    const walks = (data.walks || []).filter(w => {
      const t = new Date(w.date + 'T12:00:00').getTime();
      return t >= Date.now() - 7*86400000;
    }).length;
    const ach = ACHIEVEMENTS.filter(a => data.ach && data.ach[a.id]).length;
    return 'Неделя: план ' + week + '/7 дней · прогулок ' + walks + ' · достижений ' + ach + '/' + ACHIEVEMENTS.length + ' · вода (всего дней с нормой): ' + waterDays + ' · месяц плана ' + month + '/20';
  }

  /* ===== Ответы из интернета прямо в чате (без своего сервера): Википедия + Open Food Facts =====
     Запросы идут из браузера к открытым API (CORS), ключи и сервер не нужны.
     Удачные ответы запоминаются в localStorage — повторный вопрос работает офлайн. */
  const LOOKUP_KEY = 'luma-lookup-cache2';
  const LOOKUP_NONET = 'Сейчас нет интернета, а этого ответа нет среди сохранённых. Попробуй, когда появится сеть: найденные ответы я запоминаю и потом показываю офлайн.';
  const LOOKUP_NONE = 'Не нашла ответа. Попробуй короче и точнее, например: «что такое креатин» или «кардио».';
  const LOOKUP_STOP = new Set(['сколько','калорий','калории','калория','ккал','бжу','белков','белки','жиров','жиры','углеводов','углеводы','содержится','есть','в','во','на','у','и']);
  function lookupCache() { try { const o = JSON.parse(localStorage.getItem(LOOKUP_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
  function lookupCacheSet(k, v) {
    try {
      const o = lookupCache(); o[k] = Object.assign({ t: Date.now() }, v);
      Object.keys(o).sort((a, b) => o[b].t - o[a].t).slice(40).forEach(x => delete o[x]);
      localStorage.setItem(LOOKUP_KEY, JSON.stringify(o));
    } catch {}
  }
  function lookupClean(q) {
    let t = String(q || '').toLowerCase().replace(/ё/g, 'е').trim();
    const pre = /^(поиск|найди в интернете|найди|погугли|открой поиск|узнай|расскажи(?: мне)? (?:про|о|об)|что такое|что значит|кто такой|кто такая|кто такие|объясни)\s+/;
    for (let i = 0; i < 2; i++) t = t.replace(pre, '');
    return t.replace(/[?!.…]+$/, '').trim().slice(0, 80);
  }
  const LOOKUP_QSTOP = new Set(['как','какой','какая','какие','какое','каким','чем','чего','зачем','почему','когда','где','можно','нужно','надо','ли','правильно','лучше','для','при','про','это','или','что','кто','мне','меня','есть','быть','перед','после','чтобы','если','сколько']);
  const LOOKUP_MORE = /^(подробнее|подробней|ещё|еще|дальше|продолжай|продолжи|расскажи больше|и что дальше)\s*[.!?]*$/i;
  const LOOKUP_BAD_TITLE = /^(список|категория|шаблон|портал|обсуждение|википедия)[\s:]/i;
  let lookupLast = null;
  const lookupNorm = t => String(t || '').toLowerCase().replace(/ё/g, 'е');
  const lookupStem = w => w.slice(0, Math.max(4, w.length - 2));
  function lookupWords(q) {
    const w = lookupNorm(q).split(/[^a-zа-я0-9]+/).filter(x => x.length >= 3 && !LOOKUP_QSTOP.has(x));
    return w.length ? w : lookupNorm(q).split(/\s+/).filter(Boolean);
  }
  /* убирает из текста Википедии транскрипции, ударения, сноски — то, что делает ответ «энциклопедичным» */
  function lookupTidy(t) {
    return String(t || '').replace(/[́­]/g, '').replace(/\[\d+\]/g, '')
      .replace(/\s*\((?=[^)]*(?:[A-Za-z]|лат\.|англ\.|нем\.|фр\.|греч\.|исп\.|ит\.|яп\.|кит\.|МФА|произн))[^)]*\)/g, '')
      .replace(/[ \t]+/g, ' ').replace(/ ([,.;:])/g, '$1').replace(/[ \t]*\n[ \t]*/g, '\n').trim();
  }
  /* режет текст на короткие порции по предложениям (без lookbehind — старые iPhone его не поддерживают) */
  function lookupChunks(text) {
    const sents = text.replace(/\n+/g, ' ').match(/[^.!?]+(?:[.!?]+|$)\s*/g) || [text];
    const merged = [];
    sents.forEach(x => { const last = merged[merged.length - 1]; if (last && /(?:^|\s)[а-яёА-ЯЁ]{1,3}\.\s*$/.test(last)) merged[merged.length - 1] = last + x; else merged.push(x); });
    const out = []; let cur = '';
    merged.forEach(x => { if (cur && (cur + x).length > 420) { out.push(cur.trim()); cur = x; } else cur += x; });
    if (cur.trim()) out.push(cur.trim());
    return out.slice(0, 6).map(c => c.length > 700 ? c.slice(0, 700).replace(/\s+\S*$/, '') + '…' : c);
  }
  async function lookupWikiFetch(search, ctl) {
    const url = 'https://ru.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&generator=search&gsrnamespace=0&gsrlimit=6&gsrsearch=' + encodeURIComponent(search) + '&prop=extracts|info|pageprops&inprop=url&ppprop=disambiguation&exintro=1&explaintext=1&exlimit=max&exchars=2200';
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return [];
    const j = await r.json();
    return j && j.query && j.query.pages ? Object.values(j.query.pages) : [];
  }
  /* берёт несколько результатов и выбирает тот, что лучше совпадает с вопросом (и с темой чата) */
  async function lookupWiki(q, ctxRe) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000);
    try {
      const words = lookupWords(q);
      let pages = await lookupWikiFetch(words.join(' '), ctl);
      if (!pages.length && words.length > 1) pages = await lookupWikiFetch(words.slice().sort((x, y) => y.length - x.length)[0], ctl);
      const stems = words.map(lookupStem), whole = lookupNorm(words.join(' '));
      const cands = pages.filter(pg => pg && pg.extract && pg.extract.length > 60 && !(pg.pageprops && 'disambiguation' in pg.pageprops) && !LOOKUP_BAD_TITLE.test(pg.title) && !/может означать|многозначн/i.test(pg.extract.slice(0, 200)))
        .map(pg => {
          const tl = lookupNorm(pg.title), ex = lookupNorm(pg.extract);
          const tHits = stems.filter(x => tl.includes(x)).length;
          let sc = (6 - (pg.index || 6)) * 0.8 + tHits * 3 + Math.min(2, stems.filter(x => ex.includes(x)).length);
          if (tl === whole) sc += 6;
          if (ctxRe && ctxRe.test(ex)) sc += 2;
          return { pg, sc, tHits };
        }).sort((x, y) => y.sc - x.sc);
      if (!cands.length) return null;
      const top = cands[0].pg, chunks = lookupChunks(lookupTidy(top.extract));
      if (!chunks.length) return null;
      return { title: top.title, url: top.fullurl || ('https://ru.wikipedia.org/wiki/' + encodeURIComponent(top.title.replace(/ /g, '_'))), chunks, sure: cands[0].tHits > 0, alts: cands.slice(1, 3).map(c => c.pg.title) };
    } catch { return null; } finally { clearTimeout(to); }
  }
  const LOOKUP_OPEN = t => ['Вот что нашла про «' + t + '»:', 'Нашла в Википедии — «' + t + '»:', 'Коротко про «' + t + '»:'][t.length % 3];
  function lookupRender(d, i) {
    const more = i < d.chunks.length - 1;
    let t = (i === 0 ? LOOKUP_OPEN(d.title) + '\n\n' : '') + d.chunks[i];
    if (i === 0 && !d.sure) t += '\n\nНе уверена, что это именно то, что ты имел в виду.' + (d.alts.length ? ' Может, ' + d.alts.map(a => '«' + a + '»').join(' или ') + '? Напиши «найди …».' : ' Если не то — уточни вопрос.');
    if (more) t += '\n\nНапиши «подробнее» — расскажу дальше.';
    if (i === 0 || !more) t += '\n\nИсточник: Википедия — ' + d.url;
    return t;
  }
  function lookupMore() {
    if (!lookupLast) return 'Пока не о чем продолжать. Спроси что-нибудь, например: «что такое креатин».';
    if (lookupLast.i >= lookupLast.d.chunks.length - 1) return 'В кратком описании больше ничего нет. Полный текст — по ссылке: ' + lookupLast.d.url;
    lookupLast.i++; return lookupRender(lookupLast.d, lookupLast.i);
  }
  async function lookupFood(raw) {
    const m = String(raw).match(/(\d+[.,]?\d*)\s*(кг|гр|г|грамм\w*)?/);
    let grams = 100;
    if (m) { grams = parseFloat(m[1].replace(',', '.')); if ((m[2] || '').startsWith('кг')) grams *= 1000; if (!(grams > 0 && grams <= 5000)) grams = 100; }
    const name = lookupClean(raw).replace(/\d+[.,]?\d*\s*(кг|гр|г|грамм\w*)?/g, ' ').split(/\s+/).filter(w => w && !LOOKUP_STOP.has(w)).join(' ');
    if (name.length < 2) return null;
    const j = await offFetch(OFF.base + '/cgi/search.pl?search_simple=1&action=process&json=1&page_size=10&lc=ru&fields=' + OFF.fields + '&search_terms=' + encodeURIComponent(name), new AbortController());
    const items = (j && Array.isArray(j.products) ? j.products : []).map(offItem).filter(Boolean).slice(0, 3);
    if (!items.length) return null;
    const k = grams / 100, r1 = v => Math.round(v * 10) / 10;
    return 'Вот что нашла в Open Food Facts (на ' + Math.round(grams) + ' г):\n' + items.map(it => '• ' + it.n + ' — ' + Math.round(it.c * k) + ' ккал · Б ' + r1(it.p * k) + ' · Ж ' + r1(it.f * k) + ' · У ' + r1(it.u * k)).join('\n') + '\n\nДанные вносят пользователи — сверяй с упаковкой.';
  }
  function lookupPending(chatId) {
    const chat = $(chatId); if (!chat) return null;
    const el = document.createElement('div'); el.className = 'nova-msg bot'; el.textContent = 'Ищу ответ…';
    chat.appendChild(el); chat.scrollTop = chat.scrollHeight; return el;
  }
  /* всегда возвращает строку; LOOKUP_NONE — если ничего не нашлось (вызывающий подставит свой запасной ответ) */
  async function lookupAnswer(raw, chatId, mode) {
    const q = lookupClean(raw);
    if (q.length < 2) return LOOKUP_NONE;
    const ctxRe = chatId === 'sportChat' ? /спорт|тренир|упражнен|мышц|физическ|здоровь|нагрузк|бег|атлет|фитнес/ : null;
    const key = (mode === 'food' ? 'f:' : 'w:') + q + (ctxRe ? ':s' : '');
    const hit = lookupCache()[key];
    if (hit && hit.d) { lookupLast = { d: hit.d, i: 0 }; return lookupRender(hit.d, 0); }
    if (hit && hit.text) return hit.text;
    if (navigator.onLine === false) return LOOKUP_NONET;
    const ph = lookupPending(chatId);
    let res = null;
    try { res = mode === 'food' ? await lookupFood(raw) : await lookupWiki(q, ctxRe); } catch { res = null; }
    if (ph) ph.remove();
    if (!res) return LOOKUP_NONE;
    if (typeof res === 'string') { lookupCacheSet(key, { text: res }); return res; }
    lookupCacheSet(key, { d: res }); lookupLast = { d: res, i: 0 };
    return lookupRender(res, 0);
  }

    /* ===== Спорт-чат (не планирование) ===== */
  const SPORT_KEY = 'luma-sport-chat';
  function sportSay(text, who='bot'){
    const chat=$('sportChat'); if(!chat) return;
    const el=document.createElement('div'); el.className='nova-msg '+who; el.textContent=text;
    chat.appendChild(el); chat.scrollTop=chat.scrollHeight;
    try {
      const hist=JSON.parse(localStorage.getItem(SPORT_KEY)||'[]');
      hist.push({who,text,t:Date.now()});
      localStorage.setItem(SPORT_KEY, JSON.stringify(hist.slice(-40)));
    } catch {}
  }
  function sportLocal(q){
    q=(q||'').toLowerCase().replace(/ё/g,'е');
    const tips=[
      {k:['размин','разогр'],t:'Разминка 5–10 минут: лёгкий суставной круг (шея, плечи, таз, колени, стопы), затем 1–2 минуты лёгкого кардио (ходьба на месте, прыжки без резкости). Не начинай силовую или бег «с нуля».'},
      {k:['шаг','норма шагов','10000','10 000'],t:'Ориентир для многих взрослых — около 7–10 тысяч шагов в день, но это не жёсткая норма. Важнее регулярность. В Luma шаги/прогулки можно отмечать в разделе «Ходьба».'},
      {k:['домашн','дома ','без зала','без инвентар'],t:'Домашняя база: приседания, отжимания (от пола или от стола), планка, выпады, ягодичный мост. 2–3 круга по 8–12 повторений, отдых 60–90 сек. Следи за техникой, не гонись за количеством.'},
      {k:['вод','пить'],t:'Пей по жажде и ориентируйся на самочувствие. В жару и на длинных тренировках воды нужно больше. В Luma есть трекер воды на главной и в рационе.'},
      {k:['восстанов','отдых','сон','крепатур'],t:'Восстановление: сон, лёгкая ходьба на следующий день, мягкая растяжка, не ставь тяжёлую ту же группу мышц каждый день. Сильная боль в суставе — повод снизить нагрузку.'},
      {k:['кардио','бег','ходьб'],t:'Кардио: начинай с комфортного темпа, где можешь говорить фразами. 20–30 минут 3 раза в неделю — хороший старт. Увеличивай время раньше, чем скорость.'},
      {k:['силов','мышц','гантел'],t:'Силовые: 2–3 раза в неделю, основные движения (присед/тяги/жим/тяга к поясу). 6–12 повторений, 2–4 подхода. Между подходами 1–2 минуты отдыха.'},
      {k:['растяж','гибкост'],t:'Растяжку лучше после лёгкой разминки или в конце тренировки. Без резких рывков, 20–30 секунд на позицию, дыхание ровное.'},
    ];
    for(const x of tips){ if(x.k.some(k=>q.includes(k))) return x.t; }
    return null;
  }
  async function sportReply(q){
    q=(q||'').trim(); if(!q) return 'Напиши вопрос про спорт или выбери кнопку выше.';
    if(LOOKUP_MORE.test(q)) return lookupMore();
    const local=sportLocal(q);
    if(local) return local;
    const a=await lookupAnswer(q,'sportChat','wiki');
    return a===LOOKUP_NONE ? 'В моих подсказках и в Википедии точного ответа не нашлось. Попробуй уточнить, например: «кардио», «растяжка», «планка».' : a;
  }
  function sportAction(kind){
    const map={warmup:'Как правильно разминаться',steps:'Какая норма шагов в день',home:'Домашняя тренировка без зала',water:'Сколько воды пить при спорте',rest:'Как восстанавливаться после тренировки'};
    const q=map[kind]||kind; sportSay(q,'user');
    sportReply(q).then(a=>sportSay(a));
  }
  (function setupSportChat(){
    const page=$('page-chat'); if(!page) return;
    page.addEventListener('click',e=>{const b=e.target.closest('[data-sport]'); if(b) sportAction(b.dataset.sport);});
    const f=$('sportForm'); if(f) f.addEventListener('submit',async e=>{
      e.preventDefault(); const input=$('sportInput'); const q=(input.value||'').trim(); if(!q) return;
      sportSay(q,'user'); input.value='';
      sportSay(await sportReply(q));
    });
    // restore short history
    try {
      const hist=JSON.parse(localStorage.getItem(SPORT_KEY)||'[]');
      const chat=$('sportChat');
      if(chat && hist.length){ chat.innerHTML=''; hist.slice(-12).forEach(m=>sportSay(m.text,m.who)); }
    } catch {}
    const clr=$('sportClear'); if(clr) clr.addEventListener('click',()=>{ try{localStorage.removeItem(SPORT_KEY);}catch{} const chat=$('sportChat'); if(chat) chat.innerHTML='<div class="nova-msg bot">Чат очищен. Спроси про разминку, кардио или восстановление.</div>'; toast('Спорт-чат очищен'); });
  })();

  /* ===== Поддержка ===== */
  const SUP_KEY='luma-support-chat';
  function supportSay(text,who='bot'){
    const chat=$('supportChat'); if(!chat) return;
    const el=document.createElement('div'); el.className='nova-msg '+who; el.textContent=text;
    chat.appendChild(el); chat.scrollTop=chat.scrollHeight;
    try{ const h=JSON.parse(localStorage.getItem(SUP_KEY)||'[]'); h.push({who,text,t:Date.now()}); localStorage.setItem(SUP_KEY,JSON.stringify(h.slice(-40))); }catch{}
  }
  function supportReply(q){
    q=(q||'').toLowerCase().replace(/ё/g,'е');
    if(/уведомл|notif|не приход|пуш/.test(q)) return 'Уведомления:\n• Разрешите их в настройках сайта/приложения.\n• На iPhone у PWA уведомления ограничены — они надёжнее, когда приложение недавно открывалось.\n• Проверьте «Планы» → включение уведомлений и тестовую кнопку.\nЕсли система запретила доступ — откройте настройки сайта в Safari/Chrome → Уведомления → Разрешить.';
    if(/iphone|айфон|ios|офлайн|без интернет|домашний экран|pwa|на экран/.test(q)) return 'iPhone и офлайн:\n1) Откройте Luma в Safari.\n2) Поделиться → На экран «Домой».\n3) Зайдите один раз с интернетом, чтобы сохранился кэш.\nПосле этого основные данные (планы, рацион, питомец) работают без сети. Онлайн-поиск продуктов и спорт-поиск без интернета недоступны.';
    if(/начать|с чего|онборд|профил/.test(q) && !/iphone|айфон|спорт/.test(q)) return 'С чего начать:\n1) Заполните профиль (имя, возраст — в «Ещё»).\n2) Укажите режим дня у Новы (Учёба/Работа/Свободный).\n3) Добавьте напоминания в «Планы».\n4) При желании ведите воду и рацион.\nДанные хранятся только на этом устройстве.';
    if(/бэкап|экспорт|импорт|данн|пропал|сброс|очист/.test(q)) return 'Данные и бэкап:\n• Всё хранится в браузере этого устройства.\n• «Ещё» → Экспорт — сохраните JSON-файл.\n• Импорт — восстановление из файла.\n• Очистка данных браузера удалит прогресс, если не было экспорта.\nСервера у Luma нет: мы не можем восстановить данные «из облака».';
    if(/нова|план на|помощник/.test(q)) return 'Нова — помощник по планам и напоминаниям внутри Luma. Она составляет план дня/недели из вашего профиля, может ответить про калории из локальной базы и показать сводку дня.\nСпорт-чат — отдельно: про тренировки и поиск в интернете.\nПоддержка — про само приложение.';
    if(/спорт.?чат|трениров|упражн/.test(q)) return 'Спорт-чат открывается из Новы (кнопка «Чат про спорт») или из «Ещё». Там можно спросить про разминку, шаги, домашние тренировки. Для редких тем напишите «поиск …» — откроется интернет-поиск.';
    if(/почт|автор|написать|связ|help/.test(q)) return 'Чтобы связаться с автором, нажмите «Написать автору» ниже. Откроется письмо на help.luma2020@gmail.com. Опишите устройство, браузер и что произошло.';
    if(/темн|светл|тема|цвет/.test(q)) return 'Тема и режим оформления меняются в «Ещё» → блок «Тема». Доступны цветовые палитры и тёмный/светлый/системный режим.';
    if(/питом|игр/.test(q)) return 'Питомцы: раздел ухода и коллекции (кормление, сон, игра). Игры — в нижней вкладке «Игры». Это необязательные элементы; основные функции — планы, рацион, ходьба.';
    return 'Я могу помочь с: запуском, уведомлениями, iPhone/офлайн, бэкапом данных, Новой и спорт-чатом.\nЕсли ответа нет — нажмите «Написать автору» (help.luma2020@gmail.com).';
  }
  function supportAction(kind){
    const map={start:'С чего начать',notify:'Не приходят уведомления',iphone:'Как пользоваться на iPhone без интернета',data:'Как сохранить данные (бэкап)',nova:'Что умеет Нова'};
    const q=map[kind]||kind; supportSay(q,'user'); supportSay(supportReply(q));
  }
  (function setupSupport(){
    const page=$('page-support'); if(!page) return;
    page.addEventListener('click',e=>{const b=e.target.closest('[data-sup]'); if(b) supportAction(b.dataset.sup);});
    const f=$('supportForm'); if(f) f.addEventListener('submit',e=>{
      e.preventDefault(); const input=$('supportInput'); const q=(input.value||'').trim(); if(!q) return;
      supportSay(q,'user'); supportSay(supportReply(q)); input.value='';
    });
    try{
      const h=JSON.parse(localStorage.getItem(SUP_KEY)||'[]'); const chat=$('supportChat');
      if(chat && h.length){ chat.innerHTML=''; h.slice(-12).forEach(m=>supportSay(m.text,m.who)); }
    }catch{}
    const clr=$('supportClear'); if(clr) clr.addEventListener('click',()=>{ try{localStorage.removeItem(SUP_KEY);}catch{} const chat=$('supportChat'); if(chat) chat.innerHTML='<div class="nova-msg bot">История очищена. Задайте вопрос по приложению или напишите автору.</div>'; toast('Чат поддержки очищен'); });
  })();


  const petPage=$('page-pets'); if(petPage){petPage.addEventListener('click',e=>{const c=e.target.closest('[data-petcare]');if(c){petCare(c.dataset.petcare);return;}const b=e.target.closest('[data-pet]');if(b){const pet=PETS.find(x=>x.id===b.dataset.id);if(!pet)return;if(b.dataset.pet==='buy'){if(pet.role){toast('Этот питомец доступен только в панели соответствующей роли.');return;}if(data.coins.bal<pet.price){toast('Не хватает '+(pet.price-data.coins.bal)+' ✧');return;}spendCoins(pet.price);data.pets.owned.push(pet.id);data.pets.active=pet.id;save();renderPets();updateWallet();toast('Питомец открыт: '+pet.name);}else if(b.dataset.pet==='equip'&&petOwned(pet)){data.pets.active=pet.id;data.pets.mood='awake';save();renderPets();toast('Активирован: '+pet.name);}return;}const f=e.target.closest('[data-petfood]');if(f){const food=PET_FOODS.find(x=>x.id===f.dataset.id);if(!food)return;if(data.coins.bal<food.price){toast('Не хватает '+food.price+' ✧');return;}spendCoins(food.price);data.pets.food[food.id]=(data.pets.food[food.id]||0)+1;save();renderPets();toast('Куплено: '+food.name);}});}

  function spinLottery() {
    const p = priceOf(LOTTERY);
    if (!spendCoins(p)) { toast('Не хватает ' + fmtN(p - data.coins.bal) + ' ✧'); return; }
    data.cnt.lottery++;
    const r = Math.random(); let msg;
    const gain = (n, t) => { addCoins(n, { raw: true }); msg = t + ' +' + n + ' ✧'; };
    if (r < 0.40) gain(10, 'Утешительный приз');
    else if (r < 0.65) gain(40, 'Почти вернулись');
    else if (r < 0.80) gain(80, 'Неплохо!');
    else if (r < 0.88) { const bs = SHOP.filter(i => i.inv), b = bs[Math.floor(Math.random() * bs.length)]; data.inv[b.inv]++; msg = 'Бонус: ' + b.icon + ' ' + b.name; }
    else if (r < 0.94) gain(150, 'Крупный выигрыш!');
    else if (r < 0.98) {
      const pool = SHOP.filter(i => !i.inv && !data.owned[i.id]);
      if (pool.length) { const it = pool[Math.floor(Math.random() * pool.length)]; data.owned[it.id] = true; msg = '🎉 Джекпот: ' + it.icon + ' ' + it.name + ' — бесплатно!'; }
      else gain(200, 'Джекпот!');
    } else gain(500, '🎉 СУПЕРДЖЕКПОТ!');
    lastSpin = msg; save(); syncThemeSwatches(); checkTitles(); renderShop();
  }
  (function setupShopUi() {
    $('shopTabs').addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (!b) return; shopTab = b.dataset.st; renderShop(); });
    $('shopBody').addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      const act = b.dataset.act, id = b.dataset.id, it = id ? findItem(id) : null;
      if (b.dataset.pet) {
        const pet = PETS.find(x => x.id === id);
        if (!pet) return;
        if (b.dataset.pet === 'buy' && !petOwned(pet) && !pet.role) {
          if (data.coins.bal < pet.price) { toast('Не хватает '+(pet.price-data.coins.bal)+' ✧'); return; }
          spendCoins(pet.price); data.pets.owned.push(pet.id); data.pets.active = pet.id; save(); renderPets(); renderShop(); toast('Питомец открыт: '+pet.name);
        } else if (b.dataset.pet === 'equip' && petOwned(pet)) {
          data.pets.active = pet.id; save(); renderPets(); renderShop(); toast('Выбран питомец: '+pet.name);
        }
        return;
      }
      if (act === 'buy' && it) buyItem(it);
      else if (act === 'equip' && it && isOwned(it)) { equipItem(it); renderShop(); syncThemeSwatches(); toast('Выбрано: ' + it.name); }
      else if (act === 'unequip') { data.equip[b.dataset.kind] = null; save(); updateWallet(); renderShop(); }
      else if (act === 'spin') spinLottery();
      else if (act === 'title' && data.titles.got[id]) { data.titles.active = id; save(); updateWallet(); renderShop(); }
      else if (act === 'rwadd') {
        const name = $('rwName').value.trim(), price = Math.round(+$('rwPrice').value);
        if (!name) { toast('Напиши название награды'); return; }
        if (!(price >= 1 && price <= 10000000)) { toast('Укажи цену в монетах'); return; }
        data.rewards.push({ id: 'rw' + Date.now(), name: name.slice(0, 40), price, count: 0 }); save(); renderShop(); toast('Награда добавлена');
      } else if (act === 'claim') {
        const r = data.rewards.find(x => x.id === id); if (!r) return;
        if (!spendCoins(r.price)) { toast('Не хватает ' + fmtN(r.price - data.coins.bal) + ' ✧'); return; }
        r.count = (r.count || 0) + 1; save(); renderShop(); toast('🎁 ' + r.name + ' — наслаждайся!');
      } else if (act === 'rwdel') {
        if (!confirm('Удалить эту награду?')) return;
        data.rewards = data.rewards.filter(x => x.id !== id); save(); renderShop();
      }
    });
  })();

  /* ----- Нормы по возрасту ----- */
  const AGE_GROUPS = [
    { id: '10-12', lo: 10, hi: 12, name: '10–12 лет' },
    { id: '13-15', lo: 13, hi: 15, name: '13–15 лет' },
    { id: '16-17', lo: 16, hi: 17, name: '16–17 лет' },
    { id: '18-29', lo: 18, hi: 29, name: '18–29 лет' },
    { id: '30-44', lo: 30, hi: 44, name: '30–44 года' },
    { id: '45-59', lo: 45, hi: 59, name: '45–59 лет' },
    { id: '60+',   lo: 60, hi: 200, name: '60+ лет' }
  ];
  /* Ориентировочные стартовые значения; в админ-панели меняются для каждой группы */
  const DEFAULT_NORMS = {
    '10-12': { reaction: 320, tap: 45, memory: 18, snake: 8,  g2048: 1500, walk: null },
    '13-15': { reaction: 290, tap: 52, memory: 16, snake: 12, g2048: 2500, walk: null },
    '16-17': { reaction: 270, tap: 58, memory: 15, snake: 15, g2048: 3000, walk: null },
    '18-29': { reaction: 250, tap: 60, memory: 14, snake: 18, g2048: 3500, walk: null },
    '30-44': { reaction: 265, tap: 55, memory: 15, snake: 15, g2048: 3000, walk: null },
    '45-59': { reaction: 285, tap: 48, memory: 17, snake: 12, g2048: 2500, walk: null },
    '60+':   { reaction: 320, tap: 40, memory: 20, snake: 8,  g2048: 1500, walk: null }
  };
  const NORM_FIELDS = [
    { k: 'reaction', label: '⚡ Реакция, мс (не больше)' },
    { k: 'tap', label: '👆 Кликер, нажатий (не меньше)' },
    { k: 'memory', label: '🧠 Память, ходов (не больше)' },
    { k: 'snake', label: '🐍 Змейка, очков (не меньше)' },
    { k: 'g2048', label: '🔢 2048, очков (не меньше)' },
    { k: 'walk', label: '🚶 Прогулка, мин/день (пусто = авто)' }
  ];
  const GAME_NORM = {
    reaction: { dir: 'max', unit: 'мс', rec: () => data.stats.reactionBest },
    tap:      { dir: 'min', unit: 'нажатий', rec: () => data.stats.tapBest },
    memory:   { dir: 'max', unit: 'ходов', rec: () => data.stats.memoryMoves },
    snake:    { dir: 'min', unit: 'очков', rec: () => data.stats.snakeBest },
    g2048:    { dir: 'min', unit: 'очков', rec: () => data.stats.g2048Best }
  };
  function ageGroup(age) {
    age = +age;
    if (!(age > 0)) return null;
    return AGE_GROUPS.find(g => age >= g.lo && age <= g.hi) || (age < 10 ? AGE_GROUPS[0] : AGE_GROUPS[AGE_GROUPS.length - 1]);
  }
  function getNorms(gid) { return Object.assign({}, DEFAULT_NORMS[gid], (data.admin.norms || {})[gid] || {}); }
  function userGroup() { const pr = data.profile || {}; return pr.done ? ageGroup(pr.age) : null; }
  function curNorm(k) { const g = userGroup(); if (!g) return null; const n = +getNorms(g.id)[k]; return n > 0 ? n : null; }
  function normLineHTML(k) {
    const g = userGroup();
    if (!g) return 'Норма по возрасту появится, когда укажешь возраст: «Ещё» → «Параметры»';
    const n = curNorm(k); if (!n) return '';
    const m = GAME_NORM[k], rec = m.rec();
    let html = 'Норма для ' + g.name + ': <b>' + (m.dir === 'max' ? '≤ ' : '≥ ') + n + ' ' + m.unit + '</b>';
    if (rec != null && !(m.dir === 'min' && rec <= 0)) {
      const ok = m.dir === 'max' ? rec <= n : rec >= n;
      html += '<br>' + (ok ? '<span class="ok">Твой рекорд в пределах нормы ✓</span>' : '<span class="no">До нормы ещё ' + Math.abs(rec - n) + ' ' + m.unit + '</span>');
    }
    return html;
  }
  function updateNormLine(k) { const el = $('normLine-' + k); if (el) el.innerHTML = normLineHTML(k); }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ----- Панели: админ (урезанная, с лимитами) и создатель (полная). Разметка строится только после входа ----- */
  const adminEl = $('adminPanel');
  const ADMIN_LIM = { grant: 500, day: 2000, priceMin: 10, priceMax: 5000 };
  const LOCK_KEY = 'luma-lk';
  const lockLeft = () => { try { const o = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}'); return Math.max(0, (o.until || 0) - Date.now()); } catch { return 0; } };
  const lockFail = () => { try { const o = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}'); o.n = (o.n || 0) + 1; if (o.n >= 5) o.until = Date.now() + Math.min(3600000, 60000 * Math.pow(2, o.n - 5)); localStorage.setItem(LOCK_KEY, JSON.stringify(o)); } catch {} };
  const lockClear = () => { try { localStorage.removeItem(LOCK_KEY); } catch {} };
  const panelCan = r => r === 'creator' ? ROLE.creator : (r === 'admin' ? ROLE.admin : false);

  function grantRole(role, tok) {
    data.auth = data.auth || { a: null, c: null };
    data.auth[role === 'admin' ? 'a' : 'c'] = tok;
    const had = !!data.titles.got[role];
    ROLE = rolesOf(data);
    data.pets = data.pets || { owned: ['sprout'], active: 'sprout' };
    data.pets.owned = Array.isArray(data.pets.owned) ? data.pets.owned : ['sprout'];
    const exclusivePet = role === 'creator' ? 'dragon' : 'phoenix';
    if (ROLE[role] && !data.pets.owned.includes(exclusivePet)) data.pets.owned.push(exclusivePet);
    // Эксклюзив питомца выдаётся роли, но активируется вручную в панели.
    save(); checkTitles();
    if (!had && data.titles.got[role]) { data.titles.active = role; save(); setTimeout(() => toast(role === 'creator' ? '🛠️ Тебе выдано звание «Создатель»' : '🛡️ Тебе выдано звание «Администратор»'), 700); }
    syncThemeSwatches(); updateWallet();
  }
  function revokeRole(role) {
    data.auth[role === 'admin' ? 'a' : 'c'] = null;
    enforceRoles(data);
    if (data.pets && ['dragon','phoenix'].includes(data.pets.active)) data.pets.active = 'sprout';
    save(); applyTheme(data.theme); syncThemeSwatches(); checkTitles(); updateWallet();
  }

  function askPassword(role) {
    closeSheets(true);
    const old = $('sheetAuth'); if (old) old.remove();
    const back = document.createElement('div');
    back.className = 'sheet-back'; back.id = 'sheetAuth'; back.setAttribute('aria-hidden', 'true');
    back.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Вход"><div class="grab"></div><div class="sheet-head"><h3>🔒 Доступ</h3><button type="button" class="sheet-close" data-close aria-label="Закрыть">✕</button></div><div class="fields"><div class="field full"><label>Пароль</label><input id="authPw" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40"></div></div><div class="form-actions"><button class="btn" type="button" id="authOk">Войти</button></div></div>';
    document.body.appendChild(back);
    const drop = () => { closeSheets(); setTimeout(() => back.remove(), 350); };
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) drop(); });
    const inp = back.querySelector('#authPw');
    const go = () => {
      const left = lockLeft();
      if (left) { toast('Слишком много попыток. Подожди ' + Math.ceil(left / 60000) + ' мин.'); inp.value = ''; return; }
      const pw = inp.value; inp.value = '';
      if (!pw) return;
      if (authCheck(role, authToken(role, pw))) {
        lockClear(); grantRole(role, authToken(role, pw)); drop(); setTimeout(() => openPanel(role), 120);
      } else {
        lockFail(); toast('Неверный пароль');
        inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.focus();
      }
    };
    back.querySelector('#authOk').onclick = go;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    openSheet('sheetAuth');
    setTimeout(() => { try { inp.focus(); } catch {} }, 350);
  }

  const grantLeft = () => { const g = data.admin.grant; return g && g.date === todayStr() ? Math.max(0, ADMIN_LIM.day - g.sum) : ADMIN_LIM.day; };
  const pSec = (title, tag, inner) => '<div class="glass section"><div class="section-head"><h2>' + title + '</h2>' + (tag ? '<span class="tag">' + tag + '</span>' : '') + '</div>' + inner + '</div>';
  const pNum = (id, label, val, min, max) => '<div class="field"><label>' + label + '</label><input type="number" id="' + id + '" min="' + min + '" max="' + max + '" inputmode="numeric" value="' + (val == null ? '' : val) + '"></div>';
  function normsHTML() {
    const mine = userGroup();
    return AGE_GROUPS.map(g => {
      const n = getNorms(g.id);
      const inputs = NORM_FIELDS.map(f => '<div class="field"><label>' + f.label + '</label><input type="number" min="0" inputmode="numeric" data-g="' + g.id + '" data-k="' + f.k + '" value="' + (n[f.k] != null && n[f.k] !== '' ? n[f.k] : '') + '"' + (f.k === 'walk' ? ' placeholder="авто"' : '') + '></div>').join('');
      return '<details class="norm-group"' + (mine && mine.id === g.id ? ' open' : '') + '><summary>' + g.name + '<small>' + (mine && mine.id === g.id ? 'твоя группа' : '') + '</small></summary><div class="fields">' + inputs + '</div></details>';
    }).join('');
  }
  const PRICE_ITEMS = () => SHOP.concat([{ id: 'lottery', name: 'Лотерея (один спин)', icon: '🎰', price: LOTTERY.price }]);
  const pricesHTML = cr => PRICE_ITEMS().map(i => '<div class="field"><label>' + i.icon + ' ' + i.name + '</label><input type="number" min="' + (cr ? 0 : ADMIN_LIM.priceMin) + '" max="' + (cr ? 1000000 : ADMIN_LIM.priceMax) + '" inputmode="numeric" data-pid="' + i.id + '" value="' + priceOf(i) + '"></div>').join('');

  function panelHTML(role) {
    const cr = role === 'creator', st = data.stats;
    let h = '<div class="admin-card"><div class="admin-top"><div><div class="eyebrow">' + (cr ? 'CREATOR' : 'ADMIN') + '</div><h2>' + (cr ? 'Панель создателя' : 'Админ-панель') + '</h2></div><button class="btn secondary small" type="button" data-ad="close">Выйти</button></div>';
    /* монеты */
    if (cr) {
      h += pSec('Монеты', '<span id="adBal">' + fmtN(data.coins.bal) + ' ✧</span>',
        '<div class="fields"><div class="field full"><label>Сумма, ✧</label><input type="number" id="adCoinAmt" min="0" max="1000000000" inputmode="numeric" placeholder="1000"></div></div>' +
        '<div class="form-actions"><button class="btn" type="button" data-ad="coinadd">＋ Добавить</button><button class="btn secondary" type="button" data-ad="coinsub">− Списать</button><button class="btn secondary" type="button" data-ad="coinset">= Установить</button></div>' +
        '<p class="notice">Быстро добавить:</p><div class="chips-row">' + [1000, 10000, 100000, 1000000].map(q => '<button class="btn secondary small" type="button" data-ad="quick" data-q="' + q + '">+' + fmtN(q) + '</button>').join('') + '</div>' +
        '<p class="notice">Монеты создателя считаются заработанными — от них открываются звания «Богач», «Магнат» и другие.</p>');
      h += pSec('Награды и серия', '', '<div class="fields">' + pNum('adMult', 'Множитель наград (1–1000)', data.admin.mult, 1, 1000) + pNum('adStreak', 'Серия дней', data.streak.count, 0, 9999) + '</div><div class="form-actions"><button class="btn" type="button" data-ad="misc">Сохранить</button></div>');
    } else {
      h += pSec('Монеты', '<span id="adBal">' + fmtN(data.coins.bal) + ' ✧</span>',
        '<div class="fields"><div class="field full"><label>Сумма, ✧ (до ' + fmtN(ADMIN_LIM.grant) + ' за раз)</label><input type="number" id="adCoinAmt" min="1" max="' + ADMIN_LIM.grant + '" inputmode="numeric" placeholder="100"></div></div>' +
        '<div class="form-actions"><button class="btn" type="button" data-ad="coinadd">＋ Выдать</button></div>' +
        '<div class="chips-row">' + [50, 100, 500].map(q => '<button class="btn secondary small" type="button" data-ad="quick" data-q="' + q + '">+' + q + '</button>').join('') + '</div>' +
        '<p class="notice">Лимит выдачи: ' + fmtN(ADMIN_LIM.day) + ' ✧ в день. Осталось сегодня: <b id="adLeft">' + fmtN(grantLeft()) + '</b> ✧. Выданные монеты не идут в «заработанные» и не открывают звания.</p>');
    }
    if (!cr) { h += pSec('Эксклюзив администратора', 'ТОЛЬКО ТЫ', '<div class="pet-preview"><div class="pet-emoji">🔥</div><div class="pet-info"><b>Феникс Администратора</b><small>Эксклюзивный питомец</small></div><div class="pet-action"><button class="btn small" type="button" data-ad="petadmin">' + (data.pets.active === 'phoenix' ? '✓ Активен' : 'Активировать') + '</button></div></div>'); }
    /* особое (только создатель) */
    if (cr) {
      h += pSec('Эксклюзив создателя', 'ТОЛЬКО ТЫ',
        '<p class="notice" style="margin-top:0">Эксклюзивные предметы и питомец доступны только в панели создателя.</p>' + '<div class="pet-preview"><div class="pet-emoji">🐉</div><div class="pet-info"><b>Дракон Создателя</b><small>Эксклюзивный питомец</small></div><div class="pet-action"><button class="btn small" type="button" data-ad="petcreator">' + (data.pets.active === 'dragon' ? '✓ Активен' : 'Активировать') + '</button></div></div>' +
        SPECIAL.filter(i => i.role === 'creator').map(i => { const on = isOn(i); return '<div class="shop-item' + (on ? ' mine' : '') + '"><div class="si-ico">' + (i.svg || i.icon) + '</div><div class="si-body"><b>' + i.name + '</b><small>' + i.desc + '</small></div><div class="si-act"><button class="btn ' + (on ? 'secondary ' : '') + 'small" type="button" data-ad="' + (on ? 'unequip' : 'equip') + '" data-id="' + i.id + '">' + (on ? 'Снять' : 'Надеть') + '</button></div></div>'; }).join('') +
        '<div class="form-actions"><button class="btn" type="button" data-ad="equipall">✦ Надеть всё</button></div>');
      h += pSec('Звания и магазин', 'ДОСТУП',
        '<div class="form-actions"><button class="btn secondary" type="button" data-ad="alltitles">Открыть все звания</button><button class="btn secondary" type="button" data-ad="notitles">Закрыть все звания</button><button class="btn secondary" type="button" data-ad="allshop">Открыть весь магазин</button><button class="btn danger" type="button" data-ad="resetshop">Сбросить покупки</button></div>');
    }
    /* цены */
    h += pSec('Цены магазина', '✧', '<details class="norm-group"><summary>Показать цены<small>изменить</small></summary><div class="fields">' + pricesHTML(cr) + '</div></details>' + (cr ? '' : '<p class="notice">Допустимо от ' + ADMIN_LIM.priceMin + ' до ' + fmtN(ADMIN_LIM.priceMax) + ' ✧.</p>') + '<div class="form-actions"><button class="btn" type="button" data-ad="prices">Сохранить цены</button><button class="btn secondary" type="button" data-ad="resetprices">Стандартные</button></div>');
    /* время кликера */
    h += pSec('Время кликера', 'ИГРЫ', '<div class="fields">' + pNum('adTapSec', 'Секунд (5–60)', data.admin.tapSeconds, 5, 60) + '</div><div class="form-actions"><button class="btn" type="button" data-ad="time">Сохранить</button></div>');
    /* рекорды (создатель) */
    if (cr) {
      h += pSec('Рекорды', 'ИГРЫ', '<p class="notice" style="margin-top:0">Пустое поле убирает рекорд (реакция и память).</p><div class="fields">' +
        pNum('adRea', '⚡ Реакция, мс', st.reactionBest, 50, 5000) + pNum('adTap', '👆 Кликер', st.tapBest || 0, 0, 999) + pNum('adMemM', '🧠 Память, ходов', st.memoryMoves, 8, 999) + pNum('adMemT', '🧠 Память, сек', st.memoryTime, 1, 9999) +
        pNum('adSnake', '🐍 Змейка', st.snakeBest || 0, 0, 999) + pNum('ad2048', '🔢 2048', st.g2048Best || 0, 0, 9999999) + pNum('adTW', '❌ Победы', st.ttt.w, 0, 99999) + pNum('adTD', '❌ Ничьи', st.ttt.d, 0, 99999) + pNum('adTL', '❌ Поражения', st.ttt.l, 0, 99999) +
        '</div><div class="form-actions"><button class="btn" type="button" data-ad="rec">Сохранить рекорды</button><button class="btn danger" type="button" data-ad="resetrec">Сбросить все</button></div>');
    }
    /* нормы */
    h += pSec('Нормы по возрасту', 'НОРМА', '<p class="notice" style="margin-top:0">Реакция и память — «не больше», остальное — «не меньше». Прогулка: пусто = авто.</p><div id="adNorms">' + normsHTML() + '</div><div class="form-actions"><button class="btn" type="button" data-ad="norms">Сохранить нормы</button><button class="btn secondary" type="button" data-ad="resetnorms">Стандартные</button></div>');
    /* доступ */
    h += pSec('Доступ', '', '<p class="notice" style="margin-top:0">Роль хранится на этом устройстве и переезжает вместе с бэкапом. Пароль нигде не сохраняется.</p><div class="form-actions"><button class="btn danger" type="button" data-ad="revoke">Отозвать доступ на этом устройстве</button></div>');
    h += pSec('Эксклюзивный питомец', cr ? '🐉 ДРАКОН' : '🔥 ФЕНИКС',
      '<div class="pet-preview"><div class="pet-emoji">'+(cr ? '🐉' : '🔥')+'</div><div class="pet-info"><b>'+(cr ? 'Дракон Создателя' : 'Феникс Администратора')+'</b><small>Особый питомец, доступный только этой роли. Его можно выбрать в магазине → Питомцы.</small></div></div>');
    return h + '</div>';
  }

  let panelRole = null;
  function mountPanel() {
    const top = adminEl.scrollTop;
    adminEl.innerHTML = panelHTML(panelRole);
    adminEl.scrollTop = top;
    updateWallet();
  }
  function openPanel(role) {
    if (!panelCan(role)) return;
    closeSheets(true);
    panelRole = role; mountPanel();
    adminEl.classList.add('show'); adminEl.setAttribute('aria-hidden', 'false'); adminEl.scrollTop = 0;
    document.body.classList.add('noscroll');
  }
  function closePanel() {
    panelRole = null;
    adminEl.classList.remove('show'); adminEl.setAttribute('aria-hidden', 'true'); adminEl.innerHTML = '';
    document.body.classList.remove('noscroll');
    try { renderHome(); renderWalk(); } catch {}
  }
  const pInt = id => { const el = $(id); return el ? Math.round(+el.value) : NaN; };
  const pOpt = id => { const v = $(id).value.trim(); if (v === '') return null; const n = Math.round(+v); return Number.isFinite(n) && n >= 0 ? n : NaN; };
  function giveCoins(n, cr) {
    if (!(n > 0)) { toast('Введи сумму больше нуля'); return false; }
    if (cr) {
      if (n > 1e9) { toast('Не больше 1 000 000 000 за раз'); return false; }
      addCoins(n, { raw: true });
    } else {
      if (n > ADMIN_LIM.grant) { toast('За раз — не больше ' + fmtN(ADMIN_LIM.grant) + ' ✧'); return false; }
      const left = grantLeft();
      if (n > left) { toast(left ? 'Сегодня можно выдать ещё ' + fmtN(left) + ' ✧' : 'Дневной лимит выдачи исчерпан'); return false; }
      addCoins(n, { raw: true, noEarn: true });
      const g = data.admin.grant;
      data.admin.grant = { date: todayStr(), sum: (g && g.date === todayStr() ? g.sum : 0) + n }; save();
    }
    toast('Добавлено ' + fmtN(n) + ' ✧');
    return true;
  }
  adminEl.addEventListener('click', e => {
    const b = e.target.closest('[data-ad]'); if (!b) return;
    const role = panelRole;
    if (!role || !panelCan(role)) { closePanel(); return; }
    const cr = role === 'creator', act = b.dataset.ad;
    const only = () => { if (cr) return true; toast('Недоступно для администратора'); return false; };
    switch (act) {
      case 'close': closePanel(); return;
      case 'petcreator': { if(!cr || !ROLE.creator)return; data.pets.active='dragon';data.pets.mood='awake';save();renderPets();mountPanel();toast('Дракон активирован');return; }
      case 'petadmin': { if(cr || !ROLE.admin)return; data.pets.active='phoenix';data.pets.mood='awake';save();renderPets();mountPanel();toast('Феникс активирован');return; }
      case 'coinadd': { const n = pInt('adCoinAmt'); if (giveCoins(n, cr)) { mountPanel(); } return; }
      case 'quick': { if (giveCoins(+b.dataset.q, cr)) mountPanel(); return; }
      case 'coinsub': { if (!only()) return; const n = pInt('adCoinAmt'); if (!(n > 0)) { toast('Введи сумму больше нуля'); return; } data.coins.bal = Math.max(0, data.coins.bal - n); save(); mountPanel(); toast('Списано ' + fmtN(n) + ' ✧'); return; }
      case 'coinset': { if (!only()) return; const n = pInt('adCoinAmt'); if (!(n > 0 && n <= 1e9)) { toast('Сумма — от 1 до 1 000 000 000'); return; } data.coins.bal = n; data.coins.earned = Math.max(data.coins.earned, n); save(); checkTitles(); mountPanel(); toast('Баланс: ' + fmtN(n) + ' ✧'); return; }
      case 'misc': {
        if (!only()) return;
        const m = pInt('adMult'), s = pInt('adStreak');
        if (!(m >= 1 && m <= 1000)) { toast('Множитель — от 1 до 1000'); return; }
        if (!(s >= 0 && s <= 9999)) { toast('Серия — от 0 до 9999'); return; }
        data.admin.mult = m; data.streak.count = s; data.streak.best = Math.max(data.streak.best || 0, s); data.streak.last = s > 0 ? todayStr() : null;
        save(); checkTitles(); mountPanel(); toast('Сохранено ✓'); return;
      }
      case 'equip': case 'unequip': {
        if (!only()) return;
        const it = SPECIAL.find(x => x.id === b.dataset.id); if (!it || it.role !== 'creator') return;
        if (act === 'equip') equipItem(it);
        else if (it.kind === 'theme') applyTheme('violet');
        else if (it.kind === 'snake') { data.equip.snake = 'def'; save(); }
        else { data.equip[it.kind] = null; save(); }
        syncThemeSwatches(); updateWallet(); mountPanel(); return;
      }
      case 'equipall': { if (!only()) return; SPECIAL.filter(i => i.role === 'creator').forEach(equipItem); syncThemeSwatches(); updateWallet(); mountPanel(); toast('Эксклюзив надет ✦'); return; }
      case 'alltitles': { if (!only()) return; TITLES.forEach(t => { if (!data.titles.got[t.id]) data.titles.got[t.id] = Date.now(); }); save(); updateWallet(); toast('Все звания открыты'); return; }
      case 'notitles': {
        if (!only()) return;
        if (!confirm('Закрыть все звания? Они откроются заново, когда условия выполнятся.')) return;
        data.titles.got = { rookie: 1 }; data.titles.active = 'rookie'; checkTitles(); save(); updateWallet(); toast('Звания закрыты'); return;
      }
      case 'allshop': { if (!only()) return; SHOP.filter(i => !i.inv).forEach(i => { data.owned[i.id] = true; }); save(); syncThemeSwatches(); toast('Весь магазин открыт'); return; }
      case 'resetshop': {
        if (!only()) return;
        if (!confirm('Сбросить все покупки, бонусы и выбранный облик?')) return;
        data.owned = {}; data.inv = { life: 0, undo: 0, hint: 0, slow: 0 };
        data.equip = { snake: 'def', t2048: 'def', mem: 'def', ttt: 'def', badge: null, avatar: null, frame: null };
        if (!['violet', 'ocean', 'rose', 'forest', 'sunset'].includes(data.theme)) applyTheme('violet');
        save(); syncThemeSwatches(); updateWallet(); mountPanel(); toast('Покупки сброшены'); return;
      }
      case 'prices': {
        const out = {}; let bad = false;
        adminEl.querySelectorAll('[data-pid]').forEach(i => {
          const n = Math.round(+i.value), it = PRICE_ITEMS().find(x => x.id === i.dataset.pid);
          if (i.value.trim() === '' || !(n >= 0) || n > 1000000 || (!cr && (n < ADMIN_LIM.priceMin || n > ADMIN_LIM.priceMax))) { bad = true; return; }
          if (it && n !== it.price) out[it.id] = n;
        });
        if (bad) { toast(cr ? 'Цены — целые числа от 0' : 'Цены — от ' + ADMIN_LIM.priceMin + ' до ' + fmtN(ADMIN_LIM.priceMax) + ' ✧'); return; }
        data.admin.prices = out; save(); toast('Цены сохранены ✓'); return;
      }
      case 'resetprices': data.admin.prices = {}; save(); mountPanel(); toast('Стандартные цены возвращены'); return;
      case 'time': {
        const n = pInt('adTapSec');
        if (!(n >= 5 && n <= 60)) { toast('Время кликера — от 5 до 60 секунд'); return; }
        data.admin.tapSeconds = n; save(); toast('Время сохранено ✓'); return;
      }
      case 'rec': {
        if (!only()) return;
        const v = { rea: pOpt('adRea'), tap: pOpt('adTap'), mm: pOpt('adMemM'), mt: pOpt('adMemT'), sn: pOpt('adSnake'), g: pOpt('ad2048'), w: pOpt('adTW'), d: pOpt('adTD'), l: pOpt('adTL') };
        if (Object.values(v).some(x => Number.isNaN(x))) { toast('Проверь числа: только целые, без минуса'); return; }
        if (v.rea != null && v.rea < 50) { toast('Реакция быстрее 50 мс невозможна'); return; }
        if ((v.mm == null) !== (v.mt == null)) { toast('Память: заполни и ходы, и время — или оба пустыми'); return; }
        if (v.mm != null && v.mm < 8) { toast('Память: меньше 8 ходов не бывает'); return; }
        const s = data.stats;
        s.reactionBest = v.rea; s.tapBest = v.tap || 0; s.memoryMoves = v.mm; s.memoryTime = v.mt;
        s.snakeBest = v.sn || 0; s.g2048Best = v.g || 0; s.ttt = { w: v.w || 0, d: v.d || 0, l: v.l || 0 };
        save(); checkTitles(); mountPanel(); toast('Рекорды сохранены ✓'); return;
      }
      case 'resetrec': { if (!only()) return; if (!confirm('Сбросить все рекорды и статистику игр?')) return; data.stats = defaultStats(); save(); mountPanel(); toast('Рекорды сброшены'); return; }
      case 'norms': {
        const out = {}; let bad = false;
        adminEl.querySelectorAll('#adNorms input').forEach(i => {
          const g = i.dataset.g, k = i.dataset.k, raw = i.value.trim();
          (out[g] = out[g] || {});
          if (raw === '') { if (k === 'walk') out[g][k] = null; else bad = true; return; }
          const n = Math.round(+raw);
          if (!(n > 0)) { bad = true; return; }
          out[g][k] = n;
        });
        if (bad) { toast('Заполни все нормы числами больше нуля (кроме прогулки)'); return; }
        data.admin.norms = out; save(); toast('Нормы сохранены ✓'); return;
      }
      case 'resetnorms': { if (!confirm('Вернуть стандартные нормы для всех возрастов?')) return; data.admin.norms = {}; save(); mountPanel(); toast('Стандартные нормы возвращены'); return; }
      case 'revoke': {
        if (!confirm('Отозвать доступ на этом устройстве? Чтобы вернуть, понадобится пароль.')) return;
        revokeRole(role); closePanel(); toast('Доступ отозван'); return;
      }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && adminEl.classList.contains('show')) closePanel(); });
  /* скрытые входы: админ — 5 нажатий по подписи в «Ещё»; создатель — 9 быстрых нажатий по логотипу */
  (function () {
    let taps = 0, tm = null;
    $('appFooter').addEventListener('click', () => {
      taps++; clearTimeout(tm); tm = setTimeout(() => { taps = 0; }, 2500);
      if (taps >= 5) { taps = 0; askPassword('admin'); }
    });
  })();
  (function () {
    const logo = document.querySelector('.logo'); if (!logo) return;
    let taps = 0, tm = null;
    logo.addEventListener('click', () => {
      taps++; clearTimeout(tm); tm = setTimeout(() => { taps = 0; }, 1100);
      if (taps >= 9) { taps = 0; askPassword('creator'); }
    });
  })();

  /* ----- Games ----- */
  function startGame(name) {
    exitGame();
    activeGame = name;
    $('gamesMenu').style.display = 'none';
    $('gameArea').style.display = 'block';
    const box = $('gameContent');
    box.innerHTML = '';
    if (name === 'reaction') initReaction(box);
    else if (name === 'memory') initMemory(box);
    else if (name === 'tap') initTap(box);
    else if (name === 'snake') initSnake(box);
    else if (name === 'g2048') init2048(box);
    else if (name === 'ttt') initTTT(box);
  }
  window.startGame = startGame;

  function exitGame() {
    gameCleanups.forEach(fn => { try { fn(); } catch {} });
    gameCleanups = [];
    activeGame = null;
    if (window._snakeRAF) {
      cancelAnimationFrame(window._snakeRAF);
      window._snakeRAF = null;
    }
    $('gamesMenu').style.display = 'block';
    $('gameArea').style.display = 'none';
    $('gameContent').innerHTML = '';
  }
  window.exitGame = exitGame;

  function initReaction(box) {
    let state = 'idle', startAt = 0, waitT = null;
    const best = data.stats.reactionBest;
    box.innerHTML = `
      <h2 style="margin-bottom:8px">⚡ Поймай сияние</h2>
      <p class="muted" style="margin-bottom:12px">Жди зелёный цвет — потом жми как можно быстрее</p>
      <div class="scoreline"><span>Последний <b id="lastR">—</b></span><span>Рекорд <b id="bestR">${best != null ? best + ' мс' : '—'}</b></span></div>
      <p class="norm-line" id="normLine-reaction">${normLineHTML('reaction')}</p>
      <div class="reaction-arena" id="arena"><button type="button" id="arenaBtn">Начать</button></div>
      <p class="notice" id="rStatus" style="text-align:center">Готов?</p>`;
    const arena = $('arena');
    const btn = $('arenaBtn');
    const status = $('rStatus');
    gameCleanups.push(() => clearTimeout(waitT));

    btn.onclick = () => {
      if (state === 'idle' || state === 'done' || state === 'early') {
        state = 'waiting';
        arena.className = 'reaction-arena waiting';
        btn.textContent = 'Жди…';
        status.textContent = 'Не нажимай рано';
        waitT = setTimeout(() => {
          if (state !== 'waiting') return;
          state = 'ready';
          startAt = performance.now();
          arena.className = 'reaction-arena ready';
          btn.textContent = 'ЖМИ!';
          status.textContent = 'Сейчас!';
        }, 1200 + Math.random() * 2500);
      } else if (state === 'waiting') {
        clearTimeout(waitT);
        state = 'early';
        arena.className = 'reaction-arena early';
        btn.textContent = 'Слишком рано';
        status.textContent = 'Фальстарт — попробуй ещё';
      } else if (state === 'ready') {
        const ms = Math.round(performance.now() - startAt);
        state = 'done';
        arena.className = 'reaction-arena';
        btn.textContent = 'Ещё раз';
        $('lastR').textContent = ms + ' мс';
        const nr = curNorm('reaction');
        status.textContent = nr ? (ms <= nr ? 'В пределах нормы для твоего возраста ✓' : 'Медленнее нормы на ' + (ms - nr) + ' мс — ещё раз') : (ms < 230 ? 'Молния! ⚡' : ms < 330 ? 'Хорошо' : 'Можно быстрее');
        const recHit = data.stats.reactionBest == null || ms < data.stats.reactionBest;
        if (recHit) {
          data.stats.reactionBest = ms;
          save();
          $('bestR').textContent = ms + ' мс';
          toast('Новый рекорд! ' + ms + ' мс');
          updateNormLine('reaction');
        }
        gameDone('reaction', 2, recHit, nr ? ms <= nr : false);
      }
    };
  }

  function initMemory(box) {
    const emojis = memPack() || ['🍎','🍊','🍋','🍇','🍓','🍑','🥝','🫐'];
    const cards = shuffle([...emojis, ...emojis]);
    let flipped = [], lock = false, matched = 0, moves = 0, t0 = 0, tmr = null;
    const recText = () => data.stats.memoryMoves != null ? data.stats.memoryMoves + ' ходов · ' + data.stats.memoryTime + ' с' : '—';
    box.innerHTML = `
      <h2 style="margin-bottom:8px;text-align:center">🧠 Память</h2>
      <p class="muted" style="text-align:center;margin-bottom:4px">Ходов: <b id="memMoves">0</b> · Время: <b id="memTime">0</b> с · Найдено: <b id="memFound">0</b>/8</p>
      <p class="muted" style="text-align:center;margin-bottom:4px">Рекорд: <b id="memBest">${recText()}</b></p>
      <p class="norm-line" id="normLine-memory">${normLineHTML('memory')}</p>
      <div class="memory-grid" id="memGrid"></div>
      <div class="game-bar"><button class="btn secondary small" type="button" id="memHint">💡 Подсказка (${data.inv.hint})</button><button class="btn secondary small" type="button" id="memRestart">Заново</button></div>`;
    $('memRestart').onclick = () => { clearInterval(tmr); initMemory(box); };
    $('memHint').onclick = () => {
      if (lock) return;
      if (data.inv.hint <= 0) { toast('Подсказок нет — купи в магазине'); return; }
      const free = [...grid.children].filter(c => !c.classList.contains('on') && !c.classList.contains('matched'));
      const by = {}; free.forEach(c => (by[c.dataset.emoji] = by[c.dataset.emoji] || []).push(c));
      const pairs = Object.values(by).filter(a => a.length >= 2);
      if (!pairs.length) { toast('Подсказывать нечего'); return; }
      const pr = pairs[Math.floor(Math.random() * pairs.length)].slice(0, 2);
      data.inv.hint--; save();
      $('memHint').textContent = '💡 Подсказка (' + data.inv.hint + ')';
      lock = true;
      pr.forEach(c => { c.classList.add('on'); c.textContent = c.dataset.emoji; });
      const t = setTimeout(() => { pr.forEach(c => { c.classList.remove('on'); c.textContent = '?'; }); lock = false; }, 1100);
      gameCleanups.push(() => clearTimeout(t));
    };
    gameCleanups.push(() => clearInterval(tmr));
    const grid = $('memGrid');
    const startTimer = () => {
      if (tmr) return;
      t0 = Date.now();
      tmr = setInterval(() => { const el = $('memTime'); if (el) el.textContent = Math.floor((Date.now() - t0) / 1000); }, 500);
    };
    cards.forEach((emoji) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'memory-cell';
      c.textContent = '?';
      c.dataset.emoji = emoji;
      c.onclick = () => {
        if (lock || c.classList.contains('on') || c.classList.contains('matched')) return;
        startTimer();
        c.classList.add('on');
        c.textContent = emoji;
        flipped.push(c);
        if (flipped.length === 2) {
          moves++;
          $('memMoves').textContent = moves;
          lock = true;
          const [a, b] = flipped;
          if (a.dataset.emoji === b.dataset.emoji) {
            a.classList.add('matched');
            b.classList.add('matched');
            matched++;
            $('memFound').textContent = matched;
            flipped = [];
            lock = false;
            if (matched === 8) {
              clearInterval(tmr);
              const secs = Math.max(1, Math.round((Date.now() - t0) / 1000));
              $('memTime').textContent = secs;
              const st = data.stats;
              const better = st.memoryMoves == null || moves < st.memoryMoves || (moves === st.memoryMoves && secs < (st.memoryTime == null ? Infinity : st.memoryTime));
              if (better) {
                st.memoryMoves = moves; st.memoryTime = secs; save();
                $('memBest').textContent = recText();
                toast('Новый рекорд! ' + moves + ' ходов, ' + secs + ' с 🏆');
              } else toast('Победа! ' + moves + ' ходов, ' + secs + ' с 🎉');
              updateNormLine('memory');
              const nm = curNorm('memory');
              gameDone('memory', 15, better, nm ? moves <= nm : false);
            }
          } else {
            const t = setTimeout(() => {
              a.classList.remove('on'); b.classList.remove('on');
              a.textContent = '?'; b.textContent = '?';
              flipped = []; lock = false;
            }, 650);
            gameCleanups.push(() => clearTimeout(t));
          }
        }
      };
      grid.appendChild(c);
    });
  }

  function initTap(box) {
    const dur = data.admin.tapSeconds || 10;
    let score = 0, running = false, left = dur, timer = null;
    box.innerHTML = `
      <h2 style="margin-bottom:8px;text-align:center">👆 Кликер</h2>
      <div class="scoreline"><span>Счёт <b id="tapScore">0</b></span><span>Время <b id="tapLeft">${dur}</b> с</span></div>
      <p class="muted" style="text-align:center">Рекорд: <b id="tapBest">${data.stats.tapBest}</b></p>
      <p class="norm-line" id="normLine-tap">${normLineHTML('tap')}</p>
      <button type="button" class="tap-btn" id="tapBtn">Старт</button>
      <p class="notice" style="text-align:center" id="tapStatus">Кликай ${dur} секунд</p>`;
    const btn = $('tapBtn');
    gameCleanups.push(() => clearInterval(timer));
    btn.onclick = () => {
      if (!running) {
        running = true; score = 0; left = dur;
        $('tapScore').textContent = '0';
        $('tapLeft').textContent = dur;
        btn.textContent = 'Жми!';
        $('tapStatus').textContent = 'Вперёд!';
        timer = setInterval(() => {
          left--;
          $('tapLeft').textContent = left;
          if (left <= 0) {
            clearInterval(timer);
            running = false;
            btn.textContent = 'Ещё раз';
            const nt = curNorm('tap');
            $('tapStatus').textContent = 'Результат: ' + score + (nt ? (score >= nt ? ' · в пределах нормы ✓' : ' · до нормы ещё ' + (nt - score)) : '');
            const recHit = score > data.stats.tapBest;
            if (recHit) {
              data.stats.tapBest = score;
              save();
              $('tapBest').textContent = score;
              toast('Новый рекорд! 🏆');
              updateNormLine('tap');
            }
            gameDone('tap', Math.floor(score / 4), recHit, nt ? score >= nt : false);
          }
        }, 1000);
      } else {
        score++;
        $('tapScore').textContent = score;
      }
    };
  }

  function initSnake(box) {
    box.innerHTML = `
      <h2 style="margin-bottom:8px;text-align:center">🐍 Змейка</h2>
      <p class="muted" style="text-align:center">Счёт: <b id="snScore">0</b> · Рекорд: <b id="snBest">${data.stats.snakeBest || 0}</b></p>
      <p class="norm-line" id="normLine-snake">${normLineHTML('snake')}</p>
      <canvas id="snakeCanvas"></canvas>
      <p class="notice" style="text-align:center" id="snHint">Свайпай по полю или жми кнопки · на ПК: стрелки / WASD, пробел — пауза</p>
      <div class="dpad">
        <button type="button" class="up" data-d="up" aria-label="Вверх">▲</button>
        <button type="button" class="left" data-d="left" aria-label="Влево">◀</button>
        <button type="button" class="down" data-d="down" aria-label="Вниз">▼</button>
        <button type="button" class="right" data-d="right" aria-label="Вправо">▶</button>
      </div>
      <div class="game-bar">
        <button class="btn secondary small" type="button" id="snPause">⏸ Пауза</button>
        <button class="btn secondary small" type="button" id="snRestart">Заново</button>
        <button class="btn secondary small" type="button" id="snSlow">🐢 Замедление</button>
      </div>
      <p class="norm-line" id="snInfo"></p>`;
    const canvas = $('snakeCanvas');
    const ctx = canvas.getContext('2d');
    const COLS = 16, ROWS = 16;
    const SIZE = Math.min(360, Math.max(240, Math.floor(Math.min(box.clientWidth || 320, window.innerWidth - 56))));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = SIZE * dpr; canvas.height = SIZE * dpr;
    canvas.style.width = SIZE + 'px'; canvas.style.height = SIZE + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = SIZE / COLS;
    let snake, dir, queue, food, score, alive, paused, started, last = 0, speed, slowUntil = 0;

    function placeFood() {
      let p;
      do { p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; }
      while (snake.some(s => s.x === p.x && s.y === p.y));
      return p;
    }
    function reset() {
      snake = [{ x: 8, y: 8 }];
      dir = { x: 1, y: 0 };
      queue = [];
      food = placeFood();
      score = 0; alive = true; paused = false; started = false; speed = 150;
      $('snScore').textContent = '0';
      $('snPause').textContent = '⏸ Пауза';
    }
    function rr(x, y, w, h, r) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
      ctx.fill();
    }
    function overlay(text, sub) {
      ctx.fillStyle = 'rgba(16,8,32,.72)';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '700 ' + Math.round(SIZE / 12) + 'px system-ui, sans-serif';
      ctx.fillText(text, SIZE / 2, SIZE / 2 - 4);
      ctx.font = '500 ' + Math.round(SIZE / 22) + 'px system-ui, sans-serif';
      ctx.fillStyle = '#d8cbed';
      ctx.fillText(sub, SIZE / 2, SIZE / 2 + SIZE / 11);
    }
    function draw() {
      ctx.fillStyle = '#150b2b';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = 'rgba(255,255,255,.035)';
      for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) if ((x + y) % 2 === 0) ctx.fillRect(x * S, y * S, S, S);
      ctx.fillStyle = '#f472b6';
      rr(food.x * S + 2, food.y * S + 2, S - 4, S - 4, S / 3);
      snake.forEach((s, i) => {
        ctx.fillStyle = snakeColor(i);
        rr(s.x * S + 1, s.y * S + 1, S - 2, S - 2, S / 4);
      });
      if (!alive) overlay('Игра окончена', 'Счёт ' + score + ' · нажми «Заново»');
      else if (!started) overlay('Готов?', 'Свайп или кнопка — старт');
      else if (paused) overlay('Пауза', 'Нажми «Пауза», чтобы продолжить');
    }
    function saveLife() {
      if (data.inv.life <= 0) return false;
      const body = snake.slice(0, -1);
      const opts = [{ x: -dir.y, y: dir.x }, { x: dir.y, y: -dir.x }];
      for (const d of opts) {
        const nx = snake[0].x + d.x, ny = snake[0].y + d.y;
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && !body.some(s => s.x === nx && s.y === ny)) {
          dir = d; queue = []; data.inv.life--; save(); boostInfo();
          toast('❤️ Вторая жизнь спасла тебя!');
          return true;
        }
      }
      return false;
    }
    function boostInfo() {
      const a = $('snSlow'), b = $('snInfo');
      if (a) a.textContent = '🐢 Замедление (' + data.inv.slow + ')';
      if (b) b.textContent = '❤️ Вторых жизней: ' + data.inv.life + ' · бонусы продаются в магазине';
    }
    function step() {
      if (queue.length) dir = queue.shift();
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      const willEat = head.x === food.x && head.y === food.y;
      const body = willEat ? snake : snake.slice(0, -1);
      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS || body.some(s => s.x === head.x && s.y === head.y)) {
        if (saveLife()) return;
        alive = false;
        try { navigator.vibrate && navigator.vibrate(120); } catch {}
        let recHitSn = false;
        if (score > (data.stats.snakeBest || 0)) {
          data.stats.snakeBest = score; save();
          $('snBest').textContent = score;
          toast('Рекорд змейки! 🐍');
          updateNormLine('snake');
          recHitSn = true;
        } else toast('Игра окончена · ' + score);
        const ns = curNorm('snake');
        gameDone('snake', score, recHitSn, ns ? score >= ns : false);
        draw();
        return;
      }
      snake.unshift(head);
      if (willEat) {
        score++;
        $('snScore').textContent = score;
        speed = Math.max(70, 150 - score * 3);
        try { navigator.vibrate && navigator.vibrate(15); } catch {}
        food = placeFood();
      } else snake.pop();
    }
    function loop(ts) {
      if (activeGame !== 'snake') return;
      window._snakeRAF = requestAnimationFrame(loop);
      if (!alive || paused || !started) return;
      if (ts - last < speed * (Date.now() < slowUntil ? 1.7 : 1)) return;
      last = ts;
      step();
      if (alive) draw();
    }
    function turn(dx, dy) {
      if (!alive) return;
      const ref = queue.length ? queue[queue.length - 1] : dir;
      if (ref.x === -dx && ref.y === -dy) return;
      if (ref.x === dx && ref.y === dy) { if (!started) { started = true; draw(); } return; }
      if (queue.length < 3) queue.push({ x: dx, y: dy });
      if (!started) { started = true; paused = false; last = 0; draw(); }
    }
    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    box.querySelectorAll('.dpad button').forEach(b => {
      const go = e => { e.preventDefault(); const d = DIRS[b.dataset.d]; turn(d[0], d[1]); };
      b.addEventListener('touchstart', go, { passive: false });
      b.addEventListener('mousedown', go);
    });
    /* swipe */
    let tx = 0, ty = 0, tracking = false;
    canvas.addEventListener('touchstart', e => {
      const t = e.changedTouches[0]; tx = t.clientX; ty = t.clientY; tracking = true; e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!tracking) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - tx, dy = t.clientY - ty;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0); else turn(0, dy > 0 ? 1 : -1);
      tx = t.clientX; ty = t.clientY;
    }, { passive: false });
    canvas.addEventListener('touchend', () => { tracking = false; });
    /* keyboard */
    function onKey(e) {
      if (activeGame !== 'snake') return;
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') { turn(0, -1); e.preventDefault(); }
      else if (k === 'arrowdown' || k === 's') { turn(0, 1); e.preventDefault(); }
      else if (k === 'arrowleft' || k === 'a') { turn(-1, 0); e.preventDefault(); }
      else if (k === 'arrowright' || k === 'd') { turn(1, 0); e.preventDefault(); }
      else if (k === ' ') { togglePause(); e.preventDefault(); }
    }
    function togglePause() {
      if (!alive || !started) return;
      paused = !paused;
      $('snPause').textContent = paused ? '▶ Продолжить' : '⏸ Пауза';
      draw();
    }
    document.addEventListener('keydown', onKey);
    gameCleanups.push(() => document.removeEventListener('keydown', onKey));
    /* auto-pause when app goes to background */
    const onHide = () => { if (document.hidden && alive && started && !paused) togglePause(); };
    document.addEventListener('visibilitychange', onHide);
    gameCleanups.push(() => document.removeEventListener('visibilitychange', onHide));
    $('snPause').onclick = togglePause;
    $('snSlow').onclick = () => {
      if (!alive || !started) { toast('Сначала начни игру'); return; }
      if (Date.now() < slowUntil) { toast('Замедление уже действует'); return; }
      if (data.inv.slow <= 0) { toast('Замедлений нет — купи в магазине'); return; }
      data.inv.slow--; save(); slowUntil = Date.now() + 10000; boostInfo(); toast('🐢 Замедление на 10 секунд');
    };
    boostInfo();
    $('snRestart').onclick = () => { reset(); draw(); last = 0; };
    reset(); draw();
    window._snakeRAF = requestAnimationFrame(loop);
  }

  /* ----- 2048 ----- */
  function init2048(box) {
    const N = 4;
    const COLORS = { 0: ['rgba(255,255,255,.06)', '#fff'], 2: ['#e9dcff', '#3b1f6b'], 4: ['#d9c2ff', '#3b1f6b'], 8: ['#c29bff', '#fff'], 16: ['#a978ff', '#fff'], 32: ['#f08ad6', '#fff'], 64: ['#ec5fa8', '#fff'], 128: ['#fbbf24', '#3b2a00'], 256: ['#f59e0b', '#fff'], 512: ['#34d399', '#053b2a'], 1024: ['#22d3ee', '#04323b'], 2048: ['#fff27a', '#3b3300'] };
    let grid, score, over, won, prev = null, paid = 0, counted = false, recPaid = false, normPaid = false;
    function tileStyle(v) {
      const sk = data.equip.t2048;
      if (!v) return COLORS[0];
      if (sk === 'pastel') return ['hsl(' + ((Math.log2(v) * 37) % 360) + ' 70% 82%)', '#3a2a5a'];
      if (sk === 'neon') return ['#0d0724', 'hsl(' + ((Math.log2(v) * 37 + 200) % 360) + ' 100% 68%)'];
      return COLORS[v] || ['#fff', '#000'];
    }
    function finish48() {
      if (counted || !(score > 0)) return;
      counted = true; data.cnt.games.g2048 = (data.cnt.games.g2048 || 0) + 1; data.cnt.total++; save(); checkTitles();
    }
    let best = data.stats.g2048Best || 0;
    box.innerHTML = `
      <h2 style="margin-bottom:8px;text-align:center">🔢 2048</h2>
      <p class="muted" style="text-align:center">Счёт: <b id="gScore">0</b> · Рекорд: <b id="gBest">${best}</b></p>
      <p class="norm-line" id="normLine-g2048">${normLineHTML('g2048')}</p>
      <div class="g2048" id="g2048"></div>
      <p class="notice" style="text-align:center">Свайпай по полю · на ПК: стрелки / WASD</p>
      <div class="game-bar"><button class="btn secondary small" type="button" id="gUndo">↩ Отмена (${data.inv.undo})</button><button class="btn secondary small" type="button" id="gRestart">Заново</button></div>`;
    const board = $('g2048');
    function empty() { const e = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) e.push([r, c]); return e; }
    let newest = null;
    function spawn() {
      const e = empty(); if (!e.length) return;
      const [r, c] = e[Math.floor(Math.random() * e.length)];
      grid[r][c] = Math.random() < 0.9 ? 2 : 4; newest = r + ',' + c;
    }
    function render() {
      board.innerHTML = '';
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const v = grid[r][c];
        const t = document.createElement('div');
        t.className = 't2048' + (newest === r + ',' + c ? ' pop' : '');
        const col = tileStyle(v);
        t.style.background = col[0]; t.style.color = col[1];
        if (v && data.equip.t2048 === 'neon') t.style.boxShadow = 'inset 0 0 0 2px ' + col[1] + ', 0 0 10px ' + col[1] + '66';
        if (v >= 1024) t.style.fontSize = 'clamp(13px,5vw,21px)';
        t.textContent = v || '';
        board.appendChild(t);
      }
      $('gScore').textContent = score;
      const dc = Math.floor(score / 100) - paid;
      if (dc > 0) { paid += dc; addCoins(dc, { pop: '2048' }); }
      const n48 = curNorm('g2048');
      if (n48 && !normPaid && score >= n48) { normPaid = true; addCoins(10, { pop: 'в норме' }); }
      if (score > best) {
        if (best > 0 && !recPaid) { recPaid = true; addCoins(20, { pop: 'рекорд!' }); }
        best = score; data.stats.g2048Best = best; save(); $('gBest').textContent = best; updateNormLine('g2048');
      }
    }
    function slideLine(line) {
      const a = line.filter(Boolean); const out = []; let gain = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] === a[i + 1]) { out.push(a[i] * 2); gain += a[i] * 2; i++; } else out.push(a[i]);
      }
      while (out.length < N) out.push(0);
      return [out, gain];
    }
    function move(dir) { /* 0 left, 1 up, 2 right, 3 down */
      if (over) return;
      let moved = false, gain = 0;
      const ng = grid.map(r => r.slice());
      for (let i = 0; i < N; i++) {
        let line = [];
        for (let j = 0; j < N; j++) {
          const [r, c] = dir === 0 ? [i, j] : dir === 2 ? [i, N - 1 - j] : dir === 1 ? [j, i] : [N - 1 - j, i];
          line.push(grid[r][c]);
        }
        const [res, g] = slideLine(line); gain += g;
        for (let j = 0; j < N; j++) {
          const [r, c] = dir === 0 ? [i, j] : dir === 2 ? [i, N - 1 - j] : dir === 1 ? [j, i] : [N - 1 - j, i];
          if (ng[r][c] !== res[j]) moved = true;
          ng[r][c] = res[j];
        }
      }
      if (!moved) return;
      prev = { grid: grid, score: score };
      grid = ng; score += gain; spawn(); render();
      try { navigator.vibrate && navigator.vibrate(8); } catch {}
      if (!won && grid.some(r => r.includes(2048))) { won = true; data.cnt.won2048++; save(); checkTitles(); toast('2048! Ты победил 🎉 Можно играть дальше'); }
      if (!canMove()) { over = true; finish48(); toast('Ходов нет · счёт ' + score); }
    }
    function canMove() {
      if (empty().length) return true;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (c + 1 < N && grid[r][c] === grid[r][c + 1]) return true;
        if (r + 1 < N && grid[r][c] === grid[r + 1][c]) return true;
      }
      return false;
    }
    function reset() {
      grid = Array.from({ length: N }, () => Array(N).fill(0));
      finish48();
      score = 0; over = false; won = false; paid = 0; counted = false; recPaid = false; normPaid = false; prev = null; spawn(); spawn(); render();
    }
    let sx = 0, sy = 0;
    board.addEventListener('touchstart', e => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; e.preventDefault(); }, { passive: false });
    board.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    board.addEventListener('touchend', e => {
      const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 2 : 0); else move(dy > 0 ? 3 : 1);
      e.preventDefault();
    }, { passive: false });
    function onKey(e) {
      if (activeGame !== 'g2048') return;
      const k = e.key.toLowerCase();
      const m = { arrowleft: 0, a: 0, arrowup: 1, w: 1, arrowright: 2, d: 2, arrowdown: 3, s: 3 }[k];
      if (m !== undefined) { move(m); e.preventDefault(); }
    }
    document.addEventListener('keydown', onKey);
    gameCleanups.push(() => document.removeEventListener('keydown', onKey));
    $('gRestart').onclick = reset;
    $('gUndo').onclick = () => {
      if (!prev) { toast('Нечего отменять'); return; }
      if (data.inv.undo <= 0) { toast('Отмен нет — купи в магазине'); return; }
      grid = prev.grid; score = prev.score; prev = null; over = false; newest = null;
      data.inv.undo--; save(); $('gUndo').textContent = '↩ Отмена (' + data.inv.undo + ')'; render();
    };
    gameCleanups.push(finish48);
    reset();
  }

  /* ----- Крестики-нолики ----- */
  function initTTT(box) {
    const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    let b, over, level = 'hard';
    const stats = data.stats.ttt;
    const SYM = tttSym();
    box.innerHTML = `
      <h2 style="margin-bottom:8px;text-align:center">❌ Крестики-нолики</h2>
      <div class="scoreline"><span>Победы <b id="tW">${stats.w}</b></span><span>Ничьи <b id="tD">${stats.d}</b></span><span>Поражения <b id="tL">${stats.l}</b></span></div>
      <div class="game-bar" style="margin:0 0 6px">
        <button class="btn secondary small" type="button" data-lv="easy">Лёгкий</button>
        <button class="btn small" type="button" data-lv="hard">Умный</button>
      </div>
      <div class="ttt" id="ttt"></div>
      <p class="notice" style="text-align:center" id="tStatus">Твой ход — ты играешь ${SYM[0]}</p>
      <div class="game-bar"><button class="btn secondary small" type="button" id="tRestart">Новая партия</button></div>`;
    const grid = $('ttt');
    const winner = (bd) => { for (const l of LINES) if (bd[l[0]] && bd[l[0]] === bd[l[1]] && bd[l[0]] === bd[l[2]]) return { p: bd[l[0]], l }; return null; };
    function minimax(bd, turn) {
      const w = winner(bd);
      if (w) return w.p === 'O' ? 10 : -10;
      if (bd.every(Boolean)) return 0;
      let best = turn === 'O' ? -99 : 99;
      for (let i = 0; i < 9; i++) if (!bd[i]) {
        bd[i] = turn;
        const v = minimax(bd, turn === 'O' ? 'X' : 'O');
        bd[i] = null;
        best = turn === 'O' ? Math.max(best, v) : Math.min(best, v);
      }
      return best;
    }
    function botMove() {
      const free = [];
      for (let i = 0; i < 9; i++) if (!b[i]) free.push(i);
      if (level === 'easy' && Math.random() < 0.7) return free[Math.floor(Math.random() * free.length)];
      let bestV = -99, bestI = [];
      for (const i of free) {
        b[i] = 'O'; const v = minimax(b, 'X'); b[i] = null;
        if (v > bestV) { bestV = v; bestI = [i]; } else if (v === bestV) bestI.push(i);
      }
      return bestI[Math.floor(Math.random() * bestI.length)];
    }
    function saveStats() { save(); $('tW').textContent = stats.w; $('tD').textContent = stats.d; $('tL').textContent = stats.l; }
    function render() {
      grid.innerHTML = '';
      const w = winner(b);
      b.forEach((v, i) => {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = (v === 'X' ? 'x' : v === 'O' ? 'o' : '') + (w && w.l.includes(i) ? ' win' : '');
        c.textContent = v === 'X' ? SYM[0] : v === 'O' ? SYM[1] : '';
        c.onclick = () => play(i);
        grid.appendChild(c);
      });
    }
    function finish() {
      const w = winner(b);
      if (w) { over = true; if (w.p === 'X') { stats.w++; $('tStatus').textContent = 'Ты победил! 🎉'; } else { stats.l++; $('tStatus').textContent = 'Бот победил 🤖'; } saveStats(); gameDone('ttt', w.p === 'X' ? 8 : 1, false, false); return true; }
      if (b.every(Boolean)) { over = true; stats.d++; $('tStatus').textContent = 'Ничья'; saveStats(); gameDone('ttt', 3, false, false); return true; }
      return false;
    }
    function play(i) {
      if (over || b[i]) return;
      b[i] = 'X'; render();
      if (finish()) { render(); return; }
      $('tStatus').textContent = 'Бот думает…';
      const t = setTimeout(() => {
        const m = botMove(); if (m !== undefined) b[m] = 'O';
        render();
        if (!finish()) $('tStatus').textContent = 'Твой ход — ты играешь ' + SYM[0];
      }, 350);
      gameCleanups.push(() => clearTimeout(t));
    }
    function reset() { b = Array(9).fill(null); over = false; $('tStatus').textContent = 'Твой ход — ты играешь ' + SYM[0]; render(); }
    box.querySelectorAll('[data-lv]').forEach(btn => {
      btn.onclick = () => {
        level = btn.dataset.lv;
        box.querySelectorAll('[data-lv]').forEach(x => x.className = 'btn small' + (x === btn ? '' : ' secondary'));
        reset();
      };
    });
    $('tRestart').onclick = reset;
    reset();
  }


  /* ================= Профиль, план и прогулки ================= */
  const ACT = [1.2, 1.375, 1.55, 1.725, 1.9];
  const GOAL_NAME = { lose: 'Похудеть', keep: 'Остаться в весе', gain: 'Набрать массу' };
  function prof() { return data.profile || (data.profile = { name: '', done: false }); }

  /* ИМТ: классификация ВОЗ; калории: формула Миффлина—Сан Жеора;
     активность: рекомендации ВОЗ 2020 (взрослые 150–300 мин/нед, подростки 60 мин/день) */
  function calcPlan(pr) {
    const h = +pr.height, w = +pr.weight, a = +pr.age;
    if (!(h >= 100 && w >= 25 && a >= 10)) return null;
    // Adult BMI cut-offs and Mifflin–St Jeor are not appropriate for minors.
    // Do not generate weight, calorie or macro targets for users under 18.
    if (a < 18) return null;
    const hm = h / 100, bmi = w / (hm * hm);
    const lo = 18.5 * hm * hm, hi = 24.9 * hm * hm;
    let cat, tone, suggest;
    if (bmi < 16) { cat = 'Выраженный дефицит массы'; tone = 'blue'; suggest = 'gain'; }
    else if (bmi < 18.5) { cat = 'Недостаточный вес'; tone = 'blue'; suggest = 'gain'; }
    else if (bmi < 25) { cat = 'Норма'; tone = 'green'; suggest = 'keep'; }
    else if (bmi < 30) { cat = 'Избыточный вес'; tone = 'amber'; suggest = 'lose'; }
    else if (bmi < 35) { cat = 'Ожирение I степени'; tone = 'red'; suggest = 'lose'; }
    else if (bmi < 40) { cat = 'Ожирение II степени'; tone = 'red'; suggest = 'lose'; }
    else { cat = 'Ожирение III степени'; tone = 'red'; suggest = 'lose'; }
    const goal = pr.goal || 'keep';
    const bmr = 10 * w + 6.25 * h - 5 * a + (pr.sex === 'f' ? -161 : 5);
    const tdee = bmr * (ACT[pr.activity] || ACT[1]);
    let kcal = tdee;
    if (goal === 'lose') kcal = Math.max(tdee * 0.85, pr.sex === 'f' ? 1200 : 1500);
    if (goal === 'gain') kcal = tdee * 1.12;
    kcal = Math.round(kcal / 10) * 10;
    const ref = bmi >= 30 ? 25 * hm * hm : w;
    const prot = Math.round(ref * (goal === 'keep' ? 1.5 : 1.8));
    const fat = Math.max(Math.round(ref * 0.9), Math.round(kcal * 0.2 / 9));
    const carb = Math.max(50, Math.round((kcal - prot * 4 - fat * 9) / 4));
    let walkMin = goal === 'lose' ? 45 : 30;
    if (a < 18) walkMin = 60;
    else if (a >= 65) walkMin = 30;
    const gW = ageGroup(a), ow = gW ? +getNorms(gW.id).walk : 0;
    if (ow > 0) walkMin = Math.round(ow);   /* норма, заданная в админ-панели */
    const walkKm = Math.round(walkMin * 5 / 60 * 10) / 10;
    let diff = 0;
    if (w < lo) diff = lo - w; else if (w > hi) diff = hi - w;
    const advice = [];
    if (a < 18) advice.push('Тебе меньше 18: для подростков ИМТ оценивают по специальным таблицам, поэтому категория ориентировочная. Цели по весу лучше обсудить с врачом. Норма активности для подростков — в среднем 60 минут в день.');
    if (goal === 'lose' && bmi < 18.5) advice.push('Сейчас вес ниже нормы, поэтому худеть не рекомендуется. Подойдёт «Остаться в весе» или «Набрать массу».');
    if (goal === 'gain' && bmi >= 25) advice.push('При избыточном весе набор массы не рекомендуется. Подойдёт «Похудеть» или «Остаться в весе».');
    if (goal === 'keep' && bmi < 18.5) advice.push('Вес ниже нормы: по ИМТ тебе больше подходит цель «Набрать массу».');
    if (goal === 'keep' && bmi >= 25) advice.push('Вес выше нормы: по ИМТ тебе больше подходит цель «Похудеть».');
    if (bmi >= 30 || bmi < 16) advice.push('При таком значении ИМТ стоит обсудить план питания и нагрузок с врачом.');
    if (bmi >= 30 && goal === 'lose') advice.push('Начинай с коротких прогулок и увеличивай время постепенно.');
    if (!advice.length) advice.push('Цель соответствует твоему ИМТ. Так держать!');
    return { bmi, cat, tone, suggest, lo, hi, diff, bmr, tdee, kcal, prot, fat, carb, walkMin, walkKm, advice, ok: advice.length === 1 && advice[0].startsWith('Цель') };
  }
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1);

  function planHTML(pl, pr) {
    const diffTxt = Math.abs(pl.diff) < 0.05 ? 'Твой вес в пределах нормы ✓' : (pl.diff > 0 ? 'До нормы не хватает ≈ ' + f1(pl.diff) + ' кг' : 'До нормы лишних ≈ ' + f1(-pl.diff) + ' кг');
    const delta = (pl.kcal - pl.tdee) * 7 / 7700;
    const dTxt = Math.abs(delta) < 0.05 ? '' : ' · ≈ ' + (delta > 0 ? '+' : '−') + f1(Math.abs(delta)) + ' кг в неделю';
    return `
      <div class="plan-grid">
        <div class="tile"><small>Индекс массы тела</small><b>${f1(pl.bmi)}</b><span class="badge b-${pl.tone}">${pl.cat}</span></div>
        <div class="tile"><small>Нормальный вес для твоего роста</small><b>${f1(pl.lo)}–${f1(pl.hi)} кг</b><small style="margin-top:6px">${diffTxt}</small></div>
        <div class="tile"><small>Суточная норма · ${GOAL_NAME[pr.goal || 'keep']}</small><b>${pl.kcal} ккал</b><small style="margin-top:6px">Б ${pl.prot} · Ж ${pl.fat} · У ${pl.carb} г${dTxt}</small></div>
        <div class="tile"><small>Гулять минимум, в день</small><b>${pl.walkMin} мин</b><small style="margin-top:6px">≈ ${pl.walkKm} км · ${pl.walkMin * 7} мин в неделю</small></div>
      </div>
      <div class="advice">${pl.advice.map(t => '<div class="' + (pl.ok ? 'ok' : '') + '">' + esc(t) + '</div>').join('')}</div>
      <div class="form-actions"><button class="btn" type="button" id="applyGoals">Применить к рациону</button></div>
      <p class="notice">Расчёты: ИМТ и категории — классификация ВОЗ; калории — формула Миффлина—Сан Жеора; активность — рекомендации ВОЗ (взрослым 150–300 мин умеренной активности в неделю, подросткам 60 мин в день). Это ориентир, а не медицинская рекомендация.</p>`;
  }
  function renderPlan() {
    const box = $('planBox'); if (!box) return;
    const pr = prof(); const pl = pr.done ? calcPlan(pr) : null;
    if (!pl) {
      const minor = pr.done && +pr.age >= 10 && +pr.age < 18;
      box.innerHTML = minor
        ? '<div class="notice">Для пользователей младше 18 лет Luma не рассчитывает взрослые нормы калорий, БЖУ или целевую массу тела. Возраст, рост и масса не используются для оценки тела. Для индивидуальных рекомендаций по питанию лучше обратиться к педиатру или квалифицированному диетологу. Здесь можно продолжать вести дневник питания без заданной нормы.</div>'
        : '<div class="empty"><div class="orb"></div>Заполни параметры, чтобы увидеть доступные рекомендации по активности</div><div class="form-actions"><button class="btn" type="button" onclick="openOnboard(false)">Заполнить параметры</button></div>';
      return;
    }
    box.innerHTML = planHTML(pl, pr);
    $('applyGoals').onclick = () => applyPlanToGoals(pl);
  }
  function applyPlanToGoals(pl) {
    data.goals = { cal: pl.kcal, prot: pl.prot, fat: pl.fat, carb: pl.carb };
    save(); renderNutrition(); toast('Цели рациона обновлены ✓');
  }

  /* ----- Знакомство и профиль Новы ----- */
  let obGoal = 'keep', obEdit = false;
  function obRead() {
    return {
      name: $('obName').value.trim(), sex: $('obSex').value,
      age: +$('obAge').value, height: +$('obHeight').value, weight: +$('obWeight').value,
      activity: +$('obAct').value,
      nova: {
        setup: true, activity: $('obNovaActivity').value,
        sports: $('obNovaSports').value.trim(), days: $('obNovaDays').value.trim(),
        trainingTime: $('obNovaTime').value.trim(), schoolStart: $('obNovaSchoolStart').value,
        schoolEnd: $('obNovaSchoolEnd').value, wake: $('obNovaWake').value || '07:00',
        sleep: $('obNovaSleep').value || '22:00', focus: $('obNovaFocus').value.trim()
      }
    };
  }
  function obPreview() {
    const box = $('obPreview');
    if (box) box.textContent = 'Нова использует расписание, занятия и твои задачи, чтобы предложить удобный план дня. Она не назначает целевой вес и не оценивает тело.';
  }
  function setGoalUI(g) { obGoal = 'keep'; }
  function openOnboard(edit) {
    obEdit = !!edit;
    const pr = prof(), np = pr.nova || {};
    $('obTitle').textContent = obEdit ? 'Мои параметры' : 'Давай знакомиться';
    $('obSkip').textContent = obEdit ? 'Отмена' : 'Позже';
    $('obName').value = pr.name || '';
    $('obSex').value = pr.sex || 'm';
    $('obAge').value = pr.age || ''; $('obHeight').value = pr.height || ''; $('obWeight').value = pr.weight || '';
    $('obAct').value = String(pr.activity != null ? pr.activity : 1);
    $('obNovaActivity').value = np.activity || 'moderate';
    $('obNovaSports').value = np.sports || ''; $('obNovaDays').value = np.days || '';
    $('obNovaTime').value = np.trainingTime || ''; $('obNovaSchoolStart').value = np.schoolStart || ''; $('obNovaSchoolEnd').value = np.schoolEnd || ''; $('obNovaWake').value = np.wake || '07:00';
    $('obNovaSleep').value = np.sleep || '22:00'; $('obNovaFocus').value = np.focus || '';
    obPreview();
    const el = $('onboard'); el.classList.add('show'); el.setAttribute('aria-hidden', 'false'); el.scrollTop = 0;
    document.body.classList.add('noscroll');
  }
  function closeOnboard() {
    const el = $('onboard'); el.classList.remove('show'); el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('noscroll');
  }
  window.openOnboard = openOnboard;
  ['obName', 'obSex', 'obAge', 'obHeight', 'obWeight', 'obAct', 'obNovaActivity', 'obNovaSports', 'obNovaDays', 'obNovaTime', 'obNovaSchoolStart', 'obNovaSchoolEnd', 'obNovaWake', 'obNovaSleep', 'obNovaFocus'].forEach(id => {
    const el = $(id); if (el) { el.addEventListener('input', obPreview); el.addEventListener('change', obPreview); }
  });
  $('obSkip').onclick = () => { try { sessionStorage.setItem('luma-ob-skip', '1'); } catch {} closeOnboard(); renderHome(); };
  $('obSave').onclick = () => {
    const v = obRead();
    if (!(v.age >= 10 && v.age <= 100)) { toast('Укажи возраст от 10 до 100'); $('obAge').focus(); return; }
    if (v.height && !(v.height >= 100 && v.height <= 230)) { toast('Проверь рост'); $('obHeight').focus(); return; }
    if (v.weight && !(v.weight >= 25 && v.weight <= 300)) { toast('Проверь массу'); $('obWeight').focus(); return; }
    const old = prof();
    data.profile = Object.assign({}, old, v, { done: true, nova: Object.assign({}, old.nova || {}, v.nova) });
    if (!v.name) data.profile.name = old.name || '';
    $('profileName').value = data.profile.name || '';
    save();
    closeOnboard();
    renderNovaProfile(); renderNovaPlan(); renderHome();
    toast('Профиль сохранён');
  };

  /* ----- Геолокация ----- */
  const geoOK = () => !!(navigator.geolocation);
  const secureOK = () => window.isSecureContext !== false;
  let geoState = 'unknown';
  function geoErrText(e) {
    if (!secureOK()) return 'Геолокация работает только на страницах с HTTPS. Сейчас страница открыта не по HTTPS (например, как файл) — размести сайт на бесплатном хостинге (Netlify, GitHub Pages).';
    if (!e) return '';
    if (e.code === 1) return 'Доступ к геолокации запрещён. Разреши его: Safari на iPhone — Настройки → Конфиденциальность → Службы геолокации → Safari; Chrome на Android — значок замка рядом с адресом → Разрешения → Геолокация.';
    if (e.code === 2) return 'Не удалось определить местоположение. Выйди на открытое место и проверь, что GPS включён.';
    if (e.code === 3) return 'Время ожидания GPS истекло. Попробуй ещё раз на открытом месте.';
    return 'Ошибка геолокации.';
  }
  function renderGeo() {
    const pill = $('geoPill'), msg = $('geoMsg'), ask = $('geoAsk'); if (!pill) return;
    pill.className = 'geo-pill';
    if (!geoOK()) { pill.textContent = 'Нет GPS'; pill.classList.add('bad'); msg.textContent = 'Этот браузер не поддерживает геолокацию.'; ask.style.display = 'none'; return; }
    if (!secureOK()) { pill.textContent = 'Нужен HTTPS'; pill.classList.add('bad'); msg.textContent = geoErrText(); ask.style.display = 'none'; return; }
    ask.style.display = '';
    if (geoState === 'granted') { pill.textContent = '✓ Разрешено'; pill.classList.add('ok'); msg.textContent = 'Геолокация разрешена. Можно начинать прогулку.'; ask.style.display = 'none'; }
    else if (geoState === 'denied') { pill.textContent = '✕ Запрещено'; pill.classList.add('bad'); msg.textContent = geoErrText({ code: 1 }); }
    else { pill.textContent = 'Не разрешено'; msg.textContent = 'Чтобы считать путь, Luma нужен доступ к геолокации. Нажми кнопку и подтверди в окне браузера.'; }
  }
  function askGeo(silent) {
    if (!geoOK() || !secureOK()) { if (!silent) toast(!secureOK() ? 'Нужна страница с HTTPS' : 'Геолокация недоступна'); renderGeo(); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      geoState = 'granted'; renderGeo();
      if (!silent) toast('Геолокация разрешена ✓ (точность ≈ ' + Math.round(pos.coords.accuracy) + ' м)');
    }, err => {
      if (err.code === 1) geoState = 'denied';
      renderGeo(); $('geoMsg').textContent = geoErrText(err);
      if (!silent) toast('Не удалось получить доступ');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  $('geoAsk').onclick = () => askGeo(false);
  try {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(st => {
        geoState = st.state; renderGeo();
        st.onchange = () => { geoState = st.state; renderGeo(); };
      }).catch(() => {});
    }
  } catch {}

  /* ----- Трекер прогулки ----- */
  const W = { running: false, paused: false, startTs: 0, activeMs: 0, segStart: 0, dist: 0, points: [], last: null, watch: null, acc: null, lastSave: 0 };
  const WKEY = 'luma-walk-active';
  let wake = null, hiddenAt = 0;
  const rad = x => x * Math.PI / 180;
  function haversine(a, b) {
    const R = 6371000, dLa = rad(b.la - a.la), dLo = rad(b.lo - a.lo);
    const q = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.la)) * Math.cos(rad(b.la)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
  }
  const thin = (arr, max) => { if (arr.length <= max) return arr.map(p => ({ la: p.la, lo: p.lo })); const st = arr.length / max, out = []; for (let i = 0; i < max; i++) { const p = arr[Math.floor(i * st)]; out.push({ la: p.la, lo: p.lo }); } const l = arr[arr.length - 1]; out.push({ la: l.la, lo: l.lo }); return out; };
  const elapsed = () => W.activeMs + (W.running && !W.paused ? Date.now() - W.segStart : 0);
  const fmtTime = ms => { const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60; return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(sec); };
  const stepLen = () => ((+prof().height || 170) * 0.415) / 100;
  function kcalFor(distM, ms) {
    if (ms < 1000) return 0;
    const kmh = (distM / 1000) / (ms / 3600000);
    const met = kmh < 3.2 ? 2.5 : kmh < 4.8 ? 3.3 : kmh < 5.6 ? 3.8 : kmh < 6.5 ? 4.8 : kmh < 8 ? 7 : 9;
    return Math.round(met * (+prof().weight || 70) * ms / 3600000);
  }
  function persistWalk(force) {
    const now = Date.now();
    if (!force && now - W.lastSave < 8000) return;
    W.lastSave = now;
    try {
      localStorage.setItem(WKEY, JSON.stringify({ startTs: W.startTs, activeMs: W.activeMs, segStart: W.segStart, running: W.running && !W.paused, dist: W.dist, pts: thin(W.points, 400), seen: now }));
    } catch {}
  }
  function clearPersisted() { try { localStorage.removeItem(WKEY); } catch {} }
  async function lockScreen() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch {} }
  function unlockScreen() { try { wake && wake.release(); } catch {} wake = null; }

  function onFix(pos) {
    const c = pos.coords, acc = c.accuracy || 999, t = pos.timestamp || Date.now();
    W.acc = acc; updateAcc();
    if (!W.running || W.paused) return;
    if (geoState !== 'granted') { geoState = 'granted'; renderGeo(); }
    if (acc > 40) return;
    const p = { la: c.latitude, lo: c.longitude, t: t, a: acc };
    if (!W.last) { W.last = p; W.points.push(p); persistWalk(); updateWalkUI(); drawRoute(W.points); return; }
    const d = haversine(W.last, p), dt = (t - W.last.t) / 1000;
    if (dt <= 0) return;
    if (d < Math.max(5, acc * 0.6)) return;   /* шум GPS на месте */
    if (d / dt > 8.5) return;                   /* скачок GPS */
    W.dist += d; W.last = p; W.points.push(p);
    persistWalk(); updateWalkUI(); drawRoute(W.points);
  }
  function onGeoErr(err) {
    if (err.code === 1) { geoState = 'denied'; renderGeo(); toast('Нет доступа к геолокации'); $('geoMsg').textContent = geoErrText(err); stopWatch(); if (W.running && !W.paused) pauseWalk(); }
    else { W.acc = null; $('wAcc').textContent = err.code === 3 ? 'GPS долго не отвечает…' : 'Сигнал GPS потерян, ищу…'; }
  }
  function startWatch() {
    stopWatch();
    W.last = null;
    W.watch = navigator.geolocation.watchPosition(onFix, onGeoErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }
  function stopWatch() { if (W.watch != null) { try { navigator.geolocation.clearWatch(W.watch); } catch {} W.watch = null; } }

  function startWalk() {
    if (!geoOK()) { toast('Геолокация не поддерживается'); return; }
    if (!secureOK()) { toast('Нужна страница с HTTPS'); renderGeo(); return; }
    Object.assign(W, { running: true, paused: false, startTs: Date.now(), activeMs: 0, segStart: Date.now(), dist: 0, points: [], last: null, acc: null });
    startWatch(); lockScreen(); persistWalk(true); updateWalkUI(); drawRoute([]);
    toast('Прогулка началась 🚶');
  }
  function pauseWalk() {
    if (!W.running) return;
    if (!W.paused) { W.activeMs += Date.now() - W.segStart; W.paused = true; stopWatch(); unlockScreen(); persistWalk(true); }
    else { W.paused = false; W.segStart = Date.now(); startWatch(); lockScreen(); persistWalk(true); }
    updateWalkUI();
  }
  function stopWalk() {
    if (!W.running) return;
    if (!W.paused) W.activeMs += Date.now() - W.segStart;
    stopWatch(); unlockScreen();
    const ms = W.activeMs, dist = W.dist, pts = thin(W.points, 200);
    Object.assign(W, { running: false, paused: false });
    clearPersisted();
    if (ms < 30000 && dist < 30) { toast('Слишком короткая прогулка — не сохранена'); updateWalkUI(); drawRoute([]); return; }
    const d = new Date(W.startTs);
    data.walks.push({ id: 'w' + W.startTs, date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, start: W.startTs, ms: ms, dist: Math.round(dist), steps: Math.round(dist / stepLen()), kcal: kcalFor(dist, ms), pts: pts });
    const cutoff = Date.now() - 90 * 86400000;
    data.walks = data.walks.filter(x => x.start > cutoff);
    save();
    toast('Прогулка сохранена: ' + f1(dist / 1000).replace('.0', '') + ' км, ' + Math.max(1, Math.round(ms / 60000)) + ' мин ✓');
    data.cnt.dist += dist;
    let wc = Math.floor(dist / 100);
    if (Math.floor(todayWalkMs() / 60000) >= normMin() && data.daily.walk !== todayStr()) { data.daily.walk = todayStr(); wc += 20; }
    if (wc > 0) addCoins(wc, { pop: 'прогулка' }); else { save(); checkTitles(); }
    renderWalk(); renderHome();
  }
  $('walkStart').onclick = startWalk;
  $('walkPause').onclick = pauseWalk;
  $('walkStop').onclick = () => { if (!W.running) return; if ((elapsed() < 30000 && W.dist < 30) || confirm('Завершить и сохранить прогулку?')) stopWalk(); };

  function updateAcc() {
    const el = $('wAcc'); if (!el) return;
    if (!W.running) { el.textContent = ''; return; }
    if (W.paused) { el.textContent = 'Пауза'; return; }
    if (W.acc == null) { el.textContent = 'Ищу сигнал GPS…'; return; }
    const q = W.acc <= 10 ? 'отличная' : W.acc <= 25 ? 'хорошая' : W.acc <= 40 ? 'средняя' : 'слабая (точки не учитываются)';
    el.textContent = 'Точность GPS: ≈ ' + Math.round(W.acc) + ' м · ' + q + (W.last ? '' : ' · жду первую точку');
  }
  function updateWalkUI() {
    const ms = elapsed();
    $('wTime').textContent = fmtTime(ms);
    $('wDist').textContent = (W.dist / 1000).toFixed(2) + ' км';
    $('wSpeed').textContent = ms > 5000 && W.dist > 0 ? f1((W.dist / 1000) / (ms / 3600000)) + ' км/ч' : '0.0 км/ч';
    $('wSteps').textContent = Math.round(W.dist / stepLen()) + ' · ' + kcalFor(W.dist, ms);
    const st = $('walkStart'), pa = $('walkPause'), sp = $('walkStop');
    st.style.display = W.running ? 'none' : '';
    pa.style.display = sp.style.display = W.running ? '' : 'none';
    pa.textContent = W.paused ? '▶ Продолжить' : '⏸ Пауза';
    updateAcc();
    updateTodayBar();
  }
  setInterval(() => { if (W.running && !W.paused && $('page-walk').classList.contains('active')) updateWalkUI(); }, 1000);

  function drawRoute(points) {
    const cv = $('routeCanvas'); if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = cv.clientWidth || 320, h = cv.clientHeight || 220;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    if (!points || !points.length) {
      ctx.fillStyle = '#b8a9d3'; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Маршрут появится, когда начнётся движение', w / 2, h / 2); return;
    }
    const la0 = points.reduce((s, p) => s + p.la, 0) / points.length, lo0 = points.reduce((s, p) => s + p.lo, 0) / points.length;
    const kx = Math.cos(rad(la0)) * 111320, ky = 110540;
    const xy = points.map(p => [(p.lo - lo0) * kx, -(p.la - la0) * ky]);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    xy.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
    const spanX = Math.max(60, maxX - minX), spanY = Math.max(60, maxY - minY), pad2 = 22;
    const sc = Math.min((w - pad2 * 2) / spanX, (h - pad2 * 2) / spanY);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const P = ([x, y]) => [w / 2 + (x - cx) * sc, h / 2 + (y - cy) * sc];
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = '#a78bfa';
    ctx.beginPath(); xy.forEach((q, i) => { const [x, y] = P(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    const dot = (q, col) => { const [x, y] = P(q); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fill(); };
    dot(xy[0], '#34d399'); if (xy.length > 1) dot(xy[xy.length - 1], '#f472b6');
  }

  function todayWalkMs() {
    const t = todayStr();
    return data.walks.filter(x => x.date === t).reduce((s, x) => s + x.ms, 0) + (W.running ? elapsed() : 0);
  }
  function normMin() { const pl = prof().done ? calcPlan(prof()) : null; return pl ? pl.walkMin : 30; }
  function updateTodayBar() {
    const min = Math.floor(todayWalkMs() / 60000), norm = normMin();
    const pct = Math.min(100, min / norm * 100);
    const f = $('walkTodayFill'); if (f) f.style.width = pct + '%';
    const tg = $('walkTodayTag'); if (tg) tg.textContent = min + ' / ' + norm + ' мин';
    const tx = $('walkTodayText');
    if (tx) tx.textContent = min >= norm ? 'Дневная норма выполнена 🎉' : 'Осталось ещё ' + (norm - min) + ' мин, чтобы выполнить минимум на сегодня.';
  }
  function renderWalkList() {
    const list = $('walkList'); if (!list) return;
    const arr = data.walks.slice().sort((a, b) => b.start - a.start).slice(0, 12);
    if (!arr.length) { list.innerHTML = '<div class="empty" style="padding:14px">Прогулок пока нет</div>'; return; }
    list.innerHTML = '';
    arr.forEach(x => {
      const d = new Date(x.start), el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `<div class="timebox"><strong>${pad(d.getHours())}:${pad(d.getMinutes())}</strong><span>${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span></div>
        <div class="body"><strong>${(x.dist / 1000).toFixed(2)} км · ${Math.max(1, Math.round(x.ms / 60000))} мин</strong><span>≈ ${x.steps} шагов · ${x.kcal} ккал · ${f1((x.dist / 1000) / (x.ms / 3600000))} км/ч</span></div>
        <div class="item-actions"><button type="button" data-route>Маршрут</button><button type="button" data-del>Удалить</button></div>`;
      el.querySelector('[data-route]').onclick = () => { if (W.running) { toast('Сначала заверши текущую прогулку'); return; } drawRoute(x.pts || []); try { $('routeCanvas').scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {} };
      el.querySelector('[data-del]').onclick = () => { if (!confirm('Удалить эту прогулку?')) return; data.walks = data.walks.filter(y => y.id !== x.id); save(); renderWalk(); renderHome(); };
      list.appendChild(el);
    });
  }
  function renderWalk() {
    renderPlan(); renderGeo(); renderWalkList(); updateWalkUI();
    if (!W.running) drawRoute([]); else drawRoute(W.points);
  }
  function renderHomeWalk() {
    const tag = $('homeWalkTag'), fill = $('homeWalkFill'), txt = $('homeWalkText'), btn = $('homeWalkBtn');
    if (!tag) return;
    if (!prof().done) { tag.textContent = '—'; fill.style.width = '0%'; txt.textContent = 'Заполни параметры (возраст, рост, вес, цель), и Luma рассчитает нормы.'; btn.textContent = 'Заполнить параметры'; btn.onclick = () => openOnboard(false); return; }
    const min = Math.floor(todayWalkMs() / 60000), norm = normMin();
    tag.textContent = min + ' / ' + norm + ' мин';
    fill.style.width = Math.min(100, min / norm * 100) + '%';
    txt.textContent = W.running ? 'Прогулка идёт…' : (min >= norm ? 'Дневная норма выполнена 🎉' : 'Осталось ' + (norm - min) + ' мин до минимума на сегодня.');
    btn.textContent = W.running ? 'К прогулке' : 'Начать прогулку'; btn.onclick = () => goTab('walk');
  }

  /* восстановление незавершённой прогулки после закрытия страницы */
  (function restoreWalk() {
    try {
      const raw = localStorage.getItem(WKEY); if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || !o.startTs || Date.now() - o.seen > 12 * 3600000) { clearPersisted(); return; }
      const ms = o.activeMs + (o.running ? Math.max(0, o.seen - o.segStart) : 0);
      Object.assign(W, { running: true, paused: true, startTs: o.startTs, activeMs: ms, segStart: Date.now(), dist: o.dist || 0, points: (o.pts || []).map(p => ({ la: p.la, lo: p.lo, t: 0, a: 0 })), last: null });
    } catch { clearPersisted(); }
  })();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); if (W.running && !W.paused) persistWalk(true); }
    else if (W.running && !W.paused) { lockScreen(); if (hiddenAt && Date.now() - hiddenAt > 15000) toast('Пока Luma была свёрнута, GPS мог не записываться'); }
  });
  window.addEventListener('pagehide', () => { if (W.running) persistWalk(true); });

  function maybeOnboard() {
    let skipped = false; try { skipped = sessionStorage.getItem('luma-ob-skip') === '1'; } catch {}
    if (!prof().done && !skipped) openOnboard(false);
  }

  /* ----- Weight journal: neutral tracking only, no target-weight advice ----- */
  const weightToday = () => new Date().toISOString().slice(0,10);
  function renderWeightLog(){
    const chart=$('weightLogChart'), list=$('weightLogList'); if(!chart||!list)return;
    const rows=(prof().weightLog||[]).slice(-10);
    if(!rows.length){chart.innerHTML='<div class="empty">Пока нет записей. Добавь измерение, если хочешь вести историю.</div>';list.innerHTML='';return;}
    const vals=rows.map(x=>x.kg), lo=Math.min(...vals), hi=Math.max(...vals), span=Math.max(1,hi-lo);
    chart.innerHTML='<div class="weight-bars">'+rows.map(x=>'<div class="weight-bar" title="'+x.kg+' кг · '+x.date+'" style="height:'+Math.round(22+(x.kg-lo)/span*62)+'%"><span>'+x.date.slice(5)+'</span></div>').join('')+'</div><p class="notice">Последняя запись: <b>'+rows[rows.length-1].kg.toFixed(1)+' кг</b> · '+rows[rows.length-1].date+'</p>';
    list.innerHTML=rows.slice().reverse().map((x,i)=>'<div class="weight-entry"><span><b>'+x.kg.toFixed(1)+' кг</b><br><small>'+x.date+'</small></span><button class="btn secondary small" type="button" data-weight-delete="'+(rows.length-1-i)+'">Удалить</button></div>').join('');
  }
  const weightDate=$('weightLogDate'); if(weightDate) weightDate.value=weightToday();
  const weightAdd=$('weightLogAdd'); if(weightAdd) weightAdd.onclick=()=>{const kg=+$('weightLogValue').value,date=$('weightLogDate').value;if(!(kg>=25&&kg<=300)||!date){toast('Проверь вес и дату');return;}const arr=prof().weightLog||(prof().weightLog=[]);const ix=arr.findIndex(x=>x.date===date);if(ix>=0)arr[ix].kg=Math.round(kg*10)/10;else arr.push({kg:Math.round(kg*10)/10,date});arr.sort((a,b)=>a.date.localeCompare(b.date));arr.splice(60);$('weightLogValue').value='';save();renderWeightLog();toast('Запись сохранена');};
  const weightList=$('weightLogList'); if(weightList) weightList.addEventListener('click',e=>{const b=e.target.closest('[data-weight-delete]');if(!b)return;const rows=(prof().weightLog||[]).slice(-10).reverse();const target=rows[+b.dataset.weightDelete];if(!target)return;prof().weightLog=prof().weightLog.filter(x=>x!==target);save();renderWeightLog();});
  renderWeightLog();

  /* ----- Settings ----- */
  document.querySelectorAll('.theme-swatch').forEach(b => {
    b.onclick = () => applyTheme(b.dataset.theme);
  });

  $('profileName').value = data.profile.name || '';
  $('saveProfile').onclick = () => {
    data.profile.name = $('profileName').value.trim().slice(0, 24);
    save();
    renderHome();
    toast('Профиль сохранён');
  };

  window.exportData = function() {
    data.lastExport = Date.now(); save(); renderBackupInfo();
    const storage = {};
    for (let i=0;i<localStorage.length;i++) {
      const k=localStorage.key(i); if (!k || k==='luma-lk') continue;
      if (k===KEY || k.startsWith('luma-')) storage[k]=localStorage.getItem(k);
    }
    const backup = { format:'luma-full-backup', version:1, appVersion:BUILD, createdAt:new Date().toISOString(), deviceId:getLumaDeviceId(), data, storage };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'luma-backup-v' + BUILD + '.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    toast('Полная резервная копия экспортирована');
  };

  $('importFile').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const old = data.auth || {};
        const parsed = JSON.parse(ev.target.result);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad');
        const isFull = parsed.format === 'luma-full-backup' && parsed.data && typeof parsed.data === 'object';
        const nd = isFull ? parsed.data : parsed;
        nd.auth = (nd.auth && typeof nd.auth === 'object') ? nd.auth : {};
        if (!authCheck('admin', nd.auth.a)) nd.auth.a = old.a || null;
        if (!authCheck('creator', nd.auth.c)) nd.auth.c = old.c || null;
        data = normalizeData(nd);
        if (isFull && parsed.storage && typeof parsed.storage === 'object') {
          Object.entries(parsed.storage).forEach(([k,v]) => {
            if (typeof k !== 'string' || !k.startsWith('luma-') || k==='luma-lk' || typeof v !== 'string') return;
            try { localStorage.setItem(k,v); } catch {}
          });
          if (parsed.deviceId && typeof parsed.deviceId === 'string') localStorage.setItem(DEVICE_ID_KEY,parsed.deviceId.slice(0,80));
        }
        $('profileName').value = data.profile.name || '';
        save();
        applyTheme(data.theme);
        applyMode(data.mode);
        syncThemeSwatches(); updateWallet(); checkTitles(); renderBackupInfo();
        window._refreshFoods && window._refreshFoods();
        renderHome(); renderNutrition(); renderReminders();
        initDeviceMemoryUI();
        toast(isFull ? 'Полная копия импортирована' : 'Импортировано');
      } catch { toast('Ошибка файла или неподдерживаемый формат'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  window.clearData = function() {
    if (!confirm('Удалить все данные?')) return;
    const keepAuth = data.auth;
    data = defaultData();
    data.auth = keepAuth || data.auth;
    ROLE = rolesOf(data);
    save(); checkTitles();
    applyTheme('violet');
    applyMode('dark');
    syncThemeSwatches(); updateWallet(); renderBackupInfo();
    window._refreshFoods && window._refreshFoods();
    renderHome();
    renderNutrition();
    renderReminders();
    toast('Очищено');
  };

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }


  /* ===== Luma v38: home widgets, weight trend, CSV export, cache helpers ===== */
  const WIDGET_LABELS = {
    wallet: '💰 Кошелёк и серия',
    pet: '🐾 Питомец',
    stats: '📊 Сводка (ккал / вода / планы)',
    week: '📈 Неделя',
    water: '💧 Вода',
    walk: '🚶 Прогулка',
    rem: '⏰ Напоминания',
    games: '🎮 Игры'
  };
  function ensureHomeWidgets() {
    const defOrder = ['wallet','pet','stats','week','water','walk','rem','games'];
    if (!data.homeWidgets || typeof data.homeWidgets !== 'object') data.homeWidgets = { order: defOrder.slice(), hidden: [] };
    let order = Array.isArray(data.homeWidgets.order) ? data.homeWidgets.order.filter(x => defOrder.includes(x)) : [];
    defOrder.forEach(id => { if (!order.includes(id)) order.push(id); });
    data.homeWidgets.order = order;
    data.homeWidgets.hidden = Array.isArray(data.homeWidgets.hidden) ? data.homeWidgets.hidden.filter(x => defOrder.includes(x)) : [];
  }
  function applyHomeWidgets() {
    try {
      ensureHomeWidgets();
      const page = $('page-home'); if (!page) return;
      const hidden = new Set(data.homeWidgets.hidden || []);
      const nodes = {};
      page.querySelectorAll('[data-widget]').forEach(el => { nodes[el.getAttribute('data-widget')] = el; });
      // reorder within page: keep hero/header, then widgets in order, then rest
      const order = data.homeWidgets.order || [];
      let anchor = $('betaHomeExtras') || page.querySelector('.hero');
      order.forEach(id => {
        const el = nodes[id];
        if (!el) return;
        el.classList.toggle('widget-hidden', hidden.has(id));
        if (anchor && anchor.parentNode === page) {
          if (anchor.nextSibling) page.insertBefore(el, anchor.nextSibling);
          else page.appendChild(el);
          anchor = el;
        }
      });
    } catch (e) { console.error('applyHomeWidgets', e); }
  }
  function renderHomeWidgetsEditor() {
    const box = $('homeWidgetsEditor'); if (!box) return;
    ensureHomeWidgets();
    const order = data.homeWidgets.order;
    const hidden = new Set(data.homeWidgets.hidden);
    box.innerHTML = '';
    order.forEach((id, idx) => {
      const row = document.createElement('div');
      row.className = 'widget-row' + (hidden.has(id) ? ' hidden-w' : '');
      row.innerHTML = '<span class="w-name">' + (WIDGET_LABELS[id] || id) + '</span><div class="w-actions">' +
        '<button type="button" data-wact="up" data-id="' + id + '" ' + (idx===0?'disabled':'') + '>↑</button>' +
        '<button type="button" data-wact="down" data-id="' + id + '" ' + (idx===order.length-1?'disabled':'') + '>↓</button>' +
        '<button type="button" data-wact="toggle" data-id="' + id + '">' + (hidden.has(id) ? 'Показать' : 'Скрыть') + '</button></div>';
      box.appendChild(row);
    });
  }
  function moveWidget(id, dir) {
    ensureHomeWidgets();
    const o = data.homeWidgets.order;
    const i = o.indexOf(id); if (i < 0) return;
    const j = i + dir; if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    save(); renderHomeWidgetsEditor(); applyHomeWidgets();
  }
  function toggleWidget(id) {
    ensureHomeWidgets();
    const h = data.homeWidgets.hidden;
    const ix = h.indexOf(id);
    if (ix >= 0) h.splice(ix, 1); else h.push(id);
    save(); renderHomeWidgetsEditor(); applyHomeWidgets();
  }
  function bindHomeWidgetsUI() {
    const box = $('homeWidgetsEditor');
    if (box) box.addEventListener('click', e => {
      const b = e.target.closest('[data-wact]'); if (!b) return;
      const id = b.dataset.id, act = b.dataset.wact;
      if (act === 'up') moveWidget(id, -1);
      else if (act === 'down') moveWidget(id, 1);
      else if (act === 'toggle') toggleWidget(id);
    });
    $('homeWidgetsReset')?.addEventListener('click', () => {
      data.homeWidgets = { order: ['wallet','pet','stats','week','water','walk','rem','games'], hidden: [] };
      save(); renderHomeWidgetsEditor(); applyHomeWidgets(); toast('Порядок блоков сброшен');
    });
  }

  function downloadBlob(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function csvEscape(v) {
    const s = String(v == null ? '' : v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function exportDiaryCsv() {
    const rows = (data.diary || []).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
    let out = 'date,mood,text,updated\n';
    rows.forEach(r => {
      out += [csvEscape(r.date), csvEscape(r.mood), csvEscape(r.text), csvEscape(r.updated ? new Date(r.updated).toISOString() : '')].join(',') + '\n';
    });
    downloadBlob('luma-diary-' + todayStr() + '.csv', out, 'text/csv;charset=utf-8');
    toast(rows.length ? 'Дневник экспортирован (' + rows.length + ')' : 'Дневник пуст — файл всё равно создан');
  }
  function exportDiaryTxt() {
    const rows = (data.diary || []).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
    let out = 'Luma — дневник\nЭкспорт: ' + new Date().toLocaleString('ru-RU') + '\n\n';
    if (!rows.length) out += '(записей нет)\n';
    rows.forEach(r => {
      out += '——— ' + (r.date || '') + ' ' + (r.mood || '') + ' ———\n';
      out += (r.text || '(без текста)') + '\n\n';
    });
    downloadBlob('luma-diary-' + todayStr() + '.txt', out, 'text/plain;charset=utf-8');
    toast(rows.length ? 'Текстовый дневник сохранён' : 'Дневник пуст');
  }
  function exportWalksCsv() {
    const rows = (data.walks || []).slice().sort((a,b) => (b.start||0) - (a.start||0));
    let out = 'date,start,duration_min,distance_km,steps,kcal,avg_speed_kmh\n';
    rows.forEach(x => {
      const min = Math.max(1, Math.round((x.ms || 0) / 60000));
      const km = ((x.dist || 0) / 1000);
      const speed = (x.ms > 0 && x.dist > 0) ? (km / (x.ms / 3600000)) : 0;
      out += [csvEscape(x.date), csvEscape(x.start ? new Date(x.start).toISOString() : ''), csvEscape(min), csvEscape(km.toFixed(3)), csvEscape(x.steps || ''), csvEscape(x.kcal || ''), csvEscape(speed.toFixed(2))].join(',') + '\n';
    });
    downloadBlob('luma-walks-' + todayStr() + '.csv', out, 'text/csv;charset=utf-8');
    toast(rows.length ? 'Прогулки экспортированы (' + rows.length + ')' : 'Прогулок нет — файл создан');
  }
  function bindExportExtra() {
    $('exportDiaryCsv')?.addEventListener('click', exportDiaryCsv);
    $('exportDiaryTxt')?.addEventListener('click', exportDiaryTxt);
    $('exportWalksCsv')?.addEventListener('click', exportWalksCsv);
  }

  async function checkCacheStatus() {
    const line = $('cacheStatusLine');
    try {
      if (!('caches' in window)) { if (line) line.textContent = 'Cache API недоступен в этом браузере.'; return; }
      const keys = await caches.keys();
      const lumaKeys = keys.filter(k => k.indexOf('luma') >= 0);
      let files = 0;
      for (const k of lumaKeys) {
        try { const c = await caches.open(k); const ks = await c.keys(); files += ks.length; } catch {}
      }
      const sw = navigator.serviceWorker ? (navigator.serviceWorker.controller ? 'активен' : 'ожидает') : 'нет';
      const online = navigator.onLine ? 'онлайн' : 'офлайн';
      if (line) line.textContent = 'Кэш: ' + (lumaKeys[0] || '—') + ' · файлов ≈ ' + files + ' · SW: ' + sw + ' · сеть: ' + online;
      toast(files > 0 ? 'Кэш в порядке (' + files + ' файлов)' : 'Кэш пуст — открой приложение онлайн и нажми «Обновить кэш»');
    } catch (e) {
      if (line) line.textContent = 'Не удалось проверить кэш';
      toast('Ошибка проверки кэша');
    }
  }
  async function forcePrecache() {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'PRECACHE' });
        toast('Запрошено обновление кэша');
      } else if (navigator.serviceWorker) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.active) reg.active.postMessage({ type: 'PRECACHE' });
        else toast('Service Worker ещё не готов — открой онлайн');
      } else toast('Service Worker недоступен');
      setTimeout(checkCacheStatus, 1200);
    } catch { toast('Не удалось обновить кэш'); }
  }
  function bindCacheUI() {
    $('checkCacheBtn')?.addEventListener('click', checkCacheStatus);
    $('forcePrecacheBtn')?.addEventListener('click', forcePrecache);
  }

  // Enhanced weight log
  function renderWeightLog(){
    const chart=$('weightLogChart'), list=$('weightLogList'); if(!chart||!list)return;
    const all=(prof().weightLog||[]).slice();
    const rows=all.slice(-14);
    if(!rows.length){
      chart.innerHTML='<div class="empty">Пока нет записей. Добавь измерение, если хочешь вести историю.</div>';
      list.innerHTML='';
      return;
    }
    const vals=rows.map(x=>x.kg), lo=Math.min(...vals), hi=Math.max(...vals), span=Math.max(0.5,hi-lo);
    const last=rows[rows.length-1], prev=rows.length>1?rows[rows.length-2]:null;
    const delta=prev?Math.round((last.kg-prev.kg)*10)/10:null;
    const avg=Math.round(vals.reduce((s,v)=>s+v,0)/vals.length*10)/10;
    const deltaTxt = delta==null ? '—' : ((delta>0?'+':'')+delta.toFixed(1)+' кг');
    const deltaColor = delta==null ? '' : (delta>0 ? '#fca5a5' : (delta<0 ? '#86efac' : ''));
    chart.innerHTML =
      '<div class="weight-trend">' +
        '<div class="wt"><span>Последний</span><b>'+last.kg.toFixed(1)+' кг</b></div>' +
        '<div class="wt"><span>Изменение</span><b style="color:'+deltaColor+'">'+deltaTxt+'</b></div>' +
        '<div class="wt"><span>Среднее ('+rows.length+')</span><b>'+avg.toFixed(1)+' кг</b></div>' +
        '<div class="wt"><span>Мин / макс</span><b>'+lo.toFixed(1)+' – '+hi.toFixed(1)+'</b></div>' +
      '</div>' +
      '<div class="weight-bars">'+rows.map(x=>{
        const h=Math.round(18+(x.kg-lo)/span*70);
        return '<div class="weight-bar" title="'+x.kg+' кг · '+x.date+'" style="height:'+h+'%"><span>'+x.date.slice(5)+'</span></div>';
      }).join('')+'</div>' +
      '<p class="notice" style="margin-top:22px">Последняя запись: <b>'+last.kg.toFixed(1)+' кг</b> · '+last.date+'</p>';
    list.innerHTML=rows.slice().reverse().map((x,i)=>'<div class="weight-entry"><span><b>'+x.kg.toFixed(1)+' кг</b><br><small>'+x.date+'</small></span><button class="btn secondary small" type="button" data-weight-delete="'+(rows.length-1-i)+'">Удалить</button></div>').join('');
  }


  /* ----- Init ----- */
  applyTheme(data.theme || 'violet');
  applyMode(data.mode || 'dark');
  syncThemeSwatches(); updateStreak(); checkTitles();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { updateStreak(); renderHome(); } });
  initRemDefaults();
  checkDue();
  setInterval(checkDue, 5000);
  document.addEventListener('visibilitychange', () => { checkDue(); });
  window.addEventListener('focus', checkDue);
  window.addEventListener('pageshow', checkDue);
  updateNotifUI();
  renderHome();
  (function showWelcome() {
    const h = new Date().getHours();
    const title = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
    const tips = [
      'Не обязательно успевать всё сразу. Выбери одну небольшую задачу.',
      'Сделай короткую паузу, потянись и отдохни от экрана.',
      'Не забывай пить воду в течение дня, ориентируйся на жажду.',
      'Небольшая прогулка или несколько минут движения могут освежить мысли.',
      'Запиши важное напоминание, чтобы не держать всё в голове.',
      'Регулярный сон помогает восстановиться после насыщенного дня.'
    ];
    const t = $('welcomeTitle'), a = $('welcomeAdvice'), overlay = $('welcomeOverlay');
    if (t) t.textContent = title + (data.profile.name ? ', ' + data.profile.name : '') + '!';
    if (a) a.textContent = tips[(new Date().getDate() + h) % tips.length];
    const close = () => { if (!overlay) return; overlay.classList.add('hide'); setTimeout(() => overlay.remove(), 380); };
    $('welcomeClose')?.addEventListener('click', close);
    setTimeout(close, 3500); /* приветствие закрывается само и не мешает входу */
    overlay?.addEventListener('click', e => { if (e.target === overlay) close(); });
  })();
  initDeviceMemoryUI();
  renderBackupInfo(); backupNudge();
  window.addEventListener('error', e => { try { console.error(e.error || e.message); const t = Date.now(); if (!window._errT || t - window._errT > 30000) { window._errT = t; toast('Что-то пошло не так. Данные сохранены, обнови страницу'); } } catch {} });
  window.addEventListener('unhandledrejection', e => { try { console.error(e.reason); } catch {} });
  /* знакомство больше не открывается поверх страницы само: оно доступно по кнопке «Заполнить параметры» */
  try { showWhatsNewIfNeeded(); } catch (e) {}

  try { bindHomeWidgetsUI(); renderHomeWidgetsEditor(); applyHomeWidgets(); } catch (e) { console.error(e); }
  try { bindExportExtra(); } catch (e) {}
  try { bindCacheUI(); } catch (e) {}



  /* UI beta buttons + initial ui */
  try {
    if (data.ui === 'beta') document.documentElement.setAttribute('data-ui', 'beta');
    else document.documentElement.removeAttribute('data-ui');
    const st = $('uiBetaStatus');
    if (st) st.textContent = data.ui === 'beta' ? 'Сейчас: Beta Design v38' : 'Сейчас: классический дизайн';
    adaptNavForUI();
    $('uiBetaOn')?.addEventListener('click', () => setUIMode('beta'));
    $('uiBetaOff')?.addEventListener('click', () => setUIMode('classic'));
    checkAchievements();
    renderAchievements();
  } catch (e) { console.error(e); }


  /* Offline banner (iOS black-screen prevention feedback) */
  (function offlineBanner(){
    function show(on){
      let el = document.getElementById('offlineBanner');
      if (!on) { if (el) el.remove(); return; }
      if (el) return;
      el = document.createElement('div');
      el.id = 'offlineBanner';
      el.setAttribute('role','status');
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:10px 14px;padding-top:calc(10px + env(safe-area-inset-top));background:#3b0764;color:#f5e9ff;font-size:13px;text-align:center;border-bottom:1px solid rgba(255,255,255,.12)';
      el.textContent = 'Офлайн-режим · данные на этом устройстве';
      document.body.appendChild(el);
    }
    window.addEventListener('offline', () => show(true));
    window.addEventListener('online', () => { show(false); try { navigator.serviceWorker?.controller?.postMessage({ type: 'PRECACHE' }); } catch {} });
    if (navigator.onLine === false) show(true);
  })();

  setupBackgroundSync();
  function onLeaveBackground() {
    syncRemindersToSW();
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_DUE' });
      }
    } catch {}
  }
  function onBackForeground() {
    checkDue();
    syncRemindersToSW();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onLeaveBackground();
    else onBackForeground();
  });
  window.addEventListener('pagehide', onLeaveBackground);
  window.addEventListener('pageshow', onBackForeground);
  document.addEventListener('resume', onBackForeground); // some webviews
  /* ===== Auth + Developer role ===== */
const Auth = {
  user: null,
  profile: null,
  isDeveloper: false,

  async init() {
    const { data: { session } } = await lumaCloud.auth.getSession();
    if (session?.user) {
      this.user = session.user;
      await this.loadProfile();
    }
    this.updateUI();

    lumaCloud.auth.onAuthStateChange(async (event, session) => {
      this.user = session?.user || null;
      if (this.user) await this.loadProfile();
      else {
        this.profile = null;
        this.isDeveloper = false;
      }
      this.updateUI();
    });

    // Кнопки
    $('authLoginBtn')?.addEventListener('click', () => this.login());
    $('authRegisterBtn')?.addEventListener('click', () => this.register());
    $('authLogoutBtn')?.addEventListener('click', () => this.logout());
  },

  async loadProfile() {
    if (!this.user) return;
    const { data, error } = await lumaCloud
      .from('profiles')
      .select('*')
      .eq('id', this.user.id)
      .single();

    if (error) {
      console.warn('Profile load error', error);
      this.profile = null;
      this.isDeveloper = false;
      return;
    }
    this.profile = data;
    this.isDeveloper = data?.role === 'developer';
  },

  updateUI() {
    const loggedOut = $('authLoggedOut');
    const loggedIn = $('authLoggedIn');
    const tag = $('authStatusTag');
    const emailEl = $('authUserEmail');
    const roleEl = $('authRoleInfo');
    const msg = $('authMessage');

    if (this.user) {
      if (loggedOut) loggedOut.style.display = 'none';
      if (loggedIn) loggedIn.style.display = 'block';
      if (tag) tag.textContent = 'Вошёл';
      if (emailEl) emailEl.textContent = this.user.email;
      if (roleEl) {
        roleEl.textContent = this.isDeveloper
          ? 'Роль: Разработчик'
          : 'Роль: Пользователь';
      }
      if (msg) msg.textContent = '';
    } else {
      if (loggedOut) loggedOut.style.display = 'block';
      if (loggedIn) loggedIn.style.display = 'none';
      if (tag) tag.textContent = 'Не вошёл';
    }
  },

  async login() {
    const email = $('authEmail')?.value.trim();
    const password = $('authPassword')?.value;
    const msg = $('authMessage');

    if (!email || !password) {
      if (msg) msg.textContent = 'Введите email и пароль';
      return;
    }

    const { error } = await lumaCloud.auth.signInWithPassword({ email, password });
    if (error) {
      if (msg) msg.textContent = this.errText(error);
      return;
    }
    if (msg) msg.textContent = 'Успешный вход';
  },

  async register() {
    const email = $('authEmail')?.value.trim();
    const password = $('authPassword')?.value;
    const msg = $('authMessage');

    if (!email || !password) {
      if (msg) msg.textContent = 'Введите email и пароль';
      return;
    }
    if (password.length < 6) {
      if (msg) msg.textContent = 'Пароль должен быть не меньше 6 символов';
      return;
    }

    const { data, error } = await lumaCloud.auth.signUp({ email, password });
    if (error) {
      if (msg) msg.textContent = this.errText(error);
      return;
    }
    if (data && data.session) {
      if (msg) msg.textContent = 'Аккаунт создан, вы вошли.';
    } else if (msg) {
      msg.textContent = 'Аккаунт создан. Проверьте почту и подтвердите адрес по ссылке, затем нажмите «Войти».';
    }
  },

  errText(error) {
    const m = String((error && error.message) || error || '');
    if (/invalid login credentials/i.test(m)) return 'Неверный email или пароль (или почта ещё не подтверждена).';
    if (/email not confirmed/i.test(m)) return 'Почта не подтверждена. Откройте письмо и перейдите по ссылке.';
    if (/already registered|already been registered/i.test(m)) return 'Этот email уже зарегистрирован. Нажмите «Войти».';
    if (/rate limit/i.test(m)) return 'Слишком много попыток. Подождите немного.';
    if (/failed to fetch|network/i.test(m)) return 'Нет связи с сервером. Проверьте интернет.';
    return m;
  },

  async logout() {
    await lumaCloud.auth.signOut();
    this.user = null;
    this.profile = null;
    this.isDeveloper = false;
    this.updateUI();
  }
};

// Запускаем после загрузки
document.addEventListener('DOMContentLoaded', () => {
  if (window.lumaCloud) Auth.init();
  else {
    const m = $('authMessage');
    if (m) m.textContent = 'Сервер входа недоступен: не загрузилась библиотека Supabase. Проверьте интернет и обновите страницу.';
    ['authLoginBtn', 'authRegisterBtn'].forEach(id => $(id)?.addEventListener('click', () => {
      if (m) m.textContent = 'Сервер входа недоступен. Проверьте интернет и обновите страницу.';
    }));
  }
}); 
})();
  
