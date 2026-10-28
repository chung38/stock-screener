// 把累積的 JSON 檔整理成篩選要用的結構
import { readJSON, listKeys } from '../lib/store.js';

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
  };
}
