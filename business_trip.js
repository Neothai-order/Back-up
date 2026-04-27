// ─── Business Trip ────────────────────────────────────────────────
// 출장 신청 (가불/정산) — Firestore: businessTrips
// v4 (2026-04-27) — 다중 leg + 거리 + 도착지 통합 자동완성

var GMAPS_KEY = 'AIzaSyBDU8EH41NWBx74v7uMKmFpEfvCyLN19zw';
var _btMe = null;
var _btCustomers = [];
var _btCustomersLoaded = false;
var _btTab = 'form';
var _btCustSearchTimer = null;
var _btLegSearchTimer = {};   // legId → timer
var _btLegs = [];              // [{ id, departure, arrival, customer_erp, customer_name, distance_km, dep_loc, arr_loc }]
var _btLegSeq = 0;
var _btAcService = null;       // Google AutocompleteService
var _btPlacesService = null;   // PlacesService (getDetails 용)
var _btDirService = null;      // DirectionsService
var _btSelectedCustomer = null;
var _btManualHotel = false;       // 숙박비 수동 입력 모드
var _btGasolineRatePerKm = null;  // settings/businessTrip 에서 fetch (default 5)
var _btDailyAllowance = 300;      // 출장수당 default
var _btHotelPerNight = 650;       // 숙박비 default

// ── settings/businessTrip 에서 단가 fetch ─────────────────────────
async function _btLoadRates() {
  if (_btGasolineRatePerKm != null) return;
  try {
    var doc = await _fbDb.collection('settings').doc('businessTrip').get();
    if (doc.exists) {
      var d = doc.data();
      _btGasolineRatePerKm = Number(d.gasoline_rate_per_km) || 5;
      if (d.daily_allowance) _btDailyAllowance = Number(d.daily_allowance) || 300;
      if (d.hotel_per_night) _btHotelPerNight = Number(d.hotel_per_night) || 650;
    } else {
      _btGasolineRatePerKm = 5;
    }
  } catch(e) {
    console.warn('[BT] rate fetch failed, using defaults:', e);
    _btGasolineRatePerKm = 5;
  }
}

// ── 자동 계산 (출장수당, 숙박비, 휘발유) ─────────────────────────
function _btCalcAutoAmounts() {
  var fromVal = (document.getElementById('btTripFrom') || {}).value;
  var toVal   = (document.getElementById('btTripTo') || {}).value;
  if (!fromVal || !toVal) return;
  var d1 = new Date(fromVal + 'T00:00:00');
  var d2 = new Date(toVal   + 'T00:00:00');
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return;
  var dayMs = 86400000;
  var diffDays = Math.round((d2 - d1) / dayMs) + 1;  // 일수 (포함)
  var nights   = Math.max(0, Math.round((d2 - d1) / dayMs));  // 박 수
  // 출장수당
  var allowEl = document.getElementById('btAmtAllowance');
  if (allowEl) allowEl.value = diffDays * _btDailyAllowance;
  // 숙박비 (수동 체크 안 됐을 때만)
  if (!_btManualHotel) {
    var hotelEl = document.getElementById('btAmtHotel');
    if (hotelEl) hotelEl.value = nights * _btHotelPerNight;
  }
  // 휘발유 = 모든 leg 거리 합 × rate
  var totalKm = _btLegs.reduce(function(s, l){ return s + (Number(l.distance_km) || 0); }, 0);
  var rate = _btGasolineRatePerKm || 5;
  var gasEl = document.getElementById('btAmtGasoline');
  if (gasEl) gasEl.value = Math.round(totalKm * rate);
  _btCalcTotal();
}

// ── 숙박비 수동 입력 토글 ────────────────────────────────────────
function _btToggleHotelManual() {
  var chk = document.getElementById('btHotelManual');
  var hotelEl = document.getElementById('btAmtHotel');
  if (!chk || !hotelEl) return;
  _btManualHotel = chk.checked;
  hotelEl.readOnly = !_btManualHotel;
  hotelEl.style.background = _btManualHotel ? '#fff' : '#f1f5f9';
  hotelEl.style.color = _btManualHotel ? '#1e293b' : '#475569';
  if (_btManualHotel) {
    hotelEl.focus();
    hotelEl.select();
  } else {
    _btCalcAutoAmounts();
  }
}

// ── 인증 ──────────────────────────────────────────────────────────
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
    showToast(_btT('bt_auth_required', '로그인이 필요합니다.'));
    setTimeout(function(){ location.href = 'index.html'; }, 1500);
    return null;
  }
  // empid = email local-part 대문자 (firestore.rules myEmpid() 와 동일 규칙)
  var empid = (fbUser.email || '').split('@')[0].toUpperCase();
  try {
    // 1차: doc ID = empid 로 직접 fetch (가장 빠르고 정확)
    if (empid) {
      var doc = await _fbDb.collection('accounts').doc(empid).get();
      if (doc.exists) {
        // doc.data() 가 먼저 적용되고 마지막에 fbUser.email 로 강제 덮어씀
        // (firestore.rules 의 applicant_email == token.email 비교 통과 보장)
        _btMe = Object.assign({}, doc.data(), { empid: empid, _id: empid, email: fbUser.email });
        return _btMe;
      }
    }
    // 2차 fallback: email 필드 검색
    var snap = await _fbDb.collection('accounts').where('email','==', fbUser.email).limit(1).get();
    if (!snap.empty) {
      var d = snap.docs[0];
      _btMe = Object.assign({}, d.data(), { empid: d.id, _id: d.id, email: fbUser.email });
    } else {
      _btMe = { email: fbUser.email, name: fbUser.displayName || '', empid: empid, dept: '' };
    }
  } catch(e) {
    console.warn('[BT] accounts fetch failed:', e);
    _btMe = { email: fbUser.email, name: fbUser.displayName || '', empid: empid };
  }
  return _btMe;
}

