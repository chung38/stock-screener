// 資料更新：每天收盤後跑一次；第一次使用時跑「回補」建立歷史資料
import * as twse from '../sources/twse.js';
import * as tpex from '../sources/tpex.js';
import * as mops from '../sources/mops.js';
import * as tdcc from '../sources/tdcc.js';
import { fetchMonth as fetchDividendMonth } from '../sources/dividends.js';
import { readJSON, writeJSON, listKeys, exists } from '../lib/store.js';
import {
  todayStr,
  nowTPE,
  recentWeekdays,
  isWeekend,
  addDays,
  shiftMonth,
  parseYm,
  ymKey,
  shiftQuarter,
  parseQ,
  expectedLatestQuarter,
  expectedLatestRevenueMonth,
} from '../lib/dates.js';
import { PRICE_DAYS, INST_DAYS } from '../config.js';
import { holderBackfillCandidates } from '../screener/screen.js';

const state = { running: false, kind: null, stage: '', done: 0, total: 0, startedAt: null, finishedAt: null, errors: [] };
export const jobState = () => ({ ...state, errors: state.errors.slice(-20) });

async function getMeta() {
  return (await readJSON('meta.json', null)) ?? { holidays: [], complete: {}, updated: {}, log: [] };
}
async function saveMeta(m) {
  m.log = (m.log ?? []).slice(-300);
  await writeJSON('meta.json', m);
}
async function log(level, msg) {
  const m = await getMeta();
  m.log.push({ t: new Date().toISOString(), level, msg });
  await saveMeta(m);
  if (level === 'error' || level === 'warn') state.errors.push(msg);
  console.log(`[${level}] ${msg}`);
}
function stage(name, total = 0) {
  state.stage = name;
  state.done = 0;
  state.total = total;
}

async function mergeStocks(prices, market) {
  const stocks = (await readJSON('stocks.json', {})) ?? {};
  let changed = false;
  for (const [code, r] of Object.entries(prices)) {
    const cur = stocks[code];
    if (!cur || cur.n !== r.n || cur.m !== market) {
      stocks[code] = { ...cur, n: r.n || cur?.n || code, m: market };
      changed = true;
    }
  }
  if (changed) await writeJSON('stocks.json', stocks);
}

async function mergeIndustry(byYm) {
  const stocks = (await readJSON('stocks.json', {})) ?? {};
  let changed = false;
  for (const rows of Object.values(byYm)) {
    for (const [code, r] of Object.entries(rows)) {
      if (r.ind && stocks[code]?.ind !== r.ind) {
        stocks[code] = { ...stocks[code], n: stocks[code]?.n ?? r.n, ind: r.ind };
        changed = true;
      }
    }
  }
  if (changed) await writeJSON('stocks.json', stocks);
}

// 今天的盤後資料大約 14:30（行情）、16:00（法人）才公布
function readyFor(date, minHour) {
  const now = nowTPE();
  if (date < now.ymd) return true;
  return now.hour >= minHour;
}

// ---------- 股價 ----------

async function updatePrices(dates) {
  const meta = await getMeta();
  const today = todayStr();
  const todo = [];
  for (const d of dates) {
    if (meta.holidays.includes(d)) continue;
    const f = await readJSON(`prices/${d}.json`, null);
    if (f && !f.partial?.length) continue;
    if (!readyFor(d, 15)) continue;
    todo.push(d);
  }
  stage('股價（上市＋上櫃）', todo.length);
  for (const d of todo) {
    const existing = await readJSON(`prices/${d}.json`, null);
    const need = existing?.partial ?? ['TWSE', 'TPEX'];
    const s = { ...(existing?.s ?? {}) };
    let taiex = existing?.taiex ?? null;
    const missing = [];
    let anyErr = false;
    if (need.includes('TWSE')) {
      try {
        const tw = await twse.fetchDaily(d);
        if (tw) {
          for (const [code, r] of Object.entries(tw.prices)) s[code] = [r.o, r.h, r.l, r.c, r.v];
          taiex = tw.taiex;
          await mergeStocks(tw.prices, 'TWSE');
        } else missing.push('TWSE');
      } catch (e) {
        anyErr = true;
        missing.push('TWSE');
        await log('warn', `${d} 上市行情：${e.message}`);
      }
    }
    if (need.includes('TPEX')) {
      try {
        const tp = await tpex.fetchDaily(d);
        if (tp) {
          for (const [code, r] of Object.entries(tp.prices)) s[code] = [r.o, r.h, r.l, r.c, r.v];
          await mergeStocks(tp.prices, 'TPEX');
        } else missing.push('TPEX');
      } catch (e) {
        anyErr = true;
        missing.push('TPEX');
        await log('warn', `${d} 上櫃行情：${e.message}`);
      }
    }
    if (!Object.keys(s).length) {
      // 兩邊都明確回「沒資料」且不是今天 → 休市
      if (!anyErr && d < today) {
        const m = await getMeta();
        m.holidays = [...new Set([...m.holidays, d])].sort().slice(-400);
        await saveMeta(m);
      }
    } else {
      await writeJSON(`prices/${d}.json`, { taiex, s, partial: missing.length ? missing : undefined });
    }
    state.done++;
  }
}

