// ===== GAON# 껍데기 =====
// 1) 웹앱을 화면 가득 보여주기  2) 푸시 알림 받기  3) 웹앱 대신 값 저장하기(로그인 코드)
// 4) 푸시 알림을 누르면 로그인 후 그 알림으로 이동할 수 있게 알림 번호 전달
(function () {
  var C = self.GAON_CONFIG;
  var KIND = window.SHELL_KIND === 'admin' ? 'admin' : 'staff';
  var APP_URL = KIND === 'admin' ? C.adminUrl : C.staffUrl;
  var KEY = 'gaon_shell_' + KIND + '_';
  var BASE = new URL('./', (document.currentScript && document.currentScript.src) || new URL('../', location.href).href).href; // .../GAON/
  var SNOOZE_DAYS = 3;
  var messaging = null, swReg = null, TOKEN = '', PENDING = 0;
  var APP_WIN = null, APP_ORIGIN = '';

  function $(id) { return document.getElementById(id); }
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(KEY + k);
      if (v === null) localStorage.removeItem(KEY + k); else localStorage.setItem(KEY + k, String(v));
    } catch (e) { return null; }
  }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function pushSupported() { return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window; }
  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); setTimeout(function () { el.classList.remove('on'); }, 2500); }

  // ---------- 1. 웹앱 표시 ----------
  var frame = $('app');
  function loadApp() { $('splash').classList.remove('hide'); frame.src = APP_URL; }
  function hideSplash() { $('splash').classList.add('hide'); sendEvent('splash', true); } // 앱에 '영상 걷힘' 알림 → 로고 출발
  frame.addEventListener('load', function () {
    if (window.splashWait) window.splashWait(hideSplash); else hideSplash();
  });
  setTimeout(function () {
    if (!$('splash').classList.contains('hide')) $('splashMsg').textContent = '불러오는 시간이 길어지고 있어요. 인터넷 연결을 확인해 주세요.';
  }, 15000);

  // 푸시 알림을 눌러서 열린 경우 (?n=알림번호)
  function takePending(href) {
    try {
      var sp = new URL(href, location.href).searchParams;
      var n = Number(sp.get('n') || 0);
      if (n) PENDING = n;
      var c = sp.get('close');            // 마감 푸시: 지점|날짜
      if (c) PENDING = 'close:' + c;
    } catch (e) {}
  }
  takePending(location.href);
  if (location.search) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  loadApp();

  // 아이폰에서 홈 화면에 추가하지 않고 사파리로 열었을 때 안내
  if (isIOS() && !isStandalone() && store('hideIosTip') !== '1') $('iosTip').classList.add('on');
  $('iosTipClose').onclick = function () { $('iosTip').classList.remove('on'); store('hideIosTip', '1'); };

  // ---------- 2. 웹앱과 주고받기 ----------
  function sendEvent(type, value) {
    if (!APP_WIN) return;
    try { APP_WIN.postMessage({ gaon: 'event', type: type, value: value }, APP_ORIGIN); } catch (e) {}
  }
  window.addEventListener('message', function (e) {
    var host = '';
    try { host = new URL(e.origin).hostname; } catch (err) { return; }
    if (!/\.googleusercontent\.com$/.test(host)) return;
    var m = e.data || {};
    if (!m.gaon) return;
    APP_WIN = e.source; APP_ORIGIN = e.origin;
    var reply = { gaon: 'reply', id: m.id };
    if (m.gaon === 'get') reply.value = store('v_' + m.key);
    else if (m.gaon === 'set') { store('v_' + m.key, m.value); reply.value = true; }
    else if (m.gaon === 'del') { store('v_' + m.key, null); reply.value = true; }
    else if (m.gaon === 'pending') reply.value = PENDING;
    else if (m.gaon === 'clearPending') { PENDING = 0; reply.value = true; }
    else if (m.gaon === 'token') reply.value = TOKEN || store('token') || '';
    else if (m.gaon === 'login') { reply.value = true; afterLogin(); }
    else if (m.gaon === 'askPush') { reply.value = true; openSheet(true); }
    else if (m.gaon === 'backReady') { reply.value = true; backOn(); }
    else if (m.gaon === 'back') { reply.value = true; backResult(!!m.home); }
    else if (m.gaon === 'splash') reply.value = $('splash').classList.contains('hide'); // 지금 영상이 걷혔는지
    else return;
    try { e.source.postMessage(reply, e.origin); } catch (err) {}
  });

  // 로그인되면: 알림이 켜져 있으면 토큰을 앱에 전달, 아직이면 안내창 표시
  function afterLogin() {
    if (!pushSupported()) return;
    if (Notification.permission === 'granted') {
      getToken().then(function (t) { if (t) sendEvent('token', t); });
      return;
    }
    if (Notification.permission === 'default') {
      var until = Number(store('snooze') || 0);
      if (Date.now() > until) openSheet(false);
    }
  }

  // ---------- 안드로이드 뒤로 버튼: 앱을 닫지 않고 앱 안에서 뒤로 ----------
  // 기본: 뒤로 칸(trap)을 사람이 화면을 처음 만진 뒤 한 번만 만들고, 뒤로를 누르면 '앞으로'로 그 칸에 돌아감
  // 더해서: Chrome이 CloseWatcher(뒤로 신호만 받기)를 지원하면 그것도 걸어 둠 → 되는 폰은 칸 이동 없이(깜박임 없이) 처리
  var BACK_ON = false, BACK_WAIT = null, BACK_ARM = 0, BACK_HOLD = null, CW = null, IGNORE_POP = 0;
  var HAS_CW = typeof window.CloseWatcher === 'function';
  function onTrap() { return !!(history.state && history.state.gaonBack); }
  function backTrap() { try { history.pushState({ gaonBack: 1 }, ''); } catch (e) {} }
  function whenActive(fn) { // 화면을 한 번이라도 만진 뒤에 (만지기 전에 만든 칸은 Chrome이 건너뜀)
    var ua = navigator.userActivation;
    if (!ua || ua.hasBeenActive) { fn(); return; }
    var t = setInterval(function () { if (ua.hasBeenActive) { clearInterval(t); fn(); } }, 300);
  }
  function cwArm() {
    if (!HAS_CW || CW) return;
    try { CW = new CloseWatcher(); CW.onclose = function () { CW = null; backPressed('cw'); }; } catch (e) { CW = null; }
  }
  function trapArm() {
    if (onTrap()) return;
    try { history.forward(); } catch (e) {}
    setTimeout(function () { if (!onTrap()) backTrap(); }, 400);
  }
  function backReturn() { cwArm(); trapArm(); } // 다음 뒤로 버튼도 앱이 받을 수 있게
  function backOn() {
    if (BACK_ON) return; BACK_ON = true;
    whenActive(function () { if (!onTrap()) backTrap(); cwArm(); });
  }
  function backPressed(src) {
    if (!APP_WIN) { backReturn(); return; }
    clearTimeout(BACK_HOLD); BACK_ARM = 0;
    clearTimeout(BACK_WAIT);
    BACK_WAIT = setTimeout(function () { backResult(false); }, 1500); // 앱 답이 늦으면 앱 안에서 뒤로 간 걸로 봄
    sendEvent('back', 1);
  }
  window.addEventListener('popstate', function () {
    if (!BACK_ON) return;
    if (IGNORE_POP) { IGNORE_POP = 0; return; } // 홈에서 일부러 칸 밖으로 나온 것
    if (onTrap()) return; // '앞으로'로 뒤로 칸에 돌아온 것
    backPressed('hist');
  });
  function backResult(home) {
    if (!BACK_WAIT) return;
    clearTimeout(BACK_WAIT); BACK_WAIT = null;
    if (!home) { backReturn(); return; }
    // 홈: 안내 → 2초 동안 뒤로를 받지 않음(칸 밖 · 신호 끔) → 그 사이 한 번 더 누르면 앱이 닫힘
    BACK_ARM = Date.now(); toast('뒤로 버튼을 한 번 더 누르면 앱이 닫혀요');
    if (CW) { try { CW.onclose = null; CW.destroy(); } catch (e) {} CW = null; }
    if (onTrap()) { IGNORE_POP = 1; try { history.back(); } catch (e) { IGNORE_POP = 0; } }
    clearTimeout(BACK_HOLD);
    BACK_HOLD = setTimeout(function () { BACK_ARM = 0; backReturn(); }, 2000);
  }

  // ---------- 3. 푸시 ----------
  function initPush() {
    if (!('serviceWorker' in navigator)) return Promise.resolve();
    navigator.serviceWorker.addEventListener('message', function (e) {
      var m = e.data || {};
      if (m.gaon === 'open') { takePending(m.url); loadApp(); }
    });
    return navigator.serviceWorker.register(BASE + 'firebase-messaging-sw.js', { scope: BASE }).then(function (reg) {
      swReg = reg;
      try {
        if (!firebase.apps.length) firebase.initializeApp(C.firebase);
        messaging = firebase.messaging();
        // 앱을 보고 있을 때 온 알림도 표시
        messaging.onMessage(function (p) {
          var n = p.notification || {};
          var d = p.data || {};
          swReg.showNotification(n.title || 'GAON#', {
            body: n.body || '',
            icon: BASE + 'icons/icon-192.png',
            badge: BASE + 'icons/badge-96.png',
            data: { url: d.url || '' }
          });
        });
      } catch (err) { console.log('푸시 준비 실패', err); }
    }).catch(function (err) { console.log('서비스 워커 등록 실패', err); });
  }
  var ready = initPush();

  function getToken() {
    return ready.then(function () {
      if (!messaging || !swReg) return '';
      return messaging.getToken({ vapidKey: C.vapidKey, serviceWorkerRegistration: swReg }).then(function (t) {
        TOKEN = t || ''; store('token', TOKEN); return TOKEN;
      });
    }).catch(function (err) { console.log('토큰 실패', err); return ''; });
  }

  // ---------- 알림 켜기 안내창 ----------
  function openSheet(fromSettings) {
    var msg = $('pushMsg'), btn = $('pushOn');
    btn.style.display = '';
    if (!pushSupported()) {
      msg.innerHTML = isIOS()
        ? '아이폰은 <b>사파리 → 공유 버튼 → 홈 화면에 추가</b>로 설치한 GAON# 앱에서만 알림을 받을 수 있어요.'
        : '이 브라우저는 알림을 지원하지 않아요. 크롬에서 <b>앱 설치</b> 후 사용해 주세요.';
      btn.style.display = 'none';
    } else if (Notification.permission === 'denied') {
      msg.innerHTML = '알림이 꺼져 있어요.<br>' + (isIOS()
        ? '<b>설정 → 알림 → GAON#</b>에서 알림을 켜 주세요.'
        : '<b>설정 → 애플리케이션 → GAON#(또는 Chrome) → 알림</b>에서 켜 주세요.');
      btn.style.display = 'none';
    } else if (Notification.permission === 'granted') {
      if (fromSettings) {
        getToken().then(function (t) { if (t) { sendEvent('token', t); toast('알림이 켜져 있어요 ✓'); } else toast('알림 연결에 실패했어요. 앱을 다시 열어 주세요.'); });
      }
      return;
    } else {
      msg.innerHTML = '연차 승인, 공지, 포상 알림을<br>폰으로 바로 받을 수 있어요.';
    }
    $('pushSheet').classList.add('on');
  }
  function closeSheet() { $('pushSheet').classList.remove('on'); }

  $('pushOn').onclick = function () {
    var btn = this; btn.disabled = true; btn.textContent = '켜는 중...';
    var done = false;
    function after(p) {
      if (done) return; done = true;
      btn.disabled = false; btn.textContent = '알림 켜기';
      if (p !== 'granted') { openSheet(true); return; }
      closeSheet();
      getToken().then(function (t) {
        if (t) { sendEvent('token', t); toast('알림이 켜졌어요 ✓'); }
        else toast('알림 연결에 실패했어요. 앱을 다시 열어 주세요.');
      });
    }
    try {
      var r = Notification.requestPermission(after);
      if (r && r.then) r.then(after);
    } catch (e) { after(Notification.permission); }
  };
  $('pushLater').onclick = function () {
    store('snooze', Date.now() + SNOOZE_DAYS * 86400000);
    closeSheet();
  };
})();
