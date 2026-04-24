import pandas as pd
import json
import sys
import re
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

EXCEL_FILE = "Customer master_23032026.xlsx"
OUTPUT_HTML = "고객조회.html"

print(f"Reading {EXCEL_FILE}...")
df = pd.read_excel(EXCEL_FILE, sheet_name='Customer', dtype=str)
df = df.where(pd.notna(df), None)

# Only rows with ERP_Code
df = df[df['ERP_Code'].notna()].copy()
print(f"Total records with ERP_Code: {len(df)}")

col_names = list(df.columns)
# Column indices (0-based)
COL_STATUS    = 0   # A
COL_SALES     = 2   # C
COL_ERP       = 6   # G
COL_NAME_TH   = 7   # H - Customer name Thai
COL_NAME_EN   = 8   # I - Customer name Eng
COL_ADDR1     = 9   # J - Register Address
COL_TEL1      = 11  # L - Tel
COL_CUST_NAME = 12  # M - Customer Name for ERP
COL_CLINIC    = 13  # N - Clinic/Company Name for ERP
COL_NAME_EN2  = 14  # O - Eng name for INV
COL_ADDR2     = 15  # P - Delivery Address
COL_TEL2      = 17  # R - Tel_2
COL_PROVINCE  = 18  # S - Province
COL_DISTRICT  = 19  # T - District
COL_TYPE      = 20  # U - Customer Type
COL_REMARK    = 21  # V - Remark

def v(row, idx):
    val = row.iloc[idx]
    return str(val).strip() if val and str(val).strip() not in ('nan', 'None', '') else ''

records = []
for _, row in df.iterrows():
    erp = v(row, COL_ERP)
    if not erp:
        continue

    name_th = v(row, COL_NAME_TH)
    name_en = v(row, COL_NAME_EN)
    cust_name = v(row, COL_CUST_NAME)
    clinic = v(row, COL_CLINIC)
    name_en2 = v(row, COL_NAME_EN2)

    addr1 = v(row, COL_ADDR1)
    addr2 = v(row, COL_ADDR2)
    address = addr2 if addr2 else addr1

    tel1 = v(row, COL_TEL1)
    tel2 = v(row, COL_TEL2)
    tel = tel2 if tel2 else tel1

    province = v(row, COL_PROVINCE)
    district = v(row, COL_DISTRICT)
    location = ', '.join(filter(None, [district, province]))

    customer_type = v(row, COL_TYPE)
    sales = v(row, COL_SALES)
    status = v(row, COL_STATUS)
    remark = v(row, COL_REMARK)

    # Search tokens - all searchable text
    search_tokens = ' '.join(filter(None, [
        erp, name_th, name_en, cust_name, clinic, name_en2,
        sales, province, district, customer_type
    ])).lower()

    records.append({
        'erp': erp,
        'name_th': name_th,
        'name_en': name_en,
        'cust_name': cust_name,
        'clinic': clinic,
        'name_en2': name_en2,
        'sales': sales,
        'address': address,
        'tel': tel,
        'location': location,
        'type': customer_type,
        'status': status,
        'remark': remark,
        '_search': search_tokens
    })

print(f"Processed {len(records)} records")

data_json = json.dumps(records, ensure_ascii=False)

