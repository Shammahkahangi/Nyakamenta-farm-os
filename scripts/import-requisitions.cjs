const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/estate.db');
const db = new Database(dbPath);

const excelPath = 'd:\\Loan-softwares\\Coffee management system\\requisition 1.xlsx';
const workbook = XLSX.readFile(excelPath);

const insertStmt = db.prepare(`
  INSERT INTO finance_items (
    category, description, amount, date, type, payment_method, source_module, cost_center
  ) VALUES (
    @category, @description, @amount, @date, @type, @payment_method, @source_module, @cost_center
  )
`);

let totalInserted = 0;

for (let sheetName of workbook.SheetNames) {
  // Parse date from sheetName, e.g., "12-06-2026" or "28-06-3026"
  // Some might be invalid like "Sheet15"
  let dateStr = null;
  const match = sheetName.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (match) {
    let year = match[3];
    if (year === '3026') year = '2026'; // Fix typo in excel sheet names
    dateStr = `${year}-${match[2]}-${match[1]}`;
  } else {
    console.log(`Skipping sheet '${sheetName}' because it does not match DD-MM-YYYY format.`);
    continue;
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  for (let i = 1; i < rows.length; i++) { // Skip header
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const item = row[0] ? String(row[0]).trim() : '';
    const qty = row[1] ? String(row[1]).trim() : '';
    const amount = Number(row[3]);

    if (!item || item.toLowerCase() === 'total' || item.toLowerCase() === 'amount') continue;
    if (isNaN(amount) || amount <= 0) continue;

    let description = item;
    if (qty) {
      description += ` (${qty})`;
    }

    try {
      insertStmt.run({
        category: 'Farm Requisition',
        description: description,
        amount: amount,
        date: dateStr,
        type: 'expense',
        payment_method: 'cash', // Defaulting to cash for these
        source_module: 'excel_import_requisitions',
        cost_center: 'farm'
      });
      totalInserted++;
    } catch (err) {
      console.error(`Error inserting row from sheet ${sheetName}:`, row, err);
    }
  }
}

console.log(`Successfully inserted ${totalInserted} requisition records.`);
