// ============================================================
// maintenanceRates.js — bundled default rates (editable) + budget rollup
// Professional fee (fixed monthly): allocation whole_farm (farm-level, not per acre)
// ============================================================
import { dataService, FINANCE_CATEGORIES } from '../../services/dataService.js';
import { showToast } from '../../utils/toast.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

/**
 * Build &lt;select&gt; options for expense category. If `ensureName` is not in the taxonomy,
 * it is added under group "Maintenance" so activity-specific labels (e.g. Watering) can be selected.
 */
function buildExpenseCategoryOptions(selectedName, ensureName) {
  const base = FINANCE_CATEGORIES.Expense || [];
  const seen = new Set(base.map((c) => c.name));
  const extra = [];
  const en = String(ensureName || '').trim();
  if (en && !seen.has(en)) {
    extra.push({ name: en, group: 'Maintenance' });
  }
  const cats = [...base, ...extra];
  const groups = {};
  cats.forEach((c) => {
    if (!groups[c.group]) groups[c.group] = [];
    if (!groups[c.group].includes(c.name)) groups[c.group].push(c.name);
  });
  return Object.entries(groups)
    .map(
      ([g, items]) => `
      <optgroup label="${esc(g)}">
        ${items
          .map(
            (name) =>
              `<option value="${escAttr(name)}" ${name === selectedName ? 'selected' : ''}>${esc(name)}</option>`
          )
          .join('')}
      </optgroup>`
    )
    .join('');
}

/**
 * Post a farm expense tagged with maintenance_activity_key (updates rate card “Actual” column).
 */
function buildRateCardHintHtml({ rateUgx, unit, defaultAmount }) {
  const r = Number(rateUgx) || 0;
  const sug = Math.max(0, Math.round(Number(defaultAmount) || 0));
  const unitStr = String(unit || '').trim();
  if (unitStr === 'per_acre') {
    return `<p style="font-size:11px;color:var(--text-muted);margin:0 0 8px;line-height:1.45;">
      <strong style="color:var(--text-primary);">Default cost (rate card):</strong>
      ${dataService.formatCurrency(r)} per acre.
      <span style="display:block;margin-top:4px;">
        Suggested farm total: <strong>${dataService.formatCurrency(sug)}</strong> (rate × total acres on the farm).
      </span>
      <span style="display:block;margin-top:4px;">
        Use <strong>Acres covered</strong> below to set amount = rate × acres (e.g. one block or a partial payment).
      </span>
    </p>`;
  }
  if (unitStr === 'fixed_monthly') {
    return `<p style="font-size:11px;color:var(--text-muted);margin:0 0 8px;line-height:1.45;">
      <strong style="color:var(--text-primary);">Default cost (rate card):</strong>
      ${dataService.formatCurrency(r)} per month (whole farm).
      <span style="display:block;margin-top:4px;">
        Suggested amount: <strong>${dataService.formatCurrency(sug)}</strong>.
      </span>
    </p>`;
  }
  return '';
}

