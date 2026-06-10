// ── Polyfills (First Step) ───────────────────────────────────
require('./polyfills');

const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
// Load .env from project root (Electron cwd is not always the repo root)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const db = require('./db');
const fs = require('fs');
const { parseContractFile } = require('./aiContractParser');

// ── Supabase Initialization ──────────────────────────────────
// Supports: SUPABASE_* (Electron) or NEXT_PUBLIC_* (same keys as a Next.js app)
const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
let supabase = null;

const isPlaceholderUrl = !supabaseUrl || supabaseUrl === 'https://your-project-id.supabase.co';

if (supabaseUrl && supabaseKey && !isPlaceholderUrl) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client initialized.');
} else {
    console.warn('Supabase credentials missing or default. Remote sync disabled.');
}

// ── Window references (prevent GC) ──────────────────────────
let mainWindow;
let splashWindow;
let startupError = null;

const LOGO_PATH = path.join(__dirname, '../../assets', 'Golden agricultural logo design.png');

// ── Splash Screen ────────────────────────────────────────────
function createSplash() {
    splashWindow = new BrowserWindow({
        width: 480,
        height: 300,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        movable: true,
        center: true,
        backgroundColor: '#0F1115',
        show: false,
        icon: LOGO_PATH,
        webPreferences: { contextIsolation: true },
    });
    splashWindow.loadFile(path.join(__dirname, '../../public/splash.html'));
    splashWindow.once('ready-to-show', () => splashWindow.show());
}

// ── Main Window ──────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        title: 'Coffee Estate OS — Operations Intelligence System',
        backgroundColor: '#0F1115',
        show: false,
        frame: true,
        icon: LOGO_PATH,
        titleBarStyle: 'default',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    const startUrl = process.env.ELECTRON_START_URL;
    if (startUrl) {
        mainWindow.loadURL(startUrl);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));
    }

    // Once main window is ready, wait for splash animation or error
    mainWindow.once('ready-to-show', () => {
        if (startupError) {
            // If error happened during appReady, show it
            mainWindow.webContents.send('init-error', startupError);
            if (splashWindow) splashWindow.close();
            mainWindow.show();
            return;
        }

        setTimeout(() => {
            if (splashWindow && !splashWindow.isDestroyed()) {
                splashWindow.close();
                splashWindow = null;
            }
            mainWindow.show();
            mainWindow.focus();
        }, 3600); // Slightly shorter to match splash animation
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}


// ── Application Menu ─────────────────────────────────────────
function buildMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                { label: 'New Season...', accelerator: 'CmdOrCtrl+N', click: () => { } },
                { type: 'separator' },
                { label: 'Backup data…', accelerator: 'CmdOrCtrl+E', click: () => { } },
                { label: 'Print Report', accelerator: 'CmdOrCtrl+P', role: 'print' },
                { type: 'separator' },
                { label: 'Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
            ],
        },
        {
            label: 'View',
            submenu: [
                { label: 'Overview', accelerator: 'CmdOrCtrl+1', click: () => mainWindow?.webContents.send('navigate', 'owner-overview') },
                { label: 'Field Operations', accelerator: 'CmdOrCtrl+2', click: () => mainWindow?.webContents.send('navigate', 'field-ops') },
                { label: 'Finance & reports', accelerator: 'CmdOrCtrl+3', click: () => mainWindow?.webContents.send('navigate', 'sales-finance') },
                { label: 'Lodge Dashboard', accelerator: 'CmdOrCtrl+4', click: () => mainWindow?.webContents.send('navigate', 'lodge-dashboard') },
                { type: 'separator' },
                { label: 'Toggle Full Screen', accelerator: 'F11', role: 'togglefullscreen' },
                { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
                { label: 'Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
            ],
        },
        {
            label: 'Window',
            submenu: [
                { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
                { label: 'Maximize', click: () => mainWindow?.maximize() },
                { type: 'separator' },
                { label: 'Reset Window Size', click: () => { mainWindow?.setSize(1440, 900); mainWindow?.center(); } },
            ],
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About Coffee Estate OS', click: () => {
                        const { dialog } = require('electron');
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Coffee Estate OS',
                            message: 'Coffee Estate OS v1.0.0',
                            detail: 'Operations Intelligence System\nBuilt for 150-acre Arabica estates in Uganda.\n\n© 2026 Visionatedigital',
                            buttons: ['OK'],
                        });
                    }
                },
                { label: 'Documentation', click: () => shell.openExternal('https://github.com/Visionatedigital') },
            ],
        },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// ── IPC Handlers ─────────────────────────────────────────────
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-app-path', () => app.getPath('userData'));

