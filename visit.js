// visit.js — Visit Log module (extracted from visit.html)
// Uses global: _fbDb (Firestore), getCurrentUser(), _isAdmin(), DATA[]

// ══ i18n ══
var _VL = {
  vl_title:{ko:'방문 일지',en:'Visit Log',th:'บันทึกการเยี่ยม'},
  vl_new:{ko:'새 방문 기록',en:'New Visit',th:'บันทึกใหม่'},
  vl_date:{ko:'날짜',en:'Date',th:'วันที่'},
  vl_customer:{ko:'고객',en:'Customer',th:'ลูกค้า'},
  vl_erp:{ko:'ERP 코드',en:'ERP Code',th:'รหัส ERP'},
  vl_type:{ko:'방문 유형',en:'Visit Type',th:'ประเภทการเยี่ยม'},
  vl_type_regular:{ko:'정기 방문',en:'Regular Visit',th:'เยี่ยมปกติ'},
  vl_type_new:{ko:'신규 방문',en:'New Visit',th:'เยี่ยมใหม่'},
  vl_type_follow:{ko:'후속 방문',en:'Follow-up',th:'ติดตาม'},
  vl_type_complaint:{ko:'클레임',en:'Complaint',th:'ร้องเรียน'},
  vl_type_demo:{ko:'데모',en:'Demo',th:'สาธิต'},
  vl_purpose:{ko:'방문 목적',en:'Purpose',th:'วัตถุประสงค์'},
  vl_result:{ko:'방문 결과',en:'Result',th:'ผลลัพธ์'},
  vl_next:{ko:'후속 조치',en:'Next Action',th:'การดำเนินการต่อไป'},
  vl_photo:{ko:'사진 첨부',en:'Attach Photos',th:'แนบรูปภาพ'},
  vl_photo_add:{ko:'사진 추가',en:'Add Photo',th:'เพิ่มรูป'},
  vl_location:{ko:'위치',en:'Location',th:'ตำแหน่ง'},
  vl_address:{ko:'주소',en:'Address',th:'ที่อยู่'},
  vl_save:{ko:'저장',en:'Save',th:'บันทึก'},
  vl_cancel:{ko:'취소',en:'Cancel',th:'ยกเลิก'},
  vl_delete:{ko:'삭제',en:'Delete',th:'ลบ'},
  vl_edit:{ko:'수정',en:'Edit',th:'แก้ไข'},
  vl_no_data:{ko:'방문 기록이 없습니다',en:'No visit records',th:'ไม่มีบันทึกการเยี่ยม'},
  vl_search:{ko:'고객명/ERP 검색...',en:'Search customer/ERP...',th:'ค้นหาลูกค้า/ERP...'},
  vl_gps:{ko:'GPS 캡처',en:'Capture GPS',th:'จับตำแหน่ง GPS'},
  vl_saved:{ko:'저장되었습니다',en:'Saved successfully',th:'บันทึกสำเร็จ'},
  vl_deleted:{ko:'삭제되었습니다',en:'Deleted',th:'ลบแล้ว'},
  vl_confirm_delete:{ko:'이 방문 기록을 삭제하시겠습니까?',en:'Delete this visit record?',th:'ลบบันทึกนี้?'},
  vl_cal_sync:{ko:'캘린더 연동',en:'Sync to Calendar',th:'ซิงค์ปฏิทิน'},
  vl_cal_syncing:{ko:'연동 중...',en:'Syncing...',th:'กำลังซิงค์...'},
  vl_cal_synced:{ko:'연동 완료',en:'Synced',th:'ซิงค์แล้ว'},
  vl_cal_need_date:{ko:'날짜를 입력하세요.',en:'Please enter a date.',th:'กรุณาระบุวันที่'},
  vl_cal_need_cust:{ko:'고객을 선택하세요.',en:'Please select a customer.',th:'กรุณาเลือกลูกค้า'},
  vl_cal_not_synced:{ko:'미연동',en:'Not Synced',th:'ยังไม่ซิงค์'}
};
var _vlLang = localStorage.getItem('lang') || 'ko';
function _vlt(k) { var o = _VL[k]; return o ? (o[_vlLang] || o.ko || k) : k; }
function _typeLabel(t) {
  var m = {regular:'vl_type_regular','new':'vl_type_new',follow_up:'vl_type_follow',complaint:'vl_type_complaint',demo:'vl_type_demo'};
  return _vlt(m[t] || 'vl_type_regular');
}

