// ============================================================
// ipm.js — IPM Scouting Module (Robusta)
// ============================================================
import { dataService } from '../../services/dataService.js';

const PEST_TYPES = [
    'Black Coffee Twig Borer',
    'Coffee Berry Borer (CBB)',
    'Leaf Rust',
    'Coffee Wilt Disease',
    'Antestia Bug',
    'White Stem Borer',
    'Other',
];

function severityColor(r) {
    if (r <= 2) return 'var(--green-text)';
    if (r <= 3) return 'var(--amber-text)';
    return 'var(--red-text)';
}

function severityLabel(r) {
    const labels = { 1: 'Trace', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Severe' };
    return labels[r] || '—';
}

export async function renderIpm(container) {
    const [records, blocks] = await Promise.all([
        dataService.getIpmRecords(),
        dataService.getBlocks(),
    ]);

    // Stats
    const criticalRecords = records.filter(r => r.severity_rating >= 4);
    const pestCounts = {};
    records.forEach(r => { pestCounts[r.pest_type] = (pestCounts[r.pest_type] || 0) + 1; });
    const topPest = Object.entries(pestCounts).sort((a, b) => b[1] - a[1])[0];

    // Block heat summary
    const blockSummary = {};
    records.forEach(r => {
        if (!blockSummary[r.blockName || r.block_id]) blockSummary[r.blockName || r.block_id] = { max: 0, count: 0 };
        blockSummary[r.blockName || r.block_id].max = Math.max(blockSummary[r.blockName || r.block_id].max, r.severity_rating || 0);
        blockSummary[r.blockName || r.block_id].count++;
    });

    container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        <h1 class="page-title">IPM Scouting</h1>
        <p class="page-subtitle">Pest & Disease Surveillance · Robusta Estate</p>
      </div>
      <button class="btn btn-primary" id="add-ipm-btn">
        <span class="material-symbols-outlined" style="font-size:15px;">add_circle</span> Log Scout Record
      </button>
    </div>

    <!-- KPI Strip -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px;">
      <div class="kpi-card">
        <div class="kpi-label">Total Scout Records</div>
        <div class="kpi-value" style="font-size:22px;">${records.length}</div>
      </div>
      <div class="kpi-card ${criticalRecords.length > 0 ? 'red-border' : ''}">
        <div class="kpi-label">Critical Issues (≥ Severity 4)</div>
        <div class="kpi-value" style="font-size:22px;color:${criticalRecords.length > 0 ? 'var(--red-text)' : 'var(--green-text)'};">${criticalRecords.length}</div>
      </div>
      <div class="kpi-card gold-border">
        <div class="kpi-label">Top Pest Pressure</div>
        <div class="kpi-value" style="font-size:14px;font-weight:700;">${topPest ? topPest[0] : '—'}</div>
        <div style="margin-top:4px;font-size:10px;color:var(--text-muted);">${topPest ? topPest[1] + ' records' : 'No data yet'}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 280px;gap:14px;align-items:start;">
      <!-- Scout Records Table -->
      <div class="section-card">
        <div class="card-header">
          <h2 class="card-title">Scouting Log</h2>
          <span style="font-size:10px;color:var(--text-muted);">${records.length} records</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Block</th><th>Pest / Disease</th>
              <th>Severity</th><th>Action Taken</th><th>Next Scout</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${records.length === 0
            ? `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted);">No records. Log your first scout.</td></tr>`
            : records.map(r => `
              <tr>
                <td style="font-size:11px;color:var(--text-muted);">${r.scout_date}</td>
                <td class="strong">${r.blockName || r.block_id}</td>
                <td style="font-size:11px;font-weight:600;">${r.pest_type}</td>
                <td>
                  <span style="color:${severityColor(r.severity_rating)};font-weight:700;font-size:11px;">
                    ${r.severity_rating}/5 · ${severityLabel(r.severity_rating)}
                  </span>
                </td>
                <td style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.action_taken || ''}">${r.action_taken || '—'}</td>
                <td style="font-size:11px;color:var(--text-muted);">${r.next_scout_date || '—'}</td>
                <td>
                  <button class="btn btn-ghost btn-sm delete-ipm-btn" data-id="${r.id}" style="color:var(--red-text);">✕</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Block Risk Heatmap -->
      <div class="section-card">
        <div class="card-header"><h2 class="card-title">Block Risk Map</h2></div>
        <div style="padding:0 14px 14px;">
          ${Object.keys(blockSummary).length === 0
            ? `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px;">No data yet.</div>`
            : Object.entries(blockSummary).map(([block, info]) => {
                const color = info.max <= 2 ? 'var(--green-text)' : info.max <= 3 ? 'var(--amber-text)' : 'var(--red-text)';
                const bg = info.max <= 2 ? 'rgba(67,160,71,.12)' : info.max <= 3 ? 'rgba(255,160,0,.12)' : 'rgba(239,83,80,.12)';
                return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-subtle);">
                  <div>
                    <div style="font-size:12px;font-weight:700;">${block}</div>
                    <div style="font-size:10px;color:var(--text-muted);">${info.count} scout records</div>
                  </div>
                  <div style="background:${bg};color:${color};padding:4px 10px;border-radius:12px;font-size:11px;font-weight:700;">
                    Sev. ${info.max}/5
                  </div>
                </div>`;
            }).join('')}
          <div style="margin-top:12px;padding:10px;background:var(--bg-overlay);border-radius:6px;font-size:10px;color:var(--text-muted);">
            <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">info</span>
            UCDA guideline: Scout each 5–20 ha cell weekly during flowering → berry development
          </div>
        </div>
      </div>
    </div>
  `;

    container.querySelector('#add-ipm-btn').addEventListener('click', () => {
        showIpmModal(container, blocks, async (data) => {
            await dataService.addIpmRecord(data);
            renderIpm(container);
        });
    });

    container.querySelectorAll('.delete-ipm-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Delete this scout record?')) {
                await dataService.deleteIpmRecord(btn.dataset.id);
                renderIpm(container);
            }
        });
    });
}

