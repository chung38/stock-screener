// 除權息資料：用來把歷史股價還原權息，避免回測把「除息」當成下跌
import { getJSON } from '../lib/http.js';
import { clean, num, findCol, extractTables, isCommonStock } from '../lib/parse.js';
import { rocToYmd, toSlash, toRocSlash } from '../lib/dates.js';

// 把各種寫法的日期轉成 YYYYMMDD：'114年01月02日'、'114/01/02'、'20250102'
function toYmd(s) {
  const d = String(s ?? '').replace(/\D/g, '');
  if (d.length === 8 && d.startsWith('20')) return d;
  if (d.length === 7 || d.length === 6) return rocToYmd(d);
  return null;
}

/** 從表格裡挑出 [日期, 代號, 除權息前收盤價, 參考價] */
function parseRows(tables) {
  const out = [];
  for (const t of tables) {
    if (!t.fields || !t.data?.length) continue;
    const f = t.fields;
    const iCode = findCol(f, '股票代號', '代號');
    const iDate = findCol(f, '資料日期', '除權息日期', '日期');
    const iPrev = findCol(f, '除權息前收盤價', ['前', '收盤']);
    const iRef = findCol(f, '除權息參考價', ['參考價']);
    if ([iCode, iDate, iPrev, iRef].some((x) => x < 0)) continue;
    for (const r of t.data) {
      const code = clean(r[iCode]);
      if (!isCommonStock(code)) continue;
      const ymd = toYmd(r[iDate]);
      const prev = num(r[iPrev]);
      const ref = num(r[iRef]);
      if (!ymd || !(prev > 0) || !(ref > 0) || ref >= prev) continue;
      out.push([code, ymd, prev, ref]);
    }
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
const monthEnd = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 抓某個月份的上市＋上櫃除權息資料 → { rows, errors, samples } */
export async function fetchMonth(y, m) {
  const start = `${y}${pad(m)}01`;
  const end = `${y}${pad(m)}${pad(monthEnd(y, m))}`;
  const errors = [];
  const samples = {};
  const rows = [];
  const tries = [
    ['TWSE', `https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=${start}&endDate=${end}&response=json`],
    [
      'TPEX',
      `https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate=${encodeURIComponent(toSlash(start))}&endDate=${encodeURIComponent(toSlash(end))}&response=json`,
    ],
    [
      'TPEX',
      `https://www.tpex.org.tw/web/stock/exright/dailyquo/exDailyQ_result.php?l=zh-tw&o=json&d=${encodeURIComponent(toRocSlash(start))}&ed=${encodeURIComponent(toRocSlash(end))}`,
    ],
  ];
  const got = new Set();
  for (const [mk, url] of tries) {
    if (got.has(mk)) continue;
    try {
      const json = await getJSON(url, { retries: 1 });
      const tables = extractTables(json);
      samples[url] = tables.map((t) => ({ fields: t.fields, first: t.data?.[0] }));
      const r = parseRows(tables);
      if (r.length) got.add(mk);
      rows.push(...r);
    } catch (e) {
      errors.push(`${mk} ${y}/${m}：${e.message}`);
    }
  }
  return { rows, errors, samples, markets: [...got] };
}
