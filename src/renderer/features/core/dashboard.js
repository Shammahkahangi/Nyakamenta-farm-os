// ============================================================
// dashboard.js — Executive Dashboard Module
// ============================================================
import { dataService } from '../../services/dataService.js';
import { showToast } from '../../utils/toast.js';

/** Allowed batch workflow statuses (DB `batches.status`). */
const BATCH_STATUS_OPTIONS = ['Pending', 'Processing', 'Alert', 'Complete'];

function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function batchStatusSelectHtml(b) {
  const cur = b.status || 'Pending';
  const opts = [...BATCH_STATUS_OPTIONS];
  if (cur && !opts.includes(cur)) opts.unshift(cur);
  return `<select class="form-select dash-batch-status" data-batch-id="${escAttr(b.id)}"
    aria-label="Status for batch ${escAttr(b.id)}"
    style="min-width:112px;font-size:11px;padding:4px 8px;">${opts
    .map((o) => `<option value="${escAttr(o)}"${o === cur ? ' selected' : ''}>${escHtml(o)}</option>`)
    .join('')}</select>`;
}

async function renderDashboard(container) {
  const [stats, financeSummary, insights, blocks, batches, financeItems, contracts] = await Promise.all([
    dataService.getComputedStats(),
    dataService.getFinanceSummary(),
    dataService.getComputedDashboardInsights(),
    dataService.getBlocks(),
    dataService.getBatches(),
    dataService.getFinanceItems(),
    dataService.getContracts(),
  ]);

  const recentBatches = batches.slice(0, 5);
  const batchKgByBlock = batches.reduce((acc, b) => {
    const key = b.block_id;
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + Number(b.kgOut || 0);
    return acc;
  }, {});
  const liveBlocks = blocks.map(b => ({ ...b, liveKgOut: batchKgByBlock[b.id] || 0 }));
  const totalAcres = liveBlocks.reduce((s, b) => s + (b.acres || 0), 0);
  const alertBatches = batches.filter(b => b.status === 'Alert');

  const producingYpaList = liveBlocks
    .map(b => {
      const k = b.liveKgOut || 0;
      const ac = Number(b.acres) || 0;
      return ac > 0 && k > 0 ? k / ac : null;
    })
    .filter(v => v != null);
  const seasonAvgKgPerAc = producingYpaList.length
    ? producingYpaList.reduce((s, v) => s + v, 0) / producingYpaList.length
    : 0;
  const blockAlertCount = liveBlocks.filter(b => {
    const k = b.liveKgOut || 0;
    const ac = Number(b.acres) || 0;
    const yieldBelowBench = seasonAvgKgPerAc > 0 && k > 0 && ac > 0 && (k / ac) < seasonAvgKgPerAc * 0.85;
    return b.status === 'Alert' || yieldBelowBench;
  }).length;

  const monthKey = (dateLike) => {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const monthBatchKgOut = batches.reduce((acc, b) => {
    const key = monthKey(b.date);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + Number(b.kgOut || 0);
    return acc;
  }, {});
  const currentKgOut = monthBatchKgOut[currentKey] || 0;
  const previousKgOut = monthBatchKgOut[prevKey] || 0;
  const outputDeltaPct = previousKgOut > 0
    ? (((currentKgOut - previousKgOut) / previousKgOut) * 100)
    : null;

  const monthNetByKey = financeItems.reduce((acc, item) => {
    const key = monthKey(item.date);
    if (!key) return acc;
    const sign = item.type === 'Expense' ? -1 : 1;
    acc[key] = (acc[key] || 0) + sign * Number(item.amount || 0);
    return acc;
  }, {});
  const currentNet = monthNetByKey[currentKey] || 0;
  const previousNet = monthNetByKey[prevKey] || 0;
  const netDeltaPct = previousNet !== 0
    ? (((currentNet - previousNet) / Math.abs(previousNet)) * 100)
    : null;

  const conversionTarget = 62;
  const avgConversionNum = Number(stats.avgConversion || 0);
  const conversionGap = avgConversionNum - conversionTarget;
  const conversionGapLabel = `${conversionGap >= 0 ? '+' : ''}${conversionGap.toFixed(1)}% vs target`;
  const conversionGapColor = conversionGap >= 0 ? 'var(--green-text)' : 'var(--red-text)';
  const conversionGapIcon = conversionGap >= 0 ? 'trending_up' : 'trending_down';

  const totalBatches = batches.length;
  const completedBatches = batches.filter(b => (b.status || '').toLowerCase() === 'complete').length;
  const inProcessBatches = batches.filter(b => ['processing', 'alert'].includes((b.status || '').toLowerCase())).length;
  const harvestProgressPct = totalBatches > 0 ? Math.round((completedBatches / totalBatches) * 100) : 0;
  const processingPipelinePct = totalBatches > 0 ? Math.round((inProcessBatches / totalBatches) * 100) : 0;
  const confirmedContracts = contracts.filter(c => (c.status || '').toLowerCase() === 'confirmed').length;
  const contractProgressPct = contracts.length > 0 ? Math.round((confirmedContracts / contracts.length) * 100) : 0;


  container.innerHTML = `
    <!-- ── KPI Row (4 cards in one tight strip) ────────────── -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
      <!-- Green Bean Output -->
      <div class="kpi-card">
        <div class="kpi-label">Green Bean Output</div>
        <div class="kpi-value" style="font-size:22px;">${stats.totalGreenBeanOutput.toLocaleString()} <small style="font-size:13px;font-weight:500;color:var(--text-muted);">kg</small></div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:4px;font-size:10px;color:${outputDeltaPct === null ? 'var(--text-muted)' : outputDeltaPct >= 0 ? 'var(--green-text)' : 'var(--red-text)'};font-weight:700;">
          <span class="material-symbols-outlined" style="font-size:13px;">${outputDeltaPct === null ? 'sync' : outputDeltaPct >= 0 ? 'trending_up' : 'trending_down'}</span>
          ${outputDeltaPct === null ? 'No previous month baseline' : `${outputDeltaPct >= 0 ? '+' : ''}${outputDeltaPct.toFixed(1)}% vs previous month`}
        </div>
      </div>
      <!-- Hulling Conversion -->
      <div class="kpi-card">
        <div class="kpi-label">Avg. Hulling Conversion</div>
        <div class="kpi-value" style="font-size:22px;">${stats.avgConversion}<small style="font-size:13px;font-weight:500;color:var(--text-muted);">%</small></div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:4px;font-size:10px;color:${conversionGapColor};font-weight:700;">
          <span class="material-symbols-outlined" style="font-size:13px;">${conversionGapIcon}</span>${conversionGapLabel}
        </div>
      </div>
      <!-- Net Profit -->
      <div class="kpi-card gold-border">
        <div class="kpi-label">Net Profit (Season)</div>
        <div class="kpi-value gold" style="font-size:22px;">${dataService.formatCurrency(financeSummary.netProfit || 0)}</div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:4px;font-size:10px;color:${netDeltaPct === null ? 'var(--text-muted)' : netDeltaPct >= 0 ? 'var(--green-text)' : 'var(--red-text)'};font-weight:700;">
          <span class="material-symbols-outlined" style="font-size:13px;">${netDeltaPct === null ? 'sync' : netDeltaPct >= 0 ? 'trending_up' : 'trending_down'}</span>
          ${netDeltaPct === null ? 'No previous month baseline' : `${netDeltaPct >= 0 ? '+' : ''}${netDeltaPct.toFixed(1)}% vs previous month`}
        </div>
      </div>
      <!-- Active Processing -->
      <div class="kpi-card ${alertBatches.length > 0 ? 'red-border' : ''}">
        <div class="kpi-label">Active Processing</div>
        <div class="kpi-value" style="font-size:22px;">${stats.activeBatches} <small style="font-size:13px;font-weight:500;color:var(--text-muted);">batches</small></div>
        <div style="margin-top:8px;font-size:10px;font-weight:700;color:${alertBatches.length > 0 ? 'var(--red-text)' : 'var(--text-muted)'};">
          ${alertBatches.length > 0 ? `⚠ ${alertBatches.length} Alert${alertBatches.length > 1 ? 's' : ''}` : '● All Normal'}
        </div>
      </div>
    </div>

    <!-- ── Secondary Stats Strip ─────────────────────────── -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;padding:14px 18px;display:flex;align-items:center;gap:14px;">
        <span class="material-symbols-outlined" style="font-size:22px;color:var(--text-muted);">map</span>
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);">Total Acreage</div>
          <div style="font-size:18px;font-weight:800;margin-top:2px;">${totalAcres.toFixed(1)} <small style="font-size:11px;font-weight:500;color:var(--text-muted);">ac</small></div>
        </div>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;padding:14px 18px;display:flex;align-items:center;gap:14px;">
        <span class="material-symbols-outlined" style="font-size:22px;color:var(--text-muted);">layers</span>
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);">Registered Blocks</div>
          <div style="font-size:18px;font-weight:800;margin-top:2px;">${blocks.length} <small style="font-size:11px;font-weight:500;color:var(--text-muted);">blocks</small></div>
        </div>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;padding:14px 18px;display:flex;align-items:center;gap:14px;">
        <span class="material-symbols-outlined" style="font-size:22px;color:var(--text-muted);">account_balance_wallet</span>
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);">Total Expenses</div>
          <div style="font-size:18px;font-weight:800;margin-top:2px;color:var(--red-text);">${dataService.formatCurrency(financeSummary.totalExpenses || 0)}</div>
        </div>
      </div>
    </div>

    <!-- ── Two-Column Main Content ──────────────────────── -->
    <div style="display:grid;grid-template-columns:1fr 340px;gap:14px;align-items:start;">

      <!-- LEFT: Batch throughput + Block chart -->
      <div style="display:flex;flex-direction:column;gap:14px;">

        <!-- Block Yield Chart -->
        <div class="section-card">
          <div class="card-header">
            <h2 class="card-title">Block Yield Comparison</h2>
            <div class="card-actions">
              <span style="font-size:10px;color:var(--text-muted);">${blocks.length} blocks · season total</span>
            </div>
          </div>
          <div style="padding:16px 20px 20px;">
            ${(() => {
      const maxKg = Math.max(...liveBlocks.map(b => b.liveKgOut || 0), 1);
      const totalKg = liveBlocks.reduce((s, b) => s + (b.liveKgOut || 0), 0);
      const BAR_W = 100; // % width of SVG viewport for bar track

      // Sort descending
      const sorted = [...liveBlocks].sort((a, b) => (b.liveKgOut || 0) - (a.liveKgOut || 0));

      // Colour per status
      const colorMap = {
        Active: ['#2E7D32', '#43A047'],
        Alert: ['#C62828', '#EF5350'],
        Inactive: ['#2A2F38', '#3D4450'],
      };

      return sorted.map((b, i) => {
        const kg = b.liveKgOut || 0;
        const pct = Math.round((kg / maxKg) * 100);
        const share = totalKg > 0 ? ((kg / totalKg) * 100).toFixed(1) : '0';
        const acresNum = Number(b.acres) || 0;
        const yieldPerAcre = acresNum ? Math.round(kg / acresNum) : 0;
        const yieldBelowBench = seasonAvgKgPerAc > 0 && kg > 0 && acresNum > 0 && (kg / acresNum) < seasonAvgKgPerAc * 0.85;
        const statusAlert = b.status === 'Alert';
        const showAlert = statusAlert || yieldBelowBench;
        const noOutput = kg <= 0;
        const paletteKey = noOutput ? 'Inactive' : showAlert ? 'Alert' : 'Active';
        const [c1, c2] = colorMap[paletteKey] || colorMap['Active'];
        const gradId = `g${i}`;

        return `
                <div style="margin-bottom:14px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="width:7px;height:7px;border-radius:50%;background:${c2};flex-shrink:0;"></span>
                      <span style="font-size:12px;font-weight:700;color:var(--text-primary);">${b.name}</span>
                      ${showAlert ? `<span style="font-size:9px;font-weight:700;background:rgba(198,40,40,.15);color:var(--red-text);padding:1px 6px;border-radius:10px;">ALERT</span>` : ''}
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;">
                      <span style="font-size:10px;color:var(--text-muted);">${b.acres ? b.acres + ' ac' : ''}</span>
                      <span style="font-size:10px;color:var(--text-muted);">${yieldPerAcre > 0 ? yieldPerAcre.toLocaleString() + ' kg/ac' : ''}</span>
                      <span style="font-size:11px;font-weight:800;color:var(--text-primary);min-width:52px;text-align:right;">${kg.toLocaleString()} <span style="font-weight:500;font-size:9px;color:var(--text-muted);">kg</span></span>
                      <span style="font-size:10px;font-weight:700;min-width:36px;text-align:right;color:${showAlert ? 'var(--red-text)' : 'var(--green-text)'};">${share}%</span>
                    </div>
                  </div>
                  <div style="position:relative;height:10px;background:var(--bg-overlay);border-radius:5px;overflow:hidden;">
                    <svg width="100%" height="10" style="display:block;position:absolute;top:0;left:0;">
                      <defs>
                        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stop-color="${c1}"/>
                          <stop offset="100%" stop-color="${c2}"/>
                        </linearGradient>
                      </defs>
                      <rect x="0" y="0" height="10" width="${pct}%" rx="5" fill="url(#${gradId})"
                        style="transition:width 0.8s cubic-bezier(.25,.8,.25,1);"/>
                    </svg>
                  </div>
                </div>`;
      }).join('');
    })()}

            <!-- Totals footer -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding-top:14px;border-top:1px solid var(--border-subtle);">
              <div style="display:flex;gap:20px;">
                <div>
                  <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);">Season Total</div>
                  <div style="font-size:16px;font-weight:800;margin-top:3px;">${liveBlocks.reduce((s, b) => s + (b.liveKgOut || 0), 0).toLocaleString()} kg</div>
                </div>
                <div>
                  <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);">Avg. per Block</div>
                  <div style="font-size:16px;font-weight:800;margin-top:3px;">${liveBlocks.length > 0 ? Math.round(liveBlocks.reduce((s, b) => s + (b.liveKgOut || 0), 0) / liveBlocks.length).toLocaleString() : '—'} kg</div>
                </div>
                <div>
                  <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);">Alert Blocks</div>
                  <div style="font-size:16px;font-weight:800;margin-top:3px;color:${blockAlertCount > 0 ? 'var(--red-text)' : 'var(--green-text)'};">${blockAlertCount}</div>
                </div>
              </div>
              <div style="display:flex;gap:14px;font-size:10px;color:var(--text-muted);">
                <div style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:var(--green-mid);display:inline-block;"></span>Active</div>
                <div style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:var(--red);display:inline-block;"></span>Alert</div>
                <div style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:2px;background:var(--bg-overlay);display:inline-block;"></span>Inactive</div>
              </div>
            </div>
          </div>
        </div>


        <!-- Batch Table -->
        <div class="section-card">
          <div class="card-header">
            <h2 class="card-title">Recent Batch Throughput</h2>
            <span style="font-size:10px;color:var(--text-muted);">${batches.length} total</span>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Batch ID</th><th>Block</th><th>Stage</th><th>Moisture</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${recentBatches.length === 0
      ? `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No batches. Go to Processing to log intake.</td></tr>`
      : recentBatches.map(b => `
                <tr>
                  <td class="mono" style="font-size:11px;">${b.id}</td>
                  <td class="strong">${b.blockName || b.block_id}</td>
                  <td style="color:var(--text-secondary);">${b.stage}</td>
                  <td class="tabular-nums">${b.moisture ? b.moisture + '%' : '—'}</td>
                  <td>${batchStatusSelectHtml(b)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <p style="margin:10px 16px 14px;font-size:10px;color:var(--text-muted);line-height:1.4;">
            To update a batch: use the <strong>Status</strong> dropdown in each row. Changes save to the database and refresh this dashboard.
          </p>
        </div>
      </div>

      <!-- RIGHT: AI Panel + Season Progress -->
      <div style="display:flex;flex-direction:column;gap:14px;">

        <!-- AI Insights Panel -->
        <div class="section-card" style="border-color:rgba(184,150,12,0.25);background:var(--bg-raised);">
          <div class="card-header" style="background:rgba(184,150,12,0.05);">
            <h2 class="card-title" style="display:flex;align-items:center;gap:6px;color:var(--gold-text);">
              <span class="material-symbols-outlined" style="font-size:15px;">auto_awesome</span>
              AI Insight Summary
            </h2>
          </div>
          <!-- Health Score -->
          <div style="display:flex;align-items:center;gap:14px;padding:16px 18px;border-bottom:1px solid var(--border-subtle);">
            <svg viewBox="0 0 36 36" style="width:60px;height:60px;flex-shrink:0;">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--bg-overlay)" stroke-width="3"/>
              <path stroke-dasharray="${stats.seasonHealthScore}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--gold)" stroke-width="3" stroke-linecap="round"/>
              <text x="18" y="21" text-anchor="middle" style="fill:var(--text-primary);font-size:8px;font-weight:800;">${stats.seasonHealthScore}</text>
            </svg>
            <div>
              <div style="font-size:12px;font-weight:700;">Season Health Score</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:3px;">Based on yield, conversion & finance KPIs</div>
            </div>
          </div>
          <!-- Insight list -->
          <div style="padding:0 18px;">
            ${insights.slice(0, 5).map((ins, i) => {
        const severityColor = { Critical: 'var(--red-text)', Warning: 'var(--amber-text)', Opportunity: 'var(--green-text)' };
        const normInsightSev = (s) => {
          const x = String(s || '').toLowerCase();
          if (x === 'critical' || x === 'high') return 'Critical';
          if (x === 'warning' || x === 'medium') return 'Warning';
          return 'Opportunity';
        };
        const dot = severityColor[normInsightSev(ins.severity)] || 'var(--text-muted)';
        return `
                <div style="padding:10px 0;border-bottom:${i < Math.min(insights.length, 5) - 1 ? '1px solid var(--border-subtle)' : 'none'};">
                  <div style="display:flex;align-items:flex-start;gap:8px;">
                    <span style="width:5px;height:5px;border-radius:50%;background:${dot};margin-top:5px;flex-shrink:0;"></span>
                    <div>
                      <div style="font-size:11px;font-weight:700;color:var(--text-primary);">${ins.title}</div>
                      <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${ins.metric}</div>
                    </div>
                  </div>
                </div>`;
      }).join('')}
          </div>
          <div style="padding:12px 18px;">
            <button class="btn btn-primary" style="width:100%;justify-content:center;" id="view-all-insights">
              <span class="material-symbols-outlined" style="font-size:14px;">auto_awesome</span> Launch Analysis Engine
            </button>
          </div>
        </div>

        <!-- Season Progress -->
        <div class="section-card">
          <div class="card-header"><h2 class="card-title">Season Progress</h2></div>
          <div style="padding:14px 18px;display:flex;flex-direction:column;gap:12px;">
            ${[
      { label: 'Harvest Completion', pct: harvestProgressPct, color: 'var(--green-mid)' },
      { label: 'Processing Pipeline', pct: processingPipelinePct, color: 'var(--gold)' },
      { label: 'Dispatches confirmed', pct: contractProgressPct, color: 'var(--green-bright)' },
    ].map(p => `
              <div>
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px;">
                  <span style="color:var(--text-secondary);">${p.label}</span>
                  <span style="font-weight:700;">${p.pct}%</span>
                </div>
                <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
                  <div style="width:${p.pct}%;height:100%;background:${p.color};border-radius:3px;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Quick Links -->
        <div class="section-card">
          <div class="card-header"><h2 class="card-title">Quick Actions</h2></div>
          <div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;">
            ${[
      { page: 'harvest-processing', icon: 'add_circle', label: 'Log Cherry Intake' },
      { page: 'sales-finance', farmTab: 'finance', icon: 'receipt_long', label: 'Add Transaction' },
      { page: 'sales-finance', farmTab: 'sales', icon: 'description', label: 'Domestic dispatch' },
    ].map(a => `
              <button class="btn btn-ghost" data-nav="${a.page}" ${a.farmTab ? `data-farm-tab="${a.farmTab}"` : ''} ${a.intelTab ? `data-intel-tab="${a.intelTab}"` : ''} style="justify-content:flex-start;gap:10px;width:100%;text-align:left;">
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-muted);">${a.icon}</span>
                ${a.label}
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Quick nav buttons
  container.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.farmTab;
      if (tab) {
        try {
          sessionStorage.setItem('salesFinancePreferredTab', tab);
        } catch {
          /* ignore */
        }
      }
      const intelTab = btn.dataset.intelTab;
      if (intelTab) {
        try {
          sessionStorage.setItem('farmIntelTab', intelTab);
        } catch {
          /* ignore */
        }
      }
      const navItem = document.querySelector(`.nav-item[data-page="${btn.dataset.nav}"]`);
      if (navItem) navItem.click();
    });
  });

  // AI engine button
  container.querySelector('#view-all-insights')?.addEventListener('click', () => {
    const navItem = document.querySelector(`.nav-item[data-page="aiinsights"]`);
    if (navItem) navItem.click();
  });

  container.querySelectorAll('select.dash-batch-status').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const el = e.target;
      const id = el.dataset.batchId;
      const status = el.value;
      const prev = el.getAttribute('data-prev-status');
      try {
        await dataService.updateBatch(id, { status });
        showToast(`Batch ${id} → ${status}.`);
        await renderDashboard(container);
      } catch (err) {
        showToast(`Could not update batch: ${err?.message || err}`);
        if (prev != null) el.value = prev;
        else await renderDashboard(container);
      }
    });
    sel.setAttribute('data-prev-status', sel.value);
  });
}

export { renderDashboard };