ipcMain.handle('db-query', (event, sql, params) => db.query(sql, params));
ipcMain.handle('db-execute', (event, sql, params) => {
    const r = db.execute(sql, params);
    return {
        changes: r.changes,
        lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
    };
});
ipcMain.handle('reset-maintenance-rates', () => {
    try {
        return db.resetMaintenanceRatesToDefaults();
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
});

// ── Logbook attachments (desktop parity with web) ───────────
ipcMain.handle('logbook-attachment-upload', (_event, payload = {}) => {
    try {
        return { ok: true, ...db.insertLogbookAttachment(payload) };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
});
ipcMain.handle('logbook-attachment-get', (_event, id) => {
    try {
        const row = db.getLogbookAttachment(id);
        if (!row) return { ok: false, error: 'Attachment not found' };
        const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data || []);
        return {
            ok: true,
            id: row.id,
            parent_type: row.parent_type,
            parent_id: row.parent_id,
            file_name: row.file_name,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            uploaded_at: row.uploaded_at,
            base64: buf.toString('base64'),
        };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
});
ipcMain.handle('logbook-attachment-delete', (_event, id) => {
    try {
        const r = db.deleteLogbookAttachment(id);
        return { ok: true, changes: r.changes };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
});

ipcMain.handle('import-payroll-seed', () => {
    const seedPath = path.join(__dirname, '../../data/payroll_seed_shammah.json');
    if (!fs.existsSync(seedPath)) {
        return { ok: false, error: 'Bundled seed file not found: data/payroll_seed_shammah.json' };
    }
    try {
        const raw = fs.readFileSync(seedPath, 'utf8');
        const j = JSON.parse(raw);
        if (!j.year_month || !Array.isArray(j.lines)) {
            return { ok: false, error: 'Invalid payroll seed JSON' };
        }
        db.importPayrollSeed(j.year_month, j.lines);
        return {
            ok: true,
            yearMonth: j.year_month,
            count: j.lines.length,
            label: j.label || '',
        };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
});

const { runImportPayrollFromXlsx } = require(path.join(__dirname, '../../scripts/lib/salaryPayrollImport.cjs'));

ipcMain.handle('import-payroll-xlsx', async (_event, opts = {}) => {
    const picked = await dialog.showOpenDialog({
        title: 'Import salary spreadsheet',
        properties: ['openFile'],
        filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    });
    if (picked.canceled || !picked.filePaths[0]) {
        return { ok: false, canceled: true };
    }
    const year = Number(opts.year) || new Date().getFullYear();
    try {
        return runImportPayrollFromXlsx({
            dbModule: db,
            filePath: picked.filePaths[0],
            year,
            skipIfExists: !!opts.skipIfExists,
            useExcelNet: !!opts.useExcelNet,
            dryRun: !!opts.dryRun,
            months: opts.months,
        });
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
});

const { aggregateSaccoOverviewFromXlsx } = require(path.join(__dirname, '../../scripts/lib/salaryXlsx.cjs'));
const SALARY_WORKBOOK_FILENAME = 'salary payments-4 (1).xlsx';

/** Desktop build may not ship docs/ next to src/main; also try cwd and userData. */
function resolveSalaryWorkbookPath(custom) {
    if (custom && fs.existsSync(custom)) return custom;
    const candidates = [
        path.join(__dirname, '../../docs', SALARY_WORKBOOK_FILENAME),
        path.join(process.cwd(), 'docs', SALARY_WORKBOOK_FILENAME),
        path.join(process.cwd(), SALARY_WORKBOOK_FILENAME),
    ];
    try {
        if (typeof app.getPath === 'function') {
            candidates.push(path.join(app.getPath('userData'), SALARY_WORKBOOK_FILENAME));
            candidates.push(path.join(app.getPath('userData'), 'docs', SALARY_WORKBOOK_FILENAME));
        }
    } catch {
        /* ignore */
    }
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return p;
        } catch {
            /* ignore */
        }
    }
    return candidates[0];
}

ipcMain.handle('salary-workbook-sacco-stats', async (_event, opts = {}) => {
    const year = Number(opts.year) || new Date().getFullYear();
    const fp = resolveSalaryWorkbookPath(opts.filePath);
    return aggregateSaccoOverviewFromXlsx(fp, year);
});

// ── Remote Sync IPC ──────────────────────────────────────────
ipcMain.handle('sync-data', async () => {
    if (!supabase) return { success: false, error: 'Supabase not configured' };
    try {
        const result = await db.syncWithRemote(supabase);
        return { success: true, result };
    } catch (error) {
        console.error('Sync failed:', error);
        return { success: false, error: error.message };
    }
});

// ── OpenAI Chat IPC ──────────────────────────────────────────
ipcMain.handle('openai-chat', async (event, { messages, model = 'gpt-4o-mini' }) => {
    const rawKey = process.env.OPENAI_API_KEY || '';
    const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');
    if (!apiKey || apiKey.startsWith('sk-your')) {
        return { error: 'NO_KEY', message: 'OpenAI API key not configured. Add OPENAI_API_KEY to your .env file.' };
    }
    try {
        const https = require('https');
        const body = JSON.stringify({ model, messages, max_tokens: 1200, temperature: 0.4 });
        const reply = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.openai.com',
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(body),
                },
            }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data || '{}');
                        if (res.statusCode && res.statusCode >= 400) {
                            const msg = parsed.error?.message || parsed.message || `OpenAI HTTP ${res.statusCode}`;
                            reject(new Error(msg));
                            return;
                        }
                        if (parsed.error) {
                            const msg = parsed.error.message || JSON.stringify(parsed.error);
                            reject(new Error(msg));
                            return;
                        }
                        resolve(parsed.choices?.[0]?.message?.content || '');
                    } catch (e) {
                        const snippet = (data || '').slice(0, 280);
                        reject(new Error(snippet || e.message || 'Invalid OpenAI response'));
                    }
                });
            });
            req.on('error', reject);
            req.setTimeout(120000, () => {
                req.destroy();
                reject(new Error('OpenAI request timed out'));
            });
            req.write(body);
            req.end();
        });
        return { reply };
    } catch (err) {
        console.error('OpenAI error:', err.message);
        return { error: 'API_ERROR', message: err.message };
    }
});

