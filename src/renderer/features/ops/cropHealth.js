// ============================================================
// cropHealth.js — Crop Health Pillar (rebranded IPM)
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
    return { 1: 'Trace', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Severe' }[r] || '—';
}

export async function renderCropHealth(container) {
    const [records, blocks] = await Promise.all([
        dataService.getIpmRecords(),
        dataService.getBlocks(),
    ]);

    const criticalRecords = records.filter(r => r.severity_rating >= 4);
    const pestCounts = {};
    records.forEach(r => { pestCounts[r.pest_type] = (pestCounts[r.pest_type] || 0) + 1; });
    const topPest = Object.entries(pestCounts).sort((a, b) => b[1] - a[1])[0];

    // Separate pests vs diseases
    const DISEASES = ['Leaf Rust', 'Coffee Wilt Disease'];
    const pestRecords = records.filter(r => !DISEASES.includes(r.pest_type));
    const diseaseRecords = records.filter(r => DISEASES.includes(r.pest_type));

    // Block risk
    const blockRisk = {};
    records.forEach(r => {
        const k = r.blockName || r.block_id;
        if (!blockRisk[k]) blockRisk[k] = { max: 0, count: 0 };
        blockRisk[k].max = Math.max(blockRisk[k].max, r.severity_rating || 0);
        blockRisk[k].count++;
    });

    container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        <h1 class="page-title">Crop Health</h1>
        <p class="page-subtitle">Pest & disease surveillance across all blocks</p>
      </div>
      <button class="btn btn-primary" id="add-scout-btn">
        <span class="material-symbols-outlined" style="font-size:15px;">add_circle</span> Log Scout Report
      </button>
    </div>

    <!-- Alerts Banner -->
    ${criticalRecords.length > 0 ? `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(239,83,80,.08);border:1px solid rgba(239,83,80,.25);border-radius:6px;margin-bottom:16px;">
      <span class="material-symbols-outlined" style="color:var(--red-text);font-size:20px;">warning</span>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--red-text);">${criticalRecords.length} Critical Alert${criticalRecords.length > 1 ? 's' : ''} — Severity ≥ 4</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
          ${criticalRecords.map(r => `${r.blockName || r.block_id}: ${r.pest_type}`).join(' · ')}
        </div>
      </div>
    </div>` : ''}

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px;">
      <div class="kpi-card">
        <div class="kpi-label">Scout Reports</div>
        <div class="kpi-value" style="font-size:22px;">${records.length}</div>
      </div>
      <div class="kpi-card ${criticalRecords.length > 0 ? 'red-border' : ''}">
        <div class="kpi-label">Critical Issues</div>
        <div class="kpi-value" style="font-size:22px;color:${criticalRecords.length > 0 ? 'var(--red-text)' : 'var(--green-text)'};">${criticalRecords.length}</div>
        <div style="margin-top:4px;font-size:10px;color:var(--text-muted);">${criticalRecords.length === 0 ? '✓ All clear' : 'Action required'}</div>
      </div>
      <div class="kpi-card gold-border">
        <div class="kpi-label">Top Pressure</div>
        <div class="kpi-value" style="font-size:13px;font-weight:700;line-height:1.4;">${topPest ? topPest[0] : '—'}</div>
        <div style="margin-top:4px;font-size:10px;color:var(--text-muted);">${topPest ? topPest[1] + ' reports' : 'No data yet'}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
      <!-- Pest Reports -->
      <div class="section-card">
        <div class="card-header">
          <h2 class="card-title">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px;">pest_control</span>
            Pest Reports
          </h2>
          <span style="font-size:10px;color:var(--text-muted);">${pestRecords.length} records</span>
        </div>
        <table class="data-table">
          <thead><tr><th>Date</th><th>Block</th><th>Pest</th><th>Severity</th></tr></thead>
          <tbody>
            ${pestRecords.length === 0
            ? `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">No pest reports logged.</td></tr>`
            : pestRecords.map(r => `<tr>
                  <td style="font-size:11px;color:var(--text-muted);">${r.scout_date}</td>
                  <td class="strong">${r.blockName || r.block_id}</td>
                  <td style="font-size:11px;font-weight:600;">${r.pest_type}</td>
                  <td><span style="color:${severityColor(r.severity_rating)};font-weight:700;font-size:11px;">${r.severity_rating}/5 ${severityLabel(r.severity_rating)}</span></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Disease Reports -->
      <div class="section-card">
        <div class="card-header">
          <h2 class="card-title">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px;">coronavirus</span>
            Disease Reports
          </h2>
          <span style="font-size:10px;color:var(--text-muted);">${diseaseRecords.length} records</span>
        </div>
        <table class="data-table">
          <thead><tr><th>Date</th><th>Block</th><th>Disease</th><th>Severity</th></tr></thead>
          <tbody>
            ${diseaseRecords.length === 0
            ? `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">No disease reports logged.</td></tr>`
            : diseaseRecords.map(r => `<tr>
                  <td style="font-size:11px;color:var(--text-muted);">${r.scout_date}</td>
                  <td class="strong">${r.blockName || r.block_id}</td>
                  <td style="font-size:11px;font-weight:600;">${r.pest_type}</td>
                  <td><span style="color:${severityColor(r.severity_rating)};font-weight:700;font-size:11px;">${r.severity_rating}/5 ${severityLabel(r.severity_rating)}</span></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Full Scouting Log + Block Risk -->
    <div style="display:grid;grid-template-columns:1fr 260px;gap:14px;">
      <div class="section-card">
        <div class="card-header">
          <h2 class="card-title">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:4px;">content_paste_search</span>
            Full Scouting Log
          </h2>
          <span style="font-size:10px;color:var(--text-muted);">${records.length} total entries</span>
        </div>
        <table class="data-table">
          <thead><tr>
            <th>Date</th><th>Block</th><th>Report Type</th><th>Severity</th><th>Action Taken</th><th>Next Scout</th><th></th>
          </tr></thead>
          <tbody>
            ${records.length === 0
            ? `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-muted);">No scouting logs yet. Click "Log Scout Report" to begin.</td></tr>`
            : records.map(r => `<tr>
                  <td style="font-size:11px;color:var(--text-muted);">${r.scout_date}</td>
                  <td class="strong">${r.blockName || r.block_id}</td>
                  <td><span class="badge ${DISEASES.includes(r.pest_type) ? 'amber' : 'red'}" style="font-size:8px;">${DISEASES.includes(r.pest_type) ? 'Disease' : 'Pest'}</span></td>
                  <td><span style="color:${severityColor(r.severity_rating)};font-weight:700;font-size:11px;">${r.severity_rating}/5</span></td>
                  <td style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.action_taken || ''}">${r.action_taken || '—'}</td>
                  <td style="font-size:11px;color:var(--text-muted);">${r.next_scout_date || '—'}</td>
                  <td><button class="btn btn-ghost btn-sm del-scout" data-id="${r.id}" style="color:var(--red-text);">✕</button></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Block Risk Map -->
      <div class="section-card">
        <div class="card-header"><h2 class="card-title">Block Risk Map</h2></div>
        <div style="padding:0 14px 14px;">
          ${Object.keys(blockRisk).length === 0
            ? `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px;">Start scouting to see risk map.</div>`
            : Object.entries(blockRisk).map(([block, info]) => {
                const color = info.max <= 2 ? 'var(--green-text)' : info.max <= 3 ? 'var(--amber-text)' : 'var(--red-text)';
                const bg = info.max <= 2 ? 'rgba(67,160,71,.12)' : info.max <= 3 ? 'rgba(255,160,0,.12)' : 'rgba(239,83,80,.12)';
                return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-subtle);">
                  <div>
                    <div style="font-size:12px;font-weight:700;">${block}</div>
                    <div style="font-size:10px;color:var(--text-muted);">${info.count} scout records</div>
                  </div>
                  <div style="background:${bg};color:${color};padding:4px 10px;border-radius:12px;font-size:11px;font-weight:700;">Sev ${info.max}/5</div>
                </div>`;
            }).join('')}
          <div style="margin-top:12px;padding:10px;background:var(--bg-overlay);border-radius:6px;font-size:10px;color:var(--text-muted);">
            <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">info</span>
            Scout weekly during flowering &amp; berry fill. Severity ≥ 4 requires immediate action.
          </div>
        </div>
      </div>
    </div>
  `;

    container.querySelector('#add-scout-btn').addEventListener('click', () => {
        showScoutModal(container, blocks, async (data) => {
            await dataService.addIpmRecord(data);
            renderCropHealth(container);
        });
    });

    container.querySelectorAll('.del-scout').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Delete this scout record?')) {
                await dataService.deleteIpmRecord(btn.dataset.id);
                renderCropHealth(container);
            }
        });
    });
}