// ══ State ══
var _vlVisits = [];
var _vlEditId = null;
var _vlPhotos = [];
var _vlGps = null;

// ══ Window controls ══
function _vlMin() {
  // Minimize not used in overlay mode
}
function _vlRestore() {
  // Restore not used in overlay mode
}
function _vlFs() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(function(){});
}

// ══ Toast ══
function _vlToast(msg) {
  var t = document.getElementById('vlToast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 2000);
}

// ══ Helpers ══
function _todayStr() { var d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _daysAgo(n) { var d = new Date(); d.setDate(d.getDate()-n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _esc(s) { var d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; }

// ══ Customer autocomplete (uses global DATA array from core.js) ══
function _vlSelectCust(c) {
  document.getElementById('vlFErp').value = c.erp || '';
  document.getElementById('vlFCust').value = c.name_th || c.cust_name || c.name_en || '';
  document.getElementById('vlFAddr').value = c.address || '';
  document.getElementById('vlSelErp').textContent = c.erp ? '[' + c.erp + ']' : '';
  document.getElementById('vlSelName').textContent = c.name_th || c.cust_name || c.name_en || '';
  var subEl = document.getElementById('vlSelSub');
  if (subEl) subEl.textContent = c.name_en && c.name_en !== (c.name_th || c.cust_name || '') ? c.name_en : '';
  document.getElementById('vlSearchWrap').style.display = 'none';
  document.getElementById('vlCustSelected').classList.add('show');
  document.getElementById('vlAcList').classList.remove('show');
}
function _vlClearCust() {
  document.getElementById('vlFErp').value = '';
  document.getElementById('vlFCust').value = '';
  document.getElementById('vlFAddr').value = '';
  document.getElementById('vlFSearch').value = '';
  document.getElementById('vlSearchWrap').style.display = '';
  document.getElementById('vlCustSelected').classList.remove('show');
  document.getElementById('vlFSearch').focus();
}
function _vlPositionAC() {
  var inp = document.getElementById('vlFSearch');
  var dd = document.getElementById('vlAcList');
  if (!inp || !dd) return;
  var rect = inp.getBoundingClientRect();
  dd.style.top = rect.bottom + 'px';
  dd.style.left = rect.left + 'px';
  dd.style.width = rect.width + 'px';
}
function _vlSetupAC() {
  var searchIn = document.getElementById('vlFSearch');
  var dd = document.getElementById('vlAcList');
  var timer;
  searchIn.addEventListener('input', function() {
    clearTimeout(timer);
    timer = setTimeout(function() {
      var q = searchIn.value.trim().toLowerCase();
      if (!q) { dd.classList.remove('show'); return; }
      var qNoSpace = q.replace(/\s+/g, '');
      var qIsNum = /^\d+$/.test(q);
      var matches = DATA.filter(function(c) {
        var hay = ((c.erp||'') + ' ' + (c.nt_code||'') + ' ' + (c.name_th||'') + ' ' + (c.cust_name||'') + ' ' + (c.name_en||'') + ' ' + (c.clinic||'')).toLowerCase().replace(/\s+/g, '');
        if (hay.indexOf(qNoSpace) >= 0) return true;
        if (qIsNum && c.nt_code && c.nt_code.toLowerCase().replace(/^nt/i, '').indexOf(q) >= 0) return true;
        return false;
      }).slice(0, 10);
      if (!matches.length) { dd.classList.remove('show'); return; }
      dd.innerHTML = matches.map(function(c, i) {
        var erpStr = c.erp ? '[' + _esc(c.erp) + '] ' : '';
        var ntTag = c.nt_code ? '<span class="vl-ac-nt">' + _esc(c.nt_code) + '</span>' : '';
        var dispName = c.name_th || c.cust_name || c.name_en || '';
        var subName = c.name_en && c.name_en !== dispName ? c.name_en : '';
        return '<div class="vl-ac-item" data-i="' + i + '">' +
          '<div class="vl-ac-main">' +
            '<div class="vl-ac-name">' + _esc(erpStr) + _esc(dispName) + '  ' + ntTag + '</div>' +
            (subName ? '<div class="vl-ac-sub">' + _esc(subName) + '</div>' : '') +
          '</div></div>';
      }).join('');
      dd.querySelectorAll('.vl-ac-item').forEach(function(el, i) {
        el.onclick = function(e) { e.stopPropagation(); _vlSelectCust(matches[i]); };
      });
      _vlPositionAC();
      dd.classList.add('show');
    }, 150);
  });

  var modalBody = document.querySelector('.vl-modal-body');
  if (modalBody) {
    modalBody.addEventListener('scroll', function() {
      if (dd.classList.contains('show')) _vlPositionAC();
    });
  }
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.vl-ac-wrap') && !e.target.closest('.vl-ac-list')) {
      dd.classList.remove('show');
    }
  });
}

// ══ Photo compress ══
function _vlCompressImg(file, maxW, cb) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      cb({ name: file.name, dataUrl: c.toDataURL('image/jpeg', 0.7) });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function _vlHandlePhotos(input) {
  var files = Array.from(input.files).slice(0, 3 - _vlPhotos.length);
  var done = 0;
  files.forEach(function(f) {
    _vlCompressImg(f, 800, function(r) {
      _vlPhotos.push(r); done++;
      if (done === files.length) _vlRenderPhotos();
    });
  });
  input.value = '';
}
function _vlRenderPhotos() {
  var c = document.getElementById('vlPhotoPrev'); c.innerHTML = '';
  _vlPhotos.forEach(function(p, i) {
    var div = document.createElement('div'); div.className = 'vl-photo-item';
    div.innerHTML = '<img src="'+p.dataUrl+'"><button class="vl-photo-rm" onclick="event.stopPropagation();_vlRemovePhoto('+i+')">x</button>';
    c.appendChild(div);
  });
  document.getElementById('vlBtnPhotoLbl').style.display = _vlPhotos.length >= 3 ? 'none' : '';
}
function _vlRemovePhoto(i) { _vlPhotos.splice(i,1); _vlRenderPhotos(); }

// ══ GPS ══
function _vlCaptureGps() {
  var st = document.getElementById('vlGpsStatus'); st.textContent = '...';
  if (!navigator.geolocation) { st.textContent = 'GPS not available'; return; }
  navigator.geolocation.getCurrentPosition(function(pos) {
    _vlGps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    st.textContent = _vlGps.lat.toFixed(5) + ', ' + _vlGps.lng.toFixed(5);
  }, function(err) { st.textContent = 'Error: ' + err.message; }, { enableHighAccuracy: true, timeout: 10000 });
}

// ══ Modal ══
function vlOpenNew() {
  _vlEditId = null;
  document.getElementById('vlModalTitle').textContent = _vlt('vl_new');
  document.getElementById('vlFDate').value = _todayStr();
  document.getElementById('vlFErp').value = '';
  document.getElementById('vlFCust').value = '';
  document.getElementById('vlFSearch').value = '';
  document.getElementById('vlSearchWrap').style.display = '';
  document.getElementById('vlCustSelected').classList.remove('show');
  document.getElementById('vlFType').value = 'regular';
  document.getElementById('vlFPurpose').value = '';
  document.getElementById('vlFResult').value = '';
  document.getElementById('vlFNext').value = '';
  document.getElementById('vlFAddr').value = '';
  _vlPhotos = []; _vlGps = null;
  _vlRenderPhotos();
  document.getElementById('vlGpsStatus').textContent = '';
  document.getElementById('vlAcList').classList.remove('show');
  // 캘린더 연동 버튼 초기화
  var calBtn = document.getElementById('vlBtnCalSync');
  if (calBtn) { calBtn.disabled = false; calBtn.classList.remove('synced'); calBtn.innerHTML = '<span class="cal-sync-icon">📅</span><span>' + _vlt('vl_cal_sync') + '</span>'; }
  document.getElementById('vlModalBg').classList.add('open');
}
function vlOpenEdit(id) {
  var v = _vlVisits.find(function(x){ return x.id === id; });
  if (!v) return;
  _vlEditId = id;
  document.getElementById('vlModalTitle').textContent = _vlt('vl_edit');
  document.getElementById('vlFDate').value = v.date || '';
  document.getElementById('vlFErp').value = v.customer_erp || '';
  document.getElementById('vlFCust').value = v.customer_name || '';
  if (v.customer_erp || v.customer_name) {
    document.getElementById('vlSelErp').textContent = v.customer_erp || '';
    document.getElementById('vlSelName').textContent = v.customer_name || '';
    document.getElementById('vlSearchWrap').style.display = 'none';
    document.getElementById('vlCustSelected').classList.add('show');
  } else {
    document.getElementById('vlFSearch').value = '';
    document.getElementById('vlSearchWrap').style.display = '';
    document.getElementById('vlCustSelected').classList.remove('show');
  }
  document.getElementById('vlFType').value = v.visit_type || 'regular';
  document.getElementById('vlFPurpose').value = v.purpose || '';
  document.getElementById('vlFResult').value = v.result || '';
  document.getElementById('vlFNext').value = v.next_action || '';
  document.getElementById('vlFAddr').value = v.address || '';
  _vlPhotos = (v.photos || []).slice();
  _vlGps = v.location || null;
  _vlRenderPhotos();
  document.getElementById('vlGpsStatus').textContent = _vlGps ? (_vlGps.lat.toFixed(5)+', '+_vlGps.lng.toFixed(5)) : '';
  // 캘린더 연동 버튼 초기화
  var calBtn = document.getElementById('vlBtnCalSync');
  if (calBtn) { calBtn.disabled = false; calBtn.classList.remove('synced'); calBtn.innerHTML = '<span class="cal-sync-icon">📅</span><span>' + _vlt('vl_cal_sync') + '</span>'; }
  document.getElementById('vlModalBg').classList.add('open');
}
function vlCloseModal() { document.getElementById('vlModalBg').classList.remove('open'); }

// ══ Save ══
function vlSave() {
  var user = getCurrentUser();
  if (!user) { alert('Login required'); return; }
  var btn = document.getElementById('vlBtnSave'); btn.disabled = true;
  var data = {
    empid: user.empid, emp_name: user.name || user.empid,
    date: document.getElementById('vlFDate').value,
    customer_erp: document.getElementById('vlFErp').value.trim(),
    customer_name: document.getElementById('vlFCust').value.trim(),
    visit_type: document.getElementById('vlFType').value,
    purpose: document.getElementById('vlFPurpose').value.trim(),
    result: document.getElementById('vlFResult').value.trim(),
    next_action: document.getElementById('vlFNext').value.trim(),
    photos: _vlPhotos, location: _vlGps || null,
    address: document.getElementById('vlFAddr').value.trim(),
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  };
  var p;
  if (_vlEditId) { p = _fbDb.collection('visit_logs').doc(_vlEditId).update(data); }
  else { data.created_at = firebase.firestore.FieldValue.serverTimestamp(); p = _fbDb.collection('visit_logs').add(data); }
  p.then(function() { btn.disabled = false; vlCloseModal(); _vlToast(_vlt('vl_saved')); _vlLoad(); })
   .catch(function(err) { btn.disabled = false; alert('Error: ' + err.message); });
}

// ══ Calendar Sync ══
function _vlSyncToCalendar() {
  var user = getCurrentUser();
  if (!user) { alert('Login required'); return; }
  var btn = document.getElementById('vlBtnCalSync');
  var date = document.getElementById('vlFDate').value;
  var custName = document.getElementById('vlFCust').value.trim();
  var custErp = document.getElementById('vlFErp').value.trim();
  var purpose = document.getElementById('vlFPurpose').value.trim();
  var visitType = document.getElementById('vlFType').value;
  var address = document.getElementById('vlFAddr').value.trim();

  if (!date) { alert(_vlt('vl_cal_need_date') || '날짜를 입력하세요.'); return; }
  if (!custName) { alert(_vlt('vl_cal_need_cust') || '고객을 선택하세요.'); return; }

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="cal-sync-icon">⏳</span><span>' + (_vlt('vl_cal_syncing') || '연동 중...') + '</span>'; }

  var schedData = {
    empid: user.empid,
    emp_name: user.name || user.empid,
    date: date,
    time: '',
    customer_erp: custErp,
    customer_name: custName,
    address: address,
    visit_type: visitType,
    priority: 'normal',
    purpose: purpose,
    notes: '',
    status: 'planned',
    completed_visit_id: '',
    source: 'visit_log',
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  };

  _fbDb.collection('visit_schedules').add(schedData).then(function() {
    if (btn) {
      btn.classList.add('synced');
      btn.innerHTML = '<span class="cal-sync-icon">✅</span><span>' + (_vlt('vl_cal_synced') || '연동 완료') + '</span>';
      btn.disabled = true;
    }
  }).catch(function(err) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="cal-sync-icon">📅</span><span>' + (_vlt('vl_cal_sync') || '캘린더 연동') + '</span>'; }
    alert('Error: ' + err.message);
  });
}

