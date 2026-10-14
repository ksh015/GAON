// 푸시 알림 수신 담당 (서비스 워커)
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
importScripts('./config.js');

firebase.initializeApp(self.GAON_CONFIG.firebase);
const messaging = firebase.messaging();

// 데이터만 있는 메시지는 직접 알림으로 표시
// (notification 항목이 있는 메시지는 Firebase가 자동으로 표시)
messaging.onBackgroundMessage(function (payload) {
  if (payload.notification) return;
  const d = payload.data || {};
  return self.registration.showNotification(d.title || 'GAON#', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: d.url || '' }
  });
});

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

// 알림을 누르면 앱을 열거나 이미 열려 있으면 앞으로 가져옴
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  const data = (e.notification.data || {});
  const fcm = data.FCM_MSG || {};
  const target = data.url || (fcm.data && fcm.data.url) || './staff/';
  const url = new URL(target, self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const c of list) {
        if (c.url.indexOf(new URL(url).pathname) !== -1 && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
