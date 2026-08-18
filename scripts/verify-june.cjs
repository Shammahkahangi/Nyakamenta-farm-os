const XLSX = require('xlsx');
const path = require('path');
const db = require('../src/main/db');

db.initDB(path.join(__dirname, '../data'));
const wb = XLSX.readFile(path.join(__dirname, '../requisition 1.xlsx'));

console.log('--- EXCEL JUNE 2026 SHEETS ---');
let excelJuneTotal = 0;
let excelJuneItemsCount = 0;

['12-06-2026', '17-06-2026', '21-06-2026', '25-06-2026', '27-06-3026', '28-06-3026', '30-06-2026'].forEach(sName => {
  const ws = wb.Sheets[sName];
  if (!ws) return;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log('Sheet:', sName);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0] || String(r[0]).toLowerCase().startsWith('total')) continue;
    const desc = String(r[0]).trim();
    const qty = r[1] !== undefined ? String(r[1]).trim() : '';
    const unitCost = parseFloat(r[2]) || 0;
    let amt = parseFloat(r[3]);
    if (isNaN(amt) || amt <= 0) amt = unitCost;
    if (desc && amt > 0) {
      excelJuneTotal += amt;
      excelJuneItemsCount++;
      console.log('  ', desc, qty ? '(' + qty + ')' : '', '-> UGX', amt.toLocaleString());
    }
  }
});

console.log('\n--- DB JUNE 2026 EXPENSES ---');
const dbJuneRows = db.query("SELECT * FROM finance_items WHERE date >= '2026-06-01' AND date <= '2026-06-30' AND type = 'Expense'");
let dbJuneTotal = 0;
dbJuneRows.forEach(r => {
  dbJuneTotal += Number(r.amount);
  console.log('  ', r.date, '|', r.description, '| UGX', Number(r.amount).toLocaleString());
});

console.log('\n========================================');
console.log('VERIFICATION RESULTS FOR JUNE 2026:');
console.log('Excel June Total    : UGX', excelJuneTotal.toLocaleString(), '(', excelJuneItemsCount, 'items )');
console.log('Database June Total : UGX', dbJuneTotal.toLocaleString(), '(', dbJuneRows.length, 'items )');
console.log('Status              :', excelJuneTotal === dbJuneTotal ? '100% PERFECT MATCH' : 'MISMATCH');
console.log('========================================');
