// ============================================================
// estate.js — Estate & Block Management Module
// ============================================================
import { dataService } from '../../services/dataService.js';

function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function genBlockId() {
  return 'BLK-' + Date.now().toString(36).toUpperCase();
}

function openAddBlockModal(onSaved) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Add New Block</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Block Name</label>
            <input type="text" class="form-input" id="blk-name" placeholder="e.g. Block F">
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="blk-status">
              <option>Active</option>
              <option>Inactive</option>
              <option>Alert</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Area (Acres)</label>
            <input type="number" class="form-input" id="blk-acres" placeholder="0.0" min="0" step="0.1">
          </div>
          <div class="form-group">
            <label class="form-label">Coffee plants (trees)</label>
            <input type="number" class="form-input" id="blk-plants" placeholder="0" min="0" step="1">
          </div>
        </div>
        <p id="blk-error" style="color:var(--red-text);font-size:11px;display:none;"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="blk-cancel">Cancel</button>
        <button class="btn btn-primary" id="blk-save">
          <span class="material-symbols-outlined">add</span> Add Block
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => document.body.removeChild(backdrop);
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#blk-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#blk-save').addEventListener('click', async () => {
    const name = backdrop.querySelector('#blk-name').value.trim();
    const status = backdrop.querySelector('#blk-status').value;
    const acres = parseFloat(backdrop.querySelector('#blk-acres').value);
    const plantCount = parseInt(backdrop.querySelector('#blk-plants').value, 10);
    const errEl = backdrop.querySelector('#blk-error');

    if (!name || isNaN(acres) || acres <= 0) {
      errEl.style.display = 'block';
      errEl.textContent = 'Block name and valid acreage are required.';
      return;
    }

    await dataService.addBlock({
      id: genBlockId(),
      name, acres, status,
      plant_count: Number.isFinite(plantCount) && plantCount >= 0 ? plantCount : 0,
    });
    close();
    if (onSaved) onSaved();
  });
}

function openEditBlockModal(block, onSaved) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Edit block</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Block name</label>
          <input type="text" class="form-input" id="eblk-name" value="${escAttr(block.name)}" placeholder="e.g. Nyakamenta A">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="eblk-status">
              <option ${block.status === 'Active' ? 'selected' : ''}>Active</option>
              <option ${block.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
              <option ${block.status === 'Alert' ? 'selected' : ''}>Alert</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Area (Acres)</label>
            <input type="number" class="form-input" id="eblk-acres" value="${block.acres || ''}" min="0" step="0.1">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Coffee plants (trees)</label>
            <input type="number" class="form-input" id="eblk-plants" value="${block.plant_count != null ? block.plant_count : 0}" min="0" step="1">
          </div>
          <div class="form-group">
            <label class="form-label">Kg Processed (Season)</label>
            <input type="number" class="form-input" id="eblk-kg" value="${block.kgProcessed || 0}" min="0">
          </div>
        </div>
        <p id="eblk-error" style="color:var(--red-text);font-size:11px;display:none;margin:0;"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="eblk-cancel">Cancel</button>
        <button class="btn btn-primary" id="eblk-save">
          <span class="material-symbols-outlined">save</span> Save Changes
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => document.body.removeChild(backdrop);
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#eblk-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#eblk-save').addEventListener('click', async () => {
    const name = backdrop.querySelector('#eblk-name').value.trim();
    const errEl = backdrop.querySelector('#eblk-error');
    errEl.style.display = 'none';
    if (!name) {
      errEl.textContent = 'Enter a block name.';
      errEl.style.display = 'block';
      return;
    }
    const status = backdrop.querySelector('#eblk-status').value;
    const acres = parseFloat(backdrop.querySelector('#eblk-acres').value);
    const kgProcessed = parseFloat(backdrop.querySelector('#eblk-kg').value) || 0;
    const plant_count = parseInt(backdrop.querySelector('#eblk-plants').value, 10);

    await dataService.updateBlock(block.id, {
      name,
      status,
      acres,
      kgProcessed,
      plant_count: Number.isFinite(plant_count) && plant_count >= 0 ? plant_count : 0,
    });
    close();
    if (onSaved) onSaved();
  });
}

async function renderEstate(container) {
  const blocks = await dataService.getBlocks();

  const render = () => renderEstate(container);

  const totalAcres = blocks.reduce((s, b) => s + (b.acres || 0), 0);
  const totalPlants = blocks.reduce((s, b) => s + Number(b.plant_count || 0), 0);
  const plantCapacity = 27000;
  const totalKg = blocks.reduce((s, b) => s + (b.kgProcessed || 0), 0);
  const statusColor = { Active: 'green', Inactive: 'muted', Alert: 'red' };

  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <h1 class="page-title">Estate Management</h1>
        <p class="page-subtitle">Block register, acreage, and seasonal performance tracking.</p>
      </div>
      <button class="btn btn-primary" id="add-block-btn">
        <span class="material-symbols-outlined">add</span> Add Block
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total Blocks</div>
        <div class="kpi-value">${blocks.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Acreage</div>
        <div class="kpi-value">${totalAcres.toFixed(1)} ac</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Coffee plants</div>
        <div class="kpi-value">${totalPlants.toLocaleString()} <small style="font-size:12px;font-weight:500;color:var(--text-muted);">/ ${plantCapacity.toLocaleString()}</small></div>
      </div>
      <div class="kpi-card gold-border">
        <div class="kpi-label">Season Kg Processed</div>
        <div class="kpi-value gold">${totalKg.toLocaleString()} kg</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Active Blocks</div>
        <div class="kpi-value green">${blocks.filter(b => b.status === 'Active').length}</div>
      </div>
    </div>

    <div class="section-card">
      <div class="card-header">
        <h2 class="card-title">Block Register</h2>
        <span style="font-size:11px;color:var(--text-muted);">${blocks.length} blocks</span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Block</th><th>Acres</th><th>Plants</th>
            <th>Kg Processed</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${blocks.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:28px;">No blocks registered yet. Click "Add Block" to start.</td></tr>`
      : blocks.map(b => `
              <tr>
                <td class="strong">${b.name}</td>
                <td class="tabular-nums">${b.acres} ac</td>
                <td class="tabular-nums">${Number(b.plant_count || 0).toLocaleString()}</td>
                <td class="tabular-nums">${(b.kgProcessed || 0).toLocaleString()} kg</td>
                <td><span class="badge ${statusColor[b.status] || 'muted'}">${b.status}</span></td>
                <td>
                  <button class="btn btn-ghost btn-sm edit-block-btn" data-id="${b.id}" style="padding:3px 8px;">
                    <span class="material-symbols-outlined" style="font-size:13px;">edit</span>
                  </button>
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#add-block-btn').addEventListener('click', () => {
    openAddBlockModal(render);
  });

  container.querySelectorAll('.edit-block-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const block = blocks.find(b => b.id === id);
      if (block) openEditBlockModal(block, render);
    });
  });
}

export { renderEstate };
