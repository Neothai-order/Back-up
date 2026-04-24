// ══════════════════════════════════════════════════════════════════════
// 동기화 모니터 (Sync Monitor) — 관리자 전용
// ──────────────────────────────────────────────────────────────────────
// sync_telemetry 컬렉션을 조회해 캐시가 계속 터지는 사용자 / 기기 감지.
// HIT 는 원천적으로 기록하지 않으므로 여기 보이는 이벤트는 모두 실제 서버 read 발생.
//
// 주요 기능:
//   • 시간 범위 선택 (1일/7일/30일)
//   • 페이지별 필터 (all/customer/product/price/consign/ar)
//   • 사용자별 TOP 집계 (FULL/INCREMENTAL 각각)
//   • 최근 이벤트 로그 테이블
//   • 킬 스위치 토글 (app_config/telemetry.enabled)
// ══════════════════════════════════════════════════════════════════════

var _smRange = 7;           // 기본 7일
var _smPageFilter = 'all';  // 기본 all
var _smEvents = [];         // 최근 조회 결과 캐시
var _smNickMap = {};        // empid → nickname 매핑 (accounts 컬렉션 기반 — 레코드에 nickname 누락 시 폴백)

function openSyncMonitor() {
  var ov = document.getElementById('syncMonitorOverlay');
  if (!ov) { _smBuildOverlay(); ov = document.getElementById('syncMonitorOverlay'); }
  // 검은 헤더 바(z-index:99000, sticky) 높이만큼 상단 오프셋 설정 → 모달이 헤더 아래에 위치
  try {
    var hdr = document.querySelector('.header');
    var h = hdr ? hdr.getBoundingClientRect().height : 0;
    ov.style.setProperty('--sm-top-offset', (Math.max(60, Math.round(h) + 12)) + 'px');
  } catch(e) {}
  ov.style.display = 'flex';
  requestAnimationFrame(function(){ ov.classList.add('open'); });
  _smLoad();
  _smLoadKillSwitch();
}
function closeSyncMonitor() {
  var ov = document.getElementById('syncMonitorOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  setTimeout(function(){ ov.style.display = 'none'; }, 250);
}

function _smBuildOverlay() {
  var html = ''+
  '<div id="syncMonitorOverlay" class="sm-overlay" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99970;align-items:flex-start;justify-content:center;opacity:0;transition:opacity .25s;overflow-y:auto;padding:var(--sm-top-offset,90px) 10px 20px;">'+
    '<div class="sm-panel" style="width:min(1100px,95vw);max-height:calc(100vh - var(--sm-top-offset,90px) - 20px);background:#fff;border-radius:16px;box-shadow:0 25px 60px rgba(0,0,0,.35);overflow:hidden;display:flex;flex-direction:column;transform:translateY(-12px);transition:transform .25s;">'+
      '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#1e293b,#0f172a);color:#fff;">'+
        '<span style="font-size:20px;">📡</span>'+
        '<h2 style="margin:0;font-size:16px;font-weight:700;flex:1;">동기화 모니터 <span style="opacity:.7;font-size:12px;font-weight:400;">sync_telemetry</span></h2>'+
        '<button onclick="_smLoad()" style="padding:6px 14px;background:#3b82f6;color:#fff;border:0;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">🔄 새로고침</button>'+
        '<button onclick="closeSyncMonitor()" style="padding:6px 10px;background:rgba(255,255,255,.15);color:#fff;border:0;border-radius:8px;font-size:14px;cursor:pointer;">✕</button>'+
      '</div>'+

      // 컨트롤 바
      '<div style="padding:12px 20px;background:#f8fafc;border-bottom:1px solid #e5e7eb;display:flex;gap:12px;flex-wrap:wrap;align-items:center;">'+
        '<div style="display:flex;gap:4px;">'+
          '<button class="sm-rng" data-rng="1" onclick="_smSetRange(1)" style="padding:6px 12px;background:#fff;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12px;cursor:pointer;">1일</button>'+
          '<button class="sm-rng" data-rng="7" onclick="_smSetRange(7)" style="padding:6px 12px;background:#2563eb;color:#fff;border:1.5px solid #2563eb;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">7일</button>'+
          '<button class="sm-rng" data-rng="30" onclick="_smSetRange(30)" style="padding:6px 12px;background:#fff;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12px;cursor:pointer;">30일</button>'+
        '</div>'+
        '<div style="width:1px;height:20px;background:#e5e7eb;"></div>'+
        '<select id="smPageFilter" onchange="_smSetPageFilter(this.value)" style="padding:6px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12px;background:#fff;">'+
          '<option value="all">모든 페이지</option>'+
          '<option value="customer">고객</option>'+
          '<option value="product">상품</option>'+
          '<option value="price">가격</option>'+
          '<option value="consign">위탁 출고</option>'+
          '<option value="ar">미수금</option>'+
        '</select>'+
        '<div style="flex:1;"></div>'+
        '<div id="smKillSwitchWrap" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#fff;border:1.5px solid #e5e7eb;border-radius:8px;">'+
          '<span style="font-size:12px;color:#6b7280;">킬 스위치:</span>'+
          '<label style="position:relative;width:40px;height:22px;cursor:pointer;display:inline-block;">'+
            '<input type="checkbox" id="smKillSwitch" onchange="_smToggleKillSwitch(this.checked)" style="opacity:0;width:0;height:0;">'+
            '<span id="smKillSwitchBg" style="position:absolute;inset:0;background:#10b981;border-radius:11px;transition:.25s;">'+
              '<span id="smKillSwitchKnob" style="position:absolute;top:2px;left:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:.25s;transform:translateX(18px);box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'+
            '</span>'+
          '</label>'+
          '<span id="smKillSwitchLabel" style="font-size:12px;font-weight:600;color:#10b981;">ON</span>'+
        '</div>'+
      '</div>'+

      '<div id="smBody" style="flex:1;overflow:auto;padding:16px 20px;">'+
        '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px;">⏳ 불러오는 중...</div>'+
      '</div>'+
    '</div>'+
  '</div>';
  var wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstChild);
  // open 시 투명도/이동 처리
  var style = document.createElement('style');
  style.textContent = '.sm-overlay.open{opacity:1!important}.sm-overlay.open .sm-panel{transform:translateY(0)!important}';
  document.head.appendChild(style);
}

