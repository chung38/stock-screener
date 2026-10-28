import { useMemo, useState } from 'react';
import { fmtNum, fmtShortDate, fmtPct, tone } from '../format.js';

const W = 760;
const H = 320;
const PAD_L = 6;
const PAD_R = 56;
const TOP = 16;
const PRICE_B = 228;
const VOL_T = 246;
const VOL_B = 306;

const MAS = [
  { key: 'ma5', n: 5, label: '週線', cls: 'ma5', ded: '週扣' },
  { key: 'ma20', n: 20, label: '月線', cls: 'ma20', ded: '月扣' },
  { key: 'ma60', n: 60, label: '季線', cls: 'ma60', ded: '季扣' },
];

export default function PriceChart({ chart, days = 90 }) {
  const [hover, setHover] = useState(null);
  const view = useMemo(() => {
    const n = chart.c.length;
    const start = Math.max(0, n - days);
    const idx = [...Array(n - start).keys()].map((i) => i + start);
    const lows = idx.map((i) => chart.l[i]);
    const highs = idx.map((i) => chart.h[i]);
    MAS.forEach((m) =>
      idx.forEach((i) => {
        const v = chart[m.key][i];
        if (v != null) {
          lows.push(v);
          highs.push(v);
        }
      }),
    );
    const lo = Math.min(...lows);
    const hi = Math.max(...highs);
    const pad = (hi - lo) * 0.06 || 1;
    const vmax = Math.max(...idx.map((i) => chart.v[i])) || 1;
    const step = (W - PAD_L - PAD_R) / idx.length;
    return {
      start,
      idx,
      step,
      x: (i) => PAD_L + (i - start + 0.5) * step,
      y: (p) => TOP + (1 - (p - (lo - pad)) / (hi - lo + 2 * pad)) * (PRICE_B - TOP),
      vy: (v) => VOL_B - (v / vmax) * (VOL_B - VOL_T),
      lo: lo - pad,
      hi: hi + pad,
    };
  }, [chart, days]);

  const { idx, x, y, vy, step, start } = view;
  const bw = Math.max(1.5, step * 0.62);
  const ticks = [0.15, 0.5, 0.85].map((t) => view.lo + (view.hi - view.lo) * t);
  const last = chart.c.length - 1;
  const hi = hover ?? last;
  const prev = hi > 0 ? chart.c[hi - 1] : chart.c[hi];

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round((px - PAD_L) / step - 0.5) + start;
    if (i >= start && i <= last) setHover(i);
  };

  return (
    <figure className="chart">
      <figcaption className="chart-info">
        <span className="num">{fmtShortDate(chart.d[hi])}</span>
        <span>
          開 <b className="num">{fmtNum(chart.o[hi])}</b>
        </span>
        <span>
          高 <b className="num">{fmtNum(chart.h[hi])}</b>
        </span>
        <span>
          低 <b className="num">{fmtNum(chart.l[hi])}</b>
        </span>
        <span>
          收 <b className={`num ${tone(chart.c[hi] - prev)}`}>{fmtNum(chart.c[hi])}</b>
          <small className={`num ${tone(chart.c[hi] - prev)}`}> {fmtPct(((chart.c[hi] - prev) / prev) * 100, 2)}</small>
        </span>
        <span>
          量 <b className="num">{fmtNum(chart.v[hi] / 1000, 0)}</b> 張
        </span>
        {MAS.map((m) => (
          <span key={m.key} className={`lg ${m.cls}`}>
            {m.label} <b className="num">{fmtNum(chart[m.key][hi])}</b>
          </span>
        ))}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="近 90 日 K 線、均線與扣抵位置"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} className="grid" />
            <text x={W - PAD_R + 6} y={y(t) + 4} className="axis num">
              {fmtNum(t, t > 100 ? 0 : 1)}
            </text>
          </g>
        ))}

        {/* 扣抵位置：明天各均線會扣掉的那一根 */}
        {MAS.map((m) => {
          const di = chart.deduct[m.n];
          if (di == null || di < start) return null;
          return (
            <g key={m.n} className={`ded-mark ${m.cls}`}>
              <line x1={x(di)} x2={x(di)} y1={TOP - 4} y2={VOL_B} />
              <circle cx={x(di)} cy={y(chart.c[di])} r="4" />
              <text x={x(di) + 5} y={TOP + 6}>
                {m.ded} {fmtNum(chart.c[di])}
              </text>
            </g>
          );
        })}

        {idx.map((i) => {
          const up = chart.c[i] >= chart.o[i];
          const cls = up ? 'k-up' : 'k-down';
          const top = y(Math.max(chart.o[i], chart.c[i]));
          const bot = y(Math.min(chart.o[i], chart.c[i]));
          return (
            <g key={i} className={cls}>
              <line x1={x(i)} x2={x(i)} y1={y(chart.h[i])} y2={y(chart.l[i])} />
              <rect x={x(i) - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} />
              <rect x={x(i) - bw / 2} y={vy(chart.v[i])} width={bw} height={VOL_B - vy(chart.v[i])} className="vol" />
            </g>
          );
        })}

        {MAS.map((m) => {
          const pts = idx.filter((i) => chart[m.key][i] != null).map((i) => `${x(i)},${y(chart[m.key][i])}`);
          return pts.length > 1 ? <polyline key={m.key} points={pts.join(' ')} className={`ma ${m.cls}`} /> : null;
        })}

        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={VOL_B} className="cross" />}
        <line x1={PAD_L} x2={W - PAD_R} y1={VOL_T - 8} y2={VOL_T - 8} className="sep" />
      </svg>
    </figure>
  );
}
