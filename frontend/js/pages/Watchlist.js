const { useState: _wuseS, useEffect: _wuseE, useCallback: _wuseC } = React;

window.WatchlistPage = function WatchlistPage({ nav }) {
  const t = window.useT();
  const [watchlist, setWatchlist]     = _wuseS({ active: [], expired: [], total_active: 0, total_expired: 0 });
  const [agentStatus, setAgentStatus] = _wuseS(null);
  const [agentLogs, setAgentLogs]     = _wuseS([]);
  const [triggering, setTriggering]   = _wuseS(false);
  const [triggerMsg, setTriggerMsg]   = _wuseS('');
  const [expiringId, setExpiringId]   = _wuseS(null);

  const loadAll = _wuseC(async () => {
    try {
      const wl = await fetch(window.API_BASE + '/api/watchlist').then(r => r.json());
      setWatchlist(wl);
    } catch {}
    try {
      const st = await fetch(window.API_BASE + '/api/agent/status').then(r => r.json());
      if (st && st.status) setAgentStatus(st);
    } catch {}
    try {
      const lg = await fetch(window.API_BASE + '/api/agent/logs').then(r => r.json());
      setAgentLogs(lg.logs || []);
    } catch {}
  }, []);

  _wuseE(() => {
    loadAll();
    const id = setInterval(loadAll, 30000);
    return () => clearInterval(id);
  }, [loadAll]);

  const doTrigger = async () => {
    setTriggering(true);
    setTriggerMsg('Checking traders...');
    try {
      const res  = await fetch(window.API_BASE + '/api/agent/trigger', { method: 'POST' }).then(r => r.json());
      const cnt  = res.traders_checked ? res.traders_checked.length : 0;
      setTriggerMsg(`Done! ${cnt} trader${cnt !== 1 ? 's' : ''} checked.`);
      await loadAll();
    } catch {
      setTriggerMsg('Error — retry');
    }
    setTriggering(false);
    setTimeout(() => setTriggerMsg(''), 4000);
  };

  const doExpire = async (trader_id) => {
    setExpiringId(trader_id);
    try {
      await fetch(window.API_BASE + '/api/watchlist/expire/' + trader_id, { method: 'POST' });
      await loadAll();
    } catch {}
    setExpiringId(null);
  };

  const statusColors = {
    ALERT_CREATED: { bg: '#ef444422', c: '#ef4444' },
    CHECKED:       { bg: '#22c55e22', c: '#22c55e' },
    IDLE:          { bg: '#52525222', c: '#737373' },
    ERROR:         { bg: '#ef444422', c: '#ef4444' },
  };

  const barColor = (hrs) => hrs > 48 ? '#22c55e' : hrs > 24 ? '#f0b429' : '#ef4444';

  return (
    <div className="page-scroll" style={{ background: t.bg }}>

      {/* ── SECTION 1: ACTIVE WATCHLIST ── */}
      <window.Card style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="section-title">ACTIVE WATCHLIST</span>
            <span style={{ background: watchlist.total_active > 0 ? t.warning + '33' : t.gold + '22', color: watchlist.total_active > 0 ? t.warning : t.gold, borderRadius: 12, padding: '1px 9px', fontSize: 12, fontWeight: 700 }}>
              {watchlist.total_active}
            </span>
          </div>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: t.textMuted }}>
            72-hour enhanced monitoring · auto-expires
          </span>
        </div>

        {watchlist.active.length === 0 ? (
          <window.EmptyState msg="No traders under active surveillance. Triage a HIGH alert to add traders." />
        ) : (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {watchlist.active.map(entry => {
              const pct = Math.min(100, Math.max(0, (entry.hours_remaining / 72) * 100));
              const bc  = barColor(entry.hours_remaining);
              return (
                <div key={entry.trader_id} style={{
                  background: t.card, border: `1px solid ${t.border}`,
                  borderLeft: `3px solid ${t.warning}`,
                  borderRadius: 8, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    <div>
                      <span
                        onClick={() => nav('/trader/' + entry.trader_id)}
                        style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color: t.gold, cursor: 'pointer', textDecoration: 'underline dotted' }}>
                        {entry.trader_id}
                      </span>
                      <span style={{ marginLeft: 12, background: t.warning + '22', color: t.warning, borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', fontFamily: "'Inter',sans-serif" }}>
                        UNDER ENHANCED MONITORING
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={doTrigger}
                        disabled={triggering}
                        style={{ background: 'transparent', border: `1px solid ${t.gold}44`, color: t.gold, padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                        Run Check Now
                      </button>
                      <button
                        onClick={() => doExpire(entry.trader_id)}
                        disabled={expiringId === entry.trader_id}
                        style={{ background: 'transparent', border: `1px solid ${t.border}`, color: t.textMuted, padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontFamily: "'Inter',sans-serif" }}>
                        {expiringId === entry.trader_id ? 'Expiring...' : 'Expire Early'}
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: bc, fontWeight: 700 }}>
                        {entry.hours_remaining}h remaining
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textMuted }}>
                        {Math.round(pct)}% of 72h
                      </span>
                    </div>
                    <div style={{ background: t.bg, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: bc, width: pct + '%', borderRadius: 4, transition: 'width .3s' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif" }}>
                    <div><span style={{ color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 10 }}>Flagged</span>&nbsp;&nbsp;<span style={{ fontFamily: "'JetBrains Mono',monospace", color: t.textSec }}>{(entry.flagged_at || '').slice(0, 16)}</span></div>
                    <div><span style={{ color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 10 }}>Expires</span>&nbsp;&nbsp;<span style={{ fontFamily: "'JetBrains Mono',monospace", color: t.textSec }}>{(entry.expires_at || '').slice(0, 16)}</span></div>
                    <div style={{ gridColumn: 'span 2' }}><span style={{ color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 10 }}>Reason</span>&nbsp;&nbsp;<span style={{ color: t.textSec }}>{entry.reason}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {watchlist.expired.length > 0 && (
          <div style={{ borderTop: `1px solid ${t.border}`, padding: '10px 16px' }}>
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>EXPIRED ({watchlist.total_expired})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {watchlist.expired.map(e => (
                <span key={e.trader_id} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.textMuted, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 4, padding: '3px 10px', textDecoration: 'line-through' }}>
                  {e.trader_id}
                </span>
              ))}
            </div>
          </div>
        )}
      </window.Card>

      {/* ── SECTION 2: AI AGENT STATUS ── */}
      <window.Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: t.gold, letterSpacing: '.1em' }}>WATCHLIST AI AGENT</span>
            {agentStatus && agentStatus.status === 'RUNNING' && (
              <span style={{ background: '#22c55e22', color: '#22c55e', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700, fontFamily: "'Inter',sans-serif", display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                ACTIVE
              </span>
            )}
            {agentStatus && agentStatus.status !== 'RUNNING' && (
              <span style={{ background: '#52525218', color: '#737373', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                Agent Ready — activate for enhanced monitoring
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {triggerMsg && (
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.gold }}>{triggerMsg}</span>
            )}
            <button
              onClick={doTrigger}
              disabled={triggering}
              style={{
                background: triggering ? t.gold + '44' : t.gold,
                color: '#000', border: 'none', borderRadius: 6,
                padding: '7px 18px', fontSize: 12, fontWeight: 700,
                cursor: triggering ? 'default' : 'pointer',
                fontFamily: "'Inter',sans-serif", letterSpacing: '.02em',
              }}>
              {triggering ? 'Checking...' : 'Trigger Manual Check'}
            </button>
          </div>
        </div>

        {!agentStatus && (
          <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textMuted, padding: '8px 0' }}>
            Connecting to agent... (restart backend if this persists)
          </div>
        )}
        {agentStatus && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[
              ['TRADERS MONITORED',    agentStatus.traders_monitored,    t.warning],
              ['LAST CHECK',           agentStatus.last_check ? agentStatus.last_check.slice(11, 19) : '—', t.info],
              ['TOTAL ALERTS CREATED', agentStatus.total_alerts_created, t.danger],
              ['CHECK INTERVAL',       '5 min',                          t.success],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color, marginBottom: 6 }}>{val}</div>
                <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </window.Card>

      {/* ── SECTION 3: AGENT ACTIVITY LOG ── */}
      <window.Card style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header">
          <span className="section-title">AGENT ACTIVITY LOG</span>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: t.textMuted }}>auto-refresh 30s</span>
        </div>

        {agentLogs.length === 0 ? (
          <window.EmptyState msg="Agent has not run yet. Click Trigger Manual Check to start." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead>
                <tr>{['TIME', 'TRADER', 'STATUS', 'ALERTS FOUND', 'ACTION', 'MESSAGE'].map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {agentLogs.map(log => {
                  const cfg = statusColors[log.status] || { bg: '#52525222', c: '#737373' };
                  return (
                    <tr key={log.id}>
                      <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textMuted }}>{(log.checked_at || '').slice(0, 19)}</span></td>
                      <td>
                        {log.trader_id !== 'ALL'
                          ? <span onClick={() => nav('/trader/' + log.trader_id)} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.gold, fontWeight: 700, cursor: 'pointer' }}>{log.trader_id}</span>
                          : <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.textMuted }}>ALL</span>
                        }
                      </td>
                      <td><window.Bdg label={log.status} cfg={cfg} /></td>
                      <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: log.alerts_found > 0 ? t.danger : t.textMuted }}>{log.alerts_found}</span></td>
                      <td><span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: t.textSec }}>{log.action_taken}</span></td>
                      <td><span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.textSec }}>{log.message}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </window.Card>

    </div>
  );
};
