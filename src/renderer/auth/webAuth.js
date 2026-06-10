// ============================================================
// webAuth.js — Supabase sign-in for browser (Express web server)
// ============================================================

import { initEstateRoleFromUser, resetEstateRole } from '../services/estateRole.js';

let supabaseClient = null;
/** True when using ESTATE_LOCAL_WEB_AUTH (Bearer local-dev) — no Supabase session. */
let useLocalWebBridge = false;

export function isWebMode() {
  return typeof window !== 'undefined' && !window.electronAPI;
}

async function fetchConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Could not load /api/config');
  return res.json();
}

async function initSupabaseFromConfig(config) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      'Server did not return Supabase URL and anon key. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env, or set ESTATE_LOCAL_WEB_AUTH=1 for offline dev (no cloud login).'
    );
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.8');
  supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: localStorage,
    },
  });
  return supabaseClient;
}

function buildBridge(apiFetch, getToken) {
  /** Fetch an attachment blob using the current auth token. */
  const fetchAttachmentBlob = async (id) => {
    const token = await getToken();
    const r = await fetch(`/api/logbook/attachments/${Number(id)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(txt || `Attachment download failed (${r.status})`);
    }
    return await r.blob();
  };

  window.__estateWebBridge = {
    getVersion: async () => 'web',
    getAppPath: async () => 'browser',
    onNavigate: () => {},
    onInitError: () => {},
    platform: 'web',
    query: (sql, params) => apiFetch('/api/db/query', { sql, params: params ?? [] }),
    execute: (sql, params) => apiFetch('/api/db/execute', { sql, params: params ?? [] }),
    importPayrollSeed: () => apiFetch('/api/payroll/import-seed', {}),
    importPayrollFromXlsx: (opts) => apiFetch('/api/payroll/import-xlsx', opts || {}),
    salaryWorkbookSaccoStats: (opts) => apiFetch('/api/salary-workbook/sacco-stats', opts || {}),
    resetMaintenanceRates: () => apiFetch('/api/maintenance/reset-rates', {}),
    syncData: () => apiFetch('/api/sync', {}),
    openAIChat: (payload) => apiFetch('/api/openai/chat', payload),
    parseContract: async () => ({
      error: 'WEB_UNSUPPORTED',
      message: 'Contract file pick & parse runs in the desktop app only.',
    }),

    uploadLogbookAttachment: (payload) => apiFetch('/api/logbook/attachments', payload || {}),
    getLogbookAttachmentBlob: (id) => fetchAttachmentBlob(id),
    async getLogbookAttachmentBlobUrl(id) {
      const blob = await fetchAttachmentBlob(id);
      return URL.createObjectURL(blob);
    },
    async deleteLogbookAttachment(id) {
      const token = await getToken();
      const r = await fetch(`/api/logbook/attachments/${Number(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const txt = await r.text();
      let data;
      try {
        data = txt ? JSON.parse(txt) : {};
      } catch {
        throw new Error(txt || `HTTP ${r.status}`);
      }
      if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
      return data;
    },
  };
}

function mountWebBridge() {
  const getToken = async () => {
    const { data: sessWrap, error: sessErr } = await supabaseClient.auth.getSession();
    const token = sessWrap?.session?.access_token;
    if (sessErr || !token) throw new Error('Not signed in');
    return token;
  };
  const apiFetch = async (path, body) => {
    const token = await getToken();
    const r = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    });
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(text || `HTTP ${r.status}`);
    }
    if (!r.ok) throw new Error(data.error || data.message || `Request failed (${r.status})`);
    return data;
  };

  useLocalWebBridge = false;
  buildBridge(apiFetch, getToken);
}

function mountWebBridgeLocal() {
  const getToken = async () => 'local-dev';
  const apiFetch = async (path, body) => {
    const r = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer local-dev',
      },
      body: JSON.stringify(body ?? {}),
    });
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(text || `HTTP ${r.status}`);
    }
    if (!r.ok) throw new Error(data.error || data.message || `Request failed (${r.status})`);
    return data;
  };

  useLocalWebBridge = true;
  buildBridge(apiFetch, getToken);
}

