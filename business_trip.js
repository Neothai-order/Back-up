// ─── Business Trip ────────────────────────────────────────────────
// 출장 신청 (가불 / 정산) — Firestore: businessTrips 컬렉션
// 작성: 2026-04-27

var _btMe = null;
var _btCustomers = [];          // 고객 검색 캐시 (lazy load)
var _btCustomersLoaded = false;
var _btSelectedCustomer = null; // {erp, clinic, name}
var _btTab = 'form';
var _btCustSearchTimer = null;
var _btPlacesAutocomplete = null;

// ── 인증 대기 ──────────────────────────────────────────────────────
function _btWaitAuth(timeoutMs) {
  return new Promise(function(resolve) {
    try {
      if (firebase.auth && firebase.auth().currentUser) { resolve(firebase.auth().currentUser); return; }
      var done = false;
      var unsub = firebase.auth().onAuthStateChanged(function(u) {
        if (done) return; done = true;
        try { unsub(); } catch(e){}
        resolve(u || null);
      });
      setTimeout(function() {
        if (done) return; done = true;
        try { unsub(); } catch(e){}
        resolve(firebase.auth().currentUser || null);
      }, timeoutMs || 5000);
    } catch(e) { resolve(null); }
  });
}

// ── 사용자 정보 fetch ─────────────────────────────────────────────
async function _btLoadUser() {
  var fbUser = await _btWaitAuth();
  if (!fbUser) {
    showToast(_btT('bt_auth_required') || '로그인이 필요합니다.');
    setTimeout(function(){ location.href = 'index.html'; }, 1500);
    return null;
  }
  // accounts 컬렉션에서 본인 정보
  try {
    var snap = await _fbDb.collection('accounts').where('email','==', fbUser.email).limit(1).get();
    if (!snap.empty) {
      var d = snap.docs[0]; _btMe = Object.assign({ _id: d.id }, d.data());
    } else {
      _btMe = { email: fbUser.email, name: fbUser.displayName || '', empid: '', dept: '' };
    }
  } catch(e) {
    console.warn('[BT] accounts fetch failed:', e);
    _btMe = { email: fbUser.email, name: fbUser.displayName || '' };
  }
  return _btMe;
}

// ── i18n helper ───────────────────────────────────────────────────
function _btT(key) {
  if (typeof window.t === 'function') return window.t(key);
  if (typeof LANG !== 'undefined' && typeof currentLang !== 'undefined') {
    var L = LANG[currentLang] || {};
    return L[key] || key;
  }
  return key;
}

// ── 토스트 / 알림 ─────────────────────────────────────────────────
function showToast(msg) {
  var c = document.getElementById('toastContainer');
  if (!c) return;
  var d = document.createElement('div');
  d.textContent = msg;
  d.style.cssText = 'background:#1e293b;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;pointer-events:auto;box-shadow:0 4px 12px rgba(0,0,0,.2);';
  c.appendChild(d);
  setTimeout(function(){ d.style.opacity='0'; d.style.transition='opacity .3s'; setTimeout(function(){ d.remove(); },300); }, 2500);
}
function neoAlert(msg) {
  var ov = document.getElementById('neoAlertOverlay');
  document.getElementById('neoAlertMsg').textContent = msg;
  if (ov) ov.style.display = 'flex';
}

// ── Document No 생성 ──────────────────────────────────────────────
function _btGenDocNo(mode) {
  // BT-{ADV|STL}-YYMMDD-001 (서버 시퀀스는 제출 시 재생성)
  var d = new Date();
  var yy = String(d.getFullYear()).slice(2);
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  var modePart = (mode === 'settlement') ? 'STL' : 'ADV';
  var rand = Math.floor(Math.random() * 999) + 1;
  return 'BT-' + modePart + '-' + yy + mm + dd + '-' + String(rand).padStart(3, '0');
}

// ── 합계 계산 ────────────────────────────────────────────────────
function _btCalcTotal() {
  var ids = ['btAmtHotel','btAmtService','btAmtAirfare','btAmtGasoline','btAmtAllowance','btAmtOthers'];
  var total = 0;
  ids.forEach(function(id){
    var v = parseFloat((document.getElementById(id) || {}).value || 0);
    if (!isNaN(v)) total += v;
  });
  document.getElementById('btTotal').textContent = total.toLocaleString();
}

