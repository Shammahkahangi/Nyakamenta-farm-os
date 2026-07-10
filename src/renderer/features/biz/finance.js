// ============================================================
// finance.js — Farm accounting UI (aligned with Growth Gateway Accounting layout)
// Light dashboard: KPIs, charts, sub-tabs — UGX ledger from SQLite.
// ============================================================
import { dataService, FINANCE_CATEGORIES, FINANCE_COST_CENTERS, financeCategoriesForCostCenter } from '../../services/dataService.js';
import { showToast } from '../../utils/toast.js';
import { downloadCSV } from '../core/reports.js';
import {
  buildFarmFinanceDocx,
  buildVisualReportExportHtml,
  downloadBlob,
  exportStamp,
  openHtmlInPrintWindow,
} from './financeExport.js';
import { openAddDispatchModal } from './domesticDispatch.js';

const SUBTAB_KEY = 'farmFinanceAccountingTab';
const OVERVIEW_RANGE_KEY = 'farmFinanceOverviewRange';

/** Run once per app session so derived module rows sync into finance_items before first ledger fetch. */
let derivedFarmLedgerEnsured = false;

const PIE_COLORS = ['#1e3a5f', '#2563eb', '#0ea5e9', '#38bdf8', '#7dd3fc', '#c7843a', '#d97706', '#f59e0b', '#16a34a', '#15803d'];

/** Gateway-style farm financial reports (single-entry UGX ledger + SACCO loans where relevant). */
const ACCOUNTING_SUBTABS = [
  { id: 'overview', label: 'Financial Overview' },
  { id: 'general', label: 'General Report' },
  { id: 'income', label: 'Comprehensive Income' },
  { id: 'position', label: 'Financial Position' },
  { id: 'cashflow', label: 'Cashflow Statement' },
  { id: 'equity', label: 'Equity Statement' },
  { id: 'analysis', label: 'Financial Analysis' },
  { id: 'cashbook', label: 'Cash Book' },
  { id: 'trial', label: 'Trial Balance' },
];

const LEGACY_SUBTAB = {
  field: 'income',
  labor: 'income',
  inputs: 'income',
  transport: 'income',
  revenue: 'income',
  journal: 'cashbook',
  loans: 'overview',
  aging: 'overview',
};

function migrateLegacySubtab(id) {
  return LEGACY_SUBTAB[id] || id;
}

const PM_LABEL = {
  cash: 'Cash',
  mobile_money: 'Mobile money',
  bank_transfer: 'Bank',
};

function pmDisplay(row) {
  const key = dataService.normalizePaymentMethod(row.payment_method);
  return PM_LABEL[key] || 'Cash';
}

/** Gateway-style short UGX formatter */
function fmt(n) {
  const x = Number(n) || 0;
  if (x >= 1_000_000) return `UGX ${(x / 1_000_000).toFixed(1)}M`;
  if (x >= 1_000) return `UGX ${(x / 1_000).toFixed(0)}K`;
  return `UGX ${Math.round(x).toLocaleString()}`;
}

function itemsInDateRange(items, fromIso, toIso) {
  return (items || []).filter((i) => {
    const ds = rowDateStr(i);
    return ds && ds >= fromIso && ds <= toIso;
  });
}

function ledgerCsvRows(items) {
  return items.map((row) => ({
    Date: row.date || '',
    Type: row.type || '',
    'Attributed to': dataService.costCenterLabel(row.cost_center),
    Category: row.category || '',
    Description: row.description || '',
    Method: pmDisplay(row),
    Amount_UGX: Math.round(Number(row.amount) || 0),
    Source: row.source_module || 'manual',
  }));
}

