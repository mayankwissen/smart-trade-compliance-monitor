// Root App component — mounts after all components and pages are loaded
const { useState, useEffect, useRef, useCallback } = React;

function App() {
  const [isDark, setIsDark]       = useState(() => localStorage.getItem('theme') !== 'light');
  const [stats, setStats]         = useState({});
  const [alerts, setAlerts]       = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [prices, setPrices]       = useState({});
  const [isReplaying, setIsReplaying] = useState(false);
  const [subCount, setSubCount]   = useState(0);
  const pollRef  = useRef(null);
  const priceRef = useRef(null);

  const theme = isDark ? window.DARK : window.LIGHT;
  const { page, alertId, traderId, nav } = window.useRoute();

  const toggleTheme = () => {
    setIsDark(d => { localStorage.setItem('theme', d ? 'light' : 'dark'); return !d; });
  };

  const fetchAll = useCallback(async () => {
    try {
      const [a, s, e] = await Promise.all([
        fetch(`${window.API_BASE}/api/alerts`).then(r => r.json()),
        fetch(`${window.API_BASE}/api/stats`).then(r => r.json()),
        fetch(`${window.API_BASE}/api/escalations`).then(r => r.json()),
      ]);
      setAlerts(a.alerts || []);
      setStats(s);
      setEscalations(e.escalations || []);
    } catch {}
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const d = await fetch(`${window.API_BASE}/api/market-prices`).then(r => r.json());
      if (d.prices) setPrices(d.prices);
    } catch {}
  }, []);

  const fetchSubCount = useCallback(async () => {
    try {
      const d = await fetch(`${window.API_BASE}/api/subscribers/count`).then(r => r.json());
      setSubCount(d.count || 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAll(); fetchPrices(); fetchSubCount();
    pollRef.current  = setInterval(fetchAll, 3000);
    priceRef.current = setInterval(fetchPrices, 60000);
    return () => { clearInterval(pollRef.current); clearInterval(priceRef.current); };
  }, []);

  const handleStart = async () => {
    setIsReplaying(true);
    try { await fetch(`${window.API_BASE}/api/replay/start`, { method: 'POST' }); } catch {}
    fetchAll();
  };

  // Apply CSS variables for theme
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--bg',            theme.bg);
    r.style.setProperty('--sidebar-bg',    theme.sidebar);
    r.style.setProperty('--card-bg',       theme.card);
    r.style.setProperty('--border',        theme.border);
    r.style.setProperty('--border-subtle', theme.borderSubtle);
    r.style.setProperty('--gold',          theme.gold);
    r.style.setProperty('--text',          theme.text);
    r.style.setProperty('--text-muted',    theme.textMuted);
    r.style.setProperty('--row-hover',     theme.rowHover);
    r.style.setProperty('--row-selected',  theme.rowSelected);
    document.body.style.background = theme.bg;
    document.body.style.color = theme.text;
  }, [theme]);

  return (
    <window.ThemeCtx.Provider value={theme}>
      <window.Sidebar page={page} nav={nav} />

      <window.Header
        isReplaying={isReplaying}
        onStart={handleStart}
        onStop={() => setIsReplaying(false)}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        subCount={subCount}
        onSubscribe={fetchSubCount}
        nav={nav}
        onRefreshComplete={fetchAll}
      />

      <window.PricePanel prices={prices} />

      <div id="app-main">
        <window.StatsBar stats={stats} />
        <div id="page-content">
          {page === 'dashboard'    && <window.Dashboard stats={stats} alerts={alerts} escalations={escalations} nav={nav} onRefreshComplete={fetchAll} />}
          {page === 'alerts'       && <window.AlertsPage nav={nav} />}
          {page === 'alert-detail' && alertId && <window.AlertDetailPage alertId={alertId} nav={nav} />}
          {page === 'trader-profile' && traderId && <window.TraderProfilePage traderId={traderId} nav={nav} />}
          {page === 'trades'       && <window.TradesPage />}
          {page === 'logs'         && <window.LogsPage nav={nav} />}
          {page === 'settings'     && <window.SettingsPage />}
          {page === 'watchlist'    && <window.WatchlistPage nav={nav} />}
        </div>
      </div>
    </window.ThemeCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
