const qs = (o = {}) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)])).toString();

async function api(path, opts) {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `伺服器回應 ${r.status}`);
  return j;
}

export const getDefaults = () => api('/api/defaults');
export const getScreen = (params) => api(`/api/screen?${qs(params)}`);
export const getStock = (code, params) => api(`/api/stock/${code}?${qs(params)}`);
export const getStatus = () => api('/api/status');
export const startUpdate = (backfill) =>
  api('/api/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backfill }),
  });
export const runDiagnose = () => api('/api/diagnose', { method: 'POST' });
export const lastDiagnose = () => api('/api/diagnose');
