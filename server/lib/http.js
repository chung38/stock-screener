// 對外連線：每個網站各自排隊、保持間隔，避免被證交所／櫃買／觀測站封鎖
import iconv from 'iconv-lite';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// 同一網站兩次請求的最小間隔（毫秒）。證交所 5 秒內超過 3 次會被暫時封鎖
const GAPS = {
  'www.twse.com.tw': 3500,
  'openapi.twse.com.tw': 1000,
  'www.tpex.org.tw': 2000,
  'mopsov.twse.com.tw': 4000,
  'opendata.tdcc.com.tw': 1000,
  'www.tdcc.com.tw': 2500,
  'query1.finance.yahoo.com': 700,
  'query2.finance.yahoo.com': 700,
};

const hosts = new Map();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitTurn(host) {
  const gap = GAPS[host] ?? 1500;
  let st = hosts.get(host);
  if (!st) {
    st = { last: 0, chain: Promise.resolve() };
    hosts.set(host, st);
  }
  const turn = st.chain.then(async () => {
    const wait = st.last + gap - Date.now();
    if (wait > 0) await sleep(wait);
    st.last = Date.now();
  });
  st.chain = turn.catch(() => {});
  return turn;
}

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}：${url}`);
    this.status = status;
  }
}

/**
 * @param {string} url
 * @param {{method?:string, headers?:object, body?:any, encoding?:string, retries?:number, timeout?:number, raw?:boolean}} opts
 *   encoding：'cp950' 之類，用來解 Big5 網頁
 *   raw：回傳 { text, res } 以便讀取 set-cookie
 */
export async function request(url, opts = {}) {
  const { method = 'GET', headers = {}, body, encoding, retries = 2, timeout = 30000, raw = false } = opts;
  const host = new URL(url).host;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await waitTurn(host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': UA,
          Accept: 'application/json, text/html, text/csv, */*',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.6',
          ...headers,
        },
        body,
        signal: ctrl.signal,
        redirect: 'follow',
      });
      const buf = Buffer.from(await res.arrayBuffer());
      if (!res.ok) throw new HttpError(res.status, url);
      const text = encoding ? iconv.decode(buf, encoding) : buf.toString('utf8');
      return raw ? { text, res } : text;
    } catch (e) {
      lastErr = e.name === 'AbortError' ? new Error(`逾時：${url}`) : e;
      // 4xx（429 除外）重試也沒用
      if (e.status && e.status < 500 && e.status !== 429) break;
      if (attempt < retries) await sleep(3000 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export async function getJSON(url, opts) {
  const text = await request(url, opts);
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    const hint = /安全性|SECURITY/i.test(text) ? '（被網站安全機制擋下，請放慢速度或改用台灣 IP）' : '';
    throw new Error(`回應不是 JSON${hint}：${url} → ${text.slice(0, 100).replace(/\s+/g, ' ')}`);
  }
}
