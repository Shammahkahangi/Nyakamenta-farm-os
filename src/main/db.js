// ============================================================
// db.js — SQLite Database Logic (Main Process)
// ============================================================
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function tableExists(tableName) {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(tableName);
    return !!row;
}

function columnExists(tableName, columnName) {
    if (!tableExists(tableName)) return false;
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.some(col => col.name === columnName);
}

function addColumnIfMissing(tableName, columnName, definitionSql) {
    if (!tableExists(tableName)) return;
    if (columnExists(tableName, columnName)) return;
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
    console.log(`Schema upgraded: added ${tableName}.${columnName}`);
}

function applySchemaUpgrades() {
    // Legacy SACCO table compatibility (older databases may miss these columns).
    addColumnIfMissing('sacco_loans', 'member_id', 'INTEGER');
    addColumnIfMissing('sacco_loans', 'amount', 'REAL');
    addColumnIfMissing('sacco_loans', 'interest_rate', 'REAL DEFAULT 0');
    addColumnIfMissing('sacco_loans', 'issue_date', 'TEXT');
    addColumnIfMissing('sacco_loans', 'due_date', 'TEXT');
    addColumnIfMissing('sacco_loans', 'term_months', 'INTEGER DEFAULT 12');
    addColumnIfMissing('sacco_loans', 'status', "TEXT DEFAULT 'Active'");
    // Some DBs (e.g. remote sync) use `principal`; app code historically used `amount`. Keep both in sync.
    addColumnIfMissing('sacco_loans', 'principal', 'REAL');

    // Legacy SACCO table compatibility for evolving schemas.
    addColumnIfMissing('sacco_members', 'member_no', 'TEXT');
    addColumnIfMissing('sacco_members', 'full_name', 'TEXT');
    addColumnIfMissing('sacco_members', 'phone', 'TEXT');
    addColumnIfMissing('sacco_members', 'national_id', 'TEXT');
    addColumnIfMissing('sacco_members', 'join_date', 'TEXT');
    addColumnIfMissing('sacco_members', 'status', "TEXT DEFAULT 'Active'");
    addColumnIfMissing('sacco_members', 'workforce_id', 'INTEGER');

    addColumnIfMissing('sacco_savings', 'member_id', 'INTEGER');
    addColumnIfMissing('sacco_savings', 'amount', 'REAL');
    addColumnIfMissing('sacco_savings', 'deposit_date', 'TEXT');
    addColumnIfMissing('sacco_savings', 'method', 'TEXT');
    addColumnIfMissing('sacco_savings', 'notes', 'TEXT');

    addColumnIfMissing('sacco_repayments', 'loan_id', 'INTEGER');
    addColumnIfMissing('sacco_repayments', 'amount', 'REAL');
    addColumnIfMissing('sacco_repayments', 'repayment_date', 'TEXT');
    addColumnIfMissing('sacco_repayments', 'method', 'TEXT');
    addColumnIfMissing('sacco_repayments', 'notes', 'TEXT');

    addColumnIfMissing('sacco_finance_items', 'category', 'TEXT');
    addColumnIfMissing('sacco_finance_items', 'description', 'TEXT');
    addColumnIfMissing('sacco_finance_items', 'amount', 'REAL');
    addColumnIfMissing('sacco_finance_items', 'date', 'TEXT');
    addColumnIfMissing('sacco_finance_items', 'type', 'TEXT');

    // Legacy Lodge table compatibility (fixes missing lu.code and related fields).
    addColumnIfMissing('lodge_units', 'code', 'TEXT');
    addColumnIfMissing('lodge_units', 'name', 'TEXT');
    addColumnIfMissing('lodge_units', 'capacity', 'INTEGER DEFAULT 1');
    addColumnIfMissing('lodge_units', 'nightly_rate', 'REAL DEFAULT 0');
    addColumnIfMissing('lodge_units', 'status', "TEXT DEFAULT 'Available'");

    addColumnIfMissing('lodge_bookings', 'guest_name', 'TEXT');
    addColumnIfMissing('lodge_bookings', 'guest_phone', 'TEXT');
    addColumnIfMissing('lodge_bookings', 'unit_id', 'INTEGER');
    addColumnIfMissing('lodge_bookings', 'check_in', 'TEXT');
    addColumnIfMissing('lodge_bookings', 'check_out', 'TEXT');
    addColumnIfMissing('lodge_bookings', 'guests_count', 'INTEGER DEFAULT 1');
    addColumnIfMissing('lodge_bookings', 'booking_source', 'TEXT');
    addColumnIfMissing('lodge_bookings', 'status', "TEXT DEFAULT 'Booked'");

    addColumnIfMissing('lodge_payments', 'booking_id', 'INTEGER');
    addColumnIfMissing('lodge_payments', 'amount', 'REAL');
    addColumnIfMissing('lodge_payments', 'method', 'TEXT');
    addColumnIfMissing('lodge_payments', 'payment_date', 'TEXT');
    addColumnIfMissing('lodge_payments', 'status', "TEXT DEFAULT 'Paid'");

    addColumnIfMissing('lodge_expenses', 'category', 'TEXT');
    addColumnIfMissing('lodge_expenses', 'description', 'TEXT');
    addColumnIfMissing('lodge_expenses', 'amount', 'REAL');
    addColumnIfMissing('lodge_expenses', 'expense_date', 'TEXT');

    addColumnIfMissing('finance_items', 'payment_method', "TEXT DEFAULT 'cash'");
    addColumnIfMissing('finance_items', 'maintenance_activity_key', 'TEXT');
    addColumnIfMissing('finance_items', 'block_id', 'TEXT');
    addColumnIfMissing('finance_items', 'source_module', 'TEXT');
    addColumnIfMissing('finance_items', 'source_id', 'TEXT');

    addColumnIfMissing('irrigation_logs', 'cost_ugx', 'REAL DEFAULT 0');
    addColumnIfMissing('shade_trees', 'cost_ugx', 'REAL DEFAULT 0');
    addColumnIfMissing('stumping_cycles', 'cost_ugx', 'REAL DEFAULT 0');

    addColumnIfMissing('blocks', 'plant_count', 'INTEGER DEFAULT 0');

    addColumnIfMissing('workforce', 'contact', 'TEXT');
    const hadWorkforceSacco = columnExists('workforce', 'sacco_member');
    addColumnIfMissing('workforce', 'sacco_member', 'INTEGER DEFAULT 0');
    if (!hadWorkforceSacco && columnExists('workforce', 'sacco_member')) {
        try {
            db.prepare(
                `UPDATE workforce SET sacco_member = 1 WHERE id IN (SELECT workforce_id FROM sacco_members WHERE workforce_id IS NOT NULL)`
            ).run();
        } catch (e) {
            console.warn('workforce.sacco_member backfill:', e.message);
        }
    }

    syncSaccoLoanAmountPrincipal();
    pruneDemoDomesticDispatches();
    pruneDemoSaccoPlaceholderRows();
    pruneLegacyDepartmentSummaryWorkforce();
    ensureLogbookTables();
}

