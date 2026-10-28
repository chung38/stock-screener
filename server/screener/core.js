// 三重共振篩選：基本面爆發 × 籌碼進駐 × 技術面突破，另含大盤恐慌時的錯殺清單
// 這個檔案不依賴 Node，伺服器與瀏覽器（GitHub Pages 版）共用
import { technical, marketMood, smaSeries } from './indicators.js';
import { shiftMonth, parseQ, shiftQuarter } from '../lib/dates.js';

export const DEFAULTS = {
  // 基本面
  revMonths: 3, // 近幾個月
  revYoyMin: 20, // 營收年增率門檻 %
  revMode: 'each', // each：每個月都要過；sum：合計年增率過門檻
  gmQuarters: 2, // 毛利率連續改善季數
  gmMinStep: 0, // 每季至少改善幾個百分點
  // 籌碼
  bigWeeks: 1, // 千張大戶連續增加週數
  bigMinDelta: 0, // 每週至少增加幾個百分點
  retailDown: false, // 同時要求 50 張以下散戶比例下降
  trustDays: 5, // 投信近幾日
  trustMinLots: 0, // 合計買超至少幾張（> 這個數）
  trustMinBuyDays: 0, // 其中至少幾天是買超
  requireChips: true, // 名單是否必須通過籌碼面
  // 技術面
  keyMA: 20, // 關鍵均線：20 月線 / 60 季線
  pullbackDays: 10,
  pullbackTolPct: 2, // 回測到均線上方幾 % 內算「有回測」
  breakTolPct: 1, // 收盤跌破均線超過幾 % 算「破線」
  // 流動性
  minVolLots: 300, // 20 日均量（張）
  minPrice: 10,
  // 錯殺
  panicDropPct: 15, // 距 20 日高點跌幅 %
  panicBiasPct: -8, // 月線乖離 %
  panicRsi: 20,
  panicRequireGm: false,
};

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

export function coerceParams(q = {}) {
  const p = { ...DEFAULTS };
  for (const [k, def] of Object.entries(DEFAULTS)) {
    if (q[k] == null || q[k] === '') continue;
    if (typeof def === 'number') {
      const n = Number(q[k]);
      if (Number.isFinite(n)) p[k] = n;
    } else if (typeof def === 'boolean') p[k] = q[k] === true || q[k] === 'true' || q[k] === '1';
    else p[k] = String(q[k]);
  }
  p.revMonths = Math.min(Math.max(1, Math.round(p.revMonths)), 6);
  p.gmQuarters = Math.min(Math.max(1, Math.round(p.gmQuarters)), 4);
  p.bigWeeks = Math.min(Math.max(1, Math.round(p.bigWeeks)), 4);
  p.trustDays = Math.min(Math.max(1, Math.round(p.trustDays)), 15);
  p.keyMA = p.keyMA === 60 ? 60 : 20;
  return p;
}

// ---------- 基本面 ----------

export function revenueCheck(code, D, p) {
  const keys = D.revKeys;
  if (!keys.length) return { status: 'nodata', months: [] };
  // 每檔各自取最近一個有公布的月份（月初很多公司還沒公布）
  let last = null;
  for (let i = keys.length - 1; i >= Math.max(0, keys.length - 2); i--) {
    if (D.rev[keys[i]]?.[code]) {
      last = keys[i];
      break;
    }
  }
  if (!last) return { status: 'nodata', months: [] };
  const months = [];
  for (let j = 0; j < p.revMonths; j++) {
    const k = shiftMonth(last, -j);
    const row = D.rev[k]?.[code];
    if (!row) return { status: 'nodata', months };
    months.unshift({ ym: k, yoy: r2(row.yoy), rev: row.rev, ly: row.ly });
  }
  let pass;
  if (p.revMode === 'sum') {
    const cur = months.reduce((a, m) => a + (m.rev ?? 0), 0);
    const ly = months.reduce((a, m) => a + (m.ly ?? 0), 0);
    pass = ly > 0 && ((cur - ly) / ly) * 100 > p.revYoyMin;
  } else {
    pass = months.every((m) => m.yoy != null && m.ly > 0 && m.yoy > p.revYoyMin);
  }
  const avgYoy = months.reduce((a, m) => a + (m.yoy ?? 0), 0) / months.length;
  return { status: 'ok', months, pass, avgYoy: r2(avgYoy) };
}

// 營益分析是「累計至該季」，用相減還原單季毛利率
function singleQuarter(D, key, code) {
  const cur = D.margins[key]?.[code];
  if (!cur) return null;
  const { q } = parseQ(key);
  if (q === 1) return { k: key, gm: r2(cur.gm), rev: cur.rev };
  const prev = D.margins[shiftQuarter(key, -1)]?.[code];
  if (!prev) return null;
  const rev = cur.rev - prev.rev;
  if (!(rev > 0)) return null;
  const gp = (cur.rev * cur.gm) / 100 - (prev.rev * prev.gm) / 100;
  return { k: key, gm: r2((gp / rev) * 100), rev: r2(rev) };
}

