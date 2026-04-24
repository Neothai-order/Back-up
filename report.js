// ══════════════════════════════════════════════
// report.js — Daily Report module (overlay mode)
// Extracted from report.html, adapted for index.html
// ══════════════════════════════════════════════

// ── i18n ──
var _drLang = localStorage.getItem('lang') || 'ko';
var _drI18n = {
  dr_title:          { ko:'일일 업무 보고', en:'Daily Work Report', th:'รายงานประจำวัน' },
  dr_date:           { ko:'날짜', en:'Date', th:'วันที่' },
  dr_visits:         { ko:'방문 활동', en:'Visit Activities', th:'กิจกรรมการเยี่ยม' },
  dr_orders:         { ko:'주문 건수', en:'Orders', th:'คำสั่งซื้อ' },
  dr_quotes:         { ko:'견적 건수', en:'Quotes', th:'ใบเสนอราคา' },
  dr_achievements:   { ko:'주요 성과', en:'Key Achievements', th:'ผลสำเร็จ' },
  dr_issues:         { ko:'이슈/문제점', en:'Issues', th:'ปัญหา' },
  dr_tomorrow:       { ko:'내일 계획', en:"Tomorrow's Plan", th:'แผนวันพรุ่งนี้' },
  dr_save_draft:     { ko:'임시 저장', en:'Save Draft', th:'บันทึกร่าง' },
  dr_submit:         { ko:'제출', en:'Submit', th:'ส่ง' },
  dr_review:         { ko:'검토', en:'Review', th:'ตรวจสอบ' },
  dr_reviewed:       { ko:'검토 완료', en:'Reviewed', th:'ตรวจสอบแล้ว' },
  dr_draft:          { ko:'임시 저장', en:'Draft', th:'ร่าง' },
  dr_submitted:      { ko:'제출 완료', en:'Submitted', th:'ส่งแล้ว' },
  dr_comment:        { ko:'검토 의견', en:'Review Comment', th:'ความคิดเห็น' },
  dr_no_visits:      { ko:'이 날의 방문 기록이 없습니다', en:'No visits recorded', th:'ไม่มีบันทึกการเยี่ยม' },
  dr_no_reports:     { ko:'보고서가 없습니다', en:'No reports', th:'ไม่มีรายงาน' },
  dr_saved:          { ko:'저장되었습니다', en:'Saved', th:'บันทึกแล้ว' },
  dr_submit_confirm: { ko:'제출하시겠습니까? 제출 후 수정이 제한됩니다.', en:'Submit? Editing will be restricted.', th:'ส่งรายงาน? การแก้ไขจะถูกจำกัด' },
  dr_write:          { ko:'작성', en:'Write', th:'เขียน' },
  dr_list:           { ko:'목록', en:'List', th:'รายการ' },
  dr_report_review:  { ko:'보고서 검토', en:'Report Review', th:'ตรวจสอบรายงาน' },
  dr_close:          { ko:'닫기', en:'Close', th:'ปิด' },
  dr_visit_type:     { ko:'유형', en:'Type', th:'ประเภท' },
  dr_visit_result:   { ko:'결과', en:'Result', th:'ผลลัพธ์' },
  dr_visit_purpose:  { ko:'목적', en:'Purpose', th:'วัตถุประสงค์' }
};

function _drt(key) {
  var entry = _drI18n[key];
  if (!entry) return key;
  return entry[_drLang] || entry['ko'] || key;
}

