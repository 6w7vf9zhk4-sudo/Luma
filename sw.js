/* Luma service worker v24 */
const CACHE = 'luma-v25';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
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

/* Schedule at exact time if browser supports Notification Triggers */
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
  // Experimental: Notification Triggers (Chrome)
  try {
    if (typeof TimestampTrigger !== 'undefined') {
      opts.showTrigger = new TimestampTrigger(when);
      await self.registration.showNotification(title || 'Luma', opts);
      return 'trigger';
    }
  } catch (e) {}
  // Fallback: setTimeout inside SW (works while SW is alive, short delays after background)
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

async function syncAndSchedule(list) {
  // Only store the list. Notifications are scheduled once via SCHEDULE_ONE and
  // due ones are handled by checkStoredReminders (prevents duplicate spam / crashes).
  await idbSet('reminders', list || []);
}

let lastCheck = 0;
let checkingNow = false;
async function checkStoredReminders(force) {
  const t = Date.now();
  if (checkingNow || (!force && t - lastCheck < 5000)) return;
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a)))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    await checkStoredReminders();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // внешние API (Open Food Facts) идут напрямую
  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  const isCode = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
  if (isDoc || isCode) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match('./index.html') || Response.error()))
    );
    event.waitUntil(checkStoredReminders());
    return;
  }
  event.respondWith(
    caches.match(req).then((c) => c || fetch(req).catch(() => caches.match('./index.html')))
  );
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
