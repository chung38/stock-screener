// 兩種模式：
// - 伺服器模式（本機 npm start）：呼叫 /api/*
// - 靜態模式（GitHub Pages，VITE_STATIC=1）：下載 data.json，在瀏覽器裡篩選
import { DEFAULTS, screenData, detailData } from '../../server/screener/core.js';
import { unpack } from '../../server/screener/bundle.js';
import { currentBreakouts } from '../../server/screener/breakout.js';

export const STATIC = import.meta.env.VITE_STATIC === '1';
export const REPO = import.meta.env.VITE_REPO || '';

const qs = (o = {}) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)])).toString();

async function api(path, opts) {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `伺服器回應 ${r.status}`);
  return j;
}

// ---- 靜態模式 ----
let bundlePromise = null;
function loadBundle() {
  bundlePromise ??= fetch(`data.json?t=${Math.floor(Date.now() / 600000)}`)
    .then((r) => {
      if (r.status === 404) return null; // 還沒跑過第一次更新
      if (!r.ok) throw new Error(`讀取資料失敗（${r.status}）`);
      return r.json();
    })
    .then((B) => (B ? { B, D: unpack(B) } : { B: null, D: null }))
    .catch((e) => {
      bundlePromise = null;
      throw e;
    });
  return bundlePromise;
}

const EMPTY = {
  stocks: {},
  priceKeys: [],
  series: {},
  taiex: [],
  revKeys: [],
  rev: {},
  marginKeys: [],
  margins: {},
  holderKeys: [],
  holders: {},
  instKeys: [],
  inst: {},
};

export const getDefaults = () => (STATIC ? Promise.resolve(DEFAULTS) : api('/api/defaults'));

export async function getScreen(params) {
  if (!STATIC) return api(`/api/screen?${qs(params)}`);
  const { D } = await loadBundle();
  return screenData(D ?? EMPTY, params);
}

export async function getStock(code, params) {
  if (!STATIC) return api(`/api/stock/${code}?${qs(params)}`);
  const { D } = await loadBundle();
  const d = D && detailData(D, code, params);
  if (!d) throw new Error('找不到這檔股票的資料');
  return d;
}

export async function getBreakouts(params) {
  if (!STATIC) return api(`/api/breakout?${qs(params)}`);
  const { D } = await loadBundle();
  return currentBreakouts(D ?? EMPTY, params);
}

let backtestPromise = null;
export function getBacktest() {
  if (!STATIC) return (backtestPromise ??= api('/api/backtest').catch((e) => ((backtestPromise = null), Promise.reject(e))));
  backtestPromise ??= fetch(`backtest.json?t=${Math.floor(Date.now() / 600000)}`)
    .then((r) => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`讀取回測結果失敗（${r.status}）`);
      return r.json();
    })
    .catch((e) => {
      backtestPromise = null;
      throw e;
    });
  return backtestPromise;
}

let researchPromise = null;
export function getResearch() {
  if (!STATIC) return (researchPromise ??= api('/api/research').catch((e) => ((researchPromise = null), Promise.reject(e))));
  researchPromise ??= fetch(`research.json?t=${Math.floor(Date.now() / 600000)}`)
    .then((r) => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`讀取策略研究結果失敗（${r.status}）`);
      return r.json();
    })
    .catch((e) => {
      researchPromise = null;
      throw e;
    });
  return researchPromise;
}

export async function getStatus() {
  if (!STATIC) return api('/api/status');
  const { B } = await loadBundle();
  return {
    job: { running: false, errors: [] },
    updated: { lastRun: B?.meta?.lastRun ?? B?.generatedAt ?? null },
    log: B?.meta?.log ?? [],
  };
}

export const startUpdate = (backfill) =>
  api('/api/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backfill }),
  });
export const runDiagnose = () => api('/api/diagnose', { method: 'POST' });
export const lastDiagnose = () => (STATIC ? Promise.resolve({ results: [] }) : api('/api/diagnose'));
