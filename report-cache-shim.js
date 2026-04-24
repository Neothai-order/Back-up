/* ═══════════════════════════════════════════════════════════════════════════
   report-cache-shim.js — IDB cache + incremental sync for report-combined.html

   Strategy:
     AR (ar_master):         version-check via ar_meta/latest (reuses ar_cache_db,
                             same as ar.html). 1 read if version matches.
     Consignment:            incremental via updated_at + consignment_deletions
                             tombstones, stored in report_cache IDB.
     ProductPrices:          incremental via updated_at, stored in report_cache IDB.

   Public:
     window.reportCache.loadAR(db, isAdmin, user)   -> Promise<{rawInvoices, docsRead}>
     window.reportCache.loadConsign(db)             -> Promise<{records, docsRead}>
     window.reportCache.loadPrices(db)              -> Promise<{priceByNo, docsRead}>
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  // ── AR cache (shares ar_cache_db with ar.html) ─────────────────────────
  function _arOpenIDB(){
    return new Promise(function(res,rej){
      var r = indexedDB.open('ar_cache_db', 1);
      r.onupgradeneeded = function(e){
        var d = e.target.result;
        if (!d.objectStoreNames.contains('data')) d.createObjectStore('data',{keyPath:'key'});
      };
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error); };
    });
  }
  async function _arGet(key){
    try {
      var db = await _arOpenIDB();
      var tx = db.transaction(['data'],'readonly');
      var rq = tx.objectStore('data').get(key);
      var v = await new Promise(function(res){ rq.onsuccess = function(){ res(rq.result||null); }; rq.onerror = function(){ res(null); }; });
      db.close(); return v;
    } catch(_){ return null; }
  }
  async function _arSet(key, payload){
    try {
      var db = await _arOpenIDB();
      var tx = db.transaction(['data'],'readwrite');
      tx.objectStore('data').put(Object.assign({key:key}, payload));
      await new Promise(function(res,rej){ tx.oncomplete=res; tx.onerror=rej; });
      db.close();
    } catch(_){}
  }

  // ── Generic report_cache IDB (consign + prices) ───────────────────────
  function _rcOpenIDB(){
    return new Promise(function(res,rej){
      var r = indexedDB.open('report_cache', 1);
      r.onupgradeneeded = function(e){
        var d = e.target.result;
        if (!d.objectStoreNames.contains('data')) d.createObjectStore('data',{keyPath:'key'});
      };
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error); };
    });
  }
  async function _rcGet(key){
    try {
      var db = await _rcOpenIDB();
      var tx = db.transaction(['data'],'readonly');
      var rq = tx.objectStore('data').get(key);
      var v = await new Promise(function(res){ rq.onsuccess = function(){ res(rq.result||null); }; rq.onerror = function(){ res(null); }; });
      db.close(); return v;
    } catch(_){ return null; }
  }
  async function _rcSet(key, payload){
    try {
      var db = await _rcOpenIDB();
      var tx = db.transaction(['data'],'readwrite');
      tx.objectStore('data').put(Object.assign({key:key}, payload));
      await new Promise(function(res,rej){ tx.oncomplete=res; tx.onerror=rej; });
      db.close();
    } catch(_){}
  }

  function _tsMs(t){ return (t && typeof t.toMillis==='function') ? t.toMillis() : 0; }

  // ── AR loader (version-check) ────────────────────────────────────────
  async function loadAR(db, isAdmin, user){
    var cacheKey = isAdmin ? 'admin' : ('user_' + ((user && (user.nickname||user.name)) || '').toString().toUpperCase().trim());
    var cached = await _arGet(cacheKey);
    var serverVersion = null;
    try {
      var metaDoc = await db.collection('ar_meta').doc('latest').get();
      if (metaDoc.exists) serverVersion = metaDoc.data().version || null;
    } catch(_){}
    if (cached && serverVersion && cached.version === serverVersion && cached.data) {
      return { rawInvoices: cached.data, docsRead: 1, source:'cache' };
    }
    // Incremental for admin if cache has docs map + maxTs
    if (isAdmin && cached && cached.docs && cached.maxTsMs > 0) {
      try {
        var tsObj = firebase.firestore.Timestamp.fromMillis(cached.maxTsMs);
        var r = await Promise.all([
          db.collection('ar_master').where('updated_at','>',tsObj).get(),
          db.collection('ar_deletions').where('deleted_at','>',tsObj).get()
        ]);
        var docMap = Object.assign({}, cached.docs||{});
        var newMaxTs = cached.maxTsMs;
        var uploadTime = cached.uploadTime || null;
        r[0].forEach(function(doc){
          var d = doc.data();
          var tsMs = _tsMs(d.updated_at); if (tsMs>newMaxTs) newMaxTs = tsMs;
          if (d.uploadedAt){ var um = _tsMs(d.uploadedAt); if (!uploadTime||um>uploadTime) uploadTime = um; }
          docMap[doc.id] = { invoices: d.invoices||[], updated_at_ms: tsMs };
        });
        r[1].forEach(function(doc){
          var d = doc.data();
          var tsMs = _tsMs(d.deleted_at); if (tsMs>newMaxTs) newMaxTs = tsMs;
          delete docMap[doc.id];
        });
        var arr = [];
        Object.keys(docMap).forEach(function(k){ arr = arr.concat(docMap[k].invoices||[]); });
        await _arSet(cacheKey, { version: serverVersion||cached.version, data:arr, docs:docMap, maxTsMs:newMaxTs, uploadTime:uploadTime });
        return { rawInvoices: arr, docsRead: 1 + r[0].size + r[1].size, source:'incremental' };
      } catch(_){}
    }
    // Cold-start FULL
    var arr = [];
    var docMap = {};
    var maxTs = 0;
    var uploadTime = null;
    if (isAdmin) {
      var snap = await db.collection('ar_master').get();
      snap.forEach(function(doc){
        var d = doc.data();
        var inv = d.invoices||[];
        arr = arr.concat(inv);
        var tsMs = _tsMs(d.updated_at); if (tsMs>maxTs) maxTs = tsMs;
        if (d.uploadedAt && !uploadTime){ try { uploadTime = d.uploadedAt.toDate().getTime(); } catch(_){} }
        docMap[doc.id] = { invoices: inv, updated_at_ms: tsMs };
      });
      if (serverVersion) await _arSet(cacheKey, { version: serverVersion, data:arr, docs:docMap, maxTsMs:maxTs, uploadTime:uploadTime });
      return { rawInvoices: arr, docsRead: (snap.size||0) + 1, source:'full' };
    }
    // Non-admin single doc
    var nick = ((user && (user.nickname||user.name)) || '').toString().toUpperCase().trim();
    if (!nick) return { rawInvoices: [], docsRead: 1, source:'empty' };
    var doc = await db.collection('ar_master').doc(nick).get();
    if (doc.exists) {
      var dd = doc.data();
      arr = dd.invoices||[];
      try { uploadTime = dd.uploadedAt.toDate().getTime(); } catch(_){}
    }
    if (serverVersion) await _arSet(cacheKey, { version: serverVersion, data:arr, docs:null, maxTsMs:0, uploadTime:uploadTime });
    return { rawInvoices: arr, docsRead: 2, source:'full' };
  }

  // ── Consignment loader (incremental via updated_at) ──────────────────
  async function loadConsign(db){
    var cached = await _rcGet('consign');
    if (cached && cached.docs && cached.maxTsMs > 0) {
      try {
        var tsObj = firebase.firestore.Timestamp.fromMillis(cached.maxTsMs);
        var r = await Promise.all([
          db.collection('consignment_master').where('updated_at','>',tsObj).get(),
          db.collection('consignment_deletions').where('deleted_at','>',tsObj).get().catch(function(){ return {forEach:function(){}, size:0}; })
        ]);
        var docMap = Object.assign({}, cached.docs);
        var newMaxTs = cached.maxTsMs;
        r[0].forEach(function(doc){
          var d = doc.data();
          var tsMs = _tsMs(d.updated_at); if (tsMs>newMaxTs) newMaxTs = tsMs;
          docMap[doc.id] = d;
        });
        r[1].forEach(function(doc){
          var d = doc.data();
          var tsMs = _tsMs(d.deleted_at); if (tsMs>newMaxTs) newMaxTs = tsMs;
          delete docMap[doc.id];
        });
        var records = Object.keys(docMap).map(function(k){ return docMap[k]; });
        var changed = (r[0].size||0) + (r[1].size||0);
        if (changed > 0) await _rcSet('consign', { docs: docMap, maxTsMs: newMaxTs });
        return { records: records, docsRead: changed, source: changed? 'incremental':'cache' };
      } catch(_){}
    }
    // Cold-start FULL
    var snap = await db.collection('consignment_master').get();
    var docMap = {};
    var maxTs = 0;
    snap.forEach(function(doc){
      var d = doc.data();
      docMap[doc.id] = d;
      var tsMs = _tsMs(d.updated_at); if (tsMs>maxTs) maxTs = tsMs;
    });
    if (maxTs === 0) maxTs = Date.now();
    await _rcSet('consign', { docs: docMap, maxTsMs: maxTs });
    var records = Object.keys(docMap).map(function(k){ return docMap[k]; });
    return { records: records, docsRead: snap.size||0, source:'full' };
  }

  // ── ProductPrices loader (incremental via updated_at) ────────────────
  async function loadPrices(db){
    var cached = await _rcGet('prices');
    if (cached && cached.docs && cached.maxTsMs > 0) {
      try {
        var tsObj = firebase.firestore.Timestamp.fromMillis(cached.maxTsMs);
        var snap = await db.collection('productPrices').where('updated_at','>',tsObj).get();
        var docMap = Object.assign({}, cached.docs);
        var newMaxTs = cached.maxTsMs;
        snap.forEach(function(doc){
          var d = doc.data();
          var tsMs = _tsMs(d.updated_at); if (tsMs>newMaxTs) newMaxTs = tsMs;
          docMap[doc.id] = { retail: Number(d.retail)||0 };
        });
        if (snap.size > 0) await _rcSet('prices', { docs: docMap, maxTsMs: newMaxTs });
        var priceByNo = {};
        Object.keys(docMap).forEach(function(k){ priceByNo[k] = docMap[k].retail||0; });
        return { priceByNo: priceByNo, docsRead: snap.size||0, source: snap.size? 'incremental':'cache' };
      } catch(_){}
    }
    // Cold-start FULL
    var snap = await db.collection('productPrices').get();
    var docMap = {};
    var maxTs = 0;
    snap.forEach(function(doc){
      var d = doc.data();
      docMap[doc.id] = { retail: Number(d.retail)||0 };
      var tsMs = _tsMs(d.updated_at); if (tsMs>maxTs) maxTs = tsMs;
    });
    if (maxTs === 0) maxTs = Date.now();
    await _rcSet('prices', { docs: docMap, maxTsMs: maxTs });
    var priceByNo = {};
    Object.keys(docMap).forEach(function(k){ priceByNo[k] = docMap[k].retail||0; });
    return { priceByNo: priceByNo, docsRead: snap.size||0, source:'full' };
  }

  window.reportCache = { loadAR: loadAR, loadConsign: loadConsign, loadPrices: loadPrices };
})();
