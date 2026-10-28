export const fmtDate = (ymd) => (ymd ? `${ymd.slice(0, 4)}/${ymd.slice(4, 6)}/${ymd.slice(6, 8)}` : '—');
export const fmtShortDate = (ymd) => (ymd ? `${ymd.slice(4, 6)}/${ymd.slice(6, 8)}` : '—');

export function fmtNum(x, d = 2) {
  if (x == null || !Number.isFinite(x)) return '—';
  return x.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtPct(x, d = 1, sign = true) {
  if (x == null || !Number.isFinite(x)) return '—';
  const s = x.toFixed(d);
  return `${sign && x > 0 ? '+' : ''}${s}%`;
}

export function fmtLots(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  const s = Math.abs(x).toLocaleString('zh-TW');
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${s}`;
}

// 台股慣例：紅漲綠跌
export const tone = (x) => (x == null ? '' : x > 0 ? 'up' : x < 0 ? 'down' : 'flat');

export const quarterLabel = (k) => (k ? `${k.slice(2, 4)}Q${k.slice(-1)}` : '');
export const monthLabel = (k) => (k ? `${Number(k.slice(5))}月` : '');

export const MOOD = {
  calm: { label: '大盤平穩', cls: 'calm' },
  caution: { label: '大盤警戒', cls: 'caution' },
  panic: { label: '大盤恐慌', cls: 'panic' },
  unknown: { label: '大盤資料不足', cls: 'unknown' },
};

// 均線扣抵狀態 → 文字
export function deductLabel(d) {
  if (!d) return { text: '—', cls: 'muted', tip: '資料不足' };
  if (d.favorable) return { text: '易漲', cls: 'good', tip: `未來幾天扣抵值都低於現價（明天扣 ${fmtNum(d.next)}）` };
  if (d.pressure) return { text: '壓力', cls: 'bad', tip: `未來幾天扣抵值都高於現價（明天扣 ${fmtNum(d.next)}）` };
  if (d.aboveNext) return { text: '上揚', cls: 'ok', tip: `現價高於明天扣抵 ${fmtNum(d.next)}` };
  return { text: '下彎', cls: 'weak', tip: `現價低於明天扣抵 ${fmtNum(d.next)}` };
}
