import { useEffect, useRef, useState } from 'react';
import { fmtNum, fmtPct, fmtShortDate, fmtDate, tone } from '../format.js';
import { EXPOSURE_RULE } from '../../../server/screener/breadth.js';

// 區間 → 顏色（沿用大盤燈號的配色：平穩／警戒／恐慌）
export const ZONE_CLS = { strong: 'calm', healthy: 'calm', neutral: 'calm', weak: 'caution', critical: 'panic' };

const H1 = 170;
const H2 = 70;
const PAD = { l: 34, r: 10, t: 10, b: 18 };

/** 廣度分數（上）與加權指數（下）兩張小圖，共用時間軸；滑過顯示當天數值 */
function BreadthChart({ s }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const box = useRef(null);
  // 依容器寬度畫圖，文字大小才不會跟著放大縮小
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = s.d.length;
  const x = (i) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r);
  const y1 = (v) => PAD.t + (1 - v / 100) * (H1 - PAD.t - PAD.b);
  const txs = s.tx.filter((v) => v != null);
  const tMin = Math.min(...txs);
  const tMax = Math.max(...txs);
  const y2 = (v) => 6 + (1 - (v - tMin) / (tMax - tMin || 1)) * (H2 - 18);
  const path = (vals, y) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const months = [];
  for (let i = 1; i < n; i++) if (s.d[i].slice(4, 6) !== s.d[i - 1].slice(4, 6)) months.push(i);
  const every = W < 520 ? 2 : 1; // 手機上隔月標示
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  const h = hover != null ? hover : null;
  return (
    <div className="br-chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg ref={ref} width={W} height={H1 + H2} viewBox={`0 0 ${W} ${H1 + H2}`} role="img" aria-label="市場廣度分數與加權指數走勢" onPointerMove={onMove}>
        {/* 區間底色：< 20 危險、20～40 轉弱 */}
        <rect x={PAD.l} y={y1(20)} width={W - PAD.l - PAD.r} height={y1(0) - y1(20)} className="br-band panic" />
        <rect x={PAD.l} y={y1(40)} width={W - PAD.l - PAD.r} height={y1(20) - y1(40)} className="br-band caution" />
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y1(v)} y2={y1(v)} className="br-grid" />
            <text x={PAD.l - 6} y={y1(v) + 4} className="br-tick" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <text x={PAD.l + 6} y={y1(20) - 4} className="br-band-label">
          轉弱 20～40
        </text>
        <text x={PAD.l + 6} y={y1(0) - 4} className="br-band-label">
          危險 &lt; 20
        </text>
        {months.map((i) => (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={PAD.t} y2={H1 + H2 - 14} className="br-month" />
            {months.indexOf(i) % every === 0 && (
              <text x={x(i) + 3} y={H1 + H2 - 3} className="br-tick">
                {Number(s.d[i].slice(4, 6))} 月
              </text>
            )}
          </g>
        ))}
        <path d={path(s.score, y1)} className="br-line" />
        <g transform={`translate(0 ${H1})`}>
          <text x={PAD.l - 6} y={14} className="br-tick" textAnchor="end">
            加權
          </text>
          <path d={path(s.tx, y2)} className="br-line tx" />
        </g>
        {h != null && (
          <g>
            <line x1={x(h)} x2={x(h)} y1={PAD.t} y2={H1 + H2 - 14} className="br-cross" />
            {s.score[h] != null && <circle cx={x(h)} cy={y1(s.score[h])} r="4" className="br-dot" />}
          </g>
        )}
      </svg>
      {h != null && (
        <div className="br-tip" style={{ left: `${Math.min(80, Math.max(2, (x(h) / W) * 100 - 10))}%` }}>
          <b>{fmtDate(s.d[h])}</b>
          <span>廣度 {s.score[h] == null ? '—' : fmtNum(s.score[h], 0)}</span>
          <span>站上季線 {s.p60[h] == null ? '—' : `${fmtNum(s.p60[h], 0)}%`}</span>
          <span>加權 {s.tx[h] == null ? '—' : fmtNum(s.tx[h], 0)}</span>
        </div>
      )}
    </div>
  );
}

function Meter({ value }) {
  return (
    <span className="br-meter" aria-hidden="true">
      <i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </span>
  );
}

