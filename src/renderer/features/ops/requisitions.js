// ============================================================
// requisitions.js — Farm Requisition Editor & Excel Exporter (Redesigned)
// Modern UI with Material Symbols icons, live math, Excel exporter,
// and farm expense ledger integration.
// ============================================================
import { dataService } from '../../services/dataService.js';

let activeRequisitionId = null;

export async function renderRequisitions(container) {
  container.innerHTML = `
    <div class="requisitions-container" style="padding: 24px 32px; max-width: 1320px; margin: 0 auto;">
      
      <!-- Top Banner Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
        <div style="display:flex; align-items:center; gap: 10px;">
          <div style="width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.25)); display:flex; align-items:center; justify-content:center; color: #16a34a;">
            <span class="material-symbols-outlined" style="font-size: 22px;">receipt_long</span>
          </div>
          <h1 style="font-size: 24px; font-weight: 700; color: var(--text-primary, #0f172a); margin: 0; letter-spacing: -0.02em;">Farm Requisitions</h1>
        </div>

        <div style="display: flex; gap: 12px; align-items: center;">
          <button type="button" id="btn-new-req" class="btn btn-secondary" style="display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s ease;">
            <span class="material-symbols-outlined" style="font-size: 18px;">add</span> New Requisition
          </button>
        </div>
      </div>

      <!-- Main Layout Grid -->
      <div style="display: grid; grid-template-columns: 1fr 360px; gap: 28px; align-items: start;">
        
        <!-- Left Column: Requisition Editor -->
        <div style="background: var(--bg-card, #ffffff); border-radius: 14px; border: 1px solid var(--border-color, #e2e8f0); padding: 28px; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);">
          
          <!-- Editor Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color, #e2e8f0);">
            <h2 id="req-editor-title" style="font-size: 17px; font-weight: 700; color: var(--text-primary, #0f172a); margin: 0;">Draft New Requisition</h2>
            <span id="req-status-badge" style="padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background: #e0f2fe; color: #0284c7;">
              Draft
            </span>
          </div>

          <form id="form-requisition" onsubmit="return false;">
            
            <!-- Metadata Fields -->
            <div style="display: grid; grid-template-columns: 180px 1fr; gap: 20px; margin-bottom: 24px;">
              <div>
                <label style="display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #64748b); margin-bottom: 6px;">Date</label>
                <input type="date" id="req-date" class="form-input" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid var(--border-color, #cbd5e1); font-size: 13px; background: var(--bg-surface, #f8fafc);" required value="${new Date().toISOString().slice(0, 10)}" />
              </div>
              <div>
                <label style="display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #64748b); margin-bottom: 6px;">Requisition Title / Reference</label>
                <input type="text" id="req-title" class="form-input" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid var(--border-color, #cbd5e1); font-size: 13px; background: var(--bg-surface, #f8fafc);" placeholder="e.g. Weekly Farm Maintenance Requisition" value="" />
              </div>
            </div>

            <!-- Table of Line Items -->
            <div style="border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; overflow: hidden; margin-bottom: 20px; background: var(--bg-card, #ffffff);">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background: var(--bg-surface, #f8fafc); border-bottom: 1px solid var(--border-color, #e2e8f0); color: var(--text-muted, #475569); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">
                    <th style="padding: 12px 14px; width: 38%;">Item Description</th>
                    <th style="padding: 12px 14px; width: 18%;">Qty</th>
                    <th style="padding: 12px 14px; width: 20%;">Unit Cost (UGX)</th>
                    <th style="padding: 12px 14px; width: 20%;">Amount (UGX)</th>
                    <th style="padding: 12px 14px; width: 4%; text-align: center;"></th>
                  </tr>
                </thead>
                <tbody id="req-items-tbody">
                  <!-- Rows inserted dynamically -->
                </tbody>
              </table>
            </div>

            <!-- Row Control & Total Summary Banner -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; background: var(--bg-surface, #f8fafc); padding: 14px 18px; border-radius: 10px; border: 1px solid var(--border-color, #e2e8f0); flex-wrap: wrap; gap: 12px;">
              <button type="button" id="btn-add-item-row" class="btn" style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 6px; border: 1px dashed #16a34a; background: rgba(22, 163, 74, 0.05); color: #15803d; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s ease;">
                <span class="material-symbols-outlined" style="font-size: 18px;">add_circle</span> Add Item Row
              </button>
              
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #64748b);">Total Cost:</span>
                <span id="req-grand-total" style="font-size: 22px; font-weight: 800; color: #15803d; font-family: monospace;">UGX 0</span>
              </div>
            </div>

            <!-- Action Toolbar -->
            <div style="display: flex; gap: 14px; flex-wrap: wrap; align-items: center; border-top: 1px solid var(--border-color, #e2e8f0); padding-top: 20px;">
              <button type="button" id="btn-export-excel" class="btn" style="background: linear-gradient(135deg, #16a34a, #15803d); color: white; border: none; padding: 11px 20px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(22, 163, 74, 0.25); transition: all 0.2s ease;">
                <span class="material-symbols-outlined" style="font-size: 20px;">file_download</span> Download Excel (.xlsx)
              </button>

              <button type="button" id="btn-save-req" class="btn btn-primary" style="padding: 11px 20px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s ease;">
                <span class="material-symbols-outlined" style="font-size: 20px;">save</span> Save Requisition
              </button>

              <button type="button" id="btn-post-expenses" class="btn" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border: none; padding: 11px 20px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; margin-left: auto; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25); transition: all 0.2s ease;">
                <span class="material-symbols-outlined" style="font-size: 20px;">payments</span> Post to Farm Ledger
              </button>
            </div>

          </form>
        </div>

        <!-- Right Column: Requisition History Feed -->
        <div style="background: var(--bg-card, #ffffff); border-radius: 14px; border: 1px solid var(--border-color, #e2e8f0); padding: 22px; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);">
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color, #e2e8f0);">
            <h3 style="font-size: 15px; font-weight: 700; color: var(--text-primary, #0f172a); margin: 0; display: flex; align-items: center; gap: 8px;">
              <span class="material-symbols-outlined" style="font-size: 20px; color: var(--text-muted, #64748b);">history</span> Saved Requisitions
            </h3>
            <span style="font-size: 11px; font-weight: 600; color: var(--text-muted, #64748b); background: var(--bg-surface, #f1f5f9); padding: 3px 8px; border-radius: 12px;" id="history-count-badge">0 saved</span>
          </div>

          <div id="requisitions-history-list" style="display: flex; flex-direction: column; gap: 12px; max-height: 620px; overflow-y: auto; padding-right: 4px;">
            <div style="text-align: center; padding: 30px 10px; color: var(--text-muted, #94a3b8); font-size: 13px;">
              <span class="material-symbols-outlined" style="font-size: 32px; display: block; margin: 0 auto 8px; opacity: 0.5;">folder_open</span>
              No requisitions saved yet.
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  // Attach Event Listeners
  setupEventListeners(container);

  // Initialize with default sample rows
  resetEditor();

  // Load History List
  await loadHistoryList(container);
}

function createItemRow(item = '', qty = '', unitCost = '', amount = '') {
  const tr = document.createElement('tr');
  tr.className = 'req-item-row';
  tr.style.borderBottom = '1px solid var(--border-color, #f1f5f9)';

  tr.innerHTML = `
    <td style="padding: 10px 12px;">
      <input type="text" class="req-input-item" value="${esc(item)}" placeholder="e.g. Fuel for pump" style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color, #cbd5e1); font-size: 13px; background: var(--bg-card, #fff);" required />
    </td>
    <td style="padding: 10px 12px;">
      <input type="text" class="req-input-qty" value="${esc(qty)}" placeholder="e.g. 10ltrs" style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color, #cbd5e1); font-size: 13px; background: var(--bg-card, #fff);" />
    </td>
    <td style="padding: 10px 12px;">
      <input type="number" class="req-input-cost" value="${unitCost !== '' ? unitCost : ''}" placeholder="6550" style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color, #cbd5e1); font-size: 13px; background: var(--bg-card, #fff);" min="0" step="any" />
    </td>
    <td style="padding: 10px 12px;">
      <input type="number" class="req-input-amount" value="${amount !== '' ? amount : ''}" placeholder="65500" style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color, #cbd5e1); font-size: 13px; font-weight: 600; background: var(--bg-card, #fff);" min="0" step="any" required />
    </td>
    <td style="padding: 10px 8px; text-align: center;">
      <button type="button" class="btn-remove-row" title="Delete Row" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 6px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; transition: background 0.15s ease;">
        <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
      </button>
    </td>
  `;

  // Attach dynamic calculations
  const qtyInput = tr.querySelector('.req-input-qty');
  const costInput = tr.querySelector('.req-input-cost');
  const amountInput = tr.querySelector('.req-input-amount');

  const recalculateLine = () => {
    const qtyVal = parseFloat(qtyInput.value);
    const costVal = parseFloat(costInput.value);
    if (!isNaN(qtyVal) && !isNaN(costVal)) {
      amountInput.value = (qtyVal * costVal).toFixed(0);
    }
    calculateGrandTotal();
  };

  qtyInput.addEventListener('input', recalculateLine);
  costInput.addEventListener('input', recalculateLine);
  amountInput.addEventListener('input', calculateGrandTotal);

  tr.querySelector('.btn-remove-row').addEventListener('click', () => {
    const tbody = document.getElementById('req-items-tbody');
    if (tbody.children.length > 1) {
      tr.remove();
      calculateGrandTotal();
    } else {
      showToast('Requisition must have at least one item.');
    }
  });

  return tr;
}

function calculateGrandTotal() {
  let total = 0;
  document.querySelectorAll('.req-input-amount').forEach(input => {
    const val = parseFloat(input.value) || 0;
    total += val;
  });

  const totalEl = document.getElementById('req-grand-total');
  if (totalEl) {
    totalEl.textContent = dataService.formatCurrency(total);
  }
  return total;
}

function resetEditor() {
  activeRequisitionId = null;
  document.getElementById('req-editor-title').textContent = 'Draft New Requisition';
  document.getElementById('req-status-badge').textContent = 'Draft';
  document.getElementById('req-status-badge').style.cssText = 'padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #e0f2fe; color: #0284c7;';
  document.getElementById('req-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('req-title').value = '';
  const notesEl = document.getElementById('req-notes');
  if (notesEl) notesEl.value = '';

  const tbody = document.getElementById('req-items-tbody');
  tbody.innerHTML = '';
  tbody.appendChild(createItemRow('', '', '', ''));
  tbody.appendChild(createItemRow('', '', '', ''));
  tbody.appendChild(createItemRow('', '', '', ''));

  calculateGrandTotal();
}

function setupEventListeners(container) {
  container.querySelector('#btn-new-req').addEventListener('click', resetEditor);

  container.querySelector('#btn-add-item-row').addEventListener('click', () => {
    const tbody = document.getElementById('req-items-tbody');
    tbody.appendChild(createItemRow('', '', '', ''));
  });

  container.querySelector('#btn-export-excel').addEventListener('click', () => {
    exportRequisitionToExcel();
  });

  container.querySelector('#btn-save-req').addEventListener('click', async () => {
    await saveCurrentRequisition(container);
  });

  container.querySelector('#btn-post-expenses').addEventListener('click', async () => {
    await postCurrentRequisitionToExpenses(container);
  });
}

function getRequisitionFormData() {
  const date = document.getElementById('req-date').value;
  const title = document.getElementById('req-title').value.trim() || 'Farm Requisition';
  const notes = document.getElementById('req-notes')?.value?.trim() || '';

  const items = [];
  document.querySelectorAll('.req-item-row').forEach(tr => {
    const item = tr.querySelector('.req-input-item').value.trim();
    const qty = tr.querySelector('.req-input-qty').value.trim();
    const unit_cost = parseFloat(tr.querySelector('.req-input-cost').value) || 0;
    const amount = parseFloat(tr.querySelector('.req-input-amount').value) || 0;

    if (item && amount > 0) {
      items.push({ item, qty, unit_cost, amount });
    }
  });

  const total_amount = calculateGrandTotal();

  return { id: activeRequisitionId, date, title, notes, items, total_amount };
}

async function getXlsxModule() {
  if (window.XLSX) return window.XLSX;
  try {
    return await import('../../../node_modules/xlsx/xlsx.mjs');
  } catch {
    return await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs');
  }
}

async function exportRequisitionToExcel(dataOverride = null) {
  const data = dataOverride || getRequisitionFormData();
  if (!data.items || data.items.length === 0) {
    showToast('Add at least one valid item to export Excel.');
    return;
  }

  try {
    const XLSX = await getXlsxModule();

    // Build Sheet Data matching requisition 1.xlsx format
    const sheetData = [
      ['Item', 'Qty', 'Cost', 'Amount']
    ];

    data.items.forEach(row => {
      sheetData.push([
        String(row.item || ''),
        String(row.qty || ''),
        row.unit_cost > 0 ? Number(row.unit_cost) : '',
        Number(row.amount || 0)
      ]);
    });

    // Empty separator row
    sheetData.push(['', '', '', '']);

    // Total summary row
    sheetData.push(['Total', '', '', Number(data.total_amount || 0)]);

    const wb = XLSX.utils.book_new();

    // Format sheet name as DD-MM-YYYY
    let sheetName = 'Requisition';
    if (data.date) {
      const parts = data.date.split('-');
      if (parts.length === 3) {
        sheetName = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Auto column widths for Excel
    ws['!cols'] = [
      { wch: 32 },
      { wch: 16 },
      { wch: 18 },
      { wch: 20 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const fileName = `Requisition_${sheetName}.xlsx`;

    // Use SheetJS native writeFileXLSX / writeFile for 100% WPS Office and Excel compatibility
    if (typeof XLSX.writeFileXLSX === 'function') {
      XLSX.writeFileXLSX(wb, fileName);
    } else {
      XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
    }

    showToast(`Exported spreadsheet: ${fileName}`);
  } catch (err) {
    console.error("Excel generation error:", err);
    showToast(`Failed to export Excel: ${err.message}`);
  }
}

async function saveCurrentRequisition(container) {
  const data = getRequisitionFormData();
  if (!data.items || data.items.length === 0) {
    showToast('Add at least one item before saving.');
    return;
  }

  try {
    const savedId = await dataService.saveRequisition(data);
    activeRequisitionId = savedId;
    document.getElementById('req-editor-title').textContent = `Editing Requisition #${savedId}`;
    const statusPill = document.getElementById('req-status-badge');
    statusPill.textContent = 'Saved';
    statusPill.style.cssText = 'padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #dcfce7; color: #15803d;';
    
    showToast('Requisition saved successfully!');
    await loadHistoryList(container);
  } catch (err) {
    console.error("Save error:", err);
    showToast(`Error saving requisition: ${err.message}`);
  }
}

