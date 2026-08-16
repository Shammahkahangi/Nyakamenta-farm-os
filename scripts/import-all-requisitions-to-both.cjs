const XLSX = require('xlsx');
const path = require('path');
require('dotenv').config();
const db = require('../src/main/db');
const { createClient } = require('@supabase/supabase-js');

db.initDB(path.join(__dirname, '../data'));

const excelPath = path.join(__dirname, '../requisition 1.xlsx');
console.log('Reading workbook:', excelPath);
const wb = XLSX.readFile(excelPath);

function getCategory(desc) {
  const d = String(desc || '').toLowerCase();
  if (d.includes('fuel') || d.includes('disel') || d.includes('diesel') || d.includes('petrol') || d.includes('2t') || d.includes('engine oil')) return 'Fuel & Lubricants';
  if (d.includes('repair') || d.includes('service') || d.includes('puncture') || d.includes('welding') || d.includes('tyre') || d.includes('tire')) return 'Equipment Service / Repair';
  if (d.includes('posho') || d.includes('bean') || d.includes('salt') || d.includes('soap') || d.includes('labour') || d.includes('wage') || d.includes('casual') || d.includes('airtime') || d.includes('food')) return 'Casual / Seasonal Labour';
  if (d.includes('padlock') || d.includes('bin') || d.includes('blade') || d.includes('cable') || d.includes('shear') || d.includes('slasher') || d.includes('hoe') || d.includes('panga') || d.includes('gloves') || d.includes('tarpaulin') || d.includes('pump') || d.includes('bucket')) return 'Equipment Purchase';
  if (d.includes('chemical') || d.includes('fertilizer') || d.includes('fungicide') || d.includes('insecticide') || d.includes('spray') || d.includes('mulch')) return 'Fertiliser — Broadcast';
  return 'Other Expense';
}

async function run() {
  console.log('Clearing old requisitions database tables...');
  db.execute('DELETE FROM requisition_items');
  db.execute('DELETE FROM requisitions');
  db.execute("DELETE FROM finance_items WHERE source_module = 'requisition_entry'");

  let reqCount = 0;
  let itemCount = 0;
  let totalDisbursed = 0;

  const financeInserts = [];

  for (let idx = 0; idx < wb.SheetNames.length; idx++) {
    const sName = wb.SheetNames[idx];
    const ws = wb.Sheets[sName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (!rows || rows.length <= 1) continue;

    // Parse date
    let cleanName = sName.replace('3026', '2026');
    let dateStr = '';
    let m = cleanName.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (m) {
      dateStr = `${m[3]}-${m[2]}-${m[1]}`;
    } else {
      // Fallback for Sheet15, Sheet16 etc.
      const day = String(14 + idx).padStart(2, '0');
      dateStr = `2026-07-${day}`;
    }

    const items = [];
    let sheetTotal = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length === 0) continue;
      const firstCell = String(r[0] || '').trim();
      if (!firstCell || firstCell.toLowerCase().startsWith('total')) continue;

      const itemDesc = firstCell;
      const qty = r[1] !== undefined ? String(r[1]).trim() : '';
      const unitCost = parseFloat(r[2]) || 0;
      let amount = parseFloat(r[3]);
      if (isNaN(amount) || amount <= 0) {
        amount = unitCost > 0 && parseFloat(qty) ? parseFloat(qty) * unitCost : unitCost;
      }

      if (itemDesc && amount > 0) {
        items.push({ itemDesc, qty, unitCost, amount });
        sheetTotal += amount;
      }
    }

    if (items.length === 0) continue;

    reqCount++;
    itemCount += items.length;
    totalDisbursed += sheetTotal;

    const reqNo = `REQ-${dateStr.replace(/-/g, '')}-${String(reqCount).padStart(2, '0')}`;
    const reqTitle = `Farm Operational Requisition — ${sName}`;

    // 1. Insert into requisitions table
    const reqRes = db.execute(
      `INSERT INTO requisitions (req_no, date, title, notes, total_amount, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'Approved', ?)`,
      [reqNo, dateStr, reqTitle, 'Approved & Disbursed', sheetTotal, new Date().toISOString()]
    );
    const reqId = reqRes.lastInsertRowid;

    // 2. Insert into requisition_items table
    for (const item of items) {
      db.execute(
        `INSERT INTO requisition_items (requisition_id, item, qty, unit_cost, amount)
         VALUES (?, ?, ?, ?, ?)`,
        [reqId, item.itemDesc, item.qty, item.unitCost, item.amount]
      );

      // 3. Prepare finance_items insert
      let fullDesc = item.itemDesc;
      if (item.qty) fullDesc += ` (${item.qty})`;

      const cat = getCategory(item.itemDesc);

      db.execute(
        `INSERT INTO finance_items (category, description, amount, date, type, payment_method, source_module, cost_center)
         VALUES (?, ?, ?, ?, 'Expense', 'cash', 'requisition_entry', 'farm')`,
        [cat, fullDesc, item.amount, dateStr]
      );

      financeInserts.push({
        category: cat,
        description: fullDesc,
        amount: item.amount,
        date: dateStr,
        type: 'Expense',
        source_module: 'requisition_entry',
        cost_center: 'farm'
      });
    }

    console.log(`[OK] Created Requisition #${reqId} (${reqNo}) for ${dateStr} with ${items.length} items. Total: UGX ${sheetTotal.toLocaleString()}`);
  }

  console.log('\n========================================');
  console.log(`SUMMARY OF IMPORT:`);
  console.log(`Requisitions Created: ${reqCount}`);
  console.log(`Total Line Items: ${itemCount}`);
  console.log(`Total Funds Disbursed: UGX ${totalDisbursed.toLocaleString()}`);
  console.log('========================================\n');

  // Supabase Cloud Sync
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    console.log('Syncing imported expenses to Supabase cloud database...');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Delete previous requisition_entry records from Supabase
    await supabase.from('finance_items').delete().eq('source_module', 'requisition_entry');

    // Batch insert
    const payload = financeInserts.map(f => ({
      category: f.category,
      description: f.description,
      amount: f.amount,
      date: f.date,
      type: 'Expense'
    }));

    // Insert in chunks of 50
    for (let i = 0; i < payload.length; i += 50) {
      const chunk = payload.slice(i, i + 50);
      const { error } = await supabase.from('finance_items').insert(chunk);
      if (error) {
        console.error('Supabase chunk error:', error);
      }
    }
    console.log(`Successfully synced ${payload.length} expense rows to Supabase Cloud!`);
  }
}

run().catch(err => {
  console.error("Fatal error during import:", err);
});
