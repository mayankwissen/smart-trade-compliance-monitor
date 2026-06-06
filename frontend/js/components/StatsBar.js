window.StatsBar = function StatsBar({ stats }) {
  const t = window.useT();
  const cards = [
    { label: 'Total Trades',    v: stats.total_trades || 0, border: t.gold,      vc: t.gold },
    { label: 'Alerts Detected', v: stats.total_alerts || 0, border: t.warning,   vc: t.warning },
    { label: 'Escalated',       v: stats.escalated    || 0, border: t.danger,    vc: t.danger },
    { label: 'Dismissed',       v: stats.dismissed    || 0, border: t.success,   vc: t.success },
    { label: 'Pending',         v: stats.pending      || 0, border: t.textMuted, vc: t.textSec },
  ];
  return (
    <div className="stats-grid">
      {cards.map((c, i) => (
        <div key={i} className="stat-card fade-up"
          style={{ borderLeft: `3px solid ${c.border}`, animationDelay: `${i * 50}ms` }}>
          <div className="stat-number" style={{ color: c.vc, fontSize: 32 }}>{window.fmtNum(c.v)}</div>
          <div className="stat-label" style={{ color: t.textMuted }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
};
