// ============================================================
// workforce.js — Staff roster + per-person Pay (monthly SACCO sheet)
// ============================================================
import { dataService } from '../../services/dataService.js';
import { showToast } from '../../utils/toast.js';
import { openPayWorkerModal } from './payWorkerModal.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function fmtUgx(n) {
  return dataService.formatCurrency(Number(n) || 0);
}

function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const WF_DEPARTMENTS = [
  'Field Operations',
  'Processing',
  'Administration',
  'Logistics',
  'Security',
  'Maintenance',
];

function deptSelectOptions(selected) {
  const sel = String(selected || '').trim();
  const opts = [...WF_DEPARTMENTS];
  if (sel && !opts.includes(sel)) opts.unshift(sel);
  return opts.map((d) => `<option${d === sel ? ' selected' : ''}>${esc(d)}</option>`).join('');
}

const NOTE_CATEGORIES = [
  { id: 'general', label: 'General', color: 'var(--text-secondary)' },
  { id: 'complaint', label: 'Complaint', color: 'var(--red-text, #b91c1c)' },
  { id: 'warning', label: 'Warning', color: 'var(--gold-text, #b45309)' },
  { id: 'commendation', label: 'Commendation', color: 'var(--green-text, #1a5f4a)' },
  { id: 'absence', label: 'Absence', color: 'var(--text-muted)' },
];

function fmtNoteDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return esc(s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function noteCategoryMeta(id) {
  return NOTE_CATEGORIES.find((c) => c.id === id) || NOTE_CATEGORIES[0];
}

async function refreshWorkerNotes(wid, listEl) {
  const notes = await dataService.getWorkerNotes(wid);
  if (!notes.length) {
    listEl.innerHTML = `<div style="padding:10px 0;font-size:11px;color:var(--text-muted);">No notes yet.</div>`;
    return;
  }
  listEl.innerHTML = notes
    .map((n) => {
      const meta = noteCategoryMeta(n.category);
      return `
        <div style="padding:8px 0;border-top:1px solid var(--border-subtle);display:flex;gap:8px;align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;color:var(--text-muted);">
              ${fmtNoteDate(n.note_date)} · <span style="color:${meta.color};font-weight:600;">${esc(meta.label)}</span>
            </div>
            <div style="font-size:12px;white-space:pre-wrap;margin-top:2px;">${esc(n.note)}</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm wf-note-del" data-nid="${n.id}" title="Delete note">
            <span class="material-symbols-outlined" style="font-size:14px;">delete</span>
          </button>
        </div>`;
    })
    .join('');
}

function openEditWorkerModal(worker, onSaved) {
  const wid = Number(worker.id);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Staff details</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Full name</label>
          <input type="text" class="form-input" id="wf-edit-name" value="${esc(worker.name)}" placeholder="e.g. John Kamau">
        </div>
        <div class="form-group">
          <label class="form-label">Phone / contact</label>
          <input type="tel" class="form-input" id="wf-edit-contact" value="${esc(worker.contact || '')}" placeholder="e.g. +256 7…" inputmode="tel" autocomplete="tel">
          <p style="margin:4px 0 0;font-size:10px;color:var(--text-muted);">Shown on Pay sheets; syncs to SACCO phone when they are a SACCO member.</p>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Department</label>
            <select class="form-select" id="wf-edit-dept">${deptSelectOptions(worker.department)}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Employment type</label>
            <select class="form-select" id="wf-edit-type">
              <option value="Permanent"${worker.type === 'Seasonal' ? '' : ' selected'}>Permanent</option>
              <option value="Seasonal"${worker.type === 'Seasonal' ? ' selected' : ''}>Seasonal</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Monthly gross salary (UGX)</label>
            <input type="number" class="form-input tabular-nums" id="wf-edit-payroll" value="${Number(worker.payroll) || 0}" min="1" step="1" inputmode="numeric" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label">Role / title</label>
            <input type="text" class="form-input" id="wf-edit-role" value="${esc(worker.role || '')}" placeholder="e.g. Field supervisor">
          </div>
        </div>
        <label class="form-group" style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;">
          <input type="checkbox" id="wf-edit-sacco"${Number(worker.sacco_member) === 1 ? ' checked' : ''} />
          <span class="form-label" style="margin:0;">SACCO member</span>
        </label>
        <p style="font-size:11px;color:var(--text-muted);margin:0;line-height:1.4;">Member no. <code style="font-size:10px;">WF‑${wid}</code> when enrolled. Unchecking removes the linked SACCO record.</p>
        <p id="wf-edit-error" style="color:var(--red-text);font-size:11px;display:none;"></p>

        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-subtle);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span class="form-label" style="margin:0;">Notes about this person</span>
            <span style="font-size:10px;color:var(--text-muted);">Private — visible only to you and the owner.</span>
          </div>
          <div class="form-row" style="margin-bottom:6px;">
            <div class="form-group" style="flex:0 0 140px;">
              <input type="date" class="form-input" id="wf-note-date" value="${todayIso()}">
            </div>
            <div class="form-group" style="flex:0 0 150px;">
              <select class="form-select" id="wf-note-cat">
                ${NOTE_CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="flex:1;">
              <input type="text" class="form-input" id="wf-note-text" placeholder="What happened / what was said">
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-bottom:6px;">
            <button type="button" class="btn btn-ghost btn-sm" id="wf-note-add">
              <span class="material-symbols-outlined" style="font-size:14px;">add</span> Add note
            </button>
          </div>
          <div id="wf-note-list" style="max-height:180px;overflow-y:auto;"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="wf-edit-cancel">Cancel</button>
        <button class="btn btn-primary" id="wf-edit-save">
          <span class="material-symbols-outlined">save</span> Save changes
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const noteList = backdrop.querySelector('#wf-note-list');
  refreshWorkerNotes(wid, noteList).catch(() => {});

  backdrop.querySelector('#wf-note-add').addEventListener('click', async () => {
    const text = backdrop.querySelector('#wf-note-text').value.trim();
    if (!text) return;
    const category = backdrop.querySelector('#wf-note-cat').value;
    const note_date = backdrop.querySelector('#wf-note-date').value || todayIso();
    await dataService.addWorkerNote({ worker_id: wid, note_date, category, note: text });
    backdrop.querySelector('#wf-note-text').value = '';
    showToast('Note added.');
    refreshWorkerNotes(wid, noteList);
  });

  noteList.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.wf-note-del');
    if (!delBtn) return;
    if (!confirm('Delete this note?')) return;
    await dataService.deleteWorkerNote(Number(delBtn.dataset.nid));
    showToast('Note deleted.');
    refreshWorkerNotes(wid, noteList);
  });

  const close = () => document.body.removeChild(backdrop);
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#wf-edit-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  backdrop.querySelector('#wf-edit-save').addEventListener('click', async () => {
    const name = backdrop.querySelector('#wf-edit-name').value.trim();
    const contact = backdrop.querySelector('#wf-edit-contact').value.trim();
    const department = backdrop.querySelector('#wf-edit-dept').value;
    const type = backdrop.querySelector('#wf-edit-type').value;
    const payRaw = backdrop.querySelector('#wf-edit-payroll').value.trim();
    const payroll = payRaw === '' ? NaN : parseFloat(payRaw);
    const role = backdrop.querySelector('#wf-edit-role').value.trim();
    const errEl = backdrop.querySelector('#wf-edit-error');

    errEl.style.display = 'none';
    if (!name) {
      errEl.style.display = 'block';
      errEl.textContent = "Enter the staff member's full name.";
      return;
    }
    if (!Number.isFinite(payroll) || payroll <= 0) {
      errEl.style.display = 'block';
      errEl.textContent = 'Enter their monthly gross salary in UGX (whole number, greater than zero).';
      return;
    }
    const sacco_member = !!backdrop.querySelector('#wf-edit-sacco')?.checked;
    await dataService.updateWorker(wid, {
      name,
      department,
      payroll,
      type,
      role,
      sacco_member: sacco_member ? 1 : 0,
      contact: contact || null,
    });
    close();
    showToast(`Staff updated: ${name}.`);
    if (onSaved) onSaved();
  });
}

