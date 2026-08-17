// ============================================================
// saccoHub.js — Modern SACCO: Overview | Members | Loans | Payroll
// ============================================================
import { dataService } from '../../services/dataService.js';
import { showToast } from '../../utils/toast.js';
import { isWebMode } from '../../auth/webAuth.js';

const SACCO_ACC_RANGE_KEY = 'saccoAccountingRange';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escSacco(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function saccoAccountingDefaultRange() {
  const d = new Date();
  return {
    from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
    to: d.toISOString().slice(0, 10),
  };
}

function loadSaccoAccountingRange() {
  try {
    const raw = sessionStorage.getItem(SACCO_ACC_RANGE_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j.from && j.to && String(j.from) <= String(j.to)) return { from: j.from, to: j.to };
    }
  } catch {
    /* ignore */
  }
  return saccoAccountingDefaultRange();
}

function saveSaccoAccountingRange(r) {
  try {
    sessionStorage.setItem(SACCO_ACC_RANGE_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

function saccoAccountingPresets(which) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const isoEnd = (d) => d.toISOString().slice(0, 10);
  if (which === 'this_month') {
    return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: isoEnd(now) };
  }
  if (which === 'last_month') {
    const d0 = new Date(y, m - 1, 1);
    const d1 = new Date(y, m, 0);
    return {
      from: `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-01`,
      to: `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`,
    };
  }
  if (which === 'ytd') {
    return { from: `${y}-01-01`, to: isoEnd(now) };
  }
  if (which === 'all') {
    return { from: '1970-01-01', to: isoEnd(now) };
  }
  return saccoAccountingDefaultRange();
}

function openSaccoJournalModal(onSaved) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header">
        <span class="modal-title">SACCO journal line</span>
        <button type="button" class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">Posted only to the SACCO ledger (<code style="font-size:10px;">sacco_finance_items</code>), not the farm books.</p>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Type</label>
          <select class="form-select" id="sj-type">
            <option value="Revenue">Revenue</option>
            <option value="Expense">Expense</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Category</label>
          <input class="form-input" id="sj-cat" placeholder="e.g. Loan interest, Stationery" />
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Description</label>
          <input class="form-input" id="sj-desc" placeholder="Details" />
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Amount (UGX)</label>
          <input class="form-input" id="sj-amt" type="number" min="0" step="1" />
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Date</label>
          <input class="form-input" id="sj-date" type="date" value="${today()}" />
        </div>
        <p id="sj-err" style="display:none;color:var(--red-text);font-size:11px;"></p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="sj-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="sj-save">Save</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => {
    try {
      document.body.removeChild(backdrop);
    } catch {
      /* ignore */
    }
  };
  backdrop.querySelector('.modal-close')?.addEventListener('click', close);
  backdrop.querySelector('#sj-cancel')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('#sj-save')?.addEventListener('click', async () => {
    const err = backdrop.querySelector('#sj-err');
    err.style.display = 'none';
    const type = backdrop.querySelector('#sj-type').value;
    const category = backdrop.querySelector('#sj-cat').value.trim() || 'General';
    const description = backdrop.querySelector('#sj-desc').value.trim() || category;
    const amount = parseFloat(backdrop.querySelector('#sj-amt').value);
    const date = backdrop.querySelector('#sj-date').value;
    if (!Number.isFinite(amount) || amount <= 0 || !date) {
      err.textContent = 'Enter a valid amount and date.';
      err.style.display = 'block';
      return;
    }
    await dataService.addSaccoFinanceItem({ category, description, amount, date, type });
    showToast('SACCO journal line saved.');
    close();
    if (onSaved) onSaved();
  });
}

async function renderAccountingTab(container, refresh) {
  const range = loadSaccoAccountingRange();
  const [summary, book] = await Promise.all([
    dataService.getSaccoJournalSummaryForRange(range.from, range.to),
    dataService.getSaccoCashbookForRange(range.from, range.to),
  ]);

  const rows =
    book.lines.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No movements in this period.</td></tr>`
      : book.lines
          .map((ln) => {
            const pos = ln.signed >= 0;
            const mov = `${pos ? '+' : '−'}${dataService.formatCurrency(Math.abs(ln.signed)).replace(/^UGX\s/, '')}`;
            return `
        <tr>
          <td class="tabular-nums">${escSacco(ln.date)}</td>
          <td><span class="badge muted" style="font-size:10px;">${escSacco(ln.kind)}</span></td>
          <td>${escSacco(ln.description)}</td>
          <td>${escSacco(ln.method)}</td>
          <td class="tabular-nums" style="color:${pos ? 'var(--green-bright)' : 'var(--red-text)'};font-weight:600;">${mov}</td>
          <td class="tabular-nums" style="font-weight:600;">${dataService.formatCurrency(ln.balance)}</td>
        </tr>`;
          })
          .join('');

  container.innerHTML = `
    <div class="sacco-accounting-sheet">
      <div class="sacco-accounting-section">
        <p style="font-size:12px;color:var(--text-secondary);margin:0 0 12px;line-height:1.5;">
          <strong>SACCO entity</strong> — cash-style book combines journal entries, member savings, loan repayments, and loan disbursements.
          Journal-only revenue/expense for the period (below) is from <code style="font-size:10px;">sacco_finance_items</code> only.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px;">
          <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;">Period</span>
          <button type="button" class="btn btn-ghost btn-sm" data-sacco-acc-preset="this_month">This month</button>
          <button type="button" class="btn btn-ghost btn-sm" data-sacco-acc-preset="last_month">Last month</button>
          <button type="button" class="btn btn-ghost btn-sm" data-sacco-acc-preset="ytd">YTD</button>
          <button type="button" class="btn btn-ghost btn-sm" data-sacco-acc-preset="all">All time</button>
          <input type="date" class="form-input" id="sacco-acc-from" value="${range.from}" style="max-width:140px;" />
          <span style="color:var(--text-muted);">–</span>
          <input type="date" class="form-input" id="sacco-acc-to" value="${range.to}" style="max-width:140px;" />
          <button type="button" class="btn btn-primary btn-sm" id="sacco-acc-apply">Apply</button>
          <button type="button" class="btn btn-outline btn-sm" id="sacco-acc-journal">
            <span class="material-symbols-outlined" style="font-size:18px;">add</span> Journal line
          </button>
        </div>
        <div class="kpi-grid sacco-accounting-kpis" style="margin-bottom:0;">
          <div class="kpi-card"><div class="kpi-label">Journal revenue (period)</div><div class="kpi-value green">${dataService.formatCurrency(summary.revenue)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Journal expense (period)</div><div class="kpi-value red">${dataService.formatCurrency(summary.expense)}</div></div>
          <div class="kpi-card gold-border"><div class="kpi-label">Journal net</div><div class="kpi-value gold">${dataService.formatCurrency(summary.net)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Opening cash position (book)</div><div class="kpi-value">${dataService.formatCurrency(book.opening)}</div></div>
        </div>
      </div>

      <div class="sacco-accounting-section">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h2 class="card-title" style="margin:0;font-size:1rem;">SACCO cash book</h2>
          <span style="font-size:11px;color:var(--text-muted);">Running balance (single-entry)</span>
        </div>
        <div style="overflow:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th><th>Kind</th><th>Description</th><th>Method</th><th>Movement</th><th>Balance</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-sacco-acc-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-sacco-acc-preset');
      saveSaccoAccountingRange(saccoAccountingPresets(key));
      refresh();
    });
  });
  container.querySelector('#sacco-acc-apply')?.addEventListener('click', () => {
    let from = container.querySelector('#sacco-acc-from')?.value?.slice(0, 10) || '';
    let to = container.querySelector('#sacco-acc-to')?.value?.slice(0, 10) || '';
    if (!from || !to) return;
    if (from > to) [from, to] = [to, from];
    saveSaccoAccountingRange({ from, to });
    refresh();
  });
  container.querySelector('#sacco-acc-journal')?.addEventListener('click', () => {
    openSaccoJournalModal(refresh);
  });
}

/** Add calendar months to YYYY-MM-DD (local date). */
function addMonthsToIsoDate(iso, months) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return today();
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(y, m - 1 + Number(months), d);
  if (Number.isNaN(dt.getTime())) return today();
  return dt.toISOString().slice(0, 10);
}

/**
 * Flat interest on principal for the term.
 * - annual: P × (rate/100) × (months/12)
 * - monthly: P × (rate/100) × months (same % applied each month on principal)
 * Returns interest, total repayable, and one instalment by schedule (monthly / weekly / bullet).
 */
function computeLoanPreview(principal, ratePct, termMonths, schedule, rateBasis = 'annual') {
  const P = Math.max(0, Number(principal) || 0);
  const r = Math.max(0, Number(ratePct) || 0);
  const n = Math.max(1, Math.round(Number(termMonths) || 12));
  const basis = String(rateBasis || 'annual').toLowerCase() === 'monthly' ? 'monthly' : 'annual';
  const interest =
    basis === 'monthly' ? P * (r / 100) * n : P * (r / 100) * (n / 12);
  const totalRepayable = P + interest;
  let installment = totalRepayable;
  let installmentLabel = 'Due at maturity';
  if (schedule === 'monthly') {
    installment = totalRepayable / n;
    installmentLabel = 'Est. per month';
  } else if (schedule === 'weekly') {
    const weeks = n * (52 / 12);
    installment = totalRepayable / weeks;
    installmentLabel = 'Est. per week';
  }
  return { interest, totalRepayable, installment, installmentLabel };
}

