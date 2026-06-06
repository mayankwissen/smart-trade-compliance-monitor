const { useState: _aduseS, useEffect: _aduseE, useCallback: _aduseC } = React;

function _AlertTimelineChart({ trades }) {
  const t = window.useT();
  const canvasRef = React.useRef(null);
  const chartRef = React.useRef(null);
  React.useEffect(() => {
    if (!canvasRef.current || !trades || !trades.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    const ctx = canvasRef.current.getContext('2d');
    const bgColors = trades.map(tr => {
      if (tr.order_status === 'CANCELLED') return '#f59e0b66';
      if (tr.order_type === 'BUY') return '#22c55e99';
      return '#ef444499';
    });
    const borderColors = trades.map(tr => {
      if (tr.order_status === 'CANCELLED') return '#f59e0b';
      if (tr.order_type === 'BUY') return '#22c55e';
      return '#ef4444';
    });
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: trades.map((_, i) => '#' + (i + 1)),
        datasets: [{
          label: 'Order Size (BUY=green, SELL=red, CANCELLED=amber)',
          data: trades.map(tr => tr.order_size),
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: t.text, font: { family: 'Inter', size: 11 } } },
          tooltip: {
            callbacks: {
              title: (items) => {
                const tr = trades[items[0].dataIndex];
                return (tr.timestamp || '').slice(11, 19) || 'Trade ' + (items[0].dataIndex + 1);
              },
              afterBody: (items) => {
                const tr = trades[items[0].dataIndex];
                const lines = [tr.order_type + ' · ' + tr.order_status];
                if (tr.cancel_time_ms > 0) lines.push('Cancelled in ' + tr.cancel_time_ms + 'ms');
                if (tr.price) lines.push('Price: ₹' + Number(tr.price).toFixed(2));
                return lines;
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: t.textMuted, font: { size: 9 } }, grid: { color: t.border + '33' } },
          y: { ticks: { color: t.textMuted, font: { size: 9 } }, grid: { color: t.border + '33' }, title: { display: true, text: 'Order Size', color: t.textMuted, font: { size: 10 } } },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [trades]);
  if (!trades || !trades.length) return React.createElement('div', { style: { color: t.textMuted, textAlign: 'center', padding: '40px 0', fontSize: 13 } }, 'No trade data for this alert');
  return React.createElement('div', null,
    React.createElement('div', { style: { color: t.textMuted, fontSize: 11, fontFamily: "'Inter',sans-serif", marginBottom: 12, letterSpacing: '.08em' } },
      'TRADE SEQUENCE — ' + trades.length + ' orders · BUY (green) · SELL (red) · CANCELLED (amber)'),
    React.createElement('canvas', { ref: canvasRef, style: { maxHeight: 280, width: '100%' } })
  );
}

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
  const realInput = triage?.input_tokens || inputTok;
  const realOutput = triage?.output_tokens || outputTok;
  const realCost = ((realInput * 3 + realOutput * 15) / 1e6).toFixed(6);

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
            ['Trader ID',   <span onClick={() => nav('/trader/' + alert.trader_id)} style={{ fontFamily: "'JetBrains Mono',monospace", color: t.gold, fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }} title="View trader profile">{alert.trader_id}</span>],
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
            ['triage',   'AI Triage'],
            ['evidence', 'Evidence'],
            ['actions',  'Escalations'],
            ['timeline', 'Timeline'],
          ].map(([k, label]) => (
            <button key={k} className={`tab-btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        <div className="tab-content">

          {/* ── TAB 1: AI TRIAGE ── */}
          {tab === 'triage' && (
            <div>
              {!triage && !triaging && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 60, height: 60, borderRadius: '50%',
                    border: `1px solid ${t.gold}44`, background: `${t.gold}08`, marginBottom: 20,
                  }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={t.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 18, color: t.text, marginBottom: 8 }}>
                    Ready for AI Triage
                  </div>
                  <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 24, maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.6 }}>
                    Claude Sonnet will act as NSE Chief Compliance Officer and return a SEBI-grade verdict with regulatory citations.
                  </div>
                  <window.Btn onClick={doTriage} style={{ fontSize: 13, padding: '10px 32px' }}>Run AI Triage</window.Btn>
                  <div style={{ color: t.textMuted, fontSize: 11, marginTop: 10, fontFamily: "'JetBrains Mono',monospace" }}>
                    ~{inputTok + outputTok} tokens · ~${cost} · ~3s
                  </div>
                </div>
              )}

              {triaging && (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 60, height: 60, borderRadius: '50%',
                    border: `2px solid ${t.gold}`, background: `${t.gold}0a`,
                    marginBottom: 24, animation: 'pulse-dot 1.8s ease-in-out infinite',
                  }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={t.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 20, color: t.gold, marginBottom: 6 }}>
                    Analyzing Alert
                  </div>
                  <div style={{ color: t.textSec, fontSize: 13, marginBottom: 4 }}>
                    NSE Chief Compliance Officer · Claude Sonnet
                  </div>
                  <div style={{ color: t.textMuted, fontSize: 12, marginBottom: 24, fontFamily: "'JetBrains Mono',monospace" }}>
                    {alert.pattern_type.replace(/_/g, ' ')} · SEBI PFUTP Review
                  </div>
                  <div style={{ display: 'inline-block', background: t.card, border: `1px solid ${t.border}`, borderRadius: 6, padding: '10px 24px' }}>
                    <div style={{ color: '#525252', fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
                      claude-sonnet-4-6 · ~280 tokens · ~$0.00014
                    </div>
                  </div>
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
                        ['Model',          'claude-sonnet-4-6'],
                        ['Input Tokens',   realInput.toString()],
                        ['Output Tokens',  realOutput.toString()],
                        ['Total Tokens',   (realInput + realOutput).toString()],
                        ['Processing',     `${triage.processing_time_ms || 2400}ms`],
                        ['Est. Cost',      `$${realCost}`],
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
                      <tr><td colSpan={7}><window.EmptyState msg="No trades found for this alert" /></td></tr>
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
                          <td>{tr.is_suspicious && <span style={{ display: 'inline-block', background: '#ef444418', color: '#ef4444', borderRadius: 3, padding: '1px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '.05em', fontFamily: "'Inter',sans-serif" }}>FLAG</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB 4: TIMELINE ── */}
          {tab === 'timeline' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: t.text }}>Order Flow Visualization</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: '#22c55e', display: 'inline-block' }} />BUY
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} />SELL
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.textMuted, fontFamily: "'Inter',sans-serif" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} />CANCELLED
                  </span>
                </div>
              </div>
              <_AlertTimelineChart trades={trades} />
              <div style={{ color: t.textMuted, fontSize: 11, fontFamily: "'Inter',sans-serif", marginTop: 10, textAlign: 'center' }}>
                Each bar represents one order. Height = order size. Hover for details.
              </div>
              {alert && (() => {
                const insightMap = {
                  LAYERING: 'The chart above shows the classic layering signature: a wall of cancelled orders (amber) used to create artificial price pressure before the executed sell (red).',
                  SPOOFING: 'Large orders placed and immediately cancelled (amber spikes) to manipulate the perceived order book depth.',
                  WASH_TRADING: 'Matched buy and sell orders of near-identical size between related accounts.',
                  PUMP_AND_DUMP: 'Rapid accumulation phase (green cluster) followed by concentrated distribution (red).',
                };
                const msg = insightMap[alert.pattern_type] || 'Order flow analysis for this manipulation pattern.';
                return (
                  <div style={{ fontStyle: 'italic', color: t.textSec, fontSize: 12, lineHeight: 1.7, padding: '12px 16px', background: t.bg, border: `1px solid ${t.border}88`, borderRadius: 8, marginTop: 12 }}>
                    {msg}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── TAB 3: ESCALATION ACTIONS ── */}
          {tab === 'actions' && (
            <div>
              {!triage && <window.EmptyState msg="Run triage first to trigger escalation workflows" />}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>

                {/* Case file */}
                <window.Card style={{ borderLeft: `3px solid ${t.success}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.success, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: t.text }}>Compliance Case</span>
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
                        Download Case File
                      </window.Btn>
                      {triage && verdict === 'ESCALATE' && <window.Btn small variant="ghost"
                        onClick={() => window.open(window.API_BASE + '/api/generate-str/' + alertId)}
                        style={{ marginLeft: 8 }}>
                        Generate STR Filing
                      </window.Btn>}
                    </>
                  ) : (
                    <div style={{ color: t.textMuted, fontSize: 12 }}>No case yet — triage to trigger workflows.</div>
                  )}
                </window.Card>

                {/* Slack */}
                <window.Card style={{ borderLeft: `3px solid ${t.info}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.info, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: t.text }}>Slack Notification</span>
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
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.warning, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: t.text }}>Watchlist</span>
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
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#a855f7', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13, color: t.text }}>Email Alerts</span>
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