function openAddWorkerModal(onSaved) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Add staff member</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Full name</label>
          <input type="text" class="form-input" id="wf-name" placeholder="e.g. John Kamau">
        </div>
        <div class="form-group">
          <label class="form-label">Phone / contact</label>
          <input type="tel" class="form-input" id="wf-contact" placeholder="e.g. +256 7…" inputmode="tel" autocomplete="tel">
          <p style="margin:4px 0 0;font-size:10px;color:var(--text-muted);">Used on the Pay sheet and can sync to SACCO if they join later.</p>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Department</label>
            <select class="form-select" id="wf-dept">${deptSelectOptions('Field Operations')}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Employment type</label>
            <select class="form-select" id="wf-type">
              <option value="Permanent">Permanent</option>
              <option value="Seasonal">Seasonal</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Monthly gross salary (UGX) — required</label>
            <input type="number" class="form-input tabular-nums" id="wf-payroll" placeholder="e.g. 1200000" min="1" step="1" inputmode="numeric" autocomplete="off" required>
          </div>
          <div class="form-group">
            <label class="form-label">Role / title</label>
            <input type="text" class="form-input" id="wf-role" placeholder="e.g. Field supervisor">
          </div>
        </div>
        <label class="form-group" style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;">
          <input type="checkbox" id="wf-sacco" />
          <span class="form-label" style="margin:0;">SACCO member (optional)</span>
        </label>
        <p style="font-size:11px;color:var(--text-muted);margin:0;line-height:1.4;">If checked, they get a linked SACCO record (member no. WF‑id) so payroll can post savings and loan deductions. Staff can work on the estate without joining the SACCO.</p>
        <p id="wf-error" style="color:var(--red-text);font-size:11px;display:none;"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="wf-cancel">Cancel</button>
        <button class="btn btn-primary" id="wf-save">
          <span class="material-symbols-outlined">person_add</span> Add staff
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => document.body.removeChild(backdrop);
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('#wf-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  backdrop.querySelector('#wf-save').addEventListener('click', async () => {
    const name = backdrop.querySelector('#wf-name').value.trim();
    const contact = backdrop.querySelector('#wf-contact').value.trim();
    const department = backdrop.querySelector('#wf-dept').value;
    const type = backdrop.querySelector('#wf-type').value;
    const payRaw = backdrop.querySelector('#wf-payroll').value.trim();
    const payroll = payRaw === '' ? NaN : parseFloat(payRaw);
    const supervisor = backdrop.querySelector('#wf-role').value.trim();
    const errEl = backdrop.querySelector('#wf-error');

    errEl.style.display = 'none';
    if (!name) {
      errEl.style.display = 'block';
      errEl.textContent = "Enter the staff member's full name.";
      return;
    }
    if (!Number.isFinite(payroll) || payroll <= 0) {
      errEl.style.display = 'block';
      errEl.textContent = 'Enter their monthly gross salary in UGX (whole number, greater than zero).';
      return;
    }
    const sacco_member = !!backdrop.querySelector('#wf-sacco')?.checked;
    await dataService.addWorker({ name, department, payroll, type, supervisor, sacco_member, contact });
    close();
    showToast(`Staff member saved: ${name}.`);
    if (onSaved) onSaved();
  });
}

