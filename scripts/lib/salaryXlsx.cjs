/**
 * Shared parsing for estate salary workbooks (e.g. docs/salary payments-4 (1).xlsx).
 * Used by workforce roster import and payroll / SACCO month imports.
 */
const fs = require('fs');
const XLSX = require('xlsx');

function normName(s) {
  return String(s ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Skip Excel footer/summary rows that are not people (e.g. "Total", "Grand total").
 * Prevents creating fake workforce / SACCO members from summary lines.
 */
function isNonPersonRowName(name) {
  const n = normName(name).toLowerCase();
  if (!n) return true;
  if (/^total[s]?$/.test(n)) return true;
  if (/^grand\s+total$/.test(n)) return true;
  if (/^sub\s*total$/.test(n)) return true;
  if (/^subtotal$/.test(n)) return true;
  if (/^sum$/.test(n)) return true;
  if (/^total\s+/.test(n)) return true;
  return false;
}

function onlyDigits(s) {
  return String(s ?? '').replace(/\D/g, '');
}

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/** 1–12 from sheet name, or 0 if unknown */
function sheetMonthNumber(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('jan')) return 1;
  if (n.includes('feb')) return 2;
  if (n.includes('mar')) return 3;
  if (n.includes('apr')) return 4;
  if (n.includes('may')) return 5;
  if (n.includes('jun')) return 6;
  if (n.includes('jul')) return 7;
  if (n.includes('aug')) return 8;
  if (n.includes('sep')) return 9;
  if (n.includes('oct')) return 10;
  if (n.includes('nov')) return 11;
  if (n.includes('dec')) return 12;
  return 0;
}

/** Relative month ordering for merging roster rows across sheets (later month wins). */
function sheetMonthOrder(name) {
  return sheetMonthNumber(name);
}

/** Prefer the staff salary column, not "total salary" / summary columns. */
function findSalaryAmountColumnIndex(h) {
  const exact = h.findIndex((c) => c === 'salary' || /^salary$/i.test(String(c).trim()));
  if (exact >= 0) return exact;
  return h.findIndex(
    (c) => c.includes('salary') && !c.includes('paid') && !/total|grand|sum|net\s*pay/i.test(c)
  );
}

/** Prefer plain "saving" / "savings" over headers like "total savings" or unrelated columns. */
function findSavingColumnIndex(h) {
  const j = h.findIndex((c) => c === 'saving' || c === 'savings');
  if (j >= 0) return j;
  const j2 = h.findIndex(
    (c) =>
      (/^saving\b/.test(c) || /^savings\b/.test(c) || /^saving\s/.test(c)) &&
      !/total|grand|sum|net|balance|paid/i.test(c)
  );
  if (j2 >= 0) return j2;
  return h.findIndex((c) => c.startsWith('saving') && !/total|grand|sum/i.test(c));
}

/**
 * Map header row to column indices for salary sheets.
 * @param {string[]} h - lowercased trimmed headers
 */
function findSalaryColumnIndices(h) {
  const iName = h.findIndex((c) => /^name\b/.test(c));
  const iContact = h.findIndex((c) => c.includes('contact'));
  const iPos = h.findIndex((c) => c.includes('position'));
  const iSal = findSalaryAmountColumnIndex(h);
  const iSaving = findSavingColumnIndex(h);
  const iBook = h.findIndex(
    (c) =>
      (c.includes('deduction') && (c.includes('book') || c.includes('sacco'))) ||
      (c.includes('book') && c.includes('sacco'))
  );
  const iLoan = h.findIndex((c) => c.includes('loan') && c.includes('amount'));
  const iInterest = h.findIndex((c) => c === 'interest' || /^interest\b/.test(c));
  const iRepay = h.findIndex((c) => c.includes('repayment'));
  const iBal = h.findIndex((c) => c.includes('loan balance'));
  const iNet = h.findIndex((c) => c.includes('paid') && c.includes('salary'));
  return {
    iName,
    iContact,
    iPos,
    iSal,
    iSaving,
    iBook,
    iLoan,
    iInterest,
    iRepay,
    iBal,
    iNet,
  };
}

/**
 * Merge all non-empty month sheets into one record per person (name|phone key).
 * Later calendar month overwrites earlier; carries forward salary/position if newer row is blank.
 */
function readMergedRosterRecords(filePath) {
  const wb = XLSX.readFile(filePath);
  const merged = new Map();

  for (const sheetName of wb.SheetNames) {
    if (!String(sheetName || '').trim()) continue;
    if (/^sheet\s*\d+$/i.test(String(sheetName).trim())) continue;

    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    if (!rows.length || !rows[0]) continue;

    const h = rows[0].map((x) => String(x ?? '').trim().toLowerCase());
    const idx = findSalaryColumnIndices(h);
    if (idx.iName < 0 || idx.iSal < 0) continue;

    const ord = sheetMonthOrder(sheetName);
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const name = normName(row[idx.iName]);
      if (!name) continue;
      if (isNonPersonRowName(name)) continue;

      const contact = String(row[idx.iContact] ?? '').trim();
      const key = `${name.toLowerCase()}|${onlyDigits(contact)}`;

      const rec = {
        name,
        contact,
        position: normName(row[idx.iPos] ?? ''),
        salary: num(row[idx.iSal]),
        saving: idx.iSaving >= 0 ? num(row[idx.iSaving]) : 0,
        loanAmt: idx.iLoan >= 0 ? num(row[idx.iLoan]) : 0,
        loanBal: idx.iBal >= 0 ? num(row[idx.iBal]) : 0,
        monthOrder: ord,
      };

      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, rec);
        continue;
      }
      if (rec.monthOrder < prev.monthOrder) {
        const carry = { ...prev };
        if ((!carry.salary || carry.salary <= 0) && rec.salary > 0) carry.salary = rec.salary;
        if (!carry.position && rec.position) carry.position = rec.position;
        merged.set(key, carry);
        continue;
      }
      if (rec.monthOrder >= prev.monthOrder) {
        const next = { ...rec };
        if ((!next.salary || next.salary <= 0) && prev.salary > 0) next.salary = prev.salary;
        if (!next.position && prev.position) next.position = prev.position;
        merged.set(key, next);
      }
    }
  }

  return [...merged.values()].filter((r) => r.salary > 0);
}