function _btT(key, fallback) {
  // lang.min.js 의 t() 가 키 그대로 반환하면 (캐시 미스 등) fallback 사용
  if (typeof window.t === 'function') {
    var v = window.t(key);
    if (v && v !== key) return v;
  }
  return fallback || key;
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
  var ids = ['btAmtAllowance','btAmtGasoline','btAmtHotel','btAmtAirfare','btAmtService','btAmtOthers'];
  var total = 0;
  ids.forEach(function(id){
    var v = parseFloat((document.getElementById(id) || {}).value || 0);
    if (!isNaN(v)) total += v;
  });
  document.getElementById('btTotal').textContent = total.toLocaleString();
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

// ── 고객 데이터 lazy load ─────────────────────────────────────────
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

function _btSafeHtml(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── 주소에서 지방(province)만 추출 (PDF 출력용) ──────────────────
function _btExtractProvince(addr) {
  if (!addr) return '';
  // 우편번호(5자리)와 ", Thailand" 제거
  var clean = String(addr).replace(/,?\s*Thailand\s*$/i, '').replace(/\s*\d{5}\s*,?\s*$/, '').trim();
  // 태국어 → 영문 매핑
  var thaiToEng = {
    'กรุงเทพมหานคร':'Bangkok','กรุงเทพ':'Bangkok','ชลบุรี':'Chonburi',
    'เชียงใหม่':'Chiang Mai','เชียงราย':'Chiang Rai','ภูเก็ต':'Phuket',
    'นครปฐม':'Nakhon Pathom','นนทบุรี':'Nonthaburi','ปทุมธานี':'Pathum Thani',
    'สมุทรปราการ':'Samut Prakan','สมุทรสาคร':'Samut Sakhon','ขอนแก่น':'Khon Kaen',
    'นครราชสีมา':'Nakhon Ratchasima','พระนครศรีอยุธยา':'Ayutthaya',
    'ระยอง':'Rayong','สงขลา':'Songkhla','หาดใหญ่':'Hat Yai',
    'อุดรธานี':'Udon Thani','อุบลราชธานี':'Ubon Ratchathani',
    'กระบี่':'Krabi','สุราษฎร์ธานี':'Surat Thani','ตรัง':'Trang',
    'พิษณุโลก':'Phitsanulok','เพชรบุรี':'Phetchaburi','ลำปาง':'Lampang',
    'สระบุรี':'Saraburi','ฉะเชิงเทรา':'Chachoengsao','กาญจนบุรี':'Kanchanaburi',
    'ราชบุรี':'Ratchaburi','สุพรรณบุรี':'Suphanburi','อยุธยา':'Ayutthaya'
  };
  for (var thai in thaiToEng) {
    if (clean.indexOf(thai) >= 0) return thaiToEng[thai];
  }
  // "Krung Thep Maha Nakhon" → Bangkok
  if (/Krung\s*Thep/i.test(clean)) return 'Bangkok';
  // 영문 지방명
  var engProvinces = ['Bangkok','Chonburi','Chiang Mai','Chiang Rai','Phuket','Nakhon Pathom','Nonthaburi','Pathum Thani','Samut Prakan','Samut Sakhon','Khon Kaen','Nakhon Ratchasima','Ayutthaya','Rayong','Songkhla','Pattaya','Hua Hin','Krabi','Surat Thani','Trang','Phitsanulok','Phetchabun','Phetchaburi','Lampang','Lamphun','Saraburi','Tak','Hat Yai','Udon Thani','Ubon Ratchathani','Chachoengsao','Kanchanaburi','Ratchaburi','Suphanburi'];
  for (var i = 0; i < engProvinces.length; i++) {
    if (clean.indexOf(engProvinces[i]) >= 0) return engProvinces[i];
  }
  // fallback: 마지막 콤마 분리 토큰
  var parts = clean.split(',');
  if (parts.length >= 1) return parts[parts.length - 1].trim();
  return clean;
}

// ── 고객 검색 (별도 customer 필드용 — 기존 동작 유지) ────────────
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
    list.innerHTML = '<div class="bt-search-item" style="color:#94a3b8;cursor:default;">' + (_btT('bt_no_cust', '검색 결과 없음')) + '</div>';
    list.style.display = 'block';
    return;
  }
  list.innerHTML = matches.map(function(c){
    return '<div class="bt-search-item" data-erp="' + _btSafeHtml(c.erp) + '">' +
      '<div style="font-weight:700;color:#0f766e;">' + _btSafeHtml(c.erp) + '</div>' +
      '<div style="font-size:12px;color:#475569;">' + _btSafeHtml(c.clinic || c.name_en || c.name_th) + '</div>' +
      (c.province ? '<div style="font-size:11px;color:#94a3b8;">📍 ' + _btSafeHtml(c.province) + '</div>' : '') +
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

// ── Google Maps 서비스 lazy init ──────────────────────────────────
function _btEnsureGmapsServices() {
  if (!window.google || !google.maps || !google.maps.places) return false;
  if (!_btAcService) _btAcService = new google.maps.places.AutocompleteService();
  if (!_btPlacesService) {
    var div = document.createElement('div');
    _btPlacesService = new google.maps.places.PlacesService(div);
  }
  if (!_btDirService) _btDirService = new google.maps.DirectionsService();
  return true;
}

// ── Leg 추가/제거 ─────────────────────────────────────────────────
function _btMakeLegRow() {
  var id = ++_btLegSeq;
  var leg = {
    id: id,
    departure: '', arrival: '',
    customer_erp: '', customer_name: '',
    distance_km: 0,
    dep_loc: null, arr_loc: null
  };
  _btLegs.push(leg);

  var card = document.createElement('div');
  card.className = 'bt-leg-card' + (_btLegs.length === 1 ? ' first' : '');
  card.dataset.legId = id;
  var idx = _btLegs.length;
  card.innerHTML =
    '<div class="bt-leg-hdr">' +
      '<span class="bt-leg-title">📍 <span data-i18n="bt_leg">일정</span> ' + idx + '</span>' +
      (_btLegs.length > 1 ? '<button type="button" class="bt-leg-remove" onclick="_btRemoveLeg(' + id + ')" title="삭제">×</button>' : '') +
    '</div>' +
    // 1) 고객 검색 (먼저) — 선택 시 도착지 자동 채움
    '<div class="bt-row bt-leg-search">' +
      '<span class="bt-label" data-i18n="bt_leg_customer">고객</span>' +
      '<input type="text" id="btLegCust_' + id + '" class="bt-input" placeholder="ERP / 클리닉 검색 (선택 시 도착지 자동)" data-i18n-placeholder="bt_leg_cust_ph" autocomplete="off">' +
      '<div class="bt-leg-search-list" id="btLegCustList_' + id + '"></div>' +
    '</div>' +
    // 2) 출발지
    '<div class="bt-row bt-leg-search">' +
      '<span class="bt-label" data-i18n="bt_departure">출발지</span>' +
      '<input type="text" id="btDep_' + id + '" class="bt-input" placeholder="출발 주소 또는 상호명" data-i18n-placeholder="bt_departure_ph" autocomplete="off">' +
      '<div class="bt-leg-search-list" id="btDepList_' + id + '"></div>' +
    '</div>' +
    // 3) 도착지
    '<div class="bt-row bt-leg-search">' +
      '<span class="bt-label" data-i18n="bt_arrival">도착지</span>' +
      '<input type="text" id="btArr_' + id + '" class="bt-input" placeholder="도착 주소 또는 상호명" data-i18n-placeholder="bt_arrival_ph" autocomplete="off">' +
      '<div class="bt-leg-search-list" id="btArrList_' + id + '"></div>' +
    '</div>' +
    '<div id="btLegDist_' + id + '" class="bt-leg-distance" style="display:none;">🚗 <span id="btLegDistVal_' + id + '">-</span></div>' +
    '<div id="btLegMap_' + id + '" class="bt-leg-map">' +
      '<iframe id="btLegMapFrame_' + id + '" width="100%" height="100%" frameborder="0" style="border:0;" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>' +
    '</div>';
  document.getElementById('btLegsContainer').appendChild(card);

  // 출발지/도착지 둘 다 우리 자체 dropdown (Places predictions 만)
  var depEl = document.getElementById('btDep_' + id);
  var depList = document.getElementById('btDepList_' + id);
  _btAttachLegPlaces(depEl, depList, leg, 'dep');

  var arrEl = document.getElementById('btArr_' + id);
  var arrList = document.getElementById('btArrList_' + id);
  _btAttachLegPlaces(arrEl, arrList, leg, 'arr');

  // 고객 검색 input (별도) — 선택 시 도착지에 등록주소 자동 채움
  var custEl = document.getElementById('btLegCust_' + id);
  var custList = document.getElementById('btLegCustList_' + id);
  _btAttachLegCustomer(custEl, custList, leg);

  // i18n re-apply
  if (typeof applyLang === 'function') applyLang();
  return id;
}

function _btAddLeg() {
  _btMakeLegRow();
  // 카드 헤더 인덱스 재계산 (1, 2, 3...)
  _btRenumberLegs();
}

function _btRemoveLeg(id) {
  var idx = _btLegs.findIndex(function(l){ return l.id === id; });
  if (idx === -1) return;
  if (_btLegs.length <= 1) { showToast(_btT('bt_leg_min', '최소 1개의 일정이 필요합니다.')); return; }
  _btLegs.splice(idx, 1);
  var card = document.querySelector('.bt-leg-card[data-leg-id="' + id + '"]');
  if (card) card.remove();
  _btRenumberLegs();
}

function _btRenumberLegs() {
  var cards = document.querySelectorAll('#btLegsContainer .bt-leg-card');
  cards.forEach(function(c, i) {
    var lblSpan = c.querySelector('.bt-leg-title');
    if (lblSpan) lblSpan.innerHTML = '📍 <span data-i18n="bt_leg">일정</span> ' + (i + 1);
    c.classList.toggle('first', i === 0);
  });
  if (typeof applyLang === 'function') applyLang();
}

// ── 키보드 네비게이션 헬퍼 (↑↓ Enter Esc) ────────────────────────
function _btBindKbNav(input, listEl) {
  if (input._kbBound) return;
  input._kbBound = true;
  input.addEventListener('keydown', function(e) {
    if (listEl.style.display === 'none') return;
    var items = Array.prototype.slice.call(listEl.querySelectorAll('.bt-search-item'))
      .filter(function(el){ return el.style.cursor !== 'default'; }); // 'no results' 항목 제외
    if (!items.length) return;
    var active = listEl.querySelector('.bt-search-item.kb-active');
    var idx = items.indexOf(active);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = (idx + 1) % items.length;
      _btKbHighlight(items, idx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = (idx - 1 + items.length) % items.length;
      _btKbHighlight(items, idx);
    } else if (e.key === 'Enter') {
      if (idx === -1) idx = 0; // 첫 항목 자동 선택
      e.preventDefault();
      items[idx].click();
    } else if (e.key === 'Escape') {
      listEl.style.display = 'none';
    }
  });
}

function _btKbHighlight(items, idx) {
  items.forEach(function(el, i) { el.classList.toggle('kb-active', i === idx); });
  if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
}

// ── 출발/도착 자체 dropdown (Google Places predictions) ───────────
function _btAttachLegPlaces(input, listEl, leg, slot /* 'dep'|'arr' */) {
  var key = leg.id + '_' + slot;
  function onInput() {
    var q = input.value.trim();
    if (_btLegSearchTimer[key]) clearTimeout(_btLegSearchTimer[key]);
    _btLegSearchTimer[key] = setTimeout(function(){ _btDoLegPlacesSearch(input, listEl, leg, slot, q); }, 220);
  }
  input.addEventListener('input', onInput);
  input.addEventListener('focus', function(){ if (input.value.trim()) onInput(); });
  _btBindKbNav(input, listEl);
  input.addEventListener('change', function(){
    if (slot === 'dep') leg.departure = input.value; else leg.arrival = input.value;
    _btUpdateLegMapAndDistance(leg);
  });
  input.addEventListener('blur', function(){
    if (slot === 'dep') leg.departure = input.value; else leg.arrival = input.value;
    setTimeout(function(){ _btUpdateLegMapAndDistance(leg); }, 200);
  });
  document.addEventListener('click', function(e) {
    if (e.target !== input && !listEl.contains(e.target)) listEl.style.display = 'none';
  });
}

async function _btDoLegPlacesSearch(input, listEl, leg, slot, q) {
  if (!q) { listEl.style.display = 'none'; return; }
  if (!_btEnsureGmapsServices()) { listEl.style.display = 'none'; return; }
  var predictions = await new Promise(function(resolve){
    _btAcService.getPlacePredictions({
      input: q,
      componentRestrictions: { country: 'th' }
    }, function(p, status) {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !p) return resolve([]);
      resolve(p.slice(0, 10));
    });
  });
  if (!predictions.length) {
    listEl.innerHTML = '<div class="bt-search-item" style="color:#94a3b8;cursor:default;">' + _btT('bt_no_results', '검색 결과 없음') + '</div>';
    listEl.style.display = 'block'; return;
  }
  listEl.innerHTML = predictions.map(function(p){
    return '<div class="bt-search-item" data-place-id="' + _btSafeHtml(p.place_id) + '" data-desc="' + _btSafeHtml(p.description) + '">' +
      '<div style="font-size:13px;color:#1e293b;">📍 ' + _btSafeHtml(p.description) + '</div>' +
    '</div>';
  }).join('');
  listEl.style.display = 'block';
  listEl.querySelectorAll('.bt-search-item[data-place-id]').forEach(function(el){
    el.addEventListener('click', function() {
      var pid = el.getAttribute('data-place-id');
      var desc = el.getAttribute('data-desc');
      if (_btPlacesService && pid) {
        _btPlacesService.getDetails({ placeId: pid, fields: ['formatted_address','name','geometry'] }, function(p, status) {
          var full = desc, loc = null;
          if (status === google.maps.places.PlacesServiceStatus.OK && p) {
            var addr = p.formatted_address || desc;
            var name = p.name || '';
            full = (name && addr && !addr.startsWith(name)) ? (name + ', ' + addr) : (addr || name || desc);
            loc = (p.geometry && p.geometry.location) ? { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() } : null;
          }
          input.value = full;
          if (slot === 'dep') { leg.departure = full; leg.dep_loc = loc; }
          else { leg.arrival = full; leg.arr_loc = loc; }
          _btUpdateLegMapAndDistance(leg);
        });
      } else {
        input.value = desc;
        if (slot === 'dep') leg.departure = desc; else leg.arrival = desc;
        _btUpdateLegMapAndDistance(leg);
      }
      listEl.style.display = 'none';
    });
  });
}

// ── leg 별 고객 검색 (선택 시 도착지 자동 채움) ───────────────────
function _btAttachLegCustomer(input, listEl, leg) {
  var key = leg.id + '_cust';
  function onInput() {
    var q = input.value.trim();
    if (_btLegSearchTimer[key]) clearTimeout(_btLegSearchTimer[key]);
    _btLegSearchTimer[key] = setTimeout(function(){ _btDoLegCustSearch(input, listEl, leg, q); }, 220);
  }
  input.addEventListener('input', onInput);
  input.addEventListener('focus', function(){ if (input.value.trim()) onInput(); });
  _btBindKbNav(input, listEl);
  document.addEventListener('click', function(e) {
    if (e.target !== input && !listEl.contains(e.target)) listEl.style.display = 'none';
  });
}

async function _btDoLegCustSearch(input, listEl, leg, q) {
  if (!q) { listEl.style.display = 'none'; return; }
  await _btLoadCustomers();
  var lower = q.toLowerCase();
  var matches = _btCustomers.filter(function(c){
    var hay = ((c.erp||'') + ' ' + (c.clinic||'') + ' ' + (c.name_th||'') + ' ' + (c.name_en||'')).toLowerCase();
    return hay.indexOf(lower) !== -1;
  }).slice(0, 12);
  if (!matches.length) {
    listEl.innerHTML = '<div class="bt-search-item" style="color:#94a3b8;cursor:default;">' + _btT('bt_no_cust', '검색 결과 없음') + '</div>';
    listEl.style.display = 'block'; return;
  }
  listEl.innerHTML = matches.map(function(c){
    return '<div class="bt-search-item" data-erp="' + _btSafeHtml(c.erp) + '">' +
      '<div><span class="bt-cust-tag">' + _btT('bt_tag_customer', '고객') + '</span><strong style="color:#0f766e;">' + _btSafeHtml(c.erp) + '</strong></div>' +
      '<div style="font-size:12px;color:#475569;margin-top:2px;">' + _btSafeHtml(c.clinic || c.name_en || c.name_th) + '</div>' +
      (c.addr_reg ? '<div style="font-size:11px;color:#94a3b8;margin-top:1px;">📍 ' + _btSafeHtml(c.addr_reg) + '</div>' : '') +
    '</div>';
  }).join('');
  listEl.style.display = 'block';
  listEl.querySelectorAll('.bt-search-item[data-erp]').forEach(function(el){
    el.addEventListener('click', function() {
      var erp = el.getAttribute('data-erp');
      var c = _btCustomers.find(function(x){ return x.erp === erp; });
      if (!c) return;
      var label = c.erp + ' · ' + (c.clinic || c.name_en || c.name_th);
      input.value = label;
      leg.customer_erp = c.erp;
      leg.customer_name = c.clinic || c.name_en || c.name_th;
      // 등록주소가 있으면 도착지에 자동 채움
      if (c.addr_reg) {
        var arrEl = document.getElementById('btArr_' + leg.id);
        if (arrEl) arrEl.value = c.addr_reg;
        leg.arrival = c.addr_reg;
        if (_btEnsureGmapsServices()) {
          var geo = new google.maps.Geocoder();
          geo.geocode({ address: c.addr_reg, componentRestrictions: { country: 'th' } }, function(results, status) {
            if (status === 'OK' && results[0]) {
              var loc = results[0].geometry.location;
              leg.arr_loc = { lat: loc.lat(), lng: loc.lng() };
            }
            _btUpdateLegMapAndDistance(leg);
          });
        } else {
          _btUpdateLegMapAndDistance(leg);
        }
      }
      listEl.style.display = 'none';
    });
  });
}

// ── 지도 + 거리 업데이트 ─────────────────────────────────────────
function _btUpdateLegMapAndDistance(leg) {
  var dep = leg.departure || (document.getElementById('btDep_' + leg.id) || {}).value || '';
  var arr = leg.arrival || (document.getElementById('btArr_' + leg.id) || {}).value || '';
  leg.departure = dep;
  leg.arrival = arr;
  var mapWrap = document.getElementById('btLegMap_' + leg.id);
  var iframe = document.getElementById('btLegMapFrame_' + leg.id);
  var distWrap = document.getElementById('btLegDist_' + leg.id);
  var distVal = document.getElementById('btLegDistVal_' + leg.id);
  if (!mapWrap || !iframe) return;
  if (dep && arr) {
    var url = 'https://www.google.com/maps/embed/v1/directions?key=' + GMAPS_KEY +
              '&origin=' + encodeURIComponent(dep) +
              '&destination=' + encodeURIComponent(arr) +
              '&mode=driving&region=TH';
    if (iframe.src !== url) iframe.src = url;
    mapWrap.style.display = '';
    // 거리 계산 (Directions API)
    if (_btEnsureGmapsServices()) {
      _btDirService.route({
        origin: dep, destination: arr, travelMode: google.maps.TravelMode.DRIVING,
        region: 'TH'
      }, function(result, status) {
        if (status === 'OK' && result.routes[0] && result.routes[0].legs[0]) {
          var legR = result.routes[0].legs[0];
          var km = (legR.distance.value / 1000);
          leg.distance_km = km;
          if (distVal) distVal.textContent = km.toFixed(1) + ' km · ' + Math.round(legR.duration.value / 60) + ' min';
          if (distWrap) distWrap.style.display = '';
        } else {
          leg.distance_km = 0;
          if (distWrap) distWrap.style.display = 'none';
        }
        // 거리 갱신 → 휘발유 자동 재계산
        _btCalcAutoAmounts();
      });
    }
  } else if (dep || arr) {
    var url2 = 'https://www.google.com/maps/embed/v1/place?key=' + GMAPS_KEY +
               '&q=' + encodeURIComponent(dep || arr) + '&zoom=14';
    if (iframe.src !== url2) iframe.src = url2;
    mapWrap.style.display = '';
    if (distWrap) distWrap.style.display = 'none';
  } else {
    mapWrap.style.display = 'none';
    iframe.src = 'about:blank';
    if (distWrap) distWrap.style.display = 'none';
  }
}

// ── 폼 → record ───────────────────────────────────────────────────
function _btCollectRecord() {
  var mode = (document.querySelector('input[name=bt_mode]:checked') || {}).value || 'advance';
  var amounts = {
    allowance:parseFloat(document.getElementById('btAmtAllowance').value || 0) || 0,
    gasoline: parseFloat(document.getElementById('btAmtGasoline').value || 0) || 0,
    hotel:    parseFloat(document.getElementById('btAmtHotel').value || 0) || 0,
    airfare:  parseFloat(document.getElementById('btAmtAirfare').value || 0) || 0,
    service:  parseFloat(document.getElementById('btAmtService').value || 0) || 0,
    others:   parseFloat(document.getElementById('btAmtOthers').value || 0) || 0
  };
  var amounts_detail = {
    others: ((document.getElementById('btAmtOthersDetail') || {}).value || '').trim()
  };
  var total = Object.values(amounts).reduce(function(a,b){ return a+b; }, 0);
  var docNo = document.getElementById('btDocNo').value || _btGenDocNo(mode);
  // legs from state (input value 도 sync)
  var legs = _btLegs.map(function(l) {
    return {
      departure: ((document.getElementById('btDep_' + l.id) || {}).value || l.departure || '').trim(),
      arrival:   ((document.getElementById('btArr_' + l.id) || {}).value || l.arrival || '').trim(),
      customer_erp: l.customer_erp || '',
      customer_name: l.customer_name || '',
      distance_km: Number(l.distance_km || 0)
    };
  });
  var totalKm = legs.reduce(function(s, l){ return s + (Number(l.distance_km) || 0); }, 0);
  var firstLeg = legs[0] || { departure: '', arrival: '', customer_erp: '', customer_name: '' };
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
    legs: legs,
    total_distance_km: Number(totalKm.toFixed(2)),
    departure: firstLeg.departure,
    arrival: firstLeg.arrival,
    customer_erp: firstLeg.customer_erp || (_btSelectedCustomer ? _btSelectedCustomer.erp : ''),
    customer_name: firstLeg.customer_name || (_btSelectedCustomer ? (_btSelectedCustomer.clinic || _btSelectedCustomer.name_en || _btSelectedCustomer.name_th) : ''),
    attendees: document.getElementById('btAttendees').value.trim(),
    purpose: document.getElementById('btPurpose').value.trim(),
    remark: document.getElementById('btRemark').value.trim(),
    amounts: amounts,
    amounts_detail: amounts_detail,
    total: total
  };
}

async function _btSubmit() {
  if (!_btMe) { neoAlert(_btT('bt_auth_required', '로그인이 필요합니다.')); return; }
  var rec = _btCollectRecord();
  if (!rec.trip_from || !rec.trip_to) { neoAlert(_btT('bt_err_dates', '출장 기간을 입력해주세요.')); return; }
  var validLegs = (rec.legs || []).filter(function(l){ return l.departure && l.arrival; });
  if (!validLegs.length) { neoAlert(_btT('bt_err_place', '최소 1개 일정의 출발지·도착지를 입력해주세요.')); return; }
  if (!rec.purpose) { neoAlert(_btT('bt_err_purpose', '목적을 입력해주세요.')); return; }
  rec.status = 'submitted';
  rec.created_at = firebase.firestore.FieldValue.serverTimestamp();
  rec.updated_at = firebase.firestore.FieldValue.serverTimestamp();
  try {
    await _fbDb.collection('businessTrips').add(rec);
    showToast('✅ ' + (_btT('bt_submitted', '제출되었습니다.')) + ' (' + rec.doc_no + ')');
    _btResetForm();
    setTimeout(function(){ _btSwitchTab('list'); }, 600);
  } catch(e) {
    console.error('[BT] submit failed:', e);
    neoAlert((_btT('bt_submit_fail', '제출 실패')) + ': ' + (e.message || e));
  }
}

function _btResetForm() {
  ['btAmtAllowance','btAmtGasoline','btAmtHotel','btAmtAirfare','btAmtService','btAmtOthers'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = 0;
  });
  ['btCustomerSearch','btAttendees','btPurpose','btRemark','btAmtOthersDetail'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '';
  });
  _btSelectedCustomer = null;
  // 숙박비 수동 모드 reset
  _btManualHotel = false;
  var chk = document.getElementById('btHotelManual'); if (chk) chk.checked = false;
  var hotelEl = document.getElementById('btAmtHotel');
  if (hotelEl) { hotelEl.readOnly = true; hotelEl.style.background = '#f1f5f9'; hotelEl.style.color = '#475569'; }
  document.querySelector('input[name=bt_mode][value=advance]').checked = true;
  document.getElementById('btDocNo').value = _btGenDocNo('advance');
  // legs 초기화
  _btLegs = [];
  document.getElementById('btLegsContainer').innerHTML = '';
  _btMakeLegRow();
  _btSetDefaultDates();
  _btCalcAutoAmounts();
}

