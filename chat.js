// Neo Sales App - Real-time Chat System (auto-separated)
// ── 실시간 채팅 시스템 ──────────────────────────────────────────────────────
var _chatWindows = {}; // { peerEmpid: { unsub, unsubMeta, el, roomId, peerName, peerLastRead, msgDocs } }
var _chatMaxWindows = 3;
var _chatGlobalUnsub = null; // 전역 수신 리스너
var _chatBadgeUnsub = null; // 배지 실시간 리스너 (별도 관리)
var _chatLastSnap = null; // 마지막 chats 스냅샷 캐시
var _chatLastRenderedHash = ''; // 마지막 렌더링 해시 (변경 없으면 스킵)
var _chatClosedRecently = {}; // { peerEmpid: timestamp } — 닫은 직후 재오픈 방지
var _chatListOpen = false;
var _chatListUnsub = null;

// ── 클라이언트 측 "대화 삭제 기준 시점" (Firestore 규칙상 메시지 삭제는 admin만 가능하므로
//     클라이언트에서 timestamp 기준으로 이전 메시지를 숨기는 방식으로 처리) ──
function _chatGetClearedBefore(roomId) {
  try {
    var v = localStorage.getItem('chat_cleared_' + roomId);
    return v ? parseInt(v, 10) : 0;
  } catch(e) { return 0; }
}
function _chatSetClearedBefore(roomId, ts) {
  try { localStorage.setItem('chat_cleared_' + roomId, String(ts)); } catch(e) {}
}

// ── 메신저 닫기 + 홈으로 이동 ──
function closeChatListToHome() {
  var panel = document.getElementById('chatListPanel');
  if (panel && _chatListOpen) {
    _chatListOpen = false;
    panel.classList.add('closing');
    panel.classList.remove('open');
    setTimeout(function(){ panel.classList.remove('closing'); }, 350);
  }
  if (window.innerWidth <= 1024 && typeof showMobileHome === 'function') {
    showMobileHome();
  }
}

// ── 메신저 헤더 스와이프 다운으로 닫기 ──
(function() {
  var _swStartY = 0, _swDist = 0, _swActive = false;
  document.addEventListener('DOMContentLoaded', function() {
    var hdr = document.getElementById('chatListHdr');
    if (!hdr) return;
    hdr.addEventListener('touchstart', function(e) {
      if (window.innerWidth > 1024) return;
      _swStartY = e.touches[0].clientY;
      _swDist = 0;
      _swActive = true;
    }, { passive: true });
    hdr.addEventListener('touchmove', function(e) {
      if (!_swActive) return;
      _swDist = e.touches[0].clientY - _swStartY;
    }, { passive: true });
    hdr.addEventListener('touchend', function() {
      if (!_swActive) return;
      _swActive = false;
      if (_swDist > 60) closeChatListToHome();
    });
  });
})();

// ── 메신저 리스트 토글 ──
function toggleChatList() {
  var panel = document.getElementById('chatListPanel');
  if (_chatListOpen) {
    // 이미 열려 있으면 → 슬라이드 다운 닫기
    _chatListOpen = false;
    panel.classList.add('closing');
    panel.classList.remove('open');
    setTimeout(function(){ panel.classList.remove('closing'); }, 350);
  } else {
    // 닫혀 있으면 → 슬라이드 업 열기
    _chatListOpen = true;
    panel.classList.add('open');
    _chatLastRenderedHash = ''; // 열 때 해시 초기화 → 첫 렌더 보장
    _stopMobMsgBlink(); // 메신저 열면 깜빡임 중지
    requestNotificationPermission();
    if ((!_acctCache || !_acctCache.length) && typeof apiGetAccounts === 'function') {
      apiGetAccounts().then(function(res) {
        _acctCache = (res && res.accounts) || [];
        _loadChatList();
      }).catch(function() {
        _loadChatList();
      });
    } else {
      _loadChatList();
    }
  }
}

function _loadChatList() {
  // 별도 리스너 생성하지 않음 — _chatBadgeUnsub가 데이터 변경 감지 후 렌더링 담당
  // 여기서는 현재 캐시된 스냅샷으로 즉시 1회 렌더링만 수행
  if (_chatLastSnap) {
    var me = getCurrentUser();
    if (!me) return;
    var sorted = _chatLastSnap.docs.slice().sort(function(a, b) {
      var aData = a.data(), bData = b.data();
      var aPeer = (aData.participants || []).find(function(p){ return p !== me.empid; }) || '';
      var bPeer = (bData.participants || []).find(function(p){ return p !== me.empid; }) || '';
      // 1순위: 온라인 사용자 우선
      var aOnline = (_onlineUsers || []).some(function(u){ return u.empid === aPeer; }) ? 1 : 0;
      var bOnline = (_onlineUsers || []).some(function(u){ return u.empid === bPeer; }) ? 1 : 0;
      if (bOnline !== aOnline) return bOnline - aOnline;
      // 2순위: 마지막 대화 시간
      var aTs = aData.lastTs, bTs = bData.lastTs;
      var aTime = aTs ? (aTs.toDate ? aTs.toDate().getTime() : new Date(aTs).getTime()) : 0;
      var bTime = bTs ? (bTs.toDate ? bTs.toDate().getTime() : new Date(bTs).getTime()) : 0;
      var aLocal = _chatLocalSendTimes[a.id] || 0;
      var bLocal = _chatLocalSendTimes[b.id] || 0;
      return Math.max(bTime, bLocal) - Math.max(aTime, aLocal);
    });
    _renderChatList(sorted, me);
  }
}

var _chatAllAccounts = null; // 전체 가입자 캐시
var _chatAccountsLoading = false; // accounts 로딩 중 플래그
var _chatPrevUnreadRooms = {}; // 이전 읽지 않은 채팅방 추적 (알림용)
var _chatLocalSendTimes = {}; // 로컬 메시지 전송 시각 캐시 (roomId → timestamp ms)

