// Neo Sales App - Shipping, Delivery & Consignment (auto-separated)
// ── 대기 주문 ────────────────────────────────────────────────────────────────
function tShipType(shipType) {
  if (!shipType || shipType === '일반출고') return t('ship_normal');
  if (shipType === '패키지출고') return t('ship_package');
  if (shipType === '위탁출고') return t('ship_consign');
  if (shipType === '위탁정산') return t('ship_consign_settle');
  return shipType;
}

function openPendingOrders() {
  const _me = getCurrentUser();
  const _isOffice = _me && _me.dept === 'Office';
  if (!_isOffice) {
    document.getElementById('pendingSelectAllRow').classList.remove('show');
    document.getElementById('batchBar').classList.remove('show');
  }
  // 기본 날짜: 오늘 기준 7일(오늘 포함) — 로컬 시간 사용
  var _now = new Date();
  var today   = _now.getFullYear() + '-' + String(_now.getMonth()+1).padStart(2,'0') + '-' + String(_now.getDate()).padStart(2,'0');
  var _wa = new Date(_now.getTime() - 6*24*60*60*1000);
  var weekAgo = _wa.getFullYear() + '-' + String(_wa.getMonth()+1).padStart(2,'0') + '-' + String(_wa.getDate()).padStart(2,'0');
  var fromEl = document.getElementById('pendingDateFrom');
  var toEl   = document.getElementById('pendingDateTo');
  if (fromEl && !fromEl.value) fromEl.value = weekAgo;
  if (toEl   && !toEl.value)   toEl.value   = today;
  applyLang();
  renderPendingOrders();
  var _pOv = document.getElementById('pendingOverlay');
  _pOv.classList.add('open');
  _mobFullScreen(_pOv, _pOv.querySelector('.pending-modal'));
  _bringToFront(_pOv);
}
function closePendingOrders() {
  const panel = document.getElementById('pendingDetailPanel');
  if (panel) { panel.classList.remove('open','fullscreen'); }
  var mini = document.getElementById('pendingMini');
  if (mini) mini.classList.remove('show');
  _currentDetailOrderId = null;
  var modal = document.getElementById('pendingModal');
  if (modal) modal.classList.remove('fullscreen');
  _closeBounce(document.getElementById('pendingOverlay'), 'open', function() {
    _resetModalPos(modal);
  });
}
function pendingOverlayClick(e) { /* X 버튼으로만 닫힘 */ }

async function renderPendingOrders() {
  // 상세 패널이 열려 있으면 닫기
  const dpanel = document.getElementById('pendingDetailPanel');
  if (dpanel) dpanel.classList.remove('open');
  _currentDetailOrderId = null;

  const body = document.getElementById('pendingBody');
  body.innerHTML = '<div class="load-progress-wrap"><div class="load-icon-ring"></div><div class="load-progress-label">' + t('pending_loading') + '</div><div class="load-progress-track"><div class="load-progress-bar"></div></div><div class="load-progress-pct"></div></div>';
  const _pendingDone = startLoadProgress(body);
  try {
    const data = await apiGet();
    await _pendingDone();
    _pendingOrdersCache = data.orders || [];
    const me       = getCurrentUser();
    const myStr    = me ? me.name + ' (' + me.dept + ')' : null;
    const isOffice = me && me.dept === 'Office';
    const canApprove = me && (HARDCODED_ADMINS.includes(me.empid) || me.role === 'admin' || me.role === 'approver' || (me.role !== 'viewer' && isOffice));
    const shipFilter   = (document.getElementById('pendingShipFilter')   || {}).value || '';
    const statusFilter = (document.getElementById('pendingStatusFilter') || {}).value || '';
    const searchQ      = ((document.getElementById('pendingSearchInput')  || {}).value || '').toLowerCase();
    const dateFrom     = (document.getElementById('pendingDateFrom')      || {}).value || '';
    const dateTo       = (document.getElementById('pendingDateTo')        || {}).value || '';

    function parseOrderDate(o) {
      var d = o.date || '';
      var m = d.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/) ||
              d.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
      if (!m) return '';
      return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
    }

    // Sales: 본인 주문(pending + cancel_requested), Office: 전체
    const orders = (data.orders || []).filter(o => {
      if (!statusFilter) {
        if (o.status !== 'pending' && o.status !== 'cancel_requested') return false;
      } else {
        if (o.status !== statusFilter) return false;
      }
      if (!isOffice && myStr && o.user !== myStr) return false;
      if (shipFilter) {
        const st = (o.ship_type && o.ship_type.trim()) ? o.ship_type.trim() : '일반출고';
        if (st !== shipFilter) return false;
      }
      if (searchQ) {
        const match = (o.customer_erp  && o.customer_erp.toLowerCase().includes(searchQ)) ||
                      (o.customer_name && o.customer_name.toLowerCase().includes(searchQ));
        if (!match) return false;
      }
      if (dateFrom || dateTo) {
        const oDate = parseOrderDate(o);
        if (dateFrom && oDate && oDate < dateFrom) return false;
        if (dateTo   && oDate && oDate > dateTo)   return false;
      }
      return true;
    });
    updateBadgeCount(orders.length);
    var _orderNoMap = generateOrderNumbers(_pendingOrdersCache);

    if (!orders.length) {
      body.innerHTML = '<div class="pending-empty">&#x1F4ED; ' + t('pending_empty') + '</div>';
      document.getElementById('pendingSelectAllRow').classList.remove('show');
      return;
    }

    body.innerHTML = orders.map((o, idx) => {
      const items     = o.items || [];
      const custErp   = o.customer_erp  || '';
      const custName  = o.customer_name || '';
      const addr      = o.address || '';
      const shipType  = (o.ship_type && o.ship_type.trim()) ? o.ship_type.trim() : '일반출고';
      const shipColor    = shipType === '패키지출고' ? '#ef4444' : shipType === '위탁출고' ? '#2563eb' : shipType === '위탁정산' ? '#7c3aed' : 'transparent';
      const shipTxtColor = shipType === '패키지출고' || shipType === '위탁출고' || shipType === '위탁정산' ? '#fff' : '#374151';
      const shipBorder   = shipType === '일반출고' || !shipType ? '1.5px solid #9ca3af' : 'none';
      const isCancelReq  = o.status === 'cancel_requested';
      const isMine       = myStr && o.user === myStr;

      // 카드 클래스 (취소 요청이면 amber 테두리)
      const cardClass = isCancelReq ? 'pending-card cancel-req' : 'pending-card';

      // 체크박스: Sales에겐 숨김, cancel_requested 카드에도 숨김, 승인 권한 필요
      const chkHtml = isOffice && canApprove && !isCancelReq
        ? `<input type="checkbox" class="pc-checkbox" id="chk_${o.id}" onchange="onCardCheck()" data-id="${o.id}" onclick="event.stopPropagation()">`
        : '';

      // 취소 요청 배지
      const cancelBadge = isCancelReq
        ? `<span class="cancel-req-badge">&#x1F6AB; ${t('cancel_badge')}</span>`
        : '';

      // 푸터 버튼 결정
      let footerBtns = '';
      if (isCancelReq) {
        if (isOffice && canApprove) {
          // Office 승인자: 주문 유지(거부) or 취소 승인
          footerBtns = `
            <button class="btn-approve-order"  onclick="rejectCancelOrder('${o.id}')">&#x1F4E6; ${t('btn_keep_order')}</button>
            <button class="btn-approve-cancel" onclick="approveCancelOrder('${o.id}')">&#x2716;&#xFE0F; ${t('btn_cancel_approve')}</button>`;
        } else if (isOffice) {
          // Office 열람자: 진행 중 표시만
          footerBtns = `<span style="font-size:12px;color:#b45309;font-weight:600;">&#x23F3; ${t('cancel_review')}</span>`;
        } else {
          // Sales: 요청 중 표시만 (버튼 없음)
          footerBtns = `<span style="font-size:12px;color:#b45309;font-weight:600;">&#x23F3; ${t('cancel_review')}</span>`;
        }
      } else {
        // 일반 pending — 순서: Edit → Cancel → Complete
        if (isMine) {
          footerBtns += `<button class="btn-order-edit" onclick="openEditOrder('${o.id}')">&#x270F;&#xFE0F; ${t('btn_edit')}</button>`;
        }
        // Sales는 취소 요청, Office는 직접 취소 (승인 권한 필요)
        if (isMine) {
          if (isOffice && canApprove) {
            footerBtns += ` <button class="btn-order-cancel" onclick="cancelOrder('${o.id}')">&#x1F5D1; ${t('btn_cancel')}</button>`;
          } else if (!isOffice) {
            footerBtns += ` <button class="btn-cancel-req" onclick="requestCancelOrder('${o.id}')">&#x1F6AB; ${t('btn_cancel_req')}</button>`;
          }
        } else if (isOffice && canApprove) {
          footerBtns += `<button class="btn-order-cancel" onclick="cancelOrder('${o.id}')">&#x1F5D1; ${t('btn_cancel')}</button>`;
        }
        if (isOffice && canApprove) {
          footerBtns += ` <button class="btn-order-done" onclick="completeOrder('${o.id}')">&#x2705; ${t('btn_complete')}</button>`;
        }
      }

      var _totalQty = items.reduce(function(s, it) { return s + (parseInt(it.qty) || 1); }, 0);
      var _totalPrice = items.reduce(function(s, it) { return s + ((parseFloat(it.price) || 0) * (parseInt(it.qty) || 1)); }, 0);
      var _firstItem = items[0] || {};
      var _itemLine = _firstItem.model
        ? `${_firstItem.model}${items.length > 1 ? ' 외 ' + (items.length - 1) + '종' : ''} · 총 ${items.length}종/${_totalQty}개 · ฿${_totalPrice.toLocaleString()}`
        : `총 ${items.length}종/${_totalQty}개`;
      return `<div class="${cardClass}" id="pc_${o.id}">
        <div class="pc-clickable" onclick="openPendingDetail('${o.id}')">
          <div class="pending-card-hdr" style="flex-wrap:wrap;gap:4px 8px;">
            <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
              ${chkHtml}
              <span class="pc-title" style="white-space:nowrap;">${isCancelReq ? '&#x1F6AB;' : '&#x1F4E6;'} #${_orderNoMap[String(o.id)] || (idx + 1)}</span>
              <span style="font-size:13px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${custErp ? custErp + ' ' : ''}${custName}</span>
              <span style="font-size:11px;font-weight:700;background:${shipColor};color:${shipTxtColor};border:${shipBorder};border-radius:6px;padding:2px 8px;white-space:nowrap;">${tShipType(shipType)}</span>
              ${cancelBadge}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="pc-meta">${formatOrderDate(o.date)} &nbsp;|&nbsp; ${o.user}</span>
              <span class="pc-detail-hint">${t('detail_hint')}</span>
            </div>
          </div>
          ${isCancelReq ? `<div class="cancel-reason-box"><strong>${t('cancel_reason_label')}</strong> <span>${o.cancel_reason ? o.cancel_reason : t('cancel_reason_none')}</span></div>` : ''}
          <div style="padding:6px 14px;font-size:12px;color:#475569;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:6px;">
            <span style="color:#6366f1;font-weight:600;">📦</span> ${_itemLine}
          </div>
        </div>
        <div class="pending-card-footer">${footerBtns}</div>
      </div>`;
    }).join('');

    // 체크박스 행 / 배치바: Office만 표시
    if (isOffice) {
      document.getElementById('pendingSelectAllRow').classList.add('show');
      document.getElementById('checkAll').checked = false;
      document.getElementById('batchBar').classList.remove('show');
    } else {
      document.getElementById('pendingSelectAllRow').classList.remove('show');
      document.getElementById('batchBar').classList.remove('show');
    }

    // 알림에서 이동한 경우 해당 주문 자동 열기
    if (_notifNavigateOrderId) {
      var _navId = _notifNavigateOrderId;
      _notifNavigateOrderId = null;
      _notifNavigateType = null;
      var _found = orders.find(function(x) { return String(x.id) === _navId; });
      if (_found) {
        setTimeout(function() { openPendingDetail(_navId); }, 300);
        var _targetCard = document.getElementById('pc_' + _navId);
        if (_targetCard) _targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  } catch(e) {
    await _pendingDone();
    body.innerHTML = '<div class="pending-empty">&#x26A0;&#xFE0F; ' + t('load_failed') + '</div>';
  }
}

// ── 주문 상세 슬라이드 패널 ─────────────────────────────────────────────────
let _currentDetailOrderId = null;

function openPendingDetail(id) {
  // 같은 카드 다시 클릭 시 닫기 (토글)
  if (_currentDetailOrderId === id && document.getElementById('pendingDetailPanel').classList.contains('open')) {
    closePendingDetail();
    return;
  }
  const _src = _pendingOrdersCache.find(x => String(x.id) === String(id));
  if (!_src) return;
  _currentDetailOrderId = id;

  // 로컬 extras 병합 (GAS가 memo/delivery/attachments를 반환하지 않는 경우 대비) — const 재할당 방지를 위해 별도 변수
  const _extras = _orderExtrasMap[String(_src.id)] || {};
  const _mergeFields = {};
  if (_extras.memo && !_src.memo) _mergeFields.memo = _extras.memo;
  if (_extras.delivery_date && !_src.delivery_date) _mergeFields.delivery_date = _extras.delivery_date;
  if (_extras.delivery_method && !_src.delivery_method) _mergeFields.delivery_method = _extras.delivery_method;
  if (_extras.shipping_method && !_src.shipping_method) _mergeFields.shipping_method = _extras.shipping_method;
  if (_extras.tracking_number && !_src.tracking_number) _mergeFields.tracking_number = _extras.tracking_number;
  const o = Object.keys(_mergeFields).length ? Object.assign({}, _src, _mergeFields) : _src;

  const me        = getCurrentUser();
  const isOffice  = me && me.dept === 'Office';
  const items     = o.items || [];
  const shipType  = (o.ship_type && o.ship_type.trim()) ? o.ship_type.trim() : '일반출고';
  const shipBg    = shipType === '패키지출고' ? '#ef4444' : shipType === '위탁출고' ? '#2563eb' : shipType === '위탁정산' ? '#7c3aed' : '#6b7280';
  const isCancelReq = o.status === 'cancel_requested';
  const statusLabel = isCancelReq ? t('od_status_cancel_req') : t('od_status_pending');
  const statusColor = isCancelReq ? '#d97706' : '#2563eb';
  const attachments = (o.attachments && o.attachments.length) ? o.attachments : (_extras.attachments || []);

  // IndexedDB에서 첨부파일 보완 (dataUrl 누락 시 비동기 로드 후 재렌더)
  if (attachments.length && attachments.some(function(a){ return !a.dataUrl; })) {
    idbLoadAttachments(o.id).then(function(idbAtts) {
      if (!idbAtts.length) return;
      // 메모리 캐시에도 반영
      if (!_orderExtrasMap[String(o.id)]) _orderExtrasMap[String(o.id)] = {};
      _orderExtrasMap[String(o.id)].attachments = idbAtts;
      // dataUrl이 있는 항목만 병합
      idbAtts.forEach(function(idbAtt, i) {
        if (attachments[i] && !attachments[i].dataUrl && idbAtt.dataUrl) {
          attachments[i].dataUrl = idbAtt.dataUrl;
        }
      });
    });
  } else if (!attachments.length) {
    // 서버에 첨부파일 없으면 IndexedDB에서 직접 로드 후 패널 갱신
    idbLoadAttachments(o.id).then(function(idbAtts) {
      if (!idbAtts.length) return;
      if (!_orderExtrasMap[String(o.id)]) _orderExtrasMap[String(o.id)] = {};
      _orderExtrasMap[String(o.id)].attachments = idbAtts;
      // 이미 패널이 같은 주문으로 열려 있으면 첨부파일 섹션만 갱신
      if (_currentDetailOrderId === String(o.id)) {
        var pdpBody = document.getElementById('pdpBody');
        if (pdpBody && !pdpBody.querySelector('.od-att-btn')) {
          var attDiv = document.createElement('div');
          attDiv.className = 'od-section';
          attDiv.innerHTML = '<div class="od-section-title">📎 ' + t('od_attachments') + ' (' + idbAtts.length + ')</div>'
            + '<div class="od-attachments">'
            + idbAtts.map(function(att, i) {
                return '<button class="od-att-btn" onclick="previewPendingFile(\'' + o.id + '\',' + i + ');">'
                  + (att.type === 'application/pdf' ? '📄' : '🖼️') + ' ' + att.name + '</button>';
              }).join('')
            + '</div>';
          pdpBody.appendChild(attDiv);
        }
      }
    });
  }

  // 헤더
  var _detailNoMap = generateOrderNumbers(_pendingOrdersCache);
  var _orderNo = _detailNoMap[String(o.id)] || o.id;
  document.getElementById('pdpTitle').innerHTML =
    `📦 발송 상세&ensp;<span style="font-size:11px;font-weight:700;background:#374151;color:#fff;border-radius:6px;padding:2px 9px;">#${_orderNo}</span>&ensp;<span style="font-size:11px;font-weight:700;background:${shipBg};color:#fff;border-radius:6px;padding:2px 9px;">${tShipType(shipType)}</span>`;

  // 메모 블록
  const memoHtml = o.memo ? `
    <div class="od-section">
      <div class="od-section-title">📝 ${t('od_memo')}</div>
      <div style="font-size:13px;color:#374151;line-height:1.7;padding:4px 0;white-space:pre-wrap;">${o.memo}</div>
    </div>` : '';

  // 첨부파일 블록
  const attHtml = attachments.length ? `
    <div class="od-section">
      <div class="od-section-title">📎 ${t('od_attachments')} (${attachments.length})</div>
      <div class="od-attachments">
        ${attachments.map((att, i) =>
          `<button class="od-att-btn" onclick="previewPendingFile('${o.id}',${i});">
            ${att.type === 'application/pdf' ? '📄' : '🖼️'} ${att.name}
           </button>`
        ).join('')}
      </div>
    </div>` : '';

  // 본문
  document.getElementById('pdpBody').innerHTML = `
    ${isCancelReq ? `
    <div style="margin:0 0 12px;padding:12px 16px;background:#fee2e2;border:2px solid #ef4444;border-radius:10px;display:flex;flex-direction:column;gap:6px;">
      <div style="font-size:13px;font-weight:800;color:#b91c1c;">${t('cancel_notice')}</div>
      <div style="font-size:12px;color:#7f1d1d;"><strong>${t('cancel_reason_label')}</strong> ${o.cancel_reason ? o.cancel_reason : t('cancel_reason_none')}</div>
      ${isOffice ? `<div style="font-size:11px;color:#991b1b;margin-top:2px;">${t('cancel_instruction')}</div>` : ''}
    </div>` : ''}
    <div class="od-section">
      <div class="od-section-title">📋 주문 정보</div>
      <div class="od-row"><span class="od-label">${t('od_status')}</span><span class="od-value" style="color:${statusColor};font-weight:700;">${statusLabel}</span></div>
      <div class="od-row"><span class="od-label">주문 요청일</span><span class="od-value">${formatOrderDate(o.date)}</span></div>
      <div class="od-row"><span class="od-label">신청자</span><span class="od-value">${o.user || '-'}</span></div>
    </div>
    <div class="od-section">
      <div class="od-section-title">🏥 ${t('od_cust_info')}</div>
      <div class="od-row"><span class="od-label">${t('od_erp')}</span><span class="od-value" style="font-weight:700;">${o.customer_erp || '-'}</span></div>
      <div class="od-row"><span class="od-label">${t('od_customer')}</span><span class="od-value">${o.customer_name || '-'}</span></div>
      ${o.address ? `<div class="od-row"><span class="od-label">${t('od_address')}</span><span class="od-value" style="font-size:12px;color:#64748b;">${o.address}</span></div>` : ''}
    </div>
    <div class="od-section">
      <div class="od-section-title">🚚 배송 정보</div>
      <div class="od-row"><span class="od-label">구매 유형</span><span class="od-value" style="font-weight:700;">${tShipType(shipType)}</span></div>
      <div class="od-row"><span class="od-label">요청 날짜</span><span class="od-value" style="font-weight:700;color:#0891b2;">${formatDeliveryDate(o.delivery_date)}</span></div>
      <div class="od-row"><span class="od-label">배송 방법</span><span class="od-value">${styledDeliveryMethod(o.delivery_method || o.shipping_method)}</span></div>
    </div>
    <div class="od-section">
      <div class="od-section-title">📦 ${t('od_items')} (${items.length})</div>
      <table class="od-item-table">
        <thead><tr>
          <th>${t('od_col_model')}</th>
          <th>${t('od_col_spec')}</th>
          <th style="text-align:right;width:80px;">Unit Price</th>
          <th style="text-align:center;width:42px;">${t('od_col_qty')}</th>
          <th style="text-align:right;width:90px;">Total</th>
        </tr></thead>
        <tbody>
          ${items.map(it => {
            var _p = parseFloat(it.price) || 0;
            var _t = _p * (parseFloat(it.qty) || 0);
            return `<tr>
            <td class="td-model">${it.model || ''}</td>
            <td>${it.spec || it.name || ''}</td>
            <td style="text-align:right;font-size:12px;">${_p ? _p.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
            <td class="td-qty">${it.qty}</td>
            <td style="text-align:right;font-weight:600;color:#7c3aed;font-size:12px;">${_t ? _t.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '-'}</td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${(() => { var gt = items.reduce((s,it) => s + (parseFloat(it.price)||0)*(parseFloat(it.qty)||0), 0); return gt ? `<div style="text-align:right;font-weight:700;font-size:13px;margin-top:6px;color:#7c3aed;">합계: ฿${gt.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>` : ''; })()}
    </div>
    ${memoHtml}
    ${attHtml}
  `;

  // 하단 버튼 구성
  const footer = document.getElementById('pdpFooter');
  if (isCancelReq && isOffice) {
    footer.innerHTML = `
      <button class="btn-pdp-back"         onclick="closePendingDetail()">&#x2190; ${t('btn_back')}</button>
      <button class="btn-pdp-keep"         onclick="rejectCancelFromDetail()">&#x1F4E6; ${t('btn_keep_order')}</button>
      <button class="btn-pdp-approve-cancel" onclick="approveCancelFromDetail()">&#x2716;&#xFE0F; ${t('btn_cancel_approve')}</button>`;
  } else if (!isCancelReq && isOffice) {
    footer.innerHTML = `
      <button class="btn-pdp-back"    onclick="closePendingDetail()">&#x2190; ${t('btn_back')}</button>
      <button class="btn-pdp-approve" onclick="approveFromDetail()">&#x2705; ${t('btn_approve_detail')}</button>`;
  } else {
    footer.innerHTML = `
      <button class="btn-pdp-back" style="flex:1;" onclick="closePendingDetail()">&#x2190; ${t('btn_back')}</button>`;
  }

  document.getElementById('pendingDetailPanel').classList.add('open');
  // 전체화면 상태에서 상세 열면 자동으로 split-mode
  var modal = document.getElementById('pendingModal');
  if (modal.classList.contains('fullscreen')) modal.classList.add('split-mode');
}

function closePendingDetail() {
  document.getElementById('pendingDetailPanel').classList.remove('open');
  // split-mode 해제
  var modal = document.getElementById('pendingModal');
  if (modal) modal.classList.remove('split-mode');
  var mini = document.getElementById('pendingMini');
  if (mini) mini.classList.remove('show');
  _currentDetailOrderId = null;
}

// ── 전역 모달 드래그 이동 (경계 바운스) ──
(function() {
  var DRAG_HEADERS = '.pending-hdr, .shipped-hdr, .delivery-hdr, .results-qry-hdr, .quote-hdr, .order-hdr, .tracking-hdr, .reg-header, .acct-settings-hdr, .acct-hdr, .ql-hdr, .cm-hdr';
  var isDragging = false, dragModal = null, startMouseX = 0, startMouseY = 0, startLeft = 0, startTop = 0;
  var MARGIN = 8;

  document.addEventListener('mousedown', function(e) {
    var hdr = e.target.closest(DRAG_HEADERS);
    if (!hdr) return;
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
    var modal = hdr.closest('.pending-modal, .shipped-modal, .delivery-modal, .results-qry-modal, .quote-modal, .order-modal, .tracking-modal, .reg-modal, .acct-settings-modal, .acct-modal, .quote-list-modal, .cm-modal, .modal');
    if (!modal) return;
    isDragging = true;
    dragModal = modal;
    var rect = modal.getBoundingClientRect();
    if (!modal.style.left || modal.style.left === 'auto') {
      modal.style.position = 'absolute';
      modal.style.left = rect.left + 'px';
      modal.style.top = rect.top + 'px';
      modal.style.margin = '0';
    }
    modal.style.transition = 'none';
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    startLeft = parseInt(modal.style.left) || rect.left;
    startTop = parseInt(modal.style.top) || rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isDragging || !dragModal) return;
    dragModal.style.left = (startLeft + e.clientX - startMouseX) + 'px';
    var newTop = startTop + e.clientY - startMouseY;
    dragModal.style.top = newTop + 'px';
    dragModal.style.maxHeight = Math.max(200, window.innerHeight - Math.max(0, newTop) - 8) + 'px';
  });

  document.addEventListener('mouseup', function() {
    if (!isDragging || !dragModal) return;
    isDragging = false;
    var rect = dragModal.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var newLeft = parseInt(dragModal.style.left), newTop = parseInt(dragModal.style.top), bounced = false;
    if (rect.left < MARGIN) { newLeft = MARGIN; bounced = true; }
    if (rect.top < MARGIN) { newTop = MARGIN; bounced = true; }
    if (rect.right > vw - MARGIN) { newLeft = vw - MARGIN - rect.width; bounced = true; }
    if (rect.bottom > vh - MARGIN) { newTop = vh - MARGIN - rect.height; bounced = true; }
    // top이 음수가 되지 않도록 보정 (모달이 뷰포트보다 클 때)
    if (newTop < MARGIN) { newTop = MARGIN; bounced = true; }
    if (bounced) {
      dragModal.style.transition = 'left .35s cubic-bezier(.34,1.3,.64,1), top .35s cubic-bezier(.34,1.3,.64,1)';
      dragModal.style.left = newLeft + 'px';
      dragModal.style.top = newTop + 'px';
      // 바운스 후 maxHeight 재계산하여 스크롤 가능하게
      dragModal.style.maxHeight = Math.max(200, vh - newTop - MARGIN) + 'px';
      setTimeout(function() { if (dragModal) dragModal.style.transition = 'none'; }, 380);
    }
    dragModal = null;
  });
})();

// ── 서브메뉴 방향 자동 전환 (화면 끝에 부딪히면 왼쪽으로) ──
document.querySelectorAll('.cust-dd-item.has-sub').forEach(function(item) {
  item.addEventListener('mouseenter', function() {
    var sub = item.querySelector('.cust-sub-menu');
    if (!sub) return;
    sub.classList.remove('flip-left');
    // 잠시 보이게 해서 위치 계산
    var origDisplay = sub.style.display;
    sub.style.display = 'block';
    sub.style.visibility = 'hidden';
    var rect = sub.getBoundingClientRect();
    sub.style.display = origDisplay;
    sub.style.visibility = '';
    if (rect.right > window.innerWidth - 8) {
      sub.classList.add('flip-left');
    }
  });
});

// ── 모달/채팅창 포커스 (클릭 시 + 열릴 때 최상단) ──
var _topZ = 10700;
function _bringToFront(el) {
  if (!el) return;
  _topZ++;
  el.style.zIndex = _topZ;
}
(function() {
  var FOCUSABLE = '.pending-modal, .shipped-modal, .delivery-modal, .results-qry-modal, .quote-modal, .order-modal, .tracking-modal, .reg-modal, .acct-settings-modal, .acct-modal, .quote-list-modal, .cm-modal, .chat-popup';
  // 클릭 시 최상단
  document.addEventListener('mousedown', function(e) {
    var el = e.target.closest(FOCUSABLE);
    if (!el) return;
    var cur = parseInt(el.style.zIndex) || 0;
    if (cur < _topZ) _bringToFront(el);
  }, true);
  // 모든 오버레이/모달이 열릴 때(open/show 클래스) 자동 최상단
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      var el = m.target;
      var cn = el.className || '';
      // overlay 또는 modal 관련 요소가 open/show 클래스를 가지면 최상단
      // 지도 관련 요소는 별도 z-index 관리이므로 제외
      if (cn.indexOf('modal-map-slide') !== -1 || cn.indexOf('map-float') !== -1) return;
      // pkg-overlay, cat-slide는 별도 관리
      if (cn.indexOf('pkg-overlay') !== -1) return;
      if (cn.indexOf('cat-slide') !== -1 || cn.indexOf('qt-confirm') !== -1) return;
      if ((cn.indexOf('overlay') !== -1 || cn.indexOf('Overlay') !== -1 || cn.indexOf('modal') !== -1) &&
          (el.classList.contains('open') || el.classList.contains('show'))) {
        _bringToFront(el);
      }
    });
  });
  // document.body의 자식 전체를 감시 (subtree로 모든 요소 커버)
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
})();

