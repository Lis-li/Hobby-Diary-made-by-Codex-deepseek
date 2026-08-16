// sw.js —— Hobby Diary Service Worker：缓存应用静态资源，使应用可离线使用；支持版本更新提示。
const APP_VERSION = '2.5';
const CACHE_NAME = 'hobby-diary-' + APP_VERSION;
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=2.5',
  './app.js?v=2.5',
  './photoStore.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 收到主线程的 SKIP_WAITING 消息后接管页面，完成“点击横幅一键更新”
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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
