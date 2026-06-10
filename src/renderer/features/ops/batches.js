// ============================================================
// batches.js — Batch Registry & Traceability Module
// ============================================================
import { dataService } from '../../services/dataService.js';

async function renderBatches(container) {
  const batches = await dataService.getBatches();

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Batch Registry</h1>
      <p class="page-subtitle">Traceability for cherry → parchment batches on the farm; many estates complete the log at <strong>drying</strong> before off-farm milling.</p>
    </div>

    <div class="section-card">
      <div class="card-header">
        <h2 class="card-title">Production Ledger</h2>
        <div class="card-actions">
           <button class="btn btn-primary btn-sm">Export CSV</button>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Origin Block</th>
            <th>Date</th>
            <th>Stage</th>
            <th>Conversion</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${batches.map(b => `
            <tr>
              <td class="font-bold tabular-nums">${b.id}</td>
              <td>${b.blockName}</td>
              <td class="tabular-nums">${b.date}</td>
              <td>${b.stage}</td>
              <td class="tabular-nums">${b.conversion ? b.conversion + '%' : '-'}</td>
              <td><span class="status-pill ${b.status.toLowerCase()}">${b.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export { renderBatches };
