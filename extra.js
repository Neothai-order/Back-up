// Neo Sales App - FCM, Notifications, Announcements (auto-separated)
// ── 위탁 마스터 업로드 (관리자) ────────────────────────────────────────────
// 증분 업로드: 기존 문서와 내용 비교 → 변경된 것만 write, 사라진 것은 tombstone
function _csRowSameDoc(a, b) {
  if (!a || !b) return false;
  return String(a.d || '') === String(b.d || '') &&
         String(a.b || '') === String(b.b || '') &&
         String(a.c || '') === String(b.c || '') &&
         String(a.s || '') === String(b.s || '') &&
         String(a.n || '') === String(b.n || '') &&
         String(a.p || '') === String(b.p || '') &&
         String(a.pn || '') === String(b.pn || '') &&
         (Number(a.q) || 1) === (Number(b.q) || 1) &&
         String(a.st || 'BORROW') === String(b.st || 'BORROW');
}
async function uploadConsignMaster() {
  var fileInput = document.getElementById('csUploadFile');
  var prog = document.getElementById('csUploadProgress');
  if (!fileInput.files.length) { neoAlert(t('cs_upload_select')); return; }
  var file = fileInput.files[0];
  prog.textContent = t('cs_upload_reading');
  try {
    var text = await file.text();
    var rows = JSON.parse(text);
    if (!Array.isArray(rows) || !rows.length) { neoAlert(t('cs_upload_no_data')); return; }
    var total = rows.length;
    prog.textContent = t('cs_upload_start').replace('{n}', total.toLocaleString());

    // 0) 기존 문서 전체 로드 (변경분 판정용)
    var existingSnap = await _fbDb.collection('consignment_master').get();
    var existing = {};
    existingSnap.forEach(function(doc) { existing[doc.id] = doc.data(); });

    // 1) 새 docId 집합 구성 + diff
    var FV = firebase.firestore.FieldValue;
    var newDocIds = {};
    var toWrite = []; // [{id, data}]
    rows.forEach(function(r, idx) {
      var docId = (r.b || 'BR') + '_' + (r.p || 'P') + '_' + idx;
      newDocIds[docId] = true;
      var candidate = {
        d: r.d || '', b: r.b || '', c: r.c || '', s: r.s || '',
        n: r.n || '', p: r.p || '', pn: r.pn || '', q: r.q || 1,
        st: r.st || 'BORROW'
      };
      var prev = existing[docId];
      if (!prev || !_csRowSameDoc(prev, candidate)) {
        toWrite.push({ id: docId, data: candidate });
      }
    });
    // 2) 삭제 대상: 기존에 있었는데 새 업로드에 없는 docId
    var toDelete = [];
    Object.keys(existing).forEach(function(id) {
      if (!newDocIds[id]) toDelete.push({ id: id, data: existing[id] });
    });

    console.log('[CS upload] total=' + total + ' toWrite=' + toWrite.length + ' toDelete=' + toDelete.length);

    // 3) 변경 문서 write (배치 450)
    var done = 0;
    for (var i = 0; i < toWrite.length; i += 450) {
      var batch = _fbDb.batch();
      toWrite.slice(i, i + 450).forEach(function(w) {
        var ref = _fbDb.collection('consignment_master').doc(w.id);
        var payload = Object.assign({}, w.data, { updated_at: FV.serverTimestamp() });
        batch.set(ref, payload);
      });
      await batch.commit();
      done += Math.min(450, toWrite.length - i);
      prog.textContent = t('cs_upload_progress').replace('{done}', done.toLocaleString()).replace('{total}', toWrite.length.toLocaleString()).replace('{pct}', Math.round(done/Math.max(1,toWrite.length)*100));
    }
    // 4) 삭제 + tombstone 기록 (배치 225 — 1 delete + 1 tombstone = 2 ops)
    for (var di = 0; di < toDelete.length; di += 225) {
      var delBatch = _fbDb.batch();
      toDelete.slice(di, di + 225).forEach(function(d) {
        delBatch.delete(_fbDb.collection('consignment_master').doc(d.id));
        delBatch.set(_fbDb.collection('consignment_deletions').doc(d.id), {
          id: d.id,
          b: d.data.b || '', p: d.data.p || '',
          deleted_at: FV.serverTimestamp()
        });
      });
      await delBatch.commit();
    }

    prog.textContent = '✅ 변경 ' + toWrite.length.toLocaleString() + '건 · 삭제 ' + toDelete.length.toLocaleString() + '건 · 유지 ' + (total - toWrite.length).toLocaleString() + '건';
    neoAlert('위탁 마스터 동기화 완료\n변경 ' + toWrite.length + '건 / 삭제 ' + toDelete.length + '건 / 유지 ' + (total - toWrite.length) + '건');
    // 메타 버전 bump — 다른 클라이언트들이 캐시 MISS 감지
    try { if (typeof _csBumpMeta === 'function') await _csBumpMeta(); } catch(e) {}
    _csDataLoaded = false;
    loadConsignStatusData(true);
  } catch(e) {
    console.error('[uploadConsignMaster]', e);
    prog.textContent = '❌ ' + t('cs_upload_fail') + e.message;
    neoAlert(t('cs_upload_fail') + e.message);
  }
}

// ── 관리자 유틸: 기존 consignment_master 에 updated_at 일괄 기록 (1회 실행) ──
window._csBackfillUpdatedAt = async function() {
  if (!_fbDb) { console.error('no _fbDb'); return; }
  var snap = await _fbDb.collection('consignment_master').get();
  console.log('[CS backfill] total', snap.size);
  var FV = firebase.firestore.FieldValue;
  var updated = 0;
  for (var i = 0; i < snap.docs.length; i += 450) {
    var batch = _fbDb.batch();
    snap.docs.slice(i, i + 450).forEach(function(doc) {
      batch.update(doc.ref, { updated_at: FV.serverTimestamp() });
    });
    await batch.commit();
    updated += Math.min(450, snap.size - i);
    console.log('[CS backfill] progress', updated, '/', snap.size);
  }
  if (typeof _csBumpMeta === 'function') await _csBumpMeta();
  console.log('[CS backfill] done:', updated);
  return updated;
};

// ── 위탁 현황 엑셀 다운로드 ─────────────────────────────────────────────────
function downloadConsignExcel() {
  if (!_csFiltered.length) { showToast(t('cs_dl_empty')); return; }
  var headers = [t('cs_th_date'), t('cs_th_br'), t('cs_th_cust_code'), t('cs_th_cust_name'), t('cs_th_sales'), t('cs_th_prod_code'), t('cs_th_prod_name'), t('cs_th_qty'), t('cs_th_status')];
  var rows = [headers];
  _csFiltered.forEach(function(r) {
    rows.push([
      r.d || '', r.b || '', r.c || '', r.n || '', r.s || '',
      r.p || '', r.pn || '', r.q || 1,
      r.st === 'BORROW' ? t('cs_badge_unsettled') : t('cs_badge_settled')
    ]);
  });
  var csv = rows.map(function(row) {
    return row.map(function(v) {
      return '"' + String(v).replace(/"/g, '""') + '"';
    }).join(',');
  }).join('\n');
  var bom = '\uFEFF';
  var blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '위탁출고현황_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── FCM 토큰 등록 ────────────────────────────────────────────────────────────
let _fcmMessaging = null;

async function registerFCMToken() {
  try {
    if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') return;
    const user = getCurrentUser();
    if (!user || user.dept !== 'Office') return;

    if (!_fcmMessaging) {
      _fcmMessaging = firebase.messaging();
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const token = await _fcmMessaging.getToken({ vapidKey: FIREBASE_VAPID_KEY });
    if (!token) return;

    await apiPost({ action: 'save_fcm_token', empid: user.empid, token: token });
    console.log('[FCM] 토큰 등록 완료');

    // 포그라운드 FCM 메시지 수신 → 브라우저 알림 표시
    _fcmMessaging.onMessage(function(payload) {
      var data = payload.data || {};
      var title = data.title || '새 알림';
      var body = data.body || '';
      sendNotification(title, body, null, (data.notifType || 'fcm') + '-' + Date.now(), { notifType: data.notifType || '', orderId: data.orderId || '' });
    });
  } catch (e) {
    console.warn('[FCM] 토큰 등록 실패:', e);
  }
}

// ── 알림 시스템 ────────────────────────────────────────────────────────────────
let _prevPendingCount = -1;
let _prevDeliveryCount = -1;
let _prevCancelReqCount = -1;

function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendNotification(title, body, icon, tag, data) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  // data: { notifType?: string, orderId?: string } — SW notificationclick 핸들러가 딥링크로 사용
  var ndata = data && typeof data === 'object' ? data : {};
  var opts = {
    body:              body,
    icon:              icon || '/icon-192.png',
    badge:             icon || '/icon-192.png',
    tag:               tag || 'neobiotech-order',
    requireInteraction: false,
    vibrate:           [200, 100, 200],
    data:              { notifType: ndata.notifType || '', orderId: ndata.orderId || '' }
  };
  // 폴백 클릭 핸들러 (Service Worker 미사용 경로)
  function _fallbackClick(n) {
    try {
      n.onclick = function() {
        try {
          window.focus();
          var p = new URLSearchParams();
          if (opts.data.orderId) p.set('notifOrder', opts.data.orderId);
          if (opts.data.notifType) p.set('notifType', opts.data.notifType);
          var qs = p.toString();
          if (qs) {
            // 현재 페이지에 단순히 딥링크 핸들러 호출 (reload 없이)
            try {
              if (typeof _handleNotifDeepLink === 'function') _handleNotifDeepLink(opts.data.orderId, opts.data.notifType);
              else window.location.search = '?' + qs;
            } catch(_) { window.location.search = '?' + qs; }
          }
        } catch(_){}
        n.close();
      };
    } catch(_){}
  }
  // Chrome은 Service Worker가 있으면 new Notification()을 무음 차단 →
  // serviceWorker.showNotification() 을 우선 사용
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(function(reg) {
      return reg.showNotification(title, opts);
    }).catch(function() {
      // SW 준비 안 됐을 때 폴백
      try { var n = new Notification(title, opts); _fallbackClick(n); setTimeout(function(){ n.close(); }, 6000); } catch(e2) {}
    });
  } else {
    try {
      var n = new Notification(title, opts);
      _fallbackClick(n);
      setTimeout(function() { n.close(); }, 6000);
    } catch(e) { console.warn('[Notification] 오류:', e); }
  }
}

function testNotification() {
  if (!('Notification' in window)) {
    neoAlert('이 브라우저는 알림을 지원하지 않습니다.');
    return;
  }
  if (Notification.permission === 'denied') {
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) {
      neoAlert('알림이 차단되어 있습니다.\n\n해제 방법:\nChrome 브라우저에서 neothai-order.web.app 접속\n→ 주소창 왼쪽 자물쇠(🔒)\n→ 알림 → 허용\n→ 앱 재실행');
    } else {
      neoAlert('알림이 차단되어 있습니다.\n주소창 왼쪽 자물쇠(🔒) → 알림 → 허용 으로 변경해 주세요.');
    }
    return;
  }
  if (Notification.permission !== 'granted') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') testNotification();
      else neoAlert('알림 권한이 거부되었습니다.');
    });
    return;
  }
  sendNotification('📦 Test Notification', 'NeoBiotech Order App — Notifications are working correctly.');
}

