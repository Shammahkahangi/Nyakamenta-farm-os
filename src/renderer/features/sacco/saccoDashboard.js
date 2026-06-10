import { dataService } from '../../services/dataService.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function renderSaccoDashboard(container) {
  const [summary, members, loans, savings] = await Promise.all([
    dataService.getSaccoSummary(),
    dataService.getSaccoMembers(),
    dataService.getSaccoLoans(),
    dataService.getSaccoSavings(),
  ]);

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">SACCO Dashboard</h1>
      <p class="page-subtitle">Members, savings, loans, repayments, and SACCO-only finance.</p>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Members</div><div class="kpi-value">${summary.members}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Savings</div><div class="kpi-value">${dataService.formatCurrency(summary.totalSavings)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Loan Book</div><div class="kpi-value">${dataService.formatCurrency(summary.totalLoanBook)}</div></div>
      <div class="kpi-card red-border"><div class="kpi-label">Outstanding Loans</div><div class="kpi-value red">${dataService.formatCurrency(summary.outstandingLoans)}</div></div>
    </div>

    <div class="section-card">
      <div class="card-header">
        <h2 class="card-title">Add SACCO Records</h2>
      </div>
      <div style="padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">
        <form id="add-member-form" style="display:flex;flex-direction:column;gap:8px;">
          <div class="kpi-label">New Member</div>
          <input class="form-input" name="member_no" placeholder="Member No (S003)" required />
          <input class="form-input" name="full_name" placeholder="Full name" required />
          <input class="form-input" name="phone" placeholder="Phone" />
          <button class="btn btn-primary" type="submit">Add Member</button>
        </form>

        <form id="add-saving-form" style="display:flex;flex-direction:column;gap:8px;">
          <div class="kpi-label">Record Saving</div>
          <select class="form-input" name="member_id" required>
            <option value="">Select member</option>
            ${members.map(m => `<option value="${m.id}">${m.member_no} - ${m.full_name}</option>`).join('')}
          </select>
          <input class="form-input" name="amount" type="number" min="0" step="0.01" placeholder="Amount" required />
          <input class="form-input" name="deposit_date" type="date" value="${today()}" required />
          <button class="btn btn-primary" type="submit">Add Saving</button>
        </form>

        <form id="add-loan-form" style="display:flex;flex-direction:column;gap:8px;">
          <div class="kpi-label">Issue Loan</div>
          <select class="form-input" name="member_id" required>
            <option value="">Select member</option>
            ${members.map(m => `<option value="${m.id}">${m.member_no} - ${m.full_name}</option>`).join('')}
          </select>
          <input class="form-input" name="amount" type="number" min="0" step="0.01" placeholder="Loan amount" required />
          <input class="form-input" name="interest_rate" type="number" min="0" step="0.1" placeholder="Interest % (annual or monthly)" value="12" />
          <button class="btn btn-primary" type="submit">Create Loan</button>
        </form>

        <form id="add-repayment-form" style="display:flex;flex-direction:column;gap:8px;">
          <div class="kpi-label">Record Repayment</div>
          <select class="form-input" name="loan_id" required>
            <option value="">Select loan</option>
            ${loans.map(l => `<option value="${l.id}">Loan #${l.id} - ${l.member_name || l.member_id}</option>`).join('')}
          </select>
          <input class="form-input" name="amount" type="number" min="0" step="0.01" placeholder="Repayment amount" required />
          <input class="form-input" name="repayment_date" type="date" value="${today()}" required />
          <button class="btn btn-primary" type="submit">Add Repayment</button>
        </form>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="section-card">
        <div class="card-header"><h2 class="card-title">Recent Members</h2></div>
        <table class="data-table">
          <thead><tr><th>No</th><th>Name</th><th>Phone</th><th>Joined</th></tr></thead>
          <tbody>
            ${members.slice(0, 8).map(m => `
              <tr>
                <td class="mono">${m.member_no}</td>
                <td class="strong">${m.full_name}</td>
                <td>${m.phone || '-'}</td>
                <td>${m.join_date || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="section-card">
        <div class="card-header"><h2 class="card-title">Latest Savings</h2></div>
        <table class="data-table">
          <thead><tr><th>Member</th><th>Amount</th><th>Date</th></tr></thead>
          <tbody>
            ${savings.slice(0, 8).map(s => `
              <tr>
                <td>${s.member_name || '-'}</td>
                <td class="tabular-nums">${dataService.formatCurrency(Number(s.amount || 0))}</td>
                <td>${s.deposit_date || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const bindSubmit = (id, handler) => {
    const form = container.querySelector(id);
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      await handler(data);
      await renderSaccoDashboard(container);
    });
  };

  bindSubmit('#add-member-form', async (data) => {
    await dataService.addSaccoMember({
      member_no: data.member_no,
      full_name: data.full_name,
      phone: data.phone,
      join_date: today(),
      status: 'Active',
    });
  });

  bindSubmit('#add-saving-form', async (data) => {
    await dataService.addSaccoSaving({
      member_id: Number(data.member_id),
      amount: Number(data.amount),
      deposit_date: data.deposit_date,
      method: 'Cash',
    });
  });

  bindSubmit('#add-loan-form', async (data) => {
    const issueDate = today();
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + 12);
    await dataService.addSaccoLoan({
      member_id: Number(data.member_id),
      amount: Number(data.amount),
      interest_rate: Number(data.interest_rate || 0),
      term_months: 12,
      issue_date: issueDate,
      due_date: dueDate.toISOString().slice(0, 10),
      status: 'Active',
    });
  });

  bindSubmit('#add-repayment-form', async (data) => {
    await dataService.addSaccoRepayment({
      loan_id: Number(data.loan_id),
      amount: Number(data.amount),
      repayment_date: data.repayment_date,
      method: 'Cash',
    });
  });
}
