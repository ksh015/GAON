// ===== GAON 시험용 껍데기 =====
// 1) 웹앱을 화면 가득 보여주기  2) 푸시 알림 받기  3) 웹앱 대신 값 저장하기(로그인 코드 등)
(function () {
  var C = window.GAON_CONFIG;
  var KIND = window.SHELL_KIND === 'admin' ? 'admin' : 'staff';
  var APP_URL = KIND === 'admin' ? C.adminUrl : C.staffUrl;
  var KEY = 'gaon_shell_' + KIND + '_';
  var BASE = new URL('./', (document.currentScript && document.currentScript.src) || new URL('../', location.href).href).href; // .../GAON/
  var messaging = null, swReg = null, TOKEN = '';

  function $(id) { return document.getElementById(id); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(KEY + k); if (v === null) localStorage.removeItem(KEY + k); else localStorage.setItem(KEY + k, String(v)); } catch (e) { return null; } }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }

  // ---------- 1. 웹앱 표시 ----------
  var frame = $('app');
  frame.src = APP_URL;
  frame.addEventListener('load', function () {
    $('splash').classList.add('hide');
    log('웹앱 화면 불러옴');
  });
  setTimeout(function () {
    if (!$('splash').classList.contains('hide')) $('splashMsg').textContent = '불러오는 시간이 길어지고 있어요. 계속 안 열리면 아래 [시험] 버튼으로 상태를 확인해 주세요.';
  }, 15000);

  // 아이폰에서 홈 화면에 추가하지 않고 사파리로 열었을 때 안내
  if (isIOS() && !isStandalone() && store('hideIosTip') !== '1') $('iosTip').classList.add('on');
  $('iosTipClose').onclick = function () { $('iosTip').classList.remove('on'); store('hideIosTip', '1'); };

  // ---------- 2. 웹앱과 값 주고받기 (로그인 코드 저장 등) ----------
  // 웹앱이 window.top.postMessage({gaon:'get', key, id}) 로 물어보면 답해 줌
  window.addEventListener('message', function (e) {
    var okOrigin = /\.googleusercontent\.com$/.test(new URL(e.origin).hostname) || e.origin === 'https://script.google.com';
    if (!okOrigin) return;
    var m = e.data || {};
    if (!m || !m.gaon) return;
    var reply = { gaon: 'reply', id: m.id };
    if (m.gaon === 'ping') reply.value = { kind: KIND, standalone: isStandalone() };
    else if (m.gaon === 'get') reply.value = store('v_' + m.key);
    else if (m.gaon === 'set') { store('v_' + m.key, m.value); reply.value = true; }
    else if (m.gaon === 'del') { store('v_' + m.key, null); reply.value = true; }
    else if (m.gaon === 'token') reply.value = TOKEN || store('token') || '';
    else return;
    log('웹앱 요청 받음: ' + m.gaon + (m.key ? ' (' + m.key + ')' : ''));
    try { e.source.postMessage(reply, e.origin); } catch (err) {}
  });

  // ---------- 3. 푸시 ----------
  function initPush() {
    if (!('serviceWorker' in navigator)) { setStat('sw', '지원 안 함'); return Promise.resolve(); }
    return navigator.serviceWorker.register(BASE + 'firebase-messaging-sw.js', { scope: BASE }).then(function (reg) {
      swReg = reg;
      setStat('sw', '등록됨');
      log('푸시 담당 등록됨: ' + reg.scope);
      try {
        if (!firebase.apps.length) firebase.initializeApp(C.firebase);
        if (firebase.messaging.isSupported && !firebase.messaging.isSupported()) { setStat('token', '이 브라우저는 푸시 미지원'); return; }
        messaging = firebase.messaging();
        // 앱을 보고 있을 때 온 알림도 표시
        messaging.onMessage(function (p) {
          var n = p.notification || p.data || {};
          log('앱 사용 중 알림 받음: ' + (n.title || ''));
          if (swReg) swReg.showNotification(n.title || 'GAON#', { body: n.body || '', icon: BASE + 'icons/icon-192.png' });
        });
        if (Notification.permission === 'granted') return getToken();
      } catch (err) { setStat('token', '오류: ' + err.message); }
    }).catch(function (err) { setStat('sw', '실패: ' + err.message); log('푸시 담당 등록 실패: ' + err.message); });
  }

  function getToken() {
    if (!messaging) return Promise.resolve('');
    setStat('token', '발급 중...');
    return messaging.getToken({ vapidKey: C.vapidKey, serviceWorkerRegistration: swReg }).then(function (t) {
      TOKEN = t || '';
      store('token', TOKEN);
      setStat('token', TOKEN ? '발급됨' : '발급 실패');
      $('tokenBox').value = TOKEN;
      log(TOKEN ? '토큰 발급 성공' : '토큰이 비어 있음');
      return TOKEN;
    }).catch(function (err) { setStat('token', '실패: ' + err.message); log('토큰 실패: ' + err.message); return ''; });
  }

  function askPermission() {
    if (!('Notification' in window)) { alert(isIOS() ? '아이폰은 홈 화면에 추가한 앱에서만 알림을 켤 수 있어요.' : '이 브라우저는 알림을 지원하지 않아요.'); return; }
    var done = false;
    function after(p) {
      if (done) return; done = true;
      log('알림 권한 결과: ' + p);
      refreshStatus();
      if (p === 'granted') getToken();
      else alert('알림이 허용되지 않았어요(' + p + '). 폰 설정 > 앱 > GAON# > 알림을 켜 주세요.');
    }
    var r = Notification.requestPermission(after);
    if (r && r.then) r.then(after);
  }

  // ---------- 시험 패널 ----------
  function setStat(k, v) { var el = $('st_' + k); if (el) el.textContent = v; }
  function refreshStatus() {
    setStat('mode', isStandalone() ? '홈 화면 앱 (주소창 없음)' : '브라우저 (주소창 있음)');
    setStat('perm', ('Notification' in window) ? ({ granted: '허용됨', denied: '거부됨', 'default': '아직 안 물어봄' }[Notification.permission] || Notification.permission) : '지원 안 함');
    var t = false; try { localStorage.setItem(KEY + 'test', '1'); t = localStorage.getItem(KEY + 'test') === '1'; } catch (e) {}
    setStat('store', t ? '정상' : '사용 불가');
    setStat('kind', KIND === 'admin' ? '대표앱' : '직원앱');
  }
  function log(s) {
    var el = $('logBox'); if (!el) return;
    var d = new Date();
    el.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) + '  ' + s + '\n' + el.textContent;
  }

  $('testBtn').onclick = function () { refreshStatus(); $('panel').classList.add('on'); };
  $('panelClose').onclick = function () { $('panel').classList.remove('on'); };
  $('permBtn').onclick = askPermission;
  $('copyBtn').onclick = function () {
    var v = $('tokenBox').value; if (!v) { alert('아직 토큰이 없어요. [알림 허용]을 먼저 눌러 주세요.'); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { alert('토큰을 복사했어요.'); }).catch(function () { $('tokenBox').select(); document.execCommand('copy'); alert('토큰을 복사했어요.'); });
  };
  $('localBtn').onclick = function () {
    refreshStatus();
    if (!('Notification' in window)) { alert('이 브라우저는 알림을 지원하지 않아요.'); return; }
    if (Notification.permission !== 'granted') {
      alert('알림 권한이 "' + ({ denied: '거부됨', 'default': '아직 안 물어봄' }[Notification.permission] || Notification.permission) + '" 상태예요.\n' +
        (Notification.permission === 'denied' ? '폰 설정 > 앱 > GAON# > 알림을 켜 주세요.' : '[알림 허용]을 다시 눌러 주세요.'));
      return;
    }
    getReg().then(function (reg) {
      if (!reg) { alert('푸시 담당 등록에 실패했어요.\n상태: ' + $('st_sw').textContent); return; }
      return reg.showNotification('GAON# 시험 알림', { body: '이 알림이 보이면 폰 알림 표시는 정상이에요.', icon: BASE + 'icons/icon-192.png' })
        .then(function () { log('폰 자체 시험 알림 표시'); });
    }).catch(function (err) { alert('알림 표시 실패: ' + err.message); log('알림 표시 실패: ' + err.message); });
  };
  function getReg() {
    if (swReg) return Promise.resolve(swReg);
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration(BASE).then(function (r) {
      if (r) { swReg = r; return r; }
      return initPush().then(function () { return swReg; });
    });
  }
  $('reloadBtn').onclick = function () { $('panel').classList.remove('on'); $('splash').classList.remove('hide'); frame.src = APP_URL; };

  log('시작: ' + location.href);
  refreshStatus();
  if (store('token')) $('tokenBox').value = store('token');
  initPush();
})();
