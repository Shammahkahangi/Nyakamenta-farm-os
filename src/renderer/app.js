// ============================================================
// app.v2.js — Top bar (title · search · notifications · user) + Overview landing
// Replace: Coffee management system/src/renderer/app.js
// ============================================================
import { dataService } from './services/dataService.js';
import { renderOwnerOverview } from './features/core/ownerOverview.js';
import { renderFieldOps } from './features/ops/fieldOps.js';
import { renderCropHealth } from './features/ops/cropHealth.js';
import { renderHarvestProcessing } from './features/ops/harvestProcessing.js';
import { renderNursery } from './features/ops/nursery.js';
import { renderInventory } from './features/ops/inventory.js';
import { renderSalesFinance } from './features/biz/salesFinance.js';
import { renderAIInsights } from './features/core/aiinsights.js';
import { renderSettings } from './features/core/settings.js';
import { renderLodgeDashboard } from './features/lodge/lodgeDashboard.js';
import { renderLodgeReports, renderSaccoReports } from './features/core/moduleReports.js';
import { renderSaccoHub } from './features/sacco/saccoHub.js';
import { renderManagerOverview } from './features/core/managerOverview.js';
import { renderLogbook } from './features/hr/logbook.js';
import { renderRequisitions } from './features/ops/requisitions.js';
import { ensureWebSession, isWebMode, signOutWeb } from './auth/webAuth.js';
import {
  getEstateRole,
  getAllowedDoors,
  isManagerRole,
  isSaccoLead,
  isLodgeLead,
  MANAGER_FORBIDDEN_PAGE_IDS,
} from './services/estateRole.js';

const DOORS = {
  FARM: 'farm',
  SACCO: 'sacco',
  LODGE: 'lodge',
};

/** Owner / admin: farm operations + farm finance + AI (SACCO has its own door) */
const FARM_NAV_OWNER = [
  { id: 'owner-overview', label: 'Overview', icon: 'home', render: renderOwnerOverview },
  { id: 'field-ops', label: 'Field Operations', icon: 'agriculture', render: renderFieldOps },
  { id: 'crop-health', label: 'Crop Health', icon: 'health_and_safety', render: renderCropHealth },
  { id: 'harvest-processing', label: 'Harvest & Processing', icon: 'grain', render: renderHarvestProcessing },
  { id: 'nursery', label: 'Nursery', icon: 'potted_plant', render: renderNursery },
  { id: 'inventory', label: 'Inventory', icon: 'inventory_2', render: renderInventory },
  { id: 'requisitions', label: 'Requisitions', icon: 'receipt_long', render: renderRequisitions },
  { id: 'logbook', label: 'Logbook', icon: 'assignment', render: renderLogbook },
  { id: 'sales-finance', label: 'Farm Finance', icon: 'payments', render: renderSalesFinance },
  { id: 'aiinsights', label: 'AI Insights', icon: 'auto_awesome', render: renderAIInsights },
  { id: 'settings', label: 'Settings', icon: 'settings', render: renderSettings },
];

/** Owner / admin: SACCO hub + reports + settings */
const SACCO_NAV_OWNER = [
  { id: 'sacco', label: 'SACCO', icon: 'account_balance', render: renderSaccoHub },
  { id: 'sacco-reports', label: 'SACCO Reports', icon: 'summarize', render: renderSaccoReports },
  { id: 'settings', label: 'Settings', icon: 'settings', render: renderSettings },
];

/** Manager: operations only — no finance, SACCO, payroll-sensitive search, AI, or settings */
const FARM_NAV_MANAGER = [
  { id: 'manager-overview', label: 'Manager dashboard', icon: 'dashboard', render: renderManagerOverview },
  { id: 'field-ops', label: 'Field Operations', icon: 'agriculture', render: renderFieldOps },
  { id: 'crop-health', label: 'Crop Health', icon: 'health_and_safety', render: renderCropHealth },
  { id: 'harvest-processing', label: 'Harvest & Processing', icon: 'grain', render: renderHarvestProcessing },
  { id: 'nursery', label: 'Nursery', icon: 'potted_plant', render: renderNursery },
  { id: 'inventory', label: 'Inventory', icon: 'inventory_2', render: renderInventory },
  { id: 'requisitions', label: 'Requisitions', icon: 'receipt_long', render: renderRequisitions },
  { id: 'logbook', label: 'Logbook', icon: 'assignment', render: renderLogbook },
];

