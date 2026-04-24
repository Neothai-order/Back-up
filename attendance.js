// Neo Sales App - Mobile Menu & Attendance (auto-separated)
// ══════════════════════════════════════════════════════
// 모바일 전용 메뉴 함수
// ══════════════════════════════════════════════════════
// GMAPS_KEY → core.js로 통합됨

/** 하단 네비 활성 탭 전환 */
function setMobNavActive(tabId) {
  document.querySelectorAll('.mob-nav-btn').forEach(function(btn) {
    btn.classList.remove('active');
  });
  var activeBtn = document.getElementById('mobNav' + tabId);
  if (activeBtn) activeBtn.classList.add('active');
}

/** 홈 그리드로 돌아가기 */
function showMobileHome() {
  setMobNavActive('Home');

  // 서브메뉴가 열려있으면 닫고 카테고리(메뉴 리스트) 보이기
  closeMobSub();

  // 홈 그리드 표시
  var mh = document.getElementById('mobileHome');
  if (mh) mh.style.display = 'block';

  // 열려있는 오버레이 닫기
  try { closeMobMore(); } catch(e) {}
  try { closeMobileSearch(); } catch(e) {}
  try { closeMyTracking(); } catch(e) {}

  // 메신저 패널 닫기
  try {
    var chatPanel = document.getElementById('chatListPanel');
    if (chatPanel && chatPanel.classList.contains('open')) {
      chatPanel.classList.remove('open');
      _chatListOpen = false;
    }
  } catch(e) {}

  // 열려있는 일반 오버레이 닫기 (고객등록, 견적, 주문 등)
  document.querySelectorAll('.overlay.open').forEach(function(ov) {
    ov.classList.remove('open');
  });

  // 채팅 윈도우 닫기
  document.querySelectorAll('.chat-float-window').forEach(function(w) {
    w.style.display = 'none';
  });
}

/** 더보기 팝업 토글 */
function toggleMobMore() {
  var overlay = document.getElementById('mobMoreOverlay');
  var sheet   = document.getElementById('mobMoreSheet');
  var isOpen  = sheet.classList.contains('open');
  if (isOpen) {
    overlay.classList.remove('open');
    sheet.classList.remove('open');
  } else {
    overlay.classList.add('open');
    sheet.classList.add('open');
  }
}

/** 더보기 팝업 닫기 */
function closeMobMore() {
  document.getElementById('mobMoreOverlay').classList.remove('open');
  document.getElementById('mobMoreSheet').classList.remove('open');
}

/** 모바일 고객 검색 바텀시트 열기 – custSearchArea를 시트 안으로 이동 */
function openMobileSearch() {
  var overlay  = document.getElementById('mobSearchOverlay');
  var body     = document.getElementById('mobSearchBody');
  var csa      = document.getElementById('custSearchArea');
  if (!overlay) return;

  // custSearchArea를 시트 body로 이동
  if (csa && body && !body.contains(csa)) {
    body.appendChild(csa);
  }
  if (csa) csa.style.display = '';

  overlay.classList.add('open');

  // 검색 인풋 포커스
  setTimeout(function() {
    var inp = document.getElementById('searchInput');
    if (inp) inp.focus();
  }, 360);
}

/** 모바일 고객 검색 바텀시트 닫기 – custSearchArea를 .main으로 복원 */
function closeMobileSearch() {
  var overlay  = document.getElementById('mobSearchOverlay');
  var mainDiv  = document.querySelector('.main');
  var csa      = document.getElementById('custSearchArea');
  var noPermMsg = document.getElementById('noPermMsg');

  if (overlay) overlay.classList.remove('open');

  // custSearchArea를 원래 위치로 복원 (noPermMsg 다음)
  if (csa && mainDiv && !mainDiv.contains(csa)) {
    if (noPermMsg && noPermMsg.nextSibling) {
      mainDiv.insertBefore(csa, noPermMsg.nextSibling);
    } else {
      mainDiv.appendChild(csa);
    }
    csa.style.display = 'none'; // 데스크탑 표시는 applyUserUI가 관리
  }
}

// 바텀시트 배경 클릭 → 닫기
(function() {
  var _mobSO = document.getElementById('mobSearchOverlay');
  if (_mobSO) _mobSO.addEventListener('click', function(e) { if (e.target === this) closeMobileSearch(); });
})();

// ESC 키 → 모바일 검색 닫기
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeMobileSearch();
    closeMobMore();
    closeAttendance();
  }
});

// ── 메뉴 설정 UI 함수 ────────────────────────────────────────────────────────
function _renderMcItem(item, idx) {
  var enabled = _isMenuEnabled(item.key);
  var hasChildren = item.children && item.children.length > 0;
  var html = '<div class="mc-row" draggable="true" data-mc-idx="' + idx + '" style="border-bottom:1px solid #f1f5f9;">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;">' +
    '<span class="mc-drag-handle" style="cursor:grab;font-size:14px;color:#cbd5e1;margin-right:6px;">☰</span>' +
    '<div style="display:flex;align-items:center;gap:12px;flex:1;cursor:' + (hasChildren ? 'pointer' : 'default') + ';"' +
      (hasChildren ? ' onclick="toggleMcSubPanel(' + idx + ')"' : '') + '>' +
      '<span style="font-size:22px;">' + item.icon + '</span>' +
      '<span style="font-size:14px;font-weight:600;color:#1e293b;">' + (item.i18n ? t(item.i18n) : item.label || '') + '</span>' +
      (hasChildren ? '<span class="mc-arrow-ind" data-arr-idx="' + idx + '" style="font-size:12px;color:#9ca3af;margin-left:auto;margin-right:8px;transition:transform .2s;">▶</span>' : '') +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:6px;">' +
      '<label class="toggle-switch"><input type="checkbox" data-mc-key="' + item.key + '"' + (enabled ? ' checked' : '') +
        ' onchange="' + (hasChildren ? '_mcParentToggle(this,' + idx + ')' : '') + '"' + '><span class="toggle-slider"></span></label>' +
      (_MC_RESET_LEAF[item.key] ? '<button onclick="_confirmMcReset(\'' + item.key + '\')" style="padding:4px 10px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap;">🗑 초기화</button>' : '') +
    '</div>' +
  '</div>';
  html += '</div>';
  return html;
}

function openMenuConfig() {
  var ov = document.getElementById('menuConfigOverlay');
  if (!ov) return;
  var body = document.getElementById('menuConfigBody');
  var html = '';
  MENU_CONFIG_ITEMS.forEach(function(item, idx) {
    if (item.isGroup) {
      // 그룹도 일반 아이템과 동일한 스타일로 렌더링 (클릭 시 서브패널)
      html += '<div class="mc-row" draggable="true" data-mc-idx="' + idx + '" style="border-bottom:1px solid #f1f5f9;">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;">' +
        '<span class="mc-drag-handle" style="cursor:grab;font-size:14px;color:#cbd5e1;margin-right:6px;">☰</span>' +
        '<div style="display:flex;align-items:center;gap:12px;flex:1;cursor:pointer;" onclick="toggleMcGroupPanel(' + idx + ')">' +
          '<span style="font-size:22px;">' + item.icon + '</span>' +
          '<span style="font-size:14px;font-weight:600;color:#1e293b;">' + (item.i18n ? t(item.i18n) : item.label || '') + '</span>' +
          '<span class="mc-arrow-ind" data-arr-idx="' + idx + '" style="font-size:12px;color:#9ca3af;margin-left:auto;margin-right:8px;transition:transform .2s;">▶</span>' +
        '</div>' +
      '</div>';
      html += '</div>';
    } else {
      html += _renderMcItem(item, idx);
    }
  });
  body.innerHTML = html;
  _initMcDrag(body);
  var bd = document.getElementById('mcSlideBackdrop');
  if (bd) bd.style.display = 'block';
  ov.classList.add('open');
}

function _getMcItem(idx) {
  var s = String(idx).split('_');
  var top = MENU_CONFIG_ITEMS[parseInt(s[0])];
  if (s.length > 1 && top && top.isGroup) return top.items[parseInt(s[1])];
  return top;
}
var _mcOpenSubIdx = -1;
var _mcOpenGrpIdx = -1;

// 그룹 클릭 → 1차 서브패널에 그룹 하위 메뉴 목록 표시
function toggleMcGroupPanel(idx) {
  closeMcSub2Panel();
  if (_mcOpenGrpIdx === idx) { closeMcSubPanel(); return; }
  _mcOpenGrpIdx = idx;
  _mcOpenSubIdx = -1;
  var grp = MENU_CONFIG_ITEMS[idx];
  if (!grp || !grp.items) return;
  var title = document.getElementById('mcSubPanelTitle');
  var body = document.getElementById('mcSubPanelBody');
  if (title) title.textContent = grp.icon + ' ' + (grp.i18n ? t(grp.i18n) : grp.label || '');
  var html = '';
  grp.items.forEach(function(sub, si) {
    var enabled = _isMenuEnabled(sub.key);
    var hasChildren = sub.children && sub.children.length > 0;
    var subIdx = idx + '_' + si;
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f1f5f9;">' +
      '<div style="display:flex;align-items:center;gap:10px;flex:1;cursor:' + (hasChildren ? 'pointer' : 'default') + ';"' +
        (hasChildren ? ' onclick="openMcSub2Panel(\'' + subIdx + '\')"' : '') + '>' +
        '<span style="font-size:18px;">' + sub.icon + '</span>' +
        '<span style="font-size:13px;font-weight:600;color:#1e293b;">' + (sub.i18n ? t(sub.i18n) : sub.label || '') + '</span>' +
        (hasChildren ? '<span class="mc-arrow-ind" data-arr-idx="' + subIdx + '" style="font-size:12px;color:#9ca3af;margin-left:auto;margin-right:8px;transition:transform .2s;">▶</span>' : '') +
      '</div>' +
      '<label class="toggle-switch toggle-sm"><input type="checkbox" data-mc-key="' + sub.key + '"' + (enabled ? ' checked' : '') +
        ' onchange="' + (hasChildren ? '_mcGrpParentToggle(this,\'' + subIdx + '\')' : '') + '"' + '><span class="toggle-slider"></span></label>' +
    '</div>';
  });
  if (body) body.innerHTML = html;
  document.querySelectorAll('#menuConfigBody .mc-arrow-ind').forEach(function(a) { a.style.transform = ''; });
  var activeArrow = document.querySelector('#menuConfigBody .mc-arrow-ind[data-arr-idx="' + idx + '"]');
  if (activeArrow) activeArrow.style.transform = 'rotate(90deg)';
  document.getElementById('mcSubPanel').classList.add('open');
}

// 초기화 대상 컬렉션 매핑 (마스터 데이터 제외, 입력 데이터만)
var _MC_RESET_LEAF = {
  'customer.register':    { collections: ['pendingCustomers'], filter: { field: 'status', op: '==', val: 'Pending' } },
  'customer.approve':     { collections: ['pendingCustomers'] },
  'customer.appr_result': { collections: ['pendingCustomers'], filter: { field: 'status', op: 'in', val: ['Approved','Rejected'] } },
  'prod_reg.register':    { collections: ['pendingProducts'], filter: { field: 'status', op: '==', val: 'Pending' } },
  'prod_reg.approve':     { collections: ['pendingProducts'] },
  'quote.new':            { collections: ['quotes'] },
  'quote.pending':        { collections: ['quotes'], filter: { field: 'status', op: '==', val: 'pending' } },
  'quote.done':           { collections: ['quotes'], filter: { field: 'status', op: '==', val: 'done' } },
  'order.new':            { collections: ['orders'] },
  'order.pending':        { collections: ['orders'], filter: { field: 'status', op: 'in', val: ['pending','cancel_requested'] } },
  // 실제 DB 상태값: pending / shipping / done / cancelled / cancel_requested / rejected
  // 완료 조회(상품 주문 완료 조회) = shipping + done 을 모두 포함해야 함
  'order.history':        { collections: ['orders'], filter: { field: 'status', op: 'in', val: ['shipping','done'] } },
  'order.consign':        { collections: ['consignment_master'] },
  'ship.delivery':        { collections: ['orders'], filter: { field: 'status', op: '==', val: 'shipping' } },
  'ship.shipped':         { collections: ['orders'], filter: { field: 'status', op: '==', val: 'done' } },
  // Completed Shipments (📊 발송 완료 조회) — 리포트 뷰는 status 필터 기본값이 '전체'.
  // pending(미처리) 을 제외한 모든 처리된 주문 이력을 삭제 대상으로 포함.
  'ship.history':         { collections: ['orders'], filter: { field: 'status', op: 'in', val: ['shipping','done','cancelled','cancel_requested','rejected'] } },
  'results.order_ship':   { collections: ['orders'] },
  'demo.request':         { collections: ['orders'], filter: { field: 'type', op: '==', val: 'demo' } },
  'attend.do':            { collections: ['attendance','attendanceNotify'] }
};

function _renderMcLeafItems(children, parentKey) {
  var html = '';
  children.forEach(function(child) {
    var cEnabled = _isMenuEnabled(child.key);
    var hasReset = !!_MC_RESET_LEAF[child.key];
    html += '<div style="display:flex;align-items:center;padding:12px 0;border-bottom:1px solid #f1f5f9;gap:6px;">' +
      '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">' +
        '<span style="font-size:16px;">' + child.icon + '</span>' +
        '<span style="font-size:13px;font-weight:500;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + t(child.i18n) + '</span>' +
      '</div>' +
      '<label class="toggle-switch toggle-sm" style="flex-shrink:0;"><input type="checkbox" data-mc-key="' + child.key + '"' + (cEnabled ? ' checked' : '') + '><span class="toggle-slider"></span></label>' +
      '<div style="width:58px;flex-shrink:0;text-align:right;">' +
        (hasReset ? '<button onclick="_confirmMcReset(\'' + child.key + '\')" style="padding:4px 8px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap;">🗑 초기화</button>' : '') +
      '</div>' +
    '</div>';
  });
  return html;
}

// 그룹 서브패널에서 상위 메뉴 토글 → 2차 서브패널(열려있으면) children도 일괄 체크/해제
function _mcGrpParentToggle(cb, subIdx) {
  var item = _getMcItem(subIdx);
  if (!item || !item.children) return;
  // 현재 2차 서브패널이 이 아이템을 표시 중이면 하위 토글 동기화
  if (_mcOpenSub2Idx === subIdx) {
    var sub2Body = document.getElementById('mcSub2PanelBody');
    if (sub2Body) sub2Body.querySelectorAll('input[data-mc-key]').forEach(function(s) { s.checked = cb.checked; });
  }
}

