// ============================================================
// logbook.js — Manager's private logbook (Farm door)
// Tasks · Meeting minutes · Complaints / incidents ledger.
// Single-user, offline-first: the manager is the only writer.
// ============================================================
import { dataService } from '../../services/dataService.js';
import { showToast } from '../../utils/toast.js';
import { isOwnerOrAdmin } from '../../services/estateRole.js';

/**
 * Admin & owner users see the Logbook as a read-only review of what the manager
 * wrote. No Add/Edit/Delete/Done/Reopen/Resolve controls — only the information.
 */
function isReadOnly() {
  return isOwnerOrAdmin();
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s) {
  return esc(s);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return esc(s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const TABS = [
  { id: 'tasks', label: 'Tasks', icon: 'check_circle' },
  { id: 'minutes', label: 'Meeting minutes', icon: 'edit_note' },
  { id: 'complaints', label: 'Complaints & incidents', icon: 'report' },
];

let activeTab = 'tasks';
let tasksAbort = null;
let minutesAbort = null;
let complaintsAbort = null;

// ── Shared modal helpers ─────────────────────────────────────

function mountModal(html) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = html;
  document.body.appendChild(backdrop);
  const close = () => {
    if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
  };
  backdrop.querySelector('.modal-close')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  return { backdrop, close };
}

function blockOptions(blocks, selected) {
  return ['<option value="">— none —</option>']
    .concat(
      (blocks || []).map(
        (b) => `<option value="${escAttr(b.id)}"${String(b.id) === String(selected || '') ? ' selected' : ''}>${esc(b.name || b.id)}</option>`
      )
    )
    .join('');
}

function workerOptions(workers, selected) {
  return ['<option value="">— none —</option>']
    .concat(
      (workers || []).map(
        (w) => `<option value="${w.id}"${Number(w.id) === Number(selected) ? ' selected' : ''}>${esc(w.name)}</option>`
      )
    )
    .join('');
}

// ── Tasks ────────────────────────────────────────────────────

const PRIORITY_META = {
  high: { label: 'High', color: 'var(--red-text, #b91c1c)' },
  normal: { label: 'Normal', color: 'var(--text-secondary)' },
  low: { label: 'Low', color: 'var(--text-muted)' },
};

function taskStatusBadge(status) {
  if (status === 'done') return `<span class="badge badge-success" style="font-size:10px;">Done</span>`;
  if (status === 'in_progress') return `<span class="badge" style="font-size:10px;background:var(--gold-bg);color:var(--gold-text);">In progress</span>`;
  if (status === 'cancelled') return `<span class="badge" style="font-size:10px;background:var(--bg-surface);color:var(--text-muted);">Cancelled</span>`;
  return `<span class="badge" style="font-size:10px;background:var(--bg-surface);color:var(--text-secondary);">Open</span>`;
}

function overdueBadge(dueDate, status) {
  if (!dueDate || status === 'done' || status === 'cancelled') return '';
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (d < now) {
    return `<span class="badge" style="font-size:10px;background:var(--red-bg, #fee2e2);color:var(--red-text, #b91c1c);margin-left:6px;">Overdue</span>`;
  }
  return '';
}

function openAddTaskModal(blocks, workers, onSaved) {
  const { backdrop, close } = mountModal(`
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">New task</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Task</label>
          <input type="text" class="form-input" id="lg-task-title" placeholder="e.g. Weed BLOCK B" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">Details (optional)</label>
          <textarea class="form-input" id="lg-task-details" rows="3" placeholder="Any context — materials needed, who to call…"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Due date</label>
            <input type="date" class="form-input" id="lg-task-due" value="${today()}">
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select class="form-select" id="lg-task-priority">
              <option value="normal" selected>Normal</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Block (optional)</label>
            <select class="form-select" id="lg-task-block">${blockOptions(blocks)}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Person (optional)</label>
            <select class="form-select" id="lg-task-worker">${workerOptions(workers)}</select>
          </div>
        </div>
        <p id="lg-task-error" style="color:var(--red-text);font-size:11px;display:none;margin:0;"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>
          <span class="material-symbols-outlined">add_task</span> Save task
        </button>
      </div>
    </div>
  `);

  backdrop.querySelector('[data-cancel]').addEventListener('click', close);
  backdrop.querySelector('[data-save]').addEventListener('click', async () => {
    const title = backdrop.querySelector('#lg-task-title').value.trim();
    const errEl = backdrop.querySelector('#lg-task-error');
    if (!title) {
      errEl.style.display = 'block';
      errEl.textContent = 'Please describe the task.';
      return;
    }
    const payload = {
      title,
      details: backdrop.querySelector('#lg-task-details').value.trim() || null,
      due_date: backdrop.querySelector('#lg-task-due').value || null,
      priority: backdrop.querySelector('#lg-task-priority').value,
      block_id: backdrop.querySelector('#lg-task-block').value || null,
      worker_id: backdrop.querySelector('#lg-task-worker').value || null,
    };
    await dataService.addLogbookTask(payload);
    close();
    showToast('Task saved.');
    if (onSaved) onSaved();
  });
}

function openCompleteTaskModal(task, onSaved) {
  const { backdrop, close } = mountModal(`
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Mark task done</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <p class="form-label" style="margin:0 0 6px;">${esc(task.title)}</p>
        <div class="form-group">
          <label class="form-label">Completion note (optional)</label>
          <textarea class="form-input" id="lg-task-done-note" rows="3" placeholder="What was done, any follow-up…"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>
          <span class="material-symbols-outlined">check</span> Mark done
        </button>
      </div>
    </div>
  `);
  backdrop.querySelector('[data-cancel]').addEventListener('click', close);
  backdrop.querySelector('[data-save]').addEventListener('click', async () => {
    const note = backdrop.querySelector('#lg-task-done-note').value.trim();
    await dataService.completeLogbookTask(task.id, note);
    close();
    showToast('Task completed.');
    if (onSaved) onSaved();
  });
}

async function renderTasks(container) {
  const review = isReadOnly();
  const [tasks, blocksData, workforceData] = await Promise.all([
    dataService.getLogbookTasks(),
    dataService.getBlocks().catch(() => []),
    dataService.getWorkforce().catch(() => ({ departments: [] })),
  ]);
  const blocks = blocksData || [];
  const workers = workforceData?.departments || [];

  const emptyColspan = review ? 5 : 6;
  const rows = tasks.length
    ? tasks
        .map((t) => {
          const pm = PRIORITY_META[t.priority] || PRIORITY_META.normal;
          const isDone = t.status === 'done';
          return `
          <tr data-task-id="${t.id}">
            <td style="white-space:nowrap;">${fmtDate(t.due_date)} ${overdueBadge(t.due_date, t.status)}</td>
            <td>
              <div class="strong" style="${isDone ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">${esc(t.title)}</div>
              ${t.details ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px;">${esc(t.details)}</div>` : ''}
              ${t.completion_note ? `<div style="font-size:11px;color:var(--green-text);margin-top:3px;">Done: ${esc(t.completion_note)}</div>` : ''}
            </td>
            <td><span style="color:${pm.color};font-weight:600;">${pm.label}</span></td>
            <td>${t.block_name ? esc(t.block_name) : (t.worker_name ? esc(t.worker_name) : '—')}</td>
            <td>${taskStatusBadge(t.status)}</td>
            ${
              review
                ? ''
                : `<td style="white-space:nowrap;text-align:right;">
              ${
                isDone
                  ? `<button class="btn btn-ghost btn-sm" data-reopen="${t.id}"><span class="material-symbols-outlined" style="font-size:14px;">undo</span> Reopen</button>`
                  : `<button class="btn btn-primary btn-sm" data-done="${t.id}"><span class="material-symbols-outlined" style="font-size:14px;">check</span> Done</button>`
              }
              <button class="btn btn-ghost btn-sm" data-delete="${t.id}" title="Delete"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>
            </td>`
            }
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="${emptyColspan}" style="text-align:center;color:var(--text-muted);padding:28px;">${
        review
          ? 'No tasks recorded yet.'
          : 'No tasks yet. Use <strong>Add task</strong> to record what needs doing on the farm.'
      }</td></tr>`;

  container.innerHTML = `
    <div class="section-card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <h2 class="card-title">${review ? 'To-do list' : 'To-do list'}</h2>
          <span style="font-size:11px;color:var(--text-muted);">${
            review
              ? 'What the manager is working on at the farm.'
              : 'Private manager reminders — workers are not notified.'
          }</span>
        </div>
        ${review ? '' : '<button class="btn btn-primary" id="lg-task-add"><span class="material-symbols-outlined">add</span> Add task</button>'}
      </div>
      <table class="data-table">
        <thead>
          <tr><th style="width:140px;">Due</th><th>Task</th><th>Priority</th><th>Block / person</th><th>Status</th>${review ? '' : '<th></th>'}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  if (tasksAbort) tasksAbort.abort();
  tasksAbort = new AbortController();
  const { signal } = tasksAbort;

  if (review) return;

  container.querySelector('#lg-task-add').addEventListener(
    'click',
    () => {
      openAddTaskModal(blocks, workers, () => renderTasks(container));
    },
    { signal }
  );

  container.addEventListener(
    'click',
    async (e) => {
      const doneBtn = e.target.closest('[data-done]');
      if (doneBtn && container.contains(doneBtn)) {
        const id = Number(doneBtn.dataset.done);
        const task = tasks.find((t) => Number(t.id) === id);
        if (task) openCompleteTaskModal(task, () => renderTasks(container));
        return;
      }
      const reopenBtn = e.target.closest('[data-reopen]');
      if (reopenBtn && container.contains(reopenBtn)) {
        await dataService.reopenLogbookTask(Number(reopenBtn.dataset.reopen));
        showToast('Task reopened.');
        return renderTasks(container);
      }
      const delBtn = e.target.closest('[data-delete]');
      if (delBtn && container.contains(delBtn)) {
        if (!confirm('Delete this task?')) return;
        await dataService.deleteLogbookTask(Number(delBtn.dataset.delete));
        showToast('Task deleted.');
        return renderTasks(container);
      }
    },
    { signal }
  );
}

// ── Meeting minutes ──────────────────────────────────────────

const ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*,audio/*,application/pdf';
const ATTACHMENT_MAX_MB = 40;

function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function mimeIconName(mime, fileName) {
  const m = String(mime || '').toLowerCase();
  const ext = String(fileName || '').split('.').pop()?.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'graphic_eq';
  if (m.startsWith('video/')) return 'movie';
  if (m === 'application/pdf' || ext === 'pdf') return 'picture_as_pdf';
  if (/word|docx?$/.test(m) || ext === 'doc' || ext === 'docx') return 'description';
  if (/excel|sheet|xlsx?$/.test(m) || ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'grid_on';
  if (/powerpoint|presentation|pptx?$/.test(m) || ext === 'ppt' || ext === 'pptx') return 'slideshow';
  return 'insert_drive_file';
}

/** Try to display an attachment inline (PDF/image) or trigger download. */
async function openAttachment(att, { download = false } = {}) {
  try {
    const url = await dataService.getLogbookAttachmentBlobUrl(att.id);
    if (download) {
      const a = document.createElement('a');
      a.href = url;
      a.download = att.file_name || `attachment-${att.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      window.open(url, '_blank', 'noopener');
    }
    // Revoke after a minute to let the browser finish loading the blob URL.
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }, 60000);
  } catch (e) {
    alert(`Could not open file: ${e.message || e}`);
  }
}

function attachmentRowHtml(att) {
  const icon = mimeIconName(att.mime_type, att.file_name);
  return `
    <div class="lg-att-row" data-att-id="${att.id}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface);">
      <span class="material-symbols-outlined" style="font-size:20px;color:var(--gold-text);flex-shrink:0;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div class="strong" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(att.file_name)}</div>
        <div style="font-size:10px;color:var(--text-muted);">${fmtBytes(att.size_bytes)} · ${fmtDate(att.uploaded_at)}</div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm lg-att-open" data-att-id="${att.id}" title="Open / view"><span class="material-symbols-outlined" style="font-size:14px;">open_in_new</span></button>
      <button type="button" class="btn btn-ghost btn-sm lg-att-dl" data-att-id="${att.id}" title="Download"><span class="material-symbols-outlined" style="font-size:14px;">download</span></button>
      <button type="button" class="btn btn-ghost btn-sm lg-att-del" data-att-id="${att.id}" title="Remove"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>
    </div>`;
}

function pendingRowHtml(pf, index) {
  return `
    <div class="lg-att-row" data-pending="${index}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px dashed var(--border-subtle);border-radius:8px;background:var(--bg-surface);">
      <span class="material-symbols-outlined" style="font-size:20px;color:var(--text-muted);flex-shrink:0;">${mimeIconName(pf.type, pf.name)}</span>
      <div style="flex:1;min-width:0;">
        <div class="strong" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pf.name)}</div>
        <div style="font-size:10px;color:var(--text-muted);">${fmtBytes(pf.size)} · pending upload</div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm lg-pending-remove" data-pending="${index}" title="Remove"><span class="material-symbols-outlined" style="font-size:14px;">close</span></button>
    </div>`;
}

function openAddMinuteModal(existing, onSaved) {
  const isEdit = !!existing;
  const m = existing || {};
  const { backdrop, close } = mountModal(`
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? 'Edit minutes' : 'New meeting / field notes'}</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" class="form-input" id="lg-min-date" value="${escAttr(m.meeting_date || today())}">
          </div>
          <div class="form-group">
            <label class="form-label">Title / subject</label>
            <input type="text" class="form-input" id="lg-min-title" value="${escAttr(m.title || '')}" placeholder="e.g. Weekly field walk">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Topics discussed</label>
          <textarea class="form-input" id="lg-min-topics" rows="4" placeholder="What was discussed…">${esc(m.topics || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Action items</label>
          <textarea class="form-input" id="lg-min-actions" rows="3" placeholder="Who will do what, by when…">${esc(m.action_items || '')}</textarea>
        </div>

        <div class="form-group" style="margin-top:4px;">
          <label class="form-label">Attachments</label>
          <p style="font-size:11px;color:var(--text-muted);margin:0 0 8px;line-height:1.4;">
            Upload minutes documents, photos of handwritten notes, signed lists, or any related file
            (PDF, Word, Excel, images — up to ${ATTACHMENT_MAX_MB} MB each). Files are stored inside the estate database.
          </p>
          <div id="lg-min-drop" style="border:2px dashed var(--border-subtle);border-radius:10px;padding:14px;text-align:center;color:var(--text-muted);cursor:pointer;font-size:12px;">
            <div><span class="material-symbols-outlined" style="vertical-align:-5px;margin-right:4px;">upload_file</span>Drop files here or click to browse</div>
          </div>
          <input type="file" id="lg-min-file-input" multiple accept="${ATTACHMENT_ACCEPT}" style="display:none;" />
          <div id="lg-min-att-list" style="display:flex;flex-direction:column;gap:6px;margin-top:10px;"></div>
          <p id="lg-min-att-error" style="color:var(--red-text);font-size:11px;display:none;margin:6px 0 0;"></p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>
          <span class="material-symbols-outlined">save</span> Save
        </button>
      </div>
    </div>
  `);

  /** Pending files (not yet uploaded — uploaded after minute row exists). */
  const pending = [];
  /** Currently-saved attachments (only meaningful in edit mode). */
  let existingAtts = [];
  const listEl = backdrop.querySelector('#lg-min-att-list');
  const dropEl = backdrop.querySelector('#lg-min-drop');
  const fileInput = backdrop.querySelector('#lg-min-file-input');
  const errEl = backdrop.querySelector('#lg-min-att-error');

  const renderAttList = () => {
    const parts = [];
    existingAtts.forEach((att) => parts.push(attachmentRowHtml(att)));
    pending.forEach((pf, i) => parts.push(pendingRowHtml(pf, i)));
    listEl.innerHTML =
      parts.length
        ? parts.join('')
        : `<div style="font-size:11px;color:var(--text-muted);">No attachments yet.</div>`;
  };

  const loadExistingAtts = async () => {
    if (!isEdit) return;
    try {
      existingAtts = await dataService.listLogbookAttachments('minute', m.id);
    } catch {
      existingAtts = [];
    }
    renderAttList();
  };

  renderAttList();
  void loadExistingAtts();

  const addFiles = (files) => {
    errEl.style.display = 'none';
    for (const f of Array.from(files || [])) {
      if (f.size > ATTACHMENT_MAX_MB * 1024 * 1024) {
        errEl.style.display = 'block';
        errEl.textContent = `"${f.name}" is larger than ${ATTACHMENT_MAX_MB} MB and was skipped.`;
        continue;
      }
      pending.push(f);
    }
    renderAttList();
  };

  dropEl.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach((evt) =>
    dropEl.addEventListener(evt, (e) => {
      e.preventDefault();
      dropEl.style.borderColor = 'var(--gold-text, #b45309)';
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropEl.addEventListener(evt, (e) => {
      e.preventDefault();
      dropEl.style.borderColor = '';
    })
  );
  dropEl.addEventListener('drop', (e) => addFiles(e.dataTransfer?.files));

  listEl.addEventListener('click', async (e) => {
    const pendingRemove = e.target.closest('.lg-pending-remove');
    if (pendingRemove) {
      const idx = Number(pendingRemove.dataset.pending);
      if (Number.isFinite(idx)) {
        pending.splice(idx, 1);
        renderAttList();
      }
      return;
    }
    const openBtn = e.target.closest('.lg-att-open');
    if (openBtn) {
      const att = existingAtts.find((a) => Number(a.id) === Number(openBtn.dataset.attId));
      if (att) openAttachment(att);
      return;
    }
    const dlBtn = e.target.closest('.lg-att-dl');
    if (dlBtn) {
      const att = existingAtts.find((a) => Number(a.id) === Number(dlBtn.dataset.attId));
      if (att) openAttachment(att, { download: true });
      return;
    }
    const delBtn = e.target.closest('.lg-att-del');
    if (delBtn) {
      if (!confirm('Remove this attachment?')) return;
      await dataService.deleteLogbookAttachment(Number(delBtn.dataset.attId));
      await loadExistingAtts();
      showToast('Attachment removed.');
    }
  });

  backdrop.querySelector('[data-cancel]').addEventListener('click', close);
  const saveBtn = backdrop.querySelector('[data-save]');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const origText = saveBtn.innerHTML;
    try {
      const payload = {
        meeting_date: backdrop.querySelector('#lg-min-date').value || today(),
        title: backdrop.querySelector('#lg-min-title').value.trim() || null,
        topics: backdrop.querySelector('#lg-min-topics').value.trim() || null,
        action_items: backdrop.querySelector('#lg-min-actions').value.trim() || null,
      };
      let parentId;
      if (isEdit) {
        await dataService.updateLogbookMinute(m.id, payload);
        parentId = m.id;
      } else {
        const res = await dataService.addLogbookMinute(payload);
        parentId = Number(res?.lastInsertRowid ?? res?.lastInsertRowID ?? 0);
      }

      if (pending.length && parentId) {
        saveBtn.innerHTML = `<span class="material-symbols-outlined">upload</span> Uploading…`;
        for (let i = 0; i < pending.length; i += 1) {
          const file = pending[i];
          try {
            await dataService.uploadLogbookAttachment({
              parent_type: 'minute',
              parent_id: parentId,
              file,
            });
          } catch (e) {
            errEl.style.display = 'block';
            errEl.textContent = `"${file.name}" failed to upload: ${e.message || e}`;
            saveBtn.disabled = false;
            saveBtn.innerHTML = origText;
            return;
          }
        }
      }
      showToast(isEdit ? 'Minutes updated.' : 'Minutes saved.');
      close();
      if (onSaved) onSaved();
    } catch (e) {
      errEl.style.display = 'block';
      errEl.textContent = e.message || String(e);
      saveBtn.disabled = false;
      saveBtn.innerHTML = origText;
    }
  });
}

async function renderMinutes(container) {
  const review = isReadOnly();
  const minutes = await dataService.getLogbookMinutes();

  const attsByMinute = new Map();
  await Promise.all(
    minutes.map(async (m) => {
      try {
        const atts = await dataService.listLogbookAttachments('minute', m.id);
        attsByMinute.set(Number(m.id), atts || []);
      } catch {
        attsByMinute.set(Number(m.id), []);
      }
    })
  );

  const cards = minutes.length
    ? minutes
        .map((m) => {
          const atts = attsByMinute.get(Number(m.id)) || [];
          const attSection = atts.length
            ? `<div style="margin-top:10px;">
                 <div class="form-label" style="font-size:11px;">Attachments (${atts.length})</div>
                 <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
                   ${atts
                     .map(
                       (a) => `
                     <button type="button" class="lg-min-att-chip" data-att-id="${a.id}" title="${escAttr(a.file_name)} · ${fmtBytes(a.size_bytes)}"
                       style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--border-subtle);border-radius:999px;background:var(--bg-surface);color:var(--text-primary);font-size:11px;cursor:pointer;max-width:260px;">
                       <span class="material-symbols-outlined" style="font-size:14px;color:var(--gold-text);">${mimeIconName(a.mime_type, a.file_name)}</span>
                       <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(a.file_name)}</span>
                       <span style="color:var(--text-muted);font-size:10px;">${fmtBytes(a.size_bytes)}</span>
                     </button>`
                     )
                     .join('')}
                 </div>
               </div>`
            : '';
          return `
          <div class="section-card" style="padding:14px 16px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
              <div>
                <div class="strong">${esc(m.title || 'Meeting')} <span style="font-weight:400;color:var(--text-muted);font-size:12px;">— ${fmtDate(m.meeting_date)}</span></div>
              </div>
              ${
                review
                  ? ''
                  : `<div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="btn btn-ghost btn-sm" data-edit-min="${m.id}"><span class="material-symbols-outlined" style="font-size:14px;">edit</span> Edit</button>
                <button class="btn btn-ghost btn-sm" data-delete-min="${m.id}" title="Delete"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>
              </div>`
              }
            </div>
            ${
              m.topics
                ? `<div style="margin-top:8px;"><div class="form-label" style="font-size:11px;">Topics</div><div style="white-space:pre-wrap;font-size:12px;">${esc(m.topics)}</div></div>`
                : ''
            }
            ${
              m.action_items
                ? `<div style="margin-top:8px;"><div class="form-label" style="font-size:11px;">Action items</div><div style="white-space:pre-wrap;font-size:12px;">${esc(m.action_items)}</div></div>`
                : ''
            }
            ${attSection}
          </div>`;
        })
        .join('')
    : `<div class="section-card" style="padding:24px;text-align:center;color:var(--text-muted);">${
        review
          ? 'No meeting notes have been posted yet.'
          : 'No meeting notes yet. Use <strong>New entry</strong> to record a meeting or field walk.'
      }</div>`;

  container.innerHTML = `
    <div class="section-card" style="padding:14px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <div class="strong">Meeting minutes &amp; field notes</div>
        <div style="font-size:11px;color:var(--text-muted);">${
          review
            ? 'Chronological record of meetings, field walks, and any documents the manager attached.'
            : 'Private record for the manager and owner. Keep entries short — bullets are fine.'
        }</div>
      </div>
      ${review ? '' : '<button class="btn btn-primary" id="lg-min-add"><span class="material-symbols-outlined">edit_note</span> New entry</button>'}
    </div>
    ${cards}
  `;

  if (minutesAbort) minutesAbort.abort();
  minutesAbort = new AbortController();
  const { signal } = minutesAbort;

  container.addEventListener(
    'click',
    async (e) => {
      const attChip = e.target.closest('.lg-min-att-chip');
      if (attChip && container.contains(attChip)) {
        const attId = Number(attChip.dataset.attId);
        const allAtts = Array.from(attsByMinute.values()).flat();
        const att = allAtts.find((a) => Number(a.id) === attId);
        if (att) openAttachment(att);
        return;
      }
      if (review) return;
      const editBtn = e.target.closest('[data-edit-min]');
      if (editBtn && container.contains(editBtn)) {
        const m = minutes.find((x) => Number(x.id) === Number(editBtn.dataset.editMin));
        if (m) openAddMinuteModal(m, () => renderMinutes(container));
        return;
      }
      const delBtn = e.target.closest('[data-delete-min]');
      if (delBtn && container.contains(delBtn)) {
        if (!confirm('Delete this entry (and its attachments)?')) return;
        const mid = Number(delBtn.dataset.deleteMin);
        try {
          const atts = await dataService.listLogbookAttachments('minute', mid);
          for (const a of atts || []) {
            await dataService.deleteLogbookAttachment(a.id).catch(() => {});
          }
        } catch {
          /* ignore — best effort */
        }
        await dataService.deleteLogbookMinute(mid);
        showToast('Entry deleted.');
        return renderMinutes(container);
      }
    },
    { signal }
  );

  if (review) return;
  container.querySelector('#lg-min-add')?.addEventListener(
    'click',
    () => {
      openAddMinuteModal(null, () => renderMinutes(container));
    },
    { signal }
  );
}

// ── Complaints / incidents ───────────────────────────────────

function complaintStatusBadge(status) {
  if (status === 'resolved') return `<span class="badge badge-success" style="font-size:10px;">Resolved</span>`;
  if (status === 'cancelled') return `<span class="badge" style="font-size:10px;background:var(--bg-surface);color:var(--text-muted);">Cancelled</span>`;
  return `<span class="badge" style="font-size:10px;background:var(--red-bg, #fee2e2);color:var(--red-text, #b91c1c);">Open</span>`;
}

function openAddComplaintModal(blocks, workers, onSaved) {
  const { backdrop, close } = mountModal(`
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Record complaint / incident</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" class="form-input" id="lg-c-date" value="${today()}">
          </div>
          <div class="form-group">
            <label class="form-label">Reported by</label>
            <input type="text" class="form-input" id="lg-c-reporter" placeholder="Name or role (free text)">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Topic</label>
          <input type="text" class="form-input" id="lg-c-topic" placeholder="e.g. Missed wages, tool borrowed, dispute">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">About worker (optional)</label>
            <select class="form-select" id="lg-c-worker">${workerOptions(workers)}</select>
          </div>
          <div class="form-group">
            <label class="form-label">About block (optional)</label>
            <select class="form-select" id="lg-c-block">${blockOptions(blocks)}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Details</label>
          <textarea class="form-input" id="lg-c-notes" rows="4" placeholder="What was said, any witnesses, context…"></textarea>
        </div>
        <p id="lg-c-error" style="color:var(--red-text);font-size:11px;display:none;margin:0;"></p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>
          <span class="material-symbols-outlined">save</span> Log it
        </button>
      </div>
    </div>
  `);
  backdrop.querySelector('[data-cancel]').addEventListener('click', close);
  backdrop.querySelector('[data-save]').addEventListener('click', async () => {
    const topic = backdrop.querySelector('#lg-c-topic').value.trim();
    const notes = backdrop.querySelector('#lg-c-notes').value.trim();
    const errEl = backdrop.querySelector('#lg-c-error');
    if (!topic && !notes) {
      errEl.style.display = 'block';
      errEl.textContent = 'Add at least a topic or some details so you remember this later.';
      return;
    }
    await dataService.addLogbookComplaint({
      incident_date: backdrop.querySelector('#lg-c-date').value || today(),
      reported_by: backdrop.querySelector('#lg-c-reporter').value.trim() || null,
      about_worker_id: backdrop.querySelector('#lg-c-worker').value || null,
      about_block_id: backdrop.querySelector('#lg-c-block').value || null,
      topic: topic || null,
      notes: notes || null,
    });
    close();
    showToast('Complaint logged.');
    if (onSaved) onSaved();
  });
}

function openResolveComplaintModal(complaint, onSaved) {
  const { backdrop, close } = mountModal(`
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Resolve complaint</span>
        <button class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <p class="form-label" style="margin:0 0 6px;">${esc(complaint.topic || 'Incident')}</p>
        <div class="form-group">
          <label class="form-label">How was it resolved?</label>
          <textarea class="form-input" id="lg-c-resolution" rows="4" placeholder="What action was taken, outcome…"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>
          <span class="material-symbols-outlined">task_alt</span> Mark resolved
        </button>
      </div>
    </div>
  `);
  backdrop.querySelector('[data-cancel]').addEventListener('click', close);
  backdrop.querySelector('[data-save]').addEventListener('click', async () => {
    const resolution = backdrop.querySelector('#lg-c-resolution').value.trim();
    await dataService.resolveLogbookComplaint(complaint.id, resolution);
    close();
    showToast('Complaint resolved.');
    if (onSaved) onSaved();
  });
}

async function renderComplaints(container) {
  const review = isReadOnly();
  const [list, blocksData, workforceData] = await Promise.all([
    dataService.getLogbookComplaints(),
    dataService.getBlocks().catch(() => []),
    dataService.getWorkforce().catch(() => ({ departments: [] })),
  ]);
  const blocks = blocksData || [];
  const workers = workforceData?.departments || [];

  const emptyColspan = review ? 5 : 6;
  const rows = list.length
    ? list
        .map(
          (c) => `
          <tr data-complaint-id="${c.id}">
            <td style="white-space:nowrap;">${fmtDate(c.incident_date)}</td>
            <td>
              <div class="strong">${esc(c.topic || 'Incident')}</div>
              ${c.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px;white-space:pre-wrap;">${esc(c.notes)}</div>` : ''}
              ${c.resolution ? `<div style="font-size:11px;color:var(--green-text);margin-top:3px;"><strong>Resolution:</strong> ${esc(c.resolution)}</div>` : ''}
            </td>
            <td>${c.reported_by ? esc(c.reported_by) : '—'}</td>
            <td>${c.about_worker_name ? esc(c.about_worker_name) : (c.about_block_name ? esc(c.about_block_name) : '—')}</td>
            <td>${complaintStatusBadge(c.status)}</td>
            ${
              review
                ? ''
                : `<td style="white-space:nowrap;text-align:right;">
              ${
                c.status === 'open'
                  ? `<button class="btn btn-primary btn-sm" data-resolve="${c.id}"><span class="material-symbols-outlined" style="font-size:14px;">task_alt</span> Resolve</button>`
                  : `<button class="btn btn-ghost btn-sm" data-reopen-c="${c.id}"><span class="material-symbols-outlined" style="font-size:14px;">undo</span> Reopen</button>`
              }
              <button class="btn btn-ghost btn-sm" data-delete-c="${c.id}" title="Delete"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>
            </td>`
            }
          </tr>`
        )
        .join('')
    : `<tr><td colspan="${emptyColspan}" style="text-align:center;color:var(--text-muted);padding:28px;">${
        review
          ? 'No complaints have been recorded yet.'
          : 'No complaints logged. When a worker comes to you informally, use <strong>Log incident</strong> so you can track it later.'
      }</td></tr>`;

  container.innerHTML = `
    <div class="section-card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <h2 class="card-title">Complaints &amp; incidents ledger</h2>
          <span style="font-size:11px;color:var(--text-muted);">${
            review
              ? 'Informal complaints raised by workers at the farm, in the order they were recorded.'
              : 'Log informal complaints the moment a worker raises them.'
          }</span>
        </div>
        ${review ? '' : '<button class="btn btn-primary" id="lg-c-add"><span class="material-symbols-outlined">report</span> Log incident</button>'}
      </div>
      <table class="data-table">
        <thead>
          <tr><th style="width:110px;">Date</th><th>Topic / details</th><th>Reported by</th><th>About</th><th>Status</th>${review ? '' : '<th></th>'}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  if (complaintsAbort) complaintsAbort.abort();
  complaintsAbort = new AbortController();
  const { signal } = complaintsAbort;

  if (review) return;

  container.querySelector('#lg-c-add').addEventListener(
    'click',
    () => {
      openAddComplaintModal(blocks, workers, () => renderComplaints(container));
    },
    { signal }
  );
  container.addEventListener(
    'click',
    async (e) => {
      const resolveBtn = e.target.closest('[data-resolve]');
      if (resolveBtn && container.contains(resolveBtn)) {
        const c = list.find((x) => Number(x.id) === Number(resolveBtn.dataset.resolve));
        if (c) openResolveComplaintModal(c, () => renderComplaints(container));
        return;
      }
      const reopenBtn = e.target.closest('[data-reopen-c]');
      if (reopenBtn && container.contains(reopenBtn)) {
        await dataService.reopenLogbookComplaint(Number(reopenBtn.dataset.reopenC));
        showToast('Complaint reopened.');
        return renderComplaints(container);
      }
      const delBtn = e.target.closest('[data-delete-c]');
      if (delBtn && container.contains(delBtn)) {
        if (!confirm('Delete this record?')) return;
        await dataService.deleteLogbookComplaint(Number(delBtn.dataset.deleteC));
        showToast('Record deleted.');
        return renderComplaints(container);
      }
    },
    { signal }
  );
}

// ── Shell ────────────────────────────────────────────────────

export async function renderLogbook(container) {
  const review = isReadOnly();
  const title = review ? "Manager's logbook" : 'Logbook';
  const subtitle = review
    ? "Read-only review of your field manager's daily log — tasks, meeting notes, and informal complaints recorded at the farm."
    : "Manager's private logbook for tasks, meeting notes, and informal complaints from staff.";

  container.innerHTML = `
    <div style="margin-bottom:18px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div>
        <h1 class="page-title">${title}</h1>
        <p class="page-subtitle">${subtitle}</p>
      </div>
      ${
        review
          ? `<span class="badge" style="background:var(--bg-surface);border:1px solid var(--border-subtle);color:var(--text-secondary);font-size:11px;padding:6px 10px;"><span class="material-symbols-outlined" style="font-size:13px;vertical-align:-3px;margin-right:4px;">visibility</span>Review mode · read-only</span>`
          : ''
      }
    </div>
    <div class="pillar-tab-bar">
      ${TABS.map((t) => `
        <button class="pillar-tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
          <span class="material-symbols-outlined">${t.icon}</span>
          ${t.label}
        </button>`).join('')}
    </div>
    <div id="logbook-content"></div>
  `;

  const content = container.querySelector('#logbook-content');

  const renderTab = async (tab) => {
    activeTab = tab;
    container.querySelectorAll('.pillar-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    content.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);">Loading…</div>';
    if (tab === 'tasks') return renderTasks(content);
    if (tab === 'minutes') return renderMinutes(content);
    if (tab === 'complaints') return renderComplaints(content);
  };

  container.querySelectorAll('.pillar-tab').forEach((btn) => {
    btn.addEventListener('click', () => renderTab(btn.dataset.tab));
  });

  await renderTab(activeTab);
}
