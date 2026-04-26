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
    list.innerHTML = '<div class="bt-search-item" style="color:#94a3b8;cursor:default;">' + (_btT('bt_no_cust') || '검색 결과 없음') + '</div>';
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
    '<div class="bt-row">' +
      '<span class="bt-label" data-i18n="bt_departure">출발지</span>' +
      '<input type="text" id="btDep_' + id + '" class="bt-input" placeholder="출발 주소 또는 상호명" data-i18n-placeholder="bt_departure_ph" autocomplete="off">' +
    '</div>' +
    '<div class="bt-row bt-leg-search">' +
      '<span class="bt-label" data-i18n="bt_arrival">도착지</span>' +
      '<input type="text" id="btArr_' + id + '" class="bt-input" placeholder="고객명 / 주소 / 상호" data-i18n-placeholder="bt_arrival_ph" autocomplete="off">' +
      '<div class="bt-leg-search-list" id="btArrList_' + id + '"></div>' +
    '</div>' +
    '<div id="btLegDist_' + id + '" class="bt-leg-distance" style="display:none;">🚗 <span id="btLegDistVal_' + id + '">-</span></div>' +
    '<div id="btLegMap_' + id + '" class="bt-leg-map">' +
      '<iframe id="btLegMapFrame_' + id + '" width="100%" height="100%" frameborder="0" style="border:0;" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>' +
    '</div>';
  document.getElementById('btLegsContainer').appendChild(card);

  // 출발지: Google Places Autocomplete (주소/상호)
  var depEl = document.getElementById('btDep_' + id);
  _btAttachDepartureAutocomplete(depEl, leg);

  // 도착지: 우리 자체 dropdown (고객 + Places predictions 통합)
  var arrEl = document.getElementById('btArr_' + id);
  _btAttachArrivalDropdown(arrEl, leg);

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
  if (_btLegs.length <= 1) { showToast(_btT('bt_leg_min') || '최소 1개의 일정이 필요합니다.'); return; }
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

// ── 출발지 Autocomplete (Google Places) ────────────────────────────
function _btAttachDepartureAutocomplete(input, leg) {
  function tryAttach() {
    if (!_btEnsureGmapsServices()) { setTimeout(tryAttach, 400); return; }
    if (input._gPlacesAttached) return;
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
        leg.departure = full;
        leg.dep_loc = (p.geometry && p.geometry.location) ? { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() } : null;
        _btUpdateLegMapAndDistance(leg);
      });
      input.addEventListener('change', function(){ leg.departure = input.value; _btUpdateLegMapAndDistance(leg); });
      input.addEventListener('blur', function(){ leg.departure = input.value; setTimeout(function(){ _btUpdateLegMapAndDistance(leg); }, 200); });
    } catch(e) { console.warn('[BT] dep autocomplete failed:', e); }
  }
  tryAttach();
}

// ── 도착지 통합 dropdown (고객 + Places predictions) ────────────────
function _btAttachArrivalDropdown(input, leg) {
  var listEl = document.getElementById('btArrList_' + leg.id);
  function onInput() {
    var q = input.value.trim();
    if (_btLegSearchTimer[leg.id]) clearTimeout(_btLegSearchTimer[leg.id]);
    _btLegSearchTimer[leg.id] = setTimeout(function(){ _btDoArrivalSearch(input, listEl, leg, q); }, 220);
  }
  input.addEventListener('input', onInput);
  input.addEventListener('focus', function(){ if (input.value.trim()) onInput(); });
  document.addEventListener('click', function(e) {
    if (e.target !== input && !listEl.contains(e.target)) listEl.style.display = 'none';
  });
}