// ══ Delete ══
function vlDelete(id) {
  if (!confirm(_vlt('vl_confirm_delete'))) return;
  _fbDb.collection('visit_logs').doc(id).delete().then(function() { _vlToast(_vlt('vl_deleted')); _vlLoad(); });
}

// ══ Load visits ══
function _vlLoad() {
  var user = getCurrentUser();
  if (!user) return;
  var sp = document.getElementById('vlSpinner');
  var list = document.getElementById('vlList');
  var nd = document.getElementById('vlNoData');
  if (sp) sp.classList.add('show'); list.innerHTML = ''; if (nd) nd.style.display = 'none';

  var from = document.getElementById('vlDateFrom').value;
  var to = document.getElementById('vlDateTo').value;

  var q;
  if (_isAdmin(user)) {
    q = _fbDb.collection('visit_logs').where('date','>=',from).where('date','<=',to).orderBy('date','desc');
  } else {
    q = _fbDb.collection('visit_logs').where('empid','==',user.empid).where('date','>=',from).where('date','<=',to).orderBy('date','desc');
  }

  q.get().then(function(snap) {
    if (sp) sp.classList.remove('show');
    _vlVisits = [];
    snap.forEach(function(doc) { var d = doc.data(); d.id = doc.id; _vlVisits.push(d); });
    // search filter
    var s = document.getElementById('vlSearch').value.trim().toLowerCase();
    var filtered = s ? _vlVisits.filter(function(v) {
      return (v.customer_name||'').toLowerCase().indexOf(s)>=0 || (v.customer_erp||'').toLowerCase().indexOf(s)>=0;
    }) : _vlVisits;
    if (!filtered.length) { if (nd) nd.style.display = 'block'; return; }
    _vlRender(filtered);
  }).catch(function(err) {
    if (sp) sp.classList.remove('show');
    console.error('[VisitLog] Query error:', err);
    if (err.message && err.message.indexOf('index') >= 0) {
      if (nd) { nd.textContent = 'Firestore index required. Check console.'; nd.style.display = 'block'; }
    }
  });
}

