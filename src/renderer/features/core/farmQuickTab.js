// ============================================================
// farmQuickTab.js — Farm quick UI (blocks, costs, activity)
// Merge into farmOverview.js: import { renderFarmQuickTab } from './farmQuickTab.js';
// Add tab { id: 'quick', label: 'Farm', icon: 'eco' } first; activeTab = 'quick';
// ============================================================
import { dataService } from '../../services/dataService.js';

/** Current calendar month total expenses (UGX) — shared with Overview. */
export function monthCost(financeItems) {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return financeItems.reduce((s, i) => {
    const d = new Date(i.date);
    if (Number.isNaN(d.getTime())) return s;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (k !== key || i.type !== 'Expense') return s;
    return s + Number(i.amount || 0);
  }, 0);
}

function openActivityModal(onSubmit) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Add activity</span>
        <button type="button" class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Log a quick field note (saved as finance memo / local note only for demo).</p>
        <textarea class="form-textarea" id="act-note" rows="4" placeholder="e.g. Block A irrigated, stumping crew on Block C…"></textarea>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="act-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="act-save">Save</button>
      </div>
    </div>`;
  const close = () => backdrop.remove();
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#act-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('#act-save').addEventListener('click', () => {
    const v = backdrop.querySelector('#act-note').value.trim();
    if (v) onSubmit(v);
    close();
  });
  document.body.appendChild(backdrop);
}

export async function renderFarmQuickTab(container, rerender) {
  const [blocks, wf, financeItems, batches] = await Promise.all([
    dataService.getBlocks(),
    dataService.getWorkforce(),
    dataService.getFinanceItems(),
    dataService.getBatches(),
  ]);
  const workers = wf.departments || [];
  const cost = monthCost(financeItems);

  const activities = [];
  batches.slice(0, 6).forEach((b) => {
    activities.push({
      icon: 'grain',
      t: `Batch ${b.id || ''}: ${Number(b.kgOut || 0).toLocaleString()} kg processed`,
      m: b.date || '',
    });
  });
  financeItems.slice(0, 4).forEach((i) => {
    activities.push({
      icon: i.type === 'Revenue' ? 'trending_up' : 'payments',
      t: `${i.type}: ${i.category || ''} — ${dataService.formatCurrency(Number(i.amount || 0))}`,
      m: i.date || '',
    });
  });

  container.innerHTML = `
    <div class="farm-quick-kpis">
      <div class="kpi-card"><div class="kpi-label">Total blocks</div><div class="kpi-value">${blocks.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Active workers</div><div class="kpi-value green">${workers.length || wf.totalWorkers || 0}</div></div>
      <div class="kpi-card gold-border"><div class="kpi-label">This month cost</div><div class="kpi-value gold">${dataService.formatCurrency(cost)}</div></div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
      <button type="button" class="btn btn-primary" id="farm-add-activity">
        <span class="material-symbols-outlined" style="font-size:16px;">add</span> Add activity
      </button>
    </div>
    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:14px;" class="farm-quick-grid">
      <div>
        <div class="section-title">Blocks</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
          ${blocks
            .map(
              (b) => `
            <div class="block-card">
              <div class="block-id">Block</div>
              <div class="block-name">${b.name || 'Unnamed'}</div>
              <div class="block-stat">${Number(b.acres || 0).toFixed(1)} ac · <span>${b.status || '—'}</span></div>
            </div>`
            )
            .join('') || '<p style="color:var(--text-muted);font-size:12px;">No blocks yet.</p>'}
        </div>
      </div>
      <div class="section-card" style="border:none;">
        <div class="activity-feed-header">Activity log</div>
        <div class="activity-feed" style="border:none;">
          ${activities
            .map(
              (a) => `
            <div class="activity-item">
              <div class="activity-icon"><span class="material-symbols-outlined" style="font-size:18px;">${a.icon}</span></div>
              <div class="activity-body"><div class="activity-title">${a.t}</div><div class="activity-meta">${a.m}</div></div>
            </div>`
            )
            .join('')}
        </div>
      </div>
    </div>
  `;

  container.querySelector('#farm-add-activity')?.addEventListener('click', () => {
    openActivityModal(() => {
      if (typeof rerender === 'function') rerender();
    });
  });
}
