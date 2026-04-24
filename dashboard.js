/* =========================================================
 *  dashboard.js  –  Sales Dashboard (overlay mode for index.html)
 *  Extracted from dashboard.html, adapted to run inside index.html
 *  - Firebase ref uses global _fbDb (initialised in core.js)
 *  - getCurrentUser / _isAdmin come from core.js
 *  - Translation function renamed _dbt() to avoid conflict
 * ========================================================= */

/* ── i18n ── */
var DB_LANG = {
  db_title:          ['영업 실적 대시보드','Sales Dashboard','แดชบอร์ดยอดขาย'],
  db_this_month:     ['이번 달','This Month','เดือนนี้'],
  db_last_month:     ['지난 달','Last Month','เดือนที่แล้ว'],
  db_this_quarter:   ['이번 분기','This Quarter','ไตรมาสนี้'],
  db_custom:         ['기간 설정','Custom Range','กำหนดเอง'],
  db_total_orders:   ['총 주문','Total Orders','คำสั่งซื้อทั้งหมด'],
  db_revenue:        ['매출액','Revenue','รายได้'],
  db_visits:         ['방문 수','Visits','จำนวนเยี่ยม'],
  db_avg_order:      ['평균 주문액','Avg Order','เฉลี่ยต่อออเดอร์'],
  db_daily_orders:   ['일별 주문 추이','Daily Orders','คำสั่งซื้อรายวัน'],
  db_status_dist:    ['주문 상태 분포','Order Status','สถานะคำสั่งซื้อ'],
  db_top_customers:  ['고객별 주문','Top Customers','ลูกค้าอันดับสูง'],
  db_ranking:        ['영업 실적 순위','Sales Ranking','อันดับยอดขาย'],
  db_rank:           ['순위','Rank','อันดับ'],
  db_name:           ['이름','Name','ชื่อ'],
  db_recent:         ['최근 주문','Recent Orders','คำสั่งซื้อล่าสุด'],
  db_pending:        ['대기','Pending','รอดำเนินการ'],
  db_shipping:       ['발송','Shipping','จัดส่ง'],
  db_done:           ['완료','Done','เสร็จ'],
  db_cancelled:      ['취소','Cancelled','ยกเลิก'],
  db_vs_prev:        ['전기 대비','vs Previous','เทียบกับก่อนหน้า'],
  db_no_data:        ['데이터가 없습니다','No data available','ไม่มีข้อมูล'],
  db_all_employees:  ['전체 직원','All Employees','พนักงานทั้งหมด'],
  db_items:          ['건','orders','รายการ'],
  db_currency:       ['฿','฿','฿']
};

var _dbLangIdx = {ko:0, en:1, th:2};
var _dbCurLang = localStorage.getItem('lang') || 'ko';

function _dbt(key) {
  var arr = DB_LANG[key];
  if (!arr) return key;
  var idx = _dbLangIdx[_dbCurLang] !== undefined ? _dbLangIdx[_dbCurLang] : 0;
  return arr[idx] || arr[0];
}

/* ── Window controls (overlay mode) ── */
var _dbIsMinimized = false;

function openSalesDashboard() {
  var overlay = document.getElementById('salesDashboardOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    initSalesDashboard();
  }
}

function dbMinimize() {
  // Minimize not used in overlay mode
}

function dbRestore() {
  // Restore not used in overlay mode
}

function dbFullscreen() {
  var el = document.documentElement;
  if (!document.fullscreenElement) { el.requestFullscreen && el.requestFullscreen(); }
  else { document.exitFullscreen && document.exitFullscreen(); }
}

function dbClose() {
  var overlay = document.getElementById('salesDashboardOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/* ── Date helpers ── */
function getDateRange(period) {
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth();
  if (period === 'this_month') {
    return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59) };
  } else if (period === 'last_month') {
    return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59) };
  } else if (period === 'this_quarter') {
    var qm = Math.floor(m / 3) * 3;
    return { from: new Date(y, qm, 1), to: new Date(y, qm + 3, 0, 23, 59, 59) };
  }
  return null;
}

function getPrevRange(period) {
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth();
  if (period === 'this_month') {
    return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59) };
  } else if (period === 'last_month') {
    return { from: new Date(y, m - 2, 1), to: new Date(y, m - 1, 0, 23, 59, 59) };
  } else if (period === 'this_quarter') {
    var qm = Math.floor(m / 3) * 3;
    return { from: new Date(y, qm - 3, 1), to: new Date(y, qm, 0, 23, 59, 59) };
  }
  return null;
}

