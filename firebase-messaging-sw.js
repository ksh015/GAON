// 푸시 알림 수신 담당 (서비스 워커)

// 알림을 누르면 앱을 열거나 이미 열려 있으면 앞으로 가져옴
// Firebase보다 먼저 처리해야 해서 맨 위에 둠
self.addEventListener('notificationclick', function (e) {
  e.stopImmediatePropagation();
  e.notification.close();
  var data = e.notification.data || {};
  var fcm = data.FCM_MSG || {};
  var target = data.url
    || (fcm.data && fcm.data.url)
    || (fcm.fcmOptions && fcm.fcmOptions.link)
    || (fcm.notification && fcm.notification.click_action)
    || './staff/';
  var url = new URL(target, self.registration.scope).href;
  // 우리 앱 바깥 주소면 직원앱으로
  if (url.indexOf(self.registration.scope) !== 0) url = new URL('./staff/', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(new URL(url).pathname) !== -1 && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

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
