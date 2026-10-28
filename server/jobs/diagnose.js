// 逐一測試每個資料來源，方便判斷是哪個網站擋住或改版
import * as twse from '../sources/twse.js';
import * as tpex from '../sources/tpex.js';
import * as mops from '../sources/mops.js';
import * as tdcc from '../sources/tdcc.js';
import { todayStr, recentWeekdays, expectedLatestRevenueMonth, expectedLatestQuarter, parseYm, parseQ } from '../lib/dates.js';

async function probe(name, fn) {
  const t0 = Date.now();
  try {
    const sample = await fn();
    return { name, ok: true, ms: Date.now() - t0, sample };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, error: e.message };
  }
}

const count = (o) => (o ? Object.keys(o).length : 0);
const firstOf = (o) => (o ? Object.entries(o)[0] : null);

export async function diagnose() {
  // 用「上一個平日」測試，避免今天還沒收盤
  const d = recentWeekdays(todayStr(), 2)[1];
  const ym = expectedLatestRevenueMonth();
  const q = expectedLatestQuarter();
  const results = [];
  results.push(
    await probe(`上市行情 MI_INDEX（${d}）`, async () => {
      const r = await twse.fetchDaily(d);
      return r ? `${count(r.prices)} 檔，加權指數 ${r.taiex}，例：${JSON.stringify(firstOf(r.prices))}` : '當日無資料（休市？）';
    }),
  );
  results.push(
    await probe(`上市法人 T86（${d}）`, async () => {
      const r = await twse.fetchInst(d);
      return r ? `${count(r)} 檔，例：${JSON.stringify(firstOf(r))}` : '當日無資料';
    }),
  );
  results.push(
    await probe(`上櫃行情（${d}）`, async () => {
      const r = await tpex.fetchDaily(d);
      return r ? `${count(r.prices)} 檔，例：${JSON.stringify(firstOf(r.prices))}` : '當日無資料';
    }),
  );
  results.push(
    await probe(`上櫃法人（${d}）`, async () => {
      const r = await tpex.fetchInst(d);
      return r ? `${count(r)} 檔，例：${JSON.stringify(firstOf(r))}` : '當日無資料';
    }),
  );
  results.push(
    await probe('上市月營收 OpenAPI', async () => {
      const r = await twse.fetchRevenueLatest();
      return Object.entries(r).map(([k, v]) => `${k}：${count(v)} 檔`).join('，');
    }),
  );
  results.push(
    await probe('上櫃月營收 OpenAPI', async () => {
      const r = await tpex.fetchRevenueLatest();
      return Object.entries(r).map(([k, v]) => `${k}：${count(v)} 檔`).join('，');
    }),
  );
  results.push(
    await probe('上市營益分析 OpenAPI', async () => {
      const r = await twse.fetchMarginLatest();
      return Object.entries(r).map(([k, v]) => `${k}：${count(v)} 檔`).join('，');
    }),
  );
  results.push(
    await probe('上櫃營益分析 OpenAPI', async () => {
      const r = await tpex.fetchMarginLatest();
      return Object.entries(r).map(([k, v]) => `${k}：${count(v)} 檔`).join('，');
    }),
  );
  results.push(
    await probe(`觀測站月營收回補（${ym}）`, async () => {
      const { y, m } = parseYm(ym);
      const r = await mops.fetchRevenueMonth('sii', y, m);
      return `${count(r)} 檔，例：${JSON.stringify(firstOf(r))}`;
    }),
  );
  results.push(
    await probe(`觀測站營益分析回補（${q}）`, async () => {
      const { y, q: qq } = parseQ(q);
      const r = await mops.fetchMarginQuarter('sii', y, qq);
      return `${count(r)} 檔，例：${JSON.stringify(firstOf(r))}`;
    }),
  );
  results.push(
    await probe('集保開放資料（最新一週）', async () => {
      const r = await tdcc.fetchLatest();
      return `${r.date}，${count(r.rows)} 檔，例：${JSON.stringify(firstOf(r.rows))}`;
    }),
  );
  results.push(
    await probe('集保個股查詢（2330 前一週）', async () => {
      const dates = await tdcc.availableDates();
      const r = await tdcc.fetchStockWeek('2330', dates[1] ?? dates[0]);
      return `可查 ${dates.length} 週，${dates[1]}：${JSON.stringify(r)}`;
    }),
  );
  return { at: new Date().toISOString(), testDate: d, results };
}
