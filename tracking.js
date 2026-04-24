// Neo Sales App - MyTracking (auto-separated)
function openMyTracking() {
  var ov = document.getElementById('myTrackingOverlay');
  if (ov) ov.classList.add('open');
  _loadMyTracking();
}
function closeMyTracking() {
  var ov = document.getElementById('myTrackingOverlay');
  if (ov) ov.classList.remove('open');
}

async function _loadMyTracking() {
  var body = document.getElementById('myTrackingBody');
  var user = getCurrentUser();
  if (!user) { body.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">' + t('msg_login_required') + '</div>'; return; }
  body.innerHTML = '<div style="text-align:center;padding:40px 0;color:#9ca3af;">⏳ ' + t('mt_loading') + '</div>';

  var empid = user.empid || '';
  var uName = (user.name || '').toLowerCase();
  var uNick = (user.nickname || '').toLowerCase();
  var html = '';

  try {
    // 서버 사이드 필터링으로 3개 컬렉션 병렬 로드 (읽기 수 90%+ 감소)
    // 기존: 전체 컬렉션 .get() 후 JS 필터 → 수만 건 읽음
    // 개선: where 절로 본인 문서만 서버에서 필터 → 수 건 ~ 수십 건만 읽음
    var _emptySnap = { docs: [] };
    var _results = await Promise.all([
      empid ? _fbDb.collection('pendingCustomers').where('created_by', '==', empid).get().catch(function(){ return _emptySnap; }) : Promise.resolve(_emptySnap),
      empid ? _fbDb.collection('pendingCustomers').where('reg_by', '==', empid).get().catch(function(){ return _emptySnap; }) : Promise.resolve(_emptySnap),
      empid ? _fbDb.collection('orders').where('user_empid', '==', empid).get().catch(function(){ return _emptySnap; }) : Promise.resolve(_emptySnap),
      uName ? _fbDb.collection('orders').where('user', '==', user.name || '').get().catch(function(){ return _emptySnap; }) : Promise.resolve(_emptySnap),
      empid ? _fbDb.collection('quotes').where('requested_by', '==', empid).get().catch(function(){ return _emptySnap; }) : Promise.resolve(_emptySnap)
    ]);
    var custSnapA = _results[0], custSnapB = _results[1];
    var orderSnapA = _results[2], orderSnapB = _results[3];
    var quoteSnap = _results[4];

    // 1) 고객 등록 현황 (pendingCustomers) — created_by / reg_by 두 쿼리 병합 후 중복 제거
    var _custSeen = {};
    var myCusts = [];
    function _pushCust(docs) {
      docs.forEach(function(d){
        var c = d.data();
        var key = d.id || ((c.name_en||'') + '|' + (c.created_at||''));
        if (_custSeen[key]) return;
        _custSeen[key] = 1;
        myCusts.push(c);
      });
    }
    _pushCust(custSnapA.docs || []);
    _pushCust(custSnapB.docs || []);
    myCusts.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

    html += '<div class="mt-section">';
    html += '<div class="mt-section-title">👤 ' + t('mt_cust_reg') + ' <span class="mt-count">' + myCusts.length + '</span></div>';
    if (myCusts.length) {
      myCusts.forEach(function(c) {
        var st = c.status || 'Pending';
        var stColor = st === 'Approved' ? '#16a34a' : st === 'Rejected' ? '#ef4444' : '#f59e0b';
        html += '<div class="mt-card">' +
          '<div class="mt-card-top"><span class="mt-card-name">' + escHtml(c.name_en || c.name_th || '-') + '</span>' +
          '<span class="mt-status" style="color:' + stColor + ';">' + st + '</span></div>' +
          '<div class="mt-card-sub">' + escHtml(c.clinic || '') + (c.created_at ? ' · ' + String(c.created_at).slice(0,10) : '') + '</div>' +
        '</div>';
      });
    } else {
      html += '<div class="mt-empty">' + t('mt_no_data') + '</div>';
    }
    html += '</div>';

    // 2) 주문 현황 — user_empid / user(name) 두 쿼리 병합
    var _orderSeen = {};
    var myOrders = [];
    function _pushOrder(docs) {
      docs.forEach(function(d){
        var o = d.data();
        var key = o.id || d.id;
        if (_orderSeen[key]) return;
        _orderSeen[key] = 1;
        myOrders.push(o);
      });
    }
    _pushOrder(orderSnapA.docs || []);
    _pushOrder(orderSnapB.docs || []);
    myOrders.sort(function(a,b){ return (b.id||0) - (a.id||0); });
    myOrders = myOrders.slice(0, 30);

    html += '<div class="mt-section">';
    html += '<div class="mt-section-title">📦 ' + t('mt_orders') + ' <span class="mt-count">' + myOrders.length + '</span></div>';
    if (myOrders.length) {
      myOrders.forEach(function(o) {
        var st = o.status || 'pending';
        var stMap = { pending:'#f59e0b', approved:'#2563eb', completed:'#16a34a', shipped:'#16a34a', cancelled:'#ef4444', cancel_requested:'#ef4444' };
        var stLabel = { pending:t('mt_st_pending'), approved:t('mt_st_approved'), completed:t('mt_st_completed'), shipped:t('mt_st_shipped'), cancelled:t('mt_st_cancelled'), cancel_requested:t('mt_st_cancel_req') };
        html += '<div class="mt-card">' +
          '<div class="mt-card-top"><span class="mt-card-name">' + escHtml(o.customer_name || '-') + '</span>' +
          '<span class="mt-status" style="color:' + (stMap[st]||'#6b7280') + ';">' + (stLabel[st]||st) + '</span></div>' +
          '<div class="mt-card-sub">' + escHtml(o.customer_clinic || '') + ' · ' + (o.date || '').slice(0,10) + '</div>' +
        '</div>';
      });
    } else {
      html += '<div class="mt-empty">' + t('mt_no_data') + '</div>';
    }
    html += '</div>';

    // 3) 견적 현황 (이미 서버에서 requested_by 필터됨)
    var myQuotes = (quoteSnap.docs || []).map(function(d){ return d.data(); })
      .sort(function(a,b){ return (b.id||'').localeCompare(a.id||''); }).slice(0, 20);

    html += '<div class="mt-section">';
    html += '<div class="mt-section-title">📋 ' + t('mt_quotes') + ' <span class="mt-count">' + myQuotes.length + '</span></div>';
    if (myQuotes.length) {
      myQuotes.forEach(function(q) {
        var st = q.status || 'pending';
        var stColor = st === 'approved' ? '#16a34a' : st === 'rejected' ? '#ef4444' : '#f59e0b';
        html += '<div class="mt-card">' +
          '<div class="mt-card-top"><span class="mt-card-name">' + escHtml(q.customer_name || '-') + '</span>' +
          '<span class="mt-status" style="color:' + stColor + ';">' + st + '</span></div>' +
          '<div class="mt-card-sub">' + (q.id || '') + ' · ' + (q.date || '').slice(0,10) + '</div>' +
        '</div>';
      });
    } else {
      html += '<div class="mt-empty">' + t('mt_no_data') + '</div>';
    }
    html += '</div>';

    body.innerHTML = html;
  } catch(e) {
    console.error('[MyTracking] error:', e);
    body.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">❌ ' + e.message + '</div>';
  }
}
