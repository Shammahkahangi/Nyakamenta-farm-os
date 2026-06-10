// ============================================================
// salesFinance.js — Sales & farm finance (single pillar)
// ============================================================
import { renderDomesticDispatch } from './domesticDispatch.js';
import { renderFinance } from './finance.js';

const PREFERRED_TAB_KEY = 'salesFinancePreferredTab';

const TABS = [
  { id: 'sales', label: 'Sales & dispatch', icon: 'local_shipping' },
  { id: 'finance', label: 'Farm finance', icon: 'account_balance' },
];

let activeTab = 'sales';

function consumePreferredTab() {
  try {
    const pref = sessionStorage.getItem(PREFERRED_TAB_KEY);
    if (pref === 'reports') {
      sessionStorage.removeItem(PREFERRED_TAB_KEY);
      return 'finance';
    }
    if (pref && TABS.some((t) => t.id === pref)) {
      sessionStorage.removeItem(PREFERRED_TAB_KEY);
      return pref;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function renderSalesFinance(container) {
  const initial = consumePreferredTab();
  if (initial) activeTab = initial;

  container.innerHTML = `
    <div style="margin-bottom:18px;">
      <h1 class="page-title">Farm finance</h1>
      <p class="page-subtitle">Domestic dispatch · UGX ledger &amp; accounting</p>
    </div>
    <div class="pillar-tab-bar">
      ${TABS.map(
        (t) => `
        <button class="pillar-tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
          <span class="material-symbols-outlined">${t.icon}</span>
          ${t.label}
        </button>`
      ).join('')}
    </div>
    <div id="pillar-content"></div>
  `;

  const tabContent = container.querySelector('#pillar-content');

  const renderTab = async (tab) => {
    activeTab = tab;
    container.querySelectorAll('.pillar-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    tabContent.innerHTML = '<div class="pillar-loading">Loading…</div>';
    try {
      if (tab === 'sales') await renderDomesticDispatch(tabContent);
      if (tab === 'finance') await renderFinance(tabContent);
    } catch (e) {
      console.error('[Sales & finance tab]', e);
      tabContent.innerHTML = `<div class="pillar-loading" style="color:var(--red-text);padding:24px;">Could not load this section. ${String(e?.message || e)}</div>`;
    }
  };

  container.querySelectorAll('.pillar-tab').forEach((btn) => {
    btn.addEventListener('click', () => renderTab(btn.dataset.tab));
  });

  await renderTab(activeTab);
}
