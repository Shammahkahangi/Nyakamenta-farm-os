const db = require('better-sqlite3')('data/estate.db');
console.log("finance_items schema:", db.prepare("PRAGMA table_info('finance_items')").all());
console.log("finance_categories:", db.prepare("SELECT * FROM finance_categories").all());
