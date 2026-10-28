// 資料更新：每天收盤後跑一次；第一次使用時跑「回補」建立歷史資料
import * as twse from '../sources/twse.js';
import * as tpex from '../sources/tpex.js';
import * as mops from '../sources/mops.js';
import * as tdcc from '../sources/tdcc.js';
import { readJSON, writeJSON, listKeys, exists } from '../lib/store.js';
import {
  todayStr,
  nowTPE,
  recentWeekdays,
  shiftMonth,
  parseYm,
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

async function updateRevenue() {
  stage('月營收', 0);
  const found = [];
  for (const [label, src] of [
    ['上市', twse],
    ['上櫃', tpex],
  ]) {
    try {
      const byYm = await src.fetchRevenueLatest();
      await mergeRevenue(byYm);
      await mergeIndustry(byYm);
      found.push(...Object.keys(byYm));
    } catch (e) {
      await log('warn', `${label}月營收 OpenAPI：${e.message}`);
    }
  }
  const latest = found.sort().at(-1) ?? expectedLatestRevenueMonth();
  // 最新月由 OpenAPI 每天補齊；前幾個月用觀測站整月回補一次
  const meta = await getMeta();
  meta.complete ??= {};
  const months = [1, 2, 3, 4].map((i) => shiftMonth(latest, -i));
  if (!found.length) months.unshift(latest);
  stage('月營收（觀測站回補）', months.length);
  for (const ym of months) {
    if (meta.complete[`rev:${ym}`]) {
      state.done++;
      continue;
    }
    const { y, m } = parseYm(ym);
    let ok = true;
    for (const market of ['sii', 'otc']) {
      try {
        const rows = await mops.fetchRevenueMonth(market, y, m);
        if (rows && Object.keys(rows).length) await mergeRevenue({ [ym]: rows });
        else ok = false;
      } catch (e) {
        ok = false;
        await log('warn', `觀測站 ${ym} ${market === 'sii' ? '上市' : '上櫃'}月營收：${e.message}`);
      }
    }
    if (ok) {
      const m2 = await getMeta();
      m2.complete = { ...m2.complete, [`rev:${ym}`]: true };
      await saveMeta(m2);
    }
    state.done++;
  }
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
  const found = [];
  for (const [label, src] of [
    ['上市', twse],
    ['上櫃', tpex],
  ]) {
    try {
      const byQ = await src.fetchMarginLatest();
      await mergeMargins(byQ);
      found.push(...Object.keys(byQ));
    } catch (e) {
      await log('warn', `${label}營益分析 OpenAPI：${e.message}`);
    }
  }
  const latest = found.sort().at(-1) ?? expectedLatestQuarter();
  // 要還原 4 個單季毛利率，需要這些「累計」季別
  const need = new Set();
  for (let j = 0; j < 4; j++) {
    const k = shiftQuarter(latest, -j);
    need.add(k);
    if (parseQ(k).q > 1) need.add(shiftQuarter(k, -1));
  }
  if (found.length) need.delete(latest);
  const meta = await getMeta();
  meta.complete ??= {};
  const list = [...need].sort().reverse();
  stage('營益分析（觀測站回補）', list.length);
  for (const k of list) {
    if (meta.complete[`gm:${k}`]) {
      state.done++;
      continue;
    }
    const { y, q } = parseQ(k);
    let ok = true;
    for (const market of ['sii', 'otc']) {
      try {
        const rows = await mops.fetchMarginQuarter(market, y, q);
        if (Object.keys(rows).length) await mergeMargins({ [k]: rows });
        else ok = false;
      } catch (e) {
        ok = false;
        await log('warn', `觀測站 ${k} ${market === 'sii' ? '上市' : '上櫃'}營益分析：${e.message}`);
      }
    }
    if (ok) {
      const m2 = await getMeta();
      m2.complete = { ...m2.complete, [`gm:${k}`]: true };
      await saveMeta(m2);
    }
    state.done++;
  }
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
    const priceDates = recentWeekdays(today, deep ? Math.ceil(PRICE_DAYS * 1.12) : 8).reverse();
    await log('info', deep ? `開始建立歷史資料（約 ${PRICE_DAYS} 個交易日）` : '開始每日更新');

    await updatePrices(priceDates);
    await updateInst(recentWeekdays(today, deep ? INST_DAYS + 4 : 8).reverse());
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
