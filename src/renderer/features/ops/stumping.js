// ============================================================
// stumping.js — Stumping & Renovation Cycles Module (Robusta)
// ============================================================
import { dataService } from '../../services/dataService.js';

const STRATEGIES = ['Phased (staggered blocks)', 'Non-Phased (whole block at once)', 'Cycle Conversion'];
const STATUSES = ['Planned', 'In Progress', 'Recovering', 'Yielding', 'Completed'];

function statusBadge(s) {
    const map = {
        'Planned': 'muted',
        'In Progress': 'amber',
        'Recovering': 'amber',
        'Yielding': 'green',
        'Completed': 'green',
    };
    return `<span class="badge ${map[s] || 'muted'}">${s}</span>`;
}

function daysUntil(dateStr) {
    if (!dateStr) return null;
    const diff = Math.round((new Date(dateStr) - Date.now()) / 86400000);
    return diff;
}

export async function renderStumping(container) {
    const [cycles, blocks] = await Promise.all([
        dataService.getStumpingCycles(),
        dataService.getBlocks(),
    ]);

    const planned = cycles.filter(c => c.status === 'Planned').length;
    const recovering = cycles.filter(c => c.status === 'Recovering' || c.status === 'In Progress').length;
    const yielding = cycles.filter(c => c.status === 'Yielding').length;
    const totalRecovery = cycles.reduce((s, c) => s + (c.yield_recovery_kg || 0), 0);

    container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        <h1 class="page-title">Stumping & Renovation</h1>
        <p class="page-subtitle">Block renovation cycle management · Robusta Estate</p>
      </div>
      <button class="btn btn-primary" id="add-stump-btn">
        <span class="material-symbols-outlined" style="font-size:15px;">content_cut</span> Plan Stumping Cycle
      </button>
    </div>

    <!-- KPI Strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px;">
      <div class="kpi-card">
        <div class="kpi-label">Planned Cycles</div>
        <div class="kpi-value" style="font-size:22px;">${planned}</div>
      </div>
      <div class="kpi-card ${recovering > 0 ? 'gold-border' : ''}">
        <div class="kpi-label">Currently Recovering</div>
        <div class="kpi-value" style="font-size:22px;color:var(--amber-text);">${recovering} <small style="font-size:12px;color:var(--text-muted);">blocks</small></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Back in Yield</div>
        <div class="kpi-value" style="font-size:22px;color:var(--green-text);">${yielding}</div>
      </div>
      <div class="kpi-card gold-border">
        <div class="kpi-label">Recovery Output</div>
        <div class="kpi-value" style="font-size:22px;">${totalRecovery.toLocaleString()} <small style="font-size:12px;color:var(--text-muted);">kg</small></div>
      </div>
    </div>

    <!-- Cycle Timeline Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;margin-bottom:14px;">
      ${cycles.length === 0
            ? `<div class="section-card" style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text-muted);">
            No renovation cycles planned. Click "Plan Stumping Cycle" to start.
           </div>`
            : cycles.map(c => {
                const daysToRegrowth = daysUntil(c.expected_regrowth_date);
                const daysToYield = daysUntil(c.expected_yield_date);
                return `
            <div class="section-card" style="padding:16px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                <div>
                  <div style="font-size:13px;font-weight:800;color:var(--text-primary);">${c.blockName || c.block_id}</div>
                  <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${c.strategy || 'Phased'}</div>
                </div>
                ${statusBadge(c.status)}
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                <div style="background:var(--bg-overlay);border-radius:5px;padding:8px 10px;">
                  <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Stump Date</div>
                  <div style="font-size:13px;font-weight:800;margin-top:2px;">${c.stump_date || '—'}</div>
                </div>
                <div style="background:var(--bg-overlay);border-radius:5px;padding:8px 10px;">
                  <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Suckers Selected</div>
                  <div style="font-size:13px;font-weight:800;margin-top:2px;">${c.suckers_selected || '—'}</div>
                </div>
                <div style="background:var(--bg-overlay);border-radius:5px;padding:8px 10px;">
                  <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Regrowth Exp.</div>
                  <div style="font-size:12px;font-weight:700;margin-top:2px;color:${daysToRegrowth !== null && daysToRegrowth < 30 ? 'var(--amber-text)' : 'var(--text-primary)'};">
                    ${c.expected_regrowth_date || '—'}
                    ${daysToRegrowth !== null ? `<span style="font-size:10px;color:var(--text-muted);"> (${daysToRegrowth}d)</span>` : ''}
                  </div>
                </div>
                <div style="background:var(--bg-overlay);border-radius:5px;padding:8px 10px;">
                  <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Yield Exp.</div>
                  <div style="font-size:12px;font-weight:700;margin-top:2px;color:var(--green-text);">
                    ${c.expected_yield_date || '—'}
                    ${daysToYield !== null ? `<span style="font-size:10px;color:var(--text-muted);"> (${daysToYield}d)</span>` : ''}
                  </div>
                </div>
              </div>
              ${c.yield_recovery_kg ? `
              <div style="font-size:11px;color:var(--green-text);font-weight:700;margin-bottom:8px;">
                ✓ Recovery yield: ${c.yield_recovery_kg.toLocaleString()} kg
              </div>` : ''}
              ${c.notes ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:8px;font-style:italic;">${c.notes}</div>` : ''}
              <div style="display:flex;gap:8px;">
                <button class="btn btn-ghost btn-sm update-stump" data-id="${c.id}" data-status="${c.status}">Update Status</button>
                <button class="btn btn-ghost btn-sm del-stump" data-id="${c.id}" style="color:var(--red-text);">Delete</button>
              </div>
            </div>`;
            }).join('')}
    </div>

    <!-- Reference Guideline -->
    <div style="padding:14px 18px;background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;font-size:11px;color:var(--text-muted);line-height:1.8;">
      <span style="font-weight:700;color:var(--text-secondary);">UCDA Stumping Guidance</span> ·
      First stumping: ~9–10 years after planting · Subsequent cycles: every ~6–7 years ·
      Select 1–2 vigorous suckers per stump; remove etiolated/weak suckers ·
      Revenue recovery typically by Year 9–10 (stump Year 7). 
      <strong>Phase stumping across blocks</strong> to smooth cashflow and maintain continuous harvest throughput.
    </div>
  `;

    container.querySelector('#add-stump-btn').addEventListener('click', () => {
        showStumpModal(container, blocks, async (data) => {
            await dataService.addStumpingCycle(data);
            renderStumping(container);
        });
    });

    container.querySelectorAll('.update-stump').forEach(btn => {
        btn.addEventListener('click', () => {
            showUpdateStumpModal(btn.dataset.id, btn.dataset.status, async (fields) => {
                await dataService.updateStumpingCycle(btn.dataset.id, fields);
                renderStumping(container);
            });
        });
    });

    container.querySelectorAll('.del-stump').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Delete this stumping cycle?')) {
                await dataService.deleteStumpingCycle(btn.dataset.id);
                renderStumping(container);
            }
        });
    });
}

