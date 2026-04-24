// ── 팝업 메시지 시스템 ──────────────────────────────────────────────────────
var _POPUP_DESIGNS = {
  dark: { name:'🌙 다크', bg:'linear-gradient(135deg,#1e293b,#334155)', headerBg:'linear-gradient(135deg,#f59e0b,#ef4444)', textColor:'#e2e8f0', subColor:'#94a3b8', accentColor:'#fbbf24' },
  ocean: { name:'🌊 오션', bg:'linear-gradient(135deg,#0c4a6e,#155e75)', headerBg:'linear-gradient(135deg,#06b6d4,#0284c7)', textColor:'#e0f2fe', subColor:'#7dd3fc', accentColor:'#22d3ee' },
  forest: { name:'🌿 포레스트', bg:'linear-gradient(135deg,#14532d,#166534)', headerBg:'linear-gradient(135deg,#22c55e,#16a34a)', textColor:'#dcfce7', subColor:'#86efac', accentColor:'#4ade80' },
  royal: { name:'👑 로얄', bg:'linear-gradient(135deg,#312e81,#4338ca)', headerBg:'linear-gradient(135deg,#a78bfa,#7c3aed)', textColor:'#ede9fe', subColor:'#c4b5fd', accentColor:'#c084fc' },
  fire: { name:'🔥 파이어', bg:'linear-gradient(135deg,#7f1d1d,#991b1b)', headerBg:'linear-gradient(135deg,#f97316,#dc2626)', textColor:'#fef2f2', subColor:'#fca5a5', accentColor:'#fb923c' },
  light: { name:'☀️ 라이트', bg:'linear-gradient(135deg,#ffffff,#f1f5f9)', headerBg:'linear-gradient(135deg,#2563eb,#1d4ed8)', textColor:'#1e293b', subColor:'#64748b', accentColor:'#2563eb' }
};

// 목표/실적 데이터 — Firestore settings/monthlyTarget에서 로드
var _PERSON_TARGET = {};
var _TEAM_TARGET = {};
var _SUBDEPT_TEAM_MAP = {};
var _targetDataLoaded = false;

function _loadTargetData(cb) {
  if (_targetDataLoaded) { if (cb) cb(); return; }
  if (typeof _fbDb === 'undefined' || !_fbDb) { if (cb) cb(); return; }
  _fbDb.collection('settings').doc('monthlyTarget').get().then(function(doc) {
    if (doc.exists) {
      var d = doc.data();
      if (d.persons) _PERSON_TARGET = d.persons;
      if (d.teams) _TEAM_TARGET = d.teams;
      if (d.subdeptMap) _SUBDEPT_TEAM_MAP = d.subdeptMap;
      _targetDataLoaded = true;
      console.log('[TargetData] Firestore에서 로드 완료:', Object.keys(_PERSON_TARGET).length, '명,', Object.keys(_TEAM_TARGET).length, '팀');
    } else {
      console.warn('[TargetData] settings/monthlyTarget 문서 없음');
    }
    if (cb) cb();
  }).catch(function(e) {
    console.warn('[TargetData] 로드 실패:', e);
    if (cb) cb();
  });
}

// 기본 팝업 데이터
var _POPUP_DEFAULT = {
  enabled: true,
  design: 'royal',
  templateKey: 'sales_recv',
  autoTitle: false,
  autoSubtitle: false,
  title: '4월 목표 달성 현황',
  subtitle: '2026년 4월 1일 ~ 4월 9일 기준',
  icon: '📊',
  rows: [
    { label:'_sales_', icon:'📈', auto:false, plan:15835998, actual:5094819, color:'#60a5fa', barColor:'linear-gradient(90deg,#3b82f6,#60a5fa)' },
    { label:'_recv_', icon:'💰', auto:false, plan:12480637, actual:1987111, color:'#4ade80', barColor:'linear-gradient(90deg,#22c55e,#4ade80)' }
  ],
  footerMsg: '',
  footerSub: '',
  linkUrl: 'preview-target.html',
  target: 'admin'  // 'admin' | 'all' | 'personal_sales' | 'dept_Sales' | 'dept_Office' | empid
};

// ── 내장 템플레이트 ────────────────────────────────────────────────────────
var _POPUP_TEMPLATES = {
  sales_recv: {
    name: '📊 매출/수금 현황',
    icon: '📊',
    title: '4월 목표 달성 현황',
    subtitle: '2026년 4월 1일 ~ 4월 9일 기준',
    rows: [
      { label:'_sales_', icon:'📈', auto:false, plan:15835998, actual:5094819, color:'#60a5fa', barColor:'linear-gradient(90deg,#3b82f6,#60a5fa)' },
      { label:'_recv_', icon:'💰', auto:false, plan:12480637, actual:1987111, color:'#4ade80', barColor:'linear-gradient(90deg,#22c55e,#4ade80)' }
    ],
    footerMsg: '', footerSub: '👆 클릭하면 상세 현황을 확인할 수 있습니다',
    linkUrl: 'preview-target.html'
  },
  fuel_subsidy: {
    name: '⛽ 주유대 지원',
    icon: '⛽',
    title: '유류 지원금 안내',
    subtitle: '이번 달 유류 지원금이 지급되었습니다',
    rows: [],
    footerMsg: '🚗 이번 달 지원금 내역을 확인하세요',
    footerSub: '👆 클릭하면 상세 내역으로 이동합니다',
    linkUrl: 'fuel.html'
  },
  promotion: {
    name: '🎉 프로모션',
    icon: '🎉',
    title: '특별 프로모션 안내',
    subtitle: '기간 한정 이벤트',
    rows: [],
    footerMsg: '🎁 지금 바로 확인하세요!',
    footerSub: '👆 클릭하면 자세히 볼 수 있습니다',
    linkUrl: ''
  }
};

// 사용자 저장 템플레이트 (Firestore settings/popupTemplates.list)
var _USER_TEMPLATES = [];

function _loadUserTemplates(cb) {
  if (typeof _fbDb === 'undefined' || !_fbDb) { if (cb) cb(); return; }
  _fbDb.collection('settings').doc('popupTemplates').get().then(function(doc) {
    if (doc.exists && doc.data() && Array.isArray(doc.data().list)) {
      _USER_TEMPLATES = doc.data().list;
    }
    if (cb) cb();
  }).catch(function(e) { console.warn('[PopupTemplate] load error:', e); if (cb) cb(); });
}

function _saveUserTemplates() {
  if (typeof _fbDb === 'undefined' || !_fbDb) return;
  try { _fbDb.collection('settings').doc('popupTemplates').set({ list: _USER_TEMPLATES }); }
  catch(e) { console.warn('[PopupTemplate] save error:', e); }
}

