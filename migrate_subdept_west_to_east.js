#!/usr/bin/env node
// One-shot migration: sub_dept "서부" → "동부"
// Project: neothai-order
//
// Usage:
//   node migrate_subdept_west_to_east.js              # dry-run (default)
//   node migrate_subdept_west_to_east.js --apply      # execute the writes
//   node migrate_subdept_west_to_east.js --apply --collections=accounts,presence
//
// Auth: uses Application Default Credentials.
//   Either run `gcloud auth application-default login` once,
//   or set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON.

const admin = require('firebase-admin');

const OLD_VALUE = '서부';
const NEW_VALUE = '동부';
const DEFAULT_COLLECTIONS = ['accounts', 'presence'];
const FIELD = 'sub_dept';
const BATCH_SIZE = 400;

function parseArgs(argv) {
  const args = { apply: false, collections: DEFAULT_COLLECTIONS };
  for (const a of argv.slice(2)) {
    if (a === '--apply') args.apply = true;
    else if (a.startsWith('--collections=')) {
      args.collections = a.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return args;
}

async function migrateCollection(db, collName, apply) {
  const snap = await db.collection(collName).where(FIELD, '==', OLD_VALUE).get();
  const count = snap.size;
  console.log(`[${collName}] matched ${count} document(s) with ${FIELD}="${OLD_VALUE}"`);

  if (count === 0 || !apply) {
    if (count > 0 && !apply) {
      console.log(`[${collName}] dry-run: sample ids →`,
        snap.docs.slice(0, 5).map(d => d.id));
    }
    return count;
  }

  let written = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const chunk = snap.docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(d => batch.update(d.ref, { [FIELD]: NEW_VALUE }));
    await batch.commit();
    written += chunk.length;
    console.log(`[${collName}] updated ${written}/${count}`);
  }
  return written;
}

(async () => {
  const { apply, collections } = parseArgs(process.argv);

  admin.initializeApp({ projectId: 'neothai-order' });
  const db = admin.firestore();

  console.log(`Mode: ${apply ? 'APPLY (writes enabled)' : 'DRY-RUN (no writes)'}`);
  console.log(`Collections: ${collections.join(', ')}`);
  console.log(`Rule: ${FIELD} == "${OLD_VALUE}" → "${NEW_VALUE}"`);
  console.log('');

  let total = 0;
  for (const coll of collections) {
    try {
      total += await migrateCollection(db, coll, apply);
    } catch (e) {
      console.error(`[${coll}] ERROR:`, e.message);
    }
  }

  console.log('');
  console.log(apply
    ? `Done. Updated ${total} document(s).`
    : `Dry-run complete. ${total} document(s) would be updated. Re-run with --apply to execute.`);
  process.exit(0);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
