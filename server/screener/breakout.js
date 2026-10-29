// 突破策略：今日訊號＋歷史回測
// 規則：收盤突破前 N 日最高價、當天量 ≥ 均量 k 倍、之後 m 天收盤都沒跌回前高
// 股價已在 loadData 還原權息；減資等異常跳動之前的資料不使用
// 不依賴 Node，伺服器與瀏覽器共用

export const BREAKOUT_DEFAULTS = {
  lookback: 20, // 前高：前 N 個交易日最高價
  volMult: 1.5, // 突破當天量 ≥ 前 20 日均量 × k（0 = 不要求）
  holdDays: 2, // 突破後連續幾天收盤不跌回前高才算站穩（0 = 突破當天就算）
  recentDays: 5, // 今日訊號：近幾天內發生的突破
  minVolLots: 300,
  minPrice: 10,
};

// 交易成本假設（%）：手續費 0.1425% 買賣各一次（不打折）、證交稅 0.3%、滑價每邊 0.1%
export const COST = { fee: 0.1425, tax: 0.3, slip: 0.1 };
export const ROUND_TRIP = COST.fee * 2 + COST.tax + COST.slip * 2; // 0.785%

const VOL_AVG = 20;
const COOLDOWN = 10; // 同一檔 10 個交易日內只算第一次突破，避免重複計數
const FALSE_DAYS = 5; // 進場後 5 天內收盤跌回前高 = 假突破
const HORIZONS = [1, 5, 10, 20];

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const maxRange = (a, from, to) => {
  let m = -Infinity;
  for (let i = from; i <= to; i++) if (a[i] > m) m = a[i];
  return m;
};
const avgRange = (a, from, to) => {
  let s = 0;
  for (let i = from; i <= to; i++) s += a[i];
  return s / (to - from + 1);
};

function coerce(q = {}) {
  const p = { ...BREAKOUT_DEFAULTS };
  for (const k of Object.keys(p)) {
    const n = Number(q[k]);
    if (q[k] != null && q[k] !== '' && Number.isFinite(n)) p[k] = n;
  }
  p.lookback = [20, 60, 120].includes(p.lookback) ? p.lookback : 20;
  p.holdDays = Math.min(Math.max(0, Math.round(p.holdDays)), 5);
  p.recentDays = Math.min(Math.max(1, Math.round(p.recentDays)), 10);
  return p;
}

/** 某檔股票在第 i 天是不是「新的」突破（昨天還沒站上） */
function breakoutAt(s, i, lookback) {
  if (i < lookback + 1 || i < VOL_AVG) return null;
  const prevHigh = maxRange(s.h, i - lookback, i - 1);
  if (!(s.c[i] > prevHigh)) return null;
  const yHigh = maxRange(s.h, i - 1 - lookback, i - 2);
  if (s.c[i - 1] > yHigh) return null; // 昨天已經突破過，不是新的突破
  const avgV = avgRange(s.v, i - VOL_AVG, i - 1);
  return { prevHigh, volRatio: avgV > 0 ? s.v[i] / avgV : null, avgLots: avgV / 1000 };
}

// ---------- 今日訊號 ----------

export function currentBreakouts(D, query = {}) {
  const p = coerce(query);
  const last = D.priceKeys[D.priceKeys.length - 1];
  const out = [];
  for (const [code, s] of Object.entries(D.series)) {
    const L = s.c.length;
    if (L < p.lookback + 2 || s.d[L - 1] !== last) continue;
    if (s.c[L - 1] < p.minPrice) continue;
    // 由近到遠找最近一次突破
    for (let i = L - 1; i >= Math.max(L - p.recentDays, 1); i--) {
      const b = breakoutAt(s, i, p.lookback);
      if (!b) continue;
      if (b.avgLots < p.minVolLots) break;
      if (p.volMult > 0 && !(b.volRatio >= p.volMult)) break;
      const after = s.c.slice(i + 1);
      const fellBack = after.some((c) => c < b.prevHigh);
      if (fellBack) break; // 已經跌回前高：假突破，不列
      const held = after.length;
      out.push({
        code,
        n: D.stocks[code]?.n ?? code,
        m: D.stocks[code]?.m ?? '',
        date: s.d[i],
        prevHigh: r2(b.prevHigh),
        breakClose: r2(s.c[i]),
        close: r2(s.c[L - 1]),
        chg: r2((s.c[L - 1] / s.c[L - 2] - 1) * 100),
        aboveHigh: r2((s.c[L - 1] / b.prevHigh - 1) * 100),
        volRatio: r2(b.volRatio),
        held,
        status: held >= p.holdDays ? 'confirmed' : 'watch',
      });
      break;
    }
  }
  out.sort((a, b) => (a.status === b.status ? b.volRatio - a.volRatio : a.status === 'confirmed' ? -1 : 1));
  return { params: p, asOf: last, list: out };
}

