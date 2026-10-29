import { useEffect, useState } from 'react';
import { getResearch } from '../api.js';
import { Spark } from './Mini.jsx';
import { fmtNum, fmtPct, fmtShortDate, tone } from '../format.js';
import { GROUPS, INDUSTRY_LINKS, BY_ID } from '../../../server/screener/global.js';

export const GMOOD = {
  calm: { label: '國際平穩', cls: 'calm' },
  caution: { label: '國際警戒', cls: 'caution' },
  panic: { label: '國際恐慌', cls: 'panic' },
  unknown: { label: '國際資料不足', cls: 'unknown' },
};

// class 名稱避開版面用的 .side（篩選面板）
const TREND = { up: ['多頭', 'up'], down: ['空頭', 'down'], side: ['盤整', 'sideways'] };
const VOL = { low: '波動低', normal: '正常', high: '波動偏高', extreme: '劇烈波動' };
const DIR = { 1: ['上漲通常有利', 'up'], '-1': ['上漲＝成本增加', 'down'], 0: ['影響不一定', 'neutral'] };

// 殖利率用「基點」，其他用 %
export const fmtChg = (x, kind, d = 1) => (x == null ? '—' : kind === 'yield' ? `${x > 0 ? '+' : ''}${fmtNum(x, 0)} 基點` : fmtPct(x, d));
const fmtLast = (x) => (x.last >= 1000 ? fmtNum(x.last, 0) : x.last >= 100 ? fmtNum(x.last, 1) : fmtNum(x.last, 2));

// 每週連動（相關係數）的強弱
export function corrLabel(c) {
  if (c == null) return { text: '—', cls: 'muted' };
  const a = Math.abs(c);
  const s = c < 0 ? '反向' : '';
  if (a >= 0.5) return { text: `${s}強（${fmtNum(c, 2)}）`, cls: 'c-strong' };
  if (a >= 0.3) return { text: `${s}中（${fmtNum(c, 2)}）`, cls: 'c-mid' };
  return { text: `弱（${fmtNum(c, 2)}）`, cls: 'c-weak' };
}

export function VolChip({ x }) {
  const tip = [
    x.vol20 != null ? `近 20 日${x.kind === 'yield' ? '每日波動' : '年化波動'} ${fmtNum(x.vol20, 1)}${x.kind === 'yield' ? ' 基點' : '%'}` : '',
    x.volPct != null ? `高於過去一年 ${x.volPct}% 的時間` : '',
    x.z1 != null ? `最近一天的漲跌是平常的 ${fmtNum(Math.abs(x.z1), 1)} 倍標準差` : '',
  ]
    .filter(Boolean)
    .join('；');
  return (
    <span className={`gvol ${x.volLevel}`} title={tip}>
      {VOL[x.volLevel] ?? '—'}
      {x.volPct != null && <small>{x.volPct}%</small>}
    </span>
  );
}

export function TrendChip({ t }) {
  const [text, cls] = TREND[t] ?? TREND.side;
  return <span className={`gtr ${cls}`}>{text}</span>;
}

function alertText(x) {
  if (x.z1 != null && Math.abs(x.z1) >= 2) {
    return `最近一天 ${fmtChg(x.chg1, x.kind)}，是平常單日波動的 ${fmtNum(Math.abs(x.z1), 1)} 倍`;
  }
  return `近 20 日波動高於過去一年 ${x.volPct}% 的時間（5 日 ${fmtChg(x.chg5, x.kind)}）`;
}

function EventLine({ ev, level }) {
  const row = ev?.rows?.find((r) => r.id === level);
  if (!row?.n) return null;
  return (
    <p className="g-ev">
      過去 2 年出現「{GMOOD[level].label}」的 {row.n} 天{level === 'calm' ? '' : `（${row.episodes} 段行情）`}：台股當天平均{' '}
      <b className={`num ${tone(row.day)}`}>{fmtPct(row.day, 2)}</b>、{fmtNum(row.dayUp, 0)}% 上漲；之後 5 天平均{' '}
      <b className={`num ${tone(row.next5)}`}>{fmtPct(row.next5, 2)}</b>、{fmtNum(row.next5Up, 0)}% 上漲。全部交易日平均：當天{' '}
      {fmtPct(ev.all.day, 2)}、5 天 {fmtPct(ev.all.next5, 2)}。
    </p>
  );
}

