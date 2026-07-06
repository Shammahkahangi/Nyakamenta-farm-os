/**
 * Coffee Estate OS — web server
 * Serves the same UI as Electron, with SQLite + Supabase-backed login.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = require('./src/main/db');

const app = express();
const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const supabaseAnonKey =
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  '';

const isPlaceholderUrl = !supabaseUrl || supabaseUrl === 'https://your-project-id.supabase.co';
let supabaseServer = null;
let supabaseAdmin = null;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (supabaseUrl && supabaseAnonKey && !isPlaceholderUrl) {
  /** Longer timeout for flaky networks (default undici ~10s). */
  const fetchLong = (url, options = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(t));
  };
  supabaseServer = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: fetchLong },
  });
}
if (supabaseUrl && supabaseServiceKey && !isPlaceholderUrl) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const allowLocalWebAuth =
  process.env.ESTATE_LOCAL_WEB_AUTH === '1' || process.env.ESTATE_LOCAL_WEB_AUTH === 'true';
const LOCAL_WEB_BEARER = 'local-dev';

const dataDir = process.env.ESTATE_DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

try {
  db.initDB(dataDir);
  console.log('Database initialized at:', path.join(dataDir, 'estate.db'));
  const mockData = require('./data/data.json');
  db.migrateFromMock(mockData);
  db.distributeDefaultPlantsIfEmpty();
} catch (e) {
  console.error('Database init failed:', e.message);
  process.exit(1);
}

app.use(express.json({ limit: '50mb' }));

/** CORS for Expo / React Native and browser clients on other origins */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: supabaseUrl && !isPlaceholderUrl ? supabaseUrl : null,
    supabaseAnonKey: supabaseAnonKey && !isPlaceholderUrl ? supabaseAnonKey : null,
    /** When true, browser can skip Supabase login; API accepts Authorization: Bearer local-dev (offline dev only). */
    localWebAuth: allowLocalWebAuth,
  });
});

async function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    let token = h.startsWith('Bearer ') ? h.slice(7) : null;
    // Allow `?t=TOKEN` fallback so <a href> downloads work for file viewing.
    if (!token && typeof req.query?.t === 'string' && req.query.t) {
      token = String(req.query.t);
    }
    if (allowLocalWebAuth && token === LOCAL_WEB_BEARER) {
      req.estateUser = { id: 'local-web', email: 'local@estate.dev' };
      return next();
    }
    if (!token || !supabaseServer) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { data, error } = await supabaseServer.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    req.estateUser = data.user;
    next();
  } catch (e) {
    const msg = e.message || String(e);
    const code = e.cause?.code || e.code;
    const isNet =
      code === 'UND_ERR_CONNECT_TIMEOUT' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      /fetch failed|network|timeout/i.test(msg);
    if (isNet) {
      return res.status(503).json({
        error:
          'Cannot reach Supabase (network timeout or offline). Check internet or firewall. For offline use: set ESTATE_LOCAL_WEB_AUTH=1 in .env, restart the server, then reload the app (no cloud login).',
      });
    }
    res.status(401).json({ error: msg });
  }
}

app.post('/api/db/query', requireAuth, (req, res) => {
  try {
    const { sql, params } = req.body || {};
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ error: 'Missing sql' });
    }
    const rows = db.query(sql, Array.isArray(params) ? params : []);
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

app.post('/api/db/execute', requireAuth, (req, res) => {
  try {
    const { sql, params } = req.body || {};
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ error: 'Missing sql' });
    }
    const r = db.execute(sql, Array.isArray(params) ? params : []);
    res.json({
      changes: r.changes,
      lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
    });
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

