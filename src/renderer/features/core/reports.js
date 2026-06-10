// ============================================================
// reports.js — Season Reports & Data Export Module (m-t–style layout)
// ============================================================
import { dataService } from '../../services/dataService.js';

const FARM_PLANT_CAPACITY = 27000;

// ── CSV download helper ───────────────────────────────────────
export function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]).join(',');
  const body = rows
    .map((r) => Object.values(r).map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([headers + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Full HTML report download ─────────────────────────────────
function fmtUgx(n) {
  return 'UGX ' + Math.round(Number(n) || 0).toLocaleString();
}

function downloadHTMLReport({ blocks, batches, financeItems, contracts, workforce, meta }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const totalKg = blocks.reduce((s, b) => s + (b.kgProcessed || 0), 0);
  const totalAc = blocks.reduce((s, b) => s + (b.acres || 0), 0);
  const revenue = financeItems.filter((i) => i.type === 'Revenue').reduce((s, i) => s + Number(i.amount), 0);
  const expense = financeItems.filter((i) => i.type === 'Expense').reduce((s, i) => s + Number(i.amount), 0);
  const profit = revenue - expense;
  const cherryIn = batches.reduce((s, b) => s + Number(b.kgIn || 0), 0);
  const greenOut = batches.reduce((s, b) => s + Number(b.kgOut || 0), 0);
  const exportVal = contracts.reduce((s, c) => s + Number(c.totalValue || 0), 0);
  const sorted = [...blocks].sort((a, b) => (b.kgProcessed || 0) - (a.kgProcessed || 0));
  const maxKg = Math.max(...blocks.map((b) => b.kgProcessed || 0), 1);

  const blockRows = sorted
    .map((b) => {
      const kpa = b.acres > 0 ? ((b.kgProcessed || 0) / b.acres).toFixed(1) : '—';
      const pct = Math.round(((b.kgProcessed || 0) / maxKg) * 100);
      const sColor = b.status === 'Active' ? '#2D6A2D' : b.status === 'Alert' ? '#8B2020' : '#555';
      return `<tr>
          <td style="font-weight:700;">${b.name}</td>
          <td>${b.acres || 0} ac</td>
          <td>${Number(b.plant_count || 0).toLocaleString()}</td>
          <td>${(b.kgProcessed || 0).toLocaleString()} kg</td>
          <td>${kpa}</td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="flex:1;height:6px;background:#eee;border-radius:3px;min-width:60px;">
                <div style="height:100%;width:${pct}%;background:#4A7A20;border-radius:3px;"></div>
              </div>
              <span style="font-size:10px;color:#777;">${pct}%</span>
            </div>
          </td>
          <td style="color:${sColor};font-weight:700;">${b.status}</td>
        </tr>`;
    })
    .join('');

  const batchRows = batches
    .slice(0, 30)
    .map(
      (b) => `<tr>
      <td style="font-weight:600;">${b.id || '—'}</td>
      <td>${b.blockName || b.block_id || '—'}</td>
      <td>${b.stage || '—'}</td>
      <td>${(b.kgIn || 0).toLocaleString()} kg</td>
      <td>${b.kgOut ? b.kgOut.toLocaleString() + ' kg' : '—'}</td>
      <td>${b.conversion ? b.conversion + '%' : '—'}</td>
      <td style="color:${b.status === 'Alert' ? '#8B2020' : b.status === 'Complete' ? '#2D6A2D' : '#555'};font-weight:600;">${b.status || '—'}</td>
      <td>${b.date || '—'}</td>
    </tr>`
    )
    .join('');

  const finRows = financeItems
    .slice(0, 30)
    .map(
      (i) => `<tr>
      <td>${i.date || '—'}</td>
      <td>${i.category || '—'}</td>
      <td>${i.description || '—'}</td>
      <td style="color:${i.type === 'Expense' ? '#8B2020' : '#2D6A2D'};font-weight:700;">
        ${i.type === 'Expense' ? '−' : '+'}${fmtUgx(i.amount)}
      </td>
      <td>${i.type || '—'}</td>
    </tr>`
    )
    .join('');

  const contractRows = contracts
    .map(
      (c) => `<tr>
      <td style="font-weight:600;">${c.id || '—'}</td>
      <td>${c.buyer || '—'}</td>
      <td>${c.destination || '—'}</td>
      <td>${c.grade || '—'}</td>
      <td>${(c.netKg || 0).toLocaleString()} kg</td>
      <td>${fmtUgx(c.totalValue)}</td>
      <td>${c.etd || '—'}</td>
      <td style="color:${c.status === 'Confirmed' || c.status === 'Received' ? '#2D6A2D' : '#555'};font-weight:600;">${c.status || '—'}</td>
    </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Nyakamenta Coffee Estate — Season Report ${dateStr}</title>
  <style>
    *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Segoe UI',Arial,sans-serif; color:#1A1208; background:#fff; font-size:13px; }
    .page { max-width:1100px; margin:0 auto; padding:40px 40px 60px; }

    /* Header */
    .report-header { display:flex; align-items:flex-start; justify-content:space-between;
                     padding-bottom:24px; border-bottom:3px solid #2D4A1A; margin-bottom:32px; }
    .report-logo-area h1 { font-size:26px; font-weight:900; color:#2D4A1A; letter-spacing:-.01em; }
    .report-logo-area p  { font-size:13px; color:#7A6040; margin-top:4px; }
    .report-meta { text-align:right; font-size:12px; color:#7A6040; line-height:1.8; }
    .report-meta strong { color:#2D4A1A; }

    /* Section */
    .section { margin-bottom:36px; }
    .section-title { font-size:16px; font-weight:800; color:#2D4A1A; margin-bottom:14px;
                     padding-bottom:6px; border-bottom:1.5px solid #D4B060; letter-spacing:-.01em; }

    /* KPI grid */
    .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:1px;
                background:#E8DCC0; border:1px solid #E8DCC0; border-radius:6px; overflow:hidden; margin-bottom:20px; }
    .kpi-grid.cols-3 { grid-template-columns:repeat(3,1fr); }
    .kpi-cell { background:#FFFBF3; padding:16px 18px; }
    .kpi-label { font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:#9B7B5A; font-weight:700; margin-bottom:5px; }
    .kpi-val   { font-size:22px; font-weight:900; color:#1A1208; }
    .kpi-sub   { font-size:10px; color:#9B7B5A; margin-top:3px; }
    .kpi-val.green  { color:#2D6A2D; }
    .kpi-val.red    { color:#8B2020; }
    .kpi-val.gold   { color:#8A6018; }

    /* Tables */
    table  { width:100%; border-collapse:collapse; font-size:12px; }
    thead  { background:#2D4A1A; color:#F5EDD8; }
    th     { padding:9px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.07em; font-weight:700; }
    td     { padding:9px 12px; border-bottom:1px solid #EDE0C4; vertical-align:middle; }
    tr:nth-child(even) td { background:#FDFAF2; }
    tr:hover td { background:#F5EDDA; }

    /* Footer */
    .report-footer { margin-top:48px; padding-top:16px; border-top:1px solid #D4B060;
                     font-size:10px; color:#9B7B5A; display:flex; justify-content:space-between; }

    @media print {
      body { background:#fff; }
      .page { padding:20px; }
      .no-print { display:none !important; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="report-header">
    <div class="report-logo-area">
      <h1>☕ Nyakamenta Coffee Estate</h1>
      <p>Season Performance Report · Uganda</p>
    </div>
    <div class="report-meta">
      <div><strong>Date:</strong> ${dateStr}</div>
      <div><strong>Season:</strong> 2025/26 Main Crop</div>
      <div><strong>Estate Size:</strong> ${totalAc.toFixed(1)} acres</div>
      <div><strong>Blocks:</strong> ${blocks.length} registered</div>
    </div>
  </div>

  <!-- Season At a Glance -->
  <div class="section">
    <div class="section-title">📊 Season At a Glance</div>
    <div class="kpi-grid">
      <div class="kpi-cell"><div class="kpi-label">Total Acreage</div><div class="kpi-val">${totalAc.toFixed(1)}<span style="font-size:13px;"> ac</span></div></div>
      <div class="kpi-cell"><div class="kpi-label">Cherry Intake</div><div class="kpi-val gold">${cherryIn.toLocaleString()}<span style="font-size:13px;"> kg</span></div></div>
      <div class="kpi-cell"><div class="kpi-label">Green Bean Output</div><div class="kpi-val gold">${greenOut.toLocaleString()}<span style="font-size:13px;"> kg</span></div></div>
      <div class="kpi-cell"><div class="kpi-label">Avg Kg / Acre</div><div class="kpi-val">${totalAc > 0 ? (totalKg / totalAc).toFixed(1) : '—'}</div></div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-cell"><div class="kpi-label">Total Revenue</div><div class="kpi-val green">${fmtUgx(revenue)}</div></div>
      <div class="kpi-cell"><div class="kpi-label">Total Expenses</div><div class="kpi-val red">${fmtUgx(expense)}</div></div>
      <div class="kpi-cell"><div class="kpi-label">Net ${profit >= 0 ? 'Profit' : 'Loss'}</div><div class="kpi-val ${profit >= 0 ? 'gold' : 'red'}">${fmtUgx(Math.abs(profit))}</div></div>
      <div class="kpi-cell"><div class="kpi-label">Domestic dispatch value</div><div class="kpi-val">${fmtUgx(exportVal)}</div></div>
    </div>
  </div>

  <!-- Block Performance -->
  <div class="section">
    <div class="section-title">🌱 Block Performance</div>
    <table>
      <thead><tr>
        <th>Block</th><th>Acreage</th><th>Plants</th>
        <th>Season Yield</th><th>Kg/Acre</th><th>Yield vs Best</th><th>Status</th>
      </tr></thead>
      <tbody>${blockRows}</tbody>
    </table>
  </div>

  <!-- Batch Registry -->
  <div class="section">
    <div class="section-title">⚙️ Batch Registry</div>
    <div class="kpi-grid cols-3" style="margin-bottom:16px;">
      <div class="kpi-cell"><div class="kpi-label">Total Batches</div><div class="kpi-val">${batches.length}</div></div>
      <div class="kpi-cell"><div class="kpi-label">Completed</div><div class="kpi-val green">${batches.filter((b) => b.status === 'Complete').length}</div></div>
      <div class="kpi-cell"><div class="kpi-label">Alert / Active</div><div class="kpi-val ${batches.filter((b) => b.status === 'Alert').length > 0 ? 'red' : ''}">
        ${batches.filter((b) => b.status === 'Alert' || b.status === 'Processing').length}</div></div>
    </div>
    <table>
      <thead><tr><th>Batch ID</th><th>Block</th><th>Stage</th><th>Kg In</th><th>Kg Out</th><th>Conversion</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${batchRows || '<tr><td colspan="8" style="text-align:center;color:#9B7B5A;padding:20px;">No batches recorded</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Finance -->
  <div class="section">
    <div class="section-title">💰 Finance Ledger (Recent)</div>
    <table>
      <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Type</th></tr></thead>
      <tbody>${finRows || '<tr><td colspan="5" style="text-align:center;color:#9B7B5A;padding:20px;">No transactions recorded</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Domestic dispatch -->
  <div class="section">
    <div class="section-title">🚚 Domestic green coffee dispatch</div>
    <table>
      <thead><tr><th>ID</th><th>Receiver</th><th>Destination</th><th>Grade</th><th>Net Kg</th><th>Value</th><th>Dispatch date</th><th>Status</th></tr></thead>
      <tbody>${contractRows || '<tr><td colspan="8" style="text-align:center;color:#9B7B5A;padding:20px;">No dispatches recorded</td></tr>'}</tbody>
    </table>
  </div>

  <!-- Footer -->
  <div class="report-footer">
    <span>Nyakamenta Coffee Estate · Uganda · Generated ${dateStr} by Coffee Estate OS v1.0.0</span>
    <span>Confidential — Farm Management Use Only</span>
  </div>

</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Nyakamenta_Estate_Report_${now.toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function blockTableRows(blocks) {
  return [...blocks]
    .sort((a, b) => (b.kgProcessed || 0) - (a.kgProcessed || 0))
    .map((b, i) => {
      const kpa = b.acres > 0 ? ((b.kgProcessed || 0) / b.acres).toFixed(1) : '—';
      const sc = b.status === 'Active' ? 'var(--green-text)' : b.status === 'Alert' ? 'var(--red-text)' : 'var(--text-muted)';
      const nm = String(b.name || '').toLowerCase();
      return `<tr class="report-block-row" data-block-name="${nm.replace(/"/g, '&quot;')}" style="border-top:1px solid var(--border-subtle);${i % 2 ? 'background:var(--bg-overlay)' : ''}">
                <td style="padding:9px 12px;font-weight:700;">${b.name}</td>
                <td style="padding:9px 12px;">${b.acres} ac</td>
                <td style="padding:9px 12px;" class="tabular-nums">${Number(b.plant_count || 0).toLocaleString()}</td>
                <td style="padding:9px 12px;font-weight:700;">${(b.kgProcessed || 0).toLocaleString()} kg</td>
                <td style="padding:9px 12px;color:var(--gold-text);font-weight:700;">${kpa}</td>
                <td style="padding:9px 12px;"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:8px;
                  background:${b.status === 'Active' ? 'rgba(100,180,60,.15)' : b.status === 'Alert' ? 'rgba(220,80,50,.15)' : 'var(--bg-overlay)'};
                  color:${sc};">${b.status}</span></td>
              </tr>`;
    })
    .join('');
}

// ── Main render ───────────────────────────────────────────────
export async function renderReports(container) {
  const [blocks, batches, financeItems, workforce, contracts] = await Promise.all([
    dataService.getBlocks(),
    dataService.getBatches(),
    dataService.getFinanceItems(),
    dataService.getWorkforce(),
    dataService.getContracts(),
  ]);

  const workers = workforce.departments || [];
  const totalExpenses = financeItems.filter((i) => i.type === 'Expense').reduce((s, i) => s + Number(i.amount), 0);
  const totalRevenue = financeItems.filter((i) => i.type === 'Revenue').reduce((s, i) => s + Number(i.amount), 0);
  const totalCherryIn = batches.reduce((s, b) => s + Number(b.kgIn || 0), 0);
  const totalGreenOut = batches.reduce((s, b) => s + Number(b.kgOut || 0), 0);
  const totalAc = blocks.reduce((s, b) => s + (b.acres || 0), 0);
  const totalPlants = blocks.reduce((s, b) => s + Number(b.plant_count || 0), 0);
  const exportValue = contracts.reduce((s, c) => s + Number(c.totalValue || 0), 0);
  const profit = totalRevenue - totalExpenses;

  const bt = batches.length;
  const nComplete = batches.filter((b) => b.status === 'Complete').length;
  const nAlert = batches.filter((b) => b.status === 'Alert').length;
  const nProcessing = batches.filter((b) => b.status === 'Processing').length;
  const pct = (n) => (bt > 0 ? Math.round((n / bt) * 100) : 0);

  const avgConv =
    batches.filter((b) => b.conversion).length > 0
      ? (
          batches.reduce((s, b) => s + Number(b.conversion || 0), 0) / batches.filter((b) => b.conversion).length
        ).toFixed(1) + '%'
      : '—';

  container.innerHTML = `
    <div class="reports-mt-shell">
      <div class="reports-mt-main">
        <div class="reports-mt-header">
          <div>
            <h1 class="page-title">Season Reports</h1>
            <p class="page-subtitle">Analytics and exports — same layout style as Growth Gateway reports.</p>
          </div>
          <div class="reports-mt-actions">
            <button type="button" class="reports-mt-btn-outline" id="print-report-btn">
              <span class="material-symbols-outlined" style="font-size:18px;">print</span> Print
            </button>
            <button type="button" class="reports-mt-btn-outline reports-mt-accent-gold" id="download-report-btn">
              <span class="material-symbols-outlined" style="font-size:18px;">download</span> Full HTML
            </button>
          </div>
        </div>

        <div class="reports-mt-banner">
          <span class="material-symbols-outlined" style="font-size:32px;color:var(--gold);">description</span>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:2px;">Downloadable season pack</div>
            <div style="font-size:11px;color:var(--text-muted);">
              Blocks, batches, farm finance (UGX), and domestic dispatches — open in a browser or print to PDF.
            </div>
          </div>
          <button type="button" class="btn" id="download-report-btn2"
            style="background:var(--gold);color:#1A0F08;border:none;border-radius:8px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:18px;">download</span> Download .html
          </button>
        </div>

        <div class="pillar-tab-bar reports-mt-tabstrip">
          <button type="button" class="pillar-tab active" data-report-tab="overview">
            <span class="material-symbols-outlined">dashboard</span> Overview
          </button>
          <button type="button" class="pillar-tab" data-report-tab="farm">
            <span class="material-symbols-outlined">agriculture</span> Farm &amp; batches
          </button>
          <button type="button" class="pillar-tab" data-report-tab="finance">
            <span class="material-symbols-outlined">account_balance</span> Finance &amp; exports
          </button>
        </div>

        <div class="report-panel" data-panel="overview">
          <div class="reports-mt-grid-3">
            <div class="reports-mt-card">
              <div class="reports-mt-card-h"><h3>Farm snapshot</h3><p>Registered estate footprint</p></div>
              <div class="reports-mt-card-b">
                <div class="reports-mt-row"><span>Registered blocks</span><span class="reports-mt-val">${blocks.length}</span></div>
                <div class="reports-mt-row"><span>Total acreage</span><span class="reports-mt-val">${totalAc.toFixed(1)} ac</span></div>
                <div class="reports-mt-row"><span>Coffee plants</span><span class="reports-mt-val">${totalPlants.toLocaleString()} <span class="reports-mt-val muted" style="font-size:11px;">/ ${FARM_PLANT_CAPACITY.toLocaleString()}</span></span></div>
                <div class="reports-mt-row"><span>Active blocks</span><span class="reports-mt-val green">${blocks.filter((b) => b.status === 'Active').length}</span></div>
              </div>
            </div>
            <div class="reports-mt-card">
              <div class="reports-mt-card-h"><h3>Yield &amp; processing</h3><p>Season throughput</p></div>
              <div class="reports-mt-card-b">
                <div class="reports-mt-row"><span>Cherry intake</span><span class="reports-mt-val gold">${totalCherryIn.toLocaleString()} kg</span></div>
                <div class="reports-mt-row"><span>Green bean output</span><span class="reports-mt-val gold">${totalGreenOut.toLocaleString()} kg</span></div>
                <div class="reports-mt-row"><span>Avg kg / acre</span><span class="reports-mt-val">${totalAc > 0 ? (blocks.reduce((s, b) => s + (b.kgProcessed || 0), 0) / totalAc).toFixed(1) : '—'}</span></div>
              </div>
            </div>
            <div class="reports-mt-card">
              <div class="reports-mt-card-h"><h3>Batch status</h3><p>Share of all batches</p></div>
              <div class="reports-mt-card-b">
                <div class="reports-mt-row">
                  <span>Completed</span>
                  <div class="reports-mt-progress-wrap">
                    <div class="reports-mt-progress"><span style="width:${pct(nComplete)}%;background:var(--green);"></span></div>
                    <span class="reports-mt-val green">${nComplete}</span>
                  </div>
                </div>
                <div class="reports-mt-row">
                  <span>Alert</span>
                  <div class="reports-mt-progress-wrap">
                    <div class="reports-mt-progress"><span style="width:${pct(nAlert)}%;background:var(--red-text);"></span></div>
                    <span class="reports-mt-val red">${nAlert}</span>
                  </div>
                </div>
                <div class="reports-mt-row">
                  <span>Processing</span>
                  <div class="reports-mt-progress-wrap">
                    <div class="reports-mt-progress"><span style="width:${pct(nProcessing)}%;background:var(--gold-text);"></span></div>
                    <span class="reports-mt-val gold">${nProcessing}</span>
                  </div>
                </div>
                <div class="reports-mt-row"><span>Total batches</span><span class="reports-mt-val">${bt}</span></div>
              </div>
            </div>
          </div>

          <div class="reports-mt-card" style="margin-bottom:20px;">
            <div class="reports-mt-card-h"><h3>Ledger summary</h3><p>Farm finance (UGX)</p></div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0;border-top:1px solid var(--border-subtle);">
              ${[
                { label: 'Total revenue', val: dataService.formatCurrency(totalRevenue), cls: 'green' },
                { label: 'Total expenses', val: dataService.formatCurrency(totalExpenses), cls: 'red' },
                { label: 'Net ' + (profit >= 0 ? 'profit' : 'loss'), val: dataService.formatCurrency(Math.abs(profit)), cls: profit >= 0 ? 'gold' : 'red' },
                { label: 'Domestic dispatch value', val: dataService.formatCurrency(exportValue), cls: '' },
              ]
                .map(
                  (s, i) => `
              <div style="padding:18px 20px;border-right:${i % 2 === 0 ? '1px solid var(--border-subtle)' : 'none'};border-bottom:1px solid var(--border-subtle);">
                <div class="kpi-label">${s.label}</div>
                <div class="reports-mt-val ${s.cls}" style="font-size:22px;margin-top:8px;">${s.val}</div>
              </div>`
                )
                .join('')}
            </div>
          </div>
        </div>

        <div class="report-panel" data-panel="farm" style="display:none;">
          <div class="section-card reports-mt-table-card" style="margin-bottom:20px;">
            <div class="card-header">
              <div>
                <h2 class="card-title">Block performance</h2>
                <p style="font-size:11px;color:var(--text-muted);margin:4px 0 0;">By yield — search to filter</p>
              </div>
              <div class="reports-mt-search">
                <span class="material-symbols-outlined">search</span>
                <input type="search" id="report-block-search" placeholder="Search blocks…" autocomplete="off" />
              </div>
              <button type="button" class="btn btn-ghost btn-sm" data-export="blocks">
                <span class="material-symbols-outlined" style="font-size:13px;">download</span> CSV
              </button>
            </div>
            <div style="overflow-x:auto;padding:0 16px 16px;">
              <table class="data-table" id="report-blocks-table">
                <thead><tr>
                  <th>Block</th><th>Acres</th><th>Plants</th>
                  <th>Season yield</th><th>Kg/Acre</th><th>Status</th>
                </tr></thead>
                <tbody>${blockTableRows(blocks)}</tbody>
              </table>
            </div>
          </div>

          <div class="section-card">
            <div class="card-header">
              <h2 class="card-title">Batch performance</h2>
              <button type="button" class="btn btn-ghost btn-sm" data-export="batches">
                <span class="material-symbols-outlined" style="font-size:13px;">download</span> CSV
              </button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-bottom:1px solid var(--border-subtle);">
              ${[
                { label: 'Total batches', val: bt },
                { label: 'Completed', val: nComplete },
                { label: 'Avg conversion', val: avgConv },
              ]
                .map(
                  (s, i) => `
              <div style="padding:18px 20px;border-right:${i < 2 ? '1px solid var(--border-subtle)' : 'none'};">
                <div class="kpi-label">${s.label}</div>
                <div style="font-size:22px;font-weight:800;margin-top:8px;">${s.val}</div>
              </div>`
                )
                .join('')}
            </div>
          </div>
        </div>

        <div class="report-panel" data-panel="finance" style="display:none;">
          <div class="section-card" style="margin-bottom:20px;">
            <div class="card-header"><h2 class="card-title">Recent ledger lines</h2></div>
            <div style="overflow-x:auto;padding:0 16px 16px;">
              <table class="data-table">
                <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Type</th></tr></thead>
                <tbody>
                  ${financeItems.slice(0, 24).map((i) => `
                    <tr>
                      <td>${i.date || '—'}</td>
                      <td>${i.category || '—'}</td>
                      <td>${(i.description || '').slice(0, 80)}${(i.description || '').length > 80 ? '…' : ''}</td>
                      <td class="tabular-nums" style="color:${i.type === 'Expense' ? 'var(--red-text)' : 'var(--green-text)'};font-weight:700;">
                        ${dataService.formatCurrency(i.amount)}
                      </td>
                      <td><span class="badge ${i.type === 'Expense' ? 'red' : 'green'}">${i.type || '—'}</span></td>
                    </tr>
                  `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">No transactions yet.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <div class="section-card">
            <div class="card-header"><h2 class="card-title">Data exports (CSV)</h2></div>
            <div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px;">
              ${[
                { id: 'blocks', icon: 'map', label: 'Block register', desc: `${blocks.length} blocks` },
                { id: 'batches', icon: 'layers', label: 'Batch registry', desc: `${batches.length} batches` },
                { id: 'finance', icon: 'account_balance_wallet', label: 'Finance ledger', desc: `${financeItems.length} transactions` },
                { id: 'workforce', icon: 'group', label: 'Workforce roster', desc: `${workers.length} staff records` },
                { id: 'contracts', icon: 'local_shipping', label: 'Domestic dispatches', desc: `${contracts.length} records` },
              ]
                .map(
                  (item) => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-raised);border:1px solid var(--border);border-radius:8px;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <span class="material-symbols-outlined" style="font-size:20px;color:var(--text-muted);">${item.icon}</span>
                  <div>
                    <div style="font-weight:600;font-size:13px;">${item.label}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:1px;">${item.desc}</div>
                  </div>
                </div>
                <button type="button" class="btn btn-ghost btn-sm" data-export="${item.id}">
                  <span class="material-symbols-outlined" style="font-size:14px;">download</span> CSV
                </button>
              </div>`
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const reportData = { blocks, batches, financeItems, contracts, workforce, meta: {} };

  container.querySelectorAll('[data-report-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.reportTab;
      container.querySelectorAll('[data-report-tab]').forEach((b) => b.classList.toggle('active', b.dataset.reportTab === t));
      container.querySelectorAll('.report-panel').forEach((p) => {
        p.style.display = p.dataset.panel === t ? 'block' : 'none';
      });
    });
  });

  container.querySelector('#report-block-search')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    container.querySelectorAll('.report-block-row').forEach((row) => {
      const nm = row.dataset.blockName || '';
      row.style.display = !q || nm.includes(q) ? '' : 'none';
    });
  });

  const dlBtn1 = container.querySelector('#download-report-btn');
  const dlBtn2 = container.querySelector('#download-report-btn2');
  const doDownload = () => {
    if (dlBtn1) {
      dlBtn1.textContent = 'Generating…';
      dlBtn1.disabled = true;
    }
    setTimeout(() => {
      downloadHTMLReport(reportData);
      if (dlBtn1) {
        dlBtn1.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">download</span> Full HTML';
        dlBtn1.disabled = false;
      }
    }, 100);
  };
  dlBtn1?.addEventListener('click', doDownload);
  dlBtn2?.addEventListener('click', doDownload);

  container.querySelector('#print-report-btn')?.addEventListener('click', () => window.print());

  container.querySelectorAll('[data-export]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const map = {
        blocks: [blocks, 'blocks.csv'],
        batches: [batches, 'batches.csv'],
        finance: [financeItems, 'finance_ledger.csv'],
        workforce: [workers, 'workforce.csv'],
        contracts: [contracts, 'domestic_dispatches.csv'],
      };
      const [data, filename] = map[btn.dataset.export] || [];
      if (data) downloadCSV(filename, data);
    });
  });
}
