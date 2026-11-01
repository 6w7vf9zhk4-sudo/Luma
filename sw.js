/* Luma service worker v28 — offline-first for iOS Safari */
const CACHE = 'luma-v31';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
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
  const delay = Math.max(0, when - Date.now());
  if (delay > 2147480000) return 'too-far';
  setTimeout(() => {
    self.registration.showNotification(title || 'Luma', {
      body: opts.body,
      tag: opts.tag + '-fire',
      icon: ICON,
      renotify: true,
      silent: false,
      vibrate: [200, 100, 200]
    }).catch(() => {});
  }, delay);
  return 'timeout';
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

/** Precache shell under several URL keys (iOS navigates to /, /index.html, full URL) */
async function precacheShell() {
  const cache = await caches.open(CACHE);
  const results = await Promise.allSettled(
    ASSETS.map(async (a) => {
      try {
        const res = await fetch(a, { cache: 'reload' });
        if (res && res.ok) await cache.put(a, res.clone());
      } catch {}
    })
  );
  // Mirror index under common navigation keys
  try {
    const idx = await cache.match('./index.html') || await cache.match('index.html');
    if (idx) {
      const base = self.registration.scope;
      await cache.put(base, idx.clone());
      await cache.put(base + 'index.html', idx.clone());
      await cache.put('./', idx.clone());
      await cache.put('./index.html', idx.clone());
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
    self.registration.scope + 'index.html'
  ];
  for (const c of candidates) {
    try {
      const hit = await cache.match(c, { ignoreSearch: true });
      if (hit) return hit;
    } catch {}
  }
  // last resort: any cached HTML
  try {
    const keys = await cache.keys();
    for (const k of keys) {
      if (k.url.includes('index.html') || k.url.endsWith('/')) {
        const hit = await cache.match(k);
        if (hit) return hit;
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
    // refresh shell once activated (when online)
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
      // Prefer network when available, always update cache
      try {
        const net = await fetch(req);
        if (net && net.ok) {
          try {
            const cache = await caches.open(CACHE);
            await cache.put(req, net.clone());
            if (isNav) {
              await cache.put('./index.html', net.clone());
              await cache.put('./', net.clone());
            }
          } catch {}
          return net;
        }
      } catch {}
      // Offline / failed network
      const cached = await matchShell(req);
      if (cached) return cached;
      return offlinePage();
    })());
    event.waitUntil(checkStoredReminders());
    return;
  }

  // icons and static: cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
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