function _renderChatList(docs, me) {
  var body = document.getElementById('chatListBody');
  var totalUnread = 0;
  var _newUnreadRooms = {}; // 이번 스냅샷의 읽지 않은 방

  // 채팅 기록이 있는 사람 렌더링 (상위 5명만)
  var chatHtml = '';
  var chatPeerSet = {}; // 이미 채팅 목록에 있는 empid
  var _chatVisibleCount = 0;
  var _chatMaxVisible = 5;
  docs.forEach(function(d) {
    var data = d.data();
    var peerEmpid = (data.participants || []).find(function(p) { return p !== me.empid; });
    if (!peerEmpid) return;
    // 클라이언트 측 삭제 마커: 마지막 메시지가 삭제 기준 시점 이전이면 목록에서 숨김
    //  (새 메시지가 도착하면 lastTs > clearBefore 이 되어 자동으로 다시 표시됨)
    var _roomClrBefore = _chatGetClearedBefore(d.id);
    if (_roomClrBefore > 0) {
      var _lastTsRaw = data.lastTs;
      var _lastMs = _lastTsRaw ? (_lastTsRaw.toDate ? _lastTsRaw.toDate().getTime() : new Date(_lastTsRaw).getTime()) : 0;
      if (_lastMs <= _roomClrBefore) return;
    }
    chatPeerSet[peerEmpid] = true;
    var peerName = '';
    if (data['name_' + peerEmpid]) peerName = data['name_' + peerEmpid];
    else if (data.lastFrom === peerEmpid && data.lastFromName) peerName = data.lastFromName;
    if (!peerName || peerName === peerEmpid) {
      var cachedAcct = (_acctCache || []).find(function(a) { return a.empid === peerEmpid; });
      if (cachedAcct && cachedAcct.name) peerName = cachedAcct.name;
    }
    if (!peerName || peerName === peerEmpid) {
      var onlineUser = (_onlineUsers || []).find(function(u) { return u.empid === peerEmpid; });
      if (onlineUser && onlineUser.name) peerName = onlineUser.name;
    }
    // 전체 가입자 캐시에서도 찾기
    if ((!peerName || peerName === peerEmpid) && _chatAllAccounts) {
      var allAcct = _chatAllAccounts.find(function(a) { return a.empid === peerEmpid; });
      if (allAcct && allAcct.name) peerName = allAcct.name;
    }
    if (!peerName) peerName = peerEmpid;
    // 삭제된 계정 체크 (계정 목록이 로드된 경우에만 판단)
    var _peerAcct = null;
    var _acctLoaded = (_chatAllAccounts && _chatAllAccounts.length) || (_acctCache && _acctCache.length);
    if (_acctLoaded) {
      _peerAcct = (_chatAllAccounts || []).find(function(a) { return a.empid === peerEmpid; });
      if (!_peerAcct) _peerAcct = (_acctCache || []).find(function(a) { return a.empid === peerEmpid; });
    }
    var peerDeleted = _acctLoaded && !_peerAcct;
    // 닉네임 조회
    var peerNick = '';
    if (_peerAcct && _peerAcct.nickname) peerNick = _peerAcct.nickname;
    var lastMsg = data.lastMsg || '';
    var lastTs = data.lastTs;
    var timeStr = '';
    if (lastTs) {
      var dt = lastTs.toDate ? lastTs.toDate() : new Date(lastTs);
      var now = new Date();
      if (dt.toDateString() === now.toDateString()) {
        timeStr = dt.toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'});
      } else {
        timeStr = (dt.getMonth()+1) + '/' + dt.getDate();
      }
    }
    var hasUnread = false;
    var myLastRead = data['lastRead_' + me.empid];
    var roomId = d.id;
    var localReadMs = _chatLocalReadTimes[roomId] || 0;
    if (lastTs && data.lastFrom !== me.empid) {
      var msgTime = lastTs.toDate ? lastTs.toDate().getTime() : new Date(lastTs).getTime();
      // 로컬 읽음 시각이 메시지보다 최신이면 읽음 처리
      if (localReadMs >= msgTime) { hasUnread = false; }
      else if (!myLastRead) { hasUnread = true; }
      else {
        var readTime = myLastRead.toDate ? myLastRead.toDate().getTime() : new Date(myLastRead).getTime();
        if (readTime < msgTime) hasUnread = true;
      }
    }
    // 해당 peer 의 채팅창이 현재 열려 있으면 즉시 읽음으로 간주 (서버 lastRead 반영 전 갭 제거)
    if (hasUnread && _chatWindows && _chatWindows[peerEmpid]) {
      hasUnread = false;
      _chatLocalReadTimes[roomId] = Date.now();
    }
    if (hasUnread) {
      totalUnread++;
      var _lastMsgTime = lastTs ? (lastTs.toDate ? lastTs.toDate().getTime() : new Date(lastTs).getTime()) : 0;
      _newUnreadRooms[peerEmpid] = { name: peerName || peerEmpid, msg: lastMsg, time: _lastMsgTime };
    }
    // 읽지 않은 메시지가 없으면 5명 제한 적용 (읽지 않은 건 항상 표시)
    if (!hasUnread) {
      _chatVisibleCount++;
      if (_chatVisibleCount > _chatMaxVisible) return;
    }
    var initial = (peerName || '?').charAt(0);
    var escapedName = (peerName || '').replace(/'/g, "\\'");
    var deletedBadge = peerDeleted ? ' <span style="font-size:9px;color:#ef4444;font-weight:600;background:#fef2f2;padding:1px 4px;border-radius:3px;margin-left:4px;">이용불가</span>' : '';
    var _isOnline = (_onlineUsers || []).some(function(u){ return u.empid === peerEmpid; });
    var _onlineDot = _isOnline ? '<span style="position:absolute;bottom:0;right:0;width:10px;height:10px;background:#22c55e;border-radius:50%;border:2px solid #fff;"></span>' : '';
    var unreadStyle = hasUnread ? 'background:#eff6ff;' : '';
    chatHtml += '<div class="chat-list-item' + (hasUnread ? ' cli-unread-row' : '') + '" data-room-id="' + roomId + '" data-peer="' + peerEmpid + '" data-peer-name="' + escapedName + '" onclick="openChat(\'' + peerEmpid + '\',\'' + escapedName + '\')"' + (peerDeleted ? ' style="opacity:0.6;"' : (hasUnread ? ' style="' + unreadStyle + '"' : '')) + '>' +
      '<div class="cli-avatar" style="position:relative;' + (peerDeleted ? 'background:#d1d5db;' : (hasUnread ? 'background:#2563eb;' : '')) + '">' + initial + _onlineDot + '</div>' +
      '<div class="cli-info">' +
        '<div class="cli-name">' + (peerName || peerEmpid) + (peerNick ? ' <span style="font-size:10px;color:#9ca3af;">(' + peerNick + ')</span>' : '') + deletedBadge + (hasUnread ? ' <span class="cli-unread cli-unread-show" id="cliBadge-' + peerEmpid + '">N</span>' : '') + '</div>' +
        '<div class="cli-last-msg"' + (hasUnread ? ' style="color:#1e40af;font-weight:600;"' : '') + '>' + (peerDeleted ? '⚠️ 이용할 수 없는 사용자' : (lastMsg.length > 30 ? lastMsg.slice(0,30) + '...' : lastMsg)) + '</div>' +
      '</div>' +
      '<div class="cli-meta">' +
        '<span class="cli-time"' + (hasUnread ? ' style="color:#2563eb;font-weight:600;"' : '') + '>' + timeStr + '</span>' +
      '</div>' +
    '</div>';
    if (hasUnread) {
      (function(pid, rid, lr) {
        var q = _fbDb.collection('chats').doc(rid).collection('messages')
          .where('from', '==', pid);
        if (lr) q = q.where('ts', '>', lr);
        q.get().then(function(snap) {
          var badge = document.getElementById('cliBadge-' + pid);
          if (badge && snap.size > 0) { badge.textContent = snap.size > 99 ? '99+' : snap.size; }
        }).catch(function(){});
      })(peerEmpid, roomId, myLastRead);
    }
  });

  _updateChatListBadge(totalUnread);

  // 새 메시지 알림창(sendNotification) 제거 — 배지/깜빡임만 사용
  // (이전 코드: 신규 unread room 생길 때 sendNotification 호출)
  _chatPrevUnreadRooms = _newUnreadRooms;

  // 전체 가입자 리스트 (채팅 기록 없는 사람)
  if (_chatAllAccounts && _chatAllAccounts.length) {
    _renderChatListWithAllAccounts(body, chatHtml, chatPeerSet, me);
  } else if (!_chatAccountsLoading) {
    // 채팅 기록 있는 사람만 먼저 표시
    _renderChatListWithAllAccounts(body, chatHtml, chatPeerSet, me);
    // 백그라운드에서 accounts 1회 로드 (5분 캐시)
    _chatAccountsLoading = true;
    apiGetAccounts().then(function(res) {
      _chatAllAccounts = (res.accounts || []).map(function(a) {
        return Object.assign({}, a, { empid: a.empid });
      });
      _chatAllAccounts.sort(function(a, b) { return (a.name || a.empid).localeCompare(b.name || b.empid); });
      _chatAccountsLoading = false;
      if (_chatListOpen) _renderChatListWithAllAccounts(body, chatHtml, chatPeerSet, me);
    }).catch(function() {
      if (_acctCache && _acctCache.length) {
        _chatAllAccounts = _acctCache.map(function(a) { return { empid: a.empid, name: a.name || a.nickname || a.empid, nickname: a.nickname, dept: a.dept }; });
        _chatAllAccounts.sort(function(a, b) { return (a.name || a.empid).localeCompare(b.name || b.empid); });
      }
      _chatAccountsLoading = false;
      if (_chatListOpen) _renderChatListWithAllAccounts(body, chatHtml, chatPeerSet, me);
    });
  } else {
    _renderChatListWithAllAccounts(body, chatHtml, chatPeerSet, me);
  }
}

function _renderChatListWithAllAccounts(body, chatHtml, chatPeerSet, me) {
  var allHtml = '';
  // 숨긴 유저 목록 로드
  var hiddenUsers = JSON.parse(localStorage.getItem('chat_hidden_users') || '[]');
  var isAdmin = _isAdmin(me);
  (_chatAllAccounts || []).forEach(function(a) {
    if (a.empid === me.empid) return; // 본인 제외
    if (chatPeerSet[a.empid]) return; // 이미 채팅 목록에 있는 사람 제외
    // 비활성 계정(status==='inactive' 또는 disabled===true)은 숨김
    // 과거에는 'messenger' 권한 미보유자까지 숨겼으나, 권한 배열이 일시적으로 비거나
    // 최신화되지 않은 상태에서 전체 직원이 보이지 않는 문제가 있어 제거.
    if (a.status === 'inactive' || a.disabled === true) return;
    // 관리자가 숨긴 유저 숨김
    if (hiddenUsers.includes(a.empid)) return;
    var name = a.name || a.nickname || a.empid;
    var isMobList = window.innerWidth <= 1024;
    var nickStr = a.nickname ? ' <span style="font-size:' + (isMobList ? '14' : '10') + 'px;color:#9ca3af;">(' + a.nickname + ')</span>' : '';
    var initial = name.charAt(0);
    var escapedName = name.replace(/'/g, "\\'");
    allHtml += '<div class="chat-list-item cli-no-chat" data-peer="' + a.empid + '" data-peer-name="' + name.replace(/"/g,'&quot;') + '" onclick="openChat(\'' + a.empid + '\',\'' + escapedName + '\')">' +
      '<div class="cli-avatar" style="background:#9ca3af;">' + initial + '</div>' +
      '<div class="cli-info">' +
        '<div class="cli-name">' + name + nickStr + '</div>' +
        '<div class="cli-last-msg" style="color:#d1d5db;">' + t('chat_new_start') + '</div>' +
      '</div>' +
    '</div>';
  });
  var separator = '';
  var _sepMob = window.innerWidth <= 1024;
  var _sepFs = _sepMob ? '15px' : '10px';
  var _sepPad = _sepMob ? '12px 18px' : '8px 16px';
  if (chatHtml && allHtml) {
    separator = '<div style="padding:' + _sepPad + ';font-size:' + _sepFs + ';color:#9ca3af;font-weight:700;background:#f9fafb;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;">' + t('chat_all_members') + '</div>';
  } else if (!chatHtml && allHtml) {
    separator = '<div style="padding:' + _sepPad + ';font-size:' + _sepFs + ';color:#9ca3af;font-weight:700;background:#f9fafb;border-bottom:1px solid #f3f4f6;">' + t('chat_all_members') + '</div>';
  }
  var finalHtml = chatHtml + separator + allHtml;
  var newContent = finalHtml || '<div class="chat-list-empty">' + t('chat_no_members') + '</div>';
  // 내용이 동일하면 DOM 교체 스킵 (점멸 방지)
  if (body._lastHtml === newContent) return;
  var scrollTop = body.scrollTop;
  body._lastHtml = newContent;
  body.innerHTML = newContent;
  body.scrollTop = scrollTop;

  // 자동 높이: 채팅 기록 있는 항목 수 기준으로 패널 높이 조절
  _autoFitChatPanel();
  // 검색어 유지 시 필터 재적용
  var si = document.getElementById('chatSearchInput');
  if (si && si.value.trim()) _filterChatList();
}

function _filterChatList() {
  var input = document.getElementById('chatSearchInput');
  var q = (input ? input.value : '').trim().toLowerCase();
  var body = document.getElementById('chatListBody');
  if (!body) return;
  var items = body.querySelectorAll('.chat-list-item');
  var separators = body.querySelectorAll('div[style*="font-weight:700"][style*="color:#9ca3af"]');
  var visibleChat = 0, visibleAll = 0;
  items.forEach(function(el) {
    var name = (el.getAttribute('data-peer-name') || el.querySelector('.cli-name') && el.querySelector('.cli-name').textContent || '').toLowerCase();
    var match = !q || name.indexOf(q) >= 0;
    el.style.display = match ? '' : 'none';
    if (match) {
      if (el.classList.contains('cli-no-chat')) visibleAll++;
      else visibleChat++;
    }
  });
  // 구분선 표시/숨김
  separators.forEach(function(sep) {
    sep.style.display = (visibleAll > 0) ? '' : 'none';
  });
}

function _autoFitChatPanel() {
  var panel = document.getElementById('chatListPanel');
  var body = document.getElementById('chatListBody');
  if (!panel || !body) return;
  if (window.innerWidth <= 1024) return; // 모바일은 풀스크린이므로 스킵
  // 채팅 기록 있는 항목만 세기 (cli-no-chat 제외)
  var chatItems = body.querySelectorAll('.chat-list-item:not(.cli-no-chat)');
  var count = chatItems.length;
  // 각 아이템 약 61px (padding 12*2 + avatar 36 + border 1)
  var itemH = 61;
  var hdrH = 50; // 헤더 높이
  var resizeH = 6; // 리사이즈 핸들
  var sepH = count > 0 ? 35 : 0; // All Members 구분선
  var contentH = hdrH + resizeH + (count * itemH) + sepH;
  var minH = 200;
  var maxH = window.innerHeight - 20;
  var fitH = Math.max(minH, Math.min(contentH, maxH));
  panel.style.height = fitH + 'px';
}

function _updateChatListBadge(count) {
  var badge = document.getElementById('chatListBadge');
  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }
  // mobCatMessengerBadge는 더 이상 사용하지 않음 (하단 네비 배지+깜빡임으로 대체)
  // 하단 네비 메신저 도트
  var navDot = document.getElementById('mobNavMsgDot');
  if (navDot) navDot.style.display = count > 0 ? '' : 'none';
  // 메시지 점멸
  _blinkChatCount = count;
  _updateBlink();
  // 모바일 메신저 버튼 깜빡임
  if (count > 0 && window.innerWidth <= 768) {
    _startMobMsgBlink();
  } else {
    _stopMobMsgBlink();
  }
  // 데스크탑 메신저 버튼 (상단 헤더) 노란색 깜빡임
  if (count > 0 && window.innerWidth > 768) {
    _startDeskMsgBlink();
  } else {
    _stopDeskMsgBlink();
  }
}

// ── 데스크탑 메신저 버튼 깜빡임 ──
function _startDeskMsgBlink() {
  var btn = document.querySelector('.btn-messenger-wrap');
  if (btn && !btn.classList.contains('desk-msg-blink')) btn.classList.add('desk-msg-blink');
}
function _stopDeskMsgBlink() {
  var btn = document.querySelector('.btn-messenger-wrap');
  if (btn) btn.classList.remove('desk-msg-blink');
}

// ── 모바일 메신저 버튼 깜빡임 ──
var _mobMsgBlinkTimer = null;
function _startMobMsgBlink() {
  if (_mobMsgBlinkTimer) return;
  var btn = document.getElementById('mobNavMessenger');
  if (!btn) return;
  btn.classList.add('mob-msg-blink');
  _mobMsgBlinkTimer = true;
}
function _stopMobMsgBlink() {
  var btn = document.getElementById('mobNavMessenger');
  if (btn) btn.classList.remove('mob-msg-blink');
  _mobMsgBlinkTimer = null;
}

// ── 대화 삭제 (우클릭 / 길게 누르기) ──
var _chatListLongTimer = null;
(function() {
  var body = document.getElementById('chatListBody');
  if (!body) {
    // DOM 아직 없으면 DOMContentLoaded 이후 재시도
    document.addEventListener('DOMContentLoaded', function() {
      _initChatListContextMenu(document.getElementById('chatListBody'));
    });
  } else {
    _initChatListContextMenu(body);
  }
})();
function _initChatListContextMenu(body) {
  if (!body) return;
  function _handleChatItemAction(e) {
    // 기존 대화방 (data-room-id 있음) → 삭제
    var roomItem = e.target.closest('.chat-list-item[data-room-id]');
    if (roomItem) { e.preventDefault && e.preventDefault(); _confirmDeleteChatRoom(roomItem); return; }
    // 대화 시작 전 유저 (cli-no-chat) → 숨기기 기능 비활성화
  }
  // 데스크톱: 우클릭
  body.addEventListener('contextmenu', function(e) { _handleChatItemAction(e); });
  // 모바일: 길게 누르기
  body.addEventListener('touchstart', function(e) {
    var item = e.target.closest('.chat-list-item');
    if (!item) return;
    _chatListLongTimer = setTimeout(function() {
      _chatListLongTimer = null;
      _handleChatItemAction({ target: item, preventDefault: function(){} });
    }, 600);
  }, { passive: true });
  body.addEventListener('touchend', function() {
    if (_chatListLongTimer) { clearTimeout(_chatListLongTimer); _chatListLongTimer = null; }
  });
  body.addEventListener('touchmove', function() {
    if (_chatListLongTimer) { clearTimeout(_chatListLongTimer); _chatListLongTimer = null; }
  });
}
// ── 대화 시작 전 유저 숨기기 ──
function _confirmHideChatUser(item) {
  var peer = item.dataset.peer;
  var peerName = item.dataset.peerName || peer;
  if (!peer) return;
  neoConfirm('"' + peerName + '" 을(를) 목록에서 숨기시겠습니까?', function(yes) {
    if (!yes) return;
    var hidden = JSON.parse(localStorage.getItem('chat_hidden_users') || '[]');
    if (!hidden.includes(peer)) hidden.push(peer);
    localStorage.setItem('chat_hidden_users', JSON.stringify(hidden));
    item.remove();
    showToast('목록에서 숨겼습니다.');
  });
}

function _confirmDeleteChatRoom(item) {
  var roomId = item.dataset.roomId;
  var peerName = item.dataset.peerName || '';
  var peerEmpid = item.dataset.peer || '';
  if (!roomId) return;
  neoConfirm('"' + (peerName || peerEmpid) + '" 대화를 삭제하시겠습니까?', function(yes) {
    if (!yes) return;
    // 열린 채팅창 먼저 닫기 (리스너 해제)
    if (_chatWindows && _chatWindows[peerEmpid]) {
      closeChat(peerEmpid);
    }
    // 즉시 UI 반응 (서버 삭제는 뒤에서 진행)
    //  — 클라이언트 시각(Date.now) 대신 서버 lastTs 를 기준으로 설정해서 시각 오차 문제 방지
    var _srvLastMs = 0;
    try {
      if (_chatLastSnap) {
        var _md = _chatLastSnap.docs.find(function(d) { return d.id === roomId; });
        if (_md) {
          var _dlt = _md.data().lastTs;
          if (_dlt) _srvLastMs = _dlt.toDate ? _dlt.toDate().getTime() : new Date(_dlt).getTime();
        }
      }
    } catch(e) {}
    // 마커: 가능하면 서버 lastTs 사용 → 클럭 스큐로 인해 새 메시지가 필터링되는 문제 방지
    //       (서버 lastTs 없으면 Date.now 로 폴백)
    _chatSetClearedBefore(roomId, _srvLastMs > 0 ? _srvLastMs : Date.now());
    try { item.remove(); } catch(e) {}
    showToast('대화를 삭제하는 중...');
    // 서버에서 메시지 서브컬렉션 + 방 문서 실제 삭제
    //  (firestore.rules 에서 대화 참여자의 delete 를 허용하도록 설정)
    var msgRef = _fbDb.collection('chats').doc(roomId).collection('messages');
    _deleteSubcollection(msgRef).then(function() {
      return _fbDb.collection('chats').doc(roomId).delete();
    }).then(function() {
      // 서버 삭제 성공 — 클라이언트 마커도 제거 (더 이상 필요 없음)
      try { localStorage.removeItem('chat_cleared_' + roomId); } catch(e) {}
      showToast('대화가 삭제되었습니다.');
    }).catch(function(e) {
      console.error('[deleteChat]', e);
      // 서버 삭제 실패 (권한 문제 등) — 클라이언트 마커는 유지되어 UI는 깨끗
      showToast('일부 메시지는 서버에서 즉시 삭제되지 않을 수 있습니다.');
    });
  });
}

// Firestore 서브컬렉션 일괄 삭제 (batch 500건씩)
function _deleteSubcollection(ref) {
  return ref.limit(500).get().then(function(snap) {
    if (snap.empty) return Promise.resolve();
    var batch = _fbDb.batch();
    snap.docs.forEach(function(doc) { batch.delete(doc.ref); });
    return batch.commit().then(function() {
      return _deleteSubcollection(ref);
    });
  });
}

function _chatRoomId(a, b) {
  return a < b ? a + '_' + b : b + '_' + a;
}

// ── 채팅창 열기 ──
function openChat(peerEmpid, peerName) {
  var me = getCurrentUser();
  if (!me) return;
  if (peerEmpid === me.empid) return;
  // 이름 해결: 4단계 fallback
  // 1) 전달받은 peerName
  // 2) _acctCache
  if (!peerName || peerName === peerEmpid) {
    var _ca = (_acctCache || []).find(function(a) { return a.empid === peerEmpid; });
    if (_ca && _ca.name) peerName = _ca.name;
  }
  // 3) _onlineUsers
  if (!peerName || peerName === peerEmpid) {
    var _ou = (_onlineUsers || []).find(function(u) { return u.empid === peerEmpid; });
    if (_ou && _ou.name) peerName = _ou.name;
  }
  // 이미 열려있으면 포커스
  if (_chatWindows[peerEmpid]) {
    var _focusField = _chatWindows[peerEmpid].el.querySelector('.chat-input-field');
    if (_focusField) _focusField.focus();
    return;
  }
  // 4) 이름을 못 찾으면 Firestore 채팅 메타 + accounts에서 비동기 조회
  if (!peerName || peerName === peerEmpid) {
    var roomId = _chatRoomId(me.empid, peerEmpid);
    // 채팅 메타에서 name_ 필드 확인
    _fbDb.collection('chats').doc(roomId).get().then(function(docSnap) {
      var resolved = peerEmpid;
      if (docSnap.exists) {
        var meta = docSnap.data();
        if (meta['name_' + peerEmpid]) resolved = meta['name_' + peerEmpid];
      }
      if (resolved === peerEmpid) {
        // accounts에서 직접 조회
        return _fbDb.collection('accounts').doc(peerEmpid).get().then(function(acctSnap) {
          if (acctSnap.exists && acctSnap.data().name) resolved = acctSnap.data().name;
          _openChatWithName(peerEmpid, resolved);
        });
      }
      _openChatWithName(peerEmpid, resolved);
    }).catch(function() { _openChatWithName(peerEmpid, peerEmpid); });
    return;
  }
  // 이름이 확인되었으면 바로 열기
  _openChatWithName(peerEmpid, peerName);
}

// ── 채팅창 실제 생성 (이름 확정 후) ──
function _openChatWithName(peerEmpid, peerName) {
  var me = getCurrentUser();
  if (!me) return;
  // 이미 열려있으면 포커스 (비동기 경로에서 중복 방지)
  if (_chatWindows[peerEmpid]) {
    var _focusField = _chatWindows[peerEmpid].el.querySelector('.chat-input-field');
    if (_focusField) _focusField.focus();
    return;
  }
  // 최대 창 수 초과 시 가장 오래된 것 닫기
  var keys = Object.keys(_chatWindows);
  if (keys.length >= _chatMaxWindows) closeChat(keys[0]);

  var roomId = _chatRoomId(me.empid, peerEmpid);
  // 삭제된 계정 체크 (계정 목록이 로드된 경우에만 판단)
  var _acctListReady = (_chatAllAccounts && _chatAllAccounts.length) || (_acctCache && _acctCache.length);
  var _peerAcctCheck = (_chatAllAccounts || []).find(function(a) { return a.empid === peerEmpid; });
  if (!_peerAcctCheck) _peerAcctCheck = (_acctCache || []).find(function(a) { return a.empid === peerEmpid; });
  var peerUnavailable = _acctListReady && !_peerAcctCheck;

  var el = document.createElement('div');
  el.className = 'chat-popup';
  el.id = 'chat-' + peerEmpid;
  var idx = Object.keys(_chatWindows).length;
  el.style.right = (16 + idx * 356) + 'px';

  var isMob = window.innerWidth <= 1024;
  var unavailBadge = peerUnavailable ? ' <span style="font-size:9px;color:#ef4444;background:#fef2f2;padding:1px 5px;border-radius:3px;font-weight:600;">이용불가</span>' : '';
  el.innerHTML =
    '<div class="chat-popup-hdr">' +
      (isMob ? '<button class="chat-back-btn" onclick="closeChat(\'' + peerEmpid + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>' : '') +
      '<div class="chat-avatar"' + (peerUnavailable ? ' style="background:#d1d5db;"' : '') + '>' + (window.escHtml ? escHtml((peerName || '?').charAt(0)) : (peerName || '?').charAt(0)) + '</div>' +
      '<div style="flex:1;">' +
        '<div class="chat-peer-name">' + (window.escHtml ? escHtml(peerName || peerEmpid) : (peerName || peerEmpid)) + unavailBadge + '</div>' +
        '<div class="chat-peer-status">' + (window.escHtml ? escHtml(peerEmpid) : peerEmpid) + '</div>' +
      '</div>' +
      '<button onclick="minimizeChat(\'' + peerEmpid + '\')" title="최소화">&#x2015;</button>' +
      '<button onclick="toggleChatSize(\'' + peerEmpid + '\')" title="최대화">&#x26F6;</button>' +
      '<button onclick="closeChat(\'' + peerEmpid + '\')" title="닫기">&times;</button>' +
    '</div>' +
    '<div class="chat-body" id="chatBody-' + peerEmpid + '"></div>' +
    '<div class="chat-typing" id="chatTyping-' + peerEmpid + '"><span class="chat-typing-dots"><span></span><span></span><span></span></span> 입력 중...</div>' +
    // 계정 캐시에서 조회 실패한 사용자여도 메시지 입력 자체는 항상 허용한다.
    // (계정 목록이 일시적으로 비어있거나 empid 필드가 누락된 경우를 위한 resilience)
    (peerUnavailable ? '<div style="background:#fef2f2;color:#991b1b;font-size:11px;padding:4px 10px;border-top:1px solid #fecaca;">⚠️ 이 사용자는 현재 계정 목록에 없습니다. 메시지는 전송되나 전달되지 않을 수 있습니다.</div>' : '') +
      '<div class="chat-input-area">' +
        '<input class="chat-input-field" type="text" placeholder="메시지 입력..." onkeydown="if(event.key===\'Enter\')sendChat(\'' + peerEmpid + '\')" oninput="_onChatInput(\'' + peerEmpid + '\')">' +
        '<button onclick="sendChat(\'' + peerEmpid + '\')">&#x27A4;</button>' +
      '</div>';

  document.getElementById('chatContainer').appendChild(el);

  // 모바일: 키보드 올라올 때 스크롤 방지 + 입력란 포커스 시 하단 고정
  if (isMob) {
    var _chatInput = el.querySelector('.chat-input-field');
    if (_chatInput) {
      _chatInput.addEventListener('focus', function() {
        setTimeout(function() {
          // 키보드 올라온 후 채팅 바디 맨 아래로 스크롤
          var body = document.getElementById('chatBody-' + peerEmpid);
          if (body) body.scrollTop = body.scrollHeight;
        }, 400);
      });
    }
  }

  // 이미지 붙여넣기 (Ctrl+V) → 미리보기 표시, 엔터로 전송
  var _inputField = el.querySelector('.chat-input-field');
  if (_inputField) _inputField.addEventListener('paste', function(e) {
    var items = (e.clipboardData || {}).items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        var blob = items[i].getAsFile();
        if (blob) _showChatImgPreview(peerEmpid, blob);
        return;
      }
    }
  });

  // Firestore 실시간 리스너 (해당 채팅방 메시지)
  var _chatMsgFirst = true;
  var unsub = _fbDb.collection('chats').doc(roomId).collection('messages')
    .orderBy('ts', 'desc').limit(100)  // 최근 100건만 로드 (성능 최적화)
    .onSnapshot({ includeMetadataChanges: true }, function(snap) {
      // desc로 가져왔으므로 시간순(asc)으로 재정렬
      var sortedDocs = snap.docs.slice().reverse();
      _renderChatMessages(peerEmpid, sortedDocs);
      // 새 메시지 도착 시 자동 읽음 처리 (첫 로드 제외, 서버 확정된 변경만)
      if (!_chatMsgFirst && !snap.metadata.hasPendingWrites && snap.docChanges().some(function(c) { return c.type === 'added'; })) {
        _markChatRead(roomId, me.empid);
      }
      _chatMsgFirst = false;
    }, function(err) {
      console.error('[Chat] message listener error for ' + peerEmpid + ':', err);
    });

  _chatWindows[peerEmpid] = { el: el, unsub: unsub, unsubMeta: null, roomId: roomId, peerName: peerName, peerLastRead: null, msgDocs: [] };

  // 상대방 읽음 + 타이핑 상태 실시간 감시
  var unsubMeta = _fbDb.collection('chats').doc(roomId).onSnapshot(function(docSnap) {
    if (!docSnap.exists) return;
    var meta = docSnap.data();
    var w = _chatWindows[peerEmpid];
    if (!w) return;
    var plr = meta['lastRead_' + peerEmpid];
    w.peerLastRead = plr ? (plr.toDate ? plr.toDate() : new Date(plr)) : null;
    if (w.msgDocs.length) _renderChatMessages(peerEmpid, w.msgDocs);
    // 타이핑 표시
    var typingEl = document.getElementById('chatTyping-' + peerEmpid);
    if (typingEl) {
      var peerTyping = meta['typing_' + peerEmpid];
      var isTyping = peerTyping && (Date.now() - (peerTyping.toDate ? peerTyping.toDate().getTime() : new Date(peerTyping).getTime())) < 4000;
      typingEl.classList.toggle('show', !!isTyping);
    }
  });
  _chatWindows[peerEmpid].unsubMeta = unsubMeta;

  // 읽음 처리: lastRead 업데이트
  _markChatRead(roomId, me.empid);

  // 즉시 채팅 리스트 N 배지 제거
  var cliBadge = document.getElementById('cliBadge-' + peerEmpid);
  if (cliBadge) cliBadge.remove();
  // 메신저 총 배지도 즉시 갱신
  var allCliBadges = document.querySelectorAll('.cli-unread');
  _updateChatListBadge(allCliBadges.length);

  // 모바일: 키보드 열림 시 하단 네비 숨기고 채팅 확장 + 마지막 메시지 스크롤
  (function(_pid, _popup) {
    var inputField = _popup.querySelector('.chat-input-field');
    if (!inputField || window.innerWidth > 1024) return;
    var mobNav = document.getElementById('mobileBottomNav');

    inputField.addEventListener('focus', function() {
      // 키보드 열림: 하단 네비 숨기고 채팅을 화면 끝까지 확장
      if (mobNav) mobNav.style.display = 'none';
      _popup.style.bottom = '0px';
      var body = document.getElementById('chatBody-' + _pid);
      if (body) setTimeout(function(){ body.scrollTop = body.scrollHeight; }, 150);
    });

    inputField.addEventListener('blur', function() {
      // 키보드 닫힘: 하단 네비 복원
      if (mobNav) mobNav.style.display = 'block';
      _popup.style.bottom = '64px';
    });

    if (window.visualViewport) {
      var _chatVVHandler = function() {
        var body = document.getElementById('chatBody-' + _pid);
        if (body) body.scrollTop = body.scrollHeight;
      };
      window.visualViewport.addEventListener('resize', _chatVVHandler);
      _popup._vvCleanup = function() { window.visualViewport.removeEventListener('resize', _chatVVHandler); };
    }
  })(peerEmpid, el);

  el.querySelector('.chat-input-field').focus();
}

// ── 채팅창 닫기 ──
function closeChat(peerEmpid) {
  var w = _chatWindows[peerEmpid];
  if (!w) return;
  // 닫을 때 읽음 처리
  var me = getCurrentUser();
  if (me) _markChatRead(w.roomId, me.empid);
  // 닫은 직후 재오픈 방지 (5초간)
  _chatClosedRecently[peerEmpid] = Date.now();
  setTimeout(function() { delete _chatClosedRecently[peerEmpid]; }, 1500);
  if (w.unsub) w.unsub();
  if (w.unsubMeta) w.unsubMeta();
  // 타이핑 상태 해제
  _setChatTyping(w.roomId, me ? me.empid : '', false);
  w.el.remove();
  // 미니 아이콘도 제거
  if (_chatMinis[peerEmpid]) {
    _chatMinis[peerEmpid].remove();
    delete _chatMinis[peerEmpid];
    delete _chatMiniUnreads[peerEmpid];
    _repositionChatMinis();
  }
  delete _chatWindows[peerEmpid];
  var idx = 0;
  Object.keys(_chatWindows).forEach(function(k) {
    _chatWindows[k].el.style.right = (16 + idx * 356) + 'px';
    idx++;
  });
  // 모바일: 채팅 팝업이 모두 닫히면 하단 네비 복원
  if (window.innerWidth <= 1024 && Object.keys(_chatWindows).length === 0) {
    var mobNav = document.getElementById('mobileBottomNav');
    if (mobNav) mobNav.style.display = 'block';
  }
}

// ── 읽음 처리 ──
var _chatLocalReadTimes = {}; // 로컬 읽음 시각 캐시 (roomId → timestamp ms)
var _chatMarkReadPending = {}; // 중복 쓰기 방지 (roomId → true)
function _markChatRead(roomId, empid) {
  // 최근 1초 내에 이미 읽음 처리했으면 스킵 (Firestore 쓰기 & onSnapshot 발화 방지)
  var now = Date.now();
  if (_chatLocalReadTimes[roomId] && (now - _chatLocalReadTimes[roomId]) < 1000) return;
  _chatLocalReadTimes[roomId] = now;
  var upd = {};
  upd['lastRead_' + empid] = firebase.firestore.FieldValue.serverTimestamp();
  _fbDb.collection('chats').doc(roomId).set(upd, { merge: true }).catch(function(){});
}

// ── 메시지 렌더링 ──
function _renderChatMessages(peerEmpid, docs) {
  var me = getCurrentUser();
  if (!me) return;
  var w = _chatWindows[peerEmpid];
  // 클라이언트 측 "clear before" 필터 (삭제 이전 메시지는 숨김)
  var _clrBefore = (w && w.roomId) ? _chatGetClearedBefore(w.roomId) : 0;
  if (_clrBefore > 0) {
    docs = docs.filter(function(d) {
      var m = d.data();
      if (!m.ts) return true; // 서버 timestamp 미확정 (방금 전송) → 표시
      var ms = m.ts.toDate ? m.ts.toDate().getTime() : new Date(m.ts).getTime();
      return ms > _clrBefore;
    });
  }
  if (w) w.msgDocs = docs; // 캐시 (읽음 상태 변경 시 재렌더용)
  var body = document.getElementById('chatBody-' + peerEmpid);
  if (!body) return;
  var wasAtBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
  var peerLastRead = w ? w.peerLastRead : null;
  var lastDate = '';
  var html = '';
  docs.forEach(function(d) {
    var m = d.data();
    var ts = m.ts ? (m.ts.toDate ? m.ts.toDate() : new Date(m.ts)) : new Date();
    var dateStr = ts.toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric'});
    if (dateStr !== lastDate) {
      html += '<div class="chat-date-sep">' + dateStr + '</div>';
      lastDate = dateStr;
    }
    var isMe = m.from === me.empid;
    var timeStr = ts.toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'});
    // 내 메시지: 상대방이 아직 안 읽었으면 "1" 표시
    var unreadBadge = '';
    if (isMe && m.ts) {
      var msgTime = ts.getTime();
      var isUnread = !peerLastRead || peerLastRead.getTime() < msgTime;
      if (isUnread) unreadBadge = '<span class="chat-unread-badge">1</span>';
    }
    var msgContent = '';
    var isDeleted = m.deleted === true;
    if (isDeleted) {
      msgContent = '<span style="font-style:italic;opacity:.6;">이 메시지는 삭제되었습니다.</span>';
    } else if (m.imgUrl) {
      msgContent = '<img class="chat-img" src="' + m.imgUrl + '" onclick="openChatImgViewer(this.src)" alt="image">';
      if (m.text) msgContent += '<div>' + m.text + '</div>';
    } else {
      msgContent = m.text;
    }
    // 전달된 메시지 표시
    if (m.forwarded && !isDeleted) {
      msgContent = '<div style="font-size:10px;opacity:.7;margin-bottom:2px;">↗ 전달된 메시지</div>' + msgContent;
    }
    var safeText = (m.text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    var msgImgUrl = m.imgUrl ? m.imgUrl.replace(/"/g, '&quot;') : '';
    var msgId = d.id;
    // 답장 인용 블록
    var replyBlock = '';
    if (m.replyTo && m.replyText) {
      var replyShort = m.replyText.length > 40 ? m.replyText.slice(0,40) + '...' : m.replyText;
      replyBlock = '<div class="chat-reply-quote" onclick="_scrollToMsg(\'' + peerEmpid + '\',\'' + m.replyTo + '\')">' +
        '<span class="chat-reply-from">' + (m.replyFrom || '') + '</span>' +
        '<span class="chat-reply-text">' + replyShort + '</span></div>';
    }
    html += '<div class="chat-msg ' + (isMe ? 'me' : 'peer') + '" id="chatMsg-' + msgId + '" data-msg-id="' + msgId + '" data-chat-text="' + safeText + '" data-chat-from="' + (m.fromName || m.from || '') + '" data-chat-img="' + msgImgUrl + '" data-chat-peer="' + peerEmpid + '">' +
      unreadBadge +
      replyBlock +
      msgContent +
      '<span class="chat-time">' + timeStr + '</span>' +
    '</div>';
  });
  if (!docs.length) {
    html = '<div style="text-align:center;color:#9ca3af;padding:40px 10px;font-size:13px;">대화를 시작해보세요</div>';
  }
  body.innerHTML = html;
  if (wasAtBottom || !docs.length) body.scrollTop = body.scrollHeight;

  // 최소화 상태면 미니 배지 업데이트
  if (w && w.el.style.display === 'none' && _chatMinis[peerEmpid]) {
    // 읽지 않은 peer 메시지 수 계산
    var unreadCount = 0;
    docs.forEach(function(d) {
      var m = d.data();
      if (m.from !== me.empid && m.ts) {
        var mt = m.ts.toDate ? m.ts.toDate() : new Date(m.ts);
        if (!w.minimizedAt || mt.getTime() > w.minimizedAt) unreadCount++;
      }
    });
    _chatMiniUnreads[peerEmpid] = unreadCount;
    _updateChatMiniBadge(peerEmpid);
    return; // 최소화 상태에서는 렌더링 스킵 (복원 시 다시 렌더)
  }
  // 읽음 처리는 openChat 및 onSnapshot(새 메시지 도착)에서만 수행 (피드백 루프 방지)
}

// ── 메시지 전송 ──
async function sendChat(peerEmpid) {
  var me = getCurrentUser();
  if (!me) {
    console.warn('[sendChat] no current user');
    if (typeof neoAlert === 'function') neoAlert('로그인이 만료되었습니다. 새로고침 후 다시 시도해주세요.');
    return;
  }
  var w = _chatWindows[peerEmpid];
  // 상태 유실/DOM 분리 감지 → 복구 시도
  if (!w || !w.el || !w.el.isConnected) {
    console.warn('[sendChat] window state missing/detached for', peerEmpid, '— recovering');
    // 이전에 보이던 팝업 제거 (중복 방지)
    var _existing = document.getElementById('chat-' + peerEmpid);
    if (_existing) { try { _existing.remove(); } catch(e) {} }
    // openChat 재호출로 상태 재초기화 (peerName fallback: _acctCache)
    var _peerName = '';
    try {
      if (typeof _acctCache !== 'undefined' && _acctCache) {
        var _ac = _acctCache.find(function(a){ return a.empid === peerEmpid; });
        if (_ac && _ac.name) _peerName = _ac.name;
      }
    } catch(e) {}
    try { openChat(peerEmpid, _peerName); } catch(e) { console.error('[sendChat] openChat failed', e); }
    if (typeof neoAlert === 'function') neoAlert('채팅 상태를 복구했습니다. 메시지를 다시 입력해 주세요.');
    return;
  }
  var input = w.el.querySelector('.chat-input-field');
  if (!input) {
    console.warn('[sendChat] no input field found in window');
    return;
  }
  var text = (input.value || '').trim();
  // 대기 중인 이미지가 있으면 이미지 전송
  if (w._pendingImgBlob) {
    var blob = w._pendingImgBlob;
    _clearChatImgPreview(peerEmpid);
    _sendChatImage(peerEmpid, blob, text);
    input.value = '';
    return;
  }
  if (!text) return;
  input.value = '';
  input.focus();
  // 전송 직전에 삭제 마커 제거 → 리스너가 새 메시지를 필터링하지 않음
  try { localStorage.removeItem('chat_cleared_' + w.roomId); } catch(e) {}
  // 타이핑 상태 해제
  clearTimeout(_chatTypingTimers[peerEmpid]);
  _setChatTyping(w.roomId, me.empid, false);
  // 답장 정보
  var replyTo = w._replyTo || null;
  var replyFrom = w._replyFrom || null;
  var replyText = w._replyText || null;
  _clearReplyPreview(peerEmpid);
  try {
    var msgData = {
      from: me.empid,
      fromName: me.name || me.empid,
      to: peerEmpid,
      text: text,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (replyTo) {
      msgData.replyTo = replyTo;
      msgData.replyFrom = replyFrom;
      msgData.replyText = replyText;
    }
    await _fbDb.collection('chats').doc(w.roomId).collection('messages').add(msgData);
    _chatLocalSendTimes[w.roomId] = Date.now();
    _chatLocalReadTimes[w.roomId] = Date.now();
    var metaUpd = {
      participants: [me.empid, peerEmpid].sort(),
      lastMsg: text,
      lastTs: firebase.firestore.FieldValue.serverTimestamp(),
      lastFrom: me.empid,
      lastFromName: me.name || me.empid
    };
    metaUpd['name_' + me.empid] = me.name || me.empid;
    if (w.peerName) metaUpd['name_' + peerEmpid] = w.peerName;
    metaUpd['lastRead_' + me.empid] = firebase.firestore.FieldValue.serverTimestamp();
    await _fbDb.collection('chats').doc(w.roomId).set(metaUpd, { merge: true });
  } catch(e) {
    console.error('[Chat] send error:', e);
    neoAlert && neoAlert('메시지 전송 실패: ' + (e.message || e));
  }
}

// ── 이미지 미리보기 표시/제거 ──
function _showChatImgPreview(peerEmpid, blob) {
  var w = _chatWindows[peerEmpid];
  if (!w) return;
  w._pendingImgBlob = blob;
  // 기존 프리뷰 제거
  var old = w.el.querySelector('.chat-img-preview');
  if (old) old.remove();
  var bar = document.createElement('div');
  bar.className = 'chat-img-preview';
  var thumbUrl = URL.createObjectURL(blob);
  bar.innerHTML = '<div class="chat-img-preview-inner">' +
    '<img src="' + thumbUrl + '" onclick="openChatImgViewer(\'' + thumbUrl + '\')">' +
    '<div class="ip-remove" onclick="_clearChatImgPreview(\'' + peerEmpid + '\')">&times;</div>' +
  '</div>' +
  '<div class="chat-img-preview-hint">Enter 키로 전송 · 클릭하면 확대</div>';
  var inputArea = w.el.querySelector('.chat-input-area');
  if (inputArea) inputArea.parentNode.insertBefore(bar, inputArea);
  w.el.querySelector('.chat-input-field').focus();
}

function _clearChatImgPreview(peerEmpid) {
  var w = _chatWindows[peerEmpid];
  if (!w) return;
  w._pendingImgBlob = null;
  var bar = w.el.querySelector('.chat-img-preview');
  if (bar) {
    var img = bar.querySelector('img');
    if (img && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    bar.remove();
  }
}

// ── 답장 프리뷰 표시/제거 ──
function _showReplyPreview(peerEmpid, fromName, shortText) {
  var w = _chatWindows[peerEmpid];
  if (!w) return;
  // 기존 프리뷰 제거
  var old = w.el.querySelector('.chat-reply-preview');
  if (old) old.remove();
  var bar = document.createElement('div');
  bar.className = 'chat-reply-preview';
  bar.innerHTML = '<span style="font-weight:700;">' + (window.escHtml ? escHtml(fromName) : fromName) + '</span>' +
    '<span class="rp-text">' + (window.escHtml ? escHtml(shortText) : shortText) + '</span>' +
    '<button class="rp-close" onclick="_clearReplyPreview(\'' + peerEmpid + '\')">&times;</button>';
  // 입력 영역 바로 위에 삽입
  var inputArea = w.el.querySelector('.chat-input-area');
  if (inputArea) inputArea.parentNode.insertBefore(bar, inputArea);
}

function _clearReplyPreview(peerEmpid) {
  var w = _chatWindows[peerEmpid];
  if (!w) return;
  w._replyTo = null; w._replyFrom = null; w._replyText = null;
  var bar = w.el.querySelector('.chat-reply-preview');
  if (bar) bar.remove();
}

// ── 원문 메시지로 스크롤 이동 ──
function _scrollToMsg(peerEmpid, msgId) {
  var body = document.getElementById('chatBody-' + peerEmpid);
  if (!body) return;
  var target = document.getElementById('chatMsg-' + msgId);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.remove('highlight');
  void target.offsetWidth; // reflow
  target.classList.add('highlight');
}

// ── 채팅 이미지 전송 ──
async function _sendChatImage(peerEmpid, blob, caption) {
  var me = getCurrentUser();
  if (!me) return;
  var w = _chatWindows[peerEmpid];
  if (!w) return;
  var textMsg = (caption || '').trim();
  // 전송 직전에 삭제 마커 제거
  try { localStorage.removeItem('chat_cleared_' + w.roomId); } catch(e) {}
  // 업로드 중 표시
  var body = document.getElementById('chatBody-' + peerEmpid);
  var uploading = document.createElement('div');
  uploading.className = 'chat-msg me';
  uploading.style.opacity = '0.5';
  uploading.innerHTML = '<div style="font-size:11px;color:#dbeafe;">이미지 업로드 중...</div>';
  if (body) { body.appendChild(uploading); body.scrollTop = body.scrollHeight; }
  try {
    var rawExt = (blob.type || '').split('/')[1] || '';
    var ext = rawExt.split(';')[0].split('+')[0] || 'png';
    if (!ext || ext.length > 10) ext = 'png';
    var path = 'chat_images/' + w.roomId + '/' + Date.now() + '.' + ext;
    var ref = _fbStorage.ref().child(path);
    await ref.put(blob, { contentType: blob.type || 'image/png' });
    var url = await ref.getDownloadURL();
    // 메시지 저장
    await _fbDb.collection('chats').doc(w.roomId).collection('messages').add({
      from: me.empid,
      fromName: me.name || me.empid,
      to: peerEmpid,
      text: textMsg,
      imgUrl: url,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
    _chatLocalSendTimes[w.roomId] = Date.now();
    _chatLocalReadTimes[w.roomId] = Date.now();
    // 새 메시지 전송 성공 → 삭제 마커 제거
    try { localStorage.removeItem('chat_cleared_' + w.roomId); } catch(e) {}
    var metaUpd = {
      participants: [me.empid, peerEmpid].sort(),
      lastMsg: textMsg ? '[사진] ' + textMsg : '[사진]',
      lastTs: firebase.firestore.FieldValue.serverTimestamp(),
      lastFrom: me.empid,
      lastFromName: me.name || me.empid
    };
    metaUpd['name_' + me.empid] = me.name || me.empid;
    if (w.peerName) metaUpd['name_' + peerEmpid] = w.peerName;
    metaUpd['lastRead_' + me.empid] = firebase.firestore.FieldValue.serverTimestamp();
    await _fbDb.collection('chats').doc(w.roomId).set(metaUpd, { merge: true });
  } catch(e) {
    console.error('[Chat] image upload error:', e);
    neoAlert('이미지 업로드 실패: ' + e.message);
  }
  if (uploading.parentNode) uploading.remove();
}

// ── 채팅 이미지 확대 뷰어 ──
function openChatImgViewer(src) {
  var viewer = document.getElementById('chatImgViewer');
  var img = document.getElementById('chatImgViewerImg');
  if (viewer && img) {
    img.src = src;
    viewer.classList.add('open');
  }
}
function closeChatImgViewer() {
  var viewer = document.getElementById('chatImgViewer');
  if (viewer) {
    viewer.classList.remove('open');
    document.getElementById('chatImgViewerImg').src = '';
  }
}

// ── 채팅 우클릭 컨텍스트 메뉴 ──
var _chatCtxTarget = null; // 현재 우클릭 된 메시지 엘리먼트

document.addEventListener('contextmenu', function(e) {
  var msgEl = e.target.closest('.chat-msg');
  if (!msgEl) return;
  e.preventDefault();
  _chatCtxTarget = msgEl;
  var menu = document.getElementById('chatCtxMenu');
  // 삭제 버튼: 내 메시지만 표시
  var deleteItem = document.getElementById('chatCtxDelete');
  var me = getCurrentUser();
  var isMe = msgEl.classList.contains('me');
  if (deleteItem) deleteItem.style.display = isMe ? '' : 'none';
  // 삭제 위 구분선도 함께
  if (deleteItem && deleteItem.previousElementSibling) deleteItem.previousElementSibling.style.display = isMe ? '' : 'none';
  menu.classList.add('open');
  var x = e.clientX, y = e.clientY;
  menu.style.left = '0'; menu.style.top = '0';
  var mw = menu.offsetWidth, mh = menu.offsetHeight;
  if (x + mw > window.innerWidth - 8) x = window.innerWidth - mw - 8;
  if (y + mh > window.innerHeight - 8) y = window.innerHeight - mh - 8;
  if (x < 4) x = 4; if (y < 4) y = 4;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
});

document.addEventListener('click', function() {
  var menu = document.getElementById('chatCtxMenu');
  if (menu) menu.classList.remove('open');
});

function _chatCtxAction(action) {
  var menu = document.getElementById('chatCtxMenu');
  if (menu) menu.classList.remove('open');
  if (!_chatCtxTarget) return;
  var text = _chatCtxTarget.getAttribute('data-chat-text') || '';
  var from = _chatCtxTarget.getAttribute('data-chat-from') || '';
  var imgUrl = _chatCtxTarget.getAttribute('data-chat-img') || '';
  var peerEmpid = _chatCtxTarget.getAttribute('data-chat-peer') || '';

  if (action === 'reply') {
    // 답장: 입력창에 포커스 + 원문 참조 저장
    var w = _chatWindows[peerEmpid];
    if (!w) return;
    var input = w.el.querySelector('.chat-input-field');
    if (input) {
      var quote = text || (imgUrl ? '[사진]' : '');
      var short = quote.length > 30 ? quote.slice(0, 30) + '...' : quote;
      // 원문 메시지 ID 저장
      var msgId = _chatCtxTarget.getAttribute('data-msg-id') || '';
      w._replyTo = msgId;
      w._replyFrom = from;
      w._replyText = quote;
      // 답장 프리뷰 표시
      _showReplyPreview(peerEmpid, from, short);
      input.focus();
    }
  } else if (action === 'copy') {
    // 복사: 이미지면 확대 보기, 텍스트면 클립보드 복사
    if (imgUrl) {
      openChatImgViewer(imgUrl);
    } else {
      var copyText = text || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyText).then(function() {
          _showChatToast(t('chat_copied') || '복사되었습니다');
        });
      } else {
        var ta = document.createElement('textarea');
        ta.value = copyText; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy'); ta.remove();
        _showChatToast(t('chat_copied') || '복사되었습니다');
      }
    }
  } else if (action === 'forward') {
    // 전달: 대상 선택 패널 표시
    _chatForwardData = { text: text, imgUrl: imgUrl, from: from };
    _openChatForward();
  } else if (action === 'delete') {
    // 삭제: 메시지를 "이 메시지는 삭제되었습니다"로 변경
    var msgId = _chatCtxTarget.getAttribute('data-msg-id') || '';
    _deleteChatMsg(peerEmpid, msgId);
  } else if (action === 'translate') {
    _chatTranslateMsg(_chatCtxTarget, text, imgUrl);
  }
  _chatCtxTarget = null;
}

// ── 메시지 삭제 ──
function _deleteChatMsg(peerEmpid, msgId) {
  if (!msgId) return;
  var me = getCurrentUser();
  if (!me) return;
  var w = _chatWindows[peerEmpid];
  if (!w) return;
  var roomId = w.roomId;
  _fbDb.collection('chats').doc(roomId).collection('messages').doc(msgId).update({
    text: '이 메시지는 삭제되었습니다.',
    imgUrl: '',
    deleted: true,
    replyTo: '',
    replyFrom: '',
    replyText: ''
  }).then(function() {
    _showChatToast('메시지가 삭제되었습니다');
  }).catch(function(e) {
    console.error('[Chat] delete error:', e);
    neoAlert('삭제 실패: ' + e.message);
  });
}

// ── 메시지 전달 ──
var _chatForwardData = null;

function _openChatForward() {
  var overlay = document.getElementById('chatForwardOverlay');
  var body = document.getElementById('chatForwardBody');
  if (!overlay || !body) return;
  overlay.classList.add('open');
  var me = getCurrentUser();
  if (!me) return;
  var html = '';
  // 전체 가입자 목록에서 선택
  var list = _chatAllAccounts || _acctCache || [];
  if (!list.length) {
    // 가입자 캐시가 없으면 apiGetAccounts(5분 캐시)로 로드
    apiGetAccounts().then(function(res) {
      _chatAllAccounts = (res.accounts || []).slice();
      _chatAllAccounts.sort(function(a, b) { return (a.name || a.empid).localeCompare(b.name || b.empid); });
      _renderForwardList(body, me);
    });
    body.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">로딩 중...</div>';
    return;
  }
  _renderForwardList(body, me);
}

function _renderForwardList(body, me) {
  var list = _chatAllAccounts || _acctCache || [];
  var html = '';
  list.forEach(function(a) {
    if (a.empid === me.empid) return;
    var name = a.name || a.empid;
    var initial = name.charAt(0);
    var escapedName = name.replace(/'/g, "\\'");
    html += '<div class="chat-forward-item" onclick="_forwardMsgTo(\'' + a.empid + '\',\'' + escapedName + '\')">' +
      '<div class="fw-avatar">' + initial + '</div>' +
      '<div class="fw-name">' + name + '</div>' +
    '</div>';
  });
  body.innerHTML = html || '<div style="padding:20px;text-align:center;color:#9ca3af;">가입자가 없습니다</div>';
}

function closeChatForward() {
  var overlay = document.getElementById('chatForwardOverlay');
  if (overlay) overlay.classList.remove('open');
  _chatForwardData = null;
}

async function _forwardMsgTo(targetEmpid, targetName) {
  closeChatForward();
  if (!_chatForwardData) return;
  var me = getCurrentUser();
  if (!me) return;
  var roomId = _chatRoomId(me.empid, targetEmpid);
  var fwd = _chatForwardData;
  try {
    var msgData = {
      from: me.empid,
      fromName: me.name || me.empid,
      to: targetEmpid,
      text: fwd.text || '',
      forwarded: true,
      forwardFrom: fwd.from || '',
      ts: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (fwd.imgUrl) msgData.imgUrl = fwd.imgUrl;
    await _fbDb.collection('chats').doc(roomId).collection('messages').add(msgData);
    _chatLocalSendTimes[roomId] = Date.now();
    _chatLocalReadTimes[roomId] = Date.now();
    var lastMsg = fwd.imgUrl ? '[전달] [사진]' : '[전달] ' + (fwd.text || '').slice(0, 20);
    var metaUpd = {
      participants: [me.empid, targetEmpid].sort(),
      lastMsg: lastMsg,
      lastTs: firebase.firestore.FieldValue.serverTimestamp(),
      lastFrom: me.empid,
      lastFromName: me.name || me.empid
    };
    metaUpd['name_' + me.empid] = me.name || me.empid;
    metaUpd['name_' + targetEmpid] = targetName;
    metaUpd['lastRead_' + me.empid] = firebase.firestore.FieldValue.serverTimestamp();
    await _fbDb.collection('chats').doc(roomId).set(metaUpd, { merge: true });
    _showChatToast(targetName + '에게 전달되었습니다');
    // 해당 채팅창 자동 열기
    openChat(targetEmpid, targetName);
  } catch(e) {
    console.error('[Chat] forward error:', e);
    neoAlert('전달 실패: ' + e.message);
  }
  _chatForwardData = null;
}

// ── 번역 기능 (Google Translate API 무료) ──
function _chatTranslateMsg(msgEl, text, imgUrl) {
  if (!text && imgUrl) { _showChatToast('이미지는 번역할 수 없습니다'); return; }
  if (!text) return;
  // 대상 언어 결정: 현재 앱 언어 사용
  var targetLang = currentLang === 'ko' ? 'en' : currentLang === 'en' ? 'ko' : currentLang === 'th' ? 'ko' : 'en';
  // 이미 번역 박스가 있으면 제거 (토글)
  var existing = msgEl.querySelector('.chat-translate-box');
  if (existing) { existing.remove(); return; }
  var box = document.createElement('div');
  box.className = 'chat-translate-box';
  box.textContent = t('chat_translating') || '번역 중...';
  msgEl.appendChild(box);
  // Google Translate 무료 API
  var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + targetLang + '&dt=t&q=' + encodeURIComponent(text);
  fetch(url).then(function(r) { return r.json(); }).then(function(data) {
    var translated = '';
    if (data && data[0]) {
      data[0].forEach(function(seg) { if (seg[0]) translated += seg[0]; });
    }
    box.textContent = translated || '번역 실패';
    // 스크롤 유지
    var body = msgEl.closest('.chat-body');
    if (body) body.scrollTop = body.scrollHeight;
  }).catch(function() {
    box.textContent = '번역 실패';
  });
}

// ── 채팅 토스트 알림 ──
function _showChatToast(msg) {
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.78);color:#fff;padding:8px 20px;border-radius:20px;font-size:12px;z-index:99999;pointer-events:none;animation:chatCtxIn .2s ease-out;';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function() { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; }, 1500);
  setTimeout(function() { toast.remove(); }, 1900);
}

// ── 전역 수신 리스너: 새 메시지 도착 시 자동으로 채팅창 열기 ──
function _startChatListener() {
  var me = getCurrentUser();
  if (!me) return;
  if (_chatGlobalUnsub) _chatGlobalUnsub(); // 기존 리스너 해제

  // 통합 리스너: 채팅 수신 + 배지 업데이트 (중복 리스너 제거로 Firestore 읽기 50% 절감)
  var _chatListenerReady = false;
  if (_chatBadgeUnsub) _chatBadgeUnsub(); // 기존 배지 리스너도 해제
  _chatBadgeUnsub = null;
  _chatGlobalUnsub = _fbDb.collection('chats')
    .where('participants', 'array-contains', me.empid)
    .onSnapshot(function(snap) {
      // ── 배지 업데이트 ──
      var totalUnread = 0;
      snap.docs.forEach(function(d) {
        var data = d.data();
        if (!data.lastTs || data.lastFrom === me.empid) return;
        // 클라이언트 측 삭제 마커 이전 메시지는 배지에서도 제외
        var _clrB = _chatGetClearedBefore(d.id);
        var msgTime = data.lastTs.toDate ? data.lastTs.toDate().getTime() : new Date(data.lastTs).getTime();
        if (_clrB > 0 && msgTime <= _clrB) return;
        // peer 채팅창이 현재 열려 있으면 읽은 것으로 간주
        var _peerEmpid = (data.participants || []).filter(function(p){ return p !== me.empid; })[0];
        if (_peerEmpid && _chatWindows && _chatWindows[_peerEmpid]) return;
        var myLastRead = data['lastRead_' + me.empid];
        if (!myLastRead) { totalUnread++; return; }
        var readTime = myLastRead.toDate ? myLastRead.toDate().getTime() : new Date(myLastRead).getTime();
        if (readTime < msgTime) totalUnread++;
      });
      _updateChatListBadge(totalUnread);
      _chatLastSnap = snap;

      // ── 채팅 리스트 렌더링 ──
      if (_chatListOpen) {
        var hash = snap.docs.map(function(d) {
          var dt = d.data();
          var lt = dt.lastTs ? (dt.lastTs.toDate ? dt.lastTs.toDate().getTime() : 0) : 0;
          var lr = dt['lastRead_' + me.empid];
          var lrt = lr ? (lr.toDate ? lr.toDate().getTime() : 0) : 0;
          return d.id + ':' + lt + ':' + (dt.lastFrom || '') + ':' + lrt;
        }).join('|');
        if (hash !== _chatLastRenderedHash) {
          _chatLastRenderedHash = hash;
          var sorted = snap.docs.slice().sort(function(a, b) {
            var aTs = a.data().lastTs, bTs = b.data().lastTs;
            var aTime = aTs ? (aTs.toDate ? aTs.toDate().getTime() : new Date(aTs).getTime()) : 0;
            var bTime = bTs ? (bTs.toDate ? bTs.toDate().getTime() : new Date(bTs).getTime()) : 0;
            var aLocal = _chatLocalSendTimes[a.id] || 0;
            var bLocal = _chatLocalSendTimes[b.id] || 0;
            return Math.max(bTime, bLocal) - Math.max(aTime, aLocal);
          });
          _renderChatList(sorted, me);
        }
      }

      // ── 새 메시지 수신: 자동 열기 차단, 배지+깜빡임만 ──
      if (!_chatListenerReady) { _chatListenerReady = true; return; }
      var hasNew = false;
      snap.docChanges().forEach(function(change) {
        if (change.type !== 'modified') return;
        var data = change.doc.data();
        if (data.lastFrom === me.empid) return;
        hasNew = true;
      });
      if (hasNew && window.innerWidth <= 768) _startMobMsgBlink();
    });
}

// ── 로그인 시 읽지 않은 채팅 확인 & 자동 열기 ──
async function _checkUnreadChats() {
  var me = getCurrentUser();
  if (!me) return;
  try {
    var snap = await _fbDb.collection('chats')
      .where('participants', 'array-contains', me.empid)
      .get();
    snap.docs.forEach(function(d) {
      var data = d.data();
      if (!data.lastTs || data.lastFrom === me.empid) return;
      var myLastRead = data['lastRead_' + me.empid];
      var lastTs = data.lastTs;
      var msgTime = lastTs.toDate ? lastTs.toDate().getTime() : new Date(lastTs).getTime();
      if (myLastRead) {
        var readTime = myLastRead.toDate ? myLastRead.toDate().getTime() : new Date(myLastRead).getTime();
        if (readTime >= msgTime) return; // 이미 읽음
      }
      // 읽지 않은 메시지 → 배지만 표시 (자동 열기 차단)
    });
  } catch(e) {
    console.warn('[Chat] unread check error:', e);
  }
}

// ── 타이핑 상태 ──
var _chatTypingTimers = {}; // { peerEmpid: timeoutId }

function _onChatInput(peerEmpid) {
  var me = getCurrentUser();
  if (!me) return;
  var w = _chatWindows[peerEmpid];
  if (!w) return;
  var input = w.el.querySelector('.chat-input-field');
  var val = (input.value || '').trim().toLowerCase();
  // /아이콘 또는 /icon 명령 감지
  if (val === '/아이콘' || val === '/icon') {
    input.value = '';
    _openIconPicker(peerEmpid);
    return;
  }
  _setChatTyping(w.roomId, me.empid, true);
  // 3초 후 자동 해제
  clearTimeout(_chatTypingTimers[peerEmpid]);
  _chatTypingTimers[peerEmpid] = setTimeout(function() {
    _setChatTyping(w.roomId, me.empid, false);
  }, 3000);
}

function _setChatTyping(roomId, empid, isTyping) {
  if (!roomId || !empid) return;
  var upd = {};
  upd['typing_' + empid] = isTyping ? firebase.firestore.FieldValue.serverTimestamp() : firebase.firestore.Timestamp.fromDate(new Date(0));
  _fbDb.collection('chats').doc(roomId).set(upd, { merge: true }).catch(function(){});
}

// ── 최소화 / 최대화 ──
var _chatMinis = {}; // { peerEmpid: miniEl }
var _chatMiniUnreads = {}; // { peerEmpid: count }

function minimizeChat(peerEmpid) {
  var w = _chatWindows[peerEmpid];
  if (!w) return;
  w.el.style.display = 'none';
  w.minimizedAt = Date.now();
  // 미니 아이콘 생성
  if (_chatMinis[peerEmpid]) return; // 이미 존재
  var mini = document.createElement('div');
  mini.className = 'chat-mini';
  mini.id = 'chatMini-' + peerEmpid;
  mini.onclick = function() { restoreChat(peerEmpid); };
  var initial = (w.peerName || peerEmpid).charAt(0);
  mini.innerHTML = '<span class="chat-mini-initial">' + initial + '</span>';
  // 위치: 기존 미니 아이콘 수에 따라
  var miniIdx = Object.keys(_chatMinis).length;
  mini.style.right = (16 + miniIdx * 64) + 'px';
  document.body.appendChild(mini);
  _chatMinis[peerEmpid] = mini;
  _chatMiniUnreads[peerEmpid] = 0;
}

function restoreChat(peerEmpid) {
  var w = _chatWindows[peerEmpid];
  if (w) {
    w.el.style.display = '';
    // 스크롤 맨 아래로
    var body = document.getElementById('chatBody-' + peerEmpid);
    if (body) body.scrollTop = body.scrollHeight;
  }
  // 미니 아이콘 제거
  if (_chatMinis[peerEmpid]) {
    _chatMinis[peerEmpid].remove();
    delete _chatMinis[peerEmpid];
    delete _chatMiniUnreads[peerEmpid];
    _repositionChatMinis();
  }
}

function _repositionChatMinis() {
  var idx = 0;
  Object.keys(_chatMinis).forEach(function(k) {
    _chatMinis[k].style.right = (16 + idx * 64) + 'px';
    idx++;
  });
}

function _updateChatMiniBadge(peerEmpid) {
  var mini = _chatMinis[peerEmpid];
  if (!mini) return;
  var count = _chatMiniUnreads[peerEmpid] || 0;
  var badge = mini.querySelector('.chat-mini-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'chat-mini-badge';
      mini.appendChild(badge);
    }
    badge.textContent = count;
  } else if (badge) {
    badge.remove();
  }
}

function toggleChatSize(peerEmpid) {
  var w = _chatWindows[peerEmpid];
  if (!w) return;
  w.el.classList.toggle('maximized');
}

// ── 채팅 팝업 드래그 이동 → core.js _makeDraggable 사용 ──
document.addEventListener('DOMContentLoaded', function() {
  _makeDraggable({
    headerSel: '.chat-popup-hdr',
    modalSel: '.chat-popup',
    bounce: 'minVisible', minVisible: 50, touch: true,
    onStart: function(m, rect) {
      m.style.bottom = 'auto'; m.style.right = 'auto';
      m.style.left = rect.left + 'px'; m.style.top = rect.top + 'px';
    }
  });
});

// ── 메신저 패널 드래그 이동 + Y축 리사이즈 ──
(function() {
  var panel, hdr, resizeHandle;
  var dragging = false, resizing = false;
  var startX, startY, startLeft, startBottom, startH;

  function init() {
    panel = document.getElementById('chatListPanel');
    hdr = document.getElementById('chatListHdr');
    resizeHandle = document.getElementById('chatListResize');
    if (!panel || !hdr || !resizeHandle) return;

    // 헤더 드래그 → 패널 이동
    hdr.addEventListener('mousedown', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      var rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startBottom = window.innerHeight - rect.bottom;
      e.preventDefault();
    });
    hdr.addEventListener('touchstart', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      var t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      var rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startBottom = window.innerHeight - rect.bottom;
    }, { passive: false });

    // 상단 리사이즈 핸들 → 높이 조절
    resizeHandle.addEventListener('mousedown', function(e) {
      resizing = true;
      startY = e.clientY;
      startH = panel.offsetHeight;
      e.preventDefault();
    });
    resizeHandle.addEventListener('touchstart', function(e) {
      resizing = true;
      startY = e.touches[0].clientY;
      startH = panel.offsetHeight;
    }, { passive: false });

    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  }

  function onMove(e) {
    var cx, cy;
    if (e.touches) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }

    if (dragging) {
      var dx = cx - startX;
      var dy = cy - startY;
      var newLeft = Math.max(0, Math.min(startLeft + dx, window.innerWidth - panel.offsetWidth));
      var newBottom = Math.max(0, Math.min(startBottom - dy, window.innerHeight - 60));
      panel.style.left = newLeft + 'px';
      panel.style.bottom = newBottom + 'px';
      panel.style.right = 'auto';
      e.preventDefault();
    }
    if (resizing) {
      var dy = startY - cy;
      var newH = Math.max(200, Math.min(startH + dy, window.innerHeight - 20));
      panel.style.height = newH + 'px';
      e.preventDefault();
    }
  }

  function onEnd() {
    dragging = false;
    resizing = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ── 로그아웃 시 리스너 해제 ──
function _stopChatListener() {
  if (_chatGlobalUnsub) { _chatGlobalUnsub(); _chatGlobalUnsub = null; }
  if (_chatBadgeUnsub) { _chatBadgeUnsub(); _chatBadgeUnsub = null; }
  if (_chatListUnsub) { _chatListUnsub(); _chatListUnsub = null; }
  var me = getCurrentUser();
  Object.keys(_chatWindows).forEach(function(k) {
    var w = _chatWindows[k];
    if (w && me) _setChatTyping(w.roomId, me.empid, false);
  });
  Object.keys(_chatWindows).forEach(function(k) { closeChat(k); });
  // 미니 아이콘 전부 제거
  Object.keys(_chatMinis).forEach(function(k) {
    _chatMinis[k].remove();
    delete _chatMinis[k];
  });
  _chatMiniUnreads = {};
  // 채팅 리스트 닫기
  _chatListOpen = false;
  var panel = document.getElementById('chatListPanel');
  if (panel) panel.classList.remove('open');
  _updateChatListBadge(0);
  _chatAllAccounts = null; // 전체 가입자 캐시 초기화
}

// ── 아이콘(이모지) 피커 ──────────────────────────────────────────────────────
var _ICON_CATEGORIES = [
  { name:'😀', label:'표정', icons:['😀','😂','🤣','😊','😍','🥰','😘','😜','🤗','🤔','😎','🥳','😢','😭','😤','😡','🤯','😱','🥺','😴','🤢','🤮','🤡','👻','💀','👽','🤖','💩'] },
  { name:'👋', label:'손/몸', icons:['👋','👍','👎','👏','🤝','✌️','🤞','🤟','🤘','👌','🤙','💪','🙏','🫡','🫶','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💖','💗'] },
  { name:'🎉', label:'사물', icons:['🎉','🎊','🎁','🎈','🏆','🥇','🥈','🥉','⭐','🌟','✨','💫','🔥','💡','📌','📎','✅','❌','⚠️','🚨','🔔','📢','💬','💭','🗨️','📝','📊','📈'] },
  { name:'🍕', label:'음식', icons:['🍕','🍔','🍟','🌮','🍣','🍱','🍜','🍝','🍩','🍪','🎂','🍰','🍫','🍿','☕','🍵','🥤','🍺','🥂','🧋','🍎','🍊','🍋','🍇','🍉','🍓','🥑','🌽'] },
  { name:'⚽', label:'활동', icons:['⚽','🏀','🏈','⚾','🎾','🏐','🎯','🎮','🎲','🏃','🚶','💃','🧘','🏋️','🚴','🏊','⛷️','🏄','🎤','🎵','🎶','🎸','🎹','🎨','📷','🎬','🎭','🎪'] },
  { name:'🚗', label:'여행', icons:['🚗','🚕','🚌','🚑','🚒','✈️','🚀','🚢','🚂','🏠','🏢','🏥','🏫','⛪','🌍','🗺️','🌅','🌄','🏔️','🏖️','🌊','🌈','☀️','🌙','⭐','☁️','🌧️','❄️'] },
  { name:'💼', label:'업무', icons:['💼','📁','📂','📋','📄','📑','📊','📈','📉','💰','💵','💳','🏦','📧','📨','📩','📮','📫','💻','🖥️','⌨️','🖨️','📱','📞','🔑','🔒','🔓','⏰'] },
  { name:'🐶', label:'동물', icons:['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦋','🐝','🐞','🐢','🐍','🦎','🐠','🐟','🐙','🦀'] },
  { name:'🚩', label:'기호', icons:['🚩','🏁','🏳️','🇰🇷','🇹🇭','🇺🇸','🇯🇵','♻️','♿','🚻','🚼','⬆️','⬇️','➡️','⬅️','↩️','↪️','🔄','➕','➖','✖️','➗','💲','™️','©️','®️','〰️','➰'] }
];

var _iconPickerPeer = null; // 현재 아이콘 피커가 열린 채팅 상대

function _openIconPicker(peerEmpid) {
  _iconPickerPeer = peerEmpid;
  // 기존 피커가 있으면 제거
  var existing = document.getElementById('iconPickerOverlay');
  if (existing) existing.remove();

  var ov = document.createElement('div');
  ov.id = 'iconPickerOverlay';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;';
  ov.onclick = function(e) { if (e.target === ov) _closeIconPicker(); };

  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;width:380px;max-width:92vw;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden;animation:iconPickerIn .2s ease;';

  // 헤더
  var header = document.createElement('div');
  header.style.cssText = 'padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;';
  header.innerHTML = '<div style="font-size:15px;font-weight:700;color:#1e293b;">😊 아이콘 선택</div><button onclick="_closeIconPicker()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;padding:0 4px;">&times;</button>';
  box.appendChild(header);

  // 카테고리 탭
  var tabBar = document.createElement('div');
  tabBar.id = 'iconPickerTabs';
  tabBar.style.cssText = 'display:flex;gap:2px;padding:6px 10px;border-bottom:1px solid #f1f5f9;overflow-x:auto;flex-shrink:0;';
  _ICON_CATEGORIES.forEach(function(cat, idx) {
    var tab = document.createElement('button');
    tab.style.cssText = 'background:none;border:none;font-size:20px;padding:6px 8px;cursor:pointer;border-radius:8px;flex-shrink:0;transition:background .15s;';
    if (idx === 0) tab.style.background = '#eff6ff';
    tab.title = cat.label;
    tab.textContent = cat.name;
    tab.onclick = function() {
      tabBar.querySelectorAll('button').forEach(function(b){ b.style.background = 'none'; });
      tab.style.background = '#eff6ff';
      _renderIconGrid(idx);
    };
    tabBar.appendChild(tab);
  });
  box.appendChild(tabBar);

  // 검색
  var searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'padding:8px 14px;';
  searchWrap.innerHTML = '<input id="iconPickerSearch" type="text" placeholder="이모지 검색..." style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box;outline:none;" oninput="_filterIcons(this.value)">';
  box.appendChild(searchWrap);

  // 아이콘 그리드
  var gridWrap = document.createElement('div');
  gridWrap.id = 'iconPickerGrid';
  gridWrap.style.cssText = 'padding:6px 14px 14px;overflow-y:auto;flex:1;';
  box.appendChild(gridWrap);

  // 최근 사용 영역
  var recentWrap = document.createElement('div');
  recentWrap.id = 'iconPickerRecent';
  recentWrap.style.cssText = 'padding:6px 14px 10px;border-top:1px solid #f1f5f9;display:none;';
  box.appendChild(recentWrap);

  ov.appendChild(box);
  document.body.appendChild(ov);

  // 애니메이션 CSS
  if (!document.getElementById('iconPickerStyle')) {
    var st = document.createElement('style');
    st.id = 'iconPickerStyle';
    st.textContent = '@keyframes iconPickerIn{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}';
    document.head.appendChild(st);
  }

  _renderIconGrid(0);
  _renderRecentIcons();
  setTimeout(function(){ document.getElementById('iconPickerSearch').focus(); }, 100);
}

function _renderIconGrid(catIdx) {
  var grid = document.getElementById('iconPickerGrid');
  if (!grid) return;
  var icons = _ICON_CATEGORIES[catIdx].icons;
  var label = _ICON_CATEGORIES[catIdx].label;
  var h = '<div style="font-size:11px;font-weight:600;color:#9ca3af;margin-bottom:6px;">' + label + '</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">';
  icons.forEach(function(ic) {
    h += '<button onclick="_pickIcon(\'' + ic + '\')" style="background:none;border:none;font-size:24px;padding:6px;cursor:pointer;border-radius:8px;transition:background .12s;" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'none\'">' + ic + '</button>';
  });
  h += '</div>';
  grid.innerHTML = h;
}

function _filterIcons(query) {
  var grid = document.getElementById('iconPickerGrid');
  if (!grid) return;
  if (!query.trim()) { _renderIconGrid(0); return; }
  var all = [];
  _ICON_CATEGORIES.forEach(function(cat) { all = all.concat(cat.icons); });
  // 중복 제거
  var unique = [];
  all.forEach(function(ic) { if (unique.indexOf(ic) < 0) unique.push(ic); });
  var h = '<div style="font-size:11px;font-weight:600;color:#9ca3af;margin-bottom:6px;">검색 결과</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">';
  unique.forEach(function(ic) {
    h += '<button onclick="_pickIcon(\'' + ic + '\')" style="background:none;border:none;font-size:24px;padding:6px;cursor:pointer;border-radius:8px;transition:background .12s;" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'none\'">' + ic + '</button>';
  });
  h += '</div>';
  grid.innerHTML = h;
}

function _renderRecentIcons() {
  var wrap = document.getElementById('iconPickerRecent');
  if (!wrap) return;
  var recent = [];
  try { recent = JSON.parse(localStorage.getItem('recentIcons') || '[]'); } catch(e){}
  if (!recent.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  var h = '<div style="font-size:11px;font-weight:600;color:#9ca3af;margin-bottom:4px;">최근 사용</div><div style="display:flex;gap:2px;flex-wrap:wrap;">';
  recent.slice(0, 14).forEach(function(ic) {
    h += '<button onclick="_pickIcon(\'' + ic + '\')" style="background:none;border:none;font-size:22px;padding:4px;cursor:pointer;border-radius:6px;transition:background .12s;" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'none\'">' + ic + '</button>';
  });
  h += '</div>';
  wrap.innerHTML = h;
}

function _pickIcon(icon) {
  // 최근 사용 저장
  var recent = [];
  try { recent = JSON.parse(localStorage.getItem('recentIcons') || '[]'); } catch(e){}
  recent = recent.filter(function(i){ return i !== icon; });
  recent.unshift(icon);
  if (recent.length > 20) recent = recent.slice(0, 20);
  localStorage.setItem('recentIcons', JSON.stringify(recent));

  _closeIconPicker();

  // 채팅 입력에 아이콘 삽입
  if (_iconPickerPeer) {
    var w = _chatWindows[_iconPickerPeer];
    if (w) {
      var input = w.el.querySelector('.chat-input-field');
      if (input) {
        input.value += icon;
        input.focus();
      }
    }
  }
}

function _closeIconPicker() {
  var ov = document.getElementById('iconPickerOverlay');
  if (ov) ov.remove();
  _iconPickerPeer = null;
}
