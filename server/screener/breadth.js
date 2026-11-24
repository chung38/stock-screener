// 台股市場廣度：有多少股票參與漲勢，綜合成 0–100 分（100＝參與最廣）
// 構想參考 tradermonty/claude-trading-skills（MIT）的 market-breadth-analyzer、uptrend-analyzer、
// exposure-coach，指標與門檻改用台股全部上市櫃股票重算，並在「策略績效」頁用 2 年資料驗證。
// 不依賴 Node，伺服器、研究與瀏覽器共用。

import { jumpFlags } from '../lib/adjust.js';

const MIN_PRICE = 5;
const MIN_LOTS = 50; // 20 日均量至少 50 張才計入，避免冷門股干擾

// 分數區間。持股上限之後依台股回測結果決定，見 posture()
export const ZONES = [
  { min: 80, id: 'strong', label: '強勢' },
  { min: 60, id: 'healthy', label: '健康' },
  { min: 40, id: 'neutral', label: '中性' },
  { min: 20, id: 'weak', label: '轉弱' },
  { min: 0, id: 'critical', label: '危險' },
];
export const zoneOf = (score) => (score == null ? null : ZONES.find((z) => score >= z.min) ?? ZONES.at(-1));

// 綜合分數的組成與權重
export const COMPONENTS = [
  { key: 'p20', label: '站上月線（20 日）', w: 0.15 },
  { key: 'p60', label: '站上季線（60 日）', w: 0.3 },
  { key: 'p120', label: '站上半年線（120 日）', w: 0.25 },
  { key: 'c4', label: '近 10 日上漲家數比例', w: 0.15 },
  { key: 'c5', label: '近 10 日創新高減新低', w: 0.15 },
];

const clip = (x) => Math.max(0, Math.min(100, x));
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

/**
 * @param {number} nDates 交易日數
 * @param {Array<{g:number[], c:number[], v:number[]}>} list 每檔股票：g＝第幾個交易日、c＝收盤（已還原權息）、v＝成交股數
 * @returns 每天一筆的廣度序列
 */
export function computeBreadth(nDates, list) {
  const z = () => new Float64Array(nDates);
  const n = z();
  const n20 = z();
  const a20 = z();
  const n60 = z();
  const a60 = z();
  const n120 = z();
  const a120 = z();
  const adv = z();
  const dec = z();
  const nh = z();
  const nl = z();
  for (const s of list) {
    const { g, c, v } = s;
    let s20 = 0;
    let s60 = 0;
    let s120 = 0;
    let sv = 0;
    for (let i = 0; i < c.length; i++) {
      s20 += c[i];
      s60 += c[i];
      s120 += c[i];
      if (i >= 20) s20 -= c[i - 20];
      if (i >= 60) s60 -= c[i - 60];
      if (i >= 120) s120 -= c[i - 120];
      // 均量用前 20 天（不含當天）
      const liquid = i >= 20 && c[i] >= MIN_PRICE && sv / 20 / 1000 >= MIN_LOTS;
      sv += v[i] ?? 0;
      if (i >= 20) sv -= v[i - 20] ?? 0;
      if (!liquid) continue;
      const G = g[i];
      n[G]++;
      if (i >= 19) {
        n20[G]++;
        if (c[i] > s20 / 20) a20[G]++;
      }
      if (i >= 59) {
        n60[G]++;
        if (c[i] > s60 / 60) a60[G]++;
        let hi = -Infinity;
        let lo = Infinity;
        for (let k = i - 59; k < i; k++) {
          if (c[k] > hi) hi = c[k];
          if (c[k] < lo) lo = c[k];
        }
        if (c[i] > hi) nh[G]++;
        else if (c[i] < lo) nl[G]++;
      }
      if (i >= 119) {
        n120[G]++;
        if (c[i] > s120 / 120) a120[G]++;
      }
      if (i >= 1 && g[i - 1] === G - 1) {
        if (c[i] > c[i - 1]) adv[G]++;
        else if (c[i] < c[i - 1]) dec[G]++;
      }
    }
  }
  const out = [];
  for (let G = 0; G < nDates; G++) {
    const pct = (a, b) => (b[G] >= 200 ? (a[G] / b[G]) * 100 : null);
    // 近 10 日：上漲家數比例、創新高減新低（占全部的 %）
    let su = 0;
    let sd = 0;
    let shl = 0;
    let k = 0;
    for (let j = Math.max(0, G - 9); j <= G; j++) {
      su += adv[j];
      sd += dec[j];
      if (n60[j] >= 200) {
        shl += ((nh[j] - nl[j]) / n60[j]) * 100;
        k++;
      }
    }
    const adv10 = G >= 9 && su + sd > 0 ? su / (su + sd) : null;
    const hl10 = G >= 9 && k === 10 ? shl / 10 : null;
    const x = {
      n: n[G],
      p20: pct(a20, n20),
      p60: pct(a60, n60),
      p120: pct(a120, n120),
      adv: adv[G],
      dec: dec[G],
      nh: nh[G],
      nl: nl[G],
      adv10,
      hl10,
    };
    x.c4 = adv10 == null ? null : clip(((adv10 - 0.35) / 0.3) * 100);
    x.c5 = hl10 == null ? null : clip(((hl10 + 10) / 20) * 100);
    x.score = COMPONENTS.every((cp) => x[cp.key] != null) ? COMPONENTS.reduce((s, cp) => s + cp.w * x[cp.key], 0) : null;
    out.push(x);
  }
  return out;
}

