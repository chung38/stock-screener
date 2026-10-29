import { Spark } from './Mini.jsx';
import { fmtNum, fmtPct, tone, MOOD, fmtDate } from '../format.js';
import { GMOOD } from './GlobalView.jsx';

export default function MarketBar({ market, global, asOf, onGlobal }) {
  const g = global?.mood && GMOOD[global.mood.level];
  if (!market || market.level === 'unknown') {
    return <div className="market muted">{market?.reason ?? '尚無大盤資料'}</div>;
  }
  const mood = MOOD[market.level] ?? MOOD.unknown;
  return (
    <div className="market">
      <div className="mk-index">
        <span className="mk-name">加權指數</span>
        <span className="num mk-close">{fmtNum(market.close, 0)}</span>
        <span className={`num ${tone(market.day)}`}>{fmtPct(market.day, 2)}</span>
      </div>
      <Spark values={market.spark ?? []} width={96} height={26} className={tone(market.d5)} />
      <div className={`mood ${mood.cls}`} title={market.reasons?.join('、') || '單日、5 日與距 20 日高點跌幅都在正常範圍'}>
        {mood.label}
      </div>
      {g && global.mood.level !== 'unknown' && (
        <button
          type="button"
          className={`mood ${g.cls} mood-btn`}
          title={global.mood.reasons?.join('、') || '費半、美股、VIX、台幣、美債都在正常範圍'}
          onClick={onGlobal}
        >
          {g.label}
        </button>
      )}
      <span className="mk-date">資料日 {fmtDate(asOf)}</span>
    </div>
  );
}