async function postCurrentRequisitionToExpenses(container) {
  const data = getRequisitionFormData();
  if (!data.items || data.items.length === 0) {
    showToast('Add at least one item before posting expenses.');
    return;
  }

  try {
    const getCategory = (desc) => {
      const d = desc.toLowerCase();
      if (d.includes('fuel') || d.includes('disel') || d.includes('petrol') || d.includes('2t')) return 'Fuel & Lubricants';
      if (d.includes('repair') || d.includes('service') || d.includes('oil')) return 'Equipment Service / Repair';
      if (d.includes('posho') || d.includes('bean') || d.includes('salt') || d.includes('soap') || d.includes('labour')) return 'Casual / Seasonal Labour';
      if (d.includes('padlock') || d.includes('bin') || d.includes('blade') || d.includes('cable') || d.includes('shear')) return 'Equipment Purchase';
      return 'Other Expense';
    };

    let postedCount = 0;
    for (const item of data.items) {
      let desc = item.item;
      if (item.qty) desc += ` (${item.qty})`;

      await dataService.addTransaction({
        category: getCategory(item.item),
        description: desc,
        amount: item.amount,
        date: data.date,
        type: 'Expense',
        payment_method: 'cash',
        source_module: 'requisition_entry',
        cost_center: 'farm'
      });
      postedCount++;
    }

    showToast(`Successfully posted ${postedCount} items directly to Farm Expenses!`);
  } catch (err) {
    console.error("Post error:", err);
    showToast(`Error posting expenses: ${err.message}`);
  }
}