function updateAppBadge(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) navigator.setAppBadge(count).catch(()=>{});
    else navigator.clearAppBadge().catch(()=>{});
  }
}

// ── 앱 아이콘 점멸 시스템 ──────────────────────────────────────────────────
var _blinkInterval = null;
var _blinkState = false;
var _blinkFaviconOrig = null;
var _blinkFaviconAlert = null;
var _blinkTitleOrig = 'Neo Sales App';
var _blinkAlertCount = 0;
var _blinkChatCount = 0;

function _initBlinkFavicon() {
  // 기존 favicon 확인 또는 생성
  var link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    document.head.appendChild(link);
  }
  // 기본 아이콘 (16x16 캔버스 - 파란색 N)
  var c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#1e40af'; ctx.beginPath(); ctx.arc(16,16,16,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', 16, 17);
  _blinkFaviconOrig = c.toDataURL('image/png');
  // 알림 아이콘 (빨간 점 추가)
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(26,6,8,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  _blinkFaviconAlert = c.toDataURL('image/png');
  link.href = _blinkFaviconOrig;
}

function _startBlink() {
  if (_blinkInterval) return;
  _blinkTitleOrig = document.title;
  _blinkState = false;
  _blinkInterval = setInterval(function() {
    _blinkState = !_blinkState;
    var link = document.querySelector('link[rel="icon"]');
    if (link) link.href = _blinkState ? _blinkFaviconAlert : _blinkFaviconOrig;
    // 탭 타이틀도 번갈아 표시
    var total = _blinkAlertCount + _blinkChatCount;
    if (_blinkState && total > 0) {
      var msgs = [];
      if (_blinkAlertCount > 0) msgs.push('승인 ' + _blinkAlertCount);
      if (_blinkChatCount > 0) msgs.push('메시지 ' + _blinkChatCount);
      document.title = '🔔 ' + msgs.join(' · ') + ' — Neo Sales App';
    } else {
      document.title = _blinkTitleOrig || 'Neo Sales App';
    }
  }, 1000);
}

function _stopBlink() {
  if (_blinkInterval) { clearInterval(_blinkInterval); _blinkInterval = null; }
  var link = document.querySelector('link[rel="icon"]');
  if (link && _blinkFaviconOrig) link.href = _blinkFaviconOrig;
  document.title = _blinkTitleOrig || 'Neo Sales App';
}

function _updateBlink() {
  var total = _blinkAlertCount + _blinkChatCount;
  if (total > 0 && !document.hasFocus()) _startBlink();
  else _stopBlink();
}

// 탭 포커스 시 점멸 중지
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) _stopBlink();
});
window.addEventListener('focus', function() { _stopBlink(); });

// 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initBlinkFavicon);
} else {
  _initBlinkFavicon();
}

function updateBadgeCount(count) {
  var badge = document.getElementById('pendingBadge');
  if (badge) {
    if (count > 0) { badge.textContent = count; badge.style.display = 'inline-block'; }
    else { badge.style.display = 'none'; }
  }
  // 주문 상단 뱃지 동기화
  var orderBadge = document.getElementById('orderBadge');
  if (orderBadge) { orderBadge.textContent = count; }
  var orderTopBadgeOrder = document.getElementById('orderTopBadgeOrder');
  if (orderTopBadgeOrder) {
    if (count > 0) { orderTopBadgeOrder.textContent = count; orderTopBadgeOrder.style.display = 'inline-block'; }
    else { orderTopBadgeOrder.style.display = 'none'; }
  }
  // 모바일 카드 배지 동기화
  var mobBadge = document.getElementById('mobPendingBadge');
  var mobDot   = document.getElementById('mobNavPendingDot');
  if (mobBadge) { if (count > 0) { mobBadge.textContent = count; mobBadge.style.display = 'inline-block'; } else { mobBadge.style.display = 'none'; } }
  if (mobDot)   { mobDot.style.display = count > 0 ? 'block' : 'none'; }
  // 모바일 주문>상품주문 서브카테고리 배지
  var mobOrdCatBadge = document.getElementById('mobOrderCatOrderBadge');
  if (mobOrdCatBadge) { if (count > 0) { mobOrdCatBadge.textContent = count; mobOrdCatBadge.classList.add('show'); } else { mobOrdCatBadge.classList.remove('show'); } }
  // 모바일 주문 카테고리 배지 (총합)
  window._orderPendingCount = count;
  _updateMobOrderCatBadge();

  _prevPendingCount = count;
  updateAppBadge(count + Math.max(0, _prevDeliveryCount));
  // 승인 요청 점멸
  _blinkAlertCount = count;
  _updateBlink();
}

async function updatePendingBadge() {
  try {
    const data    = await apiGet({ status: ['pending', 'cancel_requested'] });
    const me      = getCurrentUser();
    const myStr   = me ? me.name + ' (' + me.dept + ')' : null;
    const isOffice = me && me.dept === 'Office';
    const allOrders = data.orders || [];
    const orders  = isOffice ? allOrders : allOrders.filter(o => myStr && o.user === myStr);
    const pendingOnly  = orders.filter(o => o.status === 'pending').length;
    const cancelCount  = orders.filter(o => o.status === 'cancel_requested').length;
    const totalCount   = pendingOnly + cancelCount;

    // ★ 이전 값을 비교 전에 미리 저장
    const oldPendingOnly  = _prevPendingCount  >= 0 ? (_prevPendingCount - Math.max(0, _prevCancelReqCount)) : -1;
    const oldCancelCount  = _prevCancelReqCount >= 0 ? _prevCancelReqCount : -1;

    updateBadgeCount(totalCount);       // _prevPendingCount = totalCount 로 갱신됨
    _prevCancelReqCount = cancelCount;  // 취소 카운터 갱신

    const _notifyUser  = getCurrentUser();
    const isOfficeUser = _notifyUser && _notifyUser.dept === 'Office';

    // 신규 일반 주문 알림
    if (isOfficeUser && oldPendingOnly >= 0 && pendingOnly > oldPendingOnly) {
      const shipCount = Math.max(0, _prevDeliveryCount);
      sendNotification(
        '📦 New Order +' + (pendingOnly - oldPendingOnly),
        'Pending: ' + pendingOnly + ' order(s)  |  Ready to Ship: ' + shipCount + ' order(s)',
        null, null, { notifType: 'new_order' }
      );
    }

    // 신규 취소 요청 알림
    if (isOfficeUser && oldCancelCount >= 0 && cancelCount > oldCancelCount) {
      sendNotification(
        '🚫 Cancel Request +' + (cancelCount - oldCancelCount),
        'Pending: ' + pendingOnly + ' order(s)  |  Cancel Requests: ' + cancelCount,
        null, null, { notifType: 'cancel_request' }
      );
    }
  } catch(e) {}
}

// ══════════════════════════════════════════════════════
// 앱 내 알림 시스템
// ══════════════════════════════════════════════════════
var _notifPanelOpen = false;

// 알림 생성 (Firestore에 저장)
async function createNotification(toEmpid, type, title, message, orderId) {
  try {
    var id = 'N' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    await _fbDb.collection('notifications').doc(id).set({
      id: id,
      to: toEmpid,
      type: type,
      title: title,
      message: message,
      orderId: orderId || '',
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e) { console.warn('[Notif] 생성 실패:', e.message); }
}

// 주문자 empid 추출 (주문의 user 필드에서)
function _extractEmpidFromOrder(order) {
  // user 형식: "Kim (Office)" → accounts에서 name 매칭
  // 또는 직접 empid 필드가 있을 수 있음
  if (order.empid) return order.empid;
  if (order.user_empid) return order.user_empid;
  // user 문자열에서 추출 불가 → null
  return null;
}

// 알림 목록 로드
async function loadNotifications() {
  var me = getCurrentUser();
  if (!me) return [];
  try {
    var snap = await _fbDb.collection('notifications')
      .where('to', '==', me.empid)
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();
    return snap.docs.map(function(d) { return d.data(); });
  } catch(e) {
    // 인덱스 없을 경우 전체 로드 후 필터
    try {
      var snap2 = await _fbDb.collection('notifications').get();
      return snap2.docs.map(function(d) { return d.data(); })
        .filter(function(n) { return n.to === me.empid; })
        .sort(function(a, b) { return (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0); })
        .slice(0, 30);
    } catch(e2) { return []; }
  }
}

// 알림 배지 업데이트
async function updateNotifBadge() {
  var notifs = await loadNotifications();
  var unread = notifs.filter(function(n) { return !n.read; }).length;
  var badge = document.getElementById('notifBadge');
  if (badge) {
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }
  return notifs;
}

// 알림 패널 토글
function toggleNotifPanel() {
  var panel = document.getElementById('notifPanel');
  _notifPanelOpen = !_notifPanelOpen;
  if (_notifPanelOpen) {
    panel.style.display = 'block';
    // 기본 탭: 공지사항
    document.querySelectorAll('.notif-tab-btn').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === 'announce');
    });
    _renderAnnounceList();
  } else {
    panel.style.display = 'none';
  }
}