// ══ Render visits ══
function _vlRender(visits) {
  var user = getCurrentUser();
  var isAdm = _isAdmin(user);
  var list = document.getElementById('vlList'); list.innerHTML = '';

  visits.forEach(function(v) {
    var canEdit = isAdm || (user && v.empid === user.empid);
    var card = document.createElement('div'); card.className = 'vl-card';
    var bCls = 'vl-badge vl-badge-' + (v.visit_type || 'regular');

    var html = '<div class="vl-card-hdr"><span class="vl-date">' + _esc(v.date) + '</span><span class="'+bCls+'">' + _esc(_typeLabel(v.visit_type)) + '</span></div>';
    if (isAdm) html += '<div class="vl-emp">' + _esc(v.emp_name || v.empid) + '</div>';
    html += '<div class="vl-cust">' + _esc(v.customer_name||'-') + (v.customer_erp ? ' <span style="color:#6b7280;font-size:12px;">('+_esc(v.customer_erp)+')</span>' : '') + '</div>';
    html += '<div class="vl-purp">' + _esc(v.purpose||'') + '</div>';

    // detail
    html += '<div class="vl-detail" id="vld_'+v.id+'">';
    html += '<div class="vl-dlbl">'+_vlt('vl_purpose')+'</div><div class="vl-dval">'+_esc(v.purpose||'-')+'</div>';
    html += '<div class="vl-dlbl">'+_vlt('vl_result')+'</div><div class="vl-dval">'+_esc(v.result||'-')+'</div>';
    html += '<div class="vl-dlbl">'+_vlt('vl_next')+'</div><div class="vl-dval">'+_esc(v.next_action||'-')+'</div>';
    if (v.address) html += '<div class="vl-dlbl">'+_vlt('vl_address')+'</div><div class="vl-dval">'+_esc(v.address)+'</div>';
    // 캘린더 연동 상태 + 연동 버튼
    html += '<div class="vl-dlbl">'+_vlt('vl_cal_sync')+'</div><div class="vl-dval vl-cal-status" id="vlCalSt_'+v.id+'" data-date="'+(v.date||'')+'" data-cust="'+_esc(v.customer_name||'')+'" data-erp="'+_esc(v.customer_erp||'')+'" data-empid="'+(v.empid||'')+'" data-type="'+(v.visit_type||'regular')+'" data-purpose="'+_esc(v.purpose||'')+'" data-addr="'+_esc(v.address||'')+'" data-empname="'+_esc(v.emp_name||v.empid||'')+'"><span style="color:#9ca3af;font-size:12px;">⏳</span></div>';
    if (v.location && v.location.lat) html += '<div class="vl-dlbl">'+_vlt('vl_location')+'</div><div class="vl-dval">'+v.location.lat.toFixed(5)+', '+v.location.lng.toFixed(5)+'</div>';
    if (v.photos && v.photos.length) {
      html += '<div class="vl-dlbl">'+_vlt('vl_photo')+'</div><div class="vl-dphoto">';
      v.photos.forEach(function(p) { html += '<img src="'+p.dataUrl+'" onclick="event.stopPropagation();_vlViewPhoto(this.src)">'; });
      html += '</div>';
    }
    if (canEdit) {
      html += '<div class="vl-dact">' +
        '<button class="vl-btn-edit" onclick="event.stopPropagation();vlOpenEdit(\''+v.id+'\')">'+_vlt('vl_edit')+'</button>' +
        '<button class="vl-btn-del" onclick="event.stopPropagation();vlDelete(\''+v.id+'\')">'+_vlt('vl_delete')+'</button></div>';
    }
    html += '</div>';
    card.innerHTML = html;
    card.onclick = function() { document.getElementById('vld_'+v.id).classList.toggle('open'); };
    list.appendChild(card);
  });
  // 캘린더 연동 상태 확인
  _vlCheckCalSync();
}

