// 國際市場與原物料：代號清單、波動判斷、國際風險燈號、與台股產業的對應
// 不依賴 Node，伺服器、研究與瀏覽器共用

export const GROUPS = {
  us: '美股與恐慌指數',
  asia: '亞洲股市',
  fx: '匯率與利率',
  energy: '能源',
  metal: '金屬',
  agri: '農產品',
  freight: '運價與原物料綜合',
};

// late：在台股收盤之後才收盤（美國、歐洲、期貨），台股要隔天才反應
export const INSTRUMENTS = [
  { id: 'SOX', sym: '^SOX', name: '費城半導體', group: 'us', late: true },
  { id: 'NDX', sym: '^IXIC', name: '那斯達克', group: 'us', late: true },
  { id: 'SPX', sym: '^GSPC', name: 'S&P 500', group: 'us', late: true },
  { id: 'TSM', sym: 'TSM', name: '台積電 ADR', group: 'us', late: true },
  { id: 'VIX', sym: '^VIX', name: 'VIX 恐慌指數', group: 'us', late: true, kind: 'level' },
  { id: 'N225', sym: '^N225', name: '日經 225', group: 'asia' },
  { id: 'KOSPI', sym: '^KS11', name: '韓國綜合', group: 'asia' },
  { id: 'HSI', sym: '^HSI', name: '香港恆生', group: 'asia' },
  { id: 'SSE', sym: '000001.SS', name: '上證指數', group: 'asia' },
  { id: 'USDTWD', sym: 'TWD=X', name: '美元兌台幣', group: 'fx', late: true, note: '數字變大＝台幣貶值' },
  { id: 'DXY', sym: 'DX-Y.NYB', name: '美元指數', group: 'fx', late: true },
  { id: 'US10Y', sym: '^TNX', name: '美國 10 年公債殖利率', group: 'fx', late: true, kind: 'yield' },
  { id: 'WTI', sym: 'CL=F', name: 'WTI 原油', group: 'energy', late: true },
  { id: 'BRENT', sym: 'BZ=F', name: '布蘭特原油', group: 'energy', late: true },
  { id: 'NG', sym: 'NG=F', name: '天然氣', group: 'energy', late: true },
  { id: 'COPPER', sym: 'HG=F', name: '銅', group: 'metal', late: true },
  { id: 'ALU', sym: 'ALI=F', name: '鋁', group: 'metal', late: true },
  { id: 'HRC', sym: 'HRC=F', name: '熱軋鋼捲（美國）', group: 'metal', late: true },
  { id: 'IRON', sym: 'TIO=F', name: '鐵礦砂', group: 'metal', late: true },
  { id: 'GOLD', sym: 'GC=F', name: '黃金', group: 'metal', late: true },
  { id: 'SILVER', sym: 'SI=F', name: '白銀', group: 'metal', late: true },
  { id: 'SOY', sym: 'ZS=F', name: '黃豆', group: 'agri', late: true },
  { id: 'CORN', sym: 'ZC=F', name: '玉米', group: 'agri', late: true },
  { id: 'WHEAT', sym: 'ZW=F', name: '小麥', group: 'agri', late: true },
  { id: 'SUGAR', sym: 'SB=F', name: '原糖', group: 'agri', late: true },
  { id: 'COTTON', sym: 'CT=F', name: '棉花', group: 'agri', late: true },
  { id: 'BDRY', sym: 'BDRY', name: '散裝航運運價（BDRY）', group: 'freight', late: true },
  { id: 'DBC', sym: 'DBC', name: '原物料綜合（DBC）', group: 'freight', late: true },
];
export const BY_ID = Object.fromEntries(INSTRUMENTS.map((x) => [x.id, x]));

