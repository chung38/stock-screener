// 共振環：基本面、籌碼、技術三個圓，通過的會填色；三者皆過時中心亮起
const PILLARS = [
  { key: 'f', name: '基本面', cx: 10, cy: 10, cls: 'fund' },
  { key: 'c', name: '籌碼', cx: 18, cy: 10, cls: 'chip' },
  { key: 't', name: '技術', cx: 14, cy: 17, cls: 'tech' },
];

export default function ResonanceRings({ pillars, size = 30, showLabels = false }) {
  const all = pillars.f && pillars.c && pillars.t;
  const desc = PILLARS.map((p) => `${p.name}${pillars[p.key] ? '通過' : '未過'}`).join('、');
  const svg = (
    <svg
      width={size}
      height={(size * 27) / 28}
      viewBox="0 0 28 27"
      className={`rings${all ? ' all' : ''}`}
      role="img"
      aria-label={desc}
    >
      <title>{desc}</title>
      {PILLARS.map((p) => (
        <circle key={p.key} cx={p.cx} cy={p.cy} r="6.6" className={`ring ${p.cls}${pillars[p.key] ? ' on' : ''}`} />
      ))}
      {all && <circle cx="14" cy="12.4" r="1.7" className="core" />}
    </svg>
  );
  if (!showLabels) return svg;
  return (
    <div className="rings-labeled">
      {svg}
      <ul>
        {PILLARS.map((p) => (
          <li key={p.key} className={`${p.cls}${pillars[p.key] ? ' on' : ''}`}>
            <span className="dot" />
            {p.name}
            <b>{pillars[p.key] ? '通過' : '未過'}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
