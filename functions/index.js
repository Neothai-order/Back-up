const functions = require("firebase-functions");
const admin = require("firebase-admin");
const line = require("@line/bot-sdk");
const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs");
admin.initializeApp();

const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════════
// 관리/테스트용 onRequest 엔드포인트 보호 헬퍼
// - Authorization: Bearer <Firebase ID Token> 검증
// - 토큰 주인 계정이 admin custom claim 또는 accounts/{empid}.is_admin==true
//   또는 dept=='Office' 여야 호출 허용
// ═══════════════════════════════════════════════════════════════════
async function _verifyAdminRequest(req, res) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      res.status(401).json({ error: "missing bearer token" });
      return null;
    }
    const idToken = auth.slice(7).trim();
    const decoded = await admin.auth().verifyIdToken(idToken);
    // custom claim 우선
    if (decoded.admin === true || decoded.role === "admin") return decoded;
    // accounts 문서에서 권한 확인 (uid는 ?, empid는 decoded.empid or uid 매핑)
    const empid = decoded.empid || decoded.uid;
    if (empid) {
      const acctDoc = await db.collection("accounts").doc(empid).get();
      if (acctDoc.exists) {
        const d = acctDoc.data() || {};
        if (d.is_admin === true || d.dept === "Office") return decoded;
      }
    }
    res.status(403).json({ error: "admin only" });
    return null;
  } catch (e) {
    console.warn("[_verifyAdminRequest] fail:", e.message);
    res.status(401).json({ error: "invalid token" });
    return null;
  }
}

// ── LINE Messaging API 설정 ──
// Firebase Functions config 또는 환경변수에서 읽기
const LINE_CONFIG = {
  channelAccessToken: functions.config().line ? functions.config().line.channel_access_token : process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  channelSecret: functions.config().line ? functions.config().line.channel_secret : process.env.LINE_CHANNEL_SECRET || "",
};
const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: LINE_CONFIG.channelAccessToken,
});

// ── FCM 발송 헬퍼 ──
async function sendToOfficeTeam(title, body, extraData) {
  const snap = await db.collection("fcmTokens").get();
  const tokens = snap.docs.map(d => d.data().token).filter(Boolean);
  if (!tokens.length) return;

  const message = {
    tokens,
    data: Object.assign({ title, body }, extraData || {}),
    webpush: {
      fcm_options: { link: "https://neothai-order.web.app/" },
    },
  };

  try {
    const res = await admin.messaging().sendEachForMulticast(message);
    console.log(`FCM sent: ${res.successCount} success, ${res.failureCount} fail`);
    // 실패한 토큰 정리
    if (res.failureCount > 0) {
      const toDelete = [];
      res.responses.forEach((r, i) => {
        if (!r.success && r.error &&
            (r.error.code === "messaging/invalid-registration-token" ||
             r.error.code === "messaging/registration-token-not-registered")) {
          const failToken = tokens[i];
          snap.docs.forEach(d => {
            if (d.data().token === failToken) toDelete.push(d.ref);
          });
        }
      });
      await Promise.all(toDelete.map(ref => ref.delete()));
    }
  } catch (e) {
    console.error("FCM error:", e);
  }
}

// ── 새 주문 생성 시 알림 ──
exports.onNewOrder = functions.firestore
  .document("orders/{orderId}")
  .onCreate(async (snap) => {
    const order = snap.data();
    await sendToOfficeTeam(
      "📦 새 주문 접수",
      `${order.customer_name || "고객"} — ${order.user || ""}`,
      { orderId: String(snap.id), notifType: "new_order" },
    );
  });

// ── 감사 로그 (보안 보강 #4): customers, accounts 쓰기 전부 기록 ──
async function _writeAuditLog(opts) {
  try {
    await db.collection("auditLogs").add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      collection: opts.collection,
      docId: opts.docId,
      action: opts.action, // 'create' | 'update' | 'delete'
      actor: opts.actor || null,
      before: opts.before || null,
      after: opts.after || null,
    });
  } catch (e) {
    console.error("[audit] write failed:", e && e.message);
  }
}

exports.auditCustomers = functions.firestore
  .document("customers/{custId}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    let action = "update";
    if (!before) action = "create";
    else if (!after) action = "delete";
    await _writeAuditLog({
      collection: "customers",
      docId: context.params.custId,
      action: action,
      actor: (after && (after._last_modified_by || after.last_modified_by)) ||
             (before && (before._last_modified_by || before.last_modified_by)) ||
             null,
      before: before ? { sales: before.sales || null, name: before.name_th || before.name_en || null } : null,
      after: after ? { sales: after.sales || null, name: after.name_th || after.name_en || null } : null,
    });
  });

exports.auditAccounts = functions.firestore
  .document("accounts/{empid}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    let action = "update";
    if (!before) action = "create";
    else if (!after) action = "delete";
    // 민감 변경만 기록 (role/permissions/dept 등)
    const relevant = ["role", "permissions", "dept", "sub_dept", "position", "nickname"];
    let changedRelevant = false;
    if (action !== "update") changedRelevant = true;
    else {
      for (const k of relevant) {
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) { changedRelevant = true; break; }
      }
    }
    if (!changedRelevant) return;
    await _writeAuditLog({
      collection: "accounts",
      docId: context.params.empid,
      action: action,
      actor: (after && after._modified_by) || (before && before._modified_by) || null,
      before: before ? { role: before.role, permissions: before.permissions, dept: before.dept, nickname: before.nickname } : null,
      after: after ? { role: after.role, permissions: after.permissions, dept: after.dept, nickname: after.nickname } : null,
    });
  });

// ── products 감사 로그 (보안 보강: 제품 마스터 변경 전부 기록) ──
exports.auditProducts = functions.firestore
  .document("products/{itemNo}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    let action = "update";
    if (!before) action = "create";
    else if (!after) action = "delete";
    const pick = (d) => d ? {
      item_no: d.item_no || null,
      model: d.model || null,
      price: d.price || null,
      category: d.category || null,
    } : null;
    await _writeAuditLog({
      collection: "products",
      docId: context.params.itemNo,
      action: action,
      actor: (after && (after._last_modified_by || after.last_modified_by)) ||
             (before && (before._last_modified_by || before.last_modified_by)) ||
             null,
      before: pick(before),
      after: pick(after),
    });
  });

// ── 새 견적 요청 시 알림 ──
exports.onNewQuote = functions.firestore
  .document("quotes/{quoteId}")
  .onCreate(async (snap) => {
    const quote = snap.data();
    await sendToOfficeTeam(
      "📋 견적 요청 접수",
      `${quote.customer_name || "고객"} — ${quote.requested_by || ""} 요청`,
      { orderId: String(snap.id), notifType: "new_quote" },
    );
  });

// ── 새 고객 등록 요청 시 알림 ──
exports.onNewPendingCustomer = functions.firestore
  .document("pendingCustomers/{pcId}")
  .onCreate(async (snap) => {
    const pc = snap.data();
    await sendToOfficeTeam(
      "👤 고객 등록 요청",
      `${pc.name_th || pc.cust_name || "신규"} — ${pc.reg_by || ""} 등록`,
      { orderId: String(snap.id), notifType: "new_customer" },
    );
  });

// ══════════════════════════════════════════════════════════════════════════════
// ── LINE Messaging API ──
// ══════════════════════════════════════════════════════════════════════════════

