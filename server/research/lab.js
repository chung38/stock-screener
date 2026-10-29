// 策略實驗室：用 2 年歷史資料比較各種選股策略，分樣本內（前 2/3）與樣本外（後 1/3）驗證
// 原則：訊號在收盤後產生、隔天開盤進場；扣交易成本；基本面依公布時點才可用；不偷看未來
import { ROUND_TRIP } from '../screener/breakout.js';

const MIN_LOTS = 300; // 20 日均量（張）
const MIN_PRICE = 10;
const COOLDOWN = 10; // 同一策略同一檔 10 天內只取第一次訊號
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

// ---------------- 指標預先計算 ----------------

function prepare(s) {
  const n = s.c.length;
  const sma = (arr, k) => {
    const out = new Array(n).fill(null);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += arr[i];
      if (i >= k) sum -= arr[i - k];
      if (i >= k - 1) out[i] = sum / k;
    }
    return out;
  };
  s.ma5 = sma(s.c, 5);
  s.ma20 = sma(s.c, 20);
  s.ma60 = sma(s.c, 60);
  // 前 20 日均量（不含當天），單位：股
  const v20 = sma(s.v, 20);
  s.avgV = s.v.map((_, i) => (i >= 1 ? v20[i - 1] : null));
  // 前 N 日最高價（不含當天）
  s.prevHigh = {};
  for (const lb of [20, 60, 120]) {
    const out = new Array(n).fill(null);
    for (let i = lb; i < n; i++) {
      let m = -Infinity;
      for (let j = i - lb; j < i; j++) if (s.h[j] > m) m = s.h[j];
      out[i] = m;
    }
    s.prevHigh[lb] = out;
  }
  // 近 20 日最高價（含當天）、近 5 日最低價
  s.high20 = new Array(n).fill(null);
  s.low5 = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i >= 19) {
      let m = -Infinity;
      for (let j = i - 19; j <= i; j++) if (s.h[j] > m) m = s.h[j];
      s.high20[i] = m;
    }
    if (i >= 4) {
      let m = Infinity;
      for (let j = i - 4; j <= i; j++) if (s.l[j] < m) m = s.l[j];
      s.low5[i] = m;
    }
  }
  // RSI(6)（Wilder）
  s.rsi6 = new Array(n).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < n; i++) {
    const d = s.c[i] - s.c[i - 1];
    if (i <= 6) {
      gain += Math.max(d, 0) / 6;
      loss += Math.max(-d, 0) / 6;
      if (i === 6) s.rsi6[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    } else {
      gain = (gain * 5 + Math.max(d, 0)) / 6;
      loss = (loss * 5 + Math.max(-d, 0)) / 6;
      s.rsi6[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
  }
  s.liquid = s.c.map((c, i) => c >= MIN_PRICE && s.avgV[i] != null && s.avgV[i] / 1000 >= MIN_LOTS);
  s.ma10 = sma(s.c, 10);

  // KD(9,3,3)：台灣常用算法，K、D 初始 50
  s.k = new Array(n).fill(null);
  s.dd = new Array(n).fill(null);
  let k = 50;
  let d = 50;
  for (let i = 8; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - 8; j <= i; j++) {
      if (s.h[j] > hi) hi = s.h[j];
      if (s.l[j] < lo) lo = s.l[j];
    }
    const rsv = hi > lo ? ((s.c[i] - lo) / (hi - lo)) * 100 : 50;
    k = (2 / 3) * k + rsv / 3;
    d = (2 / 3) * d + k / 3;
    s.k[i] = k;
    s.dd[i] = d;
  }

  // MACD(12,26,9)
  const ema = (arr, span) => {
    const a = 2 / (span + 1);
    const out = new Array(n).fill(null);
    let e = arr[0];
    for (let i = 0; i < n; i++) {
      e = i === 0 ? arr[0] : a * arr[i] + (1 - a) * e;
      out[i] = e;
    }
    return out;
  };
  const e12 = ema(s.c, 12);
  const e26 = ema(s.c, 26);
  s.dif = s.c.map((_, i) => (i >= 25 ? e12[i] - e26[i] : null));
  const sigLine = ema(s.dif.map((x) => x ?? 0), 9);
  s.macdSig = s.dif.map((x, i) => (i >= 34 ? sigLine[i] : null));

  // 布林通道(20, 2)
  s.bbU = new Array(n).fill(null);
  s.bbL = new Array(n).fill(null);
  for (let i = 19; i < n; i++) {
    const m = s.ma20[i];
    let v = 0;
    for (let j = i - 19; j <= i; j++) v += (s.c[j] - m) ** 2;
    const sd = Math.sqrt(v / 20);
    s.bbU[i] = m + 2 * sd;
    s.bbL[i] = m - 2 * sd;
  }
}

// ---------------- 基本面（依公布時點） ----------------

// 月營收：次月 10 日前公布 → 次月 11 日起可用
const revPub = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}${String(nm).padStart(2, '0')}11`;
};
// 季報（累計營益分析）：法定截止日隔天起可用
const gmPub = (k) => {
  const [y, q] = k.split('Q').map(Number);
  return { 1: `${y}0516`, 2: `${y}0815`, 3: `${y}1115`, 4: `${y + 1}0401` }[q];
};

function makeFundamentals(A) {
  const revKeys = A.revKeys;
  const gmKeys = A.marginKeys;
  const latestRevAt = (d) => {
    let k = -1;
    for (let i = 0; i < revKeys.length; i++) if (revPub(revKeys[i]) <= d) k = i;
    return k;
  };
  const latestGmAt = (d) => {
    let k = -1;
    for (let i = 0; i < gmKeys.length; i++) if (gmPub(gmKeys[i]) <= d) k = i;
    return k;
  };
  const revAt = A.dates.map(latestRevAt);
  const gmAt = A.dates.map(latestGmAt);
  const revCache = new Map();
  const gmCache = new Map();

  // 近 3 個已公布月份年增率都 > 20%
  function revPass(code, g) {
    const k = revAt[g];
    if (k < 2) return null;
    const key = `${code}|${k}`;
    if (revCache.has(key)) return revCache.get(key);
    let ok = true;
    for (let j = k - 2; j <= k; j++) {
      const r = A.rev[revKeys[j]]?.[code];
      if (!r || !(r.ly > 0) || r.yoy == null) {
        ok = null;
        break;
      }
      if (!(r.yoy > 20)) ok = false;
    }
    revCache.set(key, ok);
    return ok;
  }

  const single = (code, idx) => {
    const k = gmKeys[idx];
    const cur = A.margins[k]?.[code];
    if (!cur) return null;
    if (k.endsWith('Q1')) return cur.gm;
    const prevKey = gmKeys[idx - 1];
    if (!prevKey || prevKey.slice(0, 4) !== k.slice(0, 4)) return null;
    const prev = A.margins[prevKey]?.[code];
    if (!prev) return null;
    const rev = cur.rev - prev.rev;
    if (!(rev > 0)) return null;
    return ((cur.rev * cur.gm - prev.rev * prev.gm) / 100 / rev) * 100;
  };

  // 單季毛利率連續 2 季改善
  function gmPass(code, g) {
    const k = gmAt[g];
    if (k < 2) return null;
    const key = `${code}|${k}`;
    if (gmCache.has(key)) return gmCache.get(key);
    const a = single(code, k - 2);
    const b = single(code, k - 1);
    const c = single(code, k);
    const ok = a == null || b == null || c == null ? null : c > b && b > a;
    gmCache.set(key, ok);
    return ok;
  }

  // 投信近 5 日合計買超 > 0（5 天都要有資料）
  function trustPass(code, g) {
    if (g < 4) return null;
    let sum = 0;
    for (let j = g - 4; j <= g; j++) {
      const day = A.inst[A.dates[j]];
      if (!day) return null;
      sum += day[code]?.[0] ?? 0;
    }
    return sum > 0;
  }

  return { revPass, gmPass, trustPass };
}

// ---------------- 交易模擬 ----------------

const EXITS = {
  H1: { name: '當天收盤賣（當沖）', type: 'hold', n: 1 },
  H3: { name: '持有 3 天', type: 'hold', n: 3 },
  H5: { name: '持有 5 天', type: 'hold', n: 5 },
  H10: { name: '持有 10 天', type: 'hold', n: 10 },
  H20: { name: '持有 20 天', type: 'hold', n: 20 },
  MA20: { name: '跌破月線出場（停損 8%，最多 60 天）', type: 'ma', max: 60, stop: 0.08 },
  REB: { name: '反彈到週線出場（停損近 5 日低點 −3%，最多 5 天）', type: 'rebound', max: 5 },
};

/** 訊號日 i 收盤後產生 → i+1 開盤進場 */
function simulate(s, i, exitId) {
  const ex = EXITS[exitId];
  const e = i + 1;
  const n = s.c.length;
  if (e >= n) return null;
  // 開盤就一價漲停鎖死，買不到
  if (s.o[e] === s.h[e] && s.h[e] === s.l[e] && s.o[e] > s.c[i] * 1.09) return null;
  const entry = s.o[e];
  let x = null;
  if (ex.type === 'hold') {
    x = e + ex.n - 1;
    if (x >= n) return null;
  } else if (ex.type === 'ma') {
    const stop = entry * (1 - ex.stop);
    for (let k = e; k < n; k++) {
      if (s.c[k] < stop || (s.ma20[k] != null && s.c[k] < s.ma20[k]) || k - e + 1 >= ex.max) {
        x = k;
        break;
      }
    }
    if (x == null) return null; // 還沒出場
  } else if (ex.type === 'rebound') {
    const stop = (s.low5[i] ?? entry) * 0.97;
    for (let k = e; k < n; k++) {
      if (s.c[k] >= s.ma5[k] || s.c[k] < stop || k - e + 1 >= ex.max) {
        x = k;
        break;
      }
    }
    if (x == null) return null;
  }
  for (let k = e; k <= x; k++) if (s.bad[k]) return null; // 期間有減資／分割等異常
  // 當沖：證交稅 0.3% 減半為 0.15%
  const cost = x === e ? ROUND_TRIP - 0.15 : ROUND_TRIP;
  return { e, x, ret: (s.c[x] / entry - 1) * 100 - cost, days: x - e + 1, cost };
}

// ---------------- 訊號 ----------------

function breakoutSignals(s, lb, vm, hd) {
  const out = [];
  const ph = s.prevHigh[lb];
  let last = -Infinity;
  for (let i = lb + 1; i < s.c.length; i++) {
    if (ph[i] == null || !(s.c[i] > ph[i])) continue;
    if (ph[i - 1] != null && s.c[i - 1] > ph[i - 1]) continue; // 不是新的突破
    if (i - last < COOLDOWN) continue;
    if (!s.liquid[i]) continue;
    if (vm > 0 && !(s.v[i] >= vm * s.avgV[i])) continue;
    last = i;
    // 站穩確認：之後 hd 天收盤都 ≥ 前高，確認日收盤後才產生訊號
    let ok = true;
    for (let k = 1; k <= hd; k++) if (i + k >= s.c.length || s.c[i + k] < ph[i]) ok = false;
    if (ok && i + hd < s.c.length) out.push(i + hd);
  }
  return out;
}

function pullbackSignals(s, key, tol) {
  const out = [];
  const ma = key === 60 ? s.ma60 : s.ma20;
  const short = key === 60 ? s.ma20 : s.ma5;
  let last = -Infinity;
  let prevOn = false;
  for (let i = key + 10; i < s.c.length; i++) {
    const trendUp = ma[i] != null && s.c[i] > ma[i] && ma[i] > ma[i - 1] && short[i] > short[i - 1];
    let touched = false;
    let broken = false;
    let touchLow = Infinity;
    for (let j = i - 9; j <= i; j++) {
      if (ma[j] == null) continue;
      if (s.l[j] <= ma[j] * (1 + tol / 100)) {
        touched = true;
        touchLow = Math.min(touchLow, s.l[j]);
      }
      if (s.c[j] < ma[j] * 0.99) broken = true;
    }
    const on = trendUp && touched && !broken && s.c[i] > touchLow && s.liquid[i];
    if (on && !prevOn && i - last >= COOLDOWN) {
      out.push(i);
      last = i;
    }
    prevOn = on;
  }
  return out;
}

function panicSignals(s, drop) {
  const out = [];
  let last = -Infinity;
  for (let i = 20; i < s.c.length; i++) {
    if (!s.liquid[i] || s.high20[i] == null || s.ma20[i] == null) continue;
    const dd = (s.c[i] / s.high20[i] - 1) * 100;
    const bias = (s.c[i] / s.ma20[i] - 1) * 100;
    if (dd <= -drop && (bias <= -8 || (s.rsi6[i] != null && s.rsi6[i] <= 20)) && i - last >= COOLDOWN) {
      out.push(i);
      last = i;
    }
  }
  return out;
}

// 坊間常見技術指標：訊號都在收盤後確認，同一檔 5 天內只取第一次
const crossUp = (a, b, i) => a[i] != null && b[i] != null && a[i - 1] != null && b[i - 1] != null && a[i] > b[i] && a[i - 1] <= b[i - 1];
export const INDICATORS = [
  ['kdLow', 'KD 低檔黃金交叉（K < 20）', (s, i) => crossUp(s.k, s.dd, i) && s.k[i - 1] < 20],
  ['kd', 'KD 黃金交叉（不限位置）', (s, i) => crossUp(s.k, s.dd, i)],
  ['macd', 'MACD 黃金交叉', (s, i) => crossUp(s.dif, s.macdSig, i)],
  ['macdNeg', 'MACD 零軸下黃金交叉', (s, i) => crossUp(s.dif, s.macdSig, i) && s.dif[i] < 0],
  ['rsi', 'RSI(6) 從 20 以下回升', (s, i) => s.rsi6[i - 1] != null && s.rsi6[i - 1] < 20 && s.rsi6[i] >= 20],
  ['bbLow', '跌破布林下軌（逆勢）', (s, i) => s.bbL[i] != null && s.c[i] < s.bbL[i] && s.c[i - 1] >= s.bbL[i - 1]],
  ['bbUp', '突破布林上軌（順勢）', (s, i) => s.bbU[i] != null && s.c[i] > s.bbU[i] && s.c[i - 1] <= s.bbU[i - 1]],
  ['ma520', '5 日線向上穿越 20 日線', (s, i) => crossUp(s.ma5, s.ma20, i)],
  ['ma2060', '20 日線向上穿越 60 日線', (s, i) => crossUp(s.ma20, s.ma60, i)],
  [
    'bull',
    '均線多頭排列（5 > 10 > 20 > 60）首日',
    (s, i) => {
      const on = (j) => s.ma60[j] != null && s.ma5[j] > s.ma10[j] && s.ma10[j] > s.ma20[j] && s.ma20[j] > s.ma60[j];
      return on(i) && !on(i - 1);
    },
  ],
  ['bigRed', '爆量長紅（漲 > 5%、量 > 2 倍均量）', (s, i) => s.c[i] / s.c[i - 1] > 1.05 && s.c[i] > s.o[i] && s.v[i] > 2 * s.avgV[i]],
  ['limitUp', '漲停板隔天追進', (s, i) => s.c[i] / s.c[i - 1] >= 1.095 && s.c[i] === s.h[i]],
  ['gap', '跳空上漲（開盤高於前日最高、收紅）', (s, i) => s.o[i] > s.h[i - 1] && s.c[i] > s.o[i]],
];

function indicatorSignals(s, test) {
  const out = [];
  let last = -Infinity;
  for (let i = 61; i < s.c.length; i++) {
    if (!s.liquid[i] || i - last < 5) continue;
    if (test(s, i)) {
      out.push(i);
      last = i;
    }
  }
  return out;
}

// ---------------- 統計 ----------------

function stats(trades) {
  const n = trades.length;
  if (!n) return { n: 0 };
  const xs = trades.map((t) => t.ret);
  const avg = xs.reduce((a, x) => a + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - avg) ** 2, 0) / Math.max(1, n - 1));
  const sorted = [...xs].sort((a, b) => a - b);
  const gains = xs.filter((x) => x > 0).reduce((a, x) => a + x, 0);
  const losses = -xs.filter((x) => x < 0).reduce((a, x) => a + x, 0);
  return {
    n,
    avg: r2(avg),
    med: r2(sorted[Math.floor(n / 2)]),
    win: r2((xs.filter((x) => x > 0).length / n) * 100),
    pf: losses > 0 ? r2(gains / losses) : null,
    t: sd > 0 ? r2(avg / (sd / Math.sqrt(n))) : null,
    tDay: tByDay(trades),
    episodes: episodes(trades),
    signalDays: new Set(trades.map((t) => t.sd)).size,
    days: r2(trades.reduce((a, t) => a + t.days, 0) / n),
    worst: r2(sorted[0]),
  };
}

// 同一天的訊號彼此高度相關（同一波行情），先按訊號日平均再算 t 值，比較保守
function tByDay(trades) {
  const by = new Map();
  for (const t of trades) {
    const a = by.get(t.sd) ?? [0, 0];
    a[0] += t.ret;
    a[1]++;
    by.set(t.sd, a);
  }
  const xs = [...by.values()].map(([s, c]) => s / c);
  const n = xs.length;
  if (n < 3) return null;
  const avg = xs.reduce((a, x) => a + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - avg) ** 2, 0) / (n - 1));
  return sd > 0 ? r2(avg / (sd / Math.sqrt(n))) : null;
}

// 獨立行情段數：訊號日之間隔超過 10 個交易日就算新的一段
function episodes(trades) {
  const gs = [...new Set(trades.map((t) => t.g))].sort((a, b) => a - b);
  let n = 0;
  let last = -Infinity;
  for (const g of gs) {
    if (g - last > 10) n++;
    last = g;
  }
  return n;
}

// ---------------- 主程式 ----------------

export function runLab(A, { onProgress = () => {} } = {}) {
  const t0 = Date.now();
  const codes = Object.keys(A.series).filter((c) => A.series[c].c.length >= 80);
  for (const c of codes) {
    A.series[c].code = c;
    prepare(A.series[c]);
  }
  const F = makeFundamentals(A);
  const split = A.dates[Math.floor(A.dates.length * (2 / 3))];
  const part = (t) => (t.sd < split ? 'is' : 'oos');

  // 大盤狀態（依訊號日）
  const tx = A.taiex;
  const txMa60 = tx.map((_, g) => {
    if (g < 59) return null;
    let sum = 0;
    for (let j = g - 59; j <= g; j++) {
      if (tx[j] == null) return null;
      sum += tx[j];
    }
    return sum / 60;
  });
  const mktUp = (g) => (tx[g] == null || txMa60[g] == null ? null : tx[g] > txMa60[g]);
  const mktPanic = (g) => {
    if (g < 20 || tx[g] == null || tx[g - 1] == null || tx[g - 5] == null) return null;
    let hi = -Infinity;
    for (let j = g - 19; j <= g; j++) if (tx[j] > hi) hi = tx[j];
    const day = (tx[g] / tx[g - 1] - 1) * 100;
    const d5 = (tx[g] / tx[g - 5] - 1) * 100;
    const fh = (tx[g] / hi - 1) * 100;
    return day <= -3 || d5 <= -6 || fh <= -10;
  };

  /** 把訊號轉成交易 */
  function tradesOf(signalFn, exitId, filter) {
    const out = [];
    for (const code of codes) {
      const s = A.series[code];
      for (const i of signalFn(s, code)) {
        const g = s.g[i];
        if (filter && !filter(code, g)) continue;
        const t = simulate(s, i, exitId);
        if (!t) continue;
        out.push({ code, sd: s.d[i], g, ret: t.ret, days: t.days, cost: t.cost, ed: s.d[t.e], xd: s.d[t.x], s, e: t.e, x: t.x });
      }
    }
    return out;
  }

  function summary(trades, baseline) {
    const by = { all: trades, is: trades.filter((t) => part(t) === 'is'), oos: trades.filter((t) => part(t) === 'oos') };
    const o = {};
    for (const [k, list] of Object.entries(by)) {
      o[k] = stats(list);
      if (baseline?.[k]?.avg != null && o[k].avg != null) o[k].excess = r2(o[k].avg - baseline[k].avg);
    }
    o.up = stats(trades.filter((t) => mktUp(t.g) === true));
    o.down = stats(trades.filter((t) => mktUp(t.g) === false));
    return o;
  }

  // ---- 對照組：隨機進場（每 5 天抽一次所有符合流動性的股票）＋同樣出場規則 ----
  onProgress('對照組');
  const baselines = {};
  for (const exitId of Object.keys(EXITS)) {
    const list = [];
    for (const code of codes) {
      const s = A.series[code];
      for (let i = 60; i < s.c.length; i += 5) {
        if (!s.liquid[i]) continue;
        const t = simulate(s, i, exitId);
        if (t) list.push({ sd: s.d[i], g: s.g[i], ret: t.ret, days: t.days });
      }
    }
    const by = { all: list, is: list.filter((t) => t.sd < split), oos: list.filter((t) => t.sd >= split) };
    baselines[exitId] = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, stats(v)]));
  }

  // ---- 大盤買進持有 ----
  const firstG = tx.findIndex((x) => x != null);
  const lastG = tx.length - 1 - [...tx].reverse().findIndex((x) => x != null);
  const splitG = A.dateIdx[split];
  const ret = (a, b) => (tx[a] && tx[b] ? r2((tx[b] / tx[a] - 1) * 100) : null);
  const benchmark = { all: ret(firstG, lastG), is: ret(firstG, splitG), oos: ret(splitG, lastG) };

  // 等權大盤：每天把所有符合流動性的股票平均報酬累乘（比加權指數更像「一般股票」的表現）
  const ewDaily = new Array(A.dates.length).fill(null);
  {
    const sum = new Array(A.dates.length).fill(0);
    const cnt = new Array(A.dates.length).fill(0);
    for (const code of codes) {
      const s = A.series[code];
      for (let i = 1; i < s.c.length; i++) {
        if (!s.liquid[i - 1] || s.bad[i] || s.g[i] !== s.g[i - 1] + 1) continue;
        sum[s.g[i]] += s.c[i] / s.c[i - 1] - 1;
        cnt[s.g[i]]++;
      }
    }
    for (let g = 0; g < sum.length; g++) ewDaily[g] = cnt[g] >= 50 ? sum[g] / cnt[g] : null;
  }
  const ewRet = (a, b) => {
    let v = 1;
    for (let g = a + 1; g <= b; g++) if (ewDaily[g] != null) v *= 1 + ewDaily[g];
    return r2((v - 1) * 100);
  };
  const equalWeight = { all: ewRet(firstG, lastG), is: ewRet(firstG, splitG), oos: ewRet(splitG, lastG) };

  // ---- 策略家族 ----
  const families = [];
  function runFamily(id, name, combos, signalFor) {
    onProgress(name);
    const rows = [];
    const sigCache = new Map();
    for (const c of combos) {
      const sigKey = JSON.stringify(c.sig);
      if (!sigCache.has(sigKey)) {
        const m = new Map();
        for (const code of codes) m.set(code, signalFor(A.series[code], c.sig));
        sigCache.set(sigKey, m);
      }
      const m = sigCache.get(sigKey);
      const trades = tradesOf((s, code) => m.get(code), c.exit, c.filter);
      rows.push({ id: c.id, label: c.label, exit: c.exit, sig: c.sig, ...summary(trades, baselines[c.exit]), _trades: trades });
    }
    families.push({ id, name, rows });
    return rows;
  }

  const boCombos = [];
  for (const lb of [20, 60, 120])
    for (const vm of [0, 1.5, 2, 3])
      for (const hd of [0, 1, 2, 3])
        for (const exit of ['H3', 'H5', 'H10', 'H20', 'MA20'])
          boCombos.push({
            id: `BO-${lb}-${vm}-${hd}-${exit}`,
            label: `突破 ${lb} 日前高、量比 ${vm || '不限'}、站穩 ${hd} 天、${EXITS[exit].name}`,
            exit,
            sig: { lb, vm, hd },
          });
  runFamily('breakout', '突破前高', boCombos, (s, p) => breakoutSignals(s, p.lb, p.vm, p.hd));

  const pbCombos = [];
  for (const key of [20, 60])
    for (const tol of [2, 4])
      for (const exit of ['H3', 'H5', 'H10', 'H20', 'MA20'])
        pbCombos.push({
          id: `PB-${key}-${tol}-${exit}`,
          label: `趨勢向上回測${key === 60 ? '季線' : '月線'}不破（${tol}% 內）、${EXITS[exit].name}`,
          exit,
          sig: { key, tol },
        });
  runFamily('pullback', '共振技術面：趨勢向上＋回測不破', pbCombos, (s, p) => pullbackSignals(s, p.key, p.tol));

  const pnCombos = [];
  for (const drop of [10, 15, 20])
    for (const exit of ['REB', 'H3', 'H5', 'H10'])
      for (const onlyPanic of [false, true])
        pnCombos.push({
          id: `PN-${drop}-${exit}-${onlyPanic ? 'mkt' : 'any'}`,
          label: `跌深 ${drop}%＋乖離／RSI 超賣${onlyPanic ? '、只在大盤恐慌時' : ''}、${EXITS[exit].name}`,
          exit,
          sig: { drop },
          filter: onlyPanic ? (code, g) => mktPanic(g) === true : null,
        });
  runFamily('panic', '錯殺逆勢', pnCombos, (s, p) => panicSignals(s, p.drop));

  // 籌碼：外資／投信連續買超（法人資料依日期）
  const instOf = (g, code, k) => A.inst[A.dates[g]]?.[code]?.[k];
  function streakSignals(s, k, days) {
    const out = [];
    let last = -Infinity;
    for (let i = 61; i < s.c.length; i++) {
      if (!s.liquid[i] || i - last < 5) continue;
      let ok = true;
      for (let j = 0; j < days; j++) {
        const v = instOf(s.g[i - j], s.code, k);
        if (!(v > 0)) ok = false;
      }
      const before = instOf(s.g[i - days], s.code, k);
      if (ok && !(before > 0)) {
        out.push(i);
        last = i;
      }
    }
    return out;
  }
  const CHIPS = [
    ['foreign3', '外資連 3 日買超（第 3 天）', (s) => streakSignals(s, 1, 3)],
    ['trust3', '投信連 3 日買超（第 3 天）', (s) => streakSignals(s, 0, 3)],
  ];

  const indCombos = [];
  for (const [key, name] of [...INDICATORS, ...CHIPS])
    for (const exit of ['H1', 'H3', 'H5', 'H10'])
      indCombos.push({ id: `IND-${key}-${exit}`, label: `${name}、${EXITS[exit].name}`, exit, sig: { key } });
  const indTest = Object.fromEntries(INDICATORS.map(([k, , f]) => [k, f]));
  const chipFn = Object.fromEntries(CHIPS.map(([k, , f]) => [k, f]));
  runFamily('popular', '坊間技術指標與籌碼', indCombos, (s, p) =>
    chipFn[p.key] ? chipFn[p.key](s) : indicatorSignals(s, indTest[p.key]),
  );

  // 三重共振（App 名單條件）：營收、毛利率、投信同時成立且技術面趨勢向上的第一天
  function resonanceSignals(s) {
    const out = [];
    let last = -Infinity;
    let prevOn = false;
    for (let i = 61; i < s.c.length; i++) {
      const g = s.g[i];
      const trendUp = s.c[i] > s.ma20[i] && s.ma20[i] > s.ma20[i - 1] && s.ma5[i] > s.ma5[i - 1];
      const on =
        s.liquid[i] &&
        trendUp &&
        F.revPass(s.code, g) === true &&
        F.gmPass(s.code, g) === true &&
        F.trustPass(s.code, g) === true;
      if (on && !prevOn && i - last >= COOLDOWN) {
        out.push(i);
        last = i;
      }
      prevOn = on;
    }
    return out;
  }
  const rsCombos = ['H3', 'H5', 'H10', 'H20', 'MA20'].map((exit) => ({
    id: `RS-${exit}`,
    label: `三重共振（營收＋毛利率＋投信＋趨勢向上）、${EXITS[exit].name}`,
    exit,
    sig: {},
  }));
  runFamily('resonance', '三重共振（App 名單，不含千張大戶）', rsCombos, (s) => resonanceSignals(s));

  // ---- 依樣本內挑最好的，再看樣本外 ----
  // 判定：few 樣本不足｜robust 樣本內外都賺且勝過隨機、統計上可信｜weak 都賺但證據不夠強
  //       illusion 樣本內賺、樣本外不賺（或輸給隨機）｜no 樣本內就不賺
  const classify = (r) => {
    const is = r.is;
    const oos = r.oos;
    if (!(is.n >= 30) || !(oos.n >= 15)) return 'few';
    if (!(is.avg > 0)) return 'no';
    if (!(oos.avg > 0) || !(oos.excess > 0) || !(is.excess > 0)) return 'illusion';
    // 用「按訊號日平均」的 t 值；事件型策略（如錯殺）還要至少 5 段獨立行情，避免結果只來自一兩次大跌
    if (r.all.tDay >= 2 && (r.all.episodes >= 5 || r.all.signalDays >= 150)) return 'robust';
    return 'weak';
  };
  for (const f of families) {
    for (const r of f.rows) r.verdict = classify(r);
    // 只用樣本內的結果排名（扣成本後平均報酬），樣本外拿來驗證
    const ranked = f.rows.filter((r) => r.is.n >= 30 && r.oos.n >= 15 && r.is.avg != null).sort((a, b) => b.is.avg - a.is.avg);
    f.tested = f.rows.length;
    f.counts = Object.fromEntries(['robust', 'weak', 'illusion', 'no', 'few'].map((v) => [v, f.rows.filter((r) => r.verdict === v).length]));
    f.bothPositive = f.rows.filter((r) => r.is.avg > 0 && r.oos.avg > 0 && r.is.n >= 30 && r.oos.n >= 15).length;
    f.top = ranked.slice(0, 5).map((r) => r.id);
  }

  // ---- 濾網：基本面、籌碼對各家族最佳組合的影響 ----
  onProgress('濾網');
  const FILTERS = [
    ['none', '不加濾網', null],
    ['mkt', '＋大盤在季線之上', (c, g) => mktUp(g) === true],
    ['rev', '＋營收 3 個月年增 > 20%', (c, g) => F.revPass(c, g) === true],
    ['gm', '＋毛利率連 2 季改善', (c, g) => F.gmPass(c, g) === true],
    ['trust', '＋投信近 5 日買超', (c, g) => F.trustPass(c, g) === true],
    ['rev+trust', '＋營收＋投信', (c, g) => F.revPass(c, g) === true && F.trustPass(c, g) === true],
    ['all', '＋營收＋毛利率＋投信（共振）', (c, g) => F.revPass(c, g) === true && F.gmPass(c, g) === true && F.trustPass(c, g) === true],
  ];
  const filterTables = [];
  for (const f of families) {
    const best = f.rows.find((r) => r.id === f.top[0]);
    if (!best) continue;
    const rows = FILTERS.map(([fid, label, fn]) => {
      const trades = best._trades.filter((t) => !fn || fn(t.code, t.g));
      return { id: fid, label, ...summary(trades, baselines[best.exit]) };
    });
    filterTables.push({ family: f.id, base: best.id, baseLabel: best.label, rows });
  }
  // 資料覆蓋率：基本面／法人資料涵蓋多少期間
  const coverage = {
    revFrom: A.revKeys[0] ?? null,
    gmFrom: A.marginKeys[0] ?? null,
    instDays: Object.keys(A.inst).length,
  };

  // ---- 短線（持有 10 天以內）比較：每個想法用樣本內挑出最好的持有天數，再看樣本外與資金曲線 ----
  onProgress('短線比較');
  const SHORT = ['H1', 'H3', 'H5', 'H10'];
  const ideas = [
    ['ours', '突破 120 日前高＋量 1.5 倍＋站穩 2 天', 'breakout', (r) => r.sig.lb === 120 && r.sig.vm === 1.5 && r.sig.hd === 2],
    ['ours', '突破 20 日前高＋量 1.5 倍＋站穩 2 天（App 預設）', 'breakout', (r) => r.sig.lb === 20 && r.sig.vm === 1.5 && r.sig.hd === 2],
    ['ours', '共振技術面：趨勢向上＋回測月線不破', 'pullback', (r) => r.sig.key === 20 && r.sig.tol === 2],
    ['ours', '三重共振（App 名單）', 'resonance', () => true],
    ['ours', '錯殺逆勢：跌深 15%（任何時候）', 'panic', (r) => r.sig.drop === 15 && r.id.endsWith('-any')],
    ['ours', '錯殺逆勢：跌深 15%，只在大盤恐慌時', 'panic', (r) => r.sig.drop === 15 && r.id.endsWith('-mkt')],
    ...[...INDICATORS, ...CHIPS].map(([k, name]) => ['popular', name, 'popular', (r) => r.sig.key === k]),
  ];
  const shortTerm = [];
  for (const [group, name, fam, match] of ideas) {
    const f = families.find((x) => x.id === fam);
    const cands = f.rows.filter((r) => match(r) && SHORT.includes(r.exit));
    const ok = cands.filter((r) => r.is.n >= 30);
    const pick = (ok.length ? ok : cands).sort((a, b) => (b.is.avg ?? -99) - (a.is.avg ?? -99))[0];
    if (!pick) continue;
    const pf = portfolio(pick._trades, A);
    shortTerm.push({
      group,
      name,
      id: pick.id,
      exit: pick.exit,
      is: pick.is,
      oos: pick.oos,
      all: pick.all,
      up: pick.up,
      down: pick.down,
      verdict: pick.verdict,
      byExit: Object.fromEntries(cands.map((r) => [r.exit, { is: r.is.avg, oos: r.oos.avg, n: r.all.n }])),
      portfolio: { total: pf.total, cagr: pf.cagr, mdd: pf.mdd, exposure: pf.exposure, taken: pf.taken, curve: pf.curve },
    });
  }
  shortTerm.sort((a, b) => (b.portfolio.cagr ?? -999) - (a.portfolio.cagr ?? -999));

  // 對照：每天隨機挑股票、同樣最多 10 檔，看「亂買」的資金曲線長怎樣
  const hashPick = (code, d) => {
    let x = 7;
    for (const ch of code + d) x = (x * 131 + ch.charCodeAt(0)) >>> 0;
    return x % 20 === 0;
  };
  const randomPortfolio = {};
  for (const exitId of SHORT) {
    const trades = tradesOf((s) => {
      const out = [];
      for (let i = 60; i < s.c.length; i++) if (s.liquid[i] && hashPick(s.code ?? '', s.d[i])) out.push(i);
      return out;
    }, exitId);
    const pf = portfolio(trades, A);
    randomPortfolio[exitId] = { total: pf.total, cagr: pf.cagr, mdd: pf.mdd, exposure: pf.exposure, taken: pf.taken };
  }
  const years = (lastG - firstG) / 245;
  const ann = (x) => (x == null || years <= 0 ? null : r2(((1 + x / 100) ** (1 / years) - 1) * 100));
  const buyHold = { taiex: ann(benchmark.all), equalWeight: ann(equalWeight.all) };

  // ---- 資金曲線：每個家族的第一名，最多同時 10 檔、每檔 10% ----
  onProgress('資金曲線');
  const equity = [];
  for (const f of families) {
    const best = f.rows.find((r) => r.id === f.top[0]);
    if (best) equity.push({ family: f.id, id: best.id, ...portfolio(best._trades, A) });
  }

  for (const f of families) for (const r of f.rows) delete r._trades;

  return {
    generatedAt: new Date().toISOString(),
    from: A.dates[0],
    to: A.dates.at(-1),
    split,
    days: A.dates.length,
    stocks: codes.length,
    costPct: ROUND_TRIP,
    dividendAdjusted: A.dividends,
    exits: Object.fromEntries(Object.entries(EXITS).map(([k, v]) => [k, v.name])),
    benchmark,
    equalWeight,
    baselines,
    families,
    filterTables,
    coverage,
    equity,
    shortTerm,
    randomPortfolio,
    buyHold,
    ms: Date.now() - t0,
  };
}

/** 等權資金曲線：同時最多 10 檔，每檔投入當時淨值的 10% */
function portfolio(trades, A, slots = 10) {
  const byEntry = new Map();
  // 同一天訊號太多、超過可買檔數時，用固定的亂序挑選（避免永遠挑代號小的股票）
  const h = (t) => {
    let x = 0;
    for (const ch of t.code + t.ed) x = (x * 31 + ch.charCodeAt(0)) | 0;
    return x;
  };
  for (const t of [...trades].sort((a, b) => (a.ed < b.ed ? -1 : a.ed > b.ed ? 1 : h(a) - h(b)))) {
    const g = A.dateIdx[t.ed];
    if (!byEntry.has(g)) byEntry.set(g, []);
    byEntry.get(g).push(t);
  }
  let cash = 1;
  let open = [];
  let peak = 1;
  let mdd = 0;
  let taken = 0;
  let exposureDays = 0;
  const curve = [];
  const start = Math.min(...[...byEntry.keys()]);
  for (let g = start; g < A.dates.length; g++) {
    const d = A.dates[g];
    // 進場（開盤）
    for (const t of byEntry.get(g) ?? []) {
      if (open.length >= slots) break;
      const value = cash + open.reduce((a, p) => a + p.value, 0);
      const amt = Math.min(cash, value / slots);
      if (amt <= 0) break;
      cash -= amt;
      open.push({ t, amt, value: amt, lastPx: t.s.o[t.e] });
      taken++;
    }
    // 收盤評價與出場
    if (open.length) exposureDays++;
    const keep = [];
    for (const p of open) {
      const s = p.t.s;
      const i = s.g.indexOf(g, p.t.e);
      if (i >= 0) {
        p.value *= s.c[i] / p.lastPx;
        p.lastPx = s.c[i];
      }
      if (d >= p.t.xd) cash += p.value * (1 - (p.t.cost ?? ROUND_TRIP) / 100);
      else keep.push(p);
    }
    open = keep;
    const eq = cash + open.reduce((a, p) => a + p.value, 0);
    peak = Math.max(peak, eq);
    mdd = Math.min(mdd, eq / peak - 1);
    if (g % 5 === 0) curve.push([d, r2(eq)]);
  }
  const final = cash + open.reduce((a, p) => a + p.value, 0);
  const years = (A.dates.length - start) / 245;
  return {
    total: r2((final - 1) * 100),
    cagr: years > 0 ? r2((final ** (1 / years) - 1) * 100) : null,
    mdd: r2(mdd * 100),
    taken,
    exposure: r2((exposureDays / Math.max(1, A.dates.length - start)) * 100),
    curve,
  };
}
