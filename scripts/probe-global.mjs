// 暫時性：在 GitHub Actions 上測試國際行情資料來源（測完會刪除）
import fs from 'node:fs/promises';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
    const text = await r.text();
    return { status: r.status, ms: Date.now() - t0, text };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, text: String(e) };
  }
}
const out = { at: new Date().toISOString(), yahoo: {}, yahoo2: {}, fred: {}, stooq: {} };
const Y = ['^GSPC', '^IXIC', '^SOX', '^DJI', '^VIX', '^N225', '^KS11', '^HSI', '000001.SS', '^TWII', 'TWD=X', 'DX-Y.NYB', '^TNX',
  'CL=F', 'BZ=F', 'NG=F', 'HG=F', 'ALI=F', 'GC=F', 'SI=F', 'HRC=F', 'TIO=F', 'ZS=F', 'ZC=F', 'ZW=F', 'SB=F', 'CT=F', 'BDRY', 'DBC', 'SOXX', 'EWT', 'TSM'];
for (const s of Y) {
  const r = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=2y&interval=1d`);
  let info = { status: r.status, ms: r.ms };
  try {
    const j = JSON.parse(r.text);
    const res = j.chart?.result?.[0];
    if (res) {
      const ts = res.timestamp ?? [];
      const c = res.indicators?.quote?.[0]?.close ?? [];
      info.n = ts.length;
      info.first = ts[0] && new Date(ts[0] * 1000).toISOString().slice(0, 10);
      info.last = ts.at(-1) && new Date(ts.at(-1) * 1000).toISOString().slice(0, 10);
      info.lastClose = c.at(-1);
      info.nulls = c.filter((x) => x == null).length;
      info.tz = res.meta?.exchangeTimezoneName;
      info.name = res.meta?.shortName ?? res.meta?.longName;
      info.currency = res.meta?.currency;
    } else info.err = JSON.stringify(j.chart?.error ?? j).slice(0, 200);
  } catch {
    info.err = r.text.slice(0, 200);
  }
  out.yahoo[s] = info;
  await sleep(700);
}
// query2 一筆確認備援主機
{
  const r = await get('https://query2.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d');
  out.yahoo2 = { status: r.status, sample: r.text.slice(0, 150) };
}
for (const id of ['VIXCLS', 'SP500', 'NASDAQCOM', 'DCOILWTICO', 'DCOILBRENTEU', 'DEXTAUS', 'DGS10', 'DTWEXBGS', 'DHHNGSP', 'PCOPPUSDM']) {
  const r = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
  const lines = r.text.trim().split(/\r?\n/);
  out.fred[id] = { status: r.status, ms: r.ms, n: lines.length, head: lines[0]?.slice(0, 80), last: lines.at(-1)?.slice(0, 80) };
  await sleep(500);
}
for (const s of ['^spx', '^ndq', '^sox', 'cl.f', 'hg.f', 'gc.f', 'usdtwd']) {
  const r = await get(`https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`);
  const lines = r.text.trim().split(/\r?\n/);
  out.stooq[s] = { status: r.status, n: lines.length, head: lines[0]?.slice(0, 80), last: lines.at(-1)?.slice(0, 80) };
  await sleep(500);
}
await fs.mkdir('data', { recursive: true });
await fs.writeFile('data/probe-global.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
