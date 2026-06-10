// ============================================================
// irrigation.js — Irrigation Logs Module (Robusta)
// ============================================================
import { dataService } from '../../services/dataService.js';

const METHODS = ['Drip', 'Micro-Sprinkler', 'Overhead Sprinkler', 'Rain Gun', 'Manual (Bucket/Hose)', 'Water Harvesting Pond'];
const PHENOLOGY = ['Vegetative Growth', 'Flower Bud Initiation', 'Flowering', 'Fruit Set', 'Fruit Fill', 'Maturation', 'Dormancy'];

export async function renderIrrigation(container) {
    const [logs, blocks] = await Promise.all([
        dataService.getIrrigationLogs(),
        dataService.getBlocks(),
    ]);

    const totalMmApplied = logs.reduce((s, l) => s + (l.mm_applied || 0), 0);
    const totalRainfall = logs.reduce((s, l) => s + (l.rainfall_mm || 0), 0);
    const sessionCount = logs.length;
    const avgPerSession = sessionCount > 0 ? (totalMmApplied / sessionCount).toFixed(1) : 0;

    // Block-level summary
    const blockMm = {};
    logs.forEach(l => {
        const k = l.blockName || l.block_id;
        if (!blockMm[k]) blockMm[k] = 0;
        blockMm[k] += (l.mm_applied || 0);
    });

    container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        <h1 class="page-title">Irrigation Logs</h1>
        <p class="page-subtitle">Supplemental irrigation scheduling · Robusta bimodal season</p>
      </div>
      <button class="btn btn-primary" id="add-irr-btn">
        <span class="material-symbols-outlined" style="font-size:15px;">water_drop</span> Log Irrigation
      </button>
    </div>

    <!-- KPI Strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px;">
      <div class="kpi-card">
        <div class="kpi-label">Total Irrigated</div>
        <div class="kpi-value" style="font-size:22px;">${totalMmApplied.toLocaleString()} <small style="font-size:12px;color:var(--text-muted);">mm</small></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Rainfall Logged</div>
        <div class="kpi-value" style="font-size:22px;">${totalRainfall.toLocaleString()} <small style="font-size:12px;color:var(--text-muted);">mm</small></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Irrigation Sessions</div>
        <div class="kpi-value" style="font-size:22px;">${sessionCount}</div>
        <div style="margin-top:4px;font-size:10px;color:var(--text-muted);">Avg: ${avgPerSession} mm/session</div>
      </div>
      <div class="kpi-card gold-border">
        <div class="kpi-label">UCDA Benchmark</div>
        <div class="kpi-value" style="font-size:14px;font-weight:700;">~25 mm / 14 days</div>
        <div style="margin-top:4px;font-size:10px;color:var(--text-muted);">During flowering & fruit fill</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 260px;gap:14px;align-items:start;">
      <!-- Log Table -->
      <div class="section-card">
        <div class="card-header">
          <h2 class="card-title">Irrigation Events</h2>
          <span style="font-size:10px;color:var(--text-muted);">${logs.length} events</span>
        </div>
        <table class="data-table">
          <thead><tr>
            <th>Date</th><th>Block</th><th>Method</th><th>mm Applied</th><th>Rainfall mm</th><th>Cost (UGX)</th><th>Stage</th><th>Trigger Reason</th><th></th>
          </tr></thead>
          <tbody>
            ${logs.length === 0
            ? `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--text-muted);">No irrigation events logged.</td></tr>`
            : logs.map(l => `<tr>
                  <td style="font-size:11px;color:var(--text-muted);">${l.log_date}</td>
                  <td class="strong">${l.blockName || l.block_id}</td>
                  <td style="font-size:11px;">${l.method}</td>
                  <td class="tabular-nums" style="color:var(--green-text);font-weight:700;">${l.mm_applied != null ? l.mm_applied + ' mm' : '—'}</td>
                  <td class="tabular-nums">${l.rainfall_mm != null ? l.rainfall_mm + ' mm' : '—'}</td>
                  <td class="tabular-nums">${Number(l.cost_ugx) > 0 ? Number(l.cost_ugx).toLocaleString() : '—'}</td>
                  <td style="font-size:11px;color:var(--text-muted);">${l.phenology_stage || '—'}</td>
                  <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${l.trigger_reason || ''}">${l.trigger_reason || '—'}</td>
                  <td><button class="btn btn-ghost btn-sm del-irr" data-id="${l.id}" style="color:var(--red-text);">✕</button></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Per-block summary -->
      <div class="section-card">
        <div class="card-header"><h2 class="card-title">Water by Block</h2></div>
        <div style="padding:0 14px 14px;">
          ${Object.keys(blockMm).length === 0
            ? `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px;">No data.</div>`
            : Object.entries(blockMm).map(([block, mm]) => {
                const maxMm = Math.max(...Object.values(blockMm), 1);
                const pct = Math.round((mm / maxMm) * 100);
                return `
                <div style="margin-bottom:12px;">
                  <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;">
                    <span style="font-weight:700;">${block}</span>
                    <span style="color:var(--green-text);font-weight:700;">${mm} mm</span>
                  </div>
                  <div style="height:6px;background:var(--bg-overlay);border-radius:3px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:var(--green-mid);border-radius:3px;"></div>
                  </div>
                </div>`;
            }).join('')}
          <div style="margin-top:12px;padding:10px;background:var(--bg-overlay);border-radius:6px;font-size:10px;color:var(--text-muted);">
            <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">info</span>
            Trigger: ~25 mm every ~14 days during dry windows (flowering, fruit fill). Link to rain gauges per block.
          </div>
        </div>
      </div>
    </div>
  `;

    container.querySelector('#add-irr-btn').addEventListener('click', () => {
        showIrrModal(container, blocks, async (data) => {
            await dataService.addIrrigationLog(data);
            renderIrrigation(container);
        });
    });
    container.querySelectorAll('.del-irr').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Delete irrigation log?')) { await dataService.deleteIrrigationLog(btn.dataset.id); renderIrrigation(container); }
        });
    });
}

function showIrrModal(container, blocks, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="width:480px;">
      <div class="modal-header"><h3>Log Irrigation Event</h3><button class="modal-close">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Block</label>
            <select class="form-input" id="i-block">
              <option value="">— Select —</option>${blocks.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Date</label>
            <input class="form-input" type="date" id="i-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Method</label>
            <select class="form-input" id="i-method">${METHODS.map(m => `<option>${m}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label class="form-label">Phenology Stage</label>
            <select class="form-input" id="i-phenology">${PHENOLOGY.map(p => `<option>${p}</option>`).join('')}</select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">mm Applied</label><input class="form-input" type="number" id="i-mm" placeholder="25"></div>
          <div class="form-group"><label class="form-label">Rainfall (mm)</label><input class="form-input" type="number" id="i-rain" placeholder="0"></div>
          <div class="form-group"><label class="form-label">Duration (hrs)</label><input class="form-input" type="number" id="i-hrs" step="0.5" placeholder="2.0"></div>
        </div>
        <div class="form-group"><label class="form-label">Trigger Reason</label>
          <input class="form-input" id="i-trigger" placeholder="e.g. Dry spell day 12, soil moisture below 30%">
        </div>
        <div class="form-group"><label class="form-label">Running cost (UGX) — optional</label>
          <input class="form-input tabular-nums" type="number" id="i-cost" min="0" step="1" placeholder="0">
          <p style="margin:4px 0 0;font-size:10px;color:var(--text-muted);">Posts to Farm finance when &gt; 0.</p>
        </div>
        <div class="form-group"><label class="form-label">Notes</label>
          <textarea class="form-input" id="i-notes" rows="2"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="save-irr">Save Event</button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').onclick = () => overlay.remove();
    overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#save-irr').onclick = async () => {
        const block_id = overlay.querySelector('#i-block').value;
        if (!block_id) { alert('Select a block.'); return; }
        await onSave({
            block_id,
            log_date: overlay.querySelector('#i-date').value,
            method: overlay.querySelector('#i-method').value,
            mm_applied: parseFloat(overlay.querySelector('#i-mm').value) || 0,
            rainfall_mm: parseFloat(overlay.querySelector('#i-rain').value) || 0,
            duration_hrs: parseFloat(overlay.querySelector('#i-hrs').value) || 0,
            trigger_reason: overlay.querySelector('#i-trigger').value,
            phenology_stage: overlay.querySelector('#i-phenology').value,
            notes: overlay.querySelector('#i-notes').value,
            cost_ugx: parseFloat(overlay.querySelector('#i-cost').value) || 0,
        });
        overlay.remove();
    };
}
