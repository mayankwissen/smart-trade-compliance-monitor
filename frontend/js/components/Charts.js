const { useRef: _cuseRef, useEffect: _cuseEffect } = React;

window.MiniCharts = function MiniCharts({ stats }) {
  const t = window.useT();
  const dRef = _cuseRef(null); const dInst = _cuseRef(null);
  const bRef = _cuseRef(null); const bInst = _cuseRef(null);
  const p = stats.patterns || {};

  _cuseEffect(() => {
    if (!dRef.current) return;
    if (dInst.current) dInst.current.destroy();
    const total = (p.layering||0) + (p.spoofing||0) + (p.wash_trading||0);
    dInst.current = new Chart(dRef.current.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Layering','Spoofing','Wash Trading'],
        datasets: [{ data:[p.layering||0,p.spoofing||0,p.wash_trading||0], backgroundColor:['#6366f1','#ef4444','#f97316'], borderColor:t.card, borderWidth:3, hoverOffset:6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout:'70%',
        plugins: {
          legend: { position:'right', labels:{ color:t.textSec, font:{ family:"'Inter',sans-serif", size:11 }, padding:8, boxWidth:10 } },
          tooltip: { backgroundColor:t.card, titleColor:t.text, bodyColor:t.textSec, borderColor:t.border, borderWidth:1 },
        },
      },
      plugins: [{
        id:'ct',
        afterDraw(c) {
          const { ctx, chartArea:{top,bottom,left,right} } = c;
          const cx=(left+right)/2, cy=(top+bottom)/2;
          ctx.save();
          ctx.font=`bold 20px 'JetBrains Mono',monospace`;
          ctx.fillStyle=t.text; ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(total, cx, cy-5);
          ctx.font=`9px 'Inter',sans-serif`;
          ctx.fillStyle=t.textMuted; ctx.fillText('ALERTS', cx, cy+10);
          ctx.restore();
        },
      }],
    });
    return () => { if (dInst.current) dInst.current.destroy(); };
  }, [JSON.stringify(p), t.card]);

  _cuseEffect(() => {
    if (!bRef.current) return;
    if (bInst.current) bInst.current.destroy();
    const hi = stats.high_severity||0, tot = stats.total_alerts||0, dis = stats.dismissed||0;
    bInst.current = new Chart(bRef.current.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['HIGH','MEDIUM','LOW'],
        datasets: [{ data:[hi, Math.max(0,tot-hi-dis), dis], backgroundColor:['#ef4444','#f59e0b','#22c55e'], borderRadius:5, borderSkipped:false }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend:{display:false}, tooltip:{ backgroundColor:t.card, titleColor:t.text, bodyColor:t.textSec, borderColor:t.border, borderWidth:1 } },
        scales: {
          x: { ticks:{ color:t.textMuted, font:{ family:"'Inter',sans-serif", size:10 } }, grid:{ color:t.borderSubtle||'#1a1a1a' } },
          y: { ticks:{ color:t.textMuted, font:{ family:"'Inter',sans-serif", size:10 } }, grid:{ color:t.borderSubtle||'#1a1a1a' }, beginAtZero:true },
        },
      },
    });
    return () => { if (bInst.current) bInst.current.destroy(); };
  }, [stats.high_severity, stats.total_alerts, stats.dismissed, t.card]);

  return (
    <window.Card style={{ display:'flex', overflow:'hidden', padding:0, marginTop:10 }}>
      <div style={{ flex:1, padding:'12px 16px', borderRight:`1px solid ${t.border}`, display:'flex', flexDirection:'column' }}>
        <div className="section-title" style={{ marginBottom:8 }}>Alerts by Pattern</div>
        <div className="chart-container"><canvas ref={dRef} /></div>
      </div>
      <div style={{ flex:1, padding:'12px 16px', display:'flex', flexDirection:'column' }}>
        <div className="section-title" style={{ marginBottom:8 }}>Severity Distribution</div>
        <div className="chart-container"><canvas ref={bRef} /></div>
      </div>
    </window.Card>
  );
};
