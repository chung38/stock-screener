// 集保結算所：股權分散表（千張大戶）
import * as cheerio from 'cheerio';
import { request } from '../lib/http.js';
import { clean, num, parseCSV, isCommonStock } from '../lib/parse.js';

// 持股分級：1=1-999股 … 8=40,001-50,000股（≤50張）… 15=1,000,001股以上（千張大戶）
// 16=差異數調整，17=合計
const BIG_LEVEL = 15;
const RETAIL_MAX_LEVEL = 8;

function summarize(levels) {
  // levels: {level: {p:人數, s:股數, r:比例%}}
  const big = levels[BIG_LEVEL];
  const total = levels[17];
  if (!total) return null;
  let retail = 0;
  for (let i = 1; i <= RETAIL_MAX_LEVEL; i++) retail += levels[i]?.r ?? 0;
  return {
    b: big?.r ?? 0, // 千張大戶持股比例 %
    bp: big?.p ?? 0, // 千張大戶人數
    bs: big?.s ?? 0, // 千張大戶股數
    r: Math.round(retail * 100) / 100, // 50 張以下散戶比例 %
    tp: total.p, // 總股東人數
  };
}

/** 開放資料：最新一週全部股票 → { date, rows: {code: summary} } */
export async function fetchLatest() {
  const text = await request('https://opendata.tdcc.com.tw/getOD.ashx?id=1-5', { timeout: 90000 });
  const rows = parseCSV(text);
  const header = rows.shift() ?? [];
  if (!header.join('').includes('證券代號')) throw new Error('集保開放資料格式不符');
  const per = {};
  let date = null;
  for (const r of rows) {
    const code = clean(r[1]);
    if (!isCommonStock(code)) continue;
    date ??= clean(r[0]);
    const level = Number(r[2]);
    (per[code] ??= {})[level] = { p: num(r[3]) ?? 0, s: num(r[4]) ?? 0, r: num(r[5]) ?? 0 };
  }
  const out = {};
  for (const [code, levels] of Object.entries(per)) {
    const s = summarize(levels);
    if (s) out[code] = s;
  }
  return { date, rows: out };
}

// ---- 單一股票歷史查詢（網頁表單，用來替候選股回補前幾週） ----

const QRY = 'https://www.tdcc.com.tw/portal/zh/smWeb/qryStock';
let session = null;

function readForm(html) {
  const $ = cheerio.load(html);
  const token = $('input[name="SYNCHRONIZER_TOKEN"]').attr('value');
  const dates = $('#scaDate option, select[name="scaDate"] option')
    .map((_, o) => clean($(o).attr('value') || $(o).text()))
    .get()
    .filter((d) => /^\d{8}$/.test(d));
  return { $, token, dates };
}

function cookieFrom(res, prev = '') {
  const set = res.headers.getSetCookie?.() ?? [];
  const jar = new Map(
    prev
      .split('; ')
      .filter(Boolean)
      .map((c) => c.split('=')),
  );
  for (const c of set) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    jar.set(kv.slice(0, i), kv.slice(i + 1));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function ensureSession() {
  if (session && Date.now() - session.at < 10 * 60 * 1000) return session;
  const { text, res } = await request(QRY, { raw: true });
  const { token, dates } = readForm(text);
  if (!token) throw new Error('集保查詢頁格式改變（找不到 token）');
  session = { token, dates, cookie: cookieFrom(res), at: Date.now() };
  return session;
}

/** 可查詢的週別（新到舊） */
export async function availableDates() {
  return (await ensureSession()).dates;
}

/** 查單一股票某週的分級表 → summary 或 null */
export async function fetchStockWeek(code, date) {
  const s = await ensureSession();
  const body = new URLSearchParams({
    SYNCHRONIZER_TOKEN: s.token,
    SYNCHRONIZER_URI: '/portal/zh/smWeb/qryStock',
    method: 'submit',
    firDate: s.dates[0] ?? date,
    scaDate: date,
    sqlMethod: 'StockNo',
    stockNo: code,
    stockName: '',
  });
  const { text, res } = await request(QRY, {
    method: 'POST',
    body,
    raw: true,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: s.cookie, Referer: QRY },
  });
  const form = readForm(text);
  if (form.token) s.token = form.token;
  s.cookie = cookieFrom(res, s.cookie);
  const levels = {};
  form.$('table tr').each((_, tr) => {
    const tds = form
      .$(tr)
      .find('td')
      .map((__, td) => form.$(td).text())
      .get();
    if (tds.length < 5) return;
    const lv = Number(clean(tds[0]));
    if (!(lv >= 1 && lv <= 17)) return;
    levels[lv] = { p: num(tds[2]) ?? 0, s: num(tds[3]) ?? 0, r: num(tds[4]) ?? 0 };
  });
  // 有些版本合計列序號空白
  if (!levels[17]) {
    const totalP = Object.values(levels).reduce((a, x) => a + x.p, 0);
    const totalS = Object.values(levels).reduce((a, x) => a + x.s, 0);
    if (totalS) levels[17] = { p: totalP, s: totalS, r: 100 };
  }
  return summarize(levels);
}
