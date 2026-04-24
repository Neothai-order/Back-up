// ══════════════════════════════════════════════════════════════════════════
// Shared Firebase initializer for standalone HTML pages.
//
// 사용 규약:
//   1) 이 파일 로드 **전** 에 firebase-app-compat 과 필요한 하위 SDK
//      (firestore, auth, storage, messaging, functions) 스크립트가 이미
//      <script> 로 포함되어 있어야 합니다.
//   2) 페이지 전용 local alias (`var _fbDb = firebase.firestore();` 등) 는
//      이 스크립트 **뒤** 에 둡니다 — 여기서 firebase.initializeApp() 가 먼저
//      실행된 상태를 보장하기 위함입니다.
//
// 기존에 각 HTML 에 중복되어 있던 FIREBASE_CONFIG + initializeApp + iPad
// long-polling 블록을 한 곳으로 모은 파일입니다.
// 설정값 변경 시 이 파일만 수정하면 모든 페이지가 자동 반영됩니다.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  window.FIREBASE_CONFIG = {
    apiKey:            "AIzaSyAo4jlDhpRZo8K8YTwismjFCWgWmHV93GQ",
    authDomain:        "neothai-order.firebaseapp.com",
    projectId:         "neothai-order",
    storageBucket:     "neothai-order.firebasestorage.app",
    messagingSenderId: "458325541072",
    appId:             "1:458325541072:web:b54d9b66b5cc68531b5ed5",
    measurementId:     "G-0N9WHEJ59X"
  };

  if (typeof firebase === "undefined") {
    console.error("[firebase-init] firebase SDK 가 이 스크립트보다 먼저 로드되어야 합니다.");
    return;
  }

  if (!firebase.apps.length) {
    try {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    } catch (e) {
      console.warn("[firebase-init] initializeApp 실패:", e);
    }
  }

  // iPad Safari — WebSocket 차단 이슈 회피 (Firestore SDK 가 로드된 경우에만)
  try {
    if (firebase.firestore) {
      var _ua = navigator.userAgent || "";
      if (/iPad|Macintosh/.test(_ua) && "ontouchend" in document) {
        firebase.firestore().settings({ experimentalForceLongPolling: true });
      }
    }
  } catch (e) { /* settings() 는 첫 호출 외에 호출되면 throw — 무시 */ }
})();
