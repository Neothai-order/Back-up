// Google Apps Script - Customer Master API
// 이 파일을 구글 시트의 Extensions > Apps Script에 붙여넣고 웹 앱으로 배포하세요.

const SHEET_NAME = "Customer master";

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ error: "Sheet not found: " + SHEET_NAME });
    }

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return jsonResponse({ records: [], total: 0 });
    }

    const headers = data[0];

    // Column indices (0-based)
    const COL_STATUS    = 0;   // A
    const COL_SALES     = 2;   // C
    const COL_ERP       = 6;   // G
    const COL_NAME_TH   = 7;   // H
    const COL_NAME_EN   = 8;   // I
    const COL_ADDR1     = 9;   // J
    const COL_TEL1      = 11;  // L
    const COL_CUST_NAME = 12;  // M
    const COL_CLINIC    = 13;  // N
    const COL_NAME_EN2  = 14;  // O
    const COL_ADDR2     = 15;  // P
    const COL_TEL2      = 17;  // R
    const COL_PROVINCE  = 18;  // S
    const COL_DISTRICT  = 19;  // T
    const COL_TYPE      = 20;  // U
    const COL_REMARK    = 21;  // V

    function v(row, idx) {
      const val = row[idx];
      if (val === null || val === undefined || val === "") return "";
      return String(val).trim();
    }

    const records = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const erp = v(row, COL_ERP);
      if (!erp) continue;

      const addr1 = v(row, COL_ADDR1);
      const addr2 = v(row, COL_ADDR2);
      const tel1  = v(row, COL_TEL1);
      const tel2  = v(row, COL_TEL2);
      const province = v(row, COL_PROVINCE);
      const district = v(row, COL_DISTRICT);

      records.push({
        erp:       erp,
        name_th:   v(row, COL_NAME_TH),
        name_en:   v(row, COL_NAME_EN),
        cust_name: v(row, COL_CUST_NAME),
        clinic:    v(row, COL_CLINIC),
        name_en2:  v(row, COL_NAME_EN2),
        sales:     v(row, COL_SALES),
        address:   addr2 || addr1,
        tel:       tel2 || tel1,
        location:  [district, province].filter(Boolean).join(", "),
        type:      v(row, COL_TYPE),
        status:    v(row, COL_STATUS),
        remark:    v(row, COL_REMARK)
      });
    }

    return jsonResponse({ records: records, total: records.length, updated: new Date().toISOString() });

  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
