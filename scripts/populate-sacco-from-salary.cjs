const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const db = require('../src/main/db');
const { createClient } = require('@supabase/supabase-js');

db.initDB(path.join(__dirname, '../data'));

let file = path.join(__dirname, '../salary payments.xlsx');
if (!fs.existsSync(file)) file = path.join(__dirname, '../docs/salary payments-4 (1).xlsx');
console.log('Reading salary workbook for SACCO import:', file);

const wb = XLSX.readFile(file);

function cleanStr(val) {
  return String(val || '').trim();
}

function parseNum(val) {
  const n = parseFloat(String(val || '').replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

const MONTH_MAP = {
  'january': '2026-01',
  'february': '2026-02',
  'march': '2026-03',
  'april': '2026-04',
  'may': '2026-05',
  'june': '2026-06',
  'july': '2026-07'
};

function getMonthEndDate(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${ym}-${String(lastDay).padStart(2, '0')}`;
}

async function run() {
  console.log('Clearing previous SACCO tables...');
  db.execute('DELETE FROM sacco_repayments');
  db.execute('DELETE FROM sacco_loans');
  db.execute('DELETE FROM sacco_savings');
  db.execute('DELETE FROM sacco_members');
  db.execute('DELETE FROM sacco_finance_items');

  const membersMap = new Map(); // name -> member_id
  const loansMap = new Map();   // name -> loan_id

  let totalMembers = 0;
  let totalSavingsDeposits = 0;
  let totalSavingsAmount = 0;
  let totalLoansCount = 0;
  let totalLoanPrincipal = 0;
  let totalRepaymentsCount = 0;
  let totalRepaymentsAmount = 0;
  let totalInterestRevenue = 0;

  for (const sName of wb.SheetNames) {
    const sLower = sName.toLowerCase();
    let ym = '';
    for (const key of Object.keys(MONTH_MAP)) {
      if (sLower.includes(key)) {
        ym = MONTH_MAP[key];
        break;
      }
    }
    if (!ym) continue;

    const ws = wb.Sheets[sName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (!rows || rows.length <= 1) continue;

    const dateStr = getMonthEndDate(ym);
    console.log(`Processing SACCO month: ${sName} (${ym}) with ${rows.length} rows`);

    // Map column indices dynamically
    const header = rows[0].map(h => String(h || '').toLowerCase().trim());
    const idxName = header.findIndex(h => h.includes('name'));
    const idxContact = header.findIndex(h => h.includes('contact'));
    const idxPosition = header.findIndex(h => h.includes('position'));
    const idxSaving = header.findIndex(h => h.includes('saving'));
    const idxLoan = header.findIndex(h => h.includes('loan amount') || h === 'loan');
    const idxInterest = header.findIndex(h => h.includes('interest'));
    const idxRepay = header.findIndex(h => h.includes('repayment'));
    const idxBalance = header.findIndex(h => h.includes('loan balance') || h.includes('balance on loan'));

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const rawName = idxName >= 0 ? cleanStr(r[idxName]) : cleanStr(r[0]);
      if (!rawName || rawName.toLowerCase().startsWith('total') || rawName.toLowerCase().startsWith('name')) continue;

      const phone = idxContact >= 0 ? cleanStr(r[idxContact]) : '';
      const position = idxPosition >= 0 ? cleanStr(r[idxPosition]) : '';
      const savingsAmt = idxSaving >= 0 ? parseNum(r[idxSaving]) : 0;
      const loanAmt = idxLoan >= 0 ? parseNum(r[idxLoan]) : 0;
      const interestAmt = idxInterest >= 0 ? parseNum(r[idxInterest]) : 0;
      const repayAmt = idxRepay >= 0 ? parseNum(r[idxRepay]) : 0;
      const balAmt = idxBalance >= 0 ? parseNum(r[idxBalance]) : 0;

      // 1. Get or Create Member
      let memberId = membersMap.get(rawName.toLowerCase());
      if (!memberId) {
        totalMembers++;
        const memNo = `SACCO-${String(totalMembers).padStart(3, '0')}`;
        const res = db.execute(
          `INSERT INTO sacco_members (member_no, full_name, phone, status, join_date)
           VALUES (?, ?, ?, 'Active', '2026-01-01')`,
          [memNo, rawName, phone]
        );
        memberId = res.lastInsertRowid;
        membersMap.set(rawName.toLowerCase(), memberId);
      }

      // 2. Insert Savings Deposit (if > 0)
      if (savingsAmt > 0) {
        db.execute(
          `INSERT INTO sacco_savings (member_id, amount, deposit_date, method, notes)
           VALUES (?, ?, ?, 'payroll_deduction', ?)`,
          [memberId, savingsAmt, dateStr, `Payroll Savings - ${ym}`]
        );
        totalSavingsDeposits++;
        totalSavingsAmount += savingsAmt;
      }

      // 3. Handle Loan (Issue loan if member has loan > 0 and no open loan registered yet)
      let loanId = loansMap.get(rawName.toLowerCase());
      if (!loanId && (loanAmt > 0 || balAmt > 0)) {
        const principal = loanAmt > 0 ? loanAmt : (balAmt + repayAmt);
        if (principal > 0) {
          totalLoansCount++;
          const lRes = db.execute(
            `INSERT INTO sacco_loans (member_id, amount, interest_rate, term_months, issue_date, status)
             VALUES (?, ?, 10, 12, ?, 'Active')`,
            [memberId, principal, dateStr]
          );
          loanId = lRes.lastInsertRowid;
          loansMap.set(rawName.toLowerCase(), loanId);
          totalLoanPrincipal += principal;
        }
      } else if (loanId && loanAmt > (totalLoanPrincipal)) {
        // If loan amount increased in subsequent month (top-up loan)
        totalLoansCount++;
        const lRes = db.execute(
          `INSERT INTO sacco_loans (member_id, amount, interest_rate, term_months, issue_date, status)
           VALUES (?, ?, 10, 12, ?, 'Active')`,
          [memberId, loanAmt, dateStr]
        );
        loanId = lRes.lastInsertRowid;
        loansMap.set(rawName.toLowerCase(), loanId);
        totalLoanPrincipal += loanAmt;
      }

      // 4. Insert Loan Repayment (if > 0)
      if (repayAmt > 0 && loanId) {
        db.execute(
          `INSERT INTO sacco_repayments (loan_id, amount, repayment_date, method, notes)
           VALUES (?, ?, ?, 'payroll_deduction', ?)`,
          [loanId, repayAmt, dateStr, `Payroll Repayment - ${ym}`]
        );
        totalRepaymentsCount++;
        totalRepaymentsAmount += repayAmt;
      }

      // 5. Insert Interest Revenue into sacco_finance_items
      if (interestAmt > 0) {
        db.execute(
          `INSERT INTO sacco_finance_items (category, description, amount, date, type)
           VALUES ('Loan Interest', ?, ?, ?, 'Revenue')`,
          [`Interest payment: ${rawName} (${ym})`, interestAmt, dateStr]
        );
        totalInterestRevenue += interestAmt;
      }
    }
  }

  console.log('\n========================================');
  console.log('SACCO IMPORT & AGGREGATION SUMMARY:');
  console.log(`Registered Members       : ${totalMembers}`);
  console.log(`Savings Deposits Count   : ${totalSavingsDeposits} (Total UGX ${totalSavingsAmount.toLocaleString()})`);
  console.log(`Loans Issued Count       : ${totalLoansCount} (Total Principal UGX ${totalLoanPrincipal.toLocaleString()})`);
  console.log(`Repayments Recorded      : ${totalRepaymentsCount} (Total UGX ${totalRepaymentsAmount.toLocaleString()})`);
  console.log(`SACCO Interest Revenue   : UGX ${totalInterestRevenue.toLocaleString()}`);
  console.log('========================================\n');

  // Sync to Supabase Cloud if configured
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    console.log('Syncing SACCO tables to Supabase Cloud...');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Sync Members
    const members = db.query('SELECT * FROM sacco_members');
    if (members.length) {
      await supabase.from('sacco_members').upsert(members);
    }
    console.log(`Synced ${members.length} SACCO members to Supabase Cloud!`);
  }
}

run().catch(err => console.error("SACCO import error:", err));