html_content = f'''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>고객 정보 조회</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: 'Segoe UI', 'Apple SD Gothic Neo', sans-serif;
    background: #f0f4f8;
    color: #1a202c;
    min-height: 100vh;
  }}
  .header {{
    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
    color: white;
    padding: 24px 32px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }}
  .header h1 {{
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }}
  .header p {{
    font-size: 13px;
    opacity: 0.85;
    margin-top: 4px;
  }}
  .main {{
    max-width: 1100px;
    margin: 0 auto;
    padding: 28px 20px;
  }}
  .search-box {{
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.08);
    margin-bottom: 24px;
  }}
  .search-row {{
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }}
  .search-input-wrap {{
    position: relative;
    flex: 1;
    min-width: 260px;
  }}
  .search-input-wrap input {{
    width: 100%;
    padding: 12px 48px 12px 16px;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s;
    background: #fafafa;
  }}
  .search-input-wrap input:focus {{
    border-color: #3b82f6;
    background: white;
  }}
  .search-icon {{
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: 18px;
    pointer-events: none;
  }}
  .autocomplete-list {{
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    z-index: 1000;
    max-height: 280px;
    overflow-y: auto;
    display: none;
  }}
  .autocomplete-list.show {{ display: block; }}
  .autocomplete-item {{
    padding: 10px 16px;
    cursor: pointer;
    font-size: 14px;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }}
  .autocomplete-item:last-child {{ border-bottom: none; }}
  .autocomplete-item:hover, .autocomplete-item.active {{
    background: #eff6ff;
  }}
  .autocomplete-item .ac-main {{
    font-weight: 500;
    color: #1e293b;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }}
  .autocomplete-item .ac-sub {{
    font-size: 12px;
    color: #64748b;
    white-space: nowrap;
  }}
  .ac-highlight {{ color: #2563eb; font-weight: 700; }}
  .btn-search {{
    padding: 12px 28px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    white-space: nowrap;
  }}
  .btn-search:hover {{ background: #1d4ed8; }}
  .btn-clear {{
    padding: 12px 18px;
    background: #f1f5f9;
    color: #475569;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
    white-space: nowrap;
  }}
  .btn-clear:hover {{ background: #e2e8f0; }}
  .search-hint {{
    margin-top: 12px;
    font-size: 12px;
    color: #94a3b8;
  }}
  .search-hint span {{ margin-right: 12px; }}
  .results-header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }}
  .result-count {{
    font-size: 14px;
    color: #64748b;
    font-weight: 500;
  }}
  .result-count strong {{ color: #2563eb; }}
  .no-result {{
    text-align: center;
    padding: 60px 20px;
    color: #94a3b8;
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.08);
  }}
  .no-result .icon {{ font-size: 48px; margin-bottom: 12px; }}
  .no-result p {{ font-size: 15px; }}
  .cards-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 16px;
  }}
  .card {{
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.08);
    border: 1px solid #f1f5f9;
    transition: box-shadow 0.2s, transform 0.1s;
    cursor: pointer;
  }}
  .card:hover {{
    box-shadow: 0 4px 16px rgba(37,99,235,0.12);
    transform: translateY(-2px);
    border-color: #bfdbfe;
  }}
  .card-top {{
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
    gap: 8px;
  }}
  .card-erp {{
    font-size: 12px;
    font-weight: 700;
    color: #2563eb;
    background: #eff6ff;
    padding: 3px 8px;
    border-radius: 20px;
    white-space: nowrap;
  }}
  .card-type {{
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 20px;
    white-space: nowrap;
  }}
  .type-clinic {{ background: #f0fdf4; color: #166534; }}
  .type-hospital {{ background: #fef3c7; color: #92400e; }}
  .type-company {{ background: #fdf4ff; color: #7e22ce; }}
  .type-university {{ background: #fff7ed; color: #c2410c; }}
  .type-general {{ background: #f1f5f9; color: #475569; }}
  .card-name {{
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 4px;
    line-height: 1.3;
  }}
  .card-name-sub {{
    font-size: 13px;
    color: #64748b;
    margin-bottom: 12px;
  }}
  .card-divider {{
    height: 1px;
    background: #f1f5f9;
    margin: 12px 0;
  }}
  .card-info {{
    display: grid;
    gap: 7px;
  }}
  .info-row {{
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 13px;
  }}
  .info-label {{
    color: #94a3b8;
    font-weight: 500;
    min-width: 70px;
    flex-shrink: 0;
  }}
  .info-value {{
    color: #334155;
    flex: 1;
    word-break: break-all;
  }}
  .info-value.tel a {{
    color: #2563eb;
    text-decoration: none;
  }}
  .info-value.tel a:hover {{ text-decoration: underline; }}
  .status-badge {{
    display: inline-block;
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 600;
  }}
  .status-active {{ background: #dcfce7; color: #15803d; }}
  .status-inactive {{ background: #fee2e2; color: #dc2626; }}

  /* Modal */
  .modal-overlay {{
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 2000;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }}
  .modal-overlay.show {{ display: flex; }}
  .modal {{
    background: white;
    border-radius: 16px;
    padding: 32px;
    max-width: 560px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    position: relative;
  }}
  .modal-close {{
    position: absolute;
    top: 16px;
    right: 16px;
    background: #f1f5f9;
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: 16px;
    cursor: pointer;
    color: #64748b;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .modal-close:hover {{ background: #e2e8f0; }}
  .modal-erp {{
    font-size: 13px;
    font-weight: 700;
    color: #2563eb;
    background: #eff6ff;
    padding: 4px 10px;
    border-radius: 20px;
    display: inline-block;
    margin-bottom: 12px;
  }}
  .modal-name {{
    font-size: 22px;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 4px;
    line-height: 1.2;
  }}
  .modal-name-sub {{
    font-size: 14px;
    color: #64748b;
    margin-bottom: 20px;
  }}
  .modal-section {{
    background: #f8fafc;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 12px;
  }}
  .modal-section-title {{
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 12px;
  }}
  .modal-info-row {{
    display: flex;
    gap: 12px;
    margin-bottom: 10px;
    font-size: 14px;
  }}
  .modal-info-row:last-child {{ margin-bottom: 0; }}
  .modal-info-label {{
    color: #94a3b8;
    font-weight: 600;
    min-width: 90px;
    flex-shrink: 0;
  }}
  .modal-info-value {{
    color: #1e293b;
    flex: 1;
    word-break: break-word;
  }}
  .modal-info-value a {{
    color: #2563eb;
    text-decoration: none;
  }}
  .modal-info-value a:hover {{ text-decoration: underline; }}
  .copy-btn {{
    background: none;
    border: none;
    cursor: pointer;
    color: #94a3b8;
    font-size: 13px;
    padding: 2px 4px;
    border-radius: 4px;
    margin-left: 4px;
    vertical-align: middle;
  }}
  .copy-btn:hover {{ color: #2563eb; background: #eff6ff; }}
  .copied-toast {{
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: #1e293b;
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    opacity: 0;
    transition: all 0.3s;
    z-index: 3000;
    pointer-events: none;
  }}
  .copied-toast.show {{
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }}
  .pagination {{
    display: flex;
    justify-content: center;
    gap: 6px;
    margin-top: 24px;
    flex-wrap: wrap;
  }}
  .page-btn {{
    padding: 7px 13px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: white;
    font-size: 13px;
    cursor: pointer;
    color: #475569;
    transition: all 0.15s;
  }}
  .page-btn:hover {{ background: #eff6ff; border-color: #93c5fd; color: #2563eb; }}
  .page-btn.active {{ background: #2563eb; color: white; border-color: #2563eb; font-weight: 600; }}
  .page-btn:disabled {{ opacity: 0.4; cursor: not-allowed; }}
  @media (max-width: 600px) {{
    .header {{ padding: 16px 20px; }}
    .main {{ padding: 16px 12px; }}
    .search-box {{ padding: 16px; }}
    .cards-grid {{ grid-template-columns: 1fr; }}
    .modal {{ padding: 24px 20px; }}
  }}
</style>
</head>
<body>

<div class="header">
  <h1>&#x1F50D; 고객 정보 조회 시스템</h1>
  <p>ERP 코드, 고객명, 클리닉/회사명으로 검색 · 총 {len(records):,}개 고객</p>
</div>

<div class="main">
  <div class="search-box">
    <div class="search-row">
      <div class="search-input-wrap">
        <input type="text" id="searchInput" placeholder="ERP 코드, 고객명, 클리닉명, 회사명 입력..." autocomplete="off" />
        <span class="search-icon">&#x1F50D;</span>
        <div class="autocomplete-list" id="autocompleteList"></div>
      </div>
      <button class="btn-search" onclick="doSearch()">검색</button>
      <button class="btn-clear" onclick="clearSearch()">초기화</button>
    </div>
    <div class="search-hint">
      <span>&#128204; ERP 코드로 정확 검색</span>
      <span>&#128204; 고객명 / 클리닉명 부분 검색</span>
      <span>&#128204; 유사 키워드도 지원</span>
    </div>
  </div>

  <div id="resultsArea"></div>
</div>

<!-- Modal -->
<div class="modal-overlay" id="modalOverlay" onclick="closeModal(event)">
  <div class="modal" id="modal">
    <button class="modal-close" onclick="closeModalDirect()">&#x2715;</button>
    <div id="modalContent"></div>
  </div>
</div>

<div class="copied-toast" id="copiedToast">클립보드에 복사됨</div>

<script>
const DATA = {data_json};

let currentResults = [];
let currentPage = 1;
const PAGE_SIZE = 20;
let acIndex = -1;

const searchInput = document.getElementById('searchInput');
const autocompleteList = document.getElementById('autocompleteList');

searchInput.addEventListener('input', onInput);
searchInput.addEventListener('keydown', onKeyDown);
document.addEventListener('click', (e) => {{
  if (!e.target.closest('.search-input-wrap')) hideAutocomplete();
}});

function normalize(s) {{
  return (s || '').toLowerCase().replace(/\\s+/g, ' ').trim();
}}

// Levenshtein distance for fuzzy matching
function levenshtein(a, b) {{
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({{length: m+1}}, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {{
    for (let j = 1; j <= n; j++) {{
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }}
  }}
  return dp[m][n];
}}

function fuzzyScore(query, text) {{
  if (!text) return 0;
  const q = normalize(query);
  const t = normalize(text);
  if (t.includes(q)) return 100;
  // Token-by-token
  const tokens = q.split(' ').filter(Boolean);
  const tokenScore = tokens.reduce((acc, tok) => {{
    if (t.includes(tok)) return acc + (tok.length / q.length) * 80;
    return acc;
  }}, 0);
  if (tokenScore > 0) return tokenScore;
  // Levenshtein for short queries
  if (q.length >= 3) {{
    const words = t.split(' ');
    const minDist = Math.min(...words.map(w => levenshtein(q, w.substring(0, q.length + 2))));
    const maxDist = Math.max(q.length, 3);
    if (minDist <= Math.max(1, Math.floor(q.length / 3))) {{
      return Math.max(0, 40 - minDist * 10);
    }}
  }}
  return 0;
}}

function scoreRecord(query, rec) {{
  const q = normalize(query);
  if (!q) return 0;
  // Exact ERP match
  if (normalize(rec.erp) === q) return 200;
  if (normalize(rec.erp).includes(q)) return 180;
  // Score across searchable fields with weights
  const fields = [
    [rec.erp, 120],
    [rec.cust_name, 100],
    [rec.clinic, 100],
    [rec.name_en, 90],
    [rec.name_en2, 85],
    [rec.name_th, 80],
    [rec.sales, 40],
    [rec.location, 30],
  ];
  let best = 0;
  for (const [val, weight] of fields) {{
    const s = fuzzyScore(q, val);
    if (s > 0) best = Math.max(best, s * weight / 100);
  }}
  return best;
}}

function searchRecords(query) {{
  if (!query.trim()) return [];
  const scored = DATA.map(r => ({{ rec: r, score: scoreRecord(query, r) }}))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map(x => x.rec);
}}

function onInput() {{
  const q = searchInput.value.trim();
  if (q.length < 1) {{ hideAutocomplete(); return; }}
  const matches = searchRecords(q).slice(0, 8);
  if (matches.length === 0) {{ hideAutocomplete(); return; }}
  acIndex = -1;
  autocompleteList.innerHTML = matches.map((r, i) => {{
    const main = highlight(r.cust_name || r.name_en || r.name_th || r.erp, q);
    const sub = r.clinic || r.name_en2 || '';
    return `<div class="autocomplete-item" data-idx="${{i}}" onmousedown="selectAC(${{i}})">
      <span class="ac-main">${{main}}</span>
      <span class="ac-sub">${{r.erp}}${{sub ? ' · ' + sub.substring(0, 20) : ''}}</span>
    </div>`;
  }}).join('');
  autocompleteList._matches = matches;
  autocompleteList.classList.add('show');
}}

function highlight(text, query) {{
  if (!text || !query) return text || '';
  const escaped = query.replace(/[.*+?^${{}}()|[\\]\\\\]/g, '\\\\$&');
  return text.replace(new RegExp(`(${{escaped}})`, 'gi'), '<span class="ac-highlight">$1</span>');
}}

function onKeyDown(e) {{
  const items = autocompleteList.querySelectorAll('.autocomplete-item');
  if (e.key === 'ArrowDown') {{
    e.preventDefault();
    acIndex = Math.min(acIndex + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('active', i === acIndex));
    if (items[acIndex]) searchInput.value = autocompleteList._matches[acIndex].cust_name || autocompleteList._matches[acIndex].name_en || searchInput.value;
  }} else if (e.key === 'ArrowUp') {{
    e.preventDefault();
    acIndex = Math.max(acIndex - 1, -1);
    items.forEach((el, i) => el.classList.toggle('active', i === acIndex));
  }} else if (e.key === 'Enter') {{
    e.preventDefault();
    if (acIndex >= 0 && autocompleteList._matches) {{
      const r = autocompleteList._matches[acIndex];
      searchInput.value = r.cust_name || r.name_en || r.erp;
    }}
    hideAutocomplete();
    doSearch();
  }} else if (e.key === 'Escape') {{
    hideAutocomplete();
  }}
}}

function selectAC(i) {{
  const r = autocompleteList._matches[i];
  searchInput.value = r.cust_name || r.name_en || r.erp;
  hideAutocomplete();
  doSearch();
}}

function hideAutocomplete() {{
  autocompleteList.classList.remove('show');
  acIndex = -1;
}}

function doSearch() {{
  const q = searchInput.value.trim();
  currentResults = searchRecords(q);
  currentPage = 1;
  renderResults();
}}

function clearSearch() {{
  searchInput.value = '';
  currentResults = [];
  currentPage = 1;
  hideAutocomplete();
  document.getElementById('resultsArea').innerHTML = '';
}}

function typeClass(t) {{
  if (!t) return 'type-general';
  const tl = t.toLowerCase();
  if (tl.includes('clinic')) return 'type-clinic';
  if (tl.includes('hospital')) return 'type-hospital';
  if (tl.includes('company') || tl.includes('corporate')) return 'type-company';
  if (tl.includes('university') || tl.includes('school')) return 'type-university';
  return 'type-general';
}}

function renderResults() {{
  const area = document.getElementById('resultsArea');
  if (currentResults.length === 0) {{
    area.innerHTML = `<div class="no-result"><div class="icon">&#x1F50D;</div><p>검색 결과가 없습니다.<br>다른 검색어를 입력해 보세요.</p></div>`;
    return;
  }}
  const total = currentResults.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = currentResults.slice(start, start + PAGE_SIZE);

  const q = searchInput.value.trim();
  const cards = pageItems.map((r, i) => {{
    const displayName = r.cust_name || r.name_th || r.name_en || '-';
    const subName = r.name_en2 || r.name_en || r.name_th || '';
    const affil = r.clinic || r.name_en2 || '-';
    return `<div class="card" onclick="openModal(${{start + i}})">
      <div class="card-top">
        <span class="card-erp">${{r.erp}}</span>
        <span class="card-type ${{typeClass(r.type)}}">${{r.type || 'GENERAL'}}</span>
      </div>
      <div class="card-name">${{displayName}}</div>
      ${{subName && subName !== displayName ? `<div class="card-name-sub">${{subName.substring(0, 50)}}</div>` : ''}}
      <div class="card-divider"></div>
      <div class="card-info">
        ${{r.clinic ? `<div class="info-row"><span class="info-label">소속</span><span class="info-value">${{r.clinic}}</span></div>` : ''}}
        ${{r.sales ? `<div class="info-row"><span class="info-label">영업담당</span><span class="info-value">${{r.sales}}</span></div>` : ''}}
        ${{r.tel ? `<div class="info-row"><span class="info-label">연락처</span><span class="info-value tel"><a href="tel:${{r.tel}}">${{r.tel}}</a></span></div>` : ''}}
        ${{r.location ? `<div class="info-row"><span class="info-label">지역</span><span class="info-value">${{r.location}}</span></div>` : ''}}
      </div>
    </div>`;
  }}).join('');

  let paginationHtml = '';
  if (totalPages > 1) {{
    const pages = [];
    pages.push(`<button class="page-btn" onclick="goPage(${{currentPage - 1}})" ${{currentPage === 1 ? 'disabled' : ''}}>&#8249;</button>`);
    for (let p = 1; p <= totalPages; p++) {{
      if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {{
        pages.push(`<button class="page-btn ${{p === currentPage ? 'active' : ''}}" onclick="goPage(${{p}})">${{p}}</button>`);
      }} else if (p === currentPage - 3 || p === currentPage + 3) {{
        pages.push(`<span style="padding:7px 4px;color:#94a3b8">···</span>`);
      }}
    }}
    pages.push(`<button class="page-btn" onclick="goPage(${{currentPage + 1}})" ${{currentPage === totalPages ? 'disabled' : ''}}>&#8250;</button>`);
    paginationHtml = `<div class="pagination">${{pages.join('')}}</div>`;
  }}

  area.innerHTML = `
    <div class="results-header">
      <div class="result-count">검색 결과 <strong>${{total.toLocaleString()}}건</strong>${{total > PAGE_SIZE ? ` (${{start+1}}–${{Math.min(start+PAGE_SIZE, total)}} 표시)` : ''}}</div>
    </div>
    <div class="cards-grid">${{cards}}</div>
    ${{paginationHtml}}
  `;
}}

function goPage(p) {{
  const totalPages = Math.ceil(currentResults.length / PAGE_SIZE);
  if (p < 1 || p > totalPages) return;
  currentPage = p;
  renderResults();
  window.scrollTo({{top: 0, behavior: 'smooth'}});
}}

function openModal(idx) {{
  const r = currentResults[idx];
  if (!r) return;
  const displayName = r.cust_name || r.name_th || r.name_en || '-';
  const subName = (r.name_en2 || r.name_en) && (r.name_en2 || r.name_en) !== displayName
    ? (r.name_en2 || r.name_en) : '';

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-erp">${{r.erp}}</div>
    <div class="modal-name">${{displayName}}</div>
    ${{subName ? `<div class="modal-name-sub">${{subName}}</div>` : ''}}
    ${{r.name_th && r.name_th !== displayName ? `<div class="modal-name-sub" style="font-size:13px;color:#94a3b8">${{r.name_th}}</div>` : ''}}

    <div class="modal-section">
      <div class="modal-section-title">기본 정보</div>
      ${{row('ERP 코드', r.erp, true)}}
      ${{row('고객 유형', r.type)}}
      ${{row('상태', r.status ? `<span class="status-badge ${{r.status === 'Active' ? 'status-active' : 'status-inactive'}}">${{r.status}}</span>` : '')}}
      ${{row('영업담당자', r.sales)}}
    </div>

    <div class="modal-section">
      <div class="modal-section-title">소속 및 연락처</div>
      ${{row('소속(클리닉/회사)', r.clinic)}}
      ${{row('영문 소속명', r.name_en2)}}
      ${{row('연락처', r.tel ? `<a href="tel:${{r.tel}}">${{r.tel}}</a>` : '', r.tel ? true : false, r.tel)}}
    </div>

    <div class="modal-section">
      <div class="modal-section-title">주소</div>
      ${{row('등록 주소', r.address)}}
      ${{row('지역', r.location)}}
    </div>

    ${{r.remark ? `<div class="modal-section"><div class="modal-section-title">비고</div>${{row('메모', r.remark)}}</div>` : ''}}
  `;
  document.getElementById('modalOverlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}}

function row(label, value, copyable, copyVal) {{
  if (!value) return '';
  return `<div class="modal-info-row">
    <span class="modal-info-label">${{label}}</span>
    <span class="modal-info-value">${{value}}${{copyable ? `<button class="copy-btn" onclick="copyText('${{(copyVal || value).replace(/'/g, "\\\\'")}}')" title="복사">&#x2398;</button>` : ''}}</span>
  </div>`;
}}

function closeModal(e) {{
  if (e.target === document.getElementById('modalOverlay')) closeModalDirect();
}}

function closeModalDirect() {{
  document.getElementById('modalOverlay').classList.remove('show');
  document.body.style.overflow = '';
}}

document.addEventListener('keydown', (e) => {{
  if (e.key === 'Escape') closeModalDirect();
}});

function copyText(text) {{
  navigator.clipboard.writeText(text).then(() => {{
    const toast = document.getElementById('copiedToast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  }});
}}

// Initial state
document.getElementById('resultsArea').innerHTML = `
  <div class="no-result">
    <div class="icon">&#x1F4CB;</div>
    <p>위 검색창에 ERP 코드, 고객명, 클리닉명 등을<br>입력하여 고객을 검색하세요.</p>
  </div>`;

searchInput.focus();
</script>
</body>
</html>
'''

with open(OUTPUT_HTML, 'w', encoding='utf-8') as f:
    f.write(html_content)

print(f"\nDone! Output: {OUTPUT_HTML}")
print("Open 고객조회.html in a browser to use the app.")
