// 命令列：npm run update / backfill / diagnose / research …（不帶參數執行可看全部指令）
import path from 'node:path';
import { runUpdate, runResearchBackfill, jobState } from './jobs/update.js';
import { diagnose } from './jobs/diagnose.js';
import { exportBundle, exportBacktest, pruneOld } from './jobs/export.js';
import { fetchMonth as fetchDividendMonth } from './sources/dividends.js';
import { writeJSON } from './lib/store.js';
import { todayStr, shiftMonth, ymKey, parseYm } from './lib/dates.js';

const cmd = process.argv[2];

if (cmd === 'diagnose') {
  const r = await diagnose();
  for (const x of r.results) {
    console.log(`${x.ok ? '✔' : '✘'} ${x.name}（${x.ms}ms）`);
    console.log(`   ${x.ok ? x.sample : x.error}`);
  }
} else if (cmd === 'update' || cmd === 'backfill') {
  const timer = setInterval(() => {
    const s = jobState();
    if (s.stage) console.log(`${s.stage} ${s.done}/${s.total}`);
  }, 30000);
  try {
    await runUpdate({ backfill: cmd === 'backfill' });
  } finally {
    clearInterval(timer);
  }
  const removed = await pruneOld();
  if (removed) console.log(`清掉 ${removed} 個過期資料檔`);
} else if (cmd === 'research-data') {
  const timer = setInterval(() => {
    const s = jobState();
    if (s.stage) console.log(`${s.stage} ${s.done}/${s.total}`);
  }, 30000);
  try {
    await runResearchBackfill();
  } finally {
    clearInterval(timer);
  }
} else if (cmd === 'dividends') {
  // 近 28 個月的除權息資料 → data/dividends.json
  const t = todayStr();
  const cur = ymKey(Number(t.slice(0, 4)), Number(t.slice(4, 6)));
  const byCode = {};
  const debug = { errors: [], samples: {}, months: {} };
  for (let i = 27; i >= 0; i--) {
    const { y, m } = parseYm(shiftMonth(cur, -i));
    const r = await fetchDividendMonth(y, m);
    for (const [code, ymd, prev, ref] of r.rows) (byCode[code] ??= []).push([ymd, prev, ref]);
    debug.errors.push(...r.errors);
    debug.months[`${y}-${m}`] = { rows: r.rows.length, markets: r.markets };
    if (i === 3 || !r.markets.includes('TPEX')) Object.assign(debug.samples, r.samples);
    console.log(`${y}/${m}：${r.rows.length} 筆（${r.markets.join('、') || '無'}）`);
  }
  for (const v of Object.values(byCode)) v.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  await writeJSON('dividends.json', byCode);
  await writeJSON('dividends-debug.json', debug);
  console.log(`除權息資料：${Object.keys(byCode).length} 檔`);
} else if (cmd === 'research') {
  const { loadAll } = await import('./research/load.js');
  const { runLab } = await import('./research/lab.js');
  const fs = await import('node:fs/promises');
  const out = path.resolve(process.argv[3] || 'dist/research.json');
  const A = await loadAll();
  const r = runLab(A, { onProgress: (x) => console.log(`計算：${x}`) });
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(r));
  console.log(`已輸出 ${out}：${r.days} 個交易日、${r.stocks} 檔，耗時 ${Math.round(r.ms / 1000)} 秒`);
} else if (cmd === 'export') {
  const out = path.resolve(process.argv[3] || 'dist/data.json');
  const r = await exportBundle(out);
  console.log(`已輸出 ${r.file}：${r.stocks} 檔股票，${r.kb} KB`);
} else if (cmd === 'backtest') {
  const out = path.resolve(process.argv[3] || 'dist/backtest.json');
  const r = await exportBacktest(out);
  console.log(`已輸出 ${r.file}：${r.days} 個交易日，交易數 ${r.variants}`);
} else {
  console.log(
    [
      '用法：node server/cli.js <指令>',
      '  update               每日更新',
      '  backfill             建立／補齊歷史資料（PRICE_DAYS 天股價）',
      '  research-data        補齊 2 年月營收、營益分析、法人資料',
      '  dividends            重抓近 28 個月除權息資料',
      '  diagnose             測試每個資料來源',
      '  export [輸出檔]      輸出手機版 data.json',
      '  backtest [輸出檔]    輸出突破策略回測',
      '  research [輸出檔]    輸出策略研究結果',
    ].join('\n'),
  );
}

process.exit(process.exitCode ?? 0);
