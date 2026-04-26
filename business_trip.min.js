// ─── Business Trip ────────────────────────────────────────────────
// 출장 신청 (가불 / 정산) — Firestore: businessTrips 컬렉션
// 작성: 2026-04-27 / v3 — 출발/도착지 + 지도 + Excel/PDF

var GMAPS_KEY = 'AIzaSyBDU8EH41NWBx74v7uMKmFpEfvCyLN19zw';

var _btMe = null;
var _btCustomers = [];
var _btCustomersLoaded = false;
var _btSelectedCustomer = null;
var _btTab = 'form';
var _btCustSearchTimer = null;
var _btDepAuto = null, _btArrAuto = null;

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
      }, timeoutMs || 6000);
    } catch(e) { resolve(null); }
  });
}

async function _btLoadUser() {
  var fbUser = await _btWaitAuth();
  if (!fbUser) {
    showToast(_btT('bt_auth_required') || '로그인이 필요합니다.');
    setTimeout(function(){ location.href = 'index.html'; }, 1500);
    return null;
  }
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

function _btT(key) {
  if (typeof window.t === 'function') return window.t(key);
  if (typeof LANG !== 'undefined' && typeof currentLang !== 'undefined') {
    var L = LANG[currentLang] || {};
    return L[key] || key;
  }
  return key;
}

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
  var d = new Date();
  var yy = String(d.getFullYear()).slice(2);
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  var modePart = (mode === 'settlement') ? 'STL' : 'ADV';
  var rand = Math.floor(Math.random() * 999) + 1;
  return 'BT-' + modePart + '-' + yy + mm + dd + '-' + String(rand).padStart(3, '0');
}

function _btCalcTotal() {
  var ids = ['btAmtHotel','btAmtService','btAmtAirfare','btAmtGasoline','btAmtAllowance','btAmtOthers'];
  var total = 0;
  ids.forEach(function(id){
    var v = parseFloat((document.getElementById(id) || {}).value || 0);
    if (!isNaN(v)) total += v;
  });
  document.getElementById('btTotal').textContent = total.toLocaleString();
}

function _btResetForm() {
  ['btAmtHotel','btAmtService','btAmtAirfare','btAmtGasoline','btAmtAllowance','btAmtOthers'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = 0;
  });
  ['btDeparture','btArrival','btCustomerSearch','btAttendees','btPurpose','btRemark'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '';
  });
  _btSelectedCustomer = null;
  document.querySelector('input[name=bt_mode][value=advance]').checked = true;
  document.getElementById('btDocNo').value = _btGenDocNo('advance');
  _btSetDefaultDates();
  _btCalcTotal();
  _btUpdateMapPreview();
}

function _btSetDefaultDates() {
  var t = new Date();
  var iso = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
  var docDateEl = document.getElementById('btDocDate'); if (docDateEl && !docDateEl.value) docDateEl.value = iso;
  var fromEl = document.getElementById('btTripFrom'); if (fromEl && !fromEl.value) fromEl.value = iso;
  var toEl = document.getElementById('btTripTo'); if (toEl && !toEl.value) toEl.value = iso;
}

function _btBindModeChange() {
  document.querySelectorAll('input[name=bt_mode]').forEach(function(r){
    r.addEventListener('change', function() {
      document.getElementById('btDocNo').value = _btGenDocNo(r.value);
    });
  });
}

// ── 고객 검색 ──────────────────────────────────────────────────────
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
  } catch(e) { console.warn('[BT] customers fetch failed:', e); }
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

// ── Google Places (출발/도착) + 지도 미리보기 ──────────────────────
function _btAttachPlaces() {
  if (!window.google || !google.maps || !google.maps.places) return setTimeout(_btAttachPlaces, 500);
  var dep = document.getElementById('btDeparture');
  var arr = document.getElementById('btArrival');
  function attach(input, slot) {
    if (!input || input._gPlacesAttached) return;
    input._gPlacesAttached = true;
    try {
      var ac = new google.maps.places.Autocomplete(input, {
        types: ['establishment', 'geocode'],
        componentRestrictions: { country: 'th' },
        fields: ['formatted_address', 'name', 'geometry']
      });
      ac.addListener('place_changed', function() {
        var p = ac.getPlace();
        if (!p) return;
        var addr = p.formatted_address || '';
        var name = p.name || '';
        var full = addr;
        if (name && addr && !addr.startsWith(name)) full = name + ', ' + addr;
        else if (!addr && name) full = name;
        input.value = full;
        if (slot === 'dep') _btDepAuto = ac; else _btArrAuto = ac;
        _btUpdateMapPreview();
      });
      // input 변경(타이핑 후 blur 등)에도 미리보기 갱신
      input.addEventListener('change', _btUpdateMapPreview);
      input.addEventListener('blur', function(){ setTimeout(_btUpdateMapPreview, 200); });
    } catch(e) { console.warn('[BT] places attach failed:', e); }
  }
  attach(dep, 'dep');
  attach(arr, 'arr');
}