// ---------- 法人 ----------

async function updateInst(dates) {
  const meta = await getMeta();
  const todo = [];
  for (const d of dates) {
    if (meta.holidays.includes(d)) continue;
    if (!(await exists(`prices/${d}.json`))) continue; // 只抓有行情的交易日
    const f = await readJSON(`inst/${d}.json`, null);
    if (f && !f._partial?.length) continue;
    if (!readyFor(d, 17)) continue;
    todo.push(d);
  }
  stage('投信／外資買賣超', todo.length);
  for (const d of todo) {
    const existing = (await readJSON(`inst/${d}.json`, null)) ?? {};
    const need = existing._partial ?? ['TWSE', 'TPEX'];
    const out = { ...existing };
    delete out._partial;
    const missing = [];
    for (const [mk, src] of [
      ['TWSE', twse],
      ['TPEX', tpex],
    ]) {
      if (!need.includes(mk)) continue;
      try {
        const rows = await src.fetchInst(d);
        if (rows) Object.assign(out, rows);
        else missing.push(mk);
      } catch (e) {
        missing.push(mk);
        await log('warn', `${d} ${mk === 'TWSE' ? '上市' : '上櫃'}法人：${e.message}`);
      }
    }
    if (Object.keys(out).length) {
      if (missing.length) out._partial = missing;
      await writeJSON(`inst/${d}.json`, out);
    }
    state.done++;
  }
}

// ---------- 月營收 ----------

async function mergeRevenue(byYm) {
  for (const [ym, rows] of Object.entries(byYm)) {
    const cur = (await readJSON(`revenue/${ym}.json`, {})) ?? {};
    await writeJSON(`revenue/${ym}.json`, { ...cur, ...stripMeta(rows) });
  }
}
const stripMeta = (rows) =>
  Object.fromEntries(Object.entries(rows).map(([c, r]) => [c, { rev: r.rev, ly: r.ly, yoy: r.yoy }]));

// 每個期別上市、上櫃各有幾家公司（用 stocks.json 的市場別判斷）
async function marketCounts(dir) {
  const stocks = (await readJSON('stocks.json', {})) ?? {};
  const out = {};
  for (const k of await listKeys(dir)) {
    const f = (await readJSON(`${dir}/${k}.json`, {})) ?? {};
    const c = { sii: 0, otc: 0 };
    for (const code of Object.keys(f)) {
      const m = stocks[code]?.m;
      if (m === 'TWSE') c.sii++;
      else if (m === 'TPEX') c.otc++;
    }
    out[k] = c;
  }
  return out;
}