// ---------- 回測 ----------

function smaAt(a, n, i) {
  if (i - n + 1 < 0) return null;
  return avgRange(a, i - n + 1, i);
}

/**
 * 找出所有歷史突破事件（只用「突破前高」這個最寬鬆條件），之後各變化型再篩選
 */
function collectEvents(D, p) {
  const taiexByDate = Object.fromEntries(D.taiex.map((x) => [x.d, x.c]));
  const taiexSeries = D.taiex.map((x) => x.c);
  const taiexIdx = Object.fromEntries(D.taiex.map((x, i) => [x.d, i]));
  const events = [];
  for (const [code, s] of Object.entries(D.series)) {
    const L = s.c.length;
    let lastEvent = -Infinity;
    for (let i = Math.max(p.lookback + 1, VOL_AVG); i < L; i++) {
      const b = breakoutAt(s, i, p.lookback);
      if (!b) continue;
      if (i - lastEvent < COOLDOWN) continue;
      if (b.avgLots < p.minVolLots || s.c[i] < p.minPrice) continue;
      lastEvent = i;
      const range = s.h[i] - s.l[i];
      const ma60 = smaAt(s.c, 60, i);
      const ti = taiexIdx[s.d[i]];
      const tma60 = ti != null && ti >= 59 ? smaAt(taiexSeries, 60, ti) : null;
      events.push({
        code,
        s,
        i,
        prevHigh: b.prevHigh,
        volRatio: b.volRatio,
        gap: (s.c[i] / b.prevHigh - 1) * 100,
        closePos: range > 0 ? (s.c[i] - s.l[i]) / range : 1,
        aboveMA60: ma60 == null ? null : s.c[i] > ma60,
        mktUp: tma60 == null || taiexByDate[s.d[i]] == null ? null : taiexByDate[s.d[i]] > tma60,
      });
    }
  }
  return events;
}

/** 依變化型把事件轉成交易結果 */
function trade(ev, holdDays) {
  const { s, i, prevHigh } = ev;
  const L = s.c.length;
  // 站穩確認：之後 holdDays 天收盤都 ≥ 前高；進場價 = 確認那天收盤
  for (let k = 1; k <= holdDays; k++) {
    if (i + k >= L) return { pending: true };
    if (s.c[i + k] < prevHigh) return { failedConfirm: true };
  }
  const e = i + holdDays;
  const entry = s.c[e];
  const ret = {};
  for (const h of HORIZONS) ret[h] = e + h < L ? (s.c[e + h] / entry - 1) * 100 : null;
  let falseBreak = null;
  if (e + FALSE_DAYS < L) {
    falseBreak = false;
    for (let k = 1; k <= FALSE_DAYS; k++) if (s.c[e + k] < prevHigh) falseBreak = true;
  }
  return { e, entry, ret, nextUp: e + 1 < L ? s.c[e + 1] > entry : null, falseBreak };
}