async function _confirmMcReset(leafKey) {
  var info = _MC_RESET_LEAF[leafKey];
  if (!info) return;
  var input = prompt('⚠️ 해당 메뉴의 입력 데이터가 삭제됩니다.\n(마스터 데이터는 유지됩니다)\n\n이 작업은 되돌릴 수 없습니다.\n초기화하려면 "초기화"를 입력하세요:');
  if (input === null) return;
  if (input.trim() !== '초기화') { neoAlert('입력이 일치하지 않습니다. 초기화가 취소되었습니다.'); return; }
  showToast('⏳ 초기화 진행 중...');
  console.log('%c[McReset]', 'background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;', 'start', leafKey, info);
  var totalDeleted = 0;
  var perCol = {};
  try {
    for (var ci = 0; ci < info.collections.length; ci++) {
      var colName = info.collections[ci];
      var query;
      if (info.filter) {
        if (info.filter.op === 'in') {
          query = _fbDb.collection(colName).where(info.filter.field, 'in', info.filter.val);
        } else {
          query = _fbDb.collection(colName).where(info.filter.field, info.filter.op, info.filter.val);
        }
      } else {
        query = _fbDb.collection(colName);
      }
      var snap = await query.get();
      console.log('[McReset] query', colName, 'filter=', info.filter || '(none)', '→ matched', snap.size, 'docs');
      if (snap.empty) { perCol[colName] = 0; continue; }
      // 400건 단위로 청크 분할 후 순차 commit (forEach 안에서 await 불가 → 일반 for 루프 사용)
      var docs = snap.docs;
      var delCnt = 0;
      for (var di = 0; di < docs.length; di += 400) {
        var batch = _fbDb.batch();
        var chunk = docs.slice(di, di + 400);
        for (var k = 0; k < chunk.length; k++) batch.delete(chunk[k].ref);
        await batch.commit();
        delCnt += chunk.length;
        console.log('[McReset] committed batch', di, '..', di + chunk.length - 1, '(total so far:', delCnt, ')');
      }
      perCol[colName] = delCnt;
      totalDeleted += delCnt;
    }
    console.log('%c[McReset]', 'background:#16a34a;color:#fff;padding:2px 6px;border-radius:4px;', 'done. total deleted =', totalDeleted, perCol);
    // ── apiGet 캐시 + orders 로컬 캐시 즉시 무효화 ──
    // 이게 없으면 직후에 열린 뷰가 3초 이내 cache hit 로 삭제 이전 데이터를 재표시함.
    try { if (typeof _apiGetInvalidate === 'function') _apiGetInvalidate(); } catch(_){}
    // ── 현재 열려있는 주문/배송 뷰가 있으면 자동 재렌더 ──
    if (leafKey.indexOf('order') === 0 || leafKey.indexOf('ship') === 0) {
      try {
        var rqOv = document.getElementById('resultsQryOverlay');
        if (rqOv && rqOv.classList.contains('open') && typeof renderResultsQuery === 'function') {
          renderResultsQuery();
        }
      } catch(_){}
      try {
        var delOv = document.getElementById('deliveryOverlay');
        if (delOv && delOv.classList.contains('open') && typeof renderDeliveryOrders === 'function') renderDeliveryOrders();
      } catch(_){}
      try {
        var shipOv = document.getElementById('shippedOverlay');
        if (shipOv && shipOv.classList.contains('open') && typeof renderShippedOrders === 'function') renderShippedOrders();
      } catch(_){}
      try {
        var pendOv = document.getElementById('pendingOverlay');
        if (pendOv && pendOv.classList.contains('open') && typeof renderPendingOrders === 'function') renderPendingOrders();
      } catch(_){}
    }
    // 토스트 + 완료 팝업 — 0건이면 눈에 띄게 경고, 아니면 완료 메시지 표시.
    if (totalDeleted === 0) {
      showToast('⚠️ 삭제 대상 0건 — 필터 매칭 실패 또는 이미 비어 있음. (Console 확인)');
      neoAlert('⚠️ 삭제 대상 데이터가 없습니다.\n(이미 비어 있거나 필터 조건에 해당하는 항목이 없습니다)');
    } else {
      showToast('✅ ' + totalDeleted + '건 삭제됨');
      var _perColMsg = Object.keys(perCol).map(function(k){ return '  • ' + k + ': ' + perCol[k] + '건'; }).join('\n');
      neoAlert('✅ 초기화가 완료되었습니다.\n\n총 ' + totalDeleted + '건 삭제됨' + (_perColMsg ? '\n' + _perColMsg : ''));
    }
    // 배지 및 캐시 갱신
    if (leafKey.indexOf('customer') === 0) { if (typeof updatePendCustBadge === 'function') updatePendCustBadge(0); }
    if (leafKey.indexOf('prod_reg') === 0) { _pendingProducts = []; _updatePendProdBadge(); }
    if (leafKey.indexOf('order') === 0 || leafKey.indexOf('ship') === 0) { if (typeof updateBadgeCount === 'function') updateBadgeCount(0); }
    if (leafKey.indexOf('quote') === 0) { window._quotePendingCount = 0; _updateMobOrderCatBadge(); }
  } catch(e) {
    console.error('%c[McReset] FAIL', 'background:#dc2626;color:#fff;padding:2px 6px;border-radius:4px;', e);
    neoAlert('❌ 초기화 실패: ' + (e.message || '오류') + '\n\n(Console 의 [McReset] 로그를 확인해 주세요)');
  }
}

// 1차 서브패널 내 메뉴 클릭 → 2차 서브패널에 children 슬라이드
var _mcOpenSub2Idx = -1;
function openMcSub2Panel(subIdx) {
  if (_mcOpenSub2Idx === subIdx) { closeMcSub2Panel(); return; }
  _mcOpenSub2Idx = subIdx;
  var item = _getMcItem(subIdx);
  if (!item || !item.children) return;
  var title = document.getElementById('mcSub2PanelTitle');
  var body = document.getElementById('mcSub2PanelBody');
  if (title) title.textContent = item.icon + ' ' + (item.i18n ? t(item.i18n) : item.label || '');
  var html = _renderMcLeafItems(item.children, item.key);
  if (body) body.innerHTML = html;
  // 서브패널 화살표 갱신
  document.querySelectorAll('#mcSubPanelBody .mc-arrow-ind').forEach(function(a) { a.style.transform = ''; });
  var activeArrow = document.querySelector('#mcSubPanelBody .mc-arrow-ind[data-arr-idx="' + subIdx + '"]');
  if (activeArrow) activeArrow.style.transform = 'rotate(90deg)';
  document.getElementById('mcSub2Panel').classList.add('open');
}

function closeMcSub2Panel() {
  _mcOpenSub2Idx = -1;
  var sp = document.getElementById('mcSub2Panel');
  if (sp) sp.classList.remove('open');
  document.querySelectorAll('#mcSubPanelBody .mc-arrow-ind').forEach(function(a) { a.style.transform = ''; });
}

// 일반 메뉴 (그룹에 속하지 않는) 클릭 → 1차 서브패널에 children 표시
function toggleMcSubPanel(idx) {
  closeMcSub2Panel();
  if (_mcOpenSubIdx === idx) { closeMcSubPanel(); return; }
  _mcOpenSubIdx = idx;
  _mcOpenGrpIdx = -1;
  var item = _getMcItem(idx);
  if (!item || !item.children) return;
  var title = document.getElementById('mcSubPanelTitle');
  var body = document.getElementById('mcSubPanelBody');
  if (title) title.textContent = item.icon + ' ' + (item.i18n ? t(item.i18n) : item.label || '');
  var html = _renderMcLeafItems(item.children, item.key);
  if (body) body.innerHTML = html;
  document.querySelectorAll('#menuConfigBody .mc-arrow-ind').forEach(function(a) { a.style.transform = ''; });
  var activeArrow = document.querySelector('#menuConfigBody .mc-arrow-ind[data-arr-idx="' + idx + '"]');
  if (activeArrow) activeArrow.style.transform = 'rotate(90deg)';
  document.getElementById('mcSubPanel').classList.add('open');
}

// ← 버튼: 2차 패널이 열려있으면 2차만 닫고, 아니면 1차 닫기
function _mcSubPanelBack() {
  if (_mcOpenSub2Idx !== -1) { closeMcSub2Panel(); return; }
  closeMcSubPanel();
}

function closeMcSubPanel() {
  _mcOpenSubIdx = -1;
  _mcOpenGrpIdx = -1;
  closeMcSub2Panel();
  var sp = document.getElementById('mcSubPanel');
  if (sp) sp.classList.remove('open');
  document.querySelectorAll('.mc-arrow-ind').forEach(function(a) { a.style.transform = ''; });
}
function _mcParentToggle(cb, idx) {
  var item = _getMcItem(idx);
  if (!item || !item.children) return;
  if (_mcOpenSubIdx === idx) {
    var subPanel = document.getElementById('mcSubPanelBody');
    if (subPanel) subPanel.querySelectorAll('input[data-mc-key]').forEach(function(s) { s.checked = cb.checked; });
  }
}
// ── 드래그 정렬 ──
function _initMcDrag(container) {
  var dragEl = null;
  var placeholder = null;
  var rects = [];

  container.addEventListener('dragstart', function(e) {
    var row = e.target.closest('.mc-row');
    if (!row) return;
    dragEl = row;
    // 위치 기록
    rects = [];
    container.querySelectorAll('.mc-row').forEach(function(r) {
      rects.push({ el: r, top: r.getBoundingClientRect().top });
    });
    // placeholder 생성
    placeholder = document.createElement('div');
    placeholder.className = 'mc-row-placeholder';
    placeholder.style.cssText = 'height:' + row.offsetHeight + 'px;border:2px dashed #a5b4fc;border-radius:10px;background:#eef2ff;margin:4px 0;transition:height .2s;';
    setTimeout(function() {
      row.style.cssText += 'position:fixed;z-index:100000;width:' + (container.offsetWidth - 32) + 'px;pointer-events:none;opacity:0.9;background:#fff;box-shadow:0 8px 25px rgba(0,0,0,.18);border-radius:10px;transform:scale(1.03);transition:none;left:16px;';
      row.style.top = (e.clientY - row.offsetHeight / 2) + 'px';
      container.insertBefore(placeholder, row.nextSibling);
    }, 0);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(new Image(), 0, 0);
  });

  container.addEventListener('drag', function(e) {
    if (!dragEl || !e.clientY) return;
    dragEl.style.top = (e.clientY - dragEl.offsetHeight / 2) + 'px';
  });

  container.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!placeholder) return;
    var target = e.target.closest('.mc-row');
    if (!target || target === dragEl || target === placeholder) return;
    var rect = target.getBoundingClientRect();
    var mid = rect.top + rect.height / 2;
    if (e.clientY < mid) {
      container.insertBefore(placeholder, target);
    } else {
      container.insertBefore(placeholder, target.nextSibling);
    }
    // 밀려나는 효과
    container.querySelectorAll('.mc-row').forEach(function(r) {
      if (r === dragEl) return;
      r.style.transition = 'transform .2s ease';
      r.style.transform = '';
    });
  });

  container.addEventListener('dragend', function(e) {
    if (!dragEl) return;
    // placeholder 위치에 삽입
    if (placeholder && placeholder.parentNode) {
      container.insertBefore(dragEl, placeholder);
      placeholder.remove();
    }
    placeholder = null;
    // 스타일 복원
    dragEl.style.cssText = 'border-bottom:1px solid #f1f5f9;';
    container.querySelectorAll('.mc-row').forEach(function(r) {
      r.style.transition = '';
      r.style.transform = '';
    });
    dragEl = null;
    // 순서 반영
    var rows = container.querySelectorAll('.mc-row');
    var newOrder = [];
    rows.forEach(function(r) { newOrder.push(parseInt(r.dataset.mcIdx)); });
    var reordered = newOrder.filter(function(i) { return !isNaN(i); }).map(function(i) { return MENU_CONFIG_ITEMS[i]; });
    MENU_CONFIG_ITEMS.splice(0, MENU_CONFIG_ITEMS.length);
    reordered.forEach(function(it) { MENU_CONFIG_ITEMS.push(it); });
    rows.forEach(function(r, i) { r.dataset.mcIdx = i; });
    closeMcSubPanel();
    rows.forEach(function(r, i) {
      var clickDiv = r.querySelector('[onclick*="toggleMcSubPanel"], [onclick*="toggleMcGroupPanel"]');
      if (clickDiv) {
        var isGrp = clickDiv.getAttribute('onclick').indexOf('toggleMcGroupPanel') > -1;
        clickDiv.setAttribute('onclick', (isGrp ? 'toggleMcGroupPanel(' : 'toggleMcSubPanel(') + i + ')');
      }
      var toggleCb = r.querySelector('input[onchange*="_mcParentToggle"]');
      if (toggleCb) toggleCb.setAttribute('onchange', '_mcParentToggle(this,' + i + ')');
      var arrow = r.querySelector('.mc-arrow-ind');
      if (arrow) arrow.dataset.arrIdx = i;
    });
  });
}

function closeMenuConfig() {
  closeMcSubPanel();
  var ov = document.getElementById('menuConfigOverlay');
  if (ov) ov.classList.remove('open');
  var bd = document.getElementById('mcSlideBackdrop');
  if (bd) bd.style.display = 'none';
}

var _mcSaveTimer = null;
function _mcAutoSave() {
  clearTimeout(_mcSaveTimer);
  _mcSaveTimer = setTimeout(function() { saveMenuConfig(); }, 400);
}
async function saveMenuConfig() {
  var btn = document.getElementById('btnMenuConfigSave');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  var config = {};
  document.querySelectorAll('#menuConfigBody input[data-mc-key], #mcSubPanelBody input[data-mc-key], #mcSub2PanelBody input[data-mc-key]').forEach(function(cb) {
    config[cb.dataset.mcKey] = cb.checked;
  });
  try {
    await _fbDb.collection('settings').doc('menuConfig').set(config);
    _menuConfig = config;
    _applyMenuConfig();
    if (btn) { btn.textContent = '✅ ' + t('mc_saved'); setTimeout(function() { btn.textContent = t('mc_save'); btn.disabled = false; }, 1500); }
  } catch (e) {
    console.error('[MenuConfig] save error:', e);
    if (btn) { btn.textContent = t('mc_save'); btn.disabled = false; }
    neoAlert('저장 실패: ' + e.message);
  }
}

