// 離線自我測試：用假資料跑一遍完整篩選流程（不連網）。npm run selftest
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'screener-selftest-'));
process.env.DATA_DIR = dir;

const { writeJSON } = await import('./lib/store.js');
const { runScreen, stockDetail } = await import('./screener/screen.js');
const { recentWeekdays, todayStr, shiftMonth, ymKey, qKey } = await import('./lib/dates.js');
const { parseRevenueOpenApi, parseMarginOpenApi } = await import('./sources/twse.js');
const { extractTables, pickTable, findCol, num, parseCSV } = await import('./lib/parse.js');
const { deduction, technical } = await import('./screener/indicators.js');

let failures = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (e) {
    failures++;
    console.log(`✘ ${name}\n  ${e.message}`);
  }
};

// ---------- 解析器 ----------
test('數字解析', () => {
  assert.equal(num('1,234.5'), 1234.5);
  assert.equal(num('-1,000'), -1000);
  assert.equal(num('--'), null);
  assert.equal(num('<p style="color:red">+</p>12.3'), 12.3);
});

test('MI_INDEX 表格挑選', () => {
  const json = {
    stat: 'OK',
    tables: [
      { fields: ['指數', '收盤指數', '漲跌(+/-)'], data: [['發行量加權股價指數', '23,456.78', '+']] },
      {
        fields: ['證券代號', '證券名稱', '成交股數', '成交筆數', '成交金額', '開盤價', '最高價', '最低價', '收盤價'],
        data: [['2330', '台積電', '30,000,000', '1', '1', '1,000', '1,010', '990', '1,005']],
      },
    ],
  };
  const t = pickTable(extractTables(json), '證券代號', '收盤價');
  assert.ok(t);
  assert.equal(num(t.data[0][findCol(t.fields, '收盤價')]), 1005);
});

test('OpenAPI 月營收（實際欄位）', () => {
  const r = parseRevenueOpenApi([
    {
      資料年月: '11509',
      公司代號: '2330',
      公司名稱: '台積電',
      產業別: '半導體業',
      '營業收入-當月營收': '511857399',
      '營業收入-去年當月營收': '330980920',
      '營業收入-去年同月增減(%)': '54.64861207105231',
    },
  ]);
  assert.equal(r['2026-09']['2330'].yoy, 54.64861207105231);
});

test('OpenAPI 月營收：欄位順序不同也不會拿錯（去年當月營收在前）', () => {
  const r = parseRevenueOpenApi([
    {
      資料年月: '11509',
      公司代號: '2330',
      公司名稱: '台積電',
      '營業收入-去年當月營收': '100',
      '營業收入-上月營收': '120',
      '營業收入-當月營收': '150',
      '營業收入-去年同月增減(%)': '50',
    },
  ]);
  assert.equal(r['2026-09']['2330'].rev, 150);
  assert.equal(r['2026-09']['2330'].ly, 100);
});

const { adjustSeries, lastJump } = await import('./lib/adjust.js');
test('還原權息：除息前的價格往下調，最新價格不變', () => {
  const s = { d: ['1', '2', '3', '4'], o: [100, 100, 95, 96], h: [100, 100, 95, 96], l: [100, 100, 95, 96], c: [100, 100, 95, 96] };
  assert.equal(adjustSeries(s, [['3', 100, 95]]), 1);
  assert.deepEqual(s.c, [95, 95, 95, 96]);
  // 除權息前收盤價對不上（不同事件）就不調整
  const t = { d: ['1', '2'], o: [50, 48], h: [50, 48], l: [50, 48], c: [50, 48] };
  assert.equal(adjustSeries(t, [['2', 100, 95]]), 0);
});
test('異常跳動（減資）偵測', () => {
  assert.equal(lastJump([10, 10.5, 11, 22, 22.5]), 3);
  assert.equal(lastJump([10, 11, 12.1, 13.3]), -1); // 連續漲停不算
});

test('OpenAPI 營益分析（實際欄位）', () => {
  const r = parseMarginOpenApi([
    {
      年度: '115',
      季別: '2',
      公司代號: '2330',
      公司名稱: '台積電',
      '營業收入(百萬元)': '2404483.69',
      '毛利率(%)(營業毛利)/(營業收入)': '67.03',
    },
    { 年度: '115', 季別: '2', 公司代號: '2816', 公司名稱: '旺旺保', '營業收入(百萬元)': '', '毛利率(%)(營業毛利)/(營業收入)': '' },
  ]);
  assert.equal(r['2026Q2']['2330'].gm, 67.03);
  assert.equal(r['2026Q2']['2816'], undefined);
});

const { parseInst } = await import('./sources/tpex.js');
test('櫃買新版法人表：依位置取投信', () => {
  const fields = ['代號', '名稱', ...Array(7).fill(['買進股數', '賣出股數', '買賣超股數']).flat(), '三大法人買賣超股數合計'];
  const row = (c) => [c, 'x', '1', '0', '-5,000', '0', '0', '0', '1', '0', '1', '40,000', '0', '40,000', ...Array(9).fill('0'), '1'];
  const r = parseInst(extractTables({ tables: [{ fields, data: Array.from({ length: 60 }, (_, i) => row(String(6100 + i))) }] }));
  assert.deepEqual(r['6100'], [40000, -5000]);
});