const LODGE_NAV_OWNER = [
  { id: 'lodge-dashboard', label: 'Lodge Dashboard', icon: 'holiday_village', render: renderLodgeDashboard },
  { id: 'lodge-reports', label: 'Lodge Reports', icon: 'description', render: renderLodgeReports },
  { id: 'settings', label: 'Settings', icon: 'settings', render: renderSettings },
];

const LODGE_NAV_MANAGER = [
  { id: 'lodge-dashboard', label: 'Lodge Dashboard', icon: 'holiday_village', render: renderLodgeDashboard },
];

let currentDoor = null;
let currentPage = null;
let currentCurrency = 'UGX';

let metricSearchAbort = null;
let metricIndexCache = { door: null, items: null, at: 0 };
const METRIC_CACHE_MS = 8000;

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/** In-app sign-out confirmation (replaces browser `confirm`). */
function showSignOutConfirmModal() {
  const prev = document.getElementById('estate-signout-modal-host');
  if (prev) prev.remove();

  const host = document.createElement('div');
  host.id = 'estate-signout-modal-host';
  host.setAttribute('role', 'presentation');

  const close = () => {
    document.removeEventListener('keydown', onKeyDown);
    host.remove();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  host.innerHTML = `
    <div style="position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;">
      <div data-so-backdrop style="position:absolute;inset:0;background:rgba(8,10,14,0.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);cursor:pointer;" aria-hidden="true"></div>
      <div class="section-card" role="dialog" aria-modal="true" aria-labelledby="estate-signout-title"
        style="position:relative;z-index:1;max-width:420px;width:100%;padding:0;border-radius:14px;overflow:hidden;box-shadow:0 28px 90px rgba(0,0,0,0.55);border:1px solid var(--border-subtle);">
        <div style="padding:22px 24px 18px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:flex-start;gap:14px;">
          <span class="material-symbols-outlined" style="font-size:36px;color:var(--gold);flex-shrink:0;">logout</span>
          <div style="min-width:0;">
            <h2 id="estate-signout-title" class="page-title" style="font-size:20px;margin:0 0 6px;">Sign out</h2>
            <p class="page-subtitle" style="margin:0;font-size:13px;line-height:1.5;">You will leave the web workspace and must sign in again to continue.</p>
          </div>
        </div>
        <div style="padding:16px 24px 22px;display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;background:var(--bg-surface);">
          <button type="button" class="btn btn-ghost" data-so-cancel>Stay signed in</button>
          <button type="button" class="btn btn-primary" data-so-confirm style="background:var(--red);border-color:var(--red);color:#fff;">Sign out</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(host);

  const backdrop = host.querySelector('[data-so-backdrop]');
  const cancelBtn = host.querySelector('[data-so-cancel]');
  const confirmBtn = host.querySelector('[data-so-confirm]');

  const confirm = () => {
    close();
    void signOutWeb();
  };

  backdrop?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  confirmBtn?.addEventListener('click', confirm);

  requestAnimationFrame(() => cancelBtn?.focus());
}

async function getCachedMetricIndex(door) {
  const now = Date.now();
  if (metricIndexCache.door === door && metricIndexCache.items && now - metricIndexCache.at < METRIC_CACHE_MS) {
    return metricIndexCache.items;
  }
  const items = await dataService.getMetricSearchIndex(door);
  metricIndexCache = { door, items, at: now };
  return items;
}

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem('estate_settings')) || {};
  } catch {
    return {};
  }
}

function saveSettings(data) {
  const existing = getSettings();
  localStorage.setItem('estate_settings', JSON.stringify({ ...existing, ...data }));
}

function applyTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function getNavForDoor() {
  if (currentDoor === DOORS.LODGE) {
    return isManagerRole() ? LODGE_NAV_MANAGER : LODGE_NAV_OWNER;
  }
  if (currentDoor === DOORS.SACCO) {
    return SACCO_NAV_OWNER;
  }
  if (currentDoor === DOORS.FARM) {
    return isManagerRole() ? FARM_NAV_MANAGER : FARM_NAV_OWNER;
  }
  return [];
}

const SIDEBAR_COLLAPSED_KEY = 'estate_sidebar_collapsed';

function loadSidebarCollapsedPreference() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function updateSidebarCollapseButtonUi(collapsed) {
  const btn = document.getElementById('sidebar-collapse-btn');
  if (!btn) return;
  const icon = btn.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = collapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left';
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  const expand = collapsed ? 'Expand' : 'Collapse';
  btn.title = `${expand} sidebar`;
  btn.setAttribute('aria-label', `${expand} sidebar`);
}

function applySidebarCollapsed(collapsed) {
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.toggle('sidebar-collapsed', collapsed);
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
  updateSidebarCollapseButtonUi(collapsed);
}

function wireSidebarCollapse() {
  const btn = document.getElementById('sidebar-collapse-btn');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => {
    const app = document.getElementById('app');
    if (!app) return;
    applySidebarCollapsed(!app.classList.contains('sidebar-collapsed'));
  });
}

function setShellVisibility(visible) {
  const sidebar = document.getElementById('sidebar');
  const toolbar = document.getElementById('toolbar');
  const mainArea = document.getElementById('main-area');
  const footer = document.querySelector('#main-area footer');
  if (!sidebar || !toolbar || !mainArea || !footer) return;
  sidebar.style.display = visible ? 'flex' : 'none';
  toolbar.style.display = visible ? 'flex' : 'none';
  footer.style.display = visible ? 'flex' : 'none';
  mainArea.style.marginLeft = visible ? '' : '0';
}

function doorPickerHintHtml() {
  if (isManagerRole()) {
    return `<p class="page-subtitle" style="font-size:12px;color:var(--gold-text);max-width:520px;margin:14px auto 0;line-height:1.5;">You are signed in as a <strong>field manager</strong>: use <strong>Farm</strong> and <strong>Lodge</strong> only. Farm finance, SACCO, AI, and owner settings stay with admin.</p>`;
  }
  if (isSaccoLead()) {
    return `<p class="page-subtitle" style="font-size:12px;color:var(--gold-text);max-width:520px;margin:14px auto 0;line-height:1.5;">You are signed in as <strong>SACCO lead</strong>: savings &amp; credit tools only. Admins can open every door.</p>`;
  }
  if (isLodgeLead()) {
    return `<p class="page-subtitle" style="font-size:12px;color:var(--gold-text);max-width:520px;margin:14px auto 0;line-height:1.5;">You are signed in as <strong>lodge lead</strong>: lodge operations &amp; reports only. Admins can open every door.</p>`;
  }
  return '';
}

function renderDoorSelector() {
  const workspace = document.getElementById('workspace');
  if (!workspace) return;
  setShellVisibility(false);
  const allowed = getAllowedDoors();
  const showFarm = allowed.includes(DOORS.FARM);
  const showSacco = allowed.includes(DOORS.SACCO);
  const showLodge = allowed.includes(DOORS.LODGE);

  const farmCard = showFarm
    ? `<button class="section-card" id="door-farm" type="button" style="text-align:left;padding:26px;cursor:pointer;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
              <span class="material-symbols-outlined" style="font-size:30px;color:var(--green-text);">agriculture</span>
              <h2 style="font-size:20px;">Farm</h2>
            </div>
            <p style="color:var(--text-secondary);font-size:12px;">Field operations, harvest, nursery, inventory, farm finance, and AI insights.</p>
          </button>`
    : '';

  const saccoCard = showSacco
    ? `<button class="section-card" id="door-sacco" type="button" style="text-align:left;padding:26px;cursor:pointer;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
              <span class="material-symbols-outlined" style="font-size:30px;color:var(--green-mid);">account_balance</span>
              <h2 style="font-size:20px;">SACCO</h2>
            </div>
            <p style="color:var(--text-secondary);font-size:12px;">Member savings, loans, repayments, and SACCO reports.</p>
          </button>`
    : '';

  const lodgeCard = showLodge
    ? `<button class="section-card" id="door-lodge" type="button" style="text-align:left;padding:26px;cursor:pointer;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
              <span class="material-symbols-outlined" style="font-size:30px;color:var(--gold-text);">holiday_village</span>
              <h2 style="font-size:20px;">Lodge</h2>
            </div>
            <p style="color:var(--text-secondary);font-size:12px;">Lodge occupancy, bookings, and lodge-only finance tracking.</p>
          </button>`
    : '';

  workspace.innerHTML = `
    <div style="height:calc(100vh - 56px);display:flex;align-items:center;justify-content:center;">
      <div style="max-width:960px;width:100%;">
        <div style="text-align:center;margin-bottom:28px;">
          <h1 class="page-title" style="font-size:34px;">Nyakamenta Estate OS</h1>
          <p class="page-subtitle" style="font-size:14px;">Choose where you want to work today.</p>
          ${doorPickerHintHtml()}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;">
          ${farmCard}
          ${saccoCard}
          ${lodgeCard}
        </div>
      </div>
    </div>
  `;
  workspace.querySelector('#door-farm')?.addEventListener('click', () => enterDoor(DOORS.FARM));
  workspace.querySelector('#door-sacco')?.addEventListener('click', () => enterDoor(DOORS.SACCO));
  workspace.querySelector('#door-lodge')?.addEventListener('click', () => enterDoor(DOORS.LODGE));
}

function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  const items = getNavForDoor();
  const bottomIds = ['sacco-reports', 'lodge-reports', 'settings'];
  const mainNav = items.filter((item) => !bottomIds.includes(item.id));
  const bottomNav = items.filter((item) => bottomIds.includes(item.id));

  nav.innerHTML =
    mainNav
      .map(
        (item) => `
    <div class="nav-item ${item.id === currentPage ? 'active' : ''}" data-page="${item.id}" title="${escHtml(item.label)}">
      <span class="material-symbols-outlined">${item.icon}</span>
      <span>${item.label}</span>
    </div>
  `
      )
      .join('') +
    `
    <div style="height:1px;background:var(--border-subtle);margin:10px 0;"></div>
  ` +
    bottomNav
      .map(
        (item) => `
    <div class="nav-item ${item.id === currentPage ? 'active' : ''}" data-page="${item.id}" title="${escHtml(item.label)}">
      <span class="material-symbols-outlined">${item.icon}</span>
      <span>${item.label}</span>
    </div>
  `
      )
      .join('');

  nav.querySelectorAll('.nav-item[data-page]').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });
}

function wireMetricSearch(input, popover, door) {
  if (!input || !popover) return;
  if (metricSearchAbort) metricSearchAbort.abort();
  metricSearchAbort = new AbortController();
  const { signal } = metricSearchAbort;

  const wrap = input.closest('.metric-search-wrap');

  const renderPopover = async (rawQ) => {
    const q = String(rawQ ?? '').trim();
    const qn = q.toLowerCase();
    try {
      const items = await getCachedMetricIndex(door);
      const hits = !qn
        ? items.slice(0, 28)
        : items.filter((m) => m.tokens.includes(qn) || m.value.toLowerCase().includes(qn)).slice(0, 56);
      if (!hits.length) {
        popover.innerHTML = `<div class="metric-search-empty">${escHtml(q) ? `No metrics match “${escHtml(q)}”.` : 'No metrics loaded.'}</div>`;
        popover.hidden = false;
        return;
      }
      popover.innerHTML = hits
        .map(
          (h) => `
        <div class="metric-search-row" role="option">
          <div class="metric-search-row-meta">${escHtml(h.group)}</div>
          <div class="metric-search-row-main">
            <span class="metric-search-row-label">${escHtml(h.label)}</span>
            <strong class="metric-search-row-value tabular-nums">${escHtml(h.value)}</strong>
          </div>
        </div>`
        )
        .join('');
      popover.hidden = false;
    } catch (e) {
      popover.innerHTML = `<div class="metric-search-empty">${escHtml(e.message || String(e))}</div>`;
      popover.hidden = false;
    }
  };

  let debounce;
  const onInput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => renderPopover(input.value), 200);
  };

  input.addEventListener('input', onInput, { signal });
  input.addEventListener(
    'focus',
    () => {
      renderPopover(input.value);
    },
    { signal }
  );
  input.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') popover.hidden = true;
    },
    { signal }
  );

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!wrap || wrap.contains(e.target)) return;
      popover.hidden = true;
    },
    { signal }
  );
}

async function buildToolbar() {
  const tb = document.getElementById('toolbar');
  if (!tb || !currentDoor) return;
  const settings = getSettings();
  const meta = await dataService.getMeta();
  const managerName = settings.managerName || meta.user?.name || 'S. Mbugua';
  const role = getEstateRole();
  const roleTag =
    role === 'manager'
      ? 'Field mgr'
      : role === 'admin'
        ? 'Admin'
        : role === 'sacco_lead'
          ? 'SACCO lead'
          : role === 'lodge_lead'
            ? 'Lodge lead'
            : 'Owner';
  const managerRole =
    settings.managerRole || (isWebMode() ? roleTag : meta.user?.role || 'Plant Manager');
  const initials = managerName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const isDark = (localStorage.getItem('theme') || 'dark') === 'dark';
  currentCurrency = 'UGX';
  const areaLabel =
    currentDoor === DOORS.FARM ? 'Farm' : currentDoor === DOORS.SACCO ? 'SACCO' : 'Lodge';

  const navItems = getNavForDoor();
  const pageMeta = navItems.find((item) => item.id === currentPage);
  const pageTitle = pageMeta?.label || 'Dashboard';

  tb.className = 'top-bar';
  tb.innerHTML = `
    <div class="top-bar-title" title="${pageTitle}">${pageTitle}</div>
    <div class="top-bar-center">
      <div class="metric-search-wrap">
        <div class="top-bar-search">
          <span class="material-symbols-outlined">search</span>
          <input type="search" id="global-search" placeholder="Search metrics (acres, payroll, finance…)" autocomplete="off" spellcheck="false" />
        </div>
        <div id="metric-search-popover" class="metric-search-popover" hidden></div>
      </div>
    </div>
    <div class="top-bar-right">
      <div class="toolbar-selector" title="Access level">
        <span class="sel-label">Role</span>
        <span class="sel-value">${roleTag}</span>
      </div>
      <div class="toolbar-selector" title="Current area">
        <span class="sel-label">Area</span>
        <span class="sel-value">${areaLabel}</span>
      </div>
      <button class="btn btn-ghost btn-sm" id="switch-door-btn" type="button" style="${getAllowedDoors().length <= 1 ? 'display:none' : ''}">
        <span class="material-symbols-outlined" style="font-size:14px;">door_open</span>
        Switch door
      </button>
      <button type="button" class="icon-btn has-dot" id="notif-btn" title="Notifications">
        <span class="material-symbols-outlined">notifications</span>
        <span class="notif-dot" aria-hidden="true"></span>
      </button>
      <button type="button" class="icon-btn" id="theme-toggle-btn" title="${isDark ? 'Light mode' : 'Dark mode'}">
        <span class="material-symbols-outlined">${isDark ? 'light_mode' : 'dark_mode'}</span>
      </button>
      <div class="toolbar-user" title="Current user">
        <div class="toolbar-user-avatar">${initials}</div>
        <div class="toolbar-user-info">
          <div class="tu-name">${managerName}</div>
          <div class="tu-role">${managerRole.toUpperCase().slice(0, 12)}</div>
        </div>
      </div>
    </div>
  `;

  wireMetricSearch(tb.querySelector('#global-search'), tb.querySelector('#metric-search-popover'), currentDoor);

  tb.querySelector('#switch-door-btn')?.addEventListener('click', () => {
    currentDoor = null;
    currentPage = null;
    localStorage.removeItem('estate_last_door');
    tb.className = '';
    renderDoorSelector();
  });

  tb.querySelector('#notif-btn')?.addEventListener('click', () => {
    const el = tb.querySelector('#notif-btn .notif-dot');
    if (el) el.style.opacity = el.style.opacity === '0' ? '1' : '0';
  });

  tb.querySelector('#theme-toggle-btn')?.addEventListener('click', async () => {
    const html = document.documentElement;
    const nowDark = html.getAttribute('data-theme') !== 'light';
    const next = nowDark ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    window.dispatchEvent(new CustomEvent('estate-theme-change', { detail: { theme: next } }));
    await buildToolbar();
  });
}

function defaultFarmLandingPage() {
  return isManagerRole() ? 'manager-overview' : 'owner-overview';
}

function defaultDoorLandingPage(door) {
  if (door === DOORS.LODGE) return 'lodge-dashboard';
  if (door === DOORS.SACCO) return 'sacco';
  return defaultFarmLandingPage();
}

/** Remember last sidebar page per door so reload stays on the same module. */
function lastPageStorageKey(door) {
  return `estate_last_page_${door}`;
}

function persistCurrentPage(pageId) {
  if (!currentDoor) return;
  try {
    localStorage.setItem(lastPageStorageKey(currentDoor), pageId);
  } catch {
    /* ignore */
  }
}

function readSavedPageForDoor(door) {
  try {
    const key = lastPageStorageKey(door);
    let v = localStorage.getItem(key);
    if (v) return v;
    const legacy = localStorage.getItem('estate_last_page');
    const lastDoor = localStorage.getItem('estate_last_door');
    if (legacy && lastDoor === door) {
      localStorage.setItem(key, legacy);
      localStorage.removeItem('estate_last_page');
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function enterDoor(door) {
  currentDoor = door;
  localStorage.setItem('estate_last_door', door);
  setShellVisibility(true);

  const navIds = new Set(getNavForDoor().map((n) => n.id));
  const saved = readSavedPageForDoor(door);
  let next = defaultDoorLandingPage(door);
  if (saved && navIds.has(saved)) {
    if (!(isManagerRole() && MANAGER_FORBIDDEN_PAGE_IDS.has(saved))) {
      next = saved;
    }
  }
  currentPage = next;
  if (!navIds.has(currentPage)) {
    currentPage = defaultDoorLandingPage(door);
  }

  buildSidebar();
  await buildToolbar();
  await renderPage();
}

async function navigate(pageId) {
  if (pageId === 'reports' || pageId === 'farm-intelligence') {
    if (isManagerRole()) {
      pageId = defaultFarmLandingPage();
    } else {
      try {
        sessionStorage.setItem('salesFinancePreferredTab', 'finance');
      } catch {
        /* ignore */
      }
      pageId = 'sales-finance';
    }
  }
  if (isManagerRole() && MANAGER_FORBIDDEN_PAGE_IDS.has(pageId)) {
    pageId =
      currentDoor === DOORS.LODGE ? 'lodge-dashboard' : defaultFarmLandingPage();
  }
  currentPage = pageId;
  persistCurrentPage(pageId);
  buildSidebar();
  await buildToolbar();
  await renderPage();
  const workspace = document.getElementById('workspace');
  if (workspace) workspace.scrollTop = 0;
}

async function renderPage() {
  const workspace = document.getElementById('workspace');
  if (!workspace) return;
  const nav = getNavForDoor();
  const page = nav.find((item) => item.id === currentPage);

  if (!page) {
    workspace.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Module Not Found</h1>
        <p class="page-subtitle">The selected module is not available.</p>
      </div>
    `;
    return;
  }

  workspace.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Loading...</div>';
  try {
    await page.render(workspace);
  } catch (err) {
    console.error(`Error rendering page ${currentPage}:`, err);
    workspace.innerHTML = `
      <div style="padding:40px; color:var(--red-text); margin:20px; border:1px solid var(--border-subtle); border-radius:8px; background:var(--bg-surface);">
        <h2 style="font-size:20px; font-weight:600; margin-bottom:8px;">Error Loading ${escHtml(page.label || currentPage)}</h2>
        <p style="font-size:13px; color:var(--text-secondary); margin-bottom:12px;">${escHtml(err.message || String(err))}</p>
        <pre style="background:rgba(0,0,0,0.3); padding:12px; border-radius:6px; font-size:11px; overflow-x:auto;">${escHtml(err.stack || '')}</pre>
      </div>
    `;
  }
}