function showScoutModal(container, blocks, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="width:500px;">
      <div class="modal-header">
        <h3>Log Scout Report</h3>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Block</label>
            <select class="form-input" id="sc-block">
              <option value="">— Select —</option>
              ${blocks.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Scout Date</label>
            <input class="form-input" type="date" id="sc-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Pest or Disease</label>
            <select class="form-input" id="sc-pest">
              ${PEST_TYPES.map(p => `<option>${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Severity (1–5)</label>
            <select class="form-input" id="sc-severity">
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
          <input class="form-input" id="sc-action" placeholder="e.g. Applied copper fungicide, removed infected twigs">
        </div>
        <div class="form-group">
          <label class="form-label">Next Scout Date</label>
          <input class="form-input" type="date" id="sc-next">
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-input" id="sc-notes" rows="2" placeholder="Weather conditions, spread pattern…"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="save-scout">Save Report</button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').onclick = () => overlay.remove();
    overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#save-scout').onclick = async () => {
        const block_id = overlay.querySelector('#sc-block').value;
        if (!block_id) { alert('Select a block.'); return; }
        await onSave({
            block_id,
            scout_date: overlay.querySelector('#sc-date').value,
            scout_cell: '',
            pest_type: overlay.querySelector('#sc-pest').value,
            incidence_pct: null,
            severity_rating: parseInt(overlay.querySelector('#sc-severity').value),
            action_taken: overlay.querySelector('#sc-action').value,
            next_scout_date: overlay.querySelector('#sc-next').value,
            notes: overlay.querySelector('#sc-notes').value,
        });
        overlay.remove();
    };
}
