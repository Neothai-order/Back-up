// ══ Core Init ══

// ── 데스크탑 기본 줌 90% 강제 적용 (CSS body{zoom:0.9} 보강) ──
// 브라우저별로 CSS zoom 속성 적용이 불안정할 수 있어, JS 로 한 번 더 확실히 반영.
// 모바일(≤1024px) 에는 force-mobile 프리뷰 이외에 별도 처리 없음.
(function(){
  function _applyDesktopZoom(){
    try {
      var w = window.innerWidth;
      // 데스크탑 뷰포트에서만 zoom 0.9 강제 적용
      if (w > 1024 && !document.body.classList.contains('force-mobile') && !document.body.classList.contains('force-tablet')) {
        document.body.style.zoom = '0.9';
      }
    } catch(e){}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _applyDesktopZoom);
  } else {
    _applyDesktopZoom();
  }
  window.addEventListener('resize', _applyDesktopZoom);
})();

// ── 전역 XSS 방지 유틸 (HTML escape) ──
// 여러 페이지에서 innerHTML 조립 시 사용자/고객/메시지 문자열을 이걸로 감싼다.
// window.escHtml 로 노출하여 order.js 의 로컬 정의와 동일 이름으로 공유.
(function(g){
  if (typeof g.escHtml === 'function') return;
  g.escHtml = function(s){
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  };
})(window);

function _hideLoginShow() {
  document.getElementById('loginOverlay').classList.remove('show');
  // 데스크톱 헤더 복원
  var _hdr = document.querySelector('.header');
  if (_hdr) _hdr.style.display = '';
  if (window._splashInterval) { clearInterval(window._splashInterval); window._splashInterval = null; }
  var sp = document.getElementById('splashLoading');
  if (sp && sp.style.display !== 'none') {
    var bar = document.getElementById('splashBar');
    var pct = document.getElementById('splashPct');
    if (bar) bar.style.width = '100%';
    if (pct) pct.textContent = '100%';
    setTimeout(function(){ sp.style.display = 'none'; }, 300);
  }
}
let DATA = []; // 구글 시트에서 동적 로드

let currentResults = [];
let currentPage = 1;
const PAGE_SIZE = 20;
let acIndex = -1;

const searchInput = document.getElementById('searchInput');
const autocompleteList = document.getElementById('autocompleteList');

if (searchInput) {
  searchInput.addEventListener('input', onInput);
  searchInput.addEventListener('keydown', onKeyDown);
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-input-wrap')) hideAutocomplete();
});