/**
 * SACCO overview KPIs + charts from the bundled salary workbook (month sheets).
 * - Total savings: sum of each month sheet’s “saving” column (payroll SACCO deductions), all months in file.
 * - Members / loans: merged roster (latest month wins per person); loan balance column binned like the Loans tab.
 * - Savings growth bars: last 6 calendar months vs sums from month-named sheets for `year`.
 *
 * @param {string} filePath absolute path to .xlsx
 * @param {number} [year] calendar year for YYYY-MM keys (default: current year)
 */
function aggregateSaccoOverviewFromXlsx(filePath, year = new Date().getFullYear()) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: 'file_not_found', filePath: filePath || '' };
  }
  const y = Number(year);
  const calYear = Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();

  try {
    const wb = XLSX.readFile(filePath);
    const monthlyTotals = new Map();
    /** nameLower|phoneDigits → sum of “saving” across all month sheets (payroll SACCO deductions). */
    const personSavingsAccum = new Map();

    for (const sheetName of wb.SheetNames) {
      if (!String(sheetName || '').trim()) continue;
      if (/^sheet\s*\d+$/i.test(String(sheetName).trim())) continue;

      const monthNum = sheetMonthNumber(sheetName);
      if (!monthNum) continue;

      const ym = `${calYear}-${String(monthNum).padStart(2, '0')}`;
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
      if (!rows.length || !rows[0]) continue;
      const h = rows[0].map((x) => String(x ?? '').trim().toLowerCase());
      const idx = findSalaryColumnIndices(h);
      if (idx.iName < 0 || idx.iSal < 0) continue;

      let sum = 0;
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const name = normName(row[idx.iName]);
        if (!name || isNonPersonRowName(name)) continue;
        const contact = String(row[idx.iContact] ?? '').trim();
        const sv = idx.iSaving >= 0 ? num(row[idx.iSaving]) : 0;
        sum += sv;
        const pkey = `${name.toLowerCase()}|${onlyDigits(contact)}`;
        personSavingsAccum.set(pkey, (personSavingsAccum.get(pkey) || 0) + sv);
      }
      monthlyTotals.set(ym, (monthlyTotals.get(ym) || 0) + sum);
    }

    const personSavings = Array.from(personSavingsAccum.entries()).map(([k, cumulativeSaving]) => {
      const pipe = k.indexOf('|');
      const nameKey = pipe >= 0 ? k.slice(0, pipe) : k;
      const phoneDigits = pipe >= 0 ? k.slice(pipe + 1) : '';
      return { nameKey, phoneDigits, cumulativeSaving };
    });

    const merged = readMergedRosterRecords(filePath);
    let outstandingLoanBalance = 0;
    let activeLoans = 0;
    const loanBins = { under1: 0, m1to3: 0, m3to5: 0, over5: 0 };
    for (const rec of merged) {
      const b = Number(rec.loanBal) || 0;
      outstandingLoanBalance += b;
      if (b > 0) activeLoans++;
      const m = b / 1_000_000;
      if (b <= 0) continue;
      if (m < 1) loanBins.under1++;
      else if (m < 3) loanBins.m1to3++;
      else if (m < 5) loanBins.m3to5++;
      else loanBins.over5++;
    }

    let totalSavingsPayroll = 0;
    for (const v of monthlyTotals.values()) totalSavingsPayroll += v;

    const now = new Date();
    const savKeys = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      savKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const savSeries = savKeys.map((k) => ({ key: k, value: monthlyTotals.get(k) || 0 }));
    const maxLoanBin = Math.max(...Object.values(loanBins), 1);

    const personLoanBalances = merged.map((rec) => ({
      nameKey: normName(rec.name).toLowerCase(),
      phoneDigits: onlyDigits(rec.contact),
      loanBalance: Number(rec.loanBal) || 0,
    }));

    return {
      ok: true,
      filePath,
      year: calYear,
      members: merged.length,
      totalSavingsPayroll,
      outstandingLoanBalance,
      activeLoans,
      loanBins,
      maxLoanBin,
      savSeries,
      monthSheetsFound: monthlyTotals.size,
      personSavings,
      personLoanBalances,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = {
  XLSX,
  normName,
  onlyDigits,
  num,
  sheetMonthNumber,
  sheetMonthOrder,
  findSalaryColumnIndices,
  isNonPersonRowName,
  readMergedRosterRecords,
  aggregateSaccoOverviewFromXlsx,
};
