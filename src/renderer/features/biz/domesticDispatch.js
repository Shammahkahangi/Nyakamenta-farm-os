// ============================================================
// domesticDispatch.js — Domestic green coffee dispatch (after hulling)
// ============================================================
import { dataService } from '../../services/dataService.js';
import { showToast } from '../../utils/toast.js';

function genDispatchId() {
  return 'DOM-' + Date.now().toString(36).toUpperCase();
}

function formatUgx(n) {
  return 'UGX ' + Math.round(Number(n) || 0).toLocaleString();
}

function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function openAddDispatchModal(onSaved, initialData = null) {
  const today = new Date().toISOString().split('T')[0];
  const data = initialData || {};

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <span class="modal-title">Record domestic dispatch</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:14px;line-height:1.5;">
          Log green coffee (after hulling) sent to a domestic buyer or partner site. Amounts and prices are in UGX.
        </p>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Receiver / partner</label>
            <input type="text" class="form-input" id="ct-buyer" placeholder="e.g. Partner farm — hulling & storage" value="${escAttr(data.buyer || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Destination</label>
            <input type="text" class="form-input" id="ct-dest" placeholder="e.g. Buyer site, district" value="${escAttr(data.destination || '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Grade</label>
            <select class="form-select" id="ct-grade">
              <option ${data.grade === 'AA' || data.grade === 'Grade AA' ? 'selected' : ''}>AA</option>
              <option ${data.grade === 'AB' || data.grade === 'Grade AB' ? 'selected' : ''}>AB</option>
              <option ${data.grade === 'PB' ? 'selected' : ''}>PB</option>
              <option ${data.grade === 'C' ? 'selected' : ''}>C</option>
              <option ${data.grade === 'TT' ? 'selected' : ''}>TT</option>
              <option ${data.grade === 'T' ? 'selected' : ''}>T</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="ct-status">
              <option ${data.status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
              <option ${data.status === 'In transit' ? 'selected' : ''}>In transit</option>
              <option ${data.status === 'Received' ? 'selected' : ''}>Received</option>
              <option ${data.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Net weight (kg)</label>
            <input type="number" class="form-input" id="ct-kg" placeholder="e.g. 5000" min="1" value="${data.netKg || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Price per kg (UGX)</label>
            <input type="number" class="form-input" id="ct-price" placeholder="e.g. 10200" min="0" step="1" value="${data.pricePerKg || ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Dispatch date</label>
          <input type="date" class="form-input" id="ct-etd" value="${data.etd || today}">
        </div>
        <p id="ct-error" style="color:var(--red-text);font-size:11px;display:none;"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="ct-cancel">Cancel</button>
        <button class="btn btn-primary" id="ct-save">
          <span class="material-symbols-outlined">save</span> Save dispatch
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => document.body.removeChild(backdrop);
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#ct-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#ct-save').addEventListener('click', async () => {
    const buyer = backdrop.querySelector('#ct-buyer').value.trim();
    const destination = backdrop.querySelector('#ct-dest').value.trim();
    const grade = backdrop.querySelector('#ct-grade').value;
    const status = backdrop.querySelector('#ct-status').value;
    const netKg = parseFloat(backdrop.querySelector('#ct-kg').value);
    const pricePerKg = parseFloat(backdrop.querySelector('#ct-price').value);
    const etd = backdrop.querySelector('#ct-etd').value;
    const errEl = backdrop.querySelector('#ct-error');

    errEl.style.display = 'none';
    errEl.textContent = '';

    if (!buyer || !destination) {
      errEl.style.display = 'block';
      errEl.textContent = 'Enter the receiver / partner and destination (not just the grey placeholder).';
      return;
    }
    if (!etd) {
      errEl.style.display = 'block';
      errEl.textContent = 'Choose a dispatch date.';
      return;
    }
    if (isNaN(netKg) || netKg <= 0 || isNaN(pricePerKg) || pricePerKg < 0) {
      errEl.style.display = 'block';
      errEl.textContent = 'Enter valid net weight (kg) and price per kg (UGX).';
      return;
    }

    const totalValue = Math.round(netKg * pricePerKg);

    try {
      await dataService.addContract({
        id: genDispatchId(),
        buyer,
        destination,
        grade,
        netKg,
        pricePerKg,
        totalValue,
        status,
        etd,
      });
      close();
      showToast(`Dispatch saved: ${buyer} · ${formatUgx(totalValue)}.`);
      if (onSaved) onSaved();
    } catch (e) {
      errEl.style.display = 'block';
      errEl.textContent = e.message || String(e) || 'Could not save dispatch.';
    }
  });
}

