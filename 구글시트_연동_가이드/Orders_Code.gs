// ── 주문 앱 - Google Apps Script Backend v6 (견적 요청 추가) ─────────────────
const SHEET_NAME = 'Orders';
const ACCOUNTS_SHEET_NAME = 'Accounts';
const QUOTE_SHEET_NAME = 'Quotes';

const REQUIRED_HEADERS = [
  'id','date','user','customer_erp','customer_name','customer_clinic',
  'address','items_json','status','ship_type','completed_by','completed_date','cancel_reason','memo'
];
const QUOTE_HEADERS = [
  'id','date','requested_by','customer_erp','customer_name','customer_clinic',
  'items_json','total','request_total','notes','status'
];
const ACCOUNT_HEADERS = ['empid','name','dept','sub_dept','pw','tel','email','role','permissions'];
const FCM_TOKENS_SHEET_NAME = 'FCMTokens';
const FCM_TOKENS_HEADERS = ['empid', 'token', 'updatedAt'];
const SESSIONS_SHEET_NAME = 'Sessions';
const SESSION_HEADERS = ['empid', 'sid', 'updatedAt'];

// ── 시트 초기화 ───────────────────────────────────────────────────────────────
function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(REQUIRED_HEADERS);
    sheet.getRange(1, 1, 1, REQUIRED_HEADERS.length).setFontWeight('bold');
  } else {
    var lastCol = sheet.getLastColumn();
    var existingHeaders = lastCol > 0
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
      : [];
    REQUIRED_HEADERS.forEach(function(h) {
      if (existingHeaders.indexOf(h) === -1) {
        var newCol = existingHeaders.length + 1;
        sheet.getRange(1, newCol).setValue(h);
        sheet.getRange(1, newCol).setFontWeight('bold');
        existingHeaders.push(h);
      }
    });
  }
  return sheet;
}

function getOrCreateAccountsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ACCOUNTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ACCOUNTS_SHEET_NAME);
    sheet.appendRow(ACCOUNT_HEADERS);
    sheet.getRange(1, 1, 1, ACCOUNT_HEADERS.length).setFontWeight('bold');
  } else {
    // 기존 시트에 새 컬럼(tel, email) 없으면 추가
    var existing = sheet.getLastColumn() > 0
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      : [];
    ACCOUNT_HEADERS.forEach(function(h) {
      if (existing.indexOf(h) === -1) {
        var newCol = existing.length + 1;
        sheet.getRange(1, newCol).setValue(h).setFontWeight('bold');
        existing.push(h);
      }
    });
  }
  return sheet;
}

function getOrCreateFCMTokensSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(FCM_TOKENS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(FCM_TOKENS_SHEET_NAME);
    sheet.appendRow(FCM_TOKENS_HEADERS);
    sheet.getRange(1, 1, 1, FCM_TOKENS_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function getOrCreateQuoteSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(QUOTE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(QUOTE_SHEET_NAME);
    sheet.appendRow(QUOTE_HEADERS);
    sheet.getRange(1, 1, 1, QUOTE_HEADERS.length).setFontWeight('bold');
    // 열 너비 자동 조정
    sheet.setColumnWidth(1, 160);   // id
    sheet.setColumnWidth(2, 140);   // date
    sheet.setColumnWidth(8, 100);   // total
    sheet.setColumnWidth(9, 200);   // notes
  } else {
    var existing = sheet.getLastColumn() > 0
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      : [];
    QUOTE_HEADERS.forEach(function(h) {
      if (existing.indexOf(h) === -1) {
        var newCol = existing.length + 1;
        sheet.getRange(1, newCol).setValue(h).setFontWeight('bold');
        existing.push(h);
      }
    });
  }
  return sheet;
}

function getOrCreateAccessToken_() {
  var propJson = PropertiesService.getScriptProperties().getProperty('FCM_SERVICE_ACCOUNT');
  if (!propJson) throw new Error('FCM_SERVICE_ACCOUNT Script Property가 설정되지 않았습니다.');
  var sa = JSON.parse(propJson);
  var now = Math.floor(Date.now() / 1000);
  var header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claim  = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now
  }));
  var toSign = header + '.' + claim;
  var signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(toSign, sa.private_key)
  );
  var jwt = toSign + '.' + signature;
  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true
  });
  return JSON.parse(resp.getContentText()).access_token;
}