/**
 * Manager's private logbook (rural farm, single-user): tasks, meeting minutes,
 * per-worker notes, and an informal complaints / incidents ledger.
 * Idempotent so existing estate.db files upgrade cleanly.
 */
function ensureLogbookTables() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS logbook_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            details TEXT,
            due_date TEXT,
            priority TEXT DEFAULT 'normal',   -- low | normal | high
            status TEXT DEFAULT 'open',        -- open | in_progress | done | cancelled
            block_id TEXT,
            worker_id INTEGER,
            completed_at TEXT,
            completion_note TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS logbook_minutes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_date TEXT,
            title TEXT,
            attendees TEXT,
            topics TEXT,
            action_items TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS worker_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_id INTEGER NOT NULL,
            note_date TEXT,
            category TEXT DEFAULT 'general',  -- complaint | warning | commendation | absence | general
            note TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY(worker_id) REFERENCES workforce(id)
        );

        CREATE TABLE IF NOT EXISTS logbook_complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_date TEXT,
            reported_by TEXT,
            about_worker_id INTEGER,
            about_block_id TEXT,
            topic TEXT,
            notes TEXT,
            status TEXT DEFAULT 'open',        -- open | resolved | cancelled
            resolution TEXT,
            resolved_at TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS logbook_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_type TEXT NOT NULL,        -- 'minute' | 'complaint' | 'task' | 'worker_note'
            parent_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            mime_type TEXT,
            size_bytes INTEGER DEFAULT 0,
            data BLOB,
            uploaded_at TEXT,
            uploaded_by TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_logbook_attachments_parent
            ON logbook_attachments(parent_type, parent_id);
    `);
}

/** Decode a base64 string (strip any data: URL prefix) into a Buffer. */
function base64ToBuffer(b64) {
    const s = String(b64 || '').trim();
    const m = s.match(/^data:[^;]+;base64,(.*)$/i);
    return Buffer.from(m ? m[1] : s, 'base64');
}

/**
 * Insert a logbook attachment and return its row id + size.
 * Enforces a max size (default 40MB) so a single bad upload can't hog the app.
 */
const MAX_ATTACHMENT_BYTES = Number(process.env.ESTATE_MAX_ATTACHMENT_MB || 40) * 1024 * 1024;

function insertLogbookAttachment({ parent_type, parent_id, file_name, mime_type, base64, uploaded_by }) {
    if (!parent_type || !parent_id || !file_name || !base64) {
        throw new Error('Missing required attachment fields');
    }
    const buf = base64ToBuffer(base64);
    if (buf.length === 0) throw new Error('Empty file');
    if (buf.length > MAX_ATTACHMENT_BYTES) {
        throw new Error(`File too large (limit ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB)`);
    }
    const now = new Date().toISOString();
    const info = db.prepare(
        `INSERT INTO logbook_attachments
            (parent_type, parent_id, file_name, mime_type, size_bytes, data, uploaded_at, uploaded_by)
         VALUES (?,?,?,?,?,?,?,?)`
    ).run(
        String(parent_type),
        Number(parent_id),
        String(file_name).slice(0, 255),
        mime_type ? String(mime_type).slice(0, 120) : null,
        buf.length,
        buf,
        now,
        uploaded_by ? String(uploaded_by).slice(0, 120) : null
    );
    return { id: Number(info.lastInsertRowid), size_bytes: buf.length, uploaded_at: now };
}

/** Fetch an attachment's bytes and metadata (returns null if missing). */
function getLogbookAttachment(id) {
    const row = db.prepare(
        `SELECT id, parent_type, parent_id, file_name, mime_type, size_bytes, data, uploaded_at
         FROM logbook_attachments WHERE id = ?`
    ).get(Number(id));
    return row || null;
}

function deleteLogbookAttachment(id) {
    return db.prepare(`DELETE FROM logbook_attachments WHERE id = ?`).run(Number(id));
}

/** List attachment metadata (no BLOB) for a parent entry. */
function listLogbookAttachments(parentType, parentId) {
    return db.prepare(
        `SELECT id, parent_type, parent_id, file_name, mime_type, size_bytes, uploaded_at, uploaded_by
         FROM logbook_attachments
         WHERE parent_type = ? AND parent_id = ?
         ORDER BY uploaded_at DESC, id DESC`
    ).all(String(parentType), Number(parentId));
}

/**
 * Remove bundled QA / placeholder SACCO rows so the app shows real members only.
 * (Not in data.json — these often come from manual tests or old demo installs.)
 */
function pruneDemoSaccoPlaceholderRows() {
    if (!tableExists('sacco_members')) return;
    /** Lowercased names that are never real people in production (demo row, import footer). */
    const demoNames = ['peter kato', 'total'];
    try {
        const placeholders = demoNames.map(() => '?').join(',');
        const rows = db.prepare(`SELECT id FROM sacco_members WHERE lower(trim(full_name)) IN (${placeholders})`).all(...demoNames);
        if (!rows.length) return;
        const ids = rows.map((r) => r.id);
        const inPh = ids.map(() => '?').join(',');

        if (tableExists('payroll_lines') && columnExists('payroll_lines', 'sacco_member_id')) {
            db.prepare(`UPDATE payroll_lines SET sacco_member_id = NULL WHERE sacco_member_id IN (${inPh})`).run(...ids);
        }

        const loanRows = db.prepare(`SELECT id FROM sacco_loans WHERE member_id IN (${inPh})`).all(...ids);
        const loanIds = loanRows.map((r) => r.id);
        if (loanIds.length && tableExists('sacco_repayments')) {
            const liPh = loanIds.map(() => '?').join(',');
            db.prepare(`DELETE FROM sacco_repayments WHERE loan_id IN (${liPh})`).run(...loanIds);
        }
        if (tableExists('sacco_loans')) {
            db.prepare(`DELETE FROM sacco_loans WHERE member_id IN (${inPh})`).run(...ids);
        }
        if (tableExists('sacco_savings')) {
            db.prepare(`DELETE FROM sacco_savings WHERE member_id IN (${inPh})`).run(...ids);
        }
        const r = db.prepare(`DELETE FROM sacco_members WHERE id IN (${inPh})`).run(...ids);
        if (r.changes > 0) {
            console.log(`Removed ${r.changes} placeholder SACCO member row(s) (demo names).`);
        }
    } catch (e) {
        console.warn('pruneDemoSaccoPlaceholderRows:', e.message);
    }
}

/** Old seed stored department rollups as fake workers (type = Department Summary). Remove them so the roster shows real staff only. */
function pruneLegacyDepartmentSummaryWorkforce() {
    if (!tableExists('workforce')) return;
    try {
        if (columnExists('sacco_members', 'workforce_id')) {
            db.prepare(
                `UPDATE sacco_members SET workforce_id = NULL WHERE workforce_id IN (
                    SELECT id FROM workforce WHERE COALESCE(type, '') = 'Department Summary'
                )`
            ).run();
        }
        const r = db.prepare(`DELETE FROM workforce WHERE COALESCE(type, '') = 'Department Summary'`).run();
        if (r.changes > 0) {
            console.log(`Removed ${r.changes} legacy department-summary workforce row(s)`);
        }
    } catch (e) {
        console.warn('pruneLegacyDepartmentSummaryWorkforce:', e.message);
    }
}

/** Remove seeded demo rows for domestic / export-style dispatches (e.g. EX-2026-* demo IDs). */
function pruneDemoDomesticDispatches() {
    if (!tableExists('contracts')) return;
    try {
        const r = db.prepare(`DELETE FROM contracts WHERE id LIKE 'EX-2026-%'`).run();
        if (r.changes > 0) {
            console.log(`Removed ${r.changes} demo dispatch row(s) matching EX-2026-*`);
        }
    } catch (e) {
        console.warn('pruneDemoDomesticDispatches:', e.message);
    }
}

/** Mirror loan principal ↔ amount so NOT NULL constraints and UI stay consistent. */
function syncSaccoLoanAmountPrincipal() {
    if (!tableExists('sacco_loans')) return;
    try {
        if (columnExists('sacco_loans', 'principal') && columnExists('sacco_loans', 'amount')) {
            db.exec(`
                UPDATE sacco_loans SET principal = amount
                WHERE principal IS NULL AND amount IS NOT NULL;
            `);
            db.exec(`
                UPDATE sacco_loans SET amount = principal
                WHERE amount IS NULL AND principal IS NOT NULL;
            `);
        }
    } catch (e) {
        console.warn('syncSaccoLoanAmountPrincipal:', e.message);
    }
}

/** Whole-farm coffee plant capacity; split across blocks by acre when plant_count sums to zero. */
const FARM_PLANT_TOTAL = 27000;

function distributeDefaultPlantsIfEmpty() {
    if (!tableExists('blocks')) return;
    if (!columnExists('blocks', 'plant_count')) return;
    const sumRow = db.prepare('SELECT COALESCE(SUM(plant_count), 0) AS s FROM blocks').get();
    if (sumRow.s > 0) return;
    const totalAcres = Number(db.prepare('SELECT COALESCE(SUM(acres), 0) AS s FROM blocks').get().s) || 0;
    if (totalAcres <= 0) return;
    const rows = db.prepare('SELECT id, acres FROM blocks ORDER BY id').all();
    let allocated = 0;
    rows.forEach((r, i) => {
        const n =
            i === rows.length - 1
                ? FARM_PLANT_TOTAL - allocated
                : Math.round(FARM_PLANT_TOTAL * (Number(r.acres) / totalAcres));
        allocated += n;
        db.prepare('UPDATE blocks SET plant_count = ? WHERE id = ?').run(n, r.id);
    });
    console.log(`Distributed ${FARM_PLANT_TOTAL} coffee plants across blocks (by acreage).`);
}

const MAINTENANCE_DEFAULTS_JSON = path.join(__dirname, '../../data/maintenance_rates_defaults.json');

function seedMaintenanceRatesFromJson() {
    if (!tableExists('maintenance_rate_sets')) return;
    const raw = fs.readFileSync(MAINTENANCE_DEFAULTS_JSON, 'utf8');
    const j = JSON.parse(raw);
    const created = new Date().toISOString();
    const eff = j.effective_from || '';
    const insSet = db.prepare(
        `INSERT INTO maintenance_rate_sets (label, source_note, effective_from, created_at) VALUES (?,?,?,?)`
    );
    const info = insSet.run(j.label || 'Default', j.source_note || '', eff, created);
    const setId = Number(info.lastInsertRowid);
    const insLine = db.prepare(
        `INSERT INTO maintenance_rate_lines (set_id, sort_order, activity_key, label, unit, rate_ugx, allocation_method) VALUES (?,?,?,?,?,?,?)`
    );
    (j.lines || []).forEach((line, i) => {
        insLine.run(
            setId,
            i,
            String(line.activity_key || '').trim(),
            String(line.label || '').trim(),
            line.unit === 'fixed_monthly' ? 'fixed_monthly' : 'per_acre',
            Number(line.rate_ugx) || 0,
            line.allocation_method || null
        );
    });
}

/** First run: one rate set from bundled defaults. */
function seedMaintenanceRatesIfEmpty() {
    if (!tableExists('maintenance_rate_sets')) return;
    try {
        const n = db.prepare('SELECT COUNT(*) as c FROM maintenance_rate_sets').get().c;
        if (n > 0) return;
        if (!fs.existsSync(MAINTENANCE_DEFAULTS_JSON)) {
            console.warn('maintenance_rates_defaults.json not found; skipping seed.');
            return;
        }
        db.transaction(() => {
            seedMaintenanceRatesFromJson();
        })();
        console.log('Seeded default maintenance rate card.');
    } catch (e) {
        console.warn('seedMaintenanceRatesIfEmpty:', e.message);
    }
}

/** Replace all maintenance rates with defaults from JSON (user reset). */
function resetMaintenanceRatesToDefaults() {
    if (!tableExists('maintenance_rate_sets')) return { ok: false, error: 'Tables missing' };
    if (!fs.existsSync(MAINTENANCE_DEFAULTS_JSON)) {
        return { ok: false, error: 'Bundled defaults file missing' };
    }
    try {
        db.transaction(() => {
            db.exec('DELETE FROM maintenance_rate_sets');
            seedMaintenanceRatesFromJson();
        })();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
}

function initDB(appPath) {
    const dbPath = path.join(appPath, 'estate.db');
    db = new Database(dbPath);

    // Enable WAL for performance
    db.pragma('journal_mode = WAL');

    // ── Create Tables ───────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS blocks (
            id TEXT PRIMARY KEY,
            name TEXT,
            acres REAL,
            altitude INTEGER,
            variety TEXT,
            yield REAL,
            cost REAL,
            revenue REAL,
            status TEXT,
            kgProcessed REAL
        );

        CREATE TABLE IF NOT EXISTS batches (
            id TEXT PRIMARY KEY,
            block_id TEXT,
            stage TEXT,
            kgIn REAL,
            kgOut REAL,
            moisture REAL,
            conversion REAL,
            status TEXT,
            date TEXT,
            FOREIGN KEY(block_id) REFERENCES blocks(id)
        );

        CREATE TABLE IF NOT EXISTS finance_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT,
            description TEXT,
            amount REAL,
            date TEXT,
            type TEXT -- 'Expense' or 'Revenue'
        );

        CREATE TABLE IF NOT EXISTS workforce (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            role TEXT,
            department TEXT,
            payroll REAL,
            type TEXT, -- 'Permanent' or 'Seasonal'
            sacco_member INTEGER DEFAULT 0 -- 1 = enrolled in estate SACCO (optional)
        );

        CREATE TABLE IF NOT EXISTS contracts (
            id TEXT PRIMARY KEY,
            buyer TEXT,
            destination TEXT,
            grade TEXT,
            netKg REAL,
            pricePerKg REAL,
            totalValue REAL,
            status TEXT,
            etd TEXT
        );

        CREATE TABLE IF NOT EXISTS insights (
            id INTEGER PRIMARY KEY,
            severity TEXT,
            module TEXT,
            title TEXT,
            body TEXT,
            metric TEXT
        );

        -- ── Finance Categories (Expense & Revenue types) ───────
        CREATE TABLE IF NOT EXISTS finance_categories (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,  -- 'Expense' | 'Revenue'
            group_name TEXT      -- grouping label e.g. 'Field Operations'
        );

        -- ── Farm Inventory ─────────────────────────────────────
        -- Tracks equipment, tools, chemicals, PPE, consumables
        CREATE TABLE IF NOT EXISTS inventory (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            category      TEXT,   -- 'Equipment' | 'Tool' | 'Chemical' | 'PPE' | 'Consumable'
            unit          TEXT,   -- 'pc' | 'litre' | 'kg' | 'bag' | 'set'
            quantity      REAL DEFAULT 0,
            min_quantity  REAL DEFAULT 0,   -- reorder trigger
            condition     TEXT DEFAULT 'Good', -- 'Good'|'Fair'|'Needs Repair'|'Condemned'
            location      TEXT,   -- shed / block / store
            purchase_date TEXT,
            last_service  TEXT,
            unit_value    REAL DEFAULT 0,
            notes         TEXT
        );

        -- ── Nursery & Planting Material ─────────────────────
        CREATE TABLE IF NOT EXISTS nursery_batches (
            id TEXT PRIMARY KEY,
            clone_variety TEXT,
            cutting_date TEXT,
            rooting_date TEXT,
            hardening_date TEXT,
            dispatch_date TEXT,
            mother_garden_id TEXT,
            cuttings_placed INTEGER,
            cuttings_rooted INTEGER,
            mortality INTEGER DEFAULT 0,
            grade TEXT,
            stage TEXT,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS mother_gardens (
            id TEXT PRIMARY KEY,
            block_id TEXT,
            clone_variety TEXT,
            bush_count INTEGER,
            established_date TEXT,
            last_harvest_date TEXT,
            status TEXT DEFAULT 'Active',
            FOREIGN KEY(block_id) REFERENCES blocks(id)
        );

        -- ── IPM Scouting ─────────────────────────────────────
        CREATE TABLE IF NOT EXISTS ipm_scouting (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_id TEXT,
            scout_date TEXT,
            scout_cell TEXT,
            pest_type TEXT,
            incidence_pct REAL,
            severity_rating INTEGER,
            action_taken TEXT,
            next_scout_date TEXT,
            notes TEXT,
            FOREIGN KEY(block_id) REFERENCES blocks(id)
        );

        -- ── Soil & Fertility ─────────────────────────────────
        CREATE TABLE IF NOT EXISTS soil_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_id TEXT,
            sample_date TEXT,
            ph REAL,
            organic_matter_pct REAL,
            nitrogen_ppm REAL,
            phosphorus_ppm REAL,
            potassium_ppm REAL,
            cec REAL,
            base_saturation_pct REAL,
            texture TEXT,
            amendment_notes TEXT,
            FOREIGN KEY(block_id) REFERENCES blocks(id)
        );

        CREATE TABLE IF NOT EXISTS fertility_applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_id TEXT,
            application_date TEXT,
            product TEXT,
            type TEXT,
            kg_per_ha REAL,
            total_kg REAL,
            cost REAL,
            applied_by TEXT,
            notes TEXT,
            FOREIGN KEY(block_id) REFERENCES blocks(id)
        );

        -- ── Irrigation Logs ───────────────────────────────────
        CREATE TABLE IF NOT EXISTS irrigation_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_id TEXT,
            log_date TEXT,
            method TEXT,
            mm_applied REAL,
            rainfall_mm REAL,
            duration_hrs REAL,
            trigger_reason TEXT,
            phenology_stage TEXT,
            notes TEXT,
            FOREIGN KEY(block_id) REFERENCES blocks(id)
        );

        -- ── Shade Tree Management ────────────────────────────
        CREATE TABLE IF NOT EXISTS shade_trees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_id TEXT,
            species TEXT,
            count INTEGER,
            spacing_m REAL,
            planted_date TEXT,
            last_pruned_date TEXT,
            current_height_m REAL,
            target_height_m REAL DEFAULT 4.5,
            canopy_density TEXT,
            notes TEXT,
            FOREIGN KEY(block_id) REFERENCES blocks(id)
        );

        -- ── Stumping / Renovation Cycles ─────────────────────
        CREATE TABLE IF NOT EXISTS stumping_cycles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            block_id TEXT,
            stump_date TEXT,
            expected_regrowth_date TEXT,
            expected_yield_date TEXT,
            suckers_selected INTEGER,
            strategy TEXT,
            status TEXT DEFAULT 'Planned',
            yield_recovery_kg REAL,
            notes TEXT,
            FOREIGN KEY(block_id) REFERENCES blocks(id)
        );

        -- ── SACCO Module (separate from farm finance) ─────────
        CREATE TABLE IF NOT EXISTS sacco_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_no TEXT UNIQUE,
            full_name TEXT NOT NULL,
            phone TEXT,
            national_id TEXT,
            join_date TEXT,
            status TEXT DEFAULT 'Active',
            workforce_id INTEGER
        );

        CREATE TABLE IF NOT EXISTS sacco_savings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER,
            amount REAL NOT NULL,
            deposit_date TEXT,
            method TEXT,
            notes TEXT,
            FOREIGN KEY(member_id) REFERENCES sacco_members(id)
        );

        CREATE TABLE IF NOT EXISTS sacco_loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id INTEGER,
            amount REAL NOT NULL,
            interest_rate REAL DEFAULT 0,
            term_months INTEGER DEFAULT 12,
            issue_date TEXT,
            due_date TEXT,
            status TEXT DEFAULT 'Active',
            FOREIGN KEY(member_id) REFERENCES sacco_members(id)
        );

        CREATE TABLE IF NOT EXISTS sacco_repayments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            loan_id INTEGER,
            amount REAL NOT NULL,
            repayment_date TEXT,
            method TEXT,
            notes TEXT,
            FOREIGN KEY(loan_id) REFERENCES sacco_loans(id)
        );

        CREATE TABLE IF NOT EXISTS sacco_finance_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT,
            description TEXT,
            amount REAL,
            date TEXT,
            type TEXT -- 'Expense' or 'Revenue'
        );

        -- ── Lodge Module (separate from farm finance) ─────────
        CREATE TABLE IF NOT EXISTS lodge_units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            name TEXT,
            capacity INTEGER DEFAULT 1,
            nightly_rate REAL DEFAULT 0,
            status TEXT DEFAULT 'Available'
        );

        CREATE TABLE IF NOT EXISTS lodge_bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guest_name TEXT NOT NULL,
            guest_phone TEXT,
            unit_id INTEGER,
            check_in TEXT,
            check_out TEXT,
            guests_count INTEGER DEFAULT 1,
            booking_source TEXT,
            status TEXT DEFAULT 'Booked',
            FOREIGN KEY(unit_id) REFERENCES lodge_units(id)
        );

        CREATE TABLE IF NOT EXISTS lodge_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            booking_id INTEGER,
            amount REAL NOT NULL,
            method TEXT,
            payment_date TEXT,
            status TEXT DEFAULT 'Paid',
            FOREIGN KEY(booking_id) REFERENCES lodge_bookings(id)
        );

        CREATE TABLE IF NOT EXISTS lodge_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT,
            description TEXT,
            amount REAL,
            expense_date TEXT
        );

        CREATE TABLE IF NOT EXISTS maintenance_rate_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL DEFAULT 'Default',
            source_note TEXT,
            effective_from TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS maintenance_rate_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            set_id INTEGER NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            activity_key TEXT NOT NULL,
            label TEXT NOT NULL,
            unit TEXT NOT NULL DEFAULT 'per_acre',
            rate_ugx REAL NOT NULL DEFAULT 0,
            allocation_method TEXT,
            FOREIGN KEY (set_id) REFERENCES maintenance_rate_sets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS payroll_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year_month TEXT NOT NULL UNIQUE,
            status TEXT DEFAULT 'draft',
            notes TEXT,
            posted_at TEXT,
            created_at TEXT
        );

        -- ── Manager's logbook (tasks, minutes, worker notes, complaints) ──
        CREATE TABLE IF NOT EXISTS logbook_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            details TEXT,
            due_date TEXT,
            priority TEXT DEFAULT 'normal',
            status TEXT DEFAULT 'open',
            block_id TEXT,
            worker_id INTEGER,
            completed_at TEXT,
            completion_note TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS logbook_minutes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_date TEXT,
            title TEXT,
            attendees TEXT,
            topics TEXT,
            action_items TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS worker_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_id INTEGER NOT NULL,
            note_date TEXT,
            category TEXT DEFAULT 'general',
            note TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY(worker_id) REFERENCES workforce(id)
        );

        CREATE TABLE IF NOT EXISTS logbook_complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_date TEXT,
            reported_by TEXT,
            about_worker_id INTEGER,
            about_block_id TEXT,
            topic TEXT,
            notes TEXT,
            status TEXT DEFAULT 'open',
            resolution TEXT,
            resolved_at TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        -- File attachments for logbook entries (minutes, complaints, tasks, worker notes).
        -- Files are stored as BLOBs so they travel with the estate.db backup and work
        -- identically under Electron and the Express web server.
        CREATE TABLE IF NOT EXISTS logbook_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_type TEXT NOT NULL,
            parent_id INTEGER NOT NULL,
            file_name TEXT NOT NULL,
            mime_type TEXT,
            size_bytes INTEGER DEFAULT 0,
            data BLOB,
            uploaded_at TEXT,
            uploaded_by TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_logbook_attachments_parent
            ON logbook_attachments(parent_type, parent_id);

        CREATE TABLE IF NOT EXISTS payroll_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payroll_run_id INTEGER NOT NULL,
            line_order INTEGER DEFAULT 0,
            full_name TEXT NOT NULL,
            contact TEXT,
            position TEXT,
            gross_salary REAL DEFAULT 0,
            sacco_saving REAL DEFAULT 0,
            sacco_book_fee REAL DEFAULT 0,
            loan_principal_ref REAL DEFAULT 0,
            loan_interest REAL DEFAULT 0,
            loan_repayment REAL DEFAULT 0,
            loan_balance_snapshot REAL DEFAULT 0,
            net_pay REAL DEFAULT 0,
            sacco_member_id INTEGER,
            loan_id INTEGER,
            FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE
        );
    `);

    // Idempotent upgrades for existing DB files.
    applySchemaUpgrades();

    seedMaintenanceRatesIfEmpty();
    return dbPath;
}

