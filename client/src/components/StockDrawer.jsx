import { useEffect, useState } from 'react';
import { getStock, getResearch } from '../api.js';
import { fmtChg, VolChip, TrendChip, corrLabel } from './GlobalView.jsx';
import PriceChart from './PriceChart.jsx';
import ResonanceRings from './ResonanceRings.jsx';
import { fmtNum, fmtPct, fmtLots, tone, deductLabel, quarterLabel, monthLabel, fmtShortDate } from '../format.js';

function Bars({ items, valueKey, labelKey, threshold, fmt = (v) => fmtNum(v, 0), unit = '' }) {
  const vals = items.map((x) => x[valueKey] ?? 0);
  const max = Math.max(...vals.map(Math.abs), threshold ?? 0, 1);
  return (
    <div className="bars">
      {items.map((x) => {
        const v = x[valueKey];
        const pass = threshold == null ? v > 0 : v > threshold;
        return (
          <div key={x[labelKey]} className="bar-col">
            <span className="num bv">
              {fmt(v)}
              {unit}
            </span>
            <span className="bar-track">
              <i
                className={`${pass ? 'pass' : 'fail'}${v < 0 ? ' neg' : ''}`}
                style={{ height: `${(Math.abs(v ?? 0) / max) * 100}%` }}
              />
              {threshold != null && <b className="thr" style={{ bottom: `${(threshold / max) * 100}%` }} />}
            </span>
            <span className="bl">{x.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function DeductRow({ name, d }) {
  const x = deductLabel(d);
  return (
    <tr>
      <th scope="row">{name}</th>
      <td className="num">{d ? fmtNum(d.next) : '—'}</td>
      <td className="num upcoming">{d ? d.upcoming.map((v) => fmtNum(v)).join('、') : '—'}</td>
      <td>
        <span className={`ded ${x.cls}`}>{x.text}</span>
      </td>
    </tr>
  );
}

function GlobalLinks({ ind, links }) {
  const [corr, setCorr] = useState(null);
  useEffect(() => {
    let alive = true;
    getResearch()
      .then((r) => alive && setCorr(r?.global?.links?.[ind]?.corr ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ind]);
  return (
    <section className="blk global">
      <h3>相關國際行情與原物料</h3>
      <table className="mini-table g-links">
        <tbody>
          {links.map((x) => {
            const cl = corrLabel(corr?.[x.id]);
            return (
              <tr key={x.id}>
                <th scope="row">
                  {x.name}
                  <small>
                    {x.why}｜{x.dir === 1 ? '上漲通常有利' : x.dir === -1 ? '上漲＝成本增加' : '影響不一定'}
                  </small>
                </th>
                <td className={`num ${tone(x.chg5)}`}>
                  5 日 {fmtChg(x.chg5, x.kind)}
                  <small className={tone(x.chg20)}>20 日 {fmtChg(x.chg20, x.kind)}</small>
                </td>
                <td>
                  <TrendChip t={x.trend} />
                  <VolChip x={x} />
                </td>
                <td className={cl.cls} title="過去 2 年產業平均股價和這個指標每週漲跌的相關係數">
                  {corr ? `連動${cl.text}` : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default function StockDrawer({ code, params, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    setD(null);
    setErr('');
    getStock(code, params)
      .then((x) => alive && setD(x))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [code, params]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const t = d?.tech;
  const pillars = d?.pillars;

  return (
    <aside className="drawer" aria-label={`${code} 明細`}>
      <div className="drawer-head">
        <div>
          <h2>
            <span className="num">{code}</span> {d?.info?.n}
          </h2>
          <p>
            {d?.info?.m === 'TPEX' ? '上櫃' : d?.info?.m === 'TWSE' ? '上市' : ''} {d?.info?.ind}
          </p>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          關閉
        </button>
      </div>

      {err && <div className="error">{err}</div>}
      {!d && !err && <div className="loading">讀取中…</div>}

      {d && (
        <div className="drawer-body">
          <ResonanceRings pillars={pillars} size={64} showLabels />

          {t?.ok ? <PriceChart chart={d.chart} /> : <p className="muted">{t?.reason}</p>}
          {t?.ok && (d.chart.adjusted || d.chart.cut) && (
            <p className="muted small chart-note">
              {d.chart.adjusted ? 'K 線已還原權息（除權息的跳空不算下跌，最新收盤不變）。' : ''}
              {d.chart.cut ? `${fmtShortDate(d.chart.cut)} 有減資、分割或剛上市，之前的價格無法比較，不列入計算。` : ''}
            </p>
          )}

          <section className="blk fund">
            <h3>營收年增率</h3>
            {d.rev.months?.length ? (
              <Bars
                items={d.rev.months.map((m) => ({ ...m, label: monthLabel(m.ym) }))}
                valueKey="yoy"
                labelKey="ym"
                threshold={d.rev.threshold}
                unit="%"
              />
            ) : (
              <p className="muted">沒有月營收資料</p>
            )}
            <h3>單季毛利率</h3>
            {d.gm.qs?.length ? (
              <Bars
                items={d.gm.qs.map((q) => ({ ...q, label: quarterLabel(q.k) }))}
                valueKey="gm"
                labelKey="k"
                fmt={(v) => fmtNum(v, 1)}
                unit="%"
              />
            ) : (
              <p className="muted">沒有毛利率資料（金融保險業不適用）</p>
            )}
          </section>

          <section className="blk chip">
            <h3>千張大戶持股</h3>
            {d.big.pts?.length ? (
              <table className="mini-table">
                <tbody>
                  {d.big.pts.map((p, i, arr) => {
                    const delta = i ? p.b - arr[i - 1].b : null;
                    return (
                      <tr key={p.d}>
                        <th scope="row" className="num">
                          {fmtShortDate(p.d)}
                        </th>
                        <td className="num">{fmtNum(p.b, 2)}%</td>
                        <td className={`num ${tone(delta)}`}>{delta == null ? '' : fmtPct(delta, 2)}</td>
                        <td className="num muted">散戶 {fmtNum(p.r, 1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="muted">集保資料不足</p>
            )}
            <h3>投信每日買賣超（張）</h3>
            {d.trust.daily?.length ? (
              <Bars
                items={d.trust.daily.map((v, i) => ({ v, k: i, label: '' }))}
                valueKey="v"
                labelKey="k"
                fmt={(v) => fmtLots(v)}
              />
            ) : (
              <p className="muted">沒有法人資料</p>
            )}
            <p className="muted small">
              近 {d.trust.days} 日投信合計 <b className={tone(d.trust.lots)}>{fmtLots(d.trust.lots)}</b> 張，外資合計{' '}
              <b className={tone(d.trust.foreignLots)}>{fmtLots(d.trust.foreignLots)}</b> 張
            </p>
          </section>

          {t?.ok && (
            <section className="blk tech">
              <h3>均線扣抵</h3>
              <table className="mini-table ded-table">
                <thead>
                  <tr>
                    <th />
                    <th>明天扣抵</th>
                    <th>接下來要扣</th>
                    <th>判讀</th>
                  </tr>
                </thead>
                <tbody>
                  <DeductRow name="週線 5 日" d={t.d5} />
                  <DeductRow name="月線 20 日" d={t.d20} />
                  <DeductRow name="季線 60 日" d={t.d60} />
                </tbody>
              </table>
              <ul className="checks">
                <li className={t.trendUp ? 'ok' : ''}>
                  趨勢向上：站上{t.keyMA === 60 ? '季線' : '月線'}且均線上彎
                </li>
                <li className={t.held ? 'ok' : ''}>回測{t.keyMA === 60 ? '季線' : '月線'}不破{t.touched && !t.held ? '（有回測但收盤跌破或尚未轉強）' : ''}</li>
                <li className={t.breakout ? 'ok' : ''}>量增突破 20 日高點</li>
              </ul>
              <p className="muted small">
                月線乖離 {fmtPct(t.bias20)}、RSI(6) {fmtNum(t.rsi6, 0)}、20 日均量 {fmtNum(t.volLots, 0)} 張
              </p>
            </section>
          )}

          {d.links?.length > 0 && <GlobalLinks ind={d.info?.ind} links={d.links} />}
        </div>
      )}
    </aside>
  );
}
