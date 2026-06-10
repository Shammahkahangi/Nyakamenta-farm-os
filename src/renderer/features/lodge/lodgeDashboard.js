// ============================================================
// lodgeDashboard.v2.js — Occupied / Available / Revenue + grid + bookings
// Replace: Coffee management system/src/renderer/features/lodge/lodgeDashboard.js
// ============================================================
import { dataService } from '../../services/dataService.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function renderLodgeDashboard(container) {
  const [summary, units, bookings, payments] = await Promise.all([
    dataService.getLodgeSummary(),
    dataService.getLodgeUnits(),
    dataService.getLodgeBookings(),
    dataService.getLodgePayments(),
  ]);

  const occupied = units.filter((u) => (u.status || '').toLowerCase() === 'occupied').length;
  const available = units.filter((u) => (u.status || '').toLowerCase() === 'available').length;
  const todayStr = today();
  const revToday = payments
    .filter((p) => (p.payment_date || '').slice(0, 10) === todayStr)
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Lodge</h1>
      <p class="page-subtitle">Occupancy, bookings, and lodge revenue</p>
    </div>

    <div class="kpi-grid" style="margin-bottom:20px;">
      <div class="kpi-card"><div class="kpi-label">Occupied</div><div class="kpi-value">${occupied}</div><div class="kpi-delta" style="margin-top:6px;font-size:10px;color:var(--text-muted);">units checked in</div></div>
      <div class="kpi-card"><div class="kpi-label">Available</div><div class="kpi-value green">${available}</div></div>
      <div class="kpi-card gold-border"><div class="kpi-label">Revenue today</div><div class="kpi-value gold">${dataService.formatCurrency(revToday)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total revenue</div><div class="kpi-value">${dataService.formatCurrency(summary.revenue)}</div></div>
    </div>

    <div class="section-title">Lodge grid</div>
    <div class="lodge-grid" style="margin-bottom:24px;">
      ${units
        .map((u) => {
          const occ = (u.status || '').toLowerCase() === 'occupied';
          return `
        <div class="lodge-unit-card ${occ ? 'occupied' : ''}">
          <div class="lodge-unit-code">${u.code}</div>
          <div class="lodge-unit-name">${u.name}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${dataService.formatCurrency(Number(u.nightly_rate || 0))} / night</div>
          <div style="margin-top:10px;"><span class="badge ${occ ? 'amber' : 'green'}">${u.status || '—'}</span></div>
        </div>`;
        })
        .join('')}
    </div>

    <div class="section-card">
      <div class="card-header"><h2 class="card-title">Bookings</h2></div>
      <table class="data-table">
        <thead><tr><th>Guest</th><th>Unit</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead>
        <tbody>
          ${bookings
            .map(
              (b) => `
            <tr>
              <td class="strong">${b.guest_name}</td>
              <td>${b.unit_code || '—'}</td>
              <td>${b.check_in || '—'}</td>
              <td>${b.check_out || '—'}</td>
              <td><span class="badge muted">${b.status || '—'}</span></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <details class="section-card mt-20" style="margin-top:20px;">
      <summary class="card-header" style="cursor:pointer;list-style:none;"><h2 class="card-title" style="margin:0;">Add records</h2></summary>
      <div style="padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;" class="lodge-forms-grid">
        <form id="add-unit-form" style="display:flex;flex-direction:column;gap:8px;">
          <div class="kpi-label">Add unit</div>
          <input class="form-input" name="code" placeholder="L3" required />
          <input class="form-input" name="name" placeholder="Lodge 3" required />
          <input class="form-input" name="nightly_rate" type="number" min="0" step="0.01" required />
          <button class="btn btn-primary" type="submit">Add unit</button>
        </form>
        <form id="add-booking-form" style="display:flex;flex-direction:column;gap:8px;">
          <div class="kpi-label">New booking</div>
          <input class="form-input" name="guest_name" required />
          <select class="form-input" name="unit_id" required>
            <option value="">Unit</option>
            ${units.map((u) => `<option value="${u.id}">${u.code}</option>`).join('')}
          </select>
          <input class="form-input" name="check_in" type="date" value="${today()}" required />
          <button class="btn btn-primary" type="submit">Book</button>
        </form>
        <form id="add-payment-form" style="display:flex;flex-direction:column;gap:8px;">
          <div class="kpi-label">Payment</div>
          <select class="form-input" name="booking_id" required>
            <option value="">Booking</option>
            ${bookings.map((b) => `<option value="${b.id}">#${b.id} ${b.guest_name}</option>`).join('')}
          </select>
          <input class="form-input" name="amount" type="number" min="0" step="0.01" required />
          <input class="form-input" name="payment_date" type="date" value="${today()}" required />
          <button class="btn btn-primary" type="submit">Record</button>
        </form>
        <form id="add-expense-form" style="display:flex;flex-direction:column;gap:8px;">
          <div class="kpi-label">Expense</div>
          <input class="form-input" name="category" placeholder="Maintenance" required />
          <input class="form-input" name="description" required />
          <input class="form-input" name="amount" type="number" min="0" step="0.01" required />
          <button class="btn btn-primary" type="submit">Add expense</button>
        </form>
      </div>
    </details>
  `;

  const bind = (id, fn) => {
    const form = container.querySelector(id);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await fn(Object.fromEntries(new FormData(form).entries()));
      await renderLodgeDashboard(container);
    });
  };

  bind('#add-unit-form', (d) =>
    dataService.addLodgeUnit({
      code: d.code,
      name: d.name,
      capacity: 2,
      nightly_rate: Number(d.nightly_rate),
      status: 'Available',
    })
  );
  bind('#add-booking-form', (d) => {
    const co = new Date(d.check_in);
    co.setDate(co.getDate() + 1);
    return dataService.addLodgeBooking({
      guest_name: d.guest_name,
      unit_id: Number(d.unit_id),
      check_in: d.check_in,
      check_out: co.toISOString().slice(0, 10),
      guests_count: 1,
      booking_source: 'Direct',
      status: 'Booked',
    });
  });
  bind('#add-payment-form', (d) =>
    dataService.addLodgePayment({
      booking_id: Number(d.booking_id),
      amount: Number(d.amount),
      method: 'Cash',
      payment_date: d.payment_date,
    })
  );
  bind('#add-expense-form', (d) =>
    dataService.addLodgeExpense({
      category: d.category,
      description: d.description,
      amount: Number(d.amount),
      expense_date: today(),
    })
  );
}