function _smSetRange(d) {
  _smRange = d;
  document.querySelectorAll('.sm-rng').forEach(function(b) {
    var on = parseInt(b.getAttribute('data-rng'),10) === d;
    b.style.background = on ? '#2563eb' : '#fff';
    b.style.color = on ? '#fff' : '#1e293b';
    b.style.borderColor = on ? '#2563eb' : '#e5e7eb';
    b.style.fontWeight = on ? '600' : '400';
  });
  _smLoad();
}
function _smSetPageFilter(p) { _smPageFilter = p; _smRender(); }

async function _smLoad() {
  var body = document.getElementById('smBody');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px;">⏳ 불러오는 중...</div>';
  try {
    var start = firebase.firestore.Timestamp.fromMillis(Date.now() - _smRange * 86400 * 1000);
    var snap = await firebase.firestore().collection('sync_telemetry')
      .where('ts', '>=', start).orderBy('ts', 'desc').limit(2000).get();
    // accounts 컬렉션에서 empid→nickname 매핑 (레코드에 nickname 누락 시 폴백용)
    try {
      if (typeof apiGetAccounts === 'function') {
        var acc = await apiGetAccounts();
        if (acc && acc.ok && Array.isArray(acc.accounts)) {
          _smNickMap = {};
          acc.accounts.forEach(function(a) { if (a && a.empid) _smNickMap[String(a.empid).toUpperCase()] = a.nickname || ''; });
        }
      }
    } catch(e) { /* silent */ }
    _smEvents = [];
    snap.forEach(function(d) {
      var x = d.data();
      var _eid = (x.empid || '').toUpperCase();
      _smEvents.push({
        empid: x.empid || '',
        nickname: x.nickname || _smNickMap[_eid] || '',
        page: x.page || '',
        mode: x.mode || '',
        docsRead: x.docsRead || 0,
        cachedCount: x.cachedCount || 0,
        reason: x.reason || '',
        device: x.device || '',
        ua: x.ua || '',
        ts: (x.ts && typeof x.ts.toMillis === 'function') ? x.ts.toMillis() : 0,
        id: d.id
      });
    });
    _smRender();
  } catch(e) {
    console.error('[SyncMonitor] load failed:', e);
    body.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;font-size:13px;">조회 실패: ' + (e && e.message || e) + '</div>';
  }
}

