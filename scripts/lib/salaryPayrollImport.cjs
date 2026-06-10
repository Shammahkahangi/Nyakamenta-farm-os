/**
 * Payroll import from salary xlsx → payroll_runs / payroll_lines (same shape as importPayrollSeed).
 *
 * Column mapping (workbook → line fields):
 * - salary → gross_salary
 * - saving → sacco_saving
 * - deduction for books → sacco_book_fee
 * - loan amount → loan_principal_ref
 * - interest → loan_interest
 * - repayments → loan_repayment
 * - loan balance → loan_balance_snapshot
 * - amount to be paid as salary → net_pay when useExcelNet=true; else net = gross − savings − book − interest − repay (matches db.importPayrollSeed)
 */
const path = require('path');
const fs = require('fs');
const {
  XLSX,
  normName,
  onlyDigits,
  num,
  sheetMonthNumber,
  findSalaryColumnIndices,
  isNonPersonRowName,
} = require('./salaryXlsx.cjs');

function findWorkforceId(dbMod, name, contact) {
  const n = normName(name);
  const d = onlyDigits(contact);
  const rows = dbMod.query(`SELECT id, contact FROM workforce WHERE lower(trim(coalesce(name,''))) = lower(?)`, [n]);
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0].id;
  if (d) {
    const hit = rows.find((r) => onlyDigits(r.contact || '') === d);
    if (hit) return hit.id;
  }
  return null;
}

function resolveSaccoMemberId(dbMod, workforceId) {
  if (!workforceId) return null;
  const row = dbMod.query('SELECT id FROM sacco_members WHERE workforce_id = ? LIMIT 1', [workforceId]);
  return row[0] ? row[0].id : null;
}

function resolveActiveLoanId(dbMod, memberId) {
  if (!memberId) return null;
  const row = dbMod.query(
    `SELECT id FROM sacco_loans WHERE member_id = ? AND lower(trim(coalesce(status,''))) = 'active' ORDER BY id DESC LIMIT 1`,
    [memberId]
  );
  return row[0] ? row[0].id : null;
}

/** @returns {Set<string>|null} YYYY-MM keys, or null = import all month sheets */
function normalizeMonthsFilter(months) {
  if (months == null || months === '') return null;
  const arr = Array.isArray(months) ? months : String(months).split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const set = new Set();
  for (const m of arr) {
    if (/^\d{4}-\d{2}$/.test(m)) set.add(m);
  }
  return set.size ? set : null;
}

