// 技術指標。陣列一律由舊到新，最後一筆是最新交易日

export function sma(arr, n, end = arr.length - 1) {
  if (end - n + 1 < 0 || end >= arr.length) return null;
  let s = 0;
  for (let i = end - n + 1; i <= end; i++) s += arr[i];
  return s / n;
}

export function smaSeries(arr, n) {
  const out = new Array(arr.length).fill(null);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    s += arr[i];
    if (i >= n) s -= arr[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

/**
 * 均線扣抵。N 日均線明天會「扣掉」第 N 天前那根收盤（closes[L-N]）
 * 只要明天收盤 > 扣抵值，均線就會上彎。ahead 天內的扣抵值都低於現價 → 均線短期易漲難跌
 */
export function deduction(closes, n, ahead = 5) {
  const L = closes.length;
  if (L < n) return null;
  const upcoming = closes.slice(L - n, Math.min(L - n + ahead, L));
  const close = closes[L - 1];
  const next = upcoming[0];
  const maxUp = Math.max(...upcoming);
  const minUp = Math.min(...upcoming);
  return {
    next, // 明天的扣抵值
    upcoming, // 未來幾天依序要扣掉的價格
    idx: L - n, // 扣抵價在序列中的位置（畫圖用）
    aboveNext: close > next, // 現價 > 明天扣抵 → 明天均線上揚（價格不變的前提）
    favorable: close > maxUp, // 現價高過未來 ahead 天所有扣抵 → 均線一週內持續上彎
    pressure: close < minUp, // 現價低於未來所有扣抵 → 均線持續下彎
  };
}

export function rsi(closes, n = 6) {
  if (closes.length < n + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

const maxOf = (a) => a.reduce((m, x) => (x > m ? x : m), -Infinity);
const minOf = (a) => a.reduce((m, x) => (x < m ? x : m), Infinity);
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/**
 * 計算一檔股票的技術面狀態
 * @param {{o:number[],h:number[],l:number[],c:number[],v:number[]}} s
 * @param {{keyMA:number, pullbackDays:number, pullbackTolPct:number, breakTolPct:number}} p
 */
export function technical(s, p) {
  const c = s.c;
  const L = c.length;
  if (L < 22) return { ok: false, reason: `股價資料只有 ${L} 天` };
  const close = c[L - 1];
  const prevClose = c[L - 2];

  const ma5 = sma(c, 5);
  const ma5p = sma(c, 5, L - 2);
  const ma20 = sma(c, 20);
  const ma20p = sma(c, 20, L - 2);
  const ma60 = L >= 60 ? sma(c, 60) : null;
  const ma60p = L >= 61 ? sma(c, 60, L - 2) : null;

  // 關鍵均線：預設月線（20），可選季線（60）；資料不夠時退回月線
  const key = p.keyMA === 60 && ma60p != null ? 60 : 20;
  const maKey = key === 60 ? ma60 : ma20;
  const maKeyP = key === 60 ? ma60p : ma20p;

  // 趨勢向上：站上關鍵均線、關鍵均線上彎，且短一級均線也上彎
  const shortUp = key === 60 ? ma20 > ma20p : ma5 > ma5p;
  const trendUp = close > maKey && maKey > maKeyP && shortUp;

  // 回測不破：近 N 日最低點曾回到均線附近（tol% 內），但收盤沒有跌破均線（break% 以上）
  const tol = p.pullbackTolPct / 100;
  const brk = p.breakTolPct / 100;
  let touched = false;
  let broken = false;
  let touchLow = null;
  for (let i = Math.max(key, L - p.pullbackDays); i < L; i++) {
    const m = sma(c, key, i);
    if (m == null) continue;
    if (s.l[i] <= m * (1 + tol)) {
      touched = true;
      touchLow = touchLow == null ? s.l[i] : Math.min(touchLow, s.l[i]);
    }
    if (c[i] < m * (1 - brk)) broken = true;
  }
  const held = touched && !broken && close > maKey && close > (touchLow ?? 0);

  // 突破：收盤創 20 日新高且量 ≥ 1.5 倍均量
  const prevHigh = maxOf(s.h.slice(L - 21, L - 1));
  const avgVol = sma(s.v, 20, L - 2);
  const breakout = close > prevHigh && avgVol > 0 && s.v[L - 1] >= 1.5 * avgVol;

  const high20 = maxOf(s.h.slice(L - 20));
  const low5 = minOf(s.l.slice(L - 5));

  return {
    ok: true,
    close,
    chg: round(((close - prevClose) / prevClose) * 100),
    ma5: round(ma5),
    ma20: round(ma20),
    ma60: round(ma60),
    keyMA: key,
    ma5Up: ma5 > ma5p,
    ma20Up: ma20 > ma20p,
    ma60Up: ma60 != null && ma60p != null ? ma60 > ma60p : null,
    d5: deduction(c, 5),
    d20: deduction(c, 20),
    d60: L >= 60 ? deduction(c, 60) : null,
    trendUp,
    touched,
    held,
    breakout,
    bias20: round((close / ma20 - 1) * 100),
    rsi6: round(rsi(c.slice(-60), 6), 1),
    dropHigh20: round((close / high20 - 1) * 100),
    low5,
    volLots: round(sma(s.v, 20) / 1000, 0),
  };
}

/** 大盤恐慌程度：依加權指數單日跌幅、5 日跌幅、距 20 日高點跌幅 */
export function marketMood(series) {
  const c = series.map((x) => x.c);
  const L = c.length;
  if (L < 6) return { level: 'unknown', reason: '加權指數資料不足' };
  const close = c[L - 1];
  const day = ((close / c[L - 2]) - 1) * 100;
  const d5 = ((close / c[L - 6]) - 1) * 100;
  const fromHigh = ((close / maxOf(c.slice(-20))) - 1) * 100;
  const ma60 = L >= 60 ? sma(c, 60) : null;
  let level = 'calm';
  const reasons = [];
  if (day <= -3 || d5 <= -6 || fromHigh <= -10) level = 'panic';
  else if (day <= -1.5 || d5 <= -3 || fromHigh <= -5) level = 'caution';
  if (day <= -1.5) reasons.push(`單日 ${day.toFixed(1)}%`);
  if (d5 <= -3) reasons.push(`5 日 ${d5.toFixed(1)}%`);
  if (fromHigh <= -5) reasons.push(`距 20 日高 ${fromHigh.toFixed(1)}%`);
  return {
    level,
    date: series[L - 1].d,
    close,
    day: round(day),
    d5: round(d5),
    fromHigh: round(fromHigh),
    belowMA60: ma60 != null ? close < ma60 : null,
    reasons,
    spark: c.slice(-40),
  };
}
