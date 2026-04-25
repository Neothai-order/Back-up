// Neo Sales App - Customer Master & Registration (auto-separated)
// ── 고객 마스터 ──
var _cmLoaded = false;
function openCustMaster() {
  if (!getCurrentUser()) { neoAlert(t('msg_login_required')); return; }
  if (!_cmLoaded) {
    _buildCmFilters();
    renderCustMaster();
    _cmLoaded = true;
  }
  document.getElementById('cmOverlay').classList.add('open');
  _bringToFront(document.getElementById('cmOverlay'));
  var cmModal = document.querySelector('#cmOverlay .cm-modal');
  if (cmModal && !cmModal.classList.contains('fullscreen')) {
    var fsBtn = cmModal.querySelector('.modal-btn-fs');
    if (fsBtn) modalToggleFS(fsBtn);
  }
  // 영업 부서(비관리자): 엑셀 다운로드 + 시트 동기화 버튼 숨김
  var u = getCurrentUser();
  var isAdm = _isAdmin(u);
  var hideForSales = (u && u.dept === 'Sales' && !isAdm);
  var btnExcel = document.getElementById('btnCmExcelDl');
  if (btnExcel) {
    btnExcel.style.display = hideForSales ? 'none' : '';
  }
  // 시트 동기화: 엑셀 다운로드와 동일 가시성 (Sales 비관리자만 숨김)
  var btnSync = document.getElementById('btnCmSheetSync');
  if (btnSync) {
    btnSync.style.display = hideForSales ? 'none' : 'inline-flex';
  }
}
// ── Google Sheet → Firestore 업로드 (관리자 전용) ──
// 워크플로: (1) 관리자는 Google Sheet 원본을 편집·웹 게시
//           (2) 이 버튼으로 CSV 를 가져와 content_hash 비교 후 변경 행만 write
//           (3) 변경 없으면 Firestore write=0 → 사용자 재다운로드도 발생하지 않음
async function triggerCustMasterSync() {
  var u = getCurrentUser();
  if (!u || !_isAdmin(u)) { neoAlert(t('msg_no_permission') || '권한이 없습니다'); return; }
  if (typeof syncCsvToFirestore !== 'function') { neoAlert('Sync function not available'); return; }
  var ok = confirm('Google Sheet 의 고객 마스터를 Firestore 에 업로드합니다.\n(변경된 행만 반영되며, 동일한 행은 건너뜁니다)\n\n계속하시겠습니까?');
  if (!ok) return;
  var btn = document.getElementById('btnCmSheetSync');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  try {
    var n = await syncCsvToFirestore(false);
    // 동기화 후 로컬 테이블 갱신
    _cmLoaded = false;
    _buildCmFilters();
    renderCustMaster();
    _cmLoaded = true;
    if (typeof showToast === 'function') showToast('✅ 동기화 완료 (' + (n || 0) + '건 확인)');
  } catch(e) {
    console.error('[triggerCustMasterSync] 실패:', e);
    neoAlert('동기화 실패: ' + (e && e.message ? e.message : e));
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
  }
}
function refreshCustMaster() {
  showToast(t('cm_refreshing') || '데이터 갱신 중...');
  _cmLoaded = false;
  _buildCmFilters();
  renderCustMaster();
  _cmLoaded = true;
}
function closeCustMaster() {
  document.getElementById('cmOverlay').classList.remove('open');
  document.getElementById('cmMini').classList.remove('show');
}
function minimizeCustMaster() {
  document.getElementById('cmOverlay').classList.remove('open');
  document.getElementById('cmMini').classList.add('show');
  _repositionMinis();
}
function restoreCustMaster() {
  document.getElementById('cmMini').classList.remove('show');
  document.getElementById('cmOverlay').classList.add('open');
  _bringToFront(document.getElementById('cmOverlay'));
  _repositionMinis();
}
function downloadCustMasterExcel() {
  var tbody = document.getElementById('cmTbody');
  if (!tbody || !tbody.rows.length) { showToast(t('msg_no_data')); return; }
  var headers = ['No.','Status','Reg. Date','Sales Rep','NT Code','ERP Code','Type','Name (EN)','Name (TH)','Clinic','Tax ID','Office','Mobile','Region','District','Reg. Address','Delivery Addr 1','Delivery Addr 2','Delivery Addr 3','Memo'];
  var rows = [headers];
  Array.from(tbody.rows).forEach(function(tr) {
    var row = [];
    Array.from(tr.cells).forEach(function(td) { row.push(td.textContent.trim()); });
    rows.push(row);
  });
  var ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:5},{wch:10},{wch:12},{wch:12},{wch:14},{wch:12},{wch:14},{wch:36},{wch:36},{wch:36},{wch:20},{wch:18},{wch:18},{wch:14},{wch:16},{wch:50},{wch:50},{wch:50},{wch:50},{wch:30}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customer Master');
  XLSX.writeFile(wb, 'Customer_Master_' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '.xlsx');
}
var _thaiProvinceMap = {
  'Amnat Charoen':'อำนาจเจริญ','Ang Thong':'อ่างทอง','Bangkok':'กรุงเทพมหานคร','Bueng Kan':'บึงกาฬ',
  'Buri Ram':'บุรีรัมย์','Chachoengsao':'ฉะเชิงเทรา','Chai Nat':'ชัยนาท','Chaiyaphum':'ชัยภูมิ',
  'Chanthaburi':'จันทบุรี','Chiang Mai':'เชียงใหม่','Chiang Rai':'เชียงราย','Chonburi':'ชลบุรี',
  'Chumphon':'ชุมพร','Kalasin':'กาฬสินธุ์','Kamphaeng Phet':'กำแพงเพชร','Kanchanaburi':'กาญจนบุรี',
  'Khon Kaen':'ขอนแก่น','Krabi':'กระบี่','Lampang':'ลำปาง','Lamphun':'ลำพูน',
  'Loei':'เลย','Lop Buri':'ลพบุรี','Mae Hong Son':'แม่ฮ่องสอน','Maha Sarakham':'มหาสารคาม',
  'Mukdahan':'มุกดาหาร','Nakhon Nayok':'นครนายก','Nakhon Pathom':'นครปฐม',
  'Nakhon Phanom':'นครพนม','Nakhon Ratchasima':'นครราชสีมา','Nakhon Sawan':'นครสวรรค์',
  'Nakhon Si Thammarat':'นครศรีธรรมราช','Nan':'น่าน','Narathiwat':'นราธิวาส',
  'Nong Bua Lam Phu':'หนองบัวลำภู','Nong Khai':'หนองคาย','Nonthaburi':'นนทบุรี',
  'Pathum Thani':'ปทุมธานี','Pattani':'ปัตตานี','Phang Nga':'พังงา','Phatthalung':'พัทลุง',
  'Phayao':'พะเยา','Phetchabun':'เพชรบูรณ์','Phetchaburi':'เพชรบุรี','Phichit':'พิจิตร',
  'Phitsanulok':'พิษณุโลก','Phra Nakhon Si Ayutthaya':'พระนครศรีอยุธยา','Phrae':'แพร่',
  'Phuket':'ภูเก็ต','Prachinburi':'ปราจีนบุรี','Prachuap Khiri Khan':'ประจวบคีรีขันธ์',
  'Ranong':'ระนอง','Ratchaburi':'ราชบุรี','Rayong':'ระยอง','Roi Et':'ร้อยเอ็ด',
  'Sa Kaeo':'สระแก้ว','Sakon Nakhon':'สกลนคร','Samut Prakan':'สมุทรปราการ',
  'Samut Sakhon':'สมุทรสาคร','Samut Songkhram':'สมุทรสงคราม','Saraburi':'สระบุรี',
  'Satun':'สตูล','Si Sa Ket':'ศรีสะเกษ','Sing Buri':'สิงห์บุรี','Songkhla':'สงขลา',
  'Sukhothai':'สุโขทัย','Suphan Buri':'สุพรรณบุรี','Surat Thani':'สุราษฎร์ธานี',
  'Surin':'สุรินทร์','Tak':'ตาก','Trang':'ตรัง','Trat':'ตราด',
  'Ubon Ratchathani':'อุบลราชธานี','Udon Thani':'อุดรธานี','Uthai Thani':'อุทัยธานี',
  'Uttaradit':'อุตรดิตถ์','Yala':'ยะลา','Yasothon':'ยโสธร'
};
function _regionLabel(v) {
  if (!v) return '';
  var th = _thaiProvinceMap[v];
  return th ? v + ' (' + th + ')' : v;
}
// 방콕 주소에서 เขต(구) 추출
function _extractBkkDistrict(addr, province) {
  if (!addr) return '';
  var prov = (province || '').toLowerCase();
  if (prov !== 'bangkok' && prov !== 'กรุงเทพฯ' && prov !== 'กรุงเทพมหานคร') return '';
  // เขตXXX 패턴 매칭
  var m = addr.match(/เขต\s*([^\s,]+)/);
  if (m) return m[1];
  // Khet 패턴 (영문)
  var m2 = addr.match(/Khet\s+([A-Za-z\s]+?)(?:,|\s+(?:Krung|Bangkok|แขวง|10\d{3}))/i);
  if (m2) return m2[1].trim();
  return '';
}

var _cmBangkokMode = false; // 방콕 영업: 지역 필터를 구/군으로 전환
function _isBangkokSales() {
  var _me = getCurrentUser();
  if (!_me || _me.dept !== 'Sales') return false;
  var isAdm = _isAdmin(_me);
  if (isAdm) return false;
  var sd = (_me.sub_dept || '').trim();
  return sd === '방콕' || sd.toLowerCase() === 'bangkok';
}
function _buildCmFilters() {
  var salesSet = new Set(), typeSet = new Set(), regionSet = new Set();
  _cmBangkokMode = _isBangkokSales();
  (DATA || []).forEach(function(d) {
    if (d.sales) salesSet.add(d.sales);
    if (d.cust_type || d.type) typeSet.add(d.cust_type || d.type);
    if (_cmBangkokMode) {
      // 방콕 영업: 구/군 목록 수집 (Bangkok 고객만)
      var prov = (d.province || d.location || '').toLowerCase();
      if (prov === 'bangkok' || prov === 'กรุงเทพฯ' || prov === 'กรุงเทพมหานคร') {
        var dist = (d.district || '').trim();
        if (dist) regionSet.add(dist);
      }
    } else {
      if (d.province || d.location) regionSet.add(d.province || d.location);
    }
  });
  var salesSel = document.getElementById('cmSalesFilter');
  var typeSel = document.getElementById('cmTypeFilter');
  var regionSel = document.getElementById('cmRegionFilter');
  var regionLabel = document.querySelector('label[data-i18n="cm_region"]');
  var _allLabel = t('cm_all');
  salesSel.innerHTML = '<option value="">' + _allLabel + '</option>' + Array.from(salesSet).sort().map(function(v) {
    return '<option value="'+escHtml(v)+'">'+escHtml(_titleCase(v))+'</option>';
  }).join('');
  typeSel.innerHTML = '<option value="">' + _allLabel + '</option>' + Array.from(typeSet).sort().map(function(v) { return '<option value="'+escHtml(v)+'">'+escHtml(v)+'</option>'; }).join('');
  if (_cmBangkokMode) {
    // 라벨을 구/군으로 변경
    if (regionLabel) regionLabel.textContent = t('cm_district');
    regionSel.innerHTML = '<option value="">' + _allLabel + '</option>' + Array.from(regionSet).sort().map(function(v) { return '<option value="'+escHtml(v)+'">'+escHtml(v)+'</option>'; }).join('');
  } else {
    if (regionLabel) regionLabel.textContent = t('cm_region');
    regionSel.innerHTML = '<option value="">' + _allLabel + '</option>' + Array.from(regionSet).sort().map(function(v) { return '<option value="'+escHtml(v)+'">'+escHtml(_regionLabel(v))+'</option>'; }).join('');
  }

  // 관리자/Office 외: 본인 닉네임으로 고정 (변경 불가)
  var _me = getCurrentUser();
  if (_me && _isScopedUser(_me)) {
    var nick = (_me.nickname || '').trim();
    // 본인 닉네임 옵션만 남기고 나머지 제거
    if (nick) {
      var matchedOpt = '';
      for (var i = 0; i < salesSel.options.length; i++) {
        if (salesSel.options[i].value.trim().toLowerCase() === nick.toLowerCase()) {
          matchedOpt = salesSel.options[i].value; break;
        }
      }
      var fixed = matchedOpt || nick;
      salesSel.innerHTML = '<option value="' + escHtml(fixed) + '" selected>' + escHtml(_titleCase(fixed)) + '</option>';
      salesSel.value = fixed;
    } else {
      salesSel.innerHTML = '<option value="__NONE__" selected>-</option>';
      salesSel.value = '__NONE__';
    }
    salesSel.disabled = true;
    salesSel.style.opacity = '0.7';
    salesSel.style.cursor = 'not-allowed';
  }
}
var _cmFiltered = [];
var _cmModalOpen = false;
function cmScrollToFirst() {
  var body = document.getElementById('cmBody');
  if (body) body.scrollTop = 0;
}
function cmScrollToLast() {
  var body = document.getElementById('cmBody');
  if (body) body.scrollTop = body.scrollHeight;
}
function openCmCustomerCard(idx) {
  var d = _cmFiltered[idx];
  if (!d) return;
  // currentResults에 임시 세팅하여 openModal 내부 호환
  var origResults = currentResults;
  currentResults = _cmFiltered;
  _cmModalOpen = true;
  // 모달 z-index를 고객 마스터(9200) 위로 올림
  var overlay = document.getElementById('modalOverlay');
  overlay.style.zIndex = '9300';
  openModal(idx);
  currentResults = origResults;
}
function _cmSplitPhones(tel) {
  if (!tel) return { office: '', mobile: '' };
  var nums = tel.split(/[,;\/]+/).map(function(s) { return s.replace(/[\s\-().]+/g, '').trim(); }).filter(Boolean);
  var office = [], mobile = [];
  nums.forEach(function(n) {
    // 앞자리 0 누락 보정
    if (/^[6-9]\d{8}$/.test(n)) n = '0' + n;
    else if (/^[2-5,7]\d{7,8}$/.test(n)) n = '0' + n;
    var isMobile = /^0[689]/.test(n);
    if (isMobile) mobile.push(n); else office.push(n);
  });
  function fmt(n) {
    var d = n.replace(/\D/g, '');
    if (/^0[689]/.test(d) && d.length === 10) return d.slice(0,3) + '-' + d.slice(3,6) + '-' + d.slice(6);
    if (/^0[2-5,7]/.test(d)) {
      if (d.length === 9) return d.slice(0,2) + '-' + d.slice(2,5) + '-' + d.slice(5);
      if (d.length === 10) return d.slice(0,3) + '-' + d.slice(3,6) + '-' + d.slice(6);
    }
    return n;
  }
  return { office: office.map(fmt).join(', '), mobile: mobile.map(fmt).join(', ') };
}
function renderCustMaster() {
  var search = (document.getElementById('cmSearch').value || '').trim().toLowerCase();
  var statusF = document.getElementById('cmStatusFilter').value;
  var salesF = document.getElementById('cmSalesFilter').value;
  var typeF = document.getElementById('cmTypeFilter').value;
  var regionF = document.getElementById('cmRegionFilter').value;
  var user = getCurrentUser();
  var scoped = user && _isScopedUser(user);
  var filtered = (DATA || []).filter(function(d) {
    // 관리자/Office 외: 본인 담당 고객만 — salesF 드롭다운 값 무시
    if (scoped) {
      var salesName = (d.sales || '').trim().toLowerCase();
      var matched = false;
      // 1순위: 닉네임 정확 매칭
      if (user.nickname && salesName === user.nickname.trim().toLowerCase()) matched = true;
      // 2순위: empid 포함
      if (!matched && user.empid && salesName.indexOf(user.empid.toLowerCase()) > -1) matched = true;
      // 3순위: 이름 정확 매칭
      if (!matched && user.name && salesName === user.name.trim().toLowerCase()) matched = true;
      if (!matched) return false;
    }
    if (statusF && (d.status || '').toUpperCase() !== statusF.toUpperCase()) return false;
    if (!scoped && salesF && (d.sales || '').trim().toUpperCase() !== salesF.toUpperCase()) return false;
    if (typeF && (d.cust_type || d.type || '') !== typeF) return false;
    if (regionF) {
      if (_cmBangkokMode) {
        // 방콕 모드: 구/군 기준 필터
        if ((d.district || '').trim() !== regionF) return false;
      } else {
        if ((d.province || d.location || '') !== regionF) return false;
      }
    }
    // 방콕 영업: Bangkok 고객만 표시
    if (_cmBangkokMode && !regionF) {
      var prov = (d.province || d.location || '').toLowerCase();
      if (prov !== 'bangkok' && prov !== 'กรุงเทพฯ' && prov !== 'กรุงเทพมหานคร') return false;
    }
    if (search) {
      var hay = [d.name_en, d.name_th, d.erp, d.nt_code, d.clinic, d.cust_name, d.tel].join(' ').toLowerCase();
      if (hay.indexOf(search) === -1) return false;
    }
    return true;
  });
  var tbody = document.getElementById('cmTbody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="19" style="text-align:center;padding:40px;color:#9ca3af;">' + t('cm_no_result') + '</td></tr>';
    document.getElementById('cmCount').textContent = t('cm_total').replace('{n}', '0');
    return;
  }
  // 정렬: NOT USE → Non-Active/Inactive → Active, 각 그룹 내 정렬
  filtered.sort(function(a, b) {
    var sa = (a.status || '').toLowerCase();
    var sb = (b.status || '').toLowerCase();
    var orderA = sa === 'not use' ? 0 : (sa === 'active' ? 2 : 1);
    var orderB = sb === 'not use' ? 0 : (sb === 'active' ? 2 : 1);
    if (orderA !== orderB) return orderA - orderB;
    if (orderA < 2) {
      // NOT USE, Non-Active: NT Code 오름차순
      return (a.nt_code || '').localeCompare(b.nt_code || '');
    }
    // Active: ERP Code 오름차순
    var ea = parseInt(a.erp, 10) || 0;
    var eb = parseInt(b.erp, 10) || 0;
    return ea - eb;
  });
  _cmFiltered = filtered;
  var isMob = window.innerWidth <= 1024;
  // 모바일: 헤더도 교체
  var thead = document.querySelector('#cmBody .cm-table thead');
  if (thead) {
    if (isMob) {
      thead.innerHTML = '<tr>' +
        '<th data-i18n="cm_nt_code">NT Code</th>' +
        '<th data-i18n="cm_erp_code">ERP Code</th>' +
        '<th data-i18n="cm_name_en">' + t('cm_name_en') + '</th>' +
        '<th data-i18n="cm_name_th">' + t('cm_name_th') + '</th>' +
        '<th data-i18n="cm_clinic">' + t('cm_clinic') + '</th>' +
        '<th data-i18n="cm_addr_reg">' + t('cm_addr_reg') + '</th>' +
        '<th data-i18n="cm_addr_del2">' + t('cm_addr_del2') + '</th>' +
        '<th data-i18n="cm_addr_del3">' + t('cm_addr_del3') + '</th>' +
      '</tr>';
    } else {
      thead.innerHTML = '<tr>' +
        '<th data-i18n="cm_no">' + t('cm_no') + '</th>' +
        '<th data-i18n="cm_status">' + t('cm_status') + '</th>' +
        '<th data-i18n="cm_reg_date">' + t('cm_reg_date') + '</th>' +
        '<th data-i18n="cm_sales_rep">' + t('cm_sales_rep') + '</th>' +
        '<th data-i18n="cm_nt_code">NT Code</th>' +
        '<th data-i18n="cm_erp_code">ERP Code</th>' +
        '<th data-i18n="cm_cust_type">' + t('cm_cust_type') + '</th>' +
        '<th data-i18n="cm_name_en">' + t('cm_name_en') + '</th>' +
        '<th data-i18n="cm_name_th">' + t('cm_name_th') + '</th>' +
        '<th data-i18n="cm_clinic">' + t('cm_clinic') + '</th>' +
        '<th data-i18n="cm_tax_id">Tax ID</th>' +
        '<th data-i18n="cm_tel_office" style="min-width:120px;">' + t('cm_tel_office') + '</th>' +
        '<th data-i18n="cm_tel_mobile" style="min-width:120px;">' + t('cm_tel_mobile') + '</th>' +
        '<th data-i18n="cm_location">' + t('cm_location') + '</th>' +
        '<th data-i18n="cm_district">' + t('cm_district') + '</th>' +
        '<th data-i18n="cm_addr_reg" style="min-width:300px;">' + t('cm_addr_reg') + '</th>' +
        '<th data-i18n="cm_addr_del1" style="min-width:300px;">' + t('cm_addr_del1') + '</th>' +
        '<th data-i18n="cm_addr_del2" style="min-width:300px;">' + t('cm_addr_del2') + '</th>' +
        '<th data-i18n="cm_addr_del3" style="min-width:300px;">' + t('cm_addr_del3') + '</th>' +
        '<th data-i18n="cm_memo">Memo</th>' +
      '</tr>';
    }
  }
  var html = '';
  filtered.forEach(function(d, i) {
    if (isMob) {
      html += '<tr style="cursor:pointer;" onclick="openCmCustomerCard(' + i + ')">' +
        '<td>' + escHtml(d.nt_code || (d.erp ? 'NT' + d.erp : '')) + '</td>' +
        '<td>' + escHtml(d.erp || '') + '</td>' +
        '<td>' + escHtml(d.name_en || '') + '</td>' +
        '<td>' + escHtml(d.name_th || '') + '</td>' +
        '<td>' + escHtml(d.clinic || '') + '</td>' +
        '<td style="white-space:nowrap;max-width:none;">' + escHtml(d.address || '') + '</td>' +
        '<td style="white-space:nowrap;max-width:none;">' + escHtml(d.addr_del2 || '') + '</td>' +
        '<td style="white-space:nowrap;max-width:none;">' + escHtml(d.addr_del3 || '') + '</td>' +
      '</tr>';
    } else {
      html += '<tr style="cursor:pointer;" onclick="openCmCustomerCard(' + i + ')">' +
        '<td>' + (i + 1) + '</td>' +
        '<td style="text-align:center;">' + (d.status ? '<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;' + (d.status.toLowerCase() === 'active' ? 'background:#d1fae5;color:#065f46;' : 'background:#fee2e2;color:#991b1b;') + '">' + escHtml(d.status) + '</span>' : '') + '</td>' +
        '<td style="text-align:center;white-space:nowrap;">' + escHtml(d.reg_date || '') + '</td>' +
        '<td>' + escHtml(_titleCase(d.sales || '')) + '</td>' +
        '<td>' + escHtml(d.nt_code || (d.erp ? 'NT' + d.erp : '')) + '</td>' +
        '<td>' + escHtml(d.erp || '') + '</td>' +
        '<td>' + escHtml(d.cust_type || d.type || '') + '</td>' +
        '<td>' + escHtml(d.name_en || '') + '</td>' +
        '<td>' + escHtml(d.name_th || '') + '</td>' +
        '<td>' + escHtml(d.clinic || '') + '</td>' +
        '<td>' + _displayTaxId(d.tax_id) + '</td>' +
        '<td style="white-space:nowrap;min-width:120px;">' + _cmSplitPhones(d.tel).office.split(', ').map(function(n){return escHtml(n);}).join('<br>') + '</td>' +
        '<td style="white-space:nowrap;min-width:120px;">' + _cmSplitPhones(d.tel).mobile.split(', ').map(function(n){return escHtml(n);}).join('<br>') + '</td>' +
        '<td>' + escHtml(d.province || d.location || '') + '</td>' +
        '<td>' + escHtml(_extractBkkDistrict(d.address, d.province || d.location)) + '</td>' +
        '<td style="white-space:normal;max-width:none;">' + escHtml(d.address || '') + '</td>' +
        '<td style="white-space:normal;max-width:none;">' + escHtml(d.addr_del || '') + '</td>' +
        '<td style="white-space:normal;max-width:none;">' + escHtml(d.addr_del2 || '') + '</td>' +
        '<td style="white-space:normal;max-width:none;">' + escHtml(d.addr_del3 || '') + '</td>' +
        '<td>' + escHtml(d.remark || '') + '</td>' +
      '</tr>';
    }
  });
  tbody.innerHTML = html;
  document.getElementById('cmCount').textContent = t('cm_total').replace('{n}', filtered.length);
}

// ── 태국어 → 영어 자동 번역 ──
var _regAutoNameEn = '';
var _regTransTimer = null;
function _autoTranslateName(thaiName) {
  if (!thaiName || !thaiName.trim()) { _regAutoNameEn = ''; _updateRegNameEnPreview(''); return; }
  clearTimeout(_regTransTimer);
  _regTransTimer = setTimeout(function() {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=th&tl=en&dt=t&q=' + encodeURIComponent(thaiName.trim());
    fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      if (data && data[0]) {
        var translated = data[0].map(function(s) { return s[0]; }).join('').replace(/,\s*/g, ' ');
        _regAutoNameEn = translated;
        _updateRegNameEnPreview(translated);
      }
    }).catch(function() { _regAutoNameEn = ''; });
  }, 600);
}
function _updateRegNameEnPreview(en) {
  var el = document.getElementById('regNameEnPreview');
  if (el) {
    el.textContent = en ? '🔤 ' + en : '';
    el.style.display = en ? 'block' : 'none';
  }
}
// ── 상품 관련 함수 ──────────────────────────────────────────────────────────
function openProductRegForm() {
  var u = getCurrentUser();
  if (!u) { neoAlert(t('msg_login_required')); return; }
  var isAdmin = _isAdmin(u);
  var perms = (u.permissions) || [];
  if (!isAdmin && !perms.includes('prod_reg')) { neoAlert(t('msg_no_permission')); return; }
  openProdReg();
}
var _pendingProducts = [];

function openPendingProducts() {
  var u = getCurrentUser();
  if (!u) { neoAlert(t('msg_login_required')); return; }
  var isAdmin = _isAdmin(u);
  var perms = (u.permissions) || [];
  if (!isAdmin && !perms.includes('prod_approve')) { neoAlert(t('msg_no_permission')); return; }
  document.getElementById('pendProdOverlay').classList.add('open');
  _bringToFront(document.getElementById('pendProdOverlay'));
  loadPendingProducts();
}
function closePendingProducts() {
  document.getElementById('pendProdOverlay').classList.remove('open');
}

async function loadPendingProducts() {
  var body = document.getElementById('pendProdBody');
  body.innerHTML = '<div class="pend-prod-empty">로딩 중...</div>';
  try {
    var snap = await _fbDb.collection('pendingProducts').where('status','==','Pending').get();
    var allPending = snap.docs.map(function(d) { return d.data(); });
    // 관리자/승인자가 아닌 경우: 본인이 등록한 건만 표시 (empid 기준, nickname 보조)
    var u = getCurrentUser();
    var isAdmin = _isApprover(u);
    if (u && !isAdmin) {
      allPending = allPending.filter(function(p) {
        var regBy = (p.reg_by || '');
        if (u.empid && regBy.indexOf(u.empid) > -1) return true;
        if (u.empid && p.created_by === u.empid) return true;
        if (u.nickname && regBy.toLowerCase().indexOf(u.nickname.toLowerCase()) > -1) return true;
        return false;
      });
    }
    _pendingProducts = allPending;
    renderPendingProducts();
    _updatePendProdBadge();
  } catch(e) {
    body.innerHTML = '<div class="pend-prod-empty">❌ 로드 실패</div>';
  }
}

function renderPendingProducts() {
  var body = document.getElementById('pendProdBody');
  if (!_pendingProducts.length) {
    body.innerHTML = '<div class="pend-prod-empty">✅ 대기 중인 상품이 없습니다.</div>';
    return;
  }
  body.innerHTML = _pendingProducts.map(function(p, idx) {
    var photosHtml = '';
    if (p.photos && p.photos.length) {
      photosHtml = '<div class="pend-prod-photos">' +
        p.photos.map(function(url) {
          return '<img src="' + escHtml(url) + '" onclick="openProdImgViewer(\'' + escHtml(url) + '\')" />';
        }).join('') + '</div>';
    }
    var u = getCurrentUser();
    var isApprover = _isApprover(u);
    return '<div class="pend-prod-card" id="ppCard-' + idx + '">' +
      '<div class="pend-prod-card-hdr">' +
        '<span class="pend-prod-card-title">[' + escHtml(p.category || '') + '] ' + escHtml(p.model || p.item_no) + '</span>' +
        '<span class="pend-prod-card-meta">' + escHtml(p.reg_by || '') + ' · ' + (p.created_at ? new Date(p.created_at.seconds * 1000).toLocaleDateString() : '') + '</span>' +
      '</div>' +
      '<div class="pend-prod-card-body">' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">Category</span><span class="pend-cust-v">' + escHtml(p.category || '-') + '</span></div>' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">Class</span><span class="pend-cust-v">' + escHtml(p.item_class || '-') + '</span></div>' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">' + t('pr_label_itemno') + '</span><span class="pend-cust-v">' + escHtml(p.item_no || '-') + '</span></div>' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">' + t('pr_label_model') + '</span><span class="pend-cust-v">' + escHtml(p.model || '-') + '</span></div>' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">' + t('pr_label_name') + '</span><span class="pend-cust-v">' + escHtml(p.name || '-') + '</span></div>' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">' + t('pr_label_price') + '</span><span class="pend-cust-v">' + (p.price ? Number(p.price).toLocaleString() : '-') + '</span></div>' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">' + t('pr_label_effdate') + '</span><span class="pend-cust-v">' + escHtml(p.effective_date || '-') + '</span></div>' +
        '<div class="pend-cust-kv"><span class="pend-cust-k">Status</span><span class="pend-cust-v"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;">Pending</span></span></div>' +
        (p.spec ? '<div class="pend-cust-kv" style="grid-column:1/-1"><span class="pend-cust-k">' + t('pr_label_spec') + '</span><span class="pend-cust-v">' + escHtml(p.spec) + '</span></div>' : '') +
        (p.memo ? '<div class="pend-cust-kv" style="grid-column:1/-1"><span class="pend-cust-k">' + t('pr_label_memo') + '</span><span class="pend-cust-v">' + escHtml(p.memo) + '</span></div>' : '') +
      '</div>' +
      photosHtml +
      (isApprover ? '<div class="pend-prod-actions">' +
        '<button class="btn-pend-reject" onclick="rejectPendingProduct(' + idx + ')">✕ 거절</button>' +
        '<button class="btn-pend-approve" onclick="approvePendingProduct(' + idx + ')">✅ 승인</button>' +
      '</div>' : '') +
    '</div>';
  }).join('');
}

async function approvePendingProduct(idx) {
  var p = _pendingProducts[idx];
  if (!p || !p.id) return;
  var btn = document.querySelector('#ppCard-' + idx + ' .btn-pend-approve');
  if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
  try {
    // pendingProducts 상태 업데이트
    await _fbDb.collection('pendingProducts').doc(p.id).update({
      status: 'Approved',
      approved_by: getCurrentUser().empid,
      approved_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    // products 컬렉션에 등록 (증분 동기화용 updated_at)
    var prodData = {
      cat: p.category,
      cls: p.item_class,
      no: p.item_no,
      model: p.model,
      name: p.name || '',
      spec: p.spec || '',
      price: p.price || 0,
      effective_date: p.effective_date || '',
      memo: p.memo || '',
      photos: p.photos || [],
      created_by: p.created_by,
      approved_by: getCurrentUser().empid,
      created_at: p.created_at,
      approved_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };
    await _fbDb.collection('products').doc(p.item_no).set(prodData, { merge: true });
    // productPrices에도 가격 저장 (증분 동기화용 updated_at)
    var rawPrice = Number(p.price) || 0;
    if (rawPrice > 0) {
      var _vat = Math.round(rawPrice * 7 / 107 * 100) / 100;
      var _supply = Math.round((rawPrice - _vat) * 100) / 100;
      var priceData = {
        retail: rawPrice, supply: _supply, vat: _vat,
        date: p.effective_date || '',
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      };
      await _fbDb.collection('productPrices').doc(p.item_no).set(priceData, { merge: true });
      _pmPriceMap[p.item_no] = priceData;
    }
    // ITEM_DATA(아이템 마스터)에 즉시 추가
    var newItem = {
      cat: p.category || '',
      cls: p.item_class || '',
      no: p.item_no || '',
      model: p.model || '',
      name: p.name || '',
      spec: p.spec || '',
      price: Number(p.price) || 0
    };
    // 중복 체크 후 추가
    var existIdx = ITEM_DATA.findIndex(function(it) { return it.no === newItem.no; });
    if (existIdx !== -1) {
      Object.assign(ITEM_DATA[existIdx], newItem);
    } else {
      ITEM_DATA.push(newItem);
    }
    _pendingProducts.splice(idx, 1);
    renderPendingProducts();
    _updatePendProdBadge();
    showToast('✅ 상품이 승인되어 등록되었습니다.');
  } catch(e) {
    showToast('❌ 승인 실패: ' + (e.message || '오류'));
    if (btn) { btn.disabled = false; btn.textContent = '✅ 승인'; }
  }
}

async function rejectPendingProduct(idx) {
  var p = _pendingProducts[idx];
  if (!p || !p.id) return;
  var reason = prompt('거절 사유를 입력하세요 (선택):');
  if (reason === null) return;
  var btn = document.querySelector('#ppCard-' + idx + ' .btn-pend-reject');
  if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
  try {
    await _fbDb.collection('pendingProducts').doc(p.id).update({
      status: 'Rejected',
      reject_reason: reason || '',
      rejected_by: getCurrentUser().empid,
      rejected_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    _pendingProducts.splice(idx, 1);
    renderPendingProducts();
    _updatePendProdBadge();
    showToast('🗑️ 상품 등록이 거절되었습니다.');
  } catch(e) {
    showToast('❌ 거절 실패: ' + (e.message || '오류'));
    if (btn) { btn.disabled = false; btn.textContent = '✕ 거절'; }
  }
}

function _updatePendProdBadge() {
  // 로컬 _pendingProducts 배열 기반으로 즉시 반영
  var localCount = (_pendingProducts || []).length;
  _setProdBadgeCount(localCount);
  // Firestore에서도 최신 수치 가져와 보정
  _fbDb.collection('pendingProducts').where('status','==','Pending').get()
    .then(function(snap) {
      var u = getCurrentUser();
      var isAdmin = _isApprover(u);
      var count = snap.size;
      if (u && !isAdmin) {
        count = snap.docs.filter(function(d) {
          var p = d.data();
          if (u.empid && (p.reg_by || '').indexOf(u.empid) > -1) return true;
          if (u.empid && p.created_by === u.empid) return true;
          if (u.nickname && (p.reg_by || '').toLowerCase().indexOf(u.nickname.toLowerCase()) > -1) return true;
          return false;
        }).length;
      }
      _setProdBadgeCount(count);
    }).catch(function(){});
}
function _setProdBadgeCount(count) {
  ['pendProdDDBadge', 'custBtnBadgeProd', 'mobCatCustBadgeProd', 'mobRegCatProdBadge', 'mobPendProdBadge'].forEach(function(id) {
    var badge = document.getElementById(id);
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        if (badge.classList.contains('mob-cat-badge')) { badge.classList.add('show'); }
        else { badge.style.display = 'inline-block'; }
      } else {
        if (badge.classList.contains('mob-cat-badge')) { badge.classList.remove('show'); }
        else { badge.style.display = 'none'; }
      }
    }
  });
}

var _pmLoaded = false;
var _pmPriceMap = {}; // { item_no: { retail, supply, vat, currency, date, reason } }
var _pmModelPriceMap = {}; // model → price data (fallback)

// 아이템 no 또는 model로 가격 조회 (fallback)
function _getItemPrice(item) {
  if (!item) return {};
  var p = _pmPriceMap[item.no] || _pmModelPriceMap[item.model] || {};
  // ITEM_DATA / products 컬렉션의 price 폴백
  if (!p.retail && item.price) {
    var raw = Number(item.price) || 0;
    if (raw > 0) {
      var vat = Math.round(raw * 7 / 107 * 100) / 100;
      p = { retail: raw, supply: Math.round((raw - vat) * 100) / 100, vat: vat, date: item.effective_date || '' };
    }
  }
  return p;
}

// ══════════════════════════════════════════════════════════════════════
// 상품 증분 동기화 (Pattern B: updated_at + deletion tombstone)
// ──────────────────────────────────────────────────────────────────────
// - productPrices: 가격 1,622건 → 로그인마다 전체 페치 하던 것을 증분으로
// - products: ITEM_DATA 병합용. 승인된 신규/수정 상품만 감지
// - 두 컬렉션 모두 별도 IndexedDB 캐시 (product_price_cache / product_cache)
// ══════════════════════════════════════════════════════════════════════
var _PP_IDB_VERSION = 1;
var _PROD_IDB_VERSION = 1;

function _pmOpenIDB(dbName) {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('master')) db.createObjectStore('master', { keyPath: '_id', autoIncrement: true });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function _pmNormalizeDoc(d) {
  var r = d.data();
  r.__id = d.id;
  if (r.updated_at && typeof r.updated_at.toMillis === 'function') {
    r.updated_at_ms = r.updated_at.toMillis();
  }
  delete r.updated_at;
  return r;
}

// localStorage 센티넬 — IDB 축출 감지용. 상품/가격 캐시별로 구분 (키 다름).
function _pmSentinelKey(dbName) { return 'neo_pmCache_' + dbName; }
function _pmSentinelWrite(dbName, count, serverTs) {
  try { localStorage.setItem(_pmSentinelKey(dbName), JSON.stringify({ ts: Date.now(), count: count, serverTs: serverTs||0 })); } catch(_){}
}
function _pmSentinelRead(dbName) {
  try { var raw = localStorage.getItem(_pmSentinelKey(dbName)); return raw ? JSON.parse(raw) : null; } catch(_){ return null; }
}

async function _pmSaveCache(dbName, data, serverTs) {
  try {
    var db = await _pmOpenIDB(dbName);
    var tx = db.transaction(['master','meta'], 'readwrite');
    var store = tx.objectStore('master');
    store.clear();
    data.forEach(function(r, i) {
      var copy = Object.assign({}, r, { _id: i });
      store.put(copy);
    });
    var metaRec = { key: 'lastSync', ts: Date.now(), count: data.length };
    if (typeof serverTs === 'number' && serverTs > 0) metaRec.serverTs = serverTs;
    tx.objectStore('meta').put(metaRec);
    await new Promise(function(res, rej) { tx.oncomplete = res; tx.onerror = function() { rej(tx.error); }; });
    db.close();
    _pmSentinelWrite(dbName, data.length, serverTs||0);
    // 저장 검증: 바로 read-back 해서 실제로 반영됐는지 확인. Quota/Private mode/ITP 축출 감지용.
    try {
      var verify = await _pmLoadCache(dbName);
      if (!verify || !verify.data || verify.data.length < data.length) {
        var got = (verify && verify.data && verify.data.length) || 0;
        console.warn('[pmCache save ' + dbName + '] VERIFY MISMATCH — saved=' + data.length + ' read-back=' + got + ' (IDB 축출 / quota / private mode 의심)');
        if (typeof _telemetryLog === 'function') {
          var kind = dbName.indexOf('price') >= 0 ? 'price' : 'product';
          _telemetryLog(kind, 'CACHE_SAVE_FAIL', { docsRead: 0, cachedCount: data.length, reason: 'verify-mismatch-' + got });
        }
      }
    } catch(_ve){}
  } catch(e) {
    console.error('[pmCache save ' + dbName + '] FAIL:', e && e.message || e);
    if (typeof _telemetryLog === 'function') {
      var kind2 = dbName.indexOf('price') >= 0 ? 'price' : 'product';
      _telemetryLog(kind2, 'CACHE_SAVE_FAIL', { docsRead: 0, cachedCount: data.length, reason: 'exception-' + (e && e.name || 'unknown') });
    }
  }
}

async function _pmLoadCache(dbName) {
  try {
    var db = await _pmOpenIDB(dbName);
    var tx = db.transaction(['master','meta'], 'readonly');
    var metaReq = tx.objectStore('meta').get('lastSync');
    var meta = await new Promise(function(res) { metaReq.onsuccess = function() { res(metaReq.result); }; });
    if (!meta || !meta.ts) { db.close(); return null; }
    var all = [];
    var cursorReq = tx.objectStore('master').openCursor();
    await new Promise(function(res) {
      cursorReq.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          var v = cursor.value;
          if (v && '_id' in v) delete v._id;
          all.push(v);
          cursor.continue();
        } else res();
      };
    });
    db.close();
    return { data: all, ts: meta.ts, serverTs: meta.serverTs || 0, count: meta.count };
  } catch(e) { console.warn('[pmCache load ' + dbName + ']', e); return null; }
}

// ──────────────────────────────────────────────────────────────────────
// productPrices 증분 동기화 (중복 호출 방지 dedup)
// ──────────────────────────────────────────────────────────────────────
var _loadProductPricesPromise = null;
async function _loadProductPrices() {
  if (_loadProductPricesPromise) return _loadProductPricesPromise;
  _loadProductPricesPromise = (async function() {
  try {
    var cached = await _pmLoadCache('product_price_cache');
    var lastSyncMs = (cached && cached.serverTs) || 0;

    if (lastSyncMs > 0 && cached.data && cached.data.length) {
      // ── 증분 경로 ──
      var tsObj = firebase.firestore.Timestamp.fromMillis(lastSyncMs);
      var results = await Promise.all([
        _fbDb.collection('productPrices').where('updated_at', '>', tsObj).get(),
        _fbDb.collection('product_price_deletions').where('deleted_at', '>', tsObj).get()
      ]);
      var snap = results[0], delSnap = results[1];

      // 기존 캐시 → map
      var map = {};
      cached.data.forEach(function(r) { if (r.__id) map[r.__id] = r; });

      // 변경/추가 merge
      var maxTs = lastSyncMs;
      snap.forEach(function(d) {
        var r = _pmNormalizeDoc(d);
        map[d.id] = r;
        if (r.updated_at_ms && r.updated_at_ms > maxTs) maxTs = r.updated_at_ms;
      });
      // 삭제 제거
      delSnap.forEach(function(d) {
        delete map[d.id];
        var dt = d.data().deleted_at;
        if (dt && typeof dt.toMillis === 'function') {
          var ms = dt.toMillis();
          if (ms > maxTs) maxTs = ms;
        }
      });

      var arr = Object.values(map);
      _pmPriceMap = {};
      arr.forEach(function(r) { _pmPriceMap[r.__id] = r; });
      _pmModelPriceMap = {};
      if (typeof ITEM_DATA !== 'undefined') {
        ITEM_DATA.forEach(function(it) {
          if (_pmPriceMap[it.no]) _pmModelPriceMap[it.model] = _pmPriceMap[it.no];
        });
      }
      arr.forEach(function(r) {
        if (!_pmModelPriceMap[r.__id]) _pmModelPriceMap[r.__id] = r;
      });

      console.log('[ProductPrices] 증분: ' + snap.size + '건 변경/추가, ' + delSnap.size + '건 삭제 (read=' + (snap.size + delSnap.size) + '), 총 ' + arr.length + '건');
      // race 방지: 캐시 저장 완료까지 대기
      await _pmSaveCache('product_price_cache', arr, maxTs);
      var _ppChanged = snap.size + delSnap.size;
      if (_ppChanged > 0 && typeof _telemetryLog === 'function') {
        _telemetryLog('price', 'INCREMENTAL', { docsRead: _ppChanged, cachedCount: arr.length, reason: 'delta' });
      }
      return;
    }

    // ── 전체 로드 (캐시 없음) ──
    var snap = await _fbDb.collection('productPrices').get();
    var arr = [];
    _pmPriceMap = {};
    snap.docs.forEach(function(d) {
      var r = _pmNormalizeDoc(d);
      arr.push(r);
      _pmPriceMap[d.id] = r;
    });
    _pmModelPriceMap = {};
    if (typeof ITEM_DATA !== 'undefined') {
      ITEM_DATA.forEach(function(it) {
        if (_pmPriceMap[it.no]) _pmModelPriceMap[it.model] = _pmPriceMap[it.no];
      });
    }
    arr.forEach(function(r) {
      if (!_pmModelPriceMap[r.__id]) _pmModelPriceMap[r.__id] = r;
    });
    var initTs = arr.reduce(function(m, r) { return Math.max(m, r.updated_at_ms || 0); }, 0);
    if (initTs === 0) initTs = Date.now();
    console.log('[ProductPrices] 전체 로드: ' + snap.size + '건 (read=' + snap.size + ')');
    // race 방지: 캐시 저장 완료까지 대기
    await _pmSaveCache('product_price_cache', arr, initTs);
    if (typeof _telemetryLog === 'function') {
      // 센티넬이 있으면 "이전에 저장 성공했는데 IDB 만 사라진" 상태 = 축출. 없으면 진짜 첫 방문.
      var _ppSen = _pmSentinelRead('product_price_cache');
      var _ppReason = (_ppSen && _ppSen.ts) ? 'cold-start-evicted' : 'cold-start-firstvisit';
      _telemetryLog('price', 'FULL', { docsRead: snap.size, cachedCount: 0, reason: _ppReason });
    }
  } catch(e) { console.warn('[ProductPrices] load error:', e); }
  })();
  try { return await _loadProductPricesPromise; }
  finally { _loadProductPricesPromise = null; }
}

// ──────────────────────────────────────────────────────────────────────
// products 증분 동기화 (ITEM_DATA 병합용) — 중복 호출 방지 dedup
// ──────────────────────────────────────────────────────────────────────
var _mergeApprovedProductsPromise = null;
async function _mergeApprovedProducts() {
  if (_mergeApprovedProductsPromise) return _mergeApprovedProductsPromise;
  _mergeApprovedProductsPromise = (async function() {
  try {
    var cached = await _pmLoadCache('product_cache');
    var lastSyncMs = (cached && cached.serverTs) || 0;
    var changedDocs = [];
    var deletedIds = [];

    if (lastSyncMs > 0) {
      // ── 증분 경로 ──
      var tsObj = firebase.firestore.Timestamp.fromMillis(lastSyncMs);
      var results = await Promise.all([
        _fbDb.collection('products').where('updated_at', '>', tsObj).get(),
        _fbDb.collection('product_deletions').where('deleted_at', '>', tsObj).get()
      ]);
      var snap = results[0], delSnap = results[1];
      var maxTs = lastSyncMs;
      snap.forEach(function(d) {
        var r = _pmNormalizeDoc(d);
        changedDocs.push(r);
        if (r.updated_at_ms && r.updated_at_ms > maxTs) maxTs = r.updated_at_ms;
      });
      delSnap.forEach(function(d) {
        deletedIds.push(d.id);
        var dt = d.data().deleted_at;
        if (dt && typeof dt.toMillis === 'function') {
          var ms = dt.toMillis();
          if (ms > maxTs) maxTs = ms;
        }
      });
      console.log('[MergeProducts] 증분: ' + snap.size + '건 변경/추가, ' + delSnap.size + '건 삭제 (read=' + (snap.size + delSnap.size) + ')');

      // 캐시 갱신 (단순화: 기존 캐시 + 변경분 merge + 삭제 제거)
      var cacheMap = {};
      (cached.data || []).forEach(function(r) { if (r.__id) cacheMap[r.__id] = r; });
      changedDocs.forEach(function(r) { cacheMap[r.__id] = r; });
      deletedIds.forEach(function(id) { delete cacheMap[id]; });
      // race 방지: 캐시 저장 완료까지 대기
      await _pmSaveCache('product_cache', Object.values(cacheMap), maxTs);
      var _prodChanged = snap.size + delSnap.size;
      if (_prodChanged > 0 && typeof _telemetryLog === 'function') {
        _telemetryLog('product', 'INCREMENTAL', { docsRead: _prodChanged, cachedCount: Object.keys(cacheMap).length, reason: 'delta' });
      }
    } else {
      // ── 전체 로드 (캐시 없음) ──
      var snap = await _fbDb.collection('products').get();
      snap.docs.forEach(function(d) { changedDocs.push(_pmNormalizeDoc(d)); });
      var initTs = changedDocs.reduce(function(m, r) { return Math.max(m, r.updated_at_ms || 0); }, 0);
      if (initTs === 0) initTs = Date.now();
      console.log('[MergeProducts] 전체 로드: ' + snap.size + '건 (read=' + snap.size + ')');
      // race 방지: 캐시 저장 완료까지 대기
      await _pmSaveCache('product_cache', changedDocs, initTs);
      if (typeof _telemetryLog === 'function') {
        var _pcSen = _pmSentinelRead('product_cache');
        var _pcReason = (_pcSen && _pcSen.ts) ? 'cold-start-evicted' : 'cold-start-firstvisit';
        _telemetryLog('product', 'FULL', { docsRead: snap.size, cachedCount: 0, reason: _pcReason });
      }
    }

    // ITEM_DATA 반영: 변경/추가 merge + 삭제 제거
    var added = 0, updated = 0;
    changedDocs.forEach(function(p) {
      var no = p.no || p.__id;
      var existsIdx = ITEM_DATA.findIndex(function(it) { return it.no === no; });
      var item = {
        cat: p.cat || '',
        cls: p.cls || '',
        no: no,
        model: p.model || '',
        name: p.name || '',
        spec: p.spec || '',
        price: Number(p.price) || 0
      };
      if (existsIdx === -1) { ITEM_DATA.push(item); added++; }
      else { Object.assign(ITEM_DATA[existsIdx], item); updated++; }
    });
    deletedIds.forEach(function(id) {
      var idx = ITEM_DATA.findIndex(function(it) { return it.no === id; });
      if (idx !== -1) ITEM_DATA.splice(idx, 1);
    });
    if (added > 0 || updated > 0 || deletedIds.length > 0) {
      console.log('[MergeProducts] ITEM_DATA: +' + added + ' / ~' + updated + ' / -' + deletedIds.length);
    }
  } catch(e) { console.warn('[MergeProducts] error:', e); }
  })();
  try { return await _mergeApprovedProductsPromise; }
  finally { _mergeApprovedProductsPromise = null; }
}

function openProductList() {
  var u = getCurrentUser();
  if (!u) { neoAlert(t('msg_login_required')); return; }
  var isAdmin = _isAdmin(u);
  var perms = (u.permissions) || [];
  if (!isAdmin && !perms.includes('prod_list')) { neoAlert(t('msg_no_permission')); return; }
  if (!_pmLoaded) {
    _buildPmFilters();
    _loadProductPrices().then(function() { renderProductList(); });
    _pmLoaded = true;
  }
  document.getElementById('pmOverlay').classList.add('open');
  var pmModal = document.querySelector('#pmOverlay .cm-modal');
  if (pmModal && !pmModal.classList.contains('fullscreen')) {
    var fsBtn = pmModal.querySelector('.modal-btn-fs');
    if (fsBtn) modalToggleFS(fsBtn);
  }
}
function closeProductList() {
  document.getElementById('pmOverlay').classList.remove('open');
}
function minimizeProductList() {
  document.getElementById('pmOverlay').classList.remove('open');
}

function _buildPmFilters() {
  var cats = [], clss = [];
  ITEM_DATA.forEach(function(it) {
    if (it.cat && cats.indexOf(it.cat) === -1) cats.push(it.cat);
    if (it.cls && clss.indexOf(it.cls) === -1) clss.push(it.cls);
  });
  cats.sort(); clss.sort();
  var catSel = document.getElementById('pmCatFilter');
  cats.forEach(function(c) { catSel.innerHTML += '<option value="' + c + '">' + c + '</option>'; });
  var clsSel = document.getElementById('pmClsFilter');
  clss.forEach(function(c) { clsSel.innerHTML += '<option value="' + c + '">' + c + '</option>'; });
}

function pmCatChanged() {
  var cat = document.getElementById('pmCatFilter').value;
  var clsSel = document.getElementById('pmClsFilter');
  var clss = [];
  ITEM_DATA.forEach(function(it) {
    if (cat && it.cat !== cat) return;
    if (it.cls && clss.indexOf(it.cls) === -1) clss.push(it.cls);
  });
  clss.sort();
  clsSel.innerHTML = '<option value="">' + t('pm_all') + '</option>';
  clss.forEach(function(c) { clsSel.innerHTML += '<option value="' + c + '">' + c + '</option>'; });
}

function _fmtPrice(v) {
  if (!v && v !== 0) return '-';
  return Number(v).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
}

function renderProductList() {
  var q = (document.getElementById('pmSearch').value || '').toLowerCase().trim();
  var cat = document.getElementById('pmCatFilter').value;
  var cls = document.getElementById('pmClsFilter').value;
  var tbody = document.getElementById('pmTbody');
  var filtered = ITEM_DATA.filter(function(it) {
    if (cat && it.cat !== cat) return false;
    if (cls && it.cls !== cls) return false;
    if (q) {
      return _itemSearchMatch({ model: it.model, no: it.no, name: (it.name || '') + ' ' + (it.cat || '') + ' ' + (it.cls || ''), spec: it.spec }, q);
    }
    return true;
  });
  window._pmFiltered = filtered;
  tbody.innerHTML = filtered.map(function(it, i) {
    var p = _getItemPrice(it);
    return '<tr style="cursor:pointer;" onclick="openProdDetail(' + i + ')">' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + (it.cat || '') + '</td>' +
      '<td>' + (it.cls || '') + '</td>' +
      '<td style="font-family:monospace;font-size:12px;">' + (it.no || '') + '</td>' +
      '<td style="font-weight:700;color:#2563eb;">' + (it.model || '') + '</td>' +
      '<td>' + (it.name || '') + '</td>' +
      '<td>' + (it.spec || '') + '</td>' +
      '<td style="text-align:right;font-weight:600;color:#7c3aed;">' + _fmtPrice(p.retail) + '</td>' +
      '<td style="text-align:right;">' + _fmtPrice(p.supply) + '</td>' +
      '<td style="text-align:right;color:#6b7280;">' + _fmtPrice(p.vat) + '</td>' +
      '<td style="text-align:center;font-size:11px;">' + (p.date || '') + '</td>' +
    '</tr>';
  }).join('');
  document.getElementById('pmCount').textContent = t('pm_count').replace('{0}', filtered.length).replace('{1}', ITEM_DATA.length);
}

function openProdDetail(idx) {
  var it = window._pmFiltered ? window._pmFiltered[idx] : null;
  if (!it) return;
  var p = _getItemPrice(it);
  // Firestore에서 사진/메모 가져오기 (있으면)
  var card = document.getElementById('prodDetailCard');
  var rows = [
    { label: 'Category', val: it.cat || '-' },
    { label: 'Class', val: it.cls || '-' },
    { label: t('pr_label_model'), val: it.model || '-', copy: true },
    { label: t('pr_label_itemno'), val: it.no || '-', copy: true },
    { label: t('pr_label_name'), val: it.name || '-', copy: true },
    { label: t('pr_label_spec'), val: it.spec || '-' },
    { label: 'Retail Price', val: _fmtPrice(p.retail), price: true },
    { label: 'Supply Price', val: _fmtPrice(p.supply) },
    { label: 'VAT', val: _fmtPrice(p.vat) },
    { label: t('pr_label_effdate'), val: p.date || '-' }
  ];

  card.innerHTML =
    '<div class="prod-detail-hdr">' +
      '<h3>📦 ' + escHtml(it.model || it.name || it.no) + '</h3>' +
      '<button class="modal-btn-close" onclick="closeProdDetail()">&#x2715;</button>' +
    '</div>' +
    '<div class="prod-detail-body">' +
      rows.map(function(r) {
        var valCls = r.copy ? ' copyable" onclick="_copyText(\'' + escHtml(r.val) + '\',this)" title="' + t('pm_click_copy') + '"' : '"';
        var valStyle = r.price ? ' class="prod-detail-val prod-detail-price"' : ' class="prod-detail-val' + valCls;
        return '<div class="prod-detail-row">' +
          '<span class="prod-detail-label">' + r.label + '</span>' +
          '<span' + valStyle + '>' + escHtml(r.val) + '</span>' +
        '</div>';
      }).join('') +
      '<div id="prodDetailPhotos"></div>' +
      '<div id="prodDetailMemo"></div>' +
    '</div>';

  document.getElementById('prodDetailOverlay').classList.add('open');
  _bringToFront(document.getElementById('prodDetailOverlay'));

  // Firestore에서 추가 정보 (사진, 메모) 비동기 로드
  _fbDb.collection('products').doc(it.no).get().then(function(doc) {
    if (!doc.exists) return;
    var d = doc.data();
    // 사진
    if (d.photos && d.photos.length) {
      document.getElementById('prodDetailPhotos').innerHTML =
        '<div class="prod-detail-row" style="flex-direction:column;gap:8px;">' +
          '<span class="prod-detail-label">📷 ' + t('pr_label_photo') + '</span>' +
          '<div class="prod-detail-photos">' +
            d.photos.map(function(url) {
              return '<img src="' + escHtml(url) + '" onclick="openProdImgViewer(\'' + escHtml(url) + '\')" />';
            }).join('') +
          '</div>' +
        '</div>';
    }
    // 메모
    if (d.memo) {
      document.getElementById('prodDetailMemo').innerHTML =
        '<div class="prod-detail-row">' +
          '<span class="prod-detail-label">' + t('pr_label_memo') + '</span>' +
          '<span class="prod-detail-val">' + escHtml(d.memo) + '</span>' +
        '</div>';
    }
  }).catch(function(){});
}

function closeProdDetail() {
  document.getElementById('prodDetailOverlay').classList.remove('open');
}

function pmScrollToFirst() {
  var b = document.getElementById('pmBody'); if (b) b.scrollTop = 0;
}
function pmScrollToLast() {
  var b = document.getElementById('pmBody'); if (b) b.scrollTop = b.scrollHeight;
}

// ── 가격 엑셀 업로드 ──
function triggerPriceUpload() {
  document.getElementById('pmPriceFileInput').click();
}

async function handlePriceUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  var statusEl = document.getElementById('pmUploadStatus');
  statusEl.textContent = '⏳ ' + t('pm_reading_file');
  statusEl.style.display = '';
  try {
    var data = await file.arrayBuffer();
    var wb = XLSX.read(data, {type:'array'});
    var ws = wb.Sheets[wb.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(ws);
    if (!rows.length) { statusEl.textContent = '❌ ' + t('pm_no_data'); return; }
    // 컬럼 매핑 (엑셀 헤더 자동 매칭)
    var first = rows[0];
    var colNo = Object.keys(first).find(function(k) { return /item.?no/i.test(k); }) || 'Item No';
    var colCat = Object.keys(first).find(function(k) { return /^category$/i.test(k); }) || 'Category';
    var colCls = Object.keys(first).find(function(k) { return /^class$/i.test(k); }) || 'Class';
    var colModel = Object.keys(first).find(function(k) { return /^model$/i.test(k); }) || 'Model';
    var colName = Object.keys(first).find(function(k) { return /^name$/i.test(k); }) || 'Name';
    var colSpec = Object.keys(first).find(function(k) { return /^spec$/i.test(k); }) || 'Spec';
    var colRetail = Object.keys(first).find(function(k) { return /retail/i.test(k); }) || 'Retail Price';
    var colSupply = Object.keys(first).find(function(k) { return /supply/i.test(k); }) || 'Supply Price';
    var colVat = Object.keys(first).find(function(k) { return /vat/i.test(k); }) || 'VAT';
    var colCurrency = Object.keys(first).find(function(k) { return /currency/i.test(k); }) || 'Currency Unit';
    var colDate = Object.keys(first).find(function(k) { return /start.?date|apply/i.test(k); }) || 'Apply Start Date';
    var colReason = Object.keys(first).find(function(k) { return /reason|change/i.test(k); }) || 'Change Reason';

    // ITEM_DATA 빠른 검색용 인덱스 생성
    var _itemIndex = {};
    ITEM_DATA.forEach(function(item, idx) { _itemIndex[item.no] = idx; });

    statusEl.textContent = '⏳ ' + t('pm_saving').replace('{0}', '0').replace('{1}', rows.length);
    var batch = _fbDb.batch();
    var count = 0;       // 실제 쓰기 건수 (변경된 것만)
    var skipped = 0;     // 기존과 동일해서 건너뛴 건수
    var batchCount = 0;
    var _FV = firebase.firestore.FieldValue;
    // 가격 비교 함수 — updated_at 은 비교 대상 아님
    function _isSameDoc(a, b) {
      if (!a || !b) return false;
      return (Number(a.retail) || 0) === (Number(b.retail) || 0) &&
             (Number(a.supply) || 0) === (Number(b.supply) || 0) &&
             (Number(a.vat) || 0) === (Number(b.vat) || 0) &&
             (String(a.currency || '') === String(b.currency || '')) &&
             (String(a.date || '') === String(b.date || '')) &&
             (String(a.reason || '') === String(b.reason || ''));
    }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var itemNo = String(r[colNo] || '').trim();
      if (!itemNo) continue;
      var dateVal = r[colDate] || '';
      if (dateVal instanceof Date) dateVal = dateVal.toISOString().slice(0,10);
      else if (typeof dateVal === 'number') {
        var d = new Date((dateVal - 25569) * 86400000);
        dateVal = d.toISOString().slice(0,10);
      } else dateVal = String(dateVal || '');
      var doc = {
        retail: parseFloat(String(r[colRetail] || '').replace(/[^0-9.\-]/g, '')) || 0,
        supply: parseFloat(String(r[colSupply] || '').replace(/[^0-9.\-]/g, '')) || 0,
        vat: parseFloat(String(r[colVat] || '').replace(/[^0-9.\-]/g, '')) || 0,
        currency: String(r[colCurrency] || 'THB'),
        date: dateVal,
        reason: String(r[colReason] || '')
      };

      // ── 변경분만 저장: 기존 _pmPriceMap 과 비교해 동일하면 skip ──
      // 다른 사용자의 캐시가 불필요하게 갱신되는 것을 방지 (1,600건 전체 재다운 방지)
      var prev = _pmPriceMap[itemNo];
      if (prev && _isSameDoc(prev, doc)) {
        skipped++;
      } else {
        // updated_at 은 batch.set 할 때만 추가 (_pmPriceMap 의 값 비교에 영향 안 줌)
        var docToSave = Object.assign({}, doc, { updated_at: _FV.serverTimestamp() });
        batch.set(_fbDb.collection('productPrices').doc(itemNo), docToSave);
        _pmPriceMap[itemNo] = doc;  // 비교용 캐시는 updated_at 없이
        count++;
        batchCount++;
      }

      // ITEM_DATA 기본 정보 동기화 (Category, Class, Model, Name, Spec)
      var _itmIdx = _itemIndex[itemNo];
      if (_itmIdx !== undefined) {
        var _itm = ITEM_DATA[_itmIdx];
        if (r[colCat] !== undefined && String(r[colCat]).trim()) _itm.cat = String(r[colCat]).trim();
        if (r[colCls] !== undefined) _itm.cls = String(r[colCls] || '').trim();
        if (r[colModel] !== undefined && String(r[colModel]).trim()) _itm.model = String(r[colModel]).trim();
        if (r[colName] !== undefined && String(r[colName]).trim()) _itm.name = String(r[colName]).trim();
        if (r[colSpec] !== undefined) _itm.spec = String(r[colSpec] || '').trim();
      }

      if (batchCount >= 400) {
        statusEl.textContent = '⏳ ' + t('pm_saving').replace('{0}', count).replace('{1}', rows.length);
        await batch.commit();
        batch = _fbDb.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();
    console.log('[PriceUpload] 변경 저장:', count, '건, 동일 건너뜀:', skipped, '건');
    statusEl.textContent = '✅ ' + t('pm_upload_done').replace('{0}', count) + (skipped > 0 ? ' (동일 ' + skipped + '건 스킵)' : '');
    setTimeout(function(){ statusEl.style.display = 'none'; }, 3000);
    renderProductList();
  } catch(err) {
    console.error('[PriceUpload] error:', err);
    statusEl.textContent = '❌ ' + t('pm_upload_fail') + err.message;
  }
}

function downloadProductListExcel() {
  var tbody = document.getElementById('pmTbody');
  if (!tbody || !tbody.rows.length) { showToast(t('msg_no_data')); return; }
  var headers = ['No.', 'Category', 'Class', 'Item No.', 'Model', 'Name', 'Spec', 'Retail Price', 'Supply Price', 'VAT', 'Apply Start Date'];
  var rows = [headers];
  Array.from(tbody.rows).forEach(function(tr) {
    var row = [];
    Array.from(tr.cells).forEach(function(td) { row.push(td.textContent.trim()); });
    rows.push(row);
  });
  var ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:5},{wch:12},{wch:28},{wch:24},{wch:14},{wch:36},{wch:36},{wch:12},{wch:12},{wch:10},{wch:12}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Product List');
  XLSX.writeFile(wb, 'Product_List_' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '.xlsx');
}

function openRegForm() {
  var user = getCurrentUser();
  if (!user) { neoAlert(t('msg_login_required')); return; }
  resetRegForm();
  // 모드를 신규로 초기화
  _regMode = 'new';
  var _btnNew = document.getElementById('regModeNew');
  var _btnConv = document.getElementById('regModeConvert');
  var _searchArea = document.getElementById('regConvertSearch');
  if (_btnNew) { _btnNew.style.background = '#2563eb'; _btnNew.style.color = '#fff'; }
  if (_btnConv) { _btnConv.style.background = '#f3f4f6'; _btnConv.style.color = '#6b7280'; }
  if (_searchArea) _searchArea.style.display = 'none';
  renderProvinceSelect();
  // ERP 코드는 승인 시 자동 부여 (등록 시 공란)
  document.getElementById('reg_erp').value = '';
  _regAutoNameEn = '';
  _updateRegNameEnPreview('');
  // 영업 부서: 닉네임으로 영업 담당자 자동 고정
  var regSales = document.getElementById('reg_sales');
  if (regSales && user.dept === 'Sales' && user.nickname) {
    var nick = user.nickname.toLowerCase();
    var found = false;
    for (var i = 0; i < regSales.options.length; i++) {
      if (regSales.options[i].value.toLowerCase() === nick) {
        regSales.value = regSales.options[i].value;
        found = true;
        break;
      }
    }
    if (!found) {
      var opt = document.createElement('option');
      opt.value = user.nickname;
      opt.textContent = user.nickname;
      regSales.appendChild(opt);
      regSales.value = user.nickname;
    }
    regSales.disabled = true;
    regSales.style.opacity = '0.7';
  } else if (regSales) {
    regSales.disabled = false;
    regSales.style.opacity = '';
  }
  document.getElementById('regOverlay').classList.add('show');
  _mobFullScreen(document.getElementById('regOverlay'), document.querySelector('.reg-modal'));
  document.body.style.overflow = 'hidden';
  // Google Places Autocomplete 연결
  setTimeout(_initRegPlacesAll, 100);
}
function closeRegForm() {
  document.getElementById('regMini').classList.remove('show');
  _closeBounce(document.getElementById('regOverlay'), 'show', function() {
    document.body.style.overflow = '';
    _resetModalPos(document.querySelector('.reg-modal'));
  });
}
function minimizeRegForm() {
  document.getElementById('regOverlay').classList.remove('show');
  document.body.style.overflow = '';
  document.getElementById('regMini').classList.add('show');
  _repositionMinis();
}
function restoreRegForm() {
  document.getElementById('regMini').classList.remove('show');
  var _ov = document.getElementById('regOverlay');
  _ov.classList.add('show');
  _mobFullScreen(_ov, _ov.querySelector('.reg-modal'));
  document.body.style.overflow = 'hidden';
  _repositionMinis();
}
function regOverlayClick(e) { /* X 버튼으로만 닫힘 */ }

// ══════════════════════════════════════════════════════════════════════════════
// ── 상품 등록 ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
var _prodRegPhotos = []; // {file, url}

function openProdReg() {
  var u = getCurrentUser();
  if (!u) { neoAlert(t('msg_login_required')); return; }
  var isAdmin = _isAdmin(u);
  var perms = (u.permissions) || [];
  if (!isAdmin && !perms.includes('prod_reg')) { neoAlert(t('msg_no_permission')); return; }
  resetProdReg();
  document.getElementById('prodRegOverlay').classList.add('open');
  _bringToFront(document.getElementById('prodRegOverlay'));
  document.body.style.overflow = 'hidden';
}
function closeProdReg() {
  document.getElementById('prodRegMini').classList.remove('show');
  _closeBounce(document.getElementById('prodRegOverlay'), 'open', function() {
    document.body.style.overflow = '';
    _resetModalPos(document.querySelector('.prod-reg-modal'));
  });
}
function minimizeProdReg() {
  document.getElementById('prodRegOverlay').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('prodRegMini').classList.add('show');
  _repositionMinis();
}
function restoreProdReg() {
  document.getElementById('prodRegMini').classList.remove('show');
  document.getElementById('prodRegOverlay').classList.add('open');
  _bringToFront(document.getElementById('prodRegOverlay'));
  document.body.style.overflow = 'hidden';
  _repositionMinis();
}

function resetProdReg() {
  ['pr_cat','pr_class','pr_itemno','pr_model','pr_name','pr_spec','pr_price','pr_effdate','pr_memo'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('error'); }
  });
  _prodRegPhotos.forEach(function(p) { if (p.url) URL.revokeObjectURL(p.url); });
  _prodRegPhotos = [];
  document.getElementById('prodImgPreview').innerHTML = '';
  document.getElementById('prodRegWarn').classList.remove('show');
  document.getElementById('prodRegSuccess').classList.remove('show');
  document.getElementById('prodRegSubmitBtn').disabled = false;
  // 카테고리·클래스 드롭다운 구성
  _buildPrCatClsOptions();
}

function _buildPrCatClsOptions() {
  var cats = [], clss = [];
  ITEM_DATA.forEach(function(it) {
    if (it.cat && cats.indexOf(it.cat) === -1) cats.push(it.cat);
    if (it.cls && clss.indexOf(it.cls) === -1) clss.push(it.cls);
  });
  var _catOrder = ['Fixture','Abutment','Screw','Kit','CT','Other'];
  cats.sort(function(a, b) {
    var ai = _catOrder.indexOf(a), bi = _catOrder.indexOf(b);
    if (ai === -1) ai = 999;
    if (bi === -1) bi = 999;
    return ai !== bi ? ai - bi : a.localeCompare(b);
  });
  clss.sort();
  var catSel = document.getElementById('pr_cat');
  catSel.innerHTML = '<option value="">선택</option>';
  cats.forEach(function(c) { catSel.innerHTML += '<option value="' + c + '">' + c + '</option>'; });
  var clsSel = document.getElementById('pr_class');
  clsSel.innerHTML = '<option value="">선택</option>';
  clss.forEach(function(c) { clsSel.innerHTML += '<option value="' + c + '">' + c + '</option>'; });
}

function _onPrCatChange() {
  var cat = document.getElementById('pr_cat').value;
  var clsSel = document.getElementById('pr_class');
  var clss = [];
  ITEM_DATA.forEach(function(it) {
    if (cat && it.cat !== cat) return;
    if (it.cls && clss.indexOf(it.cls) === -1) clss.push(it.cls);
  });
  clss.sort();
  clsSel.innerHTML = '<option value="">선택</option>';
  clss.forEach(function(c) { clsSel.innerHTML += '<option value="' + c + '">' + c + '</option>'; });
}

function _copyField(id) {
  var el = document.getElementById(id);
  if (!el || !el.value.trim()) return;
  navigator.clipboard.writeText(el.value.trim()).then(function() {
    var wrap = el.closest('.pr-copyable-wrap') || el.parentElement;
    var btn = wrap.querySelector('.btn-copy-inline') || wrap.querySelector('.btn-copy-field');
    if (btn) {
      btn.classList.add('copied');
      setTimeout(function() { btn.classList.remove('copied'); }, 1200);
    }
  });
}

function _copyModalName(iconEl, text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(function() {
    iconEl.classList.add('copied');
    iconEl.innerHTML = '✓';
    setTimeout(function() {
      iconEl.classList.remove('copied');
      iconEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    }, 1200);
  });
}

function _copyModalField(iconEl, text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(function() {
    iconEl.classList.add('copied');
    iconEl.innerHTML = '✓';
    setTimeout(function() {
      iconEl.classList.remove('copied');
      iconEl.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    }, 1200);
  });
}

function _copyPhone(iconEl) {
  var row = iconEl.closest('.modal-info-row');
  if (!row) return;
  var val = row.querySelector('.modal-info-value');
  if (!val) return;
  var text = val.textContent.replace(/📋|✓|복사됨/g, '').trim();
  navigator.clipboard.writeText(text).then(function() {
    iconEl.textContent = '✓';
    iconEl.style.opacity = '1';
    setTimeout(function() { iconEl.textContent = '📋'; iconEl.style.opacity = '.5'; }, 1200);
  });
}

function _copyText(text, el) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(function() {
    if (el) {
      var orig = el.textContent;
      el.textContent = '✅ 복사됨';
      setTimeout(function() { el.textContent = orig; }, 1000);
    }
  });
}

var _prDupTimer = null;
function _checkDupModel() {
  clearTimeout(_prDupTimer);
  var warn = document.getElementById('prModelDupWarn');
  warn.style.display = 'none';
  var val = document.getElementById('pr_model').value.trim();
  if (!val || val.length < 2) return;
  _prDupTimer = setTimeout(function() {
    var found = ITEM_DATA.some(function(it) {
      return it.model && it.model.toLowerCase() === val.toLowerCase();
    });
    warn.style.display = found ? 'block' : 'none';
  }, 300);
}

function formatProdPrice(el) {
  var raw = el.value.replace(/[^0-9]/g, '');
  if (raw) el.value = Number(raw).toLocaleString();
  else el.value = '';
}

function handleProdPhotos(input) {
  var files = Array.from(input.files || []);
  input.value = '';
  files.forEach(function(f) {
    if (_prodRegPhotos.length >= 5) return;
    if (f.size > 5 * 1024 * 1024) {
      neoAlert('파일 크기 초과: ' + f.name + ' (최대 5MB)');
      return;
    }
    var url = URL.createObjectURL(f);
    _prodRegPhotos.push({ file: f, url: url });
  });
  renderProdPhotos();
}

function renderProdPhotos() {
  var wrap = document.getElementById('prodImgPreview');
  wrap.innerHTML = _prodRegPhotos.map(function(p, i) {
    var isPdf = p.file && p.file.name && p.file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      return '<div class="prod-img-thumb" style="display:flex;align-items:center;justify-content:center;background:#fef3c7;cursor:pointer;" onclick="window.open(\'' + p.url + '\',\'_blank\')">' +
        '<div style="text-align:center;"><div style="font-size:28px;">📄</div><div style="font-size:9px;color:#92400e;word-break:break-all;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (p.file.name || 'PDF') + '</div></div>' +
        '<button class="rm-btn" onclick="event.stopPropagation();removeProdPhoto(' + i + ')">&times;</button>' +
      '</div>';
    }
    return '<div class="prod-img-thumb">' +
      '<img src="' + p.url + '" onclick="openProdImgViewer(\'' + p.url + '\')" />' +
      '<button class="rm-btn" onclick="removeProdPhoto(' + i + ')">&times;</button>' +
    '</div>';
  }).join('');
}

function removeProdPhoto(idx) {
  if (_prodRegPhotos[idx]) URL.revokeObjectURL(_prodRegPhotos[idx].url);
  _prodRegPhotos.splice(idx, 1);
  renderProdPhotos();
}

function openProdImgViewer(url) {
  var viewer = document.getElementById('chatImgViewer');
  if (viewer) {
    document.getElementById('chatImgViewerImg').src = url;
    viewer.classList.add('open');
  }
}

function _showProdRegWarn(msg) {
  var w = document.getElementById('prodRegWarn');
  document.getElementById('prodRegWarnMsg').textContent = msg;
  w.classList.add('show');
  w.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function submitProdReg() {
  document.getElementById('prodRegWarn').classList.remove('show');
  // 필수값 검증: 카테고리, 클래스, 형번, 모델명, 판매가
  var cat = document.getElementById('pr_cat').value.trim();
  var cls = document.getElementById('pr_class').value.trim();
  var itemno = document.getElementById('pr_itemno').value.trim();
  var model = document.getElementById('pr_model').value.trim();
  var priceRaw = document.getElementById('pr_price').value.replace(/[^0-9]/g, '');
  var hasError = false;

  var effdate = document.getElementById('pr_effdate').value;
  ['pr_cat','pr_class','pr_itemno','pr_model','pr_price','pr_effdate'].forEach(function(id) {
    var el = document.getElementById(id);
    var val = el.value.trim().replace(/[^0-9a-zA-Z\uAC00-\uD7AF\-]/g, '');
    if (!val) { el.classList.add('error'); hasError = true; }
    else el.classList.remove('error');
  });

  if (hasError) { _showProdRegWarn('필수 항목을 모두 입력해 주세요.'); return; }

  var btn = document.getElementById('prodRegSubmitBtn');
  btn.disabled = true;
  btn.textContent = '등록 중...';

  try {
    // 사진 업로드 (Firebase Storage)
    var photoUrls = [];
    for (var i = 0; i < _prodRegPhotos.length; i++) {
      var f = _prodRegPhotos[i].file;
      var ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
      var path = 'product-images/' + itemno + '_' + Date.now() + '_' + i + '.' + ext;
      var ref = firebase.storage().ref(path);
      await ref.put(f, { contentType: f.type || 'image/jpeg' });
      var dl = await ref.getDownloadURL();
      photoUrls.push(dl);
    }

    // Firestore에 저장
    var me = getCurrentUser();
    var docData = {
      category: cat,
      item_class: cls,
      item_no: itemno,
      model: model,
      name: document.getElementById('pr_name').value.trim(),
      spec: document.getElementById('pr_spec').value.trim(),
      price: Number(priceRaw) || 0,
      effective_date: effdate,
      memo: document.getElementById('pr_memo').value.trim(),
      photos: photoUrls,
      status: 'Pending',
      reg_by: me.name + ' (' + me.empid + ')',
      created_by: me.empid,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    var docRef = await _fbDb.collection('pendingProducts').add(docData);
    await _fbDb.collection('pendingProducts').doc(docRef.id).update({ id: docRef.id });

    document.getElementById('prodRegSuccess').classList.add('show');
    btn.textContent = '요청 완료';
    _updatePendProdBadge();
    setTimeout(function() { closeProdReg(); }, 1500);

  } catch(e) {
    _showProdRegWarn('등록 실패: ' + (e.message || '네트워크 오류'));
    btn.disabled = false;
    btn.textContent = '📤 등록 요청';
  }
}
// ── 상품 등록 끝 ──
// ── 등록 모드 전환 (신규 / 미거래 전환) ──────────────
var _regMode = 'new'; // 'new' or 'convert'
var _regConvertCustomer = null; // 선택된 미거래 고객

function setRegMode(mode) {
  _regMode = mode;
  var btnNew = document.getElementById('regModeNew');
  var btnConv = document.getElementById('regModeConvert');
  var searchArea = document.getElementById('regConvertSearch');

  if (mode === 'convert') {
    btnNew.style.background = '#f3f4f6'; btnNew.style.color = '#6b7280';
    btnConv.style.background = '#2563eb'; btnConv.style.color = '#fff';
    searchArea.style.display = '';
    document.getElementById('regConvertInput').value = '';
    document.getElementById('regConvertResults').innerHTML = '';
    document.getElementById('regConvertSelected').style.display = 'none';
    _regConvertCustomer = null;
    setTimeout(function() { document.getElementById('regConvertInput').focus(); }, 100);
  } else {
    btnNew.style.background = '#2563eb'; btnNew.style.color = '#fff';
    btnConv.style.background = '#f3f4f6'; btnConv.style.color = '#6b7280';
    searchArea.style.display = 'none';
    _regConvertCustomer = null;
    // 폼 초기화
    resetRegForm();
  }
}

function _searchInactiveCustomers(q) {
  _convertHighlightIdx = -1;
  var resultsDiv = document.getElementById('regConvertResults');
  q = (q || '').trim();
  if (q.length < 1) { resultsDiv.innerHTML = ''; return; }

  var qUp = q.toUpperCase();
  var matches = (DATA || []).filter(function(r) {
    var st = (r.status || '').toUpperCase();
    // 미거래 = NOT USE, Inactive 등 Active가 아닌 모든 상태
    if (st === 'ACTIVE' || st === 'VIP' || st === 'PENDING') return false;
    // 이름 또는 NT번호로 검색
    if (r.nt_code && r.nt_code.toUpperCase().indexOf(qUp) > -1) return true;
    if (r.erp && r.erp.toUpperCase().indexOf(qUp) > -1) return true;
    if (r.name_th && r.name_th.toUpperCase().indexOf(qUp) > -1) return true;
    if (r.name_en && r.name_en.toUpperCase().indexOf(qUp) > -1) return true;
    if (r.cust_name && r.cust_name.toUpperCase().indexOf(qUp) > -1) return true;
    if (r.clinic && r.clinic.toUpperCase().indexOf(qUp) > -1) return true;
    return false;
  }).slice(0, 10);

  if (!matches.length) {
    resultsDiv.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:13px;">검색 결과 없음</div>';
    return;
  }

  resultsDiv.innerHTML = matches.map(function(r, i) {
    var statusBadge = '<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:#fee2e2;color:#991b1b;">' + escHtml(r.status || 'Inactive') + '</span>';
    return '<div onclick="_selectInactiveCustomer(' + i + ')" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:8px;transition:background .15s;" onmouseenter="this.style.background=\'#f0f4ff\'" onmouseleave="this.style.background=\'\'" data-idx="' + i + '">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:600;font-size:13px;color:#111827;">' + escHtml(r.name_th || r.cust_name || '-') +
          (r.nt_code ? ' <span style="font-size:11px;color:#6b7280;background:#f3f4f6;padding:1px 5px;border-radius:4px;">' + escHtml(r.nt_code) + '</span>' : '') +
          (r.erp ? ' <span style="font-size:11px;color:#6b7280;background:#f3f4f6;padding:1px 5px;border-radius:4px;">ERP:' + escHtml(r.erp) + '</span>' : '') +
        '</div>' +
        '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">' + escHtml(r.clinic || '') + (r.location ? ' · ' + escHtml(r.location) : '') + '</div>' +
      '</div>' +
      statusBadge +
    '</div>';
  }).join('');

  // 검색 결과 데이터를 임시 저장
  window._regConvertMatches = matches;
}

var _convertHighlightIdx = -1;

function _convertInputKeydown(e) {
  var results = document.getElementById('regConvertResults');
  var items = results.querySelectorAll('[data-idx]');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _convertHighlightIdx = Math.min(_convertHighlightIdx + 1, items.length - 1);
    _highlightConvertItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _convertHighlightIdx = Math.max(_convertHighlightIdx - 1, 0);
    _highlightConvertItem(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_convertHighlightIdx >= 0 && _convertHighlightIdx < items.length) {
      _selectInactiveCustomer(parseInt(items[_convertHighlightIdx].getAttribute('data-idx')));
    } else if (items.length > 0) {
      _selectInactiveCustomer(parseInt(items[0].getAttribute('data-idx')));
    }
  }
}

function _highlightConvertItem(items) {
  items.forEach(function(it, i) {
    it.style.background = (i === _convertHighlightIdx) ? '#dbeafe' : '';
  });
  if (items[_convertHighlightIdx]) {
    items[_convertHighlightIdx].scrollIntoView({ block: 'nearest' });
  }
}

function _selectInactiveCustomer(idx) {
  var r = window._regConvertMatches && window._regConvertMatches[idx];
  if (!r) return;
  _regConvertCustomer = r;

  // 검색 결과 숨기고 선택된 고객 표시
  document.getElementById('regConvertResults').innerHTML = '';
  document.getElementById('regConvertInput').value = '';
  var selDiv = document.getElementById('regConvertSelected');
  selDiv.style.display = '';
  selDiv.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;">' +
      '<div>' +
        '<span style="font-weight:700;font-size:14px;color:#1e40af;">' + escHtml(r.name_th || r.cust_name || '-') + '</span>' +
        (r.nt_code ? ' <span style="font-size:11px;color:#6b7280;background:#dbeafe;padding:2px 6px;border-radius:4px;">' + escHtml(r.nt_code) + '</span>' : '') +
        (r.erp ? ' <span style="font-size:11px;color:#6b7280;background:#dbeafe;padding:2px 6px;border-radius:4px;">ERP:' + escHtml(r.erp) + '</span>' : '') +
        '<div style="font-size:12px;color:#6b7280;margin-top:2px;">' + escHtml(r.clinic || '') + ' · ' + escHtml(r.type || '') + ' · ' + escHtml(_titleCase(r.sales || '')) + '</div>' +
      '</div>' +
      '<button onclick="_clearConvertSelection()" style="background:none;border:none;cursor:pointer;font-size:16px;color:#ef4444;padding:4px;">✕</button>' +
    '</div>';

  // 폼 자동 채움
  _fillRegFormFromCustomer(r);
}

function _clearConvertSelection() {
  _regConvertCustomer = null;
  document.getElementById('regConvertSelected').style.display = 'none';
  document.getElementById('regConvertInput').value = '';
  document.getElementById('regConvertResults').innerHTML = '';
  resetRegForm();
}

function _fillRegFormFromCustomer(r) {
  // 고객 유형
  var typeEl = document.getElementById('reg_type');
  if (typeEl && r.type) {
    for (var i = 0; i < typeEl.options.length; i++) {
      if (typeEl.options[i].value.toUpperCase() === r.type.toUpperCase()) {
        typeEl.value = typeEl.options[i].value; break;
      }
    }
  }
  // 영업 담당자
  var salesEl = document.getElementById('reg_sales');
  if (salesEl && r.sales && !salesEl.disabled) {
    var salesLower = r.sales.toLowerCase();
    var found = false;
    for (var j = 0; j < salesEl.options.length; j++) {
      if (salesEl.options[j].value.toLowerCase() === salesLower) {
        salesEl.value = salesEl.options[j].value; found = true; break;
      }
    }
    if (!found) {
      var opt = document.createElement('option');
      opt.value = _titleCase(r.sales); opt.textContent = _titleCase(r.sales);
      salesEl.appendChild(opt); salesEl.value = _titleCase(r.sales);
    }
  }
  // 고객 이름
  var nameEl = document.getElementById('reg_name');
  if (nameEl) nameEl.value = r.name_th || r.cust_name || '';
  // 소속
  var clinicEl = document.getElementById('reg_clinic');
  if (clinicEl) clinicEl.value = r.clinic || '';
  // 전화번호
  var telEl = document.getElementById('reg_tel');
  if (telEl) telEl.value = r.tel || '';
  // Tax ID
  var taxEl = document.getElementById('reg_taxid');
  if (taxEl) taxEl.value = r.tax_id || '';
  // 등록 주소
  var addrRegEl = document.getElementById('reg_addr_reg');
  var addrRegVal = r.address || r.addr_reg || '';
  if (addrRegEl) addrRegEl.value = addrRegVal;
  // 등록 주소에서 우편번호 자동 추출 (태국 5자리)
  var zipRegEl = document.getElementById('reg_zip_reg');
  if (zipRegEl && addrRegVal) {
    var zipMatch = addrRegVal.match(/\b(\d{5})\s*$/);
    if (zipMatch) zipRegEl.value = zipMatch[1];
    else {
      var zipMatch2 = addrRegVal.match(/\b(\d{5})\b/);
      if (zipMatch2) zipRegEl.value = zipMatch2[1];
    }
  }
  // 배송 주소
  var addrDelEl = document.getElementById('reg_addr_del');
  if (addrDelEl) addrDelEl.value = r.addr_del || r.delivery_address || '';
  // 지역
  var locEl = document.getElementById('reg_location');
  if (locEl && r.location) {
    for (var k = 0; k < locEl.options.length; k++) {
      if (locEl.options[k].value === r.location || locEl.options[k].textContent === r.location) {
        locEl.value = locEl.options[k].value; break;
      }
    }
  }
  // EN 이름 자동 번역
  if (r.name_th) _autoTranslateName(r.name_th);
}

function resetRegForm() {
  // 기본 필드 초기화
  ['reg_type','reg_sales','reg_name','reg_clinic','reg_tel','reg_taxid',
   'reg_addr_reg','reg_zip_reg','reg_addr_del','reg_zip_del1','reg_location']
    .forEach(function(id) {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.classList.remove('error'); }
    });
  // 등록 주소 wrap error 제거 + 지도 숨기기
  var regMapC = document.getElementById('regAddrMapContainer');
  if (regMapC) regMapC.style.display = 'none';
  var delMapC = document.getElementById('regDelMapContainer1');
  if (delMapC) delMapC.style.display = 'none';
  const wrap = document.getElementById('regAddrRegWrap');
  if (wrap) wrap.classList.remove('error');
  // ERP error 제거
  const erpEl = document.getElementById('reg_erp');
  if (erpEl) erpEl.classList.remove('error');
  // 배송 주소 동적 블록 2~5 제거, 1번만 남기기
  const container = document.getElementById('deliveryAddrContainer');
  if (container) {
    const blocks = container.querySelectorAll('.del-addr-block');
    blocks.forEach(function(b, i) { if (i > 0) b.remove(); });
    // 1번 주소도 초기화
    const ta = document.getElementById('reg_addr_del');
    const zp = document.getElementById('reg_zip_del1');
    if (ta) ta.value = '';
    if (zp) zp.value = '';
  }
  // 추가 버튼 활성화
  const addBtn = document.getElementById('btnAddDelAddr');
  if (addBtn) addBtn.disabled = false;
  // 첨부 파일 초기화
  _regAttachFiles = [];
  var attachInput = document.getElementById('reg_attach_input');
  if (attachInput) attachInput.value = '';
  var attachList = document.getElementById('regAttachFiles');
  if (attachList) attachList.innerHTML = '';
  showRegWarn('');
  document.getElementById('regSuccess').classList.remove('show');
  const submitBtn = document.querySelector('.btn-submit-reg');
  if (submitBtn) { delete submitBtn.dataset.dupConfirmed; }
  // 미거래 전환 검색 초기화
  _regConvertCustomer = null;
  var convInput = document.getElementById('regConvertInput');
  if (convInput) convInput.value = '';
  var convResults = document.getElementById('regConvertResults');
  if (convResults) convResults.innerHTML = '';
  var convSel = document.getElementById('regConvertSelected');
  if (convSel) convSel.style.display = 'none';
}
function showRegWarn(msg) {
  const el = document.getElementById('regWarn');
  document.getElementById('regWarnMsg').textContent = msg;
  el.classList.toggle('show', !!msg);
}

function checkDupErp() {
  const val   = document.getElementById('reg_erp').value.trim();
  const field = document.getElementById('reg_erp');
  if (!val) { field.classList.remove('error'); showRegWarn(''); return; }
  const found = DATA.find(d => d.erp && d.erp.toLowerCase() === val.toLowerCase());
  if (found) {
    const name = found.cust_name || found.name_th || found.clinic || '';
    showRegWarn('이미 등록된 ERP 코드입니다: ' + val + (name ? '  →  ' + name : ''));
    field.classList.add('error');
  } else {
    field.classList.remove('error');
    if (!document.getElementById('reg_name').classList.contains('error')) showRegWarn('');
  }
}

// ── 중복 검색: 접두사(병원/클리닉/Dr./Mr./Ms. 등) 제거 후 핵심 이름 추출 ────
var _DUP_PREFIXES_TH = ['โรงพยาบาลทันตกรรม','โรงพยาบาลสัตว์','โรงพยาบาล','คลินิกทันตกรรม','คลินิกเวชกรรม','คลินิกเฉพาะทาง','คลินิก','ศูนย์ทันตกรรม','ศูนย์','ห้างหุ้นส่วนจำกัด','บริษัท','ร้าน','สำนักงาน'];
var _DUP_PREFIXES_EN = ['dental hospital','animal hospital','hospital','dental clinic','dental center','dental centre','clinic','center','centre','company','co.,ltd.','co., ltd.','co.,ltd','co.ltd.','co.ltd','ltd.','ltd','inc.','inc','corp.','corp'];
var _DUP_TITLES = ['dr.','dr','prof.','prof','ทพ.','ทพญ.','นพ.','พญ.','ผศ.','รศ.','ศ.','อ.','mr.','mr','ms.','ms','mrs.','mrs','miss','นาย','นาง','นางสาว','คุณ'];
var _DUP_SUFFIXES_EN = ['co.,ltd.','co., ltd.','co.,ltd','co.ltd.','co.ltd','ltd.','ltd','inc.','inc','corp.','corp','จำกัด','(มหาชน)','จำกัด (มหาชน)'];

function _stripDupName(val) {
  if (!val) return '';
  var s = val.trim().toLowerCase();
  // 1) 칭호(Dr./Mr./Ms./ทพ. 등) 제거
  _DUP_TITLES.forEach(function(t) {
    if (s.startsWith(t + ' ') || s.startsWith(t + '.') || s === t) {
      s = s.slice(t.length).replace(/^[\s.]+/, '');
    }
  });
  // 2) 태국어 접두사 제거 (긴 것부터)
  _DUP_PREFIXES_TH.forEach(function(p) {
    var pl = p.toLowerCase();
    if (s.startsWith(pl)) { s = s.slice(pl.length).trim(); }
  });
  // 3) 영어 접두사 제거
  _DUP_PREFIXES_EN.forEach(function(p) {
    if (s.startsWith(p + ' ') || s.startsWith(p)) {
      var after = s.slice(p.length).trim();
      if (after) s = after;
    }
  });
  // 4) 접미사 제거 (Co.,Ltd. / จำกัด 등)
  _DUP_SUFFIXES_EN.forEach(function(sf) {
    if (s.endsWith(sf)) { s = s.slice(0, -sf.length).trim(); }
  });
  // 공백·특수문자 정규화
  s = s.replace(/[\s]+/g, ' ').replace(/^[\s().,]+|[\s().,]+$/g, '');
  return s;
}

function _findDupByName(val) {
  if (!val || !DATA) return null;
  var low = val.toLowerCase().trim();
  var stripped = _stripDupName(val);
  // 1차: 정확 일치
  var exact = DATA.find(function(d) {
    return (d.name_th   && d.name_th.toLowerCase().trim()   === low) ||
           (d.name_en   && d.name_en.toLowerCase().trim()   === low) ||
           (d.cust_name && d.cust_name.toLowerCase().trim() === low) ||
           (d.clinic    && d.clinic.toLowerCase().trim()    === low);
  });
  if (exact) return exact;
  // 2차: 접두사/칭호 제거 후 핵심 이름 일치
  if (stripped.length < 3) return null; // 너무 짧으면 스킵
  return DATA.find(function(d) {
    var fields = [d.name_th, d.name_en, d.cust_name, d.clinic];
    for (var i = 0; i < fields.length; i++) {
      if (!fields[i]) continue;
      var fs = _stripDupName(fields[i]);
      if (fs.length < 3) continue;
      // 핵심 이름 정확 일치
      if (fs === stripped) return true;
      // 한쪽이 다른 쪽을 포함 (긴 이름 속에 짧은 핵심 이름)
      if (stripped.length >= 5 && fs.length >= 5) {
        if (fs.indexOf(stripped) > -1 || stripped.indexOf(fs) > -1) return true;
      }
    }
    return false;
  }) || null;
}

function checkDupName() {
  var val   = document.getElementById('reg_name').value.trim();
  var field = document.getElementById('reg_name');
  if (!val) { field.classList.remove('error'); showRegWarn(''); return; }
  var found = _findDupByName(val);
  if (found) {
    var nameStr   = found.name_th || found.name_en || found.cust_name || '';
    var nameEn    = found.name_en || '';
    var erpStr    = found.erp ? ' (ERP ' + found.erp + ')' : '';
    var salesStr  = found.sales ? ' · Sales: ' + _titleCase(found.sales) : '';
    var dispName  = nameStr + (nameEn && nameEn !== nameStr ? ' / ' + nameEn : '');
    showRegWarn(dispName + erpStr + salesStr + ' — ' + (t('dup_warn_hint') || '등록 시 중복 확인 메시지가 표시됩니다.'));
    field.classList.add('error');
  } else {
    field.classList.remove('error');
    showRegWarn('');
  }
}

// ── 중복 고객 확인 다이얼로그 ────────────────────────────────────────────────
var _dupWarningInfo = null; // 중복/다른 담당자 경고 정보 저장
function _openDupConfirm(found, warnType) {
  var nameStr   = found.name_en || found.name_th || found.cust_name || '';
  var clinicStr = found.clinic  || found.cust_name || '';
  var erpStr    = found.erp || '-';
  var salesStr  = _titleCase(found.sales || '');

  // 경고 유형별 메시지
  var msgEl = document.getElementById('dupConfirmMsg');
  var salesLine = document.getElementById('dupConfirmSales');
  if (warnType === 'other_sales') {
    msgEl.textContent = t('dup_other_sales_msg') || '동일 고객이 다른 영업 담당자에게 배정되어 있습니다. 계속 진행하시겠습니까?';
    if (salesLine) { salesLine.innerHTML = '👤 ' + (t('cm_pend_sales') || 'Sales Rep') + ': <strong>' + escHtml(salesStr) + '</strong>'; salesLine.style.display = ''; }
  } else {
    msgEl.textContent = t('dup_confirm_msg').replace('{erp}', erpStr);
    if (salesLine) { salesLine.innerHTML = salesStr ? '👤 ' + (t('cm_pend_sales') || 'Sales Rep') + ': ' + escHtml(salesStr) : ''; salesLine.style.display = salesStr ? '' : 'none'; }
  }
  document.getElementById('dupConfirmErp').textContent    = erpStr;
  document.getElementById('dupConfirmName').textContent   = nameStr;
  document.getElementById('dupConfirmClinic').textContent = clinicStr;
  // 경고 정보 임시 저장
  _dupWarningInfo = {
    type: warnType || 'dup_name',
    existing_erp: erpStr,
    existing_name: nameStr,
    existing_sales: found.sales || '',
    existing_clinic: clinicStr
  };
  document.getElementById('dupConfirmOverlay').classList.add('open');
}
function closeDupConfirm() {
  document.getElementById('dupConfirmOverlay').classList.remove('open');
  _dupWarningInfo = null;
}
function proceedRegDespiteDup() {
  document.getElementById('dupConfirmOverlay').classList.remove('open');
  var btn = document.querySelector('.btn-submit-reg');
  btn.dataset.dupConfirmed = '1';
  submitReg(); // 확인 후 등록 재실행
}

function submitReg() {
  const btn     = document.querySelector('.btn-submit-reg');
  const erp     = document.getElementById('reg_erp').value.trim();
  const type    = document.getElementById('reg_type').value;
  const sales   = document.getElementById('reg_sales').value;
  const name    = document.getElementById('reg_name').value.trim();
  const clinic  = document.getElementById('reg_clinic').value.trim();
  // tel 정제: 선두 콤마/세미콜론/슬래시/공백 제거, 중복 구분자 정규화
  const telRaw  = document.getElementById('reg_tel').value.trim();
  const tel     = telRaw
    .replace(/^[\s.,;:/\\]+/, '')                    // 선두 구두점 제거
    .replace(/[\s]*[,;\/][\s]*/g, ', ')              // 구분자 → ", "
    .replace(/,\s*$/, '')                             // 끝 콤마 제거
    .trim();
  const taxid   = (document.getElementById('reg_taxid') || {}).value?.trim() || '';
  const addrReg = document.getElementById('reg_addr_reg').value.trim();
  const zipReg  = (document.getElementById('reg_zip_reg') || {}).value?.trim() || '';
  const location = document.getElementById('reg_location').value;

  // ── 필수 항목 검증 ────────────────────────────────────────────────────────
  let hasError = false;
  const reqChecks = [
    { id:'reg_type',     val:type },
    { id:'reg_sales',    val:sales },
    { id:'reg_name',     val:name },
    { id:'reg_location', val:location }
  ];
  reqChecks.forEach(function(c) {
    const el = document.getElementById(c.id);
    if (!c.val) { if(el) el.classList.add('error'); hasError = true; }
    else { if(el) el.classList.remove('error'); }
  });
  // 등록 주소 필수
  const addrWrap = document.getElementById('regAddrRegWrap');
  if (!addrReg) {
    if (addrWrap) addrWrap.classList.add('error');
    document.getElementById('reg_addr_reg').classList.add('error');
    hasError = true;
  } else {
    if (addrWrap) addrWrap.classList.remove('error');
    document.getElementById('reg_addr_reg').classList.remove('error');
  }
  if (hasError) { showRegWarn('필수 항목을 모두 입력해 주세요. (고객 유형, 영업 담당자, 고객 이름, 등록 주소, 지역)'); return; }

  // ── Tax ID 검증 (선택이지만, 입력 시 13자리 숫자 필수) ──
  if (taxid) {
    var taxDigits = taxid.replace(/[\s\-\D]/g, '');
    var taxEl2 = document.getElementById('reg_taxid');
    if (taxDigits.length !== 13) {
      if (taxEl2) taxEl2.classList.add('error');
      showRegWarn(t('reg_taxid_invalid') || 'Tax ID는 숫자 13자리여야 합니다.');
      return;
    } else {
      if (taxEl2) taxEl2.classList.remove('error');
    }
  }

  // ── 이름 중복 / 다른 담당자 → 확인 다이얼로그 ──────────────────────────
  if (!btn.dataset.dupConfirmed) {
    var dupName = _findDupByName(name);
    if (dupName) {
      // 다른 영업 담당자 소속인 경우
      if (dupName.sales && sales && dupName.sales.toLowerCase() !== sales.toLowerCase()) {
        _openDupConfirm(dupName, 'other_sales');
      } else {
        _openDupConfirm(dupName, 'dup_name');
      }
      return;
    }
  }
  delete btn.dataset.dupConfirmed;

  // ── 배송 주소 수집 (빈 값이면 등록 주소로 대체) ───────────────────────────
  const addrRegFull = addrReg + (zipReg ? ' (' + zipReg + ')' : '');
  const delAddrs = [];
  const container = document.getElementById('deliveryAddrContainer');
  container.querySelectorAll('.del-addr-block').forEach(function(block, i) {
    const taId  = i === 0 ? 'reg_addr_del' : 'reg_addr_del_' + (i + 1);
    const zipId = i === 0 ? 'reg_zip_del1' : 'reg_zip_del_' + (i + 1);
    const ta  = block.querySelector('textarea');
    const zip = block.querySelector('.addr-zip-row input');
    const addrVal = (ta  ? ta.value.trim()  : '');
    const zipVal  = (zip ? zip.value.trim() : '');
    const full = addrVal
      ? addrVal + (zipVal ? ' (' + zipVal + ')' : '')
      : addrRegFull; // 비어 있으면 등록 주소 복사
    delAddrs.push(full);
  });

  // ── DATA에 추가 ──────────────────────────────────────────────────────────
  const user = getCurrentUser();
  const now  = new Date().toLocaleString('ko-KR');
  // 미거래 전환 모드: 기존 ERP/NT코드 포함
  var _convErp = '', _convNt = '';
  if (_regMode === 'convert' && _regConvertCustomer) {
    _convErp = _regConvertCustomer.erp || '';
    _convNt  = _regConvertCustomer.nt_code || '';
  }
  const newEntry = {
    erp: _convErp, nt_code: _convNt, name_th: name, name_en: _regAutoNameEn || '', cust_name: clinic || name,
    clinic: clinic || name, name_en2: '', sales,
    address: delAddrs[0] || addrRegFull,
    addr_reg:  addrRegFull,
    addr_del:  delAddrs[0] || '',
    addr_del2: delAddrs[1] || '',
    addr_del3: delAddrs[2] || '',
    addr_del4: delAddrs[3] || '',
    addr_del5: delAddrs[4] || '',
    tel, taxid, location,
    type, status: 'Pending', remark: '', _new: true,
    reg_by: user ? user.name + ' (' + user.empid + ')' : '알 수 없음',
    _reg_by: user ? user.name + ' (' + user.empid + ')' : '알 수 없음',
    reg_at: new Date().toISOString(),
    _reg_at: now,
    _search: [name, clinic, sales, location, type, taxid].join(' ').toLowerCase(),
    convert_from: (_regMode === 'convert' && _regConvertCustomer) ? (_regConvertCustomer.erp || _regConvertCustomer.nt_code || '') : '',
    dup_warning: _dupWarningInfo || null
  };
  _dupWarningInfo = null;
  // Pending 상태이므로 DATA에 즉시 추가하지 않음 (승인 후 활성화)

  // 더블클릭 방지
  if (btn) { btn.disabled = true; btn.textContent = '등록 중...'; }

  // Google Sheets 저장 (첨부 파일 포함)
  apiPost({ action: 'add_customer', customer: newEntry, attachments: _regAttachFiles }).catch(function(){
    if (btn) { btn.disabled = false; btn.textContent = t('reg_submit') || '등록'; }
  });

  // 배지 갱신은 실시간 리스너(onSnapshot)에서 자동 처리

  document.getElementById('regSuccess').classList.add('show');
  setTimeout(closeRegForm, 2000);
}

// ── 배송 주소 동적 추가/삭제 ─────────────────────────────────────────────────
var _delAddrCount = 1;
function addDeliveryAddr() {
  const container = document.getElementById('deliveryAddrContainer');
  const current   = container.querySelectorAll('.del-addr-block').length;
  if (current >= 5) return;
  const num     = current + 1;
  const addrId  = 'reg_addr_del_' + num;
  const zipId   = 'reg_zip_del_'  + num;
  const block   = document.createElement('div');
  block.className = 'del-addr-block';
  block.id = 'delAddrBlock' + num;
  block.innerHTML =
    '<div class="del-addr-block-header">' +
      '<span class="del-addr-block-label"><span data-i18n="del_addr_label">' + t('del_addr_label') + '</span> ' + num + '</span>' +
      '<button type="button" class="btn-del-addr-remove" onclick="removeDeliveryAddr(this)" data-i18n-title="btn_delete" title="삭제">&#x2715;</button>' +
    '</div>' +
    '<div class="addr-wrap">' +
      '<input type="text" id="' + addrId + '" placeholder="' + t('reg_addr_del_ph') + '"' +
        ' style="padding:10px 12px;font-size:14px;color:#1a202c;font-family:inherit;background:transparent;width:100%;box-sizing:border-box;" autocomplete="new-password" name="' + addrId + '_place" />' +
      '<div class="addr-zip-row">' +
        '<label>&#x1F4EE; <span data-i18n="postal_code">' + t('postal_code') + '</span></label>' +
        '<input type="text" id="' + zipId + '" placeholder="00000" maxlength="10" autocomplete="off" />' +
      '</div>' +
      '<div id="regDelMapContainer' + num + '" style="display:none;margin-top:6px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">' +
        '<div id="regDelMapDiv' + num + '" style="width:100%;height:200px;"></div>' +
      '</div>' +
    '</div>';
  container.appendChild(block);
  // Places Autocomplete 연결 (lazy focus 포함, 타이밍 문제 방어)
  var _addrEl = document.getElementById(addrId);
  var _zipEl = document.getElementById(zipId);
  _attachRegPlaces(_addrEl, 'regDelMapContainer' + num, 'regDelMapDiv' + num, _zipEl);
  // 5개 도달 시 추가 버튼 비활성화
  if (container.querySelectorAll('.del-addr-block').length >= 5) {
    document.getElementById('btnAddDelAddr').disabled = true;
  }
  // 신규 블록의 주소 입력란에 포커스
  if (_addrEl) {
    setTimeout(function(){ try { _addrEl.focus(); } catch(_){} }, 50);
  }
}

function removeDeliveryAddr(btn) {
  const block = btn.closest('.del-addr-block');
  if (!block) return;
  block.remove();
  // 번호 재정렬
  const container = document.getElementById('deliveryAddrContainer');
  container.querySelectorAll('.del-addr-block').forEach(function(b, i) {
    if (i === 0) return; // 1번은 고정
    var lbl = b.querySelector('.del-addr-block-label');
    if (lbl) lbl.innerHTML = '<span data-i18n="del_addr_label">' + t('del_addr_label') + '</span> ' + (i + 1);
  });
  document.getElementById('btnAddDelAddr').disabled = false;
}

// ── 신규 등록 고객 삭제 ──────────────────────────────────
function deleteNewCustomer(erp) {
  const user = getCurrentUser();
  if (!user) { neoAlert(t('msg_login_required')); return; }
  const idx = DATA.findIndex(d => d.erp === erp && d._new);
  if (idx === -1) return;
  const entry = DATA[idx];
  const name  = entry.cust_name || entry.name_th || erp;
  if (!confirm('"' + name + '" 고객을 삭제하시겠습니까?\n삭제자: ' + user.name + ' (' + user.empid + ')')) return;
  DATA.splice(idx, 1);
  // 결과 화면 새로고침
  doSearch();
  showToast('삭제되었습니다: ' + name);
}

// ── neoAlert : HTML5 <dialog> Top Layer 우선 사용 (z-index 무관) ──
// fallback: 미지원 브라우저는 기존 #neoAlertOverlay 사용.
function neoAlert(msg) {
  var dlg = document.getElementById('neoAlertDialog');
  var safe = String(msg);
  function _setBody(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (safe.includes('\n')) {
      el.innerHTML = safe.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    } else {
      el.textContent = safe;
    }
  }
  if (dlg && typeof dlg.showModal === 'function') {
    _setBody('neoAlertMsgDlg');
    if (!dlg.open) dlg.showModal();   // Top Layer — 어떤 stacking context 위에서도 최상위
    return;
  }
  // Legacy fallback
  _setBody('neoAlertMsg');
  document.getElementById('neoAlertOverlay').classList.add('open');
}
function closeNeoAlert() {
  var dlg = document.getElementById('neoAlertDialog');
  if (dlg && dlg.open) dlg.close();
  var ov = document.getElementById('neoAlertOverlay');
  if (ov) ov.classList.remove('open');
}

var _neoConfirmCb = null;
function neoConfirm(msg, callback) {
  _neoConfirmCb = callback;
  var el = document.getElementById('neoConfirmMsg');
  if (String(msg).includes('\n')) {
    el.innerHTML = String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  } else {
    el.textContent = msg;
  }
  document.getElementById('neoConfirmOverlay').classList.add('open');
}
function neoConfirmHtml(html, callback) {
  _neoConfirmCb = callback;
  document.getElementById('neoConfirmMsg').innerHTML = html;
  document.getElementById('neoConfirmOverlay').classList.add('open');
}
function closeNeoConfirm(result) {
  document.getElementById('neoConfirmOverlay').classList.remove('open');
  if (_neoConfirmCb) { var cb = _neoConfirmCb; _neoConfirmCb = null; cb(result); }
}

function showToast(msg) {
  const t = document.getElementById('copiedToast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); t.textContent = window.t ? window.t('msg_copied') : 'Copied'; }, 2200);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeRegForm(); closeModalDirect(); closeQuoteForm(); closePendingCustomers(); }
  // Alt+A: +Add (견적 항목 추가)
  if (e.altKey && (e.key === 'a' || e.key === 'A')) {
    var quoteOv = document.querySelector('.quote-overlay.open');
    if (quoteOv) { e.preventDefault(); addQuoteItemFromInput(); }
  }
  // Alt+S: Submit / Save
  if (e.altKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    var quoteOv = document.querySelector('.quote-overlay.open');
    var acctOv = document.getElementById('acctSettingsOverlay');
    if (quoteOv) { submitQuoteRequest(); }
    else if (acctOv && acctOv.classList.contains('open')) { saveAcctAll(); }
  }
});

if (searchInput) searchInput.focus();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(function(reg) {
    reg.update();
  });
}

// ITEM_DATA is also available in item-data.js for standalone pages

// ══════════════════════════════════════════════════════════════════════
// 상품 증분 동기화 — 관리자 도구 (콘솔에서 수동 실행)
// ══════════════════════════════════════════════════════════════════════

// 기존 products 전체에 updated_at 백필 (최초 1회만)
window._productBackfillUpdatedAt = async function() {
  try {
    var snap = await _fbDb.collection('products').get();
    var batch = _fbDb.batch();
    var count = 0, skipped = 0;
    var _FV = firebase.firestore.FieldValue;
    for (var i = 0; i < snap.size; i++) {
      var d = snap.docs[i];
      if (!d.data().updated_at) {
        batch.update(d.ref, { updated_at: _FV.serverTimestamp() });
        count++;
        if (count % 450 === 0) { await batch.commit(); batch = _fbDb.batch(); }
      } else skipped++;
    }
    if (count % 450 !== 0) await batch.commit();
    console.log('[Backfill products] updated_at 추가:', count, '건, 기존 유지:', skipped, '건');
    return { added: count, skipped: skipped };
  } catch(e) { console.error('[Backfill products] 실패:', e); return { error: e.message }; }
};

// 기존 productPrices 전체에 updated_at 백필 (최초 1회만)
window._productPriceBackfillUpdatedAt = async function() {
  try {
    var snap = await _fbDb.collection('productPrices').get();
    var batch = _fbDb.batch();
    var count = 0, skipped = 0;
    var _FV = firebase.firestore.FieldValue;
    for (var i = 0; i < snap.size; i++) {
      var d = snap.docs[i];
      if (!d.data().updated_at) {
        batch.update(d.ref, { updated_at: _FV.serverTimestamp() });
        count++;
        if (count % 450 === 0) { await batch.commit(); batch = _fbDb.batch(); }
      } else skipped++;
    }
    if (count % 450 !== 0) await batch.commit();
    console.log('[Backfill productPrices] updated_at 추가:', count, '건, 기존 유지:', skipped, '건');
    return { added: count, skipped: skipped };
  } catch(e) { console.error('[Backfill productPrices] 실패:', e); return { error: e.message }; }
};

// 상품 삭제 헬퍼 (tombstone 기록 포함) — 향후 삭제 UI 에서 이 함수 호출
window._deleteProduct = async function(itemNo) {
  if (!itemNo) return { ok: false, msg: 'no itemNo' };
  try {
    var _me = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    var _meId = _me ? (_me.nickname || _me.empid) : 'unknown';
    var _FV = firebase.firestore.FieldValue;
    // 기존 문서 읽어서 tombstone 에 메타 보존
    var prodSnap = await _fbDb.collection('products').doc(itemNo).get();
    var prodInfo = prodSnap.exists ? prodSnap.data() : {};
    var batch = _fbDb.batch();
    batch.delete(_fbDb.collection('products').doc(itemNo));
    batch.delete(_fbDb.collection('productPrices').doc(itemNo));
    batch.set(_fbDb.collection('product_deletions').doc(itemNo), {
      item_no: itemNo,
      model: prodInfo.model || '',
      name: prodInfo.name || '',
      deleted_by: _meId,
      deleted_at: _FV.serverTimestamp()
    });
    batch.set(_fbDb.collection('product_price_deletions').doc(itemNo), {
      item_no: itemNo,
      deleted_by: _meId,
      deleted_at: _FV.serverTimestamp()
    });
    await batch.commit();
    // 로컬 ITEM_DATA, _pmPriceMap 에서 제거
    if (typeof ITEM_DATA !== 'undefined') {
      var idx = ITEM_DATA.findIndex(function(it) { return it.no === itemNo; });
      if (idx !== -1) ITEM_DATA.splice(idx, 1);
    }
    if (typeof _pmPriceMap !== 'undefined') delete _pmPriceMap[itemNo];
    console.log('[DeleteProduct] ' + itemNo + ' 삭제 + tombstone 기록');
    return { ok: true };
  } catch(e) { console.error('[DeleteProduct] 실패:', e); return { ok: false, msg: e.message }; }
};
var ITEM_DATA = [{"cat":"Abutment","cls":"Straight Abutment","no":"1ENCPABISCE5200043","model":"ISAH537","name":"IS Cemented Abutment","spec":"Ø5.2*3.0mm L:7.0mm Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1ENCPABISCE6500180","model":"ISAS7540","name":"IS Cemented Abutment","spec":"Ø6.5*5.0mm L:4.0mm SCRP"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH4000001","model":"ISEHA4003S","name":"IS Encoded Healing abutment","spec":"Ø4.0 Cuff 3.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH4000002","model":"ISEHA4004S","name":"IS Encoded Healing abutment","spec":"Ø4.0 Cuff 4.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH4000003","model":"ISEHA4005S","name":"IS Encoded Healing abutment","spec":"Ø4.0 Cuff 5.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH4000004","model":"ISEHA4006S","name":"IS Encoded Healing abutment","spec":"Ø4.0 Cuff 6.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH4600006","model":"ISEHA403S","name":"IS Encoded Healing abutment","spec":"Ø4.6 Cuff 3.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH4600007","model":"ISEHA404S","name":"IS Encoded Healing abutment","spec":"Ø4.6 Cuff 4.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH4600008","model":"ISEHA405S","name":"IS Encoded Healing abutment","spec":"Ø4.6 Cuff 5.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH4600009","model":"ISEHA406S","name":"IS Encoded Healing abutment","spec":"Ø4.6 Cuff 6.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH5300011","model":"ISEHA502S","name":"IS Encoded Healing abutment","spec":"Ø5.3 Cuff 2.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH5300012","model":"ISEHA503S","name":"IS Encoded Healing abutment","spec":"Ø5.3 Cuff 3.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH5300013","model":"ISEHA504S","name":"IS Encoded Healing abutment","spec":"Ø5.3 Cuff 4.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH5300014","model":"ISEHA505S","name":"IS Encoded Healing abutment","spec":"Ø5.3 Cuff 5.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH5800015","model":"ISEHA602S","name":"IS Encoded Healing abutment","spec":"Ø5.8 Cuff 2.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH5800016","model":"ISEHA603S","name":"IS Encoded Healing abutment","spec":"Ø5.8 Cuff 3.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH5800017","model":"ISEHA604S","name":"IS Encoded Healing abutment","spec":"Ø5.8 Cuff 4.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH5800018","model":"ISEHA605S","name":"IS Encoded Healing abutment","spec":"Ø5.8 Cuff 5.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH6600019","model":"ISEHA702S","name":"IS Encoded Healing abutment","spec":"Ø6.6 Cuff 2.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH6600020","model":"ISEHA703S","name":"IS Encoded Healing abutment","spec":"Ø6.6 Cuff 3.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH6600021","model":"ISEHA704S","name":"IS Encoded Healing abutment","spec":"Ø6.6 Cuff 4.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISEH6600022","model":"ISEHA705S","name":"IS Encoded Healing abutment","spec":"Ø6.6 Cuff 5.5mm Hex"},{"cat":"Abutment","cls":"Healing Abutment","no":"1ENCPABISHE3000053","model":"ISH3003","name":"IS Healing Abutment","spec":"Ø3.0*3.0mm"},{"cat":"Abutment","cls":"Straight Abutment","no":"1ENCPABISTC4500001","model":"ISTCAH4509","name":"IS Ti-Cylinder","spec":"Ø4.5 L:9.0mm Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1ENCPABISTC4500005","model":"ISTCAN4509","name":"IS Ti-Cylinder","spec":"Ø4.5 L:9.0mm Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1ENCPABISTC5500002","model":"ISTCAH5509","name":"IS Ti-Cylinder","spec":"Ø5.5 L:9.0mm Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1ENCPABISTC5500006","model":"ISTCAN5509","name":"IS Ti-Cylinder","spec":"Ø5.5 L:9.0mm Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1ENCPABITCE4300011","model":"ICOW500","name":"IT Cemented Abutment","spec":"Ø4.3*0mm Octa Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1ENCPABITCE4300012","model":"ICOW510","name":"IT Cemented Abutment","spec":"Ø4.3*1.0mm Octa Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1ENCPABITCE4300023","model":"ICNW500","name":"IT Cemented Abutment","spec":"Ø4.3*0mm Non-Octa Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1ENCPABITCE4300024","model":"ICNW510","name":"IT Cemented Abutment","spec":"Ø4.3*1.0mm Non-Octa Wide Neck"},{"cat":"Other","cls":"Lab analog","no":"1ENCPCOISLA4500008","model":"ISLA545","name":"IS Abutment Level Lab Analog","spec":"Ø5.2, L:4.5mm"},{"cat":"Other","cls":"Lab analog","no":"1ENCPCOISLA4500028","model":"ISLA445","name":"IS Lab Analog","spec":"Ø4.5, L:4.5mm"},{"cat":"Other","cls":"Lab analog","no":"1ENCPCOISLA5200014","model":"ISLA645","name":"IS Abutment Level Lab Analog","spec":"Ø5.7, L:4.5mm"},{"cat":"Other","cls":"Lab analog","no":"1ENCPCOISLA5200018","model":"ISLA745","name":"IS Abutment Level Lab Analog","spec":"Ø6.5, L:4.5mm"},{"cat":"Other","cls":"Plastic","no":"1ENCPCOITIM6500002","model":"ITIW00","name":"IT Plastic Impression Coping Cap","spec":"ø6.5 L:8.0mm"},{"cat":"Other","cls":"Lab analog","no":"1ENCPCOITLA5700001","model":"ITAR40","name":"IT Lab Analog","spec":"4.0mm, Yellow"},{"cat":"Other","cls":"Lab analog","no":"1ENCPCOITLA5700002","model":"ITAR55","name":"IT Lab Analog","spec":"5.5mm"},{"cat":"Other","cls":"Lab analog","no":"1ENCPCOITLA5700003","model":"ITAR70","name":"IT Lab Analog","spec":"7.0mm, Blue"},{"cat":"Other","cls":"Lab analog","no":"1ENCPCOITLA6500006","model":"ITELA440","name":"IT Lab Analog","spec":"4.0mm, Yellow"},{"cat":"Other","cls":"Lab analog","no":"1ENCPCOITLA6500007","model":"ITELA455","name":"IT Lab Analog","spec":"5.5mm"},{"cat":"Other","cls":"Lab analog","no":"1ENCPCOITLA6500008","model":"ITELA470","name":"IT Lab Analog","spec":"7.0mm, Blue"},{"cat":"Other","cls":"Plastic","no":"1ENCPCOITPL6500001","model":"ITPWBR","name":"IT Solid Plastic Coping","spec":"ø6.5, Bridge, White"},{"cat":"Other","cls":"Plastic","no":"1ENCPCOITPL6500002","model":"ITPWCR","name":"IT Solid Plastic Coping","spec":"ø6.5, Single, Red"},{"cat":"Other","cls":"Plastic","no":"1ENCPCOITPO5000005","model":"ITEPC55","name":"IT Plastic Impression Coping Cap","spec":"5.5mm Gray"},{"cat":"Other","cls":"Plastic","no":"1ENCPCOITPO5000006","model":"ITEPC70","name":"IT Plastic Impression Coping Cap","spec":"7.0mm Blue"},{"cat":"Other","cls":"Plastic","no":"1ENCPCOITPO5000007","model":"ITYW40","name":"IT Plastic Impression Coping Cap","spec":"4.0mm Yellow"},{"cat":"Other","cls":"Plastic","no":"1ENCPCOITPO5000008","model":"ITYW55","name":"IT Plastic Impression Coping Cap","spec":"5.5mm Gray"},{"cat":"Other","cls":"Plastic","no":"1ENCPCOITPR5500005","model":"ITYR55","name":"IT Plastic Impression Coping Cap","spec":"5.5mm Gray"},{"cat":"Other","cls":"Plastic","no":"1ENCPCOITPR5500006","model":"ITYR70","name":"IT Plastic Impression Coping Cap","spec":"7.0mm Blue"},{"cat":"Other","cls":"Plastic","no":"1ENCPCOITSP6500001","model":"ITHPC","name":"IT Solid Plastic Coping","spec":"Single"},{"cat":"Other","cls":"Dummy","no":"1ENCPFIISSA4000079","model":"IS34010D","name":"IS-III Fixture Dummy","spec":"Ø4.0*10.0mm"},{"cat":"Other","cls":"CMI IS-III Active","no":"1ENCPFIISTA4000082","model":"BIS4010D","name":"IS-II Fixture Dummy","spec":"Ø4.0*10.0mm, 2.5Hex"},{"cat":"Fixture","cls":"S-mini Ball Type","no":"1ENCPFIMIOR3000034","model":"MIB30133","name":"S-Mini Fixture-Ball type","spec":"ø3.0*13.0mmC:3mm"},{"cat":"Other","cls":"Set","no":"1ENCPICDRTP2000001","model":"FDHSET01","name":"Friction Driver Set","spec":"."},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC3500075","model":"ISPCIB3503C","name":"IS PickCap Impression Set","spec":"ø3.5*3.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC3500076","model":"ISPCIB3505C","name":"IS PickCap Impression Set","spec":"ø3.5*5.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC3500077","model":"ISPCIB3508C","name":"IS PickCap Impression Set","spec":"ø3.5*8.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC3500078","model":"ISPCIB3510C","name":"IS PickCap Impression Set","spec":"ø3.5*10.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC4000079","model":"ISPCIB4003C","name":"IS PickCap Impression Set","spec":"ø4.0*3.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC4000080","model":"ISPCIB4005C","name":"IS PickCap Impression Set","spec":"Ø4.0*5mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC4000081","model":"ISPCIB4008C","name":"IS PickCap Impression Set","spec":"Ø4.0*8mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC4500083","model":"ISPCIB403C","name":"IS PickCap Impression Set","spec":"ø4.5*3.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC4500084","model":"ISPCIB405C","name":"IS PickCap Impression Set","spec":"ø4.5*5.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC4500085","model":"ISPCIB408C","name":"IS PickCap Impression Set","spec":"ø4.5*8.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC5200087","model":"ISPCIB502C","name":"IS PickCap Impression Set","spec":"ø5.2*2.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC5200088","model":"ISPCIB503C","name":"IS PickCap Impression Set","spec":"ø5.2*3.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC5200089","model":"ISPCIB504C","name":"IS PickCap Impression Set","spec":"ø5.2*4.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC5200090","model":"ISPCIB505C","name":"IS PickCap Impression Set","spec":"ø5.2*5.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC5700092","model":"ISPCIB602C","name":"IS PickCap Impression Set","spec":"ø5.7*2.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC5700093","model":"ISPCIB603C","name":"IS PickCap Impression Set","spec":"ø5.7*3.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC5700094","model":"ISPCIB604C","name":"IS PickCap Impression Set","spec":"ø5.7*4.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC5700095","model":"ISPCIB605C","name":"IS PickCap Impression Set","spec":"ø5.7*5.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC6500098","model":"ISPCIB703C","name":"IS PickCap Impression Set","spec":"ø6.5*3.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC6500099","model":"ISPCIB704C","name":"IS PickCap Impression Set","spec":"ø6.5*4.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPICISPC6500100","model":"ISPCIB705C","name":"IS PickCap Impression Set","spec":"ø6.5*5.0mm"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1ENCPICISPU4500039","model":"ISIPSL450","name":"IS Pick-up Impression Coping Set","spec":"ø4.5 Long"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1ENCPICISPU4800032","model":"ISIPS411","name":"IS Pick-up Impression Coping Set","spec":"ø4.8"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1ENCPICISPU5500034","model":"ISIPS511","name":"IS Pick-up Impression Coping Set","spec":"ø5.5"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1ENCPICISPU6000035","model":"ISIPS611","name":"IS Pick-up Impression Coping Set","spec":"ø6.0"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1ENCPICITTR5500001","model":"ITITN511","name":"IT Transfer Impression Coping Set","spec":"ø5.5 Non-Octa"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1ENCPICITTR5500003","model":"ITITNL511","name":"IT Transfer Impression Coping Set","spec":"ø5.5 Non-Octa Long"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1ENCPICITTR7200002","model":"ITITN711","name":"IT Transfer Impression Coping Set","spec":"ø7.2 Non-Octa"},{"cat":"Screw","cls":"Screw","no":"1ENCPICITTS2000002","model":"ITTIS20H","name":"IT Transfer Impression Coping Screw","spec":"M2.0 Short 1.2Hex"},{"cat":"Other","cls":"FR Kit","no":"1ENCPKIEMFR0200024","model":"FRKIT","name":"Fixture Remover KIT","spec":"Ver.07(R2)"},{"cat":"Other","cls":"FR Kit","no":"1ENCPKIEMFR1600016","model":"FRKIT02TRAY1","name":"Fixture Remover KIT Tray","spec":"상판 Ver.07 (R1)"},{"cat":"Other","cls":"FR Kit","no":"1ENCPKIEMFR1700017","model":"FRKIT02TRAY2","name":"Fixture Remover KIT Tray","spec":"중판 Ver.07 (R1)"},{"cat":"Other","cls":"FR Kit","no":"1ENCPKIEMFR1800018","model":"FRKIT02TRAY3","name":"Fixture Remover KIT Tray","spec":"하판 Ver.07 (R1)"},{"cat":"Other","cls":"SR Kit","no":"1ENCPKIEMSR0200004","model":"SRKIT2","name":"Screw Remover KIT 2","spec":"Ver.01(R2)"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPKIPRNP0100003","model":"PCIKIT","name":"Neo Pick Cap Impression KIT","spec":"Ver.01(R2)"},{"cat":"Other","cls":"Universal Prosthetic Kit","no":"1ENCPKIPRPK0100002","model":"UVPRTKIT","name":"Universal Prosthetic KIT","spec":"Ver.00(R1)"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPKIPRPK0200004","model":"PRTKIT","name":"Prosthetic KIT","spec":"Ver.02(R1)"},{"cat":"Other","cls":"Prosthetic Planning Kit","no":"1ENCPKIPRPP0100005","model":"PRTPNKIT","name":"Prosthetic Planning KIT","spec":"Ver.01(R1)"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPKISISC0400013","model":"SCAKIT","name":"Sinus Crestal Approach KIT","spec":"Ver.06(R2)"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPKISISI0100008","model":"SAKIT","name":"Neo SinusAll KIT","spec":"Ver.02(R2)"},{"cat":"Other","cls":"SLA Kit","no":"1ENCPKISISL0500027","model":"SLAKIT","name":"Sinus Lateral Approach KIT","spec":"Ver.07(R2)"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPKISIVS0100001","model":"VAROGSKIT","name":"VARO Guide Sinus KIT","spec":"Ver.00(R0)"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPKISUAC0100002","model":"ACCKIT","name":"Accessory KIT","spec":"Ver.01(R1)"},{"cat":"Other","cls":"Instrument","no":"1ENCPKISUCK0300001","model":"CSTKITTRAY1","name":"CUSTOM KIT TRAY","spec":"Ver.01"},{"cat":"Other","cls":"Instrument","no":"1ENCPKISUCK0300002","model":"CSTKITTRAY2","name":"CUSTOM KIT TRAY","spec":"Middle Plate, Ver.01"},{"cat":"Other","cls":"Instrument","no":"1ENCPKISUCK0300003","model":"CSTKITTRAY3","name":"CUSTOM KIT TRAY","spec":"Ver.01"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPKISUCR0000001","model":"NEOCKIT","name":"Neo Core KIT","spec":"Ver.00"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPKISUCR0000006","model":"NEOCKIT","name":"Neo Core KIT","spec":"Ver.00 (R1)"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPKISUCR0000007","model":"NEOCKIT","name":"Neo Core KIT","spec":"Ver.00(R2)"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPKISUIF0200004","model":"ISFFKIT","name":"IS Full KIT","spec":"Ver.06(R2)"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPKISUNM0100005","model":"NEOMKIT","name":"Neo Master KIT","spec":"Ver.00"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPKISUNM0100010","model":"NEOMKIT","name":"Neo Master KIT","spec":"Ver.00(R2)"},{"cat":"Other","cls":"Neo Surgical Kit","no":"1ENCPKISUNN0100003","model":"NEOSKIT","name":"Neo Surgical KIT","spec":"Ver.01(R2)"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPKISURW0100006","model":"RWKIT","name":"Ridge Wider KIT","spec":"Ver.01(R1)"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPKISUSD0100007","model":"STOPDRILLKIT","name":"Stop Drill KIT","spec":"Ver.03(R1)"},{"cat":"Other","cls":"S-mini Kit","no":"1ENCPKISUSM0100010","model":"SMKIT","name":"S-Mini KIT","spec":"Ver.03(R1)"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPKISUSW0100012","model":"SWKIT","name":"S-Wide KIT","spec":"Ver.02(R1)"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPKISUVG0100001","model":"VAROGKIT","name":"VARO Guide KIT","spec":"Ver.00(R0)"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPKISUVM0100001","model":"VAROGMKIT","name":"VARO Guide Mini KIT","spec":"Ver.00(R0)"},{"cat":"Screw","cls":"Fixing Screw","no":"1ENCPMESCFS1600002","model":"MFS1603","name":"Fixing Screw","spec":"Ø1.6*3.0mm"},{"cat":"Screw","cls":"Fixing Screw","no":"1ENCPMESCFS1600004","model":"MFS1605","name":"Fixing Screw","spec":"Ø1.6*5.0mm"},{"cat":"Screw","cls":"Fixing Screw","no":"1ENCPMESCFS1600006","model":"MFS1607","name":"Fixing Screw","spec":"Ø1.6*7.0mm"},{"cat":"Screw","cls":"Tent Screw","no":"1ENCPMESCTS2000010","model":"CTS2007","name":"Tent Screw","spec":"Ø2.0*7.0mm"},{"cat":"Screw","cls":"Tent Screw","no":"1ENCPMESCTS2000012","model":"CTS2010","name":"Tent Screw","spec":"Ø2.0*10.0mm"},{"cat":"Screw","cls":"Tent Screw","no":"1ENCPMESCTS2000014","model":"CTS2013","name":"Tent Screw","spec":"Ø2.0*13.0mm"},{"cat":"Screw","cls":"Tent Screw","no":"1ENCPMESCTS2000015","model":"CTS2015","name":"Tent Screw","spec":"Ø2.0*15.0mm"},{"cat":"Screw","cls":"Tent Screw","no":"1ENCPMESCTS2000027","model":"CTSSET02","name":"Tent Screw","spec":"Ø2.0/L:7101315mm"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM0800051","model":"RATMB0810F","name":"Cti-Mem","spec":"(P:W:L=4:8:6)/RA1"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM0900052","model":"RATMB0912F","name":"Cti-Mem","spec":"(P:W:L=4:10:8)/RA2"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM0900053","model":"RATMB0915F","name":"CTi-Mem","spec":"(P:W:L = 4:10:11) / RA3"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM0900063","model":"RPTML0910F","name":"Cti-Mem","spec":"(P:W:L=7:9:6)/RC1"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM0900064","model":"RPTML0912F","name":"Cti-Mem","spec":"(P:W:L=7:9:8)/RC2"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM0900065","model":"RPTML0915F","name":"Cti-Mem","spec":"(P:W:L=7:10:11)/RC3"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM1200058","model":"RPTMB1212SF","name":"Cti-Mem","spec":"(P:W:L=10:12:7)/RB5"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM1200066","model":"RPTML1210SF","name":"Cti-Mem","spec":"(P:W:L=10:12:5)/RC4"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM1200067","model":"RPTML1212SF","name":"Cti-Mem","spec":"(P:W:L=10:12:7)/RC5"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM1200068","model":"RPTML1215SF","name":"Cti-Mem","spec":"(P:W:L=10:12:10)/RC6"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM1200069","model":"RPTML1210LF","name":"Cti-Mem","spec":"(P:W:L=12:12:5)/RC7"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM1200070","model":"RPTML1212LF","name":"Cti-Mem","spec":"(P:W:L=12:12:7)/RC8"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM1200071","model":"RPTML1215LF","name":"Cti-Mem","spec":"(P:W:L=12:12:10)/RC9"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM1200081","model":"RCTM1215","name":"Cti-Mem","spec":"(P:L=12:15)/RE1"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM1200082","model":"RCTM1220","name":"Cti-Mem","spec":"(P:L=12:20)/RE2"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMCM1500083","model":"RCTM1525","name":"Cti-Mem","spec":"(P:L=15:25)/RE3"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMTM1200009","model":"RTMN1220125","name":"NeoTitanium Mesh","spec":"12.0mmx20.0mm/RT1"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMTM2000010","model":"RTMN2025125","name":"NeoTitanium Mesh","spec":"20.0mmx25.0mm/RT2"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMTM2500011","model":"RTMN2535125","name":"NeoTitanium Mesh","spec":"25.0mmx35.0mm/RT3"},{"cat":"Abutment","cls":"2D Cti-membrane","no":"1ENCPMETMTM3500012","model":"RTMN3550125","name":"NeoTitanium Mesh","spec":"35.0mmx50.0mm/RT4"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTODLBT6000001","model":"BTRI6010","name":"Bone Trimmer","spec":"Ø6.0 L:10mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTODLCO3200010","model":"ISCD32","name":"IS Cortical Drill","spec":"∅3.2, S-Narrow"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLCO3500001","model":"ISCD35F","name":"IS Cortical Drill","spec":"Fixture Ø3.5"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTODLCO3800005","model":"CD38","name":"Cortical Drill","spec":"Fixture Ø3.8"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLCO4000002","model":"ISCD40F","name":"IS Cortical Drill","spec":"Fixture Ø4.0"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTODLCO4300006","model":"CD43","name":"Cortical Drill","spec":"Fixture Ø4.3"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLCO4500003","model":"ISCD45F","name":"IS Cortical Drill","spec":"Fixture Ø4.5"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTODLCO4500007","model":"CD45","name":"Cortical Drill","spec":"Fixture Ø4.5"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLCO5000004","model":"ISCD50F","name":"IS Cortical Drill","spec":"Fixture Ø5.0"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTODLCO5000008","model":"CD50","name":"Cortical Drill","spec":"Fixture Ø5.0"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTODLCO5500009","model":"CD55","name":"Cortical Drill","spec":"Fixture Ø5.5"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTODLCU6000003","model":"SACG610","name":"C-Guide Reamer","spec":"Ø6.5×1.0mm"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLDM3500001","model":"DM35","name":"Dia Marker","spec":"Dia 3.5"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLDM4000023","model":"DM40","name":"Dia Marker","spec":"Dia 4.0"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLDM4500004","model":"DM45","name":"Dia Marker","spec":"Dia 4.5"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLDM5000056","model":"DM50","name":"Dia Marker","spec":"Dia 5.0"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLDM5500007","model":"DM55","name":"Dia Marker","spec":"Dia 5.5"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLDM6000008","model":"DM60","name":"Dia Marker","spec":"Dia 6.0"},{"cat":"Other","cls":"EZ GBR Kit","no":"1ENCPTODLEF1700001","model":"EZSFD17","name":"EZ-Screw Fixation Drill","spec":"Ø1.0 / Ø1.7"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTODLIN2200001","model":"SAD22","name":"SinusAll Initial Drill","spec":"Ø2.2"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTODLLI2300002","model":"LDS23CL","name":"Lindermann Drill","spec":"Ø2.3, L:40.7mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLLI2300004","model":"LDS23C","name":"Lindermann Drill","spec":"Ø2.3 L:35.8mm"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLPL3500001","model":"BP35","name":"Bone Planer","spec":"Dia 3.5"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLPL4000002","model":"BP40","name":"Bone Planer","spec":"Dia 4.0"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLPL5000003","model":"BP50","name":"Bone Planer","spec":"Dia 5.0"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLPL6500004","model":"BP65","name":"Bone Planer","spec":"Dia 6.5"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLPL8000005","model":"BP80","name":"Bone Planer","spec":"Dia 8.0"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLPR4800001","model":"ISBP48","name":"IS Bone Profiler","spec":"Ø 4.8"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTODLRD1000002","model":"RCD10","name":"Reverse Drill","spec":"Ø1.0"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTODLRD1200003","model":"RCD12","name":"Reverse Drill","spec":"Ø1.2"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTODLRD1400004","model":"RCD14","name":"Reverse Drill","spec":"Ø1.4"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTODLRE2400001","model":"ICR24","name":"S-Reamer","spec":"Ø2.4"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTODLRE2800002","model":"ICR28","name":"S-Reamer","spec":"Ø2.8"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTODLRE3200003","model":"ICR32","name":"S-Reamer","spec":"Ø3.2"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTODLRE3600004","model":"ICR36","name":"S-Reamer","spec":"Ø3.6"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLRP4000001","model":"BPN40","name":"EB Bone Profiler-N","spec":"Ø4.9"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLRP5000002","model":"BPR50","name":"EB Bone Profiler-R","spec":"Ø5.6"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLRP6000003","model":"BPB60","name":"EB Bone Profiler-W(B)","spec":"Ø6.1"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTODLRP6000004","model":"BPI60","name":"EB Bone Profiler-W(3i)","spec":"Ø6.1"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTODLSA3700003","model":"SAD37","name":"SinusAll Drill","spec":"Ø3.7"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTODLSD0700001","model":"SAWD0710N","name":"Safe Disk","spec":"Ø7.0/1.0T/Non-Saw Type"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTODLSD0700002","model":"SAWD0710S","name":"Safe Disk","spec":"Ø7.0/1.0T/Saw Type"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTODLSD0700003","model":"SAWD0703N","name":"Safe Disk","spec":"Ø7.0/0.35T/Non-Saw Type"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTODLSD0700006","model":"SAWD0703S","name":"Safe Disk","spec":"Ø7.0/0.28T/Saw Type"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTODLSD1000004","model":"SAWD1003N","name":"Safe Disk","spec":"Ø10.0/0.35T/Non-Saw Type"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTODLSD1000005","model":"SAWD1003S","name":"Safe Disk","spec":"Ø10.0/0.28T/Saw Type"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTODLSD1300007","model":"SAWD1303S","name":"Safe Disk","spec":"Ø13.0/0.28T/Saw Type"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTODLSD1300008","model":"SAWD1303N","name":"Safe Disk","spec":"Ø13.0/0.35T/Non-Saw Type"},{"cat":"Other","cls":"GBR Kit","no":"1ENCPTODLSF1300002","model":"SFD13","name":"Screw Fixation Drill","spec":"Ø1.3/ L:10"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTODLSF1500003","model":"SFD15","name":"Screw Fixation Drill","spec":"Ø1.5/ L:10"},{"cat":"Other","cls":"S-mini Kit","no":"1ENCPTODLSG1200001","model":"MGD12","name":"S-mini Guide Drill","spec":"Ø1.2 Guide"},{"cat":"Other","cls":"S-mini Kit","no":"1ENCPTODLSS1500001","model":"MSD15","name":"S-mini Twist Surgical Drill","spec":"Ø1.5"},{"cat":"Other","cls":"S-mini Kit","no":"1ENCPTODLSS2000002","model":"MSD20","name":"S-mini Twist Surgical Drill","spec":"Ø2.0"},{"cat":"Other","cls":"S-mini Kit","no":"1ENCPTODLSS2500003","model":"MSD25","name":"S-mini Twist Surgical Drill","spec":"Ø2.5"},{"cat":"Other","cls":"S-mini Kit","no":"1ENCPTODLSS3000004","model":"MSD30","name":"S-mini Twist Surgical Drill","spec":"Ø3.0"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTODLTR4000002","model":"TB40","name":"Trephine Drill","spec":"Ø4/Ø5"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTODLTR5000001","model":"TB50","name":"Trephine Drill","spec":"Ø5/Ø6"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLTS2200025","model":"TSD22CL","name":"Twist Surgical Drill","spec":"Ø2.2 L:40.7 Long"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLTS2200026","model":"TSD22CS","name":"Twist Surgical Drill","spec":"Ø2.2 L:34.7 Short"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTODLTS2200068","model":"TSDS22CL","name":"Twist Surgical Drill","spec":"Ø2.2, S-Narrow"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTODLTS2700069","model":"TSD27CL","name":"Twist Surgical Drill","spec":"Ø2.7, S-Narrow"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLTS3000031","model":"TSD30CL","name":"Twist Surgical Drill","spec":"Ø3.0 L:40.7 Long"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLTS3000032","model":"TSD30CS","name":"Twist Surgical Drill","spec":"Ø3.0 L:34.7 Short"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLTS3500037","model":"TSD35CL","name":"Twist Surgical Drill","spec":"Ø3.5 L:40.7 Long"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLTS3500038","model":"TSD35CS","name":"Twist Surgical Drill","spec":"Ø3.5 L:34.7 Short"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLTS4000042","model":"TSD40CL","name":"Twist Surgical Drill","spec":"Ø4.0 L:40.7 Long"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLTS4000043","model":"TSD40CS","name":"Twist Surgical Drill","spec":"Ø4.0 L:34.7 Short"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLTS4500049","model":"TSD45CL","name":"Twist Surgical Drill","spec":"Ø4.5 L:40.7 Long"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODLTS4500050","model":"TSD45CS","name":"Twist Surgical Drill","spec":"Ø4.5 L:34.7 Short"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTODLTS4800051","model":"TSD48","name":"Twist Surgical Drill","spec":"Ø4.8"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTODLTS5000053","model":"TSD50","name":"Twist Surgical Drill","spec":"Ø5.0"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTODLTS5500054","model":"TSD55","name":"Twist Surgical Drill","spec":"Ø5.5"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTODLTS6000055","model":"TSD60","name":"Twist Surgical Drill","spec":"Ø6.0"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRAN1200002","model":"HDA1215S","name":"Angled Driver","spec":"1.2Hex L:15.0mm"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRAN1200004","model":"HDA1220S","name":"Angled Driver","spec":"1.2Hex L:20.0mm"},{"cat":"Other","cls":"Instrument","no":"1ENCPTODRAN1200006","model":"HDA1225S","name":"Angled Driver","spec":"1.2Hex L:25.0mm"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRAN1200008","model":"HDA12515S","name":"Angled Driver","spec":"1.25Hex L:15.0mm"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRAN1200010","model":"HDA12520S","name":"Angled Driver","spec":"1.25Hex L:20.0mm"},{"cat":"Other","cls":"Instrument","no":"1ENCPTODRAN1200012","model":"HDA12525S","name":"Angled Driver","spec":"1.25Hex L:25.0mm"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRAP2600007","model":"AP202N","name":"Abutment Positioner","spec":"M2.0, L:2.0mm"},{"cat":"Other","cls":"S-mini Kit","no":"1ENCPTODRCS2000001","model":"ISQD20","name":"Cemented type S-mini Fixture Driver","spec":"Square2.0"},{"cat":"Other","cls":"GBR Kit","no":"1ENCPTODRDH1000001","model":"DHDC10","name":"Dual Hex Driver","spec":"Hex1.0/1.6, L:10"},{"cat":"Other","cls":"GBR Kit","no":"1ENCPTODRDH2000002","model":"DHDC20","name":"Dual Hex Driver","spec":"Hex1.0/1.6, L:20"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTODRFD1200001","model":"HDF1607","name":"FR Screw Hex Driver","spec":"1.6Hex / L:7mm"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTODRFD1200002","model":"HDF1612","name":"FR Screw Hex Driver","spec":"1.6Hex / L:12mm"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTODRFD1200003","model":"HDF1617","name":"FR Screw Hex Driver","spec":"1.6Hex / L:17mm"},{"cat":"Other","cls":"Instrument","no":"1ENCPTODRHD1200007","model":"HD1207S","name":"Hex Driver_Ratchet type","spec":"1.2Hex L:7.0mm"},{"cat":"Other","cls":"Instrument","no":"1ENCPTODRHD1200011","model":"HD1212S","name":"Hex Driver_Ratchet type","spec":"1.2Hex L:12.0mm"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRHD1200015","model":"HD1220S","name":"Hex Driver_Ratchet type","spec":"1.2Hex L:20.0mm"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRHD1200017","model":"HD1225S","name":"Hex Driver_Ratchet type","spec":"1.2Hex L:25.0mm"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRHD1200019","model":"HD12510S","name":"Hex Driver_Ratchet type","spec":"1.25Hex L:10.0mm"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRHD1200021","model":"HD12515S","name":"Hex Driver_Ratchet type","spec":"1.25Hex L:15.0mm"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRHD1200030","model":"HDC1210","name":"Hex Driver-Contra Angle","spec":"Hex1.2/L:10mm"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRHD1200031","model":"HDC1215","name":"Hex Driver-Contra Angle","spec":"Hex1.2/L:15mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODRIF5000005","model":"ISFD05C","name":"IS Fixture Driver","spec":"2.5Hex Contra Angle Narrow"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODRIF5000006","model":"ISFD05CL","name":"IS Fixture Driver","spec":"2.5Hex Contra Angle Long"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTODRIF5000007","model":"ISFD10R","name":"IS Fixture Driver_Ratchet Type","spec":"10.0mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTODRIF7500032","model":"ISFDSNRL","name":"IS Fixture Driver_Ratchet Type","spec":"2.1 Hex,  Ratchet, Long"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTODRND5000001","model":"SHD00","name":"Shank Driver","spec":"."},{"cat":"Other","cls":"GBR Kit","no":"1ENCPTODRPH0500001","model":"PHSD05","name":"Phillips Head Screw Driver","spec":"L:5"},{"cat":"Other","cls":"GBR Kit","no":"1ENCPTODRPH1000002","model":"PHSD10","name":"Phillips Head Screw Driver","spec":"L:10"},{"cat":"Other","cls":"GBR Kit","no":"1ENCPTODRPH2000003","model":"PHSD20","name":"Phillips Head Screw Driver","spec":"L:20"},{"cat":"Other","cls":"Prosthesis Kit","no":"1ENCPTODRRH1200002","model":"HD1220RCS","name":"Rescue Hex Driver","spec":"1.2Hex L:20.0mm"},{"cat":"Other","cls":"Instrument","no":"1ENCPTODRSA5000001","model":"ITAD0L","name":"Abutment Driver","spec":"Ø5.0 L:19.0mm"},{"cat":"Other","cls":"Instrument","no":"1ENCPTODRSA5000003","model":"ITESD00","name":"Abutment Driver","spec":"Ø5.5 L:19.0mm"},{"cat":"Other","cls":"Universal Prosthetic Kit","no":"1ENCPTODRSC1000001","model":"SCSD10S","name":"SCS Driver","spec":"Ratchet L:10.0mm"},{"cat":"Other","cls":"Universal Prosthetic Kit","no":"1ENCPTODRSC1500002","model":"SCSD15S","name":"SCS Driver","spec":"Ratchet L:15.0mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTODRTF4000001","model":"ITFDO31S","name":"IT Fixture Driver","spec":"3.1 Octa, Short, Contra Angle"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTODRTF4000002","model":"ITFDO31L","name":"IT Fixture Driver","spec":"3.1 Octa, Long, Contra Angle"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTODRTF7500001","model":"ITFDO31RS","name":"IT Fixture Driver_Ratchet Type","spec":"3.1 Octa, Short, Ratchet"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTODRTF7500002","model":"ITFDO31RL","name":"IT Fixture Driver_Ratchet Type","spec":"3.1 Octa, Long, Ratchet"},{"cat":"Other","cls":"Universal Prosthetic Kit","no":"1ENCPTODRUN1000001","model":"UGD10S","name":"Unigrip Driver","spec":"Ratchet L:10.0mm"},{"cat":"Other","cls":"Universal Prosthetic Kit","no":"1ENCPTODRUN1500002","model":"UGD15S","name":"Unigrip Driver","spec":"Ratchet L:15.0mm"},{"cat":"Other","cls":"Neo Surgical Kit","no":"1ENCPTOIADD0100001","model":"DHDG","name":"Driver Holder & Depth Gauge","spec":"."},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOIADG1700002","model":"DG17","name":"Depth Gauge","spec":"."},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOIADG2600006","model":"SADG01","name":"Depth Gauge","spec":"Dia. 2.6 / 3.1"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOIADG5000001","model":"SDG00","name":"Depth Gauge","spec":"."},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIAGH3500001","model":"GH00","name":"Guide Holder","spec":"3.5Double Hex"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOIASE5000001","model":"SLE01","name":"Sinus Elevator","spec":"#1"},{"cat":"Other","cls":"SLA Kit","no":"1ENCPTOIASE5000002","model":"SLE02","name":"Sinus Elevator","spec":"#2"},{"cat":"Other","cls":"SLA Kit","no":"1ENCPTOIASE5000004","model":"SLE03","name":"Sinus Elevator","spec":"#3"},{"cat":"Other","cls":"AutoChip Maker","no":"1ENCPTOIEAC4000035","model":"NACM40ISETS","name":"Autochip Maker Set","spec":"Ø4.0/short"},{"cat":"Other","cls":"AutoChip Maker","no":"1ENCPTOIEAC4500038","model":"NACM45ISETS","name":"Autochip Maker Set","spec":"Ø4.5/short"},{"cat":"Other","cls":"AutoChip Maker","no":"1ENCPTOIEAC5000041","model":"NACM50ISETS","name":"Autochip Maker Set","spec":"Ø5.0/short"},{"cat":"Other","cls":"AutoChip Maker","no":"1ENCPTOIEAC6000044","model":"NACM60ISETS","name":"Autochip Maker Set","spec":"Ø6.0/short"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOIEAS4200006","model":"AQT","name":"Aqua Tap","spec":"Ø4.2*3.5mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOIEAS6000005","model":"AQST","name":"Aqua System","spec":"."},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOIEBI2700001","model":"SBI27","name":"Bone Inserter","spec":"Ø2.7"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOIEBO1000001","model":"SBC01","name":"Bone Condenser","spec":"Ø1.0-Ø2.2"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTOIEBO1000003","model":"BCHI60","name":"Bone Chisel","spec":"."},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOIEBR1000004","model":"SABC01","name":"Bone Condenser","spec":"Dia. 1.0 / 2.2"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOIEBS2700001","model":"SBS20","name":"Bone spreader","spec":"Ø2.7"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOIEBS3100002","model":"SBS30","name":"Bone spreader","spec":"Ø3.1"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOIECA3500001","model":"CAA00","name":"Contra Angle Connector","spec":"."},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIECL1600001","model":"CD16","name":"Claw","spec":"M1.6"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIECL1800002","model":"CD18","name":"Claw","spec":"M1.8"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIECL2000003","model":"CD20","name":"Claw","spec":"M2.0"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIECL2500004","model":"CD25","name":"Claw","spec":"M2.5"},{"cat":"Other","cls":"GBR Kit","no":"1ENCPTOIEDR5000001","model":"DRH","name":"Driver Handle","spec":"."},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR1400015","model":"FRS14","name":"Fixture Remover Screw","spec":"M1.4"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR1600017","model":"FRS16","name":"Fixture Remover Screw","spec":"M1.6"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR1700018","model":"FRS172","name":"Fixture Remover Screw","spec":"No.1-72UNF"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR1800019","model":"FRS18","name":"Fixture Remover Screw","spec":"M1.8"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR2000020","model":"FRS20","name":"Fixture Remover Screw","spec":"M2.0"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR2500021","model":"FRS25","name":"Fixture Remover Screw","spec":"M2.5"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR3000005","model":"FR315","name":"Fixture Remover","spec":"Ø3.0 L:15.0mm"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR3000006","model":"FR320","name":"Fixture Remover","spec":"Ø3.0 L:20.0mm"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR4000007","model":"FR415","name":"Fixture Remover","spec":"Ø4.0 L:15.0mm"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR4000008","model":"FR420","name":"Fixture Remover","spec":"Ø4.0 L:20.0mm"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR5000009","model":"FR515","name":"Fixture Remover","spec":"Ø5.0 L:15.0mm"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR5000010","model":"FR520","name":"Fixture Remover","spec":"Ø5.0 L:20.0mm"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR6000011","model":"FR615","name":"Fixture Remover","spec":"Ø6.0 L:15.0mm"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIEFR6000012","model":"FR620","name":"Fixture Remover","spec":"Ø6.0 L:20.0mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOIEMD4000001","model":"MDPP4050","name":"MD Parallel Pin","spec":"4.0, 5.0"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOIEMD6000001","model":"MDPP6070","name":"MD Parallel Pin","spec":"6.0, 7.0"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOIEMD8000001","model":"MDPP8090","name":"MD Parallel Pin","spec":"8.0, 9.0"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOIEMS4000001","model":"MDS4025","name":"MD Spacer","spec":"Ø4.0*2.5mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOIEMS7000001","model":"MDS7030","name":"MD Spacer","spec":"Ø7.0*3.0mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOIEMS8000001","model":"MDS8030","name":"MD Spacer","spec":"Ø8.0*3.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1ENCPTOIEPC4000001","model":"PCIPC","name":"PickCap Impression Pincette","spec":"."},{"cat":"Other","cls":"GBR Kit","no":"1ENCPTOIERC7000009","model":"GRC15","name":"Ratchet Connector","spec":"15mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOIERC7500002","model":"RC10","name":"Ratchet Connector","spec":"10mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOIERC7500003","model":"RC15","name":"Ratchet Connector","spec":"15mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOIERC7500010","model":"RC15S","name":"Ratchet Connector","spec":"15.0mm S-Narrow"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOIESC3000001","model":"SCT30","name":"Side Cutter","spec":"Ø3.0"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIESR1000003","model":"SR10","name":"Screw Remover","spec":"Ø1.0-Ø1.3"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIESR1200001","model":"SR12","name":"Screw Remover","spec":"Ø1.2-Ø1.5"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIESR1400004","model":"SR14","name":"Screw Remover","spec":"Ø1.4-Ø1.7"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTOIETP3500004","model":"TP35","name":"Tissue Punch","spec":"Ø3.5"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTOIETP4000006","model":"TP40","name":"Tissue Punch","spec":"Ø4.0"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTOIETP4500001","model":"TP45","name":"Tissue Punch","spec":"Ø4.5"},{"cat":"Other","cls":"Accessory Kit","no":"1ENCPTOIETP5000005","model":"TP50","name":"Tissue Punch","spec":"Ø5.0"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIETQ4000006","model":"TW80400","name":"Torque Wrench","spec":"80Ncm/400Ncm"},{"cat":"Other","cls":"FR Kit","no":"1ENCPTOIETQ5000007","model":"FRCHT","name":"Ratchet","spec":"."},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIGGU1000009","model":"PG1018","name":"Perfect Guide","spec":"Ø1.0/ M1.8"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIGGU1200010","model":"PG1220","name":"Perfect Guide","spec":"Ø1.2 / M2.0"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIGGU1400011","model":"PG1425","name":"Perfect Guide","spec":"Ø1.4/ M2.5"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIGGU2200001","model":"CG00","name":"Conical Guide","spec":"22˚/16˚(IS/IT)"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIGGU2400002","model":"EHG24","name":"External Guide","spec":"2.4Hex"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIGGU2400005","model":"IHG24","name":"Internal Guide_Hex Type","spec":"2.4Hex"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIGGU2500006","model":"IHG25","name":"Internal Guide_Hex Type","spec":"2.5Hex"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIGGU2700003","model":"EHG27","name":"External Guide","spec":"2.7Hex"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIGGU3100007","model":"IOG31","name":"Internal Guide_Octa Type","spec":"3.1 Octa"},{"cat":"Other","cls":"SR Kit","no":"1ENCPTOIGGU3400004","model":"EHG34","name":"External Guide","spec":"3.4Hex"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOIGNF5000011","model":"NGISFDCARW","name":"NeoGuide IS Fixture Driver","spec":"Contra Angle Regular Wide"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOIGNF5000013","model":"NGISFDRRW","name":"NeoGuide IS Fixture Driver_Ratchet Type","spec":"Ratchet Regular Wide"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOIGNF5000016","model":"NGISFDCANA","name":"NeoGuide IS Fixture Driver","spec":"Contra Angle, Narrow"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOIGNF5000018","model":"NGISFDRNA","name":"NeoGuide IS Fixture Driver_Ratchet Type","spec":"Ratchet, Narrow"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOIGNF5000020","model":"NGISFDCASN","name":"NeoGuide IS Fixture Driver","spec":"Contra Angle, S-Narrow"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOIGNF5000022","model":"NGISFDRSN","name":"NeoGuide IS Fixture Driver_Ratchet Type","spec":"Ratchet, S-Narrow"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOIGNF5000024","model":"NGSMFDR","name":"NeoGuide S-Mini Fixture Driver_Ratchet Type","spec":"Ratchet"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOIGNF5000026","model":"NGSMFDCA","name":"NeoGuide S-Mini Fixture Driver","spec":"Contra Angle"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOIPID3500004","model":"DPIS35C","name":"IS Direction Pin","spec":"Ø3.5"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOIPID3600001","model":"DP36","name":"Direction Pin","spec":"Ø3.6"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOIPID4500001","model":"DP45","name":"Direction Pin","spec":"Ø4.5"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOIPID4500005","model":"DPIS45C","name":"IS Direction Pin","spec":"Ø4.5"},{"cat":"Other","cls":"Instrument","no":"1ENCPTOIPPP1200004","model":"MPP10","name":"S-Mini Parallel Pin","spec":"Ø1.2/10.0mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOIPPP2200010","model":"PP07F","name":"Parallel Pin","spec":"Ø2.2/7.0mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOIPPP2200011","model":"PP08F","name":"Parallel Pin","spec":"Ø2.2/8.5mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOIPPP2200012","model":"PP10F","name":"Parallel Pin","spec":"Ø2.2/10.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISCS5000002","model":"CDS020","name":"Crestal Stopper","spec":"2.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISCS5000003","model":"CDS040","name":"Crestal Stopper","spec":"4.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISCS5000005","model":"CDS060","name":"Crestal Stopper","spec":"6.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISCS5000006","model":"CDS110","name":"Crestal Stopper","spec":"11.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISCS5000007","model":"CDS030","name":"Crestal Stopper","spec":"3.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISCS5000008","model":"CDS070","name":"Crestal Stopper","spec":"7.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISCS5000009","model":"CDS080","name":"Crestal Stopper","spec":"8.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISCS5000010","model":"CDS090","name":"Crestal Stopper","spec":"9.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISCS5000011","model":"CDS100","name":"Crestal Stopper","spec":"10.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISCS5000012","model":"CDS120","name":"Crestal Stopper","spec":"12.0mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOISDH4800006","model":"DSHCS","name":"Drill Stopper Holder","spec":"S-Narrow"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOISDH5000002","model":"DSHC","name":"Drill Stopper Holder","spec":"."},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOISDS3700001","model":"DS085CS","name":"Drill Stopper","spec":"8.5mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOISDS3700002","model":"DS100CS","name":"Drill Stopper","spec":"10.0mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOISDS3700003","model":"DS115CS","name":"Drill Stopper","spec":"11.5mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOISDS5600031","model":"DS060C","name":"Drill Stopper","spec":"6mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOISDS5600033","model":"DS070C","name":"Drill Stopper","spec":"7.3mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOISDS5600034","model":"DS085C","name":"Drill Stopper","spec":"8.5mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOISDS5600035","model":"DS100C","name":"Drill Stopper","spec":"10mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOISDS5600036","model":"DS115C","name":"Drill Stopper","spec":"11.5mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOISDS5600037","model":"DS130C","name":"Drill Stopper","spec":"13mm"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTOISDS7600011","model":"DSL060","name":"S-Wide Drill Stopper","spec":"6.0mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOISDS7600025","model":"DS100F","name":"Drill Stopper","spec":"10mm"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOISDS7600026","model":"DS115F","name":"Drill Stopper","spec":"11.5mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISLS5000001","model":"LTS010","name":"Lateral Stopper","spec":"1.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISLS5000002","model":"LTS020","name":"Lateral Stopper","spec":"2.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISLS5000003","model":"LTS030","name":"Lateral Stopper","spec":"3.0mm"},{"cat":"Other","cls":"Sinus All Kit","no":"1ENCPTOISLS5000004","model":"LTS040","name":"Lateral Stopper","spec":"4.0mm"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTOISSF0300001","model":"SFDS030","name":"Screw Fixation Drill Stopper","spec":"3mm"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTOISSF0500002","model":"SFDS050","name":"Screw Fixation Drill Stopper","spec":"5mm"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTOISSF0700003","model":"SFDS070","name":"Screw Fixation Drill Stopper","spec":"7mm"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOISSS5000002","model":"SKS02","name":"SCA Stopper","spec":"2.0mm"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOISSS5000003","model":"SKS03","name":"SCA Stopper","spec":"3.0mm"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOISSS5000004","model":"SKS04","name":"SCA Stopper","spec":"4.0mm"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOISSS5000005","model":"SKS05","name":"SCA Stopper","spec":"5.0mm"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOISSS5000006","model":"SKS06","name":"SCA Stopper","spec":"6.0mm"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOISSS5000007","model":"SKS07","name":"SCA Stopper","spec":"7.0mm"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOISSS5000008","model":"SKS08","name":"SCA Stopper","spec":"8.0mm"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOISSS5000009","model":"SKS09","name":"SCA Stopper","spec":"9.0mm"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOISSS5000010","model":"SKS10","name":"SCA Stopper","spec":"10.0mm"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOISSS5000011","model":"SKS11","name":"SCA Stopper","spec":"11.0mm"},{"cat":"Other","cls":"Instrument","no":"1ENCPTOSBIE3000001","model":"ISEHAP","name":"IS Encoded Healing Abutment Pin","spec":"D:Ø3.0 L:4.9mm"},{"cat":"Other","cls":"SCA Kit","no":"1ENCPTOSISI2000001","model":"SSD20","name":"SCA Initial Drill","spec":"Ø2.0"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTOTABE3000001","model":"BEXP30","name":"Bone Expander","spec":"Ø3.0 L:10mm"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTOTABE3500002","model":"BEXP35","name":"Bone Expander","spec":"Ø3.5 L:10mm"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTOTABE4000003","model":"BEXP40","name":"Bone Expander","spec":"Ø4.0 L:10mm"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTOTABE4500004","model":"BEXP45","name":"Bone Expander","spec":"Ø4.5 L:10mm"},{"cat":"Other","cls":"Ridge Wider Kit","no":"1ENCPTOTABE5000005","model":"BEXP50","name":"Bone Expander","spec":"Ø5.0 L:10mm"},{"cat":"Other","cls":"Varo Guide Kit","no":"1ENCPTOTACN4000009","model":"NGCT40S09","name":"NeoGuide Cortical Tap","spec":"Ø4.0, Regular"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOTACT3200011","model":"CT32S09","name":"Cortical Tap","spec":"∅3.2, S-Narrow"},{"cat":"Other","cls":"Neo Master Kit","no":"1ENCPTOTACT3200011","model":"CT32S09","name":"Cortical Tap","spec":"∅3.2, S-Narrow"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTOTACT3800001","model":"CT38S08","name":"Cortical Tap","spec":"Fixture Ø3.8"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTOTACT3800002","model":"CT38S09","name":"Cortical Tap","spec":"Fixture Ø3.8"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTOTACT4300003","model":"CT43S08","name":"Cortical Tap","spec":"Fixture Ø4.3"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTOTACT4300004","model":"CT43S09","name":"Cortical Tap","spec":"Fixture Ø4.3"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTOTACT4500005","model":"CT45S08","name":"Cortical Tap","spec":"Fixture Ø4.5"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTOTACT4500006","model":"CT45S09","name":"Cortical Tap","spec":"Fixture Ø4.5"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTOTACT5000007","model":"CT50S08","name":"Cortical Tap","spec":"Fixture Ø5.0"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTOTACT5000008","model":"CT50S09","name":"Cortical Tap","spec":"Fixture Ø5.0"},{"cat":"Other","cls":"StopDrill Kit","no":"1ENCPTOTACT5500010","model":"CT55S09","name":"Cortical Tap","spec":"Fixture Ø5.5"},{"cat":"Other","cls":"S-mini Kit","no":"1ENCPTOTAMT2000001","model":"MTD25","name":"S-Mini Surgical Tap","spec":"Ø2.5"},{"cat":"Other","cls":"S-mini Kit","no":"1ENCPTOTAMT3000002","model":"MTD30","name":"S-Mini Surgical Tap","spec":"Ø3.0"},{"cat":"Other","cls":"S-mini Kit","no":"1ENCPTOTAMT3500003","model":"MTD35","name":"S-Mini Surgical Tap","spec":"Ø3.5"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOTANC3500011","model":"NGCT35S09","name":"NeoGuide Cortical Tap","spec":"Ø3.5, Narrow"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOTANC4500012","model":"NGCT45S09","name":"NeoGuide Cortical Tap","spec":"Ø4.5, Regular"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOTANC5000007","model":"NGCT50S09","name":"NeoGuide Cortical Tap","spec":"Ø5.0, Wide"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOTANF2500002","model":"NGFT25L10M","name":"NeoGuide Full Tap","spec":"Fixture, Ø2.5"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOTANF3000002","model":"NGFT30L10M","name":"NeoGuide Full Tap","spec":"Fixture, Ø3.0"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOTANF3200002","model":"NGFT32L09M","name":"NeoGuide Full Tap","spec":"Fixture, Ø3.2"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOTANF3500006","model":"NGFT35L09M","name":"NeoGuide Full Tap","spec":"Fixture, Ø3.5"},{"cat":"Other","cls":"EZ Stop Drill Kit","no":"1ENCPTOTANF3500008","model":"NGFT35L10M","name":"NeoGuide Full Tap","spec":"Fixture, Ø3.5"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOTAPR3500016","model":"PTAP35FS","name":"Profile Tap","spec":"Dia 3.5"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOTAPR4000017","model":"PTAP40FS","name":"Profile Tap","spec":"Dia 4.0"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOTAPR4500018","model":"PTAP45FS","name":"Profile Tap","spec":"Dia 4.5"},{"cat":"Other","cls":"IS Full Kit","no":"1ENCPTOTAPR5000009","model":"PTAP50FS","name":"Profile Tap","spec":"Dia 5.0"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTOTASM5500001","model":"MP55","name":"Multi Profile","spec":"EB/IS Ø5.5"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTOTASM6000002","model":"MP60","name":"Multi Profile","spec":"EB/IS Ø6.0"},{"cat":"Other","cls":"Neo Surgical Kit","no":"1ENCPTOTAST3800002","model":"ISTD38S","name":"Surgical Tap Drill","spec":"Ø3.8 Narrow IS"},{"cat":"Other","cls":"Neo Surgical Kit","no":"1ENCPTOTAST4300004","model":"ISTD43S","name":"Surgical Tap Drill","spec":"Ø4.3 Regular IS"},{"cat":"Other","cls":"Neo Surgical Kit","no":"1ENCPTOTAST4500005","model":"ISTD45S","name":"Surgical Tap Drill","spec":"Ø4.5 Regular"},{"cat":"Other","cls":"Neo Surgical Kit","no":"1ENCPTOTAST5000006","model":"ISTD50S","name":"Surgical Tap Drill","spec":"Ø5.0 Wide"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTOTATD5500014","model":"TD55","name":"Tap Drill","spec":"Ø5.5"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTOTATD6000015","model":"TD60","name":"Tap Drill","spec":"Ø6.0"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1ENCPTOTATD7000016","model":"TD70","name":"Tap Drill","spec":"Ø7.0"},{"cat":"Other","cls":"","no":"1ENPRBMBOSKCD00003","model":"ATELOPLUG(S) (EXP)","name":"(발치와 충전재) AteloPlug(S)","spec":"(수출용) Size: S / 8*25mm"},{"cat":"Other","cls":"Membrane","no":"1ENPRBMMEOCLS01020","model":"LYSOGIDE S 1020 (EXP)","name":"Lysogide: Size 1020","spec":"Sheet / 10 x 20mm / Collagen (Type-I, Porcine)"},{"cat":"Other","cls":"Membrane","no":"1ENPRBMMESKTS01520","model":"T GEN S 1520 (EXP)","name":"T-Gen: SIze 1520","spec":"Sheet / 15 x 20mm / Collagen (Type-I, Porcine)"},{"cat":"Other","cls":"Membrane","no":"1ENPRBMMESKTS02030","model":"T GEN S 2030 (EXP)","name":"T-Gen: SIze 2030","spec":"Sheet / 20 x 30mm /Collagen (Type-I, Porcine)"},{"cat":"Other","cls":"Membrane","no":"1ENPRBMMESKTS03040","model":"T GEN S 3040 (EXP)","name":"T-Gen: SIze 3040","spec":"Sheet / 30 x 40mm /Collagen (Type-I, Porcine)"},{"cat":"Other","cls":"Pano + CT + Ceph","no":"1ENPRDECTGNCT00001","model":"(EXP)PAPAYA 3D Plus","name":"(EXP)Genoray PAPAYA 3D Plus","spec":"16*8 / 4 in 1 (Ceph + Model Scan)"},{"cat":"Other","cls":"Pano + CT","no":"1ENPRDECTGNCT00002","model":"(EXP)PAPAYA 3D","name":"(EXP)Genoray PAPAYA 3D","spec":"16*8 / 3 in 1 (Model Scan)"},{"cat":"Other","cls":"Pano + CT + Ceph","no":"1ENPRDECTGNCT00003","model":"(EXP)PAPAYA 3D Premium Plus SC","name":"(EXP)Genoray PAPAYA 3D Premium Plus SC","spec":"23*14 / 4 in 1 (Scan Ceph)"},{"cat":"Other","cls":"Pano + CT + Ceph","no":"1ENPRDECTGNCT00004","model":"(EXP)PAPAYA 3D Premium Plus OC","name":"(EXP)Genoray PAPAYA 3D Premium Plus OC","spec":"23*14 / 4 in 1 (One Shot Ceph)"},{"cat":"Other","cls":"Pano + CT","no":"1ENPRDECTGNPA00001","model":"(EXP)PAPAYA Plus","name":"(EXP)Genoray PAPAYA Plus","spec":"Pano + Ceph"},{"cat":"Other","cls":"X-Ray","no":"1ENPRDECTGNPX00001","model":"(EXP)PORT-X4e","name":"(EXP)Portable X-ray PORT-X4e","spec":"Port-X4e Long Cone"},{"cat":"Other","cls":"X-Ray","no":"1ENPRDECTGNPX00002","model":"(EXP)PORT-X4","name":"(EXP)Portable X-ray PORT-X4","spec":"Port-X4 Long Cone"},{"cat":"Other","cls":"Other","no":"1ENPRDECTGNSW00001","model":"(EXP)Audax Tina","name":"(EXP)Audax Ceph S/W Tina","spec":"Auto Tracing Tina"},{"cat":"Other","cls":"Other","no":"1ENPRDECTGNSW00002","model":"(EXP)FOV Stitching","name":"(EXP)FOV Stitching 16*14","spec":"FOV Stitching 16*14"},{"cat":"Other","cls":"Other","no":"1ENPRDECTGNSW00003","model":"(EXP)FOV Stitching L","name":"(EXP)FOV Stitching 23*24","spec":"FOV Stitching 23*24"},{"cat":"Other","cls":"Other","no":"1ENPRDECTGNSW00004","model":"(EXP)AUDAX V6","name":"(EXP)Audax Ceph S/W V6","spec":"Audax V6"},{"cat":"Other","cls":"Other","no":"1ENPRDECTGNSW00005","model":"(EXP)MODEL SCAN","name":"(EXP)Model Scan Assy","spec":"Model Scan Assy"},{"cat":"Other","cls":"Other","no":"1ENPRDECTGNSW00006","model":"(EXP)INVIVO SW","name":"(EXP)INVIVO S/W","spec":"INVIVO S/W"},{"cat":"Other","cls":"X-Ray","no":"1ENPRDECTGNSX00001","model":"(EXP)DVAS-CF","name":"(EXP)Standard X-ray DVAS (Foldable Chair)","spec":"DVAS Foldable Chair Type"},{"cat":"Other","cls":"X-Ray","no":"1ENPRDECTGNSX00002","model":"(EXP)DVAS-W","name":"(EXP)Standard X-ray DVAS (Wall Type)","spec":"DVAS Wall Type"},{"cat":"Other","cls":"X-Ray","no":"1ENPRDECTHDET00101","model":"STAR-X (EXP)","name":"(X-ray: Stand Type) HDX Star-X","spec":"(수출용) Standard Stand X-ray"},{"cat":"Other","cls":"Other","no":"1ENPRDEDRCRCX00001","model":"CRUXCAN","name":"CRUXCAN (Image Plate System)","spec":"."},{"cat":"Other","cls":"Other","no":"1ENPRDEDRCRCX00003","model":"CRUXPLATE02","name":"CRUXCAN Plate Size 02","spec":"31*41"},{"cat":"Fixture","cls":"KERATOR","no":"1ENPRDEHYCUNA00001","model":"NEOACTIVE","name":"NEOActive","spec":"."},{"cat":"Abutment","cls":"PEEK Healing abutment","no":"1ENPRDEIENXIM00103","model":"NEW IMPLA NX CORD (EXP)","name":"Cord Ass'y Only (Optic)","spec":"(수출용) New Impla NX  / Optic"},{"cat":"Fixture","cls":"KERATOR","no":"1ENPRDEIENXIN00103","model":"NEW IMPLA NX SET (220V) (EXP)","name":"New Impla NX LED (220V) Engine SET","spec":"(수출용) 220V / 핸드피스 포함"},{"cat":"Abutment","cls":"PEEK Healing abutment","no":"1ENPRDEIENXIT00101","model":"IMPLA NX TUBE (EXP)","name":"Implant Engine용 Irrigation Tube","spec":"(수출용) New Impla NX 호환"},{"cat":"Fixture","cls":"KERATOR","no":"1ENPRDEIESSTR00206","model":"SIP10 LN SET (220V) (EXP)","name":"Traus SIP10 CRB46LN (220V) Set","spec":"(수출용) SIP 10 (220V) + H.P. (CRB46LN)"},{"cat":"Other","cls":"","no":"1ENPRDEISGNOS00001","model":"(EXP)GIX-1 S1","name":"(EXP)Genoray GIX-1 Size 1","spec":"Size 1"},{"cat":"Other","cls":"","no":"1ENPRDEISGNOS00002","model":"(EXP)GIX-1 S2","name":"(EXP)Genoray GIX-1 Size 2","spec":"Size 2"},{"cat":"Fixture","cls":"KERATOR","no":"1ENPRDESMDMAC00001","model":"ANYCHECK (EXP)","name":"AnyCheck","spec":"."},{"cat":"Other","cls":"Nexcomp Flow","no":"1ENPRHEMOHMHM00007","model":"SINUS MODEL3 (EXP)","name":"(실습용 모델) Sinus Model 3 (NEO)","spec":"(수출용) 1Set 50ea"},{"cat":"Other","cls":"Nexcomp Flow","no":"1ENPRHEMOHMHM00008","model":"MANDIBLE MODEL3 (EXP)","name":"(실습용 모델) Mandible Model 3 (NEO)","spec":"(수출용) 1Set 50ea"},{"cat":"Other","cls":"","no":"1ENPRHEOGENGO00001","model":"GOWNXS(EXP)","name":"(수술복 상의)Gown XS","spec":"(수출용)XS"},{"cat":"Other","cls":"","no":"1ENPRHEOGENGO00002","model":"GOWNS(EXP)","name":"(수술복 상의)Gown S","spec":"(수출용)S"},{"cat":"Other","cls":"","no":"1ENPRHEOGENGO00003","model":"GOWNM(EXP)","name":"(수술복 상의)Gown M","spec":"(수출용)M"},{"cat":"Other","cls":"","no":"1ENPRHEOGENGO00004","model":"GOWNL(EXP)","name":"(수술복 상의)Gown L","spec":"(수출용)L"},{"cat":"Other","cls":"","no":"1ENPRHEOGENGO00005","model":"GOWNXL(EXP)","name":"(수술복 상의)Gown XL","spec":"(수출용)XL"},{"cat":"Other","cls":"","no":"1ENPRHEOGENGO00006","model":"GOWNXXL(EXP)","name":"(수술복 상의)Gown XXL","spec":"(수출용)XXL"},{"cat":"Other","cls":"Meta etchant","no":"1ENPRHEPIDMBS00200","model":"IBRUSH1 (EXP)","name":"iBrush 1 (ISOL829)","spec":"(수출용) Stainless Steel 소재 1회용 브러쉬, 수량: 10ea"},{"cat":"Other","cls":"Meta etchant","no":"1ENPRHEPIDMBS00201","model":"IBRUSH2 (EXP)","name":"iBrush 2 (LSOL29)","spec":"(수출용) Titanium 합금 소재 1회용 브러쉬, 수량: 10ea"},{"cat":"Other","cls":"Meta etchant","no":"1ENPRHEPIDMBS00301","model":"TBRUSH (EXP)","name":"T-Brush","spec":"(수출용) Titanium 소재 멸균 가능 다회용 브러쉬, 수량: 2ea"},{"cat":"Other","cls":"Meta etchant","no":"1ENPRHEPIDMBS00401","model":"ROUND BRUSH (R) (EXP)","name":"Round Brush (Regular Size) (RB440)","spec":"Stainless Steel, Disposable, 1ea"},{"cat":"Other","cls":"","no":"1ENPRHESUSMRL05018","model":"REXLON 5018 (EXP)","name":"(Nonabsorbable suture) Rexlon","spec":"(EXP) Blue Nylon / UPS: 5-0 / Needle Size: 18mm / 24 packs"},{"cat":"Other","cls":"","no":"1ENPRHESUSMRS05018","model":"REXSIL 5018 (EXP)","name":"(비흡수성 봉합사) Rexsil","spec":"(수출용) Black Silk / UPS: 5-0 / Needle Size: 18mm / 24 packs"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00082","model":"SQ351 (EXP)","name":"Kerator: SQ351","spec":"(수출용) Kerator / IS 3.5 / Straight / Cuff: 1.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00083","model":"SQ352 (EXP)","name":"Kerator: SQ352","spec":"(수출용) Kerator / IS 3.5 / Straight / Cuff: 2.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00084","model":"SQ353 (EXP)","name":"Kerator: SQ353","spec":"(수출용) Kerator / IS 3.5 / Straight / Cuff: 3.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00085","model":"SQ354 (EXP)","name":"Kerator: SQ354","spec":"(수출용) Kerator / IS 3.5 / Straight / Cuff: 4.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00086","model":"SQ355 (EXP)","name":"Kerator: SQ355","spec":"(수출용) Kerator / IS 3.5 / Straight / Cuff: 5.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00087","model":"SQ356 (EXP)","name":"Kerator: SQ356","spec":"(수출용) Kerator / IS 3.5 / Straight / Cuff: 6.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00088","model":"AS401 (EXP)","name":"Kerator: AS401","spec":"(수출용) Kerator / IS 4.0 / Straight / Cuff: 1.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00089","model":"AS402 (EXP)","name":"Kerator: AS402","spec":"(수출용) Kerator / IS 4.0 / Straight / Cuff: 2.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00090","model":"AS403 (EXP)","name":"Kerator: AS403","spec":"(수출용) Kerator / IS 4.0 / Straight / Cuff: 3.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00091","model":"AS404 (EXP)","name":"Kerator: AS404","spec":"(수출용) Kerator / IS 4.0 / Straight / Cuff: 4.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00092","model":"AS405 (EXP)","name":"Kerator: AS405","spec":"(수출용) Kerator / IS 4.0 / Straight / Cuff: 5.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00093","model":"AS406 (EXP)","name":"Kerator: AS406","spec":"(수출용) Kerator / IS 4.0 / Straight / Cuff: 6.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00112","model":"T401 (EXP)","name":"Kerator: T401","spec":"(수출용) Kerator / IT 4.0 / Straight / Cuff: 1.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00113","model":"T402 (EXP)","name":"Kerator: T402","spec":"(수출용) Kerator / IT 4.0 / Straight / Cuff: 2.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00114","model":"T403 (EXP)","name":"Kerator: T403","spec":"(수출용) Kerator / IT 4.0 / Straight / Cuff: 3.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00115","model":"T404 (EXP)","name":"Kerator: T404","spec":"(수출용) Kerator / IT 4.0 / Straight / Cuff: 4.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00116","model":"T405 (EXP)","name":"Kerator: T405","spec":"(수출용) Kerator / IT 4.0 / Straight / Cuff: 5.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00117","model":"T406 (EXP)","name":"Kerator: T406","spec":"(수출용) Kerator / IT 4.0 / Straight / Cuff: 6.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00118","model":"SQ35AN1.5 (EXP)","name":"Kerator: SQ35AN1.5","spec":"(수출용) Kerator / IS 3.5 / Angled (15°) / Cuff: 1.5"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00119","model":"SQ35AN3.0 (EXP)","name":"Kerator: SQ35AN3.0","spec":"(수출용) Kerator / IS 3.5 / Angled (15°) / Cuff: 3.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00120","model":"AS4AN1.5 (EXP)","name":"Kerator: AS4AN1.5","spec":"(수출용) Kerator / IS 4.0 / Angled (15°) / Cuff: 1.5"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00121","model":"AS4AN3.0 (EXP)","name":"Kerator: AS4AN3.0","spec":"(수출용) Kerator / IS 4.0 / Angled (15°) / Cuff: 3.0"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00130","model":"KMT002 (EXP)","name":"Kerator: KMT002","spec":"(수출용) Kerator Tool: Male Cap 체결용"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00131","model":"KMD719 (EXP)","name":"Kerator: KMD719","spec":"(수출용) Kerator Tip: Torque Wrench 체결용"},{"cat":"Other","cls":"KERATOR","no":"1ENPRIPBDDKKE00134","model":"CDPHSET (EXP)","name":"Kerator: CDPHSET","spec":"(수출용) Kerator Male Processing Set: 136, 138, 141, 142, 144 형"},{"cat":"Other","cls":"Xenograft","no":"1ENPRNMBOCYTV02501","model":"TITAN X V 025M (EXP)","name":"Titan-X: Vial / Volume S / Particle M","spec":"Vial / 0.45cc / Particle Size: 0.40~1.00mm / 100% Cancellous"},{"cat":"Other","cls":"Xenograft","no":"1ENPRNMBOCYTV05001","model":"TITAN X V 050M (EXP)","name":"Titan-X: Vial / Volume M / Particle M","spec":"Vial / 0.80cc / Particle Size: 0.40~1.00mm / 100% Cancellous"},{"cat":"Other","cls":"Xenograft","no":"1ENPRNMBOCYTV10001","model":"TITAN X V 100M (EXP)","name":"Titan-X: Vial / Volume L / Particle M","spec":"Vial / 1.50cc / Particle Size: 0.40~1.00mm / 100% Cancellous"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE4500006","model":"ISAH414","name":"IS Cemented Abutment","spec":"Ø4.5*1.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE4500007","model":"ISAH424","name":"IS Cemented Abutment","spec":"Ø4.5*2.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE4500008","model":"ISAH434","name":"IS Cemented Abutment","spec":"Ø4.5*3.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE4500009","model":"ISAH444","name":"IS Cemented Abutment","spec":"Ø4.5*4.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE4500108","model":"ISAS434","name":"IS Cemented Abutment","spec":"Ø4.5*3.0mm, L:4.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE4500109","model":"ISAS444","name":"IS Cemented Abutment","spec":"Ø4.5*4.0mm, L:4.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE5200031","model":"ISAH514","name":"IS Cemented Abutment","spec":"Ø5.2*1.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE5200032","model":"ISAH524","name":"IS Cemented Abutment","spec":"Ø5.2*2.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE5200033","model":"ISAH534","name":"IS Cemented Abutment","spec":"Ø5.2*3.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE5200034","model":"ISAH544","name":"IS Cemented Abutment","spec":"Ø5.2*4.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE5200134","model":"ISAS544","name":"IS Cemented Abutment","spec":"Ø5.2*4.0mm, L:4.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE5700056","model":"ISAH614","name":"IS Cemented Abutment","spec":"Ø5.7*1.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE5700057","model":"ISAH624","name":"IS Cemented Abutment","spec":"Ø5.7*2.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE5700058","model":"ISAH634","name":"IS Cemented Abutment","spec":"Ø5.7*3.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE5700059","model":"ISAH644","name":"IS Cemented Abutment","spec":"Ø5.7*4.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE5700156","model":"ISAS614","name":"IS Cemented Abutment","spec":"Ø5.7*1.0mm, L:4.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE5700159","model":"ISAS644","name":"IS Cemented Abutment","spec":"Ø5.7*4.0mm, L:4.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE6500081","model":"ISAH714","name":"IS Cemented Abutment","spec":"Ø6.5*1.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE6500082","model":"ISAH724","name":"IS Cemented Abutment","spec":"Ø6.5*2.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE6500083","model":"ISAH734","name":"IS Cemented Abutment","spec":"Ø6.5*3.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE6500084","model":"ISAH744","name":"IS Cemented Abutment","spec":"Ø6.5*4.0mm, L:4.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE6500094","model":"ISAH747","name":"IS Cemented Abutment","spec":"Ø6.5*4.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE6500095","model":"ISAH757","name":"IS Cemented Abutment","spec":"Ø6.5*5.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE6500181","model":"ISAS714","name":"IS Cemented Abutment","spec":"Ø6.5*1.0mm, L:4.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE6500184","model":"ISAS744","name":"IS Cemented Abutment","spec":"Ø6.5*4.0mm, L:4.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE6500191","model":"ISAS717","name":"IS Cemented Abutment","spec":"Ø6.5*1.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE6500194","model":"ISAS747","name":"IS Cemented Abutment","spec":"Ø6.5*4.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISCE6500195","model":"ISAS757","name":"IS Cemented Abutment","spec":"Ø6.5*5.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISMU4800003","model":"ISMUA4830","name":"IS Multi Unit Abutment","spec":"Ø4.8*3.0mm"},{"cat":"Abutment","cls":"Straight Abutment","no":"1KRCPABISMU4800004","model":"ISMUA4840","name":"IS Multi Unit Abutment","spec":"Ø4.8*4.0mm"},{"cat":"Other","cls":"","no":"1KRCPFIISSA3500040","model":"IS33508A","name":"IS-III active Fixture","spec":"Ø3.5*8.5mm"},{"cat":"Other","cls":"","no":"1KRCPFIISSA4500051","model":"IS34507A","name":"IS-III active Fixture","spec":"Ø4.5*7.3mm"},{"cat":"Other","cls":"","no":"1KRCPFIISSA4500052","model":"IS34508A","name":"IS-III active Fixture","spec":"Ø4.5*8.5mm"},{"cat":"Other","cls":"","no":"1KRCPFIISSA4500080","model":"IS34510D","name":"IS-III Fixture Dummy","spec":"Ø4.5*10.0mm"},{"cat":"Other","cls":"","no":"1KRCPFIISSA5000057","model":"IS35007A","name":"IS-III active Fixture","spec":"Ø5.0*7.3mm"},{"cat":"Other","cls":"","no":"1KRCPFIISSA5000087","model":"IS35010D","name":"IS-III Fixture Dummy","spec":"Ø5.0*10.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC3500013","model":"ISPCIB3503","name":"IS Pick Cap Impression Body","spec":"Ø3.5*3mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC3500015","model":"ISPCIB3505","name":"IS Pick Cap Impression Body","spec":"Ø3.5*5mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC3500017","model":"ISPCIB3508","name":"IS Pick Cap Impression Body","spec":"Ø3.5*8mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC3500019","model":"ISPCIB3510","name":"IS Pick Cap Impression Body","spec":"Ø3.5*10mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC4000021","model":"ISPCIB4003","name":"IS Pick Cap Impression Body","spec":"Ø4.0*3mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC4000027","model":"ISPCIB4010","name":"IS Pick Cap Impression Body","spec":"Ø4.0*10mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC4500029","model":"ISPCIB403","name":"IS Pick Cap Impression Body","spec":"Ø4.5*3mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC4500031","model":"ISPCIB405","name":"IS Pick Cap Impression Body","spec":"Ø4.5*5mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC4500033","model":"ISPCIB408","name":"IS Pick Cap Impression Body","spec":"Ø4.5*8mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC4500035","model":"ISPCIB410","name":"IS Pick Cap Impression Body","spec":"Ø4.5*10mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC5200037","model":"ISPCIB502","name":"IS Pick Cap Impression Body","spec":"Ø5.2*2mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC5200041","model":"ISPCIB504","name":"IS Pick Cap Impression Body","spec":"Ø5.2*4mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC5200045","model":"ISPCIB506","name":"IS Pick Cap Impression Body","spec":"Ø5.2*6mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC5700047","model":"ISPCIB602","name":"IS Pick Cap Impression Body","spec":"Ø5.7*2mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC5700049","model":"ISPCIB603","name":"IS Pick Cap Impression Body","spec":"Ø5.7*3mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC5700051","model":"ISPCIB604","name":"IS Pick Cap Impression Body","spec":"Ø5.7*4mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC5700055","model":"ISPCIB606","name":"IS Pick Cap Impression Body","spec":"Ø5.7*6.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC6500057","model":"ISPCIB702","name":"IS Pick Cap Impression Body","spec":"Ø6.5*2mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC6500059","model":"ISPCIB703","name":"IS Pick Cap Impression Body","spec":"Ø6.5*3mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC6500061","model":"ISPCIB704","name":"IS Pick Cap Impression Body","spec":"Ø6.5*4mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC6500063","model":"ISPCIB705","name":"IS Pick Cap Impression Body","spec":"Ø6.5*5mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPICISPC6500065","model":"ISPCIB706","name":"IS Pick Cap Impression Body","spec":"Ø6.5*6mm"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1KRCPICISPU4000037","model":"ISIPSL400","name":"IS Pick-up Impression Coping","spec":"Ø4.0/Long"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1KRCPICISPU4800038","model":"ISIPSL411","name":"IS Pick-up Impression Coping","spec":"Ø4.8/Long"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1KRCPICISPU5500040","model":"ISIPSL511","name":"IS Pick-up Impression Coping","spec":"Ø5.5/Long"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1KRCPICISPU6000041","model":"ISIPSL611","name":"IS Pick-up Impression Coping","spec":"Ø6.0/Long"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1KRCPICITPU5500001","model":"ITIPN511","name":"IT Pick-up Impression coping","spec":"Ø5.5, Non-Octa"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1KRCPICITPU5500003","model":"ITIPNL511","name":"IT Pick-up Impression coping","spec":"Ø5.5,Non-Octa/Long"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1KRCPICITPU7200002","model":"ITIPN711","name":"IT WN Pick-up Impression Coping","spec":"Ø7.2, Non-octa"},{"cat":"Other","cls":"GBR Kit","no":"1KRCPKIGBGK0100001","model":"GBRKIT","name":"GBRKIT (Ver.01)","spec":"."},{"cat":"Other","cls":"GBR Kit","no":"1KRCPKIGBGK0200002","model":"GBRKITTRAY1","name":"Neo GBRKIT TRAY","spec":"상판, Ver.02"},{"cat":"Other","cls":"GBR Kit","no":"1KRCPKIGBGK0300003","model":"GBRKITTRAY2","name":"Neo GBRKIT BODY","spec":"중판, Ver.02"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPKIPRNP0200002","model":"PCIKITTRAY","name":"Neo Pick Cap Impression Kit Tray","spec":"Ver.01"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1KRCPKIPRNP0300003","model":"PCIKITCOVER","name":"Neo Pick Cap Impression Kit Cover","spec":"Upper Plate, Ver.01"},{"cat":"Other","cls":"SLA Kit","no":"1KRCPTODLCR5000007","model":"SLC515L","name":"C-Reamer","spec":"Ø5.5×1.5mm/Long"},{"cat":"Other","cls":"SLA Kit","no":"1KRCPTODLCR5000008","model":"SLC530L","name":"C-Reamer","spec":"Ø5.5×3.0mm/Long"},{"cat":"Other","cls":"SLA Kit","no":"1KRCPTODLCR6000009","model":"SLC615L","name":"C-Reamer","spec":"Ø6.5×1.5mm/Long"},{"cat":"Other","cls":"SLA Kit","no":"1KRCPTODLCR6000010","model":"SLC630L","name":"C-Reamer","spec":"Ø6.5×3.0mm/Long"},{"cat":"Other","cls":"SLA Kit","no":"1KRCPTODLCU5000001","model":"SCG510L","name":"C-Guide Reamer","spec":"Ø5.5×1.0mm/Long"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1KRCPTODLLA1500001","model":"SGLAD15L","name":"Surgical Guide Lateral Anchor Drill","spec":"Dia 1.5 / L 20mm / Long"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1KRCPTODLLA1500002","model":"SGLAD15S","name":"Surgical Guide Lateral Anchor Drill","spec":"Dia 1.5 / L 15.5mm / Short"},{"cat":"Other","cls":"SLA Kit","no":"1KRCPTODLLS4500015","model":"SLS420L","name":"LS-Reamer","spec":"Ø4.5×2.0mm/Long"},{"cat":"Other","cls":"SLA Kit","no":"1KRCPTODLLS4500017","model":"SLS435L","name":"LS-Reamer","spec":"Ø4.5×3.5mm/Long"},{"cat":"Other","cls":"SLA Kit","no":"1KRCPTODLLS5500019","model":"SLS520L","name":"LS-Reamer","spec":"Ø5.5×2.0mm/Long"},{"cat":"Other","cls":"SLA Kit","no":"1KRCPTODLLS5500021","model":"SLS535L","name":"LS-Reamer","spec":"Ø5.5×3.5mm/Long"},{"cat":"Other","cls":"IS Full Kit","no":"1KRCPTODLTS2200027","model":"TSD22F","name":"Twist Surgical Drill","spec":"Ø2.2"},{"cat":"Other","cls":"IS Full Kit","no":"1KRCPTODLTS3900040","model":"TSD39F","name":"Twist Surgical Drill","spec":"Ø3.9"},{"cat":"Other","cls":"IS Full Kit","no":"1KRCPTODLTS4400046","model":"TSD44F","name":"Twist Surgical Drill","spec":"Ø4.4"},{"cat":"Other","cls":"IS Full Kit","no":"1KRCPTODLTS4900052","model":"TSD49F","name":"Twist Surgical Drill","spec":"Ø4.9"},{"cat":"Other","cls":"SR Kit","no":"1KRCPTODRPD5000001","model":"PGHD25S","name":"PG Hand Driver","spec":"2.5Hex"},{"cat":"Other","cls":"Instrument","no":"1KRCPTODRQT1200001","model":"QTH1205","name":"QuickTight Hex Type","spec":"1.2Hex, L:5.0mm"},{"cat":"Other","cls":"Instrument","no":"1KRCPTODRQT1200005","model":"QTH12505","name":"QuickTight Hex Type","spec":"1.25Hex, L:5.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1KRCPTOIGSL3000002","model":"SGLAS30S","name":"Surgical Guide Lateral Anchor Sleeve","spec":"Dia 3.0, L: 6.5mm, Short"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1KRCPTOIGSP1800002","model":"SGLAP18S","name":"Surgical Guide Lateral Anchor Pin","spec":"Dia 1.85 / L 15.5mm / Short"},{"cat":"Other","cls":"IS Full Kit","no":"1KRCPTOIPID4500006","model":"DPIS50","name":"Internal Submerged Direction Pin","spec":"Dia 4.5"},{"cat":"Other","cls":"IS Full Kit","no":"1KRCPTOIPID5500007","model":"DPIS60","name":"Internal Submerged Direction Pin","spec":"Dia 5.5"},{"cat":"Other","cls":"IS Full Kit","no":"1KRCPTOISDS7600027","model":"DS130F","name":"Drill Stopper","spec":"13mm"},{"cat":"Other","cls":"Scan Body","no":"1KRCPTOSBSB5000006","model":"ISSBH50NB","name":"IS Scan Body","spec":"Ø5.0"},{"cat":"Other","cls":"","no":"1KRPRBMBMSKCO00001","model":"COLLAOSSPLUG01(EXP)","name":"CollaOss Plug 0.1g(EXP)","spec":"."},{"cat":"Other","cls":"Allograft","no":"1KRPRBMBOCERE00001","model":"CBP03","name":"REGENOSS 0.3CC","spec":"."},{"cat":"Other","cls":"Allograft","no":"1KRPRBMBOCERE00002","model":"CBP06","name":"REGENOSS 0.6CC","spec":"."},{"cat":"Other","cls":"Allograft","no":"1KRPRBMBOCERE00003","model":"CBP1","name":"REGENOSS 1CC","spec":"."},{"cat":"Other","cls":"Synthetic bone graft","no":"1KRPRBMBOMTDM00002","model":"MT1202","name":"bonemedik-dm 0.25g(0.5mm-1mm)","spec":"."},{"cat":"Other","cls":"Synthetic bone graft","no":"1KRPRBMBOMTDM00004","model":"MT1204","name":"bonemedik-dm 0.5g(0.5mm-1mm)","spec":"."},{"cat":"Other","cls":"Synthetic bone graft","no":"1KRPRBMBOMTDM00006","model":"MT1206","name":"bonemedik-dm 1.0g(0.5mm-1mm)","spec":"."},{"cat":"Other","cls":"Xenograft","no":"1KRPRBMBOSKNO00002","model":"BGB-4","name":"CollaOss Plug","spec":"0.1g"},{"cat":"Other","cls":"Membrane","no":"1KRPRBMMEOCLG00001","model":"OSLY1020","name":"Lysogide (Collagen Membrane) 10*20","spec":"."},{"cat":"Other","cls":"Membrane","no":"1KRPRBMMEOCLG00002","model":"OSLY1520","name":"Lysogide (Collagen Membrane) 15*20 (JWM-15)","spec":"."},{"cat":"Other","cls":"Membrane","no":"1KRPRBMMEOCLG00003","model":"OSLY2030","name":"Lysogide (Collagen Membrane) 20*30 (JWM-25)","spec":"."},{"cat":"Other","cls":"수복/접착","no":"1KRPRBMMEOCLG00004","model":"OSLY3040","name":"Lysogide (Collagen Membrane) 30*40 (JWM-30)","spec":"."},{"cat":"Other","cls":"Membrane","no":"1KRPRBMMESKTG00001","model":"TG-1(EXP)","name":"T-Gen1520(EXP)","spec":"15*20mm"},{"cat":"Other","cls":"Membrane","no":"1KRPRBMMESKTG00002","model":"TG-2(EXP)","name":"T-Gen2030(EXP)","spec":"20*30mm"},{"cat":"Other","cls":"Membrane","no":"1KRPRBMMESKTG00003","model":"TG-3(EXP)","name":"T-Gen3040(EXP)","spec":"30*40mm"},{"cat":"Other","cls":"Pano + CT + Ceph","no":"1KRPRDECTHDDR00007","model":"ECO-X-S (EXP)","name":"Dental X-ray System eco-x-s","spec":"."},{"cat":"Other","cls":"Pano + CT + Ceph","no":"1KRPRDECTHDDR00008","model":"ECO-X-S AI (EXP)","name":"Dental X-ray System eco-x-s ai","spec":"FOV 12*10"},{"cat":"Other","cls":"","no":"1KRPRDECTHDET00007","model":"X CAM","name":"X Cam (HDX)","spec":"."},{"cat":"Other","cls":"Pano + Ceph","no":"1KRPRDECTHDEX00002","model":"DENTIOIII-S (EXP)","name":"Dental X-ray System, DENTIOIII-S","spec":"Pano, Ceph, 2 sensors"},{"cat":"Other","cls":"Pano + CT + Ceph","no":"1KRPRDECTRARS00004","model":"RAYSCAN +130 SC","name":"RAYSCAN +130 SC (Pano+ CT+ Scan ceph)","spec":"."},{"cat":"Other","cls":"","no":"1KRPRDEICABQR00003","model":"QRAYPEN C","name":"Qraypen C","spec":"."},{"cat":"Other","cls":"","no":"1KRPRDEICABQR00008","model":"QRAY M","name":"Qray M","spec":"."},{"cat":"Abutment","cls":"PEEK Healing abutment","no":"1KRPRDEIENXET00001","model":"IMPLA_NXTUBE(Multi Use)","name":"IMPLA_NX TUBE(Multi Use)","spec":"."},{"cat":"Other","cls":"Handpiece for Implant Motor","no":"1KRPRDEIESSHP00002","model":"SS005","name":"NEOSURGE HANDPIECE","spec":"20:1"},{"cat":"Fixture","cls":"KERATOR","no":"1KRPRDEIESSNS00005","model":"X-CUBE (220V)","name":"X-CUBE (220V) + ACL(B) 45I","spec":"."},{"cat":"Fixture","cls":"KERATOR","no":"1KRPRDEIESSTR00002","model":"TRAUS (220V)","name":"TRAUS SIP10 LED SET (220V)","spec":"."},{"cat":"Other","cls":"","no":"1KRPRDEPXRERX00002","model":"REMEX-T100 (EXP)","name":"Portable X-ray Equipment (EXP)","spec":"."},{"cat":"Other","cls":"","no":"1KRPRHEDCDMDP00009","model":"DR.PLANT(EXP)","name":"Dr.Plant(해외용)","spec":"."},{"cat":"Other","cls":"Nexcomp","no":"1KRPRHEMOHMKD00001","model":"IS II King Dummy","name":"IS II King Dummy","spec":"x4"},{"cat":"Other","cls":"Nexcomp","no":"1KRPRHEMOHMKD00002","model":"IS III King Dummy","name":"IS III King Dummy","spec":"x4"},{"cat":"Other","cls":"Biner LC","no":"1KRPRHEMOISSM00001","model":"SKULL MODEL","name":"Neo Full Arch Skull Model","spec":"."},{"cat":"Other","cls":"","no":"1KRPRHENANANA00083","model":"SINUS BOOK (E)","name":"Minimally Invasive Sinus Surgery (English)","spec":"."},{"cat":"Other","cls":"Meta etchant","no":"1KRPRHEPIDMBS00006","model":"IBRUSHSUS10(EXP)","name":"IBRUSHSUS10(EXP)","spec":"."},{"cat":"Other","cls":"Meta etchant","no":"1KRPRHEPIDMBS00011","model":"RBRUSH01(EXP)","name":"Round Brush(R) / 해외용","spec":"."},{"cat":"Other","cls":"","no":"1KRPRHESUSMRL00001","model":"REXLON30","name":"REXLON 3-0 (Blue Nylon)","spec":"REXLON 3-0 (Blue Nylon / 24 pack)"},{"cat":"Other","cls":"","no":"1KRPRHESUSMRL00003","model":"REXLON50","name":"REXLON 5-0 (Blue Nylon)","spec":"REXLON 5-0 (Blue Nylon / 24 pack)"},{"cat":"Other","cls":"","no":"1KRPRHESUSMRS00001","model":"REXSIL30","name":"REXSIL 3-0 (Black Silk) 18mm","spec":"REXSIL 3-0 (Black Silk / 24 pack)"},{"cat":"Other","cls":"","no":"1KRPRHESUSMRS00002","model":"REXSIL40","name":"REXSIL 4-0 (Black Silk)","spec":"REXSIL 4-0 (Black Silk / 24 pack)"},{"cat":"Other","cls":"","no":"1KRPRHESUSMRS00003","model":"REXSIL50","name":"REXSIL 5-0 (Black Silk)","spec":"REXSIL 5-0 (Black Silk / 24 pack)"},{"cat":"Other","cls":"","no":"1KRPRIPBDDKKE00084","model":"SQ353(EXP)","name":"SQ353(EXP)","spec":"."},{"cat":"Other","cls":"","no":"1KRPRIPBDDKKE00085","model":"SQ354(EXP)","name":"SQ354(EXP)","spec":"."},{"cat":"Abutment","cls":"Ball Abutment","no":"1THCPABETCO4600003","model":"BAORING","name":"Clinical O-Ring","spec":"Ø4.6/Ø1.5"},{"cat":"Abutment","cls":"Ball Abutment","no":"1THCPABETCO5200001","model":"BAR20","name":"Ball Abutment Retainer","spec":"Ø5.0*2.0mm"},{"cat":"Abutment","cls":"Ball Abutment","no":"1THCPABETCO5200002","model":"BAH40","name":"Ball Abutment Housing","spec":"Ø5.0*4.0mm"},{"cat":"Abutment","cls":"Ball Abutment","no":"1THCPABETMO4500001","model":"BAOIMP","name":"Multi O-Ring","spec":"Ø4.5/Ø1.6, L:2.8mm"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN3200001","model":"ISAHA1739","name":"IS Angled Abutment","spec":"Ø3.2*2.0mm, 17°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN3200002","model":"ISAHB1739","name":"IS Angled Abutment","spec":"Ø3.2*2.0mm, 17°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500001","model":"ISAHA1427","name":"IS Angled Abutment","spec":"Ø4.5*2.0mm, 15°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500002","model":"ISAHA1437","name":"IS Angled Abutment","spec":"Ø4.5*3.0mm, 15°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500003","model":"ISAHA1447","name":"IS Angled Abutment","spec":"Ø4.5*4.0mm, 15°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500010","model":"ISAHA2427","name":"IS Angled Abutment","spec":"Ø4.5*2.0mm, 25°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500011","model":"ISAHA2437","name":"IS Angled Abutment","spec":"Ø4.5*3.0mm, 25°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500012","model":"ISAHA2447","name":"IS Angled Abutment","spec":"Ø4.5*4.0mm, 25°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500019","model":"ISAHB1427","name":"IS Angled Abutment","spec":"Ø4.5*2.0mm, 15°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500020","model":"ISAHB1437","name":"IS Angled Abutment","spec":"Ø4.5*3.0mm, 15°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500021","model":"ISAHB1447","name":"IS Angled Abutment","spec":"Ø4.5*4.0mm, 15°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500028","model":"ISAHB2427","name":"IS Angled Abutment","spec":"Ø4.5*2.0mm, 25°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500029","model":"ISAHB2437","name":"IS Angled Abutment","spec":"Ø4.5*3.0mm, 25°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500030","model":"ISAHB2447","name":"IS Angled Abutment","spec":"Ø4.5*4.0mm, 25°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500037","model":"ISANA1427","name":"IS Angled Abutment","spec":"Ø4.5*2.0mm, 15°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500038","model":"ISANA1437","name":"IS Angled Abutment","spec":"Ø4.5*3.0mm, 15°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500039","model":"ISANA1447","name":"IS Angled Abutment","spec":"Ø4.5*4.0mm, 15°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500046","model":"ISANA2427","name":"IS Angled Abutment","spec":"Ø4.5*2.0mm, 25°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500047","model":"ISANA2437","name":"IS Angled Abutment","spec":"Ø4.5*3.0mm, 25°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN4500048","model":"ISANA2447","name":"IS Angled Abutment","spec":"Ø4.5*4.0mm, 25°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200004","model":"ISAHA1527","name":"IS Angled Abutment","spec":"Ø5.2*2.0mm, 15°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200005","model":"ISAHA1537","name":"IS Angled Abutment","spec":"Ø5.2*3.0mm, 15°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200006","model":"ISAHA1547","name":"IS Angled Abutment","spec":"Ø5.2*4.0mm, 15°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200013","model":"ISAHA2527","name":"IS Angled Abutment","spec":"Ø5.2*2.0mm, 25°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200014","model":"ISAHA2537","name":"IS Angled Abutment","spec":"Ø5.2*3.0mm, 25°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200015","model":"ISAHA2547","name":"IS Angled Abutment","spec":"Ø5.2*4.0mm, 25°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200022","model":"ISAHB1527","name":"IS Angled Abutment","spec":"Ø5.2*2.0mm, 15°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200023","model":"ISAHB1537","name":"IS Angled Abutment","spec":"Ø5.2*3.0mm, 15°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200024","model":"ISAHB1547","name":"IS Angled Abutment","spec":"Ø5.2*4.0mm, 15°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200031","model":"ISAHB2527","name":"IS Angled Abutment","spec":"Ø5.2*2.0mm, 25°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200032","model":"ISAHB2537","name":"IS Angled Abutment","spec":"Ø5.2*3.0mm, 25°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200033","model":"ISAHB2547","name":"IS Angled Abutment","spec":"Ø5.2*4.0mm, 25°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200040","model":"ISANA1527","name":"IS Angled Abutment","spec":"Ø5.2*2.0mm, 15°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200041","model":"ISANA1537","name":"IS Angled Abutment","spec":"Ø5.2*3.0mm, 15°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200042","model":"ISANA1547","name":"IS Angled Abutment","spec":"Ø5.2*4.0mm, 15°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200049","model":"ISANA2527","name":"IS Angled Abutment","spec":"Ø5.2*2.0mm, 25°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200050","model":"ISANA2537","name":"IS Angled Abutment","spec":"Ø5.2*3.0mm, 25°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5200051","model":"ISANA2547","name":"IS Angled Abutment","spec":"Ø5.2*4.0mm, 25°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700007","model":"ISAHA1627","name":"IS Angled Abutment","spec":"Ø5.7*2.0mm, 15°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700008","model":"ISAHA1637","name":"IS Angled Abutment","spec":"Ø5.7*3.0mm, 15°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700009","model":"ISAHA1647","name":"IS Angled Abutment","spec":"Ø5.7*4.0mm, 15°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700016","model":"ISAHA2627","name":"IS Angled Abutment","spec":"Ø5.7*2.0mm, 25°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700017","model":"ISAHA2637","name":"IS Angled Abutment","spec":"Ø5.7*3.0mm, 25°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700018","model":"ISAHA2647","name":"IS Angled Abutment","spec":"Ø5.7*4.0mm, 25°, Hex, A-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700025","model":"ISAHB1627","name":"IS Angled Abutment","spec":"Ø5.7*2.0mm, 15°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700026","model":"ISAHB1637","name":"IS Angled Abutment","spec":"Ø5.7*3.0mm, 15°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700027","model":"ISAHB1647","name":"IS Angled Abutment","spec":"Ø5.7*4.0mm, 15°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700034","model":"ISAHB2627","name":"IS Angled Abutment","spec":"Ø5.7*2.0mm, 25°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700035","model":"ISAHB2637","name":"IS Angled Abutment","spec":"Ø5.7*3.0mm, 25°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700036","model":"ISAHB2647","name":"IS Angled Abutment","spec":"Ø5.7*4.0mm, 25°, Hex, B-Type"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700043","model":"ISANA1627","name":"IS Angled Abutment","spec":"Ø5.7*2.0mm, 15°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700044","model":"ISANA1637","name":"IS Angled Abutment","spec":"Ø5.7*3.0mm, 15°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700045","model":"ISANA1647","name":"IS Angled Abutment","spec":"Ø5.7*4.0mm, 15°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700052","model":"ISANA2627","name":"IS Angled Abutment","spec":"Ø5.7*2.0mm, 25°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700053","model":"ISANA2637","name":"IS Angled Abutment","spec":"Ø5.7*3.0mm, 25°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISAN5700054","model":"ISANA2647","name":"IS Angled Abutment","spec":"Ø5.7*4.0mm, 25°, Non-Hex"},{"cat":"Screw","cls":"Screw","no":"1THCPABISAS2000001","model":"ISCS16S","name":"IS Abutment Screw","spec":"M1.6"},{"cat":"Screw","cls":"Screw","no":"1THCPABISAS2300001","model":"ISCS20","name":"IS Abutment Screw","spec":"Ø2.3, L:8.8mm"},{"cat":"Abutment","cls":"Ball Abutment","no":"1THCPABISBA3500001","model":"ISABA100","name":"IS Ball Abutment","spec":"Ø3.5*1.0mm"},{"cat":"Abutment","cls":"Ball Abutment","no":"1THCPABISBA3500002","model":"ISABA200","name":"IS Ball Abutment","spec":"Ø3.5*2.0mm"},{"cat":"Abutment","cls":"Ball Abutment","no":"1THCPABISBA3500003","model":"ISABA300","name":"IS Ball Abutment","spec":"Ø3.5*3.0mm"},{"cat":"Abutment","cls":"Ball Abutment","no":"1THCPABISBA3500004","model":"ISABA400","name":"IS Ball Abutment","spec":"Ø3.5*4.0mm"},{"cat":"Abutment","cls":"CCM UCLA Abutment","no":"1THCPABISCC4800001","model":"MUACCN48","name":"Multi Unit Abut CCM Cylinder","spec":"Ø4.8, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE3500001","model":"ISAH3537","name":"IS Cemented Abutment","spec":"Ø3.5*3.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE3500002","model":"ISAH3547","name":"IS Cemented Abutment","spec":"Ø3.5*4.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE3500003","model":"ISAH3557","name":"IS Cemented Abutment","spec":"Ø3.5*5.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE3500004","model":"ISAH3577","name":"IS Cemented Abutment","spec":"Ø3.5*7.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE3500005","model":"ISAN3537","name":"IS Cemented Abutment","spec":"Ø3.5*3.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE3500006","model":"ISAN3547","name":"IS Cemented Abutment","spec":"Ø3.5*4.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE3500007","model":"ISAN3557","name":"IS Cemented Abutment","spec":"Ø3.5*5.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE3500008","model":"ISAN3577","name":"IS Cemented Abutment","spec":"Ø3.5*7.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500001","model":"ISAH4140","name":"IS Cemented Abutment","spec":"Ø4.5*1.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500002","model":"ISAH4240","name":"IS Cemented Abutment","spec":"Ø4.5*2.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500003","model":"ISAH4340","name":"IS Cemented Abutment","spec":"Ø4.5*3.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500004","model":"ISAH4440","name":"IS Cemented Abutment","spec":"Ø4.5*4.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500005","model":"ISAH4540","name":"IS Cemented Abutment","spec":"Ø4.5*5.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500011","model":"ISAH415","name":"IS Cemented Abutment","spec":"Ø4.5*1.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500012","model":"ISAH425","name":"IS Cemented Abutment","spec":"Ø4.5*2.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500013","model":"ISAH435","name":"IS Cemented Abutment","spec":"Ø4.5*3.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500014","model":"ISAH445","name":"IS Cemented Abutment","spec":"Ø4.5*4.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500015","model":"ISAH455","name":"IS Cemented Abutment","spec":"Ø4.5*5.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500016","model":"ISAH417","name":"IS Cemented Abutment","spec":"Ø4.5*1.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500017","model":"ISAH427","name":"IS Cemented Abutment","spec":"Ø4.5*2.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500018","model":"ISAH437","name":"IS Cemented Abutment","spec":"Ø4.5*3.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500019","model":"ISAH447","name":"IS Cemented Abutment","spec":"Ø4.5*4.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500020","model":"ISAH457","name":"IS Cemented Abutment","spec":"Ø4.5*5.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500101","model":"ISAS4140","name":"IS Cemented Abutment","spec":"Ø4.5*1.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500102","model":"ISAS4240","name":"IS Cemented Abutment","spec":"Ø4.5*2.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500103","model":"ISAS4340","name":"IS Cemented Abutment","spec":"Ø4.5*3.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500104","model":"ISAS4440","name":"IS Cemented Abutment","spec":"Ø4.5*4.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500105","model":"ISAS4540","name":"IS Cemented Abutment","spec":"Ø4.5*5.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500111","model":"ISAS415","name":"IS Cemented Abutment","spec":"Ø4.5*1.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500112","model":"ISAS425","name":"IS Cemented Abutment","spec":"Ø4.5*2.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500113","model":"ISAS435","name":"IS Cemented Abutment","spec":"Ø4.5*3.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500114","model":"ISAS445","name":"IS Cemented Abutment","spec":"Ø4.5*4.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500115","model":"ISAS455","name":"IS Cemented Abutment","spec":"Ø4.5*5.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500116","model":"ISAS417","name":"IS Cemented Abutment","spec":"Ø4.5*1.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500117","model":"ISAS427","name":"IS Cemented Abutment","spec":"Ø4.5*2.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500118","model":"ISAS437","name":"IS Cemented Abutment","spec":"Ø4.5*3.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500119","model":"ISAS447","name":"IS Cemented Abutment","spec":"Ø4.5*4.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500120","model":"ISAS457","name":"IS Cemented Abutment","spec":"Ø4.5*5.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500201","model":"ISAN4140","name":"IS Cemented Abutment","spec":"Ø4.5*1.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500202","model":"ISAN4240","name":"IS Cemented Abutment","spec":"Ø4.5*2.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500203","model":"ISAN4340","name":"IS Cemented Abutment","spec":"Ø4.5*3.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500204","model":"ISAN4440","name":"IS Cemented Abutment","spec":"Ø4.5*4.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500205","model":"ISAN4540","name":"IS Cemented Abutment","spec":"Ø4.5*5.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500211","model":"ISAN415","name":"IS Cemented Abutment","spec":"Ø4.5*1.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500212","model":"ISAN425","name":"IS Cemented Abutment","spec":"Ø4.5*2.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500213","model":"ISAN435","name":"IS Cemented Abutment","spec":"Ø4.5*3.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500214","model":"ISAN445","name":"IS Cemented Abutment","spec":"Ø4.5*4.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500215","model":"ISAN455","name":"IS Cemented Abutment","spec":"Ø4.5*5.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500216","model":"ISAN417","name":"IS Cemented Abutment","spec":"Ø4.5*1.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500217","model":"ISAN427","name":"IS Cemented Abutment","spec":"Ø4.5*2.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500218","model":"ISAN437","name":"IS Cemented Abutment","spec":"Ø4.5*3.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500219","model":"ISAN447","name":"IS Cemented Abutment","spec":"Ø4.5*4.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE4500220","model":"ISAN457","name":"IS Cemented Abutment","spec":"Ø4.5*5.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200026","model":"ISAH5140","name":"IS Cemented Abutment","spec":"Ø5.2*1.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200027","model":"ISAH5240","name":"IS Cemented Abutment","spec":"Ø5.2*2.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200028","model":"ISAH5340","name":"IS Cemented Abutment","spec":"Ø5.2*3.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200029","model":"ISAH5440","name":"IS Cemented Abutment","spec":"Ø5.2*4.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200030","model":"ISAH5540","name":"IS Cemented Abutment","spec":"Ø5.2*5.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200036","model":"ISAH515","name":"IS Cemented Abutment","spec":"Ø5.2*1.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200037","model":"ISAH525","name":"IS Cemented Abutment","spec":"Ø5.2*2.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200038","model":"ISAH535","name":"IS Cemented Abutment","spec":"Ø5.2*3.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200039","model":"ISAH545","name":"IS Cemented Abutment","spec":"Ø5.2*4.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200040","model":"ISAH555","name":"IS Cemented Abutment","spec":"Ø5.2*5.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200041","model":"ISAH517","name":"IS Cemented Abutment","spec":"Ø5.2*1.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200042","model":"ISAH527","name":"IS Cemented Abutment","spec":"Ø5.2*2.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200043","model":"ISAH537","name":"IS Cemented Abutment","spec":"Ø5.2*3.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200044","model":"ISAH547","name":"IS Cemented Abutment","spec":"Ø5.2*4.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200045","model":"ISAH557","name":"IS Cemented Abutment","spec":"Ø5.2*5.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200126","model":"ISAS5140","name":"IS Cemented Abutment","spec":"Ø5.2*1.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200127","model":"ISAS5240","name":"IS Cemented Abutment","spec":"Ø5.2*2.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200128","model":"ISAS5340","name":"IS Cemented Abutment","spec":"Ø5.2*3.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200129","model":"ISAS5440","name":"IS Cemented Abutment","spec":"Ø5.2*4.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200130","model":"ISAS5540","name":"IS Cemented Abutment","spec":"Ø5.2*5.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200136","model":"ISAS515","name":"IS Cemented Abutment","spec":"Ø5.2*1.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200137","model":"ISAS525","name":"IS Cemented Abutment","spec":"Ø5.2*2.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200138","model":"ISAS535","name":"IS Cemented Abutment","spec":"Ø5.2*3.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200139","model":"ISAS545","name":"IS Cemented Abutment","spec":"Ø5.2*4.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200140","model":"ISAS555","name":"IS Cemented Abutment","spec":"Ø5.2*5.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200141","model":"ISAS517","name":"IS Cemented Abutment","spec":"Ø5.2*1.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200142","model":"ISAS527","name":"IS Cemented Abutment","spec":"Ø5.2*2.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200143","model":"ISAS537","name":"IS Cemented Abutment","spec":"Ø5.2*3.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200144","model":"ISAS547","name":"IS Cemented Abutment","spec":"Ø5.2*4.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200145","model":"ISAS557","name":"IS Cemented Abutment","spec":"Ø5.2*5.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200226","model":"ISAN5140","name":"IS Cemented Abutment","spec":"Ø5.2*1.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200227","model":"ISAN5240","name":"IS Cemented Abutment","spec":"Ø5.2*2.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200228","model":"ISAN5340","name":"IS Cemented Abutment","spec":"Ø5.2*3.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200229","model":"ISAN5440","name":"IS Cemented Abutment","spec":"Ø5.2*4.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200230","model":"ISAN5540","name":"IS Cemented Abutment","spec":"Ø5.2*5.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200236","model":"ISAN515","name":"IS Cemented Abutment","spec":"Ø5.2*1.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200237","model":"ISAN525","name":"IS Cemented Abutment","spec":"Ø5.2*2.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200238","model":"ISAN535","name":"IS Cemented Abutment","spec":"Ø5.2*3.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200239","model":"ISAN545","name":"IS Cemented Abutment","spec":"Ø5.2*4.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200240","model":"ISAN555","name":"IS Cemented Abutment","spec":"Ø5.2*5.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200241","model":"ISAN517","name":"IS Cemented Abutment","spec":"Ø5.2*1.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200242","model":"ISAN527","name":"IS Cemented Abutment","spec":"Ø5.2*2.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200243","model":"ISAN537","name":"IS Cemented Abutment","spec":"Ø5.2*3.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200244","model":"ISAN547","name":"IS Cemented Abutment","spec":"Ø5.2*4.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5200245","model":"ISAN557","name":"IS Cemented Abutment","spec":"Ø5.2*5.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700051","model":"ISAH6140","name":"IS Cemented Abutment","spec":"Ø5.7*1.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700052","model":"ISAH6240","name":"IS Cemented Abutment","spec":"Ø5.7*2.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700053","model":"ISAH6340","name":"IS Cemented Abutment","spec":"Ø5.7*3.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700054","model":"ISAH6440","name":"IS Cemented Abutment","spec":"Ø5.7*4.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700055","model":"ISAH6540","name":"IS Cemented Abutment","spec":"Ø5.7*5.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700061","model":"ISAH615","name":"IS Cemented Abutment","spec":"Ø5.7*1.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700062","model":"ISAH625","name":"IS Cemented Abutment","spec":"Ø5.7*2.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700063","model":"ISAH635","name":"IS Cemented Abutment","spec":"Ø5.7*3.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700064","model":"ISAH645","name":"IS Cemented Abutment","spec":"Ø5.7*4.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700065","model":"ISAH655","name":"IS Cemented Abutment","spec":"Ø5.7*5.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700066","model":"ISAH617","name":"IS Cemented Abutment","spec":"Ø5.7*1.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700067","model":"ISAH627","name":"IS Cemented Abutment","spec":"Ø5.7*2.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700068","model":"ISAH637","name":"IS Cemented Abutment","spec":"Ø5.7*3.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700069","model":"ISAH647","name":"IS Cemented Abutment","spec":"Ø5.7*4.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700070","model":"ISAH657","name":"IS Cemented Abutment","spec":"Ø5.7*5.0mm, L:7.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700151","model":"ISAS6140","name":"IS Cemented Abutment","spec":"Ø5.7*1.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700152","model":"ISAS6240","name":"IS Cemented Abutment","spec":"Ø5.7*2.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700153","model":"ISAS6340","name":"IS Cemented Abutment","spec":"Ø5.7*3.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700154","model":"ISAS6440","name":"IS Cemented Abutment","spec":"Ø5.7*4.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700155","model":"ISAS6540","name":"IS Cemented Abutment","spec":"Ø5.7*5.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700161","model":"ISAS615","name":"IS Cemented Abutment","spec":"Ø5.7*1.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700162","model":"ISAS625","name":"IS Cemented Abutment","spec":"Ø5.7*2.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700163","model":"ISAS635","name":"IS Cemented Abutment","spec":"Ø5.7*3.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700164","model":"ISAS645","name":"IS Cemented Abutment","spec":"Ø5.7*4.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700165","model":"ISAS655","name":"IS Cemented Abutment","spec":"Ø5.7*5.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700166","model":"ISAS617","name":"IS Cemented Abutment","spec":"Ø5.7*1.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700167","model":"ISAS627","name":"IS Cemented Abutment","spec":"Ø5.7*2.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700168","model":"ISAS637","name":"IS Cemented Abutment","spec":"Ø5.7*3.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700169","model":"ISAS647","name":"IS Cemented Abutment","spec":"Ø5.7*4.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700170","model":"ISAS657","name":"IS Cemented Abutment","spec":"Ø5.7*5.0mm, L:7.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700251","model":"ISAN6140","name":"IS Cemented Abutment","spec":"Ø5.7*1.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700252","model":"ISAN6240","name":"IS Cemented Abutment","spec":"Ø5.7*2.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700253","model":"ISAN6340","name":"IS Cemented Abutment","spec":"Ø5.7*3.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700254","model":"ISAN6440","name":"IS Cemented Abutment","spec":"Ø5.7*4.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700255","model":"ISAN6540","name":"IS Cemented Abutment","spec":"Ø5.7*5.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700261","model":"ISAN615","name":"IS Cemented Abutment","spec":"Ø5.7*1.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700262","model":"ISAN625","name":"IS Cemented Abutment","spec":"Ø5.7*2.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700263","model":"ISAN635","name":"IS Cemented Abutment","spec":"Ø5.7*3.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700264","model":"ISAN645","name":"IS Cemented Abutment","spec":"Ø5.7*4.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700265","model":"ISAN655","name":"IS Cemented Abutment","spec":"Ø5.7*5.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700266","model":"ISAN617","name":"IS Cemented Abutment","spec":"Ø5.7*1.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700267","model":"ISAN627","name":"IS Cemented Abutment","spec":"Ø5.7*2.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700268","model":"ISAN637","name":"IS Cemented Abutment","spec":"Ø5.7*3.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700269","model":"ISAN647","name":"IS Cemented Abutment","spec":"Ø5.7*4.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE5700270","model":"ISAN657","name":"IS Cemented Abutment","spec":"Ø5.7*5.0mm, L:7.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500076","model":"ISAH7140","name":"IS Cemented Abutment","spec":"Ø6.5*1.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500077","model":"ISAH7240","name":"IS Cemented Abutment","spec":"Ø6.5*2.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500078","model":"ISAH7340","name":"IS Cemented Abutment","spec":"Ø6.5*3.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500079","model":"ISAH7440","name":"IS Cemented Abutment","spec":"Ø6.5*4.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500080","model":"ISAH7540","name":"IS Cemented Abutment","spec":"Ø6.5*5.0mm, L:4.0mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500086","model":"ISAH715","name":"IS Cemented Abutment","spec":"Ø6.5*1.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500087","model":"ISAH725","name":"IS Cemented Abutment","spec":"Ø6.5*2.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500088","model":"ISAH735","name":"IS Cemented Abutment","spec":"Ø6.5*3.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500089","model":"ISAH745","name":"IS Cemented Abutment","spec":"Ø6.5*4.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500090","model":"ISAH755","name":"IS Cemented Abutment","spec":"Ø6.5*5.0mm, L:5.5mm, Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500176","model":"ISAS7140","name":"IS Cemented Abutment","spec":"Ø6.5*1.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500177","model":"ISAS7240","name":"IS Cemented Abutment","spec":"Ø6.5*2.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500178","model":"ISAS7340","name":"IS Cemented Abutment","spec":"Ø6.5*3.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500179","model":"ISAS7440","name":"IS Cemented Abutment","spec":"Ø6.5*4.0mm, L:4.0mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500186","model":"ISAS715","name":"IS Cemented Abutment","spec":"Ø6.5*1.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500187","model":"ISAS725","name":"IS Cemented Abutment","spec":"Ø6.5*2.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500188","model":"ISAS735","name":"IS Cemented Abutment","spec":"Ø6.5*3.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500189","model":"ISAS745","name":"IS Cemented Abutment","spec":"Ø6.5*4.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500190","model":"ISAS755","name":"IS Cemented Abutment","spec":"Ø6.5*5.0mm, L:5.5mm, SCRP"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500276","model":"ISAN7140","name":"IS Cemented Abutment","spec":"Ø6.5*1.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500277","model":"ISAN7240","name":"IS Cemented Abutment","spec":"Ø6.5*2.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500278","model":"ISAN7340","name":"IS Cemented Abutment","spec":"Ø6.5*3.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500279","model":"ISAN7440","name":"IS Cemented Abutment","spec":"Ø6.5*4.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500280","model":"ISAN7540","name":"IS Cemented Abutment","spec":"Ø6.5*5.0mm, L:4.0mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500286","model":"ISAN715","name":"IS Cemented Abutment","spec":"Ø6.5*1.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500287","model":"ISAN725","name":"IS Cemented Abutment","spec":"Ø6.5*2.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500288","model":"ISAN735","name":"IS Cemented Abutment","spec":"Ø6.5*3.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500289","model":"ISAN745","name":"IS Cemented Abutment","spec":"Ø6.5*4.0mm, L:5.5mm, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISCE6500290","model":"ISAN755","name":"IS Cemented Abutment","spec":"Ø6.5*5.0mm, L:5.5mm, Non-Hex"},{"cat":"Screw","cls":"Screw","no":"1THCPABISCO3000009","model":"ISC25S","name":"IS Cover Screw","spec":"Ø3.0, Standard"},{"cat":"Screw","cls":"Screw","no":"1THCPABISCO3400003","model":"ISN30S","name":"IS Cover Screw","spec":"Ø3.45, Standard"},{"cat":"Screw","cls":"Screw","no":"1THCPABISCO3400004","model":"ISN30M","name":"IS Cover Screw","spec":"Ø3.45, Middle"},{"cat":"Screw","cls":"Screw","no":"1THCPABISCO3400005","model":"ISN30L","name":"IS Cover Screw","spec":"Ø3.45, Long"},{"cat":"Screw","cls":"Screw","no":"1THCPABISCO3600006","model":"ISC40S","name":"IS Cover Screw","spec":"Ø3.6, Standard"},{"cat":"Screw","cls":"Screw","no":"1THCPABISCO3600007","model":"ISC40M","name":"IS Cover Screw","spec":"Ø3.6, Middle"},{"cat":"Screw","cls":"Screw","no":"1THCPABISCO3600008","model":"ISC40L","name":"IS Cover Screw","spec":"Ø3.6, Long"},{"cat":"Abutment","cls":"CCM UCLA Abutment","no":"1THCPABISCU4500001","model":"ISUCH400","name":"IS CCM UCLA Abutment","spec":"Ø4.5, L:14.0mm, Hex"},{"cat":"Abutment","cls":"CCM UCLA Abutment","no":"1THCPABISCU4500002","model":"ISUCN400","name":"IS CCM UCLA Abutment","spec":"Ø4.5, L:14.0mm, Non-Hex"},{"cat":"Abutment","cls":"CCM UCLA Abutment","no":"1THCPABISCU4500003","model":"ISUCS400","name":"IS CCM UCLA Abutment","spec":"Ø4.5, L:14.0mm, SCRP"},{"cat":"Abutment","cls":"Gold UCLA Abutment","no":"1THCPABISGU4500001","model":"ISUGH400","name":"IS Gold UCLA Abutment","spec":"Ø4.5, L:10.0mm, Hex"},{"cat":"Abutment","cls":"Gold UCLA Abutment","no":"1THCPABISGU4500002","model":"ISUGN400","name":"IS Gold UCLA Abutment","spec":"Ø4.5, L:10.0mm, Non-Hex"},{"cat":"Abutment","cls":"Gold UCLA Abutment","no":"1THCPABISGU4500003","model":"ISUGS400","name":"IS Gold UCLA Abutment","spec":"Ø4.5, L:10.0mm, SCRP"},{"cat":"Abutment","cls":"CCM UCLA Abutment","no":"1THCPABISGU5500013","model":"ITUCN500","name":"IT CCM UCLA Abutment","spec":"Ø5.5, Non-Octa"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE3000053","model":"ISH3003","name":"IS Healing Abutment","spec":"Ø3.0*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE3000054","model":"ISH3005","name":"IS Healing Abutment","spec":"Ø3.0*5.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE3800056","model":"ISH3803","name":"IS Healing Abutment","spec":"Ø3.8*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE3800057","model":"ISH3805","name":"IS Healing Abutment","spec":"Ø3.8*5.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4000042","model":"ISUH4002","name":"IS Uni Healing Abutment","spec":"Ø4.0*2.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4000043","model":"ISUH4003","name":"IS Uni Healing Abutment","spec":"Ø4.0*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4000044","model":"ISUH4004","name":"IS Uni Healing Abutment","spec":"Ø4.0*4.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4000045","model":"ISUH4005","name":"IS Uni Healing Abutment","spec":"Ø4.0*5.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4000046","model":"ISUH4006","name":"IS Uni Healing Abutment","spec":"Ø4.0*6.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4500047","model":"ISUH4502","name":"IS Uni Healing Abutment","spec":"Ø4.5*2.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4500048","model":"ISUH4503","name":"IS Uni Healing Abutment","spec":"Ø4.5*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4500049","model":"ISUH4504","name":"IS Uni Healing Abutment","spec":"Ø4.5*4.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4500050","model":"ISUH4505","name":"IS Uni Healing Abutment","spec":"Ø4.5*5.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4500051","model":"ISUH4506","name":"IS Uni Healing Abutment","spec":"Ø4.5*6.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4800001","model":"ISH402","name":"IS Healing Abutment","spec":"Ø4.8*2.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4800002","model":"ISH403","name":"IS Healing Abutment","spec":"Ø4.8*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4800003","model":"ISH404","name":"IS Healing Abutment","spec":"Ø4.8*4.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4800004","model":"ISH405","name":"IS Healing Abutment","spec":"Ø4.8*5.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4800005","model":"ISH406","name":"IS Healing Abutment","spec":"Ø4.8*6.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4800006","model":"ISH407","name":"IS Healing Abutment","spec":"Ø4.8*7.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE4800052","model":"MUAHC48","name":"Multi Unit Healing Cap","spec":"Ø4.8"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE5500007","model":"ISH502","name":"IS Healing Abutment","spec":"Ø5.5*2.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE5500008","model":"ISH503","name":"IS Healing Abutment","spec":"Ø5.5*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE5500009","model":"ISH504","name":"IS Healing Abutment","spec":"Ø5.5*4.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE5500010","model":"ISH505","name":"IS Healing Abutment","spec":"Ø5.5*5.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE5500011","model":"ISH506","name":"IS Healing Abutment","spec":"Ø5.5*6.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE5500012","model":"ISH507","name":"IS Healing Abutment","spec":"Ø5.5*7.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6000013","model":"ISH602","name":"IS Healing Abutment","spec":"Ø6.0*2.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6000014","model":"ISH603","name":"IS Healing Abutment","spec":"Ø6.0*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6000015","model":"ISH604","name":"IS Healing Abutment","spec":"Ø6.0*4.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6000016","model":"ISH605","name":"IS Healing Abutment","spec":"Ø6.0*5.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6000017","model":"ISH606","name":"IS Healing Abutment","spec":"Ø6.0*6.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6000018","model":"ISH607","name":"IS Healing Abutment","spec":"Ø6.0*7.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6800019","model":"ISH702","name":"IS Healing Abutment","spec":"Ø6.8*2.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6800020","model":"ISH703","name":"IS Healing Abutment","spec":"Ø6.8*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6800021","model":"ISH704","name":"IS Healing Abutment","spec":"Ø6.8*4.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6800022","model":"ISH705","name":"IS Healing Abutment","spec":"Ø6.8*5.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6800023","model":"ISH706","name":"IS Healing Abutment","spec":"Ø6.8*6.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE6800024","model":"ISH707","name":"IS Healing Abutment","spec":"Ø6.8*7.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE8000025","model":"ISH802","name":"IS Healing Abutment","spec":"Ø8.0*2.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE8000026","model":"ISH803","name":"IS Healing Abutment","spec":"Ø8.0*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE8000027","model":"ISH804","name":"IS Healing Abutment","spec":"Ø8.0*4.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE8000028","model":"ISH805","name":"IS Healing Abutment","spec":"Ø8.0*5.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE8000029","model":"ISH806","name":"IS Healing Abutment","spec":"Ø8.0*6.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE8000030","model":"ISH807","name":"IS Healing Abutment","spec":"Ø8.0*7.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE9000031","model":"ISH902","name":"IS Healing Abutment","spec":"Ø9.0*2.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE9000032","model":"ISH903","name":"IS Healing Abutment","spec":"Ø9.0*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABISHE9000033","model":"ISH904","name":"IS Healing Abutment","spec":"Ø9.0*4.0mm"},{"cat":"Screw","cls":"Screw","no":"1THCPABISMS1400018","model":"MUAS14","name":"Multi Unit Abutment Cylinder Screw","spec":"Ø2.3, L:4.1mm"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800002","model":"ISAHMUA1410S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*1.0mm, 17°, Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800003","model":"ISAHMUA1420S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*2.0mm, 17°, Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800004","model":"ISAHMUA1430S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*3.0mm, 17°, Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800005","model":"ISAHMUA1440S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*4.0mm, 17°, Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800006","model":"ISAHMUA3410S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*1.0mm, 30°, Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800007","model":"ISAHMUA3420S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*2.0mm, 30°, Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800008","model":"ISAHMUA3430S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*3.0mm, 30°, Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800009","model":"ISAHMUA3440S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*4.0mm, 30°, Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800010","model":"ISANMUA1410S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*1.0mm, 17°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800011","model":"ISANMUA1420S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*2.0mm, 17°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800012","model":"ISANMUA1430S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*3.0mm, 17°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800013","model":"ISANMUA1440S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*4.0mm, 17°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800014","model":"ISANMUA3410S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*1.0mm, 30°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800015","model":"ISANMUA3420S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*2.0mm, 30°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800016","model":"ISANMUA3430S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*3.0mm, 30°, Non-Hex"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABISMS4800017","model":"ISANMUA3440S","name":"IS Multi Unit Angled Abutment","spec":"Ø4.8*4.0mm, 30°, Non-Hex"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISMS4800019","model":"MUAC48","name":"Multi Unit Abutment Cylinder","spec":"Ø4.8"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISMU4800007","model":"ISMUA4810S","name":"IS Multi Unit Abutment","spec":"Ø4.8*1.0mm"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISMU4800008","model":"ISMUA4820S","name":"IS Multi Unit Abutment","spec":"Ø4.8*2.0mm"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISMU4800010","model":"ISMUA4840S","name":"IS Multi Unit Abutment","spec":"Ø4.8*4.0mm"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABISMU4800090","model":"ISMUA4830S","name":"IS Multi Unit Abutment","spec":"Ø4.8*3.0mm"},{"cat":"Abutment","cls":"Shapable Abutment","no":"1THCPABISSH4500001","model":"ISSH428","name":"IS Shapable Abutment","spec":"Ø4.5*2.0mm, L:8.0mm, Hex"},{"cat":"Abutment","cls":"Shapable Abutment","no":"1THCPABISSH4500002","model":"ISSH448","name":"IS Shapable Abutment","spec":"Ø4.5*4.0mm, L:8.0mm, Hex"},{"cat":"Abutment","cls":"Shapable Abutment","no":"1THCPABISSH5200007","model":"ISSH528","name":"IS Shapable Abutment","spec":"Ø5.2*2.0mm, L:8.0mm, Hex"},{"cat":"Abutment","cls":"Shapable Abutment","no":"1THCPABISSH5200008","model":"ISSH548","name":"IS Shapable Abutment","spec":"Ø5.2*4.0mm, L:8.0mm, Hex"},{"cat":"Abutment","cls":"Shapable Abutment","no":"1THCPABISSH5700013","model":"ISSH628","name":"IS Shapable Abutment","spec":"Ø5.7*2.0mm, L:8.0mm, Hex"},{"cat":"Abutment","cls":"Shapable Abutment","no":"1THCPABISSH5700014","model":"ISSH648","name":"IS Shapable Abutment","spec":"Ø5.7*4.0mm, L:8.0mm, Hex"},{"cat":"Abutment","cls":"Shapable Abutment","no":"1THCPABISSH6500019","model":"ISSH728","name":"IS Shapable Abutment","spec":"Ø6.5*2.0mm, L:8.0mm, Hex"},{"cat":"Abutment","cls":"Shapable Abutment","no":"1THCPABISSH6500020","model":"ISSH748","name":"IS Shapable Abutment","spec":"Ø6.5*4.0mm, L:8.0mm, Hex"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPABISTE3000001","model":"ISAHT300","name":"IS Temporary Abutment","spec":"Ø3.0, Hex"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPABISTE3000002","model":"ISANT300","name":"IS Temporary Abutment","spec":"Ø3.0, Non-Hex"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPABISTE4500001","model":"ISAHT460","name":"IS Temporary Abutment","spec":"Ø4.5*2.0mm, L:6.0mm, Hex"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPABISTE4500002","model":"ISAHT480","name":"IS Temporary Abutment","spec":"Ø4.5*2.0mm, L:8.0mm, Hex"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPABISTE4500005","model":"ISAHT4130","name":"IS Temporary Abutment","spec":"Ø4.5*1.0mm, L:13.0mm, Hex"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPABISTE4500007","model":"ISANT460","name":"IS Temporary Abutment","spec":"Ø4.5*2.0mm, L:6.0mm, Non-Hex"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPABISTE4500008","model":"ISANT480","name":"IS Temporary Abutment","spec":"Ø4.5*2.0mm, L:8.0mm, Non-Hex"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPABISTE4500011","model":"ISANT4130","name":"IS Temporary Abutment","spec":"Ø4.5*1.0mm, L:13.0mm, Non-Hex"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPABISTE4500013","model":"ISAST460","name":"IS Temporary Abutment","spec":"Ø4.5*2.0mm, L:6.0mm, SCRP"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPABISTE4500014","model":"ISAST480","name":"IS Temporary Abutment","spec":"Ø4.5*2.0mm, L:8.0mm, SCRP"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPABISTE4500017","model":"ISAST4130","name":"IS Temporary Abutment","spec":"Ø4.5*1.0mm, L:13.0mm, SCRP"},{"cat":"Screw","cls":"Screw","no":"1THCPABITAS2500001","model":"ITAS20S","name":"IT Angled Abutment Screw","spec":"Ø2.55, L:6.75mm"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800001","model":"IAO511A","name":"IT Collared Angled Abutment","spec":"Ø5.5*1.0mm, 15°, A-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800002","model":"IAO512A","name":"IT Collared Angled Abutment","spec":"Ø5.5*2.0mm, 15°, A-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800003","model":"IAO521A","name":"IT Collared Angled Abutment","spec":"Ø5.5*1.0mm, 25°, A-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800004","model":"IAO522A","name":"IT Collared Angled Abutment","spec":"Ø5.5*2.0mm, 25°, A-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800005","model":"IAO511B","name":"IT Collared Angled Abutment","spec":"Ø5.5*1.0mm, 15°, B-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800006","model":"IAO512B","name":"IT Collared Angled Abutment","spec":"Ø5.5*2.0mm, 15°, B-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800007","model":"IAO521B","name":"IT Collared Angled Abutment","spec":"Ø5.5*1.0mm, 25°, B-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800008","model":"IAO522B","name":"IT Collared Angled Abutment","spec":"Ø5.5*2.0mm, 25°, B-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800009","model":"IAN511","name":"IT Collared Angled Abutment","spec":"Ø5.5*1.0mm, 15°, Non-Octa, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800010","model":"IAN512","name":"IT Collared Angled Abutment","spec":"Ø5.5*2.0mm, 15°, Non-Octa, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800011","model":"IAN521","name":"IT Collared Angled Abutment","spec":"Ø5.5*1.0mm, 25°, Non-Octa, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITCA4800012","model":"IAN522","name":"IT Collared Angled Abutment","spec":"Ø5.5*2.0mm, 25°, Non-Octa, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800001","model":"ICO500","name":"IT Cemented Abutment","spec":"Ø4.85*0mm, Octa, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800002","model":"ICO510","name":"IT Cemented Abutment","spec":"Ø5.5*1.0mm, Octa, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800003","model":"ICO520","name":"IT Cemented Abutment","spec":"Ø5.5*2.0mm, Octa, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800004","model":"ICO530","name":"IT Cemented Abutment","spec":"Ø5.5*3.0mm, Octa, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800005","model":"ICO540","name":"IT Cemented Abutment","spec":"Ø5.5*4.0mm, Octa, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800013","model":"ICN500","name":"IT Cemented Abutment","spec":"Ø4.85*0mm, Non-Octa, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800014","model":"ICN510","name":"IT Cemented Abutment","spec":"Ø5.5*1.0mm, Non-Octa, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800015","model":"ICN520","name":"IT Cemented Abutment","spec":"Ø5.5*2.0mm, Non-Octa, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800016","model":"ICN530","name":"IT Cemented Abutment","spec":"Ø5.5*3.0mm, Non-Octa, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800017","model":"ICN540","name":"IT Cemented Abutment","spec":"Ø5.5*4.0mm, Non-Octa, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800025","model":"ICS500","name":"IT SCRP Abutment","spec":"Ø4.85*0mm, SCRP, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800026","model":"ICS510","name":"IT SCRP Abutment","spec":"Ø5.5*1.0mm, SCRP, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800027","model":"ICS520","name":"IT SCRP Abutment","spec":"Ø5.5*2.0mm, SCRP, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800028","model":"ICS530","name":"IT SCRP Abutment","spec":"Ø5.5*3.0mm, SCRP, Regular Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE4800029","model":"ICS540","name":"IT SCRP Abutment","spec":"Ø5.5*4.0mm, SCRP, Regular Neck"},{"cat":"Abutment","cls":"Solid Abutment","no":"1THCPABITCE5000048","model":"ITSE404","name":"IT Ex Solid Abutment","spec":"4.0mm, Yellow"},{"cat":"Abutment","cls":"Solid Abutment","no":"1THCPABITCE5000049","model":"ITSE407","name":"IT Ex Solid Abutment","spec":"7.0mm, Blue"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500006","model":"ICOW700","name":"IT Cemented Abutment","spec":"Ø6.55*0mm, Octa, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500007","model":"ICOW710","name":"IT Cemented Abutment","spec":"Ø7.2*1.0mm, Octa, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500008","model":"ICOW720","name":"IT Cemented Abutment","spec":"Ø7.2*2.0mm, Octa, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500009","model":"ICOW730","name":"IT Cemented Abutment","spec":"Ø7.2*3.0mm, Octa, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500010","model":"ICOW740","name":"IT Cemented Abutment","spec":"Ø7.2*4.0mm, Octa, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500018","model":"ICNW700","name":"IT Cemented Abutment","spec":"Ø6.55*0mm, Non-Octa, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500019","model":"ICNW710","name":"IT Cemented Abutment","spec":"Ø7.2*1.0mm, Non-Octa, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500020","model":"ICNW720","name":"IT Cemented Abutment","spec":"Ø7.2*2.0mm, Non-Octa, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500021","model":"ICNW730","name":"IT Cemented Abutment","spec":"Ø7.2*3.0mm, Non-Octa, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500022","model":"ICNW740","name":"IT Cemented Abutment","spec":"Ø7.2*4.0mm, Non-Octa, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500030","model":"ICSW700","name":"IT SCRP Abutment","spec":"Ø6.55*0mm, SCRP, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500031","model":"ICSW710","name":"IT SCRP Abutment","spec":"Ø7.2*1.0mm, SCRP, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500032","model":"ICSW720","name":"IT SCRP Abutment","spec":"Ø7.2*2.0mm, SCRP, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500033","model":"ICSW730","name":"IT SCRP Abutment","spec":"Ø7.2*3.0mm, SCRP, Wide Neck"},{"cat":"Abutment","cls":"Straight Abutment","no":"1THCPABITCE6500034","model":"ICSW740","name":"IT SCRP Abutment","spec":"Ø7.2*4.0mm, SCRP, Wide Neck"},{"cat":"Screw","cls":"Screw","no":"1THCPABITCO3500001","model":"ITCS10","name":"IT Cover Screw","spec":"Small"},{"cat":"Screw","cls":"Screw","no":"1THCPABITCO4300003","model":"ITCSW10","name":"IT WN Cover Screw","spec":"Small"},{"cat":"Screw","cls":"Screw","no":"1THCPABITCO5500004","model":"ITCS48","name":"IT Cover Screw","spec":"Ø5.5, Regular"},{"cat":"Screw","cls":"Screw","no":"1THCPABITCO6900005","model":"ITCS65","name":"IT Cover Screw","spec":"Ø6.9, Wide"},{"cat":"Screw","cls":"Screw","no":"1THCPABITCS2500001","model":"ITCS20S","name":"IT Cemented Abutment Screw","spec":"Ø2.55, L:7.55mm"},{"cat":"Abutment","cls":"CCM UCLA Abutment","no":"1THCPABITCU5500002","model":"ITUCO500","name":"IT CCM UCLA Abutment","spec":"Ø5.5, 3.1Octa"},{"cat":"Abutment","cls":"CCM UCLA Abutment","no":"1THCPABITCU7200001","model":"ITUCN700","name":"IT WN CCM UCLA Abutment","spec":"Ø7.2, Non-Octa"},{"cat":"Abutment","cls":"CCM UCLA Abutment","no":"1THCPABITCU7200003","model":"ITUCO700","name":"IT WN CCM UCLA Abutment","spec":"Ø7.2, Octa"},{"cat":"Abutment","cls":"Solid Abutment","no":"1THCPABITES4300001","model":"ITSE405","name":"IT Excellent Solid Abutment","spec":"Ø4.35, L:5.5mm, Regular Neck"},{"cat":"Abutment","cls":"Solid Abutment","no":"1THCPABITES6000002","model":"ITSR40","name":"IT Solid Abutment","spec":"4.0mm, Yellow"},{"cat":"Abutment","cls":"Solid Abutment","no":"1THCPABITES6000003","model":"ITSR70","name":"IT Solid Abutment","spec":"7.0mm, Blue"},{"cat":"Abutment","cls":"Gold UCLA Abutment","no":"1THCPABITGU4800001","model":"ITUGO500","name":"IT Gold UCLA Abutment","spec":"Ø5.5, L:10.0mm, Octa, Regular Neck"},{"cat":"Abutment","cls":"Gold UCLA Abutment","no":"1THCPABITGU4800003","model":"ITUGN500","name":"IT Gold UCLA Abutment","spec":"Ø5.5, L:10.0mm, Non-Octa, Regular Neck"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABITHE5800001","model":"IUTH502","name":"IT Healing Abutment","spec":"Ø5.8*2.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABITHE5800002","model":"IUTH503","name":"IT Healing Abutment","spec":"Ø5.8*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABITHE5800003","model":"IUTH504","name":"IT Healing Abutment","spec":"Ø5.8*4.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABITHE7200004","model":"ITHW702","name":"IT WN Healing Abutment","spec":"Ø7.2*2.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABITHE7200005","model":"ITHW703","name":"IT WN Healing Abutment","spec":"Ø7.2*3.0mm"},{"cat":"Abutment","cls":"Healing Abutment","no":"1THCPABITHE7200006","model":"ITHW704","name":"IT WN Healing Abutment","spec":"Ø7.2*4.0mm"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITPA3500001","model":"IAO310A","name":"IT Pre Angled Abutment","spec":"Ø3.7, 15°, A-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITPA3500002","model":"IAO320A","name":"IT Pre Angled Abutment","spec":"Ø3.7, 25°, A-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITPA3500004","model":"IAO310B","name":"IT Pre Angled Abutment","spec":"Ø3.7, 15°, B-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITPA3500005","model":"IAO320B","name":"IT Pre Angled Abutment","spec":"Ø3.7, 25°, B-Type, Regular Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITPA4300003","model":"IAOW500A","name":"IT Pre Angled Abutment","spec":"Ø4.3, 15°, A-Type, Wide Neck"},{"cat":"Abutment","cls":"Angled Abutment","no":"1THCPABITPA4300006","model":"IAOW500B","name":"IT Pre Angled Abutment","spec":"Ø4.3, 15°, B-Type, Wide Neck"},{"cat":"Abutment","cls":"Solid Abutment","no":"1THCPABITSO3500001","model":"ITSR55","name":"IT Solid Abutment","spec":"Ø3.5, L:5.5mm, Regular Neck"},{"cat":"Abutment","cls":"Solid Abutment","no":"1THCPABITSO4300002","model":"ITSW55","name":"IT Solid Abutment","spec":"Ø4.3, L:5.5mm, Wide Neck"},{"cat":"Abutment","cls":"Solid Abutment","no":"1THCPABITSO4300004","model":"ITSW40","name":"IT WN Solid Abutment","spec":"Ø4.3, L:4.0mm"},{"cat":"Other","cls":"Link","no":"1THCPCCISLI4000001","model":"ISLKH4035NB","name":"IS Link","spec":"Ø4.0, L:3.5mm, Hex"},{"cat":"Other","cls":"Link","no":"1THCPCCISLI4000004","model":"ISLKN4035NB","name":"IS Link","spec":"Ø4.0, L:3.5mm, Non-Hex"},{"cat":"Other","cls":"Link","no":"1THCPCCISLI4000007","model":"ISLKS4035NB","name":"IS Link","spec":"Ø4.0, L:3.5mm, SCRP"},{"cat":"Other","cls":"Link","no":"1THCPCCISLI4500002","model":"ISLKH4535NB","name":"IS Link","spec":"Ø4.5, L:3.5mm, Hex"},{"cat":"Other","cls":"Link","no":"1THCPCCISLI4500003","model":"ISLKH5035NB","name":"IS Link","spec":"Ø5.0, L:3.5mm, Hex"},{"cat":"Other","cls":"Link","no":"1THCPCCISLI4500005","model":"ISLKN4535NB","name":"IS Link","spec":"Ø4.5, L:3.5mm, Non-Hex"},{"cat":"Other","cls":"Link","no":"1THCPCCISLI4500006","model":"ISLKN5035NB","name":"IS Link","spec":"Ø5.0, L:3.5mm, Non-Hex"},{"cat":"Other","cls":"Link","no":"1THCPCCISLI4500008","model":"ISLKS4535NB","name":"IS Link","spec":"Ø4.5, L:3.5mm SCRP"},{"cat":"Other","cls":"Link","no":"1THCPCCISLI4500009","model":"ISLKS5035NB","name":"IS Link","spec":"Ø5.0, L:3.5mm, SCRP"},{"cat":"Other","cls":"Block","no":"1THCPCCISTB1000002","model":"ISBKH10NBD","name":"IS Ti Block","spec":"Ø10.0, Hex"},{"cat":"Other","cls":"Block","no":"1THCPCCISTB1000007","model":"ISBKN10NBD","name":"IS Ti Block","spec":"Ø10.0, Non-Hex"},{"cat":"Other","cls":"Block","no":"1THCPCCISTB1400003","model":"ISBKH14NBD","name":"IS Ti Block","spec":"Ø14.0, Hex"},{"cat":"Other","cls":"Link","no":"1THCPCCITLI5500001","model":"ITLKO5535NB","name":"IT Link","spec":"Ø5.5, L:3.5mm, Octa, Regular Neck"},{"cat":"Other","cls":"Link","no":"1THCPCCITLI5500002","model":"ITLKN5535NB","name":"IT Link","spec":"Ø5.5, L:3.5mm, Non-Octa, Regular Neck"},{"cat":"Other","cls":"Block","no":"1THCPCCITTI1000001","model":"ITBKO3110","name":"IT Ti Block","spec":"Ø10.0, L:31.95mm, Octa, Regular Neck"},{"cat":"Other","cls":"Block","no":"1THCPCCITTI1000003","model":"ITBKO3110W","name":"IT Ti Block","spec":"Ø10.0, L:32.05mm, Octa, Wide Neck"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA2200001","model":"ISLA455","name":"IS Abutment Level Lab Analog","spec":"Ø4.5, L:5.5mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA3200001","model":"ISLA300","name":"IS Fixture Level Lab Analog","spec":"Ø3.2"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA3800002","model":"ISLA470","name":"IS Abutment Level Lab Analog","spec":"Ø4.5, L:7.0mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA3800003","model":"ISLA500","name":"IS Fixture Level Lab Analog","spec":"Ø4.3"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA3800022","model":"ISLA400","name":"IS Fixture Level Lab Analog","spec":"Ø3.8"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPCOISLA4000029","model":"SGISLA400","name":"Surgical Guide IS Lab Analog","spec":"Narrow"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA4500007","model":"ISLA540","name":"IS Abutment Level Lab Analog","spec":"Ø5.2, L:4.0mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA4500009","model":"ISLA555","name":"IS Abutment Level Lab Analog","spec":"Ø5.2, L:5.5mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA4500010","model":"ISLA570","name":"IS Abutment Level Lab Analog","spec":"Ø5.2, L:7.0mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA4500027","model":"ISLA440","name":"IS Abutment Level Lab Analog","spec":"Ø4.5, L:4.0mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA4800021","model":"MUALA48","name":"Multi Unit Abutment Lab Analog","spec":"Ø4.8"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPCOISLA5000030","model":"SGISLA500","name":"Surgical Guide IS Lab Analog","spec":"Regular, Wide"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA5200013","model":"ISLA640","name":"IS Abutment Level Lab Analog","spec":"Ø5.7, L:4.0mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA5200015","model":"ISLA655","name":"IS Abutment Level Lab Analog","spec":"Ø5.7, L:5.5mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA5200016","model":"ISLA670","name":"IS Abutment Level Lab Analog","spec":"Ø5.7, L:7.0mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA5200017","model":"ISLA740","name":"IS Abutment Level Lab Analog","spec":"Ø6.5, L:4.0mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA5700019","model":"ISLA755","name":"IS Abutment Level Lab Analog","spec":"Ø6.5, L:5.5mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOISLA5700020","model":"ISLA770","name":"IS Abutment Level Lab Analog","spec":"Ø6.5, L:7.0mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPI6500007","model":"ISPIC711","name":"IS Plastic Impression Coping Cap","spec":"Ø6.5, Purple"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPL4500001","model":"ISPCN410","name":"IS Plastic Coping","spec":"Ø4.5, Bridge, White"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPL4500011","model":"ISPCH410","name":"IS Plastic Coping","spec":"Ø4.5, Single, Red"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPL5200002","model":"ISPCN510","name":"IS Plastic Coping","spec":"Ø5.2, Bridge, White"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPL5200012","model":"ISPCH510","name":"IS Plastic Coping","spec":"Ø5.2, Single, Red"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPL5700003","model":"ISPCN610","name":"IS Plastic Coping","spec":"Ø5.7, Bridge, White"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPL5700013","model":"ISPCH610","name":"IS Plastic Coping","spec":"Ø5.7, Single, Red"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPL6500004","model":"ISPCN710","name":"IS Plastic Coping","spec":"Ø6.5, Bridge, White"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPL6500014","model":"ISPCH710","name":"IS Plastic Coping","spec":"Ø6.5, Single, Red"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR4500001","model":"ISPTC445","name":"IS Protective Cap","spec":"Ø4.5*4.5mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR4500002","model":"ISPTC455","name":"IS Protective Cap","spec":"Ø4.5*5.5mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR4500003","model":"ISPTC470","name":"IS Protective Cap","spec":"Ø4.5*7.0mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR5200005","model":"ISPTC545","name":"IS Protective Cap","spec":"Ø5.2*4.5mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR5200006","model":"ISPTC555","name":"IS Protective Cap","spec":"Ø5.2*5.5mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR5200007","model":"ISPTC570","name":"IS Protective Cap","spec":"Ø5.2*7.0mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR5700009","model":"ISPTC645","name":"IS Protective Cap","spec":"Ø5.7*4.5mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR5700010","model":"ISPTC655","name":"IS Protective Cap","spec":"Ø5.7*5.5mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR5700011","model":"ISPTC670","name":"IS Protective Cap","spec":"Ø5.7*7.0mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR6500013","model":"ISPTC745","name":"IS Protective Cap","spec":"Ø6.5*4.5mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR6500014","model":"ISPTC755","name":"IS Protective Cap","spec":"Ø6.5*5.5mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOISPR6500015","model":"ISPTC770","name":"IS Protective Cap","spec":"Ø6.5*7.0mm"},{"cat":"Abutment","cls":"Temporary Abutment","no":"1THCPCOISTC4800001","model":"MUATPCN48","name":"Multi Unit Temporary Cylinder","spec":"Ø4.8"},{"cat":"Other","cls":"Plastic","no":"1THCPCOITIM6000001","model":"ITEIC00","name":"IT Ex Solid Impression.Cap","spec":"Ø6.0, L:8.2mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOITLA5700004","model":"ITAW40","name":"IT WN Lab Analog (Abut. Level)","spec":"4.0mm, Yellow"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOITLA6500005","model":"ITAW55","name":"IT WN Lab Analog (Abut. Level)","spec":"5.5mm, Metal"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOITLA6500009","model":"ITLA50","name":"IT Fixture Level Lab Analog","spec":"Ø4.8, L:12.5mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOITLA6500010","model":"ITLA70","name":"IT Fixture Level Lab Analog","spec":"Ø6.5, L:12.0mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOITPO5000004","model":"ITEPC40","name":"IT Ex Solid Positinoing Cylinder","spec":"4.0mm, Yellow"},{"cat":"Other","cls":"Plastic","no":"1THCPCOITPR5500001","model":"ITPR55","name":"IT Protective Cap","spec":"5.5mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOITPR5500002","model":"ITPR40","name":"IT Protective Cap","spec":"4.0mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOITPR5500003","model":"ITPR70","name":"IT Protective Cap","spec":"7.0mm"},{"cat":"Other","cls":"Plastic","no":"1THCPCOITPR5500004","model":"ITYR40","name":"IT Positioning Cylinder","spec":"4.0mm, Yellow"},{"cat":"Other","cls":"Plastic","no":"1THCPCOITPR5700007","model":"ITIR00","name":"Plastic Impression Coping Cap","spec":"Ø5.7, L:8.1mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOITSH4800001","model":"ITAS00","name":"IT System Shoulder Analog","spec":"Ø4.8"},{"cat":"Other","cls":"Plastic","no":"1THCPCOITSP6500002","model":"ITNPC","name":"IT Ex Solid Plastic Coping","spec":"Bridge"},{"cat":"Other","cls":"Plastic","no":"1THCPCOITSP6500003","model":"ITPRBR","name":"IT Solid Plastic Coping","spec":"Bridge"},{"cat":"Other","cls":"Plastic","no":"1THCPCOITSP6500004","model":"ITPRCR","name":"IT Solid Plastic Coping","spec":"Single"},{"cat":"Other","cls":"Plastic","no":"1THCPCOMIIM5000001","model":"MICIMP","name":"S-Mini Impression Cap","spec":"L:8.4mm"},{"cat":"Abutment","cls":"Ball Abutment","no":"1THCPCOMILA3500001","model":"BALA350","name":"Ball Lab Analog","spec":"Ø3.5"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOMILA5000002","model":"MICLAB01","name":"S-Mini Lab Analog","spec":"L:10.0mm"},{"cat":"Other","cls":"Lab analog","no":"1THCPCOMILA5000003","model":"MICLAB02","name":"S-Mini Modifying Lab Analog","spec":"L:6.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA3200106","model":"IS3SN3008AP","name":"IS-III active Fixture","spec":"Ø3.2*8.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA3200107","model":"IS3SN3010AP","name":"IS-III active Fixture","spec":"Ø3.2*10.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA3200108","model":"IS3SN3011AP","name":"IS-III active Fixture","spec":"Ø3.2*11.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA3200109","model":"IS3SN3013AP","name":"IS-III active Fixture","spec":"Ø3.2*13.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA3500001","model":"IS33508AP","name":"IS-III active Fixture","spec":"Ø3.5*8.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA3500002","model":"IS33510AP","name":"IS-III active Fixture","spec":"Ø3.5*10.0mm"},{"cat":"Fixture","cls":"Fixture","no":"1THCPFIISSA3500003","model":"IS33511AP","name":"IS-III active Fixture","spec":"Ø3.5*11.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA3500004","model":"IS33513AP","name":"IS-III active Fixture","spec":"Ø3.5*13.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA4000006","model":"IS34007AP","name":"IS-III active Fixture","spec":"Ø4.0*7.3mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA4000007","model":"IS34008AP","name":"IS-III active Fixture","spec":"Ø4.0*8.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA4000008","model":"IS34010AP","name":"IS-III active Fixture","spec":"Ø4.0*10.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA4000009","model":"IS34011AP","name":"IS-III active Fixture","spec":"Ø4.0*11.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA4000010","model":"IS34013AP","name":"IS-III active Fixture","spec":"Ø4.0*13.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA4500012","model":"IS34507AP","name":"IS-III active Fixture","spec":"Ø4.5*7.3mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA4500013","model":"IS34508AP","name":"IS-III active Fixture","spec":"Ø4.5*8.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA4500014","model":"IS34510AP","name":"IS-III active Fixture","spec":"Ø4.5*10.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA4500015","model":"IS34511AP","name":"IS-III active Fixture","spec":"Ø4.5*11.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA4500016","model":"IS34513AP","name":"IS-III active Fixture","spec":"Ø4.5*13.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5000018","model":"IS35007AP","name":"IS-III active Fixture","spec":"Ø5.0*7.3mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5000019","model":"IS35008AP","name":"IS-III active Fixture","spec":"Ø5.0*8.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5000020","model":"IS35010AP","name":"IS-III active Fixture","spec":"Ø5.0*10.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5000021","model":"IS35011AP","name":"IS-III active Fixture","spec":"Ø5.0*11.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5000022","model":"IS35013AP","name":"IS-III active Fixture","spec":"Ø5.0*13.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5000086","model":"IS35006AP","name":"IS-III active Short Fixture","spec":"Ø5.0*6.6mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5500024","model":"IS35507AP","name":"IS-III active Fixture","spec":"Ø5.5*7.3mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5500025","model":"IS35508AP","name":"IS-III active Fixture","spec":"Ø5.5*8.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5500026","model":"IS35510AP","name":"IS-III active Fixture","spec":"Ø5.5*10.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5500027","model":"IS35511AP","name":"IS-III active Fixture","spec":"Ø5.5*11.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5500028","model":"IS35513AP","name":"IS-III active Fixture","spec":"Ø5.5*13.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA5500093","model":"IS35506AP","name":"IS-III active Short Fixture","spec":"Ø5.5*6.6mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA6000030","model":"IS36007AP","name":"IS-III active Fixture","spec":"Ø6.0*7.3mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA6000031","model":"IS36008AP","name":"IS-III active Fixture","spec":"Ø6.0*8.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA6000032","model":"IS36010AP","name":"IS-III active Fixture","spec":"Ø6.0*10.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA6000033","model":"IS36011AP","name":"IS-III active Fixture","spec":"Ø6.0*11.5mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA6000034","model":"IS36013AP","name":"IS-III active Fixture","spec":"Ø6.0*13.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISSA6000099","model":"IS36006AP","name":"IS-III active Short Fixture","spec":"Ø6.0*6.6mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA3500122","model":"BIS3508A","name":"IS-II active Fixture-Narrow","spec":"Ø3.5*8.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA3500123","model":"BIS3510A","name":"IS-II active Fixture-Narrow","spec":"Ø3.5*10.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA3500124","model":"BIS3511A","name":"IS-II active Fixture-Narrow","spec":"Ø3.5*11.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA3500125","model":"BIS3513A","name":"IS-II active Fixture-Narrow","spec":"Ø3.5*13.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA4000126","model":"BIS4007A","name":"IS-II active Fixture-Regular","spec":"Ø4.0*7.3mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA4000127","model":"BIS4008A","name":"IS-II active Fixture-Regular","spec":"Ø4.0*8.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA4000128","model":"BIS4010A","name":"IS-II active Fixture-Regular","spec":"Ø4.0*10.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA4000129","model":"BIS4011A","name":"IS-II active Fixture-Regular","spec":"Ø4.0*11.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA4000130","model":"BIS4013A","name":"IS-II active Fixture-Regular","spec":"Ø4.0*13.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA4500131","model":"BIS4507A","name":"IS-II active Fixture-Regular","spec":"Ø4.5*7.3mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA4500132","model":"BIS4508A","name":"IS-II active Fixture-Regular","spec":"Ø4.5*8.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA4500133","model":"BIS4510A","name":"IS-II active Fixture-Regular","spec":"Ø4.5*10.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA4500134","model":"BIS4511A","name":"IS-II active Fixture-Regular","spec":"Ø4.5*11.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA4500135","model":"BIS4513A","name":"IS-II active Fixture-Regular","spec":"Ø4.5*13.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5000095","model":"BIS5005A","name":"IS-II active Fixture-Wide","spec":"Ø5.0*5.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5000096","model":"BIS5006A","name":"IS-II active Fixture-Wide","spec":"Ø5.0*6.0mm"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5000136","model":"BIS5007A","name":"IS-II active Fixture-Wide","spec":"Ø5.0*7.3mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5000137","model":"BIS5008A","name":"IS-II active Fixture-Wide","spec":"Ø5.0*8.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5000138","model":"BIS5010A","name":"IS-II active Fixture-Wide","spec":"Ø5.0*10.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5000139","model":"BIS5011A","name":"IS-II active Fixture-Wide","spec":"Ø5.0*11.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5000140","model":"BIS5013A","name":"IS-II active Fixture-Wide","spec":"Ø5.0*13.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5500105","model":"BIS5505A","name":"IS-II active Fixture-Wide","spec":"Ø5.5*5.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5500106","model":"BIS5506A","name":"IS-II active Fixture-Wide","spec":"Ø5.5*6.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5500141","model":"BIS5507A","name":"IS-II active Fixture-S-Wide","spec":"Ø5.5*7.3mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5500142","model":"BIS5508A","name":"IS-II active Fixture-S-Wide","spec":"Ø5.5*8.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5500143","model":"BIS5510A","name":"IS-II active Fixture-S-Wide","spec":"Ø5.5*10.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5500144","model":"BIS5511A","name":"IS-II active Fixture-S-Wide","spec":"Ø5.5*11.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA5500145","model":"BIS5513A","name":"IS-II active Fixture-S-Wide","spec":"Ø5.5*13.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA6000146","model":"BIS6007A","name":"IS-II active Fixture-S-Wide","spec":"Ø6.0*7.3mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA6000147","model":"BIS6008A","name":"IS-II active Fixture-S-Wide","spec":"Ø6.0*8.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA6000148","model":"BIS6010A","name":"IS-II active Fixture-S-Wide","spec":"Ø6.0*10.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA6000149","model":"BIS6011A","name":"IS-II active Fixture-S-Wide","spec":"Ø6.0*11.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA6000150","model":"BIS6013A","name":"IS-II active Fixture-S-Wide","spec":"Ø6.0*13.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA7000151","model":"BIS7007A","name":"IS-II active Fixture-S-Wide","spec":"Ø7.0*7.3mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA7000152","model":"BIS7008A","name":"IS-II active Fixture-S-Wide","spec":"Ø7.0*8.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA7000153","model":"BIS7010A","name":"IS-II active Fixture-S-Wide","spec":"Ø7.0*10.0mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA7000154","model":"BIS7011A","name":"IS-II active Fixture-S-Wide","spec":"Ø7.0*11.5mm, 2.5Hex"},{"cat":"Other","cls":"Fixture","no":"1THCPFIISTA7000155","model":"BIS7013A","name":"IS-II active Fixture-S-Wide","spec":"Ø7.0*13.0mm, 2.5Hex"},{"cat":"Other","cls":"","no":"1THCPFIITSA3500001","model":"IT313508AP","name":"IT-III active Fixture","spec":"Ø3.5*8.5mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA3500002","model":"IT313510AP","name":"IT-III active Fixture","spec":"Ø3.5*10.0mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA3500003","model":"IT313511AP","name":"IT-III active Fixture","spec":"Ø3.5*11.5mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA3500004","model":"IT313513AP","name":"IT-III active Fixture","spec":"Ø3.5*13.0mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA3500024","model":"IT323508AP","name":"IT-III active Fixture","spec":"Ø3.5*8.5mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA3500025","model":"IT323510AP","name":"IT-III active Fixture","spec":"Ø3.5*10.0mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA3500026","model":"IT323511AP","name":"IT-III active Fixture","spec":"Ø3.5*11.5mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA3500027","model":"IT323513AP","name":"IT-III active Fixture","spec":"Ø3.5*13.0mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4000006","model":"IT314007AP","name":"IT-III active Fixture","spec":"Ø4.0*7.0mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4000007","model":"IT314008AP","name":"IT-III active Fixture","spec":"Ø4.0*8.5mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4000008","model":"IT314010AP","name":"IT-III active Fixture","spec":"Ø4.0*10.0mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4000009","model":"IT314011AP","name":"IT-III active Fixture","spec":"Ø4.0*11.5mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4000010","model":"IT314013AP","name":"IT-III active Fixture","spec":"Ø4.0*13.0mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4000029","model":"IT324007AP","name":"IT-III active Fixture","spec":"Ø4.0*7.0mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4000030","model":"IT324008AP","name":"IT-III active Fixture","spec":"Ø4.0*8.5mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4000031","model":"IT324010AP","name":"IT-III active Fixture","spec":"Ø4.0*10.0mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4000032","model":"IT324011AP","name":"IT-III active Fixture","spec":"Ø4.0*11.5mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4000033","model":"IT324013AP","name":"IT-III active Fixture","spec":"Ø4.0*13.0mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4500012","model":"IT314507AP","name":"IT-III active Fixture","spec":"Ø4.5*7.0mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4500013","model":"IT314508AP","name":"IT-III active Fixture","spec":"Ø4.5*8.5mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4500014","model":"IT314510AP","name":"IT-III active Fixture","spec":"Ø4.5*10.0mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4500015","model":"IT314511AP","name":"IT-III active Fixture","spec":"Ø4.5*11.5mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4500016","model":"IT314513AP","name":"IT-III active Fixture","spec":"Ø4.5*13.0mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4500035","model":"IT324507AP","name":"IT-III active Fixture","spec":"Ø4.5*7.0mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4500036","model":"IT324508AP","name":"IT-III active Fixture","spec":"Ø4.5*8.5mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4500037","model":"IT324510AP","name":"IT-III active Fixture","spec":"Ø4.5*10.0mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4500038","model":"IT324511AP","name":"IT-III active Fixture","spec":"Ø4.5*11.5mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA4500039","model":"IT324513AP","name":"IT-III active Fixture","spec":"Ø4.5*13.0mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000018","model":"IT315007AP","name":"IT-III active Fixture","spec":"Ø5.0*7.0mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000019","model":"IT315008AP","name":"IT-III active Fixture","spec":"Ø5.0*8.5mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000020","model":"IT315010AP","name":"IT-III active Fixture","spec":"Ø5.0*10.0mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000021","model":"IT315011AP","name":"IT-III active Fixture","spec":"Ø5.0*11.5mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000022","model":"IT315013AP","name":"IT-III active Fixture","spec":"Ø5.0*13.0mm, G1.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000041","model":"IT325007AP","name":"IT-III active Fixture","spec":"Ø5.0*7.0mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000042","model":"IT325008AP","name":"IT-III active Fixture","spec":"Ø5.0*8.5mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000043","model":"IT325010AP","name":"IT-III active Fixture","spec":"Ø5.0*10.0mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000044","model":"IT325011AP","name":"IT-III active Fixture","spec":"Ø5.0*11.5mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000045","model":"IT325013AP","name":"IT-III active Fixture","spec":"Ø5.0*13.0mm, G2.8/R"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000047","model":"ITW315007AP","name":"IT-III active Fixture","spec":"Ø5.0*7.0mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000048","model":"ITW315008AP","name":"IT-III active Fixture","spec":"Ø5.0*8.5mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000049","model":"ITW315010AP","name":"IT-III active Fixture","spec":"Ø5.0*10.0mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000050","model":"ITW315011AP","name":"IT-III active Fixture","spec":"Ø5.0*11.5mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000051","model":"ITW315013AP","name":"IT-III active Fixture","spec":"Ø5.0*13.0mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000069","model":"ITW325007AP","name":"IT-III active Fixture","spec":"Ø5.0*7.0mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000070","model":"ITW325008AP","name":"IT-III active Fixture","spec":"Ø5.0*8.5mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000071","model":"ITW325010AP","name":"IT-III active Fixture","spec":"Ø5.0*10.0mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000072","model":"ITW325011AP","name":"IT-III active Fixture","spec":"Ø5.0*11.5mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5000073","model":"ITW325013AP","name":"IT-III active Fixture","spec":"Ø5.0*13.0mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5500053","model":"ITW315507AP","name":"IT-III active Fixture","spec":"Ø5.5*7.0mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5500054","model":"ITW315508AP","name":"IT-III active Fixture","spec":"Ø5.5*8.5mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5500055","model":"ITW315510AP","name":"IT-III active Fixture","spec":"Ø5.5*10.0mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5500056","model":"ITW315511AP","name":"IT-III active Fixture","spec":"Ø5.5*11.5mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5500057","model":"ITW315513AP","name":"IT-III active Fixture","spec":"Ø5.5*13.0mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5500075","model":"ITW325507AP","name":"IT-III active Fixture","spec":"Ø5.5*7.0mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5500076","model":"ITW325508AP","name":"IT-III active Fixture","spec":"Ø5.5*8.5mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5500077","model":"ITW325510AP","name":"IT-III active Fixture","spec":"Ø5.5*10.0mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5500078","model":"ITW325511AP","name":"IT-III active Fixture","spec":"Ø5.5*11.5mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA5500079","model":"ITW325513AP","name":"IT-III active Fixture","spec":"Ø5.5*13.0mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA6000059","model":"ITW316007AP","name":"IT-III active Fixture","spec":"Ø6.0*7.0mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA6000060","model":"ITW316008AP","name":"IT-III active Fixture","spec":"Ø6.0*8.5mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA6000061","model":"ITW316010AP","name":"IT-III active Fixture","spec":"Ø6.0*10.0mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA6000062","model":"ITW316011AP","name":"IT-III active Fixture","spec":"Ø6.0*11.5mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA6000063","model":"ITW316013AP","name":"IT-III active Fixture","spec":"Ø6.0*13.0mm, G1.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA6000081","model":"ITW326007AP","name":"IT-III active Fixture","spec":"Ø6.0*7.0mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA6000082","model":"ITW326008AP","name":"IT-III active Fixture","spec":"Ø6.0*8.5mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA6000083","model":"ITW326010AP","name":"IT-III active Fixture","spec":"Ø6.0*10.0mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA6000084","model":"ITW326011AP","name":"IT-III active Fixture","spec":"Ø6.0*11.5mm, G2.8/W"},{"cat":"Other","cls":"","no":"1THCPFIITSA6000085","model":"ITW326013AP","name":"IT-III active Fixture","spec":"Ø6.0*13.0mm, G2.8/W"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR2500006","model":"MI2508L","name":"S-Mini Fixture-Cement type","spec":"Ø2.5*8.5mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR2500007","model":"MI2510L","name":"S-Mini Fixture-Cement type","spec":"Ø2.5*10.0mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR2500008","model":"MI2511L","name":"S-Mini Fixture-Cement type","spec":"Ø2.5*11.5mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR2500009","model":"MI2513L","name":"S-Mini Fixture-Cement type","spec":"Ø2.5*13.0mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR2500010","model":"MI2515L","name":"S-Mini Fixture-Cement type","spec":"Ø2.5*15.0mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR3000011","model":"MI3008L","name":"S-Mini Fixture-Cement type","spec":"Ø3.0*8.5mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR3000012","model":"MI3010L","name":"S-Mini Fixture-Cement type","spec":"Ø3.0*10.0mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR3000013","model":"MI3011L","name":"S-Mini Fixture-Cement type","spec":"Ø3.0*11.5mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR3000014","model":"MI3013L","name":"S-Mini Fixture-Cement type","spec":"Ø3.0*13.0mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR3000015","model":"MI3015L","name":"S-Mini Fixture-Cement type","spec":"Ø3.0*15.0mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Ball Type","no":"1THCPFIMIOR3000031","model":"MIB30083","name":"S-Mini Fixture-Ball type","spec":"Ø3.0*8.5mm, C:3.0mm"},{"cat":"Fixture","cls":"S-mini Ball Type","no":"1THCPFIMIOR3000032","model":"MIB30103","name":"S-Mini Fixture-Ball type","spec":"Ø3.0*10.0mm, C:3.0mm"},{"cat":"Fixture","cls":"S-mini Ball Type","no":"1THCPFIMIOR3000033","model":"MIB30113","name":"S-Mini Fixture-Ball type","spec":"Ø3.0*11.5mm, C:3.0mm"},{"cat":"Fixture","cls":"S-mini Ball Type","no":"1THCPFIMIOR3000035","model":"MIB30153","name":"S-Mini Fixture-Ball type","spec":"Ø3.0*15.0mm, C:3.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR3500016","model":"MI3508L","name":"S-Mini Fixture-Cement type","spec":"Ø3.5*8.5mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR3500017","model":"MI3510L","name":"S-Mini Fixture-Cement type","spec":"Ø3.5*10.0mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR3500018","model":"MI3511L","name":"S-Mini Fixture-Cement type","spec":"Ø3.5*11.5mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR3500019","model":"MI3513L","name":"S-Mini Fixture-Cement type","spec":"Ø3.5*13.0mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Cement Type","no":"1THCPFIMIOR3500020","model":"MI3515L","name":"S-Mini Fixture-Cement type","spec":"Ø3.5*15.0mm, C:2.0mm, P:10.0mm"},{"cat":"Fixture","cls":"S-mini Ball Type","no":"1THCPFIMIOR3500036","model":"MIB35083","name":"S-Mini Fixture-Ball type","spec":"Ø3.5*8.5mm, C:3.0mm"},{"cat":"Fixture","cls":"S-mini Ball Type","no":"1THCPFIMIOR3500037","model":"MIB35103","name":"S-Mini Fixture-Ball type","spec":"Ø3.5*10.0mm, C:3.0mm"},{"cat":"Fixture","cls":"S-mini Ball Type","no":"1THCPFIMIOR3500038","model":"MIB35113","name":"S-Mini Fixture-Ball type","spec":"Ø3.5*11.5mm, C:3.0mm"},{"cat":"Fixture","cls":"S-mini Ball Type","no":"1THCPFIMIOR3500039","model":"MIB35133","name":"S-Mini Fixture-Ball type","spec":"Ø3.5*13.0mm, C:3.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1THCPICETPC5000001","model":"PCILC01","name":"PickCap Impression Large Cap","spec":"3.4mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1THCPICETPC5000004","model":"PCISC01","name":"PickCap Impression Cap","spec":"2.6mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1THCPICISCS1200001","model":"ISPCIS20","name":"IS PickCap Impression Screw","spec":"H:1.2mm, M2.0"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1THCPICISCS1200002","model":"ISPCIS16","name":"IS PickCap Impression Screw","spec":"H:1.2mm, M1.6"},{"cat":"Other","cls":"Coping","no":"1THCPICISIP4000001","model":"ISPIC411","name":"IS Plastic Impression Coping Cap","spec":"Ø4.5, Yellow"},{"cat":"Other","cls":"Coping","no":"1THCPICISIP5000002","model":"ISPIC511","name":"IS Plastic Impression Coping Cap","spec":"Ø5.2, Green"},{"cat":"Other","cls":"Coping","no":"1THCPICISIP6000003","model":"ISPIC611","name":"IS Plastic Impression Coping Cap","spec":"Ø5.7, Blue"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISMP4800001","model":"MUAIP48","name":"Multi unit abutment Pick-up Impression","spec":"Ø4.8"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISMT4800001","model":"MUAIT48","name":"M-U abut Impression Transfer","spec":"Ø4.8, L:9.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1THCPICISPC3600003","model":"ISSNPCI3505C","name":"IS PickCap Impression","spec":"Ø3.5*5.0mm"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1THCPICISPC4100003","model":"ISSNPCI3507C","name":"IS PickCap Impression","spec":"Ø3.5*7.0mm"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4000001","model":"ISIPH400","name":"IS Pick-up Impression Coping","spec":"Ø4.0, Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4000013","model":"ISIPHL400","name":"IS Pick-up Impression Coping","spec":"Ø4.0, Long, Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4000019","model":"ISIPN400","name":"IS Pick-up Impression Coping","spec":"Ø4.0, Non-Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4000025","model":"ISIPNL400","name":"IS Pick-up Impression Coping","spec":"Ø4.0, Long, Non-Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4000031","model":"ISIPS400","name":"IS Pick-up Impression Coping","spec":"Ø4.0, SCRP"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4500005","model":"ISIPH450","name":"IS Pick-up Impression Coping","spec":"Ø4.5, Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4500015","model":"ISIPHL450","name":"IS Pick-up Impression Coping","spec":"Ø4.5, Long, Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4500021","model":"ISIPN450","name":"IS Pick-up Impression Coping","spec":"Ø4.5, Non-Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4500027","model":"ISIPNL450","name":"IS Pick-up Impression Coping","spec":"Ø4.5, Long, Non-Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4500033","model":"ISIPS450","name":"IS Pick-up Impression Coping","spec":"Ø4.5, SCRP"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4800002","model":"ISIPH411","name":"IS Pick-up Impression Coping","spec":"Ø4.8, Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4800014","model":"ISIPHL411","name":"IS Pick-up Impression Coping","spec":"Ø4.8, Long, Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4800020","model":"ISIPN411","name":"IS Pick-up Impression Coping","spec":"Ø4.8, Non-Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU4800026","model":"ISIPNL411","name":"IS Pick-up Impression Coping","spec":"Ø4.8, Long, Non-Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU5500006","model":"ISIPH511","name":"IS Pick-up Impression Coping","spec":"Ø5.5, Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU5500016","model":"ISIPHL511","name":"IS Pick-up Impression Coping","spec":"Ø5.5, Long, Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU5500022","model":"ISIPN511","name":"IS Pick-up Impression Coping","spec":"Ø5.5, Non-Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU5500028","model":"ISIPNL511","name":"IS Pick-up Impression Coping","spec":"Ø5.5, Long, Non-Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU6000009","model":"ISIPH611","name":"IS Pick-up Impression Coping","spec":"Ø6.0, Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU6000017","model":"ISIPHL611","name":"IS Pick-up Impression Coping","spec":"Ø6.0, Long, Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU6000023","model":"ISIPN611","name":"IS Pick-up Impression Coping","spec":"Ø6.0, Non-Hex"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICISPU6000029","model":"ISIPNL611","name":"IS Pick-up Impression Coping","spec":"Ø6.0, Long, Non-Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR4800001","model":"ISITH411","name":"IS Transfer Impression Coping","spec":"Ø4.8, Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR4800011","model":"ISITHL411","name":"IS Transfer Impression Coping","spec":"Ø4.8, Long, Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR4800015","model":"ISITN411","name":"IS Transfer Impression Coping","spec":"Ø4.8, Non-Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR4800019","model":"ISITNL411","name":"IS Transfer Impression Coping","spec":"Ø4.8, Long, Non-Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR5500004","model":"ISITH511","name":"IS Transfer Impression Coping","spec":"Ø5.5, Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR5500012","model":"ISITHL511","name":"IS Transfer Impression Coping","spec":"Ø5.5, Long, Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR5500016","model":"ISITN511","name":"IS Transfer Impression Coping","spec":"Ø5.5, Non-Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR5500020","model":"ISITNL511","name":"IS Transfer Impression Coping","spec":"Ø5.5, Long, Non-Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR6000007","model":"ISITH611","name":"IS Transfer Impression Coping","spec":"Ø6.0, Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR6000013","model":"ISITHL611","name":"IS Transfer Impression Coping","spec":"Ø6.0, Long, Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR6000017","model":"ISITN611","name":"IS Transfer Impression Coping","spec":"Ø6.0, Non-Hex"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICISTR6000021","model":"ISITNL611","name":"IS Transfer Impression Coping","spec":"Ø6.0, Long, Non-Hex"},{"cat":"Screw","cls":"Screw","no":"1THCPICISTS2000002","model":"ISTIS20H","name":"IS Transfer Impression Coping Screw","spec":"M2.0, Short, 1.2Hex"},{"cat":"Screw","cls":"Screw","no":"1THCPICISTS2000004","model":"ISTISL20H","name":"IS Transfer Impression Coping Screw","spec":"M2.0, Long, 1.2Hex"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1THCPICITPC5500002","model":"ITPCIB503C","name":"IT PickCap Impression","spec":"Ø5.5*2.5mm, Regular Neck"},{"cat":"Other","cls":"Pick Cap Impression Kit","no":"1THCPICITPC7200005","model":"ITPCIB703C","name":"IT PickCap Impression","spec":"Ø7.2*2.5mm, Wide Neck"},{"cat":"Screw","cls":"Screw","no":"1THCPICITPS2000001","model":"ITPIS20","name":"IT Pick-up Impression Coping Screw","spec":"M2.0, Short"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICITPU5500004","model":"ITIPO511","name":"IT Pick-up Impression Coping","spec":"Ø5.5, Octa"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICITPU5500006","model":"ITIPOL511","name":"IT Pick-up Impression Coping","spec":"Ø5.5, Octa, Long"},{"cat":"Other","cls":"Impression Coping Pick-up type","no":"1THCPICITPU7200005","model":"ITIPO711","name":"IT WN Pick-up Impression Coping","spec":"Ø7.2, Octa"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICITTR5500004","model":"ITITO511","name":"IT Transfer Impression Coping","spec":"Ø5.5, Octa"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICITTR5500006","model":"ITITOL511","name":"IT Transfer Impression Coping","spec":"Ø5.5, Octa, Long"},{"cat":"Other","cls":"Impression Coping Transfer type","no":"1THCPICITTR7200005","model":"ITITO711","name":"IT WN Transfer Impression Coping","spec":"Ø7.2, Octa"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPKIETKT0100001","model":"KITTB","name":"Kit Tray Bottom","spec":"Bottom Plate, Ver.01"},{"cat":"Other","cls":"EZ GBR Kit","no":"1THCPKISUEG0100001","model":"EZGBRKIT","name":"EZ-GBR KIT","spec":"Ver.00(R1)"},{"cat":"Other","cls":"StopDrill Kit","no":"1THCPKISUES0000001","model":"EZSDKIT","name":"EZ-Stop Drill Kit","spec":"Ver.01(R0)"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPKISUNG0100002","model":"NEONGKIT","name":"Neo NaviGuide KIT","spec":"Ver.00(R0)"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPKISUNG0200003","model":"NEONGNKIT","name":"Neo NaviGuide KIT","spec":"Narrow, Ver.00(R0)"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPKISUNG0200008","model":"NEONGNKITTRAY1","name":"Neo NaviGuide Kit Tray","spec":"Upper Plate, Narrow, Ver.00"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPKISUNG0200009","model":"NEONGNKITTRAY2","name":"Neo NaviGuide Kit Tray","spec":"Middle Plate, Narrow, Ver.00"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPKISUNG0200010","model":"NEONGNKITTRAY3","name":"Neo NaviGuide Kit Tray","spec":"Bottom Plate, Narrow, Ver.00"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPKISUNG0400004","model":"NEONGKITTRAY1","name":"Neo NaviGuide KIT Tray","spec":"Upper Plate, Ver.00"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPKISUNG0500005","model":"NEONGKITTRAY2","name":"Neo NaviGuide KIT Tray","spec":"Middle Plate, Ver.00"},{"cat":"Fixture","cls":"S-Wide Kit","no":"1THCPKISUSW0200001","model":"SWKIT2","name":"S-Wide KIT","spec":"Ver.03(R0)"},{"cat":"Screw","cls":"Fixing Screw","no":"1THCPMESCFS1600002","model":"MFS1603","name":"Fixing Screw","spec":"Ø1.6*3.0mm"},{"cat":"Screw","cls":"Fixing Screw","no":"1THCPMESCFS1600004","model":"MFS1605","name":"Fixing Screw","spec":"Ø1.6*5.0mm"},{"cat":"Screw","cls":"Fixing Screw","no":"1THCPMESCFS1600006","model":"MFS1607","name":"Fixing Screw","spec":"Ø1.6*7.0mm"},{"cat":"Screw","cls":"Tent Screw","no":"1THCPMESCTS2000010","model":"CTS2007","name":"Tent Screw","spec":"Ø2.0*7.0mm"},{"cat":"Screw","cls":"Tent Screw","no":"1THCPMESCTS2000012","model":"CTS2010","name":"Tent Screw","spec":"Ø2.0*10.0mm"},{"cat":"Screw","cls":"Tent Screw","no":"1THCPMESCTS2000014","model":"CTS2013","name":"Tent Screw","spec":"Ø2.0*13.0mm"},{"cat":"Other","cls":"Plastic","no":"1THCPTOCOITPR00001","model":"ITPW40","name":"IT WN Protective Cap","spec":"4.0mm"},{"cat":"Other","cls":"Plastic","no":"1THCPTOCOITPR00002","model":"ITPW55","name":"IT WN Protective Cap","spec":"5.5mm"},{"cat":"Other","cls":"Plastic","no":"1THCPTOCOITPR00003","model":"ITPTC40","name":"IT Ex Solid Protective Cap","spec":"4.0mm"},{"cat":"Other","cls":"Plastic","no":"1THCPTOCOITPR00004","model":"ITPTC55","name":"IT Ex Solid Protective Cap","spec":"5.5mm"},{"cat":"Other","cls":"Plastic","no":"1THCPTOCOITPR00005","model":"ITPTC70","name":"IT Protective Cap","spec":"7.0mm"},{"cat":"Other","cls":"Plastic","no":"1THCPTOCOMIPR00001","model":"MICPTC","name":"S-Mini Protective Cap","spec":"L:11.2mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3000001","model":"NGTD3008N","name":"NeoGuide Taper Drill","spec":"Ø3.0, L:8.5mm, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3000002","model":"NGTD3010N","name":"NeoGuide Taper Drill","spec":"Ø3.0, L:10.0mm, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3000003","model":"NGTD3011N","name":"NeoGuide Taper Drill","spec":"Ø3.0, L:11.5mm, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3000004","model":"NGTD3013N","name":"NeoGuide Taper Drill","spec":"Ø3.0, L:13.0mm, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3000005","model":"NGTD3014N","name":"NeoGuide Taper Drill","spec":"Ø3.0, L:14.5mm, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3000012","model":"NGTD3007","name":"NeoGuide Taper Drill","spec":"Ø3.0, L:7.3mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3000013","model":"NGTD3008","name":"NeoGuide Taper Drill","spec":"Ø3.0, L:8.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3000014","model":"NGTD3010","name":"NeoGuide Taper Drill","spec":"Ø3.0, L:10.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3000015","model":"NGTD3011","name":"NeoGuide Taper Drill","spec":"Ø3.0, L:11.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3000016","model":"NGTD3013","name":"NeoGuide Taper Drill","spec":"Ø3.0, L:13.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3500018","model":"NGTD3507","name":"NeoGuide Taper Drill","spec":"Ø3.5, L:7.3mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3500019","model":"NGTD3508","name":"NeoGuide Taper Drill","spec":"Ø3.5, L:8.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3500020","model":"NGTD3510","name":"NeoGuide Taper Drill","spec":"Ø3.5, L:10.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3500021","model":"NGTD3511","name":"NeoGuide Taper Drill","spec":"Ø3.5, L:11.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT3500022","model":"NGTD3513","name":"NeoGuide Taper Drill","spec":"Ø3.5, L:13.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT4000024","model":"NGTD4007","name":"NeoGuide Taper Drill","spec":"Ø4.0, L:7.3mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT4000025","model":"NGTD4008","name":"NeoGuide Taper Drill","spec":"Ø4.0, L:8.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT4000026","model":"NGTD4010","name":"NeoGuide Taper Drill","spec":"Ø4.0, L:10.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT4000027","model":"NGTD4011","name":"NeoGuide Taper Drill","spec":"Ø4.0, L:11.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT4000028","model":"NGTD4013","name":"NeoGuide Taper Drill","spec":"Ø4.0, L:13.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT4500030","model":"NGTD4507","name":"NeoGuide Taper Drill","spec":"Ø4.5, L:7.3mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT4500031","model":"NGTD4508","name":"NeoGuide Taper Drill","spec":"Ø4.5, L:8.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT4500032","model":"NGTD4510","name":"NeoGuide Taper Drill","spec":"Ø4.5, L:10.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT4500033","model":"NGTD4511","name":"NeoGuide Taper Drill","spec":"Ø4.5, L:11.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLGT4500034","model":"NGTD4513","name":"NeoGuide Taper Drill","spec":"Ø4.5, L:13.0mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1THCPTODLLI2300001","model":"LDS23CS","name":"Lindermann Drill","spec":"Ø2.3, L:35.7mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLND4000001","model":"NGCD40F","name":"NeoGuide Cortical Drill","spec":"Fixture, Ø4.0"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLND4500002","model":"NGCD45F","name":"NeoGuide Cortical Drill","spec":"Fixture, Ø4.5"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLND5000003","model":"NGCD50F","name":"NeoGuide Cortical Drill","spec":"Fixture, Ø5.0"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLNT5500001","model":"NGBT00","name":"NeoGuide Bone Trimmer","spec":"Ø5.0, Offset 0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLNT5500002","model":"NGBT30","name":"NeoGuide Bone Trimmer","spec":"Ø5.0, Offset 3.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLNT5500003","model":"NGBT15","name":"NeoGuide Bone Trimmer","spec":"Ø5.0, Offset 1.5mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1THCPTODLPD1300001","model":"PD13","name":"Point Drill","spec":"Ø1.3"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLPO2200001","model":"NGPD22","name":"NeoGuide Point Drill","spec":"Ø2.2"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLPO2200002","model":"NGPD22N","name":"NeoGuide Point Drill","spec":"Ø2.2, Narrow"},{"cat":"Other","cls":"Accessory Kit","no":"1THCPTODLPR5500002","model":"ISBP55","name":"IS Bone Profiler","spec":"Ø5.5"},{"cat":"Other","cls":"Accessory Kit","no":"1THCPTODLPR6000003","model":"ISBP60","name":"IS Bone Profiler","spec":"Ø6.0"},{"cat":"Other","cls":"Neo Master Kit","no":"1THCPTODLTS2700069","model":"TSD27CL","name":"Twist Surgical Drill","spec":"Ø2.7, S-Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLTW2200001","model":"NGTWD2207","name":"NeoGuide Twist Drill","spec":"Ø2.2, L:7.3mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLTW2200002","model":"NGTWD2208","name":"NeoGuide Twist Drill","spec":"Ø2.2, L:8.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLTW2200003","model":"NGTWD2208N","name":"NeoGuide Twist Drill","spec":"Ø2.2, L:8.5mm, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLTW2200004","model":"NGTWD2210","name":"NeoGuide Twist Drill","spec":"Ø2.2, L:10.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLTW2200005","model":"NGTWD2210N","name":"NeoGuide Twist Drill","spec":"Ø2.2, L:10.0mm, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLTW2200006","model":"NGTWD2211","name":"NeoGuide Twist Drill","spec":"Ø2.2, L:11.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLTW2200007","model":"NGTWD2211N","name":"NeoGuide Twist Drill","spec":"Ø2.2, L:11.5mm, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLTW2200008","model":"NGTWD2213","name":"NeoGuide Twist Drill","spec":"Ø2.2, L:13.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLTW2200009","model":"NGTWD2213N","name":"NeoGuide Twist Drill","spec":"Ø2.2, L:13.0mm, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTODLTW2200010","model":"NGTWD2214N","name":"NeoGuide Twist Drill","spec":"Ø2.2, L:14.5mm, Narrow"},{"cat":"Other","cls":"S-mini Kit","no":"1THCPTODRBA2400001","model":"BADH24","name":"Ball Type Driver","spec":"Ball Type, Contra Angle, 2.4Hex"},{"cat":"Other","cls":"IS Full Kit","no":"1THCPTODRHD1200009","model":"HD1210S","name":"Hex Driver-Ratchet","spec":"1.2Hex, L:10.0mm"},{"cat":"Other","cls":"IS Full Kit","no":"1THCPTODRHD1200013","model":"HD1215S","name":"Hex Driver","spec":"1.2Hex, L:15.0mm, Ratchet"},{"cat":"Other","cls":"Neo Master Kit","no":"1THCPTODRIF4000030","model":"ISFDSNCL","name":"IS Fixture Driver","spec":"2.1 Hex, Contra Angle, Long"},{"cat":"Other","cls":"IS Full Kit","no":"1THCPTODRIF5000005","model":"ISFD05C","name":"IS Fixture Driver","spec":"2.5Hex, Contra Angle, Narrow"},{"cat":"Other","cls":"IS Full Kit","no":"1THCPTODRIF5000008","model":"ISFD15R","name":"IS Fixture Driver","spec":"15.0mm"},{"cat":"Other","cls":"Universal Prosthetic Kit","no":"1THCPTODRSC1000001","model":"SCSD10S","name":"SCS Driver","spec":"Ratchet, L:10.0mm"},{"cat":"Other","cls":"Universal Prosthetic Kit","no":"1THCPTODRSC1500002","model":"SCSD15S","name":"SCS Driver","spec":"Ratchet, L:15.0mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1THCPTODRTF4000001","model":"ITFDO31S","name":"IT Fixture Driver","spec":"3.1 Octa, Short, Contra Angle"},{"cat":"Other","cls":"Neo Master Kit","no":"1THCPTODRTF7500002","model":"ITFDO31RL","name":"IT Fixture Driver","spec":"3.1Octa, Long, Ratchet"},{"cat":"Other","cls":"Universal Prosthetic Kit","no":"1THCPTODRUN1000001","model":"UGD10S","name":"Unigrip Driver","spec":"Ratchet, L:10.0mm"},{"cat":"Other","cls":"Universal Prosthetic Kit","no":"1THCPTODRUN1500002","model":"UGD15S","name":"Unigrip Driver","spec":"Ratchet, L:15.0mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIECA3000002","model":"SGCAC00","name":"Sugical Guide Contra Angle Connector","spec":"3.0Hex, Contra Angle"},{"cat":"Other","cls":"IS Full Kit","no":"1THCPTOIEDE0200003","model":"DE01","name":"Drill Extension","spec":"Ø4.5, L:29.5mm"},{"cat":"Other","cls":"Instrument","no":"1THCPTOIEMA4800002","model":"MUAD48S","name":"Multi Unit Abutment Driver","spec":"2.0Hex"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIERC1000006","model":"SGRC10","name":"Surgical Guide Ratchet Connector","spec":"3.0Hex, 10.5mm, Ratchet"},{"cat":"Other","cls":"IS Full Kit","no":"1THCPTOIETQ6000005","model":"TW60","name":"Torque Ratchet Wrench","spec":"10Ncm-60Ncm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGNF5000001","model":"NGISFDCA","name":"NeoGuide IS Fixture Driver","spec":"Contra Angle, Regular, Wide"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGNF5000002","model":"NGISFDCAN","name":"NeoGuide IS Fixture Driver","spec":"Contra Angle, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGNF5000003","model":"NGISFDR","name":"NeoGuide IS Fixture Driver","spec":"Ratchet, Regular, Wide"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGNF5000004","model":"NGISFDRN","name":"NeoGuide IS Fixture Driver","spec":"Ratchet, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGNT4300001","model":"NGTP43R","name":"NeoGuide Tissue Punch","spec":"Ø4.3, Regular"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGSA3000004","model":"SGISFARW30","name":"Surgical Guide IS Fixture Adapter","spec":"."},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGSA5100001","model":"SGISFAN","name":"Surgical Guide IS Fixture Adapter","spec":"Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGSA5100002","model":"SGISFAN30","name":"Surgical Guide IS Fixture Adapter","spec":"Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGSA5100003","model":"SGISFARW","name":"Surgical Guide IS Fixture Adapter","spec":"Regular, Wide"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGSR2000001","model":"SGFART20","name":"Surgical Guide Adapter Removal Tool","spec":"M2.0"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGSS5500002","model":"SGS55N","name":"Surgical Guide Sleeve","spec":"Narrow, Ø5.5, H:3.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGSS7000001","model":"CSGS70RW","name":"Surgical Guide Sleeve","spec":"C-Type, R/W, Ø7.0, H:3.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGSS7000003","model":"SGS70RW","name":"Surgical Guide Sleeve","spec":"Regular Wide, Ø7.0, H:3.5mm"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGSV5500001","model":"SGISVAFRW","name":"Surgical Guide IS Vertical Anchor","spec":"Regular, Wide, Fixture"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOIGSV5500002","model":"SGVABRW","name":"Surgical Guide Vertical Anchor","spec":"Regular, Wide, Bone"},{"cat":"Other","cls":"Neo Master Kit","no":"1THCPTOISDH4800006","model":"DSHCS","name":"Drill Stopper Holder","spec":"S-Narrow"},{"cat":"Other","cls":"Neo Master Kit","no":"1THCPTOISDS3700001","model":"DS085CS","name":"Drill Stopper","spec":"8.5mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1THCPTOISDS3700002","model":"DS100CS","name":"Drill Stopper","spec":"10.0mm"},{"cat":"Other","cls":"Neo Master Kit","no":"1THCPTOISDS3700004","model":"DS130CS","name":"Drill Stopper","spec":"13.0mm"},{"cat":"Screw","cls":"Screw","no":"1THCPTOSBMS2500001","model":"MUASBS14","name":"Multi Unit Abutment Scan Body Screw","spec":"Ø2.5, L:4.1mm"},{"cat":"Other","cls":"Scan Body","no":"1THCPTOSBMS4800001","model":"MUASB48","name":"Multi Unit Abutment Scan Body","spec":"Ø4.8, L:6.0mm"},{"cat":"Other","cls":"Scan Body","no":"1THCPTOSBOS4000022","model":"ISPSBH40NB","name":"IS Oral Scan Body","spec":"Ø4.0, Hex, Narrow"},{"cat":"Other","cls":"Scan Body","no":"1THCPTOSBOS4800018","model":"ITPSBO50","name":"IT Oral Scan Body","spec":"Ø4.8, Octa, Regular"},{"cat":"Other","cls":"Scan Body","no":"1THCPTOSBOS5000023","model":"ISPSBH50NB","name":"IS Oral Scan Body","spec":"Ø5.0, Hex, R/W"},{"cat":"Other","cls":"Scan Body","no":"1THCPTOSBOS6500019","model":"ITPSBO50W","name":"IT Oral Scan Body","spec":"Ø6.5, Octa, Wide"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOTANC3500006","model":"NGISCT35N","name":"NeoGuide Cortical Tap","spec":"IS, Ø3.5, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOTANC3500007","model":"NGISCT35NS","name":"NeoGuide Cortical Tap","spec":"IS, Ø3.5, Narrow"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOTANC4000001","model":"NGISCT40R","name":"NeoGuide Cortical Tap","spec":"IS, Ø4.0, Regular"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOTANC4000005","model":"NGISCT40RS","name":"NeoGuide Cortical Tap","spec":"IS, Ø4.0, Regular"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOTANC4500003","model":"NGISCT45RS","name":"NeoGuide Cortical Tap","spec":"IS, Ø4.5, Regular"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOTANC4500008","model":"NGISCT45R","name":"NeoGuide Cortical Tap","spec":"IS, Ø4.5, Regular"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOTANC5000002","model":"NGISCT50W","name":"NeoGuide Cortical Tap","spec":"IS, Ø5.0, Wide"},{"cat":"Fixture","cls":"NeoGuide Kit","no":"1THCPTOTANC5000004","model":"NGISCT50WS","name":"NeoGuide Cortical Tap","spec":"IS, Ø5.0, Wide"},{"cat":"Other","cls":"Others","no":"1THPRHEOGGMSC00001","model":"SCRB–BLU–S","name":"Scrub Suit (S)_Navy","spec":"Size S (38), Color Navy No.9"},{"cat":"Other","cls":"Others","no":"1THPRHEOGGMSC00002","model":"SCRB–BLU–M","name":"Scrub Suit (M)_Navy","spec":"Size M (40), Color Navy No.9"},{"cat":"Other","cls":"Others","no":"1THPRHEOGGMSC00003","model":"SCRB–PNK–M","name":"Scrub Suit (M)_Pink","spec":"Size M (40), Color Pink No.13"},{"cat":"Other","cls":"Others","no":"1THPRHEOGGMSC00004","model":"SCRB–BLU–L","name":"Scrub Suit (L)_Navy","spec":"Size L (42), Color Navy No.9"},{"cat":"Other","cls":"Others","no":"1THPRHEOGGMSC00005","model":"SCRB–PNK–L","name":"Scrub Suit (L)_Pink","spec":"Size L (42), Color Pink No.13"},{"cat":"Other","cls":"Others","no":"1THPRHEOGGMSC00006","model":"SCRB–BLU–XL","name":"Scrub Suit (XL)_Navy","spec":"Size XL (44), Color Navy No.9"},{"cat":"Other","cls":"Others","no":"1THPRHEOGGMSC00007","model":"SCRB–PNK–XL","name":"Scrub Suit (XL)_Pink","spec":"Size XL (44), Color Pink No.13"},{"cat":"Other","cls":"Others","no":"1THPRHEOGGMSC00008","model":"SCRB–BLU–2XL","name":"Scrub Suit (2XL)_Navy","spec":"Size 2XL (46), Color Navy No.9"},{"cat":"Other","cls":"Others","no":"1THPRHEOGGMSC00009","model":"SCRB–PNK–2XL","name":"Scrub Suit (2XL)_Pink","spec":"Size 2XL (46), Color Pink No.13"},{"cat":"Other","cls":"Others","no":"1THPRHEOGGMSC00010","model":"SCRB–BLU–3XL","name":"Scrub Suit (3XL)_Navy","spec":"Size 3XL (48), Color Navy No.9"},{"cat":"Other","cls":"Others","no":"1THPRHEOGGMSC00012","model":"SCRB–BLU–4XL","name":"Scrub Suit (4XL)_Navy","spec":"Size 4XL (52), Color Navy No.9"},{"cat":"Other","cls":"","no":"2ENPRCCOSMTIS01101","model":"i500 (EXP)","name":"(수출용) Medit i500 Intraoral Scanner","spec":"Local Voltage Applied"},{"cat":"Other","cls":"","no":"2ENPRCCOSMTIS22121","model":"i600_K (EXP)","name":"i600_K (EXP)","spec":"."},{"cat":"Other","cls":"","no":"2ENPRCCOSMTIS22122","model":"i700_K (EXP)","name":"i700_K (EXP)","spec":"."},{"cat":"Other","cls":"","no":"2ENPRETSAMTSA01901","model":"i500 Tip (EXP)","name":"i500 Accessory: Tip","spec":"(수출용) i500 Compatible Tip"},{"cat":"Other","cls":"","no":"2ENPRETSAMTSA02902","model":"i700 USB 3.0 (EXP)","name":"i700 Accessory: USB 3.0 cable","spec":"(수출용) i700 Compatible USB 3.0 cable"},{"cat":"Other","cls":"","no":"2ENPRETSAMTWA00002","model":"i700 Warranty","name":"i700 Warranty","spec":"."},{"cat":"Other","cls":"","no":"2KRPRCCSW3SIS00003","model":"3SHAPE_SOFTWARE 06","name":"Implant Studio Full-Dongle","spec":"."},{"cat":"Other","cls":"","no":"2KRPRETSAMTOS00003","model":"i500 Tip","name":"i500 Tip (Set of 4 pcs)","spec":"."},{"cat":"Other","cls":"","no":"2KRPRETSAMTOS00031","model":"i500 Warranty","name":"i500 Warranty 2년 연장","spec":"."},{"cat":"Other","cls":"","no":"2KRPRSGDG3DDC00001","model":"DentiqGuide STL Coupon Set","name":"DentiqGuide STL Coupon Set","spec":"20 Tickets Per Set"},{"cat":"Other","cls":"","no":"2KRPRSGDG3DDL00001","model":"DentiqGuide License","name":"DentiqGuide License","spec":"."},{"cat":"Other","cls":"","no":"2KRPRSGMDNOGM00001","model":"NNVGCM","name":"가이드상담모형","spec":"-"},{"cat":"Other","cls":"VARO MILL","no":"3KRPRCCMMRDVM00001","model":"VARO Mill","name":"VARO Mill","spec":"."},{"cat":"Other","cls":"","no":"3KRPRCCSW3DVP00001","model":"VARO Plan 동글","name":"VARO Plan 동글","spec":"."},{"cat":"Other","cls":"","no":"3KRPRCCSW3DVP00002","model":"VARO Plan","name":"VARO Plan","spec":"."},{"cat":"Other","cls":"","no":"3KRPRCCSWGCVG00001","model":"VARO Guide용 GO2CAM","name":"VARO Guide 용 GO2CAM","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETGAISPA00051","model":"PGAT","name":"Pre-Guide PGA Trial tray","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETGAISPM00051","model":"PGM13T","name":"Pre-Guide PGM13 Trial tray","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETGAISPM00052","model":"PGM24T","name":"Pre-Guide PGM24 Trial tray","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETGAISPS00051","model":"PGS13T","name":"Pre-Guide PGS13 Trial tray","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETGAISPS00052","model":"PGS24T","name":"Pre-Guide PGS24 Trial tray","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETMADLPC00001","model":"VARO Plan 용 노트북","name":"VARO Plan 용 노트북","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETMAZUBU00001","model":"VARO Mill용 Burr","name":"VARO Mill용 Burr","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETPGISPA00001","model":"PGA","name":"Pre-Guide PGA","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETPGISPM00001","model":"PGM13","name":"Pre-Guide PGM13","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETPGISPM00002","model":"PGM24","name":"Pre-Guide PGM24","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETPGISPS00001","model":"PGS13","name":"Pre-Guide PGS13","spec":"."},{"cat":"Other","cls":"","no":"3KRPRETPGISPS00002","model":"PGS24","name":"Pre-Guide PGS24","spec":"."},{"cat":"Other","cls":"Xenograft","no":"5THSMBNXGMDS100001","model":"MBXB-P021-015","name":"Medpark Bovine-Powder:0.15g(0.3cc)","spec":"."},{"cat":"Other","cls":"Xenograft","no":"5THSMBNXGMDS100002","model":"MBXB-P021-025","name":"Medpark Bovine-Powder:0.25g(0.5cc)","spec":"."},{"cat":"Other","cls":"Xenograft","no":"5THSMBNXGMDS100003","model":"S1-XB-P015","name":"Medpark S1, Bovine-Powder:0.15g(0.3cc)","spec":"."},{"cat":"Other","cls":"Xenograft","no":"5THSMBNXGMDS100004","model":"S1-XB-P025","name":"Medpark S1, Bovine-Powder:0.25g(0.5cc)","spec":"."},{"cat":"Other","cls":"Accessory of oral scanner","no":"5THSMDEDIOSAC00001","model":"Notebook i5","name":"Notebook i5 for Oral scanner","spec":"."},{"cat":"Other","cls":"Accessory of oral scanner","no":"5THSMDEDIOSAC00002","model":"Notebook i7","name":"Notebook i7 for Oral scanner","spec":"."},{"cat":"Other","cls":"Accessory of oral scanner","no":"5THSMDEDIOSAC00003","model":"CART","name":"CART for Oral scanner","spec":"."},{"cat":"Other","cls":"Accessory for Dr.Kim","no":"5THSMDEHLDKAC00001","model":"DCAM-5","name":"Dr.KIM Camera","spec":"."},{"cat":"Other","cls":"Accessory for Dr.Kim","no":"5THSMDEHLDKAC00002","model":"DCAM-4","name":"Dr.KIM Camera","spec":"."},{"cat":"Other","cls":"Accessory for Dr.Kim","no":"5THSMDEHLDKAC00003","model":"DCAM-4SV","name":"Dr.KIM Camera","spec":"."},{"cat":"Other","cls":"Accessory for Dr.Kim","no":"5THSMDEHLDKAC00004","model":"DCAM-4S","name":"Dr.KIM Camera","spec":"."},{"cat":"Other","cls":"Accessory for Dr.Kim","no":"5THSMDEHLDKAC00005","model":"DCAM-3","name":"Dr.KIM Camera","spec":"."},{"cat":"Other","cls":"Accessory for Dr.Kim","no":"5THSMDEHLDKAC00006","model":"HANDLE","name":"Dr.KIM Handle","spec":"."},{"cat":"Other","cls":"Accessory for Dr.Kim","no":"5THSMDEHLDKAC00007","model":"DKSB","name":"Dr.KIM Forehead rest","spec":"."},{"cat":"Other","cls":"Accessory for Dr.Kim","no":"5THSMDEHLDKAC00008","model":"Cap","name":"Dr.KIM Cap","spec":"."},{"cat":"Other","cls":"Accessory for Dr.Kim","no":"5THSMDEHLDKAC00009","model":"Head Rest","name":"Dr.KIM Forehead rest","spec":"."},{"cat":"Other","cls":"Battery for Dr.Kim","no":"5THSMDEHLDKAC00011","model":"DKCG-3","name":"Dr.KIM Battery Charger","spec":"for DKH-30 /40"},{"cat":"Other","cls":"Dr.Kim_Bag","no":"5THSMDEHLDKBG00001","model":"BAG","name":"Dr.KIM Bag","spec":"."},{"cat":"Other","cls":"Dr.Kim_Bag","no":"5THSMDEHLDKBG00002","model":"BAG2","name":"Dr.Kim Bag V.2","spec":"."},{"cat":"Other","cls":"Battery for Dr.Kim","no":"5THSMDEHLDKBT00001","model":"DKBT-1","name":"Dr.KIM Battery","spec":"."},{"cat":"Other","cls":"Battery for Dr.Kim","no":"5THSMDEHLDKBT00002","model":"DKBT-2","name":"Dr.KIM Battery","spec":"."},{"cat":"Other","cls":"Battery for Dr.Kim","no":"5THSMDEHLDKBT00003","model":"DKBT-3","name":"Dr.KIM Battery","spec":"."},{"cat":"Other","cls":"Battery for Dr.Kim","no":"5THSMDEHLDKBT00004","model":"DKCG-1","name":"Dr.KIM Battery Charger","spec":"."},{"cat":"Other","cls":"Battery for Dr.Kim","no":"5THSMDEHLDKBT00005","model":"DKCG-2","name":"Dr.KIM Battery Charger","spec":"."},{"cat":"Other","cls":"Battery for Dr.Kim","no":"5THSMDEHLDKBT00006","model":"Battery cover","name":"Dr.KIM Battery Cover","spec":"."},{"cat":"Other","cls":"Dr.Kim_Head lamp","no":"5THSMDEHLDKLA00001","model":"DKH-30","name":"Dr.KIM Head Lamp","spec":"."},{"cat":"Other","cls":"Dr.Kim_Head lamp","no":"5THSMDEHLDKLA00002","model":"DKH-40","name":"Dr.KIM Head Lamp","spec":"."},{"cat":"Other","cls":"Dr.Kim_Head lamp","no":"5THSMDEHLDKLA00003","model":"DKH-50","name":"Dr.KIM Head Lamp","spec":"."},{"cat":"Other","cls":"Dr.Kim_Head lamp","no":"5THSMDEHLDKLA00004","model":"DKH-50S","name":"Dr.KIM Head Lamp","spec":"."},{"cat":"Other","cls":"Dr.Kim_Head lamp","no":"5THSMDEHLDKLA00005","model":"DKH-60","name":"Dr.KIM Head Lamp","spec":"."},{"cat":"Other","cls":"Dr.Kim_Head lamp","no":"5THSMDEHLDKLA00006","model":"DKH-60S","name":"Dr.KIM Head Lamp","spec":"."},{"cat":"Other","cls":"Dr.Kim_Loupe","no":"5THSMDEHLDKLP00001","model":"DKT-3","name":"Dr.KIM Loupe","spec":"."},{"cat":"Other","cls":"Dr.Kim_Loupe","no":"5THSMDEHLDKLP00002","model":"DKT-3A","name":"Dr.KIM Loupe","spec":"."},{"cat":"Other","cls":"Dr.Kim_Loupe","no":"5THSMDEHLDKLP00003","model":"DKT-4","name":"Dr.KIM Loupe","spec":"."},{"cat":"Other","cls":"Dr.Kim_Loupe","no":"5THSMDEHLDKLP00004","model":"DKT-4A","name":"Dr.KIM Loupe","spec":"."},{"cat":"Other","cls":"Dr.Kim_Loupe","no":"5THSMDEHLDKLP00008","model":"DKL-6","name":"Dr.Kim Loupe","spec":"for DKH-60"},{"cat":"Other","cls":"Dr.Kim_Head lamp","no":"5THSMDEHLDKTI00001","model":"DKH-50 Trade-in","name":"Dr.KIM DKH-50 Trade in","spec":"."},{"cat":"Other","cls":"Dr.Kim_Loupe","no":"5THSMDEHLDKTL00001","model":"DKL-5","name":"Dr.KIM Loupe","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00001","model":"UPS","name":"CT_Accessory_UPS","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00002","model":"UPS 3KV","name":"CT_Accessory_UPS 3KV","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00003","model":"Stabilizer","name":"CT_Accessory_Stabilizer","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00004","model":"Stabilizer 3KV","name":"CT_Accessory_Stabilizer 3KV","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00005","model":"Lead Apron (Adult)","name":"CT_Accessory_Lead Apron (Adult)","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00006","model":"Lead Apron (Child)","name":"CT_Accessory_Lead Apron (Child)","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00007","model":"Lead Sheet","name":"CT_Accessory_Lead Sheet","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00008","model":"Computer PC","name":"CT_Accessory_Computer PC","spec":"Display, CPU, Keyboard, Mouse, UPS"},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00009","model":"Computer Desk","name":"CT_Accessory_Computer Desk","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00010","model":"Keyboard","name":"CT_Accessory_Keyboard","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00011","model":"UPS(SC)","name":"CT_Accessory_UPS 2nd hand","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00012","model":"Stabilizer (SC)","name":"CT_Accessory_Stabilizer 2nd hand","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00013","model":"Keyboard (SC)","name":"CT_Accessory_Keyboard 2nd hand","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00014","model":"Computer Desk (SC)","name":"CT_Accessory_Computer Desk 2nd hand","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00015","model":"X-Ray Shielding Partition","name":"CT_Accessory_X-Ray Shielding Partition","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00016","model":"Lead Apron (Adult) (SC)","name":"CT_Accessory_Lead Apron (Adult) 2nd hand","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00017","model":"UPS 3KV (SC)","name":"CT_Accessory_UPS 3KV 2nd hand","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00018","model":"Stabilizer 3KV (SC)","name":"CT_Accessory_Stabilizer 3KV 2nd hand","spec":"."},{"cat":"Other","cls":"Accessory for X-Ray equipments","no":"5THSMDEIMCTAC00020","model":"Computer PC (SC)","name":"CT_Accessory_Computer PC 2nd hand","spec":"Display, CPU, Keyboard, Mouse, UPS"},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00001","model":"(H)Expose switch","name":"HDX_Spare_ECO-X-S_Expose switch","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00002","model":"(H)HEADREST_BAR","name":"HDX_Spare_ECO-X-S_Headrest bar","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00003","model":"(H)LCD Board [HYBUS]","name":"HDX_Spare_ECO-X-S_LCD board[HYBUS]","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00004","model":"(H)Rotator Belt","name":"HDX_Spare_ECO-X-S_Rotator belt","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00005","model":"(H)HDX Spareparts 1(EXP)","name":"HDX_Spare_ECO-X-S_","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00006","model":"(H)HDX Spareparts 2(EXP)","name":"HDX_Spare_ECO-X-S_","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00007","model":"PX-MAX-153S1P","name":"Battery for remex","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00008","model":"(H)Serial Card","name":"HDX_Spare_ECO-X-S_Serial card","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00009","model":"(H)BRACKET","name":"HDX_Spare_ECO-X-S_Bracket","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00010","model":"(H)CHIN BASE","name":"HDX_Spare_ECO-X-S_Chin base","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00011","model":"(H)SCAN PLATFORM","name":"HDX_Spare_ECO-X-S_Scan platform","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00012","model":"(H)Bite Block Cover","name":"HDX_Spare_ECO-X-S_Bite block cover","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00013","model":"(H)CHIN BITE","name":"HDX_Spare_ECO-X-S_Chin bite","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00014","model":"(H)CHIN BOTTOM CASE","name":"HDX_Spare_ECO-X-S_Chin bottom case","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00015","model":"(H)CHIN REST NORMAL","name":"HDX_Spare_ECO-X-S_Chin rest normal","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00016","model":"(H)EARROD","name":"HDX_Spare_ECO-X-S_Earrod","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00017","model":"(H)WDG90 generator","name":"HDX_Spare_ECO-X-S_WD90 generator","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00018","model":"(H)MCU Board","name":"HDX_Spare_ECO-X-S_MCU board","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00019","model":"(H)MP3 Board","name":"HDX_Spare_ECO-X-S_MP3 board","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00020","model":"(H)Switching","name":"HDX_Spare_ECO-X-S_Switching","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00021","model":"(H)DP153","name":"HDX_Spare_ECO-X-S_DP","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00022","model":"(H)DP031","name":"HDX_Spare_ECO-X-S_DP","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEIMHDSP00026","model":"(H)Expose switch Assy","name":"HDX_Spare_ECO-X-S_Expose switch Assy","spec":"."},{"cat":"Other","cls":"NSK Motor","no":"5THSMDEMTEMNK00001","model":"AP2","name":"NSK AP 2_Non-optic","spec":"."},{"cat":"Other","cls":"NSK Motor","no":"5THSMDEMTEMNK00002","model":"PRO2","name":"NSK PRO 2_Optic","spec":"."},{"cat":"Other","cls":"NSK Motor","no":"5THSMDEMTEMNK00003","model":"NSKSPO160001","name":"IRRIGATION TUBE FOR SURGIC PRO","spec":"."},{"cat":"Other","cls":"Handpiece for Implant Motor","no":"5THSMDEMTMBHP00001","model":"MBK Contra handpiece","name":"MBK_20:1 Implant surgery contra Angle Handpiece","spec":"."},{"cat":"Other","cls":"Others","no":"5THSMDERAYIP00001","model":"RIOPLATE02","name":"RIOSCAN Plate Size 2","spec":"IP size 2"},{"cat":"Other","cls":"Pano + Ceph","no":"5THSMDEXR2DSH00001","model":"Dentio-lll (SC)","name":"Pano+Ceph_Dentio-lll 2nd hand","spec":"."},{"cat":"Other","cls":"Pano + CT + Ceph","no":"5THSMDEXR3DSH00001","model":"PAPAYA 3D Plus (SC)","name":"Pano+CT+Ceph_PAPAYA 3D Plus 2nd hand","spec":"."},{"cat":"Other","cls":"Pano + CT + Ceph","no":"5THSMDEXR3DSH00002","model":"ECO-X-S (SC)","name":"Pano+CT+Ceph_ECO-X-S (SC) 2nd hand","spec":"."},{"cat":"Other","cls":"Pano + CT + Ceph","no":"5THSMDEXR3DSH00003","model":"ECO-X-S AI (SC)","name":"Pano+CT+Ceph_ECO-X-S AI (SC) 2nd hand","spec":"."},{"cat":"Other","cls":"Chair type / Standard X-Ray","no":"5THSMDEXRCHSH00001","model":"X-ray : Wall type (SC)","name":"Chair type X-Ray_2nd hand","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEXRHDSP00001","model":"(G)STEPPING MOTOR DRIVER","name":"Genoray_Spare_P3D_Stepping motor driver","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEXRHDSP00002","model":"(G)Timing Belt","name":"Genoray_Spare_P3D_Timing belt","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEXRHDSP00004","model":"(G)Model Scan","name":"Genoray_Spare_Model scan","spec":"."},{"cat":"Other","cls":"Spare parts for X-Ray equipments","no":"5THSMDEXRHDSP00006","model":"(G)JG16B023","name":"BATTERY / Li-Polymer PORT-X 3","spec":"."},{"cat":"Other","cls":"Imaging plate / PSP","no":"5THSMDEXRIPFC00001","model":"IMAGING PLATE","name":"IP Plate No.2 for FireCR","spec":"."},{"cat":"Other","cls":"Other_NaviGuide_Neo","no":"5THSMDINVPDPL00001","model":"PLG","name":"NaviGuide_Planning fee","spec":"."},{"cat":"Fixture","cls":"NaviGuide_Neo","no":"5THSMDINVPDPL0002","model":"PLG01","name":"NaviGuide_Plan_1 hole","spec":"."},{"cat":"Fixture","cls":"NaviGuide_Neo","no":"5THSMDINVPDPL0003","model":"PLG02","name":"NaviGuide_Plan_2 holes","spec":"."},{"cat":"Fixture","cls":"NaviGuide_Neo","no":"5THSMDINVPDPL0004","model":"PLG03","name":"NaviGuide_Plan_more that 2 holes","spec":"."},{"cat":"Other","cls":"Other_NaviGuide_Neo","no":"5THSMDINVPDPR0001","model":"PRG","name":"NaviGuide_Printing fee","spec":"."},{"cat":"Fixture","cls":"NaviGuide_Neo","no":"5THSMDINVPDPR0002","model":"PRG01","name":"NaviGuide_Print_1 hole","spec":"."},{"cat":"Fixture","cls":"NaviGuide_Neo","no":"5THSMDINVPDPR0003","model":"PRG02","name":"NaviGuide_Print_2 holes","spec":"."},{"cat":"Fixture","cls":"NaviGuide_Neo","no":"5THSMDINVPDPR0004","model":"PRG03","name":"NaviGuide_Print_more that 2 holes","spec":"."},{"cat":"Other","cls":"Other_NaviGuide_Neo","no":"5THSMDINVPDSM0001","model":"SMG","name":"NaviGuide_Model Scanning fee","spec":"."},{"cat":"Fixture","cls":"NaviGuide_Neo","no":"5THSMDINVPDSM0002","model":"SMG01","name":"NaviGuide_Scan_1 hole","spec":"."},{"cat":"Fixture","cls":"NaviGuide_Neo","no":"5THSMDINVPDSM0003","model":"SMG02","name":"NaviGuide_Scan_2 holes","spec":"."},{"cat":"Fixture","cls":"NaviGuide_Neo","no":"5THSMDINVPDSM0004","model":"SMG03","name":"NaviGuide_Scan_more that 2 holes","spec":"."},{"cat":"Other","cls":"Resin for 3D Prinet","no":"5THSMDIPTRSFL00001","model":"Resin(FB-11)","name":"Formlabs_FB-11 clear resin(1L) for 3B","spec":"."},{"cat":"Other","cls":"Resin for 3D Prinet","no":"5THSMDIPTRSML00001","model":"Resin803","name":"MoonLite_SKU-07-01-045","spec":"."},{"cat":"Abutment","cls":"PEEK Healing abutment","no":"5THSMGGPRHAPK00001","model":"PHM2","name":"Peek Healing Abutment Molar 2mm","spec":"."},{"cat":"Abutment","cls":"PEEK Healing abutment","no":"5THSMGGPRHAPK00002","model":"PHM3","name":"Peek Healing Abutment Molar 3mm","spec":"."},{"cat":"Abutment","cls":"PEEK Healing abutment","no":"5THSMGGPRHAPK00003","model":"PHM4","name":"Peek Healing Abutment Molar 4mm","spec":"."},{"cat":"Abutment","cls":"PEEK Healing abutment","no":"5THSMGGPRHAPK00004","model":"PHPM2","name":"Peek Healing Abutment Premolar 2mm","spec":"."},{"cat":"Abutment","cls":"PEEK Healing abutment","no":"5THSMGGPRHAPK00005","model":"PHPM3","name":"Peek Healing Abutment Premolar 3mm","spec":"."},{"cat":"Abutment","cls":"PEEK Healing abutment","no":"5THSMGGPRHAPK00006","model":"PHPM4","name":"Peek Healing Abutment Premolar 4mm","spec":"."},{"cat":"Other","cls":"Others","no":"5THSMPRDCTPOT00001","model":"EAHB626","name":"EB Prosthetic","spec":"."},{"cat":"Other","cls":"Others","no":"5THSMPRDCTPOT00002","model":"ITFDO31","name":"Tool_IT Fixture driver(old)","spec":"."},{"cat":"Other","cls":"Others","no":"5THSMPRDCTPOT00003","model":"MG00","name":"Tool_Multi Gauge(old)","spec":"."}];
