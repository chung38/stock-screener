// 日期工具：內部一律用 'YYYYMMDD' 字串，以台北時間為準
// 不 import config.js，讓瀏覽器也能用這個檔案
const TZ = 'Asia/Taipei';

export function nowTPE() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour) % 24;
  return {
    ymd: `${parts.year}${parts.month}${parts.day}`,
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hour,
    minute: Number(parts.minute),
  };
}

export const todayStr = () => nowTPE().ymd;

export function toDate(ymd) {
  return new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
}

export function fmt(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function addDays(ymd, n) {
  const d = toDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export const weekday = (ymd) => toDate(ymd).getUTCDay();
export const isWeekend = (ymd) => [0, 6].includes(weekday(ymd));

export const toSlash = (ymd) => `${ymd.slice(0, 4)}/${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`;
export const toDash = (ymd) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
export const toRocSlash = (ymd) => `${Number(ymd.slice(0, 4)) - 1911}/${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`;

// '1151027' 或 '115/10/27' → '20261027'
export function rocToYmd(s) {
  const t = String(s).replace(/\D/g, '');
  if (t.length < 6) return null;
  const y = Number(t.slice(0, t.length - 4)) + 1911;
  return `${y}${t.slice(-4)}`;
}

// 從 from（含）往前列出 count 個平日（不含週末，假日由抓資料時判斷）
export function recentWeekdays(from, count) {
  const out = [];
  let d = from;
  while (out.length < count) {
    if (!isWeekend(d)) out.push(d);
    d = addDays(d, -1);
  }
  return out;
}

// 月份 key：'2026-09'
export const ymKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export function parseYm(key) {
  const [y, m] = key.split('-').map(Number);
  return { y, m };
}
export function shiftMonth(key, n) {
  const { y, m } = parseYm(key);
  const idx = y * 12 + (m - 1) + n;
  return ymKey(Math.floor(idx / 12), (idx % 12) + 1);
}

// 季 key：'2026Q2'
export const qKey = (y, q) => `${y}Q${q}`;
export function parseQ(key) {
  const [y, q] = key.split('Q').map(Number);
  return { y, q };
}
export function shiftQuarter(key, n) {
  const { y, q } = parseQ(key);
  const idx = y * 4 + (q - 1) + n;
  return qKey(Math.floor(idx / 4), (idx % 4) + 1);
}

// 依法定申報期限推估「目前應該已公布」的最新季別（OpenAPI 抓不到時的後備）
export function expectedLatestQuarter(ymd = todayStr()) {
  const y = Number(ymd.slice(0, 4));
  const md = ymd.slice(4);
  if (md > '1114') return qKey(y, 3);
  if (md > '0814') return qKey(y, 2);
  if (md > '0515') return qKey(y, 1);
  if (md > '0331') return qKey(y - 1, 4);
  return qKey(y - 1, 3);
}

// 推估最新應已公布的月營收月份（每月 10 日前公布上月）
export function expectedLatestRevenueMonth(ymd = todayStr()) {
  const key = ymKey(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)));
  return Number(ymd.slice(6, 8)) > 10 ? shiftMonth(key, -1) : shiftMonth(key, -2);
}