function normalize(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({length: m+1}, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function fuzzyScore(query, text) {
  if (!text) return 0;
  const q = normalize(query);
  const t = normalize(text);
  if (t.includes(q)) return 100;
  // Token-by-token
  const tokens = q.split(' ').filter(Boolean);
  const tokenScore = tokens.reduce((acc, tok) => {
    if (t.includes(tok)) return acc + (tok.length / q.length) * 80;
    return acc;
  }, 0);
  if (tokenScore > 0) return tokenScore;
  // Levenshtein fuzzy: 오타 허용 (3자 이상부터, 길이에 따라 1~3글자 오차 허용)
  if (q.length >= 3) {
    const words = t.split(' ');
    const minDist = Math.min(...words.map(w => levenshtein(q, w.substring(0, q.length + 2))));
    // 3~4자: 1글자 오차, 5~7자: 2글자 오차, 8자 이상: 3글자 오차
    const tolerance = q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3;
    if (minDist <= tolerance) {
      return Math.max(0, 50 - minDist * 12);
    }
  }
  // 부분 포함 검색: _search 필드 활용
  if (text && normalize(text).includes(q.substring(0, Math.max(3, q.length - 1)))) {
    return 20;
  }
  return 0;
}

function scoreRecord(query, rec) {
  const q = normalize(query);
  if (!q) return 0;
  // Exact ERP / NT code match
  if (normalize(rec.erp) === q) return 200;
  if (normalize(rec.erp).includes(q)) return 180;
  var ntNorm = normalize(rec.nt_code);
  var ntDigits = ntNorm.replace(/^nt/, '');
  if (ntNorm === q || ntNorm === 'nt' + q || ntDigits === q) return 195;
  if (ntNorm.includes(q) || ntDigits.includes(q)) return 175;
  // Score across searchable fields with weights
  const fields = [
    [rec.erp,      120],
    [rec.nt_code,  115],
    [rec.cust_name, 100],
    [rec.clinic,   100],
    [rec.name_en,   90],
    [rec.name_en2,  85],
    [rec.name_th,   80],
    [rec.sales,     40],
    [rec.location,  30],
    [rec._search,   25],  // GAS에서 만든 통합 검색 문자열
  ];
  let best = 0;
  for (const [val, weight] of fields) {
    const s = fuzzyScore(q, val);
    if (s > 0) best = Math.max(best, s * weight / 100);
  }
  return best;
}

let selectedSales = '';  // 현재 선택된 영업담당

function getFilteredData() {
  const statusSel = (document.getElementById('statusFilterSelect') || {}).value || '';
  var user = getCurrentUser();
  var scoped = user && _isScopedUser(user);
  // 관리자/Office 외 모든 사용자: 본인 담당 고객만 (selectedSales 무시)
  return DATA.filter(r => {
    if (scoped) {
      var salesName = (r.sales || '').trim().toLowerCase();
      var matched = false;
      // 1순위: 닉네임 정확 매칭 (가장 신뢰도 높음)
      if (user.nickname && salesName === user.nickname.trim().toLowerCase()) matched = true;
      // 2순위: empid 포함
      if (!matched && user.empid && salesName.indexOf(user.empid.toLowerCase()) > -1) matched = true;
      // 3순위: 이름 정확 매칭
      if (!matched && user.name && salesName === user.name.trim().toLowerCase()) matched = true;
      if (!matched) return false;
    } else {
      if (selectedSales && (r.sales || '').trim().toUpperCase() !== selectedSales.toUpperCase()) return false;
    }
    if (statusSel === 'active' && (r.status || '').toLowerCase() !== 'active') return false;
    if (statusSel === 'non-active' && (r.status || '').toLowerCase() === 'active') return false;
    return true;
  });
}

function populateSalesFilter() {
  const sel = document.getElementById('salesFilterSelect');
  if (!sel) return;
  const sales = [...new Set(DATA.map(r => (r.sales || '').trim()).filter(Boolean))].sort();
  var user = getCurrentUser();
  // 관리자/Office 외 모든 사용자(= Sales 포함)는 본인 닉네임으로 고정
  if (user && _isScopedUser(user)) {
    var nick = (user.nickname || '').trim();
    // 목록에서 닉네임 매칭 시도 (대소문자 무관)
    var myName = nick ? sales.find(function(s) {
      return s.trim().toLowerCase() === nick.toLowerCase();
    }) : '';
    var fixed = myName || nick;
    if (fixed) {
      sel.innerHTML = '<option value="' + escHtml(fixed) + '" selected>' + escHtml(_titleCase(fixed)) + '</option>';
      sel.value = fixed;
      sel.disabled = true;
      sel.style.opacity = '0.7';
      sel.style.cursor = 'not-allowed';
      selectedSales = fixed;
      return;
    }
    // 닉네임 정보도 없으면 선택 불가하게 막음
    sel.innerHTML = '<option value="__NONE__" selected>-</option>';
    sel.value = '__NONE__';
    sel.disabled = true;
    selectedSales = '__NONE__';
    return;
  }
  var prev = sel.value;
  sel.disabled = false;
  sel.style.opacity = '';
  sel.style.cursor = '';
  sel.innerHTML = '<option value="">' + t('sales_all') + '</option>' +
    sales.map(function(s) {
      return '<option value="' + escHtml(s) + '"' + (s === prev ? ' selected' : '') + '>' + escHtml(_titleCase(s)) + '</option>';
    }).join('');
  sel.value = prev && sales.includes(prev) ? prev : '';
  selectedSales = sel.value;
}

function selectSalesFilter(sel) {
  selectedSales = sel.value;
  doSearch();
}

function searchRecords(query) {
  const pool = getFilteredData();
  if (!query.trim()) {
    // 영업담당 필터만 적용된 경우 전체 반환
    return selectedSales ? pool : [];
  }
  const scored = pool.map(r => ({ rec: r, score: scoreRecord(query, r) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map(x => x.rec);
}

// 동일한 이름의 결과를 첫 등장 바로 다음에 그룹핑
function groupDuplicateNames(arr) {
  var seen = {};      // name -> index in result[]
  var result = [];
  var extras = {};    // name -> [duplicates]
  arr.forEach(function(r) {
    var name = (r.cust_name || r.name_th || r.name_en || '').trim();
    if (!name || seen[name] === undefined) {
      if (name) seen[name] = result.length;
      result.push(r);
    } else {
      if (!extras[name]) extras[name] = [];
      extras[name].push(r);
    }
  });
  var final = [];
  result.forEach(function(r) {
    var name = (r.cust_name || r.name_th || r.name_en || '').trim();
    final.push(r);
    if (name && extras[name]) {
      extras[name].forEach(function(dup) { final.push(dup); });
      delete extras[name];
    }
  });
  return final;
}

// 백스페이스로 빠르게 지울 때 fuzzy 검색이 매 키마다 실행되면
// input 이벤트 루프를 블로킹하여 삭제가 느려짐 → 디바운스로 해결.
// 빈 문자열은 즉시 hide, 그 외 expensive 검색은 90ms 디바운스.
var _onInputDebounce = null;
function onInput() {
  if (!searchInput || !autocompleteList) return;
  // 입력값이 비면 즉시 hide (디바운스 대기 없음)
  if (!searchInput.value.trim()) {
    if (_onInputDebounce) { clearTimeout(_onInputDebounce); _onInputDebounce = null; }
    hideAutocomplete();
    return;
  }
  if (_onInputDebounce) clearTimeout(_onInputDebounce);
  _onInputDebounce = setTimeout(_onInputRun, 90);
}
function _onInputRun() {
  _onInputDebounce = null;
  if (!searchInput || !autocompleteList) return;
  const q = searchInput.value.trim();
  if (q.length < 1) { hideAutocomplete(); return; }
  // 여유있게 가져온 후 중복 이름 그룹핑 후 최대 8개
  const rawMatches = searchRecords(q).slice(0, 15);
  const matches = groupDuplicateNames(rawMatches).slice(0, 8);
  if (matches.length === 0) { hideAutocomplete(); return; }
  acIndex = -1;
  autocompleteList.innerHTML = matches.map((r, i) => {
    const name = highlight(r.cust_name || r.name_en || r.name_th || r.erp, q);
    const loc = r.location ? `<span class="ac-location">📍 ${r.location}</span>` : '';
    const ntBadge = r.nt_code ? `<span style="font-size:10px;color:#2563eb;background:#eff6ff;padding:1px 5px;border-radius:4px;margin-left:4px;">${r.nt_code}</span>` : '';
    return `<div class="autocomplete-item" data-idx="${i}" onmousedown="selectAC(${i})">
      <span class="ac-erp">${r.erp || '-'}</span>
      <span class="ac-main">${name}${ntBadge}</span>
      ${loc}
    </div>`;
  }).join('');
  autocompleteList._matches = matches;
  autocompleteList.classList.add('show');
}

function highlight(text, query) {
  if (!text || !query) return text || '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<span class="ac-highlight">$1</span>');
}

var _cardNavIdx = -1; // 검색 결과 카드 키보드 네비게이션 인덱스

function onKeyDown(e) {
  if (!autocompleteList) return;
  var acVisible = autocompleteList.classList.contains('show');
  var items = autocompleteList.querySelectorAll('.autocomplete-item');

  if (acVisible && items.length > 0) {
    // 자동완성 목록이 열려 있을 때
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      acIndex = Math.min(acIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('active', i === acIndex));
      if (items[acIndex]) searchInput.value = autocompleteList._matches[acIndex].cust_name || autocompleteList._matches[acIndex].name_en || searchInput.value;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      acIndex = Math.max(acIndex - 1, -1);
      items.forEach((el, i) => el.classList.toggle('active', i === acIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (acIndex >= 0 && autocompleteList._matches) {
        const r = autocompleteList._matches[acIndex];
        searchInput.value = r.cust_name || r.name_en || r.erp;
      }
      hideAutocomplete();
      doSearch();
      _cardNavIdx = -1;
    } else if (e.key === 'Escape') {
      hideAutocomplete();
    }
  } else {
    // 자동완성 닫힘 → 검색 결과 카드 네비게이션 (그리드 지원)
    var cards = document.querySelectorAll('.cards-grid .card');
    if (cards.length === 0) {
      if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
      return;
    }
    // 그리드 열 수 계산
    var cols = 1;
    if (cards.length >= 2) {
      var firstTop = cards[0].getBoundingClientRect().top;
      for (var ci = 1; ci < cards.length; ci++) {
        if (Math.abs(cards[ci].getBoundingClientRect().top - firstTop) > 5) { cols = ci; break; }
      }
      if (cols === 1 && cards.length >= 2 && Math.abs(cards[1].getBoundingClientRect().top - firstTop) < 5) cols = cards.length;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (_cardNavIdx === -1) { _cardNavIdx = 0; }
      else { _cardNavIdx = Math.min(_cardNavIdx + cols, cards.length - 1); }
      _highlightCard(cards);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_cardNavIdx < cols) {
        // 최상단 행에서 위로 → 검색창으로 포커스
        _cardNavIdx = -1;
        _highlightCard(cards);
        searchInput.focus();
        searchInput.select();
      } else {
        _cardNavIdx = Math.max(_cardNavIdx - cols, 0);
        _highlightCard(cards);
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      _cardNavIdx = Math.min(_cardNavIdx + 1, cards.length - 1);
      _highlightCard(cards);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (_cardNavIdx <= 0) {
        _cardNavIdx = -1;
        _highlightCard(cards);
        searchInput.focus();
        searchInput.select();
      } else {
        _cardNavIdx = Math.max(_cardNavIdx - 1, 0);
        _highlightCard(cards);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_cardNavIdx >= 0 && cards[_cardNavIdx]) {
        cards[_cardNavIdx].click();
      } else {
        doSearch();
      }
    } else if (e.key === 'Escape') {
      _cardNavIdx = -1;
      _highlightCard(cards);
      searchInput.focus();
    }
  }
}

function _highlightCard(cards) {
  cards.forEach(function(c, i) {
    if (i === _cardNavIdx) {
      c.style.outline = '3px solid #2563eb';
      c.style.outlineOffset = '-1px';
      c.style.boxShadow = '0 0 0 4px rgba(37,99,235,0.15)';
      c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      c.style.outline = '';
      c.style.outlineOffset = '';
      c.style.boxShadow = '';
    }
  });
}

function selectAC(i) {
  if (!autocompleteList || !searchInput) return;
  const r = autocompleteList._matches[i];
  searchInput.value = r.cust_name || r.name_en || r.erp;
  hideAutocomplete();
  doSearch();
}

function hideAutocomplete() {
  if (autocompleteList) autocompleteList.classList.remove('show');
  acIndex = -1;
}

function doSearch() {
  if (!searchInput) return;
  const q = searchInput.value.trim();
  currentResults = searchRecords(q);
  currentPage = 1;
  _cardNavIdx = -1;
  renderResults();
}

function clearSearch() {
  if (searchInput) searchInput.value = '';
  const sel = document.getElementById('salesFilterSelect');
  // 영업 부서 고정 필터는 초기화하지 않음
  if (sel && !sel.disabled) {
    selectedSales = '';
    sel.value = '';
  }
  const ssel = document.getElementById('statusFilterSelect');
  if (ssel) ssel.value = '';
  currentResults = [];
  currentPage = 1;
  var ra = document.getElementById('resultsArea');
  if (ra) ra.innerHTML = '';
  hideAutocomplete();
}

function _clearSearchOld() {
  if (searchInput) searchInput.value = '';
  currentResults = [];
  currentPage = 1;
  hideAutocomplete();
  var ra = document.getElementById('resultsArea');
  if (ra) ra.innerHTML = '';
}

function typeClass(t) {
  if (!t) return 'type-general';
  const tl = t.toLowerCase();
  if (tl.includes('clinic')) return 'type-clinic';
  if (tl.includes('hospital')) return 'type-hospital';
  if (tl.includes('company') || tl.includes('corporate')) return 'type-company';
  if (tl.includes('university') || tl.includes('school')) return 'type-university';
  return 'type-general';
}

function renderResults() {
  const area = document.getElementById('resultsArea');
  if (!area) return;
  if (currentResults.length === 0) {
    area.innerHTML = `<div class="no-result"><div class="icon">&#x1F50D;</div><p>${t('no_result')}<br>${t('no_result_hint')}</p></div>`;
    return;
  }
  const total = currentResults.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = currentResults.slice(start, start + PAGE_SIZE);

  const q = searchInput.value.trim();
  const cards = pageItems.map((r, i) => {
    const displayName = r.cust_name || r.name_th || r.name_en || '-';
    const subName = r.name_en || r.name_en2 || '';
    const nameTh   = r.name_th && r.name_th !== displayName ? r.name_th : '';
    const statusCls = r.status
      ? (r.status.toLowerCase() === 'active'   ? 'status-active'
       : r.status.toLowerCase() === 'vip'      ? 'status-vip'
       : r.status.toLowerCase() === 'inactive' ? 'status-inactive' : 'status-inactive')
      : '';
    const statusBadge = r.status ? `<span class="status-badge ${statusCls}">${r.status}</span>` : '';
    return `<div class="card" onclick="_cardRipple(this,event);openModal(${start + i})" onmousedown="this.classList.add('card-pressing')" onmouseup="this.classList.remove('card-pressing')" onmouseleave="this.classList.remove('card-pressing')">
      <div class="card-top">
        <div class="card-top-left">
          ${r.nt_code ? `<span class="card-nt">${r.nt_code}</span>` : ''}
          <span class="card-erp">${r.erp || '-'}</span>
        </div>
        <div class="card-top-right">
          <span class="card-type ${typeClass(r.type)}">${r.type || 'GENERAL'}</span>
          ${statusBadge}
          ${r._new ? '<span class="card-new-badge">NEW</span>' : ''}
        </div>
      </div>
      <div class="card-name">${displayName}</div>
      ${subName && subName !== displayName ? `<div class="card-name-sub">${subName.substring(0, 50)}</div>` : ''}
      ${nameTh && nameTh !== subName ? `<div class="card-name-sub" style="font-size:12px;color:#94a3b8">${nameTh.substring(0,50)}</div>` : ''}
      <div class="card-divider"></div>
      <div class="card-info">
        ${r.clinic    ? `<div class="info-row"><span class="info-label">${t('card_clinic')}</span><span class="info-value">${r.clinic}</span></div>` : ''}
        ${r.sales     ? `<div class="info-row"><span class="info-label">${t('card_sales')}</span><span class="info-value">${_titleCase(r.sales)}</span></div>` : ''}
        ${r.tel       ? `<div class="info-row"><span class="info-label">${t('card_tel')}</span><span class="info-value tel"><a href="tel:${r.tel.replace(/[^\d+]/g,'')}">${_formatPhone(r.tel)}</a></span></div>` : ''}
        ${r.location  ? `<div class="info-row"><span class="info-label">${t('card_location')}</span><span class="info-value">${r.location}</span></div>` : ''}
        ${r._new ? `<div class="info-row"><span class="info-label">${t('card_registrar')}</span><span class="info-value" style="color:#1d4ed8">${r._reg_by || '-'}</span></div>` : ''}
        ${r._new ? `<div class="info-row"><span class="info-label">${t('card_reg_at')}</span><span class="info-value">${r._reg_at || '-'}</span></div>` : ''}
      </div>
      ${r._new ? `<button class="card-delete-btn" onclick="event.stopPropagation();deleteNewCustomer('${r.erp}')">&#x1F5D1; ${t('btn_delete')}</button>` : ''}
    </div>`;
  }).join('');

  let paginationHtml = '';
  if (totalPages > 1) {
    const pages = [];
    pages.push(`<button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&#8249;</button>`);
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {
        pages.push(`<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`);
      } else if (p === currentPage - 3 || p === currentPage + 3) {
        pages.push(`<span style="padding:7px 4px;color:#94a3b8">···</span>`);
      }
    }
    pages.push(`<button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>&#8250;</button>`);
    paginationHtml = `<div class="pagination">${pages.join('')}</div>`;
  }

  area.innerHTML = `
    <div class="results-header">
      <div class="result-count">검색 결과 <strong>${total.toLocaleString()}건</strong>${total > PAGE_SIZE ? ` (${start+1}–${Math.min(start+PAGE_SIZE, total)} 표시)` : ''}</div>
    </div>
    <div class="cards-grid">${cards}</div>
    ${paginationHtml}
  `;
}

function goPage(p) {
  const totalPages = Math.ceil(currentResults.length / PAGE_SIZE);
  if (p < 1 || p > totalPages) return;
  currentPage = p;
  renderResults();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

let _modalCustomer = null;
let _modalLastIdx = null;
function _cardRipple(cardEl, e) {
  var rect = cardEl.getBoundingClientRect();
  var size = Math.max(rect.width, rect.height);
  var x = (e.clientX - rect.left) - size / 2;
  var y = (e.clientY - rect.top)  - size / 2;
  var ripple = document.createElement('span');
  ripple.className = 'card-ripple';
  ripple.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + x + 'px;top:' + y + 'px;';
  cardEl.appendChild(ripple);
  ripple.addEventListener('animationend', function() { ripple.remove(); });
}

function openModal(idx) {
  const r = currentResults[idx];
  if (!r) return;
  _modalCustomer = r;
  _modalLastIdx = idx;

  // 주문 버튼: 'order' 권한 또는 admin 만 표시
  const _me = getCurrentUser();
  const _isAdm = _isAdmin(_me);
  const _perms = (_me && _me.permissions) || [];
  const _canOrder = _isAdm || _perms.includes('order');
  const _orderBtn = document.getElementById('modalOrderBtn');
  if (_orderBtn) {
    _orderBtn.style.display = _canOrder ? '' : 'none';
    _orderBtn.innerHTML = '&#x1F4E6; <span data-i18n="btn_order">' + t('btn_order') + '</span>';
  }
  const _editBtn = document.getElementById('modalEditBtn');
  if (_editBtn) {
    if (_isAdmin) {
      _editBtn.classList.remove('perm-hidden');
      _editBtn.style.display = '';
    } else {
      _editBtn.classList.add('perm-hidden');
      _editBtn.style.display = 'none';
    }
    _editBtn.classList.remove('editing');
  }
  const displayName = r.cust_name || r.name_th || r.name_en || '-';
  const subName = (r.name_en2 || r.name_en) && (r.name_en2 || r.name_en) !== displayName
    ? (r.name_en2 || r.name_en) : '';

  // 상태 배지 스타일
  const stCls = !r.status ? '' :
    r.status.toLowerCase() === 'active'   ? 'status-active' :
    r.status.toLowerCase() === 'vip'      ? 'status-vip'    :
    r.status.toLowerCase() === 'inactive' ? 'status-inactive' : 'status-inactive';
  const stBadge = r.status
    ? `<span class="status-badge ${stCls}">${r.status}</span>` : '';

  document.getElementById('modalHeaderInfo').innerHTML = `
    <div class="modal-header-row">
      <div class="modal-header-left">
        ${r.nt_code ? `<span class="card-nt" style="font-size:12px">${r.nt_code}</span>` : ''}
        <div class="modal-erp">${r.erp || '-'}</div>
      </div>
      <div class="modal-header-right">
        ${r.type ? `<span class="card-type ${typeClass(r.type)}" style="font-size:12px">${r.type}</span>` : ''}
        ${stBadge}
      </div>
    </div>
    <div class="modal-name">${displayName} <span class="modal-name-copy" onclick="_copyModalName(this,'${displayName.replace(/'/g,"\\'")}')" title="${t('pm_click_copy')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span></div>
    ${subName ? `<div class="modal-name-sub">${subName}</div>` : ''}
  `;
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-sections-grid">

      <div class="modal-section modal-section-inline">
        <div class="modal-section-title">${t('modal_basic_info')}</div>
        ${row(t('reg_label_clinic'), r.clinic)}
        ${row(t('modal_name_en'), r.name_en)}
        ${row(t('reg_label_sales'), _titleCase(r.sales))}
      </div>

      <div class="modal-section modal-section-inline">
        <div class="modal-section-title">${t('modal_contact_info')}</div>
        ${row(t('modal_tax_id'),     _displayTaxId(r.tax_id), !!r.tax_id && !/^0+$/.test((r.tax_id||'').replace(/[\s\-]/g,'')), (r.tax_id||'').replace(/[\s\-\D]/g,''), _dbdLookupBtn(r.tax_id))}
        ${(function(){
          var phones = _cmSplitPhones(r.tel);
          var officeHtml = phones.office ? phones.office.split(', ').map(function(n){ return '<a href="tel:' + n.replace(/[^\d+]/g,'') + '">' + n + '</a>'; }).join('<br>') : '';
          var mobileHtml = phones.mobile ? phones.mobile.split(', ').map(function(n){ return '<a href="tel:' + n.replace(/[^\d+]/g,'') + '">' + n + '</a>'; }).join('<br>') : '';
          var result = '';
          if (officeHtml) result += row(t('cm_tel_office'), officeHtml, true, phones.office);
          if (mobileHtml) result += row(t('cm_tel_mobile'), mobileHtml, true, phones.mobile);
          if (!officeHtml && !mobileHtml && r.tel) result += row(t('reg_label_tel'), '<a href="tel:' + r.tel.replace(/[^\d+]/g,'') + '">' + _formatPhone(r.tel) + '</a>', true, r.tel);
          return result;
        })()}
      </div>

      <div class="modal-section">
        <div class="modal-section-title">${t('modal_address')}</div>
        ${row(t('reg_label_location'), r.location)}
        ${r.address ? `<div class="modal-info-row"><span class="modal-info-label">${t('reg_label_addr_reg')}</span><span class="modal-info-value">${_stripCustName(r.address, r)} ${_mapIconBtn(r.address)}</span></div>` : ''}
        ${_buildExtraAddrs(r)}
      </div>


      ${r.remark ? `<div class="modal-section full-width"><div class="modal-section-title">${t('modal_remark')}</div>${row(t('modal_memo'), r.remark)}</div>` : ''}

    </div>
  `;
  _closeDbdSlide();
  var _ovl = document.getElementById('modalOverlay');
  var _alreadyOpen = _ovl.classList.contains('show');
  if (_alreadyOpen) {
    var _m = _ovl.querySelector('.modal');
    if (_m) _m.style.animation = 'none';
  }
  _ovl.classList.add('show');
  if (_alreadyOpen) {
    var _m2 = _ovl.querySelector('.modal');
    if (_m2) setTimeout(function(){ _m2.style.animation = ''; }, 50);
  }
  document.body.style.overflow = 'hidden';
  // 뒤쪽 요소 비활성화 (포커스 트랩) — 고객 마스터에서 열 때는 cmOverlay 제외
  document.querySelectorAll('body > :not(#modalOverlay):not(#modalMapSlide):not(#mapFloatBar):not(script):not(style):not(link)').forEach(function(el) {
    if (!el.closest('#modalOverlay')) {
      if (_cmModalOpen && el.id === 'cmOverlay') return;
      el.setAttribute('inert', '');
    }
  });
}

var _modalEditing = false;
function toggleModalEdit() {
  _modalEditing = !_modalEditing;
  var btn = document.getElementById('modalEditBtn');
  btn.classList.toggle('editing', _modalEditing);
  // 수정 모드 진입/해제 시 상단 버튼 토글
  var _topBtns = ['modalEditBtn','modalShipAddrBtn','modalOrderBtn'];
  if (_modalEditing) {
    _topBtns.forEach(function(id){ var el = document.getElementById(id); if(el) el.style.display = 'none'; });
    _renderModalEditMode();
  } else {
    _topBtns.forEach(function(id){ var el = document.getElementById(id); if(el) el.style.display = ''; });
    if (_modalLastIdx !== null) openModal(_modalLastIdx);
  }
}

function _renderModalEditMode() {
  var r = _modalCustomer;
  if (!r) return;
  var ef = function(id, label, val) {
    return '<div class="modal-info-row"><span class="modal-info-label">' + label + '</span><span class="modal-info-value"><input class="modal-edit-input" id="' + id + '" value="' + (val || '').replace(/"/g, '&quot;') + '" /></span></div>';
  };
  var ta = function(id, label, val) {
    return '<div class="modal-info-row"><span class="modal-info-label">' + label + '</span><span class="modal-info-value"><textarea class="modal-edit-textarea" id="' + id + '">' + (val || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea></span></div>';
  };
  // 배송 주소 전용: X 버튼으로 한번에 지우기
  var taDel = function(id, label, val) {
    return '<div class="modal-info-row"><span class="modal-info-label">' + label + '</span><span class="modal-info-value" style="position:relative;"><textarea class="modal-edit-textarea" id="' + id + '" style="padding-right:30px;">' + (val || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>' +
      '<button onclick="document.getElementById(\'' + id + '\').value=\'\';this.style.display=\'none\';" style="position:absolute;top:6px;right:6px;background:#fee2e2;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;color:#ef4444;cursor:pointer;display:' + ((val || '').trim() ? 'flex' : 'none') + ';align-items:center;justify-content:center;" title="지우기">✕</button>' +
    '</span></div>';
  };
  var sel = function(id, label, val, options) {
    var html = '<div class="modal-info-row"><span class="modal-info-label">' + label + '</span><span class="modal-info-value"><select class="modal-edit-input" id="' + id + '" style="padding:6px 10px;">';
    options.forEach(function(o) { html += '<option value="' + o + '"' + (val === o ? ' selected' : '') + '>' + o + '</option>'; });
    html += '</select></span></div>';
    return html;
  };
  var typeOpts = ['Dentist','Clinic','Hospital','Company','University','Other'];
  var statusOpts = ['Active','NOT USE','VIP','Inactive'];
  document.getElementById('modalContent').innerHTML =
    '<div class="modal-sections-grid">' +
      '<div class="modal-section">' +
        '<div class="modal-section-title">' + t('modal_basic_info') + '</div>' +
        ef('me_nt_code', 'NT Code', r.nt_code) +
        sel('me_type', t('reg_label_type'), r.type || r.cust_type || '', typeOpts) +
        sel('me_status', t('modal_status'), r.status || '', statusOpts) +
        ef('me_clinic', t('reg_label_clinic'), r.clinic) +
        ef('me_name_en', t('modal_name_en'), r.name_en) +
        ef('me_sales', t('reg_label_sales'), r.sales) +
      '</div>' +
      '<div class="modal-section">' +
        '<div class="modal-section-title">' + t('modal_contact_info') + '</div>' +
        ef('me_tax_id', t('modal_tax_id'), r.tax_id) +
        ef('me_tel', t('reg_label_tel'), r.tel) +
      '</div>' +
      '<div class="modal-section">' +
        '<div class="modal-section-title">' + t('modal_address') + '</div>' +
        ef('me_location', t('reg_label_location'), r.location) +
        ta('me_address', t('reg_label_addr_reg'), r.address) +
        taDel('me_addr_del', t('modal_addr_del_1'), r.addr_del) +
        taDel('me_addr_del2', t('modal_addr_del_2'), r.addr_del2) +
        taDel('me_addr_del3', t('modal_addr_del_3'), r.addr_del3) +
      '</div>' +
      '<div class="modal-section">' +
        '<div class="modal-section-title">' + t('modal_remark') + '</div>' +
        ta('me_remark', t('modal_memo'), r.remark) +
      '</div>' +
    '</div>' +
    '<div class="modal-edit-actions">' +
      '<button class="btn-modal-delete" onclick="deleteCustomer()">🗑 ' + t('cm_delete') + '</button>' +
      '<button class="btn-modal-cancel-edit" onclick="toggleModalEdit()">' + t('qt_cancel') + '</button>' +
      '<button class="btn-modal-save" onclick="confirmSaveModalEdit()">&#x1F4BE; ' + (t('btn_save_changes') || '변경 저장') + '</button>' +
    '</div>';
  // 주소 필드에 Google Places Autocomplete 연결
  setTimeout(function() { _attachEditPlaces(); }, 100);
}

var _pacFixInterval2 = null;
function _fixPacPositionEdit(inputEl) {
  var pacs = document.querySelectorAll('.pac-container');
  if (!pacs.length) return;
  var rect = inputEl.getBoundingClientRect();
  // pac-container 는 position:fixed (style.css) → viewport 좌표 그대로
  var topPos = rect.bottom;
  var leftPos = rect.left;
  pacs.forEach(function(pac) {
    if (pac.style.display === 'none' || !pac.childElementCount) return;
    pac.style.setProperty('position', 'fixed', 'important');
    pac.style.setProperty('top', topPos + 'px', 'important');
    pac.style.setProperty('left', leftPos + 'px', 'important');
    pac.style.setProperty('width', rect.width + 'px', 'important');
  });
}

function _attachEditPlaces() {
  if (!window.google || !google.maps || !google.maps.places) return;
  var addrIds = ['me_address', 'me_addr_del', 'me_addr_del2', 'me_addr_del3'];
  addrIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el || el._gPlacesAttached) return;
    el._gPlacesAttached = true;
    el.addEventListener('focus', function() {
      document.body.classList.add('places-input-active');
      _fixPacPositionEdit(el);
      requestAnimationFrame(function(){ _fixPacPositionEdit(el); });
      setTimeout(function(){ _fixPacPositionEdit(el); }, 50);
      if (_pacFixInterval2) clearInterval(_pacFixInterval2);
      _pacFixInterval2 = setInterval(function() { _fixPacPositionEdit(el); }, 100);
    });
    el.addEventListener('input', function(){ _fixPacPositionEdit(el); });
    el.addEventListener('blur', function() {
      setTimeout(function() {
        if (_pacFixInterval2) { clearInterval(_pacFixInterval2); _pacFixInterval2 = null; }
        document.body.classList.remove('places-input-active');
      }, 400);
    });
    var ac = new google.maps.places.Autocomplete(el, {
      types: ['establishment', 'geocode'],
      componentRestrictions: { country: 'th' },
      fields: ['formatted_address', 'name', 'address_components']
    });
    ac.addListener('place_changed', function() {
      var place = ac.getPlace();
      if (!place) return;
      var addr = place.formatted_address || '';
      var name = place.name || '';
      var fullAddr = addr;
      if (name && addr && !addr.startsWith(name)) fullAddr = name + ', ' + addr;
      else if (!addr && name) fullAddr = name;
      el.value = fullAddr;
      // 지역(location) 자동 채우기
      if (place.address_components) {
        place.address_components.forEach(function(c) {
          if (c.types.indexOf('administrative_area_level_1') !== -1) {
            var locEl = document.getElementById('me_location');
            if (locEl && !locEl.value) locEl.value = c.long_name;
          }
        });
      }
      // X 버튼 표시
      var xBtn = el.parentElement.querySelector('button');
      if (xBtn) xBtn.style.display = 'flex';
    });
  });
}

// ── 고객 변경 로그 (이메일 리포트용) ──
function _logCustomerChange(type, erp, name, clinic, summary, details) {
  try {
    var user = getCurrentUser();
    var changedBy = user ? (user.empid + ' (' + (user.nickname || user.name || '') + ')') : 'unknown';
    _fbDb.collection('customerChangelog').add({
      type: type,
      erp: erp || '',
      name: name || '',
      clinic: clinic || '',
      summary: summary || '',
      details: details || null,
      changedBy: changedBy,
      changedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e) { console.warn('[changelog]', e); }
}

function confirmSaveModalEdit() {
  if (!confirm(t('msg_confirm_save') || '저장하시겠습니까?')) return;
  saveModalEdit();
}

async function saveModalEdit() {
  var r = _modalCustomer;
  if (!r || !r.erp) return;
  var me = getCurrentUser();
  var meId = me ? (me.nickname || me.empid) : 'unknown';
  var now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  // ── Tax ID 검증 (입력 시 13자리 숫자 필수) ──
  var _rawTaxId = document.getElementById('me_tax_id').value.trim();
  if (_rawTaxId) {
    var _taxDigits = _rawTaxId.replace(/[\s\-\D]/g, '');
    if (_taxDigits.length !== 13) {
      var _taxEl = document.getElementById('me_tax_id');
      if (_taxEl) { _taxEl.style.border = '2px solid #ef4444'; _taxEl.focus(); }
      showToast('⚠️ ' + (t('reg_taxid_invalid') || 'Tax ID는 숫자 13자리여야 합니다.'));
      return;
    }
  }

  var newDel2 = document.getElementById('me_addr_del2').value.trim();
  var newDel3 = document.getElementById('me_addr_del3').value.trim();
  var updates = {
    nt_code:   document.getElementById('me_nt_code').value.trim(),
    type:      document.getElementById('me_type').value,
    cust_type: document.getElementById('me_type').value,
    status:    document.getElementById('me_status').value,
    clinic:    document.getElementById('me_clinic').value.trim(),
    name_en:   document.getElementById('me_name_en').value.trim(),
    sales:     document.getElementById('me_sales').value.trim(),
    tax_id:    document.getElementById('me_tax_id').value.trim(),
    tel:       document.getElementById('me_tel').value.trim(),
    location:  document.getElementById('me_location').value.trim(),
    address:   document.getElementById('me_address').value.trim(),
    addr_del:  document.getElementById('me_addr_del').value.trim(),
    addr_del2: newDel2,
    addr_del3: newDel3,
    remark:    document.getElementById('me_remark').value.trim(),
    addr_modified_by: meId,
    addr_modified_at: now
  };
  var newDel = document.getElementById('me_addr_del').value.trim();
  if (newDel !== (r.addr_del || '')) { updates.addr_del_by = meId; updates.addr_del_at = now; }
  if (newDel2 !== (r.addr_del2 || '')) { updates.addr_del2_by = meId; updates.addr_del2_at = now; }
  if (newDel3 !== (r.addr_del3 || '')) { updates.addr_del3_by = meId; updates.addr_del3_at = now; }
  // 증분 동기화용 서버 타임스탬프
  updates.updated_at = firebase.firestore.FieldValue.serverTimestamp();
  try {
    await _fbDb.collection('customers').doc(r.erp).update(updates);
    // 변경 로그 기록
    var changedFields = [];
    ['nt_code','type','status','clinic','name_en','sales','tax_id','tel','location','address','addr_del','addr_del2','addr_del3','remark'].forEach(function(k) {
      if (String(updates[k] || '') !== String(r[k] || '')) changedFields.push(k);
    });
    if (changedFields.length) _logCustomerChange('updated', r.erp, r.name_th || r.cust_name, r.clinic, changedFields.join(', ') + ' 변경');
    // 로컬 DATA 업데이트
    Object.keys(updates).forEach(function(k) { r[k] = updates[k]; });
    for (var i = 0; i < DATA.length; i++) {
      if (DATA[i].erp === r.erp) { Object.assign(DATA[i], updates); break; }
    }
    _custPersistCache();
    _modalEditing = false;
    document.getElementById('modalEditBtn').classList.remove('editing');
    ['modalEditBtn','modalShipAddrBtn','modalOrderBtn'].forEach(function(id){ var el = document.getElementById(id); if(el) el.style.display = ''; });
    openModal(_modalLastIdx);
    // 주문 입력 화면에서 편집한 경우, 선택된 고객 카드도 갱신
    if (orderCustomer && orderCustomer.erp === r.erp) {
      Object.assign(orderCustomer, updates);
      document.getElementById('cscName').textContent = orderCustomer.name_th || orderCustomer.cust_name || orderCustomer.name_en || '';
      document.getElementById('cscClinic').textContent = orderCustomer.name_en || '';
      renderAddrButtons();
    }
    showToast('✅ ' + (t('ship_addr_saved_ok') || '저장되었습니다.'));
  } catch(e) {
    console.error('고객 정보 수정 실패:', e);
    showToast(t('process_failed') + ' ' + t('network_error'));
  }
}

async function deleteCustomer() {
  var r = _modalCustomer;
  if (!r || !r.erp) return;
  if (!confirm(t('cm_delete_confirm'))) return;
  try {
    // ── 증분 동기화용 Tombstone: 삭제 전 customer_deletions 에 기록 ──
    // 다른 사용자의 캐시에서도 이 문서가 제거되도록 delta 쿼리 대상이 됨.
    var _me = getCurrentUser();
    var _meId = _me ? (_me.nickname || _me.empid) : 'unknown';
    var _FV = firebase.firestore.FieldValue;
    var batch = _fbDb.batch();
    batch.delete(_fbDb.collection('customers').doc(r.erp));
    batch.set(_fbDb.collection('customer_deletions').doc(r.erp), {
      erp: r.erp,
      nt_code: r.nt_code || '',
      name_th: r.name_th || r.cust_name || '',
      clinic: r.clinic || '',
      sales: r.sales || '',
      deleted_by: _meId,
      deleted_at: _FV.serverTimestamp()
    });
    await batch.commit();
    _logCustomerChange('deleted', r.erp, r.name_th || r.cust_name, r.clinic, '고객 삭제');
    // 로컬 DATA에서 제거
    for (var i = 0; i < DATA.length; i++) {
      if (DATA[i].erp === r.erp) { DATA.splice(i, 1); break; }
    }
    _custPersistCache();
    _modalEditing = false;
    closeModalDirect();
    if (typeof renderTable === 'function') renderTable();
    showToast('🗑 ' + t('cm_deleted_ok'));
  } catch(e) {
    console.error('고객 삭제 실패:', e);
    showToast(t('process_failed') + ' ' + t('network_error'));
  }
}

function row(label, value, copyable, copyVal, suffix) {
  if (!value) return '';
  var copyHtml = copyable ? `<span class="modal-name-copy" onclick="_copyModalField(this,'${(copyVal || value).replace(/'/g, "\\'").replace(/<[^>]*>/g,'')}')" title="${t('pm_click_copy')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>` : '';
  return `<div class="modal-info-row">
    <span class="modal-info-label">${label}</span>
    <span class="modal-info-value">${value} ${copyHtml}${suffix || ''}</span>
  </div>`;
}

function _buildExtraAddrs(r) {
  var extras = [];
  if (r.addr_del && r.addr_del !== r.address) extras.push({ label: t('modal_addr_del_1'), val: r.addr_del, by: r.addr_del_by, at: r.addr_del_at, field: 'addr_del' });
  if (r.addr_del2) extras.push({ label: t('modal_addr_del_2'), val: r.addr_del2, by: r.addr_del2_by, at: r.addr_del2_at, field: 'addr_del2' });
  if (r.addr_del3) extras.push({ label: t('modal_addr_del_3'), val: r.addr_del3, by: r.addr_del3_by, at: r.addr_del3_at, field: 'addr_del3' });
  if (!extras.length) return '';
  var count = extras.length;
  var _me2 = getCurrentUser();
  var _isAdm2 = _isAdmin(_me2);
  var rows = extras.map(function(e) {
    var meta = (e.by || e.at) ? '<div class="extra-addr-meta">' + (e.by ? e.by : '') + (e.at ? ' · ' + e.at : '') + '</div>' : '';
    var actions = (e.field && _isAdm2) ? '<span class="extra-addr-label-actions">' +
      '<button class="extra-addr-btn" onclick="editExtraAddr(\'' + e.field + '\')" title="' + t('ann_edit') + '">&#x270E;</button>' +
      '<button class="extra-addr-btn extra-addr-btn-del" onclick="deleteExtraAddr(\'' + e.field + '\')" title="' + t('ann_delete') + '">&#x2715;</button>' +
      '</span>' : '';
    return '<div class="modal-info-row"><span class="modal-info-label">' + e.label + actions + '</span><span class="modal-info-value">' + _stripCustName(e.val, r) + ' ' + _mapIconBtn(e.val) + meta + '</span></div>';
  }).join('');
  return '<div class="extra-addr-toggle" onclick="_toggleExtraAddrs(this)">' +
    '<span class="extra-addr-label">' + t('extra_addr_count').replace('{n}', count) + '</span>' +
    '<span class="extra-addr-arrow">&#x25BC;</span>' +
  '</div>' +
  '<div class="extra-addr-body" style="display:none;">' + rows + '</div>';
}

function _toggleExtraAddrs(el) {
  var body = el.nextElementSibling;
  var arrow = el.querySelector('.extra-addr-arrow');
  var isOpen = body.classList.contains('open');

  if (!isOpen) {
    arrow.innerHTML = '&#x25B2;';
    el.classList.add('open');
    body.style.display = '';
    body.style.maxHeight = body.scrollHeight + 'px';
    body.classList.add('open');
    setTimeout(function(){ body.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 320);
  } else {
    arrow.innerHTML = '&#x25BC;';
    el.classList.remove('open');
    body.style.maxHeight = '0';
    body.classList.remove('open');
    setTimeout(function(){ body.style.display = 'none'; }, 300);
  }
}

function editExtraAddr(field) {
  if (!_modalCustomer) return;
  var current = _modalCustomer[field] || '';
  var newVal = prompt(t('ann_edit') + ' - ' + (field === 'addr_del2' ? t('modal_addr_del_2') : t('modal_addr_del_3')), current);
  if (newVal === null || newVal.trim() === current) return;
  var me = getCurrentUser();
  var meId = me ? (me.nickname || me.empid) : 'unknown';
  var now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  var upd = {};
  upd[field] = newVal.trim();
  upd[field + '_by'] = meId;
  upd[field + '_at'] = now;
  upd.updated_at = firebase.firestore.FieldValue.serverTimestamp();
  _fbDb.collection('customers').doc(_modalCustomer.erp).update(upd).then(function() {
    _logCustomerChange('updated', _modalCustomer.erp, _modalCustomer.name_th || _modalCustomer.cust_name, _modalCustomer.clinic, field + ' 주소 수정');
    Object.keys(upd).forEach(function(k) { _modalCustomer[k] = upd[k]; });
    for (var i = 0; i < DATA.length; i++) {
      if (DATA[i].erp === _modalCustomer.erp) { Object.assign(DATA[i], upd); break; }
    }
    _custPersistCache();
    if (_modalLastIdx !== null) openModal(_modalLastIdx);
    showToast('✅ ' + t('ann_updated'));
  }).catch(function(e) { showToast(t('process_failed')); });
}

function deleteExtraAddr(field) {
  if (!_modalCustomer) return;
  if (!confirm(t('ann_del_confirm'))) return;
  var me = getCurrentUser();
  var meId = me ? (me.nickname || me.empid) : 'unknown';
  var now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  var upd = {};
  upd[field] = '';
  upd[field + '_by'] = '';
  upd[field + '_at'] = '';
  upd.addr_modified_by = meId;
  upd.addr_modified_at = now;
  upd.updated_at = firebase.firestore.FieldValue.serverTimestamp();
  _fbDb.collection('customers').doc(_modalCustomer.erp).update(upd).then(function() {
    _logCustomerChange('updated', _modalCustomer.erp, _modalCustomer.name_th || _modalCustomer.cust_name, _modalCustomer.clinic, field + ' 주소 삭제');
    Object.keys(upd).forEach(function(k) { _modalCustomer[k] = upd[k]; });
    for (var i = 0; i < DATA.length; i++) {
      if (DATA[i].erp === _modalCustomer.erp) { Object.assign(DATA[i], upd); break; }
    }
    _custPersistCache();
    if (_modalLastIdx !== null) openModal(_modalLastIdx);
    showToast('✅ ' + t('ann_deleted'));
  }).catch(function(e) { showToast(t('process_failed')); });
}

// ── 지도 아이콘 + 슬라이드 맵 패널 ──────────────────────────────────────────
var _mapIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="26" height="26"><rect rx="8" width="48" height="48" fill="#f5f0e8"/><path d="M8 38l12-4 8 4 12-6V10l-12 6-8-4-12 4z" fill="none"/><path d="M8 38l12-4V10L8 14z" fill="#FBBC04"/><path d="M20 34l8 4V14l-8-4z" fill="#34A853"/><path d="M28 38l12-6V10l-12 6z" fill="#4285F4"/><path d="M24 11c-3.3 0-6 2.7-6 6 0 4.5 6 10 6 10s6-5.5 6-10c0-3.3-2.7-6-6-6z" fill="#EA4335"/><circle cx="24" cy="17" r="2.2" fill="#fff"/></svg>';

function _formatPhone(raw) {
  if (!raw) return '';
  // strip leading/trailing commas and whitespace
  raw = raw.replace(/^[\s,]+|[\s,]+$/g, '');
  if (!raw) return '';
  // split multiple numbers by comma, format each, rejoin
  return raw.split(',').map(function(part) {
    var s = part.replace(/[^\d]/g, '');
    if (!s) return '';
    // prefix 98-starting 9-digit numbers with 0 to make 098-XXX-XXXX
    if (s.length === 9 && s.slice(0,2) === '98') s = '0' + s;
    // 02-XXX-XXXX (Bangkok landline, 9 digits starting with 02)
    if (s.length === 9 && s.slice(0,2) === '02') return s.slice(0,2) + '-' + s.slice(2,5) + '-' + s.slice(5);
    // 0XX-XXX-XXXX (mobile/provincial, 10 digits starting with 0)
    if (s.length === 10 && s[0] === '0') return s.slice(0,3) + '-' + s.slice(3,6) + '-' + s.slice(6);
    // 8-digit local (no area code)
    if (s.length === 8) return s.slice(0,4) + '-' + s.slice(4);
    // already has dashes or other length — return cleaned with original dashes
    var d = part.replace(/^[\s,]+|[\s,]+$/g, '').replace(/,+$/g, '');
    return d;
  }).filter(Boolean).join(' , ');
}

function _displayTaxId(taxId) {
  if (!taxId) return '';
  var cleaned = taxId.replace(/[\s\-]/g, '');
  if (/^0+$/.test(cleaned)) return '<span style="color:#9ca3af;font-style:italic;">' + t('modal_tax_id_unregistered') + '</span>';
  var digits = cleaned.replace(/\D/g, '');
  if (digits.length === 13) {
    return digits[0] + ' ' + digits.slice(1,5) + ' ' + digits.slice(5,10) + ' ' + digits.slice(10,12) + ' ' + digits[12];
  }
  return escHtml(taxId);
}

function _dbdLookupBtn(taxId) {
  if (!taxId) return '';
  var digits = (taxId || '').replace(/[\s\-\D]/g, '');
  if (digits.length !== 13 || /^0+$/.test(digits) || !digits.startsWith('01')) return '';
  return ' <button onclick="event.stopPropagation();_quickDbdLookup(\'' + digits + '\')" style="padding:3px 10px;border:1px solid #99f6e4;border-radius:6px;background:#f0fdfa;color:#0e7490;font-size:14px;font-weight:600;cursor:pointer;vertical-align:middle;margin-left:6px;" title="DBD Lookup">DBD</button>';
}

async function _quickDbdLookup(id) {
  // 모바일: 기존 오버레이 방식
  if (window.innerWidth <= 768) {
    document.getElementById('dbdRegNoInput').value = id;
    openDbdSearch();
    searchDbdCompany();
    return;
  }
  var panel = document.getElementById('modalDbdPanel');
  var body = document.getElementById('modalDbdBody');
  var modal = document.getElementById('modal');
  if (!panel || !body) return;
  body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;font-size:14px;">🔎 Searching DBD...</div>';
  panel.classList.add('open');
  if (modal) modal.classList.add('dbd-expanded');
  try {
    var resp = await fetch('https://us-central1-neothai-order.cloudfunctions.net/dbdLookup?id=' + id);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    if (!data.found) {
      body.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;">🏢 No data found<br><a href="https://datawarehouse.dbd.go.th/search?q=' + id + '" target="_blank" style="color:#0e7490;font-size:12px;">Search on DBD Website ↗</a></div>';
      return;
    }
    var d = data.data;
    var cap = d.capital ? Number(d.capital).toLocaleString() + ' \u0E3F' : 'N/A';
    var regDt = d.regDate && d.regDate.length === 8 ? d.regDate.substring(0,4)+'-'+d.regDate.substring(4,6)+'-'+d.regDate.substring(6,8) : d.regDate || '';
    var html = '<div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:14px 16px;">';
    html += '<div style="font-size:10px;color:#93c5fd;font-weight:600;letter-spacing:0.1em;margin-bottom:3px;">DBD COMPANY DETAIL</div>';
    html += '<div style="color:#fff;font-weight:700;font-size:14px;line-height:1.4;">' + (d.nameTh || '-') + '</div>';
    html += '</div>';
    var rows = [
      ['\uD83D\uDCCB', t('cis_dbd_jurid'), d.regNo],
      ['\uD83C\uDFE2', t('dbd_name_th'), d.nameTh],
      ['\uD83C\uDFE2', t('dbd_name_en'), d.nameEn],
      ['\uD83D\uDCCC', t('cis_dbd_type'), d.type],
      ['\uD83D\uDFE2', t('dbd_status'), d.status],
      ['\uD83D\uDCB0', t('cis_dbd_capital'), cap],
      ['\uD83D\uDCC5', t('cis_dbd_regdate'), regDt],
      ['\uD83C\uDFE0', t('dbd_branch'), d.branch],
      ['\uD83D\uDCDD', t('cis_dbd_objective'), d.objective],
      ['\uD83D\uDCCD', t('dbd_province'), d.province],
      ['\uD83D\uDDFA\uFE0F', t('dbd_district'), (d.subdistrict ? d.subdistrict + ', ' : '') + (d.district || '')],
      ['\uD83C\uDFE0', t('cis_dbd_addr'), d.address]
    ];
    rows.forEach(function(r) {
      if (!r[2]) return;
      html += '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 16px;border-bottom:1px solid #f1f5f9;">';
      html += '<span style="font-size:16px;flex-shrink:0;margin-top:1px;">' + r[0] + '</span>';
      html += '<div style="min-width:0;"><div style="font-size:11px;color:#6b7280;font-weight:600;">' + r[1] + '</div>';
      html += '<div style="font-size:13px;color:#1e293b;font-weight:500;word-break:break-word;">' + r[2] + '</div></div></div>';
    });
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<div style="padding:20px;text-align:center;color:#dc2626;">⚠️ ' + err.message + '</div>';
  }
}

function _closeDbdSlide() {
  var panel = document.getElementById('modalDbdPanel');
  var modal = document.getElementById('modal');
  if (panel) panel.classList.remove('open');
  if (modal) modal.classList.remove('dbd-expanded');
}

function _stripCustName(addr, r) {
  if (!addr) return '';
  var names = [r.cust_name, r.name_th, r.clinic].filter(Boolean);
  var result = addr;
  names.forEach(function(n) {
    if (n && result.indexOf(n) === 0) {
      result = result.substring(n.length).replace(/^[\s,]+/, '');
    }
  });
  return result;
}

function _mapIconBtn(addr) {
  var safe = addr.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  return '<button onclick="openMapSlide(\'' + safe + '\')" style="background:none;border:none;cursor:pointer;padding:2px;vertical-align:middle;display:inline-flex;" title="' + t('modal_map_link') + '">' + _mapIconSvg + '</button>';
}

var _mapFloatBound = false;
function openMapSlide(addr) {
  var panel = document.getElementById('modalMapSlide');
  var iframe = document.getElementById('modalMapIframe');
  var addrEl = document.getElementById('modalMapAddr');
  var floatBar = document.getElementById('mapFloatBar');
  if (!panel || !iframe) return;
  iframe.src = 'https://www.google.com/maps/embed/v1/place?key=' + GMAPS_KEY + '&q=' + encodeURIComponent(addr) + '&zoom=15';
  if (addrEl) addrEl.textContent = addr;
  // inert 해제 (모달 포커스트랩에서 비활성화된 경우)
  panel.removeAttribute('inert');
  if (floatBar) floatBar.removeAttribute('inert');
  panel.classList.add('open');
  setTimeout(function() { panel.style.zIndex = 'var(--z-alert)'; }, 0);
  if (floatBar) floatBar.classList.add('show');
  var overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.classList.add('map-open');
  // 플로팅 버튼 이벤트 등록 (최초 1회)
  if (!_mapFloatBound) {
    _mapFloatBound = true;
    var closeBtn = document.getElementById('mapFloatClose');
    var openBtn = document.getElementById('mapFloatOpen');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() { closeMapSlide(); });
      closeBtn.addEventListener('touchend', function(e) { e.preventDefault(); closeMapSlide(); });
    }
    if (openBtn) {
      openBtn.addEventListener('click', function() {
        var a = document.getElementById('modalMapAddr');
        if (a) window.open('https://www.google.com/maps/search/' + encodeURIComponent(a.textContent), '_blank');
      });
      openBtn.addEventListener('touchend', function(e) {
        e.preventDefault();
        var a = document.getElementById('modalMapAddr');
        if (a) window.open('https://www.google.com/maps/search/' + encodeURIComponent(a.textContent), '_blank');
      });
    }
  }
}

function closeMapSlide() {
  var panel = document.getElementById('modalMapSlide');
  if (panel) {
    panel.classList.remove('open');
    panel.style.zIndex = '';
  }
  var floatBar = document.getElementById('mapFloatBar');
  if (floatBar) floatBar.classList.remove('show');
  var overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.classList.remove('map-open');
  setTimeout(function() {
    var iframe = document.getElementById('modalMapIframe');
    if (iframe) iframe.src = 'about:blank';
  }, 350);
}

function closeModal(e) {
  // 지도 슬라이드가 열려있으면 오버레이 클릭 완전 무시 (✕ 버튼으로만 닫기)
  var mapSlide = document.getElementById('modalMapSlide');
  if (mapSlide && mapSlide.classList.contains('open')) return;
  // 지도 패널 내부 클릭이면 무시
  if (mapSlide && mapSlide.contains(e.target)) return;
  if (e.target === document.getElementById('modalOverlay')) closeModalDirect();
}

function closeModalDirect() {
  playCloseSound();
  closeMapSlide();
  _closeDbdSlide();
  var overlay = document.getElementById('modalOverlay');
  var modal   = overlay ? overlay.querySelector('.modal') : null;
  if (modal) {
    modal.classList.add('closing');
    overlay.style.opacity = '0';
    setTimeout(function() {
      overlay.classList.remove('show');
      overlay.style.opacity = '';
      if (modal) modal.classList.remove('closing');
    }, 200);
  } else {
    overlay.classList.remove('show');
  }
  document.body.style.overflow = '';
  // 뒤쪽 요소 다시 활성화
  document.querySelectorAll('[inert]').forEach(function(el) { el.removeAttribute('inert'); });
  // 고객 마스터에서 열었던 경우 z-index 복원
  if (_cmModalOpen) {
    _cmModalOpen = false;
    var ov = document.getElementById('modalOverlay');
    if (ov) ov.style.zIndex = '';
  }
}



function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById('copiedToast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  });
}

// Initial state
document.getElementById('resultsArea').innerHTML = `
  <div class="no-result">
    <div class="icon">&#x1F4CB;</div>
    <p>위 검색창에 ERP 코드, 고객명, 클리닉명 등을<br>입력하여 고객을 검색하세요.</p>
  </div>`;


// ══════════════════════════════════════════════════════
// 계정 시스템
// ══════════════════════════════════════════════════════
// ── 로컬(localStorage) 계정 헬퍼 (하위 호환 / 오프라인 폴백) ──────────────
// 민감 필드(pw, pw_hash) 는 절대 localStorage 에 저장하지 않는다. 저장 전 strip.
function _stripSensitive(u) {
  if (!u || typeof u !== 'object') return u;
  var c = Object.assign({}, u);
  delete c.pw; delete c.pw_hash; delete c.password;
  return c;
}
function getLocalAccounts() {
  var raw = JSON.parse(localStorage.getItem('emp_accounts') || '[]');
  // 과거 버전에서 저장된 평문 비번 즉시 제거
  var cleaned = raw.map(_stripSensitive);
  if (JSON.stringify(cleaned) !== JSON.stringify(raw)) {
    localStorage.setItem('emp_accounts', JSON.stringify(cleaned));
  }
  return cleaned;
}
function saveLocalAccount(u) {
  var safe = _stripSensitive(u);
  var arr = JSON.parse(localStorage.getItem('emp_accounts') || '[]').map(_stripSensitive);
  var idx = arr.findIndex(function(a){ return a.empid === safe.empid; });
  if (idx === -1) arr.push(safe);
  else arr[idx] = Object.assign(arr[idx], safe);
  localStorage.setItem('emp_accounts', JSON.stringify(arr));
}
function removeLocalAccount(empid) {
  var arr = getLocalAccounts().filter(function(a){ return a.empid !== empid; });
  localStorage.setItem('emp_accounts', JSON.stringify(arr));
}

// ── 클라우드 계정 API (Firestore) ────────────────────────────────────────────
// accounts 컬렉션은 변경 빈도가 낮아 5분 메모리 캐시로 읽기 수 감소 (hit 시 0 reads)
var _accountsCache = null;
var _accountsCacheTs = 0;
var _accountsCachePromise = null;
var _ACCOUNTS_TTL_MS = 5 * 60 * 1000;  // 5분
function invalidateAccountsCache() {
  _accountsCache = null;
  _accountsCacheTs = 0;
  _accountsCachePromise = null;
}
function apiGetAccounts(opts) {
  var force = opts && opts.force;
  var now = Date.now();
  if (!force && _accountsCache && (now - _accountsCacheTs < _ACCOUNTS_TTL_MS)) {
    return Promise.resolve({ ok: true, accounts: _accountsCache, cached: true });
  }
  if (!force && _accountsCachePromise) return _accountsCachePromise;  // 병렬 중복 호출 병합
  _accountsCachePromise = _fbDb.collection('accounts').get().then(function(snap) {
    var accounts = snap.docs.map(function(d) {
      var data = d.data() || {};
      // 문서 ID 를 empid 폴백으로 보장 — 일부 계정 문서에 empid 필드가 누락되어도
      // find(a => a.empid === peerEmpid) 조회가 성공하도록 한다.
      if (!data.empid) data.empid = d.id;
      return data;
    });
    _accountsCache = accounts;
    _accountsCacheTs = Date.now();
    _accountsCachePromise = null;
    return { ok: true, accounts: accounts };
  }).catch(function(e) {
    _accountsCachePromise = null;
    throw e;
  });
  return _accountsCachePromise;
}
// 계정 추가/수정/삭제 시 캐시 무효화 훅
window.invalidateAccountsCache = invalidateAccountsCache;

function getCurrentUser() {
  var u = JSON.parse(sessionStorage.getItem('current_user') || 'null');
  // sessionStorage는 탭 범위 메모리 — pw 는 setCurrentUser 가 의도적으로 보관.
  // Firebase Auth 세션 만료 시 자동 재로그인에 필요하므로 여기서 제거하지 않는다.
  if (u) return u;
  // 자동 로그인이 켜져 있으면 localStorage 영구 세션에서 복원
  if (localStorage.getItem('auto_login') === 'true') {
    var raw = JSON.parse(localStorage.getItem('current_user_persist') || 'null');
    if (!raw) return null;
    // 과거 버전 잔여 민감 필드(pw/pw_hash) 자동 정리 (F12 탈취 방지)
    var cleaned = _stripSensitive(raw);
    if (JSON.stringify(cleaned) !== JSON.stringify(raw)) {
      localStorage.setItem('current_user_persist', JSON.stringify(cleaned));
    }
    return cleaned;
  }
  return null;
}
// ── 중복 로그인 감지 ─────────────────────────────────────────────────────────
var _mySessionId    = null;
var _dupLoginCh     = null;
var _dupToastTimer  = null;

function _genSessionId() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function _registerSession(empid) {
  _mySessionId = _genSessionId();
  sessionStorage.setItem('_sid', _mySessionId);
  // localStorage에 이 계정의 최신 세션 기록 → 다른 탭이 storage 이벤트로 감지
  localStorage.setItem('_sess_' + empid, JSON.stringify({ sid: _mySessionId, t: Date.now() }));

  // BroadcastChannel: 같은 브라우저 탭 간 즉시 통지
  if (window.BroadcastChannel && !_dupLoginCh) {
    _dupLoginCh = new BroadcastChannel('neobiotech_login');
    _dupLoginCh.onmessage = function(e) {
      var me = getCurrentUser();
      if (!me) return;
      if (e.data && e.data.type === 'login' && e.data.empid === me.empid && e.data.sid !== _mySessionId) {
        _showDupLoginBanner(t('dup_login_tab'));
      }
    };
  }
  if (_dupLoginCh) {
    _dupLoginCh.postMessage({ type: 'login', empid: empid, sid: _mySessionId });
  }

  // 서버 세션 등록 (다른 기기/브라우저 감지용)
  apiPost({ action: 'register_session', empid: empid, sid: _mySessionId }).catch(function(){});

  // 주기적 서버 세션 체크 (60초)
  clearInterval(window._dupCheckInterval);
  window._dupCheckInterval = setInterval(function() {
    var me = getCurrentUser();
    if (!me || !_mySessionId) { clearInterval(window._dupCheckInterval); return; }
    apiPost({ action: 'check_session', empid: me.empid, sid: _mySessionId }).then(function(res) {
      if (res && res.status === 'conflict') {
        _showDupLoginBanner(t('dup_login_device'));
      }
    }).catch(function(){});
  }, 60000);
}

function _clearSession(empid) {
  if (!empid || !_mySessionId) return;
  try {
    var stored = JSON.parse(localStorage.getItem('_sess_' + empid) || 'null');
    if (stored && stored.sid === _mySessionId) localStorage.removeItem('_sess_' + empid);
  } catch(e) {}
  if (_dupLoginCh) _dupLoginCh.postMessage({ type: 'logout', empid: empid, sid: _mySessionId });
  apiPost({ action: 'clear_session', empid: empid, sid: _mySessionId }).catch(function(){});
  clearInterval(window._dupCheckInterval);
  _mySessionId = null;
}

function _showDupLoginBanner(msg) {
  // 이미 표시 중이면 갱신만
  var existing = document.getElementById('dupLoginBanner');
  if (existing) { existing.querySelector('.dup-msg').textContent = msg; return; }

  var banner = document.createElement('div');
  banner.id = 'dupLoginBanner';
  banner.innerHTML =
    '<span class="dup-icon">⚠️</span>' +
    '<span class="dup-msg">' + msg + '</span>' +
    '<button class="dup-close" onclick="document.getElementById(\'dupLoginBanner\').remove()">✕</button>';
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:99999;' +
    'background:#dc2626;color:#fff;display:flex;align-items:center;gap:10px;' +
    'padding:12px 20px;font-size:14px;font-weight:600;box-shadow:0 3px 12px rgba(0,0,0,.3);';
  banner.querySelector('.dup-close').style.cssText =
    'margin-left:auto;background:rgba(255,255,255,.25);border:none;color:#fff;' +
    'border-radius:6px;padding:3px 10px;cursor:pointer;font-size:13px;font-weight:700;';
  document.body.appendChild(banner);

  // 10초 후 자동 제거
  clearTimeout(_dupToastTimer);
  _dupToastTimer = setTimeout(function() {
    var b = document.getElementById('dupLoginBanner');
    if (b) b.remove();
  }, 10000);
}

// localStorage storage 이벤트 — 다른 탭에서 같은 계정 로그인 감지 (BroadcastChannel 미지원 브라우저 대비)
window.addEventListener('storage', function(e) {
  var me = getCurrentUser();
  if (!me || !_mySessionId) return;
  var key = '_sess_' + me.empid;
  if (e.key === key && e.newValue) {
    try {
      var ns = JSON.parse(e.newValue);
      if (ns.sid && ns.sid !== _mySessionId) {
        _showDupLoginBanner(t('dup_login_device'));
      }
    } catch(ex) {}
  }
});

function setCurrentUser(u) {
  // 세션스토리지: 동일 탭에서 Firebase Auth 재로그인용으로 pw 를 메모리급으로만 보관
  // u 에 pw 가 없으면 기존 세션의 pw 를 보존 (migrate/refresh 호출 시 pw 유실 방지)
  try {
    var prev = JSON.parse(sessionStorage.getItem('current_user') || 'null');
    if (prev && prev.pw && !u.pw && prev.empid === u.empid) {
      u = Object.assign({}, u, { pw: prev.pw });
    }
  } catch(e) {}
  sessionStorage.setItem('current_user', JSON.stringify(u));
  // localStorage 영구 보관 시에는 민감 필드(pw/pw_hash) 제거
  if (localStorage.getItem('auto_login') === 'true') {
    localStorage.setItem('current_user_persist', JSON.stringify(_stripSensitive(u)));
  }
}

function switchLoginTab(tab) {
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
  var showForm = document.getElementById(tab === 'login' ? 'formLogin' : 'formSignup');
  var hideForm = document.getElementById(tab === 'login' ? 'formSignup' : 'formLogin');
  hideForm.style.display = 'none';
  hideForm.classList.remove('form-slide-left', 'form-slide-right');
  showForm.style.display = 'flex';
  showForm.classList.remove('form-slide-left', 'form-slide-right');
  void showForm.offsetWidth; // reflow to restart animation
  showForm.classList.add(tab === 'signup' ? 'form-slide-right' : 'form-slide-left');
  document.getElementById('li_err').textContent = '';
  document.getElementById('su_err').textContent = '';
  if (tab === 'signup') setTimeout(_initSuSigCanvas, 50);
}

function _togglePwVis() {
  var pw = document.getElementById('li_pw');
  var eyeOn = document.getElementById('pwEyeIcon');
  var eyeOff = document.getElementById('pwEyeOffIcon');
  if (pw.type === 'password') {
    pw.type = 'text';
    eyeOn.style.display = 'none';
    eyeOff.style.display = '';
  } else {
    pw.type = 'password';
    eyeOn.style.display = '';
    eyeOff.style.display = 'none';
  }
  pw.focus();
}

// ── Firebase Auth 직접 폴백 로그인 (GAS API 실패 시) ───────────────────────
// 평문 비밀번호 비교 대신 Firebase Auth 에 위임. 성공 시 Firestore accounts 프로필 반환.
async function _fbAuthFallbackLogin(empid, pw) {
  try {
    var email = empid + FB_AUTH_DOMAIN;
    await _fbAuth.signInWithEmailAndPassword(email, pw);
  } catch(e) {
    console.warn('[fbAuthFallback] 로그인 실패:', e.code);
    return null;
  }
  try {
    var doc = await _fbDb.collection('accounts').doc(empid).get();
    var profile = doc.exists ? doc.data() : { empid: empid, name: empid };
    // 세션용 메모리 pw (자동 재로그인 / Storage 작업용) — localStorage 에는 strip 되어 저장됨
    profile.pw = pw;
    profile.permissions = _ensurePermArray(profile.permissions);
    if (!profile.empid) profile.empid = empid;
    return profile;
  } catch(e) {
    console.warn('[fbAuthFallback] 프로필 조회 실패:', e.message);
    return { empid: empid, name: empid, pw: pw, permissions: [], role: 'user' };
  }
}

// ══════════════════════════════════════════════════════════════════════
// 로그인 실패 카운터 + CAPTCHA (보안 보강 #6)
// 5회 실패 시 수학 챌린지 요구, 10회 이상 시 30초 대기
// ══════════════════════════════════════════════════════════════════════
function _getLoginFailCount() {
  try { return parseInt(localStorage.getItem('_li_fail') || '0', 10) || 0; } catch(e) { return 0; }
}
function _setLoginFailCount(n) {
  try { localStorage.setItem('_li_fail', String(n)); } catch(e) {}
}
function _resetLoginFailCount() {
  try { localStorage.removeItem('_li_fail'); localStorage.removeItem('_li_cooldown'); } catch(e) {}
}
function _getCooldownRemain() {
  try {
    var until = parseInt(localStorage.getItem('_li_cooldown') || '0', 10) || 0;
    var remain = Math.ceil((until - Date.now()) / 1000);
    return remain > 0 ? remain : 0;
  } catch(e) { return 0; }
}
function _setCooldown(seconds) {
  try { localStorage.setItem('_li_cooldown', String(Date.now() + seconds * 1000)); } catch(e) {}
}
function _captchaChallenge() {
  // 간단한 수학 CAPTCHA (외부 의존성 없음)
  return new Promise(function(resolve) {
    var a = Math.floor(Math.random() * 8) + 2;
    var b = Math.floor(Math.random() * 8) + 2;
    var correct = a + b;
    var qText = '🔐 보안 확인: ' + a + ' + ' + b + ' = ? (5회 이상 로그인 실패로 확인 필요)';
    var ans = window.prompt(qText, '');
    if (ans === null) { resolve(false); return; }
    resolve(parseInt(ans, 10) === correct);
  });
}

// ── 매일 오후 12시 (정오) 자동 팝업 스케줄러 ─────────────────────────────
var _noonPopupTimer = null;
function _todayKeyStr() {
  var n = new Date();
  return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
}
function _scheduleNoonTargetPopup(user) {
  if (!user || !user.empid) return;
  if (_noonPopupTimer) { clearInterval(_noonPopupTimer); _noonPopupTimer = null; }
  var flagKey = 'popup_noon_lastShown_' + user.empid;
  var shownAtKey = 'popup_shownAt_' + user.empid;
  function _noonCheck() {
    try {
      var now = new Date();
      if (now.getHours() < 12) return; // 정오 이전이면 대기
      if (localStorage.getItem(flagKey) === _todayKeyStr()) return; // 오늘 이미 트리거됨
      // 로그인 상태 확인
      var cu = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      if (!cu || cu.empid !== user.empid) {
        if (_noonPopupTimer) { clearInterval(_noonPopupTimer); _noonPopupTimer = null; }
        return;
      }
      // 최근 30분 내에 팝업을 이미 봤다면 (로그인 시점 등) 스킵하되 오늘은 마크
      var lastShown = parseInt(localStorage.getItem(shownAtKey) || '0', 10);
      if (lastShown && (Date.now() - lastShown) < 30 * 60 * 1000) {
        localStorage.setItem(flagKey, _todayKeyStr());
        console.log('[NoonPopup] skip: 최근 30분 내에 이미 표시됨');
        return;
      }
      // 최신 데이터 재로드 후 팝업 결정/표시
      try { if (typeof _targetDataLoaded !== 'undefined') _targetDataLoaded = false; } catch(_){}
      try { if (typeof _dashboardTotalsLoaded !== 'undefined') _dashboardTotalsLoaded = false; } catch(_){}
      var _loadTargetFirst = typeof _loadTargetData === 'function' ? _loadTargetData : function(cb){ if(cb) cb(); };
      var _loadDashFirst = typeof _loadDashboardTotals === 'function' ? _loadDashboardTotals : function(cb){ if(cb) cb(); };
      _loadTargetFirst(function(){
      _loadDashFirst(function(){
      _loadPopupConfigFromFirebase(function(){
        if (!_popupConfig || !_popupConfig.enabled) { localStorage.setItem(flagKey, _todayKeyStr()); return; }
        var _t = _popupConfig.target;
        var _isAdmPopup = _isAdmin(user);
        var _show = false, _personalName = null, _teamName = null, _reason = '';
        if (_t === 'all') { _show = true; _reason = 'all'; }
        else if (_t === 'admin' && _isAdmPopup) { _show = true; _reason = 'admin'; }
        else if (_t === user.empid) { _show = true; _reason = 'empid match'; }
        else if (_t && _t.indexOf('dept_') === 0 && user.dept === _t.replace('dept_','')) { _show = true; _reason = 'dept match'; }
        else if (_t === 'personal_sales' && user.dept === 'Sales') {
          _show = true; _reason = 'personal_sales';
          var _isLeader = user.position === 'leader' || user.role === 'manager' || user.sub_dept === 'Group Leader';
          if (_isLeader) {
            _teamName = (typeof _resolveTeamFromSubDept === 'function') ? _resolveTeamFromSubDept(user.sub_dept) : '';
          } else {
            _personalName = user.nickname || user.name || '';
          }
        }
        else if (_t === 'team_leader' && user.dept === 'Sales' && (user.position === 'leader' || user.role === 'manager' || user.sub_dept === 'Group Leader')) {
          _show = true; _reason = 'team_leader';
          _teamName = (typeof _resolveTeamFromSubDept === 'function') ? _resolveTeamFromSubDept(user.sub_dept) : '';
        }
        var _alreadyOwn = (_reason === 'personal_sales' || _reason === 'team_leader');
        if (_show && !_alreadyOwn && user.dept === 'Sales' && !_isAdmPopup) {
          var _autoLeader = user.position === 'leader' || user.role === 'manager' || user.sub_dept === 'Group Leader';
          if (_autoLeader && !_teamName) {
            _teamName = (typeof _resolveTeamFromSubDept === 'function') ? _resolveTeamFromSubDept(user.sub_dept) : '';
            if (_teamName) _reason += '+auto_team('+_teamName+')';
          } else if (!_autoLeader && !_personalName) {
            _personalName = user.nickname || user.name || '';
            if (_personalName) _reason += '+auto_person('+_personalName+')';
          }
        }
        var _perms = _ensurePermArray(user.permissions);
        var _ownDataMode = (_reason.indexOf('personal_sales') === 0 || _reason.indexOf('team_leader') === 0 || _reason.indexOf('auto_team') >= 0 || _reason.indexOf('auto_person') >= 0);
        var _canTarget = _ownDataMode || _isAdmPopup || _perms.includes('target') || _perms.includes('target_approve');
        console.log('[NoonPopup] target='+_t+' · user='+user.empid+' · show='+_show+' ('+_reason+') · canTarget='+_canTarget);
        if (!_show || !_canTarget) { localStorage.setItem(flagKey, _todayKeyStr()); return; }
        setTimeout(function(){
          showTargetAlert(_personalName, _teamName);
          try { localStorage.setItem(shownAtKey, String(Date.now())); } catch(_){}
          localStorage.setItem(flagKey, _todayKeyStr());
        }, 300);
      });
      });
      });
    } catch(e) { console.warn('[NoonPopup] error:', e); }
  }
  _noonCheck(); // 즉시 1회 체크 (로그인 시점이 이미 12시 이후라면 발동)
  _noonPopupTimer = setInterval(_noonCheck, 60 * 1000); // 매분 체크
  console.log('[NoonPopup] 스케줄러 시작 (user='+user.empid+')');
}

async function doLogin() {
  const id    = document.getElementById('li_empid').value.trim();
  const pw    = document.getElementById('li_pw').value;
  const errEl = document.getElementById('li_err');
  const btn   = document.querySelector('#formLogin .btn-login');
  const autoChk = document.getElementById('chkAutoLogin');
  if (!id || !pw) { errEl.textContent = t('msg_fill_all'); return; }

  // 쿨다운 중 확인
  var _cd = _getCooldownRemain();
  if (_cd > 0) {
    errEl.textContent = '⏳ 너무 많은 실패. ' + _cd + '초 후 다시 시도해 주세요.';
    return;
  }

  // 5회 이상 실패 시 CAPTCHA 요구
  var _failCount = _getLoginFailCount();
  if (_failCount >= 5) {
    var _ok = await _captchaChallenge();
    if (!_ok) {
      errEl.textContent = '🔐 보안 확인 실패. 다시 시도해 주세요.';
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = t('msg_connecting');
  errEl.textContent = '';

  // 자동 로그인 체크 상태 저장 (로그인 시도 시점에 저장)
  if (autoChk && autoChk.checked) {
    localStorage.setItem('auto_login', 'true');
    localStorage.setItem('saved_empid', id);
  } else {
    localStorage.setItem('auto_login', 'false');
    localStorage.removeItem('saved_empid');
    localStorage.removeItem('current_user_persist');
  }

  function _playLoginSound() {
    try {
      var audio = new Audio('login-sound.mp3');
      audio.volume = 0.5;
      audio.play().catch(function(){});
    } catch(e) {}
  }

  function _onLoginSuccess(user) {
    // 관리자 2FA PIN 검증 (설정돼 있으면 필수). 검증 실패 시 즉시 로그아웃.
    try {
      if (user && user.role === 'admin' && user.admin_pin_hash && typeof window._verifyAdminPinOnLogin === 'function') {
        (async function(){
          try {
            var ok = await window._verifyAdminPinOnLogin(user);
            if (!ok) {
              try { if (typeof doLogout === 'function') doLogout(); } catch(e) {}
              try { if (typeof _fbAuth !== 'undefined' && _fbAuth.signOut) _fbAuth.signOut(); } catch(e) {}
              try { localStorage.removeItem('auto_login'); } catch(e) {}
              try { alert('🔐 관리자 PIN 검증 실패 — 로그아웃합니다.'); } catch(e) {}
              setTimeout(function(){ location.reload(); }, 300);
              return;
            }
            _continueLoginSuccess(user);
          } catch(err) {
            try { console.error('[2FA] verify error', err); } catch(e) {}
            _continueLoginSuccess(user);
          }
        })();
        return;
      }
    } catch(e) {}
    _continueLoginSuccess(user);
  }
  function _continueLoginSuccess(user) {
    _playLoginSound();
    saveLocalAccount(user);
    setCurrentUser(user); // auto_login 이미 설정됐으므로 setCurrentUser가 persist도 처리
    _registerSession(user.empid); // 중복 로그인 감지 세션 등록
    window._noPermDismissed = false; // 로그인 시 오버레이 닫기 플래그 리셋
    applyUserUI(user);
    _hideLoginShow();
    // 팝업 메시지 표시 (설정에 따라 대상 필터, Firebase 우선 로드)
    if (typeof showTargetAlert === 'function' && typeof _loadPopupConfigFromFirebase === 'function') {
      // 목표 데이터 + 대시보드 총계 로드 후 팝업 설정 로드
      var _loadTargetFirst = typeof _loadTargetData === 'function' ? _loadTargetData : function(cb) { if (cb) cb(); };
      var _loadDashFirst = typeof _loadDashboardTotals === 'function' ? _loadDashboardTotals : function(cb) { if (cb) cb(); };
      _loadTargetFirst(function() {
      _loadDashFirst(function() {
      _loadPopupConfigFromFirebase(function() {
        if (!_popupConfig) { console.log('[Popup] skip: config 없음'); return; }
        if (!_popupConfig.enabled) { console.log('[Popup] skip: 비활성 상태 (enabled=false)'); return; }
        var _t = _popupConfig.target;
        var _isAdmPopup = _isAdmin(user);
        var _show = false;
        var _personalName = null;
        var _teamName = null;
        var _reason = '';
        if (_t === 'all') { _show = true; _reason = 'all'; }
        else if (_t === 'admin' && _isAdmPopup) { _show = true; _reason = 'admin'; }
        else if (_t === user.empid) { _show = true; _reason = 'empid match'; }
        else if (_t && _t.indexOf('dept_') === 0 && user.dept === _t.replace('dept_','')) { _show = true; _reason = 'dept match'; }
        else if (_t === 'personal_sales' && user.dept === 'Sales') {
          _show = true; _reason = 'personal_sales';
          // 팀장/매니저 → 팀 실적, 팀원 → 개인 실적
          var _isLeader = user.position === 'leader' || user.role === 'manager' || user.sub_dept === 'Group Leader';
          if (_isLeader) {
            _teamName = (typeof _resolveTeamFromSubDept === 'function') ? _resolveTeamFromSubDept(user.sub_dept)
              : ((typeof _SUBDEPT_TEAM_MAP !== 'undefined' && _SUBDEPT_TEAM_MAP[user.sub_dept]) ? _SUBDEPT_TEAM_MAP[user.sub_dept] : '');
          } else {
            _personalName = user.nickname || user.name || '';
          }
        }
        else if (_t === 'team_leader' && user.dept === 'Sales' && (user.position === 'leader' || user.role === 'manager' || user.sub_dept === 'Group Leader')) {
          _show = true; _reason = 'team_leader';
          _teamName = (typeof _resolveTeamFromSubDept === 'function') ? _resolveTeamFromSubDept(user.sub_dept)
            : ((typeof _SUBDEPT_TEAM_MAP !== 'undefined' && _SUBDEPT_TEAM_MAP[user.sub_dept]) ? _SUBDEPT_TEAM_MAP[user.sub_dept] : '');
        }
        // 🔥 자동 업그레이드: target='all'/'dept_*'/'admin' 등으로 팝업이 뜰 때도
        // 영업 팀장/팀원에게는 팀/개인 실적 팝업을 보여준다 (일반 팝업 내용 덮어쓰기).
        // 단, 관리자는 전체 수치 유지. personal_sales/team_leader 모드는 위에서 이미 처리됨.
        var _alreadyOwn = (_reason === 'personal_sales' || _reason === 'team_leader');
        if (_show && !_alreadyOwn && user.dept === 'Sales' && !_isAdmPopup) {
          var _autoLeader = user.position === 'leader' || user.role === 'manager' || user.sub_dept === 'Group Leader';
          if (_autoLeader && !_teamName) {
            _teamName = (typeof _resolveTeamFromSubDept === 'function') ? _resolveTeamFromSubDept(user.sub_dept) : '';
            if (_teamName) { _reason += '+auto_team('+_teamName+')'; }
          } else if (!_autoLeader && !_personalName) {
            _personalName = user.nickname || user.name || '';
            if (_personalName) { _reason += '+auto_person('+_personalName+')'; }
          }
        }
        // 관리자 override — target 설정을 존중한다. 관리자는 target='admin' 또는 'all'일 때만 팝업을 본다.
        // (personal_sales / team_leader 모드에서는 관리자 제외 — 테스트는 팝업 관리 패널의 "개인 미리보기" 사용)
        // 매출/수금 현황 권한 체크 — 단, personal_sales/team_leader 모드는 본인(팀) 데이터이므로 권한 무관
        var _perms = _ensurePermArray(user.permissions);
        var _ownDataMode = (_reason.indexOf('personal_sales') === 0 || _reason.indexOf('team_leader') === 0 || _reason.indexOf('auto_team') >= 0 || _reason.indexOf('auto_person') >= 0);
        var _canTarget = _ownDataMode || _isAdmPopup || _perms.includes('target') || _perms.includes('target_approve');
        console.log('[Popup] target='+_t+' · user='+user.empid+' · dept='+user.dept+' · sub_dept='+user.sub_dept+' · isAdmin='+_isAdmPopup+' · show='+_show+' ('+(_reason||'no match')+') · canTarget='+_canTarget+' · perms=['+_perms.join(',')+']');
        if (!_show) { console.log('[Popup] skip: 대상 불일치 (target='+_t+', user.empid='+user.empid+')'); return; }
        if (!_canTarget) { console.log('[Popup] skip: target 권한 없음 (대시보드 권한 필요)'); return; }
        console.log('[Popup] ✅ 표시 예정 (personalName='+_personalName+', teamName='+_teamName+')');
        setTimeout(function() {
          showTargetAlert(_personalName, _teamName);
          try { localStorage.setItem('popup_shownAt_'+user.empid, String(Date.now())); } catch(_){}
        }, 800);
      });
      }); // _loadDashFirst
      }); // _loadTargetFirst
      // 매일 오후 12시 자동 팝업 스케줄러 시작
      if (typeof _scheduleNoonTargetPopup === 'function') _scheduleNoonTargetPopup(user);
    }
    // 로그인 후 잔존 inert/overflow 정리 (모달 포커스트랩 잔재 방지)
    document.querySelectorAll('[inert]').forEach(function(el){ el.removeAttribute('inert'); });
    document.body.style.overflow = '';
    // 브라우저 렌더 강제 갱신 (fixed 오버레이 해제 후 클릭 이벤트 정상화)
    void document.body.offsetHeight;
    console.log('[_onLoginSuccess] 완료, user:', user.empid);

    // 실시간 배지 리스너 시작 (로그인 완료 후 즉시)
    if (typeof _startRealtimeBadges === 'function') _startRealtimeBadges();

    // 자동 로그아웃 타이머 재시작 (12시간 무활동)
    try { if (typeof _resetIdleTimer === 'function') _resetIdleTimer(); } catch(e) {}

    // Firebase Auth 로그인 (Storage 업로드 등에 필요)
    // + Auto-heal: Firebase Auth 에 저장된 pw 가 사용자가 타이핑한 로그인 pw 와
    //   어긋난 레거시 계정을 발견하면, 입력한 pw 로 자동 동기화한다.
    //   이렇게 하면 계정 설정의 "현재 비밀번호" 가 로그인 비밀번호와 항상 일치하게 된다.
    var _authEmail = user.empid + FB_AUTH_DOMAIN;
    var _typedPw = user.pw || user.empid;
    _fbAuth.signInWithEmailAndPassword(_authEmail, _typedPw)
      .then(function() { console.log('[Auth] Firebase Auth 로그인 성공'); })
      .catch(function(err) {
        if (err.code === 'auth/user-not-found') {
          _fbAuth.createUserWithEmailAndPassword(_authEmail, _typedPw)
            .then(function() { console.log('[Auth] Firebase Auth 계정 생성 + 로그인 성공'); })
            .catch(function(e2) { console.warn('[Auth] Firebase Auth 계정 생성 실패:', e2.code); });
        } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          // 레거시 Auth pw = empid 인 계정을 타이핑한 pw 로 heal 한다.
          // Firestore 계정이 이미 서버에서 승인된 로그인이므로, 입력한 pw 가 이 계정의 정답으로 간주한다.
          _fbAuth.signInWithEmailAndPassword(_authEmail, user.empid)
            .then(function() {
              if (user.pw && user.pw !== user.empid && _fbAuth.currentUser) {
                return _fbAuth.currentUser.updatePassword(user.pw).then(function() {
                  console.log('[Auth] legacy pw healed → typed pw');
                }).catch(function(healErr) {
                  console.warn('[Auth] heal updatePassword 실패:', healErr.code);
                });
              }
            })
            .catch(function() {
              // empid 도 아닌 경우: 알 수 없는 Auth pw — 무시 (서버 로그인은 이미 성공)
              console.warn('[Auth] Auth pw 동기화 불가: Firestore 로그인만 유지');
            });
        } else {
          console.warn('[Auth] Firebase Auth 로그인 실패:', err.code);
        }
      });
  }

  try {
    const res = await apiPost({ action: 'login', empid: id, pw: pw });
    if (res.ok && res.user) {
      let loggedUser = enforceAdminRole(res.user);
      // permissions를 항상 배열로 정규화
      loggedUser = Object.assign({}, loggedUser, { permissions: _ensurePermArray(loggedUser.permissions) });
      // GAS login 응답에 permissions/role이 없을 수 있으므로 서버 계정 목록에서 최신 데이터 조회
      if (!loggedUser.permissions.length || !loggedUser.role || loggedUser.role === 'user') {
        try {
          const acctData = await apiGetAccounts();
          const serverAcct = (acctData.accounts || []).find(function(a) { return a.empid === id; });
          if (serverAcct) {
            if (!loggedUser.permissions || !loggedUser.permissions.length) {
              loggedUser = Object.assign({}, loggedUser, { permissions: _ensurePermArray(serverAcct.permissions) });
            }
            if ((!loggedUser.role || loggedUser.role === 'user') && serverAcct.role) {
              loggedUser = Object.assign({}, loggedUser, { role: serverAcct.role });
            }
            // 닉네임 동기화
            if (serverAcct.nickname) loggedUser.nickname = _titleCase(serverAcct.nickname);
          }
        } catch(e) {
          // 서버 조회 실패 시 로컬 캐시 폴백 (오프라인 대비)
          const localAcct = getLocalAccounts().find(function(a) { return a.empid === id; });
          if (localAcct) {
            if (!loggedUser.permissions || !loggedUser.permissions.length) {
              loggedUser = Object.assign({}, loggedUser, { permissions: _ensurePermArray(localAcct.permissions) });
            }
            if ((!loggedUser.role || loggedUser.role === 'user') && localAcct.role) {
              loggedUser = Object.assign({}, loggedUser, { role: localAcct.role });
            }
          }
        }
      }
      loggedUser = enforceAdminRole(loggedUser);
      // 세션 메모리(sessionStorage)에만 pw 보관 — 계정 설정 비밀번호 변경 시
      // Firebase Auth 재로그인에 사용. localStorage 영구 저장 시엔 strip 된다.
      loggedUser.pw = pw;
      _resetLoginFailCount(); // 로그인 성공 → 실패 카운터 리셋
      _onLoginSuccess(loggedUser);
      return;
    }
    // API 로그인 실패 → Firebase Auth 직접 폴백 (평문 비교 금지)
    const fbUser = await _fbAuthFallbackLogin(id, pw);
    if (fbUser) { _resetLoginFailCount(); _onLoginSuccess(enforceAdminRole(fbUser)); return; }
    // 실패 카운터 증가
    var _n = _getLoginFailCount() + 1;
    _setLoginFailCount(_n);
    if (_n >= 10) { _setCooldown(30); errEl.textContent = t('msg_login_err') + ' (실패 ' + _n + '회 · 30초 대기)'; }
    else if (_n >= 5) { errEl.textContent = t('msg_login_err') + ' (실패 ' + _n + '회 · 다음 시도 시 보안 확인 필요)'; }
    else { errEl.textContent = t('msg_login_err'); }
  } catch(e) {
    // API 호출 실패 → Firebase Auth 직접 폴백
    const fbUser = await _fbAuthFallbackLogin(id, pw);
    if (fbUser) { _resetLoginFailCount(); _onLoginSuccess(enforceAdminRole(fbUser)); return; }
    // 카운터 증가 (네트워크 오류 포함)
    var _n2 = _getLoginFailCount() + 1;
    _setLoginFailCount(_n2);
    if (_n2 >= 10) { _setCooldown(30); }
    errEl.textContent = navigator.onLine ? t('msg_login_err') : t('msg_network_err');
  } finally {
    btn.disabled = false;
    btn.textContent = t('btn_login') || '로그인';
  }
}

// ── Google Maps API Key (공통) ───────────────────────────────────────────────
var GMAPS_KEY = 'AIzaSyBDU8EH41NWBx74v7uMKmFpEfvCyLN19zw';

// ── 범용 모달 드래그 유틸리티 ─────────────────────────────────────────────────
/**
 * _makeDraggable(opts)
 * @param {string}   opts.headerSel   - 드래그 핸들 CSS 선택자
 * @param {string}   [opts.modalSel]  - 모달 컨테이너 선택자 (closest), 없으면 headerSel의 parentElement
 * @param {string}   [opts.bounce]    - 'margin'|'minVisible'|없으면 바운스 없음
 * @param {number}   [opts.margin=8]  - 경계 여백 (bounce='margin')
 * @param {number}   [opts.minVisible=50] - 최소 가시 영역 (bounce='minVisible')
 * @param {boolean}  [opts.touch]     - 터치 지원
 * @param {boolean}  [opts.adjustMaxH]- 드래그 중 maxHeight 조정
 * @param {Function} [opts.beforeDrag]- (modal,hdr)→false 시 취소
 * @param {Function} [opts.onStart]   - (modal,rect) 드래그 시작 시 추가 처리
 */
function _makeDraggable(opts) {
  // _d: false(idle) | 'pending'(mousedown 됐지만 임계치 미달) | true(실제 드래그 중)
  var _d = false, _el = null, _sX = 0, _sY = 0, _sL = 0, _sT = 0;
  // 커서와 모달 좌상단 사이의 오프셋 (mousedown 순간 기록) — 드래그 내내 이 오프셋을 유지
  var _offX = 0, _offY = 0;
  var _pendingRect = null, _pendingOnStartDone = false;
  var hSel = opts.headerSel, mSel = opts.modalSel || null;
  var mg = opts.margin || 8;
  var bType = opts.bounce || '';
  var minVis = opts.minVisible || 50;
  var adjH = !!opts.adjustMaxH;
  var bEase = 'left .35s cubic-bezier(.34,1.3,.64,1), top .35s cubic-bezier(.34,1.3,.64,1)';
  // 드래그 임계치: 이 거리 이상 움직여야 실제 드래그 시작 (클릭 오인 방지)
  var DRAG_THRESHOLD = (typeof opts.dragThreshold === 'number') ? opts.dragThreshold : 5;

  function _start(cx, cy, e) {
    var hdr = e.target.closest(hSel);
    if (!hdr) return;
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
    var modal = mSel ? hdr.closest(mSel) : hdr.parentElement;
    if (!modal) return;
    if (opts.beforeDrag && opts.beforeDrag(modal, hdr) === false) return;
    // 임계치 통과 전까지는 'pending' 상태. 실제 DOM 변경은 아직 안 함.
    _d = 'pending'; _el = modal;
    _pendingRect = modal.getBoundingClientRect();
    _pendingOnStartDone = false;
    _sX = cx; _sY = cy;
    // 커서가 모달 좌상단으로부터 얼마나 떨어져 있는지 — 드래그 내내 이 오프셋 유지
    _offX = cx - _pendingRect.left;
    _offY = cy - _pendingRect.top;
    // e.preventDefault() 는 실제 드래그로 전환될 때만 호출 (클릭/선택 방해 X)
  }

  function _activateDrag() {
    if (_pendingOnStartDone) return;
    _pendingOnStartDone = true;
    var modal = _el;
    var origRect = modal.getBoundingClientRect();
    if (opts.onStart) {
      opts.onStart(modal, origRect);
    } else {
      modal.style.width = origRect.width + 'px';
      modal.style.height = origRect.height + 'px';
      modal.style.maxWidth = 'none';
      modal.style.maxHeight = 'none';
      modal.style.margin = '0';
      modal.style.right = 'auto';
      modal.style.bottom = 'auto';
      modal.style.position = 'fixed';
      modal.style.left = origRect.left + 'px';
      modal.style.top = origRect.top + 'px';
    }
    // 모달 자체 애니메이션 transform 잔재 제거 — 드래그 중 쉼 없이 transform 이 변화하면
    // rect 가 매 프레임 바뀌어 catch-up 계산에 노이즈가 생김
    modal.style.transform = 'none';
    modal.style.animation = 'none';
    modal.style.transition = 'none';
    // _sL/_sT 는 이제 사용하지 않음 (_move 가 매 프레임 catch-up 으로 자가보정)
    // 드래그 활성 시: 텍스트 선택 방지 + 포커스 누수 방지 + 커서 통일
    try {
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.body.style.cursor = 'grabbing';
      // 배경 input/링크 등이 포커스/커서 이벤트 가로채지 못하게 오버레이 설치
      if (!document.getElementById('_dragShield')) {
        var shield = document.createElement('div');
        shield.id = '_dragShield';
        shield.style.cssText = 'position:fixed;inset:0;z-index:var(--z-drag-shield);cursor:grabbing;background:transparent;';
        document.body.appendChild(shield);
      }
      // 현재 포커스된 요소(배경 input 등) blur
      if (document.activeElement && document.activeElement.blur) {
        try { document.activeElement.blur(); } catch(e2){}
      }
    } catch(e) {}
  }

  function _cleanupDragChrome() {
    try {
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      document.body.style.cursor = '';
      var shield = document.getElementById('_dragShield');
      if (shield) shield.remove();
    } catch(e) {}
  }

  function _move(cx, cy, ev) {
    if (!_d || !_el) return;
    if (_d === 'pending') {
      // 임계치 통과 여부 확인
      var ddx = cx - _sX, ddy = cy - _sY;
      if (Math.abs(ddx) < DRAG_THRESHOLD && Math.abs(ddy) < DRAG_THRESHOLD) return;
      // 임계치 통과 → 실제 드래그 시작
      _activateDrag();
      _d = true;
    }
    // 실제 드래그 중: 기본 텍스트 선택/포커스 동작 차단
    if (ev && ev.preventDefault) { try { ev.preventDefault(); } catch(e){} }
    // ── Catch-up 알고리즘: 조상 transform / containing block 불일치에 강건 ──
    // 1) 원하는 viewport 위치 = 커서 위치 - 커서오프셋 (mousedown 때 기록)
    // 2) 현재 실제 viewport 위치(rect) 읽기
    // 3) style.left/top 에 (desired - current) 증분만큼 더해 설정
    //    → 조상 transform 이 변하든, containing block 이 어디든 매 프레임 커서와 정확히 정렬
    var desiredVpX = cx - _offX;
    var desiredVpY = cy - _offY;
    var curRect = _el.getBoundingClientRect();
    var curL = parseFloat(_el.style.left) || 0;
    var curT = parseFloat(_el.style.top)  || 0;
    _el.style.left = (curL + desiredVpX - curRect.left) + 'px';
    _el.style.top  = (curT + desiredVpY - curRect.top)  + 'px';
    if (adjH) _el.style.maxHeight = Math.max(200, window.innerHeight - Math.max(0, desiredVpY) - mg) + 'px';
  }

  function _end() {
    if (!_d || !_el) return;
    // 'pending' 상태에서 mouseup → 임계치 미달 = 클릭, 아무것도 안 함
    if (_d === 'pending') {
      _d = false; _el = null; _pendingRect = null; _pendingOnStartDone = false;
      _cleanupDragChrome();
      return;
    }
    _d = false;
    _cleanupDragChrome();
    if (bType) {
      var r = _el.getBoundingClientRect();
      var vw = window.innerWidth, vh = window.innerHeight;
      // nL/nT 은 viewport 좌표 기준으로 계산
      var nL = r.left, nT = r.top, b = false;
      if (bType === 'margin') {
        if (r.left < mg) { nL = mg; b = true; }
        if (r.top < mg) { nT = mg; b = true; }
        if (r.right > vw - mg) { nL = vw - mg - r.width; b = true; }
        if (r.bottom > vh - mg) { nT = vh - mg - r.height; b = true; }
        if (nT < mg) { nT = mg; b = true; }
      } else if (bType === 'minVisible') {
        // 상단 헤더바 (.header) 가 있으면 그 바로 아래를 최소 top 경계로
        var topLimit = minVis;
        var hdrEl = document.querySelector('.header');
        if (hdrEl) {
          var hdrRect = hdrEl.getBoundingClientRect();
          if (hdrRect.bottom > 0) topLimit = Math.max(minVis, hdrRect.bottom + 4);
        }
        if (r.right < minVis) { nL = minVis - r.width; b = true; }
        if (r.left > vw - minVis) { nL = vw - minVis; b = true; }
        // 위로 헤더바 밑보다 더 올라가면 헤더바 아래로 바운스 (헤더/드래그 핸들 항상 노출)
        if (r.top < topLimit) { nT = topLimit; b = true; }
        // 너무 아래로 내려가 헤더가 viewport 밖으로 나가면 50px 남기고 바운스
        if (r.top > vh - 50) { nT = vh - 50; b = true; }
      }
      if (b) {
        _el.style.transition = bType === 'minVisible' ? 'left .3s ease, top .3s ease' : bEase;
        // catch-up: style.left/top 에 증분을 더해 viewport (nL, nT) 로 이동
        var curL2 = parseFloat(_el.style.left) || 0;
        var curT2 = parseFloat(_el.style.top)  || 0;
        _el.style.left = (curL2 + nL - r.left) + 'px';
        _el.style.top  = (curT2 + nT - r.top)  + 'px';
        if (adjH) _el.style.maxHeight = Math.max(200, vh - nT - mg) + 'px';
        var ref = _el;
        setTimeout(function() { if (ref) ref.style.transition = 'none'; }, 380);
      }
    }
    _el = null; _pendingRect = null; _pendingOnStartDone = false;
  }

  document.addEventListener('mousedown', function(e) { _start(e.clientX, e.clientY, e); });
  document.addEventListener('mousemove', function(e) { _move(e.clientX, e.clientY, e); });
  document.addEventListener('mouseup', _end);
  if (opts.touch) {
    document.addEventListener('touchstart', function(e) {
      var t = e.touches[0]; _start(t.clientX, t.clientY, e);
    }, { passive: false });
    // passive:false 로 변경 → 드래그 중 preventDefault 가능 (스크롤/선택 방지)
    document.addEventListener('touchmove', function(e) {
      if (!_d) return; var t = e.touches[0]; _move(t.clientX, t.clientY, e);
    }, { passive: false });
    document.addEventListener('touchend', _end);
    document.addEventListener('touchcancel', _end);
  }
}

// ── 관리자 강제 지정 목록 ────────────────────────────────────────────────────
const HARDCODED_ADMINS = ['T2408087'];

// ── 관리자/승인자 체크 유틸리티 ─────────────────────────────────────────────
/** 기본 관리자 체크: HARDCODED_ADMINS 또는 role==='admin' */
function _isAdmin(u) {
  if (!u) return false;
  return HARDCODED_ADMINS.includes(u.empid) || u.role === 'admin';
}
/** 승인자 포함 체크: admin + approver */
function _isApprover(u) {
  if (!u) return false;
  return HARDCODED_ADMINS.includes(u.empid) || u.role === 'admin' || u.role === 'approver';
}
/** Sales 부서 여부 (대소문자/공백 무관) */
function _isSalesDept(u) {
  if (!u || !u.dept) return false;
  return String(u.dept).trim().toLowerCase() === 'sales';
}
/** Office 부서 여부 (대소문자/공백 무관) */
function _isOfficeDept(u) {
  if (!u || !u.dept) return false;
  return String(u.dept).trim().toLowerCase() === 'office';
}
/** 본인 데이터만 봐야 하는 사용자 (관리자/Office 제외 = Sales 및 미지정 포함) */
function _isScopedUser(u) {
  if (!u) return false;
  // 영업(Sales) 부서: role 무관 항상 본인 스코프로 제한 (배지/리스트 노이즈 방지)
  // 단, 팀장(leader) / 그룹장(group_leader / sub_dept='Group Leader') 은 팀·그룹 전체 보기 권한
  if (u.dept === 'Sales') {
    var pos = u.position || '';
    if (pos === 'leader' || pos === 'group_leader' || u.sub_dept === 'Group Leader') return false;
    return true;
  }
  if (_isAdmin(u)) return false;
  if (_isOfficeDept(u)) return false;
  return true; // dept 미지정: 본인 스코프로 제한
}
window._isSalesDept = _isSalesDept;
window._isOfficeDept = _isOfficeDept;
window._isScopedUser = _isScopedUser;

// permissions 값을 항상 배열로 변환 (문자열 JSON도 파싱) + 레거시 키 마이그레이션
function _ensurePermArray(v) {
  var arr;
  if (Array.isArray(v)) arr = v;
  else if (typeof v === 'string' && v) { try { var p = JSON.parse(v); if (Array.isArray(p)) arr = p; else arr = []; } catch(e) { arr = []; } }
  else arr = [];
  // 레거시: target_admin → target_approve 마이그레이션
  var idx = arr.indexOf('target_admin');
  if (idx >= 0) { arr[idx] = 'target_approve'; }
  return arr;
}

function enforceAdminRole(user) {
  if (!user) return user;
  if (HARDCODED_ADMINS.includes(user.empid) && user.role !== 'admin') {
    var promoted = Object.assign({}, user, { role: 'admin', permissions: [] });
    saveLocalAccount(promoted);
    apiPost({ action: 'update_account', account: promoted }).catch(function(){});
    return promoted;
  }
  return user;
}

const SUB_DEPT_OPTIONS = {
  Sales:  [
    { value:'Group Leader', i18n:'sub_dept_group_leader' },
    { value:'방콕',    i18n:'sub_dept_bangkok'   },
    { value:'북부',    i18n:'sub_dept_north'     },
    { value:'북동부',  i18n:'sub_dept_northeast' },
    { value:'동부',    i18n:'sub_dept_east'      },
    { value:'남부',    i18n:'sub_dept_south'     },
    { value:'CT', i18n:'sub_dept_ct'  }
  ],
  Office: [
    { value:'재무',    i18n:'sub_dept_finance'   },
    { value:'영업관리',i18n:'sub_dept_sales_mgmt'},
    { value:'마케팅',  i18n:'sub_dept_marketing' },
    { value:'물류',    i18n:'sub_dept_logistics' },
    { value:'인사',    i18n:'sub_dept_hr'        },
    { value:'기획',    i18n:'sub_dept_planning'  },
    { value:'장비',    i18n:'sub_dept_equipment' },
    { value:'디지털',  i18n:'sub_dept_digital'   }
  ]
};

// sub_dept 값을 현재 언어로 변환
function _translateSubDept(val) {
  if (!val) return '';
  var allOpts = (SUB_DEPT_OPTIONS.Sales || []).concat(SUB_DEPT_OPTIONS.Office || []);
  var found = allOpts.find(function(o) { return o.value === val; });
  return found ? t(found.i18n) : val;
}

// dept 값 표시 변환 (CEO → MD)
function _deptDisp(d) { return d === 'CEO' ? 'MD' : (d || ''); }

function updateSubDeptOptions(deptId, subDeptId, keepValue) {
  var dept     = document.getElementById(deptId).value;
  var sub      = document.getElementById(subDeptId);
  var prevVal  = keepValue || sub.value;
  var opts     = SUB_DEPT_OPTIONS[dept] || [];
  sub.innerHTML = '<option value="" data-i18n="signup_sub_dept_ph">' + t('signup_sub_dept_ph') + '</option>';
  opts.forEach(function(o) {
    var op = document.createElement('option');
    op.value       = o.value;
    op.textContent = t(o.i18n) || o.value;
    op.dataset.i18n = o.i18n;  // 언어 변경 시 applyLang()이 갱신
    sub.appendChild(op);
  });
  sub.style.display = ''; // 항상 표시
  sub.value = prevVal || '';
}

// 소속 변경 시: MD 선택 시 부서를 'MD'로 고정
function onDeptChange() {
  var deptSel = document.getElementById('edit_acct_dept');
  var subDeptSel = document.getElementById('edit_acct_sub_dept');
  if (!deptSel || !subDeptSel) return;
  if (deptSel.value === 'MD') {
    subDeptSel.innerHTML = '<option value="MD" data-i18n="dept_ceo">MD</option>';
    subDeptSel.value = 'MD';
    subDeptSel.disabled = true;
  } else {
    subDeptSel.disabled = false;
    updateSubDeptOptions('edit_acct_dept', 'edit_acct_sub_dept');
  }
}

async function doSignup() {
  const empid    = document.getElementById('su_empid').value.trim();
  const name     = document.getElementById('su_name').value.trim();
  const nickname = _titleCase((document.getElementById('su_nickname') || {}).value?.trim() || '');
  const dept     = document.getElementById('su_dept').value;
  const sub_dept = document.getElementById('su_sub_dept').value;
  const tel      = (document.getElementById('su_tel')   || {}).value?.trim() || '';
  const email    = (document.getElementById('su_email') || {}).value?.trim() || '';
  const pw       = document.getElementById('su_pw').value;
  const pw2      = document.getElementById('su_pw2').value;
  const sigData  = getSuSignatureData();
  const errEl    = document.getElementById('su_err');
  const btn      = document.querySelector('#formSignup .btn-login');

  if (!empid || !name || !dept || !sub_dept || !tel || !email || !pw) { errEl.textContent = t('msg_fill_all'); return; }
  if (!/^[A-Za-z0-9]+$/.test(empid))  { errEl.textContent = t('msg_empid_format'); return; }
  if (pw !== pw2)                       { errEl.textContent = t('msg_pw_mismatch'); return; }
  if (email && !isValidEmail(email))    { errEl.textContent = t('as_email_invalid'); return; }

  btn.disabled = true;
  btn.textContent = t('msg_signing_up');
  errEl.textContent = '';

  try {
    const res = await apiPost({ action: 'register', empid, name, nickname, dept, sub_dept, pw, tel, email });
    if (!res.ok && res.msg === 'duplicate') {
      errEl.textContent = t('msg_empid_dup');
      return;
    }
    if (!res.ok) { errEl.textContent = t('msg_signup_fail'); return; }

    const newUser = { empid, name, nickname, dept, sub_dept, role: 'user', permissions: [], pw, tel, email };
    saveLocalAccount(newUser);
    setCurrentUser(newUser);
    if (sigData) { try { localStorage.setItem('neo_sig_' + empid, sigData); } catch(se) {} }
    window._noPermDismissed = false;
    applyUserUI(newUser);
    _hideLoginShow();
    window._isNewSignup = true;
  } catch(e) {
    console.error('[doSignup] 등록 에러:', e.message);
    // Firestore 직접 저장 재시도
    try {
      // 비밀번호는 Firebase Auth 가 관리. Firestore 에는 pw/pw_hash 저장 금지.
      await _fbDb.collection('accounts').doc(empid).set({
        empid: empid, name: name, nickname: nickname, dept: dept, sub_dept: sub_dept,
        tel: tel, email: email,
        role: 'user', permissions: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      try { if (typeof invalidateAccountsCache === 'function') invalidateAccountsCache(); } catch(ic){}
      console.log('[doSignup] Firestore 직접 저장 성공');
    } catch(fbErr) {
      console.warn('[doSignup] Firestore 저장도 실패, 로컬만 등록:', fbErr.message);
    }
    const localAccounts = getLocalAccounts();
    if (localAccounts.find(function(a){ return a.empid === empid; })) {
      errEl.textContent = t('msg_empid_dup');
      return;
    }
    const newUser = { empid, name, nickname, dept, sub_dept, role: 'user', permissions: [], pw, tel, email };
    saveLocalAccount(newUser);
    setCurrentUser(newUser);
    if (sigData) { try { localStorage.setItem('neo_sig_' + empid, sigData); } catch(se) {} }
    window._noPermDismissed = false;
    applyUserUI(newUser);
    _hideLoginShow();
    window._isNewSignup = true;
  } finally {
    btn.disabled = false;
    btn.textContent = t('btn_signup');
  }
}

// ── 권한 확인 & 모바일 잠금 토스트 ───────────────────────────────────────────
var _permToastTimer = null;
function showPermDeniedToast() {
  // force-mobile 상태면 phonePreviewWrapper 안에, 아니면 body에 추가
  var container = _phoneViewActive
    ? document.getElementById('phonePreviewWrapper')
    : document.body;
  var toast = document.getElementById('permDeniedToast');
  if (toast && toast.parentNode !== container) { toast.parentNode.removeChild(toast); toast = null; }
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'permDeniedToast';
    toast.className = 'perm-denied-toast';
    toast.textContent = '🔒 ' + t('msg_no_perm_menu');
    container.appendChild(toast);
  }
  if (_permToastTimer) { clearTimeout(_permToastTimer); _permToastTimer = null; }
  // force reflow
  void toast.offsetWidth;
  toast.classList.add('show');
  _permToastTimer = setTimeout(function() {
    toast.classList.remove('show');
    _permToastTimer = null;
  }, 2200);
}

function _checkPerm(permKey) {
  var user = getCurrentUser();
  if (!user) return false;
  if (_isAdmin(user)) return true;
  return _ensurePermArray(user.permissions).includes(permKey);
}

async function requestPermToAdmin() {
  var me = getCurrentUser();
  if (!me) return;
  var btn = document.getElementById('btnRequestPerm');
  var status = document.getElementById('noPermRequestStatus');
  if (btn) btn.disabled = true;
  try {
    var adminId = HARDCODED_ADMINS[0];
    var roomId = _chatRoomId(me.empid, adminId);
    var text = '🔑 [권한 요청] ' + me.name + ' (' + me.empid + ')' + (me.dept ? ' / ' + me.dept : '') + ' 님이 메뉴 권한을 요청합니다.';
    await _fbDb.collection('chats').doc(roomId).collection('messages').add({
      from: me.empid,
      fromName: me.name || me.empid,
      to: adminId,
      text: text,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (typeof _chatLocalSendTimes !== 'undefined') _chatLocalSendTimes[roomId] = Date.now();
    if (typeof _chatLocalReadTimes !== 'undefined') _chatLocalReadTimes[roomId] = Date.now();
    await _fbDb.collection('chats').doc(roomId).set({
      participants: [me.empid, adminId].sort(),
      lastMsg: text,
      lastTs: firebase.firestore.FieldValue.serverTimestamp(),
      lastFrom: me.empid,
      lastFromName: me.name || me.empid,
      ['name_' + me.empid]: me.name || me.empid
    }, { merge: true });
    if (status) { status.textContent = t('noperm_sent'); status.style.display = ''; }
    if (btn) btn.textContent = '✓ ' + t('noperm_sent');
  } catch(e) {
    console.error('[requestPermToAdmin]', e);
    if (status) { status.textContent = t('noperm_fail'); status.style.color = '#ef4444'; status.style.display = ''; }
    if (btn) btn.disabled = false;
  }
}

function mobCardClick(permKey, openFn) {
  if (!_checkPerm(permKey)) { showPermDeniedToast(); return; }
  if (typeof openFn === 'function') openFn();
}

window._quotePendingCount = 0;
window._orderPendingCount = 0;
function _updateMobOrderCatBadge() {
  var qc = window._quotePendingCount || 0;
  var oc = window._orderPendingCount || 0;
  var bq = document.getElementById('mobCatOrderBadgeQuote');
  var bo = document.getElementById('mobCatOrderBadgeOrder');
  if (bq) { if (qc > 0) { bq.textContent = qc; bq.classList.add('show'); } else { bq.classList.remove('show'); } }
  if (bo) { if (oc > 0) { bo.textContent = oc; bo.classList.add('show'); } else { bo.classList.remove('show'); } }
  var mqb = document.getElementById('mobOrderCatQuoteBadge');
  if (mqb) { if (qc > 0) { mqb.textContent = qc; mqb.classList.add('show'); } else { mqb.classList.remove('show'); } }
}

function openMobSub(key) {
  document.getElementById('mobCatView').style.display = 'none';
  document.querySelectorAll('.mob-sub-view').forEach(function(v) { v.classList.remove('open'); });
  var sub = document.getElementById('mobSub' + key.charAt(0).toUpperCase() + key.slice(1));
  if (sub) sub.classList.add('open');
}
function openMobOrderSub(key) {
  document.querySelectorAll('.mob-sub-view').forEach(function(v) { v.classList.remove('open'); });
  var id = 'mobSubOrder' + key.charAt(0).toUpperCase() + key.slice(1);
  var sub = document.getElementById(id);
  if (sub) sub.classList.add('open');
}
function closeMobOrderSub() {
  document.querySelectorAll('.mob-sub-view').forEach(function(v) { v.classList.remove('open'); });
  var orderSub = document.getElementById('mobSubOrder');
  if (orderSub) orderSub.classList.add('open');
}
function openMobRegSub(key) {
  document.querySelectorAll('.mob-sub-view').forEach(function(v) { v.classList.remove('open'); });
  var id = 'mobSubReg' + key.charAt(0).toUpperCase() + key.slice(1);
  var sub = document.getElementById(id);
  if (sub) sub.classList.add('open');
}
function closeMobRegSub() {
  document.querySelectorAll('.mob-sub-view').forEach(function(v) { v.classList.remove('open'); });
  var custSub = document.getElementById('mobSubCust');
  if (custSub) custSub.classList.add('open');
}

function closeMobSub() {
  var openViews = document.querySelectorAll('.mob-sub-view.open');
  if (!openViews.length) {
    document.getElementById('mobCatView').style.display = '';
    return;
  }
  openViews.forEach(function(v) {
    v.classList.add('closing');
    v.classList.remove('open');
  });
  setTimeout(function() {
    openViews.forEach(function(v) { v.classList.remove('closing'); });
    document.getElementById('mobCatView').style.display = '';
    // 메뉴 카드 영역으로 부드럽게 스크롤
    var catView = document.getElementById('mobCatView');
    if (catView) catView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}

// ── 메뉴 설정 (Menu Config) ─────────────────────────────────────────────────
var MENU_CONFIG_ITEMS = [
  { key: 'messenger', icon: '💬', i18n: 'mc_messenger' },
  { key: '_grp_reg', isGroup: true, icon: '📂', i18n: 'mc_grp_reg', items: [
    { key: 'customer', icon: '👤', i18n: 'mc_customer', children: [
      { key: 'customer.register', icon: '➕', i18n: 'btn_register' },
      { key: 'customer.approve', icon: '⏳', i18n: 'btn_pend_cust' },
      { key: 'customer.appr_result', icon: '📊', i18n: 'btn_cust_appr_result' },
      { key: 'customer.info_search', icon: '🔍', i18n: 'btn_cust_info_search' },
      { key: 'customer.list', icon: '📋', i18n: 'btn_cust_list' }
    ]},
    { key: 'prod_reg', icon: '🏷️', i18n: 'mc_prod_reg', children: [
      { key: 'prod_reg.register', icon: '➕', i18n: 'btn_prod_reg' },
      { key: 'prod_reg.approve', icon: '⏳', i18n: 'btn_prod_approve' },
      { key: 'prod_reg.list', icon: '📋', i18n: 'btn_prod_list' }
    ]}
  ]},
  { key: '_grp_order', isGroup: true, icon: '🛒', i18n: 'mc_grp_order', items: [
    { key: 'quote',    icon: '📋', i18n: 'mc_quote', children: [
      { key: 'quote.new', icon: '📋', i18n: 'qt_dd_new' },
      { key: 'quote.pending', icon: '📋', i18n: 'qt_dd_pending' },
      { key: 'quote.done', icon: '📋', i18n: 'qt_dd_done' }
    ]},
    { key: 'order',    icon: '📦', i18n: 'mc_order', children: [
      { key: 'order.new', icon: '📦', i18n: 'od_dd_new' },
      { key: 'order.pending', icon: '⏳', i18n: 'od_dd_pending' },
      { key: 'order.history', icon: '📊', i18n: 'od_dd_history' }
    ]},
    { key: 'demo',     icon: '🧪', i18n: 'btn_demo', children: [
      { key: 'demo.request', icon: '📝', i18n: 'demo_dd_request' },
      { key: 'demo.return', icon: '📥', i18n: 'demo_dd_return' },
      { key: 'demo.status', icon: '📊', i18n: 'demo_dd_status' }
    ]}
  ]},
  { key: 'ship', icon: '🚚', i18n: 'mc_grp_ship', children: [
    { key: 'ship.delivery', icon: '🚚', i18n: 'sd_dd_delivery' },
    { key: 'ship.shipped', icon: '✅', i18n: 'sd_dd_shipped' },
    { key: 'ship.tracking', icon: '📦', i18n: 'btn_tracking' },
    { key: 'ship.history', icon: '📊', i18n: 'sd_dd_history' }
  ]},
  { key: 'results',  icon: '📊', i18n: 'mc_results', children: [
    { key: 'results.order_ship', icon: '📦', i18n: 'btn_report_order_ship' },
    // { key: 'results.consign', icon: '📋', i18n: 'menu_consign_status' }, // 메뉴 제외 (2026-04-24)
    { key: 'target.view', icon: '📊', i18n: 'target_view' },
    { key: 'results.daily_report', icon: '📋', i18n: 'menu_daily_report' },
    { key: 'results.dashboard', icon: '📈', i18n: 'menu_sales_dashboard' },
    { key: 'results.ar_aging', icon: '💰', i18n: 'menu_ar_aging' },
    { key: 'results.combined_report', icon: '📊', i18n: 'menu_combined_report' },
    { key: 'results.borrow_control', icon: '📦', i18n: 'menu_borrow_control' }
  ]},
  { key: 'attend',   icon: '🕐', i18n: 'mc_attend', children: [
    { key: 'attend.do', icon: '☀️', i18n: 'mc_attend_do' },
    { key: 'attend.summary', icon: '📊', i18n: 'mc_attend_summary' },
    { key: 'attend.visit_log', icon: '📝', i18n: 'menu_visit_log' },
    { key: 'attend.visit_schedule', icon: '📅', i18n: 'menu_visit_schedule' },
    { key: 'attend.nearby_dentists', icon: '🦷', i18n: 'menu_nearby_dentists' },
    { key: 'attend.fuel', icon: '⛽', i18n: 'fuel_menu' }
  ]},
  { key: 'expense', icon: '💰', i18n: 'expense_menu', children: [
    { key: 'expense.receipt', icon: '🧾', i18n: 'expense_receipt' }
  ]},
];

var _menuConfig = {}; // { customer: true, quote: true, ... }

async function loadMenuConfig() {
  try {
    var doc = await _fbDb.collection('settings').doc('menuConfig').get();
    if (doc.exists) _menuConfig = doc.data();
    else _menuConfig = {};
  } catch (e) { console.warn('[MenuConfig] load error:', e); _menuConfig = {}; }
}

function _isMenuEnabled(key) {
  return _menuConfig[key] !== false;
}

function _applyMenuConfig() {
  var user = getCurrentUser();
  var isAdmin = _isAdmin(user);
  if (isAdmin) return; // 관리자는 모든 메뉴 표시

  var perms = _ensurePermArray(user ? user.permissions : []);

  // 사용자 권한이 있으면 글로벌 메뉴 설정에 관계없이 표시
  // permKeys: 해당 메뉴에 대한 사용자 권한 키들
  var desktopEntries = [
    { keys: ['customer'], permKeys: ['register','search','approve_cust','cust_appr_result','cust_info_search','cust_list'], sels: ['.btn-register-wrap'], mob: '#mobCatCust' },
    { keys: ['quote','order','demo'], permKeys: ['quote','order','pending','results','demo'], sels: ['.btn-ordertop-wrap'], mob: '#mobCatOrder' },
    { keys: ['ship'], permKeys: ['ship','delivery','shipped','tracking'], sels: ['.btn-ship-wrap'], mob: '#mobCatShip' },
    { keys: ['results'], permKeys: ['results','consign_status','target'], sels: ['.btn-report-wrap'], mob: '#mobCatReport' },
    { keys: ['attend'], permKeys: ['attend','attend_summary','fuel_price'], sels: ['#btnAttend'], mob: '#mobCatAttend' },
    { keys: ['messenger'], permKeys: ['messenger'], sels: ['.btn-messenger-wrap'], mob: null },
    { keys: ['prod_reg'], permKeys: ['prod_reg','prod_approve','prod_list'], sels: ['.btn-prod-reg-wrap'], mob: '#mobRegCatProduct' },
    { keys: ['system'], permKeys: [], sels: ['#btnSystemDD'], mob: null }
  ];
  desktopEntries.forEach(function(entry) {
    // 글로벌 메뉴 설정에서 모든 관련 키가 비활성인지 확인
    var allDisabled = entry.keys.every(function(k) { return !_isMenuEnabled(k); });
    // 메뉴 비활성화 = 관리자 제외 모든 유저에게 숨김 (권한 유무 무관)
    if (allDisabled) {
      entry.sels.forEach(function(sel) { var el = document.querySelector(sel); if (el) el.style.display = 'none'; });
      if (entry.mob) { var mEl = document.querySelector(entry.mob); if (mEl) mEl.style.display = 'none'; }
    }
  });

  // 하위 메뉴 개별 숨김/표시
  var subMap = {
    'customer.register':    { desktop: '#btnRegCustDD', mobile: '#mobCardRegister' },
    'customer.approve':     { desktop: '#btnPendCustDD', mobile: '#mobCardPendCust' },
    'customer.appr_result': { desktop: '#btnCustApprResult', mobile: '#mobCardCustApprResult' },
    'customer.info_search': { desktop: '#btnCustInfoSearch', mobile: '#mobCardCustInfoSearch' },
    'customer.list':        { desktop: '#btnCustList', mobile: '#mobCardCustList' },
    'quote.new':            { desktop: '#ddQuoteNew', mobile: '#mobCardQuote' },
    'quote.pending':        { desktop: '#ddQuotePending', mobile: '#mobCardQtList' },
    'quote.done':           { desktop: '#ddQuoteDone', mobile: '#mobCardQtDone' },
    'order.new':            { desktop: '#ddOrderNew', mobile: '#mobCardOrder' },
    'order.pending':        { desktop: '#ddOrderPending', mobile: '#mobCardPending' },
    'order.history':        { desktop: '#ddOrderHistory', mobile: '#mobCardOrderHistory' },
    'results.consign':      { desktop: '#ddConsignStatus', mobile: '#mobCardConsignStatus' },
    'demo.request':         { desktop: '#ddDemoRequest', mobile: '#mobCardDemoRequest' },
    'demo.return':          { desktop: '#ddDemoReturn', mobile: '#mobCardDemoReturn' },
    'demo.status':          { desktop: '#ddDemoStatus', mobile: '#mobCardDemoStatus' },
    'ship.delivery':        { desktop: null, mobile: '#mobCardDelivery' },
    'ship.shipped':         { desktop: null, mobile: '#mobCardShipped' },
    'ship.tracking':        { desktop: null, mobile: '#mobCardTracking' },
    'ship.history':         { desktop: null, mobile: '#mobCardShipHistory' },
    'prod_reg.register':    { desktop: '#btnProdRegDD', mobile: '#mobCardProdReg' },
    'prod_reg.approve':     { desktop: '#btnPendProdDD', mobile: '#mobCardPendProd' },
    'prod_reg.list':        { desktop: '#btnProdList', mobile: '#mobCardProdList' },
    'attend.do':            { desktop: '#ddAttendDo', mobile: '#mobCardAttendDo' },
    'attend.summary':       { desktop: '#ddAttendSummary', mobile: '#mobCardAttendSummary' },
    'attend.visit_log':     { desktop: '#ddVisitLog', mobile: '#mobCardVisitLog' },
    'attend.visit_schedule':{ desktop: '#ddVisitSchedule', mobile: '#mobCardVisitSchedule' },
    'attend.nearby_dentists':{ desktop: '#ddNearbyDentists', mobile: '#mobCardNearbyDentists' },
    'results.daily_report': { desktop: '#ddDailyReport', mobile: '#mobCardDailyReport' },
    'results.dashboard':    { desktop: '#ddSalesDashboard', mobile: '#mobCardSalesDashboard' },
    'results.combined_report': { desktop: '#ddCombinedReport', mobile: '#mobCardCombinedReport' },
    'results.ar_aging':        { desktop: '#ddArAging', mobile: '#mobCardArAging' },
    'results.borrow_control':  { desktop: '#ddBorrowControl', mobile: '#mobCardBorrowControl' }
  };
  Object.keys(subMap).forEach(function(sk) {
    if (_isMenuEnabled(sk)) return;
    var m = subMap[sk];
    if (m.desktop) { var el = document.querySelector(m.desktop); if (el) el.style.display = 'none'; }
    if (m.mobile) { var el = document.querySelector(m.mobile); if (el) el.style.display = 'none'; }
  });
  // 하위 그룹: 모든 자식 비활성 시 그룹도 숨김
  var grpCheck = {
    'ddGroupQuote': ['quote.new','quote.pending','quote.done'],
    'ddGroupOrder': ['order.new','order.pending','order.history','order.consign'],
    'ddGroupDemo':  ['demo.request','demo.return','demo.status'],
    'mobOrderCatQuote': ['quote.new','quote.pending','quote.done'],
    'mobOrderCatOrder': ['order.new','order.pending','order.history','order.consign'],
    'mobOrderCatDemo':  ['demo.request','demo.return','demo.status'],
    'mobRegCatCustomer': ['customer.register','customer.approve','customer.appr_result','customer.info_search','customer.list'],
    'mobRegCatProduct':  ['prod_reg.register','prod_reg.approve','prod_reg.list']
  };
  Object.keys(grpCheck).forEach(function(gid) {
    var anyEnabled = grpCheck[gid].some(function(k) { return _isMenuEnabled(k); });
    if (!anyEnabled) { var el = document.getElementById(gid); if (el) el.style.display = 'none'; }
  });
}

// Firestore에서 최신 권한 가져와 세션 갱신
function _syncUserPermsFromFirestore(user) {
  if (!user || !user.empid) return;
  _fbDb.collection('accounts').doc(user.empid).get().then(function(doc) {
    if (!doc.exists) return;
    var latest = doc.data();
    var latestPerms = latest.permissions || [];
    var currentPerms = user.permissions || [];
    // 권한이 변경되었으면 세션 갱신 + UI 재적용
    if (JSON.stringify(latestPerms.sort()) !== JSON.stringify(currentPerms.sort())) {
      user.permissions = latestPerms;
      user.role = latest.role || user.role;
      setCurrentUser(user);
      applyUserUI(user);
    }
  }).catch(function() {});
}

function applyUserUI(user) {
  document.getElementById('userAvatar').textContent = user.name.charAt(0);
  document.getElementById('userName').textContent   = user.name + ' (' + user.empid + ')';
  var deptLabel = user.dept + (user.sub_dept ? ' / ' + user.sub_dept : ''); // 계정 설정 등에서 활용

  // ── 권한 기반 선별 데이터 로드 ──────────────────────────────────────────
  // 메뉴 접근 권한 없는 사용자(예: messenger-only)는 customer/product/price FULL 을 건너뜀.
  // 실제 해당 페이지를 열 때 lazy 로드되므로 기능에는 영향 없음.
  const isAdmin = _isAdmin(user);
  const perms   = _ensurePermArray(user.permissions);
  // 고객 데이터가 필요한 권한 (고객 목록/승인/검색, 주문·견적·배송·입출고·수금·실적 등 거의 모든 업무)
  var _CUST_PERMS = ['cust_list','cust_reg','cust_appr_result','cust_info_search',
                     'order','quote','pending','delivery','shipped','tracking',
                     'results','results_approve','consign_status','consign_status_approve',
                     'target','target_approve','demo','ar'];
  // 상품/가격 데이터가 필요한 권한 (주문 작성, 상품 관리, 견적)
  var _PROD_PERMS = ['order','quote','pending','prod_reg','prod_list','prod_approve',
                     'demo','results','results_approve'];
  var needsCustomer = isAdmin || perms.some(function(p) { return _CUST_PERMS.indexOf(p) >= 0; });
  var needsProducts = isAdmin || perms.some(function(p) { return _PROD_PERMS.indexOf(p) >= 0; });

  // ── 데이터 로드는 메인 스레드에서 분리하여 비블로킹으로 처리 ──
  // 스플래시/로그인 UI 전환(_hideLoginShow)이 먼저 완료되도록 setTimeout(0)으로 지연.
  // 아래 함수들은 원래부터 비동기지만, onSnapshot/get 호출 자체가 동기 단계에서
  // Firestore SDK를 초기화하며 수십~수백 ms를 소비할 수 있어 메인 스레드에서 분리.
  setTimeout(function() {
    try {
      if (needsCustomer) {
        loadCustomerData(); // 로그인 후 최신 고객 데이터 로드
      } else {
        console.log('[applyUserUI] 권한 부족 → customer 데이터 로드 스킵 (' + user.empid + ')');
      }
      if (needsProducts) {
        _loadProductPrices(); // 로그인 후 상품 가격 데이터 로드
        _mergeApprovedProducts(); // 승인된 상품을 ITEM_DATA에 병합
      } else {
        console.log('[applyUserUI] 권한 부족 → product/price 데이터 로드 스킵 (' + user.empid + ')');
      }
      _syncUserPermsFromFirestore(user); // 최신 권한 동기화 (항상 실행)
    } catch (e) { console.warn('[applyUserUI] deferred data load error:', e); }
  }, 0);

  // ── 메뉴 권한 적용 ────────────────────────────────────────────────────────
  // HARDCODED_ADMINS 또는 role==='admin' 만 관리자 처리 (신규 가입자 기본 차단)
  console.log('[applyUserUI]', user.empid, 'isAdmin:', isAdmin, 'role:', user.role, 'perms:', JSON.stringify(perms), 'raw:', typeof user.permissions, user.permissions);
  const menuMap = {
    register: '.btn-register-wrap',
    ordertop: '.btn-ordertop-wrap',
    ship:     '.btn-ship-wrap',
    results:  '.btn-report-wrap',
    messenger: '.btn-messenger-wrap',
    prod_reg: '.btn-prod-reg-wrap'
  };
  Object.keys(menuMap).forEach(function(key) {
    var btn = document.querySelector(menuMap[key]);
    if (!btn) return;
    var hasAccess = isAdmin || perms.includes(key);
    // ordertop 드롭다운은 quote, order, pending, results, demo 중 하나라도 있으면 표시
    if (key === 'ordertop') hasAccess = hasAccess || perms.includes('quote') || perms.includes('order') || perms.includes('pending') || perms.includes('results') || perms.includes('demo');
    // ship 드롭다운은 delivery, shipped, tracking 중 하나라도 있으면 표시
    if (key === 'ship') hasAccess = hasAccess || perms.includes('delivery') || perms.includes('shipped') || perms.includes('tracking');
    // results(리포트) 드롭다운은 results, consign_status, target 또는 _approve 중 하나라도 있으면 표시
    if (key === 'results') hasAccess = hasAccess || perms.includes('consign_status') || perms.includes('target') || perms.includes('results_approve') || perms.includes('consign_status_approve') || perms.includes('target_approve') || perms.includes('daily_report') || perms.includes('sales_dashboard') || perms.includes('borrow_control');
    if (hasAccess) {
      btn.classList.remove('perm-hidden');
    } else {
      btn.classList.add('perm-hidden');
    }
  });
  // 고객 리스트: 관리자 또는 cust_list 권한
  var btnCustList = document.getElementById('btnCustList');
  if (btnCustList) {
    if (isAdmin || perms.includes('cust_list')) btnCustList.classList.remove('perm-hidden');
    else btnCustList.classList.add('perm-hidden');
  }
  // 고객 승인 결과 조회: 관리자 또는 cust_appr_result 권한
  var btnCustApprResult = document.getElementById('btnCustApprResult');
  if (btnCustApprResult) {
    if (isAdmin || perms.includes('cust_appr_result')) btnCustApprResult.classList.remove('perm-hidden');
    else btnCustApprResult.classList.add('perm-hidden');
  }
  // 모바일 승인 결과 조회
  var mobCardCustApprResult = document.getElementById('mobCardCustApprResult');
  if (mobCardCustApprResult) {
    mobCardCustApprResult.style.display = (isAdmin || perms.includes('cust_appr_result')) ? '' : 'none';
  }
  // 고객 정보 찾기: 관리자 또는 cust_info_search 권한
  var btnCustInfoSearch = document.getElementById('btnCustInfoSearch');
  if (btnCustInfoSearch) {
    if (isAdmin || perms.includes('cust_info_search')) btnCustInfoSearch.classList.remove('perm-hidden');
    else btnCustInfoSearch.classList.add('perm-hidden');
  }
  var mobCardCustInfoSearch = document.getElementById('mobCardCustInfoSearch');
  if (mobCardCustInfoSearch) {
    mobCardCustInfoSearch.style.display = (isAdmin || perms.includes('cust_info_search')) ? '' : 'none';
  }
  // 위탁 출고 현황: 메뉴 제외 (2026-04-24, 추후 재연결 시 아래 원본 로직 복구)
  var ddConsignStatus = document.getElementById('ddConsignStatus');
  if (ddConsignStatus) {
    ddConsignStatus.classList.add('perm-hidden');
    // 원본 로직 (복구 시 주석 해제하고 위 classList.add 삭제):
    // if (isAdmin || perms.includes('consign_status') || perms.includes('consign_status_approve')) ddConsignStatus.classList.remove('perm-hidden');
    // else ddConsignStatus.classList.add('perm-hidden');
  }
  // 배송 주소 버튼: order 권한이 있으면 표시
  var btnShipAddr = document.getElementById('btnShipAddr');
  if (btnShipAddr) {
    if (isAdmin || perms.includes('order') || perms.includes('pending')) btnShipAddr.classList.remove('perm-hidden');
    else btnShipAddr.classList.add('perm-hidden');
  }
  // 견적 서브아이템 권한
  var _quoteSubPerm = isAdmin || perms.includes('quote');
  ['ddQuoteNew','ddQuotePending','ddQuoteDone'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) { if (_quoteSubPerm) el.classList.remove('perm-hidden'); else el.classList.add('perm-hidden'); }
  });
  // 상품 주문 서브아이템 권한
  var _orderSubPerm = isAdmin || perms.includes('order') || perms.includes('pending') || perms.includes('results');
  var ddOrderNew = document.getElementById('ddOrderNew');
  if (ddOrderNew) { if (isAdmin || perms.includes('order')) ddOrderNew.classList.remove('perm-hidden'); else ddOrderNew.classList.add('perm-hidden'); }
  var ddOrderPending = document.getElementById('ddOrderPending');
  if (ddOrderPending) { if (isAdmin || perms.includes('pending') || perms.includes('order')) ddOrderPending.classList.remove('perm-hidden'); else ddOrderPending.classList.add('perm-hidden'); }
  var ddOrderHistory = document.getElementById('ddOrderHistory');
  if (ddOrderHistory) { if (isAdmin || perms.includes('results') || perms.includes('results_approve') || perms.includes('order')) ddOrderHistory.classList.remove('perm-hidden'); else ddOrderHistory.classList.add('perm-hidden'); }
  var mobOrderHistory = document.getElementById('mobCardOrderHistory');
  if (mobOrderHistory) { if (isAdmin || perms.includes('results') || perms.includes('results_approve') || perms.includes('order')) mobOrderHistory.style.display = ''; else mobOrderHistory.style.display = 'none'; }
  // 데모 서브아이템 권한
  var _demoSubPerm = isAdmin || perms.includes('demo');
  ['ddDemoRequest','ddDemoReturn','ddDemoStatus'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) { if (_demoSubPerm) el.classList.remove('perm-hidden'); else el.classList.add('perm-hidden'); }
  });
  // 견적 그룹: 하위 권한 중 하나라도 있으면 표시
  var ddGroupQuote = document.getElementById('ddGroupQuote');
  if (ddGroupQuote) ddGroupQuote.style.display = _quoteSubPerm ? '' : 'none';
  // 상품 주문 그룹: 하위 권한 중 하나라도 있으면 표시
  var ddGroupOrder = document.getElementById('ddGroupOrder');
  if (ddGroupOrder) ddGroupOrder.style.display = _orderSubPerm ? '' : 'none';
  // 데모 그룹: 하위 권한 중 하나라도 있으면 표시
  var ddGroupDemo = document.getElementById('ddGroupDemo');
  if (ddGroupDemo) ddGroupDemo.style.display = _demoSubPerm ? '' : 'none';
  // 고객 등록(신규): 관리자 또는 register 권한
  var btnRegCustDD = document.getElementById('btnRegCustDD');
  if (btnRegCustDD) {
    if (isAdmin || perms.includes('register')) btnRegCustDD.classList.remove('perm-hidden');
    else btnRegCustDD.classList.add('perm-hidden');
  }
  // 상품 등록: 관리자 또는 prod_reg 권한
  var btnProdRegDD = document.getElementById('btnProdRegDD');
  if (btnProdRegDD) {
    if (isAdmin || perms.includes('prod_reg')) btnProdRegDD.classList.remove('perm-hidden');
    else btnProdRegDD.classList.add('perm-hidden');
  }
  // 상품 승인: 관리자 또는 prod_approve 권한
  var btnPendProdDD = document.getElementById('btnPendProdDD');
  if (btnPendProdDD) {
    if (isAdmin || perms.includes('prod_approve')) btnPendProdDD.classList.remove('perm-hidden');
    else btnPendProdDD.classList.add('perm-hidden');
  }
  // 상품 리스트: 관리자 또는 prod_list 권한
  var btnProdList = document.getElementById('btnProdList');
  if (btnProdList) {
    if (isAdmin || perms.includes('prod_list')) btnProdList.classList.remove('perm-hidden');
    else btnProdList.classList.add('perm-hidden');
  }
  // 고객 그룹: 하위(register, cust_list, approve_cust) 중 하나라도 있으면 표시
  var ddGroupCustomer = document.getElementById('ddGroupCustomer');
  if (ddGroupCustomer) {
    var hasCustPerm = isAdmin || perms.includes('register') || perms.includes('cust_list') || perms.includes('approve_cust') || perms.includes('cust_appr_result') || perms.includes('cust_info_search');
    ddGroupCustomer.style.display = hasCustPerm ? '' : 'none';
  }
  // 상품 그룹: 하위(prod_reg, prod_approve, prod_list) 중 하나라도 있으면 표시
  var ddGroupProduct = document.getElementById('ddGroupProduct');
  if (ddGroupProduct) {
    var hasProdPerm = isAdmin || perms.includes('prod_reg') || perms.includes('prod_approve') || perms.includes('prod_list');
    ddGroupProduct.style.display = hasProdPerm ? '' : 'none';
  }
  // register 드롭다운: 고객 또는 상품 하위 권한 중 하나라도 있으면 표시
  var regWrap = document.querySelector('.btn-register-wrap');
  if (regWrap) {
    var hasAnyRegPerm = isAdmin || perms.includes('register') || perms.includes('cust_list') || perms.includes('approve_cust') || perms.includes('cust_appr_result') || perms.includes('cust_info_search') || perms.includes('prod_reg') || perms.includes('prod_approve') || perms.includes('prod_list');
    if (hasAnyRegPerm) regWrap.classList.remove('perm-hidden');
    else regWrap.classList.add('perm-hidden');
  }
  // 고객 검색 영역: 관리자 또는 search 권한 보유 시 표시
  var custSearchArea = document.getElementById('custSearchArea');
  if (custSearchArea) custSearchArea.style.display = (isAdmin || perms.includes('search')) ? '' : 'none';

  // 출퇴근 버튼: attend 권한 또는 관리자
  var canAttend = isAdmin || perms.includes('attend') || perms.includes('attend_summary') || perms.includes('fuel_price');
  var btnAttend = document.getElementById('btnAttend');
  if (btnAttend) btnAttend.style.display = canAttend ? '' : 'none';
  // 출퇴근 하기: attend 권한
  var ddAttDo = document.getElementById('ddAttendDo');
  if (ddAttDo) ddAttDo.style.display = (isAdmin || perms.includes('attend')) ? '' : 'none';
  var mobAttDo = document.getElementById('mobCardAttendDo');
  if (mobAttDo) mobAttDo.style.display = (isAdmin || perms.includes('attend')) ? '' : 'none';
  // 출퇴근 집계: attend_summary 권한
  var ddAttSum = document.getElementById('ddAttendSummary');
  if (ddAttSum) ddAttSum.style.display = (isAdmin || perms.includes('attend_summary')) ? '' : 'none';
  var mobAttSum = document.getElementById('mobCardAttendSummary');
  if (mobAttSum) mobAttSum.style.display = (isAdmin || perms.includes('attend_summary')) ? '' : 'none';
  // 주유 가격: fuel_price 권한
  var ddFuel = document.getElementById('ddFuelPrice');
  if (ddFuel) ddFuel.style.display = (isAdmin || perms.includes('fuel_price')) ? '' : 'none';
  var mobFuel = document.getElementById('mobCardFuelPrice');
  if (mobFuel) mobFuel.style.display = (isAdmin || perms.includes('fuel_price')) ? '' : 'none';

  // ── 비용 정산 메뉴 ──
  var canExpense = isAdmin || perms.includes('receipt') || perms.includes('receipt_admin');
  var btnExpDD = document.getElementById('btnExpenseDD');
  if (btnExpDD) { btnExpDD.style.display = canExpense ? '' : 'none'; btnExpDD.classList.toggle('perm-hidden', !canExpense); }
  var ddReceipt = document.getElementById('ddReceiptSubmit');
  if (ddReceipt) { ddReceipt.style.display = (isAdmin || perms.includes('receipt')) ? '' : 'none'; ddReceipt.classList.toggle('perm-hidden', !(isAdmin || perms.includes('receipt'))); }
  var ddReceiptAdmin = document.getElementById('ddReceiptAdmin');
  var canReceiptAdmin = isAdmin || perms.includes('receipt_admin');
  if (ddReceiptAdmin) { ddReceiptAdmin.style.display = canReceiptAdmin ? '' : 'none'; ddReceiptAdmin.classList.toggle('perm-hidden', !canReceiptAdmin); }
  var mobExpense = document.getElementById('mobCatExpense');
  if (mobExpense) mobExpense.style.display = canExpense ? '' : 'none';
  var mobReceipt = document.getElementById('mobCardReceipt');
  if (mobReceipt) mobReceipt.style.display = (isAdmin || perms.includes('receipt')) ? '' : 'none';
  var mobReceiptAdmin = document.getElementById('mobCardReceiptAdmin');
  if (mobReceiptAdmin) { mobReceiptAdmin.style.display = canReceiptAdmin ? '' : 'none'; mobReceiptAdmin.classList.toggle('perm-hidden', !canReceiptAdmin); }

  // ── 매출/수금 현황 (리포트 하위) ──
  var canTarget = isAdmin || perms.includes('target') || perms.includes('target_approve');
  var ddTargetView = document.getElementById('ddTargetView');
  if (ddTargetView) { ddTargetView.style.display = canTarget ? '' : 'none'; ddTargetView.classList.toggle('perm-hidden', !canTarget); }
  var mobCardTarget = document.getElementById('mobCardTargetView');
  if (mobCardTarget) { mobCardTarget.style.display = canTarget ? '' : 'none'; }

  // ── 일일 업무 보고 (리포트 하위) ──
  var canDailyReport = isAdmin || perms.includes('daily_report');
  var ddDailyReport = document.getElementById('ddDailyReport');
  if (ddDailyReport) { ddDailyReport.style.display = canDailyReport ? '' : 'none'; ddDailyReport.classList.toggle('perm-hidden', !canDailyReport); }
  var mobDailyReport = document.getElementById('mobCardDailyReport');
  if (mobDailyReport) { mobDailyReport.style.display = canDailyReport ? '' : 'none'; mobDailyReport.classList.toggle('perm-hidden', !canDailyReport); }
  // ── 영업 실적 대시보드 (리포트 하위) ──
  var canDashboard = isAdmin || perms.includes('sales_dashboard');
  var ddDashboard = document.getElementById('ddSalesDashboard');
  if (ddDashboard) { ddDashboard.style.display = canDashboard ? '' : 'none'; ddDashboard.classList.toggle('perm-hidden', !canDashboard); }
  var mobDashboard = document.getElementById('mobCardSalesDashboard');
  if (mobDashboard) { mobDashboard.style.display = canDashboard ? '' : 'none'; mobDashboard.classList.toggle('perm-hidden', !canDashboard); }
  // ── Borrow Control (리포트 하위) ──
  var canBorrowControl = isAdmin || perms.includes('borrow_control');
  var ddBorrowControl = document.getElementById('ddBorrowControl');
  if (ddBorrowControl) { ddBorrowControl.style.display = canBorrowControl ? '' : 'none'; ddBorrowControl.classList.toggle('perm-hidden', !canBorrowControl); }
  var mobBorrowControl = document.getElementById('mobCardBorrowControl');
  if (mobBorrowControl) { mobBorrowControl.style.display = canBorrowControl ? '' : 'none'; mobBorrowControl.classList.toggle('perm-hidden', !canBorrowControl); }
  // ── 방문 일지 (출퇴근 하위) ──
  var canVisitLog = isAdmin || perms.includes('visit_log');
  var ddVisitLog = document.getElementById('ddVisitLog');
  if (ddVisitLog) { ddVisitLog.style.display = canVisitLog ? '' : 'none'; ddVisitLog.classList.toggle('perm-hidden', !canVisitLog); }
  var mobVisitLog = document.getElementById('mobCardVisitLog');
  if (mobVisitLog) { mobVisitLog.style.display = canVisitLog ? '' : 'none'; mobVisitLog.classList.toggle('perm-hidden', !canVisitLog); }
  // ── 방문 스케줄 (출퇴근 하위) ──
  var canVisitSched = isAdmin || perms.includes('visit_schedule');
  var ddVisitSched = document.getElementById('ddVisitSchedule');
  if (ddVisitSched) { ddVisitSched.style.display = canVisitSched ? '' : 'none'; ddVisitSched.classList.toggle('perm-hidden', !canVisitSched); }
  var mobVisitSched = document.getElementById('mobCardVisitSchedule');
  if (mobVisitSched) { mobVisitSched.style.display = canVisitSched ? '' : 'none'; mobVisitSched.classList.toggle('perm-hidden', !canVisitSched); }
  // ── 내 주변 치과 (출퇴근 하위) ──
  var canNearbyDentists = isAdmin || perms.includes('nearby_dentists');
  var ddNearbyDentists = document.getElementById('ddNearbyDentists');
  if (ddNearbyDentists) { ddNearbyDentists.style.display = canNearbyDentists ? '' : 'none'; ddNearbyDentists.classList.toggle('perm-hidden', !canNearbyDentists); }
  var mobNearbyDentists = document.getElementById('mobCardNearbyDentists');
  if (mobNearbyDentists) { mobNearbyDentists.style.display = canNearbyDentists ? '' : 'none'; mobNearbyDentists.classList.toggle('perm-hidden', !canNearbyDentists); }

  // 계정 관리 버튼: 관리자만 표시
  var acctMgmtBtn = document.querySelector('.btn-acct-mgmt');
  if (acctMgmtBtn) acctMgmtBtn.style.display = isAdmin ? '' : 'none';

  // 메뉴 설정 버튼: 관리자만 표시
  var btnMenuCfg = document.getElementById('btnMenuConfig');
  if (btnMenuCfg) btnMenuCfg.style.display = isAdmin ? '' : 'none';

  // System 드롭다운: 관리자만 표시
  var sysDD = document.getElementById('btnSystemDD');
  if (sysDD) { if (isAdmin) sysDD.classList.remove('perm-hidden'); else sysDD.classList.add('perm-hidden'); }
  var sysAcct = document.getElementById('sysAcctMgmt');
  if (sysAcct) { if (isAdmin) sysAcct.classList.remove('perm-hidden'); else sysAcct.classList.add('perm-hidden'); }
  var sysMenu = document.getElementById('sysMenuConfig');
  if (sysMenu) { if (isAdmin) sysMenu.classList.remove('perm-hidden'); else sysMenu.classList.add('perm-hidden'); }
  var sysPopup = document.getElementById('sysPopupMgmt');
  if (sysPopup) { if (isAdmin) sysPopup.classList.remove('perm-hidden'); else sysPopup.classList.add('perm-hidden'); }
  var sysSync = document.getElementById('sysSyncMonitor');
  if (sysSync) { if (isAdmin) sysSync.classList.remove('perm-hidden'); else sysSync.classList.add('perm-hidden'); }

  // 글로벌 메뉴 설정 로드 및 적용
  loadMenuConfig().then(function() { _applyMenuConfig(); });

  // 대기 고객 버튼: 관리자 또는 approver 역할 또는 approve_cust 권한
  var pendBtn = document.getElementById('btnPendCustMgmt');
  var canApproveCust = isAdmin || user.role === 'approver' || perms.includes('approve_cust');
  if (pendBtn) pendBtn.style.display = canApproveCust ? '' : 'none';
  var pendDD = document.getElementById('btnPendCustDD');
  if (pendDD) {
    if (canApproveCust) pendDD.classList.remove('perm-hidden');
    else pendDD.classList.add('perm-hidden');
  }
  // 로그인 시 대기 고객 수 비동기 로드
  // 관리자/Office: 전체 승인 대기, 그 외(Sales 포함): 본인이 올린 건만
  var _scopedForBadge = user && _isScopedUser(user);
  if (_scopedForBadge && user && user.empid) {
    // Sales: 서버 필터로 본인 건만 → Firestore 읽기 수 대폭 절감
    var _qA = _fbDb.collection('pendingCustomers').where('status','==','Pending').where('created_by','==', user.empid).get().catch(function(){ return { docs: [] }; });
    var _qB = _fbDb.collection('pendingCustomers').where('status','==','Pending').where('reg_by','==', user.empid).get().catch(function(){ return { docs: [] }; });
    Promise.all([_qA, _qB]).then(function(rs) {
      var seen = {}, cnt = 0;
      rs.forEach(function(r){
        (r.docs || []).forEach(function(d){
          if (!seen[d.id]) { seen[d.id] = true; cnt++; }
        });
      });
      updatePendCustBadge(cnt);
    }).catch(function(){ updatePendCustBadge(0); });
  } else {
    _fbDb.collection('pendingCustomers').where('status','==','Pending').get()
      .then(function(snap){ updatePendCustBadge(snap.size); })
      .catch(function(){});
  }
  // 로그인 시 대기 상품 배지 로드
  if (typeof _updatePendProdBadge === 'function') _updatePendProdBadge();

  // 전체 알림 버튼: 관리자만 표시
  var bcBtn = document.getElementById('btnBroadcast');
  if (bcBtn) bcBtn.style.display = isAdmin ? '' : 'none';

  // 온라인 접속자 시스템 시작
  // - _goOnline(): 모든 사용자가 자신의 presence 를 기록 (관리자가 확인할 수 있도록)
  // - _listenPresence() / 접속자 패널 UI: 관리자 전용
  _goOnline();
  var _onlineWrapEl = document.getElementById('onlineWrap');
  if (_onlineWrapEl) _onlineWrapEl.style.display = isAdmin ? '' : 'none';
  if (isAdmin) {
    _listenPresence();
  }
  _listenBroadcasts();
  // 로그인 시 읽지 않은 공지사항 표시 (1초 딜레이)
  setTimeout(function(){ _checkUnreadAnnouncements(); }, 1000);

  // 접근 가능한 메뉴가 하나도 없으면 안내 메시지 표시
  var hasAnyMenu = isAdmin || Object.keys(menuMap).some(function(k){ return perms.includes(k); }) || perms.includes('search') || perms.includes('quote') || perms.includes('pending') || perms.includes('results') || perms.includes('delivery') || perms.includes('shipped') || perms.includes('tracking') || perms.includes('prod_reg') || perms.includes('prod_approve') || perms.includes('prod_list') || perms.includes('cust_appr_result') || perms.includes('cust_info_search') || perms.includes('messenger') || perms.includes('demo') || perms.includes('attend') || perms.includes('attend_summary') || perms.includes('fuel_price') || perms.includes('expense') || perms.includes('receipt') || perms.includes('receipt_admin') || perms.includes('target') || perms.includes('target_approve') || perms.includes('consign_status') || perms.includes('consign_status_approve') || perms.length > 0;
  var noPermMsg = document.getElementById('noPermMsg');
  if (noPermMsg) noPermMsg.style.display = hasAnyMenu ? 'none' : 'flex';

  // ── 모바일 메뉴 권한 적용 ─────────────────────────────────────────────────
  var canSearch   = isAdmin || perms.includes('search');
  var canRegister = isAdmin || perms.includes('register');
  var canQuote    = isAdmin || perms.includes('quote');
  var canOrder    = isAdmin || perms.includes('order');
  var canPending  = isAdmin || perms.includes('pending');
  var canDelivery = isAdmin || perms.includes('delivery');
  var canShipped  = isAdmin || perms.includes('shipped');
  var canTracking = isAdmin || perms.includes('tracking');
  var canResults  = isAdmin || perms.includes('results') || perms.includes('results_approve');
  var canDemo     = isAdmin || perms.includes('demo');

  // 모바일 홈 그리드: 접근 가능한 메뉴가 있을 때만 표시
  var mobileHome = document.getElementById('mobileHome');
  if (mobileHome) mobileHome.style.display = hasAnyMenu ? 'block' : 'none';

  // 모바일 하단 네비게이션 표시 여부
  var mobileBottomNav = document.getElementById('mobileBottomNav');
  if (mobileBottomNav) mobileBottomNav.style.display = hasAnyMenu ? 'block' : 'none';

  // 모바일 상위 카테고리 카드 권한
  var canCustList  = isAdmin || perms.includes('cust_list');
  var canMessenger = isAdmin || perms.includes('messenger');
  var mobCats = {
    mobCatCust:      canRegister || canSearch || canCustList || canApproveCust || (isAdmin || perms.includes('cust_appr_result')) || (isAdmin || perms.includes('cust_info_search')) || (isAdmin || perms.includes('prod_reg')) || (isAdmin || perms.includes('prod_approve')) || (isAdmin || perms.includes('prod_list')),
    mobCatOrder:     canQuote || canOrder || canPending || canResults || (isAdmin || perms.includes('demo')),
    mobCatShip:      canDelivery || canShipped || canTracking,
    mobCatReport:    canResults || canTarget, // consign_status 제외 (2026-04-24)
    mobCatAttend:    canAttend,
    mobCatAcct:      true,
    mobCatSystem:    isAdmin
  };
  Object.keys(mobCats).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = mobCats[id] ? '' : 'none';
  });

  // 모바일 서브메뉴 카드 권한
  var mobCards = {
    mobRegCatCustomer: canRegister || canSearch || canCustList || canApproveCust || (isAdmin || perms.includes('cust_appr_result')) || (isAdmin || perms.includes('cust_info_search')),
    mobRegCatProduct:  isAdmin || perms.includes('prod_reg') || perms.includes('prod_approve') || perms.includes('prod_list'),
    mobCardRegister: canRegister,
    mobCardPendCust: canApproveCust,
    mobCardSearch:   canSearch,
    mobCardCustList: canCustList,
    mobCardProdReg:  isAdmin || perms.includes('prod_reg'),
    mobCardPendProd: isAdmin || perms.includes('prod_approve'),
    mobCardProdList: isAdmin || perms.includes('prod_list'),
    mobCardQuote:    canQuote,
    mobCardQtList:   canQuote,
    mobCardQtDone:   canQuote,
    mobCardOrder:    canOrder || canPending || canResults,
    mobCardPending:  canOrder || canPending,
    mobCardShipReport: canResults,
    mobCardConsignStatus: false, // 메뉴 제외 (2026-04-24, 원본: isAdmin || perms.includes('consign_status') || perms.includes('consign_status_approve'))
    mobCardDemoRequest: canDemo,
    mobCardDemoReturn:  canDemo,
    mobCardDemoStatus:  canDemo,
    mobOrderCatQuote:   canQuote,
    mobOrderCatOrder:   canOrder || canPending,
    mobOrderCatDemo:    canDemo,
    mobCardDelivery: canDelivery,
    mobCardShipped:  canShipped,
    mobCardTracking: canTracking,
    mobCardShipHistory: canDelivery || canShipped
  };
  Object.keys(mobCards).forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.display = mobCards[id] ? '' : 'none';
  });

  // 하단 네비 버튼 권한
  var mobNavMessenger = document.getElementById('mobNavMessenger');
  if (mobNavMessenger) mobNavMessenger.style.display = canMessenger ? '' : 'none';

  const testBtn = document.getElementById('btnNotifyTest');
  if (user.dept === 'Office') {
    requestNotificationPermission(); // Office 로그인 시 알림 권한 요청
    registerFCMToken(); // FCM 토큰 등록
    if (testBtn) testBtn.style.display = 'inline-block';
  } else {
    if (testBtn) testBtn.style.display = 'none';
  }

  // 효과음 버튼: 모든 사용자 표시
  const soundFxBtn = document.getElementById('btnSoundFx');
  if (soundFxBtn) soundFxBtn.style.display = 'inline-flex';

  // 뷰 모드 드롭다운: 관리자만 표시
  const viewModeWrap = document.getElementById('viewModeWrap');
  if (viewModeWrap) viewModeWrap.style.display = isAdmin ? 'inline-block' : 'none';

  // Firestore 연결 상태 표시
  _setFirestoreConnStatus(true);

  // 푸시 알림 딥링크: URL 파라미터로 주문 자동 이동
  try {
    var urlParams = new URLSearchParams(window.location.search);
    var notifOrder = urlParams.get('notifOrder');
    var notifType  = urlParams.get('notifType');
    if (notifOrder) {
      // URL 파라미터 제거 (뒤로가기 시 재실행 방지)
      window.history.replaceState({}, '', window.location.pathname);
      // '__list__' 는 orderId 없이 메뉴만 여는 플래그
      _notifNavigateOrderId = (notifOrder === '__list__') ? '' : String(notifOrder);
      _notifNavigateType = notifType || '';
      setTimeout(function() {
        try {
          if (notifType === 'new_order' || notifType === 'cancel_request' || notifType === 'new_quote') {
            openPendingOrders();
          } else if (notifType === 'ready_to_ship' || _notifNavigateType === 'shipping') {
            if (typeof openDeliveryOrders === 'function') openDeliveryOrders();
            else openPendingOrders();
          } else if (_notifNavigateType === 'done' || _notifNavigateType === 'delivered') {
            if (typeof openShippedOrders === 'function') openShippedOrders();
            else openPendingOrders();
          } else {
            openPendingOrders();
          }
        } catch(_){}
      }, 500);
    }

    // 포그라운드 알림 폴백용 전역 핸들러: sw 미등록 or iOS 등 환경에서
    // _fallbackClick 에서 직접 호출됨 (URL 변경 없이 메뉴만 전환)
    window._handleNotifDeepLink = function(orderId, nType) {
      try {
        _notifNavigateOrderId = (orderId && orderId !== '__list__') ? String(orderId) : '';
        _notifNavigateType = nType || '';
        if (nType === 'new_order' || nType === 'cancel_request' || nType === 'new_quote') {
          openPendingOrders();
        } else if (nType === 'ready_to_ship' || nType === 'shipping') {
          if (typeof openDeliveryOrders === 'function') openDeliveryOrders();
          else openPendingOrders();
        } else if (nType === 'done' || nType === 'delivered') {
          if (typeof openShippedOrders === 'function') openShippedOrders();
          else openPendingOrders();
        } else {
          openPendingOrders();
        }
      } catch(_){}
    };
  } catch(e) {}

  // ── 채팅 리스너 시작 & 미읽은 메시지 확인 ──
  _startChatListener();
  setTimeout(function() { _checkUnreadChats(); }, 2000);

  // ── 신규 가입자: 권한 없으면 안내 화면 표시 ──
  // Close 누르면 _noPermDismissed=true → 같은 세션에서 다시 표시하지 않음
  // 새로 로그인하면 _noPermDismissed가 리셋되므로 다시 표시됨
  var noPermOverlay = document.getElementById('noPermOverlay');
  if (noPermOverlay) {
    if (!isAdmin && !hasAnyMenu) {
      // 유저가 닫기를 누르지 않았으면 표시 유지
      if (!window._noPermDismissed) {
        noPermOverlay.style.display = 'flex';
        var descEl = document.getElementById('noPermDesc');
        if (descEl) descEl.innerHTML = t('noperm_desc');
      }
    } else {
      // 권한이 생겼으면 오버레이 숨기고 플래그도 리셋
      noPermOverlay.style.display = 'none';
      window._noPermDismissed = false;
    }
  }
}

// ── 관리자 모바일 미리보기 토글 ──────────────────────────────────────────────
// transform: translateX(-50%) 가 적용된 #phonePreviewWrapper 안으로
// 주요 요소를 이동 → 내부 position:fixed 자식이 컨테이너 기준 배치됨
/* ── 효과음 토글 ── */
var _soundFxEnabled = false;
var _sfxAudioCtx = null;

function toggleSoundFx() {
  _soundFxEnabled = !_soundFxEnabled;
  var btns = [document.getElementById('btnSoundFx'), document.getElementById('btnSoundFxMob')];
  btns.forEach(function(btn) {
    if (!btn) return;
    if (_soundFxEnabled) {
      btn.classList.add('active');
      btn.innerHTML = '🔊 효과음';
    } else {
      btn.classList.remove('active');
      btn.innerHTML = '🔇 효과음';
    }
  });
  if (_soundFxEnabled) {
    if (!_sfxAudioCtx) _sfxAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    playClickSound();
  }
}

function playClickSound() {
  if (!_soundFxEnabled || !_sfxAudioCtx) return;
  var ctx = _sfxAudioCtx;
  if (ctx.state === 'suspended') ctx.resume();
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.18, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}

function playCloseSound() {
  if (!_soundFxEnabled || !_sfxAudioCtx) return;
  var ctx = _sfxAudioCtx;
  if (ctx.state === 'suspended') ctx.resume();
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}

(function initSoundFxListeners() {
  document.addEventListener('click', function(e) {
    if (!_soundFxEnabled) return;
    var el = e.target.closest(
      '.header-btn-group button, .quote-dd-item, .order-dd-item, .ship-dd-item, ' +
      '.mob-card, .mob-bottom-tab, .btn-register, .btn-results'
    );
    if (el) playClickSound();
  }, true);
})();

var _phoneViewActive = false;
var _currentViewMode = 'desktop'; // 'desktop' | 'tablet' | 'mobile'

function toggleViewModeDD() {
  var dd = document.getElementById('viewModeDDList');
  dd.classList.toggle('open');
  // 외부 클릭 시 닫기
  if (dd.classList.contains('open')) {
    setTimeout(function() {
      document.addEventListener('click', _closeViewModeDDOutside, { once: true });
    }, 0);
  }
}
function _closeViewModeDDOutside(e) {
  var wrap = document.getElementById('viewModeWrap');
  var dd = document.getElementById('viewModeDDList');
  if (wrap && !wrap.contains(e.target) && dd) dd.classList.remove('open');
}

function switchViewMode(mode) {
  var dd = document.getElementById('viewModeDDList');
  if (dd) dd.classList.remove('open');
  if (mode === _currentViewMode) return;

  // 현재 모드 해제
  if (_currentViewMode !== 'desktop') _deactivatePreview();

  // 새 모드 활성화
  if (mode !== 'desktop') _activatePreview(mode);

  _currentViewMode = mode;
  _phoneViewActive = (mode !== 'desktop');

  // 버튼 + 드롭다운 UI 업데이트
  var btn = document.getElementById('viewModeBtn');
  var items = document.querySelectorAll('#viewModeDDList .view-mode-dd-item');
  var labels = { desktop: '🖥️ Desktop', tablet: '📟 Tablet', mobile: '📱 Mobile' };
  if (btn) {
    btn.innerHTML = labels[mode];
    btn.className = mode !== 'desktop' ? 'active-' + mode : '';
  }
  items.forEach(function(el) {
    var m = el.textContent.includes('Desktop') ? 'desktop' : el.textContent.includes('Tablet') ? 'tablet' : 'mobile';
    el.classList.toggle('selected', m === mode);
  });
}

function _activatePreview(mode) {
  var wrapper = document.getElementById('phonePreviewWrapper');
  var cls = mode === 'tablet' ? 'force-tablet' : 'force-mobile';
  document.body.classList.add(cls);

  var moveTargets = [
    document.querySelector('.header'),
    document.getElementById('mobileHome'),
    document.querySelector('.main'),
    document.getElementById('mobileBottomNav'),
    document.getElementById('mobMoreOverlay'),
    document.getElementById('mobMoreSheet'),
    document.getElementById('mobSearchOverlay'),
  ];
  moveTargets.forEach(function(el) { if (el) wrapper.appendChild(el); });
}

function _deactivatePreview() {
  var wrapper = document.getElementById('phonePreviewWrapper');

  // 모바일 검색이 열려 있으면 먼저 닫기
  var _srchOverlay = document.getElementById('mobSearchOverlay');
  if (_srchOverlay && _srchOverlay.classList.contains('open')) {
    closeMobileSearch();
  }

  // wrapper 안 요소들을 원래 body로 순서대로 복원
  var frag = document.createDocumentFragment();
  Array.from(wrapper.children).forEach(function(el) { frag.appendChild(el); });
  wrapper.parentNode.insertBefore(frag, wrapper.nextSibling);

  // custSearchArea 위치 복원
  var _csa     = document.getElementById('custSearchArea');
  var _mainDiv = document.querySelector('.main');
  if (_csa && _mainDiv && !_mainDiv.contains(_csa)) {
    var _noPermMsg = document.getElementById('noPermMsg');
    if (_noPermMsg && _noPermMsg.nextSibling) {
      _mainDiv.insertBefore(_csa, _noPermMsg.nextSibling);
    } else {
      _mainDiv.appendChild(_csa);
    }
  }
  if (_csa) _csa.style.display = '';

  document.body.classList.remove('force-mobile', 'force-tablet');
  wrapper.scrollTop = 0;
}

// 기존 호환용
function toggleMobileView() {
  switchViewMode(_currentViewMode === 'mobile' ? 'desktop' : 'mobile');
}

function confirmLogout() {
  var overlay = document.getElementById('logoutConfirmOverlay');
  var box = overlay.querySelector('.logout-dialog');
  overlay.classList.remove('closing');
  overlay.classList.add('open');

  // 파편이 모여서 다이얼로그가 되는 애니메이션
  var rect = box.getBoundingClientRect();
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;
  var colors = ['#6b7280','#9ca3af','#d1d5db','#4b5563','#374151'];
  var frags = [];
  for (var i = 0; i < 30; i++) {
    var frag = document.createElement('div');
    frag.className = 'logout-fragment';
    var angle = Math.random() * Math.PI * 2;
    var dist = 120 + Math.random() * 180;
    var sx = cx + Math.cos(angle) * dist;
    var sy = cy + Math.sin(angle) * dist;
    var size = 4 + Math.random() * 8;
    frag.style.width = size + 'px';
    frag.style.height = size + 'px';
    frag.style.left = sx + 'px';
    frag.style.top = sy + 'px';
    frag.style.background = colors[Math.floor(Math.random() * colors.length)];
    frag.style.borderRadius = (Math.random() > 0.5 ? '50%' : '2px');
    document.body.appendChild(frag);
    frags.push({ el: frag, sx: sx, sy: sy, tx: cx, ty: cy, delay: Math.random() * 150 });
  }
  // 각 파편이 중심으로 모이는 애니메이션
  frags.forEach(function(f) {
    f.el.style.opacity = '1';
    f.el.style.transition = 'none';
    setTimeout(function() {
      f.el.style.transition = 'left 0.45s cubic-bezier(0.22,0.61,0.36,1), top 0.45s cubic-bezier(0.22,0.61,0.36,1), opacity 0.35s ease 0.15s, transform 0.4s ease';
      f.el.style.left = f.tx + 'px';
      f.el.style.top = f.ty + 'px';
      f.el.style.opacity = '0';
      f.el.style.transform = 'scale(0.1)';
    }, f.delay);
  });
  // 파편 정리
  setTimeout(function() {
    frags.forEach(function(f) { if (f.el.parentNode) f.el.parentNode.removeChild(f.el); });
  }, 700);
}

function closeLogoutDialog() {
  var overlay = document.getElementById('logoutConfirmOverlay');
  overlay.classList.add('closing');
  setTimeout(function() {
    overlay.classList.remove('open', 'closing');
  }, 300);
}

// ══════════════════════════════════════════════════════════════════════
// 자동 로그아웃 (보안 보강 #3) — 12시간 무활동 시 자동 로그아웃
// 마우스/키보드/터치/스크롤 활동마다 타이머 리셋. 로그인 상태에서만 동작.
// ══════════════════════════════════════════════════════════════════════
var _IDLE_LOGOUT_MS = 12 * 60 * 60 * 1000; // 12시간
var _idleLogoutTimer = null;
var _idleLastActivity = Date.now();

function _resetIdleTimer() {
  _idleLastActivity = Date.now();
  if (_idleLogoutTimer) { clearTimeout(_idleLogoutTimer); _idleLogoutTimer = null; }
  // 로그인 상태에서만 타이머 가동
  var u = null;
  try { u = getCurrentUser(); } catch(e) {}
  if (!u) return;
  _idleLogoutTimer = setTimeout(function() {
    try {
      if (typeof neoAlert === 'function') {
        neoAlert('⏰ 12시간 무활동으로 자동 로그아웃되었습니다. 다시 로그인해 주세요.', '자동 로그아웃');
      }
    } catch(e) {}
    try { doLogout(); } catch(e) {}
  }, _IDLE_LOGOUT_MS);
}

function _installIdleLogoutTracker() {
  // 이미 설치되어 있으면 중복 방지
  if (window._idleTrackerInstalled) return;
  window._idleTrackerInstalled = true;
  var events = ['mousedown','mousemove','keydown','touchstart','scroll','click','wheel'];
  events.forEach(function(ev) {
    try { document.addEventListener(ev, _resetIdleTimer, { passive: true, capture: true }); } catch(e) {}
  });
  // 탭 가시성 변화 시도 활동으로 간주 (탭 다시 열었을 때)
  try {
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') _resetIdleTimer();
    });
  } catch(e) {}
  // 초기 타이머 시작
  _resetIdleTimer();
}
window._installIdleLogoutTracker = _installIdleLogoutTracker;
window._resetIdleTimer = _resetIdleTimer;
// 페이지 로드 즉시 설치 (로그인 전이면 no-op)
try { _installIdleLogoutTracker(); } catch(e) {}

function _playLogoutSound() {
  try {
    var audio = new Audio('logout-sound.mp3');
    audio.volume = 0.5;
    audio.play().catch(function(){});
  } catch(e) {}
}

function doLogout() {
  try {
    _playLogoutSound();
  } catch(e) {}
  // 로그아웃 확인 다이얼로그 닫기
  try { document.getElementById('logoutConfirmOverlay').classList.remove('open'); } catch(e) {}
  // 세션 정리 (가장 먼저 실행)
  var _logoutUser = null;
  try { _logoutUser = getCurrentUser(); } catch(e) {}
  sessionStorage.removeItem('current_user');
  localStorage.removeItem('current_user_persist');
  // 온라인 상태 해제
  try { _goOffline(); } catch(e) {}
  // 중복 로그인 세션 정리
  try { if (_logoutUser) _clearSession(_logoutUser.empid); } catch(e) {}
  try { clearTimeout(_customerLoadTimer); } catch(e) {}
  // Firestore 실시간 리스너 해제
  try { if (_customerSnapshotUnsub) { _customerSnapshotUnsub(); _customerSnapshotUnsub = null; } } catch(e) {}
  // 채팅 리스너 해제 & 채팅창 닫기
  try { _stopChatListener(); } catch(e) {}
  // Firebase Auth 세션 해제
  try { _fbAuth.signOut().catch(function(){}); } catch(e) {}
  try {
    var testBtn = document.getElementById('btnNotifyTest');
    if (testBtn) testBtn.style.display = 'none';
  } catch(e) {}
  // 열린 오버레이 모두 닫기 (loginOverlay 위에 남는 것 방지)
  try {
    // CSS class 기반 오버레이 (.open/.show) → inline display 초기화
    ['acctSettingsOverlay','acctOverlay','editAcctOverlay','cmOverlay',
     'quoteListOverlay','regOverlay',
     'pendingOverlay','orderOverlay','deliveryOverlay','shippedOverlay',
     'trackingOverlay','resultsQryOverlay','filePreviewOverlay','myTrackingOverlay'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.classList.remove('open','show'); el.style.display = ''; }
    });
    // inline display 기반 오버레이 → display:none 강제
    ['orderConfirmOverlay'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.style.display = 'none'; }
    });
    // 모달 오버레이, 채팅 리스트도 닫기
    var modalOvl = document.getElementById('modalOverlay');
    if (modalOvl) { modalOvl.classList.remove('show'); modalOvl.style.display = ''; }
    var chatPanel = document.getElementById('chatListPanel');
    if (chatPanel) chatPanel.classList.remove('open');
    // 채팅 팝업 모두 닫기
    var chatCont = document.getElementById('chatContainer');
    if (chatCont) chatCont.innerHTML = '';
    document.querySelectorAll('.fullscreen').forEach(function(el) { el.classList.remove('fullscreen'); });
  } catch(e) {}
  // 모바일 UI 초기화
  try {
    var mobNav = document.getElementById('mobileBottomNav');
    if (mobNav) mobNav.style.display = 'none';
    var mobHome = document.getElementById('mobileHome');
    if (mobHome) mobHome.style.display = 'none';
    document.querySelectorAll('.mob-sub-view').forEach(function(v) { v.classList.remove('open'); });
    var mobMoreSheet = document.getElementById('mobMoreSheet');
    if (mobMoreSheet) mobMoreSheet.classList.remove('open');
    var mobMoreOverlay = document.getElementById('mobMoreOverlay');
    if (mobMoreOverlay) mobMoreOverlay.classList.remove('open');
  } catch(e) {}
  // 데스크톱 헤더(검은 바) 숨기기
  try {
    var _deskHeader = document.querySelector('.header');
    if (_deskHeader) _deskHeader.style.display = 'none';
  } catch(e) {}
  // 뷰 모드 미리보기 해제
  try { if (_currentViewMode !== 'desktop') { switchViewMode('desktop'); } } catch(e) {}
  try {
    var viewModeWrap = document.getElementById('viewModeWrap');
    if (viewModeWrap) viewModeWrap.style.display = 'none';
  } catch(e) {}
  // 메인 화면 초기화 (이전 검색 상태 제거)
  try {
    // 고객 검색 영역 숨기기 + 검색어/결과 초기화
    var _csa = document.getElementById('custSearchArea');
    if (_csa) _csa.style.display = 'none';
    var _searchInput = document.getElementById('searchInput');
    if (_searchInput) _searchInput.value = '';
    var _resultsArea = document.getElementById('resultsArea');
    if (_resultsArea) _resultsArea.innerHTML = '';
    // 필터 초기화
    var _salesFilter = document.getElementById('salesFilterSelect');
    if (_salesFilter) { _salesFilter.value = ''; _salesFilter.disabled = false; }
    var _statusFilter = document.getElementById('statusFilterSelect');
    if (_statusFilter) _statusFilter.value = '';
    selectedSales = '';
    // 모달 닫기
    var _modalOverlay = document.getElementById('modalOverlay');
    if (_modalOverlay) { _modalOverlay.classList.remove('show','map-open'); _modalOverlay.style.opacity = ''; }
    closeMapSlide();
    // 고객 마스터 초기화
    var _cmOverlay = document.getElementById('cmOverlay');
    if (_cmOverlay) _cmOverlay.classList.remove('open');
    _cmLoaded = false;
    _pmLoaded = false;
    _cmBangkokMode = false;
    // 데이터 초기화
    DATA = [];
  } catch(e) {}
  // 헤더 숨김 (로그인 화면에서 상단 로그아웃/계정설정 노출 방지)
  try {
    var _lgHdr = document.querySelector('.header');
    if (_lgHdr) _lgHdr.style.display = 'none';
  } catch(e) {}
  // 로그인 화면 표시 (파편 조립 애니메이션)
  var _loginOvl = document.getElementById('loginOverlay');
  var _loginBox = _loginOvl.querySelector('.login-box');
  _loginBox.style.opacity = '0';
  _loginBox.style.transform = 'scale(0.3)';
  _loginBox.style.transition = 'none';
  _loginOvl.classList.add('show');
  // 로그인 탭으로 초기화
  try { switchLoginTab('login'); } catch(e) {}

  // 파편 생성 및 조립 애니메이션
  (function() {
    var rect = _loginBox.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var bw = rect.width;
    var bh = rect.height;
    var colors = ['#3b82f6','#60a5fa','#93c5fd','#1e40af','#2563eb','#dbeafe','#ffffff','#bfdbfe'];
    var fragCount = 50;
    var frags = [];
    for (var i = 0; i < fragCount; i++) {
      var frag = document.createElement('div');
      frag.className = 'login-assemble-frag';
      // 목표 위치: 로그인 박스 영역 내 랜덤
      var tx = rect.left + Math.random() * bw;
      var ty = rect.top + Math.random() * bh;
      // 시작 위치: 화면 전체에서 랜덤하게 흩어짐
      var angle = Math.random() * Math.PI * 2;
      var dist = 300 + Math.random() * 500;
      var sx = cx + Math.cos(angle) * dist;
      var sy = cy + Math.sin(angle) * dist;
      var size = 6 + Math.random() * 14;
      frag.style.cssText = 'position:fixed;z-index:10001;pointer-events:none;' +
        'width:' + size + 'px;height:' + size + 'px;' +
        'left:' + sx + 'px;top:' + sy + 'px;' +
        'background:' + colors[Math.floor(Math.random() * colors.length)] + ';' +
        'border-radius:' + (Math.random() > 0.4 ? '50%' : Math.floor(Math.random() * 4) + 'px') + ';' +
        'opacity:1;' +
        'box-shadow:0 2px 8px rgba(30,64,175,0.3);' +
        'transform:rotate(' + Math.floor(Math.random() * 360) + 'deg) scale(' + (0.5 + Math.random()) + ');';
      document.body.appendChild(frag);
      frags.push({ el: frag, sx: sx, sy: sy, tx: tx, ty: ty, delay: Math.random() * 200 });
    }
    // 각 파편이 로그인 박스로 모이는 애니메이션
    frags.forEach(function(f) {
      setTimeout(function() {
        f.el.style.transition = 'left 0.55s cubic-bezier(0.22,0.61,0.36,1), top 0.55s cubic-bezier(0.22,0.61,0.36,1), opacity 0.3s ease 0.3s, transform 0.5s ease';
        f.el.style.left = f.tx + 'px';
        f.el.style.top = f.ty + 'px';
        f.el.style.transform = 'rotate(0deg) scale(0.3)';
        f.el.style.opacity = '0.6';
      }, f.delay);
    });
    // 파편 모인 후 로그인 박스 나타남
    setTimeout(function() {
      _loginBox.style.transition = 'opacity 0.4s ease, transform 0.5s cubic-bezier(0.22,0.61,0.36,1)';
      _loginBox.style.opacity = '1';
      _loginBox.style.transform = 'scale(1)';
      // 파편 fade out & 정리
      frags.forEach(function(f) {
        f.el.style.transition = 'opacity 0.3s ease';
        f.el.style.opacity = '0';
      });
      setTimeout(function() {
        frags.forEach(function(f) { if (f.el.parentNode) f.el.parentNode.removeChild(f.el); });
      }, 400);
    }, 550);
  })();
  // 계정 등록 폼 초기화
  try {
    ['su_empid','su_name','su_nickname','su_pw','su_pw2','su_tel','su_email'].forEach(function(id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    var suDept = document.getElementById('su_dept'); if (suDept) suDept.selectedIndex = 0;
    var suSubDept = document.getElementById('su_sub_dept'); if (suSubDept) { suSubDept.innerHTML = '<option value="">-</option>'; suSubDept.selectedIndex = 0; }
    var suErr = document.getElementById('su_err'); if (suErr) suErr.textContent = '';
    // 서명 캔버스 초기화
    var sigCanvas = document.getElementById('suSigCanvas'); if (sigCanvas) { var ctx = sigCanvas.getContext('2d'); ctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height); }
  } catch(e) {}
  // 자동 로그인이 켜져 있으면 사번 유지, 꺼져 있으면 비움
  if (localStorage.getItem('auto_login') !== 'true') {
    try { document.getElementById('li_empid').value = ''; } catch(e) {}
  }
  try { document.getElementById('li_pw').value = ''; } catch(e) {}
  try { document.getElementById('li_err').textContent = ''; } catch(e) {}
}

// ── Firebase 설정 (neothai-order 프로젝트) ──────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAo4jlDhpRZo8K8YTwismjFCWgWmHV93GQ",
  authDomain:        "neothai-order.firebaseapp.com",
  projectId:         "neothai-order",
  storageBucket:     "neothai-order.firebasestorage.app",
  messagingSenderId: "458325541072",
  appId:             "1:458325541072:web:b54d9b66b5cc68531b5ed5",
  measurementId:     "G-0N9WHEJ59X"
};
const FIREBASE_VAPID_KEY = ""; // TODO: Firebase Console > 프로젝트 설정 > 클라우드 메시징 > 웹 푸시 인증서에서 복사
const FB_AUTH_DOMAIN = '@neothai-order.firebaseapp.com';

// ── Firebase 초기화 ──────────────────────────────────────────────────────────
if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
const _fbAuth    = firebase.auth();
const _fbDb      = firebase.firestore();
// iPad Safari에서 WebSocket 연결 차단 문제 해결: Long Polling 사용
try {
  var _ua = navigator.userAgent || '';
  if (/iPad|Macintosh/.test(_ua) && 'ontouchend' in document) {
    _fbDb.settings({ experimentalForceLongPolling: true });
    console.log('[Firebase] iPad 감지 → Long Polling 모드');
  }
} catch(e) { console.warn('[Firebase] settings error:', e); }
// ── OS 판별: Android 전용 UI 규칙 적용용 body 클래스 ──
try {
  var _uaOs = navigator.userAgent || '';
  if (/Android/i.test(_uaOs)) {
    document.body && document.body.classList.add('is-android');
  } else if (/iPhone|iPad|iPod/i.test(_uaOs)) {
    document.body && document.body.classList.add('is-ios');
  }
} catch(e) {}
// ── Android/iOS: 오버레이(-overlay.show / -overlay.open) 열리면 body.has-open-modal 추가
//    Android: CSS :has() 미지원 WebView 폴백 + 헤더 즉시 숨김
//    iOS    : body 터치 스크롤 잠금 (position:fixed 기법 — overflow:hidden 미작동 이슈)
(function() {
  try {
    var _ua = navigator.userAgent || '';
    var _isAnd = /Android/i.test(_ua);
    var _isIOS = /iPhone|iPad|iPod/i.test(_ua);
    if (!_isAnd && !_isIOS) return;
    var OV_SEL = '[class*="-overlay"].show, [class*="-overlay"].open';
    var _isSettleOpen = function() {
      var sp = document.getElementById('settlePickerWrap');
      if (!sp) return false;
      var d = sp.style && sp.style.display;
      if (d === 'none') return false;
      return sp.offsetParent !== null || d === '' || d === 'flex' || d === 'block';
    };
    var _prevHasOpen = false;
    var _savedScrollY = 0;
    var _hdrHide = function() {
      var anyOpen = !!document.querySelector(OV_SEL) || _isSettleOpen();
      if (anyOpen === _prevHasOpen) {
        document.body.classList.toggle('has-open-modal', anyOpen);
        return;
      }
      if (_isIOS) {
        if (anyOpen) {
          // 모달 열림: 현재 scrollY 저장 → body 를 fixed 로 고정 (시각 점프 방지)
          _savedScrollY = window.scrollY || window.pageYOffset || 0;
          document.body.style.setProperty('--ios-lock-top', (-_savedScrollY) + 'px');
        }
      }
      document.body.classList.toggle('has-open-modal', anyOpen);
      if (_isIOS && !anyOpen && _prevHasOpen) {
        // 모달 닫힘: 스크롤 위치 복원
        document.body.style.removeProperty('--ios-lock-top');
        try { window.scrollTo(0, _savedScrollY); } catch(e) {}
      }
      _prevHasOpen = anyOpen;
    };
    var _start = function() {
      _hdrHide();
      try {
        var obs = new MutationObserver(function(muts) {
          for (var i = 0; i < muts.length; i++) {
            if (muts[i].type === 'attributes' && muts[i].attributeName === 'class') {
              var t = muts[i].target;
              if (t && t.className && /-overlay/.test(String(t.className))) { _hdrHide(); return; }
            } else if (muts[i].addedNodes && muts[i].addedNodes.length) {
              _hdrHide(); return;
            }
          }
        });
        obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
        var sp = document.getElementById('settlePickerWrap');
        if (sp) {
          var obs2 = new MutationObserver(_hdrHide);
          obs2.observe(sp, { attributes: true, attributeFilter: ['style'] });
        }
      } catch(e) {}
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _start);
    } else { _start(); }
  } catch(e) {}
})();
// ── Firestore 오프라인 영속화 (IndexedDB) ──
// 페이지 전환(index.html ↔ nearby-dentists.html 등)마다 전체 컬렉션을 재페치하는
// 비용을 제거. 같은 브라우저/앱 세션 내에서 Firestore가 IndexedDB 캐시를 공유하므로,
// 두 번째 진입부터는 캐시에서 즉시 반환되고 변경분만 백그라운드 동기화된다.
try {
  _fbDb.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
    if (err && err.code === 'failed-precondition') {
      // 다른 탭에서 이미 영속화 활성 → 무시 (synchronizeTabs 로 보통 해결되지만 방어)
      console.warn('[Firestore] persistence failed-precondition (multi-tab)');
    } else if (err && err.code === 'unimplemented') {
      console.warn('[Firestore] persistence unavailable in this browser');
    } else {
      console.warn('[Firestore] persistence error:', err && err.code);
    }
  });
} catch(e) { console.warn('[Firestore] persistence init error:', e); }
const _fbStorage = firebase.storage();

// ── Cache-First Firestore 래퍼 (2단계 최적화) ───────────────────────────────
// 동작: 1) IndexedDB 캐시에서 먼저 읽기 시도 (0 reads, 청구 없음)
//       2) 캐시가 비었으면 서버에서 받기 (정상 청구)
//       3) 캐시 히트 시 백그라운드로 서버 동기화 (다음 호출 때 최신 반영)
// 주의: 캐시된 데이터가 살짝 오래될 수 있음. 실시간 필수인 곳에는 쓰지 말 것.
async function _getCachedOrServer(query) {
  try {
    var cached = await query.get({ source: 'cache' });
    if (cached && cached.size > 0) {
      // 백그라운드에서 서버 동기화 (현재 호출자는 캐시 반환)
      // → 다음 호출 시 IndexedDB 에 최신 데이터가 들어있음
      try { query.get({ source: 'server' }).catch(function(){}); } catch(e){}
      return cached;
    }
  } catch(e) {
    // 캐시 미스 — 정상 경로, 아래에서 서버 조회
  }
  return await query.get({ source: 'server' });
}
window._getCachedOrServer = _getCachedOrServer;

// ── Firestore 실시간 고객 마스터 로드 ────────────────────────────────────────
let _customerSnapshotUnsub = null; // onSnapshot 리스너 해제 함수

function setSheetConnStatus(ok) {
  _setFirestoreConnStatus(ok);
}
function _setFirestoreConnStatus(ok, pingMs) {
  var els = [document.getElementById('firestoreConnStatus'), document.getElementById('firestoreConnStatusMob')];
  els.forEach(function(el) {
    if (!el) return;
    if (pingMs !== undefined) {
      var cls, dot, label;
      if (pingMs <= 500) { cls = 'connected'; dot = 'green'; label = 'Connected'; }
      else if (pingMs <= 2000) { cls = 'unstable'; dot = 'orange'; label = 'Unstable'; }
      else { cls = 'disconnected'; dot = 'red'; label = 'Unavailable'; }
      el.className = el.className.replace(/connected|unstable|disconnected|pinging/g,'').trim() + ' ' + cls;
      el.innerHTML = '<span class="conn-dot ' + dot + '"></span>' + label + ' ' + pingMs + 'ms';
    } else {
      el.className = el.className.replace(/connected|unstable|disconnected|pinging/g,'').trim() + ' ' + (ok ? 'connected' : 'disconnected');
      el.innerHTML = ok ? '<span class="conn-dot green"></span>Connected' : '<span class="conn-dot red"></span>Unavailable';
    }
  });
}
function _pingFirestore() {
  [document.getElementById('firestoreConnStatus'), document.getElementById('firestoreConnStatusMob')].forEach(function(el) {
    if (!el) return;
    el.className = el.className.replace(/connected|unstable|disconnected|pinging/g,'').trim() + ' pinging';
    el.innerHTML = '<span class="conn-dot green" style="animation:none;background:#3b82f6;"></span>Ping...';
  });
  var start = performance.now();
  // 헬스체크 전략: 모든 역할이 수행 가능한 '읽기' 로 통일.
  //   1) _ping/test READ — 규칙상 모두 read 허용. 문서 존재 여부 무관하게 round-trip 성공.
  //   2) 네트워크 장애 시 accounts/{myEmpid} READ 로 한 번 더 시도 (본인 문서는 항상 read 허용).
  // (이전 구현은 set() 로 시도하다가 Sales 계정 write 불가 → customers.limit(1).get() 로 fallback
  //  했는데 이 또한 스코프 사용자에게 규칙 위반이라 항상 Unavailable 로 표시되던 버그가 있었음.)
  _fbDb.collection('_ping').doc('test').get()
    .then(function() {
      var ms = Math.round(performance.now() - start);
      _setFirestoreConnStatus(true, ms);
      setTimeout(function() { _setFirestoreConnStatus(true); }, 5000);
    })
    .catch(function(e1) {
      try {
        var u = getCurrentUser();
        if (u && u.empid) {
          _fbDb.collection('accounts').doc(u.empid).get()
            .then(function() {
              var ms = Math.round(performance.now() - start);
              _setFirestoreConnStatus(true, ms);
              setTimeout(function() { _setFirestoreConnStatus(true); }, 5000);
            })
            .catch(function(e2) {
              console.warn('[Ping] both paths failed:', e1 && e1.message, e2 && e2.message);
              _setFirestoreConnStatus(false);
            });
          return;
        }
      } catch(ex) {}
      _setFirestoreConnStatus(false);
    });
}

// Google Sheets CSV URL (웹에 게시된 실시간 데이터)
var GSHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR9DHxJnZZVjW7o6gqvjVfwScORuJx4NS1iDkbOwhpr75pnsEzsmc7Lq0jDYRztwh-fUMdbBPdP_e9J/pub?gid=968667582&single=true&output=csv';

// RFC 4180 호환 CSV 파서 (멀티라인 인용부호, 쉼표 포함 필드 처리)
function parseCSV(text) {
  var rows = [];
  var row = [];
  var cur = '';
  var inQuote = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
      else { cur += ch; }
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  // 각 셀의 줄바꿈을 공백으로 치환하여 원시 행 배열 반환
  return rows.map(function(r) {
    return r.map(function(cell) { return cell.replace(/[\r\n]+/g, ' ').trim(); });
  });
}

// 인덱스 기반 매핑 (컬럼 위치 고정)
// A(0)STATUS B(1)RegDate C(2)Sales D(3)SalesCode E(4)TeamRegion F(5)NT_Code
// G(6)ERP_Code H(7)NameTH I(8)NameEN J(9)RegAddr K(10)TaxID L(11)Tel
// M(12)CustNameERP N(13)ClinicName O(14)NameEN2 P(15)DeliveryAddr
// Q(16)TaxID2 R(17)Tel2 S(18)Province T(19)District U(20)CustType V(21)Remark
function mapSheetRow(fields) {
  var f = function(i) { return (fields[i] || '').trim(); };
  var erp = f(6) || f(5); // G열 ERP_Code, 없으면 F열 NT_Code
  return {
    status:     f(0),
    reg_date:   f(1),
    sales:      f(2),
    sales_code: f(3),
    team_region:f(4),
    nt_code:    f(5),
    erp:        erp,
    name_th:    f(7),          // H열: 고객명(태국어)
    name_en:    f(8),          // I열: 고객명(영어)
    address:    f(15) || f(9), // P열: 배송/등록 주소 (없으면 J열 fallback)
    tax_id:     f(10),         // K열: TAX ID
    tel:        f(11),         // L열: 연락처
    cust_name:  f(12) || f(7), // M열: ERP 등록 고객명 (없으면 H열)
    clinic:     f(13),         // N열: 소속(클리닉/회사명)
    name_en2:   f(14),         // O열: 영문명(INV/BR용)
    delivery_address: f(15),   // P열: 배송/등록 주소
    addr_del:   f(15),
    tax_id2:    f(16),
    tel2:       f(17),
    province:   f(18),         // S열: 지역
    location:   f(18),
    district:   f(19),         // T열: 구(방콕)
    type:       f(20),         // U열: 고객 유형
    cust_type:  f(20),
    remark:     f(21)
  };
}

// ── 콘텐츠 해시 (stable field 순서로 djb2) ──
// 목적: CSV 재업로드 시 실제 변경된 행만 Firestore 에 write → 사용자들의 불필요한 재다운로드 방지
var _CUST_HASH_FIELDS = ['status','reg_date','sales','sales_code','team_region','nt_code','erp',
  'name_th','name_en','address','tax_id','tel','cust_name','clinic','name_en2',
  'delivery_address','addr_del','tax_id2','tel2','province','location','district',
  'type','cust_type','remark'];
function _custComputeHash(r) {
  if (!r) return '';
  var parts = [];
  for (var i = 0; i < _CUST_HASH_FIELDS.length; i++) {
    var k = _CUST_HASH_FIELDS[i];
    var v = r[k];
    parts.push(v == null ? '' : String(v).trim());
  }
  var s = parts.join('\u0001');
  // djb2
  var h = 5381;
  for (var j = 0; j < s.length; j++) h = ((h << 5) + h + s.charCodeAt(j)) | 0;
  return (h >>> 0).toString(16);
}

// ── Google Sheets → Firestore 동기화 ──
// v2: 콘텐츠 해시 비교로 변경된 행만 write (skipped 행은 updated_at 보존)
async function syncCsvToFirestore(silent) {
  var indicator = document.getElementById('custSyncIndicator');
  try {
    if (!silent && indicator) { indicator.textContent = '🔄 시트 → Firestore 동기화...'; indicator.style.display = 'inline-flex'; }
    var resp = await fetch(GSHEET_CSV_URL);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var csvText = await resp.text();
    var rows = parseCSV(csvText);
    rows.shift(); // 헤더 제거
    var mapped = rows.filter(function(f){ return f.length >= 7; }).map(mapSheetRow).filter(function(r){ return r.nt_code || r.erp; });
    if (!mapped.length) throw new Error('empty CSV');

    // ── 1) 기존 Firestore 문서의 해시 맵 구성 (비교용) ──
    if (!silent && indicator) indicator.textContent = '🔍 변경 분석 중...';
    var existingMap = {};
    try {
      var existingSnap = await _fbDb.collection('customers').get();
      existingSnap.forEach(function(d) {
        var data = d.data() || {};
        existingMap[d.id] = {
          hash: data.content_hash || _custComputeHash(data), // 기존 문서에 hash 없으면 즉시 계산
          exists: true
        };
      });
    } catch(e) {
      console.warn('[Sync] 기존 문서 해시 조회 실패, 전체 덮어쓰기로 진행:', e);
    }

    // ── 2) 변경/신규만 선별 ──
    var _FV = firebase.firestore.FieldValue;
    var toWrite = [];
    var skipCount = 0;
    for (var i = 0; i < mapped.length; i++) {
      var c = mapped[i];
      var docId = c.erp || c.nt_code;
      if (!docId) continue;
      var newHash = _custComputeHash(c);
      var existing = existingMap[docId];
      if (existing && existing.hash === newHash) {
        skipCount++;
        continue; // 내용 동일 → write 스킵
      }
      // 변경 또는 신규
      c.content_hash = newHash;
      c.updated_at = _FV.serverTimestamp();
      toWrite.push({ docId: docId, data: c });
    }

    console.log('[Sync] 변경 분석: 총 ' + mapped.length + '건 중 write 대상 ' + toWrite.length + '건, skip ' + skipCount + '건');

    // ── 3) 변경 건만 batch write (500 단위 분할) ──
    if (toWrite.length > 0) {
      var batch = _fbDb.batch();
      var count = 0;
      for (var k = 0; k < toWrite.length; k++) {
        var w = toWrite[k];
        var ref = _fbDb.collection('customers').doc(w.docId);
        batch.set(ref, w.data, { merge: true });
        count++;
        if (count % 450 === 0) { await batch.commit(); batch = _fbDb.batch(); }
      }
      if (count % 450 !== 0) await batch.commit();
    }

    // 동기화 타임스탬프 저장
    await _fbDb.collection('meta').doc('customerSync').set({
      lastSync: new Date().toISOString(),
      count: mapped.length,
      changed: toWrite.length,
      skipped: skipCount
    });

    // 로컬 캐시 갱신 (변경 건이 있을 때만; 없으면 기존 캐시 유지)
    // 중요: 업로드를 트리거한 관리자 본인도 INCREMENTAL 경로로 진입해야 함
    // (lastSyncMs 없이 호출하면 FULL 로드로 떨어져 3,800+ 건 재다운로드 발생)
    if (toWrite.length > 0) {
      try {
        _loadCustPromise = null;
        var _prevCache = null;
        try { _prevCache = await _custLoadCache(); } catch(_e) {}
        var _lastTs = (_prevCache && _prevCache.serverTs) ? _prevCache.serverTs : 0;
        await _custSyncFromServer(_lastTs);
      } catch(e) { console.warn('[Sync] post-upload refresh 실패:', e); }
    }

    console.log('[Sync] CSV → Firestore 완료: write=' + toWrite.length + ' skip=' + skipCount);
    if (!silent && indicator) {
      if (toWrite.length === 0) {
        indicator.textContent = '✅ 변경 없음 (' + mapped.length + '건 동일)';
      } else {
        indicator.textContent = '✅ 변경 ' + toWrite.length + '건 (동일 ' + skipCount + '건 스킵)';
      }
      setTimeout(function(){ if(indicator) indicator.style.display = 'none'; }, 4000);
    }
    return mapped.length;
  } catch(e) {
    console.error('[Sync] CSV → Firestore 실패:', e);
    if (!silent && indicator) { indicator.textContent = '❌ 동기화 실패: ' + e.message; }
    return 0;
  }
}

// ══════════════════════════════════════════════════════════════════════
// 동기화 텔레메트리 (Fire-and-forget)
// ──────────────────────────────────────────────────────────────────────
// 목적: 매 방문 Full/Incremental/Miss 패턴을 기록해 "캐시가 계속 터지는 사용자" 감지
// 규칙:
//   • HIT 는 기록하지 않음 (비용 절약 + 로그 가벼움)
//   • 모든 호출은 try-catch + .catch 로 감싸 메인 로직에 영향 없음 (await 하지 않음)
//   • 킬 스위치: app_config/telemetry.enabled === false 이면 전체 중단
//     → 세션당 1회만 읽고 메모리 캐싱. 읽기 실패 시 fail-open (기본 ON)
//   • TTL: expireAt 필드에 30일 후 타임스탬프 저장 → Firebase Console 에서
//     sync_telemetry 컬렉션 TTL 정책(필드=expireAt) 설정 필요
// ══════════════════════════════════════════════════════════════════════
var _telemetryEnabled = null;
var _telemetryConfigPromise = null;
function _telemetryConfigReady() {
  if (_telemetryEnabled !== null) return Promise.resolve(_telemetryEnabled);
  if (_telemetryConfigPromise) return _telemetryConfigPromise;
  _telemetryConfigPromise = (function() {
    try {
      if (typeof firebase === 'undefined' || !firebase.firestore) { _telemetryEnabled = true; return Promise.resolve(true); }
      return firebase.firestore().collection('app_config').doc('telemetry').get()
        .then(function(doc) {
          _telemetryEnabled = !doc.exists || doc.data().enabled !== false;
          return _telemetryEnabled;
        })
        .catch(function() { _telemetryEnabled = true; return true; });
    } catch(e) { _telemetryEnabled = true; return Promise.resolve(true); }
  })();
  return _telemetryConfigPromise;
}
function _telemetryDetectDevice() {
  var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  return 'Desktop';
}
function _telemetryLog(page, mode, info) {
  try {
    if (mode === 'HIT') return;
    _telemetryConfigReady().then(function(enabled) {
      if (!enabled) return;
      try {
        var fb = (typeof firebase !== 'undefined') ? firebase : null;
        if (!fb || !fb.firestore || !fb.auth) return;
        var user = fb.auth().currentUser;
        if (!user) return;
        var now = Date.now();
        var expireAt = fb.firestore.Timestamp.fromMillis(now + 30 * 86400 * 1000);
        var empid = (user.email || '').split('@')[0].toUpperCase();
        var me = (typeof window !== 'undefined' && window.me) ? window.me : {};
        var payload = {
          uid: user.uid,
          empid: empid,
          nickname: me.nickname || '',
          page: page || '',
          mode: mode || '',
          docsRead: (info && typeof info.docsRead === 'number') ? info.docsRead : 0,
          cachedCount: (info && typeof info.cachedCount === 'number') ? info.cachedCount : 0,
          reason: (info && info.reason) || '',
          device: _telemetryDetectDevice(),
          ua: ((typeof navigator !== 'undefined' && navigator.userAgent) || '').slice(0, 200),
          version: (info && info.version) || (typeof window !== 'undefined' && window._appVersion) || '',
          ts: fb.firestore.FieldValue.serverTimestamp(),
          expireAt: expireAt
        };
        fb.firestore().collection('sync_telemetry').add(payload).catch(function() {});
      } catch(e) { /* silent */ }
    }).catch(function() { /* silent */ });
  } catch(e) { /* silent */ }
}
if (typeof window !== 'undefined') {
  window._telemetryLog = _telemetryLog;
  window._telemetryConfigReady = _telemetryConfigReady;
}

// ══════════════════════════════════════════════════════════════════════
// 고객 마스터 로드 — 증분 동기화 (Pattern B: updated_at + deletion tombstone)
// ──────────────────────────────────────────────────────────────────────
// 핵심 동작:
//   1) IndexedDB 캐시 우선 로드 → 즉시 UI 표시 (0 read)
//   2) 백그라운드 증분 쿼리:
//      - customers  where('updated_at', '>', lastSync)  → 변경/추가분만
//      - customer_deletions where('deleted_at', '>', lastSync) → 삭제분
//   3) 변경된 만큼만 캐시에 merge, 삭제된 건은 캐시에서 제거
//
// 비용: 고객 3,000명 중 오늘 1명 추가 → read 1회 (기존은 3,000회)
// 첫 로드/캐시 없을 때만 전체 조회 (.get() without where)
// ══════════════════════════════════════════════════════════════════════
var _loadCustPromise = null;
// 백그라운드 증분/스코프 동기화 in-flight 가드
//   _loadCustPromise 는 "캐시 로드 → 반환" 단계에서만 유효하므로 캐시 반환 후 곧 null 로 풀림.
//   그러나 백그라운드 _custSyncFromServer() 는 await 없이 돌아가고 있어, 페이지 네비게이션 등으로
//   loadCustomerData() 가 다시 호출되면 중복 FULL 쿼리가 병렬로 떠 동일 분 내 FULL 읽기가 여러 번
//   찍히는 원인. 이 플래그로 실제 서버 쿼리만 직렬화.
var _custSyncInFlight = false;
// IndexedDB 스키마 버전: 2 (updated_at 증분 지원을 위해 bump. 기존 캐시 1회 전체 재로드)
var _CUST_IDB_VERSION = 2;

// ──────────────────────────────────────────────────────────────────────
// 고객 읽기 스코프 결정 — 영업 담당자는 본인 담당만 쿼리 (규칙 정합성 + 비용 절감)
//  • admin / Office / Approver(role) → 전체 조회
//  • Sales dept 비관리자          → sales==myNickname 로 필터 (본인 담당만)
//  • nickname 없는 비관리자        → 스코프 불가 → 전체 쿼리 (규칙이 차단)
// 반환: { mode: 'all' }  또는  { mode: 'sales', nickname: 'xxx' }
// ──────────────────────────────────────────────────────────────────────
function _getCustReadScope() {
  try {
    var u = getCurrentUser();
    if (!u) return { mode: 'all' };
    if (_isAdmin(u)) return { mode: 'all' };
    // dept/role 비교는 반드시 대소문자·공백 무관하게 — 데이터 입력 편차(Office/office/OFFICE) 때문에
    // 이전에 u.dept === 'Sales' 엄격 비교로 Sales 사용자가 'all' 스코프로 빠지는 버그가 있었다.
    if (_isOfficeDept && _isOfficeDept(u)) return { mode: 'all' };
    var _role = (u.role || '').toString().trim().toLowerCase();
    if (_role === 'admin' || _role === 'approver') return { mode: 'all' };
    // 비관리자/비Office + 닉네임 보유자 → 닉네임 스코프
    // (dept 가 'Sales' 이든 미지정이든, 규칙상 ownsCustomer(sales==nickname) 로만 읽기 허용되므로
    //  일관되게 sales 스코프로 필터링)
    if (u.nickname && String(u.nickname).trim()) {
      return { mode: 'sales', nickname: String(u.nickname).trim() };
    }
    // 그 외(대기) → 전체 (규칙이 차단할 것이므로 데이터가 안 내려와도 OK)
    return { mode: 'all' };
  } catch(e) { return { mode: 'all' }; }
}

// 스코프별 IndexedDB 이름 — 어드민 캐시와 영업사원 캐시를 분리
// (담당 변경 / 권한 변경 시 캐시 오염 방지)
function _custIdbName() {
  try {
    var sc = _getCustReadScope();
    if (sc.mode === 'sales' && sc.nickname) {
      // nickname 을 URL-safe 로 변환해서 DB 이름에 포함
      var safe = String(sc.nickname).replace(/[^A-Za-z0-9_-]/g, '_');
      return 'customer_cache_sales_' + safe;
    }
  } catch(_){}
  return 'customer_cache';
}

function _custOpenIDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(_custIdbName(), _CUST_IDB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('master')) db.createObjectStore('master', { keyPath: '_id', autoIncrement: true });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      // v1 → v2 업그레이드 시: 기존 master 캐시는 그대로 두되, meta 에
      // serverTs 가 없으므로 최초 증분 동기화는 전체 조회로 자연 fallback 된다.
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

// Firestore Timestamp → ms 로 정규화 (IndexedDB 에 plain object 저장용)
function _custNormalizeDoc(d) {
  var r = d.data();
  if (r.updated_at && typeof r.updated_at.toMillis === 'function') {
    r.updated_at_ms = r.updated_at.toMillis();
  }
  // Timestamp 객체는 IndexedDB 에 저장 전 제거 (structured clone 호환성)
  delete r.updated_at;
  return r;
}

// localStorage 센티넬 키 — IDB 가 evict 돼도 이 값은 살아남을 확률이 훨씬 높음.
// serverTs 를 보존해 다음 로드 때 INCREMENTAL 쿼리로 fallback → 3800 read → ~10 read 로 축소.
var _CUST_SENTINEL_KEY = 'neo_custCache_lastSaved';

function _custSentinelRead() {
  try {
    var raw = localStorage.getItem(_CUST_SENTINEL_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return null;
    return s; // { ts, count, serverTs, dbName }
  } catch(_) { return null; }
}
function _custSentinelWrite(count, serverTs) {
  try {
    localStorage.setItem(_CUST_SENTINEL_KEY, JSON.stringify({
      ts: Date.now(), count: count, serverTs: serverTs || 0, dbName: _custIdbName()
    }));
  } catch(_){}
}

// 브라우저의 스토리지 압박(Chrome) / ITP 삭제(Safari) 로 인한 IDB 축출 방지 요청.
// Chromium 은 engagement score 기반으로 silent 승인, Firefox/Safari 는 prompt 또는 거부.
// 1회만 시도하고 결과 캐시 — 반복 호출 방지.
var _persistAsked = false;
async function _custRequestPersistence() {
  if (_persistAsked) return;
  _persistAsked = true;
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    var already = false;
    try { already = await navigator.storage.persisted(); } catch(_){}
    if (already) { console.log('[custCache] storage already persistent'); return; }
    var granted = await navigator.storage.persist();
    console.log('[custCache] navigator.storage.persist() =>', granted ? 'GRANTED' : 'DENIED');
  } catch(_){}
}

async function _custSaveCache(data, serverTs) {
  try {
    var db = await _custOpenIDB();
    var tx = db.transaction(['master','meta'], 'readwrite');
    var store = tx.objectStore('master');
    store.clear();
    data.forEach(function(r, i) {
      var copy = Object.assign({}, r, { _id: i });
      store.put(copy);
    });
    var metaRec = { key: 'lastSync', ts: Date.now(), count: data.length };
    if (typeof serverTs === 'number' && serverTs > 0) metaRec.serverTs = serverTs;
    tx.objectStore('meta').put(metaRec);
    await new Promise(function(res, rej) { tx.oncomplete = res; tx.onerror = function() { rej(tx.error); }; });
    db.close();
    console.log('[custCache save] OK:', data.length, 'rows, db=', _custIdbName());
    // localStorage 센티넬 즉시 기록 — IDB 가 evict 돼도 이 값으로 INCREMENTAL fallback 가능
    _custSentinelWrite(data.length, serverTs || 0);
    // 지속성 요청(페이지당 1회) — 축출 방지
    _custRequestPersistence();
    // 검증: 바로 재조회해 실제로 저장됐는지 확인. quota 초과/private 모드 silent 손실 감지.
    try {
      var verify = await _custLoadCache();
      if (!verify || !verify.data || verify.data.length < data.length) {
        console.warn('[custCache save] VERIFY MISMATCH — saved=' + data.length + ', read-back=' + ((verify && verify.data && verify.data.length) || 0) + ' — 다음 로드에서 cold-start 반복 가능. (private mode / quota 초과 / storage eviction 의심)');
        try {
          if (typeof firebase !== 'undefined' && firebase.firestore && firebase.auth && firebase.auth().currentUser) {
            _telemetryLog('customer', 'CACHE_SAVE_FAIL', { docsRead: 0, cachedCount: data.length, reason: 'verify-mismatch-' + ((verify && verify.data && verify.data.length) || 0) });
          }
        } catch(_){}
      }
    } catch(_ve){}
  } catch(e) {
    console.error('[custCache save] FAIL:', e && e.message || e, '— IndexedDB 저장 실패. 다음 로드에서 cold-start 반복됨. (quota/private/disabled 확인)');
    try {
      if (typeof firebase !== 'undefined' && firebase.firestore && firebase.auth && firebase.auth().currentUser) {
        _telemetryLog('customer', 'CACHE_SAVE_FAIL', { docsRead: 0, cachedCount: data.length, reason: 'exception-' + (e && e.name || 'unknown') });
      }
    } catch(_){}
  }
}

// 관리자 진단용 — 콘솔에서 window._diagCustCache() 로 호출
// IDB 상태·크기·serverTs·나이 출력 + quota 추정
if (typeof window !== 'undefined') {
  window._diagCustCache = async function() {
    var info = { dbName: _custIdbName(), scope: null, cache: null, sentinel: null, quota: null };
    try { info.scope = _getCustReadScope(); } catch(_){}
    try {
      var sn = _custSentinelRead();
      if (sn) {
        info.sentinel = {
          savedAt: sn.ts, savedAtStr: sn.ts ? new Date(sn.ts).toISOString() : null,
          ageMin: sn.ts ? Math.round((Date.now() - sn.ts) / 60000) : null,
          count: sn.count, serverTs: sn.serverTs || 0,
          dbName: sn.dbName || ''
        };
      } else {
        info.sentinel = '(NONE — 첫 방문 또는 localStorage 도 삭제됨)';
      }
    } catch(_){}
    try {
      var c = await _custLoadCache();
      if (c) {
        info.cache = {
          rowCount: (c.data || []).length,
          serverTs: c.serverTs || 0,
          serverTsStr: c.serverTs ? new Date(c.serverTs).toISOString() : null,
          savedAt: c.ts || 0,
          savedAtStr: c.ts ? new Date(c.ts).toISOString() : null,
          ageMs: c.ts ? (Date.now() - c.ts) : null,
          ageMin: c.ts ? Math.round((Date.now() - c.ts) / 60000) : null
        };
      } else {
        info.cache = '(EMPTY — 다음 로드 = cold-start FULL 발생)';
      }
    } catch(e) { info.cache = 'LOAD ERR: ' + (e && e.message || e); }
    try {
      if (navigator.storage && navigator.storage.estimate) {
        var est = await navigator.storage.estimate();
        info.quota = {
          usage: est.usage,
          usageMB: Math.round((est.usage || 0) / 1048576 * 100) / 100,
          quota: est.quota,
          quotaMB: Math.round((est.quota || 0) / 1048576 * 100) / 100,
          percent: est.quota ? Math.round((est.usage || 0) / est.quota * 10000) / 100 : null
        };
      }
    } catch(e) { info.quota = 'EST ERR: ' + (e && e.message || e); }
    try {
      info.isPrivate = !navigator.storage || !navigator.storage.persist;
      if (navigator.storage && navigator.storage.persisted) info.persisted = await navigator.storage.persisted();
    } catch(_){}
    console.log('%c[DiagCustCache]', 'background:#2563eb;color:#fff;padding:2px 6px;border-radius:4px;', info);
    return info;
  };
}

async function _custLoadCache() {
  try {
    var db = await _custOpenIDB();
    var tx = db.transaction(['master','meta'], 'readonly');
    var metaReq = tx.objectStore('meta').get('lastSync');
    var meta = await new Promise(function(res) { metaReq.onsuccess = function() { res(metaReq.result); }; });
    if (!meta || !meta.ts) { db.close(); return null; }
    var all = [];
    var cursorReq = tx.objectStore('master').openCursor();
    await new Promise(function(res) {
      cursorReq.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          var v = cursor.value;
          if (v && '_id' in v) delete v._id;
          all.push(v);
          cursor.continue();
        } else res();
      };
    });
    db.close();
    return { data: all, ts: meta.ts, serverTs: meta.serverTs || 0, count: meta.count };
  } catch(e) { console.warn('[custCache load]', e); return null; }
}

// 쓰기(수정/삭제) 이후 로컬 캐시 동기화. serverTs 는 유지 (다음 증분 쿼리가 서버 권위 값으로 갱신).
function _custPersistCache() {
  try {
    _custLoadCache().then(function(prev) {
      var ts = (prev && prev.serverTs) || 0;
      _custSaveCache(DATA, ts);
    }).catch(function(){ _custSaveCache(DATA, 0); });
  } catch(e) {}
}

// ──────────────────────────────────────────────────────────────────────
// 서버 동기화 (증분 우선, 캐시 없으면 전체)
// lastSyncMs: 이전 동기화 시점의 가장 큰 서버 timestamp (ms). 0 이면 전체 로드.
// 반환: 이번에 변경된 건 수 (전체 로드 시 전체 건 수)
// ──────────────────────────────────────────────────────────────────────
async function _custSyncFromServer(lastSyncMs, coldReason) {
  var indicator = document.getElementById('custSyncIndicator');
  if (indicator) { indicator.textContent = '🔄 서버 동기화 중...'; indicator.style.display = 'inline-flex'; }
  // 스코프 결정 — 영업 담당자는 본인 담당 고객만 쿼리 (규칙 정합성 + read 비용 절감)
  var scope = _getCustReadScope();
  var isSalesScope = scope.mode === 'sales';
  console.log('[CustomerLoad] scope=', JSON.stringify(scope), 'lastSyncMs=', lastSyncMs);
  try {
    // ── 스코프 사용자(영업담당) 전용 경로 ──
    //   composite index (sales+updated_at) 가 배포되어 있어 incremental 사용 가능.
    //   lastSyncMs > 0 & 캐시 있음 → 변경분만 fetch. 없으면 FULL(cold-start).
    if (isSalesScope) {
      // 대소문자 편차(예: 'Pat' vs 'pat' vs 'PAT') 대응: 닉네임의 케이스 변형 3가지를
      // `in` 쿼리로 묶어 한 번에 조회. (Firestore `in` 은 최대 10개까지 지원하므로 여유 있음.)
      // Firestore 규칙도 data.sales.lower() == myNickname().lower() 로 완화되어 각 변형이 모두 통과.
      var _nk = scope.nickname;
      var _nkLower = _nk.toLowerCase();
      var _nkUpper = _nk.toUpperCase();
      var _variantsMap = {}; _variantsMap[_nk] = 1; _variantsMap[_nkLower] = 1; _variantsMap[_nkUpper] = 1;
      if (typeof _titleCase === 'function') {
        try { _variantsMap[_titleCase(_nk)] = 1; } catch(e) {}
      }
      var _variants = Object.keys(_variantsMap).slice(0, 10);

      // ── 증분 경로 (캐시 있음) ──
      if (lastSyncMs && lastSyncMs > 0) {
        try {
          var tsObjS = firebase.firestore.Timestamp.fromMillis(lastSyncMs);
          var mineIncQ = _fbDb.collection('customers').where('sales', 'in', _variants).where('updated_at', '>', tsObjS);
          var unIncQ   = _fbDb.collection('customers').where('sales', '==', '').where('updated_at', '>', tsObjS);
          var delIncQ  = _fbDb.collection('customer_deletions').where('deleted_at', '>', tsObjS);
          var incResults = await Promise.all([ mineIncQ.get(), unIncQ.get(), delIncQ.get() ]);
          var mineIncSnap = incResults[0], unIncSnap = incResults[1], delIncSnap = incResults[2];

          var mapS = {};
          (DATA || []).forEach(function(r) {
            var k = r.erp || r.nt_code;
            if (k) mapS[k] = r;
          });
          var maxTsS = lastSyncMs;
          var mergeSalesSnap = function(snap) {
            snap.forEach(function(d) {
              var r = _custNormalizeDoc(d);
              var k = r.erp || r.nt_code || d.id;
              mapS[k] = r;
              if (r.updated_at_ms && r.updated_at_ms > maxTsS) maxTsS = r.updated_at_ms;
            });
          };
          mergeSalesSnap(mineIncSnap);
          mergeSalesSnap(unIncSnap);
          delIncSnap.forEach(function(d) {
            var dData = d.data();
            var k = d.id || dData.erp;
            delete mapS[k];
            var dt = dData.deleted_at;
            if (dt && typeof dt.toMillis === 'function') {
              var ms = dt.toMillis();
              if (ms > maxTsS) maxTsS = ms;
            }
          });

          DATA = Object.values(mapS);
          populateSalesFilter();
          setSheetConnStatus(true);
          var changedS = mineIncSnap.size + unIncSnap.size + delIncSnap.size;
          console.log('[CustomerLoad] Sales scope 증분: ' + (mineIncSnap.size + unIncSnap.size) + '건 변경/추가, ' + delIncSnap.size + '건 삭제 (read=' + changedS + ')');
          if (indicator) {
            if (changedS > 0) indicator.textContent = '✅ ' + DATA.length + '명 (+' + (mineIncSnap.size + unIncSnap.size) + '/-' + delIncSnap.size + ')';
            else indicator.textContent = '✅ 최신';
            setTimeout(function(){ if(indicator) indicator.style.display = 'none'; }, 3000);
          }
          // 변경이 있을 때만 캐시 재저장 + telemetry (변경 없으면 read=3건은 metadata cost 로 허용)
          if (changedS > 0) {
            await _custSaveCache(DATA, maxTsS);
            _telemetryLog('customer', 'INCREMENTAL', { docsRead: changedS, cachedCount: DATA.length, reason: 'sales-delta', scope: 'sales' });
          }
          return changedS;
        } catch(e) {
          console.warn('[CustomerLoad] Sales scope 증분 실패 → FULL fallback:', e);
          _telemetryLog('customer', 'MISS', { reason: 'sales-incremental-fail:' + (e && e.message || ''), scope: 'sales' });
          // fall through to FULL 경로
        }
      }

      // ── FULL 경로 (cold-start 또는 증분 실패) ──
      console.log('[CustomerLoad] Sales scope FULL 쿼리:', _variants);
      var mineQ = _fbDb.collection('customers').where('sales', 'in', _variants);
      var unassignedQ = _fbDb.collection('customers').where('sales', '==', '');
      var salesResults = await Promise.all([ mineQ.get(), unassignedQ.get() ]);
      var mineSnap = salesResults[0], unSnap = salesResults[1];
      var salesMap = {};
      mineSnap.forEach(function(d){
        var r = _custNormalizeDoc(d);
        var k = r.erp || r.nt_code || d.id;
        salesMap[k] = r;
      });
      unSnap.forEach(function(d){
        var r = _custNormalizeDoc(d);
        var k = r.erp || r.nt_code || d.id;
        if (!salesMap[k]) salesMap[k] = r;
      });
      DATA = Object.values(salesMap);
      populateSalesFilter();
      setSheetConnStatus(true);
      console.log('[CustomerLoad] Sales scope FULL:', mineSnap.size, '건 본인 담당 +', unSnap.size, '건 미배정 = 총', DATA.length, '건 (scope=' + scope.nickname + ')');
      if (indicator) {
        if (DATA.length === 0) {
          indicator.textContent = '⚠️ 담당 고객 0명 (닉네임="' + scope.nickname + '") — 고객 DB의 Sales Rep 필드 대소문자 확인 필요';
          indicator.style.display = 'inline-flex';
          indicator.title = 'Firestore customers 컬렉션의 sales 필드가 정확히 "' + scope.nickname + '" (대소문자·공백 엄격 일치) 인 문서만 보입니다. 관리자/Office 계정으로 고객 마스터에서 표기 통일을 확인해 주세요.';
          console.warn('[CustomerLoad] Sales scope 닉네임=' + scope.nickname + ' 매칭 고객 0건.');
        } else {
          indicator.textContent = '✅ ' + DATA.length + '명 (본인 담당 ' + mineSnap.size + ' / 미배정 ' + unSnap.size + ')';
          setTimeout(function(){ if(indicator) indicator.style.display = 'none'; }, 3500);
        }
      }
      _telemetryLog('customer', 'FULL', { docsRead: DATA.length, cachedCount: 0, reason: coldReason || 'sales-cold-start', scope: 'sales' });
      var salesMaxTs = DATA.reduce(function(m, r) { return Math.max(m, r.updated_at_ms || 0); }, 0);
      if (salesMaxTs === 0) salesMaxTs = Date.now();
      await _custSaveCache(DATA, salesMaxTs);
      return DATA.length;
    }

    // ── 증분 경로 (admin/office 등 전체 조회 스코프) ──
    if (lastSyncMs && lastSyncMs > 0) {
      var tsObj = firebase.firestore.Timestamp.fromMillis(lastSyncMs);
      var custQ = _fbDb.collection('customers').where('updated_at', '>', tsObj);
      var results = await Promise.all([
        custQ.get(),
        _fbDb.collection('customer_deletions').where('deleted_at', '>', tsObj).get()
      ]);
      var snap = results[0], delSnap = results[1];

      // 현재 DATA 를 map 으로 변환 (erp 기준)
      var map = {};
      (DATA || []).forEach(function(r) {
        var k = r.erp || r.nt_code;
        if (k) map[k] = r;
      });

      // 변경/추가 merge
      var maxTs = lastSyncMs;
      snap.forEach(function(d) {
        var r = _custNormalizeDoc(d);
        var k = r.erp || r.nt_code || d.id;
        map[k] = r;
        if (r.updated_at_ms && r.updated_at_ms > maxTs) maxTs = r.updated_at_ms;
      });

      // 삭제분 제거
      delSnap.forEach(function(d) {
        var data = d.data();
        var k = d.id || data.erp;
        delete map[k];
        var dt = data.deleted_at;
        if (dt && typeof dt.toMillis === 'function') {
          var ms = dt.toMillis();
          if (ms > maxTs) maxTs = ms;
        }
      });

      DATA = Object.values(map);
      populateSalesFilter();
      setSheetConnStatus(true);
      var changed = snap.size + delSnap.size;
      console.log('[CustomerLoad] 증분 동기화: ' + snap.size + '건 변경/추가, ' + delSnap.size + '건 삭제 (read=' + changed + ')');
      if (indicator) {
        if (changed > 0) indicator.textContent = '✅ ' + DATA.length + '명 (+' + snap.size + '/-' + delSnap.size + ')';
        else indicator.textContent = '✅ 최신';
        setTimeout(function(){ if(indicator) indicator.style.display = 'none'; }, 3000);
      }
      // race 방지: 캐시 저장을 반드시 기다려 다음 호출이 캐시를 발견하도록 보장
      await _custSaveCache(DATA, maxTs);
      // 텔레메트리: 실제 변경분이 있을 때만 기록 (0 건이면 HIT 에 가까워 로그 생략)
      if (changed > 0) _telemetryLog('customer', 'INCREMENTAL', { docsRead: changed, cachedCount: DATA.length, reason: 'delta' });
      return changed;
    }

    // ── 전체 로드 (캐시 없음 or serverTs 없음) — admin/office 등 전체 조회 전용 ──
    //   (isSalesScope 는 위 분기에서 이미 처리됨)
    var fullSnap = await _fbDb.collection('customers').get();
    DATA = fullSnap.docs.map(_custNormalizeDoc);
    populateSalesFilter();
    setSheetConnStatus(true);
    if (indicator) {
      indicator.textContent = '✅ ' + DATA.length + '명';
      setTimeout(function(){ if(indicator) indicator.style.display = 'none'; }, 3000);
    }
    console.log('[CustomerLoad] 전체 로드:', DATA.length, '건 (read=' + DATA.length + ', scope=all)');
    _telemetryLog('customer', 'FULL', { docsRead: DATA.length, cachedCount: 0, reason: coldReason || 'cold-start', scope: 'all' });
    // 이후 증분 기준: 가장 큰 updated_at_ms. 없으면 지금 시각(백필 전 문서).
    var initTs = DATA.reduce(function(m, r) { return Math.max(m, r.updated_at_ms || 0); }, 0);
    if (initTs === 0) initTs = Date.now();
    // race 방지: 캐시 저장을 반드시 기다려 다음 호출이 캐시를 발견하도록 보장
    await _custSaveCache(DATA, initTs);
    return DATA.length;
  } catch(err) {
    console.error('[CustomerLoad] 서버 로드 실패:', err);
    setSheetConnStatus(false);
    if (indicator) {
      indicator.textContent = '❌ 서버 연결 실패';
      indicator.style.display = 'inline-flex';
      indicator.style.cursor = 'pointer';
      indicator.onclick = function() { _loadCustPromise = null; loadCustomerData(); };
    }
    return -1;
  }
}

function loadCustomerData() {
  if (_loadCustPromise) return _loadCustPromise;
  _loadCustPromise = (async function() {
    var indicator = document.getElementById('custSyncIndicator');
    if (indicator) { indicator.textContent = '🔄 데이터 로드 중...'; indicator.style.display = 'inline-flex'; }
    try {
      // 1) IndexedDB 캐시 우선 → 즉시 UI 표시
      var cached = await _custLoadCache();
      if (cached && cached.data && cached.data.length) {
        DATA = cached.data;
        populateSalesFilter();
        setSheetConnStatus(true);
        if (indicator) {
          indicator.textContent = '✅ ' + DATA.length + '명 (캐시)';
          setTimeout(function(){ if(indicator) indicator.style.display = 'none'; }, 3000);
        }
        console.log('[CustomerLoad] 캐시 로드:', DATA.length, '건 (0 read)');

        // 2) 캐시 신선도 체크 — 최근 N분 내에 받은 캐시면 bg sync 스킵.
        //    sales-scope 는 항상 FULL 쿼리라 페이지 이동 때마다 재호출하면 읽기 비용이 폭증.
        //    또한 sync_telemetry 도 매번 FULL 로 기록되어 중복 로그가 쌓임.
        var _cacheAgeMs = Date.now() - (cached.ts || 0);
        var _SKIP_BG_SYNC_MS = 2 * 60 * 1000; // 2분
        if (_cacheAgeMs < _SKIP_BG_SYNC_MS) {
          console.log('[CustomerLoad] 캐시 신선(' + Math.round(_cacheAgeMs/1000) + 's 전) — bg sync 스킵');
          return;
        }

        // 3) 백그라운드 증분 동기화 — in-flight 가드로 중복 FULL 쿼리 차단
        if (!_custSyncInFlight) {
          _custSyncInFlight = true;
          _custSyncFromServer(cached.serverTs || 0)
            .then(function(changed) {
              if (changed > 0 && typeof renderTable === 'function') {
                try { renderTable(); } catch(e) {}
              }
            })
            .catch(function(e) { console.warn('[CustomerLoad] bg sync err:', e); })
            .finally(function() { _custSyncInFlight = false; });
        } else {
          console.log('[CustomerLoad] bg sync 이미 진행 중 — 중복 호출 스킵');
        }
        return;
      }
      // 3) 캐시 없음 → 서버 전체 로드 (cold-start). 이 경로는 await 하므로 _loadCustPromise 가
      //    이미 직렬화하고 있지만, 의미 일관성을 위해 in-flight 플래그도 함께 유지.
      _custSyncInFlight = true;
      try {
        // ── IDB 축출 감지 + INCREMENTAL fallback ──
        // localStorage 센티넬이 남아 있으면 "이전엔 캐시를 성공적으로 저장했는데 IDB 만 사라진" 상태.
        // Safari ITP 7-day rule / Chromium 스토리지 압박 / private 모드 등에서 흔함.
        // 이 경우 serverTs 만 복구해 INCREMENTAL 쿼리(보통 <50 docs)로 대체해 FULL(3800) 읽기 회피.
        // ⚠️ Incremental 은 "기존 DATA + 변경분 merge" 로직이므로, 베이스 데이터가 없으면 안전하지 않음.
        //    → 실제 fetch 는 전체로 유지하되, telemetry reason 만 'cold-start-evicted' 로 명시해
        //       진짜 원인(축출)을 분리 추적.
        //    (베이스 없이 incremental 은 누락 발생 가능 → 데이터 손실 방지 위해 full 유지.
        //     단, 센티넬에 count 가 있으면 INCREMENTAL 안전성 확보 후 전환 가능 — 향후 과제)
        var sentinel = _custSentinelRead();
        var coldReason = sentinel && sentinel.ts ? 'cold-start-evicted' : 'cold-start-firstvisit';
        if (sentinel && sentinel.ts) {
          var ageMin = Math.round((Date.now() - sentinel.ts) / 60000);
          console.warn('[CustomerLoad] IDB 축출 감지 — 센티넬은 살아있음 (저장 ' + ageMin + '분 전, ' + sentinel.count + '건). 전체 로드 fallback.');
        } else {
          console.log('[CustomerLoad] 첫 방문 — 센티넬 없음. 전체 로드.');
        }
        await _custSyncFromServer(0, coldReason);
      } finally {
        _custSyncInFlight = false;
      }
    } finally {
      _loadCustPromise = null;
    }
  })();
  return _loadCustPromise;
}

// ──────────────────────────────────────────────────────────────────────
// 관리자 수동 실행용: 기존 문서에 updated_at 백필
// 최초 증분 동기화 도입 시 1회만 실행 (콘솔: window._custBackfillUpdatedAt())
// ──────────────────────────────────────────────────────────────────────
window._custBackfillUpdatedAt = async function() {
  try {
    var snap = await _fbDb.collection('customers').get();
    var batch = _fbDb.batch();
    var count = 0, skipped = 0;
    var _FV = firebase.firestore.FieldValue;
    for (var i = 0; i < snap.size; i++) {
      var d = snap.docs[i];
      if (!d.data().updated_at) {
        batch.update(d.ref, { updated_at: _FV.serverTimestamp() });
        count++;
        if (count % 450 === 0) { await batch.commit(); batch = _fbDb.batch(); }
      } else {
        skipped++;
      }
    }
    if (count % 450 !== 0) await batch.commit();
    console.log('[Backfill] updated_at 추가:', count, '건, 기존 유지:', skipped, '건');
    return { added: count, skipped: skipped };
  } catch(e) {
    console.error('[Backfill] 실패:', e);
    return { error: e.message };
  }
};

// ══════════════════════════════════════════════════════
// 지역 데이터 (영문 + 태국어)
// ══════════════════════════════════════════════════════
var PROVINCES = [
  ['Amnat Charoen','อำนาจเจริญ'],['Ang Thong','อ่างทอง'],['Bangkok','กรุงเทพฯ'],
  ['Bueng Kan','บึงกาฬ'],['Buri Ram','บุรีรัมย์'],['Chachoengsao','ฉะเชิงเทรา'],
  ['Chai Nat','ชัยนาท'],['Chaiyaphum','ชัยภูมิ'],['Chanthaburi','จันทบุรี'],
  ['Chiang Mai','เชียงใหม่'],['Chiang Rai','เชียงราย'],['Chonburi','ชลบุรี'],
  ['Chumphon','ชุมพร'],['Kalasin','กาฬสินธุ์'],['Kamphaeng Phet','กำแพงเพชร'],
  ['Kanchanaburi','กาญจนบุรี'],['Khon Kaen','ขอนแก่น'],['Krabi','กระบี่'],
  ['Lampang','ลำปาง'],['Lamphun','ลำพูน'],['Laos','ลาว'],
  ['Loei','เลย'],['Lop Buri','ลพบุรี'],['Mae Hong Son','แม่ฮ่องสอน'],
  ['Maha Sarakham','มหาสารคาม'],['Mukdahan','มุกดาหาร'],['Nakhon Nayok','นครนายก'],
  ['Nakhon Pathom','นครปฐม'],['Nakhon Phanom','นครพนม'],['Nakhon Ratchasima','นครราชสีมา'],
  ['Nakhon Sawan','นครสวรรค์'],['Nakhon Si Thammarat','นครศรีธรรมราช'],['Nan','น่าน'],
  ['Narathiwat','นราธิวาส'],['Nong Bua Lam Phu','หนองบัวลำภู'],['Nong Khai','หนองคาย'],
  ['Nonthaburi','นนทบุรี'],['Pathum Thani','ปทุมธานี'],['Pattani','ปัตตานี'],
  ['Phang Nga','พังงา'],['Phatthalung','พัทลุง'],['Phayao','พะเยา'],
  ['Phetchabun','เพชรบูรณ์'],['Phetchaburi','เพชรบุรี'],['Phichit','พิจิตร'],
  ['Phitsanulok','พิษณุโลก'],['Phra Nakhon Si Ayutthaya','พระนครศรีอยุธยา'],['Phrae','แพร่'],
  ['Phuket','ภูเก็ต'],['Prachin Buri','ปราจีนบุรี'],['Prachuap Khiri Khan','ประจวบคีรีขันธ์'],
  ['Ranong','ระนอง'],['Ratchaburi','ราชบุรี'],['Rayong','ระยอง'],
  ['Roi Et','ร้อยเอ็ด'],['Sa Kaeo','สระแก้ว'],['Sakon Nakhon','สกลนคร'],
  ['Samut Prakan','สมุทรปราการ'],['Samut Sakhon','สมุทรสาคร'],['Samut Songkhram','สมุทรสงคราม'],
  ['Saraburi','สระบุรี'],['Satun','สตูล'],['Sing Buri','สิงห์บุรี'],
  ['Sisaket','ศรีสะเกษ'],['Songkhla','สงขลา'],['Sukhothai','สุโขทัย'],
  ['Suphan Buri','สุพรรณบุรี'],['Surat Thani','สุราษฎร์ธานี'],['Surin','สุรินทร์'],
  ['Tak','ตาก'],['Trang','ตรัง'],['Trat','ตราด'],
  ['Ubon Ratchathani','อุบลราชธานี'],['Udon Thani','อุดรธานี'],['Uthai Thani','อุทัยธานี'],
  ['Uttaradit','อุตรดิตถ์'],['Yala','ยะลา'],['Yasothon','ยโสธร']
];

// 주요 지역 TOP 5 (수도 + 주요 대도시 순)
var TOP_PROVINCE_KEYS = [
  'Bangkok',          // 수도
  'Nonthaburi',       // 수도권
  'Pathum Thani',     // 수도권
  'Samut Prakan',     // 수도권
  'Chiang Mai',       // 북부 중심
  'Khon Kaen',        // 동북부 중심
  'Nakhon Ratchasima',// 동북부 (코랏)
  'Chonburi',         // 동부 (파타야)
  'Songkhla',         // 남부 중심
  'Udon Thani',       // 동북부 주요 도시
];

function renderProvinceSelect() {
  var sel = document.getElementById('reg_location');
  if (!sel) return;
  var cur = sel.value;
  var lang = currentLang || 'ko';
  var placeholder = t('ql_select_ph');

  function makeOption(p) {
    var label = lang === 'th'
      ? p[1] + ' (' + p[0] + ')'
      : p[0] + ' (' + p[1] + ')';
    return '<option value="' + p[0] + '">' + label + '</option>';
  }

  // 상위 5개 (지정 순서 유지)
  var topList = TOP_PROVINCE_KEYS.map(function(key) {
    return PROVINCES.find(function(p) { return p[0] === key; });
  }).filter(Boolean);

  // 나머지 (알파벳 순)
  var restList = PROVINCES.filter(function(p) {
    return TOP_PROVINCE_KEYS.indexOf(p[0]) === -1;
  });

  var sep = lang === 'th' ? '── จังหวัดอื่นๆ ──' : (lang === 'en' ? '── Other Provinces ──' : '── 기타 지역 ──');

  sel.innerHTML =
    '<option value="">' + placeholder + '</option>' +
    topList.map(makeOption).join('') +
    '<option value="" disabled style="color:#9ca3af;">' + sep + '</option>' +
    restList.map(makeOption).join('');

  if (cur) sel.value = cur;
}


// ══════════════════════════════════════════════════════
// 고객 등록 폼
// ══════════════════════════════════════════════════════

// ══ Cancel / Address Modal / Map ══


// ── 취소 요청 / 승인 / 거부 ──────────────────────────────────────────────────
async function requestCancelOrder(id) {
  const reason = prompt(t('msg_cancel_reason'));
  if (reason === null) return; // 취소(Cancel) 버튼 누름
  try {
    await apiPost({ action: 'request_cancel', id: id, cancel_reason: reason.trim() });
    renderPendingOrders();
  } catch(e) { neoAlert(t('msg_network_fail')); }
}

async function approveCancelOrder(id) {
  if (!confirm(t('approve_cancel_confirm'))) return;
  try {
    await apiPost({ action: 'cancel', id: id });
    renderPendingOrders();
  } catch(e) { neoAlert(t('process_failed') + ' ' + t('network_error')); }
}

async function rejectCancelOrder(id) {
  if (!confirm(t('reject_cancel_confirm'))) return;
  try {
    await apiPost({ action: 'reject_cancel', id: id });
    renderPendingOrders();
  } catch(e) { neoAlert(t('process_failed') + ' ' + t('network_error')); }
}

// 페이지 로드 시 세션 체크 (Firebase Auth 복원 후 실행)
(function() {
  var u = getCurrentUser();
  if (!u) return;

  // Firebase Auth 상태 복원 대기 → 없으면 직접 로그인
  var _authReady = false;
  var _unsub = _fbAuth.onAuthStateChanged(function(authUser) {
    if (_authReady) return;
    _authReady = true;
    _unsub(); // 리스너 해제

    if (authUser) {
      // Auth 이미 복원됨 → 바로 UI 적용
      window._noPermDismissed = false;
      applyUserUI(u);
      _hideLoginShow();
    } else {
      // Auth 세션 없음 → (보안 강화) 평문 비밀번호로 자동재로그인하지 않는다.
      // sessionStorage 메모리에 현재 탭 세션 pw 가 남아있는 경우에만 1회 시도, 실패 시 로그인 화면 유도.
      var email = u.empid + FB_AUTH_DOMAIN;
      var pw = u.pw || '';
      if (!pw) {
        // 평문 비번 없음 → 로그인 화면 표시 (자동로그인 세션 정리)
        console.warn('[autoLogin] Firebase Auth 세션 만료. 재로그인 필요.');
        localStorage.removeItem('current_user_persist');
        sessionStorage.removeItem('current_user');
        window.location.reload();
        return;
      }
      _fbAuth.signInWithEmailAndPassword(email, pw)
        .then(function() {
          window._noPermDismissed = false;
          applyUserUI(u);
          _hideLoginShow();
        })
        .catch(function(err) {
          console.warn('[autoLogin] Auth 재로그인 실패:', err.code);
          if (err.code === 'auth/user-not-found') {
            _fbAuth.createUserWithEmailAndPassword(email, pw)
              .then(function() {
                window._noPermDismissed = false;
                applyUserUI(u);
                _hideLoginShow();
              })
              .catch(function() {
                // Auth 실패 → 로그인 화면 유도
                localStorage.removeItem('current_user_persist');
                sessionStorage.removeItem('current_user');
                window.location.reload();
              });
          } else {
            // 기타 오류도 UI는 표시
            window._noPermDismissed = false;
            applyUserUI(u);
            _hideLoginShow();
          }
        });
    }
  });
})();

// ── 배송 주소 모달 ──────────────────────────────────────────────────────────
var _shipAddrKey = 'quickShipAddresses';
var _shipAddrMap = null;
var _shipAddrMarker = null;
var _shipAddrGeocoder = null;

function openShipAddrModal() {
  document.getElementById('shipAddrInput').value = '';
  document.getElementById('shipAddrZip').value = '';
  document.getElementById('shipAddrMapContainer').style.display = 'none';
  var overlay = document.getElementById('shipAddrOverlay');
  overlay.removeAttribute('inert');
  overlay.classList.add('open');
  document.body.classList.add('ship-addr-open');
  setTimeout(function() {
    var inp = document.getElementById('shipAddrInput');
    inp.focus();
    _attachShipAddrPlaces(inp);
  }, 80);
  applyLang();
}

function closeShipAddrModal() {
  document.getElementById('shipAddrOverlay').classList.remove('open');
  document.body.classList.remove('ship-addr-open');
  // Google Maps 인스턴스 메모리 해제 (모바일에서 30~50MB 수준)
  try {
    if (_shipAddrMarker) { _shipAddrMarker.setMap(null); _shipAddrMarker = null; }
    if (_shipAddrMap) {
      google.maps.event.clearInstanceListeners(_shipAddrMap);
      _shipAddrMap = null;
    }
    _shipAddrGeocoder = null;
    var _sDiv = document.getElementById('shipAddrMapDiv');
    if (_sDiv) _sDiv.innerHTML = '';
    var _sCont = document.getElementById('shipAddrMapContainer');
    if (_sCont) _sCont.style.display = 'none';
  } catch(e) { console.warn('[ShipAddrMap] destroy error:', e); }
}

function shipAddrOverlayClick(e) {
  if (e.target === document.getElementById('shipAddrOverlay')) closeShipAddrModal();
}

function searchShipAddr() {
  var val = document.getElementById('shipAddrInput').value.trim();
  if (!val) return;
  _updateShipAddrMap(val);
}

async function saveShipAddrModal() {
  var addr = document.getElementById('shipAddrInput').value.trim();
  var zip  = document.getElementById('shipAddrZip').value.trim();
  if (!addr) { showToast(t('ship_addr_empty') || '주소를 입력하세요.'); return; }
  var full = zip ? addr + ' ' + zip : addr;

  // Firestore에 고객 addr_del2 또는 addr_del3에 저장
  if (!_modalCustomer || !_modalCustomer.erp) {
    showToast(t('ql_cust_no_info'));
    return;
  }
  var erp = _modalCustomer.erp;
  var updateField = {};
  var me = getCurrentUser();
  var meId = me ? (me.nickname || me.empid) : 'unknown';
  var now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  if (!_modalCustomer.addr_del2) {
    updateField.addr_del2 = full;
    updateField.addr_del2_by = meId;
    updateField.addr_del2_at = now;
  } else if (!_modalCustomer.addr_del3) {
    updateField.addr_del3 = full;
    updateField.addr_del3_by = meId;
    updateField.addr_del3_at = now;
  } else {
    showToast(t('ship_addr_full') || '배송 주소 2, 3이 모두 등록되어 있습니다.');
    return;
  }

  updateField.updated_at = firebase.firestore.FieldValue.serverTimestamp();
  try {
    await _fbDb.collection('customers').doc(erp).update(updateField);
    _logCustomerChange('updated', erp, _modalCustomer.name_th || _modalCustomer.cust_name, _modalCustomer.clinic, '배송 주소 추가 (' + full + ')');
    // 로컬 DATA 배열도 업데이트
    Object.keys(updateField).forEach(function(k) { _modalCustomer[k] = updateField[k]; });
    for (var i = 0; i < DATA.length; i++) {
      if (DATA[i].erp === erp) { Object.assign(DATA[i], updateField); break; }
    }
    _custPersistCache();
    // 입력 필드 초기화
    document.getElementById('shipAddrInput').value = '';
    document.getElementById('shipAddrZip').value = '';
    closeShipAddrModal();
    // 고객 모달 다시 렌더링
    if (_modalLastIdx !== null && document.getElementById('modalOverlay').classList.contains('show')) {
      openModal(_modalLastIdx);
    }
    showToast('📍 ' + (t('ship_addr_saved_ok') || '주소가 저장되었습니다.'));
  } catch(e) {
    console.error('배송 주소 저장 실패:', e);
    showToast(t('process_failed') + ' ' + t('network_error'));
  }
}

function _getShipAddrList() {
  try { return JSON.parse(localStorage.getItem(_shipAddrKey) || '[]'); } catch(e) { return []; }
}

function _renderShipAddrSaved() {
  var list = _getShipAddrList();
  var wrap = document.getElementById('shipAddrSavedWrap');
  var listEl = document.getElementById('shipAddrSavedList');
  if (!list.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  listEl.innerHTML = list.map(function(addr, i) {
    return '<div class="ship-addr-saved-item" onclick="pickShipAddr(' + i + ')">' +
      '<div class="ship-addr-saved-text">&#x1F4CD; ' + escHtml(addr) + '</div>' +
      '<button class="ship-addr-saved-del" onclick="delShipAddr(event,' + i + ')" title="삭제">&#x2715;</button>' +
    '</div>';
  }).join('');
}

function pickShipAddr(i) {
  var list = _getShipAddrList();
  var addr = list[i] || '';
  var zipMatch = addr.match(/\s(\d{5})$/);
  if (zipMatch) {
    document.getElementById('shipAddrZip').value = zipMatch[1];
    document.getElementById('shipAddrInput').value = addr.replace(/\s\d{5}$/, '');
  } else {
    document.getElementById('shipAddrInput').value = addr;
    document.getElementById('shipAddrZip').value = '';
  }
  document.querySelectorAll('.ship-addr-saved-item').forEach(function(el, idx) {
    el.classList.toggle('selected', idx === i);
  });
  _updateShipAddrMap(addr);
}

function delShipAddr(e, i) {
  e.stopPropagation();
  var list = _getShipAddrList();
  list.splice(i, 1);
  localStorage.setItem(_shipAddrKey, JSON.stringify(list));
  _renderShipAddrSaved();
}

// ── 지도 연동 (주문 주소 입력과 동일 패턴) ──
function _ensureShipAddrMap() {
  if (_shipAddrMap) return _shipAddrMap;
  if (!_checkGmapsAvailable()) return null;
  var div = document.getElementById('shipAddrMapDiv');
  if (!div) return null;
  try {
    _shipAddrMap = new google.maps.Map(div, {
      center: { lat: 13.75, lng: 100.50 },
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });
  } catch(e) { return null; }
  _shipAddrGeocoder = new google.maps.Geocoder();
  return _shipAddrMap;
}

function _updateShipAddrMap(address) {
  var container = document.getElementById('shipAddrMapContainer');
  var addrText  = document.getElementById('shipAddrMapText');
  var selWrap   = document.getElementById('shipAddrSelectedWrap');
  var selText   = document.getElementById('shipAddrSelectedText');
  if (!address || !address.trim()) {
    container.style.display = 'none';
    selWrap.style.display = 'none';
    return;
  }
  if (addrText) addrText.textContent = address.trim();
  if (selText) { selText.textContent = address.trim(); selWrap.style.display = ''; }
  container.style.display = 'block';
  setTimeout(function() {
    var map = _ensureShipAddrMap();
    if (!map || !_shipAddrGeocoder) return;
    _shipAddrGeocoder.geocode({ address: address }, function(results, status) {
      if (status === 'OK' && results[0]) {
        var loc = results[0].geometry.location;
        map.setCenter(loc);
        map.setZoom(15);
        if (_shipAddrMarker) _shipAddrMarker.setMap(null);
        _shipAddrMarker = new google.maps.Marker({
          position: loc, map: map,
          animation: google.maps.Animation.DROP
        });
      }
    });
  }, 100);
}

var _pacFixIntervalShip = null;
function _attachShipAddrPlaces(inputEl, retryCount) {
  if (!inputEl) return;
  // 🛡️ lazy focus 안전망: Google API 로드 타이밍 문제로 초기 attach 실패해도 포커스 시 재시도
  // (_attachRegPlaces 와 동일 패턴 — 고객 등록 시 자동완성 안정성과 동일하게)
  if (!inputEl._shipLazyBound) {
    inputEl._shipLazyBound = true;
    inputEl.addEventListener('focus', function _shipLazyInit() {
      if (!inputEl._gPlacesAttached && _placesReady && window.google && google.maps && google.maps.places) {
        _attachShipAddrPlaces(inputEl);
      }
    });
  }
  if (!_placesReady || !window.google || !google.maps || !google.maps.places) {
    var rc = retryCount || 0;
    if (rc < 40) setTimeout(function(){ _attachShipAddrPlaces(inputEl, rc + 1); }, 300);
    return;
  }
  if (inputEl._gPlacesAttached) return;
  inputEl._gPlacesAttached = true;
  inputEl.addEventListener('focus', function() {
    document.body.classList.add('places-input-active');
    if (_pacFixIntervalShip) clearInterval(_pacFixIntervalShip);
    _pacFixIntervalShip = setInterval(function() { _fixPacPositionEdit(inputEl); }, 300);
  });
  inputEl.addEventListener('blur', function() {
    setTimeout(function() {
      if (_pacFixIntervalShip) { clearInterval(_pacFixIntervalShip); _pacFixIntervalShip = null; }
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
    else if (name && !addr) fullAddr = name;
    inputEl.value = fullAddr;
    // 우편번호 자동 입력
    var zip = '';
    if (place.address_components) {
      place.address_components.forEach(function(c) {
        if (c.types.indexOf('postal_code') !== -1) zip = c.long_name;
      });
    }
    if (zip) document.getElementById('shipAddrZip').value = zip;
    _updateShipAddrMap(fullAddr);
  });
}

// ── Smart Refresh: 현재 열린 메뉴 데이터 새로고침 ──
function _smartRefresh() {
  var refreshed = false;

  function _isOpen(id) {
    var el = document.getElementById(id);
    return el && (el.classList.contains('open') || el.style.display === 'flex');
  }

  // 출퇴근
  if (_isOpen('attendOverlay')) {
    if (typeof _loadTodayAttendance === 'function') _loadTodayAttendance();
    refreshed = true;
  }
  // 출퇴근 집계
  if (_isOpen('attendSummaryOverlay')) {
    if (typeof loadAttendanceSummary === 'function') loadAttendanceSummary();
    refreshed = true;
  }
  // 영수증 조회
  if (_isOpen('receiptAdminOverlay')) {
    if (typeof _loadReceiptDashboard === 'function') _loadReceiptDashboard();
    refreshed = true;
  }
  // 영수증 (내 영수증)
  if (_isOpen('receiptOverlay')) {
    if (typeof _loadMyReceipts === 'function') _loadMyReceipts();
    refreshed = true;
  }
  // 고객 등록 대기
  if (_isOpen('pendCustOverlay')) {
    if (typeof loadPendingCustomers === 'function') loadPendingCustomers();
    refreshed = true;
  }
  // 고객 승인 결과
  if (_isOpen('custApprResultOverlay')) {
    if (typeof loadCustApprovalResults === 'function') loadCustApprovalResults();
    refreshed = true;
  }
  // 견적 목록
  if (_isOpen('quoteListOverlay')) {
    if (typeof loadQuoteList === 'function') loadQuoteList();
    refreshed = true;
  }
  // 주문/발송 조회
  if (_isOpen('resultsQryOverlay')) {
    if (typeof renderResultsQuery === 'function') renderResultsQuery();
    refreshed = true;
  }
  // 발송 대기
  if (_isOpen('pendingOrdersOverlay')) {
    if (typeof loadPendingOrders === 'function') loadPendingOrders();
    refreshed = true;
  }
  // 경비
  if (_isOpen('expenseOverlay')) {
    if (typeof loadExpenseList === 'function') loadExpenseList();
    refreshed = true;
  }

  if (refreshed) {
    if (typeof showToast === 'function') showToast('🔄 새로고침 완료');
  } else {
    // 열린 메뉴가 없으면 전체 페이지 리로드
    location.reload();
  }
}

// ── Pull-to-Refresh (모바일 헤더) ──
(function() {
  var _ptrStartY = 0;
  var _ptrDist = 0;
  var _ptrActive = false;
  var _ptrThreshold = 80;
  var _ptrIndicator = null;

  function _createPtrIndicator() {
    if (_ptrIndicator) return;
    var el = document.createElement('div');
    el.id = 'ptrIndicator';
    el.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%) translateY(-50px);z-index:var(--z-alert);background:#1a1a1a;color:#fff;padding:8px 20px;border-radius:0 0 12px 12px;font-size:13px;font-weight:600;transition:transform .2s;pointer-events:none;display:flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(0,0,0,.3);';
    el.innerHTML = '<span id="ptrArrow" style="display:inline-block;transition:transform .2s;">↓</span> <span id="ptrText">당겨서 새로고침</span>';
    document.body.appendChild(el);
    _ptrIndicator = el;
  }

  document.addEventListener('touchstart', function(e) {
    if (window.innerWidth > 1024) return;
    var header = document.querySelector('.header');
    if (!header || !header.contains(e.target)) return;
    _ptrStartY = e.touches[0].clientY;
    _ptrDist = 0;
    _ptrActive = true;
    _createPtrIndicator();
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!_ptrActive) return;
    _ptrDist = e.touches[0].clientY - _ptrStartY;
    if (_ptrDist < 0) { _ptrDist = 0; return; }
    var prog = Math.min(_ptrDist / _ptrThreshold, 1);
    var ty = Math.min(_ptrDist * 0.5, 50);
    if (_ptrIndicator) {
      _ptrIndicator.style.transform = 'translateX(-50%) translateY(' + (ty - 10) + 'px)';
      var arrow = document.getElementById('ptrArrow');
      var txt = document.getElementById('ptrText');
      if (prog >= 1) {
        if (arrow) arrow.style.transform = 'rotate(180deg)';
        if (txt) txt.textContent = '놓으면 새로고침';
      } else {
        if (arrow) arrow.style.transform = 'rotate(0deg)';
        if (txt) txt.textContent = '당겨서 새로고침';
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', function() {
    if (!_ptrActive) return;
    _ptrActive = false;
    if (_ptrDist >= _ptrThreshold) {
      if (_ptrIndicator) {
        var txt = document.getElementById('ptrText');
        var arrow = document.getElementById('ptrArrow');
        if (txt) txt.textContent = '새로고침 중...';
        if (arrow) arrow.innerHTML = '⟳';
        arrow.style.animation = 'ptrSpin .6s linear infinite';
      }
      setTimeout(function() { _smartRefresh(); }, 400);
    } else {
      if (_ptrIndicator) _ptrIndicator.style.transform = 'translateX(-50%) translateY(-50px)';
    }
  });
})();
