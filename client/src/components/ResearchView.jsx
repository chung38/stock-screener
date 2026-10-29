import { useEffect, useState } from 'react';
import { getResearch } from '../api.js';
import { fmtNum, fmtPct, fmtDate, tone } from '../format.js';

const VERDICT = {
  robust: { text: '樣本內外都賺', cls: 'v-robust', tip: '前 2/3 與後 1/3 期間都賺錢、都勝過隨機進場，而且按訊號日計算的 t 值 ≥ 2' },
  weak: { text: '都賺但證據弱', cls: 'v-weak', tip: '兩段都賺錢也勝過隨機，但差距可能只是運氣（t < 2）' },
  illusion: { text: '看似有效是假象', cls: 'v-illusion', tip: '前段賺錢，後段沒賺或輸給隨機進場' },
  no: { text: '前段就不賺', cls: 'v-no', tip: '樣本內扣成本後就是虧損' },
  few: { text: '樣本不足', cls: 'v-few', tip: '前段少於 30 筆或後段少於 15 筆，不下結論' },
};

const pct = (x, d = 2) => fmtPct(x, d);

function Verdict({ v }) {
  const x = VERDICT[v] ?? VERDICT.few;
  return (
    <span className={`verdict-badge ${x.cls}`} title={x.tip}>
      {x.text}
    </span>
  );
}

function Curve({ curve, width = 260, height = 56 }) {
  if (!curve?.length) return null;
  const ys = curve.map((p) => p[1]);
  const min = Math.min(...ys, 1);
  const max = Math.max(...ys, 1);
  const span = max - min || 1;
  const y = (v) => height - 4 - ((v - min) / span) * (height - 8);
  const pts = ys.map((v, i) => `${(i / Math.max(1, ys.length - 1)) * width},${y(v)}`).join(' ');
  return (
    <svg width={width} height={height} className="eq-curve" role="img" aria-label="資金曲線">
      <line x1="0" x2={width} y1={y(1)} y2={y(1)} className="eq-base" />
      <polyline points={pts} className={ys.at(-1) >= 1 ? 'up' : 'down'} />
    </svg>
  );
}

function SplitCells({ s }) {
  if (!s?.n) return <td colSpan={3} className="muted">—</td>;
  return (
    <>
      <td className="num">{s.n}</td>
      <td className={`num ${tone(s.avg)}`}>{pct(s.avg)}</td>
      <td className="num">{fmtNum(s.win, 0)}%</td>
    </>
  );
}

function Family({ f, exits }) {
  const rows = f.top.map((id) => f.rows.find((r) => r.id === id)).filter(Boolean);
  const best = rows[0];
  return (
    <section className="card">
      <h2>{f.name}</h2>
      <p className="muted small">
        測了 {f.tested} 組參數：樣本內外都賺 {f.counts.robust + f.counts.weak} 組（其中統計上可信 {f.counts.robust} 組）、看似有效是假象{' '}
        {f.counts.illusion} 組、前段就不賺 {f.counts.no} 組、樣本不足 {f.counts.few} 組。
      </p>
      <h3>樣本內表現最好的 5 組，拿到樣本外驗證</h3>
      <div className="table-scroll">
        <table className="bt-table research-table">
          <thead>
            <tr>
              <th rowSpan={2}>條件</th>
              <th colSpan={3}>樣本內（前 2/3）</th>
              <th colSpan={3}>樣本外（後 1/3）</th>
              <th rowSpan={2}>樣本外勝過隨機</th>
              <th rowSpan={2}>t 值（按日）</th>
              <th rowSpan={2}>判定</th>
            </tr>
            <tr>
              <th>筆數</th>
              <th>每筆平均</th>
              <th>勝率</th>
              <th>筆數</th>
              <th>每筆平均</th>
              <th>勝率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.label}</th>
                <SplitCells s={r.is} />
                <SplitCells s={r.oos} />
                <td className={`num ${tone(r.oos.excess)}`}>{pct(r.oos.excess)}</td>
                <td className="num" title={`${r.all.signalDays} 個訊號日、${r.all.episodes} 段獨立行情`}>
                  {fmtNum(r.all.tDay, 1)}
                </td>
                <td>
                  <Verdict v={r.verdict} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {best && (
        <p className="muted small">
          t 值按訊號日平均後計算（同一天的訊號視為一次），比逐筆計算保守。第一名在大盤季線之上時每筆平均 {pct(best.up?.avg)}（{best.up?.n ?? 0} 筆），季線之下時 {pct(best.down?.avg)}（{best.down?.n ?? 0}{' '}
          筆）。出場方式：{exits[best.exit]}。
        </p>
      )}
    </section>
  );
}