function _btSwitchTab(tab) {
  _btTab = tab;
  document.getElementById('btTabForm').classList.toggle('active', tab === 'form');
  document.getElementById('btTabList').classList.toggle('active', tab === 'list');
  document.getElementById('btFormPanel').style.display = tab === 'form' ? '' : 'none';
  document.getElementById('btListPanel').style.display = tab === 'list' ? '' : 'none';
  if (tab === 'list') _btLoadList();
}

// ── 목록 ──────────────────────────────────────────────────────────
var _btListCache = [];
async function _btLoadList() {
  var body = document.getElementById('btListBody');
  if (!body) return;
  body.innerHTML = '<div class="bt-empty">' + (_btT('bt_loading', '로딩 중...')) + '</div>';
  if (!_btMe) { body.innerHTML = '<div class="bt-empty">' + (_btT('bt_auth_required', '로그인이 필요합니다.')) + '</div>'; return; }
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
      body.innerHTML = '<div class="bt-empty">📭 ' + (_btT('bt_list_empty', '아직 신청 내역이 없습니다.')) + '</div>';
      return;
    }
    body.innerHTML = docs.map(function(d, i){
      var modeLabel = d.mode === 'settlement' ? (_btT('bt_mode_settlement', '정산')) : (_btT('bt_mode_advance', '가불'));
      var modeClass = d.mode === 'settlement' ? 'bt-status-settlement' : 'bt-status-advance';
      var totalStr = (d.total != null ? d.total : 0).toLocaleString() + ' Baht';
      var dateStr = (d.trip_from || '') + ' ~ ' + (d.trip_to || '');
      var legs = (d.legs && d.legs.length) ? d.legs : [{ departure: d.departure || '', arrival: d.arrival || '', distance_km: 0 }];
      var legsHtml = legs.map(function(l, j){
        var route = (l.departure || '') + ' → ' + (l.arrival || '');
        var km = l.distance_km ? ' · 🚗 ' + Number(l.distance_km).toFixed(1) + ' km' : '';
        return '<div style="font-size:12px;color:#475569;margin-top:' + (j === 0 ? '8px' : '3px') + ';">' +
               (legs.length > 1 ? '<strong>#' + (j+1) + '</strong> ' : '') + _btSafeHtml(route) + km + '</div>';
      }).join('');
      var totalKm = (d.total_distance_km != null) ? d.total_distance_km : null;
      return '<div class="bt-list-item">' +
        '<div class="bt-list-row">' +
          '<div>' +
            '<span class="bt-status-badge ' + modeClass + '">' + modeLabel + '</span>' +
            ' <span style="font-weight:700;font-size:13px;color:#0f766e;">' + (d.doc_no || '-') + '</span>' +
          '</div>' +
          '<span class="bt-list-amount">' + totalStr + '</span>' +
        '</div>' +
        legsHtml +
        '<div style="margin-top:4px;font-size:12px;color:#64748b;">📅 ' + _btSafeHtml(dateStr) + (d.purpose ? ' · ' + _btSafeHtml(d.purpose) : '') +
          (totalKm ? ' · 총 ' + Number(totalKm).toFixed(1) + ' km' : '') + '</div>' +
        '<div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="bt-btn-mini bt-btn-mini-excel" onclick="_btDownloadExcel(' + i + ')">📊 Excel</button>' +
          '<button class="bt-btn-mini bt-btn-mini-pdf" onclick="_btDownloadPDF(' + i + ')">📄 PDF</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) {
    console.error('[BT] list fetch failed:', e);
    body.innerHTML = '<div class="bt-empty">⚠️ ' + (_btT('bt_list_fail', '조회 실패')) + '</div>';
  }
}

