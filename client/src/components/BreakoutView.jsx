import { useEffect, useMemo, useState } from 'react';
import { getBreakouts, getBacktest, STATIC, REPO } from '../api.js';
import { fmtNum, fmtPct, fmtShortDate, fmtDate, tone } from '../format.js';

const LS_KEY = 'screener.breakout.v1';
const DEFAULT_RULE = { lookback: 20, volMult: 1.5, holdDays: 2 };
const loadRule = () => {
  try {
    return { ...DEFAULT_RULE, ...(JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') ?? {}) };
  } catch {
    return DEFAULT_RULE;
  }
};

// 規則對應到回測的哪一組
function variantOf(rule) {
  if (rule.lookback === 120 && rule.volMult === 1.5 && rule.holdDays === 2) return 'F';
  if (rule.lookback === 60 && rule.volMult === 1.5 && rule.holdDays === 2) return 'E';
  if (rule.lookback !== 20) return null;
  if (rule.volMult === 0 && rule.holdDays === 0) return 'A';
  if (rule.volMult === 1.5 && rule.holdDays === 0) return 'B';
  if (rule.volMult === 1.5 && rule.holdDays === 2) return 'C';
  if (rule.volMult === 2 && rule.holdDays === 2) return 'D';
  return null;
}

function Seg({ label, value, options, onChange }) {
  return (
    <div className="field inline">
      <span>{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, t]) => (
          <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

const pct = (x, d = 1) => (x == null ? '—' : `${fmtNum(x, d)}%`);

function Verdict({ bt }) {
  const v = Object.fromEntries(bt.variants.map((x) => [x.id, x]));
  const A = v.A;
  const B = v.B;
  const C = v.C;
  if (!A?.n) return null;
  const worst = bt.buckets
    .flatMap((b) => b.rows.filter((r) => r.n >= 30 && r.falseRate != null).map((r) => ({ ...r, group: b.name })))
    .sort((a, b) => b.falseRate - a.falseRate)
    .slice(0, 3);
  const better = (x, y) => (x == null || y == null ? '—' : x > y ? '有改善' : x < y ? '變差' : '差不多');
  return (
    <ol className="verdict">
      <li>
        <b>符合條件的交易有幾次？</b>
        {fmtDate(bt.from)} 到 {fmtDate(bt.to)}（{bt.days} 個交易日），單純突破 20 日前高共 {A.signals} 次；加上量能與站穩 2 天（C）剩{' '}
        {C?.n ?? 0} 筆交易。
      </li>
      <li>
        <b>突破後隔天上漲的比例？</b>
        單純突破隔天上漲 {pct(A.nextUpRate)}，對照組（任意一天買進）是 {pct(bt.baseline.nextUpRate)}。
      </li>
      <li>
        <b>加入成交量條件後有沒有改善？</b>
        10 日平均報酬（扣成本）{pct(A.avg10, 2)} → {pct(B?.avg10, 2)}，{better(B?.avg10, A.avg10)}；假突破率 {pct(A.falseRate)} →{' '}
        {pct(B?.falseRate)}。再要求站穩 2 天（C）：假突破率 {pct(C?.falseRate)}，10 日平均 {pct(C?.avg10, 2)}。
      </li>
      {worst.length > 0 && (
        <li>
          <b>哪些情況最容易假突破？</b>
          {worst.map((w, i) => (
            <span key={w.group + w.label}>
              {i ? '；' : ''}
              {w.group}「{w.label}」{pct(w.falseRate)}
            </span>
          ))}
          （樣本 30 次以上的組別中最高的三組）。
        </li>
      )}
    </ol>
  );
}

function StatsTable({ rows, first, baseline }) {
  return (
    <div className="table-scroll">
      <table className="bt-table">
        <thead>
          <tr>
            <th>{first}</th>
            <th>次數</th>
            <th>隔日上漲</th>
            <th>5 日平均</th>
            <th>10 日平均</th>
            <th>20 日平均</th>
            <th>10 日勝率</th>
            <th>假突破率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id ?? r.label}>
              <th scope="row">
                {r.id && <em className="vid">{r.id}</em>}
                {r.name ?? r.label}
                {r.failedConfirm ? <small>{r.signals} 次突破，{r.failedConfirm} 次沒站穩</small> : null}
              </th>
              <td className="num">{r.n ?? 0}</td>
              <td className="num">{pct(r.nextUpRate)}</td>
              <td className={`num ${tone(r.avg5)}`}>{fmtPct(r.avg5, 2)}</td>
              <td className={`num ${tone(r.avg10)}`}>{fmtPct(r.avg10, 2)}</td>
              <td className={`num ${tone(r.avg20)}`}>{fmtPct(r.avg20, 2)}</td>
              <td className="num">{pct(r.win10)}</td>
              <td className="num">
                {r.falseRate == null ? '—' : (
                  <span className="fbar">
                    <i style={{ width: `${r.falseRate}%` }} />
                    {pct(r.falseRate)}
                  </span>
                )}
              </td>
            </tr>
          ))}
          {baseline && (
            <tr className="baseline">
              <th scope="row">對照：任意一天買進</th>
              <td className="num">{baseline.n}</td>
              <td className="num">{pct(baseline.nextUpRate)}</td>
              <td />
              <td className={`num ${tone(baseline.avg10)}`}>{fmtPct(baseline.avg10, 2)}</td>
              <td />
              <td />
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function BreakoutView({ onPick, selected, resonance, market }) {
  const [rule, setRule] = useState(loadRule);
  const [today, setToday] = useState(null);
  const [bt, setBt] = useState(undefined);
  const [err, setErr] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rule));
    } catch {
      /* 無痕模式等情況存不了，不影響使用 */
    }
    getBreakouts(rule)
      .then(setToday)
      .catch((e) => setErr(e.message));
  }, [rule]);

  useEffect(() => {
    getBacktest()
      .then(setBt)
      .catch((e) => setErr(e.message));
  }, []);

  const set = (k) => (v) => setRule((r) => ({ ...r, [k]: v }));
  const vid = variantOf(rule);
  const vstat = useMemo(() => bt?.variants?.find((x) => x.id === vid), [bt, vid]);

  return (
    <div className="breakout-view">
      {err && <div className="error">{err}</div>}

      <section className="card">
        <h2>今日突破訊號</h2>
        <p className="muted small">
          收盤突破前高、當天成交量高於近 20 日均量，而且之後收盤都沒有跌回前高。近 5 個交易日內發生的突破都列出來。
        </p>
        <div className="rule-bar">
          <Seg label="前高" value={rule.lookback} onChange={set('lookback')} options={[[20, '20 日'], [60, '60 日'], [120, '120 日']]} />
          <Seg
            label="量比至少"
            value={rule.volMult}
            onChange={set('volMult')}
            options={[[0, '不限'], [1.5, '1.5 倍'], [2, '2 倍'], [3, '3 倍']]}
          />
          <Seg label="站穩" value={rule.holdDays} onChange={set('holdDays')} options={[[0, '當天'], [1, '1 天'], [2, '2 天'], [3, '3 天']]} />
        </div>
        {market?.belowMA60 && (
          <ul className="warn-list compact">
            <li>大盤目前在季線之下。策略績效頁的回測中，大盤在季線下出現的突破訊號平均是虧損的，進場前要更保守。</li>
          </ul>
        )}
        {vstat?.n ? (
          <p className="hist-note">
            歷史上這組條件（{vid}）：{vstat.n} 筆，隔日上漲 {pct(vstat.nextUpRate)}，10 日平均 {fmtPct(vstat.avg10, 2)}（已扣成本），假突破{' '}
            {pct(vstat.falseRate)}
          </p>
        ) : null}

        {!today ? (
          <div className="loading">讀取中…</div>
        ) : today.list.length === 0 ? (
          <div className="empty">近 {today.params.recentDays} 個交易日沒有符合條件的突破。</div>
        ) : (
          <div className="bo-list">
            {today.list.map((x) => (
              <button type="button" key={x.code} className={`bo-row${selected === x.code ? ' sel' : ''}`} onClick={() => onPick(x.code)}>
                <span className="bo-name">
                  <b className="num">{x.code}</b> {x.n}
                  {resonance?.has(x.code) && <em className="tag-res">共振名單</em>}
                </span>
                <span className={`sig ${x.status === 'confirmed' ? 'sig-swing' : 'sig-break'}`}>
                  {x.status === 'confirmed' ? `站穩 ${x.held} 天` : x.held ? `觀察第 ${x.held} 天` : '今天突破'}
                </span>
                <span className="bo-meta">
                  <span>
                    {fmtShortDate(x.date)} 突破前高 <b className="num">{fmtNum(x.prevHigh)}</b>
                  </span>
                  <span>
                    量比 <b className="num">{fmtNum(x.volRatio, 1)}</b>
                  </span>
                </span>
                <span className="bo-price r">
                  <b className="num">{fmtNum(x.close)}</b>
                  <small className={`num ${tone(x.aboveHigh)}`}>距前高 {fmtPct(x.aboveHigh)}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>回測：這個方法過去有效嗎？</h2>
        {bt === undefined && <div className="loading">讀取中…</div>}
        {bt === null && (
          <p className="muted">
            還沒有回測結果，下一次 GitHub 自動更新後就會出現。
            {STATIC && REPO && (
              <>
                {' '}
                想要更長的歷史：到{' '}
                <a href={`https://github.com/${REPO}/actions`} target="_blank" rel="noreferrer">
                  GitHub Actions
                </a>{' '}
                執行「每日更新」並勾選「補齊近 2 年股價」。
              </>
            )}
          </p>
        )}
        {bt && (
          <>
            {bt.days < 250 && (
              <ul className="warn-list compact">
                <li>
                  目前只有 {bt.days} 個交易日，樣本少，而且大多是同一段行情，結論參考價值有限。
                  {STATIC ? '到 GitHub Actions 執行「每日更新」並勾選「補齊近 2 年股價」可以補到約 2 年。' : '用 PRICE_DAYS=500 npm run backfill 可以補到約 2 年。'}
                </li>
              </ul>
            )}
            <Verdict bt={bt} />

            <h3>各組條件比較</h3>
            <StatsTable rows={bt.variants} first="條件" baseline={bt.baseline} />
            <p className="muted small">
              股價已還原權息；減資、分割前的價格不列入。報酬從進場日收盤算起，已扣來回成本 {fmtNum(bt.cost.roundTrip, 3)}%（手續費 {bt.cost.fee}% ×2 不打折、證交稅 {bt.cost.tax}%、滑價{' '}
              {bt.cost.slip}% ×2）。勝率＝扣成本後賺錢的比例。假突破＝進場後 {bt.rules.falseDays} 天內收盤跌回前高。同一檔 {bt.rules.cooldown}{' '}
              個交易日內只算第一次突破；只計 20 日均量 {bt.rules.minVolLots} 張以上、股價 {bt.rules.minPrice} 元以上。
            </p>

            <h3>哪些情況容易假突破</h3>
            <p className="muted small">以「突破 20 日前高、當天收盤進場」（A）的所有事件分組。</p>
            <div className="bucket-grid">
              {bt.buckets.map((b) => (
                <div key={b.id}>
                  <h4>{b.name}</h4>
                  <StatsTable rows={b.rows} first="分組" />
                </div>
              ))}
            </div>

            {bt.periods.length > 1 && (
              <>
                <h3>不同時期的表現（條件 C）</h3>
                <StatsTable rows={bt.periods} first="季別" />
              </>
            )}

            <details className="samples">
              <summary>最近 40 筆條件 C 的實際案例（用來核對程式邏輯）</summary>
              <div className="table-scroll">
                <table className="bt-table">
                  <thead>
                    <tr>
                      <th>股票</th>
                      <th>突破日</th>
                      <th>前高</th>
                      <th>收盤</th>
                      <th>量比</th>
                      <th>結果</th>
                      <th>隔日</th>
                      <th>5 日</th>
                      <th>10 日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bt.samples.map((x) => (
                      <tr key={x.code + x.date}>
                        <th scope="row">
                          <button type="button" className="link" onClick={() => onPick(x.code)}>
                            {x.code} {x.n}
                          </button>
                        </th>
                        <td className="num">{fmtShortDate(x.date)}</td>
                        <td className="num">{fmtNum(x.prevHigh)}</td>
                        <td className="num">{fmtNum(x.close)}</td>
                        <td className="num">{fmtNum(x.volRatio, 1)}</td>
                        <td>
                          {x.result === 'failed'
                            ? '沒站穩，不進場'
                            : x.falseBreak
                              ? '進場後跌回'
                              : x.falseBreak === false
                                ? '站穩'
                                : '進場中'}
                        </td>
                        <td className={`num ${tone(x.ret1)}`}>{fmtPct(x.ret1, 1)}</td>
                        <td className={`num ${tone(x.ret5)}`}>{fmtPct(x.ret5, 1)}</td>
                        <td className={`num ${tone(x.ret10)}`}>{fmtPct(x.ret10, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <p className="footnote">
              歷史回測不代表未來會重演。沒有計入漲跌停買不到或賣不掉、下市股票等因素，樣本數少的組別差異可能只是巧合。這裡以確認當天收盤價進場，比較樂觀；「策略績效」頁改用隔天開盤進場，結果比較保守。
            </p>
          </>
        )}
      </section>
    </div>
  );
}
