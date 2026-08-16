const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const Database = require('better-sqlite3');

const dataDir = process.env.ESTATE_DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'estate.db');
const sqlite = new Database(dbPath);

function clearLocalJuneJulyExpenses() {
  const countBefore = sqlite.prepare("SELECT count(*) as c FROM finance_items WHERE (date LIKE '2026-06%' OR date LIKE '2026-07%') AND type = 'Expense'").get().c;
  console.log(`Found ${countBefore} local expense records for June & July 2026.`);

  const result = sqlite.prepare("DELETE FROM finance_items WHERE (date LIKE '2026-06%' OR date LIKE '2026-07%') AND type = 'Expense'").run();
  console.log(`Deleted ${result.changes} local expense records for June & July 2026.`);

  const countAfter = sqlite.prepare("SELECT count(*) as c FROM finance_items").get().c;
  console.log(`Remaining total local finance_items count: ${countAfter}`);
}

async function clearSupabaseJuneJulyExpenses() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.log("Supabase: skipped (no credentials)");
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from('finance_items')
    .delete()
    .eq('type', 'Expense')
    .gte('date', '2026-06-01')
    .lte('date', '2026-07-31')
    .select('id');

  if (error) {
    console.error("Supabase delete error:", error.message);
  } else {
    console.log(`Deleted ${data ? data.length : 0} records from Supabase cloud for June & July 2026.`);
  }
}

clearLocalJuneJulyExpenses();
clearSupabaseJuneJulyExpenses().catch(console.error);