/** 建議持股水位 */
export function PostureCard({ b, research }) {
  const p = b.posture;
  const t = research?.timing;
  const always = t?.find((x) => x.label === '一直持有');
  const graded = t?.find((x) => x.label.includes('持有一半'));
  const crit = research?.zones?.find((z) => z.id === 'critical');
  return (
    <section className={`panic-banner posture ${ZONE_CLS[b.zone] ?? 'calm'}`}>
      <div>
        <h2>
          建議整體持股：{p.cap === 100 ? '正常' : `最多 ${p.cap}%`}
          <small>（{p.label}）</small>
        </h2>
        <p>
          台股市場廣度 {fmtNum(b.score, 0)} 分（{b.label}）
          {b.change5 != null && `，5 日 ${b.change5 > 0 ? '+' : ''}${fmtNum(b.change5, 1)}`}。只有 {fmtNum(b.raw.p60, 0)}% 的股票站上季線。
        </p>
        <ul className="rule-list">
          {EXPOSURE_RULE.map((r, i) => {
            const hi = i === 0 ? null : EXPOSURE_RULE[i - 1].min;
            const on = b.score >= r.min && (hi == null || b.score < hi);
            return (
              <li key={r.min} className={on ? 'on' : ''}>
                廣度 {hi == null ? `≥ ${r.min}` : r.min === 0 ? `< ${hi}` : `${r.min}～${hi}`}：{r.label}
              </li>
            );
          })}
        </ul>
        {always && graded && (
          <p className="small">
            回測（{fmtDate(research.from)} 起，等權持有一般股票）：一直滿倉年化 {fmtPct(always.cagr, 1)}、最大回撤 {fmtPct(always.mdd, 0)}；照上面分級
            年化 {fmtPct(graded.cagr, 1)}、最大回撤 {fmtPct(graded.mdd, 0)}。
          </p>
        )}
        {b.zone === 'critical' && crit?.tx20?.n > 0 && (
          <p className="small">
            過去 {crit.episodes} 次廣度跌到 20 以下，之後 20 個交易日加權指數平均 {fmtPct(crit.tx20.avg, 1)}（樣本很少）。分級規則是等廣度回到 20
            以上，再加回到一半持股。
          </p>
        )}
      </div>
    </section>
  );
}

export default function BreadthPanel({ b, research, strategies }) {
  return (
    <section className="card">
      <h2>台股市場廣度</h2>
      <p className="muted small">
        有多少股票參與漲勢：全部上市櫃普通股（股價 5 元以上、20 日均量 50 張以上，共 {fmtNum(b.raw.n, 0)} 檔），股價已還原權息。資料日{' '}
        {fmtShortDate(b.date)}。
      </p>
      <div className="br-head">
        <div className={`br-score ${ZONE_CLS[b.zone]}`}>
          <b>{fmtNum(b.score, 0)}</b>
          <span>{b.label}</span>
        </div>
        <ul className="br-parts">
          {b.parts.map((x) => (
            <li key={x.key}>
              <span>
                {x.label}
                <small>權重 {Math.round(x.w * 100)}%</small>
              </span>
              <Meter value={x.value} />
              <em className="num">{x.key === 'c4' ? `${fmtNum(b.raw.adv10 * 100, 0)}%` : x.key === 'c5' ? `${b.raw.hl10 > 0 ? '+' : ''}${fmtNum(b.raw.hl10, 1)}%` : `${fmtNum(x.value, 0)}%`}</em>
            </li>
          ))}
        </ul>
      </div>
      <p className="small">
        最近一天：上漲 {fmtNum(b.raw.adv, 0)} 家、下跌 {fmtNum(b.raw.dec, 0)} 家；創 60 日新高 {fmtNum(b.raw.nh, 0)} 家、新低 {fmtNum(b.raw.nl, 0)} 家。
      </p>
      {b.series?.d?.length > 20 && <BreadthChart s={b.series} />}
      <p className="muted small">
        綜合分數＝各項加權平均（上漲家數比例 35%～65% 對應 0～100 分，創新高減新低 −10%～+10% 對應 0～100 分）。構想參考開源專案
        tradermonty/claude-trading-skills 的市場廣度與持股水位技能，指標與門檻改用台股資料重算、回測。
      </p>
      {research && <BreadthResearch r={research} strategies={strategies} />}
    </section>
  );
}

function Agg({ a }) {
  if (!a?.n) return <td colSpan={2} className="muted">—</td>;
  return (
    <>
      <td className={`num ${tone(a.avg)}`}>{fmtPct(a.avg, 2)}</td>
      <td className="num">{fmtNum(a.up, 0)}%</td>
    </>
  );
}

const HOLD = { H1: '當沖', H3: '3 天', H5: '5 天', H10: '10 天' };

