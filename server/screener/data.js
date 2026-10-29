// 把累積的 JSON 檔整理成篩選要用的結構
import { readJSON, listKeys } from '../lib/store.js';
import { adjustSeries, lastJump } from '../lib/adjust.js';

export async function loadData({ priceDays = 110 } = {}) {
  const stocks = (await readJSON('stocks.json', {})) ?? {};

  // 股價：依日期串成每檔的序列
  const priceKeys = (await listKeys('prices')).slice(-priceDays);
  const priceFiles = await Promise.all(priceKeys.map((k) => readJSON(`prices/${k}.json`, null)));
  const series = {};
  const taiex = [];
  priceKeys.forEach((d, i) => {
    const f = priceFiles[i];
    if (!f) return;
    if (f.taiex != null) taiex.push({ d, c: f.taiex });
    for (const [code, r] of Object.entries(f.s ?? {})) {
      const s = (series[code] ??= { d: [], o: [], h: [], l: [], c: [], v: [] });
      s.d.push(d);
      s.o.push(r[0]);
      s.h.push(r[1]);
      s.l.push(r[2]);
      s.c.push(r[3]);
      s.v.push(r[4]);
    }
  });

  // 還原權息：除權息那天的跳空不算下跌，均線、前高、跌幅才正確（最新收盤不變）
  const div = (await readJSON('dividends.json', null)) ?? {};
  for (const [code, s] of Object.entries(series)) {
    s.adj = adjustSeries(s, div[code]);
    // 減資、分割、新上市造成的跳動：之前的價格無法比較，只用跳動之後的資料
    const j = lastJump(s.c);
    if (j > 0) {
      s.cut = s.d[j];
      for (const k of ['d', 'o', 'h', 'l', 'c', 'v']) s[k] = s[k].slice(j);
    }
  }

  const revKeys = (await listKeys('revenue')).slice(-8);
  const rev = Object.fromEntries(await Promise.all(revKeys.map(async (k) => [k, await readJSON(`revenue/${k}.json`, {})])));

  const marginKeys = (await listKeys('margins')).slice(-8);
  const margins = Object.fromEntries(
    await Promise.all(marginKeys.map(async (k) => [k, await readJSON(`margins/${k}.json`, {})])),
  );

  const holderKeys = (await listKeys('holders')).slice(-8);
  const holders = Object.fromEntries(
    await Promise.all(holderKeys.map(async (k) => [k, (await readJSON(`holders/${k}.json`, {}))?.rows ?? {}])),
  );

  // 國際行情與原物料：保留約 1 年多，用來算波動百分位
  const g = (await readJSON('global.json', null))?.series ?? {};
  const global = Object.fromEntries(Object.entries(g).map(([id, x]) => [id, { d: x.d.slice(-300), c: x.c.slice(-300) }]));

  const instKeys = (await listKeys('inst')).slice(-15);
  const inst = Object.fromEntries(await Promise.all(instKeys.map(async (k) => [k, await readJSON(`inst/${k}.json`, {})])));

  return {
    stocks,
    priceKeys,
    series,
    taiex,
    revKeys,
    rev,
    marginKeys,
    margins,
    holderKeys,
    holders,
    instKeys,
    inst,
    global,
  };
}
