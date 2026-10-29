// 研究用：讀取全部歷史資料，並把股價還原權息
import { readJSON, listKeys } from '../lib/store.js';
import { adjustSeries, jumpFlags } from '../lib/adjust.js';

/**
 * @returns {{
 *   dates: string[], dateIdx: Record<string, number>, stocks: object,
 *   series: Record<string, {d:string[],g:number[],o:number[],h:number[],l:number[],c:number[],v:number[],bad:boolean[]}>,
 *   taiex: (number|null)[], rev: object, revKeys: string[], margins: object, marginKeys: string[],
 *   inst: Record<string, object>, dividends: {adjusted:number, events:number, matched:number} | null
 * }}
 */
export async function loadAll() {
  const stocks = (await readJSON('stocks.json', {})) ?? {};
  const dates = await listKeys('prices');
  const dateIdx = Object.fromEntries(dates.map((d, i) => [d, i]));
  const taiex = new Array(dates.length).fill(null);
  const series = {};
  for (let g = 0; g < dates.length; g++) {
    const f = await readJSON(`prices/${dates[g]}.json`, null);
    if (!f) continue;
    taiex[g] = f.taiex ?? null;
    for (const [code, r] of Object.entries(f.s ?? {})) {
      const s = (series[code] ??= { d: [], g: [], o: [], h: [], l: [], c: [], v: [] });
      s.d.push(dates[g]);
      s.g.push(g);
      s.o.push(r[0]);
      s.h.push(r[1]);
      s.l.push(r[2]);
      s.c.push(r[3]);
      s.v.push(r[4]);
    }
  }

  // ---- 還原權息（往前調整） ----
  const div = await readJSON('dividends.json', null);
  let events = 0;
  let matched = 0;
  if (div) {
    for (const [code, list] of Object.entries(div)) {
      events += list.length;
      const s = series[code];
      if (s) matched += adjustSeries(s, list);
    }
  }

  // ---- 標記異常跳動（減資、分割、新股上市等）：還原後單日漲跌仍超過 10.5% ----
  for (const s of Object.values(series)) s.bad = jumpFlags(s.c);

  const revKeys = await listKeys('revenue');
  const rev = {};
  for (const k of revKeys) rev[k] = (await readJSON(`revenue/${k}.json`, {})) ?? {};
  const marginKeys = await listKeys('margins');
  const margins = {};
  for (const k of marginKeys) margins[k] = (await readJSON(`margins/${k}.json`, {})) ?? {};
  const instKeys = await listKeys('inst');
  const inst = {};
  for (const k of instKeys) inst[k] = (await readJSON(`inst/${k}.json`, {})) ?? {};

  return {
    dates,
    dateIdx,
    stocks,
    series,
    taiex,
    rev,
    revKeys,
    margins,
    marginKeys,
    inst,
    global: (await readJSON('global.json', null))?.series ?? {},
    dividends: div ? { events, matched } : null,
  };
}
