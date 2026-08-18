const path = require('path');
const db = require('../src/main/db');
db.initDB(path.join(__dirname, '../data'));

const grouped = db.query(`
  SELECT source_module, COUNT(*) as c, SUM(amount) as s
  FROM finance_items
  WHERE date LIKE '2026-07%'
  GROUP BY source_module
`);

console.log('--- JULY 2026 SOURCE MODULE BREAKDOWN ---');
console.log(grouped);

const payrollLines = db.query(`
  SELECT id, date, description, amount, source_module
  FROM finance_items
  WHERE date LIKE '2026-07%' AND (source_module LIKE '%payroll%' OR description LIKE '%payroll%' OR description LIKE '%salary%')
  ORDER BY description ASC
`);

console.log(`\nFound ${payrollLines.length} payroll-related expense entries in July 2026:`);
let payrollSum = 0;
payrollLines.forEach(p => {
  payrollSum += Number(p.amount) || 0;
  console.log(`- [${p.date}] [${p.source_module}] ${p.description}: UGX ${Number(p.amount).toLocaleString()}`);
});
console.log(`Total July Payroll Expense Recorded: UGX ${payrollSum.toLocaleString()}`);
