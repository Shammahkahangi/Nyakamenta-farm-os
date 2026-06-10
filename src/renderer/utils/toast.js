/**
 * Brief non-blocking confirmation (role="status" for screen readers).
 */
export function showToast(message, durationMs = 3000) {
  let root = document.getElementById('app-toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'app-toast-root';
    root.style.cssText =
      'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:99999;pointer-events:none;display:flex;flex-direction:column;gap:10px;align-items:center;max-width:min(420px,92vw);';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;
  el.style.cssText =
    'pointer-events:auto;padding:12px 18px;border-radius:12px;background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border);box-shadow:0 10px 30px rgba(0,0,0,.25);font-size:13px;line-height:1.4;text-align:center;';
  root.appendChild(el);
  window.setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.22s ease';
    window.setTimeout(() => el.remove(), 220);
  }, durationMs);
}