async function _btDoArrivalSearch(input, listEl, leg, q) {
  if (!q) { listEl.style.display = 'none'; return; }
  var lower = q.toLowerCase();
  // 1) 고객 검색
  await _btLoadCustomers();
  var custMatches = _btCustomers.filter(function(c){
    var hay = ((c.erp||'') + ' ' + (c.clinic||'') + ' ' + (c.name_th||'') + ' ' + (c.name_en||'')).toLowerCase();
    return hay.indexOf(lower) !== -1;
  }).slice(0, 8);
  // 2) Google Places predictions
  var placeMatches = [];
  if (_btEnsureGmapsServices()) {
    try {
      placeMatches = await new Promise(function(resolve){
        _btAcService.getPlacePredictions({
          input: q,
          componentRestrictions: { country: 'th' }
        }, function(predictions, status) {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) return resolve([]);
          resolve(predictions.slice(0, 8));
        });
      });
    } catch(e) { placeMatches = []; }
  }
  if (!custMatches.length && !placeMatches.length) {
    listEl.innerHTML = '<div class="bt-search-item" style="color:#94a3b8;cursor:default;">' + (_btT('bt_no_results') || '검색 결과 없음') + '</div>';
    listEl.style.display = 'block';
    return;
  }
  var html = '';
  // 고객 그룹
  custMatches.forEach(function(c){
    html += '<div class="bt-search-item" data-type="cust" data-erp="' + _btSafeHtml(c.erp) + '">' +
      '<div><span class="bt-cust-tag">' + (_btT('bt_tag_customer') || '고객') + '</span><strong style="color:#0f766e;">' + _btSafeHtml(c.erp) + '</strong></div>' +
      '<div style="font-size:12px;color:#475569;margin-top:2px;">' + _btSafeHtml(c.clinic || c.name_en || c.name_th) + '</div>' +
      (c.addr_reg ? '<div style="font-size:11px;color:#94a3b8;margin-top:1px;">📍 ' + _btSafeHtml(c.addr_reg) + '</div>' : '') +
    '</div>';
  });
  // 장소 그룹
  placeMatches.forEach(function(p){
    html += '<div class="bt-search-item" data-type="place" data-place-id="' + _btSafeHtml(p.place_id) + '" data-desc="' + _btSafeHtml(p.description) + '">' +
      '<div><span class="bt-place-tag">' + (_btT('bt_tag_place') || '장소') + '</span></div>' +
      '<div style="font-size:13px;color:#1e293b;margin-top:2px;">' + _btSafeHtml(p.description) + '</div>' +
    '</div>';
  });
  listEl.innerHTML = html;
  listEl.style.display = 'block';
  listEl.querySelectorAll('.bt-search-item[data-type]').forEach(function(el){
    el.addEventListener('click', function() {
      var type = el.getAttribute('data-type');
      if (type === 'cust') {
        var erp = el.getAttribute('data-erp');
        var c = _btCustomers.find(function(x){ return x.erp === erp; });
        if (!c) return;
        var label = c.erp + ' · ' + (c.clinic || c.name_en || c.name_th);
        input.value = label;
        leg.arrival = c.addr_reg || label;
        leg.customer_erp = c.erp;
        leg.customer_name = c.clinic || c.name_en || c.name_th;
        // 좌표 lookup 시도 (주소가 있으면 geocode)
        if (c.addr_reg && _btEnsureGmapsServices()) {
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
      } else if (type === 'place') {
        var pid = el.getAttribute('data-place-id');
        var desc = el.getAttribute('data-desc');
        if (_btPlacesService && pid) {
          _btPlacesService.getDetails({ placeId: pid, fields: ['formatted_address','name','geometry'] }, function(p, status) {
            if (status === google.maps.places.PlacesServiceStatus.OK && p) {
              var addr = p.formatted_address || desc;
              var name = p.name || '';
              var full = (name && addr && !addr.startsWith(name)) ? (name + ', ' + addr) : (addr || name || desc);
              input.value = full;
              leg.arrival = full;
              leg.customer_erp = '';
              leg.customer_name = '';
              leg.arr_loc = (p.geometry && p.geometry.location) ? { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() } : null;
            } else {
              input.value = desc;
              leg.arrival = desc;
            }
            _btUpdateLegMapAndDistance(leg);
          });
        } else {
          input.value = desc;
          leg.arrival = desc;
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
    hotel:    parseFloat(document.getElementById('btAmtHotel').value || 0) || 0,
    service:  parseFloat(document.getElementById('btAmtService').value || 0) || 0,
    airfare:  parseFloat(document.getElementById('btAmtAirfare').value || 0) || 0,
    gasoline: parseFloat(document.getElementById('btAmtGasoline').value || 0) || 0,
    allowance:parseFloat(document.getElementById('btAmtAllowance').value || 0) || 0,
    others:   parseFloat(document.getElementById('btAmtOthers').value || 0) || 0
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
    total: total
  };
}

async function _btSubmit() {
  if (!_btMe) { neoAlert(_btT('bt_auth_required') || '로그인이 필요합니다.'); return; }
  var rec = _btCollectRecord();
  if (!rec.trip_from || !rec.trip_to) { neoAlert(_btT('bt_err_dates') || '출장 기간을 입력해주세요.'); return; }
  var validLegs = (rec.legs || []).filter(function(l){ return l.departure && l.arrival; });
  if (!validLegs.length) { neoAlert(_btT('bt_err_place') || '최소 1개 일정의 출발지·도착지를 입력해주세요.'); return; }
  if (!rec.purpose) { neoAlert(_btT('bt_err_purpose') || '목적을 입력해주세요.'); return; }
  rec.status = 'submitted';
  rec.created_at = firebase.firestore.FieldValue.serverTimestamp();
  rec.updated_at = firebase.firestore.FieldValue.serverTimestamp();
  try {
    await _fbDb.collection('businessTrips').add(rec);
    showToast('✅ ' + (_btT('bt_submitted') || '제출되었습니다.') + ' (' + rec.doc_no + ')');
    _btResetForm();
    setTimeout(function(){ _btSwitchTab('list'); }, 600);
  } catch(e) {
    console.error('[BT] submit failed:', e);
    neoAlert((_btT('bt_submit_fail') || '제출 실패') + ': ' + (e.message || e));
  }
}

function _btResetForm() {
  ['btAmtHotel','btAmtService','btAmtAirfare','btAmtGasoline','btAmtAllowance','btAmtOthers'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = 0;
  });
  ['btCustomerSearch','btAttendees','btPurpose','btRemark'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '';
  });
  _btSelectedCustomer = null;
  document.querySelector('input[name=bt_mode][value=advance]').checked = true;
  document.getElementById('btDocNo').value = _btGenDocNo('advance');
  // legs 초기화
  _btLegs = [];
  document.getElementById('btLegsContainer').innerHTML = '';
  _btMakeLegRow();
  _btSetDefaultDates();
  _btCalcTotal();
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
    body.innerHTML = '<div class="bt-empty">⚠️ ' + (_btT('bt_list_fail') || '조회 실패') + '</div>';
  }
}

// ── Excel 다운로드 (legs 포함) ────────────────────────────────────
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
    if (rec.remark) setCell('K34', rec.remark);
    var out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    var blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var fileName = 'BusinessTrip_' + (rec.doc_no || 'doc') + '.xlsx';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
    showToast('✅ ' + (_btT('bt_dl_excel_ok') || 'Excel 다운로드 완료'));
  } catch(e) {
    console.error('[BT] excel download failed:', e);
    neoAlert((_btT('bt_dl_excel_fail') || 'Excel 다운로드 실패') + ': ' + (e.message || e));
  }
}