function _btUpdateMapPreview() {
  var dep = (document.getElementById('btDeparture') || {}).value || '';
  var arr = (document.getElementById('btArrival') || {}).value || '';
  var wrap = document.getElementById('btMapPreview');
  var iframe = document.getElementById('btMapFrame');
  if (!wrap || !iframe) return;
  if (dep && arr) {
    var url = 'https://www.google.com/maps/embed/v1/directions?key=' + GMAPS_KEY +
              '&origin=' + encodeURIComponent(dep) +
              '&destination=' + encodeURIComponent(arr) +
              '&mode=driving&region=TH';
    if (iframe.src !== url) iframe.src = url;
    wrap.style.display = '';
  } else if (dep || arr) {
    var url2 = 'https://www.google.com/maps/embed/v1/place?key=' + GMAPS_KEY +
               '&q=' + encodeURIComponent(dep || arr) + '&zoom=14';
    if (iframe.src !== url2) iframe.src = url2;
    wrap.style.display = '';
  } else {
    wrap.style.display = 'none';
    iframe.src = 'about:blank';
  }
}

// ── 폼 → record 변환 ──────────────────────────────────────────────
function _btCollectRecord() {
  var mode = (document.querySelector('input[name=bt_mode]:checked') || {}).value || 'advance';
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
  return {
    doc_no: docNo,
    mode: mode,
    applicant_id: _btMe ? (_btMe.empid || _btMe._id || '') : '',
    applicant_name: _btMe ? (_btMe.name || _btMe.nickname || '') : '',
    applicant_dept: _btMe ? (_btMe.dept || '') : '',
    applicant_sub_dept: _btMe ? (_btMe.sub_dept || '') : '',
    applicant_email: _btMe ? (_btMe.email || '') : '',
    doc_date: document.getElementById('btDocDate').value || null,
    trip_from: document.getElementById('btTripFrom').value,
    trip_to: document.getElementById('btTripTo').value,
    departure: document.getElementById('btDeparture').value.trim(),
    arrival: document.getElementById('btArrival').value.trim(),
    customer_erp: _btSelectedCustomer ? _btSelectedCustomer.erp : '',
    customer_name: _btSelectedCustomer ? (_btSelectedCustomer.clinic || _btSelectedCustomer.name_en || _btSelectedCustomer.name_th) : '',
    attendees: document.getElementById('btAttendees').value.trim(),
    purpose: document.getElementById('btPurpose').value.trim(),
    remark: document.getElementById('btRemark').value.trim(),
    amounts: amounts,
    total: total
  };
}

// ── 폼 제출 ──────────────────────────────────────────────────────
async function _btSubmit() {
  if (!_btMe) { neoAlert(_btT('bt_auth_required') || '로그인이 필요합니다.'); return; }
  var rec = _btCollectRecord();
  if (!rec.trip_from || !rec.trip_to) { neoAlert(_btT('bt_err_dates') || '출장 기간을 입력해주세요.'); return; }
  if (!rec.departure || !rec.arrival) { neoAlert(_btT('bt_err_place') || '출발지와 도착지를 입력해주세요.'); return; }
  if (!rec.purpose) { neoAlert(_btT('bt_err_purpose') || '목적을 입력해주세요.'); return; }

  rec.status = 'submitted';
  rec.created_at = firebase.firestore.FieldValue.serverTimestamp();
  rec.updated_at = firebase.firestore.FieldValue.serverTimestamp();

  try {
    var ref = await _fbDb.collection('businessTrips').add(rec);
    showToast('✅ ' + (_btT('bt_submitted') || '제출되었습니다.') + ' (' + rec.doc_no + ')');
    _btResetForm();
    setTimeout(function(){ _btSwitchTab('list'); }, 600);
  } catch(e) {
    console.error('[BT] submit failed:', e);
    neoAlert((_btT('bt_submit_fail') || '제출 실패') + ': ' + (e.message || e));
  }
}

