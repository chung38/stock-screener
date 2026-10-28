import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { exec } from 'node:child_process';
import {
  PORT,
  APP_PASSWORD,
  CRON_ENABLED,
  CRON_DAILY,
  CRON_WEEKLY,
  DATA_DIR,
  TZ,
  AUTO_UPDATE_ON_START,
  OPEN_BROWSER,
} from './config.js';
import { runScreen, stockDetail, DEFAULTS } from './screener/screen.js';
import { runUpdate, runHoldersOnly, getStatus } from './jobs/update.js';
import { diagnose } from './jobs/diagnose.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// 選用：簡單密碼保護（部署在公開網址時建議設定 APP_PASSWORD）
if (APP_PASSWORD) {
  app.use((req, res, next) => {
    const h = req.headers.authorization ?? '';
    const [, b64] = h.split(' ');
    const pass = b64 ? Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':') : '';
    if (pass === APP_PASSWORD) return next();
    res.set('WWW-Authenticate', 'Basic realm="screener", charset="UTF-8"').status(401).send('需要密碼');
  });
}

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: e.message });
  });

app.get(
  '/api/screen',
  wrap(async (req, res) => res.json(await runScreen(req.query))),
);

app.get('/api/defaults', (req, res) => res.json(DEFAULTS));

app.get(
  '/api/stock/:code',
  wrap(async (req, res) => {
    const d = await stockDetail(req.params.code, req.query);
    if (!d) return res.status(404).json({ error: '找不到這檔股票的資料' });
    res.json(d);
  }),
);

app.get(
  '/api/status',
  wrap(async (req, res) => res.json(await getStatus())),
);

app.post(
  '/api/update',
  wrap(async (req, res) => {
    const backfill = !!req.body?.backfill;
    const status = await getStatus();
    if (status.job.running) return res.status(409).json({ error: '已經有更新在跑了', job: status.job });
    runUpdate({ backfill }).catch(() => {});
    res.json({ started: true, backfill });
  }),
);

let lastDiag = null;
app.post(
  '/api/diagnose',
  wrap(async (req, res) => {
    lastDiag = await diagnose();
    res.json(lastDiag);
  }),
);
app.get('/api/diagnose', (req, res) => res.json(lastDiag ?? { results: [] }));

// 前端（vite build 後的 dist）
const dist = path.resolve(__dirname, '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

if (CRON_ENABLED) {
  cron.schedule(CRON_DAILY, () => runUpdate().catch((e) => console.error('排程更新失敗', e.message)), { timezone: TZ });
  cron.schedule(CRON_WEEKLY, () => runHoldersOnly().catch((e) => console.error('集保更新失敗', e.message)), {
    timezone: TZ,
  });
}

app.listen(PORT, () => {
  console.log(`選股伺服器啟動：http://localhost:${PORT}`);
  console.log(`資料夾：${DATA_DIR}`);
  if (CRON_ENABLED) console.log(`自動更新：每日 ${CRON_DAILY}、集保 ${CRON_WEEKLY}（台北時間）`);

  if (OPEN_BROWSER) {
    const url = `http://localhost:${PORT}`;
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }

  // 一打開就順便更新：缺幾天補幾天；完全沒資料時會自動建立歷史資料
  if (AUTO_UPDATE_ON_START) {
    console.log('開始更新資料（網頁可以先用，更新完名單會自動刷新）');
    runUpdate()
      .then(() => console.log('資料更新完成'))
      .catch((e) => console.error('資料更新失敗：', e.message));
  }
});
