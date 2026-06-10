import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as Record<string, string> | undefined;

export function getApiBaseUrl(): string {
  const url =
    process.env.EXPO_PUBLIC_ESTATE_API_URL ||
    extra?.estateApiUrl ||
    'http://localhost:3000';
  return url.replace(/\/$/, '');
}

export type EstateApiConfig = {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  localWebAuth: boolean;
};

const CONFIG_TIMEOUT_MS = 20000;

export function getEnvSupabaseConfig(): Pick<EstateApiConfig, 'supabaseUrl' | 'supabaseAnonKey'> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || extra?.supabaseUrl || null;
  const key =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra?.supabaseAnonKey || null;
  const placeholder = !url || url.includes('your-project');
  return {
    supabaseUrl: url && !placeholder ? url : null,
    supabaseAnonKey: key && !placeholder ? key : null,
  };
}

export async function fetchEstateConfig(): Promise<EstateApiConfig> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CONFIG_TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/config`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Could not load /api/config (${res.status})`);
    return res.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort|timeout/i.test(msg)) {
      throw new Error(
        `Cannot reach estate server at ${getApiBaseUrl()}. Start "npm run web" on your PC, use the PC LAN IP (not localhost) on the phone, and allow port 3000 in Windows Firewall.`
      );
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Server /api/config with fallback to EXPO_PUBLIC_* from .env (needed when the phone cannot reach the PC). */
export async function resolveEstateConfig(): Promise<EstateApiConfig & { fromEnvFallback?: boolean }> {
  try {
    return await fetchEstateConfig();
  } catch {
    const env = getEnvSupabaseConfig();
    if (env.supabaseUrl && env.supabaseAnonKey) {
      return { ...env, localWebAuth: false, fromEnvFallback: true };
    }
    throw new Error(
      `Estate server unreachable at ${getApiBaseUrl()} and no EXPO_PUBLIC_SUPABASE_* in .env. Fix the API URL or add Supabase keys to coffee-estate-mobile/.env.`
    );
  }
}

let tokenGetter: (() => Promise<string | null>) | null = null;

export function setEstateApiTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}

async function getToken(): Promise<string> {
  const t = tokenGetter ? await tokenGetter() : null;
  if (!t) throw new Error('Not signed in');
  return t;
}

async function apiFetch<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data: T & { error?: string; message?: string };
  try {
    data = text ? JSON.parse(text) : ({} as T);
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || (data as { message?: string }).message || `Request failed (${res.status})`);
  }
  return data;
}

async function apiFetchGet(path: string): Promise<Response> {
  const token = await getToken();
  return fetch(`${getApiBaseUrl()}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export const estateApi = {
  query: (sql: string, params?: unknown[]) =>
    apiFetch<unknown[]>('/api/db/query', { sql, params: params ?? [] }),

  execute: (sql: string, params?: unknown[]) =>
    apiFetch<{ changes: number; lastInsertRowid: number | null }>('/api/db/execute', {
      sql,
      params: params ?? [],
    }),

  importPayrollSeed: () => apiFetch('/api/payroll/import-seed', {}),

  importPayrollFromXlsx: (opts: Record<string, unknown>) =>
    apiFetch('/api/payroll/import-xlsx', opts),

  salaryWorkbookSaccoStats: (opts: Record<string, unknown>) =>
    apiFetch('/api/salary-workbook/sacco-stats', opts),

  resetMaintenanceRates: () => apiFetch('/api/maintenance/reset-rates', {}),

  syncData: () => apiFetch('/api/sync', {}),

  openAIChat: (payload: { messages: unknown[]; model?: string }) =>
    apiFetch<{ reply?: string; error?: string; message?: string }>('/api/openai/chat', payload),

  uploadLogbookAttachment: (payload: Record<string, unknown>) =>
    apiFetch('/api/logbook/attachments', payload),

  async getLogbookAttachmentBlob(id: number): Promise<Blob> {
    const r = await apiFetchGet(`/api/logbook/attachments/${id}`);
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(txt || `Attachment download failed (${r.status})`);
    }
    return r.blob();
  },

  async deleteLogbookAttachment(id: number) {
    const token = await getToken();
    const res = await fetch(`${getApiBaseUrl()}/api/logbook/attachments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    let data: { ok?: boolean; error?: string };
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },

  parseContract: async () => ({
    error: 'WEB_UNSUPPORTED',
    message: 'Contract file pick & parse runs in the desktop app only.',
  }),
};

export function getEstateApi() {
  return estateApi;
}

export function tryGetEstateApi() {
  return estateApi;
}