function sendFCMPushToOffice_(title, body) {
  try {
    var tokenSheet = getOrCreateFCMTokensSheet();
    var data = tokenSheet.getDataRange().getValues();
    if (data.length < 2) return;
    var tokenIdx = data[0].indexOf('token');
    var tokens = [];
    for (var i = 1; i < data.length; i++) {
      var t = String(data[i][tokenIdx] || '').trim();
      if (t) tokens.push(t);
    }
    if (!tokens.length) return;
    var accessToken = getOrCreateAccessToken_();
    var projectId = JSON.parse(PropertiesService.getScriptProperties().getProperty('FCM_SERVICE_ACCOUNT')).project_id;
    tokens.forEach(function(token) {
      try {
        UrlFetchApp.fetch(
          'https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send',
          {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
            payload: JSON.stringify({
              message: {
                token: token,
                notification: { title: title, body: body },
                webpush: {
                  notification: {
                    icon: 'https://neothai-order.web.app/icon-192.png',
                    badge: 'https://neothai-order.web.app/icon-192.png',
                    requireInteraction: true,
                    vibrate: [200, 100, 200]
                  }
                }
              }
            }),
            muteHttpExceptions: true
          }
        );
      } catch(e2) {}
    });
  } catch(e) {
    Logger.log('FCM 발송 오류: ' + e.message);
  }
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────
function colOf(headers, name) {
  var idx = headers.indexOf(name);
  return idx === -1 ? -1 : idx + 1;
}

function corsOutput(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── GET ───────────────────────────────────────────────────────────────────────
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;

// doGet 함수 안 action 분기에 추가
if (action === 'get_customers') {
  return handleGetCustomers();
}

  // ── 대기 고객 목록 조회 ────────────────────────────────────────────────────
  if (action === 'get_pending_customers') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pcSheet = ss.getSheetByName('Pending_Customers');
    if (!pcSheet) return corsOutput({ ok: true, customers: [] });
    var pcData = pcSheet.getDataRange().getValues();
    if (pcData.length < 2) return corsOutput({ ok: true, customers: [] });
    var pcHdr = pcData[0];
    var customers = [];
    for (var i = 1; i < pcData.length; i++) {
      var obj = {};
      for (var j = 0; j < pcHdr.length; j++) obj[pcHdr[j]] = String(pcData[i][j] || '');
      if (obj.status === 'Pending') {
        try { obj.attachments = JSON.parse(obj.attachments_json || '[]'); } catch(e2) { obj.attachments = []; }
        customers.push(obj);
      }
    }
    return corsOutput({ ok: true, customers: customers });
  }

  // 계정 목록 조회
  if (action === 'get_accounts') {
    var aSheet = getOrCreateAccountsSheet();
    var aData  = aSheet.getDataRange().getValues();
    if (aData.length < 2) return corsOutput({ ok: true, accounts: [] });
    var aHeaders = aData[0];
    var permsColIdx = aHeaders.indexOf('permissions');
    var accounts = [];
    for (var i = 1; i < aData.length; i++) {
      if (!aData[i][0]) continue;
      var obj = {};
      for (var j = 0; j < aHeaders.length; j++) {
        if (j === permsColIdx) {
          // permissions 컬럼은 JSON 배열로 파싱하여 반환
          var rawP = String(aData[i][j] || '');
          try { obj[aHeaders[j]] = rawP ? JSON.parse(rawP) : []; } catch(e) { obj[aHeaders[j]] = []; }
        } else {
          obj[aHeaders[j]] = String(aData[i][j]);
        }
      }
      accounts.push(obj);
    }
    return corsOutput({ ok: true, accounts: accounts });
  }

  // 기본: 주문 목록 조회
  var sheet = getOrCreateSheet();
  var data  = sheet.getDataRange().getValues();
  var headers = data[0];
  var orders = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = String(row[j]);
    try { obj.items = JSON.parse(obj.items_json || '[]'); } catch(ex) { obj.items = []; }
    orders.push(obj);
  }
  var result = JSON.stringify({ ok: true, orders: orders });
  if (e && e.parameter && e.parameter.callback) {
    return ContentService
      .createTextOutput(e.parameter.callback + '(' + result + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return corsOutput({ ok: true, orders: orders });
}

// ── POST ──────────────────────────────────────────────────────────────────────
function getOrCreateSessionsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SESSIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SESSIONS_SHEET_NAME);
    sheet.appendRow(SESSION_HEADERS);
    sheet.getRange(1, 1, 1, SESSION_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);

  // ── 세션 등록 (동시 로그인 감지) ──────────────────────────────────────────
  if (body.action === 'register_session') {
    var sSheet = getOrCreateSessionsSheet();
    var sData  = sSheet.getDataRange().getValues();
    var sHdr   = sData[0];
    var sEmpCol = sHdr.indexOf('empid');
    var sSidCol = sHdr.indexOf('sid');
    var sDateCol = sHdr.indexOf('updatedAt');
    // 기존 세션 업데이트 또는 신규 등록
    var found = false;
    for (var si = 1; si < sData.length; si++) {
      if (String(sData[si][sEmpCol]) === String(body.empid)) {
        sSheet.getRange(si + 1, sSidCol + 1).setValue(body.sid);
        sSheet.getRange(si + 1, sDateCol + 1).setValue(new Date().toISOString());
        found = true;
        break;
      }
    }
    if (!found) {
      sSheet.appendRow([body.empid, body.sid, new Date().toISOString()]);
    }
    return corsOutput({ status: 'ok' });
  }

  // ── 세션 확인 ─────────────────────────────────────────────────────────────
  if (body.action === 'check_session') {
    var csSheet = getOrCreateSessionsSheet();
    var csData  = csSheet.getDataRange().getValues();
    var csHdr   = csData[0];
    var csEmpCol = csHdr.indexOf('empid');
    var csSidCol = csHdr.indexOf('sid');
    for (var ci = 1; ci < csData.length; ci++) {
      if (String(csData[ci][csEmpCol]) === String(body.empid)) {
        var serverSid = String(csData[ci][csSidCol]);
        if (serverSid && serverSid !== String(body.sid)) {
          return corsOutput({ status: 'conflict', message: 'another_session_active' });
        }
        return corsOutput({ status: 'ok' });
      }
    }
    return corsOutput({ status: 'ok' });
  }

  // ── 세션 삭제 ─────────────────────────────────────────────────────────────
  if (body.action === 'clear_session') {
    var clSheet = getOrCreateSessionsSheet();
    var clData  = clSheet.getDataRange().getValues();
    var clHdr   = clData[0];
    var clEmpCol = clHdr.indexOf('empid');
    var clSidCol = clHdr.indexOf('sid');
    for (var cli = 1; cli < clData.length; cli++) {
      if (String(clData[cli][clEmpCol]) === String(body.empid) && String(clData[cli][clSidCol]) === String(body.sid)) {
        clSheet.deleteRow(cli + 1);
        break;
      }
    }
    return corsOutput({ status: 'ok' });
  }

  // ── FCM 토큰 저장 ─────────────────────────────────────────────────────────
  if (body.action === 'save_fcm_token') {
    var ftSheet = getOrCreateFCMTokensSheet();
    var ftData  = ftSheet.getDataRange().getValues();
    var ftHdr   = ftData[0];
    var empidIdx = ftHdr.indexOf('empid');
    var tokenIdx = ftHdr.indexOf('token');
    var dateIdx  = ftHdr.indexOf('updatedAt');
    for (var i = 1; i < ftData.length; i++) {
      if (String(ftData[i][empidIdx]) === String(body.empid)) {
        ftSheet.getRange(i+1, tokenIdx+1).setValue(body.token);
        ftSheet.getRange(i+1, dateIdx+1).setValue(new Date().toISOString());
        return corsOutput({ ok: true, msg: 'token_updated' });
      }
    }
    var newRow = new Array(ftHdr.length).fill('');
    newRow[empidIdx] = body.empid;
    newRow[tokenIdx] = body.token;
    newRow[dateIdx]  = new Date().toISOString();
    ftSheet.appendRow(newRow);
    return corsOutput({ ok: true, msg: 'token_saved' });
  }

  // ── 계정 로그인 ──────────────────────────────────────────────────────────
  if (body.action === 'login') {
    var aSheet  = getOrCreateAccountsSheet();
    var aData   = aSheet.getDataRange().getValues();
    var aHdr    = aData[0];
    var empidIdx    = aHdr.indexOf('empid');
    var pwIdx       = aHdr.indexOf('pw');
    var nameIdx     = aHdr.indexOf('name');
    var deptIdx     = aHdr.indexOf('dept');
    var subDeptIdx  = aHdr.indexOf('sub_dept');
    var telIdx      = aHdr.indexOf('tel');
    var emailIdx    = aHdr.indexOf('email');
    var roleIdx     = aHdr.indexOf('role');
    var permsIdx    = aHdr.indexOf('permissions');
    for (var i = 1; i < aData.length; i++) {
      if (String(aData[i][empidIdx]) === String(body.empid) &&
          String(aData[i][pwIdx])    === String(body.pw)) {
        var rawPerms = permsIdx >= 0 ? String(aData[i][permsIdx] || '') : '';
        var permArr  = [];
        try { permArr = rawPerms ? JSON.parse(rawPerms) : []; } catch(e) { permArr = []; }
        return corsOutput({ ok: true, user: {
          empid:       String(aData[i][empidIdx]),
          name:        String(aData[i][nameIdx]),
          dept:        String(aData[i][deptIdx]),
          sub_dept:    subDeptIdx  >= 0 ? String(aData[i][subDeptIdx]  || '') : '',
          pw:          String(aData[i][pwIdx]),
          tel:         telIdx      >= 0 ? String(aData[i][telIdx]      || '') : '',
          email:       emailIdx    >= 0 ? String(aData[i][emailIdx]    || '') : '',
          role:        roleIdx     >= 0 ? String(aData[i][roleIdx]     || 'viewer') : 'viewer',
          permissions: permArr
        }});
      }
    }
    return corsOutput({ ok: false, msg: 'not_found' });
  }

  // ── 계정 등록 ────────────────────────────────────────────────────────────
  if (body.action === 'register') {
    var aSheet  = getOrCreateAccountsSheet();
    var aData   = aSheet.getDataRange().getValues();
    var aHdr    = aData[0];
    var empidIdx = aHdr.indexOf('empid');
    // 중복 확인
    for (var i = 1; i < aData.length; i++) {
      if (String(aData[i][empidIdx]) === String(body.empid)) {
        return corsOutput({ ok: false, msg: 'duplicate' });
      }
    }
    // 새 계정 추가
    var newRow = new Array(aHdr.length).fill('');
    aHdr.forEach(function(h, idx) {
      if (body[h] !== undefined) newRow[idx] = body[h];
    });
    aSheet.appendRow(newRow);
    return corsOutput({ ok: true, msg: 'registered' });
  }

  // ── 계정 정보 수정 (비밀번호/연락처/이메일 또는 전체 계정 객체) ──────────
  if (body.action === 'update_account') {
    var uaSheet  = getOrCreateAccountsSheet();
    var uaData   = uaSheet.getDataRange().getValues();
    var uaHdr    = uaData[0];
    var uaEmpIdx = uaHdr.indexOf('empid');

    // ── (A) 전체 계정 객체 업데이트 (permissions, role 등) ──────────────────
    if (body.account) {
      var acct = body.account;
      var targetEmpid = String(acct.empid || body.empid || '');
      if (!targetEmpid) return corsOutput({ ok: false, msg: 'missing_empid' });
      for (var i = 1; i < uaData.length; i++) {
        if (String(uaData[i][uaEmpIdx]) === targetEmpid) {
          // 업데이트 가능한 필드들 반영
          var updatableFields = ['name','dept','sub_dept','tel','email','pw','role','permissions'];
          for (var f = 0; f < updatableFields.length; f++) {
            var fieldName = updatableFields[f];
            if (acct[fieldName] === undefined) continue;
            var colIdx = uaHdr.indexOf(fieldName);
            if (colIdx === -1) continue;
            var val = acct[fieldName];
            // permissions 배열은 JSON 문자열로 저장
            if (fieldName === 'permissions' && Array.isArray(val)) {
              val = JSON.stringify(val);
            }
            uaSheet.getRange(i + 1, colIdx + 1).setValue(val);
          }
          return corsOutput({ ok: true, msg: 'updated' });
        }
      }
      return corsOutput({ ok: false, msg: 'not_found' });
    }

    // ── (B) 개별 필드 업데이트 (기존 방식: field + value) ───────────────────
    var uaField  = body.field; // 'pw' | 'tel' | 'email'
    var uaColIdx = uaHdr.indexOf(uaField);
    if (uaColIdx === -1) return corsOutput({ ok: false, msg: 'invalid_field' });
    for (var i = 1; i < uaData.length; i++) {
      if (String(uaData[i][uaEmpIdx]) === String(body.empid)) {
        // 비밀번호 변경 시 현재 비밀번호 검증
        if (uaField === 'pw' && body.cur_pw) {
          var uaPwIdx = uaHdr.indexOf('pw');
          if (String(uaData[i][uaPwIdx]) !== String(body.cur_pw)) {
            return corsOutput({ ok: false, msg: 'wrong_pw' });
          }
        }
        uaSheet.getRange(i + 1, uaColIdx + 1).setValue(body.value || '');
        return corsOutput({ ok: true, msg: 'updated' });
      }
    }
    return corsOutput({ ok: false, msg: 'not_found' });
  }

  // ── 계정 삭제 ────────────────────────────────────────────────────────────
  if (body.action === 'delete_account') {
    var aSheet  = getOrCreateAccountsSheet();
    var aData   = aSheet.getDataRange().getValues();
    var aHdr    = aData[0];
    var empidIdx = aHdr.indexOf('empid');
    for (var i = 1; i < aData.length; i++) {
      if (String(aData[i][empidIdx]) === String(body.empid)) {
        aSheet.deleteRow(i + 1);
        return corsOutput({ ok: true, msg: 'deleted' });
      }
    }
    return corsOutput({ ok: false, msg: 'not_found' });
  }

  // ── 취소 요청 (Sales → cancel_requested) ────────────────────────────────────
  if (body.action === 'request_cancel') {
    var rcSheet   = getOrCreateSheet();
    var rcHeaders = rcSheet.getRange(1, 1, 1, rcSheet.getLastColumn()).getValues()[0];
    var rcRows    = rcSheet.getDataRange().getValues();
    var rcIdCol   = colOf(rcHeaders, 'id');
    var rcStCol   = colOf(rcHeaders, 'status');
    var rcCrCol   = colOf(rcHeaders, 'cancel_reason');
    for (var i = 1; i < rcRows.length; i++) {
      if (String(rcRows[i][rcIdCol-1]) === String(body.id)) {
        rcSheet.getRange(i+1, rcStCol).setValue('cancel_requested');
        if (rcCrCol > 0) rcSheet.getRange(i+1, rcCrCol).setValue(body.cancel_reason || '');
        break;
      }
    }
    return corsOutput({ ok: true, msg: 'cancel_requested' });
  }

  // ── 취소 요청 거부 (Office → pending 복원) ────────────────────────────────────
  if (body.action === 'reject_cancel') {
    var rjSheet   = getOrCreateSheet();
    var rjHeaders = rjSheet.getRange(1, 1, 1, rjSheet.getLastColumn()).getValues()[0];
    var rjRows    = rjSheet.getDataRange().getValues();
    var rjIdCol   = colOf(rjHeaders, 'id');
    var rjStCol   = colOf(rjHeaders, 'status');
    var rjCrCol   = colOf(rjHeaders, 'cancel_reason');
    for (var i = 1; i < rjRows.length; i++) {
      if (String(rjRows[i][rjIdCol-1]) === String(body.id)) {
        rjSheet.getRange(i+1, rjStCol).setValue('pending');
        if (rjCrCol > 0) rjSheet.getRange(i+1, rjCrCol).setValue('');
        break;
      }
    }
    return corsOutput({ ok: true, msg: 'pending' });
  }

  // ── 견적 요청 저장 ────────────────────────────────────────────────────────
  if (body.action === 'submit_quote') {
    var qSheet  = getOrCreateQuoteSheet();
    var qHdr    = qSheet.getRange(1, 1, 1, qSheet.getLastColumn()).getValues()[0];
    var qRow    = new Array(qHdr.length).fill('');
    function qset(col, val) {
      var i = qHdr.indexOf(col);
      if (i !== -1) qRow[i] = val;
    }
    var qId = 'Q' + new Date().getTime();
    qset('id',             qId);
    qset('date',           new Date().toISOString());
    qset('requested_by',   body.requested_by   || '');
    qset('customer_erp',   body.erp            || '');
    qset('customer_name',  body.customer       || '');
    qset('customer_clinic',body.clinic         || '');
    qset('items_json',     body.items          || '[]');
    qset('total',          body.total          || 0);
    qset('request_total',  body.request_total  || 0);
    qset('notes',          body.notes          || '');
    qset('status',         'pending');
    qSheet.appendRow(qRow);

    // Office 팀에게 FCM 푸시 알림 발송
    sendFCMPushToOffice_(
      '📋 견적 요청 접수',
      (body.customer || '고객') + ' — ' + (body.requested_by || '') + ' 요청'
    );

    return corsOutput({ ok: true, status: 'ok', id: qId, msg: 'quote_saved' });
  }

  // ── 견적 목록 조회 ──────────────────────────────────────────────────────────
  if (body.action === 'get_quotes') {
    var gqSheet = getOrCreateQuoteSheet();
    var gqData  = gqSheet.getDataRange().getValues();
    if (gqData.length < 2) return corsOutput({ status: 'ok', data: [] });
    var gqHdr = gqData[0];
    var quotes = [];
    for (var qi = 1; qi < gqData.length; qi++) {
      if (!gqData[qi][0]) continue;
      var qObj = {};
      for (var qj = 0; qj < gqHdr.length; qj++) {
        qObj[gqHdr[qj]] = String(gqData[qi][qj] || '');
      }
      // items_json 파싱
      try { qObj.items = JSON.parse(qObj.items_json || '[]'); } catch(eQ) { qObj.items = []; }
      // cancelled 제외
      if (qObj.status !== 'cancelled') quotes.push(qObj);
    }
    return corsOutput({ status: 'ok', data: quotes });
  }

  // ── 견적 상태 변경 (승인/취소) ──────────────────────────────────────────────
  if (body.action === 'update_quote_status') {
    var usSheet = getOrCreateQuoteSheet();
    var usData  = usSheet.getDataRange().getValues();
    var usHdr   = usData[0];
    var usIdCol = usHdr.indexOf('id') + 1;
    var usStCol = usHdr.indexOf('status') + 1;
    if (usIdCol < 1 || usStCol < 1) return corsOutput({ status: 'error', message: 'header missing' });
    for (var ui = 1; ui < usData.length; ui++) {
      if (String(usData[ui][usIdCol - 1]) === String(body.id)) {
        usSheet.getRange(ui + 1, usStCol).setValue(body.status || 'done');
        return corsOutput({ status: 'ok', msg: 'status_updated' });
      }
    }
    return corsOutput({ status: 'error', message: 'quote_not_found' });
  }

  // ── 견적 수정 (update_quote) ────────────────────────────────────────────────
  if (body.action === 'update_quote') {
    var uqSheet = getOrCreateQuoteSheet();
    var uqData  = uqSheet.getDataRange().getValues();
    var uqHdr   = uqData[0];
    var uqIdCol = uqHdr.indexOf('id') + 1;
    if (uqIdCol < 1) return corsOutput({ status: 'error', message: 'header missing' });
    for (var uqi = 1; uqi < uqData.length; uqi++) {
      if (String(uqData[uqi][uqIdCol - 1]) === String(body.id)) {
        var rowNum = uqi + 1;
        function uqset(col, val) {
          var ci = uqHdr.indexOf(col);
          if (ci !== -1) uqSheet.getRange(rowNum, ci + 1).setValue(val);
        }
        uqset('customer_erp',    body.erp      || '');
        uqset('customer_name',   body.customer || '');
        uqset('customer_clinic', body.clinic   || '');
        uqset('items_json',      body.items    || '[]');
        uqset('total',           body.total    || 0);
        uqset('request_total',   body.request_total || 0);
        uqset('notes',           body.notes    || '');
        uqset('date',            new Date().toISOString());
        return corsOutput({ status: 'ok', msg: 'quote_updated' });
      }
    }
    return corsOutput({ status: 'error', message: 'quote_not_found' });
  }

  // ── 이하 주문 관련 ────────────────────────────────────────────────────────
  var sheet   = getOrCreateSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // 주문 추가
  if (body.action === 'add') {
    var newRow = new Array(headers.length).fill('');
    function set(col, val) {
      var i = headers.indexOf(col);
      if (i !== -1) newRow[i] = val;
    }
    set('id',              body.id);
    set('date',            body.date);
    set('user',            body.user);
    set('customer_erp',    body.customer ? body.customer.erp    : '');
    set('customer_name',   body.customer ? body.customer.name   : '');
    set('customer_clinic', body.customer ? body.customer.clinic : '');
    set('address',         body.address   || '');
    set('items_json',      JSON.stringify(body.items || []));
    set('status',          'pending');
    set('ship_type',       body.ship_type || '');
    set('completed_by',    '');
    set('completed_date',  '');
    set('memo',            body.memo || '');
    sheet.appendRow(newRow);
    sendFCMPushToOffice_('📦 New Order Received', (body.customer ? body.customer.name : 'Customer') + ' — Ordered by ' + (body.user || ''));
    return corsOutput({ ok: true, msg: 'added' });
  }

  var rows      = sheet.getDataRange().getValues();
  var idCol     = colOf(headers, 'id');
  var statusCol = colOf(headers, 'status');
  var cbCol     = colOf(headers, 'completed_by');
  var cdCol     = colOf(headers, 'completed_date');

  if (body.action === 'complete') {
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol-1]) === String(body.id)) {
        sheet.getRange(i+1, statusCol).setValue('shipping');
        if (cbCol > 0) sheet.getRange(i+1, cbCol).setValue(body.completedBy   || '');
        if (cdCol > 0) sheet.getRange(i+1, cdCol).setValue(body.completedDate || '');
        break;
      }
    }
    return corsOutput({ ok: true, msg: 'shipping' });
  }

  if (body.action === 'deliver') {
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol-1]) === String(body.id)) {
        sheet.getRange(i+1, statusCol).setValue('done');
        break;
      }
    }
    return corsOutput({ ok: true, msg: 'done' });
  }

  if (body.action === 'cancel') {
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol-1]) === String(body.id)) {
        sheet.getRange(i+1, statusCol).setValue('cancelled');
        break;
      }
    }
    return corsOutput({ ok: true, msg: 'cancelled' });
  }

  if (body.action === 'update') {
    var shipTypeCol = colOf(headers, 'ship_type');
    var addrCol     = colOf(headers, 'address');
    var itemsCol    = colOf(headers, 'items_json');
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][idCol-1]) === String(body.id)) {
        if (body.ship_type !== undefined && shipTypeCol > 0)
          sheet.getRange(i+1, shipTypeCol).setValue(body.ship_type);
        if (body.address  !== undefined && addrCol     > 0)
          sheet.getRange(i+1, addrCol).setValue(body.address);
        if (body.items    !== undefined && itemsCol    > 0)
          sheet.getRange(i+1, itemsCol).setValue(JSON.stringify(body.items));
        break;
      }
    }
    return corsOutput({ ok: true, msg: 'updated' });
  }

  // ── 신규 고객 등록 (대기 상태로 저장) ────────────────────────────────────
  if (body.action === 'add_customer') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pcSheet = ss.getSheetByName('Pending_Customers');
    if (!pcSheet) {
      pcSheet = ss.insertSheet('Pending_Customers');
      pcSheet.appendRow(['id','erp','name_th','sales','type','location','tel','taxid',
        'addr_reg','addr_del','addr_del2','addr_del3','addr_del4','addr_del5',
        'cust_name','clinic','name_en','name_en2','status','reg_by','reg_at','attachments_json','remark']);
      pcSheet.getRange(1, 1, 1, 23).setFontWeight('bold');
    }
    // 첨부 파일 → Google Drive 업로드
    var attachmentsJson = '[]';
    if (body.attachments && body.attachments.length > 0) {
      try {
        var folders = DriveApp.getFoldersByName('Customer Attachments');
        var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('Customer Attachments');
        var cust = body.customer;
        var subFolder = folder.createFolder(cust.erp + '_' + cust.name_th + '_' + new Date().getTime());
        var links = [];
        body.attachments.forEach(function(att) {
          var decoded = Utilities.base64Decode(att.data);
          var blob = Utilities.newBlob(decoded, att.type || 'application/octet-stream', att.name);
          var file = subFolder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          links.push({ name: att.name, url: file.getUrl() });
        });
        attachmentsJson = JSON.stringify(links);
      } catch(e2) { /* Drive 업로드 실패 시 무시 */ }
    }
    var c = body.customer;
    var newId = 'PC_' + new Date().getTime();
    pcSheet.appendRow([newId, c.erp, c.name_th, c.sales, c.type, c.location,
      c.tel || '', c.taxid || '', c.addr_reg || '', c.addr_del || '',
      c.addr_del2 || '', c.addr_del3 || '', c.addr_del4 || '', c.addr_del5 || '',
      c.cust_name || '', c.clinic || '', c.name_en || '', c.name_en2 || '',
      'Pending', c._reg_by || '', c._reg_at || '',
      attachmentsJson, c.remark || '']);
    return corsOutput({ ok: true, msg: 'pending', id: newId });
  }

  // ── 대기 고객 승인 → Customer master 저장 ────────────────────────────────
  if (body.action === 'approve_customer') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pcSheet = ss.getSheetByName('Pending_Customers');
    if (!pcSheet) return corsOutput({ ok: false, msg: 'no_pending_sheet' });
    var masterSheet = ss.getSheetByName('Customer master');
    if (!masterSheet) return corsOutput({ ok: false, msg: 'no_master_sheet' });
    var pcData = pcSheet.getDataRange().getValues();
    var pcHdr = pcData[0];
    var idIdx = pcHdr.indexOf('id');
    for (var i = 1; i < pcData.length; i++) {
      if (String(pcData[i][idIdx]) !== String(body.id)) continue;
      function getCol(col) { return String(pcData[i][pcHdr.indexOf(col)] || ''); }
      var loc = getCol('location');
      var locParts = loc.split(', ');
      var district = locParts[0] || '';
      var province = locParts.length > 1 ? locParts[1] : locParts[0] || '';
      // Customer master: 22컬럼 (A~V)
      var masterRow = new Array(22).fill('');
      masterRow[0]  = 'Active';
      masterRow[2]  = getCol('sales');
      masterRow[6]  = getCol('erp');
      masterRow[7]  = getCol('name_th');
      masterRow[8]  = getCol('name_en');
      masterRow[9]  = getCol('addr_del') || getCol('addr_reg');
      masterRow[11] = getCol('tel');
      masterRow[12] = getCol('cust_name');
      masterRow[13] = getCol('clinic');
      masterRow[14] = getCol('name_en2');
      masterRow[15] = getCol('addr_del2');
      masterRow[18] = province;
      masterRow[19] = district;
      masterRow[20] = getCol('type');
      masterRow[21] = getCol('remark');
      masterSheet.appendRow(masterRow);
      // 대기 시트에서 승인 완료 표시
      pcSheet.getRange(i + 1, pcHdr.indexOf('status') + 1).setValue('Approved');
      return corsOutput({ ok: true, msg: 'approved', customer: {
        erp: getCol('erp'), name_th: getCol('name_th'), sales: getCol('sales'),
        cust_name: getCol('cust_name'), clinic: getCol('clinic'),
        address: getCol('addr_del') || getCol('addr_reg'),
        tel: getCol('tel'), location: loc, type: getCol('type'),
        status: 'Active', remark: getCol('remark')
      }});
    }
    return corsOutput({ ok: false, msg: 'not_found' });
  }

  // ── 대기 고객 거절 ────────────────────────────────────────────────────────
  if (body.action === 'reject_customer') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pcSheet = ss.getSheetByName('Pending_Customers');
    if (!pcSheet) return corsOutput({ ok: false, msg: 'no_pending_sheet' });
    var pcData = pcSheet.getDataRange().getValues();
    var pcHdr = pcData[0];
    var idIdx = pcHdr.indexOf('id');
    for (var i = 1; i < pcData.length; i++) {
      if (String(pcData[i][idIdx]) !== String(body.id)) continue;
      pcSheet.getRange(i + 1, pcHdr.indexOf('status') + 1).setValue('Rejected');
      if (body.reason) {
        pcSheet.getRange(i + 1, pcHdr.indexOf('remark') + 1).setValue('거절: ' + body.reason);
      }
      return corsOutput({ ok: true, msg: 'rejected' });
    }
    return corsOutput({ ok: false, msg: 'not_found' });
  }

  return corsOutput({ ok: false, msg: 'unknown action' });
}