function initFooter() {
  const footer = document.getElementById('footer-time');
  if (footer) {
    const tick = () => {
      const now = new Date();
      footer.textContent = 'System Online · ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };
    tick();
    setInterval(tick, 30000);
  }

  const syncBtn = document.getElementById('sync-btn');
  if (!syncBtn) return;

  if (isManagerRole()) {
    syncBtn.style.display = 'none';
  }

  if (isWebMode()) {
    const signOut = document.getElementById('footer-sign-out');
    if (signOut) signOut.style.display = 'inline';
    signOut?.addEventListener('click', (e) => {
      e.preventDefault();
      showSignOutConfirmModal();
    });
  }

  syncBtn.addEventListener('click', async () => {
    const icon = syncBtn.querySelector('.material-symbols-outlined');
    if (icon) icon.classList.add('spinning');
    const result = await dataService.sync();
    if (icon) icon.classList.remove('spinning');
    syncBtn.style.color = result.success ? 'var(--green-bright)' : 'var(--red-text)';
    setTimeout(() => {
      syncBtn.style.color = '';
    }, 2000);
  });
}

async function init() {
  applyTheme();
  applySidebarCollapsed(loadSidebarCollapsedPreference());
  wireSidebarCollapse();
  saveSettings({ currency: 'UGX' });

  if (isWebMode()) {
    try {
      await ensureWebSession();
    } catch (e) {
      const workspace = document.getElementById('workspace');
      if (workspace) {
        workspace.innerHTML = `
        <div style="padding:40px;color:var(--red-text);max-width:520px;margin:0 auto;">
          <h2 class="page-title">Web sign-in unavailable</h2>
          <p class="page-subtitle">${escHtml(e.message || String(e))}</p>
          <p style="font-size:12px;color:var(--text-muted);margin-top:16px;">Configure <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> in the server <code>.env</code>, create a user in Supabase Auth, then reload.</p>
        </div>`;
      }
      return;
    }
  }

  initFooter();

  if (window.electronAPI?.onNavigate) {
    window.electronAPI.onNavigate((pageId) => {
      if (currentDoor) navigate(pageId);
    });
  }

  if (window.electronAPI?.onInitError) {
    window.electronAPI.onInitError((err) => {
      const workspace = document.getElementById('workspace');
      if (!workspace) return;
      workspace.innerHTML = `
        <div style="padding:40px; color:var(--red-text); border:1px solid var(--red); border-radius:8px; background:var(--red-bg); margin:20px;">
          <h2 style="margin-bottom:10px;">Backend Initialization Failed</h2>
          <p style="font-size:13px; margin-bottom:15px;">The database or system failed to start correctly.</p>
          <pre style="background:rgba(0,0,0,0.3); padding:10px; border-radius:4px; font-size:11px; overflow-x:auto;">${err}</pre>
        </div>
      `;
    });
  }

  try {
    let lastDoor = localStorage.getItem('estate_last_door');
    if (lastDoor === 'farm-sacco') {
      lastDoor = DOORS.FARM;
      localStorage.setItem('estate_last_door', DOORS.FARM);
    }
    const allowed = getAllowedDoors();
    if (allowed.length === 1) {
      await enterDoor(allowed[0]);
    } else if (lastDoor && allowed.includes(lastDoor)) {
      await enterDoor(lastDoor);
    } else {
      renderDoorSelector();
    }
  } catch (err) {
    console.error("Failed entering initial door:", err);
    renderDoorSelector();
  }
}

document.addEventListener('estate-navigate', (ev) => {
  const id = ev.detail?.pageId;
  if (!id || !currentDoor) return;
  navigate(id);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