// 패널 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
  if (_notifPanelOpen && !e.target.closest('.notif-bell-wrap')) {
    document.getElementById('notifPanel').style.display = 'none';
    _notifPanelOpen = false;
  }
});

// 알림 목록 렌더
async function renderNotifList() {
  var list = document.getElementById('notifList');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;">로딩...</div>';
  var notifs = await loadNotifications();
  if (!notifs.length) {
    list.innerHTML = '<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px;">알림이 없습니다</div>';
    return;
  }
  var clearBtn = document.getElementById('notifClearAllBtn');
  if (clearBtn) clearBtn.style.display = notifs.length ? '' : 'none';
  var html = '';
  notifs.forEach(function(n) {
    var icon = n.type === 'cancelled' ? '❌' : n.type === 'done' ? '✅' : n.type === 'shipping' ? '🚚' : '📦';
    var bg = n.read ? '#fff' : '#eff6ff';
    var ts = n.createdAt ? new Date(n.createdAt.seconds * 1000) : new Date();
    var timeStr = ts.toLocaleDateString('ko-KR') + ' ' + ts.toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'});
    html += '<div style="padding:12px 16px;border-bottom:1px solid #f3f4f6;background:' + bg + ';cursor:pointer;transition:background .15s;display:flex;align-items:center;gap:8px;" onmouseover="this.style.background=\'#f0f9ff\'" onmouseout="this.style.background=\'' + bg + '\'">' +
      '<div onclick="onNotifClick(\'' + n.id + '\',\'' + (n.orderId || '') + '\',\'' + (n.type || '') + '\')" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">' +
      '<span style="font-size:16px;">' + icon + '</span>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-size:13px;font-weight:' + (n.read ? '400' : '700') + ';color:#111827;">' + (window.escHtml ? escHtml(n.title || '') : (n.title || '')) + '</div>' +
      '<div style="font-size:12px;color:#6b7280;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (window.escHtml ? escHtml(n.message || '') : (n.message || '')) + '</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-top:3px;">' + timeStr + '</div>' +
      '</div>' +
      (n.read ? '' : '<span style="width:8px;height:8px;border-radius:50%;background:#2563eb;flex-shrink:0;"></span>') +
      '</div>' +
      '<button class="notif-del-btn" onclick="event.stopPropagation();deleteNotif(\'' + n.id + '\')" title="삭제">&#x2715;</button>' +
      '</div>';
  });
  list.innerHTML = html;
}

// 알림 클릭 → 읽음 처리 + 주문 상세로 이동
var _notifNavigateOrderId = null;
var _notifNavigateType = null;

async function onNotifClick(notifId, orderId, type) {
  // 읽음 처리
  try {
    await _fbDb.collection('notifications').doc(notifId).update({ read: true });
  } catch(e) {}
  updateNotifBadge();

  // orderId가 있으면 해당 주문으로 이동
  if (orderId) {
    _notifNavigateOrderId = String(orderId);
    _notifNavigateType = type;
    // 알림 패널 닫기
    var notifPanel = document.getElementById('notifPanel');
    if (notifPanel) notifPanel.style.display = 'none';

    if (type === 'shipping') {
      // 발송 대기(delivery) 모달 열기
      openDeliveryOrders();
    } else if (type === 'done' || type === 'delivered') {
      // 발송 완료(shipped) 모달 열기
      openShippedOrders();
    } else {
      // cancelled 등 → 주문 현황(pending) 모달 열기
      openPendingOrders();
    }
  } else {
    renderNotifList();
  }
}

// 단건 읽음 처리 (하위 호환용)
async function markNotifRead(notifId) {
  try {
    await _fbDb.collection('notifications').doc(notifId).update({ read: true });
  } catch(e) {}
  renderNotifList();
  updateNotifBadge();
}

// 전체 읽음 처리
async function markAllNotifsRead() {
  var me = getCurrentUser();
  if (!me) return;
  var notifs = await loadNotifications();
  var batch = _fbDb.batch();
  var count = 0;
  notifs.filter(function(n){ return !n.read; }).forEach(function(n) {
    batch.update(_fbDb.collection('notifications').doc(n.id), { read: true });
    count++;
  });
  if (count > 0) await batch.commit();
  renderNotifList();
  updateNotifBadge();
}

async function deleteNotif(notifId) {
  try {
    await _fbDb.collection('notifications').doc(notifId).delete();
  } catch(e) {}
  renderNotifList();
  updateNotifBadge();
}

async function clearAllNotifs() {
  var me = getCurrentUser();
  if (!me) return;
  if (!confirm(t('noti_clear_confirm') || '모든 알림을 삭제하시겠습니까?')) return;
  var notifs = await loadNotifications();
  var batch = _fbDb.batch();
  notifs.forEach(function(n) {
    batch.delete(_fbDb.collection('notifications').doc(n.id));
  });
  if (notifs.length > 0) await batch.commit();
  renderNotifList();
  updateNotifBadge();
}

