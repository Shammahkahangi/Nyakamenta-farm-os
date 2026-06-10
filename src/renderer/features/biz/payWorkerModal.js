// ============================================================
// payWorkerModal.js — Single staff monthly pay (from roster "Pay")
// Records salary payment only (gross = amount paid; no SACCO/loan UI).
// ============================================================
import { dataService } from '../../services/dataService.js';
import { showToast } from '../../utils/toast.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function fmtUgx(n) {
  return dataService.formatCurrency(Number(n) || 0);
}

/** Local calendar date (avoid UTC day shift from toISOString()). */
function isoDateLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ymLabel(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/**
 * @param {{ worker: object, yearMonth: string, onSaved?: () => void }} opts
 */
export async function openPayWorkerModal({ worker, yearMonth, onSaved }) {
  let run = null;
  let line = null;
  let readOnly = false;

  try {
    const ensured = await dataService.ensurePayrollLineForWorker(yearMonth, worker);
    run = ensured.run;
    line = ensured.line;
    if (!line) throw new Error('Could not open payroll line.');
    readOnly = run && (run.status === 'final' || !!run.posted_at);
  } catch (e) {
    alert(e.message || String(e));
    return;
  }

  const member = await dataService.getSaccoMemberByWorkforceId(worker.id).catch(() => null);
  /** Phone/contact: roster first, then payroll line, then linked SACCO — not editable here. */
  const resolvedContact = String(worker.contact || line.contact || member?.phone || '').trim();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const lid = line.id;

  const grossVal = () => parseFloat(backdrop.querySelector('#pw-gross')?.value) || 0;

  const updateNet = () => {
    const el = backdrop.querySelector('#pw-net');
    if (el) el.textContent = fmtUgx(grossVal());
  };

  backdrop.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header">
        <span class="modal-title">Pay — ${esc(worker.name)}</span>
        <button type="button" class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        <p style="margin:0;font-size:12px;color:var(--text-muted);">${esc(ymLabel(yearMonth))}${
    readOnly ? ' · <strong>Posted</strong> (read-only)' : ''
  }</p>
        <p style="margin:0;font-size:11px;color:var(--text-muted);line-height:1.45;">Record the salary payment for this month. Amount paid is the gross below (no deductions in this form).</p>
        <div class="form-row">
          <div class="form-group" style="flex:1;">
            <label class="form-label">Phone / contact</label>
            <div class="form-input" id="pw-contact-display" style="background:var(--bg-overlay);color:var(--text-primary);cursor:default;margin:0;">
              ${resolvedContact ? esc(resolvedContact) : '—'}
            </div>
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">Role</label>
            <input type="text" class="form-input" id="pw-position" value="${esc(line.position)}" ${readOnly ? 'disabled' : ''} />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Salary paid (UGX)</label>
          <input type="number" class="form-input tabular-nums" id="pw-gross" min="0" step="1" value="${Number(line.gross_salary) || 0}" ${readOnly ? 'disabled' : ''} />
        </div>
        <div class="form-group">
          <label class="form-label">Net pay (same as amount paid)</label>
          <div id="pw-net" class="tabular-nums" style="font-weight:700;font-size:16px;padding:8px 0;">${fmtUgx(Number(line.gross_salary) || 0)}</div>
        </div>
        <p id="pw-err" style="display:none;color:var(--red-text);font-size:11px;margin:0;"></p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="pw-cancel">Close</button>
        ${
          readOnly
            ? ''
            : `<button type="button" class="btn btn-primary" id="pw-save"><span class="material-symbols-outlined">save</span> Save</button>`
        }
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => {
    try {
      document.body.removeChild(backdrop);
    } catch {
      /* ignore */
    }
  };

  backdrop.querySelector('.modal-close')?.addEventListener('click', close);
  backdrop.querySelector('#pw-cancel')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  backdrop.querySelector('#pw-gross')?.addEventListener('input', updateNet);

  backdrop.querySelector('#pw-save')?.addEventListener('click', async () => {
    const errEl = backdrop.querySelector('#pw-err');
    errEl.style.display = 'none';
    const gross = parseFloat(backdrop.querySelector('#pw-gross')?.value) || 0;
    const payload = {
      id: lid,
      payroll_run_id: run.id,
      line_order: Number(line.line_order) || 0,
      full_name: String(worker.name || '').trim(),
      contact: resolvedContact,
      position: backdrop.querySelector('#pw-position')?.value ?? '',
      gross_salary: gross,
      sacco_saving: 0,
      sacco_book_fee: 0,
      loan_principal_ref: 0,
      loan_interest: 0,
      loan_repayment: 0,
      loan_balance_snapshot: 0,
      sacco_member_id: line.sacco_member_id != null ? Number(line.sacco_member_id) : null,
      loan_id: line.loan_id != null ? Number(line.loan_id) : null,
    };
    try {
      await dataService.savePayrollLine(payload);
      await dataService.mirrorPayrollLineToFarmFinance({
        payrollLineId: lid,
        yearMonth,
        fullName: payload.full_name,
        grossSalary: gross,
        employmentType: worker.type,
        ledgerDate: isoDateLocal(),
      });
      await dataService.updateWorker(worker.id, {
        role: String(backdrop.querySelector('#pw-position')?.value ?? '').trim(),
      });
      close();
      showToast(
        `Payment logged for ${String(worker.name || '').trim() || 'staff'} · ${ymLabel(yearMonth)}. Also added to Farm finance ledger.`
      );
      if (onSaved) onSaved();
    } catch (e) {
      errEl.style.display = 'block';
      errEl.textContent = e.message || String(e);
    }
  });

  updateNet();
}