// ── Escape HTML ──
function _drEsc(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ── State ──
var _drCurrentDate = '';
var _drCurrentReport = null;
var _drCurrentDocId = null;
var _drVisits = [];
var _drTab = 'form';
var _drReviewDocId = null;

// ── Open overlay ──
function openDailyReport() {
  var overlay = document.getElementById('dailyReportOverlay');
  if (overlay) {
    overlay.classList.add('show');
    initDailyReport();
  }
}

// ── Close overlay (replaces history.back) ──
function _drClose() {
  var overlay = document.getElementById('dailyReportOverlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
}

// ── Init ──
function initDailyReport() {
  var user = getCurrentUser();
  if (!user) {
    location.href = 'index.html';
    return;
  }
  _drLang = localStorage.getItem('lang') || 'ko';
  _applyI18n();
  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, '0');
  var dd = String(today.getDate()).padStart(2, '0');
  _drCurrentDate = yyyy + '-' + mm + '-' + dd;
  document.getElementById('drDatePicker').value = _drCurrentDate;
  _drLoadReport();
  _drLoadVisits();
  _drLoadReportList();
}

function _applyI18n() {
  document.getElementById('drHeaderTitle').textContent = _drt('dr_title');
  document.getElementById('drVisitsTitle').textContent = _drt('dr_visits');
  document.getElementById('lblOrders').textContent = _drt('dr_orders');
  document.getElementById('lblQuotes').textContent = _drt('dr_quotes');
  document.getElementById('lblAchievements').textContent = _drt('dr_achievements');
  document.getElementById('lblIssues').textContent = _drt('dr_issues');
  document.getElementById('lblTomorrow').textContent = _drt('dr_tomorrow');
  document.getElementById('btnDraft').textContent = _drt('dr_save_draft');
  document.getElementById('btnSubmit').textContent = _drt('dr_submit');
  document.getElementById('drNoVisits').textContent = _drt('dr_no_visits');
  document.getElementById('drNoReports').textContent = _drt('dr_no_reports');
  document.getElementById('drTabForm').textContent = _drt('dr_write');
  document.getElementById('drTabList').textContent = _drt('dr_list');
  document.getElementById('drReviewModalTitle').textContent = _drt('dr_report_review');
  document.getElementById('lblReviewComment').textContent = _drt('dr_comment');
  document.getElementById('btnMarkReviewed').textContent = _drt('dr_reviewed');
}

// ── Date change ──
function _drOnDateChange() {
  _drCurrentDate = document.getElementById('drDatePicker').value;
  _drCurrentReport = null;
  _drCurrentDocId = null;
  _drLoadReport();
  _drLoadVisits();
}

// ── Tabs ──
function _drSwitchTab(tab) {
  _drTab = tab;
  document.getElementById('drTabForm').classList.toggle('active', tab === 'form');
  document.getElementById('drTabList').classList.toggle('active', tab === 'list');
  document.getElementById('drFormView').style.display = tab === 'form' ? '' : 'none';
  document.getElementById('drListView').style.display = tab === 'list' ? '' : 'none';
  if (tab === 'list') _drLoadReportList();
}

// ── Load visit_logs ──
function _drLoadVisits() {
  var user = getCurrentUser();
  if (!user || !_drCurrentDate) return;
  var listEl = document.getElementById('drVisitsList');
  listEl.innerHTML = '<div class="dr-no-data" style="padding:16px;color:#9ca3af;">로딩 중...</div>';

  _fbDb.collection('visit_logs')
    .where('empid', '==', user.empid)
    .where('date', '==', _drCurrentDate)
    .get()
    .then(function(snap) {
      _drVisits = [];
      snap.forEach(function(doc) {
        _drVisits.push(doc.data());
      });
      _drRenderVisits();
    })
    .catch(function(err) {
      console.error('visit_logs load error:', err);
      listEl.innerHTML = '<div class="dr-no-data">' + _drt('dr_no_visits') + '</div>';
    });
}

function _drRenderVisits() {
  var listEl = document.getElementById('drVisitsList');
  if (_drVisits.length === 0) {
    listEl.innerHTML = '<div class="dr-no-data">' + _drt('dr_no_visits') + '</div>';
    return;
  }
  var html = '';
  _drVisits.forEach(function(v) {
    html += '<div class="dr-visit-card">';
    html += '<div class="vc-name">' + _drEsc(v.customer_name || v.company_name || '-') + '</div>';
    html += '<div class="vc-meta">';
    if (v.visit_type) html += '<span>' + _drt('dr_visit_type') + ': ' + _drEsc(v.visit_type) + '</span> &nbsp;';
    if (v.purpose) html += '<span>' + _drt('dr_visit_purpose') + ': ' + _drEsc(v.purpose) + '</span> &nbsp;';
    if (v.result) html += '<span>' + _drt('dr_visit_result') + ': ' + _drEsc(v.result) + '</span>';
    html += '</div></div>';
  });
  listEl.innerHTML = html;
}

// ── Load report for current date ──
function _drLoadReport() {
  var user = getCurrentUser();
  if (!user || !_drCurrentDate) return;

  _fbDb.collection('daily_reports')
    .where('empid', '==', user.empid)
    .where('date', '==', _drCurrentDate)
    .limit(1)
    .get()
    .then(function(snap) {
      if (!snap.empty) {
        var doc = snap.docs[0];
        _drCurrentDocId = doc.id;
        _drCurrentReport = doc.data();
        _drFillForm(_drCurrentReport);
        _drShowStatus(_drCurrentReport.status);
        _drToggleFormEditable(_drCurrentReport.status !== 'submitted' && _drCurrentReport.status !== 'reviewed');
      } else {
        _drCurrentDocId = null;
        _drCurrentReport = null;
        _drClearForm();
        _drShowStatus(null);
        _drToggleFormEditable(true);
      }
    })
    .catch(function(err) {
      console.error('report load error:', err);
    });
}

function _drFillForm(data) {
  document.getElementById('drOrders').value = data.orders_count || 0;
  document.getElementById('drQuotes').value = data.quotes_count || 0;
  document.getElementById('drAchievements').value = data.key_achievements || '';
  document.getElementById('drIssues').value = data.issues || '';
  document.getElementById('drTomorrow').value = data.tomorrow_plan || '';
}

function _drClearForm() {
  document.getElementById('drOrders').value = 0;
  document.getElementById('drQuotes').value = 0;
  document.getElementById('drAchievements').value = '';
  document.getElementById('drIssues').value = '';
  document.getElementById('drTomorrow').value = '';
}

function _drShowStatus(status) {
  var el = document.getElementById('drCurrentStatus');
  if (!status) {
    el.innerHTML = '';
    return;
  }
  var cls = 'badge-' + status;
  var label = status === 'draft' ? _drt('dr_draft') : status === 'submitted' ? _drt('dr_submitted') : _drt('dr_reviewed');
  el.innerHTML = '<span class="dr-status-badge ' + cls + '">' + label + '</span>';
}

function _drToggleFormEditable(editable) {
  var ids = ['drOrders', 'drQuotes', 'drAchievements', 'drIssues', 'drTomorrow'];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (editable) {
      el.removeAttribute('disabled');
      el.style.opacity = '1';
    } else {
      el.setAttribute('disabled', 'disabled');
      el.style.opacity = '0.6';
    }
  });
  document.getElementById('btnDraft').style.display = editable ? '' : 'none';
  document.getElementById('btnSubmit').style.display = editable ? '' : 'none';
}

