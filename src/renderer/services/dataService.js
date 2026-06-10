// ============================================================
// dataService.js — Frontend Data Layer (Renderer Process)
// Binds the UI to the SQLite backend via Electron IPC
// ============================================================

import { getEstateApi, tryGetEstateApi } from './estateApi.js';
import { isManagerRole, isSaccoLead, isLodgeLead } from './estateRole.js';

const dataService = {
    // ── Meta & Settings ──────────────────────────────────────
    async getMeta() {
        // For now, meta is still static but we could store it in a settings table
        return {
            estateAcres: 60,
            farmPlantCapacity: 27000,
            currentSeason: "2025/26 Main Season",
            selectedGrade: "Arabica AA",
            currency: "UGX",
            user: { name: "S. Mbugua", role: "Plant Manager", initials: "SM" },
        };
    },

    // ── Estate / Blocks ──────────────────────────────────────
    async getBlocks() {
        return await getEstateApi().query('SELECT * FROM blocks ORDER BY name COLLATE NOCASE, id');
    },

    async getBlock(id) {
        const results = await getEstateApi().query('SELECT * FROM blocks WHERE id = ?', [id]);
        return results[0];
    },

    // ── Batches ──────────────────────────────────────────────
    async getBatches() {
        return await getEstateApi().query(`
            SELECT batches.*, blocks.name as blockName 
            FROM batches 
            JOIN blocks ON batches.block_id = blocks.id
            ORDER BY date DESC
        `);
    },

    // ── Finance ──────────────────────────────────────────────
    async getFinanceSummary() {
        const expenses = await getEstateApi().query("SELECT SUM(amount) as total FROM finance_items WHERE type = 'Expense'");
        const revenue = await getEstateApi().query("SELECT SUM(amount) as total FROM finance_items WHERE type = 'Revenue'");
        const rev = Number(revenue[0]?.total || 0);
        const exp = Number(expenses[0]?.total || 0);

        return {
            totalRevenue: rev,
            totalExpenses: exp,
            netProfit: rev - exp,
        };
    },

    async getFinanceItems() {
        return await getEstateApi().query(`
            SELECT fi.*, b.name AS blockName
            FROM finance_items fi
            LEFT JOIN blocks b ON fi.block_id = b.id
            ORDER BY fi.date DESC, fi.id DESC
        `);
    },

    /** Ledger / SACCO amounts stored and displayed as UGX (no USD conversion). */
    formatLedgerUgx(value) {
        return this.formatCurrency(value);
    },

    normalizePaymentMethod(m) {
        const x = String(m || 'cash').toLowerCase().replace(/\s+/g, '_');
        if (x === 'mobilemoney' || x === 'mobile_money') return 'mobile_money';
        if (x === 'bank' || x === 'bank_transfer') return 'bank_transfer';
        if (x === 'cash') return 'cash';
        return 'cash';
    },

    async getFinanceItemsInRange(from, to) {
        const f = from || '1970-01-01';
        const t = to || '2099-12-31';
        return await getEstateApi().query(
            `SELECT fi.*, b.name AS blockName
             FROM finance_items fi
             LEFT JOIN blocks b ON fi.block_id = b.id
             WHERE fi.date >= ? AND fi.date <= ? ORDER BY fi.date DESC, fi.id DESC`,
            [f, t]
        );
    },

    async getFinanceSummaryForRange(from, to) {
        const f = from || '1970-01-01';
        const t = to || '2099-12-31';
        const expenses = await getEstateApi().query(
            `SELECT SUM(amount) as total FROM finance_items WHERE type = 'Expense' AND date >= ? AND date <= ?`,
            [f, t]
        );
        const revenue = await getEstateApi().query(
            `SELECT SUM(amount) as total FROM finance_items WHERE type = 'Revenue' AND date >= ? AND date <= ?`,
            [f, t]
        );
        const rev = Number(revenue[0]?.total || 0);
        const exp = Number(expenses[0]?.total || 0);
        return {
            totalRevenue: rev,
            totalExpenses: exp,
            netProfit: rev - exp,
        };
    },

    async getCashByChannel(from, to) {
        const f = from || '1970-01-01';
        const t = to || '2099-12-31';
        const rows = await getEstateApi().query(
            `SELECT COALESCE(NULLIF(TRIM(payment_method), ''), 'cash') as pm, type, SUM(amount) as total
             FROM finance_items WHERE date >= ? AND date <= ? GROUP BY pm, type`,
            [f, t]
        );
        const methods = ['cash', 'mobile_money', 'bank_transfer'];
        const out = {};
        methods.forEach((m) => {
            out[m] = { revenue: 0, expense: 0, net: 0 };
        });
        for (const r of rows) {
            let pm = String(r.pm || 'cash').toLowerCase();
            if (!methods.includes(pm)) pm = 'cash';
            const v = Number(r.total) || 0;
            if (r.type === 'Revenue') out[pm].revenue += v;
            else if (r.type === 'Expense') out[pm].expense += v;
        }
        methods.forEach((m) => {
            out[m].net = out[m].revenue - out[m].expense;
        });
        return out;
    },

    async getFinanceByCategory() {
        return await getEstateApi().query(`
            SELECT category, type,
                   SUM(amount) as total,
                   COUNT(*) as count
            FROM finance_items
            GROUP BY category, type
            ORDER BY total DESC
        `);
    },

    // ── Inventory ─────────────────────────────────────────────
    async getInventory() {
        return await getEstateApi().query('SELECT * FROM inventory ORDER BY category, name');
    },

    async getInventoryAlerts() {
        return await getEstateApi().query(
            "SELECT * FROM inventory WHERE quantity <= min_quantity OR condition IN ('Needs Repair','Condemned')"
        );
    },

    async addInventoryItem({ name, category, unit, quantity, min_quantity, condition, location, purchase_date, last_service, unit_value, notes }) {
        return await getEstateApi().execute(
            `INSERT INTO inventory (name, category, unit, quantity, min_quantity, condition, location, purchase_date, last_service, unit_value, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, category, unit, quantity || 0, min_quantity || 0, condition || 'Good', location || '', purchase_date || '', last_service || '', unit_value || 0, notes || '']
        );
    },

    async updateInventoryItem(id, fields) {
        const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
        const vals = [...Object.values(fields), id];
        return await getEstateApi().execute(`UPDATE inventory SET ${sets} WHERE id = ?`, vals);
    },

    async deleteInventoryItem(id) {
        return await getEstateApi().execute('DELETE FROM inventory WHERE id = ?', [id]);
    },

    // ── Workforce ────────────────────────────────────────────
    async getWorkforce() {
        const departments = await getEstateApi().query(
            'SELECT * FROM workforce ORDER BY name COLLATE NOCASE'
        );
        const rows = Array.isArray(departments) ? departments : [];
        let permanent = 0;
        let seasonal = 0;
        for (const w of rows) {
            const t = String(w.type || '');
            if (t === 'Permanent') permanent += 1;
            else if (t === 'Seasonal') seasonal += 1;
        }
        const payrollMtd = rows.reduce((s, w) => s + (Number(w.payroll) || 0), 0);
        return {
            totalWorkers: rows.length,
            permanent,
            seasonal,
            departments: rows,
            payrollMtd
        };
    },

    // ── AI Insights ──────────────────────────────────────────
    async getInsights() {
        return await getEstateApi().query('SELECT * FROM insights');
    },

    /** Live dashboard bullets (UGX-only metrics; not the static `insights` table). */
    async getComputedDashboardInsights() {
        const blocks = await this.getBlocks();
        const batches = await getEstateApi().query(`
            SELECT batches.*, blocks.name as blockName
            FROM batches
            LEFT JOIN blocks ON batches.block_id = blocks.id
        `);
        const financeItems = await this.getFinanceItems();
        const contracts = await this.getContracts();

        const monthKey = (dateLike) => {
            const d = new Date(dateLike);
            if (Number.isNaN(d.getTime())) return null;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        };
        const now = new Date();
        const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

        const kgByBlock = batches.reduce((acc, b) => {
            const id = b.block_id;
            if (!id) return acc;
            acc[id] = (acc[id] || 0) + Number(b.kgOut || 0);
            return acc;
        }, {});

        const fmtUgx = (n) => `UGX ${Math.round(Number(n) || 0).toLocaleString()}`;

        const insights = [];
        let nid = 1;
        const push = (row) => insights.push({ id: nid++, ...row });

        // 1) Weakest block vs season average kg/ac (producing blocks only)
        const producing = blocks
            .map((b) => {
                const kg = kgByBlock[b.id] || 0;
                const acres = Number(b.acres) || 0;
                const ypa = acres > 0 ? kg / acres : 0;
                return { ...b, kg, acres, ypa };
            })
            .filter((b) => b.kg > 0 && b.acres > 0);

        if (producing.length >= 2) {
            const meanYpa = producing.reduce((s, b) => s + b.ypa, 0) / producing.length;
            const worst = producing.reduce((a, b) => (a.ypa <= b.ypa ? a : b));
            const pctVsAvg = meanYpa > 0 ? ((worst.ypa - meanYpa) / meanYpa) * 100 : 0;
            if (pctVsAvg < -3) {
                push({
                    severity: 'Warning',
                    module: 'Estate',
                    title: `${worst.name} yield below block average`,
                    body: `This block is ${Math.abs(pctVsAvg).toFixed(1)}% under the season average kg/ac across producing blocks. Review canopy, nutrition, and harvest timing.`,
                    metric: `${pctVsAvg >= 0 ? '+' : ''}${pctVsAvg.toFixed(1)}% vs season avg kg/ac`,
                });
            }
        }

        // 2) Labor expense vs green-bean output (month over month)
        const laborLike = (cat) => /labor|wage|payroll|picker/i.test(String(cat || ''));
        const monthLabor = { [currentKey]: 0, [prevKey]: 0 };
        const monthKgOut = { [currentKey]: 0, [prevKey]: 0 };
        for (const item of financeItems) {
            const k = monthKey(item.date);
            if (!k || item.type !== 'Expense') continue;
            if (laborLike(item.category) || laborLike(item.description)) {
                monthLabor[k] = (monthLabor[k] || 0) + Number(item.amount || 0);
            }
        }
        for (const b of batches) {
            const k = monthKey(b.date);
            if (!k) continue;
            monthKgOut[k] = (monthKgOut[k] || 0) + Number(b.kgOut || 0);
        }
        const curL = monthLabor[currentKey] || 0;
        const prevL = monthLabor[prevKey] || 0;
        const curK = monthKgOut[currentKey] || 0;
        const prevK = monthKgOut[prevKey] || 0;
        if (prevL > 0 && prevK > 0) {
            const costDelta = ((curL - prevL) / prevL) * 100;
            const yieldDelta = ((curK - prevK) / prevK) * 100;
            if (costDelta > 3 && costDelta > yieldDelta + 2) {
                const unitLaborCur = curK > 0 ? curL / curK : 0;
                const unitLaborPrev = prevK > 0 ? prevL / prevK : 0;
                const unitDeltaPct = unitLaborPrev > 0 ? ((unitLaborCur - unitLaborPrev) / unitLaborPrev) * 100 : 0;
                push({
                    severity: 'Warning',
                    module: 'Finance',
                    title: 'Labor spend outpacing output',
                    body: 'Labor-related expenses grew faster than green-bean output month-over-month. Consider rostering, piece-rate review, or harvest scheduling.',
                    metric: `${costDelta >= 0 ? '+' : ''}${costDelta.toFixed(1)}% labor cost vs ${yieldDelta >= 0 ? '+' : ''}${yieldDelta.toFixed(1)}% kg out` +
                        (unitLaborCur > 0 ? ` · ${fmtUgx(unitLaborCur)}/kg this month` : ''),
                });
            }
        }

        // 3) Drying / moisture risk batches
        const moistureRisk = batches.filter((b) => {
            const m = Number(b.moisture);
            return !Number.isNaN(m) && m > 14;
        });
        // Only flag very poor out/in when stage looks like late drying (avoid cherry→green ratios).
        const lateDry = /dry|bed|parchment|hulling/i;
        const shrinkRisk = batches.filter((b) => {
            if (!lateDry.test(String(b.stage || ''))) return false;
            const kin = Number(b.kgIn || 0);
            const kout = Number(b.kgOut || 0);
            if (kin <= 0 || kout <= 0) return false;
            const convPct = (kout / kin) * 100;
            return convPct < 55;
        });
        const riskIds = new Set([...moistureRisk, ...shrinkRisk].map((b) => b.id));
        if (riskIds.size > 0) {
            const sample = [...riskIds].slice(0, 3).join(', ');
            push({
                severity: 'Critical',
                module: 'Processing',
                title: 'Drying / conversion watchlist',
                body: `${riskIds.size} batch(es) show elevated moisture (>14%) and/or unusually low kgOut vs kgIn. Check bed rotation, airflow, and moisture probes.`,
                metric: `${riskIds.size} batch(es) · e.g. ${sample}`,
            });
        }

        // 4) Grade spread at domestic dispatch prices (UGX)
        const byGrade = {};
        for (const c of contracts) {
            const g = String(c.grade || 'Other').trim() || 'Other';
            if (!byGrade[g]) byGrade[g] = { kg: 0, priceSum: 0, n: 0 };
            byGrade[g].kg += Number(c.netKg || 0);
            byGrade[g].priceSum += Number(c.pricePerKg || 0);
            byGrade[g].n += 1;
        }
        const gradeRows = Object.entries(byGrade)
            .map(([grade, d]) => ({
                grade,
                kg: d.kg,
                avgPrice: d.n > 0 ? d.priceSum / d.n : 0,
            }))
            .filter((r) => r.kg > 0 && r.avgPrice > 0)
            .sort((a, b) => b.avgPrice - a.avgPrice);

        if (gradeRows.length >= 2) {
            const premium = gradeRows[0];
            const discount = gradeRows[gradeRows.length - 1];
            if (premium.avgPrice > discount.avgPrice && discount.kg > 0) {
                const shiftKg = discount.kg * 0.05;
                const uplift = shiftKg * (premium.avgPrice - discount.avgPrice);
                if (uplift > 0) {
                    push({
                        severity: 'Opportunity',
                        module: 'Finance',
                        title: 'Grade mix at domestic pricing',
                        body: `Raising a small share of ${discount.grade} volume toward ${premium.grade} pricing (at current dispatch rates) improves seasonal revenue.`,
                        metric: `${fmtUgx(uplift)} potential at ~5% mix shift`,
                    });
                }
            }
        }

        if (insights.length === 0) {
            push({
                severity: 'Opportunity',
                module: 'Estate',
                title: 'Building your insight baseline',
                body: 'As you log batches, labor expenses, and domestic dispatches, this panel will surface block, processing, and revenue signals automatically.',
                metric: 'Live — no static seed copy',
            });
        }

        return insights;
    },

    // ── Contracts table (domestic green coffee dispatch; same schema)
    async getContracts() {
        const rows = await getEstateApi().query('SELECT * FROM contracts');
        return rows.map((c) => {
            const netKg = Number(c.netKg) || 0;
            const pricePerKg = Number(c.pricePerKg) || 0;
            const lineTotal = Math.round(netKg * pricePerKg);
            const stored = Math.round(Number(c.totalValue) || 0);
            const useLine = netKg > 0 && pricePerKg > 0;
            return {
                ...c,
                netKg,
                pricePerKg,
                // Single source of truth when kg and UGX/kg are set: total = kg × UGX/kg (fixes inconsistent mock / legacy rows).
                totalValue: useLine ? lineTotal : stored,
            };
        });
    },

    // ── Computed Stats ───────────────────────────────────────
    async getComputedStats() {
        const blocks = await this.getBlocks();
        const batches = await getEstateApi().query('SELECT * FROM batches');
        const output = batches.reduce((s, b) => s + Number(b.kgOut || 0), 0);
        const validBatches = batches.filter(b => Number(b.kgIn || 0) > 0 && Number(b.kgOut || 0) > 0);
        const avgConv = validBatches.length > 0
            ? ((validBatches.reduce((s, x) => s + ((Number(x.kgOut || 0) / Number(x.kgIn || 1)) * 100), 0) / validBatches.length).toFixed(1))
            : 0;

        const avgConvNum = Number(avgConv) || 0;
        const targetConv = 62;
        const convScore = Math.max(0, Math.min(100, 55 + (avgConvNum - targetConv) * 2.5));

        const alertBatches = batches.filter(b => b.status === "Alert").length;
        const kgByBlock = batches.reduce((acc, b) => {
            if (!b.block_id) return acc;
            acc[b.block_id] = (acc[b.block_id] || 0) + Number(b.kgOut || 0);
            return acc;
        }, {});
        const ypas = blocks
            .map(b => {
                const kg = kgByBlock[b.id] || 0;
                const ac = Number(b.acres) || 0;
                return ac > 0 && kg > 0 ? kg / ac : null;
            })
            .filter(v => v != null);
        let spreadPenalty = 0;
        if (ypas.length >= 2) {
            const mean = ypas.reduce((s, v) => s + v, 0) / ypas.length;
            const varY = ypas.reduce((s, v) => s + (v - mean) ** 2, 0) / ypas.length;
            const cv = mean > 0 ? Math.sqrt(varY) / mean : 0;
            spreadPenalty = Math.min(25, cv * 80);
        }
        const alertBlocks = blocks.filter(b => b.status === 'Alert').length;
        const opsScore = Math.max(0, 100 - alertBatches * 12 - alertBlocks * 10 - spreadPenalty);

        const seasonHealthScore = Math.round(Math.max(35, Math.min(98, convScore * 0.45 + opsScore * 0.55)));

        const totalPlants = blocks.reduce((s, b) => s + Number(b.plant_count || 0), 0);
        const farmPlantCapacity = 27000;

        return {
            totalGreenBeanOutput: output,
            avgConversion: avgConv,
            activeBatches: batches.filter(b => b.status === "Processing" || b.status === "Alert").length,
            alertBatches,
            seasonHealthScore,
            totalPlants,
            farmPlantCapacity,
        };
    },

    // ── Currency Helpers ─────────────────────────────────────
    getSettings() {
        try { return JSON.parse(localStorage.getItem('estate_settings')) || {}; } catch { return {}; }
    },

    /** Format a numeric amount already in UGX. Do not multiply by exchange rate. */
    formatCurrency(value) {
        const n = Number(value) || 0;
        return 'UGX ' + Math.round(n).toLocaleString();
    },

    // ── Remote Sync ──────────────────────────────────────────
    async sync() {
        return await getEstateApi().syncData();
    },

    // ══════════════════════════════════════════════════════════
    // WRITE METHODS
    // ══════════════════════════════════════════════════════════

    // ── Finance ───────────────────────────────────────────────
    async addTransaction({
        category,
        description,
        amount,
        date,
        type,
        payment_method,
        maintenance_activity_key,
        block_id,
        source_module,
        source_id,
    }) {
        const pm = this.normalizePaymentMethod(payment_method);
        const mak =
            maintenance_activity_key && String(maintenance_activity_key).trim()
                ? String(maintenance_activity_key).trim()
                : null;
        const bid =
            block_id && String(block_id).trim() ? String(block_id).trim() : null;
        const smod =
            source_module && String(source_module).trim() ? String(source_module).trim() : null;
        const sid = source_id != null && String(source_id).trim() !== '' ? String(source_id).trim() : null;
        return await getEstateApi().execute(
            `INSERT INTO finance_items (category, description, amount, date, type, payment_method, maintenance_activity_key, block_id, source_module, source_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [category, description, amount, date, type, pm, mak, bid, smod, sid]
        );
    },

    /** Remove mirrored ledger lines (e.g. before re-linking a source record). */
    async deleteLedgerLinesBySource(source_module, source_id) {
        const sm = String(source_module || '').trim();
        const sid = String(source_id ?? '').trim();
        if (!sm || !sid) return { changes: 0 };
        return await getEstateApi().execute(
            `DELETE FROM finance_items WHERE source_module = ? AND source_id = ?`,
            [sm, sid]
        );
    },

    /** Domestic dispatch contract → farm revenue (one line per contract id). */
    async _refreshContractFarmLedgerMirror(contractId) {
        const cid = String(contractId || '').trim();
        if (!cid) return;
        const rows = await getEstateApi().query('SELECT * FROM contracts WHERE id = ?', [cid]);
        const row = rows[0];
        if (!row) return;
        await this.deleteLedgerLinesBySource('dispatch_contract', cid);
        const netKg = Number(row.netKg) || 0;
        const pricePerKg = Number(row.pricePerKg) || 0;
        const lineTotal = Math.round(netKg * pricePerKg);
        const stored = Math.round(Number(row.totalValue) || 0);
        const useLine = netKg > 0 && pricePerKg > 0;
        const amt = useLine ? lineTotal : stored;
        if (amt <= 0) return;
        const etd = String(row.etd || new Date().toISOString().slice(0, 10)).slice(0, 10);
        const desc =
            `Domestic dispatch · ${row.buyer || 'Buyer'} · ${row.grade || '—'} · ${netKg} kg · ${cid}`.slice(0, 500);
        await this.addTransaction({
            category: 'Green coffee sale (domestic)',
            description: desc,
            amount: amt,
            date: etd,
            type: 'Revenue',
            payment_method: 'cash',
            source_module: 'dispatch_contract',
            source_id: cid,
        });
    },

    /**
     * Backfill / repair: estate (farm) ledger only — not SACCO (separate entity).
     * Removes any legacy rows that copied SACCO into finance_items.
     */
    async repairAllDerivedFarmLedgerMirrors() {
        try {
            await getEstateApi().execute(
                `DELETE FROM finance_items WHERE source_module IN ('sacco_repayment','sacco_finance_item','sacco_saving')`
            );
        } catch {
            /* ignore */
        }
        const ctr = await getEstateApi().query('SELECT id FROM contracts ORDER BY id ASC');
        for (const r of ctr) {
            await this._refreshContractFarmLedgerMirror(r.id);
        }
        const plRows = await getEstateApi().query(`
            SELECT pl.id, pl.full_name, pl.gross_salary, pl.position, pr.year_month
            FROM payroll_lines pl
            INNER JOIN payroll_runs pr ON pl.payroll_run_id = pr.id
            ORDER BY pl.id ASC`);
        for (const row of plRows) {
            const pos = String(row.position || '').toLowerCase();
            const employmentType =
                pos.includes('seasonal') || pos.includes('casual') ? 'seasonal' : '';
            await this.mirrorPayrollLineToFarmFinance({
                payrollLineId: row.id,
                yearMonth: row.year_month,
                fullName: row.full_name,
                grossSalary: row.gross_salary,
                employmentType,
            });
        }
    },

    /**
     * SACCO entity: journal lines only (sacco_finance_items) in date range — for P&L-style KPIs.
     */
    async getSaccoJournalSummaryForRange(fromIso, toIso) {
        const f = String(fromIso || '1970-01-01').slice(0, 10);
        const t = String(toIso || '2099-12-31').slice(0, 10);
        const rows = await getEstateApi().query(
            `SELECT type, SUM(amount) AS total FROM sacco_finance_items WHERE date >= ? AND date <= ? GROUP BY type`,
            [f, t]
        );
        let revenue = 0;
        let expense = 0;
        for (const r of rows) {
            const v = Number(r.total) || 0;
            if (r.type === 'Revenue') revenue += v;
            if (r.type === 'Expense') expense += v;
        }
        return { revenue, expense, net: revenue - expense };
    },

    /**
     * SACCO entity: unified cash-style book (journal + savings + repayments + loan disbursements).
     * Single-entry; inflows positive, outflows negative; running balance from opening (before range).
     */
    async getSaccoCashbookForRange(fromIso, toIso) {
        const rd = (s) => String(s || '').slice(0, 10);
        const f = rd(fromIso);
        const t = rd(toIso);
        const [finance, savings, repayments, loans] = await Promise.all([
            this.getSaccoFinanceItems(),
            this.getSaccoSavings(),
            this.getSaccoRepayments(),
            this.getSaccoLoans(),
        ]);
        const events = [];
        for (const it of finance) {
            const amt = Number(it.amount) || 0;
            if (amt <= 0) continue;
            const isExp = String(it.type || '').trim() === 'Expense';
            events.push({
                date: rd(it.date),
                id: Number(it.id) || 0,
                ord: 1,
                description: `${it.category || '—'} · ${it.description || ''}`.slice(0, 220),
                method: '—',
                signed: isExp ? -amt : amt,
                kind: 'journal',
            });
        }
        for (const s of savings) {
            const amt = Number(s.amount) || 0;
            if (amt <= 0) continue;
            events.push({
                date: rd(s.deposit_date),
                id: Number(s.id) || 0,
                ord: 2,
                description: `Savings deposit · ${s.member_name || 'Member'}`,
                method: String(s.method || '—'),
                signed: amt,
                kind: 'saving',
            });
        }
        for (const r of repayments) {
            const amt = Number(r.amount) || 0;
            if (amt <= 0) continue;
            events.push({
                date: rd(r.repayment_date),
                id: Number(r.id) || 0,
                ord: 3,
                description: `Loan repayment · ${r.member_name || 'Member'} · Loan #${r.loan_id}`,
                method: String(r.method || '—'),
                signed: amt,
                kind: 'repayment',
            });
        }
        for (const l of loans) {
            const amt = Number(l.amount ?? l.principal ?? 0) || 0;
            if (amt <= 0) continue;
            events.push({
                date: rd(l.issue_date),
                id: Number(l.id) || 0,
                ord: 4,
                description: `Loan disbursed · ${l.member_name || 'Member'} · Loan #${l.id}`,
                method: '—',
                signed: -amt,
                kind: 'loan_issue',
            });
        }
        events.sort((a, b) => {
            const c = a.date.localeCompare(b.date);
            if (c !== 0) return c;
            if (a.ord !== b.ord) return a.ord - b.ord;
            return a.id - b.id;
        });
        let opening = 0;
        for (const e of events) {
            if (e.date < f) opening += e.signed;
        }
        let bal = opening;
        const lines = [];
        for (const e of events) {
            if (e.date < f || e.date > t) continue;
            bal += e.signed;
            lines.push({
                date: e.date,
                description: e.description,
                method: e.method,
                kind: e.kind,
                signed: e.signed,
                balance: bal,
            });
        }
        return { opening, from: f, to: t, lines };
    },

    /**
     * One-way sync: Field Operations cost → farm finance expense (replaces prior row for same source).
     */
    async syncFieldOpsExpenseToLedger({
        sourceModule,
        sourceId,
        amountUgx,
        dateStr,
        blockId,
        category,
        description,
    }) {
        const sid = sourceId != null ? String(sourceId).trim() : '';
        if (!sid) return;
        await this.deleteLedgerLinesBySource(sourceModule, sid);
        const a = Number(amountUgx) || 0;
        if (a <= 0) return;
        const bid = blockId && String(blockId).trim() ? String(blockId).trim() : null;
        await this.addTransaction({
            category,
            description: String(description || '').slice(0, 500),
            amount: a,
            date: String(dateStr || new Date().toISOString().slice(0, 10)).slice(0, 10),
            type: 'Expense',
            payment_method: 'cash',
            block_id: bid,
            source_module: sourceModule,
            source_id: sid,
        });
    },

    async _refreshIrrigationLedgerMirror(id) {
        const rows = await getEstateApi().query(
            `SELECT il.*, b.name as blockName FROM irrigation_logs il
             LEFT JOIN blocks b ON il.block_id = b.id WHERE il.id = ?`,
            [id]
        );
        const row = rows[0];
        if (!row) return;
        await this.syncFieldOpsExpenseToLedger({
            sourceModule: 'irrigation_log',
            sourceId: id,
            amountUgx: row.cost_ugx,
            dateStr: row.log_date,
            blockId: row.block_id,
            category: 'Irrigation Running Cost',
            description: `Irrigation: ${row.method || 'session'} · ${row.blockName || row.block_id}${row.trigger_reason ? ` — ${String(row.trigger_reason).slice(0, 80)}` : ''}`,
        });
    },

    async _refreshShadeTreeLedgerMirror(id) {
        const rows = await getEstateApi().query(
            `SELECT st.*, b.name as blockName FROM shade_trees st
             LEFT JOIN blocks b ON st.block_id = b.id WHERE st.id = ?`,
            [id]
        );
        const row = rows[0];
        if (!row) return;
        await this.syncFieldOpsExpenseToLedger({
            sourceModule: 'shade_tree',
            sourceId: id,
            amountUgx: row.cost_ugx,
            dateStr: row.planted_date || new Date().toISOString().slice(0, 10),
            blockId: row.block_id,
            category: 'Shade Management',
            description: `Shade: ${row.species || 'trees'} · ${row.blockName || row.block_id}`,
        });
    },

    async _refreshStumpingLedgerMirror(id) {
        const rows = await getEstateApi().query(
            `SELECT sc.*, b.name as blockName FROM stumping_cycles sc
             LEFT JOIN blocks b ON sc.block_id = b.id WHERE sc.id = ?`,
            [id]
        );
        const row = rows[0];
        if (!row) return;
        await this.syncFieldOpsExpenseToLedger({
            sourceModule: 'stumping_cycle',
            sourceId: id,
            amountUgx: row.cost_ugx,
            dateStr: row.stump_date || new Date().toISOString().slice(0, 10),
            blockId: row.block_id,
            category: 'Stumping & Pruning',
            description: `Stumping: ${row.blockName || row.block_id}${row.strategy ? ` · ${row.strategy}` : ''}`,
        });
    },

    /**
     * Mirror a staff Pay save into the estate ledger (finance_items).
     * One expense per payroll line (source_module payroll_line); re-save replaces the previous row.
     */
    async mirrorPayrollLineToFarmFinance({
        payrollLineId,
        yearMonth,
        fullName,
        grossSalary,
        employmentType,
        ledgerDate,
    }) {
        const lid = payrollLineId != null ? String(payrollLineId).trim() : '';
        if (!lid) return;
        await this.deleteLedgerLinesBySource('payroll_line', lid);
        const g = Number(grossSalary) || 0;
        if (g <= 0) return;
        const typ = String(employmentType || '').trim();
        const category =
            typ.toLowerCase() === 'seasonal' ? 'Casual / Seasonal Labour' : 'Permanent Staff Payroll';
        const ym = String(yearMonth || '').trim();
        const nm = String(fullName || '').trim() || 'Staff';
        const desc = `Salary paid: ${nm}${ym ? ` · ${ym}` : ''}`;
        const override = ledgerDate && String(ledgerDate).trim() ? String(ledgerDate).slice(0, 10) : '';
        const txDate = override
            ? override
            : ym && /^\d{4}-\d{2}$/.test(ym)
              ? this.payrollMonthEndDate(ym)
              : new Date().toISOString().slice(0, 10);
        await this.addTransaction({
            category,
            description: desc.slice(0, 500),
            amount: g,
            date: txDate,
            type: 'Expense',
            payment_method: 'cash',
            source_module: 'payroll_line',
            source_id: lid,
        });
    },

    /** Latest maintenance rate card (bundled defaults, editable). */
    async getMaintenanceRateCard() {
        const sets = await getEstateApi().query(
            'SELECT * FROM maintenance_rate_sets ORDER BY id DESC LIMIT 1'
        );
        if (!sets.length) return { set: null, lines: [] };
        const set = sets[0];
        const lines = await getEstateApi().query(
            'SELECT * FROM maintenance_rate_lines WHERE set_id = ? ORDER BY sort_order ASC, id ASC',
            [set.id]
        );
        return { set, lines };
    },

    async updateMaintenanceRateLine(id, fields) {
        const allowed = ['label', 'rate_ugx', 'unit', 'allocation_method'];
        const entries = Object.entries(fields || {}).filter(([k]) => allowed.includes(k));
        if (!entries.length) return;
        const sets = entries.map(([k]) => `${k} = ?`).join(', ');
        const vals = [...entries.map(([, v]) => v), id];
        return await getEstateApi().execute(
            `UPDATE maintenance_rate_lines SET ${sets} WHERE id = ?`,
            vals
        );
    },

    async resetMaintenanceRatesToDefaults() {
        if (!tryGetEstateApi()?.resetMaintenanceRates) {
            throw new Error('Reset is only available in the desktop app.');
        }
        return await getEstateApi().resetMaintenanceRates();
    },

    /**
     * Budget estimates: per-acre lines × acres; fixed_monthly with whole_farm once at farm level.
     * Block rows include equal share of whole-farm fixed fee when multiple blocks exist.
     */
    async getMaintenanceBudgetRollup() {
        const { set, lines } = await this.getMaintenanceRateCard();
        const blocks = await this.getBlocks();
        const totalAcres = blocks.reduce((s, b) => s + Number(b.acres || 0), 0);
        const nBlocks = blocks.length;
        let farmFixedMonthly = 0;
        const perAcreLines = [];
        for (const ln of lines) {
            if (ln.unit === 'fixed_monthly') {
                const am = ln.allocation_method || 'whole_farm';
                if (am === 'whole_farm') farmFixedMonthly += Number(ln.rate_ugx) || 0;
            } else if (ln.unit === 'per_acre') {
                perAcreLines.push(ln);
            }
        }
        const fixedPerBlock = nBlocks > 0 ? farmFixedMonthly / nBlocks : farmFixedMonthly;
        let farmPerAcreTotal = 0;
        const activityFarmEstimates = [];
        for (const ln of perAcreLines) {
            const r = Number(ln.rate_ugx) || 0;
            const est = r * totalAcres;
            farmPerAcreTotal += est;
            activityFarmEstimates.push({
                line: ln,
                estimateFarm: est,
                ratePerAcre: r,
            });
        }
        const farmGrand = farmPerAcreTotal + farmFixedMonthly;
        const blockRows = blocks.map((b) => {
            const ac = Number(b.acres || 0);
            let perAcreBlock = 0;
            for (const ln of perAcreLines) {
                perAcreBlock += (Number(ln.rate_ugx) || 0) * ac;
            }
            return {
                id: b.id,
                name: b.name,
                acres: ac,
                estimatePerAcreActivities: perAcreBlock,
                estimateFixedShare: fixedPerBlock,
                estimateBlock: perAcreBlock + fixedPerBlock,
            };
        });
        return {
            set,
            totalAcres,
            farmPerAcreTotal,
            farmFixedMonthly,
            farmGrand,
            activityFarmEstimates,
            blockRows,
        };
    },

    /** Sum expenses by maintenance_activity_key in date range (for variance vs plan). */
    async getMaintenanceExpenseActualsByKey(from, to) {
        const f = from || '1970-01-01';
        const t = to || '2099-12-31';
        const rows = await getEstateApi().query(
            `SELECT maintenance_activity_key as k, SUM(amount) as total
             FROM finance_items
             WHERE type = 'Expense' AND date >= ? AND date <= ?
               AND maintenance_activity_key IS NOT NULL AND TRIM(maintenance_activity_key) != ''
             GROUP BY maintenance_activity_key`,
            [f, t]
        );
        const map = {};
        for (const r of rows) {
            map[r.k] = Number(r.total) || 0;
        }
        return map;
    },

    // ── Batches ───────────────────────────────────────────────
    async addBatch({ id, block_id, stage, kgIn, moisture, status, date }) {
        return await getEstateApi().execute(
            `INSERT INTO batches (id, block_id, stage, kgIn, moisture, status, date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, block_id, stage, kgIn, moisture, status, date]
        );
    },

    async updateBatch(id, fields) {
        const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
        const vals = [...Object.values(fields), id];
        return await getEstateApi().execute(`UPDATE batches SET ${sets} WHERE id = ?`, vals);
    },

    // ── Blocks ────────────────────────────────────────────────
    async addBlock({ id, name, acres, altitude, variety, status, plant_count }) {
        const pc = plant_count != null ? Number(plant_count) : 0;
        return await getEstateApi().execute(
            `INSERT INTO blocks (id, name, acres, altitude, variety, status, kgProcessed, plant_count) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
            [id, name, acres, altitude, variety, status, pc]
        );
    },

    async updateBlock(id, fields) {
        const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
        const vals = [...Object.values(fields), id];
        return await getEstateApi().execute(`UPDATE blocks SET ${sets} WHERE id = ?`, vals);
    },

    // ── Workforce ─────────────────────────────────────────────
    /**
     * Ensures a SACCO member row exists for a roster worker (member_no WF-{workforceId}).
     * Only used when workforce.sacco_member = 1 (SACCO is optional).
     */
    async ensureSaccoMemberForWorkforce({ workforceId, fullName }) {
        const wid = Number(workforceId);
        if (!wid || !String(fullName || '').trim()) return null;
        const existing = await getEstateApi().query(
            'SELECT id FROM sacco_members WHERE workforce_id = ? LIMIT 1',
            [wid]
        );
        if (existing && existing.length) {
            await getEstateApi().execute(
                `UPDATE sacco_members SET full_name = ? WHERE workforce_id = ?`,
                [String(fullName).trim(), wid]
            );
            return existing[0].id;
        }
        const member_no = `WF-${wid}`;
        const relink = await getEstateApi().query(
            'SELECT id FROM sacco_members WHERE member_no = ? LIMIT 1',
            [member_no]
        );
        if (relink && relink.length) {
            await getEstateApi().execute(
                `UPDATE sacco_members SET workforce_id = ?, full_name = ?, status = 'Active' WHERE id = ?`,
                [wid, String(fullName).trim(), relink[0].id]
            );
            return relink[0].id;
        }
        const joinDate = new Date().toISOString().slice(0, 10);
        await getEstateApi().execute(
            `INSERT INTO sacco_members (member_no, full_name, phone, national_id, join_date, status, workforce_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [member_no, String(fullName).trim(), '', '', joinDate, 'Active', wid]
        );
        return null;
    },

    /**
     * Unlinks roster from SACCO member (or deletes empty member row).
     * If the member has savings/loans, keeps the row and clears workforce_id.
     */
    async removeSaccoMemberFromWorkforce(workforceId) {
        const wid = Number(workforceId);
        if (!wid) return;
        const rows = await getEstateApi().query(
            'SELECT id FROM sacco_members WHERE workforce_id = ? LIMIT 1',
            [wid]
        );
        if (!rows || !rows.length) return;
        const mid = rows[0].id;
        const [sv, ln] = await Promise.all([
            getEstateApi().query('SELECT COUNT(*) as c FROM sacco_savings WHERE member_id = ?', [mid]),
            getEstateApi().query('SELECT COUNT(*) as c FROM sacco_loans WHERE member_id = ?', [mid]),
        ]);
        const hasActivity = (Number(sv[0]?.c) > 0) || (Number(ln[0]?.c) > 0);
        if (hasActivity) {
            await getEstateApi().execute(
                `UPDATE sacco_members SET workforce_id = NULL, status = 'Inactive' WHERE id = ?`,
                [mid]
            );
        } else {
            await getEstateApi().execute('DELETE FROM sacco_members WHERE id = ?', [mid]);
        }
    },

    /** Ensures SACCO rows exist only for workers who opted in (sacco_member = 1). */
    async syncSaccoMembersFromWorkforce() {
        const rows = await getEstateApi().query(
            'SELECT id, name FROM workforce WHERE COALESCE(sacco_member, 0) = 1 ORDER BY id'
        );
        for (const w of rows) {
            await this.ensureSaccoMemberForWorkforce({ workforceId: w.id, fullName: w.name });
        }
    },

    async addWorker({ name, department, payroll, type, supervisor, sacco_member, contact }) {
        const sm = sacco_member ? 1 : 0;
        const ct = String(contact || '').trim();
        const run = await getEstateApi().execute(
            `INSERT INTO workforce (name, department, payroll, type, role, sacco_member, contact) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, department, payroll, type, supervisor || '', sm, ct || null]
        );
        const wid = Number(run?.lastInsertRowid ?? run?.lastInsertRowID ?? 0);
        if (wid && sm) {
            await this.ensureSaccoMemberForWorkforce({ workforceId: wid, fullName: name });
            if (ct) {
                await getEstateApi().execute(
                    `UPDATE sacco_members SET phone = ? WHERE workforce_id = ?`,
                    [ct, wid]
                );
            }
        }
        return run;
    },

    async updateWorker(id, fields) {
        const prevRows = await getEstateApi().query('SELECT name, sacco_member FROM workforce WHERE id = ?', [id]);
        const prev = prevRows[0] || {};
        const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
        const vals = [...Object.values(fields), id];
        const run = await getEstateApi().execute(`UPDATE workforce SET ${sets} WHERE id = ?`, vals);

        const nextMember =
            fields.sacco_member !== undefined ? Number(fields.sacco_member) : Number(prev.sacco_member) || 0;
        const prevMember = Number(prev.sacco_member) || 0;

        if (fields.sacco_member !== undefined) {
            if (nextMember === 1) {
                const nm = fields.name != null ? String(fields.name).trim() : String(prev.name || '').trim();
                await this.ensureSaccoMemberForWorkforce({ workforceId: id, fullName: nm });
            } else if (prevMember === 1) {
                await this.removeSaccoMemberFromWorkforce(id);
            }
        } else if (fields.name != null && nextMember === 1) {
            await getEstateApi().execute(
                `UPDATE sacco_members SET full_name = ? WHERE workforce_id = ?`,
                [String(fields.name).trim(), id]
            );
        }
        if (fields.contact !== undefined && nextMember === 1) {
            const ph = String(fields.contact || '').trim();
            await getEstateApi().execute(
                `UPDATE sacco_members SET phone = ? WHERE workforce_id = ?`,
                [ph || null, id]
            );
        }
        return run;
    },

    // ── Domestic dispatch (contracts row)
    async addContract({ id, buyer, destination, grade, netKg, pricePerKg, totalValue, status, etd }) {
        const run = await getEstateApi().execute(
            `INSERT INTO contracts (id, buyer, destination, grade, netKg, pricePerKg, totalValue, status, etd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, buyer, destination, grade, netKg, pricePerKg, totalValue, status, etd]
        );
        if (id) await this._refreshContractFarmLedgerMirror(id);
        return run;
    },

    // ── Nursery & Planting Material ───────────────────────────
    async getNurseryBatches() {
        return await getEstateApi().query('SELECT * FROM nursery_batches ORDER BY cutting_date DESC');
    },
    async addNurseryBatch(data) {
        const { id, clone_variety, cutting_date, cuttings_placed, stage, mother_garden_id, grade, notes } = data;
        return await getEstateApi().execute(
            `INSERT INTO nursery_batches (id, clone_variety, cutting_date, cuttings_placed, stage, mother_garden_id, grade, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, clone_variety, cutting_date, cuttings_placed, stage, mother_garden_id || '', grade || 'Ungraded', notes || '']
        );
    },
    async updateNurseryBatch(id, fields) {
        const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
        return await getEstateApi().execute(`UPDATE nursery_batches SET ${sets} WHERE id = ?`, [...Object.values(fields), id]);
    },
    async deleteNurseryBatch(id) {
        return await getEstateApi().execute('DELETE FROM nursery_batches WHERE id = ?', [id]);
    },
    async getMotherGardens() {
        return await getEstateApi().query('SELECT mg.*, b.name as blockName FROM mother_gardens mg LEFT JOIN blocks b ON mg.block_id = b.id');
    },
    async addMotherGarden(data) {
        const { id, block_id, clone_variety, bush_count, established_date, status } = data;
        return await getEstateApi().execute(
            `INSERT INTO mother_gardens (id, block_id, clone_variety, bush_count, established_date, status) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, block_id, clone_variety, bush_count, established_date, status || 'Active']
        );
    },

    // ── IPM Scouting ──────────────────────────────────────────
    async getIpmRecords() {
        return await getEstateApi().query(`
            SELECT ipm.*, b.name as blockName FROM ipm_scouting ipm
            LEFT JOIN blocks b ON ipm.block_id = b.id
            ORDER BY scout_date DESC
        `);
    },
    async addIpmRecord(data) {
        const { block_id, scout_date, scout_cell, pest_type, incidence_pct, severity_rating, action_taken, next_scout_date, notes } = data;
        return await getEstateApi().execute(
            `INSERT INTO ipm_scouting (block_id, scout_date, scout_cell, pest_type, incidence_pct, severity_rating, action_taken, next_scout_date, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [block_id, scout_date, scout_cell || '', pest_type, incidence_pct, severity_rating, action_taken || '', next_scout_date || '', notes || '']
        );
    },
    async deleteIpmRecord(id) {
        return await getEstateApi().execute('DELETE FROM ipm_scouting WHERE id = ?', [id]);
    },

    // ── Soil & Fertility ──────────────────────────────────────
    async getSoilRecords() {
        return await getEstateApi().query(`
            SELECT sr.*, b.name as blockName FROM soil_records sr
            LEFT JOIN blocks b ON sr.block_id = b.id
            ORDER BY sample_date DESC
        `);
    },
    async addSoilRecord(data) {
        const { block_id, sample_date, ph, organic_matter_pct, nitrogen_ppm, phosphorus_ppm, potassium_ppm, cec, base_saturation_pct, texture, amendment_notes } = data;
        return await getEstateApi().execute(
            `INSERT INTO soil_records (block_id, sample_date, ph, organic_matter_pct, nitrogen_ppm, phosphorus_ppm, potassium_ppm, cec, base_saturation_pct, texture, amendment_notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [block_id, sample_date, ph, organic_matter_pct, nitrogen_ppm, phosphorus_ppm, potassium_ppm, cec || null, base_saturation_pct || null, texture || '', amendment_notes || '']
        );
    },
    async deleteSoilRecord(id) {
        return await getEstateApi().execute('DELETE FROM soil_records WHERE id = ?', [id]);
    },
    async getFertilityApplications() {
        return await getEstateApi().query(`
            SELECT fa.*, b.name as blockName FROM fertility_applications fa
            LEFT JOIN blocks b ON fa.block_id = b.id
            ORDER BY application_date DESC
        `);
    },
    async addFertilityApplication(data) {
        const { block_id, application_date, product, type, kg_per_ha, total_kg, cost, applied_by, notes } = data;
        const run = await getEstateApi().execute(
            `INSERT INTO fertility_applications (block_id, application_date, product, type, kg_per_ha, total_kg, cost, applied_by, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [block_id, application_date, product, type, kg_per_ha, total_kg, cost || 0, applied_by || '', notes || '']
        );
        const fid = run?.lastInsertRowid;
        const c = Number(cost) || 0;
        if (fid != null) {
            await this.deleteLedgerLinesBySource('fertility_app', String(fid));
            if (c > 0) {
                const tlow = String(type || '').toLowerCase();
                const fertCat = tlow.includes('foliar')
                    ? 'Fertiliser — Foliar Spray'
                    : 'Fertiliser — Broadcast';
                const desc = `Fertiliser: ${product || 'Application'}${notes ? ` — ${String(notes).slice(0, 160)}` : ''}`;
                await this.addTransaction({
                    category: fertCat,
                    description: desc.slice(0, 500),
                    amount: c,
                    date: application_date || new Date().toISOString().split('T')[0],
                    type: 'Expense',
                    payment_method: 'cash',
                    block_id,
                    source_module: 'fertility_app',
                    source_id: String(fid),
                });
            }
        }
        return run;
    },

    // ── Irrigation Logs ───────────────────────────────────────
    async getIrrigationLogs() {
        return await getEstateApi().query(`
            SELECT il.*, b.name as blockName FROM irrigation_logs il
            LEFT JOIN blocks b ON il.block_id = b.id
            ORDER BY log_date DESC
        `);
    },
    async addIrrigationLog(data) {
        const {
            block_id,
            log_date,
            method,
            mm_applied,
            rainfall_mm,
            duration_hrs,
            trigger_reason,
            phenology_stage,
            notes,
            cost_ugx,
        } = data;
        const run = await getEstateApi().execute(
            `INSERT INTO irrigation_logs (block_id, log_date, method, mm_applied, rainfall_mm, duration_hrs, trigger_reason, phenology_stage, notes, cost_ugx)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                block_id,
                log_date,
                method,
                mm_applied,
                rainfall_mm || 0,
                duration_hrs || 0,
                trigger_reason || '',
                phenology_stage || '',
                notes || '',
                Number(cost_ugx) || 0,
            ]
        );
        const rid = run?.lastInsertRowid;
        if (rid != null) await this._refreshIrrigationLedgerMirror(Number(rid));
        return run;
    },
    async deleteIrrigationLog(id) {
        await this.deleteLedgerLinesBySource('irrigation_log', String(id));
        return await getEstateApi().execute('DELETE FROM irrigation_logs WHERE id = ?', [id]);
    },

    // ── Shade Tree Management ─────────────────────────────────
    async getShadeTrees() {
        return await getEstateApi().query(`
            SELECT st.*, b.name as blockName FROM shade_trees st
            LEFT JOIN blocks b ON st.block_id = b.id
            ORDER BY planted_date DESC
        `);
    },
    async addShadeTree(data) {
        const {
            block_id,
            species,
            count,
            spacing_m,
            planted_date,
            current_height_m,
            target_height_m,
            canopy_density,
            notes,
            cost_ugx,
        } = data;
        const run = await getEstateApi().execute(
            `INSERT INTO shade_trees (block_id, species, count, spacing_m, planted_date, current_height_m, target_height_m, canopy_density, notes, cost_ugx)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                block_id,
                species,
                count,
                spacing_m,
                planted_date,
                current_height_m || null,
                target_height_m || 4.5,
                canopy_density || 'Medium',
                notes || '',
                Number(cost_ugx) || 0,
            ]
        );
        const rid = run?.lastInsertRowid;
        if (rid != null) await this._refreshShadeTreeLedgerMirror(Number(rid));
        return run;
    },
    async updateShadeTree(id, fields) {
        const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
        await getEstateApi().execute(`UPDATE shade_trees SET ${sets} WHERE id = ?`, [...Object.values(fields), id]);
        await this._refreshShadeTreeLedgerMirror(Number(id));
        return { changes: 1 };
    },
    async deleteShadeTree(id) {
        await this.deleteLedgerLinesBySource('shade_tree', String(id));
        return await getEstateApi().execute('DELETE FROM shade_trees WHERE id = ?', [id]);
    },

    // ── Stumping / Renovation Cycles ──────────────────────────
    async getStumpingCycles() {
        return await getEstateApi().query(`
            SELECT sc.*, b.name as blockName FROM stumping_cycles sc
            LEFT JOIN blocks b ON sc.block_id = b.id
            ORDER BY stump_date DESC
        `);
    },
    async addStumpingCycle(data) {
        const {
            block_id,
            stump_date,
            expected_regrowth_date,
            expected_yield_date,
            suckers_selected,
            strategy,
            status,
            notes,
            cost_ugx,
        } = data;
        const run = await getEstateApi().execute(
            `INSERT INTO stumping_cycles (block_id, stump_date, expected_regrowth_date, expected_yield_date, suckers_selected, strategy, status, notes, cost_ugx)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                block_id,
                stump_date,
                expected_regrowth_date || '',
                expected_yield_date || '',
                suckers_selected || 0,
                strategy || 'Phased',
                status || 'Planned',
                notes || '',
                Number(cost_ugx) || 0,
            ]
        );
        const rid = run?.lastInsertRowid;
        if (rid != null) await this._refreshStumpingLedgerMirror(Number(rid));
        return run;
    },
    async updateStumpingCycle(id, fields) {
        const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
        await getEstateApi().execute(`UPDATE stumping_cycles SET ${sets} WHERE id = ?`, [...Object.values(fields), id]);
        await this._refreshStumpingLedgerMirror(Number(id));
        return { changes: 1 };
    },
    async deleteStumpingCycle(id) {
        await this.deleteLedgerLinesBySource('stumping_cycle', String(id));
        return await getEstateApi().execute('DELETE FROM stumping_cycles WHERE id = ?', [id]);
    },

    // ── SACCO Module ──────────────────────────────────────────
    async getSaccoMembers() {
        return await getEstateApi().query('SELECT * FROM sacco_members ORDER BY join_date DESC, id DESC');
    },
    async addSaccoMember({ member_no, full_name, phone, national_id, join_date, status }) {
        return await getEstateApi().execute(
            `INSERT INTO sacco_members (member_no, full_name, phone, national_id, join_date, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [member_no, full_name, phone || '', national_id || '', join_date || '', status || 'Active']
        );
    },
    async getSaccoSavings() {
        return await getEstateApi().query(`
            SELECT ss.*, sm.full_name as member_name, sm.member_no
            FROM sacco_savings ss
            LEFT JOIN sacco_members sm ON ss.member_id = sm.id
            ORDER BY ss.deposit_date DESC, ss.id DESC
        `);
    },
    async addSaccoSaving({ member_id, amount, deposit_date, method, notes }) {
        return await getEstateApi().execute(
            `INSERT INTO sacco_savings (member_id, amount, deposit_date, method, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [member_id, amount || 0, deposit_date || '', method || 'Cash', notes || '']
        );
    },
    async getSaccoLoans() {
        return await getEstateApi().query(`
            SELECT sl.*, sm.full_name as member_name, sm.member_no
            FROM sacco_loans sl
            LEFT JOIN sacco_members sm ON sl.member_id = sm.id
            ORDER BY sl.issue_date DESC, sl.id DESC
        `);
    },
    async addSaccoLoan({ member_id, amount, interest_rate, term_months, issue_date, due_date, status }) {
        const amt = Number(amount);
        const principal = Number.isFinite(amt) ? amt : 0;
        return await getEstateApi().execute(
            `INSERT INTO sacco_loans (member_id, amount, principal, interest_rate, term_months, issue_date, due_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                member_id,
                principal,
                principal,
                interest_rate || 0,
                term_months || 12,
                issue_date || '',
                due_date || '',
                status || 'Active',
            ]
        );
    },
    async getSaccoRepayments() {
        return await getEstateApi().query(`
            SELECT sr.*, sl.member_id, sm.full_name as member_name, sm.member_no
            FROM sacco_repayments sr
            LEFT JOIN sacco_loans sl ON sr.loan_id = sl.id
            LEFT JOIN sacco_members sm ON sl.member_id = sm.id
            ORDER BY sr.repayment_date DESC, sr.id DESC
        `);
    },
    async addSaccoRepayment({ loan_id, amount, repayment_date, method, notes }) {
        return await getEstateApi().execute(
            `INSERT INTO sacco_repayments (loan_id, amount, repayment_date, method, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [loan_id, amount || 0, repayment_date || '', method || 'Cash', notes || '']
        );
    },
    async updateSaccoMember(id, fields) {
        const allowed = ['member_no', 'full_name', 'phone', 'national_id', 'join_date', 'status'];
        const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
        if (!entries.length) return;
        const sets = entries.map(([k]) => `${k} = ?`).join(', ');
        const vals = [...entries.map(([, v]) => v), id];
        return await getEstateApi().execute(`UPDATE sacco_members SET ${sets} WHERE id = ?`, vals);
    },
    async updateSaccoSaving(id, fields) {
        const allowed = ['member_id', 'amount', 'deposit_date', 'method', 'notes'];
        const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
        if (!entries.length) return;
        const sets = entries.map(([k]) => `${k} = ?`).join(', ');
        const vals = [...entries.map(([, v]) => v), id];
        return await getEstateApi().execute(`UPDATE sacco_savings SET ${sets} WHERE id = ?`, vals);
    },
    async updateSaccoLoan(id, fields) {
        const allowed = ['member_id', 'amount', 'principal', 'interest_rate', 'term_months', 'issue_date', 'due_date', 'status'];
        const patch = { ...fields };
        if (patch.amount != null && patch.principal === undefined) {
            patch.principal = patch.amount;
        }
        if (patch.principal != null && patch.amount === undefined) {
            patch.amount = patch.principal;
        }
        const entries = Object.entries(patch).filter(([k]) => allowed.includes(k));
        if (!entries.length) return;
        const sets = entries.map(([k]) => `${k} = ?`).join(', ');
        const vals = [...entries.map(([, v]) => v), id];
        return await getEstateApi().execute(`UPDATE sacco_loans SET ${sets} WHERE id = ?`, vals);
    },
    async updateSaccoRepayment(id, fields) {
        const allowed = ['loan_id', 'amount', 'repayment_date', 'method', 'notes'];
        const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
        if (!entries.length) return;
        const sets = entries.map(([k]) => `${k} = ?`).join(', ');
        const vals = [...entries.map(([, v]) => v), id];
        return await getEstateApi().execute(`UPDATE sacco_repayments SET ${sets} WHERE id = ?`, vals);
    },
    async getSaccoFinanceItems() {
        return await getEstateApi().query('SELECT * FROM sacco_finance_items ORDER BY date DESC, id DESC');
    },
    async addSaccoFinanceItem({ category, description, amount, date, type }) {
        return await getEstateApi().execute(
            `INSERT INTO sacco_finance_items (category, description, amount, date, type)
             VALUES (?, ?, ?, ?, ?)`,
            [category || 'Other', description || '', amount || 0, date || '', type || 'Expense']
        );
    },
    async getSaccoSummary() {
        const [members, savings, loans, repayments] = await Promise.all([
            this.getSaccoMembers(),
            this.getSaccoSavings(),
            this.getSaccoLoans(),
            this.getSaccoRepayments(),
        ]);
        const totalSavings = savings.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const totalLoanBook = loans.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const totalRepaid = repayments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        return {
            members: members.length,
            totalSavings,
            totalLoanBook,
            outstandingLoans: Math.max(totalLoanBook - totalRepaid, 0),
            repaymentsMtd: totalRepaid,
        };
    },

    /**
     * KPIs + chart series derived from docs/salary payments workbook (month sheets), for SACCO overview.
     * Desktop reads bundled docs path; web uses the same file on the server. Falls back when file missing.
     */
    async getSalaryWorkbookSaccoStats(opts = {}) {
        const api = getEstateApi();
        if (typeof api.salaryWorkbookSaccoStats === 'function') {
            return await api.salaryWorkbookSaccoStats(opts);
        }
        return { ok: false, error: 'unsupported' };
    },

    // ── Staff payroll (monthly; SACCO deductions) ────────────
    computePayrollNetPay(line) {
        const g = Number(line.gross_salary) || 0;
        const sv = Number(line.sacco_saving) || 0;
        const bk = Number(line.sacco_book_fee) || 0;
        const intr = Number(line.loan_interest) || 0;
        const rep = Number(line.loan_repayment) || 0;
        const other = Number(line.loan_principal_ref) || 0;
        return Math.round(g - sv - bk - intr - rep - other);
    },

    async getPayrollRuns() {
        return await getEstateApi().query('SELECT * FROM payroll_runs ORDER BY year_month DESC');
    },

    async getPayrollRunByMonth(yearMonth) {
        const rows = await getEstateApi().query('SELECT * FROM payroll_runs WHERE year_month = ?', [yearMonth]);
        return rows[0] || null;
    },

    async getPayrollLines(payrollRunId) {
        return await getEstateApi().query(
            `SELECT pl.*, sm.member_no
             FROM payroll_lines pl
             LEFT JOIN sacco_members sm ON pl.sacco_member_id = sm.id
             WHERE pl.payroll_run_id = ?
             ORDER BY pl.line_order ASC, pl.id ASC`,
            [payrollRunId]
        );
    },

    async getSaccoMemberByWorkforceId(workforceId) {
        const rows = await getEstateApi().query(
            'SELECT * FROM sacco_members WHERE workforce_id = ? LIMIT 1',
            [Number(workforceId)]
        );
        return rows[0] || null;
    },

    /**
     * Loads an existing payroll line for this roster worker in the month, or creates one from the roster.
     */
    async ensurePayrollLineForWorker(yearMonth, worker) {
        const run = await this.ensurePayrollRun(yearMonth);
        const member = await this.getSaccoMemberByWorkforceId(worker.id);
        let lines = await this.getPayrollLines(run.id);
        let line = null;
        if (member) {
            line = lines.find((l) => Number(l.sacco_member_id) === Number(member.id));
        }
        if (!line) {
            const nm = String(worker.name || '')
                .trim()
                .toLowerCase();
            line = lines.find((l) => String(l.full_name || '').trim().toLowerCase() === nm);
        }
        if (line) return { run, line, member };

        const lineOrder = lines.length;
        const contactFromRoster = String(worker.contact || '').trim();
        const contactFromSacco = member && member.phone ? String(member.phone).trim() : '';
        const newId = await this.savePayrollLine({
            payroll_run_id: run.id,
            line_order: lineOrder,
            full_name: String(worker.name || '').trim(),
            contact: contactFromRoster || contactFromSacco,
            position: String(worker.role || '').trim(),
            gross_salary: Number(worker.payroll) || 0,
            sacco_saving: 0,
            sacco_book_fee: 0,
            loan_principal_ref: 0,
            loan_interest: 0,
            loan_repayment: 0,
            loan_balance_snapshot: 0,
            sacco_member_id: member ? member.id : null,
            loan_id: null,
        });
        lines = await this.getPayrollLines(run.id);
        line = lines.find((l) => Number(l.id) === Number(newId));
        return { run, line, member };
    },

    async ensurePayrollRun(yearMonth) {
        const existing = await this.getPayrollRunByMonth(yearMonth);
        if (existing) return existing;
        const created = new Date().toISOString();
        await getEstateApi().execute(
            `INSERT INTO payroll_runs (year_month, status, notes, posted_at, created_at) VALUES (?, 'draft', '', '', ?)`,
            [yearMonth, created]
        );
        return await this.getPayrollRunByMonth(yearMonth);
    },

    /** Aggregates for salary sheet + SACCO overview (matches spreadsheet month totals). */
    async getPayrollSheetTotals(yearMonth) {
        const run = await this.getPayrollRunByMonth(yearMonth);
        const empty = {
            yearMonth,
            hasRun: false,
            gross: 0,
            savings: 0,
            bookFees: 0,
            loanPrincipal: 0,
            interest: 0,
            repayments: 0,
            loanBalanceSum: 0,
            netPay: 0,
            saccoTotal: 0,
            lineCount: 0,
            run: null,
        };
        if (!run) return empty;
        const lines = await this.getPayrollLines(run.id);
        let g = 0,
            sv = 0,
            bk = 0,
            lp = 0,
            intr = 0,
            rep = 0,
            lb = 0,
            net = 0;
        for (const r of lines) {
            g += Number(r.gross_salary) || 0;
            sv += Number(r.sacco_saving) || 0;
            bk += Number(r.sacco_book_fee) || 0;
            lp += Number(r.loan_principal_ref) || 0;
            intr += Number(r.loan_interest) || 0;
            rep += Number(r.loan_repayment) || 0;
            lb += Number(r.loan_balance_snapshot) || 0;
            net += Number(r.net_pay) || 0;
        }
        const saccoTotal = sv + bk + intr + rep;
        return {
            yearMonth,
            hasRun: true,
            run,
            gross: g,
            savings: sv,
            bookFees: bk,
            loanPrincipal: lp,
            interest: intr,
            repayments: rep,
            loanBalanceSum: lb,
            netPay: net,
            saccoTotal,
            lineCount: lines.length,
        };
    },

    /** Loads bundled estate salary sheet from data/payroll_seed_shammah.json (main process; filename legacy). */
    async importBundledPayrollSeed() {
        if (!tryGetEstateApi()?.importPayrollSeed) {
            throw new Error('Payroll import is only available in the desktop app.');
        }
        return await getEstateApi().importPayrollSeed();
    },

    /**
     * Import monthly payroll from salary xlsx (desktop: file dialog; web: pass xlsxBase64 + year + flags).
     */
    async importPayrollFromXlsx(opts) {
        const api = tryGetEstateApi();
        if (!api.importPayrollFromXlsx) {
            throw new Error('Payroll spreadsheet import is not available.');
        }
        return await api.importPayrollFromXlsx(opts || {});
    },

    async updatePayrollRun(id, fields) {
        const allowed = ['status', 'notes', 'posted_at'];
        const entries = Object.entries(fields).filter(([k]) => allowed.includes(k));
        if (!entries.length) return;
        const sets = entries.map(([k]) => `${k} = ?`).join(', ');
        const vals = [...entries.map(([, v]) => v), id];
        return await getEstateApi().execute(`UPDATE payroll_runs SET ${sets} WHERE id = ?`, vals);
    },

    async savePayrollLine(data) {
        const net = this.computePayrollNetPay(data);
        const {
            id,
            payroll_run_id,
            line_order,
            full_name,
            contact,
            position,
            gross_salary,
            sacco_saving,
            sacco_book_fee,
            loan_principal_ref,
            loan_interest,
            loan_repayment,
            loan_balance_snapshot,
            sacco_member_id,
            loan_id,
        } = data;
        if (id) {
            await getEstateApi().execute(
                `UPDATE payroll_lines SET line_order=?, full_name=?, contact=?, position=?, gross_salary=?, sacco_saving=?, sacco_book_fee=?, loan_principal_ref=?, loan_interest=?, loan_repayment=?, loan_balance_snapshot=?, net_pay=?, sacco_member_id=?, loan_id=?
                 WHERE id=?`,
                [
                    Number(line_order) || 0,
                    String(full_name || '').trim(),
                    String(contact || ''),
                    String(position || ''),
                    Number(gross_salary) || 0,
                    Number(sacco_saving) || 0,
                    Number(sacco_book_fee) || 0,
                    Number(loan_principal_ref) || 0,
                    Number(loan_interest) || 0,
                    Number(loan_repayment) || 0,
                    Number(loan_balance_snapshot) || 0,
                    net,
                    sacco_member_id ? Number(sacco_member_id) : null,
                    loan_id ? Number(loan_id) : null,
                    id,
                ]
            );
            return id;
        }
        const params = [
            payroll_run_id,
            Number(line_order) || 0,
            String(full_name || '').trim(),
            String(contact || ''),
            String(position || ''),
            Number(gross_salary) || 0,
            Number(sacco_saving) || 0,
            Number(sacco_book_fee) || 0,
            Number(loan_principal_ref) || 0,
            Number(loan_interest) || 0,
            Number(loan_repayment) || 0,
            Number(loan_balance_snapshot) || 0,
            net,
            sacco_member_id ? Number(sacco_member_id) : null,
            loan_id ? Number(loan_id) : null,
        ];
        try {
            const ins = await getEstateApi().query(
                `INSERT INTO payroll_lines (payroll_run_id, line_order, full_name, contact, position, gross_salary, sacco_saving, sacco_book_fee, loan_principal_ref, loan_interest, loan_repayment, loan_balance_snapshot, net_pay, sacco_member_id, loan_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
                params
            );
            if (ins[0]?.id != null) return ins[0].id;
        } catch {
            /* older SQLite without RETURNING */
        }
        await getEstateApi().execute(
            `INSERT INTO payroll_lines (payroll_run_id, line_order, full_name, contact, position, gross_salary, sacco_saving, sacco_book_fee, loan_principal_ref, loan_interest, loan_repayment, loan_balance_snapshot, net_pay, sacco_member_id, loan_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params
        );
        const last = await getEstateApi().query(
            'SELECT id FROM payroll_lines WHERE payroll_run_id = ? ORDER BY id DESC LIMIT 1',
            [payroll_run_id]
        );
        return last[0]?.id;
    },

    async deletePayrollLine(id) {
        return await getEstateApi().execute('DELETE FROM payroll_lines WHERE id = ?', [id]);
    },

    /** Last calendar day of year_month (YYYY-MM) for SACCO transaction dates. */
    payrollMonthEndDate(yearMonth) {
        const [y, m] = String(yearMonth).split('-').map(Number);
        if (!y || !m) return new Date().toISOString().slice(0, 10);
        const d = new Date(y, m, 0);
        return d.toISOString().slice(0, 10);
    },

    /**
     * Post payroll deductions to SACCO ledger. Requires sacco_member_id on lines;
     * repayments need loan_id. Sets run status to final and posted_at.
     */
    async postPayrollToSacco(payrollRunId) {
        const runs = await getEstateApi().query('SELECT * FROM payroll_runs WHERE id = ?', [payrollRunId]);
        const run = runs[0];
        if (!run) throw new Error('Payroll run not found');
        if (run.status === 'final' && run.posted_at) throw new Error('This payroll was already posted to SACCO.');

        const lines = await this.getPayrollLines(payrollRunId);
        if (!lines.length) throw new Error('Add at least one payroll line before posting.');
        const txDate = this.payrollMonthEndDate(run.year_month);
        const tag = `Payroll ${run.year_month}`;

        for (const line of lines) {
            const mid = line.sacco_member_id ? Number(line.sacco_member_id) : null;
            if (!mid) continue;

            const saving = Number(line.sacco_saving) || 0;
            if (saving > 0) {
                await this.addSaccoSaving({
                    member_id: mid,
                    amount: saving,
                    deposit_date: txDate,
                    method: 'Payroll',
                    notes: tag,
                });
            }
            const book = Number(line.sacco_book_fee) || 0;
            if (book > 0) {
                await this.addSaccoFinanceItem({
                    category: 'SACCO book fee',
                    description: `${tag} — ${line.full_name || ''}`.trim(),
                    amount: book,
                    date: txDate,
                    type: 'Revenue',
                });
            }
            const interest = Number(line.loan_interest) || 0;
            if (interest > 0) {
                await this.addSaccoFinanceItem({
                    category: 'Loan interest',
                    description: `${tag} — ${line.full_name || ''}`.trim(),
                    amount: interest,
                    date: txDate,
                    type: 'Revenue',
                });
            }
            const rep = Number(line.loan_repayment) || 0;
            const lid = line.loan_id ? Number(line.loan_id) : null;
            if (rep > 0 && lid) {
                await this.addSaccoRepayment({
                    loan_id: lid,
                    amount: rep,
                    repayment_date: txDate,
                    method: 'Payroll',
                    notes: tag,
                });
            }
        }

        for (const line of lines) {
            const lid = line.id;
            if (lid == null) continue;
            const pos = String(line.position || '').toLowerCase();
            const employmentType =
                pos.includes('seasonal') || pos.includes('casual') ? 'seasonal' : '';
            await this.mirrorPayrollLineToFarmFinance({
                payrollLineId: lid,
                yearMonth: run.year_month,
                fullName: line.full_name,
                grossSalary: line.gross_salary,
                employmentType,
            });
        }

        await this.updatePayrollRun(payrollRunId, {
            status: 'final',
            posted_at: new Date().toISOString(),
        });
        return { ok: true };
    },

    // ── Lodge Module ──────────────────────────────────────────
    async getLodgeUnits() {
        return await getEstateApi().query('SELECT * FROM lodge_units ORDER BY code ASC, id ASC');
    },
    async addLodgeUnit({ code, name, capacity, nightly_rate, status }) {
        return await getEstateApi().execute(
            `INSERT INTO lodge_units (code, name, capacity, nightly_rate, status)
             VALUES (?, ?, ?, ?, ?)`,
            [code, name || code, capacity || 1, nightly_rate || 0, status || 'Available']
        );
    },
    async getLodgeBookings() {
        return await getEstateApi().query(`
            SELECT lb.*, lu.code as unit_code, lu.name as unit_name
            FROM lodge_bookings lb
            LEFT JOIN lodge_units lu ON lb.unit_id = lu.id
            ORDER BY lb.check_in DESC, lb.id DESC
        `);
    },
    async addLodgeBooking({ guest_name, guest_phone, unit_id, check_in, check_out, guests_count, booking_source, status }) {
        return await getEstateApi().execute(
            `INSERT INTO lodge_bookings (guest_name, guest_phone, unit_id, check_in, check_out, guests_count, booking_source, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [guest_name, guest_phone || '', unit_id, check_in || '', check_out || '', guests_count || 1, booking_source || 'Direct', status || 'Booked']
        );
    },
    async getLodgePayments() {
        return await getEstateApi().query(`
            SELECT lp.*, lb.guest_name, lu.code as unit_code
            FROM lodge_payments lp
            LEFT JOIN lodge_bookings lb ON lp.booking_id = lb.id
            LEFT JOIN lodge_units lu ON lb.unit_id = lu.id
            ORDER BY lp.payment_date DESC, lp.id DESC
        `);
    },
    async addLodgePayment({ booking_id, amount, method, payment_date, status }) {
        const run = await getEstateApi().execute(
            `INSERT INTO lodge_payments (booking_id, amount, method, payment_date, status)
             VALUES (?, ?, ?, ?, ?)`,
            [booking_id, amount || 0, method || 'Cash', payment_date || '', status || 'Paid']
        );
        const pid = run?.lastInsertRowid;
        const amt = Number(amount) || 0;
        const pdate = payment_date || new Date().toISOString().split('T')[0];
        if (amt > 0 && pid != null) {
            const pm = String(method || 'cash').toLowerCase().replace(/\s+/g, '_');
            const norm = pm.includes('bank')
                ? 'bank_transfer'
                : pm.includes('mobile') || pm.includes('momo')
                  ? 'mobile_money'
                  : 'cash';
            await this.addTransaction({
                category: 'Other Revenue',
                description: `[Lodge] Guest payment (booking #${booking_id})`,
                amount: amt,
                date: pdate,
                type: 'Revenue',
                payment_method: norm,
                source_module: 'lodge_payment',
                source_id: String(pid),
            });
        }
        return run;
    },
    async getLodgeExpenses() {
        return await getEstateApi().query('SELECT * FROM lodge_expenses ORDER BY expense_date DESC, id DESC');
    },
    async addLodgeExpense({ category, description, amount, expense_date }) {
        const run = await getEstateApi().execute(
            `INSERT INTO lodge_expenses (category, description, amount, expense_date)
             VALUES (?, ?, ?, ?)`,
            [category || 'Operations', description || '', amount || 0, expense_date || '']
        );
        const lid = run?.lastInsertRowid;
        const amt = Number(amount) || 0;
        const ed = expense_date || new Date().toISOString().split('T')[0];
        if (amt > 0 && lid != null) {
            const cat = category || 'Operations';
            const desc = `[Lodge] ${cat}: ${description || 'Expense'}`.slice(0, 500);
            await this.addTransaction({
                category: 'Other Expense',
                description: desc,
                amount: amt,
                date: ed,
                type: 'Expense',
                payment_method: 'cash',
                source_module: 'lodge_expense',
                source_id: String(lid),
            });
        }
        return run;
    },
    async getLodgeSummary() {
        const [units, bookings, payments, expenses] = await Promise.all([
            this.getLodgeUnits(),
            this.getLodgeBookings(),
            this.getLodgePayments(),
            this.getLodgeExpenses(),
        ]);
        const occupied = units.filter(u => (u.status || '').toLowerCase() === 'occupied').length;
        const revenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const cost = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        return {
            units: units.length,
            occupied,
            occupancyRate: units.length > 0 ? Math.round((occupied / units.length) * 100) : 0,
            bookings: bookings.length,
            revenue,
            expenses: cost,
            net: revenue - cost,
        };
    },

    /**
     * Live metrics for the toolbar metric search (not sidebar filtering).
     * @param {'farm'|'sacco'|'lodge'|null} door Current door from app shell.
     */
    async getMetricSearchIndex(door) {
        const token = (s) => String(s ?? '').toLowerCase();
        const items = [];
        const add = (group, label, value, extraTokens = '') => {
            let disp;
            if (typeof value === 'number' && !Number.isNaN(value)) {
                const abs = Math.abs(value);
                if (abs >= 500 && abs === Math.round(abs)) {
                    disp = this.formatCurrency(value);
                } else {
                    disp = Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
                }
            } else {
                disp = String(value ?? '—');
            }
            const raw = typeof value === 'number' ? String(value) : disp;
            items.push({
                group,
                label,
                value: disp,
                tokens: token(`${group} ${label} ${disp} ${raw} ${extraTokens}`),
            });
        };

        const isLodge = door === 'lodge';

        if (isSaccoLead() && door !== 'sacco') {
            return items;
        }
        if (isLodgeLead() && door !== 'lodge') {
            return items;
        }

        if (isLodge) {
            try {
                const lodge = await this.getLodgeSummary();
                add('Lodge', 'Units', lodge.units);
                add('Lodge', 'Occupied units', lodge.occupied);
                add('Lodge', 'Occupancy rate', `${lodge.occupancyRate}%`, 'percent occupancy');
                add('Lodge', 'Bookings', lodge.bookings);
                if (!isManagerRole()) {
                    add('Lodge', 'Guest payments (total)', lodge.revenue);
                    add('Lodge', 'Lodge expenses (total)', lodge.expenses);
                    add('Lodge', 'Net (payments − expenses)', lodge.net);
                }
            } catch {
                /* ignore */
            }
            return items;
        }

        if (door === 'sacco' && !isManagerRole()) {
            try {
                const [wf, sacco] = await Promise.all([
                    this.getWorkforce(),
                    this.getSaccoSummary().catch(() => null),
                ]);
                const departments = wf.departments || [];
                const saccoOnRoster = departments.filter((w) => Number(w.sacco_member) === 1).length;
                add('Workforce', 'SACCO enrolments on roster', saccoOnRoster);
                if (sacco) {
                    add('SACCO', 'Members', sacco.members);
                    add('SACCO', 'Total savings', sacco.totalSavings);
                    add('SACCO', 'Loan book', sacco.totalLoanBook);
                    add('SACCO', 'Outstanding loans', sacco.outstandingLoans);
                }
                const d = new Date();
                const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                add('Payroll', 'Payroll month', ym);
                const payrollTotals = await this.getPayrollSheetTotals(ym).catch(() => null);
                if (payrollTotals?.hasRun) {
                    add('Payroll', `Deductions to SACCO (${ym})`, payrollTotals.saccoTotal);
                    add('Payroll', `Pay lines (${ym})`, payrollTotals.lineCount);
                }
                const members = await this.getSaccoMembers().catch(() => []);
                add('SACCO', 'Member records', members.length);
            } catch (e) {
                console.warn('getMetricSearchIndex (sacco door):', e);
            }
            return items;
        }

        if (isManagerRole()) {
            if (door === 'sacco') {
                return items;
            }
            try {
                const [blocks, stats, wf, batches, inv] = await Promise.all([
                    this.getBlocks(),
                    this.getComputedStats(),
                    this.getWorkforce(),
                    this.getBatches().catch(() => []),
                    this.getInventory().catch(() => []),
                ]);
                const departments = wf.departments || [];
                const totalAcres = blocks.reduce((s, b) => s + (Number(b.acres) || 0), 0);
                add('Estate', 'Farm blocks', blocks.length);
                add('Estate', 'Total farm acres', totalAcres);
                add('Estate', 'Coffee plants (count)', stats.totalPlants);
                add('Processing', 'Processing batches', batches.length);
                add('Processing', 'Green bean output (kg)', stats.totalGreenBeanOutput);
                add('Processing', 'Average conversion %', stats.avgConversion);
                add('Processing', 'Active batches', stats.activeBatches);
                add('Processing', 'Alert batches', stats.alertBatches);
                add('Health', 'Season health score', stats.seasonHealthScore);
                add('Workforce', 'Staff on roster', departments.length);
                let invQty = 0;
                for (const it of inv) invQty += Number(it.quantity || 0);
                add('Inventory', 'Inventory line items', inv.length);
                add('Inventory', 'Inventory quantity (sum)', invQty);
                for (const b of blocks.slice(0, 40)) {
                    add('Blocks', `Block: ${b.name || b.id}`, Number(b.acres) || 0, `${b.variety || ''} ${b.status || ''}`);
                }
            } catch (e) {
                console.warn('getMetricSearchIndex (manager):', e);
            }
            return items;
        }

        if (door !== 'farm') {
            return items;
        }

        try {
            const [blocks, stats, fin, wf, maint, finByCat, inv, contracts, batches] = await Promise.all([
                this.getBlocks(),
                this.getComputedStats(),
                this.getFinanceSummary(),
                this.getWorkforce(),
                this.getMaintenanceBudgetRollup().catch(() => null),
                this.getFinanceByCategory().catch(() => []),
                this.getInventory().catch(() => []),
                this.getContracts().catch(() => []),
                this.getBatches().catch(() => []),
            ]);

            const departments = wf.departments || [];
            const totalAcres = blocks.reduce((s, b) => s + (Number(b.acres) || 0), 0);

            add('Estate', 'Farm blocks', blocks.length);
            add('Estate', 'Total farm acres', totalAcres);
            add('Estate', 'Coffee plants (count)', stats.totalPlants);
            add('Processing', 'Processing batches', batches.length);
            add('Processing', 'Green bean output (kg)', stats.totalGreenBeanOutput);
            add('Processing', 'Average conversion %', stats.avgConversion);
            add('Processing', 'Active batches', stats.activeBatches);
            add('Processing', 'Alert batches', stats.alertBatches);
            add('Health', 'Season health score', stats.seasonHealthScore);
            add('Farm finance', 'Total recorded revenue', fin.totalRevenue);
            add('Farm finance', 'Total recorded expenses', fin.totalExpenses);
            add('Farm finance', 'Net profit (farm ledger)', fin.netProfit);

            if (finByCat && finByCat.length) {
                for (const row of finByCat.slice(0, 40)) {
                    const cat = row.category || '—';
                    const typ = row.type || '';
                    add('Farm finance · category', `${cat} (${typ})`, Number(row.total || 0));
                }
            }

            add('Workforce', 'Staff on roster', departments.length);

            if (maint) {
                add('Maintenance', 'Total acres (rate card)', maint.totalAcres);
                add('Maintenance', 'Maintenance estimate (combined)', maint.farmGrand);
                add('Maintenance', 'Per-acre activities (est.)', maint.farmPerAcreTotal);
                add('Maintenance', 'Fixed monthly (farm)', maint.farmFixedMonthly);
            }

            let invQty = 0;
            for (const it of inv) invQty += Number(it.quantity || 0);
            add('Inventory', 'Inventory line items', inv.length);
            add('Inventory', 'Inventory quantity (sum)', invQty);

            add('Sales', 'Contracts (domestic / export)', contracts.length);

            const d = new Date();
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            add('Payroll', 'Payroll month', ym);
            const payrollTotals = await this.getPayrollSheetTotals(ym).catch(() => null);
            if (payrollTotals?.hasRun) {
                add('Payroll', `Gross payroll (${ym})`, payrollTotals.gross);
                add('Payroll', `Net pay (${ym})`, payrollTotals.netPay);
                add('Payroll', `Deductions to SACCO (${ym})`, payrollTotals.saccoTotal);
                add('Payroll', `Pay lines (${ym})`, payrollTotals.lineCount);
            }

            for (const b of blocks.slice(0, 40)) {
                add('Blocks', `Block: ${b.name || b.id}`, Number(b.acres) || 0, `${b.variety || ''} ${b.status || ''}`);
            }
        } catch (e) {
            console.warn('getMetricSearchIndex:', e);
        }

        return items;
    },

    /**
     * Large text snapshot of farm + lodge + SACCO metrics for AI (Farm Intelligence).
     * Lists are capped where noted; totals and rollups are complete.
     */
    /** Fetch a compact snapshot of the logbook so the AI can discuss it. */
    async _getLogbookSnapshotParts() {
        const api = getEstateApi();
        const [tasks, minutes, complaints, workerNotes, attachments] = await Promise.all([
            this.getLogbookTasks().catch(() => []),
            this.getLogbookMinutes().catch(() => []),
            this.getLogbookComplaints().catch(() => []),
            api
                .query(
                    `SELECT wn.*, w.name AS worker_name
                     FROM worker_notes wn
                     LEFT JOIN workforce w ON w.id = wn.worker_id
                     ORDER BY COALESCE(wn.note_date,'0000-00-00') DESC, wn.id DESC
                     LIMIT 100`
                )
                .catch(() => []),
            api
                .query(
                    `SELECT id, parent_type, parent_id, file_name, mime_type, size_bytes, uploaded_at
                     FROM logbook_attachments
                     ORDER BY uploaded_at DESC, id DESC
                     LIMIT 150`
                )
                .catch(() => []),
        ]);
        return { tasks, minutes, complaints, workerNotes, attachments };
    },

    /** Render the logbook into the compact text format used by buildAIContextSnapshot. */
    _formatLogbookSection({ tasks, minutes, complaints, workerNotes, attachments }) {
        const lines = [];
        const attsByParent = new Map();
        (attachments || []).forEach((a) => {
            const k = `${a.parent_type}:${a.parent_id}`;
            if (!attsByParent.has(k)) attsByParent.set(k, []);
            attsByParent.get(k).push(a);
        });

        const openTasks = (tasks || []).filter((t) => t.status !== 'done' && t.status !== 'cancelled');
        const doneTasks = (tasks || []).filter((t) => t.status === 'done');
        const todayIso = new Date().toISOString().slice(0, 10);
        const overdue = openTasks.filter((t) => t.due_date && t.due_date < todayIso);

        lines.push(
            `Tasks — total ${tasks.length} · open ${openTasks.length} · overdue ${overdue.length} · done ${doneTasks.length}`
        );
        lines.push('Open tasks (max 40):');
        openTasks.slice(0, 40).forEach((t) => {
            const who = t.worker_name ? `worker:${t.worker_name}` : '';
            const blk = t.block_name ? `block:${t.block_name}` : '';
            const tag = [t.priority ? `prio:${t.priority}` : '', who, blk].filter(Boolean).join(' · ');
            lines.push(
                `  - [${t.status || 'open'}] ${t.title || '(no title)'} (due ${t.due_date || '—'}) ${tag ? `· ${tag}` : ''}${t.details ? ` — ${String(t.details).slice(0, 160)}` : ''}`
            );
        });
        if (doneTasks.length) {
            lines.push('Recently completed tasks (max 20):');
            doneTasks.slice(0, 20).forEach((t) => {
                lines.push(
                    `  - [done ${t.completed_at ? t.completed_at.slice(0, 10) : ''}] ${t.title || '(no title)'}${t.completion_note ? ` — note: ${String(t.completion_note).slice(0, 160)}` : ''}`
                );
            });
        }

        lines.push('');
        lines.push(`Meeting minutes & field notes (${(minutes || []).length} entries):`);
        (minutes || []).slice(0, 40).forEach((m) => {
            const atts = attsByParent.get(`minute:${m.id}`) || [];
            const attList = atts.length
                ? ` [${atts.length} attachment${atts.length === 1 ? '' : 's'}: ${atts
                      .slice(0, 5)
                      .map((a) => a.file_name)
                      .join(', ')}${atts.length > 5 ? '…' : ''}]`
                : '';
            lines.push(
                `  - ${m.meeting_date || '—'} · ${m.title || '(no title)'}${attList}${m.topics ? ` — topics: ${String(m.topics).slice(0, 200)}` : ''}${m.action_items ? ` — actions: ${String(m.action_items).slice(0, 200)}` : ''}`
            );
        });

        const openC = (complaints || []).filter((c) => c.status === 'open');
        lines.push('');
        lines.push(
            `Complaints / incidents ledger — total ${complaints.length} · open ${openC.length} · resolved ${complaints.length - openC.length}`
        );
        (complaints || []).slice(0, 40).forEach((c) => {
            const who = c.about_worker_name ? `about:${c.about_worker_name}` : c.about_block_name ? `about:${c.about_block_name}` : '';
            lines.push(
                `  - [${c.status || '?'}] ${c.incident_date || '—'} · ${c.topic || '(no topic)'} · reported by ${c.reported_by || '—'}${who ? ` · ${who}` : ''}${c.notes ? ` — ${String(c.notes).slice(0, 200)}` : ''}${c.resolution ? ` — resolution: ${String(c.resolution).slice(0, 200)}` : ''}`
            );
        });

        if ((workerNotes || []).length) {
            lines.push('');
            lines.push(`Worker notes (private per-staff log, newest first, max 60):`);
            (workerNotes || []).slice(0, 60).forEach((n) => {
                lines.push(
                    `  - ${n.note_date || '—'} · ${n.worker_name || `worker#${n.worker_id}`} · [${n.category || 'general'}] ${String(n.note || '').slice(0, 200)}`
                );
            });
        }

        const unlinked = (attachments || []).filter((a) => a.parent_type !== 'minute');
        if (unlinked.length) {
            lines.push('');
            lines.push(`Other logbook attachments (not attached to minutes):`);
            unlinked.slice(0, 30).forEach((a) => {
                const kb = a.size_bytes ? Math.round(a.size_bytes / 1024) + ' KB' : '';
                lines.push(`  - ${a.parent_type}#${a.parent_id}: ${a.file_name}${kb ? ` · ${kb}` : ''} · ${a.uploaded_at || ''}`);
            });
        }

        return lines;
    },

    async buildAIContextSnapshot() {
        if (isManagerRole()) {
            const parts = [
                'MANAGER ROLE — restricted context.',
                'Financial ledger, SACCO, payroll, and lodge P&L are withheld.',
                'Use Field Operations, Crop Health, Harvest, and the Logbook for operational questions.',
            ];
            try {
                const logbook = await this._getLogbookSnapshotParts();
                parts.push('');
                parts.push('=== LOGBOOK (TASKS · MINUTES · COMPLAINTS · WORKER NOTES) ===');
                parts.push(...this._formatLogbookSection(logbook));
            } catch (e) {
                parts.push(`(Could not load logbook: ${e.message || e})`);
            }
            return parts.join('\n');
        }
        if (isSaccoLead()) {
            return [
                'SACCO LEAD — restricted context.',
                'Only SACCO-related context should be discussed here; full farm/lodge ledger is not included.',
            ].join('\n');
        }
        if (isLodgeLead()) {
            return [
                'LODGE LEAD — restricted context.',
                'Only lodge operations context; farm and SACCO ledger detail is not included.',
            ].join('\n');
        }
        const fmtUgx = (v) => {
            const n = Number(v);
            if (Number.isNaN(n)) return String(v ?? '');
            return 'UGX ' + Math.round(n).toLocaleString();
        };
        const out = [];
        const H = (title) => {
            out.push('');
            out.push(`=== ${title} ===`);
        };
        const pad = (n) => String(n).padStart(2, '0');
        const d0 = new Date();
        const y = d0.getFullYear();
        const m = d0.getMonth();
        const ym = `${y}-${pad(m + 1)}`;
        const lastDay = new Date(y, m + 1, 0).getDate();
        const from = `${y}-${pad(m + 1)}-01`;
        const to = `${y}-${pad(m + 1)}-${pad(lastDay)}`;

        try {
            const [
                blocks,
                batches,
                fin,
                finByCat,
                finItems,
                cashCh,
                wf,
                inv,
                invAlerts,
                stats,
                contracts,
                saccoMem,
                sacSum,
                saccoSavings,
                saccoLoans,
                saccoRepayments,
                saccoFin,
                maintCard,
                maintRollup,
                maintActuals,
                payrollRuns,
                insights,
                nursery,
                mothers,
                ipm,
                soil,
                fertility,
                irrig,
                shade,
                stumping,
                lodge,
                meta,
                dashInsights,
            ] = await Promise.all([
                this.getBlocks(),
                this.getBatches().catch(() => []),
                this.getFinanceSummary().catch(() => ({})),
                this.getFinanceByCategory().catch(() => []),
                this.getFinanceItems().catch(() => []),
                this.getCashByChannel('1970-01-01', '2099-12-31').catch(() => ({})),
                this.getWorkforce().catch(() => ({ departments: [] })),
                this.getInventory().catch(() => []),
                this.getInventoryAlerts().catch(() => []),
                this.getComputedStats().catch(() => ({})),
                this.getContracts().catch(() => []),
                this.getSaccoMembers().catch(() => []),
                this.getSaccoSummary().catch(() => null),
                this.getSaccoSavings().catch(() => []),
                this.getSaccoLoans().catch(() => []),
                this.getSaccoRepayments().catch(() => []),
                this.getSaccoFinanceItems().catch(() => []),
                this.getMaintenanceRateCard().catch(() => ({ set: null, lines: [] })),
                this.getMaintenanceBudgetRollup().catch(() => null),
                this.getMaintenanceExpenseActualsByKey(from, to).catch(() => ({})),
                this.getPayrollRuns().catch(() => []),
                this.getInsights().catch(() => []),
                this.getNurseryBatches().catch(() => []),
                this.getMotherGardens().catch(() => []),
                this.getIpmRecords().catch(() => []),
                this.getSoilRecords().catch(() => []),
                this.getFertilityApplications().catch(() => []),
                this.getIrrigationLogs().catch(() => []),
                this.getShadeTrees().catch(() => []),
                this.getStumpingCycles().catch(() => []),
                this.getLodgeSummary().catch(() => null),
                this.getMeta().catch(() => ({})),
                this.getComputedDashboardInsights().catch(() => []),
            ]);

            const payrollDetail = await Promise.all(
                (payrollRuns || []).slice(0, 8).map(async (run) => ({
                    run,
                    lines: await this.getPayrollLines(run.id).catch(() => []),
                }))
            );

            const payrollTotals = await this.getPayrollSheetTotals(ym).catch(() => null);

            out.push(`NYAKAMENTA COFFEE ESTATE — FULL DATA SNAPSHOT (${new Date().toISOString().slice(0, 19)}Z)`);
            out.push('CURRENCY: All monetary amounts in this snapshot are UGX (Ugandan Shillings), not USD.');
            out.push('Note: Very long lists are capped; section totals and rollups are authoritative.');

            H('APP / META');
            out.push(`Meta acres: ${meta.estateAcres != null ? meta.estateAcres : '—'} · Season: ${meta.currentSeason || '—'} · Grade: ${meta.selectedGrade || '—'} · Plant capacity target: ${meta.farmPlantCapacity ?? '—'}`);

            H('COMPUTED ESTATE STATS');
            out.push(`Season health score: ${stats.seasonHealthScore ?? '—'}`);
            out.push(`Green bean output (kg, batches): ${stats.totalGreenBeanOutput ?? '—'}`);
            out.push(`Avg conversion %: ${stats.avgConversion ?? '—'} · Active/alert batches (count): ${stats.activeBatches ?? '—'} · Alert batches: ${stats.alertBatches ?? '—'}`);
            out.push(`Total coffee plants (blocks): ${stats.totalPlants ?? '—'} · Farm capacity (plants): ${stats.farmPlantCapacity ?? '—'}`);

            if (dashInsights && dashInsights.length) {
                H('LIVE DASHBOARD INSIGHTS (computed)');
                dashInsights.slice(0, 25).forEach((i) => {
                    out.push(`- [${i.severity || '?'}] ${i.module || ''}: ${i.title || ''} — ${String(i.body || '').slice(0, 220)}`);
                });
            }

            H('BLOCKS');
            const totalAc = blocks.reduce((s, b) => s + (Number(b.acres) || 0), 0);
            const totalKg = blocks.reduce((s, b) => s + (Number(b.kgProcessed) || 0), 0);
            const tPlants = blocks.reduce((s, b) => s + Number(b.plant_count || 0), 0);
            out.push(`Count: ${blocks.length} · Total acres: ${totalAc.toFixed(1)} · Total kg processed (blocks): ${totalKg} · Total plants: ${tPlants}`);
            blocks.forEach((b) => {
                const kpa = b.acres > 0 ? ((b.kgProcessed || 0) / b.acres).toFixed(1) : '—';
                out.push(
                    `  - ${b.name || b.id}: ${b.acres} ac, ${Number(b.plant_count || 0)} trees, ${b.variety || '—'}, alt ${b.altitude || '—'}, ${b.status}, kg ${b.kgProcessed || 0}, kg/ac ${kpa}`
                );
            });

            H('PROCESSING BATCHES');
            out.push(`Total batches: ${batches.length}`);
            batches.slice(0, 100).forEach((b) => {
                out.push(
                    `  - ${b.id || '?'}: ${b.blockName || b.block_id} · ${b.stage || '—'} · in ${b.kgIn || 0} out ${b.kgOut || 0} kg · ${b.status} · ${b.date || ''} · moisture ${b.moisture ?? '—'}`
                );
            });
            if (batches.length > 100) out.push(`  ... (${batches.length - 100} more batches omitted)`);

            H('FARM FINANCE (LEDGER)');
            out.push(`Totals — Revenue: ${fmtUgx(fin.totalRevenue)} · Expenses: ${fmtUgx(fin.totalExpenses)} · Net: ${fmtUgx(fin.netProfit)}`);
            out.push('By category:');
            (finByCat || []).forEach((r) => {
                out.push(`  - ${r.category || '—'} (${r.type}): ${fmtUgx(r.total)} · ${r.count} lines`);
            });
            out.push('Cash by channel (all time):');
            ['cash', 'mobile_money', 'bank_transfer'].forEach((k) => {
                const x = cashCh[k] || { revenue: 0, expense: 0, net: 0 };
                out.push(`  - ${k}: revenue ${fmtUgx(x.revenue)} · expense ${fmtUgx(x.expense)} · net ${fmtUgx(x.net)}`);
            });
            out.push('Recent ledger lines (newest first, max 200):');
            (finItems || []).slice(0, 200).forEach((r) => {
                const mak = r.maintenance_activity_key ? ` [maint:${r.maintenance_activity_key}]` : '';
                const blk = r.blockName ? ` [block:${r.blockName}]` : '';
                out.push(
                    `  - ${r.date || ''} | ${r.type} | ${r.category || ''} | ${fmtUgx(r.amount)} | ${String(r.description || '').slice(0, 90)}${mak}${blk} | ${r.payment_method || ''}`
                );
            });
            if ((finItems || []).length > 200) out.push(`  ... (${finItems.length - 200} more lines omitted)`);

            H('WORKFORCE ROSTER');
            const deps = wf.departments || [];
            const perm = deps.filter((w) => w.type === 'Permanent').length;
            const seas = deps.filter((w) => w.type === 'Seasonal').length;
            const saccoN = deps.filter((w) => Number(w.sacco_member) === 1).length;
            out.push(`On roster: ${deps.length} · Permanent: ${perm} · Seasonal: ${seas} · SACCO flag on: ${saccoN}`);
            out.push(`Payroll MTD (model field on workforce): ${fmtUgx(wf.payrollMtd || 0)}`);
            deps.forEach((w) => {
                out.push(
                    `  - ${w.name || w.id}: ${w.department || '—'} · ${w.type || '—'} · gross ${fmtUgx(w.payroll)} · ${w.role || '—'} · SACCO ${Number(w.sacco_member) === 1 ? 'yes' : 'no'}`
                );
            });

            H('DOMESTIC / EXPORT CONTRACTS');
            (contracts || []).forEach((c) => {
                out.push(
                    `  - ${c.id}: ${c.buyer} → ${c.destination || ''} · ${c.grade} · ${c.netKg}kg @ ${fmtUgx(c.pricePerKg)}/kg · total ${fmtUgx(c.totalValue)} · ${c.status} · ETD ${c.etd || ''}`
                );
            });

            H('INVENTORY');
            out.push(`Items: ${inv.length} · Alert rows: ${invAlerts.length}`);
            (invAlerts || []).forEach((r) => out.push(`  ALERT: ${r.name} · qty ${r.quantity} ${r.unit} · ${r.condition}`));
            (inv || []).forEach((r) => {
                out.push(`  - ${r.name}: ${r.category} · ${r.quantity} ${r.unit} · ${r.condition} · ${r.location || ''} · unit value ${fmtUgx(r.unit_value)}`);
            });

            H('MAINTENANCE RATE CARD & ESTIMATES');
            if (maintCard && maintCard.set) {
                out.push(`Set: ${maintCard.set.label || ''} ${maintCard.set.source_note || ''}`);
            }
            (maintCard.lines || []).forEach((ln) => {
                out.push(`  - ${ln.activity_key}: ${ln.label} · ${ln.unit} · ${fmtUgx(ln.rate_ugx)}`);
            });
            if (maintRollup) {
                out.push(
                    `Rollup: acres ${maintRollup.totalAcres} · per-acre est ${fmtUgx(maintRollup.farmPerAcreTotal)} · fixed ${fmtUgx(maintRollup.farmFixedMonthly)} · combined ${fmtUgx(maintRollup.farmGrand)}`
                );
            }
            out.push(`Tagged maintenance expenses (${ym}):`);
            Object.entries(maintActuals || {}).forEach(([k, v]) => out.push(`  - ${k}: ${fmtUgx(v)}`));

            H('SACCO');
            if (sacSum) {
                out.push(
                    `Summary: members ${sacSum.members} · savings ${fmtUgx(sacSum.totalSavings)} · loan book ${fmtUgx(sacSum.totalLoanBook)} · outstanding ${fmtUgx(sacSum.outstandingLoans)}`
                );
            }
            out.push('Members:');
            (saccoMem || []).forEach((m) => {
                out.push(`  - ${m.member_no}: ${m.full_name} · ${m.status} · wf ${m.workforce_id ?? '—'}`);
            });
            out.push('Loans:');
            (saccoLoans || []).forEach((l) => {
                out.push(
                    `  - #${l.id} ${l.member_name || ''}: ${fmtUgx(l.amount)} @ ${l.interest_rate}% · ${l.status} · issued ${l.issue_date || ''}`
                );
            });
            out.push('Recent savings (max 40):');
            (saccoSavings || []).slice(0, 40).forEach((s) => {
                out.push(`  - ${s.deposit_date}: ${fmtUgx(s.amount)} · ${s.member_name || s.member_id} · ${s.method || ''}`);
            });
            out.push('Recent repayments (max 40):');
            (saccoRepayments || []).slice(0, 40).forEach((r) => {
                out.push(`  - ${r.repayment_date}: ${fmtUgx(r.amount)} · loan ${r.loan_id} · ${r.member_name || ''}`);
            });
            out.push('SACCO finance items (max 40):');
            (saccoFin || []).slice(0, 40).forEach((r) => {
                out.push(`  - ${r.date}: ${r.type} ${r.category} ${fmtUgx(r.amount)} | ${String(r.description || '').slice(0, 70)}`);
            });

            H('PAYROLL');
            if (payrollTotals && payrollTotals.hasRun) {
                out.push(`Month ${ym}: gross ${fmtUgx(payrollTotals.gross)} · net ${fmtUgx(payrollTotals.netPay)} · to SACCO ${fmtUgx(payrollTotals.saccoTotal)} · line count ${payrollTotals.lineCount}`);
            }
            payrollDetail.forEach(({ run, lines }) => {
                out.push(`Run ${run.year_month}: status ${run.status} · posted ${run.posted_at || '—'} (${lines.length} lines)`);
                lines.forEach((pl) => {
                    out.push(
                        `  - ${pl.full_name}: gross ${fmtUgx(pl.gross_salary)} · net ${fmtUgx(pl.net_pay)} · save ${fmtUgx(pl.sacco_saving)} · books ${fmtUgx(pl.sacco_book_fee)} · ${pl.member_no || '—'}`
                    );
                });
            });

            H('NURSERY & MOTHER GARDENS');
            (nursery || []).slice(0, 50).forEach((r) => out.push(`  - ${r.id}: ${r.stage} · ${r.clone_variety} · cuttings ${r.cuttings_placed ?? '—'}`));
            (mothers || []).slice(0, 50).forEach((r) => out.push(`  - ${r.id}: ${r.blockName || r.block_id} · ${r.clone_variety} · ${r.bush_count} bushes`));

            H('IPM / SOIL / FERTILITY / IRRIGATION');
            (ipm || []).slice(0, 50).forEach((r) =>
                out.push(`  - IPM ${r.scout_date} ${r.blockName || r.block_id}: ${r.pest_type} sev ${r.severity_rating ?? '—'}`)
            );
            (soil || []).slice(0, 50).forEach((r) => out.push(`  - Soil ${r.sample_date} ${r.blockName || r.block_id}: pH ${r.ph}`));
            (fertility || []).slice(0, 50).forEach((r) =>
                out.push(`  - Fert ${r.application_date} ${r.blockName || r.block_id}: ${r.product} ${r.total_kg}kg · ${fmtUgx(r.cost)}`)
            );
            (irrig || []).slice(0, 50).forEach((r) =>
                out.push(`  - Irrig ${r.log_date} ${r.blockName || r.block_id}: ${r.mm_applied}mm · ${r.method || ''}`)
            );

            H('SHADE & STUMPING');
            (shade || []).slice(0, 50).forEach((r) =>
                out.push(`  - Shade ${r.blockName || r.block_id}: ${r.species} · ${r.count} · h ${r.current_height_m ?? '—'}`)
            );
            (stumping || []).slice(0, 50).forEach((r) =>
                out.push(`  - Stump ${r.blockName || r.block_id}: ${r.status} · ${r.stump_date || ''}`)
            );

            H('LODGE');
            if (lodge) {
                out.push(
                    `Units ${lodge.units} · occupied ${lodge.occupied} · occupancy ${lodge.occupancyRate}% · bookings ${lodge.bookings} · revenue ${fmtUgx(lodge.revenue)} · expenses ${fmtUgx(lodge.expenses)} · net ${fmtUgx(lodge.net)}`
                );
            } else {
                out.push('(no summary)');
            }

            H('STATIC INSIGHTS TABLE');
            (insights || []).slice(0, 40).forEach((r) => out.push(`  - [${r.severity}] ${r.module}: ${r.title}`));

            try {
                const logbook = await this._getLogbookSnapshotParts();
                H('LOGBOOK (TASKS · MINUTES · COMPLAINTS · WORKER NOTES)');
                this._formatLogbookSection(logbook).forEach((ln) => out.push(ln));
            } catch (e) {
                H('LOGBOOK');
                out.push(`(Could not load logbook: ${e.message || e})`);
            }

            return out.join('\n');
        } catch (e) {
            return `ERROR building AI context: ${e.message || String(e)}`;
        }
    },

    // ── Logbook: Tasks ────────────────────────────────────────
    /** List manager tasks, optionally filtered by status; joins block and worker names. */
    async getLogbookTasks({ status } = {}) {
        let sql = `
            SELECT t.*, b.name AS block_name, w.name AS worker_name
            FROM logbook_tasks t
            LEFT JOIN blocks b ON b.id = t.block_id
            LEFT JOIN workforce w ON w.id = t.worker_id
        `;
        const params = [];
        if (status) {
            sql += ' WHERE t.status = ?';
            params.push(status);
        }
        sql += " ORDER BY CASE t.status WHEN 'done' THEN 1 ELSE 0 END, COALESCE(t.due_date,'9999-12-31') ASC, t.id DESC";
        return await getEstateApi().query(sql, params);
    },
    async addLogbookTask({ title, details, due_date, priority, block_id, worker_id }) {
        const now = new Date().toISOString();
        return await getEstateApi().execute(
            `INSERT INTO logbook_tasks (title, details, due_date, priority, status, block_id, worker_id, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [
                String(title || '').trim(),
                details ? String(details).trim() : null,
                due_date || null,
                priority || 'normal',
                'open',
                block_id || null,
                worker_id != null ? Number(worker_id) : null,
                now,
                now,
            ]
        );
    },
    async updateLogbookTask(id, fields) {
        const payload = { ...fields, updated_at: new Date().toISOString() };
        const sets = Object.keys(payload).map((k) => `${k} = ?`).join(', ');
        const vals = [...Object.values(payload), id];
        return await getEstateApi().execute(`UPDATE logbook_tasks SET ${sets} WHERE id = ?`, vals);
    },
    async completeLogbookTask(id, completionNote) {
        const now = new Date().toISOString();
        return await getEstateApi().execute(
            `UPDATE logbook_tasks SET status = 'done', completed_at = ?, completion_note = ?, updated_at = ? WHERE id = ?`,
            [now, completionNote ? String(completionNote).trim() : null, now, id]
        );
    },
    async reopenLogbookTask(id) {
        const now = new Date().toISOString();
        return await getEstateApi().execute(
            `UPDATE logbook_tasks SET status = 'open', completed_at = NULL, updated_at = ? WHERE id = ?`,
            [now, id]
        );
    },
    async deleteLogbookTask(id) {
        return await getEstateApi().execute(`DELETE FROM logbook_tasks WHERE id = ?`, [id]);
    },

    // ── Logbook: Meeting minutes ──────────────────────────────
    async getLogbookMinutes() {
        return await getEstateApi().query(
            `SELECT * FROM logbook_minutes ORDER BY COALESCE(meeting_date,'0000-00-00') DESC, id DESC`
        );
    },
    async addLogbookMinute({ meeting_date, title, attendees, topics, action_items }) {
        const now = new Date().toISOString();
        return await getEstateApi().execute(
            `INSERT INTO logbook_minutes (meeting_date, title, attendees, topics, action_items, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?)`,
            [
                meeting_date || null,
                title ? String(title).trim() : null,
                attendees ? String(attendees).trim() : null,
                topics ? String(topics).trim() : null,
                action_items ? String(action_items).trim() : null,
                now,
                now,
            ]
        );
    },
    async updateLogbookMinute(id, fields) {
        const payload = { ...fields, updated_at: new Date().toISOString() };
        const sets = Object.keys(payload).map((k) => `${k} = ?`).join(', ');
        const vals = [...Object.values(payload), id];
        return await getEstateApi().execute(`UPDATE logbook_minutes SET ${sets} WHERE id = ?`, vals);
    },
    async deleteLogbookMinute(id) {
        return await getEstateApi().execute(`DELETE FROM logbook_minutes WHERE id = ?`, [id]);
    },

    // ── Logbook: Worker notes (per-staff log) ─────────────────
    async getWorkerNotes(workerId) {
        return await getEstateApi().query(
            `SELECT * FROM worker_notes WHERE worker_id = ?
             ORDER BY COALESCE(note_date,'0000-00-00') DESC, id DESC`,
            [workerId]
        );
    },
    async addWorkerNote({ worker_id, note_date, category, note }) {
        const now = new Date().toISOString();
        return await getEstateApi().execute(
            `INSERT INTO worker_notes (worker_id, note_date, category, note, created_at, updated_at)
             VALUES (?,?,?,?,?,?)`,
            [
                Number(worker_id),
                note_date || now.slice(0, 10),
                category || 'general',
                String(note || '').trim(),
                now,
                now,
            ]
        );
    },
    async deleteWorkerNote(id) {
        return await getEstateApi().execute(`DELETE FROM worker_notes WHERE id = ?`, [id]);
    },

    // ── Logbook: Complaints / incidents ledger ────────────────
    async getLogbookComplaints({ status } = {}) {
        let sql = `
            SELECT c.*, w.name AS about_worker_name, b.name AS about_block_name
            FROM logbook_complaints c
            LEFT JOIN workforce w ON w.id = c.about_worker_id
            LEFT JOIN blocks b ON b.id = c.about_block_id
        `;
        const params = [];
        if (status) {
            sql += ' WHERE c.status = ?';
            params.push(status);
        }
        sql += ` ORDER BY CASE c.status WHEN 'resolved' THEN 1 ELSE 0 END, COALESCE(c.incident_date,'0000-00-00') DESC, c.id DESC`;
        return await getEstateApi().query(sql, params);
    },
    async addLogbookComplaint({ incident_date, reported_by, about_worker_id, about_block_id, topic, notes }) {
        const now = new Date().toISOString();
        return await getEstateApi().execute(
            `INSERT INTO logbook_complaints
                (incident_date, reported_by, about_worker_id, about_block_id, topic, notes, status, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [
                incident_date || now.slice(0, 10),
                reported_by ? String(reported_by).trim() : null,
                about_worker_id != null ? Number(about_worker_id) : null,
                about_block_id || null,
                topic ? String(topic).trim() : null,
                notes ? String(notes).trim() : null,
                'open',
                now,
                now,
            ]
        );
    },
    async resolveLogbookComplaint(id, resolution) {
        const now = new Date().toISOString();
        return await getEstateApi().execute(
            `UPDATE logbook_complaints SET status = 'resolved', resolution = ?, resolved_at = ?, updated_at = ? WHERE id = ?`,
            [resolution ? String(resolution).trim() : null, now, now, id]
        );
    },
    async reopenLogbookComplaint(id) {
        const now = new Date().toISOString();
        return await getEstateApi().execute(
            `UPDATE logbook_complaints SET status = 'open', resolved_at = NULL, updated_at = ? WHERE id = ?`,
            [now, id]
        );
    },
    async deleteLogbookComplaint(id) {
        return await getEstateApi().execute(`DELETE FROM logbook_complaints WHERE id = ?`, [id]);
    },

    // ── Logbook attachments (files for minutes / complaints / etc.) ───

    /** Read a File/Blob into a base64 string. */
    async _fileToBase64(file) {
        if (!file) throw new Error('No file provided');
        const buf = await file.arrayBuffer();
        // Chunk to avoid stack overflow on large files.
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    },

    /** Metadata-only listing (no BLOB) — safe via the generic query endpoint. */
    async listLogbookAttachments(parentType, parentId) {
        return await getEstateApi().query(
            `SELECT id, parent_type, parent_id, file_name, mime_type, size_bytes, uploaded_at, uploaded_by
             FROM logbook_attachments
             WHERE parent_type = ? AND parent_id = ?
             ORDER BY uploaded_at DESC, id DESC`,
            [parentType, parentId]
        );
    },

    /**
     * Upload a File/Blob as an attachment for a logbook parent (minute, complaint, task, worker_note).
     * Works in both Electron and the web server.
     */
    async uploadLogbookAttachment({ parent_type, parent_id, file }) {
        const api = getEstateApi();
        const base64 = await this._fileToBase64(file);
        const payload = {
            parent_type,
            parent_id: Number(parent_id),
            file_name: file.name || 'attachment',
            mime_type: file.type || null,
            base64,
        };
        if (typeof api.uploadLogbookAttachment === 'function') {
            const out = await api.uploadLogbookAttachment(payload);
            if (out && out.ok === false) throw new Error(out.error || 'Upload failed');
            return out;
        }
        throw new Error('Attachment uploads require the desktop app or the web server bridge.');
    },

    async deleteLogbookAttachment(id) {
        const api = getEstateApi();
        if (typeof api.deleteLogbookAttachment === 'function') {
            const out = await api.deleteLogbookAttachment(id);
            if (out && out.ok === false) throw new Error(out.error || 'Delete failed');
            return out;
        }
        // Fallback: plain delete row (file row carries its own BLOB so this is still fine).
        return await api.execute(`DELETE FROM logbook_attachments WHERE id = ?`, [Number(id)]);
    },

    /**
     * Return an object URL for an attachment that the caller can drop into
     * `<a href>`, `<img src>`, or window.open. Caller should `URL.revokeObjectURL` when done.
     */
    async getLogbookAttachmentBlobUrl(id) {
        const api = getEstateApi();
        if (typeof api.getLogbookAttachmentBlobUrl === 'function') {
            return await api.getLogbookAttachmentBlobUrl(id);
        }
        // Electron path: fetch base64 via IPC, then build a Blob locally.
        if (typeof api.getLogbookAttachment === 'function') {
            const row = await api.getLogbookAttachment(id);
            if (!row || row.ok === false) throw new Error(row?.error || 'Attachment not found');
            const bin = atob(row.base64 || '');
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
            const blob = new Blob([bytes], { type: row.mime_type || 'application/octet-stream' });
            return URL.createObjectURL(blob);
        }
        throw new Error('Attachment download not available in this environment.');
    },
};

// ── Finance Categories ────────────────────────────────────────
// Uganda Robusta farm expense & revenue taxonomy
export const FINANCE_CATEGORIES = {
    Expense: [
        // Field Operations
        { name: 'Fertiliser — Broadcast', group: 'Field Operations' },
        { name: 'Fertiliser — Foliar Spray', group: 'Field Operations' },
        { name: 'Herbicide / Weeding', group: 'Field Operations' },
        { name: 'Pesticide / IPM Input', group: 'Field Operations' },
        { name: 'Mulching Material', group: 'Field Operations' },
        { name: 'Stumping & Pruning', group: 'Field Operations' },
        { name: 'Irrigation Running Cost', group: 'Field Operations' },
        { name: 'Shade Management', group: 'Field Operations' },
        // Processing
        { name: 'Pulping / Processing', group: 'Processing' },
        { name: 'Drying Bed Maintenance', group: 'Processing' },
        { name: 'Hulling / Milling', group: 'Processing' },
        { name: 'Grading & Sorting', group: 'Processing' },
        { name: 'Packaging & Bagging', group: 'Processing' },
        // Labour
        { name: 'Permanent Staff Payroll', group: 'Labour' },
        { name: 'Casual / Seasonal Labour', group: 'Labour' },
        { name: 'Supervisor Allowances', group: 'Labour' },
        { name: 'NSSF / PAYE Contributions', group: 'Labour' },
        // Infrastructure & Equipment
        { name: 'Equipment Purchase', group: 'Infrastructure' },
        { name: 'Equipment Service / Repair', group: 'Infrastructure' },
        { name: 'Fuel & Lubricants', group: 'Infrastructure' },
        { name: 'Irrigation Infrastructure', group: 'Infrastructure' },
        { name: 'Store / Building Repair', group: 'Infrastructure' },
        // Transport
        { name: 'Cherry Transport', group: 'Transport' },
        { name: 'Green Bean Transport', group: 'Transport' },
        { name: 'Domestic transport', group: 'Transport' },
        // Administration
        { name: 'Land Rates / Lease', group: 'Administration' },
        { name: 'Certification Fees', group: 'Administration' },
        { name: 'Insurance', group: 'Administration' },
        { name: 'Office & Admin', group: 'Administration' },
        { name: 'Other Expense', group: 'Other' },
    ],
    Revenue: [
        { name: 'Green coffee sale (domestic)', group: 'Sales' },
        { name: 'Robusta Screen 18 Sale', group: 'Sales' },
        { name: 'Robusta Screen 15 Sale', group: 'Sales' },
        { name: 'Robusta FAQ Sale', group: 'Sales' },
        { name: 'Local Market Sale', group: 'Sales' },
        { name: 'By-Product (Husks/Pulp)', group: 'By-Products' },
        { name: 'Nursery Plant Sales', group: 'By-Products' },
        { name: 'Grant / Subsidy', group: 'Other' },
        { name: 'Other Revenue', group: 'Other' },
    ],
};

// ── Inventory Categories ──────────────────────────────────────
export const INVENTORY_CATEGORIES = [
    'Equipment',   // Tractors, pulpers, hullers, generators, pumps
    'Tool',        // Slashers, pruning saws, secateurs, hoes, sprayers
    'Chemical',    // Fertilisers, pesticides, herbicides, fungicides
    'PPE',         // Gloves, boots, goggles, overalls, masks
    'Consumable',  // Bags, string, fuel, oil, jute sacks
    'Spare Part',  // Belts, blades, bearings, filters
];

export { dataService };