// ── PDF 다운로드 (legs 포함) ──────────────────────────────────────
async function _btDownloadPDF(idx) {
  var rec = _btListCache[idx];
  if (!rec) { showToast('Record not found'); return; }
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    neoAlert('PDF 라이브러리 로드 실패'); return;
  }
  showToast('📄 ' + (_btT('bt_dl_pdf_start') || 'PDF 생성 중...'));
  var temp = document.createElement('div');
  temp.style.cssText = 'position:fixed;left:-9999px;top:0;width:780px;background:#fff;padding:28px;font-family:-apple-system,sans-serif;color:#1e293b;';
  var modeLabel = rec.mode === 'settlement' ? '정산 (Settlement)' : '가불 (Advance)';
  var amt = rec.amounts || {};
  var amtRow = function(lbl, v) {
    return '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;">' + lbl + '</td>' +
           '<td style="padding:6px 10px;border:1px solid #cbd5e1;text-align:right;">' + (Number(v||0)).toLocaleString() + '</td></tr>';
  };
  var legs = rec.legs && rec.legs.length ? rec.legs : [{ departure: rec.departure || '', arrival: rec.arrival || '', distance_km: 0 }];
  var legsTable = '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">' +
    '<thead><tr style="background:#0f766e;color:#fff;"><th style="padding:6px;border:1px solid #cbd5e1;">#</th><th style="padding:6px;border:1px solid #cbd5e1;">출발</th><th style="padding:6px;border:1px solid #cbd5e1;">도착</th><th style="padding:6px;border:1px solid #cbd5e1;">고객</th><th style="padding:6px;border:1px solid #cbd5e1;">거리(km)</th></tr></thead><tbody>' +
    legs.map(function(l, i){
      return '<tr><td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">' + (i+1) + '</td>' +
             '<td style="padding:6px;border:1px solid #cbd5e1;">' + _btSafeHtml(l.departure || '') + '</td>' +
             '<td style="padding:6px;border:1px solid #cbd5e1;">' + _btSafeHtml(l.arrival || '') + '</td>' +
             '<td style="padding:6px;border:1px solid #cbd5e1;">' + _btSafeHtml((l.customer_erp || '') + ' ' + (l.customer_name || '')) + '</td>' +
             '<td style="padding:6px;border:1px solid #cbd5e1;text-align:right;">' + (Number(l.distance_km||0)).toFixed(1) + '</td></tr>';
    }).join('') + '</tbody></table>';
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
      '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Attendees</td>' +
          '<td style="padding:6px 10px;border:1px solid #cbd5e1;">' + _btSafeHtml(rec.attendees || '') + '</td></tr>' +
      '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Purpose</td>' +
          '<td style="padding:6px 10px;border:1px solid #cbd5e1;">' + _btSafeHtml(rec.purpose || '') + '</td></tr>' +
      '<tr><td style="padding:6px 10px;border:1px solid #cbd5e1;background:#f1f5f9;">Total Distance</td>' +
          '<td style="padding:6px 10px;border:1px solid #cbd5e1;">' + (Number(rec.total_distance_km||0).toFixed(1)) + ' km</td></tr>' +
    '</table>' +
    '<h3 style="margin:14px 0 6px;color:#0f766e;font-size:14px;">Itinerary</h3>' + legsTable +
    '<h3 style="margin:14px 0 6px;color:#0f766e;font-size:14px;">Expenses (Baht)</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
      amtRow('🏨 Hotel', amt.hotel) + amtRow('🤝 Service', amt.service) + amtRow('✈️ Air Fare', amt.airfare) +
      amtRow('⛽ Gasoline', amt.gasoline) + amtRow('📋 Allowance', amt.allowance) + amtRow('📦 Others', amt.others) +
      '<tr style="background:#0d9488;color:#fff;font-weight:700;">' +
        '<td style="padding:8px 10px;">TOTAL</td>' +
        '<td style="padding:8px 10px;text-align:right;font-size:15px;">' + (Number(rec.total||0)).toLocaleString() + '</td></tr>' +
    '</table>' +
    (rec.remark ? '<div style="margin-top:14px;font-size:12px;color:#475569;"><strong>Remark:</strong> ' + _btSafeHtml(rec.remark) + '</div>' : '');
  document.body.appendChild(temp);
  try {
    var canvas = await html2canvas(temp, { scale: 2, backgroundColor: '#fff', useCORS: true });
    var imgData = canvas.toDataURL('image/jpeg', 0.92);
    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    var pdfW = 210, pdfH = 297;
    var imgW = pdfW - 16;
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

window._btDownloadExcel = _btDownloadExcel;
window._btDownloadPDF = _btDownloadPDF;
window._btSwitchTab = _btSwitchTab;
window._btSubmit = _btSubmit;
window._btResetForm = _btResetForm;
window._btCalcTotal = _btCalcTotal;
window._btAddLeg = _btAddLeg;
window._btRemoveLeg = _btRemoveLeg;

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
  // 첫 leg 추가
  _btMakeLegRow();
  if (typeof applyLang === 'function') applyLang();
})();
