// ═══════════════════════════════════════════════════════════════════
// Google Sheet → Firestore 고객 마스터 단방향 동기화
//
// - 매 2시간마다 Sheet 읽어서 변경분만 Firestore 에 upsert
// - 매뉴얼 트리거 (HTTPS) 도 함께 제공 (테스트용)
// - 매칭 키: customerId (Sheet A열, Firestore 문서 ID)
// - 증분 기준: Sheet H열 updatedAt (ISO 문자열) > 직전 sync 시각
//
// 첫 운영 시:
//   firebase functions:config:set sheets.spreadsheet_id="<ID>" \
//                                 sheets.range="고객마스터!A2:H" \
//                                 sheets.trigger_token="<RANDOM_SECRET>"
//   firebase deploy --only functions:scheduledCustomerSync,functions:triggerCustomerSync
// ═══════════════════════════════════════════════════════════════════

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");

const db = admin.firestore();

// ─── 설정 ────────────────────────────────────────────────────────
function _config() {
  const c = functions.config().sheets || {};
  return {
    spreadsheetId: c.spreadsheet_id || "",
    range: c.range || "고객마스터!A2:H",
    triggerToken: c.trigger_token || "",
  };
}

const COLLECTION = "customers";
const META_DOC = db.collection("_meta").doc("customer_sync");

// Sheet 컬럼 매핑 (0-indexed)
// A=customerId, B=name, C=phone, D=address, E=tier, F=salesRep, G=notes, H=updatedAt
const COL = {
  customerId: 0,
  name: 1,
  phone: 2,
  address: 3,
  tier: 4,
  salesRep: 5,
  notes: 6,
  updatedAt: 7,
};

// ─── Sheet 읽기 ────────────────────────────────────────────────
async function _readSheet() {
  const cfg = _config();
  if (!cfg.spreadsheetId) {
    throw new Error("sheets.spreadsheet_id 미설정 — 'firebase functions:config:set sheets.spreadsheet_id=...' 실행 필요");
  }
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: cfg.spreadsheetId,
    range: cfg.range,
  });
  return res.data.values || [];
}

// ─── 메타 (lastSyncAt) ────────────────────────────────────────
async function _getLastSyncAt() {
  const doc = await META_DOC.get();
  if (!doc.exists) return null;
  const d = doc.data() || {};
  return d.lastSyncAt ? d.lastSyncAt.toDate() : null;
}

async function _updateLastSyncAt(stats) {
  await META_DOC.set({
    lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
    lastStats: stats,
  }, { merge: true });
}

// ─── 핵심 동기화 로직 ──────────────────────────────────────────
async function _syncFromSheet() {
  const startTime = Date.now();
  const lastSyncAt = await _getLastSyncAt();
  console.log(`[customer_sync] start. lastSyncAt = ${lastSyncAt}`);

  const rows = await _readSheet();
  console.log(`[customer_sync] sheet rows = ${rows.length}`);

  let upserts = 0, skipped = 0, errors = 0;
  let batch = db.batch();
  let batchCount = 0;
  const BATCH_LIMIT = 400; // Firestore 한계는 500, 안전 마진

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const customerId = (row[COL.customerId] || "").toString().trim();
      if (!customerId) { skipped++; continue; }

      const updatedAtStr = (row[COL.updatedAt] || "").toString().trim();
      if (!updatedAtStr) { skipped++; continue; }

      const updatedAt = new Date(updatedAtStr);
      if (isNaN(updatedAt.getTime())) {
        console.warn(`[customer_sync] row ${i + 2}: invalid updatedAt = "${updatedAtStr}"`);
        errors++;
        continue;
      }

      // 증분: lastSyncAt 이후 변경된 것만
      if (lastSyncAt && updatedAt <= lastSyncAt) { skipped++; continue; }

      const data = {
        customerId,
        name:      (row[COL.name]      || "").toString(),
        phone:     (row[COL.phone]     || "").toString(),
        address:   (row[COL.address]   || "").toString(),
        tier:      (row[COL.tier]      || "").toString(),
        salesRep:  (row[COL.salesRep]  || "").toString(),
        notes:     (row[COL.notes]     || "").toString(),
        updatedAt: admin.firestore.Timestamp.fromDate(updatedAt),
        _lastEditor: "sheet",
        _syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const ref = db.collection(COLLECTION).doc(customerId);
      batch.set(ref, data, { merge: true });
      upserts++;
      batchCount++;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        console.log(`[customer_sync] committed batch ${upserts}`);
        batch = db.batch();
        batchCount = 0;
      }
    } catch (e) {
      console.error(`[customer_sync] row ${i + 2} error:`, e.message);
      errors++;
    }
  }

  if (batchCount > 0) await batch.commit();

  const stats = {
    totalRows: rows.length,
    upserts,
    skipped,
    errors,
    durationMs: Date.now() - startTime,
  };
  await _updateLastSyncAt(stats);
  console.log(`[customer_sync] done. stats =`, JSON.stringify(stats));
  return stats;
}

// ─── 1) 스케줄 자동 실행 (매 2시간) ────────────────────────────
exports.scheduledCustomerSync = functions
  .region("asia-northeast3")
  .pubsub.schedule("every 2 hours")
  .timeZone("Asia/Seoul")
  .onRun(async () => {
    try {
      return await _syncFromSheet();
    } catch (e) {
      console.error("[scheduledCustomerSync] failed:", e);
      throw e;
    }
  });

// ─── 2) 매뉴얼 트리거 (테스트/관리용) ───────────────────────────
// 사용법:
//   curl -H "x-sync-token: <TOKEN>" \
//        https://asia-northeast3-neothai-order.cloudfunctions.net/triggerCustomerSync
exports.triggerCustomerSync = functions
  .region("asia-northeast3")
  .https.onRequest(async (req, res) => {
    const token = req.headers["x-sync-token"] || req.query.token;
    const expected = _config().triggerToken;
    if (!expected) {
      res.status(500).json({ error: "trigger_token 미설정" });
      return;
    }
    if (token !== expected) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const stats = await _syncFromSheet();
      res.json({ ok: true, stats });
    } catch (e) {
      console.error("[triggerCustomerSync] failed:", e);
      res.status(500).json({ error: e.message, stack: e.stack });
    }
  });

// 내부에서 직접 호출 가능하도록 export (테스트용)
exports._syncFromSheet = _syncFromSheet;