export function marginCheck(code, D, p) {
  const keys = D.marginKeys;
  let last = null;
  for (let i = keys.length - 1; i >= Math.max(0, keys.length - 2); i--) {
    if (D.margins[keys[i]]?.[code]) {
      last = keys[i];
      break;
    }
  }
  if (!last) return { status: 'nodata', qs: [] };
  const qs = [];
  for (let j = 0; j <= p.gmQuarters; j++) {
    const sq = singleQuarter(D, shiftQuarter(last, -j), code);
    if (!sq) return { status: 'nodata', qs };
    qs.unshift(sq);
  }
  let pass = true;
  for (let i = 1; i < qs.length; i++) if (!(qs[i].gm > qs[i - 1].gm + p.gmMinStep)) pass = false;
  return { status: 'ok', qs, pass, gain: r2(qs[qs.length - 1].gm - qs[0].gm) };
}

// ---------- 籌碼面 ----------

export function bigHolderCheck(code, D, p) {
  const pts = [];
  for (const k of D.holderKeys) {
    const row = D.holders[k]?.[code];
    if (row) pts.push({ d: k, b: row.b, r: row.r, bp: row.bp });
  }
  const latestKey = D.holderKeys[D.holderKeys.length - 1];
  if (pts.length < p.bigWeeks + 1 || pts[pts.length - 1].d !== latestKey) {
    return { status: 'nodata', pts };
  }
  const use = pts.slice(-(p.bigWeeks + 1));
  let pass = true;
  for (let i = 1; i < use.length; i++) if (!(use[i].b - use[i - 1].b > p.bigMinDelta)) pass = false;
  const last = use[use.length - 1];
  const prev = use[use.length - 2];
  const retailDelta = r2(last.r - prev.r);
  if (p.retailDown && !(retailDelta < 0)) pass = false;
  return { status: 'ok', pts: pts.slice(-6), pass, delta: r2(last.b - prev.b), latest: last.b, retailDelta };
}

export function trustCheck(code, D, p) {
  const keys = D.instKeys.slice(-p.trustDays);
  if (!keys.length) return { status: 'nodata' };
  let shares = 0;
  let buyDays = 0;
  let foreign = 0;
  const daily = keys.map((k) => {
    const row = D.inst[k]?.[code];
    const t = row?.[0] ?? 0;
    shares += t;
    foreign += row?.[1] ?? 0;
    if (t > 0) buyDays++;
    return Math.round(t / 1000);
  });
  const lots = Math.round(shares / 1000);
  const pass = lots > p.trustMinLots && buyDays >= p.trustMinBuyDays;
  return {
    status: keys.length < p.trustDays ? 'partial' : 'ok',
    days: keys.length,
    lots,
    buyDays,
    foreignLots: Math.round(foreign / 1000),
    daily,
    pass,
  };
}

// ---------- 主程式 ----------

function scoreOf(row) {
  const f = row.rev.avgYoy ?? 0;
  const g = row.gm.gain ?? 0;
  const b = row.big.delta ?? 0;
  const t = row.trust.lots ?? 0;
  const tech = row.tech.ok ? row.tech : {};
  return r2(
    Math.min(Math.max(f, 0), 150) * 0.3 +
      Math.max(Math.min(g, 15), -15) * 2 +
      Math.max(Math.min(b, 3), -3) * 6 +
      Math.sign(t) * Math.log10(1 + Math.abs(t)) * 5 +
      (tech.trendUp ? 8 : 0) +
      (tech.held ? 8 : 0) +
      (tech.breakout ? 6 : 0) +
      (tech.d20?.favorable ? 4 : 0) +
      (tech.d5?.favorable ? 2 : 0),
  );
}

// 名單與個股明細共用同一套判斷，確保兩邊顯示一致
function evaluate(code, D, p, tech) {
  const rev = revenueCheck(code, D, p);
  const gm = marginCheck(code, D, p);
  const big = bigHolderCheck(code, D, p);
  const trust = trustCheck(code, D, p);
  const info = D.stocks[code] ?? {};
  const row = {
    code,
    n: info.n ?? code,
    m: info.m ?? '',
    ind: info.ind ?? '',
    rev,
    gm,
    big,
    trust,
    tech,
    pillars: {
      f: !!(rev.pass && gm.status === 'ok' && gm.pass),
      c: !!(big.status === 'ok' && big.pass && trust.status !== 'nodata' && trust.pass),
      t: !!(tech.ok && (tech.trendUp || tech.breakout)),
    },
    entry: tech.ok && tech.trendUp && tech.held ? 'swing' : tech.ok && tech.breakout ? 'breakout' : null,
  };
  row.score = scoreOf(row);
  return row;
}

