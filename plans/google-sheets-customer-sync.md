# Google Sheets → Firestore 고객 마스터 단방향 동기화 (테스트 단계)

> 작성일: 2026-04-22 (v1 — 양방향 계획안)
> 갱신일: 2026-04-26 (v2 — 단방향 테스트 단계로 축소)
> 상태: **구현 완료 (테스트용)**, 운영 시작 전 사용자 셋업 필요
> 관련 컬렉션: `customers/`

---

## 목적 (v2)

테스트 단계: **Google Sheet (마스터)** → **Firestore** 단방향 동기화. 매 2시간마다 변경분만 가져옴.

향후 양방향 (Scenario C, 이벤트 드리븐) 으로 확장 예정 — 데이터 schema (`updatedAt`, `_lastEditor` 필드) 는 호환되게 설계해 마이그레이션 부담 최소화.

---

## 전제 조건

- 고객 수: 약 3,000명 추정
- Firestore 컬렉션: `customers/`
- 매칭 키: `customerId` (Sheet A열 = Firestore 문서 ID)
- 한국 시간 기준 매 2시간 자동 실행

---

## 아키텍처 (v2)

```
┌──────────────────┐                        ┌──────────────────┐
│  Google Sheet    │                        │     Firestore    │
│  "고객마스터"     │                        │   customers/     │
│                  │                        │                  │
│  사용자 편집 →    │                        │   _meta/         │
│  H열 updatedAt    │                        │   customer_sync  │
│  자동 갱신        │                        │   (lastSyncAt)   │
│  (Apps Script)   │                        │                  │
└────────┬─────────┘                        └────────▲─────────┘
         │                                            │
         │  Sheets API v4 (read-only)                 │
         │                                            │
         └──→ ┌────────────────────────┐ ────────────┘
              │  Cloud Function:        │
              │  scheduledCustomerSync  │
              │  every 2 hours, KST     │
              │                         │
              │  + triggerCustomerSync  │
              │   (HTTPS, 토큰 인증)    │
              └────────────────────────┘
```

---

## Sheet 구조

탭 이름: `고객마스터` (다른 이름이면 `firebase functions:config:set sheets.range="..."` 변경)

| 열 | 필드명     | 타입      | 비고                                          |
|----|-----------|-----------|-----------------------------------------------|
| A  | customerId | string   | 필수, 유일 키. 빈 행 무시                     |
| B  | name       | string   |                                               |
| C  | phone      | string   |                                               |
| D  | address    | string   |                                               |
| E  | tier       | string   | A/B/C 등                                      |
| F  | salesRep   | string   | 담당자 사번                                   |
| G  | notes      | string   | 비고                                          |
| H  | updatedAt  | datetime | **필수**, ISO 형식. Apps Script 자동 채움     |

1행은 헤더, A2 부터 데이터.

---

## Cloud Function

| Export | 종류 | 트리거 | 비고 |
|---|---|---|---|
| `scheduledCustomerSync` | scheduled | 매 2시간 (KST) | 자동 실행 |
| `triggerCustomerSync` | HTTPS | 수동 호출 | 헤더 `x-sync-token` 검증 |

리전: `asia-northeast3` (서울)
파일: [`functions/customer_sync.js`](../functions/customer_sync.js)

핵심 로직:
1. `_meta/customer_sync` 문서에서 `lastSyncAt` 읽기
2. Sheet 전체 읽기 (Sheets API)
3. 각 행: `updatedAt > lastSyncAt` 인 것만 통과 (증분)
4. customerId 로 Firestore upsert (`merge: true`)
5. `_lastEditor: "sheet"` 필드 부여 (양방향 마이그레이션 대비)
6. `_syncedAt` = serverTimestamp 부여
7. `lastSyncAt` 갱신, 통계 기록

---

## 셋업 절차 (사용자 작업)

### Step 1 — Google Sheet 만들기

1. Google Drive 에 새 Sheet 만들기 (예: 제목 "Neo Sales 고객 마스터")
2. 첫 탭 이름을 `고객마스터` 로 변경
3. 1행 헤더 입력:
   ```
   A1: customerId | B1: name | C1: phone | D1: address | E1: tier | F1: salesRep | G1: notes | H1: updatedAt
   ```
4. 테스트용 행 1~2개 입력 (예: A2 = `TEST001`, B2 = `테스트고객`, ..., H2 = `2026-04-26 10:00:00`)

### Step 2 — Apps Script 로 updatedAt 자동 채우기

Sheet 메뉴: `Extensions → Apps Script` → 아래 코드 붙여넣고 저장:

```javascript
function onEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== '고객마스터') return;
  const row = e.range.getRow();
  if (row < 2) return; // 헤더 보호
  const lastCol = 8;   // H열 (updatedAt)
  // 사용자가 직접 H열 편집했으면 무시 (무한루프 방지)
  if (e.range.getColumn() === lastCol) return;
  sh.getRange(row, lastCol).setValue(new Date().toISOString());
}
```

→ A~G 열 편집 시 H 열에 ISO 타임스탬프 자동 기록.

### Step 3 — 서비스 계정에 Sheet 읽기 권한 부여