// 觀測站回補：periods 依新到舊；某市場 OpenAPI 已提供的期別就跳過。
// 最新一期不標記完成（公司陸續申報，每天重抓）。
// 家數明顯少於其他期別（例如網頁只抓到一半）視為不完整，即使標記過完成也重抓。
export async function backfillFromMops({ kind, dir, label, periods, latest, foundBy, fetchOne, merge }) {
  const meta = await getMeta();
  meta.complete ??= {};
  const counts = await marketCounts(dir);
  const ref = (market) => Math.max(0, ...Object.values(counts).map((c) => c[market]));
  const looksComplete = (k, market) => {
    const r = ref(market);
    return !r || (counts[k]?.[market] ?? 0) >= r * 0.9;
  };
  stage(`${label}（觀測站回補）`, periods.length);
  for (const k of periods) {
    for (const market of ['sii', 'otc']) {
      const doneKey = `${kind}:${k}:${market}`;
      const flagged = meta.complete[`${kind}:${k}`] || meta.complete[doneKey];
      if (flagged && looksComplete(k, market)) continue;
      if (foundBy[market].has(k)) continue;
      try {
        const rows = await fetchOne(market, k);
        if (rows && Object.keys(rows).length) {
          await merge({ [k]: rows });
          Object.assign(counts, await marketCounts(dir));
          const m2 = await getMeta();
          if (k !== latest && looksComplete(k, market)) {
            m2.complete = { ...m2.complete, [doneKey]: true };
          } else if (flagged) {
            // 之前誤標為完成：取消標記，下次再補
            delete m2.complete[doneKey];
            delete m2.complete[`${kind}:${k}`];
          }
          await saveMeta(m2);
          if (flagged) {
            const name = `${k} ${market === 'sii' ? '上市' : '上櫃'}${label}`;
            await log('info', looksComplete(k, market) ? `${name}之前只抓到一部分，已補齊` : `${name}仍不完整，下次更新再試`);
          }
        }
      } catch (e) {
        await log('warn', `觀測站 ${k} ${market === 'sii' ? '上市' : '上櫃'}${label}：${e.message}`);
      }
    }
    state.done++;
  }
}

async function updateRevenue() {
  stage('月營收', 0);
  const foundBy = { sii: new Set(), otc: new Set() };
  for (const [label, src, market] of [
    ['上市', twse, 'sii'],
    ['上櫃', tpex, 'otc'],
  ]) {
    try {
      const byYm = await src.fetchRevenueLatest();
      await mergeRevenue(byYm);
      await mergeIndustry(byYm);
      for (const k of Object.keys(byYm)) foundBy[market].add(k);
    } catch (e) {
      await log('warn', `${label}月營收 OpenAPI：${e.message}`);
    }
  }
  const latest = [...foundBy.sii, ...foundBy.otc].sort().at(-1) ?? expectedLatestRevenueMonth();
  await backfillFromMops({
    kind: 'rev',
    dir: 'revenue',
    label: '月營收',
    periods: [0, 1, 2, 3, 4].map((i) => shiftMonth(latest, -i)),
    latest,
    foundBy,
    fetchOne: (market, ym) => {
      const { y, m } = parseYm(ym);
      return mops.fetchRevenueMonth(market, y, m);
    },
    merge: mergeRevenue,
  });
}

// ---------- 營益分析（毛利率） ----------

async function mergeMargins(byQ) {
  for (const [k, rows] of Object.entries(byQ)) {
    const cur = (await readJSON(`margins/${k}.json`, {})) ?? {};
    await writeJSON(`margins/${k}.json`, { ...cur, ...rows });
  }
}

async function updateMargins() {
  stage('營益分析', 0);
  const foundBy = { sii: new Set(), otc: new Set() };
  for (const [label, src, market] of [
    ['上市', twse, 'sii'],
    ['上櫃', tpex, 'otc'],
  ]) {
    try {
      const byQ = await src.fetchMarginLatest();
      await mergeMargins(byQ);
      for (const k of Object.keys(byQ)) foundBy[market].add(k);
    } catch (e) {
      // 櫃買這支 OpenAPI 目前固定回網頁而不是資料，改由觀測站補，不算警告
      if (market === 'otc') console.log(`[info] ${label}營益分析 OpenAPI 無法使用，改用觀測站`);
      else await log('warn', `${label}營益分析 OpenAPI：${e.message}`);
    }
  }
  const latest = [...foundBy.sii, ...foundBy.otc].sort().at(-1) ?? expectedLatestQuarter();
  // 要還原 4 個單季毛利率，需要這些「累計」季別
  const need = new Set();
  for (let j = 0; j < 4; j++) {
    const k = shiftQuarter(latest, -j);
    need.add(k);
    if (parseQ(k).q > 1) need.add(shiftQuarter(k, -1));
  }
  await backfillFromMops({
    kind: 'gm',
    dir: 'margins',
    label: '營益分析',
    periods: [...need].sort().reverse(),
    latest,
    foundBy,
    fetchOne: (market, k) => {
      const { y, q } = parseQ(k);
      return mops.fetchMarginQuarter(market, y, q);
    },
    merge: mergeMargins,
  });
}

