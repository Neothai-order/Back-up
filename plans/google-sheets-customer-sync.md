# Google Sheets ↔ Firestore 고객 리스트 양방향 동기화 계획

> 작성일: 2026-04-22  
> 상태: **계획 단계** (미구현)  
> 관련 컬렉션: `customers/`

---

## 목적

앱 마스터에 있는 고객 리스트(Firestore)와 Google Sheet를 양방향으로 실시간 동기화해서, 시트에서 편집하면 앱에 반영되고 앱에서 편집하면 시트에 반영되도록 한다.

---

## 전제 조건

- 고객 수: 약 3,000명
- Firestore 컬렉션: `customers/`
- 매칭 키: `customerId` (Firestore 문서 ID)
- 고객 문서에 `updatedAt: Timestamp` 필드 필요 (없으면 추가)

---

## 아키텍처 개요

이벤트 드리븐 양방향 동기화 (Scenario C):

```
┌─────────────────┐                    ┌──────────────────┐
│  Google Sheet   │                    │     Firestore    │
│                 │                    │                  │
│  3000 rows      │                    │  customers/      │
└─────┬───────┬───┘                    └────┬─────────┬───┘
      │       │                             │         │
      │       │ ①감지: onEdit               │         │ ③감지: onWrite
      │       ▼                             │         ▼
      │  [Apps Script]                      │   [Cloud Function]
      │       │                             │         │
      │       │ ②쓰기                       │         │ ④쓰기
      │       └──────→ Firestore ───────────┘         │
      │                                               │
      └───────── Sheet ←──────────────────────────────┘
```

---

## 비용·호출 시뮬레이션 (1시간 폴링 비교용, 3000명 기준)

| 방식 | 월 Firestore 읽기 | 월 Firestore 쓰기 | 월 비용 | 지연 | 구현 시간 |
|------|------|------|------|------|-----------|
| A. 전체 풀스캔 폴링 | 2,160,000 | 1,500 | $0.40 | 최대 1h | 2h |
| B. Smart Diff 폴링 (updatedAt 쿼리) | 1,440 | 1,500 | $0 | 최대 1h | 4h |
| **C. 이벤트 드리븐 ⭐** | **1,500** | **1,500** | **$0** | **1~5초** | 6~8h |

Firestore 무료 한도: 읽기 50,000/일, 쓰기 20,000/일 → C는 무료 한도의 5% 미만 사용

---

## 구현 구성 요소

### 1. 방향 1 — Sheet → Firestore (Apps Script `onEdit`)

```javascript
function onEdit(e) {
  var row = e.range.getRow();
  var rowData = e.source.getActiveSheet()
                 .getRange(row, 1, 1, 10).getValues()[0];
  var customerId = rowData[0];
  updateFirestore(customerId, {
    name: rowData[1],
    phone: rowData[2],
    updatedAt: new Date().toISOString(),
    _source: 'sheet'  // 루프 방지 마커
  });
}
```

- Google이 자체적으로 `onEdit` 이벤트 발화
- **Installable Trigger**로 설치 필요 (단순 onEdit은 외부 API 호출 권한 없음)
- Service Account JSON으로 Firestore REST API 호출

### 2. 방향 2 — Firestore → Sheet (Cloud Function `onWrite`)

```javascript
exports.syncCustomerToSheet = functions.firestore
  .document('customers/{customerId}')
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    
    // 루프 방지: 시트에서 온 변경이면 무시
    if (after && after._source === 'sheet') return null;
    
    const config = await db.doc('config/sheet_sync').get();
    const { spreadsheetId, sheetName, active } = config.data();
    if (!active) return null;
    
    const sheets = google.sheets({version: 'v4', auth});
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${findRow(context.params.customerId)}`,
      valueInputOption: 'RAW',
      resource: { values: [[after.id, after.name, after.phone]] }
    });
  });
