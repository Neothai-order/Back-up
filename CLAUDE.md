# NeoThai Order App — Claude 작업 지침

## 프로젝트 개요
Thai 치과 공급 영업 관리 앱. Firebase Hosting + Firestore 백엔드. React 없는 바닐라 JS SPA.

- **배포:** `firebase deploy --only hosting`
- **프로덕션 URL:** https://neothai-order.web.app
- **주요 파일:** `index.html`, `core.js`, `order.js`, `attendance.js`, `customer.js`, `lang.js`, `style.css`
- **미니파이 파일:** 각 `*.min.js`, `style.min.css` — 소스 파일 수정 시 미니파이 파일도 같이 패치 필요
- **캐시 버스팅:** `index.html`의 `?v=N` 쿼리 파라미터 bump

## 계획 문서 (`plans/` 폴더)

아래 문서는 미구현 계획안. 구현 시작할 때 먼저 읽어줘.

- [`plans/google-sheets-customer-sync.md`](./plans/google-sheets-customer-sync.md) — 고객 리스트 Google Sheets ↔ Firestore 양방향 실시간 동기화 (Apps Script + Cloud Function 이벤트 드리븐 방식)

## 작업 관례

- 소스 파일(`*.js`) 수정 시 `*.min.js`도 같이 패치
- HTML/CSS/JS 파일 수정 후 `index.html`의 관련 `?v=N` 버전 bump
- 배포 전 preview 서버(localhost:3000)에서 검증 권장
- Firestore 컬렉션: `customers/`, `orders/`, `attendance/`, `quotes/` 등

### 🚨 신규 메뉴 추가 시 필수 체크리스트

**데스크탑/모바일 메뉴 항목을 추가할 때마다 반드시 `Menu Configuration`(관리자 메뉴 설정)에도 연동해야 함.**

1. `core.js` 의 `MENU_CONFIG_ITEMS` 배열에 신규 항목의 `{key, icon, i18n}` 추가 (올바른 상위 그룹 children 안에)
2. `core.js` 의 `_applyMenuConfig()` 함수 안 `subMap` 객체에 `'<key>': { desktop: '#<ddId>', mobile: '#<mobId>' }` 추가
3. `core.min.js` 에도 동일 내용 패치 (노드 스크립트 권장)
4. 필요 시 `lang.js` / `lang.min.js` 의 ko/en/th 3개 블록에 i18n 키 추가
5. `index.html` 의 `core.min.js?v=N`, `lang.min.js?v=N` bump

연동 누락 시 관리자가 Menu Setting 에서 토글할 수 없어 특정 사용자에게만 숨기는 기능이 작동하지 않음.

## 다국어 (i18n)
- `lang.js`에 3개 언어 블록 (ko, en, th)
- 사용: `data-i18n="key"` 속성 + `t('key')` 함수
- 미니파이 파일은 `lang.min.js`
