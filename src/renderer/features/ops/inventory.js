// ============================================================
// inventory.js — Farm Inventory & Equipment Module
// ============================================================
import { dataService, INVENTORY_CATEGORIES } from '../../services/dataService.js';

/** Typical use per category (aligned with product guidance on farm “assets”). */
const INVENTORY_CATEGORY_HELP = {
    Equipment: 'Tractors, pulpers, hullers, generators, pumps',
    Tool: 'Slashers, pruning saws, secateurs, hoes, sprayers',
    Chemical: 'Fertilisers, pesticides, herbicides, fungicides',
    PPE: 'Gloves, boots, goggles, overalls, masks',
    Consumable: 'Bags, string, fuel, oil, jute sacks',
    'Spare Part': 'Belts, blades, bearings, filters',
};

function openAddInventoryModal(onSaved) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Add Inventory Item</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group flex-2">
            <label class="form-label">Item / Equipment Name</label>
            <input type="text" class="form-input" id="inv-name" placeholder="e.g. Massey Ferguson Tractor">
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" id="inv-category">
              ${INVENTORY_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="number" class="form-input" id="inv-qty" value="1" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <select class="form-select" id="inv-unit">
              <option value="pc">Pieces (pc)</option>
              <option value="litre">Litres (L)</option>
              <option value="kg">Kilograms (kg)</option>
              <option value="bag">Bags</option>
              <option value="set">Sets</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Min Threshold (Alert)</label>
            <input type="number" class="form-input" id="inv-min" value="0" min="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Condition</label>
            <select class="form-select" id="inv-condition">
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Needs Repair">Needs Repair</option>
              <option value="Condemned">Condemned</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Location</label>
            <input type="text" class="form-input" id="inv-location" placeholder="e.g. Main Store">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Unit value (UGX)</label>
            <input type="number" class="form-input" id="inv-unit-value" min="0" step="any" placeholder="Optional — rough estimate per unit">
          </div>
          <div class="form-group">
            <label class="form-label">Purchase date</label>
            <input type="date" class="form-input" id="inv-purchase-date">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes (Specs / SN / Dealer)</label>
          <input type="text" class="form-input" id="inv-notes" placeholder="e.g. Serial #1234, Serviced by Kibo Motors">
        </div>
        <p id="inv-error" style="color:var(--red-text);font-size:11px;display:none;margin-top:4px;"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="inv-cancel">Cancel</button>
        <button class="btn btn-primary" id="inv-save">
          <span class="material-symbols-outlined">save</span> Save Item
        </button>
      </div>
    </div>
  `;
    document.body.appendChild(backdrop);

    const close = () => document.body.removeChild(backdrop);
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.querySelector('#inv-cancel').addEventListener('click', close);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

    backdrop.querySelector('#inv-save').addEventListener('click', async () => {
        const uvRaw = backdrop.querySelector('#inv-unit-value').value;
        const uvNum = parseFloat(uvRaw);
        const data = {
            name: backdrop.querySelector('#inv-name').value.trim(),
            category: backdrop.querySelector('#inv-category').value,
            unit: backdrop.querySelector('#inv-unit').value,
            quantity: parseFloat(backdrop.querySelector('#inv-qty').value),
            min_quantity: parseFloat(backdrop.querySelector('#inv-min').value),
            condition: backdrop.querySelector('#inv-condition').value,
            location: backdrop.querySelector('#inv-location').value.trim(),
            purchase_date: backdrop.querySelector('#inv-purchase-date').value || '',
            unit_value: uvRaw === '' || !Number.isFinite(uvNum) ? 0 : uvNum,
            notes: backdrop.querySelector('#inv-notes').value.trim()
        };

        if (!data.name) {
            const err = backdrop.querySelector('#inv-error');
            err.style.display = 'block';
            err.textContent = 'Item name is required.';
            return;
        }

        await dataService.addInventoryItem(data);
        close();
        if (onSaved) onSaved();
    });
}

async function renderInventory(container) {
    const [items, alerts] = await Promise.all([
        dataService.getInventory(),
        dataService.getInventoryAlerts()
    ]);

    const render = () => renderInventory(container);

    const equipmentValueUgx = items
        .filter(i => i.category === 'Equipment')
        .reduce((s, i) => s + (i.quantity * (i.unit_value || 0)), 0);

    container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px;">
      <div>
        <h1 class="page-title">Farm Inventory</h1>
        <p class="page-subtitle">Track tools, chemicals, equipment, and consumables for Nyakamenta Coffee Estate.</p>
      </div>
      <button class="btn btn-primary" id="add-inv-btn" style="gap:6px;">
        <span class="material-symbols-outlined" style="font-size:18px;">add_box</span> Add Item
      </button>
    </div>

    ${alerts.length > 0 ? `
      <div style="background:rgba(220,80,50,0.1); border:1px solid rgba(220,80,50,0.2); border-radius:8px; padding:12px 16px; margin-bottom:20px; display:flex; align-items:center; gap:12px;">
        <span class="material-symbols-outlined" style="color:var(--red-text);">warning</span>
        <div style="flex:1;">
          <strong style="font-size:13px; color:var(--red-text);">${alerts.length} Inventory Alerts</strong>
          <p style="font-size:11px; color:var(--text-secondary);">${alerts.map(a => a.name).join(', ')} need attention or restocking.</p>
        </div>
      </div>
    ` : ''}

    <div class="kpi-grid" style="margin-bottom:24px;">
      <div class="kpi-card">
        <div class="kpi-label">Total Assets</div>
        <div class="kpi-value">${items.length}</div>
        <div class="kpi-subText">Inventory lines (not a formal fixed-asset ledger)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Equipment Value</div>
        <div class="kpi-value">${dataService.formatCurrency(equipmentValueUgx)}</div>
        <div class="kpi-subText">Rough estimate: qty × unit value (Equipment)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Pending Repairs</div>
        <div class="kpi-value" style="color:var(--red-text);">${items.filter(i => i.condition === 'Needs Repair').length}</div>
        <div class="kpi-subText">Items in workshop</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Storage Locations</div>
        <div class="kpi-value">${new Set(items.map(i => i.location).filter(Boolean)).size}</div>
        <div class="kpi-subText">Across the estate</div>
      </div>
    </div>

    <details class="section-card" style="margin-bottom:24px;">
      <summary style="cursor:pointer;list-style:none;padding:16px 20px;display:flex;align-items:center;gap:10px;font-weight:700;font-size:14px;color:var(--text-primary);">
        <span class="material-symbols-outlined" style="font-size:22px;color:var(--text-secondary);">help</span>
        What you can record as farm assets
        <span style="margin-left:auto;font-weight:500;font-size:11px;color:var(--text-muted);">Click to expand</span>
      </summary>
      <div style="padding:0 20px 20px;border-top:1px solid var(--border-subtle);">
        <p style="font-size:12px;color:var(--text-secondary);margin:14px 0 12px;line-height:1.5;">
          Coffee Estate OS does not include a separate balance-sheet or depreciation module. Farm inventory and operational records overlap with what many farms call “assets,” but figures here are for <strong>operations</strong>, not audited book value.
        </p>
        <p style="font-size:11px;font-weight:700;color:var(--text-primary);margin:0 0 8px;">Inventory categories (this screen)</p>
        <table class="data-table" style="font-size:11px;margin-bottom:14px;">
          <thead><tr><th>Category</th><th>Typical use</th></tr></thead>
          <tbody>
            ${INVENTORY_CATEGORIES.map(
                c => `<tr><td><span class="badge muted">${c}</span></td><td>${INVENTORY_CATEGORY_HELP[c] || '—'}</td></tr>`
            ).join('')}
          </tbody>
        </table>
        <p style="font-size:11px;color:var(--text-secondary);margin:0 0 8px;line-height:1.5;">
          <strong>Land &amp; coffee in the field</strong> — blocks, nursery, mother gardens, shade trees, and processing batches describe operations and production; they are not a titled-land register or biological-asset accounting.
        </p>
        <p style="font-size:11px;color:var(--text-secondary);margin:0 0 8px;line-height:1.5;">
          <strong>Farm finance</strong> — revenue and expense lines are cash-style P&amp;L. A major purchase can appear as an expense when paid; the same item may also be listed here with unit value for visibility. The app does not automatically link finance entries to inventory lines.
        </p>
        <p style="font-size:11px;color:var(--text-muted);margin:0;line-height:1.45;">
          Formal fixed assets, depreciation schedules, and purchase-to-inventory links are not built in today; use external accounting if you need audited balances.
        </p>
      </div>
    </details>

    <div class="section-card">
      <div class="card-header">
        <h2 class="card-title">Inventory Register</h2>
        <div style="display:flex;gap:8px;">
          <select class="form-select select-sm" style="width:140px;" id="cat-filter">
            <option value="all">All Categories</option>
            ${INVENTORY_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Item Name</th>
            <th>Category</th>
            <th>Stock Level</th>
            <th>Location</th>
            <th>Condition</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="inv-table-body">
          ${items.length === 0 ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px;">No items in inventory. Click "Add Item" to register your first asset.</td></tr>` :
            items.map(item => {
                const lowStock = item.quantity <= item.min_quantity;
                return `
                <tr data-cat="${item.category}">
                  <td>
                    <div style="font-weight:700;color:var(--text-primary);">${item.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);">${item.notes || 'No notes'}</div>
                  </td>
                  <td><span class="badge muted">${item.category}</span></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="font-weight:700;color:${lowStock ? 'var(--red-text)' : 'inherit'};">${item.quantity} ${item.unit}</span>
                      ${lowStock ? '<span class="material-symbols-outlined" style="font-size:14px;color:var(--red-text);">priority_high</span>' : ''}
                    </div>
                  </td>
                  <td>${item.location || '—'}</td>
                  <td>
                    <span class="badge ${item.condition === 'Good' ? 'green' : item.condition === 'Fair' ? 'amber' : 'red'}">
                      ${item.condition}
                    </span>
                  </td>
                  <td>
                    <button class="btn btn-ghost btn-sm delete-btn" data-id="${item.id}" style="color:var(--red-text);padding:4px;"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>
                  </td>
                </tr>
              `;
            }).join('')}
        </tbody>
      </table>
    </div>
  `;

    // ── Event Handlers ──────────────────────────────────────────
    container.querySelector('#add-inv-btn').addEventListener('click', () => openAddInventoryModal(render));

    const catFilter = container.querySelector('#cat-filter');
    catFilter.addEventListener('change', () => {
        const val = catFilter.value;
        const rows = container.querySelectorAll('#inv-table-body tr');
        rows.forEach(row => {
            if (val === 'all' || row.dataset.cat === val) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('Are you sure you want to delete this inventory item?')) {
                await dataService.deleteInventoryItem(btn.dataset.id);
                render();
            }
        });
    });
}

export { renderInventory };