// ── Excel 다운로드 (legs 포함) ────────────────────────────────────
async function _btDownloadExcel(idx) {
  var rec = _btListCache[idx];
  if (!rec) { showToast('Record not found'); return; }
  if (typeof XLSX === 'undefined') { neoAlert('XLSX 라이브러리 로드 실패'); return; }
  showToast('📊 ' + (_btT('bt_dl_excel_start', 'Excel 생성 중...')));
  try {
    var resp = await fetch('business_trip_template.xlsx');
    var ab = await resp.arrayBuffer();
    var wb = XLSX.read(ab, { type: 'array', cellStyles: true });
    var sn = wb.SheetNames[0];
    var ws = wb.Sheets[sn];
    function setCell(addr, val) {
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].v = val == null ? '' : val;
      ws[addr].t = (typeof val === 'number') ? 'n' : 's';
      delete ws[addr].w; delete ws[addr].f;
    }
    var legs = rec.legs && rec.legs.length ? rec.legs : [{ departure: rec.departure || '', arrival: rec.arrival || '', distance_km: 0 }];
    var firstLeg = legs[0];
    setCell('C6', (rec.applicant_id || '') + ' - ' + (rec.applicant_name || ''));
    setCell('N5', rec.doc_no || '');
    setCell('N6', rec.doc_date || '');
    setCell('A10', rec.attendees || rec.applicant_name || '');
    setCell('B10', rec.trip_from || '');
    setCell('C10', rec.trip_to || '');
    setCell('D10', firstLeg.customer_erp || rec.customer_erp || '');
    setCell('E10', firstLeg.customer_name || rec.customer_name || '');
    setCell('I10', rec.purpose || '');
    // Business tripper detail rows (Row 19-24, 최대 6개 leg 매핑 — A19부터)
    legs.slice(0, 6).forEach(function(l, i) {
      var row = 19 + i;
      setCell('A' + row, rec.applicant_name || '');
      setCell('B' + row, l.departure || '');
      setCell('C' + row, l.arrival || '');
      setCell('D' + row, Number(l.distance_km || 0));
    });
    var amt = rec.amounts || {};
    setCell('F19', Number(amt.gasoline || 0));
    setCell('I19', Number(amt.hotel || 0));
    setCell('L19', Number(amt.allowance || 0));
    setCell('M19', Number(amt.service || 0));
    setCell('N19', Number(amt.airfare || 0));
    setCell('O19', Number(amt.others || 0));
    setCell('P19', Number(rec.total || 0));
    setCell('F26', Number(amt.gasoline || 0));
    setCell('I26', Number(amt.hotel || 0));
    setCell('L26', Number(amt.allowance || 0));
    setCell('O26', Number(amt.others || 0));
    setCell('P26', Number(rec.total || 0));
    setCell('B3', rec.mode === 'advance');
    setCell('B4', rec.mode === 'settlement');
    // 기타 상세 (있다면 비고와 함께 K34 셀에 합쳐서)
    var detail = (rec.amounts_detail || {}).others || '';
    var remarkLine = [detail ? ('기타: ' + detail) : '', rec.remark || ''].filter(Boolean).join(' / ');
    if (remarkLine) setCell('K34', remarkLine);
    var out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    var blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var fileName = 'BusinessTrip_' + (rec.doc_no || 'doc') + '.xlsx';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
    showToast('✅ ' + (_btT('bt_dl_excel_ok', 'Excel 다운로드 완료')));
  } catch(e) {
    console.error('[BT] excel download failed:', e);
    neoAlert((_btT('bt_dl_excel_fail', 'Excel 다운로드 실패')) + ': ' + (e.message || e));
  }
}

