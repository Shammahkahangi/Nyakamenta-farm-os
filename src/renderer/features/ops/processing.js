// ============================================================
// processing.js — Post-harvest batch log (through drying on-farm)
// ============================================================
import { dataService } from '../../services/dataService.js';

/** On-farm steps for this estate (workflow ends at drying; milling often off-farm). */
const STAGES_INTAKE = ['Pulping', 'Fermentation', 'Washing', 'Drying'];

/** Update dropdown: primary path + terminal + legacy mill steps for old rows. */
const STAGES_LEGACY_MILL = ['Milling', 'Grading', 'Storage'];

function stagesForUpdate(currentStage) {
  const set = new Set([...STAGES_INTAKE, 'Complete', ...STAGES_LEGACY_MILL]);
  if (currentStage) set.add(currentStage);
  const order = [...STAGES_INTAKE, 'Complete', ...STAGES_LEGACY_MILL];
  const extra = [...set].filter((s) => !order.includes(s));
  return [...order.filter((s) => set.has(s)), ...extra.sort()];
}

function genBatchId() {
  const ts = Date.now().toString(36).toUpperCase();
  return `B-${ts}`;
}

function openLogIntakeModal(blocks, onSaved) {
  const today = new Date().toISOString().split('T')[0];
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Log New Cherry Intake</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Source Block</label>
            <select class="form-select" id="bt-block">
              ${blocks.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Date Received</label>
            <input type="date" class="form-input" id="bt-date" value="${today}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cherry Weight (kg In)</label>
            <input type="number" class="form-input" id="bt-kgin" placeholder="e.g. 1500" min="1">
          </div>
          <div class="form-group">
            <label class="form-label">Initial Moisture (%)</label>
            <input type="number" class="form-input" id="bt-moisture" placeholder="e.g. 55" min="0" max="100">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Stage (on-farm)</label>
          <select class="form-select" id="bt-stage">
            ${STAGES_INTAKE.map((s) => `<option>${s}</option>`).join('')}
          </select>
          <p style="margin:6px 0 0;font-size:10px;color:var(--text-muted);line-height:1.4;">Track through <strong>Drying</strong>, then use <strong>Update batch</strong> to set <strong>Complete</strong> when parchment leaves the farm line (e.g. for off-farm milling).</p>
        </div>
        <p id="bt-error" style="color:var(--red-text);font-size:11px;display:none;"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="bt-cancel">Cancel</button>
        <button class="btn btn-primary" id="bt-save">
          <span class="material-symbols-outlined">add_circle</span> Log Intake
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => document.body.removeChild(backdrop);
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#bt-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#bt-save').addEventListener('click', async () => {
    const block_id = backdrop.querySelector('#bt-block').value;
    const date = backdrop.querySelector('#bt-date').value;
    const kgIn = parseFloat(backdrop.querySelector('#bt-kgin').value);
    const moisture = parseFloat(backdrop.querySelector('#bt-moisture').value);
    const stage = backdrop.querySelector('#bt-stage').value;
    const errEl = backdrop.querySelector('#bt-error');

    if (!block_id || isNaN(kgIn) || kgIn <= 0) {
      errEl.style.display = 'block';
      errEl.textContent = 'Please enter a valid weight.';
      return;
    }

    await dataService.addBatch({
      id: genBatchId(),
      block_id,
      stage,
      kgIn,
      moisture: isNaN(moisture) ? null : moisture,
      status: 'Processing',
      date
    });
    close();
    if (onSaved) onSaved();
  });
}