// ── 출퇴근 (Attendance) 기능 ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
var _attendClockTimer = null;

function openAttendance() {
  var ov = document.getElementById('attendOverlay');
  if (!ov) return;
  ov.classList.add('open');
  _bringToFront(ov);
  _startAttendClock();
  _loadTodayAttendance();
}

function closeAttendance() {
  var ov = document.getElementById('attendOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  if (_attendClockTimer) { clearInterval(_attendClockTimer); _attendClockTimer = null; }
}

function _startAttendClock() {
  var clockEl = document.getElementById('attendClock');
  var dateEl = document.getElementById('attendDate');
  var lastDateStr = null; // 자정 넘김 감지용
  function tick() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');
    if (clockEl) clockEl.textContent = h + ':' + m + ':' + s;
    var dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    if (dateEl) {
      var days = [t('att_day_sun'),t('att_day_mon'),t('att_day_tue'),t('att_day_wed'),t('att_day_thu'),t('att_day_fri'),t('att_day_sat')];
      dateEl.textContent = dateStr + ' (' + days[now.getDay()] + ')';
    }
    // 자정이 지났는데 퇴근/복귀를 안 누른 상태 그대로 모달이 열려 있으면
    // 오늘 기록을 다시 로드하여 버튼 상태를 리셋 (어제 기록은 today 쿼리에서 제외됨)
    if (lastDateStr && lastDateStr !== dateStr) {
      try { _loadTodayAttendance(); } catch(e) {}
    }
    lastDateStr = dateStr;
  }
  tick();
  if (_attendClockTimer) clearInterval(_attendClockTimer);
  _attendClockTimer = setInterval(tick, 1000);
}

async function _loadTodayAttendance() {
  var user = getCurrentUser();
  if (!user || !user.empid) return;
  var statusEl = document.getElementById('attendStatus');
  var btnIn = document.getElementById('attendBtnIn');
  var btnOut = document.getElementById('attendBtnOut');
  var btnDepart = document.getElementById('attendBtnDepart');
  var btnReturn = document.getElementById('attendBtnReturn');
  var histEl = document.getElementById('attendHistory');
  var locEl = document.getElementById('attendLocation');

  // 오늘 날짜 문자열 (YYYY-MM-DD, 로컬 기준)
  var now = new Date();
  var todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  try {
    var snap = await _fbDb.collection('attendance')
      .where('empid', '==', user.empid)
      .where('date', '==', todayStr)
      .orderBy('timestamp', 'asc')
      .get();

    var records = [];
    snap.forEach(function(d) { records.push(d.data()); });

    // 상태 판단
    var lastRecord = records.length > 0 ? records[records.length - 1] : null;
    var outCount = records.filter(function(r) { return r.type === 'out'; }).length;
    var inCount = records.filter(function(r) { return r.type === 'in'; }).length;
    var departCount = records.filter(function(r) { return r.type === 'depart'; }).length;
    var returnCount = records.filter(function(r) { return r.type === 'return'; }).length;
    if (statusEl) {
      statusEl.className = 'attend-status';
      if (!lastRecord) {
        statusEl.textContent = t('att_not_in');
      } else if (lastRecord.type === 'in') {
        statusEl.textContent = t('att_working');
        statusEl.classList.add('checked-in');
      } else if (lastRecord.type === 'depart') {
        statusEl.textContent = t('att_departed');
        statusEl.classList.add('checked-in');
      } else if (lastRecord.type === 'return') {
        statusEl.textContent = t('att_returned');
        statusEl.classList.add('checked-in');
      } else {
        statusEl.textContent = t('att_done') + (outCount > 1 ? ' (' + outCount + t('att_times') + ')' : '');
        statusEl.classList.add('checked-out');
      }
    }

    // 버튼 상태 로직:
    // 초기: 출발 + Clock In만 활성화
    // Clock In 후: 출발 비활성화, Clock Out 활성화
    // Clock Out 후: 복귀 활성화
    if (btnDepart) btnDepart.disabled = true;
    if (btnIn) btnIn.disabled = true;
    if (btnOut) btnOut.disabled = true;
    if (btnReturn) btnReturn.disabled = true;

    if (!lastRecord) {
      // 기록 없음: 출발 + Clock In 활성화
      if (btnDepart) btnDepart.disabled = false;
      if (btnIn) btnIn.disabled = false;
    } else if (lastRecord.type === 'depart') {
      // 출발 후: Clock In 활성화
      if (btnIn) btnIn.disabled = false;
    } else if (lastRecord.type === 'in') {
      // Clock In 후: Clock Out 활성화
      if (btnOut) btnOut.disabled = false;
    } else if (lastRecord.type === 'out') {
      // Clock Out 후: 복귀 활성화 — 단, 미매칭 출발(depart > return)이 있을 때만.
      // (출발 없이 출근만 누른 경우 복귀 비활성화)
      if (btnReturn) btnReturn.disabled = !(departCount > returnCount);
    } else if (lastRecord.type === 'return') {
      // 복귀 완료: 출발 + Clock In 다시 활성화 (다음 외근)
      if (btnDepart) btnDepart.disabled = false;
      if (btnIn) btnIn.disabled = false;
    }

    // 히스토리 표시
    if (histEl) {
      var html = '<div class="attend-history-title">' + t('att_today') + '</div>';
      if (records.length === 0) {
        html += '<div style="text-align:center;color:#9ca3af;font-size:13px;padding:12px;">' + t('att_no_record') + '</div>';
      } else {
        var outIdx = 0;
        var typeClassMap = { 'in': 'type-in', 'out': 'type-out', 'depart': 'type-depart', 'return': 'type-return' };
        var typeLabelMap = { 'in': t('att_btn_in'), 'out': t('att_btn_out'), 'depart': t('att_btn_depart'), 'return': t('att_btn_return') };
        records.forEach(function(r) {
          var typeClass = typeClassMap[r.type] || 'type-in';
          var typeLabel = typeLabelMap[r.type] || r.type;
          if (r.type === 'out') { outIdx++; if (outCount > 1) typeLabel += ' (' + outIdx + '/' + outCount + ')'; }
          html += '<div class="attend-history-row">';
          html += '<span class="ah-type ' + typeClass + '">' + typeLabel + '</span>';
          html += '<span class="ah-time">' + (r.time || '-') + '</span>';
          html += '</div>';
        });
      }
      histEl.innerHTML = html;
    }

    if (locEl) locEl.textContent = '';
  } catch (e) {
    console.error('[Attendance] load error:', e);
    // 인덱스 미생성 등 에러 시 버튼 활성화 (사용 가능하게)
    if (btnIn) btnIn.disabled = false;
    if (btnOut) btnOut.disabled = false;
    if (btnDepart) btnDepart.disabled = false;
    if (btnReturn) btnReturn.disabled = false;
    if (statusEl) { statusEl.className = 'attend-status'; statusEl.textContent = t('att_load_fail'); }
    if (histEl) histEl.innerHTML = '<div style="text-align:center;color:#ef4444;font-size:12px;padding:12px;">' + t('att_load_fail_msg') + '</div>';
  }
}