async function openRecordMaintenanceExpenseModal(
  { lineId, activityKey, label, defaultAmount, rateUgx, unit },
  onSaved
) {
  const blocks = await dataService.getBlocks().catch(() => []);
  const today = new Date().toISOString().slice(0, 10);
  const activityLabel = String(label || '').trim();
  const defaultCat = activityLabel || 'Other Expense';
  const rateHintHtml = buildRateCardHintHtml({ rateUgx, unit, defaultAmount });
  const isPerAcre = String(unit || '').trim() === 'per_acre';
  const blockOpts =
    '<option value="">— Whole farm / not block-specific —</option>' +
    blocks
      .map((b) => {
        const idAttr = String(b.id ?? '').replace(/"/g, '&quot;');
        const ac = Number(b.acres) || 0;
        const label = `${b.name || b.id} — ${ac} ac`;
        return `<option value="${idAttr}" data-acres="${ac}">${esc(label)}</option>`;
      })
      .join('');
  const farmDefaultAmt = Math.max(0, Math.round(Number(defaultAmount) || 0));
  const rateNum = Number(rateUgx) || 0;
  const acresFieldHtml = isPerAcre
    ? `
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Acres covered (optional)</label>
          <input type="number" class="form-input tabular-nums" id="mpe-acres" min="0" step="0.01" placeholder="e.g. 10" autocomplete="off" />
          <p id="mpe-acres-computed" style="display:none;font-size:11px;color:var(--text-muted);margin:6px 0 0;line-height:1.45;"></p>
        </div>`
    : '';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header">
        <span class="modal-title">Record maintenance payment</span>
        <button type="button" class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <p style="font-size:11px;color:var(--text-muted);margin:0 0 12px;line-height:1.45;">
          Posts to <strong>Farm finance</strong> as an expense with activity tag <code style="font-size:10px;">${esc(activityKey)}</code> for maintenance reporting and the farm ledger.
        </p>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Category</label>
          <select class="form-select" id="mpe-cat">${buildExpenseCategoryOptions(defaultCat, activityLabel)}</select>
        </div>
        ${rateHintHtml}
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Block (optional)</label>
          <select class="form-select" id="mpe-block">${blockOpts}</select>
          <p style="font-size:10px;color:var(--text-muted);margin:6px 0 0;line-height:1.4;">
            List is your <strong>block register</strong> (same as the farm map). To fix names or acreage, use
            <strong>Farm → Operations → Block register</strong> → Edit.
            ${
              isPerAcre
                ? ' Choosing a block fills <strong>Acres covered</strong> from that row (you can edit).'
                : ''
            }
          </p>
        </div>
        ${acresFieldHtml}
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">Amount (UGX)</label>
            <input type="number" class="form-input tabular-nums" id="mpe-amt" min="0" step="1" value="${Math.max(0, Math.round(Number(defaultAmount) || 0))}" />
          </div>
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">Payment date</label>
            <input type="date" class="form-input" id="mpe-date" value="${today}" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Payment method</label>
          <select class="form-select" id="mpe-pm">
            <option value="cash">Cash</option>
            <option value="mobile_money">Mobile money</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Description</label>
          <input type="text" class="form-input" id="mpe-desc" value="${escAttr(`Maintenance: ${label || 'Activity'}`)}" />
        </div>
        <p id="mpe-err" style="display:none;color:var(--red-text);font-size:11px;margin:0;"></p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="mpe-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="mpe-save">Save expense</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => {
    try {
      document.body.removeChild(backdrop);
    } catch {
      /* ignore */
    }
  };

  backdrop.querySelector('.modal-close')?.addEventListener('click', close);
  backdrop.querySelector('#mpe-cancel')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const amtInp = backdrop.querySelector('#mpe-amt');
  const acresInp = backdrop.querySelector('#mpe-acres');
  const acresComputedEl = backdrop.querySelector('#mpe-acres-computed');
  const blockSel = backdrop.querySelector('#mpe-block');

  function applyAcresToAmount() {
    if (!isPerAcre || !amtInp) return;
    const raw = (acresInp?.value ?? '').trim();
    const acres = raw === '' ? NaN : parseFloat(raw);
    if (Number.isFinite(acres) && acres > 0 && rateNum > 0) {
      const computed = Math.round(rateNum * acres);
      amtInp.value = String(computed);
      if (acresComputedEl) {
        acresComputedEl.style.display = 'block';
        acresComputedEl.textContent = `Amount = ${dataService.formatCurrency(rateNum)} × ${acres} ac = ${dataService.formatCurrency(computed)}.`;
      }
    } else {
      amtInp.value = String(farmDefaultAmt);
      if (acresComputedEl) {
        acresComputedEl.style.display = 'none';
        acresComputedEl.textContent = '';
      }
    }
  }

  acresInp?.addEventListener('input', applyAcresToAmount);

  blockSel?.addEventListener('change', () => {
    if (!isPerAcre || !acresInp || !blockSel) return;
    const opt = blockSel.selectedOptions[0];
    const ac = opt ? parseFloat(opt.dataset.acres ?? '') : NaN;
    if (!blockSel.value || !Number.isFinite(ac) || ac <= 0) {
      acresInp.value = '';
      applyAcresToAmount();
      return;
    }
    acresInp.value = String(ac);
    applyAcresToAmount();
  });

  backdrop.querySelector('#mpe-save')?.addEventListener('click', async () => {
    const errEl = backdrop.querySelector('#mpe-err');
    errEl.style.display = 'none';
    const category = backdrop.querySelector('#mpe-cat')?.value || defaultCat;
    const amount = parseFloat(backdrop.querySelector('#mpe-amt')?.value);
    const date = backdrop.querySelector('#mpe-date')?.value;
    const payment_method = backdrop.querySelector('#mpe-pm')?.value || 'cash';
    const description = (backdrop.querySelector('#mpe-desc')?.value || '').trim();
    const block_id = (backdrop.querySelector('#mpe-block')?.value || '').trim() || undefined;
    const key = String(activityKey || '').trim();

    if (!key) {
      errEl.textContent = 'Missing activity key.';
      errEl.style.display = 'block';
      return;
    }
    if (!description || !Number.isFinite(amount) || amount <= 0 || !date) {
      errEl.textContent = 'Enter description and a valid amount and date.';
      errEl.style.display = 'block';
      return;
    }

    await dataService.addTransaction({
      category,
      description: description.slice(0, 500),
      amount,
      date,
      type: 'Expense',
      payment_method,
      maintenance_activity_key: key,
      block_id,
      source_module: 'maintenance_rate_pay',
      source_id: `pay_${lineId}_${Date.now()}`,
    });
    showToast(`Expense recorded: ${dataService.formatCurrency(amount)} · ${category}.`);
    close();
    if (onSaved) await onSaved();
  });
}

