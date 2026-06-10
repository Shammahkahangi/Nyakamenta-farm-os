import { dataService } from '../../services/dataService.js';

function loanBalance(loan, repayments) {
  const paid = repayments.filter((r) => r.loan_id === loan.id).reduce((s, r) => s + Number(r.amount || 0), 0);
  return Math.max(Number(loan.amount || 0) - paid, 0);
}

export async function renderSaccoReports(container) {
  const [members, savings, loans, repayments, financeItems] = await Promise.all([
    dataService.getSaccoMembers(),
    dataService.getSaccoSavings(),
    dataService.getSaccoLoans(),
    dataService.getSaccoRepayments(),
    dataService.getSaccoFinanceItems(),
  ]);

  const totalSavings = savings.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalLoanBook = loans.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalRepaid = repayments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const outstanding = Math.max(totalLoanBook - totalRepaid, 0);
  const revenue = financeItems.filter((f) => f.type === 'Revenue').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenses = financeItems.filter((f) => f.type === 'Expense').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const activeLoans = loans.filter((l) => (l.status || '').toLowerCase() === 'active').length;

  container.innerHTML = `
    <div class="reports-mt-shell">
      <div class="reports-mt-main">
        <div class="reports-mt-header">
          <div>
            <h1 class="page-title">SACCO reports</h1>
            <p class="page-subtitle">Savings, loans, repayments — Growth Gateway–style cards and tables.</p>
          </div>
        </div>

        <div class="reports-mt-grid-3">
          <div class="reports-mt-card">
            <div class="reports-mt-card-h"><h3>Membership</h3><p>Active SACCO members</p></div>
            <div class="reports-mt-card-b">
              <div class="reports-mt-row"><span>Total members</span><span class="reports-mt-val">${members.length}</span></div>
              <div class="reports-mt-row"><span>Active</span><span class="reports-mt-val green">${members.filter((m) => (m.status || '').toLowerCase() === 'active').length}</span></div>
            </div>
          </div>
          <div class="reports-mt-card">
            <div class="reports-mt-card-h"><h3>Savings &amp; loans</h3><p>Portfolio (UGX)</p></div>
            <div class="reports-mt-card-b">
              <div class="reports-mt-row"><span>Total savings</span><span class="reports-mt-val green">${dataService.formatCurrency(totalSavings)}</span></div>
              <div class="reports-mt-row"><span>Loan book</span><span class="reports-mt-val">${dataService.formatCurrency(totalLoanBook)}</span></div>
              <div class="reports-mt-row"><span>Outstanding</span><span class="reports-mt-val red">${dataService.formatCurrency(outstanding)}</span></div>
            </div>
          </div>
          <div class="reports-mt-card">
            <div class="reports-mt-card-h"><h3>Loan activity</h3><p>Active vs portfolio</p></div>
            <div class="reports-mt-card-b">
              <div class="reports-mt-row">
                <span>Active loans</span>
                <div class="reports-mt-progress-wrap">
                  <div class="reports-mt-progress"><span style="width:${loans.length ? Math.round((activeLoans / loans.length) * 100) : 0}%;background:var(--green);"></span></div>
                  <span class="reports-mt-val">${activeLoans}</span>
                </div>
              </div>
              <div class="reports-mt-row"><span>Total loan accounts</span><span class="reports-mt-val">${loans.length}</span></div>
              <div class="reports-mt-row"><span>Repayments recorded</span><span class="reports-mt-val">${repayments.length}</span></div>
            </div>
          </div>
        </div>

        <div class="reports-mt-card" style="margin-bottom:20px;">
          <div class="reports-mt-card-h"><h3>SACCO finance (ledger)</h3><p>Revenue &amp; expense attributed to SACCO</p></div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:1px solid var(--border-subtle);">
            ${[
              { label: 'Revenue', val: dataService.formatCurrency(revenue), cls: 'green' },
              { label: 'Expenses', val: dataService.formatCurrency(expenses), cls: 'red' },
              { label: 'Net', val: dataService.formatCurrency(revenue - expenses), cls: revenue - expenses >= 0 ? 'gold' : 'red' },
            ]
              .map(
                (s, i) => `
            <div style="padding:18px 20px;border-right:${i < 2 ? '1px solid var(--border-subtle)' : 'none'};">
              <div class="kpi-label">${s.label}</div>
              <div class="reports-mt-val ${s.cls}" style="font-size:20px;margin-top:8px;">${s.val}</div>
            </div>`
              )
              .join('')}
          </div>
        </div>

        <div class="section-card reports-mt-table-card">
          <div class="card-header">
            <div>
              <h2 class="card-title">Recent loans</h2>
              <p style="font-size:11px;color:var(--text-muted);margin:4px 0 0;">Outstanding balance estimated from repayments</p>
            </div>
          </div>
          <div style="overflow-x:auto;padding:0 16px 16px;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>ID</th><th>Member</th><th>Principal</th><th>Balance</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${loans.length === 0
                  ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">No loans yet.</td></tr>'
                  : loans
                      .slice(0, 20)
                      .map((l) => {
                        const bal = loanBalance(l, repayments);
                        return `
                    <tr>
                      <td class="strong">#${l.id}</td>
                      <td>${l.member_name || '—'}</td>
                      <td class="tabular-nums">${dataService.formatCurrency(Number(l.amount || 0))}</td>
                      <td class="tabular-nums">${dataService.formatCurrency(bal)}</td>
                      <td><span class="badge ${(l.status || '').toLowerCase() === 'active' ? 'green' : 'muted'}">${l.status || '—'}</span></td>
                    </tr>`;
                      })
                      .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function renderLodgeReports(container) {
  const [units, bookings, payments, expenses] = await Promise.all([
    dataService.getLodgeUnits(),
    dataService.getLodgeBookings(),
    dataService.getLodgePayments(),
    dataService.getLodgeExpenses(),
  ]);

  const occupied = units.filter((u) => (u.status || '').toLowerCase() === 'occupied').length;
  const occupancyRate = units.length > 0 ? Math.round((occupied / units.length) * 100) : 0;
  const revenue = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const cost = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  container.innerHTML = `
    <div class="reports-mt-shell">
      <div class="reports-mt-main">
        <div class="reports-mt-header">
          <div>
            <h1 class="page-title">Lodge reports</h1>
            <p class="page-subtitle">Occupancy, revenue, and costs — card layout aligned with Growth Gateway.</p>
          </div>
        </div>

        <div class="reports-mt-grid-3">
          <div class="reports-mt-card">
            <div class="reports-mt-card-h"><h3>Capacity</h3><p>Units on the system</p></div>
            <div class="reports-mt-card-b">
              <div class="reports-mt-row"><span>Total units</span><span class="reports-mt-val">${units.length}</span></div>
              <div class="reports-mt-row"><span>Occupied</span><span class="reports-mt-val gold">${occupied}</span></div>
            </div>
          </div>
          <div class="reports-mt-card">
            <div class="reports-mt-card-h"><h3>Occupancy rate</h3><p>Share of units occupied</p></div>
            <div class="reports-mt-card-b">
              <div class="reports-mt-row">
                <span>Current</span>
                <div class="reports-mt-progress-wrap">
                  <div class="reports-mt-progress"><span style="width:${occupancyRate}%;background:var(--gold);"></span></div>
                  <span class="reports-mt-val gold">${occupancyRate}%</span>
                </div>
              </div>
            </div>
          </div>
          <div class="reports-mt-card">
            <div class="reports-mt-card-h"><h3>P&amp;L (lodge)</h3><p>Payments vs expenses</p></div>
            <div class="reports-mt-card-b">
              <div class="reports-mt-row"><span>Revenue</span><span class="reports-mt-val green">${dataService.formatCurrency(revenue)}</span></div>
              <div class="reports-mt-row"><span>Costs</span><span class="reports-mt-val red">${dataService.formatCurrency(cost)}</span></div>
              <div class="reports-mt-row"><span>Net</span><span class="reports-mt-val ${revenue - cost < 0 ? 'red' : 'gold'}">${dataService.formatCurrency(revenue - cost)}</span></div>
            </div>
          </div>
        </div>

        <div class="section-card reports-mt-table-card">
          <div class="card-header">
            <div>
              <h2 class="card-title">Recent bookings</h2>
              <p style="font-size:11px;color:var(--text-muted);margin:4px 0 0;">Latest lodge reservations</p>
            </div>
          </div>
          <div style="overflow-x:auto;padding:0 16px 16px;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Guest</th><th>Unit</th><th>Check-in</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${bookings.length === 0
                  ? '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">No bookings yet.</td></tr>'
                  : bookings
                      .slice(0, 16)
                      .map(
                        (b) => `
                  <tr>
                    <td class="strong">${b.guest_name || '—'}</td>
                    <td>${b.unit_code || '—'}</td>
                    <td>${b.check_in || '—'}</td>
                    <td><span class="badge muted">${b.status || '—'}</span></td>
                  </tr>`
                      )
                      .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}