function query(sql, params = []) {
    return db.prepare(sql).all(params);
}

function execute(sql, params = []) {
    return db.prepare(sql).run(params);
}

// ── Migration Helper ────────────────────────────────────────
function migrateFromMock(mockData) {
    const count = db.prepare('SELECT COUNT(*) as count FROM blocks').get().count;
    if (count > 0) {
        console.log('Database already contains data. Skipping migration.');
        return;
    }

    console.log('Migrating mock data to SQLite...');

    try {
        db.transaction(() => {
            // Blocks
            if (mockData.blocks) {
                const insertBlock = db.prepare(`
                    INSERT INTO blocks (id, name, acres, altitude, variety, yield, cost, revenue, status, kgProcessed, plant_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                mockData.blocks.forEach(b => {
                    insertBlock.run(
                        b.id,
                        b.name,
                        b.acres,
                        b.altitude,
                        b.variety,
                        b.yieldKgAcre || 0,
                        b.costPerAcre || 0,
                        b.revenuePerAcre || 0,
                        b.status,
                        b.kgProcessed || 0,
                        b.plant_count != null ? Number(b.plant_count) : 0
                    );
                });
                console.log(`Migrated ${mockData.blocks.length} blocks.`);
            }

            // Map block names to IDs for batches
            const blockMap = {};
            if (mockData.blocks) mockData.blocks.forEach(b => blockMap[b.name] = b.id);

            // Batches
            if (mockData.batches) {
                const insertBatch = db.prepare(`
                    INSERT INTO batches (id, block_id, stage, kgIn, kgOut, moisture, conversion, status, date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                mockData.batches.forEach(b => {
                    const blockId = blockMap[b.block] || b.block;
                    insertBatch.run(b.id, blockId, b.stage, b.inputKg || 0, b.outputKg || 0, b.moisture || 0, b.conversion || 0, b.status, b.date);
                });
                console.log(`Migrated ${mockData.batches.length} batches.`);
            }

            // Finance (Expenses)
            const insertFinance = db.prepare(`
                INSERT INTO finance_items (category, description, amount, date, type)
                VALUES (?, ?, ?, ?, ?)
            `);
            const lineItems = mockData.finance?.current?.lineItems;
            if (Array.isArray(lineItems)) {
                lineItems.forEach((item) => {
                    insertFinance.run(item.category, item.description, item.amount, item.date, 'Expense');
                });
            }

            // Workforce
            if (mockData.workforce && mockData.workforce.departments) {
                const insertWorker = db.prepare(`
                    INSERT INTO workforce (name, department, payroll, type)
                    VALUES (?, ?, ?, ?)
                `);
                mockData.workforce.departments.forEach(dept => {
                    insertWorker.run(dept.supervisor, dept.name, dept.count, 'Department Summary');
                });
                console.log(`Migrated workforce data.`);
            }

            // Inventory
            if (mockData.inventory) {
                const insertInv = db.prepare(`
                    INSERT INTO inventory (name, category, unit, quantity, min_quantity, condition, location, purchase_date, last_service, unit_value, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                mockData.inventory.forEach(item => {
                    insertInv.run(
                        item.name, item.category, item.unit, item.quantity, item.min_quantity,
                        item.condition, item.location, item.purchase_date, item.last_service,
                        item.unit_value, item.notes
                    );
                });
                console.log(`Migrated ${mockData.inventory.length} inventory items.`);
            }

            // Contracts / domestic dispatch (seed key: exports)
            const insertContract = db.prepare(`
                INSERT INTO contracts (id, buyer, destination, grade, netKg, pricePerKg, totalValue, status, etd)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            if (Array.isArray(mockData.exports)) {
                mockData.exports.forEach((c) => {
                    insertContract.run(c.contractId, c.buyer, c.destination, c.grade, c.netKg, c.pricePerKg, c.totalValue, c.status, c.etd);
                });
            }

            // Insights
            const insertInsight = db.prepare(`
                INSERT INTO insights (id, severity, module, title, body, metric)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            if (Array.isArray(mockData.aiInsights)) {
                mockData.aiInsights.forEach((ins) => {
                    insertInsight.run(ins.id, ins.severity, ins.module, ins.title, ins.body, ins.metric);
                });
            }
        })();
        console.log('Migration complete.');
    } catch (err) {
        console.error('Migration failed:', err.message);
        throw err; // Re-throw to be caught in main.js
    }
}

// ── Remote Sync ─────────────────────────────────────────────
async function syncWithRemote(supabase) {
    console.log('Starting remote sync...');
    const tables = ['blocks', 'batches', 'finance_items', 'workforce', 'contracts', 'insights',
        'nursery_batches', 'mother_gardens', 'ipm_scouting', 'soil_records',
        'fertility_applications', 'irrigation_logs', 'shade_trees', 'stumping_cycles',
        'sacco_members', 'sacco_savings', 'sacco_loans', 'sacco_repayments', 'sacco_finance_items',
        'lodge_units', 'lodge_bookings', 'lodge_payments', 'lodge_expenses'];
    const results = {};

    for (const table of tables) {
        const localData = query(`SELECT * FROM ${table}`);
        if (localData.length === 0) continue;

        console.log(`Syncing table: ${table} (${localData.length} rows)`);

        // Upsert to Supabase
        const { data, error } = await supabase
            .from(table)
            .upsert(localData, { onConflict: table === 'finance_items' || table === 'workforce' || table === 'insights' ? 'id' : 'id' });

        if (error) {
            console.error(`Error syncing ${table}:`, error.message);
            throw error;
        }
        results[table] = localData.length;
    }

    return results;
}

/**
 * Replace one month’s payroll run with bundled seed lines (e.g. bundled salary xlsx import).
 * Deletes existing run for year_month (cascades lines) and inserts draft + rows.
 */
function importPayrollSeed(yearMonth, lines) {
    if (!db) throw new Error('Database not initialized');
    if (!yearMonth || !Array.isArray(lines)) throw new Error('Invalid payroll seed');
    const created = new Date().toISOString();
    const runImport = db.transaction((ym, lineRows) => {
        execute('DELETE FROM payroll_runs WHERE year_month = ?', [ym]);
        execute(
            `INSERT INTO payroll_runs (year_month, status, notes, posted_at, created_at) VALUES (?, 'draft', '', '', ?)`,
            [ym, created]
        );
        const runRow = query('SELECT id FROM payroll_runs WHERE year_month = ?', [ym]);
        if (!runRow.length) throw new Error('Failed to create payroll run');
        const runId = runRow[0].id;
        const ins = db.prepare(
            `INSERT INTO payroll_lines (payroll_run_id, line_order, full_name, contact, position, gross_salary, sacco_saving, sacco_book_fee, loan_principal_ref, loan_interest, loan_repayment, loan_balance_snapshot, net_pay, sacco_member_id, loan_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        );
        lineRows.forEach((line, i) => {
            const g = Number(line.gross_salary) || 0;
            const sv = Number(line.sacco_saving) || 0;
            const bk = Number(line.sacco_book_fee) || 0;
            const lp = Number(line.loan_principal_ref) || 0;
            const intr = Number(line.loan_interest) || 0;
            const rep = Number(line.loan_repayment) || 0;
            const lbs = Number(line.loan_balance_snapshot) || 0;
            const netOverride = line.net_pay != null ? Number(line.net_pay) : NaN;
            const net = Number.isFinite(netOverride)
                ? Math.round(netOverride)
                : Math.round(g - sv - bk - intr - rep);
            ins.run(
                runId,
                i,
                String(line.full_name || '').trim(),
                String(line.contact || ''),
                String(line.position || ''),
                g,
                sv,
                bk,
                lp,
                intr,
                rep,
                lbs,
                net,
                line.sacco_member_id != null ? Number(line.sacco_member_id) : null,
                line.loan_id != null ? Number(line.loan_id) : null
            );
        });
        return { runId, count: lineRows.length };
    });
    return runImport(yearMonth, lines);
}

module.exports = {
    initDB,
    query,
    execute,
    migrateFromMock,
    syncWithRemote,
    distributeDefaultPlantsIfEmpty,
    importPayrollSeed,
    resetMaintenanceRatesToDefaults,
    insertLogbookAttachment,
    getLogbookAttachment,
    deleteLogbookAttachment,
    listLogbookAttachments,
    MAX_ATTACHMENT_BYTES,
};
