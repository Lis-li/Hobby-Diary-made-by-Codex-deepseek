// sw.js —— 爱好日记 Service Worker：缓存应用静态资源，使应用可离线使用。
const CACHE_NAME = 'hobby-diary-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=20260812',
  './app.js?v=20260812',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // 网络优先：在线时总是拿到最新文件，离线时回退到缓存，避免缓存旧版本
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() =>
      caches.match(req).then(m =>
        m || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)
      )
    )
  );
});