async function recordAttendance(type) {
  var user = getCurrentUser();
  if (!user || !user.empid) { neoAlert(t('att_login_required')); return; }

  // Clock In을 출발 없이 누른 경우 확인
  if (type === 'in') {
    try {
      var now0 = new Date();
      var today0 = now0.getFullYear() + '-' + String(now0.getMonth()+1).padStart(2,'0') + '-' + String(now0.getDate()).padStart(2,'0');
      var snap0 = await _fbDb.collection('attendance')
        .where('empid', '==', user.empid)
        .where('date', '==', today0)
        .orderBy('timestamp', 'asc')
        .get();
      var recs = [];
      snap0.forEach(function(d) { recs.push(d.data()); });
      var lastRec = recs.length > 0 ? recs[recs.length - 1] : null;
      var hasDepartWithoutIn = false;
      // 마지막 기록이 depart면 출발 후 Clock In하는 정상 흐름
      if (lastRec && lastRec.type === 'depart') hasDepartWithoutIn = true;
      if (!hasDepartWithoutIn) {
        if (!confirm(t('att_no_depart_confirm'))) {
          return;
        }
      }
    } catch (e) {
      // 쿼리 실패 시 확인 없이 진행
      console.warn('[Attendance] depart check failed:', e);
    }
  }

  var btnIn = document.getElementById('attendBtnIn');
  var btnOut = document.getElementById('attendBtnOut');
  var btnDepart = document.getElementById('attendBtnDepart');
  var btnReturn = document.getElementById('attendBtnReturn');
  var locEl = document.getElementById('attendLocation');
  var typeLabelMap = { 'in': t('att_btn_in'), 'out': t('att_btn_out'), 'depart': t('att_btn_depart'), 'return': t('att_btn_return') };
  var typeIconMap = { 'in': '☀️', 'out': '🌙', 'depart': '🚗', 'return': '🏠' };
  var typeLabel = typeLabelMap[type] || type;
  var typeIcon = typeIconMap[type] || '📋';

  if (btnIn) btnIn.disabled = true;
  if (btnOut) btnOut.disabled = true;
  if (btnDepart) btnDepart.disabled = true;
  if (btnReturn) btnReturn.disabled = true;
  if (locEl) locEl.textContent = t('att_locating');

  // GPS 위치 가져오기 (타임아웃 포함)
  var lat = null, lng = null, address = '';
  try {
    var pos = await Promise.race([
      new Promise(function(resolve, reject) {
        if (!navigator.geolocation) { reject(new Error(t('att_gps_unsupported'))); return; }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 60000
        });
      }),
      new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error(t('att_gps_timeout'))); }, 20000);
      })
    ]);
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
    address = lat.toFixed(6) + ', ' + lng.toFixed(6);
    if (locEl) locEl.textContent = t('att_geocoding');

    // 역지오코딩 시도 (Google Maps) - 5초 타임아웃
    if (window.google && google.maps && google.maps.Geocoder) {
      try {
        var geoResult = await Promise.race([
          new Promise(function(resolve, reject) {
            new google.maps.Geocoder().geocode({ location: { lat: lat, lng: lng } }, function(results, status) {
              if (status === 'OK' && results[0]) resolve(results[0].formatted_address);
              else reject(status);
            });
          }),
          new Promise(function(_, reject) { setTimeout(function() { reject('geo timeout'); }, 5000); })
        ]);
        address = geoResult;
      } catch (ge) { /* 역지오코딩 실패 → 좌표만 사용 */ }
    }
  } catch (e) {
    console.warn('[Attendance] GPS error:', e.message || e);
    address = t('att_loc_unavailable');
  }

  if (locEl) locEl.textContent = address;

  // 현재 시간
  var now = new Date();
  var todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  var timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');

  // 퇴근 시 업무 내용 입력 (필수)
  var workNote = '';
  if (type === 'out') {
    // 출퇴근 오버레이 먼저 닫기 → 업무 내용 다이얼로그만 표시
    var attOv = document.getElementById('attendOverlay');
    if (attOv) attOv.classList.remove('open');
    workNote = await _showWorkNoteDialog();
    if (workNote === null) {
      // 취소 → 출퇴근 오버레이 다시 열기
      if (attOv) attOv.classList.add('open');
      await _loadTodayAttendance();
      return;
    }
  }

  // 확인 다이얼로그 표시
  var confirmTitleMap = { 'in': t('att_confirm_in'), 'out': t('att_confirm_out'), 'depart': t('att_confirm_depart'), 'return': t('att_confirm_return') };
  var confirmMsgMap = { 'in': t('att_confirm_msg_in'), 'out': t('att_confirm_msg_out'), 'depart': t('att_confirm_msg_depart'), 'return': t('att_confirm_msg_return') };
  var needsHighway = (type === 'in' || type === 'return');
  var usedHighway = null;

  if (needsHighway) {
    var r = await _showAttendanceConfirmDialog({
      title: typeIcon + ' ' + (confirmTitleMap[type] || typeLabel),
      fields: [
        { label: t('att_lbl_name'), value: user.name || user.empid },
        { label: t('att_lbl_empid'), value: user.empid },
        { label: t('att_lbl_dept'), value: user.dept || '-' },
        { label: t('att_lbl_time'), value: timeStr },
        { label: t('att_lbl_date'), value: todayStr },
        { label: t('att_lbl_location'), value: address }
      ],
      workNote: workNote,
      message: confirmMsgMap[type] || '',
      showHighway: true
    });
    if (!r.confirmed) {
      await _loadTodayAttendance();
      return;
    }
    usedHighway = r.usedHighway;
  } else {
    var confirmMsg = typeIcon + ' ' + (confirmTitleMap[type] || typeLabel) + '\n\n'
      + t('att_lbl_name') + ': ' + (user.name || user.empid) + '\n'
      + t('att_lbl_empid') + ': ' + user.empid + '\n'
      + t('att_lbl_dept') + ': ' + (user.dept || '-') + '\n'
      + t('att_lbl_time') + ': ' + timeStr + '\n'
      + t('att_lbl_date') + ': ' + todayStr + '\n'
      + t('att_lbl_location') + ': ' + address
      + (workNote ? '\n' + t('att_lbl_work') + ': ' + workNote : '') + '\n\n'
      + (confirmMsgMap[type] || '');

    if (!confirm(confirmMsg)) {
      // 취소 시 버튼 복원
      await _loadTodayAttendance();
      return;
    }
  }

  // 확인 후 시간 갱신 (확인 대기 중 시간 경과 반영)
  now = new Date();
  todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');

  // Firestore 저장
  var record = {
    empid: user.empid,
    name: user.name || user.empid,
    nickname: user.nickname || '',
    dept: user.dept || '',
    type: type,
    date: todayStr,
    time: timeStr,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    lat: lat,
    lng: lng,
    address: address,
    workNote: workNote || ''
  };
  if (usedHighway !== null && usedHighway !== undefined) record.usedHighway = !!usedHighway;

  try {
    // Firestore 규칙: docId 가 '{empid}_' 로 시작해야 본인 쓰기 허용
    var _attDocId = user.empid + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    await _fbDb.collection('attendance').doc(_attDocId).set(record);

    // 관리자에게 FCM 알림을 위한 attendanceNotify 컬렉션에 기록
    await _fbDb.collection('attendanceNotify').add({
      empid: user.empid,
      name: user.name || user.empid,
      nickname: user.nickname || '',
      dept: user.dept || '',
      type: type,
      typeLabel: typeLabel,
      date: todayStr,
      time: timeStr,
      address: address,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 성공 알림
    neoAlert(typeIcon + ' ' + typeLabel + ' ' + t('att_complete') + '\n' + t('att_time_label') + ': ' + timeStr);

    // 새로고침
    await _loadTodayAttendance();
  } catch (e) {
    console.error('[Attendance] save error:', e);
    neoAlert(t('att_save_error') + e.message);
    // 버튼 복원
    await _loadTodayAttendance();
  }
}

// ── 퇴근 시 업무 내용 입력 다이얼로그 ──
function _showWorkNoteDialog() {
  return new Promise(function(resolve) {
    // 기존 다이얼로그 제거
    var old = document.getElementById('workNoteDialog');
    if (old) old.remove();

    var div = document.createElement('div');
    div.id = 'workNoteDialog';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
    div.innerHTML =
      '<div style="background:#fff;border-radius:16px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;">' +
        '<div style="padding:18px 20px 14px;border-bottom:1px solid #e5e7eb;">' +
          '<h3 style="margin:0;font-size:16px;font-weight:700;">📝 ' + t('att_worknote_title') + '</h3>' +
          '<p style="margin:6px 0 0;font-size:12px;color:#6b7280;">' + t('att_worknote_desc') + '</p>' +
        '</div>' +
        '<div style="padding:16px 20px;">' +
          '<textarea id="workNoteText" rows="4" placeholder="' + t('att_worknote_ph') + '" style="width:100%;border:1.5px solid #d1d5db;border-radius:10px;padding:12px;font-size:14px;font-family:inherit;resize:vertical;outline:none;box-sizing:border-box;"></textarea>' +
          '<div id="workNoteErr" style="display:none;color:#ef4444;font-size:12px;margin-top:6px;">' + t('att_worknote_err') + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;padding:12px 20px 18px;justify-content:flex-end;">' +
          '<button id="workNoteCancel" style="padding:10px 20px;background:#f3f4f6;color:#374151;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">' + t('att_worknote_cancel') + '</button>' +
          '<button id="workNoteSubmit" style="padding:10px 20px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">' + t('att_worknote_confirm') + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(div);
    var ta = document.getElementById('workNoteText');
    var errEl = document.getElementById('workNoteErr');
    if (ta) ta.focus();

    document.getElementById('workNoteSubmit').onclick = function() {
      var val = ta ? ta.value.trim() : '';
      if (!val) {
        if (errEl) errEl.style.display = '';
        if (ta) { ta.style.borderColor = '#ef4444'; ta.focus(); }
        return;
      }
      div.remove();
      resolve(val);
    };
    document.getElementById('workNoteCancel').onclick = function() {
      div.remove();
      resolve(null);
    };
    div.addEventListener('click', function(e) {
      if (e.target === div) { div.remove(); resolve(null); }
    });
  });
}

function _showAttendanceConfirmDialog(opts) {
  return new Promise(function(resolve) {
    var old = document.getElementById('attConfirmDialog');
    if (old) old.remove();

    function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

    var fieldsHtml = (opts.fields || []).map(function(f) {
      return '<div style="display:flex;gap:8px;font-size:13px;margin:4px 0;line-height:1.4;">'
        + '<span style="min-width:78px;color:#6b7280;flex-shrink:0;">' + esc(f.label) + ':</span>'
        + '<span style="color:#111827;flex:1;word-break:break-word;">' + esc(f.value) + '</span>'
        + '</div>';
    }).join('');
    if (opts.workNote) {
      fieldsHtml += '<div style="display:flex;gap:8px;font-size:13px;margin:4px 0;line-height:1.4;">'
        + '<span style="min-width:78px;color:#6b7280;flex-shrink:0;">' + esc(t('att_lbl_work')) + '</span>'
        + '<span style="color:#111827;flex:1;word-break:break-word;">' + esc(opts.workNote) + '</span>'
        + '</div>';
    }

    var highwayHtml = '';
    if (opts.showHighway) {
      highwayHtml =
        '<div style="display:flex;align-items:center;gap:10px;font-size:13px;color:#374151;flex-wrap:wrap;">'
          + '<span style="font-weight:600;">🛣️ ' + esc(t('att_highway_q')) + '</span>'
          + '<label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">'
            + '<input type="radio" name="attHighwayOpt" value="no" checked style="accent-color:#2563eb;"> ' + esc(t('att_highway_no'))
          + '</label>'
          + '<label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">'
            + '<input type="radio" name="attHighwayOpt" value="yes" style="accent-color:#2563eb;"> ' + esc(t('att_highway_yes'))
          + '</label>'
        + '</div>';
    }

    var div = document.createElement('div');
    div.id = 'attConfirmDialog';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;';
    div.innerHTML =
      '<div style="background:#fff;border-radius:16px;width:100%;max-width:440px;max-height:90vh;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;display:flex;flex-direction:column;">'
        + '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;font-size:15px;font-weight:700;color:#111827;">' + esc(opts.title) + '</div>'
        + '<div style="padding:14px 20px;overflow-y:auto;">'
          + fieldsHtml
          + (opts.message ? '<div style="margin-top:12px;padding-top:12px;border-top:1px dashed #e5e7eb;font-size:13px;color:#374151;">' + esc(opts.message) + '</div>' : '')
        + '</div>'
        + '<div style="display:flex;align-items:center;padding:12px 20px 18px;gap:12px;flex-wrap:wrap;border-top:1px solid #f3f4f6;">'
          + highwayHtml
          + '<div style="margin-left:auto;display:flex;gap:8px;">'
            + '<button id="attConfirmCancel" style="padding:10px 18px;background:#f3f4f6;color:#374151;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">' + esc(t('att_worknote_cancel')) + '</button>'
            + '<button id="attConfirmOk" style="padding:10px 18px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">' + esc(t('att_worknote_confirm')) + '</button>'
          + '</div>'
        + '</div>'
      + '</div>';

    document.body.appendChild(div);
    document.getElementById('attConfirmOk').onclick = function() {
      var usedHighway = null;
      if (opts.showHighway) {
        var sel = div.querySelector('input[name="attHighwayOpt"]:checked');
        usedHighway = !!(sel && sel.value === 'yes');
      }
      div.remove();
      resolve({ confirmed: true, usedHighway: usedHighway });
    };
    document.getElementById('attConfirmCancel').onclick = function() {
      div.remove();
      resolve({ confirmed: false, usedHighway: null });
    };
    div.addEventListener('click', function(e) {
      if (e.target === div) { div.remove(); resolve({ confirmed: false, usedHighway: null }); }
    });
  });
}

// ── 주소에서 Amphoe + Province 추출 ──
function _extractAmphoeProvince(addr) {
  if (!addr) return '-';
  // Google 역지오코딩 결과: "..., Khwaeng X, Khet Y, Krung Thep Maha Nakhon 10110, Thailand" 형식
  // 또는 태국어: "..., แขวงX, เขตY, กรุงเทพมหานคร 10110"
  var parts = addr.split(',').map(function(s) { return s.trim(); });
  // Khet/Amphoe + Province 찾기
  var amphoe = '', province = '';
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    // 영문: "Khet ..." / "Amphoe ..."
    if (/^Khet\s/i.test(p) || /^Amphoe\s/i.test(p)) amphoe = p;
    // 태국어: "เขต..." / "อำเภอ..."
    else if (/^เขต/.test(p) || /^อำเภอ/.test(p) || /^อ\./.test(p)) amphoe = p;
    // Province: 보통 우편번호 포함 또는 마지막에서 2번째
    // 영문: "Krung Thep...", "Chiang Mai", "Chon Buri" 등
    // 태국어: "กรุงเทพ...", "จ." 등
    else if (/\d{5}/.test(p)) province = p.replace(/\d{5,}/, '').replace(/태국|Thailand|ประเทศไทย|ไทย/gi, '').trim();
    // "태국" / "Thailand" 제외
    else if (/^Thailand$|^태국$|^ประเทศไทย$|^ไทย$/i.test(p)) continue;
  }
  // Province가 비어 있으면 마지막에서 2번째 파트 사용 (우편번호 제거)
  if (!province && parts.length >= 3) {
    province = parts[parts.length - 2].replace(/\d{5,}/, '').trim();
  }
  if (amphoe && province) return amphoe + ', ' + province;
  if (amphoe) return amphoe;
  if (province) return province;
  // 파싱 실패 시 주소 끝부분만 표시
  if (parts.length >= 2) return parts.slice(-3, -1).join(', ');
  return addr.length > 30 ? addr.slice(-30) + '...' : addr;
}

// ── 이동거리 계산 (Distance Matrix API) ──
function _calcAttendDistances() {
  if (!window.google || !google.maps || !google.maps.DistanceMatrixService) return;
  var cells = document.querySelectorAll('[id^="asDist_"][data-in-lat]');
  if (!cells.length) return;
  var service = new google.maps.DistanceMatrixService();
  // API 제한으로 한 번에 최대 25개씩 처리
  var arr = Array.from(cells);
  var batchSize = 10;

  function processBatch(startIdx) {
    if (startIdx >= arr.length) return;
    var batch = arr.slice(startIdx, startIdx + batchSize);
    var origins = [], destinations = [];
    batch.forEach(function(cell) {
      origins.push(new google.maps.LatLng(parseFloat(cell.dataset.inLat), parseFloat(cell.dataset.inLng)));
      destinations.push(new google.maps.LatLng(parseFloat(cell.dataset.outLat), parseFloat(cell.dataset.outLng)));
    });

    // Distance Matrix는 origins×destinations 매트릭스를 반환 → 1:1 매핑을 위해 개별 호출
    batch.forEach(function(cell, i) {
      var origin = new google.maps.LatLng(parseFloat(cell.dataset.inLat), parseFloat(cell.dataset.inLng));
      var dest = new google.maps.LatLng(parseFloat(cell.dataset.outLat), parseFloat(cell.dataset.outLng));
      service.getDistanceMatrix({
        origins: [origin],
        destinations: [dest],
        travelMode: 'DRIVING',
        unitSystem: google.maps.UnitSystem.METRIC
      }, function(response, status) {
        if (status === 'OK' && response.rows[0] && response.rows[0].elements[0]) {
          var el = response.rows[0].elements[0];
          if (el.status === 'OK') {
            var km = (el.distance.value / 1000).toFixed(1);
            var dur = el.duration.text;
            cell.innerHTML = '<strong style="color:#374151;">' + km + ' km</strong><br><span style="font-size:10px;color:#9ca3af;">' + dur + '</span>';
          } else {
            cell.textContent = '-';
          }
        } else {
          cell.textContent = '-';
        }
      });
    });

    // 다음 배치 (Rate limit 방지 딜레이)
    if (startIdx + batchSize < arr.length) {
      setTimeout(function() { processBatch(startIdx + batchSize); }, 1000);
    }
  }

  processBatch(0);
}

