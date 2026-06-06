const { useState: _aduseS, useEffect: _aduseE, useCallback: _aduseC } = React;

window.AlertDetailPage = function AlertDetailPage({ alertId, nav }) {
  const t = window.useT();
  const [data, setData]       = _aduseS(null);
  const [loading, setLoading] = _aduseS(true);
  const [triaging, setTriaging] = _aduseS(false);
  const [tab, setTab]         = _aduseS('triage');
  const [barW, setBarW]       = _aduseS(0);

  const load = _aduseC(async () => {
    try {
      const d = await fetch(`${window.API_BASE}/api/alert/${alertId}/full`).then(r => r.json());
      setData(d);
      if (d.triage) setTimeout(() => setBarW(d.triage.confidence || 0), 100);
    } catch {}
    setLoading(false);
  }, [alertId]);

  _aduseE(() => { setLoading(true); setBarW(0); setTab('triage'); load(); }, [load]);

  const doTriage = async () => {
    setTriaging(true);
    try { await fetch(`${window.API_BASE}/api/triage/${alertId}`, { method: 'POST' }); await load(); }
    catch {}
    setTriaging(false);
  };

  if (loading) return (
    <div className="page-scroll" style={{ background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <window.Spinner />
    </div>
  );
  if (!data || !data.alert) return (
    <div className="page-scroll" style={{ background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textMuted }}>
      Alert not found
    </div>
  );

  const { alert, triage, escalations, trades } = data;
  const verdict = triage?.verdict;
  const vc = verdict === 'ESCALATE' ? t.danger : verdict === 'DISMISS' ? t.success : t.gold;
  const caseEsc  = escalations?.find(e => e.action_type === 'CASE_CREATED');
  const slackEsc = escalations?.find(e => e.action_type === 'SLACK_NOTIFIED');
  const watchEsc = escalations?.find(e => e.action_type === 'WATCHLIST_FLAGGED');
  const emailEsc = escalations?.find(e => e.action_type === 'EMAIL_SENT');
  let caseId = null;
  try { if (caseEsc) caseId = JSON.parse(caseEsc.payload).case_id; } catch {}

  const inputTok = 280, outputTok = 200;
  const cost = ((inputTok * 3 + outputTok * 15) / 1e6).toFixed(6);

  const riskColor = {
    CRITICAL: t.danger,
    HIGH:     '#ef4444',
    MEDIUM:   t.warning,
    LOW:      t.success,
  };

  return (
    <div className="page-scroll" style={{ background: t.bg }}>
      {/* Back breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={() => nav('/alerts')}
          style={{ background: 'transparent', border: `1px solid ${t.border}`, color: t.textSec, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 12 }}>
          ← Back
        </button>
        <span style={{ color: t.textMuted, fontSize: 14 }}>Alert Detail</span>
        <span style={{ color: t.gold, fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700 }}>{alert.alert_id}</span>
      </div>

      {/* Alert overview grid */}
      <window.Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 12, color: t.textMuted, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 14 }}>Alert Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            ['Alert ID',    <span style={{ fontFamily: "'JetBrains Mono',monospace", color: t.gold, fontSize: 14, fontWeight: 700 }}>{alert.alert_id}</span>],
            ['Pattern',     <window.Bdg label={alert.pattern_type} cfg={window.PAT_CFG[alert.pattern_type]} />],
            ['Trader ID',   <span style={{ fontFamily: "'JetBrains Mono',monospace", color: t.gold, fontSize: 14, fontWeight: 700 }}>{alert.trader_id}</span>],
            ['Instrument',  <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, color: t.text, fontSize: 16 }}>{alert.instrument}</span>],
            ['Severity',    <window.Bdg label={alert.severity} cfg={window.SEV_CFG[alert.severity]} lg />],
            ['Status',      <window.Bdg label={alert.status}   cfg={window.STA_CFG[alert.status]} />],
            ['Detected At', <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textMuted }}>{window.fmtDate(alert.detected_at)}</span>],
            ['Session',     <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textSec }}>{alert.session_id || '—'}</span>],
          ].map(([k, v], i) => (
            <div key={i} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.1em', marginBottom: 5, textTransform: 'uppercase' }}>{k}</div>
              <div>{v}</div>
            </div>
          ))}
        </div>
      </window.Card>

      {/* Tabs */}
      <window.Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, background: t.bg }}>
          {[
            ['triage',   '⚡ AI Triage'],
            ['evidence', '📊 Evidence & Trades'],
            ['actions',  '🔔 Escalation Actions'],
          ].map(([k, label]) => (
            <button key={k} className={`tab-btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        <div className="tab-content">

          {/* ── TAB 1: AI TRIAGE ── */}
          {tab === 'triage' && (
            <div>
              {!triage && !triaging && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 18, color: t.text, marginBottom: 8 }}>Awaiting AI Triage</div>
                  <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 24 }}>Chief Compliance Officer (Claude Sonnet) will analyze this alert and return a SEBI-grade verdict</div>
                  <window.Btn onClick={doTriage} style={{ fontSize: 14, padding: '10px 32px' }}>⚡ Triage This Alert</window.Btn>
                  <div style={{ color: t.textMuted, fontSize: 11, marginTop: 10 }}>Est. ~{inputTok + outputTok} tokens · ~${cost} · ~2s</div>
                </div>
              )}

              {triaging && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 16 }}><window.Spinner /></div>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 16, color: t.gold }}>Claude Sonnet Analyzing…</div>
                  <div style={{ color: t.textMuted, fontSize: 13, marginTop: 8 }}>Chief Compliance Officer reviewing {alert.pattern_type.replace(/_/g, ' ')} pattern against SEBI PFUTP Regulations</div>
                </div>
              )}

              {triage && !triaging && (
                <div>
                  {/* ── Verdict block ── */}
                  <div style={{ background: t.bg, border: `1px solid ${vc}44`, borderRadius: 12, padding: 24, textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.15em', marginBottom: 12 }}>AI VERDICT · CLAUDE SONNET · CHIEF COMPLIANCE OFFICER</div>
                    <div className="scale-in glow-text"
                      style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 52, fontWeight: 700, color: vc, letterSpacing: '.06em', marginBottom: 16 }}>
                      {verdict}
                    </div>
                    {/* Confidence bar */}
                    <div style={{ background: t.border, borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ height: '100%', background: vc, borderRadius: 4, width: `${barW}%`, transition: 'width .8s cubic-bezier(.4,0,.2,1)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: "'Inter',sans-serif", color: t.textMuted, marginBottom: 12 }}>
                      <span>CONFIDENCE: <strong style={{ color: t.text }}>{triage.confidence}%</strong></span>
                      <span>FALSE POSITIVE: <strong style={{ color: t.text }}>{triage.false_positive_probability}%</strong></span>
                    </div>
                    {triage.risk_level && (
                      <window.Bdg
                        label={`RISK: ${triage.risk_level}`}
                        cfg={{ bg: (riskColor[triage.risk_level] || vc) + '22', c: riskColor[triage.risk_level] || vc }}
                        lg />
                    )}
                  </div>

                  {/* ── AI TRIAGE NARRATIVE ── */}
                  <div style={{ background: t.bg, border: `1px solid ${t.gold}44`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: t.gold, fontWeight: 700, letterSpacing: '.15em', marginBottom: 14, fontFamily: "'Inter',sans-serif" }}>AI TRIAGE NARRATIVE</div>
                    {triage.rationale && (
                      <div style={{ color: t.textSec, fontSize: 13, lineHeight: 1.8, marginBottom: 16, fontFamily: "'Inter',sans-serif", fontStyle: 'italic' }}>
                        {triage.rationale}
                      </div>
                    )}
                    <div style={{ background: '#000', borderRadius: 6, padding: '14px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.textSec, lineHeight: 2 }}>
                      <span style={{ color: t.textMuted }}>Cancellation ratio: </span>
                      <span style={{ color: t.warning, fontWeight: 700 }}>{((alert.cancel_ratio || 0) * 100).toFixed(1)}%</span>
                      <span style={{ color: t.textMuted }}> | Time-to-cancel median: </span>
                      <span style={{ color: t.info, fontWeight: 700 }}>&lt;600ms</span>
                      <span style={{ color: t.textMuted }}> | Anomaly vs baseline: </span>
                      <span style={{ color: t.danger, fontWeight: 700 }}>+{alert.sigma}σ</span>
                      <br />
                      <span style={{ color: t.textMuted }}>Verdict: </span>
                      <span style={{ color: vc, fontWeight: 700 }}>{verdict}</span>
                      <span style={{ color: t.textMuted }}> | Confidence: </span>
                      <span style={{ color: t.success, fontWeight: 700 }}>{triage.confidence}%</span>
                      <span style={{ color: t.textMuted }}> | FP Probability: </span>
                      <span style={{ color: t.warning, fontWeight: 700 }}>{triage.false_positive_probability}%</span>
                    </div>
                  </div>

                  {/* ── IN PLAIN TERMS (blue border) ── */}
                  {triage.simple_explanation && (
                    <div style={{ background: t.bg, border: `1px solid ${t.info}44`, borderLeft: `3px solid ${t.info}`, borderRadius: '0 8px 8px 0', padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: t.info, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.12em', marginBottom: 6 }}>IN PLAIN TERMS</div>
                      <div style={{ color: t.text, fontSize: 13, lineHeight: 1.7 }}>{triage.simple_explanation}</div>
                    </div>
                  )}

                  {/* ── RECOMMENDED ACTION (amber border) ── */}
                  {triage.recommended_action && (
                    <div style={{ background: t.bg, border: `1px solid ${t.warning}44`, borderLeft: `3px solid ${t.warning}`, borderRadius: '0 8px 8px 0', padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: t.warning, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.12em', marginBottom: 6 }}>RECOMMENDED ACTION</div>
                      <div style={{ color: t.text, fontSize: 13, lineHeight: 1.6 }}>{triage.recommended_action}</div>
                    </div>
                  )}

                  {/* ── REGULATORY REFERENCE (purple border) ── */}
                  {triage.regulatory_reference && (
                    <div style={{ background: t.bg, border: '1px solid #a855f744', borderLeft: '3px solid #a855f7', borderRadius: '0 8px 8px 0', padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 10, color: '#a855f7', fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.12em', marginBottom: 6 }}>REGULATORY REFERENCE</div>
                      <div style={{ color: t.text, fontSize: 13, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.6 }}>{triage.regulatory_reference}</div>
                    </div>
                  )}

                  {/* ── AI METRICS ── */}
                  <div style={{ background: t.bg, border: `1px solid ${t.gold}33`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 10, color: t.gold, letterSpacing: '.15em', marginBottom: 12 }}>AI METRICS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                      {[
                        ['Model',          'claude-sonnet-4-20250514'],
                        ['Input Tokens',   `~${inputTok}`],
                        ['Output Tokens',  `~${outputTok}`],
                        ['Total Tokens',   `~${inputTok + outputTok}`],
                        ['Processing',     `${triage.processing_time_ms || 2400}ms`],
                        ['Est. Cost',      `$${cost}`],
                      ].map(([k, v]) => (
                        <div key={k} style={{ padding: '8px 12px', background: t.card, borderRadius: 6, border: `1px solid ${t.border}` }}>
                          <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.08em' }}>{k}</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: t.gold, fontSize: 13, marginTop: 3 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: EVIDENCE & TRADES ── */}
          {tab === 'evidence' && (
            <div>
              {/* Stats box */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  ['Cancel Ratio', `${((alert.cancel_ratio || 0) * 100).toFixed(1)}%`,                               t.warning],
                  ['Sigma',         `${alert.sigma}σ`,                                                                t.danger],
                  ['Total Orders',  trades?.length || 0,                                                              t.info],
                  ['Total Volume',  window.fmtK(trades?.reduce((s, r) => s + (r.order_size || 0), 0) || 0),          t.success],
                ].map(([k, v, c]) => (
                  <div key={k} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 22, color: c }}>{v}</div>
                    <div style={{ fontSize: 10, color: t.textMuted, fontFamily: "'Inter',sans-serif", fontWeight: 700, letterSpacing: '.08em', marginTop: 4 }}>{k}</div>
                  </div>
                ))}
              </div>

              {/* Trades table */}
              <div className="dt-wrap" style={{ overflowX: 'auto' }}>
                <table className="dt">
                  <thead>
                    <tr>{['TIME', 'TYPE', 'SIZE', 'PRICE', 'STATUS', 'CANCEL MS', 'FLAG'].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(!trades || trades.length === 0) && (
                      <tr><td colSpan={7}><window.EmptyState icon="📋" msg="No trades found for this alert" /></td></tr>
                    )}
                    {(trades || []).map((tr, i) => {
                      const isCan = tr.order_status === 'CANCELLED';
                      const isExe = tr.order_status === 'EXECUTED';
                      return (
                        <tr key={i} style={{
                          background: tr.is_suspicious ? t.danger + '0a'
                            : isCan ? '#ef444408'
                            : isExe ? '#22c55e08'
                            : 'transparent',
                        }}>
                          <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: t.textSec }}>{tr.timestamp}</span></td>
                          <td><span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, color: tr.order_type === 'BUY' ? t.success : t.danger }}>{tr.order_type}</span></td>
                          <td><span style={{ fontFamily: "'JetBrains Mono',monospace", color: t.text }}>{window.fmtNum(tr.order_size)}</span></td>
                          <td><span style={{ fontFamily: "'JetBrains Mono',monospace", color: t.gold, fontWeight: 700 }}>{window.fmtRs(tr.price)}</span></td>
                          <td>
                            <window.Bdg label={tr.order_status}
                              cfg={isExe  ? { bg: '#22c55e22', c: '#22c55e' }
                                 : isCan  ? { bg: '#ef444422', c: '#ef4444' }
                                 :           { bg: '#2a2a2a',   c: '#a0a0a0' }} />
                          </td>
                          <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: tr.cancel_time_ms > 0 && tr.cancel_time_ms < 600 ? t.danger : t.textSec }}>{tr.cancel_time_ms || '—'}</span></td>
                          <td>{tr.is_suspicious && <span style={{ fontSize: 14 }}>🚩</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB 3: ESCALATION ACTIONS ── */}
          {tab === 'actions' && (
            <div>
              {!triage && <window.EmptyState icon="⚡" msg="Triage this alert first to trigger escalation workflows" />}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>

                {/* Case file */}
                <window.Card style={{ borderLeft: `3px solid ${t.success}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 20 }}>📁</span>
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, color: t.text }}>Compliance Case</span>
                    <window.Bdg label={caseId ? 'CREATED' : 'PENDING'} cfg={caseId ? { bg: '#22c55e22', c: '#22c55e' } : { bg: '#2a2a2a', c: '#525252' }} />
                  </div>
                  {caseId ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                        {[
                          ['Case ID',     caseId],
                          ['Assigned To', 'Surveillance Desk L2'],
                          ['Status',      'OPEN'],
                          ['Created',     window.fmtTime(caseEsc?.created_at)],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: '.08em', fontFamily: "'Inter',sans-serif", textTransform: 'uppercase' }}>{k}</div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.text, marginTop: 2 }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <window.Btn small variant="ghost"
                        onClick={() => window.open(`${window.API_BASE}/api/export/case/${alertId}`)}>
                        ⬇ Download Case JSON
                      </window.Btn>
                    </>
                  ) : (
                    <div style={{ color: t.textMuted, fontSize: 12 }}>No case yet — triage to trigger workflows.</div>
                  )}
                </window.Card>

                {/* Slack */}
                <window.Card style={{ borderLeft: `3px solid ${t.info}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 20 }}>💬</span>
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, color: t.text }}>Slack Notification</span>
                    <window.Bdg label={slackEsc ? 'SENT' : 'PENDING'} cfg={slackEsc ? { bg: '#3b82f622', c: '#3b82f6' } : { bg: '#2a2a2a', c: '#525252' }} />
                  </div>
                  {slackEsc ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        ['Channel',  '#compliance-alerts'],
                        ['Status',   'DELIVERED'],
                        ['Sent At',  window.fmtTime(slackEsc.created_at)],
                        ['Case Ref', caseId || '—'],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: '.08em', fontFamily: "'Inter',sans-serif" }}>{k}</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.text, marginTop: 2 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ color: t.textMuted, fontSize: 12 }}>Slack notification sent on escalation.</div>}
                </window.Card>

                {/* Watchlist */}
                <window.Card style={{ borderLeft: `3px solid ${t.warning}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 20 }}>👁</span>
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, color: t.text }}>Watchlist</span>
                    <window.Bdg label={watchEsc ? 'ACTIVE' : 'INACTIVE'} cfg={watchEsc ? { bg: '#f59e0b22', c: '#f59e0b' } : { bg: '#2a2a2a', c: '#525252' }} />
                  </div>
                  {watchEsc ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        ['Trader',   alert.trader_id],
                        ['Duration', '72 hours'],
                        ['Status',   'ACTIVE'],
                        ['Added',    window.fmtTime(watchEsc.created_at)],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, letterSpacing: '.08em', fontFamily: "'Inter',sans-serif" }}>{k}</div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: t.text, marginTop: 2 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ color: t.textMuted, fontSize: 12 }}>Trader flagged to watchlist on escalation.</div>}
                </window.Card>

                {/* Email */}
                <window.Card style={{ borderLeft: '3px solid #a855f7' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 20 }}>📧</span>
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, color: t.text }}>Email Alerts</span>
                    <window.Bdg label={emailEsc ? 'SENT' : '—'} cfg={emailEsc ? { bg: '#a855f722', c: '#a855f7' } : { bg: '#2a2a2a', c: '#525252' }} />
                  </div>
                  <div style={{ color: t.textSec, fontSize: 12 }}>
                    {emailEsc ? 'Compliance email sent to all active subscribers.' : 'Email notifications sent to subscribers on escalation.'}
                  </div>
                </window.Card>
              </div>
            </div>
          )}

        </div>
      </window.Card>
    </div>
  );
};