// ── 모달 리사이즈 ──
(function() {
  var isResizing = false, resizeModal = null, resizeDir = '', startX = 0, startY = 0;
  var startRect = null, minW = 360, minH = 300;

  document.addEventListener('mousedown', function(e) {
    var handle = e.target.closest('.resize-handle');
    if (!handle) return;
    resizeModal = handle.closest('.pending-modal, .shipped-modal, .delivery-modal, .results-qry-modal, .quote-modal, .order-modal, .tracking-modal, .reg-modal, .acct-settings-modal, .acct-modal, .edit-acct-modal, .quote-list-modal, .cm-modal, .qt-preview-modal, .modal');
    if (!resizeModal || resizeModal.classList.contains('fullscreen')) return;
    isResizing = true;
    handle.classList.add('active');
    resizeDir = ['n','s','e','w','ne','nw','se','sw'].find(function(d){ return handle.classList.contains('resize-handle-' + d); }) || '';
    startX = e.clientX; startY = e.clientY;
    var rect = resizeModal.getBoundingClientRect();
    startRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    // fixed로 고정 (getBoundingClientRect는 viewport 기준이므로 fixed와 일치)
    resizeModal.style.position = 'fixed';
    resizeModal.style.left = startRect.left + 'px';
    resizeModal.style.top = startRect.top + 'px';
    resizeModal.style.margin = '0';
    resizeModal.style.transform = 'none';
    resizeModal.style.transition = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isResizing || !resizeModal) return;
    var dx = e.clientX - startX, dy = e.clientY - startY;
    var newW = startRect.width, newH = startRect.height;
    var newL = startRect.left, newT = startRect.top;

    if (resizeDir.indexOf('e') !== -1) newW = Math.max(minW, startRect.width + dx);
    if (resizeDir.indexOf('w') !== -1) { newW = Math.max(minW, startRect.width - dx); newL = startRect.left + startRect.width - newW; }
    if (resizeDir.indexOf('s') !== -1) newH = Math.max(minH, startRect.height + dy);
    if (resizeDir.indexOf('n') !== -1) { newH = Math.max(minH, startRect.height - dy); newT = startRect.top + startRect.height - newH; }

    resizeModal.style.width = newW + 'px';
    resizeModal.style.maxWidth = newW + 'px';
    resizeModal.style.height = newH + 'px';
    resizeModal.style.maxHeight = newH + 'px';
    resizeModal.style.left = newL + 'px';
    resizeModal.style.top = newT + 'px';
  });

  document.addEventListener('mouseup', function() {
    if (!isResizing) return;
    isResizing = false;
    if (resizeModal) {
      resizeModal.querySelectorAll('.resize-handle').forEach(function(h){ h.classList.remove('active'); });
    }
    resizeModal = null;
  });
})();

// ── 모달 위치 초기화 헬퍼 ──
function _resetModalPos(modal) {
  if (modal) { modal.style.position = ''; modal.style.left = ''; modal.style.top = ''; modal.style.margin = ''; modal.style.transform = ''; modal.style.transition = ''; modal.style.width = ''; modal.style.maxWidth = ''; modal.style.height = ''; modal.style.maxHeight = ''; }
}

// ── 모바일: 헤더 스와이프 다운 → 최소화 ──
(function() {
  if (window.innerWidth > 768) return;
  var SWIPE_HEADERS = '.pending-hdr, .shipped-hdr, .delivery-hdr, .results-qry-hdr, .quote-hdr, .order-hdr, .tracking-hdr, .reg-header, .acct-settings-hdr, .acct-hdr, .ql-hdr, .cm-hdr, .qt-preview-hdr';
  var MODAL_MAP = {
    'order-hdr': function(m) { if (typeof minimizeOrderForm === 'function') minimizeOrderForm(); else { var o = m.closest('.order-overlay'); if(o) o.classList.remove('open'); }},
    'quote-hdr': function(m) { if (typeof minimizeQuoteForm === 'function') minimizeQuoteForm(); else { var o = m.closest('.quote-overlay'); if(o) o.classList.remove('open'); }},
    'pending-hdr': function(m) { if (typeof minimizePending === 'function') minimizePending(); else { var o = m.closest('.pending-overlay'); if(o) o.classList.remove('open'); }},
    'reg-header': function(m) { if (typeof minimizeRegForm === 'function') minimizeRegForm(); else { var o = m.closest('.reg-overlay'); if(o) { o.classList.remove('show'); o.style.display='none'; }}},
    '_default': function(m) {
      var overlay = m.parentElement;
      if (overlay && overlay.classList.contains('open')) overlay.classList.remove('open');
      else if (overlay) overlay.style.display = 'none';
    }
  };
  var startY = 0, startTime = 0, activeModal = null, activeHdrClass = '';
  document.addEventListener('touchstart', function(e) {
    var hdr = e.target.closest(SWIPE_HEADERS);
    if (!hdr) return;
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
    var modal = hdr.closest('.pending-modal, .shipped-modal, .delivery-modal, .results-qry-modal, .quote-modal, .order-modal, .tracking-modal, .reg-modal, .acct-settings-modal, .acct-modal, .quote-list-modal, .cm-modal, .qt-preview-modal, .modal');
    if (!modal) return;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    activeModal = modal;
    activeHdrClass = hdr.className.split(' ')[0];
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!activeModal) return;
    var dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      activeModal.style.transform = 'translateY(' + Math.min(dy * 0.6, 200) + 'px)';
      activeModal.style.transition = 'none';
    }
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (!activeModal) return;
    var endY = e.changedTouches[0].clientY;
    var dy = endY - startY;
    var dt = Date.now() - startTime;
    var modal = activeModal;
    var hdrCls = activeHdrClass;
    activeModal = null;
    activeHdrClass = '';
    // 120px 이상 내리거나 빠른 스와이프(200ms 이내 60px+)
    if (dy > 120 || (dy > 60 && dt < 200)) {
      modal.style.transition = 'transform 0.25s ease';
      modal.style.transform = 'translateY(100%)';
      setTimeout(function() {
        modal.style.transform = '';
        modal.style.transition = '';
        var fn = MODAL_MAP[hdrCls] || MODAL_MAP['_default'];
        fn(modal);
      }, 260);
    } else {
      modal.style.transition = 'transform 0.2s ease';
      modal.style.transform = '';
      setTimeout(function() { modal.style.transition = ''; }, 220);
    }
  }, { passive: true });
})();

