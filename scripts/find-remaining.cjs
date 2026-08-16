const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');

const dataDir = process.env.ESTATE_DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'estate.db');
const sqlite = new Database(dbPath);

console.log("--- Local SQLite finance_items ---");
const localJune = sqlite.prepare("SELECT * FROM finance_items WHERE date LIKE '2026-06%' OR date LIKE '2026-07%'").all();
console.log(`Local June/July count: ${localJune.length}`);
console.log(localJune);

async function checkSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.from('finance_items').select('*').gte('date', '2026-06-01').lte('date', '2026-07-31');
  console.log("--- Supabase Cloud June/July count ---");
  console.log(data ? data.length : error);
  if (data && data.length > 0) console.log(data);
}

checkSupabase().catch(console.error);
