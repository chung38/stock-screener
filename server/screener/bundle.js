// 把累積資料壓成一個 data.json，讓手機瀏覽器（GitHub Pages）直接篩選
// 不依賴 Node，瀏覽器與伺服器共用

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

/**
 * @param {object} D loadData() 的結果
 * @param {{minVolLots?:number, minPrice?:number, meta?:object}} opt
 */
export function pack(D, { minVolLots = 50, minPrice = 3, meta = {} } = {}) {
  const keys = D.priceKeys;
  const idx = Object.fromEntries(keys.map((k, i) => [k, i]));
  const recentRev = D.revKeys.slice(-2);
  const keep = [];
  const series = {};
  for (const [code, s] of Object.entries(D.series)) {
    // 沒有月營收的股票一定篩不出來，不必打包
    if (!recentRev.some((k) => D.rev[k]?.[code])) continue;
    const L = s.c.length;
    const last20 = s.v.slice(-20);
    const avgLots = last20.reduce((a, x) => a + x, 0) / Math.max(1, last20.length) / 1000;
    if (avgLots < minVolLots || s.c[L - 1] < minPrice) continue;
    const cols = [[], [], [], [], []];
    for (const c of cols) c.length = keys.length;
    for (const c of cols) c.fill(null);
    s.d.forEach((d, i) => {
      const j = idx[d];
      if (j == null) return;
      cols[0][j] = r2(s.o[i]);
      cols[1][j] = r2(s.h[i]);
      cols[2][j] = r2(s.l[i]);
      cols[3][j] = r2(s.c[i]);
      cols[4][j] = Math.round(s.v[i] / 1000); // 張
    });
    series[code] = cols;
    keep.push(code);
  }
  const pick = (obj, fn = (x) => x) => {
    const out = {};
    for (const code of keep) if (obj?.[code] != null) out[code] = fn(obj[code]);
    return out;
  };
  return {
    v: 1,
    generatedAt: new Date().toISOString(),
    meta,
    priceKeys: keys,
    taiex: D.taiex.map((x) => [x.d, r2(x.c)]),
    stocks: pick(D.stocks),
    series,
    revKeys: D.revKeys,
    rev: Object.fromEntries(
      D.revKeys.map((k) => [k, pick(D.rev[k], (r) => [r.rev, r.ly, r2(r.yoy)])]),
    ),
    marginKeys: D.marginKeys,
    margins: Object.fromEntries(D.marginKeys.map((k) => [k, pick(D.margins[k], (r) => [r.rev, r2(r.gm)])])),
    holderKeys: D.holderKeys,
    holders: Object.fromEntries(D.holderKeys.map((k) => [k, pick(D.holders[k], (r) => [r2(r.b), r2(r.r), r.bp])])),
    instKeys: D.instKeys,
    inst: Object.fromEntries(D.instKeys.map((k) => [k, pick(D.inst[k], (r) => [r[0], r[1]])])),
  };
}

/** data.json → 篩選用的 D */
export function unpack(B) {
  const series = {};
  for (const [code, [o, h, l, c, v]] of Object.entries(B.series)) {
    const s = { d: [], o: [], h: [], l: [], c: [], v: [] };
    for (let j = 0; j < B.priceKeys.length; j++) {
      if (c[j] == null) continue;
      s.d.push(B.priceKeys[j]);
      s.o.push(o[j]);
      s.h.push(h[j]);
      s.l.push(l[j]);
      s.c.push(c[j]);
      s.v.push(v[j] * 1000);
    }
    series[code] = s;
  }
  const map = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, rows]) => [k, Object.fromEntries(Object.entries(rows).map(([c, r]) => [c, fn(r)]))]));
  return {
    stocks: B.stocks,
    priceKeys: B.priceKeys,
    series,
    taiex: B.taiex.map(([d, c]) => ({ d, c })),
    revKeys: B.revKeys,
    rev: map(B.rev, ([rev, ly, yoy]) => ({ rev, ly, yoy })),
    marginKeys: B.marginKeys,
    margins: map(B.margins, ([rev, gm]) => ({ rev, gm })),
    holderKeys: B.holderKeys,
    holders: map(B.holders, ([b, r, bp]) => ({ b, r, bp })),
    instKeys: B.instKeys,
    inst: B.inst,
  };
}