function StrategyByBreadth({ list, th }) {
  const rows = list.filter((x) => x.byBreadth && (x.group === 'ours' || /投信|三條件|漲停/.test(x.name)));
  if (!rows.length) return null;
  return (
    <>
      <h4>各策略在廣度高／低時的表現</h4>
      <div className="table-scroll">
        <table className="bt-table research-table">
          <thead>
            <tr>
              <th rowSpan={2}>方法</th>
              <th rowSpan={2}>持有</th>
              <th colSpan={2}>每筆平均（扣成本）</th>
              <th colSpan={3}>帳戶年化（最多 10 檔）</th>
              <th colSpan={3}>最大回撤</th>
            </tr>
            <tr>
              <th>廣度 ≥ {th}</th>
              <th>&lt; {th}</th>
              <th>全部照做</th>
              <th>只在 ≥ {th}</th>
              <th>只在 &lt; {th}</th>
              <th>全部</th>
              <th>≥ {th}</th>
              <th>&lt; {th}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const B = x.byBreadth;
              return (
                <tr key={x.id}>
                  <th scope="row">{x.name}</th>
                  <td>{HOLD[x.exit] ?? x.exit}</td>
                  <td className={`num ${tone(B.hi.avg)}`} title={`${B.hi.n} 筆`}>
                    {fmtPct(B.hi.avg, 2)}
                  </td>
                  <td className={`num ${tone(B.lo.avg)}`} title={`${B.lo.n} 筆`}>
                    {fmtPct(B.lo.avg, 2)}
                  </td>
                  <td className={`num ${tone(B.pfAll.cagr)}`}>{fmtPct(B.pfAll.cagr, 1)}</td>
                  <td className={`num ${tone(B.pfHi.cagr)}`}>{fmtPct(B.pfHi.cagr, 1)}</td>
                  <td className={`num ${tone(B.pfLo.cagr)}`}>{fmtPct(B.pfLo.cagr, 1)}</td>
                  <td className="num down">{fmtPct(B.pfAll.mdd, 0)}</td>
                  <td className="num down">{fmtPct(B.pfHi.mdd, 0)}</td>
                  <td className="num down">{fmtPct(B.pfLo.mdd, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        同一段期間（有廣度分數之後）比較。滑過每筆平均可看筆數；廣度低的筆數通常少很多，差異可能只是少數幾次行情造成的。
      </p>
    </>
  );
}

function BreadthResearch({ r, strategies }) {
  return (
    <>
      <h3>用台股資料驗證</h3>
      <p className="muted small">
        {fmtDate(r.from)} 起每天收盤算分數，看之後的表現。「段數」＝相隔超過 10 個交易日才算新的一段。
      </p>
      <div className="table-scroll">
        <table className="bt-table research-table">
          <thead>
            <tr>
              <th rowSpan={2}>廣度區間</th>
              <th rowSpan={2}>天數</th>
              <th rowSpan={2}>段數</th>
              <th colSpan={2}>加權 之後 5 天</th>
              <th colSpan={2}>加權 之後 20 天</th>
              <th colSpan={2}>等權 之後 20 天</th>
            </tr>
            <tr>
              <th>平均</th>
              <th>上漲</th>
              <th>平均</th>
              <th>上漲</th>
              <th>平均</th>
              <th>上漲</th>
            </tr>
          </thead>
          <tbody>
            {r.zones
              .filter((z) => z.days > 0)
              .map((z) => (
                <tr key={z.id}>
                  <th scope="row">
                    {z.label}（{z.min === 0 ? '< 20' : `≥ ${z.min}`}）
                  </th>
                  <td className="num">{z.days}</td>
                  <td className="num">{z.episodes}</td>
                  <Agg a={z.tx5} />
                  <Agg a={z.tx20} />
                  <Agg a={z.ew20} />
                </tr>
              ))}
            <tr className="baseline">
              <th scope="row">全部</th>
              <td className="num">{r.all.days}</td>
              <td />
              <Agg a={r.all.tx5} />
              <Agg a={r.all.tx20} />
              <Agg a={r.all.ew20} />
            </tr>
          </tbody>
        </table>
      </div>
      <h4>依廣度調整持股（持有一般股票等權平均，換手扣 0.3%）</h4>
      <div className="table-scroll">
        <table className="bt-table research-table">
          <thead>
            <tr>
              <th>做法</th>
              <th>年化</th>
              <th>最大回撤</th>
              <th>平均持股</th>
            </tr>
          </thead>
          <tbody>
            {r.timing.map((t) => (
              <tr key={t.label}>
                <th scope="row">{t.label}</th>
                <td className={`num ${tone(t.cagr)}`}>{fmtPct(t.cagr, 1)}</td>
                <td className="num down">{fmtPct(t.mdd, 1)}</td>
                <td className="num">{fmtNum(t.exposure, 0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        廣度低的時候，之後 20 天反而常反彈（逢低）；但在廣度低的期間一直抱著，會先吃到下跌。所以分級減碼的效果是「回撤變小、報酬沒變差」，
        不是賺更多。這段只有約 20 個月、廣度跌破 20 只有幾次，門檻 20／40 沿用原始框架的分區、沒有另外最佳化（試過 50 反而較差）。
      </p>
      {strategies?.length > 0 && <StrategyByBreadth list={strategies} th={r.threshold} />}
    </>
  );
}
