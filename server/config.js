import path from 'node:path';
import fs from 'node:fs';

// 讀取專案根目錄的 .env（已有的環境變數優先）
try {
  for (const line of fs.readFileSync(path.resolve('.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* 沒有 .env 就用預設值 */
}

export const PORT = Number(process.env.PORT || 3000);

// 所有累積的資料都存在這裡；部署時請掛在「不會被清掉」的磁碟上
export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');

// 首次回補要抓幾個交易日的股價（篩選 90 天足夠；突破策略回測建議 500 天，用 PRICE_DAYS=500 npm run backfill）
export const PRICE_DAYS = Number(process.env.PRICE_DAYS || 90);

// 法人買賣超回補天數（篩選只用近 5 日，多抓幾天方便看趨勢）
export const INST_DAYS = Number(process.env.INST_DAYS || 15);

// 設了就會要求瀏覽器帳密（帳號隨意，密碼 = APP_PASSWORD）
export const APP_PASSWORD = process.env.APP_PASSWORD || '';

// 每日自動更新（台北時間）。設 CRON_ENABLED=0 可關閉
export const CRON_ENABLED = process.env.CRON_ENABLED !== '0';
export const CRON_DAILY = process.env.CRON_DAILY || '40 17 * * 1-5';
export const CRON_WEEKLY = process.env.CRON_WEEKLY || '30 10 * * 6';
// 早上抓美股、原物料收盤（台股開盤前）
export const CRON_GLOBAL = process.env.CRON_GLOBAL || '20 7 * * 1-5';

// 啟動時自動更新資料（第一次會自動建立歷史資料）。設 0 關閉
export const AUTO_UPDATE_ON_START = process.env.AUTO_UPDATE_ON_START !== '0';

// 啟動後自動打開瀏覽器（啟動腳本會設成 1）
export const OPEN_BROWSER = process.env.OPEN_BROWSER === '1';

export const TZ = 'Asia/Taipei';
