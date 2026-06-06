const { useState: _auseS, useEffect: _auseE, useCallback: _auseC } = React;

window.AlertsPage = function AlertsPage({ nav }) {
  const t = window.useT();
  const [alerts, setAlerts] = _auseS([]);
  const [total, setTotal] = _auseS(0);
  const [page, setPage] = _auseS(1);
  const [pattern, setPattern] = _auseS('');
  const [severity, setSeverity] = _auseS('');
  const [status, setStatus] = _auseS('');
  const [search, setSearch] = _auseS('');
  const [loadingSet, setLoadingSet] = _auseS(new Set());
  const [autoRunning, setAutoRunning] = _auseS(false);
  const PER = 20;

  const fetchAlerts = _auseC(async () => {
    const q = new URLSearchParams({ page, limit:PER });
    if (pattern)  q.set('pattern_type', pattern);
    if (severity) q.set('severity', severity);
    if (status)   q.set('status', status);
    if (search)   q.set('search', search);
    try {
      const d = await fetch(`${window.API_BASE}/api/alerts?${q}`).then(r=>r.json());
      setAlerts(d.alerts||[]); setTotal(d.total||0);
    } catch {}
  }, [page, pattern, severity, status, search]);

  _auseE(() => { fetchAlerts(); }, [fetchAlerts]);

  const doTriage = async id => {
    setLoadingSet(p => new Set([...p, id]));
    try { await fetch(`${window.API_BASE}/api/triage/${id}`, { method:'POST' }); await fetchAlerts(); }
    catch {}
    finally { setLoadingSet(p => { const n=new Set(p); n.delete(id); return n; }); }
  };

  const doAutoTriage = async () => {
    setAutoRunning(true);
    for (const a of alerts.filter(a => a.status==='PENDING')) {
      await doTriage(a.alert_id);
      await new Promise(r => setTimeout(r, 600));
    }
    setAutoRunning(false);
  };

  const pages = Math.ceil(total/PER) || 1;
  const pending = alerts.filter(a => a.status==='PENDING').length;
  const sel = { background:t.inputBg, border:`1px solid ${t.border}`, color:t.text, borderRadius:6, padding:'6px 10px', fontFamily:"'Inter',sans-serif", fontSize:12, cursor:'pointer' };

  return (
    <div className="page-scroll" style={{ background:t.bg }}>
      <window.Card>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
          <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:22, color:t.text }}>
            Alert Feed <span style={{ color:t.gold }}>{total}</span>
          </div>
          <window.Btn onClick={doAutoTriage} disabled={autoRunning||pending===0}>
            {autoRunning ? <><window.Spinner /> Triaging…</> : `Auto-Triage All${pending>0?` (${pending})`:''}`}
          </window.Btn>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          <select value={pattern} onChange={e=>{setPattern(e.target.value);setPage(1);}} style={sel}>
            <option value="">All Patterns</option>
            {['LAYERING','SPOOFING','WASH_TRADING','PUMP_AND_DUMP'].map(p=><option key={p}>{p}</option>)}
          </select>
          <select value={severity} onChange={e=>{setSeverity(e.target.value);setPage(1);}} style={sel}>
            <option value="">All Severity</option>
            {['HIGH','MEDIUM','LOW'].map(s=><option key={s}>{s}</option>)}
          </select>
          <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}} style={sel}>
            <option value="">All Status</option>
            {['PENDING','ESCALATED','DISMISSED'].map(s=><option key={s}>{s}</option>)}
          </select>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search trader / alert ID…"
            style={{ ...sel, flex:1, minWidth:160, fontFamily:"'JetBrains Mono',monospace" }} />
        </div>
        <div className="dt-wrap" style={{ overflowX:'auto' }}>
          <table className="dt">
            <thead><tr>{['Time','Alert ID','Trader','Instrument','Pattern','Severity','Status','Action'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {alerts.length===0 && <tr><td colSpan={8}><window.EmptyState icon="🔍" msg="No alerts match your filters" /></td></tr>}
              {alerts.map(a => (
                <window.AlertRow key={a.alert_id} a={a} nav={nav}
                  onTriage={doTriage} isLoading={loadingSet.has(a.alert_id)} />
              ))}
            </tbody>
          </table>
        </div>
        {pages>1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:14 }}>
            <window.Btn small variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Prev</window.Btn>
            <span style={{ color:t.textSec, fontSize:12 }}>Page {page} / {pages} · {total} alerts</span>
            <window.Btn small variant="outline" disabled={page===pages} onClick={()=>setPage(p=>p+1)}>Next →</window.Btn>
          </div>
        )}
      </window.Card>
    </div>
  );
};
