// ============================================================
// ownerOverview.js — Overview with tabs: snapshot vs Command Center / Block Register
// ============================================================
import { dataService } from '../../services/dataService.js';
import { renderDashboard } from './dashboard.js';
import { renderEstate } from '../ops/estate.js';
import { monthCost } from './farmQuickTab.js';

function monthKey(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

function buildSeries(rows, getDate, getValue, months = 6) {
  const now = new Date();
  const keys = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const map = {};
  for (const row of rows) {
    const k = monthKey(getDate(row));
    if (!k) continue;
    map[k] = (map[k] || 0) + Number(getValue(row) || 0);
  }
  return keys.map((k) => ({ key: k, value: map[k] || 0 }));
}

function svgLineSeries(series, w, h, pad = 8) {
  const max = Math.max(...series.map((s) => s.value), 1);
  const pts = series.map((s, i) => {
    const x = pad + (i / Math.max(series.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - (s.value / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  return { points: pts.join(' '), max };
}

/** One feed: batches, ledger lines, lodge — newest first (no duplicate sections). */
function mergedActivityFeed(batches, financeItems, lodgeBookings, limit = 12) {
  const rows = [];
  for (const b of batches) {
    const t = Date.parse(b.date || '');
    rows.push({
      ts: Number.isNaN(t) ? 0 : t,
      meta: b.date || '',
      icon: 'grain',
      cls: '',
      title: `Batch ${b.id || ''}: ${Number(b.kgOut || 0).toLocaleString()} kg processed`,
    });
  }
  for (const i of financeItems) {
    const t = Date.parse(i.date || '');
    rows.push({
      ts: Number.isNaN(t) ? 0 : t,
      meta: i.date || '',
      icon: i.type === 'Revenue' ? 'trending_up' : 'payments',
      cls: '',
      title: `${i.type}: ${i.category || '—'} — ${dataService.formatCurrency(Number(i.amount || 0))}`,
    });
  }
  for (const bk of lodgeBookings) {
    const t = Date.parse(bk.check_in || '');
    rows.push({
      ts: Number.isNaN(t) ? 0 : t,
      meta: bk.check_in || '',
      icon: 'hotel',
      cls: 'lodge',
      title: `Lodge ${bk.unit_code || ''} — ${bk.guest_name || 'Guest'}`,
    });
  }
  rows.sort((a, b) => b.ts - a.ts);
  return rows.slice(0, limit);
}

export async function renderOwnerOverview(container) {
  const [financeSummary, stats, batches, financeItems, lodgeBookings, wf, blocks] =
    await Promise.all([
      dataService.getFinanceSummary(),
      dataService.getComputedStats(),
      dataService.getBatches(),
      dataService.getFinanceItems(),
      dataService.getLodgeBookings().catch(() => []),
      dataService.getWorkforce(),
      dataService.getBlocks(),
    ]);

  const totalRevenue =
    Number(financeSummary?.totalRevenue || 0) ||
    financeItems.filter((i) => i.type === 'Revenue').reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalExp =
    Number(financeSummary?.totalExpenses || 0) ||
    financeItems.filter((i) => i.type === 'Expense').reduce((s, i) => s + Number(i.amount || 0), 0);
  const netProfit = Number(financeSummary?.netProfit ?? totalRevenue - totalExp);
  const farmYieldKg = Number(stats?.totalGreenBeanOutput || 0);
  const totalPlants = Number(stats?.totalPlants || 0);
  const plantCap = Number(stats?.farmPlantCapacity || 27000);
  const workers = wf.departments || [];
  const workerHeadcount = workers.length || Number(wf.totalWorkers || 0);
  const spendMtd = monthCost(financeItems);

  const revSeries = buildSeries(
    financeItems.filter((i) => i.type === 'Revenue'),
    (r) => r.date,
    (r) => r.amount,
    6
  );
  const harvestSeries = buildSeries(batches, (b) => b.date, (b) => b.kgOut, 6);
  const expenseSeries = buildSeries(
    financeItems.filter((i) => i.type === 'Expense'),
    (r) => r.date,
    (r) => r.amount,
    6
  );

  const revSvg = svgLineSeries(revSeries, 280, 88);
  const harSvg = svgLineSeries(harvestSeries, 280, 88);
  const expSvg = svgLineSeries(expenseSeries, 280, 88);

  const feed = mergedActivityFeed(batches, financeItems, lodgeBookings, 12);
  const netCls = netProfit >= 0 ? 'gold' : '';
  const netStyle = netProfit < 0 ? 'color:var(--red-text);' : '';

  let initialTab = 'snapshot';
  try {
    const s = sessionStorage.getItem('overviewPrimaryTab');
    if (s === 'snapshot' || s === 'command' || s === 'blocks') initialTab = s;
  } catch {
    /* ignore */
  }
  const dSnap = initialTab === 'snapshot' ? 'block' : 'none';
  const dCmd = initialTab === 'command' ? 'block' : 'none';
  const dBlk = initialTab === 'blocks' ? 'block' : 'none';

  container.innerHTML = `
    <div class="page-header" style="margin-bottom:8px;">
      <h1 class="page-title">Overview</h1>
      <p class="page-subtitle">Farm, finance, and lodge — use tabs to switch snapshot vs operations detail.</p>
    </div>
    <div class="pillar-tab-bar" style="margin-bottom:16px;">
      <button type="button" class="pillar-tab ${initialTab === 'snapshot' ? 'active' : ''}" data-ov-tab="snapshot">
        <span class="material-symbols-outlined">monitoring</span>Snapshot
      </button>
      <button type="button" class="pillar-tab ${initialTab === 'command' ? 'active' : ''}" data-ov-tab="command">
        <span class="material-symbols-outlined">dashboard</span>Command Center
      </button>
      <button type="button" class="pillar-tab ${initialTab === 'blocks' ? 'active' : ''}" data-ov-tab="blocks">
        <span class="material-symbols-outlined">table_rows</span>Block Register
      </button>
    </div>

    <div id="ov-snapshot" class="overview-tab-panel" style="display:${dSnap};">
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px;margin-bottom:16px;">
      <div class="kpi-card gold-border">
        <div class="kpi-label">Total revenue</div>
        <div class="kpi-value gold">${dataService.formatCurrency(totalRevenue)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net profit (ledger)</div>
        <div class="kpi-value ${netCls}" style="${netStyle}font-size:22px;">${dataService.formatCurrency(netProfit)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Season yield</div>
        <div class="kpi-value">${farmYieldKg.toLocaleString()} <small style="font-size:12px;font-weight:500;color:var(--text-muted);">kg green</small></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Coffee plants</div>
        <div class="kpi-value">${totalPlants.toLocaleString()}</div>
        <div class="kpi-delta" style="margin-top:6px;font-size:9px;color:var(--text-muted);">Capacity ${plantCap.toLocaleString()} · by block acres</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Blocks</div>
        <div class="kpi-value">${blocks.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Team (departments)</div>
        <div class="kpi-value green">${workerHeadcount}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">This month spend</div>
        <div class="kpi-value" style="color:var(--red-text);">${dataService.formatCurrency(spendMtd)}</div>
      </div>
    </div>

    <div class="section-card" style="margin-bottom:16px;">
      <div class="card-header" style="padding-bottom:0;">
        <h2 class="card-title">Six-month trends</h2>
        <span style="font-size:10px;color:var(--text-muted);">Revenue · harvest output · expenses</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px 16px 16px;">
        <div>
          <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin:0 0 6px;">Revenue</h3>
          <svg class="simple-line-chart" viewBox="0 0 280 88" preserveAspectRatio="none" style="width:100%;height:72px;">
            <polyline points="${revSvg.points}" />
          </svg>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:8px;color:var(--text-muted);text-transform:uppercase;">
            ${revSeries.map((s) => `<span>${s.key.slice(5)}</span>`).join('')}
          </div>
        </div>
        <div>
          <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin:0 0 6px;">Harvest (kg out)</h3>
          <svg class="simple-line-chart" viewBox="0 0 280 88" preserveAspectRatio="none" style="width:100%;height:72px;">
            <polyline points="${harSvg.points}" style="stroke:var(--gold-bright);" />
          </svg>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:8px;color:var(--text-muted);text-transform:uppercase;">
            ${harvestSeries.map((s) => `<span>${s.key.slice(5)}</span>`).join('')}
          </div>
        </div>
        <div>
          <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin:0 0 6px;">Expenses</h3>
          <svg class="simple-line-chart" viewBox="0 0 280 88" preserveAspectRatio="none" style="width:100%;height:72px;">
            <polyline points="${expSvg.points}" style="stroke:var(--red-text);" />
          </svg>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:8px;color:var(--text-muted);text-transform:uppercase;">
            ${expenseSeries.map((s) => `<span>${s.key.slice(5)}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="section-card" style="margin-bottom:20px;">
      <div class="card-header">
        <h2 class="card-title">Activity</h2>
        <span style="font-size:10px;color:var(--text-muted);">Batches, ledger, lodge — newest first</span>
      </div>
      <div class="activity-feed" style="border:none;border-radius:0;padding:0 16px 16px;">
        ${feed.length === 0
          ? '<p style="color:var(--text-muted);font-size:12px;padding:12px 0;">No activity yet.</p>'
          : feed
              .map(
                (a) => `
          <div class="activity-item">
            <div class="activity-icon ${a.cls}"><span class="material-symbols-outlined" style="font-size:20px;">${a.icon}</span></div>
            <div class="activity-body">
              <div class="activity-title">${a.title}</div>
              <div class="activity-meta">${a.meta}</div>
            </div>
          </div>`
              )
              .join('')}
      </div>
    </div>
    </div>

    <div id="ov-command" class="overview-tab-panel" style="display:${dCmd};"></div>
    <div id="ov-blocks" class="overview-tab-panel" style="display:${dBlk};"></div>
  `;

  let loadedCommand = false;
  let loadedBlocks = false;

  const showTab = async (t) => {
    const snap = container.querySelector('#ov-snapshot');
    const cmd = container.querySelector('#ov-command');
    const blk = container.querySelector('#ov-blocks');
    container.querySelectorAll('[data-ov-tab]').forEach((b) =>
      b.classList.toggle('active', b.getAttribute('data-ov-tab') === t)
    );
    if (snap) snap.style.display = t === 'snapshot' ? 'block' : 'none';
    if (cmd) cmd.style.display = t === 'command' ? 'block' : 'none';
    if (blk) blk.style.display = t === 'blocks' ? 'block' : 'none';
    try {
      sessionStorage.setItem('overviewPrimaryTab', t);
    } catch {
      /* ignore */
    }
    if (t === 'command' && !loadedCommand && cmd) {
      cmd.innerHTML = '<div class="pillar-loading">Loading…</div>';
      await renderDashboard(cmd);
      loadedCommand = true;
    }
    if (t === 'blocks' && !loadedBlocks && blk) {
      blk.innerHTML = '<div class="pillar-loading">Loading…</div>';
      await renderEstate(blk);
      loadedBlocks = true;
    }
  };

  container.querySelectorAll('[data-ov-tab]').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.getAttribute('data-ov-tab')));
  });

  await showTab(initialTab);
}
