import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDefaults, getScreen, getStatus, startUpdate } from './api.js';
import MarketBar from './components/MarketBar.jsx';
import FilterPanel from './components/FilterPanel.jsx';
import ResultList from './components/ResultList.jsx';
import PanicView from './components/PanicView.jsx';
import StockDrawer from './components/StockDrawer.jsx';
import StatusView from './components/StatusView.jsx';
import ResonanceRings from './components/ResonanceRings.jsx';

const LS_KEY = 'screener.params.v1';
const loadSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
  } catch {
    return null;
  }
};

export default function App() {
  const [defaults, setDefaults] = useState(null);
  const [params, setParams] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('list');
  const [picked, setPicked] = useState(null);
  const [onlyAll, setOnlyAll] = useState(false);
  const [onlyEntry, setOnlyEntry] = useState(false);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    getDefaults()
      .then((d) => {
        setDefaults(d);
        setParams({ ...d, ...(loadSaved() ?? {}) });
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async (p) => {
    setLoading(true);
    setError('');
    try {
      setData(await getScreen(p));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (params) load(params);
  }, [params, load]);

  // 更新進行中時輪詢狀態，跑完自動重新篩選
  const refreshStatus = useCallback(async () => {
    try {
      const s = await getStatus();
      setStatus(s);
      if (wasRunning.current && !s.job.running && params) load(params);
      wasRunning.current = s.job.running;
    } catch {
      /* 狀態抓不到不影響主畫面 */
    }
  }, [params, load]);

  useEffect(() => {
    refreshStatus();
    const t = setInterval(refreshStatus, status?.job?.running ? 3000 : 30000);
    return () => clearInterval(t);
  }, [refreshStatus, status?.job?.running]);

  const apply = (p) => {
    setParams(p);
    localStorage.setItem(LS_KEY, JSON.stringify(p));
    setFiltersOpen(false);
  };

  const doUpdate = async (backfill) => {
    try {
      await startUpdate(backfill);
      wasRunning.current = true;
      setTab('status');
      refreshStatus();
    } catch (e) {
      setError(e.message);
    }
  };

  const rows = useMemo(() => {
    let r = data?.list ?? [];
    if (onlyAll) r = r.filter((x) => x.pillars.f && x.pillars.c && x.pillars.t);
    if (onlyEntry) r = r.filter((x) => x.entry);
    const q = query.trim();
    if (q) r = r.filter((x) => x.code.includes(q) || x.n.includes(q) || x.ind?.includes(q));
    return r;
  }, [data, onlyAll, onlyEntry, query]);

  const counts = useMemo(() => {
    const l = data?.list ?? [];
    return {
      all3: l.filter((x) => x.pillars.f && x.pillars.c && x.pillars.t).length,
      entry: l.filter((x) => x.entry).length,
    };
  }, [data]);

  const noData = data && data.coverage.prices.days === 0;
  const running = status?.job?.running;

  return (
    <div className={`app${picked ? ' has-drawer' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <ResonanceRings pillars={{ f: true, c: true, t: true }} size={34} />
          <div>
            <h1>三重共振選股</h1>
            <p>基本面爆發 × 籌碼進駐 × 技術面突破</p>
          </div>
        </div>
        <MarketBar market={data?.market} asOf={data?.asOf} />
        <div className="top-actions">
          {running ? (
            <button type="button" className="ghost running" onClick={() => setTab('status')}>
              更新中 {status.job.total ? `${status.job.done}/${status.job.total}` : ''}
            </button>
          ) : (
            <button type="button" className="ghost" onClick={() => doUpdate(false)}>
              更新資料
            </button>
          )}
        </div>
      </header>

      <nav className="tabs" aria-label="檢視">
        <button type="button" className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>
          共振名單<span className="num">{data?.list.length ?? '—'}</span>
        </button>
        <button type="button" className={tab === 'panic' ? 'on' : ''} onClick={() => setTab('panic')}>
          錯殺逆勢<span className="num">{data?.panic.length ?? '—'}</span>
        </button>
        <button type="button" className={tab === 'status' ? 'on' : ''} onClick={() => setTab('status')}>
          資料狀態
          {data?.coverage.warnings.length ? <span className="warn-dot" aria-label="有資料提醒" /> : null}
        </button>
        {tab !== 'status' && (
          <button type="button" className="filters-toggle" onClick={() => setFiltersOpen((x) => !x)}>
            篩選
          </button>
        )}
      </nav>

      <div className="layout">
        {tab !== 'status' && params && defaults && (
          <div className={`side${filtersOpen ? ' open' : ''}`}>
            <FilterPanel params={params} defaults={defaults} onApply={apply} onClose={() => setFiltersOpen(false)} />
          </div>
        )}

        <main className="main">
          {error && <div className="error">{error}</div>}

          {noData && tab !== 'status' && (
            <section className="onboard">
              <h2>{running ? '正在建立歷史資料' : '還沒有資料'}</h2>
              <p>
                第一次使用要先抓近 4 個月的股價、法人、營收、毛利率與集保資料。證交所有限速，大約 15–25 分鐘，
                跑完名單會自動出現。這段時間電腦不要關機或睡眠。
              </p>
              {running ? (
                <div className="progress">
                  <p>
                    {status.job.stage}
                    {status.job.total ? `（${status.job.done}/${status.job.total}）` : ''}
                  </p>
                  <div className="pbar">
                    <i style={{ width: status.job.total ? `${(status.job.done / status.job.total) * 100}%` : '8%' }} />
                  </div>
                </div>
              ) : (
                <button type="button" className="primary" onClick={() => doUpdate(true)}>
                  建立歷史資料
                </button>
              )}
            </section>
          )}

          {tab === 'list' && data && !noData && (
            <>
              {data.coverage.warnings.length > 0 && (
                <ul className="warn-list compact">
                  {data.coverage.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <div className="toolbar">
                <label className="chk">
                  <input type="checkbox" checked={onlyAll} onChange={(e) => setOnlyAll(e.target.checked)} />
                  只看三者皆過<span className="num">{counts.all3}</span>
                </label>
                <label className="chk">
                  <input type="checkbox" checked={onlyEntry} onChange={(e) => setOnlyEntry(e.target.checked)} />
                  只看有進場訊號<span className="num">{counts.entry}</span>
                </label>
                <input
                  type="search"
                  className="search"
                  placeholder="代號、名稱或產業"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="搜尋"
                />
                {loading && <span className="muted small">篩選中…</span>}
              </div>
              <ResultList
                rows={rows}
                threshold={params?.revYoyMin ?? 20}
                onPick={setPicked}
                selected={picked}
                empty={
                  data.list.length
                    ? '沒有符合目前勾選條件的股票，取消上方勾選看看。'
                    : `今天全市場 ${data.universe} 檔中，沒有同時通過基本面與籌碼面的股票。可以在左側放寬條件，或關掉「名單必須通過籌碼」。`
                }
              />
              <p className="footnote">
                分數綜合營收年增、毛利率改善幅度、大戶增減、投信買超與技術訊號，只用來排序。本工具依公開資料計算，不構成投資建議。
              </p>
            </>
          )}

          {tab === 'panic' && data && !noData && <PanicView data={data} onPick={setPicked} selected={picked} />}

          {tab === 'status' && <StatusView status={status} coverage={data?.coverage} onUpdate={doUpdate} />}
        </main>
      </div>

      {picked && <StockDrawer code={picked} params={params} onClose={() => setPicked(null)} />}
    </div>
  );
}