function openUpdateBatchModal(batch, onSaved) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Update Batch — ${batch.id}</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Current Stage</label>
            <select class="form-select" id="upd-stage">
              ${stagesForUpdate(batch.stage).map((s) => `<option ${batch.stage === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="upd-status">
              <option ${batch.status === 'Processing' ? 'selected' : ''}>Processing</option>
              <option ${batch.status === 'Complete' ? 'selected' : ''}>Complete</option>
              <option ${batch.status === 'Alert' ? 'selected' : ''}>Alert</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Output Weight (kg Out)</label>
            <input type="number" class="form-input" id="upd-kgout" placeholder="${batch.kgOut || ''}" value="${batch.kgOut || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Moisture (%)</label>
            <input type="number" class="form-input" id="upd-moisture" value="${batch.moisture || ''}">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="upd-cancel">Cancel</button>
        <button class="btn btn-primary" id="upd-save">
          <span class="material-symbols-outlined">save</span> Update Batch
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => document.body.removeChild(backdrop);
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#upd-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#upd-save').addEventListener('click', async () => {
    const stage = backdrop.querySelector('#upd-stage').value;
    const status = backdrop.querySelector('#upd-status').value;
    const kgOut = parseFloat(backdrop.querySelector('#upd-kgout').value) || null;
    const moisture = parseFloat(backdrop.querySelector('#upd-moisture').value) || null;
    const conversion = (kgOut && batch.kgIn) ? ((kgOut / batch.kgIn) * 100).toFixed(1) : batch.conversion;

    await dataService.updateBatch(batch.id, { stage, status, kgOut, moisture, conversion });
    close();
    if (onSaved) onSaved();
  });
}

async function renderProcessing(container) {
  const batches = await dataService.getBatches();
  const blocks = await dataService.getBlocks();

  const render = () => renderProcessing(container);

  const statusColor = { Processing: 'amber', Complete: 'green', Alert: 'red' };

  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <h1 class="page-title">Post-harvest to drying</h1>
        <p class="page-subtitle">Cherry intake, moisture, and stages through <strong>drying</strong>. For operations that stop at dried parchment, move the batch to <strong>Complete</strong> after drying — skip mill steps unless you use them.</p>
      </div>
      <button class="btn btn-primary" id="log-intake-btn">
        <span class="material-symbols-outlined">add</span> Log Cherry Intake
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Active Batches</div>
        <div class="kpi-value">${batches.filter(b => b.status === 'Processing' || b.status === 'Alert').length}</div>
      </div>
      <div class="kpi-card red-border">
        <div class="kpi-label">Alert Batches</div>
        <div class="kpi-value red">${batches.filter(b => b.status === 'Alert').length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Completed Batches</div>
        <div class="kpi-value green">${batches.filter(b => b.status === 'Complete').length}</div>
      </div>
      <div class="kpi-card gold-border">
        <div class="kpi-label">Total Cherry In (kg)</div>
        <div class="kpi-value gold">${batches.reduce((s, b) => s + (b.kgIn || 0), 0).toLocaleString()}</div>
      </div>
    </div>

    <div class="section-card">
      <div class="card-header">
        <h2 class="card-title">Active Batch Register</h2>
        <span style="font-size:11px;color:var(--text-muted);">${batches.length} total batches</span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Batch ID</th><th>Block</th><th>Stage</th><th>Kg In</th><th>Kg Out</th>
            <th>Moisture</th><th>Conversion</th><th>Status</th><th>Date</th><th></th>
          </tr>
        </thead>
        <tbody id="batch-tbody">
          ${batches.length === 0
      ? `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:28px;">No batches yet. Click "Log Cherry Intake" to begin.</td></tr>`
      : batches.map(b => `
              <tr>
                <td class="mono">${b.id}</td>
                <td class="strong">${b.blockName || b.block_id}</td>
                <td>${b.stage}</td>
                <td class="tabular-nums">${(b.kgIn || 0).toLocaleString()} kg</td>
                <td class="tabular-nums">${b.kgOut ? b.kgOut.toLocaleString() + ' kg' : '—'}</td>
                <td class="tabular-nums">${b.moisture ? b.moisture + '%' : '—'}</td>
                <td class="tabular-nums">${b.conversion ? b.conversion + '%' : '—'}</td>
                <td><span class="badge ${statusColor[b.status] || 'muted'}">${b.status}</span></td>
                <td class="tabular-nums">${b.date}</td>
                <td>
                  <button class="btn btn-ghost btn-sm update-batch-btn" data-id="${b.id}" style="padding:3px 8px;">
                    <span class="material-symbols-outlined" style="font-size:13px;">edit</span>
                  </button>
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#log-intake-btn').addEventListener('click', () => {
    openLogIntakeModal(blocks, render);
  });

  container.querySelectorAll('.update-batch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const batch = batches.find(b => b.id === id);
      if (batch) openUpdateBatchModal(batch, render);
    });
  });
}

export { renderProcessing };