function _btSwitchTab(tab) {
  _btTab = tab;
  document.getElementById('btTabForm').classList.toggle('active', tab === 'form');
  document.getElementById('btTabList').classList.toggle('active', tab === 'list');
  document.getElementById('btFormPanel').style.display = tab === 'form' ? '' : 'none';
  document.getElementById('btListPanel').style.display = tab === 'list' ? '' : 'none';
  if (tab === 'list') _btLoadList();
}

// ── 목록 조회 ────────────────────────────────────────────────────
var _btListCache = [];
async function _btLoadList() {
  var body = document.getElementById('btListBody');
  if (!body) return;
  body.innerHTML = '<div class="bt-empty">' + (_btT('bt_loading') || '로딩 중...') + '</div>';
  if (!_btMe) { body.innerHTML = '<div class="bt-empty">' + (_btT('bt_auth_required') || '로그인이 필요합니다.') + '</div>'; return; }
  try {
    var snap = await _fbDb.collection('businessTrips')
      .where('applicant_email', '==', _btMe.email || '')
      .limit(50).get();
    var docs = [];
    snap.forEach(function(d){ docs.push(Object.assign({ _id: d.id }, d.data())); });
    docs.sort(function(a,b){
      var ta = a.created_at && a.created_at.toMillis ? a.created_at.toMillis() : 0;
      var tb = b.created_at && b.created_at.toMillis ? b.created_at.toMillis() : 0;
      return tb - ta;
    });
    _btListCache = docs;
    if (!docs.length) {
      body.innerHTML = '<div class="bt-empty">📭 ' + (_btT('bt_list_empty') || '아직 신청 내역이 없습니다.') + '</div>';
      return;
    }
    body.innerHTML = docs.map(function(d, i){
      var modeLabel = d.mode === 'settlement' ? (_btT('bt_mode_settlement') || '정산') : (_btT('bt_mode_advance') || '가불');
      var modeClass = d.mode === 'settlement' ? 'bt-status-settlement' : 'bt-status-advance';
      var totalStr = (d.total != null ? d.total : 0).toLocaleString() + ' Baht';
      var dateStr = (d.trip_from || '') + ' ~ ' + (d.trip_to || '');
      var route = (d.departure || '') + (d.arrival ? ' → ' + d.arrival : '');
      var cust = d.customer_name || '';
      return '<div class="bt-list-item">' +
        '<div class="bt-list-row">' +
          '<div>' +
            '<span class="bt-status-badge ' + modeClass + '">' + modeLabel + '</span>' +
            ' <span style="font-weight:700;font-size:13px;color:#0f766e;">' + (d.doc_no || '-') + '</span>' +
          '</div>' +
          '<span class="bt-list-amount">' + totalStr + '</span>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:13px;color:#1e293b;">📍 ' + (route || '-') + (cust ? ' · 🏥 ' + cust : '') + '</div>' +
        '<div style="margin-top:4px;font-size:12px;color:#64748b;">📅 ' + dateStr + (d.purpose ? ' · ' + d.purpose : '') + '</div>' +
        '<div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="bt-btn-mini bt-btn-mini-excel" onclick="_btDownloadExcel(' + i + ')">📊 Excel</button>' +
          '<button class="bt-btn-mini bt-btn-mini-pdf" onclick="_btDownloadPDF(' + i + ')">📄 PDF</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    console.error('[BT] list fetch failed:', e);
    body.innerHTML = '<div class="bt-empty">⚠️ ' + (_btT('bt_list_fail') || '조회 실패') + '</div>';
  }
}

// ── Excel 다운로드 ────────────────────────────────────────────────
async function _btDownloadExcel(idx) {
  var rec = _btListCache[idx];
  if (!rec) { showToast('Record not found'); return; }
  if (typeof XLSX === 'undefined') { neoAlert('XLSX 라이브러리 로드 실패'); return; }
  showToast('📊 ' + (_btT('bt_dl_excel_start') || 'Excel 생성 중...'));
  try {
    var resp = await fetch('business_trip_template.xlsx');
    var ab = await resp.arrayBuffer();
    var wb = XLSX.read(ab, { type: 'array', cellStyles: true });
    var sn = wb.SheetNames[0];
    var ws = wb.Sheets[sn];
    // 셀 값 채우기 (양식 분석 기준)
    function setCell(addr, val) {
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].v = val == null ? '' : val;
      ws[addr].t = (typeof val === 'number') ? 'n' : 's';
      delete ws[addr].w;  // formatted text 제거
      delete ws[addr].f;  // formula 제거
    }
    var modeLabel = rec.mode === 'settlement' ? '정산 (Settlement)' : '가불 (Advance)';
    setCell('C6', (rec.applicant_id || '') + ' - ' + (rec.applicant_name || ''));  // 신청자
    setCell('N5', rec.doc_no || '');                                                // Document No
    setCell('N6', rec.doc_date || '');                                              // Date
    setCell('A10', rec.attendees || rec.applicant_name || '');                       // 참석자
    setCell('B10', rec.trip_from || '');                                             // From
    setCell('C10', rec.trip_to || '');                                               // To
    setCell('D10', rec.customer_erp || '');                                          // Customer code
    setCell('E10', rec.customer_name || '');                                         // Customer name
    setCell('I10', rec.purpose || '');                                               // Purpose
    // 비용 (Row 19 = first row of business tripper detail)
    setCell('A20', rec.applicant_name || '');
    setCell('B20', rec.departure || '');
    setCell('C20', rec.arrival || '');
    var amt = rec.amounts || {};
    setCell('F20', Number(amt.gasoline || 0));   // Gasoline Amount
    setCell('I20', Number(amt.hotel || 0));      // Hotel Amount
    setCell('L20', Number(amt.allowance || 0));  // Allowance Amount
    setCell('M20', Number(amt.service || 0));    // Service Amount
    setCell('N20', Number(amt.airfare || 0));    // Airfare
    setCell('O20', Number(amt.others || 0));     // Others
    setCell('P20', Number(rec.total || 0));      // Row total
    // Actual Amount (Row 26)
    setCell('F26', Number(amt.gasoline || 0));
    setCell('I26', Number(amt.hotel || 0));
    setCell('L26', Number(amt.allowance || 0));
    setCell('O26', Number(amt.others || 0));
    setCell('P26', Number(rec.total || 0));
    // 모드 체크박스 (정산 vs 가불)
    setCell('B3', rec.mode === 'advance');
    setCell('B4', rec.mode === 'settlement');
    // 비고 (있다면 P28 또는 K28)
    if (rec.remark) setCell('K34', rec.remark);
    // Output
    var out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    var blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var fileName = 'BusinessTrip_' + (rec.doc_no || 'doc') + '.xlsx';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
    showToast('✅ ' + (_btT('bt_dl_excel_ok') || 'Excel 다운로드 완료'));
  } catch(e) {
    console.error('[BT] excel download failed:', e);
    neoAlert((_btT('bt_dl_excel_fail') || 'Excel 다운로드 실패') + ': ' + (e.message || e));
  }
}

// ── PDF 다운로드 ──────────────────────────────────────────────────
async function _btDownloadPDF(idx) {
  var rec = _btListCache[idx];
  if (!rec) { showToast('Record not found'); return; }
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    neoAlert('PDF 라이브러리 로드 실패'); return;
  }
  showToast('📄 ' + (_btT('bt_dl_pdf_start') || 'PDF 생성 중...'));
  // 임시 렌더 영역 (off-screen) 만들어 record 채워서 캡처
  var temp = document.createElement('div');
  temp.style.cssText = 'position:fixed;left:-9999px;top:0;width:780px;background:#fff;padding:28px;font-family:-apple-system,sans-serif;color:#1e293b;';
  var modeLabel = rec.mode === 'settlement' ? '정산 (Settlement)' : '가불 (Advance)';
  var amt = rec.amounts || {};
  var amtRow = function(k, lbl, v) {
    return '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;">' + lbl + '</td>' +
           '<td style="padding:6px 10px;border:1px solid #cbd5e1;text-align:right;">' + (Number(v||0)).toLocaleString() + '</td></tr>';
  };
  temp.innerHTML =
    '<h2 style="margin:0 0 6px;color:#0d9488;">🧳 Business Trip Request</h2>' +
    '<div style="font-size:12px;color:#64748b;margin-bottom:16px;">' + (rec.doc_no || '') + ' · ' + modeLabel + '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px;">' +
      '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;width:130px;">Applicant</td>' +
          '<td style="padding:6px 10px;border:1px solid #cbd5e1;">' + (rec.applicant_id || '') + ' - ' + (rec.applicant_name || '') + '</td></tr>' +
      '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Doc Date</td>' +
          '<td style="padding:6px 10px;border:1px solid #cbd5e1;">' + (rec.doc_date || '') + '</td></tr>' +
      '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Trip Period</td>' +
          '<td style="padding:6px 10px;border:1px solid #cbd5e1;">' + (rec.trip_from || '') + ' ~ ' + (rec.trip_to || '') + '</td></tr>' +
      '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Departure</td>' +
          '<td style="padding:6px 10px;border:1px solid #cbd5e1;">' + (rec.departure || '') + '</td></tr>' +
      '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Arrival</td>' +
          '<td style="padding:6px 10px;border:1px solid #cbd5e1;">' + (rec.arrival || '') + '</td></tr>' +
      '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Customer</td>' +
          '<td style="padding:6px 10px;border:1px solid #cbd5e1;">' + (rec.customer_erp || '') + ' ' + (rec.customer_name || '') + '</td></tr>' +
      '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Attendees</td>' +
          '<td style="padding:6px 10px;border:1px solid #cbd5e1;">' + (rec.attendees || '') + '</td></tr>' +
      '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Purpose</td>' +
          '<td style="padding:6px 10px;border:1px solid #cbd5e1;">' + (rec.purpose || '') + '</td></tr>' +
    '</table>' +
    '<h3 style="margin:14px 0 6px;color:#0f766e;font-size:14px;">Expenses (Baht)</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      amtRow('hotel','🏨 Hotel', amt.hotel) +
      amtRow('service','🤝 Service', amt.service) +
      amtRow('airfare','✈️ Air Fare', amt.airfare) +
      amtRow('gasoline','⛽ Gasoline', amt.gasoline) +
      amtRow('allowance','📋 Allowance', amt.allowance) +
      amtRow('others','📦 Others', amt.others) +
      '<tr style="background:#0d9488;color:#fff;font-weight:700;">' +
        '<td style="padding:8px 10px;">TOTAL</td>' +
        '<td style="padding:8px 10px;text-align:right;font-size:15px;">' + (Number(rec.total||0)).toLocaleString() + '</td></tr>' +
    '</table>' +
    (rec.remark ? '<div style="margin-top:14px;font-size:12px;color:#475569;"><strong>Remark:</strong> ' + (rec.remark||'').replace(/</g,'&lt;') + '</div>' : '');
  document.body.appendChild(temp);
  try {
    var canvas = await html2canvas(temp, { scale: 2, backgroundColor: '#fff', useCORS: true });
    var imgData = canvas.toDataURL('image/jpeg', 0.92);
    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    var pdfW = 210, pdfH = 297;
    var imgW = pdfW - 16; // 8mm 마진 양쪽
    var imgH = canvas.height * imgW / canvas.width;
    pdf.addImage(imgData, 'JPEG', 8, 8, imgW, Math.min(imgH, pdfH - 16));
    var fileName = 'BusinessTrip_' + (rec.doc_no || 'doc') + '.pdf';
    pdf.save(fileName);
    showToast('✅ ' + (_btT('bt_dl_pdf_ok') || 'PDF 다운로드 완료'));
  } catch(e) {
    console.error('[BT] pdf failed:', e);
    neoAlert((_btT('bt_dl_pdf_fail') || 'PDF 다운로드 실패') + ': ' + (e.message || e));
  } finally {
    if (temp.parentNode) temp.parentNode.removeChild(temp);
  }
}

// 글로벌 노출 (인라인 onclick 에서 호출)
window._btDownloadExcel = _btDownloadExcel;
window._btDownloadPDF = _btDownloadPDF;
window._btSwitchTab = _btSwitchTab;
window._btSubmit = _btSubmit;
window._btResetForm = _btResetForm;
window._btCalcTotal = _btCalcTotal;

// ── 초기화 ──────────────────────────────────────────────────────
(async function _btInit() {
  if (document.readyState === 'loading') {
    await new Promise(function(r){ document.addEventListener('DOMContentLoaded', r); });
  }
  await _btLoadUser();
  if (!_btMe) return;
  // 신청자: 사번 - 이름 (사번 우선)
  var who = (_btMe.empid ? _btMe.empid + ' - ' : '') + (_btMe.name || _btMe.nickname || '');
  document.getElementById('btApplicant').value = who.trim() || _btMe.email || '';
  document.getElementById('btDocNo').value = _btGenDocNo('advance');
  _btSetDefaultDates();
  _btCalcTotal();
  _btBindModeChange();
  _btBindCustomerSearch();
  _btAttachPlaces();
  if (typeof applyLang === 'function') applyLang();
})();
