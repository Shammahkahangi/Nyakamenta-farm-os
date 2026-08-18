const XLSX = require('xlsx');
const path = require('path');
const db = require('../src/main/db');

db.initDB(path.join(__dirname, '../data'));
const wb = XLSX.readFile(path.join(__dirname, '../requisition 1.xlsx'));

console.log('--- EXCEL JULY 2026 SHEETS ---');
let excelJulyTotal = 0;
let excelJulyItemsCount = 0;

const julySheets = [
  '03-07-2026', '06-07-2026', '09-07-2026', '10-07-2026',
  '11-07-2026', '12-07-2026', '13-07-2026', 'Sheet15',
  'Sheet16', '17-07-2026', '19-07-2026', '21-07-2026',
  '23-07-2026', '26-07-2026', '27-07-2026', '31-07-2026'
];

julySheets.forEach(sName => {
  const ws = wb.Sheets[sName];
  if (!ws) return;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log('\nSheet:', sName);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0] || String(r[0]).toLowerCase().startsWith('total')) continue;
    const desc = String(r[0]).trim();
    const qty = r[1] !== undefined ? String(r[1]).trim() : '';
    const unitCost = parseFloat(r[2]) || 0;
    let amt = parseFloat(r[3]);
    if (isNaN(amt) || amt <= 0) amt = unitCost;
    if (desc && amt > 0) {
      excelJulyTotal += amt;
      excelJulyItemsCount++;
      console.log('  ', desc, qty ? '(' + qty + ')' : '', '-> UGX', amt.toLocaleString());
    }
  }
});

console.log('\n--- DB JULY 2026 EXPENSES ---');
const dbJulyRows = db.query("SELECT * FROM finance_items WHERE date >= '2026-07-01' AND date <= '2026-07-31' AND type = 'Expense'");
let dbJulyTotal = 0;
dbJulyRows.forEach(r => {
  dbJulyTotal += Number(r.amount);
  console.log('  ', r.date, '|', r.description, '| UGX', Number(r.amount).toLocaleString());
});

console.log('\n========================================');
console.log('VERIFICATION RESULTS FOR JULY 2026:');
console.log('Excel July Total    : UGX', excelJulyTotal.toLocaleString(), '(', excelJulyItemsCount, 'items )');
console.log('Database July Total : UGX', dbJulyTotal.toLocaleString(), '(', dbJulyRows.length, 'items )');
console.log('Status              :', excelJulyTotal === dbJulyTotal ? '100% PERFECT MATCH' : 'MISMATCH');
console.log('========================================');