// LINE Webhook — 사용자가 친구 추가 시 userId를 임시 저장 (follow 이벤트)
exports.lineWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // Signature 검증 (Firebase Functions는 rawBody를 제공)
  const signature = req.headers["x-line-signature"];
  console.log("[LINE Webhook] signature:", signature ? "present" : "missing");
  console.log("[LINE Webhook] channelSecret length:", LINE_CONFIG.channelSecret.length);
  if (!signature) return res.status(400).send("No signature");

  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  console.log("[LINE Webhook] body length:", bodyStr.length, "body preview:", bodyStr.slice(0, 100));
  const isValid = line.validateSignature(bodyStr, LINE_CONFIG.channelSecret, signature);
  console.log("[LINE Webhook] isValid:", isValid);
  if (!isValid) return res.status(403).send("Invalid signature");

  const events = req.body.events || [];
  for (const event of events) {
    const userId = event.source && event.source.userId;
    if (!userId) continue;

    if (event.type === "follow") {
      // 친구 추가 시 → lineUsers 컬렉션에 임시 저장 (연동 대기)
      await db.collection("lineUsers").doc(userId).set({
        lineUserId: userId,
        linked: false,
        followedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // 환영 메시지 + 사번 입력 안내
      await lineClient.pushMessage({
        to: userId,
        messages: [{
          type: "text",
          text: "Neo Sales 앱 LINE 알림 연동입니다.\n사번을 입력해주세요. (예: T2408087)",
        }],
      });
    } else if (event.type === "message" && event.message.type === "text") {
      const text = event.message.text.trim();
      // 사번 형식 확인 (영문+숫자, 5자 이상)
      if (/^[A-Za-z]\d{4,}/.test(text)) {
        const empid = text.toUpperCase();
        // accounts 컬렉션에서 해당 사번 확인
        const acctDoc = await db.collection("accounts").doc(empid).get();
        if (acctDoc.exists) {
          // 계정에 lineUserId 저장
          await db.collection("accounts").doc(empid).update({ lineUserId: userId });
          // lineUsers 컬렉션 업데이트
          await db.collection("lineUsers").doc(userId).set({
            lineUserId: userId,
            empid: empid,
            linked: true,
            linkedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          const name = acctDoc.data().name || empid;
          await lineClient.pushMessage({
            to: userId,
            messages: [{ type: "text", text: `${name}님, LINE 알림 연동이 완료되었습니다! 🎉\n주문 발송/취소 시 이곳으로 알림이 옵니다.` }],
          });
        } else {
          await lineClient.pushMessage({
            to: userId,
            messages: [{ type: "text", text: `사번 "${empid}"을(를) 찾을 수 없습니다.\n정확한 사번을 다시 입력해주세요.` }],
          });
        }
      }
    }
  }

  res.status(200).json({ ok: true });
});

// ── LINE Push 헬퍼: 특정 사용자에게 메시지 발송 ──
async function sendLineMessage(empid, text) {
  if (!LINE_CONFIG.channelAccessToken) return;
  try {
    const acctDoc = await db.collection("accounts").doc(empid).get();
    if (!acctDoc.exists) return;
    const lineUserId = acctDoc.data().lineUserId;
    if (!lineUserId) return;
    await lineClient.pushMessage({
      to: lineUserId,
      messages: [{ type: "text", text: text }],
    });
  } catch (e) {
    console.warn("[LINE] push 실패:", e.message);
  }
}

// ── PTT 주유 가격 이전 조회 (SOAP 프록시) ──
exports.getPttOilPrice = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "로그인 필요");
  const { dd, mm, yyyy } = data;
  if (!dd || !mm || !yyyy) return { success: false, error: "missing date" };
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
<soap12:Body><GetOilPrice xmlns="http://www.pttor.com">
<Language>en</Language><DD>${dd}</DD><MM>${mm}</MM><YYYY>${yyyy}</YYYY>
</GetOilPrice></soap12:Body></soap12:Envelope>`;
  try {
    const fetch = (await import("node-fetch")).default;
    const resp = await fetch("https://orapiweb.pttor.com/oilservice/OilPrice.asmx", {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
      body: soapBody,
    });
    const xml = await resp.text();
    // XML 내 HTML-encoded 데이터 디코딩 후 파싱
    const decoded = xml.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const items = [];
    let priceDate = "";
    // PRICE_DATE 추출 (첫 번째 것)
    const dateMatch = decoded.match(/<PRICE_DATE>(.*?)<\/PRICE_DATE>/);
    if (dateMatch) priceDate = dateMatch[1].trim();
    // FUEL 블록에서 PRODUCT + PRICE 추출
    const regex = /<FUEL>\s*<PRICE_DATE>.*?<\/PRICE_DATE>\s*<PRODUCT>(.*?)<\/PRODUCT>\s*<PRICE>(.*?)<\/PRICE>\s*<\/FUEL>/g;
    let m;
    while ((m = regex.exec(decoded)) !== null) {
      items.push({ name: m[1].trim(), price: parseFloat(m[2]) });
    }
    return { success: true, items, priceDate };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── PTT 월별 공시 요약 조회 ──
exports.getPttMonthly = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "로그인 필요");
  const { mm, yyyy } = data;
  if (!mm || !yyyy) return { success: false, error: "missing month" };
  const fetch = (await import("node-fetch")).default;
  const daysInMonth = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();

  // 모든 날짜를 병렬 조회
  const promises = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, "0");
    const soapBody = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><GetOilPrice xmlns="http://www.pttor.com"><Language>en</Language><DD>${dd}</DD><MM>${mm}</MM><YYYY>${yyyy}</YYYY></GetOilPrice></soap12:Body></soap12:Envelope>`;
    promises.push(
      fetch("https://orapiweb.pttor.com/oilservice/OilPrice.asmx", {
        method: "POST",
        headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
        body: soapBody,
      }).then(r => r.text()).catch(() => "")
    );
  }
  const results = await Promise.all(promises);

  // 유니크 공시일별 가격 수집
  const announcements = {}; // priceDate → { date, items[] }
  const targetMonth = mm.padStart(2, "0");
  results.forEach(xml => {
    if (!xml) return;
    const decoded = xml.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const dateMatch = decoded.match(/<PRICE_DATE>(.*?)<\/PRICE_DATE>/);
    if (!dateMatch) return;
    const pd = dateMatch[1].trim();
    // 해당 월의 공시만 포함
    const pdMonth = pd.substring(0, 2);
    const pdYear = pd.substring(6, 10);
    if (pdMonth !== targetMonth || pdYear !== yyyy) return;
    if (announcements[pd]) return; // 이미 수집됨
    const items = [];
    const regex = /<FUEL>\s*<PRICE_DATE>.*?<\/PRICE_DATE>\s*<PRODUCT>(.*?)<\/PRODUCT>\s*<PRICE>(.*?)<\/PRICE>\s*<\/FUEL>/g;
    let m;
    while ((m = regex.exec(decoded)) !== null) {
      items.push({ name: m[1].trim(), price: parseFloat(m[2]) });
    }
    if (items.length) announcements[pd] = { date: pd, items };
  });

  // 날짜순 정렬
  const sorted = Object.values(announcements).sort((a, b) => {
    const da = new Date(a.date), db = new Date(b.date);
    return da - db;
  });

  return { success: true, announcements: sorted, count: sorted.length };
});

// ── 영수증 제출 요청 LINE 발송 (수신자 언어별) ──
exports.sendReceiptRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "로그인 필요");
  const { empids, month, senderName } = data;
  if (!empids || !empids.length) return { success: false, error: "no targets" };
  const msgs = {
    ko: `📋 [영수증 제출 요청]\n${senderName || '관리자'}님이 ${month || '이번 달'} 영수증 제출을 요청했습니다.\n앱에서 영수증을 제출해 주세요.`,
    en: `📋 [Receipt Request]\n${senderName || 'Admin'} has requested receipt submission for ${month || 'this month'}.\nPlease submit your receipts in the app.`,
    th: `📋 [คำขอส่งใบเสร็จ]\n${senderName || 'ผู้ดูแล'} ขอให้ส่งใบเสร็จของเดือน ${month || 'เดือนนี้'}\nกรุณาส่งใบเสร็จในแอป`
  };
  let sent = 0;
  for (const empid of empids) {
    try {
      const acctDoc = await db.collection("accounts").doc(empid).get();
      const lang = (acctDoc.exists && acctDoc.data().appLang) ? acctDoc.data().appLang : "ko";
      const msg = msgs[lang] || msgs.ko;
      await sendLineMessage(empid, msg);
      sent++;
    } catch (e) {
      console.warn("[Receipt LINE] send fail:", empid, e.message);
    }
  }
  return { success: true, sent };
});

// ── 주문 상태 변경 시 LINE 알림 (발송 완료 시에만) ──
exports.onOrderUpdate = functions.firestore
  .document("orders/{orderId}")
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
    const empid = after.user_empid;
    if (!empid) return;

    // 발송 완료 (→ done)
    if (before.status !== "done" && after.status === "done") {
      const items = after.items || [];
      const itemSummary = items.length > 0
        ? items.slice(0, 3).map(it => `  • ${it.model || "-"} x${it.qty || 1}`).join("\n") +
          (items.length > 3 ? `\n  ... 외 ${items.length - 3}종` : "")
        : "";
      const tracking = after.tracking_number ? `\n운송장: ${after.tracking_number}` : "";
      await sendLineMessage(empid,
        `✅ 발송 완료\n주문 #${after.id}\n고객: ${after.customer_name || "-"}${tracking}\n${itemSummary}\n발송이 완료되었습니다.`);
    }
  });

// ── 일일 발송 요약 (매일 18:00 KST = 09:00 UTC) ──
exports.dailyShippingSummary = functions.pubsub
  .schedule("0 9 * * *")   // 매일 09:00 UTC = 18:00 KST
  .timeZone("Asia/Bangkok") // ICT (UTC+7) → 16:00 ICT
  .onRun(async () => {
    // 오늘 날짜 (ICT 기준)
    const now = new Date();
    const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = ict.toISOString().slice(0, 10);

    // 오늘 발송 완료된 주문 조회 (status: shipping, completed_date가 오늘)
    const snap = await db.collection("orders")
      .where("status", "in", ["shipping", "done"])
      .get();

    // 오늘 발송된 것만 필터 + 주문자별 그룹핑
    const byUser = {};
    snap.docs.forEach(d => {
      const o = d.data();
      const cDate = o.completed_date || "";
      // completed_date 형식: "2026. 3. 31. 오후 6:00:00" 또는 "2026-03-31" 등
      if (!cDate.includes(todayStr) && !cDate.startsWith(todayStr)) {
        // 날짜 파싱 시도
        try {
          const parsed = new Date(cDate);
          const pIct = new Date(parsed.getTime() + 7 * 60 * 60 * 1000);
          if (pIct.toISOString().slice(0, 10) !== todayStr) return;
        } catch (e) { return; }
      }
      const empid = o.user_empid;
      if (!empid) return;
      if (!byUser[empid]) byUser[empid] = [];
      byUser[empid].push(o);
    });

    // 각 주문자에게 LINE 메시지 발송
    for (const empid of Object.keys(byUser)) {
      const orders = byUser[empid];
      let msg = `📋 오늘(${todayStr}) 발송 현황\n총 ${orders.length}건\n\n`;
      orders.forEach((o, i) => {
        msg += `${i + 1}. ${o.customer_name || "-"}\n`;
        try {
          const items = typeof o.items === "string" ? JSON.parse(o.items) : (o.items || []);
          items.forEach(item => {
            msg += `   • ${item.name || item.item_name || "-"} x${item.qty || 1}\n`;
          });
        } catch (e) { /* skip */ }
      });
      await sendLineMessage(empid, msg.trim());
    }

    console.log(`[DailyShipping] ${todayStr}: ${Object.keys(byUser).length}명에게 발송 요약 전송`);
    return null;
  });