function summarize(trades) {
  const done = trades.filter((t) => t.ret?.[1] != null);
  const n = done.length;
  const stat = { n };
  if (!n) return stat;
  stat.nextUpRate = r2((done.filter((t) => t.nextUp).length / n) * 100);
  for (const h of HORIZONS) {
    const xs = trades.map((t) => t.ret?.[h]).filter((x) => x != null);
    if (!xs.length) continue;
    const sorted = [...xs].sort((a, b) => a - b);
    stat[`avg${h}`] = r2(xs.reduce((a, x) => a + x, 0) / xs.length - ROUND_TRIP);
    stat[`win${h}`] = r2((xs.filter((x) => x > ROUND_TRIP).length / xs.length) * 100);
    stat[`med${h}`] = r2(sorted[Math.floor(sorted.length / 2)] - ROUND_TRIP);
    stat[`n${h}`] = xs.length;
  }
  const fb = trades.filter((t) => t.falseBreak != null);
  if (fb.length) stat.falseRate = r2((fb.filter((t) => t.falseBreak).length / fb.length) * 100);
  return stat;
}

const VARIANTS = [
  { id: 'A', name: '只看突破 20 日前高', lookback: 20, volMult: 0, holdDays: 0 },
  { id: 'B', name: '＋量 ≥ 1.5 倍均量', lookback: 20, volMult: 1.5, holdDays: 0 },
  { id: 'C', name: '＋量 1.5 倍＋站穩 2 天', lookback: 20, volMult: 1.5, holdDays: 2 },
  { id: 'D', name: '＋量 2 倍＋站穩 2 天', lookback: 20, volMult: 2, holdDays: 2 },
  { id: 'E', name: '突破 60 日前高＋量 1.5 倍＋站穩 2 天', lookback: 60, volMult: 1.5, holdDays: 2 },
  { id: 'F', name: '突破 120 日前高＋量 1.5 倍＋站穩 2 天', lookback: 120, volMult: 1.5, holdDays: 2 },
];

const BUCKETS = [
  {
    id: 'vol',
    name: '突破當天量比',
    of: (e) => e.volRatio,
    bins: [
      ['< 1 倍', (x) => x < 1],
      ['1–1.5 倍', (x) => x >= 1 && x < 1.5],
      ['1.5–2 倍', (x) => x >= 1.5 && x < 2],
      ['2–3 倍', (x) => x >= 2 && x < 3],
      ['≥ 3 倍', (x) => x >= 3],
    ],
  },
  {
    id: 'gap',
    name: '收盤高出前高',
    of: (e) => e.gap,
    bins: [
      ['< 1%', (x) => x < 1],
      ['1–3%', (x) => x >= 1 && x < 3],
      ['3–5%', (x) => x >= 3 && x < 5],
      ['≥ 5%', (x) => x >= 5],
    ],
  },
  {
    id: 'pos',
    name: '收盤在當天區間的位置',
    of: (e) => e.closePos,
    bins: [
      ['收在高點附近（上 20%）', (x) => x >= 0.8],
      ['中段', (x) => x >= 0.5 && x < 0.8],
      ['留長上影線（下半段）', (x) => x < 0.5],
    ],
  },
  {
    id: 'ma60',
    name: '個股與季線',
    of: (e) => e.aboveMA60,
    bins: [
      ['在季線之上', (x) => x === true],
      ['在季線之下', (x) => x === false],
    ],
  },
  {
    id: 'mkt',
    name: '大盤（加權指數）與季線',
    of: (e) => e.mktUp,
    bins: [
      ['大盤在季線之上', (x) => x === true],
      ['大盤在季線之下', (x) => x === false],
    ],
  },
];

/** 對照組：同一批股票、任意一天買進持有的平均結果 */
function baseline(D, p) {
  const xs = { 1: [], 10: [] };
  let up = 0;
  let n = 0;
  for (const s of Object.values(D.series)) {
    const L = s.c.length;
    for (let i = VOL_AVG; i < L - 1; i += 3) {
      const avgLots = avgRange(s.v, i - VOL_AVG, i - 1) / 1000;
      if (avgLots < p.minVolLots || s.c[i] < p.minPrice) continue;
      n++;
      if (s.c[i + 1] > s.c[i]) up++;
      xs[1].push((s.c[i + 1] / s.c[i] - 1) * 100);
      if (i + 10 < L) xs[10].push((s.c[i + 10] / s.c[i] - 1) * 100);
    }
  }
  const avg = (a) => (a.length ? r2(a.reduce((x, y) => x + y, 0) / a.length - ROUND_TRIP) : null);
  return { n, nextUpRate: r2((up / Math.max(1, n)) * 100), avg1: avg(xs[1]), avg10: avg(xs[10]) };
}

