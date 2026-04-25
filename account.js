// Neo Sales App - Account Settings & Management (auto-separated)
// ── 계정 설정 ────────────────────────────────────────────────────────────────
function openAcctSettings() {
  console.log('[openAcctSettings] 호출됨');
  try {
  const user = getCurrentUser();
  if (!user) { console.warn('[openAcctSettings] no user — sessionStorage:', sessionStorage.getItem('current_user')); return; }
  console.log('[openAcctSettings] user:', user.empid);
  // loginOverlay가 남아있으면 강제 제거
  var _lo = document.getElementById('loginOverlay');
  if (_lo) _lo.classList.remove('show');
  // inert 잔재 정리 (로그인 직후 첫 클릭 시 잔존할 수 있음)
  document.querySelectorAll('[inert]').forEach(function(el){ el.removeAttribute('inert'); });
  // ① 언어 먼저 적용 (data-i18n 처리 완료 후 값 덮어씌우기 방지)
  applyLang();
  // ② 변경 불가 정보 — applyLang() 이후에 세팅해야 '-' 유지됨 (null-safe)
  var _eName = document.getElementById('as_info_name');     if (_eName) _eName.textContent = user.name || '-';
  var _eEmpid = document.getElementById('as_info_empid');   if (_eEmpid) _eEmpid.textContent = user.empid || '-';
  var _eDept = document.getElementById('as_info_dept');     if (_eDept) _eDept.textContent = user.dept ? (user.dept === 'Sales' ? t('dept_sales') : user.dept === 'Office' ? t('dept_office') : user.dept) : '-';
  var _eSubDept = document.getElementById('as_info_sub_dept'); if (_eSubDept) _eSubDept.textContent = user.sub_dept ? _translateSubDept(user.sub_dept) : t('as_not_set');
  // ③ 현재 값 표시
  var _nickCur = document.getElementById('as_nick_current');
  if (_nickCur) _nickCur.textContent = user.nickname || t('as_not_set');
  var _telCur = document.getElementById('as_tel_current');   if (_telCur) _telCur.textContent = user.tel || t('as_not_set');
  var _emailCur = document.getElementById('as_email_current'); if (_emailCur) _emailCur.textContent = user.email || t('as_not_set');
  // ④ 입력란 초기화
  var _pwCur = document.getElementById('as_pw_cur');   if (_pwCur) _pwCur.value = '';
  var _pwNew = document.getElementById('as_pw_new');   if (_pwNew) _pwNew.value = '';
  var _pwNew2 = document.getElementById('as_pw_new2'); if (_pwNew2) _pwNew2.value = '';
  // 관리자 2FA PIN 섹션 표시 (관리자만) — 보안 보강 #5
  try {
    var _pinSec = document.getElementById('as_admin_2fa_section');
    if (_pinSec) {
      var _isAdm = (user.role === 'admin');
      _pinSec.style.display = _isAdm ? 'block' : 'none';
      if (_isAdm) {
        var _pinStatus = document.getElementById('as_pin_status');
        if (_pinStatus) {
          var _hasPin = !!user.admin_pin_hash;
          _pinStatus.innerHTML = _hasPin
            ? '<span style="color:#16a34a;">✅ PIN 설정됨 — 로그인 시 PIN 입력이 필요합니다.</span>'
            : '<span style="color:#ef4444;">⚠️ PIN 미설정 — 보안을 위해 PIN 설정을 권장합니다.</span>';
        }
        var _pinNew = document.getElementById('as_pin_new'); if (_pinNew) _pinNew.value = '';
        var _pinNew2 = document.getElementById('as_pin_new2'); if (_pinNew2) _pinNew2.value = '';
        var _pinMsg = document.getElementById('as_pin_msg'); if (_pinMsg) { _pinMsg.textContent = ''; _pinMsg.className = 'acct-settings-msg'; }
      }
    }
  } catch(e) { console.warn('[2FA PIN] section init error:', e); }
  var _nickInput = document.getElementById('as_nickname');
  if (_nickInput) _nickInput.value = '';
  var _nickCur2 = document.getElementById('as_nick_current2');
  if (_nickCur2) _nickCur2.textContent = user.nickname || t('as_not_set');
  var _tel = document.getElementById('as_tel');     if (_tel) _tel.value = '';
  var _email = document.getElementById('as_email'); if (_email) _email.value = '';
  // 닉네임 변경 섹션: 관리자 전용
  //   닉네임은 customer.sales 필드 매칭 키이므로 일반 사용자가 임의 변경 시 담당 고객 접근이 끊기는
  //   문제가 있어, 관리자 계정으로만 변경 가능하도록 제한. (서버 규칙에서도 이중 차단)
  var _isAdminUser = (typeof _isAdmin === 'function') ? _isAdmin(user) : (user.role === 'admin');
  var _nickSection = document.getElementById('asNickSection');
  if (_nickSection) _nickSection.style.display = _isAdminUser ? '' : 'none';
  var _nickWarn = document.getElementById('as_nick_warn');
  if (_nickWarn) _nickWarn.style.display = 'none';
  // ⑤ 메시지 초기화
  ['as_pw_msg','as_nick_msg','as_tel_msg','as_email_msg','as_all_msg','as_line_msg'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) { el.textContent = ''; el.className = 'acct-settings-msg'; }
  });
  // ⑥ LINE/서명 섹션: 항상 표시
  checkLineLink();
  _refreshSigPreview();
  var _overlay = document.getElementById('acctSettingsOverlay');
  if (_overlay) {
    _overlay.removeAttribute('inert');
    _overlay.classList.add('open');
    _mobFullScreen(_overlay, _overlay.querySelector('.acct-settings-modal'));
    console.log('[openAcctSettings] overlay opened, zIndex:', _overlay.style.zIndex, 'display:', getComputedStyle(_overlay).display);
  } else {
    console.error('[openAcctSettings] acctSettingsOverlay 요소 없음');
  }
  } catch(e) { alert('계정설정 오류: ' + e.message); console.error('openAcctSettings error:', e); }
}
function closeAcctSettings() {
  _closeBounce(document.getElementById('acctSettingsOverlay'), 'open', function() {
    _resetModalPos(document.querySelector('.acct-settings-modal'));
  });
}
function acctSettingsOverlayClick(e) {
  // 닫기 버튼으로만 닫힘 — 오버레이 클릭 무시
}
// Cancel — 입력한 값 원래대로 복귀 (모달은 유지)
function resetAcctSettings() {
  const user = getCurrentUser();
  // 입력란 초기화
  document.getElementById('as_pw_cur').value  = '';
  document.getElementById('as_pw_new').value  = '';
  document.getElementById('as_pw_new2').value = '';
  var _ni = document.getElementById('as_nickname'); if (_ni) _ni.value = '';
  document.getElementById('as_tel').value     = '';
  document.getElementById('as_email').value   = '';
  // 현재값 표시 복귀
  if (user) {
    var _nc = document.getElementById('as_nick_current'); if (_nc) _nc.textContent = user.nickname || t('as_not_set');
    var _nc4 = document.getElementById('as_nick_current2'); if (_nc4) _nc4.textContent = user.nickname || t('as_not_set');
    document.getElementById('as_tel_current').textContent   = user.tel   || t('as_not_set');
    document.getElementById('as_email_current').textContent = user.email || t('as_not_set');
  }
  // 메시지 초기화
  ['as_pw_msg','as_nick_msg','as_tel_msg','as_email_msg','as_all_msg'].forEach(function(id){
    var el = document.getElementById(id);
    el.textContent = '';
    el.className = 'acct-settings-msg';
  });
}

function _setSettingsMsg(id, text, isOk) {
  var el = document.getElementById(id);
  el.textContent = text;
  el.className = 'acct-settings-msg ' + (isOk ? 'ok' : 'err');
}

function togglePwVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.style.color = show ? '#2563eb' : '#9ca3af';
}

// ── LINE 연동 ──
// LINE Official Account 친구 추가 URL (LINE 공식 계정 생성 후 수정)
var LINE_ADD_FRIEND_URL = 'https://lin.ee/ZWy4Wvp';

function updateLineUI(linked) {
  var linkedEl = document.getElementById('lineLinkedStatus');
  var unlinkedEl = document.getElementById('lineUnlinkedStatus');
  var unlinkBtn = document.getElementById('btnUnlinkLine');
  if (linked) {
    linkedEl.style.display = 'block';
    unlinkedEl.style.display = 'none';
    unlinkBtn.style.display = 'block';
  } else {
    linkedEl.style.display = 'none';
    unlinkedEl.style.display = 'block';
    unlinkBtn.style.display = 'none';
  }
  // 친구 추가 링크 설정
  var linkEl = document.getElementById('lineAddFriendLink');
  if (linkEl) linkEl.href = LINE_ADD_FRIEND_URL;
  // 가이드 텍스트 (HTML)
  var guideEl = document.getElementById('lineGuideText');
  if (guideEl) guideEl.innerHTML = t('as_line_guide');
}

async function checkLineLink() {
  var user = getCurrentUser();
  if (!user) return;
  var msgEl = document.getElementById('as_line_msg');
  msgEl.textContent = t('as_line_checking');
  msgEl.className = 'acct-settings-msg';
  try {
    var doc = await _fbDb.collection('accounts').doc(user.empid).get();
    if (doc.exists && doc.data().lineUserId) {
      updateLineUI(true);
      msgEl.textContent = t('as_line_confirmed');
      msgEl.className = 'acct-settings-msg ok';
    } else {
      updateLineUI(false);
      msgEl.textContent = t('as_line_not_linked_msg');
      msgEl.className = 'acct-settings-msg err';
    }
  } catch(e) {
    msgEl.textContent = t('as_line_check_fail') + e.message;
    msgEl.className = 'acct-settings-msg err';
  }
}

async function unlinkLine() {
  var user = getCurrentUser();
  if (!user) return;
  if (!confirm('LINE 연동을 해제하시겠습니까?\n발송/취소 알림을 더 이상 받지 않게 됩니다.')) return;
  try {
    await _fbDb.collection('accounts').doc(user.empid).update({ lineUserId: firebase.firestore.FieldValue.delete() });
    updateLineUI(false);
    var msgEl = document.getElementById('as_line_msg');
    msgEl.textContent = 'LINE 연동이 해제되었습니다.';
    msgEl.className = 'acct-settings-msg ok';
  } catch(e) {
    var msgEl = document.getElementById('as_line_msg');
    msgEl.textContent = '해제 실패: ' + e.message;
    msgEl.className = 'acct-settings-msg err';
  }
}

async function saveAcctAll() {
  const user  = getCurrentUser();
  if (!user) return;
  const cur      = document.getElementById('as_pw_cur').value;
  const nw       = document.getElementById('as_pw_new').value;
  const nw2      = document.getElementById('as_pw_new2').value;
  const nickname = _titleCase((document.getElementById('as_nickname') || {value:''}).value.trim());
  const tel      = document.getElementById('as_tel').value.trim();
  const email    = document.getElementById('as_email').value.trim();

  // 메시지 초기화
  ['as_pw_msg','as_nick_msg','as_tel_msg','as_email_msg','as_all_msg'].forEach(function(id){
    var el = document.getElementById(id);
    el.textContent = '';
    el.className = 'acct-settings-msg';
  });

  // 비밀번호 필드 중 하나라도 입력 시 형식 검증
  // (현재 비밀번호의 정확성은 아래 reauthenticateWithCredential 이 Firebase Auth 에 위임)
  if (cur || nw || nw2) {
    if (!cur || !nw || !nw2) { _setSettingsMsg('as_pw_msg', t('as_pw_fill_all'), false); return; }
    if (nw !== nw2)          { _setSettingsMsg('as_pw_msg', t('as_pw_mismatch'), false); return; }
    // 비밀번호 정책: 6자 이상 + 알파벳 1자 이상 포함
    if (nw.length < 6 || !/[A-Za-z]/.test(nw)) {
      _setSettingsMsg('as_pw_msg', (t('as_pw_policy_fail') || '비밀번호는 6자 이상이며, 알파벳을 1자 이상 포함해야 합니다.'), false);
      return;
    }
  }

  // 이메일 형식 검증 (입력한 경우에만)
  if (email && !isValidEmail(email)) {
    _setSettingsMsg('as_email_msg', t('as_email_invalid'), false);
    return;
  }

  const btn = document.getElementById('btnAsSaveAll');
  if (btn) { btn.disabled = true; btn.textContent = t('processing'); }

  try {
    let changed = false;
    if (cur && nw) {
      // "현재 비밀번호" 를 로그인 비밀번호와 100% 동일하게 검증한다.
      // 1) 로그인 API (fbLogin) 로 먼저 검증 — 이 단계가 로그인 시 실제로 실행되는 경로와 같다.
      // 2) 검증 성공 시 Firebase Auth 에 updatePassword 수행
      //    (Auth pw 가 legacy empid 인 경우 heal 해서 동기화)
      var _loginOk = false, _loginErr = null;
      try {
        var _loginResp = await apiPost({ action: 'login', empid: user.empid, pw: cur });
        if (_loginResp && _loginResp.ok) _loginOk = true;
      } catch(e) { _loginErr = e; }

      if (!_loginOk) {
        console.warn('[saveAcctAll] cur pw mismatch (login API):', _loginErr && (_loginErr.message || _loginErr));
        _setSettingsMsg('as_pw_msg', t('as_pw_wrong_cur'), false);
        return;
      }

      // 로그인 검증 통과 → Firebase Auth 비밀번호 업데이트
      try {
        var _email = user.empid + (typeof FB_AUTH_DOMAIN !== 'undefined' ? FB_AUTH_DOMAIN : '@neothai-order.firebaseapp.com');
        try {
          // fbLogin 에서 이미 signIn 했을 가능성이 높으나, 세션 안전 차원에서 재signIn
          await _fbAuth.signInWithEmailAndPassword(_email, cur);
        } catch(e1) {
          // Auth pw 가 legacy(empid) 인 경우 → empid 로 signIn 해서 heal
          if (e1 && (e1.code === 'auth/wrong-password' || e1.code === 'auth/invalid-credential')) {
            try { await _fbAuth.signInWithEmailAndPassword(_email, user.empid); }
            catch(e2) { throw e1; }
          } else { throw e1; }
        }
        var cu = _fbAuth.currentUser;
        if (!cu) throw new Error('no_current_user');
        await cu.updatePassword(nw);
      } catch(pwErr) {
        console.warn('[saveAcctAll] Auth update fail:', pwErr.code || pwErr.message);
        // 로그인 검증은 통과했으므로 "현재 비밀번호 틀림" 이 아닌 "Auth 업데이트 실패" 메시지
        _setSettingsMsg('as_pw_msg', (t('as_pw_update_fail') || '비밀번호 업데이트에 실패했습니다. 다시 시도해 주세요.'), false);
        return;
      }
      user.pw = nw; // 세션 재로그인용 메모리 값만 갱신 (localStorage 에는 saveLocalAccount 가 strip)
      changed = true;
      document.getElementById('as_pw_cur').value  = '';
      document.getElementById('as_pw_new').value  = '';
      document.getElementById('as_pw_new2').value = '';
    }
    if (nickname && nickname !== (user.nickname || '')) {
      // Firestore 직접 업데이트
      await _fbDb.collection('accounts').doc(user.empid).update({ nickname: nickname });
      user.nickname = nickname;
      changed = true;
    }
    if (tel && tel !== (user.tel || '')) {
      await apiPost({ action:'update_account', empid:user.empid, field:'tel', value:tel });
      user.tel = tel;
      changed = true;
    }
    if (email && email !== (user.email || '')) {
      await apiPost({ action:'update_account', empid:user.empid, field:'email', value:email });
      user.email = email;
      changed = true;
    }
    if (changed) { setCurrentUser(user); saveLocalAccount(user); }

    // 현재값 업데이트
    var _nc2 = document.getElementById('as_nick_current'); if (_nc2) _nc2.textContent = user.nickname || t('as_not_set');
    var _nc3 = document.getElementById('as_nick_current2'); if (_nc3) _nc3.textContent = user.nickname || t('as_not_set');
    document.getElementById('as_tel_current').textContent   = user.tel   || t('as_not_set');
    document.getElementById('as_email_current').textContent = user.email || t('as_not_set');
    var _ni2 = document.getElementById('as_nickname'); if (_ni2) _ni2.value = '';
    document.getElementById('as_tel').value   = '';
    document.getElementById('as_email').value = '';

    _setSettingsMsg('as_all_msg', t('as_save_ok'), true);
    _scrollToSaveMsg();
  } catch(e) {
    _setSettingsMsg('as_all_msg', t('network_error'), false);
    _scrollToSaveMsg();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('as_btn_save_all'); }
  }
}

// ── 저장 결과 메시지로 스크롤 + 하이라이트 ──────────────────────────────────
function _scrollToSaveMsg() {
  var el = document.getElementById('as_all_msg');
  if (!el) return;
  // 부드러운 스크롤 (가장 가까운 스크롤 컨테이너 내에서 중앙)
  try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e) {
    try { el.scrollIntoView(false); } catch(_) {}
  }
  // 플래시 하이라이트
  el.style.transition = 'background .3s, transform .3s';
  el.style.background = '#dcfce7';
  el.style.transform = 'scale(1.05)';
  el.style.padding = '8px 12px';
  el.style.borderRadius = '8px';
  setTimeout(function(){
    el.style.background = '';
    el.style.transform = '';
  }, 900);
}

// ── 계정 관리 ────────────────────────────────────────────────────────────────
var _acctCache = [];

var _acctSelectedDept = null;
var _acctSelectedSubDept = null;

function openAcctMgmt() {
  console.log('[openAcctMgmt] 호출됨');
  applyLang();
  var _lo = document.getElementById('loginOverlay');
  if (_lo) _lo.classList.remove('show');
  document.querySelectorAll('[inert]').forEach(function(el){ el.removeAttribute('inert'); });
  // 슬라이드 패널 초기화
  var sp = document.getElementById('acctSubDeptPanel'); if (sp) sp.classList.remove('open');
  var mp = document.getElementById('acctMemberPanel'); if (mp) mp.classList.remove('open');
  _acctSelectedDept = null; _acctSelectedSubDept = null;
  _acctCache = []; // 항상 최신 데이터 가져오기
  _loadAndRenderDeptGroups();
  var _ao = document.getElementById('acctOverlay');
  if (_ao) { _ao.removeAttribute('inert'); _ao.classList.add('open'); _mobFullScreen(_ao, _ao.querySelector('.acct-modal')); }
}
function refreshAcctList() {
  _acctCache = [];
  _loadAndRenderDeptGroups();
  // 열린 패널도 갱신
  if (_acctSelectedDept) openAcctSubDept(_acctSelectedDept);
  if (_acctSelectedSubDept) openAcctMembers(_acctSelectedDept, _acctSelectedSubDept);
}