// ── 출퇴근 집계 ─────────────────────────────────────────────────────────────
// ── 출퇴근 집계 엑셀 다운로드 ──
function exportAttendanceExcel() {
  var body = document.getElementById('attendSummaryBody');
  if (!body || !body.querySelector('table')) { neoAlert(t('att_excel_search_first')); return; }
  if (!window.XLSX) { neoAlert(t('att_excel_loading')); return; }

  // 체크된 행만 내보내기 (PDF 버튼과 동일 정책)
  var _anyChecked = body.querySelectorAll('.as-row-cb:checked');
  if (!_anyChecked.length) { neoAlert(t('att_pdf_no_check')); return; }

  var wb = XLSX.utils.book_new();
  // 테이블 데이터 수집 (직원별 카드)
  var cards = body.querySelectorAll('div[style*="border:1px solid"]');
  var allRows = [];
  allRows.push([t('att_excel_name'), t('att_excel_empid'), t('att_excel_dept'), t('att_excel_date'), t('att_excel_in'), t('att_excel_out'), t('att_excel_hours'), t('att_excel_loc'), t('att_excel_dist'), t('att_excel_work')]);

  cards.forEach(function(card) {
    // 헤더에서 이름, 사번, 부서 추출
    var hdr = card.querySelector('strong');
    var sub = card.querySelector('span[style*="color:#6b7280"]');
    var name = hdr ? hdr.textContent : '';
    var subText = sub ? sub.textContent : '';
    var empid = '', dept = '';
    var subMatch = subText.match(/([A-Z]\d+)/);
    if (subMatch) empid = subMatch[1];
    if (subText.indexOf('·') !== -1) dept = subText.split('·')[1].trim();

    var rows = card.querySelectorAll('tbody tr');
    rows.forEach(function(tr) {
      // 체크박스 미체크 시 skip
      var cb = tr.querySelector('.as-row-cb');
      if (!cb || !cb.checked) return;
      var cells = tr.querySelectorAll('td');
      if (cells.length < 7) return;
      var row = [name, empid, dept];
      cells.forEach(function(td) { row.push(td.textContent.trim()); });
      allRows.push(row);
    });
  });

  var ws = XLSX.utils.aoa_to_sheet(allRows);
  // 열 너비 자동 맞춤
  var colCount = allRows[0] ? allRows[0].length : 0;
  var colWidths = [];
  for (var ci = 0; ci < colCount; ci++) {
    var maxLen = 0;
    for (var ri = 0; ri < allRows.length; ri++) {
      var cell = allRows[ri][ci];
      if (cell == null) continue;
      var str = String(cell);
      // 한글/태국어 등 2바이트 문자는 폭 2로 계산
      var len = 0;
      for (var si = 0; si < str.length; si++) {
        len += str.charCodeAt(si) > 127 ? 2 : 1;
      }
      if (len > maxLen) maxLen = len;
    }
    colWidths.push({ wch: Math.max(maxLen + 2, 8) });
  }
  ws['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(wb, ws, t('att_excel_sheet'));

  var fromDate = (document.getElementById('asSDateFrom') || {}).value || '';
  var toDate = (document.getElementById('asSDateTo') || {}).value || '';
  var fileName = t('att_excel_file') + '_' + fromDate + '_' + toDate + '.xlsx';
  XLSX.writeFile(wb, fileName);
}

function _isAttendAdmin() {
  var me = getCurrentUser();
  return _isAdmin(me);
}

// 출퇴근 집계 열람 등급:
//   'all'     = 관리자 / 인사(HR) 팀장·그룹장·승인자 (전체 열람)
//   'team'    = 그룹장 / 승인자 역할 (본인 + 같은 그룹(dept))
//   'subteam' = 부서 팀장 (본인 + 같은 부서(sub_dept) 팀원)
//   'self'    = 열람 권한만 보유 (본인만)
//   false     = 권한 없음
function _attendSummaryLevel() {
  var me = getCurrentUser();
  if (!me) return false;
  if (_isAdmin(me)) return 'all';
  var perms = _ensurePermArray(me.permissions);
  var hasApprove = perms.includes('attend_summary_approve');
  var hasView    = perms.includes('attend_summary');
  var sub = (me.sub_dept || '').trim();
  var isHR = (sub === '인사' || sub.toUpperCase() === 'HR');
  var isGroupLead = me.position === 'group_leader';
  var isTeamLead  = me.position === 'leader';
  // 인사 부서 팀장/그룹장/승인자 → 전체 열람
  if (isHR && (isTeamLead || isGroupLead || me.role === 'approver' || hasApprove)) return 'all';
  // 그룹장 또는 승인자 역할 → 같은 그룹(dept)
  if (isGroupLead || (hasApprove && me.role === 'approver')) return 'team';
  // 부서 팀장 → 같은 부서(sub_dept) 팀원만
  if (isTeamLead) return 'subteam';
  // 승인 또는 열람 권한 → 본인만
  if (hasApprove || hasView) return 'self';
  return false;
}
function _canViewAllAttend() {
  return _attendSummaryLevel() === 'all';
}
function _asInitMonthFilter() {
  var sel = document.getElementById('asSMonthFilter');
  if (!sel) return;
  var now = new Date();
  var curY = now.getFullYear(), curM = now.getMonth(); // 0-based
  // 이미 초기화되어 있으면 스킵
  if (sel.getAttribute('data-init') === '1') return;
  sel.setAttribute('data-init', '1');
  sel.innerHTML = '';
  var lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
  var enMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  // 최근 12개월
  for (var i = 0; i < 12; i++) {
    var y = curY, m = curM - i;
    if (m < 0) { m += 12; y--; }
    var label;
    if (lang === 'en') label = enMonths[m] + ' ' + y;
    else if (lang === 'th') label = thMonths[m] + ' ' + (y + 543);
    else label = y + '년 ' + (m + 1) + '월';
    var val = y + '-' + String(m + 1).padStart(2, '0');
    var opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}

function _asMonthFilterChange(val) {
  if (!val) return;
  var parts = val.split('-');
  var y = parseInt(parts[0]), m = parseInt(parts[1]);
  var fromEl = document.getElementById('asSDateFrom');
  var toEl = document.getElementById('asSDateTo');
  var firstDay = y + '-' + String(m).padStart(2, '0') + '-01';
  // 해당 월의 마지막 날
  var lastDate = new Date(y, m, 0);
  var now = new Date();
  // 현재 월이면 오늘까지, 아니면 월말까지
  var endDate;
  if (y === now.getFullYear() && m === (now.getMonth() + 1)) {
    endDate = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  } else {
    endDate = lastDate.getFullYear() + '-' + String(lastDate.getMonth()+1).padStart(2,'0') + '-' + String(lastDate.getDate()).padStart(2,'0');
  }
  if (fromEl) fromEl.value = firstDay;
  if (toEl) toEl.value = endDate;
  loadAttendanceSummary();
}

function openAttendanceSummary() {
  var ov = document.getElementById('attendSummaryOverlay');
  if (!ov) return;
  // 헤더 아래로 위치
  var hdr = document.querySelector('.header');
  if (hdr) ov.style.top = hdr.offsetHeight + 'px';
  // 월간 필터 초기화
  _asInitMonthFilter();
  // 기본 날짜: 이번 달 1일 ~ 오늘
  var now = new Date();
  var fromEl = document.getElementById('asSDateFrom');
  var toEl = document.getElementById('asSDateTo');
  if (fromEl && !fromEl.value) fromEl.value = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-01';
  if (toEl && !toEl.value) toEl.value = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  // 등급별 필터 표시
  var level = _attendSummaryLevel();
  var deptSel = document.getElementById('asSDeptFilter');
  var subDeptSel = document.getElementById('asSSubDeptFilter');
  var empSel = document.getElementById('asSEmpFilter');
  if (level === 'all') {
    // 관리자/인사 팀장: 그룹+부서+직원 필터 모두 표시
    if (deptSel) deptSel.style.display = '';
    if (subDeptSel) subDeptSel.style.display = '';
    if (empSel) empSel.style.display = '';
    _loadAttendEmpFilter();
  } else if (level === 'team') {
    // 그룹장/승인자: 직원 필터만 (같은 그룹)
    if (deptSel) deptSel.style.display = 'none';
    if (subDeptSel) subDeptSel.style.display = 'none';
    if (empSel) empSel.style.display = '';
    _loadAttendEmpFilter('team');
  } else if (level === 'subteam') {
    // 부서 팀장: 직원 필터만 (같은 부서 sub_dept)
    if (deptSel) deptSel.style.display = 'none';
    if (subDeptSel) subDeptSel.style.display = 'none';
    if (empSel) empSel.style.display = '';
    _loadAttendEmpFilter('subteam');
  } else {
    // 일반: 필터 숨김
    if (deptSel) deptSel.style.display = 'none';
    if (subDeptSel) subDeptSel.style.display = 'none';
    if (empSel) empSel.style.display = 'none';
  }
  ov.classList.add('open');
}

function closeAttendanceSummary() {
  var ov = document.getElementById('attendSummaryOverlay');
  if (ov) ov.classList.remove('open');
  document.getElementById('attendSumMini').classList.remove('show');
}
function minimizeAttendSummary() {
  document.getElementById('attendSummaryOverlay').classList.remove('open');
  document.getElementById('attendSumMini').classList.add('show');
  _repositionMinis();
}
function restoreAttendSummary() {
  document.getElementById('attendSumMini').classList.remove('show');
  document.getElementById('attendSummaryOverlay').classList.add('open');
  _repositionMinis();
}
function modalToggleFS_attend(btn) {
  var ov = document.getElementById('attendSummaryOverlay');
  var modal = document.getElementById('attendSumModal');
  if (!modal || !ov) return;
  var goingSmall = ov.classList.contains('attend-fullscreen');
  if (goingSmall) {
    // 전체화면 → 축소
    ov.classList.remove('attend-fullscreen');
    modal.style.cssText = 'max-width:720px;width:95%;height:auto;max-height:90vh;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);';
    btn.innerHTML = '⛶';
    btn.title = '전체화면';
    _initAttendSumDrag();
  } else {
    // 축소 → 전체화면
    ov.classList.add('attend-fullscreen');
    modal.style.cssText = 'max-width:100%;width:100%;height:100%;max-height:100%;border-radius:0;box-shadow:none;';
    modal.style.position = '';
    modal.style.left = '';
    modal.style.top = '';
    btn.innerHTML = '&#x2750;';
    btn.title = '축소';
  }
}

// ── 출퇴근 집계 모달 드래그 ──
function _initAttendSumDrag() {
  var modal = document.getElementById('attendSumModal');
  var hdrEl = modal ? modal.querySelector('.attend-hdr') : null;
  if (!modal || !hdrEl) return;
  hdrEl.style.cursor = 'move';
  // core.js _makeDraggable 사용
  _makeDraggable({
    headerSel: '.attend-hdr',
    modalSel: '#attendSumModal',
    beforeDrag: function() {
      var ov = document.getElementById('attendSummaryOverlay');
      return !(ov && ov.classList.contains('attend-fullscreen'));
    },
    onStart: function(m, rect) {
      m.style.position = 'fixed';
      m.style.left = rect.left + 'px';
      m.style.top = rect.top + 'px';
      m.style.margin = '0';
    }
  });
}

// ── 출퇴근 지도 ──
var _attendMapInstance = null;
var _attendMapDirections = null;
function openAttendMap(inLat, inLng, outLat, outLng, empName, date) {
  var ov = document.getElementById('attendMapOverlay');
  if (!ov) { console.error('[AttendMap] overlay not found'); return; }

  // 오버레이 표시
  ov.style.display = 'flex';
  ov.style.zIndex = '999999';

  var titleEl = document.getElementById('attendMapTitle');
  if (titleEl) titleEl.textContent = '📍 ' + empName + ' — ' + date;
  var distEl = document.getElementById('attendMapDist');
  if (distEl) distEl.innerHTML = '<span style="color:#9ca3af;">로딩 중...</span>';

  var container = document.getElementById('attendMapContainer');
  container.innerHTML = ''; // 이전 지도 제거
  container.style.minHeight = '400px';

  // 지도 생성
  if (!window.google || !google.maps) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ef4444;font-size:16px;font-weight:600;">⚠️ Google Maps를 불러올 수 없습니다.</div>';
    return;
  }

  var inPos = { lat: parseFloat(inLat), lng: parseFloat(inLng) };
  var outPos = { lat: parseFloat(outLat), lng: parseFloat(outLng) };

  // 약간 지연 후 지도 생성 (DOM 렌더 완료 대기)
  setTimeout(function() {
    var bounds = new google.maps.LatLngBounds();
    bounds.extend(inPos);
    bounds.extend(outPos);

    _attendMapInstance = new google.maps.Map(container, {
      center: bounds.getCenter(),
      zoom: 14,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true
    });

    // 출근 마커 (녹색)
    new google.maps.Marker({
      position: inPos,
      map: _attendMapInstance,
      title: 'Clock In',
      label: { text: 'IN', color: '#fff', fontWeight: '700', fontSize: '11px' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: '#16a34a',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
        scale: 16
      }
    });

    // 퇴근 마커 (파란색)
    new google.maps.Marker({
      position: outPos,
      map: _attendMapInstance,
      title: 'Clock Out',
      label: { text: 'OUT', color: '#fff', fontWeight: '700', fontSize: '10px' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: '#2563eb',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
        scale: 16
      }
    });

    _attendMapInstance.fitBounds(bounds, 60);

    // 지도 크기 갱신
    google.maps.event.trigger(_attendMapInstance, 'resize');
    _attendMapInstance.fitBounds(bounds, 60);

    // 기본 경로 (일반도로 — avoidHighways)
    _attendMapDirections = new google.maps.DirectionsRenderer({
      map: _attendMapInstance,
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#7c3aed', strokeWeight: 5, strokeOpacity: 0.8 }
    });

    // 고속도로 경로 렌더러 (숨김 상태)
    _attendMapHwyRenderer = new google.maps.DirectionsRenderer({
      map: _attendMapInstance,
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#2563eb', strokeWeight: 5, strokeOpacity: 0.8 }
    });
    _attendMapHwyRenderer.setMap(null); // 기본 숨김

    // 좌표 저장 (토글에서 재사용)
    _attendMapRoute = { inPos: inPos, outPos: outPos };

    var directionsService = new google.maps.DirectionsService();

    // 일반도로 경로 (고속도로 제외)
    directionsService.route({
      origin: inPos,
      destination: outPos,
      travelMode: 'DRIVING',
      avoidHighways: true
    }, function(result, status) {
      if (status === 'OK') {
        _attendMapDirections.setDirections(result);
        var leg = result.routes[0].legs[0];
        _attendMapRoute.normalDist = leg.distance.text;
        _attendMapRoute.normalTime = leg.duration.text;
        _updateRouteInfo();
      } else {
        // 실패 시 직선 표시
        new google.maps.Polyline({
          path: [inPos, outPos], geodesic: true,
          strokeColor: '#7c3aed', strokeOpacity: 0.7, strokeWeight: 3,
          map: _attendMapInstance
        });
        var dist = google.maps.geometry ? google.maps.geometry.spherical.computeDistanceBetween(
          new google.maps.LatLng(inLat, inLng), new google.maps.LatLng(outLat, outLng)
        ) : null;
        if (dist) { _attendMapRoute.normalDist = (dist/1000).toFixed(1) + ' km'; _attendMapRoute.normalTime = '직선'; }
        _updateRouteInfo();
      }
    });

    // 고속도로 경로 미리 조회 (캐시)
    directionsService.route({
      origin: inPos,
      destination: outPos,
      travelMode: 'DRIVING',
      avoidHighways: false
    }, function(result, status) {
      if (status === 'OK') {
        _attendMapRoute.hwyResult = result;
        var leg = result.routes[0].legs[0];
        _attendMapRoute.hwyDist = leg.distance.text;
        _attendMapRoute.hwyTime = leg.duration.text;
        _loadTollRates().then(function(){ _updateRouteInfo(); });
      }
    });

    // 체크박스 초기화
    var hwyChk = document.getElementById('attendHwyChk');
    if (hwyChk) hwyChk.checked = false;

  }, 100);
}

var _attendMapHwyRenderer = null;
var _attendMapRoute = {};
var _tollRatesCache = null;

function _loadTollRates() {
  if (_tollRatesCache) return Promise.resolve(_tollRatesCache);
  return fetch('toll_rates.json?v=1').then(function(r){ return r.json(); }).then(function(j){
    _tollRatesCache = j; return j;
  }).catch(function(){ _tollRatesCache = { systems: [] }; return _tollRatesCache; });
}

function _estimateToll(result, rates) {
  if (!result || !rates || !rates.systems || !rates.systems.length) return null;
  var route = result.routes && result.routes[0];
  if (!route || !route.legs || !route.legs[0]) return null;
  var leg = route.legs[0];
  var distKm = (leg.distance && leg.distance.value ? leg.distance.value : 0) / 1000;
  var text = (route.summary || '') + ' ';
  (leg.steps || []).forEach(function(s){
    text += (s.instructions || '') + ' ' + (s.maneuver || '') + ' ';
    (s.steps || []).forEach(function(sub){ text += (sub.instructions || '') + ' '; });
  });
  text = text.replace(/<[^>]+>/g, ' ');
  var lower = text.toLowerCase();
  var total = 0, breakdown = [], seen = {};
  rates.systems.forEach(function(sys){
    if (seen[sys.id]) return;
    var matched = (sys.matchKeywords || []).some(function(kw){
      if (!kw) return false;
      return lower.indexOf(String(kw).toLowerCase()) >= 0 || text.indexOf(kw) >= 0;
    });
    if (!matched) return;
    seen[sys.id] = true;
    var fare;
    if (sys.pricing === 'flat') fare = sys.fare || 0;
    else {
      fare = Math.round(distKm * (sys.perKm || 0));
      if (sys.minFare != null && fare < sys.minFare) fare = sys.minFare;
      if (sys.maxFare != null && fare > sys.maxFare) fare = sys.maxFare;
    }
    total += fare;
    breakdown.push({ id: sys.id, name: (sys.displayName && sys.displayName.ko) || sys.id, fare: fare });
  });
  try { window._lastTollText = text; window._lastTollBreakdown = breakdown; } catch(_){}
  return { total: total, breakdown: breakdown };
}

window._debugToll = function() {
  var r = (typeof _attendMapRoute !== 'undefined') ? _attendMapRoute : null;
  if (!r || !r.hwyResult) return '[debug] hwyResult 없음 — 고속도로 체크박스 켜주세요';
  var route = r.hwyResult.routes[0], leg = route.legs[0];
  var steps = (leg.steps || []).map(function(s){ return (s.instructions||'').replace(/<[^>]+>/g,' '); });
  console.log('=== TOLL DEBUG ===');
  console.log('summary:', route.summary);
  console.log('distKm:', leg.distance.value / 1000);
  console.log('steps (first 30):');
  steps.slice(0, 30).forEach(function(s, i){ console.log('  ['+i+']', s); });
  console.log('tollRatesCache loaded:', !!_tollRatesCache);
  console.log('estimate:', _tollRatesCache ? _estimateToll(r.hwyResult, _tollRatesCache) : null);
  return '[debug] console 로그 확인';
};

function _updateRouteInfo() {
  var distEl = document.getElementById('attendMapDist');
  if (!distEl) return;
  var r = _attendMapRoute;
  var html = '<span style="color:#7c3aed;">🚗 일반: ' + (r.normalDist || '-') + ' · ' + (r.normalTime || '-') + '</span>';
  var hwyChk = document.getElementById('attendHwyChk');
  if (hwyChk && hwyChk.checked && r.hwyDist) {
    var hwyHtml = '🛣️ 고속도로: ' + r.hwyDist + ' · ' + r.hwyTime;
    var toll = r.hwyResult && _tollRatesCache ? _estimateToll(r.hwyResult, _tollRatesCache) : null;
    if (toll && toll.total > 0) {
      var tip = toll.breakdown.map(function(b){ return b.name + ' ฿' + b.fare; }).join(' + ');
      hwyHtml += ' · <span title="' + tip.replace(/"/g,'&quot;') + '" style="color:#dc2626;font-weight:600;">≈ ฿' + toll.total + '</span>';
    }
    html += '<span style="margin-left:12px;color:#2563eb;">' + hwyHtml + '</span>';
  }
  distEl.innerHTML = html;
}

function _toggleHighwayRoute() {
  var hwyChk = document.getElementById('attendHwyChk');
  if (!hwyChk || !_attendMapInstance) return;

  if (hwyChk.checked) {
    _loadTollRates().then(function(){ _updateRouteInfo(); });
    // 고속도로 경로 표시
    if (_attendMapRoute.hwyResult) {
      _attendMapHwyRenderer.setMap(_attendMapInstance);
      _attendMapHwyRenderer.setDirections(_attendMapRoute.hwyResult);
    } else {
      // 아직 로딩 안 됨 → 재조회
      var ds = new google.maps.DirectionsService();
      ds.route({
        origin: _attendMapRoute.inPos,
        destination: _attendMapRoute.outPos,
        travelMode: 'DRIVING',
        avoidHighways: false
      }, function(result, status) {
        if (status === 'OK') {
          _attendMapRoute.hwyResult = result;
          var leg = result.routes[0].legs[0];
          _attendMapRoute.hwyDist = leg.distance.text;
          _attendMapRoute.hwyTime = leg.duration.text;
          _attendMapHwyRenderer.setMap(_attendMapInstance);
          _attendMapHwyRenderer.setDirections(result);
          _updateRouteInfo();
        }
      });
    }
  } else {
    // 고속도로 경로 숨김
    _attendMapHwyRenderer.setMap(null);
  }
  _updateRouteInfo();
}

function closeAttendMap() {
  var ov = document.getElementById('attendMapOverlay');
  if (ov) ov.style.display = 'none';
  _attendMapInstance = null;
  _attendMapDirections = null;
  _attendMapHwyRenderer = null;
  _attendMapRoute = {};
}

// ── 체크박스 전체 선택/해제 (테이블 내 개별 직원) ──
function _asToggleAllCb(masterCb, empid) {
  var table = masterCb.closest('table');
  if (!table) return;
  table.querySelectorAll('.as-row-cb').forEach(function(cb) { cb.checked = masterCb.checked; });
  _asUpdatePdfBtn();
}

// ── 직원 헤더 체크박스 → 해당 직원 전체 행 토글 ──
function _asToggleEmpCb(cb, empid) {
  var wrapper = cb.closest('div[style*="margin-bottom"]') || cb.closest('div');
  // 같은 카드 안의 테이블
  var card = cb.closest('[style*="border:1px solid"]');
  if (!card) return;
  card.querySelectorAll('.as-row-cb').forEach(function(row) { row.checked = cb.checked; });
  // 테이블 thead 체크박스도 동기화
  var thCb = card.querySelector('thead input[type="checkbox"]');
  if (thCb) thCb.checked = cb.checked;
  _asUpdatePdfBtn();
}

// ── 전체 선택 체크박스 (모든 직원, 모든 행) ──
function _asToggleGlobalCb(cb) {
  var body = document.getElementById('attendSummaryBody');
  if (!body) return;
  body.querySelectorAll('.as-row-cb').forEach(function(row) { row.checked = cb.checked; });
  // 모든 thead 체크박스 동기화
  body.querySelectorAll('thead input[type="checkbox"]').forEach(function(thCb) { thCb.checked = cb.checked; });
  // 모든 직원 헤더 체크박스 동기화
  body.querySelectorAll('.as-emp-header-cb').forEach(function(empCb) { empCb.checked = cb.checked; });
  // All 체크 시 PDF 버튼 비활성화
  _asUpdatePdfBtn();
}
function _asUpdatePdfBtn() {}
// 개별 체크박스 변경 시 All 체크박스 동기화 (이벤트 위임)
document.addEventListener('change', function(e) {
  if (!e.target.classList.contains('as-row-cb')) return;
  var globalCb = document.querySelector('input[onchange*="_asToggleGlobalCb"]');
  if (!globalCb) return;
  var body = document.getElementById('attendSummaryBody');
  if (!body) return;
  var allCbs = body.querySelectorAll('.as-row-cb');
  var checkedCbs = body.querySelectorAll('.as-row-cb:checked');
  globalCb.checked = allCbs.length > 0 && allCbs.length === checkedCbs.length;
});

// ── 출퇴근 PDF 미리보기 ──
var _pdfPreviewCanvases = [];
var _pdfPreviewPage = 0;
var _pdfPreviewFromVal = '';
var _pdfPreviewToVal = '';

function _buildAttendPageHTML(row, idx, total, fromVal, toVal) {
  var h = '';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #e5e7eb;">';
  h += '<div><div style="font-size:22px;font-weight:800;letter-spacing:0.5px;">📊 Attendance Report</div>';
  h += '<div style="font-size:12px;color:#9ca3af;margin-top:4px;">' + fromVal + ' ~ ' + toVal + '</div></div>';
  h += '<div style="text-align:right;"><div style="font-size:14px;font-weight:700;color:#1e293b;">' + row.empId + '</div>';
  h += '<div style="font-size:12px;color:#6b7280;">' + (row.dept || '') + ' · ' + row.empName + (row.empNick ? ' · ' + row.empNick : '') + '</div></div>';
  h += '</div>';
  h += '<div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;padding:12px 18px;border-radius:10px;margin-bottom:18px;display:inline-block;">';
  h += '<span style="font-size:18px;font-weight:700;">📅 &nbsp; ' + row.date + '</span></div>';
  h += '<table style="width:100%;border-collapse:separate;border-spacing:0 6px;font-size:14px;margin-bottom:16px;">';
  h += '<tr><td style="padding:8px 12px;background:#f0fdf4;border-radius:8px 0 0 8px;width:110px;font-weight:600;color:#166534;">Clock In</td>';
  h += '<td style="padding:8px 12px;background:#f0fdf4;border-radius:0 8px 8px 0;font-weight:700;color:#16a34a;font-size:16px;">' + row.clockIn + '</td>';
  h += '<td style="width:20px;"></td>';
  h += '<td style="padding:8px 12px;background:#eff6ff;border-radius:8px 0 0 8px;width:110px;font-weight:600;color:#1e40af;">Clock Out</td>';
  h += '<td style="padding:8px 12px;background:#eff6ff;border-radius:0 8px 8px 0;font-weight:700;color:#2563eb;font-size:16px;">' + row.clockOut + '</td></tr>';
  h += '<tr><td style="padding:8px 12px;background:#f8fafc;border-radius:8px 0 0 8px;font-weight:600;color:#475569;">Hours</td>';
  h += '<td style="padding:8px 12px;background:#f8fafc;border-radius:0 8px 8px 0;font-weight:700;font-size:16px;">' + row.hours + '</td><td></td>';
  h += '<td style="padding:8px 12px;background:#f8fafc;border-radius:8px 0 0 8px;font-weight:600;color:#475569;">Distance</td>';
  h += '<td style="padding:8px 12px;background:#f8fafc;border-radius:0 8px 8px 0;font-weight:700;font-size:16px;">' + row.dist + '</td></tr>';
  if (row.work && row.work !== '-') {
    h += '<tr><td style="padding:8px 12px;background:#fefce8;border-radius:8px 0 0 8px;font-weight:600;color:#854d0e;">Work</td>';
    h += '<td colspan="4" style="padding:8px 12px;background:#fefce8;border-radius:0 8px 8px 0;font-weight:600;color:#713f12;word-spacing:0.12em;">' + row.work + '</td></tr>';
  }
  h += '</table>';
  h += '<div style="margin-bottom:14px;font-size:12px;line-height:1.8;word-spacing:0.12em;">';
  h += '<div style="display:flex;gap:8px;"><span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px;flex-shrink:0;word-spacing:normal;">IN</span> <span style="color:#475569;">' + (row.inAddr !== '-' ? row.inAddr : '-') + '</span></div>';
  h += '<div style="display:flex;gap:8px;margin-top:4px;"><span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px;flex-shrink:0;word-spacing:normal;">OUT</span> <span style="color:#475569;">' + (row.outAddr !== '-' ? row.outAddr : '-') + '</span></div>';
  h += '</div>';
  if (row.inLat && row.inLng && row.outLat && row.outLng) {
    var pathParam = row._encodedPath
      ? '&path=color:0x7c3aedCC%7Cweight:4%7Cenc:' + encodeURIComponent(row._encodedPath)
      : '&path=color:0x7c3aedCC%7Cweight:4%7C' + row.inLat + ',' + row.inLng + '%7C' + row.outLat + ',' + row.outLng;
    var mapUrl = 'https://maps.googleapis.com/maps/api/staticmap?size=700x350&scale=2&maptype=roadmap' +
      '&markers=color:green%7Clabel:I%7C' + row.inLat + ',' + row.inLng +
      '&markers=color:blue%7Clabel:O%7C' + row.outLat + ',' + row.outLng +
      pathParam + '&key=' + (window.GMAPS_KEY || 'AIzaSyBDU8EH41NWBx74v7uMKmFpEfvCyLN19zw');
    h += '<div style="border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">';
    h += '<img src="' + mapUrl + '" style="width:100%;height:auto;display:block;" crossorigin="anonymous"></div>';
  }
  h += '<div style="position:absolute;bottom:24px;right:36px;font-size:15px;font-weight:600;color:#1e293b;">' + (idx + 1) + ' / ' + total + '</div>';
  return h;
}

async function exportAttendancePDF() {
  try {
  // 기간 1개월 초과 체크
  var _pdfFrom = (document.getElementById('asSDateFrom') || {}).value || '';
  var _pdfTo = (document.getElementById('asSDateTo') || {}).value || '';
  if (_pdfFrom && _pdfTo) {
    var _df = new Date(_pdfFrom), _dt = new Date(_pdfTo);
    var _diffMs = _dt.getTime() - _df.getTime();
    var _diffDays = _diffMs / (1000 * 60 * 60 * 24);
    if (_diffDays > 31) { neoAlert(t('att_pdf_period_limit')); return; }
  }
  var checked = document.querySelectorAll('.as-row-cb:checked');
  if (!checked.length) { neoAlert(t('att_pdf_no_check')); return; }

  // 라이브러리 동적 로드
  try { await loadHtml2Canvas(); await loadJsPDF(); } catch(e) { neoAlert('PDF 라이브러리 로딩 실패. 네트워크를 확인해 주세요.'); return; }

  showToast(t('att_pdf_generating'));

  // 데이터 수집
  var allRows = [];
  checked.forEach(function(cb) {
    var distCell = document.getElementById('asDist_' + cb.dataset.emp + '_' + cb.dataset.date.replace(/-/g,''));
    var distRaw = distCell ? (distCell.querySelector('strong') ? distCell.querySelector('strong').textContent.trim() : distCell.textContent.trim()) : '-';
    if (distRaw === '...' || distRaw === '') distRaw = '-';
    allRows.push({
      empName: cb.dataset.empname || '', empNick: cb.dataset.nickname || '', empId: cb.dataset.emp || '', dept: cb.dataset.dept || '',
      date: cb.dataset.date, clockIn: cb.dataset.in || '-', clockOut: cb.dataset.out || '-',
      hours: cb.dataset.hours || '-', inAddr: cb.dataset.inAddr || '-', outAddr: cb.dataset.outAddr || '-',
      inLat: cb.dataset.inLat, inLng: cb.dataset.inLng, outLat: cb.dataset.outLat, outLng: cb.dataset.outLng,
      work: cb.dataset.work || '-', dist: distRaw
    });
  });

  _pdfPreviewFromVal = (document.getElementById('asSDateFrom') || {}).value || '';
  _pdfPreviewToVal = (document.getElementById('asSDateTo') || {}).value || '';

  // Directions API로 실제 도로 경로 조회 (encoded polyline)
  if (window.google && google.maps && google.maps.DirectionsService) {
    var dirService = new google.maps.DirectionsService();
    var routePromises = allRows.map(function(row) {
      if (!row.inLat || !row.inLng || !row.outLat || !row.outLng) return Promise.resolve();
      return new Promise(function(resolve) {
        dirService.route({
          origin: { lat: parseFloat(row.inLat), lng: parseFloat(row.inLng) },
          destination: { lat: parseFloat(row.outLat), lng: parseFloat(row.outLng) },
          travelMode: 'DRIVING'
        }, function(result, status) {
          if (status === 'OK' && result.routes && result.routes[0]) {
            row._encodedPath = result.routes[0].overview_polyline;
            // 거리·시간 업데이트
            var leg = result.routes[0].legs[0];
            if (leg && leg.distance) row.dist = leg.distance.text;
          }
          resolve();
        });
      });
    });
    await Promise.all(routePromises);
  }

  // 페이지별 html2canvas
  var tempDivs = [];
  _pdfPreviewCanvases = [];
  for (var i = 0; i < allRows.length; i++) {
    var div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:-9999px;top:0;width:760px;height:1075px;background:#fff;padding:32px 36px;font-family:"Segoe UI",Roboto,"Noto Sans KR","Noto Sans Thai",Arial,sans-serif;color:#1e293b;box-sizing:border-box;overflow:hidden;';
    div.innerHTML = _buildAttendPageHTML(allRows[i], i, allRows.length, _pdfPreviewFromVal, _pdfPreviewToVal);
    document.body.appendChild(div);
    tempDivs.push(div);
  }

  // 이미지 로드 대기
  var allImgs = [];
  tempDivs.forEach(function(p) { p.querySelectorAll('img').forEach(function(img) { allImgs.push(img); }); });
  if (allImgs.length) {
    await Promise.all(allImgs.map(function(img) {
      return new Promise(function(resolve) {
        if (img.complete && img.naturalHeight > 0) return resolve();
        img.onload = resolve;
        img.onerror = function() { img.style.display = 'none'; resolve(); };
        setTimeout(resolve, 10000);
      });
    }));
  }

  // canvas 생성
  for (var ci = 0; ci < tempDivs.length; ci++) {
    var canvas = await html2canvas(tempDivs[ci], { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    _pdfPreviewCanvases.push(canvas);
  }
  tempDivs.forEach(function(p) { document.body.removeChild(p); });

  // 바로 PDF 저장
  var { jsPDF } = window.jspdf;
  var pdf = new jsPDF('p', 'mm', 'a4');
  var pageW = 210, pageH = 297;
  for (var pi = 0; pi < _pdfPreviewCanvases.length; pi++) {
    if (pi > 0) pdf.addPage();
    var canvas = _pdfPreviewCanvases[pi];
    var imgH = (canvas.height * pageW) / canvas.width;
    if (imgH > pageH) {
      var ratio = pageH / imgH;
      var fitW = pageW * ratio;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageW - fitW) / 2, 0, fitW, pageH);
    } else {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, imgH);
    }
  }
  var fromVal = _pdfPreviewFromVal || '';
  var toVal = _pdfPreviewToVal || '';
  // 체크된 행에서 empid 추출 (중복 제거)
  var _pdfEmpIds = [];
  checked.forEach(function(cb) {
    var eid = cb.dataset.emp || '';
    if (eid && _pdfEmpIds.indexOf(eid) === -1) _pdfEmpIds.push(eid);
  });
  var empPart = _pdfEmpIds.join('_');
  var fileName = 'Attendance_' + empPart + '_' + fromVal + '_' + toVal + '.pdf';
  pdf.save(fileName);
  _pdfPreviewCanvases = [];
  showToast(t('att_pdf_saved'));
  } catch(err) { console.error('[PDF Export Error]', err); neoAlert('PDF 생성 중 오류: ' + (err.message || err)); }
}

function _renderPdfPreview() {
  var container = document.getElementById('pdfPreviewImg');
  if (!container || !_pdfPreviewCanvases.length) return;
  var canvas = _pdfPreviewCanvases[_pdfPreviewPage];
  container.innerHTML = '';
  var img = document.createElement('img');
  img.src = canvas.toDataURL('image/jpeg', 0.92);
  img.style.cssText = 'width:100%;height:auto;display:block;';
  container.appendChild(img);
  // 페이지 표시
  var pageLabel = document.getElementById('pdfPreviewPageLabel');
  if (pageLabel) pageLabel.textContent = (_pdfPreviewPage + 1) + ' / ' + _pdfPreviewCanvases.length;
  // 버튼 활성화
  var prevBtn = document.getElementById('pdfPreviewPrev');
  var nextBtn = document.getElementById('pdfPreviewNext');
  if (prevBtn) prevBtn.disabled = _pdfPreviewPage === 0;
  if (nextBtn) nextBtn.disabled = _pdfPreviewPage >= _pdfPreviewCanvases.length - 1;
}

function pdfPreviewPrev() { if (_pdfPreviewPage > 0) { _pdfPreviewPage--; _renderPdfPreview(); } }
function pdfPreviewNext() { if (_pdfPreviewPage < _pdfPreviewCanvases.length - 1) { _pdfPreviewPage++; _renderPdfPreview(); } }

function closePdfPreview() {
  document.getElementById('pdfPreviewOverlay').style.display = 'none';
  _pdfPreviewCanvases = [];
}

function pdfPreviewSave() {
  if (!_pdfPreviewCanvases.length) return;
  var { jsPDF } = window.jspdf;
  var pdf = new jsPDF('p', 'mm', 'a4');
  var pageW = 210, pageH = 297;
  for (var pi = 0; pi < _pdfPreviewCanvases.length; pi++) {
    if (pi > 0) pdf.addPage();
    var canvas = _pdfPreviewCanvases[pi];
    var imgH = (canvas.height * pageW) / canvas.width;
    if (imgH > pageH) {
      var ratio = pageH / imgH;
      var fitW = pageW * ratio;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageW - fitW) / 2, 0, fitW, pageH);
    } else {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, imgH);
    }
  }
  var fileName = 'Attendance_' + (_pdfPreviewFromVal || 'report') + '.pdf';
  pdf.save(fileName);
  showToast(t('att_pdf_saved'));
}

