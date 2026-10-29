// 股價還原權息與異常跳動偵測。伺服器、研究與瀏覽器共用（不依賴 Node）

// 台股漲跌幅限制 10%；還原權息後單日收盤變動仍超過 10.5%，代表減資、分割、新股上市等事件
export const JUMP = 0.105;

/**
 * 依除權息資料把歷史價格「往前」調整（最新價格不變）
 * @param {{d:string[],o:number[],h:number[],l:number[],c:number[]}} s 會直接修改這個序列
 * @param {Array<[string, number, number]>} events [除權息日 YYYYMMDD, 除權息前收盤價, 參考價]
 * @returns {number} 實際套用的事件數
 */
export function adjustSeries(s, events) {
  if (!events?.length || !s.c.length) return 0;
  const idx = new Map(s.d.map((d, i) => [d, i]));
  const factors = [];
  for (const [ymd, prev, ref] of events) {
    const j = idx.get(ymd);
    if (j == null || j === 0 || !(prev > 0) || !(ref > 0) || ref >= prev) continue;
    // 確認是同一個事件：除權息前收盤價要跟前一個交易日收盤接近
    if (Math.abs(s.c[j - 1] / prev - 1) > 0.02) continue;
    factors.push([j, ref / prev]);
  }
  if (!factors.length) return 0;
  factors.sort((a, b) => b[0] - a[0]);
  let f = 1;
  let k = 0;
  for (let i = s.c.length - 1; i >= 0; i--) {
    while (k < factors.length && factors[k][0] > i) f *= factors[k++][1];
    if (f !== 1) {
      s.o[i] *= f;
      s.h[i] *= f;
      s.l[i] *= f;
      s.c[i] *= f;
    }
  }
  return factors.length;
}

/** 每一天是不是異常跳動（和前一天收盤比） */
export const jumpFlags = (c) => c.map((x, i) => i > 0 && Math.abs(x / c[i - 1] - 1) > JUMP);

/** 最後一次異常跳動的位置，沒有則回傳 -1 */
export function lastJump(c) {
  for (let i = c.length - 1; i > 0; i--) if (Math.abs(c[i] / c[i - 1] - 1) > JUMP) return i;
  return -1;
}