// ── AI Contract Parsing IPC ──────────────────────────────────
// Supports both Image Scans (JPG/PNG/WEBP) and Digital Documents (PDF)
ipcMain.handle('parse-contract', async () => {
    const { dialog } = require('electron');
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Signed Contract (Image or PDF) - v1.2',
        filters: [
            { name: 'Contract Files', extensions: ['jpg', 'png', 'jpeg', 'webp', 'pdf'] }
        ],
        properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) return { canceled: true };

    const filePath = filePaths[0];
    const apiKey = String(process.env.OPENAI_API_KEY || '').trim().replace(/^["']|["']$/g, '');

    if (!apiKey || apiKey.startsWith('sk-your')) {
        return { error: 'NO_KEY', message: 'OpenAI API key missing.' };
    }

    console.log('[DEBUG] Calling hybrid parser v1.3 for:', filePath);
    try {
        return await parseContractFile(filePath, apiKey);
    } catch (err) {
        console.error('Hybrid Parser Error:', err);
        return { error: 'INTERNAL_ERROR', message: err.message };
    }
});


// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
    try {
        // Init Database — same file as web/mobile API when ESTATE_DATA_DIR is set (see MOBILE.md)
        const dataDir =
            process.env.ESTATE_DATA_DIR ||
            path.join(__dirname, '../../data');
        const dbPath = db.initDB(path.isAbsolute(dataDir) ? dataDir : path.resolve(dataDir));
        console.log('Database initialized at:', dbPath);

        // Auto-migrate if first run
        const mockData = require('../../data/data.json');
        db.migrateFromMock(mockData);
        db.distributeDefaultPlantsIfEmpty();

        buildMenu();
    } catch (e) {
        console.error('Initialization failed:', e.message);
        startupError = e.message;
    }

    createSplash();   // Show splash first
    createWindow();   // Load main window silently in background

    // macOS: re-create window when dock icon is clicked
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) { createSplash(); createWindow(); }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}
