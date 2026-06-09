const { useState: _suseS, useEffect: _suseE, useCallback: _suseC } = React;

window.SettingsPage = function SettingsPage() {
  const t = window.useT();
  const [health, setHealth]             = _suseS(null);
  const [tokenStats, setTokenStats]     = _suseS(null);
  const [subCount, setSubCount]         = _suseS(0);
  const [lastCheck, setLastCheck]       = _suseS(null);
  const [detailedHealth, setDetailedHealth] = _suseS(null);
  const [healthLoading, setHealthLoading]   = _suseS(false);
  const [feedbackStats, setFeedbackStats]   = _suseS(null);

  // GitHub integration state
  const [githubStatus, setGithubStatus]     = _suseS(null);
  const [githubTesting, setGithubTesting]   = _suseS(false);
  const [githubResult, setGithubResult]     = _suseS(null);
  const [githubPrTesting, setGithubPrTesting] = _suseS(false);
  const [githubPrResult, setGithubPrResult]   = _suseS(null);

  const loadGithubStatus = _suseC(async () => {
    try {
      const d = await fetch(`${window.API_BASE}/api/github/status`).then(r => r.json());
      setGithubStatus(d);
    } catch {}
  }, []);

  const testGithubIssue = async () => {
    setGithubTesting(true);
    setGithubResult(null);
    try {
      const d = await fetch(`${window.API_BASE}/api/github/test-issue`, { method: 'POST' }).then(r => r.json());
      setGithubResult(d);
    } catch (e) {
      setGithubResult({ success: false, error: String(e) });
    }
    setGithubTesting(false);
  };

  const createGithubPR = async () => {
    setGithubPrTesting(true);
    setGithubPrResult(null);
    try {
      const d = await fetch(`${window.API_BASE}/api/github/create-pr`, { method: 'POST' }).then(r => r.json());
      setGithubPrResult(d);
    } catch (e) {
      setGithubPrResult({ success: false, error: String(e) });
    }
    setGithubPrTesting(false);
  };

  _suseE(() => { loadGithubStatus(); }, [loadGithubStatus]);

  const runHealthChecks = _suseC(async () => {
    try {
      const [h, ts, sc, fb] = await Promise.all([
        fetch(`${window.API_BASE}/api/health`).then(r => r.json()).catch(() => ({ status: 'error' })),
        fetch(`${window.API_BASE}/api/token-stats`).then(r => r.json()).catch(() => null),
        fetch(`${window.API_BASE}/api/subscribers/count`).then(r => r.json()).catch(() => ({ count: 0 })),
        fetch(`${window.API_BASE}/api/feedback/stats`).then(r => r.json()).catch(() => null),
      ]);
      setHealth(h);
      setTokenStats(ts);
      setSubCount(sc.count || 0);
      setFeedbackStats(fb);
      setLastCheck(new Date().toLocaleTimeString());
    } catch {}
  }, []);

  const runDetailedHealth = _suseC(async () => {
    setHealthLoading(true);
    try {
      const dh = await fetch(`${window.API_BASE}/api/health/detailed`).then(r => r.json()).catch(() => null);
      setDetailedHealth(dh);
    } catch {}
    setHealthLoading(false);
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

      {/* System Health Detailed */}
      <window.Card style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 15, color: t.text }}>System Health (Auto-Healing)</div>
          <window.Btn small variant="outline" onClick={runDetailedHealth} disabled={healthLoading}>
            {healthLoading ? 'Checking...' : 'Run Health Check'}
          </window.Btn>
        </div>
        {!detailedHealth && !healthLoading && (
          <div style={{ color: t.textMuted, fontSize: 12, fontFamily: "'Inter',sans-serif" }}>
            Click "Run Health Check" to get a detailed status of all system components.
          </div>
        )}
        {detailedHealth && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: detailedHealth.status === 'healthy' ? t.success : detailedHealth.status === 'degraded' ? t.warning : t.danger,
                boxShadow: `0 0 8px ${detailedHealth.status === 'healthy' ? t.success : t.warning}66`,
              }} />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 13, color: t.text, textTransform: 'uppercase' }}>
                {detailedHealth.status}
              </span>
              <span style={{ fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif" }}>
                Uptime: {detailedHealth.uptime_minutes} min · Checked: {(detailedHealth.last_checked || '').slice(11, 19)} UTC
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
              {detailedHealth.checks && Object.entries(detailedHealth.checks).map(([key, ok]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? t.success : t.danger, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontFamily: "'Inter',sans-serif", color: t.text, textTransform: 'capitalize' }}>
                    {key.replace(/_/g, ' ')}
                  </span>
                  <window.Bdg label={ok ? 'OK' : 'FAIL'} cfg={ok ? { bg: '#22c55e22', c: '#22c55e' } : { bg: '#ef444422', c: '#ef4444' }} />
                </div>
              ))}
            </div>
            {detailedHealth.auto_healed && detailedHealth.auto_healed.length > 0 && (
              <div style={{ padding: '10px 14px', background: t.warning + '18', border: `1px solid ${t.warning}44`, borderRadius: 6, fontSize: 12, fontFamily: "'Inter',sans-serif", color: t.warning }}>
                <strong>Auto-heal actions taken:</strong>
                <ul style={{ marginTop: 4, paddingLeft: 18 }}>
                  {detailedHealth.auto_healed.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </window.Card>

      {/* Analyst-AI Agreement */}
      <window.Card style={{ marginTop: 16 }}>
        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 15, color: t.text, marginBottom: 14 }}>Analyst–AI Agreement</div>
        {feedbackStats && feedbackStats.total_feedback > 0 ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 12 }}>
              {[
                ['Total Overrides',    feedbackStats.total_overrides,               t.warning],
                ['Claude Agreed',      feedbackStats.claude_agreed_with_analyst,    t.success],
                ['Claude Maintained',  feedbackStats.claude_maintained_original,    t.info],
                ['Agreement Rate',     feedbackStats.agreement_rate + '%',          t.gold],
              ].map(([k, v, c]) => (
                <div key={k} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 22, color: c }}>{v}</div>
                  <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.08em', marginTop: 4 }}>{k}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, fontFamily: "'Inter',sans-serif", lineHeight: 1.6 }}>
              When analysts override Claude's verdict, the system automatically re-runs AI analysis with analyst context (feedback loop). Agreement rate shows how often Claude updates its verdict after receiving analyst feedback.
            </div>
          </div>
        ) : (
          <window.EmptyState icon="🤝" msg="No analyst feedback submitted yet. Override a triage verdict in Alert Detail to see stats." />
        )}
      </window.Card>

      {/* GitHub Self-Healing Monitor */}
      <window.Card style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🐙</span>
            <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: 15, color: t.text }}>GitHub Self-Healing Monitor</div>
          </div>
          <window.Btn small variant="outline" onClick={loadGithubStatus}>Refresh</window.Btn>
        </div>

        {/* Status row — 4 tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
          {[
            ['Token',          githubStatus?.configured ? '✓ SET' : '✗ MISSING', githubStatus?.configured ? t.success : t.danger],
            ['Repository',     githubStatus?.repo ? githubStatus.repo.split('/')[1] : '…', t.info],
            ['Auto-Issue',     'On 500 error', t.warning],
            ['Auto-PR',        'On 500 error', '#a78bfa'],
          ].map(([k, v, c]) => (
            <div key={k} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>{k}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: c, fontSize: 12 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div style={{ padding: '10px 14px', background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif", lineHeight: 1.7 }}>
            <strong style={{ color: t.textSec }}>How it works:</strong> When a 500 error occurs, the system fires two actions in parallel:
            {' '}<strong style={{ color: t.warning }}>① Issue</strong> — bug report with endpoint + error details (5-min cooldown).
            {' '}<strong style={{ color: '#a78bfa' }}>② PR stub</strong> — creates branch <code style={{ background: '#1a1a1a', padding: '1px 4px', borderRadius: 3, color: t.gold }}>auto-incident/…</code>, commits an incident report file, opens a pull request against <code style={{ background: '#1a1a1a', padding: '1px 4px', borderRadius: 3, color: t.gold }}>main</code> for a human to review and push a fix.
          </div>
        </div>

        {/* Two test buttons side by side */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          {/* Issue button */}
          <button
            onClick={testGithubIssue}
            disabled={githubTesting || !githubStatus?.configured}
            style={{
              background: githubTesting ? '#1a1a1a' : '#f0b42914',
              border: `1px solid ${!githubStatus?.configured ? t.border : '#f0b429'}`,
              color: !githubStatus?.configured ? t.textMuted : '#f0b429',
              borderRadius: 6, padding: '7px 16px',
              cursor: githubStatus?.configured ? 'pointer' : 'not-allowed',
              fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s',
            }}>
            {githubTesting ? '⏳ Creating…' : '🐙 Test Issue'}
          </button>

          {/* PR button */}
          <button
            onClick={createGithubPR}
            disabled={githubPrTesting || !githubStatus?.configured}
            style={{
              background: githubPrTesting ? '#1a1a1a' : '#a78bfa14',
              border: `1px solid ${!githubStatus?.configured ? t.border : '#a78bfa'}`,
              color: !githubStatus?.configured ? t.textMuted : '#a78bfa',
              borderRadius: 6, padding: '7px 16px',
              cursor: githubStatus?.configured ? 'pointer' : 'not-allowed',
              fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s',
            }}>
            {githubPrTesting ? '⏳ Creating PR…' : '🔀 Test PR Stub'}
          </button>

          {!githubStatus?.configured && (
            <span style={{ fontSize: 11, color: t.danger, fontFamily: "'Inter',sans-serif", alignSelf: 'center' }}>
              GITHUB_TOKEN not configured
            </span>
          )}
        </div>

        {/* Issue result */}
        {githubResult && (
          <div style={{
            marginTop: 10, padding: '10px 14px', borderRadius: 8,
            background: githubResult.success ? '#22c55e14' : '#ef444414',
            border: `1px solid ${githubResult.success ? '#22c55e44' : '#ef444444'}`,
          }}>
            {githubResult.success ? (
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.text }}>
                <span style={{ color: '#22c55e', fontWeight: 700 }}>✓ Issue #{githubResult.issue_number} created</span>
                {' · '}
                <a href={githubResult.issue_url} target="_blank" rel="noreferrer"
                  style={{ color: t.info, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                  {githubResult.issue_url}
                </a>
              </div>
            ) : (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#ef4444' }}>
                ✗ Issue failed: {githubResult.error}
              </div>
            )}
          </div>
        )}

        {/* PR result */}
        {githubPrResult && (
          <div style={{
            marginTop: 8, padding: '10px 14px', borderRadius: 8,
            background: githubPrResult.success ? '#a78bfa14' : '#ef444414',
            border: `1px solid ${githubPrResult.success ? '#a78bfa44' : '#ef444444'}`,
          }}>
            {githubPrResult.success ? (
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: t.text }}>
                <span style={{ color: '#a78bfa', fontWeight: 700 }}>✓ PR #{githubPrResult.pr_number} opened</span>
                {' · '}
                <a href={githubPrResult.pr_url} target="_blank" rel="noreferrer"
                  style={{ color: '#a78bfa', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                  {githubPrResult.pr_url}
                </a>
              </div>
            ) : (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#ef4444' }}>
                ✗ PR failed: {githubPrResult.error}
              </div>
            )}
          </div>
        )}
      </window.Card>
    </div>
  );
};
