/* ═════════════════════════════════════════════════════════════════════════
   customer-cache-shim.js — shared per-user IDB customer cache reader
   used by standalone pages (schedule.html, visit.html) that don't load core.js.

   Mirrors core.js _custIdbName / _custLoadCache / _custSyncFromServer (incremental)
   so the same cache is read (not duplicated) across main app + standalone pages.

   Public:
     window.loadCustomersCached({ db, onCache?, onSync? }) -> Promise<Array>
       - returns cached data asap; triggers background incremental sync.
       - if no cache → scoped cold-start fetch (sales: where('sales','in',variants)
         + where('sales','==',''); admin: full fetch), saves cache, returns rows.
   ═════════════════════════════════════════════════════════════════════════ */
(function(){
  var _CUST_IDB_VERSION = 2;
  var _SENTINEL_KEY = 'neo_custCache_lastSaved';

  function _getUser(){
    try {
      var u = JSON.parse(sessionStorage.getItem('current_user')||'null');
      if (u) return u;
      if (localStorage.getItem('auto_login') === 'true') {
        return JSON.parse(localStorage.getItem('current_user_persist')||'null');
      }
    } catch(_){}
    return null;
  }
  function _isAdmin(u){
    if (!u) return false;
    var HA = ['T2408087'];
    return HA.includes(u.empid) || u.role === 'admin';
  }
  function _isOffice(u){
    if (!u) return false;
    var dept = (u.dept||'').toString().trim().toLowerCase();
    return dept === 'office';
  }
  function _scope(){
    var u = _getUser();
    if (!u) return { mode:'all' };
    if (_isAdmin(u)) return { mode:'all' };
    if (_isOffice(u)) return { mode:'all' };
    var role = (u.role||'').toString().trim().toLowerCase();
    if (role === 'admin' || role === 'approver') return { mode:'all' };
    if (u.nickname && String(u.nickname).trim()) {
      return { mode:'sales', nickname: String(u.nickname).trim() };
    }
    return { mode:'all' };
  }
  function _dbName(){
    var sc = _scope();
    if (sc.mode === 'sales' && sc.nickname) {
      var safe = String(sc.nickname).replace(/[^A-Za-z0-9_-]/g,'_');
      return 'customer_cache_sales_' + safe;
    }
    return 'customer_cache';
  }
  function _openIDB(){
    return new Promise(function(resolve, reject){
      var req = indexedDB.open(_dbName(), _CUST_IDB_VERSION);
      req.onupgradeneeded = function(e){
        var d = e.target.result;
        if (!d.objectStoreNames.contains('master')) d.createObjectStore('master',{keyPath:'_id',autoIncrement:true});
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta',{keyPath:'key'});
      };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }
  async function _loadCache(){
    try {
      var d = await _openIDB();
      var tx = d.transaction(['master','meta'],'readonly');
      var metaReq = tx.objectStore('meta').get('lastSync');
      var meta = await new Promise(function(res){ metaReq.onsuccess = function(){ res(metaReq.result); }; });
      if (!meta || !meta.ts) { d.close(); return null; }
      var all = [];
      var cur = tx.objectStore('master').openCursor();
      await new Promise(function(res){
        cur.onsuccess = function(e){
          var c = e.target.result;
          if (c){ var v = c.value; if (v && '_id' in v) delete v._id; all.push(v); c.continue(); } else res();
        };
      });
      d.close();
      return { data: all, ts: meta.ts, serverTs: meta.serverTs||0, count: meta.count };
    } catch(e){ return null; }
  }
  async function _saveCache(rows, serverTs){
    try {
      var d = await _openIDB();
      var tx = d.transaction(['master','meta'],'readwrite');
      var st = tx.objectStore('master');
      st.clear();
      rows.forEach(function(r,i){ st.put(Object.assign({},r,{_id:i})); });
      var meta = { key:'lastSync', ts:Date.now(), count:rows.length };
      if (typeof serverTs === 'number' && serverTs > 0) meta.serverTs = serverTs;
      tx.objectStore('meta').put(meta);
      await new Promise(function(res,rej){ tx.oncomplete = res; tx.onerror = function(){ rej(tx.error); }; });
      d.close();
      try { localStorage.setItem(_SENTINEL_KEY, JSON.stringify({ts:Date.now(),count:rows.length,serverTs:serverTs||0,dbName:_dbName()})); } catch(_){}
    } catch(_){}
  }
  function _norm(doc){
    var r = doc.data();
    if (r.updated_at && typeof r.updated_at.toMillis === 'function') r.updated_at_ms = r.updated_at.toMillis();
    delete r.updated_at;
    return r;
  }
  function _titleCase(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s; }
  function _variants(nick){
    var m = {}; m[nick]=1; m[nick.toLowerCase()]=1; m[nick.toUpperCase()]=1; m[_titleCase(nick)]=1;
    return Object.keys(m).slice(0,10);
  }

  async function _scopedFetch(db, scope){
    if (scope.mode === 'sales') {
      var vars = _variants(scope.nickname);
      var mineQ = db.collection('customers').where('sales','in',vars);
      var unQ   = db.collection('customers').where('sales','==','');
      var res = await Promise.all([mineQ.get(), unQ.get()]);
      var map = {};
      res[0].forEach(function(d){ var r=_norm(d); var k=r.erp||r.nt_code||d.id; map[k]=r; });
      res[1].forEach(function(d){ var r=_norm(d); var k=r.erp||r.nt_code||d.id; if(!map[k]) map[k]=r; });
      return Object.values(map);
    }
    var snap = await db.collection('customers').get();
    var rows = [];
    snap.forEach(function(d){ rows.push(_norm(d)); });
    return rows;
  }

  async function _incrementalSync(db, scope, lastSyncMs, cached){
    try {
      var tsObj = firebase.firestore.Timestamp.fromMillis(lastSyncMs);
      var changed = [];
      var deletedKeys = [];
      var maxTs = lastSyncMs;

      if (scope.mode === 'sales') {
        var vars = _variants(scope.nickname);
        var mineIncQ = db.collection('customers').where('sales','in',vars).where('updated_at','>',tsObj);
        var unIncQ   = db.collection('customers').where('sales','==','').where('updated_at','>',tsObj);
        var delIncQ  = db.collection('customer_deletions').where('deleted_at','>',tsObj);
        var r = await Promise.all([mineIncQ.get(), unIncQ.get(), delIncQ.get()]);
        r[0].forEach(function(d){ var x=_norm(d); changed.push(x); if(x.updated_at_ms>maxTs) maxTs=x.updated_at_ms; });
        r[1].forEach(function(d){ var x=_norm(d); changed.push(x); if(x.updated_at_ms>maxTs) maxTs=x.updated_at_ms; });
        r[2].forEach(function(d){
          var dd = d.data(); deletedKeys.push(d.id || dd.erp);
          if (dd.deleted_at && typeof dd.deleted_at.toMillis==='function'){
            var ms = dd.deleted_at.toMillis(); if (ms>maxTs) maxTs = ms;
          }
        });
      } else {
        var incQ = db.collection('customers').where('updated_at','>',tsObj);
        var delQ = db.collection('customer_deletions').where('deleted_at','>',tsObj);
        var ra = await Promise.all([incQ.get(), delQ.get()]);
        ra[0].forEach(function(d){ var x=_norm(d); changed.push(x); if(x.updated_at_ms>maxTs) maxTs=x.updated_at_ms; });
        ra[1].forEach(function(d){
          var dd = d.data(); deletedKeys.push(d.id || dd.erp);
          if (dd.deleted_at && typeof dd.deleted_at.toMillis==='function'){
            var ms = dd.deleted_at.toMillis(); if (ms>maxTs) maxTs = ms;
          }
        });
      }

      var totalChanged = changed.length + deletedKeys.length;
      if (totalChanged === 0) return { rows: cached, changed: 0 };

      var map = {};
      cached.forEach(function(r){ var k = r.erp||r.nt_code; if (k) map[k] = r; });
      changed.forEach(function(r){ var k = r.erp||r.nt_code; if (k) map[k] = r; });
      deletedKeys.forEach(function(k){ if (k) delete map[k]; });
      var merged = Object.values(map);
      await _saveCache(merged, maxTs);
      return { rows: merged, changed: totalChanged };
    } catch(e){ return { rows: cached, changed: 0, error: e }; }
  }

  window.loadCustomersCached = async function(opts){
    opts = opts || {};
    var db = opts.db || firebase.firestore();
    var scope = _scope();
    var cached = await _loadCache();

    if (cached && cached.data && cached.data.length > 0) {
      if (opts.onCache) { try { opts.onCache(cached.data); } catch(_){} }
      setTimeout(function(){
        _incrementalSync(db, scope, cached.serverTs || 0, cached.data).then(function(r){
          if (r.changed > 0 && opts.onSync) { try { opts.onSync(r.rows); } catch(_){} }
        });
      }, 0);
      return cached.data;
    }

    var rows = await _scopedFetch(db, scope);
    var maxTs = rows.reduce(function(m,r){ return Math.max(m, r.updated_at_ms||0); }, 0);
    if (maxTs === 0) maxTs = Date.now();
    await _saveCache(rows, maxTs);
    return rows;
  };
})();
