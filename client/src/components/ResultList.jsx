import ResonanceRings from './ResonanceRings.jsx';
import { YoyBars, Spark, TrustDots } from './Mini.jsx';
import { fmtNum, fmtPct, fmtLots, tone, deductLabel, quarterLabel } from '../format.js';

const SIGNAL = {
  swing: { text: '波段進場', cls: 'sig-swing', tip: '趨勢向上，且回測關鍵均線不破' },
  breakout: { text: '量增突破', cls: 'sig-break', tip: '收盤創 20 日新高，量大於 1.5 倍均量' },
};

function Signal({ row }) {
  if (row.entry) {
    const s = SIGNAL[row.entry];
    return (
      <span className={`sig ${s.cls}`} title={s.tip}>
        {s.text}
      </span>
    );
  }
  if (row.tech.trendUp) return <span className="sig sig-trend" title="趨勢向上，等回測關鍵均線再考慮">趨勢向上</span>;
  return <span className="sig sig-wait" title="技術面還沒轉強">觀察</span>;
}

function Deduct({ label, d }) {
  const x = deductLabel(d);
  return (
    <span className={`ded ${x.cls}`} title={`${label}：${x.tip}`}>
      <em>{label}</em>
      {x.text}
    </span>
  );
}

export default function ResultList({ rows, threshold, onPick, selected, empty }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="grid-table" role="table" aria-label="共振名單">
      <div className="gt-row gt-head" role="row">
        <span role="columnheader">共振</span>
        <span role="columnheader">股票</span>
        <span role="columnheader" className="r">收盤</span>
        <span role="columnheader">營收年增 %</span>
        <span role="columnheader">單季毛利率</span>
        <span role="columnheader" className="r">千張大戶</span>
        <span role="columnheader" className="r">投信買超</span>
        <span role="columnheader">均線扣抵</span>
        <span role="columnheader">訊號</span>
        <span role="columnheader" className="r">分數</span>
      </div>
      {rows.map((row) => {
        const gmVals = row.gm.qs?.map((q) => q.gm) ?? [];
        const lastGm = row.gm.qs?.at(-1);
        return (
          <button
            type="button"
            key={row.code}
            role="row"
            className={`gt-row${selected === row.code ? ' sel' : ''}`}
            onClick={() => onPick(row.code)}
          >
            <span className="c-rings" role="cell">
              <ResonanceRings pillars={row.pillars} size={30} />
            </span>
            <span className="c-name" role="cell">
              <b className="num">{row.code}</b>
              <span className="nm">{row.n}</span>
              <small>
                {row.m === 'TPEX' ? '上櫃' : '上市'}
                {row.ind ? ` ${row.ind}` : ''}
              </small>
            </span>
            <span className="c-price r" role="cell">
              <b className="num">{fmtNum(row.tech.close)}</b>
              <small className={`num ${tone(row.tech.chg)}`}>{fmtPct(row.tech.chg, 2)}</small>
            </span>
            <span className="c-rev" role="cell">
              <YoyBars months={row.rev.months} threshold={threshold} />
            </span>
            <span className={`c-gm${row.gm.pass ? ' pass' : ''}`} role="cell">
              <Spark values={gmVals} width={52} height={20} />
              <span className="num">
                {fmtNum(lastGm?.gm, 1)}%<small>{quarterLabel(lastGm?.k)}</small>
              </span>
            </span>
            <span className="c-big r" role="cell">
              {row.big.status === 'ok' ? (
                <>
                  <b className="num">{fmtNum(row.big.latest, 1)}%</b>
                  <small className={`num ${tone(row.big.delta)}`}>{fmtPct(row.big.delta, 2)}</small>
                </>
              ) : (
                <small className="muted">資料不足</small>
              )}
            </span>
            <span className="c-trust r" role="cell">
              {row.trust.status !== 'nodata' ? (
                <>
                  <b className={`num ${tone(row.trust.lots)}`}>{fmtLots(row.trust.lots)}</b>
                  <TrustDots daily={row.trust.daily} />
                </>
              ) : (
                <small className="muted">資料不足</small>
              )}
            </span>
            <span className="c-ded" role="cell">
              <Deduct label="週" d={row.tech.d5} />
              <Deduct label="月" d={row.tech.d20} />
            </span>
            <span className="c-sig" role="cell">
              <Signal row={row} />
            </span>
            <span className="c-score r num" role="cell">
              {fmtNum(row.score, 0)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
