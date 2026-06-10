// ============================================================
// settings.js — Application Settings Module
// ============================================================
import { dataService } from '../../services/dataService.js';
import { isManagerRole } from '../../services/estateRole.js';

// Read env info from preload (if available) — but we never expose secrets to renderer
// Settings we can actually persist: season label, user name/role, grade

const SETTINGS_KEY = 'estate_settings';

function loadSettings() {
    try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch { return {}; }
}

function saveSettings(data) {
    const existing = loadSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...existing, ...data }));
}

async function renderSettings(container) {
    if (isManagerRole()) {
        container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Estate-wide settings are available to owners only. Contact an owner if you need a change.</p>
    </div>
    <div class="section-card" style="padding:24px;">
      <p style="margin:0;color:var(--text-secondary);font-size:13px;line-height:1.6;">
        Your account uses the <strong>manager</strong> role: you can use field operations, crop health, harvest, nursery, and inventory.
        Financial data, SACCO, AI farm snapshot, and system settings stay with owner/admin accounts.
      </p>
    </div>`;
        return;
    }

    const saved = loadSettings();

    container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Configure estate profile, sync preferences, and system options.</p>
    </div>

    <!-- Estate Profile -->
    <div class="section-card" style="margin-bottom:20px;">
      <div class="card-header"><h2 class="card-title">🏡 Estate Profile</h2></div>
      <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="form-group">
          <label class="form-label">Estate Name</label>
          <input type="text" class="form-input" id="set-estate-name" value="${saved.estateName || 'Nyakamenta Coffee Estate'}">
        </div>
        <div class="form-group">
          <label class="form-label">Location / Region</label>
          <input type="text" class="form-input" id="set-location" value="${saved.location || 'Mt. Elgon, Uganda'}">
        </div>
        <div class="form-group">
          <label class="form-label">Current Season Label</label>
          <input type="text" class="form-input" id="set-season" value="${saved.currentSeason || '2025/26 Main Crop'}">
        </div>
        <div class="form-group">
          <label class="form-label">Default Grade</label>
          <select class="form-select" id="set-grade">
            ${['AA', 'AB', 'PB', 'C', 'TT', 'Mixed'].map(g =>
        `<option ${(saved.defaultGrade || 'AA') === g ? 'selected' : ''}>${g}</option>`
    ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Manager Name</label>
          <input type="text" class="form-input" id="set-manager" value="${saved.managerName || 'S. Mbugua'}">
        </div>
        <div class="form-group">
          <label class="form-label">Manager Role</label>
          <input type="text" class="form-input" id="set-role" value="${saved.managerRole || 'Plant Manager'}">
        </div>
        <div class="form-group">
          <label class="form-label">Currency</label>
          <input type="text" class="form-input" value="UGX — all amounts are stored and shown in shillings" disabled>
        </div>
      </div>
      <div style="padding:0 20px 20px;display:flex;justify-content:flex-end;">
        <button class="btn btn-primary" id="save-profile-btn">
          <span class="material-symbols-outlined">save</span> Save Profile
        </button>
      </div>
    </div>

    <!-- Sync Settings -->
    <div class="section-card" style="margin-bottom:20px;">
      <div class="card-header"><h2 class="card-title">☁️ Cloud Sync</h2></div>
      <div style="padding:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-raised);border:1px solid var(--border);border-radius:6px;margin-bottom:12px;">
          <div>
            <div style="font-weight:600;">Supabase Integration</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Configured via <code style="background:var(--bg-overlay);padding:1px 5px;border-radius:3px;">.env</code> file in the application root.</div>
          </div>
          <span class="badge green" id="sync-status-badge">Active</span>
        </div>
        <div style="padding:14px 16px;background:var(--bg-raised);border:1px solid var(--border);border-radius:6px;">
          <div style="font-weight:600;margin-bottom:8px;">Manual Sync</div>
          <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Push all local data to the cloud now. This will upsert all records to your Supabase project.</p>
          <button class="btn btn-ghost" id="settings-sync-btn">
            <span class="material-symbols-outlined" style="font-size:15px;">cloud_sync</span> Sync Now
          </button>
          <p id="sync-result" style="font-size:11px;margin-top:8px;display:none;"></p>
        </div>
      </div>
    </div>

    <!-- About -->
    <div class="section-card" style="margin-bottom:20px;">
      <div class="card-header"><h2 class="card-title">ℹ️ About</h2></div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:8px;">
        ${[
            ['Application', 'Coffee Estate OS'],
            ['Version', 'v1.0.0'],
            ['Database', 'SQLite (local-first)'],
            ['Remote', 'Supabase PostgreSQL'],
            ['Platform', 'Electron (Windows)'],
            ['Built for', 'Nyakamenta Coffee Estate'],
        ].map(([k, v]) => `
          <div style="display:flex;gap:16px;font-size:12px;padding:6px 0;border-bottom:1px solid var(--border-subtle);">
            <span style="min-width:140px;color:var(--text-muted);font-weight:600;">${k}</span>
            <span style="color:var(--text-primary);">${v}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Danger Zone -->
    <div class="section-card" style="border-color:rgba(198,40,40,0.25);">
      <div class="card-header" style="background:rgba(198,40,40,0.05);">
        <h2 class="card-title" style="color:var(--red-text);">⚠️ Danger Zone</h2>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-raised);border:1px solid var(--border);border-radius:6px;">
          <div>
            <div style="font-weight:600;">Clear All Local Data</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Wipes all tables. The application will restart with a fresh migration from the seed data.</div>
          </div>
          <button class="btn btn-danger" id="reset-db-btn">Reset Database</button>
        </div>
      </div>
    </div>
  `;

    // Save profile
    container.querySelector('#save-profile-btn').addEventListener('click', () => {
        saveSettings({
            estateName: container.querySelector('#set-estate-name').value.trim(),
            location: container.querySelector('#set-location').value.trim(),
            currentSeason: container.querySelector('#set-season').value.trim(),
            defaultGrade: container.querySelector('#set-grade').value,
            managerName: container.querySelector('#set-manager').value.trim(),
            managerRole: container.querySelector('#set-role').value.trim(),
            currency: 'UGX',
        });
        const btn = container.querySelector('#save-profile-btn');
        btn.innerHTML = '<span class="material-symbols-outlined">check</span> Saved!';
        btn.style.background = 'var(--green-mid)';
        setTimeout(() => {
            btn.innerHTML = '<span class="material-symbols-outlined">save</span> Save Profile';
            btn.style.background = '';
        }, 2000);
    });

    // Sync
    const syncBtn = container.querySelector('#settings-sync-btn');
    const syncResult = container.querySelector('#sync-result');
    syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<span class="material-symbols-outlined spinning">cloud_sync</span> Syncing…';
        const result = await dataService.sync();
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<span class="material-symbols-outlined">cloud_sync</span> Sync Now';
        syncResult.style.display = 'block';
        if (result.success) {
            syncResult.style.color = 'var(--green-text)';
            const tables = Object.entries(result.result || {}).map(([t, n]) => `${t}: ${n} rows`).join(', ');
            syncResult.textContent = '✓ Sync complete — ' + (tables || 'no new data');
        } else {
            syncResult.style.color = 'var(--red-text)';
            syncResult.textContent = '✗ Sync failed: ' + result.error;
        }
    });

    // Reset database
    container.querySelector('#reset-db-btn').addEventListener('click', async () => {
        const confirmed = confirm(
            'WARNING: This will permanently delete all locally stored data. This cannot be undone.\n\nAre you absolutely sure?'
        );
        if (!confirmed) return;
        const tables = ['blocks', 'batches', 'finance_items', 'workforce', 'contracts', 'insights'];
        for (const t of tables) {
            await window.electronAPI.execute(`DELETE FROM ${t}`);
        }
        alert('All local data cleared. The app will now reload and re-import from the seed file.');
        location.reload();
    });
}

export { renderSettings };
