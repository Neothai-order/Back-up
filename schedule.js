/* ═══════════════════════════════════════════════════════════════════════════
   schedule.js — Visit Schedule (extracted from schedule.html)
   Uses: _fbDb (core.js), getCurrentUser() (core.js), _isAdmin() (core.js),
         DATA[] (core.js), currentLang (lang.js), _bringToFront() (delivery.js)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── i18n ────────────────────────────────────────────────────────────────────
var _vsI18n = {
  vs_title: {ko:'방문 스케줄',en:'Visit Schedule',th:'ตารางเยี่ยม'},
  vs_new: {ko:'새 일정',en:'New Schedule',th:'ตารางใหม่'},
  vs_calendar: {ko:'달력',en:'Calendar',th:'ปฏิทิน'},
  vs_list: {ko:'목록',en:'List',th:'รายการ'},
  vs_date: {ko:'날짜',en:'Date',th:'วันที่'},
  vs_time: {ko:'시간',en:'Time',th:'เวลา'},
  vs_customer: {ko:'고객',en:'Customer',th:'ลูกค้า'},
  vs_erp: {ko:'ERP 코드',en:'ERP Code',th:'รหัส ERP'},
  vs_address: {ko:'주소',en:'Address',th:'ที่อยู่'},
  vs_type: {ko:'방문 유형',en:'Visit Type',th:'ประเภท'},
  vs_purpose: {ko:'방문 목적',en:'Purpose',th:'วัตถุประสงค์'},
  vs_priority: {ko:'우선순위',en:'Priority',th:'ลำดับความสำคัญ'},
  vs_priority_high: {ko:'높음',en:'High',th:'สูง'},
  vs_priority_normal: {ko:'보통',en:'Normal',th:'ปกติ'},
  vs_priority_low: {ko:'낮음',en:'Low',th:'ต่ำ'},
  vs_status_planned: {ko:'예정',en:'Planned',th:'วางแผน'},
  vs_status_completed: {ko:'완료',en:'Completed',th:'เสร็จ'},
  vs_status_cancelled: {ko:'취소',en:'Cancelled',th:'ยกเลิก'},
  vs_status_postponed: {ko:'연기',en:'Postponed',th:'เลื่อน'},
  vs_complete: {ko:'완료 처리',en:'Mark Complete',th:'เสร็จสิ้น'},
  vs_postpone: {ko:'연기',en:'Postpone',th:'เลื่อน'},
  vs_cancel: {ko:'취소',en:'Cancel',th:'ยกเลิก'},
  vs_edit: {ko:'수정',en:'Edit',th:'แก้ไข'},
  vs_save: {ko:'저장',en:'Save',th:'บันทึก'},
  vs_notes: {ko:'메모',en:'Notes',th:'หมายเหตุ'},
  vs_no_schedule: {ko:'일정이 없습니다',en:'No schedules',th:'ไม่มีตาราง'},
  vs_saved: {ko:'저장되었습니다',en:'Saved',th:'บันทึกแล้ว'},
  vs_today: {ko:'오늘',en:'Today',th:'วันนี้'},
  vs_this_week: {ko:'이번 주',en:'This Week',th:'สัปดาห์นี้'},
  vs_all_emp: {ko:'전체 직원',en:'All Employees',th:'พนักงานทั้งหมด'},
  vs_customer_search_ph: {ko:'ERP 코드 또는 고객명 검색',en:'Search ERP code or customer name',th:'ค้นหารหัส ERP หรือชื่อลูกค้า'},
  vs_change: {ko:'변경',en:'Change',th:'เปลี่ยน'},
  vs_visit_logs: {ko:'방문 기록',en:'Visit Logs',th:'บันทึกการเยี่ยม'},
  vs_count_suffix: {ko:'건',en:'',th:' รายการ'},
  vs_dblclick_detail: {ko:'더블클릭 → 상세',en:'Double-click → details',th:'ดับเบิลคลิก → รายละเอียด'},
  vs_all_day: {ko:'하루 종일',en:'All day',th:'ทั้งวัน'},
  vs_err_date: {ko:'날짜를 입력하세요',en:'Please enter a date',th:'กรุณาระบุวันที่'},
  vs_err_customer: {ko:'고객을 입력하세요',en:'Please enter a customer',th:'กรุณาระบุลูกค้า'},
  vs_no_logs_for_date: {ko:'해당 날짜의 방문 기록이 없습니다',en:'No visit logs for this date',th:'ไม่มีบันทึกการเยี่ยมสำหรับวันนี้'},
  vs_purpose_label: {ko:'목적',en:'Purpose',th:'วัตถุประสงค์'},
  vs_result_label: {ko:'결과',en:'Result',th:'ผลลัพธ์'},
  vs_next_action: {ko:'후속조치',en:'Next Action',th:'การดำเนินการต่อ'},
  vs_unreg_cust: {ko:'미등록 고객',en:'Unregistered',th:'ลูกค้าใหม่ (ยังไม่ลงทะเบียน)'},
  vs_unreg_name_ph: {ko:'고객명 직접 입력',en:'Type customer name',th:'พิมพ์ชื่อลูกค้า'}
};

var _visitTypeLabels = {
  regular: {ko:'정기방문',en:'Regular',th:'เยี่ยมปกติ'},
  new: {ko:'신규방문',en:'New',th:'ใหม่'},
  follow_up: {ko:'후속방문',en:'Follow-up',th:'ติดตาม'},
  complaint: {ko:'클레임',en:'Complaint',th:'ร้องเรียน'},
  demo: {ko:'데모',en:'Demo',th:'สาธิต'}
};

var _typeColors = {regular:'#3b82f6',new:'#22c55e',follow_up:'#f59e0b',complaint:'#ef4444',demo:'#8b5cf6'};

var _dayNames = {
  ko:['일','월','화','수','목','금','토'],
  en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  th:['อา','จ','อ','พ','พฤ','ศ','ส']
};

var _monthNames = {
  ko:['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  en:['January','February','March','April','May','June','July','August','September','October','November','December'],
  th:['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
};

// ── Translation helper (renamed to avoid conflict with core.js _t) ──────────
function _vst(key) {
  var entry = _vsI18n[key];
  if (!entry) return key;
  var lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
  return entry[lang] || entry['ko'] || key;
}

function _vtLabel(type) {
  var e = _visitTypeLabels[type];
  var lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
  return e ? (e[lang] || e['ko'] || type) : type;
}

// ── Thai Public Holidays ────────────────────────────────────────────────────
var _thaiFixedHolidays = {
  '01-01': {ko:'새해',en:'New Year',th:'วันขึ้นปีใหม่'},
  '02-10': {ko:'만부차',en:'Makha Bucha',th:'วันมาฆบูชา'},
  '04-06': {ko:'짜끄리 왕조 기념일',en:'Chakri Day',th:'วันจักรี'},
  '04-13': {ko:'송끄란',en:'Songkran',th:'วันสงกรานต์'},
  '04-14': {ko:'송끄란',en:'Songkran',th:'วันสงกรานต์'},
  '04-15': {ko:'송끄란',en:'Songkran',th:'วันสงกรานต์'},
  '05-01': {ko:'근로자의 날',en:'Labour Day',th:'วันแรงงาน'},
  '05-04': {ko:'국왕 대관식',en:'Coronation Day',th:'วันฉัตรมงคล'},
  '05-12': {ko:'위사카부차',en:'Visakha Bucha',th:'วันวิสาขบูชา'},
  '06-03': {ko:'수티다 왕비 탄생일',en:'Queen Suthida Birthday',th:'วันเฉลิมพระชนมพรรษา พระราชินี'},
  '07-28': {ko:'국왕 탄생일',en:'King Birthday',th:'วันเฉลิมพระชนมพรรษา ร.10'},
  '07-29': {ko:'아산하부차',en:'Asanha Bucha',th:'วันอาสาฬหบูชา'},
  '08-12': {ko:'왕태후 탄생일/어머니날',en:'Mother\'s Day',th:'วันแม่แห่งชาติ'},
  '10-13': {ko:'라마9세 추모일',en:'King Bhumibol Memorial',th:'วันคล้ายวันสวรรคต ร.9'},
  '10-23': {ko:'쭐라롱껀대왕 기념일',en:'Chulalongkorn Day',th:'วันปิยมหาราช'},
  '12-05': {ko:'라마9세 탄생일/아버지날',en:'Father\'s Day',th:'วันพ่อแห่งชาติ'},
  '12-10': {ko:'헌법기념일',en:'Constitution Day',th:'วันรัฐธรรมนูญ'},
  '12-31': {ko:'연말',en:'New Year\'s Eve',th:'วันสิ้นปี'}
};

function _getThaiHoliday(dateStr) {
  var mmdd = dateStr.substring(5);
  return _thaiFixedHolidays[mmdd] || null;
}

function _getHolidayLabel(holiday) {
  if (!holiday) return '';
  var lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
  return holiday[lang] || holiday['ko'] || '';
}

// ── State ───────────────────────────────────────────────────────────────────
var _vsCurrentUser = null;
var _vsShowAllEmployees = false;
var _vsCurrentView = 'calendar';
var _vsCalYear, _vsCalMonth; // 0-indexed month
var _vsSelectedDate = null;
var _vsAllSchedules = []; // fetched docs
var _vsPostponeDocId = null;

// ── Overlay open / close ────────────────────────────────────────────────────
function openVisitSchedule() {
  var ov = document.getElementById('visitScheduleOverlay');
  if (!ov) return;
  // 데스크탑: 메인 헤더(.header) 높이만큼 자동 오프셋
  var mainHeader = document.querySelector('.header');
  if (mainHeader && window.innerWidth > 600) {
    var hh = mainHeader.offsetHeight + 'px';
    ov.style.top = hh;
    ov.style.setProperty('--vs-header-offset', hh);
  } else {
    ov.style.top = '';
    ov.style.setProperty('--vs-header-offset', '0px');
  }
  ov.classList.add('open');
  if (typeof _bringToFront === 'function') _bringToFront(ov);
  initVisitSchedule();
}

function closeVisitScheduleOverlay() {
  var ov = document.getElementById('visitScheduleOverlay');
  if (!ov) return;
  ov.classList.remove('open');
}

// ── Init ────────────────────────────────────────────────────────────────────
function initVisitSchedule() {
  _vsCurrentUser = getCurrentUser();
  if (!_vsCurrentUser) { alert('Login required'); return; }

  var today = new Date();
  _vsCalYear = today.getFullYear();
  _vsCalMonth = today.getMonth();
  _vsSelectedDate = _vsFormatDate(today);

  if (_isAdmin(_vsCurrentUser)) {
    var at = document.getElementById('vsAdminToggle');
    if (at) at.style.display = 'flex';
  }

  _vsApplyTranslations();
  _vsSetupAC();
  _vsLoadData();
}

// ── Translations ────────────────────────────────────────────────────────────
function _vsApplyTranslations() {
  var el;
  el = document.getElementById('vsHeaderTitle');
  if (el) el.textContent = _vst('vs_title');
  el = document.getElementById('vsWeekTitle');
  if (el) el.textContent = _vst('vs_this_week');

  document.querySelectorAll('#visitScheduleOverlay [data-t]').forEach(function(e) {
    e.textContent = _vst(e.getAttribute('data-t'));
  });
  document.querySelectorAll('#visitScheduleOverlay [data-t-ph]').forEach(function(e) {
    e.setAttribute('placeholder', _vst(e.getAttribute('data-t-ph')));
  });
  document.querySelectorAll('#visitScheduleOverlay [data-t-title]').forEach(function(e) {
    e.setAttribute('title', _vst(e.getAttribute('data-t-title')));
  });

  // Visit type select
  var sel = document.getElementById('fType');
  if (sel) {
    sel.options[0].textContent = _vtLabel('regular');
    sel.options[1].textContent = _vtLabel('new');
    sel.options[2].textContent = _vtLabel('follow_up');
    sel.options[3].textContent = _vtLabel('complaint');
    sel.options[4].textContent = _vtLabel('demo');
  }
  // Priority select
  var psel = document.getElementById('fPriority');
  if (psel) {
    psel.options[0].textContent = _vst('vs_priority_normal');
    psel.options[1].textContent = _vst('vs_priority_high');
    psel.options[2].textContent = _vst('vs_priority_low');
  }
}

// ── Data loading ────────────────────────────────────────────────────────────
function _vsLoadData() {
  var isAdm = _isAdmin(_vsCurrentUser);
  var q = _fbDb.collection('visit_schedules');
  if (_vsShowAllEmployees && isAdm) {
    // Admin seeing all: no empid filter
    q = q.orderBy('date', 'asc');
  } else {
    q = q.where('empid', '==', _vsCurrentUser.empid).orderBy('date', 'asc');
  }
  q.get().then(function(snap) {
    _vsAllSchedules = [];
    snap.forEach(function(doc) {
      var d = doc.data();
      d._id = doc.id;
      _vsAllSchedules.push(d);
    });
    _vsRender();
  }).catch(function(e) {
    console.error('[Schedule] Load error:', e);
    // Fallback: try without orderBy (index not ready)
    var q2 = _fbDb.collection('visit_schedules');
    if (!_vsShowAllEmployees || !isAdm) {
      q2 = q2.where('empid', '==', _vsCurrentUser.empid);
    }
    q2.get().then(function(snap) {
      _vsAllSchedules = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        d._id = doc.id;
        _vsAllSchedules.push(d);
      });
      _vsAllSchedules.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
      _vsRender();
    }).catch(function(e2) {
      console.error('[Schedule] Fallback load error:', e2);
      _vsAllSchedules = [];
      _vsRender();
    });
  });
}

// ── Render ───────────────────────────────────────────────────────────────────
function _vsRender() {
  renderWeekOverview();
  renderCalendar();
  renderDaySchedules();
  if (_vsCurrentView === 'list') renderListView();
}

// ── Week overview ───────────────────────────────────────────────────────────
function renderWeekOverview() {
  var today = new Date();
  var dow = today.getDay();
  var startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dow);
  var container = document.getElementById('vsWeekDays');
  if (!container) return;
  container.innerHTML = '';
  var lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
  var days = _dayNames[lang] || _dayNames['ko'];
  for (var i = 0; i < 7; i++) {
    var d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    var ds = _vsFormatDate(d);
    var dayScheds = _vsAllSchedules.filter(function(s) { return s.date === ds; });
    var isToday = ds === _vsFormatDate(today);
    var box = document.createElement('div');
    box.className = 'week-day-box' + (isToday ? ' today' : '');
    box.innerHTML = '<div class="day-label">' + days[i] + '</div><div class="day-num">' + d.getDate() + '</div><div class="dot-row">' +
      dayScheds.slice(0, 4).map(function(s) { return '<div class="wdot" style="background:' + (_typeColors[s.visit_type] || '#94a3b8') + '"></div>'; }).join('') + '</div>';
    (function(dateStr) {
      box.onclick = function() {
        _vsSelectedDate = dateStr;
        var dd = new Date(dateStr);
        _vsCalYear = dd.getFullYear();
        _vsCalMonth = dd.getMonth();
        switchView('calendar');
        _vsRender();
      };
    })(ds);
    container.appendChild(box);
  }
}

// ── Calendar ────────────────────────────────────────────────────────────────
function renderCalendar() {
  var grid = document.getElementById('vsCalGrid');
  if (!grid) return;
  grid.innerHTML = '';
  var lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
  var days = _dayNames[lang] || _dayNames['ko'];
  // Header
  for (var h = 0; h < 7; h++) {
    var hc = document.createElement('div');
    hc.className = 'vs-cal-header-cell' + (h === 0 ? ' sun' : '') + (h === 6 ? ' sat' : '');
    hc.textContent = days[h];
    grid.appendChild(hc);
  }
  // Month label
  var mNames = _monthNames[lang] || _monthNames['ko'];
  var ml = document.getElementById('vsMonthLabel');
  if (ml) ml.textContent = _vsCalYear + ' ' + mNames[_vsCalMonth];

  var firstDay = new Date(_vsCalYear, _vsCalMonth, 1).getDay();
  var daysInMonth = new Date(_vsCalYear, _vsCalMonth + 1, 0).getDate();
  var prevDays = new Date(_vsCalYear, _vsCalMonth, 0).getDate();

  // Previous month fill
  for (var p = firstDay - 1; p >= 0; p--) {
    var pDate = new Date(_vsCalYear, _vsCalMonth - 1, prevDays - p);
    grid.appendChild(createCalCell(pDate, true));
  }
  // Current month
  for (var d = 1; d <= daysInMonth; d++) {
    var cDate = new Date(_vsCalYear, _vsCalMonth, d);
    grid.appendChild(createCalCell(cDate, false));
  }
  // Next month fill
  var totalCells = firstDay + daysInMonth;
  var remaining = (7 - (totalCells % 7)) % 7;
  for (var n = 1; n <= remaining; n++) {
    var nDate = new Date(_vsCalYear, _vsCalMonth + 1, n);
    grid.appendChild(createCalCell(nDate, true));
  }
}

function createCalCell(date, isOther) {
  var ds = _vsFormatDate(date);
  var dow = date.getDay();
  var todayStr = _vsFormatDate(new Date());
  var dayScheds = _vsAllSchedules.filter(function(s) { return s.date === ds && s.status !== 'cancelled'; });
  var holiday = _getThaiHoliday(ds);

  var cell = document.createElement('div');
  var cls = 'vs-cal-cell';
  if (isOther) cls += ' other-month';
  if (ds === todayStr) cls += ' today';
  if (ds === _vsSelectedDate) cls += ' selected';
  if (dow === 0) cls += ' sun';
  else if (dow === 6) cls += ' sat';
  cell.className = cls;

  var html = '<div class="day-num-wrap"><span class="day-num">' + date.getDate() + '</span></div>';
  if (holiday) {
    html += '<div class="holiday-bar"></div>';
  } else if (dayScheds.length > 0) {
    html += '<div class="sched-bar" style="background:' + (_typeColors[dayScheds[0].visit_type] || '#3b82f6') + '"></div>';
  }
  cell.innerHTML = html;
  (function(dateStr) {
    var clickTimer = null;
    cell.onclick = function() {
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
      clickTimer = setTimeout(function() {
        clickTimer = null;
        _vsSelectedDate = dateStr;
        renderCalendar();
        renderDaySchedules();
      }, 250);
    };
    cell.ondblclick = function() {
      if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
      _vsSelectedDate = dateStr;
      renderCalendar();
      _vsShowVisitLogDetail(dateStr);
    };
  })(ds);
  return cell;
}

function renderDaySchedules() {
  var section = document.getElementById('vsDayDetailSection');
  if (!section) return;

  var selDate = _vsSelectedDate || _vsFormatDate(new Date());
  var d = new Date(selDate);
  var lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';

  var dayFullNames = {
    ko:['일요일','월요일','화요일','수요일','목요일','금요일','토요일'],
    en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    th:['วันอาทิตย์','วันจันทร์','วันอังคาร','วันพุธ','วันพฤหัสบดี','วันศุกร์','วันเสาร์']
  };
  var fullNames = dayFullNames[lang] || dayFullNames['ko'];

  var bigEl = document.getElementById('vsDayDetailBig');
  var nameEl = document.getElementById('vsDayDetailName');
  var holidayEl = document.getElementById('vsDayDetailHoliday');
  if (bigEl) bigEl.textContent = d.getDate();
  if (nameEl) nameEl.textContent = fullNames[d.getDay()];

  var holiday = _getThaiHoliday(selDate);
  if (holidayEl) holidayEl.textContent = holiday ? _getHolidayLabel(holiday) : '';

  var dayScheds = _vsAllSchedules.filter(function(s) { return s.date === selDate; });
  dayScheds.sort(function(a, b) { return (a.time || '99:99').localeCompare(b.time || '99:99'); });

  var list = document.getElementById('vsDaySchedList');
  if (!list) return;

  var html = '';
  if (holiday) {
    html += '<div class="sched-card" style="border-left-color:#22c55e;background:#f0fdf4">';
    html += '<div class="sc-top"><span class="sc-customer" style="color:#16a34a">&#x1F3C9; ' + _getHolidayLabel(holiday) + '</span>';
    html += '<span style="font-size:12px;color:#64748b">' + _vst('vs_all_day') + '</span></div></div>';
  }

  // Separate visit_log synced items from manual schedules
  var visitLogs = dayScheds.filter(function(s) { return s.source === 'visit_log'; });
  var manualScheds = dayScheds.filter(function(s) { return s.source !== 'visit_log'; });

  if (dayScheds.length === 0 && !holiday) {
    html += '<div class="no-data">' + _vst('vs_no_schedule') + '</div>';
  } else {
    // Visit log summary (compact: time + customer + purpose only)
    if (visitLogs.length > 0) {
      html += '<div style="margin-bottom:6px;padding:5px 10px;background:#eff6ff;border-radius:8px;font-size:12px;font-weight:700;color:#2563eb;">📋 ' + _vst('vs_visit_logs') + ' (' + visitLogs.length + _vst('vs_count_suffix') + ') <span style="font-weight:400;color:#6b7280;margin-left:4px;">' + _vst('vs_dblclick_detail') + '</span></div>';
      visitLogs.forEach(function(s) {
        html += '<div class="sched-card" style="border-left-color:' + (_typeColors[s.visit_type] || '#3b82f6') + ';padding:6px 10px;cursor:pointer;" ondblclick="_vsShowVisitLogDetail(\'' + (s.date || '') + '\')">';
        html += '<div style="display:flex;align-items:center;gap:8px;">';
        if (s.time) html += '<span style="font-size:12px;font-weight:700;color:#0891b2;min-width:40px;">' + s.time + '</span>';
        html += '<span style="font-weight:600;font-size:13px;color:#1e293b;">' + _vsEsc(s.customer_name || '-') + '</span>';
        if (s.purpose) html += '<span style="font-size:12px;color:#6b7280;margin-left:4px;">- ' + _vsEsc(s.purpose) + '</span>';
        html += '</div></div>';
      });
    }
    // Manual schedule (compact: time + customer + purpose + actions)
    if (manualScheds.length > 0) {
      manualScheds.forEach(function(s) {
        html += '<div class="sched-card" style="border-left-color:' + (_typeColors[s.visit_type] || '#3b82f6') + ';padding:6px 10px;">';
        html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
        if (s.time) html += '<span style="font-size:12px;font-weight:700;color:#0891b2;min-width:40px;">' + s.time + '</span>';
        html += '<span style="font-weight:600;font-size:13px;color:#1e293b;">' + _vsEsc(s.customer_name || '-') + '</span>';
        html += '<span class="type-badge type-' + s.visit_type + '" style="font-size:10px;padding:1px 6px;">' + _vtLabel(s.visit_type) + '</span>';
        html += '<span class="status-badge status-' + s.status + '" style="font-size:10px;padding:1px 6px;">' + _vst('vs_status_' + s.status) + '</span>';
        if (s.purpose) html += '<span style="font-size:12px;color:#6b7280;">- ' + _vsEsc(s.purpose) + '</span>';
        html += '</div>';
        if (s.status === 'planned') {
          html += '<div class="sc-actions" style="margin-top:4px;">';
          html += '<button class="btn btn-sm btn-secondary" onclick="editSchedule(\'' + s._id + '\')">' + _vst('vs_edit') + '</button>';
          html += '<button class="btn btn-sm btn-primary" onclick="completeSchedule(\'' + s._id + '\')">' + _vst('vs_complete') + '</button>';
          html += '<button class="btn btn-sm btn-secondary" onclick="openPostpone(\'' + s._id + '\')">' + _vst('vs_postpone') + '</button>';
          html += '<button class="btn btn-sm btn-danger" onclick="cancelSchedule(\'' + s._id + '\')">' + _vst('vs_cancel') + '</button>';
          html += '</div>';
        }
        html += '</div>';
      });
    }
  }
  list.innerHTML = html;
}

function buildCardHtml(s) {
  var priorityClass = 'priority-' + (s.priority || 'normal');
  var html = '<div class="sched-card ' + priorityClass + '">';
  html += '<div class="sc-top">';
  if (s.time) html += '<span class="sc-time">' + s.time + '</span>';
  html += '<span class="sc-customer">' + _vsEsc(s.customer_name || '') + '</span>';
  html += '<span class="type-badge type-' + s.visit_type + '">' + _vtLabel(s.visit_type) + '</span>';
  html += '<span class="status-badge status-' + s.status + '">' + _vst('vs_status_' + s.status) + '</span>';
  html += '<span class="priority-dot ' + (s.priority || 'normal') + '"></span>';
  html += '</div>';
  if (s.customer_erp) html += '<div class="sc-info">ERP: ' + _vsEsc(s.customer_erp) + '</div>';
  if (s.address) html += '<div class="sc-info">' + _vsEsc(s.address) + '</div>';
  if (s.purpose) html += '<div class="sc-purpose">' + _vsEsc(s.purpose) + '</div>';
  if (s.notes) html += '<div class="sc-info" style="color:#64748b;font-style:italic">' + _vsEsc(s.notes) + '</div>';
  if (_vsShowAllEmployees && s.emp_name) html += '<div class="sc-emp">' + _vsEsc(s.emp_name) + ' (' + _vsEsc(s.empid) + ')</div>';
  if (s.status === 'planned') {
    html += '<div class="sc-actions">';
    html += '<button class="btn btn-sm btn-secondary" onclick="editSchedule(\'' + s._id + '\')">' + _vst('vs_edit') + '</button>';
    html += '<button class="btn btn-sm btn-primary" onclick="completeSchedule(\'' + s._id + '\')">' + _vst('vs_complete') + '</button>';
    html += '<button class="btn btn-sm btn-secondary" onclick="openPostpone(\'' + s._id + '\')">' + _vst('vs_postpone') + '</button>';
    html += '<button class="btn btn-sm btn-danger" onclick="cancelSchedule(\'' + s._id + '\')">' + _vst('vs_cancel') + '</button>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ── List view ───────────────────────────────────────────────────────────────
function renderListView() {
  var container = document.getElementById('vsListContent');
  if (!container) return;
  var upcoming = _vsAllSchedules.filter(function(s) { return s.status === 'planned'; });
  upcoming.sort(function(a, b) {
    var c = a.date.localeCompare(b.date);
    if (c !== 0) return c;
    return (a.time || '99:99').localeCompare(b.time || '99:99');
  });
  if (upcoming.length === 0) {
    container.innerHTML = '<div class="no-data">' + _vst('vs_no_schedule') + '</div>';
    return;
  }
  var html = '';
  var lastDate = '';
  var lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
  upcoming.forEach(function(s) {
    if (s.date !== lastDate) {
      var d = new Date(s.date);
      var dayNamesArr = _dayNames[lang] || _dayNames['ko'];
      html += '<div class="list-group-date">' + s.date + ' (' + dayNamesArr[d.getDay()] + ')</div>';
      lastDate = s.date;
    }
    html += buildCardHtml(s);
  });
  container.innerHTML = html;
}

// ── View switch ─────────────────────────────────────────────────────────────
function switchView(v) {
  _vsCurrentView = v;
  var calV = document.getElementById('vsCalendarView');
  var listV = document.getElementById('vsListView');
  var btnCal = document.getElementById('btnCalView');
  var btnList = document.getElementById('btnListView');
  if (calV) calV.style.display = v === 'calendar' ? '' : 'none';
  if (listV) listV.style.display = v === 'list' ? '' : 'none';
  if (btnCal) btnCal.classList.toggle('active', v === 'calendar');
  if (btnList) btnList.classList.toggle('active', v === 'list');
  if (v === 'list') renderListView();
}

function changeMonth(delta) {
  _vsCalMonth += delta;
  if (_vsCalMonth < 0) { _vsCalMonth = 11; _vsCalYear--; }
  if (_vsCalMonth > 11) { _vsCalMonth = 0; _vsCalYear++; }
  var today = new Date();
  if (_vsCalYear === today.getFullYear() && _vsCalMonth === today.getMonth()) {
    _vsSelectedDate = _vsFormatDate(today);
  } else {
    _vsSelectedDate = _vsFormatDate(new Date(_vsCalYear, _vsCalMonth, 1));
  }
  _vsRender();
}

function goToday() {
  var today = new Date();
  _vsCalYear = today.getFullYear();
  _vsCalMonth = today.getMonth();
  _vsSelectedDate = _vsFormatDate(today);
  _vsRender();
}

function toggleAllEmployees() {
  _vsShowAllEmployees = document.getElementById('chkAllEmp').checked;
  _vsLoadData();
}

// ── Form modal ──────────────────────────────────────────────────────────────
function openNewModal() {
  document.getElementById('editDocId').value = '';
  document.getElementById('vsFormTitle').textContent = _vst('vs_new');
  document.getElementById('fDate').value = _vsSelectedDate || _vsFormatDate(new Date());
  document.getElementById('fTime').value = '';
  document.getElementById('fErp').value = '';
  document.getElementById('fCustName').value = '';
  document.getElementById('fCustomer').value = '';
  document.getElementById('fAddress').value = '';
  document.getElementById('fType').value = 'regular';
  document.getElementById('fPriority').value = 'normal';
  document.getElementById('fPurpose').value = '';
  document.getElementById('fNotes').value = '';
  document.getElementById('vsCustSearchWrap').style.display = '';
  document.getElementById('vsCustCard').classList.remove('show');
  document.getElementById('vsAcDropdown').classList.remove('show');
  // 미등록 체크박스 초기화
  var uchk = document.getElementById('fUnregCust');
  if (uchk) { uchk.checked = false; _vsToggleUnregCust(false); }
  document.getElementById('vsFormModal').classList.add('show');
}

function closeFormModal() {
  document.getElementById('vsFormModal').classList.remove('show');
}

function editSchedule(docId) {
  var s = _vsAllSchedules.find(function(x) { return x._id === docId; });
  if (!s) return;
  document.getElementById('editDocId').value = docId;
  document.getElementById('vsFormTitle').textContent = _vst('vs_edit');
  document.getElementById('fDate').value = s.date || '';
  document.getElementById('fTime').value = s.time || '';
  document.getElementById('fErp').value = s.customer_erp || '';
  document.getElementById('fCustName').value = s.customer_name || '';
  document.getElementById('fAddress').value = s.address || '';
  var uchk = document.getElementById('fUnregCust');
  // ERP 가 있으면 등록 고객(카드 표시), 없고 이름만 있으면 미등록 고객(직접 입력 모드)
  if (s.customer_erp) {
    if (uchk) { uchk.checked = false; _vsToggleUnregCust(false); }
    document.getElementById('vsCcErp').textContent = '[' + s.customer_erp + ']';
    document.getElementById('vsCcName').textContent = s.customer_name || '';
    document.getElementById('vsCcSub').textContent = '';
    document.getElementById('vsCustSearchWrap').style.display = 'none';
    document.getElementById('vsCustCard').classList.add('show');
  } else if (s.customer_name) {
    if (uchk) { uchk.checked = true; _vsToggleUnregCust(true); }
    document.getElementById('fCustomer').value = s.customer_name;
    document.getElementById('vsCustSearchWrap').style.display = '';
    document.getElementById('vsCustCard').classList.remove('show');
  } else {
    if (uchk) { uchk.checked = false; _vsToggleUnregCust(false); }
    document.getElementById('fCustomer').value = '';
    document.getElementById('vsCustSearchWrap').style.display = '';
    document.getElementById('vsCustCard').classList.remove('show');
  }
  document.getElementById('fType').value = s.visit_type || 'regular';
  document.getElementById('fPriority').value = s.priority || 'normal';
  document.getElementById('fPurpose').value = s.purpose || '';
  document.getElementById('fNotes').value = s.notes || '';
  document.getElementById('vsFormModal').classList.add('show');
}

function saveSchedule() {
  var docId = document.getElementById('editDocId').value;
  // 미등록 고객 모드: fCustomer (검색창) 의 텍스트가 곧 customer_name. ERP 는 비움.
  var unreg = document.getElementById('fUnregCust') && document.getElementById('fUnregCust').checked;
  var custErp = unreg ? '' : (document.getElementById('fErp').value || '').trim();
  var custName = unreg
    ? (document.getElementById('fCustomer').value || '').trim()
    : (document.getElementById('fCustName').value || '').trim();
  var data = {
    date: document.getElementById('fDate').value,
    time: document.getElementById('fTime').value,
    customer_erp: custErp,
    customer_name: custName,
    is_unregistered: !!unreg,
    address: document.getElementById('fAddress').value.trim(),
    visit_type: document.getElementById('fType').value,
    priority: document.getElementById('fPriority').value,
    purpose: document.getElementById('fPurpose').value.trim(),
    notes: document.getElementById('fNotes').value.trim(),
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (!data.date) { alert(_vst('vs_err_date')); return; }
  if (!data.customer_name) { alert(_vst('vs_err_customer')); return; }

  var promise;
  if (docId) {
    promise = _fbDb.collection('visit_schedules').doc(docId).update(data);
  } else {
    data.empid = _vsCurrentUser.empid;
    data.emp_name = _vsCurrentUser.name || _vsCurrentUser.emp_name || '';
    data.status = 'planned';
    data.completed_visit_id = '';
    data.created_at = firebase.firestore.FieldValue.serverTimestamp();
    promise = _fbDb.collection('visit_schedules').add(data);
  }
  promise.then(function() {
    _vsShowToast(_vst('vs_saved'));
    closeFormModal();
    _vsLoadData();
  }).catch(function(e) {
    alert('Error: ' + e.message);
  });
}

// ── Actions ─────────────────────────────────────────────────────────────────
function completeSchedule(docId) {
  if (!confirm(_vst('vs_complete') + '?')) return;
  _fbDb.collection('visit_schedules').doc(docId).update({
    status: 'completed',
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    _vsShowToast(_vst('vs_status_completed'));
    _vsLoadData();
  });
}

function cancelSchedule(docId) {
  if (!confirm(_vst('vs_cancel') + '?')) return;
  _fbDb.collection('visit_schedules').doc(docId).update({
    status: 'cancelled',
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    _vsShowToast(_vst('vs_status_cancelled'));
    _vsLoadData();
  });
}

function openPostpone(docId) {
  _vsPostponeDocId = docId;
  var s = _vsAllSchedules.find(function(x) { return x._id === docId; });
  document.getElementById('vsPostponeDate').value = s ? s.date : '';
  document.getElementById('vsPostponeBackdrop').classList.add('show');
  document.getElementById('vsPostponeModal').classList.add('show');
}

function closePostpone() {
  _vsPostponeDocId = null;
  document.getElementById('vsPostponeBackdrop').classList.remove('show');
  document.getElementById('vsPostponeModal').classList.remove('show');
}

function confirmPostpone() {
  var newDate = document.getElementById('vsPostponeDate').value;
  if (!newDate || !_vsPostponeDocId) return;
  var orig = _vsAllSchedules.find(function(x) { return x._id === _vsPostponeDocId; });
  if (!orig) return;
  // Mark original as postponed
  var batch = _fbDb.batch();
  var origRef = _fbDb.collection('visit_schedules').doc(_vsPostponeDocId);
  batch.update(origRef, { status: 'postponed', updated_at: firebase.firestore.FieldValue.serverTimestamp() });
  // Create new entry
  var newRef = _fbDb.collection('visit_schedules').doc();
  batch.set(newRef, {
    empid: orig.empid,
    emp_name: orig.emp_name || '',
    date: newDate,
    time: orig.time || '',
    customer_erp: orig.customer_erp || '',
    customer_name: orig.customer_name || '',
    address: orig.address || '',
    visit_type: orig.visit_type || 'regular',
    purpose: orig.purpose || '',
    priority: orig.priority || 'normal',
    status: 'planned',
    notes: orig.notes || '',
    completed_visit_id: '',
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  });
  batch.commit().then(function() {
    _vsShowToast(_vst('vs_status_postponed'));
    closePostpone();
    _vsLoadData();
  });
}

// ── Autocomplete (uses global DATA array from core.js) ──────────────────────
// dropdown 은 #vsCustSearchWrap (position:relative) 안에 position:absolute 로 들어감.
// → 입력창에 자연히 붙어 따라 움직임 — JS 위치 계산 불필요.
// 단, 아래 공간이 부족하면 위로 뒤집어 띄움.
function _vsPositionAC() {
  var inp = document.getElementById('fCustomer');
  var dd = document.getElementById('vsAcDropdown');
  if (!inp || !dd) return;
  var rect = inp.getBoundingClientRect();
  var ddH = dd.offsetHeight || 240; // 펼쳐진 실제 높이
  var vh = window.innerHeight || document.documentElement.clientHeight;
  var spaceBelow = vh - rect.bottom;
  var spaceAbove = rect.top;
  var GAP = 4;

  if ((spaceBelow < ddH + 8) && (spaceAbove > spaceBelow)) {
    // 위로
    dd.style.top = 'auto';
    dd.style.bottom = '100%';
    dd.style.marginTop = '0';
    dd.style.marginBottom = GAP + 'px';
    dd.style.maxHeight = Math.min(240, spaceAbove - GAP - 8) + 'px';
    dd.style.borderRadius = '10px 10px 0 0';
  } else {
    // 아래 (기본)
    dd.style.top = '100%';
    dd.style.bottom = 'auto';
    dd.style.marginTop = GAP + 'px';
    dd.style.marginBottom = '0';
    dd.style.maxHeight = Math.min(240, spaceBelow - GAP - 8) + 'px';
    dd.style.borderRadius = '0 0 10px 10px';
  }
}

function _vsSelectCust(c) {
  document.getElementById('fErp').value = c.erp || '';
  document.getElementById('fCustName').value = c.name_th || c.cust_name || c.name_en || '';
  document.getElementById('fAddress').value = c.address || '';
  document.getElementById('vsCcErp').textContent = c.erp ? '[' + c.erp + ']' : '';
  document.getElementById('vsCcName').textContent = c.name_th || c.cust_name || c.name_en || '';
  document.getElementById('vsCcSub').textContent = (c.name_en && c.name_en !== (c.name_th || c.cust_name)) ? c.name_en : '';
  document.getElementById('vsCustSearchWrap').style.display = 'none';
  document.getElementById('vsCustCard').classList.add('show');
  document.getElementById('vsAcDropdown').classList.remove('show');
}

function _vsClearCust() {
  document.getElementById('fErp').value = '';
  document.getElementById('fCustName').value = '';
  document.getElementById('fCustomer').value = '';
  document.getElementById('fAddress').value = '';
  document.getElementById('vsCustSearchWrap').style.display = '';
  document.getElementById('vsCustCard').classList.remove('show');
  document.getElementById('fCustomer').focus();
}

// ── 미등록 고객 토글 — 체크 시 검색·자동완성 끄고 직접 입력 모드 ──
function _vsToggleUnregCust(checked) {
  var inp = document.getElementById('fCustomer');
  var dd = document.getElementById('vsAcDropdown');
  var card = document.getElementById('vsCustCard');
  var wrap = document.getElementById('vsCustSearchWrap');
  if (!inp) return;
  if (checked) {
    // 직접 입력 모드: ERP 클리어, 카드 숨김, 검색 입력창은 사용 (자동완성만 차단)
    document.getElementById('fErp').value = '';
    if (card) card.classList.remove('show');
    if (wrap) wrap.style.display = '';
    if (dd) dd.classList.remove('show');
    inp.value = '';
    inp.placeholder = _vst('vs_unreg_name_ph');
    inp.dataset.unreg = '1';
    inp.focus();
  } else {
    inp.placeholder = _vst('vs_customer_search_ph');
    delete inp.dataset.unreg;
    inp.value = '';
    if (dd) dd.classList.remove('show');
  }
}

// Expose as global aliases for onclick handlers in HTML
var selectCust = _vsSelectCust;
var clearCust = _vsClearCust;
var _positionAC = _vsPositionAC;

function _vsSetupAC() {
  var custIn = document.getElementById('fCustomer');
  var dd = document.getElementById('vsAcDropdown');
  if (!custIn || !dd) return;
  var timer;
  var _vsAcMatches = []; // 현재 노출된 매치 배열 (키보드 select 용)
  var _vsAcActive = -1;  // 현재 강조된 인덱스 (-1 = none)

  function _vsAcUpdateActive() {
    var items = dd.querySelectorAll('.ac-item');
    items.forEach(function(el, i) {
      if (i === _vsAcActive) {
        el.style.background = '#e0f2fe';
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.style.background = '';
      }
    });
  }

  custIn.addEventListener('input', function() {
    // 미등록 고객 모드 → 자동완성 OFF, 입력창은 그대로 customer_name 입력으로 사용
    if (custIn.dataset.unreg === '1') { dd.classList.remove('show'); return; }
    clearTimeout(timer);
    timer = setTimeout(function() {
      var q = custIn.value.trim().toLowerCase();
      if (!q) { dd.classList.remove('show'); _vsAcMatches = []; _vsAcActive = -1; return; }
      var qNoSpace = q.replace(/\s+/g, '');
      var qIsNum = /^\d+$/.test(q);
      // Search global DATA array (fields: erp, nt_code, name_th, name_en, cust_name, clinic, address, province)
      var matches = DATA.filter(function(c) {
        var name = c.name_th || c.cust_name || '';
        var nameEn = c.name_en || '';
        var hay = ((c.erp || '') + ' ' + (c.nt_code || '') + ' ' + name + ' ' + nameEn + ' ' + (c.clinic || '')).toLowerCase().replace(/\s+/g, '');
        if (hay.indexOf(qNoSpace) >= 0) return true;
        if (qIsNum && c.nt_code && c.nt_code.toLowerCase().replace(/^nt/i, '').indexOf(q) >= 0) return true;
        return false;
      }).slice(0, 10);
      _vsAcMatches = matches;
      _vsAcActive = -1;
      if (!matches.length) { dd.classList.remove('show'); return; }
      dd.innerHTML = matches.map(function(c) {
        var erpStr = c.erp ? '[' + _vsEsc(c.erp) + '] ' : '';
        var mainName = c.name_th || c.cust_name || c.name_en || '';
        var ntTag = c.nt_code ? '<span class="ac-nt">' + _vsEsc(c.nt_code) + '</span>' : '';
        var subName = c.name_en && c.name_en !== mainName ? c.name_en : '';
        return '<div class="ac-item">' +
          '<div class="ac-main">' +
            '<div class="ac-name">' + _vsEsc(erpStr) + _vsEsc(mainName) + '  ' + ntTag + '</div>' +
            (subName ? '<div class="ac-sub">' + _vsEsc(subName) + '</div>' : '') +
          '</div></div>';
      }).join('');
      dd.querySelectorAll('.ac-item').forEach(function(el, i) {
        el.onclick = function(e) { e.stopPropagation(); _vsSelectCust(matches[i]); };
        el.addEventListener('mouseenter', function() { _vsAcActive = i; _vsAcUpdateActive(); });
      });
      _vsPositionAC();
      dd.classList.add('show');
    }, 150);
  });

  // ── 키보드 ──  ↑↓ 이동 / Enter 선택 / Esc 닫기 / Tab 닫기
  custIn.addEventListener('keydown', function(e) {
    if (custIn.dataset.unreg === '1') return; // 직접 입력 모드는 키보드 nav 비활성
    var open = dd.classList.contains('show') && _vsAcMatches.length > 0;
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _vsAcActive = (_vsAcActive + 1) % _vsAcMatches.length;
      _vsAcUpdateActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _vsAcActive = (_vsAcActive - 1 + _vsAcMatches.length) % _vsAcMatches.length;
      _vsAcUpdateActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      var pick = _vsAcActive >= 0 ? _vsAcMatches[_vsAcActive] : _vsAcMatches[0];
      if (pick) _vsSelectCust(pick);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      dd.classList.remove('show');
      _vsAcActive = -1;
    } else if (e.key === 'Tab') {
      dd.classList.remove('show');
    }
  });

  // reposition on modal scroll + 윈도우 스크롤/리사이즈 (모바일 키보드 push, 페이지 스크롤 등 대응)
  var mb = document.querySelector('#vsFormModal .vs-modal-body');
  if (mb) mb.addEventListener('scroll', function() { if (dd.classList.contains('show')) _vsPositionAC(); }, { passive: true });
  window.addEventListener('scroll', function() { if (dd.classList.contains('show')) _vsPositionAC(); }, { passive: true });
  window.addEventListener('resize', function() { if (dd.classList.contains('show')) _vsPositionAC(); });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('#vsCustSearchWrap') && !e.target.closest('#vsAcDropdown')) {
      dd.classList.remove('show');
    }
  });
}

// ── Utility ─────────────────────────────────────────────────────────────────
function _vsFormatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// Expose as global alias for other functions
var formatDate = _vsFormatDate;

function _vsEsc(s) {
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
var esc = _vsEsc;

function _vsShowToast(msg) {
  var t = document.getElementById('vsToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2000);
}
var showToast = _vsShowToast;

// ── Visit Log Detail (double-click calendar) ────────────────────────────────
function _vsShowVisitLogDetail(dateStr) {
  // Query visit_logs from Firestore for this date
  var user = getCurrentUser();
  if (!user) return;
  var lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';

  var q = _fbDb.collection('visit_logs').where('date', '==', dateStr);
  if (!_vsShowAllEmployees || !_isAdmin(user)) {
    q = q.where('empid', '==', user.empid);
  }

  q.get().then(function(snap) {
    var logs = [];
    snap.forEach(function(doc) { var d = doc.data(); d._id = doc.id; logs.push(d); });

    if (!logs.length) {
      _vsShowToast(_vst('vs_no_logs_for_date'));
      return;
    }

    // Build detail modal
    var typeLabels = {regular:{ko:'정기방문',en:'Regular',th:'ปกติ'},'new':{ko:'신규',en:'New',th:'ใหม่'},follow_up:{ko:'후속',en:'Follow-up',th:'ติดตาม'},complaint:{ko:'클레임',en:'Complaint',th:'ร้องเรียน'},demo:{ko:'데모',en:'Demo',th:'สาธิต'}};
    function tl(t) { var e=typeLabels[t]; return e?(e[lang]||e.ko||t):t; }

    var html = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:99998;display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()" id="vsLogDetailBackdrop">';
    html += '<div style="background:#fff;border-radius:16px;width:92%;max-width:420px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">';
    html += '<div style="background:linear-gradient(135deg,#0891b2,#06b6d4);color:#fff;padding:14px 18px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">';
    html += '<span style="font-weight:700;font-size:15px;">📋 ' + dateStr + ' ' + _vst('vs_visit_logs') + ' (' + logs.length + ')</span>';
    html += '<button onclick="document.getElementById(\'vsLogDetailBackdrop\').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;">✕</button>';
    html += '</div><div style="padding:12px;">';

    logs.forEach(function(v) {
      var tc = _typeColors[v.visit_type] || '#3b82f6';
      html += '<div style="border-left:4px solid '+tc+';background:#f8fafc;border-radius:10px;padding:12px;margin-bottom:10px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
      html += '<span style="font-weight:700;font-size:14px;">' + _vsEsc(v.customer_name||'-') + '</span>';
      html += '<span style="background:'+tc+';color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">' + tl(v.visit_type) + '</span>';
      html += '</div>';
      if (v.customer_erp) html += '<div style="font-size:12px;color:#6b7280;margin-bottom:4px;">ERP: ' + _vsEsc(v.customer_erp) + '</div>';
      if (v.emp_name) html += '<div style="font-size:12px;color:#6b7280;margin-bottom:4px;">👤 ' + _vsEsc(v.emp_name) + '</div>';
      if (v.purpose) html += '<div style="margin-top:6px;"><span style="font-size:11px;color:#0891b2;font-weight:600;">' + _vst('vs_purpose_label') + '</span><div style="font-size:13px;margin-top:2px;">' + _vsEsc(v.purpose) + '</div></div>';
      if (v.result) html += '<div style="margin-top:6px;"><span style="font-size:11px;color:#16a34a;font-weight:600;">' + _vst('vs_result_label') + '</span><div style="font-size:13px;margin-top:2px;">' + _vsEsc(v.result) + '</div></div>';
      if (v.next_action) html += '<div style="margin-top:6px;"><span style="font-size:11px;color:#f59e0b;font-weight:600;">' + _vst('vs_next_action') + '</span><div style="font-size:13px;margin-top:2px;">' + _vsEsc(v.next_action) + '</div></div>';
      if (v.address) html += '<div style="font-size:11px;color:#9ca3af;margin-top:6px;">📍 ' + _vsEsc(v.address) + '</div>';
      if (v.photos && v.photos.length) {
        html += '<div style="display:flex;gap:4px;margin-top:6px;overflow-x:auto;">';
        v.photos.forEach(function(p) { html += '<img src="'+(p.dataUrl||p.url||'')+'" style="width:60px;height:60px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="event.stopPropagation();window.open(this.src)">'; });
        html += '</div>';
      }
      html += '</div>';
    });

    html += '</div></div></div>';

    // Remove existing backdrop if any
    var old = document.getElementById('vsLogDetailBackdrop');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  }).catch(function(e) {
    console.error('[VS] Visit log detail error:', e);
    _vsShowToast('Error loading visit logs');
  });
}

// ── Window controls ─────────────────────────────────────────────────────────
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(function() {});
}