function loanBalance(loan, repayments) {
  const paid = repayments.filter((r) => r.loan_id === loan.id).reduce((s, r) => s + Number(r.amount || 0), 0);
  return Math.max(Number(loan.amount || 0) - paid, 0);
}

function memberTotalSavings(memberId, savings) {
  return savings.filter((s) => s.member_id === memberId).reduce((s, x) => s + Number(x.amount || 0), 0);
}

/** Match SACCO member to salary workbook row (name + phone digits). */
function normMemberKey(s) {
  return String(s ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
function onlyDigitsPhone(s) {
  return String(s ?? '').replace(/\D/g, '');
}

/** Compare 0770… vs 770… (last 9 digits). */
function phoneDigitsMatch(a, b) {
  const da = onlyDigitsPhone(a);
  const db = onlyDigitsPhone(b);
  if (!da || !db) return da === db;
  const ta = da.length >= 9 ? da.slice(-9) : da;
  const tb = db.length >= 9 ? db.slice(-9) : db;
  return ta === tb;
}

/**
 * Match member to workbook row (name + phone; unique name; or compact name match).
 * Rows: { nameKey, phoneDigits, cumulativeSaving? } or { nameKey, phoneDigits, loanBalance? }.
 */
function findWorkbookPersonRow(member, rows) {
  if (!rows || !rows.length) return null;
  const nk = normMemberKey(member.full_name);
  const d = onlyDigitsPhone(member.phone);
  const exact = rows.find(
    (p) =>
      p.nameKey === nk &&
      (phoneDigitsMatch(p.phoneDigits, d) || (!d && !p.phoneDigits)),
  );
  if (exact) return exact;
  const byName = rows.filter((p) => p.nameKey === nk);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    const byPhone = byName.find((p) => phoneDigitsMatch(p.phoneDigits, d));
    return byPhone || null;
  }
  const compactNk = nk.replace(/\s/g, '');
  const loose = rows.find((p) => (p.nameKey || '').replace(/\s/g, '') === compactNk);
  return loose || null;
}

function workbookRowMatchesMember(row, member) {
  return findWorkbookPersonRow(member, [row]) != null;
}

/**
 * Cumulative “saving” column from all month sheets in docs/salary workbook (see aggregateSaccoOverviewFromXlsx).
 */
function workbookSavingForMember(member, personSavings) {
  const row = findWorkbookPersonRow(member, personSavings);
  if (!row) return null;
  return Number(row.cumulativeSaving) || 0;
}

/** Latest merged “loan balance” column from salary workbook. */
function workbookLoanBalanceForMember(member, personLoanBalances) {
  const row = findWorkbookPersonRow(member, personLoanBalances);
  if (!row) return null;
  return Number(row.loanBalance) || 0;
}

function buildMemberTx(memberId, savings, loans, repayments) {
  const tx = [];
  savings
    .filter((s) => s.member_id === memberId)
    .forEach((s) => {
      tx.push({
        kind: 'deposit',
        label: 'Deposit',
        amount: Number(s.amount || 0),
        date: s.deposit_date || '',
        positive: true,
      });
    });
  loans
    .filter((l) => l.member_id === memberId)
    .forEach((l) => {
      tx.push({
        kind: 'loan',
        label: 'Loan issued',
        amount: Number(l.amount || 0),
        date: l.issue_date || '',
        positive: true,
      });
    });
  repayments
    .filter((r) => {
      const loan = loans.find((l) => l.id === r.loan_id);
      return loan && loan.member_id === memberId;
    })
    .forEach((r) => {
      tx.push({
        kind: 'repay',
        label: 'Loan repayment',
        amount: Number(r.amount || 0),
        date: r.repayment_date || '',
        positive: false,
      });
    });
  tx.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return tx;
}

function loanDistribution(loans, repayments) {
  const active = loans.filter((l) => (l.status || '').toLowerCase() === 'active');
  const bins = { under1: 0, m1to3: 0, m3to5: 0, over5: 0 };
  for (const l of active) {
    const bal = loanBalance(l, repayments);
    const m = bal / 1_000_000;
    if (m < 1) bins.under1++;
    else if (m < 3) bins.m1to3++;
    else if (m < 5) bins.m3to5++;
    else bins.over5++;
  }
  const max = Math.max(...Object.values(bins), 1);
  return { bins, max };
}

function savingsByMonth(savings, months = 6) {
  const now = new Date();
  const keys = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const map = {};
  for (const s of savings) {
    const d = new Date(s.deposit_date);
    if (Number.isNaN(d.getTime())) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map[k] = (map[k] || 0) + Number(s.amount || 0);
  }
  return keys.map((k) => ({ key: k, value: map[k] || 0 }));
}

function closePanel() {
  document.querySelectorAll('.side-panel-backdrop').forEach((el) => el.remove());
}

function closeSaccoModal() {
  document.querySelectorAll('.sacco-modal-backdrop').forEach((el) => el.remove());
}

function openSaccoModal(title, bodyHtml, opts = {}) {
  const maxW = opts.maxWidth || '440px';
  closeSaccoModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'side-panel-backdrop sacco-modal-backdrop';
  backdrop.innerHTML = `
    <div class="side-panel" role="dialog" aria-modal="true" style="max-width:${maxW};">
      <div class="side-panel-header">
        <div class="member-hero-name" style="font-size:17px;">${title}</div>
        <button type="button" class="side-panel-close sacco-modal-close" aria-label="Close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="side-panel-body">${bodyHtml}</div>
    </div>
  `;
  backdrop.querySelector('.sacco-modal-close')?.addEventListener('click', closeSaccoModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSaccoModal();
  });
  document.body.appendChild(backdrop);
  return backdrop;
}

