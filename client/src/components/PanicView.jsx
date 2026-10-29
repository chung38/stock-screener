import ResonanceRings from './ResonanceRings.jsx';
import { fmtNum, fmtPct, tone, MOOD } from '../format.js';
import { GMOOD } from './GlobalView.jsx';

// 依「策略績效」頁 2 年回測：只有大盤恐慌時逆勢買進才賺錢；大盤沒恐慌時買跌深股平均是虧的
const ADVICE = {
  panic: '大盤正處於恐慌賣壓。下面這些公司營收仍在成長，股價卻被一起殺低。回測中，大盤恐慌時買進這類股票、持有約 10 個交易日，平均每筆扣成本後約 +2～5%；務必先設好停損。',
  caution: '大盤偏弱但還不到恐慌。回測中，大盤沒有恐慌時買進跌深股，平均扣成本後是虧的。名單先放進觀察，等大盤真的恐慌或止跌再考慮。',
  calm: '大盤目前平穩。這裡是個股自己跌深、但營收仍強的公司，多半有個別利空。回測中，大盤沒有恐慌時買進跌深股，平均扣成本後是虧的，只建議觀察。',
  unknown: '大盤資料不足，先建立歷史資料。',
};

export default function PanicView({ data, onPick, selected }) {
  const { market, panic, global } = data;
  const mood = MOOD[market?.level] ?? MOOD.unknown;
  const gm = global?.mood;
  return (
    <div className="panic-view">
      <section className={`panic-banner ${mood.cls}`}>
        <div>
          <h2>{mood.label}</h2>
          <p>{ADVICE[market?.level ?? 'unknown']}</p>
          {gm && gm.level !== 'unknown' && (
            <p className="small">
              國際：<b>{GMOOD[gm.level].label}</b>
              {gm.reasons?.length ? `（${gm.reasons.join('、')}）` : ''}。回測中國際利空隔天台股常跟著跌，但之後 5 天平均反彈較大，細節見「國際與原物料」。
            </p>
          )}
        </div>
        {market?.level && market.level !== 'unknown' && (
          <dl>
            <div>
              <dt>單日</dt>
              <dd className={`num ${tone(market.day)}`}>{fmtPct(market.day, 2)}</dd>
            </div>
            <div>
              <dt>近 5 日</dt>
              <dd className={`num ${tone(market.d5)}`}>{fmtPct(market.d5, 2)}</dd>
            </div>
            <div>
              <dt>距 20 日高</dt>
              <dd className={`num ${tone(market.fromHigh)}`}>{fmtPct(market.fromHigh, 2)}</dd>
            </div>
            <div>
              <dt>季線</dt>
              <dd>{market.belowMA60 == null ? '—' : market.belowMA60 ? '跌破' : '之上'}</dd>
            </div>
          </dl>
        )}
      </section>

      {!panic.length ? (
        <div className="empty">目前沒有「營收仍強但股價被殺深」的股票。條件可在左側「流動性與錯殺」調整。</div>
      ) : (
        <div className="panic-list">
          {panic.map((row) => (
            <button
              type="button"
              key={row.code}
              className={`panic-card${selected === row.code ? ' sel' : ''}`}
              onClick={() => onPick(row.code)}
            >
              <header>
                <ResonanceRings pillars={row.pillars} size={26} />
                <b className="num">{row.code}</b>
                <span>{row.n}</span>
                <span className="num pc-close">
                  {fmtNum(row.tech.close)} <small className={tone(row.tech.chg)}>{fmtPct(row.tech.chg, 2)}</small>
                </span>
              </header>
              <dl className="pc-stats">
                <div>
                  <dt>距 20 日高</dt>
                  <dd className="num down">{fmtPct(row.tech.dropHigh20)}</dd>
                </div>
                <div>
                  <dt>月線乖離</dt>
                  <dd className="num">{fmtPct(row.tech.bias20)}</dd>
                </div>
                <div>
                  <dt>RSI 6</dt>
                  <dd className="num">{fmtNum(row.tech.rsi6, 0)}</dd>
                </div>
                <div>
                  <dt>營收年增</dt>
                  <dd className="num up">{fmtPct(row.rev.avgYoy, 0)}</dd>
                </div>
                <div>
                  <dt>毛利率</dt>
                  <dd>{row.gm.status !== 'ok' ? '資料不足' : row.gm.pass ? '連續改善' : '未改善'}</dd>
                </div>
              </dl>
              <div className="plan">
                <span>
                  停損 <b className="num">{fmtNum(row.plan.stop)}</b>
                </span>
                {row.plan.target1 && (
                  <span>
                    反彈至週線 <b className="num">{fmtNum(row.plan.target1)}</b>
                  </span>
                )}
                <span>
                  月線 <b className="num">{fmtNum(row.plan.target2)}</b>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="footnote">
        停損＝近 5 日最低價再下 3%；週線、月線只是均線位置，不是預測。回測中「反彈到週線就賣」平均是虧的，持有約 10
        個交易日的結果最好。股價已還原權息，除息造成的跳空不算下跌。過去結果不代表未來。
      </p>
    </div>
  );
}