// ---------- 集保千張大戶 ----------

async function updateHolders() {
  stage('集保股權分散（最新一週）', 1);
  try {
    const { date, rows } = await tdcc.fetchLatest();
    if (date && Object.keys(rows).length) {
      await writeJSON(`holders/${date}.json`, { rows });
    }
  } catch (e) {
    await log('warn', `集保開放資料：${e.message}`);
  }
  state.done = 1;
}

async function backfillHolders(weeksNeeded = 3) {
  const keys = await listKeys('holders');
  if (!keys.length) return;
  const files = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await readJSON(`holders/${k}.json`, {})])));
  const latest = keys.at(-1);
  let codes = await holderBackfillCandidates(150);
  codes = codes.filter((c) => files[latest]?.rows?.[c]);
  let dates;
  try {
    dates = (await tdcc.availableDates()).filter((d) => d < latest).slice(0, weeksNeeded);
  } catch (e) {
    await log('warn', `集保查詢頁：${e.message}`);
    return;
  }
  const tasks = [];
  for (const code of codes) for (const d of dates) if (!files[d]?.rows?.[code]) tasks.push([code, d]);
  stage('千張大戶回補（候選股）', tasks.length);
  let fails = 0;
  for (const [code, d] of tasks) {
    try {
      const sum = await tdcc.fetchStockWeek(code, d);
      if (sum) {
        const f = (files[d] ??= { rows: {}, partial: true });
        f.rows[code] = sum;
        if (state.done % 10 === 0) await writeJSON(`holders/${d}.json`, f);
      }
    } catch (e) {
      fails++;
      if (fails <= 3) await log('warn', `集保 ${code} ${d}：${e.message}`);
      if (fails > 15) {
        await log('error', '集保查詢連續失敗，先停止回補');
        break;
      }
    }
    state.done++;
  }
  for (const d of dates) if (files[d]) await writeJSON(`holders/${d}.json`, files[d]);
}

// ---------- 除權息（還原股價用） ----------

async function updateDividends() {
  stage('除權息', 1);
  const all = (await readJSON('dividends.json', null)) ?? {};
  const t = todayStr();
  const cur = ymKey(Number(t.slice(0, 4)), Number(t.slice(4, 6)));
  // 平常抓本月與上月；還沒有資料時抓近 6 個月（篩選用的股價約 5 個月）
  const back = Object.keys(all).length ? 1 : 5;
  let added = 0;
  for (let i = back; i >= 0; i--) {
    const { y, m } = parseYm(shiftMonth(cur, -i));
    const r = await fetchDividendMonth(y, m);
    for (const [code, ymd, prev, ref] of r.rows) {
      const list = (all[code] ??= []);
      if (list.some((x) => x[0] === ymd)) continue;
      list.push([ymd, prev, ref]);
      added++;
    }
    if (!r.markets.length && r.errors.length) await log('warn', `除權息 ${y}/${m}：${r.errors[0]}`);
  }
  if (added) {
    // 只留近 30 個月，並依日期排序
    const cutoff = `${shiftMonth(cur, -30).replace('-', '')}01`;
    for (const [code, list] of Object.entries(all)) {
      const keep = list.filter((x) => x[0] >= cutoff).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      if (keep.length) all[code] = keep;
      else delete all[code];
    }
    await writeJSON('dividends.json', all);
  }
  state.done = 1;
}

// 每日更新要往回看幾個平日：至少 8 天；中間停了很久（例如電腦幾週沒開）就補到上次的資料為止
async function dailyWindow(today) {
  const last = (await listKeys('prices')).at(-1);
  if (!last) return 8;
  let n = 0;
  for (let d = today; d > last && n < 260; d = addDays(d, -1)) if (!isWeekend(d)) n++;
  return Math.max(8, n + 2);
}

