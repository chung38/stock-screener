import { Spark } from './Mini.jsx';
import { fmtNum, fmtPct, tone, MOOD, fmtDate } from '../format.js';
import { GMOOD } from './GlobalView.jsx';

// 台北時間的今天與現在幾點（瀏覽器在哪個時區都一樣）
function tpeNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return { ymd: `${p.year}${p.month}${p.day}`, hour: Number(p.hour) % 24, weekend: p.weekday === 'Sat' || p.weekday === 'Sun' };
}

export default function MarketBar({ market, global, asOf, onGlobal }) {
  const now = tpeNow();
  // 平日晚上 7 點後資料日還不是今天：休市，或 GitHub 排程延遲
  const stale = asOf && asOf < now.ymd && !now.weekend && now.hour >= 19;
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
      <span className="mk-date">
        資料日 {fmtDate(asOf)}
        {stale && (
          <em className="stale" title="今天休市，或 GitHub 的排程延遲（通常幾小時內會自動補上；也可以到 GitHub Actions 手動執行「每日更新」）">
            今天的資料還沒進來
          </em>
        )}
      </span>
    </div>
  );
}
