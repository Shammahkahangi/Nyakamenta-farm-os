const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'coffee-estate-os', 'estate.db');
console.log('Checking DB at:', dbPath);

try {
    const db = new Database(dbPath, { fileMustExist: true });

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(t => t.name).join(', '));

    const blocksCount = db.prepare('SELECT COUNT(*) as count FROM blocks').get().count;
    console.log('Blocks count:', blocksCount);

    if (blocksCount > 0) {
        console.log('Sample Block:', db.prepare('SELECT * FROM blocks LIMIT 1').get());
    }

    const batchesCount = db.prepare('SELECT COUNT(*) as count FROM batches').get().count;
    console.log('Batches count:', batchesCount);

    const financeCount = db.prepare('SELECT COUNT(*) as count FROM finance_items').get().count;
    console.log('Finance count:', financeCount);

    const contractsCount = db.prepare('SELECT COUNT(*) as count FROM contracts').get().count;
    console.log('Contracts count:', contractsCount);

    const insightsCount = db.prepare('SELECT COUNT(*) as count FROM insights').get().count;
    console.log('Insights count:', insightsCount);

} catch (e) {
    console.error('Error opening DB:', e.message);
}
