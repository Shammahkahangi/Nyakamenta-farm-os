const path = require('path');
require('dotenv').config();
const db = require('../src/main/db');
const { createClient } = require('@supabase/supabase-js');

db.initDB(path.join(__dirname, '../data'));

async function run() {
  console.log('Removing duplicate payroll_mirror entries from finance_items...');
  const res = db.execute("DELETE FROM finance_items WHERE source_module = 'payroll_mirror'");
  console.log(`Deleted ${res.changes || 0} duplicate payroll_mirror rows from local database.`);

  // Audit July total again
  const julyTotal = db.query(`
    SELECT SUM(amount) as s, COUNT(*) as c
    FROM finance_items
    WHERE date LIKE '2026-07%' AND type = 'Expense'
  `)[0];

  const juneTotal = db.query(`
    SELECT SUM(amount) as s, COUNT(*) as c
    FROM finance_items
    WHERE date LIKE '2026-06%' AND type = 'Expense'
  `)[0];

  console.log('\n========================================');
  console.log('CORRECTED EXPENSE AUDIT SUMMARY:');
  console.log(`June 2026 Total Expenses : UGX ${Number(juneTotal.s || 0).toLocaleString()} (${juneTotal.c} items)`);
  console.log(`July 2026 Total Expenses : UGX ${Number(julyTotal.s || 0).toLocaleString()} (${julyTotal.c} items)`);
  console.log('========================================\n');

  // Supabase Cloud cleanup
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    console.log('Syncing cleanup to Supabase Cloud...');
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('finance_items').delete().eq('source_module', 'payroll_mirror');
    console.log('Successfully cleaned up Supabase Cloud!');
  }
}

run().catch(err => console.error('Cleanup error:', err));