/**
 * Generic "Log expense" modal for the Maintenance tab — not tied to a rate-card line.
 * Lets the manager post any farm expense (category, amount, block, date, method, note).
 */
async function openLogExpenseModal(onSaved) {
  const blocks = await dataService.getBlocks().catch(() => []);
  const today = new Date().toISOString().slice(0, 10);
  const blockOpts =
    '<option value="">— Whole farm / not block-specific —</option>' +
    blocks
      .map((b) => {
        const idAttr = String(b.id ?? '').replace(/"/g, '&quot;');
        const ac = Number(b.acres) || 0;
        const label = `${b.name || b.id} — ${ac} ac`;
        return `<option value="${idAttr}">${esc(label)}</option>`;
      })
      .join('');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header">
        <span class="modal-title">Log expense</span>
        <button type="button" class="modal-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body">
        <p style="font-size:11px;color:var(--text-muted);margin:0 0 12px;line-height:1.45;">
          Posts to <strong>Farm finance</strong> as an expense. Use this for maintenance costs that are not on the rate card.
        </p>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Category</label>
          <select class="form-select" id="lme-cat">${buildExpenseCategoryOptions('Other Expense')}</select>
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Block (optional)</label>
          <select class="form-select" id="lme-block">${blockOpts}</select>
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">Amount (UGX)</label>
            <input type="number" class="form-input tabular-nums" id="lme-amt" min="0" step="1" placeholder="0" />
          </div>
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">Payment date</label>
            <input type="date" class="form-input" id="lme-date" value="${today}" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Payment method</label>
          <select class="form-select" id="lme-pm">
            <option value="cash">Cash</option>
            <option value="mobile_money">Mobile money</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">Description</label>
          <input type="text" class="form-input" id="lme-desc" placeholder="What was this expense for?" />
        </div>
        <p id="lme-err" style="display:none;color:var(--red-text);font-size:11px;margin:0;"></p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" id="lme-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="lme-save">Save expense</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => {
    try {
      document.body.removeChild(backdrop);
    } catch {
      /* ignore */
    }
  };

  backdrop.querySelector('.modal-close')?.addEventListener('click', close);
  backdrop.querySelector('#lme-cancel')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  backdrop.querySelector('#lme-save')?.addEventListener('click', async () => {
    const errEl = backdrop.querySelector('#lme-err');
    errEl.style.display = 'none';
    const category = backdrop.querySelector('#lme-cat')?.value || 'Other Expense';
    const amount = parseFloat(backdrop.querySelector('#lme-amt')?.value);
    const date = backdrop.querySelector('#lme-date')?.value;
    const payment_method = backdrop.querySelector('#lme-pm')?.value || 'cash';
    const description = (backdrop.querySelector('#lme-desc')?.value || '').trim();
    const block_id = (backdrop.querySelector('#lme-block')?.value || '').trim() || undefined;

    if (!description || !Number.isFinite(amount) || amount <= 0 || !date) {
      errEl.textContent = 'Enter description and a valid amount and date.';
      errEl.style.display = 'block';
      return;
    }

    await dataService.addTransaction({
      category,
      description: description.slice(0, 500),
      amount,
      date,
      type: 'Expense',
      payment_method,
      block_id,
      source_module: 'maintenance_manual_expense',
      source_id: `mexp_${Date.now()}`,
    });
    showToast(`Expense recorded: ${dataService.formatCurrency(amount)} · ${category}.`);
    close();
    if (onSaved) await onSaved();
  });
}

export async function renderMaintenanceRates(container) {
  let errMsg = '';

  const paint = async () => {
    const { lines } = await dataService.getMaintenanceRateCard();
    const rollup = await dataService.getMaintenanceBudgetRollup();

    const lineRows =
      lines.length === 0
        ? `<tr><td colspan="4" style="padding:20px;color:var(--text-muted);">No rate card. Restart the app to seed defaults, or click <strong>Reset to defaults</strong>.</td></tr>`
        : lines
            .map((ln) => {
              const estRow = rollup.activityFarmEstimates?.find((e) => e.line.id === ln.id);
              let estFarm = 0;
              if (ln.unit === 'per_acre') {
                estFarm = estRow?.estimateFarm ?? (Number(ln.rate_ugx) || 0) * (rollup.totalAcres || 0);
              } else if (ln.unit === 'fixed_monthly') {
                estFarm = Number(ln.rate_ugx) || 0;
              }
              const defAmt = Math.max(0, Math.round(estFarm));
              return `<tr data-line-id="${ln.id}">
          <td><strong>${esc(ln.label)}</strong><div style="font-size:10px;color:var(--text-muted);">${esc(ln.activity_key)}</div></td>
          <td>${ln.unit === 'per_acre' ? 'Per acre' : 'Fixed / month'}</td>
          <td><input type="number" class="form-input maint-rate-inp tabular-nums" data-id="${ln.id}" value="${Math.round(Number(ln.rate_ugx) || 0)}" min="0" step="1000" style="width:120px;" /></td>
          <td style="white-space:nowrap;">
            <button type="button" class="btn btn-primary btn-sm maint-record-pay"
              data-line-id="${ln.id}"
              data-activity-key="${escAttr(ln.activity_key)}"
              data-label="${escAttr(ln.label)}"
              data-default-amt="${defAmt}"
              data-rate-ugx="${Math.round(Number(ln.rate_ugx) || 0)}"
              data-unit="${escAttr(ln.unit || '')}">
              <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">payments</span> Pay
            </button>
          </td>
        </tr>`;
            })
            .join('');

    const blockRows =
      rollup.blockRows?.length === 0
        ? `<tr><td colspan="4" style="padding:16px;color:var(--text-muted);">No blocks — add blocks under Overview / map to use acre-based estimates.</td></tr>`
        : rollup.blockRows
            .map(
              (b) => `
      <tr>
        <td>${esc(b.name)}</td>
        <td class="tabular-nums">${Number(b.acres).toLocaleString()}</td>
        <td class="tabular-nums">${dataService.formatCurrency(b.estimatePerAcreActivities)}</td>
        <td class="tabular-nums">${dataService.formatCurrency(b.estimateFixedShare)}</td>
        <td class="tabular-nums" style="font-weight:700;">${dataService.formatCurrency(b.estimateBlock)}</td>
      </tr>`
            )
            .join('');

    container.innerHTML = `
      <div class="maint-rates-page">
        <div class="page-header" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <h1 class="page-title">Maintenance</h1>
          <button type="button" class="btn btn-primary btn-sm" id="maint-log-expense">
            <span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;">receipt_long</span> Log expense
          </button>
        </div>

        ${
          errMsg
            ? `<div class="section-card" style="margin-bottom:12px;padding:12px;border-color:var(--red);color:var(--red-text);">${esc(errMsg)}</div>`
            : ''
        }

        <div class="section-card" style="margin-bottom:14px;">
          <div class="card-header"><h2 class="card-title">Farm rollup</h2></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;padding:16px;">
            <div class="kpi-card"><div class="kpi-label">Total acres</div><div class="kpi-value">${rollup.totalAcres.toLocaleString()}</div></div>
            <div class="kpi-card"><div class="kpi-label">Per-acre activities (est.)</div><div class="kpi-value">${dataService.formatCurrency(rollup.farmPerAcreTotal)}</div></div>
            <div class="kpi-card"><div class="kpi-label">Fixed monthly (farm)</div><div class="kpi-value">${dataService.formatCurrency(rollup.farmFixedMonthly)}</div></div>
            <div class="kpi-card gold-border"><div class="kpi-label">Combined estimate</div><div class="kpi-value gold">${dataService.formatCurrency(rollup.farmGrand)}</div></div>
          </div>
        </div>

        <div class="section-card" style="margin-bottom:14px;">
          <div class="card-header" style="flex-wrap:wrap;gap:10px;">
            <h2 class="card-title">Rate card</h2>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              <button type="button" class="btn btn-primary btn-sm" id="maint-save-all"><span class="material-symbols-outlined" style="font-size:18px;">save</span> Save rates</button>
              <button type="button" class="btn btn-ghost btn-sm" id="maint-reset">Reset to defaults</button>
            </div>
          </div>
          <div style="overflow-x:auto;padding:0 12px 12px;">
            <table class="data-table" style="min-width:520px;">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Unit</th>
                  <th>Rate (UGX)</th>
                  <th style="min-width:100px;">Actions</th>
                </tr>
              </thead>
              <tbody>${lineRows}</tbody>
            </table>
          </div>
          <p style="font-size:11px;color:var(--text-muted);padding:0 12px 12px;margin:0;line-height:1.45;">
            Use <strong>Pay</strong> on a row to record an expense for that activity, or tag a maintenance activity in <strong>Farm Finance → Add transaction</strong>. The farm rollup above shows combined estimates (full farm × rate per activity).
          </p>
        </div>

        <div class="section-card">
          <div class="card-header"><h2 class="card-title">By block</h2>
            <span style="font-size:11px;color:var(--text-muted);">Per-acre sum for block acres + equal share of monthly fixed fee</span>
          </div>
          <div style="overflow-x:auto;padding:0 12px 12px;">
            <table class="data-table">
              <thead>
                <tr><th>Block</th><th>Acres</th><th>Per-acre est.</th><th>Fixed share</th><th>Block est.</th></tr>
              </thead>
              <tbody>${blockRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const saveAll = async () => {
      errMsg = '';
      for (const inp of container.querySelectorAll('.maint-rate-inp')) {
        const id = Number(inp.dataset.id);
        const rate = parseFloat(inp.value) || 0;
        await dataService.updateMaintenanceRateLine(id, { rate_ugx: rate });
      }
      await paint();
    };

    container.querySelector('#maint-log-expense')?.addEventListener('click', () => {
      openLogExpenseModal(async () => {
        await paint();
      }).catch(() => {});
    });

    container.querySelector('#maint-save-all')?.addEventListener('click', async () => {
      try {
        await saveAll();
      } catch (e) {
        errMsg = e.message || String(e);
        await paint();
      }
    });

    container.querySelector('#maint-reset')?.addEventListener('click', async () => {
      if (!confirm('Replace all maintenance rates with bundled defaults? Your edits will be lost.')) return;
      errMsg = '';
      const res = await dataService.resetMaintenanceRatesToDefaults();
      if (!res.ok) {
        errMsg = res.error || 'Reset failed';
      }
      await paint();
    });

    container.querySelectorAll('.maint-record-pay').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lineId = Number(btn.dataset.lineId);
        const activityKey = btn.dataset.activityKey || '';
        const label = btn.dataset.label || '';
        const defaultAmount = parseFloat(btn.dataset.defaultAmt) || 0;
        const rateUgx = parseFloat(btn.dataset.rateUgx) || 0;
        const unit = btn.dataset.unit || '';
        openRecordMaintenanceExpenseModal(
          { lineId, activityKey, label, defaultAmount, rateUgx, unit },
          async () => {
            await paint();
          }
        );
      });
    });
  };

  await paint();
}
