// ============================================================
// harvestProcessing.js — Harvest & Processing Pillar
// (Batches · Processing)
// ============================================================
import { renderBatches } from './batches.js';
import { renderProcessing } from './processing.js';

const TABS = [
    { id: 'batches', label: 'Batches', icon: 'layers' },
    { id: 'processing', label: 'Post-harvest', icon: 'water_drop' },
];

let activeTab = 'batches';

export async function renderHarvestProcessing(container) {
    container.innerHTML = `
    <div style="margin-bottom:18px;">
      <h1 class="page-title">Harvest & Processing</h1>
      <p class="page-subtitle">Cherry through <strong>washing &amp; drying</strong> on the farm. Milling and grading are optional (e.g. off-farm) — mark batches complete after drying when that matches your operation.</p>
    </div>
    <div class="pillar-tab-bar">
      ${TABS.map(t => `
        <button class="pillar-tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
          <span class="material-symbols-outlined">${t.icon}</span>
          ${t.label}
        </button>`).join('')}
    </div>
    <div id="pillar-content"></div>
  `;

    const tabContent = container.querySelector('#pillar-content');

    const renderTab = async (tab) => {
        activeTab = tab;
        container.querySelectorAll('.pillar-tab').forEach(b =>
            b.classList.toggle('active', b.dataset.tab === tab));
        tabContent.innerHTML = '<div class="pillar-loading">Loading…</div>';
        if (tab === 'batches') await renderBatches(tabContent);
        if (tab === 'processing') await renderProcessing(tabContent);
    };

    container.querySelectorAll('.pillar-tab').forEach(btn => {
        btn.addEventListener('click', () => renderTab(btn.dataset.tab));
    });

    await renderTab(activeTab);
}
