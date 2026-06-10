// ============================================================
// shade.js — Shade Tree Management Module (Robusta)
// ============================================================
import { dataService } from '../../services/dataService.js';

const SPECIES_LIST = [
    'Albizia chinensis', 'Grevillea robusta', 'Maesopsis eminii',
    'Markhamia lutea', 'Calliandra calothyrsus', 'Erythrina abyssinica',
    'Cordia africana', 'Spathodea campanulata', 'Leucaena leucocephala', 'Other',
];
const CANOPY_DENSITY = ['Light (< 25%)', 'Medium (25–50%)', 'Dense (50–75%)', 'Very Dense (> 75%)'];

function heightStatus(current, target) {
    if (!current) return { label: 'Unknown', color: 'var(--text-muted)' };
    target = target || 4.5;
    if (current > target + 0.5) return { label: 'Above Target — Prune', color: 'var(--red-text)' };
    if (current >= target - 0.5) return { label: 'On Target', color: 'var(--green-text)' };
    return { label: 'Below Target', color: 'var(--amber-text)' };
}

export async function renderShade(container) {
    const [shadeTrees, blocks] = await Promise.all([
        dataService.getShadeTrees(),
        dataService.getBlocks(),
    ]);

    const overheight = shadeTrees.filter(t => t.current_height_m > (t.target_height_m || 4.5) + 0.5);
    const totalTrees = shadeTrees.reduce((s, t) => s + (t.count || 0), 0);
    const needsPruning = shadeTrees.filter(t => {
        if (!t.last_pruned_date) return true;
        const daysSince = (Date.now() - new Date(t.last_pruned_date)) / 86400000;
        return daysSince > 183; // more than ~6 months
    }).length;

    container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        <h1 class="page-title">Shade Tree Management</h1>
        <p class="page-subtitle">Canopy control & agroforestry system · Robusta Estate</p>
      </div>
      <button class="btn btn-primary" id="add-shade-btn">
        <span class="material-symbols-outlined" style="font-size:15px;">forest</span> Add Shade Tree Record
      </button>
    </div>

    <!-- KPI Strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px;">
      <div class="kpi-card">
        <div class="kpi-label">Total Shade Trees</div>
        <div class="kpi-value" style="font-size:22px;">${totalTrees.toLocaleString()}</div>
        <div style="margin-top:4px;font-size:10px;color:var(--text-muted);">${shadeTrees.length} species/block records</div>
      </div>
      <div class="kpi-card ${overheight.length > 0 ? 'red-border' : ''}">
        <div class="kpi-label">Above Height Target</div>
        <div class="kpi-value" style="font-size:22px;color:${overheight.length > 0 ? 'var(--red-text)' : 'var(--green-text)'};">${overheight.length}</div>
        <div style="margin-top:4px;font-size:10px;color:${overheight.length > 0 ? 'var(--red-text)' : 'var(--text-muted)'};">
          ${overheight.length > 0 ? '⚠ Schedule pruning' : '✓ All in range'}
        </div>
      </div>
      <div class="kpi-card ${needsPruning > 0 ? 'red-border' : ''}">
        <div class="kpi-label">Due for Pruning</div>
        <div class="kpi-value" style="font-size:22px;color:${needsPruning > 0 ? 'var(--amber-text)' : 'var(--green-text)'};">${needsPruning}</div>
        <div style="margin-top:4px;font-size:10px;color:var(--text-muted);">Not pruned in >6 months</div>
      </div>
      <div class="kpi-card gold-border">
        <div class="kpi-label">UCDA Target Height</div>
        <div class="kpi-value" style="font-size:22px;">4–5 <small style="font-size:12px;">m</small></div>
        <div style="margin-top:4px;font-size:10px;color:var(--text-muted);">Prune at start of rainy season</div>
      </div>
    </div>

    <!-- Main Table -->
    <div class="section-card">
      <div class="card-header">
        <h2 class="card-title">Shade Tree Records</h2>
        <span style="font-size:10px;color:var(--text-muted);">${shadeTrees.length} entries</span>
      </div>
      <table class="data-table">
        <thead><tr>
          <th>Block</th><th>Species</th><th>Count</th><th>Spacing (m)</th>
          <th>Cost (UGX)</th><th>Planted</th><th>Last Pruned</th><th>Height (m)</th><th>Target (m)</th><th>Canopy</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          ${shadeTrees.length === 0
            ? `<tr><td colspan="12" style="text-align:center;padding:28px;color:var(--text-muted);">No shade tree records. Add your first entry.</td></tr>`
            : shadeTrees.map(t => {
                const hs = heightStatus(t.current_height_m, t.target_height_m);
                const daysSince = t.last_pruned_date
                    ? Math.round((Date.now() - new Date(t.last_pruned_date)) / 86400000)
                    : null;
                return `<tr>
                  <td class="strong">${t.blockName || t.block_id}</td>
                  <td style="font-size:11px;font-style:italic;">${t.species}</td>
                  <td class="tabular-nums">${(t.count || 0).toLocaleString()}</td>
                  <td class="tabular-nums">${t.spacing_m != null ? t.spacing_m + ' m' : '—'}</td>
                  <td class="tabular-nums">${Number(t.cost_ugx) > 0 ? Number(t.cost_ugx).toLocaleString() : '—'}</td>
                  <td style="font-size:11px;color:var(--text-muted);">${t.planted_date || '—'}</td>
                  <td style="font-size:11px;color:${daysSince && daysSince > 183 ? 'var(--amber-text)' : 'var(--text-muted)'};">
                    ${t.last_pruned_date || '—'} ${daysSince ? `(${daysSince}d ago)` : ''}
                  </td>
                  <td class="tabular-nums">${t.current_height_m != null ? t.current_height_m + ' m' : '—'}</td>
                  <td class="tabular-nums">${t.target_height_m || 4.5} m</td>
                  <td style="font-size:11px;color:var(--text-muted);">${t.canopy_density || '—'}</td>
                  <td><span style="font-size:11px;font-weight:700;color:${hs.color};">${hs.label}</span></td>
                  <td>
                    <button class="btn btn-ghost btn-sm prune-shade-btn" data-id="${t.id}" title="Log pruning">✂</button>
                    <button class="btn btn-ghost btn-sm del-shade-btn" data-id="${t.id}" style="color:var(--red-text);">✕</button>
                  </td>
                </tr>`;
            }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Guideline Banner -->
    <div style="margin-top:14px;padding:14px 18px;background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;font-size:11px;color:var(--text-muted);line-height:1.8;">
      <span style="font-weight:700;color:var(--text-secondary);">UCDA Shade Guidelines</span> ·
      Spacing: ~20–40 m depending on species/canopy ·
      Prune at the beginning of each rainy season ·
      Target height: <strong>4–5 m</strong> — excessive shade increases humidity, twig borer, and rust risk ·
      Windbreakers: ~30 m on flat terrain, ~15 m on slopes
    </div>
  `;

    container.querySelector('#add-shade-btn').addEventListener('click', () => {
        showShadeModal(container, blocks, async (data) => {
            await dataService.addShadeTree(data);
            renderShade(container);
        });
    });

    container.querySelectorAll('.prune-shade-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const today = new Date().toISOString().split('T')[0];
            const newH = prompt('Enter current height after pruning (m):', '4.5');
            if (newH === null) return;
            await dataService.updateShadeTree(btn.dataset.id, {
                last_pruned_date: today,
                current_height_m: parseFloat(newH) || 4.5,
            });
            renderShade(container);
        });
    });

    container.querySelectorAll('.del-shade-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('Delete this shade tree record?')) {
                await dataService.deleteShadeTree(btn.dataset.id);
                renderShade(container);
            }
        });
    });
}

function showShadeModal(container, blocks, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-box" style="width:500px;">
      <div class="modal-header"><h3>Add Shade Tree Record</h3><button class="modal-close">✕</button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Block</label>
            <select class="form-input" id="st-block">
              <option value="">— Select —</option>${blocks.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Species</label>
            <select class="form-input" id="st-species">${SPECIES_LIST.map(s => `<option>${s}</option>`).join('')}</select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Tree Count</label><input class="form-input" type="number" id="st-count" placeholder="120"></div>
          <div class="form-group"><label class="form-label">Spacing (m)</label><input class="form-input" type="number" id="st-spacing" placeholder="25" step="0.5"></div>
          <div class="form-group"><label class="form-label">Target Height (m)</label><input class="form-input" type="number" id="st-target" value="4.5" step="0.5"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Planted Date</label>
            <input class="form-input" type="date" id="st-planted">
          </div>
          <div class="form-group"><label class="form-label">Current Height (m)</label>
            <input class="form-input" type="number" id="st-height" step="0.1" placeholder="3.5">
          </div>
        </div>
        <div class="form-group"><label class="form-label">Canopy Density</label>
          <select class="form-input" id="st-canopy">${CANOPY_DENSITY.map(c => `<option>${c}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="form-label">Cost (UGX) — optional</label>
          <input class="form-input tabular-nums" type="number" id="st-cost" min="0" step="1" placeholder="0">
          <p style="margin:4px 0 0;font-size:10px;color:var(--text-muted);">Posts to Farm finance when &gt; 0.</p>
        </div>
        <div class="form-group"><label class="form-label">Notes</label>
          <textarea class="form-input" id="st-notes" rows="2" placeholder="e.g. Used for windbreak on north boundary"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="save-shade">Save Record</button>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').onclick = () => overlay.remove();
    overlay.querySelector('.modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#save-shade').onclick = async () => {
        const block_id = overlay.querySelector('#st-block').value;
        if (!block_id) { alert('Select a block.'); return; }
        await onSave({
            block_id,
            species: overlay.querySelector('#st-species').value,
            count: parseInt(overlay.querySelector('#st-count').value) || 0,
            spacing_m: parseFloat(overlay.querySelector('#st-spacing').value) || null,
            planted_date: overlay.querySelector('#st-planted').value,
            current_height_m: parseFloat(overlay.querySelector('#st-height').value) || null,
            target_height_m: parseFloat(overlay.querySelector('#st-target').value) || 4.5,
            canopy_density: overlay.querySelector('#st-canopy').value,
            notes: overlay.querySelector('#st-notes').value,
            cost_ugx: parseFloat(overlay.querySelector('#st-cost').value) || 0,
        });
        overlay.remove();
    };
}
