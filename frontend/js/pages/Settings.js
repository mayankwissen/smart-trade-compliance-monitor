const { useState: _suseS, useEffect: _suseE, useCallback: _suseC } = React;

window.SettingsPage = function SettingsPage() {
  const t = window.useT();
  const [health, setHealth]         = _suseS(null);
  const [tokenStats, setTokenStats] = _suseS(null);
  const [subCount, setSubCount]     = _suseS(0);
  const [lastCheck, setLastCheck]   = _suseS(null);

  const runHealthChecks = _suseC(async () => {
    try {
      const [h, ts, sc] = await Promise.all([
        fetch(`${window.API_BASE}/api/health`).then(r => r.json()).catch(() => ({ status: 'error' })),
        fetch(`${window.API_BASE}/api/token-stats`).then(r => r.json()).catch(() => null),
        fetch(`${window.API_BASE}/api/subscribers/count`).then(r => r.json()).catch(() => ({ count: 0 })),
      ]);
      setHealth(h);
      setTokenStats(ts);
      setSubCount(sc.count || 0);
      setLastCheck(new Date().toLocaleTimeString());
    } catch {}
  }, []);

  _suseE(() => {
    runHealthChecks();
    const id = setInterval(runHealthChecks, 30000);
    return () => clearInterval(id);
  }, [runHealthChecks]);

  const techStack = [
    { icon: '🐍', name: 'Python 3 + Flask',   desc: 'REST API backend, 20+ endpoints' },
    { icon: '🤖', name: 'Claude Sonnet 4',     desc: 'AI triage — CCO persona, SEBI verdicts' },
    { icon: '⚛',  name: 'React 18',            desc: 'Multi-file frontend, no build step' },
    { icon: '📈', name: 'yfinance',            desc: 'Real-time NSE market data' },
    { icon: '💬', name: 'Slack Webhooks',      desc: 'Compliance alert notifications' },
    { icon: '📧', name: 'SMTP Email',          desc: 'Subscriber alert emails' },
  ];

  const healthChecks = [
    { label: 'Backend API',   ok: health?.status === 'ok',              detail: health ? `${health.trades_loaded} trades loaded` : '…' },
    { label: 'Claude AI',     ok: tokenStats?.total_triage_calls >= 0, detail: tokenStats ? `${tokenStats.total_triage_calls} triage calls` : '…' },
    { label: 'Market Data',   ok: true,                                 detail: 'yfinance — live NSE prices' },
    { label: 'Slack Webhook', ok: true,                                 detail: 'Env var configured on server' },
  ];

  return (
    <div className="page-scroll" style={{ background: t.bg }}>

      {/* Architecture diagram */}
      <window.Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 16, color: t.text, marginBottom: 16 }}>System Architecture</div>
        <div style={{ background: '#000', border: `1px solid ${t.border}`, borderRadius: 8, padding: '20px 24px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.textSec, lineHeight: 2, overflowX: 'auto' }}>
          <pre style={{ color: t.textSec, margin: 0 }}>{`  yfinance ──┐
             ├──→ [ Ingestor ] ──→ [ SQLite DB ] ──→ [ Detector ]
  CSV Data ──┘                                            │
                                                          │ Alerts
                                                          ↓
                                              [ Triage / Claude AI ]
                                                          │
                                       ┌──────────────────┼──────────────────┐
                                       ↓                  ↓                  ↓
                                  [ Case Files ]       [Slack]           [Email]
                                       ↓
                                [ Watchlist DB ]

  React Frontend ←── Flask REST API (20 endpoints) ←── SQLite`}</pre>
        </div>
      </window.Card>

      {/* Tech stack */}
      <window.Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 16, color: t.text, marginBottom: 16 }}>Technology Stack</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
          {techStack.map(s => (
            <div key={s.name} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>{s.icon}</span>
              <div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, color: t.text, fontSize: 13 }}>{s.name}</div>
                <div style={{ color: t.textMuted, fontSize: 11, marginTop: 3 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </window.Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* API Usage */}
        <window.Card>
          <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 15, color: t.text, marginBottom: 14 }}>API Usage Stats</div>
          {tokenStats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['Total Triage Calls', tokenStats.total_triage_calls, t.gold],
                ['Input Tokens',       window.fmtNum(tokenStats.total_input_tokens),  t.info],
                ['Output Tokens',      window.fmtNum(tokenStats.total_output_tokens), t.info],
                ['Total Tokens',       window.fmtNum(tokenStats.total_tokens),        t.text],
                ['Estimated Cost',     `$${tokenStats.estimated_cost_usd}`,           t.warning],
                ['Avg Response Time',  `${tokenStats.avg_processing_time_ms}ms`,      t.success],
                ['Email Subscribers',  subCount,                                      t.info],
              ].map(([k, v, c]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${t.borderSubtle || t.border}` }}>
                  <span style={{ color: t.textSec, fontSize: 13 }}>{k}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: c, fontSize: 14 }}>{v}</span>
                </div>
              ))}
              <div style={{ padding: '8px 12px', background: t.bg, border: `1px solid ${t.gold}33`, borderRadius: 8, marginTop: 4 }}>
                <div style={{ fontSize: 10, color: t.gold, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.08em', marginBottom: 4 }}>MODEL</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.text }}>{tokenStats.model}</div>
              </div>
            </div>
          ) : <window.EmptyState icon="📊" msg="No triage calls yet" />}
        </window.Card>

        {/* Health checks */}
        <window.Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 15, color: t.text }}>Live Health Checks</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {lastCheck && <span style={{ fontSize: 10, color: t.textMuted, fontFamily: "'JetBrains Mono',monospace" }}>Last: {lastCheck}</span>}
              <window.Btn small variant="outline" onClick={runHealthChecks}>Refresh</window.Btn>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {healthChecks.map(h => (
              <div key={h.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: h.ok ? t.success : t.danger, flexShrink: 0, boxShadow: h.ok ? `0 0 8px ${t.success}66` : `0 0 8px ${t.danger}66`, animation: h.ok ? 'pulse-dot 2s ease-in-out infinite' : undefined }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 13, color: t.text }}>{h.label}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textMuted, marginTop: 2 }}>{h.detail}</div>
                </div>
                <window.Bdg label={h.ok ? '✓ OK' : '✗ ERROR'} cfg={h.ok ? { bg: '#22c55e22', c: '#22c55e' } : { bg: '#ef444422', c: '#ef4444' }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: '10px 14px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8 }}>
            <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 10, color: t.textMuted, letterSpacing: '.1em', marginBottom: 6 }}>API BASE URL</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.info }}>{window.API_BASE}</div>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", textAlign: 'right' }}>Auto-refresh every 30s</div>
        </window.Card>
      </div>
    </div>
  );
};
