window.Sidebar = function Sidebar({ page, nav }) {
  const t = window.useT();
  const active = page === 'dashboard' ? '/' : page === 'alert-detail' ? '/alerts' : page === 'trader-profile' ? '/alerts' : `/${page}`;

  const links = [
    {
      to: '/', label: 'Dashboard',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
      ),
    },
    {
      to: '/alerts', label: 'Alerts',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      ),
    },
    {
      to: '/trades', label: 'Trades',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      ),
    },
    {
      to: '/logs', label: 'Logs',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
      ),
    },
    {
      to: '/watchlist', label: 'Watch',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      ),
    },
    {
      to: '/settings', label: 'Config',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.07 4.93l-1.41 1.41M4.93 19.07l-1.41-1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/>
        </svg>
      ),
    },
  ];

  return (
    <div id="app-sidebar">
      {/* Shield logomark */}
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: '#f0b42910', border: '1px solid #f0b42930',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 6, flexShrink: 0,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f0b429" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>

      <div style={{ width: 32, height: 1, background: '#1a1a1a', margin: '4px 0 6px' }} />

      {links.map(l => {
        const isActive = active === l.to;
        return (
          <div key={l.to} title={l.label}
            className={`sidebar-item${isActive ? ' active' : ''}`}
            onClick={() => nav(l.to)}>
            <span className="sidebar-icon" style={{ color: isActive ? '#f0b429' : '#404040', display: 'flex' }}>
              {l.icon}
            </span>
            <span className="sidebar-label">{l.label}</span>
          </div>
        );
      })}
    </div>
  );
};