// ---------- 對外 ----------

export async function runUpdate({ backfill = false } = {}) {
  if (state.running) throw new Error('已經有更新在跑了');
  Object.assign(state, {
    running: true,
    kind: backfill ? 'backfill' : 'daily',
    stage: '準備中',
    done: 0,
    total: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    errors: [],
  });
  try {
    const today = todayStr();
    const have = (await listKeys('prices')).length;
    const deep = backfill || have < 30;
    const win = deep ? 0 : await dailyWindow(today);
    const priceDates = recentWeekdays(today, deep ? Math.ceil(PRICE_DAYS * 1.12) : win).reverse();
    await log('info', deep ? `開始建立歷史資料（約 ${PRICE_DAYS} 個交易日）` : win > 8 ? `開始每日更新（補齊近 ${win} 個平日）` : '開始每日更新');

    await updatePrices(priceDates);
    await updateInst(recentWeekdays(today, deep ? INST_DAYS + 4 : win).reverse());
    await updateDividends();
    await updateRevenue();
    await updateMargins();
    await updateHolders();
    await backfillHolders(3);

    const m = await getMeta();
    m.updated = { ...m.updated, lastRun: new Date().toISOString(), lastKind: state.kind };
    await saveMeta(m);
    await log('info', `更新完成${state.errors.length ? `（${state.errors.length} 個警告）` : ''}`);
  } catch (e) {
    await log('error', `更新中斷：${e.message}`);
    throw e;
  } finally {
    state.running = false;
    state.stage = '';
    state.finishedAt = new Date().toISOString();
  }
}

/**
 * 研究用：補齊約 2 年的月營收、營益分析、法人買賣超，供策略回測
 * 只需要跑一次；之後每日更新會自動接續
 */
export async function runResearchBackfill() {
  if (state.running) throw new Error('已經有更新在跑了');
  Object.assign(state, { running: true, kind: 'research', stage: '準備中', done: 0, total: 0, errors: [] });
  try {
    await log('info', '開始補齊研究用歷史資料（月營收、營益分析、法人約 2 年）');
    const empty = { sii: new Set(), otc: new Set() };
    const revLatest = (await listKeys('revenue')).at(-1) ?? expectedLatestRevenueMonth();
    await backfillFromMops({
      kind: 'rev',
      dir: 'revenue',
      label: '月營收（2 年）',
      periods: Array.from({ length: 26 }, (_, i) => shiftMonth(revLatest, -i)),
      latest: revLatest,
      foundBy: empty,
      fetchOne: (market, ym) => {
        const { y, m } = parseYm(ym);
        return mops.fetchRevenueMonth(market, y, m);
      },
      merge: mergeRevenue,
    });
    const gmLatest = (await listKeys('margins')).at(-1) ?? expectedLatestQuarter();
    await backfillFromMops({
      kind: 'gm',
      dir: 'margins',
      label: '營益分析（2 年）',
      periods: Array.from({ length: 10 }, (_, i) => shiftQuarter(gmLatest, -i)),
      latest: gmLatest,
      foundBy: empty,
      fetchOne: (market, k) => {
        const { y, q } = parseQ(k);
        return mops.fetchMarginQuarter(market, y, q);
      },
      merge: mergeMargins,
    });
    await updateInst(recentWeekdays(todayStr(), 560).reverse());
    await log('info', `研究用資料補齊完成${state.errors.length ? `（${state.errors.length} 個警告）` : ''}`);
  } finally {
    state.running = false;
    state.stage = '';
  }
}

export async function runHoldersOnly() {
  if (state.running) return;
  state.running = true;
  state.kind = 'holders';
  try {
    await updateHolders();
    await backfillHolders(3);
  } finally {
    state.running = false;
    state.stage = '';
  }
}

export async function getStatus() {
  const meta = await getMeta();
  return {
    job: jobState(),
    updated: meta.updated,
    log: meta.log.slice(-60).reverse(),
  };
}
