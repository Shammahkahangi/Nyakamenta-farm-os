/**
 * Rename blocks and set acres to match the maintenance invoice (BLOCK A … G).
 * Source: docs/INVOICE FOR MAINTENANCE FROM 16 - 31 May 2025-1.xlsx
 *
 * Default (per row):
 *   1) Legacy placeholder names (East Slope, North Ridge, …) → BLOCK A–F (North Ridge → BLOCK C).
 *   2) Else names like "BLOCK a" / "BLOCK G" → invoice acres + canonical "BLOCK X".
 *   3) Else use --by-id-order: first N rows by id → BLOCK A…
 *
 *   node scripts/apply-invoice-blocks.cjs "<path-to-estate.db>" [--dry-run] [--add-g] [--by-id-order]
 */
const path = require('path');
const fs = require('fs');

const INVOICE_BLOCKS = [
  { name: 'BLOCK A', acres: 10.68 },
  { name: 'BLOCK B', acres: 7.7 },
  { name: 'BLOCK C', acres: 5.58 },
  { name: 'BLOCK D', acres: 8.1 },
  { name: 'BLOCK E', acres: 9.72 },
  { name: 'BLOCK F', acres: 9.42 },
  { name: 'BLOCK G', acres: 4.9 },
];

/** Demo / wrong names from the stock UI → invoice block + acres (alphabetical name order = A…F). */
const LEGACY_PLACEHOLDER_NAMES_TO_INVOICE = {
  'east slope': { name: 'BLOCK A', acres: 10.68 },
  'high altitude': { name: 'BLOCK B', acres: 7.7 },
  'north ridge': { name: 'BLOCK C', acres: 5.58 },
  'south lowland': { name: 'BLOCK D', acres: 8.1 },
  'valley station': { name: 'BLOCK E', acres: 9.72 },
  'west terrace': { name: 'BLOCK F', acres: 9.42 },
};

function normName(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** "BLOCK C", "block g" → invoice row for that letter */
function invoiceFromBlockLabel(displayName) {
  const t = String(displayName ?? '').trim();
  const m = t.match(/^block\s*([A-G])\s*$/i);
  if (!m) return null;
  const idx = m[1].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
  if (idx < 0 || idx >= INVOICE_BLOCKS.length) return null;
  return INVOICE_BLOCKS[idx];
}

function genBlockId() {
  return 'BLK-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function main() {
  const flags = new Set(['--dry-run', '--add-g', '--by-id-order']);
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const addG = argv.includes('--add-g');
  const byIdOrder = argv.includes('--by-id-order');
  const args = argv.filter((a) => !flags.has(a));

  const dbPath = args[0] ? path.resolve(args[0]) : '';
  if (!dbPath || !fs.existsSync(dbPath)) {
    console.error('Usage: node scripts/apply-invoice-blocks.cjs <path-to-estate.db> [--dry-run] [--add-g] [--by-id-order]');
    console.error('Example: node scripts/apply-invoice-blocks.cjs "%APPDATA%\\coffee-estate-os\\estate.db"');
    process.exit(1);
  }

  const Database = require('better-sqlite3');
  const db = new Database(dbPath);

  const rows = db.prepare('SELECT id, name, acres FROM blocks ORDER BY id').all();
  if (rows.length === 0) {
    console.error('No blocks in database.');
    process.exit(1);
  }

  const n = rows.length;
  /** @type {{ blockId: string, oldName: string, oldAcres: number, name: string, acres: number }[]} */
  let lines = [];

  if (byIdOrder) {
    const target = INVOICE_BLOCKS.slice(0, Math.min(n, INVOICE_BLOCKS.length));
    for (let i = 0; i < target.length; i++) {
      const { name, acres } = target[i];
      const { id: blockId, name: oldName, acres: oldAcres } = rows[i];
      lines.push({ blockId, oldName, oldAcres, name, acres });
    }
    console.log(`Mode: ORDER BY id — applying invoice labels to first ${lines.length} row(s).\n`);
  } else {
    const unmatched = [];
    for (const row of rows) {
      const key = normName(row.name);
      let inv = LEGACY_PLACEHOLDER_NAMES_TO_INVOICE[key];
      if (!inv) inv = invoiceFromBlockLabel(row.name);
      if (!inv) {
        unmatched.push(row);
        continue;
      }
      lines.push({
        blockId: row.id,
        oldName: row.name,
        oldAcres: row.acres,
        name: inv.name,
        acres: inv.acres,
      });
    }
    const anyLegacy = lines.some((L) => LEGACY_PLACEHOLDER_NAMES_TO_INVOICE[normName(L.oldName)]);
    console.log(
      `Mode: ${anyLegacy ? 'legacy placeholder names → BLOCK …' : 'BLOCK letter labels + invoice acres'} (${lines.length} row(s)).\n`
    );
    if (unmatched.length) {
      console.log('Not updated (use --by-id-order or fix in app):');
      unmatched.forEach((r) => console.log(`  - id=${r.id} name="${r.name}"`));
      console.log('');
    }
    if (lines.length === 0) {
      console.error('No rows matched. Use --by-id-order with your estate.db path.');
      db.close();
      process.exit(1);
    }
  }

  for (const L of lines) {
    const sql = `UPDATE blocks SET name = '${L.name.replace(/'/g, "''")}', acres = ${Number(L.acres)} WHERE id = '${String(L.blockId).replace(/'/g, "''")}';`;
    console.log(`-- ${L.blockId}: "${L.oldName}" (${L.oldAcres} ac) → ${L.name} (${L.acres} ac)`);
    console.log(sql);
    console.log('');
  }

  if (!dryRun) {
    const run = db.transaction(() => {
      const upd = db.prepare('UPDATE blocks SET name = ?, acres = ? WHERE id = ?');
      for (const L of lines) {
        upd.run(L.name, L.acres, L.blockId);
      }
    });
    run();
    console.log('Applied UPDATE(s) successfully.');
  } else {
    console.log('(--dry-run: no changes written)');
  }

  if (n === 6 && INVOICE_BLOCKS.length === 7) {
    const g = INVOICE_BLOCKS[6];
    if (addG && !dryRun) {
      const newId = genBlockId();
      db.prepare(
        `INSERT INTO blocks (id, name, acres, altitude, variety, status, kgProcessed, plant_count) VALUES (?, ?, ?, NULL, 'Mixed', 'Active', 0, 0)`
      ).run(newId, g.name, g.acres);
      console.log(`Inserted ${g.name} (${g.acres} ac) id=${newId}`);
    } else if (addG && dryRun) {
      console.log(`-- Would INSERT ${g.name} (${g.acres} ac) with new BLK-… id and variety Mixed, status Active`);
    } else {
      console.log(
        `Note: Invoice has BLOCK G (${g.acres} ac) but DB has 6 rows. Re-run with --add-g to insert the 7th block, or add BLOCK G in the app.`
      );
    }
  }

  if (!byIdOrder && n > lines.length && lines.length === Object.keys(LEGACY_PLACEHOLDER_NAMES_TO_INVOICE).length) {
    /* all legacy names accounted for */
  } else if (n > INVOICE_BLOCKS.length && byIdOrder) {
    console.log(`Warning: ${n} rows exist; only first ${INVOICE_BLOCKS.length} were updated (--by-id-order).`);
  }

  db.close();
}

main();
