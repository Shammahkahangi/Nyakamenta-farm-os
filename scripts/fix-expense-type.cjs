const db = require('better-sqlite3')('data/estate.db');
db.prepare("UPDATE finance_items SET type = 'Expense' WHERE type = 'expense'").run();
console.log('Updated rows:', db.prepare("SELECT type, count(1) from finance_items GROUP BY type").all());
