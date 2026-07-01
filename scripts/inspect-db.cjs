const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'estate.db');
const db = new Database(dbPath);

console.log('Database path:', dbPath);

// List all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('\nTables in database:');
console.log(tables.map(t => t.name).join(', '));

// Check if staff, employees, or user tables exist, and list some sample data
for (const tableName of ['staff', 'employees', 'users', 'sacco_members']) {
  const tableExists = tables.some(t => t.name === tableName);
  if (tableExists) {
    console.log(`\n--- Schema for ${tableName} ---`);
    const schema = db.prepare(`PRAGMA table_info(${tableName})`).all();
    console.log(schema.map(c => `${c.name} (${c.type})`).join(', '));

    try {
      const rows = db.prepare(`SELECT * FROM ${tableName} LIMIT 5`).all();
      console.log(`\nSample rows from ${tableName}:`);
      console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
      console.error(`Error reading ${tableName}:`, err.message);
    }
  }
}

db.close();