function _smRender() {
  var body = document.getElementById('smBody');
  if (!body) return;
  var evs = _smEvents.filter(function(e) { return _smPageFilter === 'all' || e.page === _smPageFilter; });

  // 요약 카드
  var fullCount = 0, incCount = 0, missCount = 0, totalDocs = 0;
  evs.forEach(function(e) {
    if (e.mode === 'FULL') fullCount++;
    else if (e.mode === 'INCREMENTAL') incCount++;
    else if (e.mode === 'MISS') missCount++;
    totalDocs += e.docsRead || 0;
  });

  // 사용자별 집계
  var byUser = {};
  evs.forEach(function(e) {
    var k = e.empid || 'unknown';
    if (!byUser[k]) byUser[k] = { empid: e.empid, nickname: e.nickname, FULL: 0, INCREMENTAL: 0, MISS: 0, docs: 0, lastTs: 0, devices: {} };
    byUser[k][e.mode] = (byUser[k][e.mode] || 0) + 1;
    byUser[k].docs += e.docsRead || 0;
    if (e.ts > byUser[k].lastTs) byUser[k].lastTs = e.ts;
    if (e.device) byUser[k].devices[e.device] = true;
  });
  var userRows = Object.values(byUser).sort(function(a,b) {
    // FULL 우선순위 → INCREMENTAL → docs 합
    if (b.FULL !== a.FULL) return b.FULL - a.FULL;
    if (b.INCREMENTAL !== a.INCREMENTAL) return b.INCREMENTAL - a.INCREMENTAL;
    return b.docs - a.docs;
  });

  var html = '';

  // 요약 카드 4개
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">';
  html += _smCard('전체 이벤트', evs.length, '#2563eb', '📊');
  html += _smCard('FULL read', fullCount, '#ef4444', '⚠️');
  html += _smCard('INCREMENTAL', incCount, '#f59e0b', '🔄');
  html += _smCard('받은 문서', totalDocs.toLocaleString(), '#10b981', '📄');
  html += '</div>';

  if (!evs.length) {
    html += '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px;background:#f8fafc;border-radius:12px;">선택한 범위에 이벤트가 없습니다.<br><span style="font-size:11px;opacity:.7;">HIT 는 수집되지 않으므로, 모두가 캐시만 잘 쓰고 있다는 좋은 신호일 수 있습니다.</span></div>';
    body.innerHTML = html;
    return;
  }

  // TOP 사용자 (FULL 많은 순)
  html += '<div style="margin-bottom:16px;">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="font-size:14px;font-weight:700;color:#1e293b;">🏆 캐시 리셋 TOP 사용자</span><span style="font-size:11px;color:#6b7280;">(FULL 많은 순, 클릭 시 상세)</span></div>';
  html += '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">';
  html += '<div style="display:grid;grid-template-columns:40px 1fr 80px 100px 80px 140px 100px;gap:0;padding:10px 12px;background:#f1f5f9;font-size:11px;font-weight:700;color:#475569;">';
  html += '<div>#</div><div>사용자</div><div style="text-align:center;color:#ef4444;">FULL</div><div style="text-align:center;color:#f59e0b;">INCR</div><div style="text-align:center;">MISS</div><div style="text-align:right;">Docs 읽음</div><div style="text-align:right;">최근</div>';
  html += '</div>';
  userRows.slice(0, 20).forEach(function(u, idx) {
    var devList = Object.keys(u.devices).join(',') || '-';
    var ago = _smAgo(u.lastTs);
    var isProb = u.FULL >= 3;
    html += '<div onclick="_smFilterUser(\''+u.empid+'\')" style="display:grid;grid-template-columns:40px 1fr 80px 100px 80px 140px 100px;gap:0;padding:10px 12px;border-top:1px solid #f1f5f9;font-size:12px;cursor:pointer;background:'+(isProb?'#fef2f2':'#fff')+';" onmouseover="this.style.background=\''+(isProb?'#fee2e2':'#f8fafc')+'\'" onmouseout="this.style.background=\''+(isProb?'#fef2f2':'#fff')+'\'">';
    html += '<div style="color:#9ca3af;">'+(idx+1)+'</div>';
    html += '<div><div style="font-weight:600;color:#1e293b;">'+_smEsc(u.empid)+(u.nickname?' <span style="color:#6b7280;font-weight:400;">('+_smEsc(u.nickname)+')</span>':'')+'</div><div style="font-size:10px;color:#9ca3af;">'+_smEsc(devList)+'</div></div>';
    html += '<div style="text-align:center;color:'+(u.FULL>0?'#ef4444':'#9ca3af')+';font-weight:700;">'+u.FULL+'</div>';
    html += '<div style="text-align:center;color:'+(u.INCREMENTAL>0?'#f59e0b':'#9ca3af')+';font-weight:600;">'+u.INCREMENTAL+'</div>';
    html += '<div style="text-align:center;color:'+(u.MISS>0?'#64748b':'#9ca3af')+';">'+u.MISS+'</div>';
    html += '<div style="text-align:right;color:#374151;font-variant-numeric:tabular-nums;">'+u.docs.toLocaleString()+'</div>';
    html += '<div style="text-align:right;color:#6b7280;font-size:11px;">'+ago+'</div>';
    html += '</div>';
  });
  html += '</div></div>';

  // 최근 이벤트
  html += '<div>';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="font-size:14px;font-weight:700;color:#1e293b;">📋 최근 이벤트</span><span id="smUserFilterTag" style="font-size:11px;color:#6b7280;"></span></div>';
  html += '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">';
  html += '<div style="display:grid;grid-template-columns:140px 170px 80px 100px 80px 100px 1fr;gap:0;padding:10px 12px;background:#f1f5f9;font-size:11px;font-weight:700;color:#475569;">';
  html += '<div>시간</div><div>사용자</div><div>페이지</div><div style="text-align:center;">모드</div><div style="text-align:right;">Docs</div><div style="text-align:center;">기기</div><div>사유</div>';
  html += '</div>';
  html += '<div id="smEventList" style="max-height:400px;overflow:auto;">';
  evs.slice(0, 200).forEach(function(e) {
    html += _smEventRow(e);
  });
  html += '</div>';
  html += '</div></div>';

  body.innerHTML = html;
  var pf = document.getElementById('smPageFilter');
  if (pf) pf.value = _smPageFilter;
}

