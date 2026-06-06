const { useState: _tpuseS, useEffect: _tpuseE, useCallback: _tpuseC } = React;

window.TraderProfilePage = function TraderProfilePage({ traderId, nav }) {
  const t = window.useT();
  const [data, setData]       = _tpuseS(null);
  const [loading, setLoading] = _tpuseS(true);

  const load = _tpuseC(async () => {
    try {
      const d = await fetch(window.API_BASE + '/api/trader/' + traderId).then(r => r.json());
      setData(d);
    } catch {}
    setLoading(false);
  }, [traderId]);

  _tpuseE(() => { setLoading(true); load(); }, [load]);

  if (loading) return (
    <div className="page-scroll" style={{ background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <window.Spinner />
    </div>
  );

  if (!data || !data.trader_id) return (
    <div className="page-scroll" style={{ background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted }}>
      Trader not found
    </div>
  );

  const pc = data.pattern_counts || {};
  const totalPatterns = Object.values(pc).reduce((s, v) => s + (v || 0), 0);
  const score = data.risk_score || 0;
  const scoreColor = score < 30 ? t.success : score <= 60 ? t.warning : t.danger;

  const PAT_LABELS = [
    ['LAYERING',      'LAYERING'],
    ['SPOOFING',      'SPOOFING'],
    ['WASH_TRADING',  'WASH TRADING'],
    ['PUMP_AND_DUMP', 'PUMP & DUMP'],
  ];

  const allZero = PAT_LABELS.every(([k]) => !(pc[k] > 0));

  return (
    <div className="page-scroll" style={{ background: t.bg }}>

      {/* 1. BREADCRUMB ROW */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button
          onClick={() => nav('/alerts')}
          style={{
            background: 'transparent', border: `1px solid ${t.border}`,
            color: t.textSec, borderRadius: 6, padding: '5px 12px',
            cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 12,
          }}>
          Back
        </button>
        <span style={{ color: t.textMuted, fontFamily: "'Inter',sans-serif", fontSize: 14 }}>Trader Profile</span>
        <span style={{ color: t.gold, fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700 }}>{traderId}</span>
      </div>

      {/* 2. RISK SCORE CARD */}
      <window.Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>

          {/* Left: large score */}
          <div style={{ minWidth: 120 }}>
            <div style={{
              fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif",
              fontWeight: 700, letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 6,
            }}>
              RISK SCORE
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 56,
                fontWeight: 700, color: scoreColor, lineHeight: 1,
              }}>
                {score}
              </span>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, color: t.textMuted }}>/ 100</span>
            </div>
          </div>

          {/* Right: 4-metric grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, flex: 1, minWidth: 280 }}>
            {[
              ['ESCALATED ALERTS',    data.escalated_count || 0,  t.danger],
              ['PATTERNS DETECTED',   totalPatterns,               t.warning],
              ['TOTAL TRADES',        data.total_trades || 0,      t.info],
              ['WATCHLISTED',         null,                         data.watchlisted ? t.danger : t.textMuted],
            ].map(([label, val, color]) => (
              <div key={label} style={{
                background: t.bg, border: `1px solid ${t.border}`,
                borderRadius: 8, padding: '10px 14px', textAlign: 'center',
              }}>
                {label === 'WATCHLISTED' ? (
                  <div style={{
                    fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                    fontSize: 22, color: color, marginBottom: 4,
                  }}>
                    {data.watchlisted ? 'Yes' : 'No'}
                  </div>
                ) : (
                  <div style={{
                    fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                    fontSize: 22, color: color, marginBottom: 4,
                  }}>
                    {window.fmtNum(val)}
                  </div>
                )}
                <div style={{
                  fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif",
                  fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
                }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </window.Card>

      {/* 3. PATTERN BREAKDOWN */}
      <window.Card style={{ marginBottom: 16 }}>
        <div style={{
          fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 11,
          color: t.textMuted, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
        }}>
          DETECTION HISTORY
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {allZero ? (
            <div style={{ gridColumn: 'span 4', textAlign: 'center', color: t.textMuted, fontFamily: "'Inter',sans-serif", fontSize: 13, padding: '16px 0' }}>
              —
            </div>
          ) : (
            PAT_LABELS.map(([key, label]) => {
              const count = pc[key] || 0;
              const cfg = window.PAT_CFG[key] || { bg: '#2a2a2a', c: '#525252' };
              return (
                <div key={key} style={{
                  background: t.bg, border: `1px solid ${t.border}`,
                  borderRadius: 8, padding: '14px', textAlign: 'center',
                }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                    fontSize: 28, color: cfg.c, marginBottom: 8,
                  }}>
                    {count > 0 ? count : '—'}
                  </div>
                  <window.Bdg label={label} cfg={cfg} />
                </div>
              );
            })
          )}
        </div>
      </window.Card>

      {/* 4. ALERT HISTORY TABLE */}
      <window.Card style={{ marginBottom: 16 }}>
        <div style={{
          fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 11,
          color: t.textMuted, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
        }}>
          ALERT HISTORY
        </div>
        <div className="dt-wrap" style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead>
              <tr>
                {['ALERT ID', 'PATTERN', 'INSTRUMENT', 'SEVERITY', 'STATUS', 'DETECTED AT', 'AI VERDICT'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(!data.alerts || data.alerts.length === 0) ? (
                <tr>
                  <td colSpan={7}><window.EmptyState msg="No alerts for this trader" /></td>
                </tr>
              ) : (
                data.alerts.map(a => {
                  const verdict = a.triage_verdict;
                  const verdictCfg = verdict === 'ESCALATE'
                    ? { bg: '#ef444422', c: '#ef4444' }
                    : verdict === 'DISMISS'
                    ? { bg: '#22c55e22', c: '#22c55e' }
                    : null;
                  return (
                    <tr key={a.alert_id}>
                      <td>
                        <span
                          onClick={() => nav('/alert/' + a.alert_id)}
                          style={{
                            fontFamily: "'JetBrains Mono',monospace", color: t.gold,
                            fontWeight: 700, fontSize: 13, cursor: 'pointer',
                            textDecoration: 'underline dotted',
                          }}>
                          {a.alert_id}
                        </span>
                      </td>
                      <td><window.Bdg label={a.pattern_type} cfg={window.PAT_CFG[a.pattern_type]} /></td>
                      <td>
                        <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, color: t.text }}>
                          {a.instrument}
                        </span>
                      </td>
                      <td><window.Bdg label={a.severity} cfg={window.SEV_CFG[a.severity]} /></td>
                      <td><window.Bdg label={a.status} cfg={window.STA_CFG[a.status]} /></td>
                      <td>
                        <span style={{
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textMuted,
                        }}>
                          {window.fmtDate(a.detected_at)}
                        </span>
                      </td>
                      <td>
                        {verdictCfg
                          ? <window.Bdg label={verdict} cfg={verdictCfg} />
                          : <span style={{ color: t.textMuted }}>—</span>
                        }
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </window.Card>

      {/* 5. WATCHLIST STATUS CARD (only when watchlisted) */}
      {data.watchlisted === true && (
        <window.Card style={{ marginBottom: 16, borderLeft: '3px solid ' + t.warning }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: "'Inter',sans-serif", fontSize: 13, color: t.text, lineHeight: 1.6,
              }}>
                Trader <span style={{ fontFamily: "'JetBrains Mono',monospace", color: t.gold, fontWeight: 700 }}>{traderId}</span> is currently under enhanced monitoring (72-hour watchlist)
              </div>
            </div>
            <window.Bdg label="WATCHLIST ACTIVE" cfg={{ bg: t.warning + '22', c: t.warning }} />
          </div>
        </window.Card>
      )}

    </div>
  );
};
