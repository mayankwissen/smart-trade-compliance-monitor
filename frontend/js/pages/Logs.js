const { useState: _luseS, useEffect: _luseE, useCallback: _luseC } = React;

window.LogsPage = function LogsPage({ nav }) {
  const t = window.useT();
  const [escs, setEscs] = _luseS([]);
  const [total, setTotal] = _luseS(0);
  const [page, setPage] = _luseS(1);
  const [actionFilter, setActionFilter] = _luseS('');
  const PER = 25;

  const fetchEscs = _luseC(async () => {
    try {
      const d = await fetch(`${window.API_BASE}/api/escalations?page=${page}&limit=${PER}`).then(r=>r.json());
      let rows = d.escalations||[];
      if (actionFilter) rows = rows.filter(e => e.action_type===actionFilter);
      setEscs(rows); setTotal(d.total||0);
    } catch {}
  }, [page, actionFilter]);

  _luseE(() => { fetchEscs(); const id=setInterval(fetchEscs,5000); return()=>clearInterval(id); }, [fetchEscs]);

  const exportCSV = () => {
    const h = ['escalation_id','alert_id','action_type','payload','created_at'];
    const rows = escs.map(e => h.map(k => `"${(e[k]||'').toString().replace(/"/g,'""')}"`).join(','));
    const csv = [h.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'escalation-log.csv'; a.click();
  };

  const parseDetails = e => {
    try {
      const p = JSON.parse(e.payload||'{}');
      if (p.case_id)   return `Case: ${p.case_id}`;
      if (p.channel)   return p.channel;
      if (p.trader_id) return `${p.trader_id} · ${p.monitoring_hours}h`;
      if (p.recipients) return `${p.recipients} email(s)`;
      return e.payload||'';
    } catch { return e.payload||''; }
  };

  const pages = Math.ceil(total/PER) || 1;
  const sel = { background:t.inputBg, border:`1px solid ${t.border}`, color:t.text, borderRadius:6, padding:'6px 10px', fontFamily:"'Inter',sans-serif", fontSize:12, cursor:'pointer' };

  return (
    <div className="page-scroll" style={{ background:t.bg }}>
      <window.Card>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
          <div style={{ fontFamily:"'Inter',sans-serif", fontWeight:800, fontSize:22, color:t.text }}>
            Escalation Log <span style={{ color:t.gold }}>{total}</span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <select value={actionFilter} onChange={e=>{setActionFilter(e.target.value);setPage(1);}} style={sel}>
              <option value="">All Actions</option>
              {['CASE_CREATED','SLACK_NOTIFIED','WATCHLIST_FLAGGED','EMAIL_SENT','NO_ESCALATION'].map(a=><option key={a}>{a}</option>)}
            </select>
            <window.Btn small variant="ghost" onClick={exportCSV}>⬇ Export CSV</window.Btn>
          </div>
        </div>
        <div className="dt-wrap" style={{ overflowX:'auto' }}>
          <table className="dt">
            <thead><tr>{['Time','Alert ID','Action','Details'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {escs.length===0 && <tr><td colSpan={4}><window.EmptyState icon="⚡" msg="No escalations yet — triage alerts to see actions" /></td></tr>}
              {escs.map(e => (
                <tr key={e.escalation_id} onClick={() => e.alert_id && nav(`/alert/${e.alert_id}`)}
                  style={{ borderLeft:`3px solid ${window.ESC_COL[e.action_type]||'transparent'}`, cursor:'pointer' }}>
                  <td><span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:t.textMuted }}>{window.fmtDate(e.created_at)}</span></td>
                  <td><span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:t.gold, fontWeight:700 }}>{e.alert_id}</span></td>
                  <td><span style={{ fontFamily:"'Inter',sans-serif", fontWeight:700, fontSize:13, color:window.ESC_COL[e.action_type]||t.textSec }}>{e.action_type}</span></td>
                  <td><span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color:t.textSec }}>{parseDetails(e)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages>1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:14 }}>
            <window.Btn small variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Prev</window.Btn>
            <span style={{ color:t.textSec, fontSize:12 }}>Page {page} / {pages}</span>
            <window.Btn small variant="outline" disabled={page===pages} onClick={()=>setPage(p=>p+1)}>Next →</window.Btn>
          </div>
        )}
      </window.Card>
    </div>
  );
};