export function screenData(D, query = {}) {
  const p = coerceParams(query);
  const market = D.taiex.length ? marketMood(D.taiex) : { level: 'unknown', reason: '尚無加權指數資料' };

  const list = [];
  const panic = [];
  let universe = 0;

  for (const [code, s] of Object.entries(D.series)) {
    const L = s.c.length;
    if (!L || s.d[L - 1] !== D.priceKeys[D.priceKeys.length - 1]) continue; // 最新一天沒交易（停牌）
    universe++;
    const tech = technical(s, p);
    if (!tech.ok) continue;
    if (tech.close < p.minPrice || tech.volLots < p.minVolLots) continue;

    const row = evaluate(code, D, p, tech);
    if (row.rev.status !== 'ok') continue;
    const { rev, gm } = row;

    if (row.pillars.f && (row.pillars.c || !p.requireChips)) list.push(row);

    // 錯殺：營收仍強（毛利率視設定），但股價短線被殺深
    const potential = rev.pass && (!p.panicRequireGm || (gm.status === 'ok' && gm.pass));
    const oversold =
      tech.dropHigh20 <= -p.panicDropPct && (tech.bias20 <= p.panicBiasPct || (tech.rsi6 != null && tech.rsi6 <= p.panicRsi));
    if (potential && oversold) {
      panic.push({
        ...row,
        plan: {
          stop: r2(tech.low5 * 0.97), // 跌破近 5 日低點 3% 停損
          target1: tech.ma5 > tech.close ? tech.ma5 : null, // 反彈第一目標：週線
          target2: tech.ma20, // 第二目標：月線
        },
        potentialScore: r2(
          Math.min(rev.avgYoy ?? 0, 200) * 0.4 + (gm.gain ?? 0) * 2 + -tech.dropHigh20 * 0.8 + (gm.pass ? 10 : 0),
        ),
      });
    }
  }

  list.sort((a, b) => b.score - a.score);
  panic.sort((a, b) => b.potentialScore - a.potentialScore);

  return {
    params: p,
    asOf: D.priceKeys[D.priceKeys.length - 1] ?? null,
    market,
    universe,
    list,
    panic: panic.slice(0, 60),
    coverage: coverage(D, p),
  };
}

// 告訴使用者目前資料夠不夠用
export function coverage(D, p = DEFAULTS) {
  const warn = [];
  if (D.priceKeys.length < 25) warn.push(`股價只有 ${D.priceKeys.length} 個交易日，至少要 25 天才能算月線，請執行「建立歷史資料」`);
  else if (D.priceKeys.length < 65) warn.push(`股價只有 ${D.priceKeys.length} 個交易日，季線與季線扣抵暫時無法使用`);
  if (D.revKeys.length < p.revMonths) warn.push(`月營收只有 ${D.revKeys.length} 個月，需要 ${p.revMonths} 個月`);
  if (D.marginKeys.length < p.gmQuarters + 1) warn.push(`營益分析只有 ${D.marginKeys.length} 季，毛利率比較可能不完整`);
  if (D.holderKeys.length < p.bigWeeks + 1)
    warn.push(`千張大戶只有 ${D.holderKeys.length} 週資料。候選股會自動向集保查詢前幾週；也可以等下週資料進來`);
  if (D.instKeys.length < p.trustDays) warn.push(`投信買賣超只有 ${D.instKeys.length} 天，需要 ${p.trustDays} 天`);
  return {
    prices: { days: D.priceKeys.length, from: D.priceKeys[0] ?? null, to: D.priceKeys.at(-1) ?? null },
    revenue: D.revKeys,
    margins: D.marginKeys,
    holders: D.holderKeys,
    inst: { days: D.instKeys.length, to: D.instKeys.at(-1) ?? null },
    stocks: Object.keys(D.stocks).length,
    warnings: warn,
  };
}

/** 個股明細：畫圖與各項數據 */
export function detailData(D, code, query = {}) {
  const p = coerceParams(query);
  const s = D.series[code];
  if (!s) return null;
  const tech = technical(s, p);
  const n = s.c.length;
  // 判定結果用目前篩選條件；下面的歷史數據另外多抓幾期給畫面看
  const judged = evaluate(code, D, p, tech);
  const histRev = revenueCheck(code, D, { ...p, revMonths: 6 });
  const histGm = marginCheck(code, D, { ...p, gmQuarters: 3 });
  return {
    code,
    info: D.stocks[code] ?? {},
    pillars: judged.pillars,
    entry: judged.entry,
    judged: {
      rev: judged.rev.pass ?? false,
      gm: judged.gm.status === 'ok' ? judged.gm.pass : null,
      big: judged.big.status === 'ok' ? judged.big.pass : null,
      trust: judged.trust.status !== 'nodata' ? judged.trust.pass : null,
    },
    chart: {
      d: s.d,
      o: s.o,
      h: s.h,
      l: s.l,
      c: s.c,
      v: s.v,
      ma5: smaSeries(s.c, 5),
      ma20: smaSeries(s.c, 20),
      ma60: smaSeries(s.c, 60),
      deduct: { 5: n >= 5 ? n - 5 : null, 20: n >= 20 ? n - 20 : null, 60: n >= 60 ? n - 60 : null },
    },
    tech,
    // 資料不足時 months/qs 仍會帶回已有的部分
    rev: { months: histRev.months, threshold: p.revYoyMin },
    gm: { qs: histGm.qs.length >= judged.gm.qs.length ? histGm.qs : judged.gm.qs },
    big: bigHolderCheck(code, D, { ...p, bigWeeks: 1 }),
    trust: trustCheck(code, D, { ...p, trustDays: 10 }),
  };
}
