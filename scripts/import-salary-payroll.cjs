/**
 * Import monthly payroll from the salary Excel into payroll_runs / payroll_lines.
 *
 * Policy:
 * - Default: replace each month’s run (delete existing payroll_runs for that year_month, insert draft + lines).
 * - --skip-if-exists: leave existing runs untouched.
 * - Net pay: default = gross − savings − book − interest − repay (same as db.importPayrollSeed).
 * - --use-excel-net: use "Amount to be paid as salary" when that column has a value.
 *
 * Usage:
 *   node scripts/import-salary-payroll.cjs --help
 *   node scripts/import-salary-payroll.cjs --year 2026
 *   node scripts/import-salary-payroll.cjs --year 2026 --months 2026-01,2026-02
 *   node scripts/import-salary-payroll.cjs --year 2026 --db "D:\\path\\estate.db"
 *   node scripts/import-salary-payroll.cjs --year 2026 --file "D:\\path\\book.xlsx"
 *   node scripts/import-salary-payroll.cjs --year 2026 --dry-run
 *   node scripts/import-salary-payroll.cjs --year 2026 --skip-if-exists
 *   node scripts/import-salary-payroll.cjs --year 2026 --use-excel-net
 */
const path = require('path');
const fs = require('fs');
const { runImportPayrollFromXlsx } = require('./lib/salaryPayrollImport.cjs');

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

function printHelp() {
  console.log(`import-salary-payroll.cjs — Excel → payroll_runs / payroll_lines

Required:
  --year YYYY          Calendar year for month sheet names (e.g. 2026 for "January payments")

Optional:
  --file PATH          .xlsx path (default: docs/salary payments-4 (1).xlsx under project root)
  --db PATH            SQLite DB path (default: ESTATE_DB_PATH or %APPDATA%/coffee-estate-os/estate.db)
  --months LIST        Comma-separated YYYY-MM (e.g. 2026-01,2026-02); only those months import
  --dry-run            List months that would import; no database writes
  --skip-if-exists     Skip a month if payroll_runs already has that year_month
  --use-excel-net      Prefer net salary from Excel "amount to be paid" when present

Default behaviour replaces any existing run for a month (same as in-app import).
`);
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    skipIfExists: false,
    useExcelNet: false,
    db: null,
    file: null,
    year: null,
    months: null,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--skip-if-exists') out.skipIfExists = true;
    else if (a === '--use-excel-net') out.useExcelNet = true;
    else if (a === '--db' && argv[i + 1]) out.db = argv[++i];
    else if (a === '--file' && argv[i + 1]) out.file = argv[++i];
    else if (a === '--year' && argv[i + 1]) out.year = Number(argv[++i]);
    else if (a === '--months' && argv[i + 1]) out.months = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const root = path.join(__dirname, '..');
  const xlsxPath = args.file || path.join(root, 'docs', 'salary payments-4 (1).xlsx');
  const year = args.year != null && Number.isFinite(args.year) ? args.year : new Date().getFullYear();

  if (!process.argv.includes('--year')) {
    console.warn(`No --year given; using ${year}.`);
  }

  if (!fs.existsSync(xlsxPath)) {
    console.error('Excel file not found:', xlsxPath);
    process.exit(1);
  }

  const dbPath = args.db || defaultDbPath();
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbPath)) {
    console.error('Database not found:', dbPath);
    process.exit(1);
  }

  const result = runImportPayrollFromXlsx({
    dbDir,
    filePath: xlsxPath,
    year,
    skipIfExists: args.skipIfExists,
    useExcelNet: args.useExcelNet,
    dryRun: args.dryRun,
    months: args.months,
  });

  if (!result.ok) {
    console.error(result.error || 'Import failed');
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
