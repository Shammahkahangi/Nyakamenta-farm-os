// ============================================================
// soil.js — Fertilizer Program
// (Soil-sample capture was retired — rural farms don't routinely
//  lab-test soil. We keep the fertilizer application log, which
//  is useful for cost tracking and planning split applications.
//  The `soil_records` table + dataService methods remain in case
//  the feature is re-enabled later.)
// ============================================================
import { dataService } from '../../services/dataService.js';

export async function renderSoil(container) {
    const [fertilityApps, blocks] = await Promise.all([
        dataService.getFertilityApplications(),
        dataService.getBlocks(),
    ]);

    const totalFertCost = fertilityApps.reduce((s, f) => s + (f.cost || 0), 0);
    const totalKg = fertilityApps.reduce((s, f) => s + (f.total_kg || 0), 0);

    container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        <h1 class="page-title">Fertilizer Program</h1>
        <p class="page-subtitle">Track every fertilizer, manure, or lime application — what went where, how much, and what it cost.</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" id="add-fert-btn">
          <span class="material-symbols-outlined" style="font-size:15px;">compost</span> Log Application
        </button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px;">
      <div class="kpi-card gold-border">
        <div class="kpi-label">Total spend (to date)</div>
        <div class="kpi-value gold" style="font-size:22px;">UGX ${totalFertCost.toLocaleString()}</div>
        <div style="margin-top:4px;font-size:10px;color:var(--text-muted);">${fertilityApps.length} application${fertilityApps.length === 1 ? '' : 's'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total fertilizer used</div>
        <div class="kpi-value" style="font-size:22px;">${totalKg.toLocaleString()}<small style="font-size:12px;color:var(--text-muted);"> kg</small></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Applications</div>
        <div class="kpi-value" style="font-size:22px;">${fertilityApps.length}</div>
      </div>
    </div>

    <div class="section-card">
      <div class="card-header">
        <h2 class="card-title">Fertilizer Applications</h2>
        <span style="font-size:10px;color:var(--text-muted);">${fertilityApps.length} record${fertilityApps.length === 1 ? '' : 's'}</span>
      </div>
      <table class="data-table">
        <thead><tr>
          <th>Date</th><th>Block</th><th>Product</th><th>Type</th><th>kg/ha</th><th>Total kg</th><th>Cost (UGX)</th><th></th>
        </tr></thead>
        <tbody>
          ${fertilityApps.length === 0
            ? `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-muted);">No applications recorded yet. Use <strong>Log Application</strong> when fertilizer or manure goes out to the field.</td></tr>`
            : fertilityApps.map(f => `<tr>
                  <td style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${f.application_date}</td>
                  <td class="strong">${f.blockName || f.block_id}</td>
                  <td style="font-size:11px;font-weight:600;">${f.product}</td>
                  <td style="font-size:11px;color:var(--text-muted);">${f.type}</td>
                  <td class="tabular-nums">${f.kg_per_ha != null ? f.kg_per_ha : '—'}</td>
                  <td class="tabular-nums">${f.total_kg != null ? f.total_kg.toLocaleString() : '—'}</td>
                  <td class="tabular-nums">${(f.cost || 0).toLocaleString()}</td>
                  <td><button class="btn btn-ghost btn-sm del-fert" data-id="${f.id}" style="color:var(--red-text);" title="Delete">✕</button></td>
                </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div style="margin-top:14px;padding:14px 18px;background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;font-size:11px;color:var(--text-muted);line-height:1.7;">
      <span style="font-weight:700;color:var(--text-secondary);">Field tip</span> ·
      Split mineral N across both rainy seasons — top-dress at flowering and again during berry fill.
      Keep organic mulch in place year-round; it does more for Robusta than any single NPK bag.
    </div>
  `;

    container.querySelector('#add-fert-btn').addEventListener('click', () => {
        showFertModal(container, blocks, async (data) => {
            await dataService.addFertilityApplication(data);
            renderSoil(container);
        });
    });
    container.querySelectorAll('.del-fert').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this fertilizer application?')) return;
            if (typeof dataService.deleteFertilityApplication === 'function') {
                await dataService.deleteFertilityApplication(btn.dataset.id);
            } else {
                // Fallback to generic execute when no dedicated helper exists.
                const api = (await import('../../services/estateApi.js')).getEstateApi();
                await api.execute('DELETE FROM fertility_applications WHERE id = ?', [btn.dataset.id]);
            }
            renderSoil(container);
        });
    });
}

function showFertModal(container, blocks, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="width:480px;">
      <div class="modal-header"><h3>Log Fertilizer Application</h3><button class="modal-close">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Block</label>
            <select class="form-input" id="f-block">
              <option value="">— Select —</option>${blocks.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Application Date</label>
            <input class="form-input" type="date" id="f-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Product Name</label>
            <input class="form-input" id="f-product" placeholder="e.g. CAN, NPK 17:17:17, Farmyard Manure">
          </div>
          <div class="form-group"><label class="form-label">Type</label>
            <select class="form-input" id="f-type">
              <option>Mineral (Inorganic)</option><option>Organic</option><option>Foliar</option><option>Lime / Amendment</option>
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">kg / ha</label><input class="form-input" type="number" id="f-kgha" placeholder="150"></div>
          <div class="form-group"><label class="form-label">Total kg</label><input class="form-input" type="number" id="f-total" placeholder="600"></div>
          <div class="form-group"><label class="form-label">Cost (UGX)</label><input class="form-input" type="number" id="f-cost" placeholder="450000"></div>
        </div>
        <div class="form-group"><label class="form-label">Applied By</label>
          <input class="form-input" id="f-by" placeholder="e.g. Field Team A">
        </div>
        <div class="form-group"><label class="form-label">Notes</label>
          <textarea class="form-input" id="f-notes" rows="2" placeholder="Split application, top-dress at berry fill…"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="save-fert">Save Application</button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').onclick = () => overlay.remove();
    overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#save-fert').onclick = async () => {
        const block_id = overlay.querySelector('#f-block').value;
        const product = overlay.querySelector('#f-product').value.trim();
        if (!block_id || !product) { alert('Block and product required.'); return; }
        await onSave({
            block_id,
            application_date: overlay.querySelector('#f-date').value,
            product,
            type: overlay.querySelector('#f-type').value,
            kg_per_ha: parseFloat(overlay.querySelector('#f-kgha').value) || null,
            total_kg: parseFloat(overlay.querySelector('#f-total').value) || null,
            cost: parseFloat(overlay.querySelector('#f-cost').value) || 0,
            applied_by: overlay.querySelector('#f-by').value,
            notes: overlay.querySelector('#f-notes').value,
        });
        overlay.remove();
    };
}
