import { useEffect, useState } from 'react';
import { runDiagnose, lastDiagnose, STATIC, REPO } from '../api.js';
import { fmtDate, fmtShortDate } from '../format.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString('zh-TW', { hour12: false }) : '—');

export default function StatusView({ status, coverage, onUpdate }) {
  const [diag, setDiag] = useState(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const job = status?.job;

  useEffect(() => {
    lastDiagnose()
      .then((d) => d.results?.length && setDiag(d))
      .catch(() => {});
  }, []);

  const doDiag = async () => {
    setDiagBusy(true);
    try {
      setDiag(await runDiagnose());
    } catch (e) {
      setDiag({ error: e.message, results: [] });
    } finally {
      setDiagBusy(false);
    }
  };

  const cov = coverage;
  return (
    <div className="status-view">
      {STATIC ? (
        <section className="card">
          <h2>資料更新</h2>
          <p>上次更新：{when(status?.updated?.lastRun)}</p>
          <p className="muted small">
            GitHub 會在每個交易日 18:40、週六 10:30 自動抓資料並更新這個頁面；每個交易日早上 07:20 另外更新國際行情（GitHub 的排程偶爾會延遲半小時左右）。
            想立刻更新，到 GitHub 的 Actions 分頁，選「每日更新」按 Run workflow。
          </p>
          {REPO && (
            <div className="row-actions">
              <a className="ghost" href={`https://github.com/${REPO}/actions`} target="_blank" rel="noreferrer">
                打開 GitHub Actions
              </a>
            </div>
          )}
        </section>
      ) : (
      <section className="card">
        <h2>資料更新</h2>
        {job?.running ? (
          <div className="progress">
            <p>
              {job.kind === 'backfill' ? '建立歷史資料中' : '更新中'}：{job.stage}
              {job.total ? `（${job.done}/${job.total}）` : ''}
            </p>
            <div className="pbar">
              <i style={{ width: job.total ? `${(job.done / job.total) * 100}%` : '8%' }} />
            </div>
            <p className="muted small">證交所限制連線速度，第一次建立約需 15–25 分鐘，可以先關掉頁面。</p>
          </div>
        ) : (
          <p>
            上次更新：{when(status?.updated?.lastRun)}
            {job?.errors?.length ? `，${job.errors.length} 個警告` : ''}
          </p>
        )}
        <div className="row-actions">
          <button type="button" className="primary" disabled={job?.running} onClick={() => onUpdate(false)}>
            更新今天資料
          </button>
          <button type="button" className="ghost" disabled={job?.running} onClick={() => onUpdate(true)}>
            建立／補齊歷史資料
          </button>
        </div>
        <p className="muted small">伺服器開著時，每個交易日 17:40 會自動更新，週六 10:30 抓集保股權分散表。</p>
      </section>
      )}

      {cov && (
        <section className="card">
          <h2>目前資料</h2>
          <dl className="cov">
            <div>
              <dt>股價</dt>
              <dd>
                {cov.prices.days} 個交易日（{fmtDate(cov.prices.from)} – {fmtDate(cov.prices.to)}）
              </dd>
            </div>
            <div>
              <dt>月營收</dt>
              <dd>{cov.revenue.length ? cov.revenue.join('、') : '無'}</dd>
            </div>
            <div>
              <dt>營益分析</dt>
              <dd>{cov.margins.length ? cov.margins.join('、') : '無'}（累計數，系統會還原成單季）</dd>
            </div>
            <div>
              <dt>千張大戶</dt>
              <dd>{cov.holders.length ? cov.holders.map(fmtShortDate).join('、') : '無'}</dd>
            </div>
            <div>
              <dt>國際行情</dt>
              <dd>{cov.global?.items ? `${cov.global.items} 項（到 ${fmtDate(cov.global.to)}）` : '無'}</dd>
            </div>
            <div>
              <dt>法人</dt>
              <dd>
                {cov.inst.days} 天（到 {fmtDate(cov.inst.to)}）
              </dd>
            </div>
          </dl>
          {cov.warnings.length > 0 && (
            <ul className="warn-list">
              {cov.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!STATIC && (
      <section className="card">
        <h2>資料來源檢查</h2>
        <p className="muted small">逐一連到證交所、櫃買、觀測站、集保，看哪個抓不到。約需 1 分鐘。</p>
        <button type="button" className="ghost" disabled={diagBusy} onClick={doDiag}>
          {diagBusy ? '檢查中…' : '開始檢查'}
        </button>
        {diag?.error && <p className="error">{diag.error}</p>}
        {diag?.results?.length > 0 && (
          <ul className="diag">
            {diag.results.map((r) => (
              <li key={r.name} className={r.ok ? 'ok' : 'bad'}>
                <b>{r.ok ? '正常' : '失敗'}</b>
                <span>{r.name}</span>
                <small>{r.ok ? r.sample : r.error}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {status?.log?.length > 0 && (
        <section className="card">
          <h2>紀錄</h2>
          <ol className="log">
            {status.log.map((l, i) => (
              <li key={i} className={l.level}>
                <time>{when(l.t)}</time>
                <span>{l.msg}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
