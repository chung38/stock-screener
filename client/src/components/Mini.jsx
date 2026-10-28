// 表格裡用的小圖：走勢線、營收年增長條、投信每日買賣
import { fmtNum } from '../format.js';

export function Spark({ values, width = 84, height = 24, className = '' }) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * width},${height - 2 - ((x - min) / span) * (height - 4)}`);
  return (
    <svg width={width} height={height} className={`spark ${className}`} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" />
    </svg>
  );
}

// 每個月一根，門檻線用虛線
export function YoyBars({ months, threshold }) {
  const h = 26;
  const cap = Math.max(threshold * 2.5, 60);
  return (
    <div className="yoy">
      <svg width={months.length * 9} height={h} aria-hidden="true">
        {months.map((m, i) => {
          const y = Math.max(0, Math.min(m.yoy ?? 0, cap));
          const bh = (y / cap) * (h - 2);
          return (
            <rect
              key={m.ym}
              x={i * 9}
              y={h - bh}
              width="6"
              height={Math.max(bh, 1)}
              className={(m.yoy ?? -1) > threshold ? 'pass' : 'fail'}
            />
          );
        })}
        <line x1="0" x2={months.length * 9} y1={h - (threshold / cap) * (h - 2)} y2={h - (threshold / cap) * (h - 2)} className="th" />
      </svg>
      <span className="num yoy-vals">
        {months.map((m) => (
          <span key={m.ym} className={(m.yoy ?? -1) > threshold ? '' : 'miss'}>
            {fmtNum(m.yoy, 0)}
          </span>
        ))}
      </span>
    </div>
  );
}

export function TrustDots({ daily }) {
  return (
    <span className="trust-dots" aria-hidden="true">
      {daily.map((x, i) => (
        <i key={i} className={x > 0 ? 'b' : x < 0 ? 's' : ''} />
      ))}
    </span>
  );
}
