// 產生 GitHub Pages 用的 data.json，並清掉太舊的資料檔
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadData } from '../screener/data.js';
import { pack } from '../screener/bundle.js';
import { runBacktest } from '../screener/breakout.js';
import { readJSON, listKeys } from '../lib/store.js';
import { DATA_DIR } from '../config.js';

// 股價保留約 2 年多，供突破策略回測
const KEEP = { prices: 560, inst: 30, holders: 16, revenue: 14, margins: 10 };

export async function pruneOld() {
  let removed = 0;
  for (const [dir, n] of Object.entries(KEEP)) {
    const keys = await listKeys(dir);
    for (const k of keys.slice(0, Math.max(0, keys.length - n))) {
      await fs.rm(path.join(DATA_DIR, dir, `${k}.json`), { force: true });
      removed++;
    }
  }
  return removed;
}

export async function exportBundle(outFile) {
  const D = await loadData();
  const meta = (await readJSON('meta.json', null)) ?? {};
  const bundle = pack(D, {
    meta: { lastRun: meta.updated?.lastRun ?? null, log: (meta.log ?? []).slice(-40).reverse() },
  });
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  const text = JSON.stringify(bundle);
  await fs.writeFile(outFile, text);
  return { file: outFile, stocks: Object.keys(bundle.series).length, kb: Math.round(text.length / 1024) };
}

export async function exportBacktest(outFile) {
  const D = await loadData({ priceDays: 600 });
  const bt = runBacktest(D);
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(bt));
  return { file: outFile, days: bt.days, variants: bt.variants.map((v) => `${v.id}:${v.n}`).join(' ') };
}