// ── Save draft ──
function _drSaveDraft() {
  _drSaveReport('draft');
}

// ── Submit ──
function _drSubmit() {
  if (!confirm(_drt('dr_submit_confirm'))) return;
  _drSaveReport('submitted');
}

function _drSaveReport(status) {
  var user = getCurrentUser();
  if (!user) return;

  var visitArray = _drVisits.map(function(v) {
    return {
      customer_name: v.customer_name || v.company_name || '',
      visit_type: v.visit_type || '',
      purpose: v.purpose || '',
      result: v.result || ''
    };
  });

  var data = {
    empid: user.empid,
    emp_name: user.name || user.emp_name || '',
    date: _drCurrentDate,
    dept: user.dept || user.department || '',
    visits: visitArray,
    orders_count: parseInt(document.getElementById('drOrders').value) || 0,
    quotes_count: parseInt(document.getElementById('drQuotes').value) || 0,
    key_achievements: document.getElementById('drAchievements').value.trim(),
    issues: document.getElementById('drIssues').value.trim(),
    tomorrow_plan: document.getElementById('drTomorrow').value.trim(),
    status: status
  };

  if (status === 'submitted') {
    data.submitted_at = firebase.firestore.FieldValue.serverTimestamp();
  }

  if (_drCurrentDocId) {
    _fbDb.collection('daily_reports').doc(_drCurrentDocId).update(data)
      .then(function() {
        _drCurrentReport = data;
        _drShowStatus(status);
        if (status === 'submitted') _drToggleFormEditable(false);
        _showDrToast(_drt('dr_saved'));
      })
      .catch(function(err) {
        console.error('save error:', err);
        alert('Error: ' + err.message);
      });
  } else {
    data.created_at = firebase.firestore.FieldValue.serverTimestamp();
    _fbDb.collection('daily_reports').add(data)
      .then(function(ref) {
        _drCurrentDocId = ref.id;
        _drCurrentReport = data;
        _drShowStatus(status);
        if (status === 'submitted') _drToggleFormEditable(false);
        _showDrToast(_drt('dr_saved'));
      })
      .catch(function(err) {
        console.error('save error:', err);
        alert('Error: ' + err.message);
      });
  }
}

