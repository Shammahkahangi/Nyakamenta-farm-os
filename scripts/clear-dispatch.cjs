#!/usr/bin/env node
/**
 * Clear domestic dispatch rows from server SQLite (no Python required).
 *
 * Usage:
 *   node scripts/clear-dispatch.cjs
 *   ESTATE_DATA_DIR=/var/lib/estate node scripts/clear-dispatch.cjs
 */
const path = require('path');
const fs = require('fs');

const db = require('../src/main/db');

const dataDir =
  process.env.ESTATE_DATA_DIR ||
  path.join(__dirname, '..', 'data');

const dbPath = path.join(dataDir, 'estate.db');

if (!fs.existsSync(dbPath)) {
  console.error('Database not found:', dbPath);
  console.error('Set ESTATE_DATA_DIR if your estate.db lives elsewhere.');
  process.exit(1);
}

console.log('Database:', dbPath);
db.initDB(dataDir);

const before = db.query('SELECT COUNT(*) AS c FROM contracts')[0]?.c ?? 0;
console.log(`contracts before: ${before}`);

const result = db.clearDispatchRegister();
console.log(`deleted contracts: ${result.contracts}`);
console.log(`deleted dispatch finance: ${result.finance}`);
console.log('\nDone. Restart the web app to refresh the dispatch register.');
