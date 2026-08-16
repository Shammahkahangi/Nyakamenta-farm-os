const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const Database = require('better-sqlite3');

const dataDir = process.env.ESTATE_DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'estate.db');
const sqlite = new Database(dbPath);

function getCategoryForItem(description) {
  const d = description.toLowerCase();
  if (d.includes('fuel') || d.includes('disel') || d.includes('diesl') || d.includes('petrol') || d.includes('2t')) {
    return 'Fuel & Lubricants';
  }
  if (d.includes('repair') || d.includes('service') || d.includes('engine oil')) {
    return 'Equipment Service / Repair';
  }
  if (d.includes('posho') || d.includes('bean') || d.includes('salt') || d.includes('soap') || d.includes('labour') || d.includes('labor') || d.includes('ruyenje') || d.includes('slashing')) {
    return 'Casual / Seasonal Labour';
  }
  if (d.includes('knives') || d.includes('padlock') || d.includes('bin') || d.includes('blade') || d.includes('cable') || d.includes('shear') || d.includes('tape') || d.includes('handle')) {
    return 'Equipment Purchase';
  }
  return 'Other Expense';
}

function updateCategories() {
  const items = sqlite.prepare("SELECT id, description, category FROM finance_items WHERE source_module = 'excel_import_requisitions' OR category = 'Farm Requisition'").all();
  console.log(`Found ${items.length} items to categorize.`);

  const updateStmt = sqlite.prepare("UPDATE finance_items SET category = ? WHERE id = ?");
  
  for (const item of items) {
    const cat = getCategoryForItem(item.description);
    updateStmt.run(cat, item.id);
  }
  console.log("Updated categories in SQLite local database.");
}

async function syncToSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !serviceKey) return;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const localItems = sqlite.prepare("SELECT * FROM finance_items").all();

  const payload = localItems.map(item => ({
    category: item.category,
    description: item.description,
    amount: item.amount,
    date: item.date,
    type: item.type
  }));

  await admin.from('finance_items').delete().gte('id', 0);
  const { data: inserted, error } = await admin.from('finance_items').insert(payload).select();
  if (error) {
    console.error("Supabase sync error:", error);
  } else {
    console.log(`Synced ${inserted?.length} items to Supabase cloud with updated categories.`);
  }
}

updateCategories();
syncToSupabase().catch(console.error);
