import { Spark } from './Mini.jsx';
import { fmtNum, fmtPct, tone, MOOD, fmtDate } from '../format.js';

export default function MarketBar({ market, asOf }) {
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
      <span className="mk-date">資料日 {fmtDate(asOf)}</span>
    </div>
  );
}