async function renderDomesticDispatch(container) {
  const contracts = await dataService.getContracts();

  const render = () => renderDomesticDispatch(container);

  const statusColor = {
    Received: 'green',
    'In transit': 'amber',
    Scheduled: 'muted',
    Confirmed: 'green',
    Shipped: 'amber',
    Delivered: 'green',
    Draft: 'muted',
    Ready: 'green',
  };

  const totalValue = contracts.reduce((s, c) => s + (Number(c.totalValue) || 0), 0);
  const totalKg = contracts.reduce((s, c) => s + (Number(c.netKg) || 0), 0);
  const activeLoads = contracts.filter(c =>
    ['Scheduled', 'In transit', 'Confirmed', 'Shipped', 'Ready'].includes(c.status)
  ).length;

  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <h1 class="page-title">Domestic green coffee dispatch</h1>
        <p class="page-subtitle">Hulled coffee sent to a domestic buyer or partner — not export.</p>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary" id="add-dispatch-btn">
          <span class="material-symbols-outlined">add</span> New dispatch
        </button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Dispatches</div>
        <div class="kpi-value">${contracts.length}</div>
      </div>
      <div class="kpi-card gold-border">
        <div class="kpi-label">Total value (UGX)</div>
        <div class="kpi-value gold">${formatUgx(totalValue)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Volume sent</div>
        <div class="kpi-value">${totalKg.toLocaleString()} kg</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Active / in pipeline</div>
        <div class="kpi-value">${activeLoads}</div>
      </div>
    </div>

    <div class="section-card">
      <div class="card-header">
        <h2 class="card-title">Dispatch register</h2>
        <span style="font-size:11px;color:var(--text-muted);">${contracts.length} records</span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th><th>Receiver</th><th>Destination</th><th>Grade</th>
            <th>Net kg</th><th>UGX/kg</th><th>Total (UGX)</th><th>Date</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${contracts.length === 0
      ? `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:28px;">No dispatches yet. Click &quot;New dispatch&quot; to add one.</td></tr>`
      : contracts.map(c => `
              <tr>
                <td class="mono">${c.id}</td>
                <td class="strong">${c.buyer}</td>
                <td>${c.destination}</td>
                <td><span class="badge gold">${c.grade}</span></td>
                <td class="tabular-nums">${Number(c.netKg).toLocaleString()} kg</td>
                <td class="tabular-nums">${formatUgx(c.pricePerKg)}</td>
                <td class="tabular-nums" style="font-weight:700;">${formatUgx(c.totalValue)}</td>
                <td class="tabular-nums">${c.etd}</td>
                <td><span class="badge ${statusColor[c.status] || 'muted'}">${c.status}</span></td>
              </tr>
            `).join('')}
        </tbody>
      </table>
      <p style="font-size:10px;color:var(--text-muted);margin:12px 16px 16px;line-height:1.45;">
        Total (UGX) is always <strong>net kg × UGX/kg</strong> (domestic green coffee is typically priced in thousands of UGX per kg).
      </p>
    </div>
  `;

  container.querySelector('#add-dispatch-btn').addEventListener('click', () => {
    openAddDispatchModal(render);
  });
}

export { renderDomesticDispatch };