async function pdfPreviewEmail() {
  if (!_pdfPreviewCanvases.length) return;
  // PDF blob 생성
  var { jsPDF } = window.jspdf;
  var pdf = new jsPDF('p', 'mm', 'a4');
  var pageW = 210, pageH = 297;
  for (var pi = 0; pi < _pdfPreviewCanvases.length; pi++) {
    if (pi > 0) pdf.addPage();
    var canvas = _pdfPreviewCanvases[pi];
    var imgH = (canvas.height * pageW) / canvas.width;
    if (imgH > pageH) {
      var ratio = pageH / imgH;
      var fitW = pageW * ratio;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageW - fitW) / 2, 0, fitW, pageH);
    } else {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, imgH);
    }
  }
  var fileName = 'Attendance_' + (_pdfPreviewFromVal || 'report') + '.pdf';
  var blob = pdf.output('blob');

  // mailto로 이메일 클라이언트 열기 (첨부파일은 직접 불가 → 다운로드 후 안내)
  // 대신: 이메일 주소 입력 → Firebase Storage 임시 업로드 → 링크 전송
  var email = prompt(t('att_pdf_email_prompt'));
  if (!email || !email.trim()) return;
  email = email.trim();

  showToast(t('att_pdf_email_sending'));
  try {
    // Firebase Storage에 임시 업로드
    var storageRef = firebase.storage().ref('attendance-pdf/' + fileName);
    await storageRef.put(blob, { contentType: 'application/pdf' });
    var downloadUrl = await storageRef.getDownloadURL();

    // mailto 링크로 이메일 열기
    var subject = encodeURIComponent(t('att_pdf_email_subject') + ' (' + _pdfPreviewFromVal + ' ~ ' + _pdfPreviewToVal + ')');
    var body = encodeURIComponent(t('att_pdf_email_body') + downloadUrl + t('att_pdf_email_thanks'));
    window.open('mailto:' + email + '?subject=' + subject + '&body=' + body, '_blank');
    showToast(t('att_pdf_email_opened'));
  } catch(e) {
    console.error('[PdfEmail]', e);
    // fallback: 파일 다운로드 + mailto
    pdf.save(fileName);
    var subject2 = encodeURIComponent(t('att_pdf_email_subject'));
    window.open('mailto:' + email + '?subject=' + subject2 + '&body=' + encodeURIComponent(t('att_pdf_email_body')), '_blank');
    showToast(t('att_pdf_email_fallback'));
  }
}