// ── 모든 모달에 리사이즈 핸들 + 최대화 버튼 자동 주입 ──
(function() {
  var MODAL_SELECTORS = [
    '.pending-modal', '.delivery-modal', '.shipped-modal', '.tracking-modal',
    '.results-qry-modal', '.quote-modal', '.order-modal', '.reg-modal',
    '.acct-settings-modal', '.acct-modal', '.edit-acct-modal',
    '.quote-list-modal', '.cm-modal', '.qt-preview-modal', '.modal'
  ];
  var HANDLE_DIRS = ['n','s','e','w','ne','nw','se','sw'];

  function injectResizeHandles(modal) {
    if (modal.querySelector('.resize-handle')) return; // 이미 있음
    HANDLE_DIRS.forEach(function(d) {
      var h = document.createElement('div');
      h.className = 'resize-handle resize-handle-' + d;
      modal.appendChild(h);
    });
  }

  function injectFullscreenBtn(modal) {
    // modal-ctrl-group(최소/전체/닫기)이 있는 모달만 자체 버튼 사용, 나머지는 전체화면 비활성
    return;
    if (modal.querySelector('.modal-fs-btn')) return;
    if (modal.querySelector('.modal-ctrl-group')) return;
    if (modal.classList.contains('pending-modal')) return;
    if (modal.classList.contains('acct-modal')) return;
    var btn = document.createElement('button');
    btn.className = 'modal-fs-btn';
    btn.innerHTML = '&#x26F6;';
    btn.title = '전체화면';
    btn.onclick = function(e) {
      e.stopPropagation();
      toggleModalFullscreen(modal, btn);
    };
    // 더블 클릭으로도 토글
    modal.addEventListener('dblclick', function(ev) {
      // 입력 필드나 버튼 등에서는 무시
      var tag = ev.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || ev.target.closest('button')) return;
      toggleModalFullscreen(modal, btn);
    });
    modal.style.position = modal.style.position || 'relative';
    modal.insertBefore(btn, modal.firstChild);
  }

  window.toggleModalFullscreen = function(modal, btn) {
    var isFS = modal.classList.toggle('fullscreen');
    if (isFS) {
      modal._savedStyle = modal.style.cssText;
      modal.style.cssText = '';
      // 모바일: 헤더 위로 (전체 화면)
      if (window.innerWidth <= 1024) {
        modal.style.zIndex = '100000';
      }
    } else {
      modal.style.cssText = modal._savedStyle || '';
    }
    if (btn) {
      btn.innerHTML = isFS ? '&#x2750;' : '&#x26F6;';
      btn.title = isFS ? (typeof t === 'function' ? t('qt_btn_minimize') : '복원') : (typeof t === 'function' ? t('qt_btn_fullscreen') : '전체화면');
    }
  };

  // DOM 준비 후 주입
  function init() {
    MODAL_SELECTORS.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(modal) {
        injectResizeHandles(modal);
        injectFullscreenBtn(modal);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

function minimizePending() {
  document.getElementById('pendingOverlay').classList.remove('open');
  document.getElementById('pendingMini').classList.add('show');
  _repositionMinis();
}

// ── 최소화 바 가로 자동 배치 ──
function _repositionMinis() {
  var GAP = 10;
  var RIGHT_START = 24;
  // 모든 미니 바 수집 (static + dynamic)
  var items = Array.from(document.querySelectorAll('.modal-mini.show, .pdp-mini.show'));
  // dd-mini-pill (배송 상세 동적 미니)
  var ddPills = Array.from(document.querySelectorAll('.dd-mini-pill'));
  items = items.concat(ddPills);
  if (!items.length) return;
  var offset = RIGHT_START;
  // 오른쪽부터 왼쪽으로 배치
  for (var i = items.length - 1; i >= 0; i--) {
    items[i].style.right = offset + 'px';
    items[i].style.bottom = '24px';
    offset += items[i].offsetWidth + GAP;
  }
}

// ── 범용 모달 최소화 (오버레이 닫기) ──
function modalMinimize(closeFunc) {
  if (typeof closeFunc === 'function') closeFunc();
}

// ── 범용 모달 전체화면 토글 ──
function modalToggleFS(btn) {
  var modal = btn.closest('.pending-modal, .order-modal, .delivery-modal, .shipped-modal, .tracking-modal, .results-qry-modal, .quote-modal, .reg-modal, .acct-settings-modal, .edit-acct-modal, .quote-list-modal, .cm-modal, .qt-preview-modal, .receipt-admin-modal, .modal');
  if (modal) toggleModalFullscreen(modal, btn);
}

// ── 데스크탑뷰: 모달 헤더 더블클릭 → 전체화면 토글 ──
(function() {
  if (window.innerWidth < 1025) return; // 모바일/태블릿 제외
  document.addEventListener('dblclick', function(e) {
    var hdr = e.target.closest('[class$="-hdr"]');
    if (!hdr) return;
    // 입력 필드, 버튼 등에서는 무시
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || e.target.closest('button')) return;
    var modal = hdr.closest('.pending-modal, .order-modal, .delivery-modal, .shipped-modal, .tracking-modal, .results-qry-modal, .quote-modal, .reg-modal, .acct-settings-modal, .edit-acct-modal, .quote-list-modal, .cm-modal, .qt-preview-modal, .receipt-admin-modal, .modal');
    if (!modal) return;
    var fsBtn = modal.querySelector('.modal-btn-fs');
    toggleModalFullscreen(modal, fsBtn);
  });
})();

function restorePending() {
  document.getElementById('pendingMini').classList.remove('show');
  var modal = document.getElementById('pendingModal');
  _resetModalPos(modal);
  var _ov = document.getElementById('pendingOverlay');
  _ov.classList.add('open');
  _mobFullScreen(_ov, modal);
  _repositionMinis();
}

function togglePendingFullscreen() {
  var modal = document.getElementById('pendingModal');
  var btn = document.getElementById('pendingFullscreenBtn');
  var detailOpen = document.getElementById('pendingDetailPanel').classList.contains('open');
  var isFullscreen = modal.classList.toggle('fullscreen');
  if (isFullscreen) {
    modal._savedStyle = { left: modal.style.left, top: modal.style.top, position: modal.style.position, margin: modal.style.margin };
    modal.style.left = '0'; modal.style.top = '0'; modal.style.position = 'fixed'; modal.style.margin = '0';
    if (detailOpen) modal.classList.add('split-mode');
  } else {
    modal.classList.remove('split-mode');
    if (modal._savedStyle) {
      modal.style.left = modal._savedStyle.left; modal.style.top = modal._savedStyle.top;
      modal.style.position = modal._savedStyle.position; modal.style.margin = modal._savedStyle.margin;
    }
  }
  btn.innerHTML = isFullscreen ? '&#x2750;' : '&#x26F6;';
  btn.title = isFullscreen ? t('msg_restore') : t('msg_fullscreen');
}

function toggleDeliveryFullscreen() {
  var modal = document.getElementById('deliveryModal');
  var btn = document.getElementById('deliveryFullscreenBtn');
  var isFullscreen = modal.classList.toggle('fullscreen');
  if (isFullscreen) {
    modal._savedStyle = { left: modal.style.left, top: modal.style.top, position: modal.style.position, margin: modal.style.margin };
    modal.style.left = '0'; modal.style.top = '0'; modal.style.position = 'fixed'; modal.style.margin = '0';
  } else {
    if (modal._savedStyle) {
      modal.style.left = modal._savedStyle.left; modal.style.top = modal._savedStyle.top;
      modal.style.position = modal._savedStyle.position; modal.style.margin = modal._savedStyle.margin;
    }
  }
  btn.innerHTML = isFullscreen ? '&#x2750;' : '&#x26F6;';
  btn.title = isFullscreen ? t('msg_restore') : t('msg_fullscreen');
}

function toggleDetailFullscreen() {
  var modal = document.getElementById('pendingModal');
  var panel = document.getElementById('pendingDetailPanel');
  var btn = document.getElementById('pdpFullscreenBtn');
  // 모달이 이미 전체화면이면 split-mode 토글
  if (modal.classList.contains('fullscreen')) {
    var isSplit = modal.classList.toggle('split-mode');
    btn.innerHTML = isSplit ? '&#x2750;' : '&#x26F6;';
    btn.title = isSplit ? t('msg_restore') : t('msg_fullscreen');
    return;
  }
  // 모달이 전체화면이 아닌 경우 → 상세만 단독 전체화면
  var isFullscreen = panel.classList.toggle('fullscreen');
  if (isFullscreen) {
    // body로 이동하여 부모 transform 영향 제거
    panel._savedParent = panel.parentNode;
    panel._savedNext = panel.nextSibling;
    panel._savedCss = panel.style.cssText;
    document.body.appendChild(panel);
    panel.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;width:100vw;height:100vh;max-width:100vw;max-height:100vh;margin:0;transform:none;opacity:1;z-index:10001;border-radius:0;display:flex;flex-direction:column;background:#fff;';
  } else {
    // 원래 위치로 복원
    if (panel._savedParent) {
      if (panel._savedNext) panel._savedParent.insertBefore(panel, panel._savedNext);
      else panel._savedParent.appendChild(panel);
    }
    panel.style.cssText = panel._savedCss || '';
  }
  btn.innerHTML = isFullscreen ? '&#x2750;' : '&#x26F6;';
  btn.title = isFullscreen ? t('msg_restore') : t('msg_fullscreen');
}

// ── 주문 상세 인쇄 ────────────────────────────────────────────────────────────
function printOrderDetail() {
  var pdpBody   = document.getElementById('pdpBody');
  var pdpTitle  = document.getElementById('pdpTitle');
  if (!pdpBody) return;

  var titleHtml = pdpTitle ? pdpTitle.innerHTML : '주문 상세';
  var bodyHtml  = pdpBody.innerHTML;

  var win = window.open('', '_blank', 'width=800,height=900');
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>주문 상세</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:'Segoe UI','Apple SD Gothic Neo',sans-serif; color:#111827; padding:24px; font-size:13px; }
      h2 { font-size:16px; font-weight:700; color:#1e40af; margin-bottom:16px; }
      .od-section { margin-bottom:14px; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; }
      .od-section-title { font-size:11px; font-weight:700; color:#2563eb; background:#f0f4ff; padding:6px 12px; text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid #e5e7eb; }
      .od-row { display:flex; gap:12px; padding:6px 12px; border-bottom:1px solid #f3f4f6; font-size:13px; }
      .od-label { color:#6b7280; min-width:110px; flex-shrink:0; }
      .od-value { font-weight:600; color:#111827; word-break:break-all; }
      .od-item-table { width:100%; border-collapse:collapse; font-size:13px; }
      .od-item-table th { background:#f8fafc; padding:7px 12px; text-align:left; font-size:11px; font-weight:700; color:#374151; border-bottom:2px solid #e5e7eb; }
      .od-item-table td { padding:8px 12px; border-bottom:1px solid #f3f4f6; }
      .td-model { font-weight:700; color:#1e40af; }
      .td-qty { text-align:center; font-weight:700; }
      .od-attachments { padding:8px 12px; display:flex; flex-wrap:wrap; gap:6px; }
      .od-att-btn { background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; border-radius:6px; padding:4px 10px; font-size:12px; }
      /* 인쇄 전용 취소선 없애기 */
      button { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    </style>
  </head><body>
    <h2>${titleHtml}</h2>
    ${bodyHtml}
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(function() {
    win.print();
    // 인쇄 다이얼로그 닫힌 후 팝업 자동 닫기
    win.onafterprint = function() { win.close(); };
    // 브라우저 onafterprint 미지원 대비 fallback
    setTimeout(function() { try { win.close(); } catch(e){} }, 3000);
  }, 400);
}

// ── 주문 상세 PDF 직접 다운로드 (html2canvas + jsPDF) ────────────────────────
async function saveOrderDetailPdf() {
  // 라이브러리 동적 로드
  try { await loadHtml2Canvas(); await loadJsPDF(); } catch(e) { neoAlert('PDF 라이브러리 로딩 실패. 네트워크를 확인해 주세요.'); return; }
  var pdpBody  = document.getElementById('pdpBody');
  var pdpTitle = document.getElementById('pdpTitle');
  if (!pdpBody) return;

  var btn = document.querySelector('.btn-pdp-pdf');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + t('msg_generating'); }

  try {
    // ── 스크롤 제약 임시 해제 (전체 높이 캡처를 위해) ──
    var pdpPanel = document.getElementById('pendingDetailPanel');
    var savedPanelOverflow = pdpPanel ? pdpPanel.style.overflow : '';
    var savedBodyOverflow  = pdpBody.style.overflow;
    var savedBodyHeight    = pdpBody.style.height;
    var savedBodyMaxHeight = pdpBody.style.maxHeight;
    if (pdpPanel) pdpPanel.style.overflow = 'visible';
    pdpBody.style.overflow  = 'visible';
    pdpBody.style.height    = 'auto';
    pdpBody.style.maxHeight = 'none';

    // 첨부파일 버튼 등 클릭 요소는 캡처에서 제외하기 위해 임시 숨김
    var attBtns = pdpBody.querySelectorAll('.od-att-btn');
    attBtns.forEach(function(b){ b.style.display = 'none'; });

    var fullHeight = pdpBody.scrollHeight;

    var canvas = await html2canvas(pdpBody, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width:  pdpBody.offsetWidth,
      height: fullHeight,
      windowWidth:  pdpBody.offsetWidth,
      windowHeight: fullHeight,
      scrollX: 0,
      scrollY: 0
    });

    attBtns.forEach(function(b){ b.style.display = ''; });

    // ── 스크롤 제약 복원 ──
    if (pdpPanel) pdpPanel.style.overflow = savedPanelOverflow;
    pdpBody.style.overflow  = savedBodyOverflow;
    pdpBody.style.height    = savedBodyHeight;
    pdpBody.style.maxHeight = savedBodyMaxHeight;

    var { jsPDF } = window.jspdf;
    var margin = 10;
    var imgW   = 190;            // A4 가용 너비 (mm)
    var pageH  = 277;            // A4 가용 높이 (mm)
    var imgH   = canvas.height * imgW / canvas.width;

    var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var titleText = pdpTitle ? pdpTitle.innerText.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s+/g, ' ').trim() : 'Order Detail';

    // 제목 줄
    var yPos = margin;
    pdf.setFontSize(13);
    pdf.setTextColor(30, 64, 175);
    pdf.text(titleText, margin, yPos);
    yPos += 7;

    // 긴 내용 여러 페이지로 자동 분할
    var remaining = imgH;
    var srcY = 0;

    while (remaining > 0) {
      var sliceH  = Math.min(remaining, pageH - yPos);
      var slicePx = Math.round(sliceH * canvas.width / imgW);
      var sliceCanvas = document.createElement('canvas');
      sliceCanvas.width  = canvas.width;
      sliceCanvas.height = slicePx;
      var ctx = sliceCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, srcY, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
      pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, yPos, imgW, sliceH);
      srcY      += slicePx;
      remaining -= sliceH;
      yPos = margin;
      if (remaining > 0) pdf.addPage();
    }

    // 파일명: OrderDetail_YYYYMMDD_HHMMSS.pdf
    var now = new Date();
    var fname = 'OrderDetail_' +
      now.getFullYear() +
      String(now.getMonth()+1).padStart(2,'0') +
      String(now.getDate()).padStart(2,'0') + '_' +
      String(now.getHours()).padStart(2,'0') +
      String(now.getMinutes()).padStart(2,'0') +
      String(now.getSeconds()).padStart(2,'0') + '.pdf';

    pdf.save(fname);
  } catch(e) {
    // 에러 시에도 스크롤 제약 복원
    try {
      var _pp = document.getElementById('pendingDetailPanel');
      if (_pp) _pp.style.overflow = '';
      var _pb = document.getElementById('pdpBody');
      if (_pb) { _pb.style.overflow = ''; _pb.style.height = ''; _pb.style.maxHeight = ''; }
    } catch(e2){}
    neoAlert('PDF 생성 실패: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '📄 PDF'; }
  }
}

async function approveFromDetail() {
  if (!_currentDetailOrderId) return;
  const id = _currentDetailOrderId;
  if (!confirm(t('approve_confirm'))) return;
  closePendingDetail();
  await completeOrder(id);
}

async function rejectCancelFromDetail() {
  if (!_currentDetailOrderId) return;
  const id = _currentDetailOrderId;
  closePendingDetail();
  await rejectCancelOrder(id);
}

async function approveCancelFromDetail() {
  if (!_currentDetailOrderId) return;
  const id = _currentDetailOrderId;
  closePendingDetail();
  await approveCancelOrder(id);
}

function previewPendingFile(orderId, attIdx) {
  // 서버·메모리·IndexedDB 순으로 attachment 탐색
  function _showPreview(att) {
    if (!att || !att.dataUrl) {
      neoAlert(t('msg_no_attach'));
      return;
    }
    document.getElementById('fpFileName').textContent = att.name;
    const body = document.getElementById('fpBody');
    if (att.type === 'application/pdf') {
      body.innerHTML = '<iframe src="' + att.dataUrl + '"></iframe>';
    } else {
      body.innerHTML = '<img src="' + att.dataUrl + '" alt="' + att.name + '">';
    }
    document.getElementById('fpDownloadBtn').onclick = function() {
      const a = document.createElement('a');
      a.href = att.dataUrl; a.download = att.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    document.getElementById('filePreviewOverlay').classList.add('open');
  }

  // 1순위: 서버 캐시에 dataUrl이 있으면 바로 사용
  const allCaches = [_pendingOrdersCache, typeof _deliveryOrdersCache !== 'undefined' ? _deliveryOrdersCache : []];
  var serverAtt = null;
  for (var c = 0; c < allCaches.length; c++) {
    var order = allCaches[c].find(function(o){ return String(o.id) === String(orderId); });
    if (order) {
      var sa = (order.attachments || [])[attIdx];
      if (sa && sa.dataUrl) { serverAtt = sa; break; }
    }
  }
  if (serverAtt) { _showPreview(serverAtt); return; }

  // 2순위: 메모리 캐시
  var memAtt = ((_orderExtrasMap[String(orderId)] || {}).attachments || [])[attIdx];
  if (memAtt && memAtt.dataUrl) { _showPreview(memAtt); return; }

  // 3순위: IndexedDB (비동기)
  idbLoadAttachments(orderId).then(function(idbAtts) {
    var idbAtt = (idbAtts || [])[attIdx];
    if (idbAtt && idbAtt.dataUrl) {
      // 메모리 캐시에도 올려두기 (다음 접근 시 빠르게)
      if (!_orderExtrasMap[String(orderId)]) _orderExtrasMap[String(orderId)] = {};
      _orderExtrasMap[String(orderId)].attachments = idbAtts;
    }
    _showPreview(idbAtt || { name: '(파일 없음)', dataUrl: null });
  });
}

var _submitLock = {};
async function completeOrder(id) {
  if (_submitLock[id]) return;
  if (!confirm(t('approve_confirm'))) return;
  _submitLock[id] = true;
  const user = getCurrentUser();
  const completedBy = user ? user.name + ' (' + user.dept + ')' : '미로그인';
  try {
    const res = await apiPost({ action: 'complete', id: id, completedBy: completedBy,
                    completedDate: new Date().toLocaleString('ko-KR') });
    if (!res.ok) { neoAlert(t('process_failed') + ' ' + (res.msg || '')); _submitLock[id] = false; return; }
    idbDeleteAttachments(id);
  } catch(e) {
    neoAlert(t('network_error')); _submitLock[id] = false; return;
  }
  _submitLock[id] = false;
  renderPendingOrders();
  updateDeliveryBadge();
}
async function cancelOrder(id) {
  if (_submitLock['c_'+id]) return;
  if (!confirm(t('cancel_order_confirm'))) return;
  _submitLock['c_'+id] = true;
  try { await apiPost({ action: 'cancel', id: id }); } catch(e) { _submitLock['c_'+id] = false; neoAlert(t('network_error')); return; }
  _submitLock['c_'+id] = false;
  idbDeleteAttachments(id);
  renderPendingOrders();
}

// ── 배송 대기 ─────────────────────────────────────────────────────
function openDeliveryOrders() {
  applyLang();
  renderDeliveryOrders();
  var _dOv = document.getElementById('deliveryOverlay');
  _dOv.classList.add('open');
  _mobFullScreen(_dOv, _dOv.querySelector('.delivery-modal'));
  _bringToFront(_dOv);
}
function closeDeliveryOrders() {
  _closeBounce(document.getElementById('deliveryOverlay'), 'open', function() {
    _resetModalPos(document.querySelector('.delivery-modal'));
  });
}
function deliveryOverlayClick(e) { /* X 버튼으로만 닫힘 */ }

async function renderDeliveryOrders() {
  const body = document.getElementById('deliveryBody');
  body.innerHTML = '<div class="load-progress-wrap"><div class="load-icon-ring"></div><div class="load-progress-label">' + t('pending_loading') + '</div><div class="load-progress-track"><div class="load-progress-bar"></div></div><div class="load-progress-pct"></div></div>';
  const _deliveryDone = startLoadProgress(body);
  try {
    const data    = await apiGet();
    await _deliveryDone();
    const me      = getCurrentUser();
    const myStr   = me ? me.name + ' (' + me.dept + ')' : null;
    const isOffice = me && me.dept === 'Office';
    const canApprove = me && (HARDCODED_ADMINS.includes(me.empid) || me.role === 'admin' || me.role === 'approver' || (me.role !== 'viewer' && isOffice));
    const all     = (data.orders || []).filter(o => o.status === 'shipping' && o.status !== 'cancelled' && o.status !== 'cancel_requested');
    // Sales: 본인 주문만, Office: 전체
    const orders  = isOffice ? all : all.filter(o => myStr && o.user === myStr);
    updateDeliveryBadgeCount(orders.length);
    var _orderNoMap = generateOrderNumbers(data.orders || []);
    // 전체 선택 행 표시
    const selAllRow = document.getElementById('deliverySelectAllRow');
    if (selAllRow) selAllRow.classList.add('show');
    if (!orders.length) {
      body.innerHTML = '<div class="pending-empty">&#x1F4ED; ' + t('delivery_empty') + '</div>';
      if (selAllRow) selAllRow.classList.remove('show');
      return;
    }
    // 주문 데이터 저장 (상세 패널용)
    window._deliveryOrdersCache = orders;
    window._deliveryOrderNoMap = _orderNoMap;
    window._deliveryIsOffice = isOffice;
    window._deliveryCanApprove = canApprove;
    window._deliveryMyStr = myStr;

    body.innerHTML = orders.map((o, idx) => {
      const items    = o.items || [];
      const custErp  = o.customer_erp  || '';
      const custName = o.customer_name || '';
      const addr     = o.address || '';
      const shipType = (o.ship_type && o.ship_type.trim()) ? o.ship_type.trim() : '';
      const isMine   = myStr && o.user === myStr;
      const canCancel = (isOffice && canApprove) || isMine;
      var totalQty = items.reduce(function(s, it) { return s + (parseInt(it.qty) || 1); }, 0);
      var totalPrice = items.reduce(function(s, it) { return s + ((parseFloat(it.price) || 0) * (parseInt(it.qty) || 1)); }, 0);
      var firstItem = items[0] || {};
      var itemSummary = firstItem.model
        ? `${firstItem.model}${items.length > 1 ? ' 외 ' + (items.length - 1) + '종' : ''} · 총 ${items.length}종/${totalQty}개 · ฿${totalPrice.toLocaleString()}`
        : `총 ${items.length}종/${totalQty}개`;
      return `<div class="pending-card" id="dpc_${o.id}" onclick="selectDeliveryCard('${o.id}')">
        <div class="pending-card-hdr" style="flex-wrap:wrap;gap:4px 8px;">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
            ${canCancel ? `<input type="checkbox" class="pc-checkbox dc-checkbox" data-id="${o.id}" onchange="event.stopPropagation();onDeliveryCardCheck()">` : ''}
            <span class="pc-title" style="white-space:nowrap;">&#x1F69A; #${_orderNoMap[String(o.id)] || (orders.length - idx)}</span>
            <span style="font-size:13px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${custErp ? custErp + ' ' : ''}${custName}</span>
            ${shipType ? `<span style="font-size:11px;background:#ede9fe;color:#7c3aed;border-radius:4px;padding:1px 6px;white-space:nowrap;">${tShipType(shipType)}</span>` : ''}
            ${o.tracking_number ? `<span class="shipped-track-btn" onclick="event.stopPropagation();openTrackingWithBarcode('${o.tracking_number}')" title="${o.tracking_number}"><img src="icon-tracking.svg" style="width:16px;height:16px;vertical-align:middle;"></span>` : ''}
          </div>
          <span class="pc-meta" style="white-space:nowrap;">${formatOrderDate(o.date)} &nbsp;|&nbsp; ${o.user}</span>
        </div>
        ${o.completed_by ? `<div style="padding:4px 14px;font-size:12px;border-bottom:1px solid #f3f4f6;">${t('processed_by_label')} <span class="pc-completed-by">${o.completed_by}</span> &nbsp;${o.completed_date ? formatOrderDate(o.completed_date) : ''}</div>` : ''}
        ${(!isOffice && o.completed_by) ? `<div style="padding:4px 14px;font-size:12px;font-weight:700;color:#1d4ed8;background:#eff6ff;border-bottom:1px solid #bfdbfe;">📋 승인 완료 — 발송 준비 중</div>` : ''}
        <div style="padding:6px 14px;font-size:12px;color:#475569;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:6px;">
          <span style="color:#6366f1;font-weight:600;">📦</span> ${itemSummary}
        </div>
        <div class="pending-card-footer">
          ${(isOffice && canApprove) ? `<button class="btn-deliver-done" onclick="event.stopPropagation();deliverOrder('${o.id}')">&#x1F4E6; ${t('btn_deliver')}</button>` : ''}
          ${((isOffice && canApprove) || isMine) ? `<button class="btn-order-cancel" onclick="event.stopPropagation();cancelDelivery('${o.id}')">&#x1F5D1; ${t('btn_cancel')}</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // 상세 패널 초기화
    _resetDeliveryDetail();

    // 알림에서 이동한 경우 해당 주문 자동 선택
    if (_notifNavigateOrderId) {
      var _navId = _notifNavigateOrderId;
      _notifNavigateOrderId = null;
      _notifNavigateType = null;
      var _found = orders.find(function(x) { return String(x.id) === _navId; });
      if (_found) {
        setTimeout(function() { selectDeliveryCard(_navId); }, 300);
        var _targetCard = document.getElementById('dpc_' + _navId);
        if (_targetCard) _targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  } catch(e) {
    await _deliveryDone();
    body.innerHTML = '<div class="pending-empty">&#x26A0;&#xFE0F; ' + t('load_failed') + '</div>';
  }
}

function getDeliveryCheckedIds() {
  return [...document.querySelectorAll('.dc-checkbox[data-id]:checked')].map(c => c.dataset.id);
}

function onDeliveryCardCheck() {
  const checked = getDeliveryCheckedIds();
  document.querySelectorAll('#deliveryBody .pending-card').forEach(card => {
    const chk = card.querySelector('.dc-checkbox');
    if (chk) card.classList.toggle('checked', chk.checked);
  });
  const bar = document.getElementById('deliveryBatchBar');
  if (checked.length > 0) {
    bar.classList.add('show');
    document.getElementById('deliveryBatchInfo').textContent = checked.length + t('n_selected');
  } else {
    bar.classList.remove('show');
  }
  const allChks = document.querySelectorAll('.dc-checkbox[data-id]');
  const chkAll = document.getElementById('deliveryCheckAll');
  if (chkAll) chkAll.checked = allChks.length > 0 && checked.length === allChks.length;
}

function toggleDeliveryCheckAll(chk) {
  document.querySelectorAll('.dc-checkbox[data-id]').forEach(c => { c.checked = chk.checked; });
  onDeliveryCardCheck();
}

async function batchCancelDelivery() {
  const ids = getDeliveryCheckedIds();
  if (!ids.length) return;
  if (!confirm(ids.length + t('batch_cancel_confirm'))) return;
  document.getElementById('deliveryBatchInfo').textContent = t('cancelling');
  let done = 0;
  for (const id of ids) {
    try { await apiPost({ action: 'cancel', id }); done++; } catch(e) {}
  }
  neoAlert(done + t('batch_cancel_done'));
  const bar = document.getElementById('deliveryBatchBar');
  if (bar) bar.classList.remove('show');
  renderDeliveryOrders();
  updateDeliveryBadge();
}

async function deliverOrder(id) {
  if (_submitLock['d_'+id]) return;
  if (!confirm(t('deliver_confirm'))) return;
  _submitLock['d_'+id] = true;
  try { await apiPost({ action: 'deliver', id: id }); } catch(e) { _submitLock['d_'+id] = false; neoAlert(t('network_error')); return; }
  _submitLock['d_'+id] = false;
  idbDeleteAttachments(id);
  renderDeliveryOrders();
}
async function cancelDelivery(id) {
  if (_submitLock['cd_'+id]) return;
  if (!confirm(t('cancel_order_confirm'))) return;
  _submitLock['cd_'+id] = true;
  try { await apiPost({ action: 'cancel', id: id }); } catch(e) { _submitLock['cd_'+id] = false; neoAlert(t('network_error')); return; }
  _submitLock['cd_'+id] = false;
  idbDeleteAttachments(id);
  renderDeliveryOrders();
  updateDeliveryBadge();
}

// ── 발송 대기 상세 패널 ──
var _selectedDeliveryId = null;
var _ddQrStream = null;

function _resetDeliveryDetail() {
  var detail = document.getElementById('deliveryDetail');
  if (!detail) return;
  detail.classList.add('empty');
  detail.innerHTML = '<div class="delivery-detail-placeholder"><div class="ddp-icon">&#x1F4E6;</div><div class="ddp-text">주문을 선택하면 상세 정보가 표시됩니다</div></div>';
  _selectedDeliveryId = null;
  _stopDdQrScan();
  document.querySelectorAll('#deliveryBody .pending-card').forEach(function(c) { c.classList.remove('dd-selected'); });
}

// ── 최소화: 우측 하단 아이콘으로 ──
var _ddMiniItems = []; // [{id, orderNo, custName}]

function _ensureMiniContainer() {
  var c = document.getElementById('ddMiniContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'ddMiniContainer';
    c.className = 'dd-mini-container';
    document.body.appendChild(c);
  }
  return c;
}

function minimizeDeliveryDetail(id) {
  var orders = window._deliveryOrdersCache || [];
  var o = orders.find(function(x) { return String(x.id) === String(id); });
  if (!o) return;
  var orderNo = (window._deliveryOrderNoMap || {})[String(id)] || id;
  // 이미 최소화된 건 중복 방지
  if (!_ddMiniItems.find(function(m) { return m.id === String(id); })) {
    _ddMiniItems.push({ id: String(id), orderNo: orderNo, custName: o.customer_name || o.customer_erp || '' });
  }
  _resetDeliveryDetail();
  _renderDdMiniIcons();
}

function _removeDdMiniIcon(id) {
  _ddMiniItems = _ddMiniItems.filter(function(m) { return m.id !== String(id); });
  _renderDdMiniIcons();
}

function _renderDdMiniIcons() {
  // 기존 pill 제거
  document.querySelectorAll('.dd-mini-pill').forEach(function(el) { el.remove(); });
  // pill을 body에 직접 추가 (가로 배치 시스템에서 위치 관리)
  _ddMiniItems.forEach(function(m) {
    var pill = document.createElement('div');
    pill.className = 'dd-mini-pill';
    pill.onclick = function() { restoreDeliveryDetail(m.id); };
    pill.innerHTML = '<span class="dd-mini-icon">📦</span>' +
      '<span class="dd-mini-label">#' + m.orderNo + ' ' + m.custName + '</span>';
    document.body.appendChild(pill);
  });
  _repositionMinis();
}

function restoreDeliveryDetail(id) {
  _removeDdMiniIcon(id);
  selectDeliveryCard(id);
}

// ── PDF 다운로드 ──
async function ddExportPDF(id) {
  var detail = document.getElementById('deliveryDetail');
  if (!detail) return;
  // 라이브러리 동적 로드
  try { await loadHtml2Canvas(); await loadJsPDF(); } catch(e) { neoAlert('PDF 라이브러리 로딩 실패. 네트워크를 확인해 주세요.'); return; }
  try {
    var savedO = detail.style.overflow;
    detail.style.overflow = 'visible';
    // 헤더/버튼 임시 숨김
    var hdr = detail.querySelector('.dd-detail-hdr');
    var saveRow = detail.querySelector('.dd-save-row');
    if (hdr) hdr.style.display = 'none';
    if (saveRow) saveRow.style.display = 'none';

    var canvas = await html2canvas(detail, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      width: detail.offsetWidth, height: detail.scrollHeight,
      scrollX: 0, scrollY: 0
    });

    if (hdr) hdr.style.display = '';
    if (saveRow) saveRow.style.display = '';
    detail.style.overflow = savedO;

    var { jsPDF } = window.jspdf;
    var margin = 10, imgW = 190, pageH = 277;
    var imgH = canvas.height * imgW / canvas.width;
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.setFontSize(13); pdf.setTextColor(30, 64, 175);
    pdf.text('발송 상세', margin, margin);
    var yPos = margin + 7, remaining = imgH, srcY = 0;
    while (remaining > 0) {
      var sliceH = Math.min(remaining, pageH - yPos);
      var slicePx = Math.round(sliceH * canvas.width / imgW);
      var sc = document.createElement('canvas');
      sc.width = canvas.width; sc.height = slicePx;
      sc.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
      pdf.addImage(sc.toDataURL('image/png'), 'PNG', margin, yPos, imgW, sliceH);
      srcY += slicePx; remaining -= sliceH; yPos = margin;
      if (remaining > 0) pdf.addPage();
    }
    var now = new Date();
    pdf.save('ShipDetail_' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '.pdf');
  } catch(e) {
    console.error('PDF error:', e);
    neoAlert('PDF 생성 실패: ' + e.message);
  }
}

// ── 출력 (인쇄) ──
function ddPrintDetail(id) {
  var detail = document.getElementById('deliveryDetail');
  if (!detail) return;
  var win = window.open('', '_blank', 'width=800,height=900');
  var content = detail.cloneNode(true);
  var hdr = content.querySelector('.dd-detail-hdr');
  if (hdr) hdr.remove();
  win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>발송 상세</title>' +
    '<style>body{font-family:"Segoe UI",sans-serif;padding:30px;color:#111;} ' +
    '.dd-section{padding:16px 0;border-bottom:1px solid #e5e7eb;} .dd-section:last-child{border-bottom:none;} ' +
    '.dd-section-title{font-size:13px;font-weight:700;color:#2563eb;margin-bottom:10px;} ' +
    '.dd-info-row{display:flex;gap:8px;margin-bottom:5px;font-size:13px;} ' +
    '.dd-info-label{font-weight:600;min-width:80px;color:#374151;} .dd-info-value{color:#111;} ' +
    '.dd-item-list{display:flex;flex-direction:column;gap:3px;} ' +
    '.dd-item-row{display:flex;gap:8px;font-size:12px;padding:3px 0;} ' +
    '.dd-item-model{font-weight:600;color:#2563eb;} .dd-item-spec{color:#6b7280;flex:1;} .dd-item-qty{font-weight:700;} ' +
    '.dd-ship-row,.dd-save-row,.dd-attach-btn,.dd-photo-preview-area{display:none;} ' +
    '</style></head><body>' + content.innerHTML + '</body></html>');
  win.document.close();
  setTimeout(function() { win.print(); }, 400);
}

function selectDeliveryCard(id) {
  var orders = window._deliveryOrdersCache || [];
  var o = orders.find(function(x) { return String(x.id) === String(id); });
  if (!o) return;

  // ── 토글: 같은 카드를 다시 클릭하면 상세 접기 ──
  if (_selectedDeliveryId === String(id)) {
    _resetDeliveryDetail();
    return;
  }

  _selectedDeliveryId = String(id);
  _ddPhotos = [];
  // 최소화 아이콘 제거 (같은 주문)
  _removeDdMiniIcon(id);
  // 카드 선택 표시
  document.querySelectorAll('#deliveryBody .pending-card').forEach(function(c) { c.classList.remove('dd-selected'); });
  var card = document.getElementById('dpc_' + id);
  if (card) card.classList.add('dd-selected');

  var detail = document.getElementById('deliveryDetail');
  detail.classList.remove('empty');

  var orderNo = (window._deliveryOrderNoMap || {})[String(id)] || '';
  var items = o.items || [];
  var totalQty = items.reduce(function(s, it) { return s + (parseInt(it.qty) || 1); }, 0);
  var isOffice = window._deliveryIsOffice;
  var canApprove = window._deliveryCanApprove;
  var myStr = window._deliveryMyStr;
  var isMine = myStr && o.user === myStr;
  var canCancel = (isOffice && canApprove) || isMine;
  var shipMethod = o.shipping_method || '';
  var trackNo = o.tracking_number || '';

  var html = '';

  // 상세 헤더 (최소화/PDF/출력/닫기)
  html += '<div class="dd-detail-hdr">';
  html += '<span class="dd-hdr-title">&#x1F4CB; 주문 상세 #' + orderNo + '</span>';
  html += '<button title="PDF" onclick="event.stopPropagation();ddExportPDF(\'' + id + '\')">&#x1F4C4;</button>';
  html += '<button title="출력" onclick="event.stopPropagation();ddPrintDetail(\'' + id + '\')">&#x1F5A8;</button>';
  html += '<button title="최소화" onclick="event.stopPropagation();minimizeDeliveryDetail(\'' + id + '\')">&#x2015;</button>';
  html += '<button title="닫기" onclick="event.stopPropagation();_resetDeliveryDetail()">&#x2715;</button>';
  html += '</div>';

  // 주문 정보 섹션
  html += '<div class="dd-section">';
  html += '<div class="dd-section-title">&#x1F4CB; 주문 정보</div>';
  html += '<div class="dd-info-row"><span class="dd-info-label">주문번호</span><span class="dd-info-value">#' + orderNo + '</span></div>';
  html += '<div class="dd-info-row"><span class="dd-info-label">고객</span><span class="dd-info-value">' + (o.customer_erp || '') + ' ' + (o.customer_name || '') + '</span></div>';
  html += '<div class="dd-info-row"><span class="dd-info-label">주문일</span><span class="dd-info-value">' + formatOrderDate(o.date) + '</span></div>';
  html += '<div class="dd-info-row"><span class="dd-info-label">주문자</span><span class="dd-info-value">' + (o.user || '') + '</span></div>';
  if (o.ship_type) html += '<div class="dd-info-row"><span class="dd-info-label">출고유형</span><span class="dd-info-value">' + tShipType(o.ship_type) + '</span></div>';
  if (o.address) html += '<div class="dd-info-row"><span class="dd-info-label">주소</span><span class="dd-info-value">' + o.address + '</span></div>';
  if (o.delivery_method) html += '<div class="dd-info-row"><span class="dd-info-label">배송방법</span><span class="dd-info-value">' + o.delivery_method + '</span></div>';
  if (o.delivery_date) html += '<div class="dd-info-row"><span class="dd-info-label">배송요청일</span><span class="dd-info-value">' + formatOrderDate(o.delivery_date) + '</span></div>';
  if (o.memo) html += '<div class="dd-info-row"><span class="dd-info-label">메모</span><span class="dd-info-value">' + o.memo + '</span></div>';
  if (o.completed_by) html += '<div class="dd-info-row"><span class="dd-info-label">처리자</span><span class="dd-info-value"><span class="pc-completed-by">' + o.completed_by + '</span></span></div>';
  html += '</div>';

  // 아이템 섹션
  html += '<div class="dd-section">';
  html += '<div class="dd-section-title">&#x1F4E6; 아이템 (' + items.length + '종 / ' + totalQty + '개)</div>';
  html += '<div class="dd-item-list">';
  var _ddGrandTotal = 0;
  items.forEach(function(it) {
    var _up = parseFloat(it.price) || 0;
    var _qt = parseFloat(it.qty) || 1;
    var _tt = _up * _qt;
    _ddGrandTotal += _tt;
    html += '<div class="dd-item-row"><span class="dd-item-model">' + (it.model || '') + '</span><span class="dd-item-spec">' + (it.no || it.spec || it.name || '') + '</span><span class="dd-item-qty">&times;' + _qt + '</span></div>';
    if (_up) html += '<div style="display:flex;justify-content:space-between;padding:0 12px 6px;font-size:11px;color:#6b7280;"><span>฿' + _up.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) + ' &times; ' + _qt + '</span><span style="font-weight:600;color:#7c3aed;">฿' + _tt.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>';
  });
  html += '</div>';
  if (_ddGrandTotal) html += '<div style="text-align:right;font-weight:700;font-size:13px;padding:6px 12px;color:#7c3aed;border-top:1px solid #e5e7eb;">합계: ฿' + _ddGrandTotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) + '</div>';
  html += '</div>';

  // 배송 방법 & 운송장 섹션 (Office만)
  if (isOffice && canApprove) {
    html += '<div class="dd-section">';
    html += '<div class="dd-section-title">&#x1F69A; 배송 정보</div>';
    html += '<div class="dd-ship-row">';
    html += '<div class="dd-ship-field dd-method"><label>배송 방법</label><select id="ddShipMethod" onchange="onDdShipMethodChange()">';
    html += '<option value="">선택</option>';
    html += '<option value="NCS"' + (shipMethod === 'NCS' ? ' selected' : '') + '>NCS</option>';
    html += '<option value="Skootar"' + (shipMethod === 'Skootar' ? ' selected' : '') + '>Skootar</option>';
    html += '<option value="EMS"' + (shipMethod === 'EMS' ? ' selected' : '') + '>EMS</option>';
    html += '<option value="기타"' + (shipMethod === '기타' ? ' selected' : '') + '>기타</option>';
    html += '</select></div>';
    html += '<div class="dd-ship-field dd-tracking"><label>운송장 번호</label>';
    html += '<div class="dd-track-input-wrap">';
    html += '<input type="text" id="ddTrackingNo" placeholder="운송장 번호 입력" value="' + (trackNo || '') + '" oninput="_autoDetectShipMethod(this.value)">';
    html += '</div>';
    html += '<div id="ddQrScanArea"></div>';
    html += '</div>';
    html += '</div>';

    // 사진 첨부
    html += '<div style="margin-top:8px;">';
    html += '<button type="button" class="dd-attach-btn" onclick="ddAttachPhoto()">&#x1F4CE; 사진 첨부</button>';
    html += '<input type="file" id="ddPhotoInput" accept="image/*" multiple style="display:none" onchange="onDdPhotoSelected(this,\'' + id + '\')">';
    html += '<div id="ddPhotoPreview" class="dd-photo-preview-area"></div>';
    html += '</div>';

    // 액션 버튼: 취소 → 저장 → 발송 완료
    html += '<div class="dd-save-row">';
    if (canCancel) html += '<button class="dd-cancel-btn" onclick="event.stopPropagation();cancelDelivery(\'' + id + '\')">&#x1F5D1; 취소</button>';
    html += '<button class="dd-save-btn" onclick="saveDdShipInfo(\'' + id + '\')">&#x1F4BE; 저장</button>';
    html += '<button class="dd-deliver-btn" onclick="event.stopPropagation();ddDeliverWithSave(\'' + id + '\')">&#x1F4E6; 발송 완료</button>';
    html += '</div>';
    html += '</div>';
  }

  detail.innerHTML = html;
}

function onDdShipMethodChange() {
  // 기타 선택 시 추가 로직 필요하면 여기에
}

// ── 운송장 번호 패턴 → 배송 방법 자동 감지 ──
function _autoDetectShipMethod(val) {
  val = (val || '').trim().toUpperCase();
  if (!val) return;
  var sel = document.getElementById('ddShipMethod');
  if (!sel) return;
  // 이미 사용자가 수동 선택한 경우 덮어쓰지 않음 (빈 값일 때만 자동)
  // → 항상 자동 감지 적용 (패턴이 명확하므로)
  var detected = _detectCarrierFromTracking(val);
  if (detected && sel.value !== detected) {
    sel.value = detected;
  }
}

function _detectCarrierFromTracking(trackNo) {
  if (!trackNo) return '';
  trackNo = trackNo.toUpperCase();
  // EMS: E로 시작 + 영문 1자 + 숫자 (EQ25..., ET7..., EX123... 등) 또는 국제우편 패턴 (AA123456789TH)
  if (/^E[A-Z]\d/.test(trackNo)) return 'EMS';
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(trackNo)) return 'EMS';
  // Skootar: J로 시작
  if (/^J\d/.test(trackNo)) return 'Skootar';
  return '';
}

async function saveDdShipInfo(id) {
  var method = document.getElementById('ddShipMethod');
  var trackInput = document.getElementById('ddTrackingNo');
  if (!method || !trackInput) return;
  var shipMethod = method.value;
  var trackNo = trackInput.value.trim();

  try {
    await _fbDb.collection('orders').doc(String(id)).update({
      shipping_method: shipMethod,
      tracking_number: trackNo
    });
    // 캐시 업데이트
    var orders = window._deliveryOrdersCache || [];
    var o = orders.find(function(x) { return String(x.id) === String(id); });
    if (o) { o.shipping_method = shipMethod; o.tracking_number = trackNo; }
    neoAlert('배송 정보가 저장되었습니다.');
  } catch(e) {
    neoAlert('저장 실패: ' + e.message);
  }
}

// ── 발송 완료 + 저장 ──
async function ddDeliverWithSave(id) {
  if (!confirm('저장하고 발송 완료 하겠습니까?')) return;
  var method = document.getElementById('ddShipMethod');
  var trackInput = document.getElementById('ddTrackingNo');
  var shipMethod = method ? method.value : '';
  var trackNo = trackInput ? trackInput.value.trim() : '';
  try {
    await _fbDb.collection('orders').doc(String(id)).update({
      shipping_method: shipMethod,
      tracking_number: trackNo
    });
  } catch(e) { /* 저장 실패해도 발송 완료 진행 */ }
  await apiPost({ action: 'deliver', id: id });
  idbDeleteAttachments(id);
  renderDeliveryOrders();
}

// ── 사진 첨부 ──
function ddAttachPhoto() {
  var input = document.getElementById('ddPhotoInput');
  if (input) input.click();
}

var _ddPhotos = [];

function onDdPhotoSelected(input, orderId) {
  var files = input.files;
  if (!files || !files.length) return;
  for (var i = 0; i < files.length; i++) {
    (function(file) {
      var reader = new FileReader();
      reader.onload = function(e) {
        _ddPhotos.push({ name: file.name, type: file.type, dataUrl: e.target.result });
        _renderDdPhotoPreview();
      };
      reader.readAsDataURL(file);
    })(files[i]);
  }
  input.value = '';
}

function _renderDdPhotoPreview() {
  var wrap = document.getElementById('ddPhotoPreview');
  if (!wrap) return;
  if (!_ddPhotos.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = _ddPhotos.map(function(p, i) {
    return '<div class="dd-photo-thumb" onclick="event.stopPropagation();_openDdPhotoLightbox(' + i + ')"><img src="' + p.dataUrl + '"><button class="dd-photo-rm" onclick="event.stopPropagation();_removeDdPhoto(' + i + ')">&#x2715;</button></div>';
  }).join('');
}

function _openDdPhotoLightbox(idx) {
  var p = _ddPhotos[idx];
  if (!p) return;
  var overlay = document.createElement('div');
  overlay.className = 'dd-photo-lightbox';
  overlay.onclick = function() { document.body.removeChild(overlay); };
  overlay.innerHTML = '<img src="' + p.dataUrl + '"><button class="dd-photo-lightbox-close" onclick="event.stopPropagation();this.parentElement.remove()">&#x2715;</button>';
  document.body.appendChild(overlay);
}

function _removeDdPhoto(idx) {
  _ddPhotos.splice(idx, 1);
  _renderDdPhotoPreview();
}

// ── QR 스캔 (카메라) ──
function startDdQrScan() {
  var area = document.getElementById('ddQrScanArea');
  if (!area) return;

  // 이미 스캔 중이면 종료
  if (_ddQrStream) { _stopDdQrScan(); return; }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    neoAlert('이 기기에서 카메라를 사용할 수 없습니다.');
    return;
  }

  area.innerHTML = '<div class="dd-qr-video-wrap"><video id="ddQrVideo" playsinline autoplay></video><button class="dd-qr-close-btn" onclick="_stopDdQrScan()">&#x2715;</button></div>';
  var video = document.getElementById('ddQrVideo');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(function(stream) {
      _ddQrStream = stream;
      video.srcObject = stream;
      video.play();
      _scanDdQrFrame(video);
    })
    .catch(function(err) {
      area.innerHTML = '<div style="padding:8px;color:#dc2626;font-size:12px;">카메라 접근 실패: ' + err.message + '</div>';
    });
}

function _stopDdQrScan() {
  if (_ddQrStream) {
    _ddQrStream.getTracks().forEach(function(t) { t.stop(); });
    _ddQrStream = null;
  }
  var area = document.getElementById('ddQrScanArea');
  if (area) area.innerHTML = '';
}

function _scanDdQrFrame(video) {
  if (!_ddQrStream) return;

  // BarcodeDetector API 사용 (Chrome, Edge 등 지원)
  if ('BarcodeDetector' in window) {
    var detector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'] });
    function detectFrame() {
      if (!_ddQrStream) return;
      detector.detect(video).then(function(barcodes) {
        if (barcodes.length > 0) {
          var val = barcodes[0].rawValue;
          var input = document.getElementById('ddTrackingNo');
          if (input) { input.value = val; _autoDetectShipMethod(val); }
          _stopDdQrScan();
          return;
        }
        requestAnimationFrame(detectFrame);
      }).catch(function() {
        requestAnimationFrame(detectFrame);
      });
    }
    detectFrame();
  } else {
    // BarcodeDetector 미지원 브라우저: Canvas로 수동 스캔 (기본 안내)
    var area = document.getElementById('ddQrScanArea');
    if (area) {
      var wrap = area.querySelector('.dd-qr-video-wrap');
      if (wrap) {
        var hint = document.createElement('div');
        hint.style.cssText = 'position:absolute;bottom:6px;left:6px;right:6px;text-align:center;font-size:11px;color:#fff;background:rgba(0,0,0,.5);padding:4px;border-radius:4px;';
        hint.textContent = '바코드를 화면에 맞추고 직접 번호를 입력해주세요';
        wrap.appendChild(hint);
      }
    }
  }
}

function updateDeliveryBadgeCount(count) {
  var badge = document.getElementById('deliveryBadge');
  if (badge) {
    if (count > 0) { badge.textContent = count; badge.style.display = 'inline-block'; }
    else { badge.style.display = 'none'; }
  }
  // 배송 상단 뱃지 동기화
  var shipBadge = document.getElementById('shipBadge');
  if (shipBadge) {
    if (count > 0) { shipBadge.textContent = count; shipBadge.style.display = 'flex'; }
    else { shipBadge.style.display = 'none'; }
  }
  // 모바일 카드 배지 동기화
  var mobBadge = document.getElementById('mobDeliveryBadge');
  var mobDot   = document.getElementById('mobNavDeliveryDot');
  if (mobBadge) { if (count > 0) { mobBadge.textContent = count; mobBadge.style.display = 'inline-block'; } else { mobBadge.style.display = 'none'; } }
  if (mobDot)   { mobDot.style.display = count > 0 ? 'block' : 'none'; }
  var catShipBadge = document.getElementById('mobCatShipBadge');
  if (catShipBadge) { if (count > 0) { catShipBadge.textContent = count; catShipBadge.classList.add('show'); } else { catShipBadge.classList.remove('show'); } }

  // 새 발송대기 감지 → 알림
  if (_prevDeliveryCount >= 0 && count > _prevDeliveryCount) {
    const newCount = count - _prevDeliveryCount;
    const pendingCount = Math.max(0, _prevPendingCount);
    sendNotification(
      '🚚 Ready to Ship +' + newCount,
      'Pending: ' + pendingCount + ' order(s)  |  Ready to Ship: ' + count + ' order(s)'
    );
  }
  _prevDeliveryCount = count;
  updateAppBadge(Math.max(0, _prevPendingCount) + count);
}
async function updateDeliveryBadge() {
  try {
    const data     = await apiGet();
    const me       = getCurrentUser();
    const myStr    = me ? me.name + ' (' + me.dept + ')' : null;
    const isOffice = me && me.dept === 'Office';
    const shipping = (data.orders || []).filter(o => o.status === 'shipping');
    const count    = isOffice ? shipping.length : shipping.filter(o => myStr && o.user === myStr).length;
    updateDeliveryBadgeCount(count);
  } catch(e) {}
}

// ── 배송완료 ─────────────────────────────────────────────────────
function openShippedOrders() {
  applyLang();
  renderShippedOrders();
  var _sOv = document.getElementById('shippedOverlay');
  _sOv.classList.add('open');
  _mobFullScreen(_sOv, _sOv.querySelector('.shipped-modal'));
  _bringToFront(_sOv);
}
function closeShippedOrders() {
  _closeBounce(document.getElementById('shippedOverlay'), 'open', function() {
    _resetModalPos(document.querySelector('.shipped-modal'));
  });
}
function shippedOverlayClick(e) { /* X 버튼으로만 닫힘 */ }

// ── 배송 추적 ─────────────────────────────────────────────────────
var TRACKING_URLS = {
  ems: 'https://track.thailandpost.co.th/?trackNumber=',
  nca: 'https://www.nca-tracking.com/th/tracking?awb_no=',
  dhl: 'https://www.dhl.com/th-en/home/tracking.html?tracking-id=',
  skootar: 'https://www.skootar.com/tracking?ref='
};
function _detectTrackingCarrier(num) {
  if (!num) return 'ems';
  num = num.toUpperCase();
  if (/^E[A-Z]\d/.test(num)) return 'ems';
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(num)) return 'ems';
  if (/^J\d/.test(num)) return 'skootar';
  // 기본: EMS
  return 'ems';
}
function openTracking() {
  applyLang();
  document.getElementById('trackingNumberInput').value = '';
  document.getElementById('trackingResult').innerHTML = '';
  var _tcb = document.getElementById('trackingCarrierBadge');
  if (_tcb) { _tcb.textContent = '-'; _tcb.classList.remove('detected'); }
  // 라벨 & 조회 버튼 복원
  var label = document.querySelector('.tracking-input-wrap label');
  var btn = document.getElementById('trackingBtn');
  if (label) label.style.display = '';
  if (btn) btn.style.display = '';
  var _tOv = document.getElementById('trackingOverlay');
  _tOv.classList.add('open');
  _mobFullScreen(_tOv, _tOv.querySelector('.tracking-modal'));
  _bringToFront(_tOv);
  setTimeout(function(){ document.getElementById('trackingNumberInput').focus(); }, 200);
}
function openTrackingWithBarcode(barcode) {
  openTracking();
  setTimeout(function(){
    var input = document.getElementById('trackingNumberInput');
    if (input) input.value = barcode;
    _updateTrackingBadge(barcode);
    // 입력 안내 라벨 & 조회 버튼 숨김 (바코드로 직접 열었으므로)
    var label = document.querySelector('.tracking-input-wrap label');
    var btn = document.getElementById('trackingBtn');
    if (label) label.style.display = 'none';
    if (btn) btn.style.display = 'none';
    var carrier = _detectTrackingCarrier(barcode);
    if (carrier === 'ems') {
      _trackEMS(barcode);
    } else {
      var url = TRACKING_URLS[carrier] + encodeURIComponent(barcode);
      window.open(url, '_blank');
    }
  }, 300);
}
function closeTracking() {
  _closeTrackingMap();
  _closeBounce(document.getElementById('trackingOverlay'), 'open', function() {
    _resetModalPos(document.querySelector('.tracking-modal'));
  });
}
function trackingOverlayClick(e) { /* X 버튼으로만 닫힘 */ }
function _updateTrackingBadge(val) {
  var badge = document.getElementById('trackingCarrierBadge');
  if (!badge) return;
  var num = (val || '').trim().toUpperCase();
  if (!num) { badge.textContent = '-'; badge.classList.remove('detected'); return; }
  var carrier = _detectTrackingCarrier(num);
  var labels = { ems: 'EMS', nca: 'NCA', dhl: 'DHL', skootar: 'Skootar' };
  badge.textContent = labels[carrier] || '-';
  badge.classList.toggle('detected', !!carrier && num.length >= 2);
}
function trackShipment() {
  var num = document.getElementById('trackingNumberInput').value.trim().toUpperCase();
  if (!num) { document.getElementById('trackingNumberInput').focus(); return; }

  var carrier = _detectTrackingCarrier(num);
  // EMS: 앱 내 API 조회
  if (carrier === 'ems') {
    _trackEMS(num);
    return;
  }
  // 기타: 외부 링크
  var url = TRACKING_URLS[carrier] + encodeURIComponent(num);
  window.open(url, '_blank');
}

async function _trackEMS(barcode) {
  var resultDiv = document.getElementById('trackingResult');
  var btn = document.getElementById('trackingBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ 조회 중...'; }
  resultDiv.innerHTML = '<div class="tracking-loading">🔄 Thailand Post API 조회 중...</div>';

  try {
    // Service Worker가 준비될 때까지 대기 (최대 3초)
    if ('serviceWorker' in navigator) {
      try { await Promise.race([navigator.serviceWorker.ready, new Promise(function(r){ setTimeout(r, 3000); })]); } catch(e){}
    }
    var trackParcel = firebase.app().functions('asia-southeast1').httpsCallable('trackParcel');
    var res = await trackParcel({ barcodes: [barcode], language: 'TH' });
    var data = res.data;
    _renderTrackingResult(barcode, data, resultDiv);
  } catch(e) {
    var msg = e.message || '알 수 없는 오류';
    // PushManager/ServiceWorker 관련 에러는 재시도
    if (/PushManager|Service Worker|subscribe/i.test(msg)) {
      try {
        var trackParcel2 = firebase.app().functions('asia-southeast1').httpsCallable('trackParcel');
        var res2 = await trackParcel2({ barcodes: [barcode], language: 'TH' });
        _renderTrackingResult(barcode, res2.data, resultDiv);
      } catch(e2) {
        resultDiv.innerHTML = '<div class="tracking-empty">❌ 조회 실패: ' + (e2.message || '알 수 없는 오류') + '</div>';
      }
    } else {
      resultDiv.innerHTML = '<div class="tracking-empty">❌ 조회 실패: ' + msg + '</div>';
    }
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '🔍 <span data-i18n="tracking_search">조회</span>'; }
}

function _renderTrackingResult(barcode, data, container) {
  // Thailand Post API 응답 구조: response.items[barcode] = [ { status, status_description, ... } ]
  var items = null;
  try {
    var resp = data.response || data;
    var itemsObj = resp.items || {};
    items = itemsObj[barcode] || itemsObj[barcode.toUpperCase()] || itemsObj[barcode.toLowerCase()];
    // key가 정확히 안 맞을 수 있으므로 첫 번째 키 사용
    if (!items) {
      var keys = Object.keys(itemsObj);
      if (keys.length > 0) items = itemsObj[keys[0]];
    }
  } catch(e) {}

  if (!items || !items.length) {
    container.innerHTML = '<div class="tracking-empty">📭 운송장 <b>' + barcode + '</b>의 배송 정보가 없습니다.</div>';
    return;
  }

  // 최신 상태
  var latest = items[items.length - 1];
  var statusCode = latest.status || '';
  var statusDesc = latest.status_description || latest.delivery_status || '';
  var isDelivered = statusCode === '501' || /ส่งสำเร็จ|delivered|นำจ่ายสำเร็จ/i.test(statusDesc);
  var isInTransit = !isDelivered;
  var statusClass = isDelivered ? 'delivered' : 'in-transit';
  var statusIcon = isDelivered ? '✅' : '🚚';
  var statusMain = isDelivered ? '배송 완료 (Delivered)' : '배송 중 (In Transit)';

  var html = '<div class="tracking-status-box ' + statusClass + '">' +
    '<div class="tracking-status-icon">' + statusIcon + '</div>' +
    '<div class="tracking-status-text">' +
      '<div class="ts-main">' + statusMain + '</div>' +
      '<div class="ts-sub">' + barcode + ' · ' + (statusDesc || '') + '</div>' +
    '</div>' +
  '</div>';

  // 타임라인 (최신순) + 위치 수집
  var locations = [];
  var locDetails = [];
  html += '<div class="tracking-timeline">';
  for (var i = items.length - 1; i >= 0; i--) {
    var it = items[i];
    var dt = it.status_date || it.datetime || '';
    var desc = it.status_description || it.delivery_status || '';
    var loc = it.location || it.office_name || '';
    if (loc && locations.indexOf(loc) === -1) {
      locations.push(loc);
      locDetails.push({ name: loc, desc: desc, date: dt });
    }
    html += '<div class="tt-item">' +
      '<div class="tt-date">' + dt + '</div>' +
      '<div class="tt-desc">' + desc + '</div>' +
      (loc ? '<div class="tt-loc">&#x1F4CD; ' + loc + '</div>' : '') +
    '</div>';
  }
  html += '</div>';

  // 배송 경로 지도 버튼
  if (locations.length > 0) {
    window._trackingLocDetails = locDetails;
    html += '<button class="tt-map-all-btn" onclick="_openTrackingMap()">&#x1F5FA; 배송 경로 지도 보기 (' + locations.length + '곳)</button>';
  }

  container.innerHTML = html;
}

// ── 배송 경로 지도 (Leaflet + OpenStreetMap) ──
var _leafletLoaded = false;
function _loadLeaflet(cb) {
  if (_leafletLoaded) return cb();
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
  var script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.onload = function() { _leafletLoaded = true; cb(); };
  document.head.appendChild(script);
}

function _closeTrackingMap() {
  var modal = document.querySelector('.tracking-modal');
  if (modal) modal.classList.remove('map-open');
  var canvas = document.getElementById('trackingMapCanvas');
  if (canvas) canvas.innerHTML = '';
  var legend = document.getElementById('trackingMapLegend');
  if (legend) legend.innerHTML = '';
  window._trackingMapInstance = null;
}

async function _openTrackingMap() {
  var details = window._trackingLocDetails || [];
  if (!details.length) return;

  var modal = document.querySelector('.tracking-modal');
  if (!modal) return;

  // 이미 열려있으면 닫기 (토글)
  if (modal.classList.contains('map-open')) {
    _closeTrackingMap();
    return;
  }

  // 시간순(발송→도착)으로 뒤집어서 범례 표시
  var orderedDetails = details.slice().reverse();
  var legendHtml = orderedDetails.map(function(d, i) {
    var cleanDate = (d.date || '').replace(/\+\d{2}:\d{2}$/, '').trim();
    return '<div class="tm-legend-item"><span class="tm-legend-num">' + (i + 1) + '</span><span class="tm-legend-name">' + d.name + '</span><span class="tm-legend-desc">' + (d.desc || '') + '</span>' +
      (cleanDate ? '<span class="tm-legend-date" style="font-size:11px;color:#6b7280;margin-left:auto;white-space:nowrap;">' + cleanDate + '</span>' : '') + '</div>';
  }).join('');

  var legend = document.getElementById('trackingMapLegend');
  if (legend) legend.innerHTML = legendHtml;

  var canvas = document.getElementById('trackingMapCanvas');
  if (canvas) canvas.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;">지도 로딩 중...</div>';

  // 모달 확장 (슬라이드 애니메이션)
  modal.classList.add('map-open');

  // Leaflet 로드 후 지도 렌더 (transition 완료 대기)
  _loadLeaflet(function() {
    setTimeout(function() { _renderLeafletMap(details); }, 420);
  });
}

async function _renderLeafletMap(details) {
  var container = document.getElementById('trackingMapCanvas');
  if (!container) return;

  // 기존 지도 인스턴스 제거
  if (window._trackingMapInstance) {
    try { window._trackingMapInstance.remove(); } catch(e) {}
    window._trackingMapInstance = null;
  }
  container.innerHTML = '';

  // details는 최신순이므로 시간순(발송→도착)으로 뒤집기
  details = details.slice().reverse();

  var map = L.map(container, { attributionControl: false }).setView([13.75, 100.5], 10);
  window._trackingMapInstance = map;
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/">OSM</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // 알려진 Thailand Post 거점 좌표 (Nominatim에서 잘못 찍히는 곳)
  var KNOWN_LOCATIONS = {
    'ems':            [13.8838, 100.5730],  // ศูนย์ EMS หลักสี่ กรุงเทพ
    'ศูนย์ems':       [13.8838, 100.5730],
    'ems ศูนย์ไปรษณีย์': [13.8838, 100.5730],
    'ศูนย์ไปรษณีย์ ems': [13.8838, 100.5730],
    'สำนักงานไปรษณีย์นครหลวง': [13.8838, 100.5730],
    'ศูนย์รวมภาค กรุงเทพ': [13.8838, 100.5730],
    'คัดแยก กรุงเทพ': [13.8838, 100.5730],
  };

  function _knownCoord(name) {
    var key = (name || '').trim().toLowerCase();
    if (KNOWN_LOCATIONS[key]) return KNOWN_LOCATIONS[key];
    // "EMS"가 포함된 짧은 이름도 매칭
    if (/^ems$/i.test(key) || /^ems\s/i.test(key) || /\sems$/i.test(key)) return KNOWN_LOCATIONS['ems'];
    return null;
  }

  // Nominatim으로 지오코딩 (알려진 거점은 직접 좌표 사용)
  var markers = [];
  var latlngs = [];

  for (var i = 0; i < details.length; i++) {
    var d = details[i];
    try {
      var known = _knownCoord(d.name);
      var lat, lng;
      if (known) {
        lat = known[0];
        lng = known[1];
      } else {
        var res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(d.name + ', Thailand') + '&limit=1');
        var geo = await res.json();
        if (!geo.length) continue;
        lat = parseFloat(geo[0].lat);
        lng = parseFloat(geo[0].lon);
      }
      latlngs.push([lat, lng]);

        var numIcon = L.divIcon({
          className: '',
          html: '<div style="background:#2563eb;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);">' + (i + 1) + '</div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        var marker = L.marker([lat, lng], { icon: numIcon }).addTo(map);
        var popupDate = (d.date || '').replace(/\+\d{2}:\d{2}$/, '').trim();
        marker.bindPopup('<b>' + (i + 1) + '. ' + d.name + '</b><br>' + (d.desc || '') + '<br><span style="font-size:10px;color:#6b7280;">' + popupDate + '</span>');
        markers.push(marker);
    } catch(e) { /* 지오코딩 실패 시 스킵 */ }
  }

  // 경로선 그리기
  if (latlngs.length > 1) {
    L.polyline(latlngs, { color: '#2563eb', weight: 3, opacity: 0.7, dashArray: '8 6' }).addTo(map);
  }

  // 모든 마커가 보이도록 지도 범위 조정
  if (latlngs.length > 0) {
    map.fitBounds(latlngs, { padding: [40, 40] });
  }

  // 리사이즈 대응
  setTimeout(function() { map.invalidateSize(); }, 200);
}

async function renderShippedOrders() {
  var body = document.getElementById('shippedBody');
  body.innerHTML = '<div class="load-progress-wrap"><div class="load-icon-ring"></div><div class="load-progress-label">' + t('pending_loading') + '</div><div class="load-progress-track"><div class="load-progress-bar"></div></div><div class="load-progress-pct"></div></div>';
  const _shippedDone = startLoadProgress(body);
  try {
    var data = await apiGet();
    await _shippedDone();
    var me = getCurrentUser();
    var myStr = me ? me.name + ' (' + me.dept + ')' : null;
    var isOffice = me && me.dept === 'Office';
    var all = (data.orders || []).filter(function(o){ return o.status === 'done'; });
    var orders = isOffice ? all : all.filter(function(o){ return myStr && o.user === myStr; });
    var _orderNoMap = generateOrderNumbers(data.orders || []);
    if (!orders.length) {
      body.innerHTML = '<div class="pending-empty">&#x1F4ED; ' + t('shipped_empty') + '</div>';
      return;
    }
    body.innerHTML = orders.map(function(o, idx) {
      var items    = o.items || [];
      var custErp  = o.customer_erp  || '';
      var custName = o.customer_name || '';
      var addr     = o.address || '';
      var shipType = (o.ship_type && o.ship_type.trim()) ? o.ship_type.trim() : '';
      var delivDate   = o.delivery_date   || '';
      var delivMethod = o.delivery_method || '';
      var attachments = o.attachments || [];
      var _sTotalQty = items.reduce(function(s, it) { return s + (parseInt(it.qty) || 1); }, 0);
      var _sTotalPrice = items.reduce(function(s, it) { return s + ((parseFloat(it.price) || 0) * (parseInt(it.qty) || 1)); }, 0);
      var _sFirstItem = items[0] || {};
      var _sItemLine = _sFirstItem.model
        ? _sFirstItem.model + (items.length > 1 ? ' 외 ' + (items.length - 1) + '종' : '') + ' · 총 ' + items.length + '종/' + _sTotalQty + '개 · ฿' + _sTotalPrice.toLocaleString()
        : '총 ' + items.length + '종/' + _sTotalQty + '개';
      return '<div class="pending-card" id="spc_' + o.id + '" style="border-color:#86efac;">' +
        '<div class="pending-card-hdr" style="background:#f0fdf4;border-bottom-color:#bbf7d0;flex-wrap:wrap;gap:4px 8px;">' +
          '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">' +
            '<span class="pc-title" style="white-space:nowrap;">&#x2705; #' + (_orderNoMap[String(o.id)] || (orders.length - idx)) + '</span>' +
            '<span style="font-size:13px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (custErp ? custErp + ' ' : '') + custName + '</span>' +
            (shipType ? '<span style="font-size:11px;background:#dcfce7;color:#15803d;border-radius:4px;padding:1px 6px;white-space:nowrap;">' + tShipType(shipType) + '</span>' : '') +
            (o.tracking_number ? '<span class="shipped-track-btn" onclick="event.stopPropagation();openTrackingWithBarcode(\'' + o.tracking_number + '\')" title="' + o.tracking_number + '"><img src="icon-tracking.svg" style="width:16px;height:16px;vertical-align:middle;"></span>' : '') +
          '</div>' +
          '<span class="pc-meta" style="white-space:nowrap;">' + formatOrderDate(o.delivered_date || o.date) + ' &nbsp;|&nbsp; ' + o.user + '</span>' +
        '</div>' +
        (o.completed_by ? '<div style="padding:4px 14px;font-size:12px;border-bottom:1px solid #f3f4f6;">' + t('processed_by_label') + ' <span class="pc-completed-by">' + o.completed_by + '</span></div>' : '') +
        '<div style="padding:6px 14px;font-size:12px;color:#475569;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:6px;">' +
          '<span style="color:#16a34a;font-weight:600;">📦</span> ' + _sItemLine +
        '</div>' +
        (attachments.length ? '<div style="padding:8px 14px;border-top:1px solid #f3f4f6;display:flex;gap:6px;flex-wrap:wrap;">' +
          attachments.map(function(att, ai) {
            var icon = att.type === 'application/pdf' ? '&#x1F4C4;' : '&#x1F5BC;&#xFE0F;';
            return '<button onclick="previewShippedFile(\'' + o.id + '\',' + ai + ')" style="display:inline-flex;align-items:center;gap:4px;background:#f0f4ff;border:1px solid #bfdbfe;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;color:#1d4ed8;">' + icon + ' ' + att.name + '</button>';
          }).join('') +
        '</div>' : '') +
      '</div>';
    }).join('');
    // 파일 미리보기용 캐시
    window._shippedOrdersCache = orders;

    // 알림에서 이동한 경우 해당 주문 카드로 스크롤 + 하이라이트
    if (_notifNavigateOrderId) {
      var _navId = _notifNavigateOrderId;
      _notifNavigateOrderId = null;
      _notifNavigateType = null;
      var _targetCard = document.getElementById('spc_' + _navId);
      if (_targetCard) {
        setTimeout(function() {
          _targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          _targetCard.style.boxShadow = '0 0 0 3px #2563eb';
          setTimeout(function() { _targetCard.style.boxShadow = ''; }, 3000);
        }, 300);
      }
    }
  } catch(e) {
    await _shippedDone();
    body.innerHTML = '<div class="pending-empty">&#x26A0;&#xFE0F; ' + t('load_failed') + '</div>';
  }
}

function previewShippedFile(orderId, attIdx) {
  var orders = window._shippedOrdersCache || [];
  var order = orders.find(function(o){ return String(o.id) === String(orderId); });
  if (!order) return;
  var att = (order.attachments || [])[attIdx];
  if (!att) return;
  document.getElementById('fpFileName').textContent = att.name;
  var body = document.getElementById('fpBody');
  if (att.type === 'application/pdf') {
    body.innerHTML = '<iframe src="' + att.dataUrl + '"></iframe>';
  } else {
    body.innerHTML = '<img src="' + att.dataUrl + '" alt="' + att.name + '">';
  }
  document.getElementById('fpDownloadBtn').onclick = function() {
    var a = document.createElement('a'); a.href = att.dataUrl; a.download = att.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  document.getElementById('filePreviewOverlay').classList.add('open');
}

// ── 결과조회 ─────────────────────────────────────────────────────
function openResultsQuery(defaultStatus) {
  window._rqMode = 'default';
  window._rqDefaultStatus = defaultStatus || '';
  renderResultsQuery();
  var _rqOv = document.getElementById('resultsQryOverlay');
  _rqOv.classList.add('open');
  _mobFullScreen(_rqOv, _rqOv.querySelector('.results-qry-modal'));
  _bringToFront(_rqOv);
}
function openShipmentReport() {
  window._rqMode = 'shipment';
  window._rqDefaultStatus = '';
  renderResultsQuery();
  var _srOv = document.getElementById('resultsQryOverlay');
  _srOv.classList.add('open');
  _mobFullScreen(_srOv, _srOv.querySelector('.results-qry-modal'));
  _bringToFront(_srOv);
}
function closeResultsQuery() {
  _closeBounce(document.getElementById('resultsQryOverlay'), 'open', function() {
    _resetModalPos(document.querySelector('.results-qry-modal'));
  });
}
function resultsQryOverlayClick(e) { /* X 버튼으로만 닫힘 */ }

async function renderResultsQuery() {
  var _defStatus = window._rqDefaultStatus || '';
  // 제목 변경
  var titleEl = document.getElementById('resultsQryTitle');
  if (titleEl) {
    if (window._rqMode === 'shipment') {
      titleEl.innerHTML = '🚚 발송 완료 리포트';
    } else if (_defStatus === 'done') {
      titleEl.innerHTML = '📊 상품 주문 완료 조회';
    } else {
      titleEl.innerHTML = '📦 <span data-i18n="btn_report_order_ship">' + (t('btn_report_order_ship') || '발송 완료 리포트') + '</span>';
    }
  }
  var body = document.getElementById('resultsQryBody');
  body.innerHTML = '<div class="load-progress-wrap"><div class="load-icon-ring"></div><div class="load-progress-label">' + t('msg_loading') + '</div><div class="load-progress-track"><div class="load-progress-bar"></div></div><div class="load-progress-pct"></div></div>';
  const _resultsDone = startLoadProgress(body);
  try {
    var data = await apiGet();
    await _resultsDone();
    var me = getCurrentUser();
    var myStr = me ? me.name + ' (' + me.dept + ')' : null;
    var isOffice = me && me.dept === 'Office';
    var allOrders = data.orders || [];
    if (!isOffice && myStr) allOrders = allOrders.filter(function(o){ return o.user === myStr; });

    // 오늘 날짜 기본값 (로컬 시간)
    var _n2 = new Date();
    var today = _n2.getFullYear() + '-' + String(_n2.getMonth()+1).padStart(2,'0') + '-' + String(_n2.getDate()).padStart(2,'0');
    var _ma = new Date(_n2.getTime() - 7*24*60*60*1000);
    var monthAgo = _ma.getFullYear() + '-' + String(_ma.getMonth()+1).padStart(2,'0') + '-' + String(_ma.getDate()).padStart(2,'0');

    body.innerHTML =
      '<input type="text" id="rqSearchInput" placeholder="' + t('rq_search_ph') + '" oninput="filterResultsQuery()" style="width:100%;padding:11px 16px;font-size:15px;border-radius:10px;border:2px solid #d1d5db;margin-bottom:8px;box-sizing:border-box;outline:none;" onfocus="this.style.borderColor=\'#2563eb\'" onblur="this.style.borderColor=\'#d1d5db\'" />' +
      '<div class="results-filter-row" style="margin-bottom:10px;gap:6px;flex-wrap:wrap;">' +
        '<label style="font-size:12px;color:#6b7280;white-space:nowrap;">' + t('rq_date_from') + '</label>' +
        '<input type="date" id="rqDateFrom" value="' + monthAgo + '" />' +
        '<label style="font-size:12px;color:#6b7280;white-space:nowrap;">' + t('rq_date_to') + '</label>' +
        '<input type="date" id="rqDateTo" value="' + today + '" />' +
        '<select id="rqStatusFilter">' +
          '<option value=""' + (_defStatus===''?' selected':'') + '>'       + t('rq_all_status')         + '</option>' +
          '<option value="shipping"' + (_defStatus==='shipping'?' selected':'') + '>'          + t('rq_status_shipping')   + '</option>' +
          '<option value="done"' + (_defStatus==='done'?' selected':'') + '>'              + t('rq_status_done')       + '</option>' +
          '<option value="cancelled"' + (_defStatus==='cancelled'?' selected':'') + '>'         + t('rq_status_cancelled')  + '</option>' +
        '</select>' +
        '<select id="rqShipFilter">' +
          '<option value="">'           + t('filter_all')    + '</option>' +
          '<option value="일반출고">'   + t('ship_normal')   + '</option>' +
          '<option value="패키지출고">' + t('ship_package')  + '</option>' +
          '<option value="위탁출고">'   + t('ship_consign')  + '</option>' +
          '<option value="위탁정산">'   + t('ship_consign_settle') + '</option>' +
        '</select>' +
        '<button onclick="filterResultsQuery()" style="padding:6px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">' +
          '&#x1F50D; ' + t('rq_btn_search') +
        '</button>' +
        '<button onclick="' + (window._rqMode === 'shipment' ? 'downloadShipmentExcel()' : 'downloadResultsExcel()') + '" style="padding:6px 14px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;" title="엑셀 다운로드">&#x1F4E5; Excel</button>' +
      '</div>' +
      '<div class="results-table-wrap"><div id="rqTable"></div></div>';
    body._allOrders = allOrders;
    // 초기 로드 시 오늘 날짜 기준으로 자동 조회
    filterResultsQuery();
  } catch(e) {
    await _resultsDone();
    body.innerHTML = '<div class="pending-empty">&#x26A0;&#xFE0F; ' + t('msg_load_fail') + '</div>';
  }
}

function formatDateOnly(str) {
  if (!str) return '-';
  // "Sat Mar 28 2026 00:00:00 GMT+0700 ..." 또는 new Date().toString() 형식
  var d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  // "2026. 3. 28." 한국어 형식
  var m = str.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
  // "2026-03-28" 이미 날짜만 있는 경우
  var m2 = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m2) return m2[1] + '-' + m2[2].padStart(2,'0') + '-' + m2[3].padStart(2,'0');
  return str;
}

var _rqCurrentDetailId = null;
function showRqOrderDetail(id) {
  // 같은 행 다시 클릭 시 패널 닫기
  var panel = document.getElementById('rqDetailPanel');
  if (_rqCurrentDetailId === String(id) && panel && panel.classList.contains('open')) {
    closeRqOrderDetail();
    _rqCurrentDetailId = null;
    return;
  }
  _rqCurrentDetailId = String(id);

  var body = document.getElementById('resultsQryBody');
  var o = body && body._orderMap && body._orderMap[String(id)];
  if (!o) return;

  var statusLabel = { pending:'대기중', shipping:'발송대기', done:'완료', cancelled:'취소됨', cancel_requested:'취소요청' };
  var statusClass  = { pending:'rs-pending', shipping:'rs-shipping', done:'rs-done', cancelled:'rs-cancelled', cancel_requested:'rs-pending' };
  var st = o.status || 'pending';

  function row(label, value) {
    return '<div style="display:flex;gap:8px;font-size:13px;margin-bottom:2px;">' +
      '<span style="color:#6b7280;min-width:80px;max-width:80px;flex-shrink:0;white-space:nowrap;">' + label + '</span>' +
      '<span style="font-weight:600;color:#111827;word-break:break-all;flex:1;min-width:0;">' + (value || '-') + '</span></div>';
  }
  function section(title, html) {
    return '<div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:12px 14px;">' +
      '<div style="font-size:11px;font-weight:700;color:#2563eb;margin-bottom:8px;text-transform:uppercase;">' + title + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">' + html + '</div></div>';
  }

  var itemsHtml = (o.items || []).map(function(it, i) {
    return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f3f4f6;font-size:13px;">' +
      '<span style="font-weight:600;color:#2563eb;">' + (it.model || '') + '</span>' +
      '<span style="color:#6b7280;font-size:12px;">' + (it.spec || it.name || '') + '</span>' +
      '<span style="font-weight:700;">×' + (it.qty || 0) + '</span></div>';
  }).join('');

  // 로컬 extras 병합 (memo/attachments가 서버에 없을 경우 대비)
  var _rqExtras = _orderExtrasMap[String(o.id)] || {};
  var displayMemo = o.memo || _rqExtras.memo || '';
  var rqAttachments = (o.attachments && o.attachments.length) ? o.attachments : (_rqExtras.attachments || []);

  function buildAttHtml(atts) {
    if (!atts || !atts.length) return '';
    return section('📎 첨부파일 (' + atts.length + ')',
      '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
      atts.map(function(att, i) {
        return '<button class="od-att-btn" onclick="previewPendingFile(\'' + o.id + '\',' + i + ');">' +
          (att.type === 'application/pdf' ? '📄' : '🖼️') + ' ' + att.name + '</button>';
      }).join('') + '</div>'
    );
  }

  function rowPair(l1, v1, l2, v2) {
    return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
      '<div>' + row(l1, v1) + '</div>' +
      '<div>' + row(l2, v2) + '</div></div>';
  }

  var hdrTitle2 = document.querySelector('.rq-detail-hdr h2');
  if (hdrTitle2) hdrTitle2.innerHTML = '📦 주문 상세';

  var rqDetailEl = document.getElementById('rqDetailBody');
  rqDetailEl.innerHTML =
    section('📋 주문 정보',
      row('상태', '<span class="results-status-badge ' + (statusClass[st]||'') + '">' + (statusLabel[st]||st) + '</span>') +
      row('주문번호', String(o.id || '')) +
      rowPair('주문 요청일', formatDateOnly(o.date), '승인 일자', formatDateOnly(o.completed_date)) +
      rowPair('신청자', o.user || '-', '승인자', o.completed_by || '-')
    ) +
    section('🏥 고객 정보',
      rowPair('고객 코드', o.customer_erp || '-', '고객명', o.customer_name || '-') +
      row('주소', o.address || '-')
    ) +
    section('🚚 배송 정보',
      rowPair('구매 유형', o.ship_type ? tShipType(o.ship_type) : '-', '요청 날짜', formatDateOnly(o.delivery_date)) +
      row('배송 방법', o.delivery_method || o.shipping_method || '-') +
      (displayMemo ? row('메모', displayMemo) : '')
    ) +
    (function() {
      var allItems = o.items || [];
      var totalQty = 0, grandTotal = 0;
      if (!allItems.length) return section('📦 아이템 (0종)', '<div style="color:#9ca3af;font-size:13px;">아이템 없음</div>');

      function rqItemRow(it) {
        var up = parseFloat(it.price) || 0;
        var qt = parseInt(it.qty) || 1;
        if (!up && it.model) { var lk = _getItemPrice(it); up = lk.retail || 0; }
        var lt = up * qt;
        totalQty += qt; grandTotal += lt;
        return '<div style="padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-weight:600;color:#2563eb;">' + (it.model || '') + '</span>' +
            '<span style="font-weight:700;">×' + qt + '</span>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-top:2px;">' +
            '<span>' + (it.no || it.spec || it.name || '') + '</span>' +
            (up > 0 ? '<span>฿' + up.toLocaleString(undefined,{minimumFractionDigits:2}) + ' × ' + qt + ' = <span style="font-weight:600;color:#7c3aed;">฿' + lt.toLocaleString(undefined,{minimumFractionDigits:2}) + '</span></span>' : '') +
          '</div>' +
        '</div>';
      }

      var visibleHtml = allItems.slice(0, 3).map(rqItemRow).join('');
      var hiddenHtml = allItems.length > 3 ? allItems.slice(3).map(rqItemRow).join('') : '';

      // 개별 단가는 VAT 포함 가격 → 역산: VAT = 합계 × 7/107
      var vat = grandTotal * 7 / 107;
      var preTax = grandTotal - vat;
      var summaryHtml = grandTotal > 0
        ? '<div style="margin-top:8px;padding-top:8px;border-top:2px solid #e5e7eb;font-size:12px;">' +
            '<div style="display:flex;justify-content:space-between;color:#6b7280;"><span>세전 금액 (' + totalQty + '개)</span><span>฿' + preTax.toLocaleString(undefined,{minimumFractionDigits:2}) + '</span></div>' +
            '<div style="display:flex;justify-content:space-between;color:#6b7280;margin-top:2px;"><span>부가세 (7%)</span><span>฿' + vat.toLocaleString(undefined,{minimumFractionDigits:2}) + '</span></div>' +
            '<div style="display:flex;justify-content:space-between;margin-top:4px;padding-top:4px;border-top:1px solid #e5e7eb;font-size:13px;font-weight:700;color:#1e40af;"><span>합계 (VAT 포함)</span><span>฿' + grandTotal.toLocaleString(undefined,{minimumFractionDigits:2}) + '</span></div>' +
          '</div>'
        : '';

      var uid = 'rqItems_' + (o.id || Date.now());
      if (allItems.length <= 3) {
        return section('📦 아이템 (' + allItems.length + '종)', visibleHtml + summaryHtml);
      }
      return '<div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:12px 14px;">' +
        '<div style="display:flex;align-items:center;gap:6px;cursor:pointer;" onclick="var el=document.getElementById(\'' + uid + '\');var arr=this.querySelector(\'.rq-expand-arrow\');if(el.style.display===\'none\'){el.style.display=\'block\';arr.textContent=\'▲\';}else{el.style.display=\'none\';arr.textContent=\'▼\';}">' +
          '<div style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;">📦 아이템 (' + allItems.length + '종)</div>' +
          '<span class="rq-expand-arrow" style="font-size:10px;color:#9ca3af;">▼</span>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:0;margin-top:8px;">' + visibleHtml + '</div>' +
        '<div id="' + uid + '" style="display:none;">' + hiddenHtml + '</div>' +
        summaryHtml +
      '</div>';
    })() +
    buildAttHtml(rqAttachments);

  // IndexedDB에서 첨부파일 비동기 보완
  if (!rqAttachments.length) {
    idbLoadAttachments(o.id).then(function(idbAtts) {
      if (!idbAtts.length) return;
      if (!_orderExtrasMap[String(o.id)]) _orderExtrasMap[String(o.id)] = {};
      _orderExtrasMap[String(o.id)].attachments = idbAtts;
      // 패널이 아직 열려있으면 첨부파일 섹션 추가
      var panel = document.getElementById('rqDetailPanel');
      if (panel && panel.classList.contains('open') && !rqDetailEl.querySelector('.od-att-btn')) {
        var div = document.createElement('div');
        div.innerHTML = buildAttHtml(idbAtts);
        rqDetailEl.appendChild(div.firstChild);
      }
    });
  }

  document.getElementById('rqDetailPanel').classList.add('open');
  document.querySelector('.results-qry-modal').classList.add('rq-expanded');
}

function closeRqOrderDetail() {
  document.getElementById('rqDetailPanel').classList.remove('open');
  document.querySelector('.results-qry-modal').classList.remove('rq-expanded');
  _rqCurrentDetailId = null;
}

// ── 출고 리포트 상세 패널 ──
function showShipmentDetail(id) {
  var panel = document.getElementById('rqDetailPanel');
  if (_rqCurrentDetailId === String(id) && panel && panel.classList.contains('open')) {
    closeRqOrderDetail(); _rqCurrentDetailId = null; return;
  }
  _rqCurrentDetailId = String(id);
  var body = document.getElementById('resultsQryBody');
  var o = body && body._orderMap && body._orderMap[String(id)];
  if (!o) return;

  var statusLabel = {pending:'대기중',shipping:'발송대기',done:'완료',cancelled:'취소됨',cancel_requested:'취소요청'};
  var statusClass = {pending:'rs-pending',shipping:'rs-shipping',done:'rs-done',cancelled:'rs-cancelled',cancel_requested:'rs-pending'};
  var st = o.status || 'pending';

  function row(l, v) {
    return '<div style="display:flex;gap:8px;font-size:13px;margin-bottom:2px;"><span style="color:#6b7280;min-width:80px;max-width:80px;flex-shrink:0;white-space:nowrap;">' + l + '</span><span style="font-weight:600;color:#111827;word-break:break-all;flex:1;min-width:0;">' + (v||'-') + '</span></div>';
  }
  function section(t, h) {
    return '<div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:12px 14px;"><div style="font-size:11px;font-weight:700;color:#2563eb;margin-bottom:8px;text-transform:uppercase;">' + t + '</div><div style="display:flex;flex-direction:column;gap:6px;">' + h + '</div></div>';
  }
  function rowPair(l1, v1, l2, v2) {
    return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div>' + row(l1,v1) + '</div><div>' + row(l2,v2) + '</div></div>';
  }

  var trackHtml = o.tracking_number
    ? '<a href="javascript:void(0)" onclick="openTrackingWithBarcode(\'' + o.tracking_number + '\')" style="color:#2563eb;font-weight:700;text-decoration:underline;">' + o.tracking_number + '</a>'
    : '-';

  var items = o.items || [];
  var itemsHtml = items.map(function(it) {
    return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f3f4f6;font-size:13px;"><span style="font-weight:600;color:#2563eb;">' + (it.model||'') + '</span><span style="color:#6b7280;font-size:12px;">' + (it.no||it.spec||'') + '</span><span style="font-weight:700;">&times;' + (it.qty||1) + '</span></div>';
  }).join('');

  var hdrTitle = document.querySelector('.rq-detail-hdr h2');
  if (hdrTitle) hdrTitle.innerHTML = '🚚 발송 완료 상세';

  var rqDetailEl = document.getElementById('rqDetailBody');
  rqDetailEl.innerHTML =
    section('🚚 배송 정보',
      row('상태', '<span class="results-status-badge ' + (statusClass[st]||'') + '">' + (statusLabel[st]||st) + '</span>') +
      rowPair('배송 방법', styledDeliveryMethod(o.delivery_method || o.shipping_method || '-'), '운송장 번호', trackHtml) +
      rowPair('발송 담당', o.delivered_by || '-', '발송 완료일', formatDateOnly(o.delivered_date))
    ) +
    section('📋 주문 정보',
      row('주문번호', String(o.id||'')) +
      rowPair('주문 요청일', formatDateOnly(o.date), '배송 요청일', formatDateOnly(o.delivery_date)) +
      rowPair('승인자', o.completed_by||'-', '승인일', formatDateOnly(o.completed_date)) +
      row('신청자', o.user||'-') +
      (o.memo ? row('메모', o.memo) : '')
    ) +
    section('🏥 고객 정보',
      rowPair('고객 코드', o.customer_erp||'-', '고객명', o.customer_name||'-') +
      row('주소', o.address||'-')
    ) +
    section('📦 아이템 (' + items.length + '종)', itemsHtml || '<div style="color:#9ca3af;font-size:13px;">없음</div>');

  document.getElementById('rqDetailPanel').classList.add('open');
  document.querySelector('.results-qry-modal').classList.add('rq-expanded');
}

// ── 출고 리포트 엑셀 다운로드 ──
function downloadShipmentExcel() {
  var body = document.getElementById('resultsQryBody');
  var orders = (body && body._filteredOrders) || [];
  if (!orders.length) { neoAlert(t('msg_no_data')); return; }

  var sLabel = {pending:'대기중',shipping:'발송대기',done:'완료',cancelled:'취소됨',cancel_requested:'취소요청'};
  var headers = ['날짜','ERP','고객','출고유형','아이템','수량','배송방법','운송장번호','작성자','승인자','승인일','출고담당','출고완료일','상태'];
  var sheetRows = [headers];
  orders.forEach(function(o) {
    var items = o.items || [];
    var itemSum = items.length === 0 ? '' : items.length === 1 ? items[0].model : items[0].model + ' 외 ' + (items.length-1) + '건';
    var totalQty = items.reduce(function(s,it){ return s+(parseInt(it.qty)||0); },0);
    sheetRows.push([
      formatDateOnly(o.date), o.customer_erp||'', o.customer_name||'',
      o.ship_type||'', itemSum, totalQty,
      o.delivery_method||o.shipping_method||'', o.tracking_number||'',
      o.user||'', o.completed_by||'', formatDateOnly(o.completed_date),
      o.delivered_by||'', formatDateOnly(o.delivered_date),
      sLabel[o.status]||o.status||''
    ]);
  });

  var ws = XLSX.utils.aoa_to_sheet(sheetRows);
  ws['!cols'] = [{wch:13},{wch:11},{wch:30},{wch:13},{wch:25},{wch:7},{wch:14},{wch:22},{wch:14},{wch:14},{wch:13},{wch:14},{wch:16},{wch:11}];

  var FONT = { name: '맑은 고딕', sz: 12 };
  var AL_C = { horizontal:'center', vertical:'center' };
  var AL_L = { horizontal:'left', vertical:'center', wrapText:true };
  for (var r = 0; r < sheetRows.length; r++) {
    for (var c = 0; c < 14; c++) {
      var ref = XLSX.utils.encode_cell({r:r,c:c});
      if (!ws[ref]) ws[ref] = {v:'',t:'s'};
      var al = (c===4||c===7) ? AL_L : AL_C;
      ws[ref].s = { font: FONT, alignment: al };
    }
  }

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '출고리포트');
  XLSX.writeFile(wb, '출고리포트_' + new Date().toISOString().slice(0,10) + '.xlsx');
}

function rqPrintDetail() {
  var el = document.getElementById('rqDetailBody');
  if (!el) return;
  var win = window.open('', '_blank', 'width=800,height=900');
  win.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>주문 상세</title>' +
    '<style>body{font-family:"Segoe UI",sans-serif;padding:30px;color:#111;font-size:13px;} ' +
    'div{box-sizing:border-box;} @media print{body{padding:15px;}}</style></head><body>' +
    el.innerHTML + '</body></html>');
  win.document.close();
  setTimeout(function() { win.print(); }, 400);
}

async function rqExportPDF() {
  var el = document.getElementById('rqDetailBody');
  if (!el) return;
  // 라이브러리 동적 로드
  try { await loadHtml2Canvas(); await loadJsPDF(); } catch(e) { neoAlert('PDF 라이브러리 로딩 실패. 네트워크를 확인해 주세요.'); return; }
  var btn = document.querySelector('.rq-detail-hdr .btn-pdp-pdf');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 생성 중...'; }
  try {
    // 복제본을 만들어 충분한 너비로 렌더링
    var clone = document.createElement('div');
    clone.style.cssText = 'position:absolute;left:-9999px;top:0;width:650px;padding:18px;background:#fff;overflow:visible;height:auto;max-height:none;font-family:"Segoe UI",sans-serif;';
    // 제목을 HTML로 삽입 (jsPDF 한글 미지원 대응)
    var titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'font-size:18px;font-weight:700;color:#1e40af;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #dbeafe;';
    titleDiv.textContent = '📦 주문 상세';
    clone.appendChild(titleDiv);
    var contentClone = el.cloneNode(true);
    contentClone.style.cssText = 'overflow:visible;height:auto;max-height:none;display:flex;flex-direction:column;gap:14px;';
    clone.appendChild(contentClone);
    document.body.appendChild(clone);

    // 잠시 대기 (레이아웃 계산)
    await new Promise(function(r){ setTimeout(r, 100); });

    var canvas = await html2canvas(clone, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
      width: clone.offsetWidth, height: clone.scrollHeight,
      windowWidth: clone.offsetWidth, windowHeight: clone.scrollHeight,
      scrollX: 0, scrollY: 0
    });

    document.body.removeChild(clone);

    var { jsPDF } = window.jspdf;
    var margin = 10, imgW = 190, pageH = 277;
    var imgH = canvas.height * imgW / canvas.width;
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    var yPos = margin;
    var remaining = imgH, srcY = 0;

    while (remaining > 0) {
      var sliceH = Math.min(remaining, pageH - yPos);
      var slicePx = Math.round(sliceH * canvas.width / imgW);
      var sc = document.createElement('canvas');
      sc.width = canvas.width; sc.height = slicePx;
      sc.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
      pdf.addImage(sc.toDataURL('image/png'), 'PNG', margin, yPos, imgW, sliceH);
      srcY += slicePx; remaining -= sliceH; yPos = margin;
      if (remaining > 0) pdf.addPage();
    }

    var now = new Date();
    var fname = 'OrderDetail_' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(now.getSeconds()).padStart(2,'0') + '.pdf';
    pdf.save(fname);
  } catch(e) {
    console.error('PDF export error:', e);
    neoAlert('PDF 생성 실패: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '&#x1F4C4; PDF'; }
  }
}

function downloadResultsExcel() {
  var body = document.getElementById('resultsQryBody');
  var orders = (body && body._filteredOrders) || [];
  if (!orders.length) { neoAlert(t('msg_no_data')); return; }

  var statusLabel = { pending:'대기중', shipping:'발송대기', done:'완료', cancelled:'취소됨', cancel_requested:'취소요청' };

  // ── 헤더 (A~R, 18열) — 주문 완료 리포트 형식 ──────────────────
  var headers = [
    '주문 번호','날짜','ERP','고객','출고 유형','아이템','수량','가격',
    '요청일','배송 방법','주소','메모','상태','첨부 자료',
    '작성자','작성 일시','승인자','승인 일시'
  ];

  // ── 데이터 행 (주문별 아이템 분리) ────────────────────────────
  var sheetRows = [headers];
  orders.forEach(function(o) {
    var items = o.items || [];
    var st = statusLabel[o.status] || (o.status || '');
    var _rqExt = _orderExtrasMap[String(o.id)] || {};
    var atts = (o.attachments && o.attachments.length) ? o.attachments : (_rqExt.attachments || []);
    var attNames = atts.map(function(a){ return a.name || ''; }).filter(Boolean).join(', ');
    var writer = o.user || '';
    var writeDate = formatDateOnly(o.date);
    var approver = o.completed_by || '';
    var approveDate = formatDateOnly(o.completed_date);
    if (!items.length) {
      sheetRows.push([
        String(o.id||''), formatDateOnly(o.date), o.customer_erp||'', o.customer_name||'', o.ship_type||'일반출고',
        '', '', '',
        formatDateOnly(o.delivery_date), o.delivery_method||'', o.address||'', o.memo||'', st, attNames,
        writer, writeDate, approver, approveDate
      ]);
    } else {
      items.forEach(function(it, i) {
        var _ip = parseFloat(it.price) || 0;
        if (!_ip && it.model) { var _lk = _getItemPrice(it); _ip = _lk.retail || 0; }
        var price = _ip * (parseInt(it.qty)||1);
        if (i === 0) {
          sheetRows.push([
            String(o.id||''), formatDateOnly(o.date), o.customer_erp||'', o.customer_name||'', o.ship_type||'일반출고',
            it.model||'', it.qty||'', price || '',
            formatDateOnly(o.delivery_date), o.delivery_method||'', o.address||'', o.memo||'', st, attNames,
            writer, writeDate, approver, approveDate
          ]);
        } else {
          sheetRows.push(['','','','','', it.model||'', it.qty||'', price || '', '','','','','','','','','','']);
        }
      });
    }
  });

  // ── xlsx-js-style로 워크시트 생성 ─────────────────────────────
  var ws = XLSX.utils.aoa_to_sheet(sheetRows);

  // 열 너비
  ws['!cols'] = [
    { wch: 14 }, // A 주문 번호
    { wch: 13 }, // B 날짜
    { wch: 11 }, // C ERP
    { wch: 30 }, // D 고객
    { wch: 13 }, // E 출고 유형
    { wch: 20 }, // F 아이템
    { wch: 7  }, // G 수량
    { wch: 13 }, // H 가격
    { wch: 13 }, // I 요청일
    { wch: 14 }, // J 배송 방법
    { wch: 45 }, // K 주소
    { wch: 25 }, // L 메모
    { wch: 11 }, // M 상태
    { wch: 25 }, // N 첨부 자료
    { wch: 12 }, // O 작성자
    { wch: 16 }, // P 작성 일시
    { wch: 12 }, // Q 승인자
    { wch: 16 }  // R 승인 일시
  ];

  // ── 셀 스타일 적용 ─────────────────────────────────────────────
  var FONT = { name: '맑은 고딕', sz: 12 };
  var AL_CENTER = { horizontal: 'center', vertical: 'center', wrapText: false };
  var AL_RIGHT  = { horizontal: 'right',  vertical: 'center', wrapText: false };
  var AL_LEFT   = { horizontal: 'left',   vertical: 'center', wrapText: true  };

  for (var r = 0; r < sheetRows.length; r++) {
    for (var c = 0; c < 18; c++) {
      var ref = XLSX.utils.encode_cell({ r: r, c: c });
      if (!ws[ref]) ws[ref] = { v: '', t: 's' };
      // G(6):수량, H(7):가격 → 우측, K(10):주소, L(11):메모, N(13):첨부 → 좌측, 나머지 → 가운데
      var align = (c === 6 || c === 7) ? AL_RIGHT : (c === 10 || c === 11 || c === 13) ? AL_LEFT : AL_CENTER;
      ws[ref].s = { font: FONT, alignment: align };
    }
  }

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '주문조회');

  var today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, '주문조회_' + today + '.xlsx');

  // Google Sheets 전송
  sendResultsToSheets(orders);
}

async function sendResultsToSheets(orders) {
  try {
    var statusLabel = { pending:'대기중', shipping:'발송대기', done:'완료', cancelled:'취소됨', cancel_requested:'취소요청' };
    var rows = [];
    orders.forEach(function(o) {
      var items = o.items || [];
      var st = statusLabel[o.status] || (o.status || '');
      var approver = o.completed_by || '';
      if (!items.length) {
        rows.push({
          date: formatDateOnly(o.date), user: o.user||'', id: String(o.id||''),
          erp: o.customer_erp||'', name: o.customer_name||'', ship_type: o.ship_type||'',
          model: '', qty: '', delivery_date: formatDateOnly(o.delivery_date), address: o.address||'',
          delivery_method: o.delivery_method||'', memo: o.memo||'',
          approver: approver, approve_date: formatDateOnly(o.completed_date),
          dispatcher: o.user||'', status: st
        });
      } else {
        items.forEach(function(it, i) {
          rows.push({
            date: i===0?formatDateOnly(o.date):'', user: i===0?(o.user||''):'',
            id: i===0?String(o.id||''):'', erp: i===0?(o.customer_erp||''):'',
            name: i===0?(o.customer_name||''):'', ship_type: i===0?(o.ship_type||''):'',
            model: it.model||'', qty: it.qty||'',
            delivery_date: i===0?formatDateOnly(o.delivery_date):'', address: i===0?(o.address||''):'',
            delivery_method: i===0?(o.delivery_method||''):'', memo: i===0?(o.memo||''):'',
            approver: i===0?approver:'', approve_date: i===0?formatDateOnly(o.completed_date):'',
            dispatcher: i===0?(o.user||''):'', status: i===0?st:''
          });
        });
      }
    });
    await apiPost({ action: 'export_results', rows: rows });
  } catch(e) {}
}

function filterResultsQuery() {
  var body = document.getElementById('resultsQryBody');
  if (!body) return;
  var allOrders = body._allOrders || [];
  var searchQ  = (document.getElementById('rqSearchInput')  || {}).value || '';
  var statusF  = (document.getElementById('rqStatusFilter') || {}).value || '';
  var shipF    = (document.getElementById('rqShipFilter')   || {}).value || '';
  var dateFrom = (document.getElementById('rqDateFrom')     || {}).value || '';
  var dateTo   = (document.getElementById('rqDateTo')       || {}).value || '';

  // 날짜 파싱 헬퍼 — "2026. 3. 27. 오전 3:01:40" 또는 ISO 형식 모두 처리
  function parseOrderDate(o) {
    var d = o.date || '';
    // 한국어 형식: 공백 포함 "2026. 3. 27."
    var m = d.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
    if (!m) {
      // ISO 또는 슬래시 구분자
      m = d.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    }
    if (!m) return '';
    return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
  }

  var filtered = allOrders.filter(function(o) {
    if (searchQ) {
      var q = searchQ.toLowerCase();
      var match = (o.customer_erp  && o.customer_erp.toLowerCase().includes(q)) ||
                  (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
                  (o.user && o.user.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (statusF && o.status !== statusF) return false;
    if (shipF) {
      var st = (o.ship_type && o.ship_type.trim()) ? o.ship_type.trim() : '일반출고';
      if (st !== shipF) return false;
    }
    if (dateFrom || dateTo) {
      var oDate = parseOrderDate(o);
      if (dateFrom && oDate && oDate < dateFrom) return false;
      if (dateTo   && oDate && oDate > dateTo)   return false;
    }
    return true;
  });

  var tableEl = document.getElementById('rqTable');
  if (!tableEl) return;

  // 다운로드용 캐시
  var body2 = document.getElementById('resultsQryBody');
  if (body2) body2._filteredOrders = filtered;

  if (!filtered.length) {
    tableEl.innerHTML = '<div class="pending-empty" style="padding:24px;">&#x1F4ED; ' + t('rq_no_result') + '</div>';
    return;
  }

  var statusLabel = {pending:t('rq_status_pending'), shipping:t('rq_status_shipping'), done:t('rq_status_done'), cancelled:t('rq_status_cancelled'), cancel_requested:t('rq_status_cancel_req')};
  var statusClass = {pending:'rs-pending', shipping:'rs-shipping', done:'rs-done', cancelled:'rs-cancelled', cancel_requested:'rs-pending'};

  // 필터된 주문 맵 저장 (상세 보기용)
  var body3 = document.getElementById('resultsQryBody');
  if (body3) {
    var orderMap = {};
    filtered.forEach(function(o){ orderMap[String(o.id)] = o; });
    body3._orderMap = orderMap;
  }

  if (window._rqMode === 'shipment') {
    // ── 출고 리포트 테이블 ──
    tableEl.innerHTML = '<table class="results-table">' +
      '<thead><tr>' +
        '<th>' + t('rq_th_date') + '</th>' +
        '<th>ERP</th>' +
        '<th>' + t('rq_th_customer') + '</th>' +
        '<th>' + t('rq_th_ship_type') + '</th>' +
        '<th>' + t('rq_th_items') + '</th>' +
        '<th>배송방법</th>' +
        '<th>운송장번호</th>' +
        '<th>작성자</th>' +
        '<th>승인자</th>' +
        '<th>승인일</th>' +
        '<th>출고담당</th>' +
        '<th>출고완료일</th>' +
        '<th>' + t('rq_th_status') + '</th>' +
      '</tr></thead>' +
      '<tbody>' +
        filtered.map(function(o) {
          var items = o.items || [];
          var itemDisp = items.length === 0 ? '-'
            : items.length === 1 ? (items[0].model + ' &times;' + (items[0].qty||1))
            : (items[0].model + ' 외 ' + (items.length - 1) + '건');
          var allItemTitles = items.map(function(it){ return it.model + ' x' + it.qty; }).join(', ');
          var st = o.status || 'pending';
          var trackNo = o.tracking_number || '';
          var trackHtml = trackNo
            ? '<a href="javascript:void(0)" onclick="event.stopPropagation();openTrackingWithBarcode(\'' + trackNo + '\')" style="color:#2563eb;font-weight:600;text-decoration:underline;">' + trackNo + '</a>'
            : '-';
          return '<tr class="rq-row-clickable" onclick="showShipmentDetail(\'' + String(o.id) + '\')" title="클릭하여 상세 보기">' +
            '<td style="white-space:nowrap;font-size:12px;">' + formatDateOnly(o.date) + '</td>' +
            '<td style="font-weight:700;color:#2563eb;white-space:nowrap;">' + (o.customer_erp || '-') + '</td>' +
            '<td>' + (o.customer_name || '-') + '</td>' +
            '<td style="white-space:nowrap;">' + (o.ship_type || '-') + '</td>' +
            '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + allItemTitles + '">' + itemDisp + '</td>' +
            '<td style="white-space:nowrap;">' + styledDeliveryMethod(o.delivery_method || o.shipping_method) + '</td>' +
            '<td style="white-space:nowrap;font-size:11px;">' + trackHtml + '</td>' +
            '<td style="font-size:11px;white-space:nowrap;">' + (o.user ? o.user.split(' (')[0] : '-') + '</td>' +
            '<td style="font-size:11px;white-space:nowrap;">' + (o.completed_by ? o.completed_by.split(' (')[0] : '-') + '</td>' +
            '<td style="white-space:nowrap;font-size:11px;">' + formatDateOnly(o.completed_date) + '</td>' +
            '<td style="font-size:11px;white-space:nowrap;">' + (o.delivered_by ? o.delivered_by.split(' (')[0] : '-') + '</td>' +
            '<td style="white-space:nowrap;font-size:11px;">' + formatDateOnly(o.delivered_date) + '</td>' +
            '<td><span class="results-status-badge ' + (statusClass[st] || '') + '">' + (statusLabel[st] || st) + '</span></td>' +
          '</tr>';
        }).join('') +
      '</tbody></table>';
  } else {
    // ── 주문 완료 조회 테이블 ──
    tableEl.innerHTML = '<table class="results-table">' +
      '<thead><tr>' +
        '<th>주문번호</th>' +
        '<th>' + t('rq_th_date') + '</th>' +
        '<th>ERP</th>' +
        '<th>' + t('rq_th_customer') + '</th>' +
        '<th>' + t('rq_th_ship_type') + '</th>' +
        '<th>' + t('rq_th_items') + '</th>' +
        '<th style="text-align:right;">Qty</th>' +
        '<th style="text-align:right;">가격</th>' +
        '<th>' + t('rq_th_delivery_date') + '</th>' +
        '<th>메모</th>' +
        '<th>' + t('rq_th_status') + '</th>' +
        '<th>작성자</th>' +
        '<th>승인자</th>' +
        '<th>📎</th>' +
      '</tr></thead>' +
      '<tbody>' +
        filtered.map(function(o) {
          var items = o.items || [];
          var totalQty = items.reduce(function(s, it){ return s + (parseInt(it.qty)||0); }, 0);
          var totalPrice = items.reduce(function(s, it){
            var p = parseFloat(it.price) || 0;
            if (!p && it.model) { var lk = _getItemPrice(it); p = lk.retail || 0; }
            return s + (p * (parseInt(it.qty)||1));
          }, 0);
          var itemDisp = items.length === 0 ? '-'
            : items.length === 1 ? (items[0].model + ' &times;' + items[0].qty)
            : (items[0].model + ' 외 ' + (items.length - 1) + '건');
          var allItemTitles = items.map(function(it){ return it.model + ' x' + it.qty; }).join(', ');
          var st = o.status || 'pending';
          var dateDisp  = formatDateOnly(o.date);
          var reqDisp   = formatDateOnly(o.delivery_date);
          var memoDisp  = o.memo ? (o.memo.length > 15 ? o.memo.slice(0,15) + '…' : o.memo) : '-';
          var _rqExt = _orderExtrasMap[String(o.id)] || {};
          var attCount = (o.attachments && o.attachments.length) ? o.attachments.length : (_rqExt.attachments || []).length;
          return '<tr class="rq-row-clickable" onclick="showRqOrderDetail(\'' + String(o.id) + '\')" title="클릭하여 상세 보기">' +
            '<td style="font-size:11px;white-space:nowrap;color:#6b7280;">' + String(o.id || '-') + '</td>' +
            '<td style="white-space:nowrap;font-size:12px;">' + dateDisp + '</td>' +
            '<td style="font-weight:700;color:#2563eb;white-space:nowrap;">' + (o.customer_erp || '-') + '</td>' +
            '<td>' + (o.customer_name || '-') + '</td>' +
            '<td style="white-space:nowrap;">' + (o.ship_type || '-') + '</td>' +
            '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + allItemTitles + '">' + itemDisp + '</td>' +
            '<td style="text-align:right;font-weight:600;">' + (totalQty || '-') + '</td>' +
            '<td style="text-align:right;font-weight:600;color:#7c3aed;">' + (totalPrice > 0 ? '฿' + totalPrice.toLocaleString() : '-') + '</td>' +
            '<td style="white-space:nowrap;">' + reqDisp + '</td>' +
            '<td style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escHtml(o.memo||'') + '">' + memoDisp + '</td>' +
            '<td><span class="results-status-badge ' + (statusClass[st] || '') + '">' + (statusLabel[st] || st) + '</span></td>' +
            '<td style="font-size:11px;white-space:nowrap;">' + (o.user ? o.user.split(' (')[0] : '-') + '</td>' +
            '<td style="font-size:11px;white-space:nowrap;">' + (o.completed_by ? o.completed_by.split(' (')[0] : '-') + '</td>' +
            '<td style="text-align:center;">' + (attCount > 0 ? '📎' + attCount : '') + '</td>' +
          '</tr>';
        }).join('') +
      '</tbody></table>';
  }

}

// ── 출고 유형 선택 ─────────────────────────────────────────────
let orderShipType = '일반출고';

function toggleShipDDMenu(e) {
  e.stopPropagation();
  var menu = document.querySelector('#shipTypeDDNormal .ship-type-dd-menu');
  if (menu) menu.classList.toggle('open');
}
function _closeShipDDMenu() {
  var menu = document.querySelector('#shipTypeDDNormal .ship-type-dd-menu');
  if (menu) menu.classList.remove('open');
}
document.addEventListener('click', function() { _closeShipDDMenu(); });

// 패키지출고/위탁출고 버튼 직접 이벤트 바인딩 (inline onclick 미작동 대비)
(function _bindShipBtns() {
  var row = document.getElementById('shipTypeRow');
  if (!row) { setTimeout(_bindShipBtns, 300); return; }
  row.querySelectorAll('.ship-type-btn[data-val]').forEach(function(btn) {
    if (btn.closest('#shipTypeDDNormal')) return; // 일반출고 DD 내부 버튼은 제외
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var type = this.getAttribute('data-val');
      console.log('[shipBtn direct] clicked:', type);
      selectShipType(this, type);
    }, true); // capture phase!
  });
  console.log('[shipBtn] bound', row.querySelectorAll('.ship-type-btn[data-val]:not(#shipTypeDDNormal .ship-type-btn)').length, 'buttons');
})();

function selectShipSubType(type, label) {
  _closeShipDDMenu();
  // 일반출고 드롭다운 하위 메뉴에서 선택
  var ddBtn = document.querySelector('#shipTypeDDNormal .ship-type-btn');
  document.querySelectorAll('.ship-type-btn').forEach(function(b) { b.classList.remove('selected'); });
  ddBtn.classList.add('selected');
  if (type === '위탁정산') {
    ddBtn.innerHTML = '<span data-i18n="settle_dd_consign">' + t('settle_dd_consign') + '</span> <span style="font-size:10px;opacity:.7;">▼</span>';
  } else if (type === '직접+위탁') {
    ddBtn.innerHTML = '<span data-i18n="settle_dd_both">' + t('settle_dd_both') + '</span> <span style="font-size:10px;opacity:.7;">▼</span>';
  } else {
    ddBtn.innerHTML = '<span data-i18n="ship_normal">' + t('ship_normal') + '</span> <span style="font-size:10px;opacity:.7;">▼</span>';
  }
  selectShipType(ddBtn, type);
}

function selectShipType(btn, type) {
  console.log('[selectShipType] called:', type, btn);
  var prevType = orderShipType;
  // 모든 ship-type-btn에서 selected 제거 후, 클릭된 버튼에 추가
  document.querySelectorAll('.ship-type-btn').forEach(function(b) { b.classList.remove('selected'); b.style.background = ''; b.style.borderColor = ''; b.style.color = ''; });
  btn.classList.add('selected');
  orderShipType = type;
  // 일반출고 드롭다운 버튼 텍스트 동기화
  var ddBtn = document.querySelector('#shipTypeDDNormal .ship-type-btn');
  if (ddBtn && btn !== ddBtn) {
    ddBtn.innerHTML = '<span data-i18n="ship_normal">일반출고</span> <span style="font-size:10px;opacity:.7;">▼</span>';
  }
  // 패키지출고 → 세트 선택 표시
  var picker = document.getElementById('pkgSetPicker');
  if (picker) {
    if (type === '패키지출고') {
      picker.classList.add('open');
    } else {
      picker.classList.remove('open');
    }
  }
  // 출고 유형 변경 시 아이템 목록 다시 렌더 (패키지 ↔ 일반 전환)
  if ((prevType === '패키지출고') !== (type === '패키지출고')) {
    if (type !== '패키지출고') _pkgFinalPrice = 0;
    if (orderItems.length) renderOrderItems();
  }
  // 위탁정산 또는 직접+위탁 선택 시: 위탁출고 아이템 조회 피커 표시
  var settlePicker = document.getElementById('settlePickerWrap');
  var showSettle = (type === '위탁정산' || type === '직접+위탁');
  if (settlePicker) {
    if (showSettle) {
      settlePicker.style.display = '';
      _openSettlePickerMobile();
      _updateMobSettleFab();
      if (orderCustomer && orderCustomer.erp) { loadConsignItems(orderCustomer.erp); renderSettleResultList(0); }
      else {
        var _bl = document.getElementById('settleBRList');
        if (_bl) { _bl.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">' + t('settle_no_customer') + '</div>'; _bl.style.transform = 'translateX(0)'; }
        var _bd = document.getElementById('settleBRDetail');
        if (_bd) { _bd.innerHTML = ''; _bd.style.transform = 'translateX(100%)'; }
        renderSettleResultList(0);
      }
    } else {
      settlePicker.style.display = 'none';
      var _fab = document.getElementById('mobSettleFab'); if (_fab) _fab.style.display = 'none';
      // 정산 리스트는 보존 — 피커만 숨김 (다시 돌아오면 복원됨)
    }
  }
  // 위탁정산 전용: 검색창 + 아이템 목록 숨기기
  var isSettleOnly = (type === '위탁정산');
  var itemSearchRow = document.querySelector('.item-search-row');
  var selItemWrap = document.getElementById('selItemWrap');
  var orderItemsEl = document.getElementById('orderItemsList');
  var catDropdown = document.querySelector('.cat-dropdown-wrap');
  if (itemSearchRow) itemSearchRow.style.display = isSettleOnly ? 'none' : '';
  if (selItemWrap && isSettleOnly) selItemWrap.style.display = 'none';
  if (orderItemsEl) orderItemsEl.style.display = isSettleOnly ? 'none' : '';
  if (catDropdown) catDropdown.style.display = isSettleOnly ? 'none' : '';
}

function selectPkgSet(qty) {
  // CAT_TREE에서 먼저 검색, 없으면 동적 생성
  var pkgNode = null;
  if (typeof CAT_TREE !== 'undefined' && CAT_TREE[0] && CAT_TREE[0].children) {
    for (var pi = 0; pi < CAT_TREE[0].children.length; pi++) {
      if (CAT_TREE[0].children[pi].key === 'package') { pkgNode = CAT_TREE[0].children[pi]; break; }
    }
  }
  var setKey = 's' + qty;
  var node = null;
  if (pkgNode) {
    for (var i = 0; i < pkgNode.children.length; i++) {
      if (pkgNode.children[i].key === setKey) { node = pkgNode.children[i]; break; }
    }
  }
  // CAT_TREE에서 못 찾으면 동적으로 노드 생성 (selectPkgSetManual과 동일 방식)
  if (!node) {
    node = { key: setKey, label: qty + ' Sets', children: _buildPkgChildren(qty) };
  }
  _catTreePath = ['implant', 'package', setKey];
  _updateCatBadge();
  openPkgBuilder(node);
}

function selectPkgSetManual() {
  var v = parseInt(document.getElementById('pkgSetManualInput').value);
  if (!v || v < 1) { neoAlert('세트 수량을 입력해주세요.'); return; }
  // 동적으로 커스텀 세트 노드 생성
  var node = {
    key: 's' + v, label: v + ' Sets',
    children: _buildPkgChildren(v)
  };
  _catTreePath = ['implant', 'package', 's' + v];
  _updateCatBadge();
  openPkgBuilder(node);
}

// ── 위탁 출고 정산 (Consignment Settlement) ──────────────────────────────────
var _consignOrders = []; // 조회된 위탁출고 주문 원본
var _consignItems  = []; // 미정산 아이템 목록 (flat)
var _settleRefs    = []; // 현재 주문에 포함된 정산 참조

async function loadConsignItems(erp) {
  var brList = document.getElementById('settleBRList');
  if (!brList) return;
  brList.innerHTML = '<div style="padding:20px;text-align:center;color:#7c3aed;font-size:13px;">⏳ 조회 중...</div>';
  var brDetail = document.getElementById('settleBRDetail');
  if (brDetail) brDetail.innerHTML = '';
  // 슬라이더 초기화
  if (brList) brList.style.transform = 'translateX(0)';
  if (brDetail) brDetail.style.transform = 'translateX(100%)';
  _expandedBR = null;
  _consignOrders = [];
  _consignItems = [];
  try {
    // ERP 패턴 매칭: 50114 → W50114, W50114 → W50114
    var erpClean = String(erp).replace(/^W/i, '');
    var erpW = 'W' + erpClean;
    var erpCandidates = [erp, erpClean, erpW];
    // 중복 제거
    var erpSet = {};
    erpCandidates.forEach(function(e) { erpSet[e] = true; });
    var erpList = Object.keys(erpSet);

    // 1) consignment_master 컬렉션에서 미정산(BORROW) 아이템 조회 (패턴 매칭)
    for (var ei = 0; ei < erpList.length; ei++) {
      var masterSnap = await _fbDb.collection('consignment_master')
        .where('c', '==', erpList[ei])
        .where('st', '==', 'BORROW')
        .get();
      masterSnap.forEach(function(doc) {
        var r = doc.data();
        _consignItems.push({
          docId: doc.id,
          source: 'master',
          orderId: r.b || '',
          orderDate: r.d || '',
          item: { no: r.p || '', model: r.p || '', name: r.pn || '', spec: '' },
          saleName: r.s || '',
          custName: r.n || '',
          origQty: parseInt(r.q) || 1,
          settledQty: 0,
          remainQty: parseInt(r.q) || 1,
          selectQty: parseInt(r.q) || 1,
          checked: false
        });
      });
    }
    // 2) orders 컬렉션에서도 위탁출고 주문 조회
    for (var ej = 0; ej < erpList.length; ej++) {
      var snap = await _fbDb.collection('orders')
        .where('customer_erp', '==', erpList[ej])
        .where('ship_type', '==', '위탁출고')
        .get();
      snap.forEach(function(doc) {
        var d = doc.data();
        if (d.status === 'shipping' || d.status === 'done' || d.status === 'delivered') {
          _consignOrders.push(d);
        }
      });
    }
    // 각 주문의 아이템에서 이미 정산된 것을 제외
    _consignOrders.forEach(function(order) {
      var items = order.items || [];
      var settled = order.settled_items || [];
      items.forEach(function(itm) {
        var origQty = parseInt(itm.qty) || 1;
        var settledQty = 0;
        settled.forEach(function(s) {
          if ((s.item_no && s.item_no === itm.no) || (s.item_model && s.item_model === itm.model)) {
            settledQty += (parseInt(s.qty) || 0);
          }
        });
        var remainQty = origQty - settledQty;
        if (remainQty > 0) {
          _consignItems.push({
            source: 'order',
            orderId: order.id,
            orderDate: order.date || '',
            item: itm,
            origQty: origQty,
            settledQty: settledQty,
            remainQty: remainQty,
            selectQty: remainQty,
            checked: false
          });
        }
      });
    });
    if (!_consignItems.length) {
      if (brList) brList.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">' + t('settle_no_unsettled') + '</div>';
      return;
    }
    // BR 문서별로 그룹핑
    _consignItems.sort(function(a, b) { return (b.orderDate || '').localeCompare(a.orderDate || ''); });
    renderConsignBRList();
    renderSettleResultList(0);
  } catch(e) {
    console.error('[loadConsignItems]', e);
    body.innerHTML = '<div style="padding:20px;text-align:center;color:#ef4444;font-size:13px;">조회 실패: ' + e.message + '</div>';
  }
}

// ── BR 문서 목록 렌더링 (좌측 패널) ──
function renderConsignBRList() {
  var listEl = document.getElementById('settleBRList');
  if (!listEl) return;
  // BR NO별 그룹핑
  var brMap = {};
  var brOrder = [];
  _consignItems.forEach(function(ci) {
    var br = ci.orderId || 'unknown';
    if (!brMap[br]) { brMap[br] = { date: ci.orderDate, sale: ci.saleName || '', cust: ci.custName || '', items: [], totalQty: 0 }; brOrder.push(br); }
    brMap[br].items.push(ci);
    brMap[br].totalQty += ci.remainQty;
  });

  var addedBRs = {};
  _settleRefs.forEach(function(r) { addedBRs[r.orderId] = (addedBRs[r.orderId] || 0) + 1; });

  var html = '<div style="padding:8px 12px 6px;font-size:11px;color:#6b7280;border-bottom:1px solid #f1f5f9;background:#f9fafb;">BR ' + brOrder.length + '건 · 아이템 ' + _consignItems.length + '건</div>';
  brOrder.forEach(function(br) {
    var g = brMap[br];
    var addedCount = addedBRs[br] || 0;
    var allAdded = addedCount >= g.items.length;
    var isSelected = _expandedBR === br;
    var bg = isSelected ? '#ede9fe' : (allAdded ? '#f0fdf4' : '#fff');
    var leftBorder = isSelected ? 'border-left:3px solid #7c3aed;' : 'border-left:3px solid transparent;';
    var badge = allAdded ? ' <span style="background:#d1fae5;color:#065f46;font-size:9px;padding:1px 5px;border-radius:4px;font-weight:600;">✓</span>' : '';
    html += '<div onclick="expandBRDetail(\'' + br + '\')" style="padding:10px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;background:' + bg + ';' + leftBorder + 'transition:background .12s;" onmouseover="if(!this.dataset.sel)this.style.background=\'#f5f3ff\'" onmouseout="if(!this.dataset.sel)this.style.background=\'' + (allAdded ? '#f0fdf4' : '#fff') + '\'" ' + (isSelected ? 'data-sel="1"' : '') + '>';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;">';
    html += '<div style="font-size:13px;font-weight:700;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + br + badge + '</div>';
    html += '<div style="font-size:12px;font-weight:600;color:#7c3aed;white-space:nowrap;">' + g.items.length + '개</div>';
    html += '</div>';
    html += '<div style="font-size:11px;color:#6b7280;margin-top:2px;">' + g.date + (g.sale ? ' · ' + g.sale : '') + '</div>';
    html += '</div>';
  });
  listEl.innerHTML = html;
}

// ── BR 상세 (슬라이드 패널: 아이템 목록 + 체크박스) ──
var _expandedBR = null;
function expandBRDetail(br) {
  _expandedBR = br;
  renderConsignBRList();
  renderConsignItems();
  // 슬라이드: BR 리스트 → 왼쪽으로 밀고, 상세 → 오른쪽에서 등장
  var listEl = document.getElementById('settleBRList');
  var detailEl = document.getElementById('settleBRDetail');
  if (listEl) listEl.style.transform = 'translateX(-100%)';
  if (detailEl) detailEl.style.transform = 'translateX(0)';
  // 핸드폰 뒤로가기용 history
  if (window.innerWidth <= 1024) {
    history.pushState({settle:'detail'}, '');
  }
}
function goBackToBRList() {
  _expandedBR = null;
  var listEl = document.getElementById('settleBRList');
  var detailEl = document.getElementById('settleBRDetail');
  if (listEl) listEl.style.transform = 'translateX(0)';
  if (detailEl) detailEl.style.transform = 'translateX(100%)';
}

// ── 모바일 정산 오버레이 제어 + 핸드폰 뒤로가기 지원 ──
var _settlePopLock = false; // popstate에서 호출 시 중복 history 조작 방지

function _settlePickerHide() {
  var wrap = document.getElementById('settlePickerWrap');
  if (wrap) wrap.style.cssText = 'display:none;border:2px solid #c4b5fd;border-radius:12px;margin-bottom:12px;background:#faf5ff;overflow:hidden;';
  var fab = document.getElementById('mobSettleFab');
  if (fab) fab.style.display = 'none';
}

function _closeSettlePicker() {
  _settlePickerHide();
}

function _openSettlePickerMobile() {
  if (window.innerWidth > 1024) return;
  var wrap = document.getElementById('settlePickerWrap');
  if (!wrap) return;
  // 풀스크린 오버레이
  wrap.style.cssText = 'display:flex;flex-direction:column;position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;border:none;border-radius:0;margin:0;background:#faf5ff;overflow:hidden;';
  // ← 뒤로가기, ✕ 닫기 버튼 보이기
  var backBtn = document.getElementById('settleHdrBackBtn');
  var closeBtn = document.getElementById('settleHdrCloseBtn');
  if (backBtn) backBtn.style.display = 'flex';
  if (closeBtn) closeBtn.style.display = 'flex';
  // split 영역을 flex:1로 채우기
  var split = wrap.querySelector('.settle-split');
  if (split) split.style.cssText = 'display:flex;flex-direction:column;flex:1;height:auto;max-height:none;position:relative;overflow:hidden;';
  var left = wrap.querySelector('.settle-split-left');
  if (left) left.style.cssText = 'width:100%;height:100%;flex:1;border-right:none;border-bottom:none;display:flex;flex-direction:column;background:#fff;';
  // 정산 리스트(오른쪽) → 슬라이드 패널
  var right = wrap.querySelector('.settle-split-right');
  if (right) right.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;z-index:10001;transform:translateX(100%);transition:transform .3s ease;display:flex;flex-direction:column;background:#faf5ff;';
  // 핸드폰 뒤로가기용 history 등록
  history.pushState({settle:'list'}, '');
}
function _toggleMobSettleResult() {
  if (window.innerWidth > 1024) return;
  var right = document.querySelector('.settle-split-right');
  if (!right) return;
  var isOpen = right.style.transform === 'translateX(0%)' || right.style.transform === 'translateX(0)';
  if (isOpen) {
    right.style.transform = 'translateX(100%)';
  } else {
    right.style.transform = 'translateX(0%)';
    history.pushState({settle:'result'}, '');
  }
}
// 헤더 ← 버튼: 핸드폰 뒤로가기와 동일하게 단계별 뒤로
function _settleGoBack() {
  // history.back()을 호출하면 popstate가 발생 → popstate 핸들러가 UI를 처리
  history.back();
}
function _closeMobSettleResult() {
  if (window.innerWidth > 1024) return;
  var right = document.querySelector('.settle-split-right');
  if (right) right.style.transform = 'translateX(100%)';
}
function _updateMobSettleFab() {
  if (window.innerWidth > 1024) return;
  var fab = document.getElementById('mobSettleFab');
  if (!fab) return;
  var wrap = document.getElementById('settlePickerWrap');
  if (!wrap || wrap.style.display === 'none') { fab.style.display = 'none'; return; }
  fab.style.display = 'flex';
  var badge = fab.querySelector('.fab-badge');
  if (badge) badge.textContent = _settleRefs.length;
}

// ── 핸드폰 뒤로가기 버튼 (popstate) 처리 ──
window.addEventListener('popstate', function(e) {
  // 정산 피커가 열려있지 않으면 무시
  var wrap = document.getElementById('settlePickerWrap');
  if (!wrap || wrap.style.position !== 'fixed' || window.innerWidth > 1024) return;

  // 1순위: 정산 리스트 패널이 열려있으면 → 닫기
  var right = wrap.querySelector('.settle-split-right');
  if (right && (right.style.transform === 'translateX(0%)' || right.style.transform === 'translateX(0)')) {
    right.style.transform = 'translateX(100%)';
    return;
  }

  // 2순위: BR 상세가 열려있으면 → BR 리스트로 돌아가기
  if (_expandedBR) {
    goBackToBRList();
    return;
  }

  // 3순위: BR 리스트 상태 → 피커 전체 닫기
  _settlePickerHide();
});

function renderConsignItems() {
  var detailEl = document.getElementById('settleBRDetail');
  if (!detailEl) return;
  if (!_expandedBR) {
    detailEl.innerHTML = '';
    return;
  }
  var brItems = _consignItems.filter(function(ci) { return ci.orderId === _expandedBR; });
  if (!brItems.length) {
    detailEl.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#9ca3af;font-size:13px;">' + t('settle_no_items') + '</div>';
    return;
  }

  var addedKeys = {};
  _settleRefs.forEach(function(r) { addedKeys[r.orderId + '_' + (r.item_no || r.item_model)] = true; });

  var html = '<div style="padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #e5e7eb;background:#f8fafc;position:sticky;top:0;z-index:1;">';
  html += '<button onclick="goBackToBRList()" style="padding:4px 8px;border:none;border-radius:6px;background:#e5e7eb;color:#374151;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;">← </button>';
  html += '<div style="flex:1;min-width:0;">';
  html += '<div style="font-size:13px;font-weight:700;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📄 ' + _expandedBR + '</div>';
  html += '<div style="font-size:11px;color:#6b7280;">' + t('settle_items_count').replace('{n}', brItems.length) + '</div>';
  html += '</div>';
  html += '<button onclick="addConsignItemsToOrder()" style="padding:6px 14px;border:none;border-radius:8px;background:#7c3aed;color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">➕ ' + t('settle_add_btn') + '</button>';
  html += '</div>';

  // 전체 선택
  html += '<div style="padding:6px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f1f5f9;">';
  html += '<label style="font-size:12px;color:#6b7280;cursor:pointer;display:flex;align-items:center;gap:4px;" onclick="toggleAllConsignItems()">';
  html += '<input type="checkbox" id="consignCheckAll" style="accent-color:#7c3aed;">' + t('settle_select_all') + '</label>';
  html += '</div>';

  brItems.forEach(function(ci) {
    var idx = _consignItems.indexOf(ci);
    var key = ci.orderId + '_' + (ci.item.no || ci.item.model);
    var alreadyAdded = addedKeys[key];
    var bg = alreadyAdded ? '#f0fdf4' : (ci.checked ? '#ede9fe' : '#fff');
    html += '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #f1f5f9;background:' + bg + ';">';
    if (alreadyAdded) {
      html += '<span style="font-size:14px;">✅</span>';
    } else {
      html += '<input type="checkbox" ' + (ci.checked ? 'checked' : '') + ' onchange="_consignItems[' + idx + '].checked=this.checked" style="width:16px;height:16px;accent-color:#7c3aed;flex-shrink:0;">';
    }
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:13px;font-weight:600;color:#1f2937;">' + (ci.item.no || ci.item.model || '-') + '</div>';
    html += '<div style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (ci.item.name || '-') + '</div>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">';
    if (!alreadyAdded) {
      html += '<div style="display:inline-flex;align-items:center;border:1.5px solid #e5e7eb;border-radius:8px;overflow:hidden;">' +
        '<button onclick="_stlQtyChange(' + idx + ',-1)" style="width:26px;height:26px;border:none;background:#f3f4f6;color:#374151;font-size:13px;font-weight:700;cursor:pointer;">−</button>' +
        '<input type="number" id="stlq_' + idx + '" value="' + ci.selectQty + '" min="1" max="' + ci.remainQty + '" onchange="_consignItems[' + idx + '].selectQty=Math.min(Math.max(parseInt(this.value)||1,1),' + ci.remainQty + ');this.value=_consignItems[' + idx + '].selectQty;" style="width:32px;height:26px;border:none;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;text-align:center;font-size:12px;font-weight:700;outline:none;-moz-appearance:textfield;appearance:textfield;">' +
        '<button onclick="_stlQtyChange(' + idx + ',1)" style="width:26px;height:26px;border:none;background:#f3f4f6;color:#374151;font-size:13px;font-weight:700;cursor:pointer;">+</button>' +
      '</div>';
      html += '<button onclick="_quickAddConsignItem(' + idx + ')" style="width:28px;height:28px;border:none;border-radius:6px;background:#7c3aed;color:#fff;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;" title="추가">+</button>';
    }
    html += '</div>';
    html += '<div style="font-size:10px;color:#6b7280;margin-top:2px;text-align:right;">' + t('settle_unsettled') + ' ' + ci.remainQty + '</div>';
    html += '</div>';
  });
  detailEl.innerHTML = html;
}

function _stlQtyChange(idx, delta) {
  var ci = _consignItems[idx];
  if (!ci) return;
  var inp = document.getElementById('stlq_' + idx);
  var v = (parseInt(inp ? inp.value : ci.selectQty) || 1) + delta;
  if (v < 1) v = 1;
  if (v > ci.remainQty) v = ci.remainQty;
  ci.selectQty = v;
  if (inp) inp.value = v;
}

function _quickAddConsignItem(idx) {
  var ci = _consignItems[idx];
  if (!ci) return;
  var key = ci.orderId + '_' + (ci.item.no || ci.item.model);
  var alreadyAdded = _settleRefs.some(function(r) { return (r.orderId + '_' + (r.item_no || r.item_model)) === key; });
  if (alreadyAdded) return;
  var itemCopy = Object.assign({}, ci.item);
  var qty = ci.selectQty || ci.remainQty;
  var priceInfo = _getItemPrice(itemCopy);
  var price = _parsePriceVal(priceInfo.price || priceInfo.retail || 0);
  var ref = { orderId: ci.orderId, item_no: ci.item.no || '', item_model: ci.item.model || '', qty: qty, source: ci.source || 'order' };
  if (ci.docId) ref.docId = ci.docId;
  orderItems.push({ item: itemCopy, qty: qty, _price: price, _settleRef: ref });
  _settleRefs.push(Object.assign({}, ref));
  ci.checked = false;
  renderOrderItems();
  renderConsignBRList();
  renderConsignItems();
  renderSettleResultList(1);
  document.getElementById('submitOrderBtn').disabled = !orderItems.length;
}

function toggleAllConsignItems() {
  var cb = document.getElementById('consignCheckAll');
  var val = cb ? cb.checked : false;
  _consignItems.forEach(function(ci) {
    // 현재 열린 BR 문서 내 아이템만 토글
    if (_expandedBR && ci.orderId !== _expandedBR) return;
    var key = ci.orderId + '_' + (ci.item.no || ci.item.model);
    var alreadyAdded = _settleRefs.some(function(r) { return (r.orderId + '_' + (r.item_no || r.item_model)) === key; });
    if (!alreadyAdded) ci.checked = val;
  });
  renderConsignItems();
  setTimeout(function() {
    var cb2 = document.getElementById('consignCheckAll');
    if (cb2) cb2.checked = val;
  }, 0);
}

function addConsignItemsToOrder() {
  var added = 0;
  _consignItems.forEach(function(ci) {
    if (!ci.checked) return;
    var key = ci.orderId + '_' + (ci.item.no || ci.item.model);
    var alreadyAdded = _settleRefs.some(function(r) { return (r.orderId + '_' + (r.item_no || r.item_model)) === key; });
    if (alreadyAdded) return;
    // 주문 아이템에 추가
    var itemCopy = Object.assign({}, ci.item);
    var qty = ci.selectQty || ci.remainQty;
    // 가격 조회
    var priceInfo = _getItemPrice(itemCopy);
    var price = _parsePriceVal(priceInfo.price || priceInfo.retail || 0);
    var ref = {
      orderId: ci.orderId,
      item_no: ci.item.no || '',
      item_model: ci.item.model || '',
      qty: qty,
      source: ci.source || 'order'
    };
    if (ci.docId) ref.docId = ci.docId;
    orderItems.push({
      item: itemCopy,
      qty: qty,
      _price: price,
      _settleRef: ref
    });
    // settle_ref 배열에 추가
    _settleRefs.push(Object.assign({}, ref));
    ci.checked = false;
    added++;
  });
  if (added === 0) {
    neoAlert(t('settle_none_selected'));
    return;
  }
  renderOrderItems();
  // 패널 갱신
  renderConsignBRList();
  renderConsignItems();
  renderSettleResultList(added);
}

// ── 정산 리스트 (우측 패널) ──
function renderSettleResultList(newCount) {
  var el = document.getElementById('settleResultList');
  var badge = document.getElementById('settleCountBadge');
  if (!el) return;
  var _st = function(k) { return t(k); };
  if (!_settleRefs.length) {
    el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:#9ca3af;font-size:13px;">' + _st('settle_empty_msg') + '</div>';
    if (badge) badge.textContent = '0' + _st('settle_count_suffix');
    _updateSettleResetBtn();
    return;
  }
  if (badge) badge.textContent = _settleRefs.length + _st('settle_count_suffix');
  var grandTotal = 0;
  var html = '';
  _settleRefs.forEach(function(ref, idx) {
    var isNew = newCount && idx >= _settleRefs.length - newCount;
    var oi = orderItems.find(function(o) { return o._settleRef && (o._settleRef.orderId + '_' + (o._settleRef.item_no || o._settleRef.item_model)) === (ref.orderId + '_' + (ref.item_no || ref.item_model)); });
    var name = oi ? (oi.item.name || oi.item.model || '-') : (ref.item_model || ref.item_no || '-');
    var model = oi ? (oi.item.no || oi.item.model || '') : (ref.item_no || ref.item_model || '');
    var qty = ref.qty || 1;
    var price = oi ? (oi._price || 0) : 0;
    var lineTotal = price * qty;
    grandTotal += lineTotal;
    html += '<div class="settle-result-item' + (isNew ? ' settle-slide-up' : '') + '" style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">';
    html += '<div style="display:flex;align-items:center;gap:6px;">';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:12px;font-weight:700;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + model + '</div>';
    html += '<div style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</div>';
    html += '</div>';
    html += '<div style="font-size:12px;font-weight:700;color:#059669;flex-shrink:0;">' + qty + _st('settle_unit') + '</div>';
    html += '<button onclick="removeSettleRef(' + idx + ')" style="padding:2px 6px;border:none;border-radius:4px;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;">✕</button>';
    html += '</div>';
    // 단가 입력 + 소계
    html += '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">';
    html += '<span style="font-size:10px;color:#9ca3af;white-space:nowrap;">BR: ' + (ref.orderId || '-').substring(0, 16) + '</span>';
    html += '<div style="margin-left:auto;display:flex;align-items:center;gap:4px;">';
    html += '<input type="text" inputmode="numeric" value="' + _formatSettlePrice(price) + '" onchange="_updateSettlePrice(' + idx + ',this)" onfocus="this.select()" style="width:70px;padding:2px 4px;border:1px solid #d1d5db;border-radius:4px;text-align:right;font-size:11px;font-weight:600;color:#1f2937;">';
    html += '<span style="font-size:11px;color:#6b7280;font-weight:600;white-space:nowrap;">= ฿' + lineTotal.toLocaleString() + '</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  });
  // 합계
  html += '<div style="padding:10px 12px;background:#f0fdf4;border-top:2px solid #059669;display:flex;justify-content:space-between;align-items:center;position:sticky;bottom:0;">';
  html += '<span style="font-size:12px;font-weight:700;color:#065f46;">' + _st('settle_total') + '</span>';
  html += '<span style="font-size:14px;font-weight:800;color:#059669;">฿' + grandTotal.toLocaleString() + '</span>';
  html += '</div>';
  el.innerHTML = html;
  _updateSettleResetBtn();
  _updateMobSettleFab();
}

function _formatSettlePrice(v) {
  return v ? Number(v).toLocaleString() : '0';
}

function _updateSettlePrice(idx, input) {
  var ref = _settleRefs[idx];
  if (!ref) return;
  var key = ref.orderId + '_' + (ref.item_no || ref.item_model);
  var val = _parsePriceVal(input.value);
  var oi = orderItems.find(function(o) {
    if (!o._settleRef) return false;
    return (o._settleRef.orderId + '_' + (o._settleRef.item_no || o._settleRef.item_model)) === key;
  });
  if (oi) oi._price = val;
  input.value = _formatSettlePrice(val);
  renderSettleResultList(0);
}

function removeSettleRef(idx) {
  var ref = _settleRefs[idx];
  if (!ref) return;
  var key = ref.orderId + '_' + (ref.item_no || ref.item_model);
  // orderItems에서 제거
  orderItems = orderItems.filter(function(o) {
    if (!o._settleRef) return true;
    return (o._settleRef.orderId + '_' + (o._settleRef.item_no || o._settleRef.item_model)) !== key;
  });
  _settleRefs.splice(idx, 1);
  // consignItems에서 checked 복원
  _consignItems.forEach(function(ci) {
    var ciKey = ci.orderId + '_' + (ci.item.no || ci.item.model);
    if (ciKey === key) ci.checked = false;
  });
  renderOrderItems();
  renderConsignBRList();
  renderConsignItems();
  renderSettleResultList(0);
}

function resetSettleList() {
  // 정산 리스트 전체 삭제
  orderItems = orderItems.filter(function(oi) { return !oi._settleRef; });
  _settleRefs = [];
  _consignItems.forEach(function(ci) { ci.checked = false; });
  renderOrderItems();
  renderConsignBRList();
  renderConsignItems();
  renderSettleResultList(0);
  _updateSettleResetBtn();
  document.getElementById('submitOrderBtn').disabled = !orderItems.length;
}

function _updateSettleResetBtn() {
  var btn = document.getElementById('settleResetBtn');
  if (btn) btn.style.display = _settleRefs.length ? '' : 'none';
}

// ── Step 3 정산 리스트 렌더 ──
function _renderStep3SettleList() {
  var wrap = document.getElementById('step3SettleWrap');
  var body = document.getElementById('step3SettleBody');
  var badge = document.getElementById('step3SettleBadge');
  if (!wrap || !body) return;
  var settleItems = orderItems.filter(function(o) { return !!o._settleRef; });
  if (!settleItems.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  if (badge) badge.textContent = settleItems.length + t('settle_count_suffix');
  var grandTotal = 0;
  var html = '';
  settleItems.forEach(function(o, idx) {
    var ref = o._settleRef;
    var sIdx = _settleRefs.indexOf(ref);
    if (sIdx === -1) sIdx = _settleRefs.findIndex(function(r) { return (r.orderId + '_' + (r.item_no || r.item_model)) === (ref.orderId + '_' + (ref.item_no || ref.item_model)); });
    var model = o.item.no || o.item.model || '-';
    var name = o.item.name || o.item.model || '-';
    var qty = o.qty || ref.qty || 1;
    var price = o._price || 0;
    var lineTotal = price * qty;
    grandTotal += lineTotal;
    html += '<div style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">';
    html += '<div style="display:flex;align-items:center;gap:6px;">';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:12px;font-weight:700;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + model + '</div>';
    html += '<div style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</div>';
    html += '</div>';
    html += '<div style="font-size:12px;font-weight:700;color:#059669;flex-shrink:0;">' + qty + t('settle_unit') + '</div>';
    html += '<button onclick="removeSettleRef(' + sIdx + ');_renderStep3SettleList()" style="padding:2px 6px;border:none;border-radius:4px;background:#fee2e2;color:#dc2626;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;">✕</button>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">';
    html += '<span style="font-size:10px;color:#9ca3af;white-space:nowrap;">BR: ' + (ref.orderId || '-').substring(0, 16) + '</span>';
    html += '<div style="margin-left:auto;display:flex;align-items:center;gap:4px;">';
    html += '<input type="text" inputmode="numeric" value="' + _formatSettlePrice(price) + '" onchange="_updateSettlePriceStep3(' + sIdx + ',this)" onfocus="this.select()" style="width:70px;padding:2px 4px;border:1px solid #d1d5db;border-radius:4px;text-align:right;font-size:11px;font-weight:600;color:#1f2937;">';
    html += '<span style="font-size:11px;color:#6b7280;font-weight:600;white-space:nowrap;">= ฿' + lineTotal.toLocaleString() + '</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  });
  html += '<div style="padding:10px 12px;background:#ecfdf5;border-top:2px solid #059669;display:flex;justify-content:space-between;align-items:center;">';
  html += '<span style="font-size:12px;font-weight:700;color:#065f46;">' + t('settle_total') + '</span>';
  html += '<span style="font-size:14px;font-weight:800;color:#059669;">฿' + grandTotal.toLocaleString() + '</span>';
  html += '</div>';
  body.innerHTML = html;
}

function _updateSettlePriceStep3(idx, input) {
  _updateSettlePrice(idx, input);
  _renderStep3SettleList();
}

// ── 위탁 출고 현황 조회 ─────────────────────────────────────────────────────
var _csAllData = [];      // 전체 데이터 (캐시 포함)
var _csFiltered = [];     // 필터링된 데이터
var _csPageSize = 5000;
var _csPage = 0;
var _csDataLoaded = false; // 이미 로드되었는지 여부

// IndexedDB 캐시: consignment_master 데이터를 로컬에 저장
function _csOpenIDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('consign_cache', 1);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('master')) db.createObjectStore('master', { keyPath: '_id', autoIncrement: true });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}
async function _csSaveCache(data) {
  try {
    var db = await _csOpenIDB();
    var tx = db.transaction(['master','meta'], 'readwrite');
    var store = tx.objectStore('master');
    store.clear();
    data.forEach(function(r, i) { r._id = i; store.put(r); });
    tx.objectStore('meta').put({ key: 'lastSync', ts: Date.now(), count: data.length });
    await new Promise(function(res, rej) { tx.oncomplete = res; tx.onerror = rej; });
    db.close();
  } catch(e) { console.warn('[csCache save]', e); }
}
async function _csLoadCache() {
  try {
    var db = await _csOpenIDB();
    var tx = db.transaction(['master','meta'], 'readonly');
    var metaReq = tx.objectStore('meta').get('lastSync');
    var meta = await new Promise(function(res) { metaReq.onsuccess = function() { res(metaReq.result); }; });
    if (!meta || !meta.ts) { db.close(); return null; }
    var all = [];
    var cursorReq = tx.objectStore('master').openCursor();
    await new Promise(function(res) {
      cursorReq.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) { all.push(cursor.value); cursor.continue(); }
        else res();
      };
    });
    db.close();
    return { data: all, ts: meta.ts, count: meta.count };
  } catch(e) { console.warn('[csCache load]', e); return null; }
}

// ── 데모 키트 (placeholder) ──
function openDemoRequest() { alert(t('btn_demo') + ' - ' + t('demo_dd_request') + '\n\n🚧 ' + t('demo_wip')); }
function openDemoReturn()  { alert(t('btn_demo') + ' - ' + t('demo_dd_return') + '\n\n🚧 ' + t('demo_wip')); }
function openDemoStatus()  { alert(t('btn_demo') + ' - ' + t('demo_dd_status') + '\n\n🚧 ' + t('demo_wip')); }

function openConsignStatus() {
  var ov = document.getElementById('consignStatusOverlay');
  ov.classList.add('open');
  _bringToFront(ov);
  // 최대화면으로 열기
  var csModal = ov.querySelector('.cm-modal');
  if (csModal && !csModal.classList.contains('fullscreen')) {
    var fsBtn = csModal.querySelector('.modal-btn-fs');
    if (fsBtn) modalToggleFS(fsBtn);
  }
  // 관리자만 업로드 버튼 표시
  var me = getCurrentUser();
  var isAdm = me && (HARDCODED_ADMINS.includes(me.empid) || me.role === 'admin');
  var btnUp = document.getElementById('btnCsUpload');
  if (btnUp) btnUp.style.display = isAdm ? '' : 'none';
  // 관리자 또는 영업관리 차트 버튼 표시
  var isSalesMgmt = me && me.sub_dept === '영업관리';
  var btnChart = document.getElementById('btnCsChart');
  if (btnChart) btnChart.style.display = (isAdm || isSalesMgmt) ? 'inline-flex' : 'none';
  // 영업부서: 엑셀 다운로드 숨김
  var btnExcel = document.getElementById('btnCsExcelDl');
  if (btnExcel) {
    btnExcel.style.display = (me && me.dept === 'Sales' && !isAdm) ? 'none' : '';
  }
  loadConsignStatusData();
}

function closeConsignStatus() {
  document.getElementById('consignStatusOverlay').classList.remove('open');
  document.getElementById('csMini').classList.remove('show');
}

function minimizeConsignStatus() {
  document.getElementById('consignStatusOverlay').classList.remove('open');
  document.getElementById('csMini').classList.add('show');
  _repositionMinis();
}

function restoreConsignStatus() {
  document.getElementById('csMini').classList.remove('show');
  document.getElementById('consignStatusOverlay').classList.add('open');
  _bringToFront(document.getElementById('consignStatusOverlay'));
  _repositionMinis();
}

async function loadConsignStatusData(forceRefresh) {
  var body = document.getElementById('consignStatusBody');
  // 이미 로드된 데이터가 있고 강제 새로고침이 아니면 재사용
  if (_csDataLoaded && _csAllData.length && !forceRefresh) {
    _csPage = 0;
    filterConsignStatus();
    return;
  }
  body.innerHTML = '<div style="padding:40px;text-align:center;color:#7c3aed;font-size:14px;">⏳ 데이터 조회 중...</div>';
  _csAllData = [];
  try {
    // 1) IndexedDB 캐시에서 먼저 로드 (즉시 표시)
    if (!forceRefresh) {
      var cached = await _csLoadCache();
      if (cached && cached.data.length) {
        _csAllData = cached.data;
        _csDataLoaded = true;
        _csPage = 0;
        _buildCsMonthOptions();
        filterConsignStatus();
        // 캐시가 24시간 이내면 서버 동기화 스킵
        if (Date.now() - cached.ts < 24 * 60 * 60 * 1000) return;
        // 24시간 이상이면 백그라운드에서 서버 동기화
        _csSyncFromServer();
        return;
      }
    }
    // 2) 캐시 없거나 강제 새로고침: 서버에서 전체 로드
    await _csSyncFromServer();
  } catch(e) {
    console.error('[loadConsignStatus]', e);
    if (!_csAllData.length) {
      body.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;font-size:14px;">조회 실패: ' + e.message + '</div>';
    }
  }
}

async function _csSyncFromServer() {
  var body = document.getElementById('consignStatusBody');
  var prog = document.getElementById('csUploadProgress');
  if (prog) prog.textContent = '서버 동기화 중...';
  try {
    var newData = [];
    var snap = await _fbDb.collection('consignment_master').orderBy('d', 'desc').get();
    snap.forEach(function(doc) { newData.push(doc.data()); });
    if (!newData.length && !_csAllData.length) {
      body.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:14px;">위탁 출고 마스터 데이터가 없습니다.<br>관리자가 마스터 데이터를 업로드해주세요.</div>';
      document.getElementById('csResultCount').textContent = '0';
      document.getElementById('csFooterCount').textContent = '총 0건';
      if (prog) prog.textContent = '';
      return;
    }
    _csAllData = newData;
    _csDataLoaded = true;
    _csPage = 0;
    _buildCsMonthOptions();
    filterConsignStatus();
    // IndexedDB에 캐시 저장
    _csSaveCache(newData);
    if (prog) prog.textContent = '';
  } catch(e) {
    console.error('[csSyncFromServer]', e);
    if (prog) prog.textContent = t('cs_sync_fail');
  }
}

function _buildCsMonthOptions() {
  var months = {};
  _csAllData.forEach(function(r) {
    var d = (r.d || '').substring(0, 7); // "2026-03"
    if (d && d.length === 7) months[d] = true;
  });
  var sorted = Object.keys(months).sort().reverse();
  var sel = document.getElementById('csFilterMonth');
  if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">전체 월</option>';
  sorted.forEach(function(m) {
    var parts = m.split('-');
    var label = parts[0].substring(2) + '년 ' + parseInt(parts[1]) + '월';
    sel.innerHTML += '<option value="' + m + '"' + (cur === m ? ' selected' : '') + '>' + label + '</option>';
  });
}

function filterConsignStatus() {
  var fCust = (document.getElementById('csFilterCust').value || '').trim().toUpperCase();
  var fSale = (document.getElementById('csFilterSale').value || '').trim().toUpperCase();
  var fMonth = (document.getElementById('csFilterMonth') || {}).value || '';
  var fStat = document.getElementById('csFilterStatus').value;
  // 영업 부서: 본인 닉네임 데이터만 표시
  var me = getCurrentUser();
  var isAdm = me && (HARDCODED_ADMINS.includes(me.empid) || me.role === 'admin');
  var isSales = me && (me.dept || '').toLowerCase() === 'sales' && !isAdm;
  var myNick = isSales ? (me.nickname || me.name || '').toUpperCase() : '';
  _csFiltered = _csAllData.filter(function(r) {
    if (isSales && myNick && (r.s || '').toUpperCase() !== myNick) return false;
    if (fCust && (r.c || '').toUpperCase().indexOf(fCust) < 0 && (r.n || '').toUpperCase().indexOf(fCust) < 0) return false;
    if (fSale && (r.s || '').toUpperCase().indexOf(fSale) < 0) return false;
    if (fMonth && (r.d || '').substring(0, 7) !== fMonth) return false;
    if (fStat === 'BORROW' && r.st !== 'BORROW') return false;
    if (fStat === 'SETTLED' && r.st !== 'SETTLED') return false;
    return true;
  });
  // 월간 총 수량 계산
  var totalQty = 0;
  _csFiltered.forEach(function(r) { totalQty += (parseInt(r.q) || 1); });
  document.getElementById('csResultCount').textContent = _csFiltered.length.toLocaleString();
  var footerText = t('cs_footer_total').replace('{n}', _csFiltered.length.toLocaleString());
  if (fMonth) {
    var parts = fMonth.split('-');
    var monthLabel = parts[0].substring(2) + '년 ' + parseInt(parts[1]) + '월';
    footerText += ' | ' + monthLabel + ' 출고 수량: ' + totalQty.toLocaleString() + '개';
  }
  document.getElementById('csFooterCount').textContent = footerText;
  _csPage = 0;
  renderConsignStatusPage();
}

function renderConsignStatusPage() {
  var body = document.getElementById('consignStatusBody');
  var start = 0;
  var end = Math.min((_csPage + 1) * _csPageSize, _csFiltered.length);
  var visible = _csFiltered.slice(start, end);
  if (!visible.length) {
    body.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:14px;">' + t('cs_no_data') + '</div>';
    return;
  }
  var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
  html += '<thead style="position:sticky;top:0;background:#f8fafc;z-index:1;"><tr>';
  html += '<th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:700;color:#374151;white-space:nowrap;">' + t('cs_th_date') + '</th>';
  html += '<th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:700;color:#374151;white-space:nowrap;">' + t('cs_th_br') + '</th>';
  html += '<th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:700;color:#374151;white-space:nowrap;">' + t('cs_th_cust_code') + '</th>';
  html += '<th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:700;color:#374151;">' + t('cs_th_cust_name') + '</th>';
  html += '<th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:700;color:#374151;white-space:nowrap;">' + t('cs_th_sales') + '</th>';
  html += '<th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:700;color:#374151;">' + t('cs_th_prod_code') + '</th>';
  html += '<th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e5e7eb;font-weight:700;color:#374151;">' + t('cs_th_prod_name') + '</th>';
  html += '<th style="padding:10px 8px;text-align:center;border-bottom:2px solid #e5e7eb;font-weight:700;color:#374151;">' + t('cs_th_qty') + '</th>';
  html += '<th style="padding:10px 8px;text-align:center;border-bottom:2px solid #e5e7eb;font-weight:700;color:#374151;">' + t('cs_th_status') + '</th>';
  html += '</tr></thead><tbody>';
  visible.forEach(function(r, i) {
    var bg = i % 2 === 0 ? '#fff' : '#faf5ff';
    var stBadge = r.st === 'BORROW'
      ? '<span style="background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">' + t('cs_badge_unsettled') + '</span>'
      : '<span style="background:#d1fae5;color:#065f46;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">' + t('cs_badge_settled') + '</span>';
    html += '<tr style="background:' + bg + ';">';
    html += '<td style="padding:8px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">' + (r.d || '-') + '</td>';
    html += '<td style="padding:8px;border-bottom:1px solid #f1f5f9;white-space:nowrap;font-size:12px;color:#6b7280;">' + (r.b || '-') + '</td>';
    html += '<td style="padding:8px;border-bottom:1px solid #f1f5f9;white-space:nowrap;font-weight:600;color:#5b21b6;">' + (r.c || '-') + '</td>';
    html += '<td style="padding:8px;border-bottom:1px solid #f1f5f9;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (r.n || '-') + '</td>';
    html += '<td style="padding:8px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">' + (r.s || '-') + '</td>';
    html += '<td style="padding:8px;border-bottom:1px solid #f1f5f9;font-size:12px;">' + (r.p || '-') + '</td>';
    html += '<td style="padding:8px;border-bottom:1px solid #f1f5f9;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#6b7280;">' + (r.pn || '-') + '</td>';
    html += '<td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;">' + (r.q || 1) + '</td>';
    html += '<td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:center;">' + stBadge + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  if (end < _csFiltered.length) {
    html += '<div style="padding:16px;text-align:center;"><button onclick="_csPage++;renderConsignStatusPage();" style="padding:8px 24px;border:1.5px solid #c4b5fd;border-radius:8px;background:#fff;color:#7c3aed;font-size:13px;font-weight:600;cursor:pointer;">' + t('cs_more') + ' (' + end + ' / ' + _csFiltered.length + ')</button></div>';
  }
  body.innerHTML = html;
}

function csScrollToFirst() {
  var body = document.getElementById('consignStatusBody');
  if (body) body.scrollTop = 0;
}
function csScrollToLast() {
  var body = document.getElementById('consignStatusBody');
  if (body) body.scrollTop = body.scrollHeight;
}

// ── 위탁 출고 월간 차트 ────────────────────────────────────────────────────
var _csChartInstance = null;
var _csChartTab = 'person';
var _csUserTeamMap = {};
var _csTrendUnit = 'monthly'; // 'daily', 'monthly', 'yearly'

function setCsChartTab(tab) {
  _csChartTab = tab;
  ['person','team','item','personMonthly','custTop'].forEach(function(t) {
    var btn = document.getElementById('csTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) {
      if (t === tab) {
        btn.style.background = '#7c3aed'; btn.style.color = '#fff'; btn.style.borderColor = '#7c3aed';
      } else {
        btn.style.background = '#fff'; btn.style.color = '#374151'; btn.style.borderColor = '#d1d5db';
      }
    }
  });
  // 개인 월간/고객 탭: 월 필터 숨김, 개인 드롭다운 표시 조건
  var monthSel = document.getElementById('csChartMonth');
  if (monthSel) monthSel.style.display = (tab === 'personMonthly') ? 'none' : '';
  var personSel = document.getElementById('csChartPerson');
  if (personSel) personSel.style.display = (tab === 'personMonthly' || tab === 'custTop') ? '' : 'none';
  // 기간 필터 행: personMonthly 탭에서만 표시
  var trendRow = document.getElementById('csTrendFilterRow');
  if (trendRow) trendRow.style.display = (tab === 'personMonthly') ? 'flex' : 'none';
  renderCsCharts();
}

function _setCsTrendUnit(unit) {
  _csTrendUnit = unit;
  ['daily','monthly','yearly'].forEach(function(u) {
    var btn = document.getElementById('csTrend' + u.charAt(0).toUpperCase() + u.slice(1));
    if (btn) {
      if (u === unit) { btn.style.background = '#7c3aed'; btn.style.color = '#fff'; btn.style.borderColor = '#7c3aed'; }
      else { btn.style.background = '#fff'; btn.style.color = '#374151'; btn.style.borderColor = '#d1d5db'; }
    }
  });
  renderCsCharts();
}

function _resetCsTrendFilter() {
  var f = document.getElementById('csTrendFrom');
  var t = document.getElementById('csTrendTo');
  if (f) f.value = '';
  if (t) t.value = '';
  _setCsTrendUnit('monthly');
}

async function openCsChart() {
  // Chart.js 동적 로드
  try { await loadChartJS(); } catch(e) { neoAlert('Chart 라이브러리 로딩 실패. 네트워크를 확인해 주세요.'); return; }
  var overlay = document.getElementById('csChartOverlay');
  overlay.style.display = 'flex';
  // 월 옵션 빌드
  var months = {};
  _csAllData.forEach(function(r) {
    var m = (r.d || '').substring(0, 7);
    if (m && m.length === 7) months[m] = true;
  });
  var sorted = Object.keys(months).sort().reverse();
  var sel = document.getElementById('csChartMonth');
  sel.innerHTML = '<option value="">' + (t('csc_all_period') || '전체 기간') + '</option>';
  sorted.forEach(function(m) {
    sel.innerHTML += '<option value="' + m + '">' + _cscFmtMonth(m) + '</option>';
  });
  // 현재 필터 월 기본 선택
  var curMonth = (document.getElementById('csFilterMonth') || {}).value || '';
  if (curMonth) sel.value = curMonth;
  // 사용자 팀 매핑 로드
  if (Object.keys(_csUserTeamMap).length === 0) {
    try {
      var snap = await _fbDb.collection('accounts').where('dept', '==', 'Sales').get();
      snap.forEach(function(doc) {
        var d = doc.data();
        var nick = (d.nickname || d.name || '').toUpperCase();
        if (nick) _csUserTeamMap[nick] = d.sub_dept || '미배정';
      });
    } catch(e) { console.warn('[csChart] team map load fail', e); }
  }
  _buildCsPersonDropdown();
  document.getElementById('csChartPerson').style.display = 'none';
  // 자동 전체화면
  var inner = document.getElementById('csChartInner');
  if (inner && !inner.classList.contains('cs-chart-fs')) inner.classList.add('cs-chart-fs');
  _csChartTab = 'person';
  setCsChartTab('person');
}

function _buildCsPersonDropdown() {
  var fMonth = (document.getElementById('csChartMonth') || {}).value || '';
  var includeCoverScrew = document.getElementById('csChartCoverScrew') && document.getElementById('csChartCoverScrew').checked;
  var pSel = document.getElementById('csChartPerson');
  if (!pSel) return;
  var curVal = pSel.value;
  var personQty = {};
  _csAllData.forEach(function(r) {
    if (fMonth && (r.d || '').substring(0, 7) !== fMonth) return;
    if (!includeCoverScrew && _isCoverScrew(r)) return;
    var name = r.s || '미지정';
    personQty[name] = (personQty[name] || 0) + (parseInt(r.q) || 1);
  });
  var personEntries = Object.entries(personQty).sort(function(a, b) { return b[1] - a[1]; });
  pSel.innerHTML = '<option value="">' + (t('csc_all_person') || '전체 인원') + '</option>';
  personEntries.forEach(function(e) {
    pSel.innerHTML += '<option value="' + e[0] + '"' + (curVal === e[0] ? ' selected' : '') + '>' + e[0] + ' (' + e[1].toLocaleString() + ')</option>';
  });
}

function closeCsChart() {
  // 전체화면 해제 후 닫기
  var inner = document.getElementById('csChartInner');
  if (inner && inner.classList.contains('cs-chart-fs')) inner.classList.remove('cs-chart-fs');
  document.getElementById('csChartOverlay').style.display = 'none';
  _destroyCsChart();
}

function toggleCsChartFS() {
  var inner = document.getElementById('csChartInner');
  if (!inner) return;
  inner.classList.toggle('cs-chart-fs');
  var btn = document.getElementById('btnCsChartFS');
  if (btn) btn.textContent = inner.classList.contains('cs-chart-fs') ? '⛶' : '⛶';
  // 차트 리사이즈
  setTimeout(function() { if (_csChartInstance) _csChartInstance.resize(); }, 300);
}

function _isCoverScrew(r) {
  var p = (r.p || '').toUpperCase();
  var pn = (r.pn || '').toUpperCase();
  return p.indexOf('COVER') >= 0 && p.indexOf('SCREW') >= 0 || pn.indexOf('COVER') >= 0 && pn.indexOf('SCREW') >= 0;
}

var _csChartFocusName = null;
var _csChartFocusColor = null;
function _csChartFocusPerson(chart, name) {
  if (_csChartFocusName === name) {
    // 같은 사람 다시 클릭: 전체로 복원
    _csChartFocusName = null;
    chart.data.datasets.forEach(function(ds, i) {
      ds.borderWidth = 2.5;
      ds.pointRadius = 4;
      ds.borderColor = ds._origColor;
      ds.backgroundColor = ds._origColor + '33';
      ds.fill = false;
      chart.show(i);
    });
    chart.options.plugins.title.text = t('csc_monthly_title') || '개인별 월간 출고 추이 (TOP 15)';
    chart.options.scales.y.max = undefined;
  } else {
    // 특정 사람만 강조, 나머지 숨기기 (show/hide API 사용)
    _csChartFocusName = name;
    chart.data.datasets.forEach(function(ds, i) {
      if (ds.label === name) {
        ds.borderWidth = 3.5;
        ds.pointRadius = 5;
        ds.borderColor = ds._origColor;
        ds.backgroundColor = ds._origColor + '44';
        ds.fill = true;
        chart.show(i);
      } else {
        ds.borderWidth = 0.5;
        ds.pointRadius = 0;
        ds.borderColor = ds._origColor + '15';
        ds.backgroundColor = 'transparent';
        ds.fill = false;
        chart.hide(i);
      }
    });
    chart.options.plugins.title.text = name + ' - ' + (t('csc_monthly_trend') || '월간 출고 추이');
    chart.options.scales.y.max = undefined;
  }
  // 드롭다운 동기화
  var pSel = document.getElementById('csChartPerson');
  if (pSel) pSel.value = _csChartFocusName || '';
  chart.update();
}
function _destroyCsChart() {
  _csChartFocusName = null;
  _csChartFocusColor = null;
  if (_csChartInstance) { _csChartInstance.destroy(); _csChartInstance = null; }
}
function _csChartForceResize() {
  if (!_csChartInstance) return;
  setTimeout(function() {
    if (!_csChartInstance) return;
    _csChartInstance.resize();
    _alignChartSummaryTable();
  }, 150);
}
function _alignChartSummaryTable() {
  if (!_csChartInstance) return;
  var ca = _csChartInstance.chartArea;
  if (!ca) return;
  var tbl = document.querySelector('#csChartSummary table');
  if (!tbl) return;
  var canvas = _csChartInstance.canvas;
  var canvasW = canvas.clientWidth;
  if (!canvasW) return;
  // Name 열 = chartArea.left, Total 열 = canvasW - chartArea.right, 나머지 월 열 균등
  var nameW = ca.left;
  var totalW = canvasW - ca.right;
  var rows = tbl.rows;
  for (var r = 0; r < rows.length; r++) {
    var cells = rows[r].cells;
    if (cells.length < 3) continue;
    cells[0].style.width = nameW + 'px';
    cells[0].style.minWidth = nameW + 'px';
    cells[0].style.maxWidth = nameW + 'px';
    cells[cells.length - 1].style.width = totalW + 'px';
    cells[cells.length - 1].style.minWidth = totalW + 'px';
    cells[cells.length - 1].style.maxWidth = totalW + 'px';
  }
  tbl.style.width = canvasW + 'px';
  tbl.style.tableLayout = 'fixed';
}
function renderCsCharts() {
  _buildCsPersonDropdown();
  var fMonth = (document.getElementById('csChartMonth') || {}).value || '';
  var includeCoverScrew = document.getElementById('csChartCoverScrew') && document.getElementById('csChartCoverScrew').checked;
  var data = _csAllData.filter(function(r) {
    if (fMonth && (r.d || '').substring(0, 7) !== fMonth) return false;
    if (!includeCoverScrew && _isCoverScrew(r)) return false;
    return true;
  });
  // Cover Screw 수량 표시
  var csTotal = 0, csCover = 0;
  var baseData = _csAllData.filter(function(r) { if (fMonth && (r.d || '').substring(0, 7) !== fMonth) return false; return true; });
  baseData.forEach(function(r) {
    var qty = parseInt(r.q) || 1;
    csTotal += qty;
    if (_isCoverScrew(r)) csCover += qty;
  });
  var csInfo = document.getElementById('csChartCoverScrewWrap');
  if (csInfo) {
    var infoSpan = csInfo.querySelector('.cs-cover-info');
    if (!infoSpan) { infoSpan = document.createElement('span'); infoSpan.className = 'cs-cover-info'; infoSpan.style.cssText = 'font-size:10px;color:#6b7280;margin-left:4px;'; csInfo.appendChild(infoSpan); }
    infoSpan.textContent = '(' + (t('csc_cover_info')||'CS') + ': ' + csCover.toLocaleString() + ' / ' + (t('csc_cover_ex')||'미포함') + ': ' + (csTotal - csCover).toLocaleString() + ')';
  }
  if (_csChartTab === 'person') _renderCsPersonChart(data, fMonth);
  else if (_csChartTab === 'team') _renderCsTeamChart(data, fMonth);
  else if (_csChartTab === 'personMonthly') _renderCsPersonMonthlyChart();
  else if (_csChartTab === 'custTop') _renderCsCustTopChart(data, fMonth);
  else _renderCsItemChart(data, fMonth);
}

var _cscMonthNames = {
  ko: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  th: ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
};
function _cscFmtMonth(m) {
  var parts = m.split('-');
  var lang = (window._currentLang || 'ko');
  var names = _cscMonthNames[lang] || _cscMonthNames['ko'];
  return parts[0].substring(2) + "'" + names[parseInt(parts[1]) - 1];
}
function _cscMonthLabel(fMonth) {
  if (!fMonth) return t('csc_all_period') || '전체 기간';
  return _cscFmtMonth(fMonth);
}

function _csChartColors(n) {
  var palette = ['#7c3aed','#ef4444','#f59e0b','#10b981','#3b82f6','#ec4899','#8b5cf6','#06b6d4','#f97316','#14b8a6','#6366f1','#e11d48','#84cc16','#a855f7','#0ea5e9','#d946ef','#22d3ee','#fb923c','#4ade80','#f43f5e'];
  var colors = [];
  for (var i = 0; i < n; i++) colors.push(palette[i % palette.length]);
  return colors;
}

function _renderCsPersonChart(data, fMonth) {
  var personQty = {};
  data.forEach(function(r) {
    var name = r.s || '미지정';
    personQty[name] = (personQty[name] || 0) + (parseInt(r.q) || 1);
  });
  var entries = Object.entries(personQty).sort(function(a, b) { return b[1] - a[1]; });
  var labels = entries.map(function(e) { return e[0]; });
  var values = entries.map(function(e) { return e[1]; });
  var total = values.reduce(function(a, b) { return a + b; }, 0);
  var colors = _csChartColors(labels.length);
  _destroyCsChart();
  var ctx = document.getElementById('csChartCanvas').getContext('2d');
  _csChartInstance = new Chart(ctx, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: { labels: labels, datasets: [{ label: t('csc_qty_label') || '출고 수량', data: values, backgroundColor: colors, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        title: { display: true, text: _cscMonthLabel(fMonth) + ' - ' + (t('csc_person_title') || '개인별 출고 수량'), font: { size: 15, weight: 'bold' } },
        datalabels: { anchor: 'end', align: 'top', offset: 2, color: '#4b5563', font: { size: 10, weight: '600' }, formatter: function(v) { return v > 0 ? v.toLocaleString() : ''; } }
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
  var _u = t('csc_unit') || '개'; var _pu = t('csc_person_unit') || '명';
  document.getElementById('csChartSummary').innerHTML = (t('csc_total')||'총') + ' ' + total.toLocaleString() + _u + ' | ' + labels.length + _pu + ' | ' + (t('csc_avg')||'평균') + ' ' + (labels.length ? Math.round(total / labels.length) : 0) + _u + '/' + (t('csc_person_unit')||'인');
  _csChartForceResize();
}

var _csTeamI18n = {'방콕':'sub_dept_bangkok','서부':'sub_dept_west','북부':'sub_dept_north','남부':'sub_dept_south','북동부':'sub_dept_northeast','영업관리':'sub_dept_sales_mgmt','미배정':'csc_unassigned'};
function _csTeamLabel(name) { return (_csTeamI18n[name] ? t(_csTeamI18n[name]) : '') || name; }
function _renderCsTeamChart(data, fMonth) {
  var teamQty = {};
  data.forEach(function(r) {
    var nick = (r.s || '').toUpperCase();
    var team = _csUserTeamMap[nick] || '미배정';
    teamQty[team] = (teamQty[team] || 0) + (parseInt(r.q) || 1);
  });
  var entries = Object.entries(teamQty).sort(function(a, b) { return b[1] - a[1]; });
  var labels = entries.map(function(e) { return _csTeamLabel(e[0]); });
  var values = entries.map(function(e) { return e[1]; });
  var total = values.reduce(function(a, b) { return a + b; }, 0);
  var colors = _csChartColors(labels.length);
  _destroyCsChart();
  var ctx = document.getElementById('csChartCanvas').getContext('2d');
  _csChartInstance = new Chart(ctx, {
    type: 'doughnut',
    plugins: [ChartDataLabels],
    data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 20, font: { size: 13 }, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: { enabled: false },
        title: { display: true, text: _cscMonthLabel(fMonth) + ' - ' + (t('csc_team_title') || '팀별 출고 수량'), font: { size: 15, weight: 'bold' } },
        datalabels: {
          color: '#fff',
          font: { weight: 'bold', size: 13 },
          formatter: function(value, context) {
            var pct = total > 0 ? (value / total * 100).toFixed(1) : 0;
            var label = context.chart.data.labels[context.dataIndex];
            return label + '\n' + value.toLocaleString() + (t('csc_unit')||'개') + '\n' + pct + '%';
          },
          textAlign: 'center',
          display: function(context) {
            var pct = total > 0 ? (context.dataset.data[context.dataIndex] / total * 100) : 0;
            return pct >= 3;
          }
        }
      }
    }
  });
  var _u2 = t('csc_unit') || '개';
  var summaryHtml = (t('csc_total')||'총') + ' ' + total.toLocaleString() + _u2 + '<br>';
  entries.forEach(function(e) {
    var pct = total > 0 ? (e[1] / total * 100).toFixed(1) : 0;
    summaryHtml += '<span style="font-weight:600;">' + _csTeamLabel(e[0]) + '</span>: ' + e[1].toLocaleString() + _u2 + ' (' + pct + '%) &nbsp;';
  });
  document.getElementById('csChartSummary').innerHTML = summaryHtml;
  _csChartForceResize();
}

function _renderCsItemChart(data, fMonth) {
  var itemQty = {};
  data.forEach(function(r) {
    var key = r.p || '미지정';
    itemQty[key] = (itemQty[key] || 0) + (parseInt(r.q) || 1);
  });
  var entries = Object.entries(itemQty).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 20);
  var labels = entries.map(function(e) { return e[0]; });
  var values = entries.map(function(e) { return e[1]; });
  var total = values.reduce(function(a, b) { return a + b; }, 0);
  var colors = _csChartColors(labels.length);
  _destroyCsChart();
  var ctx = document.getElementById('csChartCanvas').getContext('2d');
  _csChartInstance = new Chart(ctx, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: { labels: labels, datasets: [{ label: t('csc_qty_label') || '출고 수량', data: values, backgroundColor: colors, borderRadius: 4 }] },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 50 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        title: { display: true, text: _cscMonthLabel(fMonth) + ' - ' + (t('csc_item_title') || '아이템별 출고 TOP 20'), font: { size: 15, weight: 'bold' } },
        datalabels: { anchor: 'end', align: 'right', offset: 4, color: '#4b5563', font: { size: 11, weight: '600' }, formatter: function(v) { return v > 0 ? v.toLocaleString() : ''; } }
      },
      scales: { x: { beginAtZero: true, max: fMonth ? 500 : undefined, ticks: { precision: 0 } } }
    }
  });
  var _u3 = t('csc_unit') || '개';
  document.getElementById('csChartSummary').innerHTML = 'TOP 20 ' + (t('csc_sum')||'합계') + ': ' + total.toLocaleString() + _u3 + ' | ' + (t('csc_item_type')||'전체 아이템 종류') + ': ' + Object.keys(itemQty).length + (t('csc_type_unit')||'종');
  _csChartForceResize();
}

function _renderCsPersonMonthlyChart() {
  var includeCoverScrew = document.getElementById('csChartCoverScrew') && document.getElementById('csChartCoverScrew').checked;
  var selectedPerson = (document.getElementById('csChartPerson') || {}).value || '';
  var unit = _csTrendUnit || 'monthly';
  var dateFrom = (document.getElementById('csTrendFrom') || {}).value || '';
  var dateTo = (document.getElementById('csTrendTo') || {}).value || '';

  // 기간 키 추출 함수
  function getKey(d) {
    if (unit === 'daily') return d; // YYYY-MM-DD
    if (unit === 'yearly') return d.substring(0, 4); // YYYY
    return d.substring(0, 7); // YYYY-MM
  }

  // 데이터 집계
  var bucketPerson = {}; // { key: { name: qty } }
  var personTotal = {};
  _csAllData.forEach(function(r) {
    if (!includeCoverScrew && _isCoverScrew(r)) return;
    var d = r.d || '';
    if (d.length < 7) return;
    if (dateFrom && d < dateFrom) return;
    if (dateTo && d > dateTo) return;
    var key = getKey(d);
    var name = r.s || '미지정';
    if (selectedPerson && name !== selectedPerson) return;
    var qty = parseInt(r.q) || 1;
    if (!bucketPerson[key]) bucketPerson[key] = {};
    bucketPerson[key][name] = (bucketPerson[key][name] || 0) + qty;
    personTotal[name] = (personTotal[name] || 0) + qty;
  });

  // 기간 키 정렬
  var allKeys = Object.keys(bucketPerson).sort();
  if (!allKeys.length) {
    _destroyCsChart();
    document.getElementById('csChartSummary').innerHTML = '<div style="text-align:center;color:#9ca3af;padding:40px;">No data for selected period.</div>';
    return;
  }

  // 전체 범위 채우기 (빈 구간도 0으로)
  var keys = [];
  if (unit === 'monthly') {
    var startParts = allKeys[0].split('-'), endParts = allKeys[allKeys.length - 1].split('-');
    var sy = parseInt(startParts[0]), sm = parseInt(startParts[1]);
    var ey = parseInt(endParts[0]), em = parseInt(endParts[1]);
    for (var yy = sy; yy <= ey; yy++) {
      var ms = (yy === sy) ? sm : 1, me = (yy === ey) ? em : 12;
      for (var mmm = ms; mmm <= me; mmm++) keys.push(yy + '-' + String(mmm).padStart(2, '0'));
    }
  } else if (unit === 'yearly') {
    var sYear = parseInt(allKeys[0]), eYear = parseInt(allKeys[allKeys.length - 1]);
    for (var yr = sYear; yr <= eYear; yr++) keys.push(String(yr));
  } else {
    // daily: 데이터가 있는 날만 (빈 날 채우면 너무 많음)
    keys = allKeys;
  }

  // 개인 선택 시 데이터 범위 트림
  if (selectedPerson && keys.length > 1) {
    var fi = -1, li = -1;
    for (var ki = 0; ki < keys.length; ki++) {
      if (bucketPerson[keys[ki]] && bucketPerson[keys[ki]][selectedPerson]) {
        if (fi === -1) fi = ki;
        li = ki;
      }
    }
    if (fi !== -1) keys = keys.slice(fi, li + 1);
  }

  var topPersons = selectedPerson ? Object.keys(personTotal) :
    Object.entries(personTotal).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 15).map(function(e) { return e[0]; });

  // 라벨 포맷
  function fmtLabel(k) {
    if (unit === 'daily') { var p = k.split('-'); return p[1] + '/' + p[2]; } // MM/DD
    if (unit === 'yearly') return k;
    return _cscFmtMonth(k);
  }
  var labels = keys.map(fmtLabel);
  var isSingle = !!selectedPerson;
  var colors = _csChartColors(Math.max(topPersons.length, 1));
  var datasets;
  if (isSingle) {
    var c = _csChartFocusColor || colors[0];
    var data = keys.map(function(k) { return (bucketPerson[k] && bucketPerson[k][selectedPerson]) || 0; });
    datasets = [{ label: selectedPerson, data: data, borderColor: c, backgroundColor: c, borderRadius: 4 }];
  } else {
    var totalData = keys.map(function(k) {
      var sum = 0;
      if (bucketPerson[k]) Object.keys(bucketPerson[k]).forEach(function(n) { sum += bucketPerson[k][n]; });
      return sum;
    });
    datasets = [{ label: t('csc_total') || '전체 합계', data: totalData, borderColor: '#7c3aed', backgroundColor: '#7c3aed', borderRadius: 4 }];
  }

  var unitLabel = unit === 'daily' ? 'Daily' : unit === 'yearly' ? 'Yearly' : 'Monthly';
  var titleText = selectedPerson
    ? selectedPerson + ' - ' + unitLabel + ' Shipment Trend'
    : unitLabel + ' Shipment Trend (TOP 15)';

  _destroyCsChart();
  var ctx = document.getElementById('csChartCanvas').getContext('2d');
  _csChartInstance = new Chart(ctx, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { onComplete: function() { _alignChartSummaryTable(); } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        title: { display: true, text: titleText, font: { size: 15, weight: 'bold' } },
        tooltip: { enabled: true, mode: 'index', intersect: false },
        datalabels: {
          anchor: 'end', align: 'top', offset: 2,
          color: '#4b5563',
          font: function() { return { size: unit === 'yearly' ? 20 : 10, weight: '600' }; },
          display: function(ctx) { return keys.length <= 60; },
          formatter: function(v) { return v > 0 ? v.toLocaleString() : ''; }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { ticks: { font: { size: unit === 'daily' ? 8 : (unit === 'yearly' ? 14 : 9) }, autoSkip: unit === 'daily', maxRotation: unit === 'yearly' ? 0 : 90, minRotation: unit === 'yearly' ? 0 : 45 } }
      }
    }
  });

  // 요약 테이블
  var total = Object.values(personTotal).reduce(function(a, b) { return a + b; }, 0);
  var summaryHtml = 'Total: ' + total.toLocaleString() + 'pcs | ' + topPersons.length + 'persons | Avg ' + Math.round(total / topPersons.length) + 'pcs/persons<br>';
  if (keys.length <= 100) {
    summaryHtml += '<div style="overflow-x:auto;"><table style="margin-top:8px;border-collapse:collapse;font-size:12px;width:100%;"><tr style="background:#f8fafc;">';
    summaryHtml += '<th style="padding:4px 8px;border:1px solid #e5e7eb;text-align:left;">' + (t('csc_name') || '이름') + '</th>';
    keys.forEach(function(k) {
      summaryHtml += '<th style="padding:4px 6px;border:1px solid #e5e7eb;text-align:center;white-space:nowrap;">' + fmtLabel(k) + '</th>';
    });
    summaryHtml += '<th style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:700;">' + (t('csc_sum') || '합계') + '</th></tr>';
    topPersons.forEach(function(name, i) {
      var rowTotal = 0;
      summaryHtml += '<tr style="background:' + (i % 2 === 0 ? '#fff' : '#faf5ff') + ';"><td style="padding:3px 8px;border:1px solid #e5e7eb;font-weight:600;color:' + colors[i] + ';">' + name + '</td>';
      keys.forEach(function(k) {
        var v = (bucketPerson[k] && bucketPerson[k][name]) || 0;
        rowTotal += v;
        summaryHtml += '<td style="padding:3px 6px;border:1px solid #e5e7eb;text-align:center;">' + (v > 0 ? v.toLocaleString() : '-') + '</td>';
      });
      summaryHtml += '<td style="padding:3px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:700;">' + rowTotal.toLocaleString() + '</td></tr>';
    });
    summaryHtml += '</table></div>';
  }
  document.getElementById('csChartSummary').innerHTML = summaryHtml;
  _csChartForceResize();
}

function _renderCsCustTopChart(data, fMonth) {
  var selectedPerson = (document.getElementById('csChartPerson') || {}).value || '';
  // 영업 개인 필터 적용
  var filtered = selectedPerson ? data.filter(function(r) { return (r.s || '') === selectedPerson; }) : data;
  // 고객별 집계 (코드+이름)
  var custQty = {};
  var custName = {};
  filtered.forEach(function(r) {
    var code = r.c || '미지정';
    custQty[code] = (custQty[code] || 0) + (parseInt(r.q) || 1);
    if (!custName[code] && r.n) custName[code] = r.n;
  });
  var entries = Object.entries(custQty).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
  var labels = entries.map(function(e) { var n = custName[e[0]] || ''; return n ? e[0] + ' ' + n : e[0]; });
  var values = entries.map(function(e) { return e[1]; });
  var total = values.reduce(function(a, b) { return a + b; }, 0);
  var filteredTotal = 0;
  filtered.forEach(function(r) { filteredTotal += (parseInt(r.q) || 1); });
  var colors = _csChartColors(labels.length);
  var titleText = _cscMonthLabel(fMonth);
  if (selectedPerson) titleText += ' | ' + selectedPerson;
  titleText += ' - ' + (t('csc_cust_title') || '고객별 출고 TOP 10');
  _destroyCsChart();
  var ctx = document.getElementById('csChartCanvas').getContext('2d');
  _csChartInstance = new Chart(ctx, {
    type: 'bar',
    plugins: [ChartDataLabels],
    data: { labels: labels, datasets: [{ label: t('csc_qty_label') || '출고 수량', data: values, backgroundColor: colors, borderRadius: 6 }] },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 50 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        title: { display: true, text: titleText, font: { size: 15, weight: 'bold' } },
        datalabels: { anchor: 'end', align: 'right', offset: 4, color: '#4b5563', font: { size: 11, weight: '600' }, formatter: function(v) { return v > 0 ? v.toLocaleString() : ''; } }
      },
      scales: { x: { beginAtZero: true, max: fMonth ? 1500 : undefined, ticks: { precision: 0 } } }
    }
  });
  var pct = filteredTotal > 0 ? (total / filteredTotal * 100).toFixed(1) : 0;
  var _u4 = t('csc_unit') || '개';
  var summaryHtml = 'TOP 10 ' + (t('csc_sum')||'합계') + ': ' + total.toLocaleString() + _u4 + ' (' + (t('csc_total')||'전체') + ' ' + filteredTotal.toLocaleString() + _u4 + ' ' + pct + '%)';
  summaryHtml += '<table style="margin-top:8px;border-collapse:collapse;font-size:12px;width:100%;"><tr style="background:#f8fafc;">';
  summaryHtml += '<th style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;">순위</th>';
  summaryHtml += '<th style="padding:5px 8px;border:1px solid #e5e7eb;text-align:left;">고객코드</th>';
  summaryHtml += '<th style="padding:5px 8px;border:1px solid #e5e7eb;text-align:left;">고객명</th>';
  summaryHtml += '<th style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;">수량</th>';
  summaryHtml += '<th style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center;">비율</th></tr>';
  entries.forEach(function(e, i) {
    var ePct = filteredTotal > 0 ? (e[1] / filteredTotal * 100).toFixed(1) : 0;
    summaryHtml += '<tr style="background:' + (i % 2 === 0 ? '#fff' : '#faf5ff') + ';">';
    summaryHtml += '<td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:700;color:' + colors[i] + ';">' + (i + 1) + '</td>';
    summaryHtml += '<td style="padding:4px 8px;border:1px solid #e5e7eb;">' + e[0] + '</td>';
    summaryHtml += '<td style="padding:4px 8px;border:1px solid #e5e7eb;">' + (custName[e[0]] || '-') + '</td>';
    summaryHtml += '<td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center;font-weight:600;">' + e[1].toLocaleString() + '</td>';
    summaryHtml += '<td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center;">' + ePct + '%</td></tr>';
  });
  summaryHtml += '</table>';
  document.getElementById('csChartSummary').innerHTML = summaryHtml;
  _csChartForceResize();
}