/** 壓縮成網頁要用的格式（每天一列） */
export function packBreadth(dates, rows, keep = 260) {
  const from = Math.max(0, rows.length - keep);
  const cols = ['score', 'p20', 'p60', 'p120', 'c4', 'c5', 'adv10', 'hl10', 'n', 'adv', 'dec', 'nh', 'nl'];
  const out = { d: dates.slice(from) };
  for (const k of cols) out[k] = rows.slice(from).map((x) => (k === 'adv10' ? (x[k] == null ? null : Math.round(x[k] * 1000) / 1000) : r1(x[k])));
  return out;
}

/** 最新狀態：分數、區間、5 日變化、各組成 */
export function breadthSummary(B) {
  if (!B?.d?.length) return null;
  let i = B.d.length - 1;
  while (i >= 0 && B.score[i] == null) i--;
  if (i < 0) return null;
  const score = B.score[i];
  const prev5 = i >= 5 ? B.score[i - 5] : null;
  const zone = zoneOf(score);
  return {
    date: B.d[i],
    score,
    change5: prev5 == null ? null : r1(score - prev5),
    zone: zone.id,
    label: zone.label,
    parts: COMPONENTS.map((cp) => ({ ...cp, value: B[cp.key][i] })),
    raw: { p20: B.p20[i], p60: B.p60[i], p120: B.p120[i], adv10: B.adv10[i], hl10: B.hl10[i], n: B.n[i], adv: B.adv[i], dec: B.dec[i], nh: B.nh[i], nl: B.nl[i] },
  };
}

/** 遇到減資、分割等異常跳動就切成兩段，前後分開計算均線 */
export function splitAtJumps(s) {
  const flags = s.bad ?? jumpFlags(s.c);
  const out = [];
  let st = 0;
  for (let i = 1; i <= s.c.length; i++) {
    if (i === s.c.length || flags[i]) {
      if (i - st >= 20) out.push({ g: s.g.slice(st, i), c: s.c.slice(st, i), v: s.v.slice(st, i) });
      st = i;
    }
  }
  return out;
}

// 建議持股水位（構想來自 exposure-coach）：用台股 2025/3～2026/11 回測過的分級，
// 廣度 ≥ 40 正常持股、20～40 減半、< 20 只留 1/4；比一直滿倉的最大回撤小、報酬沒有變差（見策略績效）
export const EXPOSURE_RULE = [
  { min: 40, cap: 100, label: '正常持股' },
  { min: 20, cap: 50, label: '持股減半' },
  { min: 0, cap: 25, label: '只留 1/4' },
];
export function posture(sum) {
  if (!sum) return null;
  const r = EXPOSURE_RULE.find((x) => sum.score >= x.min) ?? EXPOSURE_RULE.at(-1);
  return { cap: r.cap, label: r.label, score: sum.score, zone: sum.zone };
}