function handleGetCustomers() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Customer master');
    if (!sheet) return corsOutput({ error: 'Customer master 시트 없음' });

    var data = sheet.getDataRange().getValues();
   if (data.length < 2) return corsOutput([]);

    var records = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var erp = String(row[6] || '').trim();
      if (!erp) continue;
      var addr1 = String(row[9] || '').trim();
      var addr2 = String(row[15] || '').trim();
      var tel1  = String(row[11] || '').trim();
      var tel2  = String(row[17] || '').trim();
      var province = String(row[18] || '').trim();
      var district = String(row[19] || '').trim();
      records.push({
        erp:       erp,
        name_th:   String(row[7]  || '').trim(),
        name_en:   String(row[8]  || '').trim(),
        cust_name: String(row[12] || '').trim(),
        clinic:    String(row[13] || '').trim(),
        name_en2:  String(row[14] || '').trim(),
        sales:     String(row[2]  || '').trim(),
        address:   addr2 || addr1,
        tel:       tel2 || tel1,
        location:  [district, province].filter(Boolean).join(', '),
        type:      String(row[20] || '').trim(),
        status:    String(row[0]  || '').trim(),
        remark:    String(row[21] || '').trim()
      });
    }
    return corsOutput(records);
  } catch(e) {
    return corsOutput({ error: e.message });
  }
}
