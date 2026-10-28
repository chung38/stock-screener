// 伺服器端：讀取累積的資料檔，再交給 core.js 篩選
import { loadData } from './data.js';
import {
  DEFAULTS,
  coerceParams,
  screenData,
  detailData,
  revenueCheck,
  marginCheck,
  trustCheck,
} from './core.js';

export { DEFAULTS, coerceParams };

export async function runScreen(query = {}) {
  return screenData(await loadData(), query);
}

export async function stockDetail(code, query = {}) {
  return detailData(await loadData(), code, query);
}

/** 給大戶回補用：通過基本面（與投信）的代號 */
export async function holderBackfillCandidates(limit = 150) {
  const p = coerceParams({});
  const D = await loadData({ priceDays: 30 });
  const out = [];
  for (const code of Object.keys(D.series)) {
    const rev = revenueCheck(code, D, p);
    if (rev.status !== 'ok' || !rev.pass) continue;
    const gm = marginCheck(code, D, p);
    if (gm.status === 'ok' && !gm.pass) continue;
    const trust = trustCheck(code, D, p);
    if (trust.status !== 'nodata' && !trust.pass) continue;
    out.push({ code, score: rev.avgYoy ?? 0 });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.code);
}