function _vlCheckCalSync() {
  var els = document.querySelectorAll('.vl-cal-status');
  if (!els.length) return;
  els.forEach(function(el) {
    var date = el.getAttribute('data-date');
    var cust = el.getAttribute('data-cust');
    var empid = el.getAttribute('data-empid');
    if (!date || !cust) { el.innerHTML = '<span style="color:#9ca3af;font-size:12px;">—</span>'; return; }
    _fbDb.collection('visit_schedules')
      .where('empid', '==', empid)
      .where('date', '==', date)
      .where('customer_name', '==', cust)
      .get()
      .then(function(snap) {
        if (!snap.empty) {
          el.innerHTML = '<span style="color:#16a34a;font-size:12px;font-weight:600;">✅ ' + _vlt('vl_cal_synced') + '</span>';
        } else {
          // Show sync button for not-yet-synced items
          el.innerHTML = '<span style="color:#f59e0b;font-size:12px;">⚠️ ' + _vlt('vl_cal_not_synced') + '</span> ' +
            '<button onclick="event.stopPropagation();_vlSyncCardToCalendar(this.parentElement)" style="margin-left:6px;background:#f0fdf4;color:#059669;border:1px solid #a7f3d0;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;">📅 연동</button>';
        }
      })
      .catch(function() {
        el.innerHTML = '<span style="color:#9ca3af;font-size:12px;">—</span>';
      });
  });
}

