const path = require('path');
require('dotenv').config();
const db = require('../src/main/db');
const { createClient } = require('@supabase/supabase-js');

db.initDB(path.join(__dirname, '../data'));

async function run() {
  console.log('Auditing SACCO loans status and repayment balances...');

  const loans = db.query(`
    SELECT l.id, l.member_id, m.full_name, l.amount as principal, l.status,
           COALESCE(SUM(r.amount), 0) as total_paid
    FROM sacco_loans l
    JOIN sacco_members m ON l.member_id = m.id
    LEFT JOIN sacco_repayments r ON r.loan_id = l.id
    GROUP BY l.id
  `);

  let updatedCount = 0;
  for (const l of loans) {
    const bal = Math.max(Number(l.principal || 0) - Number(l.total_paid || 0), 0);
    if (bal <= 0 && l.status.toLowerCase() !== 'paid') {
      console.log(`- Loan #${l.id} (${l.full_name}): Principal UGX ${Number(l.principal).toLocaleString()} - Paid UGX ${Number(l.total_paid).toLocaleString()} -> Balance UGX 0 -> Setting status to 'Paid'`);
      db.execute("UPDATE sacco_loans SET status = 'Paid' WHERE id = ?", [l.id]);
      updatedCount++;
    }
  }

  console.log(`\nUpdated ${updatedCount} fully paid loans from 'Active' to 'Paid'.`);

  // Sync to Supabase Cloud
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    console.log('Syncing loan status updates to Supabase Cloud...');
    const supabase = createClient(supabaseUrl, supabaseKey);
    const updatedLoans = db.query("SELECT * FROM sacco_loans");
    if (updatedLoans.length) {
      await supabase.from('sacco_loans').upsert(updatedLoans);
    }
    console.log('Successfully updated Supabase Cloud!');
  }
}

run().catch(err => console.error("Error updating loan statuses:", err));