// ── 폼 초기화 ────────────────────────────────────────────────────
function _btResetForm() {
  ['btAmtHotel','btAmtService','btAmtAirfare','btAmtGasoline','btAmtAllowance','btAmtOthers'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = 0;
  });
  ['btVisitPlace','btCustomerSearch','btAttendees','btPurpose','btRemark'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '';
  });
  _btSelectedCustomer = null;
  document.querySelector('input[name=bt_mode][value=advance]').checked = true;
  document.getElementById('btDocNo').value = _btGenDocNo('advance');
  _btSetDefaultDates();
  _btCalcTotal();
}

function _btSetDefaultDates() {
  var t = new Date();
  var iso = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
  var docDateEl = document.getElementById('btDocDate'); if (docDateEl && !docDateEl.value) docDateEl.value = iso;
  var fromEl = document.getElementById('btTripFrom'); if (fromEl && !fromEl.value) fromEl.value = iso;
  var toEl = document.getElementById('btTripTo'); if (toEl && !toEl.value) toEl.value = iso;
}

// ── 모드 변경 시 Document No 재생성 ───────────────────────────────
function _btBindModeChange() {
  document.querySelectorAll('input[name=bt_mode]').forEach(function(r){
    r.addEventListener('change', function() {
      document.getElementById('btDocNo').value = _btGenDocNo(r.value);
    });
  });
}

// ── 고객 검색 (lazy load + 디바운스) ──────────────────────────────
async function _btLoadCustomers() {
  if (_btCustomersLoaded) return _btCustomers;
  try {
    var snap = await _fbDb.collection('customers').limit(5000).get();
    _btCustomers = snap.docs.map(function(d){
      var x = d.data();
      return {
        erp: x.erp || d.id,
        clinic: x.clinic || x.cust_name || '',
        name_th: x.name_th || '',
        name_en: x.name_en || '',
        province: x.province || '',
        addr_reg: x.addr_reg || x.address || ''
      };
    });
    _btCustomersLoaded = true;
  } catch(e) {
    console.warn('[BT] customers fetch failed:', e);
  }
  return _btCustomers;
}

function _btBindCustomerSearch() {
  var input = document.getElementById('btCustomerSearch');
  var list = document.getElementById('btCustList');
  if (!input || !list) return;
  input.addEventListener('input', function() {
    if (_btCustSearchTimer) clearTimeout(_btCustSearchTimer);
    _btCustSearchTimer = setTimeout(function(){ _btDoCustSearch(input.value); }, 200);
  });
  input.addEventListener('focus', function() {
    if (input.value.trim()) _btDoCustSearch(input.value);
  });
  document.addEventListener('click', function(e) {
    if (e.target !== input && !list.contains(e.target)) list.style.display = 'none';
  });
}