function showStumpModal(container, blocks, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="width:500px;">
      <div class="modal-header"><h3>Plan Stumping Cycle</h3><button class="modal-close">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Block</label>
            <select class="form-input" id="st-block">
              <option value="">— Select —</option>${blocks.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Strategy</label>
            <select class="form-input" id="st-strategy">${STRATEGIES.map(s => `<option>${s}</option>`).join('')}</select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Stump Date</label>
            <input class="form-input" type="date" id="st-stump-date">
          </div>
          <div class="form-group"><label class="form-label">Expected Regrowth</label>
            <input class="form-input" type="date" id="st-regrowth">
          </div>
          <div class="form-group"><label class="form-label">Expected Yield Date</label>
            <input class="form-input" type="date" id="st-yield-date">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Suckers to Select</label>
            <input class="form-input" type="number" id="st-suckers" placeholder="2 per stump">
          </div>
          <div class="form-group"><label class="form-label">Status</label>
            <select class="form-input" id="st-status">${STATUSES.map(s => `<option>${s}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Notes</label>
          <textarea class="form-input" id="st-notes" rows="2" placeholder="e.g. Block has 12-yr-old trees, good shade management history"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="save-stump">Save Cycle</button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').onclick = () => overlay.remove();
    overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#save-stump').onclick = async () => {
        const block_id = overlay.querySelector('#st-block').value;
        if (!block_id) { alert('Select a block.'); return; }
        await onSave({
            block_id,
            stump_date: overlay.querySelector('#st-stump-date').value,
            expected_regrowth_date: overlay.querySelector('#st-regrowth').value,
            expected_yield_date: overlay.querySelector('#st-yield-date').value,
            suckers_selected: parseInt(overlay.querySelector('#st-suckers').value) || 0,
            strategy: overlay.querySelector('#st-strategy').value,
            status: overlay.querySelector('#st-status').value,
            notes: overlay.querySelector('#st-notes').value,
        });
        overlay.remove();
    };
}

function showUpdateStumpModal(id, currentStatus, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="width:380px;">
      <div class="modal-header"><h3>Update Stumping Status</h3><button class="modal-close">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        <div class="form-group"><label class="form-label">Status</label>
          <select class="form-input" id="upd-status">
            ${STATUSES.map(s => `<option ${s === currentStatus ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Recovery Yield (kg) — fill if now yielding</label>
          <input class="form-input" type="number" id="upd-yield" placeholder="0">
        </div>
        <div class="form-group"><label class="form-label">Suckers Selected (final count)</label>
          <input class="form-input" type="number" id="upd-suckers" placeholder="">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="save-upd">Save</button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').onclick = () => overlay.remove();
    overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#save-upd').onclick = async () => {
        const fields = { status: overlay.querySelector('#upd-status').value };
        const yld = parseFloat(overlay.querySelector('#upd-yield').value);
        const sck = parseInt(overlay.querySelector('#upd-suckers').value);
        if (!isNaN(yld) && yld > 0) fields.yield_recovery_kg = yld;
        if (!isNaN(sck) && sck > 0) fields.suckers_selected = sck;
        await onSave(fields);
        overlay.remove();
    };
}
