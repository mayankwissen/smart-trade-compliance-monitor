const { useMemo: _tuseM } = React;

window.TopSuspects = function TopSuspects({ alerts, nav }) {
  const t = window.useT();
  const suspects = _tuseM(() => {
    const m = {};
    alerts.forEach(a => {
      if (!m[a.trader_id]) m[a.trader_id] = { id:a.trader_id, score:0, count:0, first:a.alert_id };
      m[a.trader_id].score += a.severity==='HIGH'?3 : a.severity==='MEDIUM'?2 : 1;
      m[a.trader_id].count++;
    });
    return Object.values(m).sort((a,b) => b.score-a.score).slice(0,5);
  }, [alerts]);

  const maxS = suspects[0]?.score || 1;
  const rc = [t.danger,'#f97316',t.warning,t.textSec,t.textMuted];

  return (
    <window.Card style={{ padding:'14px 16px' }}>
      <window.SectionHead title="Top Suspects" />
      {suspects.length === 0
        ? <window.EmptyState icon="🕵️" msg="No suspects yet" />
        : suspects.map((s, i) => (
          <div key={s.id} onClick={() => s.first && nav(`/alert/${s.first}`)}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'7px 0', borderBottom:`1px solid ${t.borderSubtle||t.border}`, cursor:'pointer', borderRadius:4, transition:'background .12s' }}
            onMouseEnter={e => e.currentTarget.style.background=t.rowHover}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:16, color:rc[i], width:24, textAlign:'center', flexShrink:0 }}>#{i+1}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:t.info }}>{s.id}</span>
                <span style={{ background:t.border, color:t.textSec, borderRadius:10, padding:'1px 6px', fontSize:10, fontFamily:"'Inter',sans-serif", fontWeight:700 }}>{s.count}</span>
              </div>
              <div style={{ background:t.borderSubtle||'#1a1a1a', borderRadius:2, height:3 }}>
                <div style={{ height:'100%', background:rc[i], borderRadius:2, width:`${(s.score/maxS)*100}%`, transition:'width .7s ease' }} />
              </div>
            </div>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color:rc[i], width:26, textAlign:'right', flexShrink:0 }}>{s.score}</span>
          </div>
        ))
      }
    </window.Card>
  );
};