function fmtDate(d) {
  var mm = ('0' + (d.getMonth() + 1)).slice(-2);
  var dd = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + mm + '-' + dd;
}

function fmtNum(n) {
  if (n === undefined || n === null) return '0';
  return Number(n).toLocaleString('en-US');
}

/* ── Revenue calc ── */
function calcRevenue(order) {
  var total = 0;
  if (order.items && Array.isArray(order.items)) {
    order.items.forEach(function(it) {
      var p = parseFloat(it.price);
      var q = parseFloat(it.qty);
      if (!isNaN(p) && !isNaN(q)) total += p * q;
    });
  }
  return total;
}

/* ── Globals ── */
var _dbCurrentUser = null;
var _dbIsAdmin = false;
var chartDaily = null, chartStatus = null, chartCustomers = null;

/* ── Period change ── */
function onPeriodChange() {
  var v = document.getElementById('dbPeriodSelect').value;
  var cr = document.getElementById('dbCustomRange');
  if (v === 'custom') {
    cr.classList.add('show');
  } else {
    cr.classList.remove('show');
    loadDashboard();
  }
}

/* ── Apply i18n ── */
function _dbApplyLang() {
  _dbCurLang = localStorage.getItem('lang') || 'ko';
  document.getElementById('dbHeaderTitle').textContent = _dbt('db_title');
  document.getElementById('optThisMonth').textContent = _dbt('db_this_month');
  document.getElementById('optLastMonth').textContent = _dbt('db_last_month');
  document.getElementById('optThisQuarter').textContent = _dbt('db_this_quarter');
  document.getElementById('optCustom').textContent = _dbt('db_custom');
  document.getElementById('optAllEmp').textContent = _dbt('db_all_employees');
  document.getElementById('kpiLabelOrders').textContent = _dbt('db_total_orders');
  document.getElementById('kpiLabelRev').textContent = _dbt('db_revenue');
  document.getElementById('kpiLabelVisits').textContent = _dbt('db_visits');
  document.getElementById('kpiLabelAvg').textContent = _dbt('db_avg_order');
  document.getElementById('chartDailyTitle').textContent = _dbt('db_daily_orders');
  document.getElementById('chartStatusTitle').textContent = _dbt('db_status_dist');
  document.getElementById('chartCustTitle').textContent = _dbt('db_top_customers');
  document.getElementById('rankingTitle').textContent = _dbt('db_ranking');
  document.getElementById('thRank').textContent = _dbt('db_rank');
  document.getElementById('thName').textContent = _dbt('db_name');
  document.getElementById('thROrders').textContent = _dbt('db_total_orders');
  document.getElementById('thRRev').textContent = _dbt('db_revenue');
  document.getElementById('thRVisits').textContent = _dbt('db_visits');
  document.getElementById('thRAvg').textContent = _dbt('db_avg_order');
  document.getElementById('recentTitle').textContent = _dbt('db_recent');
  document.getElementById('recentNoData').textContent = _dbt('db_no_data');
}

/* ── Comparison helper ── */
function renderCmp(elId, cur, prev) {
  var el = document.getElementById(elId);
  if (prev === 0 && cur === 0) {
    el.innerHTML = '<span class="neutral">- ' + _dbt('db_vs_prev') + '</span>';
    return;
  }
  var pct;
  if (prev === 0) pct = 100;
  else pct = ((cur - prev) / prev * 100);
  var arrow, cls;
  if (pct > 0) { arrow = '▲'; cls = 'up'; }
  else if (pct < 0) { arrow = '▼'; cls = 'down'; }
  else { arrow = '→'; cls = 'neutral'; }
  el.innerHTML = '<span class="' + cls + '">' + arrow + ' ' + Math.abs(pct).toFixed(1) + '% ' + _dbt('db_vs_prev') + '</span>';
}

/* ── Status label ── */
function statusLabel(s) {
  var map = {pending:'db_pending', shipping:'db_shipping', done:'db_done', cancelled:'db_cancelled'};
  return _dbt(map[s] || 'db_pending');
}
function statusClass(s) {
  return 'status-' + (s || 'pending');
}

