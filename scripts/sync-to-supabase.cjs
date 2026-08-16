const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const db = require('../src/main/db');

const dataDir = process.env.ESTATE_DATA_DIR || path.join(__dirname, '..', 'data');
db.initDB(dataDir);

async function checkAndSync() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const localItems = db.query("SELECT * FROM finance_items");
  console.log(`Local finance_items count: ${localItems.length}`);

  const payload = localItems.map(item => ({
    category: item.category,
    description: item.description,
    amount: item.amount,
    date: item.date,
    type: item.type
  }));

  // Clear existing items in Supabase first to avoid duplicates
  await admin.from('finance_items').delete().gte('id', 0);

  const { data: inserted, error: upsertErr } = await admin.from('finance_items').insert(payload).select();
  if (upsertErr) {
    console.error("Insert to Supabase error:", upsertErr);
  } else {
    console.log(`Successfully synced ${inserted?.length} items to Supabase cloud!`);
  }
}

checkAndSync().catch(console.error);
