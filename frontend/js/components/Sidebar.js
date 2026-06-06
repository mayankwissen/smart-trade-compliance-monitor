window.Sidebar = function Sidebar({ page, nav }) {
  const t = window.useT();
  const links = [
    { icon:'🏠', label:'Dash', to:'/' },
    { icon:'🔔', label:'Alerts', to:'/alerts' },
    { icon:'📊', label:'Trades', to:'/trades' },
    { icon:'⚡', label:'Logs', to:'/logs' },
    { icon:'⚙', label:'Settings', to:'/settings' },
  ];
  const active = page === 'dashboard' ? '/' : page === 'alert-detail' ? '/alerts' : `/${page}`;
  return (
    <div id="app-sidebar">
      {links.map(l => (
        <div key={l.to} title={l.label}
          className={`sidebar-item${active === l.to ? ' active' : ''}`}
          onClick={() => nav(l.to)}>
          <span className="sidebar-icon">{l.icon}</span>
          <span className="sidebar-label">{l.label}</span>
        </div>
      ))}
    </div>
  );
};