// 台股產業 ↔ 相關國際指標。dir：1＝上漲通常有利（產品報價、庫存利益），-1＝上漲代表成本增加，0＝影響要看情況
// 這是一般產業常識；實際連動程度以「策略績效」頁算出的過去 2 年相關係數為準
export const INDUSTRY_LINKS = {
  半導體業: [['SOX', 1, '全球半導體景氣'], ['TSM', 1, '台積電 ADR']],
  電子零組件業: [['NDX', 1, '美國科技股'], ['SOX', 1, '半導體景氣']],
  電腦及週邊設備業: [['NDX', 1, '美國科技股']],
  光電業: [['NDX', 1, '美國科技股']],
  通信網路業: [['NDX', 1, '美國科技股']],
  其他電子業: [['NDX', 1, '美國科技股']],
  電子通路業: [['SOX', 1, '半導體景氣']],
  數位雲端: [['NDX', 1, '美國科技股']],
  資訊服務業: [['NDX', 1, '美國科技股']],
  塑膠工業: [['WTI', 1, '油價帶動塑化報價'], ['BRENT', 1, '亞洲油價']],
  化學工業: [['WTI', 1, '油價帶動化學品報價'], ['NG', -1, '燃料成本']],
  橡膠工業: [['WTI', -1, '合成橡膠原料成本']],
  紡織纖維: [['WTI', 0, '化纖原料'], ['COTTON', 0, '棉花']],
  油電燃氣業: [['WTI', 0, '油品報價'], ['NG', -1, '燃料成本']],
  鋼鐵工業: [['HRC', 1, '鋼價'], ['IRON', -1, '原料成本']],
  電器電纜: [['COPPER', 1, '銅價（報價轉嫁、庫存利益）']],
  航運業: [['BDRY', 1, '散裝運價'], ['WTI', -1, '燃油成本']],
  食品工業: [['SOY', -1, '原料成本'], ['CORN', -1, '飼料原料'], ['WHEAT', -1, '麵粉原料'], ['SUGAR', -1, '原料成本']],
  農業科技: [['SOY', 0, '農產品價格'], ['CORN', 0, '農產品價格']],
  玻璃陶瓷: [['NG', -1, '燃料成本']],
  汽車工業: [['HRC', -1, '鋼材成本'], ['ALU', -1, '鋁材成本']],
  建材營造: [['HRC', -1, '鋼筋成本']],
  金融保險業: [['US10Y', 0, '利率'], ['USDTWD', 0, '匯率（壽險避險）']],
  金融業: [['US10Y', 0, '利率'], ['USDTWD', 0, '匯率']],
};

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const std = (a) => {
  if (a.length < 2) return null;
  const m = a.reduce((s, x) => s + x, 0) / a.length;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

/** 找出日期 ≤ ymd（strict 時 < ymd）的最後一筆位置 */
export function indexAt(d, ymd, strict = false) {
  let lo = 0;
  let hi = d.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (strict ? d[mid] < ymd : d[mid] <= ymd) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * 某個指標到第 end 筆為止的狀態
 * chg1/5/20/60：漲跌 %（殖利率是「基點」變化）；vol20：近 20 日年化波動 %；volPct：近 20 日波動在過去一年的百分位
 * z1：最後一天的漲跌是平常（前 60 日）幾個標準差
 */
export function seriesStats(s, kind, end = s.c.length - 1) {
  const c = s.c;
  const n = end + 1;
  if (n < 25) return null;
  const last = c[end];
  const isYield = kind === 'yield';
  const chg = (k) => (n > k ? (isYield ? (last - c[end - k]) * 100 : (last / c[end - k] - 1) * 100) : null);
  const ret = (i) => (isYield ? (c[i] - c[i - 1]) * 100 : Math.log(c[i] / c[i - 1]) * 100);
  const from = Math.max(1, end - 280);
  const r = [];
  for (let i = from; i <= end; i++) r.push(ret(i));
  const vols = [];
  for (let j = 20; j <= r.length; j++) vols.push(std(r.slice(j - 20, j)));
  const vol = vols.at(-1);
  const past = vols.slice(-250);
  const volPct = vol == null || past.length < 60 ? null : past.filter((v) => v <= vol).length / past.length;
  const sd60 = std(r.slice(-61, -1));
  const z1 = sd60 ? r.at(-1) / sd60 : null;
  let ma60 = null;
  if (n >= 60) {
    let sum = 0;
    for (let i = end - 59; i <= end; i++) sum += c[i];
    ma60 = sum / 60;
  }
  let high20 = -Infinity;
  for (let i = Math.max(0, end - 19); i <= end; i++) high20 = Math.max(high20, c[i]);
  const ch20 = chg(20);
  const trend = ma60 == null || ch20 == null ? 'side' : last > ma60 && ch20 > 0 ? 'up' : last < ma60 && ch20 < 0 ? 'down' : 'side';
  let volLevel = 'normal';
  if ((z1 != null && Math.abs(z1) >= 3) || (volPct != null && volPct >= 0.95)) volLevel = 'extreme';
  else if ((z1 != null && Math.abs(z1) >= 2) || (volPct != null && volPct >= 0.8)) volLevel = 'high';
  else if (volPct != null && volPct <= 0.2) volLevel = 'low';
  return {
    date: s.d[end],
    last: r2(last),
    chg1: r2(chg(1)),
    chg5: r2(chg(5)),
    chg20: r2(ch20),
    chg60: r2(chg(60)),
    vol20: vol == null ? null : r2(isYield ? vol : vol * Math.sqrt(252)),
    volPct: volPct == null ? null : Math.round(volPct * 100),
    z1: r2(z1),
    dd20: r2((last / high20 - 1) * 100),
    aboveMA60: ma60 == null ? null : last > ma60,
    trend,
    volLevel,
  };
}

// 燈號門檻（用 2 年資料看過：越嚴重的燈號，台股當天越容易跌、之後 5 天反彈越大）
export const MOOD_RULES = {
  vixPanic: 30,
  vixCaution: 22,
  sox1Panic: -5,
  sox1Caution: -3,
  sox5Panic: -10,
  sox5Caution: -6,
  spxDdPanic: -8,
  spx1Caution: -2,
  twd5Caution: 1.2,
  y10Caution: 25,
};

/**
 * 國際風險燈號：依費半、S&P 500、VIX、台幣、美債判斷 calm／caution／panic
 * @param {Record<string, object>} st 各指標的 seriesStats
 */
export function globalMood(st, R = MOOD_RULES) {
  const sox = st.SOX;
  const spx = st.SPX;
  const vix = st.VIX;
  const twd = st.USDTWD;
  const y10 = st.US10Y;
  if (!sox || !spx || !vix) return { level: 'unknown', reasons: ['國際行情資料不足'] };
  const panic = [];
  const caution = [];
  const f = (x, d = 1) => (x > 0 ? '+' : '') + x.toFixed(d);
  if (vix.last >= R.vixPanic) panic.push(`VIX ${vix.last.toFixed(1)}`);
  else if (vix.last >= R.vixCaution) caution.push(`VIX ${vix.last.toFixed(1)}`);
  if (vix.chg5 != null && vix.chg5 >= 40 && vix.last >= 18) caution.push(`VIX 5 日 ${f(vix.chg5, 0)}%`);
  if (sox.chg1 <= R.sox1Panic) panic.push(`費半前一日 ${f(sox.chg1)}%`);
  else if (sox.chg1 <= R.sox1Caution) caution.push(`費半前一日 ${f(sox.chg1)}%`);
  if (sox.chg5 != null && sox.chg5 <= R.sox5Panic) panic.push(`費半 5 日 ${f(sox.chg5)}%`);
  else if (sox.chg5 != null && sox.chg5 <= R.sox5Caution) caution.push(`費半 5 日 ${f(sox.chg5)}%`);
  if (spx.dd20 <= R.spxDdPanic) panic.push(`S&P 500 距 20 日高 ${f(spx.dd20)}%`);
  else if (spx.chg1 <= R.spx1Caution) caution.push(`S&P 500 前一日 ${f(spx.chg1)}%`);
  if (twd?.chg5 != null && twd.chg5 >= R.twd5Caution) caution.push(`台幣 5 日貶 ${twd.chg5.toFixed(1)}%`);
  if (y10?.chg5 != null && y10.chg5 >= R.y10Caution) caution.push(`美債殖利率 5 日 +${y10.chg5.toFixed(0)} 基點`);
  const level = panic.length ? 'panic' : caution.length ? 'caution' : 'calm';
  return { level, reasons: [...panic, ...caution], date: sox.date };
}

/**
 * 某一天「已知」的國際狀態（研究用）
 * strict=true：台股開盤前已知（美國、期貨只算到前一天）；false：台股收盤後到隔天開盤前已知
 */
export function statsAt(series, ymd, strict, ids = null) {
  const st = {};
  for (const ins of INSTRUMENTS) {
    if (ids && !ids.includes(ins.id)) continue;
    const s = series?.[ins.id];
    if (!s) continue;
    const j = indexAt(s.d, ymd, ins.late ? strict : false);
    if (j < 0) continue;
    const x = seriesStats(s, ins.kind, j);
    if (x) st[ins.id] = x;
  }
  return st;
}

/** 整理成畫面要用的資料：每個指標的狀態＋國際燈號 */
export function globalSummary(series) {
  const items = [];
  const st = {};
  for (const ins of INSTRUMENTS) {
    const s = series?.[ins.id];
    if (!s?.c?.length) continue;
    const x = seriesStats(s, ins.kind);
    if (!x) continue;
    st[ins.id] = x;
    items.push({ ...ins, ...x, spark: s.c.slice(-60) });
  }
  return { mood: globalMood(st), items, asOf: st.SOX?.date ?? items[0]?.date ?? null };
}

/** 某產業相關的國際指標與目前狀態 */
export function industryLinks(ind, summary) {
  const links = INDUSTRY_LINKS[ind] ?? [];
  const byId = Object.fromEntries((summary?.items ?? []).map((x) => [x.id, x]));
  return links.filter(([id]) => byId[id]).map(([id, dir, why]) => ({ ...byId[id], dir, why, spark: undefined }));
}