// ── Thailand Post 배송 추적 API 프록시 ──
const axios = require("axios");
let _thaipostToken = null;
let _thaipostTokenExpiry = 0;

async function _getThaipostToken() {
  const now = Date.now();
  if (_thaipostToken && _thaipostTokenExpiry > now) return _thaipostToken;
  const staticToken = process.env.THAIPOST_TOKEN || "";
  if (!staticToken) throw new Error("Thailand Post API token not configured");
  console.log("[ThaiPost] Requesting new token...");
  const res = await axios.post("https://trackapi.thailandpost.co.th/post/api/v1/authenticate/token", null, {
    headers: { "Authorization": "Token " + staticToken },
    timeout: 15000,
  });
  console.log("[ThaiPost] Token received, status:", res.status);
  _thaipostToken = res.data.token;
  _thaipostTokenExpiry = now + 29 * 24 * 60 * 60 * 1000;
  return _thaipostToken;
}

exports.trackParcel = functions.region("asia-southeast1").https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "로그인 필요");
  const barcodes = data.barcodes || data.barcode;
  if (!barcodes || !barcodes.length) throw new functions.https.HttpsError("invalid-argument", "barcode required");
  const lang = data.language || "TH";
  try {
    let token = await _getThaipostToken();
    const payload = { status: "all", language: lang, barcode: Array.isArray(barcodes) ? barcodes : [barcodes] };
    let res;
    try {
      res = await axios.post("https://trackapi.thailandpost.co.th/post/api/v1/track", payload, {
        headers: { "Authorization": "Token " + token },
        timeout: 15000,
      });
    } catch (e) {
      // 401: 토큰 만료 → 재발급
      if (e.response && e.response.status === 401) {
        _thaipostToken = null;
        _thaipostTokenExpiry = 0;
        token = await _getThaipostToken();
        res = await axios.post("https://trackapi.thailandpost.co.th/post/api/v1/track", payload, {
          headers: { "Authorization": "Token " + token },
          timeout: 15000,
        });
      } else {
        throw e;
      }
    }
    return res.data;
  } catch (e) {
    const msg = e.response ? `API ${e.response.status}: ${JSON.stringify(e.response.data)}` : e.message;
    console.error("[ThaiPost] error:", msg);
    throw new functions.https.HttpsError("internal", msg);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── 관리자 권한: Custom Claims 기반 ──
// ══════════════════════════════════════════════════════════════════════════════
// 부트스트랩 관리자 (최초 1회 claim 부여 대상). 이후 다른 관리자 임명은 isAdmin이 하면 됨.
const BOOTSTRAP_ADMIN_EMPID = "T2408087";

// 공통 헬퍼: context 로부터 empid / 관리자 여부 추출
// Firebase Auth 는 이메일 local-part 를 소문자로 저장하므로 대소문자 무시 비교를 위해 upperCase 정규화.
function _callerEmpid(context) {
  if (!context.auth || !context.auth.token) return null;
  const email = context.auth.token.email || "";
  if (!email.includes("@")) return null;
  return email.split("@")[0].toUpperCase();
}
function _isAdminClaim(context) {
  return !!(context.auth && context.auth.token && context.auth.token.admin === true);
}

// ── 관리자 Claim 부여/회수 (관리자만 호출 가능, 최초 1회는 부트스트랩 사번만 자기 자신에 대해 호출 가능) ──
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "로그인 필요");
  const callerEmpid = _callerEmpid(context);
  const targetEmpid = (data && data.empid) ? String(data.empid).trim().toUpperCase() : "";
  const makeAdmin = !!(data && data.admin);
  if (!targetEmpid) throw new functions.https.HttpsError("invalid-argument", "empid 필요");

  const callerIsAdmin = _isAdminClaim(context);
  const bootstrapAdmin = BOOTSTRAP_ADMIN_EMPID.toUpperCase();
  const isBootstrap = callerEmpid === bootstrapAdmin && targetEmpid === bootstrapAdmin;
  if (!callerIsAdmin && !isBootstrap) {
    throw new functions.https.HttpsError("permission-denied", "관리자만 가능");
  }

  try {
    const email = targetEmpid + "@neothai-order.firebaseapp.com";
    const userRecord = await admin.auth().getUserByEmail(email);
    const currentClaims = userRecord.customClaims || {};
    const newClaims = Object.assign({}, currentClaims, { admin: makeAdmin });
    await admin.auth().setCustomUserClaims(userRecord.uid, newClaims);
    // Firestore role 필드도 동기화 (UI 표시용, 권한 판단은 claim 기준)
    await db.collection("accounts").doc(targetEmpid).set(
      { role: makeAdmin ? "admin" : "user" }, { merge: true }
    );
    return { ok: true, admin: makeAdmin };
  } catch (e) {
    console.error("setAdminClaim error:", e);
    throw new functions.https.HttpsError("internal", e.message);
  }
});

// ── 관리자: 타 사용자 Auth 삭제 (Callable Function) ──
exports.deleteUserAuth = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "로그인 필요");
  if (!_isAdminClaim(context)) {
    throw new functions.https.HttpsError("permission-denied", "관리자만 가능");
  }

  const targetEmpid = data && data.empid ? String(data.empid).trim() : "";
  if (!targetEmpid) throw new functions.https.HttpsError("invalid-argument", "empid 필요");

  // Firebase Auth 는 이메일을 소문자로 저장한다. (functions/index.js:migrateAllAccountsToAuth 참고)
  // 이전에는 targetEmpid 를 그대로 대문자로 이어붙여 일부 환경에서 getUserByEmail 이 실패했다.
  const email = targetEmpid.toLowerCase() + "@neothai-order.firebaseapp.com";
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    await admin.auth().deleteUser(userRecord.uid);
    console.log("[deleteUserAuth] deleted:", targetEmpid, userRecord.uid);
    return { ok: true };
  } catch (e) {
    // auth/user-not-found 는 "이미 삭제됨" 상태로 간주해 성공 처리 (Firestore 는 이미 지워졌으므로 정합)
    if (e && e.code === "auth/user-not-found") {
      console.warn("[deleteUserAuth] already gone:", targetEmpid);
      return { ok: true, alreadyGone: true };
    }
    console.error("deleteUserAuth error:", targetEmpid, e && e.code, e && e.message);
    return {
      ok: false,
      code: (e && e.code) || "unknown",
      msg: (e && e.message) || (e && e.code) || "알 수 없는 오류",
    };
  }
});

// ── 관리자: 타 사용자 Firebase Auth 비밀번호 강제 재설정 (Callable Function) ──
// 계정에 legacy pw가 설정되어 있어 로그인 pw ≠ Auth pw 인 사용자를 복구하기 위함.
exports.adminResetUserPassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "로그인 필요");
  if (!_isAdminClaim(context)) {
    throw new functions.https.HttpsError("permission-denied", "관리자만 가능");
  }

  const targetEmpid = data && data.empid ? String(data.empid).trim() : "";
  const newPw = data && data.newPw ? String(data.newPw) : "";
  if (!targetEmpid) throw new functions.https.HttpsError("invalid-argument", "empid 필요");
  if (!newPw || newPw.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "비밀번호는 6자 이상");
  }

  const email = targetEmpid.toLowerCase() + "@neothai-order.firebaseapp.com";
  try {
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (notFoundErr) {
      if (notFoundErr.code === "auth/user-not-found") {
        userRecord = await admin.auth().createUser({
          email: email,
          password: newPw,
          emailVerified: false,
          disabled: false,
        });
        return { ok: true, created: true };
      }
      throw notFoundErr;
    }
    await admin.auth().updateUser(userRecord.uid, { password: newPw });
    return { ok: true, created: false };
  } catch (e) {
    console.error("adminResetUserPassword error:", e);
    throw new functions.https.HttpsError("internal", e.message);
  }
});

// ── 전 직원 Firestore accounts → Firebase Auth 일괄 마이그레이션 (admin only) ──
// 각 accounts/{empid} 문서에 대해 "{empid-lower}@neothai-order.firebaseapp.com" Auth 계정을 보장한다.
// 이미 존재하면 건너뜀 (비번 덮어쓰지 않음). 없으면 초기 비번 = 사번 으로 생성.
// 사번이 6자 미만이면 Firebase Auth 최소 길이 제약을 위해 0 패딩.
exports.migrateAllAccountsToAuth = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "로그인 필요");
    }
    if (!_isAdminClaim(context)) {
      throw new functions.https.HttpsError("permission-denied", "관리자만 가능");
    }

    const snap = await db.collection("accounts").get();
    const results = { total: snap.size, created: 0, existed: 0, skipped: 0, failed: [] };

    for (const doc of snap.docs) {
      const empid = String(doc.id || "").trim();
      if (!empid) { results.skipped++; continue; }
      const email = empid.toLowerCase() + "@neothai-order.firebaseapp.com";
      let password = empid;
      if (password.length < 6) {
        password = password + "000000".slice(0, 6 - password.length);
      }

      try {
        await admin.auth().getUserByEmail(email);
        results.existed++;
      } catch (notFoundErr) {
        if (notFoundErr.code !== "auth/user-not-found") {
          results.failed.push({ empid: empid, msg: notFoundErr.message });
          continue;
        }
        try {
          await admin.auth().createUser({
            email: email,
            password: password,
            emailVerified: false,
            disabled: false,
          });
          results.created++;
        } catch (createErr) {
          results.failed.push({ empid: empid, msg: createErr.message });
        }
      }
    }
    console.log("[migrateAllAccountsToAuth]", JSON.stringify(results));
    return results;
  });

