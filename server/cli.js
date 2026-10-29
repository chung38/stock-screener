// 命令列：npm run update / backfill / diagnose / export
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
  // 近 26 個月的除權息資料 → data/dividends.json
  const t = todayStr();
  const cur = ymKey(Number(t.slice(0, 4)), Number(t.slice(4, 6)));
  const byCode = {};
  const debug = { errors: [], samples: {}, months: {} };
  for (let i = 25; i >= 0; i--) {
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
} else if (cmd === 'export') {
  const out = path.resolve(process.argv[3] || 'dist/data.json');
  const r = await exportBundle(out);
  console.log(`已輸出 ${r.file}：${r.stocks} 檔股票，${r.kb} KB`);
} else if (cmd === 'backtest') {
  const out = path.resolve(process.argv[3] || 'dist/backtest.json');
  const r = await exportBacktest(out);
  console.log(`已輸出 ${r.file}：${r.days} 個交易日，交易數 ${r.variants}`);
} else {
  console.log('用法：node server/cli.js update | backfill | diagnose | export [輸出檔] | backtest [輸出檔]');
}

process.exit(process.exitCode ?? 0);
