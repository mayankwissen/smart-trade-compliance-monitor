// ThemeCtx, primitive components, AlertRow, and routing — shared across all files.
const { createContext, useContext, useEffect, useState, useCallback } = React;

window.ThemeCtx = createContext(window.DARK);
window.useT = function() { return useContext(window.ThemeCtx); };

window.useRoute = function useRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const h = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const nav = useCallback(p => { window.location.hash = p; }, []);
  const raw = hash.replace(/^#/, '') || '/';
  let page = 'dashboard', alertId = null;
  if (raw === '/' || raw === '')       page = 'dashboard';
  else if (raw === '/alerts')          page = 'alerts';
  else if (raw.startsWith('/alert/')) { page = 'alert-detail'; alertId = raw.slice(7); }
  else if (raw === '/trades')          page = 'trades';
  else if (raw === '/logs')            page = 'logs';
  else if (raw === '/settings')        page = 'settings';
  return { page, alertId, nav };
};

// Sets CSS variables for theme-aware classes (dt-wrap borders, etc.)
window.ThemeVars = function ThemeVars({ t }) {
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--bg',            t.bg);
    r.style.setProperty('--sidebar-bg',    t.sidebar);
    r.style.setProperty('--card-bg',       t.card);
    r.style.setProperty('--border',        t.border);
    r.style.setProperty('--border-subtle', t.borderSubtle);
    r.style.setProperty('--gold',          t.gold);
    r.style.setProperty('--text',          t.text);
    r.style.setProperty('--text-muted',    t.textMuted);
    r.style.setProperty('--row-hover',     t.rowHover);
    r.style.setProperty('--row-selected',  t.rowSelected);
  }, [t]);
  return null;
};

window.Bdg = function Bdg({ label, cfg, lg }) {
  const c = cfg || { bg: '#2a2a2a', c: '#525252' };
  return (
    <span className={`badge${c.pulse ? ' pulse' : ''}`}
      style={{
        background: c.bg, color: c.c,
        padding: lg ? '5px 14px' : '3px 10px',
        fontSize: lg ? 13 : 11,
      }}>
      {(label || '').replace(/_/g, ' ')}
    </span>
  );
};

window.Btn = function Btn({ children, onClick, variant = 'primary', small, disabled, style: sx }) {
  const t = window.useT();
  const pad = small ? '5px 12px' : '7px 18px';
  const fs  = small ? 11 : 12;
  const styles = {
    primary: { background: t.gold,        color: '#000',    padding: pad, fontSize: fs, opacity: disabled ? .5 : 1 },
    danger:  { background: t.danger,      color: '#fff',    padding: pad, fontSize: fs },
    ghost:   { background: 'transparent', color: t.gold,    border: `1px solid ${t.gold}`,    padding: small ? '4px 11px' : '6px 16px', fontSize: fs, opacity: disabled ? .5 : 1 },
    outline: { background: 'transparent', color: t.textSec, border: `1px solid ${t.border}`,  padding: small ? '4px 11px' : '6px 16px', fontSize: fs },
  };
  return (
    <button className="btn" style={{ ...styles[variant], ...sx }}
      onClick={disabled ? undefined : onClick} disabled={disabled}>
      {children}
    </button>
  );
};

window.Card = function Card({ children, style: sx, pad = 16 }) {
  return <div className="card" style={{ padding: pad, ...sx }}>{children}</div>;
};

window.SectionHead = function SectionHead({ title, count, right }) {
  const t = window.useT();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="section-title">{title}</span>
        {count !== undefined && (
          <span style={{ background: t.gold + '22', color: t.gold, borderRadius: 12, padding: '1px 9px', fontSize: 12, fontWeight: 700 }}>{count}</span>
        )}
      </div>
      {right}
    </div>
  );
};

window.Spinner = function Spinner() {
  return <span className="spin-anim" style={{ fontSize: 14 }}>◌</span>;
};

window.EmptyState = function EmptyState({ msg = 'No data yet' }) {
  const t = window.useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 10 }}>
      <div style={{ width: 32, height: 1, background: t.border }} />
      <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 500, fontSize: 12, color: t.textMuted, letterSpacing: '.02em' }}>{msg}</div>
    </div>
  );
};

window.AlertRow = function AlertRow({ a, nav, onTriage, isLoading }) {
  const t = window.useT();
  const done = a.status !== 'PENDING';
  return (
    <tr className="slide-in"
      onClick={() => nav && nav(`/alert/${a.alert_id}`)}
      style={{ opacity: isLoading ? 0.75 : 1, transition: 'opacity .2s' }}>
      <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: t.textMuted }}>{window.fmtTime(a.detected_at)}</span></td>
      <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: t.gold, fontWeight: 700 }}>{a.alert_id}</span></td>
      <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: t.textSec }}>{a.trader_id}</span></td>
      <td><span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 14, color: t.text }}>{a.instrument}</span></td>
      <td><window.Bdg label={a.pattern_type} cfg={window.PAT_CFG[a.pattern_type]} /></td>
      <td><window.Bdg label={a.severity}     cfg={window.SEV_CFG[a.severity]} /></td>
      <td><window.Bdg label={a.status}       cfg={window.STA_CFG[a.status]} /></td>
      {onTriage && (
        <td onClick={e => e.stopPropagation()}>
          <button
            onClick={() => !done && !isLoading && onTriage(a.alert_id)}
            disabled={done || isLoading}
            style={{
              background: isLoading ? t.info + '11' : 'transparent',
              color: done ? t.textMuted : isLoading ? t.info : t.info,
              border: `1px solid ${done ? t.border : t.info + '44'}`,
              borderRadius: 4, padding: '4px 10px',
              cursor: done || isLoading ? 'default' : 'pointer',
              fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
              minWidth: 110,
            }}>
            {isLoading
              ? <span style={{ display:'flex', alignItems:'center', gap:5 }}><window.Spinner />Claude analyzing…</span>
              : done ? '✓ Done' : 'TRIAGE →'}
          </button>
        </td>
      )}
    </tr>
  );
};
