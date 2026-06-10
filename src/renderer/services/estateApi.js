// ============================================================
// estateApi.js — Backend bridge (Electron IPC or web HTTP)
// ============================================================

/** @returns {Record<string, unknown>} */
export function getEstateApi() {
  if (typeof window === 'undefined') {
    throw new Error('getEstateApi requires a browser context');
  }
  if (window.electronAPI) return window.electronAPI;
  if (window.__estateWebBridge) return window.__estateWebBridge;
  throw new Error(
    'Estate backend is not connected. Use the desktop app, or open the web server and sign in.'
  );
}

/** Same as getEstateApi but returns null before the web bridge is installed. */
export function tryGetEstateApi() {
  if (typeof window === 'undefined') return null;
  if (window.electronAPI) return window.electronAPI;
  if (window.__estateWebBridge) return window.__estateWebBridge;
  return null;
}