function openMemberPanel(member, savings, loans, repayments, onRefresh, reloadMemberContext) {
  closePanel();
  let m = { ...member };
  let sav = savings;
  let ln = loans;
  let rep = repayments;
  let editSavingId = null;
  let editLoanId = null;

  const memberLoans = () => ln.filter((l) => l.member_id === m.id);

  const backdrop = document.createElement('div');
  backdrop.className = 'side-panel-backdrop';
  const ts0 = memberTotalSavings(m.id, sav);
  let alb0 = 0;
  memberLoans().forEach((l) => {
    alb0 += loanBalance(l, rep);
  });
  backdrop.innerHTML = `
    <div class="side-panel" role="dialog" aria-label="Member profile">
      <div class="side-panel-header">
        <div>
          <div class="member-hero-name" id="member-panel-name">${m.full_name || ''}</div>
          <div id="member-panel-sub" style="font-size:11px;color:var(--text-muted);margin-top:4px;">${m.member_no || ''} · ${m.phone || 'No phone'}</div>
          <div class="member-hero-stats">
            <div class="member-stat-pill">
              <div class="lbl">Savings</div>
              <div class="val" id="member-panel-sav">${dataService.formatCurrency(ts0)}</div>
            </div>
            <div class="member-stat-pill">
              <div class="lbl">Loan outstanding</div>
              <div class="val" id="member-panel-loanbal">${dataService.formatCurrency(alb0)}</div>
            </div>
          </div>
        </div>
        <button type="button" class="side-panel-close" aria-label="Close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="member-inner-tabs" id="member-inner-tabs"></div>
      <div class="side-panel-body" id="member-panel-body"></div>
    </div>
  `;

  const tabs = ['Profile', 'Transactions', 'Loans', 'Savings'];
  let innerTab = 'Transactions';

  const tabEl = backdrop.querySelector('#member-inner-tabs');
  const bodyEl = backdrop.querySelector('#member-panel-body');

  function refreshHeader() {
    const ts = memberTotalSavings(m.id, sav);
    let alb = 0;
    memberLoans().forEach((l) => {
      alb += loanBalance(l, rep);
    });
    const nameEl = backdrop.querySelector('#member-panel-name');
    const subEl = backdrop.querySelector('#member-panel-sub');
    const savEl = backdrop.querySelector('#member-panel-sav');
    const loanEl = backdrop.querySelector('#member-panel-loanbal');
    if (nameEl) nameEl.textContent = m.full_name || '';
    if (subEl) subEl.textContent = `${m.member_no || ''} · ${m.phone || 'No phone'}`;
    if (savEl) savEl.textContent = dataService.formatCurrency(ts);
    if (loanEl) loanEl.textContent = dataService.formatCurrency(alb);
  }

  async function persistAndRefresh() {
    await onRefresh();
    if (reloadMemberContext) {
      const d = await reloadMemberContext();
      const next = d.members.find((x) => x.id === m.id);
      if (!next) {
        closePanel();
        return;
      }
      m = next;
      sav = d.savings;
      ln = d.loans;
      rep = d.repayments;
    }
    editSavingId = null;
    editLoanId = null;
    refreshHeader();
    renderInner();
  }

  function renderInner() {
    const ml = memberLoans();
    tabEl.innerHTML = tabs
      .map(
        (t) => `
      <button type="button" class="member-inner-tab ${innerTab === t ? 'active' : ''}" data-t="${t}">${t}</button>
    `
      )
      .join('');

    tabEl.querySelectorAll('.member-inner-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        innerTab = btn.dataset.t;
        editSavingId = null;
        editLoanId = null;
        renderInner();
      });
    });

    if (innerTab === 'Profile') {
      bodyEl.innerHTML = `
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">All amounts use your farm currency (UGX). Edit figures as needed; totals update after save.</p>
        <form id="sacco-member-profile-form" class="sacco-inline-form" style="display:flex;flex-direction:column;gap:10px;">
          <input class="form-input" name="member_no" value="${(m.member_no || '').replace(/"/g, '&quot;')}" placeholder="Member No" required />
          <input class="form-input" name="full_name" value="${(m.full_name || '').replace(/"/g, '&quot;')}" placeholder="Full name" required />
          <input class="form-input" name="phone" value="${(m.phone || '').replace(/"/g, '&quot;')}" placeholder="Phone" />
          <input class="form-input" name="national_id" value="${(m.national_id || '').replace(/"/g, '&quot;')}" placeholder="National ID" />
          <input class="form-input" name="join_date" type="date" value="${m.join_date || ''}" />
          <select class="form-input" name="status">
            <option value="Active" ${(m.status || '') === 'Active' ? 'selected' : ''}>Active</option>
            <option value="Inactive" ${(m.status || '') === 'Inactive' ? 'selected' : ''}>Inactive</option>
          </select>
          <button type="submit" class="btn btn-primary">Save member details</button>
        </form>
        <div class="mt-16">
          <div class="section-title">Loan snapshot</div>
          ${
            ml.length === 0
              ? '<p style="color:var(--text-muted);font-size:12px;">No loans.</p>'
              : ml
                  .map((l) => {
                    const bal = loanBalance(l, rep);
                    return `<div class="txn-row"><div><div class="txn-label">Loan #${l.id}</div><div class="txn-date">${l.issue_date || ''}</div></div><div class="txn-amount outflow">${dataService.formatCurrency(bal)} due</div></div>`;
                  })
                  .join('')
          }
        </div>
      `;
      bodyEl.querySelector('#sacco-member-profile-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await dataService.updateSaccoMember(m.id, {
          member_no: String(fd.get('member_no') || '').trim(),
          full_name: String(fd.get('full_name') || '').trim(),
          phone: String(fd.get('phone') || '').trim(),
          national_id: String(fd.get('national_id') || '').trim(),
          join_date: String(fd.get('join_date') || '').trim(),
          status: String(fd.get('status') || 'Active'),
        });
        await persistAndRefresh();
      });
    }

    if (innerTab === 'Transactions') {
      const tx = buildMemberTx(m.id, sav, ln, rep);
      bodyEl.innerHTML =
        tx.length === 0
          ? '<p style="color:var(--text-muted);font-size:12px;">No transactions yet.</p>'
          : tx
              .map((t) => {
                const sign = t.positive ? '+' : '−';
                const cls = t.positive ? 'inflow' : 'outflow';
                const amt = dataService.formatCurrency(t.amount);
                return `
            <div class="txn-row">
              <div class="txn-amount ${cls}">${sign}${amt.replace(/^UGX\s/, '')}</div>
              <div class="txn-detail">
                <div class="txn-label">${t.label}</div>
                <div class="txn-date">${t.date}</div>
              </div>
            </div>`;
              })
              .join('');
    }

    if (innerTab === 'Loans') {
      bodyEl.innerHTML =
        ml.length === 0
          ? '<p style="color:var(--text-muted);font-size:12px;">No loans.</p>'
          : ml
              .map((l) => {
                const bal = loanBalance(l, rep);
                const pct = Number(l.amount) > 0 ? Math.round(((Number(l.amount) - bal) / Number(l.amount)) * 100) : 0;
                const editing = editLoanId === l.id;
                return `
            <div class="section-card" style="margin-bottom:12px;" data-loan-card="${l.id}">
              <div style="padding:14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                  <span class="txn-label">Loan #${l.id}</span>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span class="badge ${(l.status || '').toLowerCase() === 'active' ? 'amber' : 'muted'}">${l.status || ''}</span>
                    <button type="button" class="btn btn-ghost btn-sm sacco-edit-loan" data-id="${l.id}">${editing ? 'Close' : 'Edit figures'}</button>
                    <button type="button" class="btn btn-ghost btn-sm sacco-open-loan" data-id="${l.id}">Repayments</button>
                  </div>
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin:6px 0;">Issued ${l.issue_date || ''}</div>
                <div class="loan-progress-track"><div class="loan-progress-fill" style="width:${pct}%;"></div></div>
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:8px;">
                  <span>Remaining</span>
                  <strong>${dataService.formatCurrency(bal)}</strong>
                </div>
                ${
                  editing
                    ? `
                <form class="sacco-loan-edit-form mt-16" style="border-top:1px solid var(--border-subtle);padding-top:12px;display:flex;flex-direction:column;gap:8px;" data-loan-id="${l.id}">
                  <input class="form-input" name="amount" type="number" min="0" step="0.01" value="${Number(l.amount) || 0}" placeholder="Principal (UGX)" required />
                  <input class="form-input" name="interest_rate" type="number" min="0" step="0.1" value="${Number(l.interest_rate) || 0}" placeholder="Interest % (annual or monthly — your convention)" />
                  <input class="form-input" name="term_months" type="number" min="1" step="1" value="${Number(l.term_months) || 12}" placeholder="Term (months)" />
                  <input class="form-input" name="issue_date" type="date" value="${l.issue_date || ''}" />
                  <input class="form-input" name="due_date" type="date" value="${l.due_date || ''}" />
                  <select class="form-input" name="status">
                    <option value="Active" ${(l.status || '') === 'Active' ? 'selected' : ''}>Active</option>
                    <option value="Closed" ${(l.status || '') === 'Closed' ? 'selected' : ''}>Closed</option>
                    <option value="Defaulted" ${(l.status || '') === 'Defaulted' ? 'selected' : ''}>Defaulted</option>
                  </select>
                  <button type="submit" class="btn btn-primary">Save loan</button>
                </form>`
                    : ''
                }
              </div>
            </div>`;
              })
              .join('');
      bodyEl.querySelectorAll('.sacco-edit-loan').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = Number(btn.dataset.id);
          editLoanId = editLoanId === id ? null : id;
          renderInner();
        });
      });
      bodyEl.querySelectorAll('.sacco-loan-edit-form').forEach((form) => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const id = Number(form.dataset.loanId);
          const fd = new FormData(form);
          await dataService.updateSaccoLoan(id, {
            amount: Number(fd.get('amount')),
            interest_rate: Number(fd.get('interest_rate') || 0),
            term_months: Number(fd.get('term_months') || 12),
            issue_date: String(fd.get('issue_date') || ''),
            due_date: String(fd.get('due_date') || ''),
            status: String(fd.get('status') || 'Active'),
          });
          await persistAndRefresh();
        });
      });
      bodyEl.querySelectorAll('.sacco-open-loan').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = Number(btn.dataset.id);
          const loan = ln.find((x) => x.id === id);
          if (loan) {
            const reloadLoans = async () => {
              const [loans2, rep2] = await Promise.all([dataService.getSaccoLoans(), dataService.getSaccoRepayments()]);
              return { loans: loans2, repayments: rep2 };
            };
            openLoanPanel(loan, rep, onRefresh, reloadLoans);
          }
        });
      });
    }

    if (innerTab === 'Savings') {
      const rows = sav.filter((s) => s.member_id === m.id);
      bodyEl.innerHTML =
        rows.length === 0
          ? '<p style="color:var(--text-muted);font-size:12px;">No savings records.</p>'
          : rows
              .map((s) => {
                const editing = editSavingId === s.id;
                return `
          <div class="section-card" style="margin-bottom:10px;padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
              <div class="txn-row" style="flex:1;min-width:200px;">
                <div class="txn-amount inflow">+${dataService.formatCurrency(Number(s.amount)).replace(/^UGX\s/, '')}</div>
                <div class="txn-detail">
                  <div class="txn-label">Deposit</div>
                  <div class="txn-date">${s.deposit_date || ''} · ${s.method || ''}</div>
                </div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm sacco-edit-saving" data-id="${s.id}">${editing ? 'Close' : 'Edit'}</button>
            </div>
            ${
              editing
                ? `
            <form class="sacco-saving-edit-form mt-12" style="display:flex;flex-direction:column;gap:8px;" data-saving-id="${s.id}">
              <input class="form-input" name="amount" type="number" min="0" step="0.01" value="${Number(s.amount) || 0}" required />
              <input class="form-input" name="deposit_date" type="date" value="${s.deposit_date || ''}" required />
              <input class="form-input" name="method" value="${(s.method || '').replace(/"/g, '&quot;')}" placeholder="Method" />
              <input class="form-input" name="notes" value="${(s.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes" />
              <button type="submit" class="btn btn-primary">Save deposit</button>
            </form>`
                : ''
            }
          </div>`;
              })
              .join('');
      bodyEl.querySelectorAll('.sacco-edit-saving').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = Number(btn.dataset.id);
          editSavingId = editSavingId === id ? null : id;
          renderInner();
        });
      });
      bodyEl.querySelectorAll('.sacco-saving-edit-form').forEach((form) => {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const id = Number(form.dataset.savingId);
          const fd = new FormData(form);
          await dataService.updateSaccoSaving(id, {
            member_id: m.id,
            amount: Number(fd.get('amount')),
            deposit_date: String(fd.get('deposit_date') || ''),
            method: String(fd.get('method') || 'Cash'),
            notes: String(fd.get('notes') || ''),
          });
          await persistAndRefresh();
        });
      });
    }

    refreshHeader();
  }

  backdrop.querySelector('.side-panel-close').addEventListener('click', closePanel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closePanel();
  });

  document.body.appendChild(backdrop);
  renderInner();
}

function openLoanPanel(loan, repayments, onRefresh, reloadLoanContext) {
  closePanel();
  let l = { ...loan };
  let allRep = repayments;
  let editRepId = null;

  async function persistAndRefresh() {
    await onRefresh();
    if (reloadLoanContext) {
      const d = await reloadLoanContext();
      const next = d.loans.find((x) => x.id === l.id);
      if (!next) {
        closePanel();
        return;
      }
      l = next;
      allRep = d.repayments;
    }
    editRepId = null;
    refreshLoanHeader();
    renderLoanBody();
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'side-panel-backdrop';
  backdrop.innerHTML = `
    <div class="side-panel">
      <div class="side-panel-header">
        <div>
          <div class="member-hero-name" id="loan-panel-title">Loan #${l.id}</div>
          <div id="loan-panel-member" style="font-size:12px;color:var(--text-secondary);margin-top:6px;">${l.member_name || 'Member'}</div>
          <div class="member-hero-stats" style="margin-top:14px;">
            <div class="member-stat-pill">
              <div class="lbl">Principal</div>
              <div class="val" id="loan-panel-principal">—</div>
            </div>
            <div class="member-stat-pill">
              <div class="lbl">Remaining</div>
              <div class="val" id="loan-panel-remaining">—</div>
            </div>
          </div>
        </div>
        <button type="button" class="side-panel-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="side-panel-body" id="loan-panel-body"></div>
    </div>
  `;

  const bodyRoot = backdrop.querySelector('#loan-panel-body');

  function refreshLoanHeader() {
    const bal = loanBalance(l, allRep);
    const principal = Number(l.amount || 0);
    backdrop.querySelector('#loan-panel-principal').textContent = dataService.formatCurrency(principal);
    backdrop.querySelector('#loan-panel-remaining').textContent = dataService.formatCurrency(bal);
  }

  function renderLoanBody() {
    const bal = loanBalance(l, allRep);
    const principal = Number(l.amount || 0);
    const pct = principal > 0 ? Math.round(((principal - bal) / principal) * 100) : 0;
    const paid = principal - bal;
    const nextPay = Math.min(bal, Math.max(Math.round(bal / 6), 50000));
    const reps = allRep.filter((r) => r.loan_id === l.id);

    bodyRoot.innerHTML = `
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Edit principal, rates, and repayment lines. Amounts in UGX.</p>
      <form id="sacco-loan-panel-form" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border-subtle);">
        <div class="kpi-label">Loan terms</div>
        <input class="form-input" name="amount" type="number" min="0" step="0.01" value="${principal}" required />
        <label class="form-label" style="font-size:11px;margin:0;">Interest rate (%) <span style="font-weight:400;color:var(--text-muted);">— annual or monthly, as you record it</span></label>
        <input class="form-input" name="interest_rate" type="number" min="0" step="0.1" value="${Number(l.interest_rate) || 0}" />
        <input class="form-input" name="term_months" type="number" min="1" step="1" value="${Number(l.term_months) || 12}" />
        <input class="form-input" name="issue_date" type="date" value="${l.issue_date || ''}" />
        <input class="form-input" name="due_date" type="date" value="${l.due_date || ''}" />
        <select class="form-input" name="status">
          <option value="Active" ${(l.status || '') === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Closed" ${(l.status || '') === 'Closed' ? 'selected' : ''}>Closed</option>
          <option value="Defaulted" ${(l.status || '') === 'Defaulted' ? 'selected' : ''}>Defaulted</option>
        </select>
        <button type="submit" class="btn btn-primary">Save loan figures</button>
      </form>
      <div class="loan-progress-track"><div class="loan-progress-fill" style="width:${pct}%;"></div></div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:8px;">${pct}% repaid · ${dataService.formatCurrency(paid)} paid to date</p>
      <div class="member-stat-pill" style="margin-top:20px;">
        <div class="lbl">Suggested next payment</div>
        <div class="val">${dataService.formatCurrency(nextPay)}</div>
      </div>
      <div class="section-title mt-16">Repayment history</div>
      <div class="section-card" style="margin-bottom:16px;padding:12px;">
        <div class="kpi-label" style="margin-bottom:8px;">Log repayment</div>
        <p style="font-size:11px;color:var(--text-muted);margin:0 0 8px 0;">Record a payment against this loan (also available from SACCO overview → Add repayment).</p>
        <form id="sacco-loan-new-repay-form" style="display:flex;flex-direction:column;gap:8px;">
          <input class="form-input" name="amount" type="number" min="0" step="0.01" placeholder="Amount (UGX)" required />
          <input class="form-input" name="repayment_date" type="date" value="${today()}" required />
          <input class="form-input" name="method" value="Cash" placeholder="Method" />
          <input class="form-input" name="notes" placeholder="Notes (optional)" />
          <button type="submit" class="btn btn-primary">Record repayment</button>
        </form>
      </div>
      ${
        reps.length === 0
          ? '<p style="color:var(--text-muted);font-size:12px;">No repayments recorded yet.</p>'
          : reps
              .map((r) => {
                const editing = editRepId === r.id;
                return `
        <div class="section-card" style="margin-bottom:10px;padding:12px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
            <div class="txn-row" style="flex:1;">
              <div class="txn-amount outflow">−${dataService.formatCurrency(Number(r.amount)).replace(/^UGX\s/, '')}</div>
              <div class="txn-detail">
                <div class="txn-label">Repayment</div>
                <div class="txn-date">${r.repayment_date || ''} · ${r.method || ''}</div>
              </div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm sacco-edit-repay" data-id="${r.id}">${editing ? 'Close' : 'Edit'}</button>
          </div>
          ${
            editing
              ? `
          <form class="sacco-repay-edit-form mt-12" style="display:flex;flex-direction:column;gap:8px;" data-repay-id="${r.id}">
            <input class="form-input" name="amount" type="number" min="0" step="0.01" value="${Number(r.amount) || 0}" required />
            <input class="form-input" name="repayment_date" type="date" value="${r.repayment_date || ''}" required />
            <input class="form-input" name="method" value="${(r.method || '').replace(/"/g, '&quot;')}" placeholder="Method" />
            <input class="form-input" name="notes" value="${(r.notes || '').replace(/"/g, '&quot;')}" placeholder="Notes" />
            <button type="submit" class="btn btn-primary">Save repayment</button>
          </form>`
              : ''
          }
        </div>`;
              })
              .join('')
      }
    `;

    bodyRoot.querySelector('#sacco-loan-panel-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await dataService.updateSaccoLoan(l.id, {
        amount: Number(fd.get('amount')),
        interest_rate: Number(fd.get('interest_rate') || 0),
        term_months: Number(fd.get('term_months') || 12),
        issue_date: String(fd.get('issue_date') || ''),
        due_date: String(fd.get('due_date') || ''),
        status: String(fd.get('status') || 'Active'),
      });
      await persistAndRefresh();
    });

    bodyRoot.querySelector('#sacco-loan-new-repay-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const amt = Number(fd.get('amount'));
      if (!Number.isFinite(amt) || amt <= 0) return;
      await dataService.addSaccoRepayment({
        loan_id: l.id,
        amount: amt,
        repayment_date: String(fd.get('repayment_date') || today()),
        method: String(fd.get('method') || 'Cash'),
        notes: String(fd.get('notes') || ''),
      });
      e.target.reset();
      const dateInput = e.target.querySelector('input[name="repayment_date"]');
      if (dateInput) dateInput.value = today();
      const methodInput = e.target.querySelector('input[name="method"]');
      if (methodInput) methodInput.value = 'Cash';
      await persistAndRefresh();
    });

    bodyRoot.querySelectorAll('.sacco-edit-repay').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = Number(btn.dataset.id);
        editRepId = editRepId === id ? null : id;
        renderLoanBody();
      });
    });

    bodyRoot.querySelectorAll('.sacco-repay-edit-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = Number(form.dataset.repayId);
        const fd = new FormData(form);
        await dataService.updateSaccoRepayment(id, {
          loan_id: l.id,
          amount: Number(fd.get('amount')),
          repayment_date: String(fd.get('repayment_date') || ''),
          method: String(fd.get('method') || 'Cash'),
          notes: String(fd.get('notes') || ''),
        });
        await persistAndRefresh();
      });
    });

    refreshLoanHeader();
  }

  backdrop.querySelector('.side-panel-close').addEventListener('click', closePanel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closePanel();
  });
  document.body.appendChild(backdrop);
  renderLoanBody();
}

let hubTab = 'overview';

/** Shared “Add records” toolbar — also shown on Members & Loans tabs so SACCO isn’t edit-only from Overview. */
function saccoQuickActionsCardHtml() {
  return `
    <div class="section-card sacco-overview-actions" style="margin-bottom:20px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;">Add records</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
        <button type="button" class="btn btn-primary" id="sacco-btn-add-member" style="display:inline-flex;align-items:center;gap:6px;">
          <span class="material-symbols-outlined" style="font-size:20px;">person_add</span>
          Add member
        </button>
        <button type="button" class="btn btn-primary" id="sacco-btn-add-saving" style="display:inline-flex;align-items:center;gap:6px;">
          <span class="material-symbols-outlined" style="font-size:20px;">savings</span>
          Record saving
        </button>
        <button type="button" class="btn btn-primary" id="sacco-btn-add-loan" style="display:inline-flex;align-items:center;gap:6px;">
          <span class="material-symbols-outlined" style="font-size:20px;">account_balance</span>
          Issue loan
        </button>
        <button type="button" class="btn btn-primary" id="sacco-btn-add-repayment" style="display:inline-flex;align-items:center;gap:6px;">
          <span class="material-symbols-outlined" style="font-size:20px;">payments</span>
          Add repayment
        </button>
        <button type="button" class="btn btn-ghost" id="sacco-btn-export-excel" style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-subtle);">
          <span class="material-symbols-outlined" style="font-size:20px;">table</span>
          Export Excel Report
        </button>
        <button type="button" class="btn btn-ghost" id="sacco-btn-export-word" style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-subtle);">
          <span class="material-symbols-outlined" style="font-size:20px;">description</span>
          Download Word Report
        </button>
        <button type="button" class="btn btn-ghost" id="sacco-btn-import-payroll" style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-subtle);">
          <span class="material-symbols-outlined" style="font-size:20px;">upload_file</span>
          Import payroll (Excel)
        </button>
      </div>
    </div>`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

async function renderOverviewTab(container, data, refresh) {
  const { summary, members, loans, savings, repayments } = data;
  const year = new Date().getFullYear();
  let wb = null;
  try {
    wb = await dataService.getSalaryWorkbookSaccoStats({ year });
  } catch {
    wb = null;
  }
  const useWb = wb && wb.ok === true && (!members || members.length === 0);

  const dist = useWb ? { bins: wb.loanBins, max: wb.maxLoanBin } : loanDistribution(loans, repayments);
  const savSeries = useWb ? wb.savSeries : savingsByMonth(savings);
  const maxSav = Math.max(...savSeries.map((s) => s.value), 1);

  const summaryKpi = useWb
    ? {
        members: wb.members,
        totalSavings: wb.totalSavingsPayroll,
        outstandingLoans: wb.outstandingLoanBalance,
      }
    : summary;
  const activeLoanKpi = useWb ? wb.activeLoans : loans.filter((l) => (l.status || '').toLowerCase() === 'active').length;

  const activities = [];
  savings.slice(0, 4).forEach((s) => {
    activities.push({ t: `${s.member_name || 'Member'} deposited ${dataService.formatCurrency(Number(s.amount))}`, d: s.deposit_date });
  });
  loans.slice(0, 2).forEach((l) => {
    activities.push({ t: `${l.member_name || 'Member'} — loan ${dataService.formatCurrency(Number(l.amount))}`, d: l.issue_date });
  });
  repayments.slice(0, 4).forEach((r) => {
    activities.push({ t: `Repayment ${dataService.formatCurrency(Number(r.amount))}`, d: r.repayment_date });
  });

  const wbNote = useWb
    ? `<p style="font-size:11px;color:var(--text-secondary);margin:0 0 16px;line-height:1.5;max-width:900px;">
        Showing <strong>salary workbook</strong> data (${wb.monthSheetsFound} month sheet(s), ${year}): savings = sum of “saving” per month; members &amp; loan balances from the latest row per staff (merged across sheets). SACCO ledger totals may differ until you import/post payroll.
      </p>`
    : '';

  const wbFailNote =
    wb && wb.ok === false
      ? `<div class="section-card" style="margin-bottom:16px;padding:12px 14px;border-left:3px solid #f59e0b;background:var(--bg-overlay);">
          <p style="margin:0;font-size:12px;line-height:1.5;color:var(--text-secondary);">
            <strong>Salary workbook not loaded.</strong>
            ${
              wb.error === 'file_not_found'
                ? 'Place <code style="font-size:10px;">salary payments-4 (1).xlsx</code> in the project <code>docs</code> folder (or run the app from the repo root), or use <strong>Import payroll (Excel)</strong> on Members / Loans.'
                : String(wb.error || '')
            }
          </p>
        </div>`
      : '';

  container.innerHTML = `
    ${wbFailNote}
    ${wbNote}
    <div class="kpi-grid" style="margin-bottom:20px;">
      <div class="kpi-card"><div class="kpi-label">Total savings</div><div class="kpi-value green">${dataService.formatCurrency(summaryKpi.totalSavings)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active loans</div><div class="kpi-value">${activeLoanKpi}</div></div>
      <div class="kpi-card red-border"><div class="kpi-label">Outstanding balance</div><div class="kpi-value red">${dataService.formatCurrency(summaryKpi.outstandingLoans)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Members</div><div class="kpi-value">${summaryKpi.members}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;" class="sacco-mid-grid">
      <div class="chart-card">
        <h3>Savings growth</h3>
        <div class="chart-bars-row" style="height:140px;padding:0 8px;">
          ${savSeries
            .map((s) => {
              const h = Math.round((s.value / maxSav) * 100);
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;"><div class="chart-bar" style="height:${h}%;min-height:${s.value > 0 ? 4 : 0}px;width:100%;max-width:36px;"></div><div class="chart-bar-label">${s.key.slice(5)}</div></div>`;
            })
            .join('')}
        </div>
      </div>
      <div class="chart-card">
        <h3>Loan distribution (active)</h3>
        <div style="padding:12px 8px;">
          ${['<1M', '1–3M', '3–5M', '5M+']
            .map((label, i) => {
              const v = [dist.bins.under1, dist.bins.m1to3, dist.bins.m3to5, dist.bins.over5][i];
              const h = Math.round((v / dist.max) * 100);
              return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><span style="width:48px;font-size:10px;color:var(--text-muted);">${label}</span><div style="flex:1;height:10px;background:var(--bg-overlay);border-radius:99px;overflow:hidden;"><div class="chart-bar secondary" style="height:100%;width:${h}%;min-width:${v ? 8 : 0}px;border-radius:99px;"></div></div><span style="font-size:11px;font-weight:700;width:20px;">${v}</span></div>`;
            })
            .join('')}
        </div>
      </div>
    </div>

    ${saccoQuickActionsCardHtml()}

    <div class="section-card" style="margin-bottom:20px;">
      <div class="activity-feed-header">Recent transactions</div>
      <div class="activity-feed" style="border:none;">
        ${activities
          .slice(0, 10)
          .map(
            (a) => `
          <div class="activity-item">
            <div class="activity-icon sacco"><span class="material-symbols-outlined" style="font-size:18px;">swap_horiz</span></div>
            <div class="activity-body"><div class="activity-title">${a.t}</div><div class="activity-meta">${a.d || ''}</div></div>
          </div>`
          )
          .join('')}
      </div>
    </div>
  `;

  bindSaccoOverviewActions(container, members, loans, refresh);
}

function addMemberFormHtml() {
  return `
    <form id="add-member-form" style="display:flex;flex-direction:column;gap:10px;">
      <input class="form-input" name="member_no" placeholder="Member No" required />
      <input class="form-input" name="full_name" placeholder="Full name" required />
      <input class="form-input" name="phone" placeholder="Phone" />
      <button class="btn btn-primary" type="submit">Save member</button>
    </form>`;
}

function addSavingFormHtml(members) {
  return `
    <form id="add-saving-form" style="display:flex;flex-direction:column;gap:10px;">
      <select class="form-input" name="member_id" required><option value="">Select member</option>${members.map((m) => `<option value="${m.id}">${m.member_no} — ${m.full_name}</option>`).join('')}</select>
      <input class="form-input" name="amount" type="number" min="0" step="0.01" placeholder="Amount (UGX)" required />
      <input class="form-input" name="deposit_date" type="date" value="${today()}" required />
      <button class="btn btn-primary" type="submit">Save deposit</button>
    </form>`;
}

function addLoanFormHtml(members) {
  const t = today();
  return `
    <form id="add-loan-form" style="display:flex;flex-direction:column;gap:12px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">Member</label>
        <select class="form-input" name="member_id" required>
          <option value="">Select member</option>
          ${members.map((m) => `<option value="${m.id}">${m.member_no} — ${m.full_name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Principal (UGX)</label>
        <input class="form-input" name="amount" type="number" min="0" step="1" required placeholder="e.g. 2000000" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Interest rate (%)</label>
          <input class="form-input" name="interest_rate" type="number" min="0" step="0.1" value="12" />
          <select class="form-input" name="interest_basis" style="margin-top:6px;font-size:12px;">
            <option value="annual">Annual (% p.a.)</option>
            <option value="monthly">Monthly (% per month)</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Term (months)</label>
          <input class="form-input" name="term_months" type="number" min="1" step="1" value="12" required />
        </div>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Repayment schedule <span style="font-weight:400;color:var(--text-muted);">(for estimates)</span></label>
        <select class="form-input" name="repayment_schedule">
          <option value="monthly">Monthly instalments</option>
          <option value="weekly">Weekly instalments</option>
          <option value="bullet">Single payment at end</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Issue date</label>
          <input class="form-input" name="issue_date" type="date" value="${t}" required />
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Due date <span style="font-weight:400;color:var(--text-muted);">(from term)</span></label>
          <input class="form-input" id="loan-due-readonly" type="text" readonly tabindex="-1" style="opacity:0.95;cursor:default;" value="" />
        </div>
      </div>
      <div class="section-card" style="padding:12px 14px;margin:0;background:var(--bg-overlay);border-color:var(--border-subtle);">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:10px;">Loan preview</div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;">
          <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">Est. interest (flat)</span><strong id="loan-pv-interest">—</strong></div>
          <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);">Total repayable</span><strong id="loan-pv-total">—</strong></div>
          <div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--text-secondary);" id="loan-pv-install-label">Est. instalment</span><strong id="loan-pv-installment">—</strong></div>
        </div>
        <p style="font-size:10px;color:var(--text-muted);margin:10px 0 0;line-height:1.45;">Estimates use flat interest: choose <strong>annual</strong> or <strong>monthly</strong> above so the preview matches how you quoted the rate. The saved loan stores one % figure—keep your own note if it is monthly vs annual. Outstanding balance still follows principal minus repayments in the ledger.</p>
      </div>
      <button class="btn btn-primary" type="submit">Create loan</button>
    </form>`;
}

function wireIssueLoanPreview(backdrop) {
  const form = backdrop.querySelector('#add-loan-form');
  if (!form) return;
  const dueEl = form.querySelector('#loan-due-readonly');
  const pvInterest = backdrop.querySelector('#loan-pv-interest');
  const pvTotal = backdrop.querySelector('#loan-pv-total');
  const pvInstall = backdrop.querySelector('#loan-pv-installment');
  const pvInstallLabel = backdrop.querySelector('#loan-pv-install-label');

  const upd = () => {
    const fd = new FormData(form);
    const P = Number(fd.get('amount')) || 0;
    const rate = Number(fd.get('interest_rate')) || 0;
    const basis = String(fd.get('interest_basis') || 'annual');
    const term = Math.max(1, Math.round(Number(fd.get('term_months')) || 12));
    const sched = String(fd.get('repayment_schedule') || 'monthly');
    const issue = String(fd.get('issue_date') || today());
    const due = addMonthsToIsoDate(issue, term);
    if (dueEl) dueEl.value = due;

    const { interest, totalRepayable, installment, installmentLabel } = computeLoanPreview(
      P,
      rate,
      term,
      sched,
      basis
    );
    if (pvInterest) pvInterest.textContent = dataService.formatCurrency(interest);
    if (pvTotal) pvTotal.textContent = dataService.formatCurrency(totalRepayable);
    if (pvInstall) pvInstall.textContent = dataService.formatCurrency(installment);
    if (pvInstallLabel) pvInstallLabel.textContent = installmentLabel;
  };

  form.querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('input', upd);
    el.addEventListener('change', upd);
  });
  upd();
}

function addRepaymentFormHtml(loans) {
  return `
    <form id="add-repayment-form" style="display:flex;flex-direction:column;gap:10px;">
      <select class="form-input" name="loan_id" required><option value="">Select loan</option>${loans.map((l) => `<option value="${l.id}">#${l.id} — ${l.member_name || ''}</option>`).join('')}</select>
      <input class="form-input" name="amount" type="number" min="0" step="0.01" placeholder="Amount (UGX)" required />
      <input class="form-input" name="repayment_date" type="date" value="${today()}" required />
      <button class="btn btn-primary" type="submit">Save repayment</button>
    </form>`;
}

function bindSaccoOverviewActions(container, members, loans, refresh) {
  const afterSave = async () => {
    closeSaccoModal();
    await refresh();
  };

  container.querySelector('#sacco-btn-add-member')?.addEventListener('click', () => {
    const bd = openSaccoModal('Add member', addMemberFormHtml());
    bd.querySelector('#add-member-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await dataService.addSaccoMember({
        member_no: String(fd.get('member_no') || '').trim(),
        full_name: String(fd.get('full_name') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        join_date: today(),
        status: 'Active',
      });
      await afterSave();
    });
  });

  container.querySelector('#sacco-btn-add-saving')?.addEventListener('click', () => {
    const bd = openSaccoModal('Record saving', addSavingFormHtml(members));
    bd.querySelector('#add-saving-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await dataService.addSaccoSaving({
        member_id: Number(fd.get('member_id')),
        amount: Number(fd.get('amount')),
        deposit_date: String(fd.get('deposit_date') || ''),
        method: 'Cash',
      });
      await afterSave();
    });
  });

  container.querySelector('#sacco-btn-add-loan')?.addEventListener('click', () => {
    const bd = openSaccoModal('Issue loan', addLoanFormHtml(members), { maxWidth: '520px' });
    wireIssueLoanPreview(bd);
    bd.querySelector('#add-loan-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const termM = Math.max(1, Math.round(Number(fd.get('term_months')) || 12));
      const issue = String(fd.get('issue_date') || today());
      const due = addMonthsToIsoDate(issue, termM);
      await dataService.addSaccoLoan({
        member_id: Number(fd.get('member_id')),
        amount: Number(fd.get('amount')),
        interest_rate: Number(fd.get('interest_rate') || 0),
        term_months: termM,
        issue_date: issue,
        due_date: due,
        status: 'Active',
      });
      await afterSave();
    });
  });

  container.querySelector('#sacco-btn-export-excel')?.addEventListener('click', async () => {
    showToast('Generating SACCO Excel Report…');
    try {
      const XLSX = await import('../../../../node_modules/xlsx/xlsx.mjs');
      const [mList, sList, lList, rList] = await Promise.all([
        dataService.getSaccoMembers(),
        dataService.getSaccoSavings(),
        dataService.getSaccoLoans(),
        dataService.getSaccoRepayments(),
      ]);

      const wb = XLSX.utils.book_new();
      const totSav = sList.reduce((s, r) => s + Number(r.amount || 0), 0);
      const totLoans = lList.reduce((s, r) => s + Number(r.amount || 0), 0);
      const totRep = rList.reduce((s, r) => s + Number(r.amount || 0), 0);

      const execRows = [
        { Metric: 'Total SACCO Members', Value: mList.length },
        { Metric: 'Total Accumulated Savings', Value: `UGX ${totSav.toLocaleString()}` },
        { Metric: 'Total Active Loan Principal', Value: `UGX ${totLoans.toLocaleString()}` },
        { Metric: 'Total Loan Repayments Collected', Value: `UGX ${totRep.toLocaleString()}` },
        { Metric: 'Outstanding Loan Balance', Value: `UGX ${Math.max(totLoans - totRep, 0).toLocaleString()}` },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(execRows), 'Summary');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mList.map(m => ({ 'Member No': m.member_no, 'Full Name': m.full_name, 'Phone': m.phone || '', 'Status': m.status }))), 'Members');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sList.map(s => ({ 'Date': s.deposit_date, 'Member ID': s.member_id, 'Amount (UGX)': s.amount, 'Notes': s.notes || '' }))), 'Savings');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lList.map(l => ({ 'Loan ID': l.id, 'Member ID': l.member_id, 'Principal (UGX)': l.amount, 'Interest Rate': `${l.interest_rate}%`, 'Date': l.issue_date, 'Status': l.status }))), 'Loans');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rList.map(r => ({ 'Date': r.repayment_date, 'Loan ID': r.loan_id, 'Amount (UGX)': r.amount, 'Notes': r.notes || '' }))), 'Repayments');

      const fileName = `SACCO_Performance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (typeof XLSX.writeFileXLSX === 'function') {
        XLSX.writeFileXLSX(wb, fileName);
      } else {
        XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
      }
      showToast('SACCO Excel Report downloaded!');
    } catch (err) {
      showToast('Failed to export SACCO report: ' + String(err.message || err));
    }
  });

  container.querySelector('#sacco-btn-export-word')?.addEventListener('click', async () => {
    showToast('Generating SACCO Word Report…');
    try {
      const [mList, sList, lList, rList] = await Promise.all([
        dataService.getSaccoMembers(),
        dataService.getSaccoSavings(),
        dataService.getSaccoLoans(),
        dataService.getSaccoRepayments(),
      ]);

      const totSav = sList.reduce((s, r) => s + Number(r.amount || 0), 0);
      const totLoans = lList.reduce((s, r) => s + Number(r.amount || 0), 0);
      const totRep = rList.reduce((s, r) => s + Number(r.amount || 0), 0);

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>SACCO Performance & Loan Book Report</title>
  <style>
    @page { size: A4 landscape; margin: 1.2cm; }
    body { font-family: "Book Antiqua", Georgia, serif; font-size: 10pt; color: #0f172a; margin: 0; }
    h1 { font-size: 16pt; color: #0f172a; margin: 0 0 4pt; }
    h2 { font-size: 12pt; color: #1e293b; margin: 12pt 0 6pt; border-bottom: 1pt solid #cbd5e1; padding-bottom: 3pt; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; table-layout: fixed; }
    th, td { border-bottom: 0.75pt solid #cbd5e1; padding: 5pt 6pt; vertical-align: top; font-size: 9pt; word-break: break-word; }
    th { background: #1e3a5f; color: #ffffff; text-align: left; font-weight: bold; }
    .num { text-align: right; }
  </style>
</head>
<body>
  <h1>NYAKAMENTA FARM WORKERS SACCO</h1>
  <p style="font-size:10pt;color:#64748b;">Master Performance & Loan Book Report · Generated ${new Date().toLocaleDateString('en-GB')}</p>
  
  <h2>1. Financial Summary</h2>
  <table>
    <thead><tr><th>Metric</th><th class="num">Value</th></tr></thead>
    <tbody>
      <tr><td>Total Registered Members</td><td class="num">${mList.length} Members</td></tr>
      <tr><td>Total Accumulated Savings</td><td class="num">${dataService.formatCurrency(totSav)}</td></tr>
      <tr><td>Total Active Loan Principal Issued</td><td class="num">${dataService.formatCurrency(totLoans)}</td></tr>
      <tr><td>Total Loan Repayments Collected</td><td class="num">${dataService.formatCurrency(totRep)}</td></tr>
      <tr><td>Outstanding Loan Balance</td><td class="num">${dataService.formatCurrency(Math.max(totLoans - totRep, 0))}</td></tr>
    </tbody>
  </table>

  <h2>2. Member Savings Balances (${mList.length} Members)</h2>
  <table>
    <thead><tr><th>Member No</th><th>Full Name</th><th>Phone</th><th class="num">Accumulated Savings</th><th>Status</th></tr></thead>
    <tbody>
      ${mList.map(m => {
        const memSav = sList.filter(s => s.member_id === m.id).reduce((sum, r) => sum + Number(r.amount || 0), 0);
        return `<tr><td>${m.member_no || '—'}</td><td>${m.full_name || ''}</td><td>${m.phone || '—'}</td><td class="num"><strong>${dataService.formatCurrency(memSav)}</strong></td><td>${m.status || 'Active'}</td></tr>`;
      }).join('')}
      <tr style="font-weight:bold;background:#f8fafc;">
        <td colspan="3">Total All Members Savings</td>
        <td class="num">${dataService.formatCurrency(totSav)}</td>
        <td>Active</td>
      </tr>
    </tbody>
  </table>

  <h2>3. SACCO Loan Accounts & Status (${lList.length} Loans)</h2>
  <table>
    <thead><tr><th>Loan ID</th><th>Member Name</th><th class="num">Principal Issued</th><th class="num">Repaid</th><th class="num">Balance</th><th>Status</th></tr></thead>
    <tbody>
      ${lList.map(l => {
        const mem = mList.find(m => m.id === l.member_id);
        const reps = rList.filter(r => r.loan_id === l.id).reduce((s, r) => s + Number(r.amount || 0), 0);
        const bal = Math.max(Number(l.amount || 0) - reps, 0);
        const st = bal <= 0 ? 'Paid' : (l.status || 'Active');
        return `<tr><td>#${l.id}</td><td>${mem ? mem.full_name : 'Member'}</td><td class="num">${dataService.formatCurrency(l.amount)}</td><td class="num">${dataService.formatCurrency(reps)}</td><td class="num">${dataService.formatCurrency(bal)}</td><td><strong>${st}</strong></td></tr>`;
      }).join('')}
    </tbody>
  </table>
</body>
</html>`;

      const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SACCO_Performance_Report_${new Date().toISOString().slice(0, 10)}.doc`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('SACCO Word Report downloaded!');
    } catch (err) {
      showToast('Failed to download SACCO report: ' + String(err.message || err));
    }
  });

  container.querySelector('#sacco-btn-add-repayment')?.addEventListener('click', () => {
    const bd = openSaccoModal('Add repayment', addRepaymentFormHtml(loans));
    bd.querySelector('#add-repayment-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await dataService.addSaccoRepayment({
        loan_id: Number(fd.get('loan_id')),
        amount: Number(fd.get('amount')),
        repayment_date: String(fd.get('repayment_date') || ''),
        method: 'Cash',
      });
      await afterSave();
    });
  });

  container.querySelector('#sacco-btn-import-payroll')?.addEventListener('click', async () => {
    const yearStr = window.prompt(
      'Calendar year for month sheet names (e.g. 2026 for "January payments")',
      String(new Date().getFullYear())
    );
    if (yearStr == null) return;
    const year = Number(yearStr);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      showToast('Enter a valid year.');
      return;
    }
    const skipIfExists = window.confirm('Skip months that already have payroll runs?');
    const useExcelNet = window.confirm(
      'Use "Amount to be paid as salary" from Excel for net pay when that column is filled?'
    );
    try {
      if (isWebMode()) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          showToast('Importing payroll…');
          const xlsxBase64 = await fileToBase64(file);
          const r = await dataService.importPayrollFromXlsx({
            xlsxBase64,
            year,
            skipIfExists,
            useExcelNet,
          });
          if (!r.ok) throw new Error(r.error || 'Import failed');
          const n = (r.results || []).filter((x) => x.imported).length;
          showToast(`Payroll import done (${n} month(s)).`);
          await refresh();
        };
        input.click();
      } else {
        showToast('Choose the salary workbook…');
        const r = await dataService.importPayrollFromXlsx({ year, skipIfExists, useExcelNet });
        if (r.canceled) return;
        if (!r.ok) throw new Error(r.error || 'Import failed');
        const n = (r.results || []).filter((x) => x.imported).length;
        const sk = (r.results || []).filter((x) => x.skipped).length;
        showToast(
          `Payroll import: ${n} month(s) imported${sk ? `, ${sk} skipped` : ''}. Summary rows (e.g. “Total”) are skipped. Post the run to SACCO to book savings deposits.`
        );
        await refresh();
      }
    } catch (e) {
      showToast(e.message || String(e));
    }
  });
}