function showIpmModal(container, blocks, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="width:500px;">
      <div class="modal-header"><h3>Log Scout Record</h3><button class="modal-close">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Block</label>
            <select class="form-input" id="ipm-block">
              <option value="">— Select Block —</option>
              ${blocks.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Scout Date</label>
            <input class="form-input" type="date" id="ipm-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Pest / Disease</label>
            <select class="form-input" id="ipm-pest">
              ${PEST_TYPES.map(p => `<option>${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Severity (1–5)</label>
            <select class="form-input" id="ipm-severity">
              <option value="1">1 — Trace</option>
              <option value="2">2 — Low</option>
              <option value="3" selected>3 — Moderate</option>
              <option value="4">4 — High</option>
              <option value="5">5 — Severe</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Action Taken</label>
          <input class="form-input" id="ipm-action" placeholder="e.g. Pruned & burned infested twigs, applied fungicide">
        </div>
        <div class="form-group">
          <label class="form-label">Next Scout Date</label>
          <input class="form-input" type="date" id="ipm-next">
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-input" id="ipm-notes" rows="2" placeholder="Observations, weather conditions…"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="save-ipm">Save Record</button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').onclick = () => overlay.remove();
    overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#save-ipm').onclick = async () => {
        const block_id = overlay.querySelector('#ipm-block').value;
        if (!block_id) { alert('Please select a block.'); return; }
        await onSave({
            block_id,
            scout_date: overlay.querySelector('#ipm-date').value,
            scout_cell: '',
            pest_type: overlay.querySelector('#ipm-pest').value,
            incidence_pct: null,
            severity_rating: parseInt(overlay.querySelector('#ipm-severity').value),
            action_taken: overlay.querySelector('#ipm-action').value,
            next_scout_date: overlay.querySelector('#ipm-next').value,
            notes: overlay.querySelector('#ipm-notes').value,
        });
        overlay.remove();
    };
}