/* ── Load dashboard ── */
function loadDashboard() {
  var period = document.getElementById('dbPeriodSelect').value;
  var range, prevRange;
  if (period === 'custom') {
    var f = document.getElementById('dbDateFrom').value;
    var t = document.getElementById('dbDateTo').value;
    if (!f || !t) return;
    range = { from: new Date(f + 'T00:00:00'), to: new Date(t + 'T23:59:59') };
    var diff = range.to - range.from;
    prevRange = { from: new Date(range.from.getTime() - diff - 86400000), to: new Date(range.from.getTime() - 1) };
  } else {
    range = getDateRange(period);
    prevRange = getPrevRange(period);
  }

  var empVal = document.getElementById('dbEmpFilter').value;

  document.getElementById('dbLoading').style.display = 'flex';
  document.getElementById('dbDashboard').style.display = 'none';

  var fromStr = fmtDate(range.from);
  var toStr = fmtDate(range.to);
  var prevFromStr = prevRange ? fmtDate(prevRange.from) : '';
  var prevToStr = prevRange ? fmtDate(prevRange.to) : '';

  var ordersPromise = _fbDb.collection('orders')
    .where('date', '>=', fromStr)
    .where('date', '<=', toStr)
    .get();

  var prevOrdersPromise = prevRange ? _fbDb.collection('orders')
    .where('date', '>=', prevFromStr)
    .where('date', '<=', prevToStr)
    .get() : Promise.resolve(null);

  var visitsPromise = _fbDb.collection('visit_logs')
    .where('date', '>=', fromStr)
    .where('date', '<=', toStr)
    .get();

  var prevVisitsPromise = prevRange ? _fbDb.collection('visit_logs')
    .where('date', '>=', prevFromStr)
    .where('date', '<=', prevToStr)
    .get() : Promise.resolve(null);

  Promise.all([ordersPromise, prevOrdersPromise, visitsPromise, prevVisitsPromise])
    .then(function(results) {
      var ordersSnap = results[0];
      var prevOrdersSnap = results[1];
      var visitsSnap = results[2];
      var prevVisitsSnap = results[3];

      var allOrders = [];
      ordersSnap.forEach(function(doc) { allOrders.push(Object.assign({id: doc.id}, doc.data())); });

      var allPrevOrders = [];
      if (prevOrdersSnap) prevOrdersSnap.forEach(function(doc) { allPrevOrders.push(Object.assign({id: doc.id}, doc.data())); });

      var allVisits = [];
      visitsSnap.forEach(function(doc) { allVisits.push(Object.assign({id: doc.id}, doc.data())); });

      var allPrevVisits = [];
      if (prevVisitsSnap) prevVisitsSnap.forEach(function(doc) { allPrevVisits.push(Object.assign({id: doc.id}, doc.data())); });

      /* Employee filter */
      var orders = allOrders;
      var prevOrders = allPrevOrders;
      var visits = allVisits;
      var prevVisits = allPrevVisits;

      if (empVal !== 'all') {
        orders = orders.filter(function(o) { return o.user === empVal; });
        prevOrders = prevOrders.filter(function(o) { return o.user === empVal; });
        visits = visits.filter(function(v) { return v.empid === empVal; });
        prevVisits = prevVisits.filter(function(v) { return v.empid === empVal; });
      } else if (!_dbIsAdmin) {
        var uid = _dbCurrentUser ? _dbCurrentUser.empid : '';
        orders = orders.filter(function(o) { return o.user === uid; });
        prevOrders = prevOrders.filter(function(o) { return o.user === uid; });
        visits = visits.filter(function(v) { return v.empid === uid; });
        prevVisits = prevVisits.filter(function(v) { return v.empid === uid; });
      }

      /* Populate employee filter (admin only) */
      if (_dbIsAdmin) {
        var empSet = {};
        allOrders.forEach(function(o) {
          if (o.user) empSet[o.user] = o.user;
        });
        allVisits.forEach(function(v) {
          if (v.empid) empSet[v.empid] = v.emp_name || v.empid;
        });
        var sel = document.getElementById('dbEmpFilter');
        var curVal = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        Object.keys(empSet).sort().forEach(function(k) {
          var opt = document.createElement('option');
          opt.value = k;
          opt.textContent = empSet[k];
          sel.appendChild(opt);
        });
        sel.value = curVal;
        sel.style.display = '';
      } else {
        document.getElementById('dbEmpFilter').style.display = 'none';
      }

      renderKPI(orders, prevOrders, visits, prevVisits);
      renderCharts(orders, range);
      renderRanking(allOrders, allVisits);
      renderRecent(orders);

      document.getElementById('dbLoading').style.display = 'none';
      document.getElementById('dbDashboard').style.display = '';
    })
    .catch(function(err) {
      console.error('Dashboard load error:', err);
      document.getElementById('dbLoading').style.display = 'none';
      document.getElementById('dbDashboard').style.display = '';
    });
}