async function _btDoCustSearch(q) {
  var list = document.getElementById('btCustList');
  if (!list) return;
  q = (q || '').toLowerCase().trim();
  if (!q) { list.style.display = 'none'; return; }
  await _btLoadCustomers();
  var matches = _btCustomers.filter(function(c){
    var hay = ((c.erp||'') + ' ' + (c.clinic||'') + ' ' + (c.name_th||'') + ' ' + (c.name_en||'')).toLowerCase();
    return hay.indexOf(q) !== -1;
  }).slice(0, 30);
  if (!matches.length) {
    list.innerHTML = '<div class="bt-search-item" style="color:#94a3b8;cursor:default;">' + (_btT('bt_no_cust') || '검색 결과 없음') + '</div>';
    list.style.display = 'block';
    return;
  }
  list.innerHTML = matches.map(function(c){
    var safe = function(s){ return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
    return '<div class="bt-search-item" data-erp="' + safe(c.erp) + '">' +
      '<div style="font-weight:700;color:#0f766e;">' + safe(c.erp) + '</div>' +
      '<div style="font-size:12px;color:#475569;">' + safe(c.clinic || c.name_en || c.name_th) + '</div>' +
      (c.province ? '<div style="font-size:11px;color:#94a3b8;">📍 ' + safe(c.province) + '</div>' : '') +
    '</div>';
  }).join('');
  list.style.display = 'block';
  list.querySelectorAll('.bt-search-item[data-erp]').forEach(function(el){
    el.addEventListener('click', function() {
      var erp = el.getAttribute('data-erp');
      var c = _btCustomers.find(function(x){ return x.erp === erp; });
      if (!c) return;
      _btSelectedCustomer = c;
      document.getElementById('btCustomerSearch').value = c.erp + ' · ' + (c.clinic || c.name_en || c.name_th);
      list.style.display = 'none';
    });
  });
}

// ── Google Places (방문 장소) ─────────────────────────────────────
function _btAttachPlaces() {
  if (!window.google || !google.maps || !google.maps.places) return setTimeout(_btAttachPlaces, 500);
  var input = document.getElementById('btVisitPlace');
  if (!input || input._gPlacesAttached) return;
  input._gPlacesAttached = true;
  try {
    _btPlacesAutocomplete = new google.maps.places.Autocomplete(input, {
      types: ['establishment', 'geocode'],
      componentRestrictions: { country: 'th' },
      fields: ['formatted_address', 'name', 'address_components', 'geometry']
    });
    _btPlacesAutocomplete.addListener('place_changed', function() {
      var p = _btPlacesAutocomplete.getPlace();
      if (!p) return;
      var addr = p.formatted_address || '';
      var name = p.name || '';
      var full = addr;
      if (name && addr && !addr.startsWith(name)) full = name + ', ' + addr;
      else if (!addr && name) full = name;
      input.value = full;
    });
  } catch(e) { console.warn('[BT] places attach failed:', e); }
}

// ── 폼 제출 ──────────────────────────────────────────────────────
async function _btSubmit() {
  if (!_btMe) { neoAlert(_btT('bt_auth_required') || '로그인이 필요합니다.'); return; }
  var mode = (document.querySelector('input[name=bt_mode]:checked') || {}).value || 'advance';
  var docDate = document.getElementById('btDocDate').value;
  var tripFrom = document.getElementById('btTripFrom').value;
  var tripTo = document.getElementById('btTripTo').value;
  var visitPlace = document.getElementById('btVisitPlace').value.trim();
  var attendees = document.getElementById('btAttendees').value.trim();
  var purpose = document.getElementById('btPurpose').value.trim();
  var remark = document.getElementById('btRemark').value.trim();

  if (!tripFrom || !tripTo) { neoAlert(_btT('bt_err_dates') || '출장 기간을 입력해주세요.'); return; }
  if (!visitPlace) { neoAlert(_btT('bt_err_place') || '방문 장소를 입력해주세요.'); return; }
  if (!purpose) { neoAlert(_btT('bt_err_purpose') || '목적을 입력해주세요.'); return; }

  var amounts = {
    hotel:    parseFloat(document.getElementById('btAmtHotel').value || 0) || 0,
    service:  parseFloat(document.getElementById('btAmtService').value || 0) || 0,
    airfare:  parseFloat(document.getElementById('btAmtAirfare').value || 0) || 0,
    gasoline: parseFloat(document.getElementById('btAmtGasoline').value || 0) || 0,
    allowance:parseFloat(document.getElementById('btAmtAllowance').value || 0) || 0,
    others:   parseFloat(document.getElementById('btAmtOthers').value || 0) || 0
  };
  var total = Object.values(amounts).reduce(function(a,b){ return a+b; }, 0);

  var docNo = document.getElementById('btDocNo').value || _btGenDocNo(mode);

  var record = {
    doc_no: docNo,
    mode: mode,
    applicant_id: _btMe.empid || _btMe._id || '',
    applicant_name: _btMe.name || _btMe.nickname || '',
    applicant_dept: _btMe.dept || '',
    applicant_sub_dept: _btMe.sub_dept || '',
    applicant_email: _btMe.email || '',
    doc_date: docDate || null,
    trip_from: tripFrom,
    trip_to: tripTo,
    visit_place: visitPlace,
    customer_erp: _btSelectedCustomer ? _btSelectedCustomer.erp : '',
    customer_name: _btSelectedCustomer ? (_btSelectedCustomer.clinic || _btSelectedCustomer.name_en || _btSelectedCustomer.name_th) : '',
    attendees: attendees,
    purpose: purpose,
    remark: remark,
    amounts: amounts,
    total: total,
    status: 'submitted',
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    var ref = await _fbDb.collection('businessTrips').add(record);
    showToast('✅ ' + (_btT('bt_submitted') || '제출되었습니다.') + ' (' + docNo + ')');
    _btResetForm();
    // 목록 탭으로 자동 전환
    setTimeout(function(){ _btSwitchTab('list'); }, 600);
  } catch(e) {
    console.error('[BT] submit failed:', e);
    neoAlert((_btT('bt_submit_fail') || '제출 실패') + ': ' + (e.message || e));
  }
}

// ── 탭 전환 ──────────────────────────────────────────────────────
function _btSwitchTab(tab) {
  _btTab = tab;
  document.getElementById('btTabForm').classList.toggle('active', tab === 'form');
  document.getElementById('btTabList').classList.toggle('active', tab === 'list');
  document.getElementById('btFormPanel').style.display = tab === 'form' ? '' : 'none';
  document.getElementById('btListPanel').style.display = tab === 'list' ? '' : 'none';
  if (tab === 'list') _btLoadList();
}

// ── 목록 조회 ────────────────────────────────────────────────────
async function _btLoadList() {
  var body = document.getElementById('btListBody');
  if (!body) return;
  body.innerHTML = '<div class="bt-empty">' + (_btT('bt_loading') || '로딩 중...') + '</div>';
  if (!_btMe) { body.innerHTML = '<div class="bt-empty">' + (_btT('bt_auth_required') || '로그인이 필요합니다.') + '</div>'; return; }
  try {
    var key = _btMe.empid || _btMe._id || _btMe.email;
    var snap = await _fbDb.collection('businessTrips')
      .where('applicant_email', '==', _btMe.email || '')
      .orderBy('created_at', 'desc')
      .limit(50)
      .get()
      .catch(async function() {
        // 인덱스 없을 경우: orderBy 빼고 클라이언트 정렬
        var s = await _fbDb.collection('businessTrips')
          .where('applicant_email', '==', _btMe.email || '')
          .limit(50).get();
        return s;
      });
    var docs = [];
    snap.forEach(function(d){ docs.push(Object.assign({ _id: d.id }, d.data())); });
    docs.sort(function(a,b){
      var ta = a.created_at && a.created_at.toMillis ? a.created_at.toMillis() : 0;
      var tb = b.created_at && b.created_at.toMillis ? b.created_at.toMillis() : 0;
      return tb - ta;
    });
    if (!docs.length) {
      body.innerHTML = '<div class="bt-empty">📭 ' + (_btT('bt_list_empty') || '아직 신청 내역이 없습니다.') + '</div>';
      return;
    }
    body.innerHTML = docs.map(function(d){
      var modeLabel = d.mode === 'settlement' ? (_btT('bt_mode_settlement') || '정산') : (_btT('bt_mode_advance') || '가불');
      var modeClass = d.mode === 'settlement' ? 'bt-status-settlement' : 'bt-status-advance';
      var totalStr = (d.total != null ? d.total : 0).toLocaleString() + ' Baht';
      var dateStr = (d.trip_from || '') + ' ~ ' + (d.trip_to || '');
      var place = d.visit_place || '';
      var cust = d.customer_name || '';
      return '<div class="bt-list-item">' +
        '<div class="bt-list-row">' +
          '<div>' +
            '<span class="bt-status-badge ' + modeClass + '">' + modeLabel + '</span>' +
            ' <span style="font-weight:700;font-size:13px;color:#0f766e;">' + (d.doc_no || '-') + '</span>' +
          '</div>' +
          '<span class="bt-list-amount">' + totalStr + '</span>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:13px;color:#1e293b;">📍 ' + (place || '-') + (cust ? ' · 🏥 ' + cust : '') + '</div>' +
        '<div style="margin-top:4px;font-size:12px;color:#64748b;">📅 ' + dateStr + (d.purpose ? ' · ' + d.purpose : '') + '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    console.error('[BT] list fetch failed:', e);
    body.innerHTML = '<div class="bt-empty">⚠️ ' + (_btT('bt_list_fail') || '조회 실패') + '</div>';
  }
}

// ── 초기화 ──────────────────────────────────────────────────────
(async function _btInit() {
  // DOM ready 보장
  if (document.readyState === 'loading') {
    await new Promise(function(r){ document.addEventListener('DOMContentLoaded', r); });
  }
  await _btLoadUser();
  if (!_btMe) return;
  document.getElementById('btApplicant').value =
    (_btMe.name || _btMe.nickname || '') + (_btMe.empid ? ' (' + _btMe.empid + ')' : '');
  document.getElementById('btDocNo').value = _btGenDocNo('advance');
  _btSetDefaultDates();
  _btCalcTotal();
  _btBindModeChange();
  _btBindCustomerSearch();
  _btAttachPlaces();
  if (typeof applyLang === 'function') applyLang();
})();