app.post('/api/maintenance/reset-rates', requireAuth, (_req, res) => {
  try {
    const out = db.resetMaintenanceRatesToDefaults();
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

/** Clear domestic dispatch register on server SQLite and mirrored Supabase rows. */
app.post('/api/admin/clear-dispatch', requireAuth, async (_req, res) => {
  try {
    const local = db.clearDispatchRegister();
    const remote = { contracts: 0, finance_items: 0, skipped: !supabaseAdmin };
    if (supabaseAdmin) {
      const { data: ctr, error: e1 } = await supabaseAdmin.from('contracts').delete().neq('id', '').select('id');
      if (e1) throw new Error(`Supabase contracts: ${e1.message}`);
      remote.contracts = Array.isArray(ctr) ? ctr.length : 0;

      const { data: fin, error: e2 } = await supabaseAdmin
        .from('finance_items')
        .delete()
        .ilike('description', '%Domestic dispatch%')
        .select('id');
      if (e2) throw new Error(`Supabase finance_items: ${e2.message}`);
      remote.finance_items = Array.isArray(fin) ? fin.length : 0;
      remote.skipped = false;
    }
    res.json({ ok: true, local, remote });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});

app.post('/api/payroll/import-seed', requireAuth, (req, res) => {
  try {
    const seedPath = path.join(__dirname, 'data/payroll_seed_shammah.json');
    if (!fs.existsSync(seedPath)) {
      return res.status(400).json({ ok: false, error: 'Bundled seed file not found' });
    }
    const raw = fs.readFileSync(seedPath, 'utf8');
    const j = JSON.parse(raw);
    if (!j.year_month || !Array.isArray(j.lines)) {
      return res.status(400).json({ ok: false, error: 'Invalid payroll seed JSON' });
    }
    db.importPayrollSeed(j.year_month, j.lines);
    res.json({
      ok: true,
      yearMonth: j.year_month,
      count: j.lines.length,
      label: j.label || '',
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});

const { runImportPayrollFromXlsx } = require('./scripts/lib/salaryPayrollImport.cjs');
const { aggregateSaccoOverviewFromXlsx } = require('./scripts/lib/salaryXlsx.cjs');

function resolveSalaryWorkbookPathServer() {
  const name = 'salary payments-4 (1).xlsx';
  const candidates = [
    path.join(__dirname, 'docs', name),
    path.join(process.cwd(), 'docs', name),
    path.join(dataDir, 'docs', name),
    path.join(dataDir, name),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return path.join(__dirname, 'docs', name);
}

app.post('/api/salary-workbook/sacco-stats', requireAuth, (req, res) => {
  try {
    const fp = resolveSalaryWorkbookPathServer();
    const year = Number(req.body?.year) || new Date().getFullYear();
    res.json(aggregateSaccoOverviewFromXlsx(fp, year));
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});

app.post('/api/payroll/import-xlsx', requireAuth, (req, res) => {
  const { xlsxBase64, year, skipIfExists, useExcelNet, months, dryRun } = req.body || {};
  if (!xlsxBase64 || typeof xlsxBase64 !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing xlsxBase64 (upload file from browser).' });
  }
  const tmp = path.join(os.tmpdir(), `estate-payroll-${Date.now()}.xlsx`);
  try {
    fs.writeFileSync(tmp, Buffer.from(xlsxBase64, 'base64'));
    const monthsNorm =
      Array.isArray(months) ? months : typeof months === 'string' && months.trim() ? months : undefined;
    const out = runImportPayrollFromXlsx({
      dbModule: db,
      filePath: tmp,
      year: Number(year) || new Date().getFullYear(),
      skipIfExists: !!skipIfExists,
      useExcelNet: !!useExcelNet,
      dryRun: !!dryRun,
      months: monthsNorm,
    });
    fs.unlinkSync(tmp);
    if (!out.ok) return res.status(400).json(out);
    res.json(out);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
    res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});

/**
 * Logbook attachments (meeting minutes, complaints, etc.)
 * Files stored as BLOBs in estate.db so they travel with the backup.
 */
app.post('/api/logbook/attachments', requireAuth, (req, res) => {
  try {
    const { parent_type, parent_id, file_name, mime_type, base64 } = req.body || {};
    const out = db.insertLogbookAttachment({
      parent_type,
      parent_id,
      file_name,
      mime_type,
      base64,
      uploaded_by: req.estateUser?.email || req.estateUser?.id || null,
    });
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});

app.get('/api/logbook/attachments/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const row = db.getLogbookAttachment(id);
    if (!row) return res.status(404).json({ error: 'Attachment not found' });
    const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data || []);
    const disposition = String(req.query?.download || '') === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(row.file_name || `attachment-${id}`)}"`
    );
    res.setHeader('Cache-Control', 'private, max-age=0, no-cache');
    res.end(buf);
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

app.delete('/api/logbook/attachments/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const r = db.deleteLogbookAttachment(id);
    res.json({ ok: true, changes: r.changes });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || String(e) });
  }
});

app.post('/api/sync', requireAuth, async (_req, res) => {
  if (!supabaseServer) {
    return res.json({ success: false, error: 'Supabase not configured on server' });
  }
  try {
    const result = await db.syncWithRemote(supabaseServer);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Sync failed:', error);
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/openai/chat', requireAuth, async (req, res) => {
  const rawKey = process.env.OPENAI_API_KEY || '';
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');
  if (!apiKey || apiKey.startsWith('sk-your')) {
    return res.json({ error: 'NO_KEY', message: 'OpenAI API key not configured on server.' });
  }
  const { messages, model = 'gpt-4o-mini' } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'INVALID', message: 'messages must be an array' });
  }
  const https = require('https');
  const body = JSON.stringify({ model, messages, max_tokens: 1200, temperature: 0.4 });
  try {
    const reply = await new Promise((resolve, reject) => {
      const r = https.request(
        {
          hostname: 'api.openai.com',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (openRes) => {
          let data = '';
          openRes.on('data', (chunk) => {
            data += chunk;
          });
          openRes.on('end', () => {
            try {
              const parsed = JSON.parse(data || '{}');
              if (openRes.statusCode && openRes.statusCode >= 400) {
                reject(new Error(parsed.error?.message || `OpenAI HTTP ${openRes.statusCode}`));
                return;
              }
              resolve(parsed.choices?.[0]?.message?.content || '');
            } catch (e) {
              reject(new Error(e.message || 'Invalid OpenAI response'));
            }
          });
        }
      );
      r.on('error', reject);
      r.setTimeout(120000, () => {
        r.destroy();
        reject(new Error('OpenAI request timed out'));
      });
      r.write(body);
      r.end();
    });
    res.json({ reply });
  } catch (err) {
    console.error('OpenAI error:', err.message);
    res.json({ error: 'API_ERROR', message: err.message });
  }
});

// ── Public website API (no auth required) ────────────────────────────────────

/** Live lodge unit availability for the public website room cards. */
app.get('/api/public/rooms', (req, res) => {
  try {
    const units = db.query(
      `SELECT lu.id, lu.code, lu.name, lu.capacity, lu.nightly_rate, lu.status,
              COUNT(lb.id) AS active_bookings
       FROM lodge_units lu
       LEFT JOIN lodge_bookings lb
         ON lb.unit_id = lu.id
         AND lb.status NOT IN ('Cancelled','Checked Out','Enquiry')
         AND lb.check_out >= date('now')
       GROUP BY lu.id
       ORDER BY lu.code ASC, lu.id ASC`
    );
    res.json(units);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

/** Receive a website enquiry and save it as a lodge booking (status = 'Enquiry'). */
app.post('/api/public/enquiry', (req, res) => {
  try {
    const { name, phone, guests, message, check_in, check_out } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: 'Name is required.' });
    }
    const guestName = String(name).trim().slice(0, 200);
    const guestPhone = String(phone || '').trim().slice(0, 80);
    const guestsCount = Math.max(1, parseInt(guests) || 1);
    const notes = String(message || '').trim().slice(0, 1000);
    const checkIn = String(check_in || '').trim() || null;
    const checkOut = String(check_out || '').trim() || null;

    const r = db.execute(
      `INSERT INTO lodge_bookings
         (guest_name, guest_phone, unit_id, check_in, check_out, guests_count, booking_source, status)
       VALUES (?, ?, NULL, ?, ?, ?, 'Website', 'Enquiry')`,
      [guestName, guestPhone, checkIn, checkOut, guestsCount]
    );

    // Optionally attach the free-text message as a logbook task so staff see it.
    if (notes) {
      try {
        db.execute(
          `INSERT INTO logbook_tasks (title, details, status, due_date, created_at)
           VALUES (?, ?, 'open', ?, datetime('now'))`,
          [
            `Website enquiry — ${guestName}`,
            `Guests: ${guestsCount}  |  Dates: ${checkIn || '?'} → ${checkOut || '?'}\n\n${notes}`,
            checkIn || null,
          ]
        );
      } catch (_) { /* logbook_tasks schema may vary — non-fatal */ }
    }

    res.json({ ok: true, id: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// ── Viva Transport public endpoints (no auth) ─────────────────────────────────

/** Contact form submission — saves to viva_enquiries. */
app.post('/api/public/viva-contact', (req, res) => {
  try {
    const { name, company, email, phone, subject, message } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: 'Name is required.' });
    }
    db.execute(
      `INSERT INTO viva_enquiries (type, name, company, email, phone, subject, message)
       VALUES ('contact', ?, ?, ?, ?, ?, ?)`,
      [
        String(name).trim().slice(0, 200),
        String(company || '').trim().slice(0, 200),
        String(email || '').trim().slice(0, 200),
        String(phone || '').trim().slice(0, 80),
        String(subject || '').trim().slice(0, 300),
        String(message || '').trim().slice(0, 2000),
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

/** Quote estimator submission — saves estimated quote to viva_enquiries. */
app.post('/api/public/viva-quote', (req, res) => {
  try {
    const { name, company, email, phone, from_loc, to_loc, load_tonnes, service, est_price, message } = req.body || {};
    db.execute(
      `INSERT INTO viva_enquiries (type, name, company, email, phone, from_loc, to_loc, load_tonnes, service, est_price, message)
       VALUES ('quote', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(name || '').trim().slice(0, 200),
        String(company || '').trim().slice(0, 200),
        String(email || '').trim().slice(0, 200),
        String(phone || '').trim().slice(0, 80),
        String(from_loc || '').trim().slice(0, 100),
        String(to_loc || '').trim().slice(0, 100),
        parseFloat(load_tonnes) || null,
        String(service || '').trim().slice(0, 100),
        String(est_price || '').trim().slice(0, 100),
        String(message || '').trim().slice(0, 2000),
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

app.use(express.static(publicDir));
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

const host = process.env.ESTATE_BIND_HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Coffee Estate OS web app: http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (bound ${host})`);
  if (!supabaseServer) {
    console.warn('Supabase env not set: login and API calls will fail until SUPABASE_URL + SUPABASE_ANON_KEY are in .env');
  }
});
