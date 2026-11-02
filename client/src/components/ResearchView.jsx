import { useEffect, useState } from 'react';
import { getResearch } from '../api.js';
import { fmtNum, fmtPct, fmtDate, tone } from '../format.js';

// 「策略績效」只列出用 2 年資料驗證後真的能賺錢的策略（篩選在 server/research/lab.js 的 winners）

const pct = (x, d = 2) => fmtPct(x, d);

function Curve({ curve, width = 300, height = 64 }) {
  if (!curve?.length) return null;
  const ys = curve.map((p) => p[1]);
  const min = Math.min(...ys, 1);
  const max = Math.max(...ys, 1);
  const span = max - min || 1;
  const y = (v) => height - 4 - ((v - min) / span) * (height - 8);
  const pts = ys.map((v, i) => `${(i / Math.max(1, ys.length - 1)) * width},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="eq-curve" role="img" aria-label="資金曲線">
      <line x1="0" x2={width} y1={y(1)} y2={y(1)} className="eq-base" />
      <polyline points={pts} className={ys.at(-1) >= 1 ? 'up' : 'down'} />
    </svg>
  );
}

// 每一類策略的白話名稱、規則、在 App 哪裡找訊號
const FAMILY = {
  resonance: {
    title: '三重共振名單',
    rules: () => [
      '近 3 個已公布月份的營收年增率每個月都 > 20%',
      '單季毛利率連續 2 季改善（季報法定公布日之後才算）',
      '投信近 5 個交易日合計買超',
      '股價站上月線、月線上彎、週線上彎（條件同時成立的第一天）',
      '當天收盤確認，隔天開盤買進',
    ],
    where: '「共振名單」頁勾選「只看三者皆過」。App 名單另外要求千張大戶增加，這個條件資料只有幾週，回測沒有包含。',
  },
  breakout: {
    title: '突破長期前高',
    rules: (s) =>
      [
        `收盤突破前 ${s.lb} 個交易日的最高價（前一天還沒突破）`,
        s.vm ? `突破當天成交量 ≥ 前 20 日均量的 ${s.vm} 倍` : null,
        s.hd ? `之後連續 ${s.hd} 天收盤都沒有跌回前高（站穩）` : null,
        '站穩那天收盤確認，隔天開盤買進',
      ].filter(Boolean),
    where: (s) => `「突破策略」頁，前高選 ${s.lb} 日、量比 ${s.vm ? `${s.vm} 倍` : '不限'}、站穩 ${s.hd} 天，列出的「站穩」股票。`,
  },
  panic: {
    title: '大盤恐慌時買錯殺股',
    rules: (s) => [
      '大盤恐慌：加權指數單日跌 3%、近 5 日跌 6%，或距 20 日高點跌 10% 以上',
      `個股距 20 日高點跌 ${s.drop}% 以上，且月線乖離 −8% 以下或 RSI(6) 20 以下`,
      '當天收盤確認，隔天開盤買進',
    ],
    where: (s) => `「錯殺逆勢」頁，只在頂端顯示「大盤恐慌」時才進場；左側「距 20 日高點跌」可改成 ${s.drop}%。App 名單另外要求營收仍強，回測中加上這個條件結果更好。`,
  },
};

function WinnerRow({ w, exits }) {
  const p = w.portfolio;
  const m = p.market ?? {};
  return (
    <div className="win-row">
      <h3>{exits[w.exit] ?? w.exit}</h3>
      <dl className="win-stats">
        <div>
          <dt>每筆平均（扣成本）</dt>
          <dd>
            <b className={`num ${tone(w.is.avg)}`}>{pct(w.is.avg)}</b> 前段 ／ <b className={`num ${tone(w.oos.avg)}`}>{pct(w.oos.avg)}</b> 後段
          </dd>
        </div>
        <div>
          <dt>勝率</dt>
          <dd className="num">
            {fmtNum(w.is.win, 0)}% ／ {fmtNum(w.oos.win, 0)}%
          </dd>
        </div>
        <div>
          <dt>比隨機買多賺（後段每筆）</dt>
          <dd className={`num ${tone(w.oos.excess)}`}>{pct(w.oos.excess)}</dd>
        </div>
        <div>
          <dt>交易次數</dt>
          <dd className="num">
            {w.all.n} 筆（{w.all.signalDays} 個訊號日）
          </dd>
        </div>
        <div>
          <dt>大盤在季線上／下</dt>
          <dd>
            <b className={`num ${tone(w.up?.avg)}`}>{pct(w.up?.avg)}</b> ／ <b className={`num ${tone(w.down?.avg)}`}>{pct(w.down?.avg)}</b>
            <small>（{w.down?.n ?? 0} 筆在季線下）</small>
          </dd>
        </div>
        <div>
          <dt>帳戶年化（最多 10 檔）</dt>
          <dd>
            <b className={`num ${tone(p.cagr)}`}>{pct(p.cagr, 1)}</b>
            <small>
              （{fmtNum(p.p10, 0)}～{fmtNum(p.p90, 0)}%）
            </small>
          </dd>
        </div>
        <div>
          <dt>最大回撤</dt>
          <dd className="num down">{pct(p.mdd, 1)}</dd>
        </div>
        <div>
          <dt>同期大盤年化</dt>
          <dd className="num">
            加權 {pct(m.taiex, 0)}／等權 {pct(m.equalWeight, 0)}
          </dd>
        </div>
      </dl>
      <Curve curve={p.curve} />
      <p className="muted small">
        資金曲線從 {fmtDate(m.from)} 第一筆交易開始，持股時間 {fmtNum(p.exposure, 0)}%。
      </p>
      {w.down?.avg < 0 && (
        <p className="win-warn">
          大盤在季線之下時，每筆平均 {pct(w.down.avg)}（{w.down.n} 筆）。大盤跌破季線時不要用這個策略。
        </p>
      )}
      {p.exposure < 50 && (
        <p className="win-note">
          只有在特定時機才有訊號，資金大部分時間閒置，所以帳戶年化不高；每一筆的報酬才是重點，閒置時資金可以放在其他地方。
        </p>
      )}
    </div>
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
  if (r === null || !r.winners) return <div className="empty">還沒有策略研究結果，下一次 GitHub 自動更新後就會出現。</div>;

  // 依策略類別分組，帳戶年化最好的類別排前面
  const groups = [];
  for (const w of [...r.winners].sort((a, b) => b.portfolio.cagr - a.portfolio.cagr)) {
    let g = groups.find((x) => x.family === w.family);
    if (!g) groups.push((g = { family: w.family, list: [] }));
    g.list.push(w);
  }
  const sc = r.screened ?? {};

  return (
    <div className="breakout-view research-view">
      <section className="card">
        <h2>真的能賺錢的策略</h2>
        <p className="muted small">
          用 {fmtDate(r.from)} 到 {fmtDate(r.to)}（{r.days} 個交易日、{r.stocks} 檔上市櫃股票）的資料回測。訊號在收盤後確認、隔天開盤買進，每筆扣來回成本{' '}
          {fmtNum(r.costPct, 3)}%，股價已還原權息，月營收與季報依公布日之後才使用。
        </p>
        <p>
          一共測了 <b>{sc.tested}</b> 組策略參數，只有 <b>{groups.length}</b> 類策略通過下面三關（每類列出最好的參數）：
        </p>
        <ol className="win-criteria">
          <li>前 2/3 期間挑出來、後 1/3 期間（沒看過的資料）也賺錢，而且兩段都比隨機挑股票、持有同樣天數多賺，統計上不是運氣。</li>
          <li>前後兩段每筆平均都賺 1% 以上，成本或滑價多一點也不會變成虧損。</li>
          <li>照訊號實際操作（最多同時 10 檔、每檔 1/10 資金）的帳戶是賺錢的。</li>
        </ol>
        <dl className="bench">
          <div>
            <dt>大盤（加權指數）同期</dt>
            <dd>
              全期 <b className={`num ${tone(r.benchmark.all)}`}>{pct(r.benchmark.all, 1)}</b>，年化{' '}
              <b className={`num ${tone(r.buyHold?.taiex)}`}>{pct(r.buyHold?.taiex, 1)}</b>
            </dd>
          </div>
          <div>
            <dt>等權平均（一般股票）</dt>
            <dd>
              全期 <b className={`num ${tone(r.equalWeight?.all)}`}>{pct(r.equalWeight?.all, 1)}</b>，年化{' '}
              <b className={`num ${tone(r.buyHold?.equalWeight)}`}>{pct(r.buyHold?.equalWeight, 1)}</b>
            </dd>
          </div>
        </dl>
      </section>

      {groups.map((g) => {
        const F = FAMILY[g.family];
        const s = g.list[0].sig ?? {};
        const rules = F ? F.rules(s) : [g.list[0].label];
        const where = F ? (typeof F.where === 'function' ? F.where(s) : F.where) : '';
        return (
          <section key={g.family} className="card win-card">
            <h2>{F?.title ?? g.list[0].familyName}</h2>
            <h3>進場規則</h3>
            <ol className="win-rules">
              {rules.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
            {where && <p className="muted small">在 App 哪裡看：{where}</p>}
            <div className="win-grid">
              {g.list.map((w) => (
                <WinnerRow key={w.id} w={w} exits={r.exits} />
              ))}
            </div>
            {sc.alsoPass?.[g.family]?.length > 0 && (
              <p className="muted small">
                其他也通過的參數（結果較差）：
                {sc.alsoPass[g.family]
                  .map((x) => `${x.label}（每筆 ${pct(x.is)}／${pct(x.oos)}）`)
                  .join('；')}
              </p>
            )}
          </section>
        );
      })}

      <p className="footnote">
        沒有通過的已不列出，包括：{(sc.without ?? []).join('、')}，以及突破 20 日前高、KD、MACD、RSI、布林通道、均線交叉、爆量長紅、追漲停、跳空、外資／投信連買等。
        這 2 年大盤大多在上漲（加權指數 {pct(r.benchmark.all, 0)}），順勢策略在空頭市場不一定有效；千張大戶資料不足沒有回測。過去的結果不代表未來，也不構成投資建議。
      </p>
    </div>
  );
}