function parseSheetToLines(dbMod, rows, useExcelNet) {
  if (!rows.length || !rows[0]) return [];
  const h = rows[0].map((x) => String(x ?? '').trim().toLowerCase());
  const idx = findSalaryColumnIndices(h);
  if (idx.iName < 0 || idx.iSal < 0) return [];

  const lines = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = normName(row[idx.iName]);
    if (!name) continue;
    if (isNonPersonRowName(name)) continue;
    const gross = num(row[idx.iSal]);
    if (gross <= 0) continue;

    const contact = String(row[idx.iContact] ?? '').trim();
    const position = normName(row[idx.iPos] ?? '');
    const saving = idx.iSaving >= 0 ? num(row[idx.iSaving]) : 0;
    const bookFee = idx.iBook >= 0 ? num(row[idx.iBook]) : 0;
    const loanAmt = idx.iLoan >= 0 ? num(row[idx.iLoan]) : 0;
    const interest = idx.iInterest >= 0 ? num(row[idx.iInterest]) : 0;
    const repayment = idx.iRepay >= 0 ? num(row[idx.iRepay]) : 0;
    const loanBal = idx.iBal >= 0 ? num(row[idx.iBal]) : 0;
    const wid = findWorkforceId(dbMod, name, contact);
    const saccoMemberId = resolveSaccoMemberId(dbMod, wid);
    const loanId = resolveActiveLoanId(dbMod, saccoMemberId);

    const line = {
      full_name: name,
      contact,
      position,
      gross_salary: gross,
      sacco_saving: saving,
      sacco_book_fee: bookFee,
      loan_principal_ref: loanAmt,
      loan_interest: interest,
      loan_repayment: repayment,
      loan_balance_snapshot: loanBal,
      sacco_member_id: saccoMemberId,
      loan_id: loanId,
    };
    if (useExcelNet && idx.iNet >= 0) {
      const raw = row[idx.iNet];
      if (raw !== '' && raw != null && String(raw).trim() !== '') {
        line.net_pay = num(raw);
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * @param {object} opts
 * @param {object} [opts.dbModule] - db module from src/main/db (Electron/server: already initialized; skip initDB)
 * @param {string} [opts.dbDir] - directory containing estate.db (CLI: calls initDB once)
 * @param {string} opts.filePath - absolute path to .xlsx
 * @param {number} opts.year - calendar year for sheet names (e.g. 2026 for "January payments")
 * @param {boolean} [opts.skipIfExists] - skip months that already have a payroll_runs row (default: replace existing run per month via importPayrollSeed)
 * @param {boolean} [opts.useExcelNet] - set net_pay from "amount to be paid" column when present
 * @param {boolean} [opts.dryRun] - no writes; return planned actions
 * @param {string[]|string} [opts.months] - only import these YYYY-MM values (e.g. ['2026-01','2026-02'] or comma-separated)
 * @returns {{ ok: boolean, results: Array, error?: string }}
 */
function runImportPayrollFromXlsx(opts) {
  const dbMod = opts.dbModule || require('../../src/main/db.js');
  const filePath = path.resolve(opts.filePath);
  const year = Number(opts.year);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return { ok: false, error: 'Invalid year', results: [] };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `File not found: ${filePath}`, results: [] };
  }

  if (opts.dbDir) {
    dbMod.initDB(path.resolve(opts.dbDir));
  } else if (!opts.dbModule) {
    return { ok: false, error: 'Provide dbDir (CLI) or dbModule (Electron)', results: [] };
  }

  const skipIfExists = !!opts.skipIfExists;
  const useExcelNet = !!opts.useExcelNet;
  const dryRun = !!opts.dryRun;
  const monthsFilter = normalizeMonthsFilter(opts.months);

  const wb = XLSX.readFile(filePath);
  const results = [];

  for (const sheetName of wb.SheetNames) {
    if (!String(sheetName || '').trim()) continue;
    if (/^sheet\s*\d+$/i.test(String(sheetName).trim())) continue;

    const monthNum = sheetMonthNumber(sheetName);
    if (!monthNum) continue;

    const yearMonth = `${year}-${String(monthNum).padStart(2, '0')}`;
    if (monthsFilter && !monthsFilter.has(yearMonth)) {
      results.push({ yearMonth, sheetName, skipped: true, reason: 'not_in_months_filter', lineCount: 0 });
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    const lines = parseSheetToLines(dbMod, rows, useExcelNet);

    if (!lines.length) {
      results.push({ yearMonth, sheetName, skipped: true, reason: 'no_valid_rows', lineCount: 0 });
      continue;
    }

    if (skipIfExists) {
      const ex = dbMod.query('SELECT id FROM payroll_runs WHERE year_month = ?', [yearMonth]);
      if (ex && ex.length) {
        results.push({ yearMonth, sheetName, skipped: true, reason: 'already_exists', lineCount: lines.length });
        continue;
      }
    }

    if (dryRun) {
      results.push({ yearMonth, sheetName, dryRun: true, lineCount: lines.length });
      continue;
    }

    try {
      dbMod.importPayrollSeed(yearMonth, lines);
      results.push({ yearMonth, sheetName, imported: true, lineCount: lines.length });
    } catch (e) {
      return { ok: false, error: e.message || String(e), results };
    }
  }

  if (!results.length) {
    return { ok: false, error: 'No month sheets found (expected names like "January payments").', results: [] };
  }

  if (
    monthsFilter &&
    results.length &&
    results.every((r) => r.skipped && r.reason === 'not_in_months_filter')
  ) {
    return { ok: false, error: 'No month sheets matched --months / months filter.', results };
  }

  return { ok: true, results };
}

module.exports = {
  runImportPayrollFromXlsx,
  parseSheetToLines,
  findWorkforceId,
  resolveSaccoMemberId,
  resolveActiveLoanId,
  normalizeMonthsFilter,
};
