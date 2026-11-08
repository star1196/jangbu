// 앱을 고칠 때마다 아래 버전 번호를 하나씩 올려요 (jangbu-v5 → jangbu-v6 …)
const VERSION = 'jangbu-v10';

// 인터넷 없이도 열리도록 기기에 넣어 두는 파일 목록
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/icons.js',
  './js/data.js',
  './js/store.js',
  './js/util.js',
  './js/form.js',
  './js/cards.js',
  './js/files.js',
  './js/backup.js',
  './js/screens.js',
  './vendor/xlsx.full.min.js',
  './js/app.js',
  './fonts/PretendardVariable.woff2',
  './icons/app-192.png',
  './icons/app-512.png',
  './icons/app-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 기기에 넣어 둔 파일을 먼저 쓰고, 없을 때만 인터넷에서 가져와요.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
