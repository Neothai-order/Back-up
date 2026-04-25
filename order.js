// Neo Sales App - Orders, Quotation & Mega-menu (auto-separated)
// ─── 주문 기능 ──────────────────────────────────────────────────────────────
let orderCurrentCat = 'ALL';
let orderSelectedItem = null;
let orderItems = [];  // [{item, qty}]

// 주문 - 고객 선택 상태
let orderCustomer = null;
let orderAddress  = null;

var orderDeliveryDate = '';
var orderDeliveryMethod = '';
var orderAttachedFiles = [];

function openOrderForm() {
  editingOrderId = null;
  orderItems = [];
  orderSelectedItem = null;
  orderCustomer = null;
  orderAddress  = null;
  orderShipType = '일반출고';
  orderDeliveryDate = '';
  orderDeliveryMethod = '';
  orderAttachedFiles = [];
  _settleRefs = [];
  _consignItems = [];
  _consignOrders = [];
  // 출고유형 버튼 리셋
  document.querySelectorAll('.ship-type-btn').forEach(function(b) {
    b.classList.toggle('selected', b.dataset.val === '일반출고');
  });
  // 스텝1 초기화
  document.getElementById('custSearchInput').value = '';
  document.getElementById('custAcList').classList.remove('open');
  document.getElementById('custSelectedCard').classList.remove('show');
  document.getElementById('addrSection').classList.remove('show');
  document.getElementById('btnStepNext').disabled = true;
  // 스텝2 초기화
  document.getElementById('itemSearchInput').value = '';
  document.getElementById('itemQty').value = 1;
  var _siw=document.getElementById('selItemWrap'); if(_siw) _siw.style.display='none';
  // 무상 체크박스/가격 입력 초기화
  var _fcb = document.getElementById('itemFree'); if (_fcb) _fcb.checked = false;
  var _spi = document.getElementById('selItemPrice'); if (_spi) { _spi.disabled = false; delete _spi.dataset.prevPrice; }
  renderOrderItems();
  // 스텝3 초기화
  document.getElementById('deliveryDateInput').value = '';
  var picker = document.getElementById('deliveryDatePicker');
  if (picker) picker.value = '';
  document.querySelectorAll('.dm-btn').forEach(function(b){ b.classList.remove('selected'); });
  document.getElementById('dmOtherWrap').classList.remove('show');
  document.getElementById('dmOtherInput').value = '';
  document.getElementById('attachedFilesList').innerHTML = '';
  // 제출 버튼 원래 텍스트 복원 (수정 모드 후 신규 주문 시)
  var finalBtn = document.getElementById('submitOrderBtnFinal');
  if (finalBtn) finalBtn.innerHTML = '<span data-i18n="btn_submit_order">' + t('btn_submit_order') + '</span>';
  // 스텝1 표시
  showOrderStep(1);
  var _oOv = document.getElementById('orderOverlay');
  _oOv.classList.add('open');
  _mobFullScreen(_oOv, _oOv.querySelector('.order-modal'));
  _bringToFront(_oOv);
  // 모바일 하단 네비 숨기기 (화면 짤림 방지)
  var mobNav = document.getElementById('mobileBottomNav');
  if (mobNav) mobNav.style.display = 'none';
  applyLang();
}

var _orderCurrentStep = 1;

function _applyOrderStepIndicators(n) {
  var ind1  = document.getElementById('stepInd1');
  var ind2  = document.getElementById('stepInd2');
  var ind3  = document.getElementById('stepInd3');
  var line1 = document.getElementById('stepLine1');
  var line2 = document.getElementById('stepLine2');
  if (ind1)  ind1.className  = 'order-step ' + (n === 1 ? 'active' : 'done');
  if (ind2)  ind2.className  = 'order-step ' + (n === 2 ? 'active' : (n > 2 ? 'done' : ''));
  if (ind3)  ind3.className  = 'order-step ' + (n === 3 ? 'active' : '');
  if (line1) line1.className = 'step-line' + (n >= 2 ? ' done' : '');
  if (line2) line2.className = 'step-line' + (n >= 3 ? ' done' : '');
}

function showOrderStep(n, direction) {
  _applyOrderStepIndicators(n);

  var currentEl = document.getElementById('orderStep' + _orderCurrentStep);
  var nextEl    = document.getElementById('orderStep' + n);
  _orderCurrentStep = n;

  // 방향 없음(초기 열기) 또는 같은 스텝이면 즉시 전환
  if (!direction || currentEl === nextEl) {
    ['orderStep1','orderStep2','orderStep3'].forEach(function(id, i) {
      document.getElementById(id).style.display = (i + 1 === n) ? 'flex' : 'none';
    });
    return;
  }

  var outClass = direction === 'forward' ? 'step-out-left'  : 'step-out-right';
  var inClass  = direction === 'forward' ? 'step-in-right'  : 'step-in-left';

  // 현재 스텝 슬라이드 아웃
  currentEl.classList.add(outClass);

  setTimeout(function() {
    currentEl.classList.remove(outClass);
    currentEl.style.display = 'none';

    // 다음 스텝 슬라이드 인
    nextEl.style.display = 'flex';
    nextEl.classList.add(inClass);
    setTimeout(function() { nextEl.classList.remove(inClass); }, 320);
  }, 170);
}

// ── 불용어: 검색 키워드 추출 시 제외할 단어 ──────────────────────────────
var _AC_STOPWORDS = [
  'hospital','clinic','center','centre','medical','dental','health',
  'company','co','ltd','co.','ltd.','inc','corp','group','international',
  'โรงพยาบาล','คลินิก','ศูนย์','การแพทย์','ทันตกรรม',
  '병원','클리닉','의원','센터','주식회사','(주)','유한'
];

function _acGetDisplayVals(d) {
  return {
    erp:    d.erp    || d.ERP    || d['ERP Code'] || d['ERP_CODE'] || '-',
    nt:     d.nt_code || '',
    name:   d.name_en || d.name_th || d.cust_name || d['Customer Name'] || d['NAME_EN'] || '',
    clinic: d.clinic  || d.cust_name || d['Clinic'] || d['CLINIC'] || ''
  };
}

// 이름에서 의미있는 키워드 추출 (4자 이상, 불용어 제외)
function _acExtractKeywords(nameStr) {
  if (!nameStr) return [];
  return nameStr.toLowerCase()
    .split(/[\s\/\-\(\)\.]+/)
    .filter(function(w) {
      return w.length >= 4 && _AC_STOPWORDS.indexOf(w) === -1;
    });
}

function custAutocomplete() {
  var q = document.getElementById('custSearchInput').value.trim().toLowerCase();
  var list = document.getElementById('custAcList');
  if (!q) { list.classList.remove('open'); return; }

  // DATA가 비어 있으면 진행 중인 로드를 기다리거나 새로 로드
  if (!DATA || DATA.length === 0) {
    list.innerHTML = '<div class="cust-ac-item" style="color:#2563eb;">⏳ ' + t('cust_loading') + '</div>';
    list.classList.add('open');
    var p = _loadCustPromise || loadCustomerData();
    p.then(function() {
      if (DATA && DATA.length > 0 && document.getElementById('custSearchInput').value.trim()) {
        custAutocomplete();
      }
    }).catch(function() {});
    return;
  }

  var qNoSpace = q.replace(/\s+/g, '');
  var qIsNumeric = /^\d+$/.test(q);
  function fieldMatch(val) {
    if (!val) return false;
    var v = String(val).toLowerCase();
    if (v.includes(q)) return true;
    if (qNoSpace && v.replace(/\s+/g, '').includes(qNoSpace)) return true;
    // NT코드: 숫자만 입력해도 NT 접두사 제거 후 매칭
    if (qIsNumeric && v.replace(/^nt/i, '').includes(q)) return true;
    return false;
  }

  // 영업 부서 사용자: 본인 담당 고객만 필터링
  var _acUser = getCurrentUser();
  var _acIsSales = _acUser && _acUser.dept === 'Sales';
  var _acIsAdmin = _isAdmin(_acUser);
  function _isMyCust(d) {
    if (!_acIsSales || _acIsAdmin) return true;
    var s = (d.sales || '').trim().toUpperCase();
    if (!s) return false;
    if (_acUser.empid && s.indexOf(_acUser.empid.toUpperCase()) > -1) return true;
    if (_acUser.name && s.toLowerCase() === _acUser.name.toLowerCase()) return true;
    if (_acUser.nickname && s.toLowerCase() === _acUser.nickname.toLowerCase()) return true;
    return false;
  }

  // ① 직접 매칭 (기존 로직 + 영업 담당 필터)
  var directSet = new Set();
  var directResults = DATA.filter(function(d, i) {
    if (!_isMyCust(d)) return false;
    var fixedMatch = fieldMatch(d.erp) || fieldMatch(d.nt_code) || fieldMatch(d.name_th) ||
                     fieldMatch(d.name_en) || fieldMatch(d.cust_name) || fieldMatch(d.clinic);
    var hit = fixedMatch || Object.values(d).some(function(v) { return fieldMatch(v); });
    if (hit) directSet.add(i);
    return hit;
  });
  // ERP코드(숫자) 우선, NT코드 후순위
  directResults.sort(function(a, b) {
    var aErp = /^\d/.test(a.erp) ? 0 : 1;
    var bErp = /^\d/.test(b.erp) ? 0 : 1;
    return aErp - bErp;
  });
  directResults = directResults.slice(0, 8);

  // ② 관련 고객: 직접 매칭된 항목의 회사명에서 키워드를 추출하여 유사 업체 검색
  var relatedResults = [];
  if (directResults.length > 0 && directResults.length <= 4) {
    // 키워드 수집 (직접 매칭 결과들의 이름 합산)
    var keywords = [];
    directResults.forEach(function(d) {
      var v = _acGetDisplayVals(d);
      _acExtractKeywords(v.name).forEach(function(kw) {
        if (keywords.indexOf(kw) === -1) keywords.push(kw);
      });
      _acExtractKeywords(v.clinic).forEach(function(kw) {
        if (keywords.indexOf(kw) === -1) keywords.push(kw);
      });
    });
    // 키워드 중 가장 긴 것 우선 최대 3개 사용 (너무 일반적인 키워드 방지)
    keywords.sort(function(a, b) { return b.length - a.length; });
    var topKw = keywords.slice(0, 3);

    if (topKw.length > 0) {
      DATA.forEach(function(d, i) {
        if (directSet.has(i)) return; // 이미 직접 매칭에 포함
        if (!_isMyCust(d)) return; // 영업 담당 필터
        var v = _acGetDisplayVals(d);
        var combined = (v.name + ' ' + v.clinic).toLowerCase();
        var matchCount = topKw.filter(function(kw) { return combined.includes(kw); }).length;
        if (matchCount >= 1) relatedResults.push({ d: d, i: i, score: matchCount });
      });
      // 매칭 키워드 많은 순 정렬, 최대 5개
      relatedResults.sort(function(a, b) { return b.score - a.score; });
      relatedResults = relatedResults.slice(0, 5);
    }
  }

  if (!directResults.length && !relatedResults.length) {
    list.classList.remove('open');
    return;
  }

  function renderItem(d, i, badge) {
    var v = _acGetDisplayVals(d);
    var ntBadge = v.nt ? '<span style="font-size:10px;color:#2563eb;background:#eff6ff;padding:1px 5px;border-radius:4px;margin-left:4px;">' + v.nt + '</span>' : '';
    return '<div class="cust-ac-item' + (badge ? ' cust-ac-related' : '') + '" onclick="selectCustomer(' + i + ')"' +
      ' onmouseenter="this.closest(\'.cust-ac-list\').querySelectorAll(\'.cust-ac-item\').forEach(function(el){el.classList.remove(\'ac-hover\')})">' +
      '<span class="cust-ac-erp">' + v.erp + '</span>' +
      '<div style="flex:1;min-width:0;">' +
        '<div class="cust-ac-name">' + (d.name_th || d.cust_name || v.name) + ntBadge + '</div>' +
        '<div class="cust-ac-clinic">' + (d.name_en && d.name_en !== (d.name_th || d.cust_name) ? d.name_en : v.clinic) + '</div>' +
      '</div>' +
      (badge ? '<span class="cust-ac-related-badge">' + t('ac_related') + '</span>' : '') +
    '</div>';
  }

  var html = directResults.map(function(d) {
    return renderItem(d, DATA.indexOf(d), false);
  }).join('');

  if (relatedResults.length > 0) {
    html += '<div class="cust-ac-section-label">&#x1F517; ' + t('ac_related_section') + '</div>';
    html += relatedResults.map(function(item) {
      return renderItem(item.d, item.i, true);
    }).join('');
  }

  list.innerHTML = html;
  list.classList.add('open');
}

function custAcKeydown(e) {
  var list = document.getElementById('custAcList');
  if (e.key === 'Escape') { list.classList.remove('open'); return; }
  if (!list.classList.contains('open')) return;
  // 섹션 라벨은 건너뛰고 클릭 가능한 항목만 선택
  var items = Array.from(list.querySelectorAll('.cust-ac-item'));
  if (!items.length) return;
  var curIdx = items.findIndex(function(el) { return el.classList.contains('ac-hover'); });
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    var nextIdx = curIdx < items.length - 1 ? curIdx + 1 : curIdx;
    if (nextIdx === curIdx && curIdx >= 0) return;
    items.forEach(function(el) { el.classList.remove('ac-hover'); });
    items[nextIdx].classList.add('ac-hover');
    items[nextIdx].scrollIntoView({ block: 'nearest' });
    // 검색창에 미리보기 (NT 뱃지 제외)
    var preview = items[nextIdx].querySelector('.cust-ac-name');
    if (preview) document.getElementById('custSearchInput').value = (preview.firstChild && preview.firstChild.nodeType === 3 ? preview.firstChild.nodeValue : preview.textContent).trim();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    var prevIdx = curIdx > 0 ? curIdx - 1 : 0;
    items.forEach(function(el) { el.classList.remove('ac-hover'); });
    items[prevIdx].classList.add('ac-hover');
    items[prevIdx].scrollIntoView({ block: 'nearest' });
    var preview2 = items[prevIdx].querySelector('.cust-ac-name');
    if (preview2) document.getElementById('custSearchInput').value = (preview2.firstChild && preview2.firstChild.nodeType === 3 ? preview2.firstChild.nodeValue : preview2.textContent).trim();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (curIdx >= 0) items[curIdx].click();
    else if (items.length === 1) items[0].click();
  }
}

function selectCustomer(idx) {
  orderCustomer = DATA[idx];
  document.getElementById('custSearchInput').value = orderCustomer.name_th || orderCustomer.name_en || '';
  document.getElementById('custAcList').classList.remove('open');
  // 카드 표시 (태국어 위, 영어 아래)
  document.getElementById('cscErp').textContent = orderCustomer.erp || '';
  document.getElementById('cscName').textContent = orderCustomer.name_th || orderCustomer.cust_name || orderCustomer.name_en || '';
  document.getElementById('cscClinic').textContent = orderCustomer.name_en || '';
  document.getElementById('custSelectedCard').classList.add('show');
  // 관리자만 편집 버튼 표시
  var _me = getCurrentUser();
  var _isAdm = _isAdmin(_me);
  var _editBtn = document.getElementById('cscEditBtn');
  if (_editBtn) { if (_isAdm) _editBtn.classList.remove('perm-hidden'); else _editBtn.classList.add('perm-hidden'); }
  // 주소 버튼 구성
  var addrs = [];
  if (orderCustomer.addr_reg)  addrs.push({ label: t('addr_reg_label'), val: orderCustomer.addr_reg });
  if (orderCustomer.addr_del)  addrs.push({ label: t('addr_del1_label'), val: orderCustomer.addr_del });
  if (orderCustomer.addr_del2) addrs.push({ label: t('addr_del2_label'), val: orderCustomer.addr_del2 });
  if (orderCustomer.addr_del3) addrs.push({ label: t('addr_del3_label'), val: orderCustomer.addr_del3 });
  if (!addrs.length && orderCustomer.address) addrs.push({ label: t('addr_reg_label'), val: orderCustomer.address });
  buildAddrBtns(addrs);
  document.getElementById('btnStepNext').disabled = false;
  // 서버에서 공유 주소 비동기 로드 (UI 갱신)
  syncSharedAddresses(orderCustomer.erp);
  // 위탁정산 모드일 때 고객 변경 시 위탁 내역 자동 조회
  if (orderShipType === '위탁정산' && orderCustomer.erp) {
    _settleRefs = [];
    orderItems = orderItems.filter(function(oi) { return !oi._settleRef; });
    renderOrderItems();
    loadConsignItems(orderCustomer.erp);
  }
}

// 주문 입력 화면에서 고객 편집 팝업 열기 (관리자 전용)
function openCustEditFromOrder() {
  if (!orderCustomer || !orderCustomer.erp) return;
  // DATA에서 최신 데이터 참조
  var cust = DATA.find(function(d) { return d.erp === orderCustomer.erp; });
  if (!cust) { neoAlert('고객 데이터를 찾을 수 없습니다.'); return; }
  // currentResults에 임시 삽입하여 openModal 호환
  var tmpIdx = currentResults.length;
  currentResults.push(cust);
  openModal(tmpIdx);
  // 바로 편집 모드 진입
  setTimeout(function() { if (!_modalEditing) toggleModalEdit(); }, 150);
}

function renderAddrButtons() {
  if (!orderCustomer) return;
  var addrs = [];
  if (orderCustomer.addr_reg)  addrs.push({ label: t('addr_reg_label'), val: orderCustomer.addr_reg });
  if (orderCustomer.addr_del)  addrs.push({ label: t('addr_del1_label'), val: orderCustomer.addr_del });
  if (orderCustomer.addr_del2) addrs.push({ label: t('addr_del2_label'), val: orderCustomer.addr_del2 });
  if (orderCustomer.addr_del3) addrs.push({ label: t('addr_del3_label'), val: orderCustomer.addr_del3 });
  if (!addrs.length && orderCustomer.address) addrs.push({ label: t('addr_reg_label'), val: orderCustomer.address });
  buildAddrBtns(addrs);
}

function selectAddress(btn, addr) {
  document.querySelectorAll('.addr-btn').forEach(function(b){ b.classList.remove('selected'); });
  btn.classList.add('selected');
  orderAddress = addr;
  updateOrderMap(addr);
}

function resetCustSelect() {
  orderCustomer = null;
  orderAddress  = null;
  orderShipType = '일반출고';
  document.getElementById('custSearchInput').value = '';
  document.getElementById('custSelectedCard').classList.remove('show');
  document.getElementById('addrSection').classList.remove('show');
  document.getElementById('ordAddrBlocks').innerHTML = '';
  document.getElementById('ordAddrAddBtn').style.display = 'none';
  updateOrderMap(null);
  document.getElementById('btnStepNext').disabled = true;
  document.querySelectorAll('.ship-type-btn').forEach(function(b) {
    b.classList.toggle('selected', b.dataset.val === '일반출고');
  });
  document.getElementById('custSearchInput').focus();
}

function _mobileSearchScroll(el) {
  if (window.innerWidth > 768) return;
  // 키보드 올라온 뒤 검색 입력란을 화면 상단으로 스크롤
  setTimeout(function() {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 350);
  setTimeout(function() {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 600);
}

function goToStep2() {
  if (!orderCustomer) return;
  showOrderStep(2, 'forward');
  document.getElementById('itemSearchInput').focus();
}

function goToStep3() {
  if (!orderItems.length && !_settleRefs.length) return;
  _proceedToStep3();
}
function _proceedToStep3() {
  if (!orderItems.length) return;
  // Step 3 고객 바: goToStep2에서 설정한 바를 직접 재생성
  var bar3 = document.getElementById('orderCustBar3');
  if (bar3 && orderCustomer) {
    bar3.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;">' +
        '<span class="ocb-erp">' + (orderCustomer.erp || '') + '</span>' +
        '<span style="font-weight:600;color:#1e3a8a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (orderCustomer.name_en || orderCustomer.name_th || '') + '</span>' +
        (orderCustomer.clinic ? '<span style="color:#6b7280;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">· ' + orderCustomer.clinic + '</span>' : '') +
      '</div>' +
      (orderAddress ? '<div style="color:#6b7280;font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">&#x1F4CD; ' + orderAddress + '</div>' : '');
  }
  // 위탁정산 모드: Step 3 UI 변경
  var isSettle = (orderShipType === '위탁정산');
  var t = function(k) { return (TRANSLATIONS && TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][k]) || (TRANSLATIONS && TRANSLATIONS.ko && TRANSLATIONS.ko[k]) || k; };
  var dateLbl = document.querySelector('[data-i18n="step3_date_label"]');
  if (dateLbl) dateLbl.textContent = isSettle ? t('step3_date_settle') : t('step3_date_label');
  var methodRow = document.querySelector('.delivery-method-row');
  var methodLabel = document.querySelector('[data-i18n="step3_method_label"]');
  var dmOtherWrap = document.getElementById('dmOtherWrap');
  if (methodRow && methodLabel) {
    if (isSettle) {
      methodRow.style.display = 'none';
      if (dmOtherWrap) dmOtherWrap.style.display = 'none';
      if (!document.getElementById('dmSettleMsg')) {
        var msg = document.createElement('div');
        msg.id = 'dmSettleMsg';
        msg.style.cssText = 'padding:12px;background:#1f2937;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-align:center;';
        msg.textContent = t('step3_method_na');
        methodRow.parentNode.appendChild(msg);
      }
    } else {
      methodRow.style.display = '';
      var settleMsg = document.getElementById('dmSettleMsg');
      if (settleMsg) settleMsg.remove();
    }
  }
  _renderStep3SettleList();
  showOrderStep(3, 'forward');
}

function _showFinalOrderReview() {
  var directItems = orderItems.filter(function(o) { return !o._settleRef; });
  var settleItems = orderItems.filter(function(o) { return !!o._settleRef; });
  var html = '';
  var grandTotal = 0;

  if (directItems.length) {
    html += '<div style="padding:8px 12px;font-size:12px;font-weight:700;color:#2563eb;background:#eff6ff;border-bottom:1px solid #bfdbfe;">📦 ' + t('fr_direct_section') + ' (' + directItems.length + ')</div>';
    directItems.forEach(function(o) {
      var lt = (o._price || 0) * (o.qty || 1);
      grandTotal += lt;
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;">';
      html += '<div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">' + (o.item.no || o.item.model || '-') + '</div>';
      html += '<div style="color:#6b7280;flex-shrink:0;">' + o.qty + t('settle_unit') + '</div>';
      html += '<div style="color:#1f2937;font-weight:700;flex-shrink:0;width:80px;text-align:right;">฿' + lt.toLocaleString() + '</div>';
      html += '</div>';
    });
  }

  if (settleItems.length) {
    html += '<div style="padding:8px 12px;font-size:12px;font-weight:700;color:#059669;background:#f0fdf4;border-bottom:1px solid #bbf7d0;">📋 ' + t('fr_settle_section') + ' (' + settleItems.length + ')</div>';
    settleItems.forEach(function(o) {
      var lt = (o._price || 0) * (o.qty || 1);
      grandTotal += lt;
      var brNo = (o._settleRef && o._settleRef.orderId) || '-';
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;">';
      html += '<div style="width:130px;flex-shrink:0;font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + brNo + '</div>';
      html += '<div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">' + (o.item.no || o.item.model || '-') + '</div>';
      html += '<div style="color:#6b7280;flex-shrink:0;">' + o.qty + t('settle_unit') + '</div>';
      html += '<div style="color:#1f2937;font-weight:700;flex-shrink:0;width:80px;text-align:right;">฿' + lt.toLocaleString() + '</div>';
      html += '</div>';
    });
  }

  html += '<div style="padding:12px;background:#f8fafc;border-top:2px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">';
  html += '<span style="font-size:13px;font-weight:700;color:#374151;">' + t('fr_total_prefix') + ' ' + orderItems.length + t('settle_count_suffix') + '</span>';
  html += '<span style="font-size:16px;font-weight:800;color:#1e3a8a;">฿' + grandTotal.toLocaleString() + '</span>';
  html += '</div>';

  var overlay = document.getElementById('finalReviewOverlay');
  document.getElementById('finalReviewBody').innerHTML = html;
  overlay.style.display = '';
  overlay.style.visibility = '';
  overlay.style.pointerEvents = '';
  overlay.classList.add('open');
}

function closeFinalReview(proceed) {
  console.log('[DEBUG] closeFinalReview called, proceed:', proceed);
  var ov = document.getElementById('finalReviewOverlay');
  if (ov) {
    ov.classList.remove('open');
    ov.style.display = 'none';
    ov.style.visibility = 'hidden';
    ov.style.pointerEvents = 'none';
  }
  if (!proceed) return;
  console.log('[DEBUG] calling _proceedToStep3Direct now');
  setTimeout(function() {
    _proceedToStep3Direct();
  }, 50);
}

function _proceedToStep3Direct() {
  console.log('[DEBUG] _proceedToStep3Direct called, orderItems:', orderItems.length, '_settleRefs:', _settleRefs.length);
  if (!orderItems.length && !_settleRefs.length) return;
  // Step 3 고객 바
  var bar3 = document.getElementById('orderCustBar3');
  if (bar3 && orderCustomer) {
    bar3.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;">' +
        '<span class="ocb-erp">' + (orderCustomer.erp || '') + '</span>' +
        '<span style="font-weight:600;color:#1e3a8a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (orderCustomer.name_en || orderCustomer.name_th || '') + '</span>' +
        (orderCustomer.clinic ? '<span style="color:#6b7280;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">· ' + orderCustomer.clinic + '</span>' : '') +
      '</div>' +
      (orderAddress ? '<div style="color:#6b7280;font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">&#x1F4CD; ' + orderAddress + '</div>' : '');
  }
  // 위탁정산 UI
  var isSettle = (orderShipType === '위탁정산');
  var t = function(k) { return (TRANSLATIONS && TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][k]) || (TRANSLATIONS && TRANSLATIONS.ko && TRANSLATIONS.ko[k]) || k; };
  var dateLbl = document.querySelector('[data-i18n="step3_date_label"]');
  if (dateLbl) dateLbl.textContent = isSettle ? t('step3_date_settle') : t('step3_date_label');
  var methodRow = document.querySelector('.delivery-method-row');
  var dmOtherWrap = document.getElementById('dmOtherWrap');
  if (methodRow) {
    if (isSettle) {
      methodRow.style.display = 'none';
      if (dmOtherWrap) dmOtherWrap.style.display = 'none';
      if (!document.getElementById('dmSettleMsg')) {
        var msg = document.createElement('div');
        msg.id = 'dmSettleMsg';
        msg.style.cssText = 'padding:12px;background:#1f2937;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-align:center;';
        msg.textContent = t('step3_method_na');
        methodRow.parentNode.appendChild(msg);
      }
    } else {
      methodRow.style.display = '';
      var settleMsg = document.getElementById('dmSettleMsg');
      if (settleMsg) settleMsg.remove();
    }
  }
  // 직접 전환 (애니메이션 없이)
  console.log('[DEBUG] _proceedToStep3Direct: switching to step 3');
  _applyOrderStepIndicators(3);
  var s1 = document.getElementById('orderStep1');
  var s2 = document.getElementById('orderStep2');
  var s3 = document.getElementById('orderStep3');
  console.log('[DEBUG] step elements:', !!s1, !!s2, !!s3);
  if (s1) { s1.style.display = 'none'; s1.style.transform = ''; s1.style.opacity = ''; }
  if (s2) { s2.style.display = 'none'; s2.style.transform = ''; s2.style.opacity = ''; }
  if (s3) { s3.style.display = 'flex'; s3.style.transform = ''; s3.style.opacity = '1'; }
  _orderCurrentStep = 3;
  _renderStep3SettleList();
  console.log('[DEBUG] step 3 done, current step:', _orderCurrentStep);
}

function goBackToStep2() {
  showOrderStep(2, 'backward');
}

// ── 날짜 입력 자동 슬래시 삽입 ───────────────────────────────────────────────
function autoSlashDate(input) {
  var v = input.value.replace(/[^0-9]/g, '');
  if (v.length >= 5) v = v.substring(0,4) + '/' + v.substring(4);
  if (v.length >= 8) v = v.substring(0,7) + '/' + v.substring(7,9);
  input.value = v;
}

// ── 날짜 스마트 파싱 (blur 시 호출) ─────────────────────────────────────────
function normalizeDateInput(input) {
  var val = input.value.trim();
  if (!val) return;
  // 숫자만 추출
  var digits = val.replace(/[^0-9]/g, '');
  // 8자리 숫자면 YYYYMMDD로 간주
  if (digits.length === 8) {
    var y = digits.substring(0,4);
    var m = digits.substring(4,6);
    var d = digits.substring(6,8);
    input.value = y + '/' + m + '/' + d;
    return;
  }
  // 구분자로 분리
  var parts = val.split(/[\/\-\.\s]+/);
  if (parts.length !== 3) return;
  var y = parts[0].replace(/[^0-9]/g,'');
  var m = parts[1].replace(/[^0-9]/g,'');
  var d = parts[2].replace(/[^0-9]/g,'');
  if (!y || !m || !d) return;
  // 스마트 연도: 1-2자리면 2000년대로
  if (y.length <= 2) y = '20' + y.padStart(2,'0');
  // 월/일 2자리로 패딩
  m = m.padStart(2,'0');
  d = d.padStart(2,'0');
  input.value = y + '/' + m + '/' + d;
}

// ── 달력 피커 → 텍스트 입력 동기화 ─────────────────────────────────────────
function syncDateFromPicker(picker) {
  var val = picker.value; // YYYY-MM-DD
  if (!val) return;
  var parts = val.split('-');
  if (parts.length === 3) {
    document.getElementById('deliveryDateInput').value = parts[0] + '/' + parts[1] + '/' + parts[2];
  }
}

// ── 커스텀 달력 위젯 (i18n 대응) ─────────────────────────────────────────
var _calTarget = null; // 현재 달력이 연결된 input 요소
var _calYear = 2026, _calMonth = 3; // 0-indexed month
var _calSelectedVal = ''; // YYYY/MM/DD 통일 형식

function _calI18n() {
  var lang = currentLang || 'ko';
  if (lang === 'en') return {
    months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    days: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
    clear: 'Clear', today: 'Today',
    fmt: function(y,m) { return this.months[m] + ' ' + y; }
  };
  if (lang === 'th') return {
    months: ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'],
    days: ['อา','จ','อ','พ','พฤ','ศ','ส'],
    clear: 'ล้าง', today: 'วันนี้',
    fmt: function(y,m) { return this.months[m] + ' ' + y; }
  };
  return {
    months: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
    days: ['일','월','화','수','목','금','토'],
    clear: '지우기', today: '오늘',
    fmt: function(y,m) { return y + '년 ' + String(m+1).padStart(2,'0') + '월'; }
  };
}

function openCustomCal(targetInput) {
  _calTarget = targetInput;
  var now = new Date();
  // 기존 값에서 연/월 파싱
  var val = targetInput.value || '';
  var parts = val.split(/[\/\-]/);
  if (parts.length === 3 && parts[0].length === 4) {
    _calYear = parseInt(parts[0]); _calMonth = parseInt(parts[1]) - 1;
    // 선택된 값을 YYYY/MM/DD로 통일 (내부 비교용)
    _calSelectedVal = parts[0] + '/' + parts[1].padStart(2,'0') + '/' + parts[2].padStart(2,'0');
  } else {
    _calYear = now.getFullYear(); _calMonth = now.getMonth();
    _calSelectedVal = '';
  }
  _renderCustomCal();
}

function _renderCustomCal() {
  var i = _calI18n();
  var ov = document.getElementById('customCalOverlay');
  if (!ov) return;
  var now = new Date();
  var todayStr = now.getFullYear() + '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + String(now.getDate()).padStart(2,'0');
  var selVal = _calSelectedVal || '';

  var html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e5e7eb;">';
  html += '<select onchange="_calYear=parseInt(this.value);_calMonth=parseInt(this.nextElementSibling.value);_renderCustomCal()" style="font-size:14px;font-weight:700;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;cursor:pointer;">';
  for (var y = now.getFullYear() - 5; y <= now.getFullYear() + 5; y++) {
    html += '<option value="' + y + '"' + (y === _calYear ? ' selected' : '') + '>' + y + '</option>';
  }
  html += '</select>';
  html += '<select onchange="_calMonth=parseInt(this.value);_calYear=parseInt(this.previousElementSibling.value);_renderCustomCal()" style="font-size:14px;font-weight:700;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;cursor:pointer;">';
  for (var m = 0; m < 12; m++) {
    html += '<option value="' + m + '"' + (m === _calMonth ? ' selected' : '') + '>' + i.months[m] + '</option>';
  }
  html += '</select>';
  html += '<div style="display:flex;gap:4px;">';
  html += '<button onclick="_calMonth--;if(_calMonth<0){_calMonth=11;_calYear--;}  _renderCustomCal()" style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">↑</button>';
  html += '<button onclick="_calMonth++;if(_calMonth>11){_calMonth=0;_calYear++;}  _renderCustomCal()" style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;">↓</button>';
  html += '</div></div>';

  // 요일 헤더
  html += '<table style="width:100%;border-collapse:collapse;text-align:center;">';
  html += '<thead><tr>';
  i.days.forEach(function(d, idx) {
    var color = idx === 0 ? '#dc2626' : idx === 6 ? '#2563eb' : '#6b7280';
    html += '<th style="padding:8px 0;font-size:12px;font-weight:600;color:' + color + ';">' + d + '</th>';
  });
  html += '</tr></thead><tbody>';

  // 날짜 그리드
  var firstDay = new Date(_calYear, _calMonth, 1).getDay();
  var daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  var prevDays = new Date(_calYear, _calMonth, 0).getDate();
  var day = 1, nextDay = 1;

  for (var row = 0; row < 6; row++) {
    html += '<tr>';
    for (var col = 0; col < 7; col++) {
      var cellIdx = row * 7 + col;
      var dateStr, label, isOtherMonth = false, isToday = false, isSelected = false;
      if (cellIdx < firstDay) {
        var pd = prevDays - firstDay + cellIdx + 1;
        var pm = _calMonth - 1, py = _calYear;
        if (pm < 0) { pm = 11; py--; }
        dateStr = py + '/' + String(pm+1).padStart(2,'0') + '/' + String(pd).padStart(2,'0');
        label = pd; isOtherMonth = true;
      } else if (day <= daysInMonth) {
        dateStr = _calYear + '/' + String(_calMonth+1).padStart(2,'0') + '/' + String(day).padStart(2,'0');
        label = day; day++;
      } else {
        var nm = _calMonth + 1, ny = _calYear;
        if (nm > 11) { nm = 0; ny++; }
        dateStr = ny + '/' + String(nm+1).padStart(2,'0') + '/' + String(nextDay).padStart(2,'0');
        label = nextDay; nextDay++; isOtherMonth = true;
      }
      if (dateStr === todayStr) isToday = true;
      if (dateStr === selVal) isSelected = true;
      var bgStyle = isSelected ? 'background:#1e3a8a;color:#fff;border-radius:6px;' : isToday ? 'background:#e5e7eb;border-radius:6px;' : '';
      var opacity = isOtherMonth ? 'opacity:.35;' : '';
      var dayColor = !isSelected && !isOtherMonth ? (col === 0 ? 'color:#dc2626;' : col === 6 ? 'color:#2563eb;' : '') : '';
      html += '<td onclick="_selectCalDate(\'' + dateStr + '\')" style="padding:6px 0;cursor:pointer;font-size:13px;font-weight:500;' + opacity + dayColor + '">';
      html += '<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;margin:auto;' + bgStyle + '">' + label + '</div>';
      html += '</td>';
    }
    html += '</tr>';
    if (day > daysInMonth && nextDay > 1) break;
  }
  html += '</tbody></table>';

  // 하단 버튼
  html += '<div style="display:flex;justify-content:space-between;padding:8px 14px;border-top:1px solid #e5e7eb;">';
  html += '<button onclick="_selectCalDate(\'\')" style="padding:6px 16px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#6b7280;font-size:12px;font-weight:600;cursor:pointer;">' + i.clear + '</button>';
  html += '<button onclick="_selectCalDate(\'' + todayStr + '\')" style="padding:6px 16px;border:1px solid #2563eb;border-radius:6px;background:#eff6ff;color:#2563eb;font-size:12px;font-weight:700;cursor:pointer;">' + i.today + '</button>';
  html += '</div>';

  document.getElementById('customCalBody').innerHTML = html;
  ov.classList.add('open');
}

function _selectCalDate(dateStr) {
  if (_calTarget) {
    if (_calTarget.type === 'date') {
      // date input은 YYYY-MM-DD 형식
      _calTarget.value = dateStr ? dateStr.replace(/\//g, '-') : '';
    } else {
      _calTarget.value = dateStr;
    }
    _calTarget.dispatchEvent(new Event('change'));
    _calTarget.dispatchEvent(new Event('input'));
  }
  closeCustomCal();
}

function closeCustomCal() {
  var ov = document.getElementById('customCalOverlay');
  if (ov) ov.classList.remove('open');
  _calTarget = null;
}

// 모든 <input type="date"> 클릭 시 커스텀 달력으로 대체 (이벤트 위임)
document.addEventListener('click', function(e) {
  var inp = e.target.closest('input[type="date"]');
  if (!inp) return;
  // 숨겨진 date picker는 무시
  if (inp.style.opacity === '0' || inp.style.display === 'none') return;
  e.preventDefault();
  openCustomCal(inp);
}, true);

function selectDeliveryMethod(btn, method) {
  document.querySelectorAll('.dm-btn').forEach(function(b){ b.classList.remove('selected'); });
  btn.classList.add('selected');
  orderDeliveryMethod = method;
  var otherWrap = document.getElementById('dmOtherWrap');
  if (method === '기타') {
    otherWrap.classList.add('show');
    document.getElementById('dmOtherInput').focus();
  } else {
    otherWrap.classList.remove('show');
    document.getElementById('dmOtherInput').value = '';
  }
}

function fileDragOver(e) {
  e.preventDefault();
  document.getElementById('fileUploadArea').classList.add('drag-over');
}
function fileDragLeave(e) {
  document.getElementById('fileUploadArea').classList.remove('drag-over');
}
function fileDrop(e) {
  e.preventDefault();
  document.getElementById('fileUploadArea').classList.remove('drag-over');
  var files = Array.from(e.dataTransfer.files).filter(function(f){ return /\.(pdf|png|jpg|jpeg)$/i.test(f.name); });
  files.forEach(readAttachFile);
}
function handleFileSelect(e) {
  Array.from(e.target.files).forEach(readAttachFile);
  e.target.value = '';
}
function readAttachFile(file) {
  var reader = new FileReader();
  reader.onload = function(ev) {
    orderAttachedFiles.push({name: file.name, type: file.type, size: file.size, dataUrl: ev.target.result});
    renderAttachedFiles();
  };
  reader.readAsDataURL(file);
}
function renderAttachedFiles() {
  var list = document.getElementById('attachedFilesList');
  if (!list) return;
  if (!orderAttachedFiles.length) { list.innerHTML = ''; return; }
  list.innerHTML = orderAttachedFiles.map(function(f, i) {
    var icon = f.type === 'application/pdf' ? '&#x1F4C4;' : '&#x1F5BC;&#xFE0F;';
    var size = f.size < 1024*1024 ? (f.size/1024).toFixed(1)+' KB' : (f.size/1024/1024).toFixed(1)+' MB';
    return '<div class="attached-file-item">' +
      '<span class="afi-icon">' + icon + '</span>' +
      '<span class="afi-name" title="' + f.name + '">' + f.name + '</span>' +
      '<span class="afi-size">' + size + '</span>' +
      '<button class="afi-preview" onclick="previewAttachedFile(' + i + ')">&#x1F441; 보기</button>' +
      '<button class="afi-del" onclick="removeAttachedFile(' + i + ')" title="삭제">&#x2715;</button>' +
    '</div>';
  }).join('');
}
function removeAttachedFile(i) {
  orderAttachedFiles.splice(i, 1);
  renderAttachedFiles();
}
function previewAttachedFile(i) {
  var f = orderAttachedFiles[i];
  if (!f) return;
  document.getElementById('fpFileName').textContent = f.name;
  var body = document.getElementById('fpBody');
  if (f.type === 'application/pdf') {
    body.innerHTML = '<iframe src="' + f.dataUrl + '"></iframe>';
  } else {
    body.innerHTML = '<img src="' + f.dataUrl + '" alt="' + f.name + '">';
  }
  document.getElementById('fpDownloadBtn').onclick = function(){ downloadAttachedFile(i); };
  document.getElementById('filePreviewOverlay').classList.add('open');
}
function downloadAttachedFile(i) {
  var f = orderAttachedFiles[i];
  if (!f) return;
  var a = document.createElement('a');
  a.href = f.dataUrl;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
// ── 공통 닫기 바운스 헬퍼 ──
function _closeBounce(el, openClass, cb) {
  if (!el || !el.classList.contains(openClass)) { if (cb) cb(); return; }
  playCloseSound();
  el.classList.add('closing');
  setTimeout(function() {
    el.classList.remove(openClass, 'closing');
    if (cb) cb();
  }, 280);
}

function closeFilePreview() {
  var el = document.getElementById('filePreviewOverlay');
  _closeBounce(el, 'open', function() { document.getElementById('fpBody').innerHTML = ''; });
}
function fpOverlayClick(e) { /* X 버튼으로만 닫힘 */ }

function goToStep1() {
  showOrderStep(1, 'backward');
}
function closeOrderForm() {
  _closeBounce(document.getElementById('orderOverlay'), 'open', function() {
    _resetModalPos(document.querySelector('.order-modal'));
  });
  document.getElementById('orderMini').classList.remove('show');
  // Google Maps 인스턴스 메모리 해제 (완전 닫기 시점에만 호출, 최소화는 제외)
  if (typeof _destroyOrderMap === 'function') _destroyOrderMap();
  // 모바일 하단 네비 복원
  var mobNav = document.getElementById('mobileBottomNav');
  if (mobNav && window.innerWidth <= 768) mobNav.style.display = 'block';
}
function minimizeOrderForm() {
  document.getElementById('orderOverlay').classList.remove('open');
  document.body.style.overflow = '';
  // 모바일 하단 네비 복원
  var mobNav = document.getElementById('mobileBottomNav');
  if (mobNav && window.innerWidth <= 768) mobNav.style.display = 'block';
  // 패키지 빌더가 열려있으면 같이 최소화 — 패키지 아이콘만 표시
  var pkgOpen = document.getElementById('pkgBuilder').classList.contains('open');
  var pkgMiniShown = document.getElementById('pkgMini').classList.contains('show');
  if (pkgOpen || pkgMiniShown) {
    if (pkgOpen) {
      document.getElementById('pkgBuilder').classList.remove('open');
      document.getElementById('pkgOverlay').classList.remove('open');
    }
    window._pkgParentMinimized = 'order';
    document.getElementById('pkgMini').classList.add('show');
    document.getElementById('orderMini').classList.remove('show');
  } else {
    document.getElementById('orderMini').classList.add('show');
  }
  _repositionMinis();
}
function restoreOrderForm() {
  document.getElementById('orderMini').classList.remove('show');
  var _ov = document.getElementById('orderOverlay');
  _ov.classList.add('open');
  _mobFullScreen(_ov, _ov.querySelector('.order-modal'));
  document.body.style.overflow = 'hidden';
  // 모바일 하단 네비 숨기기
  var mobNav = document.getElementById('mobileBottomNav');
  if (mobNav) mobNav.style.display = 'none';
  // 정산 리스트 및 Next 버튼 복원
  if (_settleRefs.length || orderItems.length) {
    renderSettleResultList(0);
    document.getElementById('submitOrderBtn').disabled = !orderItems.length;
  }
  _repositionMinis();
}
function orderOverlayClick(e) { /* X 버튼으로만 닫힘 */ }

// ══════════════════════════════════════════════════════════════
//  견적 요청 기능
// ══════════════════════════════════════════════════════════════
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _titleCase(s) {
  if (!s) return '';
  // 1) camelCase 경계에 공백 삽입: "RungarurPhothat" → "Rungarur Phothat",
  //    "MahaChakriSirindhornDentalHospital" → "Maha Chakri Sirindhorn Dental Hospital"
  //    (대문자 연속 약어는 건드리지 않음: "RMA Hospital" 유지)
  var withSpaces = String(s).replace(/([a-z])([A-Z])/g, '$1 $2');
  // 2) 단어별 Title Case (라틴 문자만 대소문자 변환, 태국어/숫자 등은 원본 유지)
  return withSpaces.split(/(\s+)/).map(function(tok) {
    if (!tok || /^\s+$/.test(tok)) return tok;
    if (/^[A-Za-z]+$/.test(tok)) {
      return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
    }
    return tok;
  }).join('');
}
function _fmtDDMMYYYY(d) {
  if (!d || isNaN(d.getTime())) return '___/___/______';
  var dd = String(d.getDate()).padStart(2,'0');
  var mm = String(d.getMonth()+1).padStart(2,'0');
  var yyyy = d.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

// ── 고객 등록 첨부 파일 ────────────────────────────────────────────────────────
var _regAttachFiles = []; // { name, type, size, data(base64) }

function handleRegAttach(input) {
  var files = Array.from(input.files);
  var remaining = 5 - _regAttachFiles.length;
  files.slice(0, remaining).forEach(function(file) {
    if (file.size > 5 * 1024 * 1024) { showToast('⚠️ ' + file.name + ' 은 5MB를 초과합니다.'); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
      _regAttachFiles.push({ name: file.name, type: file.type, size: file.size, data: e.target.result.split(',')[1] });
      renderRegAttachList();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function removeRegAttach(idx) {
  _regAttachFiles.splice(idx, 1);
  renderRegAttachList();
}

function renderRegAttachList() {
  var el = document.getElementById('regAttachFiles');
  if (!el) return;
  el.innerHTML = _regAttachFiles.map(function(f, i) {
    var sz = f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+'MB' : Math.round(f.size/1024)+'KB';
    var isImg = /^image\//i.test(f.type);
    var preview = '';
    if (isImg && f.data) {
      preview = '<img src="data:' + f.type + ';base64,' + f.data + '" class="reg-attach-thumb" onclick="event.stopPropagation();_openRegAttachPreview(' + i + ')" />';
    }
    return '<div class="reg-attach-file">' +
      preview +
      '<span class="fn">' + (isImg ? '🖼️' : '📄') + ' ' + escHtml(f.name) + ' <span style="color:#9ca3af">(' + sz + ')</span></span>' +
      '<button class="rm-btn" onclick="removeRegAttach(' + i + ')">✕</button>' +
      '</div>';
  }).join('');
}

function _openRegAttachPreview(idx) {
  var f = _regAttachFiles[idx];
  if (!f || !f.data) return;
  var src = 'data:' + f.type + ';base64,' + f.data;
  var ov = document.getElementById('regAttachPreviewOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'regAttachPreviewOverlay';
    ov.className = 'reg-attach-preview-overlay';
    ov.onclick = function() { ov.style.display = 'none'; };
    ov.innerHTML = '<img id="regAttachPreviewImg" class="reg-attach-preview-img" />';
    document.body.appendChild(ov);
  }
  document.getElementById('regAttachPreviewImg').src = src;
  ov.style.display = 'flex';
}

// ── 대기 고객 승인 ────────────────────────────────────────────────────────────
var _pendingCustomers = [];

function openPendingCustomers() {
  var _pcOv = document.getElementById('pendCustOverlay');
  _pcOv.classList.add('open');
  _mobFullScreen(_pcOv, _pcOv.querySelector('.pend-cust-modal'));
  loadPendingCustomers();
}

function closePendingCustomers() {
  closePendDetailPanel();
  document.getElementById('pendCustOverlay').classList.remove('open');
  // 닫을 때 배지를 현재 _pendingCustomers 기준으로 재갱신
  updatePendCustBadge(_pendingCustomers ? _pendingCustomers.length : 0);
  if (typeof _ssReturnCheck === 'function') _ssReturnCheck();
}

async function loadPendingCustomers() {
  var body = document.getElementById('pendCustBody');
  body.innerHTML = '<div class="load-progress-wrap"><div class="load-icon-ring"></div><div class="load-progress-label">' + t('pending_loading') + '</div></div>';
  try {
    var u = getCurrentUser();
    // Sales 부서는 관리자/승인자 여부와 무관하게 본인 등록건만 표시 (보안/읽기 절감)
    var _dept = (u && u.dept || '').toLowerCase();
    var isSalesDept = _dept === 'sales';
    var isAdmin = !isSalesDept && _isApprover(u);
    var allPending = [];
    if (u && isSalesDept && u.empid) {
      // 서버 필터: created_by 또는 reg_by에 empid 포함 건만 가져옴 (읽기 수 감소)
      var _qA = _fbDb.collection('pendingCustomers').where('status','==','Pending').where('created_by','==', u.empid).get().catch(function(){ return { docs: [] }; });
      var _qB = _fbDb.collection('pendingCustomers').where('status','==','Pending').where('reg_by','==', u.empid).get().catch(function(){ return { docs: [] }; });
      var _rs = await Promise.all([_qA, _qB]);
      var _seen = {};
      _rs.forEach(function(r){
        (r.docs || []).forEach(function(d){
          var data = d.data(); var key = d.id || (data.created_at + '|' + (data.reg_by||''));
          if (!_seen[key]) { _seen[key] = true; allPending.push(data); }
        });
      });
      // nickname 보조 매칭을 위해 client 재필터도 수행 (이름이 empid 없이 저장된 옛 데이터 대응)
      // 하지만 서버에서 이미 필터되었으므로 실제로는 그대로 사용
    } else {
      var snap = await _fbDb.collection('pendingCustomers').where('status','==','Pending').get();
      allPending = snap.docs.map(function(d){ return d.data(); });
      // 관리자/승인자가 아니면 본인 등록건만
      if (u && !isAdmin) {
        allPending = allPending.filter(function(c) {
          var regBy = (c.reg_by || '');
          if (u.empid && regBy.indexOf(u.empid) > -1) return true;
          if (u.empid && c.created_by === u.empid) return true;
          if (u.nickname && regBy.toLowerCase().indexOf(u.nickname.toLowerCase()) > -1) return true;
          return false;
        });
      }
    }
    _pendingCustomers = allPending;
    renderPendingCustomers();
    updatePendCustBadge(_pendingCustomers.length);
  } catch(e) {
    body.innerHTML = '<div class="pend-cust-empty">❌ ' + t('cm_pend_load_fail') + '</div>';
  }
}

function renderPendingCustomers() {
  var body = document.getElementById('pendCustBody');
  if (!_pendingCustomers.length) {
    body.innerHTML = '<div class="pend-cust-empty">✅ ' + t('cm_pend_empty') + '</div>';
    return;
  }
  body.innerHTML = _pendingCustomers.map(function(c, idx) {
    // 시간 포맷: YYYY-MM-DD HH:MM
    var _regAtShort = '';
    if (c.reg_at) {
      try { var _d = new Date(c.reg_at); _regAtShort = _d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0')+' '+String(_d.getHours()).padStart(2,'0')+':'+String(_d.getMinutes()).padStart(2,'0'); } catch(e) { _regAtShort = c.reg_at; }
    }
    // 중복 경고 배지
    var _dupBadgeHtml = '';
    if (c.dup_warning) {
      var _dupLabel = c.dup_warning.type === 'other_sales' ? (t('dup_warn_other_sales') || '다른 담당자 고객') : (t('dup_warn_dup_name') || '동일 고객명 존재');
      _dupBadgeHtml = ' <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;vertical-align:middle;">⚠️ ' + _dupLabel + '</span>';
    }
    return '<div class="pend-cust-card" style="cursor:pointer;" onclick="togglePendDetail(' + idx + ')">' +
      '<div class="pend-cust-card-hdr">' +
        '<span class="pend-cust-card-title">' + escHtml(c.name_th) + _dupBadgeHtml + (c.erp ? ' <span style="font-size:12px;color:#9ca3af;font-weight:400">ERP: ' + escHtml(c.erp) + '</span>' : '') + '</span>' +
        '<span class="pend-cust-card-meta">' + escHtml(_regAtShort) + '</span>' +
      '</div>' +
      '<div class="pend-cust-card-body">' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">' + t('cm_pend_type') + '</span><span class="pend-cust-v">' + escHtml(c.type) + '</span></div>' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">' + t('cm_pend_sales') + '</span><span class="pend-cust-v">' + escHtml(_titleCase(c.sales)) + '</span></div>' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">' + t('cm_pend_region') + '</span><span class="pend-cust-v">' + escHtml(c.location || '-') + '</span></div>' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">' + t('cm_pend_submitter') + '</span><span class="pend-cust-v" style="color:#2563eb;font-weight:600;">' + escHtml(c.reg_by || '-') + '</span></div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function togglePendDetail(idx) {
  var c = _pendingCustomers[idx];
  if (!c) return;
  var panel = document.getElementById('pendDetailPanel');
  var titleEl = document.getElementById('pendDetailTitle');
  var bodyEl = document.getElementById('pendDetailBody');
  var actionsEl = document.getElementById('pendDetailActions');

  titleEl.textContent = c.name_th || c.name_en || '-';

  // 시간 포맷
  var regAtShort = '';
  if (c.reg_at) { try { var _d = new Date(c.reg_at); regAtShort = _d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0')+' '+String(_d.getHours()).padStart(2,'0')+':'+String(_d.getMinutes()).padStart(2,'0'); } catch(e){ regAtShort = c.reg_at; } }

  // 중복 경고
  var dupHtml = '';
  if (c.dup_warning) {
    var dupLabel = c.dup_warning.type === 'other_sales' ? (t('dup_warn_other_sales') || '다른 담당자 고객') : (t('dup_warn_dup_name') || '동일 고객명 존재');
    dupHtml = '<div style="padding:10px 14px;background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;">' +
      '<div style="font-weight:700;color:#dc2626;font-size:12px;margin-bottom:4px;">⚠️ ' + dupLabel + '</div>' +
      '<div style="font-size:12px;color:#7f1d1d;">' +
        (t('dup_warn_existing') || '기존 고객') + ': <strong>' + escHtml(c.dup_warning.existing_name || '') + '</strong>' +
        ' (ERP: ' + escHtml(c.dup_warning.existing_erp || '-') + ')' +
        (c.dup_warning.existing_sales ? ' · Sales: <strong>' + escHtml(_titleCase(c.dup_warning.existing_sales)) + '</strong>' : '') +
      '</div></div>';
  }

  // 첨부파일
  var attachHtml = '';
  var atts = Array.isArray(c.attachments) ? c.attachments : [];
  if (atts.length) {
    attachHtml = '<div class="pend-detail-section"><div class="pend-detail-section-title">📎 ' + (t('reg_attach_label') || 'Attachments') + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
      atts.map(function(a){ return '<a href="'+escHtml(a.url)+'" target="_blank" style="display:inline-flex;align-items:center;gap:4px;background:#f3f4f6;border-radius:6px;padding:6px 12px;font-size:12px;color:#374151;text-decoration:none;">📄 '+escHtml(a.name)+'</a>'; }).join('') +
      '</div></div>';
  }

  function kv(label, val, full) {
    return '<div class="pend-detail-kv' + (full ? ' full' : '') + '"><span class="pd-label">' + label + '</span><span class="pd-value">' + (val || '-') + '</span></div>';
  }

  bodyEl.innerHTML =
    dupHtml +
    '<div class="pend-detail-section">' +
      '<div class="pend-detail-section-title">' + (t('modal_basic_info') || 'Basic Info') + '</div>' +
      '<div class="pend-detail-grid">' +
        kv(t('cm_pend_submitter') || 'Submitter', '<strong style="color:#2563eb;">' + escHtml(c.reg_by || '-') + '</strong>') +
        kv(t('cm_pend_reg_date') || 'Date', escHtml(regAtShort)) +
        kv(t('cm_pend_type') || 'Type', escHtml(c.type)) +
        kv(t('cm_pend_sales') || 'Sales', escHtml(_titleCase(c.sales))) +
        kv('Status', '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;' +
          (c.status === 'Pending' ? 'background:#fef3c7;color:#92400e;' : c.status === 'Active' ? 'background:#d1fae5;color:#065f46;' : 'background:#fee2e2;color:#991b1b;') +
          '">' + escHtml(c.status || 'Pending') + '</span>') +
        kv('ERP', c.erp ? escHtml(c.erp) : '-') +
        kv(t('cm_pend_name_en') || 'Name (EN)', escHtml(c.name_en)) +
        kv(t('cm_pend_clinic') || 'Clinic', escHtml(c.clinic)) +
      '</div>' +
    '</div>' +
    '<div class="pend-detail-section">' +
      '<div class="pend-detail-section-title">' + (t('modal_contact_info') || 'Contact') + '</div>' +
      '<div class="pend-detail-grid">' +
        kv(t('cm_pend_tel') || 'Phone', c.tel ? '<a href="tel:' + c.tel.replace(/[^\d+]/g,'') + '">' + escHtml(c.tel) + '</a>' : '-') +
        kv(t('cm_tax_id') || 'Tax ID', escHtml(c.taxid)) +
      '</div>' +
    '</div>' +
    '<div class="pend-detail-section">' +
      '<div class="pend-detail-section-title">' + (t('modal_address') || 'Address') + '</div>' +
      '<div class="pend-detail-grid">' +
        kv(t('cm_pend_region') || 'Region', escHtml(c.location)) +
        kv('', '') +
        kv(t('cm_pend_addr') || 'Reg. Address', escHtml(c.addr_reg), true) +
        kv(t('cm_pend_del1') || 'Delivery 1', escHtml(c.addr_del), true) +
        (c.addr_del2 ? kv(t('cm_pend_del2') || 'Delivery 2', escHtml(c.addr_del2), true) : '') +
        (c.addr_del3 ? kv(t('cm_pend_del3') || 'Delivery 3', escHtml(c.addr_del3), true) : '') +
      '</div>' +
    '</div>' +
    (c.remark ? '<div class="pend-detail-section"><div class="pend-detail-section-title">' + (t('cm_pend_remark') || 'Memo') + '</div><div style="font-size:13px;color:#374151;">' + escHtml(c.remark) + '</div></div>' : '') +
    attachHtml;

  // 액션 버튼
  var u = getCurrentUser();
  var isMine = u && c.reg_by && c.reg_by.indexOf(u.empid) > -1;
  if (!isMine && u && c.sales && u.name && c.sales.toLowerCase() === u.name.toLowerCase()) isMine = true;
  var isApprover = _isApprover(u);
  var canEdit = isMine || isApprover;
  actionsEl.innerHTML =
    '<button class="btn-pend-back" onclick="closePendDetailPanel()" style="padding:8px 16px;border:1.5px solid #d1d5db;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;">← ' + t('cm_pend_back') + '</button>' +
    '<div style="flex:1"></div>' +
    (canEdit ? '<button class="btn-pend-edit" onclick="openPendEditInPanel(' + idx + ')">✏️ ' + t('cm_pend_edit') + '</button>' : '') +
    (canEdit ? '<button class="btn-pend-delete" onclick="deletePendingCustomer(' + idx + ')" style="padding:8px 16px;border:1.5px solid #fca5a5;border-radius:8px;background:#fef2f2;color:#dc2626;font-size:13px;font-weight:600;cursor:pointer;">🗑️ ' + t('cm_pend_delete') + '</button>' : '') +
    (isApprover ? '<button class="btn-pend-reject" onclick="closePendDetailPanel();rejectPendingCustomer(' + idx + ')">✕ ' + t('cm_pend_reject') + '</button>' : '') +
    (isApprover ? '<button class="btn-pend-approve" onclick="closePendDetailPanel();approvePendingCustomer(' + idx + ')">✅ ' + t('cm_pend_approve') + '</button>' : '');

  panel.classList.add('open');
  var modal = document.querySelector('.pend-split-modal');
  if (modal) modal.classList.add('expanded');
  // 선택된 카드 하이라이트
  var cards = document.querySelectorAll('#pendCustBody .pend-cust-card');
  cards.forEach(function(card, i) { card.classList.toggle('selected', i === idx); });
}

var _pendDetailIdx = -1;
function closePendDetailPanel() {
  document.getElementById('pendDetailPanel').classList.remove('open');
  var modal = document.querySelector('.pend-split-modal');
  if (modal) modal.classList.remove('expanded');
  var cards = document.querySelectorAll('#pendCustBody .pend-cust-card');
  cards.forEach(function(card) { card.classList.remove('selected'); });
  _pendDetailIdx = -1;
}

function openPendEditInPanel(idx) {
  var c = _pendingCustomers[idx];
  if (!c) return;
  var bodyEl = document.getElementById('pendDetailBody');
  var actionsEl = document.getElementById('pendDetailActions');
  var titleEl = document.getElementById('pendDetailTitle');
  titleEl.textContent = '✏️ ' + (t('cm_pend_edit') || 'Edit');

  var typeOpts = ['Dentist','Clinic','Hospital','Company','University','Other'];
  var typeSel = typeOpts.map(function(o) {
    return '<option value="' + o + '"' + ((c.type || '') === o ? ' selected' : '') + '>' + o + '</option>';
  }).join('');

  var regSel = document.getElementById('reg_location');
  var locOpts = '<option value="">-</option>';
  if (regSel) {
    Array.from(regSel.options).forEach(function(opt) {
      if (!opt.value) return;
      locOpts += '<option value="' + opt.value + '"' + (opt.value === (c.location || '') ? ' selected' : '') + '>' + opt.textContent + '</option>';
    });
  }

  function ef(id, label, val) {
    return '<div class="pend-detail-kv"><span class="pd-label">' + label + '</span><input id="' + id + '" value="' + escHtml(val || '') + '" style="width:100%;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box;outline:none;"></div>';
  }
  function sf(id, label, opts) {
    return '<div class="pend-detail-kv"><span class="pd-label">' + label + '</span><select id="' + id + '" style="width:100%;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;">' + opts + '</select></div>';
  }
  function eff(id, label, val) {
    return '<div class="pend-detail-kv full"><span class="pd-label">' + label + '</span><input id="' + id + '" value="' + escHtml(val || '') + '" style="width:100%;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box;outline:none;"></div>';
  }

  bodyEl.innerHTML =
    '<div class="pend-detail-section"><div class="pend-detail-section-title">' + (t('modal_basic_info') || 'Basic Info') + '</div><div class="pend-detail-grid">' +
      ef('pe_name_th', t('cm_name_th') || 'Name (TH)', c.name_th) +
      ef('pe_name_en', t('cm_name_en') || 'Name (EN)', c.name_en) +
      ef('pe_clinic', t('cm_pend_clinic') || 'Clinic', c.clinic) +
      ef('pe_name_en2', t('cm_pend_name_en2') || 'Name (EN2)', c.name_en2) +
      sf('pe_type', t('cm_pend_type') || 'Type', typeSel) +
      sf('pe_location', t('cm_pend_region') || 'Region', locOpts) +
    '</div></div>' +
    '<div class="pend-detail-section"><div class="pend-detail-section-title">' + (t('modal_contact_info') || 'Contact') + '</div><div class="pend-detail-grid">' +
      ef('pe_tel', t('cm_pend_tel') || 'Phone', c.tel) +
      ef('pe_taxid', 'Tax ID', c.taxid) +
    '</div></div>' +
    '<div class="pend-detail-section"><div class="pend-detail-section-title">' + (t('modal_address') || 'Address') + '</div><div class="pend-detail-grid">' +
      eff('pe_addr_reg', t('cm_pend_addr') || 'Reg. Address', c.addr_reg) +
      eff('pe_addr_del', t('cm_pend_del1') || 'Delivery 1', c.addr_del) +
      eff('pe_addr_del2', t('cm_pend_del2') || 'Delivery 2', c.addr_del2) +
      eff('pe_addr_del3', t('cm_pend_del3') || 'Delivery 3', c.addr_del3) +
    '</div></div>' +
    '<div class="pend-detail-section"><div class="pend-detail-section-title">' + (t('cm_pend_remark') || 'Memo') + '</div>' +
      '<input id="pe_remark" value="' + escHtml(c.remark || '') + '" style="width:100%;padding:6px 8px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box;outline:none;">' +
    '</div>';

  actionsEl.innerHTML =
    '<button onclick="togglePendDetail(' + idx + ')" style="padding:7px 16px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;">' + (t('btn_cancel') || '취소') + '</button>' +
    '<button onclick="savePendEditPanel(' + idx + ')" style="padding:7px 22px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">💾 ' + (t('cm_pend_save') || 'Save') + '</button>';
}

async function savePendEditPanel(idx) {
  var c = _pendingCustomers[idx];
  if (!c || !c.id) return;
  var updates = {
    name_th: (document.getElementById('pe_name_th').value || '').trim(),
    name_en: (document.getElementById('pe_name_en').value || '').trim(),
    name_en2: (document.getElementById('pe_name_en2').value || '').trim(),
    clinic: (document.getElementById('pe_clinic').value || '').trim(),
    type: document.getElementById('pe_type').value,
    tel: (document.getElementById('pe_tel').value || '').trim(),
    taxid: (document.getElementById('pe_taxid').value || '').trim(),
    location: document.getElementById('pe_location').value,
    addr_reg: (document.getElementById('pe_addr_reg').value || '').trim(),
    addr_del: (document.getElementById('pe_addr_del').value || '').trim(),
    addr_del2: (document.getElementById('pe_addr_del2').value || '').trim(),
    addr_del3: (document.getElementById('pe_addr_del3').value || '').trim(),
    remark: (document.getElementById('pe_remark').value || '').trim()
  };
  updates.cust_name = updates.clinic || updates.name_th;
  try {
    await _fbDb.collection('pendingCustomers').doc(c.id).update(updates);
    Object.assign(c, updates);
    renderPendingCustomers();
    togglePendDetail(idx); // 저장 후 상세 보기로 복귀
    showToast('✅ ' + (t('msg_saved') || 'Saved'));
  } catch(e) {
    console.error('[pendEdit]', e);
    showToast('❌ ' + (t('msg_error') || 'Error'));
  }
}

// ── 고객 승인 결과 조회 ──────────────────────────────────
var _custApprResults = [];

function openCustApprovalResults() {
  var overlay = document.getElementById('custApprResultOverlay');
  overlay.classList.add('open');
  loadCustApprovalResults();
}

function closeCustApprovalResults() {
  document.getElementById('custApprResultOverlay').classList.remove('open');
  if (typeof _ssReturnCheck === 'function') _ssReturnCheck();
}

// ── 고객 정보 찾기 (DBD / RD) ──
function openCustInfoSearch() {
  var overlay = document.getElementById('custInfoSearchOverlay');
  overlay.classList.add('open');
}
function closeCustInfoSearch() {
  document.getElementById('custInfoSearchOverlay').classList.remove('open');
}
function openCisLink(type) {
  if (type === 'dbd') window.open('https://datawarehouse.dbd.go.th', '_blank');
  else if (type === 'tda') window.open('https://dentalcouncil.or.th/FindDentist', '_blank');
  else if (type === 'moph') window.open('https://hcode.moph.go.th/code/', '_blank');
  else window.open('https://eservice.rd.go.th/rd-ves-web/search/vat', '_blank');
}

function openDbdSearch() {
  var el = document.getElementById('dbdSearchOverlay');
  el.style.display = 'flex';
  setTimeout(function() { document.getElementById('dbdRegNoInput').focus(); }, 100);
}
function closeDbdSearch() {
  var el = document.getElementById('dbdSearchOverlay');
  el.style.display = 'none';
  document.getElementById('dbdResultArea').innerHTML = '';
  document.getElementById('dbdRegNoInput').value = '';
}

async function searchDbdCompany() {
  var input = document.getElementById('dbdRegNoInput');
  var btn = document.getElementById('dbdSearchBtn');
  var area = document.getElementById('dbdResultArea');
  var id = input.value.trim();
  if (!id) return;
  if (!/^\d{13}$/.test(id)) {
    area.innerHTML = '<div style="color:#dc2626;font-size:13px;padding:8px 0;">⚠️ 13자리 등록번호를 입력하세요</div>';
    return;
  }
  btn.disabled = true; btn.textContent = '...';
  area.innerHTML = '<div style="text-align:center;color:#64748b;font-size:13px;padding:16px 0;">🔎 Searching DBD...</div>';
  try {
    var resp = await fetch('https://us-central1-neothai-order.cloudfunctions.net/dbdLookup?id=' + id);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    if (!data.found) {
      area.innerHTML = '<div style="text-align:center;padding:20px 0;color:#94a3b8;font-size:13px;">🏢 No data found<br><a href="https://datawarehouse.dbd.go.th/search?q=' + id + '" target="_blank" style="color:#0e7490;font-size:12px;">Search on DBD Website ↗</a></div>';
      return;
    }
    var d = data.data;
    var stColor = '#d97706';
    if (d.status && (d.status.includes('ดำเนิน') || d.status.toLowerCase().includes('active'))) stColor = '#16a34a';
    else if (d.status && (d.status.includes('เลิก') || d.status.toLowerCase().includes('dissolv'))) stColor = '#dc2626';
    var cap = d.capital ? Number(d.capital).toLocaleString() + ' ฿' : 'N/A';
    var regDt = d.regDate && d.regDate.length === 8 ? d.regDate.substring(0,4)+'-'+d.regDate.substring(4,6)+'-'+d.regDate.substring(6,8) : d.regDate || '';
    var html = '<div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.12);">';
    // Header
    html += '<div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:18px 20px;">';
    html += '<div style="font-size:10px;color:#93c5fd;font-weight:600;letter-spacing:0.1em;margin-bottom:4px;">DBD COMPANY DETAIL</div>';
    html += '<div style="color:#fff;font-weight:700;font-size:15px;line-height:1.4;">' + (d.nameTh || '-') + '</div>';
    html += '</div>';
    // Detail rows
    var rows = [
      ['📋', t('cis_dbd_jurid'), d.regNo],
      ['🏢', t('dbd_name_th'), d.nameTh],
      ['🏢', t('dbd_name_en'), d.nameEn],
      ['📌', t('cis_dbd_type'), d.type],
      ['🟢', t('dbd_status'), d.status],
      ['💰', t('cis_dbd_capital'), cap],
      ['📅', t('cis_dbd_regdate'), regDt],
      ['🏠', t('dbd_branch'), d.branch],
      ['📝', t('cis_dbd_objective'), d.objective],
      ['📍', t('dbd_province'), d.province],
      ['🗺️', t('dbd_district'), (d.subdistrict ? d.subdistrict + ', ' : '') + (d.district || '')],
      ['🏠', t('cis_dbd_addr'), d.address]
    ];
    html += '<div style="padding:4px 0;">';
    rows.forEach(function(r) {
      if (!r[2]) return;
      html += '<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 20px;border-bottom:1px solid #f1f5f9;">';
      html += '<span style="font-size:16px;flex-shrink:0;width:24px;text-align:center;">' + r[0] + '</span>';
      html += '<div style="min-width:100px;color:#64748b;font-size:13px;font-weight:500;">' + r[1] + '</div>';
      html += '<div style="color:#1e293b;font-size:13px;font-weight:600;flex:1;word-break:break-all;">' + r[2] + '</div>';
      html += '</div>';
    });
    html += '</div></div>';
    area.innerHTML = html;
  } catch(e) {
    area.innerHTML = '<div style="color:#dc2626;font-size:13px;padding:8px 0;">⚠️ ' + e.message + '</div>';
  } finally {
    btn.disabled = false; btn.textContent = 'Search';
  }
}

async function loadCustApprovalResults() {
  var body = document.getElementById('custApprResultBody');
  body.innerHTML = '<div class="load-progress-wrap"><div class="load-icon-ring"></div><div class="load-progress-label">로딩 중...</div></div>';
  try {
    var snapAppr = await _fbDb.collection('pendingCustomers').where('status','==','Approved').get();
    var snapRej  = await _fbDb.collection('pendingCustomers').where('status','==','Rejected').get();
    _custApprResults = [];
    snapAppr.docs.forEach(function(d) { _custApprResults.push(Object.assign({ id: d.id }, d.data())); });
    snapRej.docs.forEach(function(d) { _custApprResults.push(Object.assign({ id: d.id }, d.data())); });
    // 본인 제출 건만 표시 (관리자/승인자 제외)
    var _carUser = getCurrentUser();
    var _carIsAdmin = _isApprover(_carUser);
    if (!_carIsAdmin && _carUser) {
      _custApprResults = _custApprResults.filter(function(c) {
        return c.reg_by && c.reg_by.indexOf(_carUser.empid) > -1;
      });
    }
    // 최신순 정렬
    _custApprResults.sort(function(a, b) {
      var ta = a.approved_at || a.rejected_at || a.reg_at || '';
      var tb = b.approved_at || b.rejected_at || b.reg_at || '';
      return tb.localeCompare(ta);
    });
    renderCustApprResults();
  } catch(e) {
    body.innerHTML = '<div class="pend-cust-empty">❌ 데이터 로딩 실패</div>';
  }
}

function filterCustApprResults() {
  renderCustApprResults();
}

function _carFmtDate(isoStr) {
  if (!isoStr) return '-';
  try { var d = new Date(isoStr); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); } catch(e) { return isoStr; }
}
function _carDateOnly(isoStr) {
  if (!isoStr) return '';
  try { return new Date(isoStr).toISOString().slice(0,10); } catch(e) { return ''; }
}

function renderCustApprResults() {
  var body = document.getElementById('custApprResultBody');
  var filterVal = document.getElementById('custApprResultFilter').value;
  var searchQ = (document.getElementById('custApprSearchInput').value || '').trim().toLowerCase();
  var dateFrom = document.getElementById('custApprDateFrom').value;
  var dateTo = document.getElementById('custApprDateTo').value;

  var list = _custApprResults;
  // 상태 필터
  if (filterVal !== 'all') {
    list = list.filter(function(c) { return c.status === filterVal; });
  }
  // 키워드 검색
  if (searchQ) {
    list = list.filter(function(c) {
      var haystack = [c.name_th, c.name_en, c.cust_name, c.clinic, c.erp, c.nt_code, c.sales, c.reg_by, c.approved_by, c.rejected_by, c.location].join(' ').toLowerCase();
      return haystack.indexOf(searchQ) > -1;
    });
  }
  // 날짜 필터
  if (dateFrom || dateTo) {
    list = list.filter(function(c) {
      var dt = _carDateOnly(c.approved_at || c.rejected_at || c.reg_at);
      if (!dt) return false;
      if (dateFrom && dt < dateFrom) return false;
      if (dateTo && dt > dateTo) return false;
      return true;
    });
  }

  if (!list.length) {
    body.innerHTML = '<div class="pend-cust-empty" style="padding:40px 0;text-align:center;color:#9ca3af;">📭 ' + (t('car_no_results') || '조회 결과가 없습니다.') + '</div>';
    return;
  }
  body.innerHTML = list.map(function(c, idx) {
    var isApproved = c.status === 'Approved';
    var statusColor = isApproved ? 'background:#d1fae5;color:#065f46;' : 'background:#fee2e2;color:#991b1b;';
    var statusLabel = isApproved ? '✅ ' + (t('car_approved') || '승인') : '❌ ' + (t('car_rejected') || '거절');
    var processedBy = isApproved ? (c.approved_by || '-') : (c.rejected_by || '-');
    var processedAt = _carFmtDate(isApproved ? c.approved_at : c.rejected_at);
    var regDate = _carFmtDate(c.reg_at);

    return '<div style="display:flex;gap:0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:10px;background:#fff;">' +
      '<div style="flex:1;padding:14px 16px;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">' +
          '<span style="font-weight:700;font-size:15px;color:#111827;">' + escHtml(c.name_th || c.cust_name || '-') + '</span>' +
          (c.erp ? '<span style="font-size:11px;color:#6b7280;background:#f3f4f6;padding:2px 6px;border-radius:4px;">ERP: ' + escHtml(c.erp) + '</span>' : '') +
          (c.nt_code ? '<span style="font-size:11px;color:#6b7280;background:#f3f4f6;padding:2px 6px;border-radius:4px;">' + escHtml(c.nt_code) + '</span>' : '') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;font-size:12px;color:#374151;">' +
          '<div><span style="color:#9ca3af;">Name(EN)</span> ' + escHtml(c.name_en || '-') + '</div>' +
          '<div><span style="color:#9ca3af;">Clinic</span> ' + escHtml(c.clinic || '-') + '</div>' +
          '<div><span style="color:#9ca3af;">Type</span> ' + escHtml(c.type || '-') + '</div>' +
          '<div><span style="color:#9ca3af;">Sales</span> ' + escHtml(_titleCase(c.sales || '')) + '</div>' +
          '<div><span style="color:#9ca3af;">Tel</span> ' + escHtml(c.tel || '-') + '</div>' +
          '<div><span style="color:#9ca3af;">Region</span> ' + escHtml(c.location || '-') + '</div>' +
          '<div style="grid-column:1/-1;"><span style="color:#9ca3af;">Address</span> ' + escHtml(c.addr_reg || '-') + '</div>' +
          '<div><span style="color:#9ca3af;">' + (t('car_submitted') || 'Submitted') + '</span> ' + escHtml(c.reg_by || '-') + '</div>' +
          '<div><span style="color:#9ca3af;">' + (t('car_reg_date') || 'Reg. Date') + '</span> ' + escHtml(regDate) + '</div>' +
          (c.status === 'Rejected' && c.remark ? '<div style="grid-column:1/-1;"><span style="color:#ef4444;">Reason</span> ' + escHtml(c.remark) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div style="width:150px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 12px;border-left:1px solid #e5e7eb;' + (isApproved ? 'background:#f0fdf4;' : 'background:#fef2f2;') + '">' +
        '<div style="font-size:24px;margin-bottom:4px;">' + (isApproved ? '✅' : '❌') + '</div>' +
        '<div style="display:inline-block;padding:3px 10px;border-radius:10px;font-size:12px;font-weight:700;' + statusColor + '">' + statusLabel + '</div>' +
        '<div style="margin-top:8px;font-size:11px;color:#374151;text-align:center;font-weight:600;">' + (t('car_processed_by') || '처리자') + '</div>' +
        '<div style="font-size:11px;color:#6b7280;text-align:center;">' + escHtml(processedBy) + '</div>' +
        '<div style="font-size:10px;color:#9ca3af;text-align:center;margin-top:4px;">' + escHtml(processedAt) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function approvePendingCustomer(idx) {
  var c = _pendingCustomers[idx];
  if (!c) return;
  var btn = document.querySelector('#pendCard-' + idx + ' .btn-pend-approve');
  if (btn) { btn.disabled = true; btn.textContent = t('msg_processing'); }
  try {
    var res = await apiPost({ action: 'approve_customer', id: c.id });
    if (res.ok) {
      // DATA에 즉시 반영
      if (res.customer) {
        res.customer._new = true;
        res.customer._search = [res.customer.erp, res.customer.name_th, res.customer.sales, res.customer.location].join(' ').toLowerCase();
        DATA.push(res.customer);
        try { if (typeof _custPersistCache === 'function') _custPersistCache(); } catch(e) {}
      }
      _pendingCustomers.splice(idx, 1);
      renderPendingCustomers();
      updatePendCustBadge(_pendingCustomers.length);
      showToast('✅ 고객이 승인되어 마스터에 등록되었습니다.');
    } else {
      showToast('❌ 승인 실패: ' + (res.msg || '오류'));
      if (btn) { btn.disabled = false; btn.textContent = '✅ 승인'; }
    }
  } catch(e) {
    showToast('❌ 네트워크 오류');
    if (btn) { btn.disabled = false; btn.textContent = '✅ 승인'; }
  }
}

async function rejectPendingCustomer(idx) {
  var c = _pendingCustomers[idx];
  if (!c) return;
  var reason = prompt(t('msg_reject_reason'));
  if (reason === null) return; // 취소
  var btn = document.querySelector('#pendCard-' + idx + ' .btn-pend-reject');
  if (btn) { btn.disabled = true; btn.textContent = t('msg_processing'); }
  try {
    var res = await apiPost({ action: 'reject_customer', id: c.id, reason: reason || '' });
    _pendingCustomers.splice(idx, 1);
    renderPendingCustomers();
    updatePendCustBadge(_pendingCustomers.length);
    showToast('🗑️ 거절 처리되었습니다.');
  } catch(e) {
    showToast('❌ 네트워크 오류');
    if (btn) { btn.disabled = false; btn.textContent = '✕ 거절'; }
  }
}

async function deletePendingCustomer(idx) {
  var c = _pendingCustomers[idx];
  if (!c) return;
  if (!confirm(t('cm_pend_delete_confirm') || '이 대기 고객을 삭제하시겠습니까?')) return;
  try {
    await _fbDb.collection('pendingCustomers').doc(c.id).delete();
    _pendingCustomers.splice(idx, 1);
    closePendDetailPanel();
    renderPendingCustomers();
    updatePendCustBadge(_pendingCustomers.length);
    showToast('🗑️ ' + (t('cm_pend_deleted') || '삭제되었습니다.'));
  } catch(e) {
    showToast('❌ ' + (t('cm_pend_delete_fail') || '삭제 실패'));
  }
}

function editPendingCustomer(idx) {
  var c = _pendingCustomers[idx];
  if (!c) return;
  var card = document.getElementById('pendCard-' + idx);
  if (!card) return;
  if (card.querySelector('.pend-edit-form')) return;

  // 첨부파일 임시 저장
  window._peAttachFiles = [];
  var existAtts = Array.isArray(c.attachments) ? c.attachments : [];

  var typeOpts = ['Dentist','Clinic','Hospital','Company','University','Other'];
  var typeSel = typeOpts.map(function(o) {
    return '<option value="' + o + '"' + ((c.type || '') === o ? ' selected' : '') + '>' + o + '</option>';
  }).join('');

  // 영업 담당자 옵션
  var salesNames = ['Ben','Chompoo','Eve','Gam','Hongfah','Ice','Jong','Mai','Mamaew','Mod','Narmphung','Neng','Ning','Opal','Pat','Plu','Rung','Shirley','Tang'];
  var salesSel = '<option value="">-</option>' + salesNames.map(function(s) {
    return '<option value="' + s + '"' + (s.toLowerCase() === (c.sales || '').toLowerCase() ? ' selected' : '') + '>' + s + '</option>';
  }).join('');

  var regSel = document.getElementById('reg_location');
  var locOpts = '<option value="">-</option>';
  if (regSel) {
    Array.from(regSel.options).forEach(function(opt) {
      if (!opt.value) return;
      locOpts += '<option value="' + opt.value + '"' + (opt.value === (c.location || '') ? ' selected' : '') + '>' + opt.textContent + '</option>';
    });
  }

  // Tax ID: "0 0000 00000 00 0" → 빈값
  var taxVal = c.taxid || '';
  if (taxVal.replace(/[\s\-]/g, '') === '0000000000000') taxVal = '';

  // 기존 첨부파일 표시
  var existAttHtml = existAtts.map(function(a, i) {
    var isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(a.name || '');
    return '<div class="reg-attach-file" id="peExistAtt' + i + '">' +
      (isImg ? '<img src="' + escHtml(a.url) + '" class="reg-attach-thumb" onclick="event.stopPropagation();window.open(\'' + escHtml(a.url) + '\',\'_blank\')" />' : '') +
      '<span class="fn">' + (isImg ? '🖼️' : '📄') + ' ' + escHtml(a.name) + '</span>' +
      '<button class="rm-btn" onclick="document.getElementById(\'peExistAtt' + i + '\').remove()">✕</button>' +
    '</div>';
  }).join('');

  var formHtml = '<div class="pend-edit-form" style="border-top:2px solid #2563eb;padding:16px;background:#f8fafc;">' +
    '<div style="font-weight:700;font-size:14px;color:#2563eb;margin-bottom:12px;">✏️ ' + t('cm_pend_edit') + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;">' +
      // 1) 고객 유형 + 영업 담당자
      '<div><label style="font-size:11px;color:#6b7280;">' + t('cm_pend_type') + '</label><select id="pe_type" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">' + typeSel + '</select></div>' +
      '<div><label style="font-size:11px;color:#6b7280;">' + (t('reg_label_sales') || '영업 담당자') + '</label><select id="pe_sales" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">' + salesSel + '</select></div>' +
      // 2) 고객 이름
      '<div style="grid-column:1/-1">' + _pendEditFieldInner('pe_name_th', t('cm_name_th'), c.name_th || '') + '</div>' +
      // 3) 소속
      '<div style="grid-column:1/-1">' + _pendEditFieldInner('pe_clinic', t('cm_pend_clinic'), c.clinic || '') + '</div>' +
      // 4) 등록 주소 + 우편번호
      '<div style="grid-column:1/-1"><label style="font-size:11px;color:#6b7280;">' + t('cm_pend_addr') + '</label>' +
        '<input id="pe_addr_reg" value="' + escHtml(c.addr_reg || '') + '" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;" autocomplete="new-password" />' +
        '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;"><span style="font-size:11px;color:#6b7280;">📮 우편번호</span><input id="pe_zip_reg" value="' + escHtml(c.zip_reg || '') + '" placeholder="00000" maxlength="10" style="width:100px;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;" /></div>' +
      '</div>' +
      // 5) 배송 주소 1 + 우편번호
      '<div style="grid-column:1/-1"><label style="font-size:11px;color:#6b7280;">' + t('cm_pend_del1') + '</label>' +
        '<input id="pe_addr_del" value="' + escHtml(c.addr_del || '') + '" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;" autocomplete="new-password" />' +
        '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;"><span style="font-size:11px;color:#6b7280;">📮 우편번호</span><input id="pe_zip_del" value="' + escHtml(c.zip_del || '') + '" placeholder="00000" maxlength="10" style="width:100px;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;" /></div>' +
      '</div>' +
      // 배송 주소 2
      '<div style="grid-column:1/-1">' + _pendEditFieldInner('pe_addr_del2', t('cm_pend_del2'), c.addr_del2 || '') + '</div>' +
      // 배송 주소 3
      '<div style="grid-column:1/-1">' + _pendEditFieldInner('pe_addr_del3', t('cm_pend_del3'), c.addr_del3 || '') + '</div>' +
      // 6) 지역
      '<div><label style="font-size:11px;color:#6b7280;">' + t('cm_pend_region') + '</label><select id="pe_location" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">' + locOpts + '</select></div>' +
      // 7) 연락처
      _pendEditField('pe_tel', t('cm_pend_tel'), c.tel || '') +
      // 8) Tax ID
      '<div style="grid-column:1/-1">' + _pendEditFieldInner('pe_taxid', 'Tax ID', taxVal) + '</div>' +
      // 9) 비고
      '<div style="grid-column:1/-1">' + _pendEditFieldInner('pe_remark', t('cm_pend_remark'), c.remark || '') + '</div>' +
      // 10) 첨부 자료
      '<div style="grid-column:1/-1">' +
        '<label style="font-size:11px;color:#6b7280;">📎 ' + (t('reg_attach_label') || '첨부 자료') + '</label>' +
        '<div class="reg-attach-area" onclick="document.getElementById(\'pe_attach_input\').click()" style="margin-top:4px;padding:10px;text-align:center;border:2px dashed #d1d5db;border-radius:8px;cursor:pointer;font-size:12px;color:#6b7280;">📂 클릭하여 파일 추가 (최대 5개)</div>' +
        '<input type="file" id="pe_attach_input" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx" style="display:none" onchange="_handlePeAttach(this)" />' +
        '<div id="peExistAttachList">' + existAttHtml + '</div>' +
        '<div class="reg-attach-files" id="peNewAttachList"></div>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
      '<button onclick="savePendEdit(' + idx + ')" style="padding:7px 22px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">💾 ' + t('cm_pend_save') + '</button>' +
      '<button onclick="cancelPendEdit(' + idx + ')" style="padding:7px 16px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;">' + t('cm_close') + '</button>' +
    '</div>' +
  '</div>';

  var actions = card.querySelector('.pend-cust-actions');
  if (actions) {
    actions.style.display = 'none';
    actions.insertAdjacentHTML('beforebegin', formHtml);
  }

  // Google Places Autocomplete 연결
  setTimeout(function() { _attachPeEditPlaces(idx); }, 150);
}

// 수정 폼 주소에 Google Places Autocomplete 연결
function _attachPeEditPlaces(idx) {
  if (!window.google || !google.maps || !google.maps.places) return;
  var addrFields = [
    { inputId: 'pe_addr_reg', zipId: 'pe_zip_reg', locSelId: 'pe_location' },
    { inputId: 'pe_addr_del', zipId: 'pe_zip_del', locSelId: null },
    { inputId: 'pe_addr_del2', zipId: null, locSelId: null },
    { inputId: 'pe_addr_del3', zipId: null, locSelId: null }
  ];
  addrFields.forEach(function(f) {
    var el = document.getElementById(f.inputId);
    if (!el || el._gPlacesAttached) return;
    el._gPlacesAttached = true;
    el.addEventListener('focus', function() { document.body.classList.add('places-input-active'); });
    el.addEventListener('blur', function() { setTimeout(function(){ document.body.classList.remove('places-input-active'); }, 300); });
    var ac = new google.maps.places.Autocomplete(el, {
      types: ['establishment', 'geocode'],
      componentRestrictions: { country: 'th' },
      fields: ['formatted_address', 'name', 'address_components']
    });
    ac.addListener('place_changed', function() {
      var place = ac.getPlace();
      if (!place) return;
      var addr = place.formatted_address || '';
      var name = place.name || '';
      var fullAddr = addr;
      if (name && addr && !addr.startsWith(name)) fullAddr = name + ', ' + addr;
      else if (!addr && name) fullAddr = name;
      el.value = fullAddr;
      if (place.address_components) {
        place.address_components.forEach(function(comp) {
          if (comp.types.indexOf('postal_code') !== -1 && f.zipId) {
            var zipEl = document.getElementById(f.zipId);
            if (zipEl) zipEl.value = comp.long_name;
          }
          if (comp.types.indexOf('administrative_area_level_1') !== -1 && f.locSelId) {
            var provRaw = comp.long_name || '';
            var provName = provRaw.replace(/^\s*จังหวัด\s*/, '').replace(/\s*Province$/i, '').trim();
            var provLower = provName.toLowerCase().replace(/[\s\-]/g, '');
            var locSel = document.getElementById(f.locSelId);
            if (locSel && typeof PROVINCES !== 'undefined') {
              var matched = PROVINCES.find(function(p) {
                var en = p[0].toLowerCase().replace(/[\s\-]/g, '');
                var th = p[1];
                if (en === provLower || th === provName) return true;
                if (provName.indexOf(th.replace(/ฯ$/, '')) === 0) return true;
                if (th.replace(/ฯ$/, '') && provRaw.indexOf(th.replace(/ฯ$/, '')) !== -1) return true;
                if (provLower.indexOf(en) !== -1 || en.indexOf(provLower) !== -1) return true;
                return false;
              });
              if (matched) locSel.value = matched[0];
            }
          }
        });
      }
    });
  });
}

// 수정 폼 첨부파일 핸들러
function _handlePeAttach(input) {
  var files = Array.from(input.files);
  var existCount = document.querySelectorAll('#peExistAttachList .reg-attach-file').length;
  var remaining = 5 - existCount - (window._peAttachFiles || []).length;
  files.slice(0, Math.max(0, remaining)).forEach(function(file) {
    if (file.size > 5 * 1024 * 1024) { showToast('⚠️ ' + file.name + ' 5MB 초과'); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
      window._peAttachFiles.push({ name: file.name, type: file.type, size: file.size, data: e.target.result.split(',')[1] });
      _renderPeNewAttach();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function _removePeNewAttach(idx) {
  window._peAttachFiles.splice(idx, 1);
  _renderPeNewAttach();
}

function _renderPeNewAttach() {
  var el = document.getElementById('peNewAttachList');
  if (!el) return;
  el.innerHTML = (window._peAttachFiles || []).map(function(f, i) {
    var sz = f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+'MB' : Math.round(f.size/1024)+'KB';
    var isImg = /^image\//i.test(f.type);
    var preview = isImg && f.data ? '<img src="data:' + f.type + ';base64,' + f.data + '" class="reg-attach-thumb" />' : '';
    return '<div class="reg-attach-file">' + preview +
      '<span class="fn">' + (isImg ? '🖼️' : '📄') + ' ' + escHtml(f.name) + ' <span style="color:#9ca3af">(' + sz + ')</span></span>' +
      '<button class="rm-btn" onclick="_removePeNewAttach(' + i + ')">✕</button></div>';
  }).join('');
}

function _pendEditField(id, label, val) {
  return '<div><label style="font-size:11px;color:#6b7280;">' + label + '</label><input id="' + id + '" value="' + escHtml(val) + '" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>';
}
function _pendEditFieldInner(id, label, val) {
  return '<label style="font-size:11px;color:#6b7280;">' + label + '</label><input id="' + id + '" value="' + escHtml(val) + '" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;box-sizing:border-box;">';
}

function cancelPendEdit(idx) {
  var card = document.getElementById('pendCard-' + idx);
  if (!card) return;
  var form = card.querySelector('.pend-edit-form');
  if (form) form.remove();
  var actions = card.querySelector('.pend-cust-actions');
  if (actions) actions.style.display = '';
}

async function savePendEdit(idx) {
  var c = _pendingCustomers[idx];
  if (!c || !c.id) return;

  // 남아있는 기존 첨부파일 수집
  var keepAtts = [];
  var existEls = document.querySelectorAll('#peExistAttachList .reg-attach-file');
  var origAtts = Array.isArray(c.attachments) ? c.attachments : [];
  existEls.forEach(function(el) {
    var idAttr = el.id || '';
    var m = idAttr.match(/peExistAtt(\d+)/);
    if (m) {
      var oi = parseInt(m[1]);
      if (origAtts[oi]) keepAtts.push(origAtts[oi]);
    }
  });

  // 새 첨부파일 업로드
  var newAtts = window._peAttachFiles || [];
  var uploadedAtts = [];
  if (newAtts.length > 0 && window._fbStorage) {
    for (var i = 0; i < newAtts.length; i++) {
      try {
        var att = newAtts[i];
        var path = 'customer-attachments/' + (c.id) + '_edit_' + Date.now() + '/' + (att.name || 'file_' + i);
        var ref = _fbStorage.ref(path);
        var blob = _base64ToBlob(att.data, att.type);
        await ref.put(blob);
        var url = await ref.getDownloadURL();
        uploadedAtts.push({ name: att.name, url: url });
      } catch(e) { console.error('[peAttUpload]', e); }
    }
  }

  var allAtts = keepAtts.concat(uploadedAtts);

  var updates = {
    name_th: (document.getElementById('pe_name_th').value || '').trim(),
    clinic: (document.getElementById('pe_clinic').value || '').trim(),
    type: document.getElementById('pe_type').value,
    sales: document.getElementById('pe_sales').value,
    tel: (document.getElementById('pe_tel').value || '').trim(),
    taxid: (document.getElementById('pe_taxid').value || '').trim(),
    location: document.getElementById('pe_location').value,
    addr_reg: (document.getElementById('pe_addr_reg').value || '').trim(),
    zip_reg: (document.getElementById('pe_zip_reg').value || '').trim(),
    addr_del: (document.getElementById('pe_addr_del').value || '').trim(),
    zip_del: (document.getElementById('pe_zip_del').value || '').trim(),
    addr_del2: (document.getElementById('pe_addr_del2').value || '').trim(),
    addr_del3: (document.getElementById('pe_addr_del3').value || '').trim(),
    remark: (document.getElementById('pe_remark').value || '').trim(),
    attachments: allAtts
  };
  updates.cust_name = updates.clinic || updates.name_th;

  try {
    await _fbDb.collection('pendingCustomers').doc(c.id).update(updates);
    Object.assign(c, updates);
    renderPendingCustomers();
    showToast('✅ ' + t('msg_saved'));
  } catch(e) {
    console.error('[pendEdit]', e);
    showToast('❌ ' + t('msg_error'));
  }
}

function _base64ToBlob(b64, type) {
  var binary = atob(b64);
  var arr = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: type || 'application/octet-stream' });
}

function updatePendCustBadge(count) {
  ['pendCustBadge', 'mobPendCustBadge', 'pendCustDDBadge', 'custBtnBadgeCust', 'mobCatCustBadge', 'mobRegCatCustBadge'].forEach(function(id) {
    var badge = document.getElementById(id);
    if (badge) {
      if (count > 0) { badge.textContent = count; badge.style.display = 'inline-block'; }
      else { badge.style.display = 'none'; }
    }
  });
}

var quoteCustomer = null;
var quoteItems    = [];
var _quoteAcIdx   = -1;
var _quoteAcData  = [];

function openQuoteForm() {
  quoteCustomer = null;
  quoteItems    = [];
  _qtAddSelectedItem = null;
  _qtCatFilter = 'all';
  document.getElementById('quoteCustInput').value = '';
  document.getElementById('quoteAcList').classList.remove('open');
  document.getElementById('quoteSelCard').classList.remove('show');
  document.getElementById('quoteNotes').value = '';
  document.getElementById('quoteBtnSubmit').disabled = false;
  _quoteAcIdx  = -1;
  _quoteAcData = [];
  renderQuoteItems();
  // 품목 입력 영역 초기화
  var qtSearch = document.getElementById('qtAddSearch');
  if (qtSearch) qtSearch.value = '';
  var qtQty = document.getElementById('qtAddQty');
  if (qtQty) qtQty.value = 1;
  var qtPrice = document.getElementById('qtAddPrice');
  if (qtPrice) qtPrice.value = '';
  // 합계 금액 및 계산 표시 초기화
  var totalDisp = document.getElementById('quoteTotalDisplay');
  if (totalDisp) totalDisp.textContent = '฿0';
  var reqTotal = document.getElementById('quoteRequestTotal');
  if (reqTotal) reqTotal.value = '';
  var discRate = document.getElementById('quoteDiscountRate');
  if (discRate) discRate.value = '';
  var discTotal = document.getElementById('quoteDiscountedTotal');
  if (discTotal) discTotal.textContent = '';
  window._quoteRawTotal = 0;
  var addTotal = document.getElementById('qtAddTotal');
  if (addTotal) addTotal.textContent = '₿0';
  var tabBtns = document.querySelectorAll('#qtCatTabs .qt-cat-tab');
  tabBtns.forEach(function(b,i){ b.classList.toggle('active', i === 0); });
  var btnPrev = document.getElementById('btnLoadPrevQt');
  if (btnPrev) btnPrev.style.display = 'none';
  document.getElementById('quoteCustWrap').style.display = '';
  var nameTh = document.getElementById('quoteSelNameTh');
  if (nameTh) nameTh.textContent = '';
  // 미등록 고객 폼 초기화
  var unregCheck = document.getElementById('qtUnregCheck');
  if (unregCheck) unregCheck.checked = false;
  var unregForm = document.getElementById('qtUnregForm');
  if (unregForm) unregForm.style.display = 'none';
  ['qt_unreg_type','qt_unreg_sales','qt_unreg_name','qt_unreg_clinic','qt_unreg_addr','qt_unreg_zip','qt_unreg_tel','qt_unreg_region'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  _qtUnregMode = false;

  _qtUpdateItemsLock();
  var _qOv = document.getElementById('quoteOverlay');
  _qOv.classList.add('open');
  _mobFullScreen(_qOv, _qOv.querySelector('.quote-modal'));
  _bringToFront(_qOv);
  // 모달 내부 스크롤을 최상단으로 리셋
  var _qBody = document.querySelector('#quoteModal .quote-body');
  if (_qBody) _qBody.scrollTop = 0;
  setTimeout(function(){ document.getElementById('quoteCustInput').focus(); }, 200);
  // 미등록 고객 지역 셀렉트 초기화
  _initQtUnregRegion();
}

var _qtUnregMode = false;

function toggleQtUnregCustomer() {
  var checked = document.getElementById('qtUnregCheck').checked;
  _qtUnregMode = checked;
  document.getElementById('qtUnregForm').style.display = checked ? 'block' : 'none';
  document.getElementById('quoteCustWrap').style.display = checked ? 'none' : '';
  document.getElementById('quoteSelCard').classList.remove('show');
  if (checked) {
    quoteCustomer = null;
    _initQtUnregRegion();
    // 영업 담당자 자동 선택 + 영업부서는 고정
    var user = getCurrentUser();
    var sel = document.getElementById('qt_unreg_sales');
    if (user && sel) {
      var _isAdm = _isAdmin(user);
      var nick = (user.nickname || '').toLowerCase();
      if (user.dept === 'Sales' && nick && !_isAdm) {
        var found = false;
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value.toLowerCase() === nick) { sel.value = sel.options[i].value; found = true; break; }
        }
        if (!found) {
          var opt = document.createElement('option');
          opt.value = user.nickname; opt.textContent = user.nickname;
          sel.appendChild(opt); sel.value = user.nickname;
        }
        sel.disabled = true; sel.style.opacity = '0.7';
      } else {
        sel.disabled = false; sel.style.opacity = '';
        // admin/office: 이름으로 자동 선택 (변경 가능)
        if (user.nickname) {
          for (var i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value.toLowerCase() === nick) { sel.selectedIndex = i; break; }
          }
        }
      }
    }
    // Google Places 자동완성 연결
    setTimeout(function() { _attachQtUnregPlaces(); }, 150);
  }
  _qtUpdateItemsLock();
}

function _initQtUnregRegion() {
  var sel = document.getElementById('qt_unreg_region');
  if (!sel || sel.options.length > 1) return;
  var regSel = document.getElementById('reg_location');
  if (regSel && regSel.options.length > 1) {
    sel.innerHTML = regSel.innerHTML;
  } else {
    sel.innerHTML = '<option value="">' + t('ql_select_ph') + '</option>';
    var regions = ['กรุงเทพมหานคร','ภาคกลาง','ภาคตะวันออก','ภาคตะวันตก','ภาคเหนือ','ภาคตะวันออกเฉียงเหนือ','ภาคใต้'];
    regions.forEach(function(r) { sel.innerHTML += '<option value="' + r + '">' + r + '</option>'; });
  }
}

function _attachQtUnregPlaces(retryCount) {
  if (!window.google || !google.maps || !google.maps.places) {
    var rc = retryCount || 0;
    if (rc < 20) setTimeout(function(){ _attachQtUnregPlaces(rc + 1); }, 300);
    return;
  }
  var inputEl = document.getElementById('qt_unreg_addr');
  if (!inputEl || inputEl._gPlacesAttached) return;
  inputEl._gPlacesAttached = true;
  inputEl.addEventListener('focus', function() { document.body.classList.add('places-input-active'); });
  inputEl.addEventListener('blur', function() { setTimeout(function(){ document.body.classList.remove('places-input-active'); }, 300); });
  var ac = new google.maps.places.Autocomplete(inputEl, {
    types: ['establishment', 'geocode'],
    componentRestrictions: { country: 'th' },
    fields: ['formatted_address', 'name', 'address_components', 'geometry']
  });
  ac.addListener('place_changed', function() {
    var place = ac.getPlace();
    if (!place) return;
    var addr = place.formatted_address || '';
    var name = place.name || '';
    if (!addr && !name) return;
    var fullAddr = addr;
    if (name && addr && !addr.startsWith(name)) fullAddr = name + ', ' + addr;
    else if (!addr && name) fullAddr = name;
    inputEl.value = fullAddr;
    if (place.address_components) {
      place.address_components.forEach(function(c) {
        // 우편번호
        if (c.types.indexOf('postal_code') !== -1) {
          var zipEl = document.getElementById('qt_unreg_zip');
          if (zipEl) zipEl.value = c.long_name;
        }
        // 지역 자동 매칭
        if (c.types.indexOf('administrative_area_level_1') !== -1) {
          var provRaw = c.long_name || '';
          var provName = provRaw.replace(/^\s*จังหวัด\s*/, '').replace(/\s*Province$/i, '').trim();
          var provLower = provName.toLowerCase().replace(/[\s\-]/g, '');
          var regSel = document.getElementById('qt_unreg_region');
          if (regSel) {
            var matched = PROVINCES.find(function(p) {
              var en = p[0].toLowerCase().replace(/[\s\-]/g, '');
              var th = p[1];
              if (en === provLower || th === provName) return true;
              if (provName.indexOf(th.replace(/ฯ$/, '')) === 0) return true;
              if (th.replace(/ฯ$/, '') && provRaw.indexOf(th.replace(/ฯ$/, '')) !== -1) return true;
              if (provLower.indexOf(en) !== -1 || en.indexOf(provLower) !== -1) return true;
              return false;
            });
            if (matched) regSel.value = matched[0];
          }
        }
      });
    }
  });
}

function _getQtUnregCustomer() {
  var name = (document.getElementById('qt_unreg_name').value || '').trim();
  var type = document.getElementById('qt_unreg_type').value;
  var sales = document.getElementById('qt_unreg_sales').value;
  var clinic = (document.getElementById('qt_unreg_clinic').value || '').trim();
  var addr = (document.getElementById('qt_unreg_addr').value || '').trim();
  var zip = (document.getElementById('qt_unreg_zip').value || '').trim();
  var tel = (document.getElementById('qt_unreg_tel').value || '').trim();
  var region = document.getElementById('qt_unreg_region').value;
  if (!name) { showToast(t('msg_enter_name') || '고객 이름을 입력하세요'); return null; }
  if (!type) { showToast(t('msg_select_type') || '고객 유형을 선택하세요'); return null; }
  if (!sales) { showToast(t('msg_select_sales') || '영업 담당자를 선택하세요'); return null; }
  if (!addr) { showToast(t('msg_enter_addr') || '주소를 입력하세요'); return null; }
  if (!region) { showToast(t('msg_select_region') || '지역을 선택하세요'); return null; }
  return {
    erp: 'UNREG',
    name: name,
    clinic: clinic,
    customer_type: type,
    sales: sales,
    address: zip ? addr + ' ' + zip : addr,
    tel: tel,
    region: region,
    is_unregistered: true
  };
}

function closeQuoteForm() {
  _closeBounce(document.getElementById('quoteOverlay'), 'open', function() {
    _resetModalPos(document.querySelector('.quote-modal'));
  });
  document.getElementById('quoteMini').classList.remove('show');
}
function minimizeQuoteForm() {
  document.getElementById('quoteOverlay').classList.remove('open');
  document.body.style.overflow = '';
  // 패키지 빌더가 열려있으면 같이 최소화 — 패키지 아이콘만 표시
  var pkgOpen = document.getElementById('pkgBuilder').classList.contains('open');
  var pkgMiniShown = document.getElementById('pkgMini').classList.contains('show');
  if (pkgOpen || pkgMiniShown) {
    if (pkgOpen) {
      document.getElementById('pkgBuilder').classList.remove('open');
      document.getElementById('pkgOverlay').classList.remove('open');
    }
    window._pkgParentMinimized = 'quote';
    document.getElementById('pkgMini').classList.add('show');
    document.getElementById('quoteMini').classList.remove('show');
  } else {
    document.getElementById('quoteMini').classList.add('show');
  }
  _repositionMinis();
}
function restoreQuoteForm() {
  document.getElementById('quoteMini').classList.remove('show');
  var _ov = document.getElementById('quoteOverlay');
  _ov.classList.add('open');
  _mobFullScreen(_ov, _ov.querySelector('.quote-modal'));
  _bringToFront(_ov);
  document.body.style.overflow = 'hidden';
  _repositionMinis();
}

function quoteOverlayClick(e) { /* X 버튼으로만 닫힘 */ }

function quoteCustAutocomplete() {
  var q = document.getElementById('quoteCustInput').value.trim().toLowerCase();
  var list = document.getElementById('quoteAcList');
  _quoteAcIdx = -1;
  if (!q) { list.classList.remove('open'); _quoteAcData = []; return; }
  if (!DATA || !DATA.length) {
    list.innerHTML = '<div class="quote-ac-item" style="color:#e74c3c;">⚠️ 고객 데이터 로드 중...</div>';
    list.classList.add('open'); return;
  }
  var qNoSpace = q.replace(/\s+/g, '');
  var qIsNum = /^\d+$/.test(q);
  // 영업 부서 사용자: 본인 담당 고객만 필터링 (관리자/Office는 전체)
  var _qtUser = getCurrentUser();
  var _qtIsAdmin = _isAdmin(_qtUser);
  var _qtIsOffice = _qtUser && _qtUser.dept === 'Office';
  var _qtIsSales = _qtUser && (_qtUser.dept || '').toLowerCase() === 'sales';
  function _isMyQtCust(d) {
    if (_qtIsAdmin || _qtIsOffice) return true;
    if (!_qtIsSales) return true;
    var s = (d.sales || '').trim().toUpperCase();
    if (!s) return false;
    if (_qtUser.empid && s.indexOf(_qtUser.empid.toUpperCase()) > -1) return true;
    if (_qtUser.name && s.toLowerCase() === _qtUser.name.toLowerCase()) return true;
    if (_qtUser.nickname && s.toLowerCase() === _qtUser.nickname.toLowerCase()) return true;
    return false;
  }
  _quoteAcData = DATA.filter(function(d) {
    if (!_isMyQtCust(d)) return false;
    var v = _acGetDisplayVals(d);
    var ntVal = d.nt_code || '';
    var combined = (v.erp + ' ' + ntVal + ' ' + (d.name_th||'') + ' ' + v.name + ' ' + v.clinic).toLowerCase().replace(/\s+/g,'');
    if (combined.includes(qNoSpace)) return true;
    // 숫자만 입력 시 NT 접두사 제거 후 매칭
    if (qIsNum && ntVal && ntVal.toLowerCase().replace(/^nt/i,'').includes(q)) return true;
    return false;
  }).slice(0, 10);
  if (!_quoteAcData.length) { list.classList.remove('open'); return; }
  list.innerHTML = _quoteAcData.map(function(d, i) {
    var v = _acGetDisplayVals(d);
    var ntTag = v.nt ? ' <span style="font-size:10px;color:#2563eb;background:#eff6ff;padding:1px 5px;border-radius:4px;">' + escHtml(v.nt) + '</span>' : '';
    var mainName = d.name_th || d.cust_name || v.name;
    var subName = d.name_en && d.name_en !== mainName ? d.name_en : (v.clinic !== mainName ? v.clinic : '');
    return '<div class="quote-ac-item" onmousedown="selectQuoteCustomer(' + i + ')">' +
      '<div class="qac-name">' + escHtml(v.erp !== '-' ? '[' + v.erp + '] ' : '') + escHtml(mainName) + ntTag + '</div>' +
      (subName ? '<div class="qac-sub">' + escHtml(subName) + '</div>' : '') +
      '</div>';
  }).join('');
  list.classList.add('open');
}

function quoteCustKeydown(e) {
  var list = document.getElementById('quoteAcList');
  var items = list.querySelectorAll('.quote-ac-item');
  if (!list.classList.contains('open') || !items.length) return;
  if (e.key === 'ArrowDown') { _quoteAcIdx = Math.min(_quoteAcIdx + 1, items.length - 1); _highlightQuoteAc(items); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { _quoteAcIdx = Math.max(_quoteAcIdx - 1, 0); _highlightQuoteAc(items); e.preventDefault(); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (_quoteAcIdx >= 0) { selectQuoteCustomer(_quoteAcIdx); }
    else if (_quoteAcData.length === 1) { selectQuoteCustomer(0); }
    else if (_quoteAcData.length > 1) { _quoteAcIdx = 0; _highlightQuoteAc(items); }
  }
  else if (e.key === 'Escape') { list.classList.remove('open'); _quoteAcIdx = -1; }
}

function _highlightQuoteAc(items) {
  items.forEach(function(el, i){ el.style.background = i === _quoteAcIdx ? '#ede9fe' : ''; });
  if (_quoteAcIdx >= 0 && items[_quoteAcIdx]) {
    items[_quoteAcIdx].scrollIntoView({ block: 'nearest' });
  }
}

var _pendingQuoteCust = null; // 확인 대기 중인 고객 데이터

function selectQuoteCustomer(idx) {
  var d = _quoteAcData[idx];
  if (!d) return;
  _pendingQuoteCust = d;
  document.getElementById('quoteCustInput').value = '';
  document.getElementById('quoteAcList').classList.remove('open');
  _showQuoteCustConfirm(d);
}

function _showQuoteCustConfirm(d) {
  var v = _acGetDisplayVals(d);
  var erp = v.erp !== '-' ? v.erp : '';
  function val(s) { return s ? escHtml(s) : '<span class="qc-empty">-</span>'; }
  var html = '<div class="qc-info-grid">' +
    '<div class="qc-lbl">ERP Code</div><div class="qc-val">' + val(erp) + '</div>' +
    '<div class="qc-lbl">' + t('qt_lbl_cust_th') + '</div><div class="qc-val">' + val(d.name_th) + '</div>' +
    '<div class="qc-lbl">' + t('qt_lbl_cust_en') + '</div><div class="qc-val">' + val(d.name_en || d.name_en2) + '</div>' +
    '<div class="qc-lbl">' + t('qt_lbl_clinic') + '</div><div class="qc-val">' + val(d.clinic || d.cust_name) + '</div>' +
    '</div><div class="qc-divider"></div><div class="qc-info-grid">' +
    '<div class="qc-lbl">Tax ID</div><div class="qc-val">' + (_displayTaxId(d.tax_id) || '<span class="qc-empty">-</span>') + '</div>' +
    '<div class="qc-lbl">' + t('qt_lbl_tel') + '</div><div class="qc-val">' + val(d.tel ? _formatPhone(d.tel) : '') + '</div>' +
    '<div class="qc-lbl">' + t('qt_lbl_addr') + '</div><div class="qc-val">' + val(d.address || d.delivery_address) + '</div>' +
    '<div class="qc-lbl">' + t('qt_lbl_region') + '</div><div class="qc-val">' + val(d.province || d.location) + '</div>' +
    '<div class="qc-lbl">' + t('qt_lbl_cust_type') + '</div><div class="qc-val">' + val(d.type || d.cust_type) + '</div>' +
    '<div class="qc-lbl">' + t('qt_lbl_sales') + '</div><div class="qc-val">' + val(_titleCase(d.sales)) + '</div>' +
    '</div>';
  document.getElementById('qcConfirmBody').innerHTML = html;
  document.getElementById('qcConfirmOverlay').classList.add('open');
  setTimeout(function() { document.addEventListener('keydown', _qcConfirmKeydown); }, 0);
}

function _qcConfirmKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); confirmQuoteCustomer(); }
  else if (e.key === 'Escape') { e.preventDefault(); cancelQuoteCustomerConfirm(); }
}

function confirmQuoteCustomer() {
  document.removeEventListener('keydown', _qcConfirmKeydown);
  var d = _pendingQuoteCust;
  if (!d) return;
  var v = _acGetDisplayVals(d);
  var nameEn = d.name_en || d['NAME_EN'] || v.name;
  var nameTh = d.name_th || d['NAME_TH'] || '';
  quoteCustomer = { erp: v.erp !== '-' ? v.erp : '', name: nameEn, nameTh: nameTh, clinic: v.clinic };
  document.getElementById('quoteSelErp').textContent    = quoteCustomer.erp ? '[' + quoteCustomer.erp + ']' : '';
  document.getElementById('quoteSelName').textContent   = nameEn;
  document.getElementById('quoteSelNameTh').textContent = nameTh;
  document.getElementById('quoteSelCard').classList.add('show');
  document.getElementById('quoteCustWrap').style.display = 'none';
  document.getElementById('qcConfirmOverlay').classList.remove('open');
  _pendingQuoteCust = null;
  _qtUpdateItemsLock();
  // 해당 고객의 이전 견적이 있으면 자동으로 팝업
  if (quoteCustomer.erp) {
    _checkAndShowPrevQuotes(quoteCustomer.erp);
  }
}

function _checkAndShowPrevQuotes(erp) {
  loadQuoteList(function() {
    var has = _quoteListCache.some(function(q) {
      return String(q.erp || q.customer_erp || '') === String(erp);
    });
    var btn = document.getElementById('btnLoadPrevQt');
    if (btn) btn.style.display = has ? 'inline-flex' : 'none';
  });
}

function cancelQuoteCustomerConfirm() {
  document.removeEventListener('keydown', _qcConfirmKeydown);
  document.getElementById('qcConfirmOverlay').classList.remove('open');
  _pendingQuoteCust = null;
  setTimeout(function(){ document.getElementById('quoteCustInput').focus(); }, 50);
}

function _qtUpdateItemsLock() {
  var sec = document.getElementById('qtItemsSection');
  if (!sec) return;
  if (quoteCustomer || _qtUnregMode) {
    sec.classList.remove('qt-items-locked');
  } else {
    sec.classList.add('qt-items-locked');
  }
}

function resetQuoteCustomer() {
  quoteCustomer = null;
  document.getElementById('quoteCustInput').value = '';
  document.getElementById('quoteSelCard').classList.remove('show');
  document.getElementById('quoteAcList').classList.remove('open');
  document.getElementById('quoteCustWrap').style.display = '';
  document.getElementById('quoteSelNameTh').textContent = '';
  var btnPrev = document.getElementById('btnLoadPrevQt');
  if (btnPrev) btnPrev.style.display = 'none';
  _qtUpdateItemsLock();
  setTimeout(function(){ document.getElementById('quoteCustInput').focus(); }, 50);
}

function renderQuoteItems() {
  var container = document.getElementById('quoteItemsBody');
  container.innerHTML = quoteItems.filter(function(it){ return it.name && it.name.trim(); }).length === 0
    ? ''
    : quoteItems.map(function(item, i) {
      if (!item.name || !item.name.trim()) return '';
      var qty = parseInt(item.qty) || 1;
      var price = parseFloat(item.price) || 0;
      var total = qty * price;
      var priceStr = price > 0 ? '฿' + price.toLocaleString() : '';
      var totalStr = total > 0 ? '฿' + total.toLocaleString() : '';
      return '<div class="qt-added-card">' +
        '<span class="qt-card-idx">#' + (i + 1) + '</span>' +
        '<div class="qt-card-info">' +
          '<div class="qt-card-model">' + escHtml(item.name) + '</div>' +
          '<div class="qt-card-spec">' + escHtml(item.spec || '') +
            (priceStr ? ' · ' + priceStr : '') +
            (totalStr ? ' = <strong style="color:#7c3aed">' + totalStr + '</strong>' : '') +
          '</div>' +
        '</div>' +
        '<div class="qt-card-qty">' +
          '<button onclick="changeQtItemQty(' + i + ',-1)">−</button>' +
          '<span>' + qty + '</span>' +
          '<button onclick="changeQtItemQty(' + i + ',1)">+</button>' +
        '</div>' +
        '<button class="qt-card-del" onclick="removeQuoteItem(' + i + ')">✕</button>' +
      '</div>';
    }).join('');
  updateQuoteTotal();
  // 아이템 추가 시 마지막 항목으로 자동 스크롤 (데스크톱만)
  if (window.innerWidth > 768) {
    setTimeout(function() {
      var last = container.lastElementChild;
      if (last) last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

var _quoteItemAcData = [];
var _quoteItemAcSelIdx = -1;

function _quoteItemAc(rowIdx, q) {
  var list = document.getElementById('qiac-' + rowIdx);
  if (!list) return;
  q = (q || '').trim().toLowerCase();
  if (!q) { list.classList.remove('open'); return; }

  var results = ITEM_DATA.filter(function(it) {
    if (it.no && it.no.startsWith('1KR')) return false;
    return _itemSearchMatch(it, q);
  }).sort(function(a, b) {
    var aTH = a.no && a.no.startsWith('1TH') ? 0 : 1;
    var bTH = b.no && b.no.startsWith('1TH') ? 0 : 1;
    return aTH - bTH;
  }).slice(0, 10);

  if (!results.length) { list.classList.remove('open'); return; }
  _quoteItemAcData = results;
  _quoteItemAcSelIdx = -1;

  list.innerHTML = results.map(function(it, idx) {
    return '<div class="q-item-ac-row" onmousedown="_pickQuoteItem(' + rowIdx + ',' + idx + ')">' +
      '<div><span class="qr-model">' + escHtml(it.model) + '</span><span class="qr-no">' + escHtml(it.no) + '</span></div>' +
      '<div class="qr-spec">' + escHtml(it.spec || it.name) + '</div>' +
    '</div>';
  }).join('');
  list.classList.add('open');
}

function _pickQuoteItem(rowIdx, idx) {
  var it = _quoteItemAcData[idx];
  if (!it) return;
  quoteItems[rowIdx].name = it.model;
  quoteItems[rowIdx].spec = it.spec || '';
  renderQuoteItems();
  // 포커스를 수량 칸으로 이동
  var rows = document.querySelectorAll('#quoteItemsBody tr');
  if (rows[rowIdx]) {
    var qtyInput = rows[rowIdx].querySelectorAll('input')[1];
    if (qtyInput) setTimeout(function(){ qtyInput.focus(); qtyInput.select(); }, 50);
  }
}

function _quoteItemAcKey(e, rowIdx) {
  var list = document.getElementById('qiac-' + rowIdx);
  if (!list || !list.classList.contains('open')) return;
  var rows = list.querySelectorAll('.q-item-ac-row');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _quoteItemAcSelIdx = Math.min(_quoteItemAcSelIdx + 1, rows.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _quoteItemAcSelIdx = Math.max(_quoteItemAcSelIdx - 1, 0);
  } else if (e.key === 'Enter' && _quoteItemAcSelIdx >= 0) {
    e.preventDefault();
    _pickQuoteItem(rowIdx, _quoteItemAcSelIdx);
    return;
  } else if (e.key === 'Escape') {
    list.classList.remove('open'); return;
  } else { return; }
  rows.forEach(function(r, i){ r.classList.toggle('ac-sel', i === _quoteItemAcSelIdx); });
}

function _quoteItemAcClose(rowIdx) {
  setTimeout(function() {
    var list = document.getElementById('qiac-' + rowIdx);
    if (list) list.classList.remove('open');
  }, 150);
}

var _qtAddSelectedItem = null;
var _qtCatFilter = 'all';
var _qtManualMode = false;

function toggleQtManualMode(btn) {
  _qtManualMode = !_qtManualMode;
  var searchInput = document.getElementById('qtAddSearch');
  var acList = document.getElementById('qtAddAcList');
  // 다른 탭 active 해제
  document.querySelectorAll('#qtCatTabs .qt-cat-tab').forEach(function(b) { b.classList.remove('active'); });
  if (_qtManualMode) {
    btn.classList.add('active');
    if (acList) acList.classList.remove('open');
    if (searchInput) {
      searchInput.value = '';
      searchInput.placeholder = t('qt_manual_ph');
      searchInput.focus();
    }
  } else {
    // 전체 탭으로 복귀
    _qtCatFilter = 'all';
    var allBtn = document.querySelector('#qtCatTabs .qt-cat-tab');
    if (allBtn) allBtn.classList.add('active');
    if (searchInput) {
      searchInput.value = '';
      searchInput.placeholder = t('qt_name_ph');
    }
  }
}

function addQuoteItem() {
  // 호환용 - addQuoteItemFromInput으로 대체
  addQuoteItemFromInput();
}

function addQuoteItemFromInput() {
  var searchInput = document.getElementById('qtAddSearch');
  var qtyInput = document.getElementById('qtAddQty');
  var priceInput = document.getElementById('qtAddPrice');

  if (_qtManualMode) {
    // 직접 입력 모드: 텍스트 그대로 모델명 사용
    var manualName = searchInput ? searchInput.value.trim() : '';
    if (!manualName) { if (searchInput) searchInput.focus(); return; }
    var qty = Math.max(1, Math.min(99999, parseInt(qtyInput.value) || 1));
    var price = Math.max(0, parseFloat(priceInput.value) || 0);
    var dupIdx = quoteItems.findIndex(function(it) { return it.name === manualName; });
    if (dupIdx !== -1) {
      quoteItems[dupIdx].qty = (parseInt(quoteItems[dupIdx].qty) || 1) + qty;
      if (price) quoteItems[dupIdx].price = price;
      showToast('⚠️ 동일 아이템 수량 추가: ' + manualName);
    } else {
      quoteItems.push({ name: manualName, spec: '', qty: qty, price: price });
    }
    renderQuoteItems();
    if (searchInput) { searchInput.value = ''; searchInput.focus({ preventScroll: true }); }
    if (qtyInput) qtyInput.value = 1;
    if (priceInput) priceInput.value = '';
    if (window.innerWidth <= 768) setTimeout(function(){ _qtScrollToItems(); }, 100);
    return;
  }

  if (!_qtAddSelectedItem) {
    if (searchInput) searchInput.focus({ preventScroll: true });
    return;
  }
  var qty = Math.max(1, Math.min(99999, parseInt(qtyInput.value) || 1));
  var pd = _getItemPrice(_qtAddSelectedItem);
  if (!pd.supply && !pd.retail && _pmPriceMap[_qtAddSelectedItem.model]) pd = _pmPriceMap[_qtAddSelectedItem.model];
  var _baseP = pd.supply || pd.retail || 0;
  var _vatP = parseFloat(pd.vat) || 0;
  var price = Math.max(0, parseFloat(priceInput.value) || (_baseP + _vatP) || _qtAddSelectedItem.price || 0);
  var _dupIdx = quoteItems.findIndex(function(it) { return it.name === _qtAddSelectedItem.model; });
  if (_dupIdx !== -1) {
    quoteItems[_dupIdx].qty = (parseInt(quoteItems[_dupIdx].qty) || 1) + qty;
    if (price) quoteItems[_dupIdx].price = price;
    showToast('⚠️ 동일 아이템 수량 추가: ' + _qtAddSelectedItem.model);
  } else {
    quoteItems.push({ name: _qtAddSelectedItem.model, spec: _qtAddSelectedItem.spec || '', qty: qty, price: price });
  }
  renderQuoteItems();
  // 입력 초기화
  _qtAddSelectedItem = null;
  if (searchInput) { searchInput.value = ''; searchInput.focus({ preventScroll: true }); }
  if (qtyInput) qtyInput.value = 1;
  if (priceInput) priceInput.value = '';
  if (window.innerWidth <= 768) setTimeout(function(){ _qtScrollToItems(); }, 100);
}

function removeQuoteItem(idx) {
  quoteItems.splice(idx, 1);
  renderQuoteItems();
}

function changeQtItemQty(idx, delta) {
  var item = quoteItems[idx];
  if (!item) return;
  var newQty = Math.max(1, (parseInt(item.qty) || 1) + delta);
  item.qty = newQty;
  renderQuoteItems();
}

function filterQtCat(cat, btn) {
  _qtCatFilter = cat;
  _qtManualMode = false;
  document.querySelectorAll('#qtCatTabs .qt-cat-tab').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  var searchInput = document.getElementById('qtAddSearch');
  if (searchInput) searchInput.placeholder = t('qt_name_ph');
  if (searchInput && searchInput.value.trim()) _qtAddAc(searchInput.value);
}

// ── 견적 카테고리 메가메뉴 ──
var _qtShipType = '일반';
function selectQtShipType(btn, type) {
  _qtShipType = type;
  var row = document.getElementById('qtShipTypeRow');
  if (row) row.querySelectorAll('.ship-type-btn').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');

  var pkgPicker = document.getElementById('qtPkgSetPicker');
  var catTree = document.getElementById('qtCatTree');
  var inputRow = document.querySelector('#qtItemsSection .qt-input-row');

  if (type === '패키지') {
    if (pkgPicker) pkgPicker.classList.add('open');
    if (catTree) catTree.style.display = 'none';
    if (inputRow) inputRow.style.display = 'none';
  } else if (type === 'CT') {
    if (pkgPicker) pkgPicker.classList.remove('open');
    if (catTree) catTree.style.display = 'none';
    if (inputRow) inputRow.style.display = '';
    // CT 카테고리 자동 선택
    _qtCatTreePath = ['CT'];
    _qtCatTreeFilter = { clsMatch: 'Pano' };
    _qtCatTreeFilters = null;
    var badge = document.getElementById('qtCatSelBadge');
    var badgeText = document.getElementById('qtCatSelText');
    if (badge) badge.style.display = '';
    if (badgeText) badgeText.textContent = '📂 CT';
    _closeQtCatMega();
  } else {
    // 일반
    if (pkgPicker) pkgPicker.classList.remove('open');
    if (catTree) catTree.style.display = '';
    if (inputRow) inputRow.style.display = '';
    // 카테고리 리셋
    qtCatTreeReset();
  }
}

function selectQtPkgSet(qty) {
  var pkgNode = null;
  if (typeof CAT_TREE !== 'undefined') {
    for (var i = 0; i < CAT_TREE.length; i++) {
      if (CAT_TREE[i].key === 'package') { pkgNode = CAT_TREE[i]; break; }
    }
  }
  var setKey = 's' + qty;
  var node = null;
  if (pkgNode) {
    for (var j = 0; j < pkgNode.children.length; j++) {
      if (pkgNode.children[j].key === setKey) { node = pkgNode.children[j]; break; }
    }
  }
  if (!node) {
    node = { key: setKey, label: qty + ' Sets', children: _buildPkgChildren(qty) };
  }
  _qtCatTreePath = ['package', setKey];
  _updateQtCatBadge();
  openPkgBuilder(node);
}

function selectQtPkgSetManual() {
  var v = parseInt(document.getElementById('qtPkgSetManualInput').value);
  if (!v || v < 1) { neoAlert('세트 수량을 입력해주세요.'); return; }
  var node = { key: 's' + v, label: v + ' Sets', children: _buildPkgChildren(v) };
  _qtCatTreePath = ['package', 's' + v];
  _updateQtCatBadge();
  openPkgBuilder(node);
}

var _qtCatTreePath = [];
var _qtCatTreeFilter = null;
var _qtCatTreeFilters = null;

function toggleQtCatMega() {
  var mega = document.getElementById('qtCatMega');
  var toggle = document.getElementById('qtCatToggle');
  if (mega.classList.contains('open')) {
    mega.classList.remove('open'); toggle.classList.remove('open');
  } else {
    _qtMobileCatStack = [];
    _qtCatTreePath = [];
    _renderQtCatLevel(1, CAT_TREE);
    mega.classList.add('open'); toggle.classList.add('open');
  }
}
function _closeQtCatMega() {
  document.getElementById('qtCatMega').classList.remove('open');
  document.getElementById('qtCatToggle').classList.remove('open');
}

function _isQtMobile() { return window.innerWidth <= 1024; }
var _qtMobileMode = _isQtMobile();
var _qtMobileCatStack = []; // 모바일 drill-down 스택 (Lv2 우측 패널용)
var _qtMobileSlideDir = 'in';
var _qtMobileActiveLv1 = ''; // 좌측 패널 활성 대분류 key

// ── 모바일: 2패널 (좌: 전체 트리 / 우: 하위 항목) ──
var _qtMobActiveSubKey = ''; // 좌측에서 선택된 하위 카테고리 key (예: 'single','package','Genoray')
var _qtMobActiveSubPath = []; // 좌측 선택 경로

function _renderMobileCatPanels() {
  var lv1 = document.getElementById('qtCatMegaLv1');
  var lv2 = document.getElementById('qtCatMegaLv2');
  // 좌측 패널: 전체 트리 구조 렌더링
  var html1 = '';
  CAT_TREE.forEach(function(topItem) {
    if (topItem.isManual) {
      // 기타 (직접 입력) - 바로 선택 가능
      html1 += '<div class="qt-mob-sub manual" onclick="_qtMobLeafClick([\'' + topItem.key + '\'])">' + topItem.label + '</div>';
      return;
    }
    // 대분류 헤더 (임플란트, CT - 선택 불가)
    html1 += '<div class="qt-mob-section">' + topItem.label + '</div>';
    // 하위 카테고리
    if (topItem.children) {
      topItem.children.forEach(function(sub) {
        var subPath = topItem.key + '/' + sub.key;
        var isOpen = _qtMobActiveSubKey === subPath;
        var cls = (sub.isManual ? ' manual' : '') + (isOpen ? ' open' : '');
        html1 += '<div class="qt-mob-sub' + cls + '" data-path="' + subPath + '" onclick="_qtMobSubClick(\'' + topItem.key + '\',\'' + sub.key + '\')">' + sub.label + '</div>';
      });
    }
  });
  lv1.innerHTML = html1;
  lv1.style.display = '';
  // 우측 패널 렌더링
  _renderMobileRightPanel();
}

function _qtMobSubClick(topKey, subKey) {
  var node = _getQtCatNode([topKey, subKey]);
  if (!node) return;
  // 직접 입력 (패키지 하위 직접 입력)
  if (node.isManual) {
    _qtCatTreePath = [topKey, subKey];
    qtCatMegaClick(2, subKey);
    return;
  }
  _qtMobActiveSubKey = topKey + '/' + subKey;
  _qtMobActiveSubPath = [topKey, subKey];
  _qtMobileCatStack = []; // 우측 드릴다운 초기화
  _qtCatTreePath = [topKey, subKey];
  _renderMobileCatPanels();
}

function _qtMobLeafClick(pathArr) {
  var node = _getQtCatNode(pathArr);
  if (!node) return;
  _qtCatTreePath = pathArr;
  qtCatMegaClick(pathArr.length, pathArr[pathArr.length - 1]);
}

function _renderMobileRightPanel() {
  var lv2 = document.getElementById('qtCatMegaLv2');
  if (!_qtMobActiveSubPath.length) {
    lv2.innerHTML = '<div style="padding:30px 16px;text-align:center;color:#9ca3af;font-size:13px;">' + t('ql_cat_select_msg') + '</div>';
    lv2.style.display = '';
    return;
  }
  // 현재 경로: 기본 경로 + 드릴다운 스택
  var fullPath = _qtMobActiveSubPath.concat(_qtMobileCatStack);
  var node = _getQtCatNode(fullPath);
  var items = node ? (node.children || []) : [];
  var html = '';
  // 뒤로가기 (우측 패널 드릴다운 시)
  if (_qtMobileCatStack.length > 0) {
    var parentPath = _qtMobActiveSubPath.concat(_qtMobileCatStack.slice(0, -1));
    var parentNode = _getQtCatNode(parentPath);
    var parentLabel = parentNode ? parentNode.label : '';
    html += '<div class="qt-cat-sub-back" onclick="_qtMobRightBack()">← ' + parentLabel + '</div>';
  }
  // 항목 렌더링
  items.forEach(function(item) {
    var hasChild = item.children && item.children.length;
    var isPkgSet = hasChild && item.children[0] && item.children[0].filter && item.children[0].filter.pkg;
    var cls = item.isManual ? ' manual' : '';
    var arrow = (hasChild && !isPkgSet) ? '<span class="arrow-r" style="opacity:.4">›</span>' : '';
    html += '<div class="qt-cat-mega-item' + cls + '" data-key="' + item.key + '" onclick="_qtMobRightClick(\'' + item.key + '\')">' + item.label + arrow + '</div>';
  });
  if (!items.length) {
    html += '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">항목이 없습니다</div>';
  }
  lv2.innerHTML = html;
  lv2.style.display = '';
  lv2.classList.remove('qt-cat-slide-in');
  void lv2.offsetWidth;
  lv2.classList.add('qt-cat-slide-in');
}

function _qtMobRightClick(key) {
  var fullPath = _qtMobActiveSubPath.concat(_qtMobileCatStack, [key]);
  var node = _getQtCatNode(fullPath);
  if (!node) return;
  // 직접 입력
  if (node.isManual) {
    _qtCatTreePath = fullPath;
    qtCatMegaClick(fullPath.length, key);
    return;
  }
  // 패키지 세트 → 패키지 빌더
  if (fullPath.indexOf('package') !== -1 && node.children && node.children.length && node.children[0].filter) {
    _qtCatTreePath = fullPath;
    _closeQtCatMega();
    _qtMobileCatStack = [];
    _updateQtCatBadge();
    _pkgBuilderMode = 'quote';
    openPkgBuilder(node);
    return;
  }
  // 하위가 있으면 우측 패널 drill-down
  if (node.children && node.children.length) {
    _qtMobileCatStack.push(key);
    _qtCatTreePath = fullPath;
    _renderMobileRightPanel();
    return;
  }
  // 단일 필터 (leaf)
  if (node.filter) {
    _qtCatTreePath = fullPath;
    qtCatMegaClick(fullPath.length, key);
    return;
  }
}

function _qtMobRightBack() {
  if (_qtMobileCatStack.length === 0) return;
  _qtMobileCatStack.pop();
  _qtCatTreePath = _qtMobActiveSubPath.concat(_qtMobileCatStack);
  _renderMobileRightPanel();
}

// ── 공통 렌더 함수 (데스크탑 전용으로 단순화) ──
function _renderQtCatLevel(lv, items) {
  var col = document.getElementById('qtCatMegaLv' + lv);
  if (!col) {
    // 동적으로 컬럼 생성
    col = document.createElement('div');
    col.className = 'qt-cat-mega-lv';
    col.id = 'qtCatMegaLv' + lv;
    document.getElementById('qtCatMega').appendChild(col);
  }
  // 멀티컬럼 렌더링 (데스크탑/모바일 공통)
  var html = '';
  items.forEach(function(item) {
    var hasChild = item.children && item.children.length;
    var isPkgSet = hasChild && item.children[0] && item.children[0].filter && item.children[0].filter.pkg;
    var cls = item.isManual ? ' manual' : '';
    var arrow = (hasChild && !isPkgSet) ? '<span class="arrow-r">›</span>' : '';
    html += '<div class="qt-cat-mega-item' + cls + '" data-key="' + item.key + '" onmouseenter="qtCatMegaHover(' + lv + ',this,\'' + item.key + '\')" onclick="qtCatMegaClick(' + lv + ',\'' + item.key + '\')">' + item.label + arrow + '</div>';
  });
  col.innerHTML = html;
  col.style.display = '';
  for (var l = lv + 1; l <= 6; l++) {
    var c = document.getElementById('qtCatMegaLv' + l);
    if (c) { c.innerHTML = ''; c.style.display = 'none'; }
  }
}

function _qtMobileCatBack() {
  _qtMobRightBack();
}

function qtCatMegaHover(lv, el, key) {
  var col = document.getElementById('qtCatMegaLv' + lv);
  col.querySelectorAll('.qt-cat-mega-item').forEach(function(it) { it.classList.remove('active'); });
  el.classList.add('active');
  _qtCatTreePath = _qtCatTreePath.slice(0, lv - 1);
  _qtCatTreePath.push(key);
  for (var l = lv + 1; l <= 6; l++) {
    var c = document.getElementById('qtCatMegaLv' + l);
    if (c) { c.innerHTML = ''; c.style.display = 'none'; }
  }
  var node = _getQtCatNode(_qtCatTreePath);
  if (node && node.children && node.children.length) {
    // 패키지 세트 하위는 견적에서 직접 렌더
    var isPkgSet = _qtCatTreePath.indexOf('package') !== -1 && node.children[0] && node.children[0].filter;
    if (!isPkgSet) {
      var renderChildren = node.children;
      // filter+children 노드 → "전체" 항목 추가 (주문 카테고리와 동일)
      if (node.filter) {
        var allLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
        var allCount = ITEM_DATA.filter(function(i) { return _matchTreeFilter(i, node.filter); }).length;
        var allItem = { key: node.key + '_ALL', label: '📋 ' + allLabel + ' ' + t('cat_all') + ' (' + allCount + ')', filter: Object.assign({}, node.filter) };
        renderChildren = [allItem].concat(node.children);
      }
      _renderQtCatLevel(lv + 1, renderChildren);
    }
  }
  // 말단 필터 노드 → 아이템 리스트 표시
  if (node && node.filter && (!node.children || !node.children.length)) {
    if (window.innerWidth <= 1024) {
      // 모바일: 슬라이드 오버레이로 표시
      var displayLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
      openMobItemSlide(displayLabel, node.filter, 'quote');
    } else {
      _renderQtMegaItemList(lv + 1, node);
    }
  }
}

function _renderQtMegaItemList(lv, node) {
  var col = document.getElementById('qtCatMegaLv' + lv);
  if (!col) {
    col = document.createElement('div');
    col.className = 'qt-cat-mega-lv qt-cat-mega-items';
    col.id = 'qtCatMegaLv' + lv;
    document.getElementById('qtCatMega').appendChild(col);
  }
  col.classList.add('qt-cat-mega-items');
  var items = ITEM_DATA.filter(function(i) { return _matchTreeFilter(i, node.filter); });
  items.sort(function(a, b) { return (a.model || '').localeCompare(b.model || ''); });
  var displayLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
  window._qtCmiItems = items;
  var html = '<div class="cmi-title">' + displayLabel + ' — ' + items.length + '</div>';
  html += '<div class="cmi-search-wrap"><input type="text" class="cmi-search" placeholder="🔍 Search..." onclick="event.stopPropagation()" oninput="event.stopPropagation();_qtCmiFilterItems(this.value)"></div>';
  html += '<div id="qtCmiItemsBody">';
  html += _buildQtCmiRows(items);
  html += '</div>';
  col.innerHTML = html;
  col.style.display = '';
  for (var l = lv + 1; l <= 6; l++) {
    var c = document.getElementById('qtCatMegaLv' + l);
    if (c) { c.innerHTML = ''; c.style.display = 'none'; }
  }
}

function _buildQtCmiRows(items) {
  var html = '';
  items.forEach(function(it) {
    var gIdx = ITEM_DATA.indexOf(it);
    var isAdded = quoteItems.some(function(o) { return o.name === it.model; });
    html += '<div class="cmi-row" id="qtcmi_' + gIdx + '">';
    html += '<div class="cmi-info"><div class="cmi-model">' + (it.model || '') + '</div>';
    html += '<div class="cmi-spec">' + (it.spec || it.name || '') + '</div></div>';
    html += '<div class="cmi-qty-wrap">' +
      '<button class="cmi-qty-btn" onclick="event.stopPropagation();_qtCmiQtyChange(' + gIdx + ',-1)">−</button>' +
      '<input type="number" class="cmi-qty-val" id="qtcmiq_' + gIdx + '" value="1" min="1" onclick="event.stopPropagation()" onchange="event.stopPropagation()">' +
      '<button class="cmi-qty-btn" onclick="event.stopPropagation();_qtCmiQtyChange(' + gIdx + ',1)">+</button>' +
    '</div>';
    if (isAdded) {
      html += '<span class="cmi-added">✓</span>';
    } else {
      html += '<button class="cmi-add" onclick="event.stopPropagation();_qtCatMegaAddItem(' + gIdx + ')">ADD</button>';
    }
    html += '</div>';
  });
  return html;
}

function _qtCatMegaAddItem(globalIdx) {
  var item = ITEM_DATA[globalIdx];
  if (!item) return;
  var qtyInput = document.getElementById('qtcmiq_' + globalIdx);
  var qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
  if (qty < 1) qty = 1;
  var dupIdx = quoteItems.findIndex(function(o) { return o.name === item.model; });
  if (dupIdx !== -1) {
    quoteItems[dupIdx].qty = (parseInt(quoteItems[dupIdx].qty) || 1) + qty;
    showToast('⚠️ 동일 아이템 수량 추가: ' + item.model);
  } else {
    var pd = _pmPriceMap[item.model] || {};
    var price = pd.supply || pd.retail || item.price || 0;
    var vat = parseFloat(pd.vat) || 0;
    quoteItems.push({ name: item.model, spec: item.spec || '', qty: qty, price: price + vat });
  }
  renderQuoteItems();
  showToast((item.model || '') + ' ✓');
  var row = document.getElementById('qtcmi_' + globalIdx);
  if (row) {
    var btn = row.querySelector('.cmi-add');
    if (btn) {
      var span = document.createElement('span');
      span.className = 'cmi-added';
      span.textContent = '✓';
      btn.replaceWith(span);
    }
  }
}

function _qtCmiFilterItems(query) {
  var q = (query || '').trim().toUpperCase();
  var body = document.getElementById('qtCmiItemsBody');
  if (!body || !window._qtCmiItems) return;
  var filtered = window._qtCmiItems;
  if (q) {
    filtered = filtered.filter(function(it) {
      return ((it.model || '').toUpperCase().indexOf(q) > -1) || ((it.spec || it.name || '').toUpperCase().indexOf(q) > -1);
    });
  }
  body.innerHTML = _buildQtCmiRows(filtered);
}

function _qtCmiQtyChange(gIdx, delta) {
  var inp = document.getElementById('qtcmiq_' + gIdx);
  if (!inp) return;
  var v = parseInt(inp.value) || 1;
  v += delta;
  if (v < 1) v = 1;
  inp.value = v;
}

function qtCatMegaClick(lv, key) {
  _qtCatTreePath = _qtCatTreePath.slice(0, lv - 1);
  _qtCatTreePath.push(key);
  var node = _getQtCatNode(_qtCatTreePath);
  if (!node) return;
  // 직접 입력 모드
  if (node.isManual) {
    _qtManualMode = true;
    _qtCatFilter = '_MANUAL_';
    _qtCatTreeFilter = null;
    _qtCatTreeFilters = null;
    _updateQtCatBadge();
    _closeQtCatMega();
    _qtMobileCatStack = [];
    var si = document.getElementById('qtAddSearch');
    if (si) { si.value = ''; si.placeholder = t('qt_manual_ph'); si.focus(); }
    return;
  }
  // 패키지 세트 선택 → 패키지 빌더 열기 (모바일/데스크탑 공통, drill-down보다 우선)
  if (_qtCatTreePath.indexOf('package') !== -1 && node.children && node.children.length && node.children[0].filter) {
    _closeQtCatMega();
    _qtMobileCatStack = [];
    _updateQtCatBadge();
    _pkgBuilderMode = 'quote';
    openPkgBuilder(node);
    return;
  }
  // 모바일: 하위가 있으면 터치로 하위 컬럼 펼침 (hover 대체)
  if (window.innerWidth <= 1024 && node.children && node.children.length) {
    var isPkgSet = _qtCatTreePath.indexOf('package') !== -1 && node.children[0] && node.children[0].filter;
    if (!isPkgSet) {
      var col = document.getElementById('qtCatMegaLv' + lv);
      if (col) {
        col.querySelectorAll('.qt-cat-mega-item').forEach(function(it) { it.classList.remove('active'); });
        var el = col.querySelector('[data-key="' + key + '"]');
        if (el) el.classList.add('active');
      }
      for (var l = lv + 1; l <= 6; l++) {
        var c = document.getElementById('qtCatMegaLv' + l);
        if (c) { c.innerHTML = ''; c.style.display = 'none'; }
      }
      var renderChildren = node.children;
      if (node.filter) {
        var allLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
        var allCount = ITEM_DATA.filter(function(i) { return _matchTreeFilter(i, node.filter); }).length;
        var allItem = { key: node.key + '_ALL', label: '📋 ' + allLabel + ' ' + t('cat_all') + ' (' + allCount + ')', filter: Object.assign({}, node.filter) };
        renderChildren = [allItem].concat(node.children);
      }
      _renderQtCatLevel(lv + 1, renderChildren);
      return;
    }
  }
  // 모바일: 말단 필터 → 슬라이드 오버레이
  if (window.innerWidth <= 1024 && node.filter && (!node.children || !node.children.length)) {
    var displayLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
    openMobItemSlide(displayLabel, node.filter, 'quote');
    return;
  }
  // 단일 필터 (데스크탑)
  if (node.filter) {
    _qtManualMode = false;
    _qtCatTreeFilter = node.filter;
    _qtCatTreeFilters = null;
    _qtCatFilter = '_TREE_';
    _updateQtCatBadge();
    _closeQtCatMega();
    _qtMobileCatStack = [];
    var si = document.getElementById('qtAddSearch');
    if (si) { si.value = ''; si.placeholder = t('qt_name_ph'); si.focus(); }
    return;
  }

  // 하위에 children이 있으면 멀티필터 (데스크탑)
  if (node.children && node.children.length) {
    var filters = [];
    _collectQtFilters(node, filters);
    if (filters.length) {
      _qtManualMode = false;
      _qtCatTreeFilter = null;
      _qtCatTreeFilters = filters;
      _qtCatFilter = '_TREE_MULTI_';
      _updateQtCatBadge();
      _closeQtCatMega();
      var si = document.getElementById('qtAddSearch');
      if (si) { si.value = ''; si.placeholder = t('qt_name_ph'); si.focus(); }
    }
  }
}

function _getQtCatNode(path) {
  var items = CAT_TREE; var node = null;
  for (var i = 0; i < path.length; i++) {
    var pk = path[i];
    // _ALL 키 처리: 부모 노드의 filter를 가진 가상 노드 반환
    if (pk.endsWith('_ALL') && node && node.filter) {
      var allLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
      return { key: pk, label: '📋 ' + allLabel + ' ' + t('cat_all'), filter: Object.assign({}, node.filter) };
    }
    node = items.find(function(it) { return it.key === pk; });
    if (!node) return null;
    items = node.children || [];
  }
  return node;
}

function _collectQtFilters(node, arr) {
  if (node.filter) arr.push(node.filter);
  if (node.children) node.children.forEach(function(c) { _collectQtFilters(c, arr); });
}

function _updateQtCatBadge() {
  var badge = document.getElementById('qtCatSelBadge');
  var text = document.getElementById('qtCatSelText');
  if (!_qtCatTreePath.length) { badge.style.display = 'none'; return; }
  var labels = []; var items = CAT_TREE;
  for (var i = 0; i < _qtCatTreePath.length; i++) {
    var n = items.find(function(it) { return it.key === _qtCatTreePath[i]; });
    if (!n) break; labels.push(n.label); items = n.children || [];
  }
  text.textContent = labels.join(' › ');
  badge.style.display = 'inline-flex';
}

function reopenQtPkgBuilder() {
  // 패키지 경로인 경우만 빌더 재오픈
  if (_qtCatTreePath.indexOf('package') === -1) return;
  var node = _getQtCatNode(_qtCatTreePath);
  if (!node || !node.children || !node.children.length) return;
  _pkgBuilderMode = 'quote';
  openPkgBuilder(node);
}

function qtCatTreeReset() {
  _qtCatTreePath = [];
  _qtCatFilter = 'all';
  _qtManualMode = false;
  _qtCatTreeFilter = null;
  _qtCatTreeFilters = null;
  document.getElementById('qtCatSelBadge').style.display = 'none';
  var si = document.getElementById('qtAddSearch');
  if (si) { si.value = ''; si.placeholder = t('qt_name_ph'); }
}

function _qtScrollToItems() {
  if (window.innerWidth > 768) return;
  var sec = document.getElementById('qtItemsSection');
  if (!sec) return;
  setTimeout(function() {
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

// 안드로이드 전용: 견적 품목 검색 input 포커스 시
//  - 고객 카드 및 상단 섹션 숨기고 검색창을 최상단에 고정
//  - 블러 시 원복 (자동완성 클릭 시 사라지지 않도록 지연)
function _qtAddSearchFocus() {
  _qtScrollToItems();
  if (!document.documentElement.classList.contains('is-android')) return;
  if (window.innerWidth > 1024) return;
  var body = document.querySelector('.quote-body');
  if (body) body.classList.add('qt-item-searching');
}
function _qtAddSearchBlur() {
  setTimeout(function() {
    var body = document.querySelector('.quote-body');
    if (body) body.classList.remove('qt-item-searching');
    _qtAddAcClose();
  }, 180);
}

function _qtAddAc(q) {
  var list = document.getElementById('qtAddAcList');
  if (!list) return;
  if (_qtManualMode) { list.classList.remove('open'); return; }
  q = (q || '').trim().toLowerCase();
  if (!q) { list.classList.remove('open'); _qtAddSelectedItem = null; return; }

  var results = ITEM_DATA.filter(function(it) {
    if (it.no && it.no.startsWith('1KR')) return false;
    // 카테고리 필터 (메가메뉴 트리)
    if (_qtCatFilter === '_TREE_' && _qtCatTreeFilter) {
      if (!_matchTreeFilter(it, _qtCatTreeFilter)) return false;
    } else if (_qtCatFilter === '_TREE_MULTI_' && _qtCatTreeFilters) {
      var matchAny = _qtCatTreeFilters.some(function(f) { return _matchTreeFilter(it, f); });
      if (!matchAny) return false;
    } else if (_qtCatFilter === '_MANUAL_') {
      // manual mode - no filter
    } else if (_qtCatFilter !== 'all') {
      if (it.cat !== _qtCatFilter) return false;
    }
    return _itemSearchMatch(it, q);
  }).sort(function(a, b) {
    var aTH = a.no && a.no.startsWith('1TH') ? 0 : 1;
    var bTH = b.no && b.no.startsWith('1TH') ? 0 : 1;
    return aTH - bTH;
  }).slice(0, 10);

  if (!results.length) { list.classList.remove('open'); return; }
  _quoteItemAcData = results;
  _quoteItemAcSelIdx = -1;

  list.innerHTML = results.map(function(it, idx) {
    return '<div class="q-item-ac-row" onmousedown="_qtAddPick(' + idx + ')">' +
      '<div><span class="qr-model">' + escHtml(it.model) + '</span><span class="qr-no">' + escHtml(it.no) + '</span></div>' +
      '<div class="qr-spec">' + escHtml(it.spec || it.name) + '</div>' +
    '</div>';
  }).join('');
  list.classList.add('open');
}

function _qtAddPick(idx) {
  var it = _quoteItemAcData[idx];
  if (!it) return;
  _qtAddSelectedItem = it;
  var searchInput = document.getElementById('qtAddSearch');
  if (searchInput) searchInput.value = it.model + (it.spec ? ' ' + it.spec : '');
  var list = document.getElementById('qtAddAcList');
  if (list) list.classList.remove('open');
  // 설정 가격 자동 입력
  var priceInput = document.getElementById('qtAddPrice');
  if (priceInput) {
    var pd = _getItemPrice(it);
    // model 직접 매칭 fallback
    if (!pd.supply && !pd.retail && _pmPriceMap[it.model]) pd = _pmPriceMap[it.model];
    var basePrice = pd.supply || pd.retail || 0;
    var vatAmt = parseFloat(pd.vat) || 0;
    var defPrice = basePrice + vatAmt;
    if (defPrice > 0) {
      priceInput.value = defPrice;
    } else {
      priceInput.value = '';
      console.log('[QuotePrice] No price found for:', it.model, it.no, '| priceMap size:', Object.keys(_pmPriceMap).length);
    }
    _qtUpdateInputTotal();
  }
  var qtyInput = document.getElementById('qtAddQty');
  if (qtyInput) {
    qtyInput.focus({ preventScroll: true });
    if (window.innerWidth <= 768) {
      setTimeout(function() { _qtScrollToItems(); }, 50);
    }
  }
}

function _qtAddAcKey(e) {
  var list = document.getElementById('qtAddAcList');
  if (!list || !list.classList.contains('open')) {
    if (e.key === 'Enter' && _qtAddSelectedItem) {
      e.preventDefault();
      var qtyInput = document.getElementById('qtAddQty');
      if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
    }
    return;
  }
  var rows = list.querySelectorAll('.q-item-ac-row');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _quoteItemAcSelIdx = Math.min(_quoteItemAcSelIdx + 1, rows.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _quoteItemAcSelIdx = Math.max(_quoteItemAcSelIdx - 1, 0);
  } else if (e.key === 'Enter' && _quoteItemAcSelIdx >= 0) {
    e.preventDefault();
    _qtAddPick(_quoteItemAcSelIdx);
    return;
  } else if (e.key === 'Escape') {
    list.classList.remove('open'); return;
  } else { return; }
  rows.forEach(function(r, i){ r.classList.toggle('ac-sel', i === _quoteItemAcSelIdx); });
  if (rows[_quoteItemAcSelIdx]) rows[_quoteItemAcSelIdx].scrollIntoView({ block: 'nearest' });
}

function _qtUpdateInputTotal() {
  var qty = parseInt(document.getElementById('qtAddQty').value) || 0;
  var price = parseFloat(document.getElementById('qtAddPrice').value) || 0;
  var total = qty * price;
  var el = document.getElementById('qtAddTotal');
  if (el) el.textContent = total > 0 ? '₿' + total.toLocaleString() : '₿0';
}

function _qtAddAcClose() {
  setTimeout(function() {
    var list = document.getElementById('qtAddAcList');
    if (list) list.classList.remove('open');
  }, 150);
}

function updateQuoteTotal() {
  var total = quoteItems.reduce(function(s, it) {
    return s + (parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0);
  }, 0);
  window._quoteRawTotal = total;
  var el = document.getElementById('quoteTotalDisplay');
  if (el) el.textContent = '฿' + total.toLocaleString();
  // 할인율 적용
  applyQuoteDiscount();
}

function applyQuoteDiscount() {
  var rateEl = document.getElementById('quoteDiscountRate');
  var discEl = document.getElementById('quoteDiscountedTotal');
  var rowEl = document.getElementById('quoteDiscountedRow');
  var discAmtEl = document.getElementById('quoteDiscountAmount');
  var reqEl = document.getElementById('quoteRequestTotal');
  if (!rateEl || !discEl) return;
  var reqAmt = Math.max(0, parseFloat(reqEl ? reqEl.value : 0) || 0);
  var rawTotal = window._quoteRawTotal || 0;
  var rate = Math.max(0, Math.min(100, parseFloat(rateEl.value) || 0));

  // 할인율이 입력된 경우: 요청금액(또는 합계) 기준으로 할인 계산
  var baseAmt = reqAmt > 0 ? reqAmt : rawTotal;
  if (rate > 0 && rate <= 100 && baseAmt > 0) {
    var basis = document.querySelector('input[name="qtFinalBasis"]:checked');
    var basisVal = basis ? basis.value : 'before';
    var discountedPrice, discountAmt;
    if (basisVal === 'before') {
      discountedPrice = Math.round(baseAmt / (1 - rate / 100));
      discountAmt = discountedPrice - baseAmt;
      discEl.textContent = '฿' + discountedPrice.toLocaleString();
      discEl.style.color = '#7c3aed';
    } else {
      discountedPrice = Math.round(baseAmt * (1 - rate / 100));
      discountAmt = baseAmt - discountedPrice;
      discEl.textContent = '฿' + discountedPrice.toLocaleString();
      discEl.style.color = '#dc2626';
    }
    if (discAmtEl) discAmtEl.textContent = '-฿' + discountAmt.toLocaleString();
    if (rowEl) rowEl.style.display = 'block';
    return;
  }

  // 요청 금액만 입력된 경우 (할인율 없음): 요청 금액 표시
  if (reqAmt > 0 && rawTotal > 0 && reqAmt !== rawTotal) {
    var diff = rawTotal - reqAmt;
    if (discAmtEl) discAmtEl.textContent = (diff > 0 ? '-' : '+') + '฿' + Math.abs(diff).toLocaleString();
    discEl.textContent = '฿' + reqAmt.toLocaleString();
    discEl.style.color = reqAmt < rawTotal ? '#dc2626' : '#7c3aed';
    if (rowEl) rowEl.style.display = 'block';
    return;
  }

  // 아무것도 입력되지 않은 경우
  discEl.textContent = '';
  if (discAmtEl) discAmtEl.textContent = '';
  if (rowEl) rowEl.style.display = 'none';
}

// ── 주문 할인 계산 (요청 금액과 할인율 독립 동작) ──
function applyOrderDiscount() {
  var rateEl = document.getElementById('orderDiscountRate');
  var discEl = document.getElementById('orderDiscountedTotal');
  var rowEl = document.getElementById('orderDiscountedRow');
  var discAmtEl = document.getElementById('orderDiscountAmount');
  var reqEl = document.getElementById('orderRequestTotal');
  if (!rateEl || !discEl) return;
  var reqAmt = Math.max(0, parseFloat(reqEl ? reqEl.value : 0) || 0);
  var rawTotal = window._orderRawTotal || 0;
  var rate = Math.max(0, Math.min(100, parseFloat(rateEl.value) || 0));

  // 값 저장 (재렌더링 시 유지)
  window._orderRequestTotal = reqEl ? reqEl.value : '';
  window._orderDiscountRate = rateEl ? rateEl.value : '';

  // 할인율이 입력된 경우: 합계(또는 요청금액) 기준으로 할인 계산
  var baseAmt = reqAmt > 0 ? reqAmt : rawTotal;
  if (rate > 0 && rate <= 100 && baseAmt > 0) {
    var basis = document.querySelector('input[name="oiFinalBasis"]:checked');
    var basisVal = basis ? basis.value : 'before';
    var discountedPrice, discountAmt;
    if (basisVal === 'before') {
      discountedPrice = Math.round(baseAmt / (1 - rate / 100));
      discountAmt = discountedPrice - baseAmt;
      discEl.textContent = '฿' + discountedPrice.toLocaleString();
      discEl.style.color = '#7c3aed';
    } else {
      discountedPrice = Math.round(baseAmt * (1 - rate / 100));
      discountAmt = baseAmt - discountedPrice;
      discEl.textContent = '฿' + discountedPrice.toLocaleString();
      discEl.style.color = '#dc2626';
    }
    if (discAmtEl) discAmtEl.textContent = '-฿' + discountAmt.toLocaleString();
    if (rowEl) rowEl.style.display = 'block';
    return;
  }

  // 요청 금액만 입력된 경우 (할인율 없음): 요청 금액 표시
  if (reqAmt > 0 && rawTotal > 0 && reqAmt !== rawTotal) {
    var diff = rawTotal - reqAmt;
    if (discAmtEl) discAmtEl.textContent = (diff > 0 ? '-' : '+') + '฿' + Math.abs(diff).toLocaleString();
    discEl.textContent = '฿' + reqAmt.toLocaleString();
    discEl.style.color = reqAmt < rawTotal ? '#dc2626' : '#7c3aed';
    if (rowEl) rowEl.style.display = 'block';
    return;
  }

  // 아무것도 입력되지 않은 경우
  discEl.textContent = '';
  if (discAmtEl) discAmtEl.textContent = '';
  if (rowEl) rowEl.style.display = 'none';
}

function submitQuoteRequest(confirmed) {
  if (_qtUnregMode) {
    var unregCust = _getQtUnregCustomer();
    if (!unregCust) return;
    quoteCustomer = unregCust;
  }
  if (!quoteCustomer) { showToast(t('msg_select_cust')); return; }
  var validItems = quoteItems.filter(function(it){ return it.name && it.name.trim(); });
  if (!validItems.length) { showToast(t('msg_min_item')); return; }
  // 제출 전 최종 확인
  if (!confirmed) {
    var custLabel = quoteCustomer.name || quoteCustomer.erp || '';
    var totalAmt = validItems.reduce(function(s,it){ return s+(parseFloat(it.qty)||0)*(parseFloat(it.price)||0); }, 0);
    var confirmMsg = '📋 ' + (t('qt_confirm_title') || '견적 제출 확인') + '\n\n'
      + '👤 ' + (t('qt_customer') || '고객') + ': ' + custLabel + '\n'
      + '📦 ' + validItems.length + (t('qt_confirm_items') || '개 품목') + '\n'
      + '💰 ' + (t('qt_grand_total') || '합계') + ': ' + totalAmt.toLocaleString() + '\n\n'
      + (t('qt_confirm_submit_msg') || '견적을 제출하시겠습니까?');
    neoConfirm(confirmMsg, function(yes) {
      if (yes) submitQuoteRequest(true);
    });
    return;
  }

  var btn = document.getElementById('quoteBtnSubmit');
  btn.disabled = true;
  btn.textContent = t('msg_submitting');

  var user  = JSON.parse(sessionStorage.getItem('current_user') || localStorage.getItem('current_user_persist') || 'null');
  var notes = document.getElementById('quoteNotes').value.trim();
  var calcTotal = validItems.reduce(function(s,it){ return s+(parseFloat(it.qty)||0)*(parseFloat(it.price)||0); }, 0);
  var reqTotalEl = document.getElementById('quoteRequestTotal');
  var requestTotal = reqTotalEl && reqTotalEl.value !== '' ? parseFloat(reqTotalEl.value) : calcTotal;
  var isEdit = !!window._quoteEditId;
  var repSig = _getMySignature();
  var payload = {
    action:      isEdit ? 'update_quote' : 'submit_quote',
    erp:         quoteCustomer.erp  || '',
    customer:    quoteCustomer.name || '',
    clinic:      quoteCustomer.clinic || '',
    items:       JSON.stringify(validItems),
    total:       calcTotal,
    request_total: requestTotal,
    discount_rate: parseFloat((document.getElementById('quoteDiscountRate') || {}).value) || 0,
    discount_basis: (document.querySelector('input[name="qtFinalBasis"]:checked') || {}).value || 'before',
    notes:       notes,
    requested_by: user ? user.empid : '',
    requested_by_name: user ? user.name : '',
    requested_at: new Date().toISOString(),
    rep_signature: repSig || '',
    is_unregistered: quoteCustomer.is_unregistered || false,
    customer_type: quoteCustomer.customer_type || '',
    sales_rep: quoteCustomer.sales || '',
    address: quoteCustomer.address || '',
    tel: quoteCustomer.tel || '',
    region: quoteCustomer.region || ''
  };
  if (isEdit) payload.id = window._quoteEditId;

  apiPost(payload).then(function(res) {
    btn.disabled = false;
    btn.textContent = t('qt_submit');
    if (res && res.status === 'ok') {
      showToast(t('qt_submit_ok'));
      window._quoteEditId = null;
      closeQuoteForm();
      updateQuoteBadge();
    } else {
      showToast(t('ql_submit_fail') + (res && res.message ? res.message : t('ql_server_error')));
    }
  }).catch(function(err) {
    btn.disabled = false;
    btn.textContent = t('qt_submit');
    showToast(t('msg_network_submit_fail'));
  });
}

// ── 모바일 견적 제출 확인 ──
function _showQtConfirm(validItems) {
  var body = document.getElementById('qtConfirmBody');
  if (!body) return;
  var html = '';
  // 고객 정보
  if (quoteCustomer) {
    html += '<div class="qt-confirm-cust">' +
      escHtml(quoteCustomer.name || '') +
      (quoteCustomer.clinic ? '<span>' + escHtml(quoteCustomer.clinic) + '</span>' : '') +
      (quoteCustomer.erp ? '<span>ERP: ' + escHtml(quoteCustomer.erp) + '</span>' : '') +
    '</div>';
  }
  // 아이템 목록
  var calcTotal = 0;
  validItems.forEach(function(it, i) {
    var qty = parseInt(it.qty) || 1;
    var price = parseFloat(it.price) || 0;
    var total = qty * price;
    calcTotal += total;
    html += '<div class="qt-confirm-item">' +
      '<div class="qci-idx">' + (i + 1) + '</div>' +
      '<div class="qci-info">' +
        '<div class="qci-name">' + escHtml(it.name) + '</div>' +
        (it.spec ? '<div class="qci-spec">' + escHtml(it.spec) + '</div>' : '') +
        '<div class="qci-detail">' + qty + ' × ฿' + price.toLocaleString() + ' = <strong>฿' + total.toLocaleString() + '</strong></div>' +
      '</div>' +
    '</div>';
  });
  // 합계
  html += '<div class="qt-confirm-total"><span class="qct-label">' + t('qt_total_label') + ' (' + validItems.length + t('qt_confirm_items') + ')</span><span class="qct-amount">฿' + calcTotal.toLocaleString() + '</span></div>';
  // 할인
  var discRate = parseFloat((document.getElementById('quoteDiscountRate') || {}).value) || 0;
  if (discRate > 0) {
    var discAmt = calcTotal - (reqAmt > 0 ? reqAmt : calcTotal);
    html += '<div class="qt-confirm-disc">' + t('qt_disc_rate') + ': ' + discRate + '%' +
      (discAmt > 0 ? ' (-฿' + discAmt.toLocaleString() + ')' : '') + '</div>';
  }
  // 요청금액
  var reqEl = document.getElementById('quoteRequestTotal');
  var reqAmt = reqEl && reqEl.value !== '' ? parseFloat(reqEl.value) : 0;
  if (reqAmt > 0) {
    html += '<div class="qt-confirm-disc" style="background:#eff6ff;color:#1e40af;">' + t('qt_req_total_label') + ': ฿' + reqAmt.toLocaleString() + '</div>';
  }
  // 메모
  var notes = (document.getElementById('quoteNotes') || {}).value;
  if (notes && notes.trim()) {
    html += '<div class="qt-confirm-notes"><span>' + t('qt_memo_label') + '</span>' + escHtml(notes.trim()) + '</div>';
  }
  body.innerHTML = html;
  // 타이틀 i18n
  var titleEl = document.getElementById('qtConfirmTitle');
  if (titleEl) titleEl.textContent = '📋 ' + t('qt_confirm_title');
  document.getElementById('qtConfirmOverlay').classList.add('open');
}

function closeQtConfirm() {
  var ov = document.getElementById('qtConfirmOverlay');
  if (ov) ov.classList.remove('open');
}

// ── 견적서 미리보기 ──
function _getQuotePreviewData() {
  // 미등록 고객 모드일 때 quoteCustomer 설정
  if (_qtUnregMode && !quoteCustomer) {
    var _uc = _getQtUnregCustomer();
    if (_uc) quoteCustomer = _uc;
  }
  var validItems = quoteItems.filter(function(it){ return it.name && it.name.trim(); });
  var custData = null;
  if (quoteCustomer && quoteCustomer.erp && quoteCustomer.erp !== 'UNREG') {
    custData = (DATA || []).find(function(d) { return String(d[0]||d.erp) === String(quoteCustomer.erp); });
  }
  var address = quoteCustomer && quoteCustomer.is_unregistered ? (quoteCustomer.address || '') : (custData ? (custData[4]||custData.address||'') : '');
  var user = JSON.parse(sessionStorage.getItem('current_user') || localStorage.getItem('current_user_persist') || 'null');
  var reqTotalEl = document.getElementById('quoteRequestTotal');
  var notes = document.getElementById('quoteNotes').value.trim();
  var calcTotal = validItems.reduce(function(s,it){ return s+(parseFloat(it.qty)||0)*(parseFloat(it.price)||0); }, 0);
  var requestTotal = reqTotalEl && reqTotalEl.value !== '' ? parseFloat(reqTotalEl.value) : null;
  return {
    customer: quoteCustomer ? (quoteCustomer.name || '') : '',
    erp: quoteCustomer ? (quoteCustomer.erp || '') : '',
    clinic: quoteCustomer ? (quoteCustomer.clinic || '') : '',
    address: address,
    tel: quoteCustomer && quoteCustomer.is_unregistered ? (quoteCustomer.tel || '') : (custData ? (custData.tel || custData[11] || '') : ''),
    taxId: custData ? (custData.tax_id || custData[10] || '') : '',
    sales: user ? (user.name || user.empid || '') : '',
    salesTel: user ? (user.tel || '') : '',
    items: validItems,
    discount: 0,
    discountRate: parseFloat((document.getElementById('quoteDiscountRate') || {}).value) || 0,
    discountBasis: (document.querySelector('input[name="qtFinalBasis"]:checked') || {}).value || 'before',
    notes: notes,
    date: new Date().toLocaleDateString('en-GB'),
    requestTotal: requestTotal,
    calcTotal: calcTotal
  };
}

var _neoLogoB64 = 'data:image/webp;base64,UklGRtQhAABXRUJQVlA4WAoAAAAQAAAAZwEA2AAAQUxQSA4FAAABDzD/ERHCk7P/bSRp2/YTBLQuG5xeJlDawjWMBALFLWXhclmXIxPlZnntoGsrSrSJWeQOrmKi3OwqJtopcbF5DiiFzOUdENH/CdD/4+6qVWWtObSrStWavNWao1lVqleF1ty5VcV2VcmsinpNnmpNAa05ulUlu5KMlZTblTCAWYcHJ3U0awrUa4pU6+gGerSm5JSsJI9ZJgxk56GSInYN2AiNlGEFnraHVgLqRWLRYTJYdUCzXMAATgEwi/RDLwbiOiKfAKgH2kVS0fN6IK0BJe5oElUG7HKZe6qeisXyUI9i0a0Bl4onOI9bBMDjshuw67CZ6ks+wWoZX3QF8AntOlrW0RVh5PU6ImbE+KXcJLtEwELPi7+G28UiLXzLC1pJAdOt4skp7RI9BjglrKKiVSLQBswSacwqE7D9Uk0hnHABoFkij2Q6bFfUy9QjrCSDUwJaX1RLQHWCUaE19EBT2CU8KINVBCplaFcRAKkHs0SHG/JgpQj1ClopY6QOpyUDdiQiSdmsZJWR9q/ARKA+pTnFY8Z6jNJIq1ANdSd1pzUDPeDUN0NxrnQSymYoTWjGMnXRDFS0Q9SzVadcYge62UCnfDISTgsneNwsca5upE5jkXoIIylZBeqRQDuhVcYoUingJA/VKREzVuXCgx3ooVKA5pREc0LPJ5gADGSo1UN7SqaS+rEnNBG4BDxglMFGagY8aKBKqKemTiMd0ApwkdfURUer4VxUv1MGnoALhQeI3NMUgWqCBHAAFwHbDX2LKU7NKBF5MdYXobgD2hlwIzfgEjUuLkBxwPUjykP3gJ0CYCPvaeNAdkqup0nzmchrTOADWKwSibrnL3PVPV8UN0WrnkS1gCmaQJucp1Uaup/L9twNZOcpM5IST+ZxPffzVLQT/Al1wGTXnaZ56OmH7BBuNqv5nJ8lc7+mxD2JOmIYcgN5ho5WiW/dQFM0knBKFGamflom23kyqeipaddhe5o0ZIQF4bLt5vAMGKgGfHGJY5ayAC5pn9N2tBmwc4TCpTYWHl7gIqZoi2YB56EBaNJAO5NNbQDsBDNbm0zRFhmoe6ChDfOYZDrACJoEKAJPZmuy8UBd9OAUAF/UE2JR50YZqiKCVQfOY2ZSapRwUqbpwEjQzmaVakWMlKgFlZSoPSbOIkVJWVJnpWgkdVaz/MvxB6vyTtJGsdiMRFt01QwdlXYb9ZJ2AxuppzhUaiaFLyrtN7qYUs3W1dpLu0IjF6FoNIevzV4PdrHa77TXRpvf6aKrN75uuqZ5MO0Tm69cTg15Q7TeZl34JzbdvLq9eekmVcHlIzn9kXzFnfOW6sJ/4tKrV3evXjKpDee74+3uwc3rs6tPvnisq0N94d/f/e7B4fH+cFtN6Ahhf7zebY7XZ8cnX5zr6kl94b8J++3hbHe4niKquD82O91cnh0vf36u42Vz4X8dttvDvQ6NpvZP2B/trr+pdkNVc+G/Ybs93JkXbpJ/zf6KXf5w2hfFbdsw5dx/83q/SWcPj2OXzYX/ubbbw6VtUjUh+l/H/TGcmeP12Uh90f08bLeHs92hm/bzuP/z9Zm5uT47Pvn5ua6e1BfhbuR6Snj9Rb8/3p5d3bx/fPX+0bk+PtQ9t4+225vH+5vXUzpuuT+yyy/pr3h0rodUPcFtt6/u7Cs00RM+3F+5Xdq6uOH8XA+zovV2u/3Tbfuxm6IHqqStfiZJP5KkH0nSR5J8re2k/6MMVlA4IKAcAAAwdQCdASpoAdkAPlEkj0YjoiEhJNRaiHAKCWVu/HA5GujKHxdPu382/Zv2s65/cvvr7CO3bpbzgOOf9H9ynvm+0D5DeYB+pH+x/uPrK+oX9oP6r7A/1+/5n+q977/Aetz0AP5P/Zus89Af9u/TT/aj4Qv2o/bT4EP2S//OcR/1T8bfdv3qfe/yS/HHuo/Snt1+6HwDZT+s3NN93f4X+A9Au9f4Y6gvsDzdfgP2J7kHRf8d6BHtb9Q/4v968X/+7/vXqH+c/2f/Y+4B/KP6l/vfVD+zeDR9G/zvsA/xb+if7D+0/5r/v/4n6Yv4n/pf4fzlflH9p/7f+U+Af+P/1D/o/332dvWV+yn/Y9xP9af/D+f5RjYPKuutZPvZrnY2DyrrrWT72a52Ng8q661k+eXmDtb7zN9VSlfb9p97Nc7GrsClNUDPXzLmOMh/AHDUVQCeut3t8VrgP+u4D/rt/a8voLgpbEj2jMRaXchNYr3kBey2P2dhOOGHqrW1BdMlbkgSSigrgffE4UtYLkBOl9uL/B1G/IlAMuA9KdcKlDg/piSy5BEsXboMvqowGe/2JuxLNLeFqiiJ1pGRNgk0UjMQ+RmUq2YR+XIGXAf9dv5NtJwtBMeIoN+YlK6O647PcTTPoPC+9JiP6kcQRk5uueUrdWV5lxZCoyIyEqxqNTpvFR6pq5+LelpTEyj2nie41zxbAQn+OYGT18RBJb29zgRHqm06uuSv/4goX8GNiiKuspYWdr8kko4t9P6pQ501jym39d1KkIcKxvgrTBwtb1uOd1zeNE28+k3j2zopJD/aI1pbUKGmagECGP51PPUaZCypslK0nsHXXMRYTfHtYcDaE4wD97M46UTlV1uk5wmKNsfmM6sCe6jlx+HSxtWcEbFlXKlVxFalpMHrsL331uTQGQNDbxWkd4+3kNg2JJFGj9VI0qdhwayY1xsrli7EYMo43FiJ8Cfewq92z64ug6Wv7y9RrubfczBoBBt/GHLP+lBU8Lm/SvRfmaZL4KLaT/W1xHf3ddu7V/44+1tNUAuQDkD7Vf//SN1FTMQdN8T6mhF/SNXsrHs/0adoaxayfP6UqwMxx0HohyKdcQJZBYvC+IUUSMNP5SwOsDzMET+lGwj6aeZMHBWykqNG8JAp8kHmng4Ntr0/rxUwlxjixsqGxYtyIbmT7ipOzlrFsHGsUE5bDuSfnNcrrrJ9QMeZbmVoXjNhjzLc0xc1zsbB5V11rJ97Nc7GweVddayfezXOxsCAAP7/puAAAAI0NLFTVfO5yUBUA5ufkLi7ZVPsBgD9GqGdaNWhwE/8S6eUwEw6rUWCcU8U3a1vFzluK8xKQXAwWGKaJklOgZ/T9Ss7ijLzC4fdxnASnYwAEN7Uw3+Dj6Byh7CvSL5BJoEv91IYVgstrXFt+JpFvlcHyA1J/3Nt2R7dCdjYXZ5F+GJ2jqDExt6NGNZ/SqO/OmLZas2DOW2wfcKuB1IFt4/ewY+2K+EIUfz0HMPRopDA0AX3ZM6r4Xi5m+/9iOJ6ADgjr0IgsO9JkYr3+/7LdKre9tpwntnWcH9QyCKIMY6mg73fQ6OuML8IB8XT/5TGNn/dU7zYnSup8m6w6YsELdszK5OoVYmH7GKXnKpfq8KtiQOkcw+Skm+rgeTQS1AqdwADqK/nYczF+9hEW+ThN2rym0V/1Kv/+Ll//Bm//+J2NHQ92PxiFVQn7zUJgR+RC0gMiAQVbKAMVagzTUxcUIbUftK/ccV1rSOThXA4H/BRBIx8SGHBeh2+v2XYm10iLEbYksGsk+ZQ+jCfKIBkahP75JHdBAUQPY9nqjJ0vRWopNhcBc34RQxO+nKpZGYDDBXHoUNhikqPdEgCvlxyiLZb8PANFuYsS9EaJ5cjEYlRBMWWBvIOuTpp+B/Xfyn1ykmnno+rGcFboj00+ICDKP8MqueXN8GnX6qAvyqjCbLugEMJcJ3Ha5q/CziGEbE3gny/9/vTVo6Y843wROwYFvXR5lsR3hNPr29cvO4EMxVAJZauwNgopB1YhfNeqZ4lO+xkKPNHifzWf6f4U+kxozGM9yP+9Yr9h5mn2emOtLxQ7x/+gnxlghw86XsSXqVi5T0iREJ/QlFSvVdaa8qT75IDyiqZFvmJD5nXu7IOvq6+vgIfix+2SfqivvfBMPEfKOaZYUAeWV3cnN/ATBLh2y9aC6XYnE29UwpV4Retp//oLZdXn3rI4xZmtT7xabS8tW7J/XAMm1zn5g0pSVmLJdwk/QhrA4NPtXDHRPOFQNStmWI+WXDo3oupPT+T5YMGrVL5wmOmVIGln3BXNoTUiXZiRFe+BWNzJoOfwFgBCYH6TSPhv1rEb5eiLA2LkWj8drte5RO1LhaA1PRnvv5f2UFRnNUkkkH8pGs/oIog3S10nejoKOHqC2o1ZJoRYHYpdB7BqVwZvyytVpMJel4GkUVQAbeNtmUUQRv5pXLkCxGnQ2U+Recq1BCUBm2tnnP9NczBZT80xxEF9uvq60v1ifoCwO0+OL1SRbqhJxLFVcIA1awjt+66MDJPsZfxItC8UKhcFoM1j1os4xSCQZ2Ku6T7H/kADgVWVck6U6XyIc5693E6j4rD2ANPZ38xA/GAwJUI9ByrSgkKrSSHtuCJ16lKokOpr2CibQhY0V1e4C+Y9T+s7IugjlLqDFznl3qdxtaviMEFv3+31M9aLbGtDMahaaOi/ljJmZbySFmbPcORUfLJDkw8Wy8UwEvmsWpYo/OiOfPPk7OtS1cpYMdtO/vMMfdlvVXEJ9DC8YHO9LouSMLkk4KjSWKb7K2RRgsuv0/TUPHNba3db+WgL76d3OibQB4QEbmOYm/K+uTNmuMuV6C0+cSPuT21RhpqxKIEUxIxp5vRTaz+3U7WbGqsK0XpmYbDj0qXBAssg5sAWJgD3/H4wtG3fBUS2HgW1UHuo1wJSBC2WpS0aAyPEEa2olkSzxLwatBUlzhZyUVstFozxJatI6r0IcM1xZ465vK7P7rwywVrN6DgoAKlb9gdEtM8lcYeVac317a/gddU0s9qxG7AifFcCqUBcl0+9VAqdGevhqYABOK+l80eWHFryfHXskSoqKbbWjQrBOs83F4rFx6Op4+mB/BKzOGkc7oaUaPCdTCviG/fJagLljX7Tzb1GbOrAll8bRNu6MgQx1vSGX9VXCaGOzFFquqLZ+jJOsl8tOrgjiiVj7v3rLS5HSFO5ovbnALeamqgrZmVDhYPXoQeyep5y54jdtIcMQwidhxqS/R3QPWhlGzkyTnzB30Y+nYO4mLAwPuMr3XqSc/4tPcQFT2goKGAC+cluGbCfgLp9Z1Fk02ehSDJQfVfMDbB1X+aYfFRCjxMtJJAb/p24bqdsv4Tj99TbjAYNP6vAkccFYlevJfFePnsQ4G7ZqCSc84C94Au4H6zzvCBfW3XPQjm2Cc/uQ4Yf1YX9Cb75IWMogKGPCauCBXlyfG213A4tgYJl+jUFVFtsB9KclEPIIrWJZajbbsv/5QyoqPUQEwv8VpQUAPLXm2sc06CmzLRoPQmriZ1uRjbR+k9ckVdICYhoidva+FcEg6UALCR4bahKGcXcwyvimUPFI9BnZ8cyrnMo/qcD331qjrmYZaGpbUkW9PAzSL7QIp/c//1aeJU2mJ9wiPlrvleUJH37NIHaruYRSg1eadQmpgwhNNFUcuKn7gHcjXxXsBAaJn7zhZ6rHhYuyqI8ma31v2/4dsGGDsbOjqbKPeNYUj0r2CsX88EMP4w8qAuZtDGnDkoaEpO36vFr21fJePUpuk0YXCSLE2xJor12wZbaY03uuYwXDm2KVVKAmjEv7ZRvdF7we3SsEDRDoJhalYt4SNIO7gtzl3yOb4f4uCPNiYz4WIvzWawJukLRD/yftNG4aC/VX07SehaiS7yIUadajWPj8b/PoNmvLAjqpYGFMpBVnquHLiok/+XQTg2/i07RmykVYhN+F1nPglQy+/uEbx14LvsZuni2l3PF1pJbzSsgR4Kz7DREFgCjyhBX87w5aNLcQF0s8OpexROf078O29WvrLKOG+hv+cWR3jU1mAhBs8N/gsDkh61FeUQk2qONnZhmfsWSt3mKMlkd2QQjcnXyjDoBC8kAgo3NFNrJaMqFZodtI+kTqwEwhasQP2vrwjK+oVz2GNyyApSro+PWoE3BIaDiId18KJU2dn1Zt0495taGcbRMr11ncembBa1VOLrGOvUXVS0IyJvz/Cbt84y8ZqOuFiJEuo8NpDElPso86rok+eUerux6BLZtv0AFXAjLCE9cW3HIrVpv+UGhI2FsHDD4JfGZkey0mC0hQ9iBAcCG/5IXSqdxau+NPQRdSvzKp1gSfpYak6AUJWbHvxIlYIsF10a41CeKrB7O7tZ/0dW71JtOTJUQXpuyNpcsLwL6S+nZTi9/mT8mIhAhPLJokvzs/MxpVw2wnJjxdsWb/kXfm1rIXEBuQ1OTywRZoxEBOB2O2N7YHHVvQFZmxjYMtmUoBvSqRTJz83yA1E3/fAh+ST9iMIy6PkyTSH+0r/aFpBPzpcWR+mF0B3sb01rDIQ5V93J0VZjo4kIiu+RW40/JoiDN/nGGlBMPq7lqrU+1z5/p771FwSpYPm+nS8BTQsgVF5XbPIIAyOjuGd/QnntKuOpy2vtNO4lhlH9j3krAORxoRe46zMZw6V174Qw2f1SYvRDz+GOAyaOJ9fCfbhOM6+egXqDOx7fT42pHqpuJXLTz+qxmrJUSfyl+1YMzBz8vyDRQQD9P5Epb52UCdPuc1B0MIF7RJ3UE6cvv7W/aAht1x3Gx6kF3Uso7oUBCdAUsmq+5dRp1Yms7vH1UJiekb48d10UkmOiVHrgH9a5B/zUxfnk3qzkO87fn9kcjFw8ZrhvoaQStOklUOk7Z5Bz9y0fTNFf+gd82423mF2OZmySTKHnAQP0DHyQ4pwH+0cE8hzeE1wTCb/GUZe1TSGcMhV9+xqLmaVjrcWfpK0y+7tvJL5ybt09J9uLjpowTA7wl8Q3b3i4+TqkN/w1WQdsEB4Mobb3dSWw/CbwrRPdeUtRAQWBRhG1LTbZ502qsUvRAJam+VDFcQzF4rXFz1D8qVAPy3jL8Lj8AgBQbQrTHmOfGipY/n0o9xDkFrnlao/ybkPWkgX0XLkM0ZirGOlf+sZ5emIEsvPti9nLmbvMM2fn+rtRikUv3RREc3Md20FEwR9mGf7DEwNVhV6gCwxYZLpZ1qpxP7my727qlNjFu1xd1vyA/KQ8+Iqj6ML+WnWFc28Ndfbkb3mZkzrx/Kw7b1nt7/LjV9ON08yHtPXAJZ5ne5iViysrkkQANZUk6DmYWP7x9gLy8qhYqTnDWgpWr2JotPl5BqyHh8IoVMcmiZVjcx2+twHaaNBut9vnyTNvEQ3TVh+ScJcBMD5yLEJ/F0YljQY+IOyyg5Ia1NkdjhRjrrBKEeLC+fFUODmbLftuFsgS927YPgweZaKEPgt3R/DCXCzdOrLqF7Z6lKumm02+jRH3FivIHyR4ek6MnlBcDqIzQTDq8YHYF5x2JLLZlMTaW+LJIiHMsWjqfWzdvAwFc7rYf21ggTatfgl5Bu0vN0KrRj3zlhICiHciccclMIvthB8SQ+9cx5v2OlfmosICTogC4/QPPLtIO6ADKbURDM0Zz/5pQxzEGQ/IWYbKO9iBuuOLJwrX4YOgicl3Jq32uM1UgoXv4S7CXZ2zsNV6ap6GDgWi0bmEwL6F1w4Zl3TzQE+2bB4dxICGw90QQDeZ6x0VKttcWXFrQy9vvODGdfIQRQDtGI2MTg9CHwl/CZPXo8kgU3ZYQtdVGhwnvX5luv94i21xhkc54MKACun5HLBpBIdMtPmYSxw3QeJaethzMYwAApjzIy9mv1qtfqyN0dReXr/dw/+G9IPiPUu0qw9KaftA/nRkQLbWwo+afgKc/qwH9aJIudU5cKvNddLvPxpDSEyqqY5iSQc+Vipd3tupb56RqSb3ZuBpDklBPLF93i52Vh/qwWW27RF2aAdk86sLUSbiZIXGzLLePxfAhanDL/hfFzyPd0Pk1m5Gzpjf96fpL4JNfwmoE7BacJ5PqDj3aCAEumbY7SkQC2o/ztpnsXxC373M5BrE+uWE1kXhUWpEvGSmA1hHWsnaFvZtOjdBNK6GFFT3FP4wWc9PlteSRdrRnMbgWNqEb0dJrVy9DOoCz/6WrL8dkTJ7Yu7tTHNmAAxxFg9eQZML0hNKoevP1gdyS4SHfW5V3JxCnEVFAD9m5OLaLxFpv6XLhDTYVOAun4OFSOiI0foQ+aK2Po/sE+1OveDgv2KdsiUGyEsIK25awfzoxjJ+ZgNZNa/d6JaX+ei/XgQsafbeuqhC7FU36Dz5tSbhTqria7K2HA0b97/d9JHrW197yaXKKC3CjFw9Qg6+tGp+Qu8xvqWYHRJJqG+aCasxvgfWRB9zB+N87VrO1P8dVJI+6HKlILJVJwIZm8wUbCUqKOR6UCX5/D4zSMTZxVccFcaPHFjf7sKorKlbTj1KhfMphN6uZf72xt17WNUdHKACiJIBDcOBHqcxRwsQGn3soFaBym+KOLjHoEORrjU8iArsab7p5g/XqJ5+brYjVKeGQFS31oTo/owr02hu/rlU+BopyAlKW9TrFN337V5OmCS5+FRgvrOeES6oIjo1FBgJLZcTnXUc/5LcxO4KwT7kUVdR2LRu/cz2YGP6QSMJzaHgdcCMNVIrt9DKDw/kE7dN7CaJfxkObr2fcdnkxxThGGu1OgHkQWrEzdPvjrD8fIDag1OCYxGMuJcsyXa/yMZ7rrdolrMCH3/Z+iReAfxX4e7JPNA9dU+mF0wx3SjIjddvucZaWNojVs1DQ6DuN2CIAW6I/tlWIY6hi6hQVyJ2+LkrF/VA5i2XYQBSJVZaXvqIyi9mi4h/sin++EJZ0I3Z2NxcXDb49tEiUlNAC+Fo6j92al3q1UBV8Ykoia5QELvmzkm58HV6ikBzJdmrftPxJ4wdeFKAWnC+0POtJvQQGWxzyjfGZppydIH5fmAQ96qUdv6H0PreDN9DLSESfGW9nKGuN1+a+tI4UhkbLn8XP/lCxhf8uoSdDv6lHdYc4KXRj5Rp0TTLmGxtqhEiqkU2VI9LacoG6qhbT3tmdJYurbr3/2iMSDoZE4G6zlL7O85zHCKxXjHpzZHH7oij/qxv+adIgkS1QGX1wLxPp+xLfBxWsC9KqN/HIQmIdUKG3nM7B897YeDd+jhnaTx4JfmNyi0KVXo61HbCg7BozfmD5pN+MvF6l9p2M1vb0CJEyLCTp8ZWhnAOv8A7xHETAaDrXMbzE75dEEdiahnJgaIcD8yQKhv6cHRixqL9VCfwwI1VYuLd+ST27VnObZJTRJDi/clbt+vnsGT51Ci38vR/959WYNwuWlIZxsStAvowzShak0B+zyibazSjNgJY6cFCXrqqfmMsjLLwMcVBfrjWdFpo3jlzzYxpRNWud8A42tmZLCEEalYLkmFBEk3fHf7JBgLUcDr4YgWiCVBvnNc6hGbOHtMe1APS3jUZ7zXo7EnR81OsTK5PYPHTM1dTCILdZRlX4Vp5VXAIx2yQ/tGVpbop12vfMHr8vm1CXW1BcVLlLwOMrLWiVyrCxnbfn+YVLOwIYOqzyl5NZE5rA61fhMXCXCziH99P4C/RX/4maH5QcvUd0gyH9dblABzls7ZYcGaDcsI+/Ya5lDNe0iXkz+4RfTEWKy9veIzHTDTHuKPAuNDAhV7GMXTrIYmG6eqgP1zY5sphO7zcYMbqanSOj+0fwTgfjeNDQQbMqvX7Cv/VLm+QoKsXympi7djVb7XepR0SQeU8DyZnPg9ySevSgptJEICWNP5zVExUuRm0shVUE7VylSTKzOqd//ZgQkJUoSakBIH+5e8rUSUP7gKZSxzY7aEEg9FD/gXE60GOahcvYOi0MrEzUrq2QMLC92xEaOb/ydjggKCgkkGTFJ3vPZVn/6IGfWyz+F03DEXuz5IJ/hvy++NePzmWySRtxIdeHRu41Jf2w1+pBUwd8LA5naQXbpcraWm6dAQRLdwERnQjnp18BztMO1gXq0r5zwWEKLqsjmmY4UjG5k4XvBnU6/cuL2wKEBONqG2+npX1YAx+lPXXv8jTqhcUb3sLIMSQ0OocONmZDQOJ47uD14qirSZsQv5gusyhQZSLKJmyj+NTheJJg0TdX4A0qtLMtYBBuv/whC+tzmzDHMG4pgw312q+iEZOUIp0f514xhwhjO3dBm5t2yfrdy6yt4VPHA+dr4dE/j3kxtqCsx/BM98tTXRs4XXQN+pIoJ30TfwesQ2r71sPaaOT9J8T3WxRXVOzgo/NEWWTcxMTriTNSg2Sd7axeP5aKGtRPh2/i63azAUg25gj5l92ihqa4yZdknFWiPkuslhzs7kuLbPa0R7SkIZXkKXxHMhWLxmpUfRgEwghOscq/Le59ZAdwM9x95ef4L4bwj8gV2WrkmLAjuOD11oh/mcCWPOAOfmLBzFytDFZEGEK+TjI+8L80trvUYUIGyEfvqv9AZB9/BCmXYGLY0RiqIBjf/Kt7z4eTpuHQ+HOkVyMadMzDYXfCT2LDWAQVBur3GvwJfhvc9eJeG4i/OwOKJ2AvlElatBLWm9iytDkzjfJX2eKdvAGT4WesSYSQQW7YevPgDrhiN3olVBieuW1IAh8tZfue/ekTouuehMyPMD53oHD3q2InjvIbfo4yd3dX8BZNfNevvNT01KU9etQFPKx95gmdkH8oXBXZ7R78O9Z5P4qj4wzgS/oe/cT3YxzyhS6IMhmU/DkvN2d/MUvU8FKTlLZ9L/hlfKG0YlHFWU1dTzqJ8l6motIgTnVcEuxHEWotTtou6LSlCydOz6XyiB5Jyn/ijJqAMKoppDJl7vvkYXzEffVcZo1sNb5BRsudPnig8Y7/914XwwADKPOJ3nriv4zmTKoL2Ebbnmdos0sDCusXgt2+gut1iHsc51uxENKhQ5JPsRL7/4mX1JFs72/sEt5aRxC9TdS+rdVFaQXrZYKK4s86btSpRnz+ER57JNv2fVCMiUWq6jz+5L8yMfYCKNzD+mgRKSgSemMs3jsAGtD/2DRrwJM7PmFH+CdztdVPh4bQ6IkeytDV1Q9KxgSPohLGGroTqVNro8tRtJNvRk4BVEuWoQZji6uGpyXF5ozrwyG11rAlN9ivlqYn4CjlB/4vpW4Hd6A8I/FUtVf31xXNPeJbtZ9lPUNkAdwZCyAjM6ed1oHsKhAafv9PjJuJIM7TnL303IbXroVc9z/zwB+vPBRGz/KeRIz1EipSShpZy6t22ApWBzL/TSNzBdyDsQrz4yzvntFqmypTr87Hh2CTyiwrb0P30eSYn5fBPTiljmhw9kYhAH1CTri8wZeKePS5H+fPj1/DaXnV2Z9PM2+NeVNW7Wtm1PRqvjMPB/b5AWZuuFMuQ7CIfW9m7lyxnRyQYQTvaExUa7tGhuIaDs6GNDQpC3IZ00q6ByS3X3YL/JDSHeUZv6eHOEZpbjd03zgocqMqsbXEzJkBOq5ha1OhTmWT2Ab2WHhYyrDQGUBHqWEcytiEadgb7HhPmMJdpwpApBoW8CtWMPa3R2k8zpXZTcYDGlJtbObkEZqaoKlk9OLYR+ZBol7wkOU2fz+QTB9KI4/JYP8dofngnkjsYcuz2P9DzsCX8FF1MXEPEe8G4TzMCdwEU9c05xvNq9kP2pn+3TCIldR7RZUXF07UBEeyLry6iuHL/gJR//7BX/9aE//2wkfplzhoDSjswqAAAAAAAAAAA==';

function previewQuotation() {
  window._currentPreviewQuoteIdx = null;
  // 폼에서 열 때는 우측 버튼을 닫기만
  var rightDiv = document.getElementById('qtPreviewRightBtns');
  if (rightDiv) rightDiv.innerHTML = '<button class="quote-btn-cancel" onclick="closeQuotePreview()">닫기</button>';
  // 영업 계정은 Excel 다운로드 숨김
  var exBtn = document.getElementById('qtPreviewExcelBtn');
  if (exBtn) exBtn.style.display = _canQuoteApprove() ? '' : 'none';
  var d = _getQuotePreviewData();
  var items = d.items || [];
  var subtotal = items.reduce(function(s,it){ return s + (parseFloat(it.qty)||0)*(parseFloat(it.price)||0); }, 0);
  // requestTotal이 있으면 그 값을 grand total로 사용
  var useReqTotal = d.requestTotal != null && d.requestTotal > 0;
  var grand = useReqTotal ? d.requestTotal : (subtotal - (d.discount || 0));
  var dRate = d.discountRate || 0;
  var dBasis = d.discountBasis || 'before';
  var pvBeforeVat, pvDiscount, pvAfterDisc, pvVat;
  if (dRate > 0 && dRate <= 100 && dBasis === 'before') {
    // 할인 전: 요청 금액이 최종, 역산으로 할인 전 소계 계산
    pvAfterDisc = grand / 1.07;
    pvBeforeVat = pvAfterDisc / (1 - dRate / 100);
    pvDiscount = pvBeforeVat - pvAfterDisc;
    pvVat = grand - pvAfterDisc;
  } else if (dRate > 0 && dRate <= 100 && dBasis === 'after') {
    // 할인 후: 요청 금액에서 할인율 적용
    pvBeforeVat = grand / 1.07;
    pvDiscount = pvBeforeVat * (dRate / 100);
    pvAfterDisc = pvBeforeVat - pvDiscount;
    pvVat = pvAfterDisc * 0.07;
    grand = pvAfterDisc + pvVat;
  } else {
    pvAfterDisc = grand / 1.07;
    pvBeforeVat = pvAfterDisc;
    pvDiscount = 0;
    pvVat = grand - pvAfterDisc;
  }

  var itemsHtml = '';
  var _pvRows = Math.max(15, items.length);
  for (var i = 0; i < _pvRows; i++) {
    var it = items[i] || {};
    var amt = (parseFloat(it.qty)||0) * (parseFloat(it.price)||0);
    itemsHtml += '<tr>' +
      '<td class="td-c">' + (it.name ? (i+1) : '') + '</td>' +
      '<td>' + escHtml(it.name||it.model||'') + '</td>' +
      '<td>' + escHtml(it.spec||'') + '</td>' +
      '<td class="td-c">' + (it.qty||'') + '</td>' +
      '<td class="td-c">' + (it.name ? (it.unit||'EA') : '') + '</td>' +
      '<td class="td-r">' + (it.price ? Number(it.price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '') + '</td>' +
      '<td class="td-r">' + (amt ? amt.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '') + '</td>' +
    '</tr>';
  }

  var fmtN = function(n) { return n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); };

  var _neoLogo = '<div class="qt-pv-logo"><img src="' + _neoLogoB64 + '" alt="NeoBiotech"></div>';

  var html = '<div class="qt-pv-wrap">' +
    '<div style="text-align:center;font-size:23px;font-weight:700;padding:29px 0 27px;color:#1e293b;letter-spacing:0.5px;">Quotation / ใบเสนอราคา</div>' +
    '<div class="qt-pv-header-body">' +
      '<div class="qt-pv-left">' +
        _neoLogo +
        '<div class="qt-pv-company">บริษัท นีโอไบโอเทค (ไทยแลนด์) จำกัด</div>' +
        '<div class="qt-pv-addr">' +
          '16 อาคารคอมโพแม็ก ชั้นที่ 2,4 ห้องเลขที่ 201,401<br>' +
          'ซอย เอกมัย 4 ถนนสุขุมวิท 63 แขวงพระโขนงเหนือ<br>' +
          'เขตวัฒนา กรุงเทพมหานคร 10110<br>' +
          'Tax ID: 0 1055 59043 31 1 &nbsp;|&nbsp; Tel. 02-020-1536' +
        '</div>' +
      '</div>' +
      '<div class="qt-pv-right">' +
        '<div class="qt-pv-right-row"><b>Quotation No. :</b> ' + escHtml(d.docNo || '') + '</div>' +
        '<div class="qt-pv-right-row"><b>Date / วันที่ :</b> ' + escHtml(d.date) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="qt-pv-billto">&nbsp; BILL TO &nbsp;/&nbsp; ข้อมูลลูกค้า</div>' +
    '<div class="qt-pv-info-grid">' +
      '<div class="qt-pv-info-full">' +
        '<div class="qt-pv-il">Customer Name / ชื่อลูกค้า</div><div class="qt-pv-iv">' + escHtml(_titleCase(d.customer || '')) + '</div>' +
      '</div>' +
      '<div class="qt-pv-info-full">' +
        '<div class="qt-pv-il">Address / ที่อยู่</div><div class="qt-pv-iv">' + escHtml(d.address||'') + '</div>' +
      '</div>' +
      '<div class="qt-pv-info-half">' +
        '<div class="qt-pv-il">Tel. / โทรศัพท์</div><div class="qt-pv-iv">' + escHtml(_formatPhone(d.tel||'')) + '</div>' +
        '<div class="qt-pv-il">Sales : พนักงานขาย :</div><div class="qt-pv-iv">' + escHtml(_titleCase(d.sales||'')) + '</div>' +
      '</div>' +
      '<div class="qt-pv-info-half">' +
        '<div class="qt-pv-il">Tax ID เลขผู้เสียภาษี</div><div class="qt-pv-iv">' + escHtml(d.taxId||'') + '</div>' +
        '<div class="qt-pv-il">Tel / โทร :</div><div class="qt-pv-iv">' + escHtml(_formatPhone(d.salesTel||'')) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="qt-pv-sep"></div>' +
    '<table class="qt-pv-table">' +
      '<thead><tr>' +
        '<th style="width:5%">No.</th>' +
        '<th style="width:15%">Product Code</th>' +
        '<th style="width:30%">Description<span>รายการ</span></th>' +
        '<th style="width:8%">Qty<span>จำนวน</span></th>' +
        '<th style="width:8%">Unit<span>หน่วย</span></th>' +
        '<th style="width:15%">Unit Price<span>ราคา/หน่วย</span></th>' +
        '<th style="width:15%">Amount<span>จำนวนเงิน</span></th>' +
      '</tr></thead>' +
      '<tbody>' + itemsHtml + '</tbody>' +
    '</table>' +
    '<div class="qt-pv-bottom-row">' +
      '<div class="qt-pv-pay-left">' +
        '<div class="pay-title"><b>Payment Terms:</b> เงื่อนไข ชำระเงิน:</div>' +
        '<div class="pay-option"><span class="pay-check"></span> เครดิต(Credit) .......วัน(Days.)</div>' +
        '<div class="pay-option"><span class="pay-check"></span> เงินสด หรือโอนชำระเข้าบัญชีบริษัทฯ (Cash or Bank Transfer to Company Account)</div>' +
        '<div class="pay-bank-info">บจก.นีโอไบโอเทค (ไทยแลนด์) (NeoBiotech (Thailand) Co., Ltd.)</div>' +
        '<div class="pay-bank-info">ธ.กสิกรไทย สาขา พระโขนง (Kasikornbank, Phra Khanong Branch)</div>' +
        '<div class="pay-bank-info pay-bank-bold">บัญชีออมทรัพย์ (Savings Account) เลขที่ (No.) 012-1-20295-6</div>' +
      '</div>' +
      '<div class="qt-pv-sum-right">' +
        '<table class="qt-pv-summary">' +
          '<tr><td class="lbl">Subtotal &nbsp;/&nbsp; รวมเงิน</td><td class="val">' + fmtN(pvBeforeVat) + '</td></tr>' +
          '<tr><td class="lbl">Discount &nbsp;/&nbsp; ส่วนลด</td><td class="val">' + fmtN(pvDiscount) + '</td></tr>' +
          '<tr><td class="lbl">After Discount &nbsp;/&nbsp; หลังหักส่วนลด</td><td class="val">' + fmtN(pvAfterDisc) + '</td></tr>' +
          '<tr><td class="lbl">Value before VAT &nbsp;/&nbsp; มูลค่าก่อนภาษีมูลค่าเพิ่ม</td><td class="val">' + fmtN(pvAfterDisc) + '</td></tr>' +
          '<tr><td class="lbl">VAT 7% &nbsp;/&nbsp; ภาษีมูลค่าเพิ่ม</td><td class="val">' + fmtN(pvVat) + '</td></tr>' +
          '<tr class="grand"><td class="lbl">GRAND TOTAL &nbsp;/&nbsp; จำนวนเงินทั้งสิ้น</td><td class="val">' + fmtN(grand) + '</td></tr>' +
        '</table>' +
      '</div>' +
    '</div>' +
    '<div class="qt-pv-remark"><div class="rm-lbl">Remark / หมายเหตุ</div><div class="rm-val">' + escHtml(d.notes||'') + '</div></div>' +
    '<div class="qt-pv-dark-bar"></div>' +
    '<div class="qt-pv-sign">' +
      '<div class="qt-pv-sign-col"><div class="sign-line"></div><div class="sign-title">Sales Manager / ผู้จัดการฝ่ายขาย</div><div class="sign-date">Date / วันที่ : ___/___/______</div></div>' +
      '<div class="qt-pv-sign-col">' + (_getMySignature() ? '<img class="sign-img" src="' + _getMySignature() + '" />' : '') + '<div class="sign-line"></div><div class="sign-title">Sales Representative / ตัวแทนฝ่ายขาย</div><div class="sign-date">Date / วันที่ : ' + _fmtDDMMYYYY(new Date()) + '</div></div>' +
    '</div>' +
    '<div class="qt-pv-footer-bar">Thank you for your business &nbsp;|&nbsp; ขอบคุณที่ไว้วางใจเรา</div>' +
  '</div>';

  document.getElementById('qtPreviewBody').innerHTML = html;
  document.getElementById('qtPreviewOverlay').classList.add('open');
}

function closeQuotePreview() {
  document.getElementById('qtPreviewOverlay').classList.remove('open');
}

function downloadQuoteFromPreview() {
  if (window._currentPreviewQuoteIdx != null) {
    downloadQuoteExcelByIdx(window._currentPreviewQuoteIdx);
    return;
  }
  var d = _getQuotePreviewData();
  downloadQuotationExcel(d);
}

function downloadPdfFromPreview() {
  var wrap = document.querySelector('#qtPreviewBody .qt-pv-wrap');
  if (!wrap) { showToast(t('ql_no_preview')); return; }
  // 라이브러리 동적 로드
  Promise.all([loadHtml2Canvas(), loadJsPDF()]).then(function() {
    var d = _getQuotePreviewData();
    var pdfFileName = _quoteFileName(d ? d.docNo : '', d ? d.date : '');
    var clone = wrap.cloneNode(true);
    clone.style.cssText = 'width:700px;padding:14px 24px;background:#fff;position:absolute;left:-9999px;top:0;';
    document.body.appendChild(clone);
    html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(function(canvas) {
    document.body.removeChild(clone);
    var imgData = canvas.toDataURL('image/jpeg', 0.92);
    var pdf = new jspdf.jsPDF('p', 'mm', 'a4');
    var pageW = pdf.internal.pageSize.getWidth();
    var pageH = pdf.internal.pageSize.getHeight();
    var marginLR = 8;
    var pdfW = pageW - marginLR * 2;
    var pdfH = (canvas.height * pdfW) / canvas.width;
    var yOff = 0;
    while (yOff < pdfH) {
      if (yOff > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', marginLR, yOff > 0 ? -(yOff - 5) : (pageH - pdfH) / 2, pdfW, pdfH);
      yOff += pageH;
    }
    pdf.save((pdfFileName || 'quotation') + '.pdf');
  }).catch(function() { showToast(t('ql_pdf_fail')); });
  }).catch(function() { showToast('PDF 라이브러리 로딩 실패'); });
}

function printFromPreview() {
  var wrap = document.querySelector('#qtPreviewBody .qt-pv-wrap');
  if (!wrap) { showToast(t('ql_no_preview')); return; }

  // 라이브러리 동적 로드
  loadHtml2Canvas().then(function() {
    var clone = wrap.cloneNode(true);
    clone.style.cssText = 'width:700px;padding:14px 24px;background:#fff;position:absolute;left:-9999px;top:0;';
    document.body.appendChild(clone);

    html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(function(canvas) {
      document.body.removeChild(clone);
      var imgData = canvas.toDataURL('image/png');
      var printWin = window.open('', '_blank');
      if (!printWin) { showToast(t('ql_popup_blocked')); return; }
      printWin.document.write(
        '<!DOCTYPE html><html><head><title>Quotation</title>' +
        '<style>@page{size:A4 portrait;margin:0}' +
        'html,body{margin:0;padding:0;height:100%;background:#fff}' +
        'img{display:block;width:100%;height:100vh;object-fit:contain;object-position:top center;}' +
        '</style></head>' +
        '<body><img src="' + imgData + '" onload="window.focus();window.print();window.close();"></body></html>'
      );
      printWin.document.close();
    }).catch(function() { showToast(t('ql_print_fail')); });
  }).catch(function() { showToast('라이브러리 로딩 실패'); });
}

// ── 견적서 Excel 다운로드 (template 양식) ──
function downloadQuotationExcel(data) {
  // data: { customer, erp, clinic, address, tel, taxId, sales, salesTel, items:[{name,spec,qty,unit,price}], discount, notes, docNo, date }
  var items = data.items || [];
  var rows = [];
  var merges = [];
  var NAVY   = 'FF1B2A4A';
  var BLUE_BG = 'FFEFF6FF';
  var WHITE  = 'FFFFFFFF';
  var GRAY_T = 'FF475569';
  var DARK_T = 'FF1E293B';

  var fTitle = { name:'Arial', sz:20, bold:true, color:{rgb:DARK_T} };
  var fCompany = { name:'Arial', sz:14, bold:true, color:{rgb:DARK_T} };
  var fAddr  = { name:'Arial', sz:9, color:{rgb:GRAY_T} };
  var fLabel = { name:'Arial', sz:9, bold:true, color:{rgb:GRAY_T} };
  var fHdr   = { name:'Arial', sz:9, bold:true, color:{rgb:WHITE} };
  var fCell  = { name:'Arial', sz:10, color:{rgb:DARK_T} };
  var fBold  = { name:'Arial', sz:10, bold:true, color:{rgb:DARK_T} };
  var fGrand = { name:'Arial', sz:11, bold:true };
  var fFoot  = { name:'Arial', sz:10, color:{rgb:WHITE} };

  var bThin = { style:'thin', color:{rgb:'FF000000'} };
  var bMed  = { style:'medium', color:{rgb:'FF000000'} };
  var bHair = { style:'hair', color:{rgb:'FF000000'} };
  var borderAll = { top:bThin, bottom:bThin, left:bThin, right:bThin };
  var alC = { horizontal:'center', vertical:'center' };
  var alL = { horizontal:'left', vertical:'center' };
  var alR = { horizontal:'right', vertical:'center' };
  var alCW = { horizontal:'center', vertical:'center', wrapText:true };

  // Row 0 (1): Title
  rows.push(['Quotation / ใบเสนอราคา','','','','','','']);
  merges.push({s:{r:0,c:0},e:{r:0,c:6}});
  // Row 1 (2): Company name
  rows.push(['บริษัท นีโอไบโอเทค (ไทยแลนด์) จำกัด','','','','','','']);
  merges.push({s:{r:1,c:0},e:{r:1,c:3}});
  // Row 2-4 (3-5): Address
  rows.push(['16 อาคารคอมโพแม็ก ชั้นที่ 2,4 ห้องเลขที่ 201,401','','','','','','']);
  merges.push({s:{r:2,c:0},e:{r:2,c:3}});
  rows.push(['ซอย เอกมัย 4 ถนนสุขุมวิท 63 แขวงพระโขนงเหนือ','','','','','','']);
  merges.push({s:{r:3,c:0},e:{r:3,c:3}});
  rows.push(['เขตวัฒนา กรุงเทพมหานคร 10110','','','','Quotation No. :','',data.docNo || '']);
  merges.push({s:{r:4,c:0},e:{r:4,c:3}});
  merges.push({s:{r:4,c:4},e:{r:4,c:5}});
  // Row 5 (6): Tax ID + Date
  rows.push(['Tax ID: 0 1055 59043 31 1  |  Tel. 02-020-1536','','','','Date / วันที่ :','',data.date || new Date().toLocaleDateString('th-TH')]);
  merges.push({s:{r:5,c:0},e:{r:5,c:3}});
  merges.push({s:{r:5,c:4},e:{r:5,c:5}});
  // Row 6 (7): Separator
  rows.push(['','','','','','','']);
  // Row 7 (8): BILL TO header
  rows.push(['  BILL TO  /  ข้อมูลลูกค้า','','','','','','']);
  merges.push({s:{r:7,c:0},e:{r:7,c:6}});
  // Row 8-13 (9-14): Customer info
  rows.push(['Customer Name / ชื่อลูกค้า','',_titleCase(data.customer || ''),'','','','']);
  merges.push({s:{r:8,c:0},e:{r:8,c:1}});
  merges.push({s:{r:8,c:2},e:{r:8,c:6}});
  rows.push(['Address / ที่อยู่','',data.address || '','','','','']);
  merges.push({s:{r:9,c:0},e:{r:9,c:1}});
  merges.push({s:{r:9,c:2},e:{r:9,c:6}});
  rows.push(['Tel. / โทรศัพท์','',_formatPhone(data.tel || ''),'','Sales : พนักงานขาย :','',_titleCase(data.sales || '')]);
  merges.push({s:{r:10,c:0},e:{r:10,c:1}});
  merges.push({s:{r:10,c:4},e:{r:10,c:5}});
  rows.push(['Tax ID เลขผู้เสียภาษี','',data.taxId || '','','Tel / โทร :','',_formatPhone(data.salesTel || '')]);
  merges.push({s:{r:11,c:0},e:{r:11,c:1}});
  merges.push({s:{r:11,c:4},e:{r:11,c:5}});
  // Row 12 (13): Separator
  rows.push(['','','','','','','']);
  merges.push({s:{r:12,c:0},e:{r:12,c:6}});
  // Row 13: Table header
  rows.push(['No.','Product Code','Description / รายการ','Qty\nจำนวน','Unit\nหน่วย','Unit Price\nราคา/หน่วย','Amount\nจำนวนเงิน']);

  // Items (15 rows)
  var DATA_START = rows.length;
  for (var i = 0; i < 15; i++) {
    var it = items[i] || {};
    var rowIdx = rows.length + 1; // Excel 1-based
    rows.push([
      it.name ? (i + 1) : '',
      it.name || it.model || '',
      it.spec || '',
      it.qty || '',
      it.unit || 'EA',
      it.price || '',
      '' // formula placeholder
    ]);
  }
  var DATA_END = rows.length; // exclusive

  // Row 32 (33): Separator
  rows.push(['','','','','','','']);
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:6}});
  // Rows 33-37 (34-38): Summary
  var sumStartRow = rows.length;
  rows.push(['','','','Subtotal  /  รวมเงิน','','','']); // 34
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:2}});
  merges.push({s:{r:rows.length-1,c:3},e:{r:rows.length-1,c:5}});
  rows.push(['','','','Discount  /  ส่วนลด','','','']); // 35
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:2}});
  merges.push({s:{r:rows.length-1,c:3},e:{r:rows.length-1,c:5}});
  rows.push(['','','','After Discount  /  หลังหักส่วนลด','','','']); // 36
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:2}});
  merges.push({s:{r:rows.length-1,c:3},e:{r:rows.length-1,c:5}});
  rows.push(['','','','VAT 7%  /  ภาษีมูลค่าเพิ่ม','','','']); // 37
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:2}});
  merges.push({s:{r:rows.length-1,c:3},e:{r:rows.length-1,c:5}});
  rows.push(['','','','GRAND TOTAL  /  จำนวนเงินทั้งสิ้น','','','']); // 38
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:2}});
  merges.push({s:{r:rows.length-1,c:3},e:{r:rows.length-1,c:5}});
  var grandRow = rows.length; // 1-based

  // Row 38 (39): Separator
  rows.push(['','','','','','','']);
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:6}});
  // Row 39 (40): Remark
  rows.push(['Remark / หมายเหตุ','',data.notes || '','','','','']);
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:1}});
  merges.push({s:{r:rows.length-1,c:2},e:{r:rows.length-1,c:6}});
  // Row 40 (41): empty
  rows.push(['','','','','','','']);
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:6}});
  // Row 41 (42): Separator
  rows.push(['','','','','','','']);
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:6}});
  // Row 42 (43): Signature space
  rows.push(['','','','','','','']);
  merges.push({s:{r:rows.length-1,c:5},e:{r:rows.length-1,c:6}});
  // Row 43 (44): Signature labels
  rows.push(['','','Sales Manager  /  ผู้จัดการฝ่ายขาย','','','Sales Representative  /  ตัวแทนฝ่ายขาย','']);
  // Row 44 (45): Footer
  rows.push(['Thank you for your business  |  ขอบคุณที่ไว้วางใจเรา','','','','','','']);
  merges.push({s:{r:rows.length-1,c:0},e:{r:rows.length-1,c:6}});

  var ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = merges;
  ws['!cols'] = [
    {wch:8},{wch:16},{wch:38},{wch:10},{wch:8},{wch:20},{wch:18}
  ];

  // Row heights
  var rowHts = {};
  rowHts[0]=63.6; rowHts[1]=36; rowHts[2]=18.6; rowHts[3]=18.6; rowHts[4]=18.6; rowHts[5]=18.6;
  rowHts[6]=4.2; rowHts[7]=21.6;
  for(var ri=8;ri<=11;ri++) rowHts[ri]=19.95;
  rowHts[12]=6; rowHts[13]=33;
  for(var ri=DATA_START;ri<DATA_END;ri++) rowHts[ri]=19.95;
  rowHts[DATA_END]=6; // separator
  for(var ri=sumStartRow;ri<sumStartRow+4;ri++) rowHts[ri]=19.95;
  rowHts[sumStartRow+4]=21.6; // grand total
  rowHts[sumStartRow+5]=6; // separator
  rowHts[sumStartRow+6]=23.4; // remark
  rowHts[sumStartRow+7]=18; // empty
  rowHts[sumStartRow+8]=7.95; // separator
  rowHts[sumStartRow+9]=84.6; // signature
  rowHts[sumStartRow+10]=26.4; // signature labels
  rowHts[sumStartRow+11]=31.2; // footer
  ws['!rows'] = [];
  for(var ri=0;ri<rows.length;ri++) {
    ws['!rows'][ri] = { hpt: rowHts[ri] || 19.95 };
  }

  // ── Styling ──
  function sc(r,c,style) {
    var ref = XLSX.utils.encode_cell({r:r,c:c});
    if(!ws[ref]) ws[ref] = {v:'',t:'s'};
    ws[ref].s = style;
  }
  function scRange(r1,c1,r2,c2,style) {
    for(var r=r1;r<=r2;r++) for(var c=c1;c<=c2;c++) sc(r,c,style);
  }

  // Row 0: Title
  scRange(0,0,0,6,{font:fTitle,fill:{fgColor:{rgb:BLUE_BG}},alignment:alC,border:borderAll});
  // Row 1: Company
  scRange(1,0,1,6,{font:fCompany,alignment:alL});
  // Rows 2-5: Address
  for(var r=2;r<=5;r++) scRange(r,0,r,6,{font:fAddr,alignment:alL});
  // Quotation No / Date labels
  sc(4,4,{font:fLabel,alignment:alR}); sc(4,6,{font:fCell,alignment:alL});
  sc(5,4,{font:fLabel,alignment:alR}); sc(5,6,{font:fCell,alignment:alL});
  // Row 7: BILL TO
  scRange(7,0,7,6,{font:fHdr,fill:{fgColor:{rgb:NAVY}},alignment:alL});
  // Customer info labels + borders (PDF 디자인과 동일)
  var bInfo = { top:bHair, bottom:bHair, left:bHair, right:bHair };
  for(var r=8;r<=11;r++) {
    sc(r,0,{font:fLabel,alignment:alL,border:bInfo});
    sc(r,1,{font:fLabel,alignment:alL,border:bInfo});
    sc(r,2,{font:fCell,alignment:alL,border:bInfo});
    for(var cc=3;cc<=6;cc++) sc(r,cc,{font:fCell,alignment:alL,border:bInfo});
  }
  sc(10,4,{font:fLabel,alignment:alL,border:bInfo}); sc(10,5,{font:fLabel,alignment:alL,border:bInfo}); sc(10,6,{font:fCell,alignment:alL,border:bInfo});
  sc(11,4,{font:fLabel,alignment:alL,border:bInfo}); sc(11,5,{font:fLabel,alignment:alL,border:bInfo}); sc(11,6,{font:fCell,alignment:alL,border:bInfo});
  // Row 12: Gray separator (PDF의 회색 구분선)
  scRange(12,0,12,6,{fill:{fgColor:{rgb:'FFCBD5E1'}}});
  // Table header row
  for(var c=0;c<7;c++) sc(13,c,{font:fHdr,fill:{fgColor:{rgb:NAVY}},alignment:alCW,border:borderAll});
  // Item rows
  for(var ri=DATA_START;ri<DATA_END;ri++) {
    var isAlt = ((ri-DATA_START)%2===0);
    var bg = isAlt ? BLUE_BG : WHITE;
    for(var c=0;c<7;c++) {
      var al = (c===0)?alC:(c<=2)?alL:(c<=4)?alC:(c===5)?alR:alR;
      sc(ri,c,{font:fCell,fill:{fgColor:{rgb:bg}},alignment:al,border:borderAll});
    }
    // Amount formula
    var exR = ri+1;
    var ref = XLSX.utils.encode_cell({r:ri,c:6});
    ws[ref] = {t:'s',v:'',f:'IFERROR(IF(D'+exR+'*F'+exR+'=0,"",D'+exR+'*F'+exR+'),"")'};
    ws[ref].s = {font:fCell,fill:{fgColor:{rgb:bg}},alignment:alR,border:borderAll};
    ws[ref].z = '#,##0.00';
    // Number format for price/qty
    var qRef = XLSX.utils.encode_cell({r:ri,c:5});
    if(ws[qRef]) ws[qRef].z = '#,##0.00';
  }
  // Summary rows
  var subtotalR = sumStartRow;
  var discountR = sumStartRow+1;
  var afterDiscR = sumStartRow+2;
  var vatR = sumStartRow+3;
  var grandR = sumStartRow+4;
  for(var si=0;si<5;si++) {
    var sr = sumStartRow+si;
    scRange(sr,0,sr,2,{font:fLabel,fill:{fgColor:{rgb:BLUE_BG}},alignment:alR,border:borderAll});
    scRange(sr,3,sr,5,{font:fLabel,fill:{fgColor:{rgb:BLUE_BG}},alignment:alR,border:borderAll});
    sc(sr,6,{font:fCell,fill:{fgColor:{rgb:WHITE}},alignment:alR,border:borderAll});
  }
  // Grand total special style
  scRange(grandR,3,grandR,5,{font:fGrand,fill:{fgColor:{rgb:BLUE_BG}},alignment:alR,border:{top:bMed,bottom:bMed,left:bMed,right:bThin}});
  sc(grandR,6,{font:fGrand,fill:{fgColor:{rgb:WHITE}},alignment:alR,border:{top:bMed,bottom:bMed,left:bThin,right:bMed}});

  // Summary formulas
  var eDS = DATA_START+1, eDE = DATA_END;
  // 할인율 역산 적용
  var xlDRate = parseFloat(data.discountRate || data.discount_rate) || 0;
  var xlDBasis = data.discountBasis || data.discount_basis || 'before';
  var xlGrand = data.requestTotal || data.request_total || 0;
  var xlPvBeforeVat, xlPvDiscount, xlPvAfterDisc, xlPvVat;
  if (xlDRate > 0 && xlDRate <= 100 && xlDBasis === 'before' && xlGrand > 0) {
    xlPvAfterDisc = xlGrand / 1.07;
    xlPvBeforeVat = xlPvAfterDisc / (1 - xlDRate / 100);
    xlPvDiscount = xlPvBeforeVat - xlPvAfterDisc;
    xlPvVat = xlGrand - xlPvAfterDisc;
  } else if (xlDRate > 0 && xlDRate <= 100 && xlDBasis === 'after' && xlGrand > 0) {
    xlPvBeforeVat = xlGrand / 1.07;
    xlPvDiscount = xlPvBeforeVat * (xlDRate / 100);
    xlPvAfterDisc = xlPvBeforeVat - xlPvDiscount;
    xlPvVat = xlPvAfterDisc * 0.07;
    xlGrand = xlPvAfterDisc + xlPvVat;
  } else {
    xlPvAfterDisc = xlGrand > 0 ? xlGrand / 1.07 : 0;
    xlPvBeforeVat = xlPvAfterDisc;
    xlPvDiscount = 0;
    xlPvVat = xlGrand > 0 ? xlGrand - xlPvAfterDisc : 0;
  }

  // Subtotal (VAT 제외 제품가)
  var sRef = XLSX.utils.encode_cell({r:subtotalR,c:6});
  ws[sRef] = {t:'n',v:Math.round(xlPvBeforeVat*100)/100}; ws[sRef].z = '#,##0.00';
  ws[sRef].s = {font:fCell,fill:{fgColor:{rgb:WHITE}},alignment:alR,border:borderAll};

  // Discount
  var dRef = XLSX.utils.encode_cell({r:discountR,c:6});
  ws[dRef] = {t:'n',v:Math.round(xlPvDiscount*100)/100}; ws[dRef].z = '#,##0.00';
  ws[dRef].s = {font:fCell,fill:{fgColor:{rgb:WHITE}},alignment:alR,border:borderAll};

  // After Discount (VAT 제외)
  var adRef = XLSX.utils.encode_cell({r:afterDiscR,c:6});
  ws[adRef] = {t:'n',v:Math.round(xlPvAfterDisc*100)/100}; ws[adRef].z = '#,##0.00';
  ws[adRef].s = {font:fCell,fill:{fgColor:{rgb:WHITE}},alignment:alR,border:borderAll};

  // VAT
  var vRef = XLSX.utils.encode_cell({r:vatR,c:6});
  ws[vRef] = {t:'n',v:Math.round(xlPvVat*100)/100}; ws[vRef].z = '#,##0.00';
  ws[vRef].s = {font:fCell,fill:{fgColor:{rgb:WHITE}},alignment:alR,border:borderAll};

  // Grand Total = After Discount + VAT
  var gRef = XLSX.utils.encode_cell({r:grandR,c:6});
  ws[gRef] = {t:'n',v:Math.round(xlGrand*100)/100}; ws[gRef].z = '#,##0.00';
  ws[gRef].s = {font:fGrand,fill:{fgColor:{rgb:WHITE}},alignment:alR,border:{top:bMed,bottom:bMed,left:bThin,right:bMed}};

  // Remark
  sc(sumStartRow+6,0,{font:fLabel,fill:{fgColor:{rgb:BLUE_BG}},alignment:alL,border:borderAll});
  sc(sumStartRow+6,2,{font:fCell,alignment:alL,border:borderAll});

  // Signature labels
  sc(rows.length-2,2,{font:fBold,alignment:alC,border:{top:bHair}});
  sc(rows.length-2,5,{font:fBold,alignment:alL,border:{top:bHair}});

  // Footer
  scRange(rows.length-1,0,rows.length-1,6,{font:fFoot,fill:{fgColor:{rgb:NAVY}},alignment:alC});

  // Print settings
  ws['!print'] = { paper: 9, orientation: 'portrait' };

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Quotation');
  var fileName = _quoteFileName(data.docNo, data.date);
  XLSX.writeFile(wb, fileName + '.xlsx');
}

// ── 견적서 파일명 생성 (QT50002-001_31032026) ──
function _quoteFileName(docNo, dateStr) {
  var d = dateStr || new Date().toLocaleDateString('en-GB');
  var parts = d.replace(/-/g,'/').split('/');
  var datePart = parts.length === 3 ? (parts[0].padStart(2,'0') + parts[1].padStart(2,'0') + parts[2]) : d.replace(/[\/\-\.]/g,'');
  if (docNo) return docNo + '_' + datePart;
  return 'Quotation_' + datePart;
}

// ── 견적 요청 목록 ──
var _quoteListCache = [];

var _quoteListUnsub = null;

function loadQuoteList(callback) {
  // 기존 리스너 해제
  if (_quoteListUnsub) { _quoteListUnsub(); _quoteListUnsub = null; }
  // 실시간 리스너 — 최근 6개월만 구독 (성능 최적화)
  var _q6m = new Date(); _q6m.setMonth(_q6m.getMonth() - 6);
  _quoteListUnsub = _fbDb.collection('quotes')
    .where('requested_at', '>=', _q6m.toISOString())
    .orderBy('requested_at', 'desc')
    .onSnapshot(function(snap) {
    _quoteListCache = snap.docs.map(function(d) {
      var q = d.data();
      if (q.status === 'cancelled') return null;
      if (q.items && typeof q.items !== 'string') q.items = JSON.stringify(q.items);
      return q;
    }).filter(Boolean);
    // 스냅샷 변경마다 배지 재계산 (승인/요청 후 자동 반영)
    _recomputeQuoteBadge();
    // 최초 콜백 실행
    if (callback) { callback(); callback = null; }
    // 목록이 열려있으면 자동 갱신
    var overlay = document.getElementById('quoteListOverlay');
    if (overlay && overlay.classList.contains('open')) {
      applyQuoteFilter();
    }
  }, function(err) {
    console.warn('Quote list snapshot error:', err);
    // 폴백: 일회성 조회
    apiPost({ action: 'get_quotes' }).then(function(res) {
      _quoteListCache = (res && res.status === 'ok' && Array.isArray(res.data)) ? res.data : [];
      _recomputeQuoteBadge();
      if (callback) callback();
    }).catch(function() {
      _quoteListCache = [];
      _recomputeQuoteBadge();
      if (callback) callback();
    });
  });
}

function _recomputeQuoteBadge() {
  var user = getCurrentUser();
  var isAdm = _isAdmin(user);
  var isOffice = user && user.dept === 'Office';
  var _isSalesDept = user && (user.dept || '').toLowerCase() === 'sales';
  var pendingCount = _quoteListCache.filter(function(q) {
    if (q.status !== 'pending' && q.status) return false;
    // 본인 견적만 카운트 (관리자/Office는 전체, 단 Sales 부서는 항상 본인만)
    if (user && (_isSalesDept || (!isAdm && !isOffice))) {
      var by = (q.requested_by || q.created_by || q.submitted_by || '').toLowerCase();
      var byName = (q.requested_by_name || q.sales || '').toLowerCase();
      var mine = false;
      if (user.empid && by.indexOf(user.empid.toLowerCase()) > -1) mine = true;
      if (!mine && user.nickname && (by.indexOf(user.nickname.toLowerCase()) > -1 || byName.indexOf(user.nickname.toLowerCase()) > -1)) mine = true;
      if (!mine && user.name && (by.indexOf(user.name.toLowerCase()) > -1 || byName.indexOf(user.name.toLowerCase()) > -1)) mine = true;
      if (!mine) return false;
    }
    return true;
  }).length;
  var badge = document.getElementById('quoteBadge');
  var ddBadge = document.getElementById('quotePendingBadge');
  if (badge) { badge.textContent = pendingCount; }
  if (ddBadge) {
    if (pendingCount > 0) { ddBadge.textContent = pendingCount; ddBadge.style.display = 'inline-block'; }
    else { ddBadge.style.display = 'none'; }
  }
  var mobQtBadge2 = document.getElementById('mobQuotePendingBadge');
  if (mobQtBadge2) { if (pendingCount > 0) { mobQtBadge2.textContent = pendingCount; mobQtBadge2.style.display = 'inline-block'; } else { mobQtBadge2.style.display = 'none'; } }
  // 주문 상위 버튼 견적 배지
  var otbq = document.getElementById('orderTopBadgeQuote');
  if (otbq) {
    if (pendingCount > 0) { otbq.textContent = pendingCount; otbq.style.display = 'inline-block'; }
    else { otbq.style.display = 'none'; }
  }
  // 모바일 주문 카테고리 배지 (총합 업데이트)
  window._quotePendingCount = pendingCount;
  if (typeof _updateMobOrderCatBadge === 'function') _updateMobOrderCatBadge();
}

function updateQuoteBadge() {
  return new Promise(function(resolve) {
    loadQuoteList(function() {
      _recomputeQuoteBadge();
      resolve();
    });
  });
}

function _qlKeyNav(e) {
  var overlay = document.getElementById('quoteListOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  var len = _quoteListRendered.length;
  if (!len) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    var next = e.key === 'ArrowDown'
      ? Math.min(_qlActiveIdx + 1, len - 1)
      : Math.max(_qlActiveIdx - 1, 0);
    if (next === _qlActiveIdx && _qlActiveIdx !== -1) return;
    _qlActiveIdx = next;
    document.querySelectorAll('#quoteListBody .ql-trow').forEach(function(r, i) {
      r.classList.toggle('ql-row-active', i === next);
    });
    var activeRow = document.querySelector('#quoteListBody .ql-trow[data-qidx="'+next+'"]');
    if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });
    openQuoteDetail(next);
  }
}
document.addEventListener('keydown', _qlKeyNav);

function openQuoteList(filter) {
  var titleEl = document.getElementById('quoteListTitle');
  if (filter === 'done') {
    titleEl.textContent = '✅ ' + t('qt_dd_done');
  } else {
    titleEl.textContent = _canQuoteApprove() ? '⏳ ' + t('qt_dd_pending') : t('ql_qt_status_title');
  }
  // 필터 바 기본값 설정
  var statusSel = document.getElementById('qlFilterStatus');
  if (statusSel) {
    if (filter === 'done') statusSel.value = 'done';
    else if (filter === 'pending') statusSel.value = 'pending';
    else statusSel.value = 'all';
  }
  document.getElementById('quoteListBody').innerHTML = '<div class="load-progress-wrap"><div class="load-icon-ring"></div><div class="load-progress-label">' + t('pending_loading') + '</div></div>';
  var _qlOv = document.getElementById('quoteListOverlay');
  _qlOv.classList.add('open');
  _mobFullScreen(_qlOv, _qlOv.querySelector('.quote-list-modal'));
  _bringToFront(_qlOv);

  loadQuoteList(function() {
    applyQuoteFilter();
  });
}

function applyQuoteFilter() {
  var me = getCurrentUser();
  var myEmpid = me ? me.empid : '';
  var isAdmin = _isAdmin(me);
  var statusVal = (document.getElementById('qlFilterStatus') || {}).value || 'all';
  var startVal = (document.getElementById('qlFilterStart') || {}).value || '';
  var endVal = (document.getElementById('qlFilterEnd') || {}).value || '';

  var searchVal = ((document.getElementById('qlFilterSearch') || {}).value || '').trim().toLowerCase();
  var filtered = _quoteListCache.filter(function(q) {
    // 본인 신청 건만 표시 (관리자/Office는 전체, 단 Sales 부서는 항상 본인만)
    var isOffice = me && me.dept === 'Office';
    var _isSalesDept = me && (me.dept || '').toLowerCase() === 'sales';
    if ((_isSalesDept || (!isAdmin && !isOffice)) && myEmpid) {
      var by = (q.requested_by || q.created_by || q.submitted_by || '').toLowerCase();
      var byName = (q.requested_by_name || q.sales || '').toLowerCase();
      var mine = false;
      if (me.empid && by.indexOf(me.empid.toLowerCase()) > -1) mine = true;
      if (!mine && me.nickname && (by.indexOf(me.nickname.toLowerCase()) > -1 || byName.indexOf(me.nickname.toLowerCase()) > -1)) mine = true;
      if (!mine && me.name && (by.indexOf(me.name.toLowerCase()) > -1 || byName.indexOf(me.name.toLowerCase()) > -1)) mine = true;
      if (!mine) return false;
    }
    // 상태 필터
    if (statusVal !== 'all') {
      if (statusVal === 'pending' && !(q.status === 'pending' || !q.status)) return false;
      if (statusVal === 'done' && !(q.status === 'done' || q.status === 'completed')) return false;
      if (statusVal === 'rejected' && q.status !== 'rejected') return false;
    }
    // 'all' 필터에서는 취소/반려는 기본적으로 숨김 처리 (명시적 선택시만 표시)
    if (statusVal === 'all' && (q.status === 'cancelled' || q.status === 'rejected')) {
      // 유지 — 전체 선택이므로 표시. 필요시 아래 한 줄 활성화로 숨김:
      // return false;
    }
    // 기간 필터
    if (startVal || endVal) {
      var qDate = q.requested_at ? q.requested_at.slice(0,10) : (q.date ? new Date(q.date).toISOString().slice(0,10) : '');
      if (startVal && qDate < startVal) return false;
      if (endVal && qDate > endVal) return false;
    }
    // 검색 필터
    if (searchVal) {
      var id = String(q.id || '').toLowerCase();
      var name = String(q.requested_by_name || q.requested_by || '').toLowerCase();
      var cust = String(q.customer || q.customer_name || '').toLowerCase();
      if (id.indexOf(searchVal) === -1 && name.indexOf(searchVal) === -1 && cust.indexOf(searchVal) === -1) return false;
    }
    return true;
  });

  // 타이틀 업데이트
  var titleEl = document.getElementById('quoteListTitle');
  var statusLabels = {all: t('ql_title_all'), pending: t('ql_title_wait'), done: t('ql_title_done')};
  titleEl.textContent = statusLabels[statusVal] || t('ql_title_all');
  titleEl.textContent += ' (' + filtered.length + ')';

  renderQuoteList(filtered, statusVal === 'pending' ? 'pending' : (statusVal === 'all' ? 'all' : 'done'));
}

function closeQuoteList() {
  closeQuoteDetail();
  if (_quoteListUnsub) { _quoteListUnsub(); _quoteListUnsub = null; }
  _closeBounce(document.getElementById('quoteListOverlay'), 'open');
  if (typeof _ssReturnCheck === 'function') _ssReturnCheck();
}

var _quoteListRendered = [];
var _quoteListFilter = 'pending';
var _qlSelectedIdx = new Set();
var _qlActiveIdx = -1;

function _canQuoteApprove() {
  var me = getCurrentUser();
  if (!me) return false;
  if (_isAdmin(me)) return true;
  var perms = _ensurePermArray(me.permissions);
  return perms.indexOf('quote_approve') !== -1;
}

function renderQuoteList(list, filter) {
  _quoteListRendered = list;
  _quoteListFilter = filter;
  _qlSelectedIdx.clear();
  _qlActiveIdx = -1;
  closeQuoteDetail();

  var body = document.getElementById('quoteListBody');
  var isPending = (filter !== 'done' && filter !== 'all');
  var canApprove = _canQuoteApprove();
  var showToolbar = isPending && canApprove && list.length;
  var toolbar = document.getElementById('qlToolbar');
  var bulkBtn = document.getElementById('qlBulkApprove');
  if (toolbar) toolbar.style.display = showToolbar ? 'flex' : 'none';
  if (bulkBtn) bulkBtn.style.display = 'none';
  var selAllCb = document.getElementById('qlSelectAll');
  if (selAllCb) selAllCb.checked = false;

  if (!list.length) {
    body.innerHTML = '<div class="ql-empty">' + t('qt_list_empty_done') + '</div>';
    return;
  }

  var showCb = isPending && canApprove;
  var tbl = '<table class="ql-table"><thead><tr>' +
    (showCb ? '<th style="width:32px;"><input type="checkbox" id="qlSelectAll2" onchange="qlToggleAll(this.checked)"></th>' : '') +
    '<th>ID</th><th>이름</th><th>작성일</th><th>고객 Code</th><th>고객명</th><th>아이템</th><th style="text-align:right;">가격</th><th>상태</th>' +
    '</tr></thead><tbody>';
  list.forEach(function(q, idx) {
    var items = [];
    try { items = typeof q.items === 'string' ? JSON.parse(q.items) : (q.items || []); } catch(e) {}
    var itemCount = items.length;
    var itemText = itemCount > 0 ? t('qt_detail_total') + ' ' + itemCount + t('qt_detail_count') : '-';
    var total = q.request_total || q.total || 0;
    var dateStr = q.requested_at ? new Date(q.requested_at).toLocaleDateString('ko-KR',{year:'numeric',month:'numeric',day:'numeric'}).replace(/ /g,'') : '';
    var st = q.status || 'pending';
    var statusText, statusCls;
    if (st === 'done' || st === 'completed') { statusText = t('qt_status_issued'); statusCls = 'ql-st-done'; }
    else if (st === 'rejected') { statusText = t('qt_status_rejected') || '반려됨'; statusCls = 'ql-st-rejected'; }
    else if (st === 'cancelled') { statusText = (t('qt_status_cancelled') || '취소'); statusCls = 'ql-st-rejected'; }
    else { statusText = t('qt_status_wait'); statusCls = 'ql-st-pending'; }
    var isActive = (_qlActiveIdx === idx) ? ' ql-row-active' : '';
    tbl += '<tr class="ql-trow' + isActive + '" data-qidx="'+idx+'" onclick="qlCardClick(event,'+idx+')">' +
      (showCb ? '<td onclick="event.stopPropagation()"><input type="checkbox" class="ql-chk" data-qidx="'+idx+'" onchange="qlChkChange('+idx+',this.checked)"></td>' : '') +
      '<td>' + escHtml(q.requested_by || '') + '</td>' +
      '<td>' + escHtml(q.requested_by_name || '') + '</td>' +
      '<td>' + escHtml(dateStr) + '</td>' +
      '<td>' + escHtml(q.erp || q.customer_erp || '') + '</td>' +
      '<td>' + escHtml(q.customer || q.customer_name || '') + '</td>' +
      '<td>' + escHtml(itemText) + '</td>' +
      '<td style="text-align:right;font-weight:600;">' + (total ? Number(total).toLocaleString() : '-') + '</td>' +
      '<td><span class="' + statusCls + '">' + statusText + '</span></td>' +
    '</tr>';
  });
  tbl += '</tbody></table>';
  body.innerHTML = tbl;
  _qlUpdateSelCount();
}

/* ── 체크박스 ── */
function qlChkChange(idx, checked) {
  if (checked) _qlSelectedIdx.add(idx); else _qlSelectedIdx.delete(idx);
  _qlUpdateSelCount();
}
function qlToggleAll(checked) {
  var cbs = document.querySelectorAll('#quoteListBody .ql-chk');
  cbs.forEach(function(cb) { cb.checked = checked; });
  _qlSelectedIdx.clear();
  if (checked) _quoteListRendered.forEach(function(_, i) { _qlSelectedIdx.add(i); });
  _qlUpdateSelCount();
}
function _qlUpdateSelCount() {
  var el = document.getElementById('qlSelCount');
  var bulkBtn = document.getElementById('qlBulkApprove');
  var bulkRejBtn = document.getElementById('qlBulkReject');
  var cnt = _qlSelectedIdx.size;
  if (el) el.textContent = cnt > 0 ? cnt + '건 선택' : '';
  if (bulkBtn) bulkBtn.style.display = cnt > 0 ? '' : 'none';
  if (bulkRejBtn) bulkRejBtn.style.display = cnt > 0 ? '' : 'none';
}

/* ── 일괄 반려 ── */
function bulkRejectQuotes() {
  var ids = [];
  _qlSelectedIdx.forEach(function(idx) {
    var q = _quoteListRendered[idx];
    if (q && q.id) ids.push(q.id);
  });
  if (!ids.length) return;
  var msg = (typeof t === 'function' && t('ql_bulk_reject_confirm')) ? t('ql_bulk_reject_confirm') : '건을 일괄 반려하시겠습니까?';
  if (!confirm(ids.length + msg)) return;
  var reason = prompt('반려 사유 (선택):', '') || '';
  _doBulkReject(ids, reason);
}
function _doBulkReject(ids, reason) {
  var done = 0, fail = 0;
  (async function() {
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      try {
        var res = await apiPost({
          action: 'update_quote_status',
          id: id,
          status: 'rejected',
          reject_reason: reason,
          rejected_at: new Date().toISOString()
        });
        if (res && res.status === 'ok') done++; else fail++;
      } catch(e) { fail++; }
    }
    showToast('🗑 ' + done + '건 반려 완료' + (fail ? ', ' + fail + '건 실패' : ''));
    updateQuoteBadge();
    openQuoteList(_quoteListFilter);
  })();
}

/* ── 일괄 승인 ── */
function bulkApproveQuotes() {
  var ids = [];
  _qlSelectedIdx.forEach(function(idx) {
    var q = _quoteListRendered[idx];
    if (q && q.id) ids.push(q.id);
  });
  if (!ids.length) return;
  var savedSig = _getMySignature();
  if (savedSig) {
    if (!confirm(ids.length + t('ql_bulk_confirm'))) return;
    _doBulkApprove(ids, savedSig);
  } else {
    openSigPad(function(sigDataUrl) {
      _doBulkApprove(ids, sigDataUrl);
    });
  }
}
function _doBulkApprove(ids, sigDataUrl) {
  var done = 0, fail = 0;
  var total = ids.length;
  // 각 견적의 ERP 코드로 docNo 생성 후 승인
  var quoteMap = {};
  ids.forEach(function(id) {
    var q = _quoteListRendered.find(function(r) { return r && r.id === id; });
    quoteMap[id] = q ? (q.erp || q.customer_erp || '') : '';
  });
  // 순차 처리로 docNo 중복 방지
  (async function() {
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      try {
        var docNo = await _generateQuoteDocNo(quoteMap[id]);
        var res = await apiPost({ action: 'update_quote_status', id: id, status: 'done', docNo: docNo, mgr_signature: sigDataUrl, approved_at: new Date().toISOString() });
        if (res && res.status === 'ok') done++; else fail++;
      } catch(e) { fail++; }
    }
    showToast('✅ ' + done + '건 승인 완료' + (fail ? ', ' + fail + '건 실패' : ''));
    updateQuoteBadge();
    openQuoteList(_quoteListFilter);
  })();
}

/* ── 카드 클릭 → 상세 ── */
function qlCardClick(event, idx) {
  if (event.target.tagName === 'INPUT') return;
  // 같은 행 재클릭 → 닫기
  if (_qlActiveIdx === idx) {
    closeQuoteDetail();
    return;
  }
  // 이전 active 해제
  document.querySelectorAll('#quoteListBody .ql-card.active, #quoteListBody .ql-row-active').forEach(function(c) { c.classList.remove('active'); c.classList.remove('ql-row-active'); });
  var el = document.querySelector('#quoteListBody .ql-card[data-qidx="'+idx+'"], #quoteListBody .ql-trow[data-qidx="'+idx+'"]');
  if (el) { el.classList.add('active'); el.classList.add('ql-row-active'); }
  _qlActiveIdx = idx;
  openQuoteDetail(idx);
}

/* ── 상세 패널 열기 ── */
function openQuoteDetail(idx) {
  var q = _quoteListRendered[idx];
  if (!q) return;
  var split = document.getElementById('qlSplit');
  split.classList.add('detail-open');

  var items = [];
  try { items = typeof q.items === 'string' ? JSON.parse(q.items) : (q.items || []); } catch(e) {}
  var subtotal = items.reduce(function(s,it){ return s + (parseFloat(it.qty)||0)*(parseFloat(it.price)||0); }, 0);
  var reqTotal = parseFloat(q.request_total) || 0;
  var grand = reqTotal > 0 ? reqTotal : subtotal;
  var fmtN = function(n) { return n ? '฿' + Number(n).toLocaleString() : ''; };
  var dateStr = q.requested_at ? new Date(q.requested_at).toLocaleDateString('ko-KR',{year:'numeric',month:'numeric',day:'numeric'}).replace(/ /g,'') : '';

  var customer = q.customer || q.customer_name || '';
  var erp = q.erp || q.customer_erp || '';
  var salesName = q.requested_by_name || q.requested_by || '';
  var st = q.status || 'pending';
  var statusText = (st === 'done' || st === 'completed') ? t('qt_status_issued') : t('qt_status_wait');
  var statusCls = (st === 'done' || st === 'completed') ? 'ql-st-done' : 'ql-st-pending';

  // 고객 카드
  var html = '<div class="qd-section">' +
    '<div class="qd-label">👤 ' + t('qt_detail_cust_info') + '</div>' +
    '<div class="qd-cust-card">' +
      '<div class="qd-cust-main">' +
        (erp ? '<span class="qd-erp">[' + escHtml(erp) + ']</span> ' : '') +
        '<strong>' + escHtml(customer) + '</strong>' +
      '</div>' +
      '<div class="qd-cust-meta">' +
        '<span>📅 ' + escHtml(dateStr) + '</span>' +
        '<span>👤 ' + escHtml(salesName) + '</span>' +
        '<span class="' + statusCls + '">' + statusText + '</span>' +
        (q.docNo ? '<span style="color:#7c3aed;font-weight:600;">' + escHtml(q.docNo) + '</span>' : '') +
      '</div>' +
    '</div>' +
  '</div>';

  // 아이템 목록
  html += '<div class="qd-section">' +
    '<div class="qd-label">📦 ' + t('qt_detail_items') + ' <span style="color:#6b7280;font-weight:400;">(' + items.length + t('qt_detail_items_unit') + ')</span></div>';
  if (items.length) {
    items.forEach(function(it, i) {
      var qty = parseInt(it.qty) || 1;
      var price = parseFloat(it.price) || 0;
      var total = qty * price;
      html += '<div class="qd-item-card">' +
        '<span class="qd-item-idx">#' + (i+1) + '</span>' +
        '<div class="qd-item-info">' +
          '<div class="qd-item-name">' + escHtml(it.name || it.model || '') + '</div>' +
          '<div class="qd-item-spec">' + escHtml(it.spec || '') +
            (price ? ' · ' + fmtN(price) : '') +
          '</div>' +
        '</div>' +
        '<div class="qd-item-qty">' + qty + ' EA</div>' +
        (total ? '<div class="qd-item-total">' + fmtN(total) + '</div>' : '') +
      '</div>';
    });
  } else {
    html += '<div style="padding:16px;color:#94a3b8;text-align:center;font-size:13px;">' + t('qt_no_items') + '</div>';
  }
  html += '</div>';

  // 금액 요약
  html += '<div class="qd-section">' +
    '<div class="qd-summary">' +
      '<div class="qd-sum-row"><span>' + t('qt_subtotal') + '</span><span>' + (subtotal ? fmtN(subtotal) : '-') + '</span></div>' +
      (reqTotal > 0 && reqTotal !== subtotal ? '<div class="qd-sum-row"><span>' + t('qt_req_amount') + '</span><span style="color:#7c3aed;font-weight:700;">' + fmtN(reqTotal) + '</span></div>' : '') +
      '<div class="qd-sum-row qd-sum-grand"><span>' + t('qt_grand_total') + '</span><span>' + fmtN(grand) + '</span></div>' +
    '</div>' +
  '</div>';

  // 메모
  if (q.notes) {
    html += '<div class="qd-section">' +
      '<div class="qd-label">📝 메모</div>' +
      '<div class="qd-memo">' + escHtml(q.notes) + '</div>' +
    '</div>';
  }

  document.getElementById('qlDetailTitle').textContent = '📄 ' + escHtml(customer);
  document.getElementById('qlDetailBody').innerHTML = html;

  // 하단 액션 버튼
  var isPending = (_quoteListFilter !== 'done');
  var footer = document.getElementById('qlDetailFooter');
  var dlBtnStyle = 'background:#059669;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;';
  var pdfBtnStyle = 'background:#dc2626;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;';
  var pvBtnStyle = 'background:#2563eb;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;';
  var canApprove = _canQuoteApprove();
  if (isPending) {
    var approverBtns = canApprove
      ? '<button class="ql-btn ql-btn-cancel" onclick="cancelQuoteByIdx('+idx+')">🗑 ' + t('qt_act_cancel') + '</button>' +
        '<button class="ql-btn ql-btn-approve" onclick="approveQuoteByIdx('+idx+')">✅ ' + t('qt_act_approve') + '</button>'
      : '';
    footer.innerHTML =
      '<div style="display:flex;gap:8px;">' +
        '<button onclick="previewQuoteByIdx('+idx+')" style="' + pvBtnStyle + '">🔍 ' + t('qt_detail_preview') + '</button>' +
      '</div>' +
      '<div style="margin-left:auto;display:flex;gap:8px;">' +
        '<button class="ql-btn ql-btn-edit" onclick="editQuoteByIdx('+idx+')">✏️ ' + t('qt_act_edit') + '</button>' +
        approverBtns +
      '</div>';
  } else {
    footer.innerHTML =
      '<div style="display:flex;gap:8px;">' +
        '<button onclick="previewQuoteByIdx('+idx+')" style="' + pvBtnStyle + '">🔍 ' + t('qt_detail_preview') + '</button>' +
      '</div>';
  }
}

function closeQuoteDetail() {
  var split = document.getElementById('qlSplit');
  if (split) split.classList.remove('detail-open');
  _qlActiveIdx = -1;
  document.querySelectorAll('#quoteListBody .ql-card.active, #quoteListBody .ql-row-active').forEach(function(c) { c.classList.remove('active'); c.classList.remove('ql-row-active'); });
}

// ── 컬럼 리사이저 드래그 ──
(function() {
  var resizer = null, split = null, listCol = null, detailCol = null, startX = 0, startLeftPct = 0;
  function initResizer() {
    resizer = document.getElementById('qlColResizer');
    if (!resizer) return;
    resizer.addEventListener('mousedown', function(e) {
      e.preventDefault();
      split = document.getElementById('qlSplit');
      listCol = split ? split.querySelector('.ql-list-col') : null;
      detailCol = split ? split.querySelector('.ql-detail-col') : null;
      if (!split || !listCol || !detailCol || !split.classList.contains('detail-open')) return;
      startX = e.clientX;
      startLeftPct = (listCol.offsetWidth / split.offsetWidth) * 100;
      resizer.classList.add('dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
  function onMove(e) {
    if (!split) return;
    var dx = e.clientX - startX;
    var splitW = split.offsetWidth;
    var newPct = startLeftPct + (dx / splitW) * 100;
    newPct = Math.max(20, Math.min(70, newPct));
    listCol.style.flex = '0 0 ' + newPct + '%';
    detailCol.style.flex = '0 0 ' + (100 - newPct) + '%';
  }
  function onUp() {
    if (resizer) resizer.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    split = null;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResizer);
  } else {
    initResizer();
  }
})();

function downloadQuoteExcelByIdx(idx) {
  var q = _quoteListRendered[idx];
  if (!q) return;
  var items = [];
  try { items = typeof q.items === 'string' ? JSON.parse(q.items) : (q.items || []); } catch(e) {}
  var qErp = q.erp || q.customer_erp || '';
  var custData = (DATA || []).find(function(d) { return String(d[0]||d.erp) === String(qErp); });
  var address = q.address || (custData ? (custData[4]||custData.address||'') : '');
  var custTel = q.tel || (custData ? (custData.tel||custData[11]||'') : '');
  var custTaxId = q.taxId || (custData ? (custData.tax_id||custData[10]||'') : '');
  var user = JSON.parse(sessionStorage.getItem('current_user') || localStorage.getItem('current_user_persist') || 'null');
  downloadQuotationExcel({
    customer: q.customer || q.customer_name || '',
    erp: qErp,
    address: address,
    tel: custTel,
    taxId: custTaxId,
    sales: q.requested_by_name || q.requested_by || '',
    salesTel: q.salesTel || (user ? (user.tel || '') : ''),
    docNo: q.docNo || '',
    items: items,
    discount: 0,
    discountRate: parseFloat(q.discount_rate) || 0,
    discountBasis: q.discount_basis || 'before',
    requestTotal: parseFloat(q.request_total) || 0,
    notes: q.notes || '',
    date: q.requested_at ? new Date(q.requested_at).toLocaleDateString('en-GB') : '',
    rep_signature: q.rep_signature || ''
  });
}

// ── 견적서 PDF 다운로드 ──
function downloadQuotePdfByIdx(idx) {
  var srcEl = document.getElementById('qlDetailBody');
  if (!srcEl) return;
  var wrap = srcEl.querySelector('.qt-pv-wrap');
  if (!wrap) { showToast(t('ql_no_preview')); return; }

  // 라이브러리 동적 로드
  Promise.all([loadHtml2Canvas(), loadJsPDF()]).then(function() {
    var q = _quoteListRendered[idx];
    var pdfDateStr = (q && q.requested_at) ? new Date(q.requested_at).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
    var pdfFileName = _quoteFileName(q ? q.docNo : '', pdfDateStr);

    // 임시 컨테이너에 복제하여 고정 폭으로 렌더링
    var clone = wrap.cloneNode(true);
    clone.style.cssText = 'width:700px;padding:14px 24px;background:#fff;position:absolute;left:-9999px;top:0;';
    document.body.appendChild(clone);

    var btn = srcEl.closest('.ql-detail-col').querySelector('.ql-pdf-btn');
    if (btn) { btn.disabled = true; btn.textContent = t('ql_pdf_generating'); }

    html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(function(canvas) {
    document.body.removeChild(clone);
    var imgData = canvas.toDataURL('image/jpeg', 0.92);
    var pdf = new jspdf.jsPDF('p', 'mm', 'a4');
    var pageW = pdf.internal.pageSize.getWidth();
    var pageH = pdf.internal.pageSize.getHeight();
    var marginLR = 8;
    var pdfW = pageW - marginLR * 2;
    var pdfH = (canvas.height * pdfW) / canvas.width;
    if (pdfH <= pageH - 10) {
      // 한 장에 들어가면 상하 균등 여백
      var yMargin = (pageH - pdfH) / 2;
      pdf.addImage(imgData, 'JPEG', marginLR, yMargin, pdfW, pdfH);
    } else {
      // 여러 페이지 처리
      var usableH = pageH - 16;
      var srcH = canvas.height;
      var srcW = canvas.width;
      var sliceH = Math.floor(srcH * (usableH / pdfH));
      var pos = 0;
      var page = 0;
      while (pos < srcH) {
        if (page > 0) pdf.addPage();
        var h = Math.min(sliceH, srcH - pos);
        var tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = srcW;
        tmpCanvas.height = h;
        tmpCanvas.getContext('2d').drawImage(canvas, 0, pos, srcW, h, 0, 0, srcW, h);
        var sliceImg = tmpCanvas.toDataURL('image/jpeg', 0.92);
        var slicePdfH = (h * pdfW) / srcW;
        pdf.addImage(sliceImg, 'JPEG', marginLR, 8, pdfW, slicePdfH);
        pos += h;
        page++;
      }
    }
    pdf.save(pdfFileName + '.pdf');
    if (btn) { btn.disabled = false; btn.textContent = '📄 PDF'; }
  }).catch(function(err) {
    document.body.removeChild(clone);
    console.error('PDF 생성 오류:', err);
    showToast('PDF 생성 실패');
    if (btn) { btn.disabled = false; btn.textContent = '📄 PDF'; }
  });
  }).catch(function() { showToast('PDF 라이브러리 로딩 실패'); });
}

// ── 견적 미리보기 오버레이 (from quote list) ──
function previewQuoteByIdx(idx) {
  var q = _quoteListRendered[idx];
  if (!q) return;
  window._currentPreviewQuoteIdx = idx;
  var html = _buildQuotationDocHtml(q);
  document.getElementById('qtPreviewBody').innerHTML = html;
  // 우측 버튼: 대기 상태이면 승인/취소 + 닫기
  var rightDiv = document.getElementById('qtPreviewRightBtns');
  if (rightDiv) {
    var st = q.status || 'pending';
    var isPending = (st === 'pending' || st === 'waiting');
    var canApprove = _canQuoteApprove();
    var btns = '';
    if (isPending && canApprove) {
      btns += '<button class="ql-btn ql-btn-approve" onclick="approveQuoteByIdx('+idx+');closeQuotePreview();">✅ 승인</button>';
      btns += '<button class="ql-btn ql-btn-cancel" onclick="cancelQuoteByIdx('+idx+');closeQuotePreview();">🗑 취소</button>';
    }
    btns += '<button class="quote-btn-cancel" onclick="closeQuotePreview()">닫기</button>';
    rightDiv.innerHTML = btns;
  }
  // 영업 계정은 Excel 다운로드 숨김
  var exBtn = document.getElementById('qtPreviewExcelBtn');
  if (exBtn) exBtn.style.display = _canQuoteApprove() ? '' : 'none';
  document.getElementById('qtPreviewOverlay').classList.add('open');
}

function _buildQuotationDocHtml(q) {
  var items = [];
  try { items = typeof q.items === 'string' ? JSON.parse(q.items) : (q.items || []); } catch(e) {}
  var subtotal = items.reduce(function(s,it){ return s + (parseFloat(it.qty)||0)*(parseFloat(it.price)||0); }, 0);
  var discount = parseFloat(q.discount) || 0;
  var reqTotal = parseFloat(q.request_total) || 0;
  var useReqTotal = reqTotal > 0 && (subtotal === 0 || reqTotal !== subtotal);
  var grand = useReqTotal ? reqTotal : (subtotal - discount);
  var dRate = parseFloat(q.discount_rate) || 0;
  var dBasis = q.discount_basis || 'before';
  var pvBeforeVat, pvDiscount, pvAfterDisc, pvVat;
  if (dRate > 0 && dRate <= 100 && dBasis === 'before') {
    pvAfterDisc = grand / 1.07;
    pvBeforeVat = pvAfterDisc / (1 - dRate / 100);
    pvDiscount = pvBeforeVat - pvAfterDisc;
    pvVat = grand - pvAfterDisc;
  } else if (dRate > 0 && dRate <= 100 && dBasis === 'after') {
    pvBeforeVat = grand / 1.07;
    pvDiscount = pvBeforeVat * (dRate / 100);
    pvAfterDisc = pvBeforeVat - pvDiscount;
    pvVat = pvAfterDisc * 0.07;
    grand = pvAfterDisc + pvVat;
  } else {
    pvAfterDisc = grand / 1.07;
    pvBeforeVat = pvAfterDisc;
    pvDiscount = 0;
    pvVat = grand - pvAfterDisc;
  }
  var fmtN = function(n) { return n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); };
  var dateStr = q.date ? new Date(q.date).toLocaleDateString('en-GB') : '';

  var customer = q.customer || q.customer_name || '';
  var erp = q.erp || q.customer_erp || '';
  var custData = (DATA || []).find(function(d) { return String(d[0]||d.erp) === String(erp); });
  var address = q.address || (custData ? (custData[4]||custData.address||'') : '');
  var custTel = q.tel || (custData ? (custData.tel||'') : '');
  var custTaxId = q.taxId || (custData ? (custData.tax_id||'') : '');
  var salesName = q.requested_by_name || q.requested_by || '';

  var itemsHtml = '';
  var _pvRows2 = Math.max(15, items.length);
  for (var i = 0; i < _pvRows2; i++) {
    var it = items[i] || {};
    var amt = (parseFloat(it.qty)||0) * (parseFloat(it.price)||0);
    itemsHtml += '<tr>' +
      '<td class="td-c">' + (it.name || it.model ? (i+1) : '') + '</td>' +
      '<td>' + escHtml(it.name||it.model||'') + '</td>' +
      '<td>' + escHtml(it.spec||'') + '</td>' +
      '<td class="td-c">' + (it.qty||'') + '</td>' +
      '<td class="td-c">' + ((it.name||it.model) ? (it.unit||'EA') : '') + '</td>' +
      '<td class="td-r">' + (it.price ? fmtN(Number(it.price)) : '') + '</td>' +
      '<td class="td-r">' + (amt ? fmtN(amt) : '') + '</td>' +
    '</tr>';
  }

  var _neoLogo2 = '<div class="qt-pv-logo"><img src="' + _neoLogoB64 + '" alt="NeoBiotech"></div>';

  return '<div class="qt-pv-wrap">' +
    '<div style="text-align:center;font-size:23px;font-weight:700;padding:29px 0 27px;color:#1e293b;letter-spacing:0.5px;">Quotation / ใบเสนอราคา</div>' +
    '<div class="qt-pv-header-body">' +
      '<div class="qt-pv-left">' +
        _neoLogo2 +
        '<div class="qt-pv-company">บริษัท นีโอไบโอเทค (ไทยแลนด์) จำกัด</div>' +
        '<div class="qt-pv-addr">' +
          '16 อาคารคอมโพแม็ก ชั้นที่ 2,4 ห้องเลขที่ 201,401<br>' +
          'ซอย เอกมัย 4 ถนนสุขุมวิท 63 แขวงพระโขนงเหนือ<br>' +
          'เขตวัฒนา กรุงเทพมหานคร 10110<br>' +
          'Tax ID: 0 1055 59043 31 1 &nbsp;|&nbsp; Tel. 02-020-1536' +
        '</div>' +
      '</div>' +
      '<div class="qt-pv-right">' +
        '<div class="qt-pv-right-row"><b>Quotation No. :</b> ' + escHtml(q.docNo || '') + '</div>' +
        '<div class="qt-pv-right-row"><b>Date / วันที่ :</b> ' + escHtml(dateStr) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="qt-pv-billto">&nbsp; BILL TO &nbsp;/&nbsp; ข้อมูลลูกค้า</div>' +
    '<div class="qt-pv-info-grid">' +
      '<div class="qt-pv-info-full">' +
        '<div class="qt-pv-il">Customer Name / ชื่อลูกค้า</div><div class="qt-pv-iv">' + escHtml(_titleCase(customer || '')) + '</div>' +
      '</div>' +
      '<div class="qt-pv-info-full">' +
        '<div class="qt-pv-il">Address / ที่อยู่</div><div class="qt-pv-iv">' + escHtml(address||'') + '</div>' +
      '</div>' +
      '<div class="qt-pv-info-half">' +
        '<div class="qt-pv-il">Tel. / โทรศัพท์</div><div class="qt-pv-iv">' + escHtml(_formatPhone(custTel)) + '</div>' +
        '<div class="qt-pv-il">Sales : พนักงานขาย :</div><div class="qt-pv-iv">' + escHtml(_titleCase(salesName)) + '</div>' +
      '</div>' +
      '<div class="qt-pv-info-half">' +
        '<div class="qt-pv-il">Tax ID เลขผู้เสียภาษี</div><div class="qt-pv-iv">' + escHtml(custTaxId) + '</div>' +
        '<div class="qt-pv-il">Tel / โทร :</div><div class="qt-pv-iv">' + escHtml(_formatPhone(q.salesTel||'')) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="qt-pv-sep"></div>' +
    '<table class="qt-pv-table">' +
      '<thead><tr>' +
        '<th style="width:5%">No.</th>' +
        '<th style="width:15%">Product Code</th>' +
        '<th style="width:30%">Description<span>รายการ</span></th>' +
        '<th style="width:8%">Qty<span>จำนวน</span></th>' +
        '<th style="width:8%">Unit<span>หน่วย</span></th>' +
        '<th style="width:15%">Unit Price<span>ราคา/หน่วย</span></th>' +
        '<th style="width:15%">Amount<span>จำนวนเงิน</span></th>' +
      '</tr></thead>' +
      '<tbody>' + itemsHtml + '</tbody>' +
    '</table>' +
    '<div class="qt-pv-bottom-row">' +
      '<div class="qt-pv-pay-left">' +
        '<div class="pay-title"><b>Payment Terms:</b> เงื่อนไข ชำระเงิน:</div>' +
        '<div class="pay-option"><span class="pay-check"></span> เครดิต(Credit) .......วัน(Days.)</div>' +
        '<div class="pay-option"><span class="pay-check"></span> เงินสด หรือโอนชำระเข้าบัญชีบริษัทฯ (Cash or Bank Transfer to Company Account)</div>' +
        '<div class="pay-bank-info">บจก.นีโอไบโอเทค (ไทยแลนด์) (NeoBiotech (Thailand) Co., Ltd.)</div>' +
        '<div class="pay-bank-info">ธ.กสิกรไทย สาขา พระโขนง (Kasikornbank, Phra Khanong Branch)</div>' +
        '<div class="pay-bank-info pay-bank-bold">บัญชีออมทรัพย์ (Savings Account) เลขที่ (No.) 012-1-20295-6</div>' +
      '</div>' +
      '<div class="qt-pv-sum-right">' +
        '<table class="qt-pv-summary">' +
          '<tr><td class="lbl">Subtotal &nbsp;/&nbsp; รวมเงิน</td><td class="val">' + fmtN(pvBeforeVat) + '</td></tr>' +
          '<tr><td class="lbl">Discount &nbsp;/&nbsp; ส่วนลด</td><td class="val">' + fmtN(pvDiscount) + '</td></tr>' +
          '<tr><td class="lbl">After Discount &nbsp;/&nbsp; หลังหักส่วนลด</td><td class="val">' + fmtN(pvAfterDisc) + '</td></tr>' +
          '<tr><td class="lbl">Value before VAT &nbsp;/&nbsp; มูลค่าก่อนภาษีมูลค่าเพิ่ม</td><td class="val">' + fmtN(pvAfterDisc) + '</td></tr>' +
          '<tr><td class="lbl">VAT 7% &nbsp;/&nbsp; ภาษีมูลค่าเพิ่ม</td><td class="val">' + fmtN(pvVat) + '</td></tr>' +
          '<tr class="grand"><td class="lbl">GRAND TOTAL &nbsp;/&nbsp; จำนวนเงินทั้งสิ้น</td><td class="val">' + fmtN(grand) + '</td></tr>' +
        '</table>' +
      '</div>' +
    '</div>' +
    '<div class="qt-pv-remark"><div class="rm-lbl">Remark / หมายเหตุ</div><div class="rm-val">' + escHtml(q.notes||'') + '</div></div>' +
    '<div class="qt-pv-dark-bar"></div>' +
    '<div class="qt-pv-sign">' +
      '<div class="qt-pv-sign-col">' + (q.mgr_signature ? '<img class="sign-img" src="' + q.mgr_signature + '" />' : '') + '<div class="sign-line"></div><div class="sign-title">Sales Manager / ผู้จัดการฝ่ายขาย</div><div class="sign-date">Date / วันที่ : ' + (q.approved_at ? _fmtDDMMYYYY(new Date(q.approved_at)) : '___/___/______') + '</div></div>' +
      '<div class="qt-pv-sign-col">' + (q.rep_signature ? '<img class="sign-img" src="' + q.rep_signature + '" />' : '') + '<div class="sign-line"></div><div class="sign-title">Sales Representative / ตัวแทนฝ่ายขาย</div><div class="sign-date">Date / วันที่ : ' + (q.requested_at ? _fmtDDMMYYYY(new Date(q.requested_at)) : _fmtDDMMYYYY(new Date())) + '</div></div>' +
    '</div>' +
    '<div class="qt-pv-footer-bar">Thank you for your business &nbsp;|&nbsp; ขอบคุณที่ไว้วางใจเรา</div>' +
  '</div>';
}

function approveQuoteByIdx(idx) {
  var q = _quoteListRendered[idx];
  if (!q || !q.id) { showToast('ID 없음'); return; }

  // 등록된 서명이 있으면 자동 사용, 없으면 서명 팝업
  var savedSig = _getMySignature();
  if (savedSig) {
    if (!confirm(t('qt_confirm_approve'))) return;
    _doApproveWithSig(q, savedSig, idx);
  } else {
    openSigPad(function(sigDataUrl) {
      _doApproveWithSig(q, sigDataUrl, idx);
    });
  }
}

function _doApproveWithSig(q, sigDataUrl, idx) {
  // Quotation No. 자동 생성 후 승인
  var erp = q.erp || q.customer_erp || '';
  _generateQuoteDocNo(erp).then(function(docNo) {
    apiPost({ action: 'update_quote_status', id: q.id, status: 'done', docNo: docNo, mgr_signature: sigDataUrl, approved_at: new Date().toISOString() }).then(function(res) {
      if (res && res.status === 'ok') {
        showToast('✅ ' + t('qt_approved_ok'));
        updateQuoteBadge();
        openQuoteList(_quoteListFilter);
      } else {
        showToast('오류: ' + (res && res.message ? res.message : '서버 오류'));
      }
    }).catch(function() { showToast(t('msg_network_submit_fail')); });
  }).catch(function() { showToast('문서번호 생성 실패'); });
}

// ══════════════════════════════════════════════════════
// 전자 서명 패드 + 서명 등록
// ══════════════════════════════════════════════════════
var _sigCallback = null;
var _sigDrawing = false;
var _sigCtx = null;
var _sigHasStroke = false;

// 내 서명 저장/불러오기 (localStorage)
function _getSigKey() {
  var u = getCurrentUser();
  return u ? 'neo_sig_' + u.empid : 'neo_sig_guest';
}
function _getMySignature() {
  try { return localStorage.getItem(_getSigKey()) || ''; } catch(e) { return ''; }
}
function _saveMySignature(dataUrl) {
  try { localStorage.setItem(_getSigKey(), dataUrl); } catch(e) {}
}
function _removeMySignature() {
  try { localStorage.removeItem(_getSigKey()); } catch(e) {}
}

// 계정 설정에서 서명 등록
function openSigPadForRegister() {
  openSigPad(function(sigDataUrl) {
    _saveMySignature(sigDataUrl);
    _refreshSigPreview();
    showToast('✅ 서명이 등록되었습니다');
  });
}

function clearMySignature() {
  if (!confirm('등록된 서명을 삭제하시겠습니까?')) return;
  _removeMySignature();
  _refreshSigPreview();
  showToast('서명이 삭제되었습니다');
}

function _refreshSigPreview() {
  var sig = _getMySignature();
  var imgEl = document.getElementById('mySigImg');
  var emptyEl = document.getElementById('mySigEmpty');
  var clearBtn = document.getElementById('btnSigClear');
  if (sig) {
    if (imgEl) { imgEl.src = sig; imgEl.style.display = 'inline-block'; }
    if (emptyEl) emptyEl.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'inline-block';
  } else {
    if (imgEl) { imgEl.src = ''; imgEl.style.display = 'none'; }
    if (emptyEl) emptyEl.style.display = 'inline';
    if (clearBtn) clearBtn.style.display = 'none';
  }
}

// 회원가입 서명 캔버스
var _suSigDrawing = false;
var _suSigHasStroke = false;
var _suSigInited = false;
function clearSuSigCanvas() {
  var c = document.getElementById('suSigCanvas');
  if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); _suSigHasStroke = false; }
}
function getSuSignatureData() {
  if (!_suSigHasStroke) return '';
  var c = document.getElementById('suSigCanvas');
  return c ? c.toDataURL('image/png') : '';
}
function _initSuSigCanvas() {
  if (_suSigInited) return;
  var c = document.getElementById('suSigCanvas');
  if (!c || c.getBoundingClientRect().width === 0) return;
  _suSigInited = true;
  var ctx = c.getContext('2d');
  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  function getPos(e) {
    var rect = c.getBoundingClientRect();
    var sx = c.width / rect.width, sy = c.height / rect.height;
    if (e.touches && e.touches.length) return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }
  c.addEventListener('mousedown', function(e) { _suSigDrawing = true; _suSigHasStroke = true; var p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  c.addEventListener('mousemove', function(e) { if (!_suSigDrawing) return; var p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  c.addEventListener('mouseup', function() { _suSigDrawing = false; });
  c.addEventListener('mouseleave', function() { _suSigDrawing = false; });
  c.addEventListener('touchstart', function(e) { e.preventDefault(); _suSigDrawing = true; _suSigHasStroke = true; var p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
  c.addEventListener('touchmove', function(e) { e.preventDefault(); if (!_suSigDrawing) return; var p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
  c.addEventListener('touchend', function() { _suSigDrawing = false; });
}

// 서명 패드 공통
function openSigPad(callback) {
  _sigCallback = callback;
  _sigHasStroke = false;
  var overlay = document.getElementById('sigOverlay');
  overlay.classList.add('open');
  var canvas = document.getElementById('sigCanvas');
  _sigCtx = canvas.getContext('2d');
  _sigCtx.clearRect(0, 0, canvas.width, canvas.height);
  _sigCtx.strokeStyle = '#1e293b';
  _sigCtx.lineWidth = 2.5;
  _sigCtx.lineCap = 'round';
  _sigCtx.lineJoin = 'round';
}

function closeSigPad() {
  document.getElementById('sigOverlay').classList.remove('open');
  _sigCallback = null;
}

function clearSigPad() {
  var canvas = document.getElementById('sigCanvas');
  _sigCtx.clearRect(0, 0, canvas.width, canvas.height);
  _sigHasStroke = false;
}

function confirmSignature() {
  if (!_sigHasStroke) { showToast('서명을 입력해주세요'); return; }
  var canvas = document.getElementById('sigCanvas');
  var dataUrl = canvas.toDataURL('image/png');
  var cb = _sigCallback;
  closeSigPad();
  if (cb) cb(dataUrl);
}

// Canvas 서명 이벤트
(function() {
  function getPos(canvas, e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    if (e.touches && e.touches.length) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }
  document.addEventListener('DOMContentLoaded', function() {
    var canvas = document.getElementById('sigCanvas');
    if (!canvas) return;
    canvas.addEventListener('mousedown', function(e) { startDraw(canvas, e); });
    canvas.addEventListener('mousemove', function(e) { moveDraw(canvas, e); });
    canvas.addEventListener('mouseup', function() { _sigDrawing = false; });
    canvas.addEventListener('mouseleave', function() { _sigDrawing = false; });
    canvas.addEventListener('touchstart', function(e) { e.preventDefault(); startDraw(canvas, e); }, { passive: false });
    canvas.addEventListener('touchmove', function(e) { e.preventDefault(); moveDraw(canvas, e); }, { passive: false });
    canvas.addEventListener('touchend', function() { _sigDrawing = false; });
    // 계정 설정 열릴 때 서명 미리보기 갱신
    _refreshSigPreview();
  });
  function startDraw(canvas, e) {
    _sigDrawing = true;
    _sigHasStroke = true;
    var ctx = canvas.getContext('2d');
    var p = getPos(canvas, e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function moveDraw(canvas, e) {
    if (!_sigDrawing) return;
    var ctx = canvas.getContext('2d');
    var p = getPos(canvas, e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
})();

function cancelQuoteByIdx(idx) {
  var q = _quoteListRendered[idx];
  if (!q || !q.id) { showToast('ID 없음'); return; }
  if (!confirm(t('qt_confirm_cancel'))) return;
  apiPost({ action: 'update_quote_status', id: q.id, status: 'cancelled' }).then(function(res) {
    if (res && res.status === 'ok') {
      showToast('🗑 ' + t('qt_cancelled_ok'));
      updateQuoteBadge();
      openQuoteList(_quoteListFilter);
    } else {
      showToast('오류: ' + (res && res.message ? res.message : '서버 오류'));
    }
  }).catch(function() { showToast(t('msg_network_submit_fail')); });
}

async function deleteQuoteByIdx(idx) {
  var q = _quoteListRendered[idx];
  if (!q || !q.id) { showToast('ID 없음'); return; }
  if (!confirm(t('qt_delete_confirm') || '이 견적을 삭제하시겠습니까?')) return;
  try {
    await _fbDb.collection('quotes').doc(q.id).delete();
    showToast('🗑️ ' + (t('qt_deleted_ok') || '삭제되었습니다.'));
    updateQuoteBadge();
    openQuoteList(_quoteListFilter);
  } catch(e) {
    showToast('❌ ' + (t('qt_delete_fail') || '삭제 실패'));
  }
}

function openLoadPrevQuote(erpFilter) {
  var body = document.getElementById('prevQtBody');
  body.innerHTML = '<div class="prev-qt-empty">⏳ ' + t('pending_loading') + '</div>';
  document.getElementById('prevQtOverlay').classList.add('open');
  window._prevQtSelectedIdx = -1;
  window._prevQtErpFilter = erpFilter || '';
  loadQuoteList(function() {
    _renderPrevQuoteTable(body);
  });
}

function _renderPrevQuoteTable(body) {
  var user = getCurrentUser();
  var myId = user ? user.empid : '';
  var erpF = window._prevQtErpFilter || '';
  var list = _quoteListCache.filter(function(q) {
    if (q.requested_by !== myId) return false;
    if (erpF && String(q.erp || q.customer_erp || '') !== String(erpF)) return false;
    return true;
  }).sort(function(a, b) { return new Date(b.date || 0) - new Date(a.date || 0); }).slice(0, 30);

  // 필터 탭 (고객 필터 걸린 경우 전체 보기 옵션 제공)
  var filterHtml = '';
  if (erpF) {
    filterHtml = '<div style="padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #e5e7eb;background:#faf5ff;">' +
      '<span style="font-size:12px;color:#6b7280;">🔍 ' + t('ql_prev_cust_filter') + ' <b style="color:#7c3aed;">[' + escHtml(erpF) + ']</b> ' + t('ql_prev_cust_quote') + '</span>' +
      '<button onclick="window._prevQtErpFilter=\'\';_renderPrevQuoteTable(document.getElementById(\'prevQtBody\'))" ' +
      'style="margin-left:auto;background:none;border:1px solid #d1d5db;border-radius:6px;padding:3px 10px;font-size:11px;color:#6b7280;cursor:pointer;">' + t('ql_prev_view_all') + '</button></div>';
  }

  if (!list.length) {
    body.innerHTML = filterHtml + '<div class="prev-qt-empty">' + (erpF ? t('ql_prev_no_cust_quote') : t('qt_no_prev')) + '</div>';
    return;
  }
  var html = filterHtml + '<table class="prev-qt-tbl"><thead><tr>' +
    '<th>#</th><th>' + t('ql_prev_th_date') + '</th><th class="pqt-col-item">' + t('ql_prev_th_item') + '</th><th>' + t('ql_prev_th_count') + '</th><th style="text-align:right">' + t('ql_prev_th_price') + '</th><th>' + t('ql_prev_th_memo') + '</th><th></th>' +
    '</tr></thead><tbody>';
  list.forEach(function(q, i) {
    var items = [];
    try { items = typeof q.items === 'string' ? JSON.parse(q.items) : (q.items || []); } catch(e) {}
    var itemNames = items.map(function(it) { return it.name || it.model || ''; }).filter(Boolean).join(', ');
    var itemCount = items.filter(function(it) { return it.name || it.model; }).length;
    var total = q.request_total || q.total || 0;
    var dateStr = q.date ? new Date(q.date).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'.') : '';
    var memo = q.notes || '';
    html += '<tr class="pqt-row" data-pqi="'+i+'" onclick="highlightPrevQuote('+i+')" ondblclick="selectPrevQuote('+i+')">' +
      '<td style="text-align:center;color:#9ca3af;font-size:11px;">' + (i+1) + '</td>' +
      '<td style="white-space:nowrap">' + escHtml(dateStr) + '</td>' +
      '<td class="pqt-col-item pqt-items" title="' + escHtml(itemNames) + '">' + escHtml(itemNames || '-') + '</td>' +
      '<td style="text-align:center">' + itemCount + '</td>' +
      '<td class="pqt-price">' + (total ? '฿' + Number(total).toLocaleString() : '-') + '</td>' +
      '<td class="pqt-memo" title="' + escHtml(memo) + '">' + escHtml(memo || '-') + '</td>' +
      '<td><button class="pqt-load-btn" onclick="event.stopPropagation();selectPrevQuote('+i+')">로드</button></td>' +
      '</tr>';
  });
  html += '</tbody></table>';
  body.innerHTML = html;
  window._prevQtList = list;
}

function highlightPrevQuote(idx) {
  window._prevQtSelectedIdx = idx;
  var rows = document.querySelectorAll('.pqt-row');
  rows.forEach(function(r) { r.classList.toggle('pqt-active', parseInt(r.getAttribute('data-pqi')) === idx); });
}

function closePrevQuote() {
  document.getElementById('prevQtOverlay').classList.remove('open');
}

function selectPrevQuote(idx) {
  var q = (window._prevQtList || [])[idx];
  if (!q) return;
  highlightPrevQuote(idx);
  var items = [];
  try { items = typeof q.items === 'string' ? JSON.parse(q.items) : (q.items || []); } catch(e) {}
  var qErp = q.erp || q.customer_erp || '';
  quoteCustomer = { erp: qErp, name: q.customer || q.customer_name || '', clinic: q.clinic || q.customer_clinic || '' };
  quoteItems = items.length ? items.map(function(it) {
    return { name: it.name||it.model||'', spec: it.spec||'', qty: it.qty||1, price: it.price||0 };
  }) : [{ name:'', spec:'', qty:1, price:0 }];
  document.getElementById('quoteCustInput').value = '';
  document.getElementById('quoteAcList').classList.remove('open');
  var selCard = document.getElementById('quoteSelCard');
  selCard.classList.add('show');
  document.getElementById('quoteSelErp').textContent = qErp ? '['+qErp+']' : '';
  document.getElementById('quoteSelName').textContent = quoteCustomer.name;
  document.getElementById('quoteSelNameTh').textContent = '';
  document.getElementById('quoteCustWrap').style.display = 'none';
  document.getElementById('quoteNotes').value = q.notes || '';
  window._quoteEditId = null;
  renderQuoteItems();
  _qtUpdateItemsLock();
  closePrevQuote();
  showToast(t('qt_loaded'));
}

function editQuoteByIdx(idx) {
  var q = _quoteListRendered[idx];
  if (!q) return;
  var items = [];
  try { items = typeof q.items === 'string' ? JSON.parse(q.items) : (q.items || []); } catch(e) {}
  // 견적 요청 폼에 데이터 로드
  closeQuoteList();
  var qErp2 = q.erp || q.customer_erp || '';
  quoteCustomer = { erp: qErp2, name: q.customer || q.customer_name || '', clinic: q.clinic || q.customer_clinic || '' };
  quoteItems = items.length ? items.map(function(it) {
    return { name: it.name||it.model||'', spec: it.spec||'', qty: it.qty||1, price: it.price||0 };
  }) : [{ name:'', spec:'', qty:1, price:0 }];
  document.getElementById('quoteCustInput').value = '';
  document.getElementById('quoteAcList').classList.remove('open');
  var selCard = document.getElementById('quoteSelCard');
  selCard.classList.add('show');
  document.getElementById('quoteSelErp').textContent = qErp2 ? '['+qErp2+']' : '';
  document.getElementById('quoteSelName').textContent = quoteCustomer.name;
  document.getElementById('quoteSelNameTh').textContent = '';
  document.getElementById('quoteCustWrap').style.display = 'none';
  document.getElementById('quoteNotes').value = q.notes || '';
  document.getElementById('quoteBtnSubmit').disabled = false;
  // 수정 모드 표시 — 제출 시 기존 ID 업데이트
  window._quoteEditId = q.id || null;
  renderQuoteItems();
  _qtUpdateItemsLock();
  document.getElementById('quoteOverlay').classList.add('open');
  _bringToFront(document.getElementById('quoteOverlay'));
}

function filterCat(btn, cat) {
  orderCurrentCat = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  orderSelectedItem = null;
  document.getElementById('itemSearchInput').value = '';
  var _siw=document.getElementById('selItemWrap'); if(_siw) _siw.style.display='none';
  document.getElementById('itemAcList').classList.remove('open');
}

// ── 카테고리 메가메뉴 ──
var _catTreePath = [];
var _catTreeManual = false;

// ── 아이템 검색 공용 헬퍼 (규격 포함, x/*/공백 호환) ──
function _itemSearchMatch(item, query) {
  if (!query) return true;
  var q = query.trim().toLowerCase().replace(/x/gi, '*');
  var keywords = q.split(/[\s*]+/).filter(Boolean);
  var hay = ((item.model || '') + ' ' + (item.no || '') + ' ' + (item.name || '') + ' ' + (item.spec || '')).toLowerCase().replace(/x/g, '*');
  // Ø제거, mm제거 등 특수문자 정규화
  var hayNorm = hay.replace(/[øØ]/g, '').replace(/mm/g, ' ');
  return keywords.every(function(kw) {
    return hay.includes(kw) || hayNorm.includes(kw);
  });
}

// 카테고리 필터 매칭 함수
function _matchTreeFilter(i, f) {
  // Others(기타): 다른 모든 Single 카테고리에 해당하지 않는 것
  if (f.cat === '_others_') {
    var clsUp = (i.cls || '').toUpperCase();
    var nameUp = (i.name || '').toUpperCase();
    var allUp = clsUp + ' ' + nameUp;
    if (allUp.indexOf('FIXTURE') > -1 && allUp.indexOf('KIT') === -1) return false;
    if (allUp.indexOf('ABUTMENT') > -1) return false;
    if (allUp.indexOf('HEALING') > -1) return false;
    if (allUp.indexOf('COPING') > -1) return false;
    if (allUp.indexOf('SCREW') > -1) return false;
    if (allUp.indexOf('KIT') > -1) return false;
    if (allUp.indexOf('KERATOR') > -1) return false;
    if (allUp.indexOf('MEMBRANE') > -1) return false;
    if (clsUp.indexOf('PANO') > -1) return false;
    return true;
  }
  if (f.cat && f.cat !== '_others_' && i.cat !== f.cat) return false;
  if (f.cls && i.cls !== f.cls) return false;
  if (f.clsMatch) {
    var target = (i.cls || '').toUpperCase();
    if (target.indexOf(f.clsMatch.toUpperCase()) === -1) return false;
  }
  if (f.clsMatchAny) {
    var tgt = (i.cls || '').toUpperCase();
    var anyMatch = f.clsMatchAny.some(function(kw) { return tgt.indexOf(kw.toUpperCase()) > -1; });
    if (!anyMatch) return false;
  }
  if (f.clsExclude) {
    var excArr = Array.isArray(f.clsExclude) ? f.clsExclude : [f.clsExclude];
    var cUp = (i.cls || '').toUpperCase();
    for (var e = 0; e < excArr.length; e++) {
      if (cUp.indexOf(excArr[e].toUpperCase()) > -1) return false;
    }
  }
  if (f.modelPrefixes) {
    var mdl = (i.model || '').toUpperCase();
    var anyPfxMatch = f.modelPrefixes.some(function(px) {
      var pu = px.toUpperCase();
      if (!mdl.startsWith(pu)) return false;
      var nc = mdl.charAt(pu.length);
      if (nc && nc >= 'A' && nc <= 'Z') return false;
      return true;
    });
    if (!anyPfxMatch) return false;
  }
  if (f.modelPrefix) {
    var mdl = (i.model || '').toUpperCase();
    var pfx = f.modelPrefix.toUpperCase();
    if (!mdl.startsWith(pfx)) return false;
    var nextChar = mdl.charAt(pfx.length);
    if (nextChar && nextChar >= 'A' && nextChar <= 'Z') return false;
  }
  return true;
}

// ── 제품군 하위 그룹 (모델명 접두어 기반) 동적 빌드 ──
function _buildCatChildren(baseFilter, keyPrefix) {
  var matched = ITEM_DATA.filter(function(d) { return _matchTreeFilter(d, baseFilter); });
  if (matched.length < 2) return [];

  // 1차: 알파벳 접두어 그룹
  var fullPfxMap = {};
  matched.forEach(function(d) {
    var m = (d.model || '').match(/^([A-Za-z]+)/);
    if (m) {
      var p = m[1].toUpperCase();
      if (!fullPfxMap[p]) fullPfxMap[p] = [];
      fullPfxMap[p].push(d);
    }
  });

  // 소규모 그룹(3개 이하)을 공통 2글자 접두어로 병합
  var MIN_GROUP = 3;
  var shortGroups = {}; // 2글자 접두어 → [원래 접두어들]
  var bigGroups = {};   // 큰 그룹 그대로
  Object.keys(fullPfxMap).sort().forEach(function(pfx) {
    if (fullPfxMap[pfx].length > MIN_GROUP) {
      bigGroups[pfx] = fullPfxMap[pfx];
    } else {
      var short = pfx.substring(0, 2);
      if (!shortGroups[short]) shortGroups[short] = [];
      shortGroups[short].push(pfx);
    }
  });

  // 병합: short 그룹의 합산이 MIN_GROUP 초과면 병합, 아니면 개별 유지
  var finalGroups = []; // { label, prefixes:[], items:[] }
  Object.keys(bigGroups).sort().forEach(function(pfx) {
    finalGroups.push({ label: pfx, prefixes: [pfx], items: bigGroups[pfx] });
  });
  Object.keys(shortGroups).sort().forEach(function(short) {
    var pfxArr = shortGroups[short];
    var allItems = [];
    pfxArr.forEach(function(p) { allItems = allItems.concat(fullPfxMap[p]); });
    if (pfxArr.length > 1 && allItems.length > MIN_GROUP) {
      // 병합된 그룹
      finalGroups.push({ label: short + '..', prefixes: pfxArr, items: allItems });
    } else {
      // 개별 유지
      pfxArr.forEach(function(p) {
        finalGroups.push({ label: p, prefixes: [p], items: fullPfxMap[p] });
      });
    }
  });

  // label 정렬 (짧은 접두어 우선: IS → BIS)
  finalGroups.sort(function(a, b) {
    if (b.label.indexOf(a.label) >= 0 && a.label !== b.label) return -1;
    if (a.label.indexOf(b.label) >= 0 && a.label !== b.label) return 1;
    return a.label.localeCompare(b.label);
  });

  if (finalGroups.length <= 1) {
    if (finalGroups.length === 1) {
      var subs = _buildSubGroups(finalGroups[0].items, baseFilter, keyPrefix);
      return subs.length > 1 ? subs : [];
    }
    return [];
  }

  var children = [];
  finalGroups.forEach(function(g) {
    var gFilter;
    if (g.prefixes.length === 1) {
      gFilter = Object.assign({}, baseFilter, { modelPrefix: g.prefixes[0] });
    } else {
      gFilter = Object.assign({}, baseFilter, { modelPrefixes: g.prefixes });
    }
    var subChildren = _buildSubGroups(g.items, baseFilter, keyPrefix);
    children.push({
      key: keyPrefix + '_' + g.prefixes[0], label: g.label + ' (' + g.items.length + ')',
      filter: gFilter,
      children: subChildren.length > 1 ? subChildren : []
    });
  });
  return children;
}

function _buildSubGroups(items, baseFilter, keyPrefix) {
  var subMap = {};
  items.forEach(function(d) {
    var m2 = d.model.match(/^([A-Za-z]+\d{2})/) || d.model.match(/^([A-Za-z]+\d[A-Za-z]+)/);
    if (m2) {
      var sk = m2[1].toUpperCase();
      if (!subMap[sk]) subMap[sk] = 0;
      subMap[sk]++;
    }
  });
  var subChildren = [];
  Object.keys(subMap).sort().forEach(function(sk) {
    subChildren.push({
      key: keyPrefix + '_' + sk, label: sk + ' (' + subMap[sk] + ')',
      filter: Object.assign({}, baseFilter, { modelPrefix: sk })
    });
  });
  return subChildren;
}

function _buildSingleCat(key, label, filter) {
  var children = _buildCatChildren(filter, key.toLowerCase());
  var cat = { key: key, label: label, filter: filter };
  if (children.length > 0) cat.children = children;
  return cat;
}

var _SINGLE_CATS = [
  _buildSingleCat('Fixture',    'Fixture',           { clsMatch:'Fixture', clsExclude:['Kit'] }),
  _buildSingleCat('Abutment',   'Abutment',          { clsMatch:'Abutment', clsExclude:['Healing','Fixture'] }),
  _buildSingleCat('HealingAbt', 'Healing Abutment',  { clsMatch:'Healing' }),
  _buildSingleCat('Coping',     'Coping',            { clsMatch:'Coping' }),
  _buildSingleCat('Screw',      'Screw',             { clsMatch:'Screw' }),
  _buildSingleCat('Kit',        'Kit',               { clsMatch:'Kit' }),
  _buildSingleCat('Kerator',    'Kerator',           { clsMatch:'KERATOR' }),
  _buildSingleCat('Membrane',   'Membrane',          { clsMatch:'Membrane' })
];

// 패키지 구성용 카테고리 (Fixture, Abutment, Healing, Coping, Screw, Kit만)
var _PKG_CATS = [
  { key:'Fixture',     label:'Fixture',           filter:{ clsMatch:'Fixture', clsExclude:['Kit'] } },
  { key:'Abutment',    label:'Abutment',          filter:{ clsMatch:'Abutment', clsExclude:['Healing','Fixture'] } },
  { key:'HealingAbt',  label:'Healing Abutment',  filter:{ clsMatch:'Healing' } },
  { key:'Coping',      label:'Coping',            filter:{ clsMatch:'Coping' } },
  { key:'Screw',       label:'Screw',             filter:{ clsMatch:'Screw' } },
  { key:'Kit',         label:'Kit',               filter:{ clsMatch:'Kit' } }
];
function _buildPkgChildren(pkg) {
  return _PKG_CATS.map(function(c) {
    var f = Object.assign({}, c.filter, { pkg: pkg });
    return { key: c.key, label: c.label, filter: f };
  });
}
var CAT_TREE = [
  _buildSingleCat('Fixture',    'Fixture',           { clsMatch:'Fixture', clsExclude:['Kit'] }),
  _buildSingleCat('Abutment',   'Abutment',          { clsMatch:'Abutment', clsExclude:['Healing','Fixture'] }),
  _buildSingleCat('HealingAbt', 'Healing Abutment',  { clsMatch:'Healing' }),
  _buildSingleCat('Coping',     'Coping',            { clsMatch:'Coping' }),
  _buildSingleCat('Screw',      'Screw',             { clsMatch:'Screw' }),
  _buildSingleCat('Kit',        'Kit',               { clsMatch:'Kit' }),
  _buildSingleCat('Kerator',    'Kerator',           { clsMatch:'KERATOR' }),
  _buildSingleCat('Membrane',   'Membrane',          { clsMatch:'Membrane' }),
  { key:'package', label:'Package', children:[
    { key:'s10',  label:'10 Sets',  children: _buildPkgChildren(10) },
    { key:'s20',  label:'20 Sets',  children: _buildPkgChildren(20) },
    { key:'s30',  label:'30 Sets',  children: _buildPkgChildren(30) },
    { key:'s50',  label:'50 Sets',  children: _buildPkgChildren(50) },
    { key:'s100', label:'100 Sets', children: _buildPkgChildren(100) },
    { key:'manual', label:'✏️ Manual Input', isManual:true }
  ]},
  { key:'CT', label:'CT', filter:{ clsMatch:'Pano' } },
  { key:'etc', label:'Others', filter:{ cat:'_others_' }, isManual:true }
];

function toggleCatMega() {
  var mega = document.getElementById('catMega');
  var toggle = document.getElementById('catToggle');
  var isOpen = mega.classList.contains('open');
  if (isOpen) {
    mega.classList.remove('open');
    toggle.classList.remove('open');
  } else {
    _renderMegaLevel(1, CAT_TREE);
    mega.classList.add('open');
    toggle.classList.add('open');
  }
}

function _closeCatMega() {
  document.getElementById('catMega').classList.remove('open');
  document.getElementById('catToggle').classList.remove('open');
}

function _renderMegaLevel(lv, items) {
  var col = document.getElementById('catMegaLv' + lv);
  if (!col) return;
  var html = '';
  items.forEach(function(item) {
    var hasChild = item.children && item.children.length;
    var cls = item.isManual ? ' manual' : '';
    var arrow = hasChild ? '<span class="arrow-r">›</span>' : '';
    var displayLabel = item.labelKey ? t(item.labelKey) : item.label;
    html += '<div class="cat-mega-item' + cls + '" data-key="' + item.key + '" onmouseenter="catMegaHover(' + lv + ',this,\'' + item.key + '\')" onclick="catMegaClick(' + lv + ',\'' + item.key + '\')">' + displayLabel + arrow + '</div>';
  });
  col.innerHTML = html;
  col.style.display = '';
  // 하위 컬럼 숨기기
  for (var l = lv + 1; l <= 6; l++) {
    var c = document.getElementById('catMegaLv' + l);
    if (c) { c.innerHTML = ''; c.style.display = 'none'; }
  }
}

function catMegaHover(lv, el, key) {
  // active 표시
  var col = document.getElementById('catMegaLv' + lv);
  col.querySelectorAll('.cat-mega-item').forEach(function(it) { it.classList.remove('active'); });
  el.classList.add('active');
  // 경로 업데이트
  _catTreePath = _catTreePath.slice(0, lv - 1);
  _catTreePath.push(key);
  // 하위 컬럼 숨기기
  for (var l = lv + 1; l <= 6; l++) {
    var c = document.getElementById('catMegaLv' + l);
    if (c) { c.innerHTML = ''; c.style.display = 'none'; }
  }
  // 하위 렌더 (패키지 세트는 하위메뉴 생략 — 클릭 시 빌더 직접 열림)
  var node = _getCatNodeArr(_catTreePath);
  if (node && node.children && node.children.length) {
    var isPkgSet = _catTreePath.indexOf('package') !== -1 && node.children[0] && node.children[0].filter;
    if (!isPkgSet) {
      var renderChildren = node.children;
      // filter+children 노드 → "전체" 항목 추가
      if (node.filter) {
        var allLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
        var allCount = ITEM_DATA.filter(function(i) { return _matchTreeFilter(i, node.filter); }).length;
        var allItem = { key: node.key + '_ALL', label: '📋 ' + allLabel + ' ' + t('cat_all') + ' (' + allCount + ')', filter: Object.assign({}, node.filter) };
        renderChildren = [allItem].concat(node.children);
      }
      _renderMegaLevel(lv + 1, renderChildren);
    }
  }
  // 말단 필터 노드 → 아이템 리스트 표시
  if (node && node.filter && (!node.children || !node.children.length)) {
    if (window.innerWidth <= 1024) {
      var displayLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
      openMobItemSlide(displayLabel, node.filter, 'order');
    } else {
      _renderMegaItemList(lv + 1, node);
    }
  }
}

function _renderMegaItemList(lv, node) {
  var col = document.getElementById('catMegaLv' + lv);
  if (!col) {
    // 동적으로 컬럼 생성
    col = document.createElement('div');
    col.className = 'cat-mega-lv cat-mega-items';
    col.id = 'catMegaLv' + lv;
    document.getElementById('catMega').appendChild(col);
  }
  col.classList.add('cat-mega-items');
  var items = ITEM_DATA.filter(function(i) { return _matchTreeFilter(i, node.filter); });
  items.sort(function(a, b) { return (a.model || '').localeCompare(b.model || ''); });
  var displayLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
  window._cmiItems = items;
  window._cmiLv = lv;
  var html = '<div class="cmi-title">' + displayLabel + ' — ' + items.length + '</div>';
  html += '<div class="cmi-search-wrap"><input type="text" class="cmi-search" placeholder="🔍 Search..." onclick="event.stopPropagation()" oninput="event.stopPropagation();_cmiFilterItems(this.value)"></div>';
  html += '<div id="cmiItemsBody">';
  html += _buildCmiRows(items);
  html += '</div>';
  col.innerHTML = html;
  col.style.display = '';
  // 이후 컬럼 숨기기
  for (var l = lv + 1; l <= 6; l++) {
    var c = document.getElementById('catMegaLv' + l);
    if (c) { c.innerHTML = ''; c.style.display = 'none'; }
  }
}

function catMegaAddItem(globalIdx) {
  var item = ITEM_DATA[globalIdx];
  if (!item) return;
  var qtyInput = document.getElementById('cmiq_' + globalIdx);
  var qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
  if (qty < 1) qty = 1;
  // 중복 체크
  var isDup = orderItems.some(function(o) { return o.item.model === item.model && o.item.no === item.no; });
  if (isDup) { showToast(t('msg_dup_item')); return; }
  var price = _getItemPrice(item);
  var retail = price.retail || 0;
  orderItems.push({ item: Object.assign({}, item), qty: qty, _price: retail });
  renderOrderItems();
  document.getElementById('submitOrderBtn').disabled = !orderItems.length;
  showToast((item.model || '') + ' ' + t('settle_add_btn') + ' ✓');
  // 버튼 상태 업데이트
  var row = document.getElementById('cmi_' + globalIdx);
  if (row) {
    var btn = row.querySelector('.cmi-add');
    if (btn) {
      var span = document.createElement('span');
      span.className = 'cmi-added';
      span.textContent = '✓';
      btn.replaceWith(span);
    }
  }
}

function _buildCmiRows(items) {
  var html = '';
  items.forEach(function(it) {
    var gIdx = ITEM_DATA.indexOf(it);
    var isAdded = orderItems.some(function(o) { return o.item.model === it.model && o.item.no === it.no; });
    html += '<div class="cmi-row" id="cmi_' + gIdx + '">';
    html += '<div class="cmi-info"><div class="cmi-model">' + (it.model || '') + '</div>';
    html += '<div class="cmi-spec">' + (it.spec || it.name || '') + '</div></div>';
    html += '<div class="cmi-qty-wrap">' +
      '<button class="cmi-qty-btn" onclick="event.stopPropagation();_cmiQtyChange(' + gIdx + ',-1)">−</button>' +
      '<input type="number" class="cmi-qty-val" id="cmiq_' + gIdx + '" value="1" min="1" onclick="event.stopPropagation()" onchange="event.stopPropagation()">' +
      '<button class="cmi-qty-btn" onclick="event.stopPropagation();_cmiQtyChange(' + gIdx + ',1)">+</button>' +
    '</div>';
    if (isAdded) {
      html += '<span class="cmi-added">✓</span>';
    } else {
      html += '<button class="cmi-add" onclick="event.stopPropagation();catMegaAddItem(' + gIdx + ')">ADD</button>';
    }
    html += '</div>';
  });
  return html;
}

function _cmiFilterItems(query) {
  var q = (query || '').trim().toUpperCase();
  var body = document.getElementById('cmiItemsBody');
  if (!body || !window._cmiItems) return;
  var filtered = window._cmiItems;
  if (q) {
    filtered = filtered.filter(function(it) {
      return ((it.model || '').toUpperCase().indexOf(q) > -1) || ((it.spec || it.name || '').toUpperCase().indexOf(q) > -1);
    });
  }
  body.innerHTML = _buildCmiRows(filtered);
}

function _cmiQtyChange(gIdx, delta) {
  var inp = document.getElementById('cmiq_' + gIdx);
  if (!inp) return;
  var v = parseInt(inp.value) || 1;
  v += delta;
  if (v < 1) v = 1;
  inp.value = v;
}

function catMegaClick(lv, key) {
  _catTreePath = _catTreePath.slice(0, lv - 1);
  _catTreePath.push(key);
  var node = _getCatNodeArr(_catTreePath);
  if (!node) return;

  // 직접 입력 모드
  if (node.isManual) {
    _catTreeManual = true;
    orderCurrentCat = '_MANUAL_';
    _updateCatBadge();
    _closeCatMega();
    _clearItemSelection();
    return;
  }

  // 모바일: 하위가 있으면 터치로 하위 컬럼 펼침 (hover 대체)
  if (window.innerWidth <= 1024 && node.children && node.children.length) {
    var isPkgSet = _catTreePath.indexOf('package') !== -1 && node.children[0] && node.children[0].filter;
    if (!isPkgSet) {
      var col = document.getElementById('catMegaLv' + lv);
      if (col) {
        col.querySelectorAll('.cat-mega-item').forEach(function(it) { it.classList.remove('active'); });
        var el = col.querySelector('[data-key="' + key + '"]');
        if (el) el.classList.add('active');
      }
      for (var l = lv + 1; l <= 6; l++) {
        var c = document.getElementById('catMegaLv' + l);
        if (c) { c.innerHTML = ''; c.style.display = 'none'; }
      }
      var renderChildren = node.children;
      if (node.filter) {
        var allLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
        var allCount = ITEM_DATA.filter(function(i) { return _matchTreeFilter(i, node.filter); }).length;
        var allItem = { key: node.key + '_ALL', label: '📋 ' + allLabel + ' ' + t('cat_all') + ' (' + allCount + ')', filter: Object.assign({}, node.filter) };
        renderChildren = [allItem].concat(node.children);
      }
      _renderMegaLevel(lv + 1, renderChildren);
      return;
    }
  }

  // filter + children 둘 다 있으면 → 하위 레벨 펼침 (데스크탑 hover 보조)
  if (node.filter && node.children && node.children.length) {
    _renderMegaLevel(lv + 1, node.children);
    return;
  }

  // 모바일: 말단 필터 → 슬라이드 오버레이
  if (window.innerWidth <= 1024 && node.filter && (!node.children || !node.children.length)) {
    var displayLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
    openMobItemSlide(displayLabel, node.filter, 'order');
    return;
  }

  // 말단 노드 (filter 있음) - 데스크탑
  if (node.filter) {
    _catTreeManual = false;
    window._catTreeFilter = node.filter;
    orderCurrentCat = '_TREE_';
    _updateCatBadge();
    _closeCatMega();
    _clearItemSelection();
    return;
  }

  // 패키지 세트 선택 → 패키지 빌더 열기
  if (_catTreePath.indexOf('package') !== -1 && node.children && node.children.length && node.children[0].filter) {
    _closeCatMega();
    _updateCatBadge();
    _pkgBuilderMode = 'order';
    openPkgBuilder(node);
    return;
  }

  // 하위가 있으면 그냥 펼침 (호버로 이미 처리됨)
  if (node.children && node.children.length) {
    // 상위 선택으로 필터
    _catTreeManual = false;
    var filters = [];
    _collectFilters2(node, filters);
    window._catTreeFilters = filters;
    orderCurrentCat = '_TREE_MULTI_';
    _updateCatBadge();
    _closeCatMega();
    _clearItemSelection();
  }
}

function _getCatNodeArr(path) {
  var items = CAT_TREE;
  var node = null;
  for (var i = 0; i < path.length; i++) {
    var pk = path[i];
    // _ALL 키 처리: 부모 노드의 filter를 가진 가상 노드 반환
    if (pk.endsWith('_ALL') && node && node.filter) {
      var allLabel = (node.labelKey ? t(node.labelKey) : node.label).replace(/\s*\(\d+\)/, '');
      return { key: pk, label: '📋 ' + allLabel + ' ' + t('cat_all'), filter: Object.assign({}, node.filter) };
    }
    node = items.find(function(it) { return it.key === pk; });
    if (!node) return null;
    items = node.children || [];
  }
  return node;
}

function _collectFilters2(node, arr) {
  if (node.filter) arr.push(node.filter);
  if (node.children) {
    node.children.forEach(function(child) { _collectFilters2(child, arr); });
  }
}

function _updateCatBadge() {
  var badge = document.getElementById('catSelBadge');
  var text = document.getElementById('catSelText');
  var searchTag = document.getElementById('itemSearchCatTag');
  var searchInput = document.getElementById('itemSearchInput');
  if (!_catTreePath.length || orderCurrentCat === 'ALL') {
    badge.style.display = 'none';
    if (searchTag) searchTag.style.display = 'none';
    if (searchInput) searchInput.style.paddingLeft = '';
    return;
  }
  var labels = [];
  var items = CAT_TREE;
  for (var i = 0; i < _catTreePath.length; i++) {
    var n = items.find(function(it) { return it.key === _catTreePath[i]; });
    if (!n) break;
    labels.push(n.labelKey ? t(n.labelKey) : n.label);
    items = n.children || [];
  }
  var fullLabel = labels.join(' › ');
  text.textContent = fullLabel;
  badge.style.display = 'inline-flex';
  // 서치바에 카테고리 태그 표시
  if (searchTag) {
    var shortLabel = labels[labels.length - 1] || fullLabel;
    searchTag.textContent = shortLabel;
    searchTag.style.display = '';
    // 태그 폭만큼 input padding 조절
    setTimeout(function() {
      if (searchTag.offsetWidth) {
        searchInput.style.paddingLeft = (searchTag.offsetWidth + 16) + 'px';
      }
    }, 10);
  }
}

function _clearItemSelection() {
  orderSelectedItem = null;
  document.getElementById('itemSearchInput').value = '';
  var _siw=document.getElementById('selItemWrap'); if(_siw) _siw.style.display='none';
  document.getElementById('itemAcList').classList.remove('open');
  _toggleSearchClear();
}

function _toggleSearchClear() {
  var inp = document.getElementById('itemSearchInput');
  var btn = document.getElementById('itemSearchClear');
  if (btn) btn.style.display = (inp && inp.value.length > 0) ? '' : 'none';
}

function _clearItemSearch() {
  document.getElementById('itemSearchInput').value = '';
  document.getElementById('itemAcList').classList.remove('open');
  orderSelectedItem = null;
  var _siw=document.getElementById('selItemWrap'); if(_siw) _siw.style.display='none';
  _toggleSearchClear();
  document.getElementById('itemSearchInput').focus();
}

function _catTreeResetAll() {
  _catTreePath = [];
  _catTreeManual = false;
  orderCurrentCat = 'ALL';
  window._catTreeFilter = null;
  window._catTreeFilters = null;
  document.getElementById('catSelBadge').style.display = 'none';
  _closeCatMega();
  _clearItemSelection();
}

// ── 모바일 카테고리 슬라이드 패널 ──────────────────────────────────────
var _catSlideHistory = []; // 네비게이션 히스토리 [{title, items, type}]

function _isMobileView() {
  return window.innerWidth <= 768;
}

/* ── 모바일 전체화면 모달 (인라인 스타일 강제 적용) ── */
function _mobFullScreen(ovEl, mEl) {
  if (!ovEl || !mEl) return;
  // 견적/주문 모달은 데스크탑에서도 기본 풀스크린 (사용자 요청)
  var _alwaysFS = ovEl.id === 'orderOverlay' || ovEl.id === 'quoteOverlay';
  if (!_alwaysFS && window.innerWidth > 1024) return;
  ovEl.style.cssText += ';padding:0!important;align-items:stretch!important;overflow:hidden!important;';
  // 중간 래퍼(slide-wrap 등)도 전체화면 처리
  var wrap = mEl.parentElement;
  if (wrap && wrap !== ovEl) {
    wrap.style.cssText += ';max-width:100%!important;width:100%!important;height:100%!important;max-height:100%!important;margin:0!important;';
  }
  mEl.style.cssText += ';max-width:100%!important;width:100%!important;height:100%!important;max-height:100%!important;border-radius:0!important;margin:0!important;animation:none!important;box-shadow:none!important;';
}

// ── 모바일 아이템 슬라이드 오버레이 (견적/주문 공용) ──
var _mobItemSlideMode = '';

function openMobItemSlide(title, filter, mode) {
  _mobItemSlideMode = mode;
  var items = ITEM_DATA.filter(function(i) { return _matchTreeFilter(i, filter); });
  items.sort(function(a, b) { return (a.model || '').localeCompare(b.model || ''); });
  window._mobSlideItems = items;
  document.getElementById('mobItemsTitle').textContent = title + ' — ' + items.length;
  var html = '<div style="padding:10px 14px 6px;"><input type="text" class="mob-items-search" placeholder="🔍 Search..." oninput="_mobSlideFilter(this.value)"></div>';
  html += '<div id="mobSlideItemsBody">';
  html += _buildMobSlideRows(items);
  html += '</div>';
  document.getElementById('mobItemsBody').innerHTML = html;
  document.getElementById('mobItemsOverlay').classList.add('open');
  setTimeout(function() { document.getElementById('mobItemsPanel').classList.add('open'); }, 10);
}

function closeMobItemSlide() {
  document.getElementById('mobItemsPanel').classList.remove('open');
  setTimeout(function() { document.getElementById('mobItemsOverlay').classList.remove('open'); }, 280);
}

function _buildMobSlideRows(items) {
  var html = '';
  items.forEach(function(it) {
    var gIdx = ITEM_DATA.indexOf(it);
    var isAdded = false;
    if (_mobItemSlideMode === 'order') {
      isAdded = (typeof orderItems !== 'undefined') && orderItems.some(function(o) { return o.item.model === it.model && o.item.no === it.no; });
    } else {
      isAdded = (typeof quoteItems !== 'undefined') && quoteItems.some(function(o) { return o.name === it.model; });
    }
    html += '<div class="mob-item-row" id="msi_' + gIdx + '">';
    html += '<div class="mob-item-info"><div class="mob-item-model">' + (it.model || '') + '</div>';
    html += '<div class="mob-item-spec">' + (it.spec || it.name || '') + '</div></div>';
    html += '<div class="mob-item-qty">' +
      '<button onclick="event.stopPropagation();_mobSlideQtyChange(' + gIdx + ',-1)">−</button>' +
      '<input type="number" id="msiq_' + gIdx + '" value="1" min="1" onclick="event.stopPropagation()">' +
      '<button onclick="event.stopPropagation();_mobSlideQtyChange(' + gIdx + ',1)">+</button>' +
    '</div>';
    if (isAdded) {
      html += '<button class="mob-item-added">✓</button>';
    } else {
      html += '<button class="mob-item-add" onclick="event.stopPropagation();_mobSlideAddItem(' + gIdx + ')">ADD</button>';
    }
    html += '</div>';
  });
  return html;
}

function _mobSlideAddItem(gIdx) {
  var item = ITEM_DATA[gIdx];
  if (!item) return;
  var qtyInput = document.getElementById('msiq_' + gIdx);
  var qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
  if (qty < 1) qty = 1;
  if (_mobItemSlideMode === 'order') {
    var isDup = orderItems.some(function(o) { return o.item.model === item.model && o.item.no === item.no; });
    if (isDup) { showToast(t('msg_dup_item')); return; }
    var price = _getItemPrice(item);
    orderItems.push({ item: Object.assign({}, item), qty: qty, _price: price.retail || 0 });
    renderOrderItems();
    if (document.getElementById('submitOrderBtn')) document.getElementById('submitOrderBtn').disabled = !orderItems.length;
  } else {
    var dupIdx = quoteItems.findIndex(function(o) { return o.name === item.model; });
    if (dupIdx !== -1) {
      quoteItems[dupIdx].qty = (parseInt(quoteItems[dupIdx].qty) || 1) + qty;
      showToast('⚠️ 동일 아이템 수량 추가: ' + item.model);
    } else {
      var pd = _pmPriceMap[item.model] || {};
      var price = pd.supply || pd.retail || item.price || 0;
      var vat = parseFloat(pd.vat) || 0;
      quoteItems.push({ name: item.model, spec: item.spec || '', qty: qty, price: price + vat });
    }
    renderQuoteItems();
  }
  showToast((item.model || '') + ' ✓');
  var row = document.getElementById('msi_' + gIdx);
  if (row) {
    var btn = row.querySelector('.mob-item-add');
    if (btn) {
      var span = document.createElement('button');
      span.className = 'mob-item-added';
      span.textContent = '✓';
      btn.replaceWith(span);
    }
  }
}

function _mobSlideQtyChange(gIdx, delta) {
  var inp = document.getElementById('msiq_' + gIdx);
  if (!inp) return;
  var v = parseInt(inp.value) || 1;
  v += delta;
  if (v < 1) v = 1;
  inp.value = v;
}

function _mobSlideFilter(query) {
  var q = (query || '').trim().toUpperCase();
  var body = document.getElementById('mobSlideItemsBody');
  if (!body || !window._mobSlideItems) return;
  var filtered = window._mobSlideItems;
  if (q) {
    filtered = filtered.filter(function(it) {
      return ((it.model || '').toUpperCase().indexOf(q) > -1) || ((it.spec || it.name || '').toUpperCase().indexOf(q) > -1);
    });
  }
  body.innerHTML = _buildMobSlideRows(filtered);
}

function openCatSlide() {
  _catSlideHistory = [];
  document.getElementById('catSlideOverlay').classList.add('open');
  document.getElementById('catSlidePanel').classList.add('open');
  _catSlideRenderNav('📂 Category', CAT_TREE, []);
}

function closeCatSlide() {
  document.getElementById('catSlidePanel').classList.remove('open');
  document.getElementById('catSlideOverlay').classList.remove('open');
}

function catSlideGoBack() {
  if (_catSlideHistory.length <= 1) { closeCatSlide(); return; }
  _catSlideHistory.pop();
  var prev = _catSlideHistory[_catSlideHistory.length - 1];
  _catSlideApplyState(prev);
}

function _catSlideApplyState(state) {
  document.getElementById('catSlideTitle').textContent = state.title;
  document.getElementById('catSlideBody').innerHTML = state.html;
  document.getElementById('catSlideBack').style.display = _catSlideHistory.length > 1 ? '' : 'none';
}

function _catSlideRenderNav(title, items, path) {
  var html = '<div class="cat-slide-group">';
  items.forEach(function(item) {
    var hasChild = (item.children && item.children.length) || (item.filter && item.filter.modelPrefix === undefined && _catSlideHasModelChildren(item));
    var countStr = '';
    if (item.filter && !item.children && !/\(\d+\)/.test(item.label)) {
      var cnt = _catSlideCountItems(item.filter);
      countStr = '<span class="csn-count">(' + cnt + ')</span>';
    }
    if (item.children && item.children.length && !item.filter) {
      countStr = '<span class="csn-count">(' + item.children.length + ')</span>';
    }
    if (item.children && item.children.length && item.filter) {
      var cnt = _catSlideCountItems(item.filter);
      countStr = '<span class="csn-count">(' + cnt + ')</span>';
    }
    var displayLabel = item.labelKey ? t(item.labelKey) : item.label;
    var pathStr = JSON.stringify(path.concat(item.key)).replace(/"/g, '&quot;');
    html += '<div class="cat-slide-nav-item" onclick="catSlideNav(\'' + item.key + '\',' + pathStr + ')">';
    html += '<span class="csn-label">' + displayLabel + countStr + '</span>';
    html += '<span class="csn-arrow">›</span>';
    html += '</div>';
  });
  html += '</div>';
  var state = { title: title, html: html, path: path };
  _catSlideHistory.push(state);
  _catSlideApplyState(state);
}

function _catSlideHasModelChildren(item) {
  return false; // 기본적으로 filter 노드는 말단
}

function _catSlideCountItems(filter) {
  return ITEM_DATA.filter(function(i) { return _matchTreeFilter(i, filter); }).length;
}

function catSlideNav(key, path) {
  var items = CAT_TREE;
  var node = null;
  var prevNode = null;
  for (var i = 0; i < path.length; i++) {
    var pk = path[i];
    // _ALL 항목: 이전 노드(부모)의 _allItem 참조
    if (pk.endsWith('_ALL') && prevNode && prevNode._allItem) {
      node = prevNode._allItem;
      break;
    }
    node = items.find(function(it) { return it.key === pk; });
    if (!node) return;
    prevNode = node;
    items = node.children || [];
  }
  if (!node) return;

  // 직접 입력 모드
  if (node.isManual) {
    _catTreePath = path;
    _catTreeManual = true;
    orderCurrentCat = '_MANUAL_';
    _updateCatBadge();
    closeCatSlide();
    _clearItemSelection();
    return;
  }

  // filter + children → 하위 메뉴로 진입 (예: Fixture → BIS/IS)
  if (node.children && node.children.length) {
    // 패키지 세트 → 빌더 열기
    if (path.indexOf('package') !== -1 && node.children[0] && node.children[0].filter) {
      _catTreePath = path;
      closeCatSlide();
      _updateCatBadge();
      _pkgBuilderMode = 'order';
      openPkgBuilder(node);
      return;
    }
    var displayLabel = node.labelKey ? t(node.labelKey) : node.label;
    // filter가 있는 부모 노드 → "전체 보기" 항목 추가
    var childrenWithAll = node.children;
    if (node.filter) {
      var allLabel = displayLabel.replace(/\s*\(\d+\)/, '');
      var allItem = { key: node.key + '_ALL', label: '📋 ' + allLabel + ' ' + t('cat_all'), filter: Object.assign({}, node.filter) };
      childrenWithAll = [allItem].concat(node.children);
      // _ALL 노드를 임시 저장 (catSlideNav에서 참조)
      node._allItem = allItem;
    }
    _catSlideRenderNav(displayLabel, childrenWithAll, path);
    return;
  }

  // 말단 노드 (filter) → 아이템 리스트 표시
  if (node.filter) {
    _catTreePath = path;
    var displayLabel = node.labelKey ? t(node.labelKey) : node.label;
    _catSlideRenderItems(displayLabel, node.filter);
    return;
  }
}

function _catSlideRenderItems(title, filter) {
  var items = ITEM_DATA.filter(function(i) { return _matchTreeFilter(i, filter); });
  items.sort(function(a, b) { return (a.model || '').localeCompare(b.model || ''); });
  window._csiItems = items;
  var html = '<div class="cat-slide-group">';
  html += '<div class="cat-slide-group-title">' + title + ' — ' + items.length + ' items</div>';
  html += '<div class="csi-search-wrap"><input type="text" class="csi-search" placeholder="🔍 Search..." oninput="_csiFilterItems(this.value)"></div>';
  html += '<div id="csiItemsBody">';
  html += _buildCsiRows(items);
  html += '</div></div>';
  var stateTitle = /\(\d+\)/.test(title) ? title : title + ' (' + items.length + ')';
  var state = { title: stateTitle, html: html };
  _catSlideHistory.push(state);
  _catSlideApplyState(state);
}

function _buildCsiRows(items) {
  var html = '';
  items.forEach(function(it) {
    var globalIdx = ITEM_DATA.indexOf(it);
    var price = _getItemPrice(it);
    var priceStr = price.retail ? '฿' + parseFloat(price.retail).toLocaleString() : '';
    var isAdded = orderItems.some(function(o) { return o.item.model === it.model && o.item.no === it.no; });
    html += '<div class="cat-slide-item" id="csi_' + globalIdx + '">';
    html += '<div class="csi-info">';
    html += '<div class="csi-model">' + (it.model || '') + '</div>';
    html += '<div class="csi-spec">' + (it.spec || it.name || '') + '</div>';
    if (priceStr) html += '<div class="csi-price">' + priceStr + '</div>';
    html += '</div>';
    html += '<div class="csi-qty-wrap">' +
      '<button class="csi-qty-btn" onclick="event.stopPropagation();_csiQtyChange(' + globalIdx + ',-1)">−</button>' +
      '<input type="number" class="csi-qty-val" id="csiq_' + globalIdx + '" value="1" min="1" onclick="event.stopPropagation()">' +
      '<button class="csi-qty-btn" onclick="event.stopPropagation();_csiQtyChange(' + globalIdx + ',1)">+</button>' +
    '</div>';
    if (isAdded) {
      html += '<button class="csi-added">✓</button>';
    } else {
      html += '<button class="csi-add" onclick="catSlideAddItem(' + globalIdx + ')">ADD</button>';
    }
    html += '</div>';
  });
  return html;
}

function _csiQtyChange(gIdx, delta) {
  var inp = document.getElementById('csiq_' + gIdx);
  if (!inp) return;
  var v = parseInt(inp.value) || 1;
  v += delta;
  if (v < 1) v = 1;
  inp.value = v;
}

function _csiFilterItems(query) {
  var q = (query || '').trim().toUpperCase();
  var body = document.getElementById('csiItemsBody');
  if (!body || !window._csiItems) return;
  var filtered = window._csiItems;
  if (q) {
    filtered = filtered.filter(function(it) {
      return ((it.model || '').toUpperCase().indexOf(q) > -1) || ((it.spec || it.name || '').toUpperCase().indexOf(q) > -1);
    });
  }
  body.innerHTML = _buildCsiRows(filtered);
}

function catSlideAddItem(globalIdx) {
  var item = ITEM_DATA[globalIdx];
  if (!item) return;
  var qtyInput = document.getElementById('csiq_' + globalIdx);
  var qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
  if (qty < 1) qty = 1;

  // 중복 체크
  var isDup = orderItems.some(function(o) { return o.item.model === item.model && o.item.no === item.no; });
  if (isDup) { showToast(t('msg_dup_item')); return; }

  var price = _getItemPrice(item);
  var retail = price.retail || 0;

  // 위탁 충돌 체크 없이 바로 추가 (슬라이드 패널에서)
  orderItems.push({ item: Object.assign({}, item), qty: qty, _price: retail });
  renderOrderItems();
  document.getElementById('submitOrderBtn').disabled = !orderItems.length;
  showToast((item.model || '') + ' ' + t('settle_add_btn') + ' ✓');

  // 버튼 상태 업데이트
  var row = document.getElementById('csi_' + globalIdx);
  if (row) {
    var btn = row.querySelector('.csi-add');
    if (btn) {
      btn.className = 'csi-added';
      btn.textContent = '✓';
      btn.onclick = null;
    }
  }
}

// ── 패키지 빌더 ──────────────────────────────────────────────────────────────
var _pkgBuilderNode = null;
var _pkgRowState = []; // [{filter, selectedItem, qty, isEtc, added, label, maxQty}]
var _pkgSetQty = 0;
var _pkgOrderItems = []; // 패키지 빌더 내부 주문 리스트 [{item, qty, ri, label}]
var _pkgBuilderMode = 'order'; // 'order' or 'quote'
window._pkgParentMinimized = null; // 상위 모달 최소화 추적

function _pkgRowMaxQty(child, setQty) {
  if (child.isEtc) return 0; // 기타: 잔여 없음
  if (child.key === 'GuideKit') return 1;
  return setQty;
}

// 창 크기 변경 시 오버플로우 패널 재판정
(function(){
  var _pkgResizeT;
  window.addEventListener('resize', function(){
    clearTimeout(_pkgResizeT);
    _pkgResizeT = setTimeout(function(){
      var _pb = document.getElementById('pkgBuilder');
      if (_pb && _pb.classList.contains('open') && typeof _renderPkgRight === 'function') {
        _renderPkgRight();
      }
    }, 120);
  });
})();

function openPkgBuilder(node) {
  _pkgBuilderNode = node;
  _pkgRowState = [];
  _pkgOrderItems = [];
  _pkgSetQty = (node.children && node.children[0] && node.children[0].filter && node.children[0].filter.pkg) || 1;
  document.getElementById('pkgBuilderTitle').textContent = '📦 ' + t('pkg_title') + ' — ' + node.label;
  var rowsEl = document.getElementById('pkgBuilderRows');
  var html = '';
  node.children.forEach(function(child, ri) {
    var isEtc = child.isEtc || false;
    var maxQ = _pkgRowMaxQty(child, _pkgSetQty);
    var defQty = 1;
    _pkgRowState.push({ filter: child.filter || {}, selectedItem: null, qty: defQty, isEtc: isEtc, added: false, label: child.label, maxQty: maxQ, usedQty: 0 });
    var remainHtml = maxQ > 0
      ? '<span class="pkg-row-remain ok" id="pkgRowRemain' + ri + '">' + t('pkg_remain') + ' ' + maxQ + '/' + maxQ + '</span>'
      : '<span class="pkg-row-remain" style="visibility:hidden;">' + t('pkg_remain') + ' 00/00</span>';
    html += '<div class="pkg-row" data-pkg-ri="' + ri + '" id="pkgRow' + ri + '">' +
      '<span class="pkg-row-label">' + child.label + '</span>' +
      remainHtml +
      '<div class="pkg-row-search">' +
        '<input type="text" placeholder="' + (isEtc ? t('pkg_search_all_ph') : t('pkg_search_ph')) + '" oninput="pkgRowAc(' + ri + ')" onkeydown="pkgRowAcKey(event,' + ri + ')" id="pkgRowInput' + ri + '">' +
        '<div class="pkg-row-ac" id="pkgRowAcList' + ri + '"></div>' +
      '</div>' +
      '<div class="pkg-row-qty-group">' +
        '<button class="pkg-row-qty-btn" onclick="pkgRowQtyDelta(' + ri + ',-1)">−</button>' +
        '<input type="number" class="pkg-row-qty-val" value="' + defQty + '" min="1" id="pkgRowQty' + ri + '" onchange="pkgRowQtyChange(' + ri + ')">' +
        '<button class="pkg-row-qty-btn" onclick="pkgRowQtyDelta(' + ri + ',1)">+</button>' +
      '</div>' +
      '<button class="pkg-row-add" id="pkgRowAddBtn' + ri + '" onclick="addPkgRow(' + ri + ')">' + t('pkg_add') + '</button>' +
    '</div>';
  });
  // Master Kit 버튼 추가
  html += '<div class="pkg-master-kit-section" style="margin-top:16px;padding-top:14px;border-top:2px dashed #ede9fe;">';
  html += '<div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:10px;">🧰 ' + t('pkg_master_kit_section') + '</div>';
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">';
  html += '<button onclick="addMasterKit(\'basic\')" style="padding:10px 20px;border:2px solid #7c3aed;border-radius:10px;background:#f5f3ff;color:#5b21b6;font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;" onmouseover="this.style.background=\'#7c3aed\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'#f5f3ff\';this.style.color=\'#5b21b6\'">📦 Master Kit (Basic)</button>';
  html += '<button onclick="addMasterKit(\'full\')" style="padding:10px 20px;border:2px solid #7c3aed;border-radius:10px;background:#f5f3ff;color:#5b21b6;font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;" onmouseover="this.style.background=\'#7c3aed\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'#f5f3ff\';this.style.color=\'#5b21b6\'">📦 Master Kit (Full)</button>';
  html += '</div></div>';

  rowsEl.innerHTML = html;
  _renderPkgRight();
  var pkgOverlay = document.getElementById('pkgOverlay');
  var pkgEl = document.getElementById('pkgBuilder');
  // 모바일: body 직속 이동 + setProperty !important 로 강제 풀스크린
  if (window.innerWidth <= 1024) {
    if (pkgOverlay.parentElement !== document.body) document.body.appendChild(pkgOverlay);
    if (pkgEl.parentElement !== document.body) document.body.appendChild(pkgEl);
    // overlay 강제
    var os = pkgOverlay.style;
    os.setProperty('display', 'block', 'important');
    os.setProperty('position', 'fixed', 'important');
    os.setProperty('top', '0', 'important');
    os.setProperty('left', '0', 'important');
    os.setProperty('right', '0', 'important');
    os.setProperty('bottom', '0', 'important');
    os.setProperty('z-index', '999998', 'important');
    os.setProperty('background', 'rgba(0,0,0,.25)', 'important');
    // pkg-builder 강제 풀스크린 (100% 사용 - 모바일 주소창 문제 방지)
    var s = pkgEl.style;
    s.setProperty('display', 'flex', 'important');
    s.setProperty('flex-direction', 'column', 'important');
    s.setProperty('position', 'fixed', 'important');
    s.setProperty('top', '0', 'important');
    s.setProperty('left', '0', 'important');
    s.setProperty('right', '0', 'important');
    s.setProperty('bottom', '0', 'important');
    s.setProperty('width', '100%', 'important');
    s.setProperty('height', '100%', 'important');
    s.setProperty('max-width', 'none', 'important');
    s.setProperty('max-height', 'none', 'important');
    s.setProperty('transform', 'none', 'important');
    s.setProperty('border-radius', '0', 'important');
    s.setProperty('border', 'none', 'important');
    s.setProperty('margin', '0', 'important');
    s.setProperty('padding', '0', 'important');
    s.setProperty('z-index', '999999', 'important');
    s.setProperty('background', '#faf5ff', 'important');
    s.setProperty('overflow', 'hidden', 'important');
    s.setProperty('box-shadow', 'none', 'important');
    // 내부 pkg-body도 강제
    var pkgBody = pkgEl.querySelector('.pkg-body');
    if (pkgBody) {
      pkgBody.style.setProperty('flex', '1', 'important');
      pkgBody.style.setProperty('min-height', '0', 'important');
      pkgBody.style.setProperty('max-height', 'none', 'important');
      pkgBody.style.setProperty('overflow-y', 'hidden', 'important');
    }
    var pkgLeft = pkgEl.querySelector('.pkg-left');
    if (pkgLeft) {
      pkgLeft.style.setProperty('flex', '1', 'important');
      pkgLeft.style.setProperty('min-height', '0', 'important');
      pkgLeft.style.setProperty('overflow-y', 'auto', 'important');
    }
    pkgOverlay.classList.add('open');
    pkgEl.classList.add('open');
  } else {
    pkgEl.style.cssText = '';
    pkgOverlay.style.cssText = '';
    pkgOverlay.classList.add('open');
    pkgEl.classList.add('open');
    // 데스크탑: 기본 풀스크린(pkg-fs) 으로 열기 — VW VH 100% (CSS 규칙 활용, body{zoom:0.9} 회피)
    pkgEl.classList.add('pkg-fs');
    var fsBtn = document.getElementById('pkgFsBtn');
    if (fsBtn) fsBtn.textContent = '⛶';
  }
  _bringToFront(pkgOverlay);
  _bringToFront(pkgEl);
  // [REFACTOR 2026-04-25] max int32 !important 강제 제거 — z-index 군비경쟁 종결.
  // CSS 토큰(.pkg-overlay z=9900, .pkg-builder z=9910)이 자연스럽게 적용됨.
  // _bringToFront 가 inline z-index(_topZ 카운터)를 더 높게 설정하므로 다른 모달과 충돌 없음.
  // 알림류는 CSS 의 --z-alert 가 더 위에 있어 가리지 않음.
  // 안드로이드 모바일: 위저드 모드(순차 입력) 활성화
  _setupPkgWizard();
}

// ── 패키지 빌더 위저드 모드 (안드로이드 모바일 전용) ─────────────────────────
// 카테고리별로 한 단계씩 입력 → Master Kit → 최종 검토 → 확정
var _pkgWizardActive = false;
var _pkgWizardStep = 0;
var _pkgWizardTotalSteps = 0;

function _isPkgWizardMode() {
  // 안드로이드 + iOS (아이폰/아이패드) 모두 모바일 폭에서 위저드 모드
  var root = document.documentElement;
  var isMobileDevice = root.classList.contains('is-android') || root.classList.contains('is-ios');
  return isMobileDevice && window.innerWidth <= 1024;
}

function _setupPkgWizard() {
  var builder = document.getElementById('pkgBuilder');
  if (!builder) return;
  // 기존 위저드 요소 제거
  var oldHdr = document.getElementById('pkgWizardHdr'); if (oldHdr) oldHdr.remove();
  var oldFt = document.getElementById('pkgWizardFooter'); if (oldFt) oldFt.remove();
  var oldCur = document.getElementById('pkgWizardCurItems'); if (oldCur) oldCur.remove();
  var oldRev = document.getElementById('pkgWizardReview'); if (oldRev) oldRev.remove();
  builder.classList.remove('pkg-wizard');
  for (var i = 0; i < 12; i++) builder.classList.remove('pkg-step-' + i);
  if (!_isPkgWizardMode() || !_pkgRowState.length) {
    _pkgWizardActive = false;
    return;
  }
  _pkgWizardActive = true;
  _pkgWizardStep = 0;
  _pkgWizardTotalSteps = _pkgRowState.length + 2; // +Master Kit +Review
  builder.classList.add('pkg-wizard');
  // 헤더(단계 표시) 주입 — pkg-body 앞
  var body = builder.querySelector('.pkg-body');
  if (body) {
    var hdr = document.createElement('div');
    hdr.id = 'pkgWizardHdr';
    hdr.className = 'pkg-wizard-hdr';
    body.parentElement.insertBefore(hdr, body);
  }
  // 푸터(이전/다음/확정) 주입 — pkg-footer-mobile 앞
  var mobFooter = builder.querySelector('.pkg-footer-mobile');
  if (mobFooter) {
    var footer = document.createElement('div');
    footer.id = 'pkgWizardFooter';
    footer.className = 'pkg-wizard-footer';
    footer.innerHTML =
      '<button type="button" class="pwf-prev" onclick="_pkgWizardGo(-1)">' + (t('pkg_wiz_prev') || '← 이전') + '</button>' +
      '<button type="button" class="pwf-reset" onclick="resetPkgBuilder()">🔄</button>' +
      '<button type="button" class="pwf-next" onclick="_pkgWizardGo(1)">' + (t('pkg_wiz_next') || '다음 →') + '</button>' +
      '<button type="button" class="pwf-confirm" onclick="addPkgToOrder()" style="display:none;">' + (t('pkg_wiz_confirm') || '✓ 확정') + '</button>';
    mobFooter.parentElement.insertBefore(footer, mobFooter);
  }
  // 현재 카테고리 추가 항목 표시 컨테이너
  var curItems = document.createElement('div');
  curItems.id = 'pkgWizardCurItems';
  curItems.className = 'pkg-wizard-cur-items';
  var rowsEl = document.getElementById('pkgBuilderRows');
  if (rowsEl) rowsEl.appendChild(curItems);
  // 최종 검토 컨테이너
  var review = document.createElement('div');
  review.id = 'pkgWizardReview';
  review.className = 'pkg-wizard-review';
  if (rowsEl) rowsEl.appendChild(review);
  _pkgWizardRender();
}

function _pkgWizardGo(delta) {
  if (!_pkgWizardActive) return;
  var ns = _pkgWizardStep + delta;
  if (ns < 0) ns = 0;
  if (ns > _pkgWizardTotalSteps - 1) ns = _pkgWizardTotalSteps - 1;
  _pkgWizardStep = ns;
  _pkgWizardRender();
  var rowsEl = document.getElementById('pkgBuilderRows');
  if (rowsEl) rowsEl.scrollTop = 0;
}

function _pkgWizardRender() {
  if (!_pkgWizardActive) return;
  var builder = document.getElementById('pkgBuilder');
  if (!builder) return;
  for (var i = 0; i < 12; i++) builder.classList.remove('pkg-step-' + i);
  builder.classList.add('pkg-step-' + _pkgWizardStep);
  // Master Kit 섹션 토글 (순수 CSS 로 매칭하기 힘듦 — 단계 번호 가변)
  var mk = builder.querySelector('.pkg-master-kit-section');
  if (mk) mk.style.display = (_pkgWizardStep === _pkgRowState.length) ? '' : 'none';
  _updatePkgWizardHdr();
  _updatePkgWizardFooter();
  _renderPkgWizardCurItems();
  _renderPkgWizardReview();
}

function _getPkgWizardStepLabel(step) {
  if (step < _pkgRowState.length) return _pkgRowState[step].label;
  if (step === _pkgRowState.length) return (t('pkg_master_kit_section') || 'Master Kit');
  return (t('pkg_wiz_review') || '최종 검토');
}

function _updatePkgWizardHdr() {
  var hdr = document.getElementById('pkgWizardHdr');
  if (!hdr) return;
  var cur = _pkgWizardStep + 1;
  var tot = _pkgWizardTotalSteps;
  var label = _getPkgWizardStepLabel(_pkgWizardStep);
  var dots = '';
  for (var i = 0; i < tot; i++) {
    var cls = i === _pkgWizardStep ? ' active' : (i < _pkgWizardStep ? ' done' : '');
    dots += '<span class="pwd-dot' + cls + '"></span>';
  }
  hdr.innerHTML = '<div class="pwh-title">' + (t('pkg_wiz_step') || '단계') + ' ' + cur + '/' + tot + ' — <strong>' + label + '</strong></div><div class="pwh-dots">' + dots + '</div>';
}

function _updatePkgWizardFooter() {
  var footer = document.getElementById('pkgWizardFooter');
  if (!footer) return;
  var prev = footer.querySelector('.pwf-prev');
  var next = footer.querySelector('.pwf-next');
  var conf = footer.querySelector('.pwf-confirm');
  if (prev) prev.disabled = (_pkgWizardStep === 0);
  var isLast = (_pkgWizardStep >= _pkgWizardTotalSteps - 1);
  if (next) next.style.display = isLast ? 'none' : '';
  if (conf) conf.style.display = isLast ? '' : 'none';
}

function _renderPkgWizardCurItems() {
  var el = document.getElementById('pkgWizardCurItems');
  if (!el) return;
  // 카테고리 단계에서만 표시
  if (_pkgWizardStep >= _pkgRowState.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  var ri = _pkgWizardStep;
  var items = [];
  var origIdx = [];
  _pkgOrderItems.forEach(function(o, idx) { if (o.ri === ri) { items.push(o); origIdx.push(idx); } });
  if (!items.length) {
    el.innerHTML = '<div class="pwc-empty">' + (t('pkg_wiz_cur_empty') || '아직 추가된 항목이 없습니다') + '</div>';
    return;
  }
  var html = '<div class="pwc-title">✓ ' + (t('pkg_wiz_cur_added') || '이 카테고리 추가 항목') + ' (' + items.length + ')</div>';
  items.forEach(function(o, k) {
    html += '<div class="pwc-item">' +
      '<div class="pwc-info"><strong>' + o.item.model + '</strong>' +
      (o.item.spec ? '<div class="pwc-spec">' + o.item.spec + '</div>' : '') +
      '</div>' +
      '<span class="pwc-qty">×' + o.qty + '</span>' +
      '<button class="pwc-del" onclick="_pkgWizardRemoveItem(' + origIdx[k] + ')">✕</button>' +
      '</div>';
  });
  el.innerHTML = html;
}

function _pkgWizardRemoveItem(idx) {
  removePkgItem(idx);
  _pkgWizardRender();
}

function _renderPkgWizardReview() {
  var el = document.getElementById('pkgWizardReview');
  if (!el) return;
  if (_pkgWizardStep !== _pkgWizardTotalSteps - 1) { el.style.display = 'none'; return; }
  el.style.display = '';
  if (!_pkgOrderItems.length) {
    el.innerHTML = '<div class="pwr-empty">' + (t('pkg_wiz_rev_empty') || '추가된 항목이 없습니다. 이전 단계로 돌아가서 항목을 추가하세요.') + '</div>';
    return;
  }
  var groups = {};
  _pkgOrderItems.forEach(function(o, i) {
    var key = o.label || '(기타)';
    if (!groups[key]) groups[key] = [];
    groups[key].push({ o: o, idx: i });
  });
  var html = '<div class="pwr-title">📋 ' + (t('pkg_wiz_review') || '최종 검토') + ' — ' + (t('pkg_wiz_total') || '총') + ' ' + _pkgOrderItems.length + (t('pkg_wiz_items') || '개 항목') + '</div>';
  Object.keys(groups).forEach(function(lb) {
    html += '<div class="pwr-group"><div class="pwr-group-label">' + lb + '</div>';
    groups[lb].forEach(function(g) {
      html += '<div class="pwr-item"><span class="pwr-model">' + g.o.item.model + '</span>' +
        '<span class="pwr-qty">×' + g.o.qty + '</span>' +
        '<button class="pwr-del" onclick="_pkgWizardRemoveItem(' + g.idx + ')">✕</button></div>';
    });
    html += '</div>';
  });
  el.innerHTML = html;
}

function resetPkgBuilder() {
  if (!_pkgBuilderNode) return;
  _pkgOrderItems = [];
  _pkgRowState.forEach(function(row, ri) {
    row.selectedItem = null;
    row.qty = 1;
    row.usedQty = 0;
    row.added = false;
    var input = document.getElementById('pkgRowInput' + ri);
    if (input) { input.value = ''; input.classList.remove('selected'); }
    document.getElementById('pkgRowQty' + ri).value = 1;
    _updatePkgRowRemain(ri);
  });
  _renderPkgRight();
  if (_pkgWizardActive) { _pkgWizardStep = 0; _pkgWizardRender(); }
}

function addAllPkgUnassigned() {
  var added = 0;
  _pkgRowState.forEach(function(row, ri) {
    if (row.isEtc) return; // 기타는 제외
    var remain = row.maxQty - row.usedQty;
    if (remain <= 0) return; // 이미 다 채워진 카테고리 제외
    // 미지정 placeholder 아이템 생성
    var placeholderItem = {
      model: row.label + ' (미지정)',
      no: '',
      spec: _pkgSetQty + ' Sets',
      name: row.label,
      price: 0
    };
    // 중복 체크
    var isDup = _pkgOrderItems.some(function(o) { return o.item.model === placeholderItem.model; });
    if (isDup) return;
    _pkgOrderItems.push({ item: placeholderItem, qty: remain, ri: ri, label: row.label });
    row.usedQty += remain;
    _updatePkgRowRemain(ri);
    added++;
  });
  if (added > 0) _renderPkgRight();
  else neoAlert(t('pkg_no_unassigned'));
}

// ── Master Kit 데이터 ──
var _masterKitBasic = ['1ENCPKISUNM0100010','1ENCPTOTACT3800002','1ENCPTOTACT4300004','1ENCPTOTACT4500006','1ENCPTOTACT5000008','1THCPTODRIF5000005','1ENCPTODRIF5000006','1ENCPTODRIF5000007','1THCPTODRIF5000008','1THCPTODLLI2300001','1ENCPTODLLI2300002'];
var _masterKitFull = ['1ENCPKISUNM0100010','1ENCPTOTACT3800002','1ENCPTOTACT4300004','1ENCPTOTACT4500006','1ENCPTOTACT5000008','1THCPTODRIF5000005','1ENCPTODRIF5000006','1ENCPTODRIF5000007','1THCPTODRIF5000008','1THCPTODRIF4000030','1THCPTODLTS2200068','1THCPTODLTS2700069','1THCPTOTACT3200011','1ENCPTOISDH4800006','1THCPTOISDS3700001','1THCPTOISDS3700002','1THCPTOISDS3700003','1THCPTOISDS3700004','1ENCPTODRTF7500001','1THCPTODRTF7500002','1ENCPTODRTF4000001','1ENCPTODRTF4000002','1THCPTODLLI2300001','1ENCPTODLLI2300002'];

function addMasterKit(type) {
  var kitNos = type === 'full' ? _masterKitFull : _masterKitBasic;
  var kitLabel = type === 'full' ? 'Master Kit (Full)' : 'Master Kit (Basic)';
  if (typeof ITEM_DATA === 'undefined') { neoAlert(t('pkg_item_not_loaded')); return; }
  var added = 0, notFound = [];
  kitNos.forEach(function(no) {
    // 이미 추가된 아이템 건너뛰기
    var isDup = _pkgOrderItems.some(function(o) { return o.item.no === no; });
    if (isDup) return;
    var found = ITEM_DATA.find(function(it) { return it.no === no; });
    if (!found) { notFound.push(no); return; }
    _pkgOrderItems.push({
      item: { no: found.no, model: found.model, name: found.name, spec: found.spec || '', price: found.price || 0 },
      qty: 1,
      ri: -1,
      label: kitLabel
    });
    added++;
  });
  if (added > 0) _renderPkgRight();
  if (_pkgWizardActive) _pkgWizardRender();
  var msg = kitLabel + ': ' + added + t('pkg_kit_added');
  if (notFound.length) msg += ' (' + notFound.length + t('pkg_kit_not_found') + ')';
  showToast(msg);
}

function closePkgBuilder() {
  document.getElementById('pkgSlidePanel').classList.remove('open');
  document.getElementById('pkgSlideOverlay').classList.remove('open');
  // 오버플로우 컬럼 정리
  var _ov1 = document.getElementById('pkgRightOv1List');
  if (_ov1) _ov1.innerHTML = '';
  var _ov2 = document.getElementById('pkgRightOv2List');
  if (_ov2) _ov2.innerHTML = '';
  var pkgEl = document.getElementById('pkgBuilder');
  var pkgOv = document.getElementById('pkgOverlay');
  pkgEl.classList.remove('open','pkg-fs','pkg-has-ov-1','pkg-has-ov-2');
  pkgEl.style.cssText = '';
  var _pb = pkgEl.querySelector('.pkg-body');
  if (_pb) _pb.style.cssText = '';
  var _pl = pkgEl.querySelector('.pkg-left');
  if (_pl) _pl.style.cssText = '';
  pkgOv.classList.remove('open');
  pkgOv.style.cssText = '';
  document.getElementById('pkgMini').classList.remove('show');
  // 상위 모달이 최소화되어 있으면 상위 미니 아이콘 복원
  if (window._pkgParentMinimized === 'order') {
    document.getElementById('orderMini').classList.add('show');
  } else if (window._pkgParentMinimized === 'quote') {
    document.getElementById('quoteMini').classList.add('show');
  }
  window._pkgParentMinimized = null;
  _pkgBuilderNode = null;
  _pkgRowState = [];
  _pkgOrderItems = [];
  // 위저드 정리
  _pkgWizardActive = false;
  _pkgWizardStep = 0;
  var _h=document.getElementById('pkgWizardHdr'); if(_h) _h.remove();
  var _f=document.getElementById('pkgWizardFooter'); if(_f) _f.remove();
  var _c=document.getElementById('pkgWizardCurItems'); if(_c) _c.remove();
  var _r=document.getElementById('pkgWizardReview'); if(_r) _r.remove();
  var _b=document.getElementById('pkgBuilder');
  if(_b){ _b.classList.remove('pkg-wizard'); for(var _i=0;_i<12;_i++) _b.classList.remove('pkg-step-'+_i); }
}
function minimizePkgBuilder() {
  document.getElementById('pkgBuilder').classList.remove('open');
  document.getElementById('pkgOverlay').classList.remove('open');
  document.getElementById('pkgMini').classList.add('show');
  _repositionMinis();
}
function restorePkgBuilder() {
  document.getElementById('pkgMini').classList.remove('show');
  // 상위 모달도 최소화되어 있으면 함께 복원
  if (window._pkgParentMinimized === 'order') {
    document.getElementById('orderOverlay').classList.add('open');
    _bringToFront(document.getElementById('orderOverlay'));
    document.getElementById('orderMini').classList.remove('show');
  } else if (window._pkgParentMinimized === 'quote') {
    document.getElementById('quoteOverlay').classList.add('open');
    _bringToFront(document.getElementById('quoteOverlay'));
    document.getElementById('quoteMini').classList.remove('show');
  }
  window._pkgParentMinimized = null;
  document.getElementById('pkgBuilder').classList.add('open');
  document.getElementById('pkgOverlay').classList.add('open');
  _bringToFront(document.getElementById('pkgOverlay'));
  _bringToFront(document.getElementById('pkgBuilder'));
  setTimeout(function() { _bringToFront(document.getElementById('pkgBuilder')); }, 50);
  document.body.style.overflow = 'hidden';
  _repositionMinis();
}
function togglePkgBuilderFS() {
  var el = document.getElementById('pkgBuilder');
  var btn = document.getElementById('pkgFsBtn');
  var isFs = el.classList.toggle('pkg-fs');
  btn.innerHTML = isFs ? '❐' : '☐';
  btn.title = isFs ? t('pkg_restore') : t('pkg_fs');
}

function _updatePkgRowRemain(ri) {
  var row = _pkgRowState[ri];
  if (!row || row.maxQty <= 0) return; // 기타는 잔여 없음
  var el = document.getElementById('pkgRowRemain' + ri);
  if (!el) return;
  var remain = row.maxQty - row.usedQty;
  if (remain > 0) {
    el.textContent = t('pkg_remain') + ' ' + remain + '/' + row.maxQty;
    el.className = 'pkg-row-remain ok';
  } else if (remain === 0) {
    el.textContent = '✓ ' + row.maxQty + '/' + row.maxQty;
    el.className = 'pkg-row-remain done';
  } else {
    el.textContent = t('pkg_remain_over') + ' ' + Math.abs(remain);
    el.className = 'pkg-row-remain over';
  }
}

function _renderPkgRight() {
  var listEl = document.getElementById('pkgRightList');
  var slideEl = document.getElementById('pkgSlideList');
  var remainEl = document.getElementById('pkgRemain');
  var badge = document.getElementById('pkgListBadge');
  var ov1ListEl = document.getElementById('pkgRightOv1List');
  var ov2ListEl = document.getElementById('pkgRightOv2List');
  var builderEl = document.getElementById('pkgBuilder');
  if (remainEl) remainEl.textContent = '';
  if (badge) badge.textContent = _pkgOrderItems.length;
  var emptyHtml = '<div class="pkg-right-empty">' + t('pkg_empty') + '</div>';
  if (!_pkgOrderItems.length) {
    if (listEl) listEl.innerHTML = emptyHtml;
    if (slideEl) slideEl.innerHTML = emptyHtml;
    if (ov1ListEl) ov1ListEl.innerHTML = '';
    if (ov2ListEl) ov2ListEl.innerHTML = '';
    if (builderEl) builderEl.classList.remove('pkg-has-ov-1','pkg-has-ov-2');
    return;
  }
  // 오버플로우 판정 (데스크탑 + 1100px 이상) — 한 패널당 13개 고정 (사용자 요청)
  // 아이템 1개 = height 40px + margin 4px = 44px (CSS: .pkg-right-list .pkg-right-item)
  var PKG_ROW_H = 44;
  var PKG_COL_MAX = 13;
  var canOverflow = (window.innerWidth >= 1100) &&
                    !document.documentElement.classList.contains('is-android');
  var total = _pkgOrderItems.length;
  var needOv1 = canOverflow && total > PKG_COL_MAX;
  var needOv2 = canOverflow && total > PKG_COL_MAX * 2;
  var mainItems = _pkgOrderItems.slice(0, PKG_COL_MAX);
  var ov1Items = needOv1 ? _pkgOrderItems.slice(PKG_COL_MAX, PKG_COL_MAX * 2) : [];
  var ov2Items = needOv2 ? _pkgOrderItems.slice(PKG_COL_MAX * 2) : [];
  // 1100px 미만이면 모두 메인 리스트에 (스크롤)
  if (!canOverflow) { mainItems = _pkgOrderItems; }
  function _pkgOriginTag(no) {
    if (!no) return '';
    var s = String(no).toUpperCase();
    if (s.indexOf('1TH') === 0) return ' <span class="pri-origin">(TH)</span>';
    if (s.indexOf('1EN') === 0) return ' <span class="pri-origin">(EN)</span>';
    return '';
  }
  function _pkgShowNo(no) {
    if (!no) return false;
    var s = String(no).toUpperCase();
    return !(s.indexOf('1TH') === 0 || s.indexOf('1EN') === 0);
  }
  function _pkgRiHtml(o, idx) {
    var tag = _pkgOriginTag(o.item.no);
    var showNo = _pkgShowNo(o.item.no);
    return '<div class="pkg-right-item">' +
      '<span class="pri-cat">' + o.label + '</span>' +
      '<div class="pri-info">' +
        '<span class="pri-model">' + o.item.model + tag + '</span>' +
        '<div class="pri-detail">' +
          (showNo ? '<span class="pri-no">' + (o.item.no || '') + '</span>' : '') +
          '<span class="pri-spec">' + (o.item.spec || o.item.name || '') + '</span>' +
        '</div>' +
      '</div>' +
      '<span class="pri-qty">x' + o.qty + '</span>' +
      '<button class="pri-del" onclick="removePkgItem(' + idx + ')" title="삭제">✕</button>' +
    '</div>';
  }
  // 메인 리스트
  if (listEl) listEl.innerHTML = mainItems.map(function(o, i) { return _pkgRiHtml(o, i); }).join('');
  // 오버플로우 1
  if (ov1ListEl) {
    ov1ListEl.innerHTML = ov1Items.map(function(o, i) {
      return _pkgRiHtml(o, i + PKG_COL_MAX);
    }).join('');
  }
  // 오버플로우 2
  if (ov2ListEl) {
    ov2ListEl.innerHTML = ov2Items.map(function(o, i) {
      return _pkgRiHtml(o, i + PKG_COL_MAX * 2);
    }).join('');
  }
  if (builderEl) {
    builderEl.classList.toggle('pkg-has-ov-1', needOv1);
    builderEl.classList.toggle('pkg-has-ov-2', needOv2);
  }
  // 모바일 슬라이드용 (수량 조정 포함)
  var mobileHtml = _pkgOrderItems.map(function(o, idx) {
    var mTag = _pkgOriginTag(o.item.no);
    var mShowNo = _pkgShowNo(o.item.no);
    return '<div class="pkg-right-item" style="flex-wrap:wrap;gap:6px;">' +
      '<span class="pri-cat">' + o.label + '</span>' +
      '<div class="pri-info">' +
        '<span class="pri-model">' + o.item.model + mTag + '</span>' +
        '<div class="pri-detail">' +
          (mShowNo ? '<span class="pri-no">' + (o.item.no || '') + '</span>' : '') +
          '<span class="pri-spec">' + (o.item.spec || o.item.name || '') + '</span>' +
        '</div>' +
      '</div>' +
      '<button class="pri-del" onclick="removePkgItem(' + idx + ')" title="삭제" style="margin-left:auto;">✕</button>' +
      '<div style="width:100%;display:flex;align-items:center;justify-content:flex-end;gap:6px;">' +
        '<div class="pkg-row-qty-group" style="border-radius:6px;">' +
          '<button class="pkg-row-qty-btn" onclick="changePkgSlideQty(' + idx + ',-1)" style="width:26px;height:26px;font-size:13px;">−</button>' +
          '<input type="number" class="pkg-row-qty-val" value="' + o.qty + '" min="1" onchange="setPkgSlideQty(' + idx + ',this.value)" style="width:36px;height:26px;font-size:12px;">' +
          '<button class="pkg-row-qty-btn" onclick="changePkgSlideQty(' + idx + ',1)" style="width:26px;height:26px;font-size:13px;">+</button>' +
        '</div>' +
        '<span style="font-size:12px;font-weight:700;color:#5b21b6;min-width:30px;text-align:right;">x' + o.qty + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
  if (slideEl) slideEl.innerHTML = mobileHtml;
}

function changePkgSlideQty(idx, delta) {
  var item = _pkgOrderItems[idx];
  if (!item) return;
  var newQty = item.qty + delta;
  if (newQty < 1) newQty = 1;
  var ri = item.ri;
  var row = _pkgRowState[ri];
  if (row && row.maxQty > 0) {
    var otherUsed = row.usedQty - item.qty;
    if (otherUsed + newQty > row.maxQty) { newQty = row.maxQty - otherUsed; }
  }
  if (newQty < 1) newQty = 1;
  var diff = newQty - item.qty;
  item.qty = newQty;
  if (row) { row.usedQty += diff; _updatePkgRowRemain(ri); }
  _renderPkgRight();
}

function setPkgSlideQty(idx, val) {
  var newQty = parseInt(val) || 1;
  if (newQty < 1) newQty = 1;
  var item = _pkgOrderItems[idx];
  if (!item) return;
  var ri = item.ri;
  var row = _pkgRowState[ri];
  if (row && row.maxQty > 0) {
    var otherUsed = row.usedQty - item.qty;
    if (otherUsed + newQty > row.maxQty) { newQty = row.maxQty - otherUsed; }
  }
  if (newQty < 1) newQty = 1;
  var diff = newQty - item.qty;
  item.qty = newQty;
  if (row) { row.usedQty += diff; _updatePkgRowRemain(ri); }
  _renderPkgRight();
}

function removePkgItem(idx) {
  var removed = _pkgOrderItems.splice(idx, 1)[0];
  if (removed) {
    var ri = removed.ri;
    if (_pkgRowState[ri]) {
      _pkgRowState[ri].usedQty -= removed.qty;
      if (_pkgRowState[ri].usedQty < 0) _pkgRowState[ri].usedQty = 0;
      _updatePkgRowRemain(ri);
    }
  }
  _renderPkgRight();
}

function pkgRowAc(ri) {
  var input = document.getElementById('pkgRowInput' + ri);
  var list = document.getElementById('pkgRowAcList' + ri);
  var q = input.value.trim().toLowerCase();
  if (!q) { list.classList.remove('open'); return; }
  if (_pkgRowState[ri].selectedItem) {
    _pkgRowState[ri].selectedItem = null;
    input.classList.remove('selected');
  }
  var f = _pkgRowState[ri].filter;
  var isEtc = _pkgRowState[ri].isEtc;
  var filtered = ITEM_DATA.filter(function(i) {
    if (i.no && i.no.startsWith('1KR')) return false;
    if (!isEtc) {
      if (f.cat && i.cat !== f.cat) return false;
      if (f.cls && i.cls !== f.cls) return false;
      if (f.clsMatch && (!i.cls || i.cls.indexOf(f.clsMatch) === -1)) return false;
    }
    return _itemSearchMatch(i, q);
  }).sort(function(a, b) {
    var aTH = a.no && a.no.startsWith('1TH') ? 0 : 1;
    var bTH = b.no && b.no.startsWith('1TH') ? 0 : 1;
    return aTH - bTH;
  }).slice(0, 10);

  if (!filtered.length) { list.classList.remove('open'); return; }
  list.innerHTML = filtered.map(function(it) {
    var idx = ITEM_DATA.indexOf(it);
    return '<div class="pkg-row-ac-item" onclick="pkgRowSelect(' + ri + ',' + idx + ')">' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span class="ac-model">' + it.model + '</span>' +
        '<span style="font-size:11px;color:#9ca3af;background:#f3f4f6;padding:1px 5px;border-radius:4px;">' + it.no + '</span>' +
      '</div>' +
      '<span class="ac-spec">' + (it.spec || it.name) + '</span>' +
    '</div>';
  }).join('');
  list.classList.add('open');
}

function pkgRowAcKey(e, ri) {
  var list = document.getElementById('pkgRowAcList' + ri);
  if (e.key === 'Escape') { list.classList.remove('open'); return; }
  if (!list.classList.contains('open')) {
    if (e.key === 'Enter' && _pkgRowState[ri].selectedItem) {
      e.preventDefault();
      addPkgRow(ri);
    }
    return;
  }
  var items = Array.from(list.querySelectorAll('.pkg-row-ac-item'));
  if (!items.length) return;
  var curIdx = items.findIndex(function(el) { return el.classList.contains('ac-hover'); });
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    var nextIdx = curIdx < items.length - 1 ? curIdx + 1 : curIdx;
    if (nextIdx === curIdx && curIdx >= 0) return;
    items.forEach(function(el) { el.classList.remove('ac-hover'); });
    items[nextIdx].classList.add('ac-hover');
    items[nextIdx].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    var prevIdx = curIdx > 0 ? curIdx - 1 : 0;
    if (prevIdx === curIdx) return;
    items.forEach(function(el) { el.classList.remove('ac-hover'); });
    items[prevIdx].classList.add('ac-hover');
    items[prevIdx].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (curIdx >= 0) items[curIdx].click();
    else if (items.length === 1) items[0].click();
  }
}

function pkgRowSelect(ri, itemIdx) {
  var item = ITEM_DATA[itemIdx];
  _pkgRowState[ri].selectedItem = item;
  var input = document.getElementById('pkgRowInput' + ri);
  input.value = item.model;
  input.classList.add('selected');
  document.getElementById('pkgRowAcList' + ri).classList.remove('open');
}

function pkgRowQtyChange(ri) {
  var v = parseInt(document.getElementById('pkgRowQty' + ri).value);
  if (isNaN(v) || v < 0) v = 0;
  document.getElementById('pkgRowQty' + ri).value = v;
  _pkgRowState[ri].qty = v;
}

function pkgRowQtyDelta(ri, delta) {
  var el = document.getElementById('pkgRowQty' + ri);
  var v = (parseInt(el.value) || 0) + delta;
  if (v < 0) v = 0;
  el.value = v;
  _pkgRowState[ri].qty = v;
}

function addPkgRow(ri) {
  var row = _pkgRowState[ri];
  if (!row || !row.selectedItem) { neoAlert(t('pkg_select_first')); return; }
  var qty = parseInt(document.getElementById('pkgRowQty' + ri).value) || 0;
  if (qty < 1) { neoAlert(t('pkg_qty_min')); return; }
  // 잔여 체크 (기타 제외)
  if (row.maxQty > 0) {
    var remain = row.maxQty - row.usedQty;
    if (remain <= 0) { neoAlert(row.label + ' ' + t('pkg_no_remain')); return; }
    if (qty > remain) { neoAlert(row.label + ' ' + t('pkg_exceed')); qty = remain; document.getElementById('pkgRowQty' + ri).value = qty; }
  }
  row.qty = qty;
  var isDup = _pkgOrderItems.some(function(o) { return o.item.model === row.selectedItem.model && o.item.no === row.selectedItem.no; });
  if (isDup) { neoAlert(t('pkg_already_added')); return; }
  _pkgOrderItems.push({ item: Object.assign({}, row.selectedItem), qty: qty, ri: ri, label: row.label });
  row.usedQty += qty;
  // 입력 초기화 — 계속 추가 가능
  row.selectedItem = null;
  var input = document.getElementById('pkgRowInput' + ri);
  if (input) { input.value = ''; input.classList.remove('selected'); }
  document.getElementById('pkgRowQty' + ri).value = 1;
  _updatePkgRowRemain(ri);
  _renderPkgRight();
  if (_pkgWizardActive) _pkgWizardRender();
}

function openPkgSlideList() {
  _renderPkgRight();
  document.getElementById('pkgSlideOverlay').classList.add('open');
  document.getElementById('pkgSlidePanel').classList.add('open');
}
function closePkgSlideList() {
  document.getElementById('pkgSlidePanel').classList.remove('open');
  setTimeout(function() { document.getElementById('pkgSlideOverlay').classList.remove('open'); }, 300);
}

function addPkgToOrder() {
  if (!_pkgOrderItems.length) { neoAlert(t('pkg_select_product')); return; }
  if (_pkgBuilderMode === 'quote') {
    // 견적 모드: quoteItems에 추가/병합 (중복 시 수량 합산)
    var added = 0, merged = 0;
    _pkgOrderItems.forEach(function(po) {
      var exist = null;
      for (var i = 0; i < quoteItems.length; i++) {
        if (quoteItems[i].name === po.item.model) { exist = quoteItems[i]; break; }
      }
      if (exist) {
        exist.qty = (Number(exist.qty) || 0) + (Number(po.qty) || 0);
        merged++;
      } else {
        quoteItems.push({ name: po.item.model, spec: po.item.spec || '', qty: po.qty, price: po.item.price || 0 });
        added++;
      }
    });
    if (added > 0 || merged > 0) renderQuoteItems();
    closePkgBuilder();
    return;
  }
  // 주문 모드: orderItems에 추가/병합 (중복 시 수량 합산)
  var added = 0, merged = 0;
  _pkgOrderItems.forEach(function(po) {
    var exist = null;
    for (var i = 0; i < orderItems.length; i++) {
      if (orderItems[i].item.model === po.item.model && orderItems[i].item.no === po.item.no) {
        exist = orderItems[i]; break;
      }
    }
    if (exist) {
      exist.qty = (Number(exist.qty) || 0) + (Number(po.qty) || 0);
      merged++;
    } else {
      orderItems.push({ item: Object.assign({}, po.item), qty: po.qty });
      added++;
    }
  });
  if (added > 0 || merged > 0) renderOrderItems();
  closePkgBuilder();
  // 다음 단계(배송 정보)로 이동
  if (typeof goToStep3 === 'function') goToStep3();
}

// 메가메뉴 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
  var tree = document.getElementById('catTree');
  if (tree && !tree.contains(e.target)) {
    var mega = document.getElementById('catMega');
    if (mega && mega.classList.contains('open')) {
      // DOM 재구성으로 e.target이 분리될 수 있으므로 좌표 기반으로도 체크
      var rect = mega.getBoundingClientRect();
      var inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) _closeCatMega();
    }
  }
  var qtTree = document.getElementById('qtCatTree');
  var qtMega = document.getElementById('qtCatMega');
  if (qtTree && qtMega && qtMega.classList.contains('open')) {
    // DOM 재구성으로 e.target이 분리될 수 있으므로, 좌표 기반으로도 체크
    if (!qtTree.contains(e.target)) {
      var rect = qtMega.getBoundingClientRect();
      var inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) _closeQtCatMega();
    }
  }
});

function itemAutocomplete() {
  const q = document.getElementById('itemSearchInput').value.trim().toLowerCase();
  const list = document.getElementById('itemAcList');
  if (!q) { list.classList.remove('open'); return; }

  const filtered = ITEM_DATA.filter(i => {
    if (i.no && i.no.startsWith('1KR')) return false;
    if (orderCurrentCat === '_TREE_' && window._catTreeFilter) {
      if (!_matchTreeFilter(i, window._catTreeFilter)) return false;
    } else if (orderCurrentCat === '_TREE_MULTI_' && window._catTreeFilters) {
      var matched = window._catTreeFilters.some(function(f) { return _matchTreeFilter(i, f); });
      if (!matched) return false;
    } else if (orderCurrentCat === '_MANUAL_') {
      return false;
    } else if (orderCurrentCat !== 'ALL' && i.cat !== orderCurrentCat) return false;
    return _itemSearchMatch(i, q);
  }).sort((a, b) => {
    const aTH = a.no && a.no.startsWith('1TH') ? 0 : 1;
    const bTH = b.no && b.no.startsWith('1TH') ? 0 : 1;
    return aTH - bTH;
  }).slice(0, 10);

  if (!filtered.length) { list.classList.remove('open'); return; }

  list.innerHTML = filtered.map((it, idx) => {
    var p = _getItemPrice(it);
    var priceHtml = p.retail ? '<span style="font-weight:700;color:#7c3aed;font-size:12px;margin-left:auto;white-space:nowrap;">฿' + Number(p.retail).toLocaleString() + '</span>' : '';
    return `<div class="item-ac-item" onclick="selectItem(${ITEM_DATA.indexOf(it)})" onmouseenter="this.parentNode.querySelectorAll('.item-ac-item').forEach(function(el){el.classList.remove('ac-hover')})">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="ac-model">${it.model}</span>
        <span style="font-size:10px;color:#9ca3af;background:#f3f4f6;padding:1px 5px;border-radius:4px;">${it.no}</span>
        <span style="font-size:10px;color:#059669;background:#ecfdf5;padding:1px 5px;border-radius:4px;">${it.cls || it.cat}</span>
        ${priceHtml}
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <span class="ac-spec">${it.name}</span>
        <span style="color:#9ca3af;font-size:11px;">|</span>
        <span class="ac-spec">${it.spec}</span>
      </div>
    </div>`;
  }).join('');
  list.classList.add('open');
}

function itemAcKeydown(e) {
  var list = document.getElementById('itemAcList');
  if (e.key === 'Escape') { list.classList.remove('open'); return; }
  if (!list.classList.contains('open')) {
    // 자동완성 닫힘 + 제품 선택된 상태 → Enter로 수량 포커스
    if (e.key === 'Enter' && orderSelectedItem) {
      e.preventDefault();
      var qtyInput = document.getElementById('itemQty');
      if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
    }
    return;
  }
  var items = Array.from(list.querySelectorAll('.item-ac-item'));
  if (!items.length) return;
  var curIdx = items.findIndex(function(el) { return el.classList.contains('ac-hover'); });
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    var nextIdx = curIdx < items.length - 1 ? curIdx + 1 : curIdx;
    if (nextIdx === curIdx && curIdx >= 0) return;
    items.forEach(function(el) { el.classList.remove('ac-hover'); });
    items[nextIdx].classList.add('ac-hover');
    items[nextIdx].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    var prevIdx = curIdx > 0 ? curIdx - 1 : 0;
    if (prevIdx === curIdx) return;
    items.forEach(function(el) { el.classList.remove('ac-hover'); });
    items[prevIdx].classList.add('ac-hover');
    items[prevIdx].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (curIdx >= 0) items[curIdx].click();
    else if (items.length === 1) items[0].click();
  }
}

function selectItem(idx) {
  orderSelectedItem = ITEM_DATA[idx];
  document.getElementById('itemSearchInput').value = orderSelectedItem.model;
  document.getElementById('itemAcList').classList.remove('open');
  var info = document.getElementById('selItemInfo');
  info.innerHTML = `<b>${escHtml(orderSelectedItem.model)}</b> <span style="color:#9ca3af;">|</span> <span style="color:#6b7280">${escHtml(orderSelectedItem.spec)}</span> <span style="color:#9ca3af;">|</span> ${escHtml(orderSelectedItem.name)}`;
  var _sp = _getItemPrice(orderSelectedItem);
  var priceInput = document.getElementById('selItemPrice');
  priceInput.value = _fmtPriceComma(_sp.retail || 0);
  document.getElementById('itemQty').value = 1;
  document.getElementById('selItemWrap').style.display = '';
  _updateSelTotal();
}

// 가격 콤마 포맷 헬퍼
function _parsePriceVal(str) { return parseFloat(String(str).replace(/,/g, '')) || 0; }
function _fmtPriceComma(v) { var n = parseFloat(v) || 0; return n > 0 ? n.toLocaleString() : '0'; }
function _onPriceInput(el) {
  var raw = el.value.replace(/[^0-9.]/g, '');
  var num = parseFloat(raw) || 0;
  var pos = el.selectionStart;
  var oldLen = el.value.length;
  el.value = num > 0 ? num.toLocaleString() : '';
  var newLen = el.value.length;
  el.setSelectionRange(pos + (newLen - oldLen), pos + (newLen - oldLen));
}
function _onPriceBlur(el) {
  var num = _parsePriceVal(el.value);
  el.value = num > 0 ? num.toLocaleString() : '0';
}

function _updateSelTotal() {
  var price = _parsePriceVal(document.getElementById('selItemPrice').value);
  var qty = parseInt(document.getElementById('itemQty').value) || 1;
  var total = price * qty;
  document.getElementById('selItemTotal').textContent = total > 0 ? '฿' + total.toLocaleString() : '-';
}

// 무상 체크박스 토글: 체크 시 가격 0, 해제 시 원가 복구
function _onItemFreeToggle() {
  var cb = document.getElementById('itemFree');
  var priceInput = document.getElementById('selItemPrice');
  if (!cb || !priceInput) return;
  if (cb.checked) {
    priceInput.dataset.prevPrice = priceInput.value || '0';
    priceInput.value = '0';
    priceInput.disabled = true;
  } else {
    priceInput.disabled = false;
    if (priceInput.dataset.prevPrice) {
      priceInput.value = priceInput.dataset.prevPrice;
      delete priceInput.dataset.prevPrice;
    }
  }
  _updateSelTotal();
}

function addOrderItem() {
  if (!orderSelectedItem) { neoAlert(t('msg_select_item')); return; }
  const qty = parseInt(document.getElementById('itemQty').value) || 1;
  if (qty < 1) { neoAlert(t('msg_qty_min')); return; }
  var freeCb = document.getElementById('itemFree');
  var isFree = !!(freeCb && freeCb.checked);
  // 무상 아이템은 중복 허용. 무상이 아닌 경우에만 중복 체크
  if (!isFree) {
    const isDuplicate = orderItems.some(o => !o._isFree && o.item.model === orderSelectedItem.model && o.item.no === orderSelectedItem.no);
    if (isDuplicate) { neoAlert(t('msg_dup_item')); return; }
  }
  var _selPrice = isFree ? 0 : _parsePriceVal(document.getElementById('selItemPrice').value);
  // 직접출고(일반출고)일 때: 위탁 출고 내역 체크
  if (orderShipType === '일반출고' && orderCustomer && orderCustomer.erp) {
    _checkConsignConflict(orderSelectedItem, qty, _selPrice, isFree);
    return;
  }
  _doAddOrderItem(qty, _selPrice, isFree);
}

function _doAddOrderItem(qty, _selPrice, isFree) {
  var _newItem = { item: {...orderSelectedItem}, qty, _price: isFree ? 0 : _selPrice };
  if (isFree) _newItem._isFree = true;
  orderItems.push(_newItem);
  orderSelectedItem = null;
  document.getElementById('itemSearchInput').value = '';
  document.getElementById('itemQty').value = 1;
  // 무상 체크박스 및 가격 입력 초기화
  var _priceInput = document.getElementById('selItemPrice');
  if (_priceInput) { _priceInput.disabled = false; delete _priceInput.dataset.prevPrice; }
  var _freeCb = document.getElementById('itemFree');
  if (_freeCb) _freeCb.checked = false;
  document.getElementById('selItemWrap').style.display = 'none';
  renderOrderItems();
  document.getElementById('itemSearchInput').focus();
}

async function _checkConsignConflict(item, qty, price, isFree) {
  var erp = orderCustomer.erp;
  var erpClean = String(erp).replace(/^W/i, '');
  var erpW = 'W' + erpClean;
  var erpSet = {};
  [erp, erpClean, erpW].forEach(function(e) { erpSet[e] = true; });
  var erpList = Object.keys(erpSet);
  var model = item.model || item.no || '';
  if (!model) { _doAddOrderItem(qty, price, isFree); return; }
  try {
    var found = [];
    for (var i = 0; i < erpList.length; i++) {
      var snap = await _fbDb.collection('consignment_master')
        .where('c', '==', erpList[i])
        .where('p', '==', model)
        .where('st', '==', 'BORROW')
        .get();
      snap.forEach(function(doc) { found.push(doc.data()); });
    }
    if (found.length) {
      var totalQty = 0;
      found.forEach(function(r) { totalQty += (parseInt(r.q) || 1); });
      // BR별 그룹핑: 날짜, BR번호, 수량
      var brMap = {};
      var brOrder = [];
      found.forEach(function(r) {
        var br = r.b || '-';
        if (!brMap[br]) { brMap[br] = { d: r.d || '-', q: 0 }; brOrder.push(br); }
        brMap[br].q += (parseInt(r.q) || 1);
      });
      var t = function(k) { return (TRANSLATIONS && TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][k]) || (TRANSLATIONS && TRANSLATIONS.ko && TRANSLATIONS.ko[k]) || k; };
      var html = '<div style="font-weight:700;color:#92400e;margin-bottom:8px;">' + t('cc_title') + '</div>';
      html += '<div style="font-size:13px;margin-bottom:4px;"><b>' + t('cc_model') + ':</b> ' + model + '</div>';
      html += '<div style="font-size:13px;margin-bottom:8px;"><b>' + t('cc_unsettled') + ':</b> ' + totalQty + '</div>';
      // 테이블
      var showBRs = brOrder.slice(0, 8);
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px;">';
      html += '<thead><tr style="background:#fef3c7;"><th style="padding:4px 8px;text-align:left;border-bottom:1px solid #e5e7eb;">' + t('cc_date') + '</th><th style="padding:4px 8px;text-align:left;border-bottom:1px solid #e5e7eb;">' + t('cc_br') + '</th><th style="padding:4px 8px;text-align:center;border-bottom:1px solid #e5e7eb;">' + t('cc_qty') + '</th></tr></thead><tbody>';
      showBRs.forEach(function(br) {
        var info = brMap[br];
        html += '<tr><td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;">' + info.d + '</td><td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#6b7280;">' + br + '</td><td style="padding:3px 8px;text-align:center;border-bottom:1px solid #f1f5f9;font-weight:600;">' + info.q + '</td></tr>';
      });
      html += '</tbody></table>';
      if (brOrder.length > 8) html += '<div style="font-size:11px;color:#6b7280;margin-bottom:8px;">' + t('cc_more').replace('{n}', brOrder.length - 8) + '</div>';
      html += '<div style="font-size:13px;color:#374151;margin-top:4px;">' + t('cc_confirm_msg') + '<br><span style="font-size:12px;color:#6b7280;">' + t('cc_cancel_msg') + '</span></div>';
      neoConfirmHtml(html, function(yes) {
        if (yes) {
          _doAddOrderItem(qty, price, isFree);
        }
        // 취소 시 아무것도 안 함 — 사용자가 위탁정산으로 전환 가능
      });
    } else {
      _doAddOrderItem(qty, price, isFree);
    }
  } catch(e) {
    console.warn('[consign check]', e);
    _doAddOrderItem(qty, price, isFree);
  }
}

function removeOrderItem(idx) {
  // 위탁정산 참조가 있으면 settle_ref도 정리
  var removed = orderItems[idx];
  if (removed && removed._settleRef) {
    var refKey = removed._settleRef.orderId + '_' + (removed._settleRef.item_no || removed._settleRef.item_model);
    _settleRefs = _settleRefs.filter(function(r) {
      return (r.orderId + '_' + (r.item_no || r.item_model)) !== refKey;
    });
    setTimeout(function() { renderConsignBRList(); renderConsignItems(); }, 100);
  }
  orderItems.splice(idx, 1);
  renderOrderItems();
}

function _oiQtyChange(idx, delta) {
  var inp = document.getElementById('oi-qty-' + idx);
  if (!inp) return;
  var v = parseInt(inp.value) || 1;
  v += delta;
  if (v < 1) v = 1;
  inp.value = v;
  oiQtyChanged(idx);
}

function oiQtyChanged(idx) {
  var input = document.getElementById('oi-qty-' + idx);
  var val = parseInt(input.value) || 1;
  if (val < 1) val = 1;
  if (val > 99999) val = 99999;
  input.value = val;
  orderItems[idx].qty = val;
  _updateOiTotal(idx);
}

function oiPriceChanged(idx) {
  var input = document.getElementById('oi-price-' + idx);
  var val = Math.max(0, _parsePriceVal(input.value));
  orderItems[idx]._price = val;
  input.value = _fmtPriceComma(val);
  _updateOiTotal(idx);
}

// 리스트 내 무상 체크박스 토글
function _oiFreeToggle(idx, checked) {
  var oi = orderItems[idx];
  if (!oi) return;
  if (checked) {
    oi._isFree = true;
    oi._price = 0;
    renderOrderItems();
    return;
  }
  // 무상 해제 시: 같은 아이템이 리스트에 이미 있으면 중복이 되므로 제거
  var model = oi.item.model;
  var no = oi.item.no;
  var hasOther = orderItems.some(function(o, j) {
    return j !== idx && o.item.model === model && o.item.no === no;
  });
  if (hasOther) {
    // 중복 → 리스트에서 제거
    orderItems.splice(idx, 1);
    renderOrderItems();
    showToast('⚠️ 중복 아이템 제거됨: ' + model);
    return;
  }
  // 중복 없음 → 무상만 해제, 원래 가격 복구
  oi._isFree = false;
  var _oip = _getItemPrice(oi.item);
  oi._price = _oip.retail || 0;
  renderOrderItems();
}

function _updateOiTotal(idx) {
  var qty = orderItems[idx].qty || 1;
  var price = orderItems[idx]._price || 0;
  var totalEl = document.getElementById('oi-total-' + idx);
  if (totalEl) totalEl.textContent = price > 0 ? '฿' + (qty * price).toLocaleString() : '-';
  _updateOiGrandTotal();
}

var _pkgFinalPrice = 0;

function _updateOiGrandTotal() {
  var sum = 0;
  if (orderShipType === '패키지출고') {
    sum = _pkgFinalPrice || 0;
  } else {
    orderItems.forEach(function(oi) { sum += (oi.qty || 1) * (oi._price || 0); });
  }
  var el = document.getElementById('oiGrandTotal');
  if (el) el.textContent = sum > 0 ? '฿' + sum.toLocaleString() : '';
}

// ── 이전 견적 불러오기 (Load Previous Quotes) ──────────────────────────────
var _prevQuoteItems = []; // 선택한 견적의 아이템 (편집용 임시)

async function loadPrevQuotes() {
  if (!orderCustomer || !orderCustomer.erp) {
    neoAlert(t('prev_quote_no_cust') || '고객을 먼저 선택해주세요.');
    return;
  }
  var ov = document.getElementById('prevQuoteOverlay');
  var body = document.getElementById('prevQuoteBody');
  ov.style.display = 'flex';
  body.innerHTML = '<div style="padding:40px;text-align:center;color:#d97706;font-size:14px;">⏳ ' + (t('prev_quote_loading') || '견적 조회 중...') + '</div>';

  try {
    var erp = orderCustomer.erp;
    var erpClean = String(erp).replace(/^W/i, '');
    var erpW = 'W' + erpClean;
    var erpSet = {};
    [erp, erpClean, erpW].forEach(function(e) { erpSet[e] = true; });
    var erpList = Object.keys(erpSet);

    var quotes = [];
    for (var i = 0; i < erpList.length; i++) {
      var snap = await _fbDb.collection('quotes')
        .where('customer_erp', '==', erpList[i])
        .get();
      snap.forEach(function(doc) {
        var q = doc.data();
        if (q.status === 'cancelled') return;
        q._docId = doc.id;
        // items가 string이면 parse
        if (typeof q.items === 'string') {
          try { q.items = JSON.parse(q.items); } catch(e) { q.items = []; }
        }
        if (!q.items || !q.items.length) return;
        // 중복 방지
        if (!quotes.some(function(x) { return x.id === q.id || x._docId === q._docId; })) {
          quotes.push(q);
        }
      });
    }

    if (!quotes.length) {
      body.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:14px;">' + (t('prev_quote_none') || '제출된 견적이 없습니다.') + '</div>';
      return;
    }

    // 최신순 정렬
    quotes.sort(function(a, b) { return (b.date || b.requested_at || '').localeCompare(a.date || a.requested_at || ''); });

    _renderPrevQuoteList(quotes);
  } catch(e) {
    console.error('[loadPrevQuotes]', e);
    body.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;font-size:14px;">조회 실패: ' + e.message + '</div>';
  }
}

function _renderPrevQuoteList(quotes) {
  var body = document.getElementById('prevQuoteBody');
  var html = '<div style="padding:8px 16px 6px;font-size:12px;color:#6b7280;border-bottom:1px solid #f1f5f9;background:#fffbeb;">' + (t('prev_quote_count') || '견적') + ' ' + quotes.length + (t('prev_quote_count_suffix') || '건') + '</div>';
  quotes.forEach(function(q, idx) {
    var dateStr = (q.date || q.requested_at || '').substring(0, 10);
    var statusBg = q.status === 'approved' ? '#d1fae5' : (q.status === 'pending' ? '#fef3c7' : '#f3f4f6');
    var statusColor = q.status === 'approved' ? '#065f46' : (q.status === 'pending' ? '#92400e' : '#6b7280');
    var statusText = q.status === 'approved' ? (t('prev_quote_approved') || '승인') : (q.status === 'pending' ? (t('prev_quote_pending') || '대기') : (q.status || '-'));
    var itemCount = (q.items || []).length;
    var total = q.total || 0;
    var docNo = q.docNo || q.id || '';
    html += '<div onclick="_selectPrevQuote(' + idx + ')" style="padding:12px 16px;border-bottom:1px solid #f1f5f9;cursor:pointer;transition:background .12s;" onmouseover="this.style.background=\'#fffbeb\'" onmouseout="this.style.background=\'#fff\'">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;">';
    html += '<div style="display:flex;align-items:center;gap:8px;">';
    html += '<span style="font-size:14px;font-weight:700;color:#1f2937;">' + docNo + '</span>';
    html += '<span style="background:' + statusBg + ';color:' + statusColor + ';font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;">' + statusText + '</span>';
    html += '</div>';
    html += '<span style="font-size:12px;color:#6b7280;">' + dateStr + '</span>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:12px;margin-top:4px;">';
    html += '<span style="font-size:12px;color:#6b7280;">' + (t('prev_quote_items') || '아이템') + ' ' + itemCount + (t('prev_quote_items_suffix') || '건') + '</span>';
    if (total > 0) html += '<span style="font-size:12px;font-weight:700;color:#7c3aed;">฿' + total.toLocaleString() + '</span>';
    if (q.requested_by_name) html += '<span style="font-size:11px;color:#9ca3af;">' + q.requested_by_name + '</span>';
    html += '</div>';
    html += '</div>';
  });
  body.innerHTML = html;
  // 인덱스에 저장
  window._prevQuotesData = quotes;
}

function _selectPrevQuote(idx) {
  _prevQuoteSelectedIdx = idx;
  var q = window._prevQuotesData[idx];
  if (!q) return;
  var items = q.items || [];
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch(e) { items = []; }
  }
  // ITEM_DATA에서 full item 정보 매칭
  _prevQuoteItems = items.map(function(qi) {
    var model = qi.name || qi.model || '';
    var spec = qi.spec || '';
    var fullItem = null;
    if (typeof ITEM_DATA !== 'undefined') {
      fullItem = ITEM_DATA.find(function(it) { return it.model === model; });
      if (!fullItem && spec) {
        fullItem = ITEM_DATA.find(function(it) { return it.model === model && it.spec === spec; });
      }
    }
    return {
      item: fullItem ? { no: fullItem.no, model: fullItem.model, name: fullItem.name, spec: fullItem.spec } : { no: '', model: model, name: model, spec: spec },
      qty: parseInt(qi.qty) || 1,
      _price: parseFloat(qi.price) || 0,
      _matched: !!fullItem
    };
  });
  _renderPrevQuoteConfirm(q);
}

function _renderPrevQuoteConfirm(q) {
  var body = document.getElementById('prevQuoteBody');
  var dateStr = (q.date || q.requested_at || '').substring(0, 10);
  var html = '';
  // 헤더: 견적 정보
  html += '<div style="padding:10px 16px;background:#fffbeb;border-bottom:1px solid #fde68a;display:flex;align-items:center;justify-content:space-between;">';
  html += '<div>';
  html += '<div style="font-size:13px;font-weight:700;color:#92400e;">' + (q.docNo || q.id || '') + ' <span style="font-weight:400;color:#b45309;">(' + dateStr + ')</span></div>';
  if (q.notes) html += '<div style="font-size:11px;color:#b45309;margin-top:2px;">' + q.notes + '</div>';
  html += '</div>';
  html += '<button onclick="_renderPrevQuoteList(window._prevQuotesData)" style="padding:4px 12px;border:1px solid #d97706;border-radius:6px;background:#fff;color:#d97706;font-size:12px;font-weight:600;cursor:pointer;">← ' + (t('prev_quote_back') || '목록') + '</button>';
  html += '</div>';

  // 테이블 헤더
  html += '<div style="display:grid;grid-template-columns:30px 1fr 140px 100px 100px 30px;gap:4px;padding:6px 16px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">';
  html += '<span>#</span><span>MODEL | SPEC | NAME</span><span style="text-align:right;">UNIT PRICE</span><span style="text-align:center;">QTY</span><span style="text-align:right;">TOTAL</span><span></span>';
  html += '</div>';

  // 아이템 행
  var grandTotal = 0;
  _prevQuoteItems.forEach(function(pi, i) {
    var lineTotal = (pi._price || 0) * (pi.qty || 1);
    grandTotal += lineTotal;
    var matchBg = pi._matched ? '' : 'background:#fef2f2;';
    html += '<div style="display:grid;grid-template-columns:30px 1fr 140px 100px 100px 30px;gap:4px;align-items:center;padding:8px 16px;border-bottom:1px solid #f1f5f9;' + matchBg + '">';
    html += '<span style="font-size:12px;color:#9ca3af;font-weight:700;">' + (i + 1) + '</span>';
    html += '<div style="min-width:0;">';
    html += '<div style="font-size:13px;font-weight:600;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (pi.item.model || '-');
    if (pi.item.spec) html += ' <span style="color:#9ca3af;">|</span> <span style="color:#6b7280;font-weight:400;">' + pi.item.spec + '</span>';
    if (pi.item.name && pi.item.name !== pi.item.model) html += ' <span style="color:#9ca3af;">|</span> <span style="color:#374151;font-weight:400;">' + pi.item.name + '</span>';
    html += '</div>';
    if (!pi._matched) html += '<div style="font-size:10px;color:#ef4444;">⚠ ' + (t('prev_quote_not_found') || '품목 데이터 미확인') + '</div>';
    html += '</div>';
    html += '<div><input type="text" inputmode="numeric" value="' + _fmtPriceComma(pi._price) + '" onchange="_pqPriceChange(' + i + ',this)" oninput="_onPriceInput(this)" onblur="_onPriceBlur(this)" onfocus="this.select()" style="width:100%;padding:4px 8px;border:1.5px solid #d1d5db;border-radius:6px;text-align:right;font-size:13px;font-weight:600;box-sizing:border-box;"></div>';
    html += '<div style="display:flex;align-items:center;justify-content:center;gap:2px;">';
    html += '<button onclick="_pqQtyChange(' + i + ',-1)" style="width:26px;height:28px;border:none;border-radius:4px 0 0 4px;background:#f3f4f6;color:#374151;font-size:13px;font-weight:700;cursor:pointer;">−</button>';
    html += '<input type="number" id="pqQty_' + i + '" value="' + pi.qty + '" min="1" onchange="_pqQtyInput(' + i + ',this)" onfocus="this.select()" style="width:40px;height:28px;border:1.5px solid #d1d5db;border-left:none;border-right:none;text-align:center;font-size:13px;font-weight:700;outline:none;">';
    html += '<button onclick="_pqQtyChange(' + i + ',1)" style="width:26px;height:28px;border:none;border-radius:0 4px 4px 0;background:#f3f4f6;color:#374151;font-size:13px;font-weight:700;cursor:pointer;">+</button>';
    html += '</div>';
    html += '<div style="text-align:right;font-weight:700;color:#1e293b;font-size:13px;">' + (lineTotal > 0 ? '฿' + lineTotal.toLocaleString() : '-') + '</div>';
    html += '<button onclick="_pqRemoveItem(' + i + ')" style="background:none;border:none;font-size:14px;cursor:pointer;color:#9ca3af;" title="삭제">✕</button>';
    html += '</div>';
  });

  // 합계
  html += '<div style="display:flex;justify-content:flex-end;padding:10px 16px;font-size:14px;font-weight:700;color:#1e293b;border-top:2px solid #e5e7eb;">' + (t('prev_quote_total') || '합계') + ': <span style="margin-left:8px;color:#7c3aed;">฿' + grandTotal.toLocaleString() + '</span></div>';

  // 확인 버튼
  html += '<div style="padding:12px 16px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:10px;background:#f9fafb;">';
  html += '<button onclick="closePrevQuoteOverlay()" style="padding:10px 20px;border:1.5px solid #d1d5db;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;">' + (t('btn_cancel') || '취소') + '</button>';
  html += '<button onclick="confirmPrevQuote()" style="padding:10px 24px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">✓ ' + (t('prev_quote_confirm') || '불러오기 확인') + '</button>';
  html += '</div>';

  body.innerHTML = html;
}

var _prevQuoteSelectedIdx = 0;

function _pqPriceChange(idx, input) {
  var v = _parsePriceVal(input.value);
  _prevQuoteItems[idx]._price = v;
  input.value = _fmtPriceComma(v);
  _renderPrevQuoteConfirm(window._prevQuotesData[_prevQuoteSelectedIdx] || {});
}

function _pqQtyChange(idx, delta) {
  var pi = _prevQuoteItems[idx];
  if (!pi) return;
  var inp = document.getElementById('pqQty_' + idx);
  var v = (parseInt(inp ? inp.value : pi.qty) || 1) + delta;
  if (v < 1) v = 1;
  pi.qty = v;
  if (inp) inp.value = v;
  _renderPrevQuoteConfirm(window._prevQuotesData[_prevQuoteSelectedIdx] || {});
}

function _pqQtyInput(idx, input) {
  var v = parseInt(input.value) || 1;
  if (v < 1) v = 1;
  _prevQuoteItems[idx].qty = v;
  _renderPrevQuoteConfirm(window._prevQuotesData[_prevQuoteSelectedIdx] || {});
}

function _pqRemoveItem(idx) {
  _prevQuoteItems.splice(idx, 1);
  if (!_prevQuoteItems.length) {
    _renderPrevQuoteList(window._prevQuotesData);
    return;
  }
  _renderPrevQuoteConfirm(window._prevQuotesData[_prevQuoteSelectedIdx] || {});
}

function confirmPrevQuote() {
  if (!_prevQuoteItems.length) return;
  _prevQuoteItems.forEach(function(pi) {
    // 중복 체크
    var dup = orderItems.some(function(oi) {
      return oi.item.model === pi.item.model && (oi.item.no === pi.item.no || (!oi.item.no && !pi.item.no));
    });
    if (dup) return;
    // 가격 조회: 견적 가격이 0이면 현재가 조회
    var price = pi._price;
    if (!price && pi.item.no) {
      var pInfo = _getItemPrice(pi.item);
      price = _parsePriceVal(pInfo.price || pInfo.retail || 0);
    }
    orderItems.push({
      item: Object.assign({}, pi.item),
      qty: pi.qty || 1,
      _price: price || 0
    });
  });
  renderOrderItems();
  closePrevQuoteOverlay();
  showOrderStep(2, 'forward');
  showToast((t('prev_quote_loaded') || '견적 아이템이 추가되었습니다.'));
}

function closePrevQuoteOverlay() {
  document.getElementById('prevQuoteOverlay').style.display = 'none';
  _prevQuoteItems = [];
}

function renderOrderItems() {
  const el = document.getElementById('orderItemsList');
  if (!orderItems.length) { el.innerHTML = ''; document.getElementById('submitOrderBtn').disabled = true; return; }
  var isPkg = orderShipType === '패키지출고';
  var hdr = isPkg
    ? `<div class="oi-table-hdr" style="grid-template-columns:30px 1fr 80px 30px;">
        <span>#</span><span>Model | Spec | Name</span><span style="text-align:center;">Qty</span><span></span>
      </div>`
    : `<div class="oi-table-hdr">
        <span>#</span><span>Model | Spec | Name</span><span style="text-align:right;">Unit Price</span><span style="text-align:center;">Qty</span><span style="text-align:center;">무상</span><span style="text-align:right;">Total</span><span></span>
      </div>`;
  el.innerHTML = hdr + orderItems.map((oi, i) => {
    var _oip = _getItemPrice(oi.item);
    var unitPrice = oi._isFree ? 0 : (oi._price || _oip.retail || 0);
    oi._price = unitPrice;
    var total = unitPrice * oi.qty;
    if (isPkg) {
      return `<div class="order-item-row" style="grid-template-columns:30px 1fr 80px 30px;">
        <span class="oi-num">${i+1}</span>
        <div class="oi-info">
          <div class="oi-model">${oi.item.model} <span style="font-weight:400;color:#9ca3af;">|</span> <span style="font-weight:400;color:#6b7280;">${oi.item.spec}</span> <span style="font-weight:400;color:#9ca3af;">|</span> <span style="font-weight:400;color:#374151;">${oi.item.name}</span></div>
        </div>
        <div class="oi-qty-wrap">
          <button class="oi-qty-btn" onclick="_oiQtyChange(${i},-1)">−</button>
          <input class="oi-qty-val" id="oi-qty-${i}" type="number" min="1" value="${oi.qty}" onchange="oiQtyChanged(${i})" onfocus="this.select()">
          <button class="oi-qty-btn" onclick="_oiQtyChange(${i},1)">+</button>
        </div>
        <button class="oi-del" onclick="removeOrderItem(${i})" title="삭제" style="background:none;border:none;font-size:14px;cursor:pointer;color:#9ca3af;">&#x2715;</button>
      </div>`;
    }
    var settleBadge = oi._settleRef ? '<span style="display:inline-block;background:#c4b5fd;color:#5b21b6;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:6px;vertical-align:middle;">위탁정산</span><span style="display:inline-block;font-size:9px;color:#9ca3af;margin-left:4px;">' + (oi._settleRef.orderId || '').substring(0, 16) + '</span>' : '';
    var _mobPriceHtml = '₿' + unitPrice.toLocaleString() + ' = <strong style="color:#7c3aed">₿' + total.toLocaleString() + '</strong>';
    var _freeBadge = oi._isFree ? '<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:6px;vertical-align:middle;">무상</span>' : '';
    return `<div class="order-item-row"${oi._settleRef ? ' style="background:#faf5ff;"' : (oi._isFree ? ' style="background:#fffbeb;"' : '')}>
      <span class="oi-num">${i+1}</span>
      <div class="oi-info">
        <div class="oi-model">${oi.item.model} <span style="font-weight:400;color:#9ca3af;">|</span> <span style="font-weight:400;color:#6b7280;">${oi.item.spec}</span> <span style="font-weight:400;color:#9ca3af;">|</span> <span style="font-weight:400;color:#374151;">${oi.item.name}</span>${settleBadge}${_freeBadge}</div>
        <div class="oi-mob-price" style="display:none;">${_mobPriceHtml}</div>
      </div>
      <div><input class="oi-price-input" id="oi-price-${i}" type="text" inputmode="numeric" value="${_fmtPriceComma(unitPrice)}" ${oi._isFree?'disabled':''} onchange="oiPriceChanged(${i})" oninput="_onPriceInput(this)" onblur="_onPriceBlur(this)" onfocus="this.select()" draggable="false" ondragstart="return false"></div>
      <div class="oi-qty-wrap">
        <button class="oi-qty-btn" onclick="_oiQtyChange(${i},-1)">−</button>
        <input class="oi-qty-val" id="oi-qty-${i}" type="number" min="1" value="${oi.qty}" onchange="oiQtyChanged(${i})" onfocus="this.select()">
        <button class="oi-qty-btn" onclick="_oiQtyChange(${i},1)">+</button>
      </div>
      <label style="display:flex;align-items:center;justify-content:center;cursor:pointer;"><input type="checkbox" ${oi._isFree?'checked':''} onchange="_oiFreeToggle(${i},this.checked)" style="width:18px;height:18px;accent-color:#7c3aed;cursor:pointer;"></label>
      <div class="oi-total" id="oi-total-${i}">${total > 0 ? '฿' + total.toLocaleString() : '-'}</div>
      <button class="oi-del" onclick="removeOrderItem(${i})" title="삭제" style="background:none;border:none;font-size:14px;cursor:pointer;color:#9ca3af;">&#x2715;</button>
    </div>`;
  }).join('');

  // 패키지 모드: 최종 패키지 가격 입력
  if (isPkg) {
    var _pkgVal = typeof _pkgFinalPrice !== 'undefined' ? _pkgFinalPrice : 0;
    el.innerHTML += `<div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 12px;border-top:2px solid #c4b5fd;margin-top:8px;">
      <span style="font-size:14px;font-weight:700;color:#5b21b6;">📦 패키지 최종 가격</span>
      <span style="font-size:15px;font-weight:700;color:#7c3aed;">฿</span>
      <input type="text" inputmode="numeric" id="pkgFinalPriceInput" class="oi-price-input" value="${_fmtPriceComma(_pkgVal)}"
        oninput="_onPriceInput(this)" onblur="_onPriceBlur(this);_pkgFinalPrice=_parsePriceVal(this.value);_updateOiGrandTotal();"
        onchange="_pkgFinalPrice=_parsePriceVal(this.value);_updateOiGrandTotal();"
        onfocus="this.select()" style="width:160px;font-size:15px;padding:8px 12px;border:2px solid #c4b5fd;color:#5b21b6;">
    </div>`;
  } else {
    var _oiSum = 0; orderItems.forEach(function(oi){ _oiSum += (oi.qty||1)*(oi._price||0); });
    window._orderRawTotal = _oiSum;
    el.innerHTML += `<div style="display:flex;justify-content:flex-end;padding:8px 12px;font-size:14px;font-weight:700;color:#1e293b;">합계: <span id="oiGrandTotal" style="margin-left:8px;color:#7c3aed;">${_oiSum>0?'฿'+_oiSum.toLocaleString():''}</span></div>`;
    // 합계 요청 금액 + 할인율
    var _oReqVal = typeof window._orderRequestTotal !== 'undefined' ? window._orderRequestTotal : '';
    var _oDiscVal = typeof window._orderDiscountRate !== 'undefined' ? window._orderDiscountRate : '';
    el.innerHTML += `<div style="text-align:right;margin-top:8px;font-size:14px;color:#374151;display:flex;align-items:center;justify-content:flex-end;gap:8px;">
      <span>합계 요청 금액</span>:
      <input type="number" id="orderRequestTotal" min="0" step="1" value="${_oReqVal}" placeholder="직접 입력..." oninput="applyOrderDiscount()" style="width:140px;padding:6px 10px;border:2px solid #7c3aed;border-radius:8px;font-size:15px;font-weight:600;color:#7c3aed;text-align:right;outline:none;" />
      <span style="font-weight:600;color:#7c3aed;">฿</span>
    </div>
    <div style="text-align:right;margin-top:8px;font-size:14px;color:#374151;display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:13px;">
        <input type="radio" name="oiFinalBasis" value="before" checked onchange="applyOrderDiscount()" style="accent-color:#7c3aed;"> <span>할인 전</span>
      </label>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:13px;">
        <input type="radio" name="oiFinalBasis" value="after" onchange="applyOrderDiscount()" style="accent-color:#dc2626;"> <span>할인 후</span>
      </label>
      <span style="color:#6b7280;font-size:13px;">|</span>
      <span>할인율</span>:
      <input type="number" id="orderDiscountRate" min="0" max="100" step="5" value="${_oDiscVal}" placeholder="0" oninput="applyOrderDiscount()" style="width:80px;padding:6px 10px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;font-weight:600;color:#374151;text-align:right;outline:none;" />
      <span style="font-weight:600;color:#374151;">%</span>
    </div>
    <div id="orderDiscountedRow" style="display:none;text-align:right;margin-top:6px;padding:8px 12px;background:#f5f3ff;border-radius:8px;border:1.5px solid #ddd6fe;">
      <span style="font-size:13px;color:#ef4444;font-weight:600;" id="orderDiscountAmount"></span>
      <span style="font-size:13px;color:#6b7280;margin-left:8px;">할인 적용가 →</span>
      <strong id="orderDiscountedTotal" style="font-size:17px;"></strong>
    </div>`;
    // 저장된 값이 있으면 자동 적용
    setTimeout(function(){ applyOrderDiscount(); }, 50);
  }
  document.getElementById('submitOrderBtn').disabled = false;
}


// ── 로딩 프로그레스 바 JS 제어 헬퍼 ─────────────────────────────────────────
// 사용법: const done = startLoadProgress(bodyEl);
//         await fetch(...);
//         done();   ← 100% 도달 후 스피너 정지
var _loadProgTimer = null;
function startLoadProgress(bodyEl) {
  if (_loadProgTimer) { clearInterval(_loadProgTimer); _loadProgTimer = null; }
  var pct    = 0;
  var barEl  = bodyEl ? bodyEl.querySelector('.load-progress-bar') : null;
  var pctEl  = bodyEl ? bodyEl.querySelector('.load-progress-pct') : null;
  var ringEl = bodyEl ? bodyEl.querySelector('.load-icon-ring')    : null;

  function setVal(v) {
    v = Math.min(100, Math.max(0, v));
    if (barEl) barEl.style.width = v.toFixed(1) + '%';
    if (pctEl) pctEl.textContent  = Math.round(v) + '%';
  }
  setVal(0);

  // API 응답 전까지 0→90% 사이를 점점 느리게 증가
  _loadProgTimer = setInterval(function() {
    var inc = (90 - pct) * 0.055 + 0.4;   // 가까울수록 작은 증분
    pct = Math.min(90, pct + inc);
    setVal(pct);
    if (pct >= 90) { clearInterval(_loadProgTimer); _loadProgTimer = null; }
  }, 80);

  // done(): 로딩 완료 → 현재 위치에서 100%까지 부드럽게 채운 뒤 스피너 정지
  // Promise를 반환하여 100% 도달 후 콜백 실행 가능
  return function done() {
    if (_loadProgTimer) { clearInterval(_loadProgTimer); _loadProgTimer = null; }
    var startPct = pct;
    var elapsed  = 0;
    var duration = 300;
    return new Promise(function(resolve) {
      var fillTimer = setInterval(function() {
        elapsed += 16;
        var t = Math.min(1, elapsed / duration);
        setVal(startPct + (100 - startPct) * t);
        if (t >= 1) {
          clearInterval(fillTimer);
          if (ringEl) ringEl.style.animation = 'none';
          setTimeout(resolve, 250); // 100% 표시 후 잠시 유지
        }
      }, 16);
    });
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Firebase Firestore CRUD 헬퍼 함수
// ══════════════════════════════════════════════════════════════════════════════

// ── Auth 헬퍼 ──
async function fbLogin(empid, pw) {
  // 1) Firestore 계정 확인 (accounts는 get 허용)
  var doc = await Promise.race([
    _fbDb.collection('accounts').doc(empid).get(),
    new Promise(function(_, rej) { setTimeout(function() { rej(new Error('timeout')); }, 15000); })
  ]);
  if (!doc.exists) throw new Error('account_not_found');
  var acct = doc.data();

  // 2) Firebase Auth 로그인 — 비밀번호 검증을 실제로 강제한다.
  //    과거: wrong-password 를 silent swallow 해서 어떤 비번이든 통과하던 보안 허점 수정.
  var email = empid + FB_AUTH_DOMAIN;
  var authSucceeded = false;
  try {
    await Promise.race([
      _fbAuth.signInWithEmailAndPassword(email, pw),
      new Promise(function(_, rej) { setTimeout(function() { rej(new Error('auth_timeout')); }, 10000); })
    ]);
    authSucceeded = true;
  } catch(authErr) {
    if (authErr.code === 'auth/user-not-found') {
      // Auth 계정이 없으면 자동 생성 (최초 로그인/마이그레이션 경로).
      // 이 단계에서 typed pw 를 그대로 저장하므로 이후 동일 pw 로만 로그인 가능.
      try {
        await _fbAuth.createUserWithEmailAndPassword(email, pw);
        authSucceeded = true;
      } catch(createErr) {
        console.warn('[fbLogin] Auth 계정 생성 실패:', createErr.code);
      }
    } else if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential') {
      // 비밀번호 불일치 → 즉시 거부. (관리자 리셋으로 복구)
      throw new Error('wrong_password');
    } else if (authErr.message === 'auth_timeout' ||
               authErr.code === 'auth/network-request-failed') {
      // 네트워크 일시 장애는 가용성 차원에서 Firestore 계정 반환 허용
      console.warn('[fbLogin] Auth 네트워크 오류, Firestore 계정으로 진행');
    } else {
      console.warn('[fbLogin] Auth 로그인 실패:', authErr.message || authErr.code);
      throw new Error('wrong_password');
    }
  }
  return acct;
}

async function fbRegister(data) {
  // 1) Firebase Auth 계정 먼저 생성 (보안 규칙 통과용)
  var email = data.empid + FB_AUTH_DOMAIN;
  try {
    await _fbAuth.createUserWithEmailAndPassword(email, data.pw);
  } catch(authErr) {
    // 이미 존재하면 로그인 시도
    if (authErr.code === 'auth/email-already-in-use') {
      try { await _fbAuth.signInWithEmailAndPassword(email, data.pw); } catch(e) {}
    } else {
      console.warn('[fbRegister] Auth 등록 실패:', authErr.code);
    }
  }
  // 2) Firestore에 계정 프로필 저장 (비밀번호는 Firebase Auth 가 보관)
  var profile = {
    empid: data.empid, name: data.name || '', dept: data.dept || '',
    sub_dept: data.sub_dept || '', tel: data.tel || '', email: data.email || '',
    role: 'user', permissions: [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  await _fbDb.collection('accounts').doc(data.empid).set(profile);
  try { if (typeof invalidateAccountsCache === 'function') invalidateAccountsCache(); } catch(e){}
  return { ok: true, msg: 'registered' };
}

async function fbUpdateAccount(data) {
  if (data.account) {
    var acct = data.account;
    var empid = acct.empid;
    var upd = {};
    if (acct.name !== undefined) upd.name = acct.name;
    if (acct.dept !== undefined) upd.dept = acct.dept;
    if (acct.sub_dept !== undefined) upd.sub_dept = acct.sub_dept;
    if (acct.tel !== undefined) upd.tel = acct.tel;
    if (acct.email !== undefined) upd.email = acct.email;
    if (acct.role !== undefined) upd.role = acct.role;
    if (acct.permissions !== undefined) upd.permissions = acct.permissions;
    // 비밀번호는 Firebase Auth 에서만 보관. Firestore 에 pw/pw_hash 저장 금지.
    if (Object.keys(upd).length) await _fbDb.collection('accounts').doc(empid).update(upd);
    try { if (typeof invalidateAccountsCache === 'function') invalidateAccountsCache(); } catch(e){}
    return { ok: true };
  }
  if (data.field === 'pw') {
    // 비밀번호 변경은 Firebase Auth 를 통해서만 (account.js saveAcctAll 참고).
    // Firestore 에는 절대 저장하지 않는다.
    var user = _fbAuth.currentUser;
    if (user) await user.updatePassword(data.value);
    return { ok: true };
  }
  var fieldUpd = {};
  fieldUpd[data.field] = data.value;
  await _fbDb.collection('accounts').doc(data.empid).update(fieldUpd);
  try { if (typeof invalidateAccountsCache === 'function') invalidateAccountsCache(); } catch(e){}
  return { ok: true };
}

async function fbDeleteAccount(empid) {
  // 1) Firestore 문서 삭제
  await _fbDb.collection('accounts').doc(empid).delete();
  await _fbDb.collection('sessions').doc(empid).delete().catch(function(){});
  await _fbDb.collection('fcmTokens').doc(empid).delete().catch(function(){});
  // 2) Firebase Auth 사용자 삭제 (Cloud Function 호출, 관리자 권한 필요)
  var authResult = { ok: false };
  try {
    // 관리자 세션 보장 (admin claim 재획득)
    if (typeof _ensureAdminAuthSession === 'function') {
      try { await _ensureAdminAuthSession(); } catch(e) { console.warn('[fbDeleteAccount] admin session fail:', e); }
    }
    var delAuth = firebase.functions().httpsCallable('deleteUserAuth');
    var resp = await delAuth({ empid: empid });
    authResult = (resp && resp.data) || { ok: false };
    if (!authResult.ok) console.warn('[fbDeleteAccount] auth deletion skipped/failed:', authResult.msg);
  } catch(e) {
    console.warn('[fbDeleteAccount] Cloud Function deleteUserAuth error:', e && e.message);
  }
  try { if (typeof invalidateAccountsCache === 'function') invalidateAccountsCache(); } catch(e){}
  return { ok: true, auth: authResult };
}

// ── 세션 헬퍼 ──
async function fbRegisterSession(empid, sid) {
  await _fbDb.collection('sessions').doc(empid).set({
    sid: sid, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { status: 'ok' };
}

async function fbCheckSession(empid, sid) {
  var doc = await _fbDb.collection('sessions').doc(empid).get();
  if (doc.exists && doc.data().sid && doc.data().sid !== sid) {
    return { status: 'conflict' };
  }
  return { status: 'ok' };
}

async function fbClearSession(empid, sid) {
  var doc = await _fbDb.collection('sessions').doc(empid).get();
  if (doc.exists && doc.data().sid === sid) {
    await _fbDb.collection('sessions').doc(empid).delete();
  }
  return { status: 'ok' };
}

// ── 주문 헬퍼 ──
async function fbAddOrder(data) {
  _apiGetInvalidate(); // 캐시 무효화
  var id = data.id || Date.now();
  var cust = data.customer || {};
  await _fbDb.collection('orders').doc(String(id)).set({
    id: id,
    date: data.date || new Date().toLocaleString('ko-KR'),
    user: data.user || '',
    customer_erp: data.customer_erp || cust.erp || '',
    customer_name: data.customer_name || cust.name || '',
    customer_clinic: data.customer_clinic || cust.clinic || '',
    address: data.address || '',
    items: typeof data.items === 'string' ? JSON.parse(data.items) : (data.items || []),
    status: 'pending',
    ship_type: data.ship_type || '',
    pkg_price: data.pkg_price || 0,
    settle_ref: data.settle_ref || null,
    completed_by: '', completed_date: '', cancel_reason: '',
    memo: data.memo || '',
    delivery_date: data.delivery_date || '',
    delivery_method: data.delivery_method || '',
    user_empid: data.user_empid || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { ok: true, id: id };
}

async function fbUpdateOrder(data) {
  _apiGetInvalidate();
  var upd = {};
  if (data.address !== undefined) upd.address = data.address;
  if (data.ship_type !== undefined) upd.ship_type = data.ship_type;
  if (data.pkg_price !== undefined) upd.pkg_price = data.pkg_price;
  if (data.settle_ref !== undefined) upd.settle_ref = data.settle_ref;
  if (data.items !== undefined) upd.items = typeof data.items === 'string' ? JSON.parse(data.items) : data.items;
  if (data.memo !== undefined) upd.memo = data.memo;
  if (data.delivery_date !== undefined) upd.delivery_date = data.delivery_date;
  if (data.delivery_method !== undefined) upd.delivery_method = data.delivery_method;
  await _fbDb.collection('orders').doc(String(data.id)).update(upd);
  return { ok: true };
}

async function fbCompleteOrder(data) {
  _apiGetInvalidate();
  var orderDoc = await _fbDb.collection('orders').doc(String(data.id)).get();
  await _fbDb.collection('orders').doc(String(data.id)).update({
    status: 'shipping', completed_by: data.completedBy || '', completed_date: data.completedDate || ''
  });
  if (orderDoc.exists) {
    var od = orderDoc.data();
    // 위탁정산 승인 시: 원래 위탁출고 주문의 해당 아이템을 정산 완료 처리
    if (od.ship_type === '위탁정산' && od.settle_ref && od.settle_ref.length) {
      var batch = _fbDb.batch();
      var _touchedMaster = false;
      od.settle_ref.forEach(function(ref) {
        if (!ref.orderId) return;
        if (ref.source === 'master' && ref.docId) {
          // consignment_master 문서: 상태를 SETTLED로 변경
          var masterRef = _fbDb.collection('consignment_master').doc(ref.docId);
          batch.update(masterRef, { st: 'SETTLED', settled_by: String(data.id), settled_date: new Date().toISOString().slice(0,16).replace('T',' '), updated_at: firebase.firestore.FieldValue.serverTimestamp() });
          _touchedMaster = true;
        } else {
          // orders 컬렉션의 위탁출고 주문: settled_items 배열에 추가
          var docRef = _fbDb.collection('orders').doc(String(ref.orderId));
          batch.update(docRef, {
            settled_items: firebase.firestore.FieldValue.arrayUnion({
              item_no: ref.item_no || '',
              item_model: ref.item_model || '',
              qty: ref.qty || 0,
              settled_by: String(data.id),
              settled_date: new Date().toISOString().slice(0,16).replace('T',' ')
            })
          });
        }
      });
      try {
        await batch.commit();
        // consignment_master 가 변경됐으면 메타 버전 bump → 다른 클라이언트가 캐시 갱신
        if (_touchedMaster && typeof _csBumpMeta === 'function') {
          try { await _csBumpMeta(); } catch(e) {}
        }
      } catch(e) { console.warn('[settle batch]', e); }
    }
    var toEmpid = od.user_empid;
    if (toEmpid) {
      createNotification(toEmpid, 'shipping', '📦 발송 준비 완료', '주문 #' + data.id + ' 발송 준비가 완료되었습니다.', String(data.id));
    }
  }
  return { ok: true };
}

async function fbDeliverOrder(data) {
  _apiGetInvalidate();
  var orderDoc = await _fbDb.collection('orders').doc(String(data.id)).get();
  var me = getCurrentUser();
  var deliveredBy = me ? me.name + ' (' + me.dept + ')' : '';
  var deliveredDate = new Date().toLocaleString('ko-KR');
  await _fbDb.collection('orders').doc(String(data.id)).update({
    status: 'done',
    delivered_by: deliveredBy,
    delivered_date: deliveredDate
  });
  if (orderDoc.exists) {
    var od = orderDoc.data();
    var toEmpid = od.user_empid;
    if (toEmpid) {
      createNotification(toEmpid, 'delivered', '✅ 배송 완료', '주문 #' + data.id + ' 배송이 완료되었습니다.', String(data.id));
    }
  }
  return { ok: true };
}

async function fbCancelOrder(data) {
  _apiGetInvalidate();
  var orderDoc = await _fbDb.collection('orders').doc(String(data.id)).get();
  await _fbDb.collection('orders').doc(String(data.id)).update({ status: 'cancelled' });
  if (orderDoc.exists) {
    var od = orderDoc.data();
    var toEmpid = od.user_empid;
    if (toEmpid) {
      createNotification(toEmpid, 'cancelled', '❌ 주문 취소', '주문 #' + data.id + '이(가) 취소되었습니다.', String(data.id));
    }
  }
  return { ok: true };
}

async function fbRequestCancel(data) {
  _apiGetInvalidate();
  await _fbDb.collection('orders').doc(String(data.id)).update({
    status: 'cancel_requested', cancel_reason: data.cancel_reason || ''
  });
  return { ok: true };
}

async function fbRejectCancel(data) {
  _apiGetInvalidate();
  await _fbDb.collection('orders').doc(String(data.id)).update({
    status: 'pending', cancel_reason: ''
  });
  return { ok: true };
}

// ── 견적 헬퍼 ──
async function fbSubmitQuote(data) {
  _fbQuotesCache = null;
  var qId = 'Q' + Date.now();
  await _fbDb.collection('quotes').doc(qId).set({
    id: qId,
    date: data.date || new Date().toISOString(),
    requested_by: data.requested_by || '',
    requested_by_name: data.requested_by_name || '',
    requested_at: data.requested_at || new Date().toISOString(),
    customer_erp: data.erp || data.customer_erp || '',
    customer_name: data.customer || data.customer_name || '',
    customer_clinic: data.clinic || data.customer_clinic || '',
    items: typeof data.items === 'string' ? JSON.parse(data.items) : (data.items || []),
    total: parseFloat(data.total) || 0,
    request_total: parseFloat(data.request_total) || 0,
    notes: data.notes || '',
    rep_signature: data.rep_signature || '',
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { status: 'ok', id: qId };
}

async function fbUpdateQuote(data) {
  _fbQuotesCache = null;
  var upd = {
    customer_erp: data.erp || data.customer_erp || '',
    customer_name: data.customer || data.customer_name || '',
    customer_clinic: data.clinic || data.customer_clinic || '',
    items: typeof data.items === 'string' ? JSON.parse(data.items) : (data.items || []),
    total: parseFloat(data.total) || 0,
    request_total: parseFloat(data.request_total) || 0,
    notes: data.notes || '',
    date: data.date || new Date().toISOString(),
    rep_signature: data.rep_signature || '',
    requested_by_name: data.requested_by_name || '',
    requested_at: data.requested_at || new Date().toISOString()
  };
  await _fbDb.collection('quotes').doc(data.id).update(upd);
  return { status: 'ok' };
}

var _fbQuotesCache = null;
var _fbQuotesCacheTime = 0;
var _fbQuotesPromise = null;
async function fbGetQuotes(forceRefresh) {
  var now = Date.now();
  if (!forceRefresh && _fbQuotesCache && (now - _fbQuotesCacheTime) < 3000) {
    return _fbQuotesCache;
  }
  if (_fbQuotesPromise) return _fbQuotesPromise;
  // 2단계 최적화: forceRefresh=true 시에만 서버 강제, 그 외엔 cache-first
  var _qQuery = _fbDb.collection('quotes');
  var _qGetPromise = (forceRefresh || typeof _getCachedOrServer !== 'function')
    ? _qQuery.get()
    : _getCachedOrServer(_qQuery);
  _fbQuotesPromise = _qGetPromise.then(function(snap) {
    var data = snap.docs.map(function(d) {
      var q = d.data();
      if (q.status === 'cancelled') return null;
      if (q.items && typeof q.items !== 'string') q.items = JSON.stringify(q.items);
      return q;
    }).filter(Boolean);
    var result = { status: 'ok', data: data };
    _fbQuotesCache = result;
    _fbQuotesCacheTime = Date.now();
    _fbQuotesPromise = null;
    return result;
  }).catch(function(e) {
    _fbQuotesPromise = null;
    throw e;
  });
  return _fbQuotesPromise;
}

async function fbUpdateQuoteStatus(data) {
  _fbQuotesCache = null;
  var upd = { status: data.status };
  if (data.mgr_signature) upd.mgr_signature = data.mgr_signature;
  if (data.approved_at) upd.approved_at = data.approved_at;
  if (data.docNo) upd.docNo = data.docNo;
  if (data.rejected_at) upd.rejected_at = data.rejected_at;
  if (typeof data.reject_reason !== 'undefined') upd.reject_reason = data.reject_reason || '';
  if (data.status === 'rejected') {
    var _rej = (typeof getCurrentUser === 'function') ? (getCurrentUser() || {}) : {};
    upd.rejected_by = _rej.empid ? (_rej.empid + ' (' + (_rej.nickname || _rej.name || '') + ')') : '';
  }
  await _fbDb.collection('quotes').doc(data.id).update(upd);
  return { status: 'ok' };
}

// ── Quotation No. 자동 생성 (QT{ERP}-001 패턴) ──
async function _generateQuoteDocNo(erp) {
  var prefix = 'QT' + (erp || '99999');
  var res = await fbGetQuotes(true);
  var quotes = (res && res.data) || [];
  var maxNum = 0;
  quotes.forEach(function(q) {
    if (q.docNo && q.docNo.indexOf(prefix + '-') === 0) {
      var num = parseInt(q.docNo.split('-').pop(), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return prefix + '-' + String(maxNum + 1).padStart(3, '0');
}

// ── 고객 헬퍼 ──
async function fbAddCustomer(data) {
  var cust = data.customer || data;
  var pcId = 'PC_' + Date.now();
  var _me = (typeof getCurrentUser === 'function') ? (getCurrentUser() || {}) : {};
  var _myEmpid = _me.empid || '';

  var attachUrls = [];
  if (data.attachments && data.attachments.length) {
    for (var i = 0; i < data.attachments.length; i++) {
      var att = data.attachments[i];
      try {
        var path = 'customer-attachments/' + (cust.erp || pcId) + '_' + Date.now() + '/' + (att.name || 'file_' + i);
        var ref = _fbStorage.ref().child(path);
        if (att.data && att.data.indexOf('base64,') > -1) {
          await ref.putString(att.data, 'data_url');
        } else if (att.data) {
          await ref.putString(att.data, 'base64', { contentType: att.type || 'application/octet-stream' });
        }
        var url = await ref.getDownloadURL();
        attachUrls.push({ name: att.name || 'file', url: url });
      } catch(e) { console.warn('[Storage] upload fail:', e); }
    }
  }

  await _fbDb.collection('pendingCustomers').doc(pcId).set({
    id: pcId,
    erp: cust.erp || '', nt_code: cust.nt_code || '', name_th: cust.name_th || '', name_en: cust.name_en || '', sales: cust.sales || '',
    type: cust.type || '', location: cust.location || '',
    tel: cust.tel || '', taxid: cust.taxid || '',
    addr_reg: cust.addr_reg || '', addr_del: cust.addr_del || '',
    addr_del2: cust.addr_del2 || '', addr_del3: cust.addr_del3 || '',
    addr_del4: cust.addr_del4 || '', addr_del5: cust.addr_del5 || '',
    cust_name: cust.cust_name || '', clinic: cust.clinic || '',
    name_en: cust.name_en || '', name_en2: cust.name_en2 || '',
    status: 'Pending',
    // 보안 규칙용 본인 식별자(empid). 기존 reg_by는 "이름 (empid)" 포맷이라 Firestore 규칙에서 동등 비교가 어려움.
    created_by: _myEmpid,
    reg_by: cust.reg_by || '', reg_at: cust.reg_at || new Date().toISOString(),
    attachments: attachUrls,
    remark: cust.remark || '',
    dup_warning: cust.dup_warning || null,
    convert_from: cust.convert_from || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { ok: true, id: pcId };
}

async function fbApproveCustomer(data) {
  var doc = await _fbDb.collection('pendingCustomers').doc(data.id).get();
  if (!doc.exists) return { ok: false, msg: 'not found' };
  var pc = doc.data();
  // ERP 코드 자동 부여: DATA + Firestore customers에서 최대값 + 1
  var maxErp = (DATA || []).reduce(function(max, r) {
    var n = parseInt(r.erp, 10);
    return (!isNaN(n) && n > max) ? n : max;
  }, 52542);
  var erp = String(maxErp + 1);
  var ntCode = 'NT' + erp;
  await _fbDb.collection('customers').doc(erp).set({
    erp: erp, nt_code: ntCode, name_th: pc.name_th || '', name_en: pc.name_en || '',
    cust_name: pc.cust_name || '', clinic: pc.clinic || '',
    name_en2: pc.name_en2 || '', sales: pc.sales || '',
    address: pc.addr_del || pc.addr_reg || '',
    addr_reg: pc.addr_reg || '', addr_del: pc.addr_del || '',
    addr_del2: pc.addr_del2 || '', addr_del3: pc.addr_del3 || '',
    tel: pc.tel || '', taxid: pc.taxid || '', location: pc.location || '',
    type: pc.type || '', status: 'Active', remark: pc.remark || '',
    reg_date: new Date().toISOString().slice(0, 10),
    reg_by: pc.reg_by || '', reg_at: pc.reg_at || '',
    updated_at: firebase.firestore.FieldValue.serverTimestamp() // 증분 동기화
  });
  var _approver = getCurrentUser();
  await _fbDb.collection('pendingCustomers').doc(data.id).update({
    status: 'Approved', erp: erp, nt_code: ntCode,
    approved_by: _approver ? (_approver.empid + ' (' + (_approver.nickname || _approver.name || '') + ')') : '',
    approved_at: new Date().toISOString()
  });
  _logCustomerChange('added', erp, pc.name_th || pc.cust_name, pc.clinic, '신규 고객 승인 (ERP: ' + erp + ')');
  var custDoc = await _fbDb.collection('customers').doc(erp).get();
  return { ok: true, customer: custDoc.data() };
}

async function fbRejectCustomer(data) {
  var _rejector = getCurrentUser();
  await _fbDb.collection('pendingCustomers').doc(data.id).update({
    status: 'Rejected', remark: data.reason || '',
    rejected_by: _rejector ? (_rejector.empid + ' (' + (_rejector.nickname || _rejector.name || '') + ')') : '',
    rejected_at: new Date().toISOString()
  });
  return { ok: true };
}

// ── 주소 헬퍼 ──
function _logAddressHistory(erp, action, address) {
  try {
    var user = getCurrentUser();
    _fbDb.collection('address_history').add({
      erp: erp,
      action: action,
      address: address,
      by: user ? (user.empid || user.id || '') : '',
      byName: user ? (user.name || '') : '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e) { console.warn('[address_history]', e); }
}

async function fbSaveAddress(data) {
  await _fbDb.collection('addresses').doc(data.erp).set({
    addresses: firebase.firestore.FieldValue.arrayUnion(data.address)
  }, { merge: true });
  _logAddressHistory(data.erp, 'add', data.address);
  return { ok: true };
}

async function fbDeleteAddress(data) {
  await _fbDb.collection('addresses').doc(data.erp).update({
    addresses: firebase.firestore.FieldValue.arrayRemove(data.address)
  });
  _logAddressHistory(data.erp, 'delete', data.address);
  return { ok: true };
}

// ── FCM 토큰 헬퍼 ──
async function fbSaveFcmToken(data) {
  await _fbDb.collection('fcmTokens').doc(data.empid).set({
    token: data.token, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════════════════════
// apiPost 라우터 — 기존 호출부 변경 없이 Firestore로 분기
// ══════════════════════════════════════════════════════════════════════════════
async function apiPost(data) {
  var action = data.action;
  try {
    switch(action) {
      case 'login':              return fbLogin(data.empid, data.pw).then(function(user){ return {ok:true, user:user}; });
      case 'register':           return fbRegister(data);
      case 'register_session':   return fbRegisterSession(data.empid, data.sid);
      case 'check_session':      return fbCheckSession(data.empid, data.sid);
      case 'clear_session':      return fbClearSession(data.empid, data.sid);
      case 'update_account':     return fbUpdateAccount(data);
      case 'delete_account':     return fbDeleteAccount(data.empid);
      case 'add':                return fbAddOrder(data);
      case 'update':             return fbUpdateOrder(data);
      case 'complete':           return fbCompleteOrder(data);
      case 'deliver':            return fbDeliverOrder(data);
      case 'cancel':             return fbCancelOrder(data);
      case 'request_cancel':     return fbRequestCancel(data);
      case 'reject_cancel':      return fbRejectCancel(data);
      case 'submit_quote':       return fbSubmitQuote(data);
      case 'update_quote':       return fbUpdateQuote(data);
      case 'get_quotes':         return fbGetQuotes();
      case 'update_quote_status':return fbUpdateQuoteStatus(data);
      case 'add_customer':       return fbAddCustomer(data);
      case 'approve_customer':   return fbApproveCustomer(data);
      case 'reject_customer':    return fbRejectCustomer(data);
      case 'save_fcm_token':     return fbSaveFcmToken(data);
      case 'save_address':       return fbSaveAddress(data);
      case 'delete_address':     return fbDeleteAddress(data);
      case 'export_results':     return { ok: true };
      default: console.warn('[apiPost] unknown action:', action); return { ok: false };
    }
  } catch(e) {
    console.error('[apiPost]', action, e);
    throw e;
  }
}

// apiGet — 주문 로드 (Firestore) + status/날짜 필터 + 캐시
// options: { status: string|string[], dateFrom: string('YYYY-MM-DD'), dateTo: string, forceRefresh: bool }
var _apiGetCacheMap = {};   // key → { data, time }
var _apiGetPromiseMap = {}; // key → Promise (중복 요청 방지)

function apiGet(options) {
  // 하위 호환: apiGet() 또는 apiGet(true) 호출 시
  if (typeof options === 'boolean') options = { forceRefresh: options };
  if (!options) options = {};

  var statusFilter = options.status || null; // string or array
  var dateFrom = options.dateFrom || null;   // 'YYYY-MM-DD'
  var dateTo = options.dateTo || null;
  var forceRefresh = options.forceRefresh || false;

  // 캐시 키 생성
  var cacheKey = (statusFilter ? (Array.isArray(statusFilter) ? statusFilter.sort().join(',') : statusFilter) : 'all')
    + '|' + (dateFrom || '') + '|' + (dateTo || '');

  var now = Date.now();
  var cached = _apiGetCacheMap[cacheKey];
  if (!forceRefresh && cached && (now - cached.time) < 3000) {
    return Promise.resolve(cached.data);
  }
  if (_apiGetPromiseMap[cacheKey]) return _apiGetPromiseMap[cacheKey];

  // Firestore 쿼리 빌드
  var query = _fbDb.collection('orders');

  // status 필터
  if (statusFilter) {
    if (Array.isArray(statusFilter)) {
      query = query.where('status', 'in', statusFilter);
    } else {
      query = query.where('status', '==', statusFilter);
    }
  }

  // 날짜 필터 (createdAt 기준)
  if (dateFrom) {
    query = query.where('createdAt', '>=', new Date(dateFrom + 'T00:00:00'));
  }
  if (dateTo) {
    query = query.where('createdAt', '<=', new Date(dateTo + 'T23:59:59'));
  }

  // createdAt 기준 정렬 (날짜 필터 사용 시 필수)
  if (dateFrom || dateTo) {
    query = query.orderBy('createdAt', 'desc');
  }

  _apiGetPromiseMap[cacheKey] = query.get().then(function(snap) {
    var orders = snap.docs.map(function(d) {
      var o = d.data();
      if (o.items && typeof o.items !== 'string') o.items_json = JSON.stringify(o.items);
      else o.items_json = o.items || '[]';
      return o;
    });
    var result = { ok: true, orders: orders };
    _apiGetCacheMap[cacheKey] = { data: result, time: Date.now() };
    delete _apiGetPromiseMap[cacheKey];
    return result;
  }).catch(function(e) {
    delete _apiGetPromiseMap[cacheKey];
    throw e;
  });
  return _apiGetPromiseMap[cacheKey];
}

// 캐시 전체 무효화 (주문 생성/수정/삭제 시 호출)
function _apiGetInvalidate() {
  _apiGetCacheMap = {};
}

// ── 주문 완료 ────────────────────────────────────────────────────────────────
function showOrderConfirm() {
  if (!orderItems.length) { neoAlert(t('msg_select_order_item')); return; }
  const delivDate   = (document.getElementById('deliveryDateInput') || {}).value || '';
  const dmOther     = (document.getElementById('dmOtherInput') || {}).value || '';
  const delivMethod = orderDeliveryMethod === '기타' ? (dmOther || '기타') : (orderDeliveryMethod || '-');
  const memo        = (document.getElementById('orderMemoInput') || {}).value || '';
  const cust        = orderCustomer;

  function row(label, value) {
    return `<div style="display:flex;gap:8px;"><span style="color:#6b7280;min-width:90px;flex-shrink:0;">${label}</span><span style="font-weight:600;color:#111827;">${value || '-'}</span></div>`;
  }
  function section(title, content) {
    return `<div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:12px 14px;">
      <div style="font-size:12px;font-weight:700;color:#2563eb;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">${title}</div>
      <div style="display:flex;flex-direction:column;gap:6px;">${content}</div>
    </div>`;
  }

  const custSection = section('👤 고객', [
    row('ERP', cust ? cust.erp : ''),
    row('이름', cust ? (cust.name_en || cust.name_th || '') : ''),
    row('클리닉', cust ? cust.clinic : ''),
    row('주소', orderAddress || (cust ? cust.address : '') || '')
  ].join(''));

  const itemsHtml = orderItems.map(oi =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f3f4f6;">
      <span style="color:#1e40af;font-weight:600;">${oi.item.no || ''}</span>
      <span style="color:#374151;flex:1;margin:0 8px;font-size:13px;">${oi.item.name || ''} ${oi.item.spec || ''}</span>
      <span style="font-weight:700;color:#111827;">× ${oi.qty}</span>
    </div>`
  ).join('');
  const itemsSection = section('📦 주문 아이템 (' + orderItems.length + '건)', itemsHtml);

  var delivRows = [
    row('출고 방식', orderShipType || '일반출고'),
    row('배송 방법', delivMethod),
    row('배송 요청일', delivDate)
  ];
  if (orderShipType === '패키지출고' && _pkgFinalPrice > 0) {
    delivRows.push(row('📦 패키지 가격', '฿' + _pkgFinalPrice.toLocaleString()));
  }
  const delivSection = section('🚚 배송 정보', delivRows.join(''));

  const extraRows = [];
  if (memo) extraRows.push(row('메모', memo));
  const attachCount = (window.orderAttachedFiles || []).length;
  if (attachCount) extraRows.push(row('첨부 파일', attachCount + '개'));
  const extraSection = extraRows.length ? section('📝 추가 정보', extraRows.join('')) : '';

  document.getElementById('orderConfirmBody').innerHTML = custSection + itemsSection + delivSection + extraSection;
  const overlay = document.getElementById('orderConfirmOverlay');
  overlay.style.display = 'flex';
}

function closeOrderConfirm() {
  document.getElementById('orderConfirmOverlay').style.display = 'none';
}

async function submitOrder() {
  if (!orderItems.length) return;
  closeOrderConfirm();
  const user = getCurrentUser();
  const btn = document.getElementById('confirmSubmitBtn') || document.getElementById('submitOrderBtnFinal') || document.getElementById('submitOrderBtn');
  btn.disabled = true;
  btn.textContent = t('msg_saving');
  const delivDate   = (document.getElementById('deliveryDateInput') || {}).value || '';
  const dmOther     = (document.getElementById('dmOtherInput') || {}).value || '';
  const delivMethod = orderDeliveryMethod === '기타' ? (dmOther || '기타') : orderDeliveryMethod;
  const memo        = (document.getElementById('orderMemoInput') || {}).value || '';
  try {
    if (editingOrderId) {
      // 수정 전 현재 상태 확인 (승인 여부 체크) — 단건 직접 조회
      const latestDoc = await _fbDb.collection('orders').doc(String(editingOrderId)).get();
      const latestOrder = latestDoc.exists ? latestDoc.data() : null;
      if (latestOrder && latestOrder.status !== 'pending' && latestOrder.status !== 'cancel_requested') {
        btn.disabled = false;
        btn.textContent = t('msg_edit_save');
        closeOrderForm();
        neoAlert('이미 승인 처리된 주문입니다. 수정이 반영되지 않습니다.');
        renderDeliveryOrders();
        return;
      }
      // 수정 모드
      await apiPost({
        action: 'update',
        id: editingOrderId,
        address: orderAddress || '',
        ship_type: orderShipType,
        pkg_price: orderShipType === '패키지출고' ? (_pkgFinalPrice || 0) : 0,
        settle_ref: orderShipType === '위탁정산' ? (_settleRefs.length ? _settleRefs : null) : null,
        delivery_date: delivDate,
        delivery_method: delivMethod,
        memo: memo,
        items: orderItems.map(oi => ({...oi.item, qty: oi.qty, price: oi._isFree ? 0 : (oi._price || oi.item.price || 0), free: !!oi._isFree}))
      });
      // 수정 시에도 로컬 extras 업데이트
      if (_orderExtrasMap[String(editingOrderId)]) {
        _orderExtrasMap[String(editingOrderId)].memo = memo;
        _orderExtrasMap[String(editingOrderId)].delivery_date = delivDate;
        _orderExtrasMap[String(editingOrderId)].delivery_method = delivMethod;
      } else {
        _orderExtrasMap[String(editingOrderId)] = { memo: memo, attachments: [], delivery_date: delivDate, delivery_method: delivMethod };
      }
      try {
        var memoOnly2 = {};
        Object.keys(_orderExtrasMap).forEach(function(k) {
          memoOnly2[k] = { memo: _orderExtrasMap[k].memo || '', delivery_date: _orderExtrasMap[k].delivery_date || '', delivery_method: _orderExtrasMap[k].delivery_method || '' };
        });
        localStorage.setItem('order_extras_map', JSON.stringify(memoOnly2));
      } catch(e) {}
      editingOrderId = null;
      btn.disabled = false;
      btn.textContent = t('msg_edit_save');
      closeOrderForm();
      renderPendingOrders();
      neoAlert(t('msg_order_edited'));
    } else {
      // 신규 주문
      const newOrderId = Date.now();
      const newAttachments = orderAttachedFiles.map(function(f){ return {name:f.name, type:f.type, dataUrl:f.dataUrl}; });
      await apiPost({
        action: 'add',
        id: newOrderId,
        date: new Date().toLocaleString('ko-KR'),
        user: user ? `${user.name} (${user.dept})` : '미로그인',
        user_empid: user ? user.empid : '',
        customer: orderCustomer
          ? { erp: orderCustomer.erp,
              name: orderCustomer.name_en || orderCustomer.name_th,
              clinic: orderCustomer.clinic }
          : null,
        address: orderAddress || '',
        ship_type: orderShipType,
        pkg_price: orderShipType === '패키지출고' ? (_pkgFinalPrice || 0) : 0,
        settle_ref: orderShipType === '위탁정산' ? (_settleRefs.length ? _settleRefs : null) : null,
        delivery_date: delivDate,
        delivery_method: delivMethod,
        memo: memo,
        attachments: newAttachments,
        items: orderItems.map(oi => ({...oi.item, qty: oi.qty, price: oi._isFree ? 0 : (oi._price || oi.item.price || 0), free: !!oi._isFree}))
      });
      // GAS가 memo/attachments/delivery 등을 반환하지 않을 경우를 대비해 로컬 캐시에도 저장
      _orderExtrasMap[String(newOrderId)] = { memo: memo, attachments: newAttachments, delivery_date: delivDate, delivery_method: delivMethod };
      // 메모+배송정보는 localStorage에 (텍스트만, 용량 절약)
      try {
        var memoOnly = {};
        Object.keys(_orderExtrasMap).forEach(function(k) {
          memoOnly[k] = { memo: _orderExtrasMap[k].memo || '', delivery_date: _orderExtrasMap[k].delivery_date || '', delivery_method: _orderExtrasMap[k].delivery_method || '' };
        });
        localStorage.setItem('order_extras_map', JSON.stringify(memoOnly));
      } catch(e) {}
      // 첨부파일은 IndexedDB에 영구 저장 (새로고침 후에도 유지)
      if (newAttachments.length) idbSaveAttachments(newOrderId, newAttachments);
      btn.disabled = false;
      btn.textContent = t('msg_order_complete');
      closeOrderForm();
      updatePendingBadge();
      neoAlert(`주문 등록 완료 (${orderItems.length}개 아이템)`);
    }
  } catch(e) {
    neoAlert(t('msg_save_fail'));
    btn.disabled = false;
    btn.textContent = editingOrderId ? '수정 저장' : '주문 완료';
  }
}

// ── 전화번호 자동 포맷 ───────────────────────────────────────────────────────
// 태국 전화번호 규칙:
//   02로 시작(방콕 시외): 02-XXX-XXXX  (2-3-4, 최대 9자리)
//   나머지 (모바일 등):   XXX-XXX-XXXX (3-3-4, 최대 10자리)
function autoFormatPhone(input) {
  var digits = input.value.replace(/\D/g, '');
  if (!digits) { input.value = ''; return; }
  var f = '';
  if (digits.substring(0, 2) === '02') {
    digits = digits.substring(0, 9);
    if (digits.length <= 2)      f = digits;
    else if (digits.length <= 5) f = digits.substring(0,2) + '-' + digits.substring(2);
    else                         f = digits.substring(0,2) + '-' + digits.substring(2,5) + '-' + digits.substring(5);
  } else {
    digits = digits.substring(0, 10);
    if (digits.length <= 3)      f = digits;
    else if (digits.length <= 6) f = digits.substring(0,3) + '-' + digits.substring(3);
    else                         f = digits.substring(0,3) + '-' + digits.substring(3,6) + '-' + digits.substring(6);
  }
  input.value = f;
}

// ── 이메일 형식 검증 ─────────────────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// ── 주문번호 생성 (YYYYMMDD001~) ──────────────────────────────────────────────
function generateOrderNumbers(orders) {
  // 날짜 파싱: "2026. 3. 29. 오전 01:03:27" → "20260329"
  function _dateKey(dateStr) {
    if (!dateStr) return '00000000';
    var m = dateStr.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!m) return '00000000';
    return m[1] + String(m[2]).padStart(2,'0') + String(m[3]).padStart(2,'0');
  }
  // 날짜+시간 정렬용 타임스탬프
  function _ts(dateStr) {
    if (!dateStr) return 0;
    var m = dateStr.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2}):?(\d{2})?/);
    if (!m) return 0;
    var h = parseInt(m[5]); var isPM = m[4] === '오후' || m[4] === 'PM';
    if (isPM && h < 12) h += 12; if (!isPM && h === 12) h = 0;
    return new Date(m[1], m[2]-1, m[3], h, m[6], m[7]||0).getTime();
  }
  // 전체 주문을 날짜+시간 오름차순 정렬 (원본 불변)
  var sorted = orders.slice().sort(function(a,b){ return _ts(a.date) - _ts(b.date); });
  var dateCount = {};
  var orderNoMap = {};
  sorted.forEach(function(o) {
    var dk = _dateKey(o.date);
    dateCount[dk] = (dateCount[dk] || 0) + 1;
    orderNoMap[String(o.id)] = dk + String(dateCount[dk]).padStart(3,'0');
  });
  return orderNoMap;
}

// ── 날짜 포맷 헬퍼 ───────────────────────────────────────────────────────────
// 주문 생성일 포맷 (저장된 ko-KR 문자열 → 현재 언어 표기)
function formatOrderDate(str) {
  if (!str) return '-';
  // "2026. 3. 27. 오후 10:52:09" 파싱
  var m = str.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return str;
  var year  = parseInt(m[1]);
  var month = parseInt(m[2]) - 1;
  var day   = parseInt(m[3]);
  var isPM  = m[4] === '오후';
  var hours = parseInt(m[5]);
  var mins  = parseInt(m[6]);
  var secs  = parseInt(m[7]);
  if (isPM && hours !== 12) hours += 12;
  if (!isPM && hours === 12) hours = 0;
  var h12 = hours % 12 || 12;
  var hh = String(h12).padStart(2,'0');
  var mm = String(mins).padStart(2,'0');
  var ss = String(secs).padStart(2,'0');
  var lang = currentLang || 'ko';
  if (lang === 'ko') {
    return year + '. ' + (month+1) + '. ' + day + '.  ' + (isPM ? '오후' : '오전') + ' ' + hh + ':' + mm + ':' + ss;
  } else if (lang === 'en') {
    var mths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return mths[month] + ' ' + day + ', ' + year + '  ' + hh + ':' + mm + ':' + ss + ' ' + (isPM ? 'PM' : 'AM');
  } else {
    var mths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return day + ' ' + mths[month] + ' ' + year + '  ' + hh + ':' + mm + ':' + ss + ' ' + (isPM ? 'PM' : 'AM');
  }
}

// 배송 요청일 포맷 (YYYY/MM/DD → "날짜 (요일)")
function formatDeliveryDate(str) {
  if (!str) return '-';
  var m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) {
    var d0 = new Date(str);
    if (!isNaN(d0.getTime())) return _fmtDelDisplay(d0);
    return str;
  }
  var d = new Date(Date.UTC(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3])));
  return _fmtDelDisplay(d);
}
function _fmtDelDisplay(d) {
  var year = d.getUTCFullYear(), month = d.getUTCMonth(), day = d.getUTCDate(), wd = d.getUTCDay();
  var lang = currentLang || 'ko';
  if (lang === 'ko') {
    var days = ['일','월','화','수','목','금','토'];
    return year + '/' + String(month+1).padStart(2,'0') + '/' + String(day).padStart(2,'0') + ' (' + days[wd] + ')';
  } else if (lang === 'en') {
    var mths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return mths[month] + ' ' + day + ', ' + year + ' (' + days[wd] + ')';
  } else {
    var mths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    var days = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
    return day + ' ' + mths[month] + ' ' + year + ' (' + days[wd] + ')';
  }
}