function applyLocalWebProfile() {
  try {
    const raw = localStorage.getItem('estate_settings');
    const cur = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      'estate_settings',
      JSON.stringify({
        ...cur,
        managerName: cur.managerName || 'Local (offline)',
        managerRole: 'Local web (no Supabase)',
      })
    );
  } catch {
    /* ignore */
  }
}

function showLoginScreen(onSuccess) {
  const root = document.getElementById('app');
  if (!root) return;

  const wrap = document.createElement('div');
  wrap.id = 'estate-web-login';
  wrap.setAttribute(
    'style',
    [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:#0F1115',
      'padding:24px',
    ].join(';')
  );

  wrap.innerHTML = `
    <div class="section-card" style="max-width:420px;width:100%;padding:28px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:20px;">
        <img src="/assets/Golden agricultural logo design.png" alt="" style="width:96px;height:auto;margin-bottom:12px;" draggable="false" />
        <h1 class="page-title" style="font-size:22px;margin:0;">Coffee Estate OS</h1>
        <p class="page-subtitle" style="margin-top:8px;">Sign in to use the web workspace.</p>
      </div>
      <form id="estate-login-form" style="display:flex;flex-direction:column;gap:14px;">
        <div class="form-group">
          <label class="form-label" for="estate-login-email">Email</label>
          <input class="form-input" id="estate-login-email" type="email" autocomplete="username" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="estate-login-password">Password</label>
          <input class="form-input" id="estate-login-password" type="password" autocomplete="current-password" required />
        </div>
        <p id="estate-login-error" style="display:none;color:var(--red-text);font-size:12px;margin:0;"></p>
        <button type="submit" class="btn btn-primary" id="estate-login-submit" style="width:100%;">Sign in</button>
      </form>
    </div>
  `;

  document.body.appendChild(wrap);

  const form = wrap.querySelector('#estate-login-form');
  const errEl = wrap.querySelector('#estate-login-error');
  const submitBtn = wrap.querySelector('#estate-login-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.style.display = 'none';
    const email = wrap.querySelector('#estate-login-email').value.trim();
    const password = wrap.querySelector('#estate-login-password').value;
    submitBtn.disabled = true;
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      initEstateRoleFromUser(data.user);
      wrap.remove();
      mountWebBridge();
      applyProfileFromSession();
      onSuccess();
    } catch (err) {
      const parts = [err.message, err.code, err.status ? `HTTP ${err.status}` : null].filter(Boolean);
      errEl.textContent = parts.length ? parts.join(' · ') : String(err);
      errEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function applyProfileFromSession() {
  supabaseClient.auth.getUser().then(({ data }) => {
    const user = data?.user;
    if (!user?.email) return;
    const name =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email.split('@')[0];
    try {
      const raw = localStorage.getItem('estate_settings');
      const cur = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        'estate_settings',
        JSON.stringify({
          ...cur,
          managerName: name,
          managerRole: 'Signed in (web)',
        })
      );
    } catch {
      /* ignore */
    }
  });
}

/**
 * Web only: loads Supabase, shows login if needed, installs HTTP bridge.
 * @returns {Promise<boolean>} true when the main shell can start
 */
export async function ensureWebSession() {
  if (!isWebMode()) return true;

  const config = await fetchConfig();

  if (config.localWebAuth) {
    initEstateRoleFromUser(null);
    mountWebBridgeLocal();
    applyLocalWebProfile();
    return true;
  }

  await initSupabaseFromConfig(config);
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (session?.access_token) {
    initEstateRoleFromUser(session.user);
    mountWebBridge();
    applyProfileFromSession();
    return true;
  }

  // Redirect unauthenticated web users to the staff portal login page
  window.location.href = '/staff-portal.html';
  return new Promise(() => {}); // page redirects
}

export async function signOutWeb() {
  if (useLocalWebBridge) {
    resetEstateRole();
    window.__estateWebBridge = undefined;
    window.location.href = '/staff-portal.html';
    return;
  }
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  resetEstateRole();
  window.__estateWebBridge = undefined;
  window.location.href = '/staff-portal.html';
}
