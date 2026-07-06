#!/usr/bin/env node
/**
 * Clear all farm ledger lines (expenses + revenue), lodge bookings/payments,
 * and payroll runs that mirror into the ledger. Also clears finance_items on Supabase.
 *
 * Usage:
 *   node scripts/clear-expenses.cjs
 *   ESTATE_DATA_DIR=/var/lib/estate node scripts/clear-expenses.cjs
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const db = require('../src/main/db');

const dataDir =
  process.env.ESTATE_DATA_DIR ||
  path.join(__dirname, '..', 'data');

const dbPath = path.join(dataDir, 'estate.db');

async function clearSupabaseFinance() {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    console.log('Supabase: skipped (no URL or service key in .env)');
    return { skipped: true, finance_items: 0 };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.from('finance_items').delete().gte('id', 0).select('id');
  if (error) throw new Error(`Supabase finance_items: ${error.message}`);
  const n = Array.isArray(data) ? data.length : 0;
  console.log(`Supabase finance_items deleted: ${n}`);
  return { skipped: false, finance_items: n };
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error('Database not found:', dbPath);
    console.error('Set ESTATE_DATA_DIR if your estate.db lives elsewhere.');
    process.exit(1);
  }

  console.log('Database:', dbPath);
  db.initDB(dataDir);

  const before = db.query("SELECT COUNT(*) AS c FROM finance_items")[0]?.c ?? 0;
  console.log(`finance_items before: ${before}`);

  const local = db.clearFinanceLedger();
  console.log('Local cleared:', local);

  const remote = await clearSupabaseFinance();
  console.log('\nDone. Hard-refresh the web app — expense lines and lodge test bookings should be gone.');
  console.log('Tip: do not use Settings → Sync Now until you are ready to push real data.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
