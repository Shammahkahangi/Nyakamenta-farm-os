#!/usr/bin/env node
/**
 * db-cleanup.cjs
 *
 * Wipes out transactional and test logs in the SQLite database,
 * while preserving workforce roster, blocks (acreage register),
 * and maintenance rate definitions.
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'estate.db');
const db = new Database(dbPath);

console.log('Connecting to database at:', dbPath);

const tablesToClear = [
    'batches',
    'contracts',
    'insights',
    'ipm_scouting',
    'sacco_savings',
    'sacco_loans',
    'sacco_repayments',
    'sacco_finance_items',
    'sacco_members',
    'lodge_bookings',
    'lodge_payments',
    'lodge_expenses',
    'payroll_lines',
    'payroll_runs',
    'logbook_tasks',
    'logbook_minutes',
    'worker_notes',
    'logbook_complaints',
    'logbook_attachments',
    'viva_enquiries',
    'fertility_applications',
    'irrigation_logs',
    'shade_trees',
    'stumping_cycles',
    'nursery_batches',
    'finance_items'
];

try {
    // Disable foreign key constraints temporarily to allow wiping related tables
    db.pragma('foreign_keys = OFF');

    db.transaction(() => {
        console.log('\n--- Clearing Transactional Tables ---');
        for (const table of tablesToClear) {
            const countRow = db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name=?`).get(table);
            if (countRow.c > 0) {
                const deleted = db.prepare(`DELETE FROM ${table}`).run();
                console.log(`Cleared ${table}: removed ${deleted.changes} row(s).`);
                
                // Reset auto-increment index
                try {
                    db.prepare(`DELETE FROM sqlite_sequence WHERE name=?`).run(table);
                } catch (_) {}
            } else {
                console.log(`Table ${table} does not exist. Skipping.`);
            }
        }

        console.log('\n--- Cleaning up Workforce Table ---');
        // Delete the dummy 'total' row which is not a real employee
        const deletedTotal = db.prepare(`DELETE FROM workforce WHERE lower(trim(name)) = 'total'`).run();
        console.log(`Deleted 'total' rollup rows from workforce: ${deletedTotal.changes}`);

        // Reset sacco_member flags in workforce since SACCO tables are cleared
        const resetSacco = db.prepare(`UPDATE workforce SET sacco_member = 0`).run();
        console.log(`Reset sacco_member flag for ${resetSacco.changes} workforce row(s).`);

        console.log('\n--- Adjusting Blocks (Acreage Register) ---');
        // Keep the blocks (since they hold the acreage register) but reset yield/processed stats to 0
        const resetBlocks = db.prepare(`
            UPDATE blocks 
            SET yield = 0, cost = 0, revenue = 0, kgProcessed = 0
        `).run();
        console.log(`Reset yield/processed metrics for ${resetBlocks.changes} block(s).`);
    })();

    // Re-enable foreign key constraints
    db.pragma('foreign_keys = ON');

    console.log('\nDatabase cleanup completed successfully.');
} catch (error) {
    console.error('Database cleanup failed:', error);
    process.exit(1);
}
