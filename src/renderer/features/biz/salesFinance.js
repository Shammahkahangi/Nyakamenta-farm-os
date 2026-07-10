// ============================================================
// salesFinance.js — Farm finance pillar (ledger & accounting)
// Domestic dispatch is summarised under General Report; sales
// revenue still posts into the farm ledger automatically.
// ============================================================
import { renderFinance } from './finance.js';

const PREFERRED_TAB_KEY = 'salesFinancePreferredTab';

/** Clear legacy preferred-tab keys (sales tab removed). */
function consumePreferredTab() {
  try {
    const pref = sessionStorage.getItem(PREFERRED_TAB_KEY);
    if (pref) sessionStorage.removeItem(PREFERRED_TAB_KEY);
  } catch {
    /* ignore */
  }
}

export async function renderSalesFinance(container) {
  consumePreferredTab();
  container.innerHTML = `
    <div style="margin-bottom:18px;">
      <h1 class="page-title">Farm finance</h1>
    </div>
    <div id="pillar-content"></div>
  `;
  const tabContent = container.querySelector('#pillar-content');
  try {
    await renderFinance(tabContent);
  } catch (e) {
    console.error('[Farm finance]', e);
    tabContent.innerHTML = `<div class="pillar-loading" style="color:var(--red-text);padding:24px;">Could not load farm finance. ${String(e?.message || e)}</div>`;
  }
}