function _smEventRow(e) {
  var modeColor = e.mode === 'FULL' ? '#ef4444' : e.mode === 'INCREMENTAL' ? '#f59e0b' : '#64748b';
  var modeBg = e.mode === 'FULL' ? '#fee2e2' : e.mode === 'INCREMENTAL' ? '#fef3c7' : '#f1f5f9';
  var h = '';
  h += '<div style="display:grid;grid-template-columns:140px 170px 80px 100px 80px 100px 1fr;gap:0;padding:8px 12px;border-top:1px solid #f1f5f9;font-size:11px;" title="'+_smEsc(e.ua)+'">';
  h += '<div style="color:#6b7280;font-variant-numeric:tabular-nums;">'+_smFmtTs(e.ts)+'</div>';
  h += '<div><span style="font-weight:600;color:#1e293b;">'+_smEsc(e.empid)+'</span>'+(e.nickname?' <span style="color:#9ca3af;">('+_smEsc(e.nickname)+')</span>':'')+'</div>';
  h += '<div style="color:#475569;">'+_smEsc(e.page)+'</div>';
  h += '<div style="text-align:center;"><span style="display:inline-block;padding:2px 8px;background:'+modeBg+';color:'+modeColor+';border-radius:6px;font-weight:700;font-size:10px;">'+e.mode+'</span></div>';
  h += '<div style="text-align:right;font-variant-numeric:tabular-nums;color:#1e293b;font-weight:600;">'+(e.docsRead||0).toLocaleString()+'</div>';
  h += '<div style="text-align:center;color:#64748b;">'+_smEsc(e.device)+'</div>';
  h += '<div style="color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+_smEsc(e.reason||'-')+'</div>';
  h += '</div>';
  return h;
}