1. [Firebase Console](https://console.firebase.google.com/) → 프로젝트 `neothai-order` → 톱니바퀴 → 프로젝트 설정 → 서비스 계정 탭
2. 기본 service account **이메일** 만 복사 (보통 `<project>@appspot.gserviceaccount.com` 형식)
3. Google Sheet 우측 상단 "공유" → 그 이메일에 **뷰어 (Viewer)** 권한 부여
   - ⚠️ 단방향 = 뷰어 권한 충분. **편집자 부여 금지.**

### Step 4 — Firebase Functions config 설정

cmd / PowerShell 에서:

```bash
firebase functions:config:set ^
  sheets.spreadsheet_id="<URL의 /d/ 다음 ID>" ^
  sheets.range="고객마스터!A2:H" ^
  sheets.trigger_token="<랜덤 32자리 비밀 문자열>"
```

- `spreadsheet_id`: Sheet URL `https://docs.google.com/spreadsheets/d/XXXXXX/edit#gid=0` 의 `XXXXXX` 부분
- `trigger_token`: 매뉴얼 트리거 인증용 비밀 토큰 (예: `openssl rand -hex 16` 출력값)

### Step 5 — 배포

```bash
cd functions
npm install
cd ..
firebase deploy --only functions:scheduledCustomerSync,functions:triggerCustomerSync
```

### Step 6 — 첫 매뉴얼 테스트

```bash
curl -H "x-sync-token: <설정한 trigger_token>" ^
     https://asia-northeast3-neothai-order.cloudfunctions.net/triggerCustomerSync
```

응답 예시:
```json
{
  "ok": true,
  "stats": {
    "totalRows": 2,
    "upserts": 2,
    "skipped": 0,
    "errors": 0,
    "durationMs": 1234
  }
}
```

검증: Firebase Console → Firestore → `customers/TEST001` 문서가 생겨 있고 `_lastEditor: "sheet"` 필드 있으면 성공.

### Step 7 — 자동 스케줄 확인

[Cloud Scheduler 콘솔](https://console.cloud.google.com/cloudscheduler) 에서 `firebase-schedule-scheduledCustomerSync-*` job 이 등록되었는지 확인.
- 다음 실행 시각이 보임
- "Force run" 버튼으로 즉시 테스트 가능

---

## 비용 추산 (3,000명, 매 2시간 = 12회/일)

| 항목 | 사용량 | 무료 한도 | 비용 |
|---|---|---|---|
| Firestore 읽기 | 12/일 (메타) | 50,000/일 | ₩0 |
| Firestore 쓰기 | 변경분만 (~10건/일 추정) | 20,000/일 | ₩0 |
| Sheets API 읽기 | 12회/일 | 60/분 | ₩0 |
| Cloud Functions 호출 | ~12+α/일 | 200만/월 | ₩0 |
| Cloud Scheduler | 1 job | 3 jobs/월 | ₩0 |

→ **무료 한도 내 운영 가능**.

---

## 보안 체크리스트

- [x] 단방향 (Sheet → Firestore) → service account 권한 = **읽기 전용**
- [x] `triggerCustomerSync` HTTPS 엔드포인트 = secret token 검증
- [x] `trigger_token` = functions config 에만 (코드/Sheet 노출 X)
- [x] Sheet 공유 = 서비스 계정에 **뷰어만**
- [ ] **사용자 작업**: Sheet "링크가 있는 모든 사용자에게 공개" **OFF** 확인
- [ ] **사용자 작업**: Sheet "다운로드/인쇄/복사 권한" **제한** 권장
- [ ] 정기 점검: Cloud Functions 로그 비정상 호출 확인

---

## 향후 확장: 양방향 (Scenario C) 마이그레이션

현재 schema 는 양방향 호환:
- `updatedAt` Timestamp ✓
- `_lastEditor` 필드 ✓ (단방향: 항상 `"sheet"` / 양방향: `"sheet"|"app"`)
- `_syncedAt` 감사용 ✓

추가로 필요한 것:
1. Firestore `onWrite` 트리거 추가 (`_lastEditor !== "sheet"` 일 때만 Sheet 에 쓰기)
2. Apps Script 가 Cloud Function 호출 (지연 0)
3. service account 권한을 **편집자** 로 격상
4. 폴링 (`scheduledCustomerSync`) 비활성화

작업량: 0.5~1일 코드 + 1~2일 테스트.

---

## 알려진 이슈 / 한계

- **Sheet 행 삭제는 Firestore 에 반영 안 됨** (단방향). 삭제는 양방향 전환 시 또는 별도 처리.
- **updatedAt 타임존** — Apps Script `new Date().toISOString()` 은 UTC. 사용자가 직접 H열 편집 시 형식 다르면 에러 로그 남음.
- **첫 실행 한 번은 모든 행 sync 됨** (lastSyncAt = null 시 전부 통과). 3,000행이면 쓰기 3,000건 발생 (1일 무료 한도 20K 안).

---

## 검증 / 롤백 계획

- 테스트 시작 전 Firestore `customers/` 컬렉션 백업 권장 (`gcloud firestore export` 또는 Console export)
- 첫 실행 후 `stats.upserts` 가 예상과 맞는지 확인
- 문제 시 `firebase functions:delete scheduledCustomerSync triggerCustomerSync` 로 즉시 비활성화
- Firestore 의 `_lastEditor: "sheet"` 필터로 sync 가 만든 문서만 식별 가능

---

## v1 (양방향 계획안) 보존

원래 계획안의 양방향 이벤트 드리븐 (Scenario C) 설계는 v2 단방향 검증 완료 후 적용 예정.
v1 의 비교 시뮬레이션, 무한루프 방지 설계 등은 향후 양방향 도입 시 참고용.
