const db = require('better-sqlite3')('data/estate.db');
const rows = db.prepare("SELECT * FROM finance_items WHERE date LIKE '2026-06%' OR date LIKE '2026-07%'").all();
console.log(`Total rows in June/July 2026: ${rows.length}`);
console.log(rows.slice(0, 10));