// 유령 계정 복구: Firebase Auth 에는 있지만 Firestore accounts 에는 없는 계정을
// stub 프로필(role='user', permissions=[]) 로 생성한다. 관리자가 이후 부서/권한을 채운다.
async function healOrphanedAuthUsers() {
  var me = getCurrentUser();
  if (!me || !_isAdmin(me)) { showToast('관리자만 가능'); return; }
  if (typeof firebase === 'undefined' || !firebase.functions) {
    showToast('Cloud Functions 사용 불가');
    return;
  }
  // 1) dry-run 으로 먼저 고아 계정 조회
  try {
    showToast('🔍 유령 계정 조회 중...');
    var callable = firebase.functions().httpsCallable('healOrphanedAuthUsers');
    var dry = await callable({ dryRun: true });
    var r = (dry && dry.data) || {};
    var count = r.orphanCount || 0;
    if (!count) {
      neoAlert && neoAlert('✅ 유령 계정 없음\n\n' +
        'Firebase Auth: ' + (r.authTotal || 0) + '명\n' +
        'Firestore accounts: ' + (r.firestoreTotal || 0) + '명\n\n' +
        '모든 Auth 계정이 Firestore 에 존재합니다.');
      return;
    }
    var list = (r.orphans || []).map(function(o){ return '• ' + o.empid + ' (생성: ' + (o.created||'').slice(0,10) + ')'; }).join('\n');
    if (!confirm(
      '⚠️ 유령 계정 ' + count + '건 발견\n\n' +
      'Firebase Auth: ' + (r.authTotal || 0) + '명\n' +
      'Firestore accounts: ' + (r.firestoreTotal || 0) + '명\n\n' +
      list + '\n\n' +
      '이 계정들에 대해 stub Firestore 프로필(role=user, permissions=[])을 생성하시겠습니까?\n' +
      '생성 후 계정 관리 패널에서 부서/이름/권한을 채워 넣으면 됩니다.'
    )) return;
  } catch(e) {
    console.error('[healOrphanedAuthUsers dryRun]', e);
    neoAlert && neoAlert('유령 계정 조회 실패: ' + (e.message || e));
    return;
  }
  // 2) 실제 복구 실행
  try {
    showToast('🔧 유령 계정 복구 중...');
    var callable2 = firebase.functions().httpsCallable('healOrphanedAuthUsers');
    var res = await callable2({ dryRun: false });
    var d = (res && res.data) || {};
    neoAlert && neoAlert(
      '✅ 복구 완료\n\n' +
      '복구 성공: ' + (d.healed ? d.healed.length : 0) + '건\n' +
      '실패: ' + (d.failed ? d.failed.length : 0) + '건\n\n' +
      ((d.healed && d.healed.length) ? '새 계정: ' + d.healed.join(', ') : '') +
      ((d.failed && d.failed.length) ? '\n\n실패 상세:\n' + d.failed.map(function(f){return '• '+f.empid+': '+f.msg;}).join('\n') : '')
    );
    invalidateAccountsCache && invalidateAccountsCache();
    refreshAcctList();
  } catch(e) {
    console.error('[healOrphanedAuthUsers]', e);
    neoAlert && neoAlert('복구 실패: ' + (e.message || e));
  }
}
window.healOrphanedAuthUsers = healOrphanedAuthUsers;
function downloadAcctList() {
  if (!_acctCache.length) { showToast('다운로드할 계정이 없습니다.'); return; }
  var header = ['사번','이름','닉네임','소속','부서','역할','연락처','이메일','권한'];
  var rows = _acctCache.map(function(a) {
    var role = a.role === 'admin' ? '관리자' : a.role === 'approver' ? '승인자' : '일반';
    var perms = Array.isArray(a.permissions) ? a.permissions.join(', ') : '';
    return [a.empid||'', a.name||'', a.nickname||'', a.dept||'', a.sub_dept||'', role, a.tel||'', a.email||'', perms];
  });
  var bom = '\uFEFF';
  var csv = bom + [header].concat(rows).map(function(r) {
    return r.map(function(v) { return '"' + String(v).replace(/"/g,'""') + '"'; }).join(',');
  }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'accounts_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 계정 리스트 다운로드 완료');
}
// ── CSV 일괄 등록 ──
async function bulkUploadAccounts(inputEl) {
  var file = inputEl.files[0];
  inputEl.value = ''; // reset for re-upload
  if (!file) return;

  var rows = [];
  var isExcel = /\.xlsx?$/i.test(file.name);

  if (isExcel) {
    // Excel 파싱 (SheetJS)
    if (typeof XLSX === 'undefined') { showToast('Excel 라이브러리 로딩 중... 잠시 후 다시 시도해주세요.'); return; }
    var data = await file.arrayBuffer();
    var wb = XLSX.read(data, { type: 'array' });
    var ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  } else {
    // CSV 파싱
    var text = await file.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
    rows = lines.map(function(l) { return _parseCsvLine(l); });
  }

  if (rows.length < 2) { showToast('파일에 데이터가 없습니다.'); return; }

  // 헤더 매핑
  var header = rows[0].map(function(h) { return String(h).trim(); });
  var colMap = {};
  var ALIAS = {
    '사번': 'empid', 'empid': 'empid', 'emp_id': 'empid',
    '비밀번호': 'pw', '비밀 번호': 'pw', 'password': 'pw', 'pw': 'pw', '비번': 'pw',
    '이름': 'name', 'name': 'name',
    '닉네임': 'nickname', 'nickname': 'nickname',
    '소속': 'dept', 'dept': 'dept', '부서명': 'dept',
    '부서': 'sub_dept', 'sub_dept': 'sub_dept',
    '역할': 'role', 'role': 'role',
    '연락처': 'tel', 'tel': 'tel', 'phone': 'tel',
    '이메일': 'email', 'email': 'email',
    '권한': 'permissions', 'permissions': 'permissions'
  };
  header.forEach(function(h, i) {
    var hLow = h.toLowerCase();
    var hNoSpace = hLow.replace(/\s/g, '');
    var k = ALIAS[hLow] || ALIAS[h] || ALIAS[hNoSpace];
    if (k) colMap[k] = i;
  });
  if (colMap.empid === undefined) { showToast('"사번" 컬럼을 찾을 수 없습니다.'); return; }

  // 데이터 행 파싱
  var accounts = [];
  for (var i = 1; i < rows.length; i++) {
    var cols = rows[i];
    var empid = String(cols[colMap.empid] || '').trim();
    if (!empid) continue;
    var roleRaw = colMap.role !== undefined ? String(cols[colMap.role] || '').trim() : '';
    var role = 'user';
    if (roleRaw === '관리자' || roleRaw === 'admin') role = 'admin';
    else if (roleRaw === '승인자' || roleRaw === 'approver') role = 'approver';
    var permsRaw = colMap.permissions !== undefined ? String(cols[colMap.permissions] || '').trim() : '';
    var perms = permsRaw ? permsRaw.split(/[,;]/).map(function(p) { return p.trim(); }).filter(Boolean) : [];
    accounts.push({
      empid: empid,
      name: colMap.name !== undefined ? String(cols[colMap.name] || '').trim() : '',
      nickname: colMap.nickname !== undefined ? _titleCase(String(cols[colMap.nickname] || '').trim()) : '',
      dept: colMap.dept !== undefined ? String(cols[colMap.dept] || '').trim() : '',
      sub_dept: colMap.sub_dept !== undefined ? String(cols[colMap.sub_dept] || '').trim() : '',
      role: role,
      tel: colMap.tel !== undefined ? String(cols[colMap.tel] || '').trim() : '',
      email: colMap.email !== undefined ? String(cols[colMap.email] || '').trim() : '',
      permissions: perms,
      pw: colMap.pw !== undefined ? String(cols[colMap.pw] || '').trim() : ''
    });
  }

  if (!accounts.length) { showToast('등록할 계정이 없습니다.'); return; }

  // 기존 계정 확인 (Firestore에서 직접 확인하여 정확성 보장)
  showToast('⏳ 기존 계정 확인 중...');
  var existingSet = {};
  for (var ei = 0; ei < accounts.length; ei++) {
    try {
      var doc = await _fbDb.collection('accounts').doc(accounts[ei].empid).get();
      if (doc.exists) existingSet[accounts[ei].empid] = true;
    } catch(e) {}
  }
  var newAccts = accounts.filter(function(a) { return !existingSet[a.empid]; });
  var dupAccts = accounts.filter(function(a) { return !!existingSet[a.empid]; });

  // 확인 다이얼로그
  var msg = '📋 일괄 등록 (' + (isExcel ? 'Excel' : 'CSV') + ')\n\n';
  msg += '총 ' + accounts.length + '건 중:\n';
  msg += '  ✅ 신규 등록: ' + newAccts.length + '건\n';
  if (dupAccts.length) msg += '  ⚠️ 이미 존재 (건너뜀): ' + dupAccts.length + '건\n    (' + dupAccts.map(function(a){return a.empid;}).join(', ') + ')\n';
  var hasPwCol = colMap.pw !== undefined;
  if (hasPwCol) {
    var shortPwCount = newAccts.filter(function(a){ return a.pw && a.pw.length > 0 && a.pw.length < 6; }).length;
    msg += '\n🔑 비밀번호: 파일의 비밀번호 컬럼 사용\n';
    if (shortPwCount) msg += '  ⚠️ 6자 미만 비번 ' + shortPwCount + '건 → 사번으로 대체 (Firebase 최소 6자)\n';
  } else {
    msg += '\n🔑 비밀번호: 사번을 기본 비밀번호로 설정\n';
  }
  msg += '\n계속하시겠습니까?';
  if (!newAccts.length) { showToast('모든 계정이 이미 존재합니다. (' + dupAccts.length + '건 중복)'); return; }
  if (!confirm(msg)) return;

  // 일괄 등록 시작
  showToast('⏳ ' + newAccts.length + '건 등록 중...');
  var ok = 0, fail = 0, errors = [];
  for (var j = 0; j < newAccts.length; j++) {
    var a = newAccts[j];
    try {
      var pw = a.pw || a.empid;
      if (pw.length < 6) pw = a.empid; // Firebase Auth 최소 6자
      // 비밀번호는 Firebase Auth 가 관리 (해시 저장). Firestore 에는 절대 평문 저장하지 않는다.
      var profile = {
        empid: a.empid, name: a.name, nickname: a.nickname,
        dept: a.dept, sub_dept: a.sub_dept,
        tel: a.tel, email: a.email,
        role: a.role, permissions: a.permissions,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await _fbDb.collection('accounts').doc(a.empid).set(profile);
      try { if (typeof invalidateAccountsCache === 'function') invalidateAccountsCache(); } catch(e){}
      // Firebase Auth 등록 (실패해도 계속)
      try {
        var authEmail = a.empid + FB_AUTH_DOMAIN;
        await _fbAuth.createUserWithEmailAndPassword(authEmail, pw);
      } catch(authErr) {
        console.warn('[bulkUpload] Auth 등록 실패:', a.empid, authErr.code);
      }
      ok++;
    } catch(e) {
      fail++;
      errors.push(a.empid + ': ' + e.message);
    }
  }

  // 현재 사용자로 재로그인 (createUserWithEmailAndPassword가 currentUser를 바꿈)
  var me = getCurrentUser();
  if (me && me.empid) {
    try {
      // 세션 pw (메모리) 만 사용. Firestore 에는 pw 가 없으므로 여기서만 확보 가능.
      var _rePw = me.pw || '';
      if (_rePw) await _fbAuth.signInWithEmailAndPassword(me.empid + FB_AUTH_DOMAIN, _rePw);
    } catch(e) { console.warn('[bulkUpload] 재로그인 실패:', e.code); }
  }

  // 결과
  var result = '✅ ' + ok + '건 등록 완료';
  if (fail) result += '\n❌ ' + fail + '건 실패\n' + errors.join('\n');
  alert(result);
  showToast(result.split('\n')[0]);
  refreshAcctList();
}

// ── 업로드 템플릿 미리보기 + 다운로드 ──
function showAcctTemplate() {
  var existing = document.getElementById('acctTemplateOverlay');
  if (existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'acctTemplateOverlay';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center;';
  ov.onclick = function(e) { if (e.target === ov) ov.remove(); };

  var cols = [
    { key:'사번',    en:'empid',       required:true,  desc:'직원 고유 ID (필수)', example:'T2501001' },
    { key:'비밀번호', en:'pw',          required:false, desc:'6자 이상 (미입력 시 사번)', example:'pass1234' },
    { key:'이름',    en:'name',        required:false, desc:'실명', example:'홍길동' },
    { key:'닉네임',  en:'nickname',    required:false, desc:'영문 별명', example:'Gil' },
    { key:'소속',    en:'dept',        required:false, desc:'Sales / Office', example:'Sales' },
    { key:'부서',    en:'sub_dept',    required:false, desc:'하위 부서/팀', example:'BKK' },
    { key:'역할',    en:'role',        required:false, desc:'관리자 / 승인자 / (빈칸=일반)', example:'user' },
    { key:'연락처',  en:'tel',         required:false, desc:'전화번호', example:'082-123-4567' },
    { key:'이메일',  en:'email',       required:false, desc:'이메일 주소', example:'gil@neo.co.th' },
    { key:'권한',    en:'permissions', required:false, desc:'쉼표 구분 권한 목록', example:'order,quote,delivery' }
  ];

  var h = '';
  h += '<div style="background:#fff;border-radius:16px;width:680px;max-width:94vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden;">';
  // 헤더
  h += '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">';
  h += '<div style="font-size:16px;font-weight:700;color:#1e293b;">📋 계정 업로드 템플릿</div>';
  h += '<button onclick="document.getElementById(\'acctTemplateOverlay\').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;">&times;</button>';
  h += '</div>';

  // 안내
  h += '<div style="padding:12px 20px;background:#f0fdf4;border-bottom:1px solid #dcfce7;font-size:12px;color:#166534;line-height:1.6;">';
  h += '💡 <b>CSV</b> 또는 <b>Excel(.xlsx)</b> 파일을 준비하세요.<br>';
  h += '• 첫 번째 행은 반드시 <b>헤더(컬럼명)</b>여야 합니다.<br>';
  h += '• <span style="color:#dc2626;font-weight:700;">사번</span>은 필수 항목입니다. 나머지는 선택입니다.<br>';
  h += '• 한글 또는 영문 헤더 모두 사용 가능합니다.';
  h += '</div>';

  // 테이블
  h += '<div style="padding:12px 20px;overflow:auto;flex:1;">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';

  // 테이블 헤더
  h += '<thead><tr style="background:#f8fafc;">';
  h += '<th style="padding:8px 10px;text-align:left;border:1px solid #e5e7eb;font-weight:700;color:#1e293b;white-space:nowrap;">컬럼명 (한글)</th>';
  h += '<th style="padding:8px 10px;text-align:left;border:1px solid #e5e7eb;font-weight:700;color:#1e293b;white-space:nowrap;">컬럼명 (영문)</th>';
  h += '<th style="padding:8px 10px;text-align:center;border:1px solid #e5e7eb;font-weight:700;color:#1e293b;">필수</th>';
  h += '<th style="padding:8px 10px;text-align:left;border:1px solid #e5e7eb;font-weight:700;color:#1e293b;">설명</th>';
  h += '<th style="padding:8px 10px;text-align:left;border:1px solid #e5e7eb;font-weight:700;color:#1e293b;">예시</th>';
  h += '</tr></thead><tbody>';

  cols.forEach(function(c) {
    var reqBadge = c.required ? '<span style="background:#dc2626;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;">필수</span>' : '<span style="color:#9ca3af;">선택</span>';
    h += '<tr>';
    h += '<td style="padding:7px 10px;border:1px solid #e5e7eb;font-weight:600;color:#1e40af;white-space:nowrap;">' + c.key + '</td>';
    h += '<td style="padding:7px 10px;border:1px solid #e5e7eb;color:#6b7280;font-family:monospace;font-size:11px;">' + c.en + '</td>';
    h += '<td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;">' + reqBadge + '</td>';
    h += '<td style="padding:7px 10px;border:1px solid #e5e7eb;color:#374151;">' + c.desc + '</td>';
    h += '<td style="padding:7px 10px;border:1px solid #e5e7eb;color:#059669;font-family:monospace;font-size:11px;">' + c.example + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table>';

  // 예시 미리보기
  h += '<div style="margin-top:14px;padding:12px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;">';
  h += '<div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:8px;">📝 파일 예시 (CSV)</div>';
  h += '<pre style="margin:0;font-size:11px;color:#374151;line-height:1.7;overflow-x:auto;white-space:pre;">';
  h += '사번,비밀번호,이름,닉네임,소속,부서,역할,연락처,이메일,권한\n';
  h += 'T2501001,pass1234,홍길동,Gil,Sales,BKK,,082-123-4567,gil@neo.co.th,"order,quote"\n';
  h += 'T2501002,,김영희,Young,Sales,North East,,083-456-7890,young@neo.co.th,"delivery,shipped"\n';
  h += 'T2501003,admin123,박관리,Admin,Office,기획,관리자,084-111-2222,admin@neo.co.th,""';
  h += '</pre></div>';
  h += '</div>';

  // 하단 버튼
  h += '<div style="padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end;">';
  h += '<button onclick="downloadAcctTemplate(\'csv\')" style="padding:8px 16px;border:1.5px solid #d1d5db;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer;">📄 CSV 다운로드</button>';
  h += '<button onclick="downloadAcctTemplate(\'xlsx\')" style="padding:8px 16px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">📊 Excel 다운로드</button>';
  h += '</div>';

  h += '</div>';
  ov.innerHTML = h;
  document.body.appendChild(ov);
}

function downloadAcctTemplate(format) {
  var headers = ['사번','비밀번호','이름','닉네임','소속','부서','역할','연락처','이메일','권한'];
  var examples = [
    ['T2501001','pass1234','홍길동','Gil','Sales','BKK','','082-123-4567','gil@neo.co.th','order,quote'],
    ['T2501002','','김영희','Young','Sales','North East','','083-456-7890','young@neo.co.th','delivery,shipped'],
    ['T2501003','admin123','박관리','Admin','Office','기획','관리자','084-111-2222','admin@neo.co.th','']
  ];

  if (format === 'csv') {
    var lines = [headers.join(',')];
    examples.forEach(function(row) {
      lines.push(row.map(function(v) { return v.indexOf(',') >= 0 ? '"' + v + '"' : v; }).join(','));
    });
    var bom = '\uFEFF';
    var blob = new Blob([bom + lines.join('\n')], { type:'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'account_template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('📄 CSV 템플릿 다운로드 완료');
  } else {
    if (typeof XLSX === 'undefined') { showToast('Excel 라이브러리 로딩 중... 잠시 후 다시 시도해주세요.'); return; }
    var wb = XLSX.utils.book_new();
    var data = [headers].concat(examples);
    var ws = XLSX.utils.aoa_to_sheet(data);
    // 열 너비 설정
    ws['!cols'] = [
      {wch:12},{wch:12},{wch:10},{wch:10},{wch:8},{wch:14},{wch:8},{wch:15},{wch:20},{wch:25}
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'account_template.xlsx');
    showToast('📊 Excel 템플릿 다운로드 완료');
  }
}

// CSV 줄 파싱 (quoted 필드 지원)
function _parseCsvLine(line) {
  var result = [], cur = '', inQuote = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else { cur += ch; }
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}

function closeAcctMgmt() {
  closePermSlide(); // 열린 권한 패널도 닫기
  var sp = document.getElementById('acctSubDeptPanel'); if (sp) sp.classList.remove('open');
  var mp = document.getElementById('acctMemberPanel'); if (mp) mp.classList.remove('open');
  _acctSelectedDept = null; _acctSelectedSubDept = null;
  _closeBounce(document.getElementById('acctOverlay'), 'open', function() {
    _resetModalPos(document.querySelector('.acct-modal'));
  });
}
function acctOverlayClick(e) {
  // 오버레이 배경(모달 바깥) 클릭 시 닫기
  if (e.target === document.getElementById('acctOverlay')) {
    closeAcctMgmt();
  }
}

function _filterAcctList() {
  // 소속 변경 시 부서 옵션 갱신
  _updateAcctSubDeptFilter();
  renderAcctList();
}

function _updateAcctSubDeptFilter() {
  var deptSel = document.getElementById('acctFilterDept');
  var subSel = document.getElementById('acctFilterSubDept');
  if (!deptSel || !subSel) return;
  var dept = deptSel.value;
  var prevSub = subSel.value;
  var subs = new Set();
  (_acctCache || []).forEach(function(a) {
    if (dept && a.dept !== dept) return;
    if (a.sub_dept) subs.add(a.sub_dept);
  });
  subSel.innerHTML = '<option value="">' + t('cm_all') + '</option>';
  Array.from(subs).sort().forEach(function(s) {
    var label = _translateSubDept(s) || s;
    subSel.innerHTML += '<option value="' + escHtml(s) + '">' + escHtml(label) + '</option>';
  });
  // 이전 선택값 복원
  if (prevSub && subs.has(prevSub)) subSel.value = prevSub;
}

// ── 부서 그룹 3단 슬라이드 ──────────────────────────────────────────────
async function _ensureAcctCache() {
  if (_acctCache.length > 0) return _acctCache;
  var accounts = [];
  try {
    // 계정 관리 페이지는 항상 최신 데이터 필요 (신규 계정/권한 변경 즉시 반영)
    // → 5분 메모리 캐시 무시하고 force 로드
    var res = await apiGetAccounts({ force: true });
    accounts = res.accounts || [];
  } catch(e) {
    accounts = getLocalAccounts();
  }
  var localAccts = getLocalAccounts();
  accounts = accounts.map(function(a) {
    var local = localAccts.find(function(l) { return l.empid === a.empid; });
    if (!local) return a;
    var merged = Object.assign({}, a);
    if (!merged.permissions || !merged.permissions.length) merged.permissions = local.permissions || [];
    if ((!merged.role || merged.role === 'user' || merged.role === 'viewer') && local.role && local.role !== 'user' && local.role !== 'viewer') merged.role = local.role;
    return merged;
  });
  accounts = accounts.map(function(a) { return enforceAdminRole(a); });
  accounts.sort(function(a, b) {
    var aAdmin = (a.role === 'admin') ? 0 : 1;
    var bAdmin = (b.role === 'admin') ? 0 : 1;
    return aAdmin - bAdmin;
  });
  _acctCache = accounts;
  return accounts;
}

async function _loadAndRenderDeptGroups() {
  var body = document.getElementById('acctBody');
  body.innerHTML = '<div class="acct-empty">&#x23F3; ' + t('processing') + '</div>';
  var selectAllRow = document.getElementById('acctSelectAllRow');
  if (selectAllRow) selectAllRow.style.display = 'none';
  await _ensureAcctCache();
  var countEl = document.getElementById('acctFilterCount');
  if (countEl) countEl.textContent = _acctCache.length + ' ' + t('acct_total_members');

  // 부서별 그룹핑
  var deptGroups = {};
  _acctCache.forEach(function(a) {
    var d = a.dept || 'Other';
    if (!deptGroups[d]) deptGroups[d] = [];
    deptGroups[d].push(a);
  });

  var deptIcons = { MD: '👔', Sales: '💼', Office: '🏢' };
  var deptOrder = ['MD', 'Sales', 'Office'];
  // 정의되지 않은 부서도 포함
  Object.keys(deptGroups).forEach(function(d) { if (deptOrder.indexOf(d) === -1) deptOrder.push(d); });

  var html = '';
  // 먼저 나(관리자) 카드 표시
  var me = getCurrentUser();
  if (me) {
    var myAcct = _acctCache.find(function(a) { return a.empid === me.empid; });
    if (myAcct) {
      var roleBadge = myAcct.role === 'admin' ? '<span class="role-badge role-badge-admin">' + t('role_admin') + '</span>' : '';
      var subDeptText = myAcct.sub_dept ? ' · ' + _translateSubDept(myAcct.sub_dept) : '';
      html += '<div class="acct-row me" style="margin:10px 14px;border-radius:12px;">' +
        '<div class="acct-avatar" style="background:#16a34a;">' + (myAcct.nickname || myAcct.name.charAt(0)) + '</div>' +
        '<div class="acct-info"><div class="acct-name">' + myAcct.name + roleBadge + '</div>' +
        '<div class="acct-meta">' + myAcct.empid + '</div>' +
        '<div style="margin-top:2px;"><span class="acct-dept-badge ' + _deptDisp(myAcct.dept) + '">' + _deptDisp(myAcct.dept) + subDeptText + '</span></div></div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-left:auto;">' +
        '<button class="btn-acct-edit-info" onclick="openEditAcctModal(\'' + myAcct.empid + '\')">✏️ ' + t('acct_edit_info') + '</button>' +
        '<span class="acct-online-badge"><span class="acct-online-dot"></span>' + t('acct_online') + '</span>' +
        '</div></div>';
    }
  }

  // 검색 바
  html += '<div style="margin:8px 14px;"><input type="text" id="acctSearchInput" placeholder="🔍 ' + t('acct_search_ph') + '" oninput="_acctSearchKeyup()" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:10px;font-size:13px;outline:none;" /></div>';

  // 전체 보기
  html += '<div class="dept-group-card" onclick="openAcctMembersAll()" style="background:#eff6ff;border-color:#93c5fd;">' +
    '<span class="dept-icon">👥</span>' +
    '<div class="dept-info"><div class="dept-title">' + t('acct_view_all') + '</div>' +
    '<div class="dept-count">' + _acctCache.length + ' ' + t('acct_members') + '</div></div>' +
    '<span class="dept-arrow">›</span></div>';

  deptOrder.forEach(function(dept) {
    var members = deptGroups[dept] || [];
    if (!members.length) return;
    var icon = deptIcons[dept] || '📁';
    var label = dept === 'Sales' ? t('dept_sales') : dept === 'Office' ? t('dept_office') : dept === 'MD' ? t('dept_ceo') : dept;
    html += '<div class="dept-group-card" onclick="openAcctSubDept(\'' + dept + '\')">' +
      '<span class="dept-icon">' + icon + '</span>' +
      '<div class="dept-info"><div class="dept-title">' + label + '</div>' +
      '<div class="dept-count">' + members.length + ' ' + t('acct_members') + '</div></div>' +
      '<span class="dept-arrow">›</span></div>';
  });
  body.innerHTML = html;
}

function openAcctSubDept(dept) {
  // 같은 부서 클릭 시 토글 (닫기)
  if (_acctSelectedDept === dept && document.getElementById('acctSubDeptPanel').classList.contains('open')) {
    closeAcctSubDept(); return;
  }
  _acctSelectedDept = dept;
  _acctSelectedSubDept = null;
  // 하위 패널 닫기
  var mp = document.getElementById('acctMemberPanel'); if (mp) mp.classList.remove('open');
  closePermSlide();

  var title = document.getElementById('acctSubDeptTitle');
  var icon = dept === 'Sales' ? '💼' : dept === 'Office' ? '🏢' : '📁';
  var label = dept === 'Sales' ? t('dept_sales') : dept === 'Office' ? t('dept_office') : dept;
  if (title) title.innerHTML = icon + ' ' + label;

  var body = document.getElementById('acctSubDeptBody');
  // dept 매칭: 빈 값/없음은 'Other' 그룹으로 정규화 (유령 계정 복구 직후 stub 프로필 대응)
  var members = _acctCache.filter(function(a) { return (a.dept || 'Other') === dept; });

  // 하위부서별 그룹핑 (SUB_DEPT_OPTIONS 순서 유지)
  var subDeptOrder = (SUB_DEPT_OPTIONS[dept] || []).map(function(o) { return o.value; });
  var subGroups = {};
  members.forEach(function(a) {
    var sd = a.sub_dept || '-';
    if (!subGroups[sd]) subGroups[sd] = [];
    subGroups[sd].push(a);
  });
  // 정의된 순서 + 나머지
  var orderedKeys = [];
  subDeptOrder.forEach(function(sd) { if (subGroups[sd]) orderedKeys.push(sd); });
  Object.keys(subGroups).forEach(function(sd) { if (orderedKeys.indexOf(sd) === -1) orderedKeys.push(sd); });

  // 전체 보기 (해당 부서 전원)
  var html = '<div class="subdept-item" onclick="openAcctMembersDept(\'' + dept + '\')" style="background:#eff6ff;">' +
    '<span class="subdept-name" style="color:#2563eb;font-weight:700;">👥 ' + t('acct_view_all') + '</span>' +
    '<span class="subdept-cnt" style="background:#dbeafe;color:#2563eb;">' + members.length + '</span>' +
    '<span class="subdept-arrow" style="color:#2563eb;">›</span></div>';

  orderedKeys.forEach(function(sd) {
    var cnt = subGroups[sd].length;
    var sdLabel = sd === '-' ? t('as_not_set') : _translateSubDept(sd);
    html += '<div class="subdept-item" onclick="openAcctMembers(\'' + dept + '\',\'' + sd.replace(/'/g, "\\'") + '\')">' +
      '<span class="subdept-name">' + sdLabel + '</span>' +
      '<span class="subdept-cnt">' + cnt + '</span>' +
      '<span class="subdept-arrow">›</span></div>';
  });
  body.innerHTML = html;
  document.getElementById('acctSubDeptPanel').classList.add('open');
}

function openAcctMembers(dept, subDept) {
  // 같은 하위부서 클릭 시 토글 (닫기)
  if (_acctSelectedSubDept === subDept && document.getElementById('acctMemberPanel').classList.contains('open')) {
    closeAcctMembers(); return;
  }
  _acctSelectedSubDept = subDept;
  closePermSlide();

  var title = document.getElementById('acctMemberTitle');
  var sdLabel = subDept === '-' ? t('as_not_set') : _translateSubDept(subDept);
  if (title) title.textContent = sdLabel;

  var body = document.getElementById('acctMemberBody');
  var me = getCurrentUser();
  var amAdmin = me && me.role === 'admin';
  var members = _acctCache.filter(function(a) {
    return (a.dept || 'Other') === dept && (a.sub_dept || '-') === subDept;
  });
  members.sort(_sortByRole);

  body.innerHTML = members.map(function(a) {
    return _renderAcctCard(a, me, amAdmin);
  }).join('');
  document.getElementById('acctMemberPanel').classList.add('open');
}

// 정렬: 관리자 > 법인대표 > 법인장 > 그룹장 > 영업팀장 > 영업팀원 > 오피스팀장 > 오피스팀원
function _sortByRole(a, b) {
  return _getSortRank(a) - _getSortRank(b);
}
function _getSortRank(u) {
  // 1) 관리자
  if (u.role === 'admin') return 0;
  // 2) MD (소속=CEO)
  if (u.dept === 'MD') return 1;
  // 3) 법인장 (직위=ceo)
  if (u.position === 'ceo') return 2;
  // 4) 그룹장
  if (u.position === 'group_leader' || u.sub_dept === 'Group Leader' || u.role === 'approver') return 3;
  var isSales = u.dept === 'Sales';
  var isLeader = u.position === 'leader';
  // 5) 영업 팀장
  if (isSales && isLeader) return 4;
  // 6) 영업 팀원
  if (isSales) return 5;
  // 7) 오피스 팀장
  if (isLeader) return 6;
  // 8) 오피스 팀원
  return 7;
}

function _renderAcctCard(a, me, amAdmin) {
  var isMe = me && me.empid === a.empid;
  var _r = a.role || 'viewer';
  var roleBadge = _r === 'admin' ? '<span class="role-badge role-badge-admin">' + t('role_admin') + '</span>'
    : _r === 'approver' ? '<span class="role-badge role-badge-approver">' + t('role_approver') + '</span>'
    : '<span class="role-badge role-badge-viewer">' + t('role_viewer') + '</span>';
  // Manager 노랑 배지는 제거 (M 배지로 대체). 호환성을 위해 변수만 유지.
  var managerBadge = '';
  var leaderBadge = a.position === 'ceo' ? ' <span class="leader-badge ceo-badge">C</span>'
    : a.position === 'group_leader' ? ' <span class="leader-badge gl-badge">G</span>'
    : a.position === 'leader' ? ' <span class="leader-badge">M</span>' : '';
  var subDeptText = a.sub_dept ? ' · ' + _translateSubDept(a.sub_dept) : '';

  if (isMe) {
    return '<div class="acct-row me"><div class="acct-avatar" style="background:#16a34a;">' + (a.nickname || a.name.charAt(0)) + '</div>' +
      '<div class="acct-info"><div class="acct-name">' + a.name + leaderBadge + managerBadge + roleBadge + '</div>' +
      '<div class="acct-meta">' + a.empid + '</div>' +
      '<div style="margin-top:2px;"><span class="acct-dept-badge ' + _deptDisp(a.dept) + '">' + _deptDisp(a.dept) + subDeptText + '</span></div></div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-left:auto;">' +
      '<button class="btn-acct-edit-info" onclick="openEditAcctModal(\'' + a.empid + '\')">✏️ ' + t('acct_edit_info') + '</button>' +
      '<span class="acct-online-badge"><span class="acct-online-dot"></span>' + t('acct_online') + '</span></div></div>';
  }
  if (amAdmin) {
    var curRole = a.role === 'user' ? 'viewer' : (a.role || 'viewer');
    var permCount = _countUniquePerms(a.permissions || []);
    return '<div class="acct-row acct-row-admin-card" id="acct-card-' + a.empid + '">' +
      '<div class="acct-card-top"><div class="acct-info">' +
      '<div class="acct-name">' + a.name + leaderBadge + managerBadge + '</div>' +
      '<div class="acct-meta">' + a.empid + '</div>' +
      '<div style="margin-top:2px;"><span class="acct-dept-badge ' + _deptDisp(a.dept) + '">' + _deptDisp(a.dept) + subDeptText + '</span></div></div>' +
      '<div class="acct-card-controls"><div style="display:flex;flex-direction:column;gap:3px;align-items:stretch;">' +
      '<button class="btn-acct-edit-info" onclick="openEditAcctModal(\'' + a.empid + '\')">✏️ ' + t('acct_edit_info') + '</button>' +
      '<button class="btn-acct-perm" id="btn-perm-' + a.empid + '" onclick="openPermSlide(\'' + a.empid + '\')"' +
      (curRole === 'admin' ? ' style="display:none"' : '') + '>' +
      '📋 메뉴 권한 <span class="perm-count ' + (permCount === 0 ? 'zero' : '') + '" id="perm-cnt-' + a.empid + '">' + permCount + '</span></button></div>' +
      '<div class="acct-btn-stack">' +
      '<button class="btn-acct-pw-reset" onclick="resetAcctPwAdmin(\'' + a.empid + '\')">🔑 비밀번호 리셋</button>' +
      '<button class="btn-acct-force-del" onclick="confirmDeleteAccount(\'' + a.empid + '\')">🗑 삭제</button>' +
      '</div></div></div>' +
      '<div class="acct-perm-admin-note" id="admin-note-' + a.empid + '"' + (curRole !== 'admin' ? ' style="display:none"' : '') + '>' +
      '<span>👑 관리자 계정 — 모든 메뉴·승인 자동 허용</span></div></div>';
  }
  return '<div class="acct-row"><div class="acct-avatar">' + (a.nickname || a.name.charAt(0)) + '</div>' +
    '<div class="acct-info"><div class="acct-name">' + a.name + leaderBadge + managerBadge + roleBadge + '</div>' +
    '<div class="acct-meta">' + a.empid + '</div>' +
    '<div style="margin-top:2px;"><span class="acct-dept-badge ' + _deptDisp(a.dept) + '">' + _deptDisp(a.dept) + subDeptText + '</span></div></div></div>';
}

// 전체 보기 (모든 부서)
function openAcctMembersAll() {
  closePermSlide();
  var sp = document.getElementById('acctSubDeptPanel'); if (sp) sp.classList.remove('open');
  var title = document.getElementById('acctMemberTitle');
  if (title) title.textContent = '👥 ' + t('acct_view_all');
  var body = document.getElementById('acctMemberBody');
  var me = getCurrentUser();
  var amAdmin = me && me.role === 'admin';
  var sorted = _acctCache.slice().sort(_sortByRole);
  body.innerHTML = sorted.map(function(a) { return _renderAcctCard(a, me, amAdmin); }).join('');
  document.getElementById('acctMemberPanel').classList.add('open');
}

// 부서 전체 보기
function openAcctMembersDept(dept) {
  closePermSlide();
  var label = dept === 'Sales' ? t('dept_sales') : dept === 'Office' ? t('dept_office') : dept === 'MD' ? t('dept_ceo') : dept;
  var title = document.getElementById('acctMemberTitle');
  if (title) title.textContent = label + ' ' + t('acct_view_all');
  var body = document.getElementById('acctMemberBody');
  var me = getCurrentUser();
  var amAdmin = me && me.role === 'admin';
  var members = _acctCache.filter(function(a) { return (a.dept || 'Other') === dept; });
  members.sort(_sortByRole);
  body.innerHTML = members.map(function(a) { return _renderAcctCard(a, me, amAdmin); }).join('');
  document.getElementById('acctMemberPanel').classList.add('open');
}

// 검색
function _acctSearchKeyup() {
  var input = document.getElementById('acctSearchInput');
  if (!input) return;
  var q = input.value.trim().toLowerCase();
  if (!q) {
    // 검색어 비우면 멤버 패널 닫기
    var mp = document.getElementById('acctMemberPanel'); if (mp) mp.classList.remove('open');
    var sp = document.getElementById('acctSubDeptPanel'); if (sp) sp.classList.remove('open');
    return;
  }
  var results = _acctCache.filter(function(a) {
    return (a.empid || '').toLowerCase().indexOf(q) > -1 ||
           (a.name || '').toLowerCase().indexOf(q) > -1 ||
           (a.nickname || '').toLowerCase().indexOf(q) > -1;
  });
  // 하위부서 패널 닫고 멤버 패널로 결과 표시
  var sp = document.getElementById('acctSubDeptPanel'); if (sp) sp.classList.remove('open');
  closePermSlide();
  var title = document.getElementById('acctMemberTitle');
  if (title) title.textContent = '🔍 ' + results.length + ' ' + t('acct_search_result');
  var body = document.getElementById('acctMemberBody');
  var me = getCurrentUser();
  var amAdmin = me && me.role === 'admin';
  if (results.length) {
    body.innerHTML = results.map(function(a) { return _renderAcctCard(a, me, amAdmin); }).join('');
  } else {
    body.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:14px;">' + t('acct_search_empty') + '</div>';
  }
  document.getElementById('acctMemberPanel').classList.add('open');
}

function closeAcctSubDept() {
  document.getElementById('acctSubDeptPanel').classList.remove('open');
  document.getElementById('acctMemberPanel').classList.remove('open');
  closePermSlide();
  _acctSelectedDept = null; _acctSelectedSubDept = null;
}

function closeAcctMembers() {
  document.getElementById('acctMemberPanel').classList.remove('open');
  closePermSlide();
  _acctSelectedSubDept = null;
}

async function renderAcctList() {
  const me   = getCurrentUser();
  const body = document.getElementById('acctBody');
  body.innerHTML = '<div class="acct-empty">&#x23F3; ' + t('processing') + '</div>';

  // 전체선택/일괄삭제 행 숨김 (체크박스 제거로 불필요)
  var selectAllRow = document.getElementById('acctSelectAllRow');
  if (selectAllRow) selectAllRow.style.display = 'none';

  let accounts = [];
  // 캐시가 있으면 재오픈 시 API 재조회 없이 캐시 사용 (저장된 권한이 사라지는 문제 방지)
  if (_acctCache.length > 0) {
    accounts = _acctCache;
  } else {
    try {
      const res = await apiGetAccounts();
      accounts = res.accounts || [];
    } catch(e) {
      accounts = getLocalAccounts();
    }
    // 서버 응답에 permissions/role이 없는 경우 localStorage 데이터와 병합
    const localAccts = getLocalAccounts();
    accounts = accounts.map(function(a) {
      var local = localAccts.find(function(l) { return l.empid === a.empid; });
      if (!local) return a;
      var merged = Object.assign({}, a);
      if (!merged.permissions || !merged.permissions.length) {
        merged.permissions = local.permissions || [];
      }
      if ((!merged.role || merged.role === 'user' || merged.role === 'viewer') && local.role && local.role !== 'user' && local.role !== 'viewer') {
        merged.role = local.role;
      }
      return merged;
    });
  }

  // HARDCODED_ADMINS 강제 적용 (API 데이터가 미반영된 경우 대비)
  accounts = accounts.map(function(a) { return enforceAdminRole(a); });
  // 현재 로그인 세션도 동기화
  var _me = getCurrentUser();
  if (_me) {
    var _meUpdated = enforceAdminRole(_me);
    if (_meUpdated !== _me) { setCurrentUser(_meUpdated); applyUserUI(_meUpdated); }
  }

  // admin 우선 정렬
  accounts.sort(function(a, b) {
    var aAdmin = (a.role === 'admin') ? 0 : 1;
    var bAdmin = (b.role === 'admin') ? 0 : 1;
    return aAdmin - bAdmin;
  });
  _acctCache = accounts;

  // 부서 필터 서브옵션 갱신
  _updateAcctSubDeptFilter();

  // 필터 적용
  var deptF = (document.getElementById('acctFilterDept') || {}).value || '';
  var subDeptF = (document.getElementById('acctFilterSubDept') || {}).value || '';
  if (deptF) accounts = accounts.filter(function(a) { return a.dept === deptF; });
  if (subDeptF) accounts = accounts.filter(function(a) { return (a.sub_dept || '') === subDeptF; });

  var countEl = document.getElementById('acctFilterCount');
  if (countEl) countEl.textContent = accounts.length + ' / ' + _acctCache.length;

  if (!accounts.length) {
    body.innerHTML = '<div class="acct-empty">' + t('acct_no_accounts') + '</div>';
    return;
  }

  const amAdmin = me && me.role === 'admin';

  const MENU_PERMS = [
    { key: 'search',   labelKo: '고객 검색' },
    { key: 'register', labelKo: '고객 등록' },
    { key: 'approve_cust', labelKo: '고객 승인' },
    { key: 'cust_appr_result', labelKo: '승인 결과 조회' },
    { key: 'cust_info_search', labelKo: '고객 정보 찾기' },
    { key: 'cust_list', labelKo: '고객 리스트' },
    { key: 'prod_reg',  labelKo: '상품 등록' },
    { key: 'prod_approve', labelKo: '상품 승인' },
    { key: 'prod_list', labelKo: '상품 리스트' },
    { key: 'quote',    labelKo: '견적 요청' },
    { key: 'order',    labelKo: '주문 입력' },
    { key: 'pending',  labelKo: '주문 승인' },
    { key: 'delivery', labelKo: '발송 대기' },
    { key: 'shipped',  labelKo: '발송 완료' },
    { key: 'tracking', labelKo: '배송 추적' },
    { key: 'results',  labelKo: '결과 조회' },
    { key: 'messenger', labelKo: '메신저' },
    { key: 'attend', labelKo: '출퇴근' }
  ];

  body.innerHTML = accounts.map(function(a) {
    const isMe = me && me.empid === a.empid;
    const _r = a.role || 'viewer';
    const roleBadge = _r === 'admin'
      ? `<span class="role-badge role-badge-admin">${t('role_admin')}</span>`
      : _r === 'approver'
        ? `<span class="role-badge role-badge-approver">${t('role_approver')}</span>`
        : `<span class="role-badge role-badge-viewer">${t('role_viewer')}</span>`;
    const subDeptText = a.sub_dept ? ' · ' + a.sub_dept : '';

    if (isMe) {
      return `<div class="acct-row me">
        <div class="acct-avatar" style="background:#16a34a;">${a.nickname || a.name.charAt(0)}</div>
        <div class="acct-info">
          <div class="acct-name">${a.name}${roleBadge}</div>
          <div class="acct-meta">${a.empid}</div>
          <div style="margin-top:2px;"><span class="acct-dept-badge ${_deptDisp(a.dept)}">${_deptDisp(a.dept)}${subDeptText}</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto;">
          <button class="btn-acct-edit-info" onclick="openEditAcctModal('${a.empid}')">✏️ ${t('acct_edit_info')}</button>
          <span class="acct-online-badge"><span class="acct-online-dot"></span>${t('acct_online')}</span>
        </div>
      </div>`;
    }

    const isUserRole = !a.role || a.role !== 'admin';  // viewer/approver 모두 권한 패널 표시
    const perms = a.permissions || [];

    if (amAdmin) {
      const curRole = a.role === 'user' ? 'viewer' : (a.role || 'viewer');  // 구버전 'user' → 'viewer' 호환
      const permCount = _countUniquePerms(perms);
      return `<div class="acct-row acct-row-admin-card" id="acct-card-${a.empid}">
        <div class="acct-card-top">
          <div class="acct-info">
            <div class="acct-name">${a.name}</div>
            <div class="acct-meta">${a.empid}</div>
            <div style="margin-top:2px;"><span class="acct-dept-badge ${_deptDisp(a.dept)}">${_deptDisp(a.dept)}${subDeptText}</span></div>
          </div>
          <div class="acct-card-controls">
            <div style="display:flex;flex-direction:column;gap:3px;align-items:stretch;">
              <button class="btn-acct-edit-info" onclick="openEditAcctModal('${a.empid}')">✏️ ${t('acct_edit_info')}</button>
              <button class="btn-acct-perm" id="btn-perm-${a.empid}"
                onclick="openPermSlide('${a.empid}')"
                ${curRole === 'admin' ? 'style="display:none"' : ''}>
                📋 메뉴 권한 <span class="perm-count ${permCount === 0 ? 'zero' : ''}" id="perm-cnt-${a.empid}">${permCount}</span>
              </button>
            </div>
            <div class="acct-btn-stack">
              <button class="btn-acct-pw-reset" onclick="resetAcctPwAdmin('${a.empid}')">🔑 비밀번호 리셋</button>
              <button class="btn-acct-force-del" onclick="confirmDeleteAccount('${a.empid}')">🗑 삭제</button>
            </div>
          </div>
        </div>
        <div class="acct-perm-admin-note" id="admin-note-${a.empid}" ${curRole !== 'admin' ? 'style="display:none"' : ''}>
          <span>👑 관리자 계정 — 모든 메뉴·승인 자동 허용</span>
        </div>
      </div>`;
    }

    return `<div class="acct-row">
      <div class="acct-avatar">${a.nickname || a.name.charAt(0)}</div>
      <div class="acct-info">
        <div class="acct-name">${a.name}${roleBadge}</div>
        <div class="acct-meta">${a.empid}</div>
        <div style="margin-top:2px;"><span class="acct-dept-badge ${_deptDisp(a.dept)}">${_deptDisp(a.dept)}${subDeptText}</span></div>
      </div>
    </div>`;
  }).join('');
}

function acctCheckChange() {
  var checkboxes = document.querySelectorAll('#acctBody .acct-row-checkbox');
  var checked = document.querySelectorAll('#acctBody .acct-row-checkbox:checked');
  var batchBtn = document.getElementById('btnAcctBatchDel');
  var chkAll   = document.getElementById('acctCheckAll');
  if (batchBtn) {
    if (checked.length > 0) batchBtn.classList.add('show');
    else                    batchBtn.classList.remove('show');
  }
  if (chkAll) {
    chkAll.checked = checkboxes.length > 0 && checked.length === checkboxes.length;
    chkAll.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
  }
}

function acctToggleAll(chk) {
  var checkboxes = document.querySelectorAll('#acctBody .acct-row-checkbox');
  checkboxes.forEach(function(cb) { cb.checked = chk.checked; });
  acctCheckChange();
}

async function deleteCheckedAccounts() {
  var checked = document.querySelectorAll('#acctBody .acct-row-checkbox:checked');
  if (!checked.length) return;
  var ids = Array.from(checked).map(function(cb) { return cb.value; });
  if (!confirm(t('acct_batch_del_confirm').replace('{n}', ids.length))) return;
  // 관리자 Auth 세션 보장 (Cloud Function 호출을 위해 1회만)
  try { await _ensureAdminAuthSession(); }
  catch(e) { console.warn('[deleteCheckedAccounts] admin session fail:', e); }
  var _authFailList = [];
  for (var i = 0; i < ids.length; i++) {
    var _resp = null;
    try { _resp = await apiPost({ action: 'delete_account', empid: ids[i] }); }
    catch(e) { console.warn('[deleteCheckedAccounts] fail:', ids[i], e); }
    if (_resp && _resp.auth && _resp.auth.ok === false) _authFailList.push(ids[i]);
    removeLocalAccount(ids[i]);
    _acctCache = _acctCache.filter(function(a) { return a.empid !== ids[i]; });
  }
  if (_authFailList.length) {
    try { neoAlert('Firebase Auth 삭제 실패 계정(' + _authFailList.length + '건): ' + _authFailList.join(', ') + '\nFirebase Console에서 수동 삭제가 필요할 수 있습니다.'); } catch(e) {}
  }
  _loadAndRenderDeptGroups();
  if (_acctSelectedDept) openAcctSubDept(_acctSelectedDept);
  if (_acctSelectedSubDept) openAcctMembers(_acctSelectedDept, _acctSelectedSubDept);
}

function confirmDeleteAccount(empid) {
  var input = prompt('⚠️ ' + empid + ' 계정을 삭제하려면\n"계정 삭제"를 입력하세요:');
  if (input === null) return;        // 취소
  if (input.trim() !== '계정 삭제') { neoAlert('입력이 일치하지 않습니다. 삭제가 취소되었습니다.'); return; }
  deleteAccount(empid);
}

async function deleteAccount(empid) {
  // 관리자 Auth 세션 + admin claim 확보 (Cloud Function 호출용)
  try { await _ensureAdminAuthSession(); }
  catch(e) { console.warn('[deleteAccount] admin session fail:', e); }

  var _delResp = null, _delErr = null;
  try {
    _delResp = await apiPost({ action: 'delete_account', empid: empid });
  } catch(e) { _delErr = e; console.warn('[deleteAccount] apiPost fail:', e); }

  // Auth 삭제 결과 확인 — auth/user-not-found 는 이미 지워진 상태이므로 경고하지 않음 (Cloud Function 이 alreadyGone=true 로 정상 처리)
  if (_delResp && _delResp.auth && _delResp.auth.ok === false) {
    var _authCode = _delResp.auth.code || '';
    var _authMsg = _delResp.auth.msg || '';
    console.warn('[deleteAccount] Firebase Auth 삭제 실패:', _authCode, _authMsg);
    // auth/user-not-found 는 사실상 성공 (방어적 처리 — Cloud Function 이 이미 ok=true 로 바꿈)
    if (_authCode !== 'auth/user-not-found') {
      try { neoAlert('계정 문서는 삭제됐으나 Firebase Auth 삭제가 실패했습니다:\n' +
        (_authCode ? '[' + _authCode + '] ' : '') + (_authMsg || '알 수 없는 오류') +
        '\n\nFirebase Console에서 수동 삭제가 필요할 수 있습니다.'); } catch(e) {}
    }
  }
  removeLocalAccount(empid);
  // 캐시에서도 즉시 제거
  _acctCache = _acctCache.filter(function(a) { return a.empid !== empid; });

  // 1) DOM에서 해당 카드 즉시 제거 (시각적 즉시 반영)
  var cardEl = document.getElementById('acct-card-' + empid);
  if (cardEl) cardEl.remove();

  // 2) 부서 그룹 뷰 + 열린 패널 모두 갱신 (패널 상태 보존)
  var _savedDept = _acctSelectedDept;
  var _savedSubDept = _acctSelectedSubDept;
  await _loadAndRenderDeptGroups();
  if (_savedDept) {
    _acctSelectedDept = null; // 토글 방지를 위해 초기화 후 다시 열기
    openAcctSubDept(_savedDept);
  }
  if (_savedSubDept) {
    _acctSelectedSubDept = null;
    openAcctMembers(_savedDept, _savedSubDept);
  }
  // 전체 보기 / 부서 전체 보기 패널이 열려있는 경우에도 갱신
  var memberPanel = document.getElementById('acctMemberPanel');
  if (memberPanel && memberPanel.classList.contains('open')) {
    var memberBody = document.getElementById('acctMemberBody');
    if (memberBody) {
      var me = getCurrentUser();
      var amAdmin = me && me.role === 'admin';
      var title = document.getElementById('acctMemberTitle');
      var titleText = title ? title.textContent : '';
      if (titleText.indexOf('👥') === 0 || titleText.indexOf(t('acct_view_all')) !== -1) {
        // 전체 보기 모드
        memberBody.innerHTML = _acctCache.map(function(a) { return _renderAcctCard(a, me, amAdmin); }).join('');
      } else if (_acctSelectedDept && !_acctSelectedSubDept) {
        // 부서 전체 보기 모드
        var deptMembers = _acctCache.filter(function(a) { return a.dept === _acctSelectedDept; });
        memberBody.innerHTML = deptMembers.map(function(a) { return _renderAcctCard(a, me, amAdmin); }).join('');
      }
    }
  }
  showToast('🗑 계정이 삭제되었습니다.');
}

// ── 계정 수정 모달 ────────────────────────────────────────────────────────────
function openEditAcctModal(empid) {
  var me = getCurrentUser();
  if (!me || me.role !== 'admin') return;
  var acct = _acctCache.find(function(a) { return a.empid === empid; });
  if (!acct) return;
  applyLang();
  document.getElementById('edit_acct_empid').value       = acct.empid;
  document.getElementById('edit_acct_empid_show').value  = acct.empid;
  document.getElementById('edit_acct_name').value        = acct.name  || '';
  var _ean = document.getElementById('edit_acct_nickname'); if (_ean) _ean.value = acct.nickname || '';
  document.getElementById('edit_acct_dept').value        = acct.dept  || 'Sales';
  // sub_dept 동적 옵션 생성 후 값 설정
  if (acct.dept === 'MD') {
    var _subSel = document.getElementById('edit_acct_sub_dept');
    _subSel.innerHTML = '<option value="MD" data-i18n="dept_ceo">MD</option>';
    _subSel.value = 'MD';
    _subSel.disabled = true;
  } else {
    document.getElementById('edit_acct_sub_dept').disabled = false;
    updateSubDeptOptions('edit_acct_dept', 'edit_acct_sub_dept');
    document.getElementById('edit_acct_sub_dept').value    = acct.sub_dept || '';
  }
  document.getElementById('edit_acct_tel').value         = acct.tel   || '';
  document.getElementById('edit_acct_email').value       = acct.email || '';
  document.getElementById('edit_acct_pw').value          = '';
  // role (구버전 'user' → 'viewer' 호환)
  var roleVal = (acct.role === 'user' || !acct.role) ? 'viewer' : acct.role;
  document.querySelectorAll('input[name="edit_acct_role"]').forEach(function(r) {
    r.checked = r.value === roleVal;
  });
  // position (직위: member/leader)
  var posVal = acct.position || 'member';
  document.querySelectorAll('input[name="edit_acct_position"]').forEach(function(r) {
    r.checked = r.value === posVal;
  });
  // permissions
  var perms = acct.permissions || [];
  var msg = document.getElementById('edit_acct_msg');
  if (msg) { msg.textContent = ''; msg.className = 'acct-settings-msg'; }
  document.getElementById('editAcctOverlay').classList.add('open');
}


// ── 인라인 등급(role) 변경 ───────────────────────────────────────────────────
async function changeAcctRole(empid, newRole) {
  var acct = _acctCache.find(function(a) { return a.empid === empid; });
  if (!acct) return;

  var updated = Object.assign({}, acct, { role: newRole, permissions: acct.permissions || [] });
  _acctCache = _acctCache.map(function(a) { return a.empid === empid ? updated : a; });
  saveLocalAccount(updated);
  try { await apiPost({ action: 'update_account', account: updated }); } catch(e) {}

  // 메뉴 권한 버튼 / 관리자 안내 전환
  var permBtn   = document.getElementById('btn-perm-' + empid);
  var adminNote = document.getElementById('admin-note-' + empid);
  // viewer/approver: 권한 버튼 표시 / admin: 숨기고 안내 표시
  if (permBtn)   permBtn.style.display = newRole !== 'admin' ? '' : 'none';
  if (adminNote) adminNote.style.display = newRole === 'admin' ? '' : 'none';
  // 역할 변경 시 열린 슬라이드 패널 닫기
  if (_permSlideEmpid === empid) closePermSlide();

  // 저장 피드백
  var card = document.getElementById('acct-card-' + empid);
  if (card) { card.classList.add('perm-saved'); setTimeout(function(){ card.classList.remove('perm-saved'); }, 800); }
}

// ── 메뉴 권한 슬라이드 패널 ──────────────────────────────────────────────
var _permSlideEmpid = null;
var _permOpenCatId = null;

// 카테고리별 메뉴 권한 구조
var PERM_CATEGORIES = [
  { id: 'messenger', icon: '💬', title_i18n: 'mc_messenger', title: '메신저', items: [
    { key: 'messenger', label: '메신저' }
  ]},
  { id: 'register', icon: '📂', title_i18n: 'mc_grp_reg', title: '등록', items: [
    { key: 'search',   label: '고객 검색' },
    { key: 'register', label: '고객 등록' },
    { key: 'approve_cust', label: '고객 승인' },
    { key: 'cust_appr_result', label: '승인 결과 조회' },
    { key: 'cust_info_search', label: '고객 정보 찾기' },
    { key: 'cust_list', label: '고객 리스트' },
    { key: 'prod_reg',     label: '상품 등록' },
    { key: 'prod_approve', label: '상품 승인' },
    { key: 'prod_list',    label: '상품 리스트' }
  ]},
  { id: 'order', icon: '🛒', title_i18n: 'mc_grp_order', title: '주문', items: [
    { key: 'quote', label: '견적 요청' },
    { key: 'order',   label: '주문 입력' },
    { key: 'pending', label: '주문 승인' },
    { key: 'demo', label: '데모' }
  ]},
  { id: 'ship', icon: '🚚', title_i18n: 'mc_grp_ship', title: '발송', items: [
    { key: 'delivery', label: '발송 대기' },
    { key: 'shipped',  label: '발송 완료' },
    { key: 'tracking', label: '배송 추적' }
  ]},
  { id: 'results', icon: '📊', title_i18n: 'mc_results', title: '리포트', items: [
    { key: 'results', label: '발송 완료 리포트 (본인/팀)' },
    { key: 'consign_status', label: '위탁 출고 현황 (본인/팀)', i18n: 'menu_consign_status' },
    { key: 'target', label: '매출/수금 현황 (본인/팀)' },
    { key: 'daily_report', label: '일일 업무 보고', i18n: 'menu_daily_report' },
    { key: 'sales_dashboard', label: '매출 대시보드', i18n: 'menu_sales_dashboard' },
    { key: 'borrow_control', label: 'Borrow Control', i18n: 'menu_borrow_control' }
  ]},
  { id: 'attend', icon: '🕐', title_i18n: 'mc_attend', title: '출퇴근', items: [
    { key: 'attend', label: '출퇴근' },
    { key: 'attend_summary', label: '출퇴근 집계' },
    { key: 'visit_log', label: '방문 기록', i18n: 'menu_visit_log' },
    { key: 'visit_schedule', label: '방문 일정', i18n: 'menu_visit_schedule' },
    { key: 'nearby_dentists', label: '내 주변 치과', i18n: 'menu_nearby_dentists' },
    { key: 'fuel_price', label: '주유 가격' }
  ]},
  { id: 'expense', icon: '💰', title_i18n: 'expense_menu', title: '비용 정산', items: [
    { key: 'receipt', label: '영수증 제출' },
    { key: 'receipt_admin', label: '영수증 조회' }
  ]},
];

// ── 1단 → 2단: 메뉴 권한 카테고리 열기 ──
function openPermSlide(empid) {
  // 같은 사용자 다시 클릭 → 토글 닫기
  if (_permSlideEmpid === empid && document.getElementById('permCatPanel').classList.contains('open')) {
    closePermSlide();
    return;
  }
  _permSlideEmpid = empid;
  var acct = _acctCache.find(function(a) { return a.empid === empid; });
  if (!acct) return;
  var perms = acct.permissions || [];

  // 사용자 정보
  var whoEl = document.getElementById('permSlideWho');
  whoEl.innerHTML = '<span class="perm-who-name">' + (window.escHtml ? escHtml(acct.name) : acct.name) + '</span><span class="perm-who-id">' + (window.escHtml ? escHtml(acct.empid) : acct.empid) + '</span>';

  // 카테고리 목록 렌더링
  var listEl = document.getElementById('permCatList');
  listEl.innerHTML = PERM_CATEGORIES.map(function(cat) {
    var cnt = _countCatPerms(cat, perms);
    return '<div class="perm-cat-item" data-cat-id="' + cat.id + '" onclick="openPermDetail(\'' + cat.id + '\')">' +
      '<span class="perm-cat-icon">' + cat.icon + '</span>' +
      '<span class="perm-cat-title">' + (cat.title_i18n && typeof t === 'function' ? t(cat.title_i18n) : cat.title) + '</span>' +
      '<span class="perm-cat-count" id="perm-cnt-cat-' + cat.id + '">' + cnt + '</span>' +
      '<span class="perm-cat-arrow">›</span>' +
    '</div>';
  }).join('');

  // 권한 복사 드롭다운 채우기 (본인 제외)
  var copySelect = document.getElementById('permCopySource');
  if (copySelect) {
    var opts = '<option value="">-- 대상 선택 --</option>';
    _acctCache.slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); }).forEach(function(acc) {
      if (acc.empid === empid) return;
      if (acc.role === 'admin') return; // 관리자는 전체 권한이므로 제외
      var pCnt = _countUniquePerms(acc.permissions || []);
      if (pCnt === 0) return; // 권한 없는 계정 제외
      opts += '<option value="' + acc.empid + '">' + acc.name + ' (' + acc.empid + ') — ' + pCnt + '개 권한</option>';
    });
    copySelect.innerHTML = opts;
    copySelect.value = '';
  }

  // 2단 열기 (3단은 닫기)
  document.getElementById('permCatPanel').classList.add('open');
  document.getElementById('permDetailPanel').classList.remove('open');
  _permOpenCatId = null;
}

// 카테고리 내 활성 권한 수 (열람 또는 승인 중 하나라도 있으면 1개로 카운트)
function _countCatPerms(cat, perms) {
  var active = 0, total = cat.items.length;
  cat.items.forEach(function(item) {
    if (perms.includes(item.key) || perms.includes(item.key + '_approve')) active++;
  });
  return active + '/' + total;
}

// 전체 고유 메뉴 수 카운트 (열람/승인 합쳐서 같은 메뉴는 1개)
function _countUniquePerms(perms) {
  var allItems = [];
  PERM_CATEGORIES.forEach(function(cat) {
    cat.items.forEach(function(item) { allItems.push(item.key); });
  });
  var count = 0;
  allItems.forEach(function(key) {
    if (perms.includes(key) || perms.includes(key + '_approve')) count++;
  });
  return count;
}

// ── 권한 복사 ──
async function applyPermCopy() {
  if (!_permSlideEmpid) return;
  var sourceEmpid = document.getElementById('permCopySource').value;
  if (!sourceEmpid) { showToast('복사할 대상을 선택해주세요.'); return; }

  var source = _acctCache.find(function(a) { return a.empid === sourceEmpid; });
  var target = _acctCache.find(function(a) { return a.empid === _permSlideEmpid; });
  if (!source || !target) return;

  var sourcePerms = (source.permissions || []).slice();
  var sourceName = source.name || source.empid;
  var targetName = target.name || target.empid;

  if (!confirm('📎 ' + sourceName + '의 권한(' + _countUniquePerms(sourcePerms) + '개)을\n' + targetName + '에게 복사하시겠습니까?\n\n기존 권한은 덮어쓰기됩니다.')) return;

  // Firestore 쓰기 전 관리자 Auth 세션/claim 보장 (security rules 통과용)
  try { await _ensureAdminAuthSession(); }
  catch(e) { console.warn('[applyPermCopy] auth session fail:', e); }

  // Firestore 저장
  try {
    await _fbDb.collection('accounts').doc(_permSlideEmpid).update({ permissions: sourcePerms });
    try { if (typeof invalidateAccountsCache === 'function') invalidateAccountsCache(); } catch(e){}
    // 로컬 캐시 업데이트
    target.permissions = sourcePerms;
    _acctCache = _acctCache.map(function(a) { return a.empid === _permSlideEmpid ? target : a; });

    // 카테고리 카운트 갱신
    PERM_CATEGORIES.forEach(function(cat) {
      var cntEl = document.getElementById('perm-cnt-cat-' + cat.id);
      if (cntEl) cntEl.textContent = _countCatPerms(cat, sourcePerms);
    });
    // 카드 내 권한 수 갱신
    var cntBadge = document.getElementById('perm-cnt-' + _permSlideEmpid);
    if (cntBadge) {
      var newCnt = _countUniquePerms(sourcePerms);
      cntBadge.textContent = newCnt;
      cntBadge.classList.toggle('zero', newCnt === 0);
    }
    showToast('✅ ' + sourceName + '의 권한이 ' + targetName + '에게 복사되었습니다.');
  } catch(e) {
    showToast('❌ 권한 복사 실패: ' + e.message);
  }
}

async function resetPermCopy() {
  if (!_permSlideEmpid) return;
  var target = _acctCache.find(function(a) { return a.empid === _permSlideEmpid; });
  if (!target) return;
  var targetName = target.name || target.empid;

  if (!confirm('🔄 ' + targetName + '의 모든 권한을 초기화(0개)하시겠습니까?')) return;

  // Firestore 쓰기 전 관리자 Auth 세션/claim 보장
  try { await _ensureAdminAuthSession(); }
  catch(e) { console.warn('[resetPermCopy] auth session fail:', e); }

  // Firestore 저장
  _fbDb.collection('accounts').doc(_permSlideEmpid).update({ permissions: [] }).then(function() {
    try { if (typeof invalidateAccountsCache === 'function') invalidateAccountsCache(); } catch(e){}
    target.permissions = [];
    _acctCache = _acctCache.map(function(a) { return a.empid === _permSlideEmpid ? target : a; });

    // 카테고리 카운트 갱신
    PERM_CATEGORIES.forEach(function(cat) {
      var cntEl = document.getElementById('perm-cnt-cat-' + cat.id);
      if (cntEl) cntEl.textContent = _countCatPerms(cat, []);
    });
    var cntBadge = document.getElementById('perm-cnt-' + _permSlideEmpid);
    if (cntBadge) { cntBadge.textContent = '0'; cntBadge.classList.add('zero'); }
    showToast('🔄 ' + targetName + '의 권한이 초기화되었습니다.');
  }).catch(function(e) {
    showToast('❌ 초기화 실패: ' + e.message);
  });
}

// ── 2단 → 3단: 카테고리 상세 열기 ──
function openPermDetail(catId) {
  // 이전 카테고리 변경사항 저장 (카테고리 전환 시 소실 방지)
  if (_permOpenCatId) _syncDetailToCache();
  _permOpenCatId = catId;
  var cat = PERM_CATEGORIES.find(function(c) { return c.id === catId; });
  if (!cat) return;
  var acct = _acctCache.find(function(a) { return a.empid === _permSlideEmpid; });
  var perms = acct ? (acct.permissions || []) : [];

  // 헤더 타이틀
  document.getElementById('permDetailTitle').innerHTML = cat.icon + ' ' + (cat.title_i18n && typeof t === 'function' ? t(cat.title_i18n) : cat.title);

  // 테이블 그리드: 열(열람/승인) x 행(서브항목)
  var bodyEl = document.getElementById('permDetailBody');
  var rows = cat.items.map(function(item) {
    var viewChk = perms.includes(item.key) ? 'checked' : '';
    var apprChk = perms.includes(item.key + '_approve') ? 'checked' : '';
    var itemLabel = (item.i18n && typeof t === 'function') ? (t(item.i18n) || item.label) : item.label;
    return '<div class="perm-grid-row">' +
      '<div class="perm-grid-name">' + itemLabel + '</div>' +
      '<div class="perm-grid-cell"><label class="toggle-switch">' +
        '<input type="checkbox" data-perm="' + item.key + '" data-type="view" data-approve-key="' + item.key + '_approve" ' + viewChk + ' onchange="onViewToggle(this)">' +
        '<span class="toggle-slider"></span></label></div>' +
      '<div class="perm-grid-cell"><label class="toggle-switch approve-toggle">' +
        '<input type="checkbox" data-perm="' + item.key + '_approve" data-type="approve" data-view-key="' + item.key + '" ' + apprChk + ' onchange="onApproveToggle(this)">' +
        '<span class="toggle-slider"></span></label></div>' +
    '</div>';
  }).join('');

  // 일괄 승인 토글 상태 계산
  var allViewOn = cat.items.every(function(item) { return perms.includes(item.key); });
  var allApprOn = cat.items.every(function(item) { return perms.includes(item.key + '_approve'); });

  var bulkRow = '<div class="perm-grid-row" style="background:#f0f9ff;border-bottom:2px solid #3b82f6;">' +
    '<div class="perm-grid-name" style="font-weight:700;color:#1d4ed8;">전체</div>' +
    '<div class="perm-grid-cell"><label class="toggle-switch">' +
      '<input type="checkbox" id="bulkViewToggle" ' + (allViewOn ? 'checked' : '') + ' onchange="onBulkViewToggle(this)">' +
      '<span class="toggle-slider"></span></label></div>' +
    '<div class="perm-grid-cell"><label class="toggle-switch approve-toggle">' +
      '<input type="checkbox" id="bulkApproveToggle" ' + (allApprOn ? 'checked' : '') + ' onchange="onBulkApproveToggle(this)">' +
      '<span class="toggle-slider"></span></label></div>' +
  '</div>';

  bodyEl.innerHTML = '<div class="perm-grid">' +
    '<div class="perm-grid-hdr">' +
      '<div class="perm-grid-hdr-label"></div>' +
      '<div class="perm-grid-hdr-label">열람</div>' +
      '<div class="perm-grid-hdr-label">승인</div>' +
    '</div>' + bulkRow + rows + '</div>';

  // 3단 열기
  document.getElementById('permDetailPanel').classList.add('open');
}

// 승인 ON → 열람도 자동 ON
function onApproveToggle(cb) {
  if (cb.checked) {
    var viewKey = cb.dataset.viewKey;
    var viewCb = document.querySelector('#permDetailBody input[data-perm="' + viewKey + '"][data-type="view"]');
    if (viewCb && !viewCb.checked) viewCb.checked = true;
  }
  _syncBulkToggles();
}
// 열람 OFF 시 승인이 ON이면 차단
function onViewToggle(cb) {
  if (!cb.checked) {
    var approveKey = cb.dataset.approveKey;
    var approveCb = document.querySelector('#permDetailBody input[data-perm="' + approveKey + '"][data-type="approve"]');
    if (approveCb && approveCb.checked) {
      cb.checked = true; // 승인이 켜져 있으면 열람 끌 수 없음
    }
  }
  _syncBulkToggles();
}

// 일괄 열람 토글
function onBulkViewToggle(cb) {
  var on = cb.checked;
  var items = document.querySelectorAll('#permDetailBody input[data-type="view"]');
  items.forEach(function(el) { el.checked = on; });
  // 열람 전체 OFF면 승인도 전체 OFF
  if (!on) {
    var apprs = document.querySelectorAll('#permDetailBody input[data-type="approve"]');
    apprs.forEach(function(el) { el.checked = false; });
    var bulkAppr = document.getElementById('bulkApproveToggle');
    if (bulkAppr) bulkAppr.checked = false;
  }
}
// 일괄 승인 토글
function onBulkApproveToggle(cb) {
  var on = cb.checked;
  var apprs = document.querySelectorAll('#permDetailBody input[data-type="approve"]');
  apprs.forEach(function(el) { el.checked = on; });
  // 승인 ON → 열람도 전체 ON
  if (on) {
    var items = document.querySelectorAll('#permDetailBody input[data-type="view"]');
    items.forEach(function(el) { el.checked = true; });
    var bulkView = document.getElementById('bulkViewToggle');
    if (bulkView) bulkView.checked = true;
  }
}
// 개별 토글 변경 시 일괄 토글 상태 동기화
function _syncBulkToggles() {
  var views = document.querySelectorAll('#permDetailBody input[data-type="view"]');
  var apprs = document.querySelectorAll('#permDetailBody input[data-type="approve"]');
  var allView = Array.prototype.every.call(views, function(el) { return el.checked; });
  var allAppr = Array.prototype.every.call(apprs, function(el) { return el.checked; });
  var bv = document.getElementById('bulkViewToggle');
  var ba = document.getElementById('bulkApproveToggle');
  if (bv) bv.checked = allView;
  if (ba) ba.checked = allAppr;
}

// ← 뒤로 (3단 닫기)
function closePermDetail() {
  // 3단 닫기 전에 현재 토글 상태를 acct 캐시에 임시 반영 + 카테고리 카운트 갱신
  _syncDetailToCache();
  document.getElementById('permDetailPanel').classList.remove('open');
  _permOpenCatId = null;
}

// 상세 패널 토글 → 캐시 동기화 + 카운트 갱신
function _syncDetailToCache() {
  if (!_permSlideEmpid) return;
  var acct = _acctCache.find(function(a) { return a.empid === _permSlideEmpid; });
  if (!acct) return;
  // 현재 상세 패널의 토글에서 권한 수집 (bulk 토글 제외)
  var detailChecks = document.querySelectorAll('#permDetailBody input[data-perm]');
  var perms = acct.permissions ? acct.permissions.slice() : [];
  // undefined/null 제거 (과거 버그로 인한 잔여값 정리)
  perms = perms.filter(function(p) { return typeof p === 'string' && p; });

  detailChecks.forEach(function(c) {
    var key = c.dataset.perm;
    if (!key) return;
    var idx = perms.indexOf(key);
    if (c.checked && idx === -1) perms.push(key);
    if (!c.checked && idx !== -1) perms.splice(idx, 1);
  });

  acct.permissions = perms;

  // 카테고리 카운트 갱신
  PERM_CATEGORIES.forEach(function(cat) {
    var cntEl = document.getElementById('perm-cnt-cat-' + cat.id);
    if (cntEl) cntEl.textContent = _countCatPerms(cat, perms);
  });
}

// 전체 닫기 (2단+3단)
function closePermSlide() {
  if (_permOpenCatId) _syncDetailToCache();
  document.getElementById('permCatPanel').classList.remove('open');
  document.getElementById('permDetailPanel').classList.remove('open');
  _permSlideEmpid = null;
  _permOpenCatId = null;
}

// 적용 버튼
async function savePermSlide() {
  if (_permOpenCatId) _syncDetailToCache();
  var empid = _permSlideEmpid;
  if (!empid) return;
  var acct = _acctCache.find(function(a) { return a.empid === empid; });
  if (!acct) return;

  var permissions = acct.permissions || [];
  var updated = Object.assign({}, acct, { permissions: permissions });
  _acctCache = _acctCache.map(function(a) { return a.empid === empid ? updated : a; });
  saveLocalAccount(updated);

  // 카드 배지 갱신 (고유 메뉴 수 기준)
  _updatePermCount(empid, _countUniquePerms(permissions));

  var btn = document.getElementById('btnPermSlideApply');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ 저장 중...'; }

  // Firestore 쓰기 전 관리자 Auth 세션/claim 보장 (권한이 반영 안 되는 문제 방지)
  var _authErr = null;
  try { await _ensureAdminAuthSession(); }
  catch(e) { _authErr = e; console.warn('[savePermSlide] auth session fail:', e); }

  // 1) apiPost 경로 (update_account) + 2) Firestore 직접 업데이트 (fallback) — 둘 다 시도
  var _saveOk = false;
  var _saveErr = null;
  try {
    await apiPost({ action: 'update_account', account: updated });
    _saveOk = true;
  } catch(e) { _saveErr = e; }
  if (!_saveOk) {
    // fallback: 직접 Firestore 업데이트
    try {
      await _fbDb.collection('accounts').doc(empid).update({
        permissions: permissions,
        role: updated.role || 'user'
      });
      _saveOk = true;
    } catch(e2) { _saveErr = e2; console.warn('[savePermSlide] direct update fail:', e2); }
  }
  try { if (typeof invalidateAccountsCache === 'function') invalidateAccountsCache(); } catch(e){}

  if (btn) {
    if (_saveOk) {
      btn.innerHTML = '✅ 저장됨';
    } else {
      btn.innerHTML = '❌ 저장 실패';
      var _errMsg = (_saveErr && (_saveErr.message || _saveErr.code)) || '알 수 없는 오류';
      var _hint = _authErr ? '\n(관리자 Auth 세션 재로그인 필요)' : '';
      neoAlert('❌ 권한 저장 실패: ' + _errMsg + _hint);
    }
    setTimeout(function() {
      btn.innerHTML = '✅ <span data-i18n="perm_btn_apply">적용</span>';
      btn.disabled = false;
    }, 1500);
  }

  // 저장 피드백
  var card = document.getElementById('acct-card-' + empid);
  if (card && _saveOk) { card.classList.add('perm-saved'); setTimeout(function(){ card.classList.remove('perm-saved'); }, 800); }
}

function _updatePermCount(empid, count) {
  var cntEl = document.getElementById('perm-cnt-' + empid);
  if (!cntEl) return;
  cntEl.textContent = count;
  if (count === 0) cntEl.classList.add('zero');
  else cntEl.classList.remove('zero');
}

// ── 관리자 Firebase Auth 세션 & claim 보장 ─────────────────────────────────
// httpsCallable('adminResetUserPassword') 가 context.auth / admin claim 을 요구하므로,
// 호출 직전에 현재 관리자(T2408087 등) 를 Firebase Auth 에 로그인시키고 claim 을 부여한다.
async function _ensureAdminAuthSession() {
  var me = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (!me || !me.empid) throw new Error('no_session_user');
  var myEmail = me.empid + (typeof FB_AUTH_DOMAIN === 'string' ? FB_AUTH_DOMAIN : '@neothai-order.firebaseapp.com');
  var myPw = me.pw || me.empid;

  // 1) currentUser 가 null 이면 로그인 시도 (typed pw → empid fallback)
  if (!_fbAuth.currentUser) {
    try {
      await _fbAuth.signInWithEmailAndPassword(myEmail, myPw);
    } catch(e1) {
      if (myPw !== me.empid) {
        try { await _fbAuth.signInWithEmailAndPassword(myEmail, me.empid); }
        catch(e2) { throw new Error('auth_signin_failed: ' + (e1.code || e1.message)); }
      } else {
        throw new Error('auth_signin_failed: ' + (e1.code || e1.message));
      }
    }
  }

  // 2) admin claim 이 없으면 bootstrap (T2408087 만 자기 자신에게 가능)
  try {
    var token = await _fbAuth.currentUser.getIdTokenResult();
    if (!(token.claims && token.claims.admin === true)) {
      if (me.empid === 'T2408087' || me.role === 'admin') {
        try {
          var callBootstrap = firebase.functions().httpsCallable('setAdminClaim');
          await callBootstrap({ empid: me.empid, admin: true });
          // 새 claim 반영하려면 토큰 강제 갱신
          await _fbAuth.currentUser.getIdToken(true);
        } catch(be) {
          console.warn('setAdminClaim bootstrap 실패:', be);
        }
      }
    }
  } catch(e) { console.warn('getIdTokenResult 실패:', e); }
}

// ── 관리자 비밀번호 리셋 ────────────────────────────────────────────────────
async function resetAcctPwAdmin(empid) {
  var newPw = prompt(empid + ' 계정의 새 비밀번호를 입력하세요 (6자 이상):');
  if (!newPw || !newPw.trim()) return;
  newPw = newPw.trim();
  if (newPw.length < 6) { neoAlert('비밀번호는 6자 이상이어야 합니다.'); return; }
  var acct = _acctCache.find(function(a) { return a.empid === empid; });
  if (!acct) return;
  var updated = Object.assign({}, acct, { pw: newPw });
  saveLocalAccount(updated);

  // 1) 관리자 Firebase Auth 세션 + admin claim 보장
  var authOk = false, authMsg = '';
  try {
    await _ensureAdminAuthSession();
  } catch(e) {
    authMsg = '관리자 Auth 세션 준비 실패: ' + (e.message || e);
  }

  // 2) Firebase Auth 비번 강제 재설정 (Cloud Function)
  if (!authMsg) {
    try {
      var callFn = firebase.functions().httpsCallable('adminResetUserPassword');
      var res = await callFn({ empid: empid, newPw: newPw });
      authOk = !!(res && res.data && res.data.ok);
    } catch(e) {
      authMsg = (e && e.message) || String(e);
      console.warn('adminResetUserPassword error:', e);
    }
  }

  // 3) Firestore accounts 문서 동기화
  try {
    await apiPost({ action: 'update_account', account: updated });
  } catch(e) {
    try { await _fbDb.collection('accounts').doc(empid).set(updated, { merge: true }); } catch(e2) {}
  }
  try { if (typeof invalidateAccountsCache === 'function') invalidateAccountsCache(); } catch(e){}

  if (authOk) {
    neoAlert('✅ ' + empid + ' 비밀번호가 재설정되었습니다.\n(Firebase Auth + Firestore 동기화 완료)');
  } else {
    neoAlert('⚠️ Firestore만 저장됨. Auth 재설정 실패: ' + (authMsg || '알 수 없는 오류'));
  }
}

function closeEditAcct() {
  _closeBounce(document.getElementById('editAcctOverlay'), 'open', function() {
    _resetModalPos(document.querySelector('.edit-acct-modal'));
  });
}

function editAcctOverlayClick(e) { /* X 버튼으로만 닫힘 */ }
function odOverlayClick(e) { /* X 버튼으로만 닫힘 */ }

async function saveEditAcct() {
  var empid    = document.getElementById('edit_acct_empid').value;
  var name     = document.getElementById('edit_acct_name').value.trim();
  var nickname = _titleCase((document.getElementById('edit_acct_nickname') || {value:''}).value.trim());
  var dept     = document.getElementById('edit_acct_dept').value;
  var sub_dept = document.getElementById('edit_acct_sub_dept').value;
  var tel      = document.getElementById('edit_acct_tel').value.trim();
  var email    = document.getElementById('edit_acct_email').value.trim();
  var pw       = document.getElementById('edit_acct_pw').value;
  var msg      = document.getElementById('edit_acct_msg');

  // role
  var roleEl = document.querySelector('input[name="edit_acct_role"]:checked');
  var role   = roleEl ? roleEl.value : 'viewer';
  // position (직위)
  var posEl = document.querySelector('input[name="edit_acct_position"]:checked');
  var position = posEl ? posEl.value : 'member';
  // permissions — 기존 권한 유지 (권한은 계정 관리 패널에서 별도 관리)
  var acct = _acctCache.find(function(a) { return a.empid === empid; });
  var permissions = acct ? (acct.permissions || []) : [];

  function _setMsg(txt, ok) {
    if (!msg) return;
    msg.textContent = txt;
    msg.className   = 'acct-settings-msg ' + (ok ? 'ok' : 'err');
  }

  if (!name) { _setMsg(t('as_name_required'), false); return; }
  if (email && !isValidEmail(email)) { _setMsg(t('as_email_invalid'), false); return; }

  // find cached acct and update
  var acct = _acctCache.find(function(a) { return a.empid === empid; });
  if (!acct) { _setMsg(t('load_failed'), false); return; }

  var updated = Object.assign({}, acct, { name: name, nickname: nickname, dept: dept, sub_dept: sub_dept, role: role, position: position, permissions: permissions });
  if (tel)   updated.tel   = tel;
  if (email) updated.email = email;
  if (pw)    updated.pw    = pw;

  try {
    await apiPost({ action: 'update_account', account: updated });
  } catch(e) {}
  // Firestore 직접 업데이트
  try { await _fbDb.collection('accounts').doc(empid).set(updated, { merge: true }); } catch(e) { console.warn('Firestore update error:', e); }
  try { if (typeof invalidateAccountsCache === 'function') invalidateAccountsCache(); } catch(e){}
  saveLocalAccount(updated);
  // _acctCache 동기화
  var cIdx = _acctCache.findIndex(function(a) { return a.empid === empid; });
  if (cIdx !== -1) Object.assign(_acctCache[cIdx], updated);
  else _acctCache.push(updated);

  // 수정 대상이 현재 로그인 사용자라면 세션도 갱신
  var me = getCurrentUser();
  if (me && me.empid === empid) {
    setCurrentUser(updated);
    applyUserUI(updated);
  }

  _setMsg(t('as_save_ok'), true);
  setTimeout(function() {
    closeEditAcct();
    renderAcctList();
  }, 900);
}


// ── 고객 상세에서 바로 주문 열기 ─────────────────────────────────────────────
function openOrderFromModal() {
  if (!_modalCustomer) return;
  const r = _modalCustomer;
  closeModalDirect();

  // 주문폼 초기화
  orderItems = [];
  _settleRefs = [];
  _consignItems = [];
  _consignOrders = [];
  orderSelectedItem = null;
  orderAddress  = null;
  orderShipType = '일반출고';
  document.querySelectorAll('.ship-type-btn').forEach(function(b) {
    b.classList.toggle('selected', b.textContent.trim() === '일반출고');
  });
  document.getElementById('itemSearchInput').value = '';
  document.getElementById('itemQty').value = 1;
  var _siw=document.getElementById('selItemWrap'); if(_siw) _siw.style.display='none';
  renderOrderItems();

  // 고객 선택 상태로 세팅
  orderCustomer = r;
  document.getElementById('custSearchInput').value = r.name_en || r.name_th || '';
  document.getElementById('cscErp').textContent    = r.erp || '';
  document.getElementById('cscName').textContent   = r.name_en || r.name_th || '';
  document.getElementById('cscClinic').textContent = r.clinic || r.cust_name || '';
  document.getElementById('custSelectedCard').classList.add('show');

  // 주소 세팅
  var addrs = [];
  if (r.addr_reg)  addrs.push({ label: t('addr_reg_label'), val: r.addr_reg });
  if (r.addr_del)  addrs.push({ label: t('addr_del1_label'), val: r.addr_del });
  if (r.addr_del2) addrs.push({ label: t('addr_del2_label'), val: r.addr_del2 });
  if (r.addr_del3) addrs.push({ label: t('addr_del3_label'), val: r.addr_del3 });
  if (!addrs.length && r.address) addrs.push({ label: t('addr_label'), val: r.address });
  buildAddrBtns(addrs);
  document.getElementById('btnStepNext').disabled = false;

  // 바로 스텝2(아이템 선택)로 이동
  showOrderStep(2);
  document.getElementById('orderOverlay').classList.add('open');
}


// ── 일괄 처리 (체크박스) ─────────────────────────────────────────────────────
function getCheckedIds() {
  return [...document.querySelectorAll('.pc-checkbox[data-id]:checked')].map(c => c.dataset.id);
}

function onCardCheck() {
  const checked = getCheckedIds();
  const cards = document.querySelectorAll('.pending-card');
  // 카드 하이라이트
  cards.forEach(card => {
    const chk = card.querySelector('.pc-checkbox');
    if (chk) card.classList.toggle('checked', chk.checked);
  });
  // 배치 바 표시/숨김
  const bar = document.getElementById('batchBar');
  if (checked.length > 0) {
    bar.classList.add('show');
    document.getElementById('batchInfo').textContent = checked.length + t('n_selected');
  } else {
    bar.classList.remove('show');
  }
  // 전체선택 체크박스 동기화
  const allChks = document.querySelectorAll('.pc-checkbox[data-id]');
  document.getElementById('checkAll').checked = allChks.length > 0 && checked.length === allChks.length;
}

function toggleCheckAll(chk) {
  document.querySelectorAll('.pc-checkbox[data-id]').forEach(c => { c.checked = chk.checked; });
  onCardCheck();
}

async function batchComplete() {
  const _me = getCurrentUser();
  if (!_me || _me.dept !== 'Office') { neoAlert(t('batch_office_only')); return; }
  const ids = getCheckedIds();
  if (!ids.length) return;
  if (!confirm(ids.length + t('batch_complete_confirm'))) return;
  const user = getCurrentUser();
  const completedBy   = user ? user.name + ' (' + user.dept + ')' : '미로그인';
  const completedDate = new Date().toLocaleString('ko-KR');
  document.getElementById('batchInfo').textContent = t('processing');
  let done = 0;
  for (const id of ids) {
    try {
      await apiPost({ action: 'complete', id, completedBy, completedDate });
      done++;
    } catch(e) {}
  }
  neoAlert(done + t('batch_complete_done'));
  renderPendingOrders();
  updateDeliveryBadge();
}

async function batchCancel() {
  const ids = getCheckedIds();
  if (!ids.length) return;
  if (!confirm(ids.length + t('batch_cancel_confirm'))) return;
  document.getElementById('batchInfo').textContent = t('cancelling');
  let done = 0;
  for (const id of ids) {
    try {
      await apiPost({ action: 'cancel', id });
      done++;
    } catch(e) {}
  }
  neoAlert(done + t('batch_cancel_done'));
  renderPendingOrders();
}


// ── 주문 수정 ─────────────────────────────────────────────────────────────────
let editingOrderId = null;
let _pendingOrdersCache = [];
// GAS가 memo/attachments를 반환하지 않을 경우를 대비한 로컬 extras 캐시
// { orderId: { memo, attachments } }  — 세션 내 유지 + localStorage로 memo 영구 저장
var _orderExtrasMap = (function() {
  try { return JSON.parse(localStorage.getItem('order_extras_map') || '{}'); } catch(e) { return {}; }
})();

// ── IndexedDB 첨부파일 영구 저장소 ──────────────────────────────────────────
// localStorage(5MB 한계) 대신 IndexedDB(수백 MB)에 첨부파일 저장
var _idb = null;
(function initIDB() {
  if (!window.indexedDB) return;
  var req = indexedDB.open('neobiotech_orders', 1);
  req.onupgradeneeded = function(e) {
    var db = e.target.result;
    if (!db.objectStoreNames.contains('attachments')) {
      db.createObjectStore('attachments', { keyPath: 'orderId' });
    }
  };
  req.onsuccess = function(e) { _idb = e.target.result; };
  req.onerror   = function()  { console.warn('IndexedDB 초기화 실패 — 메모리 캐시만 사용'); };
})();

/** 첨부파일 저장 (IndexedDB) */
function idbSaveAttachments(orderId, attachments) {
  if (!_idb || !attachments || !attachments.length) return;
  try {
    var tx = _idb.transaction('attachments', 'readwrite');
    tx.objectStore('attachments').put({ orderId: String(orderId), attachments: attachments });
  } catch(e) {}
}

/** 첨부파일 불러오기 (IndexedDB) → Promise */
function idbLoadAttachments(orderId) {
  return new Promise(function(resolve) {
    if (!_idb) { resolve([]); return; }
    try {
      var tx  = _idb.transaction('attachments', 'readonly');
      var req = tx.objectStore('attachments').get(String(orderId));
      req.onsuccess = function() { resolve((req.result && req.result.attachments) || []); };
      req.onerror   = function() { resolve([]); };
    } catch(e) { resolve([]); }
  });
}

/** 첨부파일 삭제 (주문 완료/취소 시 정리용) */
function idbDeleteAttachments(orderId) {
  if (!_idb) return;
  try {
    var tx = _idb.transaction('attachments', 'readwrite');
    tx.objectStore('attachments').delete(String(orderId));
  } catch(e) {}
}

function openEditOrder(id) {
  const o = _pendingOrdersCache.find(x => String(x.id) === String(id));
  if (!o) { neoAlert('주문 정보를 찾을 수 없습니다.'); return; }

  editingOrderId = id;
  closePendingOrders();

  // 주문폼 초기화
  orderSelectedItem = null;
  orderAddress  = o.address || null;
  orderShipType = (o.ship_type && o.ship_type.trim()) ? o.ship_type.trim() : '일반출고';
  document.getElementById('itemSearchInput').value = '';
  document.getElementById('itemQty').value = 1;
  var _siw=document.getElementById('selItemWrap'); if(_siw) _siw.style.display='none';

  // 출고유형 버튼 동기화
  document.querySelectorAll('.ship-type-btn').forEach(function(b) {
    b.classList.toggle('selected', b.dataset.val === orderShipType);
  });

  // 아이템 복원 (가격 및 무상 플래그 포함)
  orderItems = (o.items || []).map(it => {
    var _isFree = !!it.free;
    var _oi = { item: it, qty: it.qty || 1, _price: _isFree ? 0 : (parseFloat(it.price) || 0) };
    if (_isFree) _oi._isFree = true;
    return _oi;
  });
  renderOrderItems();

  // 고객 정보 복원
  const cust = DATA.find(d => d.erp === o.customer_erp);
  if (cust) {
    orderCustomer = cust;
    document.getElementById('custSearchInput').value = cust.name_en || cust.name_th || '';
    document.getElementById('cscErp').textContent    = cust.erp || '';
    document.getElementById('cscName').textContent   = cust.name_en || cust.name_th || '';
    document.getElementById('cscClinic').textContent = cust.clinic || cust.cust_name || '';
    document.getElementById('custSelectedCard').classList.add('show');
  } else {
    orderCustomer = { erp: o.customer_erp, name_en: o.customer_name, clinic: o.customer_clinic };
    document.getElementById('custSearchInput').value = o.customer_name || '';
    document.getElementById('cscErp').textContent    = o.customer_erp || '';
    document.getElementById('cscName').textContent   = o.customer_name || '';
    document.getElementById('cscClinic').textContent = o.customer_clinic || '';
    document.getElementById('custSelectedCard').classList.add('show');
  }

  // 주소 복원 — buildAddrBtns 로 블록 렌더
  var addrs = [];
  if (orderCustomer) {
    if (orderCustomer.addr_reg)  addrs.push({ label: t('addr_reg_label'), val: orderCustomer.addr_reg });
    if (orderCustomer.addr_del)  addrs.push({ label: t('addr_del1_label'), val: orderCustomer.addr_del });
    if (orderCustomer.addr_del2) addrs.push({ label: t('addr_del2_label'), val: orderCustomer.addr_del2 });
    if (orderCustomer.addr_del3) addrs.push({ label: t('addr_del3_label'), val: orderCustomer.addr_del3 });
    if (!addrs.length && orderCustomer.address) addrs.push({ label: t('addr_reg_label'), val: orderCustomer.address });
  }
  if (!addrs.length && orderAddress) {
    addrs.push({ label: t('addr_del1_label'), val: orderAddress });
  }
  buildAddrBtns(addrs);
  // 기존 주소 선택 복원
  if (orderAddress) {
    document.querySelectorAll('.ord-addr-block').forEach(function(b) {
      if (b.getAttribute('data-addr') === orderAddress) {
        selectOrdAddrBlock(b);
      }
    });
  }
  document.getElementById('btnStepNext').disabled = false;

  // 수정 모드: step3 버튼 텍스트 변경
  var finalBtn = document.getElementById('submitOrderBtnFinal');
  if (finalBtn) finalBtn.innerHTML = '<span data-i18n="btn_edit_save">' + t('btn_edit_save') + '</span>';

  showOrderStep(2);
  document.getElementById('orderOverlay').classList.add('open');
  // 모바일 하단 네비 숨기기
  var mobNav = document.getElementById('mobileBottomNav');
  if (mobNav) mobNav.style.display = 'none';
}


// ── 주소 버튼 생성 (직접 입력 포함) ──────────────────────────────────────────
// ── 주소 이력 저장/불러오기 ──────────────────────────────────────────────────
// ── 공유 주소 이력 (GAS 서버 + localStorage 병행) ──────────────────────────

function saveAddrHistory(erp, addr) {
  if (!erp || !addr) return;
  // localStorage 저장 (즉시 반영)
  var key = 'addrHist_' + erp;
  var hist = JSON.parse(localStorage.getItem(key) || '[]');
  hist = [addr].concat(hist.filter(function(a){ return a !== addr; })).slice(0, 20);
  localStorage.setItem(key, JSON.stringify(hist));
  // GAS 서버에 공유 저장 (비동기)
  var user = (getCurrentUser() || {}).name || '';
  apiPost({ action: 'save_address', erp: erp, address: addr, user: user }).catch(function(){});
}

function loadAddrHistory(erp) {
  if (!erp) return [];
  return JSON.parse(localStorage.getItem('addrHist_' + erp) || '[]');
}

// GAS에서 공유 주소 불러와 localStorage 갱신 후 UI 재렌더링
async function syncSharedAddresses(erp) {
  if (!erp) return;
  try {
    var addrDoc = await _fbDb.collection('addresses').doc(erp).get();
    if (!addrDoc.exists) return;
    var serverAddrs = (addrDoc.data().addresses || []).filter(Boolean);
    if (!serverAddrs.length) return;
    var key = 'addrHist_' + erp;
    var local = JSON.parse(localStorage.getItem(key) || '[]');
    // 서버 주소 + 로컬 주소 병합 (중복 제거)
    var merged = [...new Set([...local, ...serverAddrs])].slice(0, 20);
    localStorage.setItem(key, JSON.stringify(merged));
    // 주소 선택 UI 새로고침
    if (typeof renderAddrButtons === 'function') renderAddrButtons();
  } catch(e) {}
}

function deleteAddrHistory(erp, addr, evt) {
  evt.stopPropagation();
  var key = 'addrHist_' + erp;
  var hist = JSON.parse(localStorage.getItem(key) || '[]');
  hist = hist.filter(function(a){ return a !== addr; });
  localStorage.setItem(key, JSON.stringify(hist));
  // GAS 서버에서도 삭제
  apiPost({ action: 'delete_address', erp: erp, address: addr }).catch(function(){});
  // 해당 버튼 제거
  var btn = evt.target.closest('.addr-btn-hist');
  if (btn) {
    var divider = btn.previousElementSibling;
    btn.remove();
    // 이력 버튼이 모두 사라지면 구분선도 제거
    var remaining = document.querySelectorAll('.addr-btn-hist');
    if (!remaining.length && divider && divider.classList.contains('addr-hist-divider')) {
      divider.remove();
    }
  }
}

var _ordAddrCounter = 0;

function buildAddrBtns(addrs) {
  var blocksEl = document.getElementById('ordAddrBlocks');
  var addBtn = document.getElementById('ordAddrAddBtn');
  _ordAddrCounter = 0;

  // 저장된 주소 이력 추가
  var erp = orderCustomer ? orderCustomer.erp : '';
  var hist = loadAddrHistory(erp);
  var mainVals = addrs.map(function(a){ return a.val; });
  var histFiltered = hist.filter(function(h){ return mainVals.indexOf(h) === -1; });

  var allAddrs = addrs.slice();
  histFiltered.forEach(function(h) {
    allAddrs.push({ label: '🕐 ' + t('addr_hist_label'), val: h, isHist: true });
  });

  // 블록 렌더 — 간단 클릭형 카드
  var html = '';
  allAddrs.forEach(function(a, i) {
    _ordAddrCounter++;
    html += _buildOrdAddrCard(a.label, a.val, i === 0, !!a.isHist);
  });
  blocksEl.innerHTML = html;

  if (allAddrs.length) {
    orderAddress = allAddrs[0].val;
    updateOrderMap(orderAddress);
  }
  addBtn.style.display = 'inline-flex';
  document.getElementById('addrSection').classList.add('show');
}

function _buildOrdAddrCard(label, val, isActive, isHist) {
  var safeVal = escHtml(val || '');
  var selAttr = isActive ? ' data-sel-label="✓ ' + t('addr_selected') + '"' : '';
  var me = getCurrentUser();
  var isAdmin = _isApprover(me);
  var delBtn = isAdmin && isHist ? '<button class="ord-addr-block-del" onclick="deleteOrdAddrHist(this,event)" title="삭제" style="position:absolute;top:10px;right:10px;">✕</button>' : '';
  return '<div class="ord-addr-block' + (isActive ? ' active' : '') + '" onclick="selectOrdAddrBlock(this)" data-addr="' + safeVal.replace(/"/g,'&quot;') + '"' + selAttr + '>' +
    delBtn +
    '<div class="ord-addr-block-body" style="padding:12px 16px;">' +
      '<div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;">' + escHtml(label) + '</div>' +
      '<div style="font-size:13px;color:#1e293b;line-height:1.5;">' + safeVal + '</div>' +
    '</div>' +
  '</div>';
}

function selectOrdAddrBlock(block) {
  document.querySelectorAll('.ord-addr-block.active').forEach(function(b){ b.classList.remove('active'); b.removeAttribute('data-sel-label'); });
  block.classList.add('active');
  block.setAttribute('data-sel-label', '✓ ' + t('addr_selected'));
  orderAddress = block.getAttribute('data-addr') || '';
  if (orderAddress) updateOrderMap(orderAddress);
  // 기존 주소 선택 시 신규 입력창 제거
  if (!block.classList.contains('ord-addr-manual')) {
    document.querySelectorAll('.ord-addr-manual').forEach(function(m){ m.remove(); });
  }
}

function onOrdAddrInput(ta) {
  var block = ta.closest('.ord-addr-block');
  if (block && block.classList.contains('active')) {
    var zipEl = block.querySelector('.addr-zip-row input');
    var val = ta.value.trim();
    var zip = (zipEl ? zipEl.value.trim() : '');
    orderAddress = zip ? val + ' ' + zip : val;
    block.setAttribute('data-addr', orderAddress);
    previewOrderMap(val);
  }
}

// 주문 주소 입력창 우측 X(지우기) 토글/클리어 헬퍼
function _toggleOrdAddrClear(id) {
  var inp = document.getElementById(id);
  var btn = document.getElementById(id + '_clr');
  if (!inp || !btn) return;
  btn.style.display = inp.value ? 'flex' : 'none';
}
function _clearOrdAddrInput(id, evt) {
  if (evt) { evt.stopPropagation(); evt.preventDefault(); }
  var inp = document.getElementById(id);
  if (!inp) return;
  inp.value = '';
  _toggleOrdAddrClear(id);
  // pac-container(Google Places 제안) 숨김 처리
  try {
    var pacs = document.querySelectorAll('.pac-container');
    pacs.forEach(function(pac){ pac.style.display = 'none'; });
  } catch(_) {}
  try { inp.focus(); } catch(_) {}
}

function addOrderAddrBlock() {
  var blocksEl = document.getElementById('ordAddrBlocks');
  var count = blocksEl.querySelectorAll('.ord-addr-block').length;
  if (count >= 5) return;
  // 기존 직접입력 블록 중 주소가 비어있는 게 있으면 추가 차단
  var manualBlocks = blocksEl.querySelectorAll('.ord-addr-manual');
  for (var mi = 0; mi < manualBlocks.length; mi++) {
    var mInput = manualBlocks[mi].querySelector('input[type="text"]');
    if (mInput && !mInput.value.trim()) {
      showToast(t('addr_fill_first') || '주소를 먼저 입력해 주세요.');
      mInput.focus();
      return;
    }
  }
  _ordAddrCounter++;
  var manualCount = blocksEl.querySelectorAll('.ord-addr-manual').length;
  var num = manualCount + 1;
  var addrInputId = 'ord_addr_manual_' + _ordAddrCounter;
  var zipInputId = 'ord_zip_manual_' + _ordAddrCounter;
  var mapContId = 'ordManualMapContainer_' + _ordAddrCounter;
  var mapDivId = 'ordManualMapDiv_' + _ordAddrCounter;
  var html = '<div class="ord-addr-block ord-addr-manual" onclick="selectOrdAddrBlock(this)" data-addr="">' +
    '<div class="ord-addr-block-body" style="padding:12px 16px;">' +
      '<div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px;display:flex;justify-content:space-between;">' +
        '<span>' + t('addr_direct') + ' ' + num + '</span>' +
        '<button class="ord-addr-block-del" onclick="removeOrdAddrBlock(this,event)" title="삭제">✕</button>' +
      '</div>' +
      '<div class="addr-wrap">' +
        '<div style="position:relative;">' +
          '<input type="text" id="' + addrInputId + '" placeholder="' + t('addr_direct_placeholder') + '" autocomplete="new-password" name="ord_addr_place_' + _ordAddrCounter + '"' +
            ' oninput="_toggleOrdAddrClear(\'' + addrInputId + '\')"' +
            ' style="width:100%;border:1.5px solid #d1d5db;border-radius:8px;padding:10px 38px 10px 12px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;" />' +
          '<span id="' + addrInputId + '_clr" onclick="_clearOrdAddrInput(\'' + addrInputId + '\',event)" title="Clear"' +
            ' style="display:none;position:absolute;right:10px;top:50%;transform:translateY(-50%);width:18px;height:18px;border-radius:50%;background:#9ca3af;color:#fff;font-size:11px;font-weight:700;cursor:pointer;align-items:center;justify-content:center;line-height:1;user-select:none;box-shadow:0 1px 2px rgba(0,0,0,0.15);">✕</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;">' +
          '<div class="addr-zip-row" style="margin:0;">' +
            '<label style="font-size:11px;color:#6b7280;font-weight:600;">📮 ' + t('postal_code') + '</label>' +
            '<input type="text" id="' + zipInputId + '" placeholder="00000" maxlength="10" style="padding:4px 8px;border:1.5px solid #d1d5db;border-radius:6px;font-size:12px;width:90px;outline:none;">' +
          '</div>' +
          '<div style="flex:1"></div>' +
          '<button onclick="searchOrdManualAddr(\'' + addrInputId + '\',\'' + mapContId + '\',\'' + mapDivId + '\')" style="padding:7px 14px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">🔍 ' + t('addr_search_btn') + '</button>' +
          '<button onclick="resetOrdManualAddr(\'' + addrInputId + '\',\'' + zipInputId + '\',\'' + mapContId + '\',event)" style="padding:7px 14px;background:#ef4444;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">↺ Reset</button>' +
        '</div>' +
        '<div id="' + mapContId + '" style="display:none;margin-top:6px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">' +
          '<div id="' + mapDivId + '" style="width:100%;height:200px;"></div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:8px;">' +
        '<button onclick="saveOrdManualAddr(this)" style="padding:7px 16px;background:#10b981;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">💾 ' + t('cm_pend_save') + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
  blocksEl.insertAdjacentHTML('beforeend', html);
  var newBlock = blocksEl.lastElementChild;
  selectOrdAddrBlock(newBlock);
  // 하단 공용 지도 숨김 (직접 입력 블록 내 지도 사용)
  var orderMapC = document.getElementById('orderMapContainer');
  if (orderMapC) orderMapC.style.display = 'none';
  var addrInput = document.getElementById(addrInputId);
  var zipEl = document.getElementById(zipInputId);
  console.log('[addOrderAddrBlock] addrInput found=' + !!addrInput + ', id=' + addrInputId);
  if (addrInput) {
    // onfocus lazy-init: API 로드 타이밍과 무관하게 포커스 시 자동완성 연결 보장
    addrInput.addEventListener('focus', function _lazyInit() {
      if (!addrInput._gPlacesAttached) {
        _attachOrdManualPlaces(addrInput, mapContId, mapDivId, zipEl, newBlock);
      }
    });
    // Autocomplete 먼저 연결 후 refocus (Google 내부 리스너가 포커스 감지하도록)
    _attachOrdManualPlaces(addrInput, mapContId, mapDivId, zipEl, newBlock);
    setTimeout(function() {
      addrInput.blur();
      addrInput.focus();
    }, 150);
  }
}

function deleteOrdAddrHist(btn, evt) {
  evt.stopPropagation();
  var block = btn.closest('.ord-addr-block');
  if (!block) return;
  var addr = block.getAttribute('data-addr') || '';
  var wasActive = block.classList.contains('active');
  var erp = orderCustomer ? orderCustomer.erp : '';
  // localStorage + GAS에서 삭제
  if (erp && addr) {
    var key = 'addrHist_' + erp;
    var hist = JSON.parse(localStorage.getItem(key) || '[]');
    hist = hist.filter(function(a){ return a !== addr; });
    localStorage.setItem(key, JSON.stringify(hist));
    apiPost({ action: 'delete_address', erp: erp, address: addr }).catch(function(){});
  }
  block.remove();
  if (wasActive) {
    var first = document.querySelector('.ord-addr-block');
    if (first) selectOrdAddrBlock(first);
    else { orderAddress = null; updateOrderMap(null); }
  }
}

function removeOrdAddrBlock(btn, evt) {
  evt.stopPropagation();
  var block = btn.closest('.ord-addr-block');
  var wasActive = block.classList.contains('active');
  block.remove();
  if (wasActive) {
    var first = document.querySelector('.ord-addr-block');
    if (first) selectOrdAddrBlock(first);
    else {
      orderAddress = null;
      updateOrderMap(null);
    }
  }
}

function showCustomAddr() { addOrderAddrBlock(); }

// ── 배송 방법 색상 (추적 가능 여부) ──────────────────────────────────────────
var _trackableMethods = { 'EMS': '#059669', 'NCS': '#2563eb', 'Skootar': '#7c3aed' };
function styledDeliveryMethod(method) {
  if (!method || method === '-') return '-';
  var color = _trackableMethods[method];
  if (color) return '<span style="color:#fff;background:' + color + ';padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">' + escHtml(method) + '</span>';
  return escHtml(method);
}

// ── 구글 지도 미리보기 ────────────────────────────────────────────────────────
var _mapPreviewTimer = null;
var _mapZoom = 15;
var _mapCurrentAddress = null;
// GMAPS_KEY → core.js로 통합됨
var _orderMap = null;
var _orderMapMarker = null;
var _orderMapGeocoder = null;

var _gmapsAvailable = !!(window.google && google.maps && google.maps.Map);

function _checkGmapsAvailable() {
  _gmapsAvailable = !!(window.google && google.maps && google.maps.Map);
  return _gmapsAvailable;
}

function _ensureOrderMap() {
  if (_orderMap) return _orderMap;
  if (!_checkGmapsAvailable()) return null;
  var div = document.getElementById('orderMapDiv');
  if (!div) return null;
  try {
    _orderMap = new google.maps.Map(div, {
      center: { lat: 13.75, lng: 100.50 },
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });
  } catch(e) {
    console.warn('[Maps] JS API init failed, fallback to embed', e);
    _gmapsAvailable = false;
    return null;
  }
  _orderMapGeocoder = new google.maps.Geocoder();
  // 클릭으로 주소 선택
  _orderMap.addListener('click', function(e) {
    var lat = e.latLng.lat();
    var lng = e.latLng.lng();
    _placeOrderMarker(e.latLng);
    _orderMapGeocoder.geocode({ location: { lat: lat, lng: lng } }, function(results, status) {
      if (status === 'OK' && results[0]) {
        var addr = results[0].formatted_address;
        var zip = '';
        results[0].address_components.forEach(function(c) {
          if (c.types.indexOf('postal_code') !== -1) zip = c.long_name;
        });
        // 활성 주소 블록에 반영
        var activeBlock = document.querySelector('.ord-addr-block.active');
        if (activeBlock) {
          var input = activeBlock.querySelector('input[type="text"]');
          var zipInput = activeBlock.querySelector('.addr-zip-row input');
          if (input) input.value = addr;
          if (zipInput && zip) zipInput.value = zip;
          var fullAddr = zip ? addr + ' ' + zip : addr;
          activeBlock.setAttribute('data-addr', fullAddr);
          orderAddress = fullAddr;
        } else {
          orderAddress = addr;
        }
        var addrText = document.getElementById('orderMapAddrText');
        if (addrText) addrText.textContent = addr;
        _mapCurrentAddress = addr;
      }
    });
  });
  return _orderMap;
}

function _showEmbedMapFallback(address) {
  var div = document.getElementById('orderMapDiv');
  if (!div) return;
  var q = encodeURIComponent(address);
  div.innerHTML = '<iframe width="100%" height="100%" frameborder="0" style="border:0;border-radius:10px;" ' +
    'src="https://www.google.com/maps?q=' + q + '&output=embed" allowfullscreen></iframe>';
}

function _placeOrderMarker(latLng) {
  if (_orderMapMarker) { _orderMapMarker.setMap(null); }
  _orderMapMarker = new google.maps.Marker({
    position: latLng,
    map: _orderMap,
    draggable: true,
    animation: google.maps.Animation.DROP
  });
  // 마커 드래그 완료 시 주소 업데이트
  _orderMapMarker.addListener('dragend', function() {
    var pos = _orderMapMarker.getPosition();
    google.maps.event.trigger(_orderMap, 'click', { latLng: pos });
  });
}

// 주문 모달이 완전히 닫힐 때 지도 인스턴스 메모리 해제.
// Google Maps 인스턴스는 모바일에서 30~50MB 수준이라 세션 내내 유지하면
// 메모리 압박이 커짐. 최소화(minimize)가 아닌 완전 닫기 시점에서만 호출.
function _destroyOrderMap() {
  try {
    if (_orderMapMarker) {
      google.maps.event.clearInstanceListeners(_orderMapMarker);
      _orderMapMarker.setMap(null);
      _orderMapMarker = null;
    }
    if (_orderMap) {
      google.maps.event.clearInstanceListeners(_orderMap);
      _orderMap = null;
    }
    _orderMapGeocoder = null;
    var div = document.getElementById('orderMapDiv');
    if (div) div.innerHTML = '';
    var container = document.getElementById('orderMapContainer');
    if (container) container.style.display = 'none';
  } catch(e) { console.warn('[OrderMap] destroy error:', e); }
}
window._destroyOrderMap = _destroyOrderMap;

function zoomOrderMap(delta) {
  if (_orderMap) {
    var z = _orderMap.getZoom() + delta;
    _orderMap.setZoom(Math.min(20, Math.max(5, z)));
  }
}

function updateOrderMap(address) {
  var container = document.getElementById('orderMapContainer');
  var addrText  = document.getElementById('orderMapAddrText');
  if (!container) return;
  if (!address || !address.trim()) {
    container.style.display = 'none';
    if (_orderMapMarker) { _orderMapMarker.setMap(null); _orderMapMarker = null; }
    _mapCurrentAddress = null;
    _mapZoom = 15;
    return;
  }
  _mapCurrentAddress = address.trim();
  if (addrText) addrText.textContent = address.trim();
  container.style.display = 'block';
  // 컨테이너 표시 후 레이아웃 확정 대기 → 지도 초기화
  var _addr = address.trim();
  function _initMapWithAddr() {
    var div = document.getElementById('orderMapDiv');
    if (!div || div.offsetWidth === 0) {
      setTimeout(_initMapWithAddr, 50);
      return;
    }
    // JS API 사용 불가 시 embed 폴백 (데스크탑 등)
    if (!_checkGmapsAvailable() && !_orderMap) {
      _showEmbedMapFallback(_addr);
      return;
    }
    var map = _ensureOrderMap();
    if (!map) {
      // JS API init 실패 → embed 폴백
      _showEmbedMapFallback(_addr);
      return;
    }
    google.maps.event.trigger(map, 'resize');
    if (!_orderMapGeocoder) _orderMapGeocoder = new google.maps.Geocoder();
    _orderMapGeocoder.geocode({ address: _addr }, function(results, status) {
      if (status === 'OK' && results[0]) {
        var loc = results[0].geometry.location;
        map.setCenter(loc);
        map.setZoom(15);
        _placeOrderMarker(loc);
      }
    });
  }
  setTimeout(_initMapWithAddr, 50);
}

function previewOrderMap(val) {
  clearTimeout(_mapPreviewTimer);
  if (!val || !val.trim()) {
    var c = document.getElementById('orderMapContainer');
    if (c) c.style.display = 'none';
    return;
  }
  _mapPreviewTimer = setTimeout(function() { updateOrderMap(val); }, 700);
}

// ── 주소 검색 (Embed API 지도 업데이트) ──────────────────────────────────────
// ── Google Places Autocomplete ──
var _placesReady = false;
function _initGooglePlaces() { _placesReady = true; console.log('[GooglePlaces] API READY, _placesReady=true'); _checkGmapsAvailable(); }

// pac-container(자동완성 드롭다운)를 입력 필드 바로 아래에 강제 고정
// 🔧 body{zoom:0.9} 보정: pac-container 를 document.documentElement 로 이동시켜 zoom 영향 제거
var _pacFixInterval = null;
function _fixPacPosition(inputEl) {
  function _forcePacBelow() {
    var pacs = document.querySelectorAll('.pac-container');
    if (!pacs.length) return;
    var rect = inputEl.getBoundingClientRect();
    // body 의 zoom 값을 읽어 보정 (Chrome: body{zoom:0.9} → 자식 좌표가 0.9배로 렌더됨)
    var bodyZoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    pacs.forEach(function(pac) {
      if (pac.style.display === 'none' || !pac.childElementCount) return;
      // 1) pac-container 를 <html> 루트로 옮겨 body zoom 영향 벗어나게 함
      if (pac.parentNode !== document.documentElement) {
        document.documentElement.appendChild(pac);
      }
      // 2) viewport 좌표 기준으로 바로 아래 배치 (html 은 zoom 없음 → rect 값 그대로 사용)
      pac.style.setProperty('position', 'fixed', 'important');
      pac.style.setProperty('top', rect.bottom + 'px', 'important');
      pac.style.setProperty('left', rect.left + 'px', 'important');
      pac.style.setProperty('width', rect.width + 'px', 'important');
      pac.style.setProperty('zoom', '1', 'important'); // 혹시 모를 상속 차단
      pac.style.setProperty('transform', 'none', 'important');
    });
  }
  inputEl.addEventListener('focus', function() {
    document.body.classList.add('places-input-active');
    // 즉시 1회 보정 + 이후 짧은 간격으로 재보정 (Google 이 위치를 덮어쓰기 때문)
    _forcePacBelow();
    requestAnimationFrame(_forcePacBelow);
    setTimeout(_forcePacBelow, 50);
    setTimeout(_forcePacBelow, 150);
    if (_pacFixInterval) clearInterval(_pacFixInterval);
    _pacFixInterval = setInterval(_forcePacBelow, 100);
  });
  inputEl.addEventListener('input', function(){ _forcePacBelow(); });
  inputEl.addEventListener('blur', function() {
    setTimeout(function() {
      if (_pacFixInterval) { clearInterval(_pacFixInterval); _pacFixInterval = null; }
      document.body.classList.remove('places-input-active');
    }, 400);
  });
}

// ── 고객 등록 폼용 Places Autocomplete + 지도 ──
function _attachRegPlaces(inputEl, mapContainerId, mapDivId, zipInputEl, retryCount) {
  if (!inputEl) return;
  // 🛡️ lazy focus 안전망: Google API 로드 타이밍 문제로 초기 attach 실패해도 포커스 시 재시도
  if (!inputEl._regLazyBound) {
    inputEl._regLazyBound = true;
    inputEl.addEventListener('focus', function _regLazyInit() {
      if (!inputEl._gPlacesAttached && _placesReady && window.google && google.maps && google.maps.places) {
        _attachRegPlaces(inputEl, mapContainerId, mapDivId, zipInputEl);
      }
    });
  }
  if (!_placesReady || !window.google || !google.maps || !google.maps.places) {
    var rc = retryCount || 0;
    if (rc < 40) setTimeout(function(){ _attachRegPlaces(inputEl, mapContainerId, mapDivId, zipInputEl, rc + 1); }, 300);
    return;
  }
  if (inputEl._gPlacesAttached) return;
  inputEl._gPlacesAttached = true;
  console.log('[RegPlaces] ATTACHING to input id=' + inputEl.id);
  inputEl.addEventListener('focus', function() { document.body.classList.add('places-input-active'); });
  inputEl.addEventListener('blur', function() { setTimeout(function(){ document.body.classList.remove('places-input-active'); }, 300); });
  var ac = new google.maps.places.Autocomplete(inputEl, {
    types: ['establishment', 'geocode'],
    componentRestrictions: { country: 'th' },
    fields: ['formatted_address', 'name', 'address_components', 'geometry']
  });
  _fixPacPosition(inputEl);
  ac.addListener('place_changed', function() {
    var place = ac.getPlace();
    if (!place) return;
    var addr = place.formatted_address || '';
    var name = place.name || '';
    if (!addr && !name) return;
    var fullAddr = addr;
    if (name && addr && !addr.startsWith(name)) {
      fullAddr = name + ', ' + addr;
    } else if (!addr && name) {
      fullAddr = name;
    }
    inputEl.value = fullAddr;
    // 우편번호 + 지역 자동 입력
    if (place.address_components) {
      place.address_components.forEach(function(c) {
        if (c.types.indexOf('postal_code') !== -1 && zipInputEl) zipInputEl.value = c.long_name;
        if (c.types.indexOf('administrative_area_level_1') !== -1) {
          var provRaw = (c.long_name || '');
          var provName = provRaw.replace(/^\s*จังหวัด\s*/, '').replace(/\s*Province$/i, '').trim();
          var provLower = provName.toLowerCase().replace(/[\s\-]/g, '');
          var regSel = document.getElementById('reg_location');
          if (regSel) {
            var matched = PROVINCES.find(function(p) {
              var en = p[0].toLowerCase().replace(/[\s\-]/g, '');
              var th = p[1];
              // 정확한 매칭
              if (en === provLower || th === provName) return true;
              // 부분 매칭 (กรุงเทพมหานคร ↔ กรุงเทพฯ)
              if (provName.indexOf(th.replace(/ฯ$/, '')) === 0) return true;
              if (th.replace(/ฯ$/, '') && provRaw.indexOf(th.replace(/ฯ$/, '')) !== -1) return true;
              // 영문 포함 매칭
              if (provLower.indexOf(en) !== -1 || en.indexOf(provLower) !== -1) return true;
              return false;
            });
            if (matched) regSel.value = matched[0];
          }
        }
      });
    }
    // 지도 표시
    var mapContainer = document.getElementById(mapContainerId);
    var mapDiv = document.getElementById(mapDivId);
    if (mapContainer && mapDiv && place.geometry && place.geometry.location) {
      mapContainer.style.display = 'block';
      var map = new google.maps.Map(mapDiv, {
        center: place.geometry.location,
        zoom: 16,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });
      new google.maps.Marker({ position: place.geometry.location, map: map });
    }
  });
}

function _initRegPlacesAll() {
  // _placesReady 체크 제거: _attachRegPlaces 내부에서 retry + lazy focus init 처리
  // 등록 주소
  var regAddr = document.getElementById('reg_addr_reg');
  if (regAddr) _attachRegPlaces(regAddr, 'regAddrMapContainer', 'regAddrMapDiv', document.getElementById('reg_zip_reg'));
  // 배송 주소 1 (Delivery Address 1 - 기본 블록)
  var delAddr = document.getElementById('reg_addr_del');
  if (delAddr) _attachRegPlaces(delAddr, 'regDelMapContainer1', 'regDelMapDiv1', document.getElementById('reg_zip_del1'));
  // 추가로 생성된 배송 주소 블록들 (동적 +)
  var extraInputs = document.querySelectorAll('#deliveryAddrContainer input[type="text"][id^="reg_addr_del_"]');
  extraInputs.forEach(function(inp) {
    var m = inp.id.match(/^reg_addr_del_(\d+)$/);
    if (!m) return;
    var n = m[1];
    var zip = document.getElementById('reg_zip_del_' + n);
    _attachRegPlaces(inp, 'regDelMapContainer' + n, 'regDelMapDiv' + n, zip);
  });
}

function attachPlacesAutocomplete(inputEl, block, retryCount) {
  if (!_placesReady || !window.google || !google.maps || !google.maps.places) {
    var rc = retryCount || 0;
    if (rc < 20) setTimeout(function(){ attachPlacesAutocomplete(inputEl, block, rc + 1); }, 300);
    return;
  }
  if (inputEl._gPlacesAttached) return;
  inputEl._gPlacesAttached = true;
  inputEl.addEventListener('focus', function() { document.body.classList.add('places-input-active'); });
  inputEl.addEventListener('blur', function() { setTimeout(function(){ document.body.classList.remove('places-input-active'); }, 300); });
  var ac = new google.maps.places.Autocomplete(inputEl, {
    types: ['establishment', 'geocode'],
    componentRestrictions: { country: 'th' },
    fields: ['formatted_address', 'name', 'address_components', 'geometry']
  });
  _fixPacPosition(inputEl);
  ac.addListener('place_changed', function() {
    var place = ac.getPlace();
    if (!place) return;
    // formatted_address가 없을 수 있음 (검색어만 입력한 경우)
    var addr = place.formatted_address || '';
    var name = place.name || '';
    if (!addr && !name) return;
    var fullAddr = addr;
    if (name && addr && !addr.startsWith(name)) {
      fullAddr = name + ', ' + addr;
    } else if (!addr && name) {
      fullAddr = name;
    }
    inputEl.value = fullAddr;
    // 우편번호 자동 입력
    var zip = '';
    if (place.address_components) {
      place.address_components.forEach(function(c) {
        if (c.types.indexOf('postal_code') !== -1) zip = c.long_name;
      });
    }
    if (block) {
      var zipInput = block.querySelector('.addr-zip-row input');
      if (zipInput && zip) zipInput.value = zip;
      block.setAttribute('data-addr', zip ? fullAddr + ' ' + zip : fullAddr);
      orderAddress = zip ? fullAddr + ' ' + zip : fullAddr;
      selectOrdAddrBlock(block);
      updateOrderMap(fullAddr);
    }
  });
}

// 주문 직접 입력용 Places Autocomplete (고객 등록과 동일 방식)
var _pacFixIntervalOrd = null;
function _attachOrdManualPlaces(inputEl, mapContainerId, mapDivId, zipInputEl, block, retryCount) {
  console.log('[OrdPlaces] called, _placesReady=' + _placesReady + ', google=' + !!window.google + ', retry=' + (retryCount||0) + ', attached=' + !!inputEl._gPlacesAttached);
  if (!_placesReady || !window.google || !google.maps || !google.maps.places) {
    var rc = retryCount || 0;
    console.log('[OrdPlaces] NOT READY, retry #' + rc);
    if (rc < 20) setTimeout(function(){ _attachOrdManualPlaces(inputEl, mapContainerId, mapDivId, zipInputEl, block, rc + 1); }, 300);
    return;
  }
  if (inputEl._gPlacesAttached) { console.log('[OrdPlaces] already attached, skip'); return; }
  inputEl._gPlacesAttached = true;
  console.log('[OrdPlaces] ATTACHING Autocomplete to input id=' + inputEl.id);
  inputEl.addEventListener('focus', function() {
    document.body.classList.add('places-input-active');
    if (_pacFixIntervalOrd) clearInterval(_pacFixIntervalOrd);
    _pacFixIntervalOrd = setInterval(function() {
      var pacs = document.querySelectorAll('.pac-container');
      if (!pacs.length) return;
      var rect = inputEl.getBoundingClientRect();
      pacs.forEach(function(pac) {
        if (pac.style.display === 'none' || !pac.childElementCount) return;
        // body zoom / transform / will-change 조상으로 인해 position:fixed 좌표가 스케일되는 문제 회피
        // → pac-container 를 html 루트로 재부모화 + zoom/transform 초기화
        if (pac.parentNode !== document.documentElement) {
          document.documentElement.appendChild(pac);
        }
        pac.style.setProperty('position', 'fixed', 'important');
        pac.style.setProperty('top', rect.bottom + 'px', 'important');
        pac.style.setProperty('left', rect.left + 'px', 'important');
        pac.style.setProperty('width', rect.width + 'px', 'important');
        pac.style.setProperty('zoom', '1', 'important');
        pac.style.setProperty('transform', 'none', 'important');
      });
    }, 100);
  });
  inputEl.addEventListener('blur', function() {
    setTimeout(function() {
      if (_pacFixIntervalOrd) { clearInterval(_pacFixIntervalOrd); _pacFixIntervalOrd = null; }
      document.body.classList.remove('places-input-active');
    }, 400);
  });
  var ac = new google.maps.places.Autocomplete(inputEl, {
    types: ['establishment', 'geocode'],
    componentRestrictions: { country: 'th' },
    fields: ['formatted_address', 'name', 'address_components', 'geometry']
  });
  ac.addListener('place_changed', function() {
    var place = ac.getPlace();
    if (!place) return;
    var addr = place.formatted_address || '';
    var name = place.name || '';
    if (!addr && !name) return;
    var fullAddr = addr;
    if (name && addr && !addr.startsWith(name)) fullAddr = name + ', ' + addr;
    else if (!addr && name) fullAddr = name;
    inputEl.value = fullAddr;
    // X(지우기) 버튼 표시 토글
    try { if (typeof _toggleOrdAddrClear === 'function') _toggleOrdAddrClear(inputEl.id); } catch(_){}
    // 우편번호 자동 입력
    if (place.address_components) {
      place.address_components.forEach(function(c) {
        if (c.types.indexOf('postal_code') !== -1 && zipInputEl) zipInputEl.value = c.long_name;
      });
    }
    // 주문 주소 업데이트
    var zip = zipInputEl ? zipInputEl.value.trim() : '';
    if (block) {
      block.setAttribute('data-addr', zip ? fullAddr + ' ' + zip : fullAddr);
      orderAddress = zip ? fullAddr + ' ' + zip : fullAddr;
      selectOrdAddrBlock(block);
    }
    // 지도 표시
    var mapContainer = document.getElementById(mapContainerId);
    var mapDiv = document.getElementById(mapDivId);
    if (mapContainer && mapDiv && place.geometry && place.geometry.location) {
      mapContainer.style.display = 'block';
      var map = new google.maps.Map(mapDiv, {
        center: place.geometry.location, zoom: 16,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false
      });
      new google.maps.Marker({ position: place.geometry.location, map: map });
    }
    // 하단 공용 지도는 숨김 (블록 내 지도 사용)
    var orderMapC = document.getElementById('orderMapContainer');
    if (orderMapC) orderMapC.style.display = 'none';
  });
}

function searchOrdAddr(btn) {
  var block = btn.closest('.ord-addr-block');
  if (!block) return;
  var input = block.querySelector('input[type="text"]');
  if (!input || !input.value.trim()) return;
  var query = input.value.trim();
  var zipInput = block.querySelector('.addr-zip-row input');
  var zip = zipInput ? zipInput.value.trim() : '';
  var addrVal = zip ? query + ' ' + zip : query;
  block.setAttribute('data-addr', addrVal);
  orderAddress = addrVal;
  updateOrderMap(query);
}

// 직접 입력 블록 내 "주소 찾기" 버튼 → 블록 내 지도에 표시
function searchOrdManualAddr(addrInputId, mapContId, mapDivId) {
  console.log('[SearchBtn] clicked, inputId=' + addrInputId + ', _gPlacesAttached=' + (document.getElementById(addrInputId) ? document.getElementById(addrInputId)._gPlacesAttached : 'N/A'));
  var input = document.getElementById(addrInputId);
  if (!input || !input.value.trim()) return;
  var query = input.value.trim();
  var block = input.closest('.ord-addr-block');
  var zipInput = block ? block.querySelector('.addr-zip-row input') : null;
  var zip = zipInput ? zipInput.value.trim() : '';
  var addrVal = zip ? query + ' ' + zip : query;
  if (block) {
    block.setAttribute('data-addr', addrVal);
    selectOrdAddrBlock(block);
  }
  orderAddress = addrVal;
  // 블록 내 지도에 표시
  var mapContainer = document.getElementById(mapContId);
  var mapDiv = document.getElementById(mapDivId);
  if (mapContainer && mapDiv && window.google && google.maps) {
    mapContainer.style.display = 'block';
    var geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: query }, function(results, status) {
      if (status === 'OK' && results[0]) {
        var loc = results[0].geometry.location;
        var map = new google.maps.Map(mapDiv, {
          center: loc, zoom: 16,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false
        });
        new google.maps.Marker({ position: loc, map: map });
      }
    });
  }
  // 하단 공용 지도는 숨김
  var orderMapC = document.getElementById('orderMapContainer');
  if (orderMapC) orderMapC.style.display = 'none';
}

function resetOrdManualAddr(addrInputId, zipInputId, mapContId, evt) {
  if (evt) evt.stopPropagation();
  var addrInput = document.getElementById(addrInputId);
  var zipInput = document.getElementById(zipInputId);
  var mapCont = document.getElementById(mapContId);
  if (addrInput) { addrInput.value = ''; addrInput.focus(); }
  if (zipInput) zipInput.value = '';
  if (mapCont) mapCont.style.display = 'none';
  // X(지우기) 버튼 숨김
  try { if (typeof _toggleOrdAddrClear === 'function') _toggleOrdAddrClear(addrInputId); } catch(_){}
  // data-addr 초기화
  if (addrInput) {
    var block = addrInput.closest('.ord-addr-block');
    if (block) block.setAttribute('data-addr', '');
  }
}

function saveOrdManualAddr(btn) {
  var block = btn.closest('.ord-addr-block');
  if (!block) return;
  var input = block.querySelector('input[type="text"]');
  var zipInput = block.querySelector('.addr-zip-row input');
  var addr = input ? input.value.trim() : '';
  if (!addr) { showToast(t('addr_direct_placeholder')); return; }
  var zip = zipInput ? zipInput.value.trim() : '';
  var fullAddr = zip ? addr + ' ' + zip : addr;
  // 주소 이력에 저장
  var erp = orderCustomer ? orderCustomer.erp : '';
  saveAddrHistory(erp, fullAddr);
  // 수동 블록을 일반 주소 카드로 교체
  var card = document.createElement('div');
  card.innerHTML = _buildOrdAddrCard('🕐 ' + t('addr_hist_label'), fullAddr, true, true);
  var newBlock = card.firstChild;
  block.replaceWith(newBlock);
  selectOrdAddrBlock(newBlock);
  showToast('💾 ' + (t('ship_addr_saved_ok') || '저장되었습니다.'));
}

function clearCustomAddr() {
  var active = document.querySelector('.ord-addr-block.active');
  if (active) {
    var ta = active.querySelector('textarea');
    var zip = active.querySelector('.addr-zip-row input');
    if (ta) { ta.value = ''; ta.focus(); }
    if (zip) zip.value = '';
  }
  orderAddress = null;
  updateOrderMap(null);
}

function confirmCustomAddr() {
  var active = document.querySelector('.ord-addr-block.active');
  if (!active) return;
  var ta = active.querySelector('textarea');
  var zipEl = active.querySelector('.addr-zip-row input');
  var val = ta ? ta.value.trim() : '';
  if (!val) { neoAlert(t('msg_enter_addr')); return; }
  var zip = zipEl ? zipEl.value.trim() : '';
  orderAddress = zip ? val + ' ' + zip : val;
  updateOrderMap(orderAddress);
  var erp = orderCustomer ? orderCustomer.erp : '';
  saveAddrHistory(erp, val);
}

// ══════════════════════════════════════════════════════════════════════
// 관리자 2FA PIN (보안 보강 #5)
// 클라이언트 SHA-256 해시 → accounts/{empid}.admin_pin_hash 에 저장
// 로그인 후 관리자 계정이면 PIN 프롬프트가 떠서 추가 검증
// ══════════════════════════════════════════════════════════════════════
async function _sha256Hex(str) {
  try {
    var enc = new TextEncoder().encode(String(str));
    var buf = await crypto.subtle.digest('SHA-256', enc);
    var hex = '';
    var arr = new Uint8Array(buf);
    for (var i = 0; i < arr.length; i++) hex += ('00' + arr[i].toString(16)).slice(-2);
    return hex;
  } catch(e) {
    // Fallback: 간단 해시 (crypto.subtle 없는 옛 브라우저용)
    var h = 0; for (var j = 0; j < str.length; j++) { h = ((h<<5)-h) + str.charCodeAt(j); h |= 0; }
    return 'fb_' + String(h);
  }
}

async function setAdminPin() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') { _setSettingsMsg('as_pin_msg', '관리자 전용입니다.', false); return; }
  var p1 = document.getElementById('as_pin_new').value;
  var p2 = document.getElementById('as_pin_new2').value;
  if (!/^\d{6}$/.test(p1)) { _setSettingsMsg('as_pin_msg', 'PIN은 6자리 숫자여야 합니다.', false); return; }
  if (p1 !== p2) { _setSettingsMsg('as_pin_msg', '두 PIN이 일치하지 않습니다.', false); return; }
  var btn = document.getElementById('btnSetAdminPin');
  if (btn) { btn.disabled = true; btn.textContent = '설정 중...'; }
  try {
    var hash = await _sha256Hex(p1 + ':' + user.empid); // salt = empid
    await _fbDb.collection('accounts').doc(user.empid).set({ admin_pin_hash: hash }, { merge: true });
    user.admin_pin_hash = hash;
    try { sessionStorage.setItem('current_user', JSON.stringify(user)); } catch(e) {}
    _setSettingsMsg('as_pin_msg', '✅ PIN이 설정되었습니다.', true);
    document.getElementById('as_pin_new').value = '';
    document.getElementById('as_pin_new2').value = '';
    var _pinStatus = document.getElementById('as_pin_status');
    if (_pinStatus) _pinStatus.innerHTML = '<span style="color:#16a34a;">✅ PIN 설정됨 — 로그인 시 PIN 입력이 필요합니다.</span>';
  } catch(e) {
    _setSettingsMsg('as_pin_msg', 'PIN 저장 실패: ' + (e.message || e.code || '알 수 없음'), false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'PIN 설정/변경'; }
  }
}

async function clearAdminPin() {
  var user = getCurrentUser();
  if (!user || user.role !== 'admin') return;
  if (!confirm('PIN을 해제하시겠습니까?\n(이후 로그인 시 PIN 없이 진입 가능 — 보안 약화)')) return;
  var btn = document.getElementById('btnClearAdminPin');
  if (btn) { btn.disabled = true; btn.textContent = '해제 중...'; }
  try {
    await _fbDb.collection('accounts').doc(user.empid).update({
      admin_pin_hash: firebase.firestore.FieldValue.delete()
    });
    delete user.admin_pin_hash;
    try { sessionStorage.setItem('current_user', JSON.stringify(user)); } catch(e) {}
    _setSettingsMsg('as_pin_msg', 'PIN이 해제되었습니다.', true);
    var _pinStatus = document.getElementById('as_pin_status');
    if (_pinStatus) _pinStatus.innerHTML = '<span style="color:#ef4444;">⚠️ PIN 미설정 — 보안을 위해 PIN 설정을 권장합니다.</span>';
  } catch(e) {
    _setSettingsMsg('as_pin_msg', '해제 실패: ' + (e.message || '오류'), false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'PIN 해제'; }
  }
}

// 로그인 시 PIN 검증 프롬프트 (관리자만)
async function _verifyAdminPinOnLogin(user) {
  if (!user || user.role !== 'admin') return true;
  if (!user.admin_pin_hash) {
    // Grace mode: PIN 미설정 시 로그인 허용, 설정 권장 경고만
    try { console.warn('[2FA] admin PIN not set for', user.empid); } catch(e) {}
    return true;
  }
  for (var i = 0; i < 3; i++) {
    var entered = window.prompt('🔐 관리자 PIN (6자리 숫자)을 입력하세요:' + (i > 0 ? '\n(' + (3 - i) + '회 남음)' : ''), '');
    if (entered === null) return false; // 취소
    if (!/^\d{6}$/.test(entered)) { alert('PIN은 6자리 숫자여야 합니다.'); continue; }
    var hash = await _sha256Hex(entered + ':' + user.empid);
    if (hash === user.admin_pin_hash) return true;
    alert('❌ PIN이 일치하지 않습니다.');
  }
  return false;
}
window.setAdminPin = setAdminPin;
window.clearAdminPin = clearAdminPin;
window._verifyAdminPinOnLogin = _verifyAdminPinOnLogin;