async function _loadAttendEmpFilter(mode) {
  var sel = document.getElementById('asSEmpFilter');
  var deptSel = document.getElementById('asSDeptFilter');
  var subDeptSel = document.getElementById('asSSubDeptFilter');
  if (!sel) return;
  // mode가 바뀌면 리셋
  if (sel._loadedMode === mode && sel.options.length > 1) return;
  sel.innerHTML = '<option value="">' + t('att_sum_all_emp') + '</option>';
  sel._loadedMode = mode;
  try {
    // apiGetAccounts 5분 캐시 사용 (동일 탭/페이지에서 반복 호출 시 0 reads)
    var _accRes = await apiGetAccounts();
    var _accList = _accRes.accounts || [];
    var depts = {};
    var subDepts = {};  // { sub_dept: { dept: groupName } }
    var me = getCurrentUser();
    var myDept = me ? (me.dept || '') : '';
    var mySubDept = me ? (me.sub_dept || '') : '';
    window._asAccounts = [];
    _accList.forEach(function(a) {
      var _empid = a.empid;
      var dept = a.dept || '';
      var subDept = a.sub_dept || '';
      // CEO 계정은 필터에서 제외
      if (dept === 'CEO') return;
      // team 모드: 같은 그룹(dept)만 표시
      if (mode === 'team' && dept !== myDept) return;
      // subteam 모드: 같은 부서(sub_dept)만 표시
      if (mode === 'subteam' && (subDept !== mySubDept || dept !== myDept)) return;
      window._asAccounts.push({ empid: _empid, name: a.name || _empid, dept: dept, sub_dept: subDept });
      var opt = document.createElement('option');
      opt.value = _empid;
      opt.textContent = _empid + ' (' + (a.name || '') + ')';
      opt.dataset.dept = dept;
      opt.dataset.subDept = subDept;
      sel.appendChild(opt);
      if (dept && !depts[dept]) depts[dept] = true;
      if (subDept && !subDepts[subDept]) subDepts[subDept] = dept;
    });
    // 그룹 필터 채우기 (all 모드만)
    if (deptSel && mode !== 'team' && mode !== 'subteam') {
      deptSel.innerHTML = '<option value="">' + (t('att_sum_all_group') || '전체 그룹') + '</option>';
      var _deptOrder = ['MD', 'Sales', 'Office'];
      var _deptLabels = { MD: t('dept_ceo'), Sales: t('dept_sales'), Office: t('dept_office') };
      _deptOrder.forEach(function(dept) {
        if (!depts[dept]) return;
        var opt = document.createElement('option');
        opt.value = dept;
        opt.textContent = _deptLabels[dept] || dept;
        deptSel.appendChild(opt);
      });
      Object.keys(depts).forEach(function(dept) {
        if (_deptOrder.indexOf(dept) === -1) {
          var opt = document.createElement('option');
          opt.value = dept;
          opt.textContent = dept;
          deptSel.appendChild(opt);
        }
      });
    }
    // 부서(sub_dept) 필터 채우기
    if (subDeptSel && mode !== 'team' && mode !== 'subteam') {
      subDeptSel.innerHTML = '<option value="">' + t('att_sum_all_dept') + '</option>';
      var _subDeptKeys = Object.keys(subDepts).sort();
      _subDeptKeys.forEach(function(sd) {
        var opt = document.createElement('option');
        opt.value = sd;
        opt.textContent = sd;
        opt.dataset.dept = subDepts[sd];
        subDeptSel.appendChild(opt);
      });
    }
    // 그룹 선택 → 부서 + 직원 연동 + 자동 조회
    if (deptSel) {
      deptSel.onchange = function() {
        var gv = deptSel.value;
        // 부서 필터 연동
        if (subDeptSel) {
          for (var i = 1; i < subDeptSel.options.length; i++) {
            subDeptSel.options[i].style.display = (!gv || subDeptSel.options[i].dataset.dept === gv) ? '' : 'none';
          }
          subDeptSel.value = '';
        }
        // 직원 필터 연동
        for (var j = 1; j < sel.options.length; j++) {
          sel.options[j].style.display = (!gv || sel.options[j].dataset.dept === gv) ? '' : 'none';
        }
        sel.value = '';
        if (typeof loadAttendanceSummary === 'function') loadAttendanceSummary();
      };
    }
    // 부서 선택 → 직원 연동 + 자동 조회
    if (subDeptSel) {
      subDeptSel.onchange = function() {
        var sv = subDeptSel.value;
        var gv = deptSel ? deptSel.value : '';
        for (var i = 1; i < sel.options.length; i++) {
          var matchGroup = !gv || sel.options[i].dataset.dept === gv;
          var matchSub = !sv || sel.options[i].dataset.subDept === sv;
          sel.options[i].style.display = (matchGroup && matchSub) ? '' : 'none';
        }
        sel.value = '';
        if (typeof loadAttendanceSummary === 'function') loadAttendanceSummary();
      };
    }
    // 직원 선택 → 자동 조회
    if (sel) {
      sel.onchange = function() {
        if (typeof loadAttendanceSummary === 'function') loadAttendanceSummary();
      };
    }
  } catch (e) { console.warn('[AttendSummary] emp load error:', e); }
}

