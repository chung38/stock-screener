import { useEffect, useState } from 'react';

function NumField({ label, value, onChange, step = 1, min, max, suffix }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-wrap">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

function Choice({ label, value, options, onChange }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, t]) => (
          <button
            type="button"
            key={String(v)}
            role="radio"
            aria-checked={value === v}
            className={value === v ? 'on' : ''}
            onClick={() => onChange(v)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export default function FilterPanel({ params, defaults, onApply, onClose }) {
  const [p, setP] = useState(params);
  useEffect(() => setP(params), [params]);
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(p) !== JSON.stringify(params);

  return (
    <form
      className="filters"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(p);
      }}
    >
      <div className="filters-head">
        <h2>篩選條件</h2>
        {onClose && (
          <button type="button" className="ghost" onClick={onClose}>
            收起
          </button>
        )}
      </div>

      <fieldset className="pillar fund">
        <legend>基本面爆發</legend>
        <NumField label="近幾個月營收" value={p.revMonths} onChange={set('revMonths')} min={1} max={6} suffix="個月" />
        <NumField label="年增率高於" value={p.revYoyMin} onChange={set('revYoyMin')} suffix="%" />
        <Choice
          label="計算方式"
          value={p.revMode}
          onChange={set('revMode')}
          options={[
            ['each', '每月都過'],
            ['sum', '合計過'],
          ]}
        />
        <NumField label="毛利率連續改善" value={p.gmQuarters} onChange={set('gmQuarters')} min={1} max={4} suffix="季" />
        <NumField label="每季至少改善" value={p.gmMinStep} onChange={set('gmMinStep')} step={0.1} suffix="百分點" />
      </fieldset>

      <fieldset className="pillar chip">
        <legend>籌碼進駐</legend>
        <NumField label="千張大戶連續增加" value={p.bigWeeks} onChange={set('bigWeeks')} min={1} max={4} suffix="週" />
        <NumField label="每週至少增加" value={p.bigMinDelta} onChange={set('bigMinDelta')} step={0.05} suffix="百分點" />
        <Toggle label="散戶比例同步下降" hint="50 張以下持股比例減少" checked={p.retailDown} onChange={set('retailDown')} />
        <NumField label="投信統計天數" value={p.trustDays} onChange={set('trustDays')} min={1} max={15} suffix="日" />
        <NumField label="合計買超多於" value={p.trustMinLots} onChange={set('trustMinLots')} suffix="張" />
        <NumField label="其中買超天數至少" value={p.trustMinBuyDays} onChange={set('trustMinBuyDays')} min={0} max={15} suffix="天" />
        <Toggle label="名單必須通過籌碼" hint="關掉可看基本面好、籌碼還沒進來的股票" checked={p.requireChips} onChange={set('requireChips')} />
      </fieldset>

      <fieldset className="pillar tech">
        <legend>技術面</legend>
        <Choice
          label="關鍵均線"
          value={p.keyMA}
          onChange={set('keyMA')}
          options={[
            [20, '月線 20 日'],
            [60, '季線 60 日'],
          ]}
        />
        <NumField label="回測觀察期" value={p.pullbackDays} onChange={set('pullbackDays')} min={3} max={30} suffix="日" />
        <NumField label="回到均線上方" value={p.pullbackTolPct} onChange={set('pullbackTolPct')} step={0.5} suffix="% 內算回測" />
        <NumField label="收盤跌破超過" value={p.breakTolPct} onChange={set('breakTolPct')} step={0.5} suffix="% 算破線" />
      </fieldset>

      <fieldset className="pillar plain">
        <legend>流動性與錯殺</legend>
        <NumField label="20 日均量至少" value={p.minVolLots} onChange={set('minVolLots')} step={100} suffix="張" />
        <NumField label="股價至少" value={p.minPrice} onChange={set('minPrice')} suffix="元" />
        <NumField label="錯殺：距 20 日高點跌" value={p.panicDropPct} onChange={set('panicDropPct')} suffix="% 以上" />
        <NumField label="錯殺：月線乖離低於" value={p.panicBiasPct} onChange={set('panicBiasPct')} suffix="%" />
        <NumField label="或 RSI(6) 低於" value={p.panicRsi} onChange={set('panicRsi')} />
        <Toggle label="錯殺也要求毛利率改善" checked={p.panicRequireGm} onChange={set('panicRequireGm')} />
      </fieldset>

      <div className="filters-actions">
        <button type="submit" className="primary" disabled={!dirty}>
          套用條件
        </button>
        <button type="button" className="ghost" onClick={() => setP(defaults)}>
          恢復預設
        </button>
      </div>
    </form>
  );
}