// ── PDF 다운로드 (legs 포함) ──────────────────────────────────────
async function _btDownloadPDF(idx) {
  var rec = _btListCache[idx];
  if (!rec) { showToast('Record not found'); return; }
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    neoAlert(_btT('bt_dl_pdf_fail', 'PDF 라이브러리 로드 실패')); return;
  }
  showToast('📄 ' + _btT('bt_dl_pdf_start', 'PDF 생성 중...'));
  var amt = rec.amounts || {};
  var detail = (rec.amounts_detail && rec.amounts_detail.others) || '';
  var legs = (rec.legs && rec.legs.length) ? rec.legs : [{ departure: rec.departure || '', arrival: rec.arrival || '', distance_km: 0, customer_erp: rec.customer_erp || '', customer_name: rec.customer_name || '' }];
  var days = 1, nights = 0;
  if (rec.trip_from && rec.trip_to) {
    var d1 = new Date(rec.trip_from + 'T00:00:00');
    var d2 = new Date(rec.trip_to   + 'T00:00:00');
    if (!isNaN(d1) && !isNaN(d2) && d2 >= d1) {
      days = Math.round((d2 - d1) / 86400000) + 1;
      nights = Math.max(0, days - 1);
    }
  }
  var totalKm = Number(rec.total_distance_km || legs.reduce(function(s,l){ return s + Number(l.distance_km||0); }, 0));
  var advChk = rec.mode === 'advance' ? '☑' : '☐';
  var stlChk = rec.mode === 'settlement' ? '☑' : '☐';
  var fmt = function(v){ return Number(v||0).toLocaleString(); };
  var bodyRows = legs.map(function(l, i){
    var first = (i === 0);
    var depProv = _btExtractProvince(l.departure || '');
    var arrProv = _btExtractProvince(l.arrival || '');
    var route = depProv + (arrProv ? ' → ' + arrProv : '');
    var distance = Number(l.distance_km||0).toFixed(1);
    return '<tr>' +
      '<td style="padding:4px;border:1px solid #000;text-align:left;">' + (first ? _btSafeHtml(rec.applicant_name || '') : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;font-size:10px;text-align:center;white-space:nowrap;">' + _btSafeHtml(route) + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + distance + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first ? (_btGasolineRatePerKm || 5) : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first ? fmt(amt.gasoline) : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first ? nights : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first ? _btHotelPerNight : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first ? fmt(amt.hotel) : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first ? days : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first ? _btDailyAllowance : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first ? fmt(amt.allowance) : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first && Number(amt.service) > 0 ? '1' : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first ? fmt(amt.service) : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first ? fmt(amt.airfare) : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;">' + (first ? fmt(amt.others) : '') + '</td>' +
      '<td style="padding:4px;border:1px solid #000;text-align:right;font-weight:700;">' + (first ? fmt(rec.total) : '') + '</td>' +
    '</tr>';
  }).join('');
  var temp = document.createElement('div');
  temp.style.cssText = 'position:fixed;left:-9999px;top:0;width:1180px;background:#fff;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#000;font-size:11px;line-height:1.4;';
  temp.innerHTML =
    '<div style="text-align:center;font-size:14px;font-weight:700;margin-bottom:6px;">' +
      'ฟอร์มการเดินทางเพื่อธุรกิจ_ภายในประเทศ<br>Business Trip Format_Domestic' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">' +
      '<tr>' +
        '<td style="width:50%;padding:6px 4px;font-size:11px;">' +
          '<div>' + advChk + ' &nbsp; เบิกล่วงหน้า / Advance</div>' +
          '<div>' + stlChk + ' &nbsp; เคลียที่เบิกล่วงหน้า / Settlement</div>' +
        '</td>' +
        '<td style="width:50%;padding:6px 4px;font-size:11px;text-align:right;">' +
          '<div>Document No : <strong>' + _btSafeHtml(rec.doc_no || '') + '</strong></div>' +
          '<div>วันที่ทำเอกสาร / Date : ' + _btSafeHtml(rec.doc_date || '') + '</div>' +
        '</td>' +
      '</tr>' +
      '<tr><td colspan="2" style="padding:4px;font-size:11px;border-top:1px solid #ccc;">' +
        'ชื่อผู้บิก / Name : <strong>' + _btSafeHtml((rec.applicant_id || '') + ' - ' + (rec.applicant_name || '')) + '</strong>' +
      '</td></tr>' +
    '</table>' +
    '<div style="font-weight:700;font-size:12px;margin:6px 0 4px;">Duration</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed;">' +
      '<colgroup>' +
        '<col style="width:12%;">' +
        '<col style="width:9%;">' +
        '<col style="width:9%;">' +
        '<col style="width:8%;">' +
        '<col style="width:14%;">' +
        '<col style="width:48%;">' +
      '</colgroup>' +
      '<thead><tr style="background:#e5e7eb;">' +
        '<th style="padding:4px;border:1px solid #000;">Name</th>' +
        '<th style="padding:4px;border:1px solid #000;">From</th>' +
        '<th style="padding:4px;border:1px solid #000;">To</th>' +
        '<th style="padding:4px;border:1px solid #000;">Customer code</th>' +
        '<th style="padding:4px;border:1px solid #000;">Customer name</th>' +
        '<th style="padding:4px;border:1px solid #000;">Purpose</th>' +
      '</tr></thead><tbody><tr>' +
        '<td style="padding:4px;border:1px solid #000;word-break:break-word;">' + _btSafeHtml(rec.attendees || rec.applicant_name || '') + '</td>' +
        '<td style="padding:4px;border:1px solid #000;text-align:center;">' + _btSafeHtml(rec.trip_from || '') + '</td>' +
        '<td style="padding:4px;border:1px solid #000;text-align:center;">' + _btSafeHtml(rec.trip_to || '') + '</td>' +
        '<td style="padding:4px;border:1px solid #000;text-align:center;">' + _btSafeHtml(legs[0].customer_erp || rec.customer_erp || '') + '</td>' +
        '<td style="padding:4px;border:1px solid #000;font-size:9px;word-break:break-word;">' + _btSafeHtml(legs[0].customer_name || rec.customer_name || '') + '</td>' +
        '<td style="padding:4px;border:1px solid #000;word-break:break-word;">' + _btSafeHtml(rec.purpose || '') + '</td>' +
      '</tr></tbody>' +
    '</table>' +
    '<div style="font-weight:700;font-size:12px;margin:10px 0 4px;">Business Tripper</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed;">' +
      '<colgroup>' +
        '<col style="width:7%;">' +   /* Name */
        '<col style="width:13%;">' +  /* Province / Route */
        '<col style="width:4%;"><col style="width:4%;"><col style="width:6%;">' + /* Gasoline KM/Rate/Amount */
        '<col style="width:4%;"><col style="width:4%;"><col style="width:6%;">' + /* Hotel Night/Rate/Amount */
        '<col style="width:4%;"><col style="width:4%;"><col style="width:6%;">' + /* Trip allowance Day/Rate/Amount */
        '<col style="width:4%;"><col style="width:6%;">' +  /* Service Person/Amount */
        '<col style="width:8%;">' +   /* Air flight */
        '<col style="width:7%;">' +   /* Others */
        '<col style="width:13%;">' +  /* Total */
      '</colgroup>' +
      '<thead>' +
        '<tr style="background:#dbeafe;">' +
          '<th rowspan="2" style="padding:3px;border:1px solid #000;white-space:nowrap;">Name</th>' +
          '<th rowspan="2" style="padding:3px;border:1px solid #000;white-space:nowrap;">Province / Route</th>' +
          '<th colspan="3" style="padding:3px;border:1px solid #000;">Gasoline 1)</th>' +
          '<th colspan="3" style="padding:3px;border:1px solid #000;">Hotel 2)</th>' +
          '<th colspan="3" style="padding:3px;border:1px solid #000;">Trip allowance 3)</th>' +
          '<th colspan="2" style="padding:3px;border:1px solid #000;">Service 4)</th>' +
          '<th rowspan="2" style="padding:3px;border:1px solid #000;white-space:nowrap;">Air flight</th>' +
          '<th rowspan="2" style="padding:3px;border:1px solid #000;white-space:nowrap;">Others</th>' +
          '<th rowspan="2" style="padding:3px;border:1px solid #000;white-space:nowrap;">Total</th>' +
        '</tr>' +
        '<tr style="background:#eff6ff;">' +
          '<th style="padding:3px;border:1px solid #000;">K.M.</th><th style="padding:3px;border:1px solid #000;">Rate</th><th style="padding:3px;border:1px solid #000;">Amount</th>' +
          '<th style="padding:3px;border:1px solid #000;">Night</th><th style="padding:3px;border:1px solid #000;">Rate</th><th style="padding:3px;border:1px solid #000;">Amount</th>' +
          '<th style="padding:3px;border:1px solid #000;">Day</th><th style="padding:3px;border:1px solid #000;">Rate</th><th style="padding:3px;border:1px solid #000;">Amount</th>' +
          '<th style="padding:3px;border:1px solid #000;">Person</th><th style="padding:3px;border:1px solid #000;">Amount</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + bodyRows +
        '<tr style="background:#fef3c7;font-weight:700;">' +
          '<td colspan="2" style="padding:4px;border:1px solid #000;text-align:right;">Actual Amount</td>' +
          '<td colspan="3" style="padding:4px;border:1px solid #000;text-align:right;">' + fmt(amt.gasoline) + '</td>' +
          '<td colspan="3" style="padding:4px;border:1px solid #000;text-align:right;">' + fmt(amt.hotel) + '</td>' +
          '<td colspan="3" style="padding:4px;border:1px solid #000;text-align:right;">' + fmt(amt.allowance) + '</td>' +
          '<td colspan="2" style="padding:4px;border:1px solid #000;text-align:right;">' + fmt(amt.service) + '</td>' +
          '<td style="padding:4px;border:1px solid #000;text-align:right;">' + fmt(amt.airfare) + '</td>' +
          '<td style="padding:4px;border:1px solid #000;text-align:right;">' + fmt(amt.others) + '</td>' +
          '<td style="padding:4px;border:1px solid #000;text-align:right;">' + fmt(rec.total) + '</td>' +
        '</tr>' +
      '</tbody>' +
    '</table>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:10px;">' +
      '<tr>' +
        '<td style="width:45%;padding:4px;vertical-align:top;">' +
          '<table style="border-collapse:collapse;">' +
            '<tr><td style="padding:4px 8px;">Advance / Actual amount :</td><td style="padding:4px 8px;border-bottom:1px solid #000;width:100px;text-align:right;font-weight:700;">' + fmt(rec.total) + '</td><td style="padding:4px 8px;">Baht</td></tr>' +
            '<tr><td style="padding:4px 8px;">Deduct Advance amount :</td><td style="padding:4px 8px;border-bottom:1px solid #000;width:100px;"></td><td style="padding:4px 8px;">Baht</td></tr>' +
            '<tr><td style="padding:4px 8px;">Return to Company :</td><td style="padding:4px 8px;border-bottom:1px solid #000;width:100px;"></td><td style="padding:4px 8px;">Baht</td></tr>' +
            '<tr><td style="padding:4px 8px;">Pay to Staff :</td><td style="padding:4px 8px;border-bottom:1px solid #000;width:100px;"></td><td style="padding:4px 8px;">Baht</td></tr>' +
          '</table>' +
        '</td>' +
        '<td style="width:55%;padding:8px;vertical-align:top;font-size:9px;border-left:1px solid #ccc;">' +
          '<strong>Remark :</strong><br>' +
          '1) Gasoline rate announce in Group ware by monthly<br>' +
          '2) Hotel 2 persons / room, if man and women can separate room.<br>' +
          '&nbsp;&nbsp;&nbsp;&nbsp;Hotel rate 650 baht / night, if price over get confirm from MD<br>' +
          '3) Freelancer 500 baht / person : Need to get confirm from MD in advance' +
          (detail ? '<br><br><strong>Others detail :</strong> ' + _btSafeHtml(detail) : '') +
          (rec.remark ? '<br><br><strong>Note :</strong> ' + _btSafeHtml(rec.remark) : '') +
          (totalKm ? '<br><br><strong>Total distance :</strong> ' + totalKm.toFixed(1) + ' km' : '') +
        '</td>' +
      '</tr>' +
    '</table>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:24px;font-size:11px;">' +
      '<tr>' +
        '<td style="width:50%;padding:8px;text-align:center;">' +
          '<div style="margin-bottom:30px;">Requirement by</div>' +
          '<div style="border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:200px;">Signature</div>' +
        '</td>' +
        '<td style="width:50%;padding:8px;text-align:center;">' +
          '<div style="margin-bottom:30px;">Approve by</div>' +
          '<div style="border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:200px;">Signature</div>' +
        '</td>' +
      '</tr>' +
    '</table>';
  document.body.appendChild(temp);
  try {
    var canvas = await html2canvas(temp, { scale: 2, backgroundColor: '#fff', useCORS: true });
    var imgData = canvas.toDataURL('image/jpeg', 0.92);
    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    var pdfW = 297, pdfH = 210;
    var imgW = pdfW - 16;
    var imgH = canvas.height * imgW / canvas.width;
    if (imgH > pdfH - 16) {
      imgH = pdfH - 16;
      imgW = canvas.width * imgH / canvas.height;
    }
    var x = (pdfW - imgW) / 2;
    pdf.addImage(imgData, 'JPEG', x, 8, imgW, imgH);
    var fileName = 'BusinessTrip_' + (rec.doc_no || 'doc') + '.pdf';
    pdf.save(fileName);
    showToast('✅ ' + _btT('bt_dl_pdf_ok', 'PDF 다운로드 완료'));
  } catch(e) {
    console.error('[BT] pdf failed:', e);
    neoAlert(_btT('bt_dl_pdf_fail', 'PDF 다운로드 실패') + ': ' + (e.message || e));
  } finally {
    if (temp.parentNode) temp.parentNode.removeChild(temp);
  }
}
window._btDownloadExcel = _btDownloadExcel;
window._btDownloadPDF = _btDownloadPDF;
window._btSwitchTab = _btSwitchTab;
window._btSubmit = _btSubmit;
window._btResetForm = _btResetForm;
window._btCalcTotal = _btCalcTotal;
window._btAddLeg = _btAddLeg;
window._btRemoveLeg = _btRemoveLeg;
window._btToggleHotelManual = _btToggleHotelManual;

// ── 초기화 ──────────────────────────────────────────────────────
(async function _btInit() {
  if (document.readyState === 'loading') {
    await new Promise(function(r){ document.addEventListener('DOMContentLoaded', r); });
  }
  await _btLoadUser();
  if (!_btMe) return;
  var who = (_btMe.empid ? _btMe.empid + ' - ' : '') + (_btMe.name || _btMe.nickname || '');
  document.getElementById('btApplicant').value = who.trim() || _btMe.email || '';
  document.getElementById('btDocNo').value = _btGenDocNo('advance');
  _btSetDefaultDates();
  _btCalcTotal();
  _btBindModeChange();
  _btBindCustomerSearch();
  // 시작일/종료일 변경 시 자동 재계산
  ['btTripFrom','btTripTo'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', _btCalcAutoAmounts);
  });
  // 단가 fetch (백그라운드)
  await _btLoadRates();
  // 첫 leg 추가
  _btMakeLegRow();
  // 자동 계산 1차 실행
  _btCalcAutoAmounts();
  if (typeof applyLang === 'function') applyLang();
})();