// 페이지 로드 + 실시간 배지 갱신 (onSnapshot, 필터 분리)
var _realtimeUnsubs = [];
function _stopRealtimeBadges() {
  _realtimeUnsubs.forEach(function(fn) { try { fn(); } catch(e){} });
  _realtimeUnsubs = [];
}
function _startRealtimeBadges() {
  _stopRealtimeBadges();
  var me = getCurrentUser();
  if (!me) return;
  var myStr = me.name + ' (' + me.dept + ')';
  var meDeptLower = (me.dept || '').toLowerCase();
  var isOffice = meDeptLower === 'office';
  var isAdmin = _isAdmin(me);

  // 1-a) orders pending+cancel_requested → 주문 승인 배지
  // 관리자/Office: 전체, 그 외: 본인 문서만 서버에서 필터 (읽기 수 대폭 감소)
  // 영업(Sales) 부서는 직위 무관 항상 본인 스코프 — 배지는 본인 알림 전용
  // (팀장의 팀 전체 보기는 Summary 등 분석 화면에만 적용)
  var _scopedForOrders = (me.dept === 'Sales') || ((typeof _isScopedUser === 'function') && _isScopedUser(me));
  var _ordersPendingQuery = _fbDb.collection('orders').where('status','in',['pending','cancel_requested']);
  if (_scopedForOrders && myStr) {
    _ordersPendingQuery = _ordersPendingQuery.where('user', '==', myStr);
  }
  _realtimeUnsubs.push(
    _ordersPendingQuery.onSnapshot(function(snap) {
      var docs = snap.docs.map(function(d) { return d.data(); });
      // 서버에서 이미 필터됨 → 클라이언트 재필터 불필요
      var pendingOnly = docs.filter(function(o){ return o.status === 'pending'; }).length;
      var cancelCount = docs.filter(function(o){ return o.status === 'cancel_requested'; }).length;
      var totalPending = pendingOnly + cancelCount;
      var oldPendingOnly = _prevPendingCount >= 0 ? (_prevPendingCount - Math.max(0, _prevCancelReqCount)) : -1;
      updateBadgeCount(totalPending);
      _prevCancelReqCount = cancelCount;
      // 알림
      if (isOffice && oldPendingOnly >= 0 && pendingOnly > oldPendingOnly) {
        var shipCount = Math.max(0, _prevDeliveryCount);
        sendNotification('📦 New Order +' + (pendingOnly - oldPendingOnly), 'Pending: ' + pendingOnly + ' | Ready to Ship: ' + shipCount);
      }
    })
  );

  // 1-b) orders shipping → 발송 대기 배지
  var _ordersShipQuery = _fbDb.collection('orders').where('status','==','shipping');
  if (_scopedForOrders && myStr) {
    _ordersShipQuery = _ordersShipQuery.where('user', '==', myStr);
  }
  _realtimeUnsubs.push(
    _ordersShipQuery.onSnapshot(function(snap) {
      updateDeliveryBadgeCount(snap.size);
    })
  );

  // 2) quotes pending → 견적 배지
  // 관리자/Office: 전체, 그 외(Sales 포함): 본인이 올린 건만
  _realtimeUnsubs.push(
    _fbDb.collection('quotes').where('status','==','pending').onSnapshot(function(snap) {
      var docs = snap.docs.map(function(d) { var q = d.data(); q._id = d.id; return q; });
      var pendingCount = docs.length;
      var _scopedQ = (me.dept === 'Sales') || ((typeof _isScopedUser === 'function') && _isScopedUser(me));
      if (_scopedQ) {
        pendingCount = docs.filter(function(q) {
          var by = (q.requested_by || q.created_by || q.submitted_by || '').toLowerCase();
          var byName = (q.requested_by_name || q.sales || '').toLowerCase();
          if (me.empid && by.indexOf(me.empid.toLowerCase()) > -1) return true;
          if (me.nickname && (by.indexOf(me.nickname.toLowerCase()) > -1 || byName.indexOf(me.nickname.toLowerCase()) > -1)) return true;
          if (me.name && (by.indexOf(me.name.toLowerCase()) > -1 || byName.indexOf(me.name.toLowerCase()) > -1)) return true;
          return false;
        }).length;
      }
      var ddBadge = document.getElementById('quotePendingBadge');
      if (ddBadge) { if (pendingCount > 0) { ddBadge.textContent = pendingCount; ddBadge.style.display = 'inline-block'; } else { ddBadge.style.display = 'none'; } }
      var mobQtBadge = document.getElementById('mobQuotePendingBadge');
      if (mobQtBadge) { if (pendingCount > 0) { mobQtBadge.textContent = pendingCount; mobQtBadge.style.display = 'inline-block'; } else { mobQtBadge.style.display = 'none'; } }
      var otbq = document.getElementById('orderTopBadgeQuote');
      if (otbq) { if (pendingCount > 0) { otbq.textContent = pendingCount; otbq.style.display = 'inline-block'; } else { otbq.style.display = 'none'; } }
      window._quotePendingCount = pendingCount;
      _updateMobOrderCatBadge();
    })
  );

  // 3) pendingCustomers → 고객 승인 배지
  // 관리자/Office: 전체, 그 외(Sales 포함): 본인이 올린 건만 (서버 필터)
  // 영업(Sales) 부서는 직위 무관 항상 본인 스코프 — 배지는 본인 알림 전용
  var _scopedUser = (me.dept === 'Sales') || ((typeof _isScopedUser === 'function') && _isScopedUser(me));
  if (_scopedUser && me.empid) {
    // 서버 필터 쿼리 2개 (created_by 또는 reg_by)
    var _pcA = _fbDb.collection('pendingCustomers').where('status','==','Pending').where('created_by','==', me.empid);
    var _pcB = _fbDb.collection('pendingCustomers').where('status','==','Pending').where('reg_by','==', me.empid);
    var _pcASize = 0, _pcBSet = {}, _pcASet = {};
    _realtimeUnsubs.push(
      _pcA.onSnapshot(function(snap){
        _pcASet = {};
        snap.docs.forEach(function(d){ _pcASet[d.id] = true; });
        // 합산
        var total = {};
        Object.keys(_pcASet).forEach(function(k){ total[k] = true; });
        Object.keys(_pcBSet).forEach(function(k){ total[k] = true; });
        updatePendCustBadge(Object.keys(total).length);
      })
    );
    _realtimeUnsubs.push(
      _pcB.onSnapshot(function(snap){
        _pcBSet = {};
        snap.docs.forEach(function(d){ _pcBSet[d.id] = true; });
        var total = {};
        Object.keys(_pcASet).forEach(function(k){ total[k] = true; });
        Object.keys(_pcBSet).forEach(function(k){ total[k] = true; });
        updatePendCustBadge(Object.keys(total).length);
      })
    );
  } else {
    _realtimeUnsubs.push(
      _fbDb.collection('pendingCustomers').where('status','==','Pending').onSnapshot(function(snap) {
        updatePendCustBadge(snap.size);
      })
    );
  }

  // 4) pendingProducts → 상품 승인 배지
  // 관리자/Office: 전체, 그 외(Sales 포함): 본인이 올린 건만 (서버 필터)
  if (_scopedUser && me.empid) {
    var _ppA = _fbDb.collection('pendingProducts').where('status','==','Pending').where('created_by','==', me.empid);
    var _ppB = _fbDb.collection('pendingProducts').where('status','==','Pending').where('reg_by','==', me.empid);
    var _ppASet = {}, _ppBSet = {};
    _realtimeUnsubs.push(
      _ppA.onSnapshot(function(snap){
        _ppASet = {};
        snap.docs.forEach(function(d){ _ppASet[d.id] = true; });
        var total = {};
        Object.keys(_ppASet).forEach(function(k){ total[k] = true; });
        Object.keys(_ppBSet).forEach(function(k){ total[k] = true; });
        _setProdBadgeCount(Object.keys(total).length);
      })
    );
    _realtimeUnsubs.push(
      _ppB.onSnapshot(function(snap){
        _ppBSet = {};
        snap.docs.forEach(function(d){ _ppBSet[d.id] = true; });
        var total = {};
        Object.keys(_ppASet).forEach(function(k){ total[k] = true; });
        Object.keys(_ppBSet).forEach(function(k){ total[k] = true; });
        _setProdBadgeCount(Object.keys(total).length);
      })
    );
  } else {
    _realtimeUnsubs.push(
      _fbDb.collection('pendingProducts').where('status','==','Pending').onSnapshot(function(snap) {
        _setProdBadgeCount(snap.size);
      })
    );
  }

  // 알림 배지도 갱신
  updateNotifBadge();
}

// 하위 호환: 기존 코드에서 호출하는 경우 대비
function _refreshAllBadges() {
  if (_realtimeUnsubs.length === 0 && getCurrentUser()) _startRealtimeBadges();
  updateNotifBadge();
}

// ══════════════════════════════════════════════════════════════════════════════
// ── 온라인 접속자 표시 (Firestore presence) ──────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
var _onlineUsers = [];
var _onlinePanelOpen = false;
var _onlineFilterDept = 'all';
var _presenceUnsub = null;
var _presenceHeartbeat = null;
var _broadcastUnsub = null;
var _lastBroadcastId = null;