const HOLD = { H1: '當沖', H3: '3 天', H5: '5 天', H10: '10 天' };

function ShortTerm({ r }) {
  const list = r.shortTerm ?? [];
  if (!list.length) return null;
  const rp = r.randomPortfolio ?? {};
  const bh = r.buyHold ?? {};
  const beatRandom = (x) => x.portfolio.cagr != null && rp[x.exit]?.cagr != null && x.portfolio.cagr > rp[x.exit].cagr;
  return (
    <section className="card">
      <h2>短線持有：我們的策略 vs 坊間常用指標</h2>
      <p className="muted small">
        每個方法都試了當沖、持有 3／5／10 天，用前 2/3 期間挑出最好的持有天數，再看後 1/3 期間。「資金曲線」是全部訊號照做、最多同時 10 檔、每檔 1/10
        資金的實際帳戶結果（已扣成本），依年化報酬排序。
      </p>
      <dl className="bench">
        <div>
          <dt>什麼都不做，買大盤放著</dt>
          <dd>
            加權指數年化 <b className={`num ${tone(bh.taiex)}`}>{pct(bh.taiex, 1)}</b>，等權平均年化{' '}
            <b className={`num ${tone(bh.equalWeight)}`}>{pct(bh.equalWeight, 1)}</b>
          </dd>
        </div>
        <div>
          <dt>每天隨機亂買（同樣最多 10 檔）</dt>
          <dd>
            {['H1', 'H3', 'H5', 'H10'].map((k) => (
              <span key={k} className="rp-item">
                {HOLD[k]} <b className={`num ${tone(rp[k]?.cagr)}`}>{pct(rp[k]?.cagr, 1)}</b>
              </span>
            ))}
          </dd>
        </div>
      </dl>
      <div className="table-scroll">
        <table className="bt-table research-table short-table">
          <thead>
            <tr>
              <th rowSpan={2}>方法</th>
              <th rowSpan={2}>持有</th>
              <th colSpan={2}>每筆平均（扣成本）</th>
              <th rowSpan={2}>樣本外勝過隨機</th>
              <th colSpan={2}>大盤季線</th>
              <th colSpan={3}>資金曲線</th>
              <th rowSpan={2}>判定</th>
            </tr>
            <tr>
              <th>樣本內</th>
              <th>樣本外</th>
              <th>之上</th>
              <th>之下</th>
              <th>年化</th>
              <th>最大回撤</th>
              <th>勝過亂買</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id} className={x.group === 'ours' ? 'ours' : ''}>
                <th scope="row">
                  <span className={`grp grp-${x.group}`}>{x.group === 'ours' ? '本程式' : '坊間'}</span>
                  {x.name}
                </th>
                <td>{HOLD[x.exit] ?? x.exit}</td>
                <td className={`num ${tone(x.is.avg)}`}>{pct(x.is.avg)}</td>
                <td className={`num ${tone(x.oos.avg)}`}>{pct(x.oos.avg)}</td>
                <td className={`num ${tone(x.oos.excess)}`}>{pct(x.oos.excess)}</td>
                <td className={`num ${tone(x.up?.avg)}`}>{pct(x.up?.avg)}</td>
                <td className={`num ${tone(x.down?.avg)}`} title={`${x.down?.n ?? 0} 筆`}>
                  {pct(x.down?.avg)}
                </td>
                <td className={`num ${tone(x.portfolio.cagr)}`}>{pct(x.portfolio.cagr, 1)}</td>
                <td className="num down">{pct(x.portfolio.mdd, 1)}</td>
                <td>{beatRandom(x) ? '是' : '否'}</td>
                <td>
                  <Verdict v={x.verdict} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        「每筆平均」把當沖的證交稅減半（0.15%）算進去；其他持有天數每筆扣 {fmtNum(r.costPct, 3)}%。持有天數越短，成本占報酬的比例越高。
      </p>
    </section>
  );
}