test('集保 CSV', () => {
  const rows = parseCSV('﻿資料日期,證券代號,持股分級,人數,股數,占集保庫存數比例%\n20261022,2330  ,15,1000,100,72.5\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][1].trim(), '2330');
});

test('均線扣抵', () => {
  const c = [10, 11, 12, 13, 14, 15, 16];
  const d = deduction(c, 5, 3);
  assert.equal(d.next, 12); // 明天要扣掉 5 天前那根
  assert.deepEqual(d.upcoming, [12, 13, 14]);
  assert.equal(d.favorable, true);
});

// ---------- 假資料 ----------
const days = recentWeekdays(todayStr(), 95).reverse();
const N = days.length;
const rnd = (() => {
  let s = 42;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

// 型態：A 多頭回測（應進名單）、B 基本面好但被殺（應進錯殺）、C 營收差（不應進）
const kinds = {};
for (let i = 0; i < 30; i++) kinds[String(1101 + i)] = i < 10 ? 'A' : i < 20 ? 'B' : 'C';

const paths = {};
for (const [code, k] of Object.entries(kinds)) {
  const c = [];
  let p = 50 + rnd() * 50;
  for (let i = 0; i < N; i++) {
    let drift;
    if (k === 'A') drift = i > N - 6 ? 0.004 : i > N - 12 ? -0.006 : 0.006; // 上漲、近期回測、再轉強
    else if (k === 'B') drift = i > N - 12 ? -0.03 : 0.002; // 最後兩週急殺
    else drift = -0.001;
    p *= 1 + drift + (rnd() - 0.5) * 0.004;
    c.push(Math.round(p * 100) / 100);
  }
  paths[code] = c;
}
// 1103 在 15 天前除息 5%（股價跳空），1130 在 30 天前減資（股價變 2 倍）
const EXD = N - 15;
const exPrev = paths['1103'][EXD - 1];
for (let i = EXD; i < N; i++) paths['1103'][i] = Math.round(paths['1103'][i] * 0.95 * 100) / 100;
for (let i = N - 30; i < N; i++) paths['1130'][i] = Math.round(paths['1130'][i] * 2 * 100) / 100;

let taiex = 22000;
for (let i = 0; i < N; i++) {
  const s = {};
  for (const code of Object.keys(kinds)) {
    const c = paths[code][i];
    s[code] = [c * 0.995, c * 1.012, c * 0.988, c, 3_000_000 + rnd() * 1_000_000];
  }
  taiex *= i > N - 6 ? 0.985 : 1.001;
  await writeJSON(`prices/${days[i]}.json`, { taiex, s });
}
await writeJSON('dividends.json', { 1103: [[days[EXD], exPrev, Math.round(exPrev * 0.95 * 100) / 100]] });
await writeJSON(
  'stocks.json',
  Object.fromEntries(Object.entries(kinds).map(([c, k]) => [c, { n: `測試${k}${c}`, m: 'TWSE', ind: '測試業' }])),
);

const latestYm = shiftMonth(ymKey(+todayStr().slice(0, 4), +todayStr().slice(4, 6)), -1);
for (let j = 0; j < 4; j++) {
  const ym = shiftMonth(latestYm, -j);
  const rows = {};
  for (const [code, k] of Object.entries(kinds)) {
    const yoy = k === 'C' ? 5 : 35 + j;
    rows[code] = { rev: 1000 * (1 + yoy / 100), ly: 1000, yoy };
  }
  await writeJSON(`revenue/${ym}.json`, rows);
}

// 累計營益：單季毛利 30 → 32 → 34（A、B），C 下滑
const cum = { [qKey(2025, 3)]: {}, [qKey(2025, 4)]: {}, [qKey(2026, 1)]: {}, [qKey(2026, 2)]: {} };
for (const [code, k] of Object.entries(kinds)) {
  const g = k === 'C' ? [33, 32, 31, 30] : [29, 30, 32, 34];
  cum['2025Q3'][code] = { rev: 300, gm: 30 };
  cum['2025Q4'][code] = { rev: 400, gm: (300 * 30 + 100 * g[1]) / 400 };
  cum['2026Q1'][code] = { rev: 100, gm: g[2] };
  cum['2026Q2'][code] = { rev: 200, gm: (100 * g[2] + 100 * g[3]) / 200 };
}
for (const [k, rows] of Object.entries(cum)) await writeJSON(`margins/${k}.json`, rows);

const weeks = [days[N - 11], days[N - 6], days[N - 1]];
for (let w = 0; w < weeks.length; w++) {
  const rows = {};
  for (const [code, k] of Object.entries(kinds)) {
    if (code === '1102' && w === 1) continue; // 1102 中間缺一週
    rows[code] = { b: 50 + (k === 'C' ? -w : w * 0.5), r: 20 - w, bp: 100, tp: 5000 };
  }
  await writeJSON(`holders/${weeks[w]}.json`, { rows });
}
for (let i = N - 6; i < N; i++) {
  const rows = {};
  for (const [code, k] of Object.entries(kinds)) rows[code] = [k === 'C' ? -50000 : 120000, 0];
  await writeJSON(`inst/${days[i]}.json`, rows);
}

// ---------- 篩選 ----------
const res = await runScreen({});
const codesIn = (arr, k) => arr.filter((r) => kinds[r.code] === k).length;

test('單季毛利率還原', () => {
  const row = res.list.find((r) => kinds[r.code] === 'A');
  assert.ok(row, '名單裡應該有 A 型股票');
  assert.deepEqual(
    row.gm.qs.map((q) => q.gm),
    [30, 32, 34],
  );
});
test('共振名單：基本面＋籌碼好的都進來，營收差的排除', () => {
  assert.ok(codesIn(res.list, 'A') >= 8, `A 型只有 ${codesIn(res.list, 'A')}`);
  assert.equal(codesIn(res.list, 'C'), 0);
});
test('A 型有技術面多頭', () => {
  const a = res.list.filter((r) => kinds[r.code] === 'A');
  assert.ok(a.filter((r) => r.tech.trendUp).length >= 6, '多數 A 型應該趨勢向上');
});
test('錯殺名單抓到 B 型', () => {
  assert.ok(codesIn(res.panic, 'B') >= 8, `B 型只有 ${codesIn(res.panic, 'B')}`);
  assert.equal(codesIn(res.panic, 'C'), 0);
});
test('大盤狀態判斷為恐慌', () => assert.equal(res.market.level, 'panic'));
const det = await stockDetail('1101');
test('個股明細有均線與扣抵位置', () => {
  assert.equal(det.chart.c.length, N);
  assert.equal(det.chart.deduct[20], N - 20);
});
test('技術面資料不足時回報原因', () => assert.equal(technical({ c: [1, 2], h: [], l: [], v: [] }, {}).ok, false));
const { bigHolderCheck, coerceParams } = await import('./screener/core.js');
const { loadData: loadD } = await import('./screener/data.js');
const D0 = await loadD();
test('千張大戶中間缺一週時不判定', () => {
  // 1102 缺了上一週，不能把「跨兩週」的變化當成一週增加
  assert.equal(bigHolderCheck('1102', D0, coerceParams({})).status, 'nodata');
  assert.equal(bigHolderCheck('1101', D0, coerceParams({})).status, 'ok');
  assert.equal(bigHolderCheck('1101', D0, coerceParams({ bigWeeks: 2 })).status, 'ok');
  assert.equal(bigHolderCheck('1102', D0, coerceParams({ bigWeeks: 2 })).status, 'nodata');
});
const det03 = await stockDetail('1103');
test('除息跳空已還原（不會被當成下跌）', () => {
  const c = det03.chart.c;
  const i = det03.chart.d.indexOf(days[EXD]);
  assert.ok(i > 0);
  assert.ok(c[i] / c[i - 1] - 1 > -0.02, `除息日變動 ${((c[i] / c[i - 1] - 1) * 100).toFixed(2)}%`);
  assert.equal(det03.chart.adjusted, true);
  assert.equal(c.at(-1), paths['1103'][N - 1]); // 最新收盤不變
});
const det30 = await stockDetail('1130');
test('減資之前的價格不列入', () => {
  assert.equal(det30.chart.cut, days[N - 30]);
  assert.equal(det30.chart.d[0], days[N - 30]);
});

const { runBacktest, currentBreakouts } = await import('./screener/breakout.js');
const { loadData } = await import('./screener/data.js');
const DD = await loadData({ priceDays: 600 });
const bt = runBacktest(DD);
test('突破回測可以執行並產生六組條件', () => {
  assert.equal(bt.variants.length, 6);
  assert.ok(bt.variants[0].signals >= bt.variants[1].signals, '加量能條件後次數不應增加');
  assert.ok(bt.buckets.length >= 4);
});
test('今日突破訊號可以執行', () => assert.ok(Array.isArray(currentBreakouts(DD).list)));

const swing = res.list.filter((r) => r.entry === 'swing').length;
console.log(`\n名單 ${res.list.length} 檔（波段進場訊號 ${swing} 檔）、錯殺 ${res.panic.length} 檔，大盤：${res.market.level}`);
console.log(res.coverage.warnings.length ? `資料提醒：${res.coverage.warnings.join('；')}` : '資料提醒：無');
// SELFTEST_KEEP=1 會保留假資料，可用 DATA_DIR=<該資料夾> npm start 看介面
if (process.env.SELFTEST_KEEP) console.log(`假資料保留在：${dir}`);
else await fs.rm(dir, { recursive: true, force: true });
if (failures) {
  console.log(`\n${failures} 項失敗`);
  process.exit(1);
}
console.log('\n全部通過');