// ── Firebase Auth 에는 있지만 Firestore accounts 에는 없는 "유령 계정" 조회 ──
// 관리자 전용. dryRun=true 면 조회만, false 면 stub Firestore 프로필을 생성까지 수행한다.
// stub 프로필은 role='user', permissions=[] 로 만들어져 가입 직후 상태와 동일하므로
// 관리자가 계정 관리 패널에서 부서/권한만 채워 넣으면 됨.
exports.healOrphanedAuthUsers = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "로그인 필요");
    }
    if (!_isAdminClaim(context)) {
      throw new functions.https.HttpsError("permission-denied", "관리자만 가능");
    }
    const dryRun = !!(data && data.dryRun);

    // 1) 모든 Firebase Auth 사용자 나열
    const authEmpids = new Set();
    const authDetails = [];
    let nextPageToken;
    do {
      const listResult = await admin.auth().listUsers(1000, nextPageToken);
      for (const u of listResult.users) {
        const email = (u.email || "").toLowerCase();
        if (!email.includes("@neothai-order.firebaseapp.com")) continue;
        const empid = email.split("@")[0].toUpperCase();
        if (!empid) continue;
        authEmpids.add(empid);
        authDetails.push({ empid: empid, uid: u.uid, email: email, created: u.metadata.creationTime });
      }
      nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    // 2) Firestore accounts 전체 조회 (대소문자 정규화)
    const snap = await db.collection("accounts").get();
    const firestoreEmpids = new Set();
    snap.forEach(function (d) { firestoreEmpids.add(String(d.id).toUpperCase()); });

    // 3) Auth 에만 존재하는 고아 계정 추출
    const orphans = authDetails.filter(function (a) { return !firestoreEmpids.has(a.empid); });
    const results = {
      authTotal: authEmpids.size,
      firestoreTotal: firestoreEmpids.size,
      orphanCount: orphans.length,
      orphans: orphans,
      dryRun: dryRun,
      healed: [],
      failed: [],
    };

    if (dryRun || orphans.length === 0) {
      console.log("[healOrphanedAuthUsers/dryRun]", JSON.stringify({
        authTotal: results.authTotal,
        firestoreTotal: results.firestoreTotal,
        orphanCount: results.orphanCount,
      }));
      return results;
    }

    // 4) stub Firestore 프로필 생성
    const FieldValue = admin.firestore.FieldValue;
    for (const orphan of orphans) {
      try {
        await db.collection("accounts").doc(orphan.empid).set({
          empid: orphan.empid,
          name: "",
          nickname: "",
          dept: "",
          sub_dept: "",
          tel: "",
          email: "",
          role: "user",
          permissions: [],
          _healedFromAuth: true,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: false });
        results.healed.push(orphan.empid);
      } catch (e) {
        results.failed.push({ empid: orphan.empid, msg: e.message });
      }
    }
    console.log("[healOrphanedAuthUsers]", JSON.stringify({
      orphanCount: results.orphanCount,
      healed: results.healed.length,
      failed: results.failed.length,
    }));
    return results;
  });

// ── 출퇴근 알림: attendanceNotify 문서 생성 시 관리자에게 FCM 발송 ──
exports.onAttendanceNotify = functions.firestore
  .document("attendanceNotify/{docId}")
  .onCreate(async (snap) => {
    const data = snap.data();
    const typeLabel = data.typeLabel || (data.type === "in" ? "출근" : "퇴근");
    const icon = data.type === "in" ? "☀️" : "🌙";
    await sendToOfficeTeam(
      `${icon} ${typeLabel} 알림`,
      `${data.name || data.empid} (${data.nickname || data.dept || "-"}) — ${data.time}\n${data.address || ""}`,
      { notifType: "attendance", empid: data.empid || "" },
    );
    // 알림 발송 후 문서 삭제 (일회성)
    await snap.ref.delete();
  });