// Per-card calendar sync (from visit log list)
function _vlSyncCardToCalendar(el) {
  var user = getCurrentUser();
  if (!user) { alert('Login required'); return; }
  var date = el.getAttribute('data-date');
  var cust = el.getAttribute('data-cust');
  var erp = el.getAttribute('data-erp');
  var empid = el.getAttribute('data-empid');
  var vtype = el.getAttribute('data-type');
  var purpose = el.getAttribute('data-purpose');
  var addr = el.getAttribute('data-addr');
  var empname = el.getAttribute('data-empname');
  if (!date || !cust) return;
  el.innerHTML = '<span style="color:#9ca3af;font-size:12px;">⏳ 연동 중...</span>';
  var schedData = {
    empid: empid,
    emp_name: empname,
    date: date,
    time: '',
    customer_erp: erp,
    customer_name: cust,
    address: addr,
    visit_type: vtype || 'regular',
    priority: 'normal',
    purpose: purpose,
    notes: '',
    status: 'planned',
    completed_visit_id: '',
    source: 'visit_log',
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  };
  _fbDb.collection('visit_schedules').add(schedData).then(function() {
    el.innerHTML = '<span style="color:#16a34a;font-size:12px;font-weight:600;">✅ ' + _vlt('vl_cal_synced') + '</span>';
    _vlToast(_vlt('vl_cal_synced') || '연동 완료');
  }).catch(function(err) {
    el.innerHTML = '<span style="color:#ef4444;font-size:12px;">❌ Error</span>';
    console.error('[VL] Sync error:', err);
  });
}