export default function ResearchView() {
  const [r, setR] = useState(undefined);
  const [err, setErr] = useState('');
  useEffect(() => {
    getResearch()
      .then(setR)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="error">{err}</div>;
  if (r === undefined) return <div className="loading">讀取中…</div>;
  if (r === null) return <div className="empty">還沒有策略研究結果，下一次 GitHub 自動更新後就會出現。</div>;

  const all = r.families.flatMap((f) => f.rows.map((x) => ({ ...x, family: f.name })));
  const robust = all.filter((x) => x.verdict === 'robust').sort((a, b) => b.all.avg - a.all.avg);
  const weak = all.filter((x) => x.verdict === 'weak').sort((a, b) => b.all.avg - a.all.avg);
  const famBest = Object.fromEntries(r.equity.map((e) => [e.family, e]));

  return (
    <div className="breakout-view research-view">
      <section className="card">
        <h2>哪些策略真的能賺錢？</h2>
        <p className="muted small">
          {fmtDate(r.from)} 到 {fmtDate(r.to)}（{r.days} 個交易日、{r.stocks} 檔股票）。用前 2/3（到 {fmtDate(r.split)}）挑參數，後 1/3
          當作沒看過的資料驗證。訊號出現後隔天開盤進場，每筆扣來回成本 {fmtNum(r.costPct, 3)}%
          {r.dividendAdjusted ? `，股價已還原權息（比對到 ${r.dividendAdjusted.matched} 次除權息）` : '，股價未還原權息'}。
        </p>
        <dl className="bench">
          <div>
            <dt>大盤（加權指數）同期</dt>
            <dd>
              全期 <b className={`num ${tone(r.benchmark.all)}`}>{pct(r.benchmark.all, 1)}</b>，前段{' '}
              <b className={`num ${tone(r.benchmark.is)}`}>{pct(r.benchmark.is, 1)}</b>，後段{' '}
              <b className={`num ${tone(r.benchmark.oos)}`}>{pct(r.benchmark.oos, 1)}</b>
            </dd>
          </div>
          {r.equalWeight && (
            <div>
              <dt>等權平均（一般股票）</dt>
              <dd>
                全期 <b className={`num ${tone(r.equalWeight.all)}`}>{pct(r.equalWeight.all, 1)}</b>，前段{' '}
                <b className={`num ${tone(r.equalWeight.is)}`}>{pct(r.equalWeight.is, 1)}</b>，後段{' '}
                <b className={`num ${tone(r.equalWeight.oos)}`}>{pct(r.equalWeight.oos, 1)}</b>
              </dd>
            </div>
          )}
          <div>
            <dt>隨機進場、持有 10 天</dt>
            <dd>
              每筆平均 前段 <b className={`num ${tone(r.baselines.H10.is.avg)}`}>{pct(r.baselines.H10.is.avg)}</b>，後段{' '}
              <b className={`num ${tone(r.baselines.H10.oos.avg)}`}>{pct(r.baselines.H10.oos.avg)}</b>
            </dd>
          </div>
        </dl>
        <h3>樣本內外都賺錢、統計上可信</h3>
        {robust.length ? (
          <ul className="pass-list">
            {robust.slice(0, 8).map((x) => (
              <li key={x.id}>
                <b>{x.label}</b>
                <span>
                  {x.family}｜全期 {x.all.n} 筆、每筆平均 <em className={tone(x.all.avg)}>{pct(x.all.avg)}</em>、勝率 {fmtNum(x.all.win, 0)}%、樣本外{' '}
                  <em className={tone(x.oos.avg)}>{pct(x.oos.avg)}</em>；大盤季線上 {pct(x.up?.avg)}、季線下 {pct(x.down?.avg)}（{x.down?.n ?? 0} 筆）
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>沒有。測過的策略在扣成本後，沒有一組能同時通過前後兩段驗證且統計上可信。</p>
        )}
        {weak.length > 0 && (
          <>
            <h3>兩段都賺，但證據還不夠強</h3>
            <ul className="pass-list weak">
              {weak.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <b>{x.label}</b>
                  <span>
                    {x.family}｜全期 {x.all.n} 筆、每筆平均 {pct(x.all.avg)}、t 值 {fmtNum(x.all.t, 1)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <ShortTerm r={r} />

      {r.families.map((f) => (
        <Family key={f.id} f={f} exits={r.exits} />
      ))}

      <section className="card">
        <h2>加上基本面、籌碼濾網有沒有幫助</h2>
        <p className="muted small">
          用各類第一名的條件，再要求訊號當天已公布的月營收、季報、投信資料符合濾網。月營收從 {r.coverage.revFrom}、季報從{' '}
          {r.coverage.gmFrom} 開始，法人資料 {r.coverage.instDays} 天。千張大戶只有幾週資料，無法回測。
        </p>
        {r.filterTables.map((t) => (
          <div key={t.family} className="filter-block">
            <h4>{t.baseLabel}</h4>
            <div className="table-scroll">
              <table className="bt-table research-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>濾網</th>
                    <th colSpan={3}>樣本內</th>
                    <th colSpan={3}>樣本外</th>
                  </tr>
                  <tr>
                    <th>筆數</th>
                    <th>每筆平均</th>
                    <th>勝率</th>
                    <th>筆數</th>
                    <th>每筆平均</th>
                    <th>勝率</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((x) => (
                    <tr key={x.id}>
                      <th scope="row">{x.label}</th>
                      <SplitCells s={x.is} />
                      <SplitCells s={x.oos} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>實際操作的資金曲線</h2>
        <p className="muted small">
          各類第一名的訊號全部照做，最多同時持有 10 檔、每檔投入當時資金的 1/10，已扣成本。這比「每筆平均報酬」更接近真實帳戶的結果。
        </p>
        <div className="eq-grid">
          {r.families.map((f) => {
            const e = famBest[f.id];
            if (!e) return null;
            return (
              <div key={f.id} className="eq-item">
                <h4>{f.name}</h4>
                <Curve curve={e.curve} />
                <p className="small">
                  總報酬 <b className={`num ${tone(e.total)}`}>{pct(e.total, 1)}</b>，年化 <b className={`num ${tone(e.cagr)}`}>{pct(e.cagr, 1)}</b>
                  ，最大回撤 <b className="num down">{pct(e.mdd, 1)}</b>，{e.taken} 筆、持股時間 {fmtNum(e.exposure, 0)}%
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <p className="footnote">
        判定方式：先只看前 2/3 期間挑出最好的參數，再看它在後 1/3 期間是否仍然賺錢、而且比隨機挑股票同樣持有更好。只在前段好看的，多半是剛好配合到那段行情。
        測的組合越多，越容易「碰巧」挑到好看的結果，所以「都賺但證據弱」的組合不建議直接採用。過去的結果不代表未來，也不構成投資建議。
      </p>
    </div>
  );
}
