/**
 * Import staff roster from the estate salary Excel into SQLite `workforce`
 * (Farm → Field operations → Workers).
 *
 * Reads `docs/salary payments-4 (1).xlsx` (or path from --file).
 * Merges payment sheets (e.g. January + February); later month wins for salary/fields.
 *
 * Usage:
 *   node scripts/import-salary-workforce.cjs
 *   node scripts/import-salary-workforce.cjs --dry-run
 *   node scripts/import-salary-workforce.cjs --db "C:\path\to\estate.db"
 *
 * DB resolution (first hit wins):
 *   --db PATH, then ESTATE_DB_PATH, then %APPDATA%\coffee-estate-os\estate.db,
 *   then %APPDATA%\Coffee Estate OS\estate.db
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { readMergedRosterRecords } = require('./lib/salaryXlsx.cjs');

function deptFromPosition(pos) {
  const p = String(pos || '').toLowerCase();
  if (/askari|security|guard/.test(p)) return 'Security';
  if (/driver|logistics|transport/.test(p)) return 'Logistics';
  if (/admin|secretary|manager|account|cashier|hr\b/.test(p)) return 'Administration';
  if (/process|dryer|warehouse|pulper|mill|brand|qc\b/.test(p)) return 'Processing';
  if (/maint|mechan|electric|plumb/.test(p)) return 'Maintenance';
  return 'Field Operations';
}

function saccoFromRow(rec) {
  return rec.saving > 0 || rec.loanAmt > 0 || rec.loanBal > 0 ? 1 : 0;
}

function defaultDbPath() {
  const base = process.env.APPDATA || process.env.HOME || '';
  const candidates = [
    process.env.ESTATE_DB_PATH,
    path.join(base, 'coffee-estate-os', 'estate.db'),
    path.join(base, 'Coffee Estate OS', 'estate.db'),
  ].filter(Boolean);
  for (const pth of candidates) {
    try {
      if (fs.existsSync(pth)) return pth;
    } catch (_) {
      /* ignore */
    }
  }
  return candidates[1] || path.join(base, 'coffee-estate-os', 'estate.db');
}

function parseArgs(argv) {
  const out = { dryRun: false, db: null, file: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--db' && argv[i + 1]) {
      out.db = argv[++i];
    } else if (a === '--file' && argv[i + 1]) {
      out.file = argv[++i];
    }
  }
  return out;
}

function normName(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function onlyDigits(s) {
  return String(s ?? '').replace(/\D/g, '');
}

function findWorkforceId(db, name, contact) {
  const n = normName(name);
  const d = onlyDigits(contact);
  const rows = db
    .prepare(`SELECT id, contact FROM workforce WHERE lower(trim(coalesce(name,''))) = lower(?)`)
    .all(n);
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0].id;
  if (d) {
    const hit = rows.find((r) => onlyDigits(r.contact || '') === d);
    if (hit) return hit.id;
  }
  return null;
}

function ensureSaccoMember(db, workforceId, fullName, phone) {
  const wid = Number(workforceId);
  if (!wid || !String(fullName || '').trim()) return;
  const nm = String(fullName).trim();
  const ph = String(phone || '').trim();

  const existing = db.prepare('SELECT id FROM sacco_members WHERE workforce_id = ? LIMIT 1').get(wid);
  if (existing) {
    db.prepare("UPDATE sacco_members SET full_name = ?, phone = COALESCE(NULLIF(?, ''), phone) WHERE workforce_id = ?").run(
      nm,
      ph,
      wid
    );
    return;
  }

  const member_no = `WF-${wid}`;
  const relink = db.prepare('SELECT id FROM sacco_members WHERE member_no = ? LIMIT 1').get(member_no);
  if (relink) {
    db.prepare(
      `UPDATE sacco_members SET workforce_id = ?, full_name = ?, status = 'Active', phone = COALESCE(NULLIF(?, ''), phone) WHERE id = ?`
    ).run(wid, nm, ph, relink.id);
    return;
  }

  const joinDate = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO sacco_members (member_no, full_name, phone, national_id, join_date, status, workforce_id)
     VALUES (?, ?, ?, ?, ?, 'Active', ?)`
  ).run(member_no, nm, ph, '', joinDate, wid);
}

function main() {
  const args = parseArgs(process.argv);
  const root = path.join(__dirname, '..');
  const xlsxPath = args.file || path.join(root, 'docs', 'salary payments-4 (1).xlsx');

  if (!fs.existsSync(xlsxPath)) {
    console.error('Excel file not found:', xlsxPath);
    process.exit(1);
  }

  const records = readMergedRosterRecords(xlsxPath);
  if (!records.length) {
    console.error('No data rows with salary > 0 found in workbook.');
    process.exit(1);
  }

  const dbPath = args.db || defaultDbPath();
  if (args.dryRun) {
    console.log('[dry-run] Would use DB:', dbPath);
    console.log('[dry-run] Records:', records.length);
    records.slice(0, 5).forEach((r) => console.log('  ', r.name, r.position, r.salary, r.contact));
    if (records.length > 5) console.log('  ...');
    process.exit(0);
  }

  if (!fs.existsSync(dbPath)) {
    console.error('Database not found:', dbPath);
    console.error('Set ESTATE_DB_PATH or pass --db "C:\\...\\estate.db"');
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const insert = db.prepare(
    `INSERT INTO workforce (name, department, payroll, type, role, sacco_member, contact)
     VALUES (?, ?, ?, 'Permanent', ?, ?, ?)`
  );
  const update = db.prepare(
    `UPDATE workforce SET department = ?, payroll = ?, type = 'Permanent', role = ?, sacco_member = ?, contact = ? WHERE id = ?`
  );

  let inserted = 0;
  let updated = 0;

  const tx = db.transaction((list) => {
    for (const rec of list) {
      const department = deptFromPosition(rec.position);
      const role = rec.position || '';
      const sm = saccoFromRow(rec);
      const contact = rec.contact || null;

      const id = findWorkforceId(db, rec.name, rec.contact);
      if (id) {
        update.run(department, rec.salary, role, sm, contact, id);
        if (sm) ensureSaccoMember(db, id, rec.name, rec.contact);
        updated++;
      } else {
        const run = insert.run(rec.name, department, rec.salary, role, sm, contact);
        const wid = Number(run.lastInsertRowid);
        if (sm) ensureSaccoMember(db, wid, rec.name, rec.contact);
        inserted++;
      }
    }
  });

  tx(records);

  console.log('Import complete:', { dbPath, inserted, updated, totalFromExcel: records.length });
  db.close();
}

main();