export function runBacktest(D, query = {}) {
  const p = coerce(query);
  const out = {
    generatedAt: new Date().toISOString(),
    from: D.priceKeys[0] ?? null,
    to: D.priceKeys.at(-1) ?? null,
    days: D.priceKeys.length,
    cost: { ...COST, roundTrip: ROUND_TRIP },
    rules: { cooldown: COOLDOWN, falseDays: FALSE_DAYS, volAvg: VOL_AVG, minVolLots: p.minVolLots, minPrice: p.minPrice },
    baseline: baseline(D, p),
    variants: [],
    buckets: [],
    periods: [],
    samples: [],
  };
  const byLookback = {};
  for (const lb of [...new Set(VARIANTS.map((v) => v.lookback))]) byLookback[lb] = collectEvents(D, { ...p, lookback: lb });

  for (const v of VARIANTS) {
    const evs = byLookback[v.lookback].filter((e) => !v.volMult || e.volRatio >= v.volMult);
    const results = evs.map((e) => ({ e, t: trade(e, v.holdDays) }));
    const trades = results.filter((x) => !x.t.pending && !x.t.failedConfirm).map((x) => x.t);
    const failed = results.filter((x) => x.t.failedConfirm).length;
    out.variants.push({
      id: v.id,
      name: v.name,
      signals: evs.length,
      failedConfirm: failed,
      ...summarize(trades),
    });
    if (v.id === 'C') {
      // 最近的交易明細，方便人工核對程式邏輯
      out.samples = results
        .filter((x) => !x.t.pending)
        .sort((a, b) => (a.e.s.d[a.e.i] < b.e.s.d[b.e.i] ? 1 : -1))
        .slice(0, 40)
        .map(({ e, t }) => ({
          code: e.code,
          n: D.stocks[e.code]?.n ?? e.code,
          date: e.s.d[e.i],
          prevHigh: r2(e.prevHigh),
          close: r2(e.s.c[e.i]),
          volRatio: r2(e.volRatio),
          result: t.failedConfirm ? 'failed' : 'trade',
          entryDate: t.e != null ? e.s.d[t.e] : null,
          entry: r2(t.entry),
          ret1: r2(t.ret?.[1]),
          ret5: r2(t.ret?.[5]),
          ret10: r2(t.ret?.[10]),
          falseBreak: t.falseBreak ?? null,
        }));
    }
  }

  // 哪些情況容易假突破：用最寬鬆的 A（突破當天收盤進場）分組
  const base = byLookback[20].map((e) => ({ e, t: trade(e, 0) })).filter((x) => !x.t.pending);
  for (const bk of BUCKETS) {
    out.buckets.push({
      id: bk.id,
      name: bk.name,
      rows: bk.bins.map(([label, test]) => {
        const sel = base.filter((x) => {
          const v = bk.of(x.e);
          return v != null && test(v);
        });
        return { label, ...summarize(sel.map((x) => x.t)) };
      }),
    });
  }

  // 不同時期（市場環境）：以 C 規則、依季分組
  const cEvs = byLookback[20].filter((e) => e.volRatio >= 1.5).map((e) => ({ e, t: trade(e, 2) }));
  const byQ = {};
  for (const x of cEvs) {
    if (x.t.pending || x.t.failedConfirm) continue;
    const d = x.e.s.d[x.e.i];
    const q = `${d.slice(0, 4)}Q${Math.ceil(Number(d.slice(4, 6)) / 3)}`;
    (byQ[q] ??= []).push(x.t);
  }
  out.periods = Object.keys(byQ)
    .sort()
    .map((q) => ({ label: q, ...summarize(byQ[q]) }));

  return out;
}