async function renderWorkforce(container) {
  await dataService.syncSaccoMembersFromWorkforce().catch(() => {});
  const data = await dataService.getWorkforce();
  const workers = data.departments || [];

  const rosterRows =
    workers.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:28px;">No staff yet. Add staff for roster reference.</td></tr>`
      : workers
          .map((w) => {
            const inSacco = Number(w.sacco_member) === 1;
            return `
        <tr data-workforce-id="${w.id}">
          <td class="strong">
            <button type="button" class="wf-staff-name" data-wid="${w.id}" title="View or edit details">${esc(w.name)}</button>
          </td>
          <td>${esc(w.department || '—')}</td>
          <td>${esc(w.type || '—')}</td>
          <td class="tabular-nums">${fmtUgx(Number(w.payroll) || 0)}</td>
          <td style="text-align:center;">
            <input type="checkbox" class="wf-sacco-toggle" data-wid="${w.id}" title="SACCO member" ${inSacco ? 'checked' : ''} aria-label="SACCO member" />
          </td>
          <td style="white-space:nowrap;">
            <button type="button" class="btn btn-primary btn-sm wf-pay-btn" data-wid="${w.id}">
              <span class="material-symbols-outlined" style="font-size:16px;">payments</span> Pay
            </button>
          </td>
        </tr>`;
          })
          .join('');

  container.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;">
      <div>
        <h1 class="page-title">Workers</h1>
        <p class="page-subtitle">Add each person with their <strong>monthly gross</strong> in UGX. SACCO is optional — tick <strong>SACCO</strong> to link a member (no. <code style="font-size:10px;">WF‑…</code>). Use <strong>Pay</strong> to record salary paid for the current month.</p>
      </div>
      <button class="btn btn-primary" id="add-worker-btn" type="button">
        <span class="material-symbols-outlined">person_add</span> Add staff
      </button>
    </div>

    <div class="kpi-grid" style="margin-bottom:16px;">
      <div class="kpi-card"><div class="kpi-label">Headcount</div><div class="kpi-value">${workers.length || data.totalWorkers}</div></div>
      <div class="kpi-card"><div class="kpi-label">Permanent</div><div class="kpi-value green">${workers.filter((w) => w.type === 'Permanent').length || data.permanent}</div></div>
      <div class="kpi-card"><div class="kpi-label">Seasonal</div><div class="kpi-value">${workers.filter((w) => w.type === 'Seasonal').length || data.seasonal}</div></div>
      <div class="kpi-card gold-border"><div class="kpi-label">Roster payroll (gross)</div><div class="kpi-value gold">${fmtUgx(workers.reduce((s, w) => s + (Number(w.payroll) || 0), 0))}</div></div>
    </div>

    <div class="section-card" style="margin-bottom:22px;">
      <div class="card-header">
        <h2 class="card-title">Staff roster</h2>
        <span style="font-size:11px;color:var(--text-muted);">${workers.length} people</span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th><th>Department</th><th>Type</th><th class="tabular-nums">Monthly gross</th><th title="SACCO member">SACCO</th><th style="width:1%;">Pay</th>
          </tr>
        </thead>
        <tbody id="wf-roster-body">${rosterRows}</tbody>
      </table>
    </div>
  `;

  container.querySelector('#add-worker-btn')?.addEventListener('click', () => {
    openAddWorkerModal(() => renderWorkforce(container));
  });

  container.querySelector('#wf-roster-body')?.addEventListener('change', async (e) => {
    const cb = e.target.closest('.wf-sacco-toggle');
    if (!cb || !container.contains(cb)) return;
    const id = Number(cb.dataset.wid);
    const checked = cb.checked;
    try {
      await dataService.updateWorker(id, { sacco_member: checked ? 1 : 0 });
    } catch (err) {
      cb.checked = !checked;
      alert(err.message || String(err));
    }
  });

  container.querySelector('#wf-roster-body')?.addEventListener('click', (e) => {
    const nameBtn = e.target.closest('.wf-staff-name');
    if (nameBtn && container.contains(nameBtn)) {
      const id = Number(nameBtn.dataset.wid);
      const worker = workers.find((x) => Number(x.id) === id);
      if (worker) {
        openEditWorkerModal(worker, () => renderWorkforce(container));
      }
      return;
    }
    const btn = e.target.closest('.wf-pay-btn');
    if (!btn || !container.contains(btn)) return;
    const id = Number(btn.dataset.wid);
    const worker = workers.find((x) => Number(x.id) === id);
    if (!worker) return;
    const ym = ymNow();
    openPayWorkerModal({
      worker,
      yearMonth: ym,
      onSaved: async () => {
        await renderWorkforce(container);
      },
    });
  });

}

export { renderWorkforce };
