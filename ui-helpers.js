// 헤더 높이 CSS 변수 설정 (데스크톱 오버레이 top 조정용)
(function() {
  function updateHeaderH() {
    var hdr = document.querySelector('.header');
    if (hdr && window.innerWidth > 1024) {
      document.documentElement.style.setProperty('--header-h', hdr.offsetHeight + 'px');
    } else {
      document.documentElement.style.setProperty('--header-h', '0px');
    }
    // 모바일: 전체 검은 헤더 높이를 오버레이 top으로 사용
    if (hdr && window.innerWidth <= 1024) {
      document.documentElement.style.setProperty('--mob-bar-h', hdr.offsetHeight + 'px');
    }
  }
  updateHeaderH();
  window.addEventListener('resize', updateHeaderH);
  // 로그인 후 헤더 크기 변경 대비
  setInterval(updateHeaderH, 2000);
})();

(function(){
  var indicator = document.getElementById('pullRefreshIndicator');
  var startY = 0, pulling = false, pullDist = 0;
  var threshold = 80;
  function isAtTop() {
    return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
  }
  function hasOpenModal() {
    var modals = document.querySelectorAll('.order-overlay.open,.quote-overlay.open,.pkg-builder.open,.ship-addr-open,.broadcast-overlay');
    for (var i = 0; i < modals.length; i++) {
      if (modals[i].offsetParent !== null || modals[i].classList.contains('open') || modals[i].classList.contains('show')) return true;
    }
    return false;
  }
  function isChatScreen() {
    var chatPanel = document.getElementById('chatListPanel');
    if (chatPanel && chatPanel.classList.contains('open')) return true;
    var chatCont = document.getElementById('chatContainer');
    if (chatCont && chatCont.children.length > 0) return true;
    return false;
  }
  function setIndicatorY(y, animate) {
    var tf = 'translate(-50%,' + y + 'px)';
    if (animate) {
      indicator.style.transition = 'transform .2s ease';
      indicator.style.webkitTransition = '-webkit-transform .2s ease';
    } else {
      indicator.style.transition = 'none';
      indicator.style.webkitTransition = 'none';
    }
    indicator.style.transform = tf;
    indicator.style.webkitTransform = tf;
  }
  document.addEventListener('touchstart', function(e) {
    if (!isAtTop() || hasOpenModal()) return;
    // 홈 화면(헤더바 터치)일 때만 허용
    var homeBtn = document.getElementById('mobNavHome');
    if (!homeBtn || !homeBtn.classList.contains('active')) return;
    // 채팅, 검색, 트래킹 등 다른 패널이 열려있으면 차단
    var chatPanel = document.getElementById('chatListPanel');
    if (chatPanel && chatPanel.classList.contains('open')) return;
    var searchOv = document.getElementById('mobSearchOverlay');
    if (searchOv && searchOv.classList.contains('open')) return;
    var trackOv = document.getElementById('myTrackingOverlay');
    if (trackOv && trackOv.classList.contains('open')) return;
    var touch = e.touches[0];
    var hdr = document.querySelector('.header');
    if (!hdr) return;
    var rect = hdr.getBoundingClientRect();
    if (touch.clientY < rect.top || touch.clientY > rect.bottom) return;
    startY = touch.clientY;
    pulling = true;
    pullDist = 0;
  }, { passive: true });
  document.addEventListener('touchmove', function(e) {
    if (!pulling) return;
    var dy = e.touches[0].clientY - startY;
    if (dy < 0) { pulling = false; setIndicatorY(-50, false); return; }
    pullDist = Math.min(dy, 120);
    var t = Math.max(-50, pullDist - 50);
    setIndicatorY(t, false);
    if (pullDist >= threshold) {
      indicator.textContent = '↓';
      indicator.style.color = '#2563eb';
    } else {
      indicator.textContent = '↻';
      indicator.style.color = '#6b7280';
    }
  }, { passive: true });
  document.addEventListener('touchend', function() {
    if (!pulling) return;
    pulling = false;
    if (pullDist >= threshold) {
      indicator.textContent = '⟳';
      indicator.style.color = '#2563eb';
      setIndicatorY(10, true);
      if ('caches' in window) {
        caches.keys().then(function(k){ k.forEach(function(n){ caches.delete(n); }); }).then(function(){
          window.location.reload(true);
        });
      } else {
        window.location.reload(true);
      }
    } else {
      setIndicatorY(-50, true);
    }
    pullDist = 0;
  }, { passive: true });
})();