/* ── KPI ── */
function renderKPI(orders, prevOrders, visits, prevVisits) {
  var totalOrders = orders.length;
  var prevTotalOrders = prevOrders.length;
  var revenue = 0;
  orders.forEach(function(o) { revenue += calcRevenue(o); });
  var prevRevenue = 0;
  prevOrders.forEach(function(o) { prevRevenue += calcRevenue(o); });
  var totalVisits = visits.length;
  var prevTotalVisits = prevVisits.length;
  var avgOrder = totalOrders > 0 ? revenue / totalOrders : 0;
  var prevAvg = prevTotalOrders > 0 ? prevRevenue / prevTotalOrders : 0;

  document.getElementById('kpiOrders').textContent = fmtNum(totalOrders);
  document.getElementById('kpiRevenue').textContent = _dbt('db_currency') + fmtNum(Math.round(revenue));
  document.getElementById('kpiVisits').textContent = fmtNum(totalVisits);
  document.getElementById('kpiAvg').textContent = _dbt('db_currency') + fmtNum(Math.round(avgOrder));

  /* Status breakdown */
  var sc = {pending:0, shipping:0, done:0, cancelled:0};
  orders.forEach(function(o) { var s = o.status || 'pending'; if (sc[s] !== undefined) sc[s]++; });
  document.getElementById('kpiOrdersBreak').textContent =
    statusLabel('pending') + ':' + sc.pending + ' / ' +
    statusLabel('shipping') + ':' + sc.shipping + ' / ' +
    statusLabel('done') + ':' + sc.done + ' / ' +
    statusLabel('cancelled') + ':' + sc.cancelled;

  renderCmp('kpiOrdersCmp', totalOrders, prevTotalOrders);
  renderCmp('kpiRevCmp', revenue, prevRevenue);
  renderCmp('kpiVisitsCmp', totalVisits, prevTotalVisits);
  renderCmp('kpiAvgCmp', avgOrder, prevAvg);
}

/* ── Charts ── */
function renderCharts(orders, range) {
  /* Daily orders */
  var dailyMap = {};
  var d = new Date(range.from);
  while (d <= range.to) {
    dailyMap[fmtDate(d)] = 0;
    d.setDate(d.getDate() + 1);
  }
  orders.forEach(function(o) {
    var dt = (o.date || '').substring(0, 10);
    if (dailyMap[dt] !== undefined) dailyMap[dt]++;
  });
  var dailyLabels = Object.keys(dailyMap).sort();
  var dailyData = dailyLabels.map(function(k) { return dailyMap[k]; });
  var shortLabels = dailyLabels.map(function(k) { return k.substring(5); });

  if (chartDaily) chartDaily.destroy();
  chartDaily = new Chart(document.getElementById('chartDaily'), {
    type: 'bar',
    data: {
      labels: shortLabels,
      datasets: [{
        label: _dbt('db_total_orders'),
        data: dailyData,
        backgroundColor: 'rgba(124,58,237,0.6)',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1 } }
      }
    }
  });

  /* Status doughnut */
  var sc = {pending:0, shipping:0, done:0, cancelled:0};
  orders.forEach(function(o) { var s = o.status || 'pending'; if (sc[s] !== undefined) sc[s]++; });
  if (chartStatus) chartStatus.destroy();
  chartStatus = new Chart(document.getElementById('chartStatus'), {
    type: 'doughnut',
    data: {
      labels: [statusLabel('pending'), statusLabel('shipping'), statusLabel('done'), statusLabel('cancelled')],
      datasets: [{
        data: [sc.pending, sc.shipping, sc.done, sc.cancelled],
        backgroundColor: ['#f59e0b','#3b82f6','#10b981','#ef4444'],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 14, font: { size: 12 } } }
      }
    }
  });

  /* Top 10 customers */
  var custMap = {};
  orders.forEach(function(o) {
    var name = o.customer_name || o.customer_erp || 'Unknown';
    custMap[name] = (custMap[name] || 0) + 1;
  });
  var custArr = Object.keys(custMap).map(function(k) { return {name: k, cnt: custMap[k]}; });
  custArr.sort(function(a, b) { return b.cnt - a.cnt; });
  custArr = custArr.slice(0, 10);

  if (chartCustomers) chartCustomers.destroy();
  chartCustomers = new Chart(document.getElementById('chartCustomers'), {
    type: 'bar',
    data: {
      labels: custArr.map(function(c) { return c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name; }),
      datasets: [{
        label: _dbt('db_items'),
        data: custArr.map(function(c) { return c.cnt; }),
        backgroundColor: 'rgba(16,185,129,0.6)',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 } },
        y: { grid: { display: false } }
      }
    }
  });
}