async function renderMembersTab(container, data, refresh) {
  const { members, savings, loans, repayments } = data;

  const reloadMemberContext = async () => {
    const [m2, l2, s2, r2] = await Promise.all([
      dataService.getSaccoMembers(),
      dataService.getSaccoLoans(),
      dataService.getSaccoSavings(),
      dataService.getSaccoRepayments(),
    ]);
    return { members: m2, savings: s2, loans: l2, repayments: r2 };
  };

  if (!members.length) {
    container.innerHTML = `
      ${saccoQuickActionsCardHtml()}
      <div class="section-card" style="padding:28px;text-align:center;color:var(--text-secondary);line-height:1.6;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:var(--text-primary);">No members yet</p>
        <p style="margin:0;font-size:13px;color:var(--text-muted);">Use <strong>Add member</strong> above, then click a row to open savings &amp; loans for that member.</p>
      </div>`;
    bindSaccoOverviewActions(container, members, loans, refresh);
    return;
  }

  let wbPersonSavings = [];
  let wbPersonLoanBalances = [];
  let wbWarn = null;
  try {
    const wb = await dataService.getSalaryWorkbookSaccoStats({ year: new Date().getFullYear() });
    if (wb && wb.ok) {
      if (Array.isArray(wb.personSavings)) wbPersonSavings = wb.personSavings;
      if (Array.isArray(wb.personLoanBalances)) wbPersonLoanBalances = wb.personLoanBalances;
    } else if (wb && wb.ok === false) {
      wbWarn = wb.error || 'file_not_found';
    }
  } catch {
    wbWarn = 'unavailable';
  }

  const rows = members.map((m) => {
    const ledgerSav = memberTotalSavings(m.id, savings);
    const wbSav = workbookSavingForMember(m, wbPersonSavings);
    const sav = ledgerSav > 0 ? ledgerSav : wbSav ?? 0;
    const mLoans = loans.filter((l) => l.member_id === m.id && (l.status || '').toLowerCase() === 'active');
    let loanBalDb = 0;
    mLoans.forEach((l) => {
      loanBalDb += loanBalance(l, repayments);
    });
    const wbLoan = workbookLoanBalanceForMember(m, wbPersonLoanBalances);
    const loanBal = loanBalDb > 0 ? loanBalDb : wbLoan ?? 0;
    return { m, sav, ledgerSav, wbSav, loanBal, loanBalDb, wbLoan };
  });

  const wbBanner =
    wbWarn != null
      ? `<div class="section-card" style="margin-bottom:14px;padding:10px 12px;border-left:3px solid #f59e0b;background:var(--bg-overlay);">
          <p style="margin:0;font-size:11px;line-height:1.45;color:var(--text-secondary);">
            <strong>Workbook savings/loan fallback unavailable.</strong>
            ${
              wbWarn === 'file_not_found'
                ? 'Put <code style="font-size:10px;">salary payments-4 (1).xlsx</code> in <code>docs</code> or use <strong>Import payroll</strong>.'
                : String(wbWarn)
            }
          </p>
        </div>`
      : '';

  container.innerHTML = `
    ${saccoQuickActionsCardHtml()}
    ${wbBanner}
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:16px;">
      <div class="top-bar-search" style="max-width:320px;flex:1;min-width:200px;">
        <span class="material-symbols-outlined">search</span>
        <input type="search" id="member-filter" placeholder="Search name or member no…" />
      </div>
      <select class="form-input" id="member-status-filter" style="width:140px;padding:8px 10px;">
        <option value="">All status</option>
        <option value="Active">Active</option>
        <option value="Inactive">Inactive</option>
      </select>
    </div>
    <div class="section-card">
      <p style="font-size:11px;color:var(--text-muted);margin:0 0 12px;line-height:1.45;max-width:820px;">
        <strong>Savings</strong> shows SACCO <strong>deposit</strong> totals when present. If the ledger is still empty, we show the <strong>cumulative “saving” column</strong> from <code style="font-size:10px;">docs/salary payments</code> month sheets (Jan+Feb+… payroll deductions). After you <strong>post payroll to SACCO</strong>, deposit records replace that fallback. If there are no SACCO loans yet, <strong>Loan</strong> can show the workbook <strong>loan balance</strong> snapshot (latest month per person).
      </p>
      <table class="data-table" id="members-table">
        <thead><tr><th>Name</th><th>Savings</th><th>Loan</th><th>Status</th></tr></thead>
        <tbody>
          ${rows
            .map(
              ({ m, sav, ledgerSav, wbSav, loanBal, loanBalDb, wbLoan }) => {
                const wbSavHint =
                  ledgerSav === 0 && wbSav != null && wbSav > 0
                    ? `<span style="font-size:9px;color:var(--text-muted);display:block;">Workbook total</span>`
                    : '';
                const wbLoanHint =
                  loanBalDb === 0 && wbLoan != null && wbLoan > 0
                    ? `<span style="font-size:9px;color:var(--text-muted);display:block;">Workbook balance</span>`
                    : '';
                return `
            <tr class="member-row" data-id="${m.id}" data-name="${(m.full_name || '').toLowerCase()}" data-no="${(m.member_no || '').toLowerCase()}" data-status="${m.status || ''}">
              <td class="strong">${m.full_name}<div style="font-size:10px;color:var(--text-muted);font-weight:500;">${m.member_no}</div></td>
              <td class="tabular-nums">${dataService.formatCurrency(sav)}${wbSavHint}</td>
              <td class="tabular-nums">${loanBal > 0 ? `${dataService.formatCurrency(loanBal)}${wbLoanHint}` : '—'}</td>
              <td><span class="badge ${(m.status || '').toLowerCase() === 'active' ? 'green' : 'muted'}">${m.status || '—'}</span></td>
            </tr>`;
              }
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  const filter = () => {
    const q = (container.querySelector('#member-filter')?.value || '').toLowerCase();
    const st = container.querySelector('#member-status-filter')?.value || '';
    container.querySelectorAll('.member-row').forEach((tr) => {
      const ok =
        (!q || tr.dataset.name.includes(q) || tr.dataset.no.includes(q)) && (!st || tr.dataset.status === st);
      tr.style.display = ok ? '' : 'none';
    });
  };
  container.querySelector('#member-filter')?.addEventListener('input', filter);
  container.querySelector('#member-status-filter')?.addEventListener('change', filter);

  container.querySelectorAll('.member-row').forEach((tr) => {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      const id = Number(tr.dataset.id);
      const member = members.find((x) => x.id === id);
      if (member) openMemberPanel(member, savings, loans, repayments, refresh, reloadMemberContext);
    });
  });

  bindSaccoOverviewActions(container, members, loans, refresh);
}

async function renderLoansTab(container, data, refresh) {
  const { loans, repayments, members } = data;
  const year = new Date().getFullYear();
  let wb = null;
  try {
    wb = await dataService.getSalaryWorkbookSaccoStats({ year });
  } catch {
    wb = null;
  }
  const wbLoanRows =
    wb && wb.ok && Array.isArray(wb.personLoanBalances)
      ? wb.personLoanBalances.filter((x) => Number(x.loanBalance) > 0)
      : [];

  const reloadLoanContext = async () => {
    const [l2, r2] = await Promise.all([dataService.getSaccoLoans(), dataService.getSaccoRepayments()]);
    return { loans: l2, repayments: r2 };
  };

  const titleFromNameKey = (k) =>
    String(k || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  let bodyHtml = '';
  if (loans.length > 0) {
    bodyHtml = `<table class="data-table">
        <thead><tr><th>Member</th><th>Amount</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>
          ${loans
            .map((l) => {
              const bal = loanBalance(l, repayments);
              const isPaid = bal <= 0;
              const statusText = isPaid ? 'Paid' : (l.status || 'Active');
              const badgeClass = isPaid ? 'green' : ((l.status || '').toLowerCase() === 'active' ? 'amber' : 'muted');
              return `
            <tr class="loan-row" data-loan-id="${l.id}" style="cursor:pointer;">
              <td class="strong">${l.member_name || '—'}</td>
              <td class="tabular-nums">${dataService.formatCurrency(Number(l.amount || 0))}</td>
              <td class="tabular-nums">${dataService.formatCurrency(bal)}</td>
              <td><span class="badge ${badgeClass}">${statusText}</span></td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>`;
  } else if (wbLoanRows.length > 0) {
    const sorted = [...wbLoanRows].sort((a, b) => String(a.nameKey).localeCompare(String(b.nameKey)));
    bodyHtml = `
      <p style="margin:0 0 12px;font-size:11px;color:var(--text-muted);line-height:1.45;max-width:820px;">
        No SACCO ledger loans yet. Showing <strong>loan balance</strong> from the merged salary workbook (latest month per person). Issue loans in the app to track repayments here.
      </p>
      <table class="data-table">
        <thead><tr><th>Member</th><th>Outstanding balance</th><th>Source</th></tr></thead>
        <tbody>
          ${sorted
            .map((row) => {
              const m = (members || []).find((mem) => workbookRowMatchesMember(row, mem));
              const name = titleFromNameKey(row.nameKey);
              const sub = m?.member_no
                ? `<div style="font-size:10px;color:var(--text-muted);font-weight:500;">${m.member_no}</div>`
                : '';
              return `
            <tr class="loan-row-wb">
              <td class="strong">${name}${sub}</td>
              <td class="tabular-nums">${dataService.formatCurrency(Number(row.loanBalance))}</td>
              <td><span class="badge muted">Workbook</span></td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>`;
  } else {
    const hint =
      wb && wb.ok === false
        ? ` Workbook not loaded (${String(wb.error || '')}). Put <code style="font-size:10px;">salary payments-4 (1).xlsx</code> in <code>docs</code> or use <strong>Import payroll</strong>.`
        : '';
    bodyHtml = `<p style="margin:0;padding:20px 16px;color:var(--text-secondary);font-size:13px;line-height:1.5;">No SACCO loans in the ledger yet.${hint} Use <strong>Issue loan</strong> when you record a real facility in the app.</p>`;
  }

  container.innerHTML = `
    ${saccoQuickActionsCardHtml()}
    <div class="section-card">
      ${bodyHtml}
    </div>
  `;

  container.querySelectorAll('.loan-row').forEach((tr) => {
    tr.addEventListener('click', () => {
      const id = Number(tr.dataset.loanId);
      const loan = loans.find((x) => x.id === id);
      if (loan) openLoanPanel(loan, repayments, refresh, reloadLoanContext);
    });
  });

  bindSaccoOverviewActions(container, members || [], loans, refresh);
}

export async function renderSaccoHub(container) {
  const load = async () => {
    const [summary, members, loans, savings, repayments] = await Promise.all([
      dataService.getSaccoSummary(),
      dataService.getSaccoMembers(),
      dataService.getSaccoLoans(),
      dataService.getSaccoSavings(),
      dataService.getSaccoRepayments(),
    ]);
    return { summary, members, loans, savings, repayments };
  };

  const refresh = async () => {
    const data = await load();
    const shell = container.querySelector('#sacco-hub-root');
    if (!shell) return;
    const body = shell.querySelector('#sacco-hub-body');
    if (!['overview', 'members', 'loans', 'accounting'].includes(hubTab)) hubTab = 'overview';
    if (hubTab === 'overview') await renderOverviewTab(body, data, refresh);
    if (hubTab === 'members') await renderMembersTab(body, data, refresh);
    if (hubTab === 'loans') await renderLoansTab(body, data, refresh);
    if (hubTab === 'accounting') await renderAccountingTab(body, refresh);
  };

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">SACCO</h1>
      <p class="page-subtitle">Savings, loans, and members — use <strong>Add records</strong> on Overview, Members, or Loans. <strong>Accounting</strong> is the SACCO ledger (separate from farm finance). Pay lines: <strong>Field Operations → Workers</strong>.</p>
    </div>
    <div id="sacco-hub-root">
      <div class="sacco-hub-tabs">
        ${[
          { id: 'overview', icon: 'dashboard', label: 'Overview' },
          { id: 'members', icon: 'groups', label: 'Members' },
          { id: 'loans', icon: 'account_balance', label: 'Loans' },
          { id: 'accounting', icon: 'menu_book', label: 'Accounting' },
        ]
          .map(
            (t) => `
        <button type="button" class="sacco-hub-tab ${hubTab === t.id ? 'active' : ''}" data-hub-tab="${t.id}">
          <span class="material-symbols-outlined" style="font-size:18px;">${t.icon}</span>${t.label}
        </button>`
          )
          .join('')}
      </div>
      <div id="sacco-hub-body"></div>
    </div>
  `;

  container.querySelectorAll('.sacco-hub-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      hubTab = btn.dataset.hubTab;
      container.querySelectorAll('.sacco-hub-tab').forEach((b) => b.classList.toggle('active', b.dataset.hubTab === hubTab));
      refresh();
    });
  });

  await refresh();
}
