#!/usr/bin/env node
/**
 * Clear Supabase tables used by estate web sync (no Python required).
 *
 * Usage:
 *   node scripts/supabase-clear.cjs
 *   node scripts/supabase-clear.cjs --fresh-start
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

const FRESH_START_CLEAR = ['batches', 'contracts', 'insights', 'finance_items'];
const PRESERVE = ['blocks', 'workforce'];

async function countRows(admin, table) {
  const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true });
  if (error) return `ERR ${error.message}`;
  return String(count ?? 0);
}

async function deleteAllTextIds(admin, table) {
  const { data, error } = await admin.from(table).delete().neq('id', '').select('id');
  if (error) throw new Error(`${table}: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

async function deleteAllIntIds(admin, table) {
  const { data, error } = await admin.from(table).delete().gte('id', 0).select('id');
  if (error) throw new Error(`${table}: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

async function clearDispatch(admin) {
  console.log('\n--- Clear dispatch on Supabase ---');
  console.log('contracts before:', await countRows(admin, 'contracts'));

  let n = await deleteAllTextIds(admin, 'contracts');
  console.log('deleted contracts:', n);

  const { data: fin, error: finErr } = await admin
    .from('finance_items')
    .delete()
    .ilike('description', '%Domestic dispatch%')
    .select('id');
  if (finErr) throw new Error(`finance_items: ${finErr.message}`);
  console.log('deleted finance_items (Domestic dispatch):', fin?.length ?? 0);

  const { data: fin2, error: fin2Err } = await admin
    .from('finance_items')
    .delete()
    .eq('category', 'Green coffee sale (domestic)')
    .select('id');
  if (fin2Err) throw new Error(`finance_items category: ${fin2Err.message}`);
  console.log('deleted finance_items (Green coffee sale):', fin2?.length ?? 0);

  console.log('contracts after:', await countRows(admin, 'contracts'));
}

async function clearFreshStart(admin) {
  console.log('\n--- Fresh start on Supabase (keep blocks + workforce) ---');
  for (const table of FRESH_START_CLEAR) {
    const before = await countRows(admin, table);
    console.log(`${table} before: ${before}`);
    const n =
      table === 'contracts' || table === 'batches'
        ? await deleteAllTextIds(admin, table)
        : await deleteAllIntIds(admin, table);
    console.log(`  deleted: ${n}`);
    console.log(`  after: ${await countRows(admin, table)}`);
  }
  for (const table of PRESERVE) {
    console.log(`kept ${table}: ${await countRows(admin, table)} rows`);
  }
}

async function main() {
  const freshStart = process.argv.includes('--fresh-start');

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Supabase:', supabaseUrl);
  await clearDispatch(admin);
  if (freshStart) await clearFreshStart(admin);
  console.log('\nDone. Reload the web app (hard refresh).');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