function _smFilterUser(empid) {
  var list = document.getElementById('smEventList');
  var tag = document.getElementById('smUserFilterTag');
  if (!list) return;
  var evs = _smEvents.filter(function(e) {
    return (_smPageFilter === 'all' || e.page === _smPageFilter) && e.empid === empid;
  });
  var html = '';
  evs.slice(0, 500).forEach(function(e) { html += _smEventRow(e); });
  list.innerHTML = html || '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">해당 사용자 이벤트 없음</div>';
  if (tag) tag.innerHTML = '(<strong style="color:#2563eb;">'+_smEsc(empid)+'</strong> 필터 — <a href="javascript:_smClearUserFilter()" style="color:#2563eb;text-decoration:underline;">전체 보기</a>)';
}
function _smClearUserFilter() {
  var tag = document.getElementById('smUserFilterTag');
  if (tag) tag.textContent = '';
  _smRender();
}

function _smCard(label, value, color, icon) {
  return '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="font-size:16px;">'+icon+'</span><span style="font-size:11px;color:#6b7280;font-weight:600;">'+label+'</span></div>'+
    '<div style="font-size:22px;font-weight:700;color:'+color+';font-variant-numeric:tabular-nums;">'+value+'</div>'+
  '</div>';
}

function _smFmtTs(ms) {
  if (!ms) return '-';
  var d = new Date(ms);
  var M = String(d.getMonth()+1).padStart(2,'0');
  var D = String(d.getDate()).padStart(2,'0');
  var h = String(d.getHours()).padStart(2,'0');
  var m = String(d.getMinutes()).padStart(2,'0');
  return M+'/'+D+' '+h+':'+m;
}
function _smAgo(ms) {
  if (!ms) return '-';
  var diff = Date.now() - ms;
  if (diff < 60000) return '방금';
  if (diff < 3600000) return Math.floor(diff/60000)+'분 전';
  if (diff < 86400000) return Math.floor(diff/3600000)+'시간 전';
  return Math.floor(diff/86400000)+'일 전';
}
function _smEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}

// ── 킬 스위치 ──
async function _smLoadKillSwitch() {
  try {
    var doc = await firebase.firestore().collection('app_config').doc('telemetry').get();
    var enabled = !doc.exists || doc.data().enabled !== false;
    _smApplyKillSwitchUI(enabled);
  } catch(e) {
    console.warn('[SyncMonitor] kill switch read failed:', e);
    _smApplyKillSwitchUI(true);
  }
}
function _smApplyKillSwitchUI(enabled) {
  var cb = document.getElementById('smKillSwitch');
  var bg = document.getElementById('smKillSwitchBg');
  var knob = document.getElementById('smKillSwitchKnob');
  var label = document.getElementById('smKillSwitchLabel');
  if (cb) cb.checked = enabled;
  if (bg) bg.style.background = enabled ? '#10b981' : '#ef4444';
  if (knob) knob.style.transform = enabled ? 'translateX(18px)' : 'translateX(0)';
  if (label) { label.textContent = enabled ? 'ON' : 'OFF'; label.style.color = enabled ? '#10b981' : '#ef4444'; }
}
async function _smToggleKillSwitch(enabled) {
  if (!confirm(enabled ? '텔레메트리 수집을 켭니다. 계속하시겠습니까?' : '텔레메트리 수집을 끕니다. 이 기능을 끄면 더 이상 동기화 이벤트가 기록되지 않습니다. 계속하시겠습니까?')) {
    _smLoadKillSwitch();
    return;
  }
  try {
    await firebase.firestore().collection('app_config').doc('telemetry').set({
      enabled: !!enabled,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    _smApplyKillSwitchUI(enabled);
  } catch(e) {
    console.error('[SyncMonitor] kill switch write failed:', e);
    alert('킬 스위치 변경 실패: ' + (e && e.message || e));
    _smLoadKillSwitch();
  }
}

// 전역 노출 (minify 안전)
window.openSyncMonitor = openSyncMonitor;
window.closeSyncMonitor = closeSyncMonitor;
window._smSetRange = _smSetRange;
window._smSetPageFilter = _smSetPageFilter;
window._smLoad = _smLoad;
window._smFilterUser = _smFilterUser;
window._smClearUserFilter = _smClearUserFilter;
window._smToggleKillSwitch = _smToggleKillSwitch;
