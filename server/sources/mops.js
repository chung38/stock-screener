// 公開資訊觀測站（舊版站 mopsov）：回補歷史月營收與各季營益分析
import * as cheerio from 'cheerio';
import { request } from '../lib/http.js';
import { clean, num, isCommonStock } from '../lib/parse.js';

const BASE = 'https://mopsov.twse.com.tw';

// market：'sii' 上市、'otc' 上櫃
function rowsOf(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $('tr').each((_, tr) => {
    const tds = $(tr)
      .find('td')
      .map((__, td) => $(td).text())
      .get();
    if (tds.length >= 4) rows.push(tds);
  });
  return rows;
}

/**
 * 某月營收（含國內公司 _0 與 KY 公司 _1 兩張表）
 * 欄位：公司代號, 公司名稱, 當月營收, 上月營收, 去年當月營收, 上月比較增減(%), 去年同月增減(%), …
 */
export async function fetchRevenueMonth(market, y, m) {
  const out = {};
  let fetchedAny = false;
  for (const suffix of [0, 1]) {
    const url = `${BASE}/nas/t21/${market}/t21sc03_${y - 1911}_${m}_${suffix}.html`;
    let html;
    try {
      html = await request(url, { encoding: 'cp950', retries: 1 });
      fetchedAny = true;
    } catch (e) {
      if (suffix === 0) throw e;
      continue; // 有些月份沒有 KY 表
    }
    for (const tds of rowsOf(html)) {
      const code = clean(tds[0]);
      if (!isCommonStock(code) || tds.length < 7) continue;
      const rev = num(tds[2]);
      const ly = num(tds[4]);
      let yoy = num(tds[6]);
      if (rev == null) continue;
      if (yoy == null && ly) yoy = ((rev - ly) / Math.abs(ly)) * 100;
      out[code] = { rev, ly, yoy, n: clean(tds[1]) };
    }
  }
  return fetchedAny ? out : null;
}

/**
 * 某季營益分析（累計至該季）：公司代號, 公司名稱, 營業收入(百萬元), 毛利率(%), …
 */
export async function fetchMarginQuarter(market, y, q) {
  const body = new URLSearchParams({
    encodeURIComponent: '1',
    step: '1',
    firstin: '1',
    off: '1',
    isQuery: 'Y',
    TYPEK: market,
    year: String(y - 1911),
    season: `0${q}`,
  });
  const html = await request(`${BASE}/mops/web/ajax_t163sb06`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${BASE}/mops/web/t163sb06` },
  });
  if (/查詢過於頻繁|Overrun/i.test(html)) throw new Error('觀測站回應「查詢過於頻繁」，稍後再試');
  const out = {};
  for (const tds of rowsOf(html)) {
    const code = clean(tds[0]);
    if (!isCommonStock(code)) continue;
    const rev = num(tds[2]);
    const gm = num(tds[3]);
    if (rev == null || gm == null) continue;
    out[code] = { rev, gm };
  }
  return out;
}
