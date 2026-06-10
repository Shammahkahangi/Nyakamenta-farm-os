// ============================================================
// preload.js — Electron Preload Script (Context Bridge)
// Safely exposes select Electron APIs to the renderer process
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // App info
    getVersion: () => ipcRenderer.invoke('get-app-version'),
    getAppPath: () => ipcRenderer.invoke('get-app-path'),

    // Listen for menu-triggered navigation (Ctrl+1, Ctrl+2, etc.)
    onNavigate: (callback) => {
        ipcRenderer.on('navigate', (_event, pageId) => callback(pageId));
    },

    // Listen for fatal errors during startup
    onInitError: (callback) => {
        ipcRenderer.on('init-error', (_event, err) => callback(err));
    },

    // Platform info
    platform: process.platform,

    // DB Access
    query: (sql, params) => ipcRenderer.invoke('db-query', sql, params),
    execute: (sql, params) => ipcRenderer.invoke('db-execute', sql, params),
    importPayrollSeed: () => ipcRenderer.invoke('import-payroll-seed'),
    importPayrollFromXlsx: (opts) => ipcRenderer.invoke('import-payroll-xlsx', opts || {}),
    salaryWorkbookSaccoStats: (opts) => ipcRenderer.invoke('salary-workbook-sacco-stats', opts || {}),
    resetMaintenanceRates: () => ipcRenderer.invoke('reset-maintenance-rates'),
    syncData: () => ipcRenderer.invoke('sync-data'),

    // Logbook attachments (unified shape with web bridge).
    uploadLogbookAttachment: (payload) => ipcRenderer.invoke('logbook-attachment-upload', payload),
    getLogbookAttachment: (id) => ipcRenderer.invoke('logbook-attachment-get', id),
    deleteLogbookAttachment: (id) => ipcRenderer.invoke('logbook-attachment-delete', id),

    // OpenAI
    openAIChat: (payload) => ipcRenderer.invoke('openai-chat', payload),
    parseContract: () => ipcRenderer.invoke('parse-contract'),
});
