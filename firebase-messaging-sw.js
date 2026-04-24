// Firebase Cloud Messaging - 백그라운드 메시지 수신 전용 Service Worker
// Firebase compat SDK v10 사용

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ── Firebase 초기화 (neothai-order 프로젝트) ─────────────────────────────────
firebase.initializeApp({
  apiKey:            "AIzaSyAo4jlDhpRZo8K8YTwismjFCWgWmHV93GQ",
  authDomain:        "neothai-order.firebaseapp.com",
  projectId:         "neothai-order",
  storageBucket:     "neothai-order.firebasestorage.app",
  messagingSenderId: "458325541072",
  appId:             "1:458325541072:web:b54d9b66b5cc68531b5ed5"
});

const messaging = firebase.messaging();

// ── 백그라운드 메시지 수신 핸들러 ────────────────────────────────────────────
messaging.onBackgroundMessage(function(payload) {
  const data  = payload.data || {};
  const title = data.title || '새 알림';
  const body  = data.body  || '';

  return self.registration.showNotification(title, {
    body:              body,
    icon:              '/icon-192.png',
    badge:             '/icon-192.png',
    tag:               (data.notifType || 'neobiotech') + '-' + Date.now(),
    requireInteraction: true,
    vibrate:           [200, 100, 200],
    data:              { orderId: data.orderId || '', notifType: data.notifType || '' }
  });
});

// ── 알림 클릭 이벤트 ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var baseUrl = 'https://neothai-order.web.app/';
  var nData = event.notification.data || {};
  var targetUrl = baseUrl;
  if (nData.orderId) {
    targetUrl = baseUrl + '?notifOrder=' + nData.orderId + '&notifType=' + (nData.notifType || '');
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(baseUrl) !== -1 && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
