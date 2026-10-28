// 上櫃（證券櫃檯買賣中心）。櫃買 2024 年改版過，新舊網址都試，欄位依標題比對
import { getJSON } from '../lib/http.js';
import { clean, num, findCol, extractTables, pickTable, isCommonStock, findKey } from '../lib/parse.js';
import { toSlash, toRocSlash, rocToYmd } from '../lib/dates.js';
import { parseRevenueOpenApi, parseMarginOpenApi } from './twse.js';

const BASE = 'https://www.tpex.org.tw';

// 回應裡的日期若與要求的不同（有些端點查不到會回最新一日），視為沒有資料
function dateOf(json) {
  const raw = json?.date ?? json?.reportDate ?? json?.tables?.[0]?.date ?? '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 8) return digits;
  if (digits.length === 7 || digits.length === 6) return rocToYmd(digits);
  return null;
}

async function tryAll(urls, date) {
  const errors = [];
  for (const u of urls) {
    try {
      const json = await getJSON(u);
      const got = dateOf(json);
      if (got && date && got !== date) return { json, tables: [] };
      const tables = extractTables(json);
      if (tables.some((t) => t.data?.length)) return { json, tables };
      // 有回應但沒資料（休市或尚未公布）
      if (tables.length || json.stat || json.iTotalRecords === 0) return { json, tables };
    } catch (e) {
      errors.push(e.message);
    }
  }
  throw new Error(`櫃買資料取得失敗：${errors.join(' | ')}`);
}

/** 某日全部上櫃股票收盤行情。休市回傳 null */
export async function fetchDaily(date) {
  const { tables } = await tryAll([
    `${BASE}/www/zh-tw/afterTrading/dailyQ?date=${encodeURIComponent(toSlash(date))}&type=EW&response=json`,
    `${BASE}/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?l=zh-tw&o=json&se=EW&d=${encodeURIComponent(toRocSlash(date))}`,
  ], date);
  let t = pickTable(tables, '代號', '收盤');
  let ix;
  if (t) {
    const f = t.fields;
    ix = {
      code: findCol(f, '代號'),
      name: findCol(f, '名稱'),
      c: findCol(f, '收盤'),
      o: findCol(f, '開盤'),
      h: findCol(f, '最高'),
      l: findCol(f, '最低'),
      v: findCol(f, '成交股數', ['成交', '股數']),
    };
  } else {
    // 舊版 aaData 沒有欄位名稱：代號,名稱,收盤,漲跌,開盤,最高,最低,均價,成交股數…
    t = tables.find((x) => x.data?.length);
    if (!t) return null;
    ix = { code: 0, name: 1, c: 2, o: 4, h: 5, l: 6, v: 8 };
  }
  const prices = {};
  for (const r of t.data) {
    const code = clean(r[ix.code]);
    if (!isCommonStock(code)) continue;
    const c = num(r[ix.c]);
    if (c == null) continue;
    prices[code] = {
      n: clean(r[ix.name]),
      o: num(r[ix.o]) ?? c,
      h: num(r[ix.h]) ?? c,
      l: num(r[ix.l]) ?? c,
      c,
      v: num(r[ix.v]) ?? 0,
    };
  }
  return Object.keys(prices).length ? { prices } : null;
}

/** 某日三大法人買賣超（股）→ {code: [投信, 外資]} */
export async function fetchInst(date) {
  const { tables } = await tryAll([
    `${BASE}/www/zh-tw/insti/dailyTrade?type=Daily&sect=EW&date=${encodeURIComponent(toSlash(date))}&response=json`,
    `${BASE}/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&o=json&se=EW&t=D&d=${encodeURIComponent(toRocSlash(date))}`,
  ], date);
  let t = pickTable(tables, '代號', '投信');
  let ix;
  if (t) {
    const f = t.fields;
    ix = {
      code: findCol(f, '代號'),
      trust: findCol(f, ['投信', '買賣超']),
      foreign: findCol(f, ['外資及陸資', '不含', '買賣超'], ['外資', '買賣超']),
    };
  } else {
    // 舊版欄位順序：代號,名稱,外資(不含自營)買,賣,淨,外資自營買,賣,淨,外資合計買,賣,淨,投信買,賣,淨…
    t = tables.find((x) => x.data?.length);
    if (!t) return null;
    ix = { code: 0, trust: 13, foreign: 4 };
  }
  const out = {};
  for (const r of t.data) {
    const code = clean(r[ix.code]);
    if (!isCommonStock(code)) continue;
    out[code] = [num(r[ix.trust]) ?? 0, ix.foreign >= 0 ? num(r[ix.foreign]) ?? 0 : 0];
  }
  return Object.keys(out).length ? out : null;
}

// ---- OpenAPI（只提供最新一期） ----

export async function fetchRevenueLatest() {
  return parseRevenueOpenApi(await getJSON(`${BASE}/openapi/v1/mopsfin_t187ap05_O`));
}

export async function fetchMarginLatest() {
  return parseMarginOpenApi(await getJSON(`${BASE}/openapi/v1/mopsfin_t187ap17_O`));
}

/** 備援：OpenAPI 最新一日行情（www 版擋掉時用）→ { date, prices } */
export async function fetchDailyOpenApi() {
  const arr = await getJSON(`${BASE}/openapi/v1/tpex_mainboard_daily_close_quotes`);
  let date = null;
  const prices = {};
  for (const o of arr ?? []) {
    const code = clean(o[findKey(o, /SecuritiesCompanyCode|^Code$/i)]);
    if (!isCommonStock(code)) continue;
    const c = num(o[findKey(o, /^Close$/i, /Closing/i)]);
    if (c == null) continue;
    date ??= rocToYmd(o[findKey(o, /^Date$/i)] ?? '');
    prices[code] = {
      n: clean(o[findKey(o, /CompanyName|^Name$/i)]),
      o: num(o[findKey(o, /^Open$/i)]) ?? c,
      h: num(o[findKey(o, /^High$/i)]) ?? c,
      l: num(o[findKey(o, /^Low$/i)]) ?? c,
      c,
      v: num(o[findKey(o, /TradingShares|TradeVolume/i)]) ?? 0,
    };
  }
  return { date, prices };
}
