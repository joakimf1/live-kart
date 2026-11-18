// Bergen live – service worker
// Appskallet caches slik at appen åpner raskt og fungerer som installert app.
// Sanntidsdata (Entur, MET, strømpris) og kartfliser går alltid rett til nettet.
importScripts('config.js');
const CACHE = 'bergenlive-v5';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './config.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isLib = url.hostname === 'cdnjs.cloudflare.com' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');

  // Sidene: nett først (alltid nyeste versjon), cache som reserve uten nett
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Egne filer og biblioteker: cache først, oppdater i bakgrunnen
  if (sameOrigin || isLib) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
        return hit || net;
      })
    );
  }
  // Alt annet (API-er, kartfliser) går rett til nettet
});

// Push fra Worker-en: meldingen ligger enten i selve pushen, eller hentes fra Worker-en
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let msgs = [];
    try { if (e.data) { const d = e.data.json(); msgs = Array.isArray(d) ? d : [d]; } } catch (err) {}
    const api = String(self.BLK_CONFIG?.PUSH_API || '').replace(/\/+$/, '');
    if (!msgs.length && api) {
      try {
        const sub = await self.registration.pushManager.getSubscription();
        const r = await fetch(api + '/messages?endpoint=' + encodeURIComponent(sub.endpoint));
        msgs = await r.json();
      } catch (err) {}
    }
    if (!msgs.length) msgs = [{ title: 'Bergen live', body: 'Det er en oppdatering om reisen din.' }];
    for (const m of msgs) {
      await self.registration.showNotification(m.title || 'Bergen live', {
        body: m.body || '', tag: m.tag, renotify: !!m.tag,
        icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: m.url || './' },
      });
    }
  })());
});

// Trykk på varsel → åpne/fokuser appen
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) { c.navigate?.(target); return c.focus(); }
      return self.clients.openWindow(target);
    })
  );
});
