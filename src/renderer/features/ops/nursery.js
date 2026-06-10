// ============================================================
// nursery.js — Nursery & Planting Material Module (Robusta)
// ============================================================
import { dataService } from '../../services/dataService.js';

function genId() { return 'NB-' + Date.now().toString(36).toUpperCase(); }
function genMgId() { return 'MG-' + Date.now().toString(36).toUpperCase(); }

function stageBadge(stage) {
    const map = {
        'Bought-in (ready to plant)': 'green',
        'Planted in field': 'muted',
        'Cuttings Placed': 'muted',
        'Rooting': 'amber',
        'Hardening': 'amber',
        'Ready to Dispatch': 'green',
        'Dispatched': 'muted',
    };
    return `<span class="badge ${map[stage] || 'muted'}">${stage}</span>`;
}

const NURSERY_STAGE_OPTIONS = [
    'Bought-in (ready to plant)',
    'Planted in field',
    'Cuttings Placed',
    'Rooting',
    'Hardening',
    'Ready to Dispatch',
    'Dispatched',
];

function rootingPct(batch) {
    if (!batch.cuttings_placed || !batch.cuttings_rooted) return '—';
    return Math.round((batch.cuttings_rooted / batch.cuttings_placed) * 100) + '%';
}

export async function renderNursery(container) {
    const [batches, motherGardens, blocks] = await Promise.all([
        dataService.getNurseryBatches(),
        dataService.getMotherGardens(),
        dataService.getBlocks(),
    ]);

    // KPIs
    const totalCuttings = batches.reduce((s, b) => s + (b.cuttings_placed || 0), 0);
    const totalRooted = batches.reduce((s, b) => s + (b.cuttings_rooted || 0), 0);
    const readyToDispatch = batches.filter(
        (b) => b.stage === 'Ready to Dispatch' || b.stage === 'Bought-in (ready to plant)'
    ).length;
    const totalMgBushes = motherGardens.reduce((s, g) => s + (g.bush_count || 0), 0);
    const annualCapacity = Math.round(totalMgBushes * 60); // 60 cuttings/bush/year benchmark

    container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        <h1 class="page-title">Nursery & Planting Material</h1>
        <p class="page-subtitle">Use <strong>Bought-in (ready to plant)</strong> when seedlings arrive from outside ready for the field; use cutting stages only if you raise material on-farm.</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" id="add-mg-btn">
          <span class="material-symbols-outlined" style="font-size:15px;">park</span> Add Mother Garden
        </button>
        <button class="btn btn-primary" id="add-nursery-btn">
          <span class="material-symbols-outlined" style="font-size:15px;">add_circle</span> Log nursery batch
        </button>
      </div>
    </div>

    <!-- KPI Strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px;">
      <div class="kpi-card">
        <div class="kpi-label">Total Cuttings Placed</div>
        <div class="kpi-value" style="font-size:22px;">${totalCuttings.toLocaleString()} <small style="font-size:12px;color:var(--text-muted);">cuttings</small></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Rooted Plantlets</div>
        <div class="kpi-value" style="font-size:22px;">${totalRooted.toLocaleString()} <small style="font-size:12px;color:var(--text-muted);">plantlets</small></div>
        <div style="margin-top:6px;font-size:10px;color:var(--green-text);font-weight:700;">
          ${totalCuttings > 0 ? Math.round((totalRooted / totalCuttings) * 100) + '% rooting success' : '—'}
        </div>
      </div>
      <div class="kpi-card gold-border">
        <div class="kpi-label">Ready for field / dispatch</div>
        <div class="kpi-value gold" style="font-size:22px;">${readyToDispatch} <small style="font-size:12px;color:var(--text-muted);">batches</small></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Annual MG Capacity</div>
        <div class="kpi-value" style="font-size:22px;">${annualCapacity.toLocaleString()} <small style="font-size:12px;color:var(--text-muted);">cuttings/yr</small></div>
        <div style="margin-top:6px;font-size:10px;color:var(--text-muted);">${totalMgBushes.toLocaleString()} mother bushes × 60</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 340px;gap:14px;align-items:start;">
      <!-- Nursery Batches Table -->
      <div class="section-card">
        <div class="card-header">
          <h2 class="card-title">Cutting Batches</h2>
          <span style="font-size:10px;color:var(--text-muted);">${batches.length} batches tracked</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Batch ID</th><th>Clone / Variety</th><th>Cut Date</th>
              <th>Placed</th><th>Rooted</th><th>Success</th><th>Stage</th><th>Grade</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${batches.length === 0
            ? `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--text-muted);">No batches logged. Click "Log Cutting Batch" to start.</td></tr>`
            : batches.map(b => `
              <tr>
                <td class="mono" style="font-size:11px;">${b.id}</td>
                <td class="strong">${b.clone_variety || '—'}</td>
                <td style="color:var(--text-muted);font-size:11px;">${b.cutting_date || '—'}</td>
                <td class="tabular-nums">${(b.cuttings_placed || 0).toLocaleString()}</td>
                <td class="tabular-nums">${(b.cuttings_rooted || 0).toLocaleString()}</td>
                <td class="tabular-nums" style="color:var(--green-text);font-weight:700;">${rootingPct(b)}</td>
                <td>${stageBadge(b.stage)}</td>
                <td style="font-size:11px;color:var(--text-muted);">${b.grade || '—'}</td>
                <td>
                  <button class="btn btn-ghost btn-sm update-nursery-btn" data-id="${b.id}" data-stage="${b.stage}">Update</button>
                  <button class="btn btn-ghost btn-sm delete-nursery-btn" data-id="${b.id}" style="color:var(--red-text);">✕</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Mother Gardens Panel -->
      <div class="section-card">
        <div class="card-header">
          <h2 class="card-title">Mother Gardens</h2>
          <span style="font-size:10px;color:var(--text-muted);">${motherGardens.length} registered</span>
        </div>
        <div style="padding:0 14px 14px;">
          ${motherGardens.length === 0
            ? `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px;">No mother gardens registered.</div>`
            : motherGardens.map(g => {
                const cutsPer6m = Math.round((g.bush_count || 0) * 30);
                return `
                <div style="padding:12px 0;border-bottom:1px solid var(--border-subtle);">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                      <div style="font-size:12px;font-weight:700;color:var(--text-primary);">${g.id}</div>
                      <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${g.clone_variety} · ${g.blockName || g.block_id || 'No block'}</div>
                    </div>
                    <span class="badge ${g.status === 'Active' ? 'green' : 'muted'}">${g.status}</span>
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
                    <div style="background:var(--bg-overlay);border-radius:4px;padding:6px 10px;">
                      <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;">Bushes</div>
                      <div style="font-size:14px;font-weight:800;">${(g.bush_count || 0).toLocaleString()}</div>
                    </div>
                    <div style="background:var(--bg-overlay);border-radius:4px;padding:6px 10px;">
                      <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;">Cuts / 6 mo</div>
                      <div style="font-size:14px;font-weight:800;">${cutsPer6m.toLocaleString()}</div>
                    </div>
                  </div>
                  <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">Established: ${g.established_date || '—'}</div>
                </div>`;
            }).join('')}
          <div style="margin-top:10px;padding:10px;background:var(--bg-overlay);border-radius:6px;font-size:10px;color:var(--text-muted);">
            <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">info</span>
            Benchmark: ~30 cuttings/bush/6 months. ${totalMgBushes.toLocaleString()} bushes → ~${annualCapacity.toLocaleString()} cuttings/year
          </div>
        </div>
      </div>
    </div>
  `;

    // ── Add Nursery Batch Modal ─────────────────────────────────
    container.querySelector('#add-nursery-btn').addEventListener('click', () => {
        showNurseryModal(container, blocks, motherGardens, null, async (data) => {
            await dataService.addNurseryBatch({ id: genId(), ...data });
            renderNursery(container);
        });
    });

    // ── Add Mother Garden Modal ─────────────────────────────────
    container.querySelector('#add-mg-btn').addEventListener('click', () => {
        showMgModal(container, blocks, async (data) => {
            await dataService.addMotherGarden({ id: genMgId(), ...data });
            renderNursery(container);
        });
    });

    // ── Update Nursery Stage ────────────────────────────────────
    container.querySelectorAll('.update-nursery-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const stages = [...NURSERY_STAGE_OPTIONS];
            let currentIdx = stages.indexOf(btn.dataset.stage);
            if (currentIdx < 0) currentIdx = 0;
            showStageModal(container, id, stages, currentIdx, async (fields) => {
                await dataService.updateNurseryBatch(id, fields);
                renderNursery(container);
            });
        });
    });

    // ── Delete ─────────────────────────────────────────────────
    container.querySelectorAll('.delete-nursery-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Delete this nursery batch?')) {
                await dataService.deleteNurseryBatch(btn.dataset.id);
                renderNursery(container);
            }
        });
    });
}

function showNurseryModal(container, blocks, motherGardens, existing, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="width:480px;">
      <div class="modal-header">
        <h3>Log nursery batch</h3>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
        <div class="form-group">
          <label class="form-label">Clone / Variety (e.g. KR1, KR7)</label>
          <input class="form-input" id="m-variety" placeholder="KR1" value="${existing?.clone_variety || ''}">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Cutting Date</label>
            <input class="form-input" type="date" id="m-cut-date" value="${existing?.cutting_date || new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label class="form-label">Mother Garden</label>
            <select class="form-input" id="m-mg">
              <option value="">— None —</option>
              ${motherGardens.map(g => `<option value="${g.id}">${g.id} (${g.clone_variety})</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Plants / cuttings (qty)</label>
            <input class="form-input" type="number" id="m-placed" placeholder="1000" value="${existing?.cuttings_placed || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Stage</label>
            <select class="form-input" id="m-stage">
              ${NURSERY_STAGE_OPTIONS.map((s) => `<option ${existing?.stage === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-input" id="m-notes" rows="2" placeholder="e.g. Shade net replaced, humidity ~85%">${existing?.notes || ''}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="save-nursery">Save Batch</button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').onclick = () => overlay.remove();
    overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#save-nursery').onclick = async () => {
        const variety = overlay.querySelector('#m-variety').value.trim();
        const placed = parseInt(overlay.querySelector('#m-placed').value) || 0;
        if (!variety || placed < 1) { alert('Please fill in variety and quantity (plants or cuttings).'); return; }
        await onSave({
            clone_variety: variety,
            cutting_date: overlay.querySelector('#m-cut-date').value,
            mother_garden_id: overlay.querySelector('#m-mg').value,
            cuttings_placed: placed,
            cuttings_rooted: 0,
            stage: overlay.querySelector('#m-stage').value,
            notes: overlay.querySelector('#m-notes').value,
        });
        overlay.remove();
    };
}

function showMgModal(container, blocks, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="width:440px;">
      <div class="modal-header"><h3>Register Mother Garden</h3><button class="modal-close">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
        <div class="form-group">
          <label class="form-label">Clone / Variety</label>
          <input class="form-input" id="mg-variety" placeholder="KR1">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Block</label>
            <select class="form-input" id="mg-block">
              <option value="">— Select Block —</option>
              ${blocks.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Bush Count</label>
            <input class="form-input" type="number" id="mg-bushes" placeholder="700">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Established Date</label>
          <input class="form-input" type="date" id="mg-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="save-mg">Register Garden</button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').onclick = () => overlay.remove();
    overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#save-mg').onclick = async () => {
        const variety = overlay.querySelector('#mg-variety').value.trim();
        const bushCount = parseInt(overlay.querySelector('#mg-bushes').value) || 0;
        if (!variety || bushCount < 1) { alert('Please fill in variety and bush count.'); return; }
        await onSave({
            block_id: overlay.querySelector('#mg-block').value,
            clone_variety: variety,
            bush_count: bushCount,
            established_date: overlay.querySelector('#mg-date').value,
            status: 'Active',
        });
        overlay.remove();
    };
}

function showStageModal(container, id, stages, currentIdx, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="width:400px;">
      <div class="modal-header"><h3>Update Batch ${id}</h3><button class="modal-close">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
        <div class="form-group">
          <label class="form-label">Stage</label>
          <select class="form-input" id="upd-stage">
            ${stages.map((s, i) => `<option ${i === currentIdx ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Cuttings Rooted</label>
            <input class="form-input" type="number" id="upd-rooted" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Mortality</label>
            <input class="form-input" type="number" id="upd-mortality" placeholder="0">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Dispatch Date (if dispatched)</label>
          <input class="form-input" type="date" id="upd-dispatch">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="save-stage">Save</button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').onclick = () => overlay.remove();
    overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#save-stage').onclick = async () => {
        const fields = {
            stage: overlay.querySelector('#upd-stage').value,
            cuttings_rooted: parseInt(overlay.querySelector('#upd-rooted').value) || 0,
            mortality: parseInt(overlay.querySelector('#upd-mortality').value) || 0,
        };
        const dispatch = overlay.querySelector('#upd-dispatch').value;
        if (dispatch) fields.dispatch_date = dispatch;
        await onSave(fields);
        overlay.remove();
    };
}