// preview-target.html 에서 persist 한 현재 월 총계 (salesDashboard/latest.popupTotals)
var _DASHBOARD_TOTALS = null;
var _DASHBOARD_PER_PERSON = null; // { "PAT": {sp,sa,rp,ra}, ... } (persisted by preview-target)
var _DASHBOARD_PER_TEAM = null;   // { "BKK": {sp,sa,rp,ra}, ... } (persisted by preview-target)
// 업로드된 원본 데이터 — popup 에서 직접 실적 계산할 때 사용
var _DASHBOARD_SALES_RAW = null;  // { "Opal": { imp:[12], ct:[12] }, ... }
var _DASHBOARD_RECV_RAW = null;   // { "Opal": { imp:[12], ct:[12] }, ... }
// name → team 맵 (per-team 실적 계산용)
var _PERSON_TEAM_MAP = {};
var _DASHBOARD_UPDATED_AT = null;
var _dashboardTotalsLoaded = false;
// 관리 패널에서 미리보기 대상으로 선택된 인물/팀 (re-render 간 보존)
var _previewPerson = '';
var _previewTeam = '';
// 팝업 금액에 적용할 VAT 배율 (기본 1.07 — 계획 수치와 일관성 유지)
var _POPUP_VAT = 1.07;

function _loadDashboardTotals(cb) {
  if (_dashboardTotalsLoaded) { if (cb) cb(); return; }
  if (typeof _fbDb === 'undefined' || !_fbDb) { if (cb) cb(); return; }
  _fbDb.collection('salesDashboard').doc('latest').get().then(function(doc) {
    if (doc.exists) {
      var d = doc.data();
      if (d && d.popupTotals) _DASHBOARD_TOTALS = d.popupTotals;
      if (d && d.popupTotalsPerPerson) _DASHBOARD_PER_PERSON = d.popupTotalsPerPerson;
      if (d && d.popupTotalsPerTeam) _DASHBOARD_PER_TEAM = d.popupTotalsPerTeam;
      if (d && d.popupPersonTeamMap) _PERSON_TEAM_MAP = d.popupPersonTeamMap;
      // 원본 업로드 데이터 (imp/ct per month) — 실시간 계산에 사용
      if (d && d.sales) _DASHBOARD_SALES_RAW = d.sales;
      if (d && d.recv) _DASHBOARD_RECV_RAW = d.recv;
      if (d && d.popupTotalsUpdatedAt) {
        try { _DASHBOARD_UPDATED_AT = d.popupTotalsUpdatedAt.toDate ? d.popupTotalsUpdatedAt.toDate() : d.popupTotalsUpdatedAt; } catch(_){}
      }
      console.log('[DashboardTotals] 로드 완료:',
        'totals=', !!_DASHBOARD_TOTALS,
        '· persons=', _DASHBOARD_PER_PERSON ? Object.keys(_DASHBOARD_PER_PERSON).length : 0,
        '· teams=', _DASHBOARD_PER_TEAM ? Object.keys(_DASHBOARD_PER_TEAM).length : 0,
        '· salesRaw=', _DASHBOARD_SALES_RAW ? Object.keys(_DASHBOARD_SALES_RAW).length : 0,
        '· recvRaw=', _DASHBOARD_RECV_RAW ? Object.keys(_DASHBOARD_RECV_RAW).length : 0);
    }
    _dashboardTotalsLoaded = true;
    if (cb) cb();
  }).catch(function(e){ console.warn('[DashboardTotals] 로드 실패:', e); if (cb) cb(); });
}

// 대소문자/공백 무시 이름 매칭: name 과 일치하는 실제 키를 obj 에서 찾아 반환
function _findNameKey(name, obj) {
  if (!name || !obj) return null;
  if (obj[name]) return name; // 정확 일치
  var norm = String(name).trim().toLowerCase();
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i]).trim().toLowerCase() === norm) return keys[i];
  }
  return null;
}

// 원본 업로드 데이터에서 특정 인물의 현재 월 실적 계산 (VAT 포함)
// 반환: {sa, ra} (실적만 — 계획은 _PERSON_TARGET 에서 별도 읽음)
function _computeActualFromRaw(name) {
  var mi = new Date().getMonth();
  var out = { sa: null, ra: null };
  var sKey = _findNameKey(name, _DASHBOARD_SALES_RAW);
  if (sKey) {
    var s = _DASHBOARD_SALES_RAW[sKey];
    var imp = (s.imp && typeof s.imp[mi] === 'number') ? s.imp[mi] : 0;
    var ct  = (s.ct  && typeof s.ct[mi]  === 'number') ? s.ct[mi]  : 0;
    out.sa = Math.round((imp + ct) * _POPUP_VAT);
  }
  var rKey = _findNameKey(name, _DASHBOARD_RECV_RAW);
  if (rKey) {
    var r = _DASHBOARD_RECV_RAW[rKey];
    var imp2 = (r.imp && typeof r.imp[mi] === 'number') ? r.imp[mi] : 0;
    var ct2  = (r.ct  && typeof r.ct[mi]  === 'number') ? r.ct[mi]  : 0;
    out.ra = Math.round((imp2 + ct2) * _POPUP_VAT);
  }
  return out;
}

// 특정 인물의 현재 월 자동 집계 — 계획은 _PERSON_TARGET, 실적은 원본 raw 우선 → per-person persist → _PERSON_TARGET fallback
function _autoTotalsForPerson(name) {
  if (!name) return null;
  var ptKey = _findNameKey(name, _PERSON_TARGET);
  var ppKey = _findNameKey(name, _DASHBOARD_PER_PERSON);
  var p = ptKey ? _PERSON_TARGET[ptKey] : null;
  var pp = ppKey ? _DASHBOARD_PER_PERSON[ppKey] : null;
  var raw = _computeActualFromRaw(name); // {sa, ra} — null if no raw data
  // 계획: _PERSON_TARGET 우선 (VAT 포함 저장됨), 없으면 per-person persist 의 sp/rp
  var sp = p ? Number(p.sp) || 0 : (pp ? Number(pp.sp) || 0 : 0);
  var rp = p ? Number(p.rp) || 0 : (pp ? Number(pp.rp) || 0 : 0);
  // 실적: raw 우선 → per-person persist → _PERSON_TARGET
  var sa = (raw.sa !== null) ? raw.sa : (pp ? Number(pp.sa) || 0 : (p ? Number(p.sa) || 0 : 0));
  var ra = (raw.ra !== null) ? raw.ra : (pp ? Number(pp.ra) || 0 : (p ? Number(p.ra) || 0 : 0));
  if (!sp && !sa && !rp && !ra) return null;
  return { sp:sp, sa:sa, rp:rp, ra:ra };
}

// 특정 팀의 현재 월 자동 집계 — 계획은 _TEAM_TARGET, 실적은 raw 팀 합산 우선
function _autoTotalsForTeam(team) {
  if (!team) return null;
  var tdKey = _findNameKey(team, _TEAM_TARGET);
  var ptKey = _findNameKey(team, _DASHBOARD_PER_TEAM);
  var td = tdKey ? _TEAM_TARGET[tdKey] : null;
  var pt = ptKey ? _DASHBOARD_PER_TEAM[ptKey] : null;
  // raw 데이터로 팀 실적 계산: _PERSON_TEAM_MAP 로 팀 멤버 식별 (팀명 대소문자 무시)
  var teamNorm = String(team).trim().toLowerCase();
  var rawSa = 0, rawRa = 0, rawAny = false;
  Object.keys(_PERSON_TEAM_MAP || {}).forEach(function(name){
    if (String(_PERSON_TEAM_MAP[name]||'').trim().toLowerCase() !== teamNorm) return;
    var r = _computeActualFromRaw(name);
    if (r.sa !== null) { rawSa += r.sa; rawAny = true; }
    if (r.ra !== null) { rawRa += r.ra; rawAny = true; }
  });
  var sp = td ? Number(td.sp) || 0 : (pt ? Number(pt.sp) || 0 : 0);
  var rp = td ? Number(td.rp) || 0 : (pt ? Number(pt.rp) || 0 : 0);
  var sa = rawAny ? rawSa : (pt ? Number(pt.sa) || 0 : (td ? Number(td.sa) || 0 : 0));
  var ra = rawAny ? rawRa : (pt ? Number(pt.ra) || 0 : (td ? Number(td.ra) || 0 : 0));
  if (!sp && !sa && !rp && !ra) return null;
  return { sp:sp, sa:sa, rp:rp, ra:ra };
}

