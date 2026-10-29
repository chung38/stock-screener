// 上市（臺灣證券交易所）
import { getJSON } from '../lib/http.js';
import { clean, num, findCol, extractTables, pickTable, isCommonStock, findKey } from '../lib/parse.js';
import { ymKey, qKey } from '../lib/dates.js';

const WWW = 'https://www.twse.com.tw';
const OPENAPI = 'https://openapi.twse.com.tw/v1';

async function firstOk(urls) {
  let lastErr;
  for (const u of urls) {
    try {
      return await getJSON(u);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** 某日全部上市股票收盤行情 + 加權指數。休市回傳 null */
export async function fetchDaily(date) {
  const json = await firstOk([
    `${WWW}/rwd/zh/afterTrading/MI_INDEX?date=${date}&type=ALLBUT0999&response=json`,
    `${WWW}/exchangeReport/MI_INDEX?response=json&date=${date}&type=ALLBUT0999`,
  ]);
  if (json.stat && json.stat !== 'OK') return null;
  if (json.date && String(json.date) !== date) return null;
  const tables = extractTables(json);
  const t = pickTable(tables, '證券代號', '收盤價');
  if (!t) return null;
  const f = t.fields;
  const ix = {
    code: findCol(f, '證券代號'),
    name: findCol(f, '證券名稱'),
    o: findCol(f, '開盤價'),
    h: findCol(f, '最高價'),
    l: findCol(f, '最低價'),
    c: findCol(f, '收盤價'),
    v: findCol(f, '成交股數'),
  };
  const prices = {};
  for (const r of t.data) {
    const code = clean(r[ix.code]);
    if (!isCommonStock(code)) continue;
    const c = num(r[ix.c]);
    if (c == null) continue; // 當天沒成交
    prices[code] = {
      n: clean(r[ix.name]),
      o: num(r[ix.o]) ?? c,
      h: num(r[ix.h]) ?? c,
      l: num(r[ix.l]) ?? c,
      c,
      v: num(r[ix.v]) ?? 0,
    };
  }
  let taiex = null;
  const ti = tables.find((x) => x.fields && findCol(x.fields, '收盤指數') >= 0);
  if (ti) {
    const ic = findCol(ti.fields, '收盤指數');
    const row = ti.data.find((r) => clean(r[0]) === '發行量加權股價指數');
    if (row) taiex = num(row[ic]);
  }
  return { prices, taiex };
}

/** 某日三大法人買賣超（股） */
export async function fetchInst(date) {
  const json = await firstOk([
    `${WWW}/rwd/zh/fund/T86?date=${date}&selectType=ALLBUT0999&response=json`,
    `${WWW}/fund/T86?response=json&date=${date}&selectType=ALLBUT0999`,
  ]);
  if (json.stat && json.stat !== 'OK') return null;
  if (json.date && String(json.date) !== date) return null;
  const t = pickTable(extractTables(json), '證券代號', '投信');
  if (!t) return null;
  const f = t.fields;
  const ic = findCol(f, '證券代號');
  const it = findCol(f, ['投信', '買賣超']);
  const ifo = findCol(f, ['外陸資', '買賣超', '不含'], ['外資', '買賣超', '不含'], ['外資', '買賣超']);
  const out = {};
  for (const r of t.data) {
    const code = clean(r[ic]);
    if (!isCommonStock(code)) continue;
    out[code] = [num(r[it]) ?? 0, ifo >= 0 ? num(r[ifo]) ?? 0 : 0];
  }
  return out;
}

// ---- OpenAPI（只提供最新一期，用來每日更新） ----

/** OpenAPI 月營收彙總表 → { ym, rows: {code:{rev, ly, yoy, n, ind}} }。上市、上櫃欄位相同 */
export function parseRevenueOpenApi(arr) {
  const byYm = {};
  for (const o of arr ?? []) {
    const code = clean(o[findKey(o, '公司代號')]);
    if (!isCommonStock(code)) continue;
    const raw = clean(o[findKey(o, '資料年月')]);
    if (raw.length < 4) continue;
    const ym = ymKey(Number(raw.slice(0, -2)) + 1911, Number(raw.slice(-2)));
    // 「當月營收」也是「去年當月營收」的一部分，要排除，不能靠欄位順序
    const revKey = Object.keys(o).find((x) => x.includes('當月營收') && !x.includes('去年') && !x.includes('上月'));
    const rev = num(o[revKey]);
    const ly = num(o[findKey(o, ['去年當月營收'])]);
    let yoy = num(o[findKey(o, ['去年同月增減'])]);
    if (yoy == null && rev != null && ly) yoy = ((rev - ly) / Math.abs(ly)) * 100;
    if (rev == null) continue;
    (byYm[ym] ??= {})[code] = {
      rev,
      ly,
      yoy,
      n: clean(o[findKey(o, '公司名稱')]),
      ind: clean(o[findKey(o, '產業別')]),
    };
  }
  return byYm;
}

/** OpenAPI 營益分析（累計至該季）→ { [qKey]: {code:{rev, gm}} } */
export function parseMarginOpenApi(arr) {
  const byQ = {};
  for (const o of arr ?? []) {
    const code = clean(o[findKey(o, '公司代號')]);
    if (!isCommonStock(code)) continue;
    const y = Number(clean(o[findKey(o, '年度')])) + 1911;
    const q = Number(clean(o[findKey(o, '季別')]));
    if (!y || !q) continue;
    const rev = num(o[findKey(o, '營業收入')]);
    const gm = num(o[findKey(o, '毛利率')]);
    if (rev == null || gm == null) continue; // 金融保險業沒有毛利率
    (byQ[qKey(y, q)] ??= {})[code] = { rev, gm };
  }
  return byQ;
}

export async function fetchRevenueLatest() {
  return parseRevenueOpenApi(await getJSON(`${OPENAPI}/opendata/t187ap05_L`));
}

export async function fetchMarginLatest() {
  return parseMarginOpenApi(await getJSON(`${OPENAPI}/opendata/t187ap17_L`));
}
