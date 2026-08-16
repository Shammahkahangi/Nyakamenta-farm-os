// ============================================================
// farmIntelligence.js — Gateway-style Farm Intelligence hub
// ============================================================
import { dataService } from '../../services/dataService.js';
import { renderReports, downloadCSV, blockTableRows } from './reports.js';

const TABS = [
  { id: 'production', label: 'Production', icon: 'agriculture' },
  { id: 'field', label: 'Field & inputs', icon: 'eco' },
  { id: 'finance', label: 'Farm finance', icon: 'account_balance' },
  { id: 'season', label: 'Season & exports', icon: 'description' },
];

function monthKey(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

function buildSeries(rows, getDate, getValue, months = 12) {
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
  return keys.map((k) => ({ label: k, value: map[k] || 0 }));
}

/** Destroy any Chart.js instances bound to canvases under root */
function destroyChartsIn(root) {
  if (!root || !window.Chart) return;
  const C = window.Chart;
  root.querySelectorAll('canvas').forEach((canvas) => {
    const ch = C.getChart?.(canvas);
    if (ch) ch.destroy();
  });
}

async function ensureChartJs() {
  if (window.Chart && window.__farmChartRegistered) return window.Chart;
  const href = new URL('../../../../node_modules/chart.js/auto/auto.js', import.meta.url).href;
  const mod = await import(href);
  const C = mod.default;
  if (!C) throw new Error('Chart.js failed to load.');
  window.Chart = C;
  window.__farmChartRegistered = true;
  return C;
}

async function exportFarmXlsx(payload) {
  const XLSX = await import('../../../../node_modules/xlsx/xlsx.mjs');
  const { blocks = [], batches = [], financeItems = [], contracts = [] } = payload;

  // Fetch requisitions for comprehensive report
  const requisitions = (await dataService.getRequisitions().catch(() => [])) || [];

  const wb = XLSX.utils.book_new();

  // 1. Executive Summary Sheet
  const totalRev = financeItems.filter(i => i.type === 'Revenue').reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const totalExp = financeItems.filter(i => i.type === 'Expense').reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const totalAcres = blocks.reduce((a, b) => a + (Number(b.acres) || 0), 0);
  const totalPlants = blocks.reduce((a, b) => a + (Number(b.plant_count) || 0), 0);
  const totalReqsAmt = requisitions.reduce((a, b) => a + (Number(b.total_amount) || 0), 0);

  const execRows = [
    { Metric: 'Total Estate Acreage', Value: `${totalAcres} Acres` },
    { Metric: 'Total Coffee Trees / Plants', Value: `${totalPlants.toLocaleString()} Plants` },
    { Metric: 'Total Revenue (Gross)', Value: `UGX ${totalRev.toLocaleString()}` },
    { Metric: 'Total Expenses (Gross)', Value: `UGX ${totalExp.toLocaleString()}` },
    { Metric: 'Net Financial Position', Value: `UGX ${(totalRev - totalExp).toLocaleString()}` },
    { Metric: 'Total Approved Requisitions', Value: `UGX ${totalReqsAmt.toLocaleString()} (${requisitions.length} Requisitions)` },
    { Metric: 'Total Field Blocks Count', Value: `${blocks.length} Blocks` },
    { Metric: 'Total Processing Batches', Value: `${batches.length} Batches` },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(execRows), 'Executive_Summary');

  // 2. Field Operations & Blocks Sheet
  const blockRows = blocks.map((b) => ({
    'Block Name': b.name || `Block #${b.id}`,
    'Acres': Number(b.acres) || 0,
    'Plant Count': Number(b.plant_count) || 0,
    'Density (Plants/Acre)': b.acres > 0 ? Math.round(b.plant_count / b.acres) : 0,
    'Total Processed (Kg)': Number(b.kgProcessed) || 0,
    'Status': b.status || 'Active',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(blockRows.length ? blockRows : [{ Note: 'No blocks recorded' }]), 'Field_Operations');

  // 3. Approved Requisitions Sheet
  const reqRows = [];
  requisitions.forEach(r => {
    if (r.items && r.items.length) {
      r.items.forEach(it => {
        reqRows.push({
          'Req Date': r.date,
          'Requisition Title': r.title,
          'Item Description': it.item,
          'Qty': it.qty || '',
          'Unit Cost (UGX)': Number(it.unit_cost) || 0,
          'Total Item Cost (UGX)': Number(it.amount) || 0,
          'Status': r.status || 'Approved'
        });
      });
    } else {
      reqRows.push({
        'Req Date': r.date,
        'Requisition Title': r.title,
        'Item Description': 'Total Requisition',
        'Qty': '',
        'Unit Cost (UGX)': 0,
        'Total Item Cost (UGX)': Number(r.total_amount) || 0,
        'Status': r.status || 'Approved'
      });
    }
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reqRows.length ? reqRows : [{ Note: 'No requisitions' }]), 'Requisitions');

  // 4. Comprehensive Farm Ledger Sheet
  const finRows = financeItems.map((i) => ({
    'Date': i.date,
    'Cost Center': i.cost_center || 'farm',
    'Category': i.category,
    'Description': i.description,
    'Type': i.type,
    'Amount (UGX)': Number(i.amount) || 0,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(finRows.length ? finRows : [{ Note: 'No ledger entries' }]), 'Farm_Ledger');

  // 5. Processing & Batches Sheet
  const batchRows = batches.map((b) => ({
    'Batch ID': b.id,
    'Block': b.blockName || b.block_id,
    'Stage': b.stage,
    'Cherry In (Kg)': Number(b.kgIn) || 0,
    'Green Coffee Out (Kg)': Number(b.kgOut) || 0,
    'Conversion Ratio': b.conversion || 0,
    'Status': b.status,
    'Batch Date': b.date,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(batchRows.length ? batchRows : [{ Note: 'No batches' }]), 'Processing_&_Batches');

  // 6. Coffee Sales & Dispatch Sheet
  const contractRows = contracts.map((c) => ({
    'Dispatch ID': c.id,
    'Buyer / Receiver': c.buyer,
    'Net Kg': Number(c.netKg) || 0,
    'Total Value (UGX)': Number(c.totalValue) || 0,
    'Dispatch Date': c.etd || c.date || '',
    'Status': c.status,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contractRows.length ? contractRows : [{ Note: 'No dispatches' }]), 'Coffee_Sales');

  const fileName = `Comprehensive_Farm_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  if (typeof XLSX.writeFileXLSX === 'function') {
    XLSX.writeFileXLSX(wb, fileName);
  } else {
    XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
  }
}

function renderProductionPanel(ctx) {
  const { blocks, batches, totalAc, totalCherryIn, totalGreenOut, totalKgProcessed } = ctx;
  const kgPerAcre = totalAc > 0 ? (totalKgProcessed / totalAc).toFixed(1) : '—';
  const byStage = {};
  for (const b of batches) {
    const s = b.stage || '—';
    byStage[s] = (byStage[s] || 0) + 1;
  }
  const stageRows = Object.entries(byStage)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([stage, n]) => `
      <div class="reports-mt-row"><span>${stage}</span><span class="reports-mt-val">${n}</span></div>`
    )
    .join('');

  return `
    <div class="reports-mt-grid-3" style="margin-bottom:20px;">
      <div class="reports-mt-card">
        <div class="reports-mt-card-h"><h3>Footprint</h3><p>Registered blocks</p></div>
        <div class="reports-mt-card-b">
          <div class="reports-mt-row"><span>Blocks</span><span class="reports-mt-val">${blocks.length}</span></div>
          <div class="reports-mt-row"><span>Total acres</span><span class="reports-mt-val">${totalAc.toFixed(1)}</span></div>
          <div class="reports-mt-row"><span>Yield kg / ac</span><span class="reports-mt-val gold">${kgPerAcre}</span></div>
        </div>
      </div>
      <div class="reports-mt-card">
        <div class="reports-mt-card-h"><h3>Throughput</h3><p>Cherry &amp; green</p></div>
        <div class="reports-mt-card-b">
          <div class="reports-mt-row"><span>Cherry intake</span><span class="reports-mt-val gold">${totalCherryIn.toLocaleString()} kg</span></div>
          <div class="reports-mt-row"><span>Green out</span><span class="reports-mt-val gold">${totalGreenOut.toLocaleString()} kg</span></div>
          <div class="reports-mt-row"><span>Batches</span><span class="reports-mt-val">${batches.length}</span></div>
        </div>
      </div>
      <div class="reports-mt-card">
        <div class="reports-mt-card-h"><h3>Processing mix</h3><p>Batches by stage</p></div>
        <div class="reports-mt-card-b">${stageRows || '<div class="reports-mt-row"><span>No batches</span></div>'}</div>
      </div>
    </div>

    <div class="fi-chart-grid" style="display:grid;gap:16px;margin-bottom:20px;">
      <div class="section-card" style="padding:16px;">
        <div class="card-header" style="padding-bottom:8px;"><h2 class="card-title">Kg processed by block</h2></div>
        <div style="height:260px;position:relative;"><canvas id="fi-chart-blocks"></canvas></div>
      </div>
      <div class="section-card" style="padding:16px;">
        <div class="card-header" style="padding-bottom:8px;"><h2 class="card-title">Monthly green out (kg)</h2></div>
        <div style="height:260px;position:relative;"><canvas id="fi-chart-monthly"></canvas></div>
      </div>
    </div>

    <div class="section-card reports-mt-table-card">
      <div class="card-header">
        <h2 class="card-title">Block performance</h2>
        <button type="button" class="btn btn-ghost btn-sm" id="fi-export-blocks-csv">
          <span class="material-symbols-outlined" style="font-size:13px;">download</span> CSV
        </button>
      </div>
      <div style="overflow-x:auto;padding:0 16px 16px;">
        <table class="data-table">
          <thead><tr>
            <th>Block</th><th>Acres</th><th>Plants</th>
            <th>Season yield</th><th>Kg/Acre</th><th>Status</th>
          </tr></thead>
          <tbody>${blockTableRows(blocks)}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function bindProductionCharts(blocks, batches) {
  await ensureChartJs();
  const Chart = window.Chart;
  const sorted = [...blocks].sort((a, b) => (b.kgProcessed || 0) - (a.kgProcessed || 0)).slice(0, 12);
  const el1 = document.getElementById('fi-chart-blocks');
  if (el1) {
    new Chart(el1, {
      type: 'bar',
      data: {
        labels: sorted.map((b) => (b.name || '').slice(0, 14)),
        datasets: [
          {
            label: 'Kg processed',
            data: sorted.map((b) => Number(b.kgProcessed || 0)),
            backgroundColor: 'hsla(221, 78%, 53%, 0.7)',
            borderColor: 'hsl(221, 78%, 53%)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: 'hsl(215, 16%, 72%)' } },
          x: { ticks: { color: 'hsl(215, 16%, 72%)', maxRotation: 45 } },
        },
      },
    });
  }

  const series = buildSeries(batches, (b) => b.date, (b) => b.kgOut || 0, 12);
  const el2 = document.getElementById('fi-chart-monthly');
  if (el2) {
    new Chart(el2, {
      type: 'line',
      data: {
        labels: series.map((s) => s.label),
        datasets: [
          {
            label: 'Green out kg',
            data: series.map((s) => s.value),
            borderColor: 'hsl(43, 96%, 56%)',
            backgroundColor: 'hsla(43, 96%, 56%, 0.15)',
            fill: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: 'hsl(215, 16%, 72%)' } },
          x: { ticks: { color: 'hsl(215, 16%, 72%)' } },
        },
      },
    });
  }
}

function renderFieldPanel(ctx) {
  const { wf, ipm, irrigation, soil, shade, stumping, salaryExpense, totalGreenOut } = ctx;
  const depts = wf.departments || [];
  return `
    <div class="reports-mt-grid-3" style="margin-bottom:20px;">
      <div class="reports-mt-card">
        <div class="reports-mt-card-h"><h3>Workforce</h3><p>Roster &amp; payroll signal</p></div>
        <div class="reports-mt-card-b">
          <div class="reports-mt-row"><span>Dept records</span><span class="reports-mt-val">${depts.length}</span></div>
          <div class="reports-mt-row"><span>Est. headcount (model)</span><span class="reports-mt-val">${wf.totalWorkers ?? '—'}</span></div>
          <div class="reports-mt-row"><span>Payroll MTD (model)</span><span class="reports-mt-val gold">${dataService.formatCurrency(wf.payrollMtd || 0)}</span></div>
          <div class="reports-mt-row"><span>Salary-like expenses (ledger)</span><span class="reports-mt-val">${dataService.formatCurrency(salaryExpense)}</span></div>
        </div>
      </div>
      <div class="reports-mt-card">
        <div class="reports-mt-card-h"><h3>Crop health (IPM)</h3><p>Scouting records</p></div>
        <div class="reports-mt-card-b">
          <div class="reports-mt-row"><span>Total scouts</span><span class="reports-mt-val">${ipm.length}</span></div>
          <div class="reports-mt-row"><span>High severity (≥7)</span><span class="reports-mt-val red">${ipm.filter((r) => Number(r.severity_rating) >= 7).length}</span></div>
        </div>
      </div>
      <div class="reports-mt-card">
        <div class="reports-mt-card-h"><h3>Field programs</h3><p>Logged activities</p></div>
        <div class="reports-mt-card-b">
          <div class="reports-mt-row"><span>Irrigation logs</span><span class="reports-mt-val">${irrigation.length}</span></div>
          <div class="reports-mt-row"><span>Soil records</span><span class="reports-mt-val">${soil.length}</span></div>
          <div class="reports-mt-row"><span>Shade / trees</span><span class="reports-mt-val">${shade.length}</span></div>
          <div class="reports-mt-row"><span>Stumping cycles</span><span class="reports-mt-val">${stumping.length}</span></div>
        </div>
      </div>
    </div>
    <div class="section-card" style="padding:16px;">
      <div class="card-header"><h2 class="card-title">Field activity volume</h2></div>
      <p style="font-size:12px;color:var(--text-muted);padding:0 16px 12px;">
        Logged records — IPM scouts, irrigation, soil, shade, stumping.
      </p>
      <div style="height:240px;position:relative;padding:0 16px 16px;"><canvas id="fi-chart-field-activity"></canvas></div>
      <p style="font-size:11px;color:var(--text-muted);padding:0 16px 16px;">
        Salary-like ledger (category contains &quot;salary&quot;): <strong>${dataService.formatCurrency(salaryExpense)}</strong>
        · Green out total: <strong>${totalGreenOut.toLocaleString()} kg</strong>
        ${totalGreenOut > 0 ? ` · ~UGX ${Math.round(salaryExpense / totalGreenOut).toLocaleString()}/kg salary proxy` : ''}
      </p>
    </div>
  `;
}

async function bindFieldActivityChart(ipm, irrigation, soil, shade, stumping) {
  await ensureChartJs();
  const Chart = window.Chart;
  const el = document.getElementById('fi-chart-field-activity');
  if (!el) return;
  const counts = [ipm.length, irrigation.length, soil.length, shade.length, stumping.length];
  new Chart(el, {
    type: 'bar',
    data: {
      labels: ['IPM scouts', 'Irrigation', 'Soil', 'Shade / trees', 'Stumping'],
      datasets: [
        {
          label: 'Records',
          data: counts,
          backgroundColor: [
            'hsla(142, 71%, 45%, 0.75)',
            'hsla(221, 78%, 53%, 0.75)',
            'hsla(43, 96%, 56%, 0.75)',
            'hsla(221, 83%, 42%, 0.55)',
            'hsla(0, 84%, 58%, 0.55)',
          ],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, color: 'hsl(215, 16%, 72%)' } },
        x: { ticks: { color: 'hsl(215, 16%, 72%)' } },
      },
    },
  });
}

function renderFinancePanel(ctx) {
  const { totalRevenue, totalExpenses, profit, financeItems, byCategory } = ctx;
  return `
    <div class="reports-mt-grid-3" style="margin-bottom:20px;">
      <div class="reports-mt-card">
        <div class="reports-mt-card-h"><h3>Revenue</h3><p>Farm ledger</p></div>
        <div class="reports-mt-card-b">
          <div class="reports-mt-row"><span>Total</span><span class="reports-mt-val green">${dataService.formatCurrency(totalRevenue)}</span></div>
        </div>
      </div>
      <div class="reports-mt-card">
        <div class="reports-mt-card-h"><h3>Expenses</h3><p>Farm ledger</p></div>
        <div class="reports-mt-card-b">
          <div class="reports-mt-row"><span>Total</span><span class="reports-mt-val red">${dataService.formatCurrency(totalExpenses)}</span></div>
        </div>
      </div>
      <div class="reports-mt-card">
        <div class="reports-mt-card-h"><h3>Net</h3><p>Revenue − expenses</p></div>
        <div class="reports-mt-card-b">
          <div class="reports-mt-row"><span>Net</span><span class="reports-mt-val ${profit >= 0 ? 'gold' : 'red'}">${dataService.formatCurrency(Math.abs(profit))}</span></div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="section-card" style="padding:16px;">
        <div class="card-header"><h2 class="card-title">Revenue vs expense (12 mo)</h2></div>
        <div style="height:260px;"><canvas id="fi-chart-fin-composed"></canvas></div>
      </div>
      <div class="section-card" style="padding:16px;">
        <div class="card-header"><h2 class="card-title">Top categories (abs amount)</h2></div>
        <div style="height:260px;"><canvas id="fi-chart-categories"></canvas></div>
      </div>
    </div>
    <div class="section-card">
      <div class="card-header flex-between">
        <h2 class="card-title">Category breakdown</h2>
        <button type="button" class="btn btn-ghost btn-sm" id="fi-export-finance-csv"><span class="material-symbols-outlined" style="font-size:13px;">download</span> Ledger CSV</button>
      </div>
      <div style="overflow-x:auto;padding:0 16px 16px;">
        <table class="data-table">
          <thead><tr><th>Category</th><th>Type</th><th>Total</th><th>Lines</th></tr></thead>
          <tbody>
            ${byCategory
              .slice(0, 40)
              .map(
                (r) => `
              <tr>
                <td>${r.category || '—'}</td>
                <td>${r.type || '—'}</td>
                <td class="tabular-nums">${dataService.formatCurrency(Number(r.total || 0))}</td>
                <td>${r.count}</td>
              </tr>`
              )
              .join('') || '<tr><td colspan="4" style="text-align:center;padding:24px;">No categories</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function bindFinanceCharts(financeItems, byCategory) {
  await ensureChartJs();
  const Chart = window.Chart;
  const rev = buildSeries(
    financeItems.filter((i) => i.type === 'Revenue'),
    (r) => r.date,
    (r) => r.amount,
    12
  );
  const exp = buildSeries(
    financeItems.filter((i) => i.type === 'Expense'),
    (r) => r.date,
    (r) => r.amount,
    12
  );
  const labels = rev.map((r) => r.label);
  const el1 = document.getElementById('fi-chart-fin-composed');
  if (el1) {
    new Chart(el1, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Revenue', data: rev.map((r) => r.value), backgroundColor: 'hsla(142, 71%, 45%, 0.65)' },
          { label: 'Expense', data: exp.map((r) => r.value), backgroundColor: 'hsla(0, 84%, 58%, 0.55)' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, stacked: false, ticks: { color: 'hsl(215, 16%, 72%)' } },
          x: { ticks: { color: 'hsl(215, 16%, 72%)', maxRotation: 45 } },
        },
        plugins: { legend: { labels: { color: 'hsl(215, 16%, 72%)' } } },
      },
    });
  }

  const topCat = [...byCategory]
    .sort((a, b) => Math.abs(Number(b.total)) - Math.abs(Number(a.total)))
    .slice(0, 8);
  const el2 = document.getElementById('fi-chart-categories');
  if (el2 && topCat.length) {
    new Chart(el2, {
      type: 'bar',
      data: {
        labels: topCat.map((r) => String(r.category || '—').slice(0, 18)),
        datasets: [
          {
            label: 'UGX',
            data: topCat.map((r) => Number(r.total || 0)),
            backgroundColor: topCat.map((r) =>
              r.type === 'Revenue' ? 'hsla(142, 71%, 45%, 0.7)' : 'hsla(0, 84%, 58%, 0.65)'
            ),
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: 'hsl(215, 16%, 72%)' } },
          y: { ticks: { color: 'hsl(215, 16%, 72%)' } },
        },
      },
    });
  }
}

export async function renderFarmIntelligence(container) {
  let activeTab = sessionStorage.getItem('farmIntelTab') || 'production';
  if (!TABS.some((t) => t.id === activeTab)) activeTab = 'production';

  const shell = document.createElement('div');
  shell.className = 'reports-mt-shell';
  shell.innerHTML = `
    <div class="reports-mt-main">
      <div class="reports-mt-header">
        <div>
          <h1 class="page-title">Farm Intelligence</h1>
          <p class="page-subtitle">Production, field inputs, and farm finance — Growth Gateway–style analytics.</p>
        </div>
        <div class="reports-mt-actions" style="display:flex;flex-wrap:wrap;gap:8px;">
          <button type="button" class="reports-mt-btn-outline reports-mt-accent-gold" id="fi-export-xlsx">
            <span class="material-symbols-outlined" style="font-size:18px;">table_view</span> Export Excel
          </button>
        </div>
      </div>

      <div class="pillar-tab-bar reports-mt-tabstrip" id="fi-main-tabs">
        ${TABS.map(
          (t) => `
          <button type="button" class="pillar-tab ${t.id === activeTab ? 'active' : ''}" data-fi-tab="${t.id}">
            <span class="material-symbols-outlined">${t.icon}</span> ${t.label}
          </button>`
        ).join('')}
      </div>
      <div id="fi-tab-body"></div>
    </div>
  `;

  container.innerHTML = '';
  container.appendChild(shell);
  const body = shell.querySelector('#fi-tab-body');

  const loadPayload = async () => {
    const [
      blocks,
      batches,
      financeItems,
      contracts,
      wf,
      ipm,
      irrigation,
      soil,
      shade,
      stumping,
      byCategory,
    ] = await Promise.all([
      dataService.getBlocks(),
      dataService.getBatches(),
      dataService.getFinanceItems(),
      dataService.getContracts(),
      dataService.getWorkforce(),
      dataService.getIpmRecords().catch(() => []),
      dataService.getIrrigationLogs().catch(() => []),
      dataService.getSoilRecords().catch(() => []),
      dataService.getShadeTrees().catch(() => []),
      dataService.getStumpingCycles().catch(() => []),
      dataService.getFinanceByCategory(),
    ]);

    const totalAc = blocks.reduce((s, b) => s + Number(b.acres || 0), 0);
    const totalCherryIn = batches.reduce((s, b) => s + Number(b.kgIn || 0), 0);
    const totalGreenOut = batches.reduce((s, b) => s + Number(b.kgOut || 0), 0);
    const totalKgProcessed = blocks.reduce((s, b) => s + Number(b.kgProcessed || 0), 0);
    const totalRevenue = financeItems.filter((i) => i.type === 'Revenue').reduce((s, i) => s + Number(i.amount), 0);
    const totalExpenses = financeItems.filter((i) => i.type === 'Expense').reduce((s, i) => s + Number(i.amount), 0);
    const profit = totalRevenue - totalExpenses;
    const salaryExpense = financeItems
      .filter((i) => i.type === 'Expense' && String(i.category || '').toLowerCase().includes('salary'))
      .reduce((s, i) => s + Number(i.amount), 0);

    return {
      blocks,
      batches,
      financeItems,
      contracts,
      wf,
      ipm,
      irrigation,
      soil,
      shade,
      stumping,
      byCategory,
      totalAc,
      totalCherryIn,
      totalGreenOut,
      totalKgProcessed,
      totalRevenue,
      totalExpenses,
      profit,
      salaryExpense,
    };
  };

  const renderTab = async (tab) => {
    activeTab = tab;
    try {
      sessionStorage.setItem('farmIntelTab', tab);
    } catch {
      /* ignore */
    }
    shell.querySelectorAll('[data-fi-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.fiTab === tab);
    });

    destroyChartsIn(body);
    body.innerHTML = '<div class="pillar-loading">Loading…</div>';

    const p = await loadPayload();

    if (tab === 'production') {
      body.innerHTML = renderProductionPanel(p);
      body.querySelector('#fi-export-blocks-csv')?.addEventListener('click', () => {
        downloadCSV('farm_blocks.csv', p.blocks);
      });
      await bindProductionCharts(p.blocks, p.batches);
    } else if (tab === 'field') {
      body.innerHTML = renderFieldPanel(p);
      await bindFieldActivityChart(p.ipm, p.irrigation, p.soil, p.shade, p.stumping);
    } else if (tab === 'finance') {
      body.innerHTML = renderFinancePanel(p);
      body.querySelector('#fi-export-finance-csv')?.addEventListener('click', () => {
        downloadCSV('farm_ledger.csv', p.financeItems);
      });
      await bindFinanceCharts(p.financeItems, p.byCategory);
    } else if (tab === 'season') {
      body.innerHTML = '';
      const inner = document.createElement('div');
      body.appendChild(inner);
      await renderReports(inner);
    }
  };

  shell.querySelectorAll('[data-fi-tab]').forEach((btn) => {
    btn.addEventListener('click', () => renderTab(btn.dataset.fiTab));
  });

  shell.querySelector('#fi-export-xlsx')?.addEventListener('click', async () => {
    const pl = await loadPayload();
    await exportFarmXlsx({
      blocks: pl.blocks,
      batches: pl.batches,
      financeItems: pl.financeItems,
      contracts: pl.contracts,
    });
  });

  await renderTab(activeTab);
}