export default function GlobalView({ global }) {
  const [res, setRes] = useState(undefined);
  useEffect(() => {
    getResearch()
      .then((r) => setRes(r?.global ?? null))
      .catch(() => setRes(null));
  }, []);

  if (!global?.items?.length) {
    return <div className="empty">還沒有國際行情資料，下一次自動更新後就會出現。</div>;
  }
  const mood = global.mood;
  const m = GMOOD[mood.level] ?? GMOOD.unknown;
  const alerts = global.items.filter((x) => x.volLevel === 'extreme' || x.volLevel === 'high');
  const byGroup = Object.keys(GROUPS).map((g) => [g, global.items.filter((x) => x.group === g)]);
  const byId = Object.fromEntries(global.items.map((x) => [x.id, x]));
  // 原物料相關的產業排前面，電子類（對應美股）排後面
  const isCommodity = (list) => list.some(([id]) => ['energy', 'metal', 'agri', 'freight'].includes(BY_ID[id]?.group));
  const indOrder = Object.entries(INDUSTRY_LINKS).sort((a, b) => isCommodity(b[1]) - isCommodity(a[1]));
  const mapped = indOrder.flatMap(([ind, list]) =>
    list.map(([id, dir, why], k) => ({ ind, id, dir, why, first: k === 0, span: list.length, corr: res?.links?.[ind]?.corr?.[id] ?? null })),
  );

  return (
    <div className="global-view">
      <section className={`panic-banner ${m.cls}`}>
        <div>
          <h2>{m.label}</h2>
          <p>
            {mood.reasons?.length ? mood.reasons.join('、') : '費半、美股、VIX、台幣、美債都在正常範圍。'}
          </p>
          <p className="small">
            美股資料日 {fmtShortDate(global.asOf)}（美國收盤後才更新，台股要隔天才反應；每個交易日早上 07:20 自動更新）
          </p>
          {res && <EventLine ev={res.events} level={mood.level} />}
        </div>
        <dl>
          {['SOX', 'SPX', 'VIX', 'USDTWD'].map((id) =>
            byId[id] ? (
              <div key={id}>
                <dt>{byId[id].name}</dt>
                <dd className={`num ${id === 'VIX' || id === 'USDTWD' ? '' : tone(byId[id].chg1)}`}>
                  {id === 'VIX' ? fmtNum(byId[id].last, 1) : fmtChg(byId[id].chg1, byId[id].kind, 2)}
                </dd>
              </div>
            ) : null,
          )}
        </dl>
      </section>

      <section className="card">
        <h2>波動警示</h2>
        {alerts.length ? (
          <ul className="g-alerts">
            {alerts.map((x) => (
              <li key={x.id} className={x.volLevel}>
                <b>{x.name}</b>
                <span>{alertText(x)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">目前沒有指標出現異常波動。</p>
        )}
        <p className="muted small">
          「波動偏高」＝近 20 日波動高於過去一年 80% 的時間，或最近一天的漲跌超過平常的 2 倍標準差；「劇烈」＝95% 或 3 倍。
        </p>
      </section>

      {byGroup.map(([g, items]) =>
        items.length ? (
          <section key={g} className="card">
            <h2>{GROUPS[g]}</h2>
            <div className="table-scroll">
              <table className="bt-table g-table">
                <thead>
                  <tr>
                    <th>指標</th>
                    <th>最新</th>
                    <th>1 日</th>
                    <th>5 日</th>
                    <th>20 日</th>
                    <th>趨勢</th>
                    <th>波動</th>
                    <th>近 60 日</th>
                    <th>連動最強的台股產業</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((x) => (
                    <tr key={x.id}>
                      <th scope="row">
                        {x.name}
                        {x.note && <small>{x.note}</small>}
                      </th>
                      <td className="num">
                        {fmtLast(x)}
                        <small className="muted"> {fmtShortDate(x.date)}</small>
                      </td>
                      <td className={`num ${tone(x.chg1)}`}>{fmtChg(x.chg1, x.kind, 2)}</td>
                      <td className={`num ${tone(x.chg5)}`}>{fmtChg(x.chg5, x.kind)}</td>
                      <td className={`num ${tone(x.chg20)}`}>{fmtChg(x.chg20, x.kind)}</td>
                      <td>
                        <TrendChip t={x.trend} />
                      </td>
                      <td>
                        <VolChip x={x} />
                      </td>
                      <td>
                        <Spark values={x.spark ?? []} width={90} height={24} className={tone(x.chg20)} />
                      </td>
                      <td className="g-top">
                        {res === undefined
                          ? '…'
                          : (res?.topByInst?.[x.id] ?? []).slice(0, 2).map(([ind, c]) => (
                              <span key={ind} className={corrLabel(c).cls}>
                                {ind} {fmtNum(c, 2)}
                              </span>
                            ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null,
      )}

      <section className="card">
        <h2>原物料與台股產業</h2>
        <p className="muted small">
          「一般關係」是產業常識；「每週連動」是過去約 2 年，產業平均股價和該指標每週漲跌的相關係數（1 代表完全同步、0 代表沒關係）。
          {res?.weeks ? `共 ${res.weeks} 週。` : ''}美股與期貨用台股前一天的收盤對齊。
        </p>
        <div className="table-scroll">
          <table className="bt-table g-table">
            <thead>
              <tr>
                <th>產業</th>
                <th>相關指標</th>
                <th>一般關係</th>
                <th>指標 5 日</th>
                <th>指標 20 日</th>
                <th>波動</th>
                <th>每週連動</th>
              </tr>
            </thead>
            <tbody>
              {mapped.map((r) => {
                const x = byId[r.id];
                const [dText, dCls] = DIR[r.dir];
                const cl = corrLabel(r.corr);
                return (
                  <tr key={r.ind + r.id} className={r.first ? 'g-first' : ''}>
                    {r.first && (
                      <th scope="rowgroup" rowSpan={r.span}>
                        {r.ind}
                      </th>
                    )}
                    <td>
                      {BY_ID[r.id]?.name}
                      <small>{r.why}</small>
                    </td>
                    <td>
                      <span className={`gdir ${dCls}`}>{dText}</span>
                    </td>
                    <td className={`num ${tone(x?.chg5)}`}>{fmtChg(x?.chg5, x?.kind)}</td>
                    <td className={`num ${tone(x?.chg20)}`}>{fmtChg(x?.chg20, x?.kind)}</td>
                    <td>{x ? <VolChip x={x} /> : '—'}</td>
                    <td className={cl.cls}>{res === undefined ? '…' : cl.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          過去 2 年，電子類股和費半、那斯達克連動很強；銅價和電線電纜、散裝運價和航運有中度連動；油價和塑化、鋼價和鋼鐵、穀物和食品股每週幾乎沒有連動，
          原物料大漲大跌時不一定會反映在這些股票上。
        </p>
      </section>

      {res?.events?.rows?.length > 0 && (
        <section className="card">
          <h2>國際狀況出現後，台股怎麼走？</h2>
          <p className="muted small">
            用台股開盤前已經知道的國際行情（美股算到前一晚）。「當天」＝加權指數當天漲跌；「之後 5 天」＝從當天收盤再往後 5 個交易日。
          </p>
          <div className="table-scroll">
            <table className="bt-table research-table">
              <thead>
                <tr>
                  <th>情況</th>
                  <th>天數</th>
                  <th>段數</th>
                  <th>當天平均</th>
                  <th>當天上漲</th>
                  <th>之後 5 天平均</th>
                  <th>5 天上漲</th>
                </tr>
              </thead>
              <tbody>
                {res.events.rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.label}</th>
                    <td className="num">{r.n}</td>
                    <td className="num">{r.episodes ?? '—'}</td>
                    <td className={`num ${tone(r.day)}`}>{fmtPct(r.day, 2)}</td>
                    <td className="num">{r.n ? `${fmtNum(r.dayUp, 0)}%` : '—'}</td>
                    <td className={`num ${tone(r.next5)}`}>{fmtPct(r.next5, 2)}</td>
                    <td className="num">{r.n ? `${fmtNum(r.next5Up, 0)}%` : '—'}</td>
                  </tr>
                ))}
                <tr className="baseline">
                  <th scope="row">對照：所有交易日</th>
                  <td className="num">{res.events.all.n}</td>
                  <td />
                  <td className={`num ${tone(res.events.all.day)}`}>{fmtPct(res.events.all.day, 2)}</td>
                  <td className="num">{fmtNum(res.events.all.dayUp, 0)}%</td>
                  <td className={`num ${tone(res.events.all.next5)}`}>{fmtPct(res.events.all.next5, 2)}</td>
                  <td className="num">{fmtNum(res.events.all.next5Up, 0)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted small">
            「段數」＝相隔超過 10 個交易日才算新的一段，段數少代表結果可能只來自少數幾次事件。這 2 年大盤大多在上漲，國際利空後的反彈在空頭市場不一定會出現。
          </p>
        </section>
      )}

      <p className="footnote">
        資料來源：Yahoo Finance（期貨為近月合約，換月時可能有跳動）。國際燈號門檻：VIX 22／30、費半單日 −3%／−5%、費半 5 日 −6%／−10%、S&P 500
        距 20 日高 −8%、台幣 5 日貶 1.2%、美債殖利率 5 日 +25 基點。過去結果不代表未來，也不構成投資建議。
      </p>
    </div>
  );
}
