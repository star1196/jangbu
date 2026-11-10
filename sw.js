// 앱을 고칠 때마다 아래 버전 번호를 하나씩 올려요 (jangbu-v5 → jangbu-v6 …)
const VERSION = 'jangbu-v18';
// 영수증 글자 읽기 자료는 앱 버전과 따로 보관 (새 버전이 와도 다시 받지 않음)
const OCR_CACHE = 'jangbu-ocr-5.1.1';

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
  './js/plans.js',
  './js/more.js',
  './js/excel.js',
  './js/receipt.js',
  './js/reset.js',
  './js/screens.js',
  './vendor/xlsx.full.min.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './js/app.js',
  './fonts/PretendardVariable.woff2',
  './icons/app-192.png',
  './icons/app-512.png',
  './icons/app-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// 새 버전을 넣을 때는 브라우저가 잠깐 들고 있던 예전 파일 말고 늘 깃허브에서 새로 받아요
// (예전 파일과 새 파일이 섞여 앱이 안 움직이는 일을 막음)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(FILES.map((u) => fetch(new Request(u, { cache: 'reload' })).then((res) => {
        if (!res.ok) throw new Error(u + ' ' + res.status);
        return c.put(u, res);
      }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== OCR_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 기기에 넣어 둔 파일을 먼저 쓰고, 없을 때만 인터넷에서 가져와요.
// 단 첫 화면(index.html)은 인터넷이 되면 늘 새로 받아서, 새 버전이 올라오면 바로 알아차려요.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match('./index.html', { ignoreSearch: true }).then((r) => r || caches.match('./'))));
    return;
  }
  // 영수증 글자 읽기 도구·한국어 자료(약 5MB)는 처음 쓸 때 한 번 받아 기기에 보관 → 그 뒤 인터넷 없이 작동
  if (new URL(req.url).pathname.includes('/vendor/ocr/')) {
    e.respondWith(caches.open(OCR_CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
