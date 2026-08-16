const path = require('path');
require('dotenv').config();
const db = require('../src/main/db');
const { createClient } = require('@supabase/supabase-js');

db.initDB(path.join(__dirname, '../data'));

function getMonthEndDate(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${ym}-${String(lastDay).padStart(2, '0')}`;
}

async function run() {
  console.log('Clearing old mirrored payroll entries in finance_items...');
  db.execute("DELETE FROM finance_items WHERE source_module IN ('payroll_mirror', 'payroll_line_mirror')");

  const rows = db.query(`
    SELECT pl.id, pl.full_name, pl.gross_salary, pl.position, pr.year_month
    FROM payroll_lines pl
    INNER JOIN payroll_runs pr ON pl.payroll_run_id = pr.id
    ORDER BY pr.year_month ASC, pl.id ASC
  `);

  console.log(`Found ${rows.length} payroll lines across all imported runs.`);

  let insertedCount = 0;
  let totalGross = 0;
  const financeInserts = [];

  for (const r of rows) {
    const gross = Number(r.gross_salary) || 0;
    if (gross <= 0) continue;

    const pos = String(r.position || '').toLowerCase();
    const isCasual = pos.includes('casual') || pos.includes('seasonal') || pos.includes('harvester');
    const category = isCasual ? 'Casual / Seasonal Labour' : 'Permanent Staff Payroll';
    const dateStr = getMonthEndDate(r.year_month);
    const desc = `Payroll: ${r.full_name.trim()} (${r.position || 'Staff'}) — ${r.year_month}`;

    db.execute(
      `INSERT INTO finance_items (category, description, amount, date, type, payment_method, source_module, cost_center)
       VALUES (?, ?, ?, ?, 'Expense', 'bank_transfer', 'payroll_mirror', 'farm')`,
      [category, desc, gross, dateStr]
    );

    insertedCount++;
    totalGross += gross;

    financeInserts.push({
      category,
      description: desc,
      amount: gross,
      date: dateStr,
      type: 'Expense',
      source_module: 'payroll_mirror',
      cost_center: 'farm'
    });
  }

  console.log('\n========================================');
  console.log('PAYROLL EXPENSE REFLECTION SUMMARY:');
  console.log(`Mirrored Salary Lines: ${insertedCount}`);
  console.log(`Total Gross Salary Expenses: UGX ${totalGross.toLocaleString()}`);
  console.log('========================================\n');

  // Supabase Sync
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    console.log('Syncing salary expenses to Supabase cloud...');
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from('finance_items').delete().eq('source_module', 'payroll_mirror');

    const payload = financeInserts.map(f => ({
      category: f.category,
      description: f.description,
      amount: f.amount,
      date: f.date,
      type: 'Expense'
    }));

    for (let i = 0; i < payload.length; i += 50) {
      const chunk = payload.slice(i, i + 50);
      await supabase.from('finance_items').insert(chunk);
    }
    console.log(`Successfully synced ${payload.length} payroll expense rows to Supabase Cloud!`);
  }
}

run().catch(err => console.error("Payroll sync error:", err));
