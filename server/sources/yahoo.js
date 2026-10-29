// Yahoo Finance 日線（國際指數、匯率、利率、原物料期貨）。免費、不需要金鑰
// 證交所等台灣網站在國外常被擋，Yahoo 則相反：GitHub Actions 可以穩定連線
import { getJSON } from '../lib/http.js';

const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

/**
 * 抓某個代號的日收盤
 * @param {string} sym Yahoo 代號，例如 ^SOX、CL=F、TWD=X
 * @param {string} range 1mo、6mo、2y…
 * @returns {Promise<{name:string, currency:string, d:string[], c:number[]}>} 日期為該市場當地日期 YYYYMMDD
 */
export async function fetchDaily(sym, range = '1mo') {
  let lastErr;
  for (const host of HOSTS) {
    try {
      const j = await getJSON(`${host}/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`, { retries: 1 });
      const res = j?.chart?.result?.[0];
      if (!res) throw new Error(`Yahoo 沒有 ${sym} 的資料：${JSON.stringify(j?.chart?.error ?? '').slice(0, 120)}`);
      return parseChart(res);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** chart API 的 result → 依當地日期排序、去掉沒有收盤價的日子 */
export function parseChart(res) {
  const ts = res.timestamp ?? [];
  const close = res.indicators?.quote?.[0]?.close ?? [];
  const off = Number(res.meta?.gmtoffset ?? 0); // 交易所時區（秒），亞洲市場不換算會差一天
  const byDate = new Map();
  for (let i = 0; i < ts.length; i++) {
    const c = close[i];
    if (c == null || !Number.isFinite(c) || c <= 0) continue;
    const d = new Date((ts[i] + off) * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    byDate.set(d, Math.round(c * 10000) / 10000); // 同一天有兩筆時取後面那筆
  }
  // 最後一天的日線有時還沒有收盤價（亞洲指數常見），用即時報價補上；之後更新會被正式收盤覆蓋
  const p = res.meta?.regularMarketPrice;
  const t = res.meta?.regularMarketTime;
  if (Number.isFinite(p) && p > 0 && Number.isFinite(t)) {
    const d = new Date((t + off) * 1000).toISOString().slice(0, 10).replace(/-/g, '');
    if (!byDate.has(d) && d > ([...byDate.keys()].sort().at(-1) ?? '')) byDate.set(d, Math.round(p * 10000) / 10000);
  }
  const d = [...byDate.keys()].sort();
  return {
    name: res.meta?.shortName ?? res.meta?.longName ?? res.meta?.symbol ?? '',
    currency: res.meta?.currency ?? '',
    d,
    c: d.map((k) => byDate.get(k)),
  };
}