function monthKey(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelShort(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function buildLastNMonthKeys(n) {
  const keys = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function aggregateMonthly(items) {
  const keys = buildLastNMonthKeys(13);
  const map = {};
  keys.forEach((k) => {
    map[k] = { revenue: 0, expenses: 0, month: monthLabelShort(k) };
  });
  for (const row of items) {
    const k = monthKey(row.date);
    if (!k || !map[k]) continue;
    const amt = Number(row.amount) || 0;
    if (row.type === 'Revenue') map[k].revenue += amt;
    else if (row.type === 'Expense') map[k].expenses += amt;
  }
  return keys.map((k) => ({
    month: map[k].month,
    revenue: map[k].revenue,
    expenses: map[k].expenses,
    netProfit: map[k].revenue - map[k].expenses,
  }));
}

function sumInMonth(items, yyyymm, type) {
  return items
    .filter((i) => monthKey(i.date) === yyyymm && i.type === type)
    .reduce((s, i) => s + Number(i.amount || 0), 0);
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isoDateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Default period for Farm finance (overview KPIs, cash book, trial balance): YTD so payroll mirrors (month-end dates) aren’t hidden vs Owner Overview activity. */
function defaultRangeYtd() {
  const d = new Date();
  return {
    from: `${d.getFullYear()}-01-01`,
    to: isoDateLocal(d),
  };
}

function loadOverviewRange() {
  try {
    const raw = sessionStorage.getItem(OVERVIEW_RANGE_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j.from && j.to && String(j.from) <= String(j.to)) return { from: j.from, to: j.to };
    }
  } catch {
    /* ignore */
  }
  return defaultRangeYtd();
}

function saveOverviewRange(r) {
  try {
    sessionStorage.setItem(OVERVIEW_RANGE_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

/** YYYY-MM-DD string compare is valid for inclusive bounds */
function rowDateStr(row) {
  return String(row.date || '').slice(0, 10);
}

function sumInRange(items, from, to, type) {
  return items
    .filter((i) => {
      const ds = rowDateStr(i);
      return ds >= from && ds <= to && i.type === type;
    })
    .reduce((s, i) => s + Number(i.amount || 0), 0);
}

function totalsInRange(items, from, to) {
  let revenue = 0;
  let expenses = 0;
  for (const row of items) {
    const ds = rowDateStr(row);
    if (ds < from || ds > to) continue;
    const amt = Number(row.amount || 0);
    if (row.type === 'Revenue') revenue += amt;
    else if (row.type === 'Expense') expenses += amt;
  }
  return { revenue, expenses, netProfit: revenue - expenses };
}

function addDaysIso(iso, deltaDays) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return isoDateLocal(d);
}

function previousPeriodSameLength(from, to) {
  const df = new Date(`${from}T12:00:00`);
  const dt = new Date(`${to}T12:00:00`);
  const days = Math.round((dt - df) / 86400000) + 1;
  const prevEnd = addDaysIso(from, -1);
  const prevStart = addDaysIso(prevEnd, -(days - 1));
  return { from: prevStart, to: prevEnd };
}

function monthKeysBetweenInclusive(fromStr, toStr, maxMonths = 24) {
  const from = new Date(`${fromStr.slice(0, 10)}T12:00:00`);
  const to = new Date(`${toStr.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];
  let y = from.getFullYear();
  let m = from.getMonth();
  const endY = to.getFullYear();
  const endM = to.getMonth();
  const keys = [];
  while (keys.length < maxMonths && (y < endY || (y === endY && m <= endM))) {
    keys.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return keys;
}

function aggregateMonthlyForKeys(items, keys) {
  const map = {};
  keys.forEach((k) => {
    map[k] = { revenue: 0, expenses: 0, month: monthLabelShort(k) };
  });
  for (const row of items) {
    const k = monthKey(row.date);
    if (!k || !map[k]) continue;
    const amt = Number(row.amount) || 0;
    if (row.type === 'Revenue') map[k].revenue += amt;
    else if (row.type === 'Expense') map[k].expenses += amt;
  }
  return keys.map((k) => ({
    month: map[k].month,
    revenue: map[k].revenue,
    expenses: map[k].expenses,
    netProfit: map[k].revenue - map[k].expenses,
  }));
}

function expenseCategoriesInRange(items, from, to) {
  const map = {};
  for (const row of items) {
    const ds = rowDateStr(row);
    if (ds < from || ds > to || row.type !== 'Expense') continue;
    const cat = row.category || 'Other';
    map[cat] = (map[cat] || 0) + Number(row.amount || 0);
  }
  return Object.entries(map)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function formatRangeHint(from, to) {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  const o = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${a.toLocaleDateString('en-GB', o)} – ${b.toLocaleDateString('en-GB', o)}`;
}

function overviewRangePresets(which) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = isoDateLocal(now);
  if (which === 'this_month') {
    return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: today };
  }
  if (which === 'last_month') {
    const d0 = new Date(y, m - 1, 1);
    const d1 = new Date(y, m, 0);
    return { from: isoDateLocal(d0), to: isoDateLocal(d1) };
  }
  if (which === 'ytd') {
    return { from: `${y}-01-01`, to: today };
  }
  if (which === 'last12') {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 11);
    start.setDate(1);
    return { from: isoDateLocal(start), to: today };
  }
  if (which === 'all') {
    return { from: '1970-01-01', to: today };
  }
  /** First → last calendar day of the current month (includes month-end–dated salary). */
  if (which === 'full_month') {
    const d0 = new Date(y, m, 1);
    const d1 = new Date(y, m + 1, 0);
    return { from: isoDateLocal(d0), to: isoDateLocal(d1) };
  }
  return defaultRangeYtd();
}

function prevYearMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function expenseCategoriesThisMonth(items, ym) {
  const map = {};
  for (const row of items) {
    if (monthKey(row.date) !== ym || row.type !== 'Expense') continue;
    const cat = row.category || 'Other';
    map[cat] = (map[cat] || 0) + Number(row.amount || 0);
  }
  return Object.entries(map)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function ytdTotals(items) {
  const y = new Date().getFullYear();
  let revenue = 0;
  let expenses = 0;
  for (const row of items) {
    const d = new Date(row.date);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== y) continue;
    const amt = Number(row.amount) || 0;
    if (row.type === 'Revenue') revenue += amt;
    else if (row.type === 'Expense') expenses += amt;
  }
  return { revenue, expenses, netProfit: revenue - expenses };
}

function expenseGroupForCategory(catName) {
  const found = FINANCE_CATEGORIES.Expense.find((c) => c.name === catName);
  if (found?.group) return found.group;
  const farmGroups = new Set((FINANCE_CATEGORIES.Expense || []).map((c) => c.group));
  if (farmGroups.has(catName)) return catName;
  const houseCats = financeCategoriesForCostCenter('ruhunga_farm_house').Expense || [];
  const houseFound = houseCats.find((c) => c.name === catName || c.group === catName);
  if (houseFound) return houseFound.group || catName;
  return 'Other';
}

function rowCostCenter(row) {
  return dataService.normalizeCostCenter(row?.cost_center);
}

function sumInRangeForCenter(items, fromIso, toIso, type, costCenter) {
  let total = 0;
  for (const row of items) {
    if (row.type !== type) continue;
    if (rowCostCenter(row) !== costCenter) continue;
    const ds = rowDateStr(row);
    if (!ds || ds < fromIso || ds > toIso) continue;
    total += Number(row.amount) || 0;
  }
  return total;
}

function parseRowDate(row) {
  const d = new Date(row.date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Net cash position from all ledger lines strictly before `from` (chronological, by id). */
function openingBalanceBeforeDate(items, fromIso) {
  const sorted = [...items]
    .filter((i) => parseRowDate(i))
    .sort((a, b) => {
      const c = String(a.date).localeCompare(String(b.date));
      return c !== 0 ? c : Number(a.id || 0) - Number(b.id || 0);
    });
  let bal = 0;
  for (const item of sorted) {
    const ds = rowDateStr(item);
    if (ds >= fromIso) break;
    const amt = Number(item.amount || 0);
    if (item.type === 'Revenue') bal += amt;
    else if (item.type === 'Expense') bal -= amt;
  }
  return bal;
}

function itemsWithDateInRange(items, fromIso, toIso) {
  return items.filter((i) => {
    if (!parseRowDate(i)) return false;
    const ds = rowDateStr(i);
    return ds >= fromIso && ds <= toIso;
  });
}

function itemsInYear(items, year) {
  return items.filter((row) => {
    const d = parseRowDate(row);
    return d && d.getFullYear() === year;
  });
}

function ytdWindow() {
  const y = new Date().getFullYear();
  return { year: y, from: `${y}-01-01`, to: `${y}-12-31` };
}

function loanLikeLedgerLine(row) {
  const s = `${row.category || ''} ${row.description || ''}`.toLowerCase();
  return /loan|borrowing|lending|overdraft|principal|credit\s*facility/.test(s);
}

function aggregateLoanRows(loans, repayments) {
  const repBy = {};
  for (const r of repayments) {
    const lid = r.loan_id;
    if (!lid) continue;
    repBy[lid] = (repBy[lid] || 0) + Number(r.amount || 0);
  }
  return loans.map((lo) => {
    const principal = Number(lo.principal ?? lo.amount ?? 0);
    const repaid = repBy[lo.id] || 0;
    return { ...lo, principal, repaid, outstanding: Math.max(0, principal - repaid) };
  });
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function reportBlurb(text) {
  return `<p class="fa-blurb">${escHtml(text)}</p>`;
}

function renderComprehensiveIncomeHtml(items, year) {
  const slice = itemsInYear(items, year);
  const revBy = {};
  const expBy = {};
  for (const row of slice) {
    const amt = Number(row.amount || 0);
    const cat = row.category || 'Uncategorised';
    if (row.type === 'Revenue') revBy[cat] = (revBy[cat] || 0) + amt;
    else if (row.type === 'Expense') expBy[cat] = (expBy[cat] || 0) + amt;
  }
  const totalRev = Object.values(revBy).reduce((a, b) => a + b, 0);
  const totalExp = Object.values(expBy).reduce((a, b) => a + b, 0);
  const net = totalRev - totalExp;

  const revRows = Object.entries(revBy)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([cat, v]) => `
    <tr class="fa-tr">
      <td class="fa-td">${escHtml(cat)}</td>
      <td class="fa-td-num fa-num-rev">${dataService.formatCurrency(v)}</td>
    </tr>`
    )
    .join('');
  const expRows = Object.entries(expBy)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([cat, v]) => `
    <tr class="fa-tr">
      <td class="fa-td">${escHtml(cat)}</td>
      <td class="fa-td-num fa-num-exp">${dataService.formatCurrency(v)}</td>
    </tr>`
    )
    .join('');

  return `
    ${reportBlurb(`Statement of comprehensive income (P&L) for calendar year ${year} — estate farm ledger.`)}
    <div class="fa-card fa-card-pad0">
      <div class="fa-card-head">
        <div>
          <div class="fa-card-title">Revenue</div>
          <div class="fa-card-desc">By category</div>
        </div>
      </div>
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead><tr><th>Category</th><th class="fa-th-num">Amount</th></tr></thead>
          <tbody>
            ${revRows || `<tr><td colspan="2" class="fa-td-empty">No revenue this year.</td></tr>`}
            <tr class="fa-tr" style="font-weight:700;border-top:2px solid var(--fa-rule);">
              <td class="fa-td">Total revenue</td>
              <td class="fa-td-num fa-num-rev">${dataService.formatCurrency(totalRev)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="fa-card fa-card-pad0">
      <div class="fa-card-head">
        <div>
          <div class="fa-card-title">Expenses</div>
          <div class="fa-card-desc">By category</div>
        </div>
      </div>
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead><tr><th>Category</th><th class="fa-th-num">Amount</th></tr></thead>
          <tbody>
            ${expRows || `<tr><td colspan="2" class="fa-td-empty">No expenses this year.</td></tr>`}
            <tr class="fa-tr" style="font-weight:700;border-top:2px solid var(--fa-rule);">
              <td class="fa-td">Total expenses</td>
              <td class="fa-td-num fa-num-exp">${dataService.formatCurrency(totalExp)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="fa-kpi-grid">
      <div class="fa-kpi ${net >= 0 ? 'fa-kpi-blue' : 'fa-kpi-orange'}">
        <div class="fa-kpi-h">Net result (${year})</div>
        <div class="fa-kpi-v">${dataService.formatCurrency(Math.abs(net))}</div>
        <div class="fa-kpi-f fa-kpi-f-muted">${net >= 0 ? 'Net profit' : 'Net loss'}</div>
      </div>
    </div>
  `;
}

function renderFinancialPositionHtml(summary, saccoOutstanding, totalAcres) {
  const { totalRevenue, totalExpenses, netProfit } = summary;
  const impliedCash = netProfit;
  const netWorth = impliedCash - saccoOutstanding;
  return `
    ${reportBlurb(
      'Simplified position from the single-entry farm ledger: no fixed-asset register. SACCO outstanding is shown as a liability proxy. Implied cash assumes opening balance zero and all lines settled.'
    )}
    <div class="fa-card fa-card-pad0">
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead>
            <tr><th>Line</th><th class="fa-th-num">UGX</th></tr>
          </thead>
          <tbody>
            <tr class="fa-tr"><td class="fa-td">Cumulative farm revenue (all time)</td><td class="fa-td-num fa-num-rev">${dataService.formatCurrency(totalRevenue)}</td></tr>
            <tr class="fa-tr"><td class="fa-td">Cumulative farm expenses (all time)</td><td class="fa-td-num fa-num-exp">${dataService.formatCurrency(totalExpenses)}</td></tr>
            <tr class="fa-tr" style="font-weight:700;"><td class="fa-td">Retained result (ledger)</td><td class="fa-td-num">${dataService.formatCurrency(Math.abs(netProfit))} ${netProfit >= 0 ? '(profit)' : '(loss)'}</td></tr>
            <tr class="fa-tr"><td class="fa-td">Implied net cash position (no opening balance)</td><td class="fa-td-num">${dataService.formatCurrency(impliedCash)}</td></tr>
            <tr class="fa-tr"><td class="fa-td">Less: SACCO loans outstanding (staff)</td><td class="fa-td-num fa-num-exp">−${dataService.formatCurrency(saccoOutstanding)}</td></tr>
            <tr class="fa-tr" style="font-weight:700;border-top:2px solid var(--fa-rule);">
              <td class="fa-td">Approx. net farm position</td>
              <td class="fa-td-num ${netWorth >= 0 ? 'fa-num-rev' : 'fa-num-exp'}">${dataService.formatCurrency(netWorth)}</td>
            </tr>
            <tr class="fa-tr"><td class="fa-td">Registered estate acreage (reference)</td><td class="fa-td-num">${totalAcres.toFixed(1)} ac</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCashflowHtml(items, year) {
  const slice = itemsInYear(items, year);
  let opRev = 0;
  let opExp = 0;
  let invExp = 0;
  let finRev = 0;
  let finExp = 0;

  for (const row of slice) {
    const amt = Number(row.amount || 0);
    if (row.type === 'Revenue') {
      const cat = String(row.category || '');
      if (/grant|subsidy/i.test(cat)) finRev += amt;
      else opRev += amt;
    } else if (row.type === 'Expense') {
      const g = expenseGroupForCategory(row.category || '');
      if (g === 'Infrastructure') invExp += amt;
      else if (loanLikeLedgerLine(row)) finExp += amt;
      else opExp += amt;
    }
  }

  const netOp = opRev - opExp;
  const netInv = -invExp;
  const netFin = finRev - finExp;
  const netChange = netOp + netInv + netFin;

  const row = (label, val, cls) => `
    <tr class="fa-tr">
      <td class="fa-td">${escHtml(label)}</td>
      <td class="fa-td-num ${cls}">${dataService.formatCurrency(Math.abs(val))}</td>
      <td class="fa-td">${val >= 0 ? 'Inflow / saving' : 'Outflow'}</td>
    </tr>`;

  return `
    ${reportBlurb(
      `Indirect-style cashflow for ${year}: operating = most farm revenue and expenses; investing = infrastructure; financing = grants and loan-tagged lines.`
    )}
    <div class="fa-card fa-card-pad0">
      <div class="fa-card-head">
        <div>
          <div class="fa-card-title">Operating activities</div>
          <div class="fa-card-desc">Farm sales &amp; running costs (excl. infrastructure &amp; loan-tagged)</div>
        </div>
      </div>
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead><tr><th>Line</th><th class="fa-th-num">UGX</th><th></th></tr></thead>
          <tbody>
            ${row('Cash from revenue (operating)', opRev, 'fa-num-rev')}
            ${row('Cash paid for expenses (operating)', -opExp, 'fa-num-exp')}
            <tr class="fa-tr" style="font-weight:700;border-top:1px solid var(--fa-rule);">
              <td class="fa-td">Net operating cash</td>
              <td class="fa-td-num ${netOp >= 0 ? 'fa-num-rev' : 'fa-num-exp'}">${dataService.formatCurrency(Math.abs(netOp))}</td>
              <td class="fa-td"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="fa-card fa-card-pad0">
      <div class="fa-card-head">
        <div>
          <div class="fa-card-title">Investing activities</div>
          <div class="fa-card-desc">Infrastructure &amp; equipment categories</div>
        </div>
      </div>
      <div class="fa-table-wrap">
        <table class="fa-table">
          <tbody>
            ${row('Infrastructure & equipment spend', netInv, netInv >= 0 ? 'fa-num-rev' : 'fa-num-exp')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="fa-card fa-card-pad0">
      <div class="fa-card-head">
        <div>
          <div class="fa-card-title">Financing activities</div>
          <div class="fa-card-desc">Grants (revenue) and loan-related ledger lines</div>
        </div>
      </div>
      <div class="fa-table-wrap">
        <table class="fa-table">
          <tbody>
            ${row('Grants & other (Other revenue — grants)', finRev, 'fa-num-rev')}
            ${row('Loan-related payments (expense)', -finExp, 'fa-num-exp')}
            <tr class="fa-tr" style="font-weight:700;">
              <td class="fa-td">Net financing cash</td>
              <td class="fa-td-num ${netFin >= 0 ? 'fa-num-rev' : 'fa-num-exp'}">${dataService.formatCurrency(Math.abs(netFin))}</td>
              <td class="fa-td"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="fa-kpi-grid">
      <div class="fa-kpi fa-kpi-amber">
        <div class="fa-kpi-h">Net change in cash (${year})</div>
        <div class="fa-kpi-v">${dataService.formatCurrency(Math.abs(netChange))}</div>
        <div class="fa-kpi-f fa-kpi-f-muted">${netChange >= 0 ? 'Surplus' : 'Deficit'} (single-entry proxy)</div>
      </div>
    </div>
  `;
}

function renderEquityHtml(items, year) {
  const slice = itemsInYear(items, year);
  let rev = 0;
  let exp = 0;
  for (const row of slice) {
    const amt = Number(row.amount || 0);
    if (row.type === 'Revenue') rev += amt;
    else if (row.type === 'Expense') exp += amt;
  }
  const profit = rev - exp;
  const allTime = items.reduce(
    (acc, row) => {
      const amt = Number(row.amount || 0);
      if (row.type === 'Revenue') acc.rev += amt;
      else if (row.type === 'Expense') acc.exp += amt;
      return acc;
    },
    { rev: 0, exp: 0 }
  );
  const retained = allTime.rev - allTime.exp;

  return `
    ${reportBlurb('Owner equity movement implied by the ledger (no formal share capital). Opening balance assumed zero.')}
    <div class="fa-card fa-card-pad0">
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead><tr><th>Line</th><th class="fa-th-num">UGX</th></tr></thead>
          <tbody>
            <tr class="fa-tr"><td class="fa-td">Opening retained earnings (assumed)</td><td class="fa-td-num">0</td></tr>
            <tr class="fa-tr"><td class="fa-td">Profit for ${year}</td><td class="fa-td-num ${profit >= 0 ? 'fa-num-rev' : 'fa-num-exp'}">${dataService.formatCurrency(Math.abs(profit))}</td></tr>
            <tr class="fa-tr" style="font-weight:700;border-top:2px solid var(--fa-rule);">
              <td class="fa-td">Closing retained earnings (${year})</td>
              <td class="fa-td-num">${dataService.formatCurrency(profit)}</td>
            </tr>
            <tr class="fa-tr"><td class="fa-td" colspan="2" style="padding-top:12px;font-size:11px;color:var(--fa-text-2);">All-time cumulative retained result: ${dataService.formatCurrency(retained)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAnalysisHtml(items, blocks, batches, year) {
  const slice = itemsInYear(items, year);
  let rev = 0;
  let exp = 0;
  let fieldExp = 0;
  let labourExp = 0;
  for (const row of slice) {
    const amt = Number(row.amount || 0);
    if (row.type === 'Revenue') rev += amt;
    else if (row.type === 'Expense') {
      exp += amt;
      const g = expenseGroupForCategory(row.category || '');
      if (g === 'Field Operations' || g === 'Processing') fieldExp += amt;
      if (g === 'Labour') labourExp += amt;
    }
  }
  const net = rev - exp;
  const totalAc = blocks.reduce((s, b) => s + Number(b.acres || 0), 0);
  const kgOut = batches.reduce((s, b) => s + Number(b.kgOut || 0), 0);
  const netMargin = rev > 0 ? (net / rev) * 100 : 0;
  const fieldRatio = rev > 0 ? (fieldExp / rev) * 100 : 0;
  const labourRatio = rev > 0 ? (labourExp / rev) * 100 : 0;
  const ugxPerKg = kgOut > 0 ? net / kgOut : 0;
  const ugxPerAcre = totalAc > 0 ? net / totalAc : 0;

  const row = (label, valueCell, basis) => `
    <tr class="fa-tr">
      <td class="fa-td">${escHtml(label)}</td>
      <td class="fa-td-num" style="font-weight:600;">${valueCell}</td>
      <td class="fa-td" style="font-size:11px;color:var(--fa-text-2);">${escHtml(basis)}</td>
    </tr>`;

  return `
    ${reportBlurb(`Ratios for ${year}: uses harvest batches (green kg out) and registered block acreage.`)}
    <div class="fa-card fa-card-pad0">
      <div class="fa-card-head">
        <div>
          <div class="fa-card-title">Financial ratios</div>
          <div class="fa-card-desc">${year} ledger, harvest batches, block acreage</div>
        </div>
      </div>
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th class="fa-th-num">Value</th>
              <th>How it is calculated</th>
            </tr>
          </thead>
          <tbody>
            ${row('Net margin', `${netMargin.toFixed(1)}%`, 'Net result ÷ revenue')}
            ${row(
              'Field & processing % of revenue',
              `${fieldRatio.toFixed(1)}%`,
              'Field Operations + Processing expense groups ÷ revenue'
            )}
            ${row('Labour % of revenue', `${labourRatio.toFixed(1)}%`, 'Labour expense group ÷ revenue')}
            ${row(
              'Net result per kg (green out)',
              dataService.formatCurrency(ugxPerKg),
              `${kgOut.toLocaleString()} kg out (harvest batches)`
            )}
            ${row(
              'Net result per acre',
              dataService.formatCurrency(ugxPerAcre),
              `${totalAc.toFixed(1)} ac registered on blocks`
            )}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCashBookHtml(items, from, to) {
  const rf = String(from || '').slice(0, 10);
  const rt = String(to || '').slice(0, 10);
  const opening = openingBalanceBeforeDate(items, rf);
  const sorted = [...items]
    .filter((i) => parseRowDate(i))
    .sort((a, b) => {
      const c = String(a.date).localeCompare(String(b.date));
      return c !== 0 ? c : Number(a.id || 0) - Number(b.id || 0);
    });
  let bal = opening;
  const rows = sorted
    .filter((item) => {
      const ds = rowDateStr(item);
      return ds >= rf && ds <= rt;
    })
    .map((item) => {
      const amt = Number(item.amount || 0);
      if (item.type === 'Revenue') bal += amt;
      else if (item.type === 'Expense') bal -= amt;
      return `
    <tr class="fa-tr">
      <td class="fa-td">${escHtml(item.date)}</td>
      <td class="fa-td">${escHtml(dataService.costCenterLabel(item.cost_center))}</td>
      <td class="fa-td-desc">${escHtml(item.description || '—')}</td>
      <td class="fa-td">${pmDisplay(item)}</td>
      <td class="fa-td-num ${item.type === 'Revenue' ? 'fa-num-rev' : 'fa-num-exp'}">
        ${item.type === 'Revenue' ? '+' : '−'}${dataService.formatLedgerUgx(amt)}
      </td>
      <td class="fa-td-num">${dataService.formatCurrency(bal)}</td>
    </tr>`;
    })
    .join('');

  const periodNote = formatRangeHint(rf, rt);
  const openingLine = `<p style="font-size:12px;color:var(--text-secondary);margin:0 0 10px 0;">${escHtml(
    periodNote
  )} · Opening balance at start of period: <strong>${dataService.formatCurrency(opening)}</strong></p>`;
    const rangeHint =
    '<p style="font-size:11px;color:var(--text-muted);margin:0 0 12px 0;line-height:1.45;">Only lines whose <strong>ledger date</strong> falls between <strong>From</strong> and <strong>To</strong> (inclusive) appear here. Payroll expenses mirrored from runs are dated at <strong>month-end of the pay run</strong> (e.g. February payroll → last day of February). If lines appear on Owner Overview but not here, widen the period (e.g. <strong>YTD</strong> or <strong>All time</strong>) or extend <strong>To</strong> past that month-end.</p>';

  return `
    ${reportBlurb(
      'Estate ledger in UGX: coffee operations and Ruhunga farm house (tagged separately), plus lodge flows and mirrored field costs. Rows and running balance respect the date range in the bar above; balance includes net cash from all lines before the range start.'
    )}
    <div class="fa-report-preamble">
    ${openingLine}
    ${rangeHint}
    </div>
    <div class="fa-card fa-card-pad0">
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead>
            <tr>
              <th>Date</th><th>Attributed to</th><th>Description</th><th>Method</th><th class="fa-th-num">Movement</th><th class="fa-th-num">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows ||
              `<tr><td colspan="6" class="fa-td-empty">No ledger lines in this date range — widen the period above or add entries.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function contractDateStr(c) {
  const raw = String(c?.etd || c?.date || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

/** All-activity farm report for the selected period (ledger + dispatches + production). */
function renderGeneralReportHtml({ items, contracts, blocks, batches, from, to }) {
  const inRange = itemsWithDateInRange(items, from, to);
  const rev = sumInRange(items, from, to, 'Revenue');
  const exp = sumInRange(items, from, to, 'Expense');
  const net = rev - exp;
  const farmExp = sumInRangeForCenter(items, from, to, 'Expense', 'farm');
  const houseExp = sumInRangeForCenter(items, from, to, 'Expense', 'ruhunga_farm_house');
  const farmRev = sumInRangeForCenter(items, from, to, 'Revenue', 'farm');
  const houseRev = sumInRangeForCenter(items, from, to, 'Revenue', 'ruhunga_farm_house');

  const bySource = {};
  for (const row of inRange) {
    const src = String(row.source_module || 'manual').trim() || 'manual';
    if (!bySource[src]) bySource[src] = { revenue: 0, expense: 0, count: 0 };
    const amt = Number(row.amount) || 0;
    bySource[src].count += 1;
    if (row.type === 'Revenue') bySource[src].revenue += amt;
    else if (row.type === 'Expense') bySource[src].expense += amt;
  }
  const sourceRows = Object.entries(bySource)
    .sort((a, b) => b[1].count - a[1].count)
    .map(
      ([src, v]) => `
    <tr class="fa-tr">
      <td class="fa-td mono">${escHtml(src)}</td>
      <td class="fa-td-num">${v.count}</td>
      <td class="fa-td-num fa-num-rev">${dataService.formatCurrency(v.revenue)}</td>
      <td class="fa-td-num fa-num-exp">${dataService.formatCurrency(v.expense)}</td>
    </tr>`
    )
    .join('');

  const dispatches = (contracts || []).filter((c) => {
    const ds = contractDateStr(c);
    return ds && ds >= from && ds <= to;
  });
  const dispatchKg = dispatches.reduce((s, c) => s + Number(c.netKg || 0), 0);
  const dispatchVal = dispatches.reduce((s, c) => s + Number(c.totalValue || 0), 0);
  const dispatchRows = dispatches
    .slice()
    .sort((a, b) => String(b.etd || '').localeCompare(String(a.etd || '')))
    .slice(0, 40)
    .map(
      (c) => `
    <tr class="fa-tr">
      <td class="fa-td mono">${escHtml(c.id)}</td>
      <td class="fa-td">${escHtml(c.buyer || '—')}</td>
      <td class="fa-td">${escHtml(c.grade || '—')}</td>
      <td class="fa-td-num">${Number(c.netKg || 0).toLocaleString()} kg</td>
      <td class="fa-td-num fa-num-rev">${dataService.formatCurrency(c.totalValue)}</td>
      <td class="fa-td">${escHtml(c.etd || '—')}</td>
      <td class="fa-td">${escHtml(c.status || '—')}</td>
    </tr>`
    )
    .join('');

  const totalAcres = (blocks || []).reduce((s, b) => s + Number(b.acres || 0), 0);
  const cherryIn = (batches || []).reduce((s, b) => s + Number(b.kgIn || 0), 0);
  const greenOut = (batches || []).reduce((s, b) => s + Number(b.kgOut || 0), 0);

  const catMap = {};
  for (const row of inRange) {
    if (row.type !== 'Expense') continue;
    const cat = row.category || 'Other';
    catMap[cat] = (catMap[cat] || 0) + (Number(row.amount) || 0);
  }
  const topExp = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(
      ([cat, amt]) => `
    <tr class="fa-tr">
      <td class="fa-td">${escHtml(cat)}</td>
      <td class="fa-td-num fa-num-exp">${dataService.formatCurrency(amt)}</td>
    </tr>`
    )
    .join('');

  return `
    ${reportBlurb(
      `General farm activity for ${formatRangeHint(from, to)}: ledger movements (including automatic posts from dispatch, payroll, and field ops), domestic dispatches, and production snapshot. Dispatch sales post once into the farm ledger — there is no separate sales register tab.`
    )}
    <div class="fa-kpi-grid">
      <div class="fa-kpi fa-kpi-green">
        <div class="fa-kpi-h">Revenue</div>
        <div class="fa-kpi-v">${fmt(rev)}</div>
        <div class="fa-kpi-f fa-kpi-f-muted">${inRange.filter((i) => i.type === 'Revenue').length} lines</div>
      </div>
      <div class="fa-kpi fa-kpi-red">
        <div class="fa-kpi-h">Expenses</div>
        <div class="fa-kpi-v">${fmt(exp)}</div>
        <div class="fa-kpi-f fa-kpi-f-muted">${inRange.filter((i) => i.type === 'Expense').length} lines</div>
      </div>
      <div class="fa-kpi ${net >= 0 ? 'fa-kpi-blue' : 'fa-kpi-orange'}">
        <div class="fa-kpi-h">Net result</div>
        <div class="fa-kpi-v">${fmt(Math.abs(net))}<span class="fa-kpi-sub"> ${net >= 0 ? 'profit' : 'loss'}</span></div>
        <div class="fa-kpi-f fa-kpi-f-muted">Selected period</div>
      </div>
      <div class="fa-kpi fa-kpi-amber">
        <div class="fa-kpi-h">Domestic dispatch</div>
        <div class="fa-kpi-v">${fmt(dispatchVal)}</div>
        <div class="fa-kpi-f fa-kpi-f-muted">${dispatches.length} loads · ${dispatchKg.toLocaleString()} kg</div>
      </div>
    </div>
    <div class="fa-kpi-grid">
      <div class="fa-kpi fa-kpi-blue">
        <div class="fa-kpi-h">Estate (farm)</div>
        <div class="fa-kpi-v">${fmt(Math.abs(farmRev - farmExp))}</div>
        <div class="fa-kpi-f fa-kpi-f-muted">Rev ${fmt(farmRev)} · Exp ${fmt(farmExp)}</div>
      </div>
      <div class="fa-kpi fa-kpi-amber">
        <div class="fa-kpi-h">Ruhunga farm house</div>
        <div class="fa-kpi-v">${fmt(Math.abs(houseRev - houseExp))}</div>
        <div class="fa-kpi-f fa-kpi-f-muted">Rev ${fmt(houseRev)} · Exp ${fmt(houseExp)}</div>
      </div>
      <div class="fa-kpi fa-kpi-green">
        <div class="fa-kpi-h">Estate acreage</div>
        <div class="fa-kpi-v">${totalAcres.toFixed(1)} ac</div>
        <div class="fa-kpi-f fa-kpi-f-muted">${(blocks || []).length} blocks</div>
      </div>
      <div class="fa-kpi fa-kpi-blue">
        <div class="fa-kpi-h">Processing (all batches)</div>
        <div class="fa-kpi-v">${Math.round(greenOut).toLocaleString()} kg</div>
        <div class="fa-kpi-f fa-kpi-f-muted">Cherry in ${Math.round(cherryIn).toLocaleString()} kg</div>
      </div>
    </div>

    <div class="fa-card fa-card-pad0">
      <div class="fa-card-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div>
          <div class="fa-card-title">Domestic dispatches (period)</div>
          <div class="fa-card-desc">Green coffee sales — each load also posts revenue to the farm ledger</div>
        </div>
        <button type="button" class="fa-btn-primary" id="fa-add-dispatch">
          <span class="material-symbols-outlined">local_shipping</span> Record dispatch
        </button>
      </div>
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead>
            <tr>
              <th>ID</th><th>Receiver</th><th>Grade</th><th class="fa-th-num">Net kg</th>
              <th class="fa-th-num">Value</th><th>Date</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${
              dispatchRows ||
              `<tr><td colspan="7" class="fa-td-empty">No dispatches in this period. Use Record dispatch to log a sale.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="fa-card fa-card-pad0">
      <div class="fa-card-head">
        <div class="fa-card-title">Ledger activity by source</div>
        <div class="fa-card-desc">What fed the farm ledger in this period (automatic + manual)</div>
      </div>
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead>
            <tr>
              <th>Source</th><th class="fa-th-num">Lines</th>
              <th class="fa-th-num">Revenue</th><th class="fa-th-num">Expenses</th>
            </tr>
          </thead>
          <tbody>
            ${
              sourceRows ||
              `<tr><td colspan="4" class="fa-td-empty">No ledger activity in this period.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="fa-card fa-card-pad0">
      <div class="fa-card-head">
        <div class="fa-card-title">Top expense categories</div>
        <div class="fa-card-desc">Selected period</div>
      </div>
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead><tr><th>Category</th><th class="fa-th-num">Amount</th></tr></thead>
          <tbody>
            ${
              topExp ||
              `<tr><td colspan="2" class="fa-td-empty">No expenses in this period.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    ${renderJournalTable(
      [...inRange]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 60),
      'Recent ledger entries',
      'No ledger entries in this period.'
    )}
  `;
}

function renderTrialBalanceHtml(items) {
  const revBy = {};
  const expBy = {};
  for (const row of items) {
    const amt = Number(row.amount || 0);
    const cat = row.category || 'Uncategorised';
    if (row.type === 'Revenue') revBy[cat] = (revBy[cat] || 0) + amt;
    else if (row.type === 'Expense') expBy[cat] = (expBy[cat] || 0) + amt;
  }
  const sumDr = Object.values(expBy).reduce((a, b) => a + b, 0);
  const sumCr = Object.values(revBy).reduce((a, b) => a + b, 0);
  const net = sumCr - sumDr;

  const expRows = Object.keys(expBy)
    .sort()
    .map(
      (cat) => `
    <tr class="fa-tr">
      <td class="fa-td">${escHtml(cat)}</td>
      <td class="fa-td-num">${dataService.formatCurrency(expBy[cat])}</td>
      <td class="fa-td-num">—</td>
    </tr>`
    )
    .join('');
  const revRows = Object.keys(revBy)
    .sort()
    .map(
      (cat) => `
    <tr class="fa-tr">
      <td class="fa-td">${escHtml(cat)}</td>
      <td class="fa-td-num">—</td>
      <td class="fa-td-num fa-num-rev">${dataService.formatCurrency(revBy[cat])}</td>
    </tr>`
    )
    .join('');

  let balDr = 0;
  let balCr = 0;
  let balLabel = '';
  if (net > 0) {
    balLabel = 'Net profit (balancing)';
    balDr = net;
  } else if (net < 0) {
    balLabel = 'Net loss (balancing)';
    balCr = -net;
  }

  const totalDr = sumDr + balDr;
  const totalCr = sumCr + balCr;

  const balanceRow =
    net === 0
      ? ''
      : `
    <tr class="fa-tr" style="font-weight:700;border-top:2px solid var(--fa-rule);">
      <td class="fa-td">${balLabel}</td>
      <td class="fa-td-num">${balDr ? dataService.formatCurrency(balDr) : '—'}</td>
      <td class="fa-td-num">${balCr ? dataService.formatCurrency(balCr) : '—'}</td>
    </tr>`;

  return `
    ${reportBlurb(
      'Single-entry trial balance: expenses as debits, revenue as credits. A balancing line closes to net profit or loss.'
    )}
    <div class="fa-card fa-card-pad0">
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead>
            <tr><th>Account (category)</th><th class="fa-th-num">Debit</th><th class="fa-th-num">Credit</th></tr>
          </thead>
          <tbody>
            ${expRows}
            ${revRows}
            ${balanceRow}
            <tr class="fa-tr" style="font-weight:700;">
              <td class="fa-td">Totals</td>
              <td class="fa-td-num">${dataService.formatCurrency(totalDr)}</td>
              <td class="fa-td-num">${dataService.formatCurrency(totalCr)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

let chartJsPromise = null;

/** Resolves Chart.js from this module’s URL so dynamic import works under Electron `file://`. */
function chartJsAutoModuleHref() {
  return new URL('../../../../node_modules/chart.js/auto/auto.js', import.meta.url).href;
}

async function ensureChartJs() {
  if (window.Chart && window.__farmChartRegistered) return window.Chart;
  if (!chartJsPromise) {
    chartJsPromise = import(chartJsAutoModuleHref()).then((mod) => {
      const C = mod.default;
      if (!C) throw new Error('Chart.js failed to load (no default export).');
      window.Chart = C;
      window.__farmChartRegistered = true;
      return C;
    });
  }
  return chartJsPromise;
}

function waitNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function destroyChartsIn(root) {
  if (!root || !window.Chart) return;
  const C = window.Chart;
  root.querySelectorAll('canvas').forEach((canvas) => {
    const ch = C.getChart?.(canvas);
    if (ch) ch.destroy();
  });
}

async function openAddTransactionModal(onSaved) {
  const card = await dataService.getMaintenanceRateCard();
  const maintOpts =
    '<option value="">— None —</option>' +
    (card.lines || [])
      .map((l) => {
        const k = String(l.activity_key || '')
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;');
        const lab = String(l.label || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;');
        return `<option value="${k}">${lab}</option>`;
      })
      .join('');

  const today = new Date().toISOString().split('T')[0];
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  /** Group-level categories for the selected cost center. */
  const buildOptions = (type, costCenter) => {
    const cats = financeCategoriesForCostCenter(costCenter)[type] || [];
    const groups = [];
    const seen = new Set();
    cats.forEach((c) => {
      const g = c.group || 'Other';
      if (seen.has(g)) return;
      seen.add(g);
      groups.push(g);
    });
    return groups.map((g) => `<option value="${escHtml(g)}">${escHtml(g)}</option>`).join('');
  };

  const costCenterOpts = FINANCE_COST_CENTERS.map(
    (c) => `<option value="${c.id}">${escHtml(c.label)}</option>`
  ).join('');

  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Add transaction</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label">Attributed to</label>
          <select class="form-select" id="tx-cost-center">${costCenterOpts}</select>
          <p style="font-size:11px;color:var(--text-muted);margin:6px 0 0;line-height:1.4;">
            Estate (farm) = coffee operations. Ruhunga farm house = household / guest costs separate from the field.
          </p>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="tx-type">
              <option value="Expense">Expense</option>
              <option value="Revenue">Revenue</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Payment date</label>
            <input type="date" class="form-input" id="tx-date" value="${today}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" id="tx-category">${buildOptions('Expense', 'farm')}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Amount (UGX)</label>
            <input type="number" class="form-input" id="tx-amount" placeholder="0" min="0" step="1">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Payment method</label>
            <select class="form-select" id="tx-payment">
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile money</option>
              <option value="bank_transfer">Bank transfer</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <input type="text" class="form-input" id="tx-description" placeholder="e.g. Electricity — Ruhunga farm house">
          </div>
        </div>
        <div class="form-group" id="tx-maint-wrap" style="margin-top:4px;">
          <label class="form-label">Maintenance activity (optional)</label>
          <select class="form-select" id="tx-maint">${maintOpts}</select>
        </div>
        <p id="tx-error" style="color:#b91c1c;font-size:11px;display:none;margin-top:4px;"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="tx-cancel">Cancel</button>
        <button class="btn btn-primary" id="tx-save" style="background:#1e40af;border-color:#1e40af;">
          <span class="material-symbols-outlined">save</span> Save
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const typeSel = backdrop.querySelector('#tx-type');
  const catSel = backdrop.querySelector('#tx-category');
  const centerSel = backdrop.querySelector('#tx-cost-center');
  const maintWrap = backdrop.querySelector('#tx-maint-wrap');

  const refreshCategoryAndMaint = () => {
    const cc = centerSel.value || 'farm';
    catSel.innerHTML = buildOptions(typeSel.value, cc);
    if (maintWrap) maintWrap.style.display = cc === 'farm' ? '' : 'none';
  };

  typeSel.addEventListener('change', refreshCategoryAndMaint);
  centerSel.addEventListener('change', refreshCategoryAndMaint);

  const close = () => document.body.removeChild(backdrop);
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#tx-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  backdrop.querySelector('#tx-save').addEventListener('click', async () => {
    const date = backdrop.querySelector('#tx-date').value;
    const type = backdrop.querySelector('#tx-type').value;
    const category = backdrop.querySelector('#tx-category').value;
    const amount = parseFloat(backdrop.querySelector('#tx-amount').value);
    const description = backdrop.querySelector('#tx-description').value.trim();
    const payment_method = backdrop.querySelector('#tx-payment').value;
    const cost_center = centerSel.value || 'farm';
    const maintenance_activity_key =
      cost_center === 'farm' ? (backdrop.querySelector('#tx-maint')?.value || '').trim() : '';
    const errEl = backdrop.querySelector('#tx-error');

    if (!description || isNaN(amount) || amount <= 0) {
      errEl.style.display = 'block';
      errEl.textContent = 'Please enter description and a valid UGX amount.';
      return;
    }
    errEl.style.display = 'none';

    await dataService.addTransaction({
      category,
      description,
      amount,
      date,
      type,
      payment_method,
      maintenance_activity_key: maintenance_activity_key || undefined,
      cost_center,
    });
    close();
    const where = dataService.costCenterLabel(cost_center);
    showToast(`${type} logged: ${dataService.formatCurrency(amount)} · ${category} · ${where}.`);
    if (onSaved) onSaved();
  });
}

function farmChartTheme() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    tick: dark ? '#94a3b8' : '#64748b',
    grid: dark ? 'hsla(220, 25%, 30%, 0.55)' : '#e2e8f0',
  };
}

async function bindOverviewCharts(panel, monthly, expensePie) {
  try {
    await ensureChartJs();
    await waitNextPaint();
    const Chart = window.Chart;
    const { tick, grid } = farmChartTheme();

    const barEl = panel.querySelector('#fa-chart-bar');
    if (barEl) {
      new Chart(barEl, {
        type: 'bar',
        data: {
          labels: monthly.map((m) => m.month),
          datasets: [
            { label: 'Revenue', data: monthly.map((m) => m.revenue), backgroundColor: '#16a34a', borderRadius: 3 },
            { label: 'Expenses', data: monthly.map((m) => m.expenses), backgroundColor: '#dc2626', borderRadius: 3 },
            { label: 'Net Profit', data: monthly.map((m) => m.netProfit), backgroundColor: '#1d4ed8', borderRadius: 3 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: tick, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: UGX ${Math.round(ctx.raw || 0).toLocaleString()}`,
              },
            },
          },
          scales: {
            x: { ticks: { color: tick, maxRotation: 45, font: { size: 10 } }, grid: { color: grid } },
            y: {
              beginAtZero: true,
              ticks: {
                color: tick,
                font: { size: 10 },
                callback: (v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : `${(v / 1_000).toFixed(0)}K`),
              },
              grid: { strokeDasharray: '3 3', color: grid },
            },
          },
        },
      });
    }

    const pieEl = panel.querySelector('#fa-chart-pie');
    if (pieEl && expensePie.length > 0) {
      new Chart(pieEl, {
        type: 'doughnut',
        data: {
          labels: expensePie.map((e) => e.category),
          datasets: [
            {
              data: expensePie.map((e) => e.amount),
              backgroundColor: expensePie.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (ctx) => ` UGX ${Math.round(ctx.raw || 0).toLocaleString()}` },
            },
          },
          cutout: '58%',
        },
      });
    }

    const areaEl = panel.querySelector('#fa-chart-area');
    if (areaEl) {
      new Chart(areaEl, {
        type: 'line',
        data: {
          labels: monthly.map((m) => m.month),
          datasets: [
            {
              label: 'Net Profit',
              data: monthly.map((m) => m.netProfit),
              borderColor: '#1d4ed8',
              backgroundColor: 'rgba(29, 78, 216, 0.12)',
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointBackgroundColor: '#1d4ed8',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (ctx) => ` UGX ${Math.round(ctx.raw || 0).toLocaleString()}` },
            },
          },
          scales: {
            x: { ticks: { color: tick, font: { size: 10 } }, grid: { color: grid } },
            y: {
              beginAtZero: true,
              ticks: {
                color: tick,
                font: { size: 10 },
                callback: (v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : `${(v / 1_000).toFixed(0)}K`),
              },
              grid: { strokeDasharray: '3 3', color: grid },
            },
          },
        },
      });
    }
  } catch (e) {
    console.error('[Farm accounting] Chart.js:', e);
  }
}

function renderJournalTable(items, title, emptyMsg) {
  const rows =
    items.length === 0
      ? `<tr><td colspan="7" class="fa-td-empty">${emptyMsg}</td></tr>`
      : items
          .map(
            (item) => `
    <tr class="fa-tr">
      <td class="fa-td">${item.date}</td>
      <td class="fa-td"><span class="fa-badge ${item.type === 'Expense' ? 'fa-badge-exp' : 'fa-badge-rev'}">${item.type}</span></td>
      <td class="fa-td">${escHtml(dataService.costCenterLabel(item.cost_center))}</td>
      <td class="fa-td">${item.category || '—'}</td>
      <td class="fa-td-desc">${(item.description || '').replace(/</g, '&lt;')}</td>
      <td class="fa-td">${pmDisplay(item)}</td>
      <td class="fa-td-num ${item.type === 'Revenue' ? 'fa-num-rev' : 'fa-num-exp'}">
        ${item.type === 'Revenue' ? '+' : '−'}${dataService.formatLedgerUgx(Number(item.amount))}
      </td>
    </tr>`
          )
          .join('');
  return `
    <div class="fa-card fa-card-pad0">
      <div class="fa-card-head">
        <div>
          <div class="fa-card-title">${title}</div>
          <div class="fa-card-desc">${items.length} entries</div>
        </div>
      </div>
      <div class="fa-table-wrap">
        <table class="fa-table">
          <thead>
            <tr>
              <th>Date</th><th>Type</th><th>Attributed to</th><th>Category</th><th>Description</th><th>Method</th><th class="fa-th-num">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderFinance(container) {
  let activeSub =
    (() => {
      try {
        return sessionStorage.getItem(SUBTAB_KEY) || 'overview';
      } catch {
        return 'overview';
      }
    })();
  activeSub = migrateLegacySubtab(activeSub);
  if (!ACCOUNTING_SUBTABS.some((t) => t.id === activeSub)) activeSub = 'overview';

  let overviewRange = loadOverviewRange();

  const shell = document.createElement('div');
  shell.className = 'farm-accounting-light';
  container.innerHTML = '';
  container.appendChild(shell);
  shell.innerHTML =
    '<div class="pillar-loading" style="padding:28px 16px;text-align:center;color:var(--text-secondary);">Loading farm ledger…</div>';

  /** Monotonic counter so overlapping async paints do not apply stale DOM. */
  let paintSeq = 0;
  /** Snapshot for CSV / HTML / print exports after each successful paint. */
  let exportCtx = {
    items: [],
    from: '',
    to: '',
    activeSub: activeSub,
    tabLabel: 'Financial Overview',
    summary: [],
  };

  const runExportCsv = () => {
    const from = exportCtx.from || overviewRange.from;
    const to = exportCtx.to || overviewRange.to;
    const rows = ledgerCsvRows(itemsInDateRange(exportCtx.items, from, to));
    if (!rows.length) {
      showToast('No ledger lines in the selected period to export.');
      return;
    }
    downloadCSV(`farm_finance_ledger_${from}_${to}.csv`, rows);
    showToast(`Exported ${rows.length} ledger line(s) as CSV.`);
  };

  const runExportWord = async () => {
    const from = exportCtx.from || overviewRange.from;
    const to = exportCtx.to || overviewRange.to;
    const panel = shell.querySelector('#fa-panel');
    if (!panel) {
      showToast('Nothing to export yet — wait for the report to load.');
      return;
    }
    const tabLabel = exportCtx.tabLabel || 'Report';
    const periodLabel =
      exportCtx.activeSub === 'income' ||
      exportCtx.activeSub === 'cashflow' ||
      exportCtx.activeSub === 'equity' ||
      exportCtx.activeSub === 'analysis' ||
      exportCtx.activeSub === 'position'
        ? `Calendar year ${new Date().getFullYear()}`
        : formatRangeHint(from, to);
    try {
      showToast(`Building Word document…`);
      const blob = await buildFarmFinanceDocx(panel, {
        title: tabLabel,
        tabLabel,
        periodLabel,
      });
      const slug = String(exportCtx.activeSub || 'report').replace(/[^a-z0-9_-]/gi, '_');
      downloadBlob(`farm_finance_${slug}_${exportStamp()}.doc`, blob);
      showToast(`${tabLabel} downloaded as Word (.doc).`);
    } catch (e) {
      console.error('[Farm accounting] Word export failed', e);
      showToast(`Word export failed: ${String(e?.message || e)}`);
    }
  };

  const runExportPrint = () => {
    const from = exportCtx.from || overviewRange.from;
    const to = exportCtx.to || overviewRange.to;
    const panel = shell.querySelector('#fa-panel');
    if (!panel) {
      showToast('Nothing to export yet — wait for the report to load.');
      return;
    }
    const tabLabel = exportCtx.tabLabel || 'Report';
    const periodLabel =
      exportCtx.activeSub === 'income' ||
      exportCtx.activeSub === 'cashflow' ||
      exportCtx.activeSub === 'equity' ||
      exportCtx.activeSub === 'analysis' ||
      exportCtx.activeSub === 'position'
        ? `Calendar year ${new Date().getFullYear()}`
        : formatRangeHint(from, to);
    const html = buildVisualReportExportHtml(panel, {
      title: tabLabel,
      tabLabel,
      periodLabel,
    });
    const ok = openHtmlInPrintWindow(html, {
      onBlocked: () => showToast('Pop-up blocked — allow pop-ups to print, or use Download Word.'),
    });
    if (ok) showToast(`Printing ${tabLabel}…`);
  };

  shell.addEventListener('click', (e) => {
    const raw = e.target;
    const t = raw instanceof Element ? raw : raw.parentElement;
    if (!t) return;
    if (t.closest('#fa-refresh')) {
      e.preventDefault();
      schedulePaint();
      return;
    }
    if (t.closest('#fa-add-entry')) {
      e.preventDefault();
      openAddTransactionModal(() => schedulePaint()).catch(() => {});
      return;
    }
    if (t.closest('#fa-add-dispatch')) {
      e.preventDefault();
      openAddDispatchModal(() => schedulePaint());
      return;
    }
    if (t.closest('#fa-export-csv')) {
      e.preventDefault();
      runExportCsv();
      return;
    }
    if (t.closest('#fa-export-word')) {
      e.preventDefault();
      void runExportWord();
      return;
    }
    if (t.closest('#fa-print')) {
      e.preventDefault();
      runExportPrint();
      return;
    }
    const presetBtn = t.closest('[data-fa-range-preset]');
    if (presetBtn && shell.contains(presetBtn)) {
      e.preventDefault();
      const key = presetBtn.getAttribute('data-fa-range-preset');
      if (key) {
        overviewRange = overviewRangePresets(key);
        saveOverviewRange(overviewRange);
        schedulePaint();
      }
      return;
    }
    if (t.closest('#fa-range-apply')) {
      e.preventDefault();
      const fromEl = shell.querySelector('#fa-range-from');
      const toEl = shell.querySelector('#fa-range-to');
      if (!fromEl || !toEl) return;
      let from = String(fromEl.value || '').slice(0, 10);
      let to = String(toEl.value || '').slice(0, 10);
      if (!from || !to) return;
      if (from > to) [from, to] = [to, from];
      overviewRange = { from, to };
      saveOverviewRange(overviewRange);
      schedulePaint();
      return;
    }
    const tabBtn = t.closest('[data-fa-tab]');
    if (!tabBtn || !shell.contains(tabBtn)) return;
    const id = tabBtn.getAttribute('data-fa-tab');
    if (!id || id === activeSub) return;
    activeSub = id;
    try {
      sessionStorage.setItem(SUBTAB_KEY, activeSub);
    } catch {
      /* ignore */
    }
    schedulePaint();
  });

  const schedulePaint = () => {
    void runPaint();
  };

  const onThemeChange = () => {
    if (shell.isConnected) schedulePaint();
  };
  window.addEventListener('estate-theme-change', onThemeChange);

  const runPaint = async () => {
    const seq = ++paintSeq;
    const prevPanel = shell.querySelector('#fa-panel');
    if (prevPanel) destroyChartsIn(prevPanel);
    shell.innerHTML =
      '<div class="pillar-loading" style="padding:28px 16px;text-align:center;color:var(--text-secondary);">Loading farm ledger…</div>';

    /** Run once per session; do not block first paint — repair can take a long time on large payroll/dispatch data. */
    if (!derivedFarmLedgerEnsured) {
      derivedFarmLedgerEnsured = true;
      void dataService
        .repairAllDerivedFarmLedgerMirrors()
        .catch((e) => console.error('[Farm accounting] Ledger mirror repair failed', e))
        .finally(() => {
          if (shell.isConnected) schedulePaint();
        });
    }

    let items;
    let loans;
    let repayments;
    let blocks;
    let batches;
    let contracts;
    try {
      [items, loans, repayments, blocks, batches, contracts] = await Promise.all([
      dataService.getFinanceItems(),
      dataService.getSaccoLoans().catch(() => []),
      dataService.getSaccoRepayments().catch(() => []),
      dataService.getBlocks().catch(() => []),
      dataService.getBatches().catch(() => []),
      dataService.getContracts().catch(() => []),
    ]);
    } catch (e) {
      console.error('[Farm accounting] Failed to load ledger', e);
      if (seq === paintSeq) {
        shell.innerHTML = `
          <div style="padding:24px 16px;">
            <p style="font-weight:700;color:var(--red-text);margin:0 0 8px;">Could not load farm finance</p>
            <p style="font-size:12px;color:var(--text-secondary);margin:0 0 16px;line-height:1.5;">${escHtml(String(e?.message || e))}</p>
            <button type="button" class="fa-btn-primary" id="fa-retry-load">Try again</button>
          </div>`;
        shell.querySelector('#fa-retry-load')?.addEventListener('click', () => schedulePaint());
      }
      return;
    }
    if (seq !== paintSeq) return;

    try {
    const loansAug = aggregateLoanRows(loans, repayments);
    const saccoOutstanding = loansAug.reduce((s, x) => s + x.outstanding, 0);
    const financeSummary = await dataService.getFinanceSummary();
    if (seq !== paintSeq) return;

    const totalAcres = blocks.reduce((s, b) => s + Number(b.acres || 0), 0);
    const rf = overviewRange.from;
    const rt = overviewRange.to;
    const revP = sumInRange(items, rf, rt, 'Revenue');
    const expP = sumInRange(items, rf, rt, 'Expense');
    const netP = revP - expP;
    const prevWin = previousPeriodSameLength(rf, rt);
    const netPrev = totalsInRange(items, prevWin.from, prevWin.to).netProfit;
    const profitTrend =
      netPrev !== 0 ? ((netP - netPrev) / Math.abs(netPrev)) * 100 : netP > 0 ? 100 : 0;
    const ytd = ytdTotals(items);
    let monthKeys = monthKeysBetweenInclusive(rf, rt, 24);
    if (monthKeys.length === 0) {
      const k = monthKey(`${rf}T12:00:00`) || currentYearMonth();
      monthKeys = [k];
    }
    const monthly = aggregateMonthlyForKeys(items, monthKeys);
    const expensePie = expenseCategoriesInRange(items, rf, rt).slice(0, 8);
    const rangeHint = formatRangeHint(rf, rt);
    const chartMonthsNote =
      monthKeys.length <= 1 ? '1 month in view' : `${monthKeys.length} months in view`;
    const farmExpP = sumInRangeForCenter(items, rf, rt, 'Expense', 'farm');
    const houseExpP = sumInRangeForCenter(items, rf, rt, 'Expense', 'ruhunga_farm_house');
    const farmRevP = sumInRangeForCenter(items, rf, rt, 'Revenue', 'farm');
    const houseRevP = sumInRangeForCenter(items, rf, rt, 'Revenue', 'ruhunga_farm_house');
    const farmNetP = farmRevP - farmExpP;
    const houseNetP = houseRevP - houseExpP;

    const tabMeta = ACCOUNTING_SUBTABS.find((t) => t.id === activeSub);
    exportCtx = {
      items,
      from: rf,
      to: rt,
      activeSub,
      tabLabel: tabMeta?.label || activeSub,
      summary: [
        ['Period', formatRangeHint(rf, rt)],
        ['Revenue (period)', dataService.formatCurrency(revP)],
        ['Expenses (period)', dataService.formatCurrency(expP)],
        ['Net profit (period)', dataService.formatCurrency(netP)],
        ['Estate (farm) net', dataService.formatCurrency(farmNetP)],
        ['Ruhunga farm house net', dataService.formatCurrency(houseNetP)],
        ['YTD net profit', dataService.formatCurrency(ytd.netProfit)],
      ],
    };

    const overviewKpiHtml = `
      <div class="fa-kpi-grid">
        <div class="fa-kpi fa-kpi-green">
          <div class="fa-kpi-h">Revenue (period)</div>
          <div class="fa-kpi-v">${fmt(revP)}</div>
          <div class="fa-kpi-f fa-kpi-f-green"><span class="material-symbols-outlined" style="font-size:14px;">north_east</span> ${rangeHint}</div>
        </div>
        <div class="fa-kpi fa-kpi-red">
          <div class="fa-kpi-h">Expenses (period)</div>
          <div class="fa-kpi-v">${fmt(expP)}</div>
          <div class="fa-kpi-f fa-kpi-f-red"><span class="material-symbols-outlined" style="font-size:14px;">south_east</span> Costs in selected range</div>
        </div>
        <div class="fa-kpi ${netP >= 0 ? 'fa-kpi-blue' : 'fa-kpi-orange'}">
          <div class="fa-kpi-h">Net profit (period)</div>
          <div class="fa-kpi-v ${netP >= 0 ? 'fa-kpi-v-blue' : 'fa-kpi-v-orange'}">${fmt(Math.abs(netP))}<span class="fa-kpi-sub"> ${netP >= 0 ? 'profit' : 'loss'}</span></div>
          <div class="fa-kpi-f ${profitTrend >= 0 ? 'fa-kpi-f-green' : 'fa-kpi-f-red'}">
            ${profitTrend >= 0 ? '↗' : '↘'} ${Math.abs(profitTrend).toFixed(1)}% vs prior period (same length)
          </div>
        </div>
        <div class="fa-kpi fa-kpi-amber">
          <div class="fa-kpi-h">YTD net profit</div>
          <div class="fa-kpi-v fa-kpi-v-amber">${fmt(Math.abs(ytd.netProfit))}</div>
          <div class="fa-kpi-f fa-kpi-f-muted">${new Date().getFullYear()} year-to-date</div>
        </div>
      </div>
      <div class="fa-kpi-grid" style="margin-top:0;">
        <div class="fa-kpi fa-kpi-blue">
          <div class="fa-kpi-h">Estate (farm) net</div>
          <div class="fa-kpi-v">${fmt(Math.abs(farmNetP))}<span class="fa-kpi-sub"> ${farmNetP >= 0 ? 'profit' : 'loss'}</span></div>
          <div class="fa-kpi-f fa-kpi-f-muted">Rev ${fmt(farmRevP)} · Exp ${fmt(farmExpP)}</div>
        </div>
        <div class="fa-kpi fa-kpi-amber">
          <div class="fa-kpi-h">Ruhunga farm house net</div>
          <div class="fa-kpi-v">${fmt(Math.abs(houseNetP))}<span class="fa-kpi-sub"> ${houseNetP >= 0 ? 'profit' : 'loss'}</span></div>
          <div class="fa-kpi-f fa-kpi-f-muted">Rev ${fmt(houseRevP)} · Exp ${fmt(houseExpP)}</div>
        </div>
      </div>
      <div class="fa-chart-row">
        <div class="fa-card fa-chart-wide">
          <div class="fa-card-head">
            <div class="fa-card-title">Revenue vs Expenses</div>
            <div class="fa-card-desc">${chartMonthsNote} — UGX</div>
          </div>
          <div class="fa-chart-box"><canvas id="fa-chart-bar"></canvas></div>
        </div>
        <div class="fa-card fa-chart-narrow">
          <div class="fa-card-head">
            <div class="fa-card-title">Expense breakdown</div>
            <div class="fa-card-desc">Selected period by category</div>
          </div>
          <div class="fa-pie-wrap">
            ${expensePie.length === 0 ? '<div class="fa-empty-pie">No expense data in this range</div>' : `<div class="fa-chart-box fa-chart-pie"><canvas id="fa-chart-pie"></canvas></div>`}
            <div class="fa-pie-legend">
              ${expensePie
                .slice(0, 5)
                .map(
                  (c, i) => `
                <div class="fa-legend-row">
                  <span class="fa-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
                  <span class="fa-legend-name">${c.category}</span>
                  <span class="fa-legend-val">${fmt(c.amount)}</span>
                </div>`
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="fa-card">
        <div class="fa-card-head">
          <div class="fa-card-title">Net profit trend</div>
          <div class="fa-card-desc">Month-over-month profitability</div>
        </div>
        <div class="fa-chart-box fa-chart-area"><canvas id="fa-chart-area"></canvas></div>
      </div>
      ${renderJournalTable(
        [...items]
          .filter((i) => !Number.isNaN(new Date(i.date).getTime()))
          .filter((i) => {
            const ds = rowDateStr(i);
            return ds >= rf && ds <= rt;
          })
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .slice(0, 80),
        'Journal entries (selected period)',
        'No entries in this range — widen the period or use Add entry.'
      )}
    `;

    const win = ytdWindow();
    let bodyHtml = '';
    if (activeSub === 'overview') {
      bodyHtml = overviewKpiHtml;
    } else if (activeSub === 'general') {
      bodyHtml = renderGeneralReportHtml({
        items,
        contracts,
        blocks,
        batches,
        from: rf,
        to: rt,
      });
    } else if (activeSub === 'income') {
      bodyHtml = renderComprehensiveIncomeHtml(items, win.year);
    } else if (activeSub === 'position') {
      bodyHtml = renderFinancialPositionHtml(financeSummary, saccoOutstanding, totalAcres);
    } else if (activeSub === 'cashflow') {
      bodyHtml = renderCashflowHtml(items, win.year);
    } else if (activeSub === 'equity') {
      bodyHtml = renderEquityHtml(items, win.year);
    } else if (activeSub === 'analysis') {
      bodyHtml = renderAnalysisHtml(items, blocks, batches, win.year);
    } else if (activeSub === 'cashbook') {
      bodyHtml = renderCashBookHtml(items, rf, rt);
    } else if (activeSub === 'trial') {
      bodyHtml = renderTrialBalanceHtml(itemsWithDateInRange(items, rf, rt));
    }

    if (seq !== paintSeq) return;

    const showPeriodBar =
      activeSub === 'overview' ||
      activeSub === 'general' ||
      activeSub === 'cashbook' ||
      activeSub === 'trial';
    const rangeBarHtml = showPeriodBar
      ? `
      <div class="fa-range-bar">
        <span class="fa-range-bar-title">Period</span>
        <div class="fa-range-presets" role="group" aria-label="Quick period">
          <button type="button" class="fa-range-chip" data-fa-range-preset="this_month">This month</button>
          <button type="button" class="fa-range-chip" data-fa-range-preset="last_month">Last month</button>
          <button type="button" class="fa-range-chip" data-fa-range-preset="ytd">YTD</button>
          <button type="button" class="fa-range-chip" data-fa-range-preset="all">All time</button>
        </div>
        <div class="fa-range-inputs">
          <label class="fa-range-lab" for="fa-range-from">From</label>
          <input type="date" class="fa-input-date" id="fa-range-from" value="${rf}" />
          <span class="fa-range-sep" aria-hidden="true">–</span>
          <label class="fa-range-lab" for="fa-range-to">To</label>
          <input type="date" class="fa-input-date" id="fa-range-to" value="${rt}" />
          <button type="button" class="fa-btn-outline" id="fa-range-apply">Apply</button>
        </div>
      </div>`
      : '';

    shell.innerHTML = `
      <div class="fa-header">
        <div class="fa-header-top">
          <div class="fa-header-text">
            <h1 class="fa-title"><span class="material-symbols-outlined fa-book-ico">menu_book</span> Farm accounting</h1>
          </div>
          <div class="fa-header-actions">
            <button type="button" class="fa-btn-outline" id="fa-export-csv" title="Download ledger CSV for the selected period">
              <span class="material-symbols-outlined">table</span> Export CSV
            </button>
            <button type="button" class="fa-btn-outline" id="fa-export-word" title="Download this report as a Word document">
              <span class="material-symbols-outlined">description</span> Download Word
            </button>
            <button type="button" class="fa-btn-outline" id="fa-print" title="Print this report or save as PDF">
              <span class="material-symbols-outlined">print</span> Print
            </button>
            <button type="button" class="fa-btn-outline" id="fa-refresh" title="Refresh">
              <span class="material-symbols-outlined">refresh</span> Refresh
            </button>
            <button type="button" class="fa-btn-primary" id="fa-add-entry">
              <span class="material-symbols-outlined">add</span> Add entry
            </button>
          </div>
        </div>
        ${rangeBarHtml}
      </div>
      <div class="fa-tablist-wrap">
        <div class="fa-tablist" role="tablist">
          ${ACCOUNTING_SUBTABS.map(
            (t) => `
            <button type="button" role="tab" class="fa-tab ${t.id === activeSub ? 'active' : ''}" data-fa-tab="${t.id}">${t.label}</button>`
          ).join('')}
        </div>
      </div>
      <div id="fa-panel" class="fa-panel">${bodyHtml}</div>
    `;

    const panel = shell.querySelector('#fa-panel');
    if (activeSub === 'overview' && panel) {
      destroyChartsIn(panel);
      await bindOverviewCharts(panel, monthly, expensePie);
    }
    if (seq !== paintSeq) return;
    } catch (e) {
      console.error('[Farm accounting] Failed to render ledger', e);
      if (seq === paintSeq) {
        shell.innerHTML = `
          <div style="padding:24px 16px;">
            <p style="font-weight:700;color:var(--red-text);margin:0 0 8px;">Could not load farm finance</p>
            <p style="font-size:12px;color:var(--text-secondary);margin:0 0 16px;line-height:1.5;">${escHtml(String(e?.message || e))}</p>
            <button type="button" class="fa-btn-primary" id="fa-retry-load-render">Try again</button>
          </div>`;
        shell.querySelector('#fa-retry-load-render')?.addEventListener('click', () => schedulePaint());
      }
    }
  };

  await runPaint();
}

export { renderFinance };