```

---

## 🚨 무한 루프(에코) 방지 ← 가장 중요

**문제:** 시트 수정 → Firestore 쓰기 → Cloud Function 트리거 → 시트 쓰기 → onEdit 다시 발화 → 무한 반복

**해결:** Source 마커 방식 (권장)

- Sheet→Firestore 쓸 때: `_source: 'sheet'` 필드 추가
- Firestore→Sheet 함수는 `_source === 'sheet'`면 즉시 return
- 앱에서 수정 시엔 `_source: 'app'` 설정

보조 방법:
- Lock 문서 방식 (`sync_lock/{customerId}`)
- Hash 비교 방식 (`md5(name+phone)` 비교)

실무 권장: **Source 마커 + updatedAt 타임스탬프** 조합

---

## Sheet ID 관리 (향후 변경 용이성)

### ✅ 권장: Firestore 설정 문서 방식

```
config/sheet_sync: {
  spreadsheetId: "1AbCdEf...",
  sheetName: "customers",
  active: true,
  columnMap: {
    id: "A", name: "B", phone: "C", email: "D"
  },
  lastSyncAt: Timestamp,
  version: 1
}
```

**장점:**
- 시트 URL 교체 시 Firestore Console에서 값만 변경 (30초)
- 배포 불필요, 즉시 반영
- `active: false`로 동기화 일시 중단 가능
- 앱 관리자 UI에서도 제어 가능

### 시트 교체 체크리스트

1. [ ] 새 시트에 Service Account 편집 권한 부여
2. [ ] `config/sheet_sync.spreadsheetId` 업데이트
3. [ ] 컬럼 구조 확인 (id, name, phone, ...)
4. [ ] Apps Script 트리거 재설치
5. [ ] 초기 전체 sync 1회 실행

---

## 컬럼 매핑 (초안)

| 시트 컬럼 | Firestore 필드 | 비고 |
|-----------|---------------|------|
| A | customerId | 매칭 키 (hidden 권장) |
| B | name | 고객명 |
| C | phone | 전화번호 |
| D | email | 이메일 |
| E | address | 주소 |
| F | taxId | 사업자번호 |
| G | updatedAt | ISO 문자열 |
| H | _source | `sheet` 또는 `app` |

실제 구현 시 기존 `customers/` 스키마에 맞춰 확정 필요.

---

## 구현 작업 순서 (8시간 예상)

1. **설계 확정 (30분)**
   - 컬럼 매핑 확정
   - 충돌 해결 정책 결정 (lastWriteWins 등)
   - 삭제 처리 정책 결정 (soft delete vs hard delete)

2. **Firestore 준비 (30분)**
   - 기존 `customers/` 전 문서에 `updatedAt` 필드 일괄 추가
   - `config/sheet_sync` 설정 문서 생성
   - Firestore Security Rules에 `_source` 필드 검증 추가

3. **Service Account 발급 (30분)**
   - Firebase Console → Project Settings → Service Account → 키 생성
   - 새 Google Sheet 생성 → Service Account 이메일에 편집 권한 부여

4. **Apps Script 구현 (2h)**
   - `onEdit` installable trigger 작성
   - Firestore REST API 호출 (JWT 토큰 발급 포함)
   - 디바운스 로직 (동시 편집 대비)

5. **Cloud Function 구현 (2h)**
   - `onWrite` 트리거 함수 작성
   - Sheets API 호출 (googleapis 라이브러리)
   - 에러 재시도 로직

6. **초기 마이그레이션 (1h)**
   - 기존 3000명 데이터를 시트에 일괄 export
   - 이후 양방향 sync 활성화

7. **테스트 (1.5h)**
   - 시트 편집 → 앱 반영 확인
   - 앱 편집 → 시트 반영 확인
   - 동시 편집 충돌 시나리오
   - 루프 발생 여부 모니터링

---

## 리스크 체크리스트

- [ ] **동시 편집 충돌** — 시트와 앱에서 동시에 같은 고객 수정 시 정책 정의 필요
- [ ] **Sheets API 쿼터** — 분당 300회/프로젝트 한도, 동시 다수 편집 시 debounce 필수
- [ ] **Cloud Function 콜드 스타트** — 첫 호출 1~3초 지연
- [ ] **Service Account 키 관리** — 유출 시 시트/Firestore 쓰기 권한 노출
- [ ] **시트 공유 권한** — 민감 정보(전화번호) 접근 제한 필요
- [ ] **컬럼 순서 변경 내성 없음** — 시트 컬럼 추가/순서 변경 시 코드 수정 필요

---

## 참고 링크

- [Firestore 트리거 공식 문서](https://firebase.google.com/docs/functions/firestore-events)
- [Google Sheets API Node.js 가이드](https://developers.google.com/sheets/api/quickstart/nodejs)
- [Apps Script Installable Triggers](https://developers.google.com/apps-script/guides/triggers/installable)
- [Firestore 요금](https://firebase.google.com/pricing)