// ══════════════════════════════════════════════════════════════════════════════
// ── 일일 고객 변경 리포트 (월~금 18:00 ICT) ──
// ══════════════════════════════════════════════════════════════════════════════
exports.dailyCustomerChangeReport = functions
  .runWith({ secrets: ["GMAIL_USER", "GMAIL_APP_PASSWORD"] })
  .pubsub
  .schedule("0 17 * * 1-5")
  .timeZone("Asia/Bangkok")
  .onRun(async () => {
    // 1) 미발송 changelog 조회
    const snap = await db.collection("customerChangelog").get();
    if (snap.empty) {
      console.log("[CustomerReport] 변경 사항 없음 — 이메일 발송 건너뜀");
      return null;
    }

    const changes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const added = changes.filter(c => c.type === "added");
    const updated = changes.filter(c => c.type === "updated");
    const deleted = changes.filter(c => c.type === "deleted");

    // 2) 수신자 목록 (고정 + 영업관리팀)
    const fixedRecipients = ["hongchul.kim@neobiotech.com"];
    const acctSnap = await db.collection("accounts")
      .where("dept", "==", "Office")
      .where("sub_dept", "==", "영업관리")
      .get();
    const teamEmails = acctSnap.docs
      .map(d => d.data().email)
      .filter(e => e && e.includes("@"));
    const recipients = [...new Set([...fixedRecipients, ...teamEmails])];

    // 3) 엑셀 파일 생성
    const wb = new ExcelJS.Workbook();
    const hdrStyle = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }, alignment: { horizontal: "center" } };

    function applyHeader(ws) { ws.getRow(1).eachCell(c => { c.font = hdrStyle.font; c.fill = hdrStyle.fill; c.alignment = hdrStyle.alignment; }); }
    function fmtDate(ts) { try { return ts.toDate().toLocaleString("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }

    if (added.length) {
      const ws = wb.addWorksheet("Added");
      ws.columns = [
        { header: "ERP", key: "erp", width: 10 },
        { header: "Customer Name", key: "name", width: 20 },
        { header: "Clinic", key: "clinic", width: 25 },
        { header: "Details", key: "summary", width: 35 },
        { header: "Changed By", key: "changedBy", width: 18 },
        { header: "Date/Time", key: "changedAt", width: 20 },
      ];
      applyHeader(ws);
      added.forEach(r => ws.addRow({ erp: r.erp, name: r.name, clinic: r.clinic, summary: r.summary, changedBy: r.changedBy, changedAt: fmtDate(r.changedAt) }));
    }

    if (updated.length) {
      const ws = wb.addWorksheet("Updated");
      ws.columns = [
        { header: "ERP", key: "erp", width: 10 },
        { header: "Customer Name", key: "name", width: 20 },
        { header: "Clinic", key: "clinic", width: 25 },
        { header: "Changes", key: "summary", width: 40 },
        { header: "Changed By", key: "changedBy", width: 18 },
        { header: "Date/Time", key: "changedAt", width: 20 },
      ];
      applyHeader(ws);
      updated.forEach(r => ws.addRow({ erp: r.erp, name: r.name, clinic: r.clinic, summary: r.summary, changedBy: r.changedBy, changedAt: fmtDate(r.changedAt) }));
    }

    if (deleted.length) {
      const ws = wb.addWorksheet("Deleted");
      ws.columns = [
        { header: "ERP", key: "erp", width: 10 },
        { header: "Customer Name", key: "name", width: 20 },
        { header: "Clinic", key: "clinic", width: 25 },
        { header: "Changed By", key: "changedBy", width: 18 },
        { header: "Date/Time", key: "changedAt", width: 20 },
      ];
      applyHeader(ws);
      deleted.forEach(r => ws.addRow({ erp: r.erp, name: r.name, clinic: r.clinic, changedBy: r.changedBy, changedAt: fmtDate(r.changedAt) }));
    }

    const buffer = await wb.xlsx.writeBuffer();

    // 4) Gmail SMTP 이메일 발송
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass || gmailUser.includes("여기에")) {
      console.error("[CustomerReport] Gmail credentials not configured");
      return null;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    const now = new Date();
    const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const dateStr = ict.toISOString().slice(0, 10);

    const summary = [];
    if (added.length) summary.push("Added " + added.length);
    if (updated.length) summary.push("Updated " + updated.length);
    if (deleted.length) summary.push("Deleted " + deleted.length);

    await transporter.sendMail({
      from: `"Neo Sales System" <${gmailUser}>`,
      to: recipients.join(", "),
      subject: `[Customer Change Report] ${dateStr} — ${summary.join(", ")}`,
      html: `<h2>Customer Change Report (${dateStr})</h2>
        <ul>
          ${added.length ? "<li>Added: " + added.length + "</li>" : ""}
          ${updated.length ? "<li>Updated: " + updated.length + "</li>" : ""}
          ${deleted.length ? "<li>Deleted: " + deleted.length + "</li>" : ""}
        </ul>
        <p>Please refer to the attached Excel file for details.</p>
        <hr><p style="color:#999;font-size:12px;">Auto-generated by Neo Sales App</p>`,
      attachments: [{
        filename: `Customer_Changes_${dateStr}.xlsx`,
        content: buffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }],
    });

    console.log(`[CustomerReport] ${dateStr}: ${changes.length}건 → ${recipients.length}명 발송 완료`);

    // 5) 발송 완료 changelog 일괄 삭제
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    return null;
  });

// ── 수동 테스트: 고객 변경 리포트 즉시 발송 ──
exports.testCustomerReport = functions
  .region("asia-southeast1")
  .runWith({ secrets: ["GMAIL_USER", "GMAIL_APP_PASSWORD"] })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (!(await _verifyAdminRequest(req, res))) return;
    try {
      // 데이터 없으면 테스트용 더미 데이터 삽입
      let snap = await db.collection("customerChangelog").get();
      if (snap.empty) {
        const now = admin.firestore.FieldValue.serverTimestamp();
        await db.collection("customerChangelog").add({
          type: "added", erp: "99999", name: "Test Customer", clinic: "Test Clinic",
          summary: "New customer added (test)", changedBy: "System Test", changedAt: now,
        });
        await db.collection("customerChangelog").add({
          type: "updated", erp: "12345", name: "Sample Hospital", clinic: "Sample Clinic",
          summary: "Tel: 02-123-4567 → 02-999-8888", changedBy: "System Test", changedAt: now,
        });
        // 재조회
        snap = await db.collection("customerChangelog").get();
      }
      const changes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const added = changes.filter(c => c.type === "added");
      const updated = changes.filter(c => c.type === "updated");
      const deleted = changes.filter(c => c.type === "deleted");

      const fixedRecipients = ["hongchul.kim@neobiotech.com"];
      const acctSnap = await db.collection("accounts")
        .where("dept", "==", "Office")
        .where("sub_dept", "==", "영업관리")
        .get();
      const teamEmails = acctSnap.docs.map(d => d.data().email).filter(e => e && e.includes("@"));
      const recipients = [...new Set([...fixedRecipients, ...teamEmails])];

      const wb = new ExcelJS.Workbook();
      const hdrStyle = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }, alignment: { horizontal: "center" } };
      function applyHeader(ws) { ws.getRow(1).eachCell(c => { c.font = hdrStyle.font; c.fill = hdrStyle.fill; c.alignment = hdrStyle.alignment; }); }
      function fmtDate(ts) { try { return ts.toDate().toLocaleString("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }

      if (added.length) {
        const ws = wb.addWorksheet("Added");
        ws.columns = [
          { header: "ERP", key: "erp", width: 10 }, { header: "Customer Name", key: "name", width: 20 },
          { header: "Clinic", key: "clinic", width: 25 }, { header: "Details", key: "summary", width: 35 },
          { header: "Changed By", key: "changedBy", width: 18 }, { header: "Date/Time", key: "changedAt", width: 20 },
        ];
        applyHeader(ws);
        added.forEach(r => ws.addRow({ erp: r.erp, name: r.name, clinic: r.clinic, summary: r.summary, changedBy: r.changedBy, changedAt: fmtDate(r.changedAt) }));
      }
      if (updated.length) {
        const ws = wb.addWorksheet("Updated");
        ws.columns = [
          { header: "ERP", key: "erp", width: 10 }, { header: "Customer Name", key: "name", width: 20 },
          { header: "Clinic", key: "clinic", width: 25 }, { header: "Changes", key: "summary", width: 40 },
          { header: "Changed By", key: "changedBy", width: 18 }, { header: "Date/Time", key: "changedAt", width: 20 },
        ];
        applyHeader(ws);
        updated.forEach(r => ws.addRow({ erp: r.erp, name: r.name, clinic: r.clinic, summary: r.summary, changedBy: r.changedBy, changedAt: fmtDate(r.changedAt) }));
      }
      if (deleted.length) {
        const ws = wb.addWorksheet("Deleted");
        ws.columns = [
          { header: "ERP", key: "erp", width: 10 }, { header: "Customer Name", key: "name", width: 20 },
          { header: "Clinic", key: "clinic", width: 25 }, { header: "Changed By", key: "changedBy", width: 18 },
          { header: "Date/Time", key: "changedAt", width: 20 },
        ];
        applyHeader(ws);
        deleted.forEach(r => ws.addRow({ erp: r.erp, name: r.name, clinic: r.clinic, changedBy: r.changedBy, changedAt: fmtDate(r.changedAt) }));
      }

      const buffer = await wb.xlsx.writeBuffer();
      const gmailUser = process.env.GMAIL_USER;
      const gmailPass = process.env.GMAIL_APP_PASSWORD;
      if (!gmailUser || !gmailPass) {
        res.status(500).json({ ok: false, error: "Gmail credentials not configured" });
        return;
      }

      const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
      const now = new Date();
      const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const dateStr = ict.toISOString().slice(0, 10);
      const summary = [];
      if (added.length) summary.push("Added " + added.length);
      if (updated.length) summary.push("Updated " + updated.length);
      if (deleted.length) summary.push("Deleted " + deleted.length);

      await transporter.sendMail({
        from: `"Neo Sales System" <${gmailUser}>`,
        to: recipients.join(", "),
        subject: `[Customer Change Report] ${dateStr} — ${summary.join(", ")} (TEST)`,
        html: `<h2>Customer Change Report (${dateStr}) — TEST</h2>
          <ul>
            ${added.length ? "<li>Added: " + added.length + "</li>" : ""}
            ${updated.length ? "<li>Updated: " + updated.length + "</li>" : ""}
            ${deleted.length ? "<li>Deleted: " + deleted.length + "</li>" : ""}
          </ul>
          <p>Please refer to the attached Excel file for details.</p>
          <hr><p style="color:#999;font-size:12px;">Auto-generated by Neo Sales App (Manual Test)</p>`,
        attachments: [{ filename: `Customer_Changes_${dateStr}.xlsx`, content: buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
      });

      // 테스트 데이터 정리
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      res.json({ ok: true, message: `${changes.length}건 → ${recipients.length}명 발송 완료`, recipients, summary });
    } catch (err) {
      console.error("[testCustomerReport]", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

// ── RD VAT Service Proxy (CORS proxy for SOAP call) ──
exports.rdVatLookup = functions.region("asia-southeast1").https.onRequest(async (req, res) => {
  // CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  const axios = require("axios");
  const body = req.body || {};
  const tin = (body.tin || "").trim();
  const name = (body.name || "").trim();
  if (!tin && !name) { res.status(400).json({error:"tin or name required"}); return; }

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Service xmlns="https://rdws.rd.go.th/serviceRD3/vatserviceRD3">
      <username>anonymous</username>
      <password>anonymous</password>
      <TIN>${tin}</TIN>
      <Name>${name}</Name>
      <ProvinceCode>0</ProvinceCode>
      <BranchNumber>0</BranchNumber>
      <AmphurCode>0</AmphurCode>
    </Service>
  </soap:Body>
</soap:Envelope>`;

  try {
    const resp = await axios.post(
      "https://rdws.rd.go.th/serviceRD3/vatserviceRD3.asmx",
      soapBody,
      {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": "https://rdws.rd.go.th/serviceRD3/vatserviceRD3/Service",
        },
        timeout: 15000,
      }
    );
    // parse XML → extract fields
    const xml = resp.data;
    const get = (tag) => {
      const m = xml.match(new RegExp("<" + tag + ">.*?<anyType[^>]*>([\\s\\S]*?)</anyType>.*?</" + tag + ">"));
      return m ? m[1].trim() : "";
    };
    const getAll = (tag) => {
      const results = [];
      const re = new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">", "g");
      let match;
      while ((match = re.exec(xml)) !== null) {
        const inner = match[1];
        const vals = [];
        const reVal = /<anyType[^>]*>([^<]*)<\/anyType>/g;
        let vm;
        while ((vm = reVal.exec(inner)) !== null) vals.push(vm[1].trim());
        if (vals.length) results.push(vals);
      }
      return results;
    };

    // Check for multiple results (vNID appears multiple times)
    const nidMatches = getAll("vNID");
    if (nidMatches.length > 1) {
      const tags = ["vNID","vtitleName","vName","vSurname","vBranchTitleName","vBranchName",
        "vBranchNumber","vBuildingName","vFloorNumber","vVillageName","vRoomNumber",
        "vHouseNumber","vMooNumber","vSoiName","vStreetName","vThambol","vAmphur",
        "vProvince","vPostCode","vBusinessFirstDate"];
      const allTags = {};
      tags.forEach(tg => { allTags[tg] = getAll(tg); });
      const items = [];
      for (let i = 0; i < nidMatches.length; i++) {
        const item = {};
        tags.forEach(tg => {
          item[tg] = (allTags[tg][i] && allTags[tg][i][0]) || "";
        });
        items.push(item);
      }
      res.json({ results: items }); return;
    }

    res.json({
      results: [{
        vNID: get("vNID"), vtitleName: get("vtitleName"), vName: get("vName"),
        vSurname: get("vSurname"), vBranchName: get("vBranchName"), vBranchNumber: get("vBranchNumber"),
        vBuildingName: get("vBuildingName"), vFloorNumber: get("vFloorNumber"), vRoomNumber: get("vRoomNumber"),
        vHouseNumber: get("vHouseNumber"), vMooNumber: get("vMooNumber"), vSoiName: get("vSoiName"),
        vStreetName: get("vStreetName"), vThambol: get("vThambol"), vAmphur: get("vAmphur"),
        vProvince: get("vProvince"), vPostCode: get("vPostCode"), vBusinessFirstDate: get("vBusinessFirstDate"),
      }],
    });
  } catch (err) {
    console.error("RD VAT lookup error:", err.message);
    res.status(500).json({error: "RD service error: " + err.message});
  }
});

// ── DBD 법인 조회 (openapi.dbd.go.th) ──
exports.dbdLookup = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }

  const id = (req.query.id || "").trim();
  if (!id || !/^\d{13}$/.test(id)) {
    res.status(400).json({ error: "13자리 법인등록번호를 입력하세요" });
    return;
  }

  try {
    const resp = await axios.get(
      `https://openapi.dbd.go.th/api/v1/juristic_person/${id}`,
      { timeout: 15000, headers: { "Accept": "application/json" } }
    );

    const raw = resp.data;

    // debug mode: return raw API response
    if (req.query.debug === "1") {
      res.json({ raw });
      return;
    }

    // Check status
    if (!raw || !raw.status || raw.status.code === "1004" ||
        !raw.data || !raw.data.length) {
      res.json({ found: false, data: null });
      return;
    }

    const jp = raw.data[0]["cd:OrganizationJuristicPerson"] || {};
    const addrWrap = jp["cd:OrganizationJuristicAddress"] || {};
    const addr = addrWrap["cr:AddressType"] || {};
    const sub = addr["cd:CitySubDivision"] || {};
    const city = addr["cd:City"] || {};
    const prov = addr["cd:CountrySubDivision"] || {};
    const obj = jp["cd:OrganizationJuristicObjective"] || {};
    const objDetail = obj["td:JuristicObjective"] || {};

    const province = prov["cr:CountrySubDivisionTextTH"] || "";
    const district = city["cr:CityTextTH"] || "";
    const subdistrict = sub["cr:CitySubDivisionTextTH"] || "";
    const fullAddr = addr["cd:Address"] || "";

    res.json({
      found: true,
      data: {
        regNo: jp["cd:OrganizationJuristicID"] || id,
        nameTh: jp["cd:OrganizationJuristicNameTH"] || "",
        nameEn: jp["cd:OrganizationJuristicNameEN"] || "",
        type: jp["cd:OrganizationJuristicType"] || "",
        status: jp["cd:OrganizationJuristicStatus"] || "",
        regDate: jp["cd:OrganizationJuristicRegisterDate"] || "",
        capital: jp["cd:OrganizationJuristicRegisterCapital"] || "",
        objective: objDetail["td:JuristicObjectiveTextTH"] || "",
        objectiveEn: objDetail["td:JuristicObjectiveTextEN"] || "",
        branch: jp["cd:OrganizationJuristicBranchName"] || "",
        address: fullAddr || [subdistrict, district, province].filter(Boolean).join(" "),
        subdistrict,
        district,
        province,
      },
    });
  } catch (err) {
    console.error("DBD lookup error:", err.message);
    if (err.response && (err.response.status === 403 || err.response.status === 404)) {
      res.json({ found: false, data: null });
      return;
    }
    res.status(500).json({ error: "DBD service error: " + err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── 예약 공지 처리 (매 시간 정각) ──
// ══════════════════════════════════════════════════════════════════════════════
exports.processScheduledAnnouncements = functions.pubsub
  .schedule("0 * * * *")   // 매시 정각
  .timeZone("Asia/Bangkok")
  .onRun(async () => {
    const now = new Date();
    const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const nowISO = ict.toISOString().slice(0, 16); // "2026-04-12T09:00"

    const snap = await db.collection("scheduledAnnouncements")
      .where("sent", "==", false)
      .get();

    let sentCount = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const schedAt = (data.scheduledAt || "").slice(0, 16);
      if (schedAt <= nowISO) {
        // 공지 발송
        await db.collection("announcements").add({
          title: data.title,
          message: data.message,
          sender: data.sender || "System",
          senderEmpid: data.senderEmpid || "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          readBy: [],
          active: true,
        });
        await doc.ref.update({ sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp() });
        sentCount++;
      }
    }
    if (sentCount > 0) console.log(`[ScheduledAnnounce] ${sentCount}건 예약 공지 발송 완료`);
    return null;
  });

// ══════════════════════════════════════════════════════════════════════════════
// ── 매월 1일 09:00 유류 지원금 공지 자동 발송 ──
// ══════════════════════════════════════════════════════════════════════════════
exports.monthlyFuelSubsidyNotice = functions.pubsub
  .schedule("0 9 1 * *")   // 매월 1일 09:00 ICT
  .timeZone("Asia/Bangkok")
  .onRun(async () => {
    // 전월 데이터 기준 (예: 5월1일 실행 → 4월 데이터)
    const now = new Date();
    const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const curYear = ict.getFullYear();
    const curMonth = ict.getMonth() + 1; // 1-12
    // 전월
    let srcYear = curYear, srcMonth = curMonth - 1;
    if (srcMonth === 0) { srcMonth = 12; srcYear--; }
    const srcMM = String(srcMonth).padStart(2, "0");

    // PTT 월별 데이터 가져오기 (getPttMonthly 로직 재사용)
    const daysInMonth = new Date(srcYear, srcMonth, 0).getDate();
    const results = [];
    const batchSize = 5;
    for (let i = 1; i <= daysInMonth; i += batchSize) {
      const promises = [];
      for (let j = i; j < i + batchSize && j <= daysInMonth; j++) {
        const dd = String(j).padStart(2, "0");
        promises.push(
          axios.post("https://orapiweb.pttor.com/oilservice/OilPrice.asmx",
            `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><CurrentOilPriceProvincial xmlns="http://www.pttor.com"><dd>${dd}</dd><mm>${srcMM}</mm><yyyy>${srcYear}</yyyy><provID>1</provID></CurrentOilPriceProvincial></soap12:Body></soap12:Envelope>`,
            { headers: { "Content-Type": "application/soap+xml; charset=utf-8" }, timeout: 10000 }
          ).then(r => {
            const items = [];
            const regex = /<PRICE_NAME>(.*?)<\/PRICE_NAME>[\s\S]*?<PRICE>([\d.]+)<\/PRICE>/g;
            let m;
            while ((m = regex.exec(r.data)) !== null) items.push({ name: m[1], price: parseFloat(m[2]) });
            const dateMatch = r.data.match(/<PRICE_DATE>(\d{2}\/\d{2}\/\d{4}.*?)<\/PRICE_DATE>/);
            return items.length ? { date: dateMatch ? dateMatch[1] : `${dd}/${srcMM}/${srcYear}`, items } : null;
          }).catch(() => null)
        );
      }
      const batch = await Promise.all(promises);
      batch.filter(Boolean).forEach(r => results.push(r));
    }

    // 중복 제거
    const seen = {};
    const announcements = [];
    results.forEach(r => {
      const key = r.date.split(" ")[0];
      if (!seen[key]) { seen[key] = true; announcements.push(r); }
    });
    announcements.sort((a, b) => a.date.localeCompare(b.date));

    if (!announcements.length) {
      console.log("[FuelNotice] 전월 데이터 없음, 공지 생성 스킵");
      return null;
    }

    // Gasohol 95 평균 계산
    let g95Total = 0, g95Count = 0;
    const priceLines = [];
    announcements.forEach((a, idx) => {
      a.items.forEach(item => {
        if (item.name === "Gasohol 95" || item.name.indexOf("Gasohol 95") >= 0) {
          const dateStr = a.date.split(" ")[0];
          const dp = dateStr.split("/");
          const fmtDate = dp.length === 3 ? dp[0] + "." + dp[1] + "." + dp[2] : dateStr;
          priceLines.push(`   ${idx + 1}          ${fmtDate}             ${item.price.toFixed(2)}`);
          g95Total += item.price;
          g95Count++;
        }
      });
    });
    if (g95Count === 0) { console.log("[FuelNotice] Gasohol 95 데이터 없음"); return null; }

    const g95Avg = (g95Total / g95Count).toFixed(2);
    const g95Num = parseFloat(g95Avg);
    let rate = 7;
    if (g95Num <= 35) rate = 5;
    else if (g95Num <= 40) rate = 6;

    // 태국어 월명
    const thMonths = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const applyThStr = thMonths[curMonth] + " " + (curYear + 543);
    const srcMonthStr = thMonths[srcMonth] + " " + (srcYear + 543);

    const title = "แจ้งอัตราค่าน้ำมันประจำเดือน" + applyThStr;
    let msg = "เรียน พนักงานทุกท่าน\n\n";
    msg += "ทางบริษัทขอประกาศแจ้งอัตราค่าน้ำมันประจำเดือน" + applyThStr + "\n";
    msg += "โดยจะคำนวณจากราคาเฉลี่ยของราคาน้ำมันที่เปลี่ยนแปลงของเดือนที่ผ่านมา (" + srcMonthStr + ")\n";
    msg += "โดยอ้างอิงราคาน้ำมันจากเว็บไซต์ ปตท. (https://www.pttor.com/th/oil_price)\n";
    msg += "【✅ อัตราที่ใช้เดือน" + applyThStr + ": " + rate + " ฿/km (เฉลี่ย " + g95Avg + " ฿/ลิตร)】\n\n";
    msg += "━━━━━━━━━━━━━━━━━━━━\n";
    msg += "  ครั้งที่      วันที่              Gasohol 95 (BKK)\n";
    msg += "━━━━━━━━━━━━━━━━━━━━\n";
    msg += priceLines.join("\n") + "\n";
    msg += "━━━━━━━━━━━━━━━━━━━━\n";
    msg += "  รวม / Total                     " + g95Total.toFixed(2) + "\n";
    msg += "  ราคาเฉลี่ย / Average        " + g95Avg + "\n";
    msg += "━━━━━━━━━━━━━━━━━━━━\n\n";
    msg += "📌 อัตราค่าน้ำมัน (rate to pay / KM)\n";
    msg += "  0-35 ฿/ลิตร  →  5 ฿/km\n";
    msg += "  36-40 ฿/ลิตร  →  6 ฿/km\n";
    msg += "  40 ฿ ขึ้นไป    →  7 ฿/km";

    await db.collection("announcements").add({
      title, message: msg,
      sender: "System (Auto)",
      senderEmpid: "SYSTEM",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      readBy: [],
      active: true,
    });

    console.log(`[FuelNotice] ${curYear}-${String(curMonth).padStart(2, "0")}: 유류 지원금 공지 자동 발송 (rate: ${rate} ฿/km, avg: ${g95Avg})`);
    return null;
  });

// ══════════════════════════════════════════════════════════════════════════════
// ── 매일 18:00 (ICT) 개인별 일일 활동 요약 메신저 발송 ──
// ══════════════════════════════════════════════════════════════════════════════
const SYSTEM_BOT_ID = "SYSTEM_BOT";
const SYSTEM_BOT_NAME = "📊 Daily Summary";

function _botRoomId(empid) {
  return SYSTEM_BOT_ID < empid ? SYSTEM_BOT_ID + "_" + empid : empid + "_" + SYSTEM_BOT_ID;
}

exports.dailyActivitySummary = functions.pubsub
  .schedule("0 18 * * *")
  .timeZone("Asia/Bangkok")
  .onRun(async () => {
    const now = new Date();
    const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = ict.toISOString().slice(0, 10); // "2026-04-11"
    const todayStart = todayStr + "T00:00:00";
    const todayEnd = todayStr + "T23:59:59";

    // 1) 전체 사용자 목록
    const acctSnap = await db.collection("accounts").get();
    const users = [];
    acctSnap.docs.forEach(d => {
      const a = d.data();
      if (a.empid && a.status !== "deleted") users.push({ empid: a.empid, name: a.name || a.empid });
    });
    if (!users.length) return null;

    // 2) 견적 전체 조회 (최근 6개월, JS에서 오늘 필터)
    const sixMonthsAgo = new Date(ict.getTime() - 180 * 24 * 3600000).toISOString().slice(0, 10) + "T00:00:00";
    const quotesSnap = await db.collection("quotes")
      .where("requested_at", ">=", sixMonthsAgo).get();

    // 3) 주문 전체 조회 (최근 6개월)
    const ordersSnap = await db.collection("orders")
      .where("createdAt", ">=", new Date(sixMonthsAgo)).get();

    // 사용자별 집계
    const summary = {};
    users.forEach(u => {
      summary[u.empid] = { name: u.name, quoteReg: 0, quoteAppr: 0, orderReg: 0, orderAppr: 0, orderDone: 0 };
    });

    // 견적 등록 + 승인 (JS 필터)
    quotesSnap.docs.forEach(d => {
      const q = d.data();
      const by = q.requested_by || "";
      if (!summary[by]) return;
      const ra = q.requested_at || "";
      if (ra >= todayStart && ra <= todayEnd) summary[by].quoteReg++;
      if ((q.status === "done" || q.status === "completed") && q.approved_at && q.approved_at.slice(0, 10) === todayStr) summary[by].quoteAppr++;
    });

    // 주문 등록 + 발송 + 배송완료 (JS 필터)
    ordersSnap.docs.forEach(d => {
      const o = d.data();
      const empid = o.user_empid || "";
      if (!summary[empid]) return;
      // 등록
      if (o.createdAt) {
        const ct = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
        const ctIct = new Date(ct.getTime() + 7 * 3600000);
        if (ctIct.toISOString().slice(0, 10) === todayStr) summary[empid].orderReg++;
      }
      // 발송
      if (o.status === "shipping" || o.status === "done") {
        const cDate = o.completed_date || "";
        let cToday = cDate.includes(todayStr) || cDate.startsWith(todayStr);
        if (!cToday) { try { const p = new Date(cDate); const pi = new Date(p.getTime() + 7 * 3600000); if (pi.toISOString().slice(0, 10) === todayStr) cToday = true; } catch (e) { /* */ } }
        if (cToday) summary[empid].orderAppr++;
      }
      // 배송완료
      if (o.status === "done") {
        const dDate = o.delivered_date || "";
        let dToday = dDate.includes(todayStr) || dDate.startsWith(todayStr);
        if (!dToday) { try { const p = new Date(dDate); const pi = new Date(p.getTime() + 7 * 3600000); if (pi.toISOString().slice(0, 10) === todayStr) dToday = true; } catch (e) { /* */ } }
        if (dToday) summary[empid].orderDone++;
      }
    });

    // 6) 각 사용자에게 메신저 메시지 발송
    let sentCount = 0;
    for (const empid of Object.keys(summary)) {
      const s = summary[empid];
      // 활동이 0건이면 스킵
      if (s.quoteReg + s.quoteAppr + s.orderReg + s.orderAppr + s.orderDone === 0) continue;

      const roomId = _botRoomId(empid);
      const text = `📊 일일 활동 요약 (${todayStr})\n\n` +
        `📋 견적\n` +
        `  • 등록: ${s.quoteReg}건\n` +
        `  • 승인: ${s.quoteAppr}건\n\n` +
        `📦 주문\n` +
        `  • 등록: ${s.orderReg}건\n` +
        `  • 발송: ${s.orderAppr}건\n` +
        `  • 배송완료: ${s.orderDone}건\n\n` +
        `오늘도 수고하셨습니다! 💪`;

      // 메시지 추가
      await db.collection("chats").doc(roomId).collection("messages").add({
        from: SYSTEM_BOT_ID,
        fromName: SYSTEM_BOT_NAME,
        to: empid,
        text: text,
        ts: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 채팅방 메타데이터 업데이트
      await db.collection("chats").doc(roomId).set({
        participants: [SYSTEM_BOT_ID, empid].sort(),
        lastMsg: text,
        lastTs: admin.firestore.FieldValue.serverTimestamp(),
        lastFrom: SYSTEM_BOT_ID,
        lastFromName: SYSTEM_BOT_NAME,
        ["name_" + SYSTEM_BOT_ID]: SYSTEM_BOT_NAME,
        ["name_" + empid]: s.name,
      }, { merge: true });

      sentCount++;
    }

    console.log(`[DailyActivity] ${todayStr}: ${sentCount}명에게 활동 요약 메신저 발송`);
    return null;
  });

// ── 테스트: 특정 사용자에게 일일 요약 샘플 발송 ──
exports.testDailySummary = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (!(await _verifyAdminRequest(req, res))) return;
  try {
    const empid = req.query.empid || "T2601107";
    const now = new Date();
    const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = ict.toISOString().slice(0, 10);
    const todayStart = todayStr + "T00:00:00";
    const todayEnd = todayStr + "T23:59:59";

    const acctDoc = await db.collection("accounts").doc(empid).get();
    const userName = acctDoc.exists ? (acctDoc.data().name || empid) : empid;

    // 견적: requested_by로만 조회 후 JS 필터
    const qAllSnap = await db.collection("quotes")
      .where("requested_by", "==", empid).get();
    let quoteReg = 0, quoteAppr = 0;
    qAllSnap.docs.forEach(d => {
      const q = d.data();
      const ra = q.requested_at || "";
      if (ra >= todayStart && ra <= todayEnd) quoteReg++;
      if ((q.status === "done" || q.status === "completed") && q.approved_at && q.approved_at.slice(0, 10) === todayStr) quoteAppr++;
    });

    // 주문: user_empid로만 조회 후 JS 필터
    const oAllSnap = await db.collection("orders")
      .where("user_empid", "==", empid).get();
    let orderReg = 0, orderAppr = 0, orderDone = 0;
    oAllSnap.docs.forEach(d => {
      const o = d.data();
      // 등록 (createdAt이 오늘)
      if (o.createdAt) {
        const ct = o.createdAt.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
        const ctIct = new Date(ct.getTime() + 7 * 3600000);
        if (ctIct.toISOString().slice(0, 10) === todayStr) orderReg++;
      }
      // 발송 (completed_date가 오늘, status: shipping or done)
      if (o.status === "shipping" || o.status === "done") {
        const cDate = o.completed_date || "";
        let cToday = cDate.includes(todayStr) || cDate.startsWith(todayStr);
        if (!cToday) { try { const p = new Date(cDate); const pi = new Date(p.getTime() + 7 * 3600000); if (pi.toISOString().slice(0, 10) === todayStr) cToday = true; } catch (e) { /* */ } }
        if (cToday) orderAppr++;
      }
      // 배송완료 (delivered_date가 오늘, status: done)
      if (o.status === "done") {
        const dDate = o.delivered_date || "";
        let dToday = dDate.includes(todayStr) || dDate.startsWith(todayStr);
        if (!dToday) { try { const p = new Date(dDate); const pi = new Date(p.getTime() + 7 * 3600000); if (pi.toISOString().slice(0, 10) === todayStr) dToday = true; } catch (e) { /* */ } }
        if (dToday) orderDone++;
      }
    });

    const roomId = _botRoomId(empid);
    const text = `📊 일일 활동 요약 (${todayStr})\n\n` +
      `📋 견적\n  • 등록: ${quoteReg}건\n  • 승인: ${quoteAppr}건\n\n` +
      `📦 주문\n  • 등록: ${orderReg}건\n  • 발송: ${orderAppr}건\n  • 배송완료: ${orderDone}건\n\n` +
      `오늘도 수고하셨습니다! 💪`;

    await db.collection("chats").doc(roomId).collection("messages").add({
      from: SYSTEM_BOT_ID, fromName: SYSTEM_BOT_NAME, to: empid, text, ts: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("chats").doc(roomId).set({
      participants: [SYSTEM_BOT_ID, empid].sort(),
      lastMsg: text, lastTs: admin.firestore.FieldValue.serverTimestamp(),
      lastFrom: SYSTEM_BOT_ID, lastFromName: SYSTEM_BOT_NAME,
      ["name_" + SYSTEM_BOT_ID]: SYSTEM_BOT_NAME, ["name_" + empid]: userName,
    }, { merge: true });

    res.json({
      ok: true, empid, userName, todayStr, roomId,
      counts: { quoteReg, quoteAppr, orderReg, orderAppr, orderDone },
      message: text,
    });
  } catch (e) {
    console.error("testDailySummary error:", e);
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 고객 주소 → 좌표 변환 (내 주변 치과 기능용)
// ═══════════════════════════════════════════════════════════════════
// ⚠️ 2026-04-19 인시던트 이후 자동 onWrite 트리거는 영구 제거됨.
//    (클라이언트-서버 핑퐁 루프로 47M 인보케이션 / ฿4,249 과금 발생)
//
// 현재 전략:
//   1. 클라이언트(nearby-dentists.html)가 Google Maps JS Geocoder 로
//      직접 좌표 변환 → Firestore customers/{docId}.geo 에 저장
//   2. Firestore 에 저장된 geo 는 다른 유저들이 공유해서 사용
//   3. 서버는 관리자 수동 트리거(`backfillGeocode`)만 제공 — 자동 없음
//
// _geocodeAddress 헬퍼는 backfillGeocode 가 사용하므로 유지.
// 키 설정: firebase functions:config:set gmaps.server_key="YOUR_KEY"
// ═══════════════════════════════════════════════════════════════════
// (axios 는 파일 상단에서 이미 require 됨 — 중복 선언 금지)

// ⚠️ 하드코딩 폴백 제거됨 (2026-04-19 보안 강화)
//    이전에는 소스코드에 평문 키가 박혀있어 저장소 유출 시 남용 위험.
//    이제는 functions.config() 또는 환경변수에만 의존.
//
// 키 설정 방법:
//    firebase functions:config:set gmaps.server_key="YOUR_KEY"
//    firebase deploy --only functions
const GMAPS_SERVER_KEY =
  (functions.config().gmaps && functions.config().gmaps.server_key) ||
  process.env.GMAPS_SERVER_KEY ||
  "";

async function _geocodeAddress(address) {
  if (!GMAPS_SERVER_KEY) {
    console.error("[_geocodeAddress] GMAPS_SERVER_KEY 미설정 — firebase functions:config:set gmaps.server_key=... 실행 필요");
    return { ok: false, status: "CONFIG_ERROR", error: "GMAPS_SERVER_KEY not configured" };
  }
  const res = await axios.get(
    "https://maps.googleapis.com/maps/api/geocode/json",
    {
      params: { address: address, region: "th", key: GMAPS_SERVER_KEY },
      timeout: 15000,
    }
  );
  const data = res.data || {};
  if (data.status !== "OK" || !data.results || !data.results.length) {
    return { ok: false, status: data.status || "UNKNOWN", error: data.error_message };
  }
  const loc = data.results[0].geometry.location;
  return { ok: true, lat: loc.lat, lng: loc.lng, formatted: data.results[0].formatted_address };
}

// ─────────────────────────────────────────────────────────────
// geocodeCustomerOnWrite — 제거됨 (2026-04-19)
// 이유: Firestore onWrite 트리거가 클라이언트의 geo 쓰기를 재귀적으로
//       트리거하며 무한 루프 발생 → 47,725,364 인보케이션.
// 대체: 클라이언트가 직접 Geocoding (nearby-dentists.html _geocodeOne)
// 재배포 금지: 다시 필요하면 Pub/Sub 큐 + 외부 수동 enqueue 방식으로 재설계할 것.
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════
// 기존 고객 일괄 backfill — HTTPS 트리거 (관리자용, 1회성)
// ═══════════════════════════════════════════════════════════════════
// 사용법: https://asia-southeast1-neothai-order.cloudfunctions.net/backfillGeocode?limit=50&token=SECRET
// - limit: 한 번에 처리할 개수 (기본 50, 최대 200)
// - 이미 geo 가 있거나 최근 24시간 내 처리한 건은 스킵
// ═══════════════════════════════════════════════════════════════════
exports.backfillGeocode = functions
  .region("asia-southeast1")
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (!(await _verifyAdminRequest(req, res))) return;
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const stats = { scanned: 0, geocoded: 0, skipped: 0, failed: 0, errors: [] };

    try {
      const snap = await db.collection("customers").limit(3000).get();
      const needWork = [];
      snap.docs.forEach((d) => {
        const c = d.data();
        const addr = (c.address || "").trim();
        if (!addr) return;
        const hasGeo =
          c.geo &&
          typeof c.geo.lat === "number" &&
          c.geo.src_address === addr;
        if (hasGeo) return;
        needWork.push({ id: d.id, ref: d.ref, address: addr });
      });
      stats.scanned = snap.size;
      stats.candidates = needWork.length;

      const toProcess = needWork.slice(0, limit);
      for (const item of toProcess) {
        try {
          const result = await _geocodeAddress(item.address);
          if (result.ok) {
            await item.ref.update({
              geo: {
                lat: result.lat,
                lng: result.lng,
                src_address: item.address,
                geocoded_at: admin.firestore.FieldValue.serverTimestamp(),
                source: "backfill",
                status: "OK",
                formatted: result.formatted || null,
              },
            });
            stats.geocoded++;
          } else {
            stats.failed++;
            stats.errors.push({ id: item.id, status: result.status });
            if (result.status === "OVER_QUERY_LIMIT" || result.status === "REQUEST_DENIED") {
              console.warn(`[backfillGeocode] aborting — ${result.status}`);
              break;
            }
          }
          // 레이트 리밋 (50 qps 제한)
          await new Promise((r) => setTimeout(r, 60));
        } catch (e) {
          stats.failed++;
          stats.errors.push({ id: item.id, error: e.message });
        }
      }
      stats.remaining = Math.max(0, needWork.length - toProcess.length);

      res.json({ ok: true, stats });
    } catch (e) {
      console.error("[backfillGeocode] error:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

// ══════════════════════════════════════════════════════════════════════════════
// ── 빌링 자동 차단 (비용 상한 Circuit Breaker) ──
// Budget alert → Pub/Sub 토픽 "billing-alerts" → 이 함수가 결제 연결을 해제
// ══════════════════════════════════════════════════════════════════════════════
exports.stopBilling = functions.pubsub.topic("billing-alerts").onPublish(async (message) => {
  const { google } = require("googleapis");

  let data = {};
  try {
    data = JSON.parse(Buffer.from(message.data, "base64").toString());
  } catch (e) {
    console.error("[stopBilling] failed to parse message:", e);
    return;
  }

  const costAmount = data.costAmount || 0;
  const budgetAmount = data.budgetAmount || 0;
  const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;

  console.log(`[stopBilling] project=${projectId} cost=${costAmount} budget=${budgetAmount}`);

  // ⚠️ 청구 데이터 24시간 지연 때문에, 50% 에서 이미 실제 비용은 500%+ 일 수 있음.
  //    따라서 50% 알림(Pub/Sub) 이 오는 순간 바로 결제 차단한다.
  //    (2026-04-19 42M 인보케이션 스파이크 재발 방지)
  const PANIC_RATIO = 0.5;  // 50% 도달 시 차단
  if (costAmount < budgetAmount * PANIC_RATIO) {
    console.log(`[stopBilling] 안전 범위 (${Math.round((costAmount/budgetAmount)*100)}%) — 차단 안 함`);
    return;
  }
  console.warn(`[stopBilling] ⚠️ PANIC THRESHOLD HIT (${Math.round((costAmount/budgetAmount)*100)}%) — 결제 차단 시도`);

  // 예산 초과 — 결제 연결 해제
  const auth = await google.auth.getClient({
    scopes: ["https://www.googleapis.com/auth/cloud-billing"],
  });
  const billing = google.cloudbilling({ version: "v1", auth });
  const projectName = `projects/${projectId}`;

  try {
    const info = await billing.projects.getBillingInfo({ name: projectName });
    if (!info.data.billingEnabled) {
      console.log("[stopBilling] 이미 차단 상태");
      return;
    }
    const res = await billing.projects.updateBillingInfo({
      name: projectName,
      requestBody: { billingAccountName: "" },
    });
    console.warn("[stopBilling] ⚠️ 결제 차단됨:", JSON.stringify(res.data));
  } catch (e) {
    console.error("[stopBilling] 실패:", e.message);
    throw e;
  }
});
