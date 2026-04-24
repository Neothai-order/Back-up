const CACHE_VERSION = 'neo-sales-v254';

// 클라이언트에서 SKIP_WAITING 메시지 오면 즉시 활성화
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 캐시할 CDN 라이브러리 (버전 고정, 변하지 않음)
const CDN_ASSETS = [
  // Firebase SDK
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions-compat.js',
  // xlsx
  'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js',
  // flatpickr
  'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13',
  'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/l10n/ko.js',
  'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/l10n/th.js',
  // chart.js
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  // html2canvas, jspdf
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// install: 이전 캐시 삭제 후 CDN 라이브러리 프리캐시
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() =>
      caches.open(CACHE_VERSION).then(cache => cache.addAll(CDN_ASSETS))
    )
  );
});

// activate: 이전 버전 캐시 정리 + clients.claim() 만 호출
// 리로드는 index.html 의 controllerchange 리스너가 자동 처리 (v175+ 부터 존재)
// ⚠️ 예전에는 postMessage + client.navigate 를 병행 호출했는데,
//    controllerchange 와 합쳐 3중 리로드 트리거가 되어
//    "같은 분 안에 cold-start 2번" 현상이 간헐적으로 발생했음 (T2408087 사례).
//    → clients.claim() 만 남겨 하나의 깨끗한 리로드 경로로 통일.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// fetch: 요청 유형별 전략
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 1) Firestore, Firebase Auth, FCM, API — 절대 캐시하지 않음 (실시간 보장)
  if (url.includes('firestore.googleapis.com') ||
      url.includes('identitytoolkit.googleapis.com') ||
      url.includes('securetoken.googleapis.com') ||
      url.includes('fcmregistrations.googleapis.com') ||
      url.includes('firebaseinstallations.googleapis.com') ||
      url.includes('cloudfunctions.net')) {
    return;  // SW가 관여하지 않음 → 브라우저 기본 동작
  }

  // 2) CDN 라이브러리 — Cache First (캐시에 있으면 즉시 반환)
  if (url.includes('gstatic.com/firebasejs/') ||
      url.includes('cdn.jsdelivr.net/') ||
      url.includes('cdnjs.cloudflare.com/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(resp => {
          if (resp.ok) {
            var clone = resp.clone();
            caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
          }
          return resp;
        });
      })
    );
    return;
  }

  // 3) 앱 정적 파일 (.js, .css, 이미지) — Cache First
  // 파일마다 ?v=N 쿼리로 버전 무효화가 걸려 있으므로, URL이 같으면 캐시 즉시 반환.
  // 버전이 바뀌면 URL이 바뀌어 자연히 새 파일을 받음.
  if (url.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)(\?.*)?$/)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          if (resp.ok) {
            var clone = resp.clone();
            caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
          }
          return resp;
        });
      })
    );
    return;
  }

  // 4) Google Maps — 캐시하지 않음
  if (url.includes('maps.googleapis.com') || url.includes('maps.gstatic.com')) {
    return;
  }

  // 5) HTML 페이지 — Network First (항상 최신 버전 우선)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(resp => {
        if (resp.ok) {
          var clone = resp.clone();
          caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
        }
        return resp;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // 6) 그 외 — 네트워크 직접
  return;
});

// 알림 클릭 시 앱 포커스 + 딥링크 네비게이션
// notification.data = { notifType: 'new_order'|'cancel_request'|'ready_to_ship'|'shipping'|'done'|'new_quote'|..., orderId?: '...' }
// core.js 의 URL 파라미터 핸들러(notifOrder / notifType) 가 해당 메뉴로 이동
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const nData = event.notification.data || {};
  const baseUrl = self.registration.scope || './';
  let targetUrl = baseUrl;
  if (nData.notifType || nData.orderId) {
    const params = new URLSearchParams();
    if (nData.orderId) params.set('notifOrder', String(nData.orderId));
    if (nData.notifType) params.set('notifType', String(nData.notifType));
    // orderId 가 없어도 notifType 만으로 해당 메뉴 열기 (예: new_order → pending orders)
    if (!nData.orderId && nData.notifType) params.set('notifOrder', '__list__');
    targetUrl = baseUrl + '?' + params.toString();
  }
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.indexOf(baseUrl) !== -1 && 'focus' in client) {
          // 이미 열린 탭이 있으면 그쪽으로 네비게이션 후 포커스
          try { client.navigate(targetUrl); } catch(_){}
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
