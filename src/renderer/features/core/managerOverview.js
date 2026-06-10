// ============================================================
// managerOverview.js — Operations dashboard (no finance / SACCO / payroll)
// ============================================================
import { dataService } from '../../services/dataService.js';

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

function batchActivityFeed(batches, limit = 14) {
  const rows = [];
  for (const b of batches) {
    const t = Date.parse(b.date || '');
    rows.push({
      ts: Number.isNaN(t) ? 0 : t,
      meta: b.date || '',
      title: `Batch ${b.id || ''}: ${Number(b.kgOut || 0).toLocaleString()} kg processed`,
    });
  }
  rows.sort((a, b) => b.ts - a.ts);
  return rows.slice(0, limit);
}

export async function renderManagerOverview(container) {
  const [stats, batches, wf, blocks] = await Promise.all([
    dataService.getComputedStats(),
    dataService.getBatches(),
    dataService.getWorkforce(),
    dataService.getBlocks(),
  ]);

  const farmYieldKg = Number(stats?.totalGreenBeanOutput || 0);
  const totalPlants = Number(stats?.totalPlants || 0);
  const plantCap = Number(stats?.farmPlantCapacity || 27000);
  const workers = wf.departments || [];
  const workerHeadcount = workers.length || Number(wf.totalWorkers || 0);

  const harvestSeries = buildSeries(batches, (b) => b.date, (b) => b.kgOut, 6);
  const harSvg = svgLineSeries(harvestSeries, 280, 88);
  const feed = batchActivityFeed(batches, 14);

  container.innerHTML = `
    <div class="page-header" style="margin-bottom:8px;">
      <h1 class="page-title">Manager dashboard</h1>
      <p class="page-subtitle">Field and processing snapshot — revenue, expenses, SACCO, and payroll are visible only to owners in the full Overview and Finance modules.</p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px;margin-bottom:16px;">
      <div class="kpi-card">
        <div class="kpi-label">Season yield</div>
        <div class="kpi-value">${farmYieldKg.toLocaleString()} <small style="font-size:12px;font-weight:500;color:var(--text-muted);">kg green</small></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Coffee plants</div>
        <div class="kpi-value">${totalPlants.toLocaleString()}</div>
        <div class="kpi-delta" style="margin-top:6px;font-size:9px;color:var(--text-muted);">Capacity ${plantCap.toLocaleString()}</div>
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
        <div class="kpi-label">Processing batches</div>
        <div class="kpi-value">${batches.length}</div>
      </div>
      <div class="kpi-card gold-border">
        <div class="kpi-label">Health score</div>
        <div class="kpi-value gold">${Number(stats?.seasonHealthScore || 0).toFixed(1)}</div>
      </div>
    </div>

    <div class="section-card" style="margin-bottom:16px;">
      <div class="card-header" style="padding-bottom:0;">
        <h2 class="card-title">Harvest output (6 months)</h2>
        <span style="font-size:10px;color:var(--text-muted);">Kg out — operational trend only</span>
      </div>
      <div style="padding:12px 16px 16px;">
        <svg class="simple-line-chart" viewBox="0 0 280 88" preserveAspectRatio="none" style="width:100%;max-width:560px;height:88px;">
          <polyline points="${harSvg.points}" style="stroke:var(--gold-bright);" />
        </svg>
        <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:8px;color:var(--text-muted);text-transform:uppercase;max-width:560px;">
          ${harvestSeries.map((s) => `<span>${s.key.slice(5)}</span>`).join('')}
        </div>
      </div>
    </div>

    <div class="section-card" style="margin-bottom:20px;">
      <div class="card-header">
        <h2 class="card-title">Recent processing</h2>
        <span style="font-size:10px;color:var(--text-muted);">Latest batches</span>
      </div>
      <div class="activity-feed" style="border:none;border-radius:0;padding:0 16px 16px;">
        ${
          feed.length === 0
            ? '<p style="color:var(--text-muted);font-size:12px;padding:12px 0;">No batches yet.</p>'
            : feed
                .map(
                  (a) => `
          <div class="activity-item">
            <div class="activity-icon"><span class="material-symbols-outlined" style="font-size:20px;">grain</span></div>
            <div class="activity-body">
              <div class="activity-title">${a.title}</div>
              <div class="activity-meta">${a.meta}</div>
            </div>
          </div>`
                )
                .join('')
        }
      </div>
    </div>
  `;
}
