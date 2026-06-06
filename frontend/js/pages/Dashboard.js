const { useState: _duseS, useEffect: _duseE } = React;

window.Dashboard = function Dashboard({ stats, alerts, escalations, nav }) {
  const t = window.useT();
  const [page, setPage] = _duseS(1);
  const [loadingSet, setLoadingSet] = _duseS(new Set());
  const [localAlerts, setLocalAlerts] = _duseS(alerts);
  const [refreshing, setRefreshing] = _duseS(false);
  _duseE(() => setLocalAlerts(alerts), [alerts]);

  const PER = 10;
  const paged = localAlerts.slice((page - 1) * PER, page * PER);
  const pages = Math.ceil(localAlerts.length / PER) || 1;

  const doTriage = async id => {
    setLoadingSet(p => new Set([...p, id]));
    try {
      await fetch(`${window.API_BASE}/api/triage/${id}`, { method: 'POST' });
      const ar = await fetch(`${window.API_BASE}/api/alerts`).then(r => r.json());
      setLocalAlerts(ar.alerts || []);
    } catch {}
    finally { setLoadingSet(p => { const n = new Set(p); n.delete(id); return n; }); }
  };

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      const d = await fetch(`${window.API_BASE}/api/refresh-data`, { method: 'POST' }).then(r => r.json());
      alert(`Refreshed! ${d.trades_inserted || 0} trades generated at live NSE prices.`);
      window.location.reload();
    } catch { alert('Refresh failed — is the backend running?'); }
    finally { setRefreshing(false); }
  };

  return (
    <div className="page-scroll" style={{ background: t.bg }}>
      <div className="main-cols">
        {/* Left 60% */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <window.Card pad={0} style={{ overflow: 'hidden' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="section-title">Alert Feed</span>
                <span style={{ background: t.gold + '22', color: t.gold, borderRadius: 12, padding: '1px 9px', fontSize: 12, fontWeight: 700 }}>{localAlerts.length}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <window.Btn small variant="outline" onClick={doRefresh} disabled={refreshing}>
                  {refreshing ? '⏳ Refreshing…' : '🔄 Refresh Live Data'}
                </window.Btn>
                <window.Btn small variant="ghost" onClick={() => nav('/alerts')}>View All →</window.Btn>
              </div>
            </div>
            <div className="dt-wrap-xl">
              <table className="dt">
                <thead><tr>{['Time', 'Alert ID', 'Trader', 'Instrument', 'Pattern', 'Severity', 'Status', 'Action'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {paged.length === 0 && <tr><td colSpan={8}><window.EmptyState icon="🔍" msg="Click ▶ START REPLAY to detect patterns" /></td></tr>}
                  {paged.map(a => (
                    <window.AlertRow key={a.alert_id} a={a} nav={nav}
                      onTriage={doTriage} isLoading={loadingSet.has(a.alert_id)} />
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10, borderTop: `1px solid ${t.border}` }}>
                <window.Btn small variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</window.Btn>
                <span style={{ color: t.textSec, fontSize: 12 }}>Page {page} / {pages}</span>
                <window.Btn small variant="outline" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</window.Btn>
              </div>
            )}
          </window.Card>
          <window.MiniCharts stats={stats} />
        </div>

        {/* Right 40% */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <window.TopSuspects alerts={localAlerts} nav={nav} />

          <window.Card style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="section-title">Recent Escalations</span>
                <span style={{ background: t.gold + '22', color: t.gold, borderRadius: 12, padding: '1px 9px', fontSize: 12, fontWeight: 700 }}>{escalations.length}</span>
              </div>
              <window.Btn small variant="ghost" onClick={() => nav('/logs')}>View All →</window.Btn>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {escalations.slice(0, 8).map(e => (
                <div key={e.escalation_id}
                  onClick={() => e.alert_id && nav(`/alert/${e.alert_id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: `1px solid ${t.borderSubtle || t.border}`, borderLeft: `3px solid ${window.ESC_COL[e.action_type] || 'transparent'}`, cursor: 'pointer', transition: 'background .12s' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = t.rowHover}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.textMuted, flexShrink: 0 }}>{window.fmtTime(e.created_at)}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: t.gold, fontWeight: 700 }}>{e.alert_id}</span>
                  <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, color: window.ESC_COL[e.action_type] || t.textSec }}>{e.action_type}</span>
                </div>
              ))}
              {escalations.length === 0 && <window.EmptyState icon="📋" msg="No escalations yet" />}
            </div>
          </window.Card>
        </div>
      </div>
    </div>
  );
};
