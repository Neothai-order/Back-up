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

## 🪟 모달 / Overlay / z-index 가이드라인 (2026-04-25 신설)

**핵심 원칙 — 신규 모달 추가 시 절대 매직넘버 z-index 사용 금지. 토큰만 사용.**

### z-index 토큰 (style.css `:root` 정의)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--z-dropdown-ac` | 100 | autocomplete, select 드롭다운 |
| `--z-sticky-bar` | 500 | sticky header / toolbar |
| `--z-mobile-nav` | 1000 | 모바일 하단 네비 |
| `--z-overlay-base` | 2000 | 베이스 dim/backdrop |
| `--z-overlay-page` | 9000 | 페이지 오버레이 (order/quote/pending/delivery 등) |
| `--z-modal` | alias=9000 | **신규 모달 기본값** |
| `--z-menu-top` | 9100 | 탑 네비 드롭다운 |
| `--z-menu-sub` | 9200 | 서브메뉴 |
| `--z-mini-panel` | 9500 | mini / tracking / broadcast |
| `--z-popover` | 9700 | tooltip, hover card |
| `--z-pkg-stack` / `--z-pkg-builder` | 9900 | 패키지 빌더 (스택 위) |
| `--z-modal-stacked` | 9920 | 모달 위 모달 (1단계까지만) |
| `--z-chat` | 90000 | 채팅 팝업 |
| `--z-header` | 99000 | 고정 헤더 |
| `--z-toast` | 99500 | toast / snackbar |
| `--z-loader` | 99800 | 전역 spinner |
| `--z-alert` | 99999 | **neoAlert / neoConfirm — 항상 최상위** |
| `--z-top` | 2147483647 | 최후 수단 (Top Layer 대안). 신규 코드는 사용 X |

### ✅ 새 모달 추가 시 체크리스트

1. **z-index**: 인라인 / 매직넘버 사용 금지 → CSS class 에서 `var(--z-modal)` 사용
   ```css
   .my-new-modal { z-index: var(--z-modal); }
   ```
2. **`!important` 사용 금지** — 정말 필요하면 PR 에서 사유 명시
3. **JS 에서 `style.zIndex = ...` 또는 `setProperty('z-index', ...)` 금지** — `_bringToFront()` 가 자동 처리
4. **`position: fixed` 인 요소는 `transform`/`filter`/`will-change` 가진 부모 안에 두지 말 것** (좌표 어긋남 — schedule.js 사례 참조)
5. **flex column 안에 `overflow:auto` 자식이 있을 때**: 모든 중간 컨테이너에 `min-height: 0` 필수 (attend.html 사례 참조)
6. **모달 닫기 처리**: ESC 키, 배경 클릭, 닫기 버튼 3가지 모두 동작하게
7. **마크업 컨벤션 통일**: `.my-modal-overlay` (backdrop) + `.my-modal` (콘텐츠), 토글은 `.open` 또는 `.show` 일관 사용

### 🔄 모달 표시/숨김 패턴 (권장)

**옵션 A — 기존 패턴 유지 (대부분의 모달)**
```js
document.getElementById('myOverlay').classList.add('open');
_bringToFront(myOverlay);   // 자동 z-index 관리
_mobFullScreen(overlay, modal); // 모바일 풀스크린
```

**옵션 B — 신규 알림/dialog 류는 `<dialog>` 권장 (Top Layer)**
```html
<dialog id="myDialog">...</dialog>
```
```js
document.getElementById('myDialog').showModal();  // z-index 자체가 무관
```
- ESC 자동 닫기, focus trap 자동, `::backdrop` 으로 dim 처리
- 브라우저 호환: Chrome 37+, Safari 15.4+, Firefox 98+ → 사실상 100%

### 🚫 자주 발생하는 z-index 사고 패턴

| 잘못된 예 | 왜 나쁜가 | 올바른 예 |
|---|---|---|
| `<div style="z-index:99999">` | 인라인 → CSS 변경 불가, audit 어려움 | `<div class="my-modal">` + CSS class |
| `el.style.zIndex = '999999'` | 다른 모달과 군비경쟁 시작 | `_bringToFront(el)` 또는 토큰 사용 |
| `z-index: 9999 !important` | 다음 사람도 더 큰 !important 추가 | 토큰 사용 + 우선순위 명확히 |
| `setProperty('z-index', '...', 'important')` | inline + !important 이중 강제 | 절대 사용 금지 |

### 📝 z-index 변경 시 검증 절차

1. 패키지 빌더 + 주문 모달 + neoAlert 동시 띄워서 순서 확인
2. 채팅 팝업과 충돌 없는지
3. 드롭다운/autocomplete 가림 없는지
4. 모바일 fullscreen 모드 정상인지
5. 5명 이상 사용자에게 1주일 운영 후 신고 0건이면 OK
