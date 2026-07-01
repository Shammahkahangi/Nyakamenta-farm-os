const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'estate.db');
const db = new Database(dbPath);

console.log('Searching for Frank in workforce table...');
const rows = db.prepare("SELECT * FROM workforce WHERE name LIKE '%Frank%'").all();
console.log(JSON.stringify(rows, null, 2));

db.close();