async function loadHistoryList(container) {
  const listEl = container.querySelector('#requisitions-history-list');
  const countBadge = container.querySelector('#history-count-badge');
  if (!listEl) return;

  try {
    const requisitions = await dataService.getRequisitions();
    if (countBadge) countBadge.textContent = `${requisitions ? requisitions.length : 0} saved`;

    if (!requisitions || requisitions.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: var(--text-muted, #94a3b8); font-size: 13px;">
          <span class="material-symbols-outlined" style="font-size: 32px; display: block; margin: 0 auto 8px; opacity: 0.5;">folder_open</span>
          No requisitions saved yet.
        </div>`;
      return;
    }

    listEl.innerHTML = requisitions.map(req => `
      <div style="background: var(--bg-surface, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; padding: 14px; transition: all 0.15s ease;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <div>
            <strong style="color: var(--text-primary, #0f172a); font-size: 13.5px; display: block; margin-bottom: 2px;">${esc(req.title || 'Requisition')}</strong>
            <div style="font-size: 11px; color: var(--text-muted, #64748b);">${req.date} · ${req.items ? req.items.length : 0} items</div>
          </div>
          <span style="font-weight: 800; color: #15803d; font-family: monospace; font-size: 13px;">${dataService.formatCurrency(req.total_amount)}</span>
        </div>

        <div style="display: flex; gap: 6px; margin-top: 12px; border-top: 1px dashed var(--border-color, #e2e8f0); padding-top: 10px;">
          <button type="button" class="btn-load-req" data-id="${req.id}" style="padding: 5px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid var(--border-color, #cbd5e1); background: var(--bg-card, #fff); color: var(--text-primary, #1e293b); cursor: pointer; display: flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="font-size: 15px;">edit</span> Edit
          </button>

          <button type="button" class="btn-dl-excel" data-id="${req.id}" style="padding: 5px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid #16a34a; background: #f0fdf4; color: #15803d; cursor: pointer; display: flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="font-size: 15px;">file_download</span> Excel
          </button>

          <button type="button" class="btn-del-req" data-id="${req.id}" style="padding: 5px 10px; font-size: 11px; font-weight: 600; border-radius: 6px; border: 1px solid #fca5a5; background: #fef2f2; color: #dc2626; cursor: pointer; margin-left: auto; display: flex; align-items: center; justify-content: center;">
            <span class="material-symbols-outlined" style="font-size: 15px;">delete</span>
          </button>
        </div>
      </div>
    `).join('');

    // Attach listeners
    listEl.querySelectorAll('.btn-load-req').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const req = requisitions.find(r => r.id === id);
        if (req) loadRequisitionIntoEditor(req);
      });
    });

    listEl.querySelectorAll('.btn-dl-excel').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const req = requisitions.find(r => r.id === id);
        if (req) exportRequisitionToExcel(req);
      });
    });

    listEl.querySelectorAll('.btn-del-req').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        if (confirm('Delete this requisition?')) {
          await dataService.deleteRequisition(id);
          showToast('Requisition deleted.');
          if (activeRequisitionId === id) resetEditor();
          await loadHistoryList(container);
        }
      });
    });

  } catch (err) {
    console.error("History load error:", err);
    listEl.innerHTML = `<div style="color:red; font-size:12px; padding:10px;">Failed to load history: ${err.message}</div>`;
  }
}

function loadRequisitionIntoEditor(req) {
  activeRequisitionId = req.id;
  document.getElementById('req-editor-title').textContent = `Editing Requisition #${req.id}`;
  const statusPill = document.getElementById('req-status-badge');
  statusPill.textContent = 'Saved';
  statusPill.style.cssText = 'padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #dcfce7; color: #15803d;';
  
  document.getElementById('req-date').value = req.date || new Date().toISOString().slice(0, 10);
  document.getElementById('req-title').value = req.title || '';
  const notesEl = document.getElementById('req-notes');
  if (notesEl) notesEl.value = req.notes || '';

  const tbody = document.getElementById('req-items-tbody');
  tbody.innerHTML = '';

  if (req.items && req.items.length > 0) {
    req.items.forEach(item => {
      tbody.appendChild(createItemRow(item.item, item.qty, item.unit_cost, item.amount));
    });
  } else {
    tbody.appendChild(createItemRow('', '', '', ''));
  }

  calculateGrandTotal();
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(msg) {
  const existing = document.getElementById('req-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'req-toast';
  toast.style.cssText = 'position: fixed; bottom: 24px; right: 24px; background: #0f172a; color: white; padding: 12px 22px; border-radius: 10px; font-size: 13px; font-weight: 600; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); z-index: 99999; display: flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,0.1);';
  toast.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px; color:#22c55e;">check_circle</span> ${msg}`;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}
