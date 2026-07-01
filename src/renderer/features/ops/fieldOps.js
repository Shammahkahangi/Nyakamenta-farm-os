// ============================================================
// fieldOps.js — Field Operations Pillar
// (Workforce · Irrigation · Soil & Fertility)
// ============================================================
import { renderWorkforce } from '../biz/workforce.js';
import { renderMaintenanceRates } from './maintenanceRates.js';
import { renderIrrigation } from './irrigation.js';
import { renderSoil } from './soil.js';

const TABS = [
  { id: 'workers', label: 'Workers', icon: 'group' },
  { id: 'maintenance', label: 'Maintenance', icon: 'home_repair_service' },
  { id: 'irrigation', label: 'Irrigation', icon: 'water_drop' },
  { id: 'soil', label: 'Fertilizer', icon: 'compost' },
];

let activeTab = 'workers';

export async function renderFieldOps(container) {
  container.innerHTML = `
    <div style="margin-bottom:18px;">
      <h1 class="page-title">Field Operations</h1>
      <p class="page-subtitle">All on-farm activities — workers, land management & crop maintenance</p>
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
    if (tab === 'workers') await renderWorkforce(tabContent);
    if (tab === 'maintenance') await renderMaintenanceRates(tabContent);
    if (tab === 'irrigation') await renderIrrigation(tabContent);
    if (tab === 'soil') await renderSoil(tabContent);
  };

  container.querySelectorAll('.pillar-tab').forEach(btn => {
    btn.addEventListener('click', () => renderTab(btn.dataset.tab));
  });

  await renderTab(activeTab);
}
