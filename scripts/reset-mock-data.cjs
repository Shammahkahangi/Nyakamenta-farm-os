#!/usr/bin/env node
/**
 * reset-mock-data.cjs
 *
 * Wipes the demo/mock rows that were seeded into estate.db from the original
 * `data/data.json`:
 *
 *   - 6 mock blocks (East Slope, High Altitude, North Ridge, South Lowland,
 *     Valley Station, West Terrace)
 *   - Any batches referencing those blocks
 *   - Seeded demo insights
 *   - Generic seeded inventory rows (NPK Fertilizer, Copper Fungicide,
 *     Knapsack Sprayer, Pruning Shears)
 *
 * Preserves real data: workforce, payroll_lines/runs, SACCO tables,
 * contracts, maintenance_rate_*, finance_items (since none are tied to
 * mock blocks), and anything you have added through the UI.
 *
 * Usage:
 *   node scripts/reset-mock-data.cjs          # dry-run preview
 *   node scripts/reset-mock-data.cjs --apply  # actually delete
 */

const path = require('path');
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const dbPath = path.join(__dirname, '..', 'data', 'estate.db');
const db = new Database(dbPath);

const MOCK_BLOCK_IDS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MOCK_BLOCK_NAMES = [
    'East Slope',
    'High Altitude',
    'North Ridge',
    'South Lowland',
    'Valley Station',
    'West Terrace',
];
const MOCK_INVENTORY_NAMES = [
    'NPK Fertilizer (50kg Bag)',
    'Copper Fungicide (1L)',
    'Knapsack Sprayer (20L)',
    'Pruning Shears',
];

function countMockBlocks() {
    const placeholders = MOCK_BLOCK_NAMES.map(() => '?').join(',');
    return db
        .prepare(`SELECT COUNT(*) AS c FROM blocks WHERE name IN (${placeholders}) OR id IN (${MOCK_BLOCK_IDS.map(() => '?').join(',')})`)
        .get(...MOCK_BLOCK_NAMES, ...MOCK_BLOCK_IDS).c;
}

function listTargets() {
    const placeholders = MOCK_BLOCK_IDS.map(() => '?').join(',');
    const blocks = db
        .prepare(`SELECT id, name FROM blocks WHERE id IN (${placeholders}) OR name IN (${MOCK_BLOCK_NAMES.map(() => '?').join(',')})`)
        .all(...MOCK_BLOCK_IDS, ...MOCK_BLOCK_NAMES);

    const ids = blocks.map((b) => b.id);
    const idPh = ids.length ? ids.map(() => '?').join(',') : "''";

    const batches = ids.length
        ? db.prepare(`SELECT id, block_id, stage, status FROM batches WHERE block_id IN (${idPh})`).all(...ids)
        : [];

    const insights = db.prepare('SELECT id, module, title FROM insights').all();
    const inventory = db
        .prepare(`SELECT id, name FROM inventory WHERE name IN (${MOCK_INVENTORY_NAMES.map(() => '?').join(',')})`)
        .all(...MOCK_INVENTORY_NAMES);

    return { blocks, batches, insights, inventory, ids };
}

function preview(targets) {
    console.log('Mock rows that will be deleted:\n');
    console.log(`  Blocks    : ${targets.blocks.length}`);
    targets.blocks.forEach((b) => console.log(`    - ${b.id}  ${b.name}`));
    console.log(`\n  Batches   : ${targets.batches.length}`);
    targets.batches.forEach((b) => console.log(`    - ${b.id}  (block ${b.block_id}, ${b.stage}/${b.status})`));
    console.log(`\n  Insights  : ${targets.insights.length}`);
    targets.insights.forEach((i) => console.log(`    - [${i.module}] ${i.title}`));
    console.log(`\n  Inventory : ${targets.inventory.length}`);
    targets.inventory.forEach((i) => console.log(`    - ${i.name}`));
    console.log('');
}

function apply(targets) {
    const tx = db.transaction(() => {
        if (targets.ids.length) {
            const ph = targets.ids.map(() => '?').join(',');
            // Dependent rows keyed by block_id across operational tables.
            const dependentTables = [
                'batches',
                'fertility_applications',
                'ipm_scouting',
                'irrigation_logs',
                'shade_trees',
                'soil_records',
                'stumping_cycles',
                'mother_gardens',
                'nursery_batches',
            ];
            for (const t of dependentTables) {
                try {
                    db.prepare(`DELETE FROM ${t} WHERE block_id IN (${ph})`).run(...targets.ids);
                } catch (_) {
                    /* table may not exist in older DBs */
                }
            }
            db.prepare(`DELETE FROM blocks WHERE id IN (${ph})`).run(...targets.ids);
        }

        db.prepare('DELETE FROM insights').run();

        if (targets.inventory.length) {
            const invPh = MOCK_INVENTORY_NAMES.map(() => '?').join(',');
            db.prepare(`DELETE FROM inventory WHERE name IN (${invPh})`).run(...MOCK_INVENTORY_NAMES);
        }
    });
    tx();
    console.log('Mock data removed. Reload the app to see an empty blocks list, then add real blocks from the Estate page.');
}

const targets = listTargets();
if (!targets.blocks.length && !targets.insights.length && !targets.inventory.length) {
    console.log('Nothing to do — no mock rows found.');
    process.exit(0);
}
preview(targets);

if (!APPLY) {
    console.log('Dry-run complete. Re-run with --apply to delete these rows.');
    process.exit(0);
}

apply(targets);