// 현재 월의 자동 집계 — preview-target.html popupTotals 우선, 없으면 _PERSON_TARGET 합산
// target/name 인자가 있으면 per-person/per-team 값을 우선 반환
function _autoTotals(target, name) {
  if (target === 'personal_sales' && name) {
    var pp = _autoTotalsForPerson(name);
    if (pp) return pp;
  } else if (target === 'team_leader' && name) {
    var pt = _autoTotalsForTeam(name);
    if (pt) return pt;
  }
  if (_DASHBOARD_TOTALS && (_DASHBOARD_TOTALS.sp || _DASHBOARD_TOTALS.sa || _DASHBOARD_TOTALS.rp || _DASHBOARD_TOTALS.ra)) {
    return {
      sp: Number(_DASHBOARD_TOTALS.sp) || 0,
      sa: Number(_DASHBOARD_TOTALS.sa) || 0,
      rp: Number(_DASHBOARD_TOTALS.rp) || 0,
      ra: Number(_DASHBOARD_TOTALS.ra) || 0
    };
  }
  var sp=0, sa=0, rp=0, ra=0;
  Object.keys(_PERSON_TARGET || {}).forEach(function(k) {
    var p = _PERSON_TARGET[k] || {};
    sp += Number(p.sp)||0; sa += Number(p.sa)||0;
    rp += Number(p.rp)||0; ra += Number(p.ra)||0;
  });
  return { sp:sp, sa:sa, rp:rp, ra:ra };
}

function _autoTitleText() {
  var m = new Date().getMonth() + 1;
  return m + '월 목표 달성 현황';
}
function _autoSubtitleText() {
  var now = new Date();
  var m = now.getMonth() + 1;
  return now.getFullYear() + '년 ' + m + '월 1일 ~ ' + m + '월 ' + now.getDate() + '일 기준';
}

var _popupConfig = null;

function _loadPopupConfig() {
  try {
    var saved = localStorage.getItem('popup_config');
    if (saved) { _popupConfig = JSON.parse(saved); return; }
  } catch(e) {}
  _popupConfig = JSON.parse(JSON.stringify(_POPUP_DEFAULT));
}

function _savePopupConfig() {
  localStorage.setItem('popup_config', JSON.stringify(_popupConfig));
  // Firebase에도 저장 (다른 기기에서도 공유)
  if (typeof _fbDb !== 'undefined' && _fbDb) {
    try { _fbDb.collection('settings').doc('popupConfig').set(_popupConfig); } catch(e) { console.warn('[Popup] Firebase save error:', e); }
  }
}

function _loadPopupConfigFromFirebase(cb) {
  if (typeof _fbDb !== 'undefined' && _fbDb) {
    _fbDb.collection('settings').doc('popupConfig').get().then(function(doc) {
      if (doc.exists) { _popupConfig = doc.data(); localStorage.setItem('popup_config', JSON.stringify(_popupConfig)); }
      else { _loadPopupConfig(); }
      if (cb) cb();
    }).catch(function(e) { console.warn('[Popup] Firebase load error:', e); _loadPopupConfig(); if (cb) cb(); });
  } else { _loadPopupConfig(); if (cb) cb(); }
}

// 개인 맞춤형 팝업 생성 — 대시보드 per-person 우선, 없으면 _PERSON_TARGET fallback
function _buildPersonalConfig(cfg, userName) {
  var p = _autoTotalsForPerson(userName);
  if (!p) return null;
  var personal = JSON.parse(JSON.stringify(cfg));
  personal._isPersonal = true;
  personal._personName = userName;
  personal.rows = [
    { label:'_sales_', icon:'📈', plan:p.sp, actual:p.sa, color:'#60a5fa', barColor:'linear-gradient(90deg,#3b82f6,#60a5fa)' },
    { label:'_recv_', icon:'💰', plan:p.rp, actual:p.ra, color:'#4ade80', barColor:'linear-gradient(90deg,#22c55e,#4ade80)' }
  ];
  var sPct = p.sp ? Math.round(p.sa/p.sp*100) : 0;
  var rPct = p.rp ? Math.round(p.ra/p.rp*100) : 0;
  var avg = Math.round((sPct + rPct) / 2);
  if (avg >= 100) personal._msgKey = 'popup_msg_100';
  else if (avg >= 70) personal._msgKey = 'popup_msg_70';
  else if (avg >= 40) personal._msgKey = 'popup_msg_40';
  else personal._msgKey = 'popup_msg_0';
  return personal;
}

// 팀장 맞춤형 팝업 생성 — 대시보드 per-team 우선, 없으면 _TEAM_TARGET fallback
function _buildTeamLeaderConfig(cfg, teamName) {
  var td = _autoTotalsForTeam(teamName);
  if (!td) return null;
  var teamCfg = JSON.parse(JSON.stringify(cfg));
  teamCfg._isTeamLeader = true;
  teamCfg._teamName = teamName;
  teamCfg.rows = [
    { label:'_sales_', icon:'📈', plan:td.sp, actual:td.sa, color:'#60a5fa', barColor:'linear-gradient(90deg,#3b82f6,#60a5fa)' },
    { label:'_recv_', icon:'💰', plan:td.rp, actual:td.ra, color:'#4ade80', barColor:'linear-gradient(90deg,#22c55e,#4ade80)' }
  ];
  var sPct = td.sp ? Math.round(td.sa/td.sp*100) : 0;
  var rPct = td.rp ? Math.round(td.ra/td.rp*100) : 0;
  var avg = Math.round((sPct + rPct) / 2);
  if (avg >= 100) teamCfg._msgKey = 'popup_msg_100';
  else if (avg >= 70) teamCfg._msgKey = 'popup_msg_70';
  else if (avg >= 40) teamCfg._msgKey = 'popup_msg_40';
  else teamCfg._msgKey = 'popup_msg_0';
  return teamCfg;
}

function _fmtBaht(n) { return '฿' + Number(n).toLocaleString(); }