function _goOnline() {
  var me = getCurrentUser();
  if (!me) return;
  var doc = {
    empid: me.empid,
    name: me.name,
    role: me.role || 'user',
    dept: me.dept || '',
    sub_dept: me.sub_dept || '',
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  };
  _fbDb.collection('presence').doc(me.empid).set(doc, { merge: true }).catch(function(){});
  // 하트비트: 5분마다 lastSeen 업데이트 (7분 온라인 윈도우 내)
  // — 90초 → 300초로 완화 (Firestore 일일 writes 약 67% 절감, 30명 사용 시 무료한도 내 유지)
  // — 백그라운드 탭(visibilityState!=='visible')은 skip 하여 추가 절감
  clearInterval(_presenceHeartbeat);
  _presenceHeartbeat = setInterval(function() {
    var u = getCurrentUser();
    if (!u) { clearInterval(_presenceHeartbeat); return; }
    if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible') return;
    _fbDb.collection('presence').doc(u.empid).update({
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(){});
  }, 5 * 60 * 1000);
  // 탭이 다시 보이게 되면 즉시 lastSeen 갱신 (백그라운드에서 윈도우 만료 후 복귀 시 빠른 반영)
  if (typeof document !== 'undefined' && !_presenceVisHook) {
    _presenceVisHook = function() {
      if (document.visibilityState !== 'visible') return;
      var u = getCurrentUser();
      if (!u) return;
      _fbDb.collection('presence').doc(u.empid).update({
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function(){});
    };
    document.addEventListener('visibilitychange', _presenceVisHook);
  }
}
var _presenceVisHook = null;

function _goOffline() {
  var me = getCurrentUser();
  if (me) {
    _fbDb.collection('presence').doc(me.empid).delete().catch(function(){});
  }
  clearInterval(_presenceHeartbeat);
  clearInterval(_presenceCountTimer);
  if (_presenceUnsub) { _presenceUnsub(); _presenceUnsub = null; }
  if (_broadcastUnsub) { _broadcastUnsub(); _broadcastUnsub = null; }
  if (_presenceVisHook && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', _presenceVisHook);
    _presenceVisHook = null;
  }
  _onlineUsers = [];
  _renderOnlineCount();
}

// presence 스냅샷 파싱 공용
function _applyPresenceSnap(snap) {
  var now = Date.now();
  var users = [];
  snap.forEach(function(doc) {
    var d = doc.data();
    var lastSeen = d.lastSeen ? d.lastSeen.toMillis() : 0;
    // 7분(420초) 이내면 온라인 — heartbeat 5분 + 여유 2분
    if (now - lastSeen < 420000) users.push(d);
  });
  _onlineUsers = users;
  _renderOnlineCount();
  if (_onlinePanelOpen) _renderOnlineList();
}

// 기본 동작: 온라인 카운트만 주기적으로(5분) 1회 get() → 읽기 수 대폭 감소
// 실시간 onSnapshot 은 사용자가 접속자 패널을 열 때만 활성화 (_ensurePresenceSubscription)
var _presenceCountTimer = null;
function _listenPresence() {
  // 즉시 한번 카운트 로드
  _fbDb.collection('presence').get()
    .then(_applyPresenceSnap)
    .catch(function(err){ console.warn('[Presence] count load error:', err); });
  // 5분마다 재조회 (온라인 패널이 닫혀있어도 카운트 업데이트)
  clearInterval(_presenceCountTimer);
  _presenceCountTimer = setInterval(function() {
    if (_onlinePanelOpen) return;  // 패널 열려있으면 실시간 리스너가 동작 중
    _fbDb.collection('presence').get()
      .then(_applyPresenceSnap)
      .catch(function(){});
  }, 5 * 60 * 1000);
}

// 패널이 열린 동안만 실시간 구독
function _ensurePresenceSubscription() {
  if (_presenceUnsub) return;  // 이미 구독 중
  _presenceUnsub = _fbDb.collection('presence').onSnapshot(
    _applyPresenceSnap,
    function(err){ console.warn('[Presence] listen error:', err); }
  );
}

function _releasePresenceSubscription() {
  if (_presenceUnsub) { _presenceUnsub(); _presenceUnsub = null; }
}

function _renderOnlineCount() {
  var el = document.getElementById('onlineCount');
  if (el) el.textContent = _onlineUsers.length;
}

function toggleOnlinePanel() {
  // 관리자 전용 — 비관리자는 접속자 현황을 볼 수 없음
  var _meOl = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (!_meOl || typeof _isAdmin !== 'function' || !_isAdmin(_meOl)) {
    return;
  }
  _onlinePanelOpen = !_onlinePanelOpen;
  var panel = document.getElementById('onlinePanel');
  if (_onlinePanelOpen) {
    // 초기 위치: 버튼 아래
    if (!panel._posInited) {
      var btn = panel.closest('.online-wrap');
      if (btn) {
        var r = btn.getBoundingClientRect();
        panel.style.top = (r.bottom + 4) + 'px';
        panel.style.left = Math.max(0, r.right - panel.offsetWidth) + 'px';
      } else {
        panel.style.top = '50px';
        panel.style.right = '20px';
      }
      panel._posInited = true;
    }
    panel.classList.add('open');
    _filterOnline(_onlineFilterDept || 'all');
    // 패널이 열린 동안만 실시간 구독 활성화 (읽기 수 감소)
    _ensurePresenceSubscription();
  } else {
    panel.classList.remove('open');
    // 패널 닫히면 실시간 구독 해제 (카운트는 5분 폴링으로 유지)
    _releasePresenceSubscription();
  }
}

// ── 접속자 패널 드래그 이동 + Y축 리사이즈 ──
(function() {
  var panel, hdr, resizeHandle;
  var dragging = false, resizing = false;
  var startX, startY, startLeft, startTop, startH;

  function init() {
    panel = document.getElementById('onlinePanel');
    hdr = document.getElementById('onlinePanelHdr');
    resizeHandle = document.getElementById('onlinePanelResize');
    if (!panel || !hdr || !resizeHandle) return;

    hdr.addEventListener('mousedown', dragStart);
    hdr.addEventListener('touchstart', dragStart, { passive: false });
    resizeHandle.addEventListener('mousedown', resizeStart);
    resizeHandle.addEventListener('touchstart', resizeStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  }

  function dragStart(e) {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
    dragging = true; window._olDragging = true;
    var t = e.touches ? e.touches[0] : e;
    startX = t.clientX; startY = t.clientY;
    var rect = panel.getBoundingClientRect();
    startLeft = rect.left; startTop = rect.top;
    e.preventDefault();
  }
  function resizeStart(e) {
    resizing = true; window._olDragging = true;
    var t = e.touches ? e.touches[0] : e;
    startY = t.clientY; startH = panel.offsetHeight;
    startTop = panel.getBoundingClientRect().top;
    e.preventDefault();
  }

  function onMove(e) {
    var t = e.touches ? e.touches[0] : e;
    if (dragging) {
      var dx = t.clientX - startX, dy = t.clientY - startY;
      panel.style.left = Math.max(0, Math.min(startLeft + dx, window.innerWidth - panel.offsetWidth)) + 'px';
      panel.style.top = Math.max(0, Math.min(startTop + dy, window.innerHeight - 60)) + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      e.preventDefault();
    }
    if (resizing) {
      var dy = startY - t.clientY;
      var newH = Math.max(200, Math.min(startH + dy, window.innerHeight - 20));
      var newTop = startTop - (newH - startH);
      panel.style.height = newH + 'px';
      panel.style.top = Math.max(0, newTop) + 'px';
      panel.style.bottom = 'auto';
      e.preventDefault();
    }
  }
  function onEnd() {
    dragging = false; resizing = false;
    setTimeout(function() { window._olDragging = false; }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// 패널 외부 클릭 시 닫기 (드래그 중이면 무시)
document.addEventListener('click', function(e) {
  if (_onlinePanelOpen && !e.target.closest('.online-wrap') && !e.target.closest('.online-panel') && !window._olDragging) {
    document.getElementById('onlinePanel').classList.remove('open');
    _onlinePanelOpen = false;
  }
});

function _filterOnline(dept) {
  _onlineFilterDept = dept;
  // 버튼 활성화 상태 업데이트
  document.querySelectorAll('.ol-filter-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-dept') === dept);
  });
  // 부서 드롭다운 옵션 업데이트
  var subSel = document.getElementById('olSubFilter');
  subSel.value = '';
  var subOpts = '<option value="">전체 부서</option>';
  var subs = dept === 'all' ? (SUB_DEPT_OPTIONS.Sales || []).concat(SUB_DEPT_OPTIONS.Office || []) : (SUB_DEPT_OPTIONS[dept] || []);
  subs.forEach(function(o) {
    subOpts += '<option value="' + o.value + '">' + o.value + '</option>';
  });
  subSel.innerHTML = subOpts;
  _renderOnlineList();
}

var _lastOnlineListSig = '';
function _renderOnlineList() {
  var list = document.getElementById('onlineList');
  var total = document.getElementById('onlineTotal');
  if (total) total.textContent = _onlineUsers.length + '명 접속 중';
  if (!_onlineUsers.length) {
    var emptySig = 'EMPTY';
    if (_lastOnlineListSig === emptySig) return;
    _lastOnlineListSig = emptySig;
    list.innerHTML = '<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px;">접속 중인 사용자가 없습니다</div>';
    return;
  }
  var me = getCurrentUser();
  var myId = me ? me.empid : '';
  var subFilter = (document.getElementById('olSubFilter') || {}).value || '';
  // 필터 적용
  var filtered = _onlineUsers.filter(function(u) {
    if (_onlineFilterDept !== 'all' && u.dept !== _onlineFilterDept) return false;
    if (subFilter && (u.sub_dept || '') !== subFilter) return false;
    return true;
  });
  if (!filtered.length) {
    var noneSig = 'NONE|' + _onlineFilterDept + '|' + subFilter;
    if (_lastOnlineListSig === noneSig) return;
    _lastOnlineListSig = noneSig;
    list.innerHTML = '<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px;">해당 조건의 접속자가 없습니다</div>';
    return;
  }
  // 본인 우선, 나머지 이름순
  var sorted = filtered.slice().sort(function(a,b) {
    if (a.empid === myId) return -1;
    if (b.empid === myId) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });
  // 렌더 시그니처: 실제 표시에 영향을 주는 필드만 포함 (lastSeen 같은 하트비트 필드 제외)
  // — 동일 시그니처면 재렌더 생략 → hover flicker 방지
  var sig = _onlineFilterDept + '|' + subFilter + '|' + myId + '|' + sorted.map(function(u) {
    return (u.empid||'') + ':' + (u.name||'') + ':' + (u.role||'') + ':' + (u.dept||'') + ':' + (u.sub_dept||'');
  }).join(',');
  if (sig === _lastOnlineListSig) return;
  _lastOnlineListSig = sig;
  var html = '';
  sorted.forEach(function(u) {
    var isMe = u.empid === myId;
    var roleLabel = u.role === 'admin' ? 'Admin' : u.role === 'approver' ? 'Approver' : u.dept || 'User';
    var subLabel = u.sub_dept ? ' · ' + u.sub_dept : '';
    html += '<div class="online-item" ondblclick="openChat(\'' + u.empid + '\',\'' + (u.name||'').replace(/'/g,'\\\'') + '\')">' +
      '<div class="ol-avatar">' + (u.name || '?').charAt(0) + '</div>' +
      '<div class="ol-info">' +
        '<div class="ol-name">' + (u.name || u.empid) + (isMe ? ' (나)' : '') + '</div>' +
        '<div class="ol-role">' + u.empid + ' · ' + roleLabel + subLabel + '</div>' +
      '</div>' +
      '<div class="ol-status on" style="position:relative;"></div>' +
    '</div>';
  });
  list.innerHTML = html;
}

// 페이지 떠날 때 오프라인 처리 (best effort)
window.addEventListener('beforeunload', function() {
  var me = getCurrentUser();
  if (me) {
    _fbDb.collection('presence').doc(me.empid).delete().catch(function(){});
  }
});
// visibilitychange: 탭 숨김/표시 시 상태 업데이트
// - PWA(홈 화면 앱) 에서는 백그라운드에서 복귀해도 페이지가 리로드되지 않음
//   → 관리자가 권한을 변경해도 sessionStorage 캐시된 유저로 UI가 렌더링됨
//   → visible 전환 시 Firestore 최신 권한으로 동기화 + UI 재적용
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState !== 'visible') return;
  var _me = getCurrentUser();
  if (!_me) return;
  _goOnline();
  // 권한 최신화 (PWA 에서 앱 재활성 시 관리자 권한 변경 즉시 반영)
  try {
    if (typeof _syncUserPermsFromFirestore === 'function') {
      _syncUserPermsFromFirestore(_me);
    }
  } catch(e) { console.warn('[visibilitychange] perm sync error:', e); }
});
// pageshow (bfcache 복원) 와 focus 에서도 동기화 보장 (iOS PWA 대응)
window.addEventListener('pageshow', function(e) {
  if (!e.persisted) return;  // bfcache 복원 케이스만 — 초기 로드는 제외
  var _me = getCurrentUser();
  if (_me && typeof _syncUserPermsFromFirestore === 'function') {
    try { _syncUserPermsFromFirestore(_me); } catch(_e){}
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── 공지사항 시스템 (announcements) ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
var _editingAnnounceId = null;

function openBroadcastModal() {
  _editingAnnounceId = null;
  document.getElementById('bcTitle').value = '';
  document.getElementById('broadcastMsg').value = '';
  document.getElementById('btnBroadcastSend').disabled = false;
  document.getElementById('btnBroadcastSend').innerHTML = '&#x1F4E2; ' + t('ann_send_btn');
  // 예약 발송 초기화
  var schedWrap = document.getElementById('bcScheduleWrap');
  if (schedWrap) schedWrap.style.display = '';
  var schedCheck = document.getElementById('bcScheduleCheck');
  if (schedCheck) schedCheck.checked = false;
  var schedFields = document.getElementById('bcScheduleFields');
  if (schedFields) schedFields.style.display = 'none';
  // 위치 초기화
  var modal = document.querySelector('#broadcastOverlay .broadcast-modal');
  if (modal) { modal.style.position = ''; modal.style.left = ''; modal.style.top = ''; modal.style.margin = ''; }
  document.getElementById('broadcastOverlay').classList.add('open');
  _initBcDrag();
  setTimeout(function(){ document.getElementById('bcTitle').focus(); }, 200);
}

// ── 공지 모달 드래그 ──
function _initBcDrag() {
  var modal = document.querySelector('#broadcastOverlay .broadcast-modal');
  if (!modal || modal._dragInit) return;
  modal._dragInit = true;
  var hdr = modal.querySelector('.bc-hdr');
  if (!hdr) return;
  var dragging = false, startX, startY, origX, origY;

  hdr.addEventListener('mousedown', function(e) {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    var rect = modal.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    origX = rect.left; origY = rect.top;
    modal.style.position = 'fixed';
    modal.style.margin = '0';
    modal.style.left = origX + 'px';
    modal.style.top = origY + 'px';
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    var dx = e.clientX - startX, dy = e.clientY - startY;
    modal.style.left = (origX + dx) + 'px';
    modal.style.top = (origY + dy) + 'px';
  });
  document.addEventListener('mouseup', function() { dragging = false; });

  // 터치
  hdr.addEventListener('touchstart', function(e) {
    if (e.target.tagName === 'BUTTON') return;
    var touch = e.touches[0];
    dragging = true;
    var rect = modal.getBoundingClientRect();
    startX = touch.clientX; startY = touch.clientY;
    origX = rect.left; origY = rect.top;
    modal.style.position = 'fixed';
    modal.style.margin = '0';
    modal.style.left = origX + 'px';
    modal.style.top = origY + 'px';
  }, { passive: true });
  document.addEventListener('touchmove', function(e) {
    if (!dragging) return;
    var touch = e.touches[0];
    var dx = touch.clientX - startX, dy = touch.clientY - startY;
    modal.style.left = (origX + dx) + 'px';
    modal.style.top = (origY + dy) + 'px';
  }, { passive: true });
  document.addEventListener('touchend', function() { dragging = false; });
}

function _toggleScheduleFields() {
  var chk = document.getElementById('bcScheduleCheck');
  var fields = document.getElementById('bcScheduleFields');
  var btn = document.getElementById('btnBroadcastSend');
  if (chk && fields) {
    fields.style.display = chk.checked ? 'block' : 'none';
    if (chk.checked) {
      // 기본 날짜: 내일
      var tm = new Date(new Date().getTime() + 7 * 3600000 + 86400000);
      document.getElementById('bcScheduleDate').value = tm.toISOString().slice(0, 10);
      btn.innerHTML = '⏰ ' + (t('ann_schedule') || '예약 발송');
    } else {
      btn.innerHTML = '&#x1F4E2; ' + t('ann_send_btn');
    }
  }
}

function closeBroadcastModal() {
  document.getElementById('broadcastOverlay').classList.remove('open');
  _editingAnnounceId = null;
  // 템플릿 메뉴 닫기
  var m = document.getElementById('bcTemplateMenu');
  if (m) m.remove();
}

// ── 공지 템플릿 시스템 ──
function _openBcTemplateMenu(btnEl) {
  var old = document.getElementById('bcTemplateMenu');
  if (old) { old.remove(); return; }

  var menu = document.createElement('div');
  menu.id = 'bcTemplateMenu';
  menu.style.cssText = 'position:absolute;bottom:50px;left:12px;background:#fff;border:1.5px solid #d1d5db;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);min-width:220px;z-index:9999;overflow:hidden;';

  menu.innerHTML = '<div style="padding:10px 14px;background:#f3f4f6;font-size:12px;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">📋 Template</div>' +
    '<div id="bcTemplateList" style="max-height:200px;overflow-y:auto;"><div style="padding:12px;text-align:center;color:#9ca3af;font-size:12px;">로딩...</div></div>' +
    '<div style="border-top:1px solid #e5e7eb;padding:8px;display:flex;gap:6px;">' +
      '<button onclick="_saveBcTemplate()" style="flex:1;padding:6px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">💾 현재 내용 저장</button>' +
    '</div>';

  btnEl.parentElement.style.position = 'relative';
  btnEl.parentElement.appendChild(menu);
  _loadBcTemplates();

  // 외부 클릭 시 닫기
  setTimeout(function() {
    document.addEventListener('click', function _closeTpl(e) {
      if (!menu.contains(e.target) && e.target !== btnEl) {
        menu.remove();
        document.removeEventListener('click', _closeTpl);
      }
    });
  }, 100);
}

async function _loadBcTemplates() {
  var list = document.getElementById('bcTemplateList');
  if (!list) return;
  try {
    var snap = await _fbDb.collection('announceTemplates').orderBy('createdAt', 'desc').limit(10).get();
    if (snap.empty) {
      list.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:12px;">저장된 템플릿이 없습니다</div>';
      return;
    }
    var html = '';
    snap.forEach(function(doc) {
      var d = doc.data();
      var id = doc.id;
      html += '<div style="padding:8px 14px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:8px;cursor:pointer;transition:background .1s;" onmouseover="this.style.background=\'#eff6ff\'" onmouseout="this.style.background=\'#fff\'">' +
        '<div onclick="_applyBcTemplate(\'' + id + '\')" style="flex:1;min-width:0;">' +
          '<div style="font-size:12px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(d.title || '제목 없음') + '</div>' +
          '<div style="font-size:11px;color:#9ca3af;margin-top:1px;">' + escHtml((d.message || '').slice(0, 40)) + '...</div>' +
        '</div>' +
        '<button onclick="event.stopPropagation();_deleteBcTemplate(\'' + id + '\')" style="background:none;border:none;color:#ef4444;font-size:14px;cursor:pointer;padding:2px;" title="삭제">×</button>' +
      '</div>';
    });
    list.innerHTML = html;
  } catch(e) {
    list.innerHTML = '<div style="padding:12px;text-align:center;color:#ef4444;font-size:12px;">로드 실패</div>';
  }
}

async function _saveBcTemplate() {
  var title = (document.getElementById('bcTitle') || {}).value || '';
  var msg = (document.getElementById('broadcastMsg') || {}).value || '';
  if (!title && !msg) { showToast('내용을 입력하세요'); return; }
  try {
    await _fbDb.collection('announceTemplates').add({
      title: title,
      message: msg,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('💾 템플릿 저장 완료');
    _loadBcTemplates();
  } catch(e) { showToast('❌ 저장 실패'); }
}

async function _applyBcTemplate(id) {
  try {
    var doc = await _fbDb.collection('announceTemplates').doc(id).get();
    if (!doc.exists) return;
    var d = doc.data();
    document.getElementById('bcTitle').value = d.title || '';
    document.getElementById('broadcastMsg').value = d.message || '';
    var menu = document.getElementById('bcTemplateMenu');
    if (menu) menu.remove();
    showToast('📋 템플릿 적용됨');
  } catch(e) { showToast('❌ 로드 실패'); }
}

async function _deleteBcTemplate(id) {
  if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;
  try {
    await _fbDb.collection('announceTemplates').doc(id).delete();
    showToast('🗑️ 삭제 완료');
    _loadBcTemplates();
  } catch(e) { showToast('❌ 삭제 실패'); }
}

// 유류 지원금 공지 기본 템플릿 시드 (최초 1회)
(function _seedFuelTemplate() {
  if (localStorage.getItem('_fuelTplSeeded')) return;
  setTimeout(async function() {
    if (!_fbDb) return;
    try {
      var existing = await _fbDb.collection('announceTemplates').where('title', '==', 'แจ้งอัตราค่าน้ำมันประจำเดือน[เดือน]').get();
      if (!existing.empty) { localStorage.setItem('_fuelTplSeeded', '1'); return; }
      await _fbDb.collection('announceTemplates').add({
        title: 'แจ้งอัตราค่าน้ำมันประจำเดือน[เดือน]',
        message: 'เรียน พนักงานทุกท่าน\n\n' +
          'ทางบริษัทขอประกาศแจ้งอัตราค่าน้ำมันประจำเดือน[เดือนที่ใช้]\n' +
          'โดยจะคำนวณจากราคาเฉลี่ยของราคาน้ำมันที่เปลี่ยนแปลงของเดือนที่ผ่านมา ([เดือนอ้างอิง])\n' +
          'โดยอ้างอิงราคาน้ำมันจากเว็บไซต์ ปตท. (https://www.pttor.com/th/oil_price)\n' +
          '【✅ อัตราที่ใช้เดือน[เดือน]: [อัตรา] ฿/km (เฉลี่ย [ราคาเฉลี่ย] ฿/ลิตร)】\n\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '  ครั้งที่      วันที่              Gasohol 95 (BKK)\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '  [ข้อมูลราคาแต่ละครั้ง]\n' +
          '━━━━━━━━━━━━━━━━━━━━\n' +
          '  รวม / Total                     [รวม]\n' +
          '  ราคาเฉลี่ย / Average        [เฉลี่ย]\n' +
          '━━━━━━━━━━━━━━━━━━━━\n\n' +
          '📌 อัตราค่าน้ำมัน (rate to pay / KM)\n' +
          '  0-35 ฿/ลิตร  →  5 ฿/km\n' +
          '  36-40 ฿/ลิตร  →  6 ฿/km\n' +
          '  40 ฿ ขึ้นไป    →  7 ฿/km',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      localStorage.setItem('_fuelTplSeeded', '1');
    } catch(e) { /* skip */ }
  }, 3000);
})();

async function sendBroadcast() {
  var title = document.getElementById('bcTitle').value.trim();
  var msg = document.getElementById('broadcastMsg').value.trim();
  if (!title) { neoAlert(t('ann_no_title') || '제목을 입력해주세요.'); return; }
  if (!msg) { neoAlert(t('ann_no_msg') || '내용을 입력해주세요.'); return; }
  var me = getCurrentUser();
  if (!me) return;
  var btn = document.getElementById('btnBroadcastSend');
  btn.disabled = true;
  btn.textContent = '...';

  // 예약 발송 체크
  var schedCheck = document.getElementById('bcScheduleCheck');
  var isScheduled = schedCheck && schedCheck.checked && !_editingAnnounceId;

  try {
    if (_editingAnnounceId) {
      await _fbDb.collection('announcements').doc(_editingAnnounceId).update({
        title: title,
        message: msg
      });
      closeBroadcastModal();
      _showBcToast(t('ann_updated') || '공지가 수정되었습니다.');
      _renderAnnounceList();
    } else if (isScheduled) {
      var schedDate = document.getElementById('bcScheduleDate').value;
      var schedTime = document.getElementById('bcScheduleTime').value || '09:00';
      if (!schedDate) { neoAlert(t('ann_schedule_date') + '을 선택해주세요.'); btn.disabled = false; btn.innerHTML = '⏰ ' + (t('ann_schedule') || '예약 발송'); return; }
      var scheduledAt = schedDate + 'T' + schedTime + ':00+07:00';
      await _fbDb.collection('scheduledAnnouncements').add({
        title: title,
        message: msg,
        sender: me.name + ' (' + me.empid + ')',
        senderEmpid: me.empid,
        scheduledAt: scheduledAt,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        sent: false
      });
      closeBroadcastModal();
      _showBcToast('⏰ ' + (t('ann_scheduled') || '공지가 예약되었습니다.'));
    } else {
      await _fbDb.collection('announcements').add({
        title: title,
        message: msg,
        sender: me.name + ' (' + me.empid + ')',
        senderEmpid: me.empid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        readBy: [],
        active: true
      });
      closeBroadcastModal();
      _showBcToast(t('ann_sent') || '공지사항이 발송되었습니다.');
    }
  } catch(e) {
    neoAlert((t('ann_fail') || '실패') + ': ' + e.message);
  }
  btn.disabled = false;
  btn.innerHTML = '&#x1F4E2; ' + t('ann_send_btn');
}

async function editAnnounce(id) {
  try {
    var doc = await _fbDb.collection('announcements').doc(id).get();
    if (!doc.exists) return;
    var a = doc.data();
    _editingAnnounceId = id;
    document.getElementById('bcTitle').value = a.title || '';
    document.getElementById('broadcastMsg').value = a.message || '';
    document.getElementById('btnBroadcastSend').innerHTML = '&#x1F4BE; ' + t('ann_save_btn');
    document.getElementById('broadcastOverlay').classList.add('open');
    setTimeout(function(){ document.getElementById('bcTitle').focus(); }, 200);
  } catch(e) {
    neoAlert((t('ann_fail') || '실패') + ': ' + e.message);
  }
}

async function deleteAnnounce(id) {
  if (!confirm(t('ann_del_confirm') || '이 공지를 삭제하시겠습니까?')) return;
  try {
    await _fbDb.collection('announcements').doc(id).update({ active: false });
    _showBcToast(t('ann_deleted') || '공지가 삭제되었습니다.');
    _renderAnnounceList();
  } catch(e) {
    neoAlert((t('ann_fail') || '실패') + ': ' + e.message);
  }
}

// ── 예약 공지 목록 렌더링 (알림 패널 내) ──
async function _renderScheduledAnnounces() {
  var list = document.getElementById('notifList');
  if (!list) return;
  var me = getCurrentUser();
  if (!me) return;
  var admin = _isAdmin(me);
  if (!admin) return;
  try {
    var snap = await _fbDb.collection('scheduledAnnouncements')
      .where('sent', '==', false)
      .orderBy('scheduledAt', 'asc')
      .get();
    if (snap.empty) return;
    var html = '<div style="padding:10px 16px;background:#fefce8;border-bottom:1px solid #fbbf24;font-size:13px;font-weight:700;color:#92400e;">⏰ ' + (t('ann_schedule_list') || '예약된 공지') + '</div>';
    snap.forEach(function(doc) {
      var a = doc.data();
      var id = doc.id;
      var schedDt = a.scheduledAt ? a.scheduledAt.slice(0, 16).replace('T', ' ') : '-';
      html += '<div style="padding:10px 16px;border-bottom:1px solid #fef3c7;background:#fffbeb;display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:16px;">⏰</span>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:600;color:#92400e;">' + escHtml(a.title || '') + '</div>' +
        '<div style="font-size:11px;color:#b45309;margin-top:2px;">📅 ' + schedDt + '</div>' +
        '</div>' +
        '<button onclick="_cancelScheduledAnnounce(\'' + id + '\')" style="padding:4px 10px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap;">' + (t('ann_schedule_cancel') || '취소') + '</button>' +
        '</div>';
    });
    // 기존 목록 위에 삽입
    list.innerHTML = html + list.innerHTML;
  } catch(e) { /* skip */ }
}

async function _cancelScheduledAnnounce(id) {
  if (!confirm(t('ann_schedule_cancel') + '?')) return;
  try {
    await _fbDb.collection('scheduledAnnouncements').doc(id).delete();
    _showBcToast(t('ann_schedule_cancelled') || '예약이 취소되었습니다.');
    _renderAnnounceList();
  } catch(e) {
    neoAlert((t('ann_fail') || '실패') + ': ' + e.message);
  }
}

// 실시간 공지 수신 (접속 중인 사용자)
function _listenBroadcasts() {
  if (_broadcastUnsub) _broadcastUnsub();
  var me = getCurrentUser();
  if (!me) return;
  _broadcastUnsub = _fbDb.collection('announcements')
    .where('active', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .onSnapshot(function(snap) {
      snap.docChanges().forEach(function(change) {
        if (change.type === 'added') {
          var bc = change.doc.data();
          var bcId = change.doc.id;
          if (_lastBroadcastId === bcId) return;
          if (bc.readBy && bc.readBy.includes(me.empid)) return;
          // 실시간 알림: 10초 이내 생성된 것만 토스트 표시
          if (bc.createdAt) {
            var bcTime = bc.createdAt.toMillis ? bc.createdAt.toMillis() : (bc.createdAt.seconds ? bc.createdAt.seconds * 1000 : 0);
            if (bcTime && Date.now() - bcTime < 10000) {
              _lastBroadcastId = bcId;
              _showBcToast('📢 ' + (bc.title || '공지사항'));
              sendNotification('📢 ' + (bc.title || '공지사항'), bc.message);
            }
          }
        }
      });
      // 알림 배지 업데이트
      _updateAnnounceBadge(snap);
    }, function(err) {
      console.warn('[Announce] listen error:', err);
    });
}

// 공지사항 배지 (읽지 않은 공지 수)
function _updateAnnounceBadge(snap) {
  var me = getCurrentUser();
  if (!me) return;
  var unread = 0;
  if (snap) {
    snap.forEach(function(doc) {
      var d = doc.data();
      if (!d.readBy || !d.readBy.includes(me.empid)) unread++;
    });
  }
  var badge = document.getElementById('notifBadge');
  if (badge) {
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.style.display = 'block';
    }
    // 기존 알림 배지와 합산될 수 있으므로 0일 때는 건드리지 않음
  }
}

// 로그인 시 읽지 않은 공지사항 팝업 표시
async function _checkUnreadAnnouncements() {
  var me = getCurrentUser();
  if (!me) return;
  try {
    var snap = await _fbDb.collection('announcements')
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    var unread = [];
    snap.forEach(function(doc) {
      var d = doc.data();
      d._id = doc.id;
      if (!d.readBy || !d.readBy.includes(me.empid)) {
        unread.push(d);
      }
    });
    if (unread.length > 0) {
      _showAnnouncementPopup(unread);
    }
  } catch(e) {
    console.warn('[Announce] check error:', e);
  }
}

// 공지사항 팝업 표시
function _showAnnouncementPopup(items) {
  var overlay = document.getElementById('announcePopupOverlay');
  var list = document.getElementById('announcePopupList');
  var me = getCurrentUser();
  var admin = _isAdmin(me);
  var html = '';
  items.forEach(function(a) {
    var ts = a.createdAt ? new Date((a.createdAt.seconds || 0) * 1000) : new Date();
    var timeStr = ts.toLocaleDateString('ko-KR') + ' ' + ts.toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'});
    var adminBtns = admin
      ? '<div class="announce-admin-btns" style="margin-top:8px;">' +
        '<button class="announce-edit-btn" onclick="editAnnounce(\'' + a._id + '\')" title="' + t('ann_edit') + '">&#x270F;&#xFE0F; <span>' + t('ann_edit') + '</span></button>' +
        '<button class="announce-del-btn" onclick="deleteAnnounce(\'' + a._id + '\')" title="' + t('ann_delete') + '">&#x1F5D1;&#xFE0F; <span>' + t('ann_delete') + '</span></button>' +
        '</div>' : '';
    html += '<div class="announce-item" data-id="' + a._id + '">' +
      '<div class="announce-title">📢 ' + (a.title || '공지사항') + '</div>' +
      '<div class="announce-msg">' + (a.message || '').replace(/\n/g, '<br>') + '</div>' +
      '<div class="announce-meta">' + (a.sender || '') + ' · ' + timeStr + '</div>' +
      adminBtns +
    '</div>';
  });
  list.innerHTML = html;
  overlay.classList.add('open');
}

async function closeAnnouncementPopup() {
  var overlay = document.getElementById('announcePopupOverlay');
  overlay.classList.remove('open');
  // 표시된 공지 모두 읽음 처리
  var me = getCurrentUser();
  if (!me) return;
  var items = document.querySelectorAll('#announcePopupList .announce-item');
  var batch = _fbDb.batch();
  var count = 0;
  items.forEach(function(el) {
    var id = el.getAttribute('data-id');
    if (id) {
      batch.update(_fbDb.collection('announcements').doc(id), {
        readBy: firebase.firestore.FieldValue.arrayUnion(me.empid)
      });
      count++;
    }
  });
  if (count > 0) {
    try { await batch.commit(); } catch(e) {}
  }
}

// 알림 패널에서 공지사항 보기
async function toggleNotifTab(tab) {
  document.querySelectorAll('.notif-tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
  if (tab === 'announce') {
    await _renderAnnounceList();
  } else {
    await renderNotifList();
  }
}

// 공지 메시지 포맷: 【...】 → 파란색 굵게
function _fmtAnnounceMsg(msg) {
  var safe = escHtml(msg);
  // 【...】 패턴을 파란색 굵게 변환
  safe = safe.replace(/【([^】]+)】/g, '<span style="color:#1d4ed8;font-weight:700;font-size:13px;">$1</span>');
  return safe;
}

async function _renderAnnounceList() {
  var list = document.getElementById('notifList');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;">로딩...</div>';
  var me = getCurrentUser();
  if (!me) { list.innerHTML = ''; return; }
  var admin = _isAdmin(me);
  try {
    var snap = await _fbDb.collection('announcements')
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();
    if (snap.empty) {
      list.innerHTML = '<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px;">공지사항이 없습니다</div>';
      return;
    }
    var html = '';
    snap.forEach(function(doc) {
      var a = doc.data();
      var id = doc.id;
      var isRead = a.readBy && a.readBy.includes(me.empid);
      var bg = isRead ? '#fff' : '#eff6ff';
      var ts = a.createdAt ? new Date(a.createdAt.seconds * 1000) : new Date();
      var timeStr = ts.toLocaleDateString('ko-KR') + ' ' + ts.toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'});
      var adminBtns = admin
        ? '<div class="announce-admin-btns" onclick="event.stopPropagation()">' +
          '<button class="announce-edit-btn" onclick="editAnnounce(\'' + id + '\')" title="' + t('ann_edit') + '">&#x270F;&#xFE0F;</button>' +
          '<button class="announce-del-btn" onclick="deleteAnnounce(\'' + id + '\')" title="' + t('ann_delete') + '">&#x1F5D1;&#xFE0F;</button>' +
          '</div>' : '';
      html += '<div onclick="_toggleAnnounceExpand(this);_markAnnounceRead(\'' + id + '\',this)" style="padding:12px 16px;border-bottom:1px solid #f3f4f6;background:' + bg + ';cursor:pointer;transition:background .15s;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:16px;">📢</span>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:' + (isRead ? '400' : '700') + ';color:#111827;">' + (a.title || '공지사항') + '</div>' +
        '<div class="announce-msg-preview" style="font-size:12px;color:#6b7280;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(a.message || '') + '</div>' +
        '<div class="announce-msg-full" style="display:none;font-size:12px;color:#374151;margin-top:4px;line-height:1.6;white-space:pre-wrap;word-break:break-word;">' + _fmtAnnounceMsg(a.message || '') + '</div>' +
        '<div style="font-size:11px;color:#9ca3af;margin-top:3px;">' + (a.sender || '') + ' · ' + timeStr + '</div>' +
        '</div>' +
        adminBtns +
        (isRead ? '' : '<span style="width:8px;height:8px;border-radius:50%;background:#2563eb;flex-shrink:0;"></span>') +
        '</div></div>';
    });
    list.innerHTML = html;
    // 관리자: 예약 공지 목록 상단에 표시
    await _renderScheduledAnnounces();
  } catch(e) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#ef4444;font-size:13px;">로드 실패</div>';
  }
}

function _toggleAnnounceExpand(el) {
  var preview = el.querySelector('.announce-msg-preview');
  var full = el.querySelector('.announce-msg-full');
  if (!preview || !full) return;
  var expanded = full.style.display !== 'none';
  preview.style.display = expanded ? '' : 'none';
  full.style.display = expanded ? 'none' : 'block';
}

async function _markAnnounceRead(id, el) {
  var me = getCurrentUser();
  if (!me) return;
  try {
    await _fbDb.collection('announcements').doc(id).update({
      readBy: firebase.firestore.FieldValue.arrayUnion(me.empid)
    });
    if (el) {
      el.style.background = '#fff';
      var dot = el.querySelector('span[style*="border-radius:50%"]');
      if (dot) dot.remove();
      el.querySelector('div[style*="font-weight"]').style.fontWeight = '400';
    }
  } catch(e) {}
}

function _showBcToast(msg) {
  var toast = document.getElementById('bcToast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 5000);
}

document.addEventListener('dragstart', function(e) {
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'number') e.preventDefault();
}, true);

document.addEventListener('DOMContentLoaded', () => {
  // 로그인 상태일 때 실시간 배지 리스너 시작
  setTimeout(function() { if (getCurrentUser()) _startRealtimeBadges(); }, 500);

  // ── 드롭다운 서브메뉴 잔상 방지 (CSS :has() 폴백 + 강제 처리) ──────────────
  // 부모 드롭다운에 마우스가 들어올 때 한 시점에 단 1개의 submenu만 보이도록 처리
  (function _initSubmenuHoverGuard() {
    function _attach(parentSelector) {
      document.querySelectorAll(parentSelector).forEach(function(parent) {
        var subs = parent.querySelectorAll(':scope > .cust-dd-item.has-sub');
        if (!subs.length) return;
        subs.forEach(function(item) {
          item.addEventListener('mouseenter', function() {
            subs.forEach(function(other) {
              if (other === item) return;
              var sm = other.querySelector(':scope > .cust-sub-menu');
              if (sm) sm.style.display = 'none';
            });
            var mine = item.querySelector(':scope > .cust-sub-menu');
            if (mine) mine.style.display = 'block';
          });
          item.addEventListener('mouseleave', function() {
            var mine = item.querySelector(':scope > .cust-sub-menu');
            if (mine) mine.style.display = '';
          });
        });
        // 드롭다운에서 완전히 벗어나면 모두 초기화(인라인 스타일 제거 → CSS :hover 로 복귀)
        var root = parent.closest('.cust-dropdown');
        if (root) {
          root.addEventListener('mouseleave', function() {
            subs.forEach(function(other) {
              var sm = other.querySelector(':scope > .cust-sub-menu');
              if (sm) sm.style.display = '';
            });
          });
        }
      });
    }
    _attach('.cust-dropdown-menu-inner');
  })();

  // ── 자동 로그인 / 사번 자동 입력 ──────────────────────────────────────────
  (function initAutoLogin() {
    var isAuto   = localStorage.getItem('auto_login') === 'true';
    var savedId  = localStorage.getItem('saved_empid') || '';
    var chk      = document.getElementById('chkAutoLogin');
    var empidEl  = document.getElementById('li_empid');
    if (chk)     chk.checked = isAuto;
    if (empidEl && savedId) empidEl.value = savedId;

    // 자동 로그인 켜져 있고 저장된 세션이 있으면 바로 로그인 처리
    if (isAuto) {
      var persisted = JSON.parse(localStorage.getItem('current_user_persist') || 'null');
      if (persisted) {
        // 관리자가 변경한 최신 권한/역할로 병합 (emp_accounts가 항상 최신)
        var latestLocal = getLocalAccounts().find(function(a) { return a.empid === persisted.empid; });
        if (latestLocal) {
          persisted = Object.assign({}, persisted, {
            permissions: _ensurePermArray(latestLocal.permissions).length ? _ensurePermArray(latestLocal.permissions) : _ensurePermArray(persisted.permissions),
            role: latestLocal.role || persisted.role
          });
          persisted = enforceAdminRole(persisted);
          localStorage.setItem('current_user_persist', JSON.stringify(persisted));
        }
        // sessionStorage에 복원해서 getCurrentUser()가 즉시 반환하도록
        sessionStorage.setItem('current_user', JSON.stringify(persisted));
        _registerSession(persisted.empid); // 자동 로그인도 세션 등록
        applyUserUI(persisted);
        var overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.classList.remove('show');
        // 서버에서 최신 권한 비동기 갱신 (캐시 무효화 포함)
        (function(uid) {
          apiGetAccounts().then(function(acctData) {
            var srv = (acctData.accounts || []).find(function(a) { return a.empid === uid; });
            if (!srv) return;
            var cur = getCurrentUser();
            if (!cur || cur.empid !== uid) return;
            var srvPerms = _ensurePermArray(srv.permissions);
            var changed = JSON.stringify(cur.permissions) !== JSON.stringify(srvPerms) ||
                          cur.role !== srv.role;
            if (!changed) return;
            var updated = enforceAdminRole(Object.assign({}, cur, {
              permissions: srvPerms,
              role: srv.role || cur.role
            }));
            setCurrentUser(updated);
            saveLocalAccount(updated);
            applyUserUI(updated);
          }).catch(function() {});
        })(persisted.empid);
      }
    }
  })();

  // ── 현재 로그인 세션 유효성 검증 (삭제된 계정 강제 로그아웃) ──────────────
  (async function verifySession() {
    var me = getCurrentUser();
    if (!me) return;
    try {
      var res = await apiGetAccounts();
      var exists = (res.accounts || []).find(function(a){ return a.empid === me.empid; });
      if (!exists) {
        sessionStorage.removeItem('current_user');
        localStorage.removeItem('current_user_persist');
        document.getElementById('loginOverlay').classList.add('show');
      }
    } catch(e) {} // 네트워크 오류 시 세션 유지
  })();

  // ── T2408087 관리자 설정 마이그레이션 ────────────────────────────────────
  (async function migrateAdmin() {
    const ADMIN_EMPID = 'T2408087';
    // 로컬 우선, 없으면 API에서 조회
    var localAccts = getLocalAccounts();
    var acct = localAccts.find(function(a) { return a.empid === ADMIN_EMPID; });
    if (!acct) {
      try {
        var res = await apiGetAccounts();
        acct = (res.accounts || []).find(function(a) { return a.empid === ADMIN_EMPID; });
      } catch(e) {}
    }
    if (acct && acct.role !== 'admin') {
      acct = Object.assign({}, acct, { role: 'admin', permissions: [] });
      saveLocalAccount(acct);
      var me = getCurrentUser();
      if (me && me.empid === ADMIN_EMPID) {
        setCurrentUser(acct);
        applyUserUI(acct);
      }
      try { await apiPost({ action: 'update_account', account: acct }); } catch(e) {}
    }
  })();
});



