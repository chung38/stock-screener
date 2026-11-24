// 部位計算（伺服器測試與瀏覽器共用，不依賴 Node）
// 每筆該買多少：依「總資金 × 每筆願意虧的 %」和停損距離回推股數（構想參考 tradermonty/claude-trading-skills 的 position-sizer）
const FEE = 0.001425; // 手續費（買、賣各一次）
const TAX = 0.003; // 證交稅（賣出）

// 台股升降單位
export function tick(p) {
  if (p < 10) return 0.01;
  if (p < 50) return 0.05;
  if (p < 100) return 0.1;
  if (p < 500) return 0.5;
  if (p < 1000) return 1;
  return 5;
}
const floorTick = (p) => {
  const t = tick(p);
  return Math.round(Math.floor(p / t + 1e-9) * t * 100) / 100;
};

/** 預設停損：站上月線→月線下 1%；否則→近 5 日低點再下 3%；太近或算不出來→ −8% */
export function defaultStop(t) {
  if (!t?.close) return null;
  let s = t.close > t.ma20 && t.ma20 ? t.ma20 * 0.99 : t.low5 ? t.low5 * 0.97 : null;
  if (!s || s >= t.close * 0.995 || s < t.close * 0.7) s = t.close * 0.92;
  return floorTick(s);
}

/**
 * @returns 可買股數與相關金額。perShareLoss 含買進手續費、停損賣出的手續費與證交稅
 */
export function sizePosition({ capital, riskPct, maxPct, entry, stop, scale = 1 }) {
  if (!(capital > 0) || !(entry > 0) || !(stop > 0)) return { error: '請填寫資金、進場價與停損價' };
  if (stop >= entry) return { error: '停損價要低於進場價' };
  const risk = capital * (riskPct / 100) * scale;
  const perShareLoss = entry - stop + entry * FEE + stop * (FEE + TAX);
  const byRisk = Math.floor(risk / perShareLoss);
  const byCap = Math.floor((capital * (maxPct / 100)) / (entry * (1 + FEE)));
  const shares = Math.max(0, Math.min(byRisk, byCap));
  return {
    shares,
    lots: Math.floor(shares / 1000),
    odd: shares % 1000,
    capped: byCap < byRisk,
    invest: shares * entry * (1 + FEE),
    loss: shares * perShareLoss,
    risk,
    stopPct: (stop / entry - 1) * 100,
  };
}

