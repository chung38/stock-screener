// 準時觸發器：GitHub 的排程常晚好幾個小時，所以這支程式由「提早」的排程啟動，
// 在雲端等到指定的台北時間，再觸發「每日更新」（workflow_dispatch 不會延遲）。
// GitHub 單一工作上限 6 小時，所以整個工作最多跑 5 小時 40 分；等不到的步驟交給下一次排程。
// 不依賴任何套件。用法：node server/timer.js（測試：NOW=2026-11-16T12:00 DRY_RUN=1）
import { execFileSync } from 'node:child_process';

const REPO = process.env.GITHUB_REPOSITORY || 'chung38/stock-screener';
const DRY = !!process.env.DRY_RUN;
const LIMIT = (5 * 60 + 40) * 60e3;
const TPE = 8 * 3600e3;

let fakeNow = process.env.NOW ? Date.parse(`${process.env.NOW}+08:00`) : null;
const now = () => fakeNow ?? Date.now();
const deadline = now() + LIMIT;
const sleep = async (ms) => {
  if (ms <= 0) return;
  if (fakeNow != null) {
    fakeNow += ms; // 測試時不真的等
    return;
  }
  await new Promise((r) => setTimeout(r, ms));
};
const tpe = (t = now()) => new Date(t + TPE); // 用 getUTC* 讀出來就是台北時間
const ymd = (t) => tpe(t).toISOString().slice(0, 10).replace(/-/g, '');
const iso = (t) => tpe(t).toISOString().slice(0, 16); // 台北時間 YYYY-MM-DDTHH:MM
const todayAt = (hhmm) => {
  const d = tpe();
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - TPE;
};
const log = (msg) => console.log(`[${iso(now()).replace('T', ' ')}] ${msg}`);

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}
function readMain(path) {
  try {
    return JSON.parse(git('show', `origin/main:${path}`));
  } catch {
    return null;
  }
}

/** 最新的 main 上，今天的資料更新到哪裡了 */
function status() {
  if (!DRY) {
    try {
      git('fetch', '-q', '--depth=1', 'origin', 'main');
    } catch {
      /* 抓不到就用手上的版本 */
    }
  }
  const today = ymd(now());
  const d = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}`;
  const meta = readMain('data/meta.json') ?? {};
  const toTpe = (s) => (s ? iso(Date.parse(s)) : '');
  const lastRun = toTpe(meta.updated?.lastRun);
  const globalRun = toTpe(meta.updated?.globalRun);
  const p = readMain(`data/prices/${today}.json`);
  const inst = readMain(`data/inst/${today}.json`);
  const prices = !!p && !p.partial?.length;
  return {
    global: globalRun >= `${d}T05:00` || lastRun >= `${d}T05:00`,
    prices,
    daily: prices && !!inst && !inst._partial?.length && lastRun >= `${d}T17:00`,
  };
}

// 台北時間：美股收盤後抓國際行情；收盤行情約 14:30、法人約 16:00 公布（程式分別在 15:00、17:00 後才抓當天）
const STEPS = [
  { key: 'global', name: '國際行情', at: '05:40', until: '12:00', args: ['-f', 'global_only=true'] },
  { key: 'prices', name: '收盤行情', at: '15:05', until: '17:10', args: [] },
  { key: 'daily', name: '法人與完整資料', at: '17:10', until: '23:59', args: [] },
];

function dispatch(step) {
  log(`觸發「每日更新」：${step.name}`);
  if (DRY) return;
  execFileSync('gh', ['workflow', 'run', 'daily.yml', '--repo', REPO, '--ref', 'main', ...step.args], { stdio: 'inherit' });
}

// 測試：馬上觸發一次「只更新國際行情」，確認有權限觸發
if (process.env.FORCE_TEST) {
  dispatch(STEPS[0]);
  process.exit(0);
}

const dow = tpe().getUTCDay();
if (dow === 0 || dow === 6) {
  log('週末不用觸發');
  process.exit(0);
}
for (const step of STEPS) {
  const t = todayAt(step.at);
  if (now() > todayAt(step.until)) continue; // 時間已過，由後面的步驟一併處理
  if (status()[step.key]) {
    log(`${step.name}：今天已經更新過`);
    continue;
  }
  const wait = t - now();
  if (t > deadline) {
    log(`${step.name}要等到 ${step.at}，超過這次工作的時間上限，交給之後的排程`);
    break;
  }
  if (wait > 0) {
    log(`等到 ${step.at} 觸發${step.name}（約 ${Math.round(wait / 60e3)} 分鐘）`);
    await sleep(wait);
    if (status()[step.key]) {
      log(`${step.name}：等待期間已經更新過`);
      continue;
    }
  }
  dispatch(step);
}
log('結束');