/* ── Ranking ── */
function renderRanking(allOrders, allVisits) {
  if (!_dbIsAdmin) {
    document.getElementById('dbRankingSection').style.display = 'none';
    return;
  }
  document.getElementById('dbRankingSection').style.display = '';

  var empMap = {};
  allOrders.forEach(function(o) {
    var uid = o.user || 'unknown';
    if (!empMap[uid]) empMap[uid] = {name: uid, orders: 0, revenue: 0, visits: 0};
    empMap[uid].orders++;
    empMap[uid].revenue += calcRevenue(o);
  });
  allVisits.forEach(function(v) {
    var uid = v.empid || 'unknown';
    if (!empMap[uid]) empMap[uid] = {name: v.emp_name || uid, orders: 0, revenue: 0, visits: 0};
    empMap[uid].visits++;
    if (v.emp_name) empMap[uid].name = v.emp_name;
  });

  var arr = Object.keys(empMap).map(function(k) {
    var e = empMap[k];
    e.empid = k;
    e.avg = e.orders > 0 ? e.revenue / e.orders : 0;
    return e;
  });
  arr.sort(function(a, b) { return b.orders - a.orders; });

  var tbody = document.getElementById('rankingBody');
  tbody.innerHTML = '';
  var myId = _dbCurrentUser ? _dbCurrentUser.empid : '';
  arr.forEach(function(e, i) {
    var tr = document.createElement('tr');
    if (e.empid === myId) tr.className = 'my-row';
    tr.innerHTML =
      '<td class="rank-num">' + (i + 1) + '</td>' +
      '<td>' + e.name + '</td>' +
      '<td>' + fmtNum(e.orders) + '</td>' +
      '<td>' + _dbt('db_currency') + fmtNum(Math.round(e.revenue)) + '</td>' +
      '<td>' + fmtNum(e.visits) + '</td>' +
      '<td>' + _dbt('db_currency') + fmtNum(Math.round(e.avg)) + '</td>';
    tbody.appendChild(tr);
  });
}

/* ── Recent orders ── */
function renderRecent(orders) {
  var sorted = orders.slice().sort(function(a, b) {
    return (b.date || '').localeCompare(a.date || '');
  }).slice(0, 10);

  var tbody = document.getElementById('recentBody');
  tbody.innerHTML = '';

  if (sorted.length === 0) {
    document.getElementById('recentNoData').style.display = '';
    document.getElementById('recentNoData').textContent = _dbt('db_no_data');
    return;
  }
  document.getElementById('recentNoData').style.display = 'none';

  sorted.forEach(function(o) {
    var itemCount = (o.items && Array.isArray(o.items)) ? o.items.length : 0;
    var amount = calcRevenue(o);
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + (o.date || '-') + '</td>' +
      '<td>' + (o.customer_name || o.customer_erp || '-') + '</td>' +
      '<td>' + itemCount + ' ' + _dbt('db_items') + '</td>' +
      '<td>' + _dbt('db_currency') + fmtNum(Math.round(amount)) + '</td>' +
      '<td><span class="status-badge ' + statusClass(o.status) + '">' + statusLabel(o.status || 'pending') + '</span></td>';
    tbody.appendChild(tr);
  });
}

/* ── Init (replaces DOMContentLoaded) ── */
function initSalesDashboard() {
  _dbCurrentUser = getCurrentUser();
  _dbIsAdmin = _isAdmin(_dbCurrentUser);

  _dbApplyLang();

  /* Set default date inputs */
  var now = new Date();
  var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById('dbDateFrom').value = fmtDate(firstDay);
  document.getElementById('dbDateTo').value = fmtDate(now);

  loadDashboard();
}
