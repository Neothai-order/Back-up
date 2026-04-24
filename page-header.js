/* ═══════════════════════════════════════════════════════════════
   page-header.js — 하위 페이지 공용 상단 헤더 바 (시범 버전)

   사용법:
     <div id="pageTopBar"></div>
     <script src="page-header.js"></script>
     <script>
       renderPageTopBar({
         title: '페이지 제목',
         titleId: 'pageHdrTitle',           // (옵션) 기존 ID 유지용
         backTo: 'index.html',              // (옵션) 없으면 history.back()
         theme: 'gradient',                 // 'light'(기본) | 'gradient'
         background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
       });
     </script>

   반환값: { host, setTitle(t), setBackLabel(t), rightSlot }
═══════════════════════════════════════════════════════════════ */
(function(global) {
  'use strict';

  var STYLE_ID = '__page_header_style__';

  var I18N_BACK = {
    ko: '돌아가기',
    en: 'Go Back',
    th: 'กลับ'
  };

  function getLang() {
    // lang.js는 `let currentLang`으로 선언되어 window에 붙지 않음 → 직접 참조 + localStorage 폴백
    try {
      if (typeof currentLang !== 'undefined' && currentLang) return currentLang;
    } catch (e) { /* ReferenceError */ }
    try {
      var v = global.localStorage && global.localStorage.getItem('appLang');
      if (v) return v;
    } catch (e) {}
    return 'ko';
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      /* 기본(light) 테마 — attend/expense 등 흰색 바 */
      /* iOS 노치/Dynamic Island 회피: safe-area-inset-top 만큼 상단 패딩 추가 */
      '.page-top-bar{' +
        'display:flex;align-items:center;justify-content:space-between;' +
        'padding:calc(12px + env(safe-area-inset-top)) 20px 12px;' +
        'position:sticky;top:0;z-index:10000;flex-shrink:0;' +
        'background:#fff;color:#1e293b;border-bottom:1px solid #e5e7eb;' +
        'font-family:inherit;' +
      '}' +
      '.page-top-bar .pt-left{display:flex;align-items:center;gap:10px;min-width:0;}' +
      '.page-top-bar .pt-right{display:flex;align-items:center;gap:6px;}' +
      '.page-top-bar .pt-title{font-size:17px;font-weight:700;margin:0;}' +
      '.page-top-bar .pt-back{' +
        'display:inline-flex;align-items:center;gap:6px;' +
        'font-size:13px;font-weight:600;padding:6px 12px;border-radius:8px;' +
        'cursor:pointer;border:1px solid #e5e7eb;background:#f3f4f6;color:#374151;' +
        'font-family:inherit;' +
      '}' +
      '.page-top-bar .pt-back:hover{background:#e5e7eb;}' +
      /* gradient 테마 — 컬러 바 */
      '.page-top-bar.pt-theme-gradient{border-bottom:none;color:#fff;}' +
      '.page-top-bar.pt-theme-gradient .pt-title{color:#fff;}' +
      '.page-top-bar.pt-theme-gradient .pt-back{' +
        'background:rgba(255,255,255,.15);color:#fff;border:none;' +
      '}' +
      '.page-top-bar.pt-theme-gradient .pt-back:hover{background:rgba(255,255,255,.25);}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  /**
   * 상단 바 렌더링.
   * @param {Object} opts
   *   - mount: string|HTMLElement  (기본 'pageTopBar')
   *   - title: string              표시 텍스트 (escape 처리됨)
   *   - titleHtml: string          raw HTML 타이틀 (title보다 우선. data-i18n 등 사용 시)
   *   - titleId: string            (옵션) 타이틀 span에 부여할 ID (기존 호환용)
   *   - showBack: boolean          (기본 true) false면 뒤로가기 버튼 숨김
   *   - backTo: string             (옵션) 없으면 history.back()
   *   - backLabel: string          (옵션) 없으면 언어별 기본값
   *   - onBack: function           (옵션) backTo보다 우선
   *   - theme: 'light' | 'gradient'  (기본 'light')
   *   - background: string         CSS background (gradient 등)
   *   - extraClass: string         host element에 추가할 클래스 (기존 선택자 호환용)
   * @returns {{host, setTitle, setBackLabel, leftSlot, rightSlot}}
   *   leftSlot/rightSlot: 각각 .pt-left / .pt-right DOM. appendChild로 추가 버튼 삽입 가능
   */
  function renderPageTopBar(opts) {
    opts = opts || {};
    injectStyle();

    // 1) 마운트 지점 확보
    var mount = opts.mount || 'pageTopBar';
    var host = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!host) {
      host = document.createElement('div');
      host.id = (typeof mount === 'string') ? mount : 'pageTopBar';
      document.body.insertBefore(host, document.body.firstChild);
    }

    // 2) 클래스 / 인라인 배경 적용
    var theme = opts.theme || 'light';
    host.className = 'page-top-bar pt-theme-' + theme;
    if (opts.extraClass) host.classList.add(opts.extraClass);
    if (opts.background) host.style.background = opts.background;

    // 3) DOM 렌더
    var showBack = opts.showBack !== false;
    var backLabel = opts.backLabel || I18N_BACK[getLang()] || I18N_BACK.ko;
    var titleId = opts.titleId ? ' id="' + escapeHtml(opts.titleId) + '"' : '';
    var titleInner = opts.titleHtml != null ? opts.titleHtml : escapeHtml(opts.title || '');
    var backBtnHtml = showBack
      ? ('<button type="button" class="pt-back" id="__ptBackBtn">' +
           '<span aria-hidden="true">&larr;</span>' +
           '<span id="__ptBackLabel">' + escapeHtml(backLabel) + '</span>' +
         '</button>')
      : '';
    host.innerHTML =
      '<div class="pt-left">' +
        backBtnHtml +
        '<span class="pt-title"' + titleId + '>' + titleInner + '</span>' +
      '</div>' +
      '<div class="pt-right" id="__ptRightSlot"></div>';

    // 4) 뒤로가기 핸들러
    if (showBack) {
      var backBtn = host.querySelector('#__ptBackBtn');
      backBtn.addEventListener('click', function(e) {
        if (typeof opts.onBack === 'function') {
          opts.onBack(e);
          return;
        }
        if (opts.backTo) {
          global.location.href = opts.backTo;
        } else {
          global.history.back();
        }
      });
    }

    // 5) 핸들 반환
    var titleEl = host.querySelector('.pt-title');
    var labelEl = host.querySelector('#__ptBackLabel');
    var leftSlot = host.querySelector('.pt-left');
    var rightSlot = host.querySelector('#__ptRightSlot');
    return {
      host: host,
      setTitle: function(t) { if (titleEl) titleEl.textContent = t; },
      setBackLabel: function(t) { if (labelEl) labelEl.textContent = t; },
      leftSlot: leftSlot,
      rightSlot: rightSlot
    };
  }

  global.renderPageTopBar = renderPageTopBar;
})(window);
