import { useEffect, useState } from 'react';
import { fmtNum, fmtPct } from '../format.js';

import { tick, defaultStop, sizePosition } from '../../../server/screener/sizing.js';

const LS = 'position-sizer-v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(LS)) ?? {};
  } catch {
    return {};
  }
}

export default function PositionSizer({ tech, posture }) {
  const saved = load();
  const [capital, setCapital] = useState(saved.capital ?? 1000000);
  const [riskPct, setRiskPct] = useState(saved.riskPct ?? 1);
  const [maxPct, setMaxPct] = useState(saved.maxPct ?? 20);
  const [follow, setFollow] = useState(saved.follow ?? true);
  const [entry, setEntry] = useState(tech.close);
  const [stop, setStop] = useState(defaultStop(tech));

  useEffect(() => {
    try {
      localStorage.setItem(LS, JSON.stringify({ capital, riskPct, maxPct, follow }));
    } catch {
      /* 存不了就算了，只影響下次的預設值 */
    }
  }, [capital, riskPct, maxPct, follow]);

  const scale = follow && posture ? posture.cap / 100 : 1;
  const r = sizePosition({ capital: Number(capital), riskPct: Number(riskPct), maxPct: Number(maxPct), entry: Number(entry), stop: Number(stop), scale });
  const num = (set) => (e) => set(e.target.value === '' ? '' : Number(e.target.value));

  return (
    <section className="blk sizer">
      <h3>該買多少</h3>
      <div className="sizer-grid">
        <label>
          總資金（元）
          <input type="number" inputMode="numeric" min="0" step="10000" value={capital} onChange={num(setCapital)} />
        </label>
        <label>
          每筆最多虧（% 資金）
          <input type="number" inputMode="decimal" min="0.1" max="10" step="0.1" value={riskPct} onChange={num(setRiskPct)} />
        </label>
        <label>
          進場價
          <input type="number" inputMode="decimal" min="0" step={tick(Number(entry) || 1)} value={entry} onChange={num(setEntry)} />
        </label>
        <label>
          停損價
          <input type="number" inputMode="decimal" min="0" step={tick(Number(stop) || 1)} value={stop} onChange={num(setStop)} />
        </label>
        <label>
          單檔最多占（% 資金）
          <input type="number" inputMode="decimal" min="1" max="100" step="1" value={maxPct} onChange={num(setMaxPct)} />
        </label>
        {posture && (
          <label className="check">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            依建議持股水位調整（目前 {posture.cap}%）
          </label>
        )}
      </div>
      {r.error ? (
        <p className="error small">{r.error}</p>
      ) : (
        <div className="sizer-out">
          <p className="sizer-main">
            {r.shares === 0 ? (
              <>可買 0 股：停損太遠或資金太少，連 1 股的風險都超過上限</>
            ) : r.lots === 0 ? (
              <>
                可買 <b className="num">{fmtNum(r.odd, 0)}</b> 股<small>（不到 1 張，用零股）</small>
              </>
            ) : (
              <>
                可買 <b className="num">{fmtNum(r.lots, 0)}</b> 張
                {r.odd > 0 && (
                  <>
                    {' '}
                    <b className="num">{fmtNum(r.odd, 0)}</b> 股
                  </>
                )}
                <small>（共 {fmtNum(r.shares, 0)} 股）</small>
              </>
            )}
          </p>
          <dl className="sizer-dl">
            <div>
              <dt>投入金額</dt>
              <dd className="num">
                {fmtNum(r.invest, 0)} 元（{fmtNum((r.invest / capital) * 100, 1)}%）
              </dd>
            </div>
            <div>
              <dt>跌到停損約虧</dt>
              <dd className="num down">
                {fmtNum(r.loss, 0)} 元（{fmtNum((r.loss / capital) * 100, 2)}%）
              </dd>
            </div>
            <div>
              <dt>停損距離</dt>
              <dd className="num">{fmtPct(r.stopPct, 1)}</dd>
            </div>
          </dl>
          {r.capped && <p className="muted small">已依「單檔最多占 {maxPct}%」減少股數；照風險原本可以買更多。</p>}
          {scale < 1 && (
            <p className="muted small">
              市場廣度偏低，每筆風險已乘上 {posture.cap}%（{fmtNum(Number(riskPct) * scale, 2)}% 資金）。
            </p>
          )}
        </div>
      )}
      <p className="muted small">
        預設停損：站上月線時用月線下 1%，否則用近 5 日低點再下 3%。已含手續費 0.1425%（買賣各一次）與證交稅 0.3%，沒算滑價；跳空跌破停損時會虧得比這裡多。
      </p>
    </section>
  );
}
