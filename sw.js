/* Luma service worker v38 — offline-first, resilient cache */
const CACHE = 'luma-v40-luma2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './luma2.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './sw.js'
];
const ICON = './icon-192.png';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('luma-sw', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction('meta', 'readonly').objectStore('meta').get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function showNotif(title, body, tag) {
  await self.registration.showNotification(title || 'Luma', {
    body: body || '',
    tag: tag || 'luma',
    icon: ICON,
    badge: ICON,
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200]
  });
}

async function scheduleAt(title, body, tag, when) {
  const opts = {
    body: body || '',
    tag: tag || ('luma-' + when),
    icon: ICON,
    badge: ICON,
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200]
  };
  try {
    if (typeof TimestampTrigger !== 'undefined') {
      opts.showTrigger = new TimestampTrigger(when);
      await self.registration.showNotification(title || 'Luma', opts);
      return 'trigger';
    }
  } catch (e) {}
  return 'unsupported';
}

async function syncAndSchedule(reminders) {
  try {
    await idbSet('reminders', Array.isArray(reminders) ? reminders : []);
    await checkStoredReminders(true);
  } catch {}
}

let checkingNow = false;
let lastCheck = 0;
async function checkStoredReminders(force) {
  const t = Date.now();
  if (checkingNow) return;
  if (!force && t - lastCheck < 8000) return;
  checkingNow = true;
  lastCheck = t;
  try {
    const list = (await idbGet('reminders')) || [];
    const now = Date.now();
    const next = [];
    for (const r of list) {
      if (!r || r.done) continue;
      if (!r.fired && typeof r.when === 'number' && r.when <= now + 1500) {
        await showNotif('Luma напоминает', r.text || 'Напоминание', 'luma-' + r.id);
        r.fired = true;
      }
      if (!r.done) next.push(r);
    }
    await idbSet('reminders', next);
  } catch {}
  checkingNow = false;
}

async function precacheShell() {
  const cache = await caches.open(CACHE);
  const results = await Promise.allSettled(
    ASSETS.map(async (a) => {
      try {
        const res = await fetch(a, { cache: 'reload' });
        if (res && res.ok) {
          await cache.put(a, res.clone());
          // also store without leading ./
          if (a.startsWith('./')) {
            try { await cache.put(a.slice(2) || './', res.clone()); } catch {}
          }
        }
      } catch {}
    })
  );
  try {
    const idx = await cache.match('./index.html') || await cache.match('index.html') || await cache.match('./');
    if (idx) {
      const base = self.registration.scope;
      const clones = [base, base + 'index.html', './', './index.html', 'index.html', base.replace(/\/$/, '')];
      for (const key of clones) {
        try { await cache.put(key, idx.clone()); } catch {}
      }
    }
  } catch {}
  return results;
}

async function matchShell(req) {
  const cache = await caches.open(CACHE);
  const url = new URL(req.url);
  const candidates = [
    req,
    './index.html',
    'index.html',
    './',
    url.pathname,
    url.pathname.replace(/\/$/, '') + '/index.html',
    self.registration.scope,
    self.registration.scope + 'index.html',
    self.registration.scope.replace(/\/$/, '')
  ];
  for (const c of candidates) {
    try {
      const hit = await cache.match(c, { ignoreSearch: true });
      if (hit) return hit;
    } catch {}
  }
  try {
    const keys = await cache.keys();
    for (const k of keys) {
      if (k.url.includes('index.html') || k.url.endsWith('/')) {
        const hit = await cache.match(k);
        if (hit) return hit;
      }
    }
  } catch {}
  // any html in this cache
  try {
    const keys = await cache.keys();
    for (const k of keys) {
      const hit = await cache.match(k);
      if (hit) {
        const ct = hit.headers.get('content-type') || '';
        if (ct.includes('text/html')) return hit;
      }
    }
  } catch {}
  return null;
}

function offlinePage() {
  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#170d32"><title>Luma</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,system-ui,sans-serif;background:#100820;color:#fbf8ff;padding:24px;text-align:center}
.card{max-width:340px;padding:28px 22px;border-radius:20px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15)}
h1{font-size:22px;margin:0 0 10px}p{margin:0 0 12px;line-height:1.5;color:#c2b6dc;font-size:14px}
button{margin-top:8px;padding:12px 18px;border:0;border-radius:12px;background:#a78bfa;color:#1a1028;font-weight:700;font-size:15px}</style></head>
<body><div class="card"><h1>Luma офлайн</h1><p>Страница ещё не сохранилась в кэш на этом устройстве. Открой Luma <b>один раз с интернетом</b>, затем добавь на экран «Домой».</p><p>Если уже открывала онлайн — обнови страницу, когда появится сеть.</p><button onclick="location.reload()">Обновить</button></div></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    try { await precacheShell(); } catch {}
    await checkStoredReminders();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const isShell = isNav || url.pathname.endsWith('.html') || url.pathname.endsWith('/') || /\/sw\.js$/.test(url.pathname);

  if (isShell) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        if (net && net.ok) {
          try {
            const cache = await caches.open(CACHE);
            await cache.put(req, net.clone());
            if (isNav) {
              await cache.put('./index.html', net.clone());
              await cache.put('./', net.clone());
              await cache.put('index.html', net.clone());
            }
          } catch {}
          return net;
        }
      } catch {}
      const cached = await matchShell(req);
      if (cached) return cached;
      return offlinePage();
    })());
    event.waitUntil(checkStoredReminders());
    return;
  }

  // static: cache-first, then network, then shell
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      // background refresh
      event.waitUntil((async () => {
        try {
          const net = await fetch(req);
          if (net && net.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(req, net.clone());
          }
        } catch {}
      })());
      return cached;
    }
    try {
      const net = await fetch(req);
      if (net && net.ok) {
        try {
          const cache = await caches.open(CACHE);
          await cache.put(req, net.clone());
        } catch {}
      }
      return net;
    } catch {
      return (await matchShell(req)) || offlinePage();
    }
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION' && data.title) {
    event.waitUntil(showNotif(data.title, data.body, data.tag));
  }
  if (data.type === 'SYNC_REMINDERS' && Array.isArray(data.reminders)) {
    event.waitUntil(syncAndSchedule(data.reminders));
  }
  if (data.type === 'SCHEDULE_ONE' && data.when) {
    event.waitUntil(scheduleAt(data.title || 'Luma напоминает', data.body || '', data.tag || 'luma', data.when));
  }
  if (data.type === 'CHECK_DUE') {
    event.waitUntil(checkStoredReminders(true));
  }
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'PRECACHE') event.waitUntil(precacheShell());
  if (data.type === 'CACHE_STATUS') {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(CACHE);
        const keys = await cache.keys();
        const client = event.source;
        if (client && client.postMessage) client.postMessage({ type: 'CACHE_STATUS_RESULT', cache: CACHE, count: keys.length });
      } catch {}
    })());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) if ('focus' in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'luma-check') event.waitUntil(checkStoredReminders());
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'luma-check') event.waitUntil(checkStoredReminders());
});

self.addEventListener('push', (event) => {
  let title = 'Luma', body = 'Напоминание';
  try {
    if (event.data) {
      const j = event.data.json();
      title = j.title || title;
      body = j.body || body;
    }
  } catch { try { body = event.data.text(); } catch {} }
  event.waitUntil(showNotif(title, body, 'luma-push-' + Date.now()));
});