// ── Report list ──
function _drLoadReportList() {
  var user = getCurrentUser();
  if (!user) return;
  var listEl = document.getElementById('drReportList');
  listEl.innerHTML = '<div class="dr-no-data" style="padding:16px;color:#9ca3af;">로딩 중...</div>';

  var query;
  if (_isAdmin(user)) {
    query = _fbDb.collection('daily_reports').orderBy('date', 'desc').limit(50);
  } else {
    query = _fbDb.collection('daily_reports').where('empid', '==', user.empid).orderBy('date', 'desc').limit(30);
  }

  query.get()
    .then(function(snap) {
      if (snap.empty) {
        listEl.innerHTML = '<div class="dr-no-data">' + _drt('dr_no_reports') + '</div>';
        return;
      }
      var html = '';
      snap.forEach(function(doc) {
        var d = doc.data();
        var statusCls = 'badge-' + (d.status || 'draft');
        var statusLabel = d.status === 'submitted' ? _drt('dr_submitted') : d.status === 'reviewed' ? _drt('dr_reviewed') : _drt('dr_draft');
        var visitCount = (d.visits && d.visits.length) || 0;

        html += '<div class="dr-report-item" onclick="_drOpenReport(\'' + doc.id + '\',\'' + (d.date || '') + '\',\'' + (d.empid || '') + '\')">';
        html += '<div>';
        html += '<div class="ri-date">' + _drEsc(d.date || '') + '</div>';
        html += '<div class="ri-name">' + _drEsc(d.emp_name || d.empid || '') + (d.dept ? ' · ' + _drEsc(d.dept) : '') + '</div>';
        html += '</div>';
        html += '<div class="ri-right">';
        html += '<span class="ri-visits">' + _drt('dr_visits') + ': ' + visitCount + '</span>';
        html += '<span class="dr-status-badge ' + statusCls + '">' + statusLabel + '</span>';
        html += '</div></div>';
      });
      listEl.innerHTML = html;
    })
    .catch(function(err) {
      console.error('list load error:', err);
      listEl.innerHTML = '<div class="dr-no-data">Error loading reports</div>';
    });
}

function _drOpenReport(docId, date, empid) {
  var user = getCurrentUser();
  if (!user) return;

  // If admin viewing someone else's report, open review modal
  if (_isAdmin(user) && empid !== user.empid) {
    _drOpenReviewModal(docId);
    return;
  }

  // Otherwise navigate to that date
  document.getElementById('drDatePicker').value = date;
  _drCurrentDate = date;
  _drLoadReport();
  _drLoadVisits();
  _drSwitchTab('form');
}