async function loadAttendanceSummary() {
  var fromEl = document.getElementById('asSDateFrom');
  var toEl = document.getElementById('asSDateTo');
  var level = _attendSummaryLevel();
  var me = getCurrentUser();
  var empFilter = '';
  var deptFilter = '';
  var subDeptFilter = '';
  if (level === 'all') {
    // 관리자/인사 팀장: 선택된 필터 사용
    empFilter = (document.getElementById('asSEmpFilter') || {}).value || '';
    deptFilter = (document.getElementById('asSDeptFilter') || {}).value || '';
    subDeptFilter = (document.getElementById('asSSubDeptFilter') || {}).value || '';
  } else if (level === 'team') {
    // 그룹장/승인자: 직원 필터 사용 (같은 그룹만 로드되어 있음)
    empFilter = (document.getElementById('asSEmpFilter') || {}).value || '';
    if (!empFilter) deptFilter = me ? (me.dept || '') : '';
  } else if (level === 'subteam') {
    // 부서 팀장: 직원 필터 사용 (같은 부서 sub_dept만 로드되어 있음)
    empFilter = (document.getElementById('asSEmpFilter') || {}).value || '';
    if (!empFilter) {
      deptFilter = me ? (me.dept || '') : '';
      subDeptFilter = me ? (me.sub_dept || '') : '';
    }
  } else {
    // 일반: 본인만
    if (me && me.empid) empFilter = me.empid;
  }
  var body = document.getElementById('attendSummaryBody');
  if (!body) return;

  var dateFrom = fromEl ? fromEl.value : '';
  var dateTo = toEl ? toEl.value : '';
  if (!dateFrom || !dateTo) { body.innerHTML = '<div style="text-align:center;color:#ef4444;padding:20px;">' + t('att_sum_select_date') + '</div>'; return; }

  body.innerHTML = '<div style="text-align:center;color:#6b7280;padding:40px;">' + t('att_sum_loading') + '</div>';

  try {
    var query = _fbDb.collection('attendance')
      .where('date', '>=', dateFrom)
      .where('date', '<=', dateTo)
      .orderBy('date', 'asc');

    if (empFilter) query = query.where('empid', '==', empFilter);

    var snap = await query.get();
    var records = [];
    snap.forEach(function(d) { records.push(d.data()); });

    if (records.length === 0) {
      body.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:40px;">' + t('att_sum_no_record') + '</div>';
      return;
    }

    // 그룹 필터 적용
    if (deptFilter) {
      records = records.filter(function(r) { return r.dept === deptFilter; });
      if (records.length === 0) {
        body.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:40px;">' + t('att_sum_no_dept') + '</div>';
        return;
      }
    }
    // 부서(sub_dept) 필터 적용
    if (subDeptFilter && window._asAccounts) {
      var _subEmpids = {};
      window._asAccounts.forEach(function(a) { if (a.sub_dept === subDeptFilter) _subEmpids[a.empid] = true; });
      records = records.filter(function(r) { return _subEmpids[r.empid]; });
      if (records.length === 0) {
        body.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:40px;">' + t('att_sum_no_dept') + '</div>';
        return;
      }
    }

    // 직원별 + 날짜별 그룹핑
    var byEmp = {};
    records.forEach(function(r) {
      var key = r.empid || 'unknown';
      if (!byEmp[key]) byEmp[key] = { name: r.name || key, nickname: r.nickname || '', dept: r.dept || '', days: {} };
      if (r.nickname && !byEmp[key].nickname) byEmp[key].nickname = r.nickname;
      if (!byEmp[key].days[r.date]) byEmp[key].days[r.date] = [];
      byEmp[key].days[r.date].push(r);
    });

    var html = '';
    var empids = Object.keys(byEmp).sort();
    empids.forEach(function(empid) {
      var emp = byEmp[empid];
      var dates = Object.keys(emp.days).sort();
      var totalDays = dates.length;

      html += '<div style="margin-bottom:12px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">';
      html += '<div><strong style="font-size:14px;">' + empid + '</strong><span style="color:#6b7280;font-size:12px;margin-left:8px;">' + (emp.dept || '') + ' · ' + emp.name + (emp.nickname ? ' · ' + emp.nickname : '') + '</span></div>';
      html += '<span style="background:#dbeafe;color:#2563eb;font-size:12px;font-weight:700;padding:4px 10px;border-radius:12px;">' + totalDays + t('att_sum_days') + '</span>';
      html += '</div>';

      var _isMob = window.innerWidth <= 768;
      html += '<table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">';
      var thS = 'padding:8px 6px;font-weight:600;border-bottom:1px solid #e5e7eb;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      if (_isMob) {
        // Mobile: Date | In | Out | Hours | Work | Dist | Map
        html += '<colgroup><col style="width:28px"><col style="width:72px"><col style="width:44px"><col style="width:44px"><col style="width:44px"><col><col style="width:44px"><col style="width:32px"></colgroup>';
      } else {
        // Desktop: cb | Date | In | Out | Hours | Work | Depart | Return | Dist | Map
        html += '<colgroup><col style="width:30px"><col style="width:80px"><col style="width:50px"><col style="width:50px"><col style="width:50px"><col style="width:14%"><col style="width:20%"><col style="width:20%"><col style="width:56px"><col style="width:36px"></colgroup>';
      }
      html += '<thead><tr style="background:#f9fafb;">';
      html += '<th style="' + thS + 'text-align:center;"><input type="checkbox" onchange="_asToggleAllCb(this,\'' + empid.replace(/'/g,"\\'") + '\')" style="width:15px;height:15px;cursor:pointer;accent-color:#2563eb;"></th>';
      html += '<th style="' + thS + 'text-align:left;color:#6b7280;">' + t('att_th_date') + '</th>';
      html += '<th style="' + thS + 'text-align:center;color:#16a34a;">☀️ In</th>';
      html += '<th style="' + thS + 'text-align:center;color:#2563eb;">🌙 Out</th>';
      html += '<th style="' + thS + 'text-align:center;color:#6b7280;">' + t('att_th_hours') + '</th>';
      html += '<th style="' + thS + 'text-align:left;color:#6b7280;">' + t('att_th_work') + '</th>';
      if (!_isMob) html += '<th style="' + thS + 'text-align:left;color:#f59e0b;">🚗 Depart</th>';
      if (!_isMob) html += '<th style="' + thS + 'text-align:left;color:#8b5cf6;">🏠 Return</th>';
      html += '<th style="' + thS + 'text-align:center;color:#6b7280;">' + t('att_th_dist') + '</th>';
      html += '<th style="' + thS + 'text-align:center;color:#6b7280;">🗺️</th>';
      html += '</tr></thead><tbody>';

      dates.forEach(function(date) {
        var dayRecords = emp.days[date];
        var firstIn = null, lastOut = null, inAddr = '', outAddr = '';
        var inLat = null, inLng = null, outLat = null, outLng = null;
        var dayWorkNote = '';
        var departTime = null, departAddr = '', returnTime = null, returnAddr = '';
        var departLat = null, departLng = null, returnLat = null, returnLng = null;
        dayRecords.forEach(function(r) {
          if (r.type === 'in' && (!firstIn || r.time < firstIn)) { firstIn = r.time; inAddr = r.address || ''; inLat = r.lat; inLng = r.lng; }
          if (r.type === 'out' && (!lastOut || r.time > lastOut)) { lastOut = r.time; outAddr = r.address || ''; outLat = r.lat; outLng = r.lng; if (r.workNote) dayWorkNote = r.workNote; }
          if (r.type === 'depart' && (!departTime || r.time > departTime)) { departTime = r.time; departAddr = r.address || ''; departLat = r.lat; departLng = r.lng; }
          if (r.type === 'return' && (!returnTime || r.time > returnTime)) { returnTime = r.time; returnAddr = r.address || ''; returnLat = r.lat; returnLng = r.lng; }
        });

        var workHours = '-';
        if (firstIn && lastOut) {
          var inParts = firstIn.split(':'), outParts = lastOut.split(':');
          var inMin = parseInt(inParts[0])*60 + parseInt(inParts[1]);
          var outMin = parseInt(outParts[0])*60 + parseInt(outParts[1]);
          var diff = outMin - inMin;
          if (diff > 0) {
            var h = Math.floor(diff/60), m = diff%60;
            workHours = h + t('att_hours_h') + (m > 0 ? ' ' + m + t('att_hours_m') : '');
          }
        }

        // Depart/Return 주소 요약
        var departShort = departAddr ? _extractAmphoeProvince(departAddr) : '-';
        var returnShort = returnAddr ? _extractAmphoeProvince(returnAddr) : '-';
        var departHM = departTime ? departTime.split(':').slice(0,2).join(':') : '';
        var returnHM = returnTime ? returnTime.split(':').slice(0,2).join(':') : '';

        // 거리 셀 ID (나중에 Distance Matrix로 채움)
        var distId = 'asDist_' + empid + '_' + date.replace(/-/g,'');
        var hasRoute = inLat && inLng && outLat && outLng;
        // depart→return 경로도 체크
        var hasDRRoute = departLat && departLng && returnLat && returnLng;
        var mapLat1 = departLat || inLat, mapLng1 = departLng || inLng;
        var mapLat2 = returnLat || outLat, mapLng2 = returnLng || outLng;
        var hasAnyRoute = (mapLat1 && mapLng1 && mapLat2 && mapLng2);
        var tdS = 'padding:6px 5px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

        html += '<tr style="border-bottom:1px solid #f3f4f6;">';
        html += '<td style="padding:4px 5px;text-align:center;vertical-align:middle;"><input type="checkbox" class="as-row-cb" data-emp="' + empid + '" data-empname="' + (emp.name||'').replace(/"/g,'&quot;') + '" data-nickname="' + (emp.nickname||'').replace(/"/g,'&quot;') + '" data-dept="' + (emp.dept||'').replace(/"/g,'&quot;') + '" data-date="' + date + '" data-in="' + (firstIn||'') + '" data-out="' + (lastOut||'') + '" data-hours="' + workHours + '" data-in-addr="' + (inAddr||'').replace(/"/g,'&quot;') + '" data-out-addr="' + (outAddr||'').replace(/"/g,'&quot;') + '"' +
          (hasRoute ? ' data-in-lat="' + inLat + '" data-in-lng="' + inLng + '" data-out-lat="' + outLat + '" data-out-lng="' + outLng + '"' : '') +
          ' data-work="' + (dayWorkNote||'').replace(/"/g,'&quot;') + '" style="width:15px;height:15px;cursor:pointer;accent-color:#2563eb;"></td>';
        html += '<td style="' + tdS + 'font-weight:600;">' + date + '</td>';
        var firstInHM = firstIn ? firstIn.split(':').slice(0,2).join(':') : '-';
        var lastOutHM = lastOut ? lastOut.split(':').slice(0,2).join(':') : '-';
        html += '<td style="' + tdS + 'text-align:center;color:#16a34a;font-weight:700;">' + firstInHM + '</td>';
        html += '<td style="' + tdS + 'text-align:center;color:#2563eb;font-weight:700;">' + lastOutHM + '</td>';
        html += '<td style="' + tdS + 'text-align:center;font-weight:600;">' + workHours + '</td>';
        html += '<td style="' + tdS + 'color:#374151;" title="' + (dayWorkNote||'').replace(/"/g,'&quot;') + '">' + (dayWorkNote || '<span style="color:#d1d5db;">-</span>') + '</td>';
        if (!_isMob) {
          // Depart: time + location
          html += '<td style="' + tdS + 'color:#b45309;" title="' + (departAddr||'-').replace(/"/g,'&quot;') + '">';
          if (departHM) html += '<span style="font-weight:700;color:#f59e0b;">' + departHM + '</span> <span style="color:#92400e;">' + departShort + '</span>';
          else html += '<span style="color:#d1d5db;">-</span>';
          html += '</td>';
          // Return: time + location
          html += '<td style="' + tdS + 'color:#6d28d9;" title="' + (returnAddr||'-').replace(/"/g,'&quot;') + '">';
          if (returnHM) html += '<span style="font-weight:700;color:#8b5cf6;">' + returnHM + '</span> <span style="color:#5b21b6;">' + returnShort + '</span>';
          else html += '<span style="color:#d1d5db;">-</span>';
          html += '</td>';
        }
        html += '<td id="' + distId + '" style="' + tdS + 'text-align:center;color:#6b7280;"' +
          (hasAnyRoute ? ' data-in-lat="' + (mapLat1) + '" data-in-lng="' + (mapLng1) + '" data-out-lat="' + (mapLat2) + '" data-out-lng="' + (mapLng2) + '"' : '') +
          '>' + (hasAnyRoute ? '...' : '-') + '</td>';
        html += '<td style="padding:3px 2px;text-align:center;vertical-align:middle;">';
        if (hasAnyRoute) {
          html += '<button onclick="openAttendMap(' + mapLat1 + ',' + mapLng1 + ',' + mapLat2 + ',' + mapLng2 + ',\'' + (emp.name||'').replace(/'/g,"\\'") + '\',\'' + date + '\')" style="background:none;border:none;font-size:12px;cursor:pointer;padding:2px;color:#2563eb;font-weight:600;" title="지도 보기">📍Map</button>';
        } else {
          html += '<span style="color:#d1d5db;">-</span>';
        }
        html += '</td>';
        html += '</tr>';
      });

      html += '</tbody></table></div>';
    });

    body.innerHTML = html;

    // All 체크박스 및 PDF 버튼 상태 리셋
    var globalCb = document.querySelector('input[onchange*="_asToggleGlobalCb"]');
    if (globalCb) globalCb.checked = false;
    _asUpdatePdfBtn();

    // 이동거리 계산 (Distance Matrix API)
    _calcAttendDistances();
  } catch (e) {
    console.error('[AttendSummary] error:', e);
    // Firestore 인덱스 필요 시 안내
    var msg = e.message || '';
    if (msg.indexOf('index') !== -1 || msg.indexOf('Index') !== -1) {
      body.innerHTML = '<div style="text-align:center;color:#ef4444;padding:20px;">' + t('att_index_required') + '<br><a href="' + (msg.match(/https:\/\/[^\s]+/)?.[0] || '#') + '" target="_blank" style="color:#2563eb;">' + t('att_index_create') + '</a></div>';
    } else {
      body.innerHTML = '<div style="text-align:center;color:#ef4444;padding:20px;">' + t('att_query_error') + msg + '</div>';
    }
  }
}
