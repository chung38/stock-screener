// GitHub 排程用：判斷這次排程要不要真的跑（同一件事排了好幾個備援時間，已經做完就跳過）
// 不依賴任何套件，npm ci 之前就能執行。輸出 run=true／false 給 GITHUB_OUTPUT
// 用法：node server/should-run.js daily|global|weekly
import fs from 'node:fs';

const mode = process.argv[2] ?? 'daily';
const read = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

// 台北時間
const now = new Date(Date.now() + 8 * 3600e3);
const today = now.toISOString().slice(0, 10).replace(/-/g, '');
const tpe = (iso) => (iso ? new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString() : '');
const meta = read('data/meta.json') ?? {};
const lastRun = tpe(meta.updated?.lastRun); // 例如 2026-10-30T18:45:00.000Z（已換成台北時間）
const globalRun = tpe(meta.updated?.globalRun);
const todayIso = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}`;

let run = true;
let why = '';
if (mode === 'daily') {
  // 今天收盤後已經完整更新過（行情、法人都有，沒有缺上櫃）
  const p = read(`data/prices/${today}.json`);
  const inst = read(`data/inst/${today}.json`);
  const done = p && !p.partial?.length && inst && !inst._partial?.length && lastRun >= `${todayIso}T18:00`;
  if (done) [run, why] = [false, '今天的資料已經更新過'];
} else if (mode === 'global') {
  // 今天早上 6 點（美股收盤）之後已經抓過國際行情
  if (globalRun >= `${todayIso}T06:00` || lastRun >= `${todayIso}T06:00`) [run, why] = [false, '今天早上已經更新過國際行情'];
} else if (mode === 'weekly') {
  if (lastRun >= `${todayIso}T10:00`) [run, why] = [false, '今天已經更新過'];
}
console.log(`run=${run}`);
console.error(run ? `需要更新（${mode}）` : `跳過：${why}`);