// ── Admin review ──
function _drOpenReviewModal(docId) {
  _drReviewDocId = docId;
  _fbDb.collection('daily_reports').doc(docId).get()
    .then(function(doc) {
      if (!doc.exists) return;
      var d = doc.data();
      var html = '';
      html += '<p><strong>' + _drt('dr_date') + ':</strong> ' + _drEsc(d.date) + '</p>';
      html += '<p><strong>이름:</strong> ' + _drEsc(d.emp_name || d.empid) + '</p>';
      if (d.visits && d.visits.length > 0) {
        html += '<p><strong>' + _drt('dr_visits') + ':</strong></p>';
        d.visits.forEach(function(v) {
          html += '<div class="dr-visit-card">';
          html += '<div class="vc-name">' + _drEsc(v.customer_name || '-') + '</div>';
          html += '<div class="vc-meta">' + _drEsc(v.visit_type || '') + ' · ' + _drEsc(v.result || '') + '</div>';
          html += '</div>';
        });
      }
      html += '<p><strong>' + _drt('dr_orders') + ':</strong> ' + (d.orders_count || 0) + '</p>';
      html += '<p><strong>' + _drt('dr_quotes') + ':</strong> ' + (d.quotes_count || 0) + '</p>';
      if (d.key_achievements) html += '<p><strong>' + _drt('dr_achievements') + ':</strong><br>' + _drEsc(d.key_achievements).replace(/\n/g, '<br>') + '</p>';
      if (d.issues) html += '<p><strong>' + _drt('dr_issues') + ':</strong><br>' + _drEsc(d.issues).replace(/\n/g, '<br>') + '</p>';
      if (d.tomorrow_plan) html += '<p><strong>' + _drt('dr_tomorrow') + ':</strong><br>' + _drEsc(d.tomorrow_plan).replace(/\n/g, '<br>') + '</p>';
      if (d.review_comment) html += '<p><strong>' + _drt('dr_comment') + ':</strong><br>' + _drEsc(d.review_comment).replace(/\n/g, '<br>') + '</p>';

      document.getElementById('drReviewContent').innerHTML = html;
      document.getElementById('drReviewComment').value = d.review_comment || '';

      // Hide review button if already reviewed
      document.getElementById('btnMarkReviewed').style.display = d.status === 'reviewed' ? 'none' : '';

      document.getElementById('drReviewOverlay').classList.add('show');
    });
}

function _drCloseReview() {
  document.getElementById('drReviewOverlay').classList.remove('show');
  _drReviewDocId = null;
}

function _drMarkReviewed() {
  if (!_drReviewDocId) return;
  var user = getCurrentUser();
  if (!user) return;

  _fbDb.collection('daily_reports').doc(_drReviewDocId).update({
    status: 'reviewed',
    reviewed_by: user.empid,
    reviewed_at: firebase.firestore.FieldValue.serverTimestamp(),
    review_comment: document.getElementById('drReviewComment').value.trim()
  })
  .then(function() {
    _showDrToast(_drt('dr_reviewed'));
    _drCloseReview();
    _drLoadReportList();
  })
  .catch(function(err) {
    console.error('review error:', err);
    alert('Error: ' + err.message);
  });
}

// ── Window controls (overlay mode) ──
function _drMinimize() {
  // Minimize not used in overlay mode
}

function _drRestore() {
  // Restore not used in overlay mode
}

var _drIsFs = false;
function _drToggleFs() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(function(){});
    _drIsFs = true;
  } else {
    document.exitFullscreen();
    _drIsFs = false;
  }
}

// ── Toast ──
function _showDrToast(msg) {
  var t = document.getElementById('drToast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2500);
}