// 월 이름 (언어별)
var _MONTH_NAMES = {
  ko:['1','2','3','4','5','6','7','8','9','10','11','12'],
  en:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  th:['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
};

function _buildPopupHTML(cfg) {
  // 자동 필드 해석 (cfg 사본을 수정하지 않고 렌더용으로만)
  cfg = JSON.parse(JSON.stringify(cfg));
  // 개인/팀장 모드에서는 해당 대상의 per-person/per-team 총계를 쓴다
  var _auto;
  if (cfg._isPersonal && cfg._personName) _auto = _autoTotals('personal_sales', cfg._personName) || _autoTotals();
  else if (cfg._isTeamLeader && cfg._teamName) _auto = _autoTotals('team_leader', cfg._teamName) || _autoTotals();
  else _auto = _autoTotals();
  if (cfg.autoTitle) cfg.title = _autoTitleText();
  if (cfg.autoSubtitle) cfg.subtitle = _autoSubtitleText();
  (cfg.rows || []).forEach(function(r) {
    if (!r.auto) return;
    if (r.label === '_sales_') { r.plan = _auto.sp; r.actual = _auto.sa; }
    else if (r.label === '_recv_') { r.plan = _auto.rp; r.actual = _auto.ra; }
  });
  var ds = _POPUP_DESIGNS[cfg.design] || _POPUP_DESIGNS.dark;
  var isLight = cfg.design === 'light';
  var lang = (typeof currentLang !== 'undefined') ? currentLang : 'ko';
  var monthIdx = 3; // 4월 (0-based)
  var monthLabel = (_MONTH_NAMES[lang] || _MONTH_NAMES.ko)[monthIdx];
  var year = '2026';
  var day = '9';

  // 제목/부제목 다국어 처리
  var title, subtitle, footerMsg, footerSub;
  if (cfg._isPersonal) {
    title = t('popup_personal_title').replace('{name}', cfg._personName).replace('{month}', monthLabel);
    footerMsg = t(cfg._msgKey || 'popup_msg_40');
  } else if (cfg._isTeamLeader) {
    title = t('popup_team_title').replace('{team}', cfg._teamName).replace('{month}', monthLabel);
    footerMsg = t(cfg._msgKey || 'popup_msg_40');
  } else {
    // autoTitle 체크 시 → 자동 템플릿(i18n), 아니면 사용자 지정값 사용
    if (cfg.autoTitle) title = t('popup_target_title').replace('{month}', monthLabel);
    else title = cfg.title || t('popup_target_title').replace('{month}', monthLabel);
    if (cfg.footerMsg) { footerMsg = cfg.footerMsg; }
    else {
      // 자동 달성률 기반 메시지
      var _totalPlan = 0, _totalActual = 0;
      cfg.rows.forEach(function(r){ _totalPlan += r.plan; _totalActual += r.actual; });
      var _avgPct = _totalPlan ? Math.round(_totalActual / _totalPlan * 100) : 0;
      if (_avgPct >= 100) footerMsg = t('popup_msg_100');
      else if (_avgPct >= 70) footerMsg = t('popup_msg_70');
      else if (_avgPct >= 40) footerMsg = t('popup_msg_40');
      else footerMsg = t('popup_msg_0');
    }
  }
  // 부제목: autoSubtitle 이면 자동 생성, 아니면 사용자 지정값
  if (cfg._isPersonal || cfg._isTeamLeader || cfg.autoSubtitle) {
    subtitle = t('popup_subtitle').replace('{year}', year).replace(/\{month\}/g, monthLabel).replace('{day}', day);
  } else {
    subtitle = cfg.subtitle || t('popup_subtitle').replace('{year}', year).replace(/\{month\}/g, monthLabel).replace('{day}', day);
  }
  footerSub = cfg.footerSub || t('popup_click_hint');

  // 사용자 입력 필드는 모두 HTML 이스케이프 (XSS/SyntaxError 방지)
  // 특히 linkUrl 이 attr에 들어갈 때 하이픈이 JS로 파싱되는 문제 차단
  var _eTitle = _escHtml(title);
  var _eSub   = _escHtml(subtitle);
  var _eFoot  = _escHtml(footerMsg);
  var _eFootSub = _escHtml(footerSub);
  var _eIcon  = _escHtml(cfg.icon || '');
  var h = '';
  h += '<div style="background:'+ds.bg+';border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35);">';
  // 헤더
  h += '<div style="background:'+ds.headerBg+';padding:18px 24px;text-align:center;">';
  h += '<div style="font-size:32px;margin-bottom:4px;">'+_eIcon+'</div>';
  h += '<div style="font-size:16px;font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.2);">'+_eTitle+'</div>';
  h += '<div style="font-size:11px;color:rgba(255,255,255,.8);margin-top:2px;">'+_eSub+'</div>';
  h += '</div>';
  // 데이터 행
  cfg.rows.forEach(function(row, i) {
    var pct = row.plan ? Math.round(row.actual / row.plan * 100) : 0;
    var pad = i === 0 ? '16px 24px 8px' : '8px 24px ' + (i === cfg.rows.length-1 ? '16px' : '8px');
    // 행 라벨 다국어
    var rowLabel = row.label;
    if (row.label === '_sales_') rowLabel = t('popup_sales');
    else if (row.label === '_recv_') rowLabel = t('popup_recv');

    h += '<div style="padding:'+pad+';">';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
    h += '<span style="font-size:20px;">'+_escHtml(row.icon||'')+'</span>';
    h += '<span style="font-size:14px;font-weight:700;color:'+row.color+';">'+_escHtml(rowLabel)+'</span>';
    h += '</div>';
    h += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">';
    h += '<span style="font-size:12px;color:'+ds.subColor+';">'+t('popup_plan')+'</span>';
    h += '<span style="font-size:16px;font-weight:800;color:'+ds.textColor+';">'+_fmtBaht(row.plan)+'</span></div>';
    h += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">';
    h += '<span style="font-size:12px;color:'+ds.subColor+';">'+t('popup_actual')+'</span>';
    h += '<span style="font-size:16px;font-weight:800;color:'+row.color+';">'+_fmtBaht(row.actual)+'</span></div>';
    h += '<div style="background:'+(isLight?'#e2e8f0':'#1e293b')+';border-radius:6px;height:8px;overflow:hidden;margin-bottom:4px;">';
    h += '<div class="popup-bar-anim" style="height:100%;border-radius:6px;background:'+row.barColor+';width:0%;transition:width 1s ease-out;" data-pct="'+Math.min(pct,100)+'"></div></div>';
    h += '<div style="text-align:right;"><span style="font-size:20px;font-weight:900;color:'+ds.accentColor+';">'+pct+'%</span></div>';
    h += '</div>';
  });
  // 하단
  h += '<div style="background:rgba(0,0,0,.2);padding:14px 24px;text-align:center;">';
  h += '<div style="font-size:13px;color:'+ds.accentColor+';font-weight:700;margin-bottom:6px;">'+_eFoot+'</div>';
  h += '<div style="font-size:11px;color:'+ds.subColor+';">'+_eFootSub+'</div>';
  h += '</div></div>';
  return h;
}

function showTargetAlert(personalName, teamName) {
  if (!_popupConfig) _loadPopupConfig();
  if (!_popupConfig || !_popupConfig.enabled) { console.log('[Popup] showTargetAlert skip: config/enabled 없음'); return; }
  var cfg = _popupConfig;
  // 팀장 맞춤형 모드 (team_leader 전용 또는 personal_sales에서 팀장 자동 분기)
  if (teamName && (_popupConfig.target === 'team_leader' || _popupConfig.target === 'personal_sales')) {
    var teamCfg = _buildTeamLeaderConfig(_popupConfig, teamName);
    if (!teamCfg) {
      console.warn('[Popup] 팀 데이터 없음 ('+teamName+') → generic 팝업으로 fallback');
    } else { cfg = teamCfg; }
  }
  // 개인 맞춤형 모드 (팀원)
  else if (personalName && _popupConfig.target === 'personal_sales') {
    var personal = _buildPersonalConfig(_popupConfig, personalName);
    if (!personal) {
      console.warn('[Popup] 개인 데이터 없음 ('+personalName+') → _PERSON_TARGET keys:', Object.keys(_PERSON_TARGET||{}), '_DASHBOARD_PER_PERSON keys:', Object.keys(_DASHBOARD_PER_PERSON||{}), '_DASHBOARD_SALES_RAW keys:', Object.keys(_DASHBOARD_SALES_RAW||{}));
      console.warn('[Popup] → generic 팝업으로 fallback');
    } else { cfg = personal; }
  }
  var box = document.getElementById('popupAlertBox');
  box.innerHTML = _buildPopupHTML(cfg);
  var ov = document.getElementById('popupAlertOverlay');
  ov.style.display = 'flex';
  setTimeout(function() {
    box.style.transform = 'scale(1)';
    box.style.opacity = '1';
    setTimeout(function() {
      box.querySelectorAll('.popup-bar-anim').forEach(function(bar) {
        bar.style.width = bar.getAttribute('data-pct') + '%';
      });
    }, 200);
  }, 50);
}
function _popupClose() {
  var box = document.getElementById('popupAlertBox');
  box.style.transform = 'scale(0.8)'; box.style.opacity = '0';
  setTimeout(function() { document.getElementById('popupAlertOverlay').style.display = 'none'; }, 300);
}
function _popupAction() {
  var url = _popupConfig && _popupConfig.linkUrl ? _popupConfig.linkUrl : '';
  _popupClose();
  if (url) setTimeout(function() { location.href = url; }, 300);
}

// ── 팝업 관리 패널 ──────────────────────────────────────────────────────────
function openPopupMgmt() {
  _loadPopupConfig();
  // 매번 새 값으로 로드 (preview-target.html 동기화)
  _dashboardTotalsLoaded = false;
  // 자동 집계용 데이터 + 저장된 템플레이트 + 대시보드 총계 로드
  _loadTargetData(function(){
    _loadDashboardTotals(function(){
      _loadUserTemplates(function(){ _renderPopupMgmt(); });
    });
  });
  document.getElementById('popupMgmtOverlay').classList.add('open');
}

function _renderPopupMgmt() {
  var c = _popupConfig;
  // 누락된 신규 필드 보정 (기존 localStorage 호환)
  if (typeof c.autoTitle === 'undefined') c.autoTitle = false;
  if (typeof c.autoSubtitle === 'undefined') c.autoSubtitle = false;
  if (!c.templateKey) c.templateKey = 'sales_recv';
  (c.rows || []).forEach(function(r){ if (typeof r.auto === 'undefined') r.auto = false; });

  var body = document.getElementById('popupMgmtBody');
  if (!body) return;
  // 미리보기 대상에 따라 _auto 값 결정
  // - personal_sales + 선택된 인물 → 해당 인물의 per-person 총계
  // - team_leader + 선택된 팀 → 해당 팀의 per-team 총계
  // - 그 외 → 전체 총계
  var _auto;
  if (c.target === 'personal_sales' && _previewPerson) {
    _auto = _autoTotals('personal_sales', _previewPerson) || _autoTotals();
  } else if (c.target === 'team_leader' && _previewTeam) {
    _auto = _autoTotals('team_leader', _previewTeam) || _autoTotals();
  } else {
    _auto = _autoTotals();
  }
  var h = '';

  // ON/OFF
  h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f8fafc;border-radius:12px;margin-bottom:16px;border:1px solid #e5e7eb;">';
  h += '<div><div style="font-size:14px;font-weight:700;color:#1e293b;">팝업 활성화</div><div style="font-size:11px;color:#6b7280;">로그인 시 팝업을 표시합니다</div></div>';
  h += '<label style="position:relative;width:48px;height:26px;cursor:pointer;">';
  h += '<input type="checkbox" id="popupEnabled" '+(c.enabled?'checked':'')+' onchange="_popupConfig.enabled=this.checked;_savePopupConfig()" style="opacity:0;width:0;height:0;">';
  h += '<span style="position:absolute;inset:0;background:'+(c.enabled?'#2563eb':'#d1d5db')+';border-radius:13px;transition:.3s;" onclick="var cb=this.previousElementSibling;cb.checked=!cb.checked;cb.dispatchEvent(new Event(\'change\'));this.style.background=cb.checked?\'#2563eb\':\'#d1d5db\';this.querySelector(\'span\').style.transform=cb.checked?\'translateX(22px)\':\'translateX(0)\';"><span style="position:absolute;top:3px;left:3px;width:20px;height:20px;background:#fff;border-radius:50%;transition:.3s;transform:'+(c.enabled?'translateX(22px)':'translateX(0)')+';box-shadow:0 1px 3px rgba(0,0,0,.2);"></span></span>';
  h += '</label></div>';

  // 디자인 선택
  h += '<div style="margin-bottom:16px;">';
  h += '<div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px;">🎨 디자인 선택</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">';
  Object.keys(_POPUP_DESIGNS).forEach(function(key) {
    var d = _POPUP_DESIGNS[key];
    var sel = c.design === key;
    h += '<button onclick="_selectDesign(\''+key+'\')" style="padding:8px 4px;border:2px solid '+(sel?'#2563eb':'#e5e7eb')+';border-radius:10px;background:'+(sel?'#eff6ff':'#fff')+';cursor:pointer;text-align:center;font-size:12px;font-weight:'+(sel?'700':'500')+';color:'+(sel?'#2563eb':'#374151')+';transition:.2s;">'+d.name+'</button>';
  });
  h += '</div></div>';

  // 🎯 템플레이트 선택 (구 "아이콘" 자리 대체)
  var _isUserTpl = String(c.templateKey||'').indexOf('user:') === 0;
  var _isBlankTpl = c.templateKey === 'new';
  h += '<div style="margin-bottom:12px;">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">';
  h += '<label style="font-size:12px;font-weight:600;color:#6b7280;">📁 템플레이트</label>';
  h += '<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#059669;cursor:pointer;font-weight:600;">';
  h += '<input type="checkbox" id="popupNewTpl" '+(_isBlankTpl?'checked':'')+' onchange="_toggleNewTemplate(this.checked)" style="accent-color:#059669;cursor:pointer;"> ✨ 새 작성</label>';
  h += '</div>';
  h += '<div style="display:flex;gap:6px;align-items:stretch;">';
  h += '<select id="popupTemplate" onchange="_applyPopupTemplate(this.value)" style="flex:1;min-width:0;padding:9px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;background:#fff;font-weight:600;">';
  if (_isBlankTpl) h += '<option value="new" selected>✨ (새 작성 중)</option>';
  Object.keys(_POPUP_TEMPLATES).forEach(function(k){
    var tpl = _POPUP_TEMPLATES[k];
    h += '<option value="'+k+'" '+(c.templateKey===k?'selected':'')+'>'+tpl.name+'</option>';
  });
  if (_USER_TEMPLATES.length) {
    h += '<optgroup label="── 저장한 템플레이트 ──">';
    _USER_TEMPLATES.forEach(function(t, idx){
      var key = 'user:'+idx;
      h += '<option value="'+key+'" '+(c.templateKey===key?'selected':'')+'>💾 '+_escHtml(t.name)+'</option>';
    });
    h += '</optgroup>';
  }
  h += '</select>';
  // 🗑️ 삭제 버튼 — 사용자 템플레이트 선택 시만 활성화
  h += '<button onclick="_deleteUserTemplate()" '+(_isUserTpl?'':'disabled')+' title="'+(_isUserTpl?'선택한 템플레이트 삭제':'저장된 사용자 템플레이트 선택 시 활성화')+'" style="padding:0 14px;border:1.5px solid '+(_isUserTpl?'#dc2626':'#e5e7eb')+';border-radius:8px;background:'+(_isUserTpl?'#fee2e2':'#f3f4f6')+';color:'+(_isUserTpl?'#dc2626':'#9ca3af')+';font-size:14px;font-weight:700;cursor:'+(_isUserTpl?'pointer':'not-allowed')+';flex-shrink:0;">🗑️</button>';
  h += '</div>';
  h += '</div>';

  // 제목 (자동 체크박스 포함)
  h += '<div style="margin-bottom:12px;">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">';
  h += '<label style="font-size:12px;font-weight:600;color:#6b7280;">제목</label>';
  h += '<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#2563eb;cursor:pointer;font-weight:600;">';
  h += '<input type="checkbox" id="popupAutoTitle" '+(c.autoTitle?'checked':'')+' onchange="_togglePopupAuto(\'title\',this.checked)" style="accent-color:#2563eb;cursor:pointer;"> 자동</label>';
  h += '</div>';
  var _titleVal = c.autoTitle ? _autoTitleText() : (c.title||'');
  h += '<input id="popupTitle" value="'+_escHtml(_titleVal)+'" '+(c.autoTitle?'disabled':'')+' onchange="_popupConfig.title=this.value;_savePopupConfig()" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;background:'+(c.autoTitle?'#f3f4f6':'#fff')+';color:'+(c.autoTitle?'#6b7280':'#111')+';">';
  h += '</div>';

  // 부제목 (자동 체크박스 포함)
  h += '<div style="margin-bottom:12px;">';
  h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">';
  h += '<label style="font-size:12px;font-weight:600;color:#6b7280;">부제목</label>';
  h += '<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#2563eb;cursor:pointer;font-weight:600;">';
  h += '<input type="checkbox" id="popupAutoSubtitle" '+(c.autoSubtitle?'checked':'')+' onchange="_togglePopupAuto(\'subtitle\',this.checked)" style="accent-color:#2563eb;cursor:pointer;"> 자동</label>';
  h += '</div>';
  var _subVal = c.autoSubtitle ? _autoSubtitleText() : (c.subtitle||'');
  h += '<input id="popupSubtitle" value="'+_escHtml(_subVal)+'" '+(c.autoSubtitle?'disabled':'')+' onchange="_popupConfig.subtitle=this.value;_savePopupConfig()" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;background:'+(c.autoSubtitle?'#f3f4f6':'#fff')+';color:'+(c.autoSubtitle?'#6b7280':'#111')+';">';
  h += '</div>';

  // 데이터 행 (각 행에 자동 체크박스 추가)
  if (c.rows && c.rows.length) {
    h += '<div style="margin-bottom:12px;">';
    h += '<div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px;">📊 데이터 항목</div>';
    c.rows.forEach(function(row, i) {
      // 자동 체크 시 표시는 _auto 값을 보여주되, 원본 config에는 손대지 않음
      var dispPlan = row.auto ? (row.label==='_sales_'?_auto.sp:row.label==='_recv_'?_auto.rp:row.plan) : row.plan;
      var dispAct  = row.auto ? (row.label==='_sales_'?_auto.sa:row.label==='_recv_'?_auto.ra:row.actual) : row.actual;
      var pct = dispPlan ? Math.round(dispAct/dispPlan*100) : 0;
      h += '<div style="background:'+(row.auto?'#eff6ff':'#f8fafc')+';border:1px solid '+(row.auto?'#bfdbfe':'#e5e7eb')+';border-radius:10px;padding:12px;margin-bottom:8px;">';
      h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">';
      var _dispLabel = row.label==='_sales_'?t('popup_sales'):row.label==='_recv_'?t('popup_recv'):row.label;
      h += '<span style="font-size:13px;font-weight:700;color:#374151;">'+row.icon+' '+_dispLabel+'</span>';
      h += '<div style="display:flex;align-items:center;gap:8px;">';
      h += '<label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#2563eb;cursor:pointer;font-weight:600;">';
      h += '<input type="checkbox" '+(row.auto?'checked':'')+' onchange="_togglePopupRowAuto('+i+',this.checked)" style="accent-color:#2563eb;cursor:pointer;"> 자동</label>';
      h += '<button onclick="_editPopupRow('+i+')" '+(row.auto?'disabled':'')+' style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:'+(row.auto?'#f3f4f6':'#fff')+';font-size:11px;cursor:'+(row.auto?'not-allowed':'pointer')+';color:'+(row.auto?'#9ca3af':'#6b7280')+';">✏️ 편집</button>';
      h += '</div></div>';
      h += '<div style="display:flex;gap:12px;font-size:12px;color:#6b7280;flex-wrap:wrap;">';
      h += '<span>목표: <b style="color:#1e293b;">'+_fmtBaht(dispPlan)+'</b></span>';
      h += '<span>실적: <b style="color:#2563eb;">'+_fmtBaht(dispAct)+'</b></span>';
      h += '<span style="font-weight:700;color:'+(pct>=100?'#16a34a':'#dc2626')+';">'+pct+'%</span>';
      if (row.auto) h += '<span style="margin-left:auto;font-size:10px;color:#1d4ed8;font-weight:700;">🔗 preview-target 연동</span>';
      h += '</div></div>';
    });
    h += '</div>';
  }

  // 하단 메시지
  h += '<div style="margin-bottom:12px;">';
  h += '<label style="font-size:12px;font-weight:600;color:#6b7280;">하단 메시지</label>';
  h += '<input id="popupFooterMsg" value="'+_escHtml(c.footerMsg)+'" onchange="_popupConfig.footerMsg=this.value;_savePopupConfig()" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;">';
  h += '</div>';
  h += '<div style="margin-bottom:12px;">';
  h += '<label style="font-size:12px;font-weight:600;color:#6b7280;">하단 안내문</label>';
  h += '<input id="popupFooterSub" value="'+_escHtml(c.footerSub)+'" onchange="_popupConfig.footerSub=this.value;_savePopupConfig()" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;">';
  h += '</div>';

  // 링크 URL
  h += '<div style="margin-bottom:12px;">';
  h += '<label style="font-size:12px;font-weight:600;color:#6b7280;">클릭 시 이동 URL</label>';
  h += '<input id="popupLinkUrl" value="'+_escHtml(c.linkUrl)+'" onchange="_popupConfig.linkUrl=this.value;_savePopupConfig()" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;">';
  h += '</div>';

  // 대상
  h += '<div style="margin-bottom:16px;">';
  h += '<label style="font-size:12px;font-weight:600;color:#6b7280;">표시 대상</label>';
  h += '<select id="popupTarget" onchange="_popupConfig.target=this.value;_savePopupConfig();_renderPopupMgmt();" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;background:#fff;">';
  h += '<option value="all" '+(c.target==='all'?'selected':'')+'>전체 사용자</option>';
  h += '<option value="dept_Sales" '+(c.target==='dept_Sales'?'selected':'')+'>영업 부서 (Sales)</option>';
  h += '<option value="dept_Office" '+(c.target==='dept_Office'?'selected':'')+'>오피스 (Office)</option>';
  h += '<option value="personal_sales" '+(c.target==='personal_sales'?'selected':'')+'>⭐ 영업 개인 맞춤형</option>';
  h += '<option value="team_leader" '+(c.target==='team_leader'?'selected':'')+'>👔 영업 팀장 (팀별)</option>';
  h += '<option value="admin" '+(c.target==='admin'?'selected':'')+'>관리자만</option>';
  h += '<option value="T2408087" '+(c.target==='T2408087'?'selected':'')+'>나만 (T2408087)</option>';
  h += '</select>';
  if (c.target === 'personal_sales') {
    h += '<div style="margin-top:6px;padding:10px 12px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;font-size:11px;color:#92400e;line-height:1.5;">';
    h += '⭐ <b>개인 맞춤형 모드</b>: 영업 <b>팀장</b>은 <b>소속 팀 실적</b>, <b>팀원</b>은 <b>개인 실적</b>이 자동으로 표시됩니다.</div>';
  } else if (c.target === 'team_leader') {
    h += '<div style="margin-top:6px;padding:10px 12px;background:#dbeafe;border:1px solid #93c5fd;border-radius:8px;font-size:11px;color:#1e40af;line-height:1.5;">';
    h += '👔 <b>팀장 모드</b>: 영업 팀장(Group Leader/매니저)이 로그인하면 <b>소속 팀의 목표, 실적, 달성률</b>이 자동으로 표시됩니다.</div>';
  }
  h += '</div>';

  // 미리보기 대상 선택 — 선택값이 바뀌면 데이터행도 해당 대상 숫자로 갱신
  if (c.target === 'personal_sales') {
    // 아직 선택 안 된 경우 첫 이름으로 기본 설정
    var _personNames = Object.keys(_DASHBOARD_PER_PERSON || {});
    if (!_personNames.length) _personNames = Object.keys(_PERSON_TARGET || {});
    if (!_previewPerson && _personNames.length) _previewPerson = _personNames[0];
    h += '<div style="margin-bottom:8px;">';
    h += '<label style="font-size:12px;font-weight:600;color:#6b7280;">미리보기 대상 (개인)</label>';
    h += '<select id="previewPerson" onchange="_previewPerson=this.value;_renderPopupMgmt();" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;background:#fff;">';
    _personNames.forEach(function(name) { h += '<option value="'+name+'" '+(_previewPerson===name?'selected':'')+'>'+name+'</option>'; });
    h += '</select></div>';
  } else if (c.target === 'team_leader') {
    var _teamNames = Object.keys(_DASHBOARD_PER_TEAM || {});
    if (!_teamNames.length) _teamNames = Object.keys(_TEAM_TARGET || {});
    if (!_previewTeam && _teamNames.length) _previewTeam = _teamNames[0];
    h += '<div style="margin-bottom:8px;">';
    h += '<label style="font-size:12px;font-weight:600;color:#6b7280;">미리보기 대상 (팀)</label>';
    h += '<select id="previewTeam" onchange="_previewTeam=this.value;_renderPopupMgmt();" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;background:#fff;">';
    _teamNames.forEach(function(team) { h += '<option value="'+team+'" '+(_previewTeam===team?'selected':'')+'>'+team+'</option>'; });
    h += '</select></div>';
  }

  // 하단 3개 버튼 (개인 미리보기 / 초기화 / 저장) — 균등 너비
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:12px;">';
  var previewJs;
  if (c.target === 'team_leader') previewJs = 'showTargetAlert(null,document.getElementById(\'previewTeam\').value)';
  else if (c.target === 'personal_sales') previewJs = 'showTargetAlert(document.getElementById(\'previewPerson\').value)';
  else previewJs = 'showTargetAlert()';
  h += '<button onclick="'+previewJs+'" style="padding:12px 6px;border:none;border-radius:10px;background:#2563eb;color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">👁️ 개인 미리보기</button>';
  h += '<button onclick="_resetPopupConfig()" style="padding:12px 6px;border:1.5px solid #d1d5db;border-radius:10px;background:#fff;color:#6b7280;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">↩️ 초기화</button>';
  h += '<button onclick="_saveAsPopupTemplate()" style="padding:12px 6px;border:none;border-radius:10px;background:#059669;color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">💾 저장</button>';
  h += '</div>';

  body.innerHTML = h;
}

function closePopupMgmt() {
  document.getElementById('popupMgmtOverlay').classList.remove('open');
  closePopupEdit();
}

function _selectDesign(key) {
  _popupConfig.design = key;
  _savePopupConfig();
  _renderPopupMgmt(); // 새로고침 (데이터 재로드 불필요)
}

// ── 템플레이트 적용 ───────────────────────────────────────────────────────
function _applyPopupTemplate(key) {
  var tpl;
  if (String(key).indexOf('user:') === 0) {
    var idx = parseInt(String(key).slice(5), 10);
    tpl = _USER_TEMPLATES[idx];
    if (!tpl) return;
  } else {
    tpl = _POPUP_TEMPLATES[key];
    if (!tpl) return;
  }
  // 템플레이트 필드를 현재 config에 병합 (디자인/대상/활성화 상태는 보존)
  _popupConfig.templateKey = key;
  if (typeof tpl.icon !== 'undefined') _popupConfig.icon = tpl.icon;
  if (typeof tpl.title !== 'undefined') _popupConfig.title = tpl.title;
  if (typeof tpl.subtitle !== 'undefined') _popupConfig.subtitle = tpl.subtitle;
  if (typeof tpl.autoTitle !== 'undefined') _popupConfig.autoTitle = !!tpl.autoTitle;
  if (typeof tpl.autoSubtitle !== 'undefined') _popupConfig.autoSubtitle = !!tpl.autoSubtitle;
  if (Array.isArray(tpl.rows)) _popupConfig.rows = JSON.parse(JSON.stringify(tpl.rows));
  if (typeof tpl.footerMsg !== 'undefined') _popupConfig.footerMsg = tpl.footerMsg;
  if (typeof tpl.footerSub !== 'undefined') _popupConfig.footerSub = tpl.footerSub;
  if (typeof tpl.linkUrl !== 'undefined') _popupConfig.linkUrl = tpl.linkUrl;
  _savePopupConfig();
  _renderPopupMgmt();
}

// ── 자동 체크 토글 (제목/부제목) ────────────────────────────────────────────
function _togglePopupAuto(field, checked) {
  if (field === 'title') _popupConfig.autoTitle = !!checked;
  else if (field === 'subtitle') _popupConfig.autoSubtitle = !!checked;
  _savePopupConfig();
  _renderPopupMgmt();
}

// ── 자동 체크 토글 (데이터 행) ──────────────────────────────────────────────
function _togglePopupRowAuto(idx, checked) {
  if (!_popupConfig.rows || !_popupConfig.rows[idx]) return;
  _popupConfig.rows[idx].auto = !!checked;
  _savePopupConfig();
  _renderPopupMgmt();
}

// ── 현재 구성을 사용자 템플레이트로 저장 ────────────────────────────────────
function _saveAsPopupTemplate() {
  var curKey = _popupConfig.templateKey || '';
  var isUserTpl = String(curKey).indexOf('user:') === 0;
  var isBuiltIn = !!_POPUP_TEMPLATES[curKey];
  var isNewBlank = curKey === 'new';

  // 사용자 템플레이트 → 같은 이름으로 덮어쓰기 (프롬프트 없음)
  if (isUserTpl) {
    var idx = parseInt(String(curKey).slice(5), 10);
    var existing = _USER_TEMPLATES[idx];
    if (!existing) { alert('⚠️ 선택된 템플레이트를 찾을 수 없어요.'); return; }
    var snapU = JSON.parse(JSON.stringify(_popupConfig));
    delete snapU.templateKey; delete snapU.enabled; delete snapU.target; delete snapU.design;
    snapU.name = existing.name; // 기존 이름 유지
    _USER_TEMPLATES[idx] = snapU;
    _saveUserTemplates();
    _savePopupConfig();
    _renderPopupMgmt();
    alert('✅ "' + existing.name + '" 템플레이트를 업데이트했어요.');
    return;
  }

  // 내장 템플레이트 편집 → 사용자 템플레이트 생성 없이 현재 설정만 저장 (프롬프트 없음)
  if (isBuiltIn) {
    _savePopupConfig();
    _renderPopupMgmt();
    alert('✅ 저장되었습니다.');
    return;
  }

  // ✨ 새 작성 모드 → 새 이름 입력 후 사용자 템플레이트로 저장 (프롬프트 유지)
  if (isNewBlank) {
    var defaultName = '내 템플레이트 ' + (_USER_TEMPLATES.length + 1);
    var name = prompt('저장할 템플레이트 이름을 입력하세요:', defaultName);
    if (!name) return;
    name = String(name).trim();
    if (!name) return;
    var snap = JSON.parse(JSON.stringify(_popupConfig));
    delete snap.templateKey; delete snap.enabled; delete snap.target; delete snap.design;
    snap.name = name;
    _USER_TEMPLATES.push(snap);
    _saveUserTemplates();
    _popupConfig.templateKey = 'user:' + (_USER_TEMPLATES.length - 1);
    _savePopupConfig();
    _renderPopupMgmt();
    alert('✅ 템플레이트 "' + name + '" 저장 완료');
    return;
  }

  // 기타 (templateKey 없음 등) → 그냥 현재 설정 저장
  _savePopupConfig();
  _renderPopupMgmt();
  alert('✅ 저장되었습니다.');
}

// ── 새 작성 토글 (모든 필드 공란으로 초기화) ────────────────────────────────
function _toggleNewTemplate(checked) {
  if (checked) {
    // 디자인/활성/대상은 유지, 내용 필드만 공란
    _popupConfig.templateKey = 'new';
    _popupConfig.icon = '';
    _popupConfig.title = '';
    _popupConfig.subtitle = '';
    _popupConfig.autoTitle = false;
    _popupConfig.autoSubtitle = false;
    _popupConfig.rows = [];
    _popupConfig.footerMsg = '';
    _popupConfig.footerSub = '';
    _popupConfig.linkUrl = '';
  } else {
    // 해제 시 기본 내장 템플레이트로 복귀
    _applyPopupTemplate('sales_recv');
    return;
  }
  _savePopupConfig();
  _renderPopupMgmt();
}

// ── 사용자 템플레이트 삭제 ──────────────────────────────────────────────────
function _deleteUserTemplate() {
  var curKey = _popupConfig.templateKey || '';
  if (String(curKey).indexOf('user:') !== 0) return;
  var idx = parseInt(String(curKey).slice(5), 10);
  var tpl = _USER_TEMPLATES[idx];
  if (!tpl) return;
  if (!confirm('템플레이트 "' + tpl.name + '"을(를) 삭제하시겠습니까?')) return;
  _USER_TEMPLATES.splice(idx, 1);
  _saveUserTemplates();
  // 삭제 후 기본 내장 템플레이트로 복귀
  _popupConfig.templateKey = 'sales_recv';
  _savePopupConfig();
  _renderPopupMgmt();
}

function _escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _editPopupRow(idx) {
  var row = _popupConfig.rows[idx];
  if (!row) return;
  document.getElementById('popupEditTitle').textContent = '항목 편집: ' + row.label;
  var h = '';
  h += '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#6b7280;">라벨</label>';
  h += '<input id="prLabel" value="'+_escHtml(row.label)+'" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;"></div>';
  h += '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#6b7280;">아이콘</label>';
  h += '<input id="prIcon" value="'+_escHtml(row.icon)+'" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;"></div>';
  h += '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#6b7280;">목표 금액 (숫자)</label>';
  h += '<input id="prPlan" type="number" value="'+row.plan+'" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;"></div>';
  h += '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#6b7280;">실적 금액 (숫자)</label>';
  h += '<input id="prActual" type="number" value="'+row.actual+'" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;"></div>';
  h += '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:#6b7280;">색상</label>';
  h += '<input id="prColor" type="color" value="'+row.color+'" style="width:100%;height:40px;border:1.5px solid #d1d5db;border-radius:8px;margin-top:4px;cursor:pointer;"></div>';
  h += '<button onclick="_savePopupRow('+idx+')" style="width:100%;padding:12px;border:none;border-radius:10px;background:#2563eb;color:#fff;font-size:14px;font-weight:700;cursor:pointer;margin-top:8px;">✅ 저장</button>';
  document.getElementById('popupEditBody').innerHTML = h;
  document.getElementById('popupEditPanel').classList.add('open');
}

function _savePopupRow(idx) {
  var row = _popupConfig.rows[idx];
  row.label = document.getElementById('prLabel').value;
  row.icon = document.getElementById('prIcon').value;
  row.plan = parseInt(document.getElementById('prPlan').value) || 0;
  row.actual = parseInt(document.getElementById('prActual').value) || 0;
  row.color = document.getElementById('prColor').value;
  row.barColor = 'linear-gradient(90deg,' + row.color + ',' + row.color + 'cc)';
  _savePopupConfig();
  closePopupEdit();
  _renderPopupMgmt();
}

function closePopupEdit() {
  document.getElementById('popupEditPanel').classList.remove('open');
}

function _resetPopupConfig() {
  if (!confirm('팝업 설정을 초기값으로 되돌리시겠습니까?')) return;
  _popupConfig = JSON.parse(JSON.stringify(_POPUP_DEFAULT));
  _savePopupConfig();
  _renderPopupMgmt();
}