function _vlViewPhoto(src) {
  var viewer = document.getElementById('vlViewer');
  if (!viewer) return;
  viewer.innerHTML = '<img src="' + src + '" style="max-width:90vw;max-height:90vh;border-radius:8px;">';
  viewer.classList.add('open');
}

// ══ Apply i18n ══
function _vlApplyI18n() {
  document.getElementById('vlBtnNewLabel').textContent = '+ ' + _vlt('vl_new');
  document.getElementById('vlSearch').placeholder = _vlt('vl_search');
  var ndEl = document.getElementById('vlNoData'); if (ndEl) ndEl.textContent = _vlt('vl_no_data');
  document.getElementById('vlLblDate').textContent = _vlt('vl_date');
  var lblErp = document.getElementById('vlLblErp');
  if (lblErp) lblErp.textContent = _vlt('vl_erp');
  document.getElementById('vlLblCust').textContent = _vlt('vl_customer');
  document.getElementById('vlLblType').textContent = _vlt('vl_type');
  document.getElementById('vlLblPurpose').textContent = _vlt('vl_purpose');
  document.getElementById('vlLblResult').textContent = _vlt('vl_result');
  document.getElementById('vlLblNext').textContent = _vlt('vl_next');
  document.getElementById('vlLblPhoto').textContent = _vlt('vl_photo');
  document.getElementById('vlLblLoc').textContent = _vlt('vl_location');
  document.getElementById('vlLblAddr').textContent = _vlt('vl_address');
  document.getElementById('vlBtnGps').textContent = _vlt('vl_gps');
  var sel = document.getElementById('vlFType');
  sel.options[0].textContent = _vlt('vl_type_regular');
  sel.options[1].textContent = _vlt('vl_type_new');
  sel.options[2].textContent = _vlt('vl_type_follow');
  sel.options[3].textContent = _vlt('vl_type_complaint');
  sel.options[4].textContent = _vlt('vl_type_demo');
  document.querySelector('.vl-btn-cancel').textContent = _vlt('vl_cancel');
  document.getElementById('vlBtnSave').textContent = _vlt('vl_save');
  document.querySelector('#vlBtnPhotoLbl span').textContent = _vlt('vl_photo_add') || _vlt('vl_photo');
}

// ══ Init (call this when the visit log view is opened) ══
function initVisitLog() {
  _vlApplyI18n();
  document.getElementById('vlDateFrom').value = _daysAgo(30);
  document.getElementById('vlDateTo').value = _todayStr();
  document.getElementById('vlDateFrom').addEventListener('change', _vlLoad);
  document.getElementById('vlDateTo').addEventListener('change', _vlLoad);
  var timer;
  document.getElementById('vlSearch').addEventListener('input', function() {
    clearTimeout(timer); timer = setTimeout(_vlLoad, 400);
  });
  _vlSetupAC();
  _vlLoad();
}
